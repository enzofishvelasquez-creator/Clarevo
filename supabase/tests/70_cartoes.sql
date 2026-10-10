-- Cartões de crédito (D-037) e chave da nota fiscal (D-038): cards, card_entries, card_items, card_entry_items,
-- invoice_items, create_card, update_card, set_card_status, delete_card, add_card_purchase, update_card_entry,
-- delete_card_entry, add_card_charge, add_card_refund, pay_invoice, undo_invoice_payment; a conta de cada fatura mantida
-- pelo banco (C1), as parcelas da compra (C2), o gasto do pagamento e o saldo anterior (C3), o crédito levado à fatura
-- seguinte (C4), fatura paga que não muda (C5) e a chave da nota única por contexto (C6); create_record com a chave da
-- nota; a conta de fatura recusada por update_commitment, delete_commitment, pay_commitment e undo_commitment_payment; o
-- gasto do pagamento recusado por update_record (só conta de saída e data) e delete_record; renda comprometida com o grupo
-- "Faturas de cartão"; guardas, restrições de record_operations, atividade (A4) e privilégios.
-- Sequência de aceite E sobre a montagem FICTÍCIA da demonstração (Bia, hoje 07/10/2026): Recebido 6.000,00, Pago 3.900,00,
-- Diferença 2.100,00, Ainda a pagar 650,00 e renda comprometida 52,5% em outubro não mudam com o cartão nem com as compras.
-- Pessoas FICTÍCIAS: Bia (sequência E e demonstração; titular da Família da Bia), Caio (Família, só leitura), Iris (Família,
-- escreve sem "editar de outras pessoas"), Theo (Família, escreve e altera o que é dos outros), Rui (externo), Vera (RH da
-- empresa; Bia tem a licença), Noel (conta nova; validação, limites, repetição, compras, crédito e nota) e Lia (conta nova;
-- revisão da auditoria: pagar só depois do fechamento, compra sempre na fatura natural, pagar fatura antiga, limite usado com crédito em cadeia,
-- tempo perto do limite de lançamentos, apelido com separadores, leitura por chave da nota). Valores em centavos.
\set ON_ERROR_STOP 1
\set bia  '''00000000-0000-0000-0000-0000000000f1'''
\set caio '''00000000-0000-0000-0000-0000000000f2'''
\set iris '''00000000-0000-0000-0000-0000000000f3'''
\set theo '''00000000-0000-0000-0000-0000000000f4'''
\set rui  '''00000000-0000-0000-0000-0000000000f5'''
\set vera '''00000000-0000-0000-0000-0000000000f6'''
\set noel '''00000000-0000-0000-0000-0000000000f7'''
\set lia  '''00000000-0000-0000-0000-0000000000f8'''

begin;
set local clarevo.today = '2026-10-07';

-- Executa um comando e exige um erro cuja mensagem combine com o padrão (LIKE).
create function pg_temp.expect_error(p_sql text, p_pattern text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm like p_pattern then return; end if;
    raise exception 'esperado "%", veio "%" (%) em: %', p_pattern, sqlerrm, sqlstate, p_sql;
  end;
  raise exception 'esperado erro "%", mas passou: %', p_pattern, p_sql;
end $$;

-- Exige o erro exato: mensagem, SQLSTATE e detalhe (vazio quando não há).
create function pg_temp.expect_code(p_sql text, p_code text, p_state text, p_detail text default '') returns void
language plpgsql as $$
declare
  v_detail text;
begin
  begin
    execute p_sql;
  exception when others then
    get stacked diagnostics v_detail = pg_exception_detail;
    if sqlerrm = p_code and sqlstate = p_state and coalesce(v_detail, '') = coalesce(p_detail, '') then return; end if;
    raise exception 'esperado % (%, "%"), veio "%" (%, "%") em: %', p_code, p_state, p_detail, sqlerrm, sqlstate, v_detail, p_sql;
  end;
  raise exception 'esperado erro %, mas passou: %', p_code, p_sql;
end $$;

-- versao_desatualizada (PT409) com o detalhe esperado.
create function pg_temp.expect_stale(p_sql text, p_detail text) returns void language sql as $$
  select pg_temp.expect_code(p_sql, 'versao_desatualizada', 'PT409', p_detail)
$$;

-- Escrita direta recusada só no fim da transação (gatilho adiado): executa, confere agora e desfaz.
create function pg_temp.expect_deferred(p_sql text, p_code text, p_state text, p_detail text default '') returns void
language plpgsql as $$
declare
  v_detail text;
begin
  begin
    execute p_sql;
    set constraints all immediate;
  exception when others then
    get stacked diagnostics v_detail = pg_exception_detail;
    set constraints all deferred;
    if sqlerrm = p_code and sqlstate = p_state and coalesce(v_detail, '') = coalesce(p_detail, '') then return; end if;
    raise exception 'esperado % (%, "%") no fim da transação, veio "%" (%, "%") em: %', p_code, p_state, p_detail, sqlerrm,
      sqlstate, v_detail, p_sql;
  end;
  set constraints all deferred;
  raise exception 'esperado erro adiado %, mas passou: %', p_code, p_sql;
end $$;

create temp table ids (name text primary key, id uuid);
grant select, insert on ids to authenticated;
create function pg_temp.id(p_name text) returns uuid language sql as $$ select id from ids where name = p_name $$;
-- Base para comparar (totais da Bia).
create temp table snap (name text primary key, v text);
grant select, insert, update on snap to authenticated;

-- Sessão de quem (nome em ids; nome desconhecido = sem sessão) e dia de hoje.
create function pg_temp.as_(p_name text) returns text language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(pg_temp.id(p_name)::text, ''), true)
$$;
create function pg_temp.today(p_day date) returns text language sql as $$
  select set_config('clarevo.today', to_char(p_day, 'YYYY-MM-DD'), true)
$$;

-- Confere agora as restrições adiadas (I1, séries, metas e as invariantes C1 a C4 e C6). Sem isso, o rollback final nunca as
-- dispararia.
create function pg_temp.check_links() returns void language plpgsql as $$
begin
  set constraints all immediate;
  set constraints all deferred;
end $$;

create function pg_temp.totals(p_ctx text, p_month date) returns bigint[] language sql as $$
  select array[received_cents, paid_cents, difference_cents] from public.month_totals(pg_temp.id(p_ctx), p_month)
$$;
create function pg_temp.to_pay(p_ctx text, p_month date) returns bigint[] language sql as $$
  select array[due_in_month_cents, overdue_before_cents, to_pay_cents, open_count] from public.month_to_pay(pg_temp.id(p_ctx), p_month)
$$;
create function pg_temp.sync(p_ctx text) returns jsonb language sql as $$
  select public.sync_series_occurrences(pg_temp.id(p_ctx))
$$;
create function pg_temp.occ(p_series text, p_n int) returns uuid language sql as $$
  select id from public.commitment_items where series_id = pg_temp.id(p_series) and occurrence_number = p_n
$$;
create function pg_temp.cver(p_cid uuid) returns int language sql as $$
  select version from public.commitment_items where id = p_cid
$$;
create function pg_temp.pay(p_key text, p_cid uuid, p_acc uuid, p_amount bigint, p_on date) returns jsonb language plpgsql as $$
declare
  res jsonb;
begin
  res := public.pay_commitment(p_key, p_cid, pg_temp.cver(p_cid), p_acc, p_amount, p_on);
  perform pg_temp.check_links();
  return res;
end $$;
-- Atividade (A4): "última anotação ausência-de ausência-até", direto na tabela (sem a RLS).
create function pg_temp.act(p_person text, p_ctx text) returns text language sql security definer
set search_path = public, pg_temp as $$
  select format('%s %s %s', to_char(last_write_on, 'YYYY-MM-DD'), coalesce(to_char(absence_from_on, 'YYYY-MM-DD'), '-'),
                coalesce(to_char(absence_until_on, 'YYYY-MM-DD'), '-'))
    from public.context_activity where person_id = pg_temp.id(p_person) and context_id = pg_temp.id(p_ctx)
$$;

-- O que o cartão não pode mudar em outubro, pela leitura do app: Recebido, Pago e Diferença de setembro e outubro, Ainda a
-- pagar de outubro, renda comprometida de setembro e outubro e o resumo por mês de agosto a outubro.
create function pg_temp.money_oct(p_ctx text) returns text language sql as $$
  select string_agg(x, ' || ' order by ord) from (
    select 1 as ord, (select to_jsonb(t)::text from public.month_totals(pg_temp.id(p_ctx), '2026-09-01') t) as x
    union all select 2, (select to_jsonb(t)::text from public.month_totals(pg_temp.id(p_ctx), '2026-10-01') t)
    union all select 3, (select to_jsonb(t)::text from public.month_to_pay(pg_temp.id(p_ctx), '2026-10-01') t)
    union all select 4, (select to_jsonb(t)::text from public.month_committed(pg_temp.id(p_ctx), '2026-09-01') t)
    union all select 5, (select to_jsonb(t)::text from public.month_committed(pg_temp.id(p_ctx), '2026-10-01') t)
    union all select 6, (select jsonb_agg(to_jsonb(o) order by o.month)::text
                           from public.months_overview(pg_temp.id(p_ctx), '2026-08-01', '2026-10-01') o)) s
$$;

-- Chamadas em texto (para expect_*): nulo vira NULL.
create function pg_temp.cc(p_key text, p_ctx uuid, p_nick text, p_digits text, p_cd integer, p_dd integer, p_limit bigint)
returns text language sql as $$
  select format('select public.create_card(%L, %L, %L, %L, %L, %L, %L)', p_key, p_ctx, p_nick, p_digits, p_cd, p_dd, p_limit)
$$;
create function pg_temp.uc(p_key text, p_card uuid, p_version integer, p_nick text, p_digits text, p_cd integer, p_dd integer,
  p_limit bigint) returns text language sql as $$
  select format('select public.update_card(%L, %L, %L, %L, %L, %L, %L, %L)', p_key, p_card, p_version, p_nick, p_digits, p_cd, p_dd,
                p_limit)
$$;
create function pg_temp.sc(p_key text, p_card uuid, p_version integer, p_status text) returns text language sql as $$
  select format('select public.set_card_status(%L, %L, %L, %L)', p_key, p_card, p_version, p_status)
$$;
create function pg_temp.dc(p_key text, p_card uuid, p_version integer) returns text language sql as $$
  select format('select public.delete_card(%L, %L, %L)', p_key, p_card, p_version)
$$;
create function pg_temp.ap(p_key text, p_card uuid, p_on date, p_total bigint, p_n integer, p_desc text, p_cat text default null,
  p_receipt text default null) returns text language sql as $$
  select format('select public.add_card_purchase(%L, %L, %L, %L, %L, %L, %L, %L)', p_key, p_card, p_on, p_total, p_n, p_desc, p_cat,
                p_receipt)
$$;
create function pg_temp.ue(p_key text, p_entry uuid, p_version integer, p_kind text, p_amount bigint, p_on date, p_desc text,
  p_cat text, p_n integer default null, p_month date default null, p_ckind text default null) returns text language sql as $$
  select format('select public.update_card_entry(%L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L)', p_key, p_entry, p_version, p_kind,
                p_amount, p_on, p_desc, p_cat, p_n, p_month, p_ckind)
$$;
create function pg_temp.de(p_key text, p_entry uuid, p_version integer) returns text language sql as $$
  select format('select public.delete_card_entry(%L, %L, %L)', p_key, p_entry, p_version)
$$;
create function pg_temp.ach(p_key text, p_card uuid, p_month date, p_ckind text, p_amount bigint) returns text language sql as $$
  select format('select public.add_card_charge(%L, %L, %L, %L, %L)', p_key, p_card, p_month, p_ckind, p_amount)
$$;
create function pg_temp.arf(p_key text, p_card uuid, p_month date, p_amount bigint, p_desc text, p_cat text default null)
returns text language sql as $$
  select format('select public.add_card_refund(%L, %L, %L, %L, %L, %L)', p_key, p_card, p_month, p_amount, p_desc, p_cat)
$$;
create function pg_temp.pi(p_key text, p_card uuid, p_month date, p_version integer, p_paid bigint, p_on date, p_acc uuid default null)
returns text language sql as $$
  select format('select public.pay_invoice(%L, %L, %L, %L, %L, %L, %L)', p_key, p_card, p_month, p_version, p_paid, p_on, p_acc)
$$;
create function pg_temp.ui(p_key text, p_card uuid, p_month date, p_version integer) returns text language sql as $$
  select format('select public.undo_invoice_payment(%L, %L, %L, %L)', p_key, p_card, p_month, p_version)
$$;

-- Leituras (como o app lê): versão do cartão, da conta da fatura e do lançamento; resumo da fatura; contas e lançamentos.
create function pg_temp.cardv(p_card uuid) returns int language sql as $$ select version from public.card_items where id = p_card $$;
create function pg_temp.iv_ver(p_card uuid, p_month date) returns int language sql as $$
  select commitment_version from public.invoice_items where card_id = p_card and month = p_month
$$;
create function pg_temp.entv(p_entry uuid) returns int language sql as $$ select version from public.card_entry_items where id = p_entry $$;
-- "situação total conta@versão (estimado)" da fatura, pela visão invoice_items.
create function pg_temp.iv(p_card uuid, p_month date) returns text language sql as $$
  select format('%s %s %s', status, total_cents, case when commitment_id is null then 'sem-conta'
                  else 'conta' || to_char(to_pay_cents, 'FM999999999') || 'v' || commitment_version
                       || case when amount_is_estimate then 'e' else '' end end)
    from public.invoice_items where card_id = p_card and month = p_month
$$;
-- Conta viva da fatura, lida direto da tabela: "valor vencimento fechamento situação vVersão estimado".
create function pg_temp.cm(p_card uuid, p_month date) returns text language sql security definer
set search_path = public, pg_temp as $$
  select coalesce((select format('%s %s %s %s v%s %s', amount_cents, to_char(due_on, 'YYYY-MM-DD'), to_char(card_closing_on, 'YYYY-MM-DD'),
                                 status, version, case when amount_is_estimate then 'estimado' else 'firme' end)
                     from public.commitments where card_id = p_card and invoice_month = p_month and deleted_at is null), '-')
$$;
create function pg_temp.cmid(p_card uuid, p_month date) returns uuid language sql security definer
set search_path = public, pg_temp as $$
  select id from public.commitments where card_id = p_card and invoice_month = p_month and deleted_at is null
$$;
-- Lançamentos vivos da fatura, lidos direto da tabela: "tipo:valor" por criação.
create function pg_temp.ents(p_card uuid, p_month date) returns text language sql security definer
set search_path = public, pg_temp as $$
  select coalesce(string_agg(e.kind || ':' || e.amount_cents, ' ' order by e.kind, e.amount_cents desc), '-')
    from public.card_entries e where e.card_id = p_card and e.invoice_month = p_month and e.deleted_at is null
$$;
-- Todas as faturas do cartão: "AAAA-MM total" separadas por espaço.
create function pg_temp.ivs(p_card uuid) returns text language sql as $$
  select coalesce(string_agg(to_char(month, 'YYYY-MM') || ':' || total_cents, ' ' order by month), '-')
    from public.invoice_items where card_id = p_card
$$;
-- O total de cada fatura lido de novo, só das linhas de card_entries (sem passar pela visão): igual ao da visão.
create function pg_temp.raw_total(p_card uuid, p_month date) returns bigint language sql security definer
set search_path = public, pg_temp as $$
  select coalesce(sum(case when kind = 'estorno' then -amount_cents else amount_cents end), 0)::bigint
    from public.card_entries where card_id = p_card and invoice_month = p_month and deleted_at is null
$$;
-- Parcelas de uma compra contadas sem a RLS (a leitura do app esconde as excluídas): total, ou só as excluídas ou só as vivas,
-- e opcionalmente só o número dado. E as versões de todas as linhas da compra.
create function pg_temp.pcount(p_purchase uuid, p_deleted boolean default null, p_number integer default null) returns bigint
language sql security definer set search_path = public, pg_temp as $$
  select count(*) from public.card_entries
   where purchase_id = p_purchase and (p_deleted is null or (deleted_at is not null) = p_deleted)
     and (p_number is null or installment_number = p_number)
$$;
create function pg_temp.pvers(p_purchase uuid) returns int[] language sql security definer set search_path = public, pg_temp as $$
  select array_agg(version order by installment_number, created_at, id) from public.card_entries where purchase_id = p_purchase
$$;
-- Todos os lançamentos vivos do banco e todas as faturas: a visão e as linhas concordam (C1 lido pelo app).
create function pg_temp.views_agree() returns void language plpgsql as $$
declare
  r record;
begin
  for r in select * from public.invoice_items loop
    assert r.total_cents = pg_temp.raw_total(r.card_id, r.month), format('invoice_items.total_cents = soma das linhas (%s %s)', r.card_id, r.month);
    assert (r.commitment_id is not null) = (r.total_cents > 0), format('conta só com total maior que zero (%s %s)', r.card_id, r.month);
    assert r.credit_cents = greatest(0, -r.total_cents), 'credit_cents';
    assert r.total_cents = r.purchases_cents + r.charges_cents + r.carried_in_cents - r.refunds_cents, 'composição do total';
    assert r.to_pay_cents = case when r.status in ('aberta', 'fechada') and r.commitment_id is not null then r.total_cents else 0 end,
      'to_pay_cents';
  end loop;
end $$;

insert into ids values ('bia', :bia), ('caio', :caio), ('iris', :iris), ('theo', :theo), ('rui', :rui), ('vera', :vera),
  ('noel', :noel), ('lia', :lia);
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  (:bia,  'bia@exemplo.test',   now(), '{"display_name":"Bia"}'),
  (:caio, 'caio@exemplo.test',  now(), '{"display_name":"Caio"}'),
  (:iris, 'iris@exemplo.test',  now(), '{"display_name":"Iris"}'),
  (:theo, 'theo@exemplo.test',  now(), '{"display_name":"Theo"}'),
  (:rui,  'rui@exemplo.test',   now(), '{"display_name":"Rui"}'),
  (:vera, 'vera@empresa.test',  now(), '{"display_name":"Vera"}'),
  (:noel, 'noel@exemplo.test',  now(), '{"display_name":"Noel"}'),
  (:lia,  'lia@exemplo.test',   now(), '{"display_name":"Lia"}');

-- Espaços pessoais.
set role authenticated;
do $$
declare
  p text;
  space jsonb;
