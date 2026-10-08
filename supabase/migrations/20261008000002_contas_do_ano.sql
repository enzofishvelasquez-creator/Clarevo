-- Clarevo · migração 0004 · contas do ano (D-029). Depois de 20261008000001_gastos_fixos.sql.
-- Série anual: todo ano, 1 (cota única) a 12 parcelas em meses seguidos; cada parcela é uma conta a pagar comum
-- (ocorrência), com as regras da 0002 e da 0003. Numeração contínua entre os anos: com k parcelas por ano, a parcela n
-- é a parcela ((n - 1) mod k) + 1 do ano ⌊(n - 1) / k⌋.
-- O ano inteiro é criado de uma vez, quando a 1ª parcela dele vence até o fim do 2º mês depois do mês de hoje.
-- Escrita: funções de série da 0003 e, só para anuais, inform_series_year e skip_series_year, com chave de
-- idempotência e hash em JSON (D-012, D-021(7)); a série não muda de versão nessas duas.
--
-- Invariantes novas ou reescritas (S1 a S7 e I1 a I4 continuam como na 0003):
-- S8.  O vencimento da ocorrência n fica no mês clarevo_series_month(série, n) (mensal, parcelada e anual).
-- S9.  Anual: natureza 'conta', parts_per_year de 1 a 12, first_number <= parts_per_year,
--      last_number nulo ou de first_number - 1 a 50 × parts_per_year, installment_total nulo; outras: parts_per_year nulo.
-- S10. Nenhuma ocorrência é criada com vencimento depois do fim do 13º mês após o mês de hoje (cabe em D-021(6)).
-- Ordem de travas: série → limite do contexto (só end_series ao retomar) → contas a pagar (por número crescente) → registro.
-- O mês da ocorrência é sempre calculado por clarevo_series_month, nunca em linha.

-- ---------------------------------------------------------------------------
-- Séries: coluna nova, tipo 'anual' e forma de cada tipo (S9)
-- ---------------------------------------------------------------------------
alter table public.commitment_series add column parts_per_year smallint;
alter table public.commitment_series drop constraint commitment_series_kind_check;
alter table public.commitment_series add constraint commitment_series_kind_check
  check (kind in ('mensal', 'parcelada', 'anual'));
-- Os "is not null" são explícitos: um check que dá NULL passa.
alter table public.commitment_series drop constraint commitment_series_forma;
alter table public.commitment_series add constraint commitment_series_forma check (
  (kind = 'mensal' and nature = 'conta' and installment_total is null and parts_per_year is null and first_number = 1
     and (last_number is null or last_number between 0 and 600))
  or (kind = 'parcelada' and nature <> 'conta' and installment_total is not null and last_number is not null
     and parts_per_year is null and installment_total between 2 and 480
     and first_number <= installment_total and last_number between first_number - 1 and installment_total)
  or (kind = 'anual' and nature = 'conta' and installment_total is null and parts_per_year is not null
     and parts_per_year between 1 and 12 and first_number <= parts_per_year
     and (last_number is null or last_number between first_number - 1 and 50 * parts_per_year)));
comment on table public.commitment_series is
  'Gastos fixos, parcelamentos e contas do ano. Cada mês ou parcela vira uma conta a pagar comum (ocorrência).';
comment on column public.commitment_series.parts_per_year is
  'Contas do ano: parcelas por ano, em meses seguidos (1 = cota única). Nulo em gastos fixos e parcelamentos.';

-- Operações: 'informar_ano' e 'tirar_ano' apontam só para a série (target_id), como as outras ações de série.
alter table public.record_operations drop constraint record_operations_action_check;
alter table public.record_operations add constraint record_operations_action_check check (action in (
  'criar', 'editar', 'excluir',
  'criar_compromisso', 'editar_compromisso', 'excluir_compromisso', 'pagar_compromisso', 'desfazer_pagamento',
  'criar_serie', 'alterar_serie', 'encerrar_serie', 'excluir_serie', 'informar_ano', 'tirar_ano'));
alter table public.record_operations drop constraint record_operations_target_check;
alter table public.record_operations add constraint record_operations_target_check check (
  (action in ('criar', 'editar', 'excluir') and record_id is not null and target_id is null)
  or (action in ('criar_compromisso', 'editar_compromisso', 'excluir_compromisso')
      and commitment_id is not null and record_id is null and target_id is null)
  or (action in ('pagar_compromisso', 'desfazer_pagamento')
      and commitment_id is not null and record_id is not null and target_id is null)
  or (action in ('criar_serie', 'alterar_serie', 'encerrar_serie', 'excluir_serie', 'informar_ano', 'tirar_ano')
      and target_id is not null and record_id is null and commitment_id is null));

-- ---------------------------------------------------------------------------
-- Funções auxiliares novas (sem execute para authenticated).
-- clarevo_series_due_on (4 argumentos, da 0003) fica só para os testes da 40: nenhuma função a usa mais.
-- ---------------------------------------------------------------------------

-- Mês da ocorrência n (primeiro dia). Anual: âncora (mês da parcela 1) + 12 × ano + posição no ano.
-- Divisão para baixo e resto não negativo: n = first_number - 1 (encerrada sem conta) pode ser 0.
create or replace function public.clarevo_series_month(p_s public.commitment_series, p_n integer)
returns date
language sql
immutable
set search_path = public
as $$
  select (p_s.first_due_month + make_interval(months =>
           case when p_s.kind = 'anual'
                then 12 * floor((p_n - 1)::numeric / p_s.parts_per_year)::int
                     + (((p_n - 1) % p_s.parts_per_year) + p_s.parts_per_year) % p_s.parts_per_year
                     - (p_s.first_number - 1)
                else p_n - p_s.first_number end))::date
$$;

