-- Ficha ampliada dos investimentos (D-099, 13/11/2026; 0035). Campos opcionais que dizem o que é cada investimento: o tipo exato (com os
-- nomes oficiais dos títulos públicos no app), onde está, como rende, a taxa contratada, o vencimento e quando pode resgatar; e o tipo do
-- rendimento recebido (juros ou cupom, dividendos, JCP, rendimento de FII ou outro). Com eles o app deduz a regra de imposto e a garantia,
-- divide a carteira, lista vencimentos, soma o FGC por instituição e estima o valor pela taxa contratada (packages/core/src/investment-*.ts,
-- docs/49_ESTUDO_INVESTIMENTOS.md). Nada aqui recomenda investimento.
--
-- Regras (repetidas em packages/core/src/investment-details.ts):
-- F1. Tudo é opcional. O tipo exato pertence ao tipo ('subtipo_invalido'); a instituição tem de 1 a 40 caracteres, sem espaços nas pontas
--     nem repetidos ('instituicao_invalida'); como rende vem da lista ('rendimento_invalido').
-- F2. A taxa (centésimos de ponto percentual) só existe e é obrigatória com % do CDI (1 a 50000), Selic mais taxa (-500 a 2000), IPCA mais
--     taxa (-500 a 3000) e prefixado (1 a 10000) ('taxa_invalida').
-- F3. Vencimento e liberação entre 01/01/1990 e 31/12/2100 ('vencimento_invalido', 'liquidez_invalida'). "A partir de uma data" pede a
--     data; "alguns dias depois do pedido" pede de 1 a 1800 dias; as outras não levam nenhum dos dois ('liquidez_invalida').
-- F4. O tipo do rendimento só existe no movimento 'rendimento' ('tipo_rendimento_invalido').
-- F5. Editar o investimento grava a ficha inteira (sem ficha, os campos ficam vazios), como o app envia.
--
-- As quatro funções de escrita que mudam ganham um parâmetro no fim, com valor padrão: as chamadas de antes continuam valendo. As funções
-- antigas saem (a lista de funções do app continua com 103).

alter table public.investments
  add column subkind text,
  add column institution text check (institution is null or (char_length(institution) between 1 and 40 and institution = btrim(institution))),
  add column index_kind text check (index_kind is null or index_kind in ('cdi', 'selic', 'ipca', 'prefixado', 'poupanca', 'variavel')),
  add column rate_bp integer,
  add column maturity_on date check (maturity_on is null or maturity_on between date '1990-01-01' and date '2100-12-31'),
  add column liquidity text check (liquidity is null or liquidity in ('diaria', 'dias', 'a_partir_de', 'no_vencimento')),
  add column liquidity_on date check (liquidity_on is null or liquidity_on between date '1990-01-01' and date '2100-12-31'),
  add column liquidity_days integer;

-- As três regras ficam dentro de coalesce(..., false): uma regra nula passaria (o check aceita nulo).
alter table public.investments add constraint investments_subkind_rule check (coalesce((
  subkind is null
  or (kind = 'renda_fixa' and subkind in ('poupanca', 'cdb', 'lc', 'lci', 'lca', 'lcd', 'lig', 'debenture', 'debenture_incentivada', 'cri', 'cra', 'coe'))
  or (kind = 'titulos_publicos' and subkind in ('tesouro_selic', 'tesouro_prefixado', 'tesouro_prefixado_juros', 'tesouro_ipca', 'tesouro_ipca_juros',
                                                'tesouro_renda', 'tesouro_educa', 'tesouro_reserva'))
  or (kind = 'fundos' and subkind in ('fundo_renda_fixa', 'fundo_multimercado', 'fundo_acoes', 'fii', 'fiagro', 'etf'))
  or (kind = 'acoes' and subkind in ('acao', 'bdr'))
  or (kind = 'previdencia' and subkind in ('pgbl', 'vgbl'))), false));
alter table public.investments add constraint investments_rate_rule check (coalesce((
  (index_kind = 'cdi' and rate_bp is not null and rate_bp between 1 and 50000)
  or (index_kind = 'selic' and rate_bp is not null and rate_bp between -500 and 2000)
  or (index_kind = 'ipca' and rate_bp is not null and rate_bp between -500 and 3000)
  or (index_kind = 'prefixado' and rate_bp is not null and rate_bp between 1 and 10000)
  or ((index_kind is null or index_kind in ('poupanca', 'variavel')) and rate_bp is null)), false));
