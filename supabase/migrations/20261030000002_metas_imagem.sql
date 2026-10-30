-- Clarevo · migração 0021 · Imagem das metas (D-077). Depois de 20261030000001_whatsapp.sql.
-- Cada meta mostra uma imagem: a sugerida pelo nome e pelo tipo (sem gravar nada), uma das sugeridas escolhida pela pessoa ou uma foto
-- dela. A foto fica no próprio banco (não no Storage), para seguir as mesmas regras de permissão e de exclusão de todo o resto.
--
-- Invariantes:
-- I1. Uma linha por meta em goal_images, criada na primeira escolha. A imagem é a sugestão escolhida (image_key), a foto (photo) ou
--     nenhuma das duas (voltou à automática, que o app calcula pelo nome); nunca as duas. A versão só sobe (uma por troca), começando em 1;
--     sem linha, o app manda 0.
-- I2. Foto: JPEG, PNG ou WebP (conferido pelos primeiros bytes, não pelo que o app diz), de 1 byte a 300 KB depois de decodificar o base64.
--     O app reduz antes de mandar (lado maior de 1080 px). O tipo gravado é o que os bytes mostram.
-- I3. Escrita só por set_goal_image: idempotência pela chave, versão crescente que o app manda, a mesma permissão de update_goal
--     (clarevo_lock_goal: anotar no espaço e, na meta de outra pessoa, "editar de outras pessoas"), operação 'imagem_meta' com a meta em
--     target_id, por último (recusa conta excluída). NÃO conta como anotação na atividade (D-030): trocar a imagem não é anotar.
-- I4. Leitura: a linha pela RLS (quem lê o espaço), sem a coluna da foto; a foto por goal_photo (mesma regra), em base64.
-- I5. Excluir a meta apaga a imagem na hora (gatilho em goals), e apagar o espaço apaga por cascata (inclusive na exclusão da conta, D-058).
--
-- Esta migração cria uma tabela, um gatilho, três funções (o resultado, set_goal_image e goal_photo) e recria clarevo_track_activity e as
-- listas de ações de record_operations. Privilégios no fim, só do que é novo. Aplicar no SQL Editor depois da 0020 (docs/05, passo 12k).
-- Testes em supabase/tests/99y_metas_imagem.sql.

-- ---------------------------------------------------------------------------
-- A imagem
-- ---------------------------------------------------------------------------
create table public.goal_images (
  goal_id uuid primary key,
  context_id uuid not null,
  image_key text check (image_key ~ '^[a-z_]{2,30}$'),
  photo bytea check (octet_length(photo) between 1 and 307200),
  photo_mime text check (photo_mime in ('image/jpeg', 'image/png', 'image/webp')),
  has_photo boolean generated always as (photo is not null) stored,
  version integer not null default 1 check (version >= 1),
  updated_at timestamptz not null default now(),
  foreign key (goal_id, context_id) references public.goals (id, context_id) on delete cascade,
  constraint goal_images_uma check (image_key is null or photo is null),
  constraint goal_images_tipo check ((photo is null) = (photo_mime is null))
);
create index goal_images_goal_id_context_id_fk_idx on public.goal_images (goal_id, context_id);
create index goal_images_context_id_idx on public.goal_images (context_id);
comment on table public.goal_images is
  'Imagem de cada meta (D-077): a sugestão escolhida (image_key) ou a foto da pessoa (até 300 KB), nunca as duas; sem linha ou sem as duas, '
  'o app mostra a sugestão automática. Escrita só por set_goal_image; a foto é lida por goal_photo. Sai com a meta e com o espaço.';

-- I5: excluir a meta (exclusão lógica em delete_goal) apaga a imagem.
create or replace function public.clarevo_goal_image_cleanup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.goal_images where goal_id = new.id;
  return null;
end;
$$;

create trigger goals_image_cleanup
  after update of deleted_at on public.goals
  for each row when (new.deleted_at is not null and old.deleted_at is null)
  execute function public.clarevo_goal_image_cleanup();

