-- Clarevo · migração 0046 · Negócio com equipe no Plus: sociedade, passar a administração e o papel Contabilidade (D-123), desligado
-- até o Plus abrir (D-120). Depois de 20261125000001_negocio_a_receber.sql.
-- Decisões do Enzo (D-123, 25/11/2026), a partir do estudo do pequeno e médio negócio no Plus: o app pergunta se o negócio é uma
-- sociedade; quem administra pode passar a administração para outra pessoa do negócio (muda a regra da D-116, que não deixava passar);
-- e a contabilidade tem papel próprio, só de leitura, fora do limite de 6 pessoas e da regra de um negócio por vez. Com o Plus fechado
-- ninguém convida (plus_indisponivel), então nenhum negócio tem outra pessoa e nada muda para quem usa o app hoje.
--
-- O que muda no banco:
--   1. Contabilidade: context_memberships.accountant (o vínculo é 'membro' sem escrita, com accountant verdadeiro) e o papel
--      'contabilidade' em business_invites. A Contabilidade lê o negócio pela mesma conferência de sempre (context_permission 'read');
--      nunca anota nem muda nada, e só alcança aquele negócio (o vínculo é por contexto). Não conta no limite de 6 pessoas
--      (negocio_cheio) nem na regra de um negócio por vez (ja_tem_negocio): um escritório atende vários negócios e pode ter o próprio.
--      Limite próprio: 3 acessos de Contabilidade por negócio, contando os convites válidos (contabilidade_cheia). Não muda de papel
--      (set_business_member_role recusa papel_invalido) e nunca recebe a administração. business_member_items e clarevo_member_role
--      devolvem 'contabilidade'. Nova my_accounting_businesses (só leitura): os negócios que a pessoa acompanha, para a área própria
--      do app (fora do seletor de espaço).
--   2. Passar a administração: nova transfer_business_admin, como transfer_family_ownership. Quem administrava vira "Anota e vê" e
--      pode sair depois; a pessoa escolhida (que anota ou só vê) passa a administrar. Não depende do Plus estar aberto: é a saída de um
--      negócio que ficaria preso. Vale em só ver e exportar.
--   3. Sociedade: financial_contexts.business_partnership (nulo = não respondeu) e a nova set_business_partnership (só quem administra,
--      com o Plus aberto). clarevo_business_json passa a devolver business_partnership. A resposta não muda permissão nenhuma.
--   4. Encerrar e excluir a conta: a Contabilidade não impede (só as pessoas que anotam ou só veem: negocio_com_membros) e perde o
--      acesso junto. Sair e ser removida cancelam os convites pendentes que a pessoa criou (quem já administrou pode sair).
--   5. Duas ações novas em record_operations (105 no total): transferir_administracao_negocio (vale em só ver e exportar) e
--      definir_sociedade_negocio (passa pela trava da assinatura); nenhuma conta como anotação. Três funções novas do app (130 no total).
-- Compatibilidade: nenhuma função existente muda de assinatura e nenhum dado muda (as colunas novas nascem falsas ou nulas). O app
-- publicado continua igual: com o Plus fechado, não existe Contabilidade nem outra pessoa em negócio nenhum. Aplicar no SQL Editor
-- depois da 0045 (docs/05, passo 12am) e recarregar o esquema da API. Testes em
-- supabase/tests/99zzzzzzzzzzzzzzzzzzzzzzzzz_negocio_equipe.sql.

-- ---------------------------------------------------------------------------
-- 1. Colunas e regras novas
-- ---------------------------------------------------------------------------
alter table public.context_memberships add column accountant boolean not null default false;
-- A Contabilidade só lê: nunca titular, nunca escrita.
alter table public.context_memberships add constraint context_memberships_contabilidade
  check (not accountant or (role = 'membro' and not can_write and not can_edit_others));
comment on column public.context_memberships.accountant is
  'Vínculo da Contabilidade no negócio (D-123): só leitura, fora do limite de 6 pessoas e da regra de um negócio por vez.';

alter table public.business_invites drop constraint business_invites_papel;
alter table public.business_invites add constraint business_invites_papel check (role in ('membro', 'leitor', 'contabilidade'));

