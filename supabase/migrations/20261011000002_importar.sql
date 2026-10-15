-- Clarevo · migração 0012 · importar extrato e fatura (D-048, Ciclo I1).
-- Depois de 20261011000001_assinaturas.sql.
-- A pessoa escolhe um arquivo OFX ou uma planilha do banco, revisa as linhas no aparelho e o app manda só as linhas escolhidas,
-- em lotes de até 500, para import_records. Nada do arquivo é guardado além dos registros criados e do resumo de cada linha
-- (import_key, um SHA-256 calculado no aparelho a partir da conta ou do cartão e do identificador da linha ou de data, valor e
-- descrição). O saldo do arquivo é ignorado: não existe saldo por conta (P-018).
-- NÃO muda a assinatura de nenhuma função existente (create_record, add_card_purchase e add_card_refund seguem como estão): o
-- app publicado antes da 0012 continua funcionando. import_records repete por dentro as validações delas, na mesma ordem.
--
-- Invariantes:
-- I1. import_key (64 hexadecimais minúsculos) só existe em gasto ou recebimento comum (nunca em pagamento de conta ou de fatura),
--     na primeira parcela de uma compra no cartão e em estorno manual; é imutável e única por contexto entre linhas vivas
--     (excluir a linha libera a chave: o mesmo arquivo pode ser importado de novo).
-- I2. import_records escreve no contexto (basta escrita, como create_record e add_card_purchase). Destino 'conta': conta ativa do
--     contexto (conta_invalida). Destino 'cartao': cartão do contexto, ativo (cartao_arquivado). De 1 a 500 itens (itens_invalidos).
-- I3. Cada item tem import_key; item cuja chave já existe viva no destino é pulado (conta como pulado, sem validar nem gravar).
--     Os demais são validados como create_record (conta: despesa ou receita) ou como add_card_purchase com 1 parcela e
--     add_card_refund (cartão: compra ou estorno); qualquer recusa desfaz o lote inteiro e traz detail = 'item=<posição de 1 a n>'.
-- I4. Cartão: a compra cai na fatura natural da data (invoice_month_for); fatura paga recusa com fatura_paga; no máximo 5.000
--     lançamentos vivos por cartão (limite_de_lancamentos); as contas das faturas afetadas são mantidas por clarevo_sync_card.
--     Compra no cartão nunca entra em Pago (D-037); gasto da conta entra em Pago na data dele (D-021).
-- I5. Idempotência por chave e por pessoa (o mesmo espaço das demais operações): a repetição devolve o resultado gravado
--     ({created, skipped}) sem escrever; chave com outro conteúdo é chave_reutilizada. A operação aponta para a conta ou o cartão
--     (target_id) e conta como anotação na atividade (D-030), como as demais escritas.
-- Ordem de travas: chave -> importação do destino (consultiva) -> conta (for share) ou cartão -> contas de fatura.

-- ---------------------------------------------------------------------------
-- Colunas, restrições e índices únicos (I1)
-- ---------------------------------------------------------------------------
alter table public.financial_records add column import_key text;
alter table public.financial_records
  add constraint financial_records_import_key check (
    import_key is null or (import_key ~ '^[0-9a-f]{64}$' and commitment_id is null and card_id is null));
create unique index financial_records_import_key on public.financial_records (context_id, import_key)
  where import_key is not null and deleted_at is null;

alter table public.card_entries add column import_key text;
alter table public.card_entries
  add constraint card_entries_import_key check (
    import_key is null or (import_key ~ '^[0-9a-f]{64}$'
                           and ((kind = 'parcela' and installment_number = 1) or (kind = 'estorno' and source_month is null))));
create unique index card_entries_import_key on public.card_entries (context_id, import_key)
  where import_key is not null and deleted_at is null;

comment on column public.financial_records.import_key is
  'Resumo SHA-256 (64 hexadecimais minúsculos) da linha importada de um extrato (conta + identificador da linha, ou conta + data, valor e descrição): evita importar duas vezes. Só por import_records; único por contexto entre linhas vivas.';
comment on column public.card_entries.import_key is
  'Resumo SHA-256 (64 hexadecimais minúsculos) da linha importada de uma fatura (cartão + identificador da linha, ou cartão + data, valor e descrição). Só por import_records; único por contexto entre linhas vivas.';

-- Guardas: a chave da importação nunca muda depois de gravada (mesmas funções da 0008 com a condição nova).
create or replace function public.financial_records_guard()
returns trigger
language plpgsql
as $$
begin
  if new.id <> old.id or new.created_by <> old.created_by or new.context_id <> old.context_id
     or new.kind <> old.kind or new.created_at <> old.created_at
     or new.commitment_id is distinct from old.commitment_id
     or new.card_id is distinct from old.card_id
     or new.invoice_month is distinct from old.invoice_month
     or new.receipt_key is distinct from old.receipt_key
     or new.import_key is distinct from old.import_key then
    raise exception 'campo_imutavel' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.card_entries_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.id <> old.id or new.context_id <> old.context_id or new.card_id <> old.card_id or new.kind <> old.kind
     or new.purchase_id is distinct from old.purchase_id
     or new.installment_number is distinct from old.installment_number
     or new.source_month is distinct from old.source_month
     or new.payment_record_id is distinct from old.payment_record_id
     or new.receipt_key is distinct from old.receipt_key
     or new.import_key is distinct from old.import_key
     or new.created_by <> old.created_by or new.created_at <> old.created_at
     or old.deleted_at is not null or new.version <> old.version + 1 then
    raise exception 'campo_imutavel' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Operações: lista completa vigente (48 ações das migrações anteriores) mais 'importar_extrato', que aponta para a conta ou o
