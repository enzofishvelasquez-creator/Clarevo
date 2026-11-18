-- Espaço Negócio (D-113; migração 20261117000004_espaco_negocio.sql). Confere: o tipo novo usado só onde é seguro na mesma transação
-- (corpo de plpgsql), a coluna, a restrição e o gatilho da retirada, as seis funções do app e as auxiliares fechadas; criar (nome,
-- repetição, um negócio por pessoa, a "Conta do negócio", titular, sem contar como anotação), renomear e encerrar; quem é de fora não
-- vê nem anota; lançamentos, conta a pagar, cartão e orçamento com as categorias do negócio; metas e investimentos recusados; a
-- retirada para o Pessoal (ligada nos dois lados, cada lado contando uma vez no próprio espaço, travada para editar, excluir, mover e
-- ligar, e excluída junto pelo lado que for); mover entre o Pessoal e o negócio (e as recusas); encerrar desliga as retiradas; só ver
-- e exportar recusa criar e deixa encerrar; a exclusão da conta apaga o negócio; a limpeza dos 6 meses apaga o negócio encerrado.
-- Pessoas FICTÍCIAS: Bia (dona do negócio), Caio (de fora) e Duda (exclui a conta). Tudo em uma transação desfeita no fim.
\set ON_ERROR_STOP 1
\set bia  '''00000000-0000-0000-0000-0000000000e8'''
\set caio '''00000000-0000-0000-0000-0000000000e9'''
\set duda '''00000000-0000-0000-0000-0000000000ea'''

begin;
set local clarevo.today = '2026-11-17';

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
-- Leituras direto nas tabelas (sem a RLS), como o dono do banco.
create function pg_temp.rec(p_id uuid) returns public.financial_records language sql security definer set search_path = public, pg_temp as $$
  select * from public.financial_records where id = p_id
$$;
create function pg_temp.ctx(p_id uuid) returns public.financial_contexts language sql security definer set search_path = public, pg_temp as $$
  select * from public.financial_contexts where id = p_id
$$;
create function pg_temp.live(p_ctx uuid) returns bigint language sql security definer set search_path = public, pg_temp as $$
  select count(*) from public.financial_records where context_id = p_ctx and deleted_at is null
$$;
create function pg_temp.activity(p_person uuid, p_ctx uuid) returns bigint language sql security definer set search_path = public, pg_temp as $$
  select count(*) from public.context_activity where person_id = p_person and context_id = p_ctx
$$;
create function pg_temp.totals(p_ctx uuid, p_month date) returns bigint[] language sql as $$
  select array[received_cents, paid_cents] from public.month_totals(p_ctx, p_month)
$$;
grant execute on function pg_temp.id(text), pg_temp.keep(text, uuid), pg_temp.as_(text), pg_temp.expect_code(text, text, text),
  pg_temp.rec(uuid), pg_temp.ctx(uuid), pg_temp.live(uuid), pg_temp.activity(uuid, uuid), pg_temp.totals(uuid, date) to authenticated;

-- ---------------------------------------------------------------------------
-- 1. Esquema, privilégios e o uso seguro do valor novo
-- ---------------------------------------------------------------------------
do $$
declare
  f text;
