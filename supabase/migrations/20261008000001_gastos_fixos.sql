-- Clarevo · migração 0003 · gastos fixos e parcelamentos (D-023, D-024).
-- Escrita de séries só por create_series / update_series_from / end_series / delete_series;
-- ocorrências também por sync_series_occurrences. Hash em JSON como na 0002 (D-021, regra 7).
-- Cada mês da série é uma conta a pagar comum (ocorrência): pagar, desfazer e "Ainda a pagar" seguem a 0002.
--
-- Invariantes:
-- S1. No máximo uma ocorrência viva por (série, número).
-- S2. Série, vigências e ocorrências no mesmo contexto (FKs compostas).
-- S3. Vínculo da ocorrência com a série e o número nunca mudam; "excluída só neste mês" é permanente.
-- S4. Ocorrência viva com first_number <= n <= coalesce(last_number, n).
-- S5. Existe vigência viva em first_number e nenhuma viva antes dele.
-- S6. Série excluída não tem ocorrência viva.
-- S7. Conta paga não muda (guarda da 0002, estendida à marca de estimado).
-- S8. O vencimento da ocorrência fica no mês dela.
-- I1 a I4 da 0002 continuam valendo para toda ocorrência.
-- Ordem de travas: série → contas a pagar (por número crescente) → registro.

