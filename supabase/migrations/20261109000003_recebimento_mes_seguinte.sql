-- Clarevo · migração 0030 · Recebimento do fim do mês que conta no mês seguinte (D-089 A). Depois de 20261109000002_importar_parcelas.sql.
-- O salário que cai em 30/10 e paga as contas de novembro pode contar no Recebido de novembro: financial_records ganha next_month
-- (só em recebimento com a data nos últimos 7 dias do mês) e counted_month (gerada: o primeiro dia do mês em que o registro conta, o
-- da data ou o seguinte). month_totals, months_overview e set_month_check passam a usar counted_month; o app lê o mês por ela (Resumo,
-- Movimentos, Evolução, Análises, exportação e "Conferi este mês"). create_record e update_record ganham p_next_month (no fim, com
-- valor padrão: o app antigo continua chamando como antes; na edição, nulo mantém a marca). A data do recebimento nunca muda.
-- Nenhum dado existente muda (next_month false). Aplicar no SQL Editor depois da 0029 (docs/05, passo 12t) e recarregar o esquema da
-- API. Testes em supabase/tests/99zzzzzzzzz_mes_seguinte.sql.

-- ---------------------------------------------------------------------------
-- As colunas
-- ---------------------------------------------------------------------------
alter table public.financial_records add column next_month boolean not null default false;
-- Os últimos 7 dias do mês: a data mais 7 dias cai no mês seguinte (dia 25 a 31 num mês de 31 dias; 22 a 28 em fevereiro comum).
alter table public.financial_records add constraint financial_records_mes_seguinte check (
  not next_month or (kind = 'receita' and extract(month from occurred_on + 7) <> extract(month from occurred_on)));
alter table public.financial_records add column counted_month date generated always as (
  case when next_month then (occurred_on - (extract(day from occurred_on)::int - 1) + interval '1 month')::date
       else occurred_on - (extract(day from occurred_on)::int - 1) end) stored;
comment on column public.financial_records.next_month is
  'Recebimento do fim do mês que conta no mês seguinte (D-089 A): só em receita, com a data nos últimos 7 dias do mês. A data não muda.';
comment on column public.financial_records.counted_month is
  'Primeiro dia do mês em que o registro conta no Recebido, no Pago e nas leituras por mês: o da data ou, com next_month, o seguinte.';
create index financial_records_ctx_counted on public.financial_records (context_id, counted_month) where deleted_at is null;

-- ---------------------------------------------------------------------------
-- Auxiliares (sem execute para o app)
-- ---------------------------------------------------------------------------
create or replace function public.clarevo_next_month_allowed(p_on date)
returns boolean
language sql
immutable
set search_path = public
as $$
  select p_on is not null and extract(month from p_on + 7) <> extract(month from p_on);
$$;

create or replace function public.clarevo_check_next_month(p_kind public.record_kind, p_on date, p_next boolean)
returns void
language plpgsql
immutable
set search_path = public
as $$
begin
  if coalesce(p_next, false) and (p_kind is distinct from 'receita' or not public.clarevo_next_month_allowed(p_on)) then
    raise exception 'mes_seguinte_invalido' using errcode = '22023';
  end if;
end;
$$;

