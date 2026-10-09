-- Clarevo · migração 0005 · revisão depois de ausência, "Seus últimos meses" (D-030). Depois de 20261008000002_contas_do_ano.sql.
-- Contas de meses passados de série só por create_series_occurrence; marca da revisão só por decide_return_review.
-- Atividade mantida pelo gatilho de record_operations (só datas, no fuso da pessoa). Hash em JSON (D-021, regra 7).
--
-- Invariantes:
-- R1. Toda operação (menos decidir_revisao) deixa context_activity.last_write_on >= o dia dela no fuso de quem anotou.
-- R2. absence_from_on e absence_until_on: os dois nulos ou os dois preenchidos, from < until <= last_write_on,
--     e o intervalo é uma ausência longa (conferido pela guarda quando a ausência é gravada).
-- R3. return_reviews: reviewed_through e decided_on nunca recuam; versão +1 por escrita.
-- R4. Conta criada por create_series_occurrence obedece S1 a S10, usa a vigência do número e a autoria de quem criou a série.
-- R5. Atividade e revisão só são lidas pela própria pessoa (nem Família, nem empresa, nem números somados).
-- R6. Nenhuma função nova grava financial_records.
-- Ordem de travas: série → contas a pagar → registro (create_series_occurrence) e revisão (advisory) → linha de revisão.
-- A atividade é a última trava de toda escrita (o gatilho roda na gravação da operação, no fim de cada função).
--
-- Ausência longa entre os dias a < b: b - a >= 45 dias, ou meses(mês(a), mês(b)) >= 2 (ao menos um mês inteiro fechado
-- sem anotação). Limiares de P-021: iguais no core (ABSENCE_MIN_DAYS em retorno.ts); mudar só a constante, nos dois.
-- Revisão: só os 11 meses fechados anteriores ao mês atual (REVIEW_MAX_CLOSED_MONTHS); todo vencimento cai na janela
-- de D-021(6), de 1 ano antes a 2 anos depois de hoje.

-- ---------------------------------------------------------------------------
-- Atividade e revisão (só datas, por pessoa e contexto)
-- ---------------------------------------------------------------------------
create table public.context_activity (
  person_id uuid not null references public.persons (id) on delete cascade,
  context_id uuid not null references public.financial_contexts (id) on delete cascade,
  last_write_on date not null,
  -- A última ausência longa: do último dia com anotação antes dela ao primeiro dia com anotação depois dela.
  absence_from_on date,
  absence_until_on date,
  updated_at timestamptz not null default now(),
  primary key (person_id, context_id),
  constraint context_activity_ausencia check (
    (absence_from_on is null) = (absence_until_on is null)
    and (absence_from_on is null or (absence_from_on < absence_until_on and absence_until_on <= last_write_on)))
);
create index context_activity_ctx on public.context_activity (context_id);
comment on table public.context_activity is
  'Dia da última anotação da pessoa no contexto e a última ausência longa (só datas). Lida só pela própria pessoa.';

