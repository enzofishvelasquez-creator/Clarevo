-- Clarevo · migração 0009 · orçamento por categoria e limite pessoal de comprometimento (D-041, Ciclo F2).
-- Depois de 20261010000001_cartoes.sql.
-- Orçamento por categoria só por set_category_budget e delete_category_budget; limite pessoal só por set_commitment_limit e
-- delete_commitment_limit: autoria da sessão, chave de idempotência por pessoa (o mesmo espaço das outras operações), hash em
-- JSON (D-021, regra 7), versão e exclusão lógica, no padrão de set_income_reference e delete_income_reference (0006).
-- month_budget repete no banco a regra do core (budget.ts: categoryUsage e readMonthBudget).
--
-- Orçamento: valor mensal por categoria de despesa (Moradia, Mercado, Transporte, Saúde, Educação, Lazer; "Sem categoria" não
-- tem), de R$ 1,00 a R$ 9.999.999,99, com vigência "a partir de" um mês: vale a linha viva mais recente com início até o mês
-- mostrado. Uma linha sem valor (amount_cents nulo) encerra a vigência ("Tirar o orçamento a partir de novembro"); a linha
-- nunca reescreve os meses anteriores a ela.
-- Limite pessoal: percentual inteiro de 10 a 100 da renda de referência, com a mesma vigência; escolha da pessoa, nunca
-- preenchido por padrão.
--
-- Usado no mês M da categoria c (competência), como em budget.ts:
--   gastos   = despesas vivas de c com data em M, menos os pagamentos de fatura (card_id nulo: a quitação de compras já contadas);
--   parcelas = compras no cartão vivas de c: a parcela k conta no mês da data da compra mais (k - 1) meses (a parcela 1 cai
--              no mês da compra, não no mês da fatura);
--   estornos = estornos informados (source_month nulo) com categoria c, no mês da fatura (invoice_month) em que foram informados;
--   usado    = max(0, gastos + parcelas - estornos).
--   Encargos, saldo anterior e crédito levado não têm categoria e ficam fora; movimentos de metas e recebimentos nunca contam.
--
-- Invariantes:
-- D1. No máximo uma linha viva por (contexto, categoria, mês de início) no orçamento e por (contexto, mês de início) no limite.
-- D2. from_month é sempre o 1º dia de um mês; categoria entre as seis de despesa; valor nulo ou de 100 a 999.999.999 centavos;
--     percentual de 10 a 100; exclusão com data e autoria juntas.
-- D3. Identidade, contexto, categoria, mês de início, autoria e criação nunca mudam; linha excluída não muda mais; versão +1 por
--     escrita.
-- D4. Orçamento e limite nunca entram em Recebido, Pago, Diferença, Ainda a pagar nem na renda comprometida: nenhuma função nova
--     grava financial_records, commitments, card_entries nem metas.
-- Ordem de travas: chave -> (contexto, categoria, mês de início) ou (contexto, mês de início) [consultiva] -> linha.
-- A atividade (gatilho de record_operations, 0005) conta as quatro ações como anotação, como as demais escritas.

