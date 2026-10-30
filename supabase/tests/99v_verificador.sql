-- Guarda contra regressão dos ajustes do Verificador do Supabase (Security e Performance Advisor, migração 0017, 21/10/2026).
-- Parte A, só catálogo: nenhuma função do public sem search_path fixo; as visões do public sem security_invoker são só as 8 de propósito
-- e todas com security_barrier; anon sem privilégio nenhum nas tabelas, visões e funções com security definer do public; nenhuma
-- política do public com auth.uid() solto (só dentro de (select ...), a forma que o Postgres calcula uma vez por consulta); toda chave
-- estrangeira do public com índice que começa pelas colunas da chave (o mesmo critério do verificador oficial).
-- Parte B, comportamento: as 10 políticas reescritas continuam permitindo e negando o mesmo, com o shim de auth dos testes (persons,
-- context_memberships, financial_accounts, record_operations, licenses, plan_entitlements, context_activity, return_reviews e
-- savings_checks), inclusive depois que um vínculo é revogado (a parte context_permission da regra continua valendo).
-- Pessoas FICTÍCIAS: Ana (titular da Família), Bruno (membro com escrita, sem editar o que outras pessoas anotaram) e Davi (de fora).
-- Nenhuma migração: só leitura do catálogo e dados descartáveis (tudo termina em rollback). Rodar depois das migrações (npm run test:db).
\set ON_ERROR_STOP 1
\set ana   '''00000000-0000-0000-0000-0000000000a4'''
\set bruno '''00000000-0000-0000-0000-0000000000b4'''
\set davi  '''00000000-0000-0000-0000-0000000000d4'''

begin;
set local clarevo.today = '2026-10-21';

-- Opção de relação ligada (reloptions guarda texto como 'security_invoker=true').
create function pg_temp.opt_on(p_opts text[], p_name text) returns boolean language sql immutable as $$
  select coalesce(bool_or(o ~* ('^' || p_name || '=(true|on|yes|1|t)$')), false) from unnest(coalesce(p_opts, '{}')) o
$$;

-- ---------------------------------------------------------------------------
-- Parte A. Catálogo
-- ---------------------------------------------------------------------------

-- A1. Toda função do public (fora as de extensão) tem search_path fixo em public (ou public, extensions, as que usam pgcrypto).
do $$
declare
  v_sem text;
