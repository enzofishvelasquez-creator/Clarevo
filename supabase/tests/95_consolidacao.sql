-- CL-02 e T04 (docs/12): UMA compra de R$ 300,00 em 3 vezes, feita em 10/10/2026 no cartão que fecha dia 3 e vence dia 10, seguida por
-- todos os indicadores, mês a mês, nas funções e visões do banco que repetem as regras do core: month_totals (Recebido, Pago e
-- Diferença), month_to_pay (Ainda a pagar), month_committed (renda comprometida, valor e percentual, com o grupo Faturas),
-- month_budget (Orçado e Usado), invoice_items (fatura do mês), card_items (limite usado) e goal_items (guardado em metas). É o
-- mesmo cenário de packages/core/test/consolidacao.test.ts, com os mesmos números: cada coluna soma R$ 300,00 nos quatro meses
-- (outubro de 2026 a janeiro de 2027), sem dupla contagem; só o pagamento da fatura entra em Pago, na data do pagamento; o
-- orçamento conta a parcela k no mês da compra mais (k - 1). A regra da parcela e a do estorno seguem como estão (decisões
-- pendentes de Enzo). Nenhuma migração: só leitura das funções que já existem.
-- Pessoa FICTÍCIA: Lia (conta própria). Valores em centavos. Rodar depois das migrações (npm run test:db).
\set ON_ERROR_STOP 1
\set lia '''00000000-0000-0000-0000-0000000000a9'''

begin;
set local clarevo.today = '2026-10-10';

create temp table ids (name text primary key, id uuid);
grant select, insert on ids to authenticated;
create function pg_temp.id(p_name text) returns uuid language sql as $$ select id from ids where name = p_name $$;
create function pg_temp.today(p_day date) returns text language sql as $$
  select set_config('clarevo.today', to_char(p_day, 'YYYY-MM-DD'), true)
$$;
-- Confere agora as restrições adiadas (vínculos de contas e faturas). Sem isso, o rollback final nunca as dispararia.
create function pg_temp.check_links() returns void language plpgsql as $$
begin
  set constraints all immediate;
  set constraints all deferred;
end $$;

-- Uma linha com todos os indicadores do mês, em texto estável (a ordem é a da tabela do core):
-- recebido pago diferença aPagar comprometido comprometidoFaturas percentual(milésimos) usadoLazer faturaDoMês limiteUsado guardado
create function pg_temp.mes(p_month date) returns text language plpgsql as $$
declare
  v_ctx uuid := pg_temp.id('ctx');
  v_card uuid := pg_temp.id('card');
  v_goal uuid := pg_temp.id('goal');
  v_t record;
  v_c record;
begin
  select * into v_t from public.month_totals(v_ctx, p_month);
  select * into v_c from public.month_committed(v_ctx, p_month);
  return format('%s %s %s %s %s %s %s %s %s %s %s',
    v_t.received_cents, v_t.paid_cents, v_t.difference_cents,
    (select to_pay_cents from public.month_to_pay(v_ctx, p_month)),
    v_c.committed_cents, v_c.card_cents, coalesce(v_c.committed_permille::text, '-'),
    (select used_cents from public.month_budget(v_ctx, p_month) where category = 'Lazer'),
    coalesce((select total_cents from public.invoice_items where card_id = v_card and month = p_month), 0),
    (select used_cents from public.card_items where id = v_card),
    coalesce((select sum(case when m.kind = 'aporte' then m.amount_cents when m.kind = 'resgate' then -m.amount_cents else 0 end)
                from public.goal_movements m
               where m.goal_id = v_goal and m.deleted_at is null and date_trunc('month', m.occurred_on) = p_month), 0));
end $$;

insert into ids values ('lia', :lia);
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values (:lia, 'lia@exemplo.test', now(), '{"display_name":"Lia"}');

-- ---------------------------------------------------------------------------
-- Montagem: salário de outubro, renda de referência, orçamento de Lazer, cartão e uma meta.
-- ---------------------------------------------------------------------------
set role authenticated;
do $$
declare
  space jsonb;
  ctx uuid;
  acc uuid;
  card uuid;
  goal uuid;
