-- Painel de empresas (D-056, migração 0014): invite_licenses, renew_license_invite, cancel_license_invite, end_license,
-- preview_license_invite, accept_license, organization_usage, a visão my_benefit, as funções da equipe Clarevo (clarevo_staff_*),
-- o código do convite só como SHA-256, as vagas, as contagens de licenças (sem indicador de uso por pessoa), o contrato terminado que
-- não prende a pessoa, a conta que pode ser apagada depois da licença e a escrita só por função.
-- Pessoas FICTÍCIAS: Rita (RH da Empresa Alfa) e Sofia (segunda pessoa do RH da Alfa), Ricardo (RH da Empresa Beta), Gil (RH de duas
-- empresas fora da vigência e das empresas Antiga e Nova), Bia, Caio, Duda, Edu, Fabi e Gui (convidadas da Alfa), Tito, Lia e Nilo
-- (convidados das empresas Antiga e Nova), Hugo (pessoa comum), Iris e Nando (Família), Otto (externo), Xena (sem espaço pessoal),
-- Lara (e-mail não confirmado) e Rui (corrida nas vagas, com dados gravados de verdade).
-- Tudo em uma transação desfeita no fim, menos a corrida (seção 15), que grava, confere e apaga. Valores em centavos.
\set rita    '''00000000-0000-0000-0000-0000000000a8'''
\set ricardo '''00000000-0000-0000-0000-0000000000b8'''
\set bia     '''00000000-0000-0000-0000-0000000000c8'''
\set caio    '''00000000-0000-0000-0000-0000000000d8'''
\set duda    '''00000000-0000-0000-0000-0000000000e8'''
\set edu     '''00000000-0000-0000-0000-0000000000f8'''
\set fabi    '''00000000-0000-0000-0000-000000000018'''
\set gui     '''00000000-0000-0000-0000-000000000028'''
\set hugo    '''00000000-0000-0000-0000-000000000038'''
\set iris    '''00000000-0000-0000-0000-000000000048'''
\set nando   '''00000000-0000-0000-0000-000000000058'''
\set otto    '''00000000-0000-0000-0000-000000000068'''
\set xena    '''00000000-0000-0000-0000-000000000078'''
\set gil     '''00000000-0000-0000-0000-000000000088'''
\set lara    '''00000000-0000-0000-0000-000000000098'''
\set sofia   '''00000000-0000-0000-0000-0000000000a9'''
\set tito    '''00000000-0000-0000-0000-0000000000b0'''
\set lia     '''00000000-0000-0000-0000-0000000000c0'''
\set nilo    '''00000000-0000-0000-0000-0000000000d0'''

begin;
set local clarevo.today = '2026-10-07';

create function pg_temp.expect_error(p_sql text, p_pattern text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm like p_pattern then return; end if;
    raise exception 'esperado "%", veio "%" (%) em: %', p_pattern, sqlerrm, sqlstate, left(p_sql, 300);
  end;
  raise exception 'esperado erro "%", mas passou: %', p_pattern, left(p_sql, 300);
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
    raise exception 'esperado % (%, "%"), veio "%" (%, "%") em: %', p_code, p_state, p_detail, sqlerrm, sqlstate, v_detail, left(p_sql, 300);
  end;
  raise exception 'esperado erro %, mas passou: %', p_code, left(p_sql, 300);
end $$;

-- O erro inteiro como texto (mensagem, SQLSTATE, detalhe e dica), para comparar recusas.
create function pg_temp.err(p_sql text) returns text language plpgsql as $$
declare
  v_detail text;
  v_hint text;
begin
  begin
    execute p_sql;
  exception when others then
    get stacked diagnostics v_detail = pg_exception_detail, v_hint = pg_exception_hint;
    return format('%s|%s|%s|%s', sqlerrm, sqlstate, coalesce(v_detail, ''), coalesce(v_hint, ''));
  end;
  return 'passou';
end $$;

create temp table ids (name text primary key, id uuid);
grant select, insert on ids to authenticated, anon, service_role;
create temp table codes (name text primary key, code text);
grant select, insert on codes to authenticated;
create function pg_temp.id(p_name text) returns uuid language sql as $$ select id from ids where name = p_name $$;
create function pg_temp.as_(p_name text) returns text language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(pg_temp.id(p_name)::text, ''), true)
$$;
create function pg_temp.code(p_name text) returns text language sql as $$ select code from codes where name = p_name $$;

-- Convida como a pessoa, guarda os códigos (só existem na resposta) e os ids das licenças novas ('lic_<nome>').
create function pg_temp.inv(p_who text, p_contract text, p_emails text[], p_key text) returns jsonb language plpgsql as $$
declare
  r jsonb;
  x jsonb;
  v_name text;
  v_base text;
  n integer;