-- Vencimento da ocorrência n: dia escolhido no mês dela, limitado ao último dia do mês (igual à 0003).
create or replace function public.clarevo_series_due(p_s public.commitment_series, p_n integer, p_due_day integer)
returns date
language sql
immutable
set search_path = public
as $$
  select (m + (least(p_due_day, extract(day from (m + interval '1 month' - interval '1 day'))::int) - 1))::date
    from (select public.clarevo_series_month(p_s, p_n) as m) x
$$;

-- ---------------------------------------------------------------------------
-- Gatilhos: parts_per_year imutável; S8 pelo mês da ocorrência
-- ---------------------------------------------------------------------------

-- Forma, início e autoria da série nunca mudam; série excluída não muda mais.
-- Podem mudar: nature, last_number, version, deleted_at e deleted_by.
create or replace function public.commitment_series_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.id <> old.id or new.context_id <> old.context_id or new.kind <> old.kind
     or new.first_due_month <> old.first_due_month or new.first_number <> old.first_number
     or new.installment_total is distinct from old.installment_total
     or new.parts_per_year is distinct from old.parts_per_year or new.currency <> old.currency
     or new.created_by <> old.created_by or new.created_at <> old.created_at
     or old.deleted_at is not null then
    raise exception 'campo_imutavel' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

-- S4, S5, S6 e S8 no fim da transação (igual à 0003, inclusive na exclusão física; S8 por clarevo_series_month).
create or replace function public.clarevo_check_series_consistency()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sid uuid;
  v_s public.commitment_series%rowtype;
begin
  if tg_table_name = 'commitment_series' then
    v_sid := new.id;
  elsif tg_op = 'DELETE' then
    v_sid := old.series_id;
  else
    v_sid := new.series_id;
  end if;
  select * into v_s from public.commitment_series where id = v_sid;
  -- Contexto (ou série inteira) apagado na mesma transação: não sobra série para conferir.
  if not found then
    return null;
  end if;
  -- S3: apagar a linha de um número "excluído só neste mês" (ou tirado do ano) faria a geração recriá-lo.
  if tg_op = 'DELETE' and tg_table_name = 'commitments' then
    if old.series_skipped and not exists (select 1 from public.commitments
                                           where series_id = v_sid and occurrence_number = old.occurrence_number
                                             and series_skipped) then
      raise exception 'serie_inconsistente' using errcode = '23514';
    end if;
  end if;
  if (v_s.deleted_at is not null and exists (                                         -- S6
        select 1 from public.commitments where series_id = v_sid and deleted_at is null))
     or exists (select 1 from public.commitments c                                      -- S4 e S8
                 where c.series_id = v_sid and c.deleted_at is null
                   and (c.occurrence_number < v_s.first_number
                        or c.occurrence_number > coalesce(v_s.last_number, c.occurrence_number)
                        or date_trunc('month', c.due_on::timestamp)::date
                           <> public.clarevo_series_month(v_s, c.occurrence_number)))
     or not exists (select 1 from public.series_terms t                                 -- S5
                     where t.series_id = v_sid and t.superseded_at is null and t.from_number = v_s.first_number)
     or exists (select 1 from public.series_terms t
                 where t.series_id = v_sid and t.superseded_at is null and t.from_number < v_s.first_number) then
    raise exception 'serie_inconsistente' using errcode = '23514';
  end if;
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Validação da série nova: mesmas regras e ordem de validateSeriesDraft no core, com o tipo anual.
-- ---------------------------------------------------------------------------
drop function public.clarevo_validate_series(uuid, text, text, text, text, bigint, text, integer, date, integer, integer, date);
create or replace function public.clarevo_validate_series(
  p_actor uuid, p_kind text, p_nature text, p_description text, p_category text, p_amount_cents bigint,
  p_amount_mode text, p_due_day integer, p_first_due_month date, p_first_number integer,
  p_installment_total integer, p_last_month date, p_parts_per_year integer
)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_month date := date_trunc('month', public.clarevo_today(p_actor)::timestamp)::date;
  v_anchor date;
  v_d int;
begin
  if p_kind is null or p_kind not in ('mensal', 'parcelada', 'anual') then
    raise exception 'tipo_invalido' using errcode = '22023';
  end if;
  if (p_kind in ('mensal', 'anual') and p_nature is distinct from 'conta')
     or (p_kind = 'parcelada' and (p_nature is null or p_nature not in ('financiamento', 'compra_parcelada', 'outro_parcelamento'))) then
    raise exception 'natureza_invalida' using errcode = '22023';
  end if;
  perform public.clarevo_validate_series_term(p_amount_cents, p_description, p_category, p_amount_mode, p_due_day);
  -- Anual: até 23 meses depois (a conta do ano seguinte quando a deste já passou ou foi paga).
  if p_first_due_month is null or extract(day from p_first_due_month) <> 1
     or p_first_due_month < (v_month - interval '1 month')::date
     or p_first_due_month > (v_month + case when p_kind = 'anual' then interval '23 months' else interval '12 months' end)::date then
    raise exception 'inicio_fora_do_intervalo' using errcode = '22023';
  end if;
  if (p_kind = 'parcelada' and (p_installment_total is null or p_installment_total not between 2 and 480))
     or (p_kind <> 'parcelada' and p_installment_total is not null) then
    raise exception 'parcelas_invalidas' using errcode = '22023';
  end if;
  if (p_kind = 'anual' and (p_parts_per_year is null or p_parts_per_year not between 1 and 12))
     or (p_kind <> 'anual' and p_parts_per_year is not null) then
    raise exception 'parcelas_no_ano_invalidas' using errcode = '22023';
  end if;
  if (p_kind = 'parcelada' and (p_first_number is null or p_first_number not between 1 and p_installment_total))
     or (p_kind = 'anual' and (p_first_number is null or p_first_number not between 1 and p_parts_per_year))
     or (p_kind = 'mensal' and coalesce(p_first_number, 1) <> 1) then
    raise exception 'parcela_inicial_invalida' using errcode = '22023';
  end if;
  if p_kind = 'anual' then
    -- Último mês: o da última parcela de um ano, de 0 a 49 anos depois do primeiro (até 50 anos de contas).
    if p_last_month is not null then
      v_anchor := (p_first_due_month - make_interval(months => p_first_number - 1))::date;
      v_d := public.clarevo_months_between(v_anchor, p_last_month);
      if extract(day from p_last_month) <> 1 or v_d < 0 or v_d % 12 <> p_parts_per_year - 1 or v_d / 12 > 49 then
        raise exception 'fim_invalido' using errcode = '22023';
      end if;
    end if;
  elsif (p_kind = 'parcelada' and p_last_month is not null)
     or (p_kind = 'mensal' and p_last_month is not null
         and (extract(day from p_last_month) <> 1 or p_last_month < p_first_due_month
              or p_last_month > (p_first_due_month + interval '599 months')::date)) then
    raise exception 'fim_invalido' using errcode = '22023';
  end if;