-- ---------------------------------------------------------------------------
-- Séries, vigências e ocorrências
-- ---------------------------------------------------------------------------
create table public.commitment_series (
  id uuid primary key default gen_random_uuid(),
  context_id uuid not null references public.financial_contexts (id) on delete cascade,
  kind text not null check (kind in ('mensal', 'parcelada')),
  nature text not null check (nature in ('conta', 'financiamento', 'compra_parcelada', 'outro_parcelamento')),
  first_due_month date not null check (extract(day from first_due_month) = 1),
  first_number integer not null check (first_number between 1 and 480),
  -- Nulo: mensal sem término. first_number - 1: nenhuma conta (só por encerramento).
  last_number integer,
  installment_total integer,
  currency char(3) not null default 'BRL',
  created_by uuid not null references public.persons (id),
  version integer not null default 1 check (version >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references public.persons (id),
  constraint commitment_series_id_context_key unique (id, context_id),
  -- Os "is not null" da parcelada são explícitos: um check que dá NULL passa.
  constraint commitment_series_forma check (
    (kind = 'mensal' and nature = 'conta' and installment_total is null and first_number = 1
       and (last_number is null or last_number between 0 and 600))
    or (kind = 'parcelada' and nature <> 'conta' and installment_total is not null and last_number is not null
       and installment_total between 2 and 480
       and first_number <= installment_total
       and last_number between first_number - 1 and installment_total))
);
create index commitment_series_ctx on public.commitment_series (context_id) where deleted_at is null;
comment on table public.commitment_series is 'Gastos fixos e parcelamentos. Cada mês vira uma conta a pagar comum (ocorrência).';

-- Vigências: nunca editadas, só substituídas.
create table public.series_terms (
  id uuid primary key default gen_random_uuid(),
  series_id uuid not null,
  context_id uuid not null,
  from_number integer not null check (from_number >= 1),
  description text not null check (description = btrim(description) and char_length(description) between 1 and 80),
  category text check (category is null or (category = btrim(category) and char_length(category) between 1 and 40)),
  amount_cents bigint not null check (amount_cents between 1 and 999999999),
  amount_mode text not null check (amount_mode in ('fixo', 'variavel')),
  due_day smallint not null check (due_day between 1 and 31),
  created_by uuid not null references public.persons (id),
  created_at timestamptz not null default now(),
  superseded_at timestamptz,
  superseded_by uuid references public.persons (id),
  constraint series_terms_substituicao check ((superseded_at is null) = (superseded_by is null)),
  -- Em cascata: apagar o contexto inteiro (que apaga a série) continua possível.
  constraint series_terms_series_fk foreign key (series_id, context_id)
    references public.commitment_series (id, context_id) on delete cascade
);
create unique index series_terms_one_live on public.series_terms (series_id, from_number) where superseded_at is null;
comment on table public.series_terms is 'Vigências de uma série: valem do número from_number em diante, até a próxima viva.';

alter table public.commitments
  add column series_id uuid,
  add column occurrence_number integer check (occurrence_number >= 1),
  add column series_override boolean not null default false,   -- alterada só neste mês
  add column series_skipped boolean not null default false,    -- excluída só neste mês: nunca volta
  add column amount_is_estimate boolean not null default false,
  add constraint commitments_series_fk foreign key (series_id, context_id)
    references public.commitment_series (id, context_id),
  add constraint commitments_series_par check ((series_id is null) = (occurrence_number is null)),
  add constraint commitments_series_marcas check (
    series_id is not null or not (series_override or series_skipped or amount_is_estimate)),
  add constraint commitments_pulada_excluida check (not series_skipped or deleted_at is not null);
-- S1: excluídas não bloqueiam a recriação ao retomar uma série encerrada.
create unique index commitments_one_live_occurrence on public.commitments (series_id, occurrence_number)
  where series_id is not null and deleted_at is null;
create index commitments_series on public.commitments (series_id, occurrence_number) where series_id is not null;

-- Operações: alvo genérico para séries (e, nos próximos ciclos, referência, meta e movimento).
-- update_record e delete_record gravam commitment_id junto com record_id em 'editar' e 'excluir':
-- o primeiro ramo continua sem exigir commitment_id nulo.
alter table public.record_operations add column target_id uuid;
alter table public.record_operations drop constraint record_operations_action_check;
alter table public.record_operations add constraint record_operations_action_check check (action in (
  'criar', 'editar', 'excluir',
  'criar_compromisso', 'editar_compromisso', 'excluir_compromisso', 'pagar_compromisso', 'desfazer_pagamento',
  'criar_serie', 'alterar_serie', 'encerrar_serie', 'excluir_serie'));
alter table public.record_operations drop constraint record_operations_target_check;
alter table public.record_operations add constraint record_operations_target_check check (
  (action in ('criar', 'editar', 'excluir') and record_id is not null and target_id is null)
  or (action in ('criar_compromisso', 'editar_compromisso', 'excluir_compromisso')
      and commitment_id is not null and record_id is null and target_id is null)
  or (action in ('pagar_compromisso', 'desfazer_pagamento')
      and commitment_id is not null and record_id is not null and target_id is null)
  or (action in ('criar_serie', 'alterar_serie', 'encerrar_serie', 'excluir_serie')
      and target_id is not null and record_id is null and commitment_id is null));

-- ---------------------------------------------------------------------------
-- Gatilhos de proteção
-- ---------------------------------------------------------------------------
create or replace function public.commitments_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.id <> old.id or new.context_id <> old.context_id or new.created_by <> old.created_by
     or new.created_at <> old.created_at or new.currency <> old.currency
     or new.series_id is distinct from old.series_id
     or new.occurrence_number is distinct from old.occurrence_number
     or (old.series_skipped and not new.series_skipped) then
    raise exception 'campo_imutavel' using errcode = '42501';
  end if;
  -- Conta paga: o previsto (e a marca de estimado) não muda enquanto o pagamento existir.
  if old.status = 'quitado' and new.status = 'quitado'
     and (new.amount_cents <> old.amount_cents or new.due_on <> old.due_on or new.description <> old.description
          or new.category is distinct from old.category or new.amount_is_estimate <> old.amount_is_estimate) then
    raise exception 'campo_imutavel' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

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
     or new.installment_total is distinct from old.installment_total or new.currency <> old.currency
     or new.created_by <> old.created_by or new.created_at <> old.created_at
     or old.deleted_at is not null then
    raise exception 'campo_imutavel' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger commitment_series_guard
  before update on public.commitment_series
  for each row execute function public.commitment_series_guard();

-- Vigência: só a substituição (superseded_at e superseded_by), uma única vez, de nulo para preenchido.
create or replace function public.series_terms_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.superseded_at is not null or new.superseded_at is null
     or to_jsonb(new) - 'superseded_at' - 'superseded_by' <> to_jsonb(old) - 'superseded_at' - 'superseded_by' then
    raise exception 'campo_imutavel' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger series_terms_guard
  before update on public.series_terms
  for each row execute function public.series_terms_guard();

-- S4, S5, S6 e S8, conferidas no fim da transação (no modelo de clarevo_check_commitment_payment):
-- "esta e as próximas" e encerrar passam por estados intermediários.
-- security definer: dispara no commit com o papel de quem chamou e precisa ler as linhas excluídas.
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
  else
    v_sid := new.series_id;
  end if;
  select * into v_s from public.commitment_series where id = v_sid;
  -- Contexto apagado na mesma transação: não sobra série para conferir.
  if not found then
    return null;
  end if;
  if (v_s.deleted_at is not null and exists (                                         -- S6
        select 1 from public.commitments where series_id = v_sid and deleted_at is null))
     or exists (select 1 from public.commitments c                                      -- S4 e S8
                 where c.series_id = v_sid and c.deleted_at is null
                   and (c.occurrence_number < v_s.first_number
                        or c.occurrence_number > coalesce(v_s.last_number, c.occurrence_number)
                        or date_trunc('month', c.due_on::timestamp)::date
                           <> (v_s.first_due_month + make_interval(months => c.occurrence_number - v_s.first_number))::date))
     or not exists (select 1 from public.series_terms t                                 -- S5
                     where t.series_id = v_sid and t.superseded_at is null and t.from_number = v_s.first_number)
     or exists (select 1 from public.series_terms t
                 where t.series_id = v_sid and t.superseded_at is null and t.from_number < v_s.first_number) then
    raise exception 'serie_inconsistente' using errcode = '23514';
  end if;
  return null;
end;
$$;

create constraint trigger commitments_series_consistency
  after insert or update on public.commitments
  deferrable initially deferred
  for each row when (new.series_id is not null)
  execute function public.clarevo_check_series_consistency();
-- Também na inserção: série criada sem vigência em first_number é recusada no commit (S5).
create constraint trigger commitment_series_consistency
  after insert or update on public.commitment_series
  deferrable initially deferred
  for each row execute function public.clarevo_check_series_consistency();
create constraint trigger series_terms_consistency
  after insert or update on public.series_terms
  deferrable initially deferred
  for each row execute function public.clarevo_check_series_consistency();

-- ---------------------------------------------------------------------------
-- Funções auxiliares (sem execute para authenticated)
-- ---------------------------------------------------------------------------

-- Meses entre dois primeiros dias de mês.
create or replace function public.clarevo_months_between(p_from date, p_to date)
returns integer
language sql
immutable
set search_path = public
as $$
  select ((extract(year from p_to) * 12 + extract(month from p_to))
          - (extract(year from p_from) * 12 + extract(month from p_from)))::int
$$;

-- Vencimento da ocorrência n: dia escolhido no mês dela, limitado ao último dia do mês.
-- Sempre a partir do dia escolhido, nunca do vencimento anterior (31/01, 28/02, 31/03).
create or replace function public.clarevo_series_due_on(p_first_due_month date, p_first_number int, p_n int, p_due_day int)
returns date
language sql
immutable
set search_path = public
as $$
  select (m + (least(p_due_day, extract(day from (m + interval '1 month' - interval '1 day'))::int) - 1))::date
    from (select (p_first_due_month + make_interval(months => p_n - p_first_number))::date as m) x
$$;

-- Igual a clarevo_lock_commitment: carrega para alteração sem revelar se existe para quem não pode ler.
create or replace function public.clarevo_lock_series(p_series_id uuid)
returns public.commitment_series
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_s public.commitment_series%rowtype;
begin
  select * into v_s from public.commitment_series where id = p_series_id for update;
  if not found or v_s.deleted_at is not null or not public.context_permission(v_s.context_id, 'read') then
    raise exception 'nao_encontrado' using errcode = 'P0002';
  end if;
  if not public.context_permission(v_s.context_id, 'write')
     or (v_s.created_by <> auth.uid() and not public.context_permission(v_s.context_id, 'edit_others')) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  return v_s;
end;
$$;

-- Vigência: mesmas regras do app (packages/core/src/validation.ts), na mesma ordem.
create or replace function public.clarevo_validate_series_term(
  p_amount_cents bigint, p_description text, p_category text, p_amount_mode text, p_due_day integer
)
returns void
language plpgsql
immutable
set search_path = public
as $$
begin
  if p_amount_cents is null or p_amount_cents < 1 then
    raise exception 'valor_invalido' using errcode = '22023';
  end if;
  if p_amount_cents > 999999999 then
    raise exception 'valor_acima_do_limite' using errcode = '22023';
  end if;
  if p_description is null or p_description = '' then
    raise exception 'descricao_obrigatoria' using errcode = '22023';
  end if;
  if char_length(p_description) > 80 then
    raise exception 'descricao_longa' using errcode = '22023';
  end if;
  if p_category is not null and char_length(p_category) > 40 then
    raise exception 'categoria_invalida' using errcode = '22023';
  end if;
  if p_amount_mode is null or p_amount_mode not in ('fixo', 'variavel') then
    raise exception 'modo_de_valor_invalido' using errcode = '22023';
  end if;
  if p_due_day is null or p_due_day not between 1 and 31 then
    raise exception 'dia_invalido' using errcode = '22023';
  end if;
end;
$$;

-- Série nova: mesmas regras e ordem de validateSeriesDraft no core.
-- Mensal: first_number nulo ou 1 (a série grava 1).
create or replace function public.clarevo_validate_series(
  p_actor uuid, p_kind text, p_nature text, p_description text, p_category text, p_amount_cents bigint,
  p_amount_mode text, p_due_day integer, p_first_due_month date, p_first_number integer,
  p_installment_total integer, p_last_month date
)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_month date := date_trunc('month', public.clarevo_today(p_actor)::timestamp)::date;
begin
  if p_kind is null or p_kind not in ('mensal', 'parcelada') then
    raise exception 'tipo_invalido' using errcode = '22023';
  end if;
  if (p_kind = 'mensal' and p_nature is distinct from 'conta')
     or (p_kind = 'parcelada' and (p_nature is null or p_nature not in ('financiamento', 'compra_parcelada', 'outro_parcelamento'))) then
    raise exception 'natureza_invalida' using errcode = '22023';
  end if;
  perform public.clarevo_validate_series_term(p_amount_cents, p_description, p_category, p_amount_mode, p_due_day);
  if p_first_due_month is null or extract(day from p_first_due_month) <> 1
     or p_first_due_month < (v_month - interval '1 month')::date
     or p_first_due_month > (v_month + interval '12 months')::date then
    raise exception 'inicio_fora_do_intervalo' using errcode = '22023';
  end if;
  if (p_kind = 'parcelada' and (p_installment_total is null or p_installment_total not between 2 and 480))
     or (p_kind = 'mensal' and p_installment_total is not null) then
    raise exception 'parcelas_invalidas' using errcode = '22023';
  end if;
  if (p_kind = 'parcelada' and (p_first_number is null or p_first_number not between 1 and p_installment_total))
     or (p_kind = 'mensal' and coalesce(p_first_number, 1) <> 1) then
    raise exception 'parcela_inicial_invalida' using errcode = '22023';
  end if;
  if (p_kind = 'parcelada' and p_last_month is not null)
     or (p_kind = 'mensal' and p_last_month is not null
         and (extract(day from p_last_month) <> 1 or p_last_month < p_first_due_month
              or p_last_month > (p_first_due_month + interval '599 months')::date)) then
    raise exception 'fim_invalido' using errcode = '22023';
  end if;
end;
$$;

-- Conjunto de contas confirmado pela pessoa ({id, version}, como em commitment_items) igual ao atual:
-- cada lado contém o outro. Nulo, objeto ou elemento sem versão nunca é igual.
create or replace function public.clarevo_same_refs(p_actual jsonb, p_expected jsonb)
returns boolean
language sql
immutable
set search_path = public
as $$
  select p_expected is not null and jsonb_typeof(p_expected) = 'array'
     and p_actual @> p_expected and p_expected @> p_actual
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
                                           'series_installment_total', s.installment_total)
    from public.commitments c
    left join public.financial_records r on r.commitment_id = c.id and r.deleted_at is null
    left join public.commitment_series s on s.id = c.series_id
   where c.id = p_commitment_id
