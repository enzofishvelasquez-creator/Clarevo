-- Aceite dos termos e da política (A1, migração 0024): o aceite gravado no cadastro pelos metadados, o aceite no app pela versão vigente,
-- a idempotência, as recusas, o aceite em só leitura (assinatura, D-083), sem contar como anotação, e a exclusão da conta apagando os
-- aceites. Pessoas FICTÍCIAS: Dora (cadastro com a versão), Edu (cadastro sem versão), Fábio (versão inválida) e Gil (sem Pessoal). Tudo
-- em uma transação desfeita no fim.
\set ON_ERROR_STOP 1
\set dora  '''00000000-0000-0000-0000-0000000000d1'''
\set edu   '''00000000-0000-0000-0000-0000000000d2'''
\set fabio '''00000000-0000-0000-0000-0000000000d3'''
\set gil   '''00000000-0000-0000-0000-0000000000d4'''

begin;
set local clarevo.today = '2026-11-05';

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

create temp table ids (name text primary key, id uuid);
grant select, insert on ids to authenticated, anon, service_role;
create function pg_temp.id(p_name text) returns uuid language sql as $$ select id from ids where name = p_name $$;
create function pg_temp.as_(p_name text) returns text language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(pg_temp.id(p_name)::text, ''), true)
$$;
-- Leituras direto na tabela (sem a RLS), como o dono do banco.
create function pg_temp.rows_of(p_name text) returns text language sql security definer set search_path = public, pg_temp as $$
  select coalesce(string_agg(version::text || ':' || origin, ',' order by version), '') from public.legal_acceptances where person_id = pg_temp.id(p_name)
$$;
create function pg_temp.accepted_at(p_name text, p_version int) returns timestamptz language sql security definer set search_path = public, pg_temp as $$
  select accepted_at from public.legal_acceptances where person_id = pg_temp.id(p_name) and version = p_version
$$;
create function pg_temp.activity(p_name text) returns bigint language sql security definer set search_path = public, pg_temp as $$
  select count(*) from public.context_activity where person_id = pg_temp.id(p_name)
$$;

insert into ids values ('dora', :dora), ('edu', :edu), ('fabio', :fabio), ('gil', :gil);
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data, created_at) values
  (:dora,  'dora.aceite@exemplo.test',  now(), '{"display_name":"Dora","terms_version":"1"}', '2026-11-01 15:30:00-03'),
  (:edu,   'edu.aceite@exemplo.test',   now(), '{"display_name":"Edu"}', '2026-11-02 09:00:00-03'),
  (:fabio, 'fabio.aceite@exemplo.test', now(), '{"display_name":"Fábio","terms_version":"999"}', '2026-11-03 10:00:00-03'),
  (:gil,   'gil.aceite@exemplo.test',   now(), '{"display_name":"Gil","terms_version":"1"}', '2026-11-04 11:00:00-03');

-- ---------------------------------------------------------------------------
-- 1. Privilégios: o app lê e aceita só o que é dele; as internas ninguém executa; nada de tabela direta.
-- ---------------------------------------------------------------------------
do $$
declare
  f text;
begin
  assert has_function_privilege('authenticated', 'public.my_legal_acceptance()', 'execute')
     and has_function_privilege('authenticated', 'public.accept_legal_terms(integer, text)', 'execute')
     and not has_function_privilege('anon', 'public.my_legal_acceptance()', 'execute')
     and not has_function_privilege('anon', 'public.accept_legal_terms(integer, text)', 'execute'), 'as duas do app só para quem entrou';
  foreach f in array array['clarevo_legal_version()', 'clarevo_legal_from_signup()', 'clarevo_legal_result(uuid)'] loop
    assert not has_function_privilege('authenticated', 'public.' || f, 'execute') and not has_function_privilege('anon', 'public.' || f, 'execute')
       and not has_function_privilege('service_role', 'public.' || f, 'execute'), 'ninguém de fora executa ' || f;
  end loop;
  assert (select relrowsecurity from pg_class where oid = 'public.legal_acceptances'::regclass), 'RLS ligada';
  assert not has_table_privilege('authenticated', 'public.legal_acceptances', 'select')
     and not has_table_privilege('authenticated', 'public.legal_acceptances', 'insert')
     and not has_table_privilege('service_role', 'public.legal_acceptances', 'select'), 'sem acesso direto à tabela';
  assert public.clarevo_legal_version() = 1, 'versão vigente 1';
  assert 'aceitar_termos' = any (public.clarevo_write_free_actions()), 'aceitar vale mesmo em só leitura';
end $$;

