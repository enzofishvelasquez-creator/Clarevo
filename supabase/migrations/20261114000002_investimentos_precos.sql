-- Preço público dos títulos do Tesouro e cota dos fundos (quantidade e CNPJ na ficha) e meta que lê o valor dos investimentos ligados
-- (D-099, itens 19, 20 e 13 fase 2; 14/11/2026; 0037). docs/45_INVESTIMENTOS.md, seções 9 e 10. Nada aqui recomenda investimento.
--
-- Q1. Quantidade de títulos ou de cotas, em milionésimos (1 a 10^15), só em títulos públicos e fundos; CNPJ do fundo só em fundos (14
--     caracteres, numérico ou alfanumérico, com os dígitos verificadores conferidos). Viajam na ficha ("quantity_micro" e "fund_cnpj" no
--     p_details de create_investment e update_investment, que mudam só por dentro, com a mesma assinatura). Sem a ficha ou sem a chave
--     (versão anterior do app), ficam como estavam, se o tipo ainda os aceita; nulo tira. Erros: 'quantidade_invalida', 'cnpj_invalido'.
-- Q2. O preço do título e a cota do fundo vêm da função "precos" (dados abertos do Tesouro Transparente e da CVM); o banco guarda só a
--     quantidade e o CNPJ, e o valor só é gravado quando a pessoa toca em "Usar este valor" (um movimento 'valor' comum).
-- V1. Uma meta do Pessoal pode ler o valor guardado dos investimentos ligados (goals.value_source = 'investimentos'): o valor guardado da
--     meta passa a ser a soma do valor de hoje dos investimentos ativos ligados a ela. Os movimentos da meta continuam guardados e voltam a
--     contar com 'registros'. set_goal_value_source grava a escolha (operação 'origem_valor_meta', a meta no alvo; conta como anotação).
--     Na Família, 'contexto_invalido' (investimentos ficam só no Pessoal); outra origem, 'origem_invalida'.

-- ---------------------------------------------------------------------------
-- Quantidade e CNPJ do fundo (Q1)
-- ---------------------------------------------------------------------------