alter table public.investments add constraint investments_liquidity_rule check (coalesce((
  (liquidity = 'a_partir_de' and liquidity_on is not null and liquidity_days is null)
  or (liquidity = 'dias' and liquidity_days is not null and liquidity_days between 1 and 1800 and liquidity_on is null)
  or ((liquidity is null or liquidity in ('diaria', 'no_vencimento')) and liquidity_on is null and liquidity_days is null)), false));

alter table public.investment_movements
  add column income_kind text check (income_kind is null or (kind = 'rendimento' and income_kind in ('juros', 'dividendo', 'jcp', 'fii', 'outro')));

-- A visão ganha as colunas da ficha no fim (as de antes ficam na mesma ordem).
create or replace view public.investment_items with (security_invoker = true) as
select i.id, i.context_id, i.name, i.kind, i.status, i.created_by, i.version, i.created_at, i.updated_at,
       a.deposits as deposits_cents, a.withdrawals as withdrawals_cents, a.income as income_cents,
       (coalesce(s.amount_cents, 0) + f.flows)::bigint as value_cents,
       s.occurred_on as last_value_on, a.first_on as first_movement_on,
       i.subkind, i.institution, i.index_kind, i.rate_bp, i.maturity_on, i.liquidity, i.liquidity_on, i.liquidity_days
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
comment on view public.investment_items is 'Investimentos com o aportado, o resgatado, os rendimentos recebidos, o valor de hoje (D-093) e a ficha ampliada (D-099).';

-- ---------------------------------------------------------------------------
-- Validação da ficha (sem execute para authenticated)
-- ---------------------------------------------------------------------------

-- Lê a ficha enviada pelo app ({"subkind": ..., "institution": ..., "index_kind": ..., "rate_bp": ..., "maturity_on": "AAAA-MM-DD",
-- "liquidity": ..., "liquidity_on": "AAAA-MM-DD", "liquidity_days": ...}; chaves ausentes ou nulas ficam vazias; chaves desconhecidas são
-- ignoradas) e devolve a ficha normalizada, ou o erro do primeiro campo inválido (F1 a F3).
create or replace function public.clarevo_validate_investment_details(p_kind text, p_details jsonb)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  d jsonb := coalesce(p_details, '{}'::jsonb);
  v_sub text;
  v_inst text;
  v_index text;
  v_rate integer;
  v_mat date;
  v_liq text;
  v_liq_on date;
  v_days integer;
  v_t text;
