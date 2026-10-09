-- Clarevo · migração 0007 · metas e reserva para imprevistos (D-027). Depois de 20261009000002_renda_comprometida.sql.
-- Metas só por create_goal, update_goal, set_goal_status e delete_goal; movimentos só por add_goal_movement,
-- update_goal_movement e delete_goal_movement: autoria da sessão, chave de idempotência por pessoa (o mesmo espaço das
-- outras operações), hash em JSON (D-021, regra 7), versão e exclusão lógica.
-- A reserva é meta, não conta: o Clarevo não guarda nem movimenta dinheiro. Um movimento é um fato registrado pela pessoa.
--
-- Sinal dos movimentos: saldo_inicial (já guardado ao criar), aporte, rendimento (recebido) e valorizacao somam;
-- resgate e desvalorizacao subtraem. Guardado = soma dos movimentos vivos (todos com data até hoje: data futura é recusada).
--
-- Invariantes:
-- G1. O valor guardado ao fim de cada dia nunca fica negativo (clarevo_goal_negative_day; gatilho de restrição adiado).
-- G2. Meta e movimentos no mesmo contexto (FK composta).
-- G3. Nenhum objeto de metas tem FK, gatilho ou escrita em financial_records ou commitments: movimentos nunca entram em
--     Recebido, Pago, Diferença, Ainda a pagar nem na renda comprometida (month_totals, month_to_pay e month_committed
--     não mudam).
-- G4. Meta excluída não tem movimento vivo.
-- G5. Meta arquivada não recebe movimento (nem tem movimento alterado ou excluído pelas funções).
-- G6. No máximo uma reserva para imprevistos não excluída e não arquivada por contexto.
-- G7. Identidade, contexto, autoria e criação nunca mudam; o tipo do movimento nunca muda; excluídos não mudam mais;
--     versão +1 por escrita; no máximo um "já guardado ao criar" vivo por meta.
-- Ordem de travas: chave → meta → (reserva do contexto, consultiva) → movimentos. A atividade (gatilho de
-- record_operations, 0005) é a última, como em toda escrita.

-- ---------------------------------------------------------------------------
-- Metas
-- ---------------------------------------------------------------------------
create table public.goals (
  id uuid primary key default gen_random_uuid(),
  context_id uuid not null references public.financial_contexts (id) on delete cascade,
  goal_type text not null check (goal_type in ('emergencia', 'oportunidade', 'objetivo')),
  name text not null check (name = btrim(name) and char_length(name) between 1 and 40),
  target_cents bigint not null check (target_cents between 1 and 999999999),
  -- Prazo: primeiro dia do mês (opcional).
  target_month date check (target_month is null or extract(day from target_month) = 1),
  planned_monthly_cents bigint check (planned_monthly_cents is null or planned_monthly_cents between 1 and 999999999),
  -- Só na reserva para imprevistos: gastos essenciais por mês confirmados, meses escolhidos e a origem da base.
  essential_base_cents bigint check (essential_base_cents is null or essential_base_cents between 1 and 999999999),
  essential_months smallint check (essential_months is null or essential_months between 1 and 24),
  essential_base_source text check (essential_base_source in ('media_gastos', 'contas_do_mes', 'informado')),
  status text not null default 'ativa' check (status in ('ativa', 'concluida', 'arquivada')),
  created_by uuid not null references public.persons (id),
  version integer not null default 1 check (version >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references public.persons (id),
  constraint goals_id_context_key unique (id, context_id),
  -- Reserva: os três campos e alvo = base × meses. Outras metas: nenhum dos três.
  constraint goals_reserva check (
    (goal_type = 'emergencia' and essential_base_cents is not null and essential_months is not null
       and essential_base_source is not null and target_cents = essential_base_cents * essential_months)
    or (goal_type <> 'emergencia' and essential_base_cents is null and essential_months is null
       and essential_base_source is null)),
  constraint goals_exclusao check ((deleted_at is null) = (deleted_by is null))
);
-- G6: excluídas e arquivadas não bloqueiam uma reserva nova.
create unique index goals_one_emergency on public.goals (context_id)
  where goal_type = 'emergencia' and deleted_at is null and status <> 'arquivada';
create index goals_ctx on public.goals (context_id) where deleted_at is null;
comment on table public.goals is
  'Metas e reservas (D-027). O progresso só anda com movimentos registrados; o plano por mês é intenção, não aporte.';

-- ---------------------------------------------------------------------------
-- Movimentos da meta
-- ---------------------------------------------------------------------------
create table public.goal_movements (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null,
  context_id uuid not null,
  kind text not null check (kind in ('saldo_inicial', 'aporte', 'resgate', 'rendimento', 'valorizacao', 'desvalorizacao')),
  amount_cents bigint not null check (amount_cents between 1 and 999999999),
  occurred_on date not null,
  note text check (note is null or (note = btrim(note) and char_length(note) between 1 and 80)),
  created_by uuid not null references public.persons (id),
  version integer not null default 1 check (version >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references public.persons (id),
  constraint goal_movements_exclusao check ((deleted_at is null) = (deleted_by is null)),
  -- G2. Em cascata: apagar o contexto (que apaga a meta) continua possível.
  constraint goal_movements_goal_fk foreign key (goal_id, context_id)
    references public.goals (id, context_id) on delete cascade
);
create unique index goal_movements_one_initial on public.goal_movements (goal_id)
  where kind = 'saldo_inicial' and deleted_at is null;
create index goal_movements_goal_date on public.goal_movements (goal_id, occurred_on) where deleted_at is null;
create index goal_movements_ctx_date on public.goal_movements (context_id, occurred_on) where deleted_at is null;
comment on table public.goal_movements is
  'Movimentos registrados de uma meta. Nunca entram em Recebido, Pago, Diferença, Ainda a pagar nem na renda comprometida.';

-- ---------------------------------------------------------------------------
-- Operações: lista completa vigente (0002, 0003, 0004, 0005 e 0006) mais as sete ações novas, que apontam só para o
-- alvo (target_id): a meta nas ações de meta, o movimento nas ações de movimento.
-- ---------------------------------------------------------------------------
alter table public.record_operations drop constraint record_operations_action_check;
alter table public.record_operations add constraint record_operations_action_check check (action in (
  'criar', 'editar', 'excluir',
  'criar_compromisso', 'editar_compromisso', 'excluir_compromisso', 'pagar_compromisso', 'desfazer_pagamento',
  'criar_serie', 'alterar_serie', 'encerrar_serie', 'excluir_serie', 'informar_ano', 'tirar_ano',
  'criar_ocorrencia', 'decidir_revisao',
  'definir_renda_referencia', 'excluir_renda_referencia',
  'criar_meta', 'alterar_meta', 'situacao_meta', 'excluir_meta',
  'registrar_movimento_meta', 'alterar_movimento_meta', 'excluir_movimento_meta'));
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
                 'registrar_movimento_meta', 'alterar_movimento_meta', 'excluir_movimento_meta')
      and target_id is not null and record_id is null and commitment_id is null)
  or (action = 'criar_ocorrencia' and commitment_id is not null and target_id is not null and record_id is null)
  or (action = 'decidir_revisao' and record_id is null and commitment_id is null and target_id is null));

