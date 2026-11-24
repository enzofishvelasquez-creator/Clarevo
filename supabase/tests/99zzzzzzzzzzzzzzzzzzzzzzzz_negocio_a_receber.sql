-- A receber e marcas da entrada do negócio (D-122; migração 20261125000001_negocio_a_receber.sql). Confere: a tabela, a RLS, as
-- guardas e as funções; anotar, alterar e excluir (recusas, repetição, versão, só em aberto); receber (a entrada ligada, a conta e a
-- data, ja_recebido); a entrada ligada não vira gasto nem muda de espaço, e excluí-la reabre o "a receber"; as marcas (só em entrada de
-- negócio, a chamada antiga sem marcas, manter, trocar e limpar ao virar gasto); os papéis no negócio compartilhado; só ver e
-- exportar; a limpeza dos 6 meses; a exclusão da conta.
-- Pessoas FICTÍCIAS: Rosa (dona da Doceria da Rosa), Ivo (anota no negócio da Rosa), Ana (só vê) e Tom (de fora). Tudo em uma transação
-- desfeita no fim.
\set ON_ERROR_STOP 1
\set rosa '''00000000-0000-0000-0000-0000000000d2'''
\set ivo  '''00000000-0000-0000-0000-0000000000d3'''
\set ana  '''00000000-0000-0000-0000-0000000000d4'''
\set tom  '''00000000-0000-0000-0000-0000000000d5'''

begin;
set local clarevo.today = '2026-11-25';

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
create function pg_temp.rv(p_id uuid) returns public.business_receivables language sql security definer set search_path = public, pg_temp as $$
  select * from public.business_receivables where id = p_id
$$;
create function pg_temp.activity(p_ctx uuid) returns bigint language sql security definer set search_path = public, pg_temp as $$
  select count(*) from public.context_activity where context_id = p_ctx
$$;
create function pg_temp.totals(p_ctx uuid, p_month date) returns bigint[] language sql as $$
  select array[received_cents, paid_cents] from public.month_totals(p_ctx, p_month)
$$;
grant execute on function pg_temp.id(text), pg_temp.keep(text, uuid), pg_temp.as_(text), pg_temp.expect_code(text, text, text),
  pg_temp.rec(uuid), pg_temp.rv(uuid), pg_temp.activity(uuid), pg_temp.totals(uuid, date) to authenticated;

-- ---------------------------------------------------------------------------
-- 1. Esquema e privilégios
-- ---------------------------------------------------------------------------
do $$
declare
  f text;
begin
  assert (select relrowsecurity from pg_class where oid = 'public.business_receivables'::regclass), 'RLS no a receber';
  assert has_table_privilege('authenticated', 'public.business_receivables', 'select')
     and not has_table_privilege('authenticated', 'public.business_receivables', 'insert, update, delete, truncate')
     and not has_table_privilege('anon', 'public.business_receivables', 'select'), 'o app só lê; anon não lê';
  assert exists (select 1 from pg_trigger where tgname = 'financial_records_receivable_reopen' and not tgisinternal)
     and exists (select 1 from pg_trigger where tgname = 'financial_records_receivable_guard' and not tgisinternal)
     and exists (select 1 from pg_trigger where tgname = 'business_receivables_guard' and not tgisinternal), 'os gatilhos';
  foreach f in array array['create_receivable(text, uuid, text, text, bigint, date, text, text)',
                           'update_receivable(text, uuid, integer, text, text, bigint, date, text, text)',
                           'delete_receivable(text, uuid, integer)', 'receive_receivable(text, uuid, integer, uuid, bigint, date)',
                           'create_record(text, uuid, uuid, public.record_kind, bigint, date, text, text, text, boolean, text, uuid, jsonb)',
                           'update_record(text, uuid, integer, uuid, bigint, date, text, text, boolean, public.record_kind, text, uuid, boolean, jsonb)'] loop
    assert has_function_privilege('authenticated', 'public.' || f, 'execute') and not has_function_privilege('anon', 'public.' || f, 'execute'),
      'só authenticated executa ' || f;
    assert (select prosecdef from pg_proc where oid = ('public.' || f)::regprocedure), 'security definer: ' || f;
  end loop;
  assert to_regprocedure('public.create_record(text, uuid, uuid, public.record_kind, bigint, date, text, text, text, boolean, text, uuid)') is null
     and to_regprocedure('public.update_record(text, uuid, integer, uuid, bigint, date, text, text, boolean, public.record_kind, text, uuid, boolean)') is null,
    'as assinaturas antigas saíram (sem sobrecarga ambígua)';
  foreach f in array array['clarevo_record_marks(jsonb, public.record_kind, uuid)', 'clarevo_check_receivable(text, text, bigint, date, text, text)',
                           'clarevo_lock_receivable(uuid, boolean)', 'financial_records_receivable_reopen()', 'financial_records_receivable_guard()',
                           'financial_records_receivable_guard_insert()', 'business_receivables_guard()'] loop
    assert not has_function_privilege('authenticated', 'public.' || f, 'execute') and not has_function_privilege('anon', 'public.' || f, 'execute'),
      'auxiliar fechada: ' || f;
  end loop;
  assert not (array['criar_a_receber', 'alterar_a_receber', 'excluir_a_receber', 'receber_a_receber'] && public.clarevo_write_free_actions()),
    'as quatro passam pela trava da assinatura';
