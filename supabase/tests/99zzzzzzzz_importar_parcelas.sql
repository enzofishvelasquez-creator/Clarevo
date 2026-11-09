-- Importar a fatura com as compras parceladas em andamento (D-089 B; migração 0029): a linha com a parcela escrita ("LOJA 03/10")
-- vira a compra com as parcelas que faltam (installment_offset guarda as que já passaram), na fatura em que a parcela entra e nas
-- seguintes; update_card_entry carrega o deslocamento e recusa passar de 48 no total; a visão card_entry_items e o retorno das funções
-- trazem o deslocamento. Confere: a coluna e a restrição, a importação (meses, numeração, total, chave só na primeira, cap, fatura
-- paga, números fora da faixa), a regra da fatura quando a data é a da cobrança, a edição e a leitura pelo app.
-- Pessoa FICTÍCIA: Olga (Pessoal, com um cartão que fecha dia 3 e vence dia 10). Hoje é 07/10/2026. Tudo em uma transação desfeita no fim.
\set ON_ERROR_STOP 1
\set olga '''00000000-0000-0000-0000-0000000000d1'''

begin;
set local clarevo.today = '2026-10-07';

create function pg_temp.expect_code(p_sql text, p_code text, p_state text, p_detail text default '') returns void language plpgsql as $$
declare
  v_detail text;
begin
  begin
    execute p_sql;
  exception when others then
    get stacked diagnostics v_detail = pg_exception_detail;
    if sqlerrm = p_code and sqlstate = p_state and (p_detail = '' or v_detail = p_detail) then return; end if;
    raise exception 'esperado % (%, %), veio "%" (%, %) em: %', p_code, p_state, p_detail, sqlerrm, sqlstate, v_detail, left(p_sql, 300);
  end;
  raise exception 'esperado erro %, mas passou: %', p_code, left(p_sql, 300);
end $$;

create temp table ids (name text primary key, id uuid);
grant select, insert on ids to authenticated, anon, service_role;
create function pg_temp.id(p_name text) returns uuid language sql as $$ select id from ids where name = p_name $$;
create function pg_temp.as_(p_name text) returns text language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(pg_temp.id(p_name)::text, ''), true)
$$;
create function pg_temp.k(p_name text) returns text language sql immutable as $$ select encode(sha256(convert_to('parcelas:' || p_name, 'UTF8')), 'hex') $$;
create function pg_temp.it(p_key text, p_kind text, p_amount bigint, p_on date, p_desc text, p_cat text default null, p_k int default null, p_n int default null)
returns jsonb language sql as $$
  select jsonb_build_object('import_key', pg_temp.k(p_key), 'kind', p_kind, 'amount_cents', p_amount, 'occurred_on', p_on, 'description', p_desc, 'category', p_cat)
         || case when p_k is null and p_n is null then '{}'::jsonb else jsonb_build_object('installment_number', p_k, 'installment_count', p_n) end
$$;
create function pg_temp.imp(p_key text, p_ctx uuid, p_target uuid, p_items jsonb) returns text language sql as $$
  select format('select public.import_records(%L, %L, %L, %L, %L::jsonb)', p_key, p_ctx, 'cartao', p_target, p_items::text)
$$;
-- Lançamentos do cartão: "fatura parcela/total deslocamento valor descrição chave?" por linha, em ordem.
create function pg_temp.rows_of(p_card text, p_desc text) returns text language sql security definer set search_path = public, pg_temp as $$
  select string_agg(format('%s %s/%s +%s %s %s', to_char(invoice_month, 'YYYY-MM'), installment_number, installment_total, installment_offset, amount_cents,
                           case when import_key is null then '-' else 'k' end), ' | ' order by installment_number)
    from public.card_entries where card_id = pg_temp.id(p_card) and description = p_desc and deleted_at is null
$$;
create function pg_temp.purchase(p_card text, p_desc text) returns public.card_entries language sql security definer set search_path = public, pg_temp as $$
  select e from public.card_entries e where e.card_id = pg_temp.id(p_card) and e.description = p_desc and e.deleted_at is null and e.id = e.purchase_id
$$;

insert into ids values ('olga', :olga);
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values (:olga, 'olga@exemplo.test', now(), '{"display_name":"Olga"}');

set role authenticated;
select pg_temp.as_('olga');
do $$
declare
  space jsonb;
