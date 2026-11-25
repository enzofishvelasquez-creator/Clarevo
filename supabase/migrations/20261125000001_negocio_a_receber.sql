-- Clarevo · migração 0045 · Espaço Negócio: a receber e as marcas de nota e de quem pagou (D-122). Depois de
-- 20261124000001_negocio_movimentos.sql.
-- A partir da pesquisa de 18/11/2026 (itens 3 e 8 da lista priorizada; o item 9, os lembretes do MEI, é só do app): o dinheiro que o
-- negócio ainda vai receber (o fiado e a venda no cartão que ainda vai cair) e duas marcas opcionais nas entradas do negócio (se teve nota
-- fiscal e quem pagou). Leve, sem virar contabilidade, e sem a Clarevo calcular imposto.
--
-- O que muda no banco:
--   1. "A receber" (business_receivables): tipo (fiado, cartão ou outro), descrição, valor, data combinada ou prevista, categoria de
--      entrada (Vendas, Serviços ou Outras entradas) e, se a pessoa quiser, só o nome de quem deve. Só no negócio, lido por quem lê o
--      negócio. Não entra em total nenhum: o dinheiro entra quando é recebido. Funções create_receivable, update_receivable,
--      delete_receivable (só em aberto) e receive_receivable, que grava a entrada comum ligada (financial_records.receivable_id) e marca
--      o "a receber" como recebido. Excluir essa entrada (delete_record de sempre) devolve o "a receber" para aberto (gatilho); a entrada
--      não vira gasto (recebimento_ligado) nem muda de espaço (lancamento_ligado, move_record).
--   2. Marcas: financial_records.has_invoice e payer_kind ('pf', 'pj', 'exterior'), opcionais, só em entrada de negócio. create_record
--      e update_record ganham p_marks no fim (o app anterior continua chamando sem ele: em update, nulo mantém as marcas).
--   3. Quatro ações novas em record_operations (103 no total), todas contam como anotação e passam pela trava da assinatura. A limpeza
--      dos 6 meses apaga também o "a receber" excluído.
-- Compatibilidade: as assinaturas antigas de create_record e update_record saem e as novas aceitam a mesma chamada (os parâmetros novos
-- vêm no fim, com valor padrão); nenhum dado muda. O app novo chama as funções novas: aplicar antes do merge (docs/05, passo 12al) e
-- recarregar o esquema da API. Testes em supabase/tests/99zzzzzzzzzzzzzzzzzzzzzzzz_negocio_a_receber.sql.