revoke all on function public.clarevo_next_month_allowed(date) from public, anon, authenticated, service_role;
revoke all on function public.clarevo_check_next_month(public.record_kind, date, boolean) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Criar e editar registro: p_next_month no fim, com valor padrão (as assinaturas antigas saem para não haver chamada ambígua)
-- ---------------------------------------------------------------------------
drop function public.create_record(text, uuid, uuid, public.record_kind, bigint, date, text, text, text);
create function public.create_record(
  p_idempotency_key text,
  p_context_id uuid,
  p_account_id uuid,
  p_kind public.record_kind,
  p_amount_cents bigint,
  p_occurred_on date,
  p_description text,
  p_category text default null,
  p_receipt_key text default null,
  p_next_month boolean default false
)
returns public.financial_records
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_description text := public.clarevo_trim(p_description);
  v_category text := nullif(public.clarevo_trim(p_category), '');
  v_receipt text := nullif(public.clarevo_trim(p_receipt_key), '');
  v_hash text;
  v_op public.record_operations%rowtype;
  v_account public.financial_accounts%rowtype;
  v_record public.financial_records%rowtype;
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  -- Sem o mês seguinte, o mesmo conteúdo de antes (concat_ws pula os nulos): a chave de uma tentativa do app antigo continua valendo.
  v_hash := md5(concat_ws('|', 'criar', p_context_id, p_account_id, p_kind, p_amount_cents, p_occurred_on, v_description, coalesce(v_category, ''), v_receipt,
                          case when coalesce(p_next_month, false) then 'mes_seguinte' end));
  perform pg_advisory_xact_lock(hashtext('op:' || v_uid::text || ':' || coalesce(p_idempotency_key, '')));

  select * into v_op from public.record_operations where actor_id = v_uid and idempotency_key = p_idempotency_key;
  if found then
    if v_op.request_hash <> v_hash then
      raise exception 'chave_reutilizada' using errcode = 'PT409';
    end if;
    -- Repetição só devolve o registro se a pessoa ainda pode ler o contexto (vínculo revogado não vê nada).
    if not public.context_permission(v_op.context_id, 'read') then
      raise exception 'nao_encontrado' using errcode = 'P0002';
    end if;
    select * into v_record from public.financial_records where id = v_op.record_id;
    return v_record;
  end if;

  if not public.context_permission(p_context_id, 'write') then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  v_account := public.clarevo_validate_record(v_uid, p_context_id, p_account_id, p_amount_cents, p_occurred_on, v_description, v_category);
  perform public.clarevo_check_next_month(p_kind, p_occurred_on, coalesce(p_next_month, false));
  if v_receipt is not null then
    if p_kind <> 'despesa' or not public.clarevo_receipt_key_valid(v_receipt) then
      raise exception 'chave_de_nota_invalida' using errcode = '22023';
    end if;
    perform public.clarevo_check_receipt_free(p_context_id, v_receipt);
  end if;

  insert into public.financial_records
    (context_id, account_id, kind, amount_cents, currency, occurred_on, description, category, created_by, receipt_key, next_month)
  values
    (p_context_id, p_account_id, p_kind, p_amount_cents, v_account.currency, p_occurred_on, v_description, v_category, v_uid, v_receipt,
     coalesce(p_next_month, false))
  returning * into v_record;

  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id)
  values (v_uid, p_idempotency_key, 'criar', p_context_id, v_hash, v_record.id);

  return v_record;
end;
$$;

