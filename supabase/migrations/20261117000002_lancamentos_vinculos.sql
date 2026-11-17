-- Clarevo · migração 0040 · Gasto e recebimento ligados ao que pagaram ou renderam, subcategorias e troca de tipo (D-107). Depois de
-- 20261117000001 (outra frente) e de 20261116000001_foto_perfil.sql.
-- O retorno de quem testa (17/11/2026):
--   1. O gasto que pagou uma conta a pagar, uma parcela ou a fatura de um cartão passa a ser LIGADO a ela, sem criar outro gasto:
--      pay_commitment e pay_invoice ganham p_record_id (no fim, com valor padrão). Com ele, o gasto que já existe vira o pagamento
--      (a conta sai de "Ainda a pagar" e nada conta duas vezes); sem ele, tudo como antes. O gasto ligado guarda linked_payment.
--      undo_commitment_payment e undo_invoice_payment ganham p_keep_record (no fim, padrão false): com true, o gasto fica e só deixa
--      de ser o pagamento (a conta ou a fatura volta a ficar em aberto); sem ele, o gasto é apagado como sempre.
--   2. Subcategoria opcional do gasto (financial_records.subcategory, até 30 caracteres, só com categoria): create_record e
--      update_record ganham p_subcategory. O orçamento continua por categoria.
--   3. Trocar entre gasto e recebimento ao editar: update_record ganha p_kind (nulo mantém). O gasto ligado a uma conta, a uma fatura
--      ou a uma nota fiscal não troca (tipo_nao_muda).
--   4. Recebimento que é rendimento de um investimento (só no Pessoal): create_record e update_record ganham p_investment_id (e, na
--      edição, p_link_investment: nulo mantém, true liga, false desliga). Ligar grava, na mesma transação, o rendimento recebido no
--      investimento (investment_movements, tipo 'rendimento', como add_investment_movement), com o valor, a data e a descrição do
--      recebimento; editar o recebimento atualiza o rendimento, e excluir o recebimento (delete_record) ou trocar para gasto o tira.
--      O rendimento continua fora de Recebido e Pago: o valor entra em Recebido uma vez só, pelo recebimento.
--   5. DESFAZER pelo WhatsApp ou pelo Telegram (clarevo_chat_undo, revisão de 17/11/2026): um gasto anotado por lá pode virar, no app,
--      o pagamento de uma fatura (item 1); delete_record recusa esse gasto (pagamento_de_fatura), e a conversa passa a responder com o
--      resultado próprio 'pagamento_de_fatura' (o caminho é desligar da fatura no app), em vez de falhar. Mesma assinatura e privilégios;
--      chat_messages aceita o resultado novo. As funções do servidor (whatsapp e telegram) conhecem o resultado novo: publicar as duas
--      geradas deste ramo antes ou junto desta migração.
-- O guarda de financial_records passa a aceitar a troca do tipo e do vínculo (conta a pagar e fatura) só dentro dessas funções (marca
-- da transação clarevo.vinculo). A restrição da importação deixa de exigir que o gasto importado fique sem conta a pagar e sem fatura:
-- o lançamento importado pode ser editado e ligado como qualquer outro.
-- As funções do app antigo continuam valendo: todo parâmetro novo vem no fim, com valor padrão, e o conteúdo da chave (hash) só muda
-- quando um parâmetro novo vem preenchido. As assinaturas antigas saem para não haver chamada ambígua. Nenhum dado existente muda.
-- Aplicar no SQL Editor depois da 20261117000001 (docs/05) e recarregar o esquema da API. Testes em
-- supabase/tests/99zzzzzzzzzzzzzzzzzzzz_lancamentos.sql.

-- ---------------------------------------------------------------------------
-- 1. Colunas, restrições e índices
-- ---------------------------------------------------------------------------
alter table public.financial_records
  add column subcategory text,
  add column linked_payment boolean not null default false,
  add column investment_id uuid references public.investments (id) on delete set null,
  add column investment_movement_id uuid references public.investment_movements (id) on delete set null;
alter table public.financial_records add constraint financial_records_subcategoria check (
  subcategory is null or (kind = 'despesa' and category is not null and char_length(subcategory) between 1 and 30 and subcategory = btrim(subcategory)));
alter table public.financial_records add constraint financial_records_vinculo_pagamento check (not linked_payment or commitment_id is not null);
alter table public.financial_records add constraint financial_records_investimento check (
  (investment_id is null or kind = 'receita') and (investment_movement_id is null or kind = 'receita'));
create unique index financial_records_one_income on public.financial_records (investment_movement_id)
  where investment_movement_id is not null and deleted_at is null;
create index financial_records_investment_fk_idx on public.financial_records (investment_id);

-- O lançamento importado pode virar o pagamento de uma conta ou de uma fatura (a chave da importação continua única entre os vivos).
alter table public.financial_records drop constraint financial_records_import_key;
alter table public.financial_records
  add constraint financial_records_import_key check (import_key is null or import_key ~ '^[0-9a-f]{64}$');

comment on column public.financial_records.subcategory is
  'Subcategoria opcional do gasto (D-107): uma das sugestões da categoria ou um texto curto da pessoa, até 30 caracteres. Só com categoria; o orçamento continua por categoria.';
comment on column public.financial_records.linked_payment is
  'O gasto já existia e foi ligado depois à conta a pagar ou à fatura que pagou (pay_commitment ou pay_invoice com p_record_id, D-107).';
comment on column public.financial_records.investment_id is
  'Recebimento que é rendimento deste investimento (D-107), só no Pessoal. O rendimento gravado no investimento está em investment_movement_id.';
comment on column public.financial_records.investment_movement_id is
  'O rendimento recebido (investment_movements) gravado junto com o recebimento: muda e sai com ele. Nulo se o rendimento foi apagado pela ficha do investimento.';

-- ---------------------------------------------------------------------------
-- 2. Guarda: tipo e vínculo só mudam dentro das funções de vínculo (marca da transação clarevo.vinculo)
-- ---------------------------------------------------------------------------
create or replace function public.financial_records_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_link boolean := coalesce(current_setting('clarevo.vinculo', true), '') = 'on';
begin
  if new.id <> old.id or new.created_by <> old.created_by or new.context_id <> old.context_id
     or new.created_at <> old.created_at
     or (not v_link and (new.kind <> old.kind
                         or new.commitment_id is distinct from old.commitment_id
                         or new.card_id is distinct from old.card_id
                         or new.invoice_month is distinct from old.invoice_month))
     or new.receipt_key is distinct from old.receipt_key
     or new.import_key is distinct from old.import_key then
    raise exception 'campo_imutavel' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Auxiliares (sem execute para o app)