-- cartão de destino (target_id) e guarda o resultado ({created, skipped}) em import_result, só nessa ação.
-- ---------------------------------------------------------------------------
alter table public.record_operations add column import_result jsonb;
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
  'importar_extrato'));
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
                 'marcar_assinatura', 'importar_extrato')
      and target_id is not null and record_id is null and commitment_id is null)
  or (action in ('pagar_fatura', 'desfazer_pagamento_fatura')
      and target_id is not null and record_id is not null and commitment_id is not null)
  or (action = 'criar_ocorrencia' and commitment_id is not null and target_id is not null and record_id is null)
  or (action in ('decidir_revisao', 'responder_guardar', 'revisar_assinaturas')
      and record_id is null and commitment_id is null and target_id is null));
-- import_result só existe em importar_extrato, e sempre nela.
alter table public.record_operations add constraint record_operations_import_check check (
  (import_result is not null) = (action = 'importar_extrato'));

-- ---------------------------------------------------------------------------
-- Linhas já importadas, para a marca "Já anotado" antes de gravar: uma linha por gasto vivo (conta) ou por compra ou estorno
-- vivo (cartão) que tem import_key. Só chama context_permission, como receipt_items. Nunca expõe a linha original do arquivo.
-- ---------------------------------------------------------------------------
create view public.import_items with (security_barrier = true) as
select r.context_id, r.import_key, r.id as record_id, null::uuid as card_entry_id, null::uuid as card_id
  from public.financial_records r
 where r.import_key is not null and r.deleted_at is null and public.context_permission(r.context_id, 'read')
union all
select e.context_id, e.import_key, null::uuid, e.id, e.card_id
  from public.card_entries e
 where e.import_key is not null and e.deleted_at is null and public.context_permission(e.context_id, 'read');
comment on view public.import_items is
  'Linhas importadas de extrato ou fatura ainda vivas que quem consulta pode ler, pelo resumo (import_key): ler antes de importar para marcar "Já anotado".';

-- ---------------------------------------------------------------------------
-- Importar em lote (I2 a I5).
-- Itens (jsonb, array de objetos):
--   conta:  {import_key, kind: 'despesa' | 'receita', amount_cents, occurred_on, description, category}
--   cartao: {import_key, kind: 'compra' | 'estorno', amount_cents, occurred_on, description, category}
--           (compra: 1 parcela, valor total; estorno: crédito na fatura da data, com a descrição da compra devolvida)
-- Ordem: sessão; chave; repetição; destino_invalido; itens_invalidos (não é array, vazio ou mais de 500); sem_permissao; destino
-- (conta_invalida; nao_encontrado, cartao_arquivado); depois, por item: itens_invalidos (não é objeto), chave_de_importacao_invalida,
-- pulado se a chave já existe, tipo_invalido, validação de create_record (valor_invalido, valor_acima_do_limite,
-- descricao_obrigatoria, descricao_longa, categoria_invalida, data_invalida, data_futura) ou de add_card_purchase (as mesmas mais
-- a faixa de 48 meses) e add_card_refund (mes_invalido), limite_de_lancamentos, fatura_paga. Recusa não grava nada.
-- Retorno: {created, skipped}.
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
        if v_kind = 'compra' then
          perform public.clarevo_validate_purchase(v_uid, v_amount, v_description, v_category, 1, v_date, true);
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
        if v_kind = 'estorno' then
          perform public.clarevo_validate_invoice_month(v_uid, v_month, true);
        end if;
        if v_live + 1 > 5000 then
          raise exception 'limite_de_lancamentos' using errcode = 'PT409';
        end if;
        if public.clarevo_invoice_paid(v_card.id, v_month) then
          raise exception 'fatura_paga' using errcode = 'PT409';
        end if;
        v_id := gen_random_uuid();
        if v_kind = 'compra' then
          insert into public.card_entries (id, context_id, card_id, kind, invoice_month, amount_cents, description, category,
                                           purchase_id, purchased_on, installment_number, installment_total, purchase_total_cents,
                                           import_key, created_by)
          values (v_id, v_card.context_id, v_card.id, 'parcela', v_month, v_amount, v_description, v_category,
                  v_id, v_date, 1, 1, v_amount, v_key, v_uid);
        else
          insert into public.card_entries (id, context_id, card_id, kind, invoice_month, amount_cents, description, category,
                                           import_key, created_by)
          values (v_id, v_card.context_id, v_card.id, 'estorno', v_month, v_amount, v_description, v_category, v_key, v_uid);
        end if;
        v_live := v_live + 1;
        v_from := least(coalesce(v_from, v_month), v_month);
        v_to := greatest(coalesce(v_to, v_month), v_month);
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

-- ---------------------------------------------------------------------------
-- Leitura (RLS) e privilégios. Nenhuma tabela ganha escrita direta; a nova função e a nova visão se somam ao bloco inteiro da
-- 0011 (idempotente), com import_records no fim.
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
grant execute on function public.add_goal_movement(text, uuid, text, bigint, date, text, uuid) to authenticated;
grant execute on function public.update_goal_movement(text, uuid, integer, bigint, date, text, uuid) to authenticated;
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

grant execute on function public.create_account(text, uuid, text, text) to authenticated;
grant execute on function public.update_account(text, uuid, integer, text, text) to authenticated;
grant execute on function public.set_default_account(text, uuid, integer) to authenticated;
grant execute on function public.set_account_status(text, uuid, integer, text, uuid) to authenticated;
grant execute on function public.delete_account(text, uuid, integer) to authenticated;

grant execute on function public.set_series_subscription(text, uuid, integer, boolean) to authenticated;
grant execute on function public.mark_subscriptions_reviewed(text, uuid) to authenticated;

grant execute on function public.import_records(text, uuid, text, uuid, jsonb) to authenticated;