$$;

-- Resultado único das funções de conta a pagar (0002), agora com o tipo da série.
create or replace function public.clarevo_commitment_result(p_commitment_id uuid, p_record_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'commitment', public.clarevo_commitment_json(p_commitment_id),
    'record', (select to_jsonb(r) from public.financial_records r where r.id = p_record_id));
$$;

-- Resultado único das funções de série: {series, occurrences, changed}.
-- series: mesmos campos de series_items, mais deleted_at e deleted_by (a repetição de delete_series lê a série excluída).
-- occurrences: ocorrências vivas, abertas e pagas, no formato de commitment_items, por número crescente.
-- changed: contas criadas (create_series), alteradas (update_series_from) ou excluídas (end_series, delete_series).
create or replace function public.clarevo_series_result(p_series_id uuid, p_changed integer)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'series', (select to_jsonb(s) || jsonb_build_object(
                 'terms', coalesce((select jsonb_agg(jsonb_build_object('from_number', t.from_number, 'description', t.description,
                             'category', t.category, 'amount_cents', t.amount_cents, 'amount_mode', t.amount_mode,
                             'due_day', t.due_day, 'created_at', t.created_at) order by t.from_number)
                             from public.series_terms t where t.series_id = s.id and t.superseded_at is null), '[]'::jsonb),
                 'skipped_numbers', coalesce((select jsonb_agg(c.occurrence_number order by c.occurrence_number)
                             from public.commitments c where c.series_id = s.id and c.series_skipped), '[]'::jsonb),
                 'paid_count', (select count(*) from public.commitments c
                                 where c.series_id = s.id and c.deleted_at is null and c.status = 'quitado')::int,
                 'open_count', (select count(*) from public.commitments c
                                 where c.series_id = s.id and c.deleted_at is null and c.status = 'aberto')::int,
                 'generating', exists (select 1 from public.context_memberships m
                                        where m.context_id = s.context_id and m.person_id = s.created_by
                                          and m.revoked_at is null and m.can_read and m.can_write))
                 from public.commitment_series s where s.id = p_series_id),
    'occurrences', coalesce((select jsonb_agg(public.clarevo_commitment_json(c.id) order by c.occurrence_number)
                               from public.commitments c where c.series_id = p_series_id and c.deleted_at is null), '[]'::jsonb),
    'changed', p_changed);