-- ---------------------------------------------------------------------------
-- Orçamento por categoria, com vigência "a partir de" um mês
-- ---------------------------------------------------------------------------
create table public.category_budgets (
  id uuid primary key default gen_random_uuid(),
  context_id uuid not null references public.financial_contexts (id) on delete cascade,
  category text not null,
  from_month date not null,
  -- Nulo: encerra a vigência a partir de from_month (nenhum orçamento).
  amount_cents bigint,
  created_by uuid not null references public.persons (id),
  version integer not null default 1 check (version >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references public.persons (id),
  constraint category_budgets_categoria check (category in ('Moradia', 'Mercado', 'Transporte', 'Saúde', 'Educação', 'Lazer')),
  constraint category_budgets_mes check (extract(day from from_month) = 1),
  constraint category_budgets_valor check (amount_cents is null or amount_cents between 100 and 999999999),
  constraint category_budgets_exclusao check ((deleted_at is null) = (deleted_by is null))
);
-- D1: excluídas não bloqueiam uma linha nova na mesma categoria e mês.
create unique index category_budgets_one_live on public.category_budgets (context_id, category, from_month) where deleted_at is null;
comment on table public.category_budgets is
  'Orçamento mensal por categoria de despesa, válido a partir de from_month até a próxima linha viva da categoria. '
  'amount_cents nulo encerra a vigência. Nunca entra em Recebido, Pago nem na renda comprometida.';

-- ---------------------------------------------------------------------------
-- Limite pessoal de comprometimento, com vigência "a partir de" um mês
-- ---------------------------------------------------------------------------
create table public.commitment_limits (
  id uuid primary key default gen_random_uuid(),
  context_id uuid not null references public.financial_contexts (id) on delete cascade,
  from_month date not null,
  percent smallint not null,
  created_by uuid not null references public.persons (id),
  version integer not null default 1 check (version >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references public.persons (id),
  constraint commitment_limits_mes check (extract(day from from_month) = 1),
  constraint commitment_limits_percentual check (percent between 10 and 100),
  constraint commitment_limits_exclusao check ((deleted_at is null) = (deleted_by is null))
);
create unique index commitment_limits_one_live on public.commitment_limits (context_id, from_month) where deleted_at is null;
comment on table public.commitment_limits is
  'Limite pessoal de comprometimento da renda de referência (percentual inteiro de 10 a 100), válido a partir de from_month. '
  'Escolha da pessoa: nunca vem preenchido.';

-- ---------------------------------------------------------------------------
-- Operações: lista completa vigente (37 ações das migrações anteriores) mais as 4 de orçamento e limite, que apontam só para a
-- linha (target_id), no ramo das ações de série.
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
  'definir_limite_comprometimento', 'excluir_limite_comprometimento'));
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
                 'definir_limite_comprometimento', 'excluir_limite_comprometimento')
      and target_id is not null and record_id is null and commitment_id is null)
  or (action in ('pagar_fatura', 'desfazer_pagamento_fatura')
      and target_id is not null and record_id is not null and commitment_id is not null)
  or (action = 'criar_ocorrencia' and commitment_id is not null and target_id is not null and record_id is null)
  or (action in ('decidir_revisao', 'responder_guardar') and record_id is null and commitment_id is null and target_id is null));

-- ---------------------------------------------------------------------------
-- Gatilhos de proteção (D3): defesa adicional, só as funções gravam.
-- Podem mudar: amount_cents (orçamento) ou percent (limite), version (+1), updated_at, deleted_at e deleted_by.
-- ---------------------------------------------------------------------------
create or replace function public.category_budgets_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.id <> old.id or new.context_id <> old.context_id or new.category <> old.category or new.from_month <> old.from_month
     or new.created_by <> old.created_by or new.created_at <> old.created_at
     or old.deleted_at is not null or new.version <> old.version + 1 then
    raise exception 'campo_imutavel' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger category_budgets_guard
  before update on public.category_budgets
  for each row execute function public.category_budgets_guard();

create or replace function public.commitment_limits_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.id <> old.id or new.context_id <> old.context_id or new.from_month <> old.from_month
     or new.created_by <> old.created_by or new.created_at <> old.created_at
     or old.deleted_at is not null or new.version <> old.version + 1 then
    raise exception 'campo_imutavel' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger commitment_limits_guard
  before update on public.commitment_limits
  for each row execute function public.commitment_limits_guard();

