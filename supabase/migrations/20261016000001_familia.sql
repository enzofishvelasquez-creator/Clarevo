-- Clarevo · migração 0013 · Família: criar, convidar, aceitar, sair, remover, transferir e encerrar (D-055, Ciclo L).
-- Depois de 20261011000002_importar.sql.
-- Até aqui o contexto Família e o vínculo com papel existiam no modelo, mas só o backend os criava. Esta migração dá à pessoa o
-- caminho completo, pelas recomendações L-1 a L-8 de docs/13_FAMILIA_E_EMPRESAS.md:
--   L-1 aberta a todas as pessoas durante o piloto (nenhuma trava por plano);
--   L-2 até 6 pessoas, contando quem é titular (membros ativos + convites ainda válidos);
--   L-3 uma Família por pessoa, por vez;
--   L-4 em contexto Família, quem tem escrita marca como paga a conta criada por outra pessoa (pay_commitment); desfazer só para
--       quem pagou ou quem tem "editar de outras pessoas"; alterar e excluir seguem a regra de edição; fatura de cartão segue a
--       regra do cartão (pay_invoice não muda); no Pessoal nada muda;
--   L-5 em contexto Família, a renda de referência é da casa: quem tem escrita cria, altera e exclui, qualquer que seja a autoria;
--   L-6 family_member_items: membros ativos e ex-membros com o primeiro nome e a situação, nunca o e-mail;
--   L-7 o titular não sai (titular_nao_sai): passa a titularidade (transfer_family_ownership) ou encerra (end_family);
--   L-8 o convite é um link enviado pelo próprio aparelho; o servidor guarda só o resumo SHA-256 do código.
-- Escrita só por create_family, create_family_invite, cancel_family_invite, accept_family_invite, leave_family,
-- remove_family_member, set_member_role, transfer_family_ownership e end_family (mais preview_family_invite, só leitura): autoria
-- da sessão, chave de idempotência por pessoa (o mesmo espaço das outras operações), hash em JSON (D-021, regra 7) e
-- record_operations. Os parâmetros seguem a especificação do ciclo: nomes p_name, p_context, p_role, p_invite, p_person, p_code e
-- p_key (a chave por último). Ninguém grava family_invites, context_memberships nem financial_contexts direto: a política
-- memberships_manage e o privilégio update (can_read, can_write, can_edit_others, revoked_at) da 0001 são retirados aqui.
--
-- Invariantes:
-- F1. Um contexto Família tem no máximo um titular ativo (índice único parcial) e nunca mais de 6 pessoas ativas.
-- F2. Uma pessoa está em no máximo uma Família ativa (create_family e accept_family_invite conferem sob trava consultiva da pessoa).
-- F3. O convite guarda só code_hash (SHA-256 do código de 128 bits em 32 hexadecimais); o código aparece uma única vez, na
--     resposta de create_family_invite, e nunca é gravado. Vale 7 dias, serve uma única vez (used_at, used_by) e pode ser
--     cancelado (cancelled_at). Convite inválido, usado, cancelado ou vencido responde um único código, convite_invalido,
--     sem revelar qual caso (preview_family_invite e accept_family_invite).
-- F4. Aceitar nunca copia nem mostra o Pessoal de ninguém: só cria o vínculo (membro: ler e anotar; leitor: só ler).
-- F5. Quem sai ou é removido perde o vínculo na hora (revoked_at); o que anotou continua na Família como histórico da casa, e o
--     vínculo revogado aparece como "ex-membro" em family_member_items. Voltar por um novo convite reativa o mesmo vínculo.
-- F6. end_family só vale sem outro membro ativo: revoga o vínculo do titular, cancela os convites e marca ended_at. Os dados ficam
--     guardados, sem leitura por ninguém, até a política de retenção (P-010).
-- F7. Criar a Família cria a primeira conta de origem ("Conta principal"), como o Pessoal; nunca há dados de exemplo.
-- F8. Convite vale para quem o criou enquanto essa pessoa está na Família: ao sair ou ser removida, os convites dela são cancelados.
-- Ordem de travas: chave -> trava consultiva da pessoa (create_family, accept_family_invite) -> trava consultiva da Família
-- -> convite ou vínculo. A atividade (gatilho de record_operations, 0005) não conta nenhuma das nove ações como anotação.

-- ---------------------------------------------------------------------------
-- Contexto encerrado, um titular por Família
-- ---------------------------------------------------------------------------
alter table public.financial_contexts add column ended_at timestamptz;
alter table public.financial_contexts
  add constraint financial_contexts_encerrado check (ended_at is null or kind = 'familia');
comment on column public.financial_contexts.ended_at is
  'Quando a Família foi encerrada (end_family). Os dados ficam guardados, sem leitura por ninguém (todos os vínculos revogados), até a política de retenção (P-010).';

create unique index context_memberships_one_owner on public.context_memberships (context_id)
  where role = 'titular' and revoked_at is null;

-- Ninguém altera vínculos direto: só as funções desta migração.
drop policy memberships_manage on public.context_memberships;

-- ---------------------------------------------------------------------------
-- Convites
-- ---------------------------------------------------------------------------
create table public.family_invites (
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
  constraint family_invites_papel check (role in ('membro', 'leitor')),
  constraint family_invites_hash check (code_hash ~ '^[0-9a-f]{64}$'),
  constraint family_invites_validade check (expires_at > created_at),
  constraint family_invites_uso check (used_by is null or used_at is not null),
  constraint family_invites_estado check (used_at is null or cancelled_at is null)
);
create unique index family_invites_code_hash on public.family_invites (code_hash);
create index family_invites_context on public.family_invites (context_id);
comment on table public.family_invites is
  'Convite para a Família (D-055): papel, validade de 7 dias, uso único e só o resumo SHA-256 do código (nunca o código). Lido só pelo titular; gravado só pelas funções da Família.';
comment on column public.family_invites.code_hash is
  'SHA-256 (64 hexadecimais) do código de 128 bits do link. O código nunca é gravado: aparece uma única vez, na resposta de create_family_invite.';

-- Defesa adicional: identidade, contexto, autoria, papel, resumo e prazos nunca mudam; uso e cancelamento só passam de nulo a valor.
create or replace function public.family_invites_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.id <> old.id or new.context_id <> old.context_id or new.created_by <> old.created_by or new.role <> old.role
     or new.code_hash <> old.code_hash or new.expires_at <> old.expires_at or new.created_at <> old.created_at
     or (old.used_at is not null and (new.used_at is distinct from old.used_at or new.used_by is distinct from old.used_by))
     or (old.cancelled_at is not null and new.cancelled_at is distinct from old.cancelled_at)
     or (old.used_at is null and new.used_by is not null and new.used_at is null) then
    raise exception 'campo_imutavel' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger family_invites_guard
  before update on public.family_invites
  for each row execute function public.family_invites_guard();

alter table public.family_invites enable row level security;
-- Só o titular lê os convites do contexto.
create policy family_invites_read on public.family_invites for select to authenticated
  using (public.context_permission(context_id, 'manage'));