-- ---------------------------------------------------------------------------
-- 1. "A receber"
-- ---------------------------------------------------------------------------
create table public.business_receivables (
  id uuid primary key default gen_random_uuid(),
  context_id uuid not null references public.financial_contexts (id) on delete cascade,
  kind text not null,
  description text not null,
  amount_cents bigint not null,
  currency char(3) not null default 'BRL',
  expected_on date not null,
  category text not null,
  debtor text,
  status text not null default 'aberto',
  created_by uuid not null references public.persons (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  deleted_at timestamptz,
  deleted_by uuid references public.persons (id),
  constraint business_receivables_tipo check (kind in ('fiado', 'cartao', 'outro')),
  constraint business_receivables_descricao check (char_length(description) between 1 and 80),
  constraint business_receivables_valor check (amount_cents between 1 and 999999999),
  constraint business_receivables_data check (expected_on between date '2000-01-01' and date '2100-12-31'),
  constraint business_receivables_categoria check (category in ('Vendas', 'Serviços', 'Outras entradas')),
  constraint business_receivables_nome check (debtor is null or char_length(debtor) between 1 and 60),
  constraint business_receivables_situacao check (status in ('aberto', 'recebido')),
  constraint business_receivables_exclusao check ((deleted_at is null) = (deleted_by is null)),
  constraint business_receivables_versao check (version >= 1)
);
create index business_receivables_context on public.business_receivables (context_id, expected_on) where deleted_at is null;
create index business_receivables_created_by_fk_idx on public.business_receivables (created_by);
create index business_receivables_deleted_by_fk_idx on public.business_receivables (deleted_by);
comment on table public.business_receivables is
  'A receber do negócio (D-122): o fiado, a venda no cartão que ainda vai cair e outros valores. Não entra em total nenhum; receive_receivable grava a entrada ligada. Gravado só pelas funções do "a receber".';
comment on column public.business_receivables.debtor is 'Só o nome de quem deve (opcional, até 60 caracteres); o app pede para não escrever CPF nem outros dados.';

alter table public.business_receivables enable row level security;
-- O excluído não é lido (como os lançamentos): o nome de quem devia some da leitura na hora, antes da limpeza dos 6 meses.
create policy business_receivables_read on public.business_receivables for select to authenticated
  using (deleted_at is null and public.context_permission(context_id, 'read'));

-- A entrada que recebeu o "a receber": uma viva por "a receber", e sempre uma entrada.
alter table public.financial_records add column receivable_id uuid references public.business_receivables (id) on delete set null;
create unique index financial_records_receivable_id_vivo on public.financial_records (receivable_id)
  where receivable_id is not null and deleted_at is null;
create index financial_records_receivable_id_fk_idx on public.financial_records (receivable_id);
alter table public.financial_records add constraint financial_records_a_receber check (receivable_id is null or kind = 'receita');
comment on column public.financial_records.receivable_id is
  'D-122: o "a receber" que esta entrada recebeu (receive_receivable). Excluir a entrada devolve o "a receber" para aberto.';

-- ---------------------------------------------------------------------------
-- 2. Marcas da entrada do negócio
-- ---------------------------------------------------------------------------
alter table public.financial_records add column has_invoice boolean;
alter table public.financial_records add column payer_kind text;
alter table public.financial_records add constraint financial_records_quem_pagou check (payer_kind is null or payer_kind in ('pf', 'pj', 'exterior'));
alter table public.financial_records add constraint financial_records_marcas check ((has_invoice is null and payer_kind is null) or kind = 'receita');
comment on column public.financial_records.has_invoice is 'D-122: a entrada do negócio teve nota fiscal (opcional; nulo é não marcado).';
comment on column public.financial_records.payer_kind is 'D-122: quem pagou a entrada do negócio: pf (pessoa física), pj (empresa) ou exterior (opcional).';

-- ---------------------------------------------------------------------------
-- 3. Guardas
-- ---------------------------------------------------------------------------
-- O vínculo com o "a receber" só nasce em receive_receivable (marca da transação clarevo.a_receber) e só some com o próprio "a receber"
-- apagado de vez (on delete set null).
create or replace function public.financial_records_receivable_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.receivable_id is distinct from old.receivable_id and new.receivable_id is not null
     and coalesce(current_setting('clarevo.a_receber', true), '') <> 'on' then
    raise exception 'campo_imutavel' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger financial_records_receivable_guard
  before update on public.financial_records
  for each row execute function public.financial_records_receivable_guard();

create or replace function public.financial_records_receivable_guard_insert()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.receivable_id is not null and coalesce(current_setting('clarevo.a_receber', true), '') <> 'on' then
    raise exception 'campo_imutavel' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger financial_records_receivable_guard_insert
  before insert on public.financial_records
  for each row execute function public.financial_records_receivable_guard_insert();

-- O guarda dos dois lados ligados (retirada e dinheiro trazido do Pessoal, 0042 e 0044) passa a cobrir também as colunas novas: as marcas
-- e o vínculo com o "a receber" não mudam num lado ligado fora das funções do par.
create or replace function public.financial_records_pair_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.paired_record_id is not null and coalesce(current_setting('clarevo.retirada', true), '') <> 'on'
     and (new.kind is distinct from old.kind or new.account_id is distinct from old.account_id
          or new.amount_cents is distinct from old.amount_cents or new.occurred_on is distinct from old.occurred_on
          or new.description is distinct from old.description or new.category is distinct from old.category
          or new.subcategory is distinct from old.subcategory or new.deleted_at is distinct from old.deleted_at
          or new.commitment_id is distinct from old.commitment_id or new.card_id is distinct from old.card_id
          or new.invoice_month is distinct from old.invoice_month or new.linked_payment is distinct from old.linked_payment
          or new.investment_id is distinct from old.investment_id or new.investment_movement_id is distinct from old.investment_movement_id
          or new.next_month is distinct from old.next_month
          or new.has_invoice is distinct from old.has_invoice or new.payer_kind is distinct from old.payer_kind
          or new.receivable_id is distinct from old.receivable_id
          or (new.paired_record_id is not null and new.paired_record_id is distinct from old.paired_record_id)) then
    raise exception 'retirada_ligada' using errcode = 'PT409';
  end if;
  if old.paired_record_id is null and new.paired_record_id is not null
     and coalesce(current_setting('clarevo.retirada', true), '') <> 'on' then
    raise exception 'campo_imutavel' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- Excluir a entrada ligada devolve o "a receber" para aberto.
create or replace function public.financial_records_receivable_reopen()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.receivable_id is not null and old.deleted_at is null and new.deleted_at is not null then
    update public.business_receivables
       set status = 'aberto', version = version + 1, updated_at = now()
     where id = old.receivable_id and status = 'recebido';
  end if;
  return null;
end;
$$;

create trigger financial_records_receivable_reopen
  after update of deleted_at on public.financial_records
  for each row execute function public.financial_records_receivable_reopen();

-- O "a receber" muda só pelas funções: identidade, espaço, autoria e criação nunca mudam.
create or replace function public.business_receivables_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.id <> old.id or new.context_id <> old.context_id or new.created_by <> old.created_by or new.created_at <> old.created_at then
    raise exception 'campo_imutavel' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger business_receivables_guard
  before update on public.business_receivables
  for each row execute function public.business_receivables_guard();

-- ---------------------------------------------------------------------------
-- 4. Auxiliares (sem execute para o app)
-- ---------------------------------------------------------------------------

-- As marcas de p_marks ({"has_invoice": true|false|null, "payer_kind": "pf"|"pj"|"exterior"|null}), conferidas: nada além dessas duas
-- chaves, com esses valores, e só em entrada de negócio (marcas_invalidas). Nulo = sem marcas.
create or replace function public.clarevo_record_marks(p_marks jsonb, p_kind public.record_kind, p_context uuid,
                                                       out o_has_invoice boolean, out o_payer_kind text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_marks is null or jsonb_typeof(p_marks) = 'null' then
    return;
  end if;
  if jsonb_typeof(p_marks) <> 'object'
     or exists (select 1 from jsonb_object_keys(p_marks) k where k not in ('has_invoice', 'payer_kind'))
     or coalesce(jsonb_typeof(p_marks -> 'has_invoice'), 'null') not in ('boolean', 'null')
     or not (coalesce(jsonb_typeof(p_marks -> 'payer_kind'), 'null') = 'null'
             or (jsonb_typeof(p_marks -> 'payer_kind') = 'string' and p_marks ->> 'payer_kind' in ('pf', 'pj', 'exterior'))) then
    raise exception 'marcas_invalidas' using errcode = '22023';
  end if;
  o_has_invoice := case when jsonb_typeof(p_marks -> 'has_invoice') = 'boolean' then (p_marks ->> 'has_invoice')::boolean end;
  o_payer_kind := case when jsonb_typeof(p_marks -> 'payer_kind') = 'string' then p_marks ->> 'payer_kind' end;
  if (o_has_invoice is not null or o_payer_kind is not null)
     and (p_kind is distinct from 'receita' or not public.clarevo_is_business(p_context)) then
    raise exception 'marcas_invalidas' using errcode = '22023';
  end if;
end;
$$;

-- Os campos do "a receber", conferidos (os mesmos limites da tabela, com os códigos do app).
create or replace function public.clarevo_check_receivable(p_kind text, p_description text, p_amount_cents bigint, p_expected_on date,
                                                           p_category text, p_debtor text)
returns void
language plpgsql
immutable
set search_path = public
as $$
begin
  if p_kind is null or p_kind not in ('fiado', 'cartao', 'outro') then
    raise exception 'tipo_invalido' using errcode = '22023';
  end if;
  if p_description is null or char_length(p_description) not between 1 and 80 then
    raise exception 'descricao_invalida' using errcode = '22023';
  end if;
  if p_amount_cents is null or p_amount_cents not between 1 and 999999999 then
    raise exception 'valor_invalido' using errcode = '22023';
  end if;
  if p_expected_on is null or p_expected_on not between date '2000-01-01' and date '2100-12-31' then
    raise exception 'data_invalida' using errcode = '22023';
  end if;
  if p_category is null or p_category not in ('Vendas', 'Serviços', 'Outras entradas') then
    raise exception 'categoria_invalida' using errcode = '22023';
  end if;
  if p_debtor is not null and char_length(p_debtor) not between 1 and 60 then
    raise exception 'nome_invalido' using errcode = '22023';
  end if;
end;
$$;

-- Trava e devolve o "a receber". nao_encontrado (não existe, excluído ou quem chama não lê); sem_permissao (sem escrita, ou, para
-- alterar e excluir, quem não anotou e não edita o que é de outras pessoas).
create or replace function public.clarevo_lock_receivable(p_receivable uuid, p_change boolean)
returns public.business_receivables
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v public.business_receivables%rowtype;
begin
  select * into v from public.business_receivables where id = p_receivable for update;
  if not found or v.deleted_at is not null or not public.context_permission(v.context_id, 'read') then
    raise exception 'nao_encontrado' using errcode = 'P0002';
  end if;
  if not public.context_permission(v.context_id, 'write')
     or (p_change and v.created_by <> auth.uid() and not public.context_permission(v.context_id, 'edit_others')) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  return v;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Anotar um "a receber". Ordem: sessão; chave; repetição; negócio lido (nao_encontrado); contexto_invalido; sem_permissao; os
-- campos (tipo_invalido, descricao_invalida, valor_invalido, data_invalida, categoria_invalida, nome_invalido); assinatura_necessaria.
-- Retorno: a linha.
-- ---------------------------------------------------------------------------
create or replace function public.create_receivable(p_key text, p_context uuid, p_kind text, p_description text, p_amount_cents bigint,
                                                    p_expected_on date, p_category text, p_debtor text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_desc text := public.clarevo_trim(p_description);
  v_debtor text := nullif(public.clarevo_trim(p_debtor), '');
  v_hash text;
  v_op public.record_operations%rowtype;
  v public.business_receivables%rowtype;
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  perform public.clarevo_check_key(p_key);
  v_hash := md5(jsonb_build_array('criar_a_receber', p_context, p_kind, v_desc, p_amount_cents, p_expected_on, p_category, v_debtor)::text);
  perform pg_advisory_xact_lock(hashtext('op:' || v_uid::text || ':' || p_key));

  select * into v_op from public.record_operations where actor_id = v_uid and idempotency_key = p_key;
  if found then
    if v_op.action <> 'criar_a_receber' or v_op.request_hash <> v_hash then
      raise exception 'chave_reutilizada' using errcode = 'PT409';
    end if;
    if not public.context_permission(v_op.context_id, 'read') then
      raise exception 'nao_encontrado' using errcode = 'P0002';
    end if;
    return (select to_jsonb(r) from public.business_receivables r where r.id = v_op.target_id);
  end if;

  -- A trava do negócio (a de end_business): um negócio encerrado ao mesmo tempo não recebe um "a receber".
  perform pg_advisory_xact_lock(hashtext('familia:c:' || coalesce(p_context::text, '')));
  if p_context is null or not public.context_permission(p_context, 'read') then
    raise exception 'nao_encontrado' using errcode = 'P0002';
  end if;
  if not public.clarevo_is_business(p_context) then
    raise exception 'contexto_invalido' using errcode = '22023';
  end if;
  if not public.context_permission(p_context, 'write') then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  perform public.clarevo_check_receivable(p_kind, v_desc, p_amount_cents, p_expected_on, p_category, v_debtor);

  insert into public.business_receivables (context_id, kind, description, amount_cents, expected_on, category, debtor, created_by)
  values (p_context, p_kind, v_desc, p_amount_cents, p_expected_on, p_category, v_debtor, v_uid)
  returning * into v;

  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id, target_id)
  values (v_uid, p_key, 'criar_a_receber', p_context, v_hash, null, null, v.id);

  return to_jsonb(v);
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Alterar um "a receber" em aberto. Ordem: sessão; chave; repetição; o "a receber" (nao_encontrado, sem_permissao); versão
-- (versao_desatualizada); ja_recebido; os campos. Retorno: a linha.
-- ---------------------------------------------------------------------------
create or replace function public.update_receivable(p_key text, p_receivable uuid, p_expected_version integer, p_kind text,
                                                    p_description text, p_amount_cents bigint, p_expected_on date, p_category text,
                                                    p_debtor text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_desc text := public.clarevo_trim(p_description);
  v_debtor text := nullif(public.clarevo_trim(p_debtor), '');
  v_hash text;
  v_op public.record_operations%rowtype;
  v public.business_receivables%rowtype;
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  perform public.clarevo_check_key(p_key);
  v_hash := md5(jsonb_build_array('alterar_a_receber', p_receivable, p_expected_version, p_kind, v_desc, p_amount_cents, p_expected_on,
                                  p_category, v_debtor)::text);
  perform pg_advisory_xact_lock(hashtext('op:' || v_uid::text || ':' || p_key));

  select * into v_op from public.record_operations where actor_id = v_uid and idempotency_key = p_key;
  if found then
    if v_op.action <> 'alterar_a_receber' or v_op.request_hash <> v_hash then
      raise exception 'chave_reutilizada' using errcode = 'PT409';
    end if;
    if not public.context_permission(v_op.context_id, 'read') then
      raise exception 'nao_encontrado' using errcode = 'P0002';
    end if;
    return (select to_jsonb(r) from public.business_receivables r where r.id = v_op.target_id);
  end if;

  -- A trava do negócio (a de end_business, como em create_receivable e receive_receivable); o espaço de um "a receber" nunca muda.
  perform pg_advisory_xact_lock(hashtext('familia:c:' || coalesce((select context_id from public.business_receivables where id = p_receivable)::text, '')));
  v := public.clarevo_lock_receivable(p_receivable, true);
  if p_expected_version is distinct from v.version then
    raise exception 'versao_desatualizada' using errcode = 'PT409', detail = 'versao_atual=' || v.version;
  end if;
  if v.status <> 'aberto' then
    raise exception 'ja_recebido' using errcode = 'PT409';
  end if;
  perform public.clarevo_check_receivable(p_kind, v_desc, p_amount_cents, p_expected_on, p_category, v_debtor);

  update public.business_receivables
     set kind = p_kind, description = v_desc, amount_cents = p_amount_cents, expected_on = p_expected_on, category = p_category,
         debtor = v_debtor, version = version + 1, updated_at = now()
   where id = v.id
  returning * into v;

  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id, target_id)
  values (v_uid, p_key, 'alterar_a_receber', v.context_id, v_hash, null, null, v.id);

  return to_jsonb(v);
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Excluir um "a receber" em aberto (exclusão lógica). Ordem: sessão; chave; repetição; o "a receber" (nao_encontrado,
-- sem_permissao); versão; ja_recebido. Retorno: a linha.
-- ---------------------------------------------------------------------------
create or replace function public.delete_receivable(p_key text, p_receivable uuid, p_expected_version integer)
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
  v public.business_receivables%rowtype;
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  perform public.clarevo_check_key(p_key);
  v_hash := md5(jsonb_build_array('excluir_a_receber', p_receivable, p_expected_version)::text);
  perform pg_advisory_xact_lock(hashtext('op:' || v_uid::text || ':' || p_key));

  select * into v_op from public.record_operations where actor_id = v_uid and idempotency_key = p_key;
  if found then
    if v_op.action <> 'excluir_a_receber' or v_op.request_hash <> v_hash then
      raise exception 'chave_reutilizada' using errcode = 'PT409';
    end if;
    if not public.context_permission(v_op.context_id, 'read') then
      raise exception 'nao_encontrado' using errcode = 'P0002';
    end if;
    return (select to_jsonb(r) from public.business_receivables r where r.id = v_op.target_id);
  end if;

  perform pg_advisory_xact_lock(hashtext('familia:c:' || coalesce((select context_id from public.business_receivables where id = p_receivable)::text, '')));
  v := public.clarevo_lock_receivable(p_receivable, true);
  if p_expected_version is distinct from v.version then
    raise exception 'versao_desatualizada' using errcode = 'PT409', detail = 'versao_atual=' || v.version;
  end if;
  if v.status <> 'aberto' then
    raise exception 'ja_recebido' using errcode = 'PT409';
  end if;

  update public.business_receivables
     set deleted_at = now(), deleted_by = v_uid, version = version + 1, updated_at = now()
   where id = v.id
  returning * into v;

  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id, target_id)
  values (v_uid, p_key, 'excluir_a_receber', v.context_id, v_hash, null, null, v.id);

  return to_jsonb(v);
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. Receber: grava a entrada comum no negócio (a categoria e a descrição do "a receber", o valor e a data que a pessoa confirma, na
-- conta do negócio escolhida) ligada ao "a receber", que passa a recebido. Qualquer pessoa com escrita no negócio recebe. Ordem:
-- sessão; chave; repetição; o "a receber" (nao_encontrado, sem_permissao); versão; ja_recebido; as regras de create_record (conta,
-- valor, data). Retorno: {receivable, record}.
-- ---------------------------------------------------------------------------
create or replace function public.receive_receivable(p_key text, p_receivable uuid, p_expected_version integer, p_account uuid,
                                                     p_amount_cents bigint, p_received_on date)
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
  v public.business_receivables%rowtype;
  v_acc public.financial_accounts%rowtype;
  v_r public.financial_records%rowtype;
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  perform public.clarevo_check_key(p_key);
  v_hash := md5(jsonb_build_array('receber_a_receber', p_receivable, p_expected_version, p_account, p_amount_cents, p_received_on)::text);
  perform pg_advisory_xact_lock(hashtext('op:' || v_uid::text || ':' || p_key));

  select * into v_op from public.record_operations where actor_id = v_uid and idempotency_key = p_key;
  if found then
    if v_op.action <> 'receber_a_receber' or v_op.request_hash <> v_hash then
      raise exception 'chave_reutilizada' using errcode = 'PT409';
    end if;
    if not public.context_permission(v_op.context_id, 'read') then
      raise exception 'nao_encontrado' using errcode = 'P0002';
    end if;
    return jsonb_build_object('receivable', (select to_jsonb(r) from public.business_receivables r where r.id = v_op.target_id),
                              'record', (select to_jsonb(r) from public.financial_records r where r.id = v_op.record_id));
  end if;

  -- O espaço de um "a receber" nunca muda: ler antes da trava do negócio é seguro.
  select context_id into v_ctx from public.business_receivables where id = p_receivable;
  perform pg_advisory_xact_lock(hashtext('familia:c:' || coalesce(v_ctx::text, '')));
  v := public.clarevo_lock_receivable(p_receivable, false);
  if p_expected_version is distinct from v.version then
    raise exception 'versao_desatualizada' using errcode = 'PT409', detail = 'versao_atual=' || v.version;
  end if;
  if v.status <> 'aberto' then
    raise exception 'ja_recebido' using errcode = 'PT409';
  end if;
  v_acc := public.clarevo_validate_record(v_uid, v.context_id, p_account, p_amount_cents, p_received_on, v.description, v.category);

  perform set_config('clarevo.a_receber', 'on', true);
  insert into public.financial_records (context_id, account_id, kind, amount_cents, currency, occurred_on, description, category, created_by,
                                        receivable_id)
  values (v.context_id, p_account, 'receita', p_amount_cents, v_acc.currency, p_received_on, v.description, v.category, v_uid, v.id)
  returning * into v_r;
  perform set_config('clarevo.a_receber', '', true);

  update public.business_receivables set status = 'recebido', version = version + 1, updated_at = now() where id = v.id
  returning * into v;

  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id, target_id)
  values (v_uid, p_key, 'receber_a_receber', v.context_id, v_hash, v_r.id, null, v.id);

  return jsonb_build_object('receivable', to_jsonb(v), 'record', to_jsonb(v_r));
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. Lançamentos com as marcas: create_record e update_record (os corpos da 0040) com p_marks no fim; a entrada de um "a receber" não
-- vira gasto (recebimento_ligado). As assinaturas antigas saem; a chamada do app anterior (sem p_marks) cai nas novas.
-- ---------------------------------------------------------------------------
drop function public.create_record(text, uuid, uuid, public.record_kind, bigint, date, text, text, text, boolean, text, uuid);
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
  p_investment_id uuid default null,
  p_marks jsonb default null
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
  v_has_invoice boolean;
  v_payer text;
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  -- Sem subcategoria e sem investimento, o mesmo conteúdo de antes (concat_ws pula os nulos).
  v_hash := md5(concat_ws('|', 'criar', p_context_id, p_account_id, p_kind, p_amount_cents, p_occurred_on, v_description, coalesce(v_category, ''), v_receipt,
                          case when coalesce(p_next_month, false) then 'mes_seguinte' end,
                          case when v_sub is not null then 'sub=' || v_sub end,
                          case when p_investment_id is not null then 'inv=' || p_investment_id end,
                          case when p_marks is not null then 'marcas=' || p_marks::text end));
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
  select m.o_has_invoice, m.o_payer_kind into v_has_invoice, v_payer from public.clarevo_record_marks(p_marks, p_kind, p_context_id) m;
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
     investment_id, investment_movement_id, has_invoice, payer_kind)
  values
    (p_context_id, p_account_id, p_kind, p_amount_cents, v_account.currency, p_occurred_on, v_description, v_category, v_uid, v_receipt,
     coalesce(p_next_month, false), v_sub, v_i.id, v_m.id, v_has_invoice, v_payer)
  returning * into v_record;

  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id)
  values (v_uid, p_idempotency_key, 'criar', p_context_id, v_hash, v_record.id);

  return v_record;