-- ---------------------------------------------------------------------------
-- Gatilhos de proteção (G7): defesa adicional, só as sete funções gravam.
-- ---------------------------------------------------------------------------

-- Podem mudar: tipo, nome, alvo, prazo, plano, base da reserva, situação, version (+1), updated_at e a exclusão.
create or replace function public.goals_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.id <> old.id or new.context_id <> old.context_id or new.created_by <> old.created_by
     or new.created_at <> old.created_at or old.deleted_at is not null or new.version <> old.version + 1 then
    raise exception 'campo_imutavel' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger goals_guard
  before update on public.goals
  for each row execute function public.goals_guard();

-- Podem mudar: valor, data, observação, version (+1), updated_at e a exclusão. O tipo nunca muda.
create or replace function public.goal_movements_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.id <> old.id or new.goal_id <> old.goal_id or new.context_id <> old.context_id or new.kind <> old.kind
     or new.created_by <> old.created_by or new.created_at <> old.created_at or old.deleted_at is not null
     or new.version <> old.version + 1 then
    raise exception 'campo_imutavel' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger goal_movements_guard
  before update on public.goal_movements
  for each row execute function public.goal_movements_guard();

-- ---------------------------------------------------------------------------
-- Saldo diário (G1): o primeiro dia em que a soma acumulada, por data, dos movimentos vivos fica negativa; nulo se
-- nenhum. Somas em numeric (sum de bigint), sem estouro.
-- ---------------------------------------------------------------------------
create or replace function public.clarevo_goal_negative_day(p_goal_id uuid)
returns date
language sql
stable
set search_path = public
as $$
  select x.d
    from (select m.occurred_on as d,
                 sum(sum(case when m.kind in ('resgate', 'desvalorizacao') then -m.amount_cents else m.amount_cents end))
                   over (order by m.occurred_on) as saved
            from public.goal_movements m
           where m.goal_id = p_goal_id and m.deleted_at is null
           group by m.occurred_on) x
   where x.saved < 0
   order by x.d
   limit 1
$$;

-- G1, G4 e G5 conferidas no fim da transação (defesa de último nível: as funções já recusam antes de gravar;
-- este gatilho pega escrita manual no banco, inclusive a exclusão física de um aporte).
-- security definer: dispara no commit com o papel de quem chamou e precisa ler as linhas excluídas.
create or replace function public.clarevo_check_goal_consistency()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gid uuid;
  v_g public.goals%rowtype;
  v_day date;
begin
  if tg_table_name = 'goals' then
    v_gid := new.id;
  elsif tg_op = 'DELETE' then
    v_gid := old.goal_id;
  else
    v_gid := new.goal_id;
  end if;
  select * into v_g from public.goals where id = v_gid;
  -- Meta (ou contexto inteiro) apagada na mesma transação: não sobra meta para conferir.
  if not found then
    return null;
  end if;
  if v_g.deleted_at is not null
     and exists (select 1 from public.goal_movements where goal_id = v_gid and deleted_at is null) then      -- G4
    raise exception 'meta_inconsistente' using errcode = '23514';
  end if;
  if tg_table_name = 'goal_movements' and tg_op = 'INSERT' then                                          -- G5
    if new.deleted_at is null and v_g.status = 'arquivada' then
      raise exception 'meta_inconsistente' using errcode = '23514';
    end if;
  end if;
  v_day := public.clarevo_goal_negative_day(v_gid);                                                      -- G1
  if v_day is not null then
    raise exception 'saldo_da_meta_insuficiente' using errcode = 'PT409', detail = 'dia=' || to_char(v_day, 'YYYY-MM-DD');
  end if;
  return null;