-- ---------------------------------------------------------------------------
-- Operações: lista completa vigente (49 ações das migrações anteriores) mais as 9 da Família. Todas apontam para o alvo em
-- target_id: a Família (criar, sair, encerrar), o convite (criar, cancelar, aceitar) ou a pessoa (remover, papel, titularidade).
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
  'remover_membro_familia', 'alterar_papel_familia', 'transferir_titularidade_familia', 'encerrar_familia'));
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
                 'remover_membro_familia', 'alterar_papel_familia', 'transferir_titularidade_familia', 'encerrar_familia')
      and target_id is not null and record_id is null and commitment_id is null)
  or (action in ('pagar_fatura', 'desfazer_pagamento_fatura')
      and target_id is not null and record_id is not null and commitment_id is not null)
  or (action = 'criar_ocorrencia' and commitment_id is not null and target_id is not null and record_id is null)
  or (action in ('decidir_revisao', 'responder_guardar', 'revisar_assinaturas')
      and record_id is null and commitment_id is null and target_id is null));
-- import_result continua só em importar_extrato (restrição da 0012).

-- ---------------------------------------------------------------------------
-- Atividade: mesma função da 0011, sem contar as nove ações da Família (administrar a Família não é anotar).
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
                    'criar_familia', 'criar_convite_familia', 'cancelar_convite_familia', 'aceitar_convite_familia', 'sair_familia',
                    'remover_membro_familia', 'alterar_papel_familia', 'transferir_titularidade_familia', 'encerrar_familia') then
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
-- Funções auxiliares (sem execute para authenticated)
-- ---------------------------------------------------------------------------

-- O contexto é uma Família.
create or replace function public.clarevo_is_family(p_context uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.financial_contexts c where c.id = p_context and c.kind = 'familia');
$$;

-- Primeiro nome para mostrar a outras pessoas (L-6): a primeira palavra do nome, no máximo 40 caracteres. Um nome que parece
-- e-mail (tem arroba) ou está vazio vira "Pessoa": o e-mail de outra pessoa nunca aparece.
create or replace function public.clarevo_first_name(p_name text)
returns text
language sql
immutable
set search_path = public
as $$
  select case when s.t = '' or position('@' in s.t) > 0 then 'Pessoa' else left(s.t, 40) end
    from (select coalesce((regexp_split_to_array(public.clarevo_trim(p_name), '\s+'))[1], '') as t) s;
$$;

-- Resumo SHA-256 (64 hexadecimais) de um código de convite (32 hexadecimais, sem diferenciar maiúsculas); nulo se o formato não vale.
create or replace function public.clarevo_invite_hash(p_code text)
returns text
language sql
immutable
set search_path = public, extensions
as $$
  select case when lower(public.clarevo_trim(p_code)) ~ '^[0-9a-f]{32}$'
              then encode(sha256(convert_to(lower(public.clarevo_trim(p_code)), 'UTF8')), 'hex') end;
$$;