end;
$$;

drop function public.update_record(text, uuid, integer, uuid, bigint, date, text, text, boolean, public.record_kind, text, uuid, boolean);
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
  p_link_investment boolean default null,
  p_marks jsonb default null
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
  v_has_invoice boolean;
  v_payer text;
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  -- Os parâmetros novos nulos (o app antigo) = o mesmo conteúdo de antes. A subcategoria vazia ('', tirar) entra como está.
  v_hash := md5(concat_ws('|', 'editar', p_record_id, p_expected_version, p_account_id, p_amount_cents, p_occurred_on, v_description, coalesce(v_category, ''),
                          case when p_next_month is not null then 'mes_seguinte=' || p_next_month::text end,
                          case when p_kind is not null then 'tipo=' || p_kind::text end,
                          case when p_subcategory is not null then 'sub=' || public.clarevo_trim(p_subcategory) end,
                          case when p_link_investment is not null then 'inv=' || p_link_investment::text || ':' || coalesce(p_investment_id::text, '') end,
                          case when p_marks is not null then 'marcas=' || p_marks::text end));
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
  -- A entrada de um "a receber" (D-122) continua entrada.
  if v_kind <> 'receita' and v_record.receivable_id is not null then
    raise exception 'recebimento_ligado' using errcode = 'PT409';
  end if;
  -- Marcas (D-122): nulas mantêm as de antes (o app anterior), menos num gasto, que não tem marca.
  if p_marks is null then
    v_has_invoice := case when v_kind = 'receita' then v_record.has_invoice end;
    v_payer := case when v_kind = 'receita' then v_record.payer_kind end;
  else
    select m.o_has_invoice, m.o_payer_kind into v_has_invoice, v_payer from public.clarevo_record_marks(p_marks, v_kind, v_record.context_id) m;
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
         has_invoice = v_has_invoice,
         payer_kind = v_payer,
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
-- 10. Mover (o corpo da 0042): a entrada de um "a receber" também não muda de espaço (lancamento_ligado).
-- ---------------------------------------------------------------------------
create or replace function public.move_record(
  p_key text,
  p_record uuid,
  p_expected_version integer,
  p_target_context uuid,
  p_account uuid,
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
  v_category text := nullif(public.clarevo_trim(p_category), '');
  v_hash text;
  v_op public.record_operations%rowtype;
  v_r public.financial_records%rowtype;
  v_new public.financial_records%rowtype;
  v_personal uuid;
  v_source uuid;
  v_acc public.financial_accounts%rowtype;
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  perform public.clarevo_check_key(p_key);
  v_hash := md5(jsonb_build_array('mover_lancamento', p_record, p_expected_version, p_target_context, p_account, coalesce(v_category, ''))::text);
  perform pg_advisory_xact_lock(hashtext('op:' || v_uid::text || ':' || p_key));

  select * into v_op from public.record_operations where actor_id = v_uid and idempotency_key = p_key;
  if found then
    if v_op.action <> 'mover_lancamento' or v_op.request_hash <> v_hash then
      raise exception 'chave_reutilizada' using errcode = 'PT409';
    end if;
    if not public.context_permission(v_op.context_id, 'read') then
      raise exception 'nao_encontrado' using errcode = 'P0002';
    end if;
    select * into v_new from public.financial_records where id = v_op.record_id;
    return v_new;
  end if;

  -- A trava de end_business no negócio envolvido (o destino ou, voltando para o Pessoal, a origem), antes de travar o lançamento e de
  -- conferir: um negócio encerrado ao mesmo tempo não recebe nem perde um lançamento depois de encerrado. O espaço de um lançamento não
  -- muda (mover grava um lançamento novo), então ler a origem sem trava basta para escolher a trava.
  select r.context_id into v_source from public.financial_records r where r.id = p_record;
  if public.clarevo_is_business(p_target_context) then
    perform pg_advisory_xact_lock(hashtext('familia:c:' || p_target_context::text));
  elsif v_source is not null and public.clarevo_is_business(v_source) then
    perform pg_advisory_xact_lock(hashtext('familia:c:' || v_source::text));
  end if;

  v_r := public.clarevo_lock_record(p_record);
  if v_r.version <> p_expected_version then
    raise exception 'versao_desatualizada' using errcode = 'PT409', detail = 'versao_atual=' || v_r.version;
  end if;
  if v_r.commitment_id is not null or v_r.card_id is not null or v_r.investment_id is not null or v_r.investment_movement_id is not null
     or v_r.paired_record_id is not null or v_r.receivable_id is not null then
    raise exception 'lancamento_ligado' using errcode = 'PT409';
  end if;
  v_personal := public.clarevo_personal_context(v_uid);
  if p_target_context is null or p_target_context = v_r.context_id or v_personal is null
     or not ((v_r.context_id = v_personal and public.clarevo_is_business(p_target_context))
             or (p_target_context = v_personal and public.clarevo_is_business(v_r.context_id))) then
    raise exception 'contexto_invalido' using errcode = '22023';
  end if;
  if not public.context_permission(p_target_context, 'write') then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  v_acc := public.clarevo_validate_record(v_uid, p_target_context, p_account, v_r.amount_cents, v_r.occurred_on, v_r.description, v_category);

  update public.financial_records set deleted_at = now(), deleted_by = v_uid, version = version + 1 where id = v_r.id;
  insert into public.financial_records
    (context_id, account_id, kind, amount_cents, currency, occurred_on, description, category, created_by, next_month, receipt_key, import_key)
  values (p_target_context, p_account, v_r.kind, v_r.amount_cents, v_acc.currency, v_r.occurred_on, v_r.description, v_category, v_uid,
          v_r.next_month, v_r.receipt_key, v_r.import_key)
  returning * into v_new;

  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id, target_id)
  values (v_uid, p_key, 'mover_lancamento', p_target_context, v_hash, v_new.id, null, v_r.id);

  return v_new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 11. Limpeza dos 6 meses (o corpo da 0042): o "a receber" excluído há mais de 6 meses sai ('a_receber' na resposta).