end;
$$;

create constraint trigger goal_movements_consistency
  after insert or update on public.goal_movements
  deferrable initially deferred
  for each row execute function public.clarevo_check_goal_consistency();
create constraint trigger goal_movements_consistency_del
  after delete on public.goal_movements
  deferrable initially deferred
  for each row execute function public.clarevo_check_goal_consistency();
create constraint trigger goals_consistency
  after update on public.goals
  deferrable initially deferred
  for each row execute function public.clarevo_check_goal_consistency();

-- ---------------------------------------------------------------------------
-- Funções auxiliares (sem execute para authenticated)
-- ---------------------------------------------------------------------------

-- Igual a clarevo_lock_series: carrega para alteração sem revelar se existe para quem não pode ler.
-- Escrita no contexto e, para a meta de outra pessoa, "editar de outras pessoas".
create or replace function public.clarevo_lock_goal(p_goal_id uuid)
returns public.goals
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_g public.goals%rowtype;
begin
  select * into v_g from public.goals where id = p_goal_id for update;
  if not found or v_g.deleted_at is not null or not public.context_permission(v_g.context_id, 'read') then
    raise exception 'nao_encontrado' using errcode = 'P0002';
  end if;
  if not public.context_permission(v_g.context_id, 'write')
     or (v_g.created_by <> auth.uid() and not public.context_permission(v_g.context_id, 'edit_others')) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  return v_g;
end;
$$;

-- Validação da meta (mesma ordem de validateGoalDraft no core). Devolve o alvo a gravar (na reserva, base × meses).
-- p_check_month = false na edição quando o prazo não mudou (meta com prazo já passado continua editável).
-- Ordem: tipo; nome; alvo (reserva: base, meses, origem, base × meses no limite, alvo informado igual ao produto;
-- outras: nenhum campo da reserva, valor, limite); prazo; plano por mês.
create or replace function public.clarevo_validate_goal(
  p_actor uuid, p_goal_type text, p_name text, p_target_cents bigint, p_target_month date, p_planned_monthly_cents bigint,
  p_essential_base_cents bigint, p_essential_months integer, p_essential_base_source text, p_check_month boolean
)
returns bigint
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_month date := date_trunc('month', public.clarevo_today(p_actor)::timestamp)::date;
  v_target bigint;
begin
  if p_goal_type is null or p_goal_type not in ('emergencia', 'oportunidade', 'objetivo') then
    raise exception 'tipo_invalido' using errcode = '22023';
  end if;
  if p_name is null or p_name = '' or char_length(p_name) > 40 then
    raise exception 'nome_da_meta_invalido' using errcode = '22023';
  end if;
  if p_goal_type = 'emergencia' then
    if p_essential_base_cents is null or p_essential_base_cents < 1 then
      raise exception 'valor_invalido' using errcode = '22023';
    end if;
    if p_essential_months is null or p_essential_months not between 1 and 24 then
      raise exception 'meses_invalidos' using errcode = '22023';
    end if;
    if p_essential_base_source is null or p_essential_base_source not in ('media_gastos', 'contas_do_mes', 'informado') then
      raise exception 'origem_invalida' using errcode = '22023';
    end if;
    -- Conferido antes do produto (sem estouro): base × meses <= limite <=> base <= limite div meses.
    if p_essential_base_cents > 999999999 / p_essential_months then
      raise exception 'alvo_acima_do_limite' using errcode = '22023';
    end if;
    v_target := p_essential_base_cents * p_essential_months;
    if p_target_cents is not null and p_target_cents <> v_target then
      raise exception 'alvo_invalido' using errcode = '22023';
    end if;
  else
    if p_essential_base_cents is not null or p_essential_months is not null or p_essential_base_source is not null then
      raise exception 'tipo_invalido' using errcode = '22023';
    end if;
    if p_target_cents is null or p_target_cents < 1 then
      raise exception 'valor_invalido' using errcode = '22023';
    end if;
    if p_target_cents > 999999999 then
      raise exception 'alvo_acima_do_limite' using errcode = '22023';
    end if;
    v_target := p_target_cents;
  end if;
  -- Prazo: do mês de hoje a 600 meses depois (o limite do simulador).
  if p_target_month is not null
     and (extract(day from p_target_month) <> 1
          or (p_check_month and (p_target_month < v_month or p_target_month > (v_month + interval '600 months')::date))) then
    raise exception 'prazo_invalido' using errcode = '22023';
  end if;
  if p_planned_monthly_cents is not null and (p_planned_monthly_cents < 1 or p_planned_monthly_cents > 999999999) then
    raise exception 'plano_invalido' using errcode = '22023';
  end if;
  return v_target;
