-- Prioridade das metas (D-093, 11/11/2026; 0031).
--
-- 1. goals.priority: a ordem que a pessoa escolhe para as metas ativas ("a mais importante em primeiro"). Nula = sem ordem escolhida
--    (a meta vem depois das ordenadas, pela data de criação). Só set_goal_order grava, e sem subir a versão da meta: trocar a ordem
--    não pode recusar a edição que outra pessoa da Família estiver fazendo na mesma meta (goals_guard aceita a troca só da prioridade).
-- 2. set_goal_order(chave, contexto, metas): recebe a lista completa das metas ativas do contexto, fora a reserva para imprevistos, na
--    ordem nova; recusa a lista que não for exatamente essa ('lista_invalida'). Escrita no contexto ('write'). Operação 'ordenar_metas',
--    com o contexto como alvo; não conta como atividade (não é anotação).
-- 3. goal_items ganha a coluna priority no fim (a visão é recriada com as mesmas colunas e a nova).

alter table public.goals add column priority integer check (priority is null or priority between 1 and 1000);

-- Podem mudar: tipo, nome, alvo, prazo, plano, base da reserva, situação, version (+1), updated_at e a exclusão. A prioridade muda
-- sozinha, sem subir a versão e sem mexer em updated_at (D-093).
create or replace function public.goals_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.priority is distinct from old.priority and (to_jsonb(new) - 'priority') = (to_jsonb(old) - 'priority') then
    return new;
  end if;
  if new.id <> old.id or new.context_id <> old.context_id or new.created_by <> old.created_by
     or new.created_at <> old.created_at or old.deleted_at is not null or new.version <> old.version + 1 then
    raise exception 'campo_imutavel' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Operações: a lista vigente (a da 0024, aceite) mais 'ordenar_metas', com o contexto como alvo.
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
  'ordenar_metas'));
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
                 'imagem_meta', 'ordenar_metas')
      and target_id is not null and record_id is null and commitment_id is null)
  or (action in ('pagar_fatura', 'desfazer_pagamento_fatura')
      and target_id is not null and record_id is not null and commitment_id is not null)
  or (action = 'criar_ocorrencia' and commitment_id is not null and target_id is not null and record_id is null)
  or (action in ('decidir_revisao', 'responder_guardar', 'revisar_assinaturas', 'marcar_mes_conferido', 'desmarcar_mes_conferido',
                 'responder_origem_cadastro', 'gerar_codigo_whatsapp', 'ligar_whatsapp', 'desligar_whatsapp',
                 'gerar_codigo_telegram', 'ligar_telegram', 'desligar_telegram', 'aceitar_termos')
      and record_id is null and commitment_id is null and target_id is null));

-- Atividade: a função da 0024 (aceite), sem contar também 'ordenar_metas' (trocar a ordem não é anotação).
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
-- set_goal_order: a ordem das metas ativas do contexto (sem a reserva). Devolve {"context_id", "ids"} na ordem gravada.
-- ---------------------------------------------------------------------------
create or replace function public.set_goal_order(p_key text, p_context_id uuid, p_goal_ids uuid[])
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
  v_expected uuid[];
  i integer;
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  perform public.clarevo_check_key(p_key);
  v_hash := md5(jsonb_build_array('ordenar_metas', p_context_id, to_jsonb(coalesce(p_goal_ids, '{}'::uuid[])))::text);
  perform pg_advisory_xact_lock(hashtext('op:' || v_uid::text || ':' || p_key));

  select * into v_op from public.record_operations where actor_id = v_uid and idempotency_key = p_key;
  if found then
    if v_op.action <> 'ordenar_metas' or v_op.request_hash <> v_hash then
      raise exception 'chave_reutilizada' using errcode = 'PT409';
    end if;
    if not public.context_permission(v_op.context_id, 'read') then
      raise exception 'nao_encontrado' using errcode = 'P0002';
    end if;
    return jsonb_build_object('context_id', v_op.context_id, 'ids', to_jsonb(p_goal_ids));
  end if;

  if p_context_id is null or not public.context_permission(p_context_id, 'read') then
    raise exception 'nao_encontrado' using errcode = 'P0002';
  end if;
  if not public.context_permission(p_context_id, 'write') then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;

  -- Uma ordem por vez em cada contexto; as metas ativas do contexto, travadas.
  perform pg_advisory_xact_lock(hashtext('ordenar_metas:' || p_context_id::text));
  select coalesce(array_agg(g.id order by g.id), '{}'::uuid[]) into v_expected
    from (select id from public.goals
           where context_id = p_context_id and deleted_at is null and status = 'ativa' and goal_type <> 'emergencia'
           for update) g;
  if p_goal_ids is null or cardinality(p_goal_ids) = 0 or cardinality(p_goal_ids) > 1000
     or cardinality(p_goal_ids) <> cardinality(v_expected)
     or (select count(distinct x) from unnest(p_goal_ids) x) <> cardinality(p_goal_ids)
     or (select array_agg(x order by x) from unnest(p_goal_ids) x) <> v_expected then
    raise exception 'lista_invalida' using errcode = '22023';
  end if;

  for i in 1 .. cardinality(p_goal_ids) loop
    update public.goals set priority = i where id = p_goal_ids[i] and priority is distinct from i;
  end loop;

  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id, target_id)
  values (v_uid, p_key, 'ordenar_metas', p_context_id, v_hash, null, null, p_context_id);

  return jsonb_build_object('context_id', p_context_id, 'ids', to_jsonb(p_goal_ids));
end;
$$;

-- goal_items com a prioridade (a mesma visão da 0007, mais a coluna no fim).
create or replace view public.goal_items with (security_invoker = true) as
select g.id, g.context_id, g.goal_type, g.name, g.target_cents, g.target_month, g.planned_monthly_cents,
       g.essential_base_cents, g.essential_months, g.essential_base_source, g.status, g.created_by, g.version,
       g.created_at, g.updated_at,
       (a.initial + a.deposits + a.income + a.appreciation - a.withdrawals - a.depreciation) as saved_cents,
       a.initial as initial_cents, a.deposits as deposits_cents, a.withdrawals as withdrawals_cents,
       a.income as income_cents, a.appreciation as appreciation_cents, a.depreciation as depreciation_cents,
       a.last_on as last_movement_on,
       g.priority
  from public.goals g
  cross join lateral (
    select coalesce(sum(m.amount_cents) filter (where m.kind = 'saldo_inicial'), 0)::bigint as initial,
           coalesce(sum(m.amount_cents) filter (where m.kind = 'aporte'), 0)::bigint as deposits,
           coalesce(sum(m.amount_cents) filter (where m.kind = 'resgate'), 0)::bigint as withdrawals,
           coalesce(sum(m.amount_cents) filter (where m.kind = 'rendimento'), 0)::bigint as income,
           coalesce(sum(m.amount_cents) filter (where m.kind = 'valorizacao'), 0)::bigint as appreciation,
           coalesce(sum(m.amount_cents) filter (where m.kind = 'desvalorizacao'), 0)::bigint as depreciation,
           max(m.occurred_on) as last_on
      from public.goal_movements m
     where m.goal_id = g.id and m.deleted_at is null) a
 where g.deleted_at is null;

-- Privilégios: só a função nova para o app.
revoke all on function public.set_goal_order(text, uuid, uuid[]) from public, anon;
grant execute on function public.set_goal_order(text, uuid, uuid[]) to authenticated;
grant select on public.goal_items to authenticated;