-- ---------------------------------------------------------------------------
create or replace function public.clarevo_purge_deleted(p_before timestamptz default now() - interval '6 months')
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_ctx uuid;
  n_records int := 0;
  n_entries int := 0;
  n_movements int := 0;
  n_goals int := 0;
  n_commitments int := 0;
  n_series int := 0;
  n_cards int := 0;
  n_accounts int := 0;
  n_budgets int := 0;
  n_limits int := 0;
  n_incomes int := 0;
  n_receivables int := 0;
  n_families int := 0;
  n_businesses int := 0;
  n_operations int := 0;
  n_persons int := 0;
  v_person uuid;
  n int;
begin
  if p_before is null or p_before > now() - interval '6 months' then
    raise exception 'prazo_invalido' using errcode = '22023';
  end if;

  -- E2: Famílias encerradas há mais de 6 meses, inteiras.
  for v_ctx in select c.id from public.financial_contexts c where c.kind = 'familia' and c.ended_at is not null and c.ended_at < p_before loop
    perform public.clarevo_erase_context(v_ctx);
    n_families := n_families + 1;
  end loop;
  -- D-113: negócios encerrados há mais de 6 meses, inteiros.
  for v_ctx in select c.id from public.financial_contexts c where c.kind = 'negocio' and c.ended_at is not null and c.ended_at < p_before loop
    perform public.clarevo_erase_context(v_ctx);
    n_businesses := n_businesses + 1;
  end loop;

  -- E1, na ordem das chaves: primeiro o que depende, depois o que é usado.
  delete from public.card_entries e where e.deleted_at < p_before;
  get diagnostics n_entries = row_count;

  delete from public.financial_records r
   where r.deleted_at < p_before
     and not exists (select 1 from public.card_entries e where e.payment_record_id = r.id);
  get diagnostics n_records = row_count;

  -- D-122: o "a receber" excluído (só se exclui em aberto, sem entrada viva), depois dos lançamentos que ainda apontem para ele.
  delete from public.business_receivables b where b.deleted_at < p_before;
  get diagnostics n_receivables = row_count;

  delete from public.goal_movements m where m.deleted_at < p_before;
  get diagnostics n_movements = row_count;

  delete from public.goals g
   where g.deleted_at < p_before
     and not exists (select 1 from public.goal_movements m where m.goal_id = g.id and m.context_id = g.context_id);
  get diagnostics n_goals = row_count;

  delete from public.commitments c
   where c.deleted_at < p_before and not c.series_skipped
     and not exists (select 1 from public.financial_records r where r.commitment_id = c.id and r.context_id = c.context_id);
  get diagnostics n_commitments = row_count;

  -- E3: as marcas de "só neste mês" saem só com o gasto fixo excluído há mais de 6 meses, e só quando nada mais segura a série.
  with alvo as (
    select s.id, s.context_id from public.commitment_series s
     where s.deleted_at < p_before
       and not exists (select 1 from public.commitments c
                        where c.series_id = s.id and c.context_id = s.context_id
                          and not (c.series_skipped and c.deleted_at < p_before
                                   and not exists (select 1 from public.financial_records r where r.commitment_id = c.id and r.context_id = c.context_id)))
  )
  delete from public.commitments c using alvo where c.series_id = alvo.id and c.context_id = alvo.context_id;
  get diagnostics n = row_count;
  n_commitments := n_commitments + n;

  delete from public.commitment_series s
   where s.deleted_at < p_before
     and not exists (select 1 from public.commitments c where c.series_id = s.id and c.context_id = s.context_id);
  get diagnostics n_series = row_count;

  delete from public.cards k
   where k.deleted_at < p_before
     and not exists (select 1 from public.commitments c where c.card_id = k.id and c.context_id = k.context_id)
     and not exists (select 1 from public.financial_records r where r.card_id = k.id and r.context_id = k.context_id)
     and not exists (select 1 from public.card_entries e where e.card_id = k.id and e.context_id = k.context_id);
  get diagnostics n_cards = row_count;

  delete from public.financial_accounts a
   where a.deleted_at < p_before
     and not exists (select 1 from public.financial_records r where r.account_id = a.id and r.context_id = a.context_id)
     and not exists (select 1 from public.goal_movements m where m.account_id = a.id and m.context_id = a.context_id);
  get diagnostics n_accounts = row_count;

  delete from public.category_budgets b where b.deleted_at < p_before;
  get diagnostics n_budgets = row_count;
  delete from public.commitment_limits l where l.deleted_at < p_before;
  get diagnostics n_limits = row_count;
  delete from public.income_references i where i.deleted_at < p_before;
  get diagnostics n_incomes = row_count;

  -- E5: o resumo do pedido das operações antigas.
  update public.record_operations o set request_hash = 'apagado' where o.created_at < p_before and o.request_hash <> 'apagado';
  get diagnostics n_operations = row_count;

  -- E3: a pessoa anônima que não é mais autora de nada sai (a recusa da chave estrangeira mantém quem ainda é).
  for v_person in select p.id from public.persons p where p.deleted_at is not null loop
    begin
      delete from public.persons where id = v_person and deleted_at is not null;
      if found then n_persons := n_persons + 1; end if;
    exception when foreign_key_violation then
      null;
    end;
  end loop;

  return jsonb_build_object(
    'antes_de', p_before, 'familias', n_families, 'negocios', n_businesses, 'registros', n_records, 'lancamentos_cartao', n_entries,
    'movimentos_meta', n_movements, 'metas', n_goals, 'contas_a_pagar', n_commitments, 'series', n_series, 'cartoes', n_cards,
    'contas_de_origem', n_accounts, 'orcamentos', n_budgets, 'limites', n_limits, 'rendas_de_referencia', n_incomes,
    'operacoes_resumidas', n_operations, 'pessoas_anonimas', n_persons, 'a_receber', n_receivables);
