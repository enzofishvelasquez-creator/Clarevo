-- Movimentos fora da operação e tipo do negócio (D-121; migração 20261124000001_negocio_movimentos.sql). Confere: a coluna do tipo e a
-- restrição (só no negócio, sem escrever o valor 'negocio'); set_business_profile (quem administra, valores, limpar, repetição, recusas,
-- sem contar como anotação); trazer dinheiro do Pessoal (os dois lados ligados, as categorias e descrições, cada lado uma vez no próprio
-- espaço, o guarda, a repetição e as recusas); excluir pelo lado que for, também a retirada; encerrar desliga o par; o orçamento do
-- negócio continua com 9 categorias; só ver e exportar recusa os dois.
-- Pessoas FICTÍCIAS: Lia (dona do Ateliê da Lia) e Teo (de fora). Tudo em uma transação desfeita no fim.
\set ON_ERROR_STOP 1
\set lia '''00000000-0000-0000-0000-0000000000c7'''
\set teo '''00000000-0000-0000-0000-0000000000c8'''

begin;
set local clarevo.today = '2026-11-24';

create temp table ids (name text primary key, id uuid not null);
grant select, insert, update on ids to authenticated;
create function pg_temp.id(p_name text) returns uuid language sql as $$ select id from ids where name = p_name $$;
create function pg_temp.keep(p_name text, p_id uuid) returns void language sql as $$
  insert into ids values (p_name, p_id) on conflict (name) do update set id = excluded.id
