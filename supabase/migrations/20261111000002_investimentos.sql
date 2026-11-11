-- Investimentos (D-093, 11/11/2026; 0032). Acompanhamento manual, só no Pessoal: a pessoa registra aportes, resgates, rendimentos
-- recebidos e o valor que vê no extrato; o app calcula o aportado, o valor, o ganho e a rentabilidade (packages/core/src/investments.ts,
-- docs/45_INVESTIMENTOS.md). Nada aqui recomenda investimento nem se liga a corretora.
--
-- Invariantes:
-- I1. O valor ao fim de cada dia nunca fica negativo. Valor ao fim de um dia: com uma atualização de valor ('valor') no dia, o valor
--     informado (já inclui os aportes e resgates do dia); sem atualização, o do dia anterior + aportes − resgates. Antes da primeira
--     atualização, o custo. Escrita que deixaria algum dia negativo: 'valor_insuficiente', com o dia no detalhe ('dia=AAAA-MM-DD').
-- I2. Só no Pessoal ('contexto_invalido' na Família) e no máximo 50 investimentos ativos por contexto ('limite_de_investimentos').
-- I3. Investimento encerrado não recebe, não altera nem exclui movimento ('investimento_encerrado'): reabrir primeiro.
-- I4. Só as sete funções gravam (sem insert, update nem delete diretos para o app); excluir apaga de vez (sem marca de excluído), o
--     investimento com os movimentos, e a repetição da chave devolve {"deleted": true}.
-- I5. Toda escrita grava a operação (record_operations), com o investimento ou o movimento como alvo, e conta como anotação.
-- I6. A exclusão da conta e o fim da Família apagam tudo pelo contexto (chaves estrangeiras em cascata a partir de financial_contexts).