end;
$$;

-- Conta a pagar no formato da visão commitment_items (mais deleted_at, deleted_by e series_skipped).
create or replace function public.clarevo_commitment_json(p_commitment_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select to_jsonb(c) || jsonb_build_object('paid_record_id', r.id, 'paid_on', r.occurred_on,
                                           'paid_amount_cents', r.amount_cents, 'paid_account_id', r.account_id,
                                           'series_kind', s.kind, 'series_nature', s.nature,
                                           'series_installment_total', s.installment_total,
                                           'series_parts_per_year', s.parts_per_year)
    from public.commitments c
    left join public.financial_records r on r.commitment_id = c.id and r.deleted_at is null
    left join public.commitment_series s on s.id = c.series_id
   where c.id = p_commitment_id
$$;

-- ---------------------------------------------------------------------------
-- Geração. Mensal e parcelada: do 1º dia do mês anterior a hoje até o fim do mês seguinte (0003).
-- Anual: o ano inteiro quando a 1ª parcela dele vence até o fim do 2º mês depois do mês de hoje, menos as parcelas
-- de meses antes do mês anterior a hoje ("sem conta registrada"). No máximo dois anos por chamada: o ano anterior
-- ao último que já entrou termina antes do piso. Pior vencimento: fim do 13º mês depois do mês de hoje (S10).
-- No fuso de quem criou a série; gerar de novo não cria nada.
-- ---------------------------------------------------------------------------
create or replace function public.clarevo_materialize_series(p_series_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_s public.commitment_series%rowtype;
  v_t public.series_terms%rowtype;
  v_today date;
  v_floor date;
  v_top date;
  v_anchor date;
  v_year_top int;
  v_from int;
  v_to int;
  v_due date;
  v_created int := 0;
  v_overdue int := 0;
begin
  select * into v_s from public.commitment_series where id = p_series_id for update;        -- trava 1: série
  if not found or v_s.deleted_at is not null then
    return jsonb_build_object('created', 0, 'created_overdue', 0);
  end if;
  -- Quem criou a série perdeu a escrita no contexto: nada é gerado em nome dessa pessoa.
  if not exists (select 1 from public.context_memberships m
                  where m.context_id = v_s.context_id and m.person_id = v_s.created_by
                    and m.revoked_at is null and m.can_read and m.can_write) then
    return jsonb_build_object('created', 0, 'created_overdue', 0);
  end if;
  v_today := public.clarevo_today(v_s.created_by);
  v_floor := (date_trunc('month', v_today::timestamp) - interval '1 month')::date;
  if v_s.kind = 'anual' then
    v_top := (date_trunc('month', v_today::timestamp) + interval '2 months')::date;
    v_anchor := public.clarevo_series_month(v_s, 1);
    if v_top < v_anchor then
      return jsonb_build_object('created', 0, 'created_overdue', 0);
    end if;
    v_year_top := public.clarevo_months_between(v_anchor, v_top) / 12;                       -- último ano que já entrou
    v_from := greatest(v_s.first_number, (v_year_top - 1) * v_s.parts_per_year + 1);
    v_to   := (v_year_top + 1) * v_s.parts_per_year;
  else
    v_top  := (date_trunc('month', v_today::timestamp) + interval '1 month')::date;
    v_from := greatest(v_s.first_number, v_s.first_number + public.clarevo_months_between(v_s.first_due_month, v_floor));
    v_to   := v_s.first_number + public.clarevo_months_between(v_s.first_due_month, v_top);
  end if;
  if v_s.last_number is not null then
    v_to := least(v_to, v_s.last_number);
  end if;
  for v_n in v_from .. v_to loop
    -- Parcela de mês antes do piso: fica "sem conta registrada".
    continue when public.clarevo_series_month(v_s, v_n) < v_floor;
    -- Viva, ou excluída só neste mês (ou tirada do ano): não cria. Removida por encerramento: recria (retomar).
    continue when exists (select 1 from public.commitments c
                           where c.series_id = v_s.id and c.occurrence_number = v_n
                             and (c.deleted_at is null or c.series_skipped));
    select * into v_t from public.series_terms
     where series_id = v_s.id and superseded_at is null and from_number <= v_n
     order by from_number desc limit 1;
    v_due := public.clarevo_series_due(v_s, v_n, v_t.due_day);
    insert into public.commitments (context_id, description, amount_cents, currency, due_on, status, category,
                                    created_by, series_id, occurrence_number, amount_is_estimate)
    values (v_s.context_id, v_t.description, v_t.amount_cents, v_s.currency, v_due, 'aberto', v_t.category,
            v_s.created_by, v_s.id, v_n, v_t.amount_mode = 'variavel')
    on conflict (series_id, occurrence_number) where series_id is not null and deleted_at is null do nothing;
    if found then
      v_created := v_created + 1;
      if v_due < v_today then
        v_overdue := v_overdue + 1;
      end if;
    end if;
  end loop;
  return jsonb_build_object('created', v_created, 'created_overdue', v_overdue);
end;
$$;

-- ---------------------------------------------------------------------------
-- Funções de série da 0003 com o tipo anual (mesma estrutura, hash, repetição e retorno)
-- ---------------------------------------------------------------------------

-- Um parâmetro a mais no fim, p_parts_per_year: com ele nulo, o hash é idêntico ao da 0003 (repetição em trânsito
-- continua reconhecida, e o cliente antigo, com 13 argumentos nomeados, continua funcionando).
-- Anual: last_number = parts_per_year × (anos até o último mês + 1); o limite de 100 inclui as contas do ano.
drop function public.create_series(text, uuid, text, text, text, text, bigint, text, integer, date, integer, integer, date);
create or replace function public.create_series(
  p_idempotency_key text,
  p_context_id uuid,
  p_kind text,
  p_nature text,
  p_description text,
  p_category text,
  p_amount_cents bigint,
  p_amount_mode text,
  p_due_day integer,
  p_first_due_month date,
  p_first_number integer,
  p_installment_total integer,
  p_last_month date,
  p_parts_per_year integer default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_description text := public.clarevo_trim(p_description);
  v_category text := nullif(public.clarevo_trim(p_category), '');
  v_args jsonb;
  v_hash text;
  v_op public.record_operations%rowtype;
  v_s public.commitment_series%rowtype;
  v_floor date;
  v_r jsonb;
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  perform public.clarevo_check_key(p_idempotency_key);
  v_args := jsonb_build_array('criar_serie', p_context_id, p_kind, p_nature, v_description, v_category, p_amount_cents,
                              p_amount_mode, p_due_day, p_first_due_month, p_first_number, p_installment_total,
                              p_last_month);
  if p_parts_per_year is not null then
    v_args := v_args || jsonb_build_array(p_parts_per_year);
  end if;
  v_hash := md5(v_args::text);
  perform pg_advisory_xact_lock(hashtext('op:' || v_uid::text || ':' || p_idempotency_key));

  select * into v_op from public.record_operations where actor_id = v_uid and idempotency_key = p_idempotency_key;
  if found then
    if v_op.action <> 'criar_serie' or v_op.request_hash <> v_hash then
      raise exception 'chave_reutilizada' using errcode = 'PT409';
    end if;
    if not public.context_permission(v_op.context_id, 'read') then
      raise exception 'nao_encontrado' using errcode = 'P0002';
    end if;
    return public.clarevo_series_result(v_op.target_id, 0);
  end if;

  if not public.context_permission(p_context_id, 'write') then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  perform public.clarevo_validate_series(v_uid, p_kind, p_nature, v_description, v_category, p_amount_cents, p_amount_mode,
                                         p_due_day, p_first_due_month, p_first_number, p_installment_total, p_last_month,
                                         p_parts_per_year);

  -- Limite de séries ativas (gastos fixos, parcelamentos e contas do ano): sem término ou com o mês da última conta
  -- a partir do mês anterior a hoje.
  perform pg_advisory_xact_lock(hashtext('series:' || p_context_id::text));
  v_floor := (date_trunc('month', public.clarevo_today(v_uid)::timestamp) - interval '1 month')::date;
  if (select count(*) from public.commitment_series s
       where s.context_id = p_context_id and s.deleted_at is null
         and (s.last_number is null or public.clarevo_series_month(s, s.last_number) >= v_floor)) >= 100 then
    raise exception 'limite_de_gastos_fixos' using errcode = 'PT409';
  end if;

  insert into public.commitment_series (context_id, kind, nature, first_due_month, first_number, last_number,
                                        installment_total, parts_per_year, currency, created_by)
  values (p_context_id, p_kind, p_nature, p_first_due_month,
          case when p_kind = 'mensal' then 1 else p_first_number end,
          case when p_kind = 'parcelada' then p_installment_total
               when p_last_month is null then null
               when p_kind = 'anual'
                 then (public.clarevo_months_between((p_first_due_month - make_interval(months => p_first_number - 1))::date,
                                                     p_last_month) / 12 + 1) * p_parts_per_year
               else 1 + public.clarevo_months_between(p_first_due_month, p_last_month) end,
          p_installment_total, p_parts_per_year, (select currency from public.financial_contexts where id = p_context_id), v_uid)
  returning * into v_s;

  insert into public.series_terms (series_id, context_id, from_number, description, category, amount_cents,
                                   amount_mode, due_day, created_by)
  values (v_s.id, v_s.context_id, v_s.first_number, v_description, v_category, p_amount_cents, p_amount_mode, p_due_day, v_uid);

  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id, target_id)
  values (v_uid, p_idempotency_key, 'criar_serie', p_context_id, v_hash, null, null, v_s.id);

  v_r := public.clarevo_materialize_series(v_s.id);
  return public.clarevo_series_result(v_s.id, (v_r ->> 'created')::int);
end;
$$;

-- "Esta e as próximas" (0003). Anual: o mês de cada parcela é estrutural e só o dia muda; sem término, até a última
-- parcela do ano que começa até 12 meses depois do mês atual (reajuste programado, como a sugestão de referência).
create or replace function public.update_series_from(
  p_idempotency_key text,
  p_series_id uuid,
  p_expected_version integer,
  p_from_number integer,
  p_expected_affected jsonb,
  p_nature text,
  p_description text,
  p_category text,
  p_amount_cents bigint,
  p_amount_mode text,
  p_due_day integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_description text := public.clarevo_trim(p_description);
  v_category text := nullif(public.clarevo_trim(p_category), '');
  v_hash text;
  v_op public.record_operations%rowtype;
  v_s public.commitment_series%rowtype;
  v_month date;
  v_max int;
  v_actual jsonb;
  v_changed int;
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  perform public.clarevo_check_key(p_idempotency_key);
  v_hash := md5(jsonb_build_array('alterar_serie', p_series_id, p_expected_version, p_from_number, p_expected_affected,
                                  p_nature, v_description, v_category, p_amount_cents, p_amount_mode, p_due_day)::text);
  perform pg_advisory_xact_lock(hashtext('op:' || v_uid::text || ':' || p_idempotency_key));

  select * into v_op from public.record_operations where actor_id = v_uid and idempotency_key = p_idempotency_key;
  if found then
    if v_op.action <> 'alterar_serie' or v_op.request_hash <> v_hash then
      raise exception 'chave_reutilizada' using errcode = 'PT409';
    end if;
    if not public.context_permission(v_op.context_id, 'read') then
      raise exception 'nao_encontrado' using errcode = 'P0002';
    end if;
    return public.clarevo_series_result(v_op.target_id, 0);
  end if;

  v_s := public.clarevo_lock_series(p_series_id);                                          -- trava 1: série
  -- Versão ausente (NULL) também é recusada.
  if p_expected_version is distinct from v_s.version then
    raise exception 'versao_desatualizada' using errcode = 'PT409', detail = 'versao_atual=' || v_s.version;
  end if;
  -- Até o último número; sem término, até 12 meses depois do mês atual (anual: até o fim do ano que começa nele).
  v_month := date_trunc('month', public.clarevo_today(v_uid)::timestamp)::date;
  v_max := coalesce(v_s.last_number,
             case when v_s.kind = 'anual'
                  then (greatest(0, public.clarevo_months_between(public.clarevo_series_month(v_s, 1),
                                                                  (v_month + interval '12 months')::date)) / 12 + 1)
                       * v_s.parts_per_year
                  else v_s.first_number + public.clarevo_months_between(v_s.first_due_month, v_month) + 12 end);
  if p_from_number is null or p_from_number < v_s.first_number or p_from_number > v_max then
    raise exception 'numero_fora_da_serie' using errcode = '22023';
  end if;
  perform public.clarevo_validate_series_term(p_amount_cents, v_description, v_category, p_amount_mode, p_due_day);
  -- Gasto fixo e conta do ano: 'conta'; parcelamento: um dos três tipos.
  if p_nature is null or (v_s.kind <> 'parcelada') <> (p_nature = 'conta')
     or p_nature not in ('conta', 'financiamento', 'compra_parcelada', 'outro_parcelamento') then
    raise exception 'natureza_invalida' using errcode = '22023';
  end if;
  perform 1 from public.commitments
   where series_id = v_s.id and deleted_at is null and occurrence_number >= p_from_number
   order by occurrence_number for update;                                                 -- trava 2: contas
  if exists (select 1 from public.commitments where series_id = v_s.id and deleted_at is null
               and occurrence_number = p_from_number and status = 'quitado') then
    raise exception 'inicio_em_conta_paga' using errcode = 'PT409';
  end if;
  -- Afetadas: a conta escolhida (sempre) e as seguintes em aberto que não foram alteradas só no mês (ou no ano).
  -- Sem geração antes da comparação: a virada do mês durante a confirmação não gera recusa falsa.
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'version', version) order by occurrence_number), '[]'::jsonb)
    into v_actual
    from public.commitments
   where series_id = v_s.id and deleted_at is null and status = 'aberto'
     and (occurrence_number = p_from_number or (occurrence_number > p_from_number and not series_override));
  if not public.clarevo_same_refs(v_actual, p_expected_affected) then
    raise exception 'versao_desatualizada' using errcode = 'PT409', detail = 'contas_afetadas_mudaram';
  end if;

  update public.series_terms set superseded_at = now(), superseded_by = v_uid
   where series_id = v_s.id and superseded_at is null and from_number >= p_from_number;
  insert into public.series_terms (series_id, context_id, from_number, description, category, amount_cents,
                                   amount_mode, due_day, created_by)
  values (v_s.id, v_s.context_id, p_from_number, v_description, v_category, p_amount_cents, p_amount_mode, p_due_day, v_uid);
  update public.commitments c
     set description = v_description, category = v_category, amount_cents = p_amount_cents,
         amount_is_estimate = (p_amount_mode = 'variavel'), series_override = false,
         due_on = public.clarevo_series_due(v_s, c.occurrence_number, p_due_day),
         version = c.version + 1
   where c.id in (select (e ->> 'id')::uuid from jsonb_array_elements(v_actual) e);
  get diagnostics v_changed = row_count;
  -- O tipo do parcelamento é da série inteira e é lido pela junção: nenhuma conta copia o tipo.
  update public.commitment_series set nature = p_nature, version = version + 1 where id = v_s.id;

  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id, target_id)
  values (v_uid, p_idempotency_key, 'alterar_serie', v_s.context_id, v_hash, null, null, v_s.id);

  -- Contas novas já nascem com a vigência nova.
  perform public.clarevo_materialize_series(v_s.id);
  return public.clarevo_series_result(v_s.id, v_changed);
