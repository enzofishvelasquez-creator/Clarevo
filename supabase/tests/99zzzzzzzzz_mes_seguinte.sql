-- Recebimento do fim do mês que conta no mês seguinte (D-089 A; migração 0030): financial_records.next_month e counted_month,
-- create_record e update_record com p_next_month, e os totais por mês (month_totals, months_overview, set_month_check) pelo mês em
-- que o registro conta. Confere: as colunas, a restrição e o índice; as assinaturas novas (as antigas saíram) e os privilégios; a
-- janela dos últimos 7 dias (outubro, fevereiro); só recebimento; a chave sem o mês seguinte igual à de antes; a edição (nulo mantém
-- a marca enquanto a data cabe; true e false explícitos); os totais de outubro e novembro; a marca "Conferi este mês".
-- Pessoa FICTÍCIA: Rui. Tudo em uma transação desfeita no fim.
\set ON_ERROR_STOP 1
\set rui '''00000000-0000-0000-0000-0000000000d1'''

begin;
set local clarevo.today = '2026-11-09';

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

-- ---------------------------------------------------------------------------
-- 1. Esquema: colunas, restrição, índice, assinaturas e privilégios
-- ---------------------------------------------------------------------------
do $$ begin
  assert exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'financial_records'
                   and column_name = 'next_month' and data_type = 'boolean' and is_nullable = 'NO' and column_default = 'false'), 'a coluna next_month';
  assert exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'financial_records'
                   and column_name = 'counted_month' and data_type = 'date' and is_generated = 'ALWAYS'), 'a coluna gerada counted_month';
  assert exists (select 1 from pg_constraint where conname = 'financial_records_mes_seguinte'), 'a restrição do mês seguinte';
  assert exists (select 1 from pg_indexes where schemaname = 'public' and tablename = 'financial_records' and indexname = 'financial_records_ctx_counted'
                   and indexdef like '%(context_id, counted_month)%'), 'o índice do mês em que conta';
  assert to_regprocedure('public.create_record(text, uuid, uuid, public.record_kind, bigint, date, text, text, text)') is null
     and to_regprocedure('public.update_record(text, uuid, integer, uuid, bigint, date, text, text)') is null, 'as assinaturas antigas saíram';
  assert has_function_privilege('authenticated', 'public.create_record(text, uuid, uuid, public.record_kind, bigint, date, text, text, text, boolean)', 'execute')
     and has_function_privilege('authenticated', 'public.update_record(text, uuid, integer, uuid, bigint, date, text, text, boolean)', 'execute'), 'o app cria e edita';
  assert not has_function_privilege('anon', 'public.create_record(text, uuid, uuid, public.record_kind, bigint, date, text, text, text, boolean)', 'execute')
     and not has_function_privilege('anon', 'public.update_record(text, uuid, integer, uuid, bigint, date, text, text, boolean)', 'execute'), 'anon não';
  assert not has_function_privilege('authenticated', 'public.clarevo_next_month_allowed(date)', 'execute')
     and not has_function_privilege('authenticated', 'public.clarevo_check_next_month(public.record_kind, date, boolean)', 'execute'), 'auxiliares fechadas';
  -- A janela: os últimos 7 dias do mês.
  assert public.clarevo_next_month_allowed('2026-10-25') and public.clarevo_next_month_allowed('2026-10-31')
     and not public.clarevo_next_month_allowed('2026-10-24'), 'outubro: 25 a 31';
  assert public.clarevo_next_month_allowed('2026-09-24') and not public.clarevo_next_month_allowed('2026-09-23'), 'setembro: 24 a 30';
  assert public.clarevo_next_month_allowed('2026-02-22') and not public.clarevo_next_month_allowed('2026-02-21'), 'fevereiro comum: 22 a 28';
  assert public.clarevo_next_month_allowed('2028-02-23') and not public.clarevo_next_month_allowed('2028-02-22'), 'fevereiro de ano bissexto: 23 a 29';