-- ---------------------------------------------------------------------------
-- Operações: lista completa vigente (a da 0020) mais 'imagem_meta', com a meta em target_id.
-- ---------------------------------------------------------------------------
alter table public.record_operations drop constraint record_operations_action_check;
alter table public.record_operations add constraint record_operations_action_check check (action in (
  'criar', 'editar', 'excluir',
  'criar_compromisso', 'editar_compromisso', 'excluir_compromisso', 'pagar_compromisso', 'desfazer_pagamento',
  'criar_serie', 'alterar_serie', 'encerrar_serie', 'excluir_serie', 'informar_ano', 'tirar_ano',
  'criar_ocorrencia', 'decidir_revisao',
  'definir_renda_referencia', 'excluir_renda_referencia',
  'criar_meta', 'alterar_meta', 'situacao_meta', 'excluir_meta',
  'registrar_movimento_meta', 'alterar_movimento_meta', 'excluir_movimento_meta',
  'responder_guardar',
  'criar_cartao', 'alterar_cartao', 'situacao_cartao', 'excluir_cartao',
  'criar_compra_cartao', 'alterar_lancamento_cartao', 'excluir_lancamento_cartao',
  'criar_encargo_cartao', 'criar_estorno_cartao',
  'pagar_fatura', 'desfazer_pagamento_fatura',
  'definir_orcamento_categoria', 'excluir_orcamento_categoria',
  'definir_limite_comprometimento', 'excluir_limite_comprometimento',
  'criar_conta', 'alterar_conta', 'conta_principal', 'situacao_conta', 'excluir_conta',
  'marcar_assinatura', 'revisar_assinaturas',
  'importar_extrato',
  'criar_familia', 'criar_convite_familia', 'cancelar_convite_familia', 'aceitar_convite_familia', 'sair_familia',
  'remover_membro_familia', 'alterar_papel_familia', 'transferir_titularidade_familia', 'encerrar_familia',
  'convidar_licencas', 'renovar_convite_licenca', 'cancelar_convite_licenca', 'encerrar_licenca', 'aceitar_licenca',
  'marcar_mes_conferido', 'desmarcar_mes_conferido',
  'responder_origem_cadastro',
  'gerar_codigo_whatsapp', 'ligar_whatsapp', 'desligar_whatsapp',
  'imagem_meta'));
alter table public.record_operations drop constraint record_operations_target_check;
alter table public.record_operations add constraint record_operations_target_check check (
  (action in ('criar', 'editar', 'excluir') and record_id is not null and target_id is null)
  or (action in ('criar_compromisso', 'editar_compromisso', 'excluir_compromisso')
      and commitment_id is not null and record_id is null and target_id is null)
  or (action in ('pagar_compromisso', 'desfazer_pagamento')
      and commitment_id is not null and record_id is not null and target_id is null)
  or (action in ('criar_serie', 'alterar_serie', 'encerrar_serie', 'excluir_serie', 'informar_ano', 'tirar_ano',
                 'definir_renda_referencia', 'excluir_renda_referencia',
                 'criar_meta', 'alterar_meta', 'situacao_meta', 'excluir_meta',
                 'registrar_movimento_meta', 'alterar_movimento_meta', 'excluir_movimento_meta',
                 'criar_cartao', 'alterar_cartao', 'situacao_cartao', 'excluir_cartao',
                 'criar_compra_cartao', 'alterar_lancamento_cartao', 'excluir_lancamento_cartao',
                 'criar_encargo_cartao', 'criar_estorno_cartao',
                 'definir_orcamento_categoria', 'excluir_orcamento_categoria',
                 'definir_limite_comprometimento', 'excluir_limite_comprometimento',
                 'criar_conta', 'alterar_conta', 'conta_principal', 'situacao_conta', 'excluir_conta',
                 'marcar_assinatura', 'importar_extrato',
                 'criar_familia', 'criar_convite_familia', 'cancelar_convite_familia', 'aceitar_convite_familia', 'sair_familia',
                 'remover_membro_familia', 'alterar_papel_familia', 'transferir_titularidade_familia', 'encerrar_familia',
                 'convidar_licencas', 'renovar_convite_licenca', 'cancelar_convite_licenca', 'encerrar_licenca', 'aceitar_licenca',
                 'imagem_meta')
      and target_id is not null and record_id is null and commitment_id is null)
  or (action in ('pagar_fatura', 'desfazer_pagamento_fatura')
      and target_id is not null and record_id is not null and commitment_id is not null)
  or (action = 'criar_ocorrencia' and commitment_id is not null and target_id is not null and record_id is null)
  or (action in ('decidir_revisao', 'responder_guardar', 'revisar_assinaturas', 'marcar_mes_conferido', 'desmarcar_mes_conferido',
                 'responder_origem_cadastro', 'gerar_codigo_whatsapp', 'ligar_whatsapp', 'desligar_whatsapp')
      and record_id is null and commitment_id is null and target_id is null));