begin
  if jsonb_typeof(d) <> 'object' then
    raise exception 'subtipo_invalido' using errcode = '22023';
  end if;

  if jsonb_typeof(d -> 'subkind') = 'string' then
    v_sub := d ->> 'subkind';
    if not coalesce(case p_kind
        when 'renda_fixa' then v_sub in ('poupanca', 'cdb', 'lc', 'lci', 'lca', 'lcd', 'lig', 'debenture', 'debenture_incentivada', 'cri', 'cra', 'coe')
        when 'titulos_publicos' then v_sub in ('tesouro_selic', 'tesouro_prefixado', 'tesouro_prefixado_juros', 'tesouro_ipca', 'tesouro_ipca_juros',
                                               'tesouro_renda', 'tesouro_educa', 'tesouro_reserva')
        when 'fundos' then v_sub in ('fundo_renda_fixa', 'fundo_multimercado', 'fundo_acoes', 'fii', 'fiagro', 'etf')
        when 'acoes' then v_sub in ('acao', 'bdr')
        when 'previdencia' then v_sub in ('pgbl', 'vgbl')
        else false end, false) then
      raise exception 'subtipo_invalido' using errcode = '22023';
    end if;
  elsif coalesce(jsonb_typeof(d -> 'subkind'), 'null') <> 'null' then
    raise exception 'subtipo_invalido' using errcode = '22023';
  end if;

  if jsonb_typeof(d -> 'institution') = 'string' then
    v_inst := nullif(btrim(regexp_replace(d ->> 'institution', '\s+', ' ', 'g')), '');
    if v_inst is not null and char_length(v_inst) > 40 then
      raise exception 'instituicao_invalida' using errcode = '22023';
    end if;
  elsif coalesce(jsonb_typeof(d -> 'institution'), 'null') <> 'null' then
    raise exception 'instituicao_invalida' using errcode = '22023';
  end if;

  if jsonb_typeof(d -> 'index_kind') = 'string' then
    v_index := d ->> 'index_kind';
    if v_index not in ('cdi', 'selic', 'ipca', 'prefixado', 'poupanca', 'variavel') then
      raise exception 'rendimento_invalido' using errcode = '22023';
    end if;
  elsif coalesce(jsonb_typeof(d -> 'index_kind'), 'null') <> 'null' then
    raise exception 'rendimento_invalido' using errcode = '22023';
  end if;

  if jsonb_typeof(d -> 'rate_bp') = 'number' then
    v_t := d ->> 'rate_bp';
    if v_t !~ '^-?[0-9]{1,6}$' then
      raise exception 'taxa_invalida' using errcode = '22023';
    end if;
    v_rate := v_t::integer;
  elsif coalesce(jsonb_typeof(d -> 'rate_bp'), 'null') <> 'null' then
    raise exception 'taxa_invalida' using errcode = '22023';
  end if;
  -- coalesce: com a taxa nula, a comparação é nula e o "not" de um nulo não recusaria.
  if not coalesce((v_index = 'cdi' and v_rate between 1 and 50000)
       or (v_index = 'selic' and v_rate between -500 and 2000)
       or (v_index = 'ipca' and v_rate between -500 and 3000)
       or (v_index = 'prefixado' and v_rate between 1 and 10000)
       or ((v_index is null or v_index in ('poupanca', 'variavel')) and v_rate is null), false) then
    raise exception 'taxa_invalida' using errcode = '22023';
  end if;

  if jsonb_typeof(d -> 'maturity_on') = 'string' then
    v_t := d ->> 'maturity_on';
    if v_t !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
      raise exception 'vencimento_invalido' using errcode = '22023';
    end if;
    begin
      v_mat := v_t::date;
    exception when others then
      raise exception 'vencimento_invalido' using errcode = '22023';
    end;
    if v_mat not between date '1990-01-01' and date '2100-12-31' then
      raise exception 'vencimento_invalido' using errcode = '22023';
    end if;
  elsif coalesce(jsonb_typeof(d -> 'maturity_on'), 'null') <> 'null' then
    raise exception 'vencimento_invalido' using errcode = '22023';
  end if;

  if jsonb_typeof(d -> 'liquidity') = 'string' then
    v_liq := d ->> 'liquidity';
    if v_liq not in ('diaria', 'dias', 'a_partir_de', 'no_vencimento') then
      raise exception 'liquidez_invalida' using errcode = '22023';
    end if;
  elsif coalesce(jsonb_typeof(d -> 'liquidity'), 'null') <> 'null' then
    raise exception 'liquidez_invalida' using errcode = '22023';
  end if;
  if jsonb_typeof(d -> 'liquidity_on') = 'string' then
    v_t := d ->> 'liquidity_on';
    if v_t !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
      raise exception 'liquidez_invalida' using errcode = '22023';
    end if;
    begin
      v_liq_on := v_t::date;
    exception when others then
      raise exception 'liquidez_invalida' using errcode = '22023';
    end;
    if v_liq_on not between date '1990-01-01' and date '2100-12-31' then
      raise exception 'liquidez_invalida' using errcode = '22023';
    end if;
  elsif coalesce(jsonb_typeof(d -> 'liquidity_on'), 'null') <> 'null' then
    raise exception 'liquidez_invalida' using errcode = '22023';
  end if;
  if jsonb_typeof(d -> 'liquidity_days') = 'number' then
    v_t := d ->> 'liquidity_days';
    if v_t !~ '^[0-9]{1,4}$' then
      raise exception 'liquidez_invalida' using errcode = '22023';
    end if;
    v_days := v_t::integer;
  elsif coalesce(jsonb_typeof(d -> 'liquidity_days'), 'null') <> 'null' then
    raise exception 'liquidez_invalida' using errcode = '22023';
  end if;
  if not coalesce((v_liq = 'a_partir_de' and v_liq_on is not null and v_days is null)
       or (v_liq = 'dias' and v_days between 1 and 1800 and v_liq_on is null)
       or ((v_liq is null or v_liq in ('diaria', 'no_vencimento')) and v_liq_on is null and v_days is null), false) then
    raise exception 'liquidez_invalida' using errcode = '22023';
  end if;

  return jsonb_build_object('subkind', v_sub, 'institution', v_inst, 'index_kind', v_index, 'rate_bp', v_rate, 'maturity_on', v_mat,
                            'liquidity', v_liq, 'liquidity_on', v_liq_on, 'liquidity_days', v_days);
