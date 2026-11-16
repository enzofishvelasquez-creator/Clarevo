-- Clarevo · migração 0038 · Foto do perfil (pedido do Enzo, 16/11/2026). Depois de 20261114000002_investimentos_precos.sql.
-- A pessoa pode pôr uma foto no perfil (Conta). Como a foto das metas (0021), ela fica no próprio banco (não no Storage), para seguir as
-- mesmas regras de permissão e de exclusão de todo o resto.
--
-- Invariantes:
-- P1. Uma linha por pessoa em person_photos, criada na primeira foto. Remover a foto deixa a linha sem foto (photo e photo_mime nulos),
--     para a versão seguir crescendo: assim uma troca feita em outro aparelho nunca volta a uma versão já vista. Sem linha, sem foto.
-- P2. Foto: JPEG, PNG ou WebP (conferido pelos primeiros bytes, não pelo que o app diz), de 1 byte a 150 KB depois de decodificar o base64.
--     O app reduz antes de mandar (quadrada, 512 px). O tipo gravado é o que os bytes mostram.
-- P3. Só a própria pessoa lê e escreve a sua foto: nenhuma leitura direta da tabela (RLS sem política, sem privilégio), escrita só por
--     set_my_photo e leitura só por my_photo, as duas pela sessão (auth.uid()). Ninguém da Família nem da empresa vê a foto.
-- P4. set_my_photo(p_photo, p_expected_version): p_photo em base64 grava ou troca; nulo remove a foto. Versão crescente (1 na primeira
--     foto, +1 a cada troca ou remoção, nunca volta); o app manda a versão que leu (0 sem linha) e recebe versao_desatualizada (detalhe versao_atual=n) se outra
--     escrita passou na frente. Repetir o mesmo pedido depois de uma falha de rede devolve versao_desatualizada com a versão nova, e o
--     app lê de novo: nada fica gravado duas vezes. Não passa por record_operations (não é registro financeiro nem anotação, D-030), e
--     a conta excluída não grava (a pessoa já não existe ou está anônima).
-- P5. Excluir a conta apaga a foto: por cascata quando a linha de persons sai, e pelo gatilho quando a pessoa vira anônima (deleted_at).
--
-- Esta migração cria uma tabela, um gatilho e três funções (o resultado, set_my_photo e my_photo). Privilégios no fim, só do que é novo.
-- Aplicar no SQL Editor depois da 0037 (docs/05, passo 12ae). Testes em supabase/tests/99zzzzzzzzzzzzzzzzzzz_foto_perfil.sql.

-- ---------------------------------------------------------------------------
-- A foto
-- ---------------------------------------------------------------------------
create table public.person_photos (
  person_id uuid primary key references public.persons (id) on delete cascade,
  photo bytea check (octet_length(photo) between 1 and 153600),
  photo_mime text check (photo_mime in ('image/jpeg', 'image/png', 'image/webp')),
  version integer not null default 1 check (version >= 1),
  updated_at timestamptz not null default now(),
  constraint person_photos_tipo check ((photo is null) = (photo_mime is null))
);
comment on table public.person_photos is
  'Foto do perfil (0038): uma linha por pessoa, só para ela. Escrita só por set_my_photo; leitura só por my_photo. Sai com a conta.';

-- P5: a pessoa que vira anônima (exclusão da conta com autoria numa Família que continua) perde a foto na hora.
create or replace function public.clarevo_person_photo_cleanup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.person_photos where person_id = new.id;
  return new;
end;
$$;

create trigger persons_photo_cleanup
  after update of deleted_at on public.persons
  for each row
  when (new.deleted_at is not null and old.deleted_at is null)
  execute function public.clarevo_person_photo_cleanup();

-- Resultado de set_my_photo: {has_photo, version, updated_at}; sem linha, versão 0.
create or replace function public.clarevo_person_photo_json(p_person uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select jsonb_build_object('has_photo', p.photo is not null, 'version', p.version, 'updated_at', p.updated_at)
       from public.person_photos p where p.person_id = p_person),
    jsonb_build_object('has_photo', false, 'version', 0, 'updated_at', null));
$$;