-- ---------------------------------------------------------------------------
-- Atividade: mesma função da 0020, sem contar também a troca de imagem (I3).
-- ---------------------------------------------------------------------------
create or replace function public.clarevo_track_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_day date;
begin
  if new.action in ('decidir_revisao', 'responder_guardar', 'revisar_assinaturas',
                    'marcar_mes_conferido', 'desmarcar_mes_conferido', 'responder_origem_cadastro',
                    'gerar_codigo_whatsapp', 'ligar_whatsapp', 'desligar_whatsapp', 'imagem_meta',
                    'criar_familia', 'criar_convite_familia', 'cancelar_convite_familia', 'aceitar_convite_familia', 'sair_familia',
                    'remover_membro_familia', 'alterar_papel_familia', 'transferir_titularidade_familia', 'encerrar_familia',
                    'convidar_licencas', 'renovar_convite_licenca', 'cancelar_convite_licenca', 'encerrar_licenca', 'aceitar_licenca') then
    return null;
  end if;
  v_day := public.clarevo_today(new.actor_id);
  insert into public.context_activity as a (person_id, context_id, last_write_on)
  values (new.actor_id, new.context_id, v_day)
  on conflict (person_id, context_id) do update
    set absence_from_on  = case when public.clarevo_long_absence(a.last_write_on, excluded.last_write_on)
                                then a.last_write_on else a.absence_from_on end,
        absence_until_on = case when public.clarevo_long_absence(a.last_write_on, excluded.last_write_on)
                                then excluded.last_write_on else a.absence_until_on end,
        last_write_on    = excluded.last_write_on
    where excluded.last_write_on > a.last_write_on;
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Funções
-- ---------------------------------------------------------------------------

-- Resultado de set_goal_image e da repetição: {goal_id, image_key, has_photo, version, updated_at}; sem linha, versão 0.
create or replace function public.clarevo_goal_image_json(p_goal_id uuid)
returns jsonb
language sql
stable
set search_path = public
as $$
  select coalesce(
    (select jsonb_build_object('goal_id', i.goal_id, 'image_key', i.image_key, 'has_photo', i.has_photo, 'version', i.version,
                               'updated_at', i.updated_at)
       from public.goal_images i where i.goal_id = p_goal_id),
    jsonb_build_object('goal_id', p_goal_id, 'image_key', null, 'has_photo', false, 'version', 0, 'updated_at', null));
$$;

