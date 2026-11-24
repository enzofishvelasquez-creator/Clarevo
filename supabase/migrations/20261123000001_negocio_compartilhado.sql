-- Clarevo · migração 0043 · Negócio compartilhado (D-116, Clarevo Plus), desligado até o Plus abrir (D-120). Depois de
-- 20261117000004_espaco_negocio.sql.
-- Decisão do Enzo (D-116, 19/11/2026): o negócio compartilhado com outras pessoas (por exemplo, um comércio da família) é do Clarevo
-- Plus, depois do lançamento. Regra: qualquer pessoa cria um negócio e chama outras; uma só pessoa administra cada negócio (quem
-- criou: convida, muda os papéis, remove e encerra; não há passar a administração), e as outras anotam e veem ("membro") ou só veem
-- ("leitor"); o Pessoal de cada pessoa continua só dela. "Nada do Plus aparece no app nem no site até o Enzo definir" (docs/52, 5):
-- esta migração deixa tudo pronto no banco, com a chave do Plus DESLIGADA (plus_settings.open_from nulo). Com ela desligada, ninguém
-- consegue convidar (plus_indisponivel), então nenhum negócio ganha outra pessoa e nada muda para quem usa o app hoje.
--
-- O que muda no banco:
--   1. A chave do Plus: plus_settings (uma linha só, open_from nulo = fechado), mudada só pela equipe no SQL Editor
--      (clarevo_staff_set_plus); o app lê só se está aberto (plus_status). Quando o Plus tiver preço e lojas, a conferência passa a ser
--      pelo plano de quem administra (clarevo_plus_allows, um ponto só).
--   2. Convites do negócio (business_invites), com as mesmas regras do convite da Família (F3): papel 'membro' ou 'leitor', código de
--      128 bits devolvido uma única vez e nunca gravado (só o SHA-256), 7 dias, uso único, cancelável. Tabela própria, separada de
--      family_invites: as funções da Família não mudam e um código de um nunca vale no outro.
--   3. Funções do app: create_business_invite, cancel_business_invite, preview_business_invite, accept_business_invite,
--      leave_business, remove_business_member e set_business_member_role, mais plus_status (só leitura). Autoria da sessão, chave de
--      idempotência, hash em JSON e record_operations (6 ações novas: 97 no total). Só convidar passa pela trava da assinatura; aceitar,
--      sair, remover, mudar o papel e cancelar convite valem em só ver e exportar (como na Família).
--   4. Pessoas do negócio: a visão business_member_items (as colunas de family_member_items), com o primeiro nome, o papel e a
--      situação; o nome que é o início do e-mail vira "Pessoa do negócio" e quem excluiu a conta, "Pessoa que saiu".
--   5. Um negócio por pessoa, por vez (como L-3 da Família): o próprio ou o de outra pessoa. create_business passa a recusar quem
--      participa do negócio de outra pessoa (ja_tem_negocio, pela nova clarevo_active_business_count), e aceitar recusa quem já
--      participa de um negócio (ja_tem_negocio; do mesmo negócio, ja_no_negocio). Até 6 pessoas, contando quem administra e os convites
--      ainda válidos (negocio_cheio).
--   6. Quem sai ou é removido perde o acesso na hora; o que anotou continua no negócio como histórico. As retiradas para o Pessoal
--      dessa pessoa deixam de ser ligadas (os dois lados viram lançamentos comuns), como no encerrar: sem acesso ao negócio, ela não
--      conseguiria mais excluir o par, e quem administra não alcança o Pessoal dela. O mesmo vale para quem passa a só ver.
--      Fechar o Plus (ou o Plus deixar de valer para quem administra) invalida os convites pendentes: a prévia e o aceite os recusam.
--   7. Encerrar (end_business) continua só sem outra pessoa ativa e agora também cancela os convites pendentes.
--   8. Exclusão da conta (clarevo_erase_person, o corpo da 0028): quem administra um negócio com outras pessoas ativas recebe
--      negocio_com_membros (remove as pessoas antes; não há passar a administração); os negócios entram na lista de travas; os convites
--      do negócio que a pessoa criou somem e o used_by dela vira nulo, como na Família.
-- Compatibilidade: nenhuma função existente muda de assinatura e nenhum dado muda. O app publicado lê o negócio com o filtro
-- kind = 'negocio' e o primeiro resultado; como ninguém pode convidar enquanto o Plus está fechado, ninguém passa a ver o negócio de
-- outra pessoa. O app novo também funciona sem esta migração enquanto o Plus está fechado (plus_status ausente conta como fechado).
-- Aplicar no SQL Editor depois da 0042 (docs/05, passo 12aj) e recarregar o esquema da API. Testes em
-- supabase/tests/99zzzzzzzzzzzzzzzzzzzzzz_negocio_compartilhado.sql.

-- ---------------------------------------------------------------------------
-- 1. A chave do Plus
-- ---------------------------------------------------------------------------
create table public.plus_settings (
  id boolean primary key default true check (id),
  open_from timestamptz,
  updated_at timestamptz not null default now()
);
insert into public.plus_settings (id) values (true);
comment on table public.plus_settings is
  'Chave do Clarevo Plus (D-120): open_from nulo ou no futuro deixa o Plus fechado para todas as pessoas (ninguém convida para o negócio). Uma linha só, mudada só por clarevo_staff_set_plus.';

-- O Plus está aberto agora (sem execute para o app; o app lê plus_status).
create or replace function public.clarevo_plus_open()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select s.open_from <= now() from public.plus_settings s where s.id), false);
$$;