end $$;

insert into ids values ('rosa', :rosa), ('ivo', :ivo), ('ana', :ana), ('tom', :tom);
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  (:rosa, 'rosa.receber@exemplo.test', now(), '{"display_name":"Rosa"}'),
  (:ivo, 'ivo.receber@exemplo.test', now(), '{"display_name":"Ivo"}'),
  (:ana, 'ana.receber@exemplo.test', now(), '{"display_name":"Ana"}'),
  (:tom, 'tom.receber@exemplo.test', now(), '{"display_name":"Tom"}');

set role authenticated;

-- ---------------------------------------------------------------------------
-- 2. Anotar
-- ---------------------------------------------------------------------------
select pg_temp.as_('rosa');
do $$
declare
  space jsonb := public.ensure_personal_space('Conta principal');
  biz uuid;
  r jsonb;
begin
  perform pg_temp.keep('pes', (space ->> 'context_id')::uuid);
  perform pg_temp.keep('pes_acc', (space #>> '{account,id}')::uuid);
  biz := (public.create_business('Doceria da Rosa', 'ar-a-0001') #>> '{context,id}')::uuid;
  perform pg_temp.keep('biz', biz);
  perform pg_temp.keep('biz_acc', (select id from public.financial_accounts where context_id = biz));
  perform pg_temp.expect_code(format('select public.create_receivable(%L, %L, %L, %L, %s, %L, %L)', 'ar-c-0001', pg_temp.id('pes'), 'fiado', 'Bolo', 5000, '2026-12-05', 'Vendas'),
                              'contexto_invalido', '22023');
  perform pg_temp.expect_code(format('select public.create_receivable(%L, %L, %L, %L, %s, %L, %L)', 'ar-c-0002', biz, 'cheque', 'Bolo', 5000, '2026-12-05', 'Vendas'), 'tipo_invalido', '22023');
  perform pg_temp.expect_code(format('select public.create_receivable(%L, %L, %L, %L, %s, %L, %L)', 'ar-c-0003', biz, 'fiado', '   ', 5000, '2026-12-05', 'Vendas'), 'descricao_invalida', '22023');
  perform pg_temp.expect_code(format('select public.create_receivable(%L, %L, %L, %L, %s, %L, %L)', 'ar-c-0004', biz, 'fiado', 'Bolo', 0, '2026-12-05', 'Vendas'), 'valor_invalido', '22023');
  perform pg_temp.expect_code(format('select public.create_receivable(%L, %L, %L, %L, %s, %L, %L)', 'ar-c-0005', biz, 'fiado', 'Bolo', 5000, '1999-12-31', 'Vendas'), 'data_invalida', '22023');
  perform pg_temp.expect_code(format('select public.create_receivable(%L, %L, %L, %L, %s, %L, %L)', 'ar-c-0006', biz, 'fiado', 'Bolo', 5000, '2026-12-05', 'Moradia'), 'categoria_invalida', '22023');
  perform pg_temp.expect_code(format('select public.create_receivable(%L, %L, %L, %L, %s, %L, %L, %L)', 'ar-c-0007', biz, 'fiado', 'Bolo', 5000, '2026-12-05', 'Vendas', repeat('x', 61)),
                              'nome_invalido', '22023');
  r := public.create_receivable('ar-c-0010', biz, 'fiado', '  Bolo de aniversário  ', 12000, '2026-12-05', 'Vendas', '  Dona Célia  ');
  perform pg_temp.keep('r1', (r ->> 'id')::uuid);
  assert r ->> 'description' = 'Bolo de aniversário' and r ->> 'debtor' = 'Dona Célia' and r ->> 'status' = 'aberto' and (r ->> 'version')::int = 1
     and r ->> 'kind' = 'fiado' and (r ->> 'context_id')::uuid = biz, 'anotado, sem espaços nas pontas';
  assert public.create_receivable('ar-c-0010', biz, 'fiado', '  Bolo de aniversário  ', 12000, '2026-12-05', 'Vendas', '  Dona Célia  ') = r, 'repetir devolve o mesmo';
  perform pg_temp.expect_code(format('select public.create_receivable(%L, %L, %L, %L, %s, %L, %L)', 'ar-c-0010', biz, 'fiado', 'Bolo', 1, '2026-12-05', 'Vendas'), 'chave_reutilizada', 'PT409');
  -- Nome vazio vira nulo; venda no cartão sem nome.
  r := public.create_receivable('ar-c-0011', biz, 'cartao', 'Vendas da feira no crédito', 30000, '2026-12-25', 'Vendas', '   ');
  perform pg_temp.keep('r2', (r ->> 'id')::uuid);
  assert r ->> 'debtor' is null, 'nome vazio vira nulo';
  assert pg_temp.totals(biz, '2026-11-01') = array[0, 0]::bigint[], 'o a receber não entra em total nenhum';
  assert pg_temp.activity(biz) = 1, 'anotar conta como anotação';
  assert (select count(*) from public.record_operations where action = 'criar_a_receber' and target_id = (r ->> 'id')::uuid and record_id is null) = 1,
    'a operação aponta para o a receber';
end $$;

select pg_temp.as_('tom');
do $$ begin
  perform public.ensure_personal_space('Conta principal');
  assert (select count(*) from public.business_receivables) = 0, 'quem é de fora não lê';
  perform pg_temp.expect_code(format('select public.create_receivable(%L, %L, %L, %L, %s, %L, %L)', 'ar-t-0001', pg_temp.id('biz'), 'fiado', 'Bolo', 5000, '2026-12-05', 'Vendas'),
                              'nao_encontrado', 'P0002');
  perform pg_temp.expect_code(format('select public.update_receivable(%L, %L, 1, %L, %L, %s, %L, %L)', 'ar-t-0002', pg_temp.id('r1'), 'fiado', 'X', 1, '2026-12-05', 'Vendas'),
                              'nao_encontrado', 'P0002');
  perform pg_temp.expect_code(format('select public.receive_receivable(%L, %L, 1, %L, %s, %L)', 'ar-t-0003', pg_temp.id('r1'), pg_temp.id('biz_acc'), 100, '2026-11-25'),
                              'nao_encontrado', 'P0002');
end $$;

-- ---------------------------------------------------------------------------
-- 3. Alterar e receber
-- ---------------------------------------------------------------------------
select pg_temp.as_('rosa');
do $$
declare
  biz uuid := pg_temp.id('biz');
  r jsonb;
  res jsonb;
  rec public.financial_records;
begin
  perform pg_temp.expect_code(format('select public.update_receivable(%L, %L, 9, %L, %L, %s, %L, %L)', 'ar-u-0001', pg_temp.id('r1'), 'fiado', 'Bolo', 12000, '2026-12-05', 'Vendas'),
                              'versao_desatualizada', 'PT409');
  r := public.update_receivable('ar-u-0010', pg_temp.id('r1'), 1, 'fiado', 'Bolo de aniversário', 15000, '2026-12-10', 'Vendas', 'Dona Célia');
  assert (r ->> 'amount_cents')::bigint = 15000 and r ->> 'expected_on' = '2026-12-10' and (r ->> 'version')::int = 2, 'alterado';
  -- Receber: conta de outro espaço, data futura, valor.
  perform pg_temp.expect_code(format('select public.receive_receivable(%L, %L, 2, %L, %s, %L)', 'ar-r-0001', pg_temp.id('r1'), pg_temp.id('pes_acc'), 15000, '2026-11-25'), 'conta_invalida', '22023');
  perform pg_temp.expect_code(format('select public.receive_receivable(%L, %L, 2, %L, %s, %L)', 'ar-r-0002', pg_temp.id('r1'), pg_temp.id('biz_acc'), 15000, '2026-11-26'), 'data_futura', '22023');
  perform pg_temp.expect_code(format('select public.receive_receivable(%L, %L, 2, %L, %s, %L)', 'ar-r-0003', pg_temp.id('r1'), pg_temp.id('biz_acc'), 0, '2026-11-25'), 'valor_invalido', '22023');
  perform pg_temp.expect_code(format('select public.receive_receivable(%L, %L, 1, %L, %s, %L)', 'ar-r-0004', pg_temp.id('r1'), pg_temp.id('biz_acc'), 15000, '2026-11-25'), 'versao_desatualizada', 'PT409');
  res := public.receive_receivable('ar-r-0010', pg_temp.id('r1'), 2, pg_temp.id('biz_acc'), 14500, '2026-11-24');
  rec := jsonb_populate_record(null::public.financial_records, res -> 'record');
  perform pg_temp.keep('rec1', rec.id);
  assert rec.context_id = biz and rec.kind = 'receita' and rec.category = 'Vendas' and rec.description = 'Bolo de aniversário' and rec.amount_cents = 14500
     and rec.occurred_on = '2026-11-24' and rec.receivable_id = pg_temp.id('r1') and rec.account_id = pg_temp.id('biz_acc'), 'a entrada ligada, com o valor confirmado';
  assert res #>> '{receivable,status}' = 'recebido' and (res #>> '{receivable,version}')::int = 3, 'recebido';
  assert public.receive_receivable('ar-r-0010', pg_temp.id('r1'), 2, pg_temp.id('biz_acc'), 14500, '2026-11-24') -> 'record' ->> 'id' = rec.id::text, 'repetir devolve o mesmo';
  assert pg_temp.totals(biz, '2026-11-01') = array[14500, 0]::bigint[], 'a entrada conta como sempre';
  perform pg_temp.expect_code(format('select public.receive_receivable(%L, %L, 3, %L, %s, %L)', 'ar-r-0011', pg_temp.id('r1'), pg_temp.id('biz_acc'), 100, '2026-11-25'), 'ja_recebido', 'PT409');
  perform pg_temp.expect_code(format('select public.update_receivable(%L, %L, 3, %L, %L, %s, %L, %L)', 'ar-r-0012', pg_temp.id('r1'), 'fiado', 'X', 1, '2026-12-05', 'Vendas'), 'ja_recebido', 'PT409');
  perform pg_temp.expect_code(format('select public.delete_receivable(%L, %L, 3)', 'ar-r-0013', pg_temp.id('r1')), 'ja_recebido', 'PT409');
  assert (select count(*) from public.record_operations where action = 'receber_a_receber' and record_id = rec.id and target_id = pg_temp.id('r1')) = 1,
    'a operação guarda a entrada e o a receber';
end $$;

-- ---------------------------------------------------------------------------
-- 4. A entrada ligada: continua entrada, não muda de espaço; excluí-la reabre o a receber
-- ---------------------------------------------------------------------------
do $$
declare
  rec public.financial_records := pg_temp.rec(pg_temp.id('rec1'));
begin
  perform pg_temp.expect_code(format('select public.update_record(%L, %L, %s, %L, %s, %L, %L, %L, null, %L)', 'ar-l-0001', rec.id, rec.version, rec.account_id, rec.amount_cents,
                                     rec.occurred_on, rec.description, 'Material e mercadoria', 'despesa'), 'recebimento_ligado', 'PT409');
  perform pg_temp.expect_code(format('select public.move_record(%L, %L, %s, %L, %L, %L)', 'ar-l-0002', rec.id, rec.version, pg_temp.id('pes'), pg_temp.id('pes_acc'), 'Outros'),
                              'lancamento_ligado', 'PT409');
  -- Mudar o valor e a descrição pode.
  rec := public.update_record('ar-l-0003', rec.id, rec.version, rec.account_id, 14000, rec.occurred_on, 'Bolo da Dona Célia', 'Vendas');
  assert rec.amount_cents = 14000 and rec.receivable_id = pg_temp.id('r1'), 'alterar o valor mantém o vínculo';
  perform public.delete_record('ar-l-0004', rec.id, rec.version);
  assert (pg_temp.rv(pg_temp.id('r1'))).status = 'aberto' and (pg_temp.rv(pg_temp.id('r1'))).version = 4, 'excluir a entrada reabre o a receber';
  -- Recebe de novo: outra entrada viva.
  perform public.receive_receivable('ar-l-0005', pg_temp.id('r1'), 4, pg_temp.id('biz_acc'), 15000, '2026-11-25');
  assert (select count(*) from public.financial_records where receivable_id = pg_temp.id('r1') and deleted_at is null) = 1, 'uma entrada viva por a receber';
end $$;
-- O vínculo não nasce fora de receive_receivable (o dono do banco, sem as funções).
reset role;
do $$ begin
  begin
    update public.financial_records set receivable_id = pg_temp.id('r2') where id = pg_temp.id('rec1');
    raise exception 'o vínculo nasceu fora da função';
  exception when others then
    if sqlerrm <> 'campo_imutavel' then raise; end if;
  end;
end $$;
set role authenticated;
select pg_temp.as_('rosa');

-- ---------------------------------------------------------------------------
-- 5. Excluir um a receber em aberto
-- ---------------------------------------------------------------------------
do $$
declare
  r jsonb;
begin
  perform pg_temp.expect_code(format('select public.delete_receivable(%L, %L, 7)', 'ar-d-0001', pg_temp.id('r2')), 'versao_desatualizada', 'PT409');
  r := public.delete_receivable('ar-d-0010', pg_temp.id('r2'), 1);
  assert r ->> 'deleted_at' is not null and (r ->> 'version')::int = 2, 'excluído';
  perform pg_temp.expect_code(format('select public.delete_receivable(%L, %L, 2)', 'ar-d-0011', pg_temp.id('r2')), 'nao_encontrado', 'P0002');
  perform pg_temp.expect_code(format('select public.receive_receivable(%L, %L, 2, %L, %s, %L)', 'ar-d-0012', pg_temp.id('r2'), pg_temp.id('biz_acc'), 100, '2026-11-25'),
                              'nao_encontrado', 'P0002');
end $$;

-- ---------------------------------------------------------------------------
-- 6. Marcas da entrada do negócio
-- ---------------------------------------------------------------------------
do $$
declare
  biz uuid := pg_temp.id('biz');
  r public.financial_records;
begin
  r := public.create_record('ar-m-0001', biz, pg_temp.id('biz_acc'), 'receita', 8000, '2026-11-20', 'Encomenda', 'Vendas', null, false, null, null,
                            '{"has_invoice": true, "payer_kind": "pj"}');
  assert r.has_invoice and r.payer_kind = 'pj', 'marcas gravadas';
  assert (public.create_record('ar-m-0001', biz, pg_temp.id('biz_acc'), 'receita', 8000, '2026-11-20', 'Encomenda', 'Vendas', null, false, null, null,
                               '{"has_invoice": true, "payer_kind": "pj"}')).id = r.id, 'repetir devolve o mesmo';
  perform pg_temp.expect_code(format('select public.create_record(%L, %L, %L, %L, 1000, %L, %L, %L, null, false, null, null, %L)', 'ar-m-0001', biz, pg_temp.id('biz_acc'), 'receita',
                                     '2026-11-20', 'X', 'Vendas', '{"has_invoice": true, "payer_kind": "pj"}'), 'chave_reutilizada', 'PT409');
  -- Recusas: no Pessoal, num gasto, chave a mais, tipo errado, quem pagou fora da lista.
  perform pg_temp.expect_code(format('select public.create_record(%L, %L, %L, %L, 1000, %L, %L, null, null, false, null, null, %L)', 'ar-m-0003', pg_temp.id('pes'), pg_temp.id('pes_acc'), 'receita',
                                     '2026-11-20', 'Salário', '{"has_invoice": false}'), 'marcas_invalidas', '22023');
  perform pg_temp.expect_code(format('select public.create_record(%L, %L, %L, %L, 1000, %L, %L, %L, null, false, null, null, %L)', 'ar-m-0004', biz, pg_temp.id('biz_acc'), 'despesa',
                                     '2026-11-20', 'Farinha', 'Material e mercadoria', '{"has_invoice": true}'), 'marcas_invalidas', '22023');
  perform pg_temp.expect_code(format('select public.create_record(%L, %L, %L, %L, 1000, %L, %L, %L, null, false, null, null, %L)', 'ar-m-0005', biz, pg_temp.id('biz_acc'), 'receita',
                                     '2026-11-20', 'X', 'Vendas', '{"cpf": "1"}'), 'marcas_invalidas', '22023');
  perform pg_temp.expect_code(format('select public.create_record(%L, %L, %L, %L, 1000, %L, %L, %L, null, false, null, null, %L)', 'ar-m-0006', biz, pg_temp.id('biz_acc'), 'receita',
                                     '2026-11-20', 'X', 'Vendas', '{"has_invoice": "sim"}'), 'marcas_invalidas', '22023');
  perform pg_temp.expect_code(format('select public.create_record(%L, %L, %L, %L, 1000, %L, %L, %L, null, false, null, null, %L)', 'ar-m-0007', biz, pg_temp.id('biz_acc'), 'receita',
                                     '2026-11-20', 'X', 'Vendas', '{"payer_kind": "governo"}'), 'marcas_invalidas', '22023');
  -- Marcas nulas valem em qualquer lugar (o mesmo que não mandar).
  perform public.create_record('ar-m-0008', pg_temp.id('pes'), pg_temp.id('pes_acc'), 'receita', 1000, '2026-11-20', 'Salário', null, null, false, null, null,
                               '{"has_invoice": null, "payer_kind": null}');
  -- update: sem p_marks (o app anterior) mantém; com p_marks troca; virar gasto limpa.
  r := public.update_record('ar-m-0010', r.id, r.version, r.account_id, 8500, r.occurred_on, r.description, r.category);
  assert r.has_invoice and r.payer_kind = 'pj' and r.amount_cents = 8500, 'sem marcas, mantém as de antes';
  r := public.update_record('ar-m-0011', r.id, r.version, r.account_id, 8500, r.occurred_on, r.description, r.category, null, null, null, null, null,
                            '{"has_invoice": false, "payer_kind": "pf"}');
  assert not r.has_invoice and r.payer_kind = 'pf', 'troca as marcas';
  r := public.update_record('ar-m-0012', r.id, r.version, r.account_id, 8500, r.occurred_on, r.description, 'Outras saídas', null, 'despesa');
  assert r.kind = 'despesa' and r.has_invoice is null and r.payer_kind is null, 'virar gasto limpa as marcas';
  -- A chamada antiga, sem p_marks, segue funcionando.
  r := public.create_record('ar-m-0013', biz, pg_temp.id('biz_acc'), 'receita', 2000, '2026-11-21', 'Venda no balcão', 'Vendas');
  assert r.has_invoice is null and r.payer_kind is null, 'sem marcas';
end $$;

-- ---------------------------------------------------------------------------
-- 7. Papéis no negócio compartilhado (Plus aberto só neste teste)
-- ---------------------------------------------------------------------------
reset role;
select public.clarevo_staff_set_plus(now() - interval '1 minute');
set role authenticated;
select pg_temp.as_('rosa');
do $$
declare
  c1 text := public.create_business_invite(pg_temp.id('biz'), 'membro', 'ar-p-0001') ->> 'code';
  c2 text := public.create_business_invite(pg_temp.id('biz'), 'leitor', 'ar-p-0002') ->> 'code';
begin
  perform pg_temp.keep('r3', (public.create_receivable('ar-p-0003', pg_temp.id('biz'), 'outro', 'Aluguel da mesa da feira', 4000, '2026-12-01', 'Outras entradas') ->> 'id')::uuid);
  create temp table if not exists codes (k text primary key, c text);
  grant select on codes to authenticated;
  insert into codes values ('ivo', c1), ('ana', c2);
end $$;
select pg_temp.as_('ivo');
do $$ begin
  perform public.ensure_personal_space('Conta principal');
  perform public.accept_business_invite((select c from codes where k = 'ivo'), 'ar-p-0010');
  perform pg_temp.keep('r4', (public.create_receivable('ar-p-0011', pg_temp.id('biz'), 'fiado', 'Brigadeiros', 3000, '2026-12-02', 'Vendas', 'Seu Juca') ->> 'id')::uuid);
  perform pg_temp.expect_code(format('select public.update_receivable(%L, %L, 1, %L, %L, %s, %L, %L)', 'ar-p-0012', pg_temp.id('r3'), 'outro', 'X', 1, '2026-12-05', 'Vendas'),
                              'sem_permissao', '42501');
  perform pg_temp.expect_code(format('select public.delete_receivable(%L, %L, 1)', 'ar-p-0013', pg_temp.id('r3')), 'sem_permissao', '42501');
  -- Quem anota recebe o de outra pessoa.
  perform public.receive_receivable('ar-p-0014', pg_temp.id('r3'), 1, pg_temp.id('biz_acc'), 4000, '2026-11-25');
end $$;
select pg_temp.as_('ana');
do $$ begin
  perform public.ensure_personal_space('Conta principal');
  perform public.accept_business_invite((select c from codes where k = 'ana'), 'ar-p-0020');
  assert (select count(*) from public.business_receivables where deleted_at is null) = 3, 'quem só vê lê (os 3 vivos)';
  perform pg_temp.expect_code(format('select public.create_receivable(%L, %L, %L, %L, %s, %L, %L)', 'ar-p-0021', pg_temp.id('biz'), 'fiado', 'X', 1, '2026-12-05', 'Vendas'),
                              'sem_permissao', '42501');
  perform pg_temp.expect_code(format('select public.receive_receivable(%L, %L, 1, %L, %s, %L)', 'ar-p-0022', pg_temp.id('r4'), pg_temp.id('biz_acc'), 3000, '2026-11-25'),
                              'sem_permissao', '42501');
end $$;
select pg_temp.as_('rosa');
do $$ begin
  -- Quem administra altera o de outra pessoa.
  assert (public.update_receivable('ar-p-0030', pg_temp.id('r4'), 1, 'fiado', 'Brigadeiros', 3500, '2026-12-03', 'Vendas', 'Seu Juca') ->> 'amount_cents')::bigint = 3500,
    'quem administra altera';
end $$;

-- ---------------------------------------------------------------------------
-- 8. Só ver e exportar
-- ---------------------------------------------------------------------------
reset role;
update public.billing_settings set enforced_from = now() - interval '40 days';
update public.persons set created_at = now() - interval '60 days' where id = :rosa;
set role authenticated;
select pg_temp.as_('rosa');
select pg_temp.expect_code(format('select public.create_receivable(%L, %L, %L, %L, %s, %L, %L)', 'ar-s-0001', pg_temp.id('biz'), 'fiado', 'X', 1, '2026-12-05', 'Vendas'),
                           'assinatura_necessaria', 'PT402');
reset role;
update public.billing_settings set enforced_from = null;

-- ---------------------------------------------------------------------------
-- 9. A limpeza dos 6 meses apaga o a receber excluído há mais de 6 meses
-- ---------------------------------------------------------------------------
do $$
declare
  r jsonb;
begin
  update public.business_receivables set deleted_at = now() - interval '7 months' where id = pg_temp.id('r2');
  r := public.clarevo_purge_deleted();
  assert (r ->> 'a_receber')::int >= 1 and (select count(*) from public.business_receivables where id = pg_temp.id('r2')) = 0, 'apagado de vez: ' || r::text;
  assert (select count(*) from public.business_receivables where id = pg_temp.id('r1')) = 1, 'o recebido fica';
end $$;

rollback;