begin
  perform set_config('request.jwt.claim.sub', pg_temp.id('lia')::text, true);
  space := public.ensure_personal_space('Conta principal');
  ctx := (space ->> 'context_id')::uuid;
  acc := (space #>> '{account,id}')::uuid;
  insert into ids values ('ctx', ctx), ('acc', acc);
  perform public.create_record('co-c-0001', ctx, acc, 'receita', 600000, '2026-10-01', 'Salário', 'Salário');
  perform public.set_income_reference('co-c-0002', ctx, '2026-10-01', 0, 600000, false);
  perform public.set_category_budget('co-c-0003', ctx, 'Lazer', '2026-10-01', 0, 30000);
  card := (public.create_card('co-c-0004', ctx, 'Nubank', '1234', 3, 10, 500000) #>> '{card,id}')::uuid;
  insert into ids values ('card', card);
  goal := (public.create_goal('co-c-0005', ctx, 'objetivo', 'Viagem', 600000, null, null, null, null, null, null, null) #>> '{goal,id}')::uuid;
  insert into ids values ('goal', goal);
end $$;

-- ---------------------------------------------------------------------------
-- 1. Antes da compra: só o salário (Recebido R$ 6.000,00 em outubro), nada mais.
-- ---------------------------------------------------------------------------
do $$
begin
  perform set_config('request.jwt.claim.sub', pg_temp.id('lia')::text, true);
  assert pg_temp.mes('2026-10-01') = '600000 0 600000 0 0 0 0 0 0 0 0', 'outubro antes da compra: ' || pg_temp.mes('2026-10-01');
  assert pg_temp.mes('2026-11-01') = '0 0 0 0 0 0 0 0 0 0 0', 'novembro antes da compra: ' || pg_temp.mes('2026-11-01');
end $$;

-- ---------------------------------------------------------------------------
-- 2. A compra de 10/10 em 3x: orçamento, fatura, Ainda a pagar e renda comprometida somam R$ 300,00; Pago, Recebido e Diferença não mudam.
-- ---------------------------------------------------------------------------
do $$
declare
  card uuid := pg_temp.id('card');
begin
  perform set_config('request.jwt.claim.sub', pg_temp.id('lia')::text, true);
  perform public.add_card_purchase('co-c-0010', card, '2026-10-10', 30000, 3, 'Show', 'Lazer');
  perform pg_temp.check_links();
  -- Colunas: recebido pago diferença aPagar comprometido faturas ‰ usadoLazer fatura limiteUsado guardado.
  -- Outubro: o usado de Lazer é a parcela 1 (R$ 100,00); a fatura de outubro (fechou em 03/10) não tem nada.
  assert pg_temp.mes('2026-10-01') = '600000 0 600000 0 0 0 0 10000 0 30000 0', 'outubro: ' || pg_temp.mes('2026-10-01');
  -- Novembro a janeiro: a parcela na fatura (vence dia 10), em Ainda a pagar e na renda comprometida (10.000 de 600.000 = 1,7%).
  assert pg_temp.mes('2026-11-01') = '0 0 0 10000 10000 10000 17 10000 10000 30000 0', 'novembro: ' || pg_temp.mes('2026-11-01');
  assert pg_temp.mes('2026-12-01') = '0 0 0 10000 10000 10000 17 10000 10000 30000 0', 'dezembro: ' || pg_temp.mes('2026-12-01');
  assert pg_temp.mes('2027-01-01') = '0 0 0 10000 10000 10000 17 0 10000 30000 0', 'janeiro: parcela 3 só na fatura; o orçamento termina em dezembro: ' || pg_temp.mes('2027-01-01');
  -- As somas: orçamento (Lazer), faturas, Ainda a pagar e comprometido fecham em R$ 300,00 nos quatro meses.
  assert (select sum(used_cents) from generate_series('2026-10-01'::date, '2027-01-01'::date, interval '1 month') m,
            lateral public.month_budget(pg_temp.id('ctx'), m::date) b where b.category = 'Lazer') = 30000, 'orçamento soma R$ 300,00';
  assert (select sum(total_cents) from public.invoice_items where card_id = card) = 30000, 'faturas somam R$ 300,00';
  assert (select sum(to_pay_cents) from generate_series('2026-10-01'::date, '2027-01-01'::date, interval '1 month') m,
            lateral public.month_to_pay(pg_temp.id('ctx'), m::date)) = 30000, 'Ainda a pagar soma R$ 300,00';
  assert (select sum(committed_cents) from generate_series('2026-10-01'::date, '2027-01-01'::date, interval '1 month') m,
            lateral public.month_committed(pg_temp.id('ctx'), m::date)) = 30000, 'comprometido soma R$ 300,00';
  -- O mês da fatura é o da conta a pagar da fatura; a categoria não vai para o gasto (só existe gasto no pagamento).
  assert (select count(*) from public.financial_records where context_id = pg_temp.id('ctx') and kind = 'despesa') = 0, 'nenhum gasto antes de pagar';
end $$;

-- ---------------------------------------------------------------------------
-- 3. Aporte na meta: só o guardado de outubro muda.
-- ---------------------------------------------------------------------------
do $$
declare
  before_nov text;
begin
  perform set_config('request.jwt.claim.sub', pg_temp.id('lia')::text, true);
  before_nov := pg_temp.mes('2026-11-01');
  perform public.add_goal_movement('co-c-0020', pg_temp.id('goal'), 'aporte', 10000, '2026-10-10', null);
  assert pg_temp.mes('2026-10-01') = '600000 0 600000 0 0 0 0 10000 0 30000 10000', 'outubro com o aporte: só o guardado mudou: ' || pg_temp.mes('2026-10-01');
  assert pg_temp.mes('2026-11-01') = before_nov, 'o aporte não muda novembro';
end $$;

-- ---------------------------------------------------------------------------
-- 4. Pagando cada fatura no vencimento (10/11, 10/12 e 10/01): só então entra em Pago; o orçamento e a renda comprometida não mudam.
-- ---------------------------------------------------------------------------
do $$
declare
  card uuid := pg_temp.id('card');
  acc uuid := pg_temp.id('acc');
begin
  perform set_config('request.jwt.claim.sub', pg_temp.id('lia')::text, true);
  perform pg_temp.today('2026-11-10');
  perform public.pay_invoice('co-c-0030', card, '2026-11-01', (select commitment_version from public.invoice_items where card_id = card and month = '2026-11-01'), 10000, '2026-11-10');
  perform pg_temp.check_links();
  assert pg_temp.mes('2026-11-01') = '0 10000 -10000 0 10000 10000 17 10000 10000 20000 0', 'novembro pago: ' || pg_temp.mes('2026-11-01');
  assert pg_temp.mes('2026-12-01') = '0 0 0 10000 10000 10000 17 10000 10000 20000 0', 'dezembro intacto: ' || pg_temp.mes('2026-12-01');

  perform pg_temp.today('2026-12-10');
  perform public.pay_invoice('co-c-0031', card, '2026-12-01', (select commitment_version from public.invoice_items where card_id = card and month = '2026-12-01'), 10000, '2026-12-10');
  perform pg_temp.today('2027-01-10');
  perform public.pay_invoice('co-c-0032', card, '2027-01-01', (select commitment_version from public.invoice_items where card_id = card and month = '2027-01-01'), 10000, '2027-01-10');
  perform pg_temp.check_links();
  assert pg_temp.mes('2026-12-01') = '0 10000 -10000 0 10000 10000 17 10000 10000 0 0', 'dezembro pago: ' || pg_temp.mes('2026-12-01');
  assert pg_temp.mes('2027-01-01') = '0 10000 -10000 0 10000 10000 17 0 10000 0 0', 'janeiro pago: ' || pg_temp.mes('2027-01-01');
  -- A soma de Pago nos quatro meses é R$ 300,00 e o orçamento de Lazer não mudou com os pagamentos.
  assert (select sum(paid_cents) from generate_series('2026-10-01'::date, '2027-01-01'::date, interval '1 month') m,
            lateral public.month_totals(pg_temp.id('ctx'), m::date)) = 30000, 'Pago soma R$ 300,00';
  assert (select sum(used_cents) from generate_series('2026-10-01'::date, '2027-01-01'::date, interval '1 month') m,
            lateral public.month_budget(pg_temp.id('ctx'), m::date) b where b.category = 'Lazer') = 30000, 'o orçamento continua somando R$ 300,00';
  -- Cada pagamento é um gasto sem categoria, na data do pagamento (o orçamento nunca o conta).
  assert (select count(*) from public.financial_records where context_id = pg_temp.id('ctx') and kind = 'despesa' and category is null and card_id is not null) = 3,
    'três gastos de pagamento de fatura, sem categoria';
  assert acc is not null;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Pagamento parcial de R$ 50,00 da fatura de dezembro (outra compra, outra montagem): o resto vira saldo anterior em janeiro.
-- ---------------------------------------------------------------------------
reset role;
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
  values ('00000000-0000-0000-0000-0000000000b9', 'beto@exemplo.test', now(), '{"display_name":"Beto"}');
insert into ids values ('beto', '00000000-0000-0000-0000-0000000000b9');
set role authenticated;
do $$
declare
  space jsonb;
  ctx uuid;
  card uuid;
  v int;
begin
  perform set_config('request.jwt.claim.sub', pg_temp.id('beto')::text, true);
  perform pg_temp.today('2026-10-10');
  space := public.ensure_personal_space('Conta principal');
  ctx := (space ->> 'context_id')::uuid;
  card := (public.create_card('cp-c-0001', ctx, 'Nubank', '1234', 3, 10, 500000) #>> '{card,id}')::uuid;
  perform public.add_card_purchase('cp-c-0002', card, '2026-10-10', 30000, 3, 'Show', 'Lazer');
  perform pg_temp.today('2026-11-10');
  select commitment_version into v from public.invoice_items where card_id = card and month = '2026-11-01';
  perform public.pay_invoice('cp-c-0003', card, '2026-11-01', v, 10000, '2026-11-10');
  perform pg_temp.today('2026-12-10');
  select commitment_version into v from public.invoice_items where card_id = card and month = '2026-12-01';
  perform public.pay_invoice('cp-c-0004', card, '2026-12-01', v, 5000, '2026-12-10');
  perform pg_temp.check_links();
  -- Pago: novembro R$ 100,00 e dezembro R$ 50,00; janeiro vira R$ 150,00 (parcela 3 e saldo anterior de R$ 50,00).
  assert (select paid_cents from public.month_totals(ctx, '2026-11-01')) = 10000 and (select paid_cents from public.month_totals(ctx, '2026-12-01')) = 5000,
    'Pago: 100,00 em novembro e 50,00 em dezembro';
  assert (select total_cents from public.invoice_items where card_id = card and month = '2027-01-01') = 15000, 'janeiro: 150,00 com o saldo anterior';
  assert (select status from public.invoice_items where card_id = card and month = '2026-12-01') = 'paga_em_parte', 'a fatura de dezembro é "paga em parte"';
  -- Renda comprometida: a fatura paga em parte conta pelo valor pago (R$ 50,00), e janeiro, pelo total de R$ 150,00: a soma segue R$ 300,00.
  assert (select committed_cents from public.month_committed(ctx, '2026-11-01')) = 10000
     and (select committed_cents from public.month_committed(ctx, '2026-12-01')) = 5000
     and (select committed_cents from public.month_committed(ctx, '2027-01-01')) = 15000, 'comprometido: 100,00, 50,00 e 150,00';
  -- O orçamento não muda: o saldo anterior não é compra e o pagamento da fatura não conta.
  assert (select array_agg(used_cents order by m) from generate_series('2026-10-01'::date, '2027-01-01'::date, interval '1 month') m,
            lateral public.month_budget(ctx, m::date) b where b.category = 'Lazer') = array[10000, 10000, 10000, 0]::bigint[], 'orçamento intacto';
end $$;

reset role;
select pg_temp.check_links();

rollback;