-- ---------------------------------------------------------------------------
-- 2. Cadastro: a versão dos metadados vira aceite quando a pessoa nasce (primeira entrada), com a hora do cadastro.
-- ---------------------------------------------------------------------------
set role authenticated;
do $$
declare
  p text;
begin
  foreach p in array array['dora', 'edu', 'fabio'] loop
    perform pg_temp.as_(p);
    perform public.ensure_personal_space('Conta principal');
  end loop;
end $$;
reset role;
do $$ begin
  assert pg_temp.rows_of('dora') = '1:cadastro', 'Dora aceitou no cadastro: ' || pg_temp.rows_of('dora');
  assert pg_temp.accepted_at('dora', 1) = '2026-11-01 15:30:00-03', 'com a hora do cadastro, não a da primeira entrada';
  assert pg_temp.rows_of('edu') = '', 'sem versão nos metadados, nenhum aceite';
  assert pg_temp.rows_of('fabio') = '', 'versão que não existe não é gravada';
end $$;

set role authenticated;
do $$
declare
  r jsonb;
begin
  perform pg_temp.as_('dora');
  r := public.my_legal_acceptance();
  assert r ->> 'current' = '1' and r ->> 'version' = '1' and (r ->> 'accepted_at')::timestamptz = '2026-11-01 15:30:00-03', 'Dora lê o próprio aceite: ' || r::text;
  perform pg_temp.as_('edu');
  r := public.my_legal_acceptance();
  assert r ->> 'current' = '1' and r ->> 'version' is null and r ->> 'accepted_at' is null, 'Edu ainda sem aceite: ' || r::text;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Aceite no app: só a versão vigente, idempotente pela chave, sem contar como anotação.
-- ---------------------------------------------------------------------------
select pg_temp.as_('edu');
select pg_temp.expect_code($q$select public.accept_legal_terms(2, 'ac-edu-0001')$q$, 'versao_invalida', '22023');
select pg_temp.expect_code($q$select public.accept_legal_terms(null, 'ac-edu-0002')$q$, 'versao_invalida', '22023');
do $$
declare
  r jsonb;
begin
  r := public.accept_legal_terms(1, 'ac-edu-0003');
  assert r ->> 'version' = '1' and r ->> 'accepted_at' is not null, 'Edu aceita no app: ' || r::text;
  assert public.accept_legal_terms(1, 'ac-edu-0003') = r, 'a mesma chave devolve o mesmo resultado';
  assert public.accept_legal_terms(1, 'ac-edu-0004') ->> 'version' = '1', 'aceitar de novo a mesma versão não falha';
end $$;
select pg_temp.expect_code($q$select public.set_signup_source('indicacao', 'ac-edu-0003', 0)$q$, 'chave_reutilizada', 'PT409');
reset role;
do $$ begin
  assert pg_temp.rows_of('edu') = '1:app', 'uma linha só, de origem app: ' || pg_temp.rows_of('edu');
  assert pg_temp.activity('edu') = 0, 'aceitar os termos não conta como anotação';
  assert (select count(*) from public.record_operations where actor_id = pg_temp.id('edu') and action = 'aceitar_termos') = 2,
    'uma operação por chave';
end $$;

-- Sem o Pessoal (nunca entrou no app), não há como aceitar.
set role authenticated;
select pg_temp.as_('gil');
select pg_temp.expect_code($q$select public.accept_legal_terms(1, 'ac-gil-0001')$q$, 'sem_permissao', '42501');
reset role;

-- ---------------------------------------------------------------------------
-- 4. Em só leitura (cobrança valendo e teste acabado), aceitar continua possível.
-- ---------------------------------------------------------------------------
do $$ begin
  perform public.clarevo_staff_set_billing_start(now() - interval '30 days');
  update public.persons set created_at = now() - interval '30 days' where id = pg_temp.id('fabio');
  assert public.clarevo_access(pg_temp.id('fabio')) ->> 'status' = 'leitura', 'Fábio em só leitura';
end $$;
set role authenticated;
select pg_temp.as_('fabio');
select public.accept_legal_terms(1, 'ac-fabio-0001');
reset role;
do $$ begin
  assert pg_temp.rows_of('fabio') = '1:app', 'Fábio aceitou em só leitura';
end $$;

-- ---------------------------------------------------------------------------
-- 5. Excluir a conta apaga os aceites.
-- ---------------------------------------------------------------------------
set role authenticated;
select pg_temp.as_('dora');
select public.delete_my_account('EXCLUIR', 'ac-dora-del-0001');
reset role;
do $$ begin
  assert not exists (select 1 from public.legal_acceptances where person_id = pg_temp.id('dora')), 'os aceites da Dora saíram com a conta';
  assert pg_temp.rows_of('edu') = '1:app', 'os dos outros continuam';
end $$;

rollback;