end;
$$;

-- Validação de um movimento (mesma ordem de validateGoalMovementDraft no core): valor, data, observação.
create or replace function public.clarevo_validate_goal_movement(
  p_actor uuid, p_amount_cents bigint, p_occurred_on date, p_note text
)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_amount_cents is null or p_amount_cents < 1 then
    raise exception 'valor_invalido' using errcode = '22023';
  end if;
  if p_amount_cents > 999999999 then
    raise exception 'valor_acima_do_limite' using errcode = '22023';
  end if;
  if p_occurred_on is null then
    raise exception 'data_invalida' using errcode = '22023';
  end if;
  if p_occurred_on > public.clarevo_today(p_actor) then
    raise exception 'data_futura' using errcode = '22023';
  end if;
  if p_note is not null and char_length(p_note) > 80 then
    raise exception 'observacao_longa' using errcode = '22023';
  end if;
end;
$$;

-- G6: na reserva não arquivada, nenhuma outra reserva viva e não arquivada no contexto.
-- A trava consultiva serializa a criação e a reativação; o índice único é a última defesa.
create or replace function public.clarevo_check_one_emergency(p_context_id uuid, p_goal_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtext('reserva:' || p_context_id::text));
  if exists (select 1 from public.goals g
              where g.context_id = p_context_id and g.goal_type = 'emergencia' and g.deleted_at is null
                and g.status <> 'arquivada' and g.id is distinct from p_goal_id) then
    raise exception 'reserva_ja_existe' using errcode = 'PT409';
  end if;
end;
$$;