create table public.investments (
  id uuid primary key default gen_random_uuid(),
  context_id uuid not null references public.financial_contexts (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40 and name = btrim(name)),
  kind text not null check (kind in ('renda_fixa', 'titulos_publicos', 'acoes', 'fundos', 'previdencia', 'cripto', 'outro')),
  status text not null default 'ativo' check (status in ('ativo', 'encerrado')),
  created_by uuid not null references public.persons (id),
  version integer not null default 1 check (version >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index investments_ctx on public.investments (context_id);
create index investments_created_by_fk_idx on public.investments (created_by);

create table public.investment_movements (
  id uuid primary key default gen_random_uuid(),
  investment_id uuid not null references public.investments (id) on delete cascade,
  context_id uuid not null references public.financial_contexts (id) on delete cascade,
  kind text not null check (kind in ('aporte', 'resgate', 'rendimento', 'valor')),
  amount_cents bigint not null check (amount_cents between 0 and 999999999 and (kind = 'valor' or amount_cents >= 1)),
  occurred_on date not null,
  note text check (note is null or (char_length(note) between 1 and 80 and note = btrim(note))),
  created_by uuid not null references public.persons (id),
  version integer not null default 1 check (version >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index investment_movements_inv on public.investment_movements (investment_id, occurred_on);
create index investment_movements_ctx on public.investment_movements (context_id);
create index investment_movements_created_by_fk_idx on public.investment_movements (created_by);

alter table public.investments enable row level security;
alter table public.investment_movements enable row level security;
create policy investments_read on public.investments for select to authenticated
  using (public.context_permission(context_id, 'read'));
create policy investment_movements_read on public.investment_movements for select to authenticated
  using (public.context_permission(context_id, 'read'));

-- Defesa adicional (I4): contexto, autoria e criação nunca mudam; versão + 1 por escrita; o tipo do movimento nunca muda.
create or replace function public.investments_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.id <> old.id or new.context_id <> old.context_id or new.created_by <> old.created_by
     or new.created_at <> old.created_at or new.version <> old.version + 1 then
    raise exception 'campo_imutavel' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger investments_guard before update on public.investments for each row execute function public.investments_guard();

create or replace function public.investment_movements_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.id <> old.id or new.investment_id <> old.investment_id or new.context_id <> old.context_id or new.kind <> old.kind
     or new.created_by <> old.created_by or new.created_at <> old.created_at or new.version <> old.version + 1 then
    raise exception 'campo_imutavel' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger investment_movements_guard before update on public.investment_movements
  for each row execute function public.investment_movements_guard();

-- Investimentos com os totais: aportado, resgatado, rendimentos, o valor de hoje (I1) e a data da última atualização.
create view public.investment_items with (security_invoker = true) as
select i.id, i.context_id, i.name, i.kind, i.status, i.created_by, i.version, i.created_at, i.updated_at,
       a.deposits as deposits_cents, a.withdrawals as withdrawals_cents, a.income as income_cents,
       (coalesce(s.amount_cents, 0) + f.flows)::bigint as value_cents,
       s.occurred_on as last_value_on, a.first_on as first_movement_on
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
comment on view public.investment_items is 'Investimentos com o aportado, o resgatado, os rendimentos recebidos e o valor de hoje (D-093).';

-- ---------------------------------------------------------------------------
-- Auxiliares (sem execute para authenticated)
-- ---------------------------------------------------------------------------

-- O primeiro dia em que o valor fica negativo (I1), ou nulo. No mesmo dia, aportes e resgates antes da atualização de valor.
create or replace function public.clarevo_investment_negative_day(p_id uuid)
returns date
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v bigint := 0;
  r record;
  prev date := null;
begin
  for r in select m.occurred_on, m.kind, m.amount_cents from public.investment_movements m
            where m.investment_id = p_id order by m.occurred_on, (m.kind = 'valor'), m.created_at, m.id loop
    if prev is not null and r.occurred_on <> prev and v < 0 then
      return prev;
    end if;
    v := case r.kind when 'valor' then r.amount_cents when 'aporte' then v + r.amount_cents when 'resgate' then v - r.amount_cents else v end;
    prev := r.occurred_on;
  end loop;
  if prev is not null and v < 0 then
    return prev;
  end if;
  return null;
end;
$$;

create or replace function public.clarevo_require_investment_balance(p_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_day date := public.clarevo_investment_negative_day(p_id);
begin
  if v_day is not null then
    raise exception 'valor_insuficiente' using errcode = 'PT409', detail = 'dia=' || to_char(v_day, 'YYYY-MM-DD');
  end if;
end;
$$;

-- Carrega para alteração sem revelar se existe para quem não pode ler; escrita no contexto.
create or replace function public.clarevo_lock_investment(p_id uuid)
returns public.investments
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_i public.investments%rowtype;
begin
  select * into v_i from public.investments where id = p_id for update;
  if not found or not public.context_permission(v_i.context_id, 'read') then
    raise exception 'nao_encontrado' using errcode = 'P0002';
  end if;
  if not public.context_permission(v_i.context_id, 'write') then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  return v_i;
end;
$$;

-- Nome (1 a 40, sem espaços nas pontas nem repetidos) e tipo da lista.
create or replace function public.clarevo_validate_investment(p_name text, p_kind text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v_name text := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
begin
  if char_length(v_name) < 1 or char_length(v_name) > 40 then
    raise exception 'nome_invalido' using errcode = '22023';
  end if;
  if p_kind is null or p_kind not in ('renda_fixa', 'titulos_publicos', 'acoes', 'fundos', 'previdencia', 'cripto', 'outro') then
    raise exception 'tipo_invalido' using errcode = '22023';
  end if;
  return v_name;
end;
$$;

-- Valor (aporte, resgate e rendimento ≥ 1 centavo; valor ≥ 0), data até hoje (do fuso da pessoa) e observação.
create or replace function public.clarevo_validate_investment_movement(p_uid uuid, p_kind text, p_amount_cents bigint, p_occurred_on date, p_note text)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_kind is null or p_kind not in ('aporte', 'resgate', 'rendimento', 'valor') then
    raise exception 'tipo_invalido' using errcode = '22023';
  end if;
  if p_amount_cents is null or p_amount_cents > 999999999 or p_amount_cents < (case when p_kind = 'valor' then 0 else 1 end) then
    raise exception 'valor_invalido' using errcode = '22023';
  end if;
  if p_occurred_on is null then
    raise exception 'data_invalida' using errcode = '22023';
  end if;
  if p_occurred_on > public.clarevo_today(p_uid) then
    raise exception 'data_futura' using errcode = '22023';
  end if;
  if p_note is not null and char_length(p_note) > 80 then
    raise exception 'observacao_invalida' using errcode = '22023';
  end if;
end;
$$;

create or replace function public.clarevo_check_investment_limit(p_context_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtext('investimentos:' || p_context_id::text));
  if (select count(*) from public.investments where context_id = p_context_id and status = 'ativo') >= 50 then
    raise exception 'limite_de_investimentos' using errcode = 'PT409';
  end if;
end;
$$;

-- O investimento (linha de investment_items) e o movimento, para o retorno das funções; nulos quando não existem.
create or replace function public.clarevo_investment_result(p_investment_id uuid, p_movement_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'investment', (select to_jsonb(x) from public.investment_items x where x.id = p_investment_id),
    'movement', (select to_jsonb(m) from public.investment_movements m where m.id = p_movement_id));
$$;

-- ---------------------------------------------------------------------------
-- As sete funções do app
-- ---------------------------------------------------------------------------

create or replace function public.create_investment(
  p_key text,
  p_context_id uuid,
  p_name text,
  p_kind text,
  p_invested_cents bigint,
  p_start_on date,
  p_current_cents bigint default null
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
  v_i public.investments%rowtype;
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  perform public.clarevo_check_key(p_key);
  v_hash := md5(jsonb_build_array('criar_investimento', p_context_id, p_name, p_kind, p_invested_cents, p_start_on, p_current_cents)::text);
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
  perform public.clarevo_check_investment_limit(p_context_id);

  insert into public.investments (context_id, name, kind, created_by) values (p_context_id, v_name, p_kind, v_uid) returning * into v_i;
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

create or replace function public.update_investment(p_key text, p_id uuid, p_expected_version integer, p_name text, p_kind text)
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
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  perform public.clarevo_check_key(p_key);
  v_hash := md5(jsonb_build_array('alterar_investimento', p_id, p_expected_version, p_name, p_kind)::text);
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
  update public.investments set name = v_name, kind = p_kind, version = version + 1 where id = v_i.id;
  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id, target_id)
  values (v_uid, p_key, 'alterar_investimento', v_i.context_id, v_hash, null, null, v_i.id);
  return public.clarevo_investment_result(v_i.id, null);
end;
$$;

create or replace function public.set_investment_status(p_key text, p_id uuid, p_expected_version integer, p_status text)
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
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  perform public.clarevo_check_key(p_key);
  v_hash := md5(jsonb_build_array('situacao_investimento', p_id, p_expected_version, p_status)::text);
  perform pg_advisory_xact_lock(hashtext('op:' || v_uid::text || ':' || p_key));
  select * into v_op from public.record_operations where actor_id = v_uid and idempotency_key = p_key;
  if found then
    if v_op.action <> 'situacao_investimento' or v_op.request_hash <> v_hash then
      raise exception 'chave_reutilizada' using errcode = 'PT409';
    end if;
    if not public.context_permission(v_op.context_id, 'read') then
      raise exception 'nao_encontrado' using errcode = 'P0002';
    end if;
    return public.clarevo_investment_result(v_op.target_id, null);
  end if;

  v_i := public.clarevo_lock_investment(p_id);
  if p_status is null or p_status not in ('ativo', 'encerrado') then
    raise exception 'situacao_invalida' using errcode = '22023';
  end if;
  if p_expected_version is distinct from v_i.version then
    raise exception 'versao_desatualizada' using errcode = 'PT409', detail = 'versao_atual=' || v_i.version;
  end if;
  if p_status = 'ativo' and v_i.status <> 'ativo' then
    perform public.clarevo_check_investment_limit(v_i.context_id);
  end if;
  update public.investments set status = p_status, version = version + 1 where id = v_i.id;
  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id, target_id)
  values (v_uid, p_key, 'situacao_investimento', v_i.context_id, v_hash, null, null, v_i.id);
  return public.clarevo_investment_result(v_i.id, null);
end;
$$;

create or replace function public.delete_investment(p_key text, p_id uuid, p_expected_version integer)
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
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  perform public.clarevo_check_key(p_key);
  v_hash := md5(jsonb_build_array('excluir_investimento', p_id, p_expected_version)::text);
  perform pg_advisory_xact_lock(hashtext('op:' || v_uid::text || ':' || p_key));
  select * into v_op from public.record_operations where actor_id = v_uid and idempotency_key = p_key;
  if found then
    if v_op.action <> 'excluir_investimento' or v_op.request_hash <> v_hash then
      raise exception 'chave_reutilizada' using errcode = 'PT409';
    end if;
    if not public.context_permission(v_op.context_id, 'read') then
      raise exception 'nao_encontrado' using errcode = 'P0002';
    end if;
    return jsonb_build_object('deleted', true, 'id', v_op.target_id);
  end if;

  v_i := public.clarevo_lock_investment(p_id);
  if p_expected_version is distinct from v_i.version then
    raise exception 'versao_desatualizada' using errcode = 'PT409', detail = 'versao_atual=' || v_i.version;
  end if;
  delete from public.investment_movements where investment_id = v_i.id;
  delete from public.investments where id = v_i.id;
  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id, target_id)
  values (v_uid, p_key, 'excluir_investimento', v_i.context_id, v_hash, null, null, v_i.id);
  return jsonb_build_object('deleted', true, 'id', v_i.id);
end;
$$;

create or replace function public.add_investment_movement(
  p_key text,
  p_investment_id uuid,
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
  v_i public.investments%rowtype;
  v_m public.investment_movements%rowtype;
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  perform public.clarevo_check_key(p_key);
  v_hash := md5(jsonb_build_array('registrar_movimento_investimento', p_investment_id, p_kind, p_amount_cents, p_occurred_on, v_note)::text);
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
  insert into public.investment_movements (investment_id, context_id, kind, amount_cents, occurred_on, note, created_by)
  values (v_i.id, v_i.context_id, p_kind, p_amount_cents, p_occurred_on, v_note, v_uid)
  returning * into v_m;
  perform public.clarevo_require_investment_balance(v_i.id);
  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id, target_id)
  values (v_uid, p_key, 'registrar_movimento_investimento', v_i.context_id, v_hash, null, null, v_m.id);
  return public.clarevo_investment_result(v_i.id, v_m.id);
end;
$$;

create or replace function public.update_investment_movement(
  p_key text,
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
  v_m public.investment_movements%rowtype;
  v_i public.investments%rowtype;
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  perform public.clarevo_check_key(p_key);
  v_hash := md5(jsonb_build_array('alterar_movimento_investimento', p_movement_id, p_expected_version, p_amount_cents, p_occurred_on, v_note)::text);
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
  if v_i.status <> 'ativo' then
    raise exception 'investimento_encerrado' using errcode = 'PT409';
  end if;
  if p_expected_version is distinct from v_m.version then
    raise exception 'versao_desatualizada' using errcode = 'PT409', detail = 'versao_atual=' || v_m.version;
  end if;
  perform public.clarevo_validate_investment_movement(v_uid, v_m.kind, p_amount_cents, p_occurred_on, v_note);
  update public.investment_movements set amount_cents = p_amount_cents, occurred_on = p_occurred_on, note = v_note, version = version + 1
   where id = v_m.id;
  perform public.clarevo_require_investment_balance(v_i.id);
  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id, target_id)
  values (v_uid, p_key, 'alterar_movimento_investimento', v_i.context_id, v_hash, null, null, v_m.id);
  return public.clarevo_investment_result(v_i.id, v_m.id);
end;
$$;

create or replace function public.delete_investment_movement(p_key text, p_movement_id uuid, p_expected_version integer)
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
  v_m public.investment_movements%rowtype;
  v_i public.investments%rowtype;
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  perform public.clarevo_check_key(p_key);
  v_hash := md5(jsonb_build_array('excluir_movimento_investimento', p_movement_id, p_expected_version)::text);
  perform pg_advisory_xact_lock(hashtext('op:' || v_uid::text || ':' || p_key));
  select * into v_op from public.record_operations where actor_id = v_uid and idempotency_key = p_key;
  if found then
    if v_op.action <> 'excluir_movimento_investimento' or v_op.request_hash <> v_hash then
      raise exception 'chave_reutilizada' using errcode = 'PT409';
    end if;
    if not public.context_permission(v_op.context_id, 'read') then
      raise exception 'nao_encontrado' using errcode = 'P0002';
    end if;
    return jsonb_build_object('deleted', true, 'id', v_op.target_id);
  end if;

  select * into v_m from public.investment_movements where id = p_movement_id;
  if not found or not public.context_permission(v_m.context_id, 'read') then
    raise exception 'nao_encontrado' using errcode = 'P0002';
  end if;
  v_i := public.clarevo_lock_investment(v_m.investment_id);
  select * into v_m from public.investment_movements where id = p_movement_id for update;
  if v_i.status <> 'ativo' then
    raise exception 'investimento_encerrado' using errcode = 'PT409';
  end if;
  if p_expected_version is distinct from v_m.version then
    raise exception 'versao_desatualizada' using errcode = 'PT409', detail = 'versao_atual=' || v_m.version;
  end if;
  delete from public.investment_movements where id = v_m.id;
  perform public.clarevo_require_investment_balance(v_i.id);
  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id, target_id)
  values (v_uid, p_key, 'excluir_movimento_investimento', v_i.context_id, v_hash, null, null, v_m.id);
  return jsonb_build_object('deleted', true, 'id', v_m.id, 'investment', (select to_jsonb(x) from public.investment_items x where x.id = v_i.id));
end;
$$;

-- ---------------------------------------------------------------------------
-- Operações: a lista vigente (a da 0031) mais as 7 de investimentos, com o investimento ou o movimento como alvo.
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
  'registrar_movimento_investimento', 'alterar_movimento_investimento', 'excluir_movimento_investimento'));
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
                 'gerar_codigo_telegram', 'ligar_telegram', 'desligar_telegram', 'aceitar_termos')
      and record_id is null and commitment_id is null and target_id is null));

