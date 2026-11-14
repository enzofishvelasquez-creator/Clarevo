-- Plano de aportes dos investimentos e investimento ligado à reserva ou a uma meta (D-099, P2; 14/11/2026; 0036).
-- docs/49_ESTUDO_INVESTIMENTOS.md, itens 12 e 13 (fase 1). Nada aqui recomenda investimento nem muda o valor de uma meta.
--
-- P1. O plano de aportes é um valor por mês, opcional, só no Pessoal ('contexto_invalido' na Família): uma linha por contexto em
--     investment_plans, gravada por set_investment_plan (sem valor, a linha sai). É intenção, não cobrança: o app mostra o aportado do
--     mês ao lado do plano, sem cor de alerta e sem sequência de dias.
-- P2. Toda escrita grava a operação ('definir_plano_investimentos' ou 'excluir_plano_investimentos') e conta como anotação.
-- M1. Um investimento pode estar ligado a uma meta do mesmo contexto (a reserva para imprevistos é uma meta): investments.goal_id, com a
--     chave (goal_id, context_id) apontando para goals (id, context_id). Excluir a meta de vez tira a ligação; meta excluída (marca) ou
--     arquivada não pode ser escolhida ('meta_invalida'). Só informação: a meta continua com o valor que a pessoa registrou nela.
-- M2. A ligação viaja na ficha ("goal_id" no p_details de create_investment e update_investment, que mudam só por dentro, com a mesma
--     assinatura). Sem a ficha (versão antiga do app), a ligação fica, se a meta continuar valendo.

-- ---------------------------------------------------------------------------
-- Plano de aportes
-- ---------------------------------------------------------------------------