begin
  perform pg_temp.as_(p_who);
  r := public.invite_licenses(pg_temp.id(p_contract), p_emails, p_key);
  for x in select * from jsonb_array_elements(r -> 'results') loop
    if x ->> 'outcome' = 'convidada' then
      -- O primeiro convite de um e-mail guarda 'lic_<nome>'; os seguintes, 'lic_<nome>2', 'lic_<nome>3'.
      v_base := split_part(x ->> 'email', '@', 1);
      v_name := v_base;
      n := 1;
      while exists (select 1 from ids where name = 'lic_' || v_name) loop
        n := n + 1;
        v_name := v_base || n;
      end loop;
      insert into ids values ('lic_' || v_name, (x #>> '{license,id}')::uuid);
      insert into codes values (v_name, x ->> 'code');
    end if;
  end loop;
  return r;
end $$;

-- A licença de um nome, sem a RLS: "estado tem_resumo cancelada pessoa" (true ou false).
create function pg_temp.lst(p_lic text) returns text language sql security definer set search_path = public, pg_temp as $$
  select format('%s %s %s %s', status, (code_hash is not null)::text, (cancelled_at is not null)::text, (person_id is not null)::text)
    from public.licenses where id = pg_temp.id(p_lic)
$$;
create function pg_temp.hash_of(p_lic text) returns text language sql security definer set search_path = public, pg_temp as $$
  select code_hash from public.licenses where id = pg_temp.id(p_lic)
$$;
create function pg_temp.n_lic(p_contract text) returns bigint language sql security definer set search_path = public, pg_temp as $$
  select count(*) from public.licenses where contract_id = pg_temp.id(p_contract)
$$;
create function pg_temp.n_ops(p_action text) returns bigint language sql security definer set search_path = public, pg_temp as $$
  select count(*) from public.record_operations where action = p_action
$$;
-- O código aparece em alguma coluna gravada? (licenças, operações, organizações, contratos e direitos, como texto da linha inteira)
create function pg_temp.leaks(p_code text) returns boolean language sql security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.licenses t where t::text like '%' || p_code || '%')
      or exists (select 1 from public.record_operations t where t::text like '%' || p_code || '%')
      or exists (select 1 from public.organizations t where t::text like '%' || p_code || '%')
      or exists (select 1 from public.benefit_contracts t where t::text like '%' || p_code || '%')
      or exists (select 1 from public.plan_entitlements t where t::text like '%' || p_code || '%')
      or exists (select 1 from public.persons t where t::text like '%' || p_code || '%')
$$;
-- Quanto há de contexto, vínculo, conta, registro e conta a pagar de uma pessoa (para conferir que encerrar não apaga nada).
create function pg_temp.footprint(p_person text) returns text language sql security definer set search_path = public, pg_temp as $$
  select format('%s %s %s %s %s',
    (select count(*) from public.financial_contexts c where c.owner_person_id = pg_temp.id(p_person)),
    (select count(*) from public.context_memberships m where m.person_id = pg_temp.id(p_person) and m.revoked_at is null),
    (select count(*) from public.financial_accounts a join public.context_memberships m on m.context_id = a.context_id
      where m.person_id = pg_temp.id(p_person) and m.revoked_at is null),
    (select count(*) from public.financial_records r join public.context_memberships m on m.context_id = r.context_id
      where m.person_id = pg_temp.id(p_person) and m.revoked_at is null and r.deleted_at is null),
    (select count(*) from public.commitments c join public.context_memberships m on m.context_id = c.context_id
      where m.person_id = pg_temp.id(p_person) and m.revoked_at is null))
$$;

insert into ids values ('rita', :rita), ('ricardo', :ricardo), ('bia', :bia), ('caio', :caio), ('duda', :duda), ('edu', :edu),
  ('fabi', :fabi), ('gui', :gui), ('hugo', :hugo), ('iris', :iris), ('nando', :nando), ('otto', :otto), ('xena', :xena),
  ('gil', :gil), ('lara', :lara), ('sofia', :sofia), ('tito', :tito), ('lia', :lia), ('nilo', :nilo);
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  (:rita,    'rita@alfa.test',       now(), '{"display_name":"Rita Prado"}'),
  (:ricardo, 'ricardo@beta.test',    now(), '{"display_name":"Ricardo Alves"}'),
  (:bia,     'Bia@Exemplo.test',     now(), '{"display_name":"Bia Souza"}'),
  (:caio,    'caio@exemplo.test',    now(), '{"display_name":"Caio Reis"}'),
  (:duda,    'duda@exemplo.test',    now(), '{"display_name":"Duda Melo"}'),
  (:edu,     'edu@exemplo.test',     now(), '{"display_name":"Edu Lima"}'),
  (:fabi,    'fabi@exemplo.test',    now(), '{"display_name":"Fabi Neves"}'),
  (:gui,     'gui@exemplo.test',     now(), '{"display_name":"Gui Dias"}'),
  (:hugo,    'hugo@exemplo.test',    now(), '{"display_name":"Hugo Sá"}'),
  (:iris,    'iris@exemplo.test',    now(), '{"display_name":"Iris Rocha"}'),
  (:nando,   'nando@exemplo.test',   now(), '{"display_name":"Nando Reis"}'),
  (:otto,    'otto@exemplo.test',    now(), '{"display_name":"Otto Reis"}'),
  (:xena,    'xena@exemplo.test',    now(), '{"display_name":"Xena"}'),
  (:gil,     'gil@gama.test',        now(), '{"display_name":"Gil Prado"}'),
  (:lara,    'lara@exemplo.test',    null,  '{"display_name":"Lara"}'),
  (:sofia,   'sofia@alfa.test',      now(), '{"display_name":"Sofia Lopes"}'),
  (:tito,    'tito@exemplo.test',    now(), '{"display_name":"Tito Alves"}'),
  (:lia,     'lia@exemplo.test',     now(), '{"display_name":"Lia Duarte"}'),
  (:nilo,    'nilo@exemplo.test',    now(), '{"display_name":"Nilo Costa"}');

-- ---------------------------------------------------------------------------
-- 0. Primeira entrada de todos (menos Xena e Lara, sem espaço pessoal). Bia anota e cria uma Família: encerrar a licença não apaga nada.
-- ---------------------------------------------------------------------------
set role authenticated;
do $$
declare
  p text;
  space jsonb;
begin
  foreach p in array array['rita', 'ricardo', 'bia', 'caio', 'duda', 'edu', 'fabi', 'gui', 'hugo', 'iris', 'nando', 'otto', 'gil', 'sofia', 'tito', 'lia', 'nilo'] loop
    perform pg_temp.as_(p);
    space := public.ensure_personal_space('Conta principal');
    insert into ids values (p || '_ctx', (space ->> 'context_id')::uuid), (p || '_acc', (space #>> '{account,id}')::uuid);
  end loop;
  perform pg_temp.as_('bia');
  perform public.create_record('em-bia-0001', pg_temp.id('bia_ctx'), pg_temp.id('bia_acc'), 'despesa', 12345, '2026-10-02', 'Mercado da Bia');
  perform public.create_commitment('em-bia-0002', pg_temp.id('bia_ctx'), 55500, '2026-10-20', 'Internet da Bia');
  insert into ids values ('bia_fam', (public.create_family('Casa da Bia', 'em-bia-0003') #>> '{context,id}')::uuid);
  perform pg_temp.as_('hugo');
  perform public.create_record('em-hugo-0001', pg_temp.id('hugo_ctx'), pg_temp.id('hugo_acc'), 'despesa', 7700, '2026-10-03', 'Mercado do Hugo');
  -- Iris cria a Família e Nando entra por convite: titular e membro, sem nenhum papel na empresa.
  perform pg_temp.as_('iris');
  insert into codes values ('fam_iris', public.create_family_invite((public.create_family('Casa da Iris', 'em-iris-0001') #>> '{context,id}')::uuid, 'membro', 'em-iris-0002') ->> 'code');
  perform pg_temp.as_('nando');
  perform public.accept_family_invite(pg_temp.code('fam_iris'), 'em-nando-0001');
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 1. Equipe Clarevo (M-3): cria organização, contrato e a primeira pessoa administradora. Só quem roda no SQL Editor executa.
-- ---------------------------------------------------------------------------
do $$
declare
  r jsonb;
begin
  -- O e-mail é procurado sem diferenciar maiúsculas nem espaços das pontas; o nome perde os espaços das pontas.
  r := public.clarevo_staff_create_organization('  Empresa Alfa  ', 6, 'individual', '2026-10-01', null, '  RITA@Alfa.test ');
  insert into ids values ('alfa_o', (r ->> 'organization_id')::uuid), ('alfa_c', (r ->> 'contract_id')::uuid);
  assert (r ->> 'admin_person_id')::uuid = pg_temp.id('rita'), 'a primeira pessoa administradora é a Rita';
  assert (select name from public.organizations where id = pg_temp.id('alfa_o')) = 'Empresa Alfa', 'nome sem os espaços das pontas';
  assert (select (seats, plan, starts_on, ends_on) from public.benefit_contracts where id = pg_temp.id('alfa_c'))
    = (6, 'individual'::text, '2026-10-01'::date, null::date), 'contrato da Alfa: 6 vagas, individual, desde 01/10/2026, sem fim';
  assert exists (select 1 from public.organization_admins where organization_id = pg_temp.id('alfa_o') and person_id = pg_temp.id('rita')),
    'Rita administra a Alfa';

  r := public.clarevo_staff_create_organization('Empresa Beta', 3, 'familiar', '2026-09-01', '2027-12-31', 'ricardo@beta.test');
  insert into ids values ('beta_o', (r ->> 'organization_id')::uuid), ('beta_c', (r ->> 'contract_id')::uuid);
  -- Duas empresas fora da vigência (começa depois de hoje; terminou antes de hoje), da mesma pessoa Gil.
  r := public.clarevo_staff_create_organization('Empresa Futura', 2, 'individual', '2026-11-01', null, 'gil@gama.test');
  insert into ids values ('futura_o', (r ->> 'organization_id')::uuid), ('futura_c', (r ->> 'contract_id')::uuid);
  r := public.clarevo_staff_create_organization('Empresa Encerrada', 2, 'individual', '2026-01-01', '2026-09-30', 'gil@gama.test');
  insert into ids values ('enc_o', (r ->> 'organization_id')::uuid), ('enc_c', (r ->> 'contract_id')::uuid);
  assert (select count(*) from public.organizations) = 4 and (select count(*) from public.benefit_contracts) = 4, 'quatro empresas, um contrato cada';
end $$;

-- Recusas da equipe: nada é criado e o erro é claro (com dica quando a pessoa precisa fazer algo).
do $$
declare
  n_org bigint := (select count(*) from public.organizations);
  n_ctr bigint := (select count(*) from public.benefit_contracts);
  n_adm bigint := (select count(*) from public.organization_admins);
begin
  perform pg_temp.expect_code($f$select public.clarevo_staff_create_organization('   ', 3, 'individual', '2026-10-01', null, 'rita@alfa.test')$f$, 'nome_da_organizacao_invalido', '22023');
  perform pg_temp.expect_code($f$select public.clarevo_staff_create_organization(repeat('x', 121), 3, 'individual', '2026-10-01', null, 'rita@alfa.test')$f$, 'nome_da_organizacao_invalido', '22023');
  perform pg_temp.expect_code($f$select public.clarevo_staff_create_organization('Nova', 0, 'individual', '2026-10-01', null, 'rita@alfa.test')$f$, 'vagas_invalidas', '22023');
  perform pg_temp.expect_code($f$select public.clarevo_staff_create_organization('Nova', null, 'individual', '2026-10-01', null, 'rita@alfa.test')$f$, 'vagas_invalidas', '22023');
  perform pg_temp.expect_code($f$select public.clarevo_staff_create_organization('Nova', 3, 'gratis', '2026-10-01', null, 'rita@alfa.test')$f$, 'plano_invalido', '22023');
  perform pg_temp.expect_code($f$select public.clarevo_staff_create_organization('Nova', 3, 'individual', null, null, 'rita@alfa.test')$f$, 'datas_invalidas', '22023');
  perform pg_temp.expect_code($f$select public.clarevo_staff_create_organization('Nova', 3, 'individual', '2026-10-01', '2026-09-30', 'rita@alfa.test')$f$, 'datas_invalidas', '22023');
  perform pg_temp.expect_code($f$select public.clarevo_staff_create_organization('empresa alfa', 3, 'individual', '2026-10-01', null, 'rita@alfa.test')$f$, 'organizacao_ja_existe', 'PT409');
  perform pg_temp.expect_code($f$select public.clarevo_staff_create_organization('Nova', 3, 'individual', '2026-10-01', null, 'isto não é e-mail')$f$, 'email_invalido', '22023');
  -- Sem conta: erro claro, com a dica do que fazer.
  perform pg_temp.expect_code($f$select public.clarevo_staff_create_organization('Nova', 3, 'individual', '2026-10-01', null, 'ninguem@alfa.test')$f$, 'administrador_sem_conta', 'P0002');
  assert pg_temp.err($f$select public.clarevo_staff_create_organization('Nova', 3, 'individual', '2026-10-01', null, 'ninguem@alfa.test')$f$)
    like 'administrador_sem_conta|P0002||%criar a conta no app%', 'sem conta: a dica diz para criar a conta no app';
  -- E-mail ainda não confirmado, e confirmado mas sem a primeira entrada no app.
  perform pg_temp.expect_code($f$select public.clarevo_staff_create_organization('Nova', 3, 'individual', '2026-10-01', null, 'lara@exemplo.test')$f$, 'administrador_sem_conta', 'P0002');
  assert pg_temp.err($f$select public.clarevo_staff_create_organization('Nova', 3, 'individual', '2026-10-01', null, 'lara@exemplo.test')$f$)
    like '%confirm%', 'e-mail não confirmado: a dica fala em confirmar';
  perform pg_temp.expect_code($f$select public.clarevo_staff_create_organization('Nova', 3, 'individual', '2026-10-01', null, 'xena@exemplo.test')$f$, 'administrador_sem_espaco', 'P0002');
  assert (select count(*) from public.organizations) = n_org and (select count(*) from public.benefit_contracts) = n_ctr
     and (select count(*) from public.organization_admins) = n_adm, 'as recusas não criam nada';
end $$;

-- Mais uma pessoa administradora: a repetição não duplica; organização ou conta inexistente é recusada.
do $$
declare
  r jsonb;
begin
  r := public.clarevo_staff_add_org_admin(pg_temp.id('alfa_o'), 'SOFIA@alfa.test');
  assert (r ->> 'admin_person_id')::uuid = pg_temp.id('sofia') and (r ->> 'already_admin')::boolean = false, 'Sofia passa a administrar a Alfa';
  r := public.clarevo_staff_add_org_admin(pg_temp.id('alfa_o'), 'sofia@alfa.test');
  assert (r ->> 'already_admin')::boolean = true
     and (select count(*) from public.organization_admins where organization_id = pg_temp.id('alfa_o')) = 2, 'repetir não duplica';
  perform pg_temp.expect_code(format($f$select public.clarevo_staff_add_org_admin(%L, 'sofia@alfa.test')$f$, gen_random_uuid()), 'organizacao_nao_encontrada', 'P0002');
  perform pg_temp.expect_code(format($f$select public.clarevo_staff_add_org_admin(%L, 'ninguem@alfa.test')$f$, pg_temp.id('alfa_o')), 'administrador_sem_conta', 'P0002');
end $$;

-- Só quem roda no SQL Editor (o dono) executa: nem authenticated, nem anon, nem public, nem service_role (a chave de serviço do
-- Supabase, que o 00_auth_shim.sql cria como lá, com execute padrão em tudo).
do $$
declare
  f text;
begin
  assert exists (select 1 from pg_roles where rolname = 'service_role' and rolbypassrls and not rolinherit and not rolcanlogin),
    'o papel service_role existe, como no Supabase (sem login, sem herança, ignora a RLS)';
  -- O teste vale: service_role executa as funções do app (privilégio padrão); desde a 0019, nenhuma interna clarevo_* (99w_reforcos.sql).
  assert has_function_privilege('service_role', 'public.month_totals(uuid, date)', 'execute'), 'service_role mantém o execute padrão nas funções do app';
  assert not has_function_privilege('service_role', 'public.clarevo_normalize_email(text)', 'execute'), 'e nenhuma interna clarevo_* (0019)';
  foreach f in array array['clarevo_staff_create_organization(text, integer, text, date, date, text)', 'clarevo_staff_add_org_admin(uuid, text)',
                           'clarevo_staff_update_contract(uuid, integer, date)', 'clarevo_staff_find_admin(text)'] loop
    assert not has_function_privilege('authenticated', 'public.' || f, 'execute') and not has_function_privilege('anon', 'public.' || f, 'execute'),
      'sem execute para authenticated nem anon: ' || f;
    assert not has_function_privilege('service_role', 'public.' || f, 'execute'), 'sem execute para service_role: ' || f;
    assert not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                        where n.nspname = 'public' and p.oid = ('public.' || f)::regprocedure
                          and exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where a.grantee = 0)),
      'sem execute para public: ' || f;
  end loop;
end $$;
set role authenticated;
select pg_temp.as_('rita');
select pg_temp.expect_error($f$select public.clarevo_staff_create_organization('Intrusa', 3, 'individual', '2026-10-01', null, 'rita@alfa.test')$f$, 'permission denied%');
select pg_temp.expect_error(format($f$select public.clarevo_staff_add_org_admin(%L, 'rita@alfa.test')$f$, pg_temp.id('beta_o')), 'permission denied%');
select pg_temp.expect_error(format($f$select public.clarevo_staff_update_contract(%L, 1000, null)$f$, pg_temp.id('beta_c')), 'permission denied%');
select pg_temp.as_('hugo');
select pg_temp.expect_error($f$select public.clarevo_staff_create_organization('Intrusa', 3, 'individual', '2026-10-01', null, 'hugo@exemplo.test')$f$, 'permission denied%');
reset role;
set role anon;
select pg_temp.expect_error($f$select public.clarevo_staff_create_organization('Intrusa', 3, 'individual', '2026-10-01', null, 'hugo@exemplo.test')$f$, 'permission denied%');
select pg_temp.expect_error($f$select public.clarevo_staff_find_admin('hugo@exemplo.test')$f$, 'permission denied%');
reset role;
-- service_role: chave de serviço com BYPASSRLS, mas sem execute nas funções da equipe (só o dono do banco, no SQL Editor).
set role service_role;
select pg_temp.expect_error($f$select public.clarevo_staff_create_organization('Intrusa', 3, 'individual', '2026-10-01', null, 'hugo@exemplo.test')$f$, 'permission denied%');
select pg_temp.expect_error(format($f$select public.clarevo_staff_add_org_admin(%L, 'rita@alfa.test')$f$, pg_temp.id('beta_o')), 'permission denied%');
select pg_temp.expect_error(format($f$select public.clarevo_staff_update_contract(%L, 1000, null)$f$, pg_temp.id('beta_c')), 'permission denied%');
select pg_temp.expect_error($f$select public.clarevo_staff_find_admin('hugo@exemplo.test')$f$, 'permission denied%');
reset role;
do $$ begin
  assert (select count(*) from public.organizations) = 4 and not exists (select 1 from public.organizations where name = 'Intrusa'), 'ninguém com sessão cria empresa';
end $$;

-- ---------------------------------------------------------------------------
-- 2. invite_licenses: quem pode, normalização, repetidos, e-mail inválido, código só como resumo, repetição da chave.
-- ---------------------------------------------------------------------------
set role authenticated;
do $$
declare
  r jsonb;
  c text;
begin
  -- Quem não administra a Alfa (RH da Beta, pessoa comum, Família, externo, outra empresa) recebe "não encontrado" e nada é criado.
  foreach c in array array['ricardo', 'hugo', 'iris', 'nando', 'otto', 'bia', 'gil'] loop
    perform pg_temp.as_(c);
    perform pg_temp.expect_code(format($f$select public.invite_licenses(%L, array['x@exemplo.test'], 'em-nao-%s')$f$, pg_temp.id('alfa_c'), c), 'nao_encontrado', 'P0002');
  end loop;
  assert pg_temp.n_lic('alfa_c') = 0 and pg_temp.n_ops('convidar_licencas') = 0, 'nenhuma licença nem operação por quem não administra';
  -- Contrato que não existe: a mesma resposta.
  perform pg_temp.as_('rita');
  perform pg_temp.expect_code(format($f$select public.invite_licenses(%L, array['x@exemplo.test'], 'em-nao-contrato')$f$, gen_random_uuid()), 'nao_encontrado', 'P0002');
  -- Sem sessão.
  perform set_config('request.jwt.claim.sub', '', true);
  perform pg_temp.expect_code(format($f$select public.invite_licenses(%L, array['x@exemplo.test'], 'em-nao-sessao')$f$, pg_temp.id('alfa_c')), 'nao_autenticado', '42501');
  perform pg_temp.as_('rita');
  perform pg_temp.expect_code(format($f$select public.invite_licenses(%L, array['x@exemplo.test'], 'curta')$f$, pg_temp.id('alfa_c')), 'chave_invalida', '22023');

  -- Convida com espaços, maiúsculas e um repetido: três licenças convidadas, os códigos aparecem só aqui.
  r := pg_temp.inv('rita', 'alfa_c', array[' Bia@Exemplo.test ', 'caio@exemplo.test', 'bia@exemplo.test', 'DUDA@exemplo.test'], 'em-inv-0001');
  assert jsonb_array_length(r -> 'results') = 3 and (r ->> 'seats')::int = 6 and (r ->> 'in_use')::int = 3, 'três pessoas, 3 de 6 vagas';
  assert (select array_agg(x ->> 'email' order by ord) from jsonb_array_elements(r -> 'results') with ordinality t(x, ord))
    = array['bia@exemplo.test', 'caio@exemplo.test', 'duda@exemplo.test'], 'e-mails normalizados, sem repetidos, na ordem em que aparecem';
  assert not exists (select 1 from jsonb_array_elements(r -> 'results') x where x ->> 'outcome' <> 'convidada' or x ->> 'code' !~ '^[0-9a-f]{32}$'
                        or x #>> '{license,status}' <> 'convidada'), 'todas convidadas, cada uma com um código de 32 hexadecimais (128 bits)';
  assert (select array_agg(k order by k collate "C") from jsonb_object_keys((r #> '{results,0,license}')) k)
    = array['activated_at', 'cancelled_at', 'contract_id', 'created_at', 'ended_at', 'id', 'invited_at', 'invited_email', 'status'],
    'a licença devolvida não traz o resumo do código nem a pessoa';
end $$;
reset role;
do $$
declare
  n text;
begin
  -- O banco guarda só o SHA-256 (64 hexadecimais) do código, que bate com o do código devolvido; o código não está em lugar nenhum.
  foreach n in array array['bia', 'caio', 'duda'] loop
    assert pg_temp.hash_of('lic_' || n) = encode(sha256(convert_to(pg_temp.code(n), 'UTF8')), 'hex') and pg_temp.hash_of('lic_' || n) ~ '^[0-9a-f]{64}$',
      'só o SHA-256 do código fica guardado: ' || n;
    assert not pg_temp.leaks(pg_temp.code(n)), 'o código não existe em nenhuma coluna gravada: ' || n;
    assert pg_temp.lst('lic_' || n) = 'convidada true false false', 'convidada, com resumo, sem cancelamento, sem pessoa: ' || n;
  end loop;
  assert (select count(distinct code_hash) from public.licenses) = 3, 'um resumo diferente por licença';
  assert (select (action, context_id is null, record_id is null, commitment_id is null, target_id) from public.record_operations where idempotency_key = 'em-inv-0001')
    = ('convidar_licencas'::text, true, true, true, pg_temp.id('alfa_c')), 'a operação aponta para o contrato e não tem contexto financeiro';
  assert (select license_result::text !~ '(bia|caio|duda)@' and not license_result::text like '%' || pg_temp.code('bia') || '%'
            from public.record_operations where idempotency_key = 'em-inv-0001'), 'o resultado guardado tem ids, nunca e-mail nem código';
end $$;

set role authenticated;
do $$
declare
  r jsonb;
  r2 jsonb;
begin
  perform pg_temp.as_('rita');
  -- E-mail inválido: recusa a lista toda, com a posição, e não grava nada.
  perform pg_temp.expect_code(format($f$select public.invite_licenses(%L, array['edu@exemplo.test', 'edu@@exemplo.test'], 'em-inv-bad1')$f$, pg_temp.id('alfa_c')), 'email_invalido', '22023', 'item=2');
  perform pg_temp.expect_code(format($f$select public.invite_licenses(%L, array['   '], 'em-inv-bad2')$f$, pg_temp.id('alfa_c')), 'email_invalido', '22023', 'item=1');
  perform pg_temp.expect_code(format($f$select public.invite_licenses(%L, array['edu@exemplo'], 'em-inv-bad3')$f$, pg_temp.id('alfa_c')), 'email_invalido', '22023', 'item=1');
  perform pg_temp.expect_code(format($f$select public.invite_licenses(%L, array['edu @exemplo.test'], 'em-inv-bad4')$f$, pg_temp.id('alfa_c')), 'email_invalido', '22023', 'item=1');
  perform pg_temp.expect_code(format($f$select public.invite_licenses(%L, array['.edu@exemplo.test'], 'em-inv-bad5')$f$, pg_temp.id('alfa_c')), 'email_invalido', '22023', 'item=1');
  perform pg_temp.expect_code(format($f$select public.invite_licenses(%L, array['ed..u@exemplo.test'], 'em-inv-bad6')$f$, pg_temp.id('alfa_c')), 'email_invalido', '22023', 'item=1');
  perform pg_temp.expect_code(format($f$select public.invite_licenses(%L, array[null], 'em-inv-bad7')$f$, pg_temp.id('alfa_c')), 'email_invalido', '22023', 'item=1');
  perform pg_temp.expect_code(format($f$select public.invite_licenses(%L, array[repeat('a', 65) || '@exemplo.test'], 'em-inv-bad8')$f$, pg_temp.id('alfa_c')), 'email_invalido', '22023', 'item=1');
  -- Lista vazia, ausente ou com mais de 500.
  perform pg_temp.expect_code(format($f$select public.invite_licenses(%L, array[]::text[], 'em-inv-bad9')$f$, pg_temp.id('alfa_c')), 'itens_invalidos', '22023');
  perform pg_temp.expect_code(format($f$select public.invite_licenses(%L, null, 'em-inv-bada')$f$, pg_temp.id('alfa_c')), 'itens_invalidos', '22023');
  perform pg_temp.expect_code(format($f$select public.invite_licenses(%L, (select array_agg('p' || g || '@exemplo.test') from generate_series(1, 501) g), 'em-inv-badb')$f$, pg_temp.id('alfa_c')), 'itens_invalidos', '22023');
  assert pg_temp.n_lic('alfa_c') = 3 and pg_temp.n_ops('convidar_licencas') = 1, 'as recusas não gravam licença nem operação';

  -- E-mail que já tem licença aberta volta como "já convidado", sem novo código; o novo ganha a sua.
  r := pg_temp.inv('rita', 'alfa_c', array['caio@exemplo.test', 'edu@exemplo.test'], 'em-inv-0002');
  assert (r -> 'results' -> 0 ->> 'outcome') = 'ja_convidado' and (r -> 'results' -> 0 ->> 'code') is null
     and (r #>> '{results,0,license,id}')::uuid = pg_temp.id('lic_caio'), 'Caio volta como já convidado, sem código novo';
  assert (r -> 'results' -> 1 ->> 'outcome') = 'convidada' and (r -> 'results' -> 1 ->> 'code') ~ '^[0-9a-f]{32}$' and (r ->> 'in_use')::int = 4, 'Edu é novo';
  assert pg_temp.hash_of('lic_caio') = encode(sha256(convert_to(pg_temp.code('caio'), 'UTF8')), 'hex'), 'o resumo do Caio não mudou';

  -- Repetir a mesma chave e a mesma lista: os mesmos resultados, sem o código e sem gravar de novo.
  r := public.invite_licenses(pg_temp.id('alfa_c'), array[' Bia@Exemplo.test ', 'caio@exemplo.test', 'bia@exemplo.test', 'DUDA@exemplo.test'], 'em-inv-0001');
  assert jsonb_array_length(r -> 'results') = 3 and not exists (select 1 from jsonb_array_elements(r -> 'results') x where x ->> 'code' is not null)
     and (select array_agg(x ->> 'outcome' order by ord) from jsonb_array_elements(r -> 'results') with ordinality t(x, ord)) = array['convidada', 'convidada', 'convidada']
     and (r #>> '{results,1,license,id}')::uuid = pg_temp.id('lic_caio') and (r ->> 'in_use')::int = 4, 'repetição: mesmos resultados, sem código';
  r2 := public.invite_licenses(pg_temp.id('alfa_c'), array['caio@exemplo.test', 'edu@exemplo.test'], 'em-inv-0002');
  assert (select array_agg(x ->> 'outcome' order by ord) from jsonb_array_elements(r2 -> 'results') with ordinality t(x, ord)) = array['ja_convidado', 'convidada'],
    'repetição do segundo lote: o mesmo resultado de cada e-mail';
  assert pg_temp.n_lic('alfa_c') = 4 and pg_temp.n_ops('convidar_licencas') = 2, 'a repetição não grava nada';
  -- Outro conteúdo com a mesma chave, ou a mesma chave em outra função: chave_reutilizada.
  perform pg_temp.expect_code(format($f$select public.invite_licenses(%L, array['gui@exemplo.test'], 'em-inv-0001')$f$, pg_temp.id('alfa_c')), 'chave_reutilizada', 'PT409');
  perform pg_temp.expect_code(format($f$select public.invite_licenses(%L, array['caio@exemplo.test', 'edu@exemplo.test'], 'em-inv-0001')$f$, pg_temp.id('alfa_c')), 'chave_reutilizada', 'PT409');
  perform pg_temp.expect_code(format($f$select public.renew_license_invite(%L, 'em-inv-0001')$f$, pg_temp.id('lic_caio')), 'chave_reutilizada', 'PT409');
  perform pg_temp.expect_code(format($f$select public.create_record('em-inv-0001', %L, %L, 'despesa', 100, '2026-10-02', 'x')$f$, pg_temp.id('rita_ctx'), pg_temp.id('rita_acc')), 'chave_reutilizada', 'PT409');
  -- Outra pessoa não repete a chave da Rita: nao_encontrado (e o espaço de chaves é por pessoa).
  perform pg_temp.as_('ricardo');
  perform pg_temp.expect_code(format($f$select public.invite_licenses(%L, array['caio@exemplo.test', 'edu@exemplo.test'], 'em-inv-0002')$f$, pg_temp.id('alfa_c')), 'nao_encontrado', 'P0002');
  perform pg_temp.as_('sofia');
  r := public.invite_licenses(pg_temp.id('alfa_c'), array['caio@exemplo.test'], 'em-inv-sofia1');
  assert (r -> 'results' -> 0 ->> 'outcome') = 'ja_convidado', 'a segunda pessoa do RH também convida (e vê que já foi convidado)';
end $$;
reset role;
do $$ begin
  assert (select count(*) from public.licenses where contract_id = pg_temp.id('alfa_c')) = 4, 'quatro licenças na Alfa';
  assert not pg_temp.leaks(pg_temp.code('edu')) and pg_temp.lst('lic_edu') = 'convidada true false false', 'Edu convidado, sem código gravado';
end $$;

-- ---------------------------------------------------------------------------
-- 3. Vagas (E1): licenças convidada + ativa nunca passam de seats; tudo ou nada; contrato fora da vigência.
-- ---------------------------------------------------------------------------
set role authenticated;
do $$
declare
  r jsonb;
begin
  perform pg_temp.as_('rita');
  -- 4 de 6 usadas: três pessoas novas não cabem (sobram 2), e nada é gravado.
  perform pg_temp.expect_code(format($f$select public.invite_licenses(%L, array['fabi@exemplo.test', 'gui@exemplo.test', 'hugo@exemplo.test'], 'em-inv-0003')$f$, pg_temp.id('alfa_c')),
    'vagas_insuficientes', 'PT409', 'disponiveis=2');
  assert pg_temp.n_lic('alfa_c') = 4 and pg_temp.n_ops('convidar_licencas') = 3, 'tudo ou nada: nenhuma licença do lote foi criada';
  -- Quem já foi convidado não ocupa vaga de novo: o lote de 3 com 1 já convidado cabe nas 2 vagas.
  r := pg_temp.inv('rita', 'alfa_c', array['caio@exemplo.test', 'fabi@exemplo.test', 'gui@exemplo.test'], 'em-inv-0003');
  assert (r ->> 'in_use')::int = 6 and (select array_agg(x ->> 'outcome' order by ord) from jsonb_array_elements(r -> 'results') with ordinality t(x, ord))
    = array['ja_convidado', 'convidada', 'convidada'], 'seis de seis vagas';
  -- No limite: pessoa nova é recusada com 0 disponíveis; quem já foi convidado continua voltando como já convidado.
  perform pg_temp.expect_code(format($f$select public.invite_licenses(%L, array['hugo@exemplo.test'], 'em-inv-0004')$f$, pg_temp.id('alfa_c')), 'vagas_insuficientes', 'PT409', 'disponiveis=0');
  r := public.invite_licenses(pg_temp.id('alfa_c'), array['fabi@exemplo.test'], 'em-inv-0005');
  assert (r -> 'results' -> 0 ->> 'outcome') = 'ja_convidado' and (r ->> 'in_use')::int = 6, 'no limite, quem já foi convidado não precisa de vaga';

  -- Contrato fora da vigência: ainda não começou, ou já terminou.
  perform pg_temp.as_('gil');
  perform pg_temp.expect_code(format($f$select public.invite_licenses(%L, array['x@exemplo.test'], 'em-gil-0001')$f$, pg_temp.id('futura_c')), 'contrato_nao_vigente', 'PT409');
  perform pg_temp.expect_code(format($f$select public.invite_licenses(%L, array['x@exemplo.test'], 'em-gil-0002')$f$, pg_temp.id('enc_c')), 'contrato_nao_vigente', 'PT409');
  assert pg_temp.n_lic('futura_c') = 0 and pg_temp.n_lic('enc_c') = 0, 'nenhuma licença em contrato fora da vigência';
  -- A Beta funciona só para o Ricardo.
  r := pg_temp.inv('ricardo', 'beta_c', array['bia@exemplo.test', 'otto@exemplo.test'], 'em-ric-0001');
  assert (r ->> 'seats')::int = 3 and (r ->> 'in_use')::int = 2, 'a Beta tem 3 vagas e usa 2';
  perform pg_temp.as_('rita');
  perform pg_temp.expect_code(format($f$select public.invite_licenses(%L, array['hugo@exemplo.test'], 'em-rit-beta')$f$, pg_temp.id('beta_c')), 'nao_encontrado', 'P0002');
end $$;
reset role;
do $$ begin
  -- Mesmo com escrita direta do backend, as vagas não passam de seats (gatilho) e uma licença ativa por pessoa vale (índice único).
  perform pg_temp.expect_code(format($f$insert into public.licenses (contract_id, invited_email) values (%L, 'extra@exemplo.test')$f$, pg_temp.id('alfa_c')), 'vagas_insuficientes', 'PT409');
  assert pg_temp.n_lic('alfa_c') = 6 and (select seats from public.benefit_contracts where id = pg_temp.id('alfa_c')) = 6, 'seis licenças, seis vagas';
  perform pg_temp.expect_code(format($f$update public.benefit_contracts set seats = 5 where id = %L$f$, pg_temp.id('alfa_c')), 'vagas_em_uso', 'PT409');
  perform pg_temp.expect_code(format($f$update public.benefit_contracts set plan = 'familiar' where id = %L$f$, pg_temp.id('alfa_c')), 'campo_imutavel', '42501');
  perform pg_temp.expect_code(format($f$update public.benefit_contracts set organization_id = %L where id = %L$f$, pg_temp.id('beta_o'), pg_temp.id('alfa_c')), 'campo_imutavel', '42501');
  perform pg_temp.expect_code(format($f$update public.benefit_contracts set starts_on = '2026-09-01' where id = %L$f$, pg_temp.id('alfa_c')), 'campo_imutavel', '42501');
end $$;

-- ---------------------------------------------------------------------------
-- 4. Prévia e aceite (E3, E4): só quem tem o e-mail do convite; qualquer outro caso responde o mesmo convite_invalido.
-- ---------------------------------------------------------------------------
set role authenticated;
do $$
declare
  r jsonb;
  err_unknown text;
  err_malformed text;
  err_empty text;
  c text;
begin
  perform pg_temp.as_('bia');
  r := public.preview_license_invite(pg_temp.code('bia'));
  assert (select array_agg(k order by k collate "C") from jsonb_object_keys(r) k) = array['organization_name', 'plan']
     and r ->> 'organization_name' = 'Empresa Alfa' and r ->> 'plan' = 'individual', 'a prévia mostra só o nome da organização e o plano';
  r := public.preview_license_invite('  ' || upper(pg_temp.code('bia')) || ' ');
  assert r ->> 'organization_name' = 'Empresa Alfa', 'o código vale com maiúsculas e espaços nas pontas';
  assert pg_temp.n_ops('aceitar_licenca') = 0, 'a prévia não grava nada';

  -- O mesmo erro (mensagem, estado, detalhe e dica) para: código que não existe, malformado, vazio, e de outro e-mail.
  err_unknown := pg_temp.err($f$select public.preview_license_invite('00000000000000000000000000000000')$f$);
  err_malformed := pg_temp.err($f$select public.preview_license_invite('isto-nao-e-um-codigo')$f$);
  err_empty := pg_temp.err($f$select public.preview_license_invite('')$f$);
  assert err_unknown = 'convite_invalido|P0002||' and err_malformed = err_unknown and err_empty = err_unknown, 'código inexistente, malformado e vazio: o mesmo erro';
  foreach c in array array['caio', 'hugo', 'rita', 'ricardo', 'iris', 'otto'] loop
    perform pg_temp.as_(c);
    assert pg_temp.err(format($f$select public.preview_license_invite(%L)$f$, pg_temp.code('bia'))) = err_unknown, 'prévia do código da Bia por ' || c || ': o mesmo erro';
    assert pg_temp.err(format($f$select public.accept_license(%L, %L)$f$, pg_temp.code('bia'), 'em-acc-x-' || c)) = err_unknown, 'aceite do código da Bia por ' || c || ': o mesmo erro';
  end loop;
  assert pg_temp.err($f$select public.accept_license('00000000000000000000000000000000', 'em-acc-x-nada')$f$) = err_unknown
     and pg_temp.err($f$select public.accept_license('', 'em-acc-x-vazio')$f$) = err_unknown
     and pg_temp.err($f$select public.accept_license(null, 'em-acc-x-nulo')$f$) = err_unknown, 'aceite de código inexistente, vazio ou nulo: o mesmo erro';
  assert pg_temp.lst('lic_bia') = 'convidada true false false' and pg_temp.n_ops('aceitar_licenca') = 0
     and not exists (select 1 from public.plan_entitlements), 'nenhuma recusa muda a licença, grava operação ou cria direito';
end $$;
reset role;

-- E-mail sem confirmar na conta (mesmo com espaço pessoal): o mesmo erro, mesmo com o código certo. Lara não tem espaço nenhum.
update auth.users set email_confirmed_at = null where id = :fabi;
set role authenticated;
do $$
begin
  perform pg_temp.as_('fabi');
  assert pg_temp.err(format($f$select public.preview_license_invite(%L)$f$, pg_temp.code('fabi'))) = 'convite_invalido|P0002||', 'e-mail não confirmado: prévia recusada';
  assert pg_temp.err(format($f$select public.accept_license(%L, 'em-acc-fabi-0')$f$, pg_temp.code('fabi'))) = 'convite_invalido|P0002||', 'e-mail não confirmado: aceite recusado';
  -- Sem espaço pessoal (Xena, Lara): o aceite responde o mesmo sem_permissao para o código válido, inexistente, malformado e vazio.
  perform pg_temp.as_('xena');
  assert pg_temp.err(format($f$select public.accept_license(%L, 'em-acc-xena-1')$f$, pg_temp.code('bia'))) = 'sem_permissao|42501||'
     and pg_temp.err($f$select public.accept_license('00000000000000000000000000000000', 'em-acc-xena-2')$f$) = 'sem_permissao|42501||'
     and pg_temp.err($f$select public.accept_license('lixo', 'em-acc-xena-3')$f$) = 'sem_permissao|42501||'
     and pg_temp.err($f$select public.accept_license('', 'em-acc-xena-4')$f$) = 'sem_permissao|42501||', 'sem espaço pessoal: sempre sem_permissao';
  perform pg_temp.as_('lara');
  assert pg_temp.err(format($f$select public.accept_license(%L, 'em-acc-lara-1')$f$, pg_temp.code('bia'))) = 'sem_permissao|42501||', 'Lara também';
  assert pg_temp.n_ops('aceitar_licenca') = 0, 'nada gravado';
end $$;
reset role;
update auth.users set email_confirmed_at = now() where id = :fabi;

set role authenticated;
do $$
declare
  r jsonb;
  r2 jsonb;
  v_hash text := pg_temp.hash_of('lic_bia');
begin
  -- Bia aceita (o e-mail da conta é "Bia@Exemplo.test" e o do convite, "bia@exemplo.test").
  perform pg_temp.as_('bia');
  r := public.accept_license(pg_temp.code('bia'), 'em-acc-0001');
  assert r ->> 'status' = 'ativa' and r ->> 'organization_name' = 'Empresa Alfa' and r ->> 'plan' = 'individual'
     and (r ->> 'license_id')::uuid = pg_temp.id('lic_bia') and r ->> 'ended_at' is null and r ->> 'access_until' is null, 'Bia aceitou: ativa, Alfa, individual, sem fim';
  assert pg_temp.lst('lic_bia') = 'ativa false false true', 'licença ativa, com a pessoa e sem o resumo do código';
  assert (select (person_id, source::text, license_id, plan, valid_until is null) from public.plan_entitlements where license_id = pg_temp.id('lic_bia'))
    = (pg_temp.id('bia'), 'beneficio'::text, pg_temp.id('lic_bia'), 'individual'::text, true), 'direito ao plano de origem benefício, sem fim (contrato sem fim)';
  assert (select count(*) from public.plan_entitlements) = 1, 'um direito ao plano';
  assert (select (action, context_id is null, target_id) from public.record_operations where idempotency_key = 'em-acc-0001')
    = ('aceitar_licenca'::text, true, pg_temp.id('lic_bia')), 'a operação aponta para a licença';
  -- A mesma chave devolve o mesmo resultado; o mesmo código com outra chave já não vale (uso único).
  r2 := public.accept_license(pg_temp.code('bia'), 'em-acc-0001');
  assert r2 = r and pg_temp.n_ops('aceitar_licenca') = 1 and (select count(*) from public.plan_entitlements) = 1, 'repetir a chave devolve o mesmo resultado, sem gravar';
  assert pg_temp.err(format($f$select public.accept_license(%L, 'em-acc-0002')$f$, pg_temp.code('bia'))) = 'convite_invalido|P0002||', 'código usado: convite_invalido';
  assert pg_temp.err(format($f$select public.preview_license_invite(%L)$f$, pg_temp.code('bia'))) = 'convite_invalido|P0002||', 'prévia de código usado: convite_invalido';
  -- Outro conteúdo com a mesma chave: chave_reutilizada.
  perform pg_temp.expect_code(format($f$select public.accept_license(%L, 'em-acc-0001')$f$, pg_temp.code('caio')), 'chave_reutilizada', 'PT409');
  perform pg_temp.expect_code($f$select public.cancel_license_invite(gen_random_uuid(), 'em-acc-0001')$f$, 'chave_reutilizada', 'PT409');
  assert v_hash is not null, 'o resumo existia antes do aceite';
end $$;
reset role;
do $$ begin
  assert not pg_temp.leaks(pg_temp.code('bia')), 'o código aceito não está em nenhuma coluna';
  assert (select code_hash from public.licenses where id = pg_temp.id('lic_bia')) is null, 'aceitar zera o resumo do código';
  assert (select person_id from public.licenses where id = pg_temp.id('lic_bia')) = pg_temp.id('bia')
     and (select activated_at is not null from public.licenses where id = pg_temp.id('lic_bia')), 'pessoa e data de ativação definidas pelo servidor';
end $$;

-- Bia lê o próprio benefício (my_benefit) e a própria licença; só o nome da organização e o plano, nunca outras licenças.
set role authenticated;
do $$
declare
  c text;
begin
  perform pg_temp.as_('bia');
  assert (select count(*) from public.my_benefit) = 1
     and (select (organization_name, plan, status) from public.my_benefit) = ('Empresa Alfa'::text, 'individual'::text, 'ativa'::text), 'Bia lê o benefício pela visão';
  assert (select array_agg(attname::text order by attnum) from pg_attribute where attrelid = 'public.my_benefit'::regclass and attnum > 0 and not attisdropped)
    = array['license_id', 'organization_name', 'plan', 'status', 'activated_at', 'ended_at', 'access_until', 'contract_ends_on'], 'colunas da visão my_benefit';
  assert (select count(*) from public.licenses) = 1 and (select status from public.licenses) = 'ativa', 'Bia lê a própria licença (e só a dela)';
  assert (select count(*) from public.organizations) = 0 and (select count(*) from public.benefit_contracts) = 0
     and (select count(*) from public.organization_admins) = 0, 'Bia não lê organizações, contratos nem quem administra';
  assert (select count(*) from public.plan_entitlements) = 1, 'Bia lê o próprio direito ao plano';
  perform pg_temp.expect_error($f$select code_hash from public.licenses$f$, 'permission denied%');
  perform pg_temp.expect_error($f$select person_id from public.licenses$f$, 'permission denied%');
  perform pg_temp.expect_error($f$select * from public.licenses$f$, 'permission denied%');
  -- Quem não tem licença não lê nada da empresa.
  foreach c in array array['caio', 'hugo', 'iris', 'otto', 'rita', 'ricardo'] loop
    perform pg_temp.as_(c);
    assert (select count(*) from public.my_benefit) = 0, 'sem licença ativa, a visão fica vazia: ' || c;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Contagens de licenças (M-1): só vagas, convidadas, ativas e encerradas; sem indicador de uso por pessoa (o último acesso saiu
-- depois da revisão de segurança de 16/10/2026); nada de finanças.
-- ---------------------------------------------------------------------------
do $$
declare
  u jsonb;
  c text;
begin
  perform pg_temp.as_('rita');
  u := public.organization_usage(pg_temp.id('alfa_o'));
  assert (select array_agg(k order by k collate "C") from jsonb_object_keys(u) k)
    = array['active', 'ended', 'invited', 'organization_id', 'seats'], 'só contagens de licenças: nada de pessoas, de acessos nem de uso';
  assert (u ->> 'seats')::int = 6 and (u ->> 'invited')::int = 5 and (u ->> 'active')::int = 1 and (u ->> 'ended')::int = 0
     and (u ->> 'organization_id')::uuid = pg_temp.id('alfa_o'), 'vagas 6, 5 convidadas, 1 ativa, 0 encerradas';
  -- Quem não administra a Alfa: nao_encontrado (inclusive o RH de outra empresa e quem tem licença dela).
  foreach c in array array['ricardo', 'hugo', 'iris', 'nando', 'otto', 'bia', 'gil'] loop
    perform pg_temp.as_(c);
    perform pg_temp.expect_code(format($f$select public.organization_usage(%L)$f$, pg_temp.id('alfa_o')), 'nao_encontrado', 'P0002');
  end loop;
  perform pg_temp.expect_code($f$select public.organization_usage(null)$f$, 'nao_encontrado', 'P0002');
  perform pg_temp.expect_code(format($f$select public.organization_usage(%L)$f$, gen_random_uuid()), 'nao_encontrado', 'P0002');
  perform set_config('request.jwt.claim.sub', '', true);
  perform pg_temp.expect_code(format($f$select public.organization_usage(%L)$f$, pg_temp.id('alfa_o')), 'nao_autenticado', '42501');
end $$;
reset role;
update auth.users set last_sign_in_at = '2026-10-05 12:00:00+00' where id = :bia;

-- Mais quatro pessoas aceitam (5 ativas). O último acesso de cada uma (auth.users.last_sign_in_at) não entra em número nenhum: a
-- resposta tem sempre as mesmas cinco chaves e os mesmos números, qualquer que seja o acesso e com qualquer quantidade de ativas.
set role authenticated;
do $$
declare
  n text;
begin
  foreach n in array array['caio', 'edu', 'fabi', 'gui'] loop
    perform pg_temp.as_(n);
    perform public.accept_license(pg_temp.code(n), 'em-acc-' || n);
    assert pg_temp.lst('lic_' || n) = 'ativa false false true', 'ativa: ' || n;
  end loop;
  perform pg_temp.as_('rita');
  assert (public.organization_usage(pg_temp.id('alfa_o')) ->> 'active')::int = 5, 'cinco pessoas ativas';
end $$;
reset role;
update auth.users set last_sign_in_at = '2026-10-01 01:00:00+00' where id = :caio;
update auth.users set last_sign_in_at = '2026-10-31 23:30:00-03' where id = :edu;
update auth.users set last_sign_in_at = '2026-11-01 01:00:00-03' where id = :fabi;
update auth.users set last_sign_in_at = null where id = :gui;
set role authenticated;
do $$
declare
  u jsonb;
begin
  perform pg_temp.as_('rita');
  u := public.organization_usage(pg_temp.id('alfa_o'));
  assert (select array_agg(k order by k collate "C") from jsonb_object_keys(u) k) = array['active', 'ended', 'invited', 'organization_id', 'seats']
     and (u ->> 'active')::int = 5 and (u ->> 'invited')::int = 1 and (u ->> 'ended')::int = 0 and (u ->> 'seats')::int = 6,
    'com 5 ativas e acessos de todo tipo (no mês, nas bordas do mês, fora dele e nenhum): as mesmas cinco chaves, só contagens; 1 convidada (Duda)';
  assert u::text !~* '(joined|usage|month|sign_in|entr)', 'a resposta não traz indicador de uso nem de acesso';
  -- Sofia, a outra pessoa do RH, lê os mesmos números.
  perform pg_temp.as_('sofia');
  assert public.organization_usage(pg_temp.id('alfa_o')) = u, 'a segunda pessoa do RH lê os mesmos números';
  -- A empresa Beta é outra: Ricardo lê só o que é da Beta.
  perform pg_temp.as_('ricardo');
  u := public.organization_usage(pg_temp.id('beta_o'));
  assert (u ->> 'seats')::int = 3 and (u ->> 'invited')::int = 2 and (u ->> 'active')::int = 0 and (u ->> 'ended')::int = 0
     and (select array_agg(k order by k collate "C") from jsonb_object_keys(u) k) = array['active', 'ended', 'invited', 'organization_id', 'seats'],
    'Beta: 3 vagas, 2 convidadas, nenhuma ativa';
end $$;

-- Uma pessoa só ativa por vez (E4): a Bia, com licença na Alfa, não aceita a da Beta.
do $$
declare
  r jsonb;
begin
  perform pg_temp.as_('bia');
  assert (public.preview_license_invite(pg_temp.code('bia2')) ->> 'organization_name') = 'Empresa Beta', 'a prévia da Beta funciona';
  perform pg_temp.expect_code(format($f$select public.accept_license(%L, 'em-acc-bia-beta')$f$, pg_temp.code('bia2')), 'ja_tem_licenca', 'PT409');
  assert pg_temp.lst('lic_bia2') = 'convidada true false false' and (select count(*) from public.plan_entitlements) = 1, 'a licença da Beta continua convidada';
  -- Otto aceita a da Beta (plano familiar).
  perform pg_temp.as_('otto');
  r := public.accept_license(pg_temp.code('otto'), 'em-acc-otto');
  assert r ->> 'plan' = 'familiar' and r ->> 'organization_name' = 'Empresa Beta' and r ->> 'status' = 'ativa', 'Otto: Beta, familiar';
  assert r ->> 'contract_ends_on' = '2027-12-31' and r ->> 'access_until' is not null, 'o contrato da Beta tem fim: o acesso pleno vai até o fim + 30 dias';
end $$;
reset role;
do $$ begin
  assert (select valid_until from public.plan_entitlements where license_id = pg_temp.id('lic_otto'))
    = ('2028-01-30 23:59:59'::timestamp at time zone 'America/Sao_Paulo'), 'fim do contrato (31/12/2027) + 30 dias, no fim do dia em São Paulo';
  perform pg_temp.expect_error(format($f$insert into public.licenses (contract_id, invited_email, person_id, status, activated_at)
    values (%L, 'bia-de-novo@exemplo.test', %L, 'ativa', now())$f$, pg_temp.id('beta_c'), pg_temp.id('bia')), '%licenses_one_active_per_person%');
  perform pg_temp.expect_error(format($f$insert into public.plan_entitlements (person_id, source, license_id, plan) values (%L, 'beneficio', %L, 'individual')$f$,
    pg_temp.id('bia'), pg_temp.id('lic_bia')), '%plan_entitlements_one_per_license%');
end $$;

-- ---------------------------------------------------------------------------
-- 6. Reenviar (novo link): o anterior deixa de valer.
-- ---------------------------------------------------------------------------
set role authenticated;
do $$
declare
  r jsonb;
  r2 jsonb;
  v_old text := pg_temp.code('duda');
  v_old_hash text := pg_temp.hash_of('lic_duda');
begin
  -- Quem não administra a empresa da licença recebe nao_encontrado (RH da Beta, pessoa comum, a própria pessoa convidada).
  perform pg_temp.as_('ricardo');
  perform pg_temp.expect_code(format($f$select public.renew_license_invite(%L, 'em-ren-nao1')$f$, pg_temp.id('lic_duda')), 'nao_encontrado', 'P0002');
  perform pg_temp.as_('duda');
  perform pg_temp.expect_code(format($f$select public.renew_license_invite(%L, 'em-ren-nao2')$f$, pg_temp.id('lic_duda')), 'nao_encontrado', 'P0002');
  perform pg_temp.expect_code(format($f$select public.renew_license_invite(%L, 'em-ren-nao3')$f$, gen_random_uuid()), 'nao_encontrado', 'P0002');
  perform pg_temp.as_('rita');
  -- Licença ativa não se reenvia.
  perform pg_temp.expect_code(format($f$select public.renew_license_invite(%L, 'em-ren-nao4')$f$, pg_temp.id('lic_bia')), 'licenca_nao_convidada', 'PT409');
  assert pg_temp.n_ops('renovar_convite_licenca') = 0, 'as recusas não gravam operação';

  r := public.renew_license_invite(pg_temp.id('lic_duda'), 'em-ren-0001');
  assert r ->> 'code' ~ '^[0-9a-f]{32}$' and r ->> 'code' <> v_old and r #>> '{license,status}' = 'convidada', 'código novo, diferente do anterior';
  insert into codes values ('duda_novo', r ->> 'code');
  assert pg_temp.hash_of('lic_duda') = encode(sha256(convert_to(r ->> 'code', 'UTF8')), 'hex') and pg_temp.hash_of('lic_duda') <> v_old_hash,
    'o resumo foi trocado pelo do código novo';
  assert not pg_temp.leaks(r ->> 'code') and not pg_temp.leaks(v_old), 'nem o código novo nem o antigo estão gravados';
  -- Repetir a chave: a licença sem o código.
  r2 := public.renew_license_invite(pg_temp.id('lic_duda'), 'em-ren-0001');
  assert r2 ->> 'code' is null and r2 -> 'license' = r -> 'license' and pg_temp.n_ops('renovar_convite_licenca') = 1, 'repetição: sem código novo, sem gravar de novo';
  assert pg_temp.hash_of('lic_duda') = encode(sha256(convert_to(r ->> 'code', 'UTF8')), 'hex'), 'a repetição não trocou o resumo outra vez';
  perform pg_temp.expect_code(format($f$select public.renew_license_invite(%L, 'em-ren-0001')$f$, pg_temp.id('lic_caio')), 'chave_reutilizada', 'PT409');
  -- Outra pessoa não repete a chave da Rita.
  perform pg_temp.as_('ricardo');
  perform pg_temp.expect_code(format($f$select public.renew_license_invite(%L, 'em-ren-0001')$f$, pg_temp.id('lic_duda')), 'nao_encontrado', 'P0002');
  -- O código antigo não vale mais, na prévia nem no aceite; o novo vale.
  perform pg_temp.as_('duda');
  assert pg_temp.err(format($f$select public.preview_license_invite(%L)$f$, v_old)) = 'convite_invalido|P0002||', 'prévia do link antigo: convite_invalido';
  assert pg_temp.err(format($f$select public.accept_license(%L, 'em-acc-duda-0')$f$, v_old)) = 'convite_invalido|P0002||', 'aceite do link antigo: convite_invalido';
  assert (public.preview_license_invite(pg_temp.code('duda_novo')) ->> 'organization_name') = 'Empresa Alfa', 'o link novo mostra a prévia';
  assert pg_temp.lst('lic_duda') = 'convidada true false false', 'a licença segue convidada';
end $$;

-- ---------------------------------------------------------------------------
-- 7. Cancelar convite: a linha fica (encerrada, com cancelled_at), a vaga volta, o código deixa de valer e o e-mail pode ser convidado de novo.
-- ---------------------------------------------------------------------------
do $$
declare
  r jsonb;
  v_in_use int;
begin
  perform pg_temp.as_('ricardo');
  perform pg_temp.expect_code(format($f$select public.cancel_license_invite(%L, 'em-can-nao1')$f$, pg_temp.id('lic_duda')), 'nao_encontrado', 'P0002');
  perform pg_temp.as_('duda');
  perform pg_temp.expect_code(format($f$select public.cancel_license_invite(%L, 'em-can-nao2')$f$, pg_temp.id('lic_duda')), 'nao_encontrado', 'P0002');
  perform pg_temp.as_('rita');
  -- Só convite: licença ativa não se cancela (encerra-se).
  perform pg_temp.expect_code(format($f$select public.cancel_license_invite(%L, 'em-can-nao3')$f$, pg_temp.id('lic_bia')), 'licenca_nao_convidada', 'PT409');
  v_in_use := (public.organization_usage(pg_temp.id('alfa_o')) ->> 'invited')::int + (public.organization_usage(pg_temp.id('alfa_o')) ->> 'active')::int;
  assert v_in_use = 6, 'seis vagas em uso antes de cancelar';

  r := public.cancel_license_invite(pg_temp.id('lic_duda'), 'em-can-0001');
  assert r #>> '{license,status}' = 'encerrada' and r #>> '{license,cancelled_at}' is not null and r #>> '{license,ended_at}' is null
     and r #>> '{license,activated_at}' is null, 'cancelada: encerrada com cancelled_at, sem ativação nem fim';
  assert pg_temp.lst('lic_duda') = 'encerrada false true false', 'sem resumo do código, sem pessoa';
  assert (public.organization_usage(pg_temp.id('alfa_o')) ->> 'invited')::int = 0 and (public.organization_usage(pg_temp.id('alfa_o')) ->> 'ended')::int = 0,
    'a vaga volta e o convite cancelado não conta como licença encerrada';
  -- Repetir a chave devolve o mesmo; outra chave sobre o convite já cancelado segue cancelado, sem erro.
  assert public.cancel_license_invite(pg_temp.id('lic_duda'), 'em-can-0001') = r, 'repetição devolve o mesmo resultado';
  assert public.cancel_license_invite(pg_temp.id('lic_duda'), 'em-can-0002') = r, 'cancelar de novo segue cancelado';
  -- O link (antigo ou novo) não vale mais.
  perform pg_temp.as_('duda');
  assert pg_temp.err(format($f$select public.preview_license_invite(%L)$f$, pg_temp.code('duda_novo'))) = 'convite_invalido|P0002||'
     and pg_temp.err(format($f$select public.accept_license(%L, 'em-acc-duda-1')$f$, pg_temp.code('duda_novo'))) = 'convite_invalido|P0002||', 'link cancelado: convite_invalido';
  -- Reenviar um convite cancelado não vale; convidar de novo cria outra licença (a antiga fica como história).
  perform pg_temp.as_('rita');
  perform pg_temp.expect_code(format($f$select public.renew_license_invite(%L, 'em-ren-nao5')$f$, pg_temp.id('lic_duda')), 'licenca_nao_convidada', 'PT409');
  r := pg_temp.inv('rita', 'alfa_c', array['duda@exemplo.test'], 'em-inv-0006');
  assert r -> 'results' -> 0 ->> 'outcome' = 'convidada' and (r ->> 'in_use')::int = 6 and pg_temp.id('lic_duda2') <> pg_temp.id('lic_duda'), 'convidar de novo cria uma licença nova';
  assert pg_temp.n_lic('alfa_c') = 7 and pg_temp.lst('lic_duda') = 'encerrada false true false' and pg_temp.lst('lic_duda2') = 'convidada true false false',
    'a antiga continua encerrada; a nova está convidada';
end $$;

-- ---------------------------------------------------------------------------
-- 8. Encerrar a licença (M-4): 30 dias de acesso pleno; conta, histórico e Família ficam como estão.
-- ---------------------------------------------------------------------------
reset role;
do $$ begin
  -- Antes: o rastro de Bia (o Pessoal e a Família que ela criou, a conta, o gasto e a conta a pagar).
  assert pg_temp.footprint('bia') = '2 2 2 1 1', 'Bia tem 2 contextos, 2 vínculos, 2 contas, 1 gasto e 1 conta a pagar';
end $$;
set role authenticated;
do $$
declare
  r jsonb;
  v_valid timestamptz;
begin
  perform pg_temp.as_('ricardo');
  perform pg_temp.expect_code(format($f$select public.end_license(%L, 'em-end-nao1')$f$, pg_temp.id('lic_bia')), 'nao_encontrado', 'P0002');
  perform pg_temp.as_('bia');
  perform pg_temp.expect_code(format($f$select public.end_license(%L, 'em-end-nao2')$f$, pg_temp.id('lic_bia')), 'nao_encontrado', 'P0002');
  perform pg_temp.as_('hugo');
  perform pg_temp.expect_code(format($f$select public.end_license(%L, 'em-end-nao3')$f$, pg_temp.id('lic_bia')), 'nao_encontrado', 'P0002');
  perform pg_temp.as_('rita');
  -- Só licença ativa: convidada não se encerra.
  perform pg_temp.expect_code(format($f$select public.end_license(%L, 'em-end-nao4')$f$, pg_temp.id('lic_duda2')), 'licenca_nao_ativa', 'PT409');
  perform pg_temp.expect_code(format($f$select public.end_license(%L, 'em-end-nao5')$f$, pg_temp.id('lic_duda')), 'licenca_nao_ativa', 'PT409');
  assert pg_temp.n_ops('encerrar_licenca') = 0, 'as recusas não gravam operação';

  r := public.end_license(pg_temp.id('lic_bia'), 'em-end-0001');
  assert r #>> '{license,status}' = 'encerrada' and r #>> '{license,ended_at}' is not null and r #>> '{license,activated_at}' is not null
     and r #>> '{license,cancelled_at}' is null, 'encerrada, com a data de fim e a de ativação';
  assert public.end_license(pg_temp.id('lic_bia'), 'em-end-0001') = r and pg_temp.n_ops('encerrar_licenca') = 1, 'repetir a chave devolve o mesmo resultado';
  perform pg_temp.expect_code(format($f$select public.end_license(%L, 'em-end-0002')$f$, pg_temp.id('lic_bia')), 'licenca_nao_ativa', 'PT409');
  perform pg_temp.expect_code(format($f$select public.end_license(%L, 'em-end-0001')$f$, pg_temp.id('lic_caio')), 'chave_reutilizada', 'PT409');
  v_valid := (select valid_until from public.plan_entitlements where license_id = pg_temp.id('lic_bia'));
  assert pg_temp.lst('lic_bia') = 'encerrada false false true', 'a pessoa continua registrada na licença encerrada';
  -- Quatro ativas (Caio, Edu, Fabi, Gui) e uma encerrada.
  r := public.organization_usage(pg_temp.id('alfa_o'));
  assert (r ->> 'active')::int = 4 and (r ->> 'ended')::int = 1 and (select count(*) from jsonb_object_keys(r)) = 5,
    'depois de encerrar: 4 ativas, 1 encerrada, só contagens';
end $$;
reset role;
do $$ begin
  assert (select valid_until = l.ended_at + interval '30 days' from public.plan_entitlements e join public.licenses l on l.id = e.license_id where l.id = pg_temp.id('lic_bia')),
    'o direito ao plano vale até o fim + 30 dias';
  assert (select source::text from public.plan_entitlements where license_id = pg_temp.id('lic_bia')) = 'beneficio', 'direito de origem benefício';
  assert pg_temp.footprint('bia') = '2 2 2 1 1', 'encerrar não apagou conta, histórico nem Família da Bia';
  assert (select count(*) from public.financial_contexts where id = pg_temp.id('bia_fam') and ended_at is null) = 1
     and (select count(*) from public.context_memberships where context_id = pg_temp.id('bia_fam') and person_id = pg_temp.id('bia') and revoked_at is null) = 1,
    'a Família da Bia continua ativa, com ela como titular';
end $$;
set role authenticated;
do $$
declare
  r jsonb;
begin
  -- Bia continua usando o app: lê o histórico, anota e vê o benefício encerrado com a data até quando vale o acesso pleno.
  perform pg_temp.as_('bia');
  assert (select count(*) from public.financial_records where description = 'Mercado da Bia') = 1, 'Bia continua lendo o histórico';
  perform public.create_record('em-bia-0004', pg_temp.id('bia_ctx'), pg_temp.id('bia_acc'), 'despesa', 100, '2026-10-06', 'Depois do fim do benefício');
  perform public.create_record('em-bia-0005', pg_temp.id('bia_fam'), (select id from public.financial_accounts where context_id = pg_temp.id('bia_fam') limit 1), 'despesa', 200, '2026-10-06', 'Na Família');
  r := (select to_jsonb(b) from public.my_benefit b);
  assert r ->> 'status' = 'encerrada' and (r ->> 'access_until')::timestamptz = (select valid_until from public.plan_entitlements where license_id = pg_temp.id('lic_bia'))
     and r ->> 'ended_at' is not null and r ->> 'organization_name' = 'Empresa Alfa', 'my_benefit: encerrada, com até quando vale o acesso pleno';
  assert (select count(*) from public.licenses where status = 'encerrada') = 1, 'Bia lê a própria licença encerrada';
  -- Com a licença encerrada, Bia pode receber outra (uma ativa por vez vale só para ativas).
  perform pg_temp.as_('rita');
  perform pg_temp.inv('rita', 'alfa_c', array['bia@exemplo.test'], 'em-inv-0007');
  perform pg_temp.as_('bia');
  r := public.accept_license(pg_temp.code('bia3'), 'em-acc-bia3');
  assert r ->> 'status' = 'ativa', 'depois de encerrada, uma licença nova pode ser aceita';
  assert (select count(*) from public.plan_entitlements where person_id = pg_temp.id('bia')) = 2, 'dois direitos: o encerrado e o novo';
end $$;
reset role;
do $$ begin
  assert (select count(*) from public.plan_entitlements e join public.licenses l on l.id = e.license_id
           where l.person_id = pg_temp.id('bia') and l.status = 'encerrada' and e.valid_until is not null) = 1, 'só o direito da licença encerrada tem fim';
end $$;

-- ---------------------------------------------------------------------------
-- 9. Fim do contrato: o acesso pleno das licenças ativas acompanha o fim do contrato (fim + 30 dias); sem vigência, nada de convite.
-- ---------------------------------------------------------------------------
do $$
declare
  r jsonb;
  v_bia_old timestamptz := (select valid_until from public.plan_entitlements where license_id = pg_temp.id('lic_bia'));
begin
  perform pg_temp.expect_code(format($f$select public.clarevo_staff_update_contract(%L, 3, null)$f$, pg_temp.id('alfa_c')), 'vagas_em_uso', 'PT409');
  perform pg_temp.expect_code(format($f$select public.clarevo_staff_update_contract(%L, 0, null)$f$, pg_temp.id('alfa_c')), 'vagas_invalidas', '22023');
  perform pg_temp.expect_code(format($f$select public.clarevo_staff_update_contract(%L, 6, '2026-09-30')$f$, pg_temp.id('alfa_c')), 'datas_invalidas', '22023');
  perform pg_temp.expect_code(format($f$select public.clarevo_staff_update_contract(%L, 6, null)$f$, gen_random_uuid()), 'contrato_nao_encontrado', 'P0002');
  assert (select seats from public.benefit_contracts where id = pg_temp.id('alfa_c')) = 6, 'as recusas não mudam o contrato';
  -- Mais vagas e fim em 06/10/2026 (antes de "hoje", 07/10/2026): o contrato sai da vigência.
  r := public.clarevo_staff_update_contract(pg_temp.id('alfa_c'), 8, '2026-10-06');
  assert (r ->> 'seats')::int = 8 and r ->> 'ends_on' = '2026-10-06' and (r ->> 'in_use')::int = 6, 'contrato atualizado';
  assert (select valid_until from public.plan_entitlements where license_id = pg_temp.id('lic_bia3')) = ('2026-11-05 23:59:59'::timestamp at time zone 'America/Sao_Paulo')
     and (select valid_until from public.plan_entitlements where license_id = pg_temp.id('lic_caio')) = ('2026-11-05 23:59:59'::timestamp at time zone 'America/Sao_Paulo'),
    'as licenças ativas passam a ter o acesso pleno até o fim do contrato + 30 dias';
  assert (select valid_until from public.plan_entitlements where license_id = pg_temp.id('lic_bia')) = v_bia_old, 'a licença já encerrada não muda';
end $$;
set role authenticated;
do $$
declare
  u jsonb;
begin
  perform pg_temp.as_('rita');
  perform pg_temp.expect_code(format($f$select public.invite_licenses(%L, array['hugo@exemplo.test'], 'em-inv-0008')$f$, pg_temp.id('alfa_c')), 'contrato_nao_vigente', 'PT409');
  perform pg_temp.expect_code(format($f$select public.renew_license_invite(%L, 'em-ren-0002')$f$, pg_temp.id('lic_duda2')), 'contrato_nao_vigente', 'PT409');
  perform pg_temp.as_('duda');
  assert pg_temp.err(format($f$select public.preview_license_invite(%L)$f$, pg_temp.code('duda2'))) = 'convite_invalido|P0002||'
     and pg_temp.err(format($f$select public.accept_license(%L, 'em-acc-duda-2')$f$, pg_temp.code('duda2'))) = 'convite_invalido|P0002||', 'convite vencido: convite_invalido';
  perform pg_temp.as_('rita');
  u := public.organization_usage(pg_temp.id('alfa_o'));
  assert (u ->> 'seats')::int = 0 and (u ->> 'active')::int = 5, 'sem contrato em vigor: 0 vagas; as licenças continuam contadas';
  -- Encerrar e cancelar continuam possíveis depois do fim do contrato.
  perform public.cancel_license_invite(pg_temp.id('lic_duda2'), 'em-can-0003');
end $$;
reset role;
do $$ begin
  perform public.clarevo_staff_update_contract(pg_temp.id('alfa_c'), 6, null);
  assert (select valid_until from public.plan_entitlements where license_id = pg_temp.id('lic_caio')) is null
     and (select valid_until from public.plan_entitlements where license_id = pg_temp.id('lic_bia3')) is null, 'sem fim: o acesso pleno das licenças ativas fica aberto de novo';
  assert (select valid_until from public.plan_entitlements where license_id = pg_temp.id('lic_otto')) is not null, 'a licença de outro contrato não muda';
end $$;

-- ---------------------------------------------------------------------------
-- 9a. Contrato terminado não prende a pessoa (E7): a licença ativa de um contrato que já acabou é encerrada, no fim do contrato, quando a
-- pessoa aceita o convite de outra empresa; o direito ao plano dela segue a regra dos 30 dias, contados do fim do contrato.
-- Empresa Antiga (contrato até 31/12/2026, individual) e Empresa Nova (sem fim, familiar); RH das duas: Gil. Hoje: 07/10/2026; depois, 10/01/2027.
-- ---------------------------------------------------------------------------
do $$
declare
  r jsonb;
begin
  r := public.clarevo_staff_create_organization('Empresa Antiga', 3, 'individual', '2026-08-01', '2026-12-31', 'gil@gama.test');
  insert into ids values ('antiga_o', (r ->> 'organization_id')::uuid), ('antiga_c', (r ->> 'contract_id')::uuid);
  r := public.clarevo_staff_create_organization('Empresa Nova', 5, 'familiar', '2026-08-01', null, 'gil@gama.test');
  insert into ids values ('nova_o', (r ->> 'organization_id')::uuid), ('nova_c', (r ->> 'contract_id')::uuid);
end $$;
set role authenticated;
do $$
begin
  -- Tito e Lia recebem a licença da Antiga (em vigor hoje) e também um convite da Nova, que ainda não aceitam.
  perform pg_temp.inv('gil', 'antiga_c', array['tito@exemplo.test', 'lia@exemplo.test'], 'em-ant-0001');
  perform pg_temp.inv('gil', 'nova_c', array['tito@exemplo.test', 'lia@exemplo.test', 'nilo@exemplo.test'], 'em-nov-0001');
  perform pg_temp.as_('tito');
  perform public.accept_license(pg_temp.code('tito'), 'em-acc-tito-1');
  perform pg_temp.as_('lia');
  perform public.accept_license(pg_temp.code('lia'), 'em-acc-lia-1');
  assert pg_temp.lst('lic_tito') = 'ativa false false true' and pg_temp.lst('lic_lia') = 'ativa false false true', 'Tito e Lia: licença ativa da Antiga';
  -- Uma só licença ativa por pessoa continua valendo enquanto o contrato está em vigor.
  perform pg_temp.as_('tito');
  perform pg_temp.expect_code(format($f$select public.accept_license(%L, 'em-acc-tito-0')$f$, pg_temp.code('tito2')), 'ja_tem_licenca', 'PT409');
end $$;
reset role;
do $$ begin
  -- O acesso pleno da licença da Antiga vai até o fim do contrato + 30 dias (30/01/2027, 23:59:59 em São Paulo).
  assert (select valid_until from public.plan_entitlements where license_id = pg_temp.id('lic_tito')) = ('2027-01-30 23:59:59'::timestamp at time zone 'America/Sao_Paulo'),
    'o direito de Tito vale até o fim do contrato + 30 dias';
  -- O backend zera o fim do acesso da Lia (o contrato ganhou o fim fora da função da equipe): a regra dos 30 dias vale do mesmo jeito.
  update public.plan_entitlements set valid_until = null where license_id = pg_temp.id('lic_lia');
  perform set_config('test.tito_footprint', pg_temp.footprint('tito'), true);
end $$;

-- O tempo passa: 10/01/2027. A Antiga terminou em 31/12/2026; a Nova segue em vigor.
set local clarevo.today = '2027-01-10';
set role authenticated;
do $$
declare
  r jsonb;
  v_end timestamptz := '2026-12-31 23:59:59'::timestamp at time zone 'America/Sao_Paulo';
  v_access timestamptz := '2027-01-30 23:59:59'::timestamp at time zone 'America/Sao_Paulo';
begin
  -- Antes de aceitar: na tabela a licença ainda é "ativa", mas quem a recebe a lê como encerrada, com o fim do contrato.
  perform pg_temp.as_('tito');
  assert (select count(*) from public.my_benefit) = 1
     and (select (organization_name, status, ended_at, access_until, contract_ends_on) from public.my_benefit)
       = ('Empresa Antiga'::text, 'encerrada'::text, v_end, v_access, '2026-12-31'::date), 'my_benefit: contrato terminado, licença encerrada no fim do contrato';
  perform pg_temp.as_('lia');
  assert (select (status, ended_at, access_until is null) from public.my_benefit) = ('encerrada'::text, v_end, true), 'Lia: o mesmo, sem fim do acesso gravado';
  assert pg_temp.lst('lic_tito') = 'ativa false false true', 'na tabela, a licença só é encerrada quando a pessoa aceita outra';
  -- A empresa vê a situação gravada: sem vaga em vigor, e as licenças ainda ativas contadas.
  perform pg_temp.as_('gil');
  r := public.organization_usage(pg_temp.id('antiga_o'));
  assert (r ->> 'seats')::int = 0 and (r ->> 'active')::int = 2 and (r ->> 'ended')::int = 0, 'Antiga: 0 vagas em vigor, 2 ativas gravadas';
  -- Um aceite que falha não encerra nada (a mesma transação desfaz tudo): código de outra pessoa.
  perform pg_temp.as_('lia');
  assert pg_temp.err(format($f$select public.accept_license(%L, 'em-acc-lia-0')$f$, pg_temp.code('tito2'))) = 'convite_invalido|P0002||', 'código de outra pessoa: convite_invalido';
  assert pg_temp.lst('lic_lia') = 'ativa false false true', 'o aceite recusado não encerrou a licença da Antiga';

  -- Tito aceita o convite da Nova: antes era ja_tem_licenca, e agora a licença da Antiga se encerra no fim do contrato.
  perform pg_temp.as_('tito');
  r := public.accept_license(pg_temp.code('tito2'), 'em-acc-tito-2');
  assert r ->> 'status' = 'ativa' and r ->> 'organization_name' = 'Empresa Nova' and r ->> 'plan' = 'familiar' and r ->> 'ended_at' is null
     and r ->> 'access_until' is null, 'Tito: licença ativa da Nova (familiar, sem fim)';
  assert public.accept_license(pg_temp.code('tito2'), 'em-acc-tito-2') = r, 'repetir a chave devolve o mesmo resultado';
  perform pg_temp.as_('lia');
  perform public.accept_license(pg_temp.code('lia2'), 'em-acc-lia-2');
  -- Quem recebe lê os dois benefícios: o da Antiga, encerrado no fim do contrato, e o da Nova, ativo.
  perform pg_temp.as_('tito');
  assert (select count(*) from public.my_benefit) = 2
     and (select (status, ended_at, access_until) from public.my_benefit where organization_name = 'Empresa Antiga') = ('encerrada'::text, v_end, v_access)
     and (select (status, ended_at is null, access_until is null) from public.my_benefit where organization_name = 'Empresa Nova') = ('ativa'::text, true, true),
    'Tito lê os dois benefícios';
  -- A empresa vê o mesmo que a tabela guarda agora: nenhuma ativa na Antiga, duas encerradas; a Nova tem duas ativas e uma convidada.
  perform pg_temp.as_('gil');
  r := public.organization_usage(pg_temp.id('antiga_o'));
  assert (r ->> 'active')::int = 0 and (r ->> 'ended')::int = 2, 'Antiga: 0 ativas, 2 encerradas';
  r := public.organization_usage(pg_temp.id('nova_o'));
  assert (r ->> 'seats')::int = 5 and (r ->> 'active')::int = 2 and (r ->> 'invited')::int = 1 and (r ->> 'ended')::int = 0, 'Nova: 5 vagas, 2 ativas, 1 convidada';
end $$;
reset role;
do $$
declare
  v_end timestamptz := '2026-12-31 23:59:59'::timestamp at time zone 'America/Sao_Paulo';
  v_access timestamptz := '2027-01-30 23:59:59'::timestamp at time zone 'America/Sao_Paulo';
  n text;
begin
  foreach n in array array['tito', 'lia'] loop
    assert pg_temp.lst('lic_' || n) = 'encerrada false false true', 'licença da Antiga encerrada, com a pessoa e sem resumo de código: ' || n;
    assert (select ended_at from public.licenses where id = pg_temp.id('lic_' || n)) = v_end, 'ended_at é o fim do contrato (31/12/2026, 23:59:59 em São Paulo): ' || n;
    assert (select valid_until from public.plan_entitlements where license_id = pg_temp.id('lic_' || n)) = v_access
       and v_access = v_end + interval '30 days', 'o direito ao plano vale o fim do contrato + 30 dias (também quando o fim estava em branco): ' || n;
    assert pg_temp.lst('lic_' || n || '2') = 'ativa false false true'
       and (select (plan, valid_until is null, source::text) from public.plan_entitlements where license_id = pg_temp.id('lic_' || n || '2')) = ('familiar'::text, true, 'beneficio'::text),
      'a licença da Nova ficou ativa, com o direito de origem benefício: ' || n;
    assert (select count(*) from public.licenses where person_id = pg_temp.id(n) and status = 'ativa') = 1, 'uma licença ativa por pessoa: ' || n;
  end loop;
  assert pg_temp.footprint('tito') = current_setting('test.tito_footprint'), 'encerrar pelo contrato não apagou conta, histórico nem Família de Tito';
end $$;
set local clarevo.today = '2026-10-07';

-- ---------------------------------------------------------------------------
-- 9b. Apagar a conta de quem já teve licença (E8): a licença encerrada aceita só person_id passar a nulo (o `on delete set null` da
-- fundação). Nilo aceita a licença da Nova e o RH a encerra; ao apagar a conta (primeiro o espaço pessoal), a licença fica como
-- história da empresa, sem pessoa e com o resto igual. Licença ativa segue exigindo pessoa: a empresa encerra antes.
-- ---------------------------------------------------------------------------
create function pg_temp.drop_account(p_person text) returns void language plpgsql as $$
begin
  delete from public.financial_contexts where owner_person_id = pg_temp.id(p_person);
  delete from auth.users where id = pg_temp.id(p_person);
end $$;
set role authenticated;
do $$
declare
  r jsonb;
begin
  perform pg_temp.as_('nilo');
  perform public.accept_license(pg_temp.code('nilo'), 'em-acc-nilo-1');
  perform pg_temp.as_('gil');
  r := public.end_license(pg_temp.id('lic_nilo'), 'em-end-nilo');
  assert r #>> '{license,status}' = 'encerrada', 'a empresa encerrou a licença do Nilo';
  assert (public.organization_usage(pg_temp.id('nova_o')) ->> 'ended')::int = 1, 'Nova: 1 encerrada';
end $$;
reset role;
create temp table lic_before as select * from public.licenses where id = pg_temp.id('lic_nilo');
do $$
begin
  assert (select person_id from lic_before) = pg_temp.id('nilo') and (select status from lic_before) = 'encerrada', 'antes: encerrada, ainda com a pessoa';
  -- Licença ativa: a guarda segue recusando anular a pessoa direto (o backend não deixa a licença ativa sem pessoa). Desde a 0015 (D-058),
  -- quem tem licença ativa apaga a conta pelo caminho certo (delete_my_account, ou o gatilho de auth.users) e a licença termina no
  -- ato; isso é testado a fundo em 99_exclusao.sql. Aqui, o que a 0014 garantia continua: nada anula a pessoa de uma licença ativa.
  perform pg_temp.expect_code(format($f$update public.licenses set person_id = null where person_id = %L and status = 'ativa'$f$, pg_temp.id('tito')), 'campo_imutavel', '42501');
  assert exists (select 1 from auth.users where id = pg_temp.id('tito')) and exists (select 1 from public.financial_contexts where owner_person_id = pg_temp.id('tito'))
     and exists (select 1 from public.licenses where person_id = pg_temp.id('tito') and status = 'ativa'),
    'a recusa não mexeu na conta nem na licença ativa de Tito';
  -- Licença encerrada: apagar a conta funciona.
  perform pg_temp.drop_account('nilo');
  assert not exists (select 1 from auth.users where id = pg_temp.id('nilo')) and not exists (select 1 from public.persons where id = pg_temp.id('nilo')), 'a conta do Nilo foi apagada';
  assert (select count(*) from public.licenses where id = pg_temp.id('lic_nilo')) = 1, 'a licença continua como história da empresa';
  assert (select person_id from public.licenses where id = pg_temp.id('lic_nilo')) is null, 'a licença ficou com person_id nulo';
  assert (select (l.contract_id, l.invited_email, l.status::text, l.created_at, l.invited_at, l.activated_at, l.ended_at, l.cancelled_at, l.code_hash)
            from public.licenses l where l.id = pg_temp.id('lic_nilo'))
       = (select (b.contract_id, b.invited_email, b.status::text, b.created_at, b.invited_at, b.activated_at, b.ended_at, b.cancelled_at, b.code_hash) from lic_before b),
    'o resto da linha não mudou';
  assert not exists (select 1 from public.plan_entitlements where license_id = pg_temp.id('lic_nilo')), 'o direito ao plano da pessoa saiu com a conta';
  assert not exists (select 1 from public.record_operations where actor_id = pg_temp.id('nilo')), 'as operações da pessoa saíram com a conta';
  assert pg_temp.lst('lic_nilo') = 'encerrada false false false', 'encerrada, sem pessoa, sem resumo do código';
  -- A licença sem pessoa não muda mais: nada entra de volta.
  perform pg_temp.expect_code(format($f$update public.licenses set person_id = %L where id = %L$f$, pg_temp.id('hugo'), pg_temp.id('lic_nilo')), 'campo_imutavel', '42501');
  perform pg_temp.expect_code(format($f$update public.licenses set status = 'ativa', ended_at = null where id = %L$f$, pg_temp.id('lic_nilo')), 'campo_imutavel', '42501');
end $$;
set role authenticated;
do $$
begin
  -- A empresa continua contando a licença encerrada e não vê quem foi (nem que a conta foi apagada).
  perform pg_temp.as_('gil');
  assert (public.organization_usage(pg_temp.id('nova_o')) ->> 'ended')::int = 1 and (public.organization_usage(pg_temp.id('nova_o')) ->> 'active')::int = 2, 'Nova: 1 encerrada, 2 ativas';
  assert (select count(*) from public.licenses where status = 'encerrada' and contract_id = pg_temp.id('nova_c')) = 1, 'o RH ainda lê a licença encerrada';
end $$;
reset role;
drop table lic_before;

-- ---------------------------------------------------------------------------
-- 10. A empresa não lê finanças, Família, contas nem atividade de ninguém, e ninguém grava licença direto.
-- ---------------------------------------------------------------------------
set role authenticated;
do $$
declare
  c text;
begin
  -- Rita (RH): só a licença do próprio contrato; nenhuma finança, conta, meta, cartão, Família, vínculo ou atividade de outra pessoa.
  perform pg_temp.as_('rita');
  assert (select count(*) from public.licenses) = 8 and (select count(*) from public.benefit_contracts) = 1 and (select count(*) from public.organizations) = 1,
    'Rita lê as licenças do contrato da Alfa, o contrato e a organização';
  assert (select count(*) from public.financial_records) = 0 and (select count(*) from public.commitments) = 0
     and (select count(*) from public.commitment_items) = 0 and (select count(*) from public.commitment_series) = 0
     and (select count(*) from public.goals) = 0 and (select count(*) from public.cards) = 0 and (select count(*) from public.income_references) = 0
     and (select count(*) from public.category_budgets) = 0 and (select count(*) from public.import_items) = 0
     and (select count(*) from public.family_invites) = 0 and (select count(*) from public.family_member_items) = 0
     and (select count(*) from public.context_activity) = 0 and (select count(*) from public.return_reviews) = 0 and (select count(*) from public.savings_checks) = 0,
    'Rita não lê nenhuma finança, meta, cartão, orçamento, Família nem atividade (nem os dela, que não existem)';
  assert (select count(*) from public.financial_contexts) = 1 and (select count(*) from public.context_memberships) = 1
     and (select count(*) from public.financial_accounts) = 1 and (select count(*) from public.persons) = 1, 'Rita lê só o próprio Pessoal e a própria linha em persons';
  assert (select count(*) from public.plan_entitlements) = 0, 'Rita não lê direitos ao plano de ninguém';
  assert (select count(*) from public.record_operations where actor_id <> auth.uid()) = 0, 'Rita não lê operações de outras pessoas';
  assert not has_column_privilege('authenticated', 'public.licenses', 'code_hash', 'select')
     and not has_column_privilege('authenticated', 'public.licenses', 'person_id', 'select'), 'o resumo do código e a pessoa não são legíveis';
  perform pg_temp.expect_error($f$select code_hash from public.licenses$f$, 'permission denied%');
  perform pg_temp.expect_error($f$select person_id from public.licenses$f$, 'permission denied%');
  perform pg_temp.expect_error($f$select count(*) from public.licenses where person_id is not null$f$, 'permission denied%');
  -- Escrita direta é recusada para o RH: licenças, contrato, organização, quem administra, direitos e operações.
  perform pg_temp.expect_error(format($f$insert into public.licenses (contract_id, invited_email) values (%L, 'direto@exemplo.test')$f$, pg_temp.id('alfa_c')), 'permission denied%');
  perform pg_temp.expect_error($f$update public.licenses set status = 'encerrada'$f$, 'permission denied%');
  perform pg_temp.expect_error($f$update public.licenses set invited_email = 'outro@exemplo.test'$f$, 'permission denied%');
  perform pg_temp.expect_error($f$update public.licenses set code_hash = repeat('a', 64)$f$, 'permission denied%');
  perform pg_temp.expect_error($f$delete from public.licenses$f$, 'permission denied%');
  perform pg_temp.expect_error($f$update public.benefit_contracts set seats = 100000$f$, 'permission denied%');
  perform pg_temp.expect_error($f$update public.benefit_contracts set ends_on = null$f$, 'permission denied%');
  perform pg_temp.expect_error(format($f$insert into public.benefit_contracts (organization_id, seats, plan, starts_on) values (%L, 5, 'individual', '2026-10-01')$f$, pg_temp.id('alfa_o')), 'permission denied%');
  perform pg_temp.expect_error($f$update public.organizations set name = 'Outro nome'$f$, 'permission denied%');
  perform pg_temp.expect_error($f$insert into public.organizations (name) values ('Direta')$f$, 'permission denied%');
  perform pg_temp.expect_error(format($f$insert into public.organization_admins values (%L, %L)$f$, pg_temp.id('alfa_o'), pg_temp.id('hugo')), 'permission denied%');
  perform pg_temp.expect_error($f$delete from public.organization_admins$f$, 'permission denied%');
  perform pg_temp.expect_error(format($f$insert into public.plan_entitlements (person_id, source, license_id, plan) values (%L, 'cortesia', null, 'familiar')$f$, pg_temp.id('rita')), 'permission denied%');
  perform pg_temp.expect_error($f$update public.plan_entitlements set valid_until = null$f$, 'permission denied%');
  perform pg_temp.expect_error($f$insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, target_id)
    values (auth.uid(), 'em-direto-01', 'aceitar_licenca', null, 'x', gen_random_uuid())$f$, 'permission denied%');
  -- Não lê o Pessoal de ninguém por nenhuma função da empresa: as funções da empresa não aceitam contexto.
  assert not exists (select 1 from public.licenses where invited_email in ('rita@alfa.test')), 'o RH não é licenciado de si mesmo por acaso';

  -- Pessoa comum, Família (titular e membro) e externo: nada da empresa.
  foreach c in array array['hugo', 'iris', 'nando', 'otto', 'ricardo'] loop
    perform pg_temp.as_(c);
    assert (select count(*) from public.licenses where invited_email like '%@alfa.test') = 0
       and (select count(*) from public.licenses where contract_id = pg_temp.id('alfa_c')) = 0, c || ' não lê as licenças da Alfa';
    assert (select count(*) from public.organizations where id = pg_temp.id('alfa_o')) = 0
       and (select count(*) from public.benefit_contracts where id = pg_temp.id('alfa_c')) = 0
       and (select count(*) from public.organization_admins where organization_id = pg_temp.id('alfa_o')) = 0, c || ' não lê a organização, o contrato nem quem administra';
  end loop;
  perform pg_temp.as_('ricardo');
  assert (select count(*) from public.licenses) = 2 and (select count(*) from public.organizations) = 1 and (select name from public.organizations) = 'Empresa Beta',
    'Ricardo lê só a Beta (2 licenças)';
  -- A visão my_benefit é de cada pessoa: Ricardo (RH, sem licença) não vê nada.
  assert (select count(*) from public.my_benefit) = 0, 'o RH da Beta não vê o benefício de ninguém';
  -- Otto (licença da Beta) lê só o benefício dele, sem ler a organização por tabela.
  perform pg_temp.as_('otto');
  assert (select count(*) from public.my_benefit) = 1 and (select organization_name from public.my_benefit) = 'Empresa Beta'
     and (select count(*) from public.organizations) = 0 and (select count(*) from public.benefit_contracts) = 0, 'Otto lê só o próprio benefício';
  -- Outra organização: Rita não mexe na Beta.
  perform pg_temp.as_('rita');
  perform pg_temp.expect_code(format($f$select public.cancel_license_invite(%L, 'em-rit-b1')$f$, pg_temp.id('lic_bia2')), 'nao_encontrado', 'P0002');
  perform pg_temp.expect_code(format($f$select public.renew_license_invite(%L, 'em-rit-b2')$f$, pg_temp.id('lic_bia2')), 'nao_encontrado', 'P0002');
  perform pg_temp.expect_code(format($f$select public.end_license(%L, 'em-rit-b3')$f$, pg_temp.id('lic_otto')), 'nao_encontrado', 'P0002');
  perform pg_temp.expect_code(format($f$select public.organization_usage(%L)$f$, pg_temp.id('beta_o')), 'nao_encontrado', 'P0002');
end $$;
reset role;
do $$ begin
  assert pg_temp.lst('lic_otto') = 'ativa false false true' and pg_temp.lst('lic_bia2') = 'convidada true false false', 'a Beta ficou como estava';
end $$;

-- Papel anônimo: sem acesso a tabelas, visões nem funções da empresa.
set role anon;
select pg_temp.expect_error($f$select count(*) from public.licenses$f$, 'permission denied%');
select pg_temp.expect_error($f$select count(*) from public.organizations$f$, 'permission denied%');
select pg_temp.expect_error($f$select count(*) from public.benefit_contracts$f$, 'permission denied%');
select pg_temp.expect_error($f$select count(*) from public.plan_entitlements$f$, 'permission denied%');
select pg_temp.expect_error($f$select count(*) from public.my_benefit$f$, 'permission denied%');
select pg_temp.expect_error($f$select public.invite_licenses(gen_random_uuid(), array['x@exemplo.test'], 'em-anon-0001')$f$, 'permission denied%');
select pg_temp.expect_error($f$select public.renew_license_invite(gen_random_uuid(), 'em-anon-0002')$f$, 'permission denied%');
select pg_temp.expect_error($f$select public.cancel_license_invite(gen_random_uuid(), 'em-anon-0003')$f$, 'permission denied%');
select pg_temp.expect_error($f$select public.end_license(gen_random_uuid(), 'em-anon-0004')$f$, 'permission denied%');
select pg_temp.expect_error($f$select public.preview_license_invite('00000000000000000000000000000000')$f$, 'permission denied%');
select pg_temp.expect_error($f$select public.accept_license('00000000000000000000000000000000', 'em-anon-0005')$f$, 'permission denied%');
select pg_temp.expect_error($f$select public.organization_usage(gen_random_uuid())$f$, 'permission denied%');
select pg_temp.expect_error($f$insert into public.licenses (contract_id, invited_email) values (gen_random_uuid(), 'anon@exemplo.test')$f$, 'permission denied%');
reset role;

-- ---------------------------------------------------------------------------
-- 11. record_operations: as cinco ações não têm contexto financeiro, apontam para o contrato ou a licença e não contam como anotação.
-- ---------------------------------------------------------------------------
do $$
declare
  v_ctx uuid := pg_temp.id('rita_ctx');
begin
  assert (select array_agg(distinct action order by action) from public.record_operations
           where action in ('convidar_licencas', 'renovar_convite_licenca', 'cancelar_convite_licenca', 'encerrar_licenca', 'aceitar_licenca'))
    = array['aceitar_licenca', 'cancelar_convite_licenca', 'convidar_licencas', 'encerrar_licenca', 'renovar_convite_licenca'], 'as cinco ações foram gravadas';
  assert not exists (select 1 from public.record_operations
                      where action in ('convidar_licencas', 'renovar_convite_licenca', 'cancelar_convite_licenca', 'encerrar_licenca', 'aceitar_licenca')
                        and (context_id is not null or record_id is not null or commitment_id is not null or target_id is null)),
    'sem contexto, registro nem conta a pagar; sempre com o alvo';
  assert not exists (select 1 from public.record_operations where action = 'convidar_licencas' and not exists (select 1 from public.benefit_contracts c where c.id = target_id))
     and not exists (select 1 from public.record_operations where action in ('renovar_convite_licenca', 'cancelar_convite_licenca', 'encerrar_licenca', 'aceitar_licenca')
                       and not exists (select 1 from public.licenses l where l.id = target_id)), 'o alvo é o contrato (convidar) ou a licença (as outras)';
  assert (select count(*) from public.record_operations where license_result is not null) = (select count(*) from public.record_operations where action = 'convidar_licencas'),
    'o resultado do lote só existe em convidar_licencas';
  -- Atividade (D-030): administrar o benefício e aceitar a licença não são anotação.
  assert not exists (select 1 from public.context_activity where person_id in (pg_temp.id('rita'), pg_temp.id('sofia'), pg_temp.id('ricardo'))), 'o RH não tem atividade';
  assert (select count(*) from public.context_activity where person_id = pg_temp.id('caio')) = 0 and not exists (select 1 from public.context_activity where context_id is null),
    'aceitar a licença não cria atividade';
  -- A consistência das restrições, mesmo para o backend.
  perform pg_temp.expect_error(format($f$insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, target_id)
    values (%L, 'em-op-0001', 'aceitar_licenca', %L, 'x', gen_random_uuid())$f$, pg_temp.id('rita'), v_ctx), '%record_operations_context_check%');
  perform pg_temp.expect_error(format($f$insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, target_id)
    values (%L, 'em-op-0002', 'encerrar_licenca', null, 'x', null)$f$, pg_temp.id('rita')), '%record_operations_target_check%');
  perform pg_temp.expect_error(format($f$insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id)
    values (%L, 'em-op-0003', 'criar', null, 'x', gen_random_uuid())$f$, pg_temp.id('rita')), '%record_operations_context_check%');
  perform pg_temp.expect_error(format($f$insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, target_id)
    values (%L, 'em-op-0004', 'convidar_licencas', null, 'x', gen_random_uuid())$f$, pg_temp.id('rita')), '%record_operations_license_check%');
  perform pg_temp.expect_error(format($f$insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, target_id, license_result)
    values (%L, 'em-op-0005', 'encerrar_licenca', null, 'x', gen_random_uuid(), '[]')$f$, pg_temp.id('rita')), '%record_operations_license_check%');
  perform pg_temp.expect_error(format($f$insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, target_id)
    values (%L, 'em-op-0006', 'cancelar_convite', null, 'x', gen_random_uuid())$f$, pg_temp.id('rita')), '%record_operations_action_check%');
end $$;

-- ---------------------------------------------------------------------------
-- 12. Defesas do backend: a licença só anda para frente e uma encerrada não muda mais.
-- ---------------------------------------------------------------------------
do $$ begin
  perform pg_temp.expect_code(format($f$update public.licenses set invited_email = 'outro@exemplo.test' where id = %L$f$, pg_temp.id('lic_gui')), 'campo_imutavel', '42501');
  perform pg_temp.expect_code(format($f$update public.licenses set contract_id = %L where id = %L$f$, pg_temp.id('beta_c'), pg_temp.id('lic_gui')), 'campo_imutavel', '42501');
  perform pg_temp.expect_code(format($f$update public.licenses set status = 'convidada', ended_at = null where id = %L$f$, pg_temp.id('lic_gui')), 'campo_imutavel', '42501');
  perform pg_temp.expect_code(format($f$update public.licenses set code_hash = repeat('b', 64) where id = %L$f$, pg_temp.id('lic_gui')), 'campo_imutavel', '42501');
  perform pg_temp.expect_code(format($f$update public.licenses set person_id = %L where id = %L$f$, pg_temp.id('hugo'), pg_temp.id('lic_gui')), 'campo_imutavel', '42501');
  perform pg_temp.expect_code(format($f$update public.licenses set status = 'encerrada' where id = %L$f$, pg_temp.id('lic_gui')), 'campo_imutavel', '42501');
  perform pg_temp.expect_code(format($f$update public.licenses set status = 'ativa', ended_at = now() where id = %L$f$, pg_temp.id('lic_gui')), 'campo_imutavel', '42501');
  -- Encerrada: nada muda.
  perform pg_temp.expect_code(format($f$update public.licenses set status = 'ativa', ended_at = null where id = %L$f$, pg_temp.id('lic_bia')), 'campo_imutavel', '42501');
  perform pg_temp.expect_code(format($f$update public.licenses set ended_at = now() + interval '1 day' where id = %L$f$, pg_temp.id('lic_bia')), 'campo_imutavel', '42501');
  perform pg_temp.expect_code(format($f$update public.licenses set status = 'convidada', ended_at = null, activated_at = null, person_id = null where id = %L$f$, pg_temp.id('lic_duda')), 'campo_imutavel', '42501');
  -- A única mudança aceita numa licença encerrada é person_id passar a nulo (conta apagada, seção 9b), com o resto igual: trocar a
  -- pessoa, anular junto com outra mudança ou anular a pessoa de uma licença ativa continua recusado.
  perform pg_temp.expect_code(format($f$update public.licenses set person_id = %L where id = %L$f$, pg_temp.id('hugo'), pg_temp.id('lic_bia')), 'campo_imutavel', '42501');
  perform pg_temp.expect_code(format($f$update public.licenses set person_id = null, ended_at = ended_at + interval '1 day' where id = %L$f$, pg_temp.id('lic_bia')), 'campo_imutavel', '42501');
  perform pg_temp.expect_code(format($f$update public.licenses set person_id = null, activated_at = null where id = %L$f$, pg_temp.id('lic_bia')), 'campo_imutavel', '42501');
  perform pg_temp.expect_code(format($f$update public.licenses set person_id = null where id = %L$f$, pg_temp.id('lic_gui')), 'campo_imutavel', '42501');
  -- Convidada: o aceite exige pessoa, data e o resumo zerado; o cancelamento exige a data e o resumo zerado.
  perform pg_temp.expect_code(format($f$update public.licenses set status = 'ativa' where id = %L$f$, pg_temp.id('lic_bia2')), 'campo_imutavel', '42501');
  perform pg_temp.expect_code(format($f$update public.licenses set status = 'encerrada', code_hash = null where id = %L$f$, pg_temp.id('lic_bia2')), 'campo_imutavel', '42501');
  perform pg_temp.expect_error(format($f$update public.licenses set code_hash = 'curto' where id = %L$f$, pg_temp.id('lic_bia2')), '%licenses_code_hash_check%');
  perform pg_temp.expect_code(format($f$update public.licenses set cancelled_at = now() where id = %L$f$, pg_temp.id('lic_gui')), 'campo_imutavel', '42501');
  assert pg_temp.lst('lic_gui') = 'ativa false false true' and pg_temp.lst('lic_bia') = 'encerrada false false true', 'nada mudou com as recusas';
end $$;

-- ---------------------------------------------------------------------------
-- 13. Nenhuma função nem visão nova lê dados financeiros; privilégios das funções e das tabelas da empresa.
-- ---------------------------------------------------------------------------
do $$
declare
  f text;
  v_def text;
  v_fin text := '\m(financial_records|financial_accounts|financial_contexts|context_memberships|commitments|commitment_items|commitment_series|series_terms|series_items|goals|goal_movements|goal_items|cards|card_entries|card_items|invoice_items|card_entry_items|income_references|category_budgets|commitment_limits|savings_checks|context_activity|return_reviews|family_invites|family_member_items|import_items|receipt_items)\M';
begin
  foreach f in array array['invite_licenses(uuid, text[], text)', 'renew_license_invite(uuid, text)', 'cancel_license_invite(uuid, text)', 'end_license(uuid, text)',
                           'preview_license_invite(text)', 'accept_license(text, text)', 'organization_usage(uuid)',
                           'clarevo_staff_find_admin(text)', 'clarevo_staff_create_organization(text, integer, text, date, date, text)',
                           'clarevo_staff_add_org_admin(uuid, text)', 'clarevo_staff_update_contract(uuid, integer, date)',
                           'clarevo_normalize_email(text)', 'clarevo_email_valid(text)', 'clarevo_contract_open(uuid, date)',
                           'clarevo_contract_access_until(date)', 'clarevo_contract_ended_at(date)', 'clarevo_contract_used(uuid)', 'clarevo_license_json(uuid)',
                           'clarevo_benefit_json(uuid)', 'clarevo_require_contract_admin(uuid)', 'clarevo_session_email()',
                           'licenses_guard()', 'licenses_seats_guard()', 'benefit_contracts_guard()'] loop
    v_def := pg_get_functiondef(('public.' || f)::regprocedure);
    assert v_def !~* v_fin, 'a função ' || f || ' não lê dados financeiros';
  end loop;
  v_def := pg_get_viewdef('public.my_benefit'::regclass);
  assert v_def !~* v_fin, 'my_benefit não lê dados financeiros';
  assert v_def ~* 'auth\.uid\(\)' and (select reloptions from pg_class where oid = 'public.my_benefit'::regclass) @> array['security_barrier=true'], 'my_benefit filtra pela sessão';
  -- organization_usage lê só licenças e contratos: nem auth.users (o último acesso de ninguém), nem persons, nem operações.
  v_def := pg_get_functiondef('public.organization_usage(uuid)'::regprocedure);
  assert v_def !~* 'auth\.users' and v_def !~* 'last_sign_in_at' and v_def !~* 'persons' and v_def !~* 'record_operations'
     and v_def ~* 'public\.licenses' and v_def ~* 'public\.benefit_contracts', 'organization_usage lê só licenças e contratos';
  assert v_def ~* 'security definer' and v_def ~* 'search_path', 'security definer com search_path fixo';
  -- Todas as funções novas: security definer com search_path fixo (as guardas são gatilhos do dono da tabela, só com search_path).
  assert (select count(*) from pg_proc p where p.oid in (
            'public.invite_licenses(uuid, text[], text)'::regprocedure, 'public.renew_license_invite(uuid, text)'::regprocedure,
            'public.cancel_license_invite(uuid, text)'::regprocedure, 'public.end_license(uuid, text)'::regprocedure,
            'public.preview_license_invite(text)'::regprocedure, 'public.accept_license(text, text)'::regprocedure,
            'public.organization_usage(uuid)'::regprocedure, 'public.clarevo_staff_create_organization(text, integer, text, date, date, text)'::regprocedure,
            'public.clarevo_staff_add_org_admin(uuid, text)'::regprocedure, 'public.clarevo_staff_update_contract(uuid, integer, date)'::regprocedure)
             and p.prosecdef and exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%')) = 10, 'dez funções security definer com search_path fixo';
end $$;
do $$
declare
  f text;
begin
  -- As sete funções da empresa: authenticated executa; anon não.
  foreach f in array array['invite_licenses(uuid, text[], text)', 'renew_license_invite(uuid, text)', 'cancel_license_invite(uuid, text)', 'end_license(uuid, text)',
                           'preview_license_invite(text)', 'accept_license(text, text)', 'organization_usage(uuid)'] loop
    assert has_function_privilege('authenticated', 'public.' || f, 'execute') and not has_function_privilege('anon', 'public.' || f, 'execute'),
      'só authenticated executa ' || f;
  end loop;
  -- Apoio e gatilhos: ninguém com sessão executa.
  foreach f in array array['clarevo_normalize_email(text)', 'clarevo_email_valid(text)', 'clarevo_contract_open(uuid, date)', 'clarevo_contract_access_until(date)',
                           'clarevo_contract_ended_at(date)', 'clarevo_contract_used(uuid)', 'clarevo_license_json(uuid)', 'clarevo_benefit_json(uuid)', 'clarevo_require_contract_admin(uuid)',
                           'clarevo_session_email()', 'licenses_guard()', 'licenses_seats_guard()', 'benefit_contracts_guard()'] loop
    assert not has_function_privilege('authenticated', 'public.' || f, 'execute') and not has_function_privilege('anon', 'public.' || f, 'execute'),
      'sem execute para authenticated nem anon: ' || f;
  end loop;
  assert not has_table_privilege('authenticated', 'public.licenses', 'insert, update, delete, truncate')
     and not has_any_column_privilege('authenticated', 'public.licenses', 'insert, update'), 'licenses: nenhum insert, update nem delete direto';
  assert has_table_privilege('authenticated', 'public.my_benefit', 'select') and not has_table_privilege('anon', 'public.my_benefit', 'select')
     and not has_table_privilege('authenticated', 'public.my_benefit', 'insert, update, delete, truncate'), 'my_benefit: só leitura, só para authenticated';
  assert not has_table_privilege('authenticated', 'public.benefit_contracts', 'insert, update, delete, truncate')
     and not has_table_privilege('authenticated', 'public.organizations', 'insert, update, delete, truncate')
     and not has_table_privilege('authenticated', 'public.organization_admins', 'insert, update, delete, truncate')
     and not has_table_privilege('authenticated', 'public.plan_entitlements', 'insert, update, delete, truncate'), 'contrato, organização, quem administra e direitos: só leitura';
  assert (select array_agg(attname::text order by attname::text collate "C") from pg_attribute
           where attrelid = 'public.licenses'::regclass and attnum > 0 and not attisdropped and has_column_privilege('authenticated', attrelid, attnum, 'select'))
    = array['activated_at', 'cancelled_at', 'contract_id', 'created_at', 'ended_at', 'id', 'invited_at', 'invited_email', 'status'],
    'nove colunas legíveis em licenses, sem code_hash nem person_id';
  assert (select polcmd from pg_policy where polname = 'licenses_admin' and polrelid = 'public.licenses'::regclass) = 'r', 'licenses_admin só lê';
  assert (select count(*) from pg_policy where polrelid = 'public.licenses'::regclass) = 2, 'duas políticas em licenses: a do RH e a da própria pessoa';
  assert (select count(*) from pg_trigger where tgrelid = 'public.licenses'::regclass and not tgisinternal) = 2, 'gatilhos de licenses: a guarda e as vagas';
end $$;

-- ---------------------------------------------------------------------------
-- 14. Invariantes no fim: vagas, uma ativa por pessoa, resumo só em convidada, nada de finanças tocado.
-- ---------------------------------------------------------------------------
do $$ begin
  assert not exists (select 1 from public.benefit_contracts c where (select count(*) from public.licenses l where l.contract_id = c.id and l.status in ('convidada', 'ativa')) > c.seats),
    'convidadas + ativas nunca passam das vagas';
  assert not exists (select 1 from public.licenses where status = 'ativa' group by person_id having count(*) > 1), 'uma licença ativa por pessoa';
  assert not exists (select 1 from public.licenses where code_hash is not null and status <> 'convidada'), 'o resumo do código só existe em licença convidada';
  assert not exists (select 1 from public.licenses where status = 'ativa' and (person_id is null or activated_at is null)), 'ativa sempre tem pessoa e data';
  assert not exists (select 1 from public.plan_entitlements e join public.licenses l on l.id = e.license_id where l.status = 'convidada'), 'convidada não tem direito ao plano';
  assert (select count(*) from public.financial_records where description = 'Mercado da Bia') = 1 and pg_temp.footprint('hugo') = '1 1 1 1 0', 'registros de ninguém foram tocados';
end $$;

rollback;

-- ---------------------------------------------------------------------------
-- 15. Corrida nas vagas: duas sessões convidam ao mesmo tempo para a última vaga; a segunda espera a trava do contrato e é recusada.
-- As sessões do dblink só enxergam dados gravados: esta parte grava de verdade (pessoa fictícia Rui, empresa da corrida) e, no fim,
-- apaga tudo. Sem a extensão dblink (ou sem conexão local), roda o equivalente determinístico numa sessão só e avisa.
-- ---------------------------------------------------------------------------
\set rui '''00000000-0000-0000-0000-0000000000b9'''
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
  values (:rui, 'rui@corrida.test', now(), '{"display_name":"Rui"}');
create temp table conc (name text primary key, id uuid);
grant select, insert on conc to authenticated;
begin;
set local clarevo.today = '2026-10-07';
set local role authenticated;
select set_config('request.jwt.claim.sub', :rui, true);
select public.ensure_personal_space('Conta principal');
reset role;
do $$
declare
  r jsonb := public.clarevo_staff_create_organization('Empresa da Corrida', 1, 'individual', '2026-10-01', null, 'rui@corrida.test');
begin
  insert into conc values ('pessoa', (select id from auth.users where email = 'rui@corrida.test')),
    ('org', (r ->> 'organization_id')::uuid), ('contrato', (r ->> 'contract_id')::uuid);
end $$;
commit;

do $$
declare
  v_rui uuid := (select id from conc where name = 'pessoa');
  v_contract uuid := (select id from conc where name = 'contrato');
  v_session text := format('set local clarevo.today = %L; set local role authenticated; set local "request.jwt.claim.sub" = %L', '2026-10-07', (select id from conc where name = 'pessoa'));
  v_dblink boolean := exists (select 1 from pg_available_extensions where name = 'dblink');
  v_connected boolean := false;
  v_pid int;
  v_waited boolean := false;
  i int;
begin
  if v_dblink then
    create schema testes_dblink;
    create extension dblink schema testes_dblink;
    begin
      perform testes_dblink.dblink_connect('primeira', format('dbname=%s port=%s', current_database(), current_setting('port')));
      perform testes_dblink.dblink_connect('segunda', format('dbname=%s port=%s', current_database(), current_setting('port')));
      v_connected := true;
    exception when others then
      raise notice '97/15: dblink sem conexão local (%); conferência sequencial numa sessão só', sqlerrm;
    end;
  else
    raise notice '97/15: extensão dblink indisponível; conferência sequencial numa sessão só';
  end if;

  if v_connected then
    -- Sessão 1: convida para a última vaga e segura a transação aberta (trava do contrato).
    perform testes_dblink.dblink_exec('primeira', 'begin; ' || v_session);
    perform * from testes_dblink.dblink('primeira', format($q$select public.invite_licenses(%L, array['um@exemplo.test'], 'cor-a-0001')::text$q$, v_contract)) as t(r text);
    -- Sessão 2: convida outra pessoa para a mesma vaga; espera a trava do contrato.
    perform testes_dblink.dblink_exec('segunda', 'begin; ' || v_session);
    select pid into v_pid from testes_dblink.dblink('segunda', 'select pg_backend_pid()') as t(pid int);
    perform testes_dblink.dblink_send_query('segunda', format($q$select public.invite_licenses(%L, array['dois@exemplo.test'], 'cor-b-0001')::text$q$, v_contract));
    for i in 1 .. 200 loop
      if exists (select 1 from pg_locks where pid = v_pid and not granted) then
        v_waited := true;
        exit;
      end if;
      perform pg_sleep(0.05);
    end loop;
    assert v_waited, 'a segunda sessão deveria esperar a trava do contrato';
    perform testes_dblink.dblink_exec('primeira', 'commit');
    begin
      perform * from testes_dblink.dblink_get_result('segunda') as t(r text);
      raise exception 'FALHA: a segunda sessão convidou além das vagas';
    exception when others then
      assert sqlerrm = 'vagas_insuficientes', 'sessão 2: ' || sqlerrm;
    end;
    perform * from testes_dblink.dblink_get_result('segunda') as t(r text);
    perform testes_dblink.dblink_exec('segunda', 'rollback');
  else
    -- Equivalente determinístico: a primeira termina antes da segunda.
    perform set_config('clarevo.today', '2026-10-07', true);
    perform set_config('request.jwt.claim.sub', v_rui::text, true);
    set local role authenticated;
    perform public.invite_licenses(v_contract, array['um@exemplo.test'], 'cor-a-0001');
    begin
      perform public.invite_licenses(v_contract, array['dois@exemplo.test'], 'cor-b-0001');
      raise exception 'FALHA: convidou além das vagas';
    exception when others then
      assert sqlerrm = 'vagas_insuficientes', 'sequencial: ' || sqlerrm;
    end;
    reset role;
  end if;
  if v_dblink then
    perform testes_dblink.dblink_disconnect(c) from unnest(testes_dblink.dblink_get_connections()) c;
    drop extension dblink;
    drop schema testes_dblink;
  end if;

  assert (select count(*) from public.licenses where contract_id = v_contract) = 1
     and (select invited_email from public.licenses where contract_id = v_contract) = 'um@exemplo.test', 'uma licença só: a da primeira sessão';
  assert (select count(*) from public.record_operations where idempotency_key = 'cor-b-0001') = 0, 'a recusa não grava operação';

  -- Limpeza: tudo que esta parte gravou (empresa, licença, operações, contexto e pessoa).
  delete from public.organizations where id = (select id from conc where name = 'org');
  delete from public.financial_contexts where owner_person_id = v_rui;
  delete from auth.users where id = v_rui;
  assert not exists (select 1 from public.organizations where name = 'Empresa da Corrida') and not exists (select 1 from public.licenses where contract_id = v_contract)
     and not exists (select 1 from auth.users where email = 'rui@corrida.test') and not exists (select 1 from public.persons where id = v_rui)
     and not exists (select 1 from public.record_operations where actor_id = v_rui), 'a corrida não deixou nada';
end $$;
