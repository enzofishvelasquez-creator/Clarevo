-- Imagem das metas (D-077; migração 0021): goal_images, set_goal_image e goal_photo. Confere: escolher uma sugestão, mandar uma foto
-- (JPEG, PNG ou WebP pelos primeiros bytes; até 300 KB), voltar à automática; versão crescente; idempotência; a mesma permissão de
-- update_goal (Família: quem só vê não troca); leitura pela RLS sem a coluna da foto e a foto por goal_photo; excluir a meta apaga a
-- imagem; operação 'imagem_meta' com a meta em target_id, sem contar como anotação; privilégios.
-- Pessoas FICTÍCIAS: Ana (Pessoal e Família), Bia (só vê a Família da Ana) e Caio (de fora). Tudo em uma transação desfeita no fim.
\set ON_ERROR_STOP 1
\set ana  '''00000000-0000-0000-0000-0000000000d1'''
\set bia  '''00000000-0000-0000-0000-0000000000d2'''
\set caio '''00000000-0000-0000-0000-0000000000d3'''

begin;
set local clarevo.today = '2026-10-30';

create function pg_temp.expect_code(p_sql text, p_code text, p_state text, p_detail text default '') returns void language plpgsql as $$
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

create temp table ids (name text primary key, id uuid);
grant select, insert on ids to authenticated, anon;
create function pg_temp.id(p_name text) returns uuid language sql as $$ select id from ids where name = p_name $$;
create function pg_temp.as_(p_name text) returns text language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(pg_temp.id(p_name)::text, ''), true)
$$;
-- Chamada em texto (para expect_code).
create function pg_temp.si(p_goal text, p_key_img text, p_photo text, p_version integer, p_key text) returns text language sql as $$
  select format('select public.set_goal_image(%L, %L, %L, %L, %L)', pg_temp.id(p_goal), p_key_img, p_photo, p_version, p_key)
$$;
create function pg_temp.row_of(p_goal text) returns text language sql security definer set search_path = public, pg_temp as $$
  select coalesce((select format('%s|%s|%s|%s', coalesce(image_key, '-'), coalesce(photo_mime, '-'), coalesce(octet_length(photo), 0), version)
                     from public.goal_images where goal_id = pg_temp.id(p_goal)), 'sem linha')
$$;
create function pg_temp.lastwrite(p_name text, p_ctx text) returns text language sql security definer set search_path = public, pg_temp as $$
  select coalesce((select to_char(last_write_on, 'YYYY-MM-DD') from public.context_activity
                    where person_id = pg_temp.id(p_name) and context_id = pg_temp.id(p_ctx)), '-')
$$;
-- Fotos de teste: os primeiros bytes de cada tipo, em base64.
create function pg_temp.b64(p_hex text) returns text language sql as $$ select encode(decode(p_hex, 'hex'), 'base64') $$;

insert into ids values ('ana', :ana), ('bia', :bia), ('caio', :caio);
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  (:ana,  'ana@exemplo.test',  now(), '{"display_name":"Ana"}'),
  (:bia,  'bia@exemplo.test',  now(), '{"display_name":"Bia"}'),
  (:caio, 'caio@exemplo.test', now(), '{"display_name":"Caio"}');

set role authenticated;
do $$
declare
  p text;
  space jsonb;
  r jsonb;