begin
  space := public.ensure_personal_space('Conta principal');
  insert into ids values ('ctx', (space ->> 'context_id')::uuid);
  insert into ids values ('card', (public.create_card('pa-c-0001', pg_temp.id('ctx'), 'Cartão Exemplo', null, 3, 10, 500000) #>> '{card,id}')::uuid);
end $$;

-- ---------------------------------------------------------------------------
-- 1. Esquema: a coluna, a restrição e a visão.
-- ---------------------------------------------------------------------------
do $$ begin
  assert exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'card_entries' and column_name = 'installment_offset'
                  and column_default = '0' and is_nullable = 'NO'), 'installment_offset, obrigatória, padrão 0';
  assert exists (select 1 from pg_constraint where conname = 'card_entries_deslocamento'), 'a restrição do deslocamento';
  assert exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'card_entry_items' and column_name = 'installment_offset'),
    'a visão traz o deslocamento';
end $$;

-- ---------------------------------------------------------------------------
-- 2. Importar: a parcela 3 de 10 entra com as 8 que faltam; a última, uma só; a data da cobrança cai na fatura natural.
-- ---------------------------------------------------------------------------
do $$
declare
  res jsonb;
  e public.card_entries;
begin
  res := public.import_records('pa-i-0001', pg_temp.id('ctx'), 'cartao', pg_temp.id('card'), jsonb_build_array(
    -- Compra original de 15/07 (fatura de agosto): a parcela 3 cai em outubro, e as outras 7 até maio de 2027.
    pg_temp.it('m3', 'compra', 12000, '2026-07-15', 'Loja de móveis 03/10', 'Lazer', 3, 10),
    -- Última parcela: uma linha só, na fatura de outubro.
    pg_temp.it('u3', 'compra', 5000, '2026-10-02', 'Papelaria 03/03', null, 3, 3),
    -- Data da cobrança (02/10, fatura de outubro) com a parcela 3 de 10: dezembro passa da próxima fatura, então entra em outubro.
    pg_temp.it('t3', 'compra', 2000, '2026-10-02', 'Tênis 03/10', null, 3, 10),
    -- Sem parcela escrita: à vista, como antes.
    pg_temp.it('cf', 'compra', 800, '2026-10-02', 'Café', null)));
  assert res = '{"created": 4, "skipped": 0}'::jsonb, 'quatro criados: ' || res::text;
  assert pg_temp.rows_of('card', 'Loja de móveis 03/10') =
    '2026-10 1/8 +2 12000 k | 2026-11 2/8 +2 12000 - | 2026-12 3/8 +2 12000 - | 2027-01 4/8 +2 12000 - | 2027-02 5/8 +2 12000 - | 2027-03 6/8 +2 12000 - | 2027-04 7/8 +2 12000 - | 2027-05 8/8 +2 12000 -',
    'as 8 parcelas que faltam, de outubro a maio, numeradas de 1 a 8 com deslocamento 2, a chave só na primeira: ' || pg_temp.rows_of('card', 'Loja de móveis 03/10');
  e := pg_temp.purchase('card', 'Loja de móveis 03/10');
  assert e.purchase_total_cents = 96000 and e.purchased_on = '2026-07-15' and e.installment_total = 8 and e.installment_offset = 2, 'total das que faltam, data da compra original';
  assert pg_temp.rows_of('card', 'Papelaria 03/03') = '2026-10 1/1 +2 5000 k', 'a última parcela, sozinha, com deslocamento 2';
  assert pg_temp.rows_of('card', 'Tênis 03/10') = '2026-10 1/8 +2 2000 k | 2026-11 2/8 +2 2000 - | 2026-12 3/8 +2 2000 - | 2027-01 4/8 +2 2000 - | 2027-02 5/8 +2 2000 - | 2027-03 6/8 +2 2000 - | 2027-04 7/8 +2 2000 - | 2027-05 8/8 +2 2000 -',
    'com a data da cobrança, a parcela entra na fatura natural (outubro)';
  assert pg_temp.rows_of('card', 'Café') = '2026-10 1/1 +0 800 k', 'à vista, sem deslocamento';
  -- As faturas: outubro 19.800 (12.000 + 5.000 + 2.000 + 800), novembro a maio 14.000.
  assert (select array_agg(amount_cents order by invoice_month) from public.commitments where card_id = pg_temp.id('card') and deleted_at is null)
       = array[19800, 14000, 14000, 14000, 14000, 14000, 14000, 14000]::bigint[], 'as faturas de outubro a maio';
  -- A visão do app: a compra como um lançamento, com o deslocamento e o total das que faltam.
  assert (select (installments, installment_offset::int, amount_cents, to_char(invoice_month, 'YYYY-MM')) from public.card_entry_items where description = 'Loja de móveis 03/10')
       = (8, 2, 96000::bigint, '2026-10'::text), 'a visão traz 8 parcelas, deslocamento 2, total e a fatura da primeira guardada';
  assert (select count(*) from public.card_entry_items where card_id = pg_temp.id('card')) = 4, 'uma linha por compra na visão';
  -- Repetição: tudo pulado (a chave fica só na primeira parcela).
  assert public.import_records('pa-i-0002', pg_temp.id('ctx'), 'cartao', pg_temp.id('card'), jsonb_build_array(pg_temp.it('m3', 'compra', 12000, '2026-07-15', 'Loja de móveis 03/10', 'Lazer', 3, 10)))
       = '{"created": 0, "skipped": 1}'::jsonb, 'a mesma linha de novo é pulada';