-- ---------------------------------------------------------------------------

-- Subcategoria: nula, ou texto de 1 a 30 caracteres num gasto com categoria.
create or replace function public.clarevo_check_subcategory(p_kind public.record_kind, p_category text, p_subcategory text)
returns void
language plpgsql
immutable
set search_path = public
as $$
begin
  if p_subcategory is not null and (p_kind is distinct from 'despesa' or p_category is null or char_length(p_subcategory) > 30) then
    raise exception 'subcategoria_invalida' using errcode = '22023';
  end if;
end;
$$;

-- O investimento ativo do mesmo contexto, travado (escrita no contexto, como add_investment_movement).
create or replace function public.clarevo_income_investment(p_investment_id uuid, p_context_id uuid)
returns public.investments
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_i public.investments%rowtype;
begin
  if p_investment_id is null then
    raise exception 'investimento_invalido' using errcode = '22023';
  end if;
  begin
    v_i := public.clarevo_lock_investment(p_investment_id);
  exception when sqlstate 'P0002' then
    raise exception 'investimento_invalido' using errcode = '22023';
  end;
  if v_i.context_id <> p_context_id then
    raise exception 'investimento_invalido' using errcode = '22023';
  end if;
  if v_i.status <> 'ativo' then
    raise exception 'investimento_encerrado' using errcode = 'PT409';
  end if;
  return v_i;
end;
$$;

revoke all on function public.clarevo_check_subcategory(public.record_kind, text, text) from public, anon, authenticated, service_role;
revoke all on function public.clarevo_income_investment(uuid, uuid) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Criar registro: p_subcategory e p_investment_id no fim
-- ---------------------------------------------------------------------------
drop function public.create_record(text, uuid, uuid, public.record_kind, bigint, date, text, text, text, boolean);
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
  p_next_month boolean default false,
  p_subcategory text default null,
  p_investment_id uuid default null
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
  v_sub text := nullif(public.clarevo_trim(p_subcategory), '');
  v_hash text;
  v_op public.record_operations%rowtype;
  v_account public.financial_accounts%rowtype;
  v_record public.financial_records%rowtype;
  v_i public.investments%rowtype;
  v_m public.investment_movements%rowtype;
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  -- Sem subcategoria e sem investimento, o mesmo conteúdo de antes (concat_ws pula os nulos).
  v_hash := md5(concat_ws('|', 'criar', p_context_id, p_account_id, p_kind, p_amount_cents, p_occurred_on, v_description, coalesce(v_category, ''), v_receipt,
                          case when coalesce(p_next_month, false) then 'mes_seguinte' end,
                          case when v_sub is not null then 'sub=' || v_sub end,
                          case when p_investment_id is not null then 'inv=' || p_investment_id end));
  perform pg_advisory_xact_lock(hashtext('op:' || v_uid::text || ':' || coalesce(p_idempotency_key, '')));

  select * into v_op from public.record_operations where actor_id = v_uid and idempotency_key = p_idempotency_key;
  if found then
    if v_op.request_hash <> v_hash then
      raise exception 'chave_reutilizada' using errcode = 'PT409';
    end if;
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
  perform public.clarevo_check_subcategory(p_kind, v_category, v_sub);
  if v_receipt is not null then
    if p_kind <> 'despesa' or not public.clarevo_receipt_key_valid(v_receipt) then
      raise exception 'chave_de_nota_invalida' using errcode = '22023';
    end if;
    perform public.clarevo_check_receipt_free(p_context_id, v_receipt);
  end if;
  -- Rendimento de investimento (D-107): o rendimento recebido entra no investimento junto com o recebimento.
  if p_investment_id is not null then
    if p_kind <> 'receita' then
      raise exception 'investimento_invalido' using errcode = '22023';
    end if;
    v_i := public.clarevo_income_investment(p_investment_id, p_context_id);
    insert into public.investment_movements (investment_id, context_id, kind, amount_cents, occurred_on, note, created_by)
    values (v_i.id, v_i.context_id, 'rendimento', p_amount_cents, p_occurred_on, v_description, v_uid)
    returning * into v_m;
  end if;

  insert into public.financial_records
    (context_id, account_id, kind, amount_cents, currency, occurred_on, description, category, created_by, receipt_key, next_month, subcategory,
     investment_id, investment_movement_id)
  values
    (p_context_id, p_account_id, p_kind, p_amount_cents, v_account.currency, p_occurred_on, v_description, v_category, v_uid, v_receipt,
     coalesce(p_next_month, false), v_sub, v_i.id, v_m.id)
  returning * into v_record;

  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id)
  values (v_uid, p_idempotency_key, 'criar', p_context_id, v_hash, v_record.id);

  return v_record;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Editar registro: p_kind, p_subcategory, p_investment_id e p_link_investment no fim
