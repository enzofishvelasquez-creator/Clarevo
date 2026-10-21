-- Família (D-055, migração 0013): create_family, create_family_invite, cancel_family_invite, preview_family_invite,
-- accept_family_invite, leave_family, remove_family_member, set_member_role, transfer_family_ownership e end_family; a tabela
-- family_invites (só o resumo SHA-256 do código), a visão family_member_items, a coluna financial_contexts.ended_at, L-4 (pagar a
-- conta de outra pessoa na Família) e L-5 (renda de referência da casa).
-- Pessoas FICTÍCIAS: Vera (titular da Casa Lima), Mauro (membro, depois titular), Nina (leitora), Quirino, Saulo e Tânia (membros),
-- Rita (titular de outra Família), Úrsula (sem Família, para os convites inválidos), Paula (RH de uma empresa), Otto (externo) e Xena (sem espaço).
-- Tudo em uma transação desfeita no fim. Valores em centavos.
\set vera    '''00000000-0000-0000-0000-0000000000a7'''
\set mauro   '''00000000-0000-0000-0000-0000000000b7'''
\set nina    '''00000000-0000-0000-0000-0000000000c7'''
\set quirino '''00000000-0000-0000-0000-0000000000d7'''
\set saulo   '''00000000-0000-0000-0000-0000000000e7'''
\set tania   '''00000000-0000-0000-0000-0000000000f7'''
\set rita    '''00000000-0000-0000-0000-000000000017'''
\set ursula  '''00000000-0000-0000-0000-000000000027'''
\set paula   '''00000000-0000-0000-0000-000000000037'''
\set otto    '''00000000-0000-0000-0000-000000000047'''
\set xena    '''00000000-0000-0000-0000-000000000057'''

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
grant select, insert on ids to authenticated, anon;
create temp table codes (name text primary key, code text, invite uuid);
grant select, insert on codes to authenticated;
create function pg_temp.id(p_name text) returns uuid language sql as $$ select id from ids where name = p_name $$;
create function pg_temp.as_(p_name text) returns text language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(pg_temp.id(p_name)::text, ''), true)
$$;
create function pg_temp.code(p_name text) returns text language sql as $$ select code from codes where name = p_name $$;
create function pg_temp.check_links() returns void language plpgsql as $$
begin
  set constraints all immediate;
  set constraints all deferred;
end $$;

-- O vínculo de uma pessoa na Família 'fam' (ou em outra), sem a RLS: "papel ler escrever editar_outros revogado" (t ou f).
create function pg_temp.mem(p_name text, p_ctx text default 'fam') returns text language sql security definer set search_path = public, pg_temp as $$
  select format('%s %s %s %s %s', role, can_read, can_write, can_edit_others, revoked_at is not null)
    from public.context_memberships where context_id = pg_temp.id(p_ctx) and person_id = pg_temp.id(p_name)
$$;
-- O convite de um nome, sem a RLS: "papel usado cancelado" e o resumo.
create function pg_temp.inv_state(p_name text) returns text language sql security definer set search_path = public, pg_temp as $$
  select format('%s %s %s', role, used_at is not null, cancelled_at is not null) from public.family_invites
   where id = (select invite from codes where name = p_name)
$$;
create function pg_temp.inv_hash(p_name text) returns text language sql security definer set search_path = public, pg_temp as $$
  select code_hash from public.family_invites where id = (select invite from codes where name = p_name)
$$;
-- O código aparece em alguma coluna gravada? (convites, operações, contextos e vínculos, como texto da linha inteira)
create function pg_temp.leaks(p_code text) returns boolean language sql security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.family_invites t where t::text like '%' || p_code || '%')
      or exists (select 1 from public.record_operations t where t::text like '%' || p_code || '%')
      or exists (select 1 from public.financial_contexts t where t::text like '%' || p_code || '%')
      or exists (select 1 from public.context_memberships t where t::text like '%' || p_code || '%')
$$;
create function pg_temp.ops(p_action text, p_ctx text default 'fam') returns bigint language sql security definer set search_path = public, pg_temp as $$
  select count(*) from public.record_operations where action = p_action and context_id = pg_temp.id(p_ctx)
$$;
-- Cria um convite como a pessoa e guarda o código (só existe aqui, na resposta).
create function pg_temp.inv(p_name text, p_who text, p_role text, p_ctx text default 'fam') returns text language plpgsql as $$
declare
  r jsonb;
