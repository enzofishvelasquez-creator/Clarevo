-- Taxa com data de fim e condição, e descrição livre dos investimentos (D-104, itens 12 e 13; 17/11/2026; 0039). docs/45_INVESTIMENTOS.md.
-- Nada aqui recomenda investimento: a pessoa registra a taxa e a condição como estão no contrato ou na oferta.
--
-- Regras (repetidas em packages/core/src/investment-details.ts):
-- T1. rate_until (data) e rate_after_bp (centésimos de ponto percentual): até a data, inclusive, vale rate_bp; do dia seguinte em diante,
--     rate_after_bp, com a mesma forma de render e os mesmos limites de rate_bp (F2 da 0035). Os dois juntos ou nenhum, só com forma de
--     render que tem taxa (cdi, selic, ipca, prefixado), com a data entre 01/01/1990 e 31/12/2100 ('taxa_condicional_invalida').
-- T2. rate_condition: a condição da taxa, de 1 a 60 caracteres, sem espaços nas pontas nem repetidos, só com forma de render que tem taxa
--     ('condicao_invalida').
-- T3. description: o que é o investimento, do jeito da pessoa, de 1 a 120 caracteres, sem espaços nas pontas nem repetidos, em qualquer
--     tipo ('descricao_investimento_invalida'). Serve para o tipo "Outro" (previdência e o que o formulário não cobre) e para os demais.
-- T4. Viajam na ficha ("rate_until", "rate_after_bp", "rate_condition" e "description" no p_details de create_investment e update_investment,
--     que mudam só por dentro, com a mesma assinatura: um app anterior continua funcionando com este banco). Sem a ficha ou sem a chave
--     (versão anterior do app), ficam como estavam: a taxa com data de fim e a condição, se a forma de render continua a mesma e com taxa;
--     a descrição, sempre. Nulo tira. "rate_until" e "rate_after_bp" andam juntos: basta uma das duas chaves para valer o par que veio (a
--     que falta conta como nula). A ordem dos erros é a do núcleo: a ficha da 0035, a quantidade e o CNPJ da 0037, depois T1, T2 e T3.
-- T5. A visão investment_items ganha as quatro colunas no fim (as de antes ficam na mesma ordem). O app novo lê as colunas que existirem
--     (num banco ainda sem esta migração elas faltam e ficam vazias) e manda as chaves na ficha (um banco sem esta migração as ignora:
--     clarevo_validate_investment_details não lê chaves que não conhece).
--
-- Duas funções novas, auxiliares, sem execute para ninguém com sessão (clarevo_investment_rate_step e clarevo_investment_description): a lista
-- de funções que o app executa continua com 107.

alter table public.investments
  add column rate_until date,
  add column rate_after_bp integer,
  add column rate_condition text,
  add column description text;

-- As regras ficam dentro de coalesce(..., false): uma regra nula passaria (o check aceita nulo).
alter table public.investments add constraint investments_rate_step_rule check (coalesce((
  (rate_until is null and rate_after_bp is null)
  or (rate_until between date '1990-01-01' and date '2100-12-31' and (
       (index_kind = 'cdi' and rate_after_bp between 1 and 50000)
       or (index_kind = 'selic' and rate_after_bp between -500 and 2000)
       or (index_kind = 'ipca' and rate_after_bp between -500 and 3000)
       or (index_kind = 'prefixado' and rate_after_bp between 1 and 10000)))), false));
alter table public.investments add constraint investments_rate_condition_rule check (coalesce((
  rate_condition is null
  or (char_length(rate_condition) between 1 and 60 and rate_condition = btrim(rate_condition) and rate_condition !~ '\s{2,}'
      and index_kind in ('cdi', 'selic', 'ipca', 'prefixado'))), false));
alter table public.investments add constraint investments_description_rule check (coalesce((
  description is null or (char_length(description) between 1 and 120 and description = btrim(description) and description !~ '\s{2,}')), false));

-- ---------------------------------------------------------------------------
-- Leitura da ficha (T1, T2 e T4)
-- ---------------------------------------------------------------------------

-- A taxa com data de fim e a condição: p_index é a forma de render que vai ser gravada; p_keep_* são os valores de antes (nulos ao criar).
create or replace function public.clarevo_investment_rate_step(p_index text, p_details jsonb, p_keep_index text, p_keep_until date,
                                                               p_keep_after integer, p_keep_condition text)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  d jsonb := case when p_details is not null and jsonb_typeof(p_details) = 'object' then p_details end;
  v_has_rate boolean := coalesce(p_index in ('cdi', 'selic', 'ipca', 'prefixado'), false);
  v_same boolean;
  v_until date;
  v_after integer;
  v_cond text;
  v_t text;
