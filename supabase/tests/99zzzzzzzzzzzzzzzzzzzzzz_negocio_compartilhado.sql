-- Negócio compartilhado (D-116, Clarevo Plus; migração 20261123000001_negocio_compartilhado.sql). Confere: a chave do Plus fechada
-- por padrão (ninguém convida) e aberta só pela equipe; a tabela de convites, a visão das pessoas e as oito funções do app, com as
-- auxiliares fechadas; convidar (quem administra, papel, código uma vez só, repetição, 6 pessoas contando convites); a prévia; aceitar
-- (espaço pessoal, uso único, ja_no_negocio, ja_tem_negocio, negocio_cheio, reativar o vínculo); quem anota e quem só vê; mudar o
-- papel; cancelar convite; sair e remover (o que a pessoa anotou fica, as retiradas dela deixam de ser ligadas); quem administra não
-- sai; encerrar só sem outras pessoas e cancelando os convites; um negócio por pessoa também em create_business; a trava da assinatura
-- só em convidar; nenhuma ação conta como anotação; e a exclusão da conta (quem participa sai com a autoria anônima; quem administra
-- com outras pessoas recebe negocio_com_membros e nada muda).
-- Pessoas FICTÍCIAS: Ana (administra o Sacolé da Ana), Beto (anota), Cris (só vê, depois anota), Davi (tem o próprio negócio), Eva
-- (sem nome: aparece como "Pessoa do negócio"), Fabi (participa e exclui a conta) e Gil (administra com outra pessoa e tenta excluir
-- a conta). Tudo em uma transação desfeita no fim.
\set ON_ERROR_STOP 1
\set ana  '''00000000-0000-0000-0000-0000000000f2'''
\set beto '''00000000-0000-0000-0000-0000000000f3'''
\set cris '''00000000-0000-0000-0000-0000000000f4'''
\set davi '''00000000-0000-0000-0000-0000000000f5'''
\set eva  '''00000000-0000-0000-0000-0000000000f6'''
\set fabi '''00000000-0000-0000-0000-0000000000f7'''
\set gil  '''00000000-0000-0000-0000-0000000000f8'''

begin;
set local clarevo.today = '2026-11-23';

create temp table ids (name text primary key, id uuid not null);
create temp table codes (name text primary key, code text not null);
grant select, insert, update on ids, codes to authenticated;
create function pg_temp.id(p_name text) returns uuid language sql as $$ select id from ids where name = p_name $$;
create function pg_temp.keep(p_name text, p_id uuid) returns void language sql as $$
  insert into ids values (p_name, p_id) on conflict (name) do update set id = excluded.id
$$;
create function pg_temp.code(p_name text) returns text language sql as $$ select code from codes where name = p_name $$;
create function pg_temp.keep_code(p_name text, p_code text) returns void language sql as $$
  insert into codes values (p_name, p_code) on conflict (name) do update set code = excluded.code