$$;

-- ---------------------------------------------------------------------------
-- Geração das ocorrências: do 1º dia do mês anterior a hoje até o fim do mês seguinte, no fuso de quem criou
-- a série. No máximo três números por chamada, qualquer que seja a idade da série; gerar de novo não cria nada.
-- Não passa pela janela de D-021(6): segue as regras da série e sempre cai dentro dela.
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
  v_top   := (date_trunc('month', v_today::timestamp) + interval '1 month')::date;
  v_from  := greatest(v_s.first_number, v_s.first_number + public.clarevo_months_between(v_s.first_due_month, v_floor));
  v_to    := v_s.first_number + public.clarevo_months_between(v_s.first_due_month, v_top);
  if v_s.last_number is not null then
    v_to := least(v_to, v_s.last_number);
  end if;
  for v_n in v_from .. v_to loop
    -- Viva, ou excluída só neste mês: não cria. Removida por encerramento: recria (retomar).
    continue when exists (select 1 from public.commitments c
                           where c.series_id = v_s.id and c.occurrence_number = v_n
                             and (c.deleted_at is null or c.series_skipped));
    select * into v_t from public.series_terms
     where series_id = v_s.id and superseded_at is null and from_number <= v_n
     order by from_number desc limit 1;
    v_due := public.clarevo_series_due_on(v_s.first_due_month, v_s.first_number, v_n, v_t.due_day);
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
-- Séries: criar, alterar a partir de uma conta, encerrar ou retomar, excluir (atômico, idempotente, versionado)
-- Mesma estrutura das funções de conta a pagar da 0002: sessão; chave; textos aparados;
-- hash de jsonb_build_array(ação, argumentos)::text; trava da chave; repetição (ação e hash iguais, leitura do
-- contexto); travas; versão; situação; validação; escrita; operação com target_id.
-- ---------------------------------------------------------------------------
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
  p_last_month date
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
  v_floor date;
  v_r jsonb;
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  perform public.clarevo_check_key(p_idempotency_key);
  v_hash := md5(jsonb_build_array('criar_serie', p_context_id, p_kind, p_nature, v_description, v_category, p_amount_cents,
                                  p_amount_mode, p_due_day, p_first_due_month, p_first_number, p_installment_total,
                                  p_last_month)::text);
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
                                         p_due_day, p_first_due_month, p_first_number, p_installment_total, p_last_month);

  -- Limite de séries ativas: sem término ou com último mês a partir do mês anterior a hoje.
  perform pg_advisory_xact_lock(hashtext('series:' || p_context_id::text));
  v_floor := (date_trunc('month', public.clarevo_today(v_uid)::timestamp) - interval '1 month')::date;
  if (select count(*) from public.commitment_series s
       where s.context_id = p_context_id and s.deleted_at is null
         and (s.last_number is null
              or (s.first_due_month + make_interval(months => s.last_number - s.first_number))::date >= v_floor)) >= 100 then
    raise exception 'limite_de_gastos_fixos' using errcode = 'PT409';
  end if;

  insert into public.commitment_series (context_id, kind, nature, first_due_month, first_number, last_number,
                                        installment_total, currency, created_by)
  values (p_context_id, p_kind, p_nature, p_first_due_month,
          case when p_kind = 'mensal' then 1 else p_first_number end,
          case when p_kind = 'parcelada' then p_installment_total
               when p_last_month is null then null
               else 1 + public.clarevo_months_between(p_first_due_month, p_last_month) end,
          p_installment_total, (select currency from public.financial_contexts where id = p_context_id), v_uid)
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