begin
  assert 'negocio' = any (enum_range(null::public.context_kind)::text[]), 'o tipo de contexto negocio existe';
  assert pg_get_constraintdef((select oid from pg_constraint where conname = 'financial_contexts_encerrado')) like '%<> ''pessoal''%',
    'Família e negócio podem ser encerrados; o Pessoal não';
  assert exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'financial_records' and column_name = 'paired_record_id'),
    'a coluna do vínculo da retirada';
  assert (select confdeltype from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
           where c.conrelid = 'public.financial_records'::regclass and c.contype = 'f' and a.attname = 'paired_record_id') = 'n',
    'o outro lado apagado de vez só desfaz o vínculo';
  assert exists (select 1 from pg_indexes where indexname = 'financial_records_paired_record_id_fk_idx'), 'índice da chave do vínculo';
  assert exists (select 1 from pg_constraint where conname = 'financial_records_par'), 'restrição da retirada';
  assert exists (select 1 from pg_trigger where tgname = 'financial_records_pair_guard' and not tgisinternal), 'guarda da retirada';
  assert exists (select 1 from pg_trigger where tgname = 'goals_context_guard' and not tgisinternal), 'guarda das metas';
  -- O valor novo só aparece no corpo de funções plpgsql (lido quando a função roda): a migração pode rodar numa transação só.
  assert not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace join pg_language l on l.oid = p.prolang
                      where n.nspname = 'public' and p.prosrc ~ '''negocio''' and l.lanname <> 'plpgsql'), 'só plpgsql usa o valor novo';
  assert not exists (select 1 from pg_constraint where pg_get_constraintdef(oid) ~ '''negocio''::'), 'nenhuma restrição usa o valor novo';
  assert not exists (select 1 from pg_indexes where indexdef ~ '''negocio''::'), 'nenhum índice usa o valor novo';
  assert not exists (select 1 from pg_views where schemaname = 'public' and definition ~ '''negocio''::'), 'nenhuma visão usa o valor novo';
  foreach f in array array['create_business(text, text)', 'rename_business(uuid, text, text)', 'end_business(uuid, text)',
                           'create_business_withdrawal(text, uuid, uuid, uuid, bigint, date, text)', 'delete_business_withdrawal(text, uuid, integer)',
                           'move_record(text, uuid, integer, uuid, uuid, text)'] loop
    assert has_function_privilege('authenticated', 'public.' || f, 'execute') and not has_function_privilege('anon', 'public.' || f, 'execute'),
      'só authenticated executa ' || f;
    assert (select prosecdef and provolatile = 'v' and proconfig @> array['search_path=public'] from pg_proc where oid = ('public.' || f)::regprocedure),
      'definer, volátil e com search_path fixo: ' || f;
  end loop;
  foreach f in array array['financial_records_pair_guard()', 'goals_context_guard()', 'clarevo_is_business(uuid)', 'clarevo_active_business_count(uuid)',
                           'clarevo_budget_categories(uuid)', 'clarevo_business_json(uuid)', 'clarevo_require_business_owner(uuid)',
                           'clarevo_personal_context(uuid)', 'clarevo_withdrawal_json(uuid, uuid)'] loop
    assert not has_function_privilege('authenticated', 'public.' || f, 'execute') and not has_function_privilege('anon', 'public.' || f, 'execute')
       and not has_function_privilege('service_role', 'public.' || f, 'execute'), 'auxiliar fechada: ' || f;
  end loop;
  assert 'encerrar_negocio' = any (public.clarevo_write_free_actions()) and not ('criar_negocio' = any (public.clarevo_write_free_actions())),
    'encerrar vale em só ver e exportar; criar, não';
end $$;

insert into ids values ('bia', :bia), ('caio', :caio), ('duda', :duda);
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  (:bia, 'bia.negocio@exemplo.test', now(), '{"display_name":"Bia"}'),
  (:caio, 'caio.negocio@exemplo.test', now(), '{"display_name":"Caio"}'),
  (:duda, 'duda.negocio@exemplo.test', now(), '{"display_name":"Duda"}');

set role authenticated;

-- ---------------------------------------------------------------------------
-- 2. Criar o negócio
-- ---------------------------------------------------------------------------
select pg_temp.as_('bia');
select pg_temp.expect_code($q$select public.create_business('Sacolé da Bia', 'ng-c-0000')$q$, 'sem_permissao', '42501');
do $$
declare
  space jsonb := public.ensure_personal_space('Conta principal');
  res jsonb;
  again jsonb;
  biz uuid;
begin
  perform pg_temp.keep('pes', (space ->> 'context_id')::uuid);
  perform pg_temp.keep('pes_acc', (space #>> '{account,id}')::uuid);
  perform pg_temp.expect_code($q$select public.create_business('   ', 'ng-c-0001')$q$, 'nome_do_negocio_invalido', '22023');
  perform pg_temp.expect_code(format('select public.create_business(%L, %L)', repeat('x', 61), 'ng-c-0002'), 'nome_do_negocio_invalido', '22023');
  perform pg_temp.expect_code($q$select public.create_business('Sacolé', 'curta')$q$, 'chave_invalida', '22023');
  res := public.create_business('  Sacolé da Bia  ', 'ng-c-0003');
  biz := (res #>> '{context,id}')::uuid;
  perform pg_temp.keep('biz', biz);
  assert res #>> '{context,name}' = 'Sacolé da Bia' and res ->> 'role' = 'titular' and res #>> '{context,ended_at}' is null, 'cria com o nome sem espaços nas pontas';
  again := public.create_business('Sacolé da Bia', 'ng-c-0003');
  assert again = res, 'repetir a chave devolve o mesmo';
  perform pg_temp.expect_code($q$select public.create_business('Outro nome', 'ng-c-0003')$q$, 'chave_reutilizada', 'PT409');
  perform pg_temp.expect_code($q$select public.create_business('Segundo negócio', 'ng-c-0004')$q$, 'ja_tem_negocio', 'PT409');
  assert (pg_temp.ctx(biz)).kind = 'negocio' and (pg_temp.ctx(biz)).owner_person_id = pg_temp.id('bia'), 'contexto do tipo negocio, da Bia';
  assert (select count(*) from public.financial_contexts where kind = 'negocio') = 1, 'a Bia lê o negócio dela';
  assert (select array_agg(name || ':' || is_default || ':' || kind) from public.financial_accounts where context_id = biz) = array['Conta do negócio:true:banco'],
    'nasce com a Conta do negócio, a principal';
  perform pg_temp.keep('biz_acc', (select id from public.financial_accounts where context_id = biz));
  assert (select role::text || can_read || can_write || can_edit_others from public.context_memberships where context_id = biz and person_id = pg_temp.id('bia'))
       = 'titulartruetruetrue', 'quem cria é titular, lê, anota e edita';
  assert (select count(*) from public.record_operations where action = 'criar_negocio' and target_id = biz and context_id = biz) = 1, 'a operação aponta para o negócio';
  assert pg_temp.activity(pg_temp.id('bia'), biz) = 0, 'criar o negócio não conta como anotação';
end $$;

-- ---------------------------------------------------------------------------
-- 3. Quem é de fora não vê nem anota
-- ---------------------------------------------------------------------------
select pg_temp.as_('caio');
do $$
declare
  space jsonb := public.ensure_personal_space('Conta principal');
begin
  perform pg_temp.keep('caio_pes', (space ->> 'context_id')::uuid);
  perform pg_temp.keep('caio_acc', (space #>> '{account,id}')::uuid);
  assert (select count(*) from public.financial_contexts where id = pg_temp.id('biz')) = 0, 'o Caio não lê o negócio da Bia';
  assert (select count(*) from public.financial_accounts where context_id = pg_temp.id('biz')) = 0, 'nem as contas dele';
  perform pg_temp.expect_code(format('select public.create_record(%L, %L, %L, %L, %s, %L, %L)', 'ng-x-0001', pg_temp.id('biz'), pg_temp.id('biz_acc'), 'receita', 1000, '2026-11-10', 'Venda'),
                              'sem_permissao', '42501');
  perform pg_temp.expect_code(format('select public.rename_business(%L, %L, %L)', pg_temp.id('biz'), 'Meu', 'ng-x-0002'), 'nao_encontrado', 'P0002');
  perform pg_temp.expect_code(format('select public.end_business(%L, %L)', pg_temp.id('biz'), 'ng-x-0003'), 'nao_encontrado', 'P0002');
  perform pg_temp.expect_code(format('select public.create_business_withdrawal(%L, %L, %L, %L, %s, %L)', 'ng-x-0004', pg_temp.id('biz'), pg_temp.id('biz_acc'), pg_temp.id('caio_acc'), 100, '2026-11-10'),
                              'nao_encontrado', 'P0002');
  -- O Pessoal não é um negócio.
  perform pg_temp.expect_code(format('select public.rename_business(%L, %L, %L)', pg_temp.id('caio_pes'), 'Meu', 'ng-x-0005'), 'contexto_invalido', '22023');
  perform pg_temp.expect_code(format('select public.create_business_withdrawal(%L, %L, %L, %L, %s, %L)', 'ng-x-0006', pg_temp.id('caio_pes'), pg_temp.id('caio_acc'), pg_temp.id('caio_acc'), 100, '2026-11-10'),
                              'contexto_invalido', '22023');
end $$;

-- ---------------------------------------------------------------------------
-- 4. Lançamentos, conta a pagar, cartão e orçamento no negócio; metas e investimentos não
-- ---------------------------------------------------------------------------
select pg_temp.as_('bia');
do $$
declare
  biz uuid := pg_temp.id('biz');
  acc uuid := pg_temp.id('biz_acc');
  r public.financial_records;
  b jsonb;
begin
  r := public.create_record('ng-r-0001', biz, acc, 'receita', 120000, '2026-11-05', 'Vendas da semana', 'Vendas');
  r := public.create_record('ng-r-0002', biz, acc, 'despesa', 30000, '2026-11-06', 'Frutas e açúcar', 'Material e mercadoria');
  r := public.create_record('ng-r-0003', biz, acc, 'despesa', 7600, '2026-11-07', 'DAS de novembro', 'Impostos e DAS');
  perform pg_temp.keep('frutas', (select id from public.financial_records where context_id = biz and description = 'Frutas e açúcar'));
  assert pg_temp.totals(biz, '2026-11-01') = array[120000, 37600]::bigint[], 'totais do negócio';
  assert pg_temp.totals(pg_temp.id('pes'), '2026-11-01') = array[0, 0]::bigint[], 'o Pessoal não muda';
  assert pg_temp.activity(pg_temp.id('bia'), biz) = 1, 'anotar no negócio conta como anotação';
  perform public.create_commitment('ng-cp-0001', biz, 50000, '2026-11-20', 'Aluguel do ponto', 'Aluguel do ponto');
  assert (select count(*) from public.commitments where context_id = biz) = 1, 'conta a pagar no negócio';
  perform public.create_card('ng-k-0001', biz, 'Cartão do negócio', '4321', 3, 10, 300000);
  assert (select count(*) from public.cards where context_id = biz) = 1, 'um cartão do negócio';
  -- Orçamento: as categorias de gasto do negócio, na ordem; as do Pessoal não valem no negócio, nem as do negócio no Pessoal.
  assert (select array_agg(category order by 1) from (select category from public.month_budget(biz, '2026-11-01')) x) is not null, 'orçamento lê';
  assert (select array_agg(category) from public.month_budget(biz, '2026-11-01'))
       = array['Material e mercadoria', 'Peças e ferramentas', 'Combustível e transporte', 'Funcionários e ajudantes', 'Impostos e DAS',
               'Aluguel do ponto', 'Contas do ponto', 'Taxas e maquininha', 'Outras saídas'], 'as 9 categorias de gasto do negócio, na ordem';
  assert (select array_agg(category) from public.month_budget(pg_temp.id('pes'), '2026-11-01'))
       = array['Moradia', 'Mercado', 'Transporte', 'Saúde', 'Educação', 'Lazer', 'Crédito e parcelas'], 'o Pessoal com as 7 de sempre';
  b := public.set_category_budget('ng-o-0001', biz, 'Material e mercadoria', '2026-11-01', 0, 40000);
  assert (select used_cents from public.month_budget(biz, '2026-11-01') where category = 'Material e mercadoria') = 30000
     and (select budget_cents from public.month_budget(biz, '2026-11-01') where category = 'Material e mercadoria') = 40000, 'orçamento do material';
  perform pg_temp.expect_code(format('select public.set_category_budget(%L, %L, %L, %L, 0, 10000)', 'ng-o-0002', biz, 'Moradia', '2026-11-01'), 'categoria_invalida', '22023');
  perform pg_temp.expect_code(format('select public.set_category_budget(%L, %L, %L, %L, 0, 10000)', 'ng-o-0003', pg_temp.id('pes'), 'Impostos e DAS', '2026-11-01'), 'categoria_invalida', '22023');
  -- Metas e investimentos: só fora do negócio.
  perform pg_temp.expect_code(format('select public.create_goal(%L, %L, %L, %L, %s, %L, %s, null, null, null, null, null)', 'ng-m-0001', biz, 'objetivo', 'Freezer novo', 300000, '2027-06-01', 25000),
                              'contexto_invalido', '22023');
  perform pg_temp.expect_code(format('select public.create_investment(%L, %L, %L, %L, %s, %L, null)', 'ng-i-0001', biz, 'Caixa', 'renda_fixa', 1000, '2026-11-01'),
                              'contexto_invalido', '22023');
end $$;

-- ---------------------------------------------------------------------------
-- 4a. WhatsApp e Telegram fora do negócio (D-113a): o código de ligar recusa o negócio (contexto_invalido, depois de sem_permissao para
-- quem é de fora); o Pessoal continua ligando; um código do negócio (gravado à força) não liga e é apagado.
-- ---------------------------------------------------------------------------
select pg_temp.as_('caio');
select pg_temp.expect_code(format('select public.create_telegram_code(%L, %L)', pg_temp.id('biz'), 'ng-tg-0000'), 'sem_permissao', '42501');
select pg_temp.as_('bia');
do $$
declare
  biz uuid := pg_temp.id('biz');
  r jsonb;
begin
  perform pg_temp.expect_code(format('select public.create_telegram_code(%L, %L)', biz, 'ng-tg-0001'), 'contexto_invalido', '22023');
  perform pg_temp.expect_code(format('select public.create_whatsapp_code(%L, %L)', biz, 'ng-wa-0001'), 'contexto_invalido', '22023');
  r := public.create_telegram_code(pg_temp.id('pes'), 'ng-tg-0002');
  assert r ->> 'code' is not null and (r ->> 'context_id')::uuid = pg_temp.id('pes'), 'o código do Pessoal continua saindo';
end $$;
reset role;
insert into public.chat_link_codes as c (person_id, channel, code_hash, context_id, expires_at)
values (:bia, 'telegram', encode(sha256(convert_to('NEGOCIO2', 'UTF8')), 'hex'), (select id from ids where name = 'biz'), now() + interval '15 minutes')
on conflict (person_id, channel) do update set code_hash = excluded.code_hash, context_id = excluded.context_id, expires_at = excluded.expires_at;
set role service_role;
select set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '{"role":"service_role"}', true);
do $$
declare
  r jsonb;
begin
  r := public.telegram_link('telegram:' || encode(sha256(convert_to('bia:negocio:1', 'UTF8')), 'hex'),
                            encode(sha256(convert_to('telegram:bia-negocio', 'UTF8')), 'hex'), 'NEGOCIO2');
  assert r ->> 'result' = 'sem_permissao', 'o código do negócio não liga: ' || r::text;
end $$;
reset role;
do $$
begin
  assert not exists (select 1 from public.chat_links where person_id = pg_temp.id('bia')), 'nenhum canal ligado ao negócio';
  assert not exists (select 1 from public.chat_link_codes where person_id = pg_temp.id('bia') and channel = 'telegram'), 'o código do negócio foi apagado';
  -- A retirada e o mover tomam a trava de end_business (familia:c:<negócio>) antes de conferir, como rename_business.
  assert (select prosrc from pg_proc where oid = 'public.create_business_withdrawal(text, uuid, uuid, uuid, bigint, date, text)'::regprocedure)
         ~ 'familia:c:.*context_permission\(p_business', 'a retirada trava o negócio antes de conferir';
  assert (select prosrc from pg_proc where oid = 'public.move_record(text, uuid, integer, uuid, uuid, text)'::regprocedure)
         ~ 'familia:c:.*clarevo_lock_record', 'o mover trava o negócio antes de travar o lançamento';
end $$;
set role authenticated;
select pg_temp.as_('bia');

-- ---------------------------------------------------------------------------
-- 5. Retirada para o Pessoal
-- ---------------------------------------------------------------------------
do $$
declare
  biz uuid := pg_temp.id('biz');
  pes uuid := pg_temp.id('pes');
  res jsonb;
  again jsonb;
  b public.financial_records;
  p public.financial_records;
begin
  -- Recusas: conta de outro espaço, valor e data.
  perform pg_temp.expect_code(format('select public.create_business_withdrawal(%L, %L, %L, %L, %s, %L)', 'ng-w-0001', biz, pg_temp.id('pes_acc'), pg_temp.id('pes_acc'), 1000, '2026-11-10'),
                              'conta_invalida', '22023');
  perform pg_temp.expect_code(format('select public.create_business_withdrawal(%L, %L, %L, %L, %s, %L)', 'ng-w-0002', biz, pg_temp.id('biz_acc'), pg_temp.id('biz_acc'), 1000, '2026-11-10'),
                              'conta_invalida', '22023');
  perform pg_temp.expect_code(format('select public.create_business_withdrawal(%L, %L, %L, %L, %s, %L)', 'ng-w-0003', biz, pg_temp.id('biz_acc'), pg_temp.id('pes_acc'), 0, '2026-11-10'),
                              'valor_invalido', '22023');
  perform pg_temp.expect_code(format('select public.create_business_withdrawal(%L, %L, %L, %L, %s, %L)', 'ng-w-0004', biz, pg_temp.id('biz_acc'), pg_temp.id('pes_acc'), 1000, '2026-11-18'),
                              'data_futura', '22023');
  assert pg_temp.live(biz) = 3 and pg_temp.live(pes) = 0, 'recusas não gravam nada';

  res := public.create_business_withdrawal('ng-w-0010', biz, pg_temp.id('biz_acc'), pg_temp.id('pes_acc'), 50000, '2026-11-15');
  b := jsonb_populate_record(null::public.financial_records, res -> 'business_record');
  p := jsonb_populate_record(null::public.financial_records, res -> 'personal_record');
  perform pg_temp.keep('wb', b.id);
  perform pg_temp.keep('wp', p.id);
  assert b.context_id = biz and b.kind = 'despesa' and b.category = 'Retirada para o Pessoal' and b.description = 'Retirada para o Pessoal'
     and b.amount_cents = 50000 and b.occurred_on = '2026-11-15' and b.paired_record_id = p.id, 'o gasto no negócio, ligado ao recebimento';
  assert p.context_id = pes and p.kind = 'receita' and p.category = 'Retirada do negócio' and p.description = 'Retirada de Sacolé da Bia'
     and p.amount_cents = 50000 and p.paired_record_id = b.id and p.account_id = pg_temp.id('pes_acc'), 'o recebimento no Pessoal, ligado ao gasto';
  -- Cada lado conta uma vez, no próprio espaço.
  assert pg_temp.totals(biz, '2026-11-01') = array[120000, 87600]::bigint[], 'no negócio, a retirada sai uma vez';
  assert pg_temp.totals(pes, '2026-11-01') = array[50000, 0]::bigint[], 'no Pessoal, entra uma vez como recebimento';
  again := public.create_business_withdrawal('ng-w-0010', biz, pg_temp.id('biz_acc'), pg_temp.id('pes_acc'), 50000, '2026-11-15');
  assert (again #>> '{business_record,id}')::uuid = b.id and (again #>> '{personal_record,id}')::uuid = p.id, 'repetir devolve os mesmos';
  assert pg_temp.live(biz) = 4 and pg_temp.live(pes) = 1, 'repetir não grava de novo';
  perform pg_temp.expect_code(format('select public.create_business_withdrawal(%L, %L, %L, %L, %s, %L)', 'ng-w-0010', biz, pg_temp.id('biz_acc'), pg_temp.id('pes_acc'), 50001, '2026-11-15'),
                              'chave_reutilizada', 'PT409');
  assert (select count(*) from public.record_operations where action = 'criar_retirada_negocio' and record_id = b.id and target_id = p.id and context_id = biz) = 1,
    'a operação guarda os dois lados';
  -- Com descrição própria, nos dois lados.
  res := public.create_business_withdrawal('ng-w-0011', biz, pg_temp.id('biz_acc'), pg_temp.id('pes_acc'), 1000, '2026-11-16', '  Pró-labore  ');
  assert res #>> '{business_record,description}' = 'Pró-labore' and res #>> '{personal_record,description}' = 'Pró-labore', 'descrição da pessoa nos dois lados';
  perform pg_temp.keep('wb2', (res #>> '{business_record,id}')::uuid);
  perform pg_temp.keep('wp2', (res #>> '{personal_record,id}')::uuid);

  -- Travada: editar, excluir, mover e ligar não tocam nenhum dos lados.
  perform pg_temp.expect_code(format('select public.update_record(%L, %L, 1, %L, %s, %L, %L, %L)', 'ng-w-0020', p.id, pg_temp.id('pes_acc'), 60000, '2026-11-15', 'Retirada', 'Retirada do negócio'),
                              'retirada_ligada', 'PT409');
  perform pg_temp.expect_code(format('select public.update_record(%L, %L, 1, %L, %s, %L, %L, %L)', 'ng-w-0021', b.id, pg_temp.id('biz_acc'), 60000, '2026-11-15', 'Retirada', 'Retirada para o Pessoal'),
                              'retirada_ligada', 'PT409');
  perform pg_temp.expect_code(format('select public.delete_record(%L, %L, 1)', 'ng-w-0022', p.id), 'retirada_ligada', 'PT409');
  perform pg_temp.expect_code(format('select public.delete_record(%L, %L, 1)', 'ng-w-0023', b.id), 'retirada_ligada', 'PT409');
  perform pg_temp.expect_code(format('select public.move_record(%L, %L, 1, %L, %L, null)', 'ng-w-0024', p.id, biz, pg_temp.id('biz_acc')), 'lancamento_ligado', 'PT409');
  assert (pg_temp.rec(p.id)).version = 1 and (pg_temp.rec(b.id)).version = 1 and (pg_temp.rec(p.id)).deleted_at is null, 'nada mudou';
  -- Excluir a retirada: pelo lado do Pessoal, os dois saem juntos.
  perform pg_temp.expect_code(format('select public.delete_business_withdrawal(%L, %L, 1)', 'ng-w-0030', pg_temp.id('frutas')), 'nao_e_retirada', '22023');
  perform pg_temp.expect_code(format('select public.delete_business_withdrawal(%L, %L, 2)', 'ng-w-0031', p.id), 'versao_desatualizada', 'PT409');
  res := public.delete_business_withdrawal('ng-w-0032', p.id, 1);
  assert (res #>> '{business_record,deleted_at}') is not null and (res #>> '{personal_record,deleted_at}') is not null
     and (res #>> '{business_record,version}')::int = 2 and (res #>> '{personal_record,version}')::int = 2, 'os dois lados saem, com versão nova';
  assert pg_temp.totals(biz, '2026-11-01') = array[120000, 38600]::bigint[] and pg_temp.totals(pes, '2026-11-01') = array[1000, 0]::bigint[],
    'os totais voltam (fica só a retirada de R$ 10,00)';
  again := public.delete_business_withdrawal('ng-w-0032', p.id, 1);
  assert (again #>> '{business_record,id}')::uuid = b.id, 'repetir devolve o mesmo';
  assert (select count(*) from public.record_operations where action = 'excluir_retirada_negocio' and record_id = b.id and target_id = p.id) = 1, 'operação de excluir';
end $$;

-- O Caio não exclui a retirada da Bia.
select pg_temp.as_('caio');
select pg_temp.expect_code(format('select public.delete_business_withdrawal(%L, %L, 1)', 'ng-w-0040', pg_temp.id('wp2')), 'nao_encontrado', 'P0002');
select pg_temp.as_('bia');

-- O guarda, direto na tabela (como o dono do banco): o vínculo não muda fora das funções, mas pode virar nulo sozinho.
reset role;
do $$
begin
  perform pg_temp.expect_code(format('update public.financial_records set amount_cents = 1 where id = %L', pg_temp.id('wp2')), 'retirada_ligada', 'PT409');
  perform pg_temp.expect_code(format('update public.financial_records set paired_record_id = %L where id = %L', pg_temp.id('frutas'), pg_temp.id('wp2')), 'retirada_ligada', 'PT409');
  perform pg_temp.expect_code(format('update public.financial_records set paired_record_id = %L where id = %L', pg_temp.id('wp2'), pg_temp.id('frutas')), 'campo_imutavel', '42501');
end $$;
set role authenticated;
select pg_temp.as_('bia');

-- ---------------------------------------------------------------------------
-- 6. Mover entre o Pessoal e o negócio
-- ---------------------------------------------------------------------------
do $$
declare
  biz uuid := pg_temp.id('biz');
  pes uuid := pg_temp.id('pes');
  r public.financial_records;
  moved public.financial_records;
  again public.financial_records;
  c jsonb;
begin
  -- Um gasto do negócio anotado no Pessoal.
  r := public.create_record('ng-mv-0001', pes, pg_temp.id('pes_acc'), 'despesa', 4500, '2026-11-12', 'Gasolina da entrega', 'Transporte', null, false, 'Combustível');
  perform pg_temp.expect_code(format('select public.move_record(%L, %L, 2, %L, %L, %L)', 'ng-mv-0002', r.id, biz, pg_temp.id('biz_acc'), 'Combustível e transporte'),
                              'versao_desatualizada', 'PT409');
  perform pg_temp.expect_code(format('select public.move_record(%L, %L, 1, %L, %L, %L)', 'ng-mv-0003', r.id, pes, pg_temp.id('pes_acc'), 'Transporte'),
                              'contexto_invalido', '22023');
  perform pg_temp.expect_code(format('select public.move_record(%L, %L, 1, %L, %L, %L)', 'ng-mv-0004', r.id, biz, pg_temp.id('pes_acc'), 'Combustível e transporte'),
                              'conta_invalida', '22023');
  perform pg_temp.expect_code(format('select public.move_record(%L, %L, 1, %L, %L, %L)', 'ng-mv-0005', r.id, pg_temp.id('caio_pes'), pg_temp.id('caio_acc'), 'Transporte'),
                              'contexto_invalido', '22023');
  moved := public.move_record('ng-mv-0006', r.id, 1, biz, pg_temp.id('biz_acc'), ' Combustível e transporte ');
  assert moved.context_id = biz and moved.kind = 'despesa' and moved.amount_cents = 4500 and moved.occurred_on = '2026-11-12'
     and moved.description = 'Gasolina da entrega' and moved.category = 'Combustível e transporte' and moved.subcategory is null
     and moved.account_id = pg_temp.id('biz_acc') and moved.version = 1 and moved.id <> r.id, 'gravado de novo no negócio, com a categoria escolhida';
  assert (pg_temp.rec(r.id)).deleted_at is not null and (pg_temp.rec(r.id)).version = 2, 'o original sai do Pessoal';
  again := public.move_record('ng-mv-0006', r.id, 1, biz, pg_temp.id('biz_acc'), ' Combustível e transporte ');
  assert again.id = moved.id, 'repetir devolve o mesmo';
  assert (select count(*) from public.record_operations where action = 'mover_lancamento' and record_id = moved.id and target_id = r.id and context_id = biz) = 1,
    'a operação guarda o novo e o original';
  -- E de volta, para o Pessoal, sem categoria.
  again := public.move_record('ng-mv-0007', moved.id, 1, pes, pg_temp.id('pes_acc'), null);
  assert again.context_id = pes and again.category is null and (pg_temp.rec(moved.id)).deleted_at is not null, 'de volta ao Pessoal';
  -- O pagamento de uma conta a pagar não muda de espaço.
  c := public.create_commitment('ng-mv-0010', pes, 9900, '2026-11-10', 'Internet', 'Moradia');
  perform public.pay_commitment('ng-mv-0011', (c #>> '{commitment,id}')::uuid, (c #>> '{commitment,version}')::int, pg_temp.id('pes_acc'), 9900, '2026-11-10', 'Moradia');
  perform pg_temp.expect_code(format('select public.move_record(%L, %L, 1, %L, %L, null)', 'ng-mv-0012',
                                     (select id from public.financial_records where commitment_id = (c #>> '{commitment,id}')::uuid), biz, pg_temp.id('biz_acc')),
                              'lancamento_ligado', 'PT409');
end $$;

-- O Caio não move o lançamento da Bia.
select pg_temp.as_('caio');
select pg_temp.expect_code(format('select public.move_record(%L, %L, 1, %L, %L, null)', 'ng-mv-0020', pg_temp.id('frutas'), pg_temp.id('caio_pes'), pg_temp.id('caio_acc')), 'nao_encontrado', 'P0002');
select pg_temp.as_('bia');

-- ---------------------------------------------------------------------------
-- 7. Renomear e encerrar
-- ---------------------------------------------------------------------------
do $$
declare
  biz uuid := pg_temp.id('biz');
  res jsonb;
  r public.financial_records;
begin
  perform pg_temp.expect_code(format('select public.rename_business(%L, %L, %L)', biz, '', 'ng-n-0001'), 'nome_do_negocio_invalido', '22023');
  res := public.rename_business(biz, 'Sacolés da Bia', 'ng-n-0002');
  assert res #>> '{context,name}' = 'Sacolés da Bia' and (pg_temp.ctx(biz)).name = 'Sacolés da Bia', 'renomeia';
  assert public.rename_business(biz, 'Sacolés da Bia', 'ng-n-0002') = res, 'repetir devolve o mesmo';

  -- Encerrar: a retirada viva de R$ 10,00 fica desligada nos dois lados; o recebimento do Pessoal passa a ser editável.
  assert (pg_temp.rec(pg_temp.id('wp2'))).paired_record_id = pg_temp.id('wb2'), 'antes, ligada';
  res := public.end_business(biz, 'ng-e-0001');
  assert res = jsonb_build_object('context_id', biz, 'ended', true), 'encerra';
  assert (pg_temp.ctx(biz)).ended_at is not null, 'ended_at marcado';
  assert (pg_temp.rec(pg_temp.id('wp2'))).paired_record_id is null and (pg_temp.rec(pg_temp.id('wb2'))).paired_record_id is null
     and (pg_temp.rec(pg_temp.id('wp2'))).version = 1, 'as retiradas ficam desligadas, sem mudar valor nem versão';
  assert (select count(*) from public.financial_contexts where id = biz) = 0, 'a Bia não lê mais o negócio encerrado';
  assert public.end_business(biz, 'ng-e-0001') = res, 'repetir depois de encerrar devolve o mesmo';
  r := public.update_record('ng-e-0002', pg_temp.id('wp2'), 1, pg_temp.id('pes_acc'), 1200, '2026-11-16', 'Pró-labore', 'Retirada do negócio');
  assert r.amount_cents = 1200, 'o recebimento do Pessoal se edita como qualquer outro';
  assert pg_temp.activity(pg_temp.id('bia'), biz) = 1, 'renomear e encerrar não contam como anotação';
  -- Encerrado o primeiro, pode criar outro.
  res := public.create_business('Conserto de ar-condicionado', 'ng-e-0003');
  perform pg_temp.keep('biz2', (res #>> '{context,id}')::uuid);
  assert res #>> '{context,name}' = 'Conserto de ar-condicionado', 'um novo negócio depois de encerrar o anterior';
end $$;

-- ---------------------------------------------------------------------------
-- 8. Só ver e exportar: criar e anotar no negócio são recusados; encerrar vale
-- ---------------------------------------------------------------------------
reset role;
update public.billing_settings set enforced_from = now() - interval '40 days';
update public.persons set created_at = now() - interval '60 days' where id = :bia;
set role authenticated;
select pg_temp.as_('bia');
select pg_temp.expect_code(format('select public.create_record(%L, %L, %L, %L, %s, %L, %L)', 'ng-l-0001', pg_temp.id('biz2'),
                                  (select id from public.financial_accounts where context_id = pg_temp.id('biz2')), 'receita', 1000, '2026-11-10', 'Conserto'),
                           'assinatura_necessaria', 'PT402');
select pg_temp.expect_code(format('select public.rename_business(%L, %L, %L)', pg_temp.id('biz2'), 'Outro', 'ng-l-0002'), 'assinatura_necessaria', 'PT402');
do $$ begin
  assert public.end_business(pg_temp.id('biz2'), 'ng-l-0003') ->> 'ended' = 'true', 'encerrar vale em só ver e exportar';
end $$;
select pg_temp.expect_code($q$select public.create_business('Mais um', 'ng-l-0004')$q$, 'assinatura_necessaria', 'PT402');
reset role;
update public.billing_settings set enforced_from = null;
set role authenticated;

-- ---------------------------------------------------------------------------
-- 9. Excluir a conta apaga o negócio (com a retirada) e o Pessoal
-- ---------------------------------------------------------------------------
select pg_temp.as_('duda');
do $$
declare
  space jsonb := public.ensure_personal_space('Conta principal');
  biz uuid;
  res jsonb;
begin
  perform pg_temp.keep('duda_pes', (space ->> 'context_id')::uuid);
  biz := (public.create_business('Marmitas da Duda', 'ng-d-0001') #>> '{context,id}')::uuid;
  perform pg_temp.keep('duda_biz', biz);
  perform public.create_record('ng-d-0002', biz, (select id from public.financial_accounts where context_id = biz), 'receita', 9000, '2026-11-10', 'Marmitas', 'Vendas');
  res := public.create_business_withdrawal('ng-d-0003', biz, (select id from public.financial_accounts where context_id = biz),
                                           (space #>> '{account,id}')::uuid, 4000, '2026-11-11');
  perform public.delete_my_account('EXCLUIR', 'ng-d-0004');
end $$;
reset role;
do $$ begin
  assert (select count(*) from public.financial_contexts where id in (pg_temp.id('duda_biz'), pg_temp.id('duda_pes'))) = 0, 'o negócio e o Pessoal saem';
  assert (select count(*) from public.financial_records where context_id in (pg_temp.id('duda_biz'), pg_temp.id('duda_pes'))) = 0, 'os lançamentos saem';
  assert (select count(*) from public.persons where id = pg_temp.id('duda')) = 0, 'a pessoa sai';
end $$;

-- ---------------------------------------------------------------------------
-- 10. A limpeza dos 6 meses apaga o negócio encerrado (o recebimento do Pessoal fica)
-- ---------------------------------------------------------------------------
do $$
declare
  r jsonb;
begin
  update public.financial_contexts set ended_at = now() - interval '7 months' where id = pg_temp.id('biz');
  r := public.clarevo_purge_deleted();
  assert (r ->> 'negocios')::int = 1 and (r ->> 'familias')::int = 0, 'um negócio apagado: ' || r::text;
  assert (select count(*) from public.financial_contexts where id = pg_temp.id('biz')) = 0
     and (select count(*) from public.financial_records where context_id = pg_temp.id('biz')) = 0, 'o negócio sai inteiro';
  assert (select deleted_at is null and paired_record_id is null and amount_cents = 1200 from public.financial_records where id = pg_temp.id('wp2')),
    'o recebimento da retirada continua no Pessoal';
  assert (select count(*) from public.financial_contexts where id = pg_temp.id('biz2')) = 1, 'o encerrado há pouco espera o prazo';
end $$;

rollback;
