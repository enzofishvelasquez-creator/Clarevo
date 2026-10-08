-- Clarevo · migração 0002 · contas a pagar: cadastro, pagamento atômico, desfazer (D-020, D-021).
-- Escrita só por create_commitment / update_commitment / delete_commitment / pay_commitment / undo_commitment_payment:
-- autoria da sessão, chave de idempotência por pessoa (mesmo espaço das operações de registro), versão, exclusão lógica.
-- Também: update_record e delete_record recusam versão ausente e mantêm a conta a pagar vinculada coerente.
--
-- Invariantes (garantidas aqui, não só no app):
-- I1. Conta 'quitado' não excluída tem exatamente 1 gasto vivo vinculado; conta 'aberto' tem 0.
-- I2. O gasto vinculado é 'despesa' e está no mesmo contexto da conta a pagar.
-- I3. Conta excluída está sempre 'aberto'.
-- I4. O vínculo (financial_records.commitment_id) nunca muda.
-- Ordem de travas em todas as funções: conta a pagar antes do registro.

-- ---------------------------------------------------------------------------
-- Contas a pagar
-- ---------------------------------------------------------------------------
alter table public.commitments drop constraint commitments_description_check;
alter table public.commitments add constraint commitments_description_check
  check (description = btrim(description) and char_length(description) between 1 and 80);
alter table public.commitments
  add column category text check (category is null or (category = btrim(category) and char_length(category) between 1 and 40)),
  add column version integer not null default 1 check (version >= 1),
  add column updated_at timestamptz not null default now(),
  add column deleted_at timestamptz,
  add column deleted_by uuid references public.persons (id),
  add constraint commitments_id_context_key unique (id, context_id),
  -- 'cancelado' existe no tipo, mas fica bloqueado neste ciclo (só existe exclusão).
  add constraint commitments_status_neste_ciclo check (status in ('aberto', 'quitado')),
  add constraint commitments_excluida_aberta check (deleted_at is null or status = 'aberto');
create index commitments_ctx_due on public.commitments (context_id, due_on) where deleted_at is null;
comment on table public.commitments is 'Contas a pagar (compromissos previstos). Origem separada; só o gasto gerado ao pagar entra em Pago.';

-- Registros: vínculo imutável com a conta a pagar que quitaram (mesmo contexto pela FK composta).
alter table public.financial_records add column commitment_id uuid;
alter table public.financial_records
  add constraint financial_records_commitment_fk foreign key (commitment_id, context_id)
    references public.commitments (id, context_id),
  add constraint financial_records_commitment_kind check (commitment_id is null or kind = 'despesa');
create unique index financial_records_one_live_payment on public.financial_records (commitment_id)
  where commitment_id is not null and deleted_at is null;

-- Operações: novas ações e alvo duplo (registro, conta a pagar ou os dois).
alter table public.record_operations drop constraint record_operations_action_check;
alter table public.record_operations
  add constraint record_operations_action_check check (action in ('criar', 'editar', 'excluir',
    'criar_compromisso', 'editar_compromisso', 'excluir_compromisso', 'pagar_compromisso', 'desfazer_pagamento')),
  alter column record_id drop not null,
  add column commitment_id uuid,
  add constraint record_operations_target_check check (
    (action in ('criar', 'editar', 'excluir') and record_id is not null)
    or (action in ('criar_compromisso', 'editar_compromisso', 'excluir_compromisso') and commitment_id is not null and record_id is null)
    or (action in ('pagar_compromisso', 'desfazer_pagamento') and commitment_id is not null and record_id is not null));

-- ---------------------------------------------------------------------------
-- Gatilhos de proteção
-- ---------------------------------------------------------------------------

-- Defesa adicional: identidade, autoria, contexto, tipo e vínculo com conta a pagar de um registro nunca mudam.
create or replace function public.financial_records_guard()
returns trigger
language plpgsql
as $$
begin
  if new.id <> old.id or new.created_by <> old.created_by or new.context_id <> old.context_id
     or new.kind <> old.kind or new.created_at <> old.created_at
     or new.commitment_id is distinct from old.commitment_id then
    raise exception 'campo_imutavel' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.commitments_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.id <> old.id or new.context_id <> old.context_id or new.created_by <> old.created_by
     or new.created_at <> old.created_at or new.currency <> old.currency then
    raise exception 'campo_imutavel' using errcode = '42501';
  end if;
  -- Conta paga: o previsto não muda enquanto o pagamento existir.
  if old.status = 'quitado' and new.status = 'quitado'
     and (new.amount_cents <> old.amount_cents or new.due_on <> old.due_on or new.description <> old.description
          or new.category is distinct from old.category) then
    raise exception 'campo_imutavel' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger commitments_guard
  before update on public.commitments
  for each row execute function public.commitments_guard();