end;
$$;

-- ---------------------------------------------------------------------------
-- As quatro funções que mudam (as outras três, sem mudança)
-- ---------------------------------------------------------------------------

drop function public.create_investment(text, uuid, text, text, bigint, date, bigint);
drop function public.update_investment(text, uuid, integer, text, text);
drop function public.add_investment_movement(text, uuid, text, bigint, date, text);
drop function public.update_investment_movement(text, uuid, integer, bigint, date, text);

create function public.create_investment(
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
  perform public.clarevo_check_investment_limit(p_context_id);

  insert into public.investments (context_id, name, kind, created_by, subkind, institution, index_kind, rate_bp, maturity_on, liquidity,
                                  liquidity_on, liquidity_days)
  values (p_context_id, v_name, p_kind, v_uid, v_d ->> 'subkind', v_d ->> 'institution', v_d ->> 'index_kind', (v_d ->> 'rate_bp')::integer,
          (v_d ->> 'maturity_on')::date, v_d ->> 'liquidity', (v_d ->> 'liquidity_on')::date, (v_d ->> 'liquidity_days')::integer)
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

create function public.update_investment(p_key text, p_id uuid, p_expected_version integer, p_name text, p_kind text, p_details jsonb default null)
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
  v_d := public.clarevo_validate_investment_details(p_kind, p_details);
  update public.investments
     set name = v_name, kind = p_kind, subkind = v_d ->> 'subkind', institution = v_d ->> 'institution', index_kind = v_d ->> 'index_kind',
         rate_bp = (v_d ->> 'rate_bp')::integer, maturity_on = (v_d ->> 'maturity_on')::date, liquidity = v_d ->> 'liquidity',
         liquidity_on = (v_d ->> 'liquidity_on')::date, liquidity_days = (v_d ->> 'liquidity_days')::integer, version = version + 1
   where id = v_i.id;
  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id, target_id)
  values (v_uid, p_key, 'alterar_investimento', v_i.context_id, v_hash, null, null, v_i.id);
  return public.clarevo_investment_result(v_i.id, null);
end;
$$;

create function public.add_investment_movement(
  p_key text,
  p_investment_id uuid,
  p_kind text,
  p_amount_cents bigint,
  p_occurred_on date,
  p_note text default null,
  p_income_kind text default null
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
  v_i public.investments%rowtype;
  v_m public.investment_movements%rowtype;
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  perform public.clarevo_check_key(p_key);
  v_hash := md5(jsonb_build_array('registrar_movimento_investimento', p_investment_id, p_kind, p_amount_cents, p_occurred_on, v_note, p_income_kind)::text);
  perform pg_advisory_xact_lock(hashtext('op:' || v_uid::text || ':' || p_key));
  select * into v_op from public.record_operations where actor_id = v_uid and idempotency_key = p_key;
  if found then
    if v_op.action <> 'registrar_movimento_investimento' or v_op.request_hash <> v_hash then
      raise exception 'chave_reutilizada' using errcode = 'PT409';
    end if;
    if not public.context_permission(v_op.context_id, 'read') then
      raise exception 'nao_encontrado' using errcode = 'P0002';
    end if;
    return public.clarevo_investment_result((select investment_id from public.investment_movements where id = v_op.target_id), v_op.target_id);
  end if;

  v_i := public.clarevo_lock_investment(p_investment_id);
  if v_i.status <> 'ativo' then
    raise exception 'investimento_encerrado' using errcode = 'PT409';
  end if;
  perform public.clarevo_validate_investment_movement(v_uid, p_kind, p_amount_cents, p_occurred_on, v_note);
  if p_income_kind is not null and (p_kind <> 'rendimento' or p_income_kind not in ('juros', 'dividendo', 'jcp', 'fii', 'outro')) then
    raise exception 'tipo_rendimento_invalido' using errcode = '22023';
  end if;
  insert into public.investment_movements (investment_id, context_id, kind, amount_cents, occurred_on, note, income_kind, created_by)
  values (v_i.id, v_i.context_id, p_kind, p_amount_cents, p_occurred_on, v_note, p_income_kind, v_uid)
  returning * into v_m;
  perform public.clarevo_require_investment_balance(v_i.id);
  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id, target_id)
  values (v_uid, p_key, 'registrar_movimento_investimento', v_i.context_id, v_hash, null, null, v_m.id);
  return public.clarevo_investment_result(v_i.id, v_m.id);