create table public.return_reviews (
  person_id uuid not null references public.persons (id) on delete cascade,
  context_id uuid not null references public.financial_contexts (id) on delete cascade,
  reviewed_through date not null,
  decision text not null,
  decided_on date not null,
  version integer not null default 1 check (version >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (person_id, context_id),
  constraint return_reviews_mes check (extract(day from reviewed_through) = 1),
  constraint return_reviews_decisao check (decision in ('atualizou', 'seguiu'))
);
create index return_reviews_ctx on public.return_reviews (context_id);
comment on table public.return_reviews is
  'Decisão da revisão dos últimos meses ("atualizou" ou "seguiu") e o último mês fechado revisado. Lida só pela própria pessoa.';

-- ---------------------------------------------------------------------------
-- Funções auxiliares (sem execute para authenticated)
-- ---------------------------------------------------------------------------

-- Ausência longa entre dois dias com anotação (a < b). Nulo ou b <= a: não.
-- clarevo_months_between (0003) usa só ano e mês: aceita dias quaisquer.
create or replace function public.clarevo_long_absence(p_from date, p_to date)
returns boolean
language sql
immutable
set search_path = public
as $$
  select coalesce(p_to > p_from and (p_to - p_from >= 45 or public.clarevo_months_between(p_from, p_to) >= 2), false)
$$;

-- Dia de um instante no fuso da pessoa, com a mesma proteção de clarevo_today contra fuso inválido.
-- Usada só na carga inicial (o gatilho usa clarevo_today, que os testes fixam).
create or replace function public.clarevo_local_date(p_person uuid, p_at timestamptz)
returns date
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tz text;
begin
  select time_zone into v_tz from public.persons where id = p_person;
  begin
    return (p_at at time zone coalesce(v_tz, 'America/Sao_Paulo'))::date;
  exception when others then
    return (p_at at time zone 'America/Sao_Paulo')::date;
  end;
end;
$$;

-- ---------------------------------------------------------------------------
-- Gatilhos de proteção (defesa adicional: só o gatilho de atividade e decide_return_review gravam)
-- ---------------------------------------------------------------------------

-- Chaves imutáveis; o dia da última anotação não recua; ausência gravada só se for longa (R2).
-- A ausência é conferida só quando muda: mudar o limiar (P-021) não invalida ausências já gravadas.
create or replace function public.context_activity_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_check boolean;
begin
  if tg_op = 'UPDATE' then
    if new.person_id <> old.person_id or new.context_id <> old.context_id or new.last_write_on < old.last_write_on then
      raise exception 'campo_imutavel' using errcode = '42501';
    end if;
    v_check := new.absence_from_on is distinct from old.absence_from_on
               or new.absence_until_on is distinct from old.absence_until_on;
  else
    v_check := true;
  end if;
  if v_check and new.absence_from_on is not null and new.absence_until_on is not null
     and not public.clarevo_long_absence(new.absence_from_on, new.absence_until_on) then
    raise exception 'atividade_inconsistente' using errcode = '23514';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger context_activity_guard
  before insert or update on public.context_activity
  for each row execute function public.context_activity_guard();

-- Chaves e criação imutáveis; mês revisado e dia da decisão nunca recuam; versão +1 por escrita (R3).
create or replace function public.return_reviews_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.person_id <> old.person_id or new.context_id <> old.context_id or new.created_at <> old.created_at
     or new.reviewed_through < old.reviewed_through or new.decided_on < old.decided_on
     or new.version <> old.version + 1 then
    raise exception 'campo_imutavel' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger return_reviews_guard
  before update on public.return_reviews
  for each row execute function public.return_reviews_guard();

-- ---------------------------------------------------------------------------
-- Operações: lista completa vigente (0002, 0003 e 0004, com informar_ano e tirar_ano) mais as duas ações novas.
-- criar_ocorrencia aponta para a conta criada (commitment_id) e para a série (target_id); decidir_revisao, para nada
-- (o contexto já está em context_id).
-- ---------------------------------------------------------------------------
alter table public.record_operations drop constraint record_operations_action_check;
alter table public.record_operations add constraint record_operations_action_check check (action in (
  'criar', 'editar', 'excluir',
  'criar_compromisso', 'editar_compromisso', 'excluir_compromisso', 'pagar_compromisso', 'desfazer_pagamento',
  'criar_serie', 'alterar_serie', 'encerrar_serie', 'excluir_serie', 'informar_ano', 'tirar_ano',
  'criar_ocorrencia', 'decidir_revisao'));
alter table public.record_operations drop constraint record_operations_target_check;
alter table public.record_operations add constraint record_operations_target_check check (
  (action in ('criar', 'editar', 'excluir') and record_id is not null and target_id is null)
  or (action in ('criar_compromisso', 'editar_compromisso', 'excluir_compromisso')
      and commitment_id is not null and record_id is null and target_id is null)
  or (action in ('pagar_compromisso', 'desfazer_pagamento')
      and commitment_id is not null and record_id is not null and target_id is null)
  or (action in ('criar_serie', 'alterar_serie', 'encerrar_serie', 'excluir_serie', 'informar_ano', 'tirar_ano')
      and target_id is not null and record_id is null and commitment_id is null)
  or (action = 'criar_ocorrencia' and commitment_id is not null and target_id is not null and record_id is null)
  or (action = 'decidir_revisao' and record_id is null and commitment_id is null and target_id is null));

-- ---------------------------------------------------------------------------
-- Carga inicial: por (pessoa, contexto), o maior dia de record_operations.created_at no fuso da pessoa, sem ausência.
-- A tabela própria não depende da retenção de record_operations (P-010). Contexto já apagado fica de fora.
-- ---------------------------------------------------------------------------
insert into public.context_activity (person_id, context_id, last_write_on)
select o.actor_id, o.context_id, max(public.clarevo_local_date(o.actor_id, o.created_at))
  from public.record_operations o
 where exists (select 1 from public.financial_contexts f where f.id = o.context_id)
 group by o.actor_id, o.context_id
on conflict (person_id, context_id) do nothing;

-- ---------------------------------------------------------------------------
-- Atividade: toda operação gravada (menos decidir_revisao) é uma anotação no dia de hoje de quem anotou.
-- A geração (sync_series_occurrences) não grava operação e abrir o app não é registrado no servidor: nenhum dos dois conta.
-- Ausência longa entre a última anotação e esta: passa a ser a última ausência. Mesmo dia ou relógio para trás: nada muda.
-- security definer: grava em nome de quem anotou, que não tem escrita direta na tabela.
-- ---------------------------------------------------------------------------
create or replace function public.clarevo_track_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_day date;
begin
  if new.action = 'decidir_revisao' then
    return null;
  end if;
  v_day := public.clarevo_today(new.actor_id);
  insert into public.context_activity as a (person_id, context_id, last_write_on)
  values (new.actor_id, new.context_id, v_day)
  on conflict (person_id, context_id) do update
    set absence_from_on  = case when public.clarevo_long_absence(a.last_write_on, excluded.last_write_on)
                                then a.last_write_on else a.absence_from_on end,
        absence_until_on = case when public.clarevo_long_absence(a.last_write_on, excluded.last_write_on)
                                then excluded.last_write_on else a.absence_until_on end,
        last_write_on    = excluded.last_write_on
    where excluded.last_write_on > a.last_write_on;
  return null;
end;
$$;

create trigger record_operations_activity
  after insert on public.record_operations
  for each row execute function public.clarevo_track_activity();

-- ---------------------------------------------------------------------------
-- Conta de um mês passado de série ("Já paguei", "Não houve" e "Ainda não paguei" na revisão).
-- Mesma estrutura das funções de série: sessão; chave; hash de jsonb_build_array(ação, argumentos)::text; trava da chave;
-- repetição (ação e hash iguais, leitura do contexto); trava da série; versão; validação; escrita; operação.
-- p_mode: 'aberta' cria a conta em aberto (para "Já paguei", pagar depois com pay_commitment, em outra chamada);
-- 'nao_houve' grava a conta já excluída só naquele mês (series_skipped), que a geração nunca recria.
-- Só os 11 meses fechados anteriores ao mês atual de quem chama. Valor, dia, descrição, categoria e estimativa vêm da
-- vigência do número; autoria de quem criou a série (como a geração). A versão da série não muda (criar a conta de um
-- mês é como a geração); o conjunto afetado de update_series_from, end_series, inform_series_year e skip_series_year
-- muda, e elas recusam o conjunto antigo com versao_desatualizada (contas_afetadas_mudaram).
-- Retorno: {commitment, record: null}, como as funções de conta a pagar.
-- ---------------------------------------------------------------------------
create or replace function public.create_series_occurrence(
  p_idempotency_key text,
  p_series_id uuid,
  p_expected_version integer,
  p_number integer,
  p_mode text
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
  v_t public.series_terms%rowtype;
  v_cur date;
  v_month date;
  v_due date;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  perform public.clarevo_check_key(p_idempotency_key);
  v_hash := md5(jsonb_build_array('criar_ocorrencia', p_series_id, p_expected_version, p_number, p_mode)::text);
  perform pg_advisory_xact_lock(hashtext('op:' || v_uid::text || ':' || p_idempotency_key));

  select * into v_op from public.record_operations where actor_id = v_uid and idempotency_key = p_idempotency_key;
  if found then
    if v_op.action <> 'criar_ocorrencia' or v_op.request_hash <> v_hash then
      raise exception 'chave_reutilizada' using errcode = 'PT409';
    end if;
    if not public.context_permission(v_op.context_id, 'read') then
      raise exception 'nao_encontrado' using errcode = 'P0002';
    end if;
    return public.clarevo_commitment_result(v_op.commitment_id, null);
  end if;

  -- Trava 1: a mesma linha que a geração trava, aqui com as regras de escrita (nao_encontrado, sem_permissao).
  v_s := public.clarevo_lock_series(p_series_id);
  -- Versão ausente (NULL) também é recusada.
  if p_expected_version is distinct from v_s.version then
    raise exception 'versao_desatualizada' using errcode = 'PT409', detail = 'versao_atual=' || v_s.version;
  end if;
  if p_mode is null or p_mode not in ('aberta', 'nao_houve') then
    raise exception 'modo_invalido' using errcode = '22023';
  end if;
  if p_number is null or p_number < v_s.first_number or p_number > coalesce(v_s.last_number, p_number) then
    raise exception 'numero_fora_da_serie' using errcode = '22023';
  end if;
  v_cur := date_trunc('month', public.clarevo_today(v_uid)::timestamp)::date;
  -- Número muito adiante (mais de 1.000 anos de meses): fora da revisão, sem calcular uma data fora do intervalo.
  if p_number - v_s.first_number > 12000 then
    raise exception 'mes_fora_da_revisao' using errcode = '22023';
  end if;
  v_month := public.clarevo_series_month(v_s, p_number);                       -- mensal, parcelada e anual (0004)
  if v_month >= v_cur or v_month < (v_cur - interval '11 months')::date then
    raise exception 'mes_fora_da_revisao' using errcode = '22023';
  end if;
  -- A conta leva a autoria de quem criou a série: essa pessoa precisa continuar lendo e escrevendo no contexto.
  if not exists (select 1 from public.context_memberships m
                  where m.context_id = v_s.context_id and m.person_id = v_s.created_by
                    and m.revoked_at is null and m.can_read and m.can_write) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  -- Viva (aberta ou paga) ou excluída só neste mês: já registrada. Removida por encerramento: pode ser registrada.
  if exists (select 1 from public.commitments c
              where c.series_id = v_s.id and c.occurrence_number = p_number
                and (c.deleted_at is null or c.series_skipped)) then
    raise exception 'ocorrencia_existente' using errcode = 'PT409';
  end if;

  select * into v_t from public.series_terms
   where series_id = v_s.id and superseded_at is null and from_number <= p_number
   order by from_number desc limit 1;
  v_due := public.clarevo_series_due(v_s, p_number, v_t.due_day);
  insert into public.commitments (context_id, description, amount_cents, currency, due_on, status, category, created_by,
                                  series_id, occurrence_number, amount_is_estimate, deleted_at, deleted_by, series_skipped)
  values (v_s.context_id, v_t.description, v_t.amount_cents, v_s.currency, v_due, 'aberto', v_t.category, v_s.created_by,
          v_s.id, p_number, v_t.amount_mode = 'variavel',
          case when p_mode = 'nao_houve' then now() end,
          case when p_mode = 'nao_houve' then v_uid end,
          p_mode = 'nao_houve')
  returning id into v_id;

  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id, target_id)
  values (v_uid, p_idempotency_key, 'criar_ocorrencia', v_s.context_id, v_hash, null, v_id, v_s.id);

  return public.clarevo_commitment_result(v_id, null);
end;
$$;

-- ---------------------------------------------------------------------------
-- Decisão da revisão ("Seguir adiante" ou "Concluir"). Só grava a marca da própria pessoa: nada é criado, pago ou
-- excluído. Basta leitura no contexto. p_expected_version 0 = ainda não existe marca; nulo é recusado.
-- reviewed_through: primeiro dia de um dos 11 meses fechados anteriores ao atual; nunca recua (o maior fica).
-- Retorno: a linha de return_reviews em JSON (na repetição, a linha atual).
-- ---------------------------------------------------------------------------
create or replace function public.decide_return_review(
  p_idempotency_key text,
  p_context_id uuid,
  p_expected_version integer,
  p_reviewed_through date,
  p_decision text
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
  v_r public.return_reviews%rowtype;
  v_cur date;
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  perform public.clarevo_check_key(p_idempotency_key);
  v_hash := md5(jsonb_build_array('decidir_revisao', p_context_id, p_expected_version, p_reviewed_through, p_decision)::text);
  perform pg_advisory_xact_lock(hashtext('op:' || v_uid::text || ':' || p_idempotency_key));

  select * into v_op from public.record_operations where actor_id = v_uid and idempotency_key = p_idempotency_key;
  if found then
    if v_op.action <> 'decidir_revisao' or v_op.request_hash <> v_hash then
      raise exception 'chave_reutilizada' using errcode = 'PT409';
    end if;
    if not public.context_permission(v_op.context_id, 'read') then
      raise exception 'nao_encontrado' using errcode = 'P0002';
    end if;
    return (select to_jsonb(r) from public.return_reviews r where r.person_id = v_uid and r.context_id = v_op.context_id);
  end if;

  if not public.context_permission(p_context_id, 'read') then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if p_decision is null or p_decision not in ('atualizou', 'seguiu') then
    raise exception 'decisao_invalida' using errcode = '22023';
  end if;
  v_cur := date_trunc('month', public.clarevo_today(v_uid)::timestamp)::date;
  if p_reviewed_through is null or extract(day from p_reviewed_through) <> 1
     or p_reviewed_through >= v_cur or p_reviewed_through < (v_cur - interval '11 months')::date then
    raise exception 'mes_invalido' using errcode = '22023';
  end if;

  -- A marca pode ainda não existir: a trava consultiva serializa a primeira decisão; depois, a linha.
  perform pg_advisory_xact_lock(hashtext('revisao:' || v_uid::text || ':' || p_context_id::text));
  select * into v_r from public.return_reviews where person_id = v_uid and context_id = p_context_id for update;
  if p_expected_version is distinct from coalesce(v_r.version, 0) then
    raise exception 'versao_desatualizada' using errcode = 'PT409', detail = 'versao_atual=' || coalesce(v_r.version, 0);
  end if;

  insert into public.return_reviews as r (person_id, context_id, reviewed_through, decision, decided_on)
  values (v_uid, p_context_id, p_reviewed_through, p_decision, public.clarevo_today(v_uid))
  on conflict (person_id, context_id) do update
    set reviewed_through = greatest(r.reviewed_through, excluded.reviewed_through),
        decision = excluded.decision,
        decided_on = greatest(r.decided_on, excluded.decided_on),
        version = r.version + 1
  returning * into v_r;

  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id, target_id)
  values (v_uid, p_idempotency_key, 'decidir_revisao', p_context_id, v_hash, null, null, null);

  return to_jsonb(v_r);
end;
$$;

-- ---------------------------------------------------------------------------
-- Recebido e pago por mês, de p_from a p_to (primeiros dias de mês, no máximo 12 meses), com as quantidades.
-- Mesma origem e critério de month_totals (security invoker: a RLS de quem consulta vale) e a mesma ordem de
-- conferência: primeiro o período, depois a permissão. Mês sem anotação aparece com zeros (nunca é omitido).
-- ---------------------------------------------------------------------------
create or replace function public.months_overview(p_context_id uuid, p_from date, p_to date)
returns table (month date, received_count integer, received_cents bigint, paid_count integer, paid_cents bigint)
language plpgsql
stable
security invoker
set search_path = public
as $$
begin
  -- Sem auxiliares: com security invoker, authenticated não executa clarevo_months_between.
  if p_from is null or p_to is null or extract(day from p_from) <> 1 or extract(day from p_to) <> 1
     or p_to < p_from or p_to > (p_from + interval '11 months')::date then
    raise exception 'periodo_invalido' using errcode = '22023';
  end if;
  if not public.context_permission(p_context_id, 'read') then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  return query
  select g.m::date,
         (count(r.id) filter (where r.kind = 'receita'))::int,
         coalesce(sum(r.amount_cents) filter (where r.kind = 'receita'), 0)::bigint,
         (count(r.id) filter (where r.kind = 'despesa'))::int,
         coalesce(sum(r.amount_cents) filter (where r.kind = 'despesa'), 0)::bigint
    from generate_series(p_from::timestamp, p_to::timestamp, interval '1 month') as g(m)
    left join public.financial_records r
      on r.context_id = p_context_id and r.deleted_at is null
     and r.occurred_on >= g.m::date and r.occurred_on < (g.m + interval '1 month')::date
   group by g.m
   order by g.m;
end;
$$;

-- ---------------------------------------------------------------------------
-- Leitura: só a própria pessoa, e só enquanto lê o contexto (vínculo revogado não vê nada). Sem escrita direta.
-- ---------------------------------------------------------------------------
alter table public.context_activity enable row level security;
alter table public.return_reviews enable row level security;

create policy context_activity_own on public.context_activity for select to authenticated
  using (person_id = auth.uid() and public.context_permission(context_id, 'read'));
create policy return_reviews_own on public.return_reviews for select to authenticated
  using (person_id = auth.uid() and public.context_permission(context_id, 'read'));

-- ---------------------------------------------------------------------------
-- Privilégios: bloco inteiro da 0004 (idempotente), mais as três funções públicas novas.
-- context_activity e return_reviews ficam sem insert, update ou delete diretos; clarevo_long_absence,
-- clarevo_local_date, clarevo_track_activity e as guardas ficam sem execute para authenticated.
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