-- ---------------------------------------------------------------------------
-- Definir o orçamento de uma categoria num mês (criar ou alterar), atômico, idempotente e versionado.
-- Estrutura comum: sessão; chave; hash de jsonb_build_array(ação, argumentos)::text; trava da chave; repetição (ação e hash
-- iguais, leitura do contexto); permissão; formato (mês no dia 1 e categoria); travas; versão; autoria; validação; escrita;
-- operação com target_id.
-- p_expected_version 0 cria (já existe viva na categoria e no mês: versao_desatualizada com a versão atual); maior que 0 altera a
-- viva com essa versão; nulo é recusado. Alterar a de outra pessoa exige "editar de outras pessoas".
-- p_amount_cents nulo grava a linha que encerra a vigência ("Tirar o orçamento a partir de {mês}").
-- Validação, depois da versão e da autoria (como em set_income_reference): mês de início entre 24 meses antes e 12 meses depois do
-- mês de hoje (vigencia_fora_do_intervalo) e valor (valor_invalido, valor_acima_do_limite), na ordem de validateBudgetDraft.
-- Retorno: a linha em JSON (na repetição, a linha atual, inclusive se já foi excluída).
-- ---------------------------------------------------------------------------
create or replace function public.set_category_budget(
  p_idempotency_key text,
  p_context_id uuid,
  p_category text,
  p_from_month date,
  p_expected_version integer,
  p_amount_cents bigint
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
  v_row public.category_budgets%rowtype;
  v_month date;
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  perform public.clarevo_check_key(p_idempotency_key);
  v_hash := md5(jsonb_build_array('definir_orcamento_categoria', p_context_id, p_category, p_from_month, p_expected_version,
                                  p_amount_cents)::text);
  perform pg_advisory_xact_lock(hashtext('op:' || v_uid::text || ':' || p_idempotency_key));

  select * into v_op from public.record_operations where actor_id = v_uid and idempotency_key = p_idempotency_key;
  if found then
    if v_op.action <> 'definir_orcamento_categoria' or v_op.request_hash <> v_hash then
      raise exception 'chave_reutilizada' using errcode = 'PT409';
    end if;
    if not public.context_permission(v_op.context_id, 'read') then
      raise exception 'nao_encontrado' using errcode = 'P0002';
    end if;
    return (select to_jsonb(b) from public.category_budgets b where b.id = v_op.target_id);
  end if;

  if not public.context_permission(p_context_id, 'write') then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if p_from_month is null or extract(day from p_from_month) <> 1 then
    raise exception 'mes_invalido' using errcode = '22023';
  end if;
  if p_category is null or p_category not in ('Moradia', 'Mercado', 'Transporte', 'Saúde', 'Educação', 'Lazer') then
    raise exception 'categoria_invalida' using errcode = '22023';
  end if;

  -- A linha pode ainda não existir: a trava consultiva serializa a criação; depois, a linha.
  perform pg_advisory_xact_lock(hashtext('orcamento:' || p_context_id::text || ':' || p_category || ':' || to_char(p_from_month, 'YYYY-MM-DD')));
  select * into v_row from public.category_budgets
   where context_id = p_context_id and category = p_category and from_month = p_from_month and deleted_at is null
   for update;
  -- Versão ausente (NULL) também é recusada.
  if p_expected_version is distinct from coalesce(v_row.version, 0) then
    raise exception 'versao_desatualizada' using errcode = 'PT409', detail = 'versao_atual=' || coalesce(v_row.version, 0);
  end if;
  if v_row.id is not null and v_row.created_by <> v_uid and not public.context_permission(p_context_id, 'edit_others') then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;

  v_month := date_trunc('month', public.clarevo_today(v_uid)::timestamp)::date;
  if p_from_month < (v_month - interval '24 months')::date or p_from_month > (v_month + interval '12 months')::date then
    raise exception 'vigencia_fora_do_intervalo' using errcode = '22023';
  end if;
  if p_amount_cents is not null and p_amount_cents < 100 then
    raise exception 'valor_invalido' using errcode = '22023';
  end if;
  if p_amount_cents is not null and p_amount_cents > 999999999 then
    raise exception 'valor_acima_do_limite' using errcode = '22023';
  end if;

  if v_row.id is null then
    insert into public.category_budgets (context_id, category, from_month, amount_cents, created_by)
    values (p_context_id, p_category, p_from_month, p_amount_cents, v_uid)
    returning * into v_row;
  else
    update public.category_budgets set amount_cents = p_amount_cents, version = version + 1
     where id = v_row.id
    returning * into v_row;
  end if;

  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id, target_id)
  values (v_uid, p_idempotency_key, 'definir_orcamento_categoria', p_context_id, v_hash, null, null, v_row.id);

  return to_jsonb(v_row);