alter table public.financial_contexts add column business_partnership boolean;
-- Só no negócio (sem o literal do tipo do negócio, como na 0044).
alter table public.financial_contexts add constraint financial_contexts_sociedade
  check (business_partnership is null or kind not in ('pessoal', 'familia'));
comment on column public.financial_contexts.business_partnership is
  'O negócio é uma sociedade? Resposta de quem administra (D-123); nulo = não respondeu. Não muda permissão nenhuma.';

-- ---------------------------------------------------------------------------
-- 2. Auxiliares (sem execute para o app)
-- ---------------------------------------------------------------------------

-- Negócios ativos de que a pessoa participa (um por vez), sem os que ela só acompanha como Contabilidade.
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
           where m.person_id = p_person and m.revoked_at is null and not m.accountant
             and c.kind = 'negocio' and c.ended_at is null);
end;
$$;

-- Pessoas ativas e convites ainda válidos do negócio (juntos, no máximo 6), sem a Contabilidade.
create or replace function public.clarevo_business_active_count(p_context uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer from public.context_memberships m
   where m.context_id = p_context and m.revoked_at is null and not m.accountant;
$$;

create or replace function public.clarevo_business_valid_invites(p_context uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer from public.business_invites i
   where i.context_id = p_context and i.role <> 'contabilidade'
     and i.used_at is null and i.cancelled_at is null and i.expires_at > now();
$$;

-- A Contabilidade do negócio: os vínculos ativos e, com p_invites, também os convites ainda válidos (juntos, no máximo 3).
create or replace function public.clarevo_business_accountants(p_context uuid, p_invites boolean)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select (select count(*)::integer from public.context_memberships m
           where m.context_id = p_context and m.revoked_at is null and m.accountant)
       + case when p_invites then
           (select count(*)::integer from public.business_invites i
             where i.context_id = p_context and i.role = 'contabilidade'
               and i.used_at is null and i.cancelled_at is null and i.expires_at > now())
         else 0 end;
$$;

-- Papel de uma pessoa na Família ou no negócio: titular; membro (lê e anota); leitor (só lê); contabilidade (só lê, no negócio).
-- Nulo se não há vínculo.
create or replace function public.clarevo_member_role(p_context uuid, p_person uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case when m.role = 'titular' then 'titular' when m.accountant then 'contabilidade'
              when m.can_write then 'membro' else 'leitor' end
    from public.context_memberships m
   where m.context_id = p_context and m.person_id = p_person;
$$;

-- O negócio no formato que o app lê, agora com a resposta da sociedade.
create or replace function public.clarevo_business_json(p_context uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('id', c.id, 'name', c.name, 'created_at', c.created_at, 'ended_at', c.ended_at,
                            'business_profile', c.business_profile, 'business_partnership', c.business_partnership)
    from public.financial_contexts c where c.id = p_context;
$$;

-- ---------------------------------------------------------------------------
-- 3. Pessoas do negócio: a visão da 0043 com o papel 'contabilidade'.
-- ---------------------------------------------------------------------------
create or replace view public.business_member_items with (security_barrier = true) as
select m.context_id,
       m.person_id,
       case when p.deleted_at is not null then 'Pessoa que saiu'
            when b.t = '' or position('@' in b.t) > 0 or (a.l <> '' and (a.n = a.l or b.t = a.l))
            then 'Pessoa do negócio' else left(b.t, 40) end as first_name,
       case when m.role = 'titular' then 'titular' when m.accountant then 'contabilidade'
            when m.can_write then 'membro' else 'leitor' end as role,
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
  'Pessoas do negócio que quem consulta pode ler: ativas e que saíram, com o primeiro nome, o papel (titular, membro, leitor ou contabilidade) e a situação. Nunca devolve e-mail nem o nome inteiro de outra pessoa; nome que é o início do e-mail vira "Pessoa do negócio" e quem excluiu a conta, "Pessoa que saiu".';

-- ---------------------------------------------------------------------------
-- 4. Convidar: o corpo da 0043 com o papel 'contabilidade'. Ordem: sessão; chave; repetição; negócio lido (nao_encontrado);
-- contexto_invalido; quem administra (sem_permissao); plus_indisponivel; papel_invalido; negocio_cheio (pessoas ativas + convites
-- válidos, sem a Contabilidade, já somam 6) ou, para a Contabilidade, contabilidade_cheia (3 acessos, contando convites válidos); a
-- trava da assinatura (assinatura_necessaria, no gatilho de record_operations).
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
  if p_role is null or p_role not in ('membro', 'leitor', 'contabilidade') then
    raise exception 'papel_invalido' using errcode = '22023';
  end if;
  if p_role = 'contabilidade' then
    if public.clarevo_business_accountants(p_context, true) >= 3 then
      raise exception 'contabilidade_cheia' using errcode = 'PT409';
    end if;
  elsif public.clarevo_business_active_count(p_context) + public.clarevo_business_valid_invites(p_context) >= 6 then
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
-- 5. Aceitar: o corpo da 0043. Com o papel 'contabilidade', não há ja_tem_negocio nem negocio_cheio (a Contabilidade fica fora das
-- duas regras) e sim contabilidade_cheia (3 vínculos ativos). ja_no_negocio continua para qualquer papel. O vínculo da Contabilidade
-- é 'membro' sem escrita, com accountant verdadeiro; o de quem anota ou só vê volta a ter accountant falso (reativação).
-- Retorno: {context: {id, name, created_at, ended_at, business_profile, business_partnership}, role, invited_by}.
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
  v_accountant boolean;
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
  v_accountant := v_inv.role = 'contabilidade';
  if v_accountant then
    if public.clarevo_business_accountants(v_ctx.id, false) >= 3 then
      raise exception 'contabilidade_cheia' using errcode = 'PT409';
    end if;
  else
    if public.clarevo_active_business_count(v_uid) >= 1 then
      raise exception 'ja_tem_negocio' using errcode = 'PT409';
    end if;
    if public.clarevo_business_active_count(v_ctx.id) >= 6 then
      raise exception 'negocio_cheio' using errcode = 'PT409';
    end if;
  end if;

  insert into public.context_memberships (context_id, person_id, role, can_read, can_write, can_edit_others, accountant)
  values (v_ctx.id, v_uid, 'membro', true, v_inv.role = 'membro', false, v_accountant)
  on conflict (context_id, person_id) do update
    set role = 'membro', can_read = true, can_write = excluded.can_write, can_edit_others = false,
        accountant = excluded.accountant, created_at = now(), revoked_at = null;
  update public.business_invites set used_at = now(), used_by = v_uid where id = v_inv.id;

  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id, target_id)
  values (v_uid, p_key, 'aceitar_convite_negocio', v_ctx.id, v_hash, null, null, v_inv.id);

  return public.clarevo_business_accept_json(v_inv.id);
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Mudar o papel: o corpo da 0043, e a Contabilidade não muda de papel (papel_invalido): passar a "Anota e vê" contornaria o limite
-- de 6 pessoas e a regra de um negócio por vez. Retorno: {context_id, person_id, role}.
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
  v_m public.context_memberships%rowtype;
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
  select * into v_m from public.context_memberships
   where context_id = p_context and person_id = p_person and revoked_at is null and role <> 'titular' for update;
  if not found then
    raise exception 'nao_encontrado' using errcode = 'P0002';
  end if;
  if v_m.accountant then
    raise exception 'papel_invalido' using errcode = '22023';
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
-- 7. Passar a administração (D-123), como transfer_family_ownership. Só quem administra, para uma pessoa com vínculo ativo que anota
-- ou só vê (nunca a Contabilidade: papel_invalido), nunca para si (nao_sobre_si). Quem administrava vira "Anota e vê" (lê e anota) e
-- pode sair depois; a pessoa escolhida passa a administrar (lê, anota e edita o que é de outras pessoas). Os convites válidos
-- continuam valendo. Não depende do Plus estar aberto e vale em só ver e exportar: é a saída de um negócio que ficaria preso.
-- Ordem: sessão; chave; repetição; sob a trava do negócio, nao_encontrado; contexto_invalido; sem_permissao; o alvo (nao_encontrado,
-- nao_sobre_si, papel_invalido). Retorno: {context_id, person_id (quem passa a administrar), role: 'titular'}.
-- ---------------------------------------------------------------------------
create or replace function public.transfer_business_admin(p_context uuid, p_person uuid, p_key text)
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
  v_hash := md5(jsonb_build_array('transferir_administracao_negocio', p_context, p_person)::text);
  perform pg_advisory_xact_lock(hashtext('op:' || v_uid::text || ':' || p_key));

  select * into v_op from public.record_operations where actor_id = v_uid and idempotency_key = p_key;
  if found then
    if v_op.action <> 'transferir_administracao_negocio' or v_op.request_hash <> v_hash then
      raise exception 'chave_reutilizada' using errcode = 'PT409';
    end if;
    if not public.context_permission(v_op.context_id, 'read') then
      raise exception 'nao_encontrado' using errcode = 'P0002';
    end if;
    return jsonb_build_object('context_id', v_op.context_id, 'person_id', v_op.target_id, 'role', 'titular');
  end if;

  -- A trava do negócio antes de conferir quem administra (como F9 da Família): passar a B e remover B ao mesmo tempo se enfileiram, e
  -- a segunda confere já com o resultado da primeira. O negócio nunca fica sem quem administra.
  perform pg_advisory_xact_lock(hashtext('familia:c:' || coalesce(p_context::text, '')));
  perform public.clarevo_require_business_owner(p_context);
  if p_person is null then
    raise exception 'nao_encontrado' using errcode = 'P0002';
  end if;
  if p_person = v_uid then
    raise exception 'nao_sobre_si' using errcode = 'PT409';
  end if;
  select * into v_m from public.context_memberships
   where context_id = p_context and person_id = p_person and revoked_at is null and role <> 'titular' for update;
  if not found then
    raise exception 'nao_encontrado' using errcode = 'P0002';
  end if;
  if v_m.accountant then
    raise exception 'papel_invalido' using errcode = '22023';
  end if;

  -- Primeiro quem deixa a administração (o índice único aceita um só titular ativo), depois quem a recebe.
  update public.context_memberships
     set role = 'membro', can_read = true, can_write = true, can_edit_others = false
   where context_id = p_context and person_id = v_uid;
  update public.context_memberships
     set role = 'titular', can_read = true, can_write = true, can_edit_others = true
   where context_id = p_context and person_id = p_person;
  update public.financial_contexts set owner_person_id = p_person where id = p_context;

  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id, target_id)
  values (v_uid, p_key, 'transferir_administracao_negocio', p_context, v_hash, null, null, p_person);

  return jsonb_build_object('context_id', p_context, 'person_id', p_person, 'role', 'titular');
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. Sociedade (D-123). Só quem administra, com o Plus aberto. p_partnership nulo limpa. Recusas, em ordem: nao_autenticado; chave;
-- repetição; nao_encontrado; contexto_invalido; sem_permissao; plus_indisponivel; assinatura_necessaria (no gatilho).
-- Retorno: {context: {id, name, created_at, ended_at, business_profile, business_partnership}}.
-- ---------------------------------------------------------------------------
create or replace function public.set_business_partnership(p_context uuid, p_partnership boolean, p_key text)
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
  v_hash := md5(jsonb_build_array('definir_sociedade_negocio', p_context, p_partnership)::text);
  perform pg_advisory_xact_lock(hashtext('op:' || v_uid::text || ':' || p_key));

  select * into v_op from public.record_operations where actor_id = v_uid and idempotency_key = p_key;
  if found then
    if v_op.action <> 'definir_sociedade_negocio' or v_op.request_hash <> v_hash then
      raise exception 'chave_reutilizada' using errcode = 'PT409';
    end if;
    if not public.context_permission(v_op.context_id, 'read') then
      raise exception 'nao_encontrado' using errcode = 'P0002';
    end if;
    return jsonb_build_object('context', public.clarevo_business_json(v_op.context_id));
  end if;

  perform pg_advisory_xact_lock(hashtext('familia:c:' || coalesce(p_context::text, '')));
  perform public.clarevo_require_business_owner(p_context);
  if not public.clarevo_plus_allows(v_uid) then
    raise exception 'plus_indisponivel' using errcode = 'PT402';
  end if;

  update public.financial_contexts set business_partnership = p_partnership where id = p_context;

  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id, target_id)
  values (v_uid, p_key, 'definir_sociedade_negocio', p_context, v_hash, null, null, p_context);

  return jsonb_build_object('context', public.clarevo_business_json(p_context));
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. Os negócios que a pessoa acompanha como Contabilidade (só leitura), por nome: [{id, name, business_profile, admin_name, since}].
-- admin_name é o primeiro nome de quem administra ("Pessoa do negócio" sem nome); since, quando a pessoa entrou. Só negócios ativos.
-- ---------------------------------------------------------------------------
create or replace function public.my_accounting_businesses()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'business_profile', c.business_profile,
                                        'admin_name', public.clarevo_business_person_label(c.owner_person_id),
                                        'since', m.created_at)
                     order by c.name, c.id)
      from public.context_memberships m
      join public.financial_contexts c on c.id = m.context_id
     where m.person_id = v_uid and m.revoked_at is null and m.accountant
       and c.kind = 'negocio' and c.ended_at is null), '[]'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- 10. Encerrar o negócio: o corpo da 0043, e a Contabilidade não impede (negocio_com_membros só com pessoas que anotam ou só veem);