-- Papel de uma pessoa na Família: titular; membro (lê e anota); leitor (só lê). Nulo se não há vínculo.
create or replace function public.clarevo_member_role(p_context uuid, p_person uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case when m.role = 'titular' then 'titular' when m.can_write then 'membro' else 'leitor' end
    from public.context_memberships m
   where m.context_id = p_context and m.person_id = p_person;
$$;

-- A Família ativa da pessoa (uma só, L-3), ou nulo.
create or replace function public.clarevo_active_family(p_person uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select m.context_id
    from public.context_memberships m
    join public.financial_contexts c on c.id = m.context_id
   where m.person_id = p_person and m.revoked_at is null and c.kind = 'familia' and c.ended_at is null
   order by m.created_at, m.context_id
   limit 1;
$$;

-- Pessoas ativas e convites ainda válidos da Família (L-2: juntos, no máximo 6).
create or replace function public.clarevo_family_active_count(p_context uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer from public.context_memberships m where m.context_id = p_context and m.revoked_at is null;
$$;

create or replace function public.clarevo_family_valid_invites(p_context uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer from public.family_invites i
   where i.context_id = p_context and i.used_at is null and i.cancelled_at is null and i.expires_at > now();
$$;

-- Pedaços de resposta, no formato que o app lê.
create or replace function public.clarevo_family_json(p_context uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('id', c.id, 'name', c.name, 'created_at', c.created_at, 'ended_at', c.ended_at)
    from public.financial_contexts c where c.id = p_context;
$$;

create or replace function public.clarevo_invite_json(p_invite uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('id', i.id, 'context_id', i.context_id, 'role', i.role, 'created_by', i.created_by,
                            'expires_at', i.expires_at, 'used_at', i.used_at, 'cancelled_at', i.cancelled_at,
                            'created_at', i.created_at)
    from public.family_invites i where i.id = p_invite;
$$;

-- Quem chama precisa ler a Família (senão "não encontrado", sem revelar que existe), a Família precisa ser Família, e quem chama
-- precisa ser o titular.
create or replace function public.clarevo_require_family_owner(p_context uuid)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_context is null or not public.context_permission(p_context, 'read') then
    raise exception 'nao_encontrado' using errcode = 'P0002';
  end if;
  if not public.clarevo_is_family(p_context) then
    raise exception 'contexto_invalido' using errcode = '22023';
  end if;
  if not public.context_permission(p_context, 'manage') then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
end;
$$;

-- Cancela os convites ainda válidos que uma pessoa criou na Família (F8).
create or replace function public.clarevo_cancel_invites_of(p_context uuid, p_person uuid)
returns void
language sql
volatile
security definer
set search_path = public
as $$
  update public.family_invites
     set cancelled_at = now()
   where context_id = p_context and created_by = p_person and used_at is null and cancelled_at is null;
$$;

-- ---------------------------------------------------------------------------
-- Membros (L-6): ativos e ex-membros, com o primeiro nome e a situação. Nunca o e-mail nem o nome inteiro. Sem security_invoker e
-- com security_barrier, como as outras visões: o filtro de leitura do contexto é explícito (o ex-membro não é mais visível em persons).
-- role: titular, membro (lê e anota) ou leitor (só lê). status: ativo ou ex-membro.
-- ---------------------------------------------------------------------------
-- O primeiro nome é calculado na própria visão, só com funções internas (a mesma regra de clarevo_first_name): as funções
-- auxiliares da Família não têm execute para authenticated, e uma visão sem security_invoker checa o execute de quem consulta.
create view public.family_member_items with (security_barrier = true) as
select m.context_id,
       m.person_id,
       case when n.t = '' or position('@' in n.t) > 0 then 'Pessoa' else left(n.t, 40) end as first_name,
       case when m.role = 'titular' then 'titular' when m.can_write then 'membro' else 'leitor' end as role,
       case when m.revoked_at is null then 'ativo' else 'ex-membro' end as status,
       (m.person_id = auth.uid()) as is_me,
       m.created_at as joined_at,
       m.revoked_at as left_at
  from public.context_memberships m
  join public.financial_contexts c on c.id = m.context_id and c.kind = 'familia'
  join public.persons p on p.id = m.person_id
  cross join lateral (
    select coalesce((regexp_split_to_array(regexp_replace(coalesce(p.display_name, ''), '^\s+|\s+$', '', 'g'), '\s+'))[1], '') as t
  ) n
 where public.context_permission(m.context_id, 'read');
comment on view public.family_member_items is
  'Membros da Família que quem consulta pode ler: ativos e ex-membros, com o primeiro nome, o papel e a situação. Nunca devolve e-mail nem o nome inteiro de outra pessoa.';

-- ---------------------------------------------------------------------------
-- Criar a Família (L-1, L-3, F7). Quem cria vira titular (ler, anotar e editar de outras pessoas) e a Família nasce com a
-- "Conta principal". Recusas: nome_da_familia_invalido (1 a 60 caracteres), ja_em_familia.
-- Retorno: {context: {id, name, created_at, ended_at}, role: 'titular'}.
-- ---------------------------------------------------------------------------
create or replace function public.create_family(p_name text, p_key text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_name text := public.clarevo_trim(p_name);
  v_hash text;
  v_op public.record_operations%rowtype;
  v_ctx uuid;
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  perform public.clarevo_check_key(p_key);
  v_hash := md5(jsonb_build_array('criar_familia', v_name)::text);
  perform pg_advisory_xact_lock(hashtext('op:' || v_uid::text || ':' || p_key));

  select * into v_op from public.record_operations where actor_id = v_uid and idempotency_key = p_key;
  if found then
    if v_op.action <> 'criar_familia' or v_op.request_hash <> v_hash then
      raise exception 'chave_reutilizada' using errcode = 'PT409';
    end if;
    if not public.context_permission(v_op.context_id, 'read') then
      raise exception 'nao_encontrado' using errcode = 'P0002';
    end if;
    return jsonb_build_object('context', public.clarevo_family_json(v_op.context_id),
                              'role', public.clarevo_member_role(v_op.context_id, v_uid));
  end if;

  -- Quem ainda não tem espaço (primeira entrada) não tem permissão para nada.
  if not exists (select 1 from public.persons where id = v_uid) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if char_length(v_name) not between 1 and 60 then
    raise exception 'nome_da_familia_invalido' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtext('familia:p:' || v_uid::text));
  if public.clarevo_active_family(v_uid) is not null then
    raise exception 'ja_em_familia' using errcode = 'PT409';
  end if;

  insert into public.financial_contexts (kind, name, owner_person_id) values ('familia', v_name, v_uid) returning id into v_ctx;
  insert into public.context_memberships (context_id, person_id, role, can_read, can_write, can_edit_others)
  values (v_ctx, v_uid, 'titular', true, true, true);
  insert into public.financial_accounts (context_id, name, created_by) values (v_ctx, 'Conta principal', v_uid);

  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id, target_id)
  values (v_uid, p_key, 'criar_familia', v_ctx, v_hash, null, null, v_ctx);

  return jsonb_build_object('context', public.clarevo_family_json(v_ctx), 'role', 'titular');
end;
$$;

-- ---------------------------------------------------------------------------
-- Convidar (F3, L-2). Só o titular. Papel 'membro' (lê e anota) ou 'leitor' (só lê). O código de 128 bits (32 hexadecimais) é
-- devolvido uma única vez e nunca gravado: só o SHA-256. Repetir a mesma chave devolve o convite sem o código (code nulo): quem
-- perdeu a resposta cancela esse convite e gera outro.
-- Ordem: sessão; chave; repetição; Família lida (nao_encontrado); contexto_invalido; titular (sem_permissao); papel_invalido;
-- familia_cheia (pessoas ativas + convites válidos já somam 6).
-- Retorno: {invite: {id, context_id, role, created_by, expires_at, used_at, cancelled_at, created_at}, code}.
-- ---------------------------------------------------------------------------
create or replace function public.create_family_invite(p_context uuid, p_role text, p_key text)
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
  v_inv public.family_invites%rowtype;
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  perform public.clarevo_check_key(p_key);
  v_hash := md5(jsonb_build_array('criar_convite_familia', p_context, p_role)::text);
  perform pg_advisory_xact_lock(hashtext('op:' || v_uid::text || ':' || p_key));

  select * into v_op from public.record_operations where actor_id = v_uid and idempotency_key = p_key;
  if found then
    if v_op.action <> 'criar_convite_familia' or v_op.request_hash <> v_hash then
      raise exception 'chave_reutilizada' using errcode = 'PT409';
    end if;
    if not public.context_permission(v_op.context_id, 'read') then
      raise exception 'nao_encontrado' using errcode = 'P0002';
    end if;
    return jsonb_build_object('invite', public.clarevo_invite_json(v_op.target_id), 'code', null);
  end if;

  perform public.clarevo_require_family_owner(p_context);
  if p_role is null or p_role not in ('membro', 'leitor') then
    raise exception 'papel_invalido' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtext('familia:c:' || p_context::text));
  if public.clarevo_family_active_count(p_context) + public.clarevo_family_valid_invites(p_context) >= 6 then
    raise exception 'familia_cheia' using errcode = 'PT409';
  end if;

  v_code := encode(gen_random_bytes(16), 'hex');
  insert into public.family_invites (context_id, created_by, role, code_hash, expires_at)
  values (p_context, v_uid, p_role, encode(sha256(convert_to(v_code, 'UTF8')), 'hex'), now() + interval '7 days')
  returning * into v_inv;

  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id, target_id)
  values (v_uid, p_key, 'criar_convite_familia', p_context, v_hash, null, null, v_inv.id);

  return jsonb_build_object('invite', public.clarevo_invite_json(v_inv.id), 'code', v_code);
end;
$$;

-- ---------------------------------------------------------------------------
-- Cancelar um convite. Só o titular da Família do convite (convite de Família que quem chama não lê: nao_encontrado). Convite já
-- usado: convite_ja_usado; já cancelado ou vencido: segue cancelado, sem erro.
-- Retorno: {invite: {...}}.
-- ---------------------------------------------------------------------------
create or replace function public.cancel_family_invite(p_invite uuid, p_key text)
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
  v_inv public.family_invites%rowtype;
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  perform public.clarevo_check_key(p_key);
  v_hash := md5(jsonb_build_array('cancelar_convite_familia', p_invite)::text);
  perform pg_advisory_xact_lock(hashtext('op:' || v_uid::text || ':' || p_key));

  select * into v_op from public.record_operations where actor_id = v_uid and idempotency_key = p_key;
  if found then
    if v_op.action <> 'cancelar_convite_familia' or v_op.request_hash <> v_hash then
      raise exception 'chave_reutilizada' using errcode = 'PT409';
    end if;
    if not public.context_permission(v_op.context_id, 'read') then
      raise exception 'nao_encontrado' using errcode = 'P0002';
    end if;
    return jsonb_build_object('invite', public.clarevo_invite_json(v_op.target_id));
  end if;

  select context_id into v_ctx from public.family_invites where id = p_invite;
  perform public.clarevo_require_family_owner(v_ctx);
  perform pg_advisory_xact_lock(hashtext('familia:c:' || v_ctx::text));
  select * into v_inv from public.family_invites where id = p_invite for update;
  if v_inv.used_at is not null then
    raise exception 'convite_ja_usado' using errcode = 'PT409';
  end if;
  if v_inv.cancelled_at is null then
    update public.family_invites set cancelled_at = now() where id = v_inv.id;
  end if;

  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id, target_id)
  values (v_uid, p_key, 'cancelar_convite_familia', v_ctx, v_hash, null, null, v_inv.id);

  return jsonb_build_object('invite', public.clarevo_invite_json(v_inv.id));
end;
$$;

-- ---------------------------------------------------------------------------
-- Prévia do convite (só leitura, F3 e F4): antes de aceitar, a pessoa vê o nome da Família, o primeiro nome de quem convidou, o
-- papel e a validade, e mais nada. Convite com formato inválido, que não existe, usado, cancelado ou vencido, ou de Família
-- encerrada responde sempre convite_invalido, sem revelar qual caso. Exige sessão; o papel anônimo não executa.
-- Retorno: {family_name, invited_by, role, expires_at}.
-- ---------------------------------------------------------------------------
create or replace function public.preview_family_invite(p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_hash text := public.clarevo_invite_hash(p_code);
  v_inv public.family_invites%rowtype;
  v_ctx public.financial_contexts%rowtype;
begin
  if auth.uid() is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  if v_hash is not null then
    select * into v_inv from public.family_invites where code_hash = v_hash;
  end if;
  if v_hash is null or v_inv.id is null or v_inv.used_at is not null or v_inv.cancelled_at is not null or v_inv.expires_at <= now() then
    raise exception 'convite_invalido' using errcode = 'P0002';
  end if;
  select * into v_ctx from public.financial_contexts where id = v_inv.context_id;
  if v_ctx.id is null or v_ctx.kind <> 'familia' or v_ctx.ended_at is not null then
    raise exception 'convite_invalido' using errcode = 'P0002';
  end if;
  return jsonb_build_object(
    'family_name', v_ctx.name,
    'invited_by', public.clarevo_first_name((select display_name from public.persons where id = v_inv.created_by)),
    'role', v_inv.role,
    'expires_at', v_inv.expires_at);
end;
$$;

-- Resultado de aceitar: a Família, o papel de quem aceitou e o primeiro nome de quem convidou.
create or replace function public.clarevo_accept_json(p_invite uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
           'context', public.clarevo_family_json(i.context_id),
           'role', public.clarevo_member_role(i.context_id, auth.uid()),
           'invited_by', public.clarevo_first_name((select p.display_name from public.persons p where p.id = i.created_by)))
    from public.family_invites i where i.id = p_invite;
$$;

-- ---------------------------------------------------------------------------
-- Aceitar o convite (F2, F3, F4). Confere tudo de novo sob trava: convite_invalido (o mesmo código de preview_family_invite),
-- ja_em_familia (inclui esta mesma Família) e familia_cheia. Uso único: marca used_at e used_by; cria (ou reativa) o vínculo com o
-- papel do convite (membro: ler e anotar; leitor: só ler). Repetir a mesma chave devolve o mesmo resultado, enquanto o vínculo vale.
-- Retorno: {context: {...}, role, invited_by}.
-- ---------------------------------------------------------------------------
create or replace function public.accept_family_invite(p_code text, p_key text)
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
  v_inv public.family_invites%rowtype;
  v_ctx public.financial_contexts%rowtype;
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  perform public.clarevo_check_key(p_key);
  -- O pedido leva só o resumo do código, nunca o código.
  v_hash := md5(jsonb_build_array('aceitar_convite_familia', v_code_hash)::text);
  perform pg_advisory_xact_lock(hashtext('op:' || v_uid::text || ':' || p_key));

  select * into v_op from public.record_operations where actor_id = v_uid and idempotency_key = p_key;
  if found then
    if v_op.action <> 'aceitar_convite_familia' or v_op.request_hash <> v_hash then
      raise exception 'chave_reutilizada' using errcode = 'PT409';
    end if;
    if not public.context_permission(v_op.context_id, 'read') then
      raise exception 'nao_encontrado' using errcode = 'P0002';
    end if;
    return public.clarevo_accept_json(v_op.target_id);
  end if;

  if v_code_hash is null then
    raise exception 'convite_invalido' using errcode = 'P0002';
  end if;
  select * into v_inv from public.family_invites where code_hash = v_code_hash;
  if not found then
    raise exception 'convite_invalido' using errcode = 'P0002';
  end if;
  -- Quem ainda não tem espaço (primeira entrada) não tem permissão para nada.
  if not exists (select 1 from public.persons where id = v_uid) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtext('familia:p:' || v_uid::text));
  perform pg_advisory_xact_lock(hashtext('familia:c:' || v_inv.context_id::text));
  -- Com as travas, relê o convite e confere de novo (uso único, sob corrida).
  select * into v_inv from public.family_invites where id = v_inv.id for update;
  if v_inv.used_at is not null or v_inv.cancelled_at is not null or v_inv.expires_at <= now() then
    raise exception 'convite_invalido' using errcode = 'P0002';
  end if;
  select * into v_ctx from public.financial_contexts where id = v_inv.context_id;
  if v_ctx.id is null or v_ctx.kind <> 'familia' or v_ctx.ended_at is not null then
    raise exception 'convite_invalido' using errcode = 'P0002';
  end if;
  if public.clarevo_active_family(v_uid) is not null then
    raise exception 'ja_em_familia' using errcode = 'PT409';
  end if;
  if public.clarevo_family_active_count(v_ctx.id) >= 6 then
    raise exception 'familia_cheia' using errcode = 'PT409';
  end if;

  insert into public.context_memberships (context_id, person_id, role, can_read, can_write, can_edit_others)
  values (v_ctx.id, v_uid, 'membro', true, v_inv.role = 'membro', false)
  on conflict (context_id, person_id) do update
    set role = 'membro', can_read = true, can_write = excluded.can_write, can_edit_others = false,
        created_at = now(), revoked_at = null;
  update public.family_invites set used_at = now(), used_by = v_uid where id = v_inv.id;

  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id, target_id)
  values (v_uid, p_key, 'aceitar_convite_familia', v_ctx.id, v_hash, null, null, v_inv.id);

  return public.clarevo_accept_json(v_inv.id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Sair da Família (F5, L-7). Membro ou leitor sai (revoked_at); o titular recebe titular_nao_sai e precisa passar a titularidade
-- ou encerrar. Quem não tem vínculo ativo: nao_encontrado. Os convites que a pessoa criou são cancelados (F8).
-- Repetir a mesma chave devolve o mesmo resultado mesmo depois da saída (a resposta não traz dado nenhum).
-- Retorno: {context_id, left: true}.
-- ---------------------------------------------------------------------------
create or replace function public.leave_family(p_context uuid, p_key text)
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
  v_hash := md5(jsonb_build_array('sair_familia', p_context)::text);
  perform pg_advisory_xact_lock(hashtext('op:' || v_uid::text || ':' || p_key));

  select * into v_op from public.record_operations where actor_id = v_uid and idempotency_key = p_key;
  if found then
    if v_op.action <> 'sair_familia' or v_op.request_hash <> v_hash then
      raise exception 'chave_reutilizada' using errcode = 'PT409';
    end if;
    return jsonb_build_object('context_id', v_op.context_id, 'left', true);
  end if;

  if p_context is null or not public.context_permission(p_context, 'read') then
    raise exception 'nao_encontrado' using errcode = 'P0002';
  end if;
  if not public.clarevo_is_family(p_context) then
    raise exception 'contexto_invalido' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtext('familia:c:' || p_context::text));
  select * into v_m from public.context_memberships where context_id = p_context and person_id = v_uid for update;
  if not found or v_m.revoked_at is not null then
    raise exception 'nao_encontrado' using errcode = 'P0002';
  end if;
  if v_m.role = 'titular' then
    raise exception 'titular_nao_sai' using errcode = 'PT409';
  end if;

  update public.context_memberships set revoked_at = now() where context_id = p_context and person_id = v_uid;
  perform public.clarevo_cancel_invites_of(p_context, v_uid);

  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id, target_id)
  values (v_uid, p_key, 'sair_familia', p_context, v_hash, null, null, p_context);

  return jsonb_build_object('context_id', p_context, 'left', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Remover um membro. Só o titular, nunca sobre si (nao_sobre_si). A pessoa precisa ter vínculo ativo (nao_encontrado).
-- O que ela anotou continua na Família (F5). Retorno: {context_id, person_id, removed: true}.
-- ---------------------------------------------------------------------------
create or replace function public.remove_family_member(p_context uuid, p_person uuid, p_key text)
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
  v_hash := md5(jsonb_build_array('remover_membro_familia', p_context, p_person)::text);
  perform pg_advisory_xact_lock(hashtext('op:' || v_uid::text || ':' || p_key));

  select * into v_op from public.record_operations where actor_id = v_uid and idempotency_key = p_key;
  if found then
    if v_op.action <> 'remover_membro_familia' or v_op.request_hash <> v_hash then
      raise exception 'chave_reutilizada' using errcode = 'PT409';
    end if;
    if not public.context_permission(v_op.context_id, 'read') then
      raise exception 'nao_encontrado' using errcode = 'P0002';
    end if;
    return jsonb_build_object('context_id', v_op.context_id, 'person_id', v_op.target_id, 'removed', true);
  end if;

  perform public.clarevo_require_family_owner(p_context);
  if p_person is null then
    raise exception 'nao_encontrado' using errcode = 'P0002';
  end if;
  if p_person = v_uid then
    raise exception 'nao_sobre_si' using errcode = 'PT409';
  end if;
  perform pg_advisory_xact_lock(hashtext('familia:c:' || p_context::text));
  perform 1 from public.context_memberships
   where context_id = p_context and person_id = p_person and revoked_at is null for update;
  if not found then
    raise exception 'nao_encontrado' using errcode = 'P0002';
  end if;

  update public.context_memberships set revoked_at = now() where context_id = p_context and person_id = p_person;
  perform public.clarevo_cancel_invites_of(p_context, p_person);

  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id, target_id)
  values (v_uid, p_key, 'remover_membro_familia', p_context, v_hash, null, null, p_person);

  return jsonb_build_object('context_id', p_context, 'person_id', p_person, 'removed', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Mudar o papel de um membro. Só o titular, nunca sobre si. 'membro' lê e anota; 'leitor' só lê (papel_invalido para outro valor).
-- Retorno: {context_id, person_id, role}.
-- ---------------------------------------------------------------------------
create or replace function public.set_member_role(p_context uuid, p_person uuid, p_role text, p_key text)
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
  v_hash := md5(jsonb_build_array('alterar_papel_familia', p_context, p_person, p_role)::text);
  perform pg_advisory_xact_lock(hashtext('op:' || v_uid::text || ':' || p_key));

  select * into v_op from public.record_operations where actor_id = v_uid and idempotency_key = p_key;
  if found then
    if v_op.action <> 'alterar_papel_familia' or v_op.request_hash <> v_hash then
      raise exception 'chave_reutilizada' using errcode = 'PT409';
    end if;
    if not public.context_permission(v_op.context_id, 'read') then
      raise exception 'nao_encontrado' using errcode = 'P0002';
    end if;
    return jsonb_build_object('context_id', v_op.context_id, 'person_id', v_op.target_id,
                              'role', public.clarevo_member_role(v_op.context_id, v_op.target_id));
  end if;

  perform public.clarevo_require_family_owner(p_context);
  if p_role is null or p_role not in ('membro', 'leitor') then
    raise exception 'papel_invalido' using errcode = '22023';
  end if;
  if p_person is null then
    raise exception 'nao_encontrado' using errcode = 'P0002';
  end if;
  if p_person = v_uid then
    raise exception 'nao_sobre_si' using errcode = 'PT409';
  end if;
  perform pg_advisory_xact_lock(hashtext('familia:c:' || p_context::text));
  perform 1 from public.context_memberships
   where context_id = p_context and person_id = p_person and revoked_at is null for update;
  if not found then
    raise exception 'nao_encontrado' using errcode = 'P0002';
  end if;

  update public.context_memberships
     set can_read = true, can_write = (p_role = 'membro'), can_edit_others = false
   where context_id = p_context and person_id = p_person;

  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id, target_id)
  values (v_uid, p_key, 'alterar_papel_familia', p_context, v_hash, null, null, p_person);

  return jsonb_build_object('context_id', p_context, 'person_id', p_person, 'role', p_role);
