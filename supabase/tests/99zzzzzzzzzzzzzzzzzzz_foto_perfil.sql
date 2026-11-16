-- Foto do perfil (pedido do Enzo, 16/11/2026; migração 0038): person_photos, set_my_photo e my_photo. Confere: pôr uma foto (JPEG, PNG
-- ou WebP pelos primeiros bytes; até 150 KB), trocar, tirar; versão crescente e versao_desatualizada; só a própria pessoa lê (nem a
-- Família); remover deixa a linha sem foto e a versão segue; sem leitura direta da tabela; a conta excluída perde a foto (cascata e pessoa anônima) e não grava; privilégios.
-- Pessoas FICTÍCIAS: Ana (Pessoal e Família), Bia (na Família da Ana). Tudo em uma transação desfeita no fim.
\set ON_ERROR_STOP 1
\set ana '''00000000-0000-0000-0000-0000000000f1'''
\set bia '''00000000-0000-0000-0000-0000000000f2'''

begin;
set local clarevo.today = '2026-11-16';

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
create function pg_temp.b64(p_hex text) returns text language sql as $$ select encode(decode(p_hex, 'hex'), 'base64') $$;
create function pg_temp.sp(p_photo text, p_version integer) returns text language sql as $$
  select format('select public.set_my_photo(%L, %L)', p_photo, p_version)
$$;
create function pg_temp.row_of(p_name text) returns text language sql security definer set search_path = public, pg_temp as $$
  select coalesce((select case when photo is null then format('sem foto|%s', version) else format('%s|%s|%s', photo_mime, octet_length(photo), version) end
                     from public.person_photos where person_id = pg_temp.id(p_name)), 'sem linha')
$$;

insert into ids values ('ana', :ana), ('bia', :bia);
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  (:ana, 'ana@exemplo.test', now(), '{"display_name":"Ana"}'),
  (:bia, 'bia@exemplo.test', now(), '{"display_name":"Bia"}');

set role authenticated;
do $$
declare
  p text;
  r jsonb;