-- O que o Plus deixa a pessoa fazer. Hoje: o Plus aberto para todas as pessoas. Quando houver plano Plus, esta é a única conferência a
-- trocar (pelo plano de quem administra o negócio).
create or replace function public.clarevo_plus_allows(p_person uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_person is not null and public.clarevo_plus_open();
$$;

-- App: o Plus está aberto? Retorno: {open}.
create or replace function public.plus_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  return jsonb_build_object('open', public.clarevo_plus_allows(auth.uid()));
end;
$$;

-- Equipe (só quem roda no SQL Editor): abrir o Plus a partir de p_from (nulo fecha). Retorno: {open_from, updated_at, open}.
create or replace function public.clarevo_staff_set_plus(p_from timestamptz)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  update public.plus_settings set open_from = p_from, updated_at = now() where id;
  return (select jsonb_build_object('open_from', s.open_from, 'updated_at', s.updated_at, 'open', public.clarevo_plus_open())
            from public.plus_settings s where s.id);
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Convites do negócio (as mesmas regras de family_invites)
-- ---------------------------------------------------------------------------
create table public.business_invites (
  id uuid primary key default gen_random_uuid(),
  context_id uuid not null references public.financial_contexts (id) on delete cascade,
  created_by uuid not null references public.persons (id) on delete cascade,
  role text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by uuid references public.persons (id) on delete set null,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  constraint business_invites_papel check (role in ('membro', 'leitor')),
  constraint business_invites_hash check (code_hash ~ '^[0-9a-f]{64}$'),
  constraint business_invites_validade check (expires_at > created_at),
  constraint business_invites_uso check (used_by is null or used_at is not null),
  constraint business_invites_estado check (used_at is null or cancelled_at is null)
);
create unique index business_invites_code_hash on public.business_invites (code_hash);
create index business_invites_context on public.business_invites (context_id);
create index business_invites_created_by_fk_idx on public.business_invites (created_by);
create index business_invites_used_by_fk_idx on public.business_invites (used_by);
comment on table public.business_invites is
  'Convite para o negócio (D-116, Clarevo Plus): papel, validade de 7 dias, uso único e só o resumo SHA-256 do código (nunca o código). Lido só por quem administra; gravado só pelas funções do negócio.';
comment on column public.business_invites.code_hash is
  'SHA-256 (64 hexadecimais) do código de 128 bits do link. O código nunca é gravado: aparece uma única vez, na resposta de create_business_invite.';

-- A mesma defesa do convite da Família (identidade, contexto, autoria, papel, resumo e prazos nunca mudam; uso e cancelamento só passam
-- de nulo a valor; used_by pode virar nulo sozinho). O gatilho da Família não lê nada da tabela: serve para as duas.
create trigger business_invites_guard
  before update on public.business_invites
  for each row execute function public.family_invites_guard();

alter table public.business_invites enable row level security;
-- Só quem administra o negócio lê os convites dele.
create policy business_invites_read on public.business_invites for select to authenticated
  using (public.context_permission(context_id, 'manage'));

-- ---------------------------------------------------------------------------
-- 3. Auxiliares (sem execute para o app)
-- ---------------------------------------------------------------------------

-- Negócios ativos de que a pessoa participa, com qualquer papel (um por vez). Até a 0042, só os que ela administrava.
create or replace function public.clarevo_active_business_count(p_person uuid)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return (select count(*)::integer
            from public.context_memberships m
            join public.financial_contexts c on c.id = m.context_id
           where m.person_id = p_person and m.revoked_at is null
             and c.kind = 'negocio' and c.ended_at is null);
end;
$$;

-- Pessoas ativas e convites ainda válidos do negócio (juntos, no máximo 6).
create or replace function public.clarevo_business_active_count(p_context uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer from public.context_memberships m where m.context_id = p_context and m.revoked_at is null;
$$;

create or replace function public.clarevo_business_valid_invites(p_context uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer from public.business_invites i
   where i.context_id = p_context and i.used_at is null and i.cancelled_at is null and i.expires_at > now();
$$;

-- Pedaços de resposta, no formato que o app lê (o mesmo do convite da Família).
create or replace function public.clarevo_business_invite_json(p_invite uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('id', i.id, 'context_id', i.context_id, 'role', i.role, 'created_by', i.created_by,
                            'expires_at', i.expires_at, 'used_at', i.used_at, 'cancelled_at', i.cancelled_at,
                            'created_at', i.created_at)
    from public.business_invites i where i.id = p_invite;
$$;

-- O primeiro nome de quem convidou, como na Família (clarevo_person_label), com o rótulo neutro do negócio: "Pessoa do negócio" no lugar
-- de "Pessoa da Família" (nome vazio, com arroba ou igual ao início do e-mail).
create or replace function public.clarevo_business_person_label(p_person uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case when l = 'Pessoa da Família' then 'Pessoa do negócio' else l end
    from (select public.clarevo_person_label(p_person) as l) x;
$$;

-- Resultado de aceitar: o negócio, o papel de quem aceitou e o primeiro nome de quem convidou.
create or replace function public.clarevo_business_accept_json(p_invite uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
           'context', public.clarevo_business_json(i.context_id),
           'role', public.clarevo_member_role(i.context_id, auth.uid()),
           'invited_by', public.clarevo_business_person_label(i.created_by))
    from public.business_invites i where i.id = p_invite;
$$;

-- As retiradas entre o negócio e o Pessoal de uma pessoa deixam de ser ligadas (só o vínculo muda; valores, datas e versões ficam).
-- Numa instrução só: a subconsulta vê os dois lados ainda ligados.
create or replace function public.clarevo_unlink_withdrawals(p_business uuid, p_person uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_personal uuid := public.clarevo_personal_context(p_person);
begin
  if v_personal is null then
    return;
  end if;
  perform set_config('clarevo.retirada', 'on', true);
  update public.financial_records r set paired_record_id = null
   where r.paired_record_id is not null
     and ((r.context_id = p_business
           and exists (select 1 from public.financial_records o where o.id = r.paired_record_id and o.context_id = v_personal))
          or (r.context_id = v_personal
              and exists (select 1 from public.financial_records o where o.id = r.paired_record_id and o.context_id = p_business)));
  perform set_config('clarevo.retirada', '', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Pessoas do negócio. A mesma forma de family_member_items (0028): primeiro nome, papel e situação, nunca o e-mail nem o nome
-- inteiro; nome vazio, com arroba ou igual ao início do e-mail vira "Pessoa do negócio"; quem excluiu a conta, "Pessoa que saiu".
-- role: titular (quem administra), membro (lê e anota) ou leitor (só lê). status: ativo ou ex-membro.
-- ---------------------------------------------------------------------------
create view public.business_member_items with (security_barrier = true) as
select m.context_id,
       m.person_id,
       case when p.deleted_at is not null then 'Pessoa que saiu'
            when b.t = '' or position('@' in b.t) > 0 or (a.l <> '' and (a.n = a.l or b.t = a.l))
            then 'Pessoa do negócio' else left(b.t, 40) end as first_name,
       case when m.role = 'titular' then 'titular' when m.can_write then 'membro' else 'leitor' end as role,
       case when m.revoked_at is null then 'ativo' else 'ex-membro' end as status,
       (m.person_id = auth.uid()) as is_me,
       m.created_at as joined_at,
       m.revoked_at as left_at
  from public.context_memberships m
  join public.financial_contexts c on c.id = m.context_id and c.kind = 'negocio'
  join public.persons p on p.id = m.person_id
  left join auth.users u on u.id = m.person_id
  cross join lateral (
    select regexp_replace(coalesce(p.display_name, ''), '^\s+|\s+$', '', 'g') as n,
           left(split_part(coalesce(u.email, ''), '@', 1), 80) as l
  ) a
  cross join lateral (
    select coalesce((regexp_split_to_array(a.n, '\s+'))[1], '') as t
  ) b
 where public.context_permission(m.context_id, 'read');
comment on view public.business_member_items is
  'Pessoas do negócio que quem consulta pode ler: ativas e que saíram, com o primeiro nome, o papel e a situação. Nunca devolve e-mail nem o nome inteiro de outra pessoa; nome que é o início do e-mail vira "Pessoa do negócio" e quem excluiu a conta, "Pessoa que saiu".';

-- ---------------------------------------------------------------------------
-- 5. Convidar. Só quem administra. Papel 'membro' (lê e anota) ou 'leitor' (só lê). O código de 128 bits (32 hexadecimais) é
-- devolvido uma única vez e nunca gravado: só o SHA-256. Repetir a mesma chave devolve o convite sem o código (code nulo).
-- Ordem: sessão; chave; repetição; negócio lido (nao_encontrado); contexto_invalido; quem administra (sem_permissao);
-- plus_indisponivel; papel_invalido; negocio_cheio (pessoas ativas + convites válidos já somam 6); a trava da assinatura
-- (assinatura_necessaria, no gatilho de record_operations).
-- Retorno: {invite: {id, context_id, role, created_by, expires_at, used_at, cancelled_at, created_at}, code}.
-- ---------------------------------------------------------------------------
create or replace function public.create_business_invite(p_context uuid, p_role text, p_key text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_hash text;
  v_op public.record_operations%rowtype;
  v_code text;
  v_inv public.business_invites%rowtype;
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  perform public.clarevo_check_key(p_key);
  v_hash := md5(jsonb_build_array('criar_convite_negocio', p_context, p_role)::text);
  perform pg_advisory_xact_lock(hashtext('op:' || v_uid::text || ':' || p_key));

  select * into v_op from public.record_operations where actor_id = v_uid and idempotency_key = p_key;
  if found then
    if v_op.action <> 'criar_convite_negocio' or v_op.request_hash <> v_hash then
      raise exception 'chave_reutilizada' using errcode = 'PT409';
    end if;
    if not public.context_permission(v_op.context_id, 'read') then
      raise exception 'nao_encontrado' using errcode = 'P0002';
    end if;
    return jsonb_build_object('invite', public.clarevo_business_invite_json(v_op.target_id), 'code', null);
  end if;

  -- A trava do negócio (a mesma de end_business e da retirada) antes de conferir quem administra.
  perform pg_advisory_xact_lock(hashtext('familia:c:' || coalesce(p_context::text, '')));
  perform public.clarevo_require_business_owner(p_context);
  if not public.clarevo_plus_allows(v_uid) then
    raise exception 'plus_indisponivel' using errcode = 'PT402';
  end if;
  if p_role is null or p_role not in ('membro', 'leitor') then
    raise exception 'papel_invalido' using errcode = '22023';
  end if;
  if public.clarevo_business_active_count(p_context) + public.clarevo_business_valid_invites(p_context) >= 6 then
    raise exception 'negocio_cheio' using errcode = 'PT409';
  end if;

  v_code := encode(gen_random_bytes(16), 'hex');
  insert into public.business_invites (context_id, created_by, role, code_hash, expires_at)
  values (p_context, v_uid, p_role, encode(sha256(convert_to(v_code, 'UTF8')), 'hex'), now() + interval '7 days')
  returning * into v_inv;

  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id, target_id)
  values (v_uid, p_key, 'criar_convite_negocio', p_context, v_hash, null, null, v_inv.id);

  return jsonb_build_object('invite', public.clarevo_business_invite_json(v_inv.id), 'code', v_code);
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Cancelar um convite. Só quem administra o negócio do convite (convite que quem chama não lê, ou que não existe:
-- nao_encontrado). Convite já usado: convite_ja_usado; já cancelado ou vencido: segue cancelado, sem erro.
-- Retorno: {invite: {...}}.
-- ---------------------------------------------------------------------------
create or replace function public.cancel_business_invite(p_invite uuid, p_key text)
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
  v_ctx uuid;
  v_inv public.business_invites%rowtype;
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  perform public.clarevo_check_key(p_key);
  v_hash := md5(jsonb_build_array('cancelar_convite_negocio', p_invite)::text);
  perform pg_advisory_xact_lock(hashtext('op:' || v_uid::text || ':' || p_key));

  select * into v_op from public.record_operations where actor_id = v_uid and idempotency_key = p_key;
  if found then
    if v_op.action <> 'cancelar_convite_negocio' or v_op.request_hash <> v_hash then
      raise exception 'chave_reutilizada' using errcode = 'PT409';
    end if;
    if not public.context_permission(v_op.context_id, 'read') then
      raise exception 'nao_encontrado' using errcode = 'P0002';
    end if;
    return jsonb_build_object('invite', public.clarevo_business_invite_json(v_op.target_id));
  end if;

  -- O contexto de um convite nunca muda: ler antes da trava é seguro. Trava, depois a conferência de quem administra.
  select context_id into v_ctx from public.business_invites where id = p_invite;
  perform pg_advisory_xact_lock(hashtext('familia:c:' || coalesce(v_ctx::text, '')));
  perform public.clarevo_require_business_owner(v_ctx);
  select * into v_inv from public.business_invites where id = p_invite for update;
  if v_inv.used_at is not null then
    raise exception 'convite_ja_usado' using errcode = 'PT409';
  end if;
  if v_inv.cancelled_at is null then
    update public.business_invites set cancelled_at = now() where id = v_inv.id;
  end if;

  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id, target_id)
  values (v_uid, p_key, 'cancelar_convite_negocio', v_ctx, v_hash, null, null, v_inv.id);

  return jsonb_build_object('invite', public.clarevo_business_invite_json(v_inv.id));
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Prévia do convite (só leitura): o nome do negócio, o primeiro nome de quem convidou, o papel e a validade, e mais nada. Convite
-- com formato inválido, que não existe, usado, cancelado, vencido ou de negócio encerrado responde sempre convite_invalido, sem
-- revelar qual caso; o mesmo quando o Plus deixou de valer para quem administra (o convite pendente não fura a chave do Plus). Exige
-- sessão. Retorno: {business_name, invited_by, role, expires_at}.
-- ---------------------------------------------------------------------------
create or replace function public.preview_business_invite(p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_hash text := public.clarevo_invite_hash(p_code);
  v_inv public.business_invites%rowtype;
  v_ctx public.financial_contexts%rowtype;
begin
  if auth.uid() is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  if v_hash is not null then
    select * into v_inv from public.business_invites where code_hash = v_hash;
  end if;
  if v_hash is null or v_inv.id is null or v_inv.used_at is not null or v_inv.cancelled_at is not null or v_inv.expires_at <= now() then
    raise exception 'convite_invalido' using errcode = 'P0002';
  end if;
  select * into v_ctx from public.financial_contexts where id = v_inv.context_id;
  if v_ctx.id is null or v_ctx.kind <> 'negocio' or v_ctx.ended_at is not null
     or not public.clarevo_plus_allows(v_ctx.owner_person_id) then
    raise exception 'convite_invalido' using errcode = 'P0002';
  end if;
  return jsonb_build_object(
    'business_name', v_ctx.name,
    'invited_by', public.clarevo_business_person_label(v_inv.created_by),
    'role', v_inv.role,
    'expires_at', v_inv.expires_at);
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. Aceitar o convite. Ordem: sessão; chave; repetição; espaço pessoal da pessoa (sem_permissao, antes de olhar o código, como na
-- Família); convite_invalido (formato ou código que não existe); sob as travas (da pessoa, depois do negócio), tudo de novo:
-- convite_invalido (usado, cancelado, vencido, negócio encerrado, ou o Plus que não vale mais para quem administra: fechar o Plus
-- invalida os convites pendentes); ja_no_negocio (a pessoa já está neste negócio); ja_tem_negocio (já participa de outro negócio,
-- próprio ou de outra pessoa); negocio_cheio. Uso único: marca used_at e used_by; cria (ou reativa) o vínculo com o papel do convite.
-- Aceitar não passa pela trava da assinatura de quem aceita.
-- Retorno: {context: {id, name, created_at, ended_at}, role, invited_by}.
-- ---------------------------------------------------------------------------
create or replace function public.accept_business_invite(p_code text, p_key text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_code_hash text := public.clarevo_invite_hash(p_code);
  v_hash text;
  v_op public.record_operations%rowtype;
  v_inv public.business_invites%rowtype;
  v_ctx public.financial_contexts%rowtype;
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  perform public.clarevo_check_key(p_key);
  -- O pedido leva só o resumo do código, nunca o código.
  v_hash := md5(jsonb_build_array('aceitar_convite_negocio', v_code_hash)::text);
  perform pg_advisory_xact_lock(hashtext('op:' || v_uid::text || ':' || p_key));

  select * into v_op from public.record_operations where actor_id = v_uid and idempotency_key = p_key;
  if found then
    if v_op.action <> 'aceitar_convite_negocio' or v_op.request_hash <> v_hash then
      raise exception 'chave_reutilizada' using errcode = 'PT409';
    end if;
    if not public.context_permission(v_op.context_id, 'read') then
      raise exception 'nao_encontrado' using errcode = 'P0002';
    end if;
    return public.clarevo_business_accept_json(v_op.target_id);
  end if;

  if not exists (select 1 from public.persons where id = v_uid) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if v_code_hash is null then
    raise exception 'convite_invalido' using errcode = 'P0002';
  end if;
  select * into v_inv from public.business_invites where code_hash = v_code_hash;
  if not found then
    raise exception 'convite_invalido' using errcode = 'P0002';
  end if;

  -- A trava da pessoa (a mesma de create_business e da exclusão da conta) e a do negócio.
  perform pg_advisory_xact_lock(hashtext('familia:p:' || v_uid::text));
  perform pg_advisory_xact_lock(hashtext('familia:c:' || v_inv.context_id::text));
  select * into v_inv from public.business_invites where id = v_inv.id for update;
  if v_inv.used_at is not null or v_inv.cancelled_at is not null or v_inv.expires_at <= now() then
    raise exception 'convite_invalido' using errcode = 'P0002';
  end if;
  select * into v_ctx from public.financial_contexts where id = v_inv.context_id;
  if v_ctx.id is null or v_ctx.kind <> 'negocio' or v_ctx.ended_at is not null
     or not public.clarevo_plus_allows(v_ctx.owner_person_id) then
    raise exception 'convite_invalido' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.context_memberships m
              where m.context_id = v_ctx.id and m.person_id = v_uid and m.revoked_at is null) then
    raise exception 'ja_no_negocio' using errcode = 'PT409';
  end if;
  if public.clarevo_active_business_count(v_uid) >= 1 then
    raise exception 'ja_tem_negocio' using errcode = 'PT409';
  end if;
  if public.clarevo_business_active_count(v_ctx.id) >= 6 then
    raise exception 'negocio_cheio' using errcode = 'PT409';
  end if;

  insert into public.context_memberships (context_id, person_id, role, can_read, can_write, can_edit_others)
  values (v_ctx.id, v_uid, 'membro', true, v_inv.role = 'membro', false)
  on conflict (context_id, person_id) do update
    set role = 'membro', can_read = true, can_write = excluded.can_write, can_edit_others = false,
        created_at = now(), revoked_at = null;
  update public.business_invites set used_at = now(), used_by = v_uid where id = v_inv.id;

  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id, target_id)
  values (v_uid, p_key, 'aceitar_convite_negocio', v_ctx.id, v_hash, null, null, v_inv.id);

  return public.clarevo_business_accept_json(v_inv.id);
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. Sair do negócio. Quem anota ou só vê sai (revoked_at) e as retiradas dela deixam de ser ligadas; quem administra recebe
-- titular_nao_sai (remove as pessoas e encerra). Quem não tem vínculo ativo: nao_encontrado. Repetir a mesma chave devolve o mesmo
-- resultado mesmo depois da saída. Retorno: {context_id, left: true}.
-- ---------------------------------------------------------------------------
create or replace function public.leave_business(p_context uuid, p_key text)
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
  v_m public.context_memberships%rowtype;
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  perform public.clarevo_check_key(p_key);
  v_hash := md5(jsonb_build_array('sair_negocio', p_context)::text);
  perform pg_advisory_xact_lock(hashtext('op:' || v_uid::text || ':' || p_key));

  select * into v_op from public.record_operations where actor_id = v_uid and idempotency_key = p_key;
  if found then
    if v_op.action <> 'sair_negocio' or v_op.request_hash <> v_hash then
      raise exception 'chave_reutilizada' using errcode = 'PT409';
    end if;
    return jsonb_build_object('context_id', v_op.context_id, 'left', true);
  end if;

  perform pg_advisory_xact_lock(hashtext('familia:c:' || coalesce(p_context::text, '')));
  if p_context is null or not public.context_permission(p_context, 'read') then
    raise exception 'nao_encontrado' using errcode = 'P0002';
  end if;
  if not public.clarevo_is_business(p_context) then
    raise exception 'contexto_invalido' using errcode = '22023';
  end if;
  select * into v_m from public.context_memberships where context_id = p_context and person_id = v_uid for update;
  if not found or v_m.revoked_at is not null then
    raise exception 'nao_encontrado' using errcode = 'P0002';
  end if;
  if v_m.role = 'titular' then
    raise exception 'titular_nao_sai' using errcode = 'PT409';
  end if;

  update public.context_memberships set revoked_at = now() where context_id = p_context and person_id = v_uid;
  perform public.clarevo_unlink_withdrawals(p_context, v_uid);

  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id, target_id)
  values (v_uid, p_key, 'sair_negocio', p_context, v_hash, null, null, p_context);

  return jsonb_build_object('context_id', p_context, 'left', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- 10. Remover uma pessoa. Só quem administra, nunca sobre si (nao_sobre_si). A pessoa precisa ter vínculo ativo (nao_encontrado). O
-- que ela anotou continua no negócio; as retiradas dela deixam de ser ligadas. Retorno: {context_id, person_id, removed: true}.
-- ---------------------------------------------------------------------------
create or replace function public.remove_business_member(p_context uuid, p_person uuid, p_key text)
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
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  perform public.clarevo_check_key(p_key);
  v_hash := md5(jsonb_build_array('remover_membro_negocio', p_context, p_person)::text);
  perform pg_advisory_xact_lock(hashtext('op:' || v_uid::text || ':' || p_key));

  select * into v_op from public.record_operations where actor_id = v_uid and idempotency_key = p_key;
  if found then
    if v_op.action <> 'remover_membro_negocio' or v_op.request_hash <> v_hash then
      raise exception 'chave_reutilizada' using errcode = 'PT409';
    end if;
    if not public.context_permission(v_op.context_id, 'read') then
      raise exception 'nao_encontrado' using errcode = 'P0002';
    end if;
    return jsonb_build_object('context_id', v_op.context_id, 'person_id', v_op.target_id, 'removed', true);
  end if;

  perform pg_advisory_xact_lock(hashtext('familia:c:' || coalesce(p_context::text, '')));
  perform public.clarevo_require_business_owner(p_context);
  if p_person is null then
    raise exception 'nao_encontrado' using errcode = 'P0002';
  end if;
  if p_person = v_uid then
    raise exception 'nao_sobre_si' using errcode = 'PT409';
  end if;
  perform 1 from public.context_memberships
   where context_id = p_context and person_id = p_person and revoked_at is null and role <> 'titular' for update;
  if not found then
    raise exception 'nao_encontrado' using errcode = 'P0002';
  end if;

  update public.context_memberships set revoked_at = now() where context_id = p_context and person_id = p_person;
  perform public.clarevo_unlink_withdrawals(p_context, p_person);

  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id, target_id)
  values (v_uid, p_key, 'remover_membro_negocio', p_context, v_hash, null, null, p_person);

  return jsonb_build_object('context_id', p_context, 'person_id', p_person, 'removed', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- 11. Mudar o papel de uma pessoa. Só quem administra, nunca sobre si. 'membro' lê e anota; 'leitor' só lê (papel_invalido para
-- outro valor); passar a 'leitor' desliga as retiradas da pessoa. Retorno: {context_id, person_id, role}.
-- ---------------------------------------------------------------------------
create or replace function public.set_business_member_role(p_context uuid, p_person uuid, p_role text, p_key text)
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
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  perform public.clarevo_check_key(p_key);
  v_hash := md5(jsonb_build_array('alterar_papel_negocio', p_context, p_person, p_role)::text);
  perform pg_advisory_xact_lock(hashtext('op:' || v_uid::text || ':' || p_key));

  select * into v_op from public.record_operations where actor_id = v_uid and idempotency_key = p_key;
  if found then
    if v_op.action <> 'alterar_papel_negocio' or v_op.request_hash <> v_hash then
      raise exception 'chave_reutilizada' using errcode = 'PT409';
    end if;
    if not public.context_permission(v_op.context_id, 'read') then
      raise exception 'nao_encontrado' using errcode = 'P0002';
    end if;
    return jsonb_build_object('context_id', v_op.context_id, 'person_id', v_op.target_id,
                              'role', public.clarevo_member_role(v_op.context_id, v_op.target_id));
  end if;

  perform pg_advisory_xact_lock(hashtext('familia:c:' || coalesce(p_context::text, '')));
  perform public.clarevo_require_business_owner(p_context);
  if p_role is null or p_role not in ('membro', 'leitor') then
    raise exception 'papel_invalido' using errcode = '22023';
  end if;
  if p_person is null then
    raise exception 'nao_encontrado' using errcode = 'P0002';
  end if;
  if p_person = v_uid then
    raise exception 'nao_sobre_si' using errcode = 'PT409';
  end if;
  perform 1 from public.context_memberships
   where context_id = p_context and person_id = p_person and revoked_at is null and role <> 'titular' for update;
  if not found then
    raise exception 'nao_encontrado' using errcode = 'P0002';
  end if;

  update public.context_memberships
     set can_read = true, can_write = (p_role = 'membro'), can_edit_others = false
   where context_id = p_context and person_id = p_person;
  -- Quem passa a só ver não consegue mais excluir a própria retirada (exige escrita nos dois espaços): os dois lados viram lançamentos
  -- comuns, como ao sair.
  if p_role = 'leitor' then
    perform public.clarevo_unlink_withdrawals(p_context, p_person);
  end if;

  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id, target_id)
  values (v_uid, p_key, 'alterar_papel_negocio', p_context, v_hash, null, null, p_person);

  return jsonb_build_object('context_id', p_context, 'person_id', p_person, 'role', p_role);
end;
$$;

-- ---------------------------------------------------------------------------
-- 12. Encerrar o negócio: o corpo da 0042, e agora os convites pendentes são cancelados junto (negocio_com_membros continua: quem
-- administra remove as outras pessoas antes).
-- ---------------------------------------------------------------------------
create or replace function public.end_business(p_context uuid, p_key text)
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
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  perform public.clarevo_check_key(p_key);
  v_hash := md5(jsonb_build_array('encerrar_negocio', p_context)::text);
  perform pg_advisory_xact_lock(hashtext('op:' || v_uid::text || ':' || p_key));

  select * into v_op from public.record_operations where actor_id = v_uid and idempotency_key = p_key;
  if found then
    if v_op.action <> 'encerrar_negocio' or v_op.request_hash <> v_hash then
      raise exception 'chave_reutilizada' using errcode = 'PT409';
    end if;
    return jsonb_build_object('context_id', v_op.context_id, 'ended', true);
  end if;

  perform pg_advisory_xact_lock(hashtext('familia:c:' || coalesce(p_context::text, '')));
  perform public.clarevo_require_business_owner(p_context);
  if exists (select 1 from public.context_memberships
              where context_id = p_context and revoked_at is null and person_id <> v_uid) then
    raise exception 'negocio_com_membros' using errcode = 'PT409';
  end if;

  -- As retiradas: os dois lados deixam de ser ligados (só o vínculo muda; valores, datas e versões ficam).
  perform set_config('clarevo.retirada', 'on', true);
  update public.financial_records p set paired_record_id = null
   where p.paired_record_id is not null
     and (p.context_id = p_context
          or p.paired_record_id in (select b.id from public.financial_records b where b.context_id = p_context));
  perform set_config('clarevo.retirada', '', true);

  update public.context_memberships set revoked_at = now() where context_id = p_context and revoked_at is null;
  update public.business_invites set cancelled_at = now()
   where context_id = p_context and used_at is null and cancelled_at is null;
  update public.financial_contexts set ended_at = now() where id = p_context;

  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id, target_id)
  values (v_uid, p_key, 'encerrar_negocio', p_context, v_hash, null, null, p_context);

  return jsonb_build_object('context_id', p_context, 'ended', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- 13. Exclusão da conta: o corpo da 0028 (clarevo_erase_person), com três mudanças: os negócios entram nas travas; quem administra um
-- negócio com outras pessoas ativas recebe negocio_com_membros (nada muda); e os convites do negócio que a pessoa criou somem e o
-- used_by dela vira nulo. Quem participa do negócio de outra pessoa sai dele como de uma Família (o que anotou fica, com a autoria
-- anônima), e o Pessoal dela, apagado, desliga as retiradas do outro lado (on delete set null).
-- ---------------------------------------------------------------------------
create or replace function public.clarevo_erase_person(p_person uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_cand uuid[];
  v_owned uuid[];
  v_member uuid[];
  v_ctx uuid;
begin
  if p_person is null then
    return;
  end if;
  -- 1. Trava por pessoa: a mesma de create_family, accept_family_invite e ensure_personal_space.
  perform pg_advisory_xact_lock(hashtext('familia:p:' || p_person::text));
  -- T7 (0022): a trava das mensagens da pessoa (WhatsApp e Telegram), antes da linha da pessoa; as funções do servidor a tomam depois
  -- da de quem escreve.
  perform pg_advisory_xact_lock(hashtext('chat:p:' || p_person::text));

  -- 2. As Famílias e os negócios candidatos (dona, titular, membro, leitora ou ex-membro) e a trava de cada um, em ordem de
  -- identificador (o negócio usa a mesma trava 'familia:c:', 0042).
  select coalesce(array_agg(x.id order by x.id), '{}') into v_cand
    from (select c.id from public.financial_contexts c
           where c.kind in ('familia', 'negocio') and c.owner_person_id = p_person
          union
          select m.context_id from public.context_memberships m
            join public.financial_contexts c on c.id = m.context_id and c.kind in ('familia', 'negocio')
           where m.person_id = p_person) x;
  foreach v_ctx in array v_cand loop
    perform pg_advisory_xact_lock(hashtext('familia:c:' || v_ctx::text));
  end loop;

  -- 3. A linha da pessoa. Sem linha viva (nunca criou espaço, já excluída ou anônima), não há o que apagar.
  perform 1 from public.persons p where p.id = p_person and p.deleted_at is null for update;
  if not found then
    return;
  end if;

  -- 4. Agora, com as Famílias travadas: o que é dela (o Pessoal e as Famílias em que é titular, ou dona de Família já encerrada) e o
  -- que é dos outros e ela só frequenta (as Famílias em que é membro, leitora ou ex-membro).
  select coalesce(array_agg(c.id order by c.id), '{}') into v_owned
    from public.financial_contexts c
   where c.owner_person_id = p_person
      or (c.kind = 'familia' and exists (select 1 from public.context_memberships m
                                          where m.context_id = c.id and m.person_id = p_person and m.role = 'titular' and m.revoked_at is null));
  select coalesce(array_agg(m.context_id order by m.context_id), '{}') into v_member
    from public.context_memberships m
    join public.financial_contexts c on c.id = m.context_id and c.kind = 'familia'
   where m.person_id = p_person and not (m.context_id = any (v_owned));
  perform 1 from public.financial_contexts where id = any (v_owned) order by id for update;

  -- Regra 3: titular com outras pessoas ativas passa a titularidade ou remove as pessoas antes. Nada mudou até aqui.
  for v_ctx in select c.id from public.financial_contexts c
                where c.id = any (v_owned) and c.kind = 'familia' and c.ended_at is null loop
    if exists (select 1 from public.context_memberships m
                where m.context_id = v_ctx and m.revoked_at is null and m.person_id <> p_person) then
      raise exception 'transferir_antes' using errcode = 'PT409';
    end if;
  end loop;
  -- D-116: quem administra um negócio com outras pessoas ativas remove as pessoas antes (não há passar a administração).
  for v_ctx in select c.id from public.financial_contexts c
                where c.id = any (v_owned) and c.kind = 'negocio' and c.ended_at is null loop
    if exists (select 1 from public.context_memberships m
                where m.context_id = v_ctx and m.revoked_at is null and m.person_id <> p_person) then
      raise exception 'negocio_com_membros' using errcode = 'PT409';
    end if;
  end loop;

  -- Regras 2 e 3: o Pessoal e as Famílias dela (titular sozinha, ou já encerradas) são apagados de verdade.
  foreach v_ctx in array v_owned loop
    perform public.clarevo_erase_context(v_ctx);
  end loop;

  -- Regra 3: nas Famílias dos outros ela sai (o que anotou continua, com a autoria anônima) e os convites dela somem.
  update public.context_memberships set revoked_at = now() where person_id = p_person and revoked_at is null;
  delete from public.family_invites where created_by = p_person;
  update public.family_invites set used_by = null where used_by = p_person;
  delete from public.business_invites where created_by = p_person;
  update public.business_invites set used_by = null where used_by = p_person;

  -- Regra 5: o que é só dela, em qualquer contexto.
  delete from public.context_activity where person_id = p_person;
  delete from public.return_reviews where person_id = p_person;
  delete from public.savings_checks where person_id = p_person;
  delete from public.signup_sources where person_id = p_person;
  delete from public.legal_acceptances where person_id = p_person;
  delete from public.chat_links where person_id = p_person;
  delete from public.chat_link_codes where person_id = p_person;
  delete from public.chat_messages where person_id = p_person;

  -- Regra 4: a licença ativa termina no ato; os direitos ao plano saem; a empresa fica só com a licença encerrada, sem a pessoa.
  -- Só o dia (o meio-dia de Brasília), não o horário: a empresa vê que a licença terminou, sem saber a hora em que a conta foi excluída.
  update public.licenses
     set status = 'encerrada',
         ended_at = greatest((date_trunc('day', now() at time zone 'America/Sao_Paulo') + interval '12 hours') at time zone 'America/Sao_Paulo',
                             activated_at)
   where person_id = p_person and status = 'ativa';
  delete from public.plan_entitlements where person_id = p_person;
  update public.licenses set person_id = null where person_id = p_person;
  delete from public.organization_admins where person_id = p_person;

  delete from public.record_operations where actor_id = p_person;

  -- A linha de persons sai; se ainda é autora de algo numa Família que continua, vira a pessoa anônima (X1). Nunca como dona nem
  -- titular: com a Família parada isso já não acontece, e a conferência abaixo é o último fecho (X7), antes de a pessoa virar anônima.
  begin
    delete from public.persons where id = p_person;
  exception when foreign_key_violation then
    if exists (select 1 from public.financial_contexts c where c.owner_person_id = p_person)
       or exists (select 1 from public.context_memberships m where m.person_id = p_person and m.role = 'titular' and m.revoked_at is null) then
      raise exception 'transferir_antes' using errcode = 'PT409';
    end if;
    update public.persons
       set display_name = '', deleted_at = now(), time_zone = 'America/Sao_Paulo', locale = 'pt-BR'
     where id = p_person;
  end;
end;
$$;

-- ---------------------------------------------------------------------------
-- 14. Operações: a lista vigente (0042) mais as seis do negócio compartilhado, todas com o alvo em target_id: o convite (criar,
-- cancelar, aceitar), o negócio (sair) ou a pessoa (remover, papel).
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
  'imagem_meta',
  'gerar_codigo_telegram', 'ligar_telegram', 'desligar_telegram',
  'aceitar_termos',
  'ordenar_metas',
  'criar_investimento', 'alterar_investimento', 'situacao_investimento', 'excluir_investimento',
  'registrar_movimento_investimento', 'alterar_movimento_investimento', 'excluir_movimento_investimento',
  'definir_plano_investimentos', 'excluir_plano_investimentos',
  'origem_valor_meta',
  'criar_negocio', 'renomear_negocio', 'encerrar_negocio', 'criar_retirada_negocio', 'excluir_retirada_negocio', 'mover_lancamento',
  'criar_convite_negocio', 'cancelar_convite_negocio', 'aceitar_convite_negocio', 'sair_negocio', 'remover_membro_negocio',
  'alterar_papel_negocio'));
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
                 'imagem_meta', 'ordenar_metas', 'origem_valor_meta',
                 'criar_investimento', 'alterar_investimento', 'situacao_investimento', 'excluir_investimento',
                 'registrar_movimento_investimento', 'alterar_movimento_investimento', 'excluir_movimento_investimento',
                 'criar_negocio', 'renomear_negocio', 'encerrar_negocio',
                 'criar_convite_negocio', 'cancelar_convite_negocio', 'aceitar_convite_negocio', 'sair_negocio',
                 'remover_membro_negocio', 'alterar_papel_negocio')
      and target_id is not null and record_id is null and commitment_id is null)
  or (action in ('pagar_fatura', 'desfazer_pagamento_fatura')
      and target_id is not null and record_id is not null and commitment_id is not null)
  or (action in ('criar_retirada_negocio', 'excluir_retirada_negocio', 'mover_lancamento')
      and target_id is not null and record_id is not null and commitment_id is null)
  or (action = 'criar_ocorrencia' and commitment_id is not null and target_id is not null and record_id is null)
  or (action in ('decidir_revisao', 'responder_guardar', 'revisar_assinaturas', 'marcar_mes_conferido', 'desmarcar_mes_conferido',
                 'responder_origem_cadastro', 'gerar_codigo_whatsapp', 'ligar_whatsapp', 'desligar_whatsapp',
                 'gerar_codigo_telegram', 'ligar_telegram', 'desligar_telegram', 'aceitar_termos',
                 'definir_plano_investimentos', 'excluir_plano_investimentos')
      and record_id is null and commitment_id is null and target_id is null));

-- ---------------------------------------------------------------------------
-- 15. Atividade (a função da 0042) sem contar nenhuma das seis ações como anotação; e só convidar passa pela trava da assinatura (a
-- lista da 0042 mais aceitar, sair, remover, mudar o papel e cancelar convite do negócio, como as da Família).
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
                    'gerar_codigo_telegram', 'ligar_telegram', 'desligar_telegram', 'aceitar_termos', 'ordenar_metas',
                    'criar_familia', 'criar_convite_familia', 'cancelar_convite_familia', 'aceitar_convite_familia', 'sair_familia',
                    'remover_membro_familia', 'alterar_papel_familia', 'transferir_titularidade_familia', 'encerrar_familia',
                    'convidar_licencas', 'renovar_convite_licenca', 'cancelar_convite_licenca', 'encerrar_licenca', 'aceitar_licenca',
                    'criar_negocio', 'renomear_negocio', 'encerrar_negocio',
                    'criar_convite_negocio', 'cancelar_convite_negocio', 'aceitar_convite_negocio', 'sair_negocio',
                    'remover_membro_negocio', 'alterar_papel_negocio') then
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