-- encerrar tira o acesso de todas as pessoas, a Contabilidade junto, e cancela os convites pendentes.
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
              where context_id = p_context and revoked_at is null and person_id <> v_uid and not accountant) then
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
-- 10a. Sair e remover: os corpos da 0043, e os convites pendentes que a pessoa criou são cancelados (como F8 da Família). Antes da
-- 0046 só quem administra convidava, e quem administra nunca sai; com passar a administração, quem convidou pode sair ou ser
-- removida depois, e o convite dela não continua valendo em nome de quem já não está no negócio.
-- ---------------------------------------------------------------------------
create or replace function public.clarevo_cancel_business_invites_of(p_context uuid, p_person uuid)
returns void
language sql
volatile
security definer
set search_path = public
as $$
  update public.business_invites
     set cancelled_at = now()
   where context_id = p_context and created_by = p_person and used_at is null and cancelled_at is null;
$$;

-- Sair do negócio: o corpo da 0043, com o cancelamento dos convites de quem sai.
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
  perform public.clarevo_cancel_business_invites_of(p_context, v_uid);

  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id, target_id)
  values (v_uid, p_key, 'sair_negocio', p_context, v_hash, null, null, p_context);

  return jsonb_build_object('context_id', p_context, 'left', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Remover uma pessoa: o corpo da 0043, e os convites pendentes que ela criou são cancelados. Só quem administra, nunca sobre si. O
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
  perform public.clarevo_cancel_business_invites_of(p_context, p_person);

  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id, target_id)
  values (v_uid, p_key, 'remover_membro_negocio', p_context, v_hash, null, null, p_person);

  return jsonb_build_object('context_id', p_context, 'person_id', p_person, 'removed', true);