drop function public.update_record(text, uuid, integer, uuid, bigint, date, text, text);
create function public.update_record(
  p_idempotency_key text,
  p_record_id uuid,
  p_expected_version integer,
  p_account_id uuid,
  p_amount_cents bigint,
  p_occurred_on date,
  p_description text,
  p_category text default null,
  p_next_month boolean default null
)
returns public.financial_records
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
  v_record public.financial_records%rowtype;
  v_cid uuid;
  v_next boolean;
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  -- p_next_month nulo (o app antigo) = o mesmo conteúdo de antes.
  v_hash := md5(concat_ws('|', 'editar', p_record_id, p_expected_version, p_account_id, p_amount_cents, p_occurred_on, v_description, coalesce(v_category, ''),
                          case when p_next_month is not null then 'mes_seguinte=' || p_next_month::text end));
  perform pg_advisory_xact_lock(hashtext('op:' || v_uid::text || ':' || coalesce(p_idempotency_key, '')));

  select * into v_op from public.record_operations where actor_id = v_uid and idempotency_key = p_idempotency_key;
  if found then
    if v_op.request_hash <> v_hash then
      raise exception 'chave_reutilizada' using errcode = 'PT409';
    end if;
    -- Repetição só devolve o registro se a pessoa ainda pode ler o contexto (vínculo revogado não vê nada).
    if not public.context_permission(v_op.context_id, 'read') then
      raise exception 'nao_encontrado' using errcode = 'P0002';
    end if;
    select * into v_record from public.financial_records where id = v_op.record_id;
    return v_record;
  end if;

  -- O vínculo é imutável: ler sem trava é seguro. A trava da conta a pagar vem antes da do registro
  -- (mesma ordem de pay_commitment e undo_commitment_payment); a permissão continua sendo a do registro.
  select commitment_id into v_cid from public.financial_records where id = p_record_id;
  if v_cid is not null then
    perform 1 from public.commitments where id = v_cid for update;
  end if;
  v_record := public.clarevo_lock_record(p_record_id);
  -- Versão ausente (NULL) também é recusada.
  if p_expected_version is distinct from v_record.version then
    raise exception 'versao_desatualizada' using errcode = 'PT409', detail = 'versao_atual=' || v_record.version;
  end if;
  if v_record.card_id is not null
     and (p_amount_cents is distinct from v_record.amount_cents or v_description is distinct from v_record.description
          or v_category is distinct from v_record.category) then
    raise exception 'pagamento_de_fatura' using errcode = 'PT409';
  end if;
  perform public.clarevo_validate_record(v_uid, v_record.context_id, p_account_id, p_amount_cents, p_occurred_on, v_description, v_category,
                                          v_record.account_id);
  -- Mês seguinte (D-089 A): nulo mantém a marca enquanto a data nova ainda cai nos últimos 7 dias do mês (o app antigo não manda o
  -- campo e não pode apagar a marca sem querer); fora disso, cai. true ou false explícitos valem como vieram.
  v_next := case when p_next_month is null then v_record.next_month and public.clarevo_next_month_allowed(p_occurred_on)
                 else p_next_month end;
  perform public.clarevo_check_next_month(v_record.kind, p_occurred_on, v_next);

  update public.financial_records
     set account_id = p_account_id,
         amount_cents = p_amount_cents,
         occurred_on = p_occurred_on,
         description = v_description,
         category = v_category,
         next_month = v_next,
         version = version + 1
   where id = p_record_id
  returning * into v_record;

  -- Gasto de conta a pagar: o previsto não muda, mas a versão da conta sobe (o pagamento mostrado mudou).
  if v_cid is not null then
    update public.commitments set version = version + 1 where id = v_cid;
  end if;

  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id)
  values (v_uid, p_idempotency_key, 'editar', v_record.context_id, v_hash, v_record.id, v_cid);

  return v_record;
end;
$$;

-- ---------------------------------------------------------------------------
-- Totais por mês pelo mês em que o registro conta
-- ---------------------------------------------------------------------------
create or replace function public.month_totals(p_context_id uuid, p_month date)
returns table (received_cents bigint, paid_cents bigint, difference_cents bigint)
language plpgsql
stable
security invoker
set search_path = public
as $$
begin
  if p_month is null or extract(day from p_month) <> 1 then
    raise exception 'mes_invalido' using errcode = '22023';
  end if;
  if not public.context_permission(p_context_id, 'read') then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  return query
  select coalesce(sum(r.amount_cents) filter (where r.kind = 'receita'), 0)::bigint,
         coalesce(sum(r.amount_cents) filter (where r.kind = 'despesa'), 0)::bigint,
         (coalesce(sum(r.amount_cents) filter (where r.kind = 'receita'), 0)
          - coalesce(sum(r.amount_cents) filter (where r.kind = 'despesa'), 0))::bigint
    from public.financial_records r
   where r.context_id = p_context_id
     and r.deleted_at is null
     and r.counted_month = p_month;
end;
$$;

create or replace function public.months_overview(p_context_id uuid, p_from date, p_to date)
returns table (month date, received_count integer, received_cents bigint, paid_count integer, paid_cents bigint,
               received_checked boolean, paid_checked boolean, received_check_version integer, paid_check_version integer,
               card_purchase_count integer)
language plpgsql
stable
security invoker
set search_path = public
as $$
begin
  -- Sem auxiliares: com security invoker, authenticated não executa clarevo_months_between.
  -- Datas não finitas ('infinity', '-infinity') são recusadas: extract(day ...) delas é nulo e a série de meses não terminaria.
  if p_from is null or p_to is null or not isfinite(p_from) or not isfinite(p_to)
     or extract(day from p_from) <> 1 or extract(day from p_to) <> 1
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
         coalesce(sum(r.amount_cents) filter (where r.kind = 'despesa'), 0)::bigint,
         (coalesce(cr.checked, false) and count(r.id) filter (where r.kind = 'receita') = 0),
         (coalesce(cp.checked, false) and count(r.id) filter (where r.kind = 'despesa') = 0),
         coalesce(cr.version, 0),
         coalesce(cp.version, 0),
         (select count(*)::int from public.card_entries e
           where e.context_id = p_context_id and e.kind = 'parcela' and e.installment_number = 1 and e.deleted_at is null
             and e.purchased_on >= g.m::date and e.purchased_on < (g.m + interval '1 month')::date)
    from generate_series(p_from::timestamp, p_to::timestamp, interval '1 month') as g(m)
    left join public.financial_records r
      on r.context_id = p_context_id and r.deleted_at is null
     and r.counted_month = g.m::date
    left join public.month_checks cr
      on cr.context_id = p_context_id and cr.month = g.m::date and cr.kind = 'recebimentos'
    left join public.month_checks cp
      on cp.context_id = p_context_id and cp.month = g.m::date and cp.kind = 'pagamentos'
   group by g.m, cr.id, cp.id
   order by g.m;