end;
$$;

-- Excluir uma linha do orçamento (exclusão lógica, com versão). A anterior da categoria volta a valer; sem nenhuma, sem
-- orçamento. Sem revelar se existe para quem não pode ler (nao_encontrado); escrita e autoria como em delete_income_reference.
create or replace function public.delete_category_budget(
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
  v_category text;
  v_from date;
  v_row public.category_budgets%rowtype;
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  perform public.clarevo_check_key(p_idempotency_key);
  v_hash := md5(jsonb_build_array('excluir_orcamento_categoria', p_id, p_expected_version)::text);
  perform pg_advisory_xact_lock(hashtext('op:' || v_uid::text || ':' || p_idempotency_key));

  select * into v_op from public.record_operations where actor_id = v_uid and idempotency_key = p_idempotency_key;
  if found then
    if v_op.action <> 'excluir_orcamento_categoria' or v_op.request_hash <> v_hash then
      raise exception 'chave_reutilizada' using errcode = 'PT409';
    end if;
    if not public.context_permission(v_op.context_id, 'read') then
      raise exception 'nao_encontrado' using errcode = 'P0002';
    end if;
    return (select to_jsonb(b) from public.category_budgets b where b.id = v_op.target_id);
  end if;

  -- Contexto, categoria e mês são imutáveis: ler sem trava é seguro. Mesma ordem de set_category_budget: consultiva, linha.
  select context_id, category, from_month into v_ctx, v_category, v_from from public.category_budgets where id = p_id;
  if v_ctx is not null then
    perform pg_advisory_xact_lock(hashtext('orcamento:' || v_ctx::text || ':' || v_category || ':' || to_char(v_from, 'YYYY-MM-DD')));
  end if;
  select * into v_row from public.category_budgets where id = p_id for update;
  if not found or v_row.deleted_at is not null or not public.context_permission(v_row.context_id, 'read') then
    raise exception 'nao_encontrado' using errcode = 'P0002';
  end if;
  if not public.context_permission(v_row.context_id, 'write')
     or (v_row.created_by <> v_uid and not public.context_permission(v_row.context_id, 'edit_others')) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if p_expected_version is distinct from v_row.version then
    raise exception 'versao_desatualizada' using errcode = 'PT409', detail = 'versao_atual=' || v_row.version;
  end if;

  update public.category_budgets
     set deleted_at = now(), deleted_by = v_uid, version = version + 1
   where id = v_row.id
  returning * into v_row;

  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id, target_id)
  values (v_uid, p_idempotency_key, 'excluir_orcamento_categoria', v_row.context_id, v_hash, null, null, v_row.id);

  return to_jsonb(v_row);
end;
$$;

