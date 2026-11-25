-- Negócio com equipe no Plus (D-123; migração 20261126000001_negocio_equipe.sql). Confere: as colunas e as regras novas, as três funções
-- do app (só authenticated) e as auxiliares fechadas; com o Plus fechado, nem sociedade nem convite da Contabilidade; a sociedade (só
-- quem administra, repetição, limpar, trava da assinatura, não conta como anotação); a Contabilidade (convite, 3 acessos contando
-- convites, fora do limite de 6 e da regra de um negócio por vez, só lê aquele negócio, não muda de papel, não recebe a administração,
-- a lista my_accounting_businesses, sair, ser removida, reativar como outra pessoa); passar a administração (quem pode, a quem, os
-- papéis depois, sair depois, convites e retiradas, vale em só ver e exportar e com o Plus fechado); encerrar e excluir a conta com
-- só a Contabilidade; e nenhuma ação nova conta como anotação.
-- Pessoas FICTÍCIAS: Lia (administra a Doceria da Lia), Teo (anota, recebe a administração), Rui (só vê, depois administra), Nora
-- (Contabilidade, com o próprio negócio), Ivo (Contabilidade, depois anota em outro negócio), Zeca e Mel (Contabilidade) e Paulo
-- (administra a Oficina do Paulo, só com a Contabilidade, e exclui a conta). Tudo em uma transação desfeita no fim.
\set ON_ERROR_STOP 1
\set lia   '''00000000-0000-0000-0000-0000000001a1'''
\set teo   '''00000000-0000-0000-0000-0000000001a2'''
\set rui   '''00000000-0000-0000-0000-0000000001a3'''
\set nora  '''00000000-0000-0000-0000-0000000001a4'''
\set ivo   '''00000000-0000-0000-0000-0000000001a5'''
\set zeca  '''00000000-0000-0000-0000-0000000001a6'''
\set mel   '''00000000-0000-0000-0000-0000000001a7'''
\set paulo '''00000000-0000-0000-0000-0000000001a8'''

begin;
set local clarevo.today = '2026-11-26';

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
create function pg_temp.ctx(p_id uuid) returns public.financial_contexts language sql security definer set search_path = public, pg_temp as $$
  select * from public.financial_contexts where id = p_id
$$;
create function pg_temp.ops(p_action text) returns bigint language sql security definer set search_path = public, pg_temp as $$
  select count(*) from public.record_operations where action = p_action
$$;
create function pg_temp.acc(p_ctx uuid) returns uuid language sql security definer set search_path = public, pg_temp as $$
  select id from public.financial_accounts where context_id = p_ctx order by created_at, id limit 1
$$;
create function pg_temp.items(p_ctx uuid) returns text language sql as $$
  select string_agg(first_name || ':' || role || ':' || status, ', ' order by joined_at, person_id)
    from public.business_member_items where context_id = p_ctx