-- "Esta e as próximas" a partir do número p_from_number: vigência nova; a conta escolhida sempre muda (e deixa de ser
-- "alterada só no mês"); as seguintes em aberto e não alteradas só no mês também. Pagas nunca mudam.
-- p_expected_affected: [{id, version}] das contas que a pessoa confirmou, como vieram de commitment_items.
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
  -- Até o último número; sem término, até 12 meses depois do mês atual (reajuste programado).
  v_max := coalesce(v_s.last_number, v_s.first_number + public.clarevo_months_between(v_s.first_due_month,
             date_trunc('month', public.clarevo_today(v_uid)::timestamp)::date) + 12);
  if p_from_number is null or p_from_number < v_s.first_number or p_from_number > v_max then
    raise exception 'numero_fora_da_serie' using errcode = '22023';
  end if;
  perform public.clarevo_validate_series_term(p_amount_cents, v_description, v_category, p_amount_mode, p_due_day);
  if p_nature is null or (v_s.kind = 'mensal') <> (p_nature = 'conta')
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
  -- Afetadas: a conta escolhida (sempre) e as seguintes em aberto que não foram alteradas só no mês.
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
         due_on = public.clarevo_series_due_on(v_s.first_due_month, v_s.first_number, c.occurrence_number, p_due_day),
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
-- As contas em aberto depois do último número saem sem a marca "excluída só neste mês": retomar as recria.
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
                                     or p_last_number > v_s.installment_total)) then
    raise exception 'fim_invalido' using errcode = '22023';
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