-- ---------------------------------------------------------------------------
drop function public.update_record(text, uuid, integer, uuid, bigint, date, text, text, boolean);
create function public.update_record(
  p_idempotency_key text,
  p_record_id uuid,
  p_expected_version integer,
  p_account_id uuid,
  p_amount_cents bigint,
  p_occurred_on date,
  p_description text,
  p_category text default null,
  p_next_month boolean default null,
  p_kind public.record_kind default null,
  p_subcategory text default null,
  p_investment_id uuid default null,
  p_link_investment boolean default null
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
  v_kind public.record_kind;
  v_sub text;
  v_m public.investment_movements%rowtype;
  v_i public.investments%rowtype;
  v_inv uuid;
  v_mov uuid;
  v_want uuid;
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  -- Os parâmetros novos nulos (o app antigo) = o mesmo conteúdo de antes. A subcategoria vazia ('', tirar) entra como está.
  v_hash := md5(concat_ws('|', 'editar', p_record_id, p_expected_version, p_account_id, p_amount_cents, p_occurred_on, v_description, coalesce(v_category, ''),
                          case when p_next_month is not null then 'mes_seguinte=' || p_next_month::text end,
                          case when p_kind is not null then 'tipo=' || p_kind::text end,
                          case when p_subcategory is not null then 'sub=' || public.clarevo_trim(p_subcategory) end,
                          case when p_link_investment is not null then 'inv=' || p_link_investment::text || ':' || coalesce(p_investment_id::text, '') end));
  perform pg_advisory_xact_lock(hashtext('op:' || v_uid::text || ':' || coalesce(p_idempotency_key, '')));

  select * into v_op from public.record_operations where actor_id = v_uid and idempotency_key = p_idempotency_key;
  if found then
    if v_op.request_hash <> v_hash then
      raise exception 'chave_reutilizada' using errcode = 'PT409';
    end if;
    if not public.context_permission(v_op.context_id, 'read') then
      raise exception 'nao_encontrado' using errcode = 'P0002';
    end if;
    select * into v_record from public.financial_records where id = v_op.record_id;
    return v_record;
  end if;

  -- O vínculo só muda por pay_commitment, undo_commitment_payment, pay_invoice e undo_invoice_payment, que travam a conta antes do
  -- registro: a mesma ordem aqui.
  select commitment_id into v_cid from public.financial_records where id = p_record_id;
  if v_cid is not null then
    perform 1 from public.commitments where id = v_cid for update;
  end if;
  v_record := public.clarevo_lock_record(p_record_id);
  -- O vínculo pode ter mudado entre a leitura e a trava (outro pedido ligou ou desligou): a versão do registro subiu.
  if p_expected_version is distinct from v_record.version or v_record.commitment_id is distinct from v_cid then
    raise exception 'versao_desatualizada' using errcode = 'PT409', detail = 'versao_atual=' || v_record.version;
  end if;
  v_kind := coalesce(p_kind, v_record.kind);
  -- Subcategoria: nula (o app antigo) mantém a de antes se o tipo e a categoria não mudaram; '' tira; um texto troca.
  v_sub := case when p_subcategory is null
                  then case when v_kind = v_record.kind and v_category is not distinct from v_record.category then v_record.subcategory end
                else nullif(public.clarevo_trim(p_subcategory), '') end;
  if v_record.card_id is not null
     and (p_amount_cents is distinct from v_record.amount_cents or v_description is distinct from v_record.description
          or v_category is distinct from v_record.category or v_sub is distinct from v_record.subcategory or v_kind <> v_record.kind) then
    raise exception 'pagamento_de_fatura' using errcode = 'PT409';
  end if;
  -- Trocar o tipo (D-107): só o lançamento sem conta a pagar, sem fatura e sem nota fiscal.
  if v_kind <> v_record.kind and (v_record.commitment_id is not null or v_record.receipt_key is not null) then
    raise exception 'tipo_nao_muda' using errcode = 'PT409';
  end if;
  perform public.clarevo_validate_record(v_uid, v_record.context_id, p_account_id, p_amount_cents, p_occurred_on, v_description, v_category,
                                          v_record.account_id);
  -- Mês seguinte (D-089 A): nulo mantém a marca só no recebimento, se a data nova continua no mesmo mês e nos últimos 7 dias dele.
  v_next := case when p_next_month is null
                   then v_kind = 'receita' and v_record.next_month and public.clarevo_next_month_allowed(p_occurred_on)
                        and extract(year from p_occurred_on) = extract(year from v_record.occurred_on)
                        and extract(month from p_occurred_on) = extract(month from v_record.occurred_on)
                 else p_next_month end;
  perform public.clarevo_check_next_month(v_kind, p_occurred_on, v_next);
  perform public.clarevo_check_subcategory(v_kind, v_category, v_sub);

  -- Rendimento de investimento (D-107). O rendimento de antes (se ainda existe) muda junto, sai ou dá lugar a outro.
  if v_record.investment_movement_id is not null then
    select * into v_m from public.investment_movements where id = v_record.investment_movement_id;
  end if;
  v_inv := case when v_m.id is not null then v_record.investment_id end;
  v_want := case when v_kind = 'despesa' or p_link_investment is false then null
                 when p_link_investment then p_investment_id
                 else v_inv end;
  if p_link_investment and p_investment_id is null then
    raise exception 'investimento_invalido' using errcode = '22023';
  end if;
  if v_m.id is not null and v_want is distinct from v_inv then
    perform public.clarevo_lock_investment(v_m.investment_id);
    delete from public.investment_movements where id = v_m.id;
    v_m := null;
  end if;
  if v_want is not null and v_m.id is null then
    v_i := public.clarevo_income_investment(v_want, v_record.context_id);
    insert into public.investment_movements (investment_id, context_id, kind, amount_cents, occurred_on, note, created_by)
    values (v_i.id, v_i.context_id, 'rendimento', p_amount_cents, p_occurred_on, v_description, v_uid)
    returning * into v_m;
  elsif v_m.id is not null and (v_m.amount_cents <> p_amount_cents or v_m.occurred_on <> p_occurred_on or v_m.note is distinct from v_description) then
    perform public.clarevo_lock_investment(v_m.investment_id);
    update public.investment_movements
       set amount_cents = p_amount_cents, occurred_on = p_occurred_on, note = v_description, version = version + 1
     where id = v_m.id;
  end if;
  v_mov := v_m.id;

  perform set_config('clarevo.vinculo', 'on', true);
  update public.financial_records
     set account_id = p_account_id,
         amount_cents = p_amount_cents,
         occurred_on = p_occurred_on,
         description = v_description,
         category = v_category,
         next_month = v_next,
         kind = v_kind,
         subcategory = v_sub,
         investment_id = case when v_mov is null then null else v_want end,
         investment_movement_id = v_mov,
         version = version + 1
   where id = p_record_id
  returning * into v_record;
  perform set_config('clarevo.vinculo', '', true);

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
-- 6. Excluir registro: o rendimento ligado sai junto (mesma assinatura)
-- ---------------------------------------------------------------------------
create or replace function public.delete_record(
  p_idempotency_key text,
  p_record_id uuid,
  p_expected_version integer
)
returns public.financial_records
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_hash text;
  v_op public.record_operations%rowtype;
  v_record public.financial_records%rowtype;
  v_cid uuid;
  v_mid uuid;
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  v_hash := md5(concat_ws('|', 'excluir', p_record_id, p_expected_version));
  perform pg_advisory_xact_lock(hashtext('op:' || v_uid::text || ':' || coalesce(p_idempotency_key, '')));

  select * into v_op from public.record_operations where actor_id = v_uid and idempotency_key = p_idempotency_key;
  if found then
    if v_op.request_hash <> v_hash then
      raise exception 'chave_reutilizada' using errcode = 'PT409';
    end if;
    -- Repetição só devolve o registro se a pessoa ainda pode ler o contexto (vínculo revogado não vê nada).
    -- Não reabre a conta a pagar de novo.
    if not public.context_permission(v_op.context_id, 'read') then
      raise exception 'nao_encontrado' using errcode = 'P0002';
    end if;
    select * into v_record from public.financial_records where id = v_op.record_id;
    return v_record;
  end if;

  -- Mesma ordem de travas de update_record: conta a pagar antes do registro.
  select commitment_id into v_cid from public.financial_records where id = p_record_id;
  if v_cid is not null then
    perform 1 from public.commitments where id = v_cid for update;
  end if;
  v_record := public.clarevo_lock_record(p_record_id);
  if p_expected_version is distinct from v_record.version or v_record.commitment_id is distinct from v_cid then
    raise exception 'versao_desatualizada' using errcode = 'PT409', detail = 'versao_atual=' || v_record.version;
  end if;
  if v_record.card_id is not null then
    raise exception 'pagamento_de_fatura' using errcode = 'PT409';
  end if;

  -- Rendimento de investimento (D-107): o rendimento gravado com o recebimento sai junto.
  select m.id into v_mid from public.investment_movements m where m.id = v_record.investment_movement_id;
  if v_mid is not null then
    perform public.clarevo_lock_investment(v_record.investment_id);
    delete from public.investment_movements where id = v_mid;
  end if;

  -- Exclusão lógica: some das consultas, mantém o rastro mínimo de autoria e operação.
  update public.financial_records
     set deleted_at = now(), deleted_by = v_uid, version = version + 1
   where id = p_record_id
  returning * into v_record;

  -- Excluir o gasto de uma conta paga é o mesmo que desfazer o pagamento: a conta volta a ficar em aberto.
  if v_cid is not null then
    update public.commitments set status = 'aberto', version = version + 1 where id = v_cid;
  end if;

  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id)
  values (v_uid, p_idempotency_key, 'excluir', v_record.context_id, v_hash, v_record.id, v_cid);

  return v_record;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Pagar conta a pagar: p_record_id liga o gasto que já existe (sem criar outro)