-- Saldo diário depois da escrita (G1). A recusa desfaz a escrita (a exceção aborta a chamada).
create or replace function public.clarevo_require_goal_balance(p_goal_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_day date := public.clarevo_goal_negative_day(p_goal_id);
begin
  if v_day is not null then
    raise exception 'saldo_da_meta_insuficiente' using errcode = 'PT409', detail = 'dia=' || to_char(v_day, 'YYYY-MM-DD');
  end if;
end;
$$;

-- Meta no formato da visão goal_items, mais deleted_at e deleted_by (a repetição lê a meta excluída).
-- Somas dos movimentos vivos.
create or replace function public.clarevo_goal_json(p_goal_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select to_jsonb(g) || jsonb_build_object(
           'saved_cents', a.initial + a.deposits + a.income + a.appreciation - a.withdrawals - a.depreciation,
           'initial_cents', a.initial, 'deposits_cents', a.deposits, 'withdrawals_cents', a.withdrawals,
           'income_cents', a.income, 'appreciation_cents', a.appreciation, 'depreciation_cents', a.depreciation,
           'last_movement_on', a.last_on)
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
   where g.id = p_goal_id
$$;

-- Resultado único das sete funções: {goal, movement}. movement: a linha do movimento (null nas ações de meta, exceto
-- create_goal com valor já guardado, que devolve o movimento saldo_inicial).
create or replace function public.clarevo_goal_result(p_goal_id uuid, p_movement_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'goal', public.clarevo_goal_json(p_goal_id),
    'movement', (select to_jsonb(m) from public.goal_movements m where m.id = p_movement_id));
$$;

-- ---------------------------------------------------------------------------
-- Metas: criar, alterar, situação e excluir (atômico, idempotente, versionado).
-- Estrutura comum: sessão; chave; textos aparados; hash de jsonb_build_array(ação, argumentos)::text; trava da chave;
-- repetição (ação e hash iguais, leitura do contexto; devolve o estado atual); permissão e travas; versão; situação;
-- validação; escrita; operação com target_id. Recusa não grava operação (a chave pode ser usada de novo).
-- ---------------------------------------------------------------------------

-- Cria a meta e, com p_initial_cents > 0, o movimento saldo_inicial ("já guardado ao criar") na data p_initial_on.
-- Sem valor já guardado (nulo ou 0), p_initial_on é ignorado. Na reserva, o alvo é base × meses (p_target_cents nulo
-- ou igual ao produto). Situação inicial: ativa.
create or replace function public.create_goal(
  p_idempotency_key text,
  p_context_id uuid,
  p_goal_type text,
  p_name text,
  p_target_cents bigint,
  p_target_month date,
  p_planned_monthly_cents bigint,
  p_essential_base_cents bigint,
  p_essential_months integer,
  p_essential_base_source text,
  p_initial_cents bigint,
  p_initial_on date
)
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
  v_target bigint;
  v_g public.goals%rowtype;
  v_mid uuid;
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  perform public.clarevo_check_key(p_idempotency_key);
  v_hash := md5(jsonb_build_array('criar_meta', p_context_id, p_goal_type, v_name, p_target_cents, p_target_month,
                                  p_planned_monthly_cents, p_essential_base_cents, p_essential_months, p_essential_base_source,
                                  p_initial_cents, p_initial_on)::text);
  perform pg_advisory_xact_lock(hashtext('op:' || v_uid::text || ':' || p_idempotency_key));

  select * into v_op from public.record_operations where actor_id = v_uid and idempotency_key = p_idempotency_key;
  if found then
    if v_op.action <> 'criar_meta' or v_op.request_hash <> v_hash then
      raise exception 'chave_reutilizada' using errcode = 'PT409';
    end if;
    if not public.context_permission(v_op.context_id, 'read') then
      raise exception 'nao_encontrado' using errcode = 'P0002';
    end if;
    -- O saldo_inicial só nasce aqui: no máximo um por meta, vivo ou excluído.
    return public.clarevo_goal_result(v_op.target_id,
      (select m.id from public.goal_movements m where m.goal_id = v_op.target_id and m.kind = 'saldo_inicial'
        order by m.created_at limit 1));
  end if;

  if not public.context_permission(p_context_id, 'write') then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  v_target := public.clarevo_validate_goal(v_uid, p_goal_type, v_name, p_target_cents, p_target_month, p_planned_monthly_cents,
                                           p_essential_base_cents, p_essential_months, p_essential_base_source, true);
  if p_initial_cents is not null and (p_initial_cents < 0 or p_initial_cents > 999999999) then
    raise exception 'saldo_inicial_invalido' using errcode = '22023';
  end if;
  if coalesce(p_initial_cents, 0) > 0 then
    if p_initial_on is null then
      raise exception 'data_invalida' using errcode = '22023';
    end if;
    if p_initial_on > public.clarevo_today(v_uid) then
      raise exception 'data_futura' using errcode = '22023';
    end if;
  end if;
  if p_goal_type = 'emergencia' then
    perform public.clarevo_check_one_emergency(p_context_id, null);
  end if;

  insert into public.goals (context_id, goal_type, name, target_cents, target_month, planned_monthly_cents,
                            essential_base_cents, essential_months, essential_base_source, created_by)
  values (p_context_id, p_goal_type, v_name, v_target, p_target_month, p_planned_monthly_cents,
          p_essential_base_cents, p_essential_months, p_essential_base_source, v_uid)
  returning * into v_g;

  if coalesce(p_initial_cents, 0) > 0 then
    insert into public.goal_movements (goal_id, context_id, kind, amount_cents, occurred_on, created_by)
    values (v_g.id, v_g.context_id, 'saldo_inicial', p_initial_cents, p_initial_on, v_uid)
    returning id into v_mid;
  end if;

  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id, target_id)
  values (v_uid, p_idempotency_key, 'criar_meta', p_context_id, v_hash, null, null, v_g.id);

  return public.clarevo_goal_result(v_g.id, v_mid);
end;
$$;

-- Altera tipo, nome, alvo, prazo, plano e base da reserva (os mesmos campos de create_goal, sem o valor já guardado).
-- Em qualquer situação. Virar reserva (ou mudar a reserva) respeita uma reserva por contexto. O prazo só é conferido
-- contra o mês de hoje quando muda.
create or replace function public.update_goal(
  p_idempotency_key text,
  p_goal_id uuid,
  p_expected_version integer,
  p_goal_type text,
  p_name text,
  p_target_cents bigint,
  p_target_month date,
  p_planned_monthly_cents bigint,
  p_essential_base_cents bigint,
  p_essential_months integer,
  p_essential_base_source text
)
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
  v_target bigint;
  v_g public.goals%rowtype;
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  perform public.clarevo_check_key(p_idempotency_key);
  v_hash := md5(jsonb_build_array('alterar_meta', p_goal_id, p_expected_version, p_goal_type, v_name, p_target_cents,
                                  p_target_month, p_planned_monthly_cents, p_essential_base_cents, p_essential_months,
                                  p_essential_base_source)::text);
  perform pg_advisory_xact_lock(hashtext('op:' || v_uid::text || ':' || p_idempotency_key));

  select * into v_op from public.record_operations where actor_id = v_uid and idempotency_key = p_idempotency_key;
  if found then
    if v_op.action <> 'alterar_meta' or v_op.request_hash <> v_hash then
      raise exception 'chave_reutilizada' using errcode = 'PT409';
    end if;
    if not public.context_permission(v_op.context_id, 'read') then
      raise exception 'nao_encontrado' using errcode = 'P0002';
    end if;
    return public.clarevo_goal_result(v_op.target_id, null);
  end if;

  v_g := public.clarevo_lock_goal(p_goal_id);
  -- Versão ausente (NULL) também é recusada.
  if p_expected_version is distinct from v_g.version then
    raise exception 'versao_desatualizada' using errcode = 'PT409', detail = 'versao_atual=' || v_g.version;
  end if;
  v_target := public.clarevo_validate_goal(v_uid, p_goal_type, v_name, p_target_cents, p_target_month, p_planned_monthly_cents,
                                           p_essential_base_cents, p_essential_months, p_essential_base_source,
                                           p_target_month is distinct from v_g.target_month);
  if p_goal_type = 'emergencia' and v_g.status <> 'arquivada' then
    perform public.clarevo_check_one_emergency(v_g.context_id, v_g.id);
  end if;

  update public.goals
     set goal_type = p_goal_type, name = v_name, target_cents = v_target, target_month = p_target_month,
         planned_monthly_cents = p_planned_monthly_cents, essential_base_cents = p_essential_base_cents,
         essential_months = p_essential_months, essential_base_source = p_essential_base_source, version = version + 1
   where id = v_g.id
  returning * into v_g;

  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id, target_id)
  values (v_uid, p_idempotency_key, 'alterar_meta', v_g.context_id, v_hash, null, null, v_g.id);

  return public.clarevo_goal_result(v_g.id, null);