-- Excluir a série: só sem conta paga (para parar a repetição, encerrar). Exclui as em aberto e a série.
create or replace function public.delete_series(
  p_idempotency_key text,
  p_series_id uuid,
  p_expected_version integer,
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
  v_actual jsonb;
  v_changed int;
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  perform public.clarevo_check_key(p_idempotency_key);
  v_hash := md5(jsonb_build_array('excluir_serie', p_series_id, p_expected_version, p_expected_affected)::text);
  perform pg_advisory_xact_lock(hashtext('op:' || v_uid::text || ':' || p_idempotency_key));

  select * into v_op from public.record_operations where actor_id = v_uid and idempotency_key = p_idempotency_key;
  if found then
    if v_op.action <> 'excluir_serie' or v_op.request_hash <> v_hash then
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
  perform 1 from public.commitments
   where series_id = v_s.id and deleted_at is null
   order by occurrence_number for update;                                                 -- trava 2: contas
  if exists (select 1 from public.commitments where series_id = v_s.id and deleted_at is null and status = 'quitado') then
    raise exception 'serie_tem_pagamentos' using errcode = 'PT409';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'version', version) order by occurrence_number), '[]'::jsonb)
    into v_actual
    from public.commitments
   where series_id = v_s.id and deleted_at is null and status = 'aberto';
  if not public.clarevo_same_refs(v_actual, p_expected_affected) then
    raise exception 'versao_desatualizada' using errcode = 'PT409', detail = 'contas_afetadas_mudaram';
  end if;

  update public.commitments
     set deleted_at = now(), deleted_by = v_uid, version = version + 1
   where id in (select (e ->> 'id')::uuid from jsonb_array_elements(v_actual) e);
  get diagnostics v_changed = row_count;
  update public.commitment_series
     set deleted_at = now(), deleted_by = v_uid, version = version + 1
   where id = v_s.id;

  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id, target_id)
  values (v_uid, p_idempotency_key, 'excluir_serie', v_s.context_id, v_hash, null, null, v_s.id);

  return public.clarevo_series_result(v_s.id, v_changed);