end;
$$;

-- ---------------------------------------------------------------------------
-- 12. Operações: a lista vigente (0044) mais as quatro do "a receber". Criar, alterar e excluir apontam para o "a receber"; receber guarda
-- a entrada em record_id e o "a receber" em target_id.
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
  'definir_limite_comprometimento', 'excluir_limite_comprometimento',
  'criar_conta', 'alterar_conta', 'conta_principal', 'situacao_conta', 'excluir_conta',
  'marcar_assinatura', 'revisar_assinaturas',
  'importar_extrato',
  'criar_familia', 'criar_convite_familia', 'cancelar_convite_familia', 'aceitar_convite_familia', 'sair_familia',
  'remover_membro_familia', 'alterar_papel_familia', 'transferir_titularidade_familia', 'encerrar_familia',
  'convidar_licencas', 'renovar_convite_licenca', 'cancelar_convite_licenca', 'encerrar_licenca', 'aceitar_licenca',
  'marcar_mes_conferido', 'desmarcar_mes_conferido',
  'responder_origem_cadastro',
  'gerar_codigo_whatsapp', 'ligar_whatsapp', 'desligar_whatsapp',
  'imagem_meta',
  'gerar_codigo_telegram', 'ligar_telegram', 'desligar_telegram',
  'aceitar_termos',
  'ordenar_metas',
  'criar_investimento', 'alterar_investimento', 'situacao_investimento', 'excluir_investimento',
  'registrar_movimento_investimento', 'alterar_movimento_investimento', 'excluir_movimento_investimento',
  'definir_plano_investimentos', 'excluir_plano_investimentos',
  'origem_valor_meta',
  'criar_negocio', 'renomear_negocio', 'encerrar_negocio', 'criar_retirada_negocio', 'excluir_retirada_negocio', 'mover_lancamento',
  'criar_convite_negocio', 'cancelar_convite_negocio', 'aceitar_convite_negocio', 'sair_negocio', 'remover_membro_negocio',
  'alterar_papel_negocio', 'criar_aporte_negocio', 'definir_perfil_negocio',
  'criar_a_receber', 'alterar_a_receber', 'excluir_a_receber', 'receber_a_receber'));
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
                 'marcar_assinatura', 'importar_extrato',
                 'criar_familia', 'criar_convite_familia', 'cancelar_convite_familia', 'aceitar_convite_familia', 'sair_familia',
                 'remover_membro_familia', 'alterar_papel_familia', 'transferir_titularidade_familia', 'encerrar_familia',
                 'convidar_licencas', 'renovar_convite_licenca', 'cancelar_convite_licenca', 'encerrar_licenca', 'aceitar_licenca',
                 'imagem_meta', 'ordenar_metas', 'origem_valor_meta',
                 'criar_investimento', 'alterar_investimento', 'situacao_investimento', 'excluir_investimento',
                 'registrar_movimento_investimento', 'alterar_movimento_investimento', 'excluir_movimento_investimento',
                 'criar_negocio', 'renomear_negocio', 'encerrar_negocio',
                 'criar_convite_negocio', 'cancelar_convite_negocio', 'aceitar_convite_negocio', 'sair_negocio',
                 'remover_membro_negocio', 'alterar_papel_negocio', 'definir_perfil_negocio',
                 'criar_a_receber', 'alterar_a_receber', 'excluir_a_receber')
      and target_id is not null and record_id is null and commitment_id is null)
  or (action in ('pagar_fatura', 'desfazer_pagamento_fatura')
      and target_id is not null and record_id is not null and commitment_id is not null)
  or (action in ('criar_retirada_negocio', 'excluir_retirada_negocio', 'mover_lancamento', 'criar_aporte_negocio', 'receber_a_receber')
      and target_id is not null and record_id is not null and commitment_id is null)
  or (action = 'criar_ocorrencia' and commitment_id is not null and target_id is not null and record_id is null)
  or (action in ('decidir_revisao', 'responder_guardar', 'revisar_assinaturas', 'marcar_mes_conferido', 'desmarcar_mes_conferido',
                 'responder_origem_cadastro', 'gerar_codigo_whatsapp', 'ligar_whatsapp', 'desligar_whatsapp',
                 'gerar_codigo_telegram', 'ligar_telegram', 'desligar_telegram', 'aceitar_termos',
                 'definir_plano_investimentos', 'excluir_plano_investimentos')
      and record_id is null and commitment_id is null and target_id is null));