end;
$$;

-- ---------------------------------------------------------------------------
-- Passar a titularidade (L-7). Só o titular, para uma pessoa com vínculo ativo (todas as contas são de maiores de 18, P-002),
-- nunca para si. Quem era titular vira membro (lê e anota); a nova titular lê, anota e edita o que é de outras pessoas. Os convites
-- ainda válidos continuam valendo. Retorno: {context_id, person_id (a nova titular), role: 'titular'}.
-- ---------------------------------------------------------------------------
create or replace function public.transfer_family_ownership(p_context uuid, p_person uuid, p_key text)
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
  v_hash := md5(jsonb_build_array('transferir_titularidade_familia', p_context, p_person)::text);
  perform pg_advisory_xact_lock(hashtext('op:' || v_uid::text || ':' || p_key));

  select * into v_op from public.record_operations where actor_id = v_uid and idempotency_key = p_key;
  if found then
    if v_op.action <> 'transferir_titularidade_familia' or v_op.request_hash <> v_hash then
      raise exception 'chave_reutilizada' using errcode = 'PT409';
    end if;
    if not public.context_permission(v_op.context_id, 'read') then
      raise exception 'nao_encontrado' using errcode = 'P0002';
    end if;
    return jsonb_build_object('context_id', v_op.context_id, 'person_id', v_op.target_id, 'role', 'titular');
  end if;

  perform public.clarevo_require_family_owner(p_context);
  if p_person is null then
    raise exception 'nao_encontrado' using errcode = 'P0002';
  end if;
  if p_person = v_uid then
    raise exception 'nao_sobre_si' using errcode = 'PT409';
  end if;
  perform pg_advisory_xact_lock(hashtext('familia:c:' || p_context::text));
  perform 1 from public.context_memberships
   where context_id = p_context and person_id = p_person and revoked_at is null for update;
  if not found then
    raise exception 'nao_encontrado' using errcode = 'P0002';
  end if;

  -- Primeiro quem deixa a titularidade (o índice único aceita um só titular ativo), depois quem a recebe.
  update public.context_memberships
     set role = 'membro', can_read = true, can_write = true, can_edit_others = false
   where context_id = p_context and person_id = v_uid;
  update public.context_memberships
     set role = 'titular', can_read = true, can_write = true, can_edit_others = true
   where context_id = p_context and person_id = p_person;
  update public.financial_contexts set owner_person_id = p_person where id = p_context;

  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id, target_id)
  values (v_uid, p_key, 'transferir_titularidade_familia', p_context, v_hash, null, null, p_person);

  return jsonb_build_object('context_id', p_context, 'person_id', p_person, 'role', 'titular');
