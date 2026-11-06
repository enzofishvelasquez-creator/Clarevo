-- Categoria "Crédito e parcelas" (D-086; migração 0027): a sétima categoria de gasto entra na restrição de category_budgets, em
-- set_category_budget e em month_budget (sempre as sete linhas, na ordem de sempre). Pessoa FICTÍCIA: Eva. Tudo em uma transação
-- desfeita no fim.
\set ON_ERROR_STOP 1
\set eva '''00000000-0000-0000-0000-0000000000e1'''

begin;
set local clarevo.today = '2026-11-06';

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
create function pg_temp.eva() returns uuid language sql as $$ select '00000000-0000-0000-0000-0000000000e1'::uuid $$;
create function pg_temp.as_eva() returns text language sql as $$
  select set_config('request.jwt.claim.sub', pg_temp.eva()::text, true)
$$;
create temp table ids (name text primary key, id uuid);
grant select, insert on ids to authenticated;
create function pg_temp.ctx() returns uuid language sql as $$ select id from ids where name = 'eva_ctx' $$;

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  (:eva, 'eva.categoria@exemplo.test', now(), '{"display_name":"Eva"}');
set role authenticated;
select pg_temp.as_eva();
insert into ids values ('eva_ctx', (public.ensure_personal_space('Conta principal') ->> 'context_id')::uuid);
reset role;

-- ---------------------------------------------------------------------------
-- 1. A restrição e as funções conhecem a sétima categoria; outra categoria continua recusada.
-- ---------------------------------------------------------------------------
do $$ begin
  assert (select pg_get_constraintdef(oid) from pg_constraint where conname = 'category_budgets_categoria') like '%Crédito e parcelas%',
    'a restrição de category_budgets aceita a sétima categoria';
end $$;
set role authenticated;
do $$
declare
  r jsonb;
begin
  perform pg_temp.as_eva();
  assert (select array_agg(category) from public.month_budget(pg_temp.ctx(), '2026-11-01'))
       = array['Moradia', 'Mercado', 'Transporte', 'Saúde', 'Educação', 'Lazer', 'Crédito e parcelas'], 'as sete categorias, na ordem de sempre';
  r := public.set_category_budget('cc-orc-0001', pg_temp.ctx(), 'Crédito e parcelas', '2026-11-01', 0, 50000);
  assert r ->> 'category' = 'Crédito e parcelas' and (r ->> 'amount_cents')::bigint = 50000, 'orçamento da sétima categoria: ' || r::text;
  assert (select budget_cents from public.month_budget(pg_temp.ctx(), '2026-11-01') where category = 'Crédito e parcelas') = 50000,
    'month_budget devolve o orçamento da sétima categoria';
  assert (select count(*) from public.month_budget(pg_temp.ctx(), '2026-11-01')) = 7, 'sempre sete linhas';
end $$;
select pg_temp.expect_code(format($q$select public.set_category_budget('cc-orc-0002', %L, 'Dívidas', '2026-11-01', 0, 50000)$q$, pg_temp.ctx()), 'categoria_invalida', '22023');
select pg_temp.expect_code(format($q$select public.set_category_budget('cc-orc-0003', %L, 'Empréstimos e financiamentos', '2026-11-01', 0, 50000)$q$, pg_temp.ctx()), 'categoria_invalida', '22023');
reset role;

-- ---------------------------------------------------------------------------
-- 2. Um gasto na categoria nova entra no usado do mês dela.
-- ---------------------------------------------------------------------------
set role authenticated;
do $$
declare
  v_account uuid;
begin
  perform pg_temp.as_eva();
  select id into v_account from public.financial_accounts where context_id = pg_temp.ctx() and is_default and deleted_at is null;
  perform public.create_record('cc-rec-0001', pg_temp.ctx(), v_account, 'despesa', 45000, '2026-11-05', 'Parcela do carro', 'Crédito e parcelas', null);
  assert (select used_cents from public.month_budget(pg_temp.ctx(), '2026-11-01') where category = 'Crédito e parcelas') = 45000,
    'o gasto conta no usado da sétima categoria';
end $$;
reset role;

rollback;