end;
$$;

-- Concluir, arquivar e reativar ('ativa', 'concluida', 'arquivada'). Concluir é escolha da pessoa (não exige alcançar
-- o alvo). Tirar uma reserva de 'arquivada' respeita uma reserva por contexto (reserva_ja_existe).
create or replace function public.set_goal_status(
  p_idempotency_key text,
  p_goal_id uuid,
  p_expected_version integer,
  p_status text
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
  v_g public.goals%rowtype;
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  perform public.clarevo_check_key(p_idempotency_key);
  v_hash := md5(jsonb_build_array('situacao_meta', p_goal_id, p_expected_version, p_status)::text);
  perform pg_advisory_xact_lock(hashtext('op:' || v_uid::text || ':' || p_idempotency_key));

  select * into v_op from public.record_operations where actor_id = v_uid and idempotency_key = p_idempotency_key;
  if found then
    if v_op.action <> 'situacao_meta' or v_op.request_hash <> v_hash then
      raise exception 'chave_reutilizada' using errcode = 'PT409';
    end if;
    if not public.context_permission(v_op.context_id, 'read') then
      raise exception 'nao_encontrado' using errcode = 'P0002';
    end if;
    return public.clarevo_goal_result(v_op.target_id, null);
  end if;

  v_g := public.clarevo_lock_goal(p_goal_id);
  if p_expected_version is distinct from v_g.version then
    raise exception 'versao_desatualizada' using errcode = 'PT409', detail = 'versao_atual=' || v_g.version;
  end if;
  if p_status is null or p_status not in ('ativa', 'concluida', 'arquivada') then
    raise exception 'situacao_invalida' using errcode = '22023';
  end if;
  if v_g.goal_type = 'emergencia' and v_g.status = 'arquivada' and p_status <> 'arquivada' then
    perform public.clarevo_check_one_emergency(v_g.context_id, v_g.id);
  end if;

  update public.goals set status = p_status, version = version + 1 where id = v_g.id
  returning * into v_g;

  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id, target_id)
  values (v_uid, p_idempotency_key, 'situacao_meta', v_g.context_id, v_hash, null, null, v_g.id);

  return public.clarevo_goal_result(v_g.id, null);
end;
$$;

-- Exclui a meta e os movimentos vivos (exclusão lógica, versão +1 em cada). Em qualquer situação.
create or replace function public.delete_goal(
  p_idempotency_key text,
  p_goal_id uuid,
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
  v_g public.goals%rowtype;
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  perform public.clarevo_check_key(p_idempotency_key);
  v_hash := md5(jsonb_build_array('excluir_meta', p_goal_id, p_expected_version)::text);
  perform pg_advisory_xact_lock(hashtext('op:' || v_uid::text || ':' || p_idempotency_key));

  select * into v_op from public.record_operations where actor_id = v_uid and idempotency_key = p_idempotency_key;
  if found then
    if v_op.action <> 'excluir_meta' or v_op.request_hash <> v_hash then
      raise exception 'chave_reutilizada' using errcode = 'PT409';
    end if;
    if not public.context_permission(v_op.context_id, 'read') then
      raise exception 'nao_encontrado' using errcode = 'P0002';
    end if;
    return public.clarevo_goal_result(v_op.target_id, null);
  end if;

  v_g := public.clarevo_lock_goal(p_goal_id);
  if p_expected_version is distinct from v_g.version then
    raise exception 'versao_desatualizada' using errcode = 'PT409', detail = 'versao_atual=' || v_g.version;
  end if;

  -- Travas: meta, depois os movimentos (G4).
  update public.goal_movements
     set deleted_at = now(), deleted_by = v_uid, version = version + 1
   where goal_id = v_g.id and deleted_at is null;
  update public.goals
     set deleted_at = now(), deleted_by = v_uid, version = version + 1
   where id = v_g.id
  returning * into v_g;

  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id, target_id)
  values (v_uid, p_idempotency_key, 'excluir_meta', v_g.context_id, v_hash, null, null, v_g.id);

  return public.clarevo_goal_result(v_g.id, null);
end;
$$;

-- ---------------------------------------------------------------------------
-- Movimentos: registrar, alterar e excluir. A trava da meta serializa o saldo; a versão da meta não muda (quem edita o
-- nome em outro aparelho não recebe conflito). Meta arquivada: meta_arquivada. Saldo diário conferido depois da escrita.
-- ---------------------------------------------------------------------------