begin
  v_same := v_has_rate and p_index is not distinct from p_keep_index;

  -- O par data de fim e taxa de depois: sem as duas chaves, o de antes (se a forma de render é a mesma e tem taxa).
  if d is null or not (d ? 'rate_until' or d ? 'rate_after_bp') then
    if v_same then
      v_until := p_keep_until;
      v_after := p_keep_after;
    end if;
  else
    if jsonb_typeof(d -> 'rate_until') = 'string' then
      v_t := d ->> 'rate_until';
      if v_t !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
        raise exception 'taxa_condicional_invalida' using errcode = '22023';
      end if;
      begin
        v_until := v_t::date;
      exception when others then
        raise exception 'taxa_condicional_invalida' using errcode = '22023';
      end;
    elsif coalesce(jsonb_typeof(d -> 'rate_until'), 'null') <> 'null' then
      raise exception 'taxa_condicional_invalida' using errcode = '22023';
    end if;
    if jsonb_typeof(d -> 'rate_after_bp') = 'number' then
      v_t := d ->> 'rate_after_bp';
      if v_t !~ '^-?[0-9]{1,6}$' then
        raise exception 'taxa_condicional_invalida' using errcode = '22023';
      end if;
      v_after := v_t::integer;
    elsif coalesce(jsonb_typeof(d -> 'rate_after_bp'), 'null') <> 'null' then
      raise exception 'taxa_condicional_invalida' using errcode = '22023';
    end if;
  end if;
  if v_until is not null or v_after is not null then
    -- coalesce: com um dos dois nulo, a comparação é nula e o "not" de um nulo não recusaria.
    if not coalesce(v_until between date '1990-01-01' and date '2100-12-31'
         and ((p_index = 'cdi' and v_after between 1 and 50000)
              or (p_index = 'selic' and v_after between -500 and 2000)
              or (p_index = 'ipca' and v_after between -500 and 3000)
              or (p_index = 'prefixado' and v_after between 1 and 10000)), false) then
      raise exception 'taxa_condicional_invalida' using errcode = '22023';
    end if;
  end if;

  -- A condição: sem a chave, a de antes (se a forma de render é a mesma e tem taxa); texto sem espaços sobrando, como a instituição.
  if d is null or not (d ? 'rate_condition') then
    if v_same then
      v_cond := p_keep_condition;
    end if;
  elsif jsonb_typeof(d -> 'rate_condition') = 'string' then
    v_cond := nullif(btrim(regexp_replace(d ->> 'rate_condition', '\s+', ' ', 'g')), '');
    if v_cond is not null and (char_length(v_cond) > 60 or not v_has_rate) then
      raise exception 'condicao_invalida' using errcode = '22023';
    end if;
  elsif coalesce(jsonb_typeof(d -> 'rate_condition'), 'null') <> 'null' then
    raise exception 'condicao_invalida' using errcode = '22023';
  end if;

  return jsonb_build_object('rate_until', v_until, 'rate_after_bp', v_after, 'rate_condition', v_cond);
end;
$$;

