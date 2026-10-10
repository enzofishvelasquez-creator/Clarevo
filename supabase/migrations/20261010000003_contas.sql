-- Clarevo · migração 0010 · contas cadastradas como origem do dinheiro (D-043, Ciclo G1).
-- Depois de 20261010000002_orcamento.sql.
-- Contas só por create_account, update_account, set_default_account, set_account_status e delete_account: autoria da sessão,
-- chave de idempotência por pessoa (o mesmo espaço das outras operações), hash em JSON (D-021, regra 7), versão e exclusão
-- lógica, no padrão das funções de cartão (0008) e de orçamento (0009).
--
-- A conta de origem já existia: financial_accounts guarda a "Conta principal" criada por ensure_personal_space e
-- financial_records.account_id, pay_commitment e pay_invoice já recebem a conta de saída. Esta migração só deixa a pessoa
-- cadastrar de onde sai o dinheiro (conta do banco, carteira...) e escolher uma em cada gasto, pagamento de conta, pagamento de
-- fatura e aporte ou resgate de meta. Não existe saldo por conta (fica para P-018: transferências e saldo inicial): a conta é só a origem
-- informada, e nada aqui entra em Recebido, Pago, Diferença, Ainda a pagar nem na renda comprometida.
--
-- Conta: nome de 1 a 40 caracteres (único no contexto, sem diferenciar maiúsculas de minúsculas, entre as não excluídas), tipo
-- ('banco', 'dinheiro' ou 'outra'; padrão 'banco'), situação ('ativa' ou 'arquivada'), no máximo 10 ativas por contexto e uma
-- "principal" (a que vem marcada nos seletores) entre as ativas. Arquivar tira a conta dos seletores (os lançamentos e o
-- histórico continuam); excluir só vale sem lançamentos vivos (registros e movimentos de meta), senão "arquive".
--
-- Invariantes:
-- A1. No máximo uma conta principal por contexto (índice único parcial); a principal é sempre ativa e não excluída (restrição).
-- A2. Todo contexto com contas não excluídas tem uma ativa: arquivar ou excluir a única ativa, ou a principal sem escolher
--     outra no mesmo ato, é recusado (ultima_conta_ativa, conta_principal). A conta nova de um contexto sem principal já nasce
--     principal (gatilho), o que cobre ensure_personal_space sem mudá-la.
-- A3. No máximo 10 contas ativas por contexto (limite_de_contas), conferido sob trava consultiva na criação e na reativação.
-- A4. Nome único por contexto entre as não excluídas (índice único e conferência nome_da_conta_repetido).
-- A5. Identidade, contexto, moeda, autoria, criação e saldo inicial nunca mudam; conta excluída não muda mais; a versão sobe
--     +1 a cada escrita (o gatilho soma, inclusive na renomeação direta que o app publicado ainda faz com o privilégio
--     update (name), mantido até a publicação desta migração e do app novo).
-- A6. Conta excluída fica arquivada (nenhuma função de escrita de registro aceita conta que não é ativa) e some da leitura.
-- A7. Aporte ou resgate de meta pode levar a conta (goal_movements.account_id, opcional, do mesmo contexto: FK composta); os
--     outros tipos de movimento nunca levam conta. É só informativo: não cria gasto nem movimenta saldo (D-027(3), P-018).
-- A8. Quem confere a conta de um lançamento (gasto, pagamento, fatura, aporte ou resgate) trava a linha dela com for share até o
--     fim da transação; excluir, arquivar ou mudar a principal travam a linha com for update. Assim, uma exclusão ou um
--     arquivamento que corre ao mesmo tempo espera, reconfere a situação da conta e dá conta_invalida (ou conta_com_lancamentos
--     para quem exclui), e nunca sobra lançamento vivo numa conta excluída.
-- A9. Sem conta informada, pay_invoice e pay_commitment usam a principal do contexto (não a mais antiga).
-- A10. A conta de outra pessoa exige "editar de outras pessoas" para alterar, arquivar, excluir e também para ganhar ou perder a
--     marca de principal (a pessoa que torna principal uma conta mexe também na que perde a marca); a renomeação direta do app
--     publicado (update (name)) segue a mesma regra, na política accounts_rename.
-- Ordem de travas: chave -> trava consultiva do contexto (contas:<contexto>) -> linha da conta. A atividade (gatilho de
-- record_operations, 0005) conta as cinco ações como anotação, como as demais escritas.

-- ---------------------------------------------------------------------------
-- Contas: tipo, principal, versão, exclusão lógica
-- ---------------------------------------------------------------------------
alter table public.financial_accounts
  add column kind text not null default 'banco',
  add column is_default boolean not null default false,
  add column version integer not null default 1,
  add column updated_at timestamptz not null default now(),
  add column deleted_at timestamptz,
  add column deleted_by uuid references public.persons (id);

alter table public.financial_accounts
  add constraint financial_accounts_tipo check (kind in ('banco', 'dinheiro', 'outra')),
  add constraint financial_accounts_versao check (version >= 1),
  add constraint financial_accounts_exclusao check ((deleted_at is null) = (deleted_by is null)),
  -- A1: a principal é ativa e não excluída.
  add constraint financial_accounts_principal check (not is_default or (status = 'ativa' and deleted_at is null)),
  -- Chave de referência de goal_movements (A7): conta e movimento no mesmo contexto.
  add constraint financial_accounts_id_context_key unique (id, context_id);