begin
  foreach p in array array['ana', 'bia', 'caio'] loop
    perform pg_temp.as_(p);
    space := public.ensure_personal_space('Conta principal');
    insert into ids values (p || '_ctx', (space ->> 'context_id')::uuid);
  end loop;
  perform pg_temp.as_('ana');
  insert into ids values ('fam', (public.create_family('Família da Ana', 'mi-fam-0001') #>> '{context,id}')::uuid);
  r := public.create_family_invite(pg_temp.id('fam'), 'leitor', 'mi-inv-0001');
  insert into ids values ('viagem', (public.create_goal('mi-gol-0001', pg_temp.id('ana_ctx'), 'objetivo', 'Lua de mel na Grécia', 900000,
                                                        null, null, null, null, null, null, null) #>> '{goal,id}')::uuid);
  insert into ids values ('casa', (public.create_goal('mi-gol-0002', pg_temp.id('fam'), 'objetivo', 'Reforma da casa', 500000,
                                                      null, null, null, null, null, null, null) #>> '{goal,id}')::uuid);
  perform pg_temp.as_('bia');
  perform public.accept_family_invite(r ->> 'code', 'mi-acc-0001');
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 1. Privilégios: o app executa set_goal_image e goal_photo; anon nada; as internas, ninguém; a tabela só com leitura, sem a foto.
-- ---------------------------------------------------------------------------
do $$ begin
  assert has_function_privilege('authenticated', 'public.set_goal_image(uuid, text, text, integer, text)', 'execute')
     and has_function_privilege('authenticated', 'public.goal_photo(uuid)', 'execute'), 'o app executa as duas';
  assert not has_function_privilege('anon', 'public.set_goal_image(uuid, text, text, integer, text)', 'execute')
     and not has_function_privilege('anon', 'public.goal_photo(uuid)', 'execute'), 'anon não';
  assert not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                      cross join (values ('service_role'), ('authenticated'), ('anon')) r (rolname)
                     where n.nspname = 'public' and p.proname in ('clarevo_goal_image_json', 'clarevo_goal_image_cleanup')
                       and has_function_privilege(r.rolname, p.oid, 'execute')), 'internas sem execute';
  assert (select relrowsecurity from pg_class where oid = 'public.goal_images'::regclass), 'RLS ligada';
  assert has_column_privilege('authenticated', 'public.goal_images', 'image_key', 'select')
     and has_column_privilege('authenticated', 'public.goal_images', 'has_photo', 'select')
     and not has_column_privilege('authenticated', 'public.goal_images', 'photo', 'select'), 'a foto não sai pela tabela';
  assert not has_table_privilege('authenticated', 'public.goal_images', 'insert') and not has_table_privilege('authenticated', 'public.goal_images', 'update')
     and not has_table_privilege('authenticated', 'public.goal_images', 'delete') and not has_table_privilege('anon', 'public.goal_images', 'select'),
    'sem escrita direta';
end $$;

-- ---------------------------------------------------------------------------
-- 2. Escolher uma sugestão, mandar uma foto e voltar à automática; versão, operação e atividade.
-- ---------------------------------------------------------------------------
set role authenticated;
do $$
declare
  r jsonb;
begin
  perform pg_temp.as_('ana');
  r := public.set_goal_image(pg_temp.id('viagem'), 'viagem', null, 0, 'mi-img-0001');
  assert r - 'updated_at' = jsonb_build_object('goal_id', pg_temp.id('viagem'), 'image_key', 'viagem', 'has_photo', false, 'version', 1)
     and r ->> 'updated_at' is not null, 'sugestão escolhida, versão 1: ' || r::text;
  assert public.set_goal_image(pg_temp.id('viagem'), 'viagem', null, 0, 'mi-img-0001') = r, 'repetição devolve o atual';
  r := public.set_goal_image(pg_temp.id('viagem'), null, pg_temp.b64('ffd8ffe000104a4649460001'), 1, 'mi-img-0002');
  assert r ->> 'image_key' is null and (r ->> 'has_photo')::boolean and (r ->> 'version')::int = 2, 'foto, versão 2';
  -- A leitura pela tabela (RLS), sem a foto; a foto por goal_photo.
  assert (select has_photo from public.goal_images where goal_id = pg_temp.id('viagem')), 'a Ana lê a linha';
  r := public.goal_photo(pg_temp.id('viagem'));
  assert r = jsonb_build_object('mime', 'image/jpeg', 'base64', pg_temp.b64('ffd8ffe000104a4649460001'), 'version', 2), 'goal_photo: ' || r::text;
  r := public.set_goal_image(pg_temp.id('viagem'), null, pg_temp.b64('89504e470d0a1a0a0000000d'), 2, 'mi-img-0003');
  assert public.goal_photo(pg_temp.id('viagem')) ->> 'mime' = 'image/png', 'PNG';
  r := public.set_goal_image(pg_temp.id('viagem'), null, pg_temp.b64('52494646240000005745425056503820'), 3, 'mi-img-0004');
  assert public.goal_photo(pg_temp.id('viagem')) ->> 'mime' = 'image/webp', 'WebP';
  r := public.set_goal_image(pg_temp.id('viagem'), null, null, 4, 'mi-img-0005');
  assert r - 'updated_at' = jsonb_build_object('goal_id', pg_temp.id('viagem'), 'image_key', null, 'has_photo', false, 'version', 5),
    'automática: sem sugestão e sem foto, a versão segue subindo: ' || r::text;
  assert public.goal_photo(pg_temp.id('viagem')) is null, 'sem foto';
end $$;
-- Recusas, na ordem.
select pg_temp.expect_code(pg_temp.si('viagem', 'viagem', null, 5, 'curta'), 'chave_invalida', '22023');
select pg_temp.expect_code(pg_temp.si('viagem', 'casa', null, 5, 'mi-img-0001'), 'chave_reutilizada', 'PT409');
select pg_temp.expect_code(pg_temp.si('viagem', 'viagem', 'x', 5, 'mi-img-0101'), 'imagem_invalida', '22023');
select pg_temp.expect_code(pg_temp.si('viagem', 'Viagem!', null, 5, 'mi-img-0102'), 'imagem_invalida', '22023');
select pg_temp.expect_code(pg_temp.si('viagem', null, 'não é base64 @@', 5, 'mi-img-0103'), 'foto_invalida', '22023');
select pg_temp.expect_code(pg_temp.si('viagem', null, '', 5, 'mi-img-0104'), 'foto_invalida', '22023');
select pg_temp.expect_code(pg_temp.si('viagem', null, encode('GIF89a', 'base64'), 5, 'mi-img-0105'), 'foto_invalida', '22023');
select pg_temp.expect_code(format('select public.set_goal_image(%L, null, %L, 5, %L)', pg_temp.id('viagem'),
                                  encode(decode('ffd8ff', 'hex') || decode(repeat('00', 307198), 'hex'), 'base64'), 'mi-img-0106'), 'foto_grande', '22023');
select pg_temp.expect_code(pg_temp.si('viagem', 'casa', null, 4, 'mi-img-0107'), 'versao_desatualizada', 'PT409', 'versao_atual=5');
select pg_temp.expect_code(pg_temp.si('viagem', 'casa', null, null, 'mi-img-0108'), 'versao_desatualizada', 'PT409', 'versao_atual=5');
select pg_temp.expect_code(format('select public.set_goal_image(%L, %L, null, 0, %L)', gen_random_uuid(), 'casa', 'mi-img-0109'), 'nao_encontrado', 'P0002');
-- Foto de exatamente 300 KB passa.
do $$ begin
  perform public.set_goal_image(pg_temp.id('viagem'), null, encode(decode('ffd8ff', 'hex') || decode(repeat('00', 307197), 'hex'), 'base64'), 5, 'mi-img-0110');
end $$;
reset role;
do $$
declare
  o public.record_operations%rowtype;
begin
  assert pg_temp.row_of('viagem') = '-|image/jpeg|307200|6', 'a foto de 300 KB gravada: ' || pg_temp.row_of('viagem');
  select * into o from public.record_operations where idempotency_key = 'mi-img-0001';
  assert o.action = 'imagem_meta' and o.target_id = pg_temp.id('viagem') and o.context_id = pg_temp.id('ana_ctx') and o.record_id is null,
    'operação com a meta em target_id';
  assert (select count(*) from public.record_operations where action = 'imagem_meta') = 6, 'uma operação por troca, nenhuma das recusas';
  assert pg_temp.lastwrite('ana', 'ana_ctx') = '2026-10-30', 'criar a meta conta como anotação (a imagem não muda isso)';
  assert (select count(*) from public.context_activity where person_id = pg_temp.id('ana')) = 2, 'só os dois espaços em que ela criou meta';
end $$;

-- A atividade não sobe com a imagem: num dia depois, trocar a imagem não muda o último dia com anotação.
set local clarevo.today = '2026-11-05';
set role authenticated;
select pg_temp.as_('ana');
select public.set_goal_image(pg_temp.id('viagem'), 'viagem', null, 6, 'mi-img-0201');
reset role;
do $$ begin
  assert pg_temp.lastwrite('ana', 'ana_ctx') = '2026-10-30', 'trocar a imagem não é anotar (D-030)';
end $$;
set local clarevo.today = '2026-10-30';

-- ---------------------------------------------------------------------------
-- 3. Família: quem só vê lê a imagem e a foto, mas não troca; quem é de fora não vê nada.
-- ---------------------------------------------------------------------------
set role authenticated;
select pg_temp.as_('ana');
select public.set_goal_image(pg_temp.id('casa'), null, pg_temp.b64('ffd8ffe000104a4649460001'), 0, 'mi-img-0301');
select pg_temp.as_('bia');
do $$ begin
  assert (select count(*) from public.goal_images where goal_id = pg_temp.id('casa')) = 1, 'a Bia lê a linha da Família';
  assert public.goal_photo(pg_temp.id('casa')) ->> 'mime' = 'image/jpeg', 'e a foto';
  assert (select count(*) from public.goal_images where goal_id = pg_temp.id('viagem')) = 0, 'mas não a do Pessoal da Ana';
  assert public.goal_photo(pg_temp.id('viagem')) is null, 'nem a foto';
end $$;
select pg_temp.expect_code(pg_temp.si('casa', 'casa', null, 1, 'mi-img-0302'), 'sem_permissao', '42501');
select pg_temp.as_('caio');
do $$ begin
  assert (select count(*) from public.goal_images) = 0, 'o Caio não vê nada';
  assert public.goal_photo(pg_temp.id('casa')) is null, 'nem a foto';
end $$;
select pg_temp.expect_code(pg_temp.si('casa', 'casa', null, 1, 'mi-img-0303'), 'nao_encontrado', 'P0002');
select pg_temp.as_('');
select pg_temp.expect_code(pg_temp.si('casa', 'casa', null, 1, 'mi-img-0304'), 'nao_autenticado', '42501');
reset role;

-- ---------------------------------------------------------------------------
-- 4. Excluir a meta apaga a imagem (e a foto) na hora.
-- ---------------------------------------------------------------------------
set role authenticated;
select pg_temp.as_('ana');
select public.delete_goal('mi-gol-0003', pg_temp.id('casa'), 1);
do $$ begin
  assert public.goal_photo(pg_temp.id('casa')) is null, 'sem foto da meta excluída';
end $$;
select pg_temp.expect_code(pg_temp.si('casa', 'casa', null, 0, 'mi-img-0401'), 'nao_encontrado', 'P0002');
reset role;
do $$ begin
  assert pg_temp.row_of('casa') = 'sem linha', 'a linha da imagem saiu com a meta';
  assert pg_temp.row_of('viagem') <> 'sem linha', 'a outra meta não muda';
end $$;

rollback;