create or replace function public.clarevo_write_free_actions()
returns text[]
language sql
immutable
set search_path = public
as $$
  select array['sair_familia', 'aceitar_convite_familia', 'encerrar_familia', 'remover_membro_familia', 'transferir_titularidade_familia',
               'alterar_papel_familia', 'cancelar_convite_familia', 'aceitar_licenca', 'convidar_licencas', 'renovar_convite_licenca',
               'cancelar_convite_licenca', 'encerrar_licenca', 'ligar_whatsapp', 'desligar_whatsapp', 'ligar_telegram', 'desligar_telegram',
               'responder_origem_cadastro', 'decidir_revisao', 'aceitar_termos', 'encerrar_negocio',
               'sair_negocio', 'aceitar_convite_negocio', 'remover_membro_negocio', 'alterar_papel_negocio',
               'cancelar_convite_negocio']::text[];
$$;

-- ---------------------------------------------------------------------------
-- 16. Privilégios: as oito funções do app só para authenticated; auxiliares, a equipe e a chave do Plus para ninguém com sessão; os
-- convites só por colunas (sem o resumo do código) e pela política de quem administra; a visão só para leitura.
-- ---------------------------------------------------------------------------
alter table public.plus_settings enable row level security;
revoke all on public.plus_settings from anon, authenticated, service_role;
revoke all on public.business_invites from anon, authenticated, service_role;
grant select (id, context_id, created_by, role, expires_at, used_at, used_by, cancelled_at, created_at)
  on public.business_invites to authenticated;