-- ---------------------------------------------------------------------------
-- Privilégios: leitura das tabelas e da visão; as sete funções para o app; auxiliares e gatilhos fechados.
-- ---------------------------------------------------------------------------
revoke all on public.investments, public.investment_movements, public.investment_items from anon, authenticated;
grant select on public.investments, public.investment_movements, public.investment_items to authenticated;
revoke all on function public.investments_guard() from public, anon, authenticated, service_role;
revoke all on function public.investment_movements_guard() from public, anon, authenticated, service_role;
revoke all on function public.clarevo_investment_negative_day(uuid) from public, anon, authenticated, service_role;
revoke all on function public.clarevo_require_investment_balance(uuid) from public, anon, authenticated, service_role;
revoke all on function public.clarevo_lock_investment(uuid) from public, anon, authenticated, service_role;
revoke all on function public.clarevo_validate_investment(text, text) from public, anon, authenticated, service_role;
revoke all on function public.clarevo_validate_investment_movement(uuid, text, bigint, date, text) from public, anon, authenticated, service_role;
revoke all on function public.clarevo_check_investment_limit(uuid) from public, anon, authenticated, service_role;
revoke all on function public.clarevo_investment_result(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.create_investment(text, uuid, text, text, bigint, date, bigint) from public, anon;
revoke all on function public.update_investment(text, uuid, integer, text, text) from public, anon;
revoke all on function public.set_investment_status(text, uuid, integer, text) from public, anon;
revoke all on function public.delete_investment(text, uuid, integer) from public, anon;
revoke all on function public.add_investment_movement(text, uuid, text, bigint, date, text) from public, anon;
revoke all on function public.update_investment_movement(text, uuid, integer, bigint, date, text) from public, anon;
revoke all on function public.delete_investment_movement(text, uuid, integer) from public, anon;
grant execute on function public.create_investment(text, uuid, text, text, bigint, date, bigint) to authenticated;
grant execute on function public.update_investment(text, uuid, integer, text, text) to authenticated;
grant execute on function public.set_investment_status(text, uuid, integer, text) to authenticated;
grant execute on function public.delete_investment(text, uuid, integer) to authenticated;
grant execute on function public.add_investment_movement(text, uuid, text, bigint, date, text) to authenticated;
grant execute on function public.update_investment_movement(text, uuid, integer, bigint, date, text) to authenticated;
grant execute on function public.delete_investment_movement(text, uuid, integer) to authenticated;