-- ---------------------------------------------------------------------------
drop function public.pay_commitment(text, uuid, integer, uuid, bigint, date, text);
create function public.pay_commitment(
  p_idempotency_key text,
  p_commitment_id uuid,
  p_expected_version integer,
  p_account_id uuid,
  p_amount_cents bigint,
  p_paid_on date,
  p_category text default null,
  p_record_id uuid default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_category text := nullif(public.clarevo_trim(p_category), '');
  v_args jsonb;
  v_hash text;
  v_op public.record_operations%rowtype;
  v_c public.commitments%rowtype;
  v_account_id uuid;
  v_account public.financial_accounts%rowtype;
  v_r public.financial_records%rowtype;
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  perform public.clarevo_check_key(p_idempotency_key);
  -- Sem o gasto, o mesmo conteúdo de antes.
  v_args := jsonb_build_array('pagar_compromisso', p_commitment_id, p_expected_version, p_account_id, p_amount_cents, p_paid_on, v_category);
  if p_record_id is not null then
    v_args := v_args || jsonb_build_array(p_record_id);
  end if;
  v_hash := md5(v_args::text);
  perform pg_advisory_xact_lock(hashtext('op:' || v_uid::text || ':' || p_idempotency_key));

  select * into v_op from public.record_operations where actor_id = v_uid and idempotency_key = p_idempotency_key;
  if found then
    if v_op.action <> 'pagar_compromisso' or v_op.request_hash <> v_hash then
      raise exception 'chave_reutilizada' using errcode = 'PT409';
    end if;
    if not public.context_permission(v_op.context_id, 'read') then
      raise exception 'nao_encontrado' using errcode = 'P0002';
    end if;
    return public.clarevo_commitment_result(v_op.commitment_id, v_op.record_id);
  end if;

  v_c := public.clarevo_lock_commitment_for_payment(p_commitment_id);
  -- Pagar a conta de uma fatura sem distribuir a diferença quebraria o saldo anterior: o caminho é pay_invoice.
  if v_c.card_id is not null then
    raise exception 'conta_de_fatura' using errcode = 'PT409';
  end if;
  if p_expected_version is distinct from v_c.version then
    raise exception 'versao_desatualizada' using errcode = 'PT409', detail = 'versao_atual=' || v_c.version;
  end if;
  if v_c.status <> 'aberto' then
    raise exception 'compromisso_quitado' using errcode = 'PT409';
  end if;

  if p_record_id is not null then
    -- Ligar (D-107): o gasto que já existe vira o pagamento. Valor, data e conta são os dele, e a tela manda os que viu: se o gasto
    -- mudou nesse meio-tempo, versao_desatualizada.
    v_r := public.clarevo_lock_record(p_record_id);
    if v_r.context_id <> v_c.context_id or v_r.kind <> 'despesa' then
      raise exception 'registro_invalido' using errcode = '22023';
    end if;
    if v_r.commitment_id is not null or v_r.card_id is not null then
      raise exception 'registro_ja_ligado' using errcode = 'PT409';
    end if;
    if v_r.amount_cents is distinct from p_amount_cents or v_r.occurred_on is distinct from p_paid_on
       or (p_account_id is not null and v_r.account_id <> p_account_id) then
      raise exception 'versao_desatualizada' using errcode = 'PT409', detail = 'registro';
    end if;
    perform set_config('clarevo.vinculo', 'on', true);
    update public.financial_records set commitment_id = v_c.id, linked_payment = true, version = version + 1 where id = v_r.id
    returning * into v_r;
    perform set_config('clarevo.vinculo', '', true);
  else
    -- Mesmas regras do gasto realizado: valor, categoria, data até hoje (data_futura), conta ativa do contexto.
    -- Sem conta (nulo), vale a principal do contexto (A9); a validação trava a conta com for share (A8).
    v_account_id := coalesce(p_account_id, (select a.id from public.financial_accounts a
                                             where a.context_id = v_c.context_id and a.is_default and a.status = 'ativa' and a.deleted_at is null));
    v_account := public.clarevo_validate_record(v_uid, v_c.context_id, v_account_id, p_amount_cents, p_paid_on, v_c.description, v_category);
    if v_account.currency <> v_c.currency then
      raise exception 'conta_invalida' using errcode = '22023';
    end if;

    insert into public.financial_records
      (context_id, account_id, kind, amount_cents, currency, occurred_on, description, category, created_by, commitment_id)
    values
      (v_c.context_id, v_account.id, 'despesa', p_amount_cents, v_account.currency, p_paid_on, v_c.description, v_category, v_uid, v_c.id)
    returning * into v_r;
  end if;

  update public.commitments set status = 'quitado', version = version + 1 where id = v_c.id;

  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id)
  values (v_uid, p_idempotency_key, 'pagar_compromisso', v_c.context_id, v_hash, v_r.id, v_c.id);

  return public.clarevo_commitment_result(v_c.id, v_r.id);
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. Desfazer pagamento de conta a pagar: p_keep_record mantém o gasto (só deixa de ser o pagamento)
-- ---------------------------------------------------------------------------
drop function public.undo_commitment_payment(text, uuid, integer);
create function public.undo_commitment_payment(
  p_idempotency_key text,
  p_commitment_id uuid,
  p_expected_version integer,
  p_keep_record boolean default false
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_args jsonb;
  v_hash text;
  v_op public.record_operations%rowtype;
  v_c public.commitments%rowtype;
  v_rid uuid;
  v_r public.financial_records%rowtype;
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  perform public.clarevo_check_key(p_idempotency_key);
  v_args := jsonb_build_array('desfazer_pagamento', p_commitment_id, p_expected_version);
  if coalesce(p_keep_record, false) then
    v_args := v_args || jsonb_build_array('manter_gasto');
  end if;
  v_hash := md5(v_args::text);
  perform pg_advisory_xact_lock(hashtext('op:' || v_uid::text || ':' || p_idempotency_key));

  select * into v_op from public.record_operations where actor_id = v_uid and idempotency_key = p_idempotency_key;
  if found then
    if v_op.action <> 'desfazer_pagamento' or v_op.request_hash <> v_hash then
      raise exception 'chave_reutilizada' using errcode = 'PT409';
    end if;
    if not public.context_permission(v_op.context_id, 'read') then
      raise exception 'nao_encontrado' using errcode = 'P0002';
    end if;
    return public.clarevo_commitment_result(v_op.commitment_id, v_op.record_id);
  end if;

  v_c := public.clarevo_lock_commitment_for_payment(p_commitment_id);
  -- Desfazer o pagamento da fatura também desfaz o saldo anterior: o caminho é undo_invoice_payment.
  if v_c.card_id is not null then
    raise exception 'conta_de_fatura' using errcode = 'PT409';
  end if;
  if p_expected_version is distinct from v_c.version then
    raise exception 'versao_desatualizada' using errcode = 'PT409', detail = 'versao_atual=' || v_c.version;
  end if;
  if v_c.status <> 'quitado' then
    raise exception 'compromisso_aberto' using errcode = 'PT409';
  end if;
  select id into v_rid from public.financial_records where commitment_id = v_c.id and deleted_at is null;
  -- Também exige permissão sobre o gasto (autoria ou "editar de outras pessoas").
  v_r := public.clarevo_lock_record(v_rid);

  if coalesce(p_keep_record, false) then
    -- O gasto continua (em Pago, na data dele); só deixa de ser o pagamento desta conta.
    perform set_config('clarevo.vinculo', 'on', true);
    update public.financial_records set commitment_id = null, linked_payment = false, version = version + 1 where id = v_r.id
    returning * into v_r;
    perform set_config('clarevo.vinculo', '', true);
  else
    update public.financial_records
       set deleted_at = now(), deleted_by = v_uid, version = version + 1
     where id = v_r.id
    returning * into v_r;
  end if;

  update public.commitments set status = 'aberto', version = version + 1 where id = v_c.id;

  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id)
  values (v_uid, p_idempotency_key, 'desfazer_pagamento', v_c.context_id, v_hash, v_r.id, v_c.id);

  -- record = gasto excluído (rastro) ou o gasto mantido.
  return public.clarevo_commitment_result(v_c.id, v_r.id);
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. Pagar fatura: p_record_id liga o gasto que já existe (o valor e a data são os dele)
-- ---------------------------------------------------------------------------
drop function public.pay_invoice(text, uuid, date, integer, bigint, date, uuid);
create function public.pay_invoice(
  p_idempotency_key text,
  p_card_id uuid,
  p_month date,
  p_expected_version integer,
  p_paid_cents bigint,
  p_paid_on date,
  p_account_id uuid default null,
  p_record_id uuid default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_args jsonb;
  v_hash text;
  v_op public.record_operations%rowtype;
  v_card public.cards%rowtype;
  v_c public.commitments%rowtype;
  v_account public.financial_accounts%rowtype;
  v_r public.financial_records%rowtype;
  v_desc text;
  v_next date;
  v_left bigint;
  v_today date;
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  perform public.clarevo_check_key(p_idempotency_key);
  v_args := jsonb_build_array('pagar_fatura', p_card_id, p_month, p_expected_version, p_paid_cents, p_paid_on);
  if p_account_id is not null then
    v_args := v_args || jsonb_build_array(p_account_id);
  end if;
  if p_record_id is not null then
    v_args := v_args || jsonb_build_array('gasto', p_record_id);
  end if;
  v_hash := md5(v_args::text);
  perform pg_advisory_xact_lock(hashtext('op:' || v_uid::text || ':' || p_idempotency_key));

  select * into v_op from public.record_operations where actor_id = v_uid and idempotency_key = p_idempotency_key;
  if found then
    if v_op.action <> 'pagar_fatura' or v_op.request_hash <> v_hash then
      raise exception 'chave_reutilizada' using errcode = 'PT409';
    end if;
    if not public.context_permission(v_op.context_id, 'read') then
      raise exception 'nao_encontrado' using errcode = 'P0002';
    end if;
    return public.clarevo_pay_result(v_op.target_id, p_month, v_op.commitment_id, v_op.record_id);
  end if;

  v_card := public.clarevo_lock_card(p_card_id, true);                                      -- trava 1: cartão
  if p_month is null or extract(day from p_month) <> 1 then
    raise exception 'mes_invalido' using errcode = '22023';
  end if;
  select * into v_c from public.commitments c
   where c.card_id = v_card.id and c.invoice_month = p_month and c.deleted_at is null for update;   -- trava 2: conta
  if v_c.id is null then
    raise exception 'nao_encontrado' using errcode = 'P0002';
  end if;
  if p_expected_version is distinct from v_c.version then
    raise exception 'versao_desatualizada' using errcode = 'PT409', detail = 'versao_atual=' || v_c.version;
  end if;
  if v_c.status <> 'aberto' then
    raise exception 'compromisso_quitado' using errcode = 'PT409';
  end if;
  v_today := public.clarevo_today(v_uid);
  if v_today <= v_c.card_closing_on then
    raise exception 'fatura_aberta' using errcode = 'PT409';
  end if;
  if p_record_id is not null then
    -- Ligar (D-107; trava 3: o gasto): o gasto que já existe vira o pagamento, com o valor, a data e a conta dele. A tela manda o valor
    -- e a data que viu: se o gasto mudou nesse meio-tempo, versao_desatualizada.
    v_r := public.clarevo_lock_record(p_record_id);
    if v_r.context_id <> v_card.context_id or v_r.kind <> 'despesa' or v_r.receipt_key is not null then
      raise exception 'registro_invalido' using errcode = '22023';
    end if;
    if v_r.commitment_id is not null or v_r.card_id is not null then
      raise exception 'registro_ja_ligado' using errcode = 'PT409';
    end if;
    if v_r.amount_cents is distinct from p_paid_cents or v_r.occurred_on is distinct from p_paid_on
       or (p_account_id is not null and v_r.account_id <> p_account_id) then
      raise exception 'versao_desatualizada' using errcode = 'PT409', detail = 'registro';
    end if;
  end if;
  if p_paid_cents is null or p_paid_cents < 1 then
    raise exception 'valor_invalido' using errcode = '22023';
  end if;
  if p_paid_cents > v_c.amount_cents then
    raise exception 'valor_acima_da_fatura' using errcode = '22023';
  end if;
  if p_paid_on is null
     or p_paid_on < least((v_today - interval '1 year')::date,
                          (public.invoice_closing_on(v_card.closing_day, v_card.due_day, (p_month - interval '1 month')::date) + 1)) then
    raise exception 'data_invalida' using errcode = '22023';
  end if;
  if p_paid_on > v_today then
    raise exception 'data_futura' using errcode = '22023';
  end if;
  if p_record_id is not null then
    -- A conta do gasto ligado vale como está (também arquivada).
    select * into v_account from public.financial_accounts a where a.id = v_r.account_id for share;
  elsif p_account_id is null then
    -- Sem conta, a principal do contexto (A9, antes a mais antiga). for share (A8): a exclusão ou o arquivamento da conta que corre
    -- ao mesmo tempo espera, e quem espera aqui reconfere a linha.
    select * into v_account from public.financial_accounts a
     where a.context_id = v_card.context_id and a.status = 'ativa' and a.deleted_at is null
     order by a.is_default desc, a.created_at, a.id limit 1
       for share;
  else
    select * into v_account from public.financial_accounts a
     where a.id = p_account_id and a.context_id = v_card.context_id and a.status = 'ativa' and a.deleted_at is null
       for share;
  end if;
  if v_account.id is null or v_account.currency <> v_c.currency then
    raise exception 'conta_invalida' using errcode = '22023';
  end if;
  v_left := v_c.amount_cents - p_paid_cents;
  v_next := public.clarevo_next_month(p_month);
  if v_left > 0 and public.clarevo_invoice_paid(v_card.id, v_next) then
    raise exception 'fatura_seguinte_paga' using errcode = 'PT409';
  end if;

  if p_record_id is not null then
    -- O gasto ligado guarda a descrição, a categoria e a subcategoria dele (as telas dividem o pagamento pelas categorias da fatura).
    perform set_config('clarevo.vinculo', 'on', true);
    update public.financial_records
       set commitment_id = v_c.id, card_id = v_card.id, invoice_month = p_month, linked_payment = true, version = version + 1
     where id = v_r.id
    returning * into v_r;
    perform set_config('clarevo.vinculo', '', true);
  else
    v_desc := 'Fatura ' || v_card.nickname || ' (' || public.clarevo_month_name(p_month)
              || case when extract(year from p_month) <> extract(year from p_paid_on)
                      then ' de ' || extract(year from p_month)::int else '' end || ')';

    insert into public.financial_records
      (context_id, account_id, kind, amount_cents, currency, occurred_on, description, category, created_by, commitment_id,
       card_id, invoice_month)
    values
      (v_card.context_id, v_account.id, 'despesa', p_paid_cents, v_account.currency, p_paid_on, v_desc, null, v_uid, v_c.id,
       v_card.id, p_month)
    returning * into v_r;
  end if;

  update public.commitments set status = 'quitado', amount_is_estimate = false, version = version + 1 where id = v_c.id;

  if v_left > 0 then
    insert into public.card_entries (context_id, card_id, kind, invoice_month, amount_cents, source_month, payment_record_id, created_by)
    values (v_card.context_id, v_card.id, 'saldo_anterior', v_next, v_left, p_month, v_r.id, v_uid);
    perform public.clarevo_sync_card(v_card.id, p_month, v_next);
  end if;

  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id, target_id)
  values (v_uid, p_idempotency_key, 'pagar_fatura', v_card.context_id, v_hash, v_r.id, v_c.id, v_card.id);

  return public.clarevo_pay_result(v_card.id, p_month, v_c.id, v_r.id);