end;
$$;

-- Encerrar (último número p_last_number) ou retomar (número maior, ou nulo para "sem data para terminar").
-- Anual: último número nulo ou de first_number - 1 a 50 × parts_per_year. Retomar recria dentro da janela anual.
create or replace function public.end_series(
  p_idempotency_key text,
  p_series_id uuid,
  p_expected_version integer,
  p_last_number integer,
  p_expected_affected jsonb
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
  v_s public.commitment_series%rowtype;
  v_floor date;
  v_actual jsonb;
  v_changed int;
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  perform public.clarevo_check_key(p_idempotency_key);
  v_hash := md5(jsonb_build_array('encerrar_serie', p_series_id, p_expected_version, p_last_number, p_expected_affected)::text);
  perform pg_advisory_xact_lock(hashtext('op:' || v_uid::text || ':' || p_idempotency_key));

  select * into v_op from public.record_operations where actor_id = v_uid and idempotency_key = p_idempotency_key;
  if found then
    if v_op.action <> 'encerrar_serie' or v_op.request_hash <> v_hash then
      raise exception 'chave_reutilizada' using errcode = 'PT409';
    end if;
    if not public.context_permission(v_op.context_id, 'read') then
      raise exception 'nao_encontrado' using errcode = 'P0002';
    end if;
    return public.clarevo_series_result(v_op.target_id, 0);
  end if;

  v_s := public.clarevo_lock_series(p_series_id);                                          -- trava 1: série
  if p_expected_version is distinct from v_s.version then
    raise exception 'versao_desatualizada' using errcode = 'PT409', detail = 'versao_atual=' || v_s.version;
  end if;
  if (v_s.kind = 'mensal' and p_last_number is not null and p_last_number not between 0 and 600)
     or (v_s.kind = 'parcelada' and (p_last_number is null or p_last_number < v_s.first_number - 1
                                     or p_last_number > v_s.installment_total))
     or (v_s.kind = 'anual' and p_last_number is not null
         and p_last_number not between v_s.first_number - 1 and 50 * v_s.parts_per_year) then
    raise exception 'fim_invalido' using errcode = '22023';
  end if;
  -- Retomar uma série que já não contava no limite (mês da última conta antes do mês anterior a hoje) a faz contar
  -- de novo: mesmo critério e mesma trava de create_series. Sem inversão: create_series só pega essa trava.
  v_floor := (date_trunc('month', public.clarevo_today(v_uid)::timestamp) - interval '1 month')::date;
  if (p_last_number is null or public.clarevo_series_month(v_s, p_last_number) >= v_floor)
     and not (v_s.last_number is null or public.clarevo_series_month(v_s, v_s.last_number) >= v_floor) then
    perform pg_advisory_xact_lock(hashtext('series:' || v_s.context_id::text));
    if (select count(*) from public.commitment_series s
         where s.context_id = v_s.context_id and s.deleted_at is null and s.id <> v_s.id
           and (s.last_number is null or public.clarevo_series_month(s, s.last_number) >= v_floor)) >= 100 then
      raise exception 'limite_de_gastos_fixos' using errcode = 'PT409';
    end if;
  end if;
  -- Trava as contas depois do último número e só então confere: um pagamento em andamento termina antes.
  perform 1 from public.commitments
   where series_id = v_s.id and deleted_at is null and occurrence_number > coalesce(p_last_number, 2147483647)
   order by occurrence_number for update;                                                 -- trava 2: contas
  if exists (select 1 from public.commitments
              where series_id = v_s.id and deleted_at is null and status = 'quitado'
                and occurrence_number > coalesce(p_last_number, 2147483647)) then
    raise exception 'serie_tem_pagamento_posterior' using errcode = 'PT409';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'version', version) order by occurrence_number), '[]'::jsonb)
    into v_actual
    from public.commitments
   where series_id = v_s.id and deleted_at is null and status = 'aberto'
     and occurrence_number > coalesce(p_last_number, 2147483647);
  if not public.clarevo_same_refs(v_actual, p_expected_affected) then
    raise exception 'versao_desatualizada' using errcode = 'PT409', detail = 'contas_afetadas_mudaram';
  end if;

  update public.commitments
     set deleted_at = now(), deleted_by = v_uid, version = version + 1
   where id in (select (e ->> 'id')::uuid from jsonb_array_elements(v_actual) e);
  get diagnostics v_changed = row_count;
  update public.commitment_series set last_number = p_last_number, version = version + 1 where id = v_s.id;

  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id, target_id)
  values (v_uid, p_idempotency_key, 'encerrar_serie', v_s.context_id, v_hash, null, null, v_s.id);

  -- Retomar recria, dentro da janela, as contas removidas pelo encerramento.
  perform public.clarevo_materialize_series(v_s.id);
  return public.clarevo_series_result(v_s.id, v_changed);
