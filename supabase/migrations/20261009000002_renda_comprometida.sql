-- Clarevo · migração 0006 · renda comprometida (D-026, com o grupo "Contas do ano" de D-029(6)).
-- Depois de 20261009000001_retorno.sql.
-- Renda de referência só por set_income_reference e delete_income_reference: autoria da sessão, chave de idempotência
-- por pessoa (o mesmo espaço das outras operações), hash em JSON (D-021, regra 7), versão e exclusão lógica.
-- month_committed repete no banco a regra do core (summarizeCommitted em packages/core), pelo mês de vencimento.
--
-- Invariantes:
-- B1. No máximo uma referência viva por (contexto, mês de início).
-- B2. from_month é sempre o 1º dia de um mês; valor de 1 a 999.999.999 centavos; exclusão com data e autoria juntas.
-- B3. Identidade, contexto, mês de início, autoria e criação nunca mudam; referência excluída não muda mais;
--     versão +1 por escrita.
-- B4. A referência nunca entra em Recebido: nenhuma função nova grava financial_records nem commitments.
-- Ordem de travas: chave → (contexto, mês de início) [consultiva] → linha da referência.
--
-- Comprometido do mês M (contexto c), como em D-026(1) com D-029(6):
--   C(M)  = contas a pagar não excluídas de c com vencimento em M; cada conta conta uma vez:
--           paga pelo valor do gasto vivo vinculado, em aberto pelo valor previsto (estimado ou não).
--   grupo = série mensal → gastos fixos; série anual → contas do ano; série parcelada → parcelamentos;
--           sem série → outras contas. Dívidas = parcelamentos de financiamento (ou empréstimo) e de compra parcelada.
--           Contas do ano nunca são dívida.
--   Vencidas antes de M (só quando M é o mês de hoje): em aberto com vencimento antes de M, fora do comprometido.
--   Referência = a viva com o maior from_month <= M (ou nenhuma).
--   ‰ = (2000 × valor + referência) div (2 × referência): milésimos com metade para cima; nulo sem referência.
--   Fora dos compromissos = referência - comprometido (pode ser negativo); nulo sem referência.
-- Identidade: committed_cents = soma das pagas de C(M) + due_in_month_cents de month_to_pay(c, M).