end;
$$;

-- ---------------------------------------------------------------------------
-- 10. Desfazer pagamento de fatura: p_keep_record mantém o gasto (só deixa de ser o pagamento)
-- ---------------------------------------------------------------------------
drop function public.undo_invoice_payment(text, uuid, date, integer);
create function public.undo_invoice_payment(
  p_idempotency_key text,
  p_card_id uuid,
  p_month date,
  p_expected_version integer,
  p_keep_record boolean default false
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_args jsonb;
  v_hash text;
  v_op public.record_operations%rowtype;
  v_card public.cards%rowtype;
  v_c public.commitments%rowtype;
  v_r public.financial_records%rowtype;
  v_rid uuid;
  v_next date;
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  perform public.clarevo_check_key(p_idempotency_key);
  v_args := jsonb_build_array('desfazer_pagamento_fatura', p_card_id, p_month, p_expected_version);
  if coalesce(p_keep_record, false) then
    v_args := v_args || jsonb_build_array('manter_gasto');
  end if;
  v_hash := md5(v_args::text);
  perform pg_advisory_xact_lock(hashtext('op:' || v_uid::text || ':' || p_idempotency_key));

  select * into v_op from public.record_operations where actor_id = v_uid and idempotency_key = p_idempotency_key;
  if found then
    if v_op.action <> 'desfazer_pagamento_fatura' or v_op.request_hash <> v_hash then
      raise exception 'chave_reutilizada' using errcode = 'PT409';
    end if;
    if not public.context_permission(v_op.context_id, 'read') then
      raise exception 'nao_encontrado' using errcode = 'P0002';
    end if;
    return public.clarevo_pay_result(v_op.target_id, p_month, v_op.commitment_id, v_op.record_id);
  end if;

  v_card := public.clarevo_lock_card(p_card_id, true);                                      -- trava 1: cartão
  if p_month is null or extract(day from p_month) <> 1 then
    raise exception 'mes_invalido' using errcode = '22023';
  end if;
  select * into v_c from public.commitments c
   where c.card_id = v_card.id and c.invoice_month = p_month and c.deleted_at is null for update;   -- trava 2: conta
  if v_c.id is null then
    raise exception 'nao_encontrado' using errcode = 'P0002';
  end if;
  if p_expected_version is distinct from v_c.version then
    raise exception 'versao_desatualizada' using errcode = 'PT409', detail = 'versao_atual=' || v_c.version;
  end if;
  if v_c.status <> 'quitado' then
    raise exception 'compromisso_aberto' using errcode = 'PT409';
  end if;
  select id into v_rid from public.financial_records where commitment_id = v_c.id and deleted_at is null;
  -- Também exige permissão sobre o gasto (autoria ou "editar de outras pessoas").
  v_r := public.clarevo_lock_record(v_rid);
  v_next := public.clarevo_next_month(p_month);
  if exists (select 1 from public.card_entries e where e.payment_record_id = v_r.id and e.deleted_at is null)
     and public.clarevo_invoice_paid(v_card.id, v_next) then
    raise exception 'fatura_seguinte_paga' using errcode = 'PT409';
  end if;

  update public.card_entries set deleted_at = now(), deleted_by = v_uid, version = version + 1
   where payment_record_id = v_r.id and deleted_at is null;
  if coalesce(p_keep_record, false) then
    -- O gasto continua (em Pago, na data dele); só deixa de ser o pagamento desta fatura.
    perform set_config('clarevo.vinculo', 'on', true);
    update public.financial_records
       set commitment_id = null, card_id = null, invoice_month = null, linked_payment = false, version = version + 1
     where id = v_r.id
    returning * into v_r;
    perform set_config('clarevo.vinculo', '', true);
  else
    update public.financial_records set deleted_at = now(), deleted_by = v_uid, version = version + 1
     where id = v_r.id
    returning * into v_r;
  end if;
  update public.commitments set status = 'aberto', version = version + 1 where id = v_c.id;
  perform public.clarevo_sync_card(v_card.id, p_month, v_next);

  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id, target_id)
  values (v_uid, p_idempotency_key, 'desfazer_pagamento_fatura', v_card.context_id, v_hash, v_r.id, v_c.id, v_card.id);

  -- record = gasto excluído (rastro) ou o gasto mantido.
  return public.clarevo_pay_result(v_card.id, p_month, v_c.id, v_r.id);