-- Aporte, resgate, rendimento recebido, valorização ou desvalorização (saldo_inicial só por create_goal), sem versão
-- (como create_record). Data até hoje.
create or replace function public.add_goal_movement(
  p_idempotency_key text,
  p_goal_id uuid,
  p_kind text,
  p_amount_cents bigint,
  p_occurred_on date,
  p_note text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_note text := nullif(public.clarevo_trim(p_note), '');
  v_hash text;
  v_op public.record_operations%rowtype;
  v_g public.goals%rowtype;
  v_m public.goal_movements%rowtype;
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  perform public.clarevo_check_key(p_idempotency_key);
  v_hash := md5(jsonb_build_array('registrar_movimento_meta', p_goal_id, p_kind, p_amount_cents, p_occurred_on, v_note)::text);
  perform pg_advisory_xact_lock(hashtext('op:' || v_uid::text || ':' || p_idempotency_key));

  select * into v_op from public.record_operations where actor_id = v_uid and idempotency_key = p_idempotency_key;
  if found then
    if v_op.action <> 'registrar_movimento_meta' or v_op.request_hash <> v_hash then
      raise exception 'chave_reutilizada' using errcode = 'PT409';
    end if;
    if not public.context_permission(v_op.context_id, 'read') then
      raise exception 'nao_encontrado' using errcode = 'P0002';
    end if;
    return public.clarevo_goal_result((select goal_id from public.goal_movements where id = v_op.target_id), v_op.target_id);
  end if;

  v_g := public.clarevo_lock_goal(p_goal_id);
  if v_g.status = 'arquivada' then
    raise exception 'meta_arquivada' using errcode = 'PT409';
  end if;
  if p_kind is null or p_kind not in ('aporte', 'resgate', 'rendimento', 'valorizacao', 'desvalorizacao') then
    raise exception 'tipo_invalido' using errcode = '22023';
  end if;
  perform public.clarevo_validate_goal_movement(v_uid, p_amount_cents, p_occurred_on, v_note);

  insert into public.goal_movements (goal_id, context_id, kind, amount_cents, occurred_on, note, created_by)
  values (v_g.id, v_g.context_id, p_kind, p_amount_cents, p_occurred_on, v_note, v_uid)
  returning * into v_m;
  perform public.clarevo_require_goal_balance(v_g.id);

  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id, target_id)
  values (v_uid, p_idempotency_key, 'registrar_movimento_meta', v_g.context_id, v_hash, null, null, v_m.id);

  return public.clarevo_goal_result(v_g.id, v_m.id);
end;
$$;

-- Carrega o movimento para alteração: trava a meta antes (G1 serializado por meta), depois a linha do movimento.
-- Sem revelar se existe para quem não pode ler; o movimento de outra pessoa exige "editar de outras pessoas".
create or replace function public.clarevo_lock_goal_movement(p_movement_id uuid)
returns public.goal_movements
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_gid uuid;
  v_m public.goal_movements%rowtype;
begin
  -- goal_id é imutável: ler sem trava é seguro.
  select goal_id into v_gid from public.goal_movements where id = p_movement_id;
  if v_gid is null then
    raise exception 'nao_encontrado' using errcode = 'P0002';
  end if;
  perform public.clarevo_lock_goal(v_gid);
  select * into v_m from public.goal_movements where id = p_movement_id for update;
  if not found or v_m.deleted_at is not null then
    raise exception 'nao_encontrado' using errcode = 'P0002';
  end if;
  if v_m.created_by <> auth.uid() and not public.context_permission(v_m.context_id, 'edit_others') then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  return v_m;
end;
$$;

-- Valor, data e observação (o tipo nunca muda), com a versão do movimento.
create or replace function public.update_goal_movement(
  p_idempotency_key text,
  p_movement_id uuid,
  p_expected_version integer,
  p_amount_cents bigint,
  p_occurred_on date,
  p_note text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_note text := nullif(public.clarevo_trim(p_note), '');
  v_hash text;
  v_op public.record_operations%rowtype;
  v_m public.goal_movements%rowtype;
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  perform public.clarevo_check_key(p_idempotency_key);
  v_hash := md5(jsonb_build_array('alterar_movimento_meta', p_movement_id, p_expected_version, p_amount_cents, p_occurred_on,
                                  v_note)::text);
  perform pg_advisory_xact_lock(hashtext('op:' || v_uid::text || ':' || p_idempotency_key));

  select * into v_op from public.record_operations where actor_id = v_uid and idempotency_key = p_idempotency_key;
  if found then
    if v_op.action <> 'alterar_movimento_meta' or v_op.request_hash <> v_hash then
      raise exception 'chave_reutilizada' using errcode = 'PT409';
    end if;
    if not public.context_permission(v_op.context_id, 'read') then
      raise exception 'nao_encontrado' using errcode = 'P0002';
    end if;
    return public.clarevo_goal_result((select goal_id from public.goal_movements where id = v_op.target_id), v_op.target_id);
  end if;

  v_m := public.clarevo_lock_goal_movement(p_movement_id);
  if p_expected_version is distinct from v_m.version then
    raise exception 'versao_desatualizada' using errcode = 'PT409', detail = 'versao_atual=' || v_m.version;
  end if;
  if (select status from public.goals where id = v_m.goal_id) = 'arquivada' then
    raise exception 'meta_arquivada' using errcode = 'PT409';
  end if;
  perform public.clarevo_validate_goal_movement(v_uid, p_amount_cents, p_occurred_on, v_note);

  update public.goal_movements
     set amount_cents = p_amount_cents, occurred_on = p_occurred_on, note = v_note, version = version + 1
   where id = v_m.id
  returning * into v_m;
  perform public.clarevo_require_goal_balance(v_m.goal_id);

  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id, target_id)
  values (v_uid, p_idempotency_key, 'alterar_movimento_meta', v_m.context_id, v_hash, null, null, v_m.id);

  return public.clarevo_goal_result(v_m.goal_id, v_m.id);