end $$;

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
  values (:rui, 'rui@exemplo.test', now(), '{"display_name":"Rui"}');

set role authenticated;
select set_config('request.jwt.claim.sub', :rui, true);

-- ---------------------------------------------------------------------------
-- 2. Criar: salário de 30/10 que conta em novembro
-- ---------------------------------------------------------------------------
do $$
declare
  space jsonb := public.ensure_personal_space('Conta principal');
  ctx uuid := (space ->> 'context_id')::uuid;
  acc uuid := (space #>> '{account,id}')::uuid;
  sal public.financial_records;
  again public.financial_records;
  t record;
  o record;
begin
  perform set_config('test.ctx', ctx::text, true);
  perform set_config('test.acc', acc::text, true);
  perform public.create_record('ms-base-001', ctx, acc, 'despesa', 150000, '2026-10-05', 'Aluguel');
  perform public.create_record('ms-base-002', ctx, acc, 'receita', 20000, '2026-10-10', 'Freela');
  sal := public.create_record('ms-sal-0001', ctx, acc, 'receita', 600000, '2026-10-30', 'Salário', 'Salário', null, true);
  assert sal.next_month and sal.counted_month = '2026-11-01' and sal.occurred_on = '2026-10-30', 'marcado, conta em novembro, a data não muda';
  -- Repetir com a mesma chave devolve o mesmo; a mesma chave sem o mês seguinte é outro conteúdo.
  again := public.create_record('ms-sal-0001', ctx, acc, 'receita', 600000, '2026-10-30', 'Salário', 'Salário', null, true);
  assert again.id = sal.id, 'repetição devolve o mesmo registro';
  perform pg_temp.expect_code(format('select public.create_record(%L, %L, %L, %L, %s, %L, %L, %L)', 'ms-sal-0001', ctx, acc, 'receita', 600000, '2026-10-30', 'Salário', 'Salário'),
                              'chave_reutilizada', 'PT409');
  -- Sem o mês seguinte (o app antigo), conta no mês da data, como antes; false explícito é o mesmo conteúdo da chave de antes.
  again := public.create_record('ms-old-0001', ctx, acc, 'receita', 5000, '2026-10-31', 'Reembolso', 'Reembolso');
  assert not again.next_month and again.counted_month = '2026-10-01', 'sem o campo: mês da data';
  assert (public.create_record('ms-old-0001', ctx, acc, 'receita', 5000, '2026-10-31', 'Reembolso', 'Reembolso', null, false)).id = again.id,
    'false explícito repete a chave de antes';
  -- Totais: outubro sem o salário, novembro com ele.
  select * into t from public.month_totals(ctx, '2026-10-01');
  assert (t.received_cents, t.paid_cents) = (25000::bigint, 150000::bigint), 'outubro: 250 recebidos (freela e reembolso), 1.500 pagos: ' || t::text;
  select * into t from public.month_totals(ctx, '2026-11-01');
  assert (t.received_cents, t.paid_cents) = (600000::bigint, 0::bigint), 'novembro: o salário';
  select * into o from public.months_overview(ctx, '2026-10-01', '2026-11-01') where month = '2026-11-01';
  assert (o.received_count, o.received_cents) = (1, 600000::bigint), 'months_overview de novembro conta o salário';
  select * into o from public.months_overview(ctx, '2026-10-01', '2026-11-01') where month = '2026-10-01';
  assert (o.received_count, o.received_cents) = (2, 25000::bigint), 'months_overview de outubro não';
  -- Recusas: gasto, data fora da janela, fevereiro fora da janela; nada gravado.
  perform pg_temp.expect_code(format('select public.create_record(%L, %L, %L, %L, %s, %L, %L, null, null, true)', 'ms-bad-0001', ctx, acc, 'despesa', 100, '2026-10-30', 'Mercado'),
                              'mes_seguinte_invalido', '22023');
  perform pg_temp.expect_code(format('select public.create_record(%L, %L, %L, %L, %s, %L, %L, null, null, true)', 'ms-bad-0002', ctx, acc, 'receita', 100, '2026-10-24', 'Freela'),
                              'mes_seguinte_invalido', '22023');
  perform pg_temp.expect_code(format('select public.create_record(%L, %L, %L, %L, %s, %L, %L, null, null, true)', 'ms-bad-0003', ctx, acc, 'receita', 100, '2026-02-21', 'Freela'),
                              'mes_seguinte_invalido', '22023');
  assert (public.create_record('ms-fev-0001', ctx, acc, 'receita', 100, '2026-02-22', 'Freela de fevereiro', null, null, true)).counted_month = '2026-03-01',
    '22/02/2026 conta em março';
  -- Data futura continua recusada antes do mês seguinte.
  perform pg_temp.expect_code(format('select public.create_record(%L, %L, %L, %L, %s, %L, %L, null, null, true)', 'ms-bad-0004', ctx, acc, 'receita', 100, '2026-11-30', 'Futuro'),
                              'data_futura', '22023');
  assert not exists (select 1 from public.financial_records where description in ('Mercado', 'Futuro') or (description = 'Freela' and amount_cents = 100)), 'nada das recusas';
  -- Dezembro conta em janeiro do ano seguinte (a virada de ano).
  assert (select (occurred_on - (extract(day from occurred_on)::int - 1) + interval '1 month')::date from (select date '2025-12-31' as occurred_on) x) = '2026-01-01',
    'a expressão da coluna vira o ano';
end $$;

-- ---------------------------------------------------------------------------
-- 3. "Conferi este mês": outubro sem recebimento além dos que contam lá; novembro tem o salário
-- ---------------------------------------------------------------------------
do $$
declare
  ctx uuid := current_setting('test.ctx')::uuid;
  acc uuid := current_setting('test.acc')::uuid;
  r public.financial_records;
  o record;
  res jsonb;
begin
  for r in select * from public.financial_records where context_id = ctx and kind = 'receita' and counted_month = '2026-10-01' loop
    perform public.delete_record('ms-del-' || left(r.id::text, 8), r.id, r.version);
  end loop;
  res := public.set_month_check(ctx, '2026-10-01', 'recebimentos', 'ms-chk-0001', 0);
  assert (res ->> 'checked')::boolean, 'outubro marcado: o salário de 30/10 conta em novembro: ' || res::text;
  select * into o from public.months_overview(ctx, '2026-10-01', '2026-11-01') where month = '2026-10-01';
  assert o.received_checked and o.received_count = 0, 'outubro conferido e sem recebimento';
end $$;

-- ---------------------------------------------------------------------------
-- 4. Editar: nulo mantém a marca enquanto a data cabe; true e false explícitos
-- ---------------------------------------------------------------------------
do $$
declare
  ctx uuid := current_setting('test.ctx')::uuid;
  acc uuid := current_setting('test.acc')::uuid;
  sal public.financial_records;
  o record;
  t record;
begin
  select * into sal from public.financial_records where context_id = ctx and description = 'Salário';
  -- O app antigo (sem p_next_month), mudando o valor e a data para 31/10: a marca fica.
  sal := public.update_record('ms-upd-0001', sal.id, sal.version, acc, 610000, '2026-10-31', 'Salário', 'Salário');
  assert sal.next_month and sal.counted_month = '2026-11-01' and sal.amount_cents = 610000, 'nulo mantém a marca dentro da janela';
  -- false explícito: volta a contar em outubro, e a marca "Conferi" de outubro deixa de valer (o mês tem recebimento).
  sal := public.update_record('ms-upd-0002', sal.id, sal.version, acc, 610000, '2026-10-31', 'Salário', 'Salário', false);
  assert not sal.next_month and sal.counted_month = '2026-10-01', 'false explícito: mês da data';
  select * into o from public.months_overview(ctx, '2026-10-01', '2026-11-01') where month = '2026-10-01';
  assert not o.received_checked and (o.received_count, o.received_cents) = (1, 610000::bigint), 'outubro com o salário, sem a marca valendo';
  -- true explícito de novo; depois a data sai da janela com nulo: a marca cai em silêncio.
  sal := public.update_record('ms-upd-0003', sal.id, sal.version, acc, 610000, '2026-10-31', 'Salário', 'Salário', true);
  assert sal.next_month, 'true explícito';
  sal := public.update_record('ms-upd-0004', sal.id, sal.version, acc, 610000, '2026-10-15', 'Salário', 'Salário');
  assert not sal.next_month and sal.counted_month = '2026-10-01', 'nulo com a data fora da janela: a marca cai';
  -- Nulo com a data na janela de outro mês: a marca cai (o app antigo não a mostra e diria outro mês).
  sal := public.update_record('ms-upd-0041', sal.id, sal.version, acc, 610000, '2026-10-30', 'Salário', 'Salário', true);
  assert sal.next_month and sal.counted_month = '2026-11-01', 'marcado de novo';
  sal := public.update_record('ms-upd-0042', sal.id, sal.version, acc, 610000, '2026-09-28', 'Salário', 'Salário');
  assert not sal.next_month and sal.counted_month = '2026-09-01', 'nulo, data na janela de setembro: a marca cai';
  sal := public.update_record('ms-upd-0043', sal.id, sal.version, acc, 610000, '2026-10-15', 'Salário', 'Salário');
  -- true explícito fora da janela: recusado, nada muda.
  perform pg_temp.expect_code(format('select public.update_record(%L, %L, %s, %L, %s, %L, %L, %L, true)', 'ms-upd-0005', sal.id, sal.version, acc, 610000, '2026-10-15', 'Salário', 'Salário'),
                              'mes_seguinte_invalido', '22023');
  -- Gasto: true recusado.
  select * into sal from public.financial_records where context_id = ctx and description = 'Aluguel';
  perform pg_temp.expect_code(format('select public.update_record(%L, %L, %s, %L, %s, %L, %L, null, true)', 'ms-upd-0006', sal.id, sal.version, acc, 150000, '2026-10-30', 'Aluguel'),
                              'mes_seguinte_invalido', '22023');
  -- A mesma chave de edição com e sem o campo é outro conteúdo.
  select * into sal from public.financial_records where context_id = ctx and description = 'Salário';
  perform public.update_record('ms-upd-0007', sal.id, sal.version, acc, 610000, '2026-10-29', 'Salário', 'Salário', true);
  perform pg_temp.expect_code(format('select public.update_record(%L, %L, %s, %L, %s, %L, %L, %L)', 'ms-upd-0007', sal.id, sal.version, acc, 610000, '2026-10-29', 'Salário', 'Salário'),
                              'chave_reutilizada', 'PT409');
  select * into t from public.month_totals(ctx, '2026-11-01');
  assert t.received_cents = 610000, 'novembro com o salário de novo';
end $$;

-- ---------------------------------------------------------------------------
-- 5. A restrição vale também fora das funções
-- ---------------------------------------------------------------------------
reset role;
do $$
declare
  ctx uuid := current_setting('test.ctx')::uuid;
  acc uuid := current_setting('test.acc')::uuid;
begin
  begin
    insert into public.financial_records (context_id, account_id, kind, amount_cents, currency, occurred_on, description, created_by, next_month)
    values (ctx, acc, 'despesa', 100, 'BRL', '2026-10-30', 'Direto', '00000000-0000-0000-0000-0000000000d1', true);
    raise exception 'FALHA: gasto com mês seguinte entrou';
  exception when check_violation then null;
  end;
  begin
    insert into public.financial_records (context_id, account_id, kind, amount_cents, currency, occurred_on, description, created_by, next_month)
    values (ctx, acc, 'receita', 100, 'BRL', '2026-10-20', 'Direto', '00000000-0000-0000-0000-0000000000d1', true);
    raise exception 'FALHA: recebimento fora da janela entrou';
  exception when check_violation then null;
  end;
end $$;

rollback;