$$;
create function pg_temp.as_(p_name text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', pg_temp.id(p_name)::text, true);
$$;
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
-- Leituras direto nas tabelas (sem a RLS), como o dono do banco.
create function pg_temp.rec(p_id uuid) returns public.financial_records language sql security definer set search_path = public, pg_temp as $$
  select * from public.financial_records where id = p_id
$$;
create function pg_temp.member(p_ctx uuid, p_person uuid) returns public.context_memberships language sql security definer set search_path = public, pg_temp as $$
  select * from public.context_memberships where context_id = p_ctx and person_id = p_person
$$;
create function pg_temp.invite(p_id uuid) returns public.business_invites language sql security definer set search_path = public, pg_temp as $$
  select * from public.business_invites where id = p_id
$$;
create function pg_temp.ops(p_action text) returns bigint language sql security definer set search_path = public, pg_temp as $$
  select count(*) from public.record_operations where action = p_action
$$;
create function pg_temp.activity(p_ctx uuid) returns bigint language sql security definer set search_path = public, pg_temp as $$
  select count(*) from public.context_activity where context_id = p_ctx
$$;
create function pg_temp.acc(p_ctx uuid) returns uuid language sql security definer set search_path = public, pg_temp as $$
  select id from public.financial_accounts where context_id = p_ctx order by created_at, id limit 1
$$;
grant execute on function pg_temp.id(text), pg_temp.keep(text, uuid), pg_temp.code(text), pg_temp.keep_code(text, text), pg_temp.as_(text),
  pg_temp.expect_code(text, text, text), pg_temp.rec(uuid), pg_temp.member(uuid, uuid), pg_temp.invite(uuid), pg_temp.ops(text),
  pg_temp.activity(uuid), pg_temp.acc(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 1. Esquema e privilégios
-- ---------------------------------------------------------------------------
do $$
declare
  f text;
begin
  assert (select open_from from public.plus_settings) is null and (select count(*) from public.plus_settings) = 1,
    'a chave do Plus nasce fechada, numa linha só';
  assert not public.clarevo_plus_open(), 'o Plus está fechado';
  assert not has_table_privilege('authenticated', 'public.plus_settings', 'select, insert, update, delete')
     and not has_table_privilege('anon', 'public.plus_settings', 'select'), 'ninguém com sessão lê nem muda a chave do Plus';
  assert (select relrowsecurity from pg_class where oid = 'public.business_invites'::regclass), 'RLS nos convites do negócio';
  assert has_column_privilege('authenticated', 'public.business_invites', 'role', 'select')
     and not has_column_privilege('authenticated', 'public.business_invites', 'code_hash', 'select'),
    'o resumo do código nunca é lido pelo app';
  assert not has_table_privilege('authenticated', 'public.business_invites', 'insert, update, delete, truncate')
     and not has_table_privilege('anon', 'public.business_invites', 'select'), 'sem escrita direta nos convites, e anon não lê';
  assert has_table_privilege('authenticated', 'public.business_member_items', 'select')
     and not has_table_privilege('authenticated', 'public.business_member_items', 'insert, update, delete, truncate')
     and not has_table_privilege('anon', 'public.business_member_items', 'select'), 'a visão das pessoas só para leitura';
  assert exists (select 1 from pg_trigger where tgname = 'business_invites_guard' and not tgisinternal), 'guarda dos convites';
  foreach f in array array['plus_status()', 'create_business_invite(uuid, text, text)', 'cancel_business_invite(uuid, text)',
                           'preview_business_invite(text)', 'accept_business_invite(text, text)', 'leave_business(uuid, text)',
                           'remove_business_member(uuid, uuid, text)', 'set_business_member_role(uuid, uuid, text, text)'] loop
    assert has_function_privilege('authenticated', 'public.' || f, 'execute') and not has_function_privilege('anon', 'public.' || f, 'execute'),
      'só authenticated executa ' || f;
    assert (select prosecdef from pg_proc where oid = ('public.' || f)::regprocedure), 'security definer: ' || f;
  end loop;
  foreach f in array array['clarevo_plus_open()', 'clarevo_plus_allows(uuid)', 'clarevo_staff_set_plus(timestamp with time zone)',
                           'clarevo_active_business_count(uuid)', 'clarevo_business_active_count(uuid)', 'clarevo_business_valid_invites(uuid)',
                           'clarevo_business_invite_json(uuid)', 'clarevo_business_accept_json(uuid)', 'clarevo_unlink_withdrawals(uuid, uuid)',
                           'clarevo_erase_person(uuid)', 'clarevo_track_activity()', 'clarevo_write_free_actions()'] loop
    assert not has_function_privilege('authenticated', 'public.' || f, 'execute') and not has_function_privilege('anon', 'public.' || f, 'execute')
       and not has_function_privilege('service_role', 'public.' || f, 'execute'), 'auxiliar fechada: ' || f;
  end loop;
  assert array['sair_negocio', 'aceitar_convite_negocio', 'remover_membro_negocio', 'alterar_papel_negocio', 'cancelar_convite_negocio']
         <@ public.clarevo_write_free_actions()
     and not ('criar_convite_negocio' = any (public.clarevo_write_free_actions())),
    'só convidar passa pela trava da assinatura';
end $$;

insert into ids values ('ana', :ana), ('beto', :beto), ('cris', :cris), ('davi', :davi), ('eva', :eva), ('fabi', :fabi), ('gil', :gil);
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  (:ana, 'ana.plus@exemplo.test', now(), '{"display_name":"Ana Souza"}'),
  (:beto, 'beto.plus@exemplo.test', now(), '{"display_name":"Beto"}'),
  (:cris, 'cris.plus@exemplo.test', now(), '{"display_name":"Cris"}'),
  (:davi, 'davi.plus@exemplo.test', now(), '{"display_name":"Davi"}'),
  (:eva, 'eva.plus@exemplo.test', now(), '{}'),
  (:fabi, 'fabi.plus@exemplo.test', now(), '{"display_name":"Fabi"}'),
  (:gil, 'gil.plus@exemplo.test', now(), '{"display_name":"Gil"}');

set role authenticated;

-- ---------------------------------------------------------------------------
-- 2. Com o Plus fechado, ninguém convida (e nada é gravado)
-- ---------------------------------------------------------------------------
select pg_temp.as_('ana');
do $$
declare
  space jsonb := public.ensure_personal_space('Conta principal');
  biz uuid;
begin
  perform pg_temp.keep('ana_pes', (space ->> 'context_id')::uuid);
  perform pg_temp.keep('ana_pes_acc', (space #>> '{account,id}')::uuid);
  biz := (public.create_business('Sacolé da Ana', 'nc-a-0001') #>> '{context,id}')::uuid;
  perform pg_temp.keep('biz', biz);
  perform pg_temp.keep('biz_acc', pg_temp.acc(biz));
  assert public.plus_status() = '{"open": false}'::jsonb, 'plus_status: fechado';
  perform pg_temp.expect_code(format('select public.create_business_invite(%L, %L, %L)', biz, 'membro', 'nc-a-0002'), 'plus_indisponivel', 'PT402');
  assert pg_temp.ops('criar_convite_negocio') = 0 and (select count(*) from public.business_invites) = 0, 'nada gravado';
  assert (select count(*) from public.business_member_items where context_id = biz) = 1
     and (select first_name || ':' || role || ':' || status || ':' || is_me from public.business_member_items where context_id = biz) = 'Ana:titular:ativo:true',
    'a visão mostra só quem administra, com o primeiro nome';
end $$;
-- A equipe não muda a chave pelo app.
select pg_temp.expect_code('select public.clarevo_staff_set_plus(now())', 'permission denied for function clarevo_staff_set_plus', '42501');
select pg_temp.expect_code('update public.plus_settings set open_from = now()', 'permission denied for table plus_settings', '42501');

-- ---------------------------------------------------------------------------
-- 3. A equipe abre o Plus (no SQL Editor)
-- ---------------------------------------------------------------------------
reset role;
do $$
declare
  r jsonb := public.clarevo_staff_set_plus(now() - interval '1 minute');
begin
  assert (r ->> 'open')::boolean and r ->> 'open_from' is not null, 'aberto';
  r := public.clarevo_staff_set_plus(now() + interval '1 day');
  assert not (r ->> 'open')::boolean, 'aberto só a partir de amanhã: ainda fechado';
  r := public.clarevo_staff_set_plus(now() - interval '1 minute');
  assert (r ->> 'open')::boolean, 'aberto de novo';
end $$;
set role authenticated;

-- ---------------------------------------------------------------------------
-- 4. Convidar
-- ---------------------------------------------------------------------------
select pg_temp.as_('ana');
do $$
declare
  biz uuid := pg_temp.id('biz');
  res jsonb;
  again jsonb;
  inv public.business_invites;
begin
  assert public.plus_status() = '{"open": true}'::jsonb, 'plus_status: aberto';
  perform pg_temp.expect_code(format('select public.create_business_invite(%L, %L, %L)', biz, 'titular', 'nc-i-0001'), 'papel_invalido', '22023');
  perform pg_temp.expect_code(format('select public.create_business_invite(%L, %L, %L)', biz, null, 'nc-i-0002'), 'papel_invalido', '22023');
  perform pg_temp.expect_code(format('select public.create_business_invite(%L, %L, %L)', pg_temp.id('ana_pes'), 'membro', 'nc-i-0003'), 'contexto_invalido', '22023');
  perform pg_temp.expect_code(format('select public.create_business_invite(%L, %L, %L)', gen_random_uuid(), 'membro', 'nc-i-0004'), 'nao_encontrado', 'P0002');
  perform pg_temp.expect_code(format('select public.create_business_invite(%L, %L, %L)', biz, 'membro', 'curta'), 'chave_invalida', '22023');
  res := public.create_business_invite(biz, 'membro', 'nc-i-0010');
  assert res ->> 'code' ~ '^[0-9a-f]{32}$', 'o código vem uma vez, com 32 hexadecimais';
  assert not (res -> 'invite' ? 'code_hash') and res #>> '{invite,role}' = 'membro' and (res #>> '{invite,context_id}')::uuid = biz
     and res #>> '{invite,used_at}' is null and res #>> '{invite,cancelled_at}' is null, 'o convite sem o resumo do código';
  inv := pg_temp.invite((res #>> '{invite,id}')::uuid);
  assert inv.code_hash = encode(sha256(convert_to(res ->> 'code', 'UTF8')), 'hex') and inv.code_hash <> res ->> 'code', 'só o resumo é gravado';
  assert inv.expires_at between now() + interval '7 days' - interval '1 minute' and now() + interval '7 days' + interval '1 minute', 'vale 7 dias';
  perform pg_temp.keep_code('beto', res ->> 'code');
  perform pg_temp.keep('inv_beto', inv.id);
  again := public.create_business_invite(biz, 'membro', 'nc-i-0010');
  assert again ->> 'code' is null and again -> 'invite' = res -> 'invite', 'repetir a chave devolve o convite sem o código';
  perform pg_temp.expect_code(format('select public.create_business_invite(%L, %L, %L)', biz, 'leitor', 'nc-i-0010'), 'chave_reutilizada', 'PT409');
  res := public.create_business_invite(biz, 'leitor', 'nc-i-0011');
  perform pg_temp.keep_code('cris', res ->> 'code');
  perform pg_temp.keep('inv_cris', (res #>> '{invite,id}')::uuid);
  assert (select count(*) from public.business_invites where context_id = biz) = 2, 'quem administra lê os convites (RLS)';
  assert pg_temp.ops('criar_convite_negocio') = 2 and pg_temp.activity(biz) = 0, 'a operação é gravada e não conta como anotação';
end $$;

-- ---------------------------------------------------------------------------
-- 5. Prévia
-- ---------------------------------------------------------------------------
select pg_temp.as_('beto');
do $$
declare
  p jsonb;
begin
  perform pg_temp.expect_code($q$select public.preview_business_invite('nao-e-codigo')$q$, 'convite_invalido', 'P0002');
  perform pg_temp.expect_code(format('select public.preview_business_invite(%L)', repeat('a', 32)), 'convite_invalido', 'P0002');
  p := public.preview_business_invite(upper(pg_temp.code('beto')));
  assert p ->> 'business_name' = 'Sacolé da Ana' and p ->> 'invited_by' = 'Ana' and p ->> 'role' = 'membro' and p ->> 'expires_at' is not null
     and (select count(*) from jsonb_object_keys(p)) = 4, 'a prévia mostra só o nome, o primeiro nome de quem convidou, o papel e a validade';
  -- Um código do negócio não vale na Família.
  perform pg_temp.expect_code(format('select public.preview_family_invite(%L)', pg_temp.code('beto')), 'convite_invalido', 'P0002');
end $$;
select set_config('request.jwt.claim.sub', '', true);
select pg_temp.expect_code(format('select public.preview_business_invite(%L)', pg_temp.code('beto')), 'nao_autenticado', '42501');

-- ---------------------------------------------------------------------------
-- 6. Aceitar
-- ---------------------------------------------------------------------------
select pg_temp.as_('beto');
-- Sem espaço pessoal ainda: sem_permissao, para qualquer código.
select pg_temp.expect_code(format('select public.accept_business_invite(%L, %L)', pg_temp.code('beto'), 'nc-b-0001'), 'sem_permissao', '42501');
select pg_temp.expect_code(format('select public.accept_business_invite(%L, %L)', 'x', 'nc-b-0002'), 'sem_permissao', '42501');
do $$
declare
  space jsonb := public.ensure_personal_space('Conta principal');
  res jsonb;
  again jsonb;
  biz uuid := pg_temp.id('biz');
begin
  perform pg_temp.keep('beto_pes', (space ->> 'context_id')::uuid);
  perform pg_temp.keep('beto_pes_acc', (space #>> '{account,id}')::uuid);
  assert (select count(*) from public.financial_contexts where id = biz) = 0, 'antes de aceitar, o Beto não lê o negócio';
  perform pg_temp.expect_code(format('select public.accept_business_invite(%L, %L)', repeat('b', 32), 'nc-b-0003'), 'convite_invalido', 'P0002');
  perform pg_temp.expect_code(format('select public.accept_family_invite(%L, %L)', pg_temp.code('beto'), 'nc-b-0004'), 'convite_invalido', 'P0002');
  res := public.accept_business_invite(pg_temp.code('beto'), 'nc-b-0010');
  assert (res #>> '{context,id}')::uuid = biz and res #>> '{context,name}' = 'Sacolé da Ana' and res ->> 'role' = 'membro'
     and res ->> 'invited_by' = 'Ana', 'entra como quem anota';
  again := public.accept_business_invite(pg_temp.code('beto'), 'nc-b-0010');
  assert again = res, 'repetir a chave devolve o mesmo';
  assert (pg_temp.member(biz, pg_temp.id('beto'))).can_write and not (pg_temp.member(biz, pg_temp.id('beto'))).can_edit_others
     and (pg_temp.member(biz, pg_temp.id('beto'))).role = 'membro', 'vínculo: lê e anota, sem editar o dos outros';
  assert (pg_temp.invite(pg_temp.id('inv_beto'))).used_by = pg_temp.id('beto'), 'uso único marcado';
  assert (select count(*) from public.financial_contexts where id = biz) = 1, 'agora o Beto lê o negócio';
  assert (select count(*) from public.business_invites) = 0, 'quem anota não lê os convites';
  assert (select count(*) from public.financial_contexts where id = pg_temp.id('ana_pes')) = 0, 'nem o Pessoal da Ana';
  assert (select array_agg(first_name || ':' || role || ':' || is_me order by joined_at) from public.business_member_items where context_id = biz)
       = array['Ana:titular:false', 'Beto:membro:true'], 'o Beto vê as pessoas do negócio';
  -- Já está no negócio; e um negócio por pessoa: criar o próprio é recusado.
  perform pg_temp.expect_code(format('select public.accept_business_invite(%L, %L)', pg_temp.code('cris'), 'nc-b-0011'), 'ja_no_negocio', 'PT409');
  perform pg_temp.expect_code($q$select public.create_business('Bicicletaria do Beto', 'nc-b-0012')$q$, 'ja_tem_negocio', 'PT409');
  -- Anota no negócio.
  perform pg_temp.keep('beto_rec', (public.create_record('nc-b-0013', biz, pg_temp.id('biz_acc'), 'receita', 2500, '2026-11-20', 'Sacolés na feira', 'Vendas')).id);
  assert pg_temp.activity(biz) = 1, 'a anotação conta (só ela)';
end $$;
-- O código usado não serve de novo.
select pg_temp.as_('cris');
do $$
declare
  space jsonb := public.ensure_personal_space('Conta principal');
begin
  perform pg_temp.keep('cris_pes', (space ->> 'context_id')::uuid);
  perform pg_temp.keep('cris_pes_acc', (space #>> '{account,id}')::uuid);
  perform pg_temp.expect_code(format('select public.preview_business_invite(%L)', pg_temp.code('beto')), 'convite_invalido', 'P0002');
  perform pg_temp.expect_code(format('select public.accept_business_invite(%L, %L)', pg_temp.code('beto'), 'nc-c-0001'), 'convite_invalido', 'P0002');
  assert (public.accept_business_invite(pg_temp.code('cris'), 'nc-c-0002') ->> 'role') = 'leitor', 'a Cris entra como quem só vê';
  assert (select count(*) from public.financial_records where context_id = pg_temp.id('biz')) = 1, 'a Cris lê o que o Beto anotou';
  perform pg_temp.expect_code(format('select public.create_record(%L, %L, %L, %L, %s, %L, %L)', 'nc-c-0003', pg_temp.id('biz'), pg_temp.id('biz_acc'), 'receita', 1000, '2026-11-20', 'Venda'),
                              'sem_permissao', '42501');
  perform pg_temp.expect_code(format('select public.create_business_withdrawal(%L, %L, %L, %L, %s, %L)', 'nc-c-0004', pg_temp.id('biz'), pg_temp.id('biz_acc'), pg_temp.id('cris_pes_acc'), 100, '2026-11-20'),
                              'sem_permissao', '42501');
  -- Quem não administra não convida, não cancela, não muda papel nem remove.
  perform pg_temp.expect_code(format('select public.create_business_invite(%L, %L, %L)', pg_temp.id('biz'), 'membro', 'nc-c-0005'), 'sem_permissao', '42501');
  perform pg_temp.expect_code(format('select public.cancel_business_invite(%L, %L)', pg_temp.id('inv_beto'), 'nc-c-0006'), 'sem_permissao', '42501');
  perform pg_temp.expect_code(format('select public.set_business_member_role(%L, %L, %L, %L)', pg_temp.id('biz'), pg_temp.id('beto'), 'leitor', 'nc-c-0007'), 'sem_permissao', '42501');
  perform pg_temp.expect_code(format('select public.remove_business_member(%L, %L, %L)', pg_temp.id('biz'), pg_temp.id('beto'), 'nc-c-0008'), 'sem_permissao', '42501');
  perform pg_temp.expect_code(format('select public.rename_business(%L, %L, %L)', pg_temp.id('biz'), 'Outro', 'nc-c-0009'), 'sem_permissao', '42501');
  perform pg_temp.expect_code(format('select public.end_business(%L, %L)', pg_temp.id('biz'), 'nc-c-0010'), 'sem_permissao', '42501');
end $$;
-- Quem já tem o próprio negócio não entra em outro.
select pg_temp.as_('ana');
do $$ begin
  perform pg_temp.keep_code('davi', public.create_business_invite(pg_temp.id('biz'), 'membro', 'nc-a-0010') ->> 'code');
end $$;
select pg_temp.as_('davi');
do $$
declare
  space jsonb := public.ensure_personal_space('Conta principal');
begin
  perform public.create_business('Oficina do Davi', 'nc-d-0001');
  perform pg_temp.expect_code(format('select public.accept_business_invite(%L, %L)', pg_temp.code('davi'), 'nc-d-0002'), 'ja_tem_negocio', 'PT409');
  assert (select count(*) from public.financial_contexts where id = pg_temp.id('biz')) = 0, 'o Davi não entrou';
end $$;

-- ---------------------------------------------------------------------------
-- 7. Mudar o papel e as vagas
-- ---------------------------------------------------------------------------
select pg_temp.as_('ana');
do $$
declare
  biz uuid := pg_temp.id('biz');
  r jsonb;
  i int;
begin
  perform pg_temp.expect_code(format('select public.set_business_member_role(%L, %L, %L, %L)', biz, pg_temp.id('cris'), 'titular', 'nc-r-0001'), 'papel_invalido', '22023');
  perform pg_temp.expect_code(format('select public.set_business_member_role(%L, %L, %L, %L)', biz, pg_temp.id('ana'), 'leitor', 'nc-r-0002'), 'nao_sobre_si', 'PT409');
  perform pg_temp.expect_code(format('select public.set_business_member_role(%L, %L, %L, %L)', biz, pg_temp.id('davi'), 'leitor', 'nc-r-0003'), 'nao_encontrado', 'P0002');
  r := public.set_business_member_role(biz, pg_temp.id('cris'), 'membro', 'nc-r-0010');
  assert r ->> 'role' = 'membro' and (pg_temp.member(biz, pg_temp.id('cris'))).can_write, 'a Cris passa a anotar';
  assert public.set_business_member_role(biz, pg_temp.id('cris'), 'membro', 'nc-r-0010') = r, 'repetir devolve o mesmo';
  -- Vagas: Ana, Beto, Cris ativos + 1 convite válido (o do Davi) = 4. Mais 2 convites enchem; o 7º é recusado.
  perform public.create_business_invite(biz, 'leitor', 'nc-r-0020');
  perform pg_temp.keep_code('eva', public.create_business_invite(biz, 'membro', 'nc-r-0021') ->> 'code');
  perform pg_temp.expect_code(format('select public.create_business_invite(%L, %L, %L)', biz, 'membro', 'nc-r-0022'), 'negocio_cheio', 'PT409');
  -- Cancelar o convite do Davi libera uma vaga; o cancelado não vale mais.
  r := public.cancel_business_invite((select id from public.business_invites i where i.context_id = biz and i.used_at is null and i.cancelled_at is null
                                        order by created_at limit 1), 'nc-r-0030');
  assert r #>> '{invite,cancelled_at}' is not null, 'cancelado';
  perform pg_temp.expect_code(format('select public.cancel_business_invite(%L, %L)', pg_temp.id('inv_beto'), 'nc-r-0031'), 'convite_ja_usado', 'PT409');
  perform pg_temp.expect_code(format('select public.cancel_business_invite(%L, %L)', gen_random_uuid(), 'nc-r-0032'), 'nao_encontrado', 'P0002');
  perform pg_temp.keep_code('fabi', public.create_business_invite(biz, 'membro', 'nc-r-0033') ->> 'code');
end $$;
select pg_temp.as_('davi');
select pg_temp.expect_code(format('select public.preview_business_invite(%L)', pg_temp.code('davi')), 'convite_invalido', 'P0002');

-- Eva (sem nome) e Fabi entram: 5 pessoas ativas e 1 convite válido.
select pg_temp.as_('eva');
do $$ begin
  perform public.ensure_personal_space('Conta principal');
  perform public.accept_business_invite(pg_temp.code('eva'), 'nc-e-0001');
  assert (select first_name from public.business_member_items where context_id = pg_temp.id('biz') and is_me) = 'Pessoa do negócio',
    'sem nome, a pessoa aparece como "Pessoa do negócio" (nunca o e-mail)';
end $$;
select pg_temp.as_('fabi');
do $$
declare
  space jsonb := public.ensure_personal_space('Conta principal');
begin
  perform pg_temp.keep('fabi_pes', (space ->> 'context_id')::uuid);
  perform public.accept_business_invite(pg_temp.code('fabi'), 'nc-f-0001');
  perform pg_temp.keep('fabi_rec', (public.create_record('nc-f-0002', pg_temp.id('biz'), pg_temp.id('biz_acc'), 'despesa', 800, '2026-11-21', 'Gelo', 'Material e mercadoria')).id);
  perform public.create_business_withdrawal('nc-f-0003', pg_temp.id('biz'), pg_temp.id('biz_acc'), (space #>> '{account,id}')::uuid, 300, '2026-11-21');
end $$;
-- Com 6 vagas tomadas (5 pessoas + 1 convite), mais um convite é recusado; e um convite aceito com a casa cheia também.
select pg_temp.as_('ana');
select pg_temp.expect_code(format('select public.create_business_invite(%L, %L, %L)', pg_temp.id('biz'), 'leitor', 'nc-a-0020'), 'negocio_cheio', 'PT409');

-- ---------------------------------------------------------------------------
-- 8. Retirada de quem anota, sair e remover
-- ---------------------------------------------------------------------------
select pg_temp.as_('beto');
do $$
declare
  res jsonb;
begin
  res := public.create_business_withdrawal('nc-w-0001', pg_temp.id('biz'), pg_temp.id('biz_acc'), pg_temp.id('beto_pes_acc'), 1500, '2026-11-22');
  perform pg_temp.keep('beto_wb', (res #>> '{business_record,id}')::uuid);
  perform pg_temp.keep('beto_wp', (res #>> '{personal_record,id}')::uuid);
  assert (pg_temp.rec(pg_temp.id('beto_wp'))).context_id = pg_temp.id('beto_pes'), 'a retirada do Beto entra no Pessoal dele';
end $$;
-- A Ana tem a própria retirada, que não pode mudar quando o Beto sai.
select pg_temp.as_('ana');
do $$
declare
  res jsonb := public.create_business_withdrawal('nc-w-0002', pg_temp.id('biz'), pg_temp.id('biz_acc'), pg_temp.id('ana_pes_acc'), 2000, '2026-11-22');
begin
  perform pg_temp.keep('ana_wb', (res #>> '{business_record,id}')::uuid);
  perform pg_temp.keep('ana_wp', (res #>> '{personal_record,id}')::uuid);
  perform pg_temp.expect_code(format('select public.leave_business(%L, %L)', pg_temp.id('biz'), 'nc-a-0030'), 'titular_nao_sai', 'PT409');
  perform pg_temp.expect_code(format('select public.remove_business_member(%L, %L, %L)', pg_temp.id('biz'), pg_temp.id('ana'), 'nc-a-0031'), 'nao_sobre_si', 'PT409');
  perform pg_temp.expect_code(format('select public.end_business(%L, %L)', pg_temp.id('biz'), 'nc-a-0032'), 'negocio_com_membros', 'PT409');
end $$;
select pg_temp.as_('beto');
do $$
declare
  r jsonb;
begin
  perform pg_temp.expect_code(format('select public.leave_business(%L, %L)', pg_temp.id('beto_pes'), 'nc-l-0001'), 'contexto_invalido', '22023');
  r := public.leave_business(pg_temp.id('biz'), 'nc-l-0010');
  assert r ->> 'left' = 'true' and (r ->> 'context_id')::uuid = pg_temp.id('biz'), 'o Beto saiu';
  assert public.leave_business(pg_temp.id('biz'), 'nc-l-0010') = r, 'repetir devolve o mesmo, mesmo depois de sair';
  assert (select count(*) from public.financial_contexts where id = pg_temp.id('biz')) = 0, 'o Beto não lê mais o negócio';
  assert (pg_temp.rec(pg_temp.id('beto_wp'))).paired_record_id is null and (pg_temp.rec(pg_temp.id('beto_wb'))).paired_record_id is null,
    'a retirada do Beto deixa de ser ligada, dos dois lados';
  assert (pg_temp.rec(pg_temp.id('ana_wp'))).paired_record_id = pg_temp.id('ana_wb'), 'a da Ana continua ligada';
  -- O recebimento no Pessoal dele vira comum: ele pode excluir.
  perform public.delete_record('nc-l-0011', pg_temp.id('beto_wp'), (pg_temp.rec(pg_temp.id('beto_wp'))).version);
  perform pg_temp.expect_code(format('select public.leave_business(%L, %L)', pg_temp.id('biz'), 'nc-l-0012'), 'nao_encontrado', 'P0002');
end $$;
select pg_temp.as_('ana');
do $$
declare
  biz uuid := pg_temp.id('biz');
begin
  assert (pg_temp.rec(pg_temp.id('beto_rec'))).deleted_at is null and (select count(*) from public.financial_records where id = pg_temp.id('beto_rec')) = 1,
    'o que o Beto anotou continua no negócio';
  assert (select status || ':' || (left_at is not null) from public.business_member_items where context_id = biz and person_id = pg_temp.id('beto')) = 'ex-membro:true',
    'o Beto aparece como quem saiu';
  -- Remover a Cris (que anota): a pessoa precisa estar ativa.
  perform pg_temp.expect_code(format('select public.remove_business_member(%L, %L, %L)', biz, pg_temp.id('beto'), 'nc-m-0001'), 'nao_encontrado', 'P0002');
  assert public.remove_business_member(biz, pg_temp.id('cris'), 'nc-m-0010') ->> 'removed' = 'true', 'a Cris foi removida';
  assert (pg_temp.member(biz, pg_temp.id('cris'))).revoked_at is not null, 'vínculo revogado';
  -- Voltar por um novo convite reativa o mesmo vínculo.
  perform pg_temp.keep_code('beto2', public.create_business_invite(biz, 'leitor', 'nc-m-0020') ->> 'code');
end $$;
select pg_temp.as_('beto');
do $$ begin
  assert public.accept_business_invite(pg_temp.code('beto2'), 'nc-b-0020') ->> 'role' = 'leitor', 'o Beto volta, como quem só vê';
  assert (select count(*) from public.context_memberships where context_id = pg_temp.id('biz') and person_id = pg_temp.id('beto')) = 1
     and (pg_temp.member(pg_temp.id('biz'), pg_temp.id('beto'))).revoked_at is null, 'o mesmo vínculo, reativado';
end $$;

-- ---------------------------------------------------------------------------
-- 9. Só ver e exportar: convidar é recusado; sair, remover, mudar o papel, cancelar e aceitar valem
-- ---------------------------------------------------------------------------
reset role;
update public.billing_settings set enforced_from = now() - interval '40 days';
update public.persons set created_at = now() - interval '60 days' where id in (:ana, :beto);
set role authenticated;
select pg_temp.as_('ana');
select pg_temp.expect_code(format('select public.create_business_invite(%L, %L, %L)', pg_temp.id('biz'), 'leitor', 'nc-s-0001'), 'assinatura_necessaria', 'PT402');
do $$ begin
  assert public.set_business_member_role(pg_temp.id('biz'), pg_temp.id('beto'), 'membro', 'nc-s-0002') ->> 'role' = 'membro', 'mudar o papel vale';
  perform public.cancel_business_invite((select id from public.business_invites i where i.context_id = pg_temp.id('biz') and i.used_at is null and i.cancelled_at is null
                                           order by created_at limit 1), 'nc-s-0003');
end $$;
select pg_temp.as_('beto');
do $$ begin
  assert public.leave_business(pg_temp.id('biz'), 'nc-s-0004') ->> 'left' = 'true', 'sair vale em só ver e exportar';
end $$;
reset role;
update public.billing_settings set enforced_from = null;
set role authenticated;

-- ---------------------------------------------------------------------------
-- 10. Nenhuma ação conta como anotação; as operações apontam para o alvo
-- ---------------------------------------------------------------------------
reset role;
do $$ begin
  assert not exists (select 1 from public.context_activity a where a.context_id = pg_temp.id('biz') and a.person_id = pg_temp.id('cris')),
    'aceitar, ter o papel mudado e ser removida não contam como anotação';
  assert not exists (select 1 from public.record_operations o
                      where o.action in ('criar_convite_negocio', 'cancelar_convite_negocio', 'aceitar_convite_negocio', 'sair_negocio',
                                         'remover_membro_negocio', 'alterar_papel_negocio')
                        and (o.target_id is null or o.record_id is not null or o.commitment_id is not null)), 'toda operação aponta para o alvo';
  assert (select count(*) from public.record_operations where action = 'sair_negocio' and target_id = pg_temp.id('biz')) = 2
     and (select count(*) from public.record_operations where action = 'remover_membro_negocio' and target_id = pg_temp.id('cris')) = 1,
    'sair aponta para o negócio; remover, para a pessoa';
end $$;
set role authenticated;

-- ---------------------------------------------------------------------------
-- 11. Exclusão da conta: quem participa sai com a autoria anônima; quem administra com outras pessoas é recusado
-- ---------------------------------------------------------------------------
select pg_temp.as_('fabi');
do $$ begin
  perform public.delete_my_account('EXCLUIR', 'nc-x-0001');
end $$;
reset role;
do $$ begin
  assert (select count(*) from public.financial_records where id = pg_temp.id('fabi_rec')) = 1, 'o que a Fabi anotou no negócio fica';
  assert (select count(*) from public.financial_contexts where id = pg_temp.id('fabi_pes')) = 0, 'o Pessoal dela sai';
  assert not exists (select 1 from public.financial_records r where r.context_id = pg_temp.id('biz') and r.paired_record_id is not null
                       and not exists (select 1 from public.financial_records o where o.id = r.paired_record_id)), 'nenhum vínculo solto';
end $$;
set role authenticated;
select pg_temp.as_('ana');
do $$ begin
  assert (select first_name || ':' || status from public.business_member_items where context_id = pg_temp.id('biz') and person_id = pg_temp.id('fabi'))
       = 'Pessoa que saiu:ex-membro', 'quem excluiu a conta aparece como "Pessoa que saiu"';
end $$;
-- Gil administra um negócio com a Eva? Não: a Eva já está no da Ana. Gil chama a Cris (que foi removida e está livre).
select pg_temp.as_('gil');
do $$
declare
  space jsonb := public.ensure_personal_space('Conta principal');
  biz uuid;
begin
  biz := (public.create_business('Brechó do Gil', 'nc-g-0001') #>> '{context,id}')::uuid;
  perform pg_temp.keep('gil_biz', biz);
  perform pg_temp.keep_code('gil_cris', public.create_business_invite(biz, 'membro', 'nc-g-0002') ->> 'code');
end $$;
select pg_temp.as_('cris');
do $$ begin
  perform public.accept_business_invite(pg_temp.code('gil_cris'), 'nc-c-0020');
end $$;
select pg_temp.as_('gil');
select pg_temp.expect_code($q$select public.delete_my_account('EXCLUIR', 'nc-g-0003')$q$, 'negocio_com_membros', 'PT409');
reset role;
do $$ begin
  assert (select count(*) from public.persons where id = pg_temp.id('gil') and deleted_at is null) = 1
     and (select count(*) from public.financial_contexts where id = pg_temp.id('gil_biz') and ended_at is null) = 1
     and (pg_temp.member(pg_temp.id('gil_biz'), pg_temp.id('cris'))).revoked_at is null, 'nada mudou';
end $$;
set role authenticated;
-- Removida a Cris, o Gil exclui a conta e o negócio dele sai inteiro (com os convites).
select pg_temp.as_('gil');
do $$ begin
  perform public.remove_business_member(pg_temp.id('gil_biz'), pg_temp.id('cris'), 'nc-g-0004');
  perform public.delete_my_account('EXCLUIR', 'nc-g-0005');
end $$;
reset role;
do $$ begin
  assert (select count(*) from public.financial_contexts where id = pg_temp.id('gil_biz')) = 0
     and (select count(*) from public.business_invites where context_id = pg_temp.id('gil_biz')) = 0, 'o negócio do Gil sai, com os convites';
end $$;
set role authenticated;

-- ---------------------------------------------------------------------------
-- 12. Encerrar: só sem outras pessoas, e cancela os convites pendentes
-- ---------------------------------------------------------------------------
select pg_temp.as_('ana');
do $$
declare
  biz uuid := pg_temp.id('biz');
  pend uuid;
begin
  pend := (public.create_business_invite(biz, 'leitor', 'nc-n-0001') #>> '{invite,id}')::uuid;
  perform pg_temp.expect_code(format('select public.end_business(%L, %L)', biz, 'nc-n-0002'), 'negocio_com_membros', 'PT409');
  perform public.remove_business_member(biz, pg_temp.id('eva'), 'nc-n-0003');
  assert public.end_business(biz, 'nc-n-0004') ->> 'ended' = 'true', 'encerrado';
  assert (pg_temp.invite(pend)).cancelled_at is not null, 'o convite pendente foi cancelado';
  assert (pg_temp.rec(pg_temp.id('ana_wp'))).paired_record_id is null, 'as retiradas da Ana deixam de ser ligadas';
end $$;

rollback;