-- CNPJ com dígitos verificadores (numérico ou alfanumérico: o valor de cada caractere é o código dele menos 48), como cnpjValid de nota.ts.
create or replace function public.clarevo_cnpj_valid(p text)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
declare
  w1 integer[] := array[5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  w2 integer[] := array[6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  s integer;
  r integer;
  d1 integer;
  d2 integer;
begin
  if p is null or p !~ '^[0-9A-Z]{12}[0-9]{2}$' or p ~ '^(.)\1{13}$' then
    return false;
  end if;
  s := 0;
  for i in 1..12 loop
    s := s + (ascii(substr(p, i, 1)) - 48) * w1[i];
  end loop;
  r := s % 11;
  d1 := case when r < 2 then 0 else 11 - r end;
  s := 0;
  for i in 1..12 loop
    s := s + (ascii(substr(p, i, 1)) - 48) * w2[i];
  end loop;
  s := s + d1 * w2[13];
  r := s % 11;
  d2 := case when r < 2 then 0 else 11 - r end;
  return d1 = ascii(substr(p, 13, 1)) - 48 and d2 = ascii(substr(p, 14, 1)) - 48;
end;
$$;

alter table public.investments add column quantity_micro bigint;
alter table public.investments add column fund_cnpj text;
alter table public.investments add constraint investments_quantity_rule check (
  quantity_micro is null or (quantity_micro between 1 and 1000000000000000 and kind in ('titulos_publicos', 'fundos')));
alter table public.investments add constraint investments_fund_cnpj_rule check (
  fund_cnpj is null or (kind = 'fundos' and public.clarevo_cnpj_valid(fund_cnpj)));

-- A quantidade da ficha: sem a ficha ou sem a chave, a de antes (p_keep), se o tipo aceita quantidade; com a chave, nula ou um inteiro.
create or replace function public.clarevo_investment_quantity(p_kind text, p_details jsonb, p_keep bigint)
returns bigint
language plpgsql
immutable
set search_path = public
as $$
declare
  v_t text;
  v bigint;
begin
  if p_details is null or jsonb_typeof(p_details) <> 'object' or not (p_details ? 'quantity_micro') then
    return case when p_kind in ('titulos_publicos', 'fundos') then p_keep else null end;
  end if;
  if coalesce(jsonb_typeof(p_details -> 'quantity_micro'), 'null') = 'null' then
    return null;
  end if;
  v_t := p_details ->> 'quantity_micro';
  if jsonb_typeof(p_details -> 'quantity_micro') <> 'number' or v_t !~ '^[0-9]{1,16}$' then
    raise exception 'quantidade_invalida' using errcode = '22023';
  end if;
  v := v_t::bigint;
  if v < 1 or v > 1000000000000000 or p_kind not in ('titulos_publicos', 'fundos') then
    raise exception 'quantidade_invalida' using errcode = '22023';
  end if;
  return v;
end;
$$;

-- O CNPJ do fundo da ficha: sem a ficha ou sem a chave, o de antes (p_keep), se o tipo é fundos; com a chave, nulo ou um CNPJ válido.
create or replace function public.clarevo_investment_fund_cnpj(p_kind text, p_details jsonb, p_keep text)
returns text
language plpgsql
immutable
set search_path = public
as $$
begin
  if p_details is null or jsonb_typeof(p_details) <> 'object' or not (p_details ? 'fund_cnpj') then
    return case when p_kind = 'fundos' then p_keep else null end;
  end if;
  if coalesce(jsonb_typeof(p_details -> 'fund_cnpj'), 'null') = 'null' then
    return null;
  end if;
  if jsonb_typeof(p_details -> 'fund_cnpj') <> 'string' or p_kind <> 'fundos' or not public.clarevo_cnpj_valid(p_details ->> 'fund_cnpj') then
    raise exception 'cnpj_invalido' using errcode = '22023';
  end if;
  return p_details ->> 'fund_cnpj';
end;
$$;

-- A visão ganha a quantidade e o CNPJ no fim (as colunas de antes ficam na mesma ordem).
create or replace view public.investment_items with (security_invoker = true) as
select i.id, i.context_id, i.name, i.kind, i.status, i.created_by, i.version, i.created_at, i.updated_at,
       a.deposits as deposits_cents, a.withdrawals as withdrawals_cents, a.income as income_cents,
       (coalesce(s.amount_cents, 0) + f.flows)::bigint as value_cents,
       s.occurred_on as last_value_on, a.first_on as first_movement_on,
       i.subkind, i.institution, i.index_kind, i.rate_bp, i.maturity_on, i.liquidity, i.liquidity_on, i.liquidity_days,
       (select g.id from public.goals g where g.id = i.goal_id and g.deleted_at is null) as goal_id,
       i.quantity_micro, i.fund_cnpj
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
comment on view public.investment_items is 'Investimentos com o aportado, o resgatado, os rendimentos recebidos, o valor de hoje (D-093), a ficha ampliada, a meta ligada, a quantidade e o CNPJ do fundo (D-099).';

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
  v_goal := public.clarevo_investment_goal(p_context_id, p_details, null);
  perform public.clarevo_check_investment_limit(p_context_id);

  insert into public.investments (context_id, name, kind, created_by, subkind, institution, index_kind, rate_bp, maturity_on, liquidity,
                                  liquidity_on, liquidity_days, goal_id, quantity_micro, fund_cnpj)
  values (p_context_id, v_name, p_kind, v_uid, v_d ->> 'subkind', v_d ->> 'institution', v_d ->> 'index_kind', (v_d ->> 'rate_bp')::integer,
          (v_d ->> 'maturity_on')::date, v_d ->> 'liquidity', (v_d ->> 'liquidity_on')::date, (v_d ->> 'liquidity_days')::integer, v_goal, v_qty, v_cnpj)
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
  -- A meta ligada (0036): sem a ficha, fica a de antes (se a meta continuar valendo); com a ficha, a que veio nela.
  v_goal := public.clarevo_investment_goal(v_i.context_id, p_details, v_i.goal_id);
  update public.investments
     set name = v_name, kind = p_kind, subkind = v_d ->> 'subkind', institution = v_d ->> 'institution', index_kind = v_d ->> 'index_kind',
         rate_bp = (v_d ->> 'rate_bp')::integer, maturity_on = (v_d ->> 'maturity_on')::date, liquidity = v_d ->> 'liquidity',
         liquidity_on = (v_d ->> 'liquidity_on')::date, liquidity_days = (v_d ->> 'liquidity_days')::integer, goal_id = v_goal,
         quantity_micro = v_qty, fund_cnpj = v_cnpj, version = version + 1
   where id = v_i.id;
  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id, target_id)
  values (v_uid, p_key, 'alterar_investimento', v_i.context_id, v_hash, null, null, v_i.id);
  return public.clarevo_investment_result(v_i.id, null);
end;
$$;

-- ---------------------------------------------------------------------------
-- Meta que lê o valor dos investimentos ligados (V1)
-- ---------------------------------------------------------------------------

alter table public.goals add column value_source text not null default 'registros' check (value_source in ('registros', 'investimentos'));

-- O valor guardado: com 'investimentos', a soma do valor de hoje dos investimentos ativos ligados; com 'registros', os movimentos da meta.
create or replace view public.goal_items with (security_invoker = true) as
select g.id, g.context_id, g.goal_type, g.name, g.target_cents, g.target_month, g.planned_monthly_cents,
       g.essential_base_cents, g.essential_months, g.essential_base_source, g.status, g.created_by, g.version,
       g.created_at, g.updated_at,
       case when g.value_source = 'investimentos'
            then (select coalesce(sum(x.value_cents), 0) from public.investment_items x where x.goal_id = g.id and x.status = 'ativo')::bigint
            else (a.initial + a.deposits + a.income + a.appreciation - a.withdrawals - a.depreciation) end as saved_cents,
       a.initial as initial_cents, a.deposits as deposits_cents, a.withdrawals as withdrawals_cents,
       a.income as income_cents, a.appreciation as appreciation_cents, a.depreciation as depreciation_cents,
       a.last_on as last_movement_on,
       g.priority, g.value_source
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

-- O retorno das funções de metas, com a mesma regra do valor guardado.
create or replace function public.clarevo_goal_json(p_goal_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select to_jsonb(g) || jsonb_build_object(
           'saved_cents', case when g.value_source = 'investimentos'
                               then (select coalesce(sum(x.value_cents), 0) from public.investment_items x where x.goal_id = g.id and x.status = 'ativo')::bigint
                               else a.initial + a.deposits + a.income + a.appreciation - a.withdrawals - a.depreciation end,
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

create or replace function public.set_goal_value_source(p_key text, p_goal_id uuid, p_expected_version integer, p_source text)
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
  perform public.clarevo_check_key(p_key);
  v_hash := md5(jsonb_build_array('origem_valor_meta', p_goal_id, p_expected_version, p_source)::text);
  perform pg_advisory_xact_lock(hashtext('op:' || v_uid::text || ':' || p_key));
  select * into v_op from public.record_operations where actor_id = v_uid and idempotency_key = p_key;
  if found then
    if v_op.action <> 'origem_valor_meta' or v_op.request_hash <> v_hash then
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
  if p_source is null or p_source not in ('registros', 'investimentos') then
    raise exception 'origem_invalida' using errcode = '22023';
  end if;
  if p_source = 'investimentos' and not exists (select 1 from public.financial_contexts c where c.id = v_g.context_id and c.kind = 'pessoal') then
    raise exception 'contexto_invalido' using errcode = '22023';
  end if;

  update public.goals set value_source = p_source, version = version + 1 where id = v_g.id
  returning * into v_g;
  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id, target_id)
  values (v_uid, p_key, 'origem_valor_meta', v_g.context_id, v_hash, null, null, v_g.id);
  return public.clarevo_goal_result(v_g.id, null);
end;
$$;

-- ---------------------------------------------------------------------------
-- Operações: a lista vigente (a da 0036) mais 'origem_valor_meta', com a meta no alvo.
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
  'origem_valor_meta'));
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
-- Privilégios: as visões, a função da origem do valor para o app; auxiliares fechados.
-- ---------------------------------------------------------------------------
revoke all on public.investment_items from anon, authenticated;
grant select on public.investment_items to authenticated;
revoke all on public.goal_items from anon, authenticated;
grant select on public.goal_items to authenticated;
revoke all on function public.clarevo_cnpj_valid(text) from public, anon, authenticated, service_role;
revoke all on function public.clarevo_investment_quantity(text, jsonb, bigint) from public, anon, authenticated, service_role;
revoke all on function public.clarevo_investment_fund_cnpj(text, jsonb, text) from public, anon, authenticated, service_role;
revoke all on function public.set_goal_value_source(text, uuid, integer, text) from public, anon;
grant execute on function public.set_goal_value_source(text, uuid, integer, text) to authenticated;