end;
$$;

-- ---------------------------------------------------------------------------
-- Encerrar a Família (F6). Só o titular e só quando não há outro membro ativo (familia_com_membros). Revoga o vínculo do titular,
-- cancela os convites e marca ended_at; os dados ficam guardados, sem leitura por ninguém, até a política de retenção (P-010).
-- Repetir a mesma chave devolve o mesmo resultado mesmo depois do encerramento (a resposta não traz dado nenhum).
-- Retorno: {context_id, ended: true}.
-- ---------------------------------------------------------------------------
create or replace function public.end_family(p_context uuid, p_key text)
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
  v_hash := md5(jsonb_build_array('encerrar_familia', p_context)::text);
  perform pg_advisory_xact_lock(hashtext('op:' || v_uid::text || ':' || p_key));

  select * into v_op from public.record_operations where actor_id = v_uid and idempotency_key = p_key;
  if found then
    if v_op.action <> 'encerrar_familia' or v_op.request_hash <> v_hash then
      raise exception 'chave_reutilizada' using errcode = 'PT409';
    end if;
    return jsonb_build_object('context_id', v_op.context_id, 'ended', true);
  end if;

  perform public.clarevo_require_family_owner(p_context);
  perform pg_advisory_xact_lock(hashtext('familia:c:' || p_context::text));
  if exists (select 1 from public.context_memberships
              where context_id = p_context and revoked_at is null and person_id <> v_uid) then
    raise exception 'familia_com_membros' using errcode = 'PT409';
  end if;

  update public.context_memberships set revoked_at = now() where context_id = p_context and revoked_at is null;
  update public.family_invites set cancelled_at = now()
   where context_id = p_context and used_at is null and cancelled_at is null;
  update public.financial_contexts set ended_at = now() where id = p_context;

  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id, target_id)
  values (v_uid, p_key, 'encerrar_familia', p_context, v_hash, null, null, p_context);

  return jsonb_build_object('context_id', p_context, 'ended', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- L-4: contas a pagar da Família. Quem tem escrita marca como paga a conta criada por outra pessoa; desfazer o pagamento exige,
-- além disso, ser quem pagou ou ter "editar de outras pessoas" (a regra do gasto do pagamento, clarevo_lock_record). Alterar e
-- excluir seguem clarevo_lock_commitment (autoria ou "editar de outras pessoas"). No Pessoal nada muda (só a pessoa escreve).
-- Mesmas assinaturas, hash, repetição, ordem de erros e retorno de pay_commitment (0010) e undo_commitment_payment (0008).
-- ---------------------------------------------------------------------------
create or replace function public.clarevo_lock_commitment_for_payment(p_commitment_id uuid)
returns public.commitments
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_c public.commitments%rowtype;
begin
  select * into v_c from public.commitments where id = p_commitment_id for update;
  if not found or v_c.deleted_at is not null or not public.context_permission(v_c.context_id, 'read') then
    raise exception 'nao_encontrado' using errcode = 'P0002';
  end if;
  if not public.context_permission(v_c.context_id, 'write')
     or (v_c.created_by <> auth.uid() and not public.context_permission(v_c.context_id, 'edit_others')
         and not public.clarevo_is_family(v_c.context_id)) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  return v_c;
end;
$$;

create or replace function public.pay_commitment(
  p_idempotency_key text,
  p_commitment_id uuid,
  p_expected_version integer,
  p_account_id uuid,
  p_amount_cents bigint,
  p_paid_on date,
  p_category text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_category text := nullif(public.clarevo_trim(p_category), '');
  v_hash text;
  v_op public.record_operations%rowtype;
  v_c public.commitments%rowtype;
  v_account_id uuid;
  v_account public.financial_accounts%rowtype;
  v_r public.financial_records%rowtype;
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  perform public.clarevo_check_key(p_idempotency_key);
  v_hash := md5(jsonb_build_array('pagar_compromisso', p_commitment_id, p_expected_version, p_account_id, p_amount_cents,
                                  p_paid_on, v_category)::text);
  perform pg_advisory_xact_lock(hashtext('op:' || v_uid::text || ':' || p_idempotency_key));

  select * into v_op from public.record_operations where actor_id = v_uid and idempotency_key = p_idempotency_key;
  if found then
    if v_op.action <> 'pagar_compromisso' or v_op.request_hash <> v_hash then
      raise exception 'chave_reutilizada' using errcode = 'PT409';
    end if;
    if not public.context_permission(v_op.context_id, 'read') then
      raise exception 'nao_encontrado' using errcode = 'P0002';
    end if;
    return public.clarevo_commitment_result(v_op.commitment_id, v_op.record_id);
  end if;

  v_c := public.clarevo_lock_commitment_for_payment(p_commitment_id);
  -- Pagar a conta de uma fatura sem distribuir a diferença quebraria o saldo anterior: o caminho é pay_invoice.
  if v_c.card_id is not null then
    raise exception 'conta_de_fatura' using errcode = 'PT409';
  end if;
  if p_expected_version is distinct from v_c.version then
    raise exception 'versao_desatualizada' using errcode = 'PT409', detail = 'versao_atual=' || v_c.version;
  end if;
  if v_c.status <> 'aberto' then
    raise exception 'compromisso_quitado' using errcode = 'PT409';
  end if;
  -- Mesmas regras do gasto realizado: valor, categoria, data até hoje (data_futura), conta ativa do contexto.
  -- Sem conta (nulo), vale a principal do contexto (A9); a validação trava a conta com for share (A8).
  v_account_id := coalesce(p_account_id, (select a.id from public.financial_accounts a
                                           where a.context_id = v_c.context_id and a.is_default and a.status = 'ativa' and a.deleted_at is null));
  v_account := public.clarevo_validate_record(v_uid, v_c.context_id, v_account_id, p_amount_cents, p_paid_on, v_c.description, v_category);
  if v_account.currency <> v_c.currency then
    raise exception 'conta_invalida' using errcode = '22023';
  end if;

  insert into public.financial_records
    (context_id, account_id, kind, amount_cents, currency, occurred_on, description, category, created_by, commitment_id)
  values
    (v_c.context_id, v_account.id, 'despesa', p_amount_cents, v_account.currency, p_paid_on, v_c.description, v_category, v_uid, v_c.id)
  returning * into v_r;

  update public.commitments set status = 'quitado', version = version + 1 where id = v_c.id;

  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id)
  values (v_uid, p_idempotency_key, 'pagar_compromisso', v_c.context_id, v_hash, v_r.id, v_c.id);

  return public.clarevo_commitment_result(v_c.id, v_r.id);
end;
$$;

create or replace function public.undo_commitment_payment(
  p_idempotency_key text,
  p_commitment_id uuid,
  p_expected_version integer
)
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
  v_c public.commitments%rowtype;
  v_rid uuid;
  v_r public.financial_records%rowtype;
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  perform public.clarevo_check_key(p_idempotency_key);
  v_hash := md5(jsonb_build_array('desfazer_pagamento', p_commitment_id, p_expected_version)::text);
  perform pg_advisory_xact_lock(hashtext('op:' || v_uid::text || ':' || p_idempotency_key));

  select * into v_op from public.record_operations where actor_id = v_uid and idempotency_key = p_idempotency_key;
  if found then
    if v_op.action <> 'desfazer_pagamento' or v_op.request_hash <> v_hash then
      raise exception 'chave_reutilizada' using errcode = 'PT409';
    end if;
    if not public.context_permission(v_op.context_id, 'read') then
      raise exception 'nao_encontrado' using errcode = 'P0002';
    end if;
    return public.clarevo_commitment_result(v_op.commitment_id, v_op.record_id);
  end if;

  v_c := public.clarevo_lock_commitment_for_payment(p_commitment_id);
  -- Desfazer o pagamento da fatura também desfaz o saldo anterior: o caminho é undo_invoice_payment.
  if v_c.card_id is not null then
    raise exception 'conta_de_fatura' using errcode = 'PT409';
  end if;
  if p_expected_version is distinct from v_c.version then
    raise exception 'versao_desatualizada' using errcode = 'PT409', detail = 'versao_atual=' || v_c.version;
  end if;
  if v_c.status <> 'quitado' then
    raise exception 'compromisso_aberto' using errcode = 'PT409';
  end if;
  select id into v_rid from public.financial_records where commitment_id = v_c.id and deleted_at is null;
  -- Também exige permissão sobre o gasto (autoria ou "editar de outras pessoas").
  v_r := public.clarevo_lock_record(v_rid);

  update public.financial_records
     set deleted_at = now(), deleted_by = v_uid, version = version + 1
   where id = v_r.id
  returning * into v_r;

  update public.commitments set status = 'aberto', version = version + 1 where id = v_c.id;

  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id)
  values (v_uid, p_idempotency_key, 'desfazer_pagamento', v_c.context_id, v_hash, v_r.id, v_c.id);

  -- record = gasto excluído (rastro).
  return public.clarevo_commitment_result(v_c.id, v_r.id);