end;
$$;

create or replace function public.set_month_check(p_context uuid, p_month date, p_kind text, p_key text, p_version integer)
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
  v_row public.month_checks%rowtype;
  v_count bigint;
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  perform public.clarevo_check_key(p_key);
  v_hash := md5(jsonb_build_array('marcar_mes_conferido', p_context, p_month, p_kind, p_version)::text);
  perform pg_advisory_xact_lock(hashtext('op:' || v_uid::text || ':' || p_key));

  select * into v_op from public.record_operations where actor_id = v_uid and idempotency_key = p_key;
  if found then
    if v_op.action <> 'marcar_mes_conferido' or v_op.request_hash <> v_hash then
      raise exception 'chave_reutilizada' using errcode = 'PT409';
    end if;
    if not public.context_permission(v_op.context_id, 'read') then
      raise exception 'nao_encontrado' using errcode = 'P0002';
    end if;
    return public.clarevo_month_check_result(v_op.context_id, p_month, p_kind);
  end if;

  if not public.context_permission(p_context, 'write') then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  perform public.clarevo_month_check_validate(v_uid, p_month, p_kind);

  -- A linha pode ainda não existir: a trava consultiva serializa quem marca e desmarca o mesmo mês e tipo; depois, a linha.
  perform pg_advisory_xact_lock(hashtext('conferido:' || p_context::text || ':' || p_month::text || ':' || p_kind));
  select * into v_row from public.month_checks where context_id = p_context and month = p_month and kind = p_kind for update;
  if p_version is distinct from coalesce(v_row.version, 0) or coalesce(v_row.checked, false) then
    raise exception 'versao_desatualizada' using errcode = 'PT409', detail = 'versao_atual=' || coalesce(v_row.version, 0);
  end if;

  -- M3: o mesmo critério de months_overview e month_totals (registros vivos do tipo, pelo mês em que contam: o da data ou, no
  -- recebimento marcado do mês seguinte, o seguinte). Compra no cartão não conta: o que entra no Pago é o pagamento da fatura.
  select count(*) into v_count from public.financial_records r
   where r.context_id = p_context and r.deleted_at is null
     and r.kind = (case p_kind when 'recebimentos' then 'receita' else 'despesa' end)::public.record_kind
     and r.counted_month = p_month;
  if v_count > 0 then
    raise exception 'mes_com_registros' using errcode = 'PT409';
  end if;

  if v_row.id is null then
    insert into public.month_checks (context_id, month, kind, checked, updated_by) values (p_context, p_month, p_kind, true, v_uid);
  else
    update public.month_checks set checked = true, version = version + 1, updated_by = v_uid, updated_at = now() where id = v_row.id;
  end if;

  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id, target_id)
  values (v_uid, p_key, 'marcar_mes_conferido', p_context, v_hash, null, null, null);

  return public.clarevo_month_check_result(p_context, p_month, p_kind);
end;
$$;

-- Função nova nasce executável por todos: só authenticated a executa, como as de antes.
revoke all on function public.create_record(text, uuid, uuid, public.record_kind, bigint, date, text, text, text, boolean) from public, anon;
revoke all on function public.update_record(text, uuid, integer, uuid, bigint, date, text, text, boolean) from public, anon;
grant execute on function public.create_record(text, uuid, uuid, public.record_kind, bigint, date, text, text, text, boolean) to authenticated;
grant execute on function public.update_record(text, uuid, integer, uuid, bigint, date, text, text, boolean) to authenticated;