-- Contas que já existem: a mais antiga de cada contexto passa a ser a principal (a "Conta principal" do cadastro).
update public.financial_accounts a
   set is_default = true
 where a.status = 'ativa'
   and a.id = (select x.id from public.financial_accounts x
                where x.context_id = a.context_id and x.status = 'ativa'
                order by x.created_at, x.id
                limit 1);

create unique index financial_accounts_one_default on public.financial_accounts (context_id) where is_default;
create unique index financial_accounts_name_live on public.financial_accounts (context_id, lower(name)) where deleted_at is null;
comment on column public.financial_accounts.kind is
  'Tipo da conta de origem: banco, dinheiro ou outra. Só informativo; não existe saldo por conta (P-018).';
comment on column public.financial_accounts.is_default is
  'Conta principal do contexto: a que vem marcada nos seletores "Saiu de" e "Entrou em". Uma por contexto.';

-- A conta nova de um contexto sem principal já nasce principal (ensure_personal_space, contas criadas pelo backend).
create or replace function public.financial_accounts_default()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'ativa' and new.deleted_at is null and not exists (
       select 1 from public.financial_accounts a where a.context_id = new.context_id and a.is_default) then
    new.is_default := true;
  end if;
  return new;
end;
$$;

create trigger financial_accounts_default
  before insert on public.financial_accounts
  for each row execute function public.financial_accounts_default();

-- A5: defesa adicional. Podem mudar: nome, tipo, situação, principal e exclusão. A versão e a data de alteração são do gatilho.
create or replace function public.financial_accounts_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.id <> old.id or new.context_id <> old.context_id or new.currency <> old.currency
     or new.created_by <> old.created_by or new.created_at <> old.created_at
     or new.initial_balance_cents is distinct from old.initial_balance_cents
     or old.deleted_at is not null then
    raise exception 'campo_imutavel' using errcode = '42501';
  end if;
  new.version := old.version + 1;
  new.updated_at := now();
  return new;
end;
$$;

create trigger financial_accounts_guard
  before update on public.financial_accounts
  for each row execute function public.financial_accounts_guard();

-- Leitura: só as não excluídas. A renomeação direta (update (name), do app publicado) também só alcança as não excluídas e, como
-- as funções de contas, a conta de outra pessoa exige "editar de outras pessoas" (a autoria vale para a própria conta).
drop policy accounts_read on public.financial_accounts;
create policy accounts_read on public.financial_accounts for select to authenticated
  using (deleted_at is null and public.context_permission(context_id, 'read'));
drop policy accounts_rename on public.financial_accounts;
create policy accounts_rename on public.financial_accounts for update to authenticated
  using (deleted_at is null and public.context_permission(context_id, 'write')
         and (created_by = auth.uid() or public.context_permission(context_id, 'edit_others')))
  with check (deleted_at is null and public.context_permission(context_id, 'write')
              and (created_by = auth.uid() or public.context_permission(context_id, 'edit_others')));

-- ---------------------------------------------------------------------------
-- Movimentos de meta: conta opcional (A7)
-- ---------------------------------------------------------------------------
alter table public.goal_movements add column account_id uuid;
alter table public.goal_movements
  add constraint goal_movements_account_fk foreign key (account_id, context_id)
    references public.financial_accounts (id, context_id),
  add constraint goal_movements_conta check (account_id is null or kind in ('aporte', 'resgate'));
create index goal_movements_account on public.goal_movements (account_id) where account_id is not null and deleted_at is null;
comment on column public.goal_movements.account_id is
  'Origem do aporte ou destino do resgate (opcional). Só informativo: não cria gasto nem movimenta saldo.';

-- ---------------------------------------------------------------------------
-- Operações: lista completa vigente (41 ações das migrações anteriores) mais as 5 de contas, que apontam só para a conta
-- (target_id), no ramo das ações de série.
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
  'criar_conta', 'alterar_conta', 'conta_principal', 'situacao_conta', 'excluir_conta'));
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
                 'criar_conta', 'alterar_conta', 'conta_principal', 'situacao_conta', 'excluir_conta')
      and target_id is not null and record_id is null and commitment_id is null)
  or (action in ('pagar_fatura', 'desfazer_pagamento_fatura')
      and target_id is not null and record_id is not null and commitment_id is not null)
  or (action = 'criar_ocorrencia' and commitment_id is not null and target_id is not null and record_id is null)
  or (action in ('decidir_revisao', 'responder_guardar') and record_id is null and commitment_id is null and target_id is null));