end $$;

-- ---------------------------------------------------------------------------
-- 3. Recusas: números fora da faixa ou só um dos dois; fatura paga em qualquer parcela que falta; o lote inteiro volta.
-- ---------------------------------------------------------------------------
select pg_temp.expect_code(pg_temp.imp('pa-i-0010', pg_temp.id('ctx'), pg_temp.id('card'), jsonb_build_array(pg_temp.it('x1', 'compra', 100, '2026-10-02', 'X', null, 0, 3))), 'parcelas_invalidas', '22023', 'item=1');
select pg_temp.expect_code(pg_temp.imp('pa-i-0011', pg_temp.id('ctx'), pg_temp.id('card'), jsonb_build_array(pg_temp.it('x1', 'compra', 100, '2026-10-02', 'X', null, 4, 3))), 'parcelas_invalidas', '22023', 'item=1');
select pg_temp.expect_code(pg_temp.imp('pa-i-0012', pg_temp.id('ctx'), pg_temp.id('card'), jsonb_build_array(pg_temp.it('x1', 'compra', 100, '2026-10-02', 'X', null, 1, 1))), 'parcelas_invalidas', '22023', 'item=1');
select pg_temp.expect_code(pg_temp.imp('pa-i-0013', pg_temp.id('ctx'), pg_temp.id('card'), jsonb_build_array(pg_temp.it('x1', 'compra', 100, '2026-10-02', 'X', null, 1, 49))), 'parcelas_invalidas', '22023', 'item=1');
select pg_temp.expect_code(pg_temp.imp('pa-i-0014', pg_temp.id('ctx'), pg_temp.id('card'), jsonb_build_array(pg_temp.it('x1', 'compra', 100, '2026-10-02', 'X', null) || '{"installment_number": 2}'::jsonb)), 'parcelas_invalidas', '22023', 'item=1');
select pg_temp.expect_code(pg_temp.imp('pa-i-0015', pg_temp.id('ctx'), pg_temp.id('card'), jsonb_build_array(pg_temp.it('x1', 'compra', 100, '2026-10-02', 'X', null) || '{"installment_number": "2", "installment_count": 3}'::jsonb)), 'parcelas_invalidas', '22023', 'item=1');
-- Estorno não leva parcela (o item é ignorado nesse caso pelo tipo: só compra lê os números).
do $$
declare
  res jsonb;
begin
  res := public.import_records('pa-i-0016', pg_temp.id('ctx'), 'cartao', pg_temp.id('card'), jsonb_build_array(pg_temp.it('e1', 'estorno', 100, '2026-10-02', 'Devolução', null, 2, 3)));
  assert res = '{"created": 1, "skipped": 0}'::jsonb, 'o estorno entra, sem parcela';
  assert (select installment_offset from public.card_entries where description = 'Devolução') = 0, 'estorno com deslocamento 0';
end $$;
-- Fatura paga: hoje é 07/10 e a fatura de outubro (fecha dia 3) já fechou, então é a que dá para pagar. Com ela paga, recusa
-- a parcela que cai nela (1 de 3 de 02/10: outubro, novembro e dezembro) e também a compra cuja parcela seguinte cai nela
-- (1 de 2 de 02/09: setembro e outubro). A compra de 05/10 (fatura natural de novembro) entra: novembro e dezembro.
do $$
declare
  v_inv public.commitments;
  r jsonb;
begin
  select * into v_inv from public.commitments where card_id = pg_temp.id('card') and invoice_month = '2026-10-01' and deleted_at is null;
  r := public.pay_invoice('pa-pay-0001', pg_temp.id('card'), '2026-10-01', v_inv.version, v_inv.amount_cents, '2026-10-06',
                          (select id from public.financial_accounts where context_id = pg_temp.id('ctx') and is_default and deleted_at is null));
  assert r is not null, 'fatura de outubro paga';