end;
$$;

-- Exclusão lógica do movimento (inclusive o saldo_inicial, que não volta), com a versão do movimento.
create or replace function public.delete_goal_movement(
  p_idempotency_key text,
  p_movement_id uuid,
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
  v_m public.goal_movements%rowtype;
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  perform public.clarevo_check_key(p_idempotency_key);
  v_hash := md5(jsonb_build_array('excluir_movimento_meta', p_movement_id, p_expected_version)::text);
  perform pg_advisory_xact_lock(hashtext('op:' || v_uid::text || ':' || p_idempotency_key));

  select * into v_op from public.record_operations where actor_id = v_uid and idempotency_key = p_idempotency_key;
  if found then
    if v_op.action <> 'excluir_movimento_meta' or v_op.request_hash <> v_hash then
      raise exception 'chave_reutilizada' using errcode = 'PT409';
    end if;
    if not public.context_permission(v_op.context_id, 'read') then
      raise exception 'nao_encontrado' using errcode = 'P0002';
    end if;
    return public.clarevo_goal_result((select goal_id from public.goal_movements where id = v_op.target_id), v_op.target_id);
  end if;

  v_m := public.clarevo_lock_goal_movement(p_movement_id);
  if p_expected_version is distinct from v_m.version then
    raise exception 'versao_desatualizada' using errcode = 'PT409', detail = 'versao_atual=' || v_m.version;
  end if;
  if (select status from public.goals where id = v_m.goal_id) = 'arquivada' then
    raise exception 'meta_arquivada' using errcode = 'PT409';
  end if;

  update public.goal_movements
     set deleted_at = now(), deleted_by = v_uid, version = version + 1
   where id = v_m.id
  returning * into v_m;
  perform public.clarevo_require_goal_balance(v_m.goal_id);

  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id, target_id)
  values (v_uid, p_idempotency_key, 'excluir_movimento_meta', v_m.context_id, v_hash, null, null, v_m.id);

  return public.clarevo_goal_result(v_m.goal_id, v_m.id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Leitura: RLS (negado por padrão; só quem lê o contexto vê metas e movimentos vivos) e a visão goal_items.
-- Sem escrita direta.
-- ---------------------------------------------------------------------------
alter table public.goals enable row level security;
alter table public.goal_movements enable row level security;

create policy goals_read on public.goals for select to authenticated
  using (deleted_at is null and public.context_permission(context_id, 'read'));
create policy goal_movements_read on public.goal_movements for select to authenticated
  using (deleted_at is null and public.context_permission(context_id, 'read'));

-- Metas não excluídas com as somas dos movimentos vivos. security_invoker: a RLS de quem consulta vale nas duas tabelas.
create view public.goal_items with (security_invoker = true) as
select g.id, g.context_id, g.goal_type, g.name, g.target_cents, g.target_month, g.planned_monthly_cents,
       g.essential_base_cents, g.essential_months, g.essential_base_source, g.status, g.created_by, g.version,
       g.created_at, g.updated_at,
       (a.initial + a.deposits + a.income + a.appreciation - a.withdrawals - a.depreciation) as saved_cents,
       a.initial as initial_cents, a.deposits as deposits_cents, a.withdrawals as withdrawals_cents,
       a.income as income_cents, a.appreciation as appreciation_cents, a.depreciation as depreciation_cents,
       a.last_on as last_movement_on
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
comment on view public.goal_items is
  'Metas não excluídas com o valor guardado (soma com sinal dos movimentos vivos) e a composição por tipo de movimento.';

-- ---------------------------------------------------------------------------
-- Privilégios: bloco inteiro da 0006 (idempotente), mais as sete funções públicas novas.
-- goals, goal_movements e goal_items ficam sem insert, update ou delete diretos; auxiliares, guardas e o gatilho de
-- consistência ficam sem execute para authenticated.
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;

grant usage on schema public to authenticated;
grant select on all tables in schema public to authenticated;
grant update (display_name, locale) on public.persons to authenticated;
grant update (name) on public.financial_accounts to authenticated;
grant update (can_read, can_write, can_edit_others, revoked_at) on public.context_memberships to authenticated;
-- Empresa: convida (e-mail), encerra e apaga convites não aceitos. Beneficiário e ativação são definidos no aceite.
grant insert (contract_id, invited_email) on public.licenses to authenticated;
grant update (status, ended_at) on public.licenses to authenticated;
grant delete on public.licenses to authenticated;

grant execute on function public.ensure_personal_space(text, text) to authenticated;
grant execute on function public.create_record(text, uuid, uuid, public.record_kind, bigint, date, text, text) to authenticated;
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
grant execute on function public.add_goal_movement(text, uuid, text, bigint, date, text) to authenticated;
grant execute on function public.update_goal_movement(text, uuid, integer, bigint, date, text) to authenticated;
grant execute on function public.delete_goal_movement(text, uuid, integer) to authenticated;