-- ---------------------------------------------------------------------------
-- 13. Privilégios: as quatro funções novas e as duas recriadas só para authenticated; auxiliares e gatilhos para ninguém com sessão; a
-- tabela só para leitura (pela política).
-- ---------------------------------------------------------------------------
revoke all on public.business_receivables from anon, authenticated, service_role;
grant select on public.business_receivables to authenticated;

revoke all on function public.financial_records_receivable_guard() from public, anon, authenticated, service_role;
revoke all on function public.financial_records_receivable_guard_insert() from public, anon, authenticated, service_role;
revoke all on function public.financial_records_receivable_reopen() from public, anon, authenticated, service_role;
revoke all on function public.business_receivables_guard() from public, anon, authenticated, service_role;
revoke all on function public.financial_records_pair_guard() from public, anon, authenticated, service_role;
revoke all on function public.clarevo_record_marks(jsonb, public.record_kind, uuid) from public, anon, authenticated, service_role;
revoke all on function public.clarevo_check_receivable(text, text, bigint, date, text, text) from public, anon, authenticated, service_role;
revoke all on function public.clarevo_lock_receivable(uuid, boolean) from public, anon, authenticated, service_role;
revoke all on function public.clarevo_purge_deleted(timestamptz) from public, anon, authenticated, service_role;