end $$;
select pg_temp.expect_code(pg_temp.imp('pa-i-0020', pg_temp.id('ctx'), pg_temp.id('card'), jsonb_build_array(pg_temp.it('f1', 'compra', 100, '2026-10-02', 'Fatura paga', null, 1, 3))), 'fatura_paga', 'PT409', 'item=1');
select pg_temp.expect_code(pg_temp.imp('pa-i-0022', pg_temp.id('ctx'), pg_temp.id('card'), jsonb_build_array(pg_temp.it('f3', 'compra', 100, '2026-09-02', 'Segunda em fatura paga', null, 1, 2))), 'fatura_paga', 'PT409', 'item=1');
do $$ begin
  assert public.import_records('pa-i-0021', pg_temp.id('ctx'), 'cartao', pg_temp.id('card'), jsonb_build_array(pg_temp.it('f2', 'compra', 3000, '2026-10-05', 'Novembro e dezembro', null, 1, 2)))
       = '{"created": 1, "skipped": 0}'::jsonb, 'a compra de 05/10 entra em novembro e dezembro';
  assert pg_temp.rows_of('card', 'Novembro e dezembro') = '2026-11 1/2 +0 3000 k | 2026-12 2/2 +0 3000 -', 'novembro e dezembro: ' || pg_temp.rows_of('card', 'Novembro e dezembro');
  -- 3 de 3 de 05/10: a terceira cairia em janeiro, além da próxima fatura, então entra na fatura natural (novembro), sozinha.
  assert public.import_records('pa-i-0023', pg_temp.id('ctx'), 'cartao', pg_temp.id('card'), jsonb_build_array(pg_temp.it('f4', 'compra', 2500, '2026-10-05', 'Última em novembro', null, 3, 3)))
       = '{"created": 1, "skipped": 0}'::jsonb, 'a última parcela, só em novembro, entra';
  assert pg_temp.rows_of('card', 'Última em novembro') = '2026-11 1/1 +2 2500 k', 'última em novembro: ' || pg_temp.rows_of('card', 'Última em novembro');
  assert not exists (select 1 from public.card_entries where description in ('Fatura paga', 'Segunda em fatura paga')), 'nada das recusas';
end $$;

-- ---------------------------------------------------------------------------
-- 4. Editar a compra importada: o deslocamento acompanha as parcelas acrescentadas; passar de 48 no total recusa.
-- ---------------------------------------------------------------------------
do $$
declare
  e public.card_entries;
  r jsonb;