-- Invariante I1, conferida no fim da transação (pagar e desfazer passam por um estado intermediário).
-- security definer: dispara no commit com o papel de quem chamou (authenticated).
-- Defesa de último nível: as funções nunca a disparam; ela pega escrita manual no banco,
-- inclusive a exclusão física do gasto vivo de uma conta paga.
create or replace function public.clarevo_check_commitment_payment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_c public.commitments%rowtype;
  v_live int;
begin
  if tg_table_name = 'commitments' then
    v_id := new.id;
  elsif tg_op = 'DELETE' then
    v_id := old.commitment_id;
  else
    v_id := new.commitment_id;
  end if;
  if v_id is null then
    return null;
  end if;
  select * into v_c from public.commitments where id = v_id;
  -- Conta a pagar apagada na mesma transação (exclusão do contexto inteiro): não sobra vínculo para conferir.
  if not found then
    return null;
  end if;
  select count(*) into v_live from public.financial_records where commitment_id = v_id and deleted_at is null;
  if not ((v_c.status = 'quitado' and v_c.deleted_at is null and v_live = 1) or (v_c.status = 'aberto' and v_live = 0)) then
    raise exception 'vinculo_inconsistente' using errcode = '23514';
  end if;
  return null;
end;
$$;

create constraint trigger commitments_payment_consistency
  after insert or update on public.commitments
  deferrable initially deferred
  for each row execute function public.clarevo_check_commitment_payment();
create constraint trigger records_payment_consistency
  after insert or update on public.financial_records
  deferrable initially deferred
  for each row when (new.commitment_id is not null)
  execute function public.clarevo_check_commitment_payment();
-- Exclusão física de um gasto vinculado: a conta não pode ficar 'quitado' sem gasto vivo.
create constraint trigger records_payment_consistency_del
  after delete on public.financial_records
  deferrable initially deferred
  for each row when (old.commitment_id is not null)
  execute function public.clarevo_check_commitment_payment();

-- ---------------------------------------------------------------------------
-- Leitura: RLS e visão
-- ---------------------------------------------------------------------------
drop policy commitments_read on public.commitments;
create policy commitments_read on public.commitments for select to authenticated
  using (deleted_at is null and public.context_permission(context_id, 'read'));

-- Conta a pagar + gasto vivo que a quitou. security_invoker: a RLS de quem consulta vale nas duas tabelas (Postgres 15+).
create view public.commitment_items with (security_invoker = true) as
select c.id, c.context_id, c.description, c.amount_cents, c.currency, c.due_on, c.status, c.category,
       c.created_by, c.version, c.created_at, c.updated_at,
       r.id as paid_record_id, r.occurred_on as paid_on, r.amount_cents as paid_amount_cents, r.account_id as paid_account_id
  from public.commitments c
  left join public.financial_records r on r.commitment_id = c.id and r.deleted_at is null
 where c.deleted_at is null;
comment on view public.commitment_items is 'Contas a pagar não excluídas com o gasto vivo que as quitou (paid_* nulos quando em aberto).';

-- ---------------------------------------------------------------------------
-- Funções auxiliares (sem execute para authenticated)
-- ---------------------------------------------------------------------------
create or replace function public.clarevo_check_key(p_key text)
returns void
language plpgsql
immutable
set search_path = public
as $$
begin
  if p_key is null or char_length(p_key) not between 8 and 80 then
    raise exception 'chave_invalida' using errcode = '22023';
  end if;
end;
$$;

-- Mesmas regras do app (packages/core/src/validation.ts), na mesma ordem.
-- p_check_range = false na edição quando o vencimento não mudou (conta antiga continua editável).
create or replace function public.clarevo_validate_commitment(
  p_actor uuid, p_amount_cents bigint, p_due_on date, p_description text, p_category text, p_check_range boolean
)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_today date := public.clarevo_today(p_actor);
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
  if p_due_on is null then
    raise exception 'data_invalida' using errcode = '22023';
  end if;
  -- De 1 ano antes a 2 anos depois de hoje; aritmética de interval limita o dia ao fim do mês (29/02).
  if p_check_range and (p_due_on < (v_today - interval '1 year')::date or p_due_on > (v_today + interval '2 years')::date) then
    raise exception 'vencimento_fora_do_intervalo' using errcode = '22023';
  end if;