-- ---------------------------------------------------------------------------
-- Definir o limite pessoal de um mês (criar ou alterar) e excluir uma linha dele: mesma estrutura e mesma ordem das funções do
-- orçamento, sem categoria. Validação depois da versão e da autoria: mês de início entre 24 meses antes e 12 meses depois do mês
-- de hoje (vigencia_fora_do_intervalo) e percentual inteiro de 10 a 100 (percentual_invalido).
-- ---------------------------------------------------------------------------
create or replace function public.set_commitment_limit(
  p_idempotency_key text,
  p_context_id uuid,
  p_from_month date,
  p_expected_version integer,
  p_percent integer
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
  v_row public.commitment_limits%rowtype;
  v_month date;
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  perform public.clarevo_check_key(p_idempotency_key);
  v_hash := md5(jsonb_build_array('definir_limite_comprometimento', p_context_id, p_from_month, p_expected_version, p_percent)::text);
  perform pg_advisory_xact_lock(hashtext('op:' || v_uid::text || ':' || p_idempotency_key));

  select * into v_op from public.record_operations where actor_id = v_uid and idempotency_key = p_idempotency_key;
  if found then
    if v_op.action <> 'definir_limite_comprometimento' or v_op.request_hash <> v_hash then
      raise exception 'chave_reutilizada' using errcode = 'PT409';
    end if;
    if not public.context_permission(v_op.context_id, 'read') then
      raise exception 'nao_encontrado' using errcode = 'P0002';
    end if;
    return (select to_jsonb(l) from public.commitment_limits l where l.id = v_op.target_id);
  end if;

  if not public.context_permission(p_context_id, 'write') then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if p_from_month is null or extract(day from p_from_month) <> 1 then
    raise exception 'mes_invalido' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('limite:' || p_context_id::text || ':' || to_char(p_from_month, 'YYYY-MM-DD')));
  select * into v_row from public.commitment_limits
   where context_id = p_context_id and from_month = p_from_month and deleted_at is null
   for update;
  if p_expected_version is distinct from coalesce(v_row.version, 0) then
    raise exception 'versao_desatualizada' using errcode = 'PT409', detail = 'versao_atual=' || coalesce(v_row.version, 0);
  end if;
  if v_row.id is not null and v_row.created_by <> v_uid and not public.context_permission(p_context_id, 'edit_others') then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;

  v_month := date_trunc('month', public.clarevo_today(v_uid)::timestamp)::date;
  if p_from_month < (v_month - interval '24 months')::date or p_from_month > (v_month + interval '12 months')::date then
    raise exception 'vigencia_fora_do_intervalo' using errcode = '22023';
  end if;
  if p_percent is null or p_percent < 10 or p_percent > 100 then
    raise exception 'percentual_invalido' using errcode = '22023';
  end if;

  if v_row.id is null then
    insert into public.commitment_limits (context_id, from_month, percent, created_by)
    values (p_context_id, p_from_month, p_percent, v_uid)
    returning * into v_row;
  else
    update public.commitment_limits set percent = p_percent, version = version + 1
     where id = v_row.id
    returning * into v_row;
  end if;

  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id, target_id)
  values (v_uid, p_idempotency_key, 'definir_limite_comprometimento', p_context_id, v_hash, null, null, v_row.id);

  return to_jsonb(v_row);
end;
$$;

create or replace function public.delete_commitment_limit(
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
  v_row public.commitment_limits%rowtype;
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  perform public.clarevo_check_key(p_idempotency_key);
  v_hash := md5(jsonb_build_array('excluir_limite_comprometimento', p_id, p_expected_version)::text);
  perform pg_advisory_xact_lock(hashtext('op:' || v_uid::text || ':' || p_idempotency_key));

  select * into v_op from public.record_operations where actor_id = v_uid and idempotency_key = p_idempotency_key;
  if found then
    if v_op.action <> 'excluir_limite_comprometimento' or v_op.request_hash <> v_hash then
      raise exception 'chave_reutilizada' using errcode = 'PT409';
    end if;
    if not public.context_permission(v_op.context_id, 'read') then
      raise exception 'nao_encontrado' using errcode = 'P0002';
    end if;
    return (select to_jsonb(l) from public.commitment_limits l where l.id = v_op.target_id);
  end if;

  select context_id, from_month into v_ctx, v_from from public.commitment_limits where id = p_id;
  if v_ctx is not null then
    perform pg_advisory_xact_lock(hashtext('limite:' || v_ctx::text || ':' || to_char(v_from, 'YYYY-MM-DD')));
  end if;
  select * into v_row from public.commitment_limits where id = p_id for update;
  if not found or v_row.deleted_at is not null or not public.context_permission(v_row.context_id, 'read') then
    raise exception 'nao_encontrado' using errcode = 'P0002';
  end if;
  if not public.context_permission(v_row.context_id, 'write')
     or (v_row.created_by <> v_uid and not public.context_permission(v_row.context_id, 'edit_others')) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if p_expected_version is distinct from v_row.version then
    raise exception 'versao_desatualizada' using errcode = 'PT409', detail = 'versao_atual=' || v_row.version;
  end if;

  update public.commitment_limits
     set deleted_at = now(), deleted_by = v_uid, version = version + 1
   where id = v_row.id
  returning * into v_row;

  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id, target_id)
  values (v_uid, p_idempotency_key, 'excluir_limite_comprometimento', v_row.context_id, v_hash, null, null, v_row.id);

  return to_jsonb(v_row);