begin
  perform pg_temp.as_(p_who);
  r := public.create_family_invite(pg_temp.id(p_ctx), p_role, 'fa-inv-' || p_name);
  insert into codes values (p_name, r ->> 'code', (r #>> '{invite,id}')::uuid);
  return r ->> 'code';
end $$;
-- Envelhece um convite (backdoor do backend, com a guarda desligada só aqui): venceu há 1 dia.
create function pg_temp.age(p_name text) returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  alter table public.family_invites disable trigger family_invites_guard;
  update public.family_invites set created_at = created_at - interval '8 days', expires_at = expires_at - interval '8 days'
   where id = (select invite from codes where name = p_name);
  alter table public.family_invites enable trigger family_invites_guard;
end $$;

insert into ids values ('vera', :vera), ('mauro', :mauro), ('nina', :nina), ('quirino', :quirino), ('saulo', :saulo), ('tania', :tania),
  ('rita', :rita), ('ursula', :ursula), ('paula', :paula), ('otto', :otto), ('xena', :xena);
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  (:vera,    'vera@exemplo.test',    now(), '{"display_name":"Vera Lima"}'),
  (:mauro,   'mauro@exemplo.test',   now(), '{"display_name":"Mauro Dias"}'),
  (:nina,    'nina@exemplo.test',    now(), '{"display_name":"Nina Rocha"}'),
  (:quirino, 'quirino@exemplo.test', now(), '{"display_name":"Quirino Sá"}'),
  (:saulo,   'saulo@exemplo.test',   now(), '{"display_name":"Saulo Reis"}'),
  (:tania,   'tania@exemplo.test',   now(), '{"display_name":"Tânia Melo"}'),
  (:rita,    'rita@exemplo.test',    now(), '{"display_name":"Rita Prado"}'),
  (:ursula,  'ursula@exemplo.test',  now(), '{"display_name":"Úrsula Neves"}'),
  (:paula,   'paula@empresa.test',   now(), '{"display_name":"Paula Alves"}'),
  (:otto,    'otto@exemplo.test',    now(), '{"display_name":"Otto Reis"}'),
  (:xena,    'xena@exemplo.test',    now(), '{"display_name":"Xena"}');

-- ---------------------------------------------------------------------------
-- 0. Primeira entrada de todos (menos Xena, que ainda não tem espaço) e o Pessoal de Vera e de Mauro.
-- ---------------------------------------------------------------------------
set role authenticated;
do $$
declare
  p text;
  space jsonb;
begin
  foreach p in array array['vera', 'mauro', 'nina', 'quirino', 'saulo', 'tania', 'rita', 'ursula', 'paula', 'otto'] loop
    perform pg_temp.as_(p);
    space := public.ensure_personal_space('Conta principal');
    insert into ids values (p || '_ctx', (space ->> 'context_id')::uuid), (p || '_acc', (space #>> '{account,id}')::uuid);
  end loop;
  perform pg_temp.as_('vera');
  perform public.create_record('fa-pv-0001', pg_temp.id('vera_ctx'), pg_temp.id('vera_acc'), 'despesa', 7700, '2026-10-02', 'Mercado da Vera');
  perform public.create_commitment('fa-pv-0002', pg_temp.id('vera_ctx'), 33300, '2026-10-20', 'Internet da Vera');
  perform public.set_income_reference('fa-pv-0003', pg_temp.id('vera_ctx'), '2026-10-01', 0, 400000, false);
  perform pg_temp.as_('mauro');
  perform public.create_record('fa-pm-0001', pg_temp.id('mauro_ctx'), pg_temp.id('mauro_acc'), 'despesa', 8800, '2026-10-02', 'Mercado do Mauro');
end $$;
reset role;

-- Empresa de Paula (RH): licença para Vera; a empresa não vê nada de Família.
insert into public.organizations (id, name) values ('10000000-0000-0000-0000-000000000077', 'Empresa Fictícia da Paula');
insert into public.organization_admins values ('10000000-0000-0000-0000-000000000077', :paula);
insert into public.benefit_contracts (id, organization_id, seats, plan, starts_on)
  values ('20000000-0000-0000-0000-000000000077', '10000000-0000-0000-0000-000000000077', 5, 'familiar', '2026-10-01');
insert into public.licenses (id, contract_id, invited_email, person_id, status, activated_at)
  values ('30000000-0000-0000-0000-000000000077', '20000000-0000-0000-0000-000000000077', 'vera@exemplo.test', :vera, 'ativa', now());

-- ---------------------------------------------------------------------------
-- 1. create_family (L-1, L-3, F7): quem cria vira titular; a Família nasce com a Conta principal e nada de exemplo.
-- ---------------------------------------------------------------------------
set role authenticated;
do $$
declare
  r jsonb;
  r2 jsonb;
  fam uuid;
begin
  perform pg_temp.as_('vera');
  r := public.create_family('  Casa Lima  ', 'fa-cf-0001');
  fam := (r #>> '{context,id}')::uuid;
  insert into ids values ('fam', fam);
  assert r #>> '{context,name}' = 'Casa Lima', 'nome sem os espaços das pontas';
  assert r ->> 'role' = 'titular' and r #>> '{context,ended_at}' is null, 'quem cria é titular; Família ativa';
  assert (select array_agg(k order by k) from jsonb_object_keys(r -> 'context') k) = array['created_at', 'ended_at', 'id', 'name'],
    'o contexto devolve só id, nome, criação e encerramento';
  assert (select kind::text from public.financial_contexts where id = fam) = 'familia', 'contexto do tipo Família';
  assert (select owner_person_id from public.financial_contexts where id = fam) = pg_temp.id('vera'), 'a titular é a dona';
  assert pg_temp.mem('vera') = 'titular t t t f', 'titular: ler, anotar e editar de outras pessoas';
  assert (select count(*) from public.financial_accounts where context_id = fam) = 1
     and (select name || ' ' || is_default::text || ' ' || status || ' ' || kind from public.financial_accounts where context_id = fam) = 'Conta principal true ativa banco',
    'a Família nasce com a "Conta principal" (principal, ativa, banco)';
  insert into ids values ('fam_acc', (select id from public.financial_accounts where context_id = fam));
  -- Nada de exemplo: conta nova nunca recebe dados.
  assert (select count(*) from public.financial_records where context_id = fam) = 0
     and (select count(*) from public.commitments where context_id = fam) = 0
     and (select count(*) from public.commitment_series where context_id = fam) = 0
     and (select count(*) from public.goals where context_id = fam) = 0
     and (select count(*) from public.cards where context_id = fam) = 0
     and (select count(*) from public.income_references where context_id = fam) = 0
     and (select count(*) from public.category_budgets where context_id = fam) = 0, 'Família nova sem dados de exemplo';
  assert (select count(*) from public.family_invites) = 0, 'sem convites';

  -- Repetição: a mesma chave devolve o mesmo resultado e não cria outra Família.
  r2 := public.create_family('Casa Lima', 'fa-cf-0001');
  assert r2 = r, 'repetição devolve o mesmo resultado';
  assert (select count(*) from public.financial_contexts where kind = 'familia') = 1, 'uma só Família';
  perform pg_temp.expect_code($f$select public.create_family('Outro nome', 'fa-cf-0001')$f$, 'chave_reutilizada', 'PT409');
  -- L-3: uma Família por pessoa.
  perform pg_temp.expect_code($f$select public.create_family('Outra casa', 'fa-cf-0002')$f$, 'ja_em_familia', 'PT409');
  -- Validação do nome e da chave; nada disso grava operação.
  perform pg_temp.as_('mauro');
  perform pg_temp.expect_code($f$select public.create_family('   ', 'fa-cf-0003')$f$, 'nome_da_familia_invalido', '22023');
  perform pg_temp.expect_code($f$select public.create_family(null, 'fa-cf-0004')$f$, 'nome_da_familia_invalido', '22023');
  perform pg_temp.expect_code(format($f$select public.create_family(%L, 'fa-cf-0005')$f$, repeat('x', 61)), 'nome_da_familia_invalido', '22023');
  perform pg_temp.expect_code($f$select public.create_family('Casa', null)$f$, 'chave_invalida', '22023');
  perform pg_temp.expect_code($f$select public.create_family('Casa', 'curta')$f$, 'chave_invalida', '22023');
  assert (select count(*) from public.record_operations where action = 'criar_familia') = 0, 'recusas não gravam operação (Mauro não vê a de Vera)';
  -- Quem ainda não tem espaço não tem permissão; sem sessão, não autenticado.
  perform pg_temp.as_('xena');
  perform pg_temp.expect_code($f$select public.create_family('Casa da Xena', 'fa-cf-0006')$f$, 'sem_permissao', '42501');
  perform set_config('request.jwt.claim.sub', '', true);
  perform pg_temp.expect_code($f$select public.create_family('Casa', 'fa-cf-0007')$f$, 'nao_autenticado', '42501');
  -- Um nome de 60 caracteres vale (Rita cria a dela).
  perform pg_temp.as_('rita');
  r := public.create_family(repeat('r', 60), 'fa-cf-0008');
  insert into ids values ('fam2', (r #>> '{context,id}')::uuid);
  assert length(r #>> '{context,name}') = 60, 'nome de 60 caracteres';
end $$;
reset role;
do $$
begin
  assert (select (action, context_id, target_id, record_id, commitment_id, request_hash)::text from public.record_operations
           where idempotency_key = 'fa-cf-0001' and action = 'criar_familia')
       = (select ('criar_familia', pg_temp.id('fam'), pg_temp.id('fam'), null::uuid, null::uuid,
                  md5(jsonb_build_array('criar_familia', 'Casa Lima')::text))::text), 'a operação aponta para a Família, com hash em JSON';
  assert pg_temp.ops('criar_familia') = 1, 'uma operação (a repetição não grava)';
end $$;


-- ---------------------------------------------------------------------------
-- 2. Convite (F3): o código só existe na resposta; o banco guarda o resumo SHA-256. Prévia, aceite, uso único e repetição.
-- ---------------------------------------------------------------------------
create function pg_temp.inv_expiry(p_name text) returns timestamptz language sql security definer set search_path = public, pg_temp as $$
  select expires_at from public.family_invites where id = (select invite from codes where name = p_name)
$$;
create function pg_temp.inv_used_by(p_name text) returns uuid language sql security definer set search_path = public, pg_temp as $$
  select used_by from public.family_invites where id = (select invite from codes where name = p_name)
$$;

set role authenticated;
do $$
declare
  c text;
  r jsonb;
  p jsonb;
  x text;
begin
  c := pg_temp.inv('mauro', 'vera', 'membro');
  assert c ~ '^[0-9a-f]{32}$', 'o código tem 128 bits em 32 hexadecimais';
  assert pg_temp.inv_state('mauro') = 'membro f f', 'convite de membro, nem usado nem cancelado';
  assert (select count(*) from public.family_invites) = 1, 'o titular lê o convite';
  assert (select (expires_at - created_at) = interval '7 days' and created_by = pg_temp.id('vera') and context_id = pg_temp.id('fam')
            from public.family_invites), 'vale 7 dias; autoria e Família certas';
  -- O resultado da criação: o convite sem o resumo e o código uma única vez; repetir a chave devolve o convite sem o código.
  r := public.create_family_invite(pg_temp.id('fam'), 'membro', 'fa-inv-mauro');
  assert r ->> 'code' is null and r ? 'code', 'repetir a chave devolve o convite sem o código';
  assert (r #>> '{invite,id}')::uuid = (select invite from codes where name = 'mauro'), 'e o mesmo convite';
  assert (select array_agg(k order by k collate "C") from jsonb_object_keys(r -> 'invite') k)
       = array['cancelled_at', 'context_id', 'created_at', 'created_by', 'expires_at', 'id', 'role', 'used_at'], 'o convite não traz o resumo do código';
  assert (select count(*) from public.family_invites) = 1, 'a repetição não cria outro convite';
  perform pg_temp.expect_code(format($f$select public.create_family_invite(%L, 'leitor', 'fa-inv-mauro')$f$, pg_temp.id('fam')), 'chave_reutilizada', 'PT409');
  -- Recusas que não gravam operação.
  perform pg_temp.expect_code(format($f$select public.create_family_invite(%L, 'titular', 'fa-inv-x001')$f$, pg_temp.id('fam')), 'papel_invalido', '22023');
  perform pg_temp.expect_code(format($f$select public.create_family_invite(%L, null, 'fa-inv-x002')$f$, pg_temp.id('fam')), 'papel_invalido', '22023');
  perform pg_temp.expect_code(format($f$select public.create_family_invite(%L, 'membro', 'fa-inv-x003')$f$, pg_temp.id('vera_ctx')), 'contexto_invalido', '22023');
  perform pg_temp.expect_code($f$select public.create_family_invite(null, 'membro', 'fa-inv-x004')$f$, 'nao_encontrado', 'P0002');
  perform pg_temp.expect_code($f$select public.create_family_invite(gen_random_uuid(), 'membro', 'fa-inv-x005')$f$, 'nao_encontrado', 'P0002');
  perform pg_temp.expect_code(format($f$select public.create_family_invite(%L, 'membro', 'fa-inv-x006')$f$, pg_temp.id('mauro_ctx')), 'nao_encontrado', 'P0002');
  perform pg_temp.expect_code($f$select public.create_family_invite(gen_random_uuid(), 'membro', 'curta')$f$, 'chave_invalida', '22023');
  assert pg_temp.ops('criar_convite_familia') = 1, 'recusas e repetição não gravam operação';
  -- Quem é de fora não convida na Casa Lima nem a lê.
  perform pg_temp.as_('otto');
  perform pg_temp.expect_code(format($f$select public.create_family_invite(%L, 'membro', 'fa-inv-x007')$f$, pg_temp.id('fam')), 'nao_encontrado', 'P0002');
  assert (select count(*) from public.family_invites) = 0, 'Otto não lê convites';

  -- Prévia: só o nome da Família, o primeiro nome de quem convidou, o papel e a validade.
  perform pg_temp.as_('mauro');
  p := public.preview_family_invite(c);
  assert (select array_agg(k order by k collate "C") from jsonb_object_keys(p) k) = array['expires_at', 'family_name', 'invited_by', 'role'], 'a prévia só tem quatro campos';
  assert p ->> 'family_name' = 'Casa Lima' and p ->> 'invited_by' = 'Vera' and p ->> 'role' = 'membro', 'nome da Família, primeiro nome e papel';
  assert (p ->> 'expires_at')::timestamptz = pg_temp.inv_expiry('mauro'), 'a validade da prévia é a do convite';
  assert public.preview_family_invite(upper(c)) = p and public.preview_family_invite('  ' || c || E'\n') = p, 'maiúsculas e espaços nas pontas valem';
  foreach x in array array['', 'abc', '0123456789abcdef0123456789abcde', '0123456789abcdef0123456789abcdef0', 'zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz',
                           '0123456789abcdef0123456789abcdef'] loop
    perform pg_temp.expect_code(format('select public.preview_family_invite(%L)', x), 'convite_invalido', 'P0002');
  end loop;
  perform pg_temp.expect_code($f$select public.preview_family_invite(null)$f$, 'convite_invalido', 'P0002');
  assert pg_temp.inv_state('mauro') = 'membro f f', 'a prévia não usa o convite';
  assert pg_temp.mem('mauro') is null, 'e não cria vínculo';

  -- Aceitar: vínculo de membro (ler e anotar), uso único, repetição devolve o mesmo resultado.
  r := public.accept_family_invite(c, 'fa-ac-0001');
  assert r #>> '{context,name}' = 'Casa Lima' and r ->> 'role' = 'membro' and r ->> 'invited_by' = 'Vera', 'resultado do aceite';
  assert (r #>> '{context,id}')::uuid = pg_temp.id('fam'), 'a Família do convite';
  assert pg_temp.mem('mauro') = 'membro t t f f', 'membro: ler e anotar, sem editar de outras pessoas';
  assert pg_temp.inv_state('mauro') = 'membro t f' and pg_temp.inv_used_by('mauro') = pg_temp.id('mauro'), 'uso único marcado, com quem usou';
  assert public.accept_family_invite(c, 'fa-ac-0001') = r, 'repetição com a mesma chave devolve o mesmo resultado';
  assert pg_temp.ops('aceitar_convite_familia') = 1, 'e não grava outra operação';
  perform pg_temp.expect_code(format($f$select public.accept_family_invite(%L, 'fa-ac-0002')$f$, c), 'convite_invalido', 'P0002');
  perform pg_temp.expect_code($f$select public.accept_family_invite('0123456789abcdef0123456789abcdef', 'fa-ac-0001')$f$, 'chave_reutilizada', 'PT409');
  perform pg_temp.as_('nina');
  perform pg_temp.expect_code(format($f$select public.accept_family_invite(%L, 'fa-ac-0003')$f$, c), 'convite_invalido', 'P0002');
  perform pg_temp.expect_code(format($f$select public.preview_family_invite(%L)$f$, c), 'convite_invalido', 'P0002');
  perform pg_temp.as_('mauro');
  assert (select count(*) from public.financial_contexts) = 2, 'Mauro lê o Pessoal e a Casa Lima';
  assert (select count(*) from public.family_invites) = 0, 'quem não é titular não lê convites';
  -- Aceitar não copia nem mostra o Pessoal de ninguém (F4).
  assert (select count(*) from public.financial_records where description = 'Mercado da Vera') = 0
     and (select count(*) from public.commitments where description = 'Internet da Vera') = 0
     and (select count(*) from public.income_references where context_id = pg_temp.id('vera_ctx')) = 0
     and (select count(*) from public.financial_accounts where context_id = pg_temp.id('vera_ctx')) = 0, 'Mauro não vê o Pessoal da Vera';
  assert (select count(*) from public.financial_records where context_id = pg_temp.id('fam')) = 0, 'nada do Pessoal foi copiado para a Família';
  perform pg_temp.as_('vera');
  assert (select count(*) from public.financial_records where description = 'Mercado do Mauro') = 0
     and (select count(*) from public.financial_accounts where context_id = pg_temp.id('mauro_ctx')) = 0
     and (select count(*) from public.financial_contexts) = 2, 'Vera não vê o Pessoal do Mauro';
  assert (select count(*) from public.family_invites) = 1 and (select count(*) from public.family_invites where used_by = pg_temp.id('mauro')) = 1,
    'Vera lê o convite usado';
end $$;
reset role;
do $$
begin
  assert pg_temp.leaks(pg_temp.code('mauro')) = false, 'o código não está gravado em nenhuma tabela';
  assert pg_temp.inv_hash('mauro') = encode(sha256(convert_to(pg_temp.code('mauro'), 'UTF8')), 'hex'), 'só o SHA-256 do código';
  assert (select request_hash from public.record_operations where idempotency_key = 'fa-ac-0001')
       = md5(jsonb_build_array('aceitar_convite_familia', pg_temp.inv_hash('mauro'))::text), 'o pedido do aceite leva o resumo, não o código';
  assert (select (action, context_id, target_id, record_id, commitment_id)::text from public.record_operations where idempotency_key = 'fa-ac-0001')
       = (select ('aceitar_convite_familia', pg_temp.id('fam'), (select invite from codes where name = 'mauro'), null::uuid, null::uuid)::text),
    'a operação do aceite aponta para o convite';
  assert (select count(*) from public.context_activity where context_id = pg_temp.id('fam')) = 0,
    'criar a Família, convidar e aceitar não são anotações (a atividade só começa com a primeira anotação)';
end $$;

-- Leitora: aceita um convite "só vê" e só lê.
set role authenticated;
do $$
declare
  c text;
  r jsonb;
begin
  c := pg_temp.inv('nina', 'vera', 'leitor');
  perform pg_temp.as_('nina');
  r := public.accept_family_invite(c, 'fa-ac-0004');
  assert r ->> 'role' = 'leitor' and r ->> 'invited_by' = 'Vera', 'leitora';
  assert pg_temp.mem('nina') = 'membro t f f f', 'leitora: só ler';
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 3. Papéis: membro lê e anota; leitora só lê. Quem anota não altera o que é dos outros (sem "editar de outras pessoas").
-- ---------------------------------------------------------------------------
set role authenticated;
do $$
declare
  fam uuid := pg_temp.id('fam');
  acc uuid := pg_temp.id('fam_acc');
  rec uuid;
begin
  perform pg_temp.as_('vera');
  perform public.create_record('fa-fr-0001', fam, acc, 'despesa', 15000, '2026-10-05', 'Mercado da casa');
  rec := (select id from public.financial_records where description = 'Mercado da casa');
  insert into ids values ('rec_vera', rec);
  -- Mauro (membro) anota e lê; não altera nem exclui o que é da Vera.
  perform pg_temp.as_('mauro');
  assert (select count(*) from public.financial_records where context_id = fam) = 1, 'Mauro lê a Família';
  perform public.create_record('fa-fr-0002', fam, acc, 'despesa', 4500, '2026-10-06', 'Feira do Mauro');
  assert (select created_by from public.financial_records where description = 'Feira do Mauro') = pg_temp.id('mauro'), 'a autoria vem da sessão';
  perform pg_temp.expect_code(format($f$select public.update_record('fa-fr-0003', %L, 1, %L, 100, '2026-10-05', 'x')$f$, rec, acc), 'sem_permissao', '42501');
  perform pg_temp.expect_code(format($f$select public.delete_record('fa-fr-0004', %L, 1)$f$, rec), 'sem_permissao', '42501');
  -- Nina (leitora) lê e não grava nada.
  perform pg_temp.as_('nina');
  assert (select count(*) from public.financial_records where context_id = fam) = 2, 'Nina lê a Família';
  perform pg_temp.expect_code(format($f$select public.create_record('fa-fr-0005', %L, %L, 'despesa', 100, '2026-10-05', 'Intrusa')$f$, fam, acc), 'sem_permissao', '42501');
  perform pg_temp.expect_code(format($f$select public.create_commitment('fa-fr-0006', %L, 100, '2026-10-20', 'Intrusa')$f$, fam), 'sem_permissao', '42501');
  perform pg_temp.expect_code(format($f$select public.set_income_reference('fa-fr-0007', %L, '2026-10-01', 0, 100, false)$f$, fam), 'sem_permissao', '42501');
  perform pg_temp.expect_code(format($f$select public.create_card('fa-fr-0008', %L, 'Cartão', null, 3, 10, null)$f$, fam), 'sem_permissao', '42501');
  perform pg_temp.expect_code(format($f$select public.update_record('fa-fr-0009', %L, 1, %L, 100, '2026-10-05', 'x')$f$, rec, acc), 'sem_permissao', '42501');
  -- Vera (titular) altera o que é do Mauro ("editar de outras pessoas").
  perform pg_temp.as_('vera');
  perform public.update_record('fa-fr-0010', (select id from public.financial_records where description = 'Feira do Mauro'), 1, acc, 4600,
    '2026-10-06', 'Feira do Mauro');
  assert (select amount_cents from public.financial_records where description = 'Feira do Mauro') = 4600, 'a titular altera o que é dos outros';
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 4. L-3: uma Família por pessoa. Convite recusado por quem já está em outra Família continua valendo.
-- ---------------------------------------------------------------------------
set role authenticated;
do $$
declare
  c text;
  c2 text;
begin
  c := pg_temp.inv('rita', 'vera', 'membro');
  perform pg_temp.as_('rita');
  perform pg_temp.expect_code(format($f$select public.accept_family_invite(%L, 'fa-ac-0005')$f$, c), 'ja_em_familia', 'PT409');
  assert pg_temp.inv_state('rita') = 'membro f f' and pg_temp.mem('rita') is null, 'a recusa não usa o convite nem cria vínculo';
  -- Quem é membro de uma Família não cria outra nem aceita convite de outra.
  c2 := pg_temp.inv('rita2', 'rita', 'leitor', 'fam2');
  perform pg_temp.as_('mauro');
  perform pg_temp.expect_code($f$select public.create_family('Casa do Mauro', 'fa-cf-0009')$f$, 'ja_em_familia', 'PT409');
  perform pg_temp.expect_code(format($f$select public.accept_family_invite(%L, 'fa-ac-0006')$f$, c2), 'ja_em_familia', 'PT409');
  -- Nem o convite da própria Família, quem já está nela.
  perform pg_temp.expect_code(format($f$select public.accept_family_invite(%L, 'fa-ac-0007')$f$, pg_temp.code('rita')), 'ja_em_familia', 'PT409');
  -- A Casa Lima não aparece para Rita, e a da Rita não aparece para Vera.
  perform pg_temp.as_('vera');
  assert (select count(*) from public.financial_contexts where id = pg_temp.id('fam2')) = 0, 'Vera não lê a Família da Rita';
  perform pg_temp.expect_code(format($f$select public.cancel_family_invite(%L, 'fa-ci-0099')$f$, (select invite from codes where name = 'rita2')), 'nao_encontrado', 'P0002');
  -- Vera cancela o convite que Rita recusou.
  perform public.cancel_family_invite((select invite from codes where name = 'rita'), 'fa-ci-0001');
  assert pg_temp.inv_state('rita') = 'membro f t', 'convite cancelado';
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 5. set_member_role: só o titular, nunca sobre si; 'membro' lê e anota, 'leitor' só lê.
-- ---------------------------------------------------------------------------
set role authenticated;
do $$
declare
  fam uuid := pg_temp.id('fam');
  acc uuid := pg_temp.id('fam_acc');
  r jsonb;
begin
  perform pg_temp.as_('vera');
  r := public.set_member_role(fam, pg_temp.id('nina'), 'membro', 'fa-sr-0001');
  assert r = jsonb_build_object('context_id', fam, 'person_id', pg_temp.id('nina'), 'role', 'membro'), 'resultado do papel';
  assert pg_temp.mem('nina') = 'membro t t f f', 'Nina agora lê e anota';
  assert public.set_member_role(fam, pg_temp.id('nina'), 'membro', 'fa-sr-0001') = r, 'repetição devolve o mesmo resultado';
  perform pg_temp.as_('nina');
  perform public.create_record('fa-sr-0002', fam, acc, 'despesa', 900, '2026-10-06', 'Pão da Nina');
  assert (select count(*) from public.financial_records where created_by = pg_temp.id('nina')) = 1, 'Nina anota';
  perform pg_temp.as_('vera');
  perform public.set_member_role(fam, pg_temp.id('nina'), 'leitor', 'fa-sr-0003');
  assert pg_temp.mem('nina') = 'membro t f f f', 'Nina voltou a só ler';
  perform pg_temp.as_('nina');
  perform pg_temp.expect_code(format($f$select public.create_record('fa-sr-0004', %L, %L, 'despesa', 900, '2026-10-06', 'Outro')$f$, fam, acc), 'sem_permissao', '42501');
  assert (select count(*) from public.financial_records where description = 'Pão da Nina') = 1, 'e continua lendo o que anotou';
  -- Recusas.
  perform pg_temp.as_('mauro');
  perform pg_temp.expect_code(format($f$select public.set_member_role(%L, %L, 'leitor', 'fa-sr-0005')$f$, fam, pg_temp.id('nina')), 'sem_permissao', '42501');
  perform pg_temp.as_('vera');
  perform pg_temp.expect_code(format($f$select public.set_member_role(%L, %L, 'leitor', 'fa-sr-0006')$f$, fam, pg_temp.id('vera')), 'nao_sobre_si', 'PT409');
  perform pg_temp.expect_code(format($f$select public.set_member_role(%L, %L, 'titular', 'fa-sr-0007')$f$, fam, pg_temp.id('nina')), 'papel_invalido', '22023');
  perform pg_temp.expect_code(format($f$select public.set_member_role(%L, %L, null, 'fa-sr-0008')$f$, fam, pg_temp.id('nina')), 'papel_invalido', '22023');
  perform pg_temp.expect_code(format($f$select public.set_member_role(%L, %L, 'leitor', 'fa-sr-0009')$f$, fam, pg_temp.id('otto')), 'nao_encontrado', 'P0002');
  perform pg_temp.expect_code(format($f$select public.set_member_role(%L, null, 'leitor', 'fa-sr-0010')$f$, fam), 'nao_encontrado', 'P0002');
  perform pg_temp.expect_code(format($f$select public.set_member_role(%L, %L, 'leitor', 'fa-sr-0011')$f$, pg_temp.id('vera_ctx'), pg_temp.id('vera')), 'contexto_invalido', '22023');
  perform pg_temp.expect_code(format($f$select public.set_member_role(%L, %L, 'leitor', 'fa-sr-0001')$f$, fam, pg_temp.id('nina')), 'chave_reutilizada', 'PT409');
  perform pg_temp.as_('otto');
  perform pg_temp.expect_code(format($f$select public.set_member_role(%L, %L, 'leitor', 'fa-sr-0012')$f$, fam, pg_temp.id('nina')), 'nao_encontrado', 'P0002');
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 6. L-4: na Família, quem tem escrita marca como paga a conta criada por outra pessoa. Desfazer só para quem pagou ou quem tem
--    "editar de outras pessoas". Alterar e excluir seguem a regra de edição; fatura de cartão segue a regra do cartão.
-- ---------------------------------------------------------------------------
set role authenticated;
do $$
declare
  fam uuid := pg_temp.id('fam');
  acc uuid := pg_temp.id('fam_acc');
  luz uuid;
  agua uuid;
  gas uuid;
  r jsonb;
begin
  perform pg_temp.as_('vera');
  luz := (public.create_commitment('fa-cm-0001', fam, 12000, '2026-10-15', 'Luz da casa') #>> '{commitment,id}')::uuid;
  agua := (public.create_commitment('fa-cm-0002', fam, 8000, '2026-10-16', 'Água da casa') #>> '{commitment,id}')::uuid;
  insert into ids values ('luz', luz), ('agua', agua);

  -- Mauro (membro, sem "editar de outras pessoas") marca como paga a conta da Vera.
  perform pg_temp.as_('mauro');
  r := public.pay_commitment('fa-cm-0003', luz, 1, acc, 12000, '2026-10-07');
  assert r #>> '{commitment,status}' = 'quitado' and (r #>> '{commitment,version}')::int = 2, 'Mauro pagou a conta da Vera';
  assert (select created_by from public.financial_records where commitment_id = luz and deleted_at is null) = pg_temp.id('mauro'),
    'o gasto do pagamento leva a autoria de quem pagou';
  assert public.pay_commitment('fa-cm-0003', luz, 1, acc, 12000, '2026-10-07') = r, 'repetição devolve o mesmo resultado';
  -- Alterar e excluir continuam com a regra de edição.
  perform pg_temp.expect_code(format($f$select public.update_commitment('fa-cm-0004', %L, 2, 100, '2026-10-15', 'Luz')$f$, luz), 'sem_permissao', '42501');
  perform pg_temp.expect_code(format($f$select public.delete_commitment('fa-cm-0005', %L, 2)$f$, luz), 'sem_permissao', '42501');
  perform pg_temp.expect_code(format($f$select public.update_commitment('fa-cm-0006', %L, 1, 100, '2026-10-16', 'Água')$f$, agua), 'sem_permissao', '42501');
  perform pg_temp.expect_code(format($f$select public.delete_commitment('fa-cm-0007', %L, 1)$f$, agua), 'sem_permissao', '42501');

  -- Leitora não paga. Quem tem escrita mas não pagou e não edita o dos outros (Nina, agora membro) não desfaz.
  perform pg_temp.as_('nina');
  perform pg_temp.expect_code(format($f$select public.pay_commitment('fa-cm-0008', %L, 1, %L, 8000, '2026-10-07')$f$, agua, acc), 'sem_permissao', '42501');
  perform pg_temp.as_('vera');
  perform public.set_member_role(fam, pg_temp.id('nina'), 'membro', 'fa-cm-0009');
  perform pg_temp.as_('nina');
  perform pg_temp.expect_code(format($f$select public.undo_commitment_payment('fa-cm-0010', %L, 2)$f$, luz), 'sem_permissao', '42501');
  r := public.pay_commitment('fa-cm-0011', agua, 1, acc, 8000, '2026-10-07');
  assert r #>> '{commitment,status}' = 'quitado', 'Nina, agora membro, paga a Água da Vera';
  perform pg_temp.expect_code(format($f$select public.undo_commitment_payment('fa-cm-0012', %L, 2)$f$, luz), 'sem_permissao', '42501');
  -- Mauro desfaz o próprio pagamento; Vera (titular) desfaz o da Nina.
  perform pg_temp.as_('mauro');
  perform pg_temp.expect_code(format($f$select public.undo_commitment_payment('fa-cm-0013', %L, 2)$f$, agua), 'sem_permissao', '42501');
  r := public.undo_commitment_payment('fa-cm-0014', luz, 2);
  assert r #>> '{commitment,status}' = 'aberto' and (r #>> '{commitment,version}')::int = 3, 'quem pagou desfaz';
  perform pg_temp.as_('vera');
  r := public.undo_commitment_payment('fa-cm-0015', agua, 2);
  assert r #>> '{commitment,status}' = 'aberto', 'a titular desfaz o pagamento de outra pessoa';
  -- Mauro paga de novo e a titular desfaz.
  perform pg_temp.as_('mauro');
  perform public.pay_commitment('fa-cm-0016', luz, 3, acc, 12000, '2026-10-07');
  perform pg_temp.as_('vera');
  r := public.undo_commitment_payment('fa-cm-0017', luz, 4);
  assert r #>> '{commitment,status}' = 'aberto', 'a titular desfaz de novo';
  -- Leitora de volta: não paga.
  perform public.set_member_role(fam, pg_temp.id('nina'), 'leitor', 'fa-cm-0018');
  perform pg_temp.as_('nina');
  perform pg_temp.expect_code(format($f$select public.pay_commitment('fa-cm-0019', %L, 5, %L, 12000, '2026-10-07')$f$, luz, acc), 'sem_permissao', '42501');
  -- Quem é de fora e o Pessoal de outra pessoa continuam como estavam.
  perform pg_temp.as_('otto');
  perform pg_temp.expect_code(format($f$select public.pay_commitment('fa-cm-0020', %L, 5, %L, 12000, '2026-10-07')$f$, luz, acc), 'nao_encontrado', 'P0002');
  perform pg_temp.expect_code(format($f$select public.undo_commitment_payment('fa-cm-0021', %L, 5)$f$, luz), 'nao_encontrado', 'P0002');
  perform pg_temp.as_('mauro');
  gas := (select id from public.commitments where description = 'Internet da Vera');
  assert gas is null, 'Mauro não vê a conta pessoal da Vera';
  perform pg_temp.as_('vera');
  gas := (select id from public.commitments where description = 'Internet da Vera');
  insert into ids values ('internet_vera', gas);
  perform pg_temp.as_('mauro');
  perform pg_temp.expect_code(format($f$select public.pay_commitment('fa-cm-0022', %L, 1, %L, 33300, '2026-10-07')$f$, gas, acc), 'nao_encontrado', 'P0002');
  perform pg_temp.expect_code(format($f$select public.undo_commitment_payment('fa-cm-0023', %L, 1)$f$, gas), 'nao_encontrado', 'P0002');
  -- No Pessoal nada muda: Vera paga a própria conta.
  perform pg_temp.as_('vera');
  r := public.pay_commitment('fa-cm-0024', gas, 1, pg_temp.id('vera_acc'), 33300, '2026-10-07');
  assert r #>> '{commitment,status}' = 'quitado', 'no Pessoal, a pessoa paga a própria conta';
end $$;
reset role;

-- Fatura de cartão: a regra do cartão. Quem tem escrita compra no cartão da Família, mas só quem criou o cartão (ou quem edita o dos
-- outros) altera o cartão e paga a fatura; a conta da fatura não se paga como conta comum.
set role authenticated;
do $$
declare
  fam uuid := pg_temp.id('fam');
  card uuid;
  inv record;
begin
  perform pg_temp.as_('vera');
  card := (public.create_card('fa-cd-0001', fam, 'Cartão da casa', '1234', 3, 10, 500000) #>> '{card,id}')::uuid;
  insert into ids values ('card', card);
  perform pg_temp.as_('mauro');
  perform public.add_card_purchase('fa-cd-0002', card, '2026-10-05', 30000, 1, 'Mercado grande', 'Mercado');
  select commitment_id, commitment_version into inv from public.invoice_items where card_id = card and month = '2026-11-01';
  assert inv.commitment_id is not null, 'a compra do Mauro gerou a fatura de novembro';
  perform pg_temp.expect_code(format($f$select public.pay_invoice('fa-cd-0003', %L, '2026-11-01', %s, 10000, '2026-10-07')$f$, card, inv.commitment_version),
    'sem_permissao', '42501');
  perform pg_temp.expect_code(format($f$select public.update_card('fa-cd-0004', %L, 1, 'Outro apelido', '1234', 3, 10, 500000)$f$, card), 'sem_permissao', '42501');
  perform pg_temp.expect_code(format($f$select public.pay_commitment('fa-cd-0005', %L, %s, %L, 30000, '2026-10-07')$f$, inv.commitment_id, inv.commitment_version,
    pg_temp.id('fam_acc')), 'conta_de_fatura', 'PT409');
  perform pg_temp.expect_code(format($f$select public.undo_commitment_payment('fa-cd-0006', %L, %s)$f$, inv.commitment_id, inv.commitment_version),
    'conta_de_fatura', 'PT409');
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 7. L-5: a renda de referência é da casa. Quem tem escrita cria, altera e exclui, qualquer que seja a autoria; quem só lê não grava.
--    No Pessoal a regra é a de sempre.
-- ---------------------------------------------------------------------------
set role authenticated;
do $$
declare
  fam uuid := pg_temp.id('fam');
  ref uuid;
  r jsonb;
begin
  perform pg_temp.as_('vera');
  r := public.set_income_reference('fa-ir-0001', fam, '2026-10-01', 0, 500000, false);
  ref := (r ->> 'id')::uuid;
  insert into ids values ('ref_fam', ref);
  -- Mauro (membro) altera a referência da Vera: a autoria fica; a versão sobe.
  perform pg_temp.as_('mauro');
  r := public.set_income_reference('fa-ir-0002', fam, '2026-10-01', 1, 520000, true);
  assert (r ->> 'version')::int = 2 and (r ->> 'amount_cents')::bigint = 520000 and (r ->> 'created_by')::uuid = pg_temp.id('vera'),
    'Mauro altera a renda da casa; a autoria fica com a Vera';
  assert (select reference_cents from public.month_committed(fam, '2026-10-01')) = 520000, 'a renda comprometida usa o valor novo';
  -- Mauro cria a de novembro; Vera altera e a exclui.
  r := public.set_income_reference('fa-ir-0003', fam, '2026-11-01', 0, 540000, false);
  insert into ids values ('ref_nov', (r ->> 'id')::uuid);
  perform pg_temp.as_('vera');
  r := public.set_income_reference('fa-ir-0004', fam, '2026-11-01', 1, 560000, false);
  assert (r ->> 'created_by')::uuid = pg_temp.id('mauro') and (r ->> 'version')::int = 2, 'Vera altera a de Mauro';
  -- A leitora (Nina) só lê: lê as duas e não grava.
  perform pg_temp.as_('nina');
  assert (select count(*) from public.income_references where context_id = fam) = 2, 'Nina lê as referências da casa';
  perform pg_temp.expect_code(format($f$select public.set_income_reference('fa-ir-0005', %L, '2026-10-01', 2, 1, false)$f$, fam), 'sem_permissao', '42501');
  perform pg_temp.expect_code(format($f$select public.delete_income_reference('fa-ir-0006', %L, 2)$f$, ref), 'sem_permissao', '42501');
  -- Mauro exclui a referência de outubro (da Vera), com a versão certa: a casa fica sem referência em outubro.
  perform pg_temp.as_('mauro');
  perform pg_temp.expect_code(format($f$select public.delete_income_reference('fa-ir-0007', %L, 1)$f$, ref), 'versao_desatualizada', 'PT409', 'versao_atual=2');
  r := public.delete_income_reference('fa-ir-0008', ref, 2);
  assert r ->> 'deleted_at' is not null and (r ->> 'deleted_by')::uuid = pg_temp.id('mauro'), 'Mauro exclui a renda da casa';
  assert (select reference_cents from public.month_committed(fam, '2026-10-01')) is null, 'sem referência em outubro';
  assert (select reference_cents from public.month_committed(fam, '2026-11-01')) = 560000, 'novembro segue com a dele';
  -- Vera recria outubro (a autoria é dela) e Mauro a altera de novo.
  perform pg_temp.as_('vera');
  r := public.set_income_reference('fa-ir-0009', fam, '2026-10-01', 0, 510000, false);
  assert (r ->> 'created_by')::uuid = pg_temp.id('vera') and (r ->> 'version')::int = 1, 'criada de novo';
  perform pg_temp.as_('mauro');
  r := public.set_income_reference('fa-ir-0010', fam, '2026-10-01', 1, 515000, false);
  assert (r ->> 'version')::int = 2 and (r ->> 'created_by')::uuid = pg_temp.id('vera'), 'e alterada por Mauro';
  assert (select reference_cents from public.month_committed(fam, '2026-10-01')) = 515000, 'a renda comprometida da casa';
  -- O Pessoal da Vera não é de ninguém mais: Mauro não grava nem exclui lá, nem a lê.
  perform pg_temp.expect_code(format($f$select public.set_income_reference('fa-ir-0011', %L, '2026-10-01', 1, 1, false)$f$, pg_temp.id('vera_ctx')), 'sem_permissao', '42501');
  perform pg_temp.expect_code(format($f$select public.delete_income_reference('fa-ir-0012', %L, 1)$f$,
    (select target_id from public.record_operations where idempotency_key = 'fa-pv-0003')), 'nao_encontrado', 'P0002');
  perform pg_temp.expect_code(format($f$select * from public.month_committed(%L, '2026-10-01')$f$, pg_temp.id('vera_ctx')), 'sem_permissao', '42501');
  -- No Pessoal, a regra de autoria segue como antes: Vera altera a própria referência.
  perform pg_temp.as_('vera');
  r := public.set_income_reference('fa-ir-0013', pg_temp.id('vera_ctx'), '2026-10-01', 1, 410000, false);
  assert (r ->> 'version')::int = 2, 'Pessoal: a pessoa altera a própria';
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 8. L-2: até 6 pessoas, contando quem é titular (pessoas ativas + convites ainda válidos). Cancelado e vencido não contam.
-- ---------------------------------------------------------------------------
set role authenticated;
do $$
declare
  fam uuid := pg_temp.id('fam');
  r jsonb;
begin
  perform pg_temp.as_('vera');
  -- Vera, Mauro e Nina estão na Família: três convites válidos completam as seis vagas.
  perform pg_temp.inv('quirino', 'vera', 'membro');
  perform pg_temp.inv('saulo', 'vera', 'membro');
  perform pg_temp.inv('x1', 'vera', 'leitor');
  perform pg_temp.expect_code(format($f$select public.create_family_invite(%L, 'membro', 'fa-inv-cheia1')$f$, fam), 'familia_cheia', 'PT409');
  -- Cancelar libera uma vaga; a repetição do cancelamento e um segundo cancelamento não dão erro nem mudam a data.
  r := public.cancel_family_invite((select invite from codes where name = 'x1'), 'fa-ci-0002');
  assert r #>> '{invite,cancelled_at}' is not null and r #>> '{invite,used_at}' is null, 'convite cancelado';
  assert public.cancel_family_invite((select invite from codes where name = 'x1'), 'fa-ci-0002') = r, 'repetição devolve o mesmo resultado';
  assert public.cancel_family_invite((select invite from codes where name = 'x1'), 'fa-ci-0003') = r, 'cancelar de novo não muda a data';
  perform pg_temp.expect_code(format($f$select public.cancel_family_invite(%L, 'fa-ci-0002')$f$, (select invite from codes where name = 'saulo')), 'chave_reutilizada', 'PT409');
  perform pg_temp.inv('tania', 'vera', 'membro');
  perform pg_temp.expect_code(format($f$select public.create_family_invite(%L, 'membro', 'fa-inv-cheia2')$f$, fam), 'familia_cheia', 'PT409');
  -- Convite vencido não conta: abre uma vaga, e o aceite dele falha como convite inválido.
  perform pg_temp.age('saulo');
  perform pg_temp.inv('saulo2', 'vera', 'membro');
  perform pg_temp.expect_code(format($f$select public.create_family_invite(%L, 'membro', 'fa-inv-cheia3')$f$, fam), 'familia_cheia', 'PT409');
end $$;
reset role;

-- Cada pessoa aceita o seu convite; o vencido não vale.
set role authenticated;
do $$
begin
  perform pg_temp.as_('quirino');
  assert public.accept_family_invite(pg_temp.code('quirino'), 'fa-ac-0010') ->> 'role' = 'membro', 'Quirino entrou';
  perform pg_temp.as_('saulo');
  perform pg_temp.expect_code(format($f$select public.accept_family_invite(%L, 'fa-ac-0011')$f$, pg_temp.code('saulo')), 'convite_invalido', 'P0002');
  assert public.accept_family_invite(pg_temp.code('saulo2'), 'fa-ac-0012') ->> 'role' = 'membro', 'Saulo entrou pelo convite novo';
  perform pg_temp.as_('tania');
  assert public.accept_family_invite(pg_temp.code('tania'), 'fa-ac-0013') ->> 'role' = 'membro', 'Tânia entrou';
  -- Seis pessoas ativas: a Família está cheia.
  perform pg_temp.as_('vera');
  assert (select count(*) from public.family_member_items where context_id = pg_temp.id('fam') and status = 'ativo') = 6, 'seis pessoas ativas';
  perform pg_temp.expect_code(format($f$select public.create_family_invite(%L, 'leitor', 'fa-inv-cheia4')$f$, pg_temp.id('fam')), 'familia_cheia', 'PT409');
end $$;
reset role;

-- No aceite a Família cheia também é conferida (um convite criado por fora do limite não passa).
insert into public.family_invites (context_id, created_by, role, code_hash, expires_at)
  values ((select id from ids where name = 'fam'), :vera, 'membro', encode(sha256(convert_to('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'UTF8')), 'hex'), now() + interval '7 days');
set role authenticated;
do $$
begin
  perform pg_temp.as_('ursula');
  perform pg_temp.expect_code($f$select public.accept_family_invite('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'fa-ac-0014')$f$, 'familia_cheia', 'PT409');
  assert pg_temp.mem('ursula') is null, 'Úrsula não entrou';
end $$;
reset role;
do $$
begin
  assert (select used_at is null and cancelled_at is null from public.family_invites
           where code_hash = encode(sha256(convert_to('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'UTF8')), 'hex')), 'a recusa não usa o convite';
  delete from public.family_invites where code_hash = encode(sha256(convert_to('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'UTF8')), 'hex');
end $$;

-- ---------------------------------------------------------------------------
-- 9. Convite usado, cancelado, vencido, inexistente e malformado respondem o mesmo erro, na prévia e no aceite, mesmo com a Família
--    cheia (a validade do convite vem antes de qualquer outra conferência) e com a mesma resposta para quem já está em Família.
-- ---------------------------------------------------------------------------
set role authenticated;
do $$
declare
  cases text[] := array[
    pg_temp.code('mauro'),                       -- usado
    pg_temp.code('x1'),                          -- cancelado
    pg_temp.code('saulo'),                       -- vencido
    'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',          -- não existe
    'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',           -- 31 caracteres
    'não é um código',                           -- malformado
    ''];                                         -- vazio
  who text;
  i int;
  expected text := 'convite_invalido|P0002||';
begin
  foreach who in array array['ursula', 'otto', 'mauro'] loop
    perform pg_temp.as_(who);
    for i in 1 .. array_length(cases, 1) loop
      assert pg_temp.err(format('select public.preview_family_invite(%L)', cases[i])) = expected,
        'prévia, caso ' || i || ', ' || who || ': ' || pg_temp.err(format('select public.preview_family_invite(%L)', cases[i]));
      assert pg_temp.err(format('select public.accept_family_invite(%L, %L)', cases[i], 'fa-ac-e' || who || i)) = expected,
        'aceite, caso ' || i || ', ' || who || ': ' || pg_temp.err(format('select public.accept_family_invite(%L, %L)', cases[i], 'fa-ac-f' || who || i));
    end loop;
  end loop;
  assert (select count(*) from public.record_operations where idempotency_key like 'fa-ac-e%') = 0, 'recusas não gravam operação';
  -- Sem sessão, a prévia e o aceite pedem login.
  perform set_config('request.jwt.claim.sub', '', true);
  perform pg_temp.expect_code($f$select public.preview_family_invite('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb')$f$, 'nao_autenticado', '42501');
  perform pg_temp.expect_code($f$select public.accept_family_invite('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', 'fa-ac-0099')$f$, 'nao_autenticado', '42501');
end $$;
reset role;

-- Quem ainda não tem espaço pessoal (Xena) recebe a mesma resposta para qualquer código, válido ou não: o aceite confere o espaço
-- antes de olhar o código, então a resposta não diz quais códigos existem (e quem tem espaço, Úrsula, recebe convite_invalido acima).
insert into public.family_invites (context_id, created_by, role, code_hash, expires_at)
  values ((select id from ids where name = 'fam'), :vera, 'membro', encode(sha256(convert_to('cccccccccccccccccccccccccccccccc', 'UTF8')), 'hex'), now() + interval '7 days');
set role authenticated;
do $$
declare
  cases text[] := array[
    'cccccccccccccccccccccccccccccccc',          -- válido, ainda não usado
    pg_temp.code('mauro'),                       -- usado
    pg_temp.code('x1'),                          -- cancelado
    pg_temp.code('saulo'),                       -- vencido
    'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',          -- não existe
    'não é um código',                           -- malformado
    ''];                                         -- vazio
  seen text[] := '{}';
  i int;
begin
  perform pg_temp.as_('xena');
  for i in 1 .. array_length(cases, 1) loop
    seen := seen || pg_temp.err(format('select public.accept_family_invite(%L, %L)', cases[i], 'fa-ac-xena' || i));
  end loop;
  assert (select count(distinct x) from unnest(seen) x) = 1 and seen[1] = 'sem_permissao|42501||',
    'sem espaço pessoal, o aceite responde igual para qualquer código: ' || seen::text;
  assert pg_temp.mem('xena') is null, 'Xena não entrou';
end $$;
reset role;
do $$
begin
  assert (select used_at is null and cancelled_at is null from public.family_invites
           where code_hash = encode(sha256(convert_to('cccccccccccccccccccccccccccccccc', 'UTF8')), 'hex')), 'a recusa não usa o convite';
  assert (select count(*) from public.record_operations where idempotency_key like 'fa-ac-xena%') = 0, 'e não grava operação';
  delete from public.family_invites where code_hash = encode(sha256(convert_to('cccccccccccccccccccccccccccccccc', 'UTF8')), 'hex');
end $$;

-- ---------------------------------------------------------------------------
-- 10. L-6: family_member_items. Ativos e ex-membros, com o primeiro nome e a situação; nunca o e-mail nem o nome inteiro.
-- ---------------------------------------------------------------------------
do $$
begin
  assert public.clarevo_first_name('Maria da Silva') = 'Maria' and public.clarevo_first_name('  João   Pedro ') = 'João'
     and public.clarevo_first_name('Zé') = 'Zé' and public.clarevo_first_name(repeat('a', 60)) = repeat('a', 40), 'primeiro nome';
  assert public.clarevo_first_name('maria@exemplo.test') = 'Pessoa da Família' and public.clarevo_first_name('Maria maria@exemplo.test') = 'Maria'
     and public.clarevo_first_name('@maria') = 'Pessoa da Família' and public.clarevo_first_name('') = 'Pessoa da Família'
     and public.clarevo_first_name('   ') = 'Pessoa da Família' and public.clarevo_first_name(null) = 'Pessoa da Família', 'um e-mail nunca vira nome';
  -- O nome que é o início do e-mail (o que ensure_personal_space grava sem nome) também vira o rótulo neutro; com o e-mail à mão a
  -- comparação é exata, no nome inteiro e na primeira palavra.
  assert public.clarevo_first_name('maria.lopes', 'maria.lopes@exemplo.test') = 'Pessoa da Família'
     and public.clarevo_first_name('  maria.lopes ', 'maria.lopes@exemplo.test') = 'Pessoa da Família'
     and public.clarevo_first_name('maria.lopes Souza', 'maria.lopes@exemplo.test') = 'Pessoa da Família'
     and public.clarevo_first_name('Maria Lopes', 'maria.lopes@exemplo.test') = 'Maria'
     and public.clarevo_first_name('Maria', 'maria@exemplo.test') = 'Maria'
     and public.clarevo_first_name('maria', 'maria@exemplo.test') = 'Pessoa da Família'
     and public.clarevo_first_name('Maria', null) = 'Maria' and public.clarevo_first_name('Maria', '') = 'Maria',
    'início do e-mail vira rótulo neutro; o nome escrito de outro jeito continua';
  assert (select array_agg(attname::text order by attnum) from pg_attribute where attrelid = 'public.family_member_items'::regclass and attnum > 0
            and not attisdropped)
       = array['context_id', 'person_id', 'first_name', 'role', 'status', 'is_me', 'joined_at', 'left_at'], 'colunas da visão: sem e-mail nem nome inteiro';
end $$;
set role authenticated;
do $$
declare
  fam uuid := pg_temp.id('fam');
  who text;
begin
  perform pg_temp.as_('vera');
  assert (select string_agg(first_name || ':' || role || ':' || status, ',' order by first_name collate "C") from public.family_member_items where context_id = fam)
       = 'Mauro:membro:ativo,Nina:leitor:ativo,Quirino:membro:ativo,Saulo:membro:ativo,Tânia:membro:ativo,Vera:titular:ativo', 'os seis, com primeiro nome e papel';
  assert (select count(*) from public.family_member_items where is_me) = 1 and (select person_id from public.family_member_items where is_me) = pg_temp.id('vera'),
    'is_me marca só quem consulta';
  assert not exists (select 1 from public.family_member_items where first_name like '% %' or first_name like '%@%'), 'nunca o nome inteiro nem e-mail';
  assert (select count(*) from public.family_member_items where left_at is not null) = 0, 'ninguém saiu ainda';
  perform pg_temp.as_('nina');
  assert (select count(*) from public.family_member_items) = 6, 'quem só lê também vê os membros';
  -- Quem é de fora, quem tem outra Família e a empresa não veem os membros da Casa Lima.
  foreach who in array array['otto', 'ursula', 'paula', 'rita'] loop
    perform pg_temp.as_(who);
    assert (select count(*) from public.family_member_items where context_id = fam) = 0, who || ' não vê os membros da Casa Lima';
  end loop;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 11. Quem não é titular, a empresa, quem é de fora e o papel anônimo. Gravação direta recusada.
-- ---------------------------------------------------------------------------
set role authenticated;
do $$
declare
  fam uuid := pg_temp.id('fam');
  inv uuid := (select invite from codes where name = 'tania');
  who text;
begin
  -- Membros e leitora: nada de titular.
  foreach who in array array['mauro', 'nina', 'quirino'] loop
    perform pg_temp.as_(who);
    perform pg_temp.expect_code(format($f$select public.create_family_invite(%L, 'membro', %L)$f$, fam, 'fa-nt-i' || who), 'sem_permissao', '42501');
    perform pg_temp.expect_code(format($f$select public.cancel_family_invite(%L, %L)$f$, inv, 'fa-nt-c' || who), 'sem_permissao', '42501');
    perform pg_temp.expect_code(format($f$select public.remove_family_member(%L, %L, %L)$f$, fam, pg_temp.id('tania'), 'fa-nt-r' || who), 'sem_permissao', '42501');
    perform pg_temp.expect_code(format($f$select public.set_member_role(%L, %L, 'leitor', %L)$f$, fam, pg_temp.id('tania'), 'fa-nt-p' || who), 'sem_permissao', '42501');
    perform pg_temp.expect_code(format($f$select public.transfer_family_ownership(%L, %L, %L)$f$, fam, pg_temp.id(who), 'fa-nt-t' || who), 'sem_permissao', '42501');
    perform pg_temp.expect_code(format($f$select public.end_family(%L, %L)$f$, fam, 'fa-nt-e' || who), 'sem_permissao', '42501');
    assert (select count(*) from public.family_invites) = 0, who || ' não lê convites';
  end loop;
  -- Empresa (RH), externa, outra Família: "não encontrado" em tudo, sem revelar que a Casa Lima existe.
  foreach who in array array['paula', 'otto', 'ursula', 'rita'] loop
    perform pg_temp.as_(who);
    perform pg_temp.expect_code(format($f$select public.create_family_invite(%L, 'membro', %L)$f$, fam, 'fa-ne-i' || who), 'nao_encontrado', 'P0002');
    perform pg_temp.expect_code(format($f$select public.cancel_family_invite(%L, %L)$f$, inv, 'fa-ne-c' || who), 'nao_encontrado', 'P0002');
    perform pg_temp.expect_code(format($f$select public.remove_family_member(%L, %L, %L)$f$, fam, pg_temp.id('tania'), 'fa-ne-r' || who), 'nao_encontrado', 'P0002');
    perform pg_temp.expect_code(format($f$select public.set_member_role(%L, %L, 'leitor', %L)$f$, fam, pg_temp.id('tania'), 'fa-ne-p' || who), 'nao_encontrado', 'P0002');
    perform pg_temp.expect_code(format($f$select public.transfer_family_ownership(%L, %L, %L)$f$, fam, pg_temp.id('tania'), 'fa-ne-t' || who), 'nao_encontrado', 'P0002');
    perform pg_temp.expect_code(format($f$select public.end_family(%L, %L)$f$, fam, 'fa-ne-e' || who), 'nao_encontrado', 'P0002');
    perform pg_temp.expect_code(format($f$select public.leave_family(%L, %L)$f$, fam, 'fa-ne-l' || who), 'nao_encontrado', 'P0002');
    assert not exists (select 1 from public.family_invites where context_id = fam), who || ' não lê convites da Casa Lima';
    assert (select count(*) from public.context_memberships where context_id = fam) = 0, who || ' não lê vínculos da Casa Lima';
    assert (select count(*) from public.financial_records where context_id = fam) = 0
       and (select count(*) from public.financial_contexts where id = fam) = 0, who || ' não lê a Casa Lima';
  end loop;
  -- A empresa continua vendo só a licença; a Família não muda isso.
  perform pg_temp.as_('paula');
  assert (select count(*) from public.licenses) = 1 and (select count(*) from public.financial_contexts) = 1
     and (select count(*) from public.context_memberships where person_id <> auth.uid()) = 0, 'RH: a licença e nada de finanças nem de Família';
  -- Cancelar um convite que não existe.
  perform pg_temp.as_('vera');
  perform pg_temp.expect_code($f$select public.cancel_family_invite(gen_random_uuid(), 'fa-nx-0001')$f$, 'nao_encontrado', 'P0002');
  perform pg_temp.expect_code($f$select public.cancel_family_invite(null, 'fa-nx-0002')$f$, 'nao_encontrado', 'P0002');
  -- Convite já usado não se cancela.
  perform pg_temp.expect_code(format($f$select public.cancel_family_invite(%L, 'fa-nx-0003')$f$, (select invite from codes where name = 'mauro')),
    'convite_ja_usado', 'PT409');
end $$;

-- Sem sessão: não autenticado em tudo.
do $$
declare
  fam uuid := pg_temp.id('fam');
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform pg_temp.expect_code($f$select public.create_family('Casa', 'fa-ns-0001')$f$, 'nao_autenticado', '42501');
  perform pg_temp.expect_code(format($f$select public.create_family_invite(%L, 'membro', 'fa-ns-0002')$f$, fam), 'nao_autenticado', '42501');
  perform pg_temp.expect_code(format($f$select public.cancel_family_invite(gen_random_uuid(), 'fa-ns-0003')$f$), 'nao_autenticado', '42501');
  perform pg_temp.expect_code($f$select public.leave_family(gen_random_uuid(), 'fa-ns-0004')$f$, 'nao_autenticado', '42501');
  perform pg_temp.expect_code($f$select public.remove_family_member(gen_random_uuid(), gen_random_uuid(), 'fa-ns-0005')$f$, 'nao_autenticado', '42501');
  perform pg_temp.expect_code($f$select public.set_member_role(gen_random_uuid(), gen_random_uuid(), 'leitor', 'fa-ns-0006')$f$, 'nao_autenticado', '42501');
  perform pg_temp.expect_code($f$select public.transfer_family_ownership(gen_random_uuid(), gen_random_uuid(), 'fa-ns-0007')$f$, 'nao_autenticado', '42501');
  perform pg_temp.expect_code($f$select public.end_family(gen_random_uuid(), 'fa-ns-0008')$f$, 'nao_autenticado', '42501');
  assert (select count(*) from public.family_invites) = 0 and (select count(*) from public.family_member_items) = 0, 'sem sessão não lê nada';
end $$;

-- Gravação direta é recusada, até para o titular; o resumo do código não é lido nem por ele.
select set_config('request.jwt.claim.sub', :vera, true);
select pg_temp.expect_error($$insert into public.family_invites (context_id, created_by, role, code_hash, expires_at)
  values (gen_random_uuid(), auth.uid(), 'membro', repeat('a', 64), now() + interval '7 days')$$, 'permission denied%');
select pg_temp.expect_error($$update public.family_invites set cancelled_at = now()$$, 'permission denied%');
select pg_temp.expect_error($$update public.family_invites set expires_at = now() + interval '30 days'$$, 'permission denied%');
select pg_temp.expect_error($$delete from public.family_invites$$, 'permission denied%');
select pg_temp.expect_error($$select code_hash from public.family_invites$$, 'permission denied%');
select pg_temp.expect_error($$select * from public.family_invites$$, 'permission denied%');
select pg_temp.expect_error($$update public.context_memberships set can_write = false$$, 'permission denied%');
select pg_temp.expect_error($$update public.context_memberships set revoked_at = now() where person_id <> auth.uid()$$, 'permission denied%');
select pg_temp.expect_error($$update public.context_memberships set role = 'titular'$$, 'permission denied%');
select pg_temp.expect_error($$insert into public.context_memberships (context_id, person_id, role) values (gen_random_uuid(), auth.uid(), 'membro')$$, 'permission denied%');
select pg_temp.expect_error($$delete from public.context_memberships$$, 'permission denied%');
select pg_temp.expect_error($$insert into public.financial_contexts (kind, name, owner_person_id) values ('familia', 'Outra', auth.uid())$$, 'permission denied%');
select pg_temp.expect_error($$update public.financial_contexts set ended_at = now()$$, 'permission denied%');
select pg_temp.expect_error($$update public.financial_contexts set name = 'Outro nome'$$, 'permission denied%');
select pg_temp.expect_error($$delete from public.financial_contexts$$, 'permission denied%');
do $$
begin
  assert has_column_privilege('authenticated', 'public.family_invites', 'id', 'select')
     and has_column_privilege('authenticated', 'public.family_invites', 'expires_at', 'select')
     and not has_column_privilege('authenticated', 'public.family_invites', 'code_hash', 'select'), 'leitura por coluna, sem o resumo do código';
end $$;
reset role;

-- Papel anônimo: nenhuma função, nenhuma tabela, nenhuma visão.
set role anon;
select pg_temp.expect_error($$select public.create_family('Casa', 'fa-an-0001')$$, 'permission denied%');
select pg_temp.expect_error($$select public.create_family_invite(gen_random_uuid(), 'membro', 'fa-an-0002')$$, 'permission denied%');
select pg_temp.expect_error($$select public.cancel_family_invite(gen_random_uuid(), 'fa-an-0003')$$, 'permission denied%');
select pg_temp.expect_error($$select public.preview_family_invite('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb')$$, 'permission denied%');
select pg_temp.expect_error($$select public.accept_family_invite('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', 'fa-an-0004')$$, 'permission denied%');
select pg_temp.expect_error($$select public.leave_family(gen_random_uuid(), 'fa-an-0005')$$, 'permission denied%');
select pg_temp.expect_error($$select public.remove_family_member(gen_random_uuid(), gen_random_uuid(), 'fa-an-0006')$$, 'permission denied%');
select pg_temp.expect_error($$select public.set_member_role(gen_random_uuid(), gen_random_uuid(), 'leitor', 'fa-an-0007')$$, 'permission denied%');
select pg_temp.expect_error($$select public.transfer_family_ownership(gen_random_uuid(), gen_random_uuid(), 'fa-an-0008')$$, 'permission denied%');
select pg_temp.expect_error($$select public.end_family(gen_random_uuid(), 'fa-an-0009')$$, 'permission denied%');
select pg_temp.expect_error($$select count(*) from public.family_invites$$, 'permission denied%');
select pg_temp.expect_error($$select count(*) from public.family_member_items$$, 'permission denied%');
select pg_temp.expect_error($$select count(*) from public.context_memberships$$, 'permission denied%');
reset role;

-- Estrutura (como superusuário, sem passar pelas funções): privilégios, restrições, índices e guardas.
do $$
declare
  f text;
  vera_c uuid := pg_temp.id('vera_ctx');
  fam uuid := pg_temp.id('fam');
  fresh uuid;
begin
  -- As funções da Família: só authenticated executa; as auxiliares e a guarda ficam fechadas.
  foreach f in array array['create_family(text, text)', 'create_family_invite(uuid, text, text)', 'cancel_family_invite(uuid, text)',
                           'preview_family_invite(text)', 'accept_family_invite(text, text)', 'leave_family(uuid, text)',
                           'remove_family_member(uuid, uuid, text)', 'set_member_role(uuid, uuid, text, text)',
                           'transfer_family_ownership(uuid, uuid, text)', 'end_family(uuid, text)'] loop
    assert has_function_privilege('authenticated', 'public.' || f, 'execute') and not has_function_privilege('anon', 'public.' || f, 'execute'),
      'só authenticated executa ' || f;
    assert (select prosecdef from pg_proc where oid = ('public.' || f)::regprocedure), 'security definer: ' || f;
    assert (select proconfig is not null and exists (select 1 from unnest(proconfig) c where c like 'search_path=public%')
              from pg_proc where oid = ('public.' || f)::regprocedure), 'search_path fixo: ' || f;
  end loop;
  foreach f in array array['clarevo_is_family(uuid)', 'clarevo_first_name(text, text)', 'clarevo_person_label(uuid)', 'clarevo_invite_hash(text)', 'clarevo_member_role(uuid, uuid)',
                           'clarevo_active_family(uuid)', 'clarevo_family_active_count(uuid)', 'clarevo_family_valid_invites(uuid)',
                           'clarevo_family_json(uuid)', 'clarevo_invite_json(uuid)', 'clarevo_require_family_owner(uuid)',
                           'clarevo_cancel_invites_of(uuid, uuid)', 'clarevo_accept_json(uuid)', 'clarevo_lock_commitment_for_payment(uuid)',
                           'family_invites_guard()'] loop
    assert not has_function_privilege('authenticated', 'public.' || f, 'execute') and not has_function_privilege('anon', 'public.' || f, 'execute'),
      'função auxiliar fechada: ' || f;
  end loop;
  assert not exists (select 1 from pg_policies where tablename = 'context_memberships' and cmd <> 'SELECT'), 'nenhuma política de escrita em vínculos';
  assert not has_table_privilege('authenticated', 'public.context_memberships', 'insert, update, delete, truncate')
     and not has_any_column_privilege('authenticated', 'public.context_memberships', 'insert, update'), 'sem escrita direta em vínculos';
  assert not has_table_privilege('authenticated', 'public.family_invites', 'insert, update, delete, truncate')
     and not has_any_column_privilege('authenticated', 'public.family_invites', 'insert, update'), 'sem escrita direta em convites';
  assert not has_table_privilege('authenticated', 'public.family_member_items', 'insert, update, delete, truncate'), 'sem escrita pela visão';
  assert has_table_privilege('authenticated', 'public.family_member_items', 'select') and not has_table_privilege('anon', 'public.family_member_items', 'select'),
    'leitura da visão só com sessão';
  assert (select relrowsecurity from pg_class where oid = 'public.family_invites'::regclass), 'RLS ligada em convites';
  assert (select reloptions from pg_class where oid = 'public.family_member_items'::regclass) @> array['security_barrier=true'], 'visão com security_barrier';
  assert (select count(*) from pg_policies where tablename = 'family_invites') = 1
     and (select cmd from pg_policies where tablename = 'family_invites') = 'SELECT', 'uma só política em convites, de leitura';

  -- Restrições de family_invites.
  perform pg_temp.expect_error(format($f$insert into public.family_invites (context_id, created_by, role, code_hash, expires_at)
    values (%L, %L, 'dono', repeat('a', 64), now() + interval '7 days')$f$, fam, pg_temp.id('vera')), '%family_invites_papel%');
  perform pg_temp.expect_error(format($f$insert into public.family_invites (context_id, created_by, role, code_hash, expires_at)
    values (%L, %L, 'membro', repeat('A', 64), now() + interval '7 days')$f$, fam, pg_temp.id('vera')), '%family_invites_hash%');
  perform pg_temp.expect_error(format($f$insert into public.family_invites (context_id, created_by, role, code_hash, expires_at)
    values (%L, %L, 'membro', 'a1b2', now() + interval '7 days')$f$, fam, pg_temp.id('vera')), '%family_invites_hash%');
  perform pg_temp.expect_error(format($f$insert into public.family_invites (context_id, created_by, role, code_hash, expires_at)
    values (%L, %L, 'membro', repeat('a', 64), now() - interval '1 day')$f$, fam, pg_temp.id('vera')), '%family_invites_validade%');
  perform pg_temp.expect_error(format($f$insert into public.family_invites (context_id, created_by, role, code_hash, expires_at, used_by)
    values (%L, %L, 'membro', repeat('a', 64), now() + interval '7 days', %L)$f$, fam, pg_temp.id('vera'), pg_temp.id('nina')), '%family_invites_uso%');
  perform pg_temp.expect_error(format($f$insert into public.family_invites (context_id, created_by, role, code_hash, expires_at, used_at, used_by, cancelled_at)
    values (%L, %L, 'membro', repeat('a', 64), now() + interval '7 days', now(), %L, now())$f$, fam, pg_temp.id('vera'), pg_temp.id('nina')), '%family_invites_estado%');
  perform pg_temp.expect_error(format($f$insert into public.family_invites (context_id, created_by, role, code_hash, expires_at)
    values (%L, %L, 'membro', %L, now() + interval '7 days')$f$, fam, pg_temp.id('vera'), pg_temp.inv_hash('mauro')), '%family_invites_code_hash%');
  -- A guarda: nada se reescreve; uso e cancelamento só passam de nulo a valor.
  insert into public.family_invites (context_id, created_by, role, code_hash, expires_at)
    values (fam, pg_temp.id('vera'), 'leitor', repeat('c', 64), now() + interval '7 days') returning id into fresh;
  perform pg_temp.expect_error(format($f$update public.family_invites set role = 'membro' where id = %L$f$, fresh), 'campo_imutavel');
  perform pg_temp.expect_error(format($f$update public.family_invites set code_hash = repeat('d', 64) where id = %L$f$, fresh), 'campo_imutavel');
  perform pg_temp.expect_error(format($f$update public.family_invites set expires_at = expires_at + interval '1 day' where id = %L$f$, fresh), 'campo_imutavel');
  perform pg_temp.expect_error(format($f$update public.family_invites set context_id = %L where id = %L$f$, pg_temp.id('fam2'), fresh), 'campo_imutavel');
  perform pg_temp.expect_error(format($f$update public.family_invites set created_by = %L where id = %L$f$, pg_temp.id('nina'), fresh), 'campo_imutavel');
  perform pg_temp.expect_error(format($f$update public.family_invites set created_at = created_at - interval '1 day' where id = %L$f$, fresh), 'campo_imutavel');
  perform pg_temp.expect_error(format($f$update public.family_invites set used_by = %L where id = %L$f$, pg_temp.id('nina'), fresh), 'campo_imutavel');
  update public.family_invites set cancelled_at = now() where id = fresh;
  perform pg_temp.expect_error(format($f$update public.family_invites set cancelled_at = null where id = %L$f$, fresh), 'campo_imutavel');
  perform pg_temp.expect_error(format($f$update public.family_invites set cancelled_at = now() + interval '1 hour' where id = %L$f$, fresh), 'campo_imutavel');
  perform pg_temp.expect_error(format($f$update public.family_invites set used_at = now(), used_by = %L where id = %L$f$, pg_temp.id('nina'), fresh), '%family_invites_estado%');
  delete from public.family_invites where id = fresh;
  -- Um só titular ativo por Família; ended_at só em Família.
  perform pg_temp.expect_error(format($f$insert into public.context_memberships (context_id, person_id, role, can_read, can_write, can_edit_others)
    values (%L, %L, 'titular', true, true, true)$f$, fam, pg_temp.id('otto')), '%context_memberships_one_owner%');
  perform pg_temp.expect_error(format($f$update public.financial_contexts set ended_at = now() where id = %L$f$, vera_c), '%financial_contexts_encerrado%');
  -- record_operations: as ações da Família apontam só para o alvo.
  perform pg_temp.expect_error(format($f$insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash)
    values (%L, 'fa-op-0001', 'sair_familia', %L, 'x')$f$, pg_temp.id('mauro'), fam), '%record_operations_target_check%');
  perform pg_temp.expect_error(format($f$insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, target_id)
    values (%L, 'fa-op-0002', 'sair_familia', %L, 'x', gen_random_uuid(), gen_random_uuid())$f$, pg_temp.id('mauro'), fam), '%record_operations_target_check%');
  perform pg_temp.expect_error(format($f$insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, commitment_id, target_id)
    values (%L, 'fa-op-0003', 'criar_familia', %L, 'x', gen_random_uuid(), gen_random_uuid())$f$, pg_temp.id('mauro'), fam), '%record_operations_target_check%');
  perform pg_temp.expect_error(format($f$insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, target_id)
    values (%L, 'fa-op-0004', 'sair_da_familia', %L, 'x', gen_random_uuid())$f$, pg_temp.id('mauro'), fam), '%record_operations_action_check%');
  perform pg_temp.expect_error(format($f$insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, target_id, import_result)
    values (%L, 'fa-op-0005', 'encerrar_familia', %L, 'x', gen_random_uuid(), '{"created":1,"skipped":0}')$f$, pg_temp.id('mauro'), fam), '%record_operations_import_check%');
  assert (select count(*) from pg_constraint c, regexp_matches(pg_get_constraintdef(c.oid), '''([a-z_]+)''::text', 'g') m
           where c.conname = 'record_operations_action_check') = 65, 'a lista vigente tem 65 ações';
  assert (select array_agg(m[1] order by m[1] collate "C") from pg_constraint c, regexp_matches(pg_get_constraintdef(c.oid), '''([a-z_]+)''::text', 'g') m
           where c.conname = 'record_operations_action_check' and m[1] in ('criar_familia', 'criar_convite_familia', 'cancelar_convite_familia',
             'aceitar_convite_familia', 'sair_familia', 'remover_membro_familia', 'alterar_papel_familia', 'transferir_titularidade_familia',
             'encerrar_familia'))
       = array['aceitar_convite_familia', 'alterar_papel_familia', 'cancelar_convite_familia', 'criar_convite_familia', 'criar_familia',
               'encerrar_familia', 'remover_membro_familia', 'sair_familia', 'transferir_titularidade_familia'], 'as 9 ações da Família';
end $$;

-- ---------------------------------------------------------------------------
-- 12. leave_family: membro ou leitora sai e perde o vínculo na hora; o titular não sai (L-7). O que a pessoa anotou continua na
--     Família como "ex-membro"; voltar por um novo convite reativa o mesmo vínculo, com o papel do convite novo.
-- ---------------------------------------------------------------------------
set role authenticated;
do $$
declare
  fam uuid := pg_temp.id('fam');
  acc uuid := pg_temp.id('fam_acc');
  r jsonb;
begin
  perform pg_temp.as_('quirino');
  perform public.create_record('fa-lv-0001', fam, acc, 'despesa', 500, '2026-10-06', 'Pão do Quirino');
  r := public.leave_family(fam, 'fa-lv-0002');
  assert r = jsonb_build_object('context_id', fam, 'left', true), 'resultado da saída';
  assert pg_temp.mem('quirino') = 'membro t t f t', 'vínculo revogado';
  assert public.leave_family(fam, 'fa-lv-0002') = r, 'repetição devolve o mesmo resultado, mesmo depois de sair';
  assert (select count(*) from public.financial_records where context_id = fam) = 0
     and (select count(*) from public.financial_contexts) = 1 and (select count(*) from public.family_member_items) = 0, 'sem leitura da Família depois de sair';
  perform pg_temp.expect_code(format($f$select public.create_record('fa-lv-0003', %L, %L, 'despesa', 100, '2026-10-06', 'Depois de sair')$f$, fam, acc), 'sem_permissao', '42501');
  perform pg_temp.expect_code(format($f$select public.leave_family(%L, 'fa-lv-0004')$f$, fam), 'nao_encontrado', 'P0002');
  perform pg_temp.expect_code(format($f$select public.leave_family(%L, 'fa-lv-0002')$f$, pg_temp.id('fam2')), 'chave_reutilizada', 'PT409');
  perform pg_temp.expect_code(format($f$select public.leave_family(%L, 'fa-lv-0005')$f$, pg_temp.id('quirino_ctx')), 'contexto_invalido', '22023');
  perform pg_temp.expect_code($f$select public.leave_family(null, 'fa-lv-0006')$f$, 'nao_encontrado', 'P0002');
  -- O titular não sai.
  perform pg_temp.as_('vera');
  perform pg_temp.expect_code(format($f$select public.leave_family(%L, 'fa-lv-0007')$f$, fam), 'titular_nao_sai', 'PT409');
  assert pg_temp.mem('vera') = 'titular t t t f', 'a titular segue na Família';
  -- A Família enxerga o ex-membro, e o que ele anotou continua lá.
  assert (select status || ' ' || (left_at is not null)::text from public.family_member_items where person_id = pg_temp.id('quirino') and context_id = fam)
       = 'ex-membro true', 'Quirino aparece como ex-membro';
  assert (select count(*) from public.family_member_items where context_id = fam and status = 'ativo') = 5, 'cinco ativas';
  assert (select count(*) from public.financial_records where description = 'Pão do Quirino' and created_by = pg_temp.id('quirino')) = 1, 'o que ele anotou continua';
  assert (select m.status from public.family_member_items m where m.context_id = fam
            and m.person_id = (select created_by from public.financial_records where description = 'Pão do Quirino')) = 'ex-membro',
    'o autor do registro antigo se resolve como ex-membro';
  -- Voltar por um novo convite (como leitor): o mesmo vínculo é reativado.
  perform pg_temp.inv('quirino2', 'vera', 'leitor');
  perform pg_temp.as_('quirino');
  r := public.accept_family_invite(pg_temp.code('quirino2'), 'fa-lv-0008');
  assert r ->> 'role' = 'leitor', 'volta como leitor';
  assert pg_temp.mem('quirino') = 'membro t f f f', 'vínculo reativado, só ler';
  assert (select count(*) from public.context_memberships where context_id = fam and person_id = pg_temp.id('quirino')) = 1, 'o mesmo vínculo, sem outra linha';
  assert (select count(*) from public.financial_records where description = 'Pão do Quirino') = 1, 'e volta a ler o que anotou';
  perform pg_temp.as_('vera');
  perform public.set_member_role(fam, pg_temp.id('quirino'), 'membro', 'fa-lv-0009');
  assert (select status || ' ' || role || ' ' || (left_at is null)::text from public.family_member_items where person_id = pg_temp.id('quirino') and context_id = fam)
       = 'ativo membro true', 'Quirino ativo de novo';
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 13. remove_family_member: só o titular, nunca sobre si; a pessoa perde o vínculo na hora e o que anotou continua.
-- ---------------------------------------------------------------------------
set role authenticated;
do $$
declare
  fam uuid := pg_temp.id('fam');
  acc uuid := pg_temp.id('fam_acc');
  r jsonb;
begin
  perform pg_temp.as_('tania');
  perform public.create_record('fa-rm-0001', fam, acc, 'despesa', 1200, '2026-10-06', 'Café da Tânia');
  perform pg_temp.as_('vera');
  r := public.remove_family_member(fam, pg_temp.id('tania'), 'fa-rm-0002');
  assert r = jsonb_build_object('context_id', fam, 'person_id', pg_temp.id('tania'), 'removed', true), 'resultado da remoção';
  assert public.remove_family_member(fam, pg_temp.id('tania'), 'fa-rm-0002') = r, 'repetição devolve o mesmo resultado';
  assert pg_temp.mem('tania') = 'membro t t f t', 'vínculo revogado';
  perform pg_temp.expect_code(format($f$select public.remove_family_member(%L, %L, 'fa-rm-0003')$f$, fam, pg_temp.id('tania')), 'nao_encontrado', 'P0002');
  perform pg_temp.expect_code(format($f$select public.remove_family_member(%L, %L, 'fa-rm-0004')$f$, fam, pg_temp.id('vera')), 'nao_sobre_si', 'PT409');
  perform pg_temp.expect_code(format($f$select public.remove_family_member(%L, null, 'fa-rm-0005')$f$, fam), 'nao_encontrado', 'P0002');
  perform pg_temp.expect_code(format($f$select public.remove_family_member(%L, %L, 'fa-rm-0006')$f$, pg_temp.id('vera_ctx'), pg_temp.id('vera')), 'contexto_invalido', '22023');
  perform pg_temp.expect_code(format($f$select public.remove_family_member(%L, %L, 'fa-rm-0002')$f$, fam, pg_temp.id('nina')), 'chave_reutilizada', 'PT409');
  perform pg_temp.as_('mauro');
  perform pg_temp.expect_code(format($f$select public.remove_family_member(%L, %L, 'fa-rm-0007')$f$, fam, pg_temp.id('nina')), 'sem_permissao', '42501');
  -- Tânia perdeu a leitura na hora; o registro dela segue na Família, e os membros a veem como ex-membro.
  assert (select count(*) from public.financial_records where description = 'Café da Tânia' and created_by = pg_temp.id('tania')) = 1, 'o que ela anotou continua';
  assert (select status from public.family_member_items where context_id = fam and person_id = pg_temp.id('tania')) = 'ex-membro', 'ex-membro para os membros';
  assert (select string_agg(first_name || ':' || status, ',' order by first_name collate "C") from public.family_member_items where context_id = fam and status = 'ex-membro')
       = 'Tânia:ex-membro', 'só a Tânia saiu';
  perform pg_temp.as_('tania');
  assert (select count(*) from public.financial_records where context_id = fam) = 0 and (select count(*) from public.family_member_items) = 0
     and (select count(*) from public.financial_contexts) = 1, 'Tânia não lê mais a Casa Lima';
  perform pg_temp.expect_code(format($f$select public.create_record('fa-rm-0008', %L, %L, 'despesa', 100, '2026-10-06', 'Depois de sair')$f$, fam, acc), 'sem_permissao', '42501');
  perform pg_temp.expect_code(format($f$select public.leave_family(%L, 'fa-rm-0009')$f$, fam), 'nao_encontrado', 'P0002');
  -- A mesma chave da remoção, repetida por quem a fez, ainda devolve o resultado; repetida por quem foi removida, não.
  perform pg_temp.expect_code(format($f$select public.remove_family_member(%L, %L, 'fa-rm-0002')$f$, fam, pg_temp.id('tania')), 'nao_encontrado', 'P0002');
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 14. transfer_family_ownership: o titular passa a titularidade a um membro ativo; quem era titular vira membro. Convites ainda
--     válidos continuam; quando a ex-titular sai, os convites que ela criou são cancelados.
-- ---------------------------------------------------------------------------
set role authenticated;
do $$
declare
  fam uuid := pg_temp.id('fam');
  acc uuid := pg_temp.id('fam_acc');
  r jsonb;
begin
  perform pg_temp.as_('vera');
  perform pg_temp.inv('vpend', 'vera', 'membro');
  perform pg_temp.expect_code(format($f$select public.transfer_family_ownership(%L, %L, 'fa-tr-0001')$f$, fam, pg_temp.id('vera')), 'nao_sobre_si', 'PT409');
  perform pg_temp.expect_code(format($f$select public.transfer_family_ownership(%L, %L, 'fa-tr-0002')$f$, fam, pg_temp.id('tania')), 'nao_encontrado', 'P0002');
  perform pg_temp.expect_code(format($f$select public.transfer_family_ownership(%L, %L, 'fa-tr-0003')$f$, fam, pg_temp.id('otto')), 'nao_encontrado', 'P0002');
  perform pg_temp.expect_code(format($f$select public.transfer_family_ownership(%L, null, 'fa-tr-0004')$f$, fam), 'nao_encontrado', 'P0002');
  perform pg_temp.expect_code(format($f$select public.transfer_family_ownership(%L, %L, 'fa-tr-0005')$f$, pg_temp.id('vera_ctx'), pg_temp.id('mauro')), 'contexto_invalido', '22023');
  assert pg_temp.mem('vera') = 'titular t t t f' and pg_temp.mem('mauro') = 'membro t t f f', 'as recusas não mudaram nada';
  r := public.transfer_family_ownership(fam, pg_temp.id('mauro'), 'fa-tr-0006');
  assert r = jsonb_build_object('context_id', fam, 'person_id', pg_temp.id('mauro'), 'role', 'titular'), 'resultado da transferência';
  assert pg_temp.mem('mauro') = 'titular t t t f', 'Mauro é o titular';
  assert pg_temp.mem('vera') = 'membro t t f f', 'quem era titular vira membro (ler e anotar)';
  assert public.transfer_family_ownership(fam, pg_temp.id('mauro'), 'fa-tr-0006') = r, 'repetição devolve o mesmo resultado (Vera ainda lê a Família)';
  perform pg_temp.expect_code(format($f$select public.transfer_family_ownership(%L, %L, 'fa-tr-0006')$f$, fam, pg_temp.id('nina')), 'chave_reutilizada', 'PT409');
  assert pg_temp.inv_state('vpend') = 'membro f f', 'o convite pendente da Vera continua valendo';
  assert (select string_agg(first_name || ':' || role, ',' order by first_name collate "C") from public.family_member_items where context_id = fam and status = 'ativo')
       = 'Mauro:titular,Nina:leitor,Quirino:membro,Saulo:membro,Vera:membro', 'os papéis depois da transferência';
  -- Vera já não administra a Família.
  perform pg_temp.expect_code(format($f$select public.create_family_invite(%L, 'membro', 'fa-tr-0007')$f$, fam), 'sem_permissao', '42501');
  perform pg_temp.expect_code(format($f$select public.remove_family_member(%L, %L, 'fa-tr-0008')$f$, fam, pg_temp.id('nina')), 'sem_permissao', '42501');
  perform pg_temp.expect_code(format($f$select public.set_member_role(%L, %L, 'membro', 'fa-tr-0009')$f$, fam, pg_temp.id('nina')), 'sem_permissao', '42501');
  perform pg_temp.expect_code(format($f$select public.transfer_family_ownership(%L, %L, 'fa-tr-0010')$f$, fam, pg_temp.id('nina')), 'sem_permissao', '42501');
  perform pg_temp.expect_code(format($f$select public.end_family(%L, 'fa-tr-0011')$f$, fam), 'sem_permissao', '42501');
  perform pg_temp.expect_code(format($f$select public.cancel_family_invite(%L, 'fa-tr-0012')$f$, (select invite from codes where name = 'vpend')), 'sem_permissao', '42501');
  perform pg_temp.expect_code(format($f$select public.update_record('fa-tr-0013', (select id from public.financial_records where description = 'Feira do Mauro'), 2, %L, 100, '2026-10-06', 'x')$f$, acc),
    'sem_permissao', '42501');
  -- Mauro, agora titular, edita o que é da Vera ("editar de outras pessoas") e convida.
  perform pg_temp.as_('mauro');
  perform public.update_record('fa-tr-0014', pg_temp.id('rec_vera'), 1, acc, 15500, '2026-10-05', 'Mercado da casa');
  assert (select amount_cents from public.financial_records where id = pg_temp.id('rec_vera')) = 15500, 'o novo titular edita o que é dos outros';
  assert (select count(*) from public.family_invites where context_id = fam) = (select count(*) from public.family_invites where context_id = fam and created_by = pg_temp.id('vera')),
    'o novo titular lê os convites (todos criados pela Vera até aqui)';
  -- Vera sai como membro: o convite pendente dela é cancelado (F8) e ela pode abrir uma Família própria.
  perform pg_temp.as_('vera');
  r := public.leave_family(fam, 'fa-tr-0015');
  assert r ->> 'left' = 'true', 'Vera saiu';
  perform pg_temp.as_('mauro');
  assert (select count(*) from public.family_member_items where context_id = fam and status = 'ativo') = 4, 'quatro ativas';
end $$;
reset role;
do $$
begin
  assert pg_temp.inv_state('vpend') = 'membro f t', 'o convite pendente de quem saiu foi cancelado';
  assert (select count(*) from public.context_memberships where context_id = pg_temp.id('fam') and role = 'titular' and revoked_at is null) = 1, 'um só titular ativo';
  assert (select owner_person_id from public.financial_contexts where id = pg_temp.id('fam')) = pg_temp.id('mauro'), 'a dona do contexto é a nova titular';
end $$;
set role authenticated;
do $$
declare
  r jsonb;
begin
  perform pg_temp.as_('vera');
  r := public.create_family('Casa da Vera', 'fa-tr-0016');
  insert into ids values ('fam4', (r #>> '{context,id}')::uuid);
  assert r ->> 'role' = 'titular', 'quem saiu pode criar a própria Família';
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 15. end_family: só o titular e só sem outro membro ativo; os dados ficam guardados, sem leitura por ninguém.
-- ---------------------------------------------------------------------------
set role authenticated;
do $$
declare
  fam uuid := pg_temp.id('fam');
  acc uuid := pg_temp.id('fam_acc');
  r jsonb;
  p text;
begin
  perform pg_temp.as_('mauro');
  perform pg_temp.expect_code(format($f$select public.end_family(%L, 'fa-en-0001')$f$, fam), 'familia_com_membros', 'PT409');
  perform pg_temp.expect_code(format($f$select public.end_family(%L, 'fa-en-0002')$f$, pg_temp.id('mauro_ctx')), 'contexto_invalido', '22023');
  perform pg_temp.expect_code($f$select public.end_family(null, 'fa-en-0003')$f$, 'nao_encontrado', 'P0002');
  assert pg_temp.mem('mauro') = 'titular t t t f', 'a recusa não mudou nada';
  foreach p in array array['nina', 'quirino', 'saulo'] loop
    perform public.remove_family_member(fam, pg_temp.id(p), 'fa-en-r' || p);
  end loop;
  perform pg_temp.inv('last', 'mauro', 'leitor');
  assert pg_temp.inv_state('last') = 'leitor f f', 'um convite ainda válido';
  r := public.end_family(fam, 'fa-en-0004');
  assert r = jsonb_build_object('context_id', fam, 'ended', true), 'resultado do encerramento';
  assert public.end_family(fam, 'fa-en-0004') = r, 'repetição devolve o mesmo resultado, mesmo depois de encerrar';
  perform pg_temp.expect_code(format($f$select public.end_family(%L, 'fa-en-0004')$f$, pg_temp.id('fam2')), 'chave_reutilizada', 'PT409');
  -- Ninguém lê a Família encerrada: nem quem era titular, nem quem saiu.
  foreach p in array array['mauro', 'vera', 'nina', 'quirino', 'saulo', 'tania'] loop
    perform pg_temp.as_(p);
    assert (select count(*) from public.financial_contexts where id = fam) = 0
       and (select count(*) from public.financial_records where context_id = fam) = 0
       and (select count(*) from public.financial_accounts where context_id = fam) = 0
       and (select count(*) from public.commitments where context_id = fam) = 0
       and (select count(*) from public.income_references where context_id = fam) = 0
       and (select count(*) from public.cards where context_id = fam) = 0
       and (select count(*) from public.family_invites where context_id = fam) = 0
       and (select count(*) from public.family_member_items where context_id = fam) = 0, p || ' não lê a Família encerrada';
    perform pg_temp.expect_code(format($f$select public.create_record(%L, %L, %L, 'despesa', 100, '2026-10-06', 'Depois de encerrar')$f$, 'fa-en-c' || p, fam, acc),
      'sem_permissao', '42501');
    perform pg_temp.expect_code(format($f$select * from public.month_totals(%L, '2026-10-01')$f$, fam), 'sem_permissao', '42501');
  end loop;
  perform pg_temp.as_('mauro');
  perform pg_temp.expect_code(format($f$select public.create_family_invite(%L, 'membro', 'fa-en-0005')$f$, fam), 'nao_encontrado', 'P0002');
  perform pg_temp.expect_code(format($f$select public.leave_family(%L, 'fa-en-0006')$f$, fam), 'nao_encontrado', 'P0002');
  -- Quem encerrou pode criar outra Família.
  r := public.create_family('Casa Dias', 'fa-en-0007');
  insert into ids values ('fam5', (r #>> '{context,id}')::uuid);
  assert r ->> 'role' = 'titular' and (r #>> '{context,id}')::uuid <> fam, 'Mauro cria outra Família';
  -- Uma Família só de uma pessoa também se encerra.
  perform pg_temp.as_('tania');
  r := public.create_family('Casa da Tânia', 'fa-en-0008');
  insert into ids values ('fam3', (r #>> '{context,id}')::uuid);
  r := public.end_family((r #>> '{context,id}')::uuid, 'fa-en-0009');
  assert r ->> 'ended' = 'true', 'Tânia encerra a Família só dela';
end $$;
reset role;

do $$
begin
  -- Os dados ficam guardados (sem leitura por ninguém) até a política de retenção (P-010).
  assert (select ended_at is not null from public.financial_contexts where id = pg_temp.id('fam')), 'Família marcada como encerrada';
  assert (select count(*) from public.context_memberships where context_id = pg_temp.id('fam') and revoked_at is null) = 0, 'todos os vínculos revogados';
  assert (select count(*) from public.financial_records where context_id = pg_temp.id('fam') and deleted_at is null) >= 5, 'os registros ficam guardados';
  assert (select count(*) from public.commitments where context_id = pg_temp.id('fam')) >= 2 and (select count(*) from public.financial_accounts where context_id = pg_temp.id('fam')) = 1,
    'e as contas a pagar e a conta também';
  assert pg_temp.inv_state('last') = 'leitor f t', 'o convite pendente foi cancelado';
  assert (select count(*) from public.family_invites where context_id = pg_temp.id('fam') and used_at is null and cancelled_at is null and expires_at > now()) = 0,
    'nenhum convite válido na Família encerrada';
  assert (select ended_at is null from public.financial_contexts where id = pg_temp.id('fam5')), 'a Família nova está ativa';
  -- Um convite válido, criado por fora, de uma Família encerrada não vale.
  insert into public.family_invites (context_id, created_by, role, code_hash, expires_at)
    values (pg_temp.id('fam'), pg_temp.id('mauro'), 'membro', encode(sha256(convert_to('eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', 'UTF8')), 'hex'), now() + interval '7 days');
end $$;
set role authenticated;
do $$
begin
  perform pg_temp.as_('ursula');
  assert pg_temp.err($f$select public.preview_family_invite('eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee')$f$) = 'convite_invalido|P0002||', 'prévia: Família encerrada';
  assert pg_temp.err($f$select public.accept_family_invite('eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', 'fa-en-0010')$f$) = 'convite_invalido|P0002||', 'aceite: Família encerrada';
  assert pg_temp.mem('ursula') is null, 'Úrsula não entrou';
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 16. Operações e atividade: nove ações, cada uma com o alvo certo e nenhuma como anotação.
-- ---------------------------------------------------------------------------
do $$
begin
  assert (select string_agg(action || '=' || n, ',' order by action collate "C") from (
            select action, count(*) n from public.record_operations
             where action in ('criar_familia', 'criar_convite_familia', 'cancelar_convite_familia', 'aceitar_convite_familia', 'sair_familia',
                              'remover_membro_familia', 'alterar_papel_familia', 'transferir_titularidade_familia', 'encerrar_familia')
             group by action) t)
       = 'aceitar_convite_familia=6,alterar_papel_familia=5,cancelar_convite_familia=3,criar_convite_familia=12,criar_familia=5,encerrar_familia=2,'
         'remover_membro_familia=4,sair_familia=2,transferir_titularidade_familia=1',
    'uma operação por escrita (repetições e recusas não gravam): ' || (select string_agg(action || '=' || n, ',' order by action collate "C") from (
            select action, count(*) n from public.record_operations
             where action in ('criar_familia', 'criar_convite_familia', 'cancelar_convite_familia', 'aceitar_convite_familia', 'sair_familia',
                              'remover_membro_familia', 'alterar_papel_familia', 'transferir_titularidade_familia', 'encerrar_familia')
             group by action) t);
  assert not exists (select 1 from public.record_operations
                      where action in ('criar_familia', 'criar_convite_familia', 'cancelar_convite_familia', 'aceitar_convite_familia', 'sair_familia',
                                       'remover_membro_familia', 'alterar_papel_familia', 'transferir_titularidade_familia', 'encerrar_familia')
                        and (target_id is null or record_id is not null or commitment_id is not null or import_result is not null)),
    'toda operação da Família aponta só para o alvo';
  assert not exists (select 1 from public.record_operations o
                      where o.action in ('criar_familia', 'sair_familia', 'encerrar_familia') and o.target_id <> o.context_id), 'criar, sair e encerrar apontam para a Família';
  assert not exists (select 1 from public.record_operations o
                      where o.action in ('criar_convite_familia', 'cancelar_convite_familia', 'aceitar_convite_familia')
                        and not exists (select 1 from public.family_invites i where i.id = o.target_id and i.context_id = o.context_id)), 'convidar, cancelar e aceitar apontam para o convite';
  assert not exists (select 1 from public.record_operations o
                      where o.action in ('remover_membro_familia', 'alterar_papel_familia', 'transferir_titularidade_familia')
                        and not exists (select 1 from public.context_memberships m where m.person_id = o.target_id and m.context_id = o.context_id)), 'remover, papel e titularidade apontam para a pessoa';
  assert (select request_hash from public.record_operations where idempotency_key = 'fa-tr-0006')
       = md5(jsonb_build_array('transferir_titularidade_familia', pg_temp.id('fam'), pg_temp.id('mauro'))::text), 'hash em JSON';
  -- A atividade (revisão dos últimos meses) só conta anotações: Saulo só entrou e saiu, e nunca anotou.
  assert not exists (select 1 from public.context_activity where person_id = pg_temp.id('saulo')), 'Saulo não tem atividade';
  assert exists (select 1 from public.context_activity where person_id = pg_temp.id('mauro') and context_id = pg_temp.id('fam')), 'Mauro anotou na Casa Lima';
  assert not exists (select 1 from public.context_activity where context_id in (pg_temp.id('fam2'), pg_temp.id('fam3'), pg_temp.id('fam4'), pg_temp.id('fam5'))),
    'criar, convidar e encerrar não são anotações';
  -- Nada do Pessoal foi tocado: cada Pessoal tem os próprios registros.
  assert (select count(*) from public.financial_records where context_id = pg_temp.id('vera_ctx')) = 2
     and (select count(*) from public.financial_records where context_id = pg_temp.id('mauro_ctx')) = 1, 'os Pessoais seguem como estavam (a Vera pagou a própria Internet)';
  assert (select count(*) from public.financial_accounts where context_id in (select id from ids where name like 'fam%' and name not like '%acc%')) = 5, 'uma conta por Família criada';
end $$;

-- ---------------------------------------------------------------------------
-- 17. F10: ninguém lê o nome inteiro de outra pessoa (persons só é lida pela própria pessoa) e o nome que é o início do e-mail, ou
--     que parece e-mail, aparece como "Pessoa da Família" na visão dos membros, na prévia do convite e no resultado do aceite.
--     Yara não informou nome (ensure_personal_space grava o início do e-mail); Zilda digitou um e-mail no lugar do nome; Nara
--     digitou o início do e-mail e um sobrenome; Wagner tem nome comum.
-- ---------------------------------------------------------------------------
insert into ids values ('yara', '00000000-0000-0000-0000-000000000067'), ('zilda', '00000000-0000-0000-0000-000000000077'),
  ('nara', '00000000-0000-0000-0000-000000000087'), ('wagner', '00000000-0000-0000-0000-000000000097');
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000067', 'yara.lopes@exemplo.test',  now(), '{}'),
  ('00000000-0000-0000-0000-000000000077', 'zilda@exemplo.test',       now(), '{"display_name":"zilda@casa.test"}'),
  ('00000000-0000-0000-0000-000000000087', 'nara.dias@exemplo.test',   now(), '{"display_name":"nara.dias Neves"}'),
  ('00000000-0000-0000-0000-000000000097', 'wagner@exemplo.test',      now(), '{"display_name":"Wagner Costa"}');
set role authenticated;
do $$
declare
  p text;
  space jsonb;
  r jsonb;
  pv jsonb;
begin
  foreach p in array array['yara', 'zilda', 'nara', 'wagner'] loop
    perform pg_temp.as_(p);
    space := public.ensure_personal_space('Conta principal');
    insert into ids values (p || '_ctx', (space ->> 'context_id')::uuid);
  end loop;
  perform pg_temp.as_('yara');
  assert (select display_name from public.persons where id = auth.uid()) = 'yara.lopes', 'sem nome, o banco guarda o início do e-mail';
  r := public.create_family('Casa Yara', 'fa-f10-0001');
  insert into ids values ('cy', (r #>> '{context,id}')::uuid);
  perform pg_temp.inv('wagner', 'yara', 'membro', 'cy');
  perform pg_temp.inv('zilda', 'yara', 'membro', 'cy');
  perform pg_temp.inv('nara', 'yara', 'leitor', 'cy');

  -- Prévia e aceite: quem convidou aparece com o rótulo neutro, nunca com o início do e-mail.
  perform pg_temp.as_('wagner');
  pv := public.preview_family_invite(pg_temp.code('wagner'));
  assert pv ->> 'invited_by' = 'Pessoa da Família' and pv ->> 'family_name' = 'Casa Yara', 'prévia: o rótulo neutro no lugar do início do e-mail';
  assert pv::text not like '%yara%' and pv::text not like '%@%', 'a prévia não traz o início do e-mail nem e-mail';
  r := public.accept_family_invite(pg_temp.code('wagner'), 'fa-f10-0002');
  assert r ->> 'invited_by' = 'Pessoa da Família' and r::text not like '%yara%' and r::text not like '%@%', 'aceite: o rótulo neutro';
  assert public.accept_family_invite(pg_temp.code('wagner'), 'fa-f10-0002') = r, 'e a repetição devolve o mesmo';
  perform pg_temp.as_('zilda');
  assert public.accept_family_invite(pg_temp.code('zilda'), 'fa-f10-0003') ->> 'invited_by' = 'Pessoa da Família', 'Zilda também';
  perform pg_temp.as_('nara');
  assert public.accept_family_invite(pg_temp.code('nara'), 'fa-f10-0004') ->> 'invited_by' = 'Pessoa da Família', 'Nara também';

  -- A visão, vista por cada papel: o rótulo neutro para quem não tem nome de verdade; nunca e-mail, início de e-mail nem nome inteiro.
  foreach p in array array['yara', 'zilda', 'nara', 'wagner'] loop
    perform pg_temp.as_(p);
    assert (select first_name from public.family_member_items where person_id = pg_temp.id('yara')) = 'Pessoa da Família', p || ' vê a Yara sem o início do e-mail';
    assert (select first_name from public.family_member_items where person_id = pg_temp.id('zilda')) = 'Pessoa da Família', p || ' vê a Zilda sem o e-mail';
    assert (select first_name from public.family_member_items where person_id = pg_temp.id('nara')) = 'Pessoa da Família', p || ' vê a Nara sem o início do e-mail';
    assert (select first_name from public.family_member_items where person_id = pg_temp.id('wagner')) = 'Wagner', p || ' vê o primeiro nome do Wagner';
    assert (select count(*) from public.family_member_items) = 4, p || ' vê as quatro pessoas';
    assert not exists (select 1 from public.family_member_items i
                        where to_jsonb(i)::text ~* '(@|yara|zilda|nara|exemplo|casa\.test|Neves|Costa)' and i.first_name <> 'Wagner'),
      p || ': nenhuma linha traz e-mail, início de e-mail ou sobrenome';
    assert (select string_agg(i.first_name, ',' order by i.first_name collate "C") from public.family_member_items i)
         = 'Pessoa da Família,Pessoa da Família,Pessoa da Família,Wagner', p || ': os quatro nomes';
  end loop;

  -- persons: cada pessoa lê só a própria linha, qualquer que seja o papel (titular, membro e leitora).
  foreach p in array array['yara', 'zilda', 'nara', 'wagner'] loop
    perform pg_temp.as_(p);
    assert (select count(*) from public.persons) = 1 and (select id from public.persons) = auth.uid(), p || ' lê só a própria linha de persons';
    assert (select count(*) from public.persons where id <> auth.uid()) = 0, p || ' não lê o nome inteiro de ninguém';
  end loop;
  perform pg_temp.as_('wagner');
  assert (select display_name from public.persons where id = pg_temp.id('yara')) is null, 'o nome da Yara não é lido pelo Wagner';
  assert (select display_name from public.persons where id = auth.uid()) = 'Wagner Costa', 'mas a própria pessoa lê o seu';
  assert (select count(*) from public.persons p join public.context_memberships m on m.person_id = p.id
           where m.context_id = pg_temp.id('cy')) = 1, 'unir vínculos a persons também só devolve a própria';
  -- Ninguém muda a linha de outra pessoa; a própria muda, e a visão acompanha.
  update public.persons set display_name = 'Yara Intrusa' where id = pg_temp.id('yara');
  update public.persons set display_name = 'wagner' where id = auth.uid();
  assert (select first_name from public.family_member_items where person_id = pg_temp.id('wagner')) = 'Pessoa da Família',
    'o nome que é o início do e-mail (wagner@) vira o rótulo neutro, também quando a pessoa o escreve depois';
  update public.persons set display_name = 'Wagner Costa' where id = auth.uid();
  assert (select first_name from public.family_member_items where person_id = pg_temp.id('wagner')) = 'Wagner', 'e volta a mostrar o primeiro nome';
  perform pg_temp.as_('yara');
  assert (select display_name from public.persons) = 'yara.lopes', 'ninguém mudou a linha da Yara';
  update public.persons set display_name = 'Yara Lopes' where id = auth.uid();
  perform pg_temp.as_('wagner');
  assert (select first_name from public.family_member_items where person_id = pg_temp.id('yara')) = 'Yara', 'com nome de verdade, o primeiro nome aparece';
  -- Ex-membro: o rótulo segue a mesma regra.
  perform pg_temp.as_('yara');
  perform public.remove_family_member(pg_temp.id('cy'), pg_temp.id('zilda'), 'fa-f10-0005');
  assert (select first_name || ':' || status from public.family_member_items where person_id = pg_temp.id('zilda')) = 'Pessoa da Família:ex-membro',
    'ex-membro sem nome de verdade também aparece com o rótulo neutro';
  -- Quem é de fora não lê a Casa Yara nem a pessoa dela.
  perform pg_temp.as_('otto');
  assert (select count(*) from public.family_member_items where context_id = pg_temp.id('cy')) = 0, 'Otto não vê a Casa Yara';
  assert (select count(*) from public.persons) = 1, 'e lê só a própria linha';
end $$;
reset role;
do $$
begin
  -- A política: uma só de leitura, só a própria linha. A atualização continua só da própria pessoa.
  assert (select count(*) from pg_policies where schemaname = 'public' and tablename = 'persons' and cmd = 'SELECT') = 1
     and (select qual from pg_policies where schemaname = 'public' and tablename = 'persons' and policyname = 'persons_read') = '(id = ( SELECT auth.uid() AS uid))',
    'persons_read: só id = (select auth.uid()), a forma da 0017';
  assert (select count(*) from pg_policies where schemaname = 'public' and tablename = 'persons' and cmd = 'UPDATE') = 1, 'e uma política de atualização';
  -- A visão e a função usam a mesma regra (a função de apoio lê o e-mail com os privilégios de quem a criou).
  perform pg_temp.as_('yara');
  assert (select count(*) from public.family_member_items where context_id = pg_temp.id('cy')) = 4, 'a visão, lida como dona';
  assert not exists (select 1 from public.family_member_items i where i.first_name is distinct from public.clarevo_person_label(i.person_id)),
    'a visão e clarevo_person_label dão o mesmo primeiro nome';
  assert public.clarevo_person_label(pg_temp.id('zilda')) = 'Pessoa da Família' and public.clarevo_person_label(pg_temp.id('nara')) = 'Pessoa da Família'
     and public.clarevo_person_label(pg_temp.id('wagner')) = 'Wagner' and public.clarevo_person_label(pg_temp.id('yara')) = 'Yara'
     and public.clarevo_person_label(gen_random_uuid()) = 'Pessoa da Família', 'o rótulo por pessoa';
  perform set_config('request.jwt.claim.sub', '', true);
end $$;

-- ---------------------------------------------------------------------------
-- 18. F9: a trava da Família vem antes da conferência do titular, nas seis funções de titular, e o aceite confere o espaço da pessoa
--     antes de buscar o código. A corrida de verdade (duas chamadas ao mesmo tempo) está em `npm run test:api`, no teste de
--     concorrência da Família; aqui o efeito é conferido de forma determinística, pela ordem do que cada função faz.
-- ---------------------------------------------------------------------------
do $$
declare
  f text;
  src text;
begin
  foreach f in array array['create_family_invite(uuid, text, text)', 'cancel_family_invite(uuid, text)', 'remove_family_member(uuid, uuid, text)',
                           'set_member_role(uuid, uuid, text, text)', 'transfer_family_ownership(uuid, uuid, text)', 'end_family(uuid, text)'] loop
    src := (select prosrc from pg_proc where oid = ('public.' || f)::regprocedure);
    assert position('pg_advisory_xact_lock(hashtext(''familia:c:''' in src) > 0 and position('clarevo_require_family_owner(' in src) > 0
       and position('pg_advisory_xact_lock(hashtext(''familia:c:''' in src) < position('clarevo_require_family_owner(' in src),
      'a trava da Família vem antes de conferir o titular: ' || f;
    assert (select count(*) from regexp_matches(src, 'familia:c:', 'g')) = 1 and (select count(*) from regexp_matches(src, 'clarevo_require_family_owner\(', 'g')) = 1,
      'uma trava e uma conferência: ' || f;
  end loop;
  -- O alvo de remover, mudar papel e passar a titularidade nunca é o titular ativo.
  foreach f in array array['remove_family_member(uuid, uuid, text)', 'set_member_role(uuid, uuid, text, text)', 'transfer_family_ownership(uuid, uuid, text)'] loop
    src := (select prosrc from pg_proc where oid = ('public.' || f)::regprocedure);
    assert position('revoked_at is null and role <> ''titular'' for update' in src) > 0, 'a busca do alvo exclui o titular: ' || f;
  end loop;
  -- Aceitar: o espaço pessoal antes do código (a conta sem espaço recebe a mesma resposta para qualquer código).
  src := (select prosrc from pg_proc where oid = 'public.accept_family_invite(text, text)'::regprocedure);
  assert position('from public.persons where id = v_uid' in src) > 0
     and position('from public.persons where id = v_uid' in src) < position('from public.family_invites where code_hash' in src)
     and position('from public.persons where id = v_uid' in src) < position('v_code_hash is null' in src),
    'accept_family_invite confere persons antes de olhar o código';
end $$;
-- A sequência que a trava garante na corrida: depois que a titularidade passa, quem era titular perde cada ação de titular e não
-- remove o novo titular. Sempre sobra um titular ativo.
set role authenticated;
do $$
declare
  cy uuid := pg_temp.id('cy');
  inv uuid := (select invite from codes where name = 'nara');
begin
  perform pg_temp.as_('yara');
  perform public.transfer_family_ownership(cy, pg_temp.id('wagner'), 'fa-f9-0001');
  perform pg_temp.expect_code(format($f$select public.remove_family_member(%L, %L, 'fa-f9-0002')$f$, cy, pg_temp.id('wagner')), 'sem_permissao', '42501');
  perform pg_temp.expect_code(format($f$select public.set_member_role(%L, %L, 'leitor', 'fa-f9-0003')$f$, cy, pg_temp.id('wagner')), 'sem_permissao', '42501');
  perform pg_temp.expect_code(format($f$select public.transfer_family_ownership(%L, %L, 'fa-f9-0004')$f$, cy, pg_temp.id('nara')), 'sem_permissao', '42501');
  perform pg_temp.expect_code(format($f$select public.create_family_invite(%L, 'membro', 'fa-f9-0005')$f$, cy), 'sem_permissao', '42501');
  perform pg_temp.expect_code(format($f$select public.cancel_family_invite(%L, 'fa-f9-0006')$f$, inv), 'sem_permissao', '42501');
  perform pg_temp.expect_code(format($f$select public.end_family(%L, 'fa-f9-0007')$f$, cy), 'sem_permissao', '42501');
end $$;
reset role;
do $$
begin
  assert (select count(*) from public.context_memberships where context_id = pg_temp.id('cy') and role = 'titular' and revoked_at is null) = 1
     and pg_temp.mem('wagner', 'cy') = 'titular t t t f', 'sempre um titular ativo, e é o Wagner';
  assert pg_temp.mem('yara', 'cy') = 'membro t t f f', 'e a Yara virou membro';
  assert (select count(*) from public.record_operations where idempotency_key like 'fa-f9-000%') = 1, 'só a passagem da titularidade gravou operação';
end $$;

-- ---------------------------------------------------------------------------
-- 18. Apagar a conta de quem aceitou um convite: o `on delete set null` de family_invites.used_by passa pela guarda do convite, que
--     aceita essa única mudança (used_by de uma pessoa para nulo, com o resto igual). Antes, a guarda recusava (campo_imutavel) e quem
--     já tinha entrado na Família por um convite não conseguia apagar a conta. Olga é titular e Pedro, membro por convite.
-- ---------------------------------------------------------------------------
insert into ids values ('olga', '00000000-0000-0000-0000-0000000000a5'), ('pedro', '00000000-0000-0000-0000-0000000000b5');
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a5', 'olga@exemplo.test',  now(), '{"display_name":"Olga Reis"}'),
  ('00000000-0000-0000-0000-0000000000b5', 'pedro@exemplo.test', now(), '{"display_name":"Pedro Lima"}');
set role authenticated;
do $$
declare
  p text;
  space jsonb;
begin
  foreach p in array array['olga', 'pedro'] loop
    perform pg_temp.as_(p);
    space := public.ensure_personal_space('Conta principal');
    insert into ids values (p || '_ctx', (space ->> 'context_id')::uuid);
  end loop;
  perform pg_temp.as_('olga');
  insert into ids values ('fol', (public.create_family('Casa da Olga', 'fa-del-0001') #>> '{context,id}')::uuid);
  perform pg_temp.inv('pedro_in', 'olga', 'membro', 'fol');
  perform pg_temp.as_('pedro');
  perform public.accept_family_invite(pg_temp.code('pedro_in'), 'fa-del-0002');
  assert pg_temp.mem('pedro', 'fol') = 'membro t t f f', 'Pedro entrou como membro pelo convite';
end $$;
reset role;
create temp table inv_before as select * from public.family_invites where id = (select invite from codes where name = 'pedro_in');
do $$
declare
  v_inv uuid := (select invite from codes where name = 'pedro_in');
begin
  assert (select (used_by, used_at is not null) from inv_before) = (pg_temp.id('pedro'), true), 'antes: convite usado por Pedro';
  -- A guarda segue recusando qualquer outra mudança num convite usado.
  perform pg_temp.expect_error(format($f$update public.family_invites set used_by = %L where id = %L$f$, pg_temp.id('olga'), v_inv), 'campo_imutavel');
  perform pg_temp.expect_error(format($f$update public.family_invites set used_at = null where id = %L$f$, v_inv), 'campo_imutavel');
  perform pg_temp.expect_error(format($f$update public.family_invites set used_by = null, used_at = used_at + interval '1 minute' where id = %L$f$, v_inv), 'campo_imutavel');
  perform pg_temp.expect_error(format($f$update public.family_invites set used_by = null, role = 'leitor' where id = %L$f$, v_inv), 'campo_imutavel');
  perform pg_temp.expect_error(format($f$update public.family_invites set used_by = null, cancelled_at = now() where id = %L$f$, v_inv), '%family_invites_estado%');
  assert (select used_by from public.family_invites where id = v_inv) = pg_temp.id('pedro'), 'as recusas não mudaram nada';
  -- Apagar a conta do Pedro (primeiro o espaço pessoal, como na exclusão da conta).
  delete from public.financial_contexts where owner_person_id = pg_temp.id('pedro');
  delete from auth.users where id = pg_temp.id('pedro');
  assert not exists (select 1 from auth.users where id = pg_temp.id('pedro')) and not exists (select 1 from public.persons where id = pg_temp.id('pedro')), 'a conta do Pedro foi apagada';
  assert not exists (select 1 from public.context_memberships where person_id = pg_temp.id('pedro')), 'o vínculo saiu com a conta';
  assert (select used_by from public.family_invites where id = v_inv) is null, 'o convite ficou com used_by nulo';
  assert (select (i.context_id, i.created_by, i.role, i.code_hash, i.expires_at, i.created_at, i.used_at, i.cancelled_at)
            from public.family_invites i where i.id = v_inv)
       = (select (b.context_id, b.created_by, b.role, b.code_hash, b.expires_at, b.created_at, b.used_at, b.cancelled_at) from inv_before b),
    'o resto do convite não mudou (continua usado, não vale de novo)';
  -- O convite usado, agora sem pessoa, segue sem valer.
  perform pg_temp.as_('olga');
  assert pg_temp.err(format($f$select public.preview_family_invite(%L)$f$, pg_temp.code('pedro_in'))) like 'convite_invalido|%', 'o link usado segue sem valer';
  assert (select count(*) from public.context_memberships where context_id = pg_temp.id('fol') and revoked_at is null) = 1, 'a Olga segue titular, sozinha';
end $$;
drop table inv_before;

select pg_temp.check_links();

rollback;