end;
$$;

-- Igual a clarevo_lock_record: carrega para alteração sem revelar se existe para quem não pode ler.
create or replace function public.clarevo_lock_commitment(p_commitment_id uuid)
returns public.commitments
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_c public.commitments%rowtype;
begin
  select * into v_c from public.commitments where id = p_commitment_id for update;
  if not found or v_c.deleted_at is not null or not public.context_permission(v_c.context_id, 'read') then
    raise exception 'nao_encontrado' using errcode = 'P0002';
  end if;
  if not public.context_permission(v_c.context_id, 'write')
     or (v_c.created_by <> auth.uid() and not public.context_permission(v_c.context_id, 'edit_others')) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  return v_c;
end;
$$;

-- Resultado único das funções de conta a pagar: 'commitment' no mesmo formato da visão commitment_items
-- (mais deleted_at), 'record' quando houver gasto envolvido.
create or replace function public.clarevo_commitment_result(p_commitment_id uuid, p_record_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'commitment', (select to_jsonb(c) || jsonb_build_object('paid_record_id', r.id, 'paid_on', r.occurred_on,
                                                           'paid_amount_cents', r.amount_cents, 'paid_account_id', r.account_id)
                     from public.commitments c
                     left join public.financial_records r on r.commitment_id = c.id and r.deleted_at is null
                    where c.id = p_commitment_id),
    'record', (select to_jsonb(r) from public.financial_records r where r.id = p_record_id));
$$;

-- ---------------------------------------------------------------------------
-- Contas a pagar: anotar, editar, excluir, pagar, desfazer (atômico, idempotente, versionado)
-- Estrutura comum: sessão; chave; texto aparado; hash de jsonb_build_array(ação, argumentos)::text;
-- trava da chave; repetição (ação e hash iguais, leitura do contexto); travas; versão; situação; validação; escrita.
-- O hash em JSON não é ambíguo: textos ficam entre aspas e escapados (um '|' na descrição não se confunde com a
-- separação de campos), NULL é diferente de texto vazio e datas saem em ISO, qualquer que seja o DateStyle.
-- As funções de registro (create_record, update_record, delete_record) mantêm o hash da 0001.
-- ---------------------------------------------------------------------------
create or replace function public.create_commitment(
  p_idempotency_key text,
  p_context_id uuid,
  p_amount_cents bigint,
  p_due_on date,
  p_description text,
  p_category text default null
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
  v_c public.commitments%rowtype;
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  perform public.clarevo_check_key(p_idempotency_key);
  v_hash := md5(jsonb_build_array('criar_compromisso', p_context_id, p_amount_cents, p_due_on, v_description, v_category)::text);
  perform pg_advisory_xact_lock(hashtext('op:' || v_uid::text || ':' || p_idempotency_key));

  select * into v_op from public.record_operations where actor_id = v_uid and idempotency_key = p_idempotency_key;
  if found then
    if v_op.action <> 'criar_compromisso' or v_op.request_hash <> v_hash then
      raise exception 'chave_reutilizada' using errcode = 'PT409';
    end if;
    if not public.context_permission(v_op.context_id, 'read') then
      raise exception 'nao_encontrado' using errcode = 'P0002';
    end if;
    return public.clarevo_commitment_result(v_op.commitment_id, v_op.record_id);
  end if;

  if not public.context_permission(p_context_id, 'write') then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  perform public.clarevo_validate_commitment(v_uid, p_amount_cents, p_due_on, v_description, v_category, true);

  insert into public.commitments (context_id, description, amount_cents, currency, due_on, category, created_by)
  values (p_context_id, v_description, p_amount_cents,
          (select currency from public.financial_contexts where id = p_context_id), p_due_on, v_category, v_uid)
  returning * into v_c;

  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id)
  values (v_uid, p_idempotency_key, 'criar_compromisso', p_context_id, v_hash, null, v_c.id);

  return public.clarevo_commitment_result(v_c.id, null);
end;
$$;