end;
$$;

-- Mesma assinatura e hash da 0003. Ocorrência de série: o vencimento fica no mês dela (S8, por clarevo_series_month)
-- e a conta passa a ser "alterada só neste mês".
create or replace function public.update_commitment(
  p_idempotency_key text,
  p_commitment_id uuid,
  p_expected_version integer,
  p_amount_cents bigint,
  p_due_on date,
  p_description text,
  p_category text default null,
  p_amount_is_estimate boolean default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_description text := public.clarevo_trim(p_description);
  v_category text := nullif(public.clarevo_trim(p_category), '');
  v_args jsonb;
  v_hash text;
  v_op public.record_operations%rowtype;
  v_c public.commitments%rowtype;
  v_s public.commitment_series%rowtype;
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  perform public.clarevo_check_key(p_idempotency_key);
  v_args := jsonb_build_array('editar_compromisso', p_commitment_id, p_expected_version, p_amount_cents, p_due_on,
                              v_description, v_category);
  if p_amount_is_estimate is not null then
    v_args := v_args || jsonb_build_array(p_amount_is_estimate);
  end if;
  v_hash := md5(v_args::text);
  perform pg_advisory_xact_lock(hashtext('op:' || v_uid::text || ':' || p_idempotency_key));

  select * into v_op from public.record_operations where actor_id = v_uid and idempotency_key = p_idempotency_key;
  if found then
    if v_op.action <> 'editar_compromisso' or v_op.request_hash <> v_hash then
      raise exception 'chave_reutilizada' using errcode = 'PT409';
    end if;
    if not public.context_permission(v_op.context_id, 'read') then
      raise exception 'nao_encontrado' using errcode = 'P0002';
    end if;
    return public.clarevo_commitment_result(v_op.commitment_id, v_op.record_id);
  end if;

  v_c := public.clarevo_lock_commitment(p_commitment_id);
  -- Versão ausente (NULL) também é recusada.
  if p_expected_version is distinct from v_c.version then
    raise exception 'versao_desatualizada' using errcode = 'PT409', detail = 'versao_atual=' || v_c.version;
  end if;
  if v_c.status <> 'aberto' then
    raise exception 'compromisso_quitado' using errcode = 'PT409';
  end if;
  -- Só nulo (mantém) ou falso (valor informado): a estimativa nasce só da vigência da série.
  if p_amount_is_estimate then
    raise exception 'estimativa_invalida' using errcode = '22023';
  end if;
  perform public.clarevo_validate_commitment(v_uid, p_amount_cents, p_due_on, v_description, v_category,
                                             p_due_on is distinct from v_c.due_on);
  if v_c.series_id is not null then
    -- Colunas imutáveis: leitura sem trava.
    select * into v_s from public.commitment_series where id = v_c.series_id;
    if date_trunc('month', p_due_on::timestamp)::date <> public.clarevo_series_month(v_s, v_c.occurrence_number) then
      raise exception 'vencimento_fora_do_mes' using errcode = '22023';
    end if;
  end if;

  update public.commitments
     set amount_cents = p_amount_cents,
         due_on = p_due_on,
         description = v_description,
         category = v_category,
         amount_is_estimate = coalesce(p_amount_is_estimate, amount_is_estimate),
         series_override = series_override or series_id is not null,
         version = version + 1
   where id = v_c.id;

  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id)
  values (v_uid, p_idempotency_key, 'editar_compromisso', v_c.context_id, v_hash, null, v_c.id);

  return public.clarevo_commitment_result(v_c.id, null);