end;
$$;


-- ---------------------------------------------------------------------------
-- 11. Exclusão da conta: o corpo da 0043 (clarevo_erase_person), e a Contabilidade não impede: quem administra com só a Contabilidade
-- exclui a conta (o negócio é apagado como hoje e a Contabilidade perde o acesso junto); com outras pessoas que anotam ou só veem,
-- negocio_com_membros (passa a administração ou remove as pessoas antes).
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
  -- D-123: quem administra um negócio com outras pessoas ativas (sem contar a Contabilidade) passa a administração ou remove as
  -- pessoas antes.
  for v_ctx in select c.id from public.financial_contexts c
                where c.id = any (v_owned) and c.kind = 'negocio' and c.ended_at is null loop
    if exists (select 1 from public.context_memberships m
                where m.context_id = v_ctx and m.revoked_at is null and m.person_id <> p_person
                  and not m.accountant) then
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
-- 12. Operações: a lista vigente (0045) mais as duas novas, as duas com o alvo em target_id: a pessoa que passa a administrar e o
-- negócio (sociedade).
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
  'alterar_papel_negocio', 'criar_aporte_negocio', 'definir_perfil_negocio',
  'criar_a_receber', 'alterar_a_receber', 'excluir_a_receber', 'receber_a_receber',
  'transferir_administracao_negocio', 'definir_sociedade_negocio'));
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
                 'remover_membro_negocio', 'alterar_papel_negocio', 'definir_perfil_negocio',
                 'criar_a_receber', 'alterar_a_receber', 'excluir_a_receber',
                 'transferir_administracao_negocio', 'definir_sociedade_negocio')
      and target_id is not null and record_id is null and commitment_id is null)
  or (action in ('pagar_fatura', 'desfazer_pagamento_fatura')
      and target_id is not null and record_id is not null and commitment_id is not null)
  or (action in ('criar_retirada_negocio', 'excluir_retirada_negocio', 'mover_lancamento', 'criar_aporte_negocio', 'receber_a_receber')
      and target_id is not null and record_id is not null and commitment_id is null)
  or (action = 'criar_ocorrencia' and commitment_id is not null and target_id is not null and record_id is null)
  or (action in ('decidir_revisao', 'responder_guardar', 'revisar_assinaturas', 'marcar_mes_conferido', 'desmarcar_mes_conferido',
                 'responder_origem_cadastro', 'gerar_codigo_whatsapp', 'ligar_whatsapp', 'desligar_whatsapp',
                 'gerar_codigo_telegram', 'ligar_telegram', 'desligar_telegram', 'aceitar_termos',
                 'definir_plano_investimentos', 'excluir_plano_investimentos')
      and record_id is null and commitment_id is null and target_id is null));