create or replace function public.update_commitment(
  p_idempotency_key text,
  p_commitment_id uuid,
  p_expected_version integer,
  p_amount_cents bigint,
  p_due_on date,
  p_description text,
  p_category text default null
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
  v_c public.commitments%rowtype;
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  perform public.clarevo_check_key(p_idempotency_key);
  v_hash := md5(jsonb_build_array('editar_compromisso', p_commitment_id, p_expected_version, p_amount_cents, p_due_on,
                                  v_description, v_category)::text);
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
  perform public.clarevo_validate_commitment(v_uid, p_amount_cents, p_due_on, v_description, v_category,
                                             p_due_on is distinct from v_c.due_on);

  update public.commitments
     set amount_cents = p_amount_cents,
         due_on = p_due_on,
         description = v_description,
         category = v_category,
         version = version + 1
   where id = v_c.id;

  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id)
  values (v_uid, p_idempotency_key, 'editar_compromisso', v_c.context_id, v_hash, null, v_c.id);

  return public.clarevo_commitment_result(v_c.id, null);
end;
$$;

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
     set deleted_at = now(), deleted_by = v_uid, version = version + 1
   where id = v_c.id;

  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id)
  values (v_uid, p_idempotency_key, 'excluir_compromisso', v_c.context_id, v_hash, null, v_c.id);

  return public.clarevo_commitment_result(v_c.id, null);
end;
$$;

-- Marcar como paga: cria um único gasto realizado (valor e data efetivamente pagos) e quita a conta, na mesma operação.
create or replace function public.pay_commitment(
  p_idempotency_key text,
  p_commitment_id uuid,
  p_expected_version integer,
  p_account_id uuid,
  p_amount_cents bigint,
  p_paid_on date,
  p_category text default null
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
  v_hash text;
  v_op public.record_operations%rowtype;
  v_c public.commitments%rowtype;
  v_account public.financial_accounts%rowtype;
  v_r public.financial_records%rowtype;
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  perform public.clarevo_check_key(p_idempotency_key);
  v_hash := md5(jsonb_build_array('pagar_compromisso', p_commitment_id, p_expected_version, p_account_id, p_amount_cents,
                                  p_paid_on, v_category)::text);
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

  v_c := public.clarevo_lock_commitment(p_commitment_id);
  if p_expected_version is distinct from v_c.version then
    raise exception 'versao_desatualizada' using errcode = 'PT409', detail = 'versao_atual=' || v_c.version;
  end if;
  if v_c.status <> 'aberto' then
    raise exception 'compromisso_quitado' using errcode = 'PT409';
  end if;
  -- Mesmas regras do gasto realizado: valor, categoria, data até hoje (data_futura), conta ativa do contexto.
  v_account := public.clarevo_validate_record(v_uid, v_c.context_id, p_account_id, p_amount_cents, p_paid_on, v_c.description, v_category);
  if v_account.currency <> v_c.currency then
    raise exception 'conta_invalida' using errcode = '22023';
  end if;

  insert into public.financial_records
    (context_id, account_id, kind, amount_cents, currency, occurred_on, description, category, created_by, commitment_id)
  values
    (v_c.context_id, p_account_id, 'despesa', p_amount_cents, v_account.currency, p_paid_on, v_c.description, v_category, v_uid, v_c.id)
  returning * into v_r;

  update public.commitments set status = 'quitado', version = version + 1 where id = v_c.id;

  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id)
  values (v_uid, p_idempotency_key, 'pagar_compromisso', v_c.context_id, v_hash, v_r.id, v_c.id);

  return public.clarevo_commitment_result(v_c.id, v_r.id);
end;
$$;

-- Desfazer o pagamento: exclui logicamente o gasto (o vínculo fica como rastro) e reabre a conta, na mesma operação.
create or replace function public.undo_commitment_payment(
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
  v_rid uuid;
  v_r public.financial_records%rowtype;
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  perform public.clarevo_check_key(p_idempotency_key);
  v_hash := md5(jsonb_build_array('desfazer_pagamento', p_commitment_id, p_expected_version)::text);
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

  v_c := public.clarevo_lock_commitment(p_commitment_id);
  if p_expected_version is distinct from v_c.version then
    raise exception 'versao_desatualizada' using errcode = 'PT409', detail = 'versao_atual=' || v_c.version;
  end if;
  if v_c.status <> 'quitado' then
    raise exception 'compromisso_aberto' using errcode = 'PT409';
  end if;
  select id into v_rid from public.financial_records where commitment_id = v_c.id and deleted_at is null;
  -- Também exige permissão sobre o gasto (autoria ou "editar de outras pessoas").
  v_r := public.clarevo_lock_record(v_rid);

  update public.financial_records
     set deleted_at = now(), deleted_by = v_uid, version = version + 1
   where id = v_r.id
  returning * into v_r;

  update public.commitments set status = 'aberto', version = version + 1 where id = v_c.id;

  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id)
  values (v_uid, p_idempotency_key, 'desfazer_pagamento', v_c.context_id, v_hash, v_r.id, v_c.id);

  -- record = gasto excluído (rastro).
  return public.clarevo_commitment_result(v_c.id, v_r.id);
