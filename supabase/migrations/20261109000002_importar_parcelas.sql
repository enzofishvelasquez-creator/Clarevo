-- Clarevo · migração 0029 · Importar a fatura com as compras parceladas em andamento (D-089 B). Depois de 20261109000001_chat_cartao.sql.
-- A linha da fatura com a parcela escrita ("LOJA 03/10") passa a entrar como compra parcelada com as parcelas que faltam (da 3 à 10),
-- e não mais como uma compra à vista do valor da parcela: card_entries ganha installment_offset (quantas parcelas já tinham passado
-- antes da primeira guardada; 0 nas compras do app), as parcelas guardadas continuam numeradas de 1 a n, e o app soma o deslocamento
-- ao mostrar ("parcela 3 de 10"). import_records cria as linhas (a primeira, com a chave da linha, na fatura em que a parcela entra; as
-- outras nas faturas seguintes) e update_card_entry carrega o deslocamento ao acrescentar parcelas e recusa passar de 48 no total.
-- Nenhum dado existente muda (deslocamento 0). Aplicar no SQL Editor depois da 0028 (docs/05, passo 12s). Testes em
-- supabase/tests/99zzzzzzzz_importar_parcelas.sql e 90_importar.sql.

-- ---------------------------------------------------------------------------
-- O deslocamento das parcelas
-- ---------------------------------------------------------------------------
alter table public.card_entries add column installment_offset smallint not null default 0;
-- Sem deslocamento a restrição é trivial: a forma das colunas continua a cargo de card_entries_forma (que vem depois na ordem de conferência).
alter table public.card_entries add constraint card_entries_deslocamento check (
  installment_offset = 0
  or (kind = 'parcela' and installment_offset between 1 and 47 and installment_total + installment_offset <= 48));
comment on column public.card_entries.installment_offset is
  'Compra importada da fatura com a parcela em andamento (D-089 B): quantas parcelas já tinham passado antes da primeira guardada; 0 nas compras anotadas no app. A numeração mostrada soma o deslocamento.';

-- A visão que o app lê ganha a coluna (no fim, como o create or replace view exige).
create or replace view public.card_entry_items with (security_barrier = true) as
select e.id, e.context_id, e.card_id,
       case e.kind when 'parcela' then 'compra' else e.kind end as kind,
       e.description, e.category, e.charge_kind, e.purchased_on,
       coalesce(e.purchase_total_cents, e.amount_cents) as amount_cents,
       coalesce(e.installment_total, 1)::integer as installments,
       e.invoice_month, e.source_month, e.payment_record_id, e.receipt_key,
       e.created_by, e.version, e.created_at, e.updated_at,
       e.installment_offset
  from public.card_entries e
 where e.deleted_at is null and (e.kind <> 'parcela' or e.installment_number = 1)
   and public.context_permission(e.context_id, 'read');

-- O lançamento no retorno das funções de cartão, com o deslocamento.
create or replace function public.clarevo_entry_json(p_entry_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
           'id', e.id, 'context_id', e.context_id, 'card_id', e.card_id,
           'kind', case e.kind when 'parcela' then 'compra' else e.kind end,
           'description', e.description, 'category', e.category, 'charge_kind', e.charge_kind, 'purchased_on', e.purchased_on,
           'amount_cents', coalesce(e.purchase_total_cents, e.amount_cents),
           'installments', coalesce(e.installment_total, 1)::integer,
           'installment_offset', e.installment_offset,
           'invoice_month', e.invoice_month, 'source_month', e.source_month, 'payment_record_id', e.payment_record_id,
           'receipt_key', e.receipt_key, 'created_by', e.created_by, 'version', e.version, 'created_at', e.created_at,
           'updated_at', e.updated_at, 'deleted_at', e.deleted_at, 'deleted_by', e.deleted_by)
    from public.card_entries e
   where e.id = (select coalesce(x.purchase_id, x.id) from public.card_entries x where x.id = p_entry_id)
$$;