-- A descrição (T3): sem a ficha ou sem a chave, a de antes; nula tira; texto sem espaços sobrando.
create or replace function public.clarevo_investment_description(p_details jsonb, p_keep text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v text;
begin
  if p_details is null or jsonb_typeof(p_details) <> 'object' or not (p_details ? 'description') then
    return p_keep;
  end if;
  if coalesce(jsonb_typeof(p_details -> 'description'), 'null') = 'null' then
    return null;
  end if;
  if jsonb_typeof(p_details -> 'description') <> 'string' then
    raise exception 'descricao_investimento_invalida' using errcode = '22023';
  end if;
  v := nullif(btrim(regexp_replace(p_details ->> 'description', '\s+', ' ', 'g')), '');
  if v is not null and char_length(v) > 120 then
    raise exception 'descricao_investimento_invalida' using errcode = '22023';
  end if;
  return v;
end;
$$;

-- ---------------------------------------------------------------------------
-- A visão (T5): as quatro colunas no fim
-- ---------------------------------------------------------------------------
create or replace view public.investment_items with (security_invoker = true) as
select i.id, i.context_id, i.name, i.kind, i.status, i.created_by, i.version, i.created_at, i.updated_at,
       a.deposits as deposits_cents, a.withdrawals as withdrawals_cents, a.income as income_cents,
       (coalesce(s.amount_cents, 0) + f.flows)::bigint as value_cents,
       s.occurred_on as last_value_on, a.first_on as first_movement_on,
       i.subkind, i.institution, i.index_kind, i.rate_bp, i.maturity_on, i.liquidity, i.liquidity_on, i.liquidity_days,
       (select g.id from public.goals g where g.id = i.goal_id and g.deleted_at is null) as goal_id,
       i.quantity_micro, i.fund_cnpj,
       i.rate_until, i.rate_after_bp, i.rate_condition, i.description
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
comment on view public.investment_items is 'Investimentos com o aportado, o resgatado, os rendimentos recebidos, o valor de hoje (D-093), a ficha ampliada, a meta ligada, a quantidade e o CNPJ do fundo (D-099), a taxa com data de fim, a condição da taxa e a descrição (D-104).';

-- ---------------------------------------------------------------------------
-- As duas funções de escrita (T4): a mesma assinatura da 0037
-- ---------------------------------------------------------------------------

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
  v_qty bigint;
  v_cnpj text;
  v_step jsonb;
  v_desc text;
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
  v_qty := public.clarevo_investment_quantity(p_kind, p_details, null);
  v_cnpj := public.clarevo_investment_fund_cnpj(p_kind, p_details, null);
  v_step := public.clarevo_investment_rate_step(v_d ->> 'index_kind', p_details, null, null, null, null);
  v_desc := public.clarevo_investment_description(p_details, null);
  v_goal := public.clarevo_investment_goal(p_context_id, p_details, null);
  perform public.clarevo_check_investment_limit(p_context_id);

  insert into public.investments (context_id, name, kind, created_by, subkind, institution, index_kind, rate_bp, maturity_on, liquidity,
                                  liquidity_on, liquidity_days, goal_id, quantity_micro, fund_cnpj, rate_until, rate_after_bp, rate_condition,
                                  description)
  values (p_context_id, v_name, p_kind, v_uid, v_d ->> 'subkind', v_d ->> 'institution', v_d ->> 'index_kind', (v_d ->> 'rate_bp')::integer,
          (v_d ->> 'maturity_on')::date, v_d ->> 'liquidity', (v_d ->> 'liquidity_on')::date, (v_d ->> 'liquidity_days')::integer, v_goal, v_qty, v_cnpj,
          (v_step ->> 'rate_until')::date, (v_step ->> 'rate_after_bp')::integer, v_step ->> 'rate_condition', v_desc)
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
  v_qty bigint;
  v_cnpj text;
  v_step jsonb;
  v_desc text;
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
  -- Quantidade e CNPJ (0037): sem a ficha ou sem a chave, os de antes, se o tipo ainda os aceita; com a chave, os que vieram.
  v_qty := public.clarevo_investment_quantity(p_kind, p_details, v_i.quantity_micro);
  v_cnpj := public.clarevo_investment_fund_cnpj(p_kind, p_details, v_i.fund_cnpj);
  -- Taxa com data de fim, condição e descrição (0039): sem a ficha ou sem a chave, as de antes (a taxa e a condição só com a mesma forma de
  -- render, com taxa); com a chave, as que vieram.
  v_step := public.clarevo_investment_rate_step(v_d ->> 'index_kind', p_details, v_i.index_kind, v_i.rate_until, v_i.rate_after_bp, v_i.rate_condition);
  v_desc := public.clarevo_investment_description(p_details, v_i.description);
  -- A meta ligada (0036): sem a ficha, fica a de antes (se a meta continuar valendo); com a ficha, a que veio nela.
  v_goal := public.clarevo_investment_goal(v_i.context_id, p_details, v_i.goal_id);
  update public.investments
     set name = v_name, kind = p_kind, subkind = v_d ->> 'subkind', institution = v_d ->> 'institution', index_kind = v_d ->> 'index_kind',
         rate_bp = (v_d ->> 'rate_bp')::integer, maturity_on = (v_d ->> 'maturity_on')::date, liquidity = v_d ->> 'liquidity',
         liquidity_on = (v_d ->> 'liquidity_on')::date, liquidity_days = (v_d ->> 'liquidity_days')::integer, goal_id = v_goal,
         quantity_micro = v_qty, fund_cnpj = v_cnpj, rate_until = (v_step ->> 'rate_until')::date, rate_after_bp = (v_step ->> 'rate_after_bp')::integer,
         rate_condition = v_step ->> 'rate_condition', description = v_desc, version = version + 1
   where id = v_i.id;
  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id, target_id)
  values (v_uid, p_key, 'alterar_investimento', v_i.context_id, v_hash, null, null, v_i.id);
  return public.clarevo_investment_result(v_i.id, null);
end;
$$;

-- ---------------------------------------------------------------------------
-- Privilégios: a visão para o app; as duas auxiliares fechadas. create_investment e update_investment mantêm os privilégios (mesma assinatura).
-- ---------------------------------------------------------------------------
revoke all on public.investment_items from anon, authenticated;
grant select on public.investment_items to authenticated;
revoke all on function public.clarevo_investment_rate_step(text, jsonb, text, date, integer, text) from public, anon, authenticated, service_role;
revoke all on function public.clarevo_investment_description(jsonb, text) from public, anon, authenticated, service_role;