end;
$$;

-- ---------------------------------------------------------------------------
-- L-5: renda de referência da casa. Em contexto Família, quem tem escrita cria, altera e exclui a referência, qualquer que seja a
-- autoria (set_income_reference e delete_income_reference da 0006 com a exceção; no Pessoal nada muda). Mesmas assinaturas, hash,
-- repetição, ordem de erros e retorno.
-- ---------------------------------------------------------------------------
create or replace function public.set_income_reference(
  p_idempotency_key text,
  p_context_id uuid,
  p_from_month date,
  p_expected_version integer,
  p_amount_cents bigint,
  p_varies boolean
)
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
  v_ref public.income_references%rowtype;
  v_month date;
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  perform public.clarevo_check_key(p_idempotency_key);
  v_hash := md5(jsonb_build_array('definir_renda_referencia', p_context_id, p_from_month, p_expected_version, p_amount_cents,
                                  p_varies)::text);
  perform pg_advisory_xact_lock(hashtext('op:' || v_uid::text || ':' || p_idempotency_key));

  select * into v_op from public.record_operations where actor_id = v_uid and idempotency_key = p_idempotency_key;
  if found then
    if v_op.action <> 'definir_renda_referencia' or v_op.request_hash <> v_hash then
      raise exception 'chave_reutilizada' using errcode = 'PT409';
    end if;
    if not public.context_permission(v_op.context_id, 'read') then
      raise exception 'nao_encontrado' using errcode = 'P0002';
    end if;
    return (select to_jsonb(r) from public.income_references r where r.id = v_op.target_id);
  end if;

  if not public.context_permission(p_context_id, 'write') then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if p_from_month is null or extract(day from p_from_month) <> 1 then
    raise exception 'mes_invalido' using errcode = '22023';
  end if;

  -- A referência do mês pode ainda não existir: a trava consultiva serializa a criação; depois, a linha.
  perform pg_advisory_xact_lock(hashtext('renda:' || p_context_id::text || ':' || to_char(p_from_month, 'YYYY-MM-DD')));
  select * into v_ref from public.income_references
   where context_id = p_context_id and from_month = p_from_month and deleted_at is null
   for update;
  -- Versão ausente (NULL) também é recusada.
  if p_expected_version is distinct from coalesce(v_ref.version, 0) then
    raise exception 'versao_desatualizada' using errcode = 'PT409', detail = 'versao_atual=' || coalesce(v_ref.version, 0);
  end if;
  -- L-5: na Família a renda de referência é da casa; quem tem escrita altera, qualquer que seja a autoria.
  if v_ref.id is not null and v_ref.created_by <> v_uid and not public.context_permission(p_context_id, 'edit_others')
     and not public.clarevo_is_family(p_context_id) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;

  v_month := date_trunc('month', public.clarevo_today(v_uid)::timestamp)::date;
  if p_from_month < (v_month - interval '24 months')::date or p_from_month > (v_month + interval '12 months')::date then
    raise exception 'referencia_fora_do_intervalo' using errcode = '22023';
  end if;
  if p_amount_cents is null or p_amount_cents < 1 then
    raise exception 'valor_invalido' using errcode = '22023';
  end if;
  if p_amount_cents > 999999999 then
    raise exception 'valor_acima_do_limite' using errcode = '22023';
  end if;
  if p_varies is null then
    raise exception 'tipo_invalido' using errcode = '22023';
  end if;

  if v_ref.id is null then
    insert into public.income_references (context_id, from_month, amount_cents, varies, created_by)
    values (p_context_id, p_from_month, p_amount_cents, p_varies, v_uid)
    returning * into v_ref;
  else
    update public.income_references
       set amount_cents = p_amount_cents, varies = p_varies, version = version + 1,
           -- Só mudar o valor marca o instante (a guarda também garante).
           amount_changed_at = case when p_amount_cents <> amount_cents then now() else amount_changed_at end
     where id = v_ref.id
    returning * into v_ref;
  end if;

  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id, target_id)
  values (v_uid, p_idempotency_key, 'definir_renda_referencia', p_context_id, v_hash, null, null, v_ref.id);

  return to_jsonb(v_ref);