begin
  select string_agg(p.oid::regprocedure::text, ', ' order by p.oid::regprocedure::text collate "C") into v_sem
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')
     and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c ~ '^search_path=public(, extensions)?$');
  assert v_sem is null, 'funções do public sem search_path fixo: ' || coalesce(v_sem, '');
  assert (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public'
             and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')) >= 200,
    'a conferência olha as funções do app (não ficou vazia)';
  assert (select proconfig from pg_proc where oid = 'public.financial_records_guard()'::regprocedure) = array['search_path=public'],
    'o gatilho dos registros fixa search_path = public';
end $$;

-- A2. Visões do public sem security_invoker: só as 8 de propósito (filtro de permissão explícito, sem anon), todas com security_barrier.
do $$
declare
  v_oito constant text[] := array['card_entry_items', 'card_items', 'family_member_items', 'import_items', 'invoice_items',
                                  'my_benefit', 'receipt_items', 'series_items'];
  v_sem_invoker text[];
  v_sem_barrier text[];
begin
  select array_agg(c.relname::text order by c.relname::text collate "C") into v_sem_invoker
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('v', 'm') and not pg_temp.opt_on(c.reloptions, 'security_invoker');
  assert v_sem_invoker = v_oito, 'visões sem security_invoker: só as 8 de propósito, vieram ' || coalesce(array_to_string(v_sem_invoker, ', '), '(nenhuma)');
  select array_agg(c.relname::text order by c.relname::text collate "C") into v_sem_barrier
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('v', 'm') and not pg_temp.opt_on(c.reloptions, 'security_invoker')
     and not pg_temp.opt_on(c.reloptions, 'security_barrier');
  assert v_sem_barrier is null, 'visões sem security_invoker e sem security_barrier: ' || coalesce(array_to_string(v_sem_barrier, ', '), '');
  assert (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind in ('v', 'm') and c.relname in ('commitment_items', 'goal_items')
             and pg_temp.opt_on(c.reloptions, 'security_invoker')) = 2, 'commitment_items e goal_items seguem com security_invoker';
end $$;

-- A3. anon sem nenhum privilégio no public: tabelas, visões, sequências, coluna a coluna e funções com security definer.
do $$
declare
  v_rel text;
  v_fun text;
begin
  select string_agg(c.relname::text, ', ' order by c.relname::text collate "C") into v_rel
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'f', 'S')
     and (case when c.relkind = 'S' then has_sequence_privilege('anon', c.oid, 'usage,select,update')
               else has_table_privilege('anon', c.oid, 'select,insert,update,delete,truncate,references,trigger')
                    or has_any_column_privilege('anon', c.oid, 'select,insert,update,references') end);
  assert v_rel is null, 'anon com privilégio em: ' || coalesce(v_rel, '');
  select string_agg(p.oid::regprocedure::text, ', ' order by p.oid::regprocedure::text collate "C") into v_fun
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prosecdef and has_function_privilege('anon', p.oid, 'execute')
     and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e');
  assert v_fun is null, 'anon executa função com security definer: ' || coalesce(v_fun, '');
  assert not has_schema_privilege('anon', 'public', 'create'), 'anon não cria nada no public';
  assert (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm')) >= 36, 'a conferência olha as tabelas e visões do app (não ficou vazia)';
end $$;

-- A4. Nenhuma política do public com auth.xxx() fora de (select ...). No texto de pg_policies a forma boa é ( SELECT auth.uid() AS uid).
do $$
declare
  v_soltas text;
  v_dez constant text[] := array['context_activity.context_activity_own', 'context_memberships.memberships_read',
    'financial_accounts.accounts_rename', 'licenses.licenses_own_read', 'persons.persons_read', 'persons.persons_update_self',
    'plan_entitlements.entitlements_own_read', 'record_operations.operations_read_own', 'return_reviews.return_reviews_own',
    'savings_checks.savings_checks_own'];
begin
  select string_agg(tablename || '.' || policyname, ', ' order by tablename collate "C", policyname collate "C") into v_soltas
    from pg_policies
   where schemaname = 'public'
     and regexp_replace(coalesce(qual, '') || ' ' || coalesce(with_check, ''),
                        '\(\s*select\s+auth\.[a-z_]+\(\)(\s+as\s+[a-z_]+)?\s*\)', '', 'gi') ~* 'auth\.[a-z_]+\(';
  assert v_soltas is null, 'políticas com auth.uid() fora de (select ...): ' || coalesce(v_soltas, '');
  -- As 10 políticas existem, continuam só para authenticated e usam a forma boa (a conferência não ficou vazia).
  assert (select count(*) from pg_policies
           where schemaname = 'public' and tablename || '.' || policyname = any (v_dez)
             and roles = array['authenticated']::name[]
             and coalesce(qual, '') || coalesce(with_check, '') like '%( SELECT auth.uid() AS uid)%') = 10,
    'as 10 políticas com ( SELECT auth.uid() AS uid), só para authenticated';
  assert (select count(*) from pg_policies where schemaname = 'public' and policyname = 'accounts_rename'
            and qual like '%( SELECT auth.uid() AS uid)%' and with_check like '%( SELECT auth.uid() AS uid)%') = 1,
    'accounts_rename: using e with check';
  assert (select count(*) from pg_policies where schemaname = 'public' and policyname = 'persons_update_self'
            and qual like '%( SELECT auth.uid() AS uid)%' and with_check like '%( SELECT auth.uid() AS uid)%') = 1,
    'persons_update_self: using e with check';
end $$;

-- A5. Toda chave estrangeira do public tem índice válido cujas primeiras colunas são as da chave, na ordem (o critério do verificador;
-- ele conta também índice parcial). A migração 0017 criou os 40 índices <tabela>_<colunas>_fk_idx das chaves que não tinham.
do $$
declare
  v_sem text;
begin
  select string_agg(c.conrelid::regclass::text || '.' || c.conname, ', ' order by c.conrelid::regclass::text collate "C", c.conname collate "C") into v_sem
    from pg_constraint c join pg_namespace n on n.oid = c.connamespace
   where c.contype = 'f' and n.nspname = 'public'
     and not exists (select 1 from pg_index i
                      where i.indrelid = c.conrelid and i.indisvalid and i.indisready
                        and (string_to_array(i.indkey::text, ' ')::smallint[])[1:array_length(c.conkey, 1)] = c.conkey);
  assert v_sem is null, 'chaves estrangeiras do public sem índice: ' || coalesce(v_sem, '');
  assert (select count(*) from pg_constraint c join pg_namespace n on n.oid = c.connamespace
           where c.contype = 'f' and n.nspname = 'public') >= 60, 'a conferência olha as chaves do app (não ficou vazia)';
  assert (select count(*) from pg_indexes where schemaname = 'public' and indexname like '%\_fk\_idx') >= 40, 'os 40 índices _fk_idx da 0017';
  -- Exemplos de ordem de colunas (a da chave): composta com context_id e a de 3 colunas.
  assert exists (select 1 from pg_indexes where schemaname = 'public' and tablename = 'financial_records'
                    and indexname = 'financial_records_account_id_context_id_currency_fk_idx'
                    and indexdef like '%(account_id, context_id, currency)'), 'índice da conta do registro, na ordem da chave';
  assert exists (select 1 from pg_indexes where schemaname = 'public' and tablename = 'context_memberships'
                    and indexname = 'context_memberships_person_id_fk_idx' and indexdef like '%(person_id)'), 'índice do vínculo por pessoa (exclusão de conta)';
end $$;

-- ---------------------------------------------------------------------------
-- Parte B. As 10 políticas continuam permitindo e negando o mesmo
-- ---------------------------------------------------------------------------
create temp table ids (name text primary key, id uuid);
grant select, insert on ids to authenticated, anon;
create function pg_temp.id(p_name text) returns uuid language sql as $$ select id from ids where name = p_name $$;
-- Quantas linhas a consulta devolve, com os privilégios e a RLS de quem está logado.
create function pg_temp.n(p_sql text) returns bigint language plpgsql as $$
declare v bigint;
begin
  execute p_sql into v;
  return v;
end $$;
-- Quantas linhas o comando alterou (0 quando a RLS esconde a linha).
create function pg_temp.changed(p_sql text) returns bigint language plpgsql as $$
declare v bigint;
begin
  execute p_sql;
  get diagnostics v = row_count;
  return v;
end $$;
-- O comando foi recusado pelo privilégio (permission denied), antes da RLS.
create function pg_temp.denied(p_sql text) returns boolean language plpgsql as $$
begin
  execute p_sql;
  return false;
exception when insufficient_privilege then
  return true;
end $$;

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  (:ana,   'ana@exemplo.test',   now(), '{"display_name":"Ana"}'),
  (:bruno, 'bruno@exemplo.test', now(), '{"display_name":"Bruno"}'),
  (:davi,  'davi@exemplo.test',  now(), '{"display_name":"Davi"}');
insert into ids values ('ana', :ana), ('bruno', :bruno), ('davi', :davi);

set role authenticated;
select set_config('request.jwt.claim.sub', :ana, true);
do $$
declare a jsonb;
begin
  a := public.ensure_personal_space('Conta principal');
  insert into ids values ('ana_ctx', (a ->> 'context_id')::uuid), ('ana_conta', (a #>> '{account,id}')::uuid);
end $$;
select set_config('request.jwt.claim.sub', :bruno, true);
do $$
declare a jsonb;
begin
  a := public.ensure_personal_space('Conta principal');
  insert into ids values ('bruno_ctx', (a ->> 'context_id')::uuid), ('bruno_conta', (a #>> '{account,id}')::uuid);
end $$;
select set_config('request.jwt.claim.sub', :davi, true);
do $$
declare a jsonb;
begin
  a := public.ensure_personal_space('Conta principal');
  insert into ids values ('davi_ctx', (a ->> 'context_id')::uuid), ('davi_conta', (a #>> '{account,id}')::uuid);
end $$;

-- Preparação feita pelo backend: a Família da Ana (Bruno é membro com escrita, sem editar o que outras pessoas anotaram), as contas da
-- Família, a empresa com as licenças e os direitos ao plano, e as respostas de "Seus últimos meses" e do plano de guardar.
reset role;
with f as (
  insert into public.financial_contexts (kind, name, owner_person_id) values ('familia', 'Família da Ana', :ana) returning id
) insert into ids select 'fam', id from f;
insert into public.context_memberships (context_id, person_id, role, can_read, can_write, can_edit_others)
  select id, :ana::uuid, 'titular'::public.membership_role, true, true, true from ids where name = 'fam'
  union all
  select id, :bruno::uuid, 'membro'::public.membership_role, true, true, false from ids where name = 'fam';
with c as (
  insert into public.financial_accounts (context_id, name, created_by) select id, 'Conta da casa', :ana from ids where name = 'fam' returning id
) insert into ids select 'fam_conta_ana', id from c;
with c as (
  insert into public.financial_accounts (context_id, name, created_by) select id, 'Conta do Bruno na casa', :bruno from ids where name = 'fam' returning id
) insert into ids select 'fam_conta_bruno', id from c;

with o as (insert into public.organizations (name) values ('Empresa Exemplo') returning id)
insert into ids select 'org', id from o;
with c as (
  insert into public.benefit_contracts (organization_id, seats, plan, starts_on) select id, 5, 'individual', '2026-01-01' from ids where name = 'org' returning id
) insert into ids select 'contrato', id from c;
with l as (
  insert into public.licenses (contract_id, invited_email, person_id, status, activated_at)
    select id, 'ana@exemplo.test', :ana::uuid, 'ativa', now() from ids where name = 'contrato' returning id
) insert into ids select 'lic_ana', id from l;
with l as (
  insert into public.licenses (contract_id, invited_email, person_id, status, activated_at)
    select id, 'bruno@exemplo.test', :bruno::uuid, 'ativa', now() from ids where name = 'contrato' returning id
) insert into ids select 'lic_bruno', id from l;
insert into public.plan_entitlements (person_id, source, license_id, plan) select :ana::uuid, 'beneficio', id, 'individual' from ids where name = 'lic_ana';
insert into public.plan_entitlements (person_id, source, plan) values (:bruno, 'particular', 'individual');

insert into public.return_reviews (person_id, context_id, reviewed_through, decision, decided_on)
  select p.id, c.id, '2026-09-01', 'seguiu', '2026-10-21'
    from ids p join ids c on (p.name, c.name) in (('ana', 'ana_ctx'), ('ana', 'fam'), ('bruno', 'bruno_ctx'), ('bruno', 'fam'));
insert into public.savings_checks (person_id, context_id, answer, answered_on, ask_again_on)
  select p.id, c.id, 'agora_nao', '2026-10-21', '2026-11-21'
    from ids p join ids c on (p.name, c.name) in (('ana', 'ana_ctx'), ('ana', 'fam'), ('bruno', 'bruno_ctx'), ('bruno', 'fam'));

-- Anotações feitas pelas funções do app (gravam a operação, que o gatilho transforma em atividade): Ana no Pessoal e na Família;
-- Bruno no Pessoal e na Família.
set role authenticated;
select set_config('request.jwt.claim.sub', :ana, true);
select public.create_record('vrf-ana-0001', pg_temp.id('ana_ctx'), pg_temp.id('ana_conta'), 'despesa', 1500, '2026-10-20', 'Café');
select public.create_record('vrf-ana-0002', pg_temp.id('fam'), pg_temp.id('fam_conta_ana'), 'despesa', 2500, '2026-10-20', 'Mercado');
select set_config('request.jwt.claim.sub', :bruno, true);
select public.create_record('vrf-bru-0001', pg_temp.id('bruno_ctx'), pg_temp.id('bruno_conta'), 'despesa', 1200, '2026-10-20', 'Ônibus');
select public.create_record('vrf-bru-0002', pg_temp.id('fam'), pg_temp.id('fam_conta_bruno'), 'despesa', 3000, '2026-10-20', 'Padaria');

-- Ana (titular, pode editar o que outras pessoas anotaram) vê e muda o que as regras permitem.
select set_config('request.jwt.claim.sub', :ana, true);
do $$
declare
  ana uuid := pg_temp.id('ana');
  bruno uuid := pg_temp.id('bruno');
  fam uuid := pg_temp.id('fam');
begin
  -- persons_read e persons_update_self: só a própria linha.
  assert pg_temp.n('select count(*) from public.persons') = 1, 'Ana lê só a própria pessoa';
  assert pg_temp.n(format('select count(*) from public.persons where id = %L', ana)) = 1, 'Ana lê a própria linha';
  assert pg_temp.n(format('select count(*) from public.persons where id = %L', bruno)) = 0, 'Ana não lê a linha do Bruno';
  assert pg_temp.changed(format('update public.persons set display_name = %L where id = %L', 'Ana Souza', ana)) = 1, 'Ana muda o próprio nome';
  assert pg_temp.changed(format('update public.persons set display_name = %L where id = %L', 'Outro nome', bruno)) = 0, 'Ana não muda a pessoa do Bruno';
  -- memberships_read: o próprio vínculo e os vínculos dos contextos que ela lê.
  assert pg_temp.n('select count(*) from public.context_memberships') = 3, 'Ana: o vínculo do Pessoal e os 2 da Família';
  assert pg_temp.n(format('select count(*) from public.context_memberships where context_id = %L', fam)) = 2, 'Ana lê os vínculos da Família';
  assert pg_temp.n(format('select count(*) from public.context_memberships where context_id = %L', pg_temp.id('bruno_ctx'))) = 0, 'Ana não lê o vínculo do Pessoal do Bruno';
  -- accounts_rename: desde a 0019, sem o privilégio de update (name), ninguém renomeia direto (contas de origem só pelas funções).
  assert pg_temp.denied(format('update public.financial_accounts set name = %L where id = %L', 'Casa da Ana', pg_temp.id('fam_conta_ana'))), 'Ana não renomeia direto a própria conta da Família';
  assert pg_temp.denied(format('update public.financial_accounts set name = %L where id = %L', 'Conta do Bruno 2', pg_temp.id('fam_conta_bruno'))), 'nem a conta do Bruno';
  assert pg_temp.denied(format('update public.financial_accounts set name = %L where id = %L', 'Intrusa', pg_temp.id('davi_conta'))), 'nem a conta do Davi';
  -- licenses_own_read e entitlements_own_read: só a própria.
  assert pg_temp.n('select count(*) from public.licenses') = 1 and pg_temp.n(format('select count(*) from public.licenses where id = %L', pg_temp.id('lic_ana'))) = 1,
    'Ana lê só a própria licença';
  assert pg_temp.n('select count(*) from public.plan_entitlements') = 1 and pg_temp.n(format('select count(*) from public.plan_entitlements where person_id = %L', ana)) = 1,
    'Ana lê só o próprio direito ao plano';
  -- operations_read_own, context_activity_own, return_reviews_own, savings_checks_own: só as próprias, nos contextos que ela lê.
  assert pg_temp.n('select count(*) from public.record_operations') = 2 and pg_temp.n(format('select count(*) from public.record_operations where actor_id <> %L', ana)) = 0,
    'Ana lê só as próprias 2 operações';
  assert pg_temp.n('select count(*) from public.context_activity') = 2 and pg_temp.n(format('select count(*) from public.context_activity where person_id <> %L', ana)) = 0,
    'Ana lê só a própria atividade (Pessoal e Família)';
  assert pg_temp.n('select count(*) from public.return_reviews') = 2 and pg_temp.n(format('select count(*) from public.return_reviews where person_id <> %L', ana)) = 0,
    'Ana lê só as próprias respostas de últimos meses';
  assert pg_temp.n('select count(*) from public.savings_checks') = 2 and pg_temp.n(format('select count(*) from public.savings_checks where person_id <> %L', ana)) = 0,
    'Ana lê só as próprias respostas do plano de guardar';
end $$;

-- Bruno (membro com escrita, sem editar o que outras pessoas anotaram).
select set_config('request.jwt.claim.sub', :bruno, true);
do $$
declare
  ana uuid := pg_temp.id('ana');
  bruno uuid := pg_temp.id('bruno');
  fam uuid := pg_temp.id('fam');
begin
  assert pg_temp.n('select count(*) from public.persons') = 1 and pg_temp.n(format('select count(*) from public.persons where id = %L', bruno)) = 1, 'Bruno lê só a própria pessoa';
  assert pg_temp.n(format('select count(*) from public.persons where id = %L', ana)) = 0, 'Bruno não lê a linha da Ana';
  assert pg_temp.changed(format('update public.persons set locale = %L where id = %L', 'pt-BR', bruno)) = 1, 'Bruno muda a própria pessoa';
  assert pg_temp.changed(format('update public.persons set locale = %L where id = %L', 'en-US', ana)) = 0, 'Bruno não muda a pessoa da Ana';
  assert pg_temp.n('select count(*) from public.context_memberships') = 3, 'Bruno: o vínculo do Pessoal e os 2 da Família';
  assert pg_temp.n(format('select count(*) from public.context_memberships where context_id = %L', pg_temp.id('ana_ctx'))) = 0, 'Bruno não lê o vínculo do Pessoal da Ana';
  assert pg_temp.denied(format('update public.financial_accounts set name = %L where id = %L', 'Conta do Bruno 3', pg_temp.id('fam_conta_bruno'))), 'Bruno não renomeia direto a própria conta (0019)';
  assert pg_temp.denied(format('update public.financial_accounts set name = %L where id = %L', 'Casa do Bruno', pg_temp.id('fam_conta_ana'))), 'nem a conta da Ana';
  assert pg_temp.n('select count(*) from public.licenses') = 1 and pg_temp.n(format('select count(*) from public.licenses where id = %L', pg_temp.id('lic_bruno'))) = 1, 'Bruno lê só a própria licença';
  assert pg_temp.n('select count(*) from public.plan_entitlements') = 1 and pg_temp.n(format('select count(*) from public.plan_entitlements where person_id = %L', bruno)) = 1, 'Bruno lê só o próprio direito ao plano';
  assert pg_temp.n('select count(*) from public.record_operations') = 2 and pg_temp.n(format('select count(*) from public.record_operations where actor_id <> %L', bruno)) = 0, 'Bruno lê só as próprias 2 operações';
  assert pg_temp.n('select count(*) from public.context_activity') = 2 and pg_temp.n(format('select count(*) from public.context_activity where person_id <> %L', bruno)) = 0, 'Bruno lê só a própria atividade';
  assert pg_temp.n('select count(*) from public.return_reviews') = 2 and pg_temp.n('select count(*) from public.savings_checks') = 2, 'Bruno lê as próprias 2 respostas de cada tipo';
  assert pg_temp.n(format('select count(*) from public.return_reviews where context_id = %L', fam)) = 1, 'Bruno lê a própria resposta da Família';
end $$;

-- Davi (de fora): não lê nem muda nada de Ana nem de Bruno.
select set_config('request.jwt.claim.sub', :davi, true);
do $$
declare
  ana uuid := pg_temp.id('ana');
  davi uuid := pg_temp.id('davi');
begin
  assert pg_temp.n('select count(*) from public.persons') = 1 and pg_temp.n(format('select count(*) from public.persons where id = %L', davi)) = 1, 'Davi lê só a própria pessoa';
  assert pg_temp.changed(format('update public.persons set display_name = %L where id = %L', 'Intruso', ana)) = 0, 'Davi não muda a pessoa da Ana';
  assert pg_temp.n('select count(*) from public.context_memberships') = 1, 'Davi lê só o próprio vínculo';
  assert pg_temp.denied(format('update public.financial_accounts set name = %L where id in (%L, %L)', 'Intrusa', pg_temp.id('fam_conta_ana'), pg_temp.id('fam_conta_bruno'))),
    'Davi não renomeia conta da Família (sem o privilégio, desde a 0019)';
  assert pg_temp.n('select count(*) from public.licenses') = 0 and pg_temp.n('select count(*) from public.plan_entitlements') = 0, 'Davi não lê licença nem direito ao plano';
  assert pg_temp.n('select count(*) from public.record_operations') = 0 and pg_temp.n('select count(*) from public.context_activity') = 0, 'Davi não lê operações nem atividade';
  assert pg_temp.n('select count(*) from public.return_reviews') = 0 and pg_temp.n('select count(*) from public.savings_checks') = 0, 'Davi não lê respostas de ninguém';
end $$;

-- Bruno sai da Família (vínculo revogado): o que depende de context_permission some; o que é só dele (Pessoal) continua.
reset role;
update public.context_memberships set revoked_at = now() where person_id = :bruno and context_id = (select id from ids where name = 'fam');
set role authenticated;
select set_config('request.jwt.claim.sub', :bruno, true);
do $$
declare
  fam uuid := pg_temp.id('fam');
begin
  assert pg_temp.n('select count(*) from public.context_memberships') = 2
     and pg_temp.n(format('select count(*) from public.context_memberships where context_id = %L and person_id <> auth.uid()', fam)) = 0,
    'Bruno sem o vínculo: lê o próprio (Pessoal e Família) e não os da Ana';
  assert pg_temp.n(format('select count(*) from public.context_activity where context_id = %L', fam)) = 0 and pg_temp.n('select count(*) from public.context_activity') = 1,
    'Bruno sem o vínculo não lê a atividade da Família';
  assert pg_temp.n(format('select count(*) from public.return_reviews where context_id = %L', fam)) = 0 and pg_temp.n('select count(*) from public.return_reviews') = 1,
    'Bruno sem o vínculo não lê a resposta de últimos meses da Família';
  assert pg_temp.n(format('select count(*) from public.savings_checks where context_id = %L', fam)) = 0 and pg_temp.n('select count(*) from public.savings_checks') = 1,
    'Bruno sem o vínculo não lê a resposta do plano de guardar da Família';
  assert pg_temp.denied(format('update public.financial_accounts set name = %L where id = %L', 'Conta do Bruno 4', pg_temp.id('fam_conta_bruno'))),
    'Bruno sem o vínculo não renomeia nem a própria conta da Família';
  -- O que é só dele continua (a própria operação é lida mesmo sem o vínculo: operations_read_own não depende do contexto).
  assert pg_temp.n('select count(*) from public.record_operations') = 2, 'Bruno ainda lê as próprias operações';
  assert pg_temp.n('select count(*) from public.licenses') = 1 and pg_temp.n('select count(*) from public.plan_entitlements') = 1, 'Bruno ainda lê a própria licença e o próprio direito ao plano';
end $$;
select set_config('request.jwt.claim.sub', :ana, true);
do $$
begin
  assert pg_temp.n('select count(*) from public.context_memberships') = 3, 'Ana ainda lê o vínculo revogado do Bruno (o contexto é dela)';
  assert pg_temp.n('select count(*) from public.context_activity') = 2 and pg_temp.n('select count(*) from public.return_reviews') = 2, 'Ana segue lendo o que é dela';
end $$;
reset role;

rollback;
