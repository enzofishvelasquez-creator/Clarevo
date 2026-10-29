-- Guarda contra regressão dos reforços da migração 0019 (29/10/2026, D-073), só pelo catálogo:
-- (1) nenhuma coluna de financial_accounts pode ser alterada direto pelo app (contas de origem só por funções);
-- (2) nenhuma função interna clarevo_* é executável pela chave de serviço (service_role), nem por anon ou authenticated;
-- (3) a exclusão da conta grava só o dia no fim da licença: coberto no 99_exclusao.sql, parte 4 (ended_at à meia-noite de Brasília).
-- Nenhuma migração: só leitura do catálogo. Rodar depois das migrações (npm run test:db).
\set ON_ERROR_STOP 1

begin;

-- (1) financial_accounts sem update direto para authenticated (nenhuma coluna).
do $$
declare
  v_cols text;
begin
  select string_agg(a.attname::text, ', ' order by a.attname::text collate "C") into v_cols
    from pg_attribute a
   where a.attrelid = 'public.financial_accounts'::regclass and a.attnum > 0 and not a.attisdropped
     and has_column_privilege('authenticated', 'public.financial_accounts', a.attname::text, 'update');
  assert v_cols is null, 'colunas de financial_accounts que o app altera direto: ' || coalesce(v_cols, '');
  assert not has_table_privilege('authenticated', 'public.financial_accounts', 'update'), 'sem update na tabela inteira';
  -- persons continua com o próprio nome e o idioma (a tela Conta), como antes.
  assert has_column_privilege('authenticated', 'public.persons', 'display_name', 'update'), 'o nome de apresentação continua editável';
end $$;

-- (2) Funções internas clarevo_* sem execute para service_role, anon e authenticated.
do $$
declare
  v_sem text;
  v_total integer;
begin
  select count(*) into v_total
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname like 'clarevo\_%';
  assert v_total >= 90, 'a conferência olha as funções internas (vieram ' || v_total || ')';
  select string_agg(p.oid::regprocedure::text || ' (' || r.rolname || ')', ', ' order by p.oid::regprocedure::text collate "C", r.rolname) into v_sem
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    cross join (select rolname from pg_roles where rolname in ('service_role', 'anon', 'authenticated')) r
   where n.nspname = 'public' and p.proname like 'clarevo\_%'
     and has_function_privilege(r.rolname, p.oid, 'execute');
  assert v_sem is null, 'funções internas executáveis de fora: ' || coalesce(v_sem, '');
end $$;

rollback;