end;
$$;

-- ---------------------------------------------------------------------------
-- 11. Privilégios: função nova nasce executável por todos; só authenticated executa, como as de antes.
-- ---------------------------------------------------------------------------
revoke all on function public.create_record(text, uuid, uuid, public.record_kind, bigint, date, text, text, text, boolean, text, uuid) from public, anon;
revoke all on function public.update_record(text, uuid, integer, uuid, bigint, date, text, text, boolean, public.record_kind, text, uuid, boolean) from public, anon;
revoke all on function public.pay_commitment(text, uuid, integer, uuid, bigint, date, text, uuid) from public, anon;
revoke all on function public.undo_commitment_payment(text, uuid, integer, boolean) from public, anon;
revoke all on function public.pay_invoice(text, uuid, date, integer, bigint, date, uuid, uuid) from public, anon;
revoke all on function public.undo_invoice_payment(text, uuid, date, integer, boolean) from public, anon;
grant execute on function public.create_record(text, uuid, uuid, public.record_kind, bigint, date, text, text, text, boolean, text, uuid) to authenticated;
grant execute on function public.update_record(text, uuid, integer, uuid, bigint, date, text, text, boolean, public.record_kind, text, uuid, boolean) to authenticated;
grant execute on function public.pay_commitment(text, uuid, integer, uuid, bigint, date, text, uuid) to authenticated;
grant execute on function public.undo_commitment_payment(text, uuid, integer, boolean) to authenticated;
grant execute on function public.pay_invoice(text, uuid, date, integer, bigint, date, uuid, uuid) to authenticated;
grant execute on function public.undo_invoice_payment(text, uuid, date, integer, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 12. Conversas (revisão de 17/11/2026): o DESFAZER de um gasto anotado pelo WhatsApp ou pelo Telegram que virou, no app, o pagamento de
--     uma fatura (pay_invoice com p_record_id). delete_record recusa esse gasto com pagamento_de_fatura, que a clarevo_chat_undo de
--     20261109000001 não conhecia (caía no raise e a conversa recebia erro). Agora a conversa responde 'pagamento_de_fatura', sem apagar
--     nada nem marcar a mensagem como desfeita. A mesma definição da 20261109000001 com esse caso a mais; mesma assinatura e privilégios.
-- ---------------------------------------------------------------------------
alter table public.chat_messages drop constraint chat_messages_outcome_check;
alter table public.chat_messages add constraint chat_messages_outcome_check check (outcome in (
  'ligado', 'anotado', 'desfeito', 'desligado', 'nao_ligado', 'codigo_invalido', 'ja_ligado', 'muitas_tentativas', 'muitas_mensagens',
  'nada_para_desfazer', 'sem_permissao', 'sem_conta', 'data_futura', 'valor_invalido', 'valor_acima_do_limite', 'descricao_invalida',
  'sem_assinatura', 'ajuda', 'midia', 'nao_entendi', 'compra_anotada', 'compra_desfeita', 'sem_cartao', 'qual_cartao', 'fatura_paga',
  'limite_do_cartao', 'pagamento_de_fatura'));

create or replace function public.clarevo_chat_undo(p_channel text, p_message_id text, p_sender_hash text, p_sent_at timestamptz)
returns jsonb
language plpgsql
volatile
set search_path = public
as $$
declare
  v_gate jsonb;
  v_link public.chat_links%rowtype;
  v_msg public.chat_messages%rowtype;
  v_record public.financial_records%rowtype;
  v_entry public.card_entries%rowtype;
  v_purchase jsonb;
  v_context uuid;
  v_today date;
  v_claims text := coalesce(current_setting('request.jwt.claims', true), '');
  v_sub text := coalesce(current_setting('request.jwt.claim.sub', true), '');
  v_error text;
  v_result text;
begin
  v_gate := public.clarevo_chat_gate(p_channel, p_message_id, p_sender_hash);
  if v_gate is not null then
    return v_gate;
  end if;

  v_link := public.clarevo_chat_link_locked(p_channel, p_sender_hash);
  if v_link.person_id is null then
    perform public.clarevo_chat_log(p_channel, p_message_id, p_sender_hash, null, 'nao_ligado');
    return jsonb_build_object('result', 'nao_ligado');
  end if;
  v_today := public.clarevo_chat_day(v_link.person_id, p_sent_at);

  -- A última anotação deste canal nas últimas 24 horas que ainda existe (gasto, recebimento ou compra no cartão), feita pela pessoa,
  -- num espaço em que ela ainda anota.
  select m.* into v_msg from public.chat_messages m
   where m.person_id = v_link.person_id and m.channel = p_channel and m.outcome in ('anotado', 'compra_anotada') and m.undone_at is null
     and m.received_at > now() - interval '24 hours'
     and ((m.record_id is not null and exists (
             select 1 from public.financial_records r
              join public.context_memberships cm on cm.context_id = r.context_id and cm.person_id = v_link.person_id
                                                 and cm.revoked_at is null and cm.can_write
             where r.id = m.record_id and r.deleted_at is null and r.created_by = v_link.person_id))
          or (m.entry_id is not null and exists (
             select 1 from public.card_entries e
              join public.context_memberships cm on cm.context_id = e.context_id and cm.person_id = v_link.person_id
                                                 and cm.revoked_at is null and cm.can_write
             where e.id = m.entry_id and e.deleted_at is null and e.created_by = v_link.person_id)))
   order by m.received_at desc, m.message_id desc
   limit 1
   for update of m;
  -- A versão é lida com a linha travada: uma edição no app ao mesmo tempo espera aqui.
  if found and v_msg.record_id is not null then
    select * into v_record from public.financial_records where id = v_msg.record_id and deleted_at is null for update;
  elsif found and v_msg.entry_id is not null then
    select * into v_entry from public.card_entries where id = v_msg.entry_id and deleted_at is null for update;
  end if;
  if v_record.id is null and v_entry.id is null then
    perform public.clarevo_chat_log(p_channel, p_message_id, p_sender_hash, v_link.person_id, 'nada_para_desfazer');
    return jsonb_build_object('result', 'nada_para_desfazer');
  end if;
  v_context := coalesce(v_record.context_id, v_entry.context_id);
  if v_entry.id is not null then
    v_purchase := public.clarevo_chat_purchase(v_entry.id);
  end if;

  begin
    perform public.clarevo_chat_as(v_link.person_id);
    if v_record.id is not null then
      perform public.delete_record(p_channel || ':' || md5(p_message_id), v_record.id, v_record.version);
    else
      perform public.delete_card_entry(p_channel || ':' || md5(p_message_id), v_entry.id, v_entry.version);
    end if;
    perform public.clarevo_chat_as(null, v_claims, v_sub);
  exception when others then
    get stacked diagnostics v_error = message_text;
    v_result := case v_error
      when 'sem_permissao' then 'sem_permissao'
      when 'nao_encontrado' then 'nada_para_desfazer'
      when 'versao_desatualizada' then 'nada_para_desfazer'
      when 'conta_excluida' then 'nao_ligado'
      when 'assinatura_necessaria' then 'sem_assinatura'
      when 'fatura_paga' then 'fatura_paga'
      -- O gasto anotado por aqui virou, no app, o pagamento de uma fatura (pay_invoice com p_record_id): só sai pelo caminho da fatura.
      when 'pagamento_de_fatura' then 'pagamento_de_fatura'
    end;
    if v_result is null then
      raise;
    end if;
    perform public.clarevo_chat_log(p_channel, p_message_id, p_sender_hash,
                                    case when v_result = 'nao_ligado' then null else v_link.person_id end, v_result);
    return case when v_result in ('sem_permissao', 'fatura_paga')
                then jsonb_build_object('result', v_result, 'space', public.clarevo_chat_space(v_context), 'today', v_today)
                else jsonb_build_object('result', v_result) end;
  end;

  update public.chat_messages set undone_at = now() where message_id = v_msg.message_id;
  if v_record.id is not null then
    perform public.clarevo_chat_log(p_channel, p_message_id, p_sender_hash, v_link.person_id, 'desfeito', v_record.id);
    return jsonb_build_object('result', 'desfeito', 'space', public.clarevo_chat_space(v_record.context_id),
                              'record', public.clarevo_chat_record(v_record.id), 'today', v_today);
  end if;
  perform public.clarevo_chat_log(p_channel, p_message_id, p_sender_hash, v_link.person_id, 'compra_desfeita', null, v_entry.id);
  return jsonb_build_object('result', 'compra_desfeita', 'space', public.clarevo_chat_space(v_entry.context_id),
                            'purchase', v_purchase, 'today', v_today);
end;
$$;

revoke all on function public.clarevo_chat_undo(text, text, text, timestamptz) from public, anon, authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'revoke all on function public.clarevo_chat_undo(text, text, text, timestamptz) from service_role';
  end if;
end $$;