begin
  foreach p in array array['ana', 'bia'] loop
    perform pg_temp.as_(p);
    perform public.ensure_personal_space('Conta principal');
  end loop;
  perform pg_temp.as_('ana');
  insert into ids values ('fam', (public.create_family('Família da Ana', 'fp-fam-0001') #>> '{context,id}')::uuid);
  r := public.create_family_invite(pg_temp.id('fam'), 'leitor', 'fp-inv-0001');
  perform pg_temp.as_('bia');
  perform public.accept_family_invite(r ->> 'code', 'fp-acc-0001');
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 1. Privilégios: o app executa set_my_photo e my_photo; anon nada; as internas, ninguém; a tabela, nenhum privilégio e RLS ligada.
-- ---------------------------------------------------------------------------
do $$ begin
  assert has_function_privilege('authenticated', 'public.set_my_photo(text, integer)', 'execute')
     and has_function_privilege('authenticated', 'public.my_photo()', 'execute'), 'o app executa as duas';
  assert not has_function_privilege('anon', 'public.set_my_photo(text, integer)', 'execute')
     and not has_function_privilege('anon', 'public.my_photo()', 'execute'), 'anon não';
  assert not has_function_privilege('authenticated', 'public.clarevo_person_photo_json(uuid)', 'execute')
     and not has_function_privilege('authenticated', 'public.clarevo_person_photo_cleanup()', 'execute'), 'as internas, ninguém';
  assert not has_table_privilege('authenticated', 'public.person_photos', 'select, insert, update, delete, truncate')
     and not has_table_privilege('anon', 'public.person_photos', 'select, insert, update, delete, truncate'), 'a tabela, nenhum privilégio';
  assert (select relrowsecurity from pg_class where oid = 'public.person_photos'::regclass), 'RLS ligada';
  assert not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'person_photos'), 'nenhuma política';
end $$;

-- ---------------------------------------------------------------------------
-- 2. Pôr, trocar, versão, formatos, tamanho e tirar.
-- ---------------------------------------------------------------------------
set role authenticated;
do $$
declare
  r jsonb;
  big text;
begin
  -- Sem sessão.
  perform set_config('request.jwt.claim.sub', '', true);
  perform pg_temp.expect_code(pg_temp.sp(pg_temp.b64('ffd8ffe0'), 0), 'nao_autenticado', '42501');
  assert public.my_photo() is null, 'sem sessão, sem foto';

  perform pg_temp.as_('ana');
  assert public.my_photo() is null, 'começa sem foto';
  -- A primeira foto: versão 0 vira 1.
  r := public.set_my_photo(pg_temp.b64('ffd8ffe000104a4649460001'), 0);
  assert r ->> 'has_photo' = 'true' and (r ->> 'version')::int = 1 and r ->> 'updated_at' is not null, 'primeira: ' || r::text;
  assert public.my_photo() = jsonb_build_object('mime', 'image/jpeg', 'base64', pg_temp.b64('ffd8ffe000104a4649460001'), 'version', 1),
    'my_photo: ' || public.my_photo()::text;
  -- Trocar: PNG e WebP pelos primeiros bytes.
  r := public.set_my_photo(pg_temp.b64('89504e470d0a1a0a0000'), 1);
  assert (r ->> 'version')::int = 2 and public.my_photo() ->> 'mime' = 'image/png', 'PNG';
  r := public.set_my_photo(pg_temp.b64('52494646000000005745425056503820'), 2);
  assert (r ->> 'version')::int = 3 and public.my_photo() ->> 'mime' = 'image/webp', 'WebP';
  -- Versão velha (a repetição de um pedido que já passou também cai aqui, e o app lê de novo).
  perform pg_temp.expect_code(pg_temp.sp(pg_temp.b64('ffd8ffe0'), 2), 'versao_desatualizada', 'PT409', 'versao_atual=3');
  perform pg_temp.expect_code(pg_temp.sp(null, 0), 'versao_desatualizada', 'PT409', 'versao_atual=3');
  -- Formatos recusados: GIF, texto, vazio e base64 inválido; nada muda.
  perform pg_temp.expect_code(pg_temp.sp(pg_temp.b64('474946383961'), 3), 'foto_invalida', '22023');
  perform pg_temp.expect_code(pg_temp.sp(encode(convert_to('não é imagem', 'UTF8'), 'base64'), 3), 'foto_invalida', '22023');
  perform pg_temp.expect_code(pg_temp.sp('', 3), 'foto_invalida', '22023');
  perform pg_temp.expect_code(pg_temp.sp('@@@@', 3), 'foto_invalida', '22023');
  -- Tamanho: 150 KB passa; um byte a mais, não.
  big := encode('\xffd8ff'::bytea || decode(repeat('00', 153597), 'hex'), 'base64');
  r := public.set_my_photo(big, 3);
  assert (r ->> 'version')::int = 4, 'exatamente 150 KB';
  big := encode('\xffd8ff'::bytea || decode(repeat('00', 153598), 'hex'), 'base64');
  perform pg_temp.expect_code(pg_temp.sp(big, 4), 'foto_grande', '22023');
  assert pg_temp.row_of('ana') = 'image/jpeg|153600|4', 'a linha: ' || pg_temp.row_of('ana');

  -- Só a própria pessoa: Bia, da mesma Família, não vê a foto da Ana e tem a sua.
  perform pg_temp.as_('bia');
  assert public.my_photo() is null, 'Bia não vê a foto da Ana';
  r := public.set_my_photo(pg_temp.b64('ffd8ffe1'), 0);
  assert (r ->> 'version')::int = 1, 'a da Bia começa em 1';
  perform pg_temp.as_('ana');
  assert (public.my_photo() ->> 'version')::int = 4, 'a da Ana continua';

  -- Remover: a foto sai, a linha fica e a versão sobe (outro aparelho com a versão 4 não sobrescreve sem ler de novo).
  r := public.set_my_photo(null, 4);
  assert r ->> 'has_photo' = 'false' and (r ->> 'version')::int = 5 and r ->> 'updated_at' is not null, 'remover: ' || r::text;
  assert public.my_photo() = jsonb_build_object('mime', null, 'base64', null, 'version', 5), 'sem foto, com versão: ' || public.my_photo()::text;
  assert pg_temp.row_of('ana') = 'sem foto|5', 'a linha sem foto: ' || pg_temp.row_of('ana');
  perform pg_temp.expect_code(pg_temp.sp(pg_temp.b64('ffd8ffe0'), 4), 'versao_desatualizada', 'PT409', 'versao_atual=5');
  perform pg_temp.expect_code(pg_temp.sp(pg_temp.b64('ffd8ffe0'), 0), 'versao_desatualizada', 'PT409', 'versao_atual=5');
  -- Pôr de novo segue a versão.
  r := public.set_my_photo(pg_temp.b64('ffd8ffe0'), 5);
  assert (r ->> 'version')::int = 6 and r ->> 'has_photo' = 'true', 'segue em 6';
  -- Quem nunca pôs foto: remover não cria linha.
  perform pg_temp.as_('bia');
  r := public.set_my_photo(null, 1);
  assert (r ->> 'version')::int = 2 and r ->> 'has_photo' = 'false', 'Bia remove a dela';
  r := public.set_my_photo(pg_temp.b64('ffd8ffe1'), 2);
  assert (r ->> 'version')::int = 3, 'Bia põe de novo';
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 3. Conta excluída: a pessoa anônima perde a foto na hora e não grava; a linha de persons que sai leva a foto junto.
-- ---------------------------------------------------------------------------
do $$ begin
  assert pg_temp.row_of('bia') = 'image/jpeg|4|3', 'Bia tem foto';
  update public.persons set display_name = '', deleted_at = now() where id = pg_temp.id('bia');
  assert pg_temp.row_of('bia') = 'sem linha', 'a pessoa anônima perde a foto';
end $$;
set role authenticated;
do $$ begin
  perform pg_temp.as_('bia');
  perform pg_temp.expect_code(pg_temp.sp(pg_temp.b64('ffd8ffe0'), 0), 'nao_encontrado', 'P0002');
  assert public.my_photo() is null, 'nada para a pessoa anônima';
end $$;
reset role;
do $$ begin
  assert pg_temp.row_of('ana') = 'image/jpeg|4|6', 'Ana tem foto';
  delete from public.context_memberships where person_id = pg_temp.id('ana');
  delete from public.persons where id = pg_temp.id('ana');
  assert pg_temp.row_of('ana') = 'sem linha', 'a foto sai com a pessoa';
exception when foreign_key_violation then
  -- Se outra tabela ainda prende a pessoa, a cascata da foto é conferida pela restrição da própria tabela.
  assert (select confdeltype from pg_constraint where conrelid = 'public.person_photos'::regclass and contype = 'f') = 'c', 'on delete cascade';
end $$;

rollback;