-- Trocar a imagem da meta (I1 a I3). p_image_key: uma sugestão; p_photo: a foto em base64; as duas nulas: voltar à automática.
-- Ordem: sessão; chave; trava da chave; repetição (chave_reutilizada se a ação ou o pedido mudam; a certa devolve a imagem atual);
-- meta (nao_encontrado, sem_permissao, como update_goal); imagem_invalida (as duas juntas ou sugestão fora do formato); foto_invalida
-- (base64 que não decodifica, vazia ou de outro tipo); foto_grande (mais de 300 KB); trava da linha; versao_desatualizada (detalhe
-- versao_atual=n; 0 sem linha); escrita; operação.
create or replace function public.set_goal_image(p_goal_id uuid, p_image_key text, p_photo text, p_expected_version integer, p_key text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_hash text;
  v_op public.record_operations%rowtype;
  v_g public.goals%rowtype;
  v_img public.goal_images%rowtype;
  v_bytes bytea;
  v_mime text;
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  perform public.clarevo_check_key(p_key);
  v_hash := md5(jsonb_build_array('imagem_meta', p_goal_id, p_image_key, md5(coalesce(p_photo, '')), p_photo is null, p_expected_version)::text);
  perform pg_advisory_xact_lock(hashtext('op:' || v_uid::text || ':' || p_key));

  select * into v_op from public.record_operations where actor_id = v_uid and idempotency_key = p_key;
  if found then
    if v_op.action <> 'imagem_meta' or v_op.request_hash <> v_hash then
      raise exception 'chave_reutilizada' using errcode = 'PT409';
    end if;
    if not public.context_permission(v_op.context_id, 'read') then
      raise exception 'nao_encontrado' using errcode = 'P0002';
    end if;
    return public.clarevo_goal_image_json(v_op.target_id);
  end if;

  v_g := public.clarevo_lock_goal(p_goal_id);
  if p_image_key is not null and (p_photo is not null or p_image_key !~ '^[a-z_]{2,30}$') then
    raise exception 'imagem_invalida' using errcode = '22023';
  end if;
  if p_photo is not null then
    begin
      v_bytes := decode(regexp_replace(p_photo, '\s+', '', 'g'), 'base64');
    exception when others then
      raise exception 'foto_invalida' using errcode = '22023';
    end;
    if octet_length(v_bytes) > 307200 then
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

  -- A linha pode ainda não existir: a trava consultiva serializa a primeira escolha; depois, a linha.
  perform pg_advisory_xact_lock(hashtext('imagem_meta:' || v_g.id::text));
  select * into v_img from public.goal_images where goal_id = v_g.id for update;
  if p_expected_version is distinct from coalesce(v_img.version, 0) then
    raise exception 'versao_desatualizada' using errcode = 'PT409', detail = 'versao_atual=' || coalesce(v_img.version, 0);
  end if;

  if v_img.goal_id is null then
    insert into public.goal_images (goal_id, context_id, image_key, photo, photo_mime)
    values (v_g.id, v_g.context_id, p_image_key, v_bytes, v_mime);
  else
    update public.goal_images
       set image_key = p_image_key, photo = v_bytes, photo_mime = v_mime, version = version + 1, updated_at = now()
     where goal_id = v_g.id;
  end if;

  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id, target_id)
  values (v_uid, p_key, 'imagem_meta', v_g.context_id, v_hash, null, null, v_g.id);

  return public.clarevo_goal_image_json(v_g.id);
end;
$$;

-- A foto de uma meta (I4): {mime, base64, version}, ou null sem foto, sem leitura ou meta excluída. Só leitura.
create or replace function public.goal_photo(p_goal_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('mime', i.photo_mime, 'base64', encode(i.photo, 'base64'), 'version', i.version)
    from public.goal_images i
    join public.goals g on g.id = i.goal_id and g.deleted_at is null
   where i.goal_id = p_goal_id and i.photo is not null and public.context_permission(i.context_id, 'read');
$$;

-- ---------------------------------------------------------------------------
-- Leitura e privilégios, só do que é novo. A tabela: leitura pela RLS, sem a coluna da foto; nenhuma escrita direta.
-- ---------------------------------------------------------------------------
alter table public.goal_images enable row level security;
create policy goal_images_read on public.goal_images for select to authenticated
  using (public.context_permission(context_id, 'read'));
revoke all on public.goal_images from anon, authenticated;
grant select (goal_id, context_id, image_key, has_photo, version, updated_at) on public.goal_images to authenticated;

revoke all on function public.clarevo_goal_image_cleanup() from public, anon, authenticated;
revoke all on function public.clarevo_goal_image_json(uuid) from public, anon, authenticated;
revoke all on function public.set_goal_image(uuid, text, text, integer, text) from public, anon, authenticated;
revoke all on function public.goal_photo(uuid) from public, anon, authenticated;
do $$
declare
  f text;
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    foreach f in array array['clarevo_goal_image_cleanup()', 'clarevo_goal_image_json(uuid)'] loop
      execute format('revoke all on function public.%s from service_role', f);
    end loop;
  end if;
end $$;

grant execute on function public.set_goal_image(uuid, text, text, integer, text) to authenticated;
grant execute on function public.goal_photo(uuid) to authenticated;