-- ---------------------------------------------------------------------------
-- Editar a compra: o deslocamento acompanha as parcelas acrescentadas, e o total (guardadas mais as que passaram) não passa de 48.
-- Corpo da 0008, com as duas mudanças (create or replace mantém os privilégios).
-- ---------------------------------------------------------------------------
create or replace function public.update_card_entry(
  p_idempotency_key text,
  p_entry_id uuid,
  p_expected_version integer,
  p_kind text,
  p_amount_cents bigint,
  p_occurred_on date,
  p_description text,
  p_category text,
  p_installments integer default null,
  p_invoice_month date default null,
  p_charge_kind text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_description text := nullif(public.clarevo_trim(p_description), '');
  v_category text := nullif(public.clarevo_trim(p_category), '');
  v_hash text;
  v_op public.record_operations%rowtype;
  v_e public.card_entries%rowtype;
  v_card public.cards%rowtype;
  v_first public.card_entries%rowtype;
  v_old_n integer;
  v_n integer;
  v_m1 date;
  v_month date;
  v_from date;
  v_to date;
  v_change boolean;
  k integer;
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  perform public.clarevo_check_key(p_idempotency_key);
  v_hash := md5(jsonb_build_array('alterar_lancamento_cartao', p_entry_id, p_expected_version, p_kind, p_amount_cents,
                                  p_occurred_on, v_description, v_category, p_installments, p_invoice_month,
                                  p_charge_kind)::text);
  perform pg_advisory_xact_lock(hashtext('op:' || v_uid::text || ':' || p_idempotency_key));

  select * into v_op from public.record_operations where actor_id = v_uid and idempotency_key = p_idempotency_key;
  if found then
    if v_op.action <> 'alterar_lancamento_cartao' or v_op.request_hash <> v_hash then
      raise exception 'chave_reutilizada' using errcode = 'PT409';
    end if;
    if not public.context_permission(v_op.context_id, 'read') then
      raise exception 'nao_encontrado' using errcode = 'P0002';
    end if;
    return public.clarevo_card_entry_result(v_op.entry_id);
  end if;

  v_e := public.clarevo_lock_card_entry(p_entry_id);
  select * into v_card from public.cards where id = v_e.card_id;
  if p_kind is distinct from (case v_e.kind when 'parcela' then 'compra' else v_e.kind end) then
    raise exception 'tipo_invalido' using errcode = '22023';
  end if;
  -- Versão ausente (NULL) também é recusada.
  if p_expected_version is distinct from v_e.version then
    raise exception 'versao_desatualizada' using errcode = 'PT409', detail = 'versao_atual=' || v_e.version;
  end if;

  if v_e.kind = 'parcela' then
    if p_invoice_month is not null or p_charge_kind is not null then
      raise exception 'campo_nao_se_aplica' using errcode = '22023';
    end if;
    select * into v_first from public.card_entries
     where purchase_id = v_e.purchase_id and installment_number = 1 and deleted_at is null;
    perform public.clarevo_validate_purchase(v_uid, p_amount_cents, v_description, v_category, p_installments, p_occurred_on,
                                             p_occurred_on is distinct from v_first.purchased_on);
    v_old_n := v_first.installment_total;
    v_n := p_installments;
    -- Compra importada em andamento (D-089 B): as parcelas guardadas mais as que já passaram não passam de 48.
    if v_n + coalesce(v_first.installment_offset, 0) > 48 then
      raise exception 'parcelas_invalidas' using errcode = '22023';
    end if;
    v_change := p_amount_cents <> v_first.purchase_total_cents or v_n <> v_old_n or p_occurred_on <> v_first.purchased_on;
    if v_change then
      v_m1 := case when p_occurred_on = v_first.purchased_on then v_first.invoice_month
                   else public.invoice_month_for(v_card.closing_day, v_card.due_day, p_occurred_on) end;
      if exists (select 1 from public.card_entries x
                  where x.purchase_id = v_e.purchase_id and x.deleted_at is null
                    and public.clarevo_invoice_paid(x.card_id, x.invoice_month)) then
        raise exception 'fatura_paga' using errcode = 'PT409';
      end if;
      for k in 0 .. v_n - 1 loop
        if public.clarevo_invoice_paid(v_card.id, (v_m1 + make_interval(months => k))::date) then
          raise exception 'fatura_paga' using errcode = 'PT409';
        end if;
      end loop;
      if v_n > v_old_n then
        perform public.clarevo_check_entry_cap(v_card.id, v_n - v_old_n);
      end if;
      v_from := least(v_first.invoice_month, v_m1);
      v_to := greatest((v_first.invoice_month + make_interval(months => v_old_n - 1))::date,
                       (v_m1 + make_interval(months => v_n - 1))::date);
      for k in 1 .. v_n loop
        v_month := (v_m1 + make_interval(months => k - 1))::date;
        if k <= v_old_n then
          update public.card_entries
             set invoice_month = v_month, amount_cents = public.clarevo_installment_cents(p_amount_cents, v_n, k),
                 description = v_description, category = v_category, purchased_on = p_occurred_on,
                 installment_total = v_n, purchase_total_cents = p_amount_cents, version = version + 1
           where purchase_id = v_e.purchase_id and installment_number = k and deleted_at is null;
        else
          insert into public.card_entries (context_id, card_id, kind, invoice_month, amount_cents, description, category,
                                           purchase_id, purchased_on, installment_number, installment_total,
                                           purchase_total_cents, installment_offset, created_by, version)
          values (v_card.context_id, v_card.id, 'parcela', v_month, public.clarevo_installment_cents(p_amount_cents, v_n, k),
                  v_description, v_category, v_e.purchase_id, p_occurred_on, k, v_n, p_amount_cents, v_first.installment_offset,
                  v_first.created_by, v_first.version + 1);
        end if;
      end loop;
      update public.card_entries
         set deleted_at = now(), deleted_by = v_uid, version = version + 1
       where purchase_id = v_e.purchase_id and installment_number > v_n and deleted_at is null;
      perform public.clarevo_sync_card(v_card.id, v_from, v_to);
    else
      update public.card_entries set description = v_description, category = v_category, version = version + 1
       where purchase_id = v_e.purchase_id and deleted_at is null;
    end if;
  elsif v_e.kind = 'encargo' then
    if p_occurred_on is not null or v_description is not null or v_category is not null or p_installments is not null then
      raise exception 'campo_nao_se_aplica' using errcode = '22023';
    end if;
    perform public.clarevo_validate_charge(p_charge_kind, p_amount_cents);
    perform public.clarevo_validate_invoice_month(v_uid, p_invoice_month, p_invoice_month is distinct from v_e.invoice_month);
    if public.clarevo_invoice_paid(v_card.id, v_e.invoice_month) or public.clarevo_invoice_paid(v_card.id, p_invoice_month) then
      raise exception 'fatura_paga' using errcode = 'PT409';
    end if;
    update public.card_entries
       set invoice_month = p_invoice_month, amount_cents = p_amount_cents, charge_kind = p_charge_kind, version = version + 1
     where id = v_e.id;
    perform public.clarevo_sync_card(v_card.id, least(v_e.invoice_month, p_invoice_month), greatest(v_e.invoice_month, p_invoice_month));
  else
    if p_occurred_on is not null or p_installments is not null or p_charge_kind is not null then
      raise exception 'campo_nao_se_aplica' using errcode = '22023';
    end if;
    perform public.clarevo_validate_refund(p_amount_cents, v_description, v_category);
    perform public.clarevo_validate_invoice_month(v_uid, p_invoice_month, p_invoice_month is distinct from v_e.invoice_month);
    if public.clarevo_invoice_paid(v_card.id, v_e.invoice_month) or public.clarevo_invoice_paid(v_card.id, p_invoice_month) then
      raise exception 'fatura_paga' using errcode = 'PT409';
    end if;
    update public.card_entries
       set invoice_month = p_invoice_month, amount_cents = p_amount_cents, description = v_description, category = v_category,
           version = version + 1
     where id = v_e.id;
    perform public.clarevo_sync_card(v_card.id, least(v_e.invoice_month, p_invoice_month), greatest(v_e.invoice_month, p_invoice_month));
  end if;

  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id, target_id, entry_id)
  values (v_uid, p_idempotency_key, 'alterar_lancamento_cartao', v_e.context_id, v_hash, null, null, v_e.card_id, v_e.id);

  return public.clarevo_card_entry_result(v_e.id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Importar a fatura: a linha com a parcela escrita vira a compra com as parcelas que faltam. Corpo da 0012, com as mudanças.
-- ---------------------------------------------------------------------------
create or replace function public.import_records(
  p_idempotency_key text,
  p_context_id uuid,
  p_destination text,
  p_target_id uuid,
  p_items jsonb
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
  v_account public.financial_accounts%rowtype;
  v_card public.cards%rowtype;
  v_i integer;
  v_item jsonb;
  v_key text;
  v_kind text;
  v_amount bigint;
  v_date date;
  v_description text;
  v_category text;
  v_month date;
  v_from date;
  v_to date;
  v_id uuid;
  v_inst_k integer;
  v_inst_n integer;
  v_remaining integer;
  v_offset integer;
  v_target date;
  j integer;
  v_live integer := 0;
  v_created integer := 0;
  v_skipped integer := 0;
  v_msg text;
  v_state text;
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  perform public.clarevo_check_key(p_idempotency_key);
  v_hash := md5(jsonb_build_array('importar_extrato', p_context_id, p_destination, p_target_id, p_items)::text);
  perform pg_advisory_xact_lock(hashtext('op:' || v_uid::text || ':' || p_idempotency_key));

  select * into v_op from public.record_operations where actor_id = v_uid and idempotency_key = p_idempotency_key;
  if found then
    if v_op.action <> 'importar_extrato' or v_op.request_hash <> v_hash then
      raise exception 'chave_reutilizada' using errcode = 'PT409';
    end if;
    if not public.context_permission(v_op.context_id, 'read') then
      raise exception 'nao_encontrado' using errcode = 'P0002';
    end if;
    return v_op.import_result;
  end if;

  if p_destination is null or p_destination not in ('conta', 'cartao') then
    raise exception 'destino_invalido' using errcode = '22023';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 500 then
    raise exception 'itens_invalidos' using errcode = '22023';
  end if;
  if not public.context_permission(p_context_id, 'write') then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  -- Uma importação por vez em cada destino (a chave única já impede a duplicata; a trava deixa o resultado previsível).
  perform pg_advisory_xact_lock(hashtext('importar:' || coalesce(p_target_id::text, '')));

  if p_destination = 'conta' then
    select * into v_account from public.financial_accounts
     where id = p_target_id and context_id = p_context_id and deleted_at is null and status = 'ativa'
     for share;
    if not found then
      raise exception 'conta_invalida' using errcode = '22023';
    end if;
  else
    v_card := public.clarevo_lock_card(p_target_id, false);
    if v_card.context_id <> p_context_id then
      raise exception 'nao_encontrado' using errcode = 'P0002';
    end if;
    if v_card.status <> 'ativo' then
      raise exception 'cartao_arquivado' using errcode = 'PT409';
    end if;
    select count(*) into v_live from public.card_entries e where e.card_id = v_card.id and e.deleted_at is null;
  end if;

  for v_i, v_item in
    select o::integer, v from jsonb_array_elements(p_items) with ordinality as t(v, o) order by o
  loop
    begin
      if jsonb_typeof(v_item) <> 'object' then
        raise exception 'itens_invalidos' using errcode = '22023';
      end if;
      v_key := v_item ->> 'import_key';
      if v_key is null or v_key !~ '^[0-9a-f]{64}$' then
        raise exception 'chave_de_importacao_invalida' using errcode = '22023';
      end if;
      -- Já importado e ainda vivo: pula, sem validar.
      if (p_destination = 'conta' and exists (select 1 from public.financial_records r
                                                where r.context_id = p_context_id and r.import_key = v_key and r.deleted_at is null))
         or (p_destination = 'cartao' and exists (select 1 from public.card_entries e
                                                    where e.context_id = p_context_id and e.import_key = v_key and e.deleted_at is null)) then
        v_skipped := v_skipped + 1;
        continue;
      end if;

      v_kind := v_item ->> 'kind';
      if v_kind is null or v_kind not in (case p_destination when 'conta' then 'despesa' else 'compra' end,
                                          case p_destination when 'conta' then 'receita' else 'estorno' end) then
        raise exception 'tipo_invalido' using errcode = '22023';
      end if;
      -- Valor e data ilegíveis viram nulos: o validador de cada tipo os recusa na ordem de create_record e add_card_purchase.
      v_amount := case when jsonb_typeof(v_item -> 'amount_cents') = 'number' and (v_item ->> 'amount_cents') ~ '^[0-9]{1,18}$'
                       then (v_item ->> 'amount_cents')::bigint end;
      v_date := null;
      if (v_item ->> 'occurred_on') ~ '^\d{4}-\d{2}-\d{2}$' then
        begin
          v_date := (v_item ->> 'occurred_on')::date;
        exception when others then
          v_date := null;
        end;
      end if;
      v_description := public.clarevo_trim(v_item ->> 'description');
      v_category := nullif(public.clarevo_trim(v_item ->> 'category'), '');

      if p_destination = 'conta' then
        perform public.clarevo_validate_record(v_uid, p_context_id, p_target_id, v_amount, v_date, v_description, v_category);
        insert into public.financial_records
          (context_id, account_id, kind, amount_cents, currency, occurred_on, description, category, created_by, import_key)
        values
          (p_context_id, p_target_id, v_kind::public.record_kind, v_amount, v_account.currency, v_date, v_description, v_category,
           v_uid, v_key);
      else
        v_remaining := 1;
        v_offset := 0;
        if v_kind = 'compra' then
          -- Parcela escrita na linha da fatura (D-089 B): a compra entra com as parcelas que faltam (desta à última), com o
          -- deslocamento das que já passaram. Os dois números vêm juntos ou não vêm; de 2 a 48 parcelas; a desta linha de 1 ao total.
          if (v_item ? 'installment_number') or (v_item ? 'installment_count') then
            if jsonb_typeof(v_item -> 'installment_number') is distinct from 'number'
               or jsonb_typeof(v_item -> 'installment_count') is distinct from 'number'
               or (v_item ->> 'installment_number') !~ '^[0-9]{1,2}$' or (v_item ->> 'installment_count') !~ '^[0-9]{1,2}$' then
              raise exception 'parcelas_invalidas' using errcode = '22023';
            end if;
            v_inst_k := (v_item ->> 'installment_number')::integer;
            v_inst_n := (v_item ->> 'installment_count')::integer;
            if v_inst_n < 2 or v_inst_n > 48 or v_inst_k < 1 or v_inst_k > v_inst_n then
              raise exception 'parcelas_invalidas' using errcode = '22023';
            end if;
            v_remaining := v_inst_n - v_inst_k + 1;
            v_offset := v_inst_k - 1;
          end if;
          perform public.clarevo_validate_purchase(v_uid, v_amount * v_remaining, v_description, v_category, v_remaining, v_date, true);
        else
          perform public.clarevo_validate_refund(v_amount, v_description, v_category);
          if v_date is null then
            raise exception 'data_invalida' using errcode = '22023';
          end if;
          if v_date > public.clarevo_today(v_uid) then
            raise exception 'data_futura' using errcode = '22023';
          end if;
        end if;
        v_month := public.invoice_month_for(v_card.closing_day, v_card.due_day, v_date);
        if v_kind = 'compra' and v_offset > 0 then
          -- A data da linha costuma ser a da compra original: a parcela k cai k - 1 faturas depois da natural. Se isso passar da
          -- próxima fatura (a linha trazia a data da cobrança), a parcela entra na fatura natural da própria data: a mesma regra de
          -- installmentInvoiceMonth, no núcleo.
          v_target := (v_month + make_interval(months => v_offset))::date;
          if v_target <= (date_trunc('month', public.clarevo_today(v_uid)::timestamp) + interval '1 month')::date then
            v_month := v_target;
          end if;
        end if;
        if v_kind = 'estorno' then
          perform public.clarevo_validate_invoice_month(v_uid, v_month, true);
        end if;
        if v_live + v_remaining > 5000 then
          raise exception 'limite_de_lancamentos' using errcode = 'PT409';
        end if;
        for j in 0 .. v_remaining - 1 loop
          if public.clarevo_invoice_paid(v_card.id, (v_month + make_interval(months => j))::date) then
            raise exception 'fatura_paga' using errcode = 'PT409';
          end if;
        end loop;
        v_id := gen_random_uuid();
        if v_kind = 'compra' then
          -- Uma linha por parcela que falta: a primeira (id da compra, com a chave da linha) na fatura em que a parcela entra e as
          -- outras nas seguintes; o total guardado é o das parcelas que faltam.
          for j in 1 .. v_remaining loop
            insert into public.card_entries (id, context_id, card_id, kind, invoice_month, amount_cents, description, category,
                                             purchase_id, purchased_on, installment_number, installment_total, purchase_total_cents,
                                             installment_offset, import_key, created_by)
            values (case when j = 1 then v_id else gen_random_uuid() end, v_card.context_id, v_card.id, 'parcela',
                    (v_month + make_interval(months => j - 1))::date, v_amount, v_description, v_category,
                    v_id, v_date, j, v_remaining, v_amount * v_remaining, v_offset, case when j = 1 then v_key end, v_uid);
          end loop;
        else
          insert into public.card_entries (id, context_id, card_id, kind, invoice_month, amount_cents, description, category,
                                           import_key, created_by)
          values (v_id, v_card.context_id, v_card.id, 'estorno', v_month, v_amount, v_description, v_category, v_key, v_uid);
        end if;
        v_live := v_live + v_remaining;
        v_from := least(coalesce(v_from, v_month), v_month);
        v_to := greatest(coalesce(v_to, v_month), (v_month + make_interval(months => v_remaining - 1))::date);
      end if;
      v_created := v_created + 1;
    exception when others then
      -- A posição do item vai no detalhe (1 a n); o resto da recusa é o do validador.
      get stacked diagnostics v_msg = message_text, v_state = returned_sqlstate;
      raise exception '%', v_msg using errcode = v_state, detail = 'item=' || v_i;
    end;
  end loop;

  if p_destination = 'cartao' and v_created > 0 then
    perform public.clarevo_sync_card(v_card.id, v_from, v_to);
  end if;

  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id, target_id, import_result)
  values (v_uid, p_idempotency_key, 'importar_extrato', p_context_id, v_hash, null, null, p_target_id,
          jsonb_build_object('created', v_created, 'skipped', v_skipped));

  return jsonb_build_object('created', v_created, 'skipped', v_skipped);
end;
$$;