begin
  e := pg_temp.purchase('card', 'Tênis 03/10');
  -- A primeira parcela guardada está na fatura de outubro, paga: mudar valor ou parcelas mexe nela: fatura_paga.
  perform pg_temp.expect_code(format('select public.update_card_entry(%L, %L, %s, %L, %s, %L, %L, %L, %s)', 'pa-u-0001', e.id, e.version, 'compra', 24000, e.purchased_on, 'Tênis 03/10', 'Lazer', 8),
                              'fatura_paga', 'PT409');
  perform set_config('request.jwt.claim.sub', pg_temp.id('olga')::text, true);
  -- Só descrição e categoria: pode, e o deslocamento fica.
  r := public.update_card_entry('pa-u-0002', e.id, e.version, 'compra', e.purchase_total_cents, e.purchased_on, 'Tênis de corrida 03/10', 'Saúde', e.installment_total);
  assert (r #>> '{entry,installment_offset}') = '2' and (r #>> '{entry,installments}') = '8', 'o retorno traz o deslocamento: ' || (r -> 'entry')::text;
  -- "Última em novembro" (última de 3, só em novembro, deslocamento 2): acrescentar parcelas carrega o deslocamento; 47 parcelas
  -- passam de 48 no total.
  e := pg_temp.purchase('card', 'Última em novembro');
  r := public.update_card_entry('pa-u-0003', e.id, e.version, 'compra', 5000, e.purchased_on, 'Última em novembro', null, 2);
  assert pg_temp.rows_of('card', 'Última em novembro') = '2026-11 1/2 +2 2500 k | 2026-12 2/2 +2 2500 -', 'a parcela nova nasce com o deslocamento: ' || pg_temp.rows_of('card', 'Última em novembro');
  e := pg_temp.purchase('card', 'Última em novembro');
  perform pg_temp.expect_code(format('select public.update_card_entry(%L, %L, %s, %L, %s, %L, %L, null, %s)', 'pa-u-0004', e.id, e.version, 'compra', 117500, e.purchased_on, 'Última em novembro', 47),
                              'parcelas_invalidas', '22023');
end $$;
-- ---------------------------------------------------------------------------
-- 5. Revisão independente: a data editada mantém a distância das faturas; o orçamento conta a parcela no mês certo; a fatura aberta
--    é a do cartão (não "o mês de hoje mais um").
-- ---------------------------------------------------------------------------
do $$
declare
  e public.card_entries;
  r jsonb;
begin
  -- Compra original de 15/08 (fatura natural de setembro), parcela 3 de 6: novembro a fevereiro, deslocamento 2. Outubro está paga.
  assert public.import_records('pa-i-0030', pg_temp.id('ctx'), 'cartao', pg_temp.id('card'), jsonb_build_array(pg_temp.it('s3', 'compra', 4000, '2026-08-15', 'Sofá 03/06', 'Educação', 3, 6)))
       = '{"created": 1, "skipped": 0}'::jsonb, 'o sofá entra';
  assert pg_temp.rows_of('card', 'Sofá 03/06') = '2026-11 1/4 +2 4000 k | 2026-12 2/4 +2 4000 - | 2027-01 3/4 +2 4000 - | 2027-02 4/4 +2 4000 -',
    'novembro a fevereiro: ' || pg_temp.rows_of('card', 'Sofá 03/06');
  -- Orçamento: as parcelas 3 a 6 de uma compra de agosto contam de outubro a janeiro (agosto mais 2 a 5), nunca em agosto e setembro.
  assert (select used_cents from public.month_budget(pg_temp.id('ctx'), '2026-08-01') where category = 'Educação') = 0, 'agosto sem o sofá';
  assert (select used_cents from public.month_budget(pg_temp.id('ctx'), '2026-10-01') where category = 'Educação') = 4000, 'outubro com a parcela 3';
  assert (select used_cents from public.month_budget(pg_temp.id('ctx'), '2027-01-01') where category = 'Educação') = 4000, 'janeiro com a parcela 6';
  assert (select used_cents from public.month_budget(pg_temp.id('ctx'), '2027-02-01') where category = 'Educação') = 0, 'fevereiro sem parcela no orçamento';
  -- Corrigir a data para 20/08 (mesma fatura natural): as parcelas ficam onde estavam; antes, voltavam para setembro.
  e := pg_temp.purchase('card', 'Sofá 03/06');
  r := public.update_card_entry('pa-u-0030', e.id, e.version, 'compra', e.purchase_total_cents, '2026-08-20', 'Sofá 03/06', 'Educação', e.installment_total);
  assert pg_temp.rows_of('card', 'Sofá 03/06') = '2026-11 1/4 +2 4000 k | 2026-12 2/4 +2 4000 - | 2027-01 3/4 +2 4000 - | 2027-02 4/4 +2 4000 -',
    'a data nova na mesma fatura natural não move as parcelas: ' || pg_temp.rows_of('card', 'Sofá 03/06');
  -- Para 02/08 (fatura natural de agosto, uma antes): a primeira guardada iria para outubro, que está paga.
  e := pg_temp.purchase('card', 'Sofá 03/06');
  perform pg_temp.expect_code(format('select public.update_card_entry(%L, %L, %s, %L, %s, %L, %L, %L, %s)', 'pa-u-0031', e.id, e.version, 'compra', e.purchase_total_cents, '2026-08-02', 'Sofá 03/06', 'Educação', e.installment_total),
                              'fatura_paga', 'PT409');
  -- Cartão que fecha dia 6 e vence dia 1, hoje 07/10: a fatura aberta é a de dezembro. Compra de 10/08 (fatura natural de outubro),
  -- parcela 3 de 5: dezembro, que não passa da fatura aberta.
  insert into ids values ('verde', (public.create_card('pa-c-0002', pg_temp.id('ctx'), 'Verde', null, 6, 1, 500000) #>> '{card,id}')::uuid);
  assert public.import_records('pa-i-0031', pg_temp.id('ctx'), 'cartao', pg_temp.id('verde'), jsonb_build_array(pg_temp.it('v3', 'compra', 1000, '2026-08-10', 'Loja verde 03/05', null, 3, 5)))
       = '{"created": 1, "skipped": 0}'::jsonb, 'a compra do cartão verde entra';
  assert pg_temp.rows_of('verde', 'Loja verde 03/05') = '2026-12 1/3 +2 1000 k | 2027-01 2/3 +2 1000 - | 2027-02 3/3 +2 1000 -',
    'dezembro a fevereiro, pela fatura aberta do cartão: ' || pg_temp.rows_of('verde', 'Loja verde 03/05');
end $$;

reset role;

rollback;