-- ---------------------------------------------------------------------------
-- Validação de registro: a conta de um registro que já existe continua valendo mesmo arquivada
-- Mesmas regras da 0001; p_keep_account é a conta que o registro já tem (update_record), que pode estar arquivada. A assinatura
-- antiga (7 argumentos) sai: as funções que a chamam com 7 argumentos passam a usar esta, com o argumento novo em branco. Passa de
-- stable para volatile porque trava a linha da conta (for share, A8).
-- ---------------------------------------------------------------------------
drop function public.clarevo_validate_record(uuid, uuid, uuid, bigint, date, text, text);
create or replace function public.clarevo_validate_record(
  p_actor uuid, p_context_id uuid, p_account_id uuid, p_amount_cents bigint, p_occurred_on date, p_description text,
  p_category text default null, p_keep_account uuid default null
)
returns public.financial_accounts
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_account public.financial_accounts%rowtype;
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
  if p_occurred_on is null then
    raise exception 'data_invalida' using errcode = '22023';
  end if;
  if p_occurred_on > public.clarevo_today(p_actor) then
    raise exception 'data_futura' using errcode = '22023';
  end if;
  -- for share (A8): uma exclusão ou um arquivamento da conta que corre ao mesmo tempo espera esta transação; quem espera aqui
  -- reconfere a linha depois da espera e dá conta_invalida.
  select * into v_account from public.financial_accounts
   where id = p_account_id and context_id = p_context_id and deleted_at is null
     and (status = 'ativa' or id = p_keep_account)
   for share;
  if not found then
    raise exception 'conta_invalida' using errcode = '22023';
  end if;
  return v_account;
end;
$$;

-- Mesma assinatura, hash, repetição, trava e retorno da 0008. Mudança: editar o registro de uma conta arquivada mantendo a
-- conta funciona (só trocar para outra conta exige que ela esteja ativa).
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
  if v_record.card_id is not null
     and (p_amount_cents is distinct from v_record.amount_cents or v_description is distinct from v_record.description
          or v_category is distinct from v_record.category) then
    raise exception 'pagamento_de_fatura' using errcode = 'PT409';
  end if;
  perform public.clarevo_validate_record(v_uid, v_record.context_id, p_account_id, p_amount_cents, p_occurred_on, v_description, v_category,
                                          v_record.account_id);

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