create table public.investment_plans (
  context_id uuid primary key references public.financial_contexts (id) on delete cascade,
  planned_monthly_cents bigint not null check (planned_monthly_cents between 1 and 999999999),
  version integer not null default 1 check (version >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.investment_plans is 'Plano de aportes por mês nos investimentos, opcional, só no Pessoal (D-099, P1).';
alter table public.investment_plans enable row level security;
create policy investment_plans_read on public.investment_plans for select to authenticated
  using (public.context_permission(context_id, 'read'));

create or replace function public.investment_plans_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.context_id <> old.context_id or new.created_at <> old.created_at or new.version <> old.version + 1 then
    raise exception 'campo_imutavel' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger investment_plans_guard before update on public.investment_plans for each row execute function public.investment_plans_guard();

-- O plano (ou null sem plano), para o retorno da função.
create or replace function public.clarevo_investment_plan_result(p_context_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('plan', (select to_jsonb(x) from public.investment_plans x where x.context_id = p_context_id));
$$;

create or replace function public.set_investment_plan(p_key text, p_context_id uuid, p_planned_cents bigint default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_action text := case when p_planned_cents is null then 'excluir_plano_investimentos' else 'definir_plano_investimentos' end;
  v_hash text;
  v_op public.record_operations%rowtype;
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  perform public.clarevo_check_key(p_key);
  v_hash := md5(jsonb_build_array(v_action, p_context_id, p_planned_cents)::text);
  perform pg_advisory_xact_lock(hashtext('op:' || v_uid::text || ':' || p_key));
  select * into v_op from public.record_operations where actor_id = v_uid and idempotency_key = p_key;
  if found then
    if v_op.action <> v_action or v_op.request_hash <> v_hash then
      raise exception 'chave_reutilizada' using errcode = 'PT409';
    end if;
    if not public.context_permission(v_op.context_id, 'read') then
      raise exception 'nao_encontrado' using errcode = 'P0002';
    end if;
    return public.clarevo_investment_plan_result(v_op.context_id);
  end if;

  if p_context_id is null or not public.context_permission(p_context_id, 'read') then
    raise exception 'nao_encontrado' using errcode = 'P0002';
  end if;
  if not public.context_permission(p_context_id, 'write') then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if not exists (select 1 from public.financial_contexts c where c.id = p_context_id and c.kind = 'pessoal') then
    raise exception 'contexto_invalido' using errcode = '22023';
  end if;
  if p_planned_cents is not null and (p_planned_cents < 1 or p_planned_cents > 999999999) then
    raise exception 'valor_invalido' using errcode = '22023';
  end if;

  if p_planned_cents is null then
    delete from public.investment_plans where context_id = p_context_id;
  else
    insert into public.investment_plans as p (context_id, planned_monthly_cents) values (p_context_id, p_planned_cents)
    on conflict (context_id) do update set planned_monthly_cents = excluded.planned_monthly_cents, version = p.version + 1;
  end if;
  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id, target_id)
  values (v_uid, p_key, v_action, p_context_id, v_hash, null, null, null);
  return public.clarevo_investment_plan_result(p_context_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Investimento ligado a uma meta (M1, M2)
-- ---------------------------------------------------------------------------

alter table public.investments add column goal_id uuid;
alter table public.investments add constraint investments_goal_fk foreign key (goal_id, context_id)
  references public.goals (id, context_id) on delete set null (goal_id);
create index investments_goal_id_context_id_fk_idx on public.investments (goal_id, context_id);

-- O guarda aceita a única mudança sem versão nova: a meta saiu de vez (exclusão da conta ou limpeza dos excluídos) e a chave estrangeira
-- tira a ligação (on delete set null). Qualquer outra mudança segue pedindo a versão seguinte.
create or replace function public.investments_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.version = old.version and old.goal_id is not null and new.goal_id is null
     and (to_jsonb(new) - 'goal_id') = (to_jsonb(old) - 'goal_id') then
    return new;
  end if;
  if new.id <> old.id or new.context_id <> old.context_id or new.created_by <> old.created_by
     or new.created_at <> old.created_at or new.version <> old.version + 1 then
    raise exception 'campo_imutavel' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

-- A meta da ficha: sem a ficha, a de antes (p_keep) se ela continuar valendo, senão nenhuma; com a ficha, "goal_id" (texto de um uuid ou
-- nulo), que precisa ser uma meta do contexto, sem marca de excluída e não arquivada ('meta_invalida').
create or replace function public.clarevo_investment_goal(p_context_id uuid, p_details jsonb, p_keep uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_goal uuid;
  v_t text;
begin
  if p_details is null then
    if p_keep is not null and exists (select 1 from public.goals g where g.id = p_keep and g.context_id = p_context_id
                                        and g.deleted_at is null and g.status <> 'arquivada') then
      return p_keep;
    end if;
    return null;
  end if;
  if coalesce(jsonb_typeof(p_details -> 'goal_id'), 'null') = 'null' then
    return null;
  end if;
  if jsonb_typeof(p_details -> 'goal_id') <> 'string' then
    raise exception 'meta_invalida' using errcode = '22023';
  end if;
  v_t := p_details ->> 'goal_id';
  if v_t !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'meta_invalida' using errcode = '22023';
  end if;
  v_goal := v_t::uuid;
  if not exists (select 1 from public.goals g where g.id = v_goal and g.context_id = p_context_id and g.deleted_at is null and g.status <> 'arquivada') then
    raise exception 'meta_invalida' using errcode = '22023';
  end if;
  return v_goal;
end;
$$;

-- A visão ganha a meta no fim (as colunas de antes ficam na mesma ordem); meta com marca de excluída aparece como nenhuma.
create or replace view public.investment_items with (security_invoker = true) as
select i.id, i.context_id, i.name, i.kind, i.status, i.created_by, i.version, i.created_at, i.updated_at,
       a.deposits as deposits_cents, a.withdrawals as withdrawals_cents, a.income as income_cents,
       (coalesce(s.amount_cents, 0) + f.flows)::bigint as value_cents,
       s.occurred_on as last_value_on, a.first_on as first_movement_on,
       i.subkind, i.institution, i.index_kind, i.rate_bp, i.maturity_on, i.liquidity, i.liquidity_on, i.liquidity_days,
       (select g.id from public.goals g where g.id = i.goal_id and g.deleted_at is null) as goal_id
  from public.investments i
  cross join lateral (
    select coalesce(sum(m.amount_cents) filter (where m.kind = 'aporte'), 0)::bigint as deposits,
           coalesce(sum(m.amount_cents) filter (where m.kind = 'resgate'), 0)::bigint as withdrawals,
           coalesce(sum(m.amount_cents) filter (where m.kind = 'rendimento'), 0)::bigint as income,
           min(m.occurred_on) as first_on
      from public.investment_movements m where m.investment_id = i.id) a
  left join lateral (
    select m.occurred_on, m.amount_cents from public.investment_movements m
     where m.investment_id = i.id and m.kind = 'valor'
     order by m.occurred_on desc, m.created_at desc, m.id desc limit 1) s on true
  cross join lateral (
    select coalesce(sum(case m.kind when 'aporte' then m.amount_cents when 'resgate' then -m.amount_cents else 0 end), 0)::bigint as flows
      from public.investment_movements m
     where m.investment_id = i.id and (s.occurred_on is null or m.occurred_on > s.occurred_on)) f;
comment on view public.investment_items is 'Investimentos com o aportado, o resgatado, os rendimentos recebidos, o valor de hoje (D-093), a ficha ampliada e a meta ligada (D-099).';

create or replace function public.create_investment(
  p_key text,
  p_context_id uuid,
  p_name text,
  p_kind text,
  p_invested_cents bigint,
  p_start_on date,
  p_current_cents bigint default null,
  p_details jsonb default null
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
  v_name text;
  v_d jsonb;
  v_goal uuid;
  v_i public.investments%rowtype;
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  perform public.clarevo_check_key(p_key);
  v_hash := md5(jsonb_build_array('criar_investimento', p_context_id, p_name, p_kind, p_invested_cents, p_start_on, p_current_cents, p_details)::text);
  perform pg_advisory_xact_lock(hashtext('op:' || v_uid::text || ':' || p_key));

  select * into v_op from public.record_operations where actor_id = v_uid and idempotency_key = p_key;
  if found then
    if v_op.action <> 'criar_investimento' or v_op.request_hash <> v_hash then
      raise exception 'chave_reutilizada' using errcode = 'PT409';
    end if;
    if not public.context_permission(v_op.context_id, 'read') then
      raise exception 'nao_encontrado' using errcode = 'P0002';
    end if;
    return public.clarevo_investment_result(v_op.target_id, null);
  end if;

  if p_context_id is null or not public.context_permission(p_context_id, 'read') then
    raise exception 'nao_encontrado' using errcode = 'P0002';
  end if;
  if not public.context_permission(p_context_id, 'write') then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if not exists (select 1 from public.financial_contexts c where c.id = p_context_id and c.kind = 'pessoal') then
    raise exception 'contexto_invalido' using errcode = '22023';
  end if;
  v_name := public.clarevo_validate_investment(p_name, p_kind);
  perform public.clarevo_validate_investment_movement(v_uid, 'aporte', p_invested_cents, p_start_on, null);
  if p_current_cents is not null then
    perform public.clarevo_validate_investment_movement(v_uid, 'valor', p_current_cents, public.clarevo_today(v_uid), null);
  end if;
  v_d := public.clarevo_validate_investment_details(p_kind, p_details);
  v_goal := public.clarevo_investment_goal(p_context_id, p_details, null);
  perform public.clarevo_check_investment_limit(p_context_id);

  insert into public.investments (context_id, name, kind, created_by, subkind, institution, index_kind, rate_bp, maturity_on, liquidity,
                                  liquidity_on, liquidity_days, goal_id)
  values (p_context_id, v_name, p_kind, v_uid, v_d ->> 'subkind', v_d ->> 'institution', v_d ->> 'index_kind', (v_d ->> 'rate_bp')::integer,
          (v_d ->> 'maturity_on')::date, v_d ->> 'liquidity', (v_d ->> 'liquidity_on')::date, (v_d ->> 'liquidity_days')::integer, v_goal)
  returning * into v_i;
  insert into public.investment_movements (investment_id, context_id, kind, amount_cents, occurred_on, created_by)
  values (v_i.id, v_i.context_id, 'aporte', p_invested_cents, p_start_on, v_uid);
  if p_current_cents is not null then
    insert into public.investment_movements (investment_id, context_id, kind, amount_cents, occurred_on, created_by)
    values (v_i.id, v_i.context_id, 'valor', p_current_cents, public.clarevo_today(v_uid), v_uid);
  end if;

  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id, target_id)
  values (v_uid, p_key, 'criar_investimento', v_i.context_id, v_hash, null, null, v_i.id);
  return public.clarevo_investment_result(v_i.id, null);
end;
$$;

create or replace function public.update_investment(p_key text, p_id uuid, p_expected_version integer, p_name text, p_kind text, p_details jsonb default null)
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
  v_i public.investments%rowtype;
  v_name text;
  v_d jsonb;
  v_cur jsonb;
  v_goal uuid;
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  perform public.clarevo_check_key(p_key);
  v_hash := md5(jsonb_build_array('alterar_investimento', p_id, p_expected_version, p_name, p_kind, p_details)::text);
  perform pg_advisory_xact_lock(hashtext('op:' || v_uid::text || ':' || p_key));
  select * into v_op from public.record_operations where actor_id = v_uid and idempotency_key = p_key;
  if found then
    if v_op.action <> 'alterar_investimento' or v_op.request_hash <> v_hash then
      raise exception 'chave_reutilizada' using errcode = 'PT409';
    end if;
    if not public.context_permission(v_op.context_id, 'read') then
      raise exception 'nao_encontrado' using errcode = 'P0002';
    end if;
    return public.clarevo_investment_result(v_op.target_id, null);
  end if;

  v_i := public.clarevo_lock_investment(p_id);
  if p_expected_version is distinct from v_i.version then
    raise exception 'versao_desatualizada' using errcode = 'PT409', detail = 'versao_atual=' || v_i.version;
  end if;
  v_name := public.clarevo_validate_investment(p_name, p_kind);
  if p_details is null then
    v_cur := jsonb_build_object('subkind', v_i.subkind, 'institution', v_i.institution, 'index_kind', v_i.index_kind, 'rate_bp', v_i.rate_bp,
                                'maturity_on', v_i.maturity_on, 'liquidity', v_i.liquidity, 'liquidity_on', v_i.liquidity_on, 'liquidity_days', v_i.liquidity_days);
    begin
      v_d := public.clarevo_validate_investment_details(p_kind, v_cur);
    exception when others then
      v_d := public.clarevo_validate_investment_details(p_kind, v_cur - 'subkind');
    end;
  else
    v_d := public.clarevo_validate_investment_details(p_kind, p_details);
  end if;
  -- A meta ligada (0036): sem a ficha, fica a de antes (se a meta continuar valendo); com a ficha, a que veio nela.
  v_goal := public.clarevo_investment_goal(v_i.context_id, p_details, v_i.goal_id);
  update public.investments
     set name = v_name, kind = p_kind, subkind = v_d ->> 'subkind', institution = v_d ->> 'institution', index_kind = v_d ->> 'index_kind',
         rate_bp = (v_d ->> 'rate_bp')::integer, maturity_on = (v_d ->> 'maturity_on')::date, liquidity = v_d ->> 'liquidity',
         liquidity_on = (v_d ->> 'liquidity_on')::date, liquidity_days = (v_d ->> 'liquidity_days')::integer, goal_id = v_goal, version = version + 1
   where id = v_i.id;
  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id, target_id)
  values (v_uid, p_key, 'alterar_investimento', v_i.context_id, v_hash, null, null, v_i.id);
  return public.clarevo_investment_result(v_i.id, null);
end;
$$;

-- ---------------------------------------------------------------------------
-- Operações: a lista vigente (a da 0032) mais as duas do plano de aportes, sem alvo.
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
  'definir_plano_investimentos', 'excluir_plano_investimentos'));
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
                 'imagem_meta', 'ordenar_metas',
                 'criar_investimento', 'alterar_investimento', 'situacao_investimento', 'excluir_investimento',
                 'registrar_movimento_investimento', 'alterar_movimento_investimento', 'excluir_movimento_investimento')
      and target_id is not null and record_id is null and commitment_id is null)
  or (action in ('pagar_fatura', 'desfazer_pagamento_fatura')
      and target_id is not null and record_id is not null and commitment_id is not null)
  or (action = 'criar_ocorrencia' and commitment_id is not null and target_id is not null and record_id is null)
  or (action in ('decidir_revisao', 'responder_guardar', 'revisar_assinaturas', 'marcar_mes_conferido', 'desmarcar_mes_conferido',
                 'responder_origem_cadastro', 'gerar_codigo_whatsapp', 'ligar_whatsapp', 'desligar_whatsapp',
                 'gerar_codigo_telegram', 'ligar_telegram', 'desligar_telegram', 'aceitar_termos',
                 'definir_plano_investimentos', 'excluir_plano_investimentos')
      and record_id is null and commitment_id is null and target_id is null));


-- ---------------------------------------------------------------------------
-- Privilégios: leitura do plano; a função do plano para o app; auxiliares e gatilho fechados.
-- ---------------------------------------------------------------------------
revoke all on public.investment_plans from anon, authenticated;
grant select on public.investment_plans to authenticated;
revoke all on public.investment_items from anon, authenticated;
grant select on public.investment_items to authenticated;
revoke all on function public.investment_plans_guard() from public, anon, authenticated, service_role;
revoke all on function public.clarevo_investment_plan_result(uuid) from public, anon, authenticated, service_role;
revoke all on function public.clarevo_investment_goal(uuid, jsonb, uuid) from public, anon, authenticated, service_role;
revoke all on function public.set_investment_plan(text, uuid, bigint) from public, anon;
grant execute on function public.set_investment_plan(text, uuid, bigint) to authenticated;