end;
$$;

-- ---------------------------------------------------------------------------
-- Contas do ano: informar o valor do ano e tirar as parcelas do ano (atômico, idempotente, versionado)
-- p_number: qualquer número do ano (de first_number a last_number); o ano vai de ⌊(n - 1) / k⌋ × k + 1 a + k - 1.
-- p_expected_affected: [{id, version}] das parcelas que a pessoa confirmou, como vieram de commitment_items.
-- Retorno: {series, occurrences, changed}, como as outras funções de série; a série não muda de versão.
-- ---------------------------------------------------------------------------

-- "Informar o valor de 2027": as parcelas do ano em aberto e estimadas recebem o valor, deixam de ser estimadas e
-- ficam alteradas só naquele ano. Pagas, já informadas e alteradas com valor não estimado não mudam.
create or replace function public.inform_series_year(
  p_idempotency_key text,
  p_series_id uuid,
  p_number integer,
  p_expected_affected jsonb,
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
  v_s public.commitment_series%rowtype;
  v_lo int;
  v_hi int;
  v_actual jsonb;
  v_changed int;
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  perform public.clarevo_check_key(p_idempotency_key);
  v_hash := md5(jsonb_build_array('informar_ano', p_series_id, p_number, p_expected_affected, p_amount_cents)::text);
  perform pg_advisory_xact_lock(hashtext('op:' || v_uid::text || ':' || p_idempotency_key));

  select * into v_op from public.record_operations where actor_id = v_uid and idempotency_key = p_idempotency_key;
  if found then
    if v_op.action <> 'informar_ano' or v_op.request_hash <> v_hash then
      raise exception 'chave_reutilizada' using errcode = 'PT409';
    end if;
    if not public.context_permission(v_op.context_id, 'read') then
      raise exception 'nao_encontrado' using errcode = 'P0002';
    end if;
    return public.clarevo_series_result(v_op.target_id, 0);
  end if;

  v_s := public.clarevo_lock_series(p_series_id);                                          -- trava 1: série
  if v_s.kind <> 'anual' then
    raise exception 'tipo_invalido' using errcode = '22023';
  end if;
  if p_number is null or p_number < v_s.first_number or p_number > coalesce(v_s.last_number, p_number) then
    raise exception 'numero_fora_da_serie' using errcode = '22023';
  end if;
  if p_amount_cents is null or p_amount_cents < 1 then
    raise exception 'valor_invalido' using errcode = '22023';
  end if;
  if p_amount_cents > 999999999 then
    raise exception 'valor_acima_do_limite' using errcode = '22023';
  end if;
  v_lo := ((p_number - 1) / v_s.parts_per_year) * v_s.parts_per_year + 1;
  v_hi := v_lo + v_s.parts_per_year - 1;
  perform 1 from public.commitments
   where series_id = v_s.id and deleted_at is null and occurrence_number between v_lo and v_hi
   order by occurrence_number for update;                                                 -- trava 2: contas
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'version', version) order by occurrence_number), '[]'::jsonb)
    into v_actual
    from public.commitments
   where series_id = v_s.id and deleted_at is null and status = 'aberto' and amount_is_estimate
     and occurrence_number between v_lo and v_hi;
  -- Nenhuma parcela a informar também é recusa: o que a pessoa viu mudou.
  if jsonb_array_length(v_actual) = 0 or not public.clarevo_same_refs(v_actual, p_expected_affected) then
    raise exception 'versao_desatualizada' using errcode = 'PT409', detail = 'contas_afetadas_mudaram';
  end if;

  update public.commitments
     set amount_cents = p_amount_cents, amount_is_estimate = false, series_override = true, version = version + 1
   where id in (select (e ->> 'id')::uuid from jsonb_array_elements(v_actual) e);
  get diagnostics v_changed = row_count;

  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id, target_id)
  values (v_uid, p_idempotency_key, 'informar_ano', v_s.context_id, v_hash, null, null, v_s.id);

  return public.clarevo_series_result(v_s.id, v_changed);