revoke all on public.business_member_items from anon, authenticated, service_role;
grant select on public.business_member_items to authenticated;

revoke all on function public.clarevo_plus_open() from public, anon, authenticated, service_role;
revoke all on function public.clarevo_plus_allows(uuid) from public, anon, authenticated, service_role;
revoke all on function public.clarevo_staff_set_plus(timestamptz) from public, anon, authenticated, service_role;
revoke all on function public.clarevo_active_business_count(uuid) from public, anon, authenticated, service_role;
revoke all on function public.clarevo_business_active_count(uuid) from public, anon, authenticated, service_role;
revoke all on function public.clarevo_business_valid_invites(uuid) from public, anon, authenticated, service_role;
revoke all on function public.clarevo_business_invite_json(uuid) from public, anon, authenticated, service_role;
revoke all on function public.clarevo_business_accept_json(uuid) from public, anon, authenticated, service_role;
revoke all on function public.clarevo_business_person_label(uuid) from public, anon, authenticated, service_role;
revoke all on function public.clarevo_unlink_withdrawals(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.clarevo_erase_person(uuid) from public, anon, authenticated, service_role;
revoke all on function public.clarevo_track_activity() from public, anon, authenticated, service_role;
revoke all on function public.clarevo_write_free_actions() from public, anon, authenticated, service_role;

revoke all on function public.plus_status() from public, anon;
revoke all on function public.create_business_invite(uuid, text, text) from public, anon;
revoke all on function public.cancel_business_invite(uuid, text) from public, anon;
revoke all on function public.preview_business_invite(text) from public, anon;
revoke all on function public.accept_business_invite(text, text) from public, anon;
revoke all on function public.leave_business(uuid, text) from public, anon;
revoke all on function public.remove_business_member(uuid, uuid, text) from public, anon;
revoke all on function public.set_business_member_role(uuid, uuid, text, text) from public, anon;
revoke all on function public.end_business(uuid, text) from public, anon;
grant execute on function public.plus_status() to authenticated;
grant execute on function public.create_business_invite(uuid, text, text) to authenticated;
grant execute on function public.cancel_business_invite(uuid, text) to authenticated;
grant execute on function public.preview_business_invite(text) to authenticated;
grant execute on function public.accept_business_invite(text, text) to authenticated;
grant execute on function public.leave_business(uuid, text) to authenticated;
grant execute on function public.remove_business_member(uuid, uuid, text) to authenticated;
grant execute on function public.set_business_member_role(uuid, uuid, text, text) to authenticated;
grant execute on function public.end_business(uuid, text) to authenticated;