begin
  foreach p in array array['bia', 'caio', 'iris', 'theo', 'rui', 'vera', 'noel', 'lia'] loop
    perform pg_temp.as_(p);
    space := public.ensure_personal_space('Conta principal');
    insert into ids values (p || '_ctx', (space ->> 'context_id')::uuid), (p || '_acc', (space #>> '{account,id}')::uuid);
  end loop;
end $$;
reset role;

-- Família da Bia (Caio só lê; Iris escreve sem "editar de outras pessoas"; Theo escreve e altera o que é dos outros) e a
-- empresa da Vera com a licença da Bia, preparadas pelo backend.
with f as (
  insert into public.financial_contexts (kind, name, owner_person_id) values ('familia', 'Família da Bia', :bia) returning id
) insert into ids select 'fam', id from f;
insert into public.context_memberships (context_id, person_id, role, can_read, can_write, can_edit_others)
  select id, :bia::uuid, 'titular'::public.membership_role, true, true, true from ids where name = 'fam'
  union all
  select id, :caio::uuid, 'membro'::public.membership_role, true, false, false from ids where name = 'fam'
  union all
  select id, :iris::uuid, 'membro'::public.membership_role, true, true, false from ids where name = 'fam'
  union all
  select id, :theo::uuid, 'membro'::public.membership_role, true, true, true from ids where name = 'fam';
-- A Família tem a conta principal da Bia para os pagamentos de fatura (conta do contexto).
insert into public.financial_accounts (context_id, name, created_by)
  select id, 'Conta da família', :bia from ids where name = 'fam';
insert into ids select 'fam_acc', a.id from public.financial_accounts a join ids i on i.name = 'fam' and a.context_id = i.id;
insert into public.organizations (id, name) values ('10000000-0000-0000-0000-0000000000f1', 'Empresa Fictícia dos Cartões');
insert into public.organization_admins values ('10000000-0000-0000-0000-0000000000f1', :vera);
insert into public.benefit_contracts (id, organization_id, seats, plan, starts_on)
  values ('20000000-0000-0000-0000-0000000000f1', '10000000-0000-0000-0000-0000000000f1', 10, 'familiar', '2026-05-01');
insert into public.licenses (id, contract_id, invited_email, person_id, status, activated_at)
  values ('30000000-0000-0000-0000-0000000000f1', '20000000-0000-0000-0000-0000000000f1', 'bia@exemplo.test', :bia, 'ativa', now());

-- ---------------------------------------------------------------------------
-- 1. Datas da fatura (funções puras, conferidas como superusuário): fechamento, vencimento e a fatura que recebe uma
-- compra. Fim de mês, dias 29 a 31, fevereiro (comum e bissexto) e vencimento antes ou no mesmo dia do fechamento.
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in select * from (values
    -- (dia de fechamento, dia de vencimento, mês da fatura, fechamento, vencimento)
    (5, 12, date '2026-11-01', date '2026-11-05', date '2026-11-12'),
    (3, 10, date '2026-11-01', date '2026-11-03', date '2026-11-10'),
    (31, 10, date '2026-03-01', date '2026-02-28', date '2026-03-10'),
    (31, 10, date '2028-03-01', date '2028-02-29', date '2028-03-10'),
    (31, 10, date '2026-04-01', date '2026-03-31', date '2026-04-10'),
    (29, 5, date '2026-03-01', date '2026-02-28', date '2026-03-05'),
    (29, 5, date '2027-03-01', date '2027-02-28', date '2027-03-05'),
    (29, 5, date '2028-03-01', date '2028-02-29', date '2028-03-05'),
    (30, 31, date '2026-02-01', date '2026-02-28', date '2026-02-28'),
    (30, 31, date '2026-04-01', date '2026-04-30', date '2026-04-30'),
    (30, 31, date '2026-05-01', date '2026-05-30', date '2026-05-31'),
    (31, 31, date '2026-03-01', date '2026-02-28', date '2026-03-31'),
    (31, 31, date '2026-05-01', date '2026-04-30', date '2026-05-31'),
    (10, 10, date '2026-11-01', date '2026-10-10', date '2026-11-10'),
    (1, 1, date '2026-11-01', date '2026-10-01', date '2026-11-01'),
    (15, 5, date '2026-11-01', date '2026-10-15', date '2026-11-05'),
    (28, 28, date '2026-03-01', date '2026-02-28', date '2026-03-28'),
    (1, 31, date '2026-02-01', date '2026-02-01', date '2026-02-28'),
    (29, 30, date '2027-02-01', date '2027-02-28', date '2027-02-28'),
    (29, 30, date '2028-02-01', date '2028-02-29', date '2028-02-29'),
    (31, 15, date '2027-01-01', date '2026-12-31', date '2027-01-15'),
    (20, 2, date '2026-01-01', date '2025-12-20', date '2026-01-02')) as t(cd, dd, m, closing, due) loop
    assert public.invoice_closing_on(r.cd, r.dd, r.m) = r.closing,
      format('fechamento dia %s vencimento dia %s fatura %s: esperado %s, veio %s', r.cd, r.dd, r.m, r.closing, public.invoice_closing_on(r.cd, r.dd, r.m));
    assert public.invoice_due_on(r.dd, r.m) = r.due, format('vencimento dia %s fatura %s', r.dd, r.m);
  end loop;

  -- Fatura que recebe a compra (parcela 1): a primeira cujo fechamento não é anterior à data.
  for r in select * from (values
    (3, 10, date '2026-10-03', date '2026-10-01'),
    (3, 10, date '2026-10-04', date '2026-11-01'),
    (3, 10, date '2026-10-07', date '2026-11-01'),
    (3, 10, date '2026-11-03', date '2026-11-01'),
    (3, 10, date '2026-11-04', date '2026-12-01'),
    (3, 10, date '2026-12-31', date '2027-01-01'),
    (3, 10, date '2027-01-03', date '2027-01-01'),
    (31, 10, date '2026-02-28', date '2026-03-01'),
    (31, 10, date '2026-03-01', date '2026-04-01'),
    (31, 10, date '2026-03-31', date '2026-04-01'),
    (31, 10, date '2026-04-01', date '2026-05-01'),
    (31, 10, date '2028-02-28', date '2028-03-01'),
    (31, 10, date '2028-02-29', date '2028-03-01'),
    (31, 10, date '2028-03-01', date '2028-04-01'),
    (5, 12, date '2026-09-05', date '2026-09-01'),
    (5, 12, date '2026-09-06', date '2026-10-01'),
    (5, 12, date '2026-10-05', date '2026-10-01'),
    (5, 12, date '2026-10-06', date '2026-11-01'),
    (29, 5, date '2026-02-28', date '2026-03-01'),
    (29, 5, date '2026-03-01', date '2026-04-01'),
    (29, 5, date '2026-03-29', date '2026-04-01'),
    (29, 5, date '2026-03-30', date '2026-05-01'),
    (30, 31, date '2026-02-28', date '2026-02-01'),
    (30, 31, date '2026-03-01', date '2026-03-01'),
    (30, 31, date '2026-03-30', date '2026-03-01'),
    (30, 31, date '2026-03-31', date '2026-04-01'),
    (10, 10, date '2026-10-10', date '2026-11-01'),
    (10, 10, date '2026-10-11', date '2026-12-01'),
    (1, 1, date '2026-10-01', date '2026-11-01'),
    (1, 1, date '2026-10-02', date '2026-12-01')) as t(cd, dd, d, m) loop
    assert public.invoice_month_for(r.cd, r.dd, r.d) = r.m,
      format('compra em %s (fechamento dia %s, vencimento dia %s): esperado %s, veio %s', r.d, r.cd, r.dd, r.m, public.invoice_month_for(r.cd, r.dd, r.d));
  end loop;

  -- Varredura: para vários pares de dias, todos os dias de 01/01/2027 a 31/03/2028 (inclui 2028, bissexto). A fatura da
  -- compra tem fechamento >= data, a anterior fechou antes dela (nenhuma data fica sem fatura nem em duas), e o resultado
  -- é o da forma fechada: mês da data + (1 se o vencimento não é maior que o fechamento) + (1 se o dia passa do fechamento).
  declare
    days int[] := array[1, 2, 3, 5, 10, 15, 27, 28, 29, 30, 31];
    cd int;
    dd int;
    d date;
    m date;
    expected date;
    n int := 0;
  begin
    foreach cd in array days loop
      foreach dd in array days loop
        for d in select g::date from generate_series(date '2027-01-01', date '2028-03-31', interval '1 day') g loop
          m := public.invoice_month_for(cd, dd, d);
          expected := (date_trunc('month', d::timestamp)
                       + make_interval(months => (case when dd > cd then 0 else 1 end)
                                                 + (case when extract(day from d)::int > least(cd, public.clarevo_month_last_day(d)) then 1 else 0 end)))::date;
          assert m = expected, format('forma fechada: %s fech %s venc %s: %s <> %s', d, cd, dd, m, expected);
          assert d <= public.invoice_closing_on(cd, dd, m)
             and d > public.invoice_closing_on(cd, dd, (m - interval '1 month')::date), format('período: %s fech %s venc %s', d, cd, dd);
          n := n + 1;
        end loop;
        -- O fechamento cresce a cada mês e o vencimento fica no mês da fatura.
        for m in select g::date from generate_series(date '2027-01-01', date '2028-12-01', interval '1 month') g loop
          assert public.invoice_closing_on(cd, dd, m) < public.invoice_closing_on(cd, dd, (m + interval '1 month')::date), 'fechamento crescente';
          assert date_trunc('month', public.invoice_due_on(dd, m)::timestamp)::date = m, 'vencimento no mês da fatura';
          assert public.invoice_due_on(dd, m) >= public.invoice_closing_on(cd, dd, m), 'vence depois de fechar (ou no mesmo dia)';
        end loop;
      end loop;
    end loop;
    assert n = 11 * 11 * 456, 'varredura completa';
  end;

  -- Parcelas: total ÷ n, com o resto de centavos na primeira; a soma é sempre o total.
  assert (select array_agg(public.clarevo_installment_cents(10000, 3, k) order by k) from generate_series(1, 3) k) = array[3334, 3333, 3333]::bigint[],
    '100,00 em 3 vezes';
  assert (select array_agg(public.clarevo_installment_cents(100, 3, k) order by k) from generate_series(1, 3) k) = array[34, 33, 33]::bigint[], '1,00 em 3 vezes';
  assert (select array_agg(public.clarevo_installment_cents(4700, 48, k) order by k) from generate_series(1, 4) k) = array[141, 97, 97, 97]::bigint[],
    '47,00 em 48 vezes: 1,41 e 0,97';
  assert public.clarevo_installment_cents(1, 1, 1) = 1 and public.clarevo_installment_cents(999999999, 1, 1) = 999999999, 'uma parcela';
  assert not exists (select 1 from generate_series(1, 48) n, unnest(array[48, 49, 100, 999, 1000, 4799, 100000, 99999999, 999999999]::bigint[]) t
                      where t >= n and (select sum(public.clarevo_installment_cents(t, n, k)) from generate_series(1, n) k) <> t),
    'as parcelas somam o total';
  assert not exists (select 1 from generate_series(1, 48) n, unnest(array[48, 100, 4799, 999999999]::bigint[]) t, generate_series(2, 48) k
                      where t >= n and k <= n and public.clarevo_installment_cents(t, n, k) <> t / n), 'só a primeira recebe o resto';

  -- Nome do mês.
  assert (select string_agg(public.clarevo_month_name(make_date(2026, m, 1)), ',' order by m) from generate_series(1, 12) m)
    = 'janeiro,fevereiro,março,abril,maio,junho,julho,agosto,setembro,outubro,novembro,dezembro', 'meses em português';
end $$;

-- Chave da nota guardada: resumo SHA-256 da chave de acesso (64 hexadecimais minúsculos). A chave de 44 caracteres NUNCA é
-- guardada (a de pessoa física carrega o CPF); o banco confere só a forma do resumo.
do $$
declare
  k text;
begin
  foreach k in array array['ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
                           encode(sha256(convert_to('35080599999090910270550010000000010000000011', 'UTF8')), 'hex'),
                           repeat('0', 64), repeat('f', 64), repeat('0123456789abcdef', 4)]
  loop
    assert public.clarevo_receipt_key_valid(k), 'resumo válido ' || k;
  end loop;
  foreach k in array array['35080599999090910270550010000000010000000011',                          -- a chave inteira (44 dígitos) não é aceita
                           '33260500000000000190650010000009871000000016',
                           '35261012ABC34501DE35550010000001251000000035',                          -- nem com CNPJ alfanumérico
                           '33261000052998224725550010000001241000000026',                          -- nem a de pessoa física (carrega CPF)
                           repeat('A', 64), upper(encode(sha256('x'::bytea), 'hex')),               -- maiúsculas
                           repeat('0', 63), repeat('0', 65), repeat('0', 63) || 'g', repeat('0', 63) || ' ', ' ' || repeat('0', 63),
                           '', ' ', 'x']
  loop
    assert not public.clarevo_receipt_key_valid(k), 'resumo inválido "' || k || '"';
  end loop;
  assert not public.clarevo_receipt_key_valid(null), 'nula não é válida (quem chama trata a ausência)';
  -- O mesmo resumo que o core calcula (vetores conhecidos; o teste do core confere os mesmos valores).
  assert encode(sha256('abc'::bytea), 'hex') = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad', 'SHA-256 de "abc"';
  assert encode(sha256(convert_to('35080599999090910270550010000000010000000011', 'UTF8')), 'hex')
       = '7ad0f9e89a093ba3fbaa6099be31f117c550f8171ac4acda57d090fba35af79e', 'SHA-256 da chave de exemplo';
end $$;

-- ---------------------------------------------------------------------------
-- 2. Conta nova: nenhum cartão, lançamento, fatura ou conta de fatura de exemplo.
-- ---------------------------------------------------------------------------
set role authenticated;
do $$ begin
  perform pg_temp.as_('noel');
  assert (select count(*) from public.cards) = 0 and (select count(*) from public.card_entries) = 0
     and (select count(*) from public.card_items) = 0 and (select count(*) from public.invoice_items) = 0
     and (select count(*) from public.card_entry_items) = 0
     and (select count(*) from public.commitment_items where card_id is not null) = 0, 'conta nova sem cartão de exemplo';
  assert (select count(*) from public.financial_records where card_id is not null or receipt_key is not null) = 0, 'sem gasto de fatura nem nota';
  assert pg_temp.totals('noel_ctx', '2026-10-01') = '{0,0,0}' and pg_temp.to_pay('noel_ctx', '2026-10-01') = '{0,0,0,0}', 'tudo zerado';
  assert (select (card_cents, card_permille, committed_cents) from public.month_committed(pg_temp.id('noel_ctx'), '2026-10-01'))
       = (0::bigint, null::bigint, 0::bigint), 'renda comprometida sem faturas';
end $$;

-- ---------------------------------------------------------------------------
-- 3. Cartões (Noel, hoje 07/10/2026): sessão, chave, validação na ordem, apelido sem número de cartão, limite de 20 ativos,
-- repetição, hash, versão, situação e exclusão. Recusas não gravam operação.
-- ---------------------------------------------------------------------------
do $$
declare
  ctx uuid := pg_temp.id('noel_ctx');
  res jsonb;
  res2 jsonb;
  c uuid;
  c2 uuid;
  i int;
begin
  perform pg_temp.as_('ninguem');
  perform pg_temp.expect_code(pg_temp.cc('cd-n-0001', ctx, 'Nubank', null, 5, 12, null), 'nao_autenticado', '42501');
  perform pg_temp.expect_code(pg_temp.uc('cd-n-0002', gen_random_uuid(), 1, 'Nubank', null, 5, 12, null), 'nao_autenticado', '42501');
  perform pg_temp.expect_code(pg_temp.sc('cd-n-0003', gen_random_uuid(), 1, 'arquivado'), 'nao_autenticado', '42501');
  perform pg_temp.expect_code(pg_temp.dc('cd-n-0004', gen_random_uuid(), 1), 'nao_autenticado', '42501');
  perform pg_temp.expect_code(pg_temp.ap('cd-n-0005', gen_random_uuid(), '2026-10-07', 100, 1, 'x'), 'nao_autenticado', '42501');
  perform pg_temp.expect_code(pg_temp.ue('cd-n-0006', gen_random_uuid(), 1, 'compra', 100, '2026-10-07', 'x', null, 1), 'nao_autenticado', '42501');
  perform pg_temp.expect_code(pg_temp.de('cd-n-0007', gen_random_uuid(), 1), 'nao_autenticado', '42501');
  perform pg_temp.expect_code(pg_temp.ach('cd-n-0008', gen_random_uuid(), '2026-11-01', 'juros', 100), 'nao_autenticado', '42501');
  perform pg_temp.expect_code(pg_temp.arf('cd-n-0009', gen_random_uuid(), '2026-11-01', 100, 'x'), 'nao_autenticado', '42501');
  perform pg_temp.expect_code(pg_temp.pi('cd-n-0010', gen_random_uuid(), '2026-11-01', 1, 100, '2026-10-07'), 'nao_autenticado', '42501');
  perform pg_temp.expect_code(pg_temp.ui('cd-n-0011', gen_random_uuid(), '2026-11-01', 1), 'nao_autenticado', '42501');

  perform pg_temp.as_('noel');
  -- Chave: nula, curta ou com mais de 80 caracteres, em todas as funções.
  begin
    perform pg_temp.expect_code(pg_temp.cc(null, ctx, 'Nubank', null, 5, 12, null), 'chave_invalida', '22023');
    perform pg_temp.expect_code(pg_temp.cc('curta', ctx, 'Nubank', null, 5, 12, null), 'chave_invalida', '22023');
    perform pg_temp.expect_code(pg_temp.cc(repeat('k', 81), ctx, 'Nubank', null, 5, 12, null), 'chave_invalida', '22023');
    perform pg_temp.expect_code(pg_temp.uc('curta', gen_random_uuid(), 1, 'Nubank', null, 5, 12, null), 'chave_invalida', '22023');
    perform pg_temp.expect_code(pg_temp.sc('curta', gen_random_uuid(), 1, 'arquivado'), 'chave_invalida', '22023');
    perform pg_temp.expect_code(pg_temp.dc('curta', gen_random_uuid(), 1), 'chave_invalida', '22023');
    perform pg_temp.expect_code(pg_temp.ap('curta', gen_random_uuid(), '2026-10-07', 100, 1, 'x'), 'chave_invalida', '22023');
    perform pg_temp.expect_code(pg_temp.ue('curta', gen_random_uuid(), 1, 'compra', 100, '2026-10-07', 'x', null, 1), 'chave_invalida', '22023');
    perform pg_temp.expect_code(pg_temp.de('curta', gen_random_uuid(), 1), 'chave_invalida', '22023');
    perform pg_temp.expect_code(pg_temp.ach('curta', gen_random_uuid(), '2026-11-01', 'juros', 100), 'chave_invalida', '22023');
    perform pg_temp.expect_code(pg_temp.arf('curta', gen_random_uuid(), '2026-11-01', 100, 'x'), 'chave_invalida', '22023');
    perform pg_temp.expect_code(pg_temp.pi('curta', gen_random_uuid(), '2026-11-01', 1, 100, '2026-10-07'), 'chave_invalida', '22023');
    perform pg_temp.expect_code(pg_temp.ui('curta', gen_random_uuid(), '2026-11-01', 1), 'chave_invalida', '22023');
  end;

  -- Sem escrita no contexto (inexistente), a permissão vem antes de qualquer validação.
  perform pg_temp.expect_code(pg_temp.cc('cd-n-0020', gen_random_uuid(), '', 'x', 0, 0, 0), 'sem_permissao', '42501');
  -- Cartão ou lançamento que não existe.
  perform pg_temp.expect_code(pg_temp.uc('cd-n-0021', gen_random_uuid(), 1, 'Nubank', null, 5, 12, null), 'nao_encontrado', 'P0002');
  perform pg_temp.expect_code(pg_temp.sc('cd-n-0022', gen_random_uuid(), 1, 'arquivado'), 'nao_encontrado', 'P0002');
  perform pg_temp.expect_code(pg_temp.dc('cd-n-0023', gen_random_uuid(), 1), 'nao_encontrado', 'P0002');
  perform pg_temp.expect_code(pg_temp.ap('cd-n-0024', gen_random_uuid(), '2026-10-07', 100, 1, 'x'), 'nao_encontrado', 'P0002');
  perform pg_temp.expect_code(pg_temp.ue('cd-n-0025', gen_random_uuid(), 1, 'compra', 100, '2026-10-07', 'x', null, 1), 'nao_encontrado', 'P0002');
  perform pg_temp.expect_code(pg_temp.de('cd-n-0026', gen_random_uuid(), 1), 'nao_encontrado', 'P0002');
  perform pg_temp.expect_code(pg_temp.ach('cd-n-0027', gen_random_uuid(), '2026-11-01', 'juros', 100), 'nao_encontrado', 'P0002');
  perform pg_temp.expect_code(pg_temp.arf('cd-n-0028', gen_random_uuid(), '2026-11-01', 100, 'x'), 'nao_encontrado', 'P0002');
  perform pg_temp.expect_code(pg_temp.pi('cd-n-0029', gen_random_uuid(), '2026-11-01', 1, 100, '2026-10-07'), 'nao_encontrado', 'P0002');
  perform pg_temp.expect_code(pg_temp.ui('cd-n-0030', gen_random_uuid(), '2026-11-01', 1), 'nao_encontrado', 'P0002');

  -- Validação do cartão, na ordem: apelido, final, fechamento, vencimento, limite.
  perform pg_temp.expect_code(pg_temp.cc('cd-n-0040', ctx, '', 'x', 0, 0, 0), 'apelido_invalido', '22023');
  perform pg_temp.expect_code(pg_temp.cc('cd-n-0041', ctx, ' ' || E'\t' || ' ', null, 5, 12, null), 'apelido_invalido', '22023');
  perform pg_temp.expect_code(pg_temp.cc('cd-n-0042', ctx, null, null, 5, 12, null), 'apelido_invalido', '22023');
  perform pg_temp.expect_code(pg_temp.cc('cd-n-0043', ctx, repeat('n', 31), '12', 0, 0, 0), 'apelido_invalido', '22023');
  -- Nunca o número do cartão: 13 a 19 dígitos seguidos (ignorando espaço, ponto e hífen).
  perform pg_temp.expect_code(pg_temp.cc('cd-n-0044', ctx, '4111 1111 1111 1111', null, 5, 12, null), 'apelido_invalido', '22023');
  perform pg_temp.expect_code(pg_temp.cc('cd-n-0045', ctx, '4111-1111-1111-1111', null, 5, 12, null), 'apelido_invalido', '22023');
  perform pg_temp.expect_code(pg_temp.cc('cd-n-0046', ctx, 'final 1234567890123', null, 5, 12, null), 'apelido_invalido', '22023');
  perform pg_temp.expect_code(pg_temp.cc('cd-n-0047', ctx, '4111.1111.1111.1111', null, 5, 12, null), 'apelido_invalido', '22023');
  perform pg_temp.expect_code(pg_temp.cc('cd-n-0048', ctx, '1234567890123456789', null, 5, 12, null), 'apelido_invalido', '22023');
  -- Final: exatamente 4 dígitos (com espaços nas pontas aparados).
  perform pg_temp.expect_code(pg_temp.cc('cd-n-0050', ctx, 'Nubank', '123', 0, 0, 0), 'final_invalido', '22023');
  perform pg_temp.expect_code(pg_temp.cc('cd-n-0051', ctx, 'Nubank', '12345', 0, 0, 0), 'final_invalido', '22023');
  perform pg_temp.expect_code(pg_temp.cc('cd-n-0052', ctx, 'Nubank', '12a4', 0, 0, 0), 'final_invalido', '22023');
  perform pg_temp.expect_code(pg_temp.cc('cd-n-0053', ctx, 'Nubank', '12 34', 0, 0, 0), 'final_invalido', '22023');
  perform pg_temp.expect_code(pg_temp.cc('cd-n-0054', ctx, 'Nubank', '١٢٣٤', 5, 12, null), 'final_invalido', '22023');
  -- Dias.
  perform pg_temp.expect_code(pg_temp.cc('cd-n-0055', ctx, 'Nubank', '1234', 0, 0, 0), 'dia_de_fechamento_invalido', '22023');
  perform pg_temp.expect_code(pg_temp.cc('cd-n-0056', ctx, 'Nubank', '1234', 32, 12, null), 'dia_de_fechamento_invalido', '22023');
  perform pg_temp.expect_code(pg_temp.cc('cd-n-0057', ctx, 'Nubank', '1234', null, 12, null), 'dia_de_fechamento_invalido', '22023');
  perform pg_temp.expect_code(pg_temp.cc('cd-n-0058', ctx, 'Nubank', '1234', 5, 0, 0), 'dia_de_vencimento_invalido', '22023');
  perform pg_temp.expect_code(pg_temp.cc('cd-n-0059', ctx, 'Nubank', '1234', 5, 32, null), 'dia_de_vencimento_invalido', '22023');
  perform pg_temp.expect_code(pg_temp.cc('cd-n-0060', ctx, 'Nubank', '1234', 5, null, null), 'dia_de_vencimento_invalido', '22023');
  -- Limite: R$ 1,00 a R$ 9.999.999,99.
  perform pg_temp.expect_code(pg_temp.cc('cd-n-0061', ctx, 'Nubank', '1234', 5, 12, 99), 'limite_invalido', '22023');
  perform pg_temp.expect_code(pg_temp.cc('cd-n-0062', ctx, 'Nubank', '1234', 5, 12, 0), 'limite_invalido', '22023');
  perform pg_temp.expect_code(pg_temp.cc('cd-n-0063', ctx, 'Nubank', '1234', 5, 12, -100), 'limite_invalido', '22023');
  perform pg_temp.expect_code(pg_temp.cc('cd-n-0064', ctx, 'Nubank', '1234', 5, 12, 1000000000), 'limite_invalido', '22023');
  assert (select count(*) from public.cards) = 0 and (select count(*) from public.record_operations where actor_id = pg_temp.id('noel')) = 0,
    'recusa não grava cartão nem operação';

  -- Limites aceitos: 30 caracteres, final com zero à esquerda, dias 1 e 31, limite de R$ 1,00 e de R$ 9.999.999,99; 12 dígitos
  -- no apelido não são um número de cartão.
  res := public.create_card('cd-n-0070', ctx, repeat('n', 30), '0123', 1, 31, 100);
  assert res #>> '{card,nickname}' = repeat('n', 30) and res #>> '{card,last_digits}' = '0123' and (res #>> '{card,closing_day}')::int = 1
     and (res #>> '{card,due_day}')::int = 31 and (res #>> '{card,limit_cents}')::bigint = 100, 'limites mínimos aceitos';
  res := public.create_card('cd-n-0071', ctx, '  123456789012  ', null, 31, 1, 999999999);
  assert res #>> '{card,nickname}' = '123456789012' and res #>> '{card,last_digits}' is null and (res #>> '{card,limit_cents}')::bigint = 999999999,
    '12 dígitos no apelido e limite máximo';
  res := public.create_card('cd-n-0072', ctx, 'Sem limite', '   ', 15, 15, null);
  assert res #>> '{card,last_digits}' is null and res #>> '{card,limit_cents}' is null, 'final em branco e limite ausente viram nulos';
  assert (select count(*) from public.cards where context_id = ctx) = 3, 'três cartões';

  -- Criar: retorno, hash e repetição.
  res := public.create_card('cd-n-0080', ctx, '  Nubank  ', ' 1234 ', 5, 12, 500000);
  c := (res #>> '{card,id}')::uuid;
  insert into ids values ('noel_c1', c);
  assert res #>> '{card,nickname}' = 'Nubank' and res #>> '{card,last_digits}' = '1234' and res #>> '{card,status}' = 'ativo'
     and (res #>> '{card,version}')::int = 1 and res #>> '{card,created_by}' = pg_temp.id('noel')::text
     and res #>> '{card,context_id}' = ctx::text and res #>> '{card,deleted_at}' is null and (res #>> '{card,used_cents}')::bigint = 0
     and res #>> '{card,current_month}' = '2026-11-01' and res #>> '{card,current_closing_on}' = '2026-11-05'
     and res #>> '{card,current_due_on}' = '2026-11-12', 'cartão criado; hoje 07/10 cai na fatura de novembro (fecha 05/11, vence 12/11)';
  assert res -> 'entry' = 'null'::jsonb and res -> 'entries' = '[]'::jsonb and res -> 'invoices' = '[]'::jsonb
     and res -> 'commitments' = '[]'::jsonb and res -> 'commitment' = 'null'::jsonb and res -> 'record' = 'null'::jsonb,
    'forma do retorno do cartão';
  assert (select request_hash from public.record_operations where idempotency_key = 'cd-n-0080')
       = md5(format('["criar_cartao", "%s", "Nubank", "1234", 5, 12, 500000]', ctx)), 'hash de criar_cartao';
  assert (select (action, context_id, target_id, entry_id, record_id, commitment_id) is not distinct from ('criar_cartao', ctx, c, null, null, null)
            from public.record_operations where idempotency_key = 'cd-n-0080'), 'operação aponta para o cartão';
  assert public.create_card('cd-n-0080', ctx, 'Nubank', '1234', 5, 12, 500000) = res, 'repetição devolve o mesmo resultado';
  assert (select count(*) from public.cards where context_id = ctx) = 4, 'repetição não cria cartão';
  -- Mesma chave com outro conteúdo ou outra ação: chave_reutilizada.
  perform pg_temp.expect_code(pg_temp.cc('cd-n-0080', ctx, 'Nubank', '1234', 5, 12, 500001), 'chave_reutilizada', 'PT409');
  perform pg_temp.expect_code(pg_temp.cc('cd-n-0080', ctx, 'Nubank', null, 5, 12, 500000), 'chave_reutilizada', 'PT409');
  perform pg_temp.expect_code(pg_temp.cc('cd-n-0080', ctx, 'Nubank', '1234', 6, 12, 500000), 'chave_reutilizada', 'PT409');
  perform public.create_record('cd-n-0081', ctx, pg_temp.id('noel_acc'), 'despesa', 1000, '2026-10-07', 'Café');
  perform pg_temp.expect_code(pg_temp.cc('cd-n-0081', ctx, 'Nubank', '1234', 5, 12, 500000), 'chave_reutilizada', 'PT409');
  perform pg_temp.expect_code(pg_temp.dc('cd-n-0080', c, 1), 'chave_reutilizada', 'PT409');
  perform pg_temp.expect_code(format('select public.create_record(%L, %L, %L, ''despesa'', 1000, ''2026-10-07'', ''Café'')', 'cd-n-0080', ctx,
    pg_temp.id('noel_acc')), 'chave_reutilizada', 'PT409');

  -- Alterar: versão (antiga, nula, maior), validação na ordem (depois da versão), hash e repetição.
  perform pg_temp.expect_stale(pg_temp.uc('cd-n-0090', c, 0, 'Nubank Ultra', '1234', 5, 12, 500000), 'versao_atual=1');
  perform pg_temp.expect_stale(pg_temp.uc('cd-n-0091', c, null, 'Nubank Ultra', '1234', 5, 12, 500000), 'versao_atual=1');
  perform pg_temp.expect_stale(pg_temp.uc('cd-n-0092', c, 2, '', 'x', 0, 0, 0), 'versao_atual=1');
  perform pg_temp.expect_code(pg_temp.uc('cd-n-0093', c, 1, '', 'x', 0, 0, 0), 'apelido_invalido', '22023');
  perform pg_temp.expect_code(pg_temp.uc('cd-n-0094', c, 1, 'Nubank', '12', 0, 0, 0), 'final_invalido', '22023');
  perform pg_temp.expect_code(pg_temp.uc('cd-n-0095', c, 1, 'Nubank', '1234', 0, 0, 0), 'dia_de_fechamento_invalido', '22023');
  perform pg_temp.expect_code(pg_temp.uc('cd-n-0096', c, 1, 'Nubank', '1234', 5, 0, 0), 'dia_de_vencimento_invalido', '22023');
  perform pg_temp.expect_code(pg_temp.uc('cd-n-0097', c, 1, 'Nubank', '1234', 5, 12, 99), 'limite_invalido', '22023');
  perform pg_temp.expect_code(pg_temp.uc('cd-n-0098', c, 1, '4111 1111 1111 1111', '1234', 5, 12, null), 'apelido_invalido', '22023');
  res2 := public.update_card('cd-n-0099', c, 1, 'Nubank Ultra', null, 6, 13, null);
  assert res2 #>> '{card,nickname}' = 'Nubank Ultra' and res2 #>> '{card,last_digits}' is null and (res2 #>> '{card,closing_day}')::int = 6
     and (res2 #>> '{card,due_day}')::int = 13 and res2 #>> '{card,limit_cents}' is null and (res2 #>> '{card,version}')::int = 2
     and res2 #>> '{card,created_by}' = pg_temp.id('noel')::text, 'cartão alterado';
  assert (select request_hash from public.record_operations where idempotency_key = 'cd-n-0099')
       = md5(format('["alterar_cartao", "%s", 1, "Nubank Ultra", null, 6, 13, null]', c)), 'hash de alterar_cartao';
  assert public.update_card('cd-n-0099', c, 1, 'Nubank Ultra', null, 6, 13, null) = res2, 'repetição da alteração';
  perform pg_temp.expect_code(pg_temp.uc('cd-n-0099', c, 1, 'Nubank Ultra', null, 6, 14, null), 'chave_reutilizada', 'PT409');
  res2 := public.update_card('cd-n-0100', c, 2, 'Nubank', '1234', 5, 12, 500000);
  assert (res2 #>> '{card,version}')::int = 3 and res2 #>> '{card,nickname}' = 'Nubank', 'volta ao que era (versão 3)';

  -- Situação: arquivar e reativar; mesma situação é aceita; inválida é recusada depois da versão.
  perform pg_temp.expect_stale(pg_temp.sc('cd-n-0110', c, 2, 'arquivado'), 'versao_atual=3');
  perform pg_temp.expect_stale(pg_temp.sc('cd-n-0111', c, null, 'arquivado'), 'versao_atual=3');
  perform pg_temp.expect_stale(pg_temp.sc('cd-n-0112', c, 2, 'x'), 'versao_atual=3');
  perform pg_temp.expect_code(pg_temp.sc('cd-n-0113', c, 3, 'x'), 'situacao_invalida', '22023');
  perform pg_temp.expect_code(pg_temp.sc('cd-n-0114', c, 3, null), 'situacao_invalida', '22023');
  perform pg_temp.expect_code(pg_temp.sc('cd-n-0115', c, 3, 'arquivada'), 'situacao_invalida', '22023');
  res2 := public.set_card_status('cd-n-0116', c, 3, 'arquivado');
  assert res2 #>> '{card,status}' = 'arquivado' and (res2 #>> '{card,version}')::int = 4, 'arquivado';
  assert (select request_hash from public.record_operations where idempotency_key = 'cd-n-0116')
       = md5(format('["situacao_cartao", "%s", 3, "arquivado"]', c)), 'hash de situacao_cartao';
  assert public.set_card_status('cd-n-0116', c, 3, 'arquivado') = res2, 'repetição da situação';
  res2 := public.set_card_status('cd-n-0117', c, 4, 'arquivado');
  assert (res2 #>> '{card,version}')::int = 5, 'mesma situação soma 1 à versão';
  res2 := public.set_card_status('cd-n-0118', c, 5, 'ativo');
  assert res2 #>> '{card,status}' = 'ativo' and (res2 #>> '{card,version}')::int = 6, 'reativado';

  -- Até 20 cartões ativos: já há 4 (os três de limites e o Nubank). Cria até 20; o 21º é recusado (depois da validação).
  for i in 1 .. 16 loop
    perform public.create_card('cd-n-02' || lpad(i::text, 2, '0'), ctx, 'Cartão ' || i, null, 1 + i, 10, null);
  end loop;
  assert (select count(*) from public.cards where context_id = ctx and status = 'ativo' and deleted_at is null) = 20, '20 ativos';
  perform pg_temp.expect_code(pg_temp.cc('cd-n-0230', ctx, 'Cartão 21', null, 5, 12, null), 'limite_de_cartoes', 'PT409');
  perform pg_temp.expect_code(pg_temp.cc('cd-n-0231', ctx, '', null, 5, 12, null), 'apelido_invalido', '22023');   -- validação antes do limite
  assert (select count(*) from public.record_operations where idempotency_key in ('cd-n-0230', 'cd-n-0231')) = 0, 'recusa não grava operação';
  -- Arquivar libera uma vaga; reativar com 20 ativos é recusado; excluir também libera.
  c2 := (select id from public.cards where context_id = ctx and nickname = 'Cartão 16');
  res2 := public.set_card_status('cd-n-0232', c2, 1, 'arquivado');
  assert (select count(*) from public.cards where context_id = ctx and status = 'ativo' and deleted_at is null) = 19, 'arquivado não conta';
  res2 := public.create_card('cd-n-0233', ctx, 'Cartão 21', null, 5, 12, null);
  assert (select count(*) from public.cards where context_id = ctx and status = 'ativo' and deleted_at is null) = 20, '20 ativos de novo';
  perform pg_temp.expect_code(pg_temp.sc('cd-n-0234', c2, 2, 'ativo'), 'limite_de_cartoes', 'PT409');
  assert (select version from public.cards where id = c2) = 2, 'recusa não muda o cartão';
  res2 := public.delete_card('cd-n-0235', (res2 #>> '{card,id}')::uuid, 1);
  assert res2 #>> '{card,deleted_at}' is not null and (res2 #>> '{card,version}')::int = 2, 'excluído';
  res2 := public.set_card_status('cd-n-0236', c2, 2, 'ativo');
  assert res2 #>> '{card,status}' = 'ativo', 'reativado depois de excluir outro';
  -- Atualizar um cartão com 20 ativos não é recusado (o limite é de criação e reativação).
  perform public.update_card('cd-n-0237', c2, 3, 'Cartão 16 b', null, 7, 8, null);

  perform public.set_card_status('cd-n-0238', (select id from public.cards where context_id = ctx and nickname = 'Cartão 1'), 1, 'arquivado');

  -- Excluir: versão, repetição e depois nada se faz com o cartão (nao_encontrado).
  res := public.create_card('cd-n-0240', ctx, 'Para excluir', null, 5, 12, null);
  c2 := (res #>> '{card,id}')::uuid;
  perform pg_temp.expect_stale(pg_temp.dc('cd-n-0241', c2, 2), 'versao_atual=1');
  perform pg_temp.expect_stale(pg_temp.dc('cd-n-0242', c2, null), 'versao_atual=1');
  res2 := public.delete_card('cd-n-0243', c2, 1);
  assert res2 #>> '{card,deleted_at}' is not null and res2 #>> '{card,deleted_by}' = pg_temp.id('noel')::text
     and (res2 #>> '{card,version}')::int = 2, 'cartão excluído (lógico)';
  assert (select request_hash from public.record_operations where idempotency_key = 'cd-n-0243')
       = md5(format('["excluir_cartao", "%s", 1]', c2)), 'hash de excluir_cartao';
  assert public.delete_card('cd-n-0243', c2, 1) = res2, 'repetição da exclusão devolve o cartão excluído';
  assert public.create_card('cd-n-0240', ctx, 'Para excluir', null, 5, 12, null) -> 'card' ->> 'deleted_at' is not null, 'repetição da criação: o estado atual';
  assert not exists (select 1 from public.cards where id = c2) and not exists (select 1 from public.card_items where id = c2), 'some da leitura';
  perform pg_temp.expect_code(pg_temp.uc('cd-n-0244', c2, 2, 'Nubank', null, 5, 12, null), 'nao_encontrado', 'P0002');
  perform pg_temp.expect_code(pg_temp.sc('cd-n-0245', c2, 2, 'ativo'), 'nao_encontrado', 'P0002');
  perform pg_temp.expect_code(pg_temp.dc('cd-n-0246', c2, 2), 'nao_encontrado', 'P0002');
  perform pg_temp.expect_code(pg_temp.ap('cd-n-0247', c2, '2026-10-07', 100, 1, 'x'), 'nao_encontrado', 'P0002');
  perform pg_temp.expect_code(pg_temp.ach('cd-n-0248', c2, '2026-11-01', 'juros', 100), 'nao_encontrado', 'P0002');
  perform pg_temp.expect_code(pg_temp.arf('cd-n-0249', c2, '2026-11-01', 100, 'x'), 'nao_encontrado', 'P0002');
  perform pg_temp.check_links();
end $$;

-- ---------------------------------------------------------------------------
-- 4. Compras no cartão (Noel, hoje 07/10/2026; cartão fecha dia 5 e vence dia 12): validação na ordem, parcelas com o resto
-- na primeira, fatura da primeira parcela, conta de cada fatura mantida na mesma gravação, "estimado" enquanto aberta,
-- limite usado, 48 parcelas, repetição, hash, cartão arquivado e fatura paga.
-- ---------------------------------------------------------------------------
do $$
declare
  ctx uuid := pg_temp.id('noel_ctx');
  res jsonb;
  c uuid;
  p uuid;
  e uuid;
  i int;
begin
  perform pg_temp.as_('noel');
  -- Vagas: exclui os cartões vazios 2 a 9 da seção anterior.
  for i in 2 .. 9 loop
    perform public.delete_card('cd-p-01' || lpad(i::text, 2, '0'), (select id from public.cards where context_id = ctx and nickname = 'Cartão ' || i), 1);
  end loop;
  res := public.create_card('cd-p-0001', ctx, 'Compras', '9876', 5, 12, 1000000);
  c := (res #>> '{card,id}')::uuid;
  insert into ids values ('noel_cp', c);

  -- Validação da compra, na ordem: valor, valor máximo, descrição, tamanho, categoria, parcelas, data, data futura.
  perform pg_temp.expect_code(pg_temp.ap('cd-p-0010', c, null, 0, 0, '', repeat('c', 41)), 'valor_invalido', '22023');
  perform pg_temp.expect_code(pg_temp.ap('cd-p-0011', c, '2026-10-07', null, 1, 'x'), 'valor_invalido', '22023');
  perform pg_temp.expect_code(pg_temp.ap('cd-p-0012', c, '2026-10-07', -5, 1, 'x'), 'valor_invalido', '22023');
  perform pg_temp.expect_code(pg_temp.ap('cd-p-0013', c, null, 1000000000, 0, ''), 'valor_acima_do_limite', '22023');
  perform pg_temp.expect_code(pg_temp.ap('cd-p-0014', c, null, 100, 0, '', repeat('c', 41)), 'descricao_obrigatoria', '22023');
  perform pg_temp.expect_code(pg_temp.ap('cd-p-0015', c, '2026-10-07', 100, 1, '   '), 'descricao_obrigatoria', '22023');
  perform pg_temp.expect_code(pg_temp.ap('cd-p-0016', c, '2026-10-07', 100, 1, null), 'descricao_obrigatoria', '22023');
  perform pg_temp.expect_code(pg_temp.ap('cd-p-0017', c, null, 100, 0, repeat('d', 81), repeat('c', 41)), 'descricao_longa', '22023');
  perform pg_temp.expect_code(pg_temp.ap('cd-p-0018', c, null, 100, 0, 'x', repeat('c', 41)), 'categoria_invalida', '22023');
  perform pg_temp.expect_code(pg_temp.ap('cd-p-0019', c, null, 100, 0, 'x'), 'parcelas_invalidas', '22023');
  perform pg_temp.expect_code(pg_temp.ap('cd-p-0020', c, '2026-10-08', 100, 49, 'x'), 'parcelas_invalidas', '22023');
  perform pg_temp.expect_code(pg_temp.ap('cd-p-0021', c, null, 100, null, 'x'), 'parcelas_invalidas', '22023');
  perform pg_temp.expect_code(pg_temp.ap('cd-p-0022', c, '2026-10-07', 10, 11, 'x'), 'parcelas_invalidas', '22023');
  perform pg_temp.expect_code(pg_temp.ap('cd-p-0023', c, '2026-10-07', 47, 48, 'x'), 'parcelas_invalidas', '22023');
  perform pg_temp.expect_code(pg_temp.ap('cd-p-0024', c, null, 100, 1, 'x'), 'data_invalida', '22023');
  perform pg_temp.expect_code(pg_temp.ap('cd-p-0025', c, '2022-09-30', 100, 1, 'x'), 'data_invalida', '22023');
  perform pg_temp.expect_code(pg_temp.ap('cd-p-0026', c, '2026-10-08', 100, 1, 'x'), 'data_futura', '22023');
  perform pg_temp.expect_code(pg_temp.ap('cd-p-0027', c, '2026-10-07', 100, 0, 'x'), 'parcelas_invalidas', '22023');
  assert (select count(*) from public.card_entries) = 0 and (select count(*) from public.commitment_items where card_id is not null) = 0,
    'recusas não gravam';

  -- Sofá: R$ 100,00 em 3 vezes em 07/10 (depois do fechamento de 05/10): novembro, dezembro e janeiro.
  res := public.add_card_purchase('cd-p-0030', c, '2026-10-07', 10000, 3, '  Sofá  ', 'Moradia');
  p := (res #>> '{entry,id}')::uuid;
  insert into ids values ('noel_sofa', p);
  assert res #>> '{entry,kind}' = 'compra' and (res #>> '{entry,amount_cents}')::bigint = 10000 and (res #>> '{entry,installments}')::int = 3
     and res #>> '{entry,invoice_month}' = '2026-11-01' and res #>> '{entry,description}' = 'Sofá' and res #>> '{entry,category}' = 'Moradia'
     and res #>> '{entry,purchased_on}' = '2026-10-07' and (res #>> '{entry,version}')::int = 1 and res #>> '{entry,card_id}' = c::text
     and res #>> '{entry,receipt_key}' is null and res #>> '{entry,payment_record_id}' is null and res #>> '{entry,source_month}' is null,
    'a compra é UM lançamento (id da compra, total, parcelas, fatura da primeira)';
  assert jsonb_array_length(res -> 'entries') = 3 and (select array_agg((x ->> 'amount_cents')::bigint order by (x ->> 'installment_number')::int)
                                                         from jsonb_array_elements(res -> 'entries') x) = array[3334, 3333, 3333]::bigint[]
     and (select array_agg(x ->> 'invoice_month' order by (x ->> 'installment_number')::int) from jsonb_array_elements(res -> 'entries') x)
       = array['2026-11-01', '2026-12-01', '2027-01-01'] and (res #>> '{entries,0,id}')::uuid = p
     and (select bool_and(x ->> 'purchase_id' = p::text and (x ->> 'installment_total')::int = 3 and (x ->> 'purchase_total_cents')::bigint = 10000)
            from jsonb_array_elements(res -> 'entries') x), 'três parcelas: 33,34, 33,33 e 33,33; a primeira tem o id da compra';
  assert jsonb_array_length(res -> 'invoices') = 3 and jsonb_array_length(res -> 'commitments') = 3
     and res #>> '{invoices,0,status}' = 'aberta' and (res #>> '{invoices,0,total_cents}')::bigint = 3334
     and (res #>> '{commitments,0,amount_cents}')::bigint = 3334 and res #>> '{commitments,0,card_id}' = c::text
     and res #>> '{commitments,0,invoice_month}' = '2026-11-01' and res #>> '{commitments,0,description}' = 'Fatura Compras'
     and res #>> '{commitments,0,due_on}' = '2026-11-12' and res #>> '{commitments,0,card_closing_on}' = '2026-11-05'
     and res #> '{commitments,0,amount_is_estimate}' = 'true'::jsonb and res -> 'commitment' = 'null'::jsonb and res -> 'record' = 'null'::jsonb,
    'o retorno traz as faturas e as contas';
  assert pg_temp.cm(c, '2026-11-01') = '3334 2026-11-12 2026-11-05 aberto v1 estimado'
     and pg_temp.cm(c, '2026-12-01') = '3333 2026-12-12 2026-12-05 aberto v1 estimado'
     and pg_temp.cm(c, '2027-01-01') = '3333 2027-01-12 2027-01-05 aberto v1 estimado' and pg_temp.cm(c, '2026-10-01') = '-',
    'uma conta por fatura, com vencimento, fechamento e valor estimado enquanto aberta';
  assert (select (created_by, series_id, category, currency, status) from public.commitments where id = pg_temp.cmid(c, '2026-11-01'))
       = (pg_temp.id('noel'), null::uuid, null::text, 'BRL'::char(3), 'aberto'::public.commitment_status), 'conta de fatura: autoria do cartão, sem série';
  assert (select request_hash from public.record_operations where idempotency_key = 'cd-p-0030')
       = md5(format('["criar_compra_cartao", "%s", "2026-10-07", 10000, 3, "Sofá", "Moradia"]', c)), 'hash de criar_compra_cartao';
  assert (select (action, target_id, entry_id, record_id, commitment_id) is not distinct from ('criar_compra_cartao', c, p, null, null)
            from public.record_operations where idempotency_key = 'cd-p-0030'), 'operação: cartão em target_id e compra em entry_id';
  assert public.add_card_purchase('cd-p-0030', c, '2026-10-07', 10000, 3, 'Sofá', 'Moradia') = res, 'repetição devolve o mesmo resultado';
  assert (select count(*) from public.card_entries where card_id = c) = 3, 'repetição não cria parcelas';
  perform pg_temp.expect_code(pg_temp.ap('cd-p-0030', c, '2026-10-07', 10000, 3, 'Sofá', 'Lazer'), 'chave_reutilizada', 'PT409');
  perform pg_temp.expect_code(pg_temp.ap('cd-p-0030', c, '2026-10-07', 10000, 2, 'Sofá', 'Moradia'), 'chave_reutilizada', 'PT409');
  perform pg_temp.expect_code(pg_temp.ap('cd-p-0030', c, '2026-10-07', 10000, 3, 'Sofá', 'Moradia', '077c629d7c0482086b714ca21caca21da5d16f10fab42112559e4dce9222ded2'),
    'chave_reutilizada', 'PT409');
  perform pg_temp.expect_code(pg_temp.ach('cd-p-0030', c, '2026-11-01', 'juros', 10000), 'chave_reutilizada', 'PT409');
  perform pg_temp.check_links();
  perform pg_temp.views_agree();

  -- Compra no dia do fechamento (05/10) fica na fatura que fecha nele: outubro, já fechada (hoje 07/10): valor firme.
  res := public.add_card_purchase('cd-p-0031', c, '2026-10-05', 8750, 1, 'Mercado', 'Mercado');
  assert res #>> '{entry,invoice_month}' = '2026-10-01' and (res #>> '{entry,installments}')::int = 1, 'dia do fechamento: fatura de outubro';
  assert pg_temp.cm(c, '2026-10-01') = '8750 2026-10-12 2026-10-05 aberto v1 firme', 'fatura fechada: valor firme (não estimado)';
  assert pg_temp.iv(c, '2026-10-01') = 'fechada 8750 conta8750v1', 'fatura de outubro fechada';
  assert pg_temp.iv(c, '2026-11-01') = 'aberta 3334 conta3334v1e', 'fatura de novembro aberta e estimada';
  -- Compra depois do fechamento (06/10) e à vista em 07/10: novembro; a conta soma e a versão sobe.
  res := public.add_card_purchase('cd-p-0032', c, '2026-10-06', 2000, 1, 'Padaria', null);
  assert res #>> '{entry,invoice_month}' = '2026-11-01' and res #>> '{entry,category}' is null, '06/10: depois do fechamento, novembro';
  res := public.add_card_purchase('cd-p-0033', c, '2026-10-07', 1250, 1, 'Café', 'Mercado');
  assert pg_temp.cm(c, '2026-11-01') = '6584 2026-11-12 2026-11-05 aberto v3 estimado' and pg_temp.cm(c, '2026-12-01') = '3333 2026-12-12 2026-12-05 aberto v1 estimado',
    'novembro: 33,34 + 20,00 + 12,50; a versão da conta sobe a cada mudança; as outras faturas não mudam';
  assert pg_temp.ents(c, '2026-11-01') = 'parcela:3334 parcela:2000 parcela:1250' and pg_temp.ivs(c) = '2026-10:8750 2026-11:6584 2026-12:3333 2027-01:3333',
    'lançamentos e totais por fatura';
  assert (select used_cents from public.card_items where id = c) = 8750 + 10000 + 2000 + 1250, 'limite usado: parcelas de todas as faturas não pagas';
  assert (select (current_month, current_closing_on, current_due_on) from public.card_items where id = c)
       = ('2026-11-01'::date, '2026-11-05'::date, '2026-11-12'::date), 'fatura atual: a que recebe a compra de hoje';
  assert (select count(*) from public.card_entry_items where card_id = c) = 4, 'a leitura do app tem 4 lançamentos (a compra parcelada é um só)';
  assert (select (kind, amount_cents, installments, invoice_month, version) from public.card_entry_items where id = p)
       = ('compra'::text, 10000::bigint, 3, '2026-11-01'::date, 1), 'card_entry_items: a compra com total, parcelas e fatura da primeira';
  assert (select entry_count from public.invoice_items where card_id = c and month = '2026-11-01') = 3, 'entry_count da fatura';
  perform pg_temp.check_links();
  perform pg_temp.views_agree();

  -- Valores máximos e a soma da fatura: acima de 9.999.999,99 em uma fatura é recusado (valor_acima_do_limite) e desfaz tudo.
  perform public.add_card_purchase('cd-p-0034', c, '2026-10-07', 999000000, 1, 'Muito caro', null);
  perform pg_temp.expect_code(pg_temp.ap('cd-p-0035', c, '2026-10-07', 999999999, 1, 'Caro demais'), 'valor_acima_do_limite', '22023');
  assert (select count(*) from public.card_entries where card_id = c and description = 'Caro demais') = 0, 'a soma acima do limite desfez a compra';
  perform public.delete_card_entry('cd-p-0036', (select (public.add_card_purchase('cd-p-0037', c, '2026-10-07', 1, 1, 'Um centavo') #>> '{entry,id}')::uuid), 1);
  perform public.delete_card_entry('cd-p-0038', (select id from public.card_entry_items where card_id = c and description = 'Muito caro'), 1);
  assert pg_temp.cm(c, '2026-11-01') like '6584 %', 'excluir desfaz a soma';

  -- Cartão arquivado não recebe compra; encargo e estorno ainda entram; reativar volta a aceitar.
  res := public.set_card_status('cd-p-0040', c, 1, 'arquivado');
  perform pg_temp.expect_code(pg_temp.ap('cd-p-0041', c, '2026-10-07', 100, 1, 'x'), 'cartao_arquivado', 'PT409');
  perform pg_temp.expect_code(pg_temp.ap('cd-p-0042', c, null, 0, 0, ''), 'cartao_arquivado', 'PT409');
  res := public.add_card_charge('cd-p-0043', c, '2026-11-01', 'anuidade', 1000);
  assert pg_temp.cm(c, '2026-11-01') like '7584 %', 'encargo em cartão arquivado';
  res := public.add_card_refund('cd-p-0044', c, '2026-11-01', 1000, 'Estorno da anuidade', null);
  assert pg_temp.cm(c, '2026-11-01') like '6584 %', 'estorno em cartão arquivado';
  res := public.set_card_status('cd-p-0045', c, 2, 'ativo');
  perform public.delete_card_entry('cd-p-0046', (select id from public.card_entry_items where card_id = c and kind = 'encargo'), 1);
  perform public.delete_card_entry('cd-p-0047', (select id from public.card_entry_items where card_id = c and kind = 'estorno'), 1);
  assert pg_temp.cm(c, '2026-11-01') like '6584 %' and pg_temp.ivs(c) = '2026-10:8750 2026-11:6584 2026-12:3333 2027-01:3333', 'de volta ao que era';

  -- 48 parcelas num cartão à parte (fecha dia 20, vence dia 5): 47,00 em 48 vezes = 1,41 na primeira e 0,97 nas outras; e
  -- 4.800,00 em 48 vezes = 100,00 em cada, de novembro de 2026 a outubro de 2030.
  res := public.create_card('cd-p-0050', ctx, 'Parcelas', null, 20, 5, null);
  insert into ids values ('noel_c48', (res #>> '{card,id}')::uuid);
  c := (res #>> '{card,id}')::uuid;
  res := public.add_card_purchase('cd-p-0051', c, '2026-10-07', 4700, 48, 'Balas', null);
  assert (select array_agg(amount_cents order by installment_number) from public.card_entries where purchase_id = (res #>> '{entry,id}')::uuid and installment_number <= 3)
       = array[141, 97, 97]::bigint[] and (select sum(amount_cents) from public.card_entries where purchase_id = (res #>> '{entry,id}')::uuid) = 4700
     and (select count(*) from public.card_entries where purchase_id = (res #>> '{entry,id}')::uuid) = 48, '47,00 em 48 vezes';
  -- Fechamento dia 20, vencimento dia 5: o vencimento vem antes do dia do fechamento, então a fatura de novembro fecha em 20/10.
  assert res #>> '{entry,invoice_month}' = '2026-11-01' and pg_temp.cm(c, '2026-11-01') = '141 2026-11-05 2026-10-20 aberto v1 estimado',
    'fecha 20/10 e vence 05/11';
  perform pg_temp.check_links();
  perform public.delete_card_entry('cd-p-0053', (res #>> '{entry,id}')::uuid, 1);
  res := public.add_card_purchase('cd-p-0052', c, '2026-10-07', 480000, 48, 'Notebook', 'Educação');
  assert (select min(invoice_month) from public.card_entries where purchase_id = (res #>> '{entry,id}')::uuid) = '2026-11-01'
     and (select max(invoice_month) from public.card_entries where purchase_id = (res #>> '{entry,id}')::uuid) = '2030-10-01'
     and (select bool_and(amount_cents = 10000) from public.card_entries where purchase_id = (res #>> '{entry,id}')::uuid)
     and pg_temp.cm(c, '2030-10-01') = '10000 2030-10-05 2030-09-20 aberto v1 estimado' and jsonb_array_length(res -> 'invoices') = 48
     and jsonb_array_length(res -> 'commitments') = 48, '4.800,00 em 48 vezes até outubro de 2030';
  assert (select used_cents from public.card_items where id = c) = 480000, 'limite usado com as 48 parcelas';
  assert (select count(*) from public.invoice_items where card_id = c) = 48 and (select count(*) from public.card_entry_items where card_id = c) = 1,
    '48 faturas e 1 lançamento';
  perform pg_temp.check_links();
  perform pg_temp.views_agree();
  perform public.delete_card_entry('cd-p-0054', (res #>> '{entry,id}')::uuid, 1);
  assert (select count(*) from public.invoice_items where card_id = c) = 0 and (select count(*) from public.commitments where card_id = c and deleted_at is null) = 0,
    'sem lançamentos, sem faturas nem contas';
  perform public.delete_card('cd-p-0055', c, 1);

  -- Limite de lançamentos vivos por cartão (5.000, cada parcela conta): gravação direta em massa (sem os gatilhos) e depois a
  -- função recusa o que passar.
  res := public.create_card('cd-p-0060', ctx, 'Muitas parcelas', null, 5, 12, null);
  c := (res #>> '{card,id}')::uuid;
  insert into ids values ('noel_cmany', c);
end $$;
reset role;
-- 4.999 lançamentos vivos (encargos de 1 centavo na fatura de novembro), direto no banco.
set session_replication_role = replica;
insert into public.card_entries (context_id, card_id, kind, invoice_month, amount_cents, charge_kind, created_by)
  select pg_temp.id('noel_ctx'), pg_temp.id('noel_cmany'), 'encargo', '2026-11-01', 1, 'tarifa', pg_temp.id('noel') from generate_series(1, 4999);
insert into public.commitments (context_id, description, amount_cents, due_on, created_by, card_id, invoice_month, card_closing_on, amount_is_estimate)
  values (pg_temp.id('noel_ctx'), 'Fatura Muitas parcelas', 4999, '2026-11-12', pg_temp.id('noel'), pg_temp.id('noel_cmany'), '2026-11-01', '2026-11-05', true);
set session_replication_role = origin;
set role authenticated;
do $$
declare
  c uuid := pg_temp.id('noel_cmany');
  res jsonb;
begin
  perform pg_temp.as_('noel');
  res := public.add_card_charge('cd-p-0061', c, '2026-11-01', 'iof', 1);
  assert pg_temp.cm(c, '2026-11-01') like '5000 %', '5.000º lançamento aceito';
  perform pg_temp.expect_code(pg_temp.ach('cd-p-0062', c, '2026-11-01', 'iof', 1), 'limite_de_lancamentos', 'PT409');
  perform pg_temp.expect_code(pg_temp.arf('cd-p-0063', c, '2026-11-01', 1, 'x'), 'limite_de_lancamentos', 'PT409');
  perform pg_temp.expect_code(pg_temp.ap('cd-p-0064', c, '2026-10-07', 100, 1, 'x'), 'limite_de_lancamentos', 'PT409');
  perform public.delete_card_entry('cd-p-0065', (res #>> '{entry,id}')::uuid, 1);
  res := public.add_card_purchase('cd-p-0066', c, '2026-10-07', 100, 1, 'x');
  perform pg_temp.expect_code(pg_temp.ap('cd-p-0067', c, '2026-10-07', 100, 2, 'y'), 'limite_de_lancamentos', 'PT409');
  perform pg_temp.check_links();
end $$;

-- ---------------------------------------------------------------------------
-- 5. Sequência de aceite E (Bia, montagem FICTÍCIA da demonstração; hoje 07/10/2026, depois 12/11/2026). Tudo pelas funções
-- de escrita. Base de outubro: Recebido 6.000,00, Pago 3.900,00, Diferença 2.100,00, Ainda a pagar 650,00 e renda
-- comprometida 52,5%. "Cartão Exemplo" final 1234, fecha dia 3, vence dia 10, limite R$ 5.000,00; as compras abaixo caem
-- na fatura de novembro (a primeira parcela vence em novembro): outubro não muda.
-- ---------------------------------------------------------------------------
do $$
declare
  ctx uuid := pg_temp.id('bia_ctx');
  acc uuid := pg_temp.id('bia_acc');
  res jsonb;
  c uuid;
  nov_before bigint[];
  com_before bigint;
begin
  perform pg_temp.as_('bia');
  perform public.create_record('ce-b-0001', ctx, acc, 'receita', 600000, '2026-09-01', 'Salário', 'Salário');
  perform public.create_record('ce-b-0002', ctx, acc, 'despesa', 250000, '2026-09-05', 'Aluguel', 'Moradia');
  perform public.create_record('ce-b-0003', ctx, acc, 'despesa', 125000, '2026-09-12', 'Mercado', 'Mercado');
  perform public.create_record('ce-b-0004', ctx, acc, 'receita', 600000, '2026-10-01', 'Salário', 'Salário');
  perform public.create_record('ce-b-0005', ctx, acc, 'despesa', 140000, '2026-10-06', 'Mercado', 'Mercado');
  res := public.create_series('ce-b-0006', ctx, 'mensal', 'conta', 'Aluguel', 'Moradia', 250000, 'fixo', 5, '2026-10-01', 1, null, null);
  insert into ids values ('aluguel', (res #>> '{series,id}')::uuid);
  perform pg_temp.pay('ce-b-0007', pg_temp.occ('aluguel', 1), acc, 250000, '2026-10-05');
  perform public.create_series('ce-b-0008', ctx, 'mensal', 'conta', 'Luz', 'Moradia', 18000, 'variavel', 12, '2026-11-01', 1, null, null);
  perform public.create_series('ce-b-0009', ctx, 'parcelada', 'financiamento', 'Financiamento do carro', 'Transporte', 85000, 'fixo', 10,
                               '2026-11-01', 13, 48, null);
  perform public.create_series('ce-b-0010', ctx, 'anual', 'conta', 'IPVA', 'Transporte', 240000, 'variavel', 20, '2027-01-01', 1, null,
                               null, 1);
  perform public.create_series('ce-b-0011', ctx, 'anual', 'conta', 'IPTU', 'Moradia', 18000, 'variavel', 10, '2027-02-01', 1, null,
                               null, 10);
  perform public.create_commitment('ce-b-0012', ctx, 15000, '2026-10-15', 'Internet', 'Moradia');
  perform public.create_commitment('ce-b-0013', ctx, 50000, '2026-10-20', 'Condomínio', 'Moradia');
  perform public.create_commitment('ce-b-0014', ctx, 30000, '2026-11-10', 'Seguro do carro', 'Transporte');
  perform public.set_income_reference('ce-b-0015', ctx, '2026-09-01', 0, 600000, false);
  assert pg_temp.sync('bia_ctx') = '{"created": 0, "created_overdue": 0}'::jsonb, 'nada a gerar';
  assert pg_temp.totals('bia_ctx', '2026-10-01') = '{600000,390000,210000}' and pg_temp.to_pay('bia_ctx', '2026-10-01') = '{65000,0,65000,2}',
    'base de outubro da demonstração';
  assert (select (committed_cents, committed_permille, outside_cents, card_cents) from public.month_committed(ctx, '2026-10-01'))
       = (315000::bigint, 525::bigint, 285000::bigint, 0::bigint), 'renda comprometida de outubro: 52,5%, sem grupo de cartão';
  insert into snap values ('oct', pg_temp.money_oct('bia_ctx'));
  nov_before := pg_temp.to_pay('bia_ctx', '2026-11-01');
  com_before := (select committed_cents from public.month_committed(ctx, '2026-11-01'));
  insert into snap values ('nov_pago', (pg_temp.totals('bia_ctx', '2026-11-01'))::text);

  -- Passo 1: cadastrar o cartão. Nenhum número muda.
  res := public.create_card('ce-b-0101', ctx, 'Cartão Exemplo', '1234', 3, 10, 500000);
  c := (res #>> '{card,id}')::uuid;
  insert into ids values ('exemplo', c);
  assert res #>> '{card,current_month}' = '2026-11-01' and res #>> '{card,current_closing_on}' = '2026-11-03'
     and res #>> '{card,current_due_on}' = '2026-11-10' and (res #>> '{card,used_cents}')::bigint = 0, 'hoje 07/10: a compra de hoje cai em novembro (fechou em 03/10)';
  assert pg_temp.money_oct('bia_ctx') = (select v from snap where name = 'oct'), 'passo 1: outubro igual à base';

  -- Passo 2: três compras cuja primeira parcela vence em novembro.
  res := public.add_card_purchase('ce-b-0102', c, '2026-10-05', 240000, 6, 'Geladeira', 'Moradia');
  insert into ids values ('geladeira', (res #>> '{entry,id}')::uuid);
  res := public.add_card_purchase('ce-b-0103', c, '2026-10-06', 32050, 1, 'Supermercado', 'Mercado');
  insert into ids values ('super', (res #>> '{entry,id}')::uuid);
  res := public.add_card_purchase('ce-b-0104', c, '2026-10-07', 8990, 1, 'Farmácia', 'Saúde');
  insert into ids values ('farmacia', (res #>> '{entry,id}')::uuid);
  assert pg_temp.ivs(c) = '2026-11:81040 2026-12:40000 2027-01:40000 2027-02:40000 2027-03:40000 2027-04:40000', 'faturas: 810,40 e cinco de 400,00';
  assert pg_temp.cm(c, '2026-11-01') = '81040 2026-11-10 2026-11-03 aberto v3 estimado', 'conta de novembro: 810,40, estimada';
  assert (select used_cents from public.card_items where id = c) = 281040, 'Limite usado: R$ 2.810,40 de R$ 5.000,00';
  assert pg_temp.money_oct('bia_ctx') = (select v from snap where name = 'oct'),
    'passo 2: Recebido 6.000,00, Pago 3.900,00, Diferença 2.100,00, Ainda a pagar 650,00 e 52,5% em outubro não mudam';
  assert pg_temp.totals('bia_ctx', '2026-10-01') = '{600000,390000,210000}' and pg_temp.to_pay('bia_ctx', '2026-10-01') = '{65000,0,65000,2}'
     and (select (committed_cents, committed_permille) from public.month_committed(ctx, '2026-10-01')) = (315000::bigint, 525::bigint),
    'passo 2: os números de outubro, um a um';
  assert pg_temp.totals('bia_ctx', '2026-11-01') = (select v from snap where name = 'nov_pago')::bigint[], 'compra no cartão não entra em Pago';
  assert pg_temp.to_pay('bia_ctx', '2026-11-01') = array[nov_before[1] + 81040, nov_before[2], nov_before[3] + 81040, nov_before[4] + 1],
    'Ainda a pagar de novembro soma a fatura (uma conta a mais)';
  assert (select (committed_cents, card_cents, other_cents) from public.month_committed(ctx, '2026-11-01'))
       = (com_before + 81040, 81040::bigint, (select other_cents from public.month_committed(ctx, '2026-11-01'))),
    'renda comprometida de novembro: grupo "Faturas de cartão" com 810,40';
  assert (select other_cents from public.month_committed(ctx, '2026-11-01')) = 30000, 'a fatura não entra em "outras contas" (só o seguro, 300,00)';
  assert (select (card_cents, debt_cents, installment_cents) from public.month_committed(ctx, '2026-11-01')) = (81040::bigint, 85000::bigint, 85000::bigint),
    'a fatura fica fora de "Dívidas" (financiamento) e de parcelamentos';
  assert (select card_cents from public.month_committed(ctx, '2026-12-01')) = 40000 and (select card_cents from public.month_committed(ctx, '2027-04-01')) = 40000
     and (select card_cents from public.month_committed(ctx, '2027-05-01')) = 0, 'dezembro a abril: 400,00 cada; maio sem fatura';
  assert (select card_permille from public.month_committed(ctx, '2026-11-01')) = (select div(2000::numeric * 81040 + 600000, 1200000)::bigint),
    'milésimos do grupo de cartão (metade para cima)';
  assert (select committed_cents from public.month_committed(ctx, '2026-11-01'))
       = (select fixed_cents + annual_cents + installment_cents + other_cents + card_cents from public.month_committed(ctx, '2026-11-01')), 'total = soma dos grupos';
  -- A mesma conta pelas duas leituras: month_to_pay e a identidade de B (pagas de C(M) + vence no mês).
  assert (select committed_cents from public.month_committed(ctx, '2026-11-01'))
       = (select paid_part_cents from public.month_committed(ctx, '2026-11-01')) + (select due_in_month_cents from public.month_to_pay(ctx, '2026-11-01')),
    'identidade de B com a fatura em aberto';
  perform pg_temp.check_links();
  perform pg_temp.views_agree();

  -- A composição por categoria da fatura, lida das linhas (o core divide o pagamento com ela): 400,00 Moradia, 320,50 Mercado,
  -- 89,90 Saúde.
  assert (select jsonb_object_agg(coalesce(category, '-'), s) from (select category, sum(amount_cents) as s from public.card_entries
           where card_id = c and invoice_month = '2026-11-01' and deleted_at is null group by category) x)
       = '{"Moradia": 40000, "Mercado": 32050, "Saúde": 8990}'::jsonb, 'composição de novembro';

  -- Passo 3: 12/11/2026. A fatura de novembro fechou em 03/11 e venceu em 10/11.
  perform pg_temp.today('2026-11-12');
  -- A marca gravada fica velha depois do fechamento (só uma gravação de cartão a refaz), mas nenhuma leitura a usa: invoice_items,
  -- commitment_items e month_committed a calculam na hora, já firme depois do fechamento.
  assert pg_temp.iv(c, '2026-11-01') = 'fechada 81040 conta81040v3', 'fechada: a leitura já mostra o valor firme';
  assert pg_temp.cm(c, '2026-11-01') = '81040 2026-11-10 2026-11-03 aberto v3 estimado', 'a marca gravada ainda é a de antes';
  assert not (select amount_is_estimate from public.commitment_items where id = pg_temp.cmid(c, '2026-11-01'))
     and (select amount_is_estimate from public.commitment_items where id = pg_temp.cmid(c, '2026-12-01')), 'commitment_items: calculada na hora';
  insert into snap values ('est_nov', (select estimated_open_cents::text from public.month_committed(pg_temp.id('bia_ctx'), '2026-11-01')));
  -- Abrir o app (sync_series_occurrences) não mexe nas contas das faturas: nem a marca nem a versão mudam (achado 5 da revisão).
  perform pg_temp.sync('bia_ctx');
  assert (select v from snap where name = 'est_nov') = (select estimated_open_cents::text from public.month_committed(pg_temp.id('bia_ctx'), '2026-11-01')),
    'month_committed: o estimado de novembro é o mesmo antes e depois de abrir o app (já era calculado na hora)';
  assert pg_temp.cm(c, '2026-11-01') = '81040 2026-11-10 2026-11-03 aberto v3 estimado', 'depois de abrir o app: a conta da fatura não muda, nem a versão';
  assert pg_temp.iv_ver(c, '2026-11-01') = 3, 'a versão da conta continua a que o app leu';
  assert pg_temp.cm(c, '2026-12-01') = '40000 2026-12-10 2026-12-03 aberto v1 estimado', 'dezembro ainda aberta: continua estimada';
  assert pg_temp.iv(c, '2026-11-01') = 'fechada 81040 conta81040v3' and pg_temp.iv(c, '2026-12-01') = 'aberta 40000 conta40000v1e', 'situação das faturas';
  perform pg_temp.sync('bia_ctx');
  assert pg_temp.cm(c, '2026-11-01') like '% v3 estimado', 'abrir de novo não muda nada';
  assert (select (current_month, current_closing_on, current_due_on) from public.card_items where id = c) = ('2026-12-01'::date, '2026-12-03'::date, '2026-12-10'::date),
    'fatura atual em 12/11: a de dezembro';
  assert (select to_char(due_on, 'YYYY-MM-DD') from public.commitment_items where id = pg_temp.cmid(c, '2026-11-01')) = '2026-11-10'
     and (select card_id from public.commitment_items where id = pg_temp.cmid(c, '2026-11-01')) = c
     and (select invoice_month from public.commitment_items where id = pg_temp.cmid(c, '2026-11-01')) = '2026-11-01', 'commitment_items traz o cartão e o mês';

  -- Passo 4: encargo (juros) de 12,30 e estorno de 40,00 da farmácia, informados a partir da fatura do banco.
  res := public.add_card_charge('ce-b-0201', c, '2026-11-01', 'juros', 1230);
  assert res #>> '{entry,kind}' = 'encargo' and res #>> '{entry,charge_kind}' = 'juros' and (res #>> '{entry,amount_cents}')::bigint = 1230
     and res #>> '{entry,description}' is null and res #>> '{entry,invoice_month}' = '2026-11-01' and (res #>> '{entry,installments}')::int = 1,
    'encargo no formato do app';
  assert (select request_hash from public.record_operations where idempotency_key = 'ce-b-0201')
       = md5(format('["criar_encargo_cartao", "%s", "2026-11-01", "juros", 1230]', c)), 'hash de criar_encargo_cartao';
  assert pg_temp.cm(c, '2026-11-01') = '82270 2026-11-10 2026-11-03 aberto v4 firme', 'a conta acompanha o encargo';
  res := public.add_card_refund('ce-b-0202', c, '2026-11-01', 4000, 'Devolução da farmácia', 'Saúde');
  assert res #>> '{entry,kind}' = 'estorno' and res #>> '{entry,description}' = 'Devolução da farmácia' and res #>> '{entry,source_month}' is null
     and (res #>> '{entry,amount_cents}')::bigint = 4000, 'estorno no formato do app (valor positivo; o sinal vem do tipo)';
  assert (select request_hash from public.record_operations where idempotency_key = 'ce-b-0202')
       = md5(format('["criar_estorno_cartao", "%s", "2026-11-01", 4000, "Devolução da farmácia", "Saúde"]', c)), 'hash de criar_estorno_cartao';
  assert pg_temp.cm(c, '2026-11-01') = '78270 2026-11-10 2026-11-03 aberto v5 firme' and pg_temp.iv(c, '2026-11-01') = 'fechada 78270 conta78270v5', 'total 782,70';
  assert (select (purchases_cents, charges_cents, carried_in_cents, refunds_cents, credit_cents, entry_count) from public.invoice_items where card_id = c and month = '2026-11-01')
       = (81040::bigint, 1230::bigint, 0::bigint, 4000::bigint, 0::bigint, 5), 'composição da fatura';
  assert (select jsonb_object_agg(k, t) from (
            select coalesce(category, case when kind = 'encargo' then 'Encargos do cartão' else '-' end) as k,
                   sum(case when kind = 'estorno' then -amount_cents else amount_cents end) as t
              from public.card_entries where card_id = c and invoice_month = '2026-11-01' and deleted_at is null group by 1) x)
       = '{"Moradia": 40000, "Mercado": 32050, "Saúde": 4990, "Encargos do cartão": 1230}'::jsonb,
    'composição por categoria: o estorno abate a categoria da compra; encargos à parte; soma 782,70';
  perform pg_temp.check_links();

  -- Passo 5: recusas sobre a conta da fatura (conta_de_fatura, PT409): editar, excluir, pagar e desfazer só pelas funções do cartão.
  declare
    cid uuid := pg_temp.cmid(c, '2026-11-01');
    v int := pg_temp.cver(cid);
    did uuid := pg_temp.cmid(c, '2026-12-01');
  begin
    perform pg_temp.expect_code(format('select public.update_commitment(%L, %L, %s, 100, ''2026-11-10'', ''Outra'')', 'ce-b-0301', cid, v), 'conta_de_fatura', 'PT409');
    perform pg_temp.expect_code(format('select public.update_commitment(%L, %L, 99, 100, ''2026-11-10'', ''Outra'')', 'ce-b-0302', cid), 'conta_de_fatura', 'PT409');
    perform pg_temp.expect_code(format('select public.delete_commitment(%L, %L, %s)', 'ce-b-0303', cid, v), 'conta_de_fatura', 'PT409');
    perform pg_temp.expect_code(format('select public.pay_commitment(%L, %L, %s, %L, 78270, ''2026-11-12'')', 'ce-b-0304', cid, v, acc), 'conta_de_fatura', 'PT409');
    perform pg_temp.expect_code(format('select public.undo_commitment_payment(%L, %L, %s)', 'ce-b-0305', cid, v), 'conta_de_fatura', 'PT409');
    perform pg_temp.expect_code(format('select public.update_commitment(%L, %L, 1, 100, ''2026-12-10'', ''Outra'')', 'ce-b-0306', did), 'conta_de_fatura', 'PT409');
    perform pg_temp.expect_code(format('select public.delete_commitment(%L, %L, 1)', 'ce-b-0307', did), 'conta_de_fatura', 'PT409');
    perform pg_temp.expect_code(format('select public.pay_commitment(%L, %L, 1, %L, 40000, ''2026-11-12'')', 'ce-b-0308', did, acc), 'conta_de_fatura', 'PT409');
    -- Inexistente ou de quem não lê: nao_encontrado vem antes.
    perform pg_temp.expect_code(format('select public.pay_commitment(%L, %L, 1, %L, 40000, ''2026-11-12'')', 'ce-b-0309', gen_random_uuid(), acc), 'nao_encontrado', 'P0002');
    assert pg_temp.cm(c, '2026-11-01') = '78270 2026-11-10 2026-11-03 aberto v5 firme' and (select count(*) from public.record_operations where idempotency_key like 'ce-b-03%') = 0,
      'recusas não mudam nada nem gravam operação';
  end;

  -- Passo 6: pagar. Validação na ordem: versão, situação, valor, valor acima da fatura, data inválida (mais de 1 ano), data
  -- futura, conta.
  perform pg_temp.expect_stale(pg_temp.pi('ce-b-0401', c, '2026-11-01', 4, 70000, '2026-11-12'), 'versao_atual=5');
  perform pg_temp.expect_stale(pg_temp.pi('ce-b-0402', c, '2026-11-01', null, 70000, '2026-11-12'), 'versao_atual=5');
  perform pg_temp.expect_code(pg_temp.pi('ce-b-0403', c, '2026-11-01', 5, 0, '2026-11-12'), 'valor_invalido', '22023');
  perform pg_temp.expect_code(pg_temp.pi('ce-b-0404', c, '2026-11-01', 5, null, '2026-11-12'), 'valor_invalido', '22023');
  perform pg_temp.expect_code(pg_temp.pi('ce-b-0405', c, '2026-11-01', 5, -1, null), 'valor_invalido', '22023');
  perform pg_temp.expect_code(pg_temp.pi('ce-b-0406', c, '2026-11-01', 5, 78271, null), 'valor_acima_da_fatura', '22023');
  perform pg_temp.expect_code(pg_temp.pi('ce-b-0407', c, '2026-11-01', 5, 78271, '2026-11-12'), 'valor_acima_da_fatura', '22023');
  perform pg_temp.expect_code(pg_temp.pi('ce-b-0408', c, '2026-11-01', 5, 70000, null), 'data_invalida', '22023');
  perform pg_temp.expect_code(pg_temp.pi('ce-b-0409', c, '2026-11-01', 5, 70000, '2025-11-11'), 'data_invalida', '22023');
  perform pg_temp.expect_code(pg_temp.pi('ce-b-0410', c, '2026-11-01', 5, 70000, '2026-11-13'), 'data_futura', '22023');
  perform pg_temp.expect_code(pg_temp.pi('ce-b-0411', c, '2026-11-01', 5, 70000, '2026-11-12', gen_random_uuid()), 'conta_invalida', '22023');
  perform pg_temp.expect_code(pg_temp.pi('ce-b-0412', c, '2026-11-01', 5, 70000, '2026-11-12', pg_temp.id('noel_acc')), 'conta_invalida', '22023');
  perform pg_temp.expect_code(pg_temp.pi('ce-b-0413', c, '2026-11-15', 5, 70000, '2026-11-12'), 'mes_invalido', '22023');
  perform pg_temp.expect_code(pg_temp.pi('ce-b-0414', c, null, 5, 70000, '2026-11-12'), 'mes_invalido', '22023');
  perform pg_temp.expect_code(pg_temp.pi('ce-b-0415', c, '2026-10-01', 5, 70000, '2026-11-12'), 'nao_encontrado', 'P0002');   -- fatura sem conta
  perform pg_temp.expect_code(pg_temp.pi('ce-b-0416', c, '2027-05-01', 5, 70000, '2026-11-12'), 'nao_encontrado', 'P0002');
  perform pg_temp.expect_code(pg_temp.ui('ce-b-0417', c, '2026-11-01', 5), 'compromisso_aberto', 'PT409');
  -- Fatura ainda aberta (dezembro fecha em 03/12): só se paga depois do fechamento. A recusa vem logo depois de versão e
  -- situação e antes de valor, data e conta; nada é gravado.
  perform pg_temp.expect_stale(pg_temp.pi('ce-b-0418', c, '2026-12-01', 9, 40000, '2026-11-12'), 'versao_atual=' || pg_temp.iv_ver(c, '2026-12-01'));
  perform pg_temp.expect_code(pg_temp.pi('ce-b-0418', c, '2026-12-01', pg_temp.iv_ver(c, '2026-12-01'), 40000, '2026-11-12'), 'fatura_aberta', 'PT409');
  perform pg_temp.expect_code(pg_temp.pi('ce-b-0419', c, '2026-12-01', pg_temp.iv_ver(c, '2026-12-01'), 0, null), 'fatura_aberta', 'PT409');
  perform pg_temp.expect_code(pg_temp.pi('ce-b-0419', c, '2026-12-01', pg_temp.iv_ver(c, '2026-12-01'), 99999999, '2030-01-01', gen_random_uuid()), 'fatura_aberta', 'PT409');
  assert (select count(*) from public.record_operations where idempotency_key like 'ce-b-04%') = 0 and pg_temp.cm(c, '2026-11-01') like '78270 % v5 firme'
     and pg_temp.cm(c, '2026-12-01') = '40000 2026-12-10 2026-12-03 aberto v1 estimado',
    'recusas não gravam';

  -- Pagamento parcial: R$ 700,00 de R$ 782,70, em 12/11. A conta de saída é a conta ativa mais antiga do contexto.
  res := public.pay_invoice('ce-b-0420', c, '2026-11-01', 5, 70000, '2026-11-12');
  insert into ids values ('pgto1', (res #>> '{record,id}')::uuid);
  assert res #>> '{record,description}' = 'Fatura Cartão Exemplo (novembro)' and (res #>> '{record,amount_cents}')::bigint = 70000
     and res #>> '{record,occurred_on}' = '2026-11-12' and res #>> '{record,kind}' = 'despesa' and res #>> '{record,category}' is null
     and res #>> '{record,card_id}' = c::text and res #>> '{record,invoice_month}' = '2026-11-01' and res #>> '{record,account_id}' = acc::text
     and res #>> '{record,commitment_id}' = res #>> '{commitment,id}' and res #>> '{record,created_by}' = pg_temp.id('bia')::text
     and (res #>> '{record,version}')::int = 1 and res #>> '{record,receipt_key}' is null, 'um gasto "Fatura Cartão Exemplo (novembro)"';
  assert res #>> '{commitment,status}' = 'quitado' and (res #>> '{commitment,amount_cents}')::bigint = 78270 and (res #>> '{commitment,version}')::int = 6
     and res #> '{commitment,amount_is_estimate}' = 'false'::jsonb and res #>> '{commitment,paid_amount_cents}' = '70000'
     and res #>> '{commitment,paid_record_id}' = res #>> '{record,id}' and res #>> '{commitment,card_id}' = c::text, 'conta quitada; o previsto fica';
  assert res #>> '{entry,kind}' = 'saldo_anterior' and (res #>> '{entry,amount_cents}')::bigint = 8270 and res #>> '{entry,invoice_month}' = '2026-12-01'
     and res #>> '{entry,source_month}' = '2026-11-01' and res #>> '{entry,payment_record_id}' = res #>> '{record,id}'
     and res #>> '{entry,description}' is null and res #>> '{entry,category}' is null, 'saldo anterior de 82,70 na fatura de dezembro';
  assert jsonb_array_length(res -> 'entries') = 1 and jsonb_array_length(res -> 'invoices') = 2 and res #>> '{invoices,0,status}' = 'paga_em_parte'
     and (res #>> '{invoices,0,paid_cents}')::bigint = 70000 and (res #>> '{invoices,0,left_over_cents}')::bigint = 8270
     and (res #>> '{invoices,0,to_pay_cents}')::bigint = 0 and res #>> '{invoices,1,status}' = 'aberta'
     and (res #>> '{invoices,1,total_cents}')::bigint = 48270 and (res #>> '{invoices,1,carried_in_cents}')::bigint = 8270, 'faturas no retorno';
  assert (select request_hash from public.record_operations where idempotency_key = 'ce-b-0420')
       = md5(format('["pagar_fatura", "%s", "2026-11-01", 5, 70000, "2026-11-12"]', c)), 'hash de pagar_fatura (sem conta)';
  assert (select (action, target_id, entry_id, record_id, commitment_id) is not distinct from ('pagar_fatura', c, null::uuid, (res #>> '{record,id}')::uuid, (res #>> '{commitment,id}')::uuid)
            from public.record_operations where idempotency_key = 'ce-b-0420'), 'operação: cartão, conta da fatura e gasto';
  assert public.pay_invoice('ce-b-0420', c, '2026-11-01', 5, 70000, '2026-11-12') = res, 'repetição devolve o mesmo resultado';
  assert (select count(*) from public.financial_records where card_id = c) = 1 and (select count(*) from public.card_entries where payment_record_id is not null) = 1,
    'repetição não grava de novo';
  perform pg_temp.expect_code(pg_temp.pi('ce-b-0420', c, '2026-11-01', 5, 70001, '2026-11-12'), 'chave_reutilizada', 'PT409');
  perform pg_temp.expect_code(pg_temp.pi('ce-b-0420', c, '2026-11-01', 5, 70000, '2026-11-12', acc), 'chave_reutilizada', 'PT409');
  perform pg_temp.expect_code(pg_temp.pi('ce-b-0421', c, '2026-11-01', 6, 70000, '2026-11-12'), 'compromisso_quitado', 'PT409');
  perform pg_temp.expect_stale(pg_temp.pi('ce-b-0422', c, '2026-11-01', 5, 70000, '2026-11-12'), 'versao_atual=6');
  assert pg_temp.cm(c, '2026-12-01') = '48270 2026-12-10 2026-12-03 aberto v2 estimado', 'dezembro: 400,00 + saldo anterior de 82,70';
  assert pg_temp.iv(c, '2026-11-01') = 'paga_em_parte 78270 conta0v6' and pg_temp.iv(c, '2026-12-01') = 'aberta 48270 conta48270v2e', 'situação depois do pagamento';
  assert (pg_temp.totals('bia_ctx', '2026-11-01'))[2] = 70000 and (pg_temp.totals('bia_ctx', '2026-11-01'))[3] = -70000, 'Pago de novembro recebe o pagamento: 700,00';
  assert pg_temp.totals('bia_ctx', '2026-10-01') = '{600000,390000,210000}', 'outubro continua igual';
  assert (select count(*) from public.financial_records where card_id = c and occurred_on = '2026-11-12') = 1, 'um único gasto, na data do pagamento';
  assert (select (card_cents, paid_part_cents) from public.month_committed(ctx, '2026-11-01'))
       = (70000::bigint, (select paid_part_cents from public.month_committed(ctx, '2026-11-01'))), 'renda comprometida: a fatura paga conta pelo valor pago';
  assert (select card_cents from public.month_committed(ctx, '2026-12-01')) = 48270, 'dezembro soma o saldo anterior (sem contar duas vezes)';
  assert (select used_cents from public.card_items where id = c) = 200000 + 8270, 'limite usado: parcelas e saldo das faturas ainda não pagas (2.082,70)';
  perform pg_temp.check_links();
  perform pg_temp.views_agree();

  -- Passo 7: o gasto do pagamento só muda de conta de saída e de data (pagamento_de_fatura); nunca é excluído por delete_record.
  declare
    rid uuid := pg_temp.id('pgto1');
    r public.financial_records;
  begin
    perform pg_temp.expect_stale(format('select public.update_record(%L, %L, 9, %L, 70000, ''2026-11-12'', ''Fatura Cartão Exemplo (novembro)'', null)', 'ce-b-0501', rid, acc), 'versao_atual=1');
    perform pg_temp.expect_code(format('select public.update_record(%L, %L, 1, %L, 70001, ''2026-11-12'', ''Fatura Cartão Exemplo (novembro)'', null)', 'ce-b-0502', rid, acc), 'pagamento_de_fatura', 'PT409');
    perform pg_temp.expect_code(format('select public.update_record(%L, %L, 1, %L, 70000, ''2026-11-12'', ''Outra descrição'', null)', 'ce-b-0503', rid, acc), 'pagamento_de_fatura', 'PT409');
    perform pg_temp.expect_code(format('select public.update_record(%L, %L, 1, %L, 70000, ''2026-11-12'', ''Fatura Cartão Exemplo (novembro)'', ''Lazer'')', 'ce-b-0504', rid, acc), 'pagamento_de_fatura', 'PT409');
    perform pg_temp.expect_code(format('select public.delete_record(%L, %L, 1)', 'ce-b-0505', rid), 'pagamento_de_fatura', 'PT409');
    perform pg_temp.expect_stale(format('select public.delete_record(%L, %L, 2)', 'ce-b-0506', rid), 'versao_atual=1');
    perform pg_temp.expect_code(format('select public.update_record(%L, %L, 1, %L, 70000, ''2026-11-13'', ''Fatura Cartão Exemplo (novembro)'', null)', 'ce-b-0507', rid, acc), 'data_futura', '22023');
    r := public.update_record('ce-b-0508', rid, 1, acc, 70000, '2026-11-11', 'Fatura Cartão Exemplo (novembro)', null);
    assert r.occurred_on = '2026-11-11' and r.version = 2 and r.card_id = c and r.invoice_month = '2026-11-01' and r.commitment_id = pg_temp.cmid(c, '2026-11-01'),
      'data corrigida; o vínculo com a fatura fica';
    assert pg_temp.cm(c, '2026-11-01') like '78270 % quitado v7 firme', 'editar o gasto soma 1 à versão da conta (D-021(3))';
    assert (select count(*) from public.record_operations where idempotency_key between 'ce-b-0501' and 'ce-b-0507') = 0, 'recusas não gravam';
    perform pg_temp.check_links();
  end;

  -- Passo 8: desfazer o pagamento: o gasto sai, o saldo anterior sai, a conta reabre (valor firme, versão +1 duas vezes).
  declare
    v int := pg_temp.iv_ver(c, '2026-11-01');
  begin
    perform pg_temp.expect_stale(pg_temp.ui('ce-b-0601', c, '2026-11-01', v - 1), 'versao_atual=' || v);
    perform pg_temp.expect_stale(pg_temp.ui('ce-b-0602', c, '2026-11-01', null), 'versao_atual=' || v);
    perform pg_temp.expect_code(pg_temp.ui('ce-b-0603', c, '2026-12-01', 2), 'compromisso_aberto', 'PT409');
    res := public.undo_invoice_payment('ce-b-0604', c, '2026-11-01', v);
    assert res #>> '{commitment,status}' = 'aberto' and (res #>> '{commitment,version}')::int = v + 1 and (res #>> '{commitment,amount_cents}')::bigint = 78270
     and res #>> '{record,deleted_at}' is not null and res #>> '{record,deleted_by}' = pg_temp.id('bia')::text and (res #>> '{record,version}')::int = 3
     and res #>> '{entry,kind}' = 'saldo_anterior' and res #>> '{entry,deleted_at}' is not null and (res #>> '{entry,amount_cents}')::bigint = 8270,
      'desfeito: gasto e saldo anterior excluídos, conta aberta';
    assert (select request_hash from public.record_operations where idempotency_key = 'ce-b-0604')
       = md5(format('["desfazer_pagamento_fatura", "%s", "2026-11-01", %s]', c, v)), 'hash de desfazer_pagamento_fatura';
    assert public.undo_invoice_payment('ce-b-0604', c, '2026-11-01', v) = res, 'repetição do desfazer';
    assert pg_temp.cm(c, '2026-11-01') = '78270 2026-11-10 2026-11-03 aberto v' || (v + 1) || ' firme' and pg_temp.cm(c, '2026-12-01') like '40000 % aberto v3 estimado',
      'novembro reaberta; dezembro de volta a 400,00';
    assert (pg_temp.totals('bia_ctx', '2026-11-01'))[2] = 0, 'Pago de novembro volta a zero';
    assert not exists (select 1 from public.financial_records where id = pg_temp.id('pgto1'))
       and not exists (select 1 from public.card_entries where payment_record_id = pg_temp.id('pgto1')), 'o gasto e o saldo anterior somem da leitura';
    perform pg_temp.check_links();
    perform pg_temp.views_agree();
  end;

  -- Passo 9: pagar tudo (782,70) em 12/11: sem saldo anterior; fatura paga não recebe nem perde lançamento (fatura_paga).
  res := public.pay_invoice('ce-b-0701', c, '2026-11-01', pg_temp.iv_ver(c, '2026-11-01'), 78270, '2026-11-12', acc);
  assert res #>> '{commitment,status}' = 'quitado' and res -> 'entry' = 'null'::jsonb and jsonb_array_length(res -> 'entries') = 0
     and res #>> '{invoices,0,status}' = 'paga' and res #>> '{invoices,0,left_over_cents}' = '0' and (res #>> '{record,amount_cents}')::bigint = 78270,
    'pagamento total: paga, sem saldo anterior';
  assert (select request_hash from public.record_operations where idempotency_key = 'ce-b-0701')
       = md5(format('["pagar_fatura", "%s", "2026-11-01", %s, 78270, "2026-11-12", "%s"]', c, pg_temp.iv_ver(c, '2026-11-01') - 1, acc)), 'hash com a conta de saída';
  -- Compra do ciclo de uma fatura FECHADA e paga (hoje 12/11, novembro fechou em 03/11): é recusada (fatura_paga). O banco já
  -- cobrou essa compra na fatura fechada; empurrá-la para dezembro faria a pessoa pagar de novo. Nada muda.
  perform pg_temp.expect_code(pg_temp.ap('ce-b-0702', c, '2026-10-20', 1000, 1, 'Fora de hora'), 'fatura_paga', 'PT409');
  assert pg_temp.cm(c, '2026-12-01') like '40000 % aberto %' and pg_temp.iv(c, '2026-11-01') = 'paga 78270 conta0v' || pg_temp.iv_ver(c, '2026-11-01'),
    'a recusa não grava: dezembro e novembro intactas';
  assert not exists (select 1 from public.record_operations where idempotency_key = 'ce-b-0702'), 'recusa não grava operação';
  perform pg_temp.expect_code(pg_temp.ach('ce-b-0703', c, '2026-11-01', 'multa', 100), 'fatura_paga', 'PT409');
  perform pg_temp.expect_code(pg_temp.arf('ce-b-0704', c, '2026-11-01', 100, 'Devolução'), 'fatura_paga', 'PT409');
  perform pg_temp.expect_code(pg_temp.de('ce-b-0705', (select id from public.card_entry_items where card_id = c and kind = 'encargo'), 1), 'fatura_paga', 'PT409');
  perform pg_temp.expect_code(pg_temp.ue('ce-b-0706', (select id from public.card_entry_items where card_id = c and kind = 'encargo'), 1, 'encargo', 1300, null, null, null, null, '2026-11-01', 'juros'), 'fatura_paga', 'PT409');
  perform pg_temp.expect_code(pg_temp.de('ce-b-0707', pg_temp.id('geladeira'), 1), 'fatura_paga', 'PT409');
  perform pg_temp.expect_code(pg_temp.ue('ce-b-0708', pg_temp.id('geladeira'), 1, 'compra', 250000, '2026-10-05', 'Geladeira', 'Moradia', 6), 'fatura_paga', 'PT409');
  perform pg_temp.expect_code(pg_temp.ue('ce-b-0709', pg_temp.id('geladeira'), 1, 'compra', 240000, '2026-10-05', 'Geladeira', 'Moradia', 5), 'fatura_paga', 'PT409');
  perform pg_temp.expect_code(pg_temp.ue('ce-b-0710', pg_temp.id('geladeira'), 1, 'compra', 240000, '2026-09-05', 'Geladeira', 'Moradia', 6), 'fatura_paga', 'PT409');
  -- Mover um encargo de dezembro para a fatura paga também é recusado; só descrição e categoria da compra podem mudar.
  res := public.add_card_charge('ce-b-0711', c, '2026-12-01', 'anuidade', 5000);
  perform pg_temp.expect_code(pg_temp.ue('ce-b-0712', (res #>> '{entry,id}')::uuid, 1, 'encargo', 5000, null, null, null, null, '2026-11-01', 'anuidade'), 'fatura_paga', 'PT409');
  perform public.delete_card_entry('ce-b-0713', (res #>> '{entry,id}')::uuid, 1);
  res := public.update_card_entry('ce-b-0714', pg_temp.id('geladeira'), 1, 'compra', 240000, '2026-10-05', 'Geladeira inox', 'Casa', 6);
  assert res #>> '{entry,description}' = 'Geladeira inox' and res #>> '{entry,category}' = 'Casa' and (res #>> '{entry,version}')::int = 2
     and (select bool_and(version = 2 and description = 'Geladeira inox') from public.card_entries where purchase_id = pg_temp.id('geladeira')),
    'descrição e categoria mudam mesmo com parcela em fatura paga; todas as parcelas somam 1 à versão';
  assert pg_temp.iv(c, '2026-11-01') = 'paga 78270 conta0v' || pg_temp.iv_ver(c, '2026-11-01') and pg_temp.ivs(c) like '2026-11:78270 2026-12:40000 %', 'faturas intactas';
  perform pg_temp.check_links();
  perform pg_temp.views_agree();

  -- Passo 10: pagamento parcial de novo e a ordem de desfazer. Dezembro paga em seguida (já fechada, em 04/12): desfazer
  -- novembro passa a ser recusado (fatura_seguinte_paga) até dezembro ser desfeita.
  -- Dezembro só aceita pagamento depois de fechar (03/12): no próprio dia do fechamento ainda está aberta; no dia seguinte,
  -- fechada. A data do pagamento pode ser anterior (quem pagou antes informa o dia em que pagou).
  perform pg_temp.today('2026-12-03');
  perform pg_temp.expect_code(pg_temp.pi('ce-b-0800', c, '2026-12-01', pg_temp.iv_ver(c, '2026-12-01'), 4000, '2026-11-12'), 'fatura_aberta', 'PT409');
  assert pg_temp.iv(c, '2026-12-01') like 'aberta 40000 %', 'no dia do fechamento a fatura ainda está aberta';
  perform pg_temp.today('2026-12-04');
  assert pg_temp.iv(c, '2026-12-01') like 'fechada 40000 %', 'no dia seguinte, fechada';
  res := public.undo_invoice_payment('ce-b-0801', c, '2026-11-01', pg_temp.iv_ver(c, '2026-11-01'));
  res := public.pay_invoice('ce-b-0802', c, '2026-11-01', pg_temp.iv_ver(c, '2026-11-01'), 70000, '2026-11-12');
  assert pg_temp.cm(c, '2026-12-01') like '48270 %', 'saldo anterior de volta em dezembro';
  perform pg_temp.expect_code(pg_temp.pi('ce-b-0803', c, '2026-12-01', pg_temp.iv_ver(c, '2026-12-01'), 48271, '2026-11-12'), 'valor_acima_da_fatura', '22023');
  res := public.pay_invoice('ce-b-0804', c, '2026-12-01', pg_temp.iv_ver(c, '2026-12-01'), 48270, '2026-11-12');
  assert res #>> '{invoices,0,status}' = 'paga' and res #>> '{commitment,status}' = 'quitado', 'dezembro paga (inclui o saldo anterior)';
  perform pg_temp.expect_code(pg_temp.ui('ce-b-0805', c, '2026-11-01', pg_temp.iv_ver(c, '2026-11-01')), 'fatura_seguinte_paga', 'PT409');
  perform pg_temp.expect_code(pg_temp.ach('ce-b-0806', c, '2026-12-01', 'iof', 1), 'fatura_paga', 'PT409');
  -- Pagar parcialmente novembro de novo não é possível enquanto dezembro está paga: desfaz dezembro, depois novembro.
  res := public.undo_invoice_payment('ce-b-0807', c, '2026-12-01', pg_temp.iv_ver(c, '2026-12-01'));
  res := public.undo_invoice_payment('ce-b-0808', c, '2026-11-01', pg_temp.iv_ver(c, '2026-11-01'));
  assert pg_temp.cm(c, '2026-12-01') like '40000 %' and pg_temp.cm(c, '2026-11-01') like '78270 % aberto %', 'tudo desfeito';
  -- Pagar parcial novembro com dezembro já paga: recusado (fatura_seguinte_paga) e nada muda.
  res := public.pay_invoice('ce-b-0809', c, '2026-12-01', pg_temp.iv_ver(c, '2026-12-01'), 40000, '2026-11-12');
  perform pg_temp.expect_code(pg_temp.pi('ce-b-0810', c, '2026-11-01', pg_temp.iv_ver(c, '2026-11-01'), 70000, '2026-11-12'), 'fatura_seguinte_paga', 'PT409');
  res := public.pay_invoice('ce-b-0811', c, '2026-11-01', pg_temp.iv_ver(c, '2026-11-01'), 78270, '2026-11-12');   -- total: sem saldo, passa
  assert res #>> '{invoices,0,status}' = 'paga', 'pagamento total com a seguinte paga é aceito';
  res := public.undo_invoice_payment('ce-b-0812', c, '2026-11-01', pg_temp.iv_ver(c, '2026-11-01'));
  res := public.undo_invoice_payment('ce-b-0813', c, '2026-12-01', pg_temp.iv_ver(c, '2026-12-01'));
  perform pg_temp.check_links();
  perform pg_temp.views_agree();

  -- Fim: de volta a 07/10/2026, nenhum número de outubro mudou em toda a sequência.
  perform pg_temp.today('2026-10-07');
  assert pg_temp.money_oct('bia_ctx') = (select v from snap where name = 'oct'),
    'fim: Recebido 6.000,00, Pago 3.900,00, Diferença 2.100,00, Ainda a pagar 650,00 e 52,5% em outubro';
end $$;

-- ---------------------------------------------------------------------------
-- 6. Estorno, encargo, crédito levado à fatura seguinte e saldo anterior (Noel, hoje 07/10/2026; cartões fecham dia 5 e
-- vencem dia 12). Total negativo: sem conta a pagar; o crédito vira UM estorno automático na fatura seguinte, enquanto
-- houver lançamento comum para recebê-lo; mudar ou excluir um lançamento ajusta ou desfaz o encadeamento. Lançamentos
-- automáticos não se alteram nem se excluem.
-- ---------------------------------------------------------------------------
do $$
declare
  ctx uuid := pg_temp.id('noel_ctx');
  acc uuid := pg_temp.id('noel_acc');
  res jsonb;
  k uuid;
  tv uuid;
  r1 uuid;
  r2 uuid;
  r3 uuid;
  ch uuid;
  auto uuid;
begin
  perform pg_temp.as_('noel');
  k := (public.create_card('cd-c-0001', ctx, 'Crédito', null, 5, 12, null) #>> '{card,id}')::uuid;
  insert into ids values ('noel_ck', k);
  tv := (public.add_card_purchase('cd-c-0002', k, '2026-10-07', 90000, 3, 'TV', 'Moradia') #>> '{entry,id}')::uuid;
  assert pg_temp.ivs(k) = '2026-11:30000 2026-12:30000 2027-01:30000', 'TV em 3 vezes de 300,00';

  -- Estorno de 500,00 em novembro (fatura de 300,00): total -200,00; sem conta; o crédito de 200,00 vai para dezembro.
  perform pg_temp.expect_code(pg_temp.arf('cd-c-0010', k, '2026-11-01', 0, 'x'), 'valor_invalido', '22023');
  perform pg_temp.expect_code(pg_temp.arf('cd-c-0011', k, '2026-11-01', 1000000000, ''), 'valor_acima_do_limite', '22023');
  perform pg_temp.expect_code(pg_temp.arf('cd-c-0012', k, '2026-11-01', 100, ''), 'descricao_obrigatoria', '22023');
  perform pg_temp.expect_code(pg_temp.arf('cd-c-0013', k, '2026-11-01', 100, repeat('d', 81)), 'descricao_longa', '22023');
  perform pg_temp.expect_code(pg_temp.arf('cd-c-0014', k, '2026-11-01', 100, 'x', repeat('c', 41)), 'categoria_invalida', '22023');
  perform pg_temp.expect_code(pg_temp.arf('cd-c-0015', k, '2026-11-15', 100, 'x'), 'mes_invalido', '22023');
  perform pg_temp.expect_code(pg_temp.arf('cd-c-0016', k, null, 100, 'x'), 'mes_invalido', '22023');
  perform pg_temp.expect_code(pg_temp.arf('cd-c-0017', k, '2022-09-01', 100, 'x'), 'mes_invalido', '22023');
  perform pg_temp.expect_code(pg_temp.arf('cd-c-0018', k, '2030-11-01', 100, 'x'), 'mes_invalido', '22023');
  perform pg_temp.expect_code(pg_temp.ach('cd-c-0019', k, '2026-11-01', 'taxa', 100), 'tipo_de_encargo_invalido', '22023');
  perform pg_temp.expect_code(pg_temp.ach('cd-c-0020', k, '2026-11-01', null, 100), 'tipo_de_encargo_invalido', '22023');
  perform pg_temp.expect_code(pg_temp.ach('cd-c-0021', k, '2026-11-01', 'juros', 0), 'valor_invalido', '22023');
  perform pg_temp.expect_code(pg_temp.ach('cd-c-0022', k, '2026-11-01', 'juros', 1000000000), 'valor_acima_do_limite', '22023');
  perform pg_temp.expect_code(pg_temp.ach('cd-c-0023', k, '2026-11-02', 'juros', 100), 'mes_invalido', '22023');
  perform pg_temp.expect_code(pg_temp.ach('cd-c-0024', k, '2022-09-01', 'juros', 100), 'mes_invalido', '22023');
  perform pg_temp.expect_code(pg_temp.ach('cd-c-0025', k, '2030-11-01', 'juros', 100), 'mes_invalido', '22023');
  perform pg_temp.expect_code(pg_temp.ach('cd-c-0026', k, null, 'xx', 0), 'tipo_de_encargo_invalido', '22023');
  -- Limites do intervalo da fatura: 48 meses antes e 48 meses depois do mês de hoje.
  perform public.delete_card_entry('cd-c-0027', (public.add_card_charge('cd-c-0028', k, '2022-10-01', 'tarifa', 100) #>> '{entry,id}')::uuid, 1);
  perform public.delete_card_entry('cd-c-0029', (public.add_card_charge('cd-c-0030', k, '2030-10-01', 'tarifa', 100) #>> '{entry,id}')::uuid, 1);
  assert pg_temp.ivs(k) = '2026-11:30000 2026-12:30000 2027-01:30000', 'encargos nos limites entram e saem';

  res := public.add_card_refund('cd-c-0040', k, '2026-11-01', 50000, 'Devolução parcial', 'Moradia');
  r1 := (res #>> '{entry,id}')::uuid;
  assert pg_temp.iv(k, '2026-11-01') = 'aberta -20000 sem-conta' and (select credit_cents from public.invoice_items where card_id = k and month = '2026-11-01') = 20000
     and pg_temp.cm(k, '2026-11-01') = '-', 'novembro: total negativo, sem conta a pagar, crédito de 200,00';
  assert (select amount_is_estimate from public.invoice_items where card_id = k and month = '2026-11-01'), 'sem conta, a fatura aberta segue estimada (hoje <= fechamento)';
  assert pg_temp.cm(k, '2026-12-01') = '10000 2026-12-12 2026-12-05 aberto v2 estimado' and pg_temp.ents(k, '2026-12-01') = 'estorno:20000 parcela:30000',
    'dezembro: 300,00 - 200,00 de crédito levado = 100,00';
  select id into auto from public.card_entries where card_id = k and source_month = '2026-11-01' and kind = 'estorno' and deleted_at is null;
  assert (select (invoice_month, description, category, created_by, version) from public.card_entries where id = auto)
       = ('2026-12-01'::date, null::text, null::text, pg_temp.id('noel'), 1), 'estorno automático: sem texto, na fatura seguinte';
  assert (select (kind, source_month, description, amount_cents) from public.card_entry_items where id = auto) = ('estorno'::text, '2026-11-01'::date, null::text, 20000::bigint),
    'o app lê o estorno automático com sourceMonth';
  assert jsonb_array_length(res -> 'invoices') = 1 and res #>> '{invoices,0,status}' = 'aberta' and (res #>> '{invoices,0,credit_cents}')::bigint = 20000
     and jsonb_array_length(res -> 'commitments') = 2, 'retorno: a fatura negativa, e só duas contas vivas (dezembro e janeiro)';
  perform pg_temp.check_links();
  perform pg_temp.views_agree();

  -- O estorno automático não se altera nem se exclui (lancamento_automatico), antes de tipo, versão e campos.
  perform pg_temp.expect_code(pg_temp.ue('cd-c-0041', auto, 1, 'estorno', 100, null, 'x', null, null, '2026-12-01'), 'lancamento_automatico', 'PT409');
  perform pg_temp.expect_code(pg_temp.ue('cd-c-0042', auto, 99, 'compra', 100, null, 'x', null), 'lancamento_automatico', 'PT409');
  perform pg_temp.expect_code(pg_temp.de('cd-c-0043', auto, 1), 'lancamento_automatico', 'PT409');
  perform pg_temp.expect_code(pg_temp.de('cd-c-0044', auto, 99), 'lancamento_automatico', 'PT409');

  -- Estorno de 400,00 em dezembro: total -300,00 (-400 + 300 - 200 + ... ) e o crédito de 300,00 vai para janeiro, que fica com 0,00.
  res := public.add_card_refund('cd-c-0050', k, '2026-12-01', 40000, 'Outra devolução', null);
  r2 := (res #>> '{entry,id}')::uuid;
  assert pg_temp.ivs(k) = '2026-11:-20000 2026-12:-30000 2027-01:0' and pg_temp.cm(k, '2026-12-01') = '-' and pg_temp.cm(k, '2027-01-01') = '-',
    'dezembro -300,00; janeiro 0,00 (300,00 de parcela e 300,00 de crédito): nenhuma conta';
  assert pg_temp.ents(k, '2027-01-01') = 'estorno:30000 parcela:30000', 'janeiro com o crédito de 300,00';
  -- Estorno de 300,00 em janeiro: janeiro -300,00. Não há fatura depois com lançamento comum: o crédito fica em janeiro.
  res := public.add_card_refund('cd-c-0051', k, '2027-01-01', 30000, 'Mais uma devolução', null);
  r3 := (res #>> '{entry,id}')::uuid;
  assert pg_temp.ivs(k) = '2026-11:-20000 2026-12:-30000 2027-01:-30000' and pg_temp.ents(k, '2027-02-01') = '-',
    'sem lançamento comum depois de janeiro, o crédito fica em janeiro (nada corre para o infinito)';
  perform pg_temp.check_links();
  perform pg_temp.views_agree();
  -- Encargo de 100,00 em março: agora há onde receber o crédito: ele passa por fevereiro e chega a março.
  res := public.add_card_charge('cd-c-0052', k, '2027-03-01', 'anuidade', 10000);
  ch := (res #>> '{entry,id}')::uuid;
  assert pg_temp.ivs(k) = '2026-11:-20000 2026-12:-30000 2027-01:-30000 2027-02:-30000 2027-03:-20000'
     and pg_temp.ents(k, '2027-02-01') = 'estorno:30000' and pg_temp.ents(k, '2027-03-01') = 'encargo:10000 estorno:30000',
    'o crédito de janeiro segue por fevereiro e termina em março (que recebe o encargo)';
  perform pg_temp.check_links();
  -- Excluir o encargo desfaz fevereiro e março (a rodada começa na fatura negativa mais antiga).
  perform public.delete_card_entry('cd-c-0053', ch, 1);
  assert pg_temp.ivs(k) = '2026-11:-20000 2026-12:-30000 2027-01:-30000' and pg_temp.ents(k, '2027-02-01') = '-' and pg_temp.ents(k, '2027-03-01') = '-',
    'sem o encargo, o encadeamento é desfeito';
  perform pg_temp.check_links();
  perform pg_temp.views_agree();
  -- Uma compra de 200,00 à vista em novembro: novembro zera e dezembro passa a levar 100,00 de crédito, não 200,00.
  res := public.add_card_purchase('cd-c-0054', k, '2026-10-07', 20000, 1, 'Cadeira', 'Moradia');
  assert pg_temp.ivs(k) = '2026-11:0 2026-12:-10000 2027-01:-10000' and pg_temp.ents(k, '2026-12-01') = 'estorno:40000 parcela:30000'
     and pg_temp.ents(k, '2027-01-01') = 'estorno:30000 estorno:10000 parcela:30000', 'o crédito de dezembro é de 100,00';
  assert pg_temp.cm(k, '2026-11-01') = '-', 'novembro com total zero não tem conta';
  perform pg_temp.check_links();
  perform pg_temp.views_agree();
  -- Alterar o estorno de novembro para 100,00: novembro 300,00 + 200,00 - 100,00 = 400,00, com conta; dezembro 300,00 - 400,00 = -100,00.
  res := public.update_card_entry('cd-c-0055', r1, 1, 'estorno', 10000, null, 'Devolução parcial', 'Moradia', null, '2026-11-01', null);
  assert (res #>> '{entry,amount_cents}')::bigint = 10000 and (res #>> '{entry,version}')::int = 2, 'estorno alterado';
  assert pg_temp.ivs(k) = '2026-11:40000 2026-12:-10000 2027-01:-10000' and pg_temp.cm(k, '2026-11-01') like '40000 %', 'novembro volta a ter conta';
  perform pg_temp.check_links();
  -- Mover o estorno de novembro para dezembro: novembro 500,00; dezembro 300,00 - 400,00 - 100,00 = -200,00; janeiro leva 200,00.
  res := public.update_card_entry('cd-c-0056', r1, 2, 'estorno', 10000, null, 'Devolução parcial', 'Moradia', null, '2026-12-01', null);
  assert pg_temp.ivs(k) = '2026-11:50000 2026-12:-20000 2027-01:-20000' and pg_temp.ents(k, '2027-01-01') = 'estorno:30000 estorno:20000 parcela:30000',
    'mudar a fatura do estorno ajusta as duas e o crédito';
  perform pg_temp.check_links();
  perform pg_temp.views_agree();
  -- Excluir tudo o que foi lançado e a compra: não sobra fatura nem conta nem lançamento automático.
  perform public.delete_card_entry('cd-c-0057', r1, 3);
  perform public.delete_card_entry('cd-c-0058', r2, 1);
  perform public.delete_card_entry('cd-c-0059', r3, 1);
  perform public.delete_card_entry('cd-c-0060', (select id from public.card_entry_items where card_id = k and description = 'Cadeira'), 1);
  perform public.delete_card_entry('cd-c-0061', tv, 1);
  assert (select count(*) from public.invoice_items where card_id = k) = 0 and (select count(*) from public.commitments where card_id = k and deleted_at is null) = 0
     and not exists (select 1 from public.card_entry_items where card_id = k), 'tudo desfeito';
  perform pg_temp.check_links();

  -- Crédito levado a uma fatura já paga: recusado (fatura_seguinte_paga), nada muda.
  k := (public.create_card('cd-c-0070', ctx, 'Crédito 2', null, 5, 12, null) #>> '{card,id}')::uuid;
  insert into ids values ('noel_ck2', k);
  res := public.add_card_purchase('cd-c-0071', k, '2026-10-07', 60000, 2, 'Cama', 'Moradia');
  tv := (res #>> '{entry,id}')::uuid;
  -- Só se paga fatura fechada: dezembro fecha em 05/12, então o pagamento é em 06/12 (hoje volta a 07/10 no fim do bloco).
  perform pg_temp.expect_code(pg_temp.pi('cd-c-0072', k, '2026-12-01', pg_temp.iv_ver(k, '2026-12-01'), 30000, '2026-10-07'), 'fatura_aberta', 'PT409');
  perform pg_temp.today('2026-12-06');
  res := public.pay_invoice('cd-c-0072', k, '2026-12-01', pg_temp.iv_ver(k, '2026-12-01'), 30000, '2026-12-06');
  assert res #>> '{invoices,0,status}' = 'paga', 'dezembro paga';
  perform pg_temp.expect_code(pg_temp.arf('cd-c-0073', k, '2026-11-01', 40000, 'Devolução grande'), 'fatura_seguinte_paga', 'PT409');
  assert pg_temp.ivs(k) = '2026-11:30000 2026-12:30000' and (select count(*) from public.card_entries where card_id = k) = 2
     and (select count(*) from public.record_operations where idempotency_key = 'cd-c-0073') = 0, 'a recusa desfez o estorno';
  res := public.add_card_refund('cd-c-0074', k, '2026-11-01', 20000, 'Devolução pequena', null);
  assert pg_temp.ivs(k) = '2026-11:10000 2026-12:30000', 'estorno menor que a fatura não leva crédito';
  -- Aumentar o estorno para passar da fatura também é recusado (a seguinte está paga).
  perform pg_temp.expect_code(pg_temp.ue('cd-c-0075', (res #>> '{entry,id}')::uuid, 1, 'estorno', 31000, null, 'Devolução pequena', null, null, '2026-11-01', null),
    'fatura_seguinte_paga', 'PT409');
  res := public.undo_invoice_payment('cd-c-0076', k, '2026-12-01', pg_temp.iv_ver(k, '2026-12-01'));
  perform pg_temp.check_links();

  -- Saldo anterior: criado só pelo pagamento parcial; não se altera nem se exclui.
  res := public.pay_invoice('cd-c-0080', k, '2026-11-01', pg_temp.iv_ver(k, '2026-11-01'), 6000, '2026-12-06');
  auto := (res #>> '{entry,id}')::uuid;
  assert (res #>> '{entry,amount_cents}')::bigint = 4000 and pg_temp.cm(k, '2026-12-01') like '34000 %', 'saldo anterior de 40,00 em dezembro';
  perform pg_temp.expect_code(pg_temp.ue('cd-c-0081', auto, 1, 'saldo_anterior', 100, null, null, null), 'lancamento_automatico', 'PT409');
  perform pg_temp.expect_code(pg_temp.ue('cd-c-0082', auto, 1, 'estorno', 100, null, 'x', null, null, '2026-12-01'), 'lancamento_automatico', 'PT409');
  perform pg_temp.expect_code(pg_temp.de('cd-c-0083', auto, 1), 'lancamento_automatico', 'PT409');
  -- Nenhum caminho cria saldo anterior à mão: encargo, estorno e compra não aceitam o tipo.
  perform pg_temp.expect_code(pg_temp.ach('cd-c-0084', k, '2026-12-01', 'saldo_anterior', 100), 'tipo_de_encargo_invalido', '22023');
  res := public.undo_invoice_payment('cd-c-0085', k, '2026-11-01', pg_temp.iv_ver(k, '2026-11-01'));
  assert pg_temp.cm(k, '2026-12-01') like '30000 %' and (select count(*) from public.card_entries where payment_record_id is not null and deleted_at is null) = 0,
    'desfeito o pagamento, o saldo anterior sai';
  perform public.delete_card_entry('cd-c-0086', (select id from public.card_entry_items where card_id = k and kind = 'estorno'), 1);
  perform public.delete_card_entry('cd-c-0087', tv, 1);
  perform pg_temp.check_links();
  perform pg_temp.views_agree();
  perform pg_temp.today('2026-10-07');
end $$;

-- ---------------------------------------------------------------------------
-- 7. Alterar e excluir lançamentos (Noel, hoje 07/10/2026): tipo, versão, campos que não se aplicam, validação na ordem de
-- add_*, compra (descrição, total, parcelas para mais e para menos, data), encargo e estorno, o cartão que muda de dias e de
-- apelido, a data da compra só conferida quando muda, excluir e a versão em lockstep das parcelas.
-- ---------------------------------------------------------------------------
do $$
declare
  ctx uuid := pg_temp.id('noel_ctx');
  res jsonb;
  e uuid;
  s uuid;
  ch uuid;
  rf uuid;
  v int;
begin
  perform pg_temp.as_('noel');
  e := (public.create_card('cd-e-0001', ctx, 'Edições', null, 5, 12, null) #>> '{card,id}')::uuid;
  insert into ids values ('noel_ce', e);
  s := (public.add_card_purchase('cd-e-0002', e, '2026-10-07', 30000, 3, 'Sofá', 'Moradia') #>> '{entry,id}')::uuid;
  assert pg_temp.ivs(e) = '2026-11:10000 2026-12:10000 2027-01:10000', 'Sofá em 3 vezes de 100,00';

  -- Tipo (antes da versão), versão e campos que não se aplicam.
  perform pg_temp.expect_code(pg_temp.ue('cd-e-0010', s, 99, 'encargo', 30000, null, null, null, null, '2026-11-01', 'juros'), 'tipo_invalido', '22023');
  perform pg_temp.expect_code(pg_temp.ue('cd-e-0011', s, 99, 'estorno', 30000, null, 'x', null, null, '2026-11-01'), 'tipo_invalido', '22023');
  perform pg_temp.expect_code(pg_temp.ue('cd-e-0012', s, 99, 'xx', 30000, '2026-10-07', 'Sofá', null, 3), 'tipo_invalido', '22023');
  perform pg_temp.expect_code(pg_temp.ue('cd-e-0013', s, 99, null, 30000, '2026-10-07', 'Sofá', null, 3), 'tipo_invalido', '22023');
  perform pg_temp.expect_code(pg_temp.ue('cd-e-0014', s, 99, 'parcela', 30000, '2026-10-07', 'Sofá', null, 3), 'tipo_invalido', '22023');
  perform pg_temp.expect_stale(pg_temp.ue('cd-e-0015', s, 2, 'compra', 30000, '2026-10-07', 'Sofá', null, 3), 'versao_atual=1');
  perform pg_temp.expect_stale(pg_temp.ue('cd-e-0016', s, null, 'compra', 30000, '2026-10-07', 'Sofá', null, 3), 'versao_atual=1');
  perform pg_temp.expect_stale(pg_temp.ue('cd-e-0017', s, 0, 'compra', 0, null, '', null, null), 'versao_atual=1');
  perform pg_temp.expect_code(pg_temp.ue('cd-e-0018', s, 1, 'compra', 30000, '2026-10-07', 'Sofá', 'Moradia', 3, '2026-11-01'), 'campo_nao_se_aplica', '22023');
  perform pg_temp.expect_code(pg_temp.ue('cd-e-0019', s, 1, 'compra', 30000, '2026-10-07', 'Sofá', 'Moradia', 3, null, 'juros'), 'campo_nao_se_aplica', '22023');

  -- Validação da compra na ordem de add_card_purchase.
  perform pg_temp.expect_code(pg_temp.ue('cd-e-0020', s, 1, 'compra', 0, null, '', null, 0), 'valor_invalido', '22023');
  perform pg_temp.expect_code(pg_temp.ue('cd-e-0021', s, 1, 'compra', 1000000000, null, '', null, 0), 'valor_acima_do_limite', '22023');
  perform pg_temp.expect_code(pg_temp.ue('cd-e-0022', s, 1, 'compra', 30000, null, null, null, 0), 'descricao_obrigatoria', '22023');
  perform pg_temp.expect_code(pg_temp.ue('cd-e-0023', s, 1, 'compra', 30000, null, repeat('d', 81), null, 0), 'descricao_longa', '22023');
  perform pg_temp.expect_code(pg_temp.ue('cd-e-0024', s, 1, 'compra', 30000, null, 'x', repeat('c', 41), 0), 'categoria_invalida', '22023');
  perform pg_temp.expect_code(pg_temp.ue('cd-e-0025', s, 1, 'compra', 30000, null, 'x', null, 49), 'parcelas_invalidas', '22023');
  perform pg_temp.expect_code(pg_temp.ue('cd-e-0026', s, 1, 'compra', 2, '2026-10-07', 'x', null, 3), 'parcelas_invalidas', '22023');
  perform pg_temp.expect_code(pg_temp.ue('cd-e-0027', s, 1, 'compra', 30000, null, 'x', null, 3), 'data_invalida', '22023');
  perform pg_temp.expect_code(pg_temp.ue('cd-e-0028', s, 1, 'compra', 30000, '2022-09-30', 'x', null, 3), 'data_invalida', '22023');
  perform pg_temp.expect_code(pg_temp.ue('cd-e-0029', s, 1, 'compra', 30000, '2026-10-08', 'x', null, 3), 'data_futura', '22023');
  assert pg_temp.entv(s) = 1 and pg_temp.ivs(e) = '2026-11:10000 2026-12:10000 2027-01:10000' and (select count(*) from public.record_operations where idempotency_key like 'cd-e-00%' and idempotency_key <> 'cd-e-0001' and idempotency_key <> 'cd-e-0002') = 0,
    'recusas não mudam nada';

  -- Só descrição e categoria: todas as parcelas sobem para a versão 2; as contas das faturas não mudam.
  res := public.update_card_entry('cd-e-0030', s, 1, 'compra', 30000, '2026-10-07', '  Sofá novo ', 'Lazer', 3);
  assert res #>> '{entry,description}' = 'Sofá novo' and res #>> '{entry,category}' = 'Lazer' and (res #>> '{entry,version}')::int = 2
     and (select bool_and(version = 2 and description = 'Sofá novo' and category = 'Lazer') from public.card_entries where purchase_id = s)
     and pg_temp.cm(e, '2026-11-01') like '10000 % v1 estimado', 'descrição e categoria nas três parcelas; as contas ficam como estavam';
  assert (select request_hash from public.record_operations where idempotency_key = 'cd-e-0030')
       = md5(format('["alterar_lancamento_cartao", "%s", 1, "compra", 30000, "2026-10-07", "Sofá novo", "Lazer", 3, null, null]', s)), 'hash de alterar_lancamento_cartao';
  assert (select (action, target_id, entry_id) is not distinct from ('alterar_lancamento_cartao', e, s) from public.record_operations where idempotency_key = 'cd-e-0030'),
    'operação: cartão em target_id e compra em entry_id';
  assert public.update_card_entry('cd-e-0030', s, 1, 'compra', 30000, '2026-10-07', 'Sofá novo', 'Lazer', 3) = res, 'repetição devolve o estado atual';
  perform pg_temp.expect_code(pg_temp.ue('cd-e-0030', s, 1, 'compra', 30000, '2026-10-07', 'Sofá novo', 'Lazer', 4), 'chave_reutilizada', 'PT409');
  perform pg_temp.expect_code(pg_temp.dc('cd-e-0030', e, 1), 'chave_reutilizada', 'PT409');
  perform pg_temp.check_links();

  -- Total de R$ 400,00 em 3 vezes: 133,34 + 133,33 + 133,33; as contas acompanham.
  res := public.update_card_entry('cd-e-0031', s, 2, 'compra', 40000, '2026-10-07', 'Sofá novo', 'Lazer', 3);
  assert (select array_agg(amount_cents order by installment_number) from public.card_entries where purchase_id = s) = array[13334, 13333, 13333]::bigint[]
     and pg_temp.ivs(e) = '2026-11:13334 2026-12:13333 2027-01:13333' and (res #>> '{entry,amount_cents}')::bigint = 40000
     and (select bool_and(purchase_total_cents = 40000 and version = 3) from public.card_entries where purchase_id = s), 'total 400,00';
  -- Para 5 vezes: 80,00 cada; as parcelas 4 e 5 nascem na versão da compra; fevereiro e março ganham conta.
  res := public.update_card_entry('cd-e-0032', s, 3, 'compra', 40000, '2026-10-07', 'Sofá novo', 'Lazer', 5);
  assert pg_temp.ivs(e) = '2026-11:8000 2026-12:8000 2027-01:8000 2027-02:8000 2027-03:8000' and (res #>> '{entry,installments}')::int = 5
     and (select bool_and(version = 4 and installment_total = 5 and amount_cents = 8000) from public.card_entries where purchase_id = s and deleted_at is null)
     and (select count(*) from public.card_entries where purchase_id = s and deleted_at is null) = 5
     and pg_temp.cm(e, '2027-03-01') = '8000 2027-03-12 2027-03-05 aberto v1 estimado' and jsonb_array_length(res -> 'entries') = 5
     and (select bool_and(created_by = pg_temp.id('noel')) from public.card_entries where purchase_id = s), '5 vezes de 80,00';
  assert (select id from public.card_entries where purchase_id = s and installment_number = 1) = s, 'a primeira parcela continua sendo o id da compra';
  perform pg_temp.check_links();
  -- Para 2 vezes: 200,00 cada; as parcelas 3 a 5 saem (excluídas, versão +1) e janeiro a março perdem a conta.
  res := public.update_card_entry('cd-e-0033', s, 4, 'compra', 40000, '2026-10-07', 'Sofá novo', 'Lazer', 2);
  assert pg_temp.ivs(e) = '2026-11:20000 2026-12:20000' and pg_temp.cm(e, '2027-01-01') = '-' and pg_temp.cm(e, '2027-03-01') = '-'
     and (select count(*) from public.card_entries where purchase_id = s and deleted_at is null) = 2
     and pg_temp.pcount(s, true) = 3 and (select bool_and(x = 5) from unnest(pg_temp.pvers(s)) x)
     and jsonb_array_length(res -> 'entries') = 2, '2 vezes de 200,00';
  -- Para 3 de novo: a parcela 3 volta como linha nova (a excluída fica de rastro).
  res := public.update_card_entry('cd-e-0034', s, 5, 'compra', 40000, '2026-10-07', 'Sofá novo', 'Lazer', 3);
  assert pg_temp.pcount(s, null, 3) = 2
     and (select count(*) from public.card_entries where purchase_id = s and installment_number = 3 and deleted_at is null) = 1
     and pg_temp.ivs(e) = '2026-11:13334 2026-12:13333 2027-01:13333', '3 vezes de novo';
  perform pg_temp.check_links();
  perform pg_temp.views_agree();
  res := public.update_card_entry('cd-e-0035', s, 6, 'compra', 40000, '2026-10-07', 'Sofá novo', 'Lazer', 2);
  -- Data da compra no dia do fechamento (05/10): a primeira fatura passa a ser a de outubro (fechada, valor firme).
  res := public.update_card_entry('cd-e-0036', s, 7, 'compra', 40000, '2026-10-05', 'Sofá novo', 'Lazer', 2);
  assert res #>> '{entry,invoice_month}' = '2026-10-01' and res #>> '{entry,purchased_on}' = '2026-10-05'
     and pg_temp.ivs(e) = '2026-10:20000 2026-11:20000' and pg_temp.cm(e, '2026-10-01') = '20000 2026-10-12 2026-10-05 aberto v1 firme'
     and pg_temp.cm(e, '2026-12-01') = '-', 'compra no dia do fechamento: outubro e novembro; dezembro sem conta';
  perform pg_temp.check_links();

  -- Encargo: alterar valor, tipo e fatura; estorno: valor, descrição, categoria e fatura.
  ch := (public.add_card_charge('cd-e-0040', e, '2026-11-01', 'juros', 500) #>> '{entry,id}')::uuid;
  perform pg_temp.expect_code(pg_temp.ue('cd-e-0041', ch, 1, 'encargo', 500, '2026-11-01', null, null, null, '2026-11-01', 'juros'), 'campo_nao_se_aplica', '22023');
  perform pg_temp.expect_code(pg_temp.ue('cd-e-0042', ch, 1, 'encargo', 500, null, 'x', null, null, '2026-11-01', 'juros'), 'campo_nao_se_aplica', '22023');
  perform pg_temp.expect_code(pg_temp.ue('cd-e-0043', ch, 1, 'encargo', 500, null, null, 'c', null, '2026-11-01', 'juros'), 'campo_nao_se_aplica', '22023');
  perform pg_temp.expect_code(pg_temp.ue('cd-e-0044', ch, 1, 'encargo', 500, null, null, null, 2, '2026-11-01', 'juros'), 'campo_nao_se_aplica', '22023');
  perform pg_temp.expect_code(pg_temp.ue('cd-e-0045', ch, 1, 'encargo', 500, null, '  ', null, null, '2026-11-01', 'taxa'), 'tipo_de_encargo_invalido', '22023');
  perform pg_temp.expect_code(pg_temp.ue('cd-e-0046', ch, 1, 'encargo', 0, null, null, null, null, '2026-11-01', 'juros'), 'valor_invalido', '22023');
  perform pg_temp.expect_code(pg_temp.ue('cd-e-0047', ch, 1, 'encargo', 500, null, null, null, null, null, 'juros'), 'mes_invalido', '22023');
  perform pg_temp.expect_code(pg_temp.ue('cd-e-0048', ch, 1, 'encargo', 500, null, null, null, null, '2026-11-02', 'juros'), 'mes_invalido', '22023');
  perform pg_temp.expect_code(pg_temp.ue('cd-e-0049', ch, 1, 'estorno', 500, null, 'x', null, null, '2026-11-01'), 'tipo_invalido', '22023');
  res := public.update_card_entry('cd-e-0050', ch, 1, 'encargo', 700, null, null, null, null, '2026-12-01', 'multa');
  assert res #>> '{entry,charge_kind}' = 'multa' and (res #>> '{entry,amount_cents}')::bigint = 700 and res #>> '{entry,invoice_month}' = '2026-12-01'
     and (res #>> '{entry,version}')::int = 2 and pg_temp.ivs(e) = '2026-10:20000 2026-11:20000 2026-12:700', 'encargo movido para dezembro: multa de 7,00';
  assert pg_temp.cm(e, '2026-12-01') like '700 %' and (select (charges_cents, total_cents) from public.invoice_items where card_id = e and month = '2026-12-01') = (700::bigint, 700::bigint),
    'dezembro tem conta só do encargo';
  rf := (public.add_card_refund('cd-e-0051', e, '2026-11-01', 1000, 'Estorno', null) #>> '{entry,id}')::uuid;
  perform pg_temp.expect_code(pg_temp.ue('cd-e-0052', rf, 1, 'estorno', 1000, null, '', null, null, '2026-11-01'), 'descricao_obrigatoria', '22023');
  perform pg_temp.expect_code(pg_temp.ue('cd-e-0053', rf, 1, 'estorno', 1000, '2026-11-01', 'x', null, null, '2026-11-01'), 'campo_nao_se_aplica', '22023');
  perform pg_temp.expect_code(pg_temp.ue('cd-e-0054', rf, 1, 'estorno', 1000, null, 'x', null, 2, '2026-11-01'), 'campo_nao_se_aplica', '22023');
  perform pg_temp.expect_code(pg_temp.ue('cd-e-0055', rf, 1, 'estorno', 1000, null, 'x', null, null, '2026-11-01', 'juros'), 'campo_nao_se_aplica', '22023');
  perform pg_temp.expect_code(pg_temp.ue('cd-e-0056', rf, 1, 'encargo', 1000, null, null, null, null, '2026-11-01', 'juros'), 'tipo_invalido', '22023');
  perform pg_temp.expect_code(pg_temp.ue('cd-e-0057', rf, 1, 'estorno', 1000, null, 'x', null, null, '2030-12-01'), 'mes_invalido', '22023');
  res := public.update_card_entry('cd-e-0058', rf, 1, 'estorno', 2500, null, 'Devolução da lâmpada', 'Moradia', null, '2026-11-01', null);
  assert res #>> '{entry,description}' = 'Devolução da lâmpada' and res #>> '{entry,category}' = 'Moradia' and (res #>> '{entry,amount_cents}')::bigint = 2500
     and pg_temp.ivs(e) = '2026-10:20000 2026-11:17500 2026-12:700', 'estorno alterado: novembro 175,00';
  perform pg_temp.check_links();
  perform pg_temp.views_agree();

  -- O cartão muda de dias e de apelido: as contas em aberto seguem (vencimento, fechamento, estimado, apelido); os
  -- lançamentos ficam nas faturas em que foram lançados. A compra de hoje passa a cair na fatura com o fechamento novo.
  res := public.update_card('cd-e-0060', e, 1, 'Edições 2', null, 10, 15, null);
  assert pg_temp.cm(e, '2026-10-01') = '20000 2026-10-15 2026-10-10 aberto v2 estimado' and pg_temp.cm(e, '2026-11-01') like '17500 2026-11-15 2026-11-10 aberto % estimado'
     and (select bool_and(description = 'Fatura Edições 2') from public.commitments where card_id = e and deleted_at is null)
     and pg_temp.ivs(e) = '2026-10:20000 2026-11:17500 2026-12:700', 'contas em aberto seguem o cartão';
  assert (select invoice_month from public.card_entry_items where id = s) = '2026-10-01', 'a compra continua na fatura em que foi lançada';
  res := public.add_card_purchase('cd-e-0061', e, '2026-10-07', 1000, 1, 'Novo', null);
  assert res #>> '{entry,invoice_month}' = '2026-10-01', 'com fechamento no dia 10, a compra de 07/10 cai em outubro';
  -- Fatura paga não acompanha o cartão: os dias gravados na conta ficam.
  -- A fatura de outubro fecha em 10/10 (dia 10): paga-se em 11/10.
  perform pg_temp.today('2026-10-11');
  res := public.pay_invoice('cd-e-0062', e, '2026-10-01', pg_temp.iv_ver(e, '2026-10-01'), 21000, '2026-10-11');
  res := public.update_card('cd-e-0063', e, 2, 'Edições', null, 5, 12, null);
  assert pg_temp.cm(e, '2026-10-01') like '21000 2026-10-15 2026-10-10 quitado % firme' and pg_temp.cm(e, '2026-11-01') like '17500 2026-11-12 2026-11-05 aberto %'
     and (select description from public.commitments where id = pg_temp.cmid(e, '2026-10-01')) = 'Fatura Edições 2'
     and (select description from public.commitments where id = pg_temp.cmid(e, '2026-11-01')) = 'Fatura Edições', 'conta paga fica como estava';
  assert (select (closing_on, due_on, status) from public.invoice_items where card_id = e and month = '2026-10-01') = ('2026-10-10'::date, '2026-10-15'::date, 'paga'::text),
    'a fatura paga mostra o fechamento e o vencimento gravados';
  res := public.undo_invoice_payment('cd-e-0064', e, '2026-10-01', pg_temp.iv_ver(e, '2026-10-01'));
  assert pg_temp.cm(e, '2026-10-01') = '21000 2026-10-12 2026-10-05 aberto v' || (select version from public.commitments where id = pg_temp.cmid(e, '2026-10-01')) || ' firme',
    'reaberta, a conta segue os dias do cartão';
  perform pg_temp.today('2026-10-07');
  perform public.delete_card_entry('cd-e-0065', (select id from public.card_entry_items where card_id = e and description = 'Novo'), 1);
  perform pg_temp.check_links();

  -- A data da compra só é conferida (limite de 48 meses) quando muda. Em 15/11/2030 o limite é 01/11/2026.
  perform pg_temp.today('2030-11-15');
  v := pg_temp.entv(s);
  res := public.update_card_entry('cd-e-0070', s, v, 'compra', 40000, '2026-10-05', 'Sofá antigo', 'Lazer', 2);
  assert res #>> '{entry,description}' = 'Sofá antigo' and res #>> '{entry,purchased_on}' = '2026-10-05', 'descrição de compra antiga, sem mudar a data';
  perform pg_temp.expect_code(pg_temp.ue('cd-e-0071', s, v + 1, 'compra', 40000, '2026-10-31', 'Sofá antigo', 'Lazer', 2), 'data_invalida', '22023');
  perform pg_temp.expect_code(pg_temp.ap('cd-e-0072', e, '2026-10-31', 100, 1, 'Compra antiga'), 'data_invalida', '22023');
  res := public.add_card_purchase('cd-e-0073', e, '2026-11-01', 100, 1, 'No limite');
  assert res #>> '{entry,purchased_on}' = '2026-11-01', 'o primeiro dia do limite é aceito';
  perform public.delete_card_entry('cd-e-0074', (res #>> '{entry,id}')::uuid, 1);
  perform pg_temp.today('2026-10-07');
end $$;

-- ---------------------------------------------------------------------------
-- 8. Chave da nota fiscal (D-038): receipt_key em gastos (create_record) e em compras no cartão (add_card_purchase), única por
-- contexto entre os dois e entre os vivos. 44 dígitos com dígito verificador; sem dado pessoal; só em despesa; imutável.
-- ---------------------------------------------------------------------------
do $$
declare
  ctx uuid := pg_temp.id('noel_ctx');
  acc uuid := pg_temp.id('noel_acc');
  bia uuid := pg_temp.id('bia_ctx');
  biacc uuid := pg_temp.id('bia_acc');
  k1 text := '7ad0f9e89a093ba3fbaa6099be31f117c550f8171ac4acda57d090fba35af79e';
  k2 text := '077c629d7c0482086b714ca21caca21da5d16f10fab42112559e4dce9222ded2';
  k3 text := '2904729dae2e687811879a4343c29bb82be66b36778fca9a44ac9ce2070d58da';
  k4 text := '6c5f063ae093566da0ce927a802757cfd1d5c7be5ddf4889b1728e848f131c87';
  card uuid := (select id from public.cards where context_id = pg_temp.id('noel_ctx') and nickname = 'Compras');
  r public.financial_records;
  r2 public.financial_records;
  res jsonb;
  p uuid;
begin
  perform pg_temp.as_('noel');
  -- Sem chave: o hash é o da migração 0001 (cliente antigo continua reconhecido).
  r := public.create_record('cd-r-0001', ctx, acc, 'despesa', 1000, '2026-10-07', 'Café');
  assert r.receipt_key is null and (select request_hash from public.record_operations where idempotency_key = 'cd-r-0001')
       = md5('criar|' || ctx || '|' || acc || '|despesa|1000|2026-10-07|Café|'), 'sem chave: mesmo hash de antes';
  r := public.create_record('cd-r-0002', ctx, acc, 'despesa', 1000, '2026-10-07', 'Café', null, '   ');
  assert r.receipt_key is null and (select request_hash from public.record_operations where idempotency_key = 'cd-r-0002')
       = md5('criar|' || ctx || '|' || acc || '|despesa|1000|2026-10-07|Café|'), 'chave em branco é como nenhuma';

  -- Chave inválida: depois da validação do gasto (valor primeiro), só em despesa.
  perform pg_temp.expect_code(format('select public.create_record(%L, %L, %L, ''despesa'', 0, ''2026-10-07'', ''Mercado'', null, %L)', 'cd-r-0010', ctx, acc, 'x'), 'valor_invalido', '22023');
  perform pg_temp.expect_code(format('select public.create_record(%L, %L, %L, ''despesa'', 100, ''2026-10-08'', ''Mercado'', null, %L)', 'cd-r-0011', ctx, acc, 'x'), 'data_futura', '22023');
  perform pg_temp.expect_code(format('select public.create_record(%L, %L, %L, ''despesa'', 100, ''2026-10-07'', ''Mercado'', null, %L)', 'cd-r-0012', ctx, acc, 'x'), 'chave_de_nota_invalida', '22023');
  perform pg_temp.expect_code(format('select public.create_record(%L, %L, %L, ''despesa'', 100, ''2026-10-07'', ''Mercado'', null, %L)', 'cd-r-0013', ctx, acc, '33101234567800019065001000000123410000123455'), 'chave_de_nota_invalida', '22023');
  perform pg_temp.expect_code(format('select public.create_record(%L, %L, %L, ''despesa'', 100, ''2026-10-07'', ''Mercado'', null, %L)', 'cd-r-0014', ctx, acc, '3310123456780001906500100000012341000012345'), 'chave_de_nota_invalida', '22023');
  perform pg_temp.expect_code(format('select public.create_record(%L, %L, %L, ''despesa'', 100, ''2026-10-07'', ''Mercado'', null, %L)', 'cd-r-0015', ctx, acc, '077c629d7c0482086b714ca21caca21da5d16f10fab42112559e4dce9222ded20'), 'chave_de_nota_invalida', '22023');
  perform pg_temp.expect_code(format('select public.create_record(%L, %L, %L, ''despesa'', 100, ''2026-10-07'', ''Mercado'', null, %L)', 'cd-r-0016', ctx, acc, '3310123456780001906500100000012341000012345a'), 'chave_de_nota_invalida', '22023');
  perform pg_temp.expect_code(format('select public.create_record(%L, %L, %L, ''receita'', 100, ''2026-10-07'', ''Venda'', null, %L)', 'cd-r-0017', ctx, acc, k2), 'chave_de_nota_invalida', '22023');
  -- A chave de uma compra no cartão também é validada.
  perform pg_temp.expect_code(pg_temp.ap('cd-r-0018', card, '2026-10-07', 100, 1, 'x', null, '33101234567800019065001000000123410000123455'), 'chave_de_nota_invalida', '22023');
  perform pg_temp.expect_code(pg_temp.ap('cd-r-0019', card, '2026-10-07', 100, 1, 'x', null, '123'), 'chave_de_nota_invalida', '22023');
  assert (select count(*) from public.financial_records where receipt_key is not null) = 0, 'recusas não gravam';

  -- Gasto com chave: aparada, guardada, no hash.
  r := public.create_record('cd-r-0020', ctx, acc, 'despesa', 8740, '2026-10-06', 'Mercado', 'Mercado', '  ' || k1 || '  ');
  assert r.receipt_key = k1 and r.amount_cents = 8740 and r.card_id is null and r.invoice_month is null and r.commitment_id is null, 'gasto com a chave da nota';
  assert (select request_hash from public.record_operations where idempotency_key = 'cd-r-0020')
       = md5('criar|' || ctx || '|' || acc || '|despesa|8740|2026-10-06|Mercado|Mercado|' || k1), 'hash com a chave no fim';
  assert (select receipt_key from public.financial_records where id = r.id) = k1, 'lida pelo app';
  r2 := public.create_record('cd-r-0020', ctx, acc, 'despesa', 8740, '2026-10-06', 'Mercado', 'Mercado', k1);
  assert r2 = r, 'repetição devolve o mesmo gasto';
  perform pg_temp.expect_code(format('select public.create_record(%L, %L, %L, ''despesa'', 8740, ''2026-10-06'', ''Mercado'', ''Mercado'')', 'cd-r-0020', ctx, acc), 'chave_reutilizada', 'PT409');
  -- A mesma nota de novo (outra chave de idempotência): nota_ja_anotada, com o gasto no detalhe.
  perform pg_temp.expect_code(format('select public.create_record(%L, %L, %L, ''despesa'', 100, ''2026-10-07'', ''Outra'', null, %L)', 'cd-r-0021', ctx, acc, k1),
    'nota_ja_anotada', 'PT409', 'registro=' || r.id);
  assert (select count(*) from public.financial_records where receipt_key = k1) = 1 and (select count(*) from public.record_operations where idempotency_key = 'cd-r-0021') = 0,
    'a recusa não grava';
  -- Outro contexto pode anotar a mesma nota (Bia).
  perform pg_temp.as_('bia');
  r2 := public.create_record('cd-r-0022', bia, biacc, 'despesa', 8740, '2026-10-06', 'Mercado', null, k1);
  assert r2.receipt_key = k1 and r2.context_id = bia, 'cada contexto anota a sua';
  perform pg_temp.as_('noel');

  -- Editar o gasto mantém a chave; excluir o gasto libera a chave.
  r2 := public.update_record('cd-r-0023', r.id, 1, acc, 8800, '2026-10-06', 'Mercado do bairro', 'Mercado');
  assert r2.receipt_key = k1 and r2.amount_cents = 8800 and r2.version = 2, 'a edição não mexe na chave';
  perform pg_temp.expect_code(format('select public.create_record(%L, %L, %L, ''despesa'', 100, ''2026-10-07'', ''Outra'', null, %L)', 'cd-r-0024', ctx, acc, k1),
    'nota_ja_anotada', 'PT409', 'registro=' || r.id);
  r2 := public.delete_record('cd-r-0025', r.id, 2);
  assert r2.deleted_at is not null and r2.receipt_key = k1, 'a excluída guarda a chave de rastro';
  r2 := public.create_record('cd-r-0026', ctx, acc, 'despesa', 8800, '2026-10-06', 'Mercado do bairro', 'Mercado', k1);
  assert r2.receipt_key = k1 and r2.id <> r.id, 'chave livre depois de excluir o gasto';
  p := r2.id;

  -- Compra no cartão com a mesma nota viva: nota_ja_anotada com o gasto; chave só na primeira parcela.
  perform pg_temp.expect_code(pg_temp.ap('cd-r-0030', card, '2026-10-07', 8800, 2, 'Mercado', 'Mercado', k1), 'nota_ja_anotada', 'PT409', 'registro=' || p);
  assert (select count(*) from public.card_entries where receipt_key = k1) = 0 and (select count(*) from public.record_operations where idempotency_key = 'cd-r-0030') = 0,
    'a recusa não grava parcelas';
  res := public.add_card_purchase('cd-r-0031', card, '2026-10-07', 12000, 3, 'Geladeira', 'Moradia', ' ' || k2 || ' ');
  assert (res #>> '{entry,receipt_key}') = k2 and (select count(*) from public.card_entries where purchase_id = (res #>> '{entry,id}')::uuid and receipt_key is not null) = 1
     and (select receipt_key from public.card_entries where id = (res #>> '{entry,id}')::uuid) = k2
     and (select request_hash from public.record_operations where idempotency_key = 'cd-r-0031')
       = md5(format('["criar_compra_cartao", "%s", "2026-10-07", 12000, 3, "Geladeira", "Moradia", "%s"]', card, k2)), 'chave só na primeira parcela; no hash';
  assert (select receipt_key from public.card_entry_items where id = (res #>> '{entry,id}')::uuid) = k2, 'o app lê a chave da compra';
  assert public.add_card_purchase('cd-r-0031', card, '2026-10-07', 12000, 3, 'Geladeira', 'Moradia', k2) = res, 'repetição';
  p := (res #>> '{entry,id}')::uuid;
  perform pg_temp.expect_code(pg_temp.ap('cd-r-0031', card, '2026-10-07', 12000, 3, 'Geladeira', 'Moradia'), 'chave_reutilizada', 'PT409');
  -- A nota da compra viva barra o gasto (e outra compra), com a compra no detalhe.
  perform pg_temp.expect_code(format('select public.create_record(%L, %L, %L, ''despesa'', 100, ''2026-10-07'', ''Outra'', null, %L)', 'cd-r-0032', ctx, acc, k2),
    'nota_ja_anotada', 'PT409', 'compra=' || p);
  perform pg_temp.expect_code(pg_temp.ap('cd-r-0033', card, '2026-10-07', 100, 1, 'Outra', null, k2), 'nota_ja_anotada', 'PT409', 'compra=' || p);
  -- Editar a compra (valor, parcelas, data, descrição) mantém a chave na primeira parcela.
  res := public.update_card_entry('cd-r-0034', p, 1, 'compra', 12000, '2026-10-07', 'Geladeira 2', 'Moradia', 4);
  assert (select receipt_key from public.card_entries where purchase_id = p and installment_number = 1) = k2
     and (select count(*) from public.card_entries where purchase_id = p and receipt_key is not null) = 1
     and (res #>> '{entry,receipt_key}') = k2, 'a chave fica na primeira parcela depois de mudar as parcelas';
  res := public.update_card_entry('cd-r-0035', p, 2, 'compra', 12000, '2026-10-07', 'Geladeira 2', 'Moradia', 2);
  assert (res #>> '{entry,receipt_key}') = k2 and (select count(*) from public.card_entries where purchase_id = p and receipt_key is not null and deleted_at is null) = 1, 'e depois de reduzir';
  -- Excluir a compra libera a chave.
  res := public.delete_card_entry('cd-r-0036', p, 3);
  assert res #>> '{entry,deleted_at}' is not null and res #>> '{entry,receipt_key}' = k2, 'a compra excluída guarda a chave de rastro';
  r2 := public.create_record('cd-r-0037', ctx, acc, 'despesa', 12000, '2026-10-07', 'Geladeira', 'Moradia', k2);
  assert r2.receipt_key = k2, 'chave livre depois de excluir a compra';
  -- O mesmo vale ao contrário: excluir o gasto libera a chave para uma compra.
  perform public.delete_record('cd-r-0038', r2.id, 1);
  res := public.add_card_purchase('cd-r-0039', card, '2026-10-07', 12000, 1, 'Geladeira', 'Moradia', k2);
  assert res #>> '{entry,receipt_key}' = k2, 'compra com a chave liberada pelo gasto excluído';
  perform public.delete_card_entry('cd-r-0040', (res #>> '{entry,id}')::uuid, 1);

  -- Todas as chaves distintas convivem; nenhuma outra tabela guarda a chave inteira (o link da nota nunca é guardado).
  r2 := public.create_record('cd-r-0050', ctx, acc, 'despesa', 100, '2026-10-07', 'A', null, k3);
  res := public.add_card_purchase('cd-r-0051', card, '2026-10-07', 100, 1, 'B', null, k4);
  assert (select count(*) from public.financial_records where context_id = ctx and receipt_key is not null and deleted_at is null) = 2
     and (select count(*) from public.card_entries where context_id = ctx and receipt_key is not null and deleted_at is null) = 1, 'chaves distintas convivem';
  perform public.delete_record('cd-r-0052', r2.id, 1);
  perform public.delete_card_entry('cd-r-0053', (res #>> '{entry,id}')::uuid, 1);
  perform pg_temp.check_links();
end $$;
reset role;


-- Escrita direta (superusuário): índice único em cada tabela e gatilho entre as duas; a chave é imutável; formato; só em
-- despesa comum.
insert into ids values ('k5_entry', gen_random_uuid());
insert into public.financial_records (context_id, account_id, kind, amount_cents, currency, occurred_on, description, created_by, receipt_key)
  values (pg_temp.id('noel_ctx'), pg_temp.id('noel_acc'), 'despesa', 100, 'BRL', '2026-10-07', 'Direto', pg_temp.id('noel'),
          '878e2ccaac8218bb7670035ddfaa1bda4413b2fcf4457469913e77133e24c69c');
select pg_temp.expect_error(format($f$insert into public.financial_records (context_id, account_id, kind, amount_cents, currency, occurred_on, description, created_by, receipt_key)
  values (%L, %L, 'despesa', 100, 'BRL', '2026-10-07', 'Direto 2', %L, '878e2ccaac8218bb7670035ddfaa1bda4413b2fcf4457469913e77133e24c69c')$f$,
  pg_temp.id('noel_ctx'), pg_temp.id('noel_acc'), pg_temp.id('noel')), '%financial_records_receipt_key%');
-- Entre as duas tabelas, só o gatilho adiado pega (no fim da transação): uma fatura nova e consistente, com a nota que o gasto já tem.
select pg_temp.expect_deferred(format($f$
  insert into public.commitments (context_id, description, amount_cents, due_on, created_by, card_id, invoice_month, card_closing_on, amount_is_estimate)
    values (%L, 'Fatura Compras', 100, '2027-06-12', %L, %L, '2027-06-01', '2027-06-05', false);
  insert into public.card_entries (id, context_id, card_id, kind, invoice_month, amount_cents, description, purchase_id, purchased_on,
      installment_number, installment_total, purchase_total_cents, receipt_key, created_by)
    values (%L, %L, %L, 'parcela', '2027-06-01', 100, 'Direto', %L, '2026-10-07', 1, 1, 100, '878e2ccaac8218bb7670035ddfaa1bda4413b2fcf4457469913e77133e24c69c', %L)$f$,
  pg_temp.id('noel_ctx'), pg_temp.id('noel'), pg_temp.id('noel_cp'), pg_temp.id('k5_entry'), pg_temp.id('noel_ctx'), pg_temp.id('noel_cp'),
  pg_temp.id('k5_entry'), pg_temp.id('noel')), 'nota_ja_anotada', '23505');
-- Controle: a mesma fatura sem a nota repetida passa em todas as conferências do fim da transação.
savepoint controle;
insert into public.commitments (context_id, description, amount_cents, due_on, created_by, card_id, invoice_month, card_closing_on, amount_is_estimate)
  values (pg_temp.id('noel_ctx'), 'Fatura Compras', 100, '2027-06-12', pg_temp.id('noel'), pg_temp.id('noel_cp'), '2027-06-01', '2027-06-05', false);
insert into public.card_entries (id, context_id, card_id, kind, invoice_month, amount_cents, description, purchase_id, purchased_on,
    installment_number, installment_total, purchase_total_cents, created_by)
  values (pg_temp.id('k5_entry'), pg_temp.id('noel_ctx'), pg_temp.id('noel_cp'), 'parcela', '2027-06-01', 100, 'Direto', pg_temp.id('k5_entry'),
          '2026-10-07', 1, 1, 100, pg_temp.id('noel'));
set constraints all immediate;
set constraints all deferred;
rollback to savepoint controle;
-- Duas compras vivas com a mesma chave no mesmo contexto: índice único da tabela de lançamentos (imediato, nem espera o commit).
select pg_temp.expect_error(format($f$
  insert into public.card_entries (id, context_id, card_id, kind, invoice_month, amount_cents, description, purchase_id, purchased_on,
      installment_number, installment_total, purchase_total_cents, receipt_key, created_by)
    values (%L, %L, %L, 'parcela', '2027-06-01', 100, 'A', %L, '2026-10-07', 1, 1, 100, '2904729dae2e687811879a4343c29bb82be66b36778fca9a44ac9ce2070d58da', %L);
  insert into public.card_entries (id, context_id, card_id, kind, invoice_month, amount_cents, description, purchase_id, purchased_on,
      installment_number, installment_total, purchase_total_cents, receipt_key, created_by)
    values (%L, %L, %L, 'parcela', '2027-07-01', 100, 'B', %L, '2026-10-07', 1, 1, 100, '2904729dae2e687811879a4343c29bb82be66b36778fca9a44ac9ce2070d58da', %L)$f$,
  '40000000-0000-0000-0000-0000000000a1', pg_temp.id('noel_ctx'), pg_temp.id('noel_cp'), '40000000-0000-0000-0000-0000000000a1', pg_temp.id('noel'),
  '40000000-0000-0000-0000-0000000000a2', pg_temp.id('noel_ctx'), pg_temp.id('noel_cp'), '40000000-0000-0000-0000-0000000000a2', pg_temp.id('noel')),
  '%card_entries_receipt_key%');
-- A chave não muda nunca (nem some), em gastos e em compras; formato; só em despesa comum.
select pg_temp.expect_error(format($f$update public.financial_records set receipt_key = '2904729dae2e687811879a4343c29bb82be66b36778fca9a44ac9ce2070d58da'
  where receipt_key = '878e2ccaac8218bb7670035ddfaa1bda4413b2fcf4457469913e77133e24c69c' and context_id = %L$f$, pg_temp.id('noel_ctx')), 'campo_imutavel');
select pg_temp.expect_error(format($f$update public.financial_records set receipt_key = null
  where receipt_key = '878e2ccaac8218bb7670035ddfaa1bda4413b2fcf4457469913e77133e24c69c' and context_id = %L$f$, pg_temp.id('noel_ctx')), 'campo_imutavel');
select pg_temp.expect_error(format($f$insert into public.financial_records (context_id, account_id, kind, amount_cents, currency, occurred_on, description, created_by, receipt_key)
  values (%L, %L, 'despesa', 100, 'BRL', '2026-10-07', 'Curta', %L, '123')$f$, pg_temp.id('noel_ctx'), pg_temp.id('noel_acc'), pg_temp.id('noel')),
  '%financial_records_receipt_key%');
select pg_temp.expect_error(format($f$insert into public.financial_records (context_id, account_id, kind, amount_cents, currency, occurred_on, description, created_by, receipt_key)
  values (%L, %L, 'receita', 100, 'BRL', '2026-10-07', 'Receita', %L, '2904729dae2e687811879a4343c29bb82be66b36778fca9a44ac9ce2070d58da')$f$,
  pg_temp.id('noel_ctx'), pg_temp.id('noel_acc'), pg_temp.id('noel')), '%financial_records_receipt_key%');
select pg_temp.expect_error(format($f$insert into public.card_entries (context_id, card_id, kind, invoice_month, amount_cents, description, purchase_id, purchased_on,
    installment_number, installment_total, purchase_total_cents, receipt_key, created_by)
  values (%L, %L, 'parcela', '2027-06-01', 100, 'A', gen_random_uuid(), '2026-10-07', 1, 1, 100, 'abc', %L)$f$,
  pg_temp.id('noel_ctx'), pg_temp.id('noel_cp'), pg_temp.id('noel')), '%card_entries_receipt_key_check%');
-- Chave só na primeira parcela.
select pg_temp.expect_error(format($f$insert into public.card_entries (context_id, card_id, kind, invoice_month, amount_cents, description, purchase_id, purchased_on,
    installment_number, installment_total, purchase_total_cents, receipt_key, created_by)
  values (%L, %L, 'parcela', '2027-06-01', 50, 'A', gen_random_uuid(), '2026-10-07', 2, 2, 100, '2904729dae2e687811879a4343c29bb82be66b36778fca9a44ac9ce2070d58da', %L)$f$,
  pg_temp.id('noel_ctx'), pg_temp.id('noel_cp'), pg_temp.id('noel')), '%card_entries_forma%');
-- Escrita direta da chave nos lançamentos que não são compra.
select pg_temp.expect_error(format($f$insert into public.card_entries (context_id, card_id, kind, invoice_month, amount_cents, charge_kind, receipt_key, created_by)
  values (%L, %L, 'encargo', '2027-06-01', 50, 'juros', '2904729dae2e687811879a4343c29bb82be66b36778fca9a44ac9ce2070d58da', %L)$f$,
  pg_temp.id('noel_ctx'), pg_temp.id('noel_cp'), pg_temp.id('noel')), '%card_entries_forma%');
select pg_temp.check_links();
delete from public.financial_records where context_id = pg_temp.id('noel_ctx') and receipt_key = '878e2ccaac8218bb7670035ddfaa1bda4413b2fcf4457469913e77133e24c69c' and description = 'Direto';
set role authenticated;

-- ---------------------------------------------------------------------------
-- 9. Permissões: Família (escrita, autoria e "editar de outras pessoas"), Pessoal de outra pessoa, empresa, externo e
-- vínculo revogado. A empresa não lê nada, nem somado.
-- ---------------------------------------------------------------------------
set role authenticated;
do $$
declare
  fam uuid := pg_temp.id('fam');
  bia uuid := pg_temp.id('bia_ctx');
  famacc uuid := pg_temp.id('fam_acc');
  fc uuid;
  res jsonb;
  m_iris uuid;
  ch_theo uuid;
  rid uuid;
  p text;
  bcard uuid := pg_temp.id('exemplo');
begin
  -- Bia cria o cartão da Família; Iris compra no cartão (escrita basta), mas não mexe no cartão.
  perform pg_temp.as_('bia');
  res := public.create_card('cd-f-0001', fam, 'Cartão da família', '4321', 5, 12, 300000);
  fc := (res #>> '{card,id}')::uuid;
  insert into ids values ('fam_card', fc);
  perform pg_temp.as_('iris');
  res := public.add_card_purchase('cd-f-0002', fc, '2026-10-07', 20000, 2, 'Mercado', 'Mercado');
  m_iris := (res #>> '{entry,id}')::uuid;
  assert res #>> '{entry,created_by}' = pg_temp.id('iris')::text and res #>> '{commitments,0,created_by}' = pg_temp.id('bia')::text,
    'compra com a autoria de Iris; a conta da fatura leva a autoria de quem criou o cartão';
  perform pg_temp.expect_code(pg_temp.uc('cd-f-0003', fc, 1, 'Meu', null, 5, 12, null), 'sem_permissao', '42501');
  perform pg_temp.expect_code(pg_temp.uc('cd-f-0004', fc, 99, '', null, 0, 0, 0), 'sem_permissao', '42501');
  perform pg_temp.expect_code(pg_temp.sc('cd-f-0005', fc, 1, 'arquivado'), 'sem_permissao', '42501');
  perform pg_temp.expect_code(pg_temp.dc('cd-f-0006', fc, 1), 'sem_permissao', '42501');
  perform pg_temp.expect_code(pg_temp.pi('cd-f-0007', fc, '2026-11-01', 1, 100, '2026-10-07'), 'sem_permissao', '42501');
  perform pg_temp.expect_code(pg_temp.ui('cd-f-0008', fc, '2026-11-01', 1), 'sem_permissao', '42501');
  -- Iris altera a própria compra e registra encargo e estorno na fatura.
  res := public.update_card_entry('cd-f-0009', m_iris, 1, 'compra', 20000, '2026-10-07', 'Mercado do mês', 'Mercado', 2);
  assert res #>> '{entry,description}' = 'Mercado do mês', 'Iris altera a própria compra';
  -- Theo registra um encargo, altera a compra de Iris ("editar de outras pessoas") e paga a fatura do cartão de Bia.
  perform pg_temp.as_('theo');
  res := public.add_card_charge('cd-f-0010', fc, '2026-11-01', 'anuidade', 3000);
  ch_theo := (res #>> '{entry,id}')::uuid;
  assert res #>> '{entry,created_by}' = pg_temp.id('theo')::text, 'encargo com a autoria de Theo';
  res := public.update_card_entry('cd-f-0011', m_iris, 2, 'compra', 20000, '2026-10-07', 'Mercado do mês (Theo)', 'Mercado', 2);
  assert res #>> '{entry,created_by}' = pg_temp.id('iris')::text and res #>> '{entry,description}' = 'Mercado do mês (Theo)'
     and (select bool_and(created_by = pg_temp.id('iris')) from public.card_entries where purchase_id = m_iris), 'Theo altera a compra de Iris; a autoria fica';
  res := public.update_card('cd-f-0012', fc, 1, 'Cartão da família', '4321', 5, 12, 400000);
  assert (res #>> '{card,limit_cents}')::bigint = 400000 and res #>> '{card,created_by}' = pg_temp.id('bia')::text, 'Theo altera o cartão de Bia';
  -- Iris não mexe no encargo de Theo; Caio só lê.
  perform pg_temp.as_('iris');
  perform pg_temp.expect_code(pg_temp.ue('cd-f-0013', ch_theo, 1, 'encargo', 100, null, null, null, null, '2026-11-01', 'juros'), 'sem_permissao', '42501');
  perform pg_temp.expect_code(pg_temp.ue('cd-f-0014', ch_theo, 99, 'compra', 0, null, '', null), 'sem_permissao', '42501');
  perform pg_temp.expect_code(pg_temp.de('cd-f-0015', ch_theo, 1), 'sem_permissao', '42501');
  assert (select count(*) from public.card_items where context_id = fam) = 1 and (select count(*) from public.card_entry_items where card_id = fc) = 2
     and (select count(*) from public.invoice_items where card_id = fc) = 2, 'Iris lê o cartão, os lançamentos e as faturas da Família';
  perform pg_temp.as_('caio');
  assert (select count(*) from public.cards where context_id = fam) = 1 and (select count(*) from public.card_entries where card_id = fc) = 3
     and (select count(*) from public.card_items where context_id = fam) = 1 and (select count(*) from public.card_entry_items where card_id = fc) = 2
     and (select count(*) from public.invoice_items where card_id = fc) = 2
     and (select count(*) from public.commitment_items where card_id = fc) = 2, 'Caio lê a Família';
  assert (select used_cents from public.card_items where id = fc) = 23000, 'Caio vê o limite usado: 200,00 + 30,00 de anuidade';
  perform pg_temp.expect_code(pg_temp.cc('cd-f-0016', fam, 'Caio', null, 5, 12, null), 'sem_permissao', '42501');
  perform pg_temp.expect_code(pg_temp.ap('cd-f-0017', fc, '2026-10-07', 100, 1, 'x'), 'sem_permissao', '42501');
  perform pg_temp.expect_code(pg_temp.ach('cd-f-0018', fc, '2026-11-01', 'juros', 100), 'sem_permissao', '42501');
  perform pg_temp.expect_code(pg_temp.arf('cd-f-0019', fc, '2026-11-01', 100, 'x'), 'sem_permissao', '42501');
  perform pg_temp.expect_code(pg_temp.ue('cd-f-0020', m_iris, 3, 'compra', 100, '2026-10-07', 'x', null, 1), 'sem_permissao', '42501');
  perform pg_temp.expect_code(pg_temp.de('cd-f-0021', m_iris, 3), 'sem_permissao', '42501');
  perform pg_temp.expect_code(pg_temp.pi('cd-f-0022', fc, '2026-11-01', 1, 100, '2026-10-07'), 'sem_permissao', '42501');
  perform pg_temp.expect_code(pg_temp.ui('cd-f-0023', fc, '2026-11-01', 1), 'sem_permissao', '42501');
  perform pg_temp.expect_code(pg_temp.uc('cd-f-0024', fc, 2, 'Caio', null, 5, 12, null), 'sem_permissao', '42501');
  -- Theo paga a fatura (a conta de saída é a conta ativa mais antiga da Família); Iris não desfaz; Theo desfaz.
  perform pg_temp.as_('theo');
  -- A fatura de novembro fecha em 05/11: Theo paga em 06/11 (fatura aberta é recusada; a Iris não chega a essa conferência).
  perform pg_temp.expect_code(pg_temp.pi('cd-f-0029', fc, '2026-11-01', pg_temp.iv_ver(fc, '2026-11-01'), 5000, '2026-10-07'), 'fatura_aberta', 'PT409');
  perform pg_temp.today('2026-11-06');
  res := public.pay_invoice('cd-f-0030', fc, '2026-11-01', pg_temp.iv_ver(fc, '2026-11-01'), 5000, '2026-11-06');
  rid := (res #>> '{record,id}')::uuid;
  assert res #>> '{record,account_id}' = famacc::text and res #>> '{record,created_by}' = pg_temp.id('theo')::text
     and res #>> '{record,description}' = 'Fatura Cartão da família (novembro)' and res #>> '{record,context_id}' = fam::text, 'pagamento na conta da Família';
  perform pg_temp.as_('iris');
  perform pg_temp.expect_code(pg_temp.ui('cd-f-0031', fc, '2026-11-01', pg_temp.iv_ver(fc, '2026-11-01')), 'sem_permissao', '42501');
  perform pg_temp.expect_code(pg_temp.pi('cd-f-0032', fc, '2026-12-01', pg_temp.iv_ver(fc, '2026-12-01'), 100, '2026-10-07'), 'sem_permissao', '42501');
  -- A conta da fatura da Família também é de fatura para quem tem "editar de outras pessoas".
  perform pg_temp.as_('theo');
  perform pg_temp.expect_code(format('select public.update_commitment(%L, %L, 1, 100, ''2026-11-12'', ''Outra'')', 'cd-f-0033', pg_temp.cmid(fc, '2026-11-01')), 'conta_de_fatura', 'PT409');
  perform pg_temp.expect_code(format('select public.delete_record(%L, %L, 1)', 'cd-f-0034', rid), 'pagamento_de_fatura', 'PT409');
  res := public.undo_invoice_payment('cd-f-0035', fc, '2026-11-01', pg_temp.iv_ver(fc, '2026-11-01'));
  assert res #>> '{record,deleted_by}' = pg_temp.id('theo')::text, 'Theo desfaz';
  perform pg_temp.today('2026-10-07');
  -- A titular altera o encargo de Theo.
  perform pg_temp.as_('bia');
  res := public.update_card_entry('cd-f-0036', ch_theo, 1, 'encargo', 3500, null, null, null, null, '2026-11-01', 'anuidade');
  assert (res #>> '{entry,amount_cents}')::bigint = 3500, 'a titular altera o que é dos outros';
  perform pg_temp.check_links();
  perform pg_temp.views_agree();

  -- Família, empresa e externo não leem o Pessoal da Bia, nem por função.
  foreach p in array array['caio', 'iris', 'theo', 'vera', 'rui'] loop
    perform pg_temp.as_(p);
    assert (select count(*) from public.cards where context_id = bia) = 0 and (select count(*) from public.card_entries where context_id = bia) = 0
       and (select count(*) from public.card_items where context_id = bia) = 0 and (select count(*) from public.card_entry_items where context_id = bia) = 0
       and (select count(*) from public.invoice_items where context_id = bia) = 0
       and (select count(*) from public.commitment_items where context_id = bia and card_id is not null) = 0
       and (select count(*) from public.financial_records where context_id = bia and card_id is not null) = 0, p || ' não lê os cartões da Bia';
    perform pg_temp.expect_code(pg_temp.cc('cd-x-' || p, bia, 'Intruso', null, 5, 12, null), 'sem_permissao', '42501');
    perform pg_temp.expect_code(pg_temp.uc('cd-y-' || p, bcard, 1, 'Intruso', null, 5, 12, null), 'nao_encontrado', 'P0002');
    perform pg_temp.expect_code(pg_temp.sc('cd-w-' || p, bcard, 1, 'arquivado'), 'nao_encontrado', 'P0002');
    perform pg_temp.expect_code(pg_temp.dc('cd-v-' || p, bcard, 1), 'nao_encontrado', 'P0002');
    perform pg_temp.expect_code(pg_temp.ap('cd-u-' || p, bcard, '2026-10-07', 100, 1, 'x'), 'nao_encontrado', 'P0002');
    perform pg_temp.expect_code(pg_temp.ach('cd-t-' || p, bcard, '2026-11-01', 'juros', 100), 'nao_encontrado', 'P0002');
    perform pg_temp.expect_code(pg_temp.arf('cd-s-' || p, bcard, '2026-11-01', 100, 'x'), 'nao_encontrado', 'P0002');
    perform pg_temp.expect_code(pg_temp.pi('cd-r-' || p, bcard, '2026-11-01', 1, 100, '2026-10-07'), 'nao_encontrado', 'P0002');
    perform pg_temp.expect_code(pg_temp.ui('cd-q-' || p, bcard, '2026-11-01', 1), 'nao_encontrado', 'P0002');
    perform pg_temp.expect_code(pg_temp.ue('cd-p-' || p, pg_temp.id('geladeira'), 1, 'compra', 100, '2026-10-05', 'x', null, 1), 'nao_encontrado', 'P0002');
    perform pg_temp.expect_code(pg_temp.de('cd-o-' || p, pg_temp.id('geladeira'), 1), 'nao_encontrado', 'P0002');
    -- Repetição de uma chave da Bia por outra pessoa: chave por pessoa, então é uma chamada nova (sem permissão).
    perform pg_temp.expect_code(pg_temp.cc('ce-b-0101', bia, 'Cartão Exemplo', '1234', 3, 10, 500000), 'sem_permissao', '42501');
    perform pg_temp.expect_code(pg_temp.ap('ce-b-0102', bcard, '2026-10-05', 240000, 6, 'Geladeira', 'Moradia'), 'nao_encontrado', 'P0002');
  end loop;
  -- Empresa e externo também não leem a Família.
  foreach p in array array['vera', 'rui'] loop
    perform pg_temp.as_(p);
    assert (select count(*) from public.cards where context_id = fam) = 0 and (select count(*) from public.card_entries where context_id = fam) = 0
       and (select count(*) from public.card_items) = 0 and (select count(*) from public.card_entry_items) = 0
       and (select count(*) from public.invoice_items) = 0 and (select count(*) from public.commitment_items where card_id is not null) = 0,
      p || ' não lê nenhum cartão';
    perform pg_temp.expect_code(pg_temp.cc('cd-n-' || p, fam, 'Intruso', null, 5, 12, null), 'sem_permissao', '42501');
    perform pg_temp.expect_code(pg_temp.ap('cd-m-' || p, fc, '2026-10-07', 100, 1, 'x'), 'nao_encontrado', 'P0002');
    perform pg_temp.expect_code(pg_temp.de('cd-l-' || p, m_iris, 3), 'nao_encontrado', 'P0002');
    perform pg_temp.expect_code(pg_temp.pi('cd-k-' || p, fc, '2026-11-01', 1, 100, '2026-10-07'), 'nao_encontrado', 'P0002');
  end loop;
  perform pg_temp.as_('vera');
  perform pg_temp.expect_code('select * from public.month_committed(''' || fam || ''', ''2026-11-01'')', 'sem_permissao', '42501');
end $$;

-- Vínculo revogado: Iris deixa de ler, de repetir e de comprar no cartão da Família.
reset role;
update public.context_memberships set revoked_at = now() where context_id = (select id from ids where name = 'fam') and person_id = :iris;
set role authenticated;
do $$
declare
  fam uuid := pg_temp.id('fam');
  fc uuid := pg_temp.id('fam_card');
begin
  perform pg_temp.as_('iris');
  assert (select count(*) from public.cards) = 0 and (select count(*) from public.card_entries) = 0 and (select count(*) from public.card_items) = 0
     and (select count(*) from public.card_entry_items) = 0 and (select count(*) from public.invoice_items) = 0, 'revogada não lê';
  perform pg_temp.expect_code(pg_temp.ap('cd-f-0002', fc, '2026-10-07', 20000, 2, 'Mercado', 'Mercado'), 'nao_encontrado', 'P0002');   -- repetição
  perform pg_temp.expect_code(pg_temp.ap('cd-f-0040', fc, '2026-10-07', 100, 1, 'x'), 'nao_encontrado', 'P0002');
  perform pg_temp.expect_code(pg_temp.cc('cd-f-0041', fam, 'Outra', null, 5, 12, null), 'sem_permissao', '42501');
  -- A titular exclui a compra de Iris e depois o resto ("editar de outras pessoas"); o cartão com lançamentos não se exclui.
  perform pg_temp.as_('bia');
  perform pg_temp.expect_code(pg_temp.dc('cd-f-0042', fc, (select version from public.card_items where id = fc)), 'cartao_com_lancamentos', 'PT409');
  perform public.delete_card_entry('cd-f-0043', (select id from public.card_entry_items where card_id = fc and kind = 'compra'), (select version from public.card_entry_items where card_id = fc and kind = 'compra'));
  perform public.delete_card_entry('cd-f-0044', (select id from public.card_entry_items where card_id = fc and kind = 'encargo'), (select version from public.card_entry_items where card_id = fc and kind = 'encargo'));
  assert (select count(*) from public.invoice_items where card_id = fc) = 0 and (select count(*) from public.commitments where card_id = fc and deleted_at is null) = 0,
    'sem lançamentos, sem faturas';
  perform public.delete_card('cd-f-0045', fc, (select version from public.card_items where id = fc));
  perform pg_temp.check_links();
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 10. record_operations: as onze ações de cartão apontam para o cartão (target_id); as cinco de lançamento também para o
-- lançamento (entry_id); pagar e desfazer a fatura, também para a conta da fatura e o gasto; a lista vigente tem 37 ações.
-- Uma operação por escrita. Atividade (A4): toda ação de cartão é anotação de quem a fez no contexto.
-- ---------------------------------------------------------------------------
reset role;
create function pg_temp.expect_ok(p_sql text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
    raise exception 'desfeito';
  exception when others then
    if sqlerrm <> 'desfeito' then
      raise exception 'deveria passar, mas veio "%" (%) em: %', sqlerrm, sqlstate, p_sql;
    end if;
  end;
end $$;
do $$
declare
  card_acts text[] := array['criar_cartao', 'alterar_cartao', 'situacao_cartao', 'excluir_cartao'];
  entry_acts text[] := array['criar_compra_cartao', 'alterar_lancamento_cartao', 'excluir_lancamento_cartao', 'criar_encargo_cartao',
                             'criar_estorno_cartao'];
  pay_acts text[] := array['pagar_fatura', 'desfazer_pagamento_fatura'];
  a text;
  n int := 0;
  g text := 'gen_random_uuid()';
  sql text;
  -- (record, commitment, target, entry), cada um 'gen_random_uuid()' ou 'null'
  function_ins text := $f$insert into public.record_operations
      (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id, target_id, entry_id)
    values (%L, %L, %L, %L, 'x', %s, %s, %s, %s)$f$;
begin
  foreach a in array card_acts loop
    n := n + 1;
    perform pg_temp.expect_ok(format(function_ins, pg_temp.id('bia'), 'ce-o-1' || lpad(n::text, 3, '0'), a, pg_temp.id('bia_ctx'), 'null', 'null', g, 'null'));
    perform pg_temp.expect_error(format(function_ins, pg_temp.id('bia'), 'ce-o-2' || lpad(n::text, 3, '0'), a, pg_temp.id('bia_ctx'), 'null', 'null', 'null', 'null'), '%record_operations_target_check%');
    perform pg_temp.expect_error(format(function_ins, pg_temp.id('bia'), 'ce-o-3' || lpad(n::text, 3, '0'), a, pg_temp.id('bia_ctx'), g, 'null', g, 'null'), '%record_operations_target_check%');
    perform pg_temp.expect_error(format(function_ins, pg_temp.id('bia'), 'ce-o-4' || lpad(n::text, 3, '0'), a, pg_temp.id('bia_ctx'), 'null', g, g, 'null'), '%record_operations_target_check%');
    perform pg_temp.expect_error(format(function_ins, pg_temp.id('bia'), 'ce-o-5' || lpad(n::text, 3, '0'), a, pg_temp.id('bia_ctx'), 'null', 'null', g, g), '%record_operations_entry_check%');
  end loop;
  foreach a in array entry_acts loop
    n := n + 1;
    perform pg_temp.expect_ok(format(function_ins, pg_temp.id('bia'), 'ce-o-1' || lpad(n::text, 3, '0'), a, pg_temp.id('bia_ctx'), 'null', 'null', g, g));
    perform pg_temp.expect_error(format(function_ins, pg_temp.id('bia'), 'ce-o-2' || lpad(n::text, 3, '0'), a, pg_temp.id('bia_ctx'), 'null', 'null', g, 'null'), '%record_operations_entry_check%');
    perform pg_temp.expect_error(format(function_ins, pg_temp.id('bia'), 'ce-o-3' || lpad(n::text, 3, '0'), a, pg_temp.id('bia_ctx'), 'null', 'null', 'null', g), '%record_operations_target_check%');
    perform pg_temp.expect_error(format(function_ins, pg_temp.id('bia'), 'ce-o-4' || lpad(n::text, 3, '0'), a, pg_temp.id('bia_ctx'), g, 'null', g, g), '%record_operations_target_check%');
    perform pg_temp.expect_error(format(function_ins, pg_temp.id('bia'), 'ce-o-5' || lpad(n::text, 3, '0'), a, pg_temp.id('bia_ctx'), 'null', g, g, g), '%record_operations_target_check%');
  end loop;
  foreach a in array pay_acts loop
    n := n + 1;
    perform pg_temp.expect_ok(format(function_ins, pg_temp.id('bia'), 'ce-o-1' || lpad(n::text, 3, '0'), a, pg_temp.id('bia_ctx'), g, g, g, 'null'));
    perform pg_temp.expect_error(format(function_ins, pg_temp.id('bia'), 'ce-o-2' || lpad(n::text, 3, '0'), a, pg_temp.id('bia_ctx'), 'null', g, g, 'null'), '%record_operations_target_check%');
    perform pg_temp.expect_error(format(function_ins, pg_temp.id('bia'), 'ce-o-3' || lpad(n::text, 3, '0'), a, pg_temp.id('bia_ctx'), g, 'null', g, 'null'), '%record_operations_target_check%');
    perform pg_temp.expect_error(format(function_ins, pg_temp.id('bia'), 'ce-o-4' || lpad(n::text, 3, '0'), a, pg_temp.id('bia_ctx'), g, g, 'null', 'null'), '%record_operations_target_check%');
    perform pg_temp.expect_error(format(function_ins, pg_temp.id('bia'), 'ce-o-5' || lpad(n::text, 3, '0'), a, pg_temp.id('bia_ctx'), g, g, g, g), '%record_operations_entry_check%');
  end loop;
  -- entry_id fora das cinco ações de lançamento é recusado; ação desconhecida também.
  perform pg_temp.expect_error(format(function_ins, pg_temp.id('bia'), 'ce-o-6001', 'criar', pg_temp.id('bia_ctx'), g, 'null', 'null', g), '%record_operations_entry_check%');
  perform pg_temp.expect_error(format(function_ins, pg_temp.id('bia'), 'ce-o-6002', 'criar_meta', pg_temp.id('bia_ctx'), 'null', 'null', g, g), '%record_operations_entry_check%');
  perform pg_temp.expect_error(format(function_ins, pg_temp.id('bia'), 'ce-o-6003', 'criar_cartoes', pg_temp.id('bia_ctx'), 'null', 'null', g, 'null'), '%record_operations_action_check%');
  perform pg_temp.expect_error(format(function_ins, pg_temp.id('bia'), 'ce-o-6004', 'registrar_compra_cartao', pg_temp.id('bia_ctx'), 'null', 'null', g, g), '%record_operations_action_check%');
  -- Os ramos antigos continuam como eram (sem entry_id).
  perform pg_temp.expect_ok(format(function_ins, pg_temp.id('bia'), 'ce-o-6005', 'criar', pg_temp.id('bia_ctx'), g, 'null', 'null', 'null'));
  perform pg_temp.expect_ok(format(function_ins, pg_temp.id('bia'), 'ce-o-6006', 'criar_meta', pg_temp.id('bia_ctx'), 'null', 'null', g, 'null'));
  perform pg_temp.expect_error(format(function_ins, pg_temp.id('bia'), 'ce-o-6007', 'criar_meta', pg_temp.id('bia_ctx'), 'null', 'null', 'null', 'null'), '%record_operations_target_check%');
  assert (select array_agg(m[1] order by m[1] collate "C")
            from pg_constraint c, regexp_matches(pg_get_constraintdef(c.oid), '''([a-z_]+)''::text', 'g') m
           where c.conname = 'record_operations_action_check' and m[1] ~ 'cartao|fatura')
    = array['alterar_cartao', 'alterar_lancamento_cartao', 'criar_cartao', 'criar_compra_cartao', 'criar_encargo_cartao', 'criar_estorno_cartao',
            'desfazer_pagamento_fatura', 'excluir_cartao', 'excluir_lancamento_cartao', 'pagar_fatura', 'situacao_cartao'], 'as 11 ações de cartão';
  assert (select count(*) from pg_constraint c, regexp_matches(pg_get_constraintdef(c.oid), '''([a-z_]+)''::text', 'g') m
           where c.conname = 'record_operations_action_check') = 37, 'a lista vigente tem 37 ações';

  -- Cada operação aponta para um cartão do mesmo contexto; a de lançamento, para um lançamento do mesmo cartão; a de fatura, para
  -- a conta e o gasto daquele cartão.
  assert not exists (select 1 from public.record_operations o
                      where o.action in ('criar_cartao', 'alterar_cartao', 'situacao_cartao', 'excluir_cartao', 'criar_compra_cartao',
                                          'alterar_lancamento_cartao', 'excluir_lancamento_cartao', 'criar_encargo_cartao', 'criar_estorno_cartao',
                                          'pagar_fatura', 'desfazer_pagamento_fatura')
                        and not exists (select 1 from public.cards c where c.id = o.target_id and c.context_id = o.context_id
                                          and (o.action <> 'excluir_cartao' or c.deleted_at is not null))), 'operações de cartão apontam para o cartão';
  assert not exists (select 1 from public.record_operations o
                      where o.entry_id is not null
                        and not exists (select 1 from public.card_entries e where e.id = o.entry_id and e.card_id = o.target_id and e.context_id = o.context_id
                                          and (o.action <> 'excluir_lancamento_cartao' or e.deleted_at is not null))),
    'operações de lançamento apontam para o lançamento do cartão';
  assert not exists (select 1 from public.record_operations o
                      where o.action in ('pagar_fatura', 'desfazer_pagamento_fatura')
                        and not exists (select 1 from public.commitments c join public.financial_records r on r.commitment_id = c.id
                                         where c.id = o.commitment_id and r.id = o.record_id and c.card_id = o.target_id and r.card_id = o.target_id
                                           and c.context_id = o.context_id and (o.action = 'pagar_fatura' or r.deleted_at is not null))),
    'operações de fatura apontam para a conta e o gasto do cartão';
  -- Uma operação por escrita: cartões, compras, pagamentos e desfazeres (repetições e recusas não gravam).
  assert (select count(*) from public.record_operations where action = 'criar_cartao') = (select count(*) from public.cards)
     and (select count(*) from public.record_operations where action = 'excluir_cartao') = (select count(*) from public.cards where deleted_at is not null)
     and (select count(*) from public.record_operations where action = 'criar_compra_cartao')
       = (select count(*) from public.card_entries where kind = 'parcela' and installment_number = 1)
     and (select count(*) from public.record_operations where action = 'pagar_fatura') = (select count(*) from public.financial_records where card_id is not null)
     and (select count(*) from public.record_operations where action = 'desfazer_pagamento_fatura')
       = (select count(*) from public.financial_records where card_id is not null and deleted_at is not null),
    'uma operação por escrita';
  -- A: a compra no cartão nunca grava gasto: gastos de cartão só nascem de pagar_fatura.
  assert not exists (select 1 from public.financial_records r where r.card_id is not null
                      and not exists (select 1 from public.record_operations o where o.action = 'pagar_fatura' and o.record_id = r.id)),
    'todo gasto de fatura veio de pagar_fatura';
  -- R1 (A4): toda operação de cartão é anotação de quem a fez no contexto.
  assert not exists (select 1 from public.record_operations o
                      where (o.action like '%cartao' or o.action like '%fatura' or o.action like '%lancamento_cartao')
                        and not exists (select 1 from public.context_activity a where a.person_id = o.actor_id and a.context_id = o.context_id)),
    'atividade de toda operação de cartão';
end $$;

-- Atividade (A4) passo a passo: cada ação de cartão, feita depois de uma ausência longa (50 dias entre uma e outra), é a
-- primeira anotação depois dela e grava a ausência. Recusa não conta.
set role authenticated;
do $$
declare
  ctx uuid := pg_temp.id('rui_ctx');
  prev date := '2026-10-07';
  d date;
  c uuid;
  p uuid;
  e uuid;
  res jsonb;
  step int := 0;
begin
  perform pg_temp.as_('rui');
  assert pg_temp.act('rui', 'rui_ctx') is null, 'Rui ainda não anotou nada (as recusas e leituras de antes não contam)';

  d := prev + 50; perform pg_temp.today(d);
  perform pg_temp.expect_code(pg_temp.cc('cd-a-0000', ctx, '', null, 5, 12, null), 'apelido_invalido', '22023');
  assert pg_temp.act('rui', 'rui_ctx') is null, 'recusa não é anotação';
  res := public.create_card('cd-a-0001', ctx, 'Atividade', null, 5, 12, null);
  c := (res #>> '{card,id}')::uuid;
  assert pg_temp.act('rui', 'rui_ctx') = format('%s - -', d), 'criar_cartao: a primeira anotação, sem ausência';
  prev := d;

  d := prev + 50; perform pg_temp.today(d);
  res := public.update_card('cd-a-0002', c, 1, 'Atividade', '1111', 5, 12, 100000);
  assert pg_temp.act('rui', 'rui_ctx') = format('%s %s %s', d, prev, d), 'alterar_cartao';
  prev := d;

  d := prev + 50; perform pg_temp.today(d);
  res := public.set_card_status('cd-a-0003', c, 2, 'arquivado');
  assert pg_temp.act('rui', 'rui_ctx') = format('%s %s %s', d, prev, d), 'situacao_cartao';
  prev := d;

  d := prev + 50; perform pg_temp.today(d);
  res := public.set_card_status('cd-a-0004', c, 3, 'ativo');
  assert pg_temp.act('rui', 'rui_ctx') = format('%s %s %s', d, prev, d), 'situacao_cartao (reativar)';
  prev := d;

  d := prev + 50; perform pg_temp.today(d);
  res := public.add_card_purchase('cd-a-0005', c, d, 5000, 1, 'Compra do dia', null);
  p := (res #>> '{entry,id}')::uuid;
  assert pg_temp.act('rui', 'rui_ctx') = format('%s %s %s', d, prev, d), 'criar_compra_cartao';
  prev := d;

  d := prev + 50; perform pg_temp.today(d);
  res := public.add_card_charge('cd-a-0006', c, (res #>> '{entry,invoice_month}')::date, 'iof', 100);
  e := (res #>> '{entry,id}')::uuid;
  assert pg_temp.act('rui', 'rui_ctx') = format('%s %s %s', d, prev, d), 'criar_encargo_cartao';
  prev := d;

  d := prev + 50; perform pg_temp.today(d);
  res := public.add_card_refund('cd-a-0007', c, (res #>> '{entry,invoice_month}')::date, 200, 'Devolução', null);
  assert pg_temp.act('rui', 'rui_ctx') = format('%s %s %s', d, prev, d), 'criar_estorno_cartao';
  prev := d;

  d := prev + 50; perform pg_temp.today(d);
  res := public.update_card_entry('cd-a-0008', e, 1, 'encargo', 150, null, null, null, null, (res #>> '{entry,invoice_month}')::date, 'iof');
  assert pg_temp.act('rui', 'rui_ctx') = format('%s %s %s', d, prev, d), 'alterar_lancamento_cartao';
  prev := d;

  d := prev + 50; perform pg_temp.today(d);
  res := public.pay_invoice('cd-a-0009', c, (res #>> '{entry,invoice_month}')::date, pg_temp.iv_ver(c, (res #>> '{entry,invoice_month}')::date), 1000, d);
  assert pg_temp.act('rui', 'rui_ctx') = format('%s %s %s', d, prev, d), 'pagar_fatura';
  prev := d;

  d := prev + 50; perform pg_temp.today(d);
  res := public.undo_invoice_payment('cd-a-0010', c, (res #>> '{commitment,invoice_month}')::date, (res #>> '{commitment,version}')::int);
  assert pg_temp.act('rui', 'rui_ctx') = format('%s %s %s', d, prev, d), 'desfazer_pagamento_fatura';
  prev := d;

  d := prev + 50; perform pg_temp.today(d);
  res := public.delete_card_entry('cd-a-0011', e, 2);
  assert pg_temp.act('rui', 'rui_ctx') = format('%s %s %s', d, prev, d), 'excluir_lancamento_cartao';
  prev := d;

  d := prev + 50; perform pg_temp.today(d);
  perform public.delete_card_entry('cd-a-0012', p, 1);
  perform public.delete_card_entry('cd-a-0013', (select id from public.card_entry_items where card_id = c and kind = 'estorno'), 1);
  assert pg_temp.act('rui', 'rui_ctx') = format('%s %s %s', d, prev, d), 'excluir_lancamento_cartao (compra e estorno)';
  prev := d;

  d := prev + 50; perform pg_temp.today(d);
  res := public.delete_card('cd-a-0014', c, (select version from public.card_items where id = c));
  assert pg_temp.act('rui', 'rui_ctx') = format('%s %s %s', d, prev, d), 'excluir_cartao';
  perform pg_temp.check_links();
  perform pg_temp.today('2026-10-07');
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 11. Guardas, restrições das tabelas e invariantes C1 a C4 (escrita direta do backend; cada caso desfeito no próprio bloco).
-- Montagem pelas funções (Noel): "Guardas" (Mesa em 2 vezes de 100,00, tarifa de 3,00 e pagamento parcial de 60,00 de
-- novembro, com saldo anterior de 43,00 em dezembro), "Guardas 2" (compra de 100,00, estorno de 150,00 e juros de 1,00 em
-- dezembro: crédito de 50,00 levado a dezembro) e "Guardas 3" (Cama em 2 vezes de 100,00).
-- ---------------------------------------------------------------------------
set role authenticated;
do $$
declare
  ctx uuid := pg_temp.id('noel_ctx');
  g uuid;
  g2 uuid;
  g3 uuid;
  res jsonb;
begin
  perform pg_temp.as_('noel');
  g := (public.create_card('cd-g-0001', ctx, 'Guardas', null, 5, 12, null) #>> '{card,id}')::uuid;
  insert into ids values ('g_card', g);
  insert into ids values ('g_purchase', (public.add_card_purchase('cd-g-0002', g, '2026-10-07', 20000, 2, 'Mesa', 'Moradia') #>> '{entry,id}')::uuid);
  insert into ids values ('g_charge', (public.add_card_charge('cd-g-0003', g, '2026-11-01', 'tarifa', 300) #>> '{entry,id}')::uuid);
  perform pg_temp.today('2026-11-06');   -- novembro fechou em 05/11
  res := public.pay_invoice('cd-g-0004', g, '2026-11-01', pg_temp.iv_ver(g, '2026-11-01'), 6000, '2026-11-06');
  perform pg_temp.today('2026-10-07');
  insert into ids values ('g_record', (res #>> '{record,id}')::uuid), ('g_saldo', (res #>> '{entry,id}')::uuid);
  assert pg_temp.ivs(g) = '2026-11:10300 2026-12:14300' and (res #>> '{entry,amount_cents}')::bigint = 4300, 'Guardas: novembro paga em parte; dezembro 143,00';
  g2 := (public.create_card('cd-g-0010', ctx, 'Guardas 2', null, 5, 12, null) #>> '{card,id}')::uuid;
  insert into ids values ('g2_card', g2);
  perform public.add_card_purchase('cd-g-0011', g2, '2026-10-07', 10000, 1, 'Item', null);
  perform public.add_card_refund('cd-g-0012', g2, '2026-11-01', 15000, 'Devolução', null);
  perform public.add_card_charge('cd-g-0013', g2, '2026-12-01', 'juros', 100);
  assert pg_temp.ivs(g2) = '2026-11:-5000 2026-12:-4900', 'Guardas 2: o crédito de 50,00 chegou a dezembro';
  insert into ids select 'g2_auto', id from public.card_entries where card_id = g2 and source_month = '2026-11-01' and kind = 'estorno' and deleted_at is null;
  g3 := (public.create_card('cd-g-0020', ctx, 'Guardas 3', null, 5, 12, null) #>> '{card,id}')::uuid;
  insert into ids values ('g3_card', g3);
  insert into ids values ('g3_purchase', (public.add_card_purchase('cd-g-0021', g3, '2026-10-07', 20000, 2, 'Cama', null) #>> '{entry,id}')::uuid);
  perform pg_temp.check_links();
end $$;
reset role;

-- 11.1 Cartões: guarda (imutáveis; versão +1; excluído não muda) e restrições.
select pg_temp.expect_error(format('update public.cards set id = gen_random_uuid() where id = %L', pg_temp.id('g_card')), 'campo_imutavel');
select pg_temp.expect_error(format('update public.cards set context_id = %L where id = %L', pg_temp.id('bia_ctx'), pg_temp.id('g_card')), 'campo_imutavel');
select pg_temp.expect_error(format('update public.cards set created_by = %L where id = %L', pg_temp.id('bia'), pg_temp.id('g_card')), 'campo_imutavel');
select pg_temp.expect_error(format('update public.cards set created_at = now() - interval ''1 day'' where id = %L', pg_temp.id('g_card')), 'campo_imutavel');
select pg_temp.expect_error(format('update public.cards set limit_cents = 1000 where id = %L', pg_temp.id('g_card')), 'campo_imutavel');
select pg_temp.expect_error(format('update public.cards set limit_cents = 1000, version = version + 2 where id = %L', pg_temp.id('g_card')), 'campo_imutavel');
select pg_temp.expect_ok(format('update public.cards set limit_cents = 123456, nickname = ''Guardas b'', version = version + 1 where id = %L', pg_temp.id('g_card')));
select pg_temp.expect_error(format('update public.cards set nickname = ''x'', version = version + 1 where id = %L', (select id from public.cards where deleted_at is not null limit 1)), 'campo_imutavel');
select pg_temp.expect_error(format('update public.cards set deleted_at = now() where id = %L', pg_temp.id('g_card')), 'campo_imutavel');
select pg_temp.expect_error(format('update public.cards set deleted_at = now(), version = version + 1 where id = %L', pg_temp.id('g_card')), '%cards_exclusao%');
select pg_temp.expect_error(format('update public.cards set nickname = '''' , version = version + 1 where id = %L', pg_temp.id('g_card')), '%cards_nickname_check%');
select pg_temp.expect_error(format('update public.cards set nickname = '' x'', version = version + 1 where id = %L', pg_temp.id('g_card')), '%cards_nickname_check%');
select pg_temp.expect_error(format('update public.cards set nickname = repeat(''n'', 31), version = version + 1 where id = %L', pg_temp.id('g_card')), '%cards_nickname_check%');
select pg_temp.expect_error(format('update public.cards set nickname = ''4111111111111111'', version = version + 1 where id = %L', pg_temp.id('g_card')), '%cards_apelido_sem_numero%');
select pg_temp.expect_error(format('update public.cards set nickname = ''4111 1111 1111 1111'', version = version + 1 where id = %L', pg_temp.id('g_card')), '%cards_apelido_sem_numero%');
select pg_temp.expect_error(format('update public.cards set nickname = ''1234567890123456789'', version = version + 1 where id = %L', pg_temp.id('g_card')), '%cards_apelido_sem_numero%');
select pg_temp.expect_ok(format('update public.cards set nickname = ''123456789012'', version = version + 1 where id = %L', pg_temp.id('g_card')));
select pg_temp.expect_error(format('update public.cards set last_digits = ''123'', version = version + 1 where id = %L', pg_temp.id('g_card')), '%cards_last_digits_check%');
select pg_temp.expect_error(format('update public.cards set last_digits = ''12345'', version = version + 1 where id = %L', pg_temp.id('g_card')), '%cards_last_digits_check%');
select pg_temp.expect_error(format('update public.cards set last_digits = ''abcd'', version = version + 1 where id = %L', pg_temp.id('g_card')), '%cards_last_digits_check%');
select pg_temp.expect_error(format('update public.cards set closing_day = 0, version = version + 1 where id = %L', pg_temp.id('g_card')), '%cards_closing_day_check%');
select pg_temp.expect_error(format('update public.cards set closing_day = 32, version = version + 1 where id = %L', pg_temp.id('g_card')), '%cards_closing_day_check%');
select pg_temp.expect_error(format('update public.cards set due_day = 0, version = version + 1 where id = %L', pg_temp.id('g_card')), '%cards_due_day_check%');
select pg_temp.expect_error(format('update public.cards set due_day = 32, version = version + 1 where id = %L', pg_temp.id('g_card')), '%cards_due_day_check%');
select pg_temp.expect_error(format('update public.cards set limit_cents = 99, version = version + 1 where id = %L', pg_temp.id('g_card')), '%cards_limit_cents_check%');
select pg_temp.expect_error(format('update public.cards set limit_cents = 1000000000, version = version + 1 where id = %L', pg_temp.id('g_card')), '%cards_limit_cents_check%');
select pg_temp.expect_error(format('update public.cards set status = ''x'', version = version + 1 where id = %L', pg_temp.id('g_card')), '%cards_status_check%');
select pg_temp.expect_error(format('insert into public.cards (context_id, nickname, closing_day, due_day, created_by, version) values (%L, ''Z'', 5, 12, %L, 0)',
  pg_temp.id('noel_ctx'), pg_temp.id('noel')), '%cards_version_check%');
select pg_temp.expect_error(format('insert into public.cards (context_id, nickname, closing_day, due_day, created_by) values (gen_random_uuid(), ''Z'', 5, 12, %L)',
  pg_temp.id('noel')), '%cards_context_id_fkey%');
-- Excluir um cartão com lançamentos e contas: a conta (sem cascata) impede a exclusão física; o gatilho adiado impede a lógica (C0).
select pg_temp.expect_error(format('delete from public.cards where id = %L', pg_temp.id('g_card')), '%violates foreign key constraint%');
select pg_temp.expect_deferred(format('update public.cards set deleted_at = now(), deleted_by = %L, version = version + 1 where id = %L',
  pg_temp.id('noel'), pg_temp.id('g_card')), 'fatura_inconsistente', '23514');

-- 11.2 Lançamentos: guarda, forma de cada tipo, índices e chave estrangeira composta.
do $$
declare
  ctx text := pg_temp.id('noel_ctx')::text;
  g text := pg_temp.id('g_card')::text;
  noel text := pg_temp.id('noel')::text;
  p text := pg_temp.id('g_purchase')::text;
  ch text := pg_temp.id('g_charge')::text;
  rec text := pg_temp.id('g_record')::text;
  sal text := pg_temp.id('g_saldo')::text;
  g2 text := pg_temp.id('g2_card')::text;
  base text := 'insert into public.card_entries (context_id, card_id, kind, invoice_month, amount_cents, created_by, %s) values (%L, %L, %L, %L, %s, '
               || quote_literal(pg_temp.id('noel')) || ', %s)';
  d_ok text := 'description = ''x''';
  deleted_id text := (select id::text from public.card_entries where deleted_at is not null limit 1);
begin
  -- Guarda (imediata).
  perform pg_temp.expect_error(format('update public.card_entries set id = gen_random_uuid() where id = %L', ch), 'campo_imutavel');
  perform pg_temp.expect_error(format('update public.card_entries set context_id = %L where id = %L', pg_temp.id('bia_ctx'), ch), 'campo_imutavel');
  perform pg_temp.expect_error(format('update public.card_entries set card_id = %L where id = %L', g2, ch), 'campo_imutavel');
  perform pg_temp.expect_error(format('update public.card_entries set kind = ''estorno'' where id = %L', ch), 'campo_imutavel');
  perform pg_temp.expect_error(format('update public.card_entries set purchase_id = gen_random_uuid() where id = %L', p), 'campo_imutavel');
  perform pg_temp.expect_error(format('update public.card_entries set installment_number = 2 where id = %L', p), 'campo_imutavel');
  perform pg_temp.expect_error(format('update public.card_entries set source_month = ''2026-10-01'' where id = %L', sal), 'campo_imutavel');
  perform pg_temp.expect_error(format('update public.card_entries set payment_record_id = %L where id = %L', pg_temp.id('pgto1'), sal), 'campo_imutavel');
  perform pg_temp.expect_error(format('update public.card_entries set receipt_key = %L where id = %L', '2904729dae2e687811879a4343c29bb82be66b36778fca9a44ac9ce2070d58da', p), 'campo_imutavel');
  perform pg_temp.expect_error(format('update public.card_entries set created_by = %L where id = %L', pg_temp.id('bia'), ch), 'campo_imutavel');
  perform pg_temp.expect_error(format('update public.card_entries set created_at = now() - interval ''1 day'' where id = %L', ch), 'campo_imutavel');
  perform pg_temp.expect_error(format('update public.card_entries set amount_cents = 200 where id = %L', ch), 'campo_imutavel');
  perform pg_temp.expect_error(format('update public.card_entries set amount_cents = 200, version = version + 2 where id = %L', ch), 'campo_imutavel');
  perform pg_temp.expect_error(format('update public.card_entries set amount_cents = 200, version = version + 1 where id = %L', deleted_id), 'campo_imutavel');
  perform pg_temp.expect_ok(format('update public.card_entries set amount_cents = 200, version = version + 1 where id = %L', ch));
  -- Restrições de coluna e de forma.
  perform pg_temp.expect_error(format(base, 'charge_kind', ctx, g, 'encargo', '2026-11-01', '0', '''juros'''), '%card_entries_amount_cents_check%');
  perform pg_temp.expect_error(format(base, 'charge_kind', ctx, g, 'encargo', '2026-11-01', '1000000000', '''juros'''), '%card_entries_amount_cents_check%');
  perform pg_temp.expect_error(format(base, 'charge_kind', ctx, g, 'encargo', '2026-11-02', '100', '''juros'''), '%card_entries_invoice_month_check%');
  perform pg_temp.expect_error(format(base, 'charge_kind', ctx, g, 'x', '2026-11-01', '100', '''juros'''), '%card_entries_forma%');
  perform pg_temp.expect_error(format(base, 'charge_kind', ctx, g, 'encargo', '2026-11-01', '100', '''taxa'''), '%card_entries_charge_kind_check%');
  perform pg_temp.expect_error(format(base, 'charge_kind', ctx, g, 'encargo', '2026-11-01', '100', 'null'), '%card_entries_forma%');
  perform pg_temp.expect_error(format(base, 'charge_kind, description', ctx, g, 'encargo', '2026-11-01', '100', '''juros'', ''x'''), '%card_entries_forma%');
  perform pg_temp.expect_error(format(base, 'charge_kind, category', ctx, g, 'encargo', '2026-11-01', '100', '''juros'', ''Lazer'''), '%card_entries_forma%');
  perform pg_temp.expect_error(format(base, 'description', ctx, g, 'estorno', '2026-11-01', '100', 'null'), '%card_entries_forma%');
  perform pg_temp.expect_error(format(base, 'description, source_month', ctx, g, 'estorno', '2026-11-01', '100', '''x'', ''2026-10-01'''), '%card_entries_forma%');
  perform pg_temp.expect_error(format(base, 'description', ctx, g, 'estorno', '2026-11-01', '100', ''' x'''), '%card_entries_description_check%');
  perform pg_temp.expect_error(format(base, 'description', ctx, g, 'estorno', '2026-11-01', '100', 'repeat(''d'', 81)'), '%card_entries_description_check%');
  perform pg_temp.expect_error(format(base, 'description, category', ctx, g, 'estorno', '2026-11-01', '100', '''x'', repeat(''c'', 41)'), '%card_entries_category_check%');
  perform pg_temp.expect_error(format(base, 'source_month', ctx, g, 'saldo_anterior', '2026-12-01', '100', '''2026-11-01'''), '%card_entries_forma%');
  perform pg_temp.expect_error(format(base, 'source_month, payment_record_id', ctx, g, 'saldo_anterior', '2026-12-01', '100', '''2026-10-01'', ' || quote_literal(rec)), '%card_entries_origem%');
  perform pg_temp.expect_error(format(base, 'source_month, payment_record_id, description', ctx, g, 'saldo_anterior', '2026-12-01', '100', '''2026-11-01'', ' || quote_literal(rec) || ', ''x'''), '%card_entries_forma%');
  perform pg_temp.expect_error(format(base, 'purchased_on', ctx, g, 'parcela', '2026-11-01', '100', '''2026-10-07'''), '%card_entries_forma%');
  perform pg_temp.expect_error(format(base, 'description, purchase_id, purchased_on, installment_number, installment_total, purchase_total_cents, charge_kind',
    ctx, g, 'parcela', '2026-11-01', '100', '''x'', gen_random_uuid(), ''2026-10-07'', 1, 1, 100, ''juros'''), '%card_entries_forma%');
  perform pg_temp.expect_error(format(base, 'description, purchase_id, purchased_on, installment_number, installment_total, purchase_total_cents',
    ctx, g, 'parcela', '2026-11-01', '100', '''x'', gen_random_uuid(), ''2026-10-07'', 3, 2, 100'), '%card_entries_forma%');
  perform pg_temp.expect_error(format(base, 'description, purchase_id, purchased_on, installment_number, installment_total, purchase_total_cents',
    ctx, g, 'parcela', '2026-11-01', '100', '''x'', gen_random_uuid(), ''2026-10-07'', 1, 49, 100'), '%card_entries_forma%');
  perform pg_temp.expect_error(format(base, 'description, purchase_id, purchased_on, installment_number, installment_total, purchase_total_cents',
    ctx, g, 'parcela', '2026-11-01', '100', '''x'', gen_random_uuid(), ''2026-10-07'', 1, 3, 2'), '%card_entries_forma%');
  perform pg_temp.expect_error(format(base, 'description, purchase_id, purchased_on, installment_number, installment_total, purchase_total_cents',
    ctx, g, 'parcela', '2026-11-01', '100', '''x'', gen_random_uuid(), ''2026-10-07'', 1, 1, 1000000000'), '%card_entries_forma%');
  perform pg_temp.expect_error(format(base, 'description, purchase_id, purchased_on, installment_number, installment_total, purchase_total_cents',
    ctx, g, 'parcela', '2026-11-01', '200', '''x'', gen_random_uuid(), ''2026-10-07'', 1, 1, 100'), '%card_entries_forma%');
  -- Índices únicos: uma parcela por número, um saldo anterior e um crédito levado por fatura de origem.
  perform pg_temp.expect_error(format(base, 'description, purchase_id, purchased_on, installment_number, installment_total, purchase_total_cents',
    ctx, g, 'parcela', '2026-11-01', '10000', '''Mesa'', ' || quote_literal(p) || ', ''2026-10-07'', 1, 2, 20000'), '%card_entries_one_installment%');
  perform pg_temp.expect_error(format(base, 'source_month, payment_record_id', ctx, g, 'saldo_anterior', '2026-12-01', '100', '''2026-11-01'', ' || quote_literal(rec)), '%card_entries_one_carry%');
  perform pg_temp.expect_error(format(base, 'source_month', ctx, g2, 'estorno', '2026-12-01', '100', '''2026-11-01'''), '%card_entries_one_credit%');
  -- Chave estrangeira composta: o contexto é o do cartão.
  perform pg_temp.expect_error(format(base, 'charge_kind', pg_temp.id('bia_ctx')::text, g, 'encargo', '2026-11-01', '100', '''juros'''), '%card_entries_card_fk%');
  -- O gasto do saldo anterior: a exclusão física do gasto leva o saldo (cascata), sem deixar saldo sem gasto.
  perform pg_temp.expect_error(format(base, 'source_month, payment_record_id', ctx, g2, 'saldo_anterior', '2026-12-01', '100', '''2026-11-01'', gen_random_uuid()'), '%card_entries_payment_record_id_fkey%');
end $$;

-- 11.3 Contas a pagar e gastos: ligação com o cartão.
do $$
declare
  ctx text := pg_temp.id('noel_ctx')::text;
  g text := pg_temp.id('g_card')::text;
  noel text := pg_temp.id('noel')::text;
  acc text := pg_temp.id('noel_acc')::text;
  nov text := pg_temp.cmid(pg_temp.id('g_card'), '2026-11-01')::text;
  dez text := pg_temp.cmid(pg_temp.id('g_card'), '2026-12-01')::text;
  cbase text := 'insert into public.commitments (context_id, description, amount_cents, due_on, created_by, %s) values (%L, ''Fatura Guardas'', 100, ''2027-08-12'', %L, %s)';
  rbase text := 'insert into public.financial_records (context_id, account_id, kind, amount_cents, currency, occurred_on, description, created_by, %s) values (%L, %L, ''despesa'', 100, ''BRL'', ''2026-10-07'', ''Direto'', %L, %s)';
begin
  perform pg_temp.expect_error(format('update public.commitments set card_id = null where id = %L', dez), 'campo_imutavel');
  perform pg_temp.expect_error(format('update public.commitments set invoice_month = ''2027-01-01'' where id = %L', dez), 'campo_imutavel');
  perform pg_temp.expect_error(format('update public.commitments set card_id = %L where id = %L', pg_temp.id('g2_card'), dez), 'campo_imutavel');
  perform pg_temp.expect_error(format('update public.commitments set card_closing_on = ''2026-11-04'' where id = %L', nov), 'campo_imutavel');
  perform pg_temp.expect_error(format('update public.commitments set amount_is_estimate = true where id = %L', nov), 'campo_imutavel');
  perform pg_temp.expect_error(format('update public.commitments set amount_cents = amount_cents + 1 where id = %L', nov), 'campo_imutavel');
  perform pg_temp.expect_error(format(cbase, 'card_id', ctx, noel, quote_literal(g)), '%commitments_cartao_par%');
  perform pg_temp.expect_error(format(cbase, 'card_id, invoice_month', ctx, noel, quote_literal(g) || ', ''2027-08-01'''), '%commitments_cartao_par%');
  perform pg_temp.expect_error(format(cbase, 'card_id, invoice_month, card_closing_on', ctx, noel, quote_literal(g) || ', ''2027-08-02'', ''2027-08-05'''), '%commitments_cartao_mes%');
  perform pg_temp.expect_error(format(cbase, 'card_id, invoice_month, card_closing_on, series_id, occurrence_number', ctx, noel,
    quote_literal(g) || ', ''2027-08-01'', ''2027-08-05'', gen_random_uuid(), 1'), '%commitments_cartao_sem_serie%');
  perform pg_temp.expect_error(format(cbase, 'amount_is_estimate', ctx, noel, 'true'), '%commitments_series_marcas%');
  perform pg_temp.expect_error(format(cbase, 'card_id, invoice_month, card_closing_on, series_override', ctx, noel, quote_literal(g) || ', ''2027-08-01'', ''2027-08-05'', true'), '%commitments_series_marcas%');
  perform pg_temp.expect_ok(format(cbase, 'card_id, invoice_month, card_closing_on, amount_is_estimate', ctx, noel, quote_literal(g) || ', ''2027-08-01'', ''2027-08-05'', true'));
  perform pg_temp.expect_error(format(cbase, 'card_id, invoice_month, card_closing_on', ctx, noel, quote_literal(g) || ', ''2026-12-01'', ''2026-12-05'''), '%commitments_one_live_invoice%');
  perform pg_temp.expect_error(format(cbase, 'card_id, invoice_month, card_closing_on', pg_temp.id('bia_ctx')::text, noel, quote_literal(g) || ', ''2027-08-01'', ''2027-08-05'''), '%commitments_card_fk%');
  -- Gastos: pagamento de fatura precisa da conta, ser despesa e o mês certo; cartão e mês nunca mudam; a chave da nota não vale aqui.
  perform pg_temp.expect_error(format(rbase, 'card_id, invoice_month', ctx, acc, noel, quote_literal(g) || ', ''2026-11-01'''), '%financial_records_cartao%');
  perform pg_temp.expect_error(format(rbase, 'card_id', ctx, acc, noel, quote_literal(g)), '%financial_records_cartao%');
  perform pg_temp.expect_error(format(rbase, 'card_id, invoice_month, commitment_id', ctx, acc, noel, quote_literal(g) || ', ''2026-11-02'', ' || quote_literal(nov)), '%financial_records_cartao%');
  perform pg_temp.expect_error(format(rbase, 'invoice_month', ctx, acc, noel, '''2026-11-01'''), '%financial_records_cartao%');
  perform pg_temp.expect_error(format('update public.financial_records set card_id = null where id = %L', pg_temp.id('g_record')), 'campo_imutavel');
  perform pg_temp.expect_error(format('update public.financial_records set invoice_month = ''2026-12-01'' where id = %L', pg_temp.id('g_record')), 'campo_imutavel');
  perform pg_temp.expect_error(format('update public.financial_records set card_id = %L where id = %L', pg_temp.id('g2_card'), pg_temp.id('g_record')), 'campo_imutavel');
  perform pg_temp.expect_error(format(rbase, 'card_id, invoice_month, commitment_id, receipt_key', ctx, acc, noel,
    quote_literal(g) || ', ''2026-11-01'', ' || quote_literal(nov) || ', ''2904729dae2e687811879a4343c29bb82be66b36778fca9a44ac9ce2070d58da'''), '%financial_records_receipt_key%');
end $$;

-- 11.4 Invariantes no fim da transação (cada caso desfeito no próprio bloco).
-- C1: a conta da fatura é o total dos lançamentos.
select pg_temp.expect_deferred(format('update public.commitments set amount_cents = amount_cents + 1 where card_id = %L and invoice_month = ''2026-12-01'' and deleted_at is null',
  pg_temp.id('g_card')), 'fatura_inconsistente', '23514');
select pg_temp.expect_deferred(format('update public.commitments set deleted_at = now(), deleted_by = %L where card_id = %L and invoice_month = ''2026-12-01'' and deleted_at is null',
  pg_temp.id('noel'), pg_temp.id('g_card')), 'fatura_inconsistente', '23514');
select pg_temp.expect_deferred(format('delete from public.commitments where card_id = %L and invoice_month = ''2026-12-01'' and deleted_at is null',
  pg_temp.id('g_card')), 'fatura_inconsistente', '23514');
select pg_temp.expect_deferred(format($f$insert into public.card_entries (context_id, card_id, kind, invoice_month, amount_cents, charge_kind, created_by)
  values (%L, %L, 'encargo', '2026-12-01', 100, 'juros', %L)$f$, pg_temp.id('noel_ctx'), pg_temp.id('g_card'), pg_temp.id('noel')), 'fatura_inconsistente', '23514');
select pg_temp.expect_deferred(format('update public.card_entries set deleted_at = now(), deleted_by = %L, version = version + 1 where id = %L',
  pg_temp.id('noel'), pg_temp.id('g_charge')), 'fatura_inconsistente', '23514');
select pg_temp.expect_deferred(format($f$insert into public.commitments (context_id, description, amount_cents, due_on, created_by, card_id, invoice_month, card_closing_on)
  values (%L, 'Fatura Guardas', 100, '2030-01-12', %L, %L, '2030-01-01', '2030-01-05')$f$, pg_temp.id('noel_ctx'), pg_temp.id('noel'), pg_temp.id('g_card')), 'fatura_inconsistente', '23514');
select pg_temp.expect_deferred(format('update public.commitments set status = ''quitado'' where card_id = %L and invoice_month = ''2026-12-01'' and deleted_at is null',
  pg_temp.id('g_card')), 'fatura_inconsistente', '23514');
-- C2: as parcelas da compra (totais das faturas mantidos, só a compra fica errada).
select pg_temp.expect_deferred(format($f$
  update public.card_entries set amount_cents = 9999, version = version + 1 where purchase_id = %L and installment_number = 1;
  update public.card_entries set amount_cents = 10001, version = version + 1 where purchase_id = %L and installment_number = 2;
  update public.commitments set amount_cents = 9999 where card_id = %L and invoice_month = '2026-11-01';
  update public.commitments set amount_cents = 10001 where card_id = %L and invoice_month = '2026-12-01'$f$,
  pg_temp.id('g3_purchase'), pg_temp.id('g3_purchase'), pg_temp.id('g3_card'), pg_temp.id('g3_card')), 'compra_inconsistente', '23514');
select pg_temp.expect_deferred(format('update public.card_entries set description = ''x'', version = version + 1 where purchase_id = %L and installment_number = 1',
  pg_temp.id('g3_purchase')), 'compra_inconsistente', '23514');
select pg_temp.expect_deferred(format($f$
  update public.card_entries set deleted_at = now(), deleted_by = %L, version = version + 1 where purchase_id = %L and installment_number = 2;
  update public.card_entries set version = version + 1 where purchase_id = %L and installment_number = 1;
  update public.commitments set deleted_at = now(), deleted_by = %L where card_id = %L and invoice_month = '2026-12-01'$f$,
  pg_temp.id('noel'), pg_temp.id('g3_purchase'), pg_temp.id('g3_purchase'), pg_temp.id('noel'), pg_temp.id('g3_card')), 'compra_inconsistente', '23514');
select pg_temp.expect_deferred(format('update public.card_entries set installment_total = 3, version = version + 1 where purchase_id = %L', pg_temp.id('g3_purchase')),
  'compra_inconsistente', '23514');
select pg_temp.expect_deferred(format($f$
  update public.card_entries set invoice_month = '2027-01-01', version = version + 1 where purchase_id = %L and installment_number = 2;
  update public.card_entries set version = version + 1 where purchase_id = %L and installment_number = 1;
  update public.commitments set deleted_at = now(), deleted_by = %L where card_id = %L and invoice_month = '2026-12-01';
  insert into public.commitments (context_id, description, amount_cents, due_on, created_by, card_id, invoice_month, card_closing_on)
    values (%L, 'Fatura Guardas 3', 10000, '2027-01-12', %L, %L, '2027-01-01', '2027-01-05')$f$,
  pg_temp.id('g3_purchase'), pg_temp.id('g3_purchase'), pg_temp.id('noel'), pg_temp.id('g3_card'), pg_temp.id('noel_ctx'), pg_temp.id('noel'), pg_temp.id('g3_card')),
  'compra_inconsistente', '23514');
-- C3: o gasto do pagamento e o saldo anterior.
select pg_temp.expect_deferred(format('update public.card_entries set deleted_at = now(), deleted_by = %L, version = version + 1 where id = %L',
  pg_temp.id('noel'), pg_temp.id('g_saldo')), 'fatura_inconsistente', '23514');
select pg_temp.expect_deferred(format('update public.financial_records set amount_cents = 10300 where id = %L', pg_temp.id('g_record')), 'fatura_inconsistente', '23514');
select pg_temp.expect_deferred(format($f$update public.card_entries set amount_cents = 4000, version = version + 1 where id = %L;
  update public.commitments set amount_cents = 14000 where card_id = %L and invoice_month = '2026-12-01' and deleted_at is null$f$,
  pg_temp.id('g_saldo'), pg_temp.id('g_card')), 'fatura_inconsistente', '23514');
select pg_temp.expect_deferred(format($f$
  insert into public.financial_records (id, context_id, account_id, kind, amount_cents, currency, occurred_on, description, created_by)
    values (%L, %L, %L, 'despesa', 100, 'BRL', '2026-10-07', 'Gasto comum', %L);
  insert into public.card_entries (context_id, card_id, kind, invoice_month, amount_cents, source_month, payment_record_id, created_by)
    values (%L, %L, 'saldo_anterior', '2026-12-01', 100, '2026-11-01', %L, %L)$f$,
  pg_temp.id('k5_entry'), pg_temp.id('noel_ctx'), pg_temp.id('noel_acc'), pg_temp.id('noel'), pg_temp.id('noel_ctx'), pg_temp.id('g2_card'), pg_temp.id('k5_entry'), pg_temp.id('noel')),
  'fatura_inconsistente', '23514');
select pg_temp.expect_deferred(format($f$update public.financial_records set deleted_at = now(), deleted_by = %L, version = version + 1 where id = %L;
  update public.commitments set status = 'aberto' where card_id = %L and invoice_month = '2026-11-01' and deleted_at is null$f$,
  pg_temp.id('noel'), pg_temp.id('g_record'), pg_temp.id('g_card')), 'fatura_inconsistente', '23514');
-- C4: o estorno automático é o crédito da fatura anterior.
select pg_temp.expect_deferred(format('update public.card_entries set deleted_at = now(), deleted_by = %L, version = version + 1 where id = %L',
  pg_temp.id('noel'), pg_temp.id('g2_auto')), 'fatura_inconsistente', '23514');
select pg_temp.expect_deferred(format('update public.card_entries set amount_cents = 4000, version = version + 1 where id = %L', pg_temp.id('g2_auto')), 'fatura_inconsistente', '23514');
select pg_temp.expect_deferred(format($f$insert into public.card_entries (context_id, card_id, kind, invoice_month, amount_cents, source_month, created_by)
  values (%L, %L, 'estorno', '2026-12-01', 100, '2026-11-01', %L);
  update public.commitments set amount_cents = amount_cents - 100 where card_id = %L and invoice_month = '2026-12-01' and deleted_at is null$f$,
  pg_temp.id('noel_ctx'), pg_temp.id('g_card'), pg_temp.id('noel'), pg_temp.id('g_card')), 'fatura_inconsistente', '23514');
select pg_temp.check_links();

-- 11.5 Apagar o contexto inteiro (dados de quem pede a exclusão da conta) continua possível com cartões, faturas e pagamentos.
do $$
declare
  c text;
begin
  foreach c in array array['noel_ctx', 'bia_ctx', 'fam'] loop
    begin
      delete from public.financial_records where context_id = pg_temp.id(c);
      delete from public.financial_contexts where id = pg_temp.id(c);
      set constraints all immediate;
      assert not exists (select 1 from public.cards where context_id = pg_temp.id(c))
         and not exists (select 1 from public.card_entries where context_id = pg_temp.id(c))
         and not exists (select 1 from public.commitments where context_id = pg_temp.id(c)), 'contexto apagado por inteiro: ' || c;
      raise exception 'desfeito';
    exception when others then
      set constraints all deferred;
      if sqlerrm <> 'desfeito' then
        raise exception 'apagar o contexto inteiro (%) deveria passar: % (%)', c, sqlerrm, sqlstate;
      end if;
    end;
  end loop;
end $$;
select pg_temp.check_links();

-- ---------------------------------------------------------------------------
-- 11b. Revisão da auditoria (Lia, conta nova, hoje 07/10/2026; cartões fecham dia 3 e vencem dia 10, salvo onde dito):
--  a) a fatura só se paga depois que FECHA (fatura_aberta antes disso, sem gravar nada; a data do pagamento pode ser anterior ao
--     fechamento); as compras vão sempre para a fatura natural, sem desvio: se ela, ou uma parcela adiante, já está paga,
--     fatura_paga; fatura fechada e não paga recebe a compra do ciclo dela;
--  b) fatura antiga (compra de até 48 meses atrás) paga na data real; a janela de 1 ano continua para as recentes;
--  c) limite usado com crédito em cadeia: soma por fatura não paga de max(0, total), igual ao core;
--  d) apelido sem número de cartão com qualquer separador;
--  e) tempo perto do limite de 5.000 lançamentos (gatilho de consistência por linha);
--  f) leitura por chave da nota (receipt_items) e chave guardada só como resumo SHA-256 (nunca a chave, que pode ter CPF).
-- ---------------------------------------------------------------------------
reset role;
select pg_temp.today('2026-10-07');
set role authenticated;
do $$
declare
  ctx uuid := pg_temp.id('lia_ctx');
  acc uuid := pg_temp.id('lia_acc');
  c uuid;
  p uuid;
  res jsonb;
begin
  perform pg_temp.as_('lia');

  -- a) Cartão "Fechamento". Compra de 20,00 em 01/10 (fatura de outubro, que fechou em 03/10 e vence em 10/10): paga em 07/10.
  c := (public.create_card('li-a-0001', ctx, 'Fechamento', null, 3, 10, null) #>> '{card,id}')::uuid;
  insert into ids values ('lia_fechamento', c);
  perform public.add_card_purchase('li-a-0002', c, '2026-10-01', 2000, 1, 'Compra de outubro');
  assert pg_temp.iv(c, '2026-10-01') = 'fechada 2000 conta2000v1', 'outubro fechada';
  res := public.pay_invoice('li-a-0003', c, '2026-10-01', pg_temp.iv_ver(c, '2026-10-01'), 2000, '2026-10-07', acc);
  assert res #>> '{invoices,0,status}' = 'paga', 'outubro paga';
  -- Compra de 05/10 (depois do fechamento): novembro, aberta (fecha em 03/11). Fatura aberta não se paga: a recusa vem sem
  -- gravar nada, qualquer que seja o valor ou a data.
  res := public.add_card_purchase('li-a-0004', c, '2026-10-05', 30000, 1, 'Mercado grande', 'Mercado');
  assert res #>> '{entry,invoice_month}' = '2026-11-01' and pg_temp.iv(c, '2026-11-01') = 'aberta 30000 conta30000v1e', 'novembro aberta e estimada';
  perform pg_temp.expect_code(pg_temp.pi('li-a-0005', c, '2026-11-01', pg_temp.iv_ver(c, '2026-11-01'), 30000, '2026-10-07', acc), 'fatura_aberta', 'PT409');
  perform pg_temp.expect_code(pg_temp.pi('li-a-0005', c, '2026-11-01', pg_temp.iv_ver(c, '2026-11-01'), 10000, '2026-10-07', acc), 'fatura_aberta', 'PT409');
  assert pg_temp.iv(c, '2026-11-01') = 'aberta 30000 conta30000v1e' and not exists (select 1 from public.record_operations where idempotency_key = 'li-a-0005')
     and (select count(*) from public.financial_records where card_id = c and deleted_at is null) = 1, 'a recusa não grava nada';

  -- Sem desvio: as compras do ciclo vão sempre para a fatura natural (novembro), com ou sem parcelas.
  res := public.add_card_purchase('li-a-0006', c, '2026-10-07', 7000, 1, 'Farmácia', 'Saúde');
  assert res #>> '{entry,invoice_month}' = '2026-11-01' and pg_temp.cm(c, '2026-11-01') like '37000 2026-11-10 2026-11-03 aberto % estimado',
    'compra de 07/10: fatura de novembro';
  res := public.add_card_purchase('li-a-0007', c, '2026-10-07', 9000, 3, 'Tênis', 'Lazer');
  assert res #>> '{entry,invoice_month}' = '2026-11-01'
     and pg_temp.ivs(c) = '2026-10:2000 2026-11:40000 2026-12:3000 2027-01:3000', 'três parcelas a partir de novembro';
  assert (select sum(total_cents) from public.invoice_items where card_id = c) = 2000 + 30000 + 7000 + 9000, 'soma das faturas = soma das compras';
  assert (select count(*) from public.invoice_items where card_id = c and status in ('aberta', 'fechada') and commitment_id is not null) = 3
     and (select count(*) from public.invoice_items where card_id = c and status = 'paga') = 1, 'três a pagar, uma paga';
  perform pg_temp.check_links();
  perform pg_temp.views_agree();

  -- Novembro fecha em 03/11. Em 04/11 já se paga; a data do pagamento pode ser anterior ao fechamento (quem pagou antes
  -- informa o dia em que pagou).
  perform pg_temp.today('2026-11-04');
  assert pg_temp.iv(c, '2026-11-01') like 'fechada 40000 %', 'novembro fechada';
  res := public.pay_invoice('li-a-0008', c, '2026-11-01', pg_temp.iv_ver(c, '2026-11-01'), 40000, '2026-11-02', acc);
  assert res #>> '{invoices,0,status}' = 'paga' and res #>> '{record,occurred_on}' = '2026-11-02' and pg_temp.iv(c, '2026-11-01') like 'paga 40000 conta0v%',
    'novembro paga depois do fechamento, na data em que foi paga de fato';
  -- Compra do ciclo de novembro (data até 03/11), agora numa fatura paga: recusada, na criação e na mudança de data. A de 04/11
  -- é do ciclo de dezembro e entra normalmente.
  perform pg_temp.expect_code(pg_temp.ap('li-a-0009', c, '2026-11-02', 1000, 1, 'Esquecida de novembro'), 'fatura_paga', 'PT409');
  res := public.add_card_purchase('li-a-0010', c, '2026-11-04', 500, 1, 'Café');
  p := (res #>> '{entry,id}')::uuid;
  assert res #>> '{entry,invoice_month}' = '2026-12-01' and pg_temp.ivs(c) = '2026-10:2000 2026-11:40000 2026-12:3500 2027-01:3000', 'compra de 04/11: dezembro';
  perform pg_temp.expect_code(pg_temp.ue('li-a-0011', p, 1, 'compra', 500, '2026-11-02', 'Café', null, 1), 'fatura_paga', 'PT409');
  assert pg_temp.entv(p) = 1 and pg_temp.ivs(c) = '2026-10:2000 2026-11:40000 2026-12:3500 2027-01:3000', 'a mudança recusada não grava';
  -- Fatura natural paga (outubro, paga em 07/10): compra com data nesse ciclo é recusada, na criação e na mudança de data.
  perform pg_temp.expect_code(pg_temp.ap('li-a-0014', c, '2026-10-02', 1000, 1, 'Esquecida'), 'fatura_paga', 'PT409');
  perform pg_temp.expect_code(pg_temp.ap('li-a-0014b', c, '2026-09-20', 1000, 1, 'Esquecida'), 'fatura_paga', 'PT409');
  perform pg_temp.expect_code(pg_temp.ue('li-a-0015b', p, 1, 'compra', 500, '2026-10-02', 'Café', null, 1), 'fatura_paga', 'PT409');
  assert (select count(*) from public.record_operations where idempotency_key in ('li-a-0009', 'li-a-0011', 'li-a-0014', 'li-a-0014b', 'li-a-0015b')) = 0, 'recusas não gravam';
  -- Encargo e estorno escolhem a fatura (vêm da fatura do banco): fatura paga continua recusada.
  perform pg_temp.expect_code(pg_temp.ach('li-a-0016', c, '2026-10-01', 'multa', 100), 'fatura_paga', 'PT409');
  perform pg_temp.expect_code(pg_temp.arf('li-a-0017', c, '2026-11-01', 100, 'Devolução'), 'fatura_paga', 'PT409');
  -- Desfazer o pagamento de novembro reabre o ciclo (fechada, não paga): a compra com data nele volta a ser aceita.
  res := public.undo_invoice_payment('li-a-0018', c, '2026-11-01', pg_temp.iv_ver(c, '2026-11-01'));
  assert pg_temp.iv(c, '2026-11-01') like 'fechada 40000 conta40000v%', 'novembro reaberta';
  res := public.add_card_purchase('li-a-0019', c, '2026-11-02', 1000, 1, 'Esquecida de novembro');
  assert res #>> '{entry,invoice_month}' = '2026-11-01' and pg_temp.ivs(c) = '2026-10:2000 2026-11:41000 2026-12:3500 2027-01:3000',
    'fatura natural fechada e não paga recebe a compra';
  perform public.delete_card_entry('li-a-0019b', (res #>> '{entry,id}')::uuid, 1);
  perform pg_temp.check_links();
  perform pg_temp.views_agree();

  -- Pagamento parcial depois do fechamento: o que sobra vai para dezembro como saldo anterior. Outubro (fechada) segue sem pagar.
  c := (public.create_card('li-a-0030', ctx, 'Parcial', null, 3, 10, null) #>> '{card,id}')::uuid;
  perform public.add_card_purchase('li-a-0031', c, '2026-10-05', 30000, 1, 'Reforma');
  perform public.add_card_purchase('li-a-0031b', c, '2026-09-20', 1000, 1, 'Compra de setembro');
  res := public.pay_invoice('li-a-0032', c, '2026-11-01', pg_temp.iv_ver(c, '2026-11-01'), 20000, '2026-11-04', acc);
  assert res #>> '{invoices,0,status}' = 'paga_em_parte' and res #>> '{entry,kind}' = 'saldo_anterior' and (res #>> '{entry,amount_cents}')::bigint = 10000,
    'novembro paga em parte; 100,00 de saldo anterior em dezembro';
  res := public.add_card_purchase('li-a-0033', c, '2026-11-04', 5000, 1, 'Depois do pagamento');
  assert res #>> '{entry,invoice_month}' = '2026-12-01' and pg_temp.ivs(c) = '2026-10:1000 2026-11:30000 2026-12:15000', 'a compra vai para dezembro, junto do saldo';
  -- Parcela adiante em fatura paga: 2 vezes a partir de setembro seriam outubro (fechada, não paga) e novembro (paga em parte).
  perform pg_temp.expect_code(pg_temp.ap('li-a-0033a', c, '2026-09-20', 2000, 2, 'Em duas vezes'), 'fatura_paga', 'PT409');
  assert not exists (select 1 from public.record_operations where idempotency_key = 'li-a-0033a')
     and pg_temp.ivs(c) = '2026-10:1000 2026-11:30000 2026-12:15000', 'a recusa não grava';
  -- Mudar a data para o ciclo de novembro (paga em parte) é recusado; para o de outubro (fechada, não paga), aceito.
  res := public.add_card_purchase('li-a-0033b', c, '2026-11-04', 1000, 1, 'Troca de data');
  p := (res #>> '{entry,id}')::uuid;
  assert res #>> '{entry,invoice_month}' = '2026-12-01', 'compra de 04/11: dezembro';
  perform pg_temp.expect_code(pg_temp.ue('li-a-0033c', p, 1, 'compra', 1000, '2026-10-06', 'Troca de data', null, 1), 'fatura_paga', 'PT409');
  res := public.update_card_entry('li-a-0033e', p, 1, 'compra', 1000, '2026-09-20', 'Troca de data', null, 1);
  assert res #>> '{entry,invoice_month}' = '2026-10-01' and pg_temp.ivs(c) = '2026-10:2000 2026-11:30000 2026-12:15000',
    'data no ciclo de outubro (fechada, não paga): a compra vai para outubro';
  perform public.delete_card_entry('li-a-0033d', p, 2);
  assert (select sum(total_cents) from public.invoice_items where card_id = c and status in ('aberta', 'fechada')) + 20000 = 36000,
    'o que falta pagar (160,00) mais o já pago (200,00) é o que se comprou (360,00)';
  -- Dezembro fecha em 03/12: em 04/12 o resto pode ser pago, e os pagamentos somam as compras.
  perform pg_temp.today('2026-12-04');
  res := public.pay_invoice('li-a-0034', c, '2026-12-01', pg_temp.iv_ver(c, '2026-12-01'), 15000, '2026-12-04', acc);
  res := public.pay_invoice('li-a-0035', c, '2026-10-01', pg_temp.iv_ver(c, '2026-10-01'), 1000, '2026-12-04', acc);
  assert res #>> '{invoices,0,status}' = 'paga' and (select sum(amount_cents) from public.financial_records
          where context_id = ctx and card_id = c and deleted_at is null) = 36000, 'o resto pode ser pago; os pagamentos somam as compras';
  perform pg_temp.check_links();
  perform pg_temp.today('2026-10-07');

  -- b) Fatura antiga: compra de 20/11/2024 em 3 vezes (faturas de dez/2024 a fev/2025, todas vencidas) paga na data real.
  c := (public.create_card('li-b-0001', ctx, 'Antigo', null, 3, 10, null) #>> '{card,id}')::uuid;
  perform public.add_card_purchase('li-b-0002', c, '2024-11-20', 9000, 3, 'Compra antiga');
  assert pg_temp.ivs(c) = '2024-12:3000 2025-01:3000 2025-02:3000' and pg_temp.iv(c, '2024-12-01') = 'fechada 3000 conta3000v1', 'três faturas antigas';
  -- Período da fatura de dez/2024: 04/11 a 03/12. Antes do início do período, não; no primeiro dia, sim.
  perform pg_temp.expect_code(pg_temp.pi('li-b-0003', c, '2024-12-01', pg_temp.iv_ver(c, '2024-12-01'), 3000, '2024-11-03', acc), 'data_invalida', '22023');
  res := public.pay_invoice('li-b-0004', c, '2024-12-01', pg_temp.iv_ver(c, '2024-12-01'), 3000, '2024-12-10', acc);
  assert res #>> '{record,occurred_on}' = '2024-12-10' and res #>> '{invoices,0,status}' = 'paga', 'paga em 10/12/2024, a data real do vencimento';
  perform pg_temp.expect_code(pg_temp.pi('li-b-0005', c, '2025-01-01', pg_temp.iv_ver(c, '2025-01-01'), 3000, '2024-12-03', acc), 'data_invalida', '22023');
  res := public.pay_invoice('li-b-0006', c, '2025-01-01', pg_temp.iv_ver(c, '2025-01-01'), 3000, '2024-12-04', acc);
  assert res #>> '{record,occurred_on}' = '2024-12-04', 'no primeiro dia do período';
  perform pg_temp.expect_code(pg_temp.pi('li-b-0008', c, '2025-02-01', pg_temp.iv_ver(c, '2025-02-01'), 3000, '2026-10-08', acc), 'data_futura', '22023');
  perform pg_temp.expect_code(pg_temp.pi('li-b-0009', c, '2025-02-01', pg_temp.iv_ver(c, '2025-02-01'), 3000, null, acc), 'data_invalida', '22023');
  -- Fatura recente: a janela de 1 ano continua (07/10/2025 vale; 06/10/2025 não).
  c := (public.create_card('li-b-0020', ctx, 'Janela', null, 3, 10, null) #>> '{card,id}')::uuid;
  perform public.add_card_purchase('li-b-0021', c, '2026-09-20', 1000, 1, 'Recente');   -- fatura de outubro, fechada em 03/10
  perform pg_temp.expect_code(pg_temp.pi('li-b-0022', c, '2026-10-01', pg_temp.iv_ver(c, '2026-10-01'), 1000, '2025-10-06', acc), 'data_invalida', '22023');
  res := public.pay_invoice('li-b-0023', c, '2026-10-01', pg_temp.iv_ver(c, '2026-10-01'), 1000, '2025-10-07', acc);
  assert res #>> '{record,occurred_on}' = '2025-10-07', 'um ano atrás exato é aceito';
  perform pg_temp.check_links();

  -- c) Limite usado: 450,00 em 3 vezes e estorno de 400,00 em novembro (fecha dia 5, vence dia 12, hoje depois do fechamento).
  c := (public.create_card('li-c-0001', ctx, 'Cadeia', null, 5, 12, 100000) #>> '{card,id}')::uuid;
  perform public.add_card_purchase('li-c-0002', c, '2026-10-07', 45000, 3, 'Geladeira');
  assert (public.add_card_refund('li-c-0003', c, '2026-11-01', 40000, 'Devolução') #>> '{card,used_cents}')::bigint = 5000
     and pg_temp.ivs(c) = '2026-11:-25000 2026-12:-10000 2027-01:5000', 'crédito em cadeia: o único a pagar é janeiro (50,00)';
  assert (select used_cents from public.card_items where id = c) = 5000, 'card_items.used_cents = soma de max(0, total) das faturas não pagas';
  -- O caso da auditoria: 200,00 em novembro e 600,00 em 2 vezes, estorno de 600,00: novembro -100,00, dezembro 200,00.
  c := (public.create_card('li-c-0010', ctx, 'Cadeia 2', null, 5, 12, null) #>> '{card,id}')::uuid;
  perform public.add_card_purchase('li-c-0011', c, '2026-10-07', 20000, 1, 'Mercado');
  perform public.add_card_purchase('li-c-0012', c, '2026-10-07', 60000, 2, 'Sofá');
  perform public.add_card_refund('li-c-0013', c, '2026-11-01', 60000, 'Sofá devolvido');
  assert pg_temp.ivs(c) = '2026-11:-10000 2026-12:20000' and (select used_cents from public.card_items where id = c) = 20000,
    'novembro -100,00 levado a dezembro; limite usado 200,00 (e não 100,00)';
  perform pg_temp.today('2026-12-06');   -- dezembro fechou em 05/12
  res := public.pay_invoice('li-c-0014', c, '2026-12-01', pg_temp.iv_ver(c, '2026-12-01'), 20000, '2026-12-06', acc);
  assert (res #>> '{card,used_cents}')::bigint = 0 and (select used_cents from public.card_items where id = c) = 0, 'fatura paga sai do limite usado';
  perform pg_temp.today('2026-10-07');
  perform pg_temp.check_links();
  perform pg_temp.views_agree();

  -- d) Apelido sem número de cartão: 13 a 19 dígitos seguidos ou em grupos de 3+ dígitos com UM separador (espaço, ponto, hífen,
  -- barra, vírgula, sublinhado). Dígitos espalhados entre palavras ou em grupos curtos são aceitos.
  perform pg_temp.expect_code(pg_temp.cc('li-d-0001', ctx, '4111/1111/1111/1111', null, 3, 10, null), 'apelido_invalido', '22023');
  perform pg_temp.expect_code(pg_temp.cc('li-d-0002', ctx, '4111_1111_1111_1111', null, 3, 10, null), 'apelido_invalido', '22023');
  perform pg_temp.expect_code(pg_temp.cc('li-d-0003', ctx, '4111,1111,1111,1111', null, 3, 10, null), 'apelido_invalido', '22023');
  perform pg_temp.expect_code(pg_temp.cc('li-d-0004', ctx, '3782 822463 10005', null, 3, 10, null), 'apelido_invalido', '22023');
  perform pg_temp.expect_code(pg_temp.cc('li-d-0005', ctx, '4111 1111 1111 111', null, 3, 10, null), 'apelido_invalido', '22023');
  perform pg_temp.expect_code(pg_temp.cc('li-d-0006', ctx, '4111.1111-1111 1111', null, 3, 10, null), 'apelido_invalido', '22023');
  perform pg_temp.expect_code(pg_temp.cc('li-d-0007', ctx, '41111111111111111111', null, 3, 10, null), 'apelido_invalido', '22023');
  perform pg_temp.expect_code(pg_temp.cc('li-d-0008', ctx, 'Visa 4111 1111 1111 1111', null, 3, 10, null), 'apelido_invalido', '22023');
  c := (public.create_card('li-d-0010', ctx, 'Loja 1234 / 2026', '1234', 3, 10, null) #>> '{card,id}')::uuid;   -- 8 dígitos: aceito
  perform pg_temp.expect_code(pg_temp.uc('li-d-0011', c, 1, '4111/1111/1111/1111', null, 3, 10, null), 'apelido_invalido', '22023');
  assert (select nickname from public.card_items where id = c) = 'Loja 1234 / 2026' and pg_temp.cardv(c) = 1, 'recusa não altera o cartão';
  -- Aceitos: 13 e 14 dígitos que não são um número (conta bancária com agência, anos e número de documento), e letras no meio.
  res := public.create_card('li-d-0020', ctx, 'Conta 0001 12345678-9', null, 3, 10, null);
  assert res #>> '{card,nickname}' = 'Conta 0001 12345678-9', 'conta bancária com agência: 13 dígitos espalhados, aceita';
  res := public.create_card('li-d-0021', ctx, 'Cartão 2024/2025 nº 123456', null, 3, 10, null);
  assert res #>> '{card,nickname}' = 'Cartão 2024/2025 nº 123456', 'anos e número solto: 14 dígitos espalhados, aceito';
  res := public.create_card('li-d-0022', ctx, 'a4111b1111c1111d1111', null, 3, 10, null);
  assert res #>> '{card,nickname}' = 'a4111b1111c1111d1111', 'dígitos separados por letras não são um número';
  res := public.update_card('li-d-0023', (res #>> '{card,id}')::uuid, 1, 'Cartão 2024/2025 nº 123456', null, 3, 10, null);
  assert res #>> '{card,nickname}' = 'Cartão 2024/2025 nº 123456', 'o mesmo na alteração';
end $$;
reset role;
-- Escrita direta (backend): a restrição da tabela também recusa o apelido com separadores e aceita os dígitos espalhados.
select pg_temp.expect_error(format($f$insert into public.cards (context_id, nickname, closing_day, due_day, created_by)
  values (%L, '4111/1111/1111/1111', 3, 10, %L)$f$, pg_temp.id('lia_ctx'), pg_temp.id('lia')), '%cards_apelido_sem_numero%');
select pg_temp.expect_error(format($f$insert into public.cards (context_id, nickname, closing_day, due_day, created_by)
  values (%L, '4111,1111,1111,1111', 3, 10, %L)$f$, pg_temp.id('lia_ctx'), pg_temp.id('lia')), '%cards_apelido_sem_numero%');
select pg_temp.expect_ok(format($f$insert into public.cards (context_id, nickname, closing_day, due_day, created_by)
  values (%L, 'Conta 0001 12345678-9', 3, 10, %L)$f$, pg_temp.id('lia_ctx'), pg_temp.id('lia')));
-- A função, caso a caso (os mesmos casos de looksLikeCardNumber em packages/core/test/cards.test.ts).
do $$
declare
  t text;
begin
  foreach t in array array['4111 1111 1111 1111', '4111-1111-1111-1111', '4111.1111.1111.1111', '4111111111111', 'Cartão 41111111111111111111',
    '4111/1111/1111/1111', '4111_1111_1111_1111', '4111,1111,1111,1111', '4111 1111 1111 111', '4111.1111-1111 1111', '3782 822463 10005',
    '3782-822463-10005', '1234567890123456789', 'final 1234567890123', 'Visa 4111 1111 1111 1111', '2024 4111 1111 1111 1111'] loop
    assert public.clarevo_looks_like_card_number(t), 'deveria parecer número de cartão: ' || t;
  end loop;
  foreach t in array array['Cartão 1234', 'Cartão 2026', '123456789012', 'Nubank 12 meses', 'Loja 1234 / 2026', '12/34/56/78/90/12',
    'Conta 0001 12345678-9', 'Cartão 2024/2025 nº 123456', 'a4111b1111c1111d1111', 'Ag 1234 Conta 123456-7', 'Mercado 2024 2025 2026',
    'Loja 12 34 56 78 90 12 34 56', ''] loop
    assert not public.clarevo_looks_like_card_number(t), 'não deveria parecer número de cartão: ' || t;
  end loop;
  assert not public.clarevo_looks_like_card_number(null), 'nulo não é número';
end $$;

-- e) Tempo perto do limite de 5.000 lançamentos. O backend monta 100 compras de 48 parcelas (4.800 lançamentos) sem disparar os
-- gatilhos (session_replication_role), como carga de dados; depois cada função de cartão roda com as conferências do fim da
-- transação ligadas (set constraints all immediate) e o tempo é medido. O gatilho de consistência roda uma vez por linha
-- alterada (uma compra em 48 parcelas dispara 48 vezes): cada disparo confere só os meses da linha e o crédito do cartão numa
-- passada (O(lançamentos)), não uma subconsulta por mês.
insert into ids values ('lia_cheio', gen_random_uuid());
insert into public.cards (id, context_id, nickname, closing_day, due_day, created_by)
  values (pg_temp.id('lia_cheio'), pg_temp.id('lia_ctx'), 'Cheio', 5, 12, pg_temp.id('lia'));
set session_replication_role = replica;
with pur as (select gen_random_uuid() as pid, g from generate_series(1, 100) g)
insert into public.card_entries (id, context_id, card_id, kind, invoice_month, amount_cents, description, purchase_id, purchased_on,
    installment_number, installment_total, purchase_total_cents, created_by)
  select case when k = 1 then pur.pid else gen_random_uuid() end, pg_temp.id('lia_ctx'), pg_temp.id('lia_cheio'), 'parcela',
         (date '2026-11-01' + make_interval(months => k - 1))::date, 100, 'Carga ' || pur.g, pur.pid, date '2026-10-07', k, 48, 4800,
         pg_temp.id('lia')
    from pur cross join generate_series(1, 48) k;
set session_replication_role = origin;
analyze public.card_entries;
set role authenticated;
do $$
declare
  c uuid := pg_temp.id('lia_cheio');
  t0 timestamptz;
  ms_add numeric;
  ms_upd numeric;
  ms_del numeric;
  res jsonb;
  p uuid;
  limite constant numeric := 2000;   -- ms por operação (medido: de 100 a 300; antes da correção, de 4.000 a 6.000)
begin
  perform pg_temp.as_('lia');
  assert (select count(*) from public.card_entries where card_id = c and deleted_at is null) = 4800, '4.800 lançamentos de carga';
  t0 := clock_timestamp();
  res := public.add_card_purchase('li-e-0001', c, '2026-10-07', 4800, 48, 'Última compra');
  set constraints all immediate;
  set constraints all deferred;
  ms_add := extract(epoch from clock_timestamp() - t0) * 1000;
  p := (res #>> '{entry,id}')::uuid;
  assert (select count(*) from public.card_entries where card_id = c and deleted_at is null) = 4848, 'compra de 48 parcelas entrou';
  assert ms_add < limite, format('add_card_purchase em 48 vezes perto do limite: %s ms (limite %s)', round(ms_add), limite);
  t0 := clock_timestamp();
  res := public.update_card('li-e-0002', c, pg_temp.cardv(c), 'Cheio', null, 5, 15, null);
  set constraints all immediate;
  set constraints all deferred;
  ms_upd := extract(epoch from clock_timestamp() - t0) * 1000;
  assert ms_upd < limite, format('update_card com 48 contas de fatura: %s ms (limite %s)', round(ms_upd), limite);
  assert (select count(*) from public.commitments where card_id = c and deleted_at is null and due_on = (invoice_month + 14)) = 48, 'vencimento novo nas 48 contas';
  t0 := clock_timestamp();
  res := public.delete_card_entry('li-e-0003', p, 1);
  set constraints all immediate;
  set constraints all deferred;
  ms_del := extract(epoch from clock_timestamp() - t0) * 1000;
  assert ms_del < limite, format('delete_card_entry de compra em 48 vezes: %s ms (limite %s)', round(ms_del), limite);
end $$;
reset role;
-- A carga de dados fica fora das conferências seguintes: apaga o cartão e tudo dele.
delete from public.commitments where card_id = pg_temp.id('lia_cheio');
delete from public.card_entries where card_id = pg_temp.id('lia_cheio');
delete from public.cards where id = pg_temp.id('lia_cheio');
select pg_temp.check_links();

-- f) A chave da nota é guardada só como resumo SHA-256 e lida por receipt_items (para o aviso "Esta nota já foi anotada" logo
-- depois de escanear). A chave de uma NF-e de pessoa física carrega o CPF do emitente ("000" + CPF) e a de CNPJ alfanumérico
-- tem letras: o banco recebe o resumo de qualquer uma delas (calculado no aparelho) e nunca a chave.
set role authenticated;
do $$
declare
  ctx uuid := pg_temp.id('lia_ctx');
  acc uuid := pg_temp.id('lia_acc');
  bia uuid := pg_temp.id('bia_ctx');
  biaacc uuid := pg_temp.id('bia_acc');
  k_pf text := '33261000052998224725550010000001241000000026';          -- emitente pessoa física: CPF 529.982.247-25
  k_alfa text := '35261012ABC34501DE35550010000001251000000035';        -- CNPJ alfanumérico 12.ABC.345/01DE-35
  d_pf text := encode(sha256(convert_to(k_pf, 'UTF8')), 'hex');
  d_alfa text := encode(sha256(convert_to(k_alfa, 'UTF8')), 'hex');
  d_cartao text := encode(sha256(convert_to('33101112223300018165002000000004710000471014', 'UTF8')), 'hex');
  r public.financial_records;
  c uuid;
  res jsonb;
begin
  perform pg_temp.as_('lia');
  assert d_pf ~ '^[0-9a-f]{64}$' and d_alfa ~ '^[0-9a-f]{64}$' and d_pf <> d_alfa, 'resumos de 64 hexadecimais';
  -- A chave inteira nunca é aceita (nem a de pessoa física, que tem CPF, nem a alfanumérica): só o resumo.
  perform pg_temp.expect_code(format('select public.create_record(%L, %L, %L, ''despesa'', 100, ''2026-10-07'', ''Mercado'', null, %L)', 'li-f-0001', ctx, acc, k_pf),
    'chave_de_nota_invalida', '22023');
  perform pg_temp.expect_code(format('select public.create_record(%L, %L, %L, ''despesa'', 100, ''2026-10-07'', ''Mercado'', null, %L)', 'li-f-0002', ctx, acc, k_alfa),
    'chave_de_nota_invalida', '22023');
  perform pg_temp.expect_code(format('select public.create_record(%L, %L, %L, ''despesa'', 100, ''2026-10-07'', ''Mercado'', null, %L)', 'li-f-0003', ctx, acc, upper(d_pf)),
    'chave_de_nota_invalida', '22023');
  perform pg_temp.expect_code(format('select public.create_record(%L, %L, %L, ''despesa'', 100, ''2026-10-07'', ''Mercado'', null, %L)', 'li-f-0004', ctx, acc, substr(d_pf, 2)),
    'chave_de_nota_invalida', '22023');
  c := (public.create_card('li-f-0005', ctx, 'Notas', null, 5, 12, null) #>> '{card,id}')::uuid;
  perform pg_temp.expect_code(pg_temp.ap('li-f-0006', c, '2026-10-07', 100, 1, 'x', null, k_pf), 'chave_de_nota_invalida', '22023');
  assert (select count(*) from public.receipt_items where context_id = ctx) = 0, 'nada foi gravado';

  -- Gasto com o resumo da chave de pessoa física e compra no cartão com o da chave alfanumérica: aceitos; nenhum CPF gravado.
  r := public.create_record('li-f-0010', ctx, acc, 'despesa', 4500, '2026-10-06', 'Feira', 'Mercado', d_pf);
  assert r.receipt_key = d_pf, 'resumo da chave de pessoa física guardado';
  res := public.add_card_purchase('li-f-0011', c, '2026-10-07', 8000, 2, 'Loja com CNPJ novo', 'Lazer', d_alfa);
  assert res #>> '{entry,receipt_key}' = d_alfa, 'resumo da chave com CNPJ alfanumérico guardado';
  perform pg_temp.expect_code(format('select public.create_record(%L, %L, %L, ''despesa'', 100, ''2026-10-07'', ''Outra'', null, %L)', 'li-f-0012', ctx, acc, d_alfa),
    'nota_ja_anotada', 'PT409', 'compra=' || (res #>> '{entry,id}'));
  perform pg_temp.expect_code(pg_temp.ap('li-f-0013', c, '2026-10-07', 100, 1, 'Outra', null, d_pf), 'nota_ja_anotada', 'PT409', 'registro=' || r.id);

  -- Leitura por chave (receipt_items): gasto, compra no cartão (primeira parcela), só de quem lê o contexto, só vivos.
  assert (select array_agg(attname::text order by attnum) from pg_attribute where attrelid = 'public.receipt_items'::regclass and attnum > 0)
       = array['context_id', 'receipt_key', 'record_id', 'card_entry_id', 'card_id'], 'colunas de receipt_items';
  assert (select (record_id, card_entry_id, card_id) from public.receipt_items where context_id = ctx and receipt_key = d_pf)
       is not distinct from (r.id, null::uuid, null::uuid),
    'o gasto aparece pelo resumo da chave';
  assert (select (record_id, card_entry_id, card_id) from public.receipt_items where context_id = ctx and receipt_key = d_alfa)
       is not distinct from (null::uuid, (res #>> '{entry,id}')::uuid, c), 'a compra aparece com o id da compra e o cartão';
  assert (select count(*) from public.receipt_items where context_id = ctx and receipt_key = d_cartao) = 0, 'chave nunca anotada: nada';
  assert (select count(*) from public.receipt_items where receipt_key in (d_pf, d_alfa)) = 2 and not exists (
    select 1 from public.receipt_items where receipt_key !~ '^[0-9a-f]{64}$'), 'só resumos';
  perform pg_temp.as_('bia');
  assert (select count(*) from public.receipt_items where receipt_key in (d_pf, d_alfa)) = 0, 'outra pessoa não vê as notas da Lia';
  r := public.create_record('li-f-0020', bia, biaacc, 'despesa', 4500, '2026-10-06', 'Feira', null, d_pf);
  assert (select count(*) from public.receipt_items where receipt_key = d_pf) = 1 and (select context_id from public.receipt_items where receipt_key = d_pf) = bia,
    'cada contexto vê a sua';
  perform pg_temp.as_('lia');
  perform public.delete_card_entry('li-f-0021', (res #>> '{entry,id}')::uuid, 1);
  assert (select count(*) from public.receipt_items where receipt_key = d_alfa) = 0, 'compra excluída: a chave volta a ficar livre';
  perform public.delete_record('li-f-0022', (select record_id from public.receipt_items where context_id = ctx and receipt_key = d_pf), 1);
  assert (select count(*) from public.receipt_items where context_id = ctx) = 0, 'gasto excluído: a chave volta a ficar livre';
  perform pg_temp.check_links();
end $$;
reset role;
do $$ begin
  assert has_table_privilege('authenticated', 'public.receipt_items', 'select')
     and not has_table_privilege('authenticated', 'public.receipt_items', 'insert, update, delete, truncate')
     and not has_table_privilege('anon', 'public.receipt_items', 'select'), 'receipt_items: leitura para authenticated, nada para anon';
  assert (select reloptions from pg_class where oid = 'public.receipt_items'::regclass) @> array['security_barrier=true'], 'receipt_items com security_barrier';
  -- Nenhuma tabela guarda a chave inteira nem CPF de nota: toda chave guardada é um resumo de 64 hexadecimais.
  assert not exists (select 1 from public.financial_records where receipt_key is not null and receipt_key !~ '^[0-9a-f]{64}$')
     and not exists (select 1 from public.card_entries where receipt_key is not null and receipt_key !~ '^[0-9a-f]{64}$'), 'só resumos nas duas tabelas';
end $$;
set role anon;
select pg_temp.expect_error($$select * from public.receipt_items$$, 'permission denied%');
reset role;
set role authenticated;

-- ---------------------------------------------------------------------------
-- 12. Privilégios, assinaturas, colunas e opções (conferidos como superusuário).
-- ---------------------------------------------------------------------------
reset role;
do $$ begin
  assert (select array_agg(p.proname::text order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and has_function_privilege('authenticated', p.oid, 'execute'))
    = array['add_card_charge', 'add_card_purchase', 'add_card_refund', 'add_goal_movement', 'context_permission', 'create_card',
            'create_commitment', 'create_goal', 'create_record', 'create_series', 'create_series_occurrence',
            'decide_return_review', 'delete_card', 'delete_card_entry', 'delete_commitment', 'delete_goal',
            'delete_goal_movement', 'delete_income_reference', 'delete_record', 'delete_series', 'end_series',
            'ensure_personal_space', 'inform_series_year', 'invoice_closing_on', 'invoice_due_on', 'invoice_month_for', 'is_org_admin',
            'month_committed', 'month_to_pay', 'month_totals', 'months_overview', 'my_today', 'pay_commitment', 'pay_invoice',
            'set_card_status', 'set_goal_status', 'set_income_reference', 'set_savings_answer', 'skip_series_year',
            'sync_series_occurrences', 'undo_commitment_payment', 'undo_invoice_payment', 'update_card', 'update_card_entry',
            'update_commitment', 'update_goal', 'update_goal_movement', 'update_record', 'update_series_from'],
    'authenticated executa só as 49 funções expostas (as 11 de cartão, as 4 de data e as de antes)';
  assert not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                      where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')), 'anon não executa nenhuma função';
  -- Auxiliares, guardas e gatilhos de consistência: sem execute para authenticated.
  assert (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in ('clarevo_month_last_day', 'clarevo_installment_cents', 'clarevo_month_name',
             'clarevo_receipt_key_valid', 'clarevo_next_month', 'cards_guard', 'card_entries_guard', 'clarevo_validate_card',
             'clarevo_validate_purchase', 'clarevo_validate_invoice_month', 'clarevo_validate_charge', 'clarevo_validate_refund',
             'clarevo_lock_card', 'clarevo_lock_card_entry', 'clarevo_check_card_limit', 'clarevo_check_entry_cap', 'clarevo_invoice_paid',
             'clarevo_check_receipt_free', 'clarevo_card_derived', 'clarevo_card_json', 'clarevo_invoice_json', 'clarevo_entry_json',
             'clarevo_card_result', 'clarevo_card_entry_result', 'clarevo_pay_result', 'clarevo_sync_card', 'clarevo_check_card_month',
             'clarevo_check_card_credit', 'clarevo_check_purchase', 'clarevo_check_invoice_payment', 'clarevo_check_card_consistency',
             'clarevo_check_receipt_unique', 'clarevo_first_free_month', 'clarevo_purchase_first_month', 'clarevo_looks_like_card_number')
             and not has_function_privilege('authenticated', p.oid, 'execute')) = 35, '35 auxiliares sem execute para authenticated';
  -- Nomes dos argumentos (chamada por nome no PostgREST) e retornos.
  assert pg_get_function_arguments('public.create_card(text, uuid, text, text, integer, integer, bigint)'::regprocedure)
       = 'p_idempotency_key text, p_context_id uuid, p_nickname text, p_last_digits text, p_closing_day integer, p_due_day integer, p_limit_cents bigint'
     and pg_get_function_arguments('public.update_card(text, uuid, integer, text, text, integer, integer, bigint)'::regprocedure)
       = 'p_idempotency_key text, p_card_id uuid, p_expected_version integer, p_nickname text, p_last_digits text, p_closing_day integer, p_due_day integer, p_limit_cents bigint'
     and pg_get_function_arguments('public.set_card_status(text, uuid, integer, text)'::regprocedure)
       = 'p_idempotency_key text, p_card_id uuid, p_expected_version integer, p_status text'
     and pg_get_function_arguments('public.delete_card(text, uuid, integer)'::regprocedure)
       = 'p_idempotency_key text, p_card_id uuid, p_expected_version integer'
     and pg_get_function_arguments('public.add_card_purchase(text, uuid, date, bigint, integer, text, text, text)'::regprocedure)
       = 'p_idempotency_key text, p_card_id uuid, p_purchased_on date, p_total_cents bigint, p_installments integer, p_description text, p_category text DEFAULT NULL::text, p_receipt_key text DEFAULT NULL::text'
     and pg_get_function_arguments('public.update_card_entry(text, uuid, integer, text, bigint, date, text, text, integer, date, text)'::regprocedure)
       = 'p_idempotency_key text, p_entry_id uuid, p_expected_version integer, p_kind text, p_amount_cents bigint, p_occurred_on date, p_description text, p_category text, p_installments integer DEFAULT NULL::integer, p_invoice_month date DEFAULT NULL::date, p_charge_kind text DEFAULT NULL::text'
     and pg_get_function_arguments('public.delete_card_entry(text, uuid, integer)'::regprocedure)
       = 'p_idempotency_key text, p_entry_id uuid, p_expected_version integer'
     and pg_get_function_arguments('public.add_card_charge(text, uuid, date, text, bigint)'::regprocedure)
       = 'p_idempotency_key text, p_card_id uuid, p_invoice_month date, p_charge_kind text, p_amount_cents bigint'
     and pg_get_function_arguments('public.add_card_refund(text, uuid, date, bigint, text, text)'::regprocedure)
       = 'p_idempotency_key text, p_card_id uuid, p_invoice_month date, p_amount_cents bigint, p_description text, p_category text DEFAULT NULL::text'
     and pg_get_function_arguments('public.pay_invoice(text, uuid, date, integer, bigint, date, uuid)'::regprocedure)
       = 'p_idempotency_key text, p_card_id uuid, p_month date, p_expected_version integer, p_paid_cents bigint, p_paid_on date, p_account_id uuid DEFAULT NULL::uuid'
     and pg_get_function_arguments('public.undo_invoice_payment(text, uuid, date, integer)'::regprocedure)
       = 'p_idempotency_key text, p_card_id uuid, p_month date, p_expected_version integer'
     and pg_get_function_arguments('public.create_record(text, uuid, uuid, public.record_kind, bigint, date, text, text, text)'::regprocedure)
       = 'p_idempotency_key text, p_context_id uuid, p_account_id uuid, p_kind record_kind, p_amount_cents bigint, p_occurred_on date, p_description text, p_category text DEFAULT NULL::text, p_receipt_key text DEFAULT NULL::text'
     and pg_get_function_arguments('public.invoice_closing_on(integer, integer, date)'::regprocedure) = 'p_closing_day integer, p_due_day integer, p_month date'
     and pg_get_function_arguments('public.invoice_due_on(integer, date)'::regprocedure) = 'p_due_day integer, p_month date'
     and pg_get_function_arguments('public.invoice_month_for(integer, integer, date)'::regprocedure) = 'p_closing_day integer, p_due_day integer, p_date date',
    'assinaturas e nomes dos argumentos';
  assert to_regprocedure('public.create_record(text, uuid, uuid, public.record_kind, bigint, date, text, text)') is null, 'a assinatura antiga de create_record saiu (sem sobrecarga ambígua)';
  assert (select bool_and(pg_get_function_result(p.oid) = 'jsonb' and p.prosecdef and p.provolatile = 'v')
            from pg_proc p where p.oid in ('public.create_card(text, uuid, text, text, integer, integer, bigint)'::regprocedure,
              'public.update_card(text, uuid, integer, text, text, integer, integer, bigint)'::regprocedure,
              'public.set_card_status(text, uuid, integer, text)'::regprocedure, 'public.delete_card(text, uuid, integer)'::regprocedure,
              'public.add_card_purchase(text, uuid, date, bigint, integer, text, text, text)'::regprocedure,
              'public.update_card_entry(text, uuid, integer, text, bigint, date, text, text, integer, date, text)'::regprocedure,
              'public.delete_card_entry(text, uuid, integer)'::regprocedure, 'public.add_card_charge(text, uuid, date, text, bigint)'::regprocedure,
              'public.add_card_refund(text, uuid, date, bigint, text, text)'::regprocedure,
              'public.pay_invoice(text, uuid, date, integer, bigint, date, uuid)'::regprocedure,
              'public.undo_invoice_payment(text, uuid, date, integer)'::regprocedure)), 'retorno jsonb; definer; volatile';
  assert (select bool_and(p.prosecdef and p.provolatile = case p.proname when 'my_today' then 's' else 'i' end)
            from pg_proc p where p.oid in ('public.my_today()'::regprocedure, 'public.invoice_closing_on(integer, integer, date)'::regprocedure,
              'public.invoice_due_on(integer, date)'::regprocedure, 'public.invoice_month_for(integer, integer, date)'::regprocedure)),
    'funções de data: definer; puras (my_today é stable)';
  assert pg_get_function_result('public.my_today()'::regprocedure) = 'date', 'my_today devolve o dia';
  assert (select prosecdef from pg_proc where oid = 'public.sync_series_occurrences(uuid)'::regprocedure)
     and (select provolatile from pg_proc where oid = 'public.month_committed(uuid, date)'::regprocedure) = 's', 'month_committed continua stable e definer';

  -- Tabelas e visões: só leitura para authenticated, nada para anon.
  assert has_table_privilege('authenticated', 'public.cards', 'select') and has_table_privilege('authenticated', 'public.card_entries', 'select')
     and has_table_privilege('authenticated', 'public.card_items', 'select') and has_table_privilege('authenticated', 'public.invoice_items', 'select')
     and has_table_privilege('authenticated', 'public.card_entry_items', 'select'), 'leitura (filtrada pela RLS ou pela permissão da visão)';
  assert not has_table_privilege('authenticated', 'public.cards', 'insert, update, delete, truncate')
     and not has_table_privilege('authenticated', 'public.card_entries', 'insert, update, delete, truncate')
     and not has_table_privilege('authenticated', 'public.card_items', 'insert, update, delete, truncate')
     and not has_table_privilege('authenticated', 'public.invoice_items', 'insert, update, delete, truncate')
     and not has_table_privilege('authenticated', 'public.card_entry_items', 'insert, update, delete, truncate')
     and not has_any_column_privilege('authenticated', 'public.cards', 'insert, update')
     and not has_any_column_privilege('authenticated', 'public.card_entries', 'insert, update'), 'sem escrita direta';
  assert not has_table_privilege('anon', 'public.cards', 'select') and not has_table_privilege('anon', 'public.card_entries', 'select')
     and not has_table_privilege('anon', 'public.card_items', 'select') and not has_table_privilege('anon', 'public.invoice_items', 'select')
     and not has_table_privilege('anon', 'public.card_entry_items', 'select'), 'anon não lê';
  assert (select relrowsecurity from pg_class where oid = 'public.cards'::regclass) and (select relrowsecurity from pg_class where oid = 'public.card_entries'::regclass)
     and (select array_agg(policyname::text || ':' || cmd || ':' || roles::text order by policyname) from pg_policies where tablename in ('cards', 'card_entries'))
       = array['card_entries_read:SELECT:{authenticated}', 'cards_read:SELECT:{authenticated}'], 'RLS ligada, só leitura para authenticated';
  assert (select reloptions from pg_class where oid = 'public.card_items'::regclass) @> array['security_barrier=true']
     and (select reloptions from pg_class where oid = 'public.invoice_items'::regclass) @> array['security_barrier=true']
     and (select reloptions from pg_class where oid = 'public.card_entry_items'::regclass) @> array['security_barrier=true']
     and not coalesce((select reloptions from pg_class where oid = 'public.invoice_items'::regclass) @> array['security_invoker=true'], false)
     and (select reloptions from pg_class where oid = 'public.commitment_items'::regclass) @> array['security_invoker=true'], 'opções das visões';

  -- Colunas, nesta ordem (o app e o core leem por nome).
  assert (select array_agg(attname::text order by attnum) from pg_attribute where attrelid = 'public.cards'::regclass and attnum > 0 and not attisdropped)
    = array['id', 'context_id', 'nickname', 'last_digits', 'closing_day', 'due_day', 'limit_cents', 'status', 'created_by', 'version',
            'created_at', 'updated_at', 'deleted_at', 'deleted_by'], 'colunas de cards (nenhum número de cartão, validade ou código)';
  assert (select array_agg(attname::text order by attnum) from pg_attribute where attrelid = 'public.card_entries'::regclass and attnum > 0 and not attisdropped)
    = array['id', 'context_id', 'card_id', 'kind', 'invoice_month', 'amount_cents', 'description', 'category', 'purchase_id', 'purchased_on',
            'installment_number', 'installment_total', 'purchase_total_cents', 'charge_kind', 'source_month', 'payment_record_id', 'receipt_key',
            'created_by', 'version', 'created_at', 'updated_at', 'deleted_at', 'deleted_by'], 'colunas de card_entries';
  assert (select array_agg(attname::text order by attnum) from pg_attribute where attrelid = 'public.card_items'::regclass and attnum > 0 and not attisdropped)
    = array['id', 'context_id', 'nickname', 'last_digits', 'closing_day', 'due_day', 'limit_cents', 'status', 'created_by', 'version', 'created_at',
            'updated_at', 'used_cents', 'current_month', 'current_closing_on', 'current_due_on'], 'colunas de card_items';
  assert (select array_agg(attname::text order by attnum) from pg_attribute where attrelid = 'public.card_entry_items'::regclass and attnum > 0 and not attisdropped)
    = array['id', 'context_id', 'card_id', 'kind', 'description', 'category', 'charge_kind', 'purchased_on', 'amount_cents', 'installments', 'invoice_month',
            'source_month', 'payment_record_id', 'receipt_key', 'created_by', 'version', 'created_at', 'updated_at'], 'colunas de card_entry_items';
  assert (select array_agg(attname::text order by attnum) from pg_attribute where attrelid = 'public.invoice_items'::regclass and attnum > 0 and not attisdropped)
    = array['card_id', 'context_id', 'month', 'closing_on', 'due_on', 'status', 'total_cents', 'purchases_cents', 'charges_cents', 'carried_in_cents',
            'refunds_cents', 'credit_cents', 'entry_count', 'commitment_id', 'commitment_version', 'amount_is_estimate', 'to_pay_cents',
            'paid_record_id', 'paid_cents', 'paid_on', 'paid_account_id', 'left_over_cents'], 'colunas de invoice_items';
  assert (select array_agg(format_type(atttypid, atttypmod) order by attnum) from pg_attribute where attrelid = 'public.invoice_items'::regclass and attnum > 0 and not attisdropped)
    = array['uuid', 'uuid', 'date', 'date', 'date', 'text', 'bigint', 'bigint', 'bigint', 'bigint', 'bigint', 'bigint', 'integer', 'uuid', 'integer',
            'boolean', 'bigint', 'uuid', 'bigint', 'date', 'uuid', 'bigint'], 'tipos de invoice_items';
  assert (select array_agg(format_type(atttypid, atttypmod) order by attnum) from pg_attribute where attrelid = 'public.card_items'::regclass and attnum > 0 and not attisdropped)
    = array['uuid', 'uuid', 'text', 'text', 'smallint', 'smallint', 'bigint', 'text', 'uuid', 'integer', 'timestamp with time zone', 'timestamp with time zone',
            'bigint', 'date', 'date', 'date'], 'tipos de card_items';
  assert (select array_agg(attname::text order by attnum) from pg_attribute
           where attrelid = 'public.commitments'::regclass and attname in ('card_id', 'invoice_month', 'card_closing_on') and not attisdropped)
       = array['card_id', 'invoice_month', 'card_closing_on'] and (select array_agg(attname::text order by attnum) from pg_attribute
           where attrelid = 'public.financial_records'::regclass and attname in ('card_id', 'invoice_month', 'receipt_key') and not attisdropped)
       = array['card_id', 'invoice_month', 'receipt_key'], 'colunas novas em commitments e financial_records';
  assert (select array_agg(attname::text order by attnum) from pg_attribute where attrelid = 'public.commitment_items'::regclass and attnum > 0 and not attisdropped)
    = array['id', 'context_id', 'description', 'amount_cents', 'currency', 'due_on', 'status', 'category', 'created_by', 'version', 'created_at',
            'updated_at', 'paid_record_id', 'paid_on', 'paid_amount_cents', 'paid_account_id', 'series_id', 'occurrence_number', 'series_override',
            'amount_is_estimate', 'series_kind', 'series_nature', 'series_installment_total', 'series_parts_per_year', 'card_id', 'invoice_month',
            'card_closing_on'], 'commitment_items: a lista de antes, mais cartão, mês e fechamento no fim';
  assert (select array_agg(attname::text order by attnum) from pg_attribute where attrelid = 'public.record_operations'::regclass and attnum > 0 and not attisdropped)
    = array['actor_id', 'idempotency_key', 'action', 'context_id', 'request_hash', 'record_id', 'created_at', 'commitment_id', 'target_id', 'entry_id'],
    'record_operations ganhou entry_id';

  -- Chaves estrangeiras e gatilhos.
  assert (select confdeltype from pg_constraint where conname = 'cards_context_id_fkey') = 'c'
     and (select confdeltype from pg_constraint where conname = 'card_entries_card_fk') = 'c'
     and (select confdeltype from pg_constraint where conname = 'card_entries_payment_record_id_fkey') = 'c'
     and (select confdeltype from pg_constraint where conname = 'commitments_card_fk') = 'a'
     and (select confdeltype from pg_constraint where conname = 'financial_records_card_fk') = 'a', 'cascata só onde há exclusão de dados do contexto';
  assert (select count(*) from pg_trigger t where not t.tgisinternal and t.tgname in ('cards_consistency', 'card_entries_consistency', 'card_entries_consistency_del',
            'commitments_card_consistency', 'commitments_card_consistency_del', 'records_card_consistency', 'records_card_consistency_del',
            'records_receipt_unique', 'card_entries_receipt_unique') and t.tgdeferrable and t.tginitdeferred and t.tgenabled = 'O') = 9, '9 gatilhos de consistência adiados e ligados';
  assert (select count(*) from pg_trigger t where not t.tgisinternal and t.tgname in ('cards_guard', 'card_entries_guard', 'commitments_guard', 'financial_records_guard')
            and t.tgenabled = 'O') = 4, 'guardas ligadas';
  -- As assinaturas das migrações anteriores continuam (create_record mudou de forma compatível, testado acima).
  assert to_regprocedure('public.update_record(text, uuid, integer, uuid, bigint, date, text, text)') is not null
     and to_regprocedure('public.delete_record(text, uuid, integer)') is not null
     and to_regprocedure('public.pay_commitment(text, uuid, integer, uuid, bigint, date, text)') is not null
     and to_regprocedure('public.undo_commitment_payment(text, uuid, integer)') is not null
     and to_regprocedure('public.update_commitment(text, uuid, integer, bigint, date, text, text, boolean)') is not null
     and to_regprocedure('public.delete_commitment(text, uuid, integer)') is not null
     and to_regprocedure('public.month_committed(uuid, date)') is not null and to_regprocedure('public.month_to_pay(uuid, date)') is not null
     and to_regprocedure('public.sync_series_occurrences(uuid)') is not null, 'demais assinaturas sem mudança';
end $$;

-- anon: nenhuma função nem tabela de cartão.
set role anon;
select pg_temp.expect_error($$select public.create_card('cd-anon-0001', gen_random_uuid(), 'Nubank', null, 5, 12, null)$$, 'permission denied%');
select pg_temp.expect_error($$select public.update_card('cd-anon-0002', gen_random_uuid(), 1, 'Nubank', null, 5, 12, null)$$, 'permission denied%');
select pg_temp.expect_error($$select public.set_card_status('cd-anon-0003', gen_random_uuid(), 1, 'arquivado')$$, 'permission denied%');
select pg_temp.expect_error($$select public.delete_card('cd-anon-0004', gen_random_uuid(), 1)$$, 'permission denied%');
select pg_temp.expect_error($$select public.add_card_purchase('cd-anon-0005', gen_random_uuid(), '2026-10-07', 100, 1, 'x')$$, 'permission denied%');
select pg_temp.expect_error($$select public.update_card_entry('cd-anon-0006', gen_random_uuid(), 1, 'compra', 100, '2026-10-07', 'x', null, 1)$$, 'permission denied%');
select pg_temp.expect_error($$select public.delete_card_entry('cd-anon-0007', gen_random_uuid(), 1)$$, 'permission denied%');
select pg_temp.expect_error($$select public.add_card_charge('cd-anon-0008', gen_random_uuid(), '2026-11-01', 'juros', 100)$$, 'permission denied%');
select pg_temp.expect_error($$select public.add_card_refund('cd-anon-0009', gen_random_uuid(), '2026-11-01', 100, 'x')$$, 'permission denied%');
select pg_temp.expect_error($$select public.pay_invoice('cd-anon-0010', gen_random_uuid(), '2026-11-01', 1, 100, '2026-10-07')$$, 'permission denied%');
select pg_temp.expect_error($$select public.undo_invoice_payment('cd-anon-0011', gen_random_uuid(), '2026-11-01', 1)$$, 'permission denied%');
select pg_temp.expect_error($$select public.invoice_due_on(10, '2026-11-01')$$, 'permission denied%');
select pg_temp.expect_error($$select public.my_today()$$, 'permission denied%');
select pg_temp.expect_error($$select * from public.cards$$, 'permission denied%');
select pg_temp.expect_error($$select * from public.card_entries$$, 'permission denied%');
select pg_temp.expect_error($$select * from public.card_items$$, 'permission denied%');
select pg_temp.expect_error($$select * from public.invoice_items$$, 'permission denied%');
select pg_temp.expect_error($$select * from public.card_entry_items$$, 'permission denied%');
reset role;

-- authenticated: sem escrita direta nas tabelas e nas visões, nem em colunas de cartão dos gastos e das contas.
set role authenticated;
select set_config('request.jwt.claim.sub', :bia, true);
select pg_temp.expect_error($$insert into public.cards (context_id, nickname, closing_day, due_day, created_by) values (gen_random_uuid(), 'x', 1, 1, gen_random_uuid())$$, 'permission denied%');
select pg_temp.expect_error($$update public.cards set nickname = 'x'$$, 'permission denied%');
select pg_temp.expect_error($$delete from public.cards$$, 'permission denied%');
select pg_temp.expect_error($$insert into public.card_entries (context_id, card_id, kind, invoice_month, amount_cents, created_by) values (gen_random_uuid(), gen_random_uuid(), 'encargo', '2026-11-01', 1, gen_random_uuid())$$, 'permission denied%');
select pg_temp.expect_error($$update public.card_entries set amount_cents = 1$$, 'permission denied%');
select pg_temp.expect_error($$delete from public.card_entries$$, 'permission denied%');
select pg_temp.expect_error($$update public.commitments set card_id = null$$, 'permission denied%');
select pg_temp.expect_error($$update public.financial_records set card_id = null, receipt_key = null$$, 'permission denied%');
select pg_temp.expect_error($$insert into public.invoice_items (card_id) values (gen_random_uuid())$$, '%view%');
select pg_temp.expect_error($$insert into public.card_items (id) values (gen_random_uuid())$$, '%view%');
select pg_temp.expect_error($$insert into public.card_entry_items (id) values (gen_random_uuid())$$, '%view%');
select pg_temp.expect_error($$select public.clarevo_sync_card(gen_random_uuid(), '2026-11-01', '2026-11-01')$$, 'permission denied%');
select pg_temp.expect_error($$select public.clarevo_card_result(gen_random_uuid(), null, null, null, null, null)$$, 'permission denied%');
reset role;

rollback;