end;
$$;

-- "Tirar as parcelas de 2027" (e a segunda etapa de "Paguei o ano todo de uma vez"): exclui as parcelas do ano em
-- aberto, estimadas ou não, com a marca "excluída só neste mês". Elas nunca voltam, nem se um pagamento for desfeito.
-- As pagas continuam e a série segue no ano seguinte. Parcela em aberto não tem gasto vinculado: I1 continua valendo.
create or replace function public.skip_series_year(
  p_idempotency_key text,
  p_series_id uuid,
  p_number integer,
  p_expected_affected jsonb
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
  v_s public.commitment_series%rowtype;
  v_lo int;
  v_hi int;
  v_actual jsonb;
  v_changed int;
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  perform public.clarevo_check_key(p_idempotency_key);
  v_hash := md5(jsonb_build_array('tirar_ano', p_series_id, p_number, p_expected_affected)::text);
  perform pg_advisory_xact_lock(hashtext('op:' || v_uid::text || ':' || p_idempotency_key));

  select * into v_op from public.record_operations where actor_id = v_uid and idempotency_key = p_idempotency_key;
  if found then
    if v_op.action <> 'tirar_ano' or v_op.request_hash <> v_hash then
      raise exception 'chave_reutilizada' using errcode = 'PT409';
    end if;
    if not public.context_permission(v_op.context_id, 'read') then
      raise exception 'nao_encontrado' using errcode = 'P0002';
    end if;
    return public.clarevo_series_result(v_op.target_id, 0);
  end if;

  v_s := public.clarevo_lock_series(p_series_id);                                          -- trava 1: série
  if v_s.kind <> 'anual' then
    raise exception 'tipo_invalido' using errcode = '22023';
  end if;
  if p_number is null or p_number < v_s.first_number or p_number > coalesce(v_s.last_number, p_number) then
    raise exception 'numero_fora_da_serie' using errcode = '22023';
  end if;
  v_lo := ((p_number - 1) / v_s.parts_per_year) * v_s.parts_per_year + 1;
  v_hi := v_lo + v_s.parts_per_year - 1;
  perform 1 from public.commitments
   where series_id = v_s.id and deleted_at is null and occurrence_number between v_lo and v_hi
   order by occurrence_number for update;                                                 -- trava 2: contas
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'version', version) order by occurrence_number), '[]'::jsonb)
    into v_actual
    from public.commitments
   where series_id = v_s.id and deleted_at is null and status = 'aberto'
     and occurrence_number between v_lo and v_hi;
  if jsonb_array_length(v_actual) = 0 or not public.clarevo_same_refs(v_actual, p_expected_affected) then
    raise exception 'versao_desatualizada' using errcode = 'PT409', detail = 'contas_afetadas_mudaram';
  end if;

  update public.commitments
     set deleted_at = now(), deleted_by = v_uid, series_skipped = true, version = version + 1
   where id in (select (e ->> 'id')::uuid from jsonb_array_elements(v_actual) e);
  get diagnostics v_changed = row_count;

  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id, target_id)
  values (v_uid, p_idempotency_key, 'tirar_ano', v_s.context_id, v_hash, null, null, v_s.id);

  return public.clarevo_series_result(v_s.id, v_changed);