end;
$$;

-- Excluir uma referência (exclusão lógica, com versão). A anterior volta a valer; sem nenhuma, só valores em reais.
-- Sem revelar se existe para quem não pode ler (nao_encontrado); escrita e autoria como em clarevo_lock_commitment.
create or replace function public.delete_income_reference(
  p_idempotency_key text,
  p_id uuid,
  p_expected_version integer
)
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
  v_from date;
  v_ref public.income_references%rowtype;
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  perform public.clarevo_check_key(p_idempotency_key);
  v_hash := md5(jsonb_build_array('excluir_renda_referencia', p_id, p_expected_version)::text);
  perform pg_advisory_xact_lock(hashtext('op:' || v_uid::text || ':' || p_idempotency_key));

  select * into v_op from public.record_operations where actor_id = v_uid and idempotency_key = p_idempotency_key;
  if found then
    if v_op.action <> 'excluir_renda_referencia' or v_op.request_hash <> v_hash then
      raise exception 'chave_reutilizada' using errcode = 'PT409';
    end if;
    if not public.context_permission(v_op.context_id, 'read') then
      raise exception 'nao_encontrado' using errcode = 'P0002';
    end if;
    return (select to_jsonb(r) from public.income_references r where r.id = v_op.target_id);
  end if;

  -- Contexto e mês são imutáveis: ler sem trava é seguro. Mesma ordem de set_income_reference: (contexto, mês), linha.
  select context_id, from_month into v_ctx, v_from from public.income_references where id = p_id;
  if v_ctx is not null then
    perform pg_advisory_xact_lock(hashtext('renda:' || v_ctx::text || ':' || to_char(v_from, 'YYYY-MM-DD')));
  end if;
  select * into v_ref from public.income_references where id = p_id for update;
  if not found or v_ref.deleted_at is not null or not public.context_permission(v_ref.context_id, 'read') then
    raise exception 'nao_encontrado' using errcode = 'P0002';
  end if;
  -- L-5: na Família a renda de referência é da casa; quem tem escrita exclui, qualquer que seja a autoria.
  if not public.context_permission(v_ref.context_id, 'write')
     or (v_ref.created_by <> v_uid and not public.context_permission(v_ref.context_id, 'edit_others')
         and not public.clarevo_is_family(v_ref.context_id)) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if p_expected_version is distinct from v_ref.version then
    raise exception 'versao_desatualizada' using errcode = 'PT409', detail = 'versao_atual=' || v_ref.version;
  end if;

  update public.income_references
     set deleted_at = now(), deleted_by = v_uid, version = version + 1
   where id = v_ref.id
  returning * into v_ref;

  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id, target_id)
  values (v_uid, p_idempotency_key, 'excluir_renda_referencia', v_ref.context_id, v_hash, null, null, v_ref.id);

  return to_jsonb(v_ref);
end;
$$;