-- Pôr, trocar ou tirar a foto do perfil (P2 a P4). Ordem: sessão; pessoa (conta excluída: nao_encontrado); foto_invalida (base64 que
-- não decodifica, vazia ou de outro tipo); foto_grande (mais de 150 KB); trava da pessoa; versao_desatualizada (detalhe versao_atual=n;
-- 0 sem linha); escrita.
create or replace function public.set_my_photo(p_photo text, p_expected_version integer)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_current integer;
  v_bytes bytea;
  v_mime text;
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  -- A pessoa existe e não foi excluída; a trava da linha de persons serializa as escritas da mesma pessoa (e espera uma exclusão em curso).
  perform 1 from public.persons p where p.id = v_uid and p.deleted_at is null for key share;
  if not found then
    raise exception 'nao_encontrado' using errcode = 'P0002';
  end if;

  if p_photo is not null then
    begin
      v_bytes := decode(regexp_replace(p_photo, '\s+', '', 'g'), 'base64');
    exception when others then
      raise exception 'foto_invalida' using errcode = '22023';
    end;
    if v_bytes is null or octet_length(v_bytes) = 0 then
      raise exception 'foto_invalida' using errcode = '22023';
    end if;
    if octet_length(v_bytes) > 153600 then
      raise exception 'foto_grande' using errcode = '22023';
    end if;
    v_mime := case
      when octet_length(v_bytes) >= 3 and substring(v_bytes from 1 for 3) = '\xffd8ff'::bytea then 'image/jpeg'
      when octet_length(v_bytes) >= 8 and substring(v_bytes from 1 for 8) = '\x89504e470d0a1a0a'::bytea then 'image/png'
      when octet_length(v_bytes) >= 12 and substring(v_bytes from 1 for 4) = '\x52494646'::bytea
           and substring(v_bytes from 9 for 4) = '\x57454250'::bytea then 'image/webp'
    end;
    if v_mime is null then
      raise exception 'foto_invalida' using errcode = '22023';
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtext('foto_perfil:' || v_uid::text));
  select version into v_current from public.person_photos where person_id = v_uid for update;
  if p_expected_version is distinct from coalesce(v_current, 0) then
    raise exception 'versao_desatualizada' using errcode = 'PT409', detail = 'versao_atual=' || coalesce(v_current, 0);
  end if;

  if v_current is null then
    -- Sem linha: remover não tem o que fazer; a primeira foto cria a linha na versão 1.
    if p_photo is not null then
      insert into public.person_photos (person_id, photo, photo_mime) values (v_uid, v_bytes, v_mime);
    end if;
  else
    -- Trocar ou remover (v_bytes nulo): a linha fica, e a versão sobe.
    update public.person_photos
       set photo = v_bytes, photo_mime = v_mime, version = version + 1, updated_at = now()
     where person_id = v_uid;
  end if;

  return public.clarevo_person_photo_json(v_uid);
end;
$$;

-- A foto do perfil de quem está na sessão: {mime, base64, version}, com mime e base64 nulos depois de remover a foto, ou null sem linha.
-- Só leitura.
create or replace function public.my_photo()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('mime', p.photo_mime, 'base64', case when p.photo is null then null else encode(p.photo, 'base64') end, 'version', p.version)
    from public.person_photos p
    join public.persons s on s.id = p.person_id and s.deleted_at is null
   where p.person_id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- Privilégios, só do que é novo. A tabela: RLS ligada e nenhuma política nem privilégio (P3).
-- ---------------------------------------------------------------------------
alter table public.person_photos enable row level security;
revoke all on public.person_photos from anon, authenticated;

revoke all on function public.clarevo_person_photo_cleanup() from public, anon, authenticated;
revoke all on function public.clarevo_person_photo_json(uuid) from public, anon, authenticated;
revoke all on function public.set_my_photo(text, integer) from public, anon, authenticated;
revoke all on function public.my_photo() from public, anon, authenticated;
do $$
declare
  f text;
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'revoke all on public.person_photos from service_role';
    foreach f in array array['clarevo_person_photo_cleanup()', 'clarevo_person_photo_json(uuid)', 'set_my_photo(text, integer)', 'my_photo()'] loop
      execute format('revoke all on function public.%s from service_role', f);
    end loop;
  end if;
end $$;

grant execute on function public.set_my_photo(text, integer) to authenticated;
grant execute on function public.my_photo() to authenticated;