end;
$$;

-- ---------------------------------------------------------------------------
-- Visões: mesma lista e mesmas opções da 0003, com a coluna nova no fim.
-- ---------------------------------------------------------------------------
create or replace view public.commitment_items with (security_invoker = true) as
select c.id, c.context_id, c.description, c.amount_cents, c.currency, c.due_on, c.status, c.category,
       c.created_by, c.version, c.created_at, c.updated_at,
       r.id as paid_record_id, r.occurred_on as paid_on, r.amount_cents as paid_amount_cents, r.account_id as paid_account_id,
       c.series_id, c.occurrence_number, c.series_override, c.amount_is_estimate,
       s.kind as series_kind, s.nature as series_nature, s.installment_total as series_installment_total,
       s.parts_per_year as series_parts_per_year
  from public.commitments c
  left join public.financial_records r on r.commitment_id = c.id and r.deleted_at is null
  left join public.commitment_series s on s.id = c.series_id
 where c.deleted_at is null;
comment on view public.commitment_items is 'Contas a pagar não excluídas com o gasto vivo que as quitou (paid_* nulos quando em aberto) e a série, quando houver.';

-- Sem security_invoker e com security_barrier, como na 0003 (filtro de permissão explícito).
create or replace view public.series_items with (security_barrier = true) as
select s.id, s.context_id, s.kind, s.nature, s.first_due_month, s.first_number, s.last_number, s.installment_total,
       s.currency, s.created_by, s.version, s.created_at, s.updated_at,
       coalesce((select jsonb_agg(jsonb_build_object('from_number', t.from_number, 'description', t.description,
                   'category', t.category, 'amount_cents', t.amount_cents, 'amount_mode', t.amount_mode,
                   'due_day', t.due_day, 'created_at', t.created_at) order by t.from_number)
                   from public.series_terms t where t.series_id = s.id and t.superseded_at is null), '[]'::jsonb) as terms,
       coalesce((select jsonb_agg(c.occurrence_number order by c.occurrence_number)
                   from public.commitments c where c.series_id = s.id and c.series_skipped), '[]'::jsonb) as skipped_numbers,
       (select count(*) from public.commitments c
         where c.series_id = s.id and c.deleted_at is null and c.status = 'quitado')::int as paid_count,
       (select count(*) from public.commitments c
         where c.series_id = s.id and c.deleted_at is null and c.status = 'aberto')::int as open_count,
       exists (select 1 from public.context_memberships m where m.context_id = s.context_id and m.person_id = s.created_by
                 and m.revoked_at is null and m.can_read and m.can_write) as generating,
       s.parts_per_year
  from public.commitment_series s
 where s.deleted_at is null and public.context_permission(s.context_id, 'read');
comment on view public.series_items is 'Séries não excluídas que quem consulta pode ler, com vigências vivas, números pulados e contagens.';

-- ---------------------------------------------------------------------------
-- Privilégios: bloco inteiro da 0003 (idempotente), com a assinatura nova de create_series e as duas funções de
-- contas do ano. commitment_series, series_terms, commitments e as visões ficam sem insert, update ou delete diretos.
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