-- ---------------------------------------------------------------------------
-- Leitura (RLS) e privilégios. Nenhuma tabela ganha escrita direta; o privilégio update de context_memberships (0001) é retirado:
-- o bloco inteiro da 0012 (idempotente) sem ele, com as nove funções da Família, a prévia do convite e a visão dos membros.
-- Os convites têm leitura por coluna: o resumo do código (code_hash) não é lido nem pelo titular.
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;

grant usage on schema public to authenticated;
grant select on all tables in schema public to authenticated;
grant update (display_name, locale) on public.persons to authenticated;
grant update (name) on public.financial_accounts to authenticated;
-- Empresa: convida (e-mail), encerra e apaga convites não aceitos. Beneficiário e ativação são definidos no aceite.
grant insert (contract_id, invited_email) on public.licenses to authenticated;
grant update (status, ended_at) on public.licenses to authenticated;
grant delete on public.licenses to authenticated;

grant execute on function public.ensure_personal_space(text, text) to authenticated;
grant execute on function public.create_record(text, uuid, uuid, public.record_kind, bigint, date, text, text, text) to authenticated;
grant execute on function public.update_record(text, uuid, integer, uuid, bigint, date, text, text) to authenticated;
grant execute on function public.delete_record(text, uuid, integer) to authenticated;
grant execute on function public.month_totals(uuid, date) to authenticated;
-- Usadas pelas políticas e pelas visões (avaliadas com os privilégios de quem consulta).
grant execute on function public.context_permission(uuid, text) to authenticated;
grant execute on function public.is_org_admin(uuid) to authenticated;

grant execute on function public.create_commitment(text, uuid, bigint, date, text, text) to authenticated;
grant execute on function public.update_commitment(text, uuid, integer, bigint, date, text, text, boolean) to authenticated;
grant execute on function public.delete_commitment(text, uuid, integer) to authenticated;
grant execute on function public.pay_commitment(text, uuid, integer, uuid, bigint, date, text) to authenticated;
grant execute on function public.undo_commitment_payment(text, uuid, integer) to authenticated;
grant execute on function public.month_to_pay(uuid, date) to authenticated;

grant execute on function public.create_series(text, uuid, text, text, text, text, bigint, text, integer, date, integer, integer, date, integer) to authenticated;
grant execute on function public.update_series_from(text, uuid, integer, integer, jsonb, text, text, text, bigint, text, integer) to authenticated;
grant execute on function public.end_series(text, uuid, integer, integer, jsonb) to authenticated;
grant execute on function public.delete_series(text, uuid, integer, jsonb) to authenticated;
grant execute on function public.sync_series_occurrences(uuid) to authenticated;
grant execute on function public.inform_series_year(text, uuid, integer, jsonb, bigint) to authenticated;
grant execute on function public.skip_series_year(text, uuid, integer, jsonb) to authenticated;

grant execute on function public.create_series_occurrence(text, uuid, integer, integer, text) to authenticated;
grant execute on function public.decide_return_review(text, uuid, integer, date, text) to authenticated;
grant execute on function public.months_overview(uuid, date, date) to authenticated;

grant execute on function public.set_income_reference(text, uuid, date, integer, bigint, boolean) to authenticated;
grant execute on function public.delete_income_reference(text, uuid, integer) to authenticated;
grant execute on function public.month_committed(uuid, date) to authenticated;

grant execute on function public.create_goal(text, uuid, text, text, bigint, date, bigint, bigint, integer, text, bigint, date) to authenticated;
grant execute on function public.update_goal(text, uuid, integer, text, text, bigint, date, bigint, bigint, integer, text) to authenticated;
grant execute on function public.set_goal_status(text, uuid, integer, text) to authenticated;
grant execute on function public.delete_goal(text, uuid, integer) to authenticated;
grant execute on function public.add_goal_movement(text, uuid, text, bigint, date, text, uuid) to authenticated;
grant execute on function public.update_goal_movement(text, uuid, integer, bigint, date, text, uuid) to authenticated;
grant execute on function public.delete_goal_movement(text, uuid, integer) to authenticated;
grant execute on function public.set_savings_answer(text, uuid, integer, text, bigint) to authenticated;

-- Funções de data das visões de cartão (puras).
grant execute on function public.my_today() to authenticated;
grant execute on function public.invoice_due_on(integer, date) to authenticated;
grant execute on function public.invoice_closing_on(integer, integer, date) to authenticated;
grant execute on function public.invoice_month_for(integer, integer, date) to authenticated;

grant execute on function public.create_card(text, uuid, text, text, integer, integer, bigint) to authenticated;
grant execute on function public.update_card(text, uuid, integer, text, text, integer, integer, bigint) to authenticated;
grant execute on function public.set_card_status(text, uuid, integer, text) to authenticated;
grant execute on function public.delete_card(text, uuid, integer) to authenticated;
grant execute on function public.add_card_purchase(text, uuid, date, bigint, integer, text, text, text) to authenticated;
grant execute on function public.update_card_entry(text, uuid, integer, text, bigint, date, text, text, integer, date, text) to authenticated;
grant execute on function public.delete_card_entry(text, uuid, integer) to authenticated;
grant execute on function public.add_card_charge(text, uuid, date, text, bigint) to authenticated;
grant execute on function public.add_card_refund(text, uuid, date, bigint, text, text) to authenticated;
grant execute on function public.pay_invoice(text, uuid, date, integer, bigint, date, uuid) to authenticated;
grant execute on function public.undo_invoice_payment(text, uuid, date, integer) to authenticated;

grant execute on function public.set_category_budget(text, uuid, text, date, integer, bigint) to authenticated;
grant execute on function public.delete_category_budget(text, uuid, integer) to authenticated;
grant execute on function public.month_budget(uuid, date) to authenticated;
grant execute on function public.set_commitment_limit(text, uuid, date, integer, integer) to authenticated;
grant execute on function public.delete_commitment_limit(text, uuid, integer) to authenticated;

grant execute on function public.create_account(text, uuid, text, text) to authenticated;
grant execute on function public.update_account(text, uuid, integer, text, text) to authenticated;
grant execute on function public.set_default_account(text, uuid, integer) to authenticated;
grant execute on function public.set_account_status(text, uuid, integer, text, uuid) to authenticated;
grant execute on function public.delete_account(text, uuid, integer) to authenticated;

grant execute on function public.set_series_subscription(text, uuid, integer, boolean) to authenticated;
grant execute on function public.mark_subscriptions_reviewed(text, uuid) to authenticated;

grant execute on function public.import_records(text, uuid, text, uuid, jsonb) to authenticated;

grant execute on function public.create_family(text, text) to authenticated;
grant execute on function public.create_family_invite(uuid, text, text) to authenticated;
grant execute on function public.cancel_family_invite(uuid, text) to authenticated;
grant execute on function public.preview_family_invite(text) to authenticated;
grant execute on function public.accept_family_invite(text, text) to authenticated;
grant execute on function public.leave_family(uuid, text) to authenticated;
grant execute on function public.remove_family_member(uuid, uuid, text) to authenticated;
grant execute on function public.set_member_role(uuid, uuid, text, text) to authenticated;
grant execute on function public.transfer_family_ownership(uuid, uuid, text) to authenticated;
grant execute on function public.end_family(uuid, text) to authenticated;

revoke select on public.family_invites from authenticated;
grant select (id, context_id, created_by, role, expires_at, used_at, used_by, cancelled_at, created_at)
  on public.family_invites to authenticated;