revoke all on function public.create_receivable(text, uuid, text, text, bigint, date, text, text) from public, anon;
revoke all on function public.update_receivable(text, uuid, integer, text, text, bigint, date, text, text) from public, anon;
revoke all on function public.delete_receivable(text, uuid, integer) from public, anon;
revoke all on function public.receive_receivable(text, uuid, integer, uuid, bigint, date) from public, anon;
revoke all on function public.create_record(text, uuid, uuid, public.record_kind, bigint, date, text, text, text, boolean, text, uuid, jsonb) from public, anon;
revoke all on function public.update_record(text, uuid, integer, uuid, bigint, date, text, text, boolean, public.record_kind, text, uuid, boolean, jsonb) from public, anon;
revoke all on function public.move_record(text, uuid, integer, uuid, uuid, text) from public, anon;
grant execute on function public.create_receivable(text, uuid, text, text, bigint, date, text, text) to authenticated;
grant execute on function public.update_receivable(text, uuid, integer, text, text, bigint, date, text, text) to authenticated;
grant execute on function public.delete_receivable(text, uuid, integer) to authenticated;
grant execute on function public.receive_receivable(text, uuid, integer, uuid, bigint, date) to authenticated;
grant execute on function public.create_record(text, uuid, uuid, public.record_kind, bigint, date, text, text, text, boolean, text, uuid, jsonb) to authenticated;
grant execute on function public.update_record(text, uuid, integer, uuid, bigint, date, text, text, boolean, public.record_kind, text, uuid, boolean, jsonb) to authenticated;
grant execute on function public.move_record(text, uuid, integer, uuid, uuid, text) to authenticated;