end;
$$;

-- ---------------------------------------------------------------------------
-- Orçamento e usado no mês, pelo mesmo critério do app (budget.ts: readMonthBudget). Uma linha por categoria, sempre as seis,
-- na ordem de sempre. security definer com filtros explícitos (contexto, exclusão, permissão de leitura), como month_committed, e a
-- mesma ordem de conferência: mes_invalido, depois sem_permissao.
-- budget_* vêm da linha viva mais recente com início até o mês (pode ter valor nulo: orçamento encerrado); nulos sem linha.
-- ---------------------------------------------------------------------------
create or replace function public.month_budget(p_context_id uuid, p_month date)
returns table (
  category text,
  budget_id uuid,
  budget_version integer,
  budget_from date,
  budget_cents bigint,
  used_cents bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_next date;
begin
  if p_month is null or extract(day from p_month) <> 1 then
    raise exception 'mes_invalido' using errcode = '22023';
  end if;
  if not public.context_permission(p_context_id, 'read') then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  v_next := (p_month + interval '1 month')::date;

  return query
  select c.category,
         b.id, b.version, b.from_month, b.amount_cents,
         greatest(0::bigint,
                  coalesce((select sum(r.amount_cents) from public.financial_records r
                             where r.context_id = p_context_id and r.deleted_at is null and r.kind = 'despesa'
                               and r.card_id is null and r.category = c.category
                               and r.occurred_on >= p_month and r.occurred_on < v_next), 0)::bigint
                  + coalesce((select sum(e.amount_cents) from public.card_entries e
                               where e.context_id = p_context_id and e.deleted_at is null and e.kind = 'parcela'
                                 and e.category = c.category
                                 and (date_trunc('month', e.purchased_on::timestamp) + make_interval(months => e.installment_number - 1))::date = p_month), 0)::bigint
                  - coalesce((select sum(e.amount_cents) from public.card_entries e
                               where e.context_id = p_context_id and e.deleted_at is null and e.kind = 'estorno'
                                 and e.source_month is null and e.category = c.category and e.invoice_month = p_month), 0)::bigint
         )::bigint
    from (values ('Moradia', 1), ('Mercado', 2), ('Transporte', 3), ('Saúde', 4), ('Educação', 5), ('Lazer', 6)) as c (category, ord)
    left join lateral (select x.* from public.category_budgets x
                        where x.context_id = p_context_id and x.category = c.category and x.deleted_at is null
                          and x.from_month <= p_month
                        order by x.from_month desc
                        limit 1) b on true
   order by c.ord;
end;
$$;

-- ---------------------------------------------------------------------------
-- Leitura: RLS (negado por padrão; só quem lê o contexto vê as linhas vivas). Sem escrita direta.
-- ---------------------------------------------------------------------------
alter table public.category_budgets enable row level security;
alter table public.commitment_limits enable row level security;

create policy category_budgets_read on public.category_budgets for select to authenticated
  using (deleted_at is null and public.context_permission(context_id, 'read'));
create policy commitment_limits_read on public.commitment_limits for select to authenticated
  using (deleted_at is null and public.context_permission(context_id, 'read'));

-- ---------------------------------------------------------------------------
-- Privilégios: bloco inteiro da 0008 (idempotente), mais as cinco funções públicas novas.
-- category_budgets e commitment_limits ficam sem insert, update ou delete diretos; os dois gatilhos de proteção ficam sem
-- execute para authenticated.
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
grant execute on function public.add_goal_movement(text, uuid, text, bigint, date, text) to authenticated;
grant execute on function public.update_goal_movement(text, uuid, integer, bigint, date, text) to authenticated;
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