end;
$$;

-- "Ainda a pagar" pelo mesmo critério do app (summarizeToPay em packages/core/src/summary.ts).
-- Mês corrente: em aberto com vencimento até o fim do mês, incluindo vencidas de meses anteriores.
-- Outro mês: só as em aberto com vencimento naquele mês. É estoque em aberto hoje, não fluxo.
-- security definer com filtros explícitos (exclusão, contexto, permissão de leitura).
create or replace function public.month_to_pay(p_context_id uuid, p_month date)
returns table (due_in_month_cents bigint, overdue_before_cents bigint, to_pay_cents bigint, open_count integer)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_current boolean;
  v_next date;
begin
  if p_month is null or extract(day from p_month) <> 1 then
    raise exception 'mes_invalido' using errcode = '22023';
  end if;
  if not public.context_permission(p_context_id, 'read') then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  v_current := date_trunc('month', public.clarevo_today(auth.uid())::timestamp)::date = p_month;
  v_next := (p_month + interval '1 month')::date;
  return query
  select coalesce(sum(c.amount_cents) filter (where c.due_on >= p_month), 0)::bigint,
         coalesce(sum(c.amount_cents) filter (where c.due_on < p_month), 0)::bigint,
         coalesce(sum(c.amount_cents), 0)::bigint,
         count(*)::int
    from public.commitments c
   where c.context_id = p_context_id
     and c.deleted_at is null
     and c.status = 'aberto'
     and c.due_on < v_next
     and (c.due_on >= p_month or v_current);
end;
$$;

-- ---------------------------------------------------------------------------
-- Registros: editar e excluir (mesma assinatura, hash, repetição e retorno da 0001)
-- Mudanças: versão ausente é recusada; gasto de conta a pagar trava a conta antes do registro,
-- editar soma 1 à versão da conta e excluir reabre a conta.
-- ---------------------------------------------------------------------------
create or replace function public.update_record(
  p_idempotency_key text,
  p_record_id uuid,
  p_expected_version integer,
  p_account_id uuid,
  p_amount_cents bigint,
  p_occurred_on date,
  p_description text,
  p_category text default null
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
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  v_hash := md5(concat_ws('|', 'editar', p_record_id, p_expected_version, p_account_id, p_amount_cents, p_occurred_on, v_description, coalesce(v_category, '')));
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
  perform public.clarevo_validate_record(v_uid, v_record.context_id, p_account_id, p_amount_cents, p_occurred_on, v_description, v_category);

  update public.financial_records
     set account_id = p_account_id,
         amount_cents = p_amount_cents,
         occurred_on = p_occurred_on,
         description = v_description,
         category = v_category,
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
  if p_expected_version is distinct from v_record.version then
    raise exception 'versao_desatualizada' using errcode = 'PT409', detail = 'versao_atual=' || v_record.version;
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
-- Privilégios: o shim e o Supabase dão privilégios amplos a objetos novos e o Postgres dá EXECUTE a PUBLIC
-- em funções novas. Repetimos o bloco inteiro da 0001 (idempotente) e concedemos só o necessário.
-- commitments e commitment_items ficam sem insert, update ou delete diretos.
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
-- Usadas pelas políticas (avaliadas com os privilégios de quem consulta).
grant execute on function public.context_permission(uuid, text) to authenticated;
grant execute on function public.is_org_admin(uuid) to authenticated;

grant execute on function public.create_commitment(text, uuid, bigint, date, text, text) to authenticated;
grant execute on function public.update_commitment(text, uuid, integer, bigint, date, text, text) to authenticated;
grant execute on function public.delete_commitment(text, uuid, integer) to authenticated;
grant execute on function public.pay_commitment(text, uuid, integer, uuid, bigint, date, text) to authenticated;
grant execute on function public.undo_commitment_payment(text, uuid, integer) to authenticated;
grant execute on function public.month_to_pay(uuid, date) to authenticated;