end;
$$;

-- Gera as ocorrências de todas as séries do contexto. Sem chave de idempotência: a chave natural é (série, número),
-- e a função não recebe nenhum valor de quem chama. Leitura basta: quem abre o app só dispara a geração;
-- a autoria e as regras são da série. Não grava record_operations.
create or replace function public.sync_series_occurrences(p_context_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_r jsonb;
  v_created int := 0;
  v_overdue int := 0;
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  if not public.context_permission(p_context_id, 'read') then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  for v_id in select id from public.commitment_series
               where context_id = p_context_id and deleted_at is null order by id loop
    v_r := public.clarevo_materialize_series(v_id);
    v_created := v_created + (v_r ->> 'created')::int;
    v_overdue := v_overdue + (v_r ->> 'created_overdue')::int;
  end loop;
  return jsonb_build_object('created', v_created, 'created_overdue', v_overdue);
end;
$$;

-- ---------------------------------------------------------------------------
-- Contas a pagar: mudanças em update_commitment e delete_commitment
-- ---------------------------------------------------------------------------

-- Um parâmetro a mais no fim, p_amount_is_estimate: nulo mantém a marca; falso é "Informar o valor da conta".
-- Com o parâmetro nulo, o hash é idêntico ao da 0002: repetição em trânsito continua reconhecida, e o cliente
-- antigo (7 argumentos nomeados) continua funcionando.
-- Ocorrência de série: o vencimento fica no mês dela e a conta passa a ser "alterada só neste mês".
drop function public.update_commitment(text, uuid, integer, bigint, date, text, text);
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
    if date_trunc('month', p_due_on::timestamp)::date
       <> (v_s.first_due_month + make_interval(months => v_c.occurrence_number - v_s.first_number))::date then
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

-- Mesma assinatura e hash da 0002. Ocorrência de série: "excluir só esta" marca o número, que nunca volta.
create or replace function public.delete_commitment(
  p_idempotency_key text,
  p_commitment_id uuid,
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
  v_c public.commitments%rowtype;
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  perform public.clarevo_check_key(p_idempotency_key);
  v_hash := md5(jsonb_build_array('excluir_compromisso', p_commitment_id, p_expected_version)::text);
  perform pg_advisory_xact_lock(hashtext('op:' || v_uid::text || ':' || p_idempotency_key));

  select * into v_op from public.record_operations where actor_id = v_uid and idempotency_key = p_idempotency_key;
  if found then
    if v_op.action <> 'excluir_compromisso' or v_op.request_hash <> v_hash then
      raise exception 'chave_reutilizada' using errcode = 'PT409';
    end if;
    if not public.context_permission(v_op.context_id, 'read') then
      raise exception 'nao_encontrado' using errcode = 'P0002';
    end if;
    return public.clarevo_commitment_result(v_op.commitment_id, v_op.record_id);
  end if;

  v_c := public.clarevo_lock_commitment(p_commitment_id);
  if p_expected_version is distinct from v_c.version then
    raise exception 'versao_desatualizada' using errcode = 'PT409', detail = 'versao_atual=' || v_c.version;
  end if;
  if v_c.status <> 'aberto' then
    raise exception 'compromisso_quitado' using errcode = 'PT409';
  end if;

  -- Exclusão lógica: some das consultas e de "Ainda a pagar", mantém o rastro mínimo de autoria e operação.
  update public.commitments
     set deleted_at = now(), deleted_by = v_uid, version = version + 1,
         series_skipped = (series_id is not null)
   where id = v_c.id;

  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id)
  values (v_uid, p_idempotency_key, 'excluir_compromisso', v_c.context_id, v_hash, null, v_c.id);

  return public.clarevo_commitment_result(v_c.id, null);
end;
$$;

-- ---------------------------------------------------------------------------
-- Leitura: RLS e visões
-- ---------------------------------------------------------------------------
alter table public.commitment_series enable row level security;
alter table public.series_terms enable row level security;

create policy commitment_series_read on public.commitment_series for select to authenticated
  using (deleted_at is null and public.context_permission(context_id, 'read'));
create policy series_terms_read on public.series_terms for select to authenticated
  using (public.context_permission(context_id, 'read'));

-- Lista inicial idêntica à da 0002; colunas novas no fim. O tipo do parcelamento vem da série (junção, sem cópia).
create or replace view public.commitment_items with (security_invoker = true) as
select c.id, c.context_id, c.description, c.amount_cents, c.currency, c.due_on, c.status, c.category,
       c.created_by, c.version, c.created_at, c.updated_at,
       r.id as paid_record_id, r.occurred_on as paid_on, r.amount_cents as paid_amount_cents, r.account_id as paid_account_id,
       c.series_id, c.occurrence_number, c.series_override, c.amount_is_estimate,
       s.kind as series_kind, s.nature as series_nature, s.installment_total as series_installment_total
  from public.commitments c
  left join public.financial_records r on r.commitment_id = c.id and r.deleted_at is null
  left join public.commitment_series s on s.id = c.series_id
 where c.deleted_at is null;
comment on view public.commitment_items is 'Contas a pagar não excluídas com o gasto vivo que as quitou (paid_* nulos quando em aberto) e a série, quando houver.';

-- Sem security_invoker: precisa ler os números "excluídos só neste mês" (linhas excluídas, que a RLS esconde).
-- Por isso o filtro de permissão é explícito, como nas funções security definer, e a visão é security_barrier:
-- sem ela, um filtro de quem consulta (por exemplo, um cast que falha) rodaria antes da permissão e revelaria
-- textos de outros contextos na mensagem de erro.
create view public.series_items with (security_barrier = true) as
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
                 and m.revoked_at is null and m.can_read and m.can_write) as generating
  from public.commitment_series s
 where s.deleted_at is null and public.context_permission(s.context_id, 'read');
comment on view public.series_items is 'Séries não excluídas que quem consulta pode ler, com vigências vivas, números pulados e contagens.';

-- ---------------------------------------------------------------------------
-- Privilégios: bloco inteiro da 0002 (idempotente), com a assinatura nova de update_commitment, mais as funções
-- de série. commitment_series, series_terms, commitments e as visões ficam sem insert, update ou delete diretos.
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

grant execute on function public.create_series(text, uuid, text, text, text, text, bigint, text, integer, date, integer, integer, date) to authenticated;
grant execute on function public.update_series_from(text, uuid, integer, integer, jsonb, text, text, text, bigint, text, integer) to authenticated;
grant execute on function public.end_series(text, uuid, integer, integer, jsonb) to authenticated;
grant execute on function public.delete_series(text, uuid, integer, jsonb) to authenticated;
grant execute on function public.sync_series_occurrences(uuid) to authenticated;