end;
$$;

create function public.update_investment_movement(
  p_key text,
  p_movement_id uuid,
  p_expected_version integer,
  p_amount_cents bigint,
  p_occurred_on date,
  p_note text default null,
  p_income_kind text default null
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
  v_m public.investment_movements%rowtype;
  v_i public.investments%rowtype;
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  perform public.clarevo_check_key(p_key);
  v_hash := md5(jsonb_build_array('alterar_movimento_investimento', p_movement_id, p_expected_version, p_amount_cents, p_occurred_on, v_note, p_income_kind)::text);
  perform pg_advisory_xact_lock(hashtext('op:' || v_uid::text || ':' || p_key));
  select * into v_op from public.record_operations where actor_id = v_uid and idempotency_key = p_key;
  if found then
    if v_op.action <> 'alterar_movimento_investimento' or v_op.request_hash <> v_hash then
      raise exception 'chave_reutilizada' using errcode = 'PT409';
    end if;
    if not public.context_permission(v_op.context_id, 'read') then
      raise exception 'nao_encontrado' using errcode = 'P0002';
    end if;
    return public.clarevo_investment_result((select investment_id from public.investment_movements where id = v_op.target_id), v_op.target_id);
  end if;

  select * into v_m from public.investment_movements where id = p_movement_id;
  if not found or not public.context_permission(v_m.context_id, 'read') then
    raise exception 'nao_encontrado' using errcode = 'P0002';
  end if;
  v_i := public.clarevo_lock_investment(v_m.investment_id);
  select * into v_m from public.investment_movements where id = p_movement_id for update;
  -- Excluído por outro pedido entre a primeira leitura e o bloqueio.
  if not found then
    raise exception 'nao_encontrado' using errcode = 'P0002';
  end if;
  if v_i.status <> 'ativo' then
    raise exception 'investimento_encerrado' using errcode = 'PT409';
  end if;
  if p_expected_version is distinct from v_m.version then
    raise exception 'versao_desatualizada' using errcode = 'PT409', detail = 'versao_atual=' || v_m.version;
  end if;
  perform public.clarevo_validate_investment_movement(v_uid, v_m.kind, p_amount_cents, p_occurred_on, v_note);
  if p_income_kind is not null and (v_m.kind <> 'rendimento' or p_income_kind not in ('juros', 'dividendo', 'jcp', 'fii', 'outro')) then
    raise exception 'tipo_rendimento_invalido' using errcode = '22023';
  end if;
  update public.investment_movements
     set amount_cents = p_amount_cents, occurred_on = p_occurred_on, note = v_note, income_kind = p_income_kind, version = version + 1
   where id = v_m.id;
  perform public.clarevo_require_investment_balance(v_i.id);
  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id, target_id)
  values (v_uid, p_key, 'alterar_movimento_investimento', v_i.context_id, v_hash, null, null, v_m.id);
  return public.clarevo_investment_result(v_i.id, v_m.id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Privilégios: a visão como antes; as quatro funções para o app; a validação fechada.
-- ---------------------------------------------------------------------------
revoke all on public.investment_items from anon, authenticated;
grant select on public.investment_items to authenticated;
revoke all on function public.clarevo_validate_investment_details(text, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.create_investment(text, uuid, text, text, bigint, date, bigint, jsonb) from public, anon;
revoke all on function public.update_investment(text, uuid, integer, text, text, jsonb) from public, anon;
revoke all on function public.add_investment_movement(text, uuid, text, bigint, date, text, text) from public, anon;
revoke all on function public.update_investment_movement(text, uuid, integer, bigint, date, text, text) from public, anon;
grant execute on function public.create_investment(text, uuid, text, text, bigint, date, bigint, jsonb) to authenticated;
grant execute on function public.update_investment(text, uuid, integer, text, text, jsonb) to authenticated;
grant execute on function public.add_investment_movement(text, uuid, text, bigint, date, text, text) to authenticated;
grant execute on function public.update_investment_movement(text, uuid, integer, bigint, date, text, text) to authenticated;