-- ---------------------------------------------------------------------------
-- Renda de referência mensal líquida, com vigência "a partir de" um mês
-- ---------------------------------------------------------------------------
create table public.income_references (
  id uuid primary key default gen_random_uuid(),
  context_id uuid not null references public.financial_contexts (id) on delete cascade,
  from_month date not null,
  amount_cents bigint not null,
  varies boolean not null default false,
  created_by uuid not null references public.persons (id),
  version integer not null default 1 check (version >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Instante em que o valor mudou pela última vez (nulo: nunca mudou desde a criação). Só mudar amount_cents marca;
  -- repetir o valor ou trocar só "varies" não marca. Quem lê (savings.lastIncomeReferenceChange) usa este campo, não version.
  amount_changed_at timestamptz,
  deleted_at timestamptz,
  deleted_by uuid references public.persons (id),
  constraint income_references_mes check (extract(day from from_month) = 1),
  constraint income_references_valor check (amount_cents between 1 and 999999999),
  constraint income_references_mudanca check (amount_changed_at is null or amount_changed_at >= created_at),
  constraint income_references_exclusao check ((deleted_at is null) = (deleted_by is null))
);
-- B1: excluídas não bloqueiam uma referência nova no mesmo mês.
create unique index income_references_one_live on public.income_references (context_id, from_month) where deleted_at is null;
comment on table public.income_references is
  'Renda de referência mensal líquida informada pela pessoa, válida a partir de from_month até a próxima viva. '
  'Só denominador da renda comprometida: nunca entra em Recebido.';
comment on column public.income_references.varies is '"Minha renda varia": o app pede revisão no começo de cada mês.';
comment on column public.income_references.amount_changed_at is
  'Instante da última mudança do valor (nulo se nunca mudou). Só mudar amount_cents marca; usado para perguntar de novo quanto guardar.';

-- ---------------------------------------------------------------------------
-- Operações: lista completa vigente (0002, 0003, 0004 e 0005) mais as duas ações novas, que apontam só para a
-- referência (target_id), no ramo das ações de série.
-- ---------------------------------------------------------------------------
alter table public.record_operations drop constraint record_operations_action_check;
alter table public.record_operations add constraint record_operations_action_check check (action in (
  'criar', 'editar', 'excluir',
  'criar_compromisso', 'editar_compromisso', 'excluir_compromisso', 'pagar_compromisso', 'desfazer_pagamento',
  'criar_serie', 'alterar_serie', 'encerrar_serie', 'excluir_serie', 'informar_ano', 'tirar_ano',
  'criar_ocorrencia', 'decidir_revisao',
  'definir_renda_referencia', 'excluir_renda_referencia'));
alter table public.record_operations drop constraint record_operations_target_check;
alter table public.record_operations add constraint record_operations_target_check check (
  (action in ('criar', 'editar', 'excluir') and record_id is not null and target_id is null)
  or (action in ('criar_compromisso', 'editar_compromisso', 'excluir_compromisso')
      and commitment_id is not null and record_id is null and target_id is null)
  or (action in ('pagar_compromisso', 'desfazer_pagamento')
      and commitment_id is not null and record_id is not null and target_id is null)
  or (action in ('criar_serie', 'alterar_serie', 'encerrar_serie', 'excluir_serie', 'informar_ano', 'tirar_ano',
                 'definir_renda_referencia', 'excluir_renda_referencia')
      and target_id is not null and record_id is null and commitment_id is null)
  or (action = 'criar_ocorrencia' and commitment_id is not null and target_id is not null and record_id is null)
  or (action = 'decidir_revisao' and record_id is null and commitment_id is null and target_id is null));

-- ---------------------------------------------------------------------------
-- Gatilho de proteção (B3): defesa adicional, só as duas funções gravam.
-- Podem mudar: amount_cents, varies, version (+1), updated_at, amount_changed_at (só junto com amount_cents: o gatilho
-- grava now() quando o valor muda e recusa mudar o instante com o mesmo valor), deleted_at e deleted_by.
-- ---------------------------------------------------------------------------
create or replace function public.income_references_guard()
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
  if new.amount_cents <> old.amount_cents then
    new.amount_changed_at := now();
  elsif new.amount_changed_at is distinct from old.amount_changed_at then
    raise exception 'campo_imutavel' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger income_references_guard
  before update on public.income_references
  for each row execute function public.income_references_guard();

-- ---------------------------------------------------------------------------
-- Definir a renda de referência de um mês (criar ou alterar), atômico, idempotente e versionado.
-- Estrutura comum: sessão; chave; hash de jsonb_build_array(ação, argumentos)::text; trava da chave; repetição (ação e
-- hash iguais, leitura do contexto); permissão; travas; versão; autoria; validação; escrita; operação com target_id.
-- p_expected_version 0 cria (já existe viva no mês: versao_desatualizada com a versão atual); maior que 0 altera a viva do
-- mês com essa versão; nulo é recusado. Alterar a de outra pessoa exige "editar de outras pessoas".
-- Validação, depois da versão e da autoria (como nas outras funções): mês de início entre 24 meses antes e 12 meses
-- depois do mês de hoje (referencia_fora_do_intervalo), valor (valor_invalido, valor_acima_do_limite) e tipo de renda
-- (tipo_invalido, se nulo), na ordem de validateIncomeReferenceDraft no core.
-- Retorno: a linha da referência em JSON (na repetição, a linha atual, inclusive se já foi excluída).
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
  if v_ref.id is not null and v_ref.created_by <> v_uid and not public.context_permission(p_context_id, 'edit_others') then
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
  if not public.context_permission(v_ref.context_id, 'write')
     or (v_ref.created_by <> v_uid and not public.context_permission(v_ref.context_id, 'edit_others')) then
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
-- Renda comprometida do mês, pelo mesmo critério do app (summarizeCommitted no core). Uma linha sempre.
-- security definer com filtros explícitos (contexto, exclusão, permissão de leitura), como month_to_pay, e a mesma ordem
-- de conferência: mes_invalido, depois sem_permissao. Somas em bigint antes de dividir; milésimos calculados em numeric
-- (sem estouro) e devolvidos em bigint.
-- ---------------------------------------------------------------------------
create or replace function public.month_committed(p_context_id uuid, p_month date)
returns table (
  fixed_cents bigint,            -- gastos fixos (séries mensais)
  annual_cents bigint,           -- contas do ano (séries anuais; nunca dívida)
  installment_cents bigint,      -- parcelamentos (séries parceladas)
  debt_cents bigint,             -- dívidas: parte de parcelamentos (financiamento ou compra parcelada)
  other_cents bigint,            -- outras contas a pagar (sem série)
  committed_cents bigint,        -- fixos + contas do ano + parcelamentos + outras
  paid_part_cents bigint,        -- já pago: valor pago das contas pagas de C(M)
  open_part_cents bigint,        -- em aberto: valor previsto das contas em aberto de C(M)
  estimated_open_cents bigint,   -- parte de open_part com valor estimado
  overdue_before_cents bigint,   -- só no mês de hoje: em aberto vencidas antes de M (fora do comprometido)
  reference_cents bigint,        -- renda de referência vigente em M (nula sem referência)
  reference_from date,           -- mês de início da referência vigente
  reference_varies boolean,      -- "Minha renda varia" da referência vigente
  outside_cents bigint,          -- fora dos compromissos = referência - comprometido (pode ser negativo)
  committed_permille bigint,     -- milésimos da referência, metade para cima; nulos sem referência
  debt_permille bigint,
  fixed_permille bigint,
  annual_permille bigint,
  installment_permille bigint,
  other_permille bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_current boolean;
  v_next date;
  v_ref public.income_references%rowtype;
  v_fixed bigint;
  v_annual bigint;
  v_installment bigint;
  v_debt bigint;
  v_other bigint;
  v_paid bigint;
  v_open bigint;
  v_estimated bigint;
  v_overdue bigint;
  v_total bigint;
  v_r numeric;
begin
  if p_month is null or extract(day from p_month) <> 1 then
    raise exception 'mes_invalido' using errcode = '22023';
  end if;
  if not public.context_permission(p_context_id, 'read') then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  v_current := date_trunc('month', public.clarevo_today(auth.uid())::timestamp)::date = p_month;
  v_next := (p_month + interval '1 month')::date;

  -- Cada conta uma vez: paga pelo gasto vivo vinculado (I1: exatamente um), em aberto pelo previsto.
  select coalesce(sum(x.v) filter (where x.kind = 'mensal'), 0)::bigint,
         coalesce(sum(x.v) filter (where x.kind = 'anual'), 0)::bigint,
         coalesce(sum(x.v) filter (where x.kind = 'parcelada'), 0)::bigint,
         coalesce(sum(x.v) filter (where x.kind = 'parcelada' and x.nature in ('financiamento', 'compra_parcelada')), 0)::bigint,
         coalesce(sum(x.v) filter (where x.kind is null), 0)::bigint,
         coalesce(sum(x.v) filter (where x.paid), 0)::bigint,
         coalesce(sum(x.v) filter (where not x.paid), 0)::bigint,
         coalesce(sum(x.v) filter (where not x.paid and x.estimate), 0)::bigint
    into v_fixed, v_annual, v_installment, v_debt, v_other, v_paid, v_open, v_estimated
    from (select c.status = 'quitado' as paid,
                 case when c.status = 'quitado' then r.amount_cents else c.amount_cents end as v,
                 c.amount_is_estimate as estimate,
                 s.kind, s.nature
            from public.commitments c
            left join public.financial_records r on r.commitment_id = c.id and r.deleted_at is null
            left join public.commitment_series s on s.id = c.series_id
           where c.context_id = p_context_id
             and c.deleted_at is null
             and c.due_on >= p_month
             and c.due_on < v_next) x;
  v_total := v_fixed + v_annual + v_installment + v_other;

  -- Mesmo critério de overdue_before_cents em month_to_pay.
  select coalesce(sum(c.amount_cents), 0)::bigint into v_overdue
    from public.commitments c
   where c.context_id = p_context_id
     and c.deleted_at is null
     and c.status = 'aberto'
     and c.due_on < p_month
     and v_current;

  select * into v_ref from public.income_references i
   where i.context_id = p_context_id and i.deleted_at is null and i.from_month <= p_month
   order by i.from_month desc
   limit 1;
  v_r := v_ref.amount_cents;

  return query
  select v_fixed, v_annual, v_installment, v_debt, v_other, v_total, v_paid, v_open, v_estimated, v_overdue,
         v_ref.amount_cents, v_ref.from_month, v_ref.varies,
         v_ref.amount_cents - v_total,
         div(2000::numeric * v_total + v_r, 2 * v_r)::bigint,
         div(2000::numeric * v_debt + v_r, 2 * v_r)::bigint,
         div(2000::numeric * v_fixed + v_r, 2 * v_r)::bigint,
         div(2000::numeric * v_annual + v_r, 2 * v_r)::bigint,
         div(2000::numeric * v_installment + v_r, 2 * v_r)::bigint,
         div(2000::numeric * v_other + v_r, 2 * v_r)::bigint;
end;
$$;

-- ---------------------------------------------------------------------------
-- Leitura: RLS (negado por padrão; só quem lê o contexto vê as referências vivas). Sem escrita direta.
-- ---------------------------------------------------------------------------
alter table public.income_references enable row level security;

create policy income_references_read on public.income_references for select to authenticated
  using (deleted_at is null and public.context_permission(context_id, 'read'));

-- ---------------------------------------------------------------------------
-- Privilégios: bloco inteiro da 0005 (idempotente), mais as três funções públicas novas.
-- income_references fica sem insert, update ou delete diretos; income_references_guard sem execute para authenticated.
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
-- Usadas pelas políticas e pela visão series_items (avaliadas com os privilégios de quem consulta).
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