-- ---------------------------------------------------------------------------
-- 13. Atividade (a função da 0044) sem contar as duas ações novas como anotação; e passar a administração vale em só ver e exportar
-- (a lista da 0043 mais transferir_administracao_negocio, como transferir_titularidade_familia). Definir a sociedade passa pela trava.
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
                    'remover_membro_negocio', 'alterar_papel_negocio', 'definir_perfil_negocio',
                    'transferir_administracao_negocio', 'definir_sociedade_negocio') then
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
               'cancelar_convite_negocio', 'transferir_administracao_negocio']::text[];
$$;

-- ---------------------------------------------------------------------------
-- 14. Privilégios: as três funções novas do app só para authenticated; as auxiliares novas e recriadas, para ninguém com sessão; a
-- visão recriada só para leitura (create or replace mantém os privilégios; reafirmados aqui).
-- ---------------------------------------------------------------------------
revoke all on public.business_member_items from anon, authenticated, service_role;
grant select on public.business_member_items to authenticated;

revoke all on function public.clarevo_active_business_count(uuid) from public, anon, authenticated, service_role;
revoke all on function public.clarevo_business_active_count(uuid) from public, anon, authenticated, service_role;
revoke all on function public.clarevo_business_valid_invites(uuid) from public, anon, authenticated, service_role;
revoke all on function public.clarevo_business_accountants(uuid, boolean) from public, anon, authenticated, service_role;
revoke all on function public.clarevo_cancel_business_invites_of(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.clarevo_business_json(uuid) from public, anon, authenticated, service_role;
revoke all on function public.clarevo_erase_person(uuid) from public, anon, authenticated, service_role;
revoke all on function public.clarevo_track_activity() from public, anon, authenticated, service_role;
revoke all on function public.clarevo_write_free_actions() from public, anon, authenticated, service_role;

revoke all on function public.create_business_invite(uuid, text, text) from public, anon;
revoke all on function public.accept_business_invite(text, text) from public, anon;
revoke all on function public.set_business_member_role(uuid, uuid, text, text) from public, anon;
revoke all on function public.end_business(uuid, text) from public, anon;
revoke all on function public.leave_business(uuid, text) from public, anon;
revoke all on function public.remove_business_member(uuid, uuid, text) from public, anon;
revoke all on function public.transfer_business_admin(uuid, uuid, text) from public, anon;
revoke all on function public.set_business_partnership(uuid, boolean, text) from public, anon;
revoke all on function public.my_accounting_businesses() from public, anon;
grant execute on function public.create_business_invite(uuid, text, text) to authenticated;
grant execute on function public.accept_business_invite(text, text) to authenticated;
grant execute on function public.set_business_member_role(uuid, uuid, text, text) to authenticated;
grant execute on function public.end_business(uuid, text) to authenticated;
grant execute on function public.leave_business(uuid, text) to authenticated;
grant execute on function public.remove_business_member(uuid, uuid, text) to authenticated;
grant execute on function public.transfer_business_admin(uuid, uuid, text) to authenticated;
grant execute on function public.set_business_partnership(uuid, boolean, text) to authenticated;
grant execute on function public.my_accounting_businesses() to authenticated;