$$;
create function pg_temp.as_(p_name text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', pg_temp.id(p_name)::text, true);
$$;
create function pg_temp.expect_code(p_sql text, p_code text, p_state text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm = p_code and sqlstate = p_state then return; end if;
    raise exception 'esperado % (%), veio "%" (%) em: %', p_code, p_state, sqlerrm, sqlstate, left(p_sql, 300);
  end;
  raise exception 'esperado erro %, mas passou: %', p_code, left(p_sql, 300);
end $$;
create function pg_temp.rec(p_id uuid) returns public.financial_records language sql security definer set search_path = public, pg_temp as $$
  select * from public.financial_records where id = p_id
$$;
create function pg_temp.activity(p_ctx uuid) returns bigint language sql security definer set search_path = public, pg_temp as $$
  select count(*) from public.context_activity where context_id = p_ctx
$$;
create function pg_temp.totals(p_ctx uuid, p_month date) returns bigint[] language sql as $$
  select array[received_cents, paid_cents] from public.month_totals(p_ctx, p_month)
$$;
grant execute on function pg_temp.id(text), pg_temp.keep(text, uuid), pg_temp.as_(text), pg_temp.expect_code(text, text, text),
  pg_temp.rec(uuid), pg_temp.activity(uuid), pg_temp.totals(uuid, date) to authenticated;

-- ---------------------------------------------------------------------------
-- 1. Esquema e privilégios
-- ---------------------------------------------------------------------------
do $$
declare
  f text;
begin
  assert exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'financial_contexts' and column_name = 'business_profile'),
    'a coluna do tipo do negócio';
  assert pg_get_constraintdef((select oid from pg_constraint where conname = 'financial_contexts_perfil_negocio')) !~ '''negocio''::',
    'a restrição não escreve o valor negocio';
  foreach f in array array['set_business_profile(uuid, text, text)', 'create_business_contribution(text, uuid, uuid, uuid, bigint, date, text)',
                           'delete_business_withdrawal(text, uuid, integer)'] loop
    assert has_function_privilege('authenticated', 'public.' || f, 'execute') and not has_function_privilege('anon', 'public.' || f, 'execute'),
      'só authenticated executa ' || f;
    assert (select prosecdef from pg_proc where oid = ('public.' || f)::regprocedure), 'security definer: ' || f;
  end loop;
  foreach f in array array['clarevo_business_json(uuid)', 'clarevo_budget_categories(uuid)', 'clarevo_track_activity()'] loop
    assert not has_function_privilege('authenticated', 'public.' || f, 'execute') and not has_function_privilege('anon', 'public.' || f, 'execute'),
      'auxiliar fechada: ' || f;
  end loop;
  assert not ('criar_aporte_negocio' = any (public.clarevo_write_free_actions()))
     and not ('definir_perfil_negocio' = any (public.clarevo_write_free_actions())), 'as duas passam pela trava da assinatura';
end $$;

insert into ids values ('lia', :lia), ('teo', :teo);
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  (:lia, 'lia.movimentos@exemplo.test', now(), '{"display_name":"Lia"}'),
  (:teo, 'teo.movimentos@exemplo.test', now(), '{"display_name":"Teo"}');

set role authenticated;

-- ---------------------------------------------------------------------------
-- 2. O tipo do negócio
-- ---------------------------------------------------------------------------
select pg_temp.as_('lia');
do $$
declare
  space jsonb := public.ensure_personal_space('Conta principal');
  biz uuid;
  r jsonb;
begin
  perform pg_temp.keep('pes', (space ->> 'context_id')::uuid);
  perform pg_temp.keep('pes_acc', (space #>> '{account,id}')::uuid);
  r := public.create_business('Ateliê da Lia', 'nm-a-0001');
  biz := (r #>> '{context,id}')::uuid;
  perform pg_temp.keep('biz', biz);
  perform pg_temp.keep('biz_acc', (select id from public.financial_accounts where context_id = biz));
  assert r -> 'context' ? 'business_profile' and r #>> '{context,business_profile}' is null, 'nasce sem tipo';
  perform pg_temp.expect_code(format('select public.set_business_profile(%L, %L, %L)', biz, 'cnpj', 'nm-p-0001'), 'perfil_invalido', '22023');
  perform pg_temp.expect_code(format('select public.set_business_profile(%L, %L, %L)', pg_temp.id('pes'), 'mei', 'nm-p-0002'), 'contexto_invalido', '22023');
  perform pg_temp.expect_code(format('select public.set_business_profile(%L, %L, %L)', gen_random_uuid(), 'mei', 'nm-p-0003'), 'nao_encontrado', 'P0002');
  r := public.set_business_profile(biz, 'mei', 'nm-p-0010');
  assert r #>> '{context,business_profile}' = 'mei' and (select business_profile from public.financial_contexts where id = biz) = 'mei', 'MEI';
  assert public.set_business_profile(biz, 'mei', 'nm-p-0010') = r, 'repetir devolve o mesmo';
  perform pg_temp.expect_code(format('select public.set_business_profile(%L, %L, %L)', biz, 'me_epp', 'nm-p-0010'), 'chave_reutilizada', 'PT409');
  assert public.set_business_profile(biz, 'me_epp', 'nm-p-0011') #>> '{context,business_profile}' = 'me_epp', 'muda';
  assert public.set_business_profile(biz, null, 'nm-p-0012') #>> '{context,business_profile}' is null, 'nulo limpa';
  perform public.set_business_profile(biz, 'mei', 'nm-p-0013');
  assert (select count(*) from public.record_operations where action = 'definir_perfil_negocio' and target_id = biz) = 4, 'a operação aponta para o negócio';
  assert pg_temp.activity(biz) = 0, 'definir o tipo não conta como anotação';
  -- O Pessoal não aceita tipo nem por escrita direta (o dono do banco, sem as funções).
end $$;
reset role;
do $$ begin
  begin
    update public.financial_contexts set business_profile = 'mei' where id = pg_temp.id('pes');
    raise exception 'o Pessoal aceitou um tipo';
  exception when check_violation then null;
  end;
end $$;
set role authenticated;
select pg_temp.as_('teo');
do $$ begin
  perform public.ensure_personal_space('Conta principal');
  perform pg_temp.expect_code(format('select public.set_business_profile(%L, %L, %L)', pg_temp.id('biz'), 'mei', 'nm-t-0001'), 'nao_encontrado', 'P0002');
  perform pg_temp.expect_code(format('select public.create_business_contribution(%L, %L, %L, %L, %s, %L)', 'nm-t-0002', pg_temp.id('biz'), pg_temp.id('biz_acc'),
                                     pg_temp.id('pes_acc'), 1000, '2026-11-20'), 'nao_encontrado', 'P0002');
end $$;

-- ---------------------------------------------------------------------------
-- 3. Trazer dinheiro do Pessoal
-- ---------------------------------------------------------------------------
select pg_temp.as_('lia');
do $$
declare
  biz uuid := pg_temp.id('biz');
  pes uuid := pg_temp.id('pes');
  res jsonb;
  again jsonb;
  b public.financial_records;
  p public.financial_records;
begin
  perform pg_temp.expect_code(format('select public.create_business_contribution(%L, %L, %L, %L, %s, %L)', 'nm-c-0001', biz, pg_temp.id('pes_acc'), pg_temp.id('pes_acc'), 1000, '2026-11-20'),
                              'conta_invalida', '22023');
  perform pg_temp.expect_code(format('select public.create_business_contribution(%L, %L, %L, %L, %s, %L)', 'nm-c-0002', biz, pg_temp.id('biz_acc'), pg_temp.id('pes_acc'), 0, '2026-11-20'),
                              'valor_invalido', '22023');
  perform pg_temp.expect_code(format('select public.create_business_contribution(%L, %L, %L, %L, %s, %L)', 'nm-c-0003', biz, pg_temp.id('biz_acc'), pg_temp.id('pes_acc'), 1000, '2026-11-25'),
                              'data_futura', '22023');
  perform pg_temp.expect_code(format('select public.create_business_contribution(%L, %L, %L, %L, %s, %L)', 'nm-c-0004', pes, pg_temp.id('pes_acc'), pg_temp.id('pes_acc'), 1000, '2026-11-20'),
                              'contexto_invalido', '22023');

  res := public.create_business_contribution('nm-c-0010', biz, pg_temp.id('biz_acc'), pg_temp.id('pes_acc'), 150000, '2026-11-20');
  b := jsonb_populate_record(null::public.financial_records, res -> 'business_record');
  p := jsonb_populate_record(null::public.financial_records, res -> 'personal_record');
  perform pg_temp.keep('cb', b.id);
  perform pg_temp.keep('cp', p.id);
  assert b.context_id = biz and b.kind = 'receita' and b.category = 'Dinheiro do Pessoal' and b.description = 'Dinheiro do Pessoal'
     and b.amount_cents = 150000 and b.paired_record_id = p.id, 'a entrada no negócio, ligada';
  assert p.context_id = pes and p.kind = 'despesa' and p.category = 'Dinheiro para o negócio' and p.description = 'Dinheiro para Ateliê da Lia'
     and p.paired_record_id = b.id and p.account_id = pg_temp.id('pes_acc'), 'o gasto no Pessoal, ligado';
  assert pg_temp.totals(biz, '2026-11-01') = array[150000, 0]::bigint[] and pg_temp.totals(pes, '2026-11-01') = array[0, 150000]::bigint[],
    'cada lado conta uma vez no próprio espaço';
  again := public.create_business_contribution('nm-c-0010', biz, pg_temp.id('biz_acc'), pg_temp.id('pes_acc'), 150000, '2026-11-20');
  assert (again #>> '{business_record,id}')::uuid = b.id and (again #>> '{personal_record,id}')::uuid = p.id, 'repetir devolve os mesmos';
  perform pg_temp.expect_code(format('select public.create_business_contribution(%L, %L, %L, %L, %s, %L)', 'nm-c-0010', biz, pg_temp.id('biz_acc'), pg_temp.id('pes_acc'), 150001, '2026-11-20'),
                              'chave_reutilizada', 'PT409');
  assert (select count(*) from public.record_operations where action = 'criar_aporte_negocio' and record_id = b.id and target_id = p.id and context_id = biz) = 1,
    'a operação guarda os dois lados';
  assert pg_temp.activity(biz) = 1, 'trazer dinheiro conta como anotação, como a retirada';
  -- Descrição própria nos dois lados.
  res := public.create_business_contribution('nm-c-0011', biz, pg_temp.id('biz_acc'), pg_temp.id('pes_acc'), 2000, '2026-11-21', '  Capital inicial  ');
  assert res #>> '{business_record,description}' = 'Capital inicial' and res #>> '{personal_record,description}' = 'Capital inicial', 'descrição nos dois lados';
  perform pg_temp.keep('cb2', (res #>> '{business_record,id}')::uuid);
  perform pg_temp.keep('cp2', (res #>> '{personal_record,id}')::uuid);
  -- O guarda: nenhum dos lados muda fora das funções do par.
  perform pg_temp.expect_code(format('select public.update_record(%L, %L, %s, %L, %s, %L, %L)', 'nm-c-0020', p.id, p.version, pg_temp.id('pes_acc'), 9999, '2026-11-20', 'Outro'),
                              'retirada_ligada', 'PT409');
  perform pg_temp.expect_code(format('select public.delete_record(%L, %L, %s)', 'nm-c-0021', b.id, b.version), 'retirada_ligada', 'PT409');
end $$;

-- ---------------------------------------------------------------------------
-- 4. Excluir pelo lado que for (e a retirada continua)
-- ---------------------------------------------------------------------------
do $$
declare
  res jsonb;
begin
  -- Pelo lado do Pessoal: os dois saem, e o lado do negócio volta como business_record.
  res := public.delete_business_withdrawal('nm-d-0001', pg_temp.id('cp'), (pg_temp.rec(pg_temp.id('cp'))).version);
  assert (res #>> '{business_record,id}')::uuid = pg_temp.id('cb') and (res #>> '{personal_record,id}')::uuid = pg_temp.id('cp'), 'os lados certos';
  assert (pg_temp.rec(pg_temp.id('cb'))).deleted_at is not null and (pg_temp.rec(pg_temp.id('cp'))).deleted_at is not null, 'os dois saem';
  assert (select context_id from public.record_operations where idempotency_key = 'nm-d-0001') = pg_temp.id('biz'), 'a operação fica no negócio';
  assert pg_temp.totals(pg_temp.id('biz'), '2026-11-01') = array[2000, 0]::bigint[], 'sobra só o segundo';
  -- A retirada também sai pelo lado do negócio, como antes.
  res := public.create_business_withdrawal('nm-d-0010', pg_temp.id('biz'), pg_temp.id('biz_acc'), pg_temp.id('pes_acc'), 500, '2026-11-22');
  res := public.delete_business_withdrawal('nm-d-0011', (res #>> '{business_record,id}')::uuid, 1);
  assert (pg_temp.rec((res #>> '{business_record,id}')::uuid)).category = 'Retirada para o Pessoal'
     and (pg_temp.rec((res #>> '{business_record,id}')::uuid)).deleted_at is not null
     and (pg_temp.rec((res #>> '{personal_record,id}')::uuid)).category = 'Retirada do negócio', 'a retirada sai inteira, com os lados certos';
  -- Um lançamento comum não é par.
  res := to_jsonb(public.create_record('nm-d-0020', pg_temp.id('biz'), pg_temp.id('biz_acc'), 'receita', 3000, '2026-11-22', 'Encomenda', 'Vendas'));
  perform pg_temp.expect_code(format('select public.delete_business_withdrawal(%L, %L, %s)', 'nm-d-0021', res ->> 'id', 1), 'nao_e_retirada', '22023');
end $$;

-- ---------------------------------------------------------------------------
-- 5. Orçamento do negócio: continua com as 9 de antes (o app publicado recusa outra contagem); as categorias novas são lançamentos comuns
-- ---------------------------------------------------------------------------
do $$
declare
  biz uuid := pg_temp.id('biz');
begin
  assert (select count(*) from public.month_budget(biz, '2026-11-01')) = 9, '9 linhas, como antes';
  perform pg_temp.expect_code(format('select public.set_category_budget(%L, %L, %L, %L, 0, 10000)', 'nm-o-0001', biz, 'Divulgação', '2026-11-01'), 'categoria_invalida', '22023');
  perform public.create_record('nm-o-0002', biz, pg_temp.id('biz_acc'), 'despesa', 5000, '2026-11-22', 'Panfletos', 'Divulgação');
  perform public.create_record('nm-o-0010', biz, pg_temp.id('biz_acc'), 'despesa', 80000, '2026-11-22', 'Máquina de costura', 'Equipamento');
  perform public.create_record('nm-o-0011', biz, pg_temp.id('biz_acc'), 'receita', 100000, '2026-11-22', 'Empréstimo', 'Empréstimo recebido');
  assert (select count(*) from public.financial_records where context_id = biz and category in ('Divulgação', 'Equipamento', 'Empréstimo recebido')) = 3,
    'as categorias novas são lançamentos comuns';
end $$;

-- ---------------------------------------------------------------------------
-- 6. Encerrar desliga o dinheiro trazido do Pessoal, como a retirada
-- ---------------------------------------------------------------------------
do $$ begin
  assert (pg_temp.rec(pg_temp.id('cp2'))).paired_record_id = pg_temp.id('cb2'), 'ligado antes';
  perform public.end_business(pg_temp.id('biz'), 'nm-e-0001');
  assert (pg_temp.rec(pg_temp.id('cp2'))).paired_record_id is null, 'o gasto no Pessoal vira comum';
  assert (pg_temp.rec(pg_temp.id('cp2'))).deleted_at is null, 'e fica no Pessoal';
end $$;

-- ---------------------------------------------------------------------------
-- 7. Só ver e exportar: definir o tipo e trazer dinheiro são recusados
-- ---------------------------------------------------------------------------
do $$
declare
  biz uuid;
begin
  biz := (public.create_business('Ateliê 2', 'nm-l-0001') #>> '{context,id}')::uuid;
  perform pg_temp.keep('biz2', biz);
  perform pg_temp.keep('biz2_acc', (select id from public.financial_accounts where context_id = biz));
end $$;
reset role;
update public.billing_settings set enforced_from = now() - interval '40 days';
update public.persons set created_at = now() - interval '60 days' where id = :lia;
set role authenticated;
select pg_temp.as_('lia');
select pg_temp.expect_code(format('select public.set_business_profile(%L, %L, %L)', pg_temp.id('biz2'), 'mei', 'nm-l-0002'), 'assinatura_necessaria', 'PT402');
select pg_temp.expect_code(format('select public.create_business_contribution(%L, %L, %L, %L, %s, %L)', 'nm-l-0003', pg_temp.id('biz2'), pg_temp.id('biz2_acc'),
                                  pg_temp.id('pes_acc'), 1000, '2026-11-20'), 'assinatura_necessaria', 'PT402');

rollback;