$$;
grant execute on function pg_temp.id(text), pg_temp.keep(text, uuid), pg_temp.code(text), pg_temp.keep_code(text, text), pg_temp.as_(text),
  pg_temp.expect_code(text, text, text), pg_temp.rec(uuid), pg_temp.member(uuid, uuid), pg_temp.invite(uuid), pg_temp.ctx(uuid),
  pg_temp.ops(text), pg_temp.acc(uuid), pg_temp.items(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 1. Esquema e privilégios
-- ---------------------------------------------------------------------------
do $$
declare
  f text;
begin
  assert (select is_nullable = 'NO' and column_default = 'false' and data_type = 'boolean' from information_schema.columns
           where table_schema = 'public' and table_name = 'context_memberships' and column_name = 'accountant'),
    'context_memberships.accountant: booleano, não nulo, falso por padrão';
  assert (select is_nullable = 'YES' and data_type = 'boolean' from information_schema.columns
           where table_schema = 'public' and table_name = 'financial_contexts' and column_name = 'business_partnership'),
    'financial_contexts.business_partnership: booleano nulo';
  assert exists (select 1 from pg_constraint where conname = 'context_memberships_contabilidade')
     and exists (select 1 from pg_constraint where conname = 'financial_contexts_sociedade')
     and pg_get_constraintdef((select oid from pg_constraint where conname = 'business_invites_papel')) ~ 'contabilidade',
    'as regras novas existem';
  assert not exists (select 1 from public.context_memberships where accountant)
     and not exists (select 1 from public.financial_contexts where business_partnership is not null),
    'nenhum dado muda: as colunas nascem falsas ou nulas';
  foreach f in array array['transfer_business_admin(uuid, uuid, text)', 'set_business_partnership(uuid, boolean, text)',
                           'my_accounting_businesses()', 'create_business_invite(uuid, text, text)', 'accept_business_invite(text, text)',
                           'set_business_member_role(uuid, uuid, text, text)', 'end_business(uuid, text)'] loop
    assert has_function_privilege('authenticated', 'public.' || f, 'execute') and not has_function_privilege('anon', 'public.' || f, 'execute'),
      'só authenticated executa ' || f;
    assert (select prosecdef from pg_proc where oid = ('public.' || f)::regprocedure), 'security definer: ' || f;
  end loop;
  foreach f in array array['clarevo_business_accountants(uuid, boolean)', 'clarevo_active_business_count(uuid)',
                           'clarevo_business_active_count(uuid)', 'clarevo_business_valid_invites(uuid)', 'clarevo_business_json(uuid)',
                           'clarevo_erase_person(uuid)', 'clarevo_track_activity()', 'clarevo_write_free_actions()'] loop
    assert not has_function_privilege('authenticated', 'public.' || f, 'execute') and not has_function_privilege('anon', 'public.' || f, 'execute')
       and not has_function_privilege('service_role', 'public.' || f, 'execute'), 'auxiliar fechada: ' || f;
  end loop;
  assert not has_function_privilege('authenticated', 'public.clarevo_member_role(uuid, uuid)', 'execute'), 'clarevo_member_role continua fechada';
  assert 'transferir_administracao_negocio' = any (public.clarevo_write_free_actions())
     and not ('definir_sociedade_negocio' = any (public.clarevo_write_free_actions())),
    'passar a administração vale em só ver e exportar; definir a sociedade passa pela trava';
  assert (select count(*) from pg_constraint c, regexp_matches(pg_get_constraintdef(c.oid), '''([a-z_]+)''::text', 'g') m
           where c.conname = 'record_operations_action_check' and m[1] in ('transferir_administracao_negocio', 'definir_sociedade_negocio')) = 2,
    'as duas ações novas';
end $$;

insert into ids values ('lia', :lia), ('teo', :teo), ('rui', :rui), ('nora', :nora), ('ivo', :ivo), ('zeca', :zeca), ('mel', :mel), ('paulo', :paulo);
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  (:lia, 'lia.equipe@exemplo.test', now(), '{"display_name":"Lia Prado"}'),
  (:teo, 'teo.equipe@exemplo.test', now(), '{"display_name":"Teo"}'),
  (:rui, 'rui.equipe@exemplo.test', now(), '{"display_name":"Rui"}'),
  (:nora, 'nora.equipe@exemplo.test', now(), '{"display_name":"Nora"}'),
  (:ivo, 'ivo.equipe@exemplo.test', now(), '{"display_name":"Ivo"}'),
  (:zeca, 'zeca.equipe@exemplo.test', now(), '{"display_name":"Zeca"}'),
  (:mel, 'mel.equipe@exemplo.test', now(), '{"display_name":"Mel"}'),
  (:paulo, 'paulo.equipe@exemplo.test', now(), '{"display_name":"Paulo"}');

set role authenticated;

-- Os espaços pessoais de todo mundo.
do $$
declare
  n text;
  space jsonb;
begin
  foreach n in array array['lia', 'teo', 'rui', 'nora', 'ivo', 'zeca', 'mel', 'paulo'] loop
    perform pg_temp.as_(n);
    space := public.ensure_personal_space('Conta principal');
    perform pg_temp.keep(n || '_pes', (space ->> 'context_id')::uuid);
    perform pg_temp.keep(n || '_pes_acc', (space #>> '{account,id}')::uuid);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Com o Plus fechado: nem sociedade nem convite (e nada é gravado); a lista da Contabilidade vem vazia
-- ---------------------------------------------------------------------------
select pg_temp.as_('lia');
do $$
declare
  r jsonb;
  biz uuid;
begin
  r := public.create_business('Doceria da Lia', 'eq-l-0001');
  biz := (r #>> '{context,id}')::uuid;
  perform pg_temp.keep('biz', biz);
  perform pg_temp.keep('biz_acc', pg_temp.acc(biz));
  assert (r -> 'context') ? 'business_partnership' and r #> '{context,business_partnership}' = 'null'::jsonb,
    'o negócio devolve business_partnership (nulo: não respondeu)';
  perform pg_temp.expect_code(format('select public.set_business_partnership(%L, true, %L)', biz, 'eq-l-0002'), 'plus_indisponivel', 'PT402');
  perform pg_temp.expect_code(format('select public.create_business_invite(%L, %L, %L)', biz, 'contabilidade', 'eq-l-0003'), 'plus_indisponivel', 'PT402');
  assert pg_temp.ops('definir_sociedade_negocio') = 0 and pg_temp.ops('criar_convite_negocio') = 0, 'nada gravado';
  assert public.my_accounting_businesses() = '[]'::jsonb, 'ninguém acompanha negócio nenhum';
end $$;

reset role;
select public.clarevo_staff_set_plus(now() - interval '1 minute');
set role authenticated;

-- ---------------------------------------------------------------------------
-- 3. Sociedade: só quem administra; repetir a chave devolve o mesmo; nulo limpa; outra resposta com a mesma chave é recusada
-- ---------------------------------------------------------------------------
select pg_temp.as_('teo');
select pg_temp.expect_code(format('select public.set_business_partnership(%L, true, %L)', pg_temp.id('biz'), 'eq-t-0001'), 'nao_encontrado', 'P0002');
select pg_temp.expect_code(format('select public.set_business_partnership(%L, true, %L)', pg_temp.id('teo_pes'), 'eq-t-0002'), 'contexto_invalido', '22023');
select pg_temp.as_('lia');
do $$
declare
  biz uuid := pg_temp.id('biz');
  r jsonb;
begin
  r := public.set_business_partnership(biz, true, 'eq-l-0010');
  assert r #>> '{context,business_partnership}' = 'true' and r #>> '{context,name}' = 'Doceria da Lia', 'sociedade: sim';
  assert public.set_business_partnership(biz, true, 'eq-l-0010') = r, 'repetir a chave devolve o mesmo';
  perform pg_temp.expect_code(format('select public.set_business_partnership(%L, false, %L)', biz, 'eq-l-0010'), 'chave_reutilizada', 'PT409');
  assert public.set_business_partnership(biz, null, 'eq-l-0011') #> '{context,business_partnership}' = 'null'::jsonb, 'nulo limpa';
  assert public.set_business_partnership(biz, false, 'eq-l-0012') #>> '{context,business_partnership}' = 'false', 'sociedade: não';
  assert public.set_business_partnership(biz, true, 'eq-l-0013') #>> '{context,business_partnership}' = 'true', 'sociedade: sim de novo';
  assert (pg_temp.ctx(biz)).business_partnership, 'gravado no negócio';
  assert public.rename_business(biz, 'Doceria da Lia', 'eq-l-0014') #>> '{context,business_partnership}' = 'true',
    'as outras funções do negócio devolvem a resposta';
  assert (select count(*) from public.record_operations where action = 'definir_sociedade_negocio' and target_id = biz) = 4,
    'cada resposta grava a operação, apontando para o negócio';
end $$;
-- Só no negócio: o Pessoal nunca guarda a resposta. E responder a sociedade não conta como anotação (a Lia só criou, respondeu e
-- renomeou).
reset role;
do $$ begin
  assert not exists (select 1 from public.context_activity a where a.context_id = pg_temp.id('biz') and a.person_id = pg_temp.id('lia')),
    'definir a sociedade não conta como anotação';
end $$;
select pg_temp.expect_code(format('update public.financial_contexts set business_partnership = true where id = %L', pg_temp.id('lia_pes')),
  'new row for relation "financial_contexts" violates check constraint "financial_contexts_sociedade"', '23514');
set role authenticated;

-- ---------------------------------------------------------------------------
-- 4. Convidar a Contabilidade: até 3 acessos (contando convites); fora do limite de 6 pessoas
-- ---------------------------------------------------------------------------
select pg_temp.as_('lia');
do $$
declare
  biz uuid := pg_temp.id('biz');
  r jsonb;
  extra uuid[] := '{}';
  i integer;
begin
  r := public.create_business_invite(biz, 'contabilidade', 'eq-l-0020');
  assert r #>> '{invite,role}' = 'contabilidade' and r ->> 'code' ~ '^[0-9a-f]{32}$', 'convite da Contabilidade, com o código uma vez só';
  perform pg_temp.keep_code('nora', r ->> 'code');
  perform pg_temp.keep_code('ivo', public.create_business_invite(biz, 'contabilidade', 'eq-l-0021') ->> 'code');
  perform pg_temp.keep_code('zeca', public.create_business_invite(biz, 'contabilidade', 'eq-l-0022') ->> 'code');
  perform pg_temp.expect_code(format('select public.create_business_invite(%L, %L, %L)', biz, 'contabilidade', 'eq-l-0023'), 'contabilidade_cheia', 'PT409');
  -- As pessoas: Lia e 5 convites somam 6, e os 3 convites da Contabilidade não contam.
  perform pg_temp.keep_code('teo', public.create_business_invite(biz, 'membro', 'eq-l-0024') ->> 'code');
  perform pg_temp.keep_code('rui', public.create_business_invite(biz, 'leitor', 'eq-l-0025') ->> 'code');
  for i in 1..3 loop
    extra := extra || (public.create_business_invite(biz, 'membro', 'eq-l-003' || i) #>> '{invite,id}')::uuid;
  end loop;
  perform pg_temp.expect_code(format('select public.create_business_invite(%L, %L, %L)', biz, 'membro', 'eq-l-0034'), 'negocio_cheio', 'PT409');
  for i in 1..3 loop
    perform public.cancel_business_invite(extra[i], 'eq-l-004' || i);
  end loop;
  perform pg_temp.expect_code(format('select public.create_business_invite(%L, %L, %L)', biz, 'gerente', 'eq-l-0045'), 'papel_invalido', '22023');
end $$;

-- Teo (anota) e Rui (só vê) entram.
select pg_temp.as_('teo');
do $$ begin
  assert public.accept_business_invite(pg_temp.code('teo'), 'eq-t-0010') ->> 'role' = 'membro', 'Teo anota';
end $$;
select pg_temp.as_('rui');
do $$ begin
  assert public.accept_business_invite(pg_temp.code('rui'), 'eq-r-0010') ->> 'role' = 'leitor', 'Rui só vê';
end $$;

-- ---------------------------------------------------------------------------
-- 5. A Nora, com o próprio negócio, entra como Contabilidade: só lê aquele negócio
-- ---------------------------------------------------------------------------
select pg_temp.as_('nora');
do $$
declare
  own uuid;
  p jsonb;
  r jsonb;
  biz uuid := pg_temp.id('biz');
begin
  own := (public.create_business('Ateliê da Nora', 'eq-n-0001') #>> '{context,id}')::uuid;
  perform pg_temp.keep('nora_biz', own);
  p := public.preview_business_invite(pg_temp.code('nora'));
  assert p ->> 'role' = 'contabilidade' and p ->> 'business_name' = 'Doceria da Lia' and p ->> 'invited_by' = 'Lia', 'a prévia mostra o papel';
  r := public.accept_business_invite(pg_temp.code('nora'), 'eq-n-0002');
  assert r ->> 'role' = 'contabilidade' and r #>> '{context,name}' = 'Doceria da Lia' and r #>> '{context,business_partnership}' = 'true',
    'aceitar mesmo com o próprio negócio (fora da regra de um negócio por vez)';
  assert public.accept_business_invite(pg_temp.code('nora'), 'eq-n-0002') = r, 'repetir a chave devolve o mesmo';
  assert ((pg_temp.member(biz, pg_temp.id('nora'))).role::text, (pg_temp.member(biz, pg_temp.id('nora'))).can_write,
          (pg_temp.member(biz, pg_temp.id('nora'))).can_edit_others, (pg_temp.member(biz, pg_temp.id('nora'))).accountant)
       = ('membro', false, false, true), 'o vínculo da Contabilidade: membro sem escrita, accountant';
  -- A lista da área própria.
  assert jsonb_array_length(public.my_accounting_businesses()) = 1
     and public.my_accounting_businesses() -> 0 ->> 'id' = biz::text
     and public.my_accounting_businesses() -> 0 ->> 'name' = 'Doceria da Lia'
     and public.my_accounting_businesses() -> 0 ->> 'admin_name' = 'Lia'
     and public.my_accounting_businesses() -> 0 ->> 'since' is not null
     and (public.my_accounting_businesses() -> 0 ->> 'created_at')::timestamptz = (pg_temp.ctx(biz)).created_at
     and public.my_accounting_businesses() -> 0 ? 'business_profile', 'my_accounting_businesses: o negócio que a Nora acompanha';
  -- Lê o negócio, nunca o Pessoal de ninguém nem os convites; não anota.
  assert (select count(*) from public.financial_contexts where id = biz) = 1, 'lê o negócio';
  assert (select count(*) from public.financial_contexts where id in (pg_temp.id('lia_pes'), pg_temp.id('teo_pes'))) = 0, 'nunca o Pessoal';
  assert (select count(*) from public.business_invites where context_id = biz) = 0, 'não lê os convites';
  assert (select count(*) from public.business_member_items where context_id = biz and role = 'contabilidade' and first_name = 'Nora') = 1,
    'a visão mostra o papel contabilidade';
  perform pg_temp.expect_code(format('select public.create_record(%L, %L, %L, %L, %s, %L, %L, %L)', 'eq-n-0003', biz, pg_temp.id('biz_acc'),
                                     'receita', 1000, '2026-11-26', 'Venda', 'Vendas'), 'sem_permissao', '42501');
  perform pg_temp.expect_code(format('select public.create_receivable(%L, %L, %L, %L, %s, %L, %L)', 'eq-n-0004', biz, 'fiado', 'Bolo', 5000,
                                     '2026-12-01', 'Vendas'), 'sem_permissao', '42501');
  perform pg_temp.expect_code(format('select public.create_business_invite(%L, %L, %L)', biz, 'membro', 'eq-n-0005'), 'sem_permissao', '42501');
  perform pg_temp.expect_code(format('select public.set_business_partnership(%L, false, %L)', biz, 'eq-n-0006'), 'sem_permissao', '42501');
  -- O próprio negócio continua o único dela: um segundo é recusado como antes.
  perform pg_temp.expect_code($q$select public.create_business('Segundo da Nora', 'eq-n-0007')$q$, 'ja_tem_negocio', 'PT409');
end $$;
-- O Teo anota no negócio, e a Nora lê.
select pg_temp.as_('teo');
do $$ begin
  perform pg_temp.keep('teo_rec', (public.create_record('eq-t-0011', pg_temp.id('biz'), pg_temp.id('biz_acc'), 'receita', 4200, '2026-11-26',
                                                         'Bolos de pote', 'Vendas')).id);
end $$;
select pg_temp.as_('nora');
do $$ begin
  assert (select count(*) from public.financial_records where id = pg_temp.id('teo_rec')) = 1, 'a Contabilidade lê os lançamentos do negócio';
end $$;
-- Ninguém se dá escrita pelo app.
select pg_temp.expect_code(format('update public.context_memberships set can_write = true where context_id = %L and person_id = %L', pg_temp.id('biz'), pg_temp.id('nora')),
  'permission denied for table context_memberships', '42501');
reset role;
select pg_temp.expect_code(format('update public.context_memberships set can_write = true where context_id = %L and person_id = %L', pg_temp.id('biz'), pg_temp.id('nora')),
  'new row for relation "context_memberships" violates check constraint "context_memberships_contabilidade"', '23514');
set role authenticated;

-- ---------------------------------------------------------------------------
-- 6. Três acessos de Contabilidade; o aceite também confere (3 ativos)
-- ---------------------------------------------------------------------------
select pg_temp.as_('ivo');
do $$ begin
  assert public.accept_business_invite(pg_temp.code('ivo'), 'eq-i-0001') ->> 'role' = 'contabilidade', 'Ivo acompanha';
end $$;
-- Com 2 ativos e o convite do Zeca pendente, um terceiro vínculo direto (fora do app) deixa o aceite do Zeca sem vaga.
reset role;
insert into public.context_memberships (context_id, person_id, role, can_read, can_write, can_edit_others, accountant)
values (pg_temp.id('biz'), :mel, 'membro', true, false, false, true);
set role authenticated;
select pg_temp.as_('zeca');
select pg_temp.expect_code(format('select public.accept_business_invite(%L, %L)', pg_temp.code('zeca'), 'eq-z-0001'), 'contabilidade_cheia', 'PT409');
reset role;
delete from public.context_memberships where context_id = pg_temp.id('biz') and person_id = :mel;
set role authenticated;
select pg_temp.as_('zeca');
do $$ begin
  assert public.accept_business_invite(pg_temp.code('zeca'), 'eq-z-0002') ->> 'role' = 'contabilidade', 'com a vaga, o Zeca acompanha';
end $$;
select pg_temp.as_('lia');
do $$
declare
  biz uuid := pg_temp.id('biz');
begin
  perform pg_temp.expect_code(format('select public.create_business_invite(%L, %L, %L)', biz, 'contabilidade', 'eq-l-0050'), 'contabilidade_cheia', 'PT409');
  -- Pessoas: Lia, Teo e Rui (3); a Contabilidade (3) não conta. Ainda cabem 3 convites de pessoas.
  assert (select count(*) from public.business_member_items where context_id = biz and status = 'ativo') = 6, 'seis vínculos ativos ao todo';
  assert (select count(*) from public.business_member_items where context_id = biz and status = 'ativo' and role = 'contabilidade') = 3,
    'três da Contabilidade';
  assert pg_temp.items(biz) = 'Lia:titular:ativo, Teo:membro:ativo, Rui:leitor:ativo, Nora:contabilidade:ativo, Ivo:contabilidade:ativo, Zeca:contabilidade:ativo',
    'a lista com os papéis';
end $$;
reset role;
do $$ begin
  assert public.clarevo_business_active_count(pg_temp.id('biz')) = 3 and public.clarevo_business_accountants(pg_temp.id('biz'), true) = 3,
    'as contagens separadas: 3 pessoas e 3 da Contabilidade';
  assert public.clarevo_member_role(pg_temp.id('biz'), pg_temp.id('nora')) = 'contabilidade', 'clarevo_member_role: contabilidade';
  assert public.clarevo_active_business_count(pg_temp.id('ivo')) = 0 and public.clarevo_active_business_count(pg_temp.id('nora')) = 1,
    'a Contabilidade não conta na regra de um negócio por vez';
end $$;
set role authenticated;

-- ---------------------------------------------------------------------------
-- 7. A Contabilidade não muda de papel e não recebe a administração
-- ---------------------------------------------------------------------------
select pg_temp.as_('lia');
select pg_temp.expect_code(format('select public.set_business_member_role(%L, %L, %L, %L)', pg_temp.id('biz'), pg_temp.id('nora'), 'membro', 'eq-l-0060'), 'papel_invalido', '22023');
select pg_temp.expect_code(format('select public.set_business_member_role(%L, %L, %L, %L)', pg_temp.id('biz'), pg_temp.id('teo'), 'contabilidade', 'eq-l-0061'), 'papel_invalido', '22023');
select pg_temp.expect_code(format('select public.transfer_business_admin(%L, %L, %L)', pg_temp.id('biz'), pg_temp.id('nora'), 'eq-l-0062'), 'papel_invalido', '22023');
select pg_temp.expect_code(format('select public.transfer_business_admin(%L, %L, %L)', pg_temp.id('biz'), pg_temp.id('lia'), 'eq-l-0063'), 'nao_sobre_si', 'PT409');
select pg_temp.expect_code(format('select public.transfer_business_admin(%L, %L, %L)', pg_temp.id('biz'), pg_temp.id('paulo'), 'eq-l-0064'), 'nao_encontrado', 'P0002');
select pg_temp.expect_code(format('select public.transfer_business_admin(%L, null, %L)', pg_temp.id('biz'), 'eq-l-0065'), 'nao_encontrado', 'P0002');
select pg_temp.expect_code(format('select public.transfer_business_admin(%L, %L, %L)', pg_temp.id('lia_pes'), pg_temp.id('teo'), 'eq-l-0066'), 'contexto_invalido', '22023');
select pg_temp.as_('teo');
select pg_temp.expect_code(format('select public.transfer_business_admin(%L, %L, %L)', pg_temp.id('biz'), pg_temp.id('rui'), 'eq-t-0020'), 'sem_permissao', '42501');
select pg_temp.as_('nora');
select pg_temp.expect_code(format('select public.transfer_business_admin(%L, %L, %L)', pg_temp.id('biz'), pg_temp.id('teo'), 'eq-n-0010'), 'sem_permissao', '42501');
select pg_temp.as_('paulo');
select pg_temp.expect_code(format('select public.transfer_business_admin(%L, %L, %L)', pg_temp.id('biz'), pg_temp.id('teo'), 'eq-p-0001'), 'nao_encontrado', 'P0002');

-- ---------------------------------------------------------------------------
-- 8. Passar a administração (Lia → Teo), em só ver e exportar: papéis, convites, retiradas e sair depois
-- ---------------------------------------------------------------------------
select pg_temp.as_('lia');
do $$
declare
  biz uuid := pg_temp.id('biz');
  res jsonb;
begin
  res := public.create_business_withdrawal('eq-l-0070', biz, pg_temp.id('biz_acc'), pg_temp.id('lia_pes_acc'), 1500, '2026-11-26');
  perform pg_temp.keep('lia_wb', (res #>> '{business_record,id}')::uuid);
  perform pg_temp.keep('lia_wp', (res #>> '{personal_record,id}')::uuid);
  perform pg_temp.keep('pend', (public.create_business_invite(biz, 'leitor', 'eq-l-0071') #>> '{invite,id}')::uuid);
  perform pg_temp.keep('pend2', (public.create_business_invite(biz, 'membro', 'eq-l-0076') #>> '{invite,id}')::uuid);
end $$;
reset role;
update public.billing_settings set enforced_from = now() - interval '40 days';
update public.persons set created_at = now() - interval '60 days' where id in (:lia, :teo);
set role authenticated;
select pg_temp.as_('lia');
select pg_temp.expect_code(format('select public.set_business_partnership(%L, false, %L)', pg_temp.id('biz'), 'eq-l-0072'), 'assinatura_necessaria', 'PT402');
do $$
declare
  biz uuid := pg_temp.id('biz');
  r jsonb;
begin
  r := public.transfer_business_admin(biz, pg_temp.id('teo'), 'eq-l-0073');
  assert r = jsonb_build_object('context_id', biz, 'person_id', pg_temp.id('teo'), 'role', 'titular'), 'passar a administração vale em só ver e exportar';
  assert public.transfer_business_admin(biz, pg_temp.id('teo'), 'eq-l-0073') = r, 'repetir a chave devolve o mesmo';
  perform pg_temp.expect_code(format('select public.transfer_business_admin(%L, %L, %L)', biz, pg_temp.id('rui'), 'eq-l-0073'), 'chave_reutilizada', 'PT409');
  assert ((pg_temp.member(biz, pg_temp.id('teo'))).role::text, (pg_temp.member(biz, pg_temp.id('teo'))).can_write,
          (pg_temp.member(biz, pg_temp.id('teo'))).can_edit_others) = ('titular', true, true), 'o Teo administra';
  assert ((pg_temp.member(biz, pg_temp.id('lia'))).role::text, (pg_temp.member(biz, pg_temp.id('lia'))).can_write,
          (pg_temp.member(biz, pg_temp.id('lia'))).can_edit_others, (pg_temp.member(biz, pg_temp.id('lia'))).revoked_at is null)
       = ('membro', true, false, true), 'a Lia continua no negócio e anota';
  assert (pg_temp.ctx(biz)).owner_person_id = pg_temp.id('teo'), 'o negócio passa a ser do Teo';
  assert (pg_temp.rec(pg_temp.id('lia_wp'))).paired_record_id = pg_temp.id('lia_wb'), 'a retirada da Lia continua ligada (ela ainda anota)';
  assert pg_temp.items(biz) like 'Lia:membro:ativo, Teo:titular:ativo, %', 'a lista com os papéis novos';
  -- A Lia não administra mais.
  perform pg_temp.expect_code(format('select public.transfer_business_admin(%L, %L, %L)', biz, pg_temp.id('rui'), 'eq-l-0074'), 'sem_permissao', '42501');
  perform pg_temp.expect_code(format('select public.cancel_business_invite(%L, %L)', pg_temp.id('pend'), 'eq-l-0075'), 'sem_permissao', '42501');
end $$;
select pg_temp.as_('teo');
do $$
declare
  biz uuid := pg_temp.id('biz');
begin
  perform pg_temp.expect_code(format('select public.leave_business(%L, %L)', biz, 'eq-t-0030'), 'titular_nao_sai', 'PT409');
  assert (pg_temp.invite(pg_temp.id('pend'))).cancelled_at is null and (select count(*) from public.business_invites where id = pg_temp.id('pend')) = 1,
    'o convite que a Lia criou continua valendo, e quem administra agora o vê';
  perform pg_temp.expect_code(format('select public.set_business_partnership(%L, false, %L)', biz, 'eq-t-0031'), 'assinatura_necessaria', 'PT402');
end $$;
reset role;
update public.billing_settings set enforced_from = null;
set role authenticated;
select pg_temp.as_('teo');
do $$ begin
  perform public.cancel_business_invite(pg_temp.id('pend'), 'eq-t-0032');
  assert public.set_business_partnership(pg_temp.id('biz'), true, 'eq-t-0033') #>> '{context,business_partnership}' = 'true',
    'quem administra agora responde a sociedade';
  assert (pg_temp.invite(pg_temp.id('pend2'))).cancelled_at is null, 'o outro convite da Lia continua valendo enquanto ela está no negócio';
  perform pg_temp.keep('pend3', (public.create_business_invite(pg_temp.id('biz'), 'leitor', 'eq-t-0034') #>> '{invite,id}')::uuid);
end $$;
-- A Lia sai; a retirada dela deixa de ser ligada, como em qualquer saída.
select pg_temp.as_('lia');
do $$ begin
  assert public.leave_business(pg_temp.id('biz'), 'eq-l-0080') ->> 'left' = 'true', 'depois de passar a administração, a Lia sai';
  assert (pg_temp.rec(pg_temp.id('lia_wp'))).paired_record_id is null, 'a retirada da Lia deixa de ser ligada';
end $$;
reset role;
do $$ begin
  assert (pg_temp.invite(pg_temp.id('pend2'))).cancelled_at is not null and (pg_temp.invite(pg_temp.id('pend2'))).used_at is null,
    'quem sai leva os convites pendentes que criou';
  assert (pg_temp.invite(pg_temp.id('pend3'))).cancelled_at is null, 'os de quem administra agora continuam';
end $$;
set role authenticated;

-- ---------------------------------------------------------------------------
-- 9. Com o Plus fechado, passar a administração ainda vale (Teo → Rui, que só via)
-- ---------------------------------------------------------------------------
reset role;
select public.clarevo_staff_set_plus(null);
set role authenticated;
select pg_temp.as_('teo');
do $$
declare
  biz uuid := pg_temp.id('biz');
begin
  assert public.transfer_business_admin(biz, pg_temp.id('rui'), 'eq-t-0040') ->> 'role' = 'titular', 'com o Plus fechado, vale';
  assert ((pg_temp.member(biz, pg_temp.id('rui'))).role::text, (pg_temp.member(biz, pg_temp.id('rui'))).can_write,
          (pg_temp.member(biz, pg_temp.id('rui'))).can_edit_others) = ('titular', true, true), 'quem só via passa a administrar';
  assert ((pg_temp.member(biz, pg_temp.id('teo'))).role::text, (pg_temp.member(biz, pg_temp.id('teo'))).can_write) = ('membro', true),
    'o Teo continua e anota';
end $$;
select pg_temp.as_('rui');
select pg_temp.expect_code(format('select public.set_business_partnership(%L, false, %L)', pg_temp.id('biz'), 'eq-r-0020'), 'plus_indisponivel', 'PT402');
reset role;
select public.clarevo_staff_set_plus(now() - interval '1 minute');
set role authenticated;

-- ---------------------------------------------------------------------------
-- 10. A Contabilidade sai, é removida e volta como outra pessoa (o vínculo reativado perde o accountant)
-- ---------------------------------------------------------------------------
select pg_temp.as_('zeca');
do $$ begin
  assert public.leave_business(pg_temp.id('biz'), 'eq-z-0010') ->> 'left' = 'true', 'deixar de acompanhar';
  assert public.my_accounting_businesses() = '[]'::jsonb, 'a lista do Zeca fica vazia';
end $$;
select pg_temp.as_('rui');
do $$
declare
  biz uuid := pg_temp.id('biz');
begin
  assert public.remove_business_member(biz, pg_temp.id('ivo'), 'eq-r-0030') ->> 'removed' = 'true', 'quem administra remove a Contabilidade';
  perform pg_temp.keep_code('ivo_membro', public.create_business_invite(biz, 'membro', 'eq-r-0031') ->> 'code');
  perform pg_temp.keep_code('zeca_de_novo', public.create_business_invite(biz, 'contabilidade', 'eq-r-0032') ->> 'code');
end $$;
select pg_temp.as_('ivo');
do $$
declare
  biz uuid := pg_temp.id('biz');
begin
  assert public.accept_business_invite(pg_temp.code('ivo_membro'), 'eq-i-0010') ->> 'role' = 'membro', 'o Ivo volta para anotar';
  assert ((pg_temp.member(biz, pg_temp.id('ivo'))).accountant, (pg_temp.member(biz, pg_temp.id('ivo'))).can_write) = (false, true),
    'o vínculo reativado deixa de ser da Contabilidade';
  assert public.my_accounting_businesses() = '[]'::jsonb, 'e sai da lista da Contabilidade';
end $$;
select pg_temp.as_('zeca');
do $$ begin
  assert public.accept_business_invite(pg_temp.code('zeca_de_novo'), 'eq-z-0011') ->> 'role' = 'contabilidade', 'o Zeca volta a acompanhar';
  assert (pg_temp.member(pg_temp.id('biz'), pg_temp.id('zeca'))).accountant, 'de novo da Contabilidade';
end $$;

-- ---------------------------------------------------------------------------
-- 11. A Oficina do Paulo: a Nora acompanha dois negócios; o Ivo, que anota na Doceria, não entra como pessoa em outro (um por vez)
-- ---------------------------------------------------------------------------
select pg_temp.as_('paulo');
do $$
declare
  biz uuid;
begin
  biz := (public.create_business('Oficina do Paulo', 'eq-p-0010') #>> '{context,id}')::uuid;
  perform pg_temp.keep('paulo_biz', biz);
  perform pg_temp.keep_code('paulo_nora', public.create_business_invite(biz, 'contabilidade', 'eq-p-0011') ->> 'code');
  perform pg_temp.keep_code('paulo_ivo', public.create_business_invite(biz, 'membro', 'eq-p-0012') ->> 'code');
  perform pg_temp.keep_code('paulo_mel', public.create_business_invite(biz, 'membro', 'eq-p-0013') ->> 'code');
end $$;
select pg_temp.as_('ivo');
select pg_temp.expect_code(format('select public.accept_business_invite(%L, %L)', pg_temp.code('paulo_ivo'), 'eq-i-0020'), 'ja_tem_negocio', 'PT409');
select pg_temp.as_('nora');
do $$ begin
  assert public.accept_business_invite(pg_temp.code('paulo_nora'), 'eq-n-0020') ->> 'role' = 'contabilidade', 'a Nora acompanha um segundo negócio';
  assert (select array_agg(x ->> 'name' order by ord) from jsonb_array_elements(public.my_accounting_businesses()) with ordinality t(x, ord))
       = array['Doceria da Lia', 'Oficina do Paulo'], 'os dois, por nome';
  assert (select x ->> 'admin_name' from jsonb_array_elements(public.my_accounting_businesses()) x where x ->> 'name' = 'Doceria da Lia') = 'Rui',
    'admin_name acompanha quem administra agora';
end $$;
-- A Mel (que nunca participou) entra como pessoa no negócio do Paulo.
select pg_temp.as_('mel');
do $$ begin
  perform public.accept_business_invite(pg_temp.code('paulo_mel'), 'eq-m-0001');
end $$;

-- ---------------------------------------------------------------------------
-- 12. Excluir a conta: com outra pessoa, negocio_com_membros; só com a Contabilidade, o negócio sai e a Contabilidade perde o acesso
-- ---------------------------------------------------------------------------
select pg_temp.as_('paulo');
select pg_temp.expect_code($q$select public.delete_my_account('EXCLUIR', 'eq-p-0020')$q$, 'negocio_com_membros', 'PT409');
do $$ begin
  perform public.remove_business_member(pg_temp.id('paulo_biz'), pg_temp.id('mel'), 'eq-p-0021');
  perform public.delete_my_account('EXCLUIR', 'eq-p-0022');
end $$;
reset role;
do $$ begin
  assert (select count(*) from public.financial_contexts where id = pg_temp.id('paulo_biz')) = 0
     and (select count(*) from public.context_memberships where context_id = pg_temp.id('paulo_biz')) = 0,
    'só com a Contabilidade, o negócio do Paulo sai inteiro';
end $$;
set role authenticated;
select pg_temp.as_('nora');
do $$ begin
  assert (select array_agg(x ->> 'name') from jsonb_array_elements(public.my_accounting_businesses()) x) = array['Doceria da Lia'],
    'a Nora continua só com a Doceria';
end $$;

-- ---------------------------------------------------------------------------
-- 13. Nenhuma ação nova conta como anotação; as operações apontam para o alvo
-- ---------------------------------------------------------------------------
-- O Rui (que nunca anotou) passa a administração ao Teo, e o Teo devolve.
select pg_temp.as_('rui');
do $$ begin
  assert public.transfer_business_admin(pg_temp.id('biz'), pg_temp.id('teo'), 'eq-r-0036') ->> 'role' = 'titular', 'Rui → Teo';
end $$;
select pg_temp.as_('teo');
do $$ begin
  assert public.transfer_business_admin(pg_temp.id('biz'), pg_temp.id('rui'), 'eq-t-0051') ->> 'role' = 'titular', 'Teo → Rui';
end $$;
reset role;
do $$ begin
  assert not exists (select 1 from public.context_activity a where a.context_id = pg_temp.id('biz') and a.person_id = pg_temp.id('rui')),
    'o Rui aceitou, recebeu e passou a administração, removeu e convidou: nada conta como anotação';
  assert not exists (select 1 from public.context_activity a where a.context_id = pg_temp.id('biz') and a.person_id in (pg_temp.id('nora'), pg_temp.id('zeca'))),
    'a Contabilidade nunca tem atividade no negócio';
  assert not exists (select 1 from public.record_operations o
                      where o.action in ('transferir_administracao_negocio', 'definir_sociedade_negocio')
                        and (o.target_id is null or o.record_id is not null or o.commitment_id is not null)), 'toda operação aponta para o alvo';
  assert (select count(*) from public.record_operations where action = 'transferir_administracao_negocio') = 4, 'quatro passagens';
end $$;
set role authenticated;

-- ---------------------------------------------------------------------------
-- 14. Encerrar: a Contabilidade não impede, e perde o acesso junto
-- ---------------------------------------------------------------------------
select pg_temp.as_('rui');
do $$
declare
  biz uuid := pg_temp.id('biz');
begin
  perform pg_temp.expect_code(format('select public.end_business(%L, %L)', biz, 'eq-r-0040'), 'negocio_com_membros', 'PT409');
  perform public.remove_business_member(biz, pg_temp.id('teo'), 'eq-r-0041');
  assert (pg_temp.invite(pg_temp.id('pend3'))).cancelled_at is not null, 'quem é removida leva os convites pendentes que criou';
  perform public.remove_business_member(biz, pg_temp.id('ivo'), 'eq-r-0042');
  assert public.end_business(biz, 'eq-r-0043') ->> 'ended' = 'true', 'só com a Contabilidade, encerrar vale';
  assert (pg_temp.member(biz, pg_temp.id('nora'))).revoked_at is not null and (pg_temp.member(biz, pg_temp.id('zeca'))).revoked_at is not null,
    'a Contabilidade perde o acesso';
end $$;
select pg_temp.as_('nora');
do $$ begin
  assert public.my_accounting_businesses() = '[]'::jsonb, 'negócio encerrado sai da lista';
  assert (select count(*) from public.financial_records where context_id = pg_temp.id('biz')) = 0, 'e não é mais lido';
end $$;
-- A Nora exclui a conta: o próprio negócio dela sai, como sempre.
select pg_temp.as_('nora');
do $$ begin
  perform public.delete_my_account('EXCLUIR', 'eq-n-0030');
end $$;
reset role;
do $$ begin
  assert (select count(*) from public.financial_contexts where id = pg_temp.id('nora_biz')) = 0, 'o Ateliê da Nora sai com a conta';
end $$;

rollback;