-- ---------------------------------------------------------------------------
-- Primeira entrada (0001) com a conta certa: a principal. Mesma assinatura, mesmas regras e mesmo retorno; mudança: a conta
-- devolvida ignora as excluídas e põe a principal e as ativas antes das arquivadas (antes, a mais antiga, que podia estar
-- arquivada ou excluída). Só cria a primeira conta se o contexto não tem nenhuma (o gatilho a torna principal).
-- ---------------------------------------------------------------------------
create or replace function public.ensure_personal_space(p_account_name text default 'Conta principal', p_time_zone text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_user auth.users%rowtype;
  v_name text;
  v_ctx uuid;
  v_account public.financial_accounts%rowtype;
  v_account_name text := btrim(coalesce(p_account_name, ''));
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  select * into v_user from auth.users where id = v_uid;
  if not found or v_user.email_confirmed_at is null then
    raise exception 'email_nao_confirmado' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtext('space:' || v_uid::text));

  v_name := left(coalesce(nullif(btrim(v_user.raw_user_meta_data ->> 'display_name'), ''), split_part(v_user.email, '@', 1), 'Pessoa'), 80);
  -- Fuso do aparelho no primeiro acesso (validado); sem ele, São Paulo.
  insert into public.persons (id, display_name, time_zone)
  values (v_uid, v_name,
          coalesce((select name from pg_timezone_names where name = p_time_zone limit 1), 'America/Sao_Paulo'))
  on conflict (id) do nothing;

  select id into v_ctx from public.financial_contexts where owner_person_id = v_uid and kind = 'pessoal';
  if v_ctx is null then
    insert into public.financial_contexts (kind, name, owner_person_id) values ('pessoal', 'Pessoal', v_uid) returning id into v_ctx;
    insert into public.context_memberships (context_id, person_id, role, can_read, can_write, can_edit_others)
    values (v_ctx, v_uid, 'titular', true, true, true);
  end if;

  -- A conta que volta é a principal (ou, faltando, a ativa mais antiga): nunca uma arquivada nem uma excluída (A2 garante que há uma).
  select * into v_account from public.financial_accounts
   where context_id = v_ctx and deleted_at is null
   order by is_default desc, (status = 'ativa') desc, created_at, id
   limit 1;
  if not found then
    if char_length(v_account_name) not between 1 and 40 then
      raise exception 'nome_da_conta_invalido' using errcode = '22023';
    end if;
    insert into public.financial_accounts (context_id, name, created_by)
    values (v_ctx, v_account_name, v_uid)
    returning * into v_account;
  end if;

  return jsonb_build_object(
    'person_id', v_uid,
    'display_name', (select display_name from public.persons where id = v_uid),
    'context_id', v_ctx,
    'account', jsonb_build_object('id', v_account.id, 'name', v_account.name, 'currency', v_account.currency)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Contas: validação, limite, nome repetido e trava
-- ---------------------------------------------------------------------------

-- Mesma ordem de validateAccountDraft no core: nome, tipo.
create or replace function public.clarevo_validate_account(p_name text, p_kind text)
returns void
language plpgsql
immutable
set search_path = public
as $$
begin
  if p_name is null or char_length(p_name) not between 1 and 40 then
    raise exception 'nome_da_conta_invalido' using errcode = '22023';
  end if;
  if p_kind is null or p_kind not in ('banco', 'dinheiro', 'outra') then
    raise exception 'tipo_da_conta_invalido' using errcode = '22023';
  end if;
end;
$$;

-- A4: nenhuma outra conta não excluída com o mesmo nome (sem diferenciar maiúsculas de minúsculas).
create or replace function public.clarevo_check_account_name(p_context_id uuid, p_name text, p_account_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.financial_accounts a
              where a.context_id = p_context_id and a.deleted_at is null and lower(a.name) = lower(p_name)
                and a.id is distinct from p_account_id) then
    raise exception 'nome_da_conta_repetido' using errcode = 'PT409';
  end if;
end;
$$;

-- A3: até 10 contas ativas por contexto. A trava consultiva (já tomada por quem chama) serializa a criação e a reativação.
create or replace function public.clarevo_check_account_limit(p_context_id uuid, p_account_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if (select count(*) from public.financial_accounts a
       where a.context_id = p_context_id and a.deleted_at is null and a.status = 'ativa'
         and a.id is distinct from p_account_id) >= 10 then
    raise exception 'limite_de_contas' using errcode = 'PT409';
  end if;
end;
$$;

-- Carrega a conta para alteração: trava consultiva do contexto, depois a linha. Sem revelar se existe para quem não pode lê-la
-- (nao_encontrado); escrever exige escrita no contexto; a conta de outra pessoa exige "editar de outras pessoas".
create or replace function public.clarevo_lock_account(p_account_id uuid)
returns public.financial_accounts
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_ctx uuid;
  v_a public.financial_accounts%rowtype;
begin
  -- context_id é imutável: ler sem trava é seguro.
  select context_id into v_ctx from public.financial_accounts where id = p_account_id;
  if v_ctx is null then
    raise exception 'nao_encontrado' using errcode = 'P0002';
  end if;
  perform pg_advisory_xact_lock(hashtext('contas:' || v_ctx::text));
  select * into v_a from public.financial_accounts where id = p_account_id for update;
  if not found or v_a.deleted_at is not null or not public.context_permission(v_a.context_id, 'read') then
    raise exception 'nao_encontrado' using errcode = 'P0002';
  end if;
  if not public.context_permission(v_a.context_id, 'write')
     or (v_a.created_by <> auth.uid() and not public.context_permission(v_a.context_id, 'edit_others')) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  return v_a;
end;
$$;

-- Quem ganha ou perde a marca de principal precisa poder mexer na conta: a de outra pessoa exige "editar de outras pessoas"
-- (sem_permissao). Quem chama já tem escrita no contexto (clarevo_lock_account).
create or replace function public.clarevo_require_account_owner(p_account_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_a public.financial_accounts%rowtype;
begin
  select * into v_a from public.financial_accounts where id = p_account_id;
  if not found then
    raise exception 'conta_invalida' using errcode = '22023';
  end if;
  if v_a.created_by <> auth.uid() and not public.context_permission(v_a.context_id, 'edit_others') then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Criar conta. Exige escrita no contexto. A primeira conta de um contexto sem principal nasce principal (gatilho).
-- Ordem: sessão; chave; repetição; sem_permissao; nome_da_conta_invalido; tipo_da_conta_invalido; trava;
-- nome_da_conta_repetido; limite_de_contas. Retorno: a conta em JSON (na repetição, a conta atual, inclusive se já excluída).
-- ---------------------------------------------------------------------------
create or replace function public.create_account(
  p_idempotency_key text,
  p_context_id uuid,
  p_name text,
  p_kind text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_name text := public.clarevo_trim(p_name);
  v_hash text;
  v_op public.record_operations%rowtype;
  v_a public.financial_accounts%rowtype;
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  perform public.clarevo_check_key(p_idempotency_key);
  v_hash := md5(jsonb_build_array('criar_conta', p_context_id, v_name, p_kind)::text);
  perform pg_advisory_xact_lock(hashtext('op:' || v_uid::text || ':' || p_idempotency_key));

  select * into v_op from public.record_operations where actor_id = v_uid and idempotency_key = p_idempotency_key;
  if found then
    if v_op.action <> 'criar_conta' or v_op.request_hash <> v_hash then
      raise exception 'chave_reutilizada' using errcode = 'PT409';
    end if;
    if not public.context_permission(v_op.context_id, 'read') then
      raise exception 'nao_encontrado' using errcode = 'P0002';
    end if;
    return (select to_jsonb(a) from public.financial_accounts a where a.id = v_op.target_id);
  end if;

  if not public.context_permission(p_context_id, 'write') then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  perform public.clarevo_validate_account(v_name, p_kind);
  perform pg_advisory_xact_lock(hashtext('contas:' || p_context_id::text));
  perform public.clarevo_check_account_name(p_context_id, v_name, null);
  perform public.clarevo_check_account_limit(p_context_id, null);

  insert into public.financial_accounts (context_id, name, kind, created_by)
  values (p_context_id, v_name, p_kind, v_uid)
  returning * into v_a;

  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id, target_id)
  values (v_uid, p_idempotency_key, 'criar_conta', p_context_id, v_hash, null, null, v_a.id);

  return to_jsonb(v_a);
end;
$$;

-- ---------------------------------------------------------------------------
-- Alterar nome e tipo, em qualquer situação (a conta arquivada também pode ser renomeada).
-- Ordem: repetição; nao_encontrado; sem_permissao; versao_desatualizada; nome_da_conta_invalido; tipo_da_conta_invalido;
-- nome_da_conta_repetido.
-- ---------------------------------------------------------------------------
create or replace function public.update_account(
  p_idempotency_key text,
  p_account_id uuid,
  p_expected_version integer,
  p_name text,
  p_kind text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_name text := public.clarevo_trim(p_name);
  v_hash text;
  v_op public.record_operations%rowtype;
  v_a public.financial_accounts%rowtype;
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  perform public.clarevo_check_key(p_idempotency_key);
  v_hash := md5(jsonb_build_array('alterar_conta', p_account_id, p_expected_version, v_name, p_kind)::text);
  perform pg_advisory_xact_lock(hashtext('op:' || v_uid::text || ':' || p_idempotency_key));

  select * into v_op from public.record_operations where actor_id = v_uid and idempotency_key = p_idempotency_key;
  if found then
    if v_op.action <> 'alterar_conta' or v_op.request_hash <> v_hash then
      raise exception 'chave_reutilizada' using errcode = 'PT409';
    end if;
    if not public.context_permission(v_op.context_id, 'read') then
      raise exception 'nao_encontrado' using errcode = 'P0002';
    end if;
    return (select to_jsonb(a) from public.financial_accounts a where a.id = v_op.target_id);
  end if;

  v_a := public.clarevo_lock_account(p_account_id);
  -- Versão ausente (NULL) também é recusada.
  if p_expected_version is distinct from v_a.version then
    raise exception 'versao_desatualizada' using errcode = 'PT409', detail = 'versao_atual=' || v_a.version;
  end if;
  perform public.clarevo_validate_account(v_name, p_kind);
  perform public.clarevo_check_account_name(v_a.context_id, v_name, v_a.id);

  update public.financial_accounts set name = v_name, kind = p_kind where id = v_a.id
  returning * into v_a;

  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id, target_id)
  values (v_uid, p_idempotency_key, 'alterar_conta', v_a.context_id, v_hash, null, null, v_a.id);

  return to_jsonb(v_a);
end;
$$;

-- ---------------------------------------------------------------------------
-- Tornar principal a conta (a versão é a dela; a principal anterior também sobe +1). Só conta ativa (conta_arquivada).
-- Já ser a principal é aceito e não muda nada (a versão não sobe). A conta que ganha e a que perde a marca precisam poder ser
-- alteradas por quem chama: a de outra pessoa exige "editar de outras pessoas".
-- Ordem: repetição; nao_encontrado; sem_permissao; versao_desatualizada; conta_arquivada; sem_permissao (a principal anterior).
-- ---------------------------------------------------------------------------
create or replace function public.set_default_account(
  p_idempotency_key text,
  p_account_id uuid,
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
  v_a public.financial_accounts%rowtype;
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  perform public.clarevo_check_key(p_idempotency_key);
  v_hash := md5(jsonb_build_array('conta_principal', p_account_id, p_expected_version)::text);
  perform pg_advisory_xact_lock(hashtext('op:' || v_uid::text || ':' || p_idempotency_key));

  select * into v_op from public.record_operations where actor_id = v_uid and idempotency_key = p_idempotency_key;
  if found then
    if v_op.action <> 'conta_principal' or v_op.request_hash <> v_hash then
      raise exception 'chave_reutilizada' using errcode = 'PT409';
    end if;
    if not public.context_permission(v_op.context_id, 'read') then
      raise exception 'nao_encontrado' using errcode = 'P0002';
    end if;
    return (select to_jsonb(a) from public.financial_accounts a where a.id = v_op.target_id);
  end if;

  v_a := public.clarevo_lock_account(p_account_id);
  if p_expected_version is distinct from v_a.version then
    raise exception 'versao_desatualizada' using errcode = 'PT409', detail = 'versao_atual=' || v_a.version;
  end if;
  if v_a.status <> 'ativa' then
    raise exception 'conta_arquivada' using errcode = 'PT409';
  end if;

  if not v_a.is_default then
    -- A principal anterior perde a marca: se é de outra pessoa, exige "editar de outras pessoas".
    perform public.clarevo_require_account_owner(x.id)
       from public.financial_accounts x
      where x.context_id = v_a.context_id and x.is_default and x.deleted_at is null;
    update public.financial_accounts set is_default = false
     where context_id = v_a.context_id and is_default and deleted_at is null;
    update public.financial_accounts set is_default = true where id = v_a.id
    returning * into v_a;
  end if;

  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id, target_id)
  values (v_uid, p_idempotency_key, 'conta_principal', v_a.context_id, v_hash, null, null, v_a.id);

  return to_jsonb(v_a);
end;
$$;

-- ---------------------------------------------------------------------------
-- Arquivar (some dos seletores; lançamentos e histórico continuam) e reativar ('ativa', 'arquivada'). Mesma situação é aceita
-- e não muda nada. Nunca se arquiva a última ativa (ultima_conta_ativa). Arquivar a principal exige escolher outra no mesmo ato
-- (p_new_default_id, uma ativa do mesmo contexto; sem ela, conta_principal); p_new_default_id fora desse caso:
-- campo_nao_se_aplica. Reativar respeita as 10 ativas (limite_de_contas).
-- A conta que passa a ser a principal também precisa poder ser alterada por quem chama (sem_permissao: a de outra pessoa exige
-- "editar de outras pessoas").
-- Ordem: repetição; nao_encontrado; sem_permissao; versao_desatualizada; situacao_invalida; campo_nao_se_aplica;
-- ultima_conta_ativa; conta_principal; conta_invalida (a nova principal); sem_permissao (a nova principal); limite_de_contas.
-- ---------------------------------------------------------------------------
create or replace function public.set_account_status(
  p_idempotency_key text,
  p_account_id uuid,
  p_expected_version integer,
  p_status text,
  p_new_default_id uuid default null
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
  v_a public.financial_accounts%rowtype;
  v_archiving boolean;
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  perform public.clarevo_check_key(p_idempotency_key);
  v_hash := md5(jsonb_build_array('situacao_conta', p_account_id, p_expected_version, p_status, p_new_default_id)::text);
  perform pg_advisory_xact_lock(hashtext('op:' || v_uid::text || ':' || p_idempotency_key));

  select * into v_op from public.record_operations where actor_id = v_uid and idempotency_key = p_idempotency_key;
  if found then
    if v_op.action <> 'situacao_conta' or v_op.request_hash <> v_hash then
      raise exception 'chave_reutilizada' using errcode = 'PT409';
    end if;
    if not public.context_permission(v_op.context_id, 'read') then
      raise exception 'nao_encontrado' using errcode = 'P0002';
    end if;
    return (select to_jsonb(a) from public.financial_accounts a where a.id = v_op.target_id);
  end if;

  v_a := public.clarevo_lock_account(p_account_id);
  if p_expected_version is distinct from v_a.version then
    raise exception 'versao_desatualizada' using errcode = 'PT409', detail = 'versao_atual=' || v_a.version;
  end if;
  if p_status is null or p_status not in ('ativa', 'arquivada') then
    raise exception 'situacao_invalida' using errcode = '22023';
  end if;
  v_archiving := p_status = 'arquivada' and v_a.status = 'ativa';
  if p_new_default_id is not null and not (v_archiving and v_a.is_default) then
    raise exception 'campo_nao_se_aplica' using errcode = '22023';
  end if;

  if v_archiving then
    if (select count(*) from public.financial_accounts x
         where x.context_id = v_a.context_id and x.deleted_at is null and x.status = 'ativa') <= 1 then
      raise exception 'ultima_conta_ativa' using errcode = 'PT409';
    end if;
    if v_a.is_default then
      if p_new_default_id is null then
        raise exception 'conta_principal' using errcode = 'PT409';
      end if;
      if p_new_default_id = v_a.id or not exists (
           select 1 from public.financial_accounts x
            where x.id = p_new_default_id and x.context_id = v_a.context_id and x.deleted_at is null and x.status = 'ativa') then
        raise exception 'conta_invalida' using errcode = '22023';
      end if;
      perform public.clarevo_require_account_owner(p_new_default_id);
      update public.financial_accounts set is_default = false, status = 'arquivada' where id = v_a.id
      returning * into v_a;
      update public.financial_accounts set is_default = true where id = p_new_default_id;
    else
      update public.financial_accounts set status = 'arquivada' where id = v_a.id
      returning * into v_a;
    end if;
  elsif p_status = 'ativa' and v_a.status = 'arquivada' then
    perform public.clarevo_check_account_limit(v_a.context_id, v_a.id);
    update public.financial_accounts set status = 'ativa' where id = v_a.id
    returning * into v_a;
  end if;

  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id, target_id)
  values (v_uid, p_idempotency_key, 'situacao_conta', v_a.context_id, v_hash, null, null, v_a.id);

  return to_jsonb(v_a);
end;
$$;

-- ---------------------------------------------------------------------------
-- Excluir a conta (exclusão lógica; fica arquivada e some da leitura). Só sem lançamentos vivos (registros e movimentos de
-- meta com a conta): conta_com_lancamentos ("arquive"). A principal nunca é excluída (conta_principal).
-- Ordem: repetição; nao_encontrado; sem_permissao; versao_desatualizada; conta_principal; conta_com_lancamentos.
-- ---------------------------------------------------------------------------
create or replace function public.delete_account(
  p_idempotency_key text,
  p_account_id uuid,
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
  v_a public.financial_accounts%rowtype;
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  perform public.clarevo_check_key(p_idempotency_key);
  v_hash := md5(jsonb_build_array('excluir_conta', p_account_id, p_expected_version)::text);
  perform pg_advisory_xact_lock(hashtext('op:' || v_uid::text || ':' || p_idempotency_key));

  select * into v_op from public.record_operations where actor_id = v_uid and idempotency_key = p_idempotency_key;
  if found then
    if v_op.action <> 'excluir_conta' or v_op.request_hash <> v_hash then
      raise exception 'chave_reutilizada' using errcode = 'PT409';
    end if;
    if not public.context_permission(v_op.context_id, 'read') then
      raise exception 'nao_encontrado' using errcode = 'P0002';
    end if;
    return (select to_jsonb(a) from public.financial_accounts a where a.id = v_op.target_id);
  end if;

  v_a := public.clarevo_lock_account(p_account_id);
  if p_expected_version is distinct from v_a.version then
    raise exception 'versao_desatualizada' using errcode = 'PT409', detail = 'versao_atual=' || v_a.version;
  end if;
  if v_a.is_default then
    raise exception 'conta_principal' using errcode = 'PT409';
  end if;
  if exists (select 1 from public.financial_records r where r.account_id = v_a.id and r.deleted_at is null)
     or exists (select 1 from public.goal_movements m where m.account_id = v_a.id and m.deleted_at is null) then
    raise exception 'conta_com_lancamentos' using errcode = 'PT409';
  end if;

  update public.financial_accounts
     set status = 'arquivada', deleted_at = now(), deleted_by = v_uid
   where id = v_a.id
  returning * into v_a;

  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id, target_id)
  values (v_uid, p_idempotency_key, 'excluir_conta', v_a.context_id, v_hash, null, null, v_a.id);

  return to_jsonb(v_a);
end;
$$;

-- ---------------------------------------------------------------------------
-- Aporte e resgate de meta com a conta (A7). A assinatura antiga (6 argumentos) sai, como a de create_record na 0008, para não
-- deixar sobrecarga ambígua; o cliente antigo (argumentos nomeados, sem p_account_id) continua funcionando, e com a conta nula
-- o hash é idêntico ao da 0007. Mudança: p_account_id (opcional, depois da observação) só em aporte e resgate
-- (campo_nao_se_aplica nos outros tipos); a conta é ativa e do mesmo contexto (conta_invalida). Só informativa: nenhum gasto é
-- criado e nenhum saldo muda. Na ordem, a conta vem depois de valor, data e observação e antes do saldo da meta.
-- ---------------------------------------------------------------------------
drop function public.add_goal_movement(text, uuid, text, bigint, date, text);
create or replace function public.add_goal_movement(
  p_idempotency_key text,
  p_goal_id uuid,
  p_kind text,
  p_amount_cents bigint,
  p_occurred_on date,
  p_note text default null,
  p_account_id uuid default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_note text := nullif(public.clarevo_trim(p_note), '');
  v_hash text;
  v_op public.record_operations%rowtype;
  v_g public.goals%rowtype;
  v_m public.goal_movements%rowtype;
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  perform public.clarevo_check_key(p_idempotency_key);
  v_hash := md5((jsonb_build_array('registrar_movimento_meta', p_goal_id, p_kind, p_amount_cents, p_occurred_on, v_note)
                 || case when p_account_id is null then '[]'::jsonb else jsonb_build_array(p_account_id) end)::text);
  perform pg_advisory_xact_lock(hashtext('op:' || v_uid::text || ':' || p_idempotency_key));

  select * into v_op from public.record_operations where actor_id = v_uid and idempotency_key = p_idempotency_key;
  if found then
    if v_op.action <> 'registrar_movimento_meta' or v_op.request_hash <> v_hash then
      raise exception 'chave_reutilizada' using errcode = 'PT409';
    end if;
    if not public.context_permission(v_op.context_id, 'read') then
      raise exception 'nao_encontrado' using errcode = 'P0002';
    end if;
    return public.clarevo_goal_result((select goal_id from public.goal_movements where id = v_op.target_id), v_op.target_id);
  end if;

  v_g := public.clarevo_lock_goal(p_goal_id);
  if v_g.status = 'arquivada' then
    raise exception 'meta_arquivada' using errcode = 'PT409';
  end if;
  if p_kind is null or p_kind not in ('aporte', 'resgate', 'rendimento', 'valorizacao', 'desvalorizacao') then
    raise exception 'tipo_invalido' using errcode = '22023';
  end if;
  perform public.clarevo_validate_goal_movement(v_uid, p_amount_cents, p_occurred_on, v_note);
  if p_account_id is not null then
    if p_kind not in ('aporte', 'resgate') then
      raise exception 'campo_nao_se_aplica' using errcode = '22023';
    end if;
    -- for share (A8): a exclusão ou o arquivamento da conta que corre ao mesmo tempo espera, e quem espera aqui reconfere a linha.
    perform 1 from public.financial_accounts a
     where a.id = p_account_id and a.context_id = v_g.context_id and a.deleted_at is null and a.status = 'ativa'
       for share;
    if not found then
      raise exception 'conta_invalida' using errcode = '22023';
    end if;
  end if;

  insert into public.goal_movements (goal_id, context_id, kind, amount_cents, occurred_on, note, created_by, account_id)
  values (v_g.id, v_g.context_id, p_kind, p_amount_cents, p_occurred_on, v_note, v_uid, p_account_id)
  returning * into v_m;
  perform public.clarevo_require_goal_balance(v_g.id);

  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id, target_id)
  values (v_uid, p_idempotency_key, 'registrar_movimento_meta', v_g.context_id, v_hash, null, null, v_m.id);

  return public.clarevo_goal_result(v_g.id, v_m.id);
end;
$$;

-- Valor, data, observação e conta (o tipo nunca muda). p_account_id tem um valor padrão "manter" (o uuid de zeros): sem o
-- argumento, a conta e o hash são os de antes (o app publicado, que chama por nome sem p_account_id, não perde a conta do
-- movimento ao corrigir o valor); nulo, informado de propósito, tira a conta; um uuid troca ou mantém. A conta só é conferida
-- (ativa, do mesmo contexto: conta_invalida) quando muda; manter a conta que o movimento já tem, mesmo arquivada, vale. Movimento
-- que não é aporte nem resgate: campo_nao_se_aplica com conta. Hash: sem o argumento, o da 0007; com nulo, o mesmo mais [null];
-- com uma conta, o mesmo mais a conta.
drop function public.update_goal_movement(text, uuid, integer, bigint, date, text);
create or replace function public.update_goal_movement(
  p_idempotency_key text,
  p_movement_id uuid,
  p_expected_version integer,
  p_amount_cents bigint,
  p_occurred_on date,
  p_note text default null,
  p_account_id uuid default '00000000-0000-0000-0000-000000000000'
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_note text := nullif(public.clarevo_trim(p_note), '');
  v_keep boolean := p_account_id is not distinct from '00000000-0000-0000-0000-000000000000'::uuid;
  v_hash text;
  v_op public.record_operations%rowtype;
  v_m public.goal_movements%rowtype;
  v_account uuid;
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  perform public.clarevo_check_key(p_idempotency_key);
  v_hash := md5((jsonb_build_array('alterar_movimento_meta', p_movement_id, p_expected_version, p_amount_cents, p_occurred_on,
                                   v_note)
                 || case when v_keep then '[]'::jsonb else jsonb_build_array(p_account_id) end)::text);
  perform pg_advisory_xact_lock(hashtext('op:' || v_uid::text || ':' || p_idempotency_key));

  select * into v_op from public.record_operations where actor_id = v_uid and idempotency_key = p_idempotency_key;
  if found then
    if v_op.action <> 'alterar_movimento_meta' or v_op.request_hash <> v_hash then
      raise exception 'chave_reutilizada' using errcode = 'PT409';
    end if;
    if not public.context_permission(v_op.context_id, 'read') then
      raise exception 'nao_encontrado' using errcode = 'P0002';
    end if;
    return public.clarevo_goal_result((select goal_id from public.goal_movements where id = v_op.target_id), v_op.target_id);
  end if;

  v_m := public.clarevo_lock_goal_movement(p_movement_id);
  if p_expected_version is distinct from v_m.version then
    raise exception 'versao_desatualizada' using errcode = 'PT409', detail = 'versao_atual=' || v_m.version;
  end if;
  if (select status from public.goals where id = v_m.goal_id) = 'arquivada' then
    raise exception 'meta_arquivada' using errcode = 'PT409';
  end if;
  perform public.clarevo_validate_goal_movement(v_uid, p_amount_cents, p_occurred_on, v_note);
  -- A conta que fica: a do movimento (manter), nenhuma (nulo) ou a informada.
  v_account := case when v_keep then v_m.account_id else p_account_id end;
  if v_account is not null then
    if v_m.kind not in ('aporte', 'resgate') then
      raise exception 'campo_nao_se_aplica' using errcode = '22023';
    end if;
    if v_account is distinct from v_m.account_id then
      -- for share (A8), como em add_goal_movement.
      perform 1 from public.financial_accounts a
       where a.id = v_account and a.context_id = v_m.context_id and a.deleted_at is null and a.status = 'ativa'
         for share;
      if not found then
        raise exception 'conta_invalida' using errcode = '22023';
      end if;
    end if;
  end if;

  update public.goal_movements
     set amount_cents = p_amount_cents, occurred_on = p_occurred_on, note = v_note, account_id = v_account, version = version + 1
   where id = v_m.id
  returning * into v_m;
  perform public.clarevo_require_goal_balance(v_m.goal_id);

  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id, target_id)
  values (v_uid, p_idempotency_key, 'alterar_movimento_meta', v_m.context_id, v_hash, null, null, v_m.id);

  return public.clarevo_goal_result(v_m.goal_id, v_m.id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Pagamentos com a conta de saída
-- ---------------------------------------------------------------------------
-- Pagar a conta (0008) com a conta de saída certa. Mesma assinatura, hash, repetição, ordem de erros e retorno. Mudanças: sem
-- conta (nulo explícito; o argumento continua obrigatório, como no app publicado) vale a principal do contexto em vez de
-- conta_invalida (A9), e a conta é travada com for share na conferência (A8).
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
  v_account_id uuid;
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

  update public.commitments set status = 'quitado', version = version + 1 where id = v_c.id;

  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id)
  values (v_uid, p_idempotency_key, 'pagar_compromisso', v_c.context_id, v_hash, v_r.id, v_c.id);

  return public.clarevo_commitment_result(v_c.id, v_r.id);
end;
$$;

-- Pagar a fatura (0008) com a conta de saída certa. Mesma assinatura, hash, repetição, ordem de erros e retorno. Mudanças: sem a
-- conta, a principal do contexto (não a mais antiga, A9) e a conta é travada com for share na conferência (A8).
create or replace function public.pay_invoice(
  p_idempotency_key text,
  p_card_id uuid,
  p_month date,
  p_expected_version integer,
  p_paid_cents bigint,
  p_paid_on date,
  p_account_id uuid default null
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
  -- Sem conta, a principal do contexto (A9, antes a mais antiga). for share (A8): a exclusão ou o arquivamento da conta que corre
  -- ao mesmo tempo espera, e quem espera aqui reconfere a linha.
  if p_account_id is null then
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
-- Leitura (RLS) e privilégios. financial_accounts continua sem insert, update (a não ser a coluna name, mantida para o app
-- publicado até a publicação desta migração) nem delete diretos; os dois gatilhos novos e as funções de apoio ficam sem execute
-- para authenticated. Bloco inteiro da 0009 (idempotente), com as duas assinaturas de metas que mudaram e as cinco funções
-- públicas novas.
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
