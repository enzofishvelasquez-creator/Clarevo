-- Clarevo · migração 0011 · assinaturas (D-046, Ciclo H2).
-- Depois de 20261010000003_contas.sql.
-- Assinatura é um gasto fixo mensal marcado como tal (streaming, aplicativo, academia, clube, plano de celular). Nada muda em
-- contas a pagar, Recebido, Pago, Diferença, Ainda a pagar nem na renda comprometida: a marca só deixa o app somar o que as
-- assinaturas custam por mês e por ano e lembrar a pessoa de olhar cada uma de tempos em tempos.
-- Marca só por set_series_subscription e data da revisão só por mark_subscriptions_reviewed: autoria da sessão, chave de
-- idempotência por pessoa (o mesmo espaço das outras operações), hash em JSON (D-021, regra 7) e, na marca, versão da série.
-- NÃO muda a assinatura de nenhuma função existente (create_series e update_series_from seguem com os mesmos argumentos): o app
-- publicado antes da 0011 continua funcionando, e a marca é gravada pelo app novo logo depois de salvar a série.
--
-- Invariantes:
-- B1. Só gasto fixo mensal (kind = 'mensal') pode ser assinatura; parcelamento e conta do ano nunca são (restrição).
-- B2. A data da última revisão só existe em assinatura (restrição); tirar a marca apaga a data, e marcar de novo começa sem data.
-- B3. set_series_subscription: a série precisa ser lida e escrita por quem chama (e, se for de outra pessoa, "editar de outras
--     pessoas"); a versão esperada precisa ser a atual; só gasto fixo mensal; marcar o que já está marcado (ou desmarcar o que não
--     está) não muda nada e não sobe a versão. Quando muda, a versão sobe +1.
-- B4. mark_subscriptions_reviewed grava a data de hoje (no fuso de quem chama) nas assinaturas ATIVAS do contexto (não excluídas e
--     não encerradas) que quem chama pode alterar; a data nunca recua; repetir no mesmo dia não muda nada. Não muda a versão da
--     série (como inform_series_year): é só uma data de conferência.
-- B5. A atividade (gatilho de record_operations, 0005) conta 'marcar_assinatura' como anotação, como as demais escritas de série,
--     e NÃO conta 'revisar_assinaturas': conferir assinaturas não é anotar, e não pode encurtar nem esconder uma ausência.
-- Ordem de travas: chave -> série (set_series_subscription) ou séries do contexto por id (mark_subscriptions_reviewed).

-- ---------------------------------------------------------------------------
-- Colunas e restrições (B1, B2)
-- ---------------------------------------------------------------------------
alter table public.commitment_series
  add column subscription boolean not null default false,
  add column subscription_reviewed_on date;

alter table public.commitment_series
  add constraint commitment_series_assinatura check (
    (not subscription or kind = 'mensal')
    and (subscription_reviewed_on is null or subscription));

comment on column public.commitment_series.subscription is
  'Gasto fixo mensal marcado como assinatura (streaming, aplicativo, academia, clube, plano de celular). Só por set_series_subscription.';
comment on column public.commitment_series.subscription_reviewed_on is
  'Dia da última revisão das assinaturas (mark_subscriptions_reviewed). Só em assinatura; nulo se nunca revisada.';

-- ---------------------------------------------------------------------------
-- Operações: lista completa vigente (46 ações das migrações anteriores) mais as 2 de assinaturas. 'marcar_assinatura' aponta para
-- a série (target_id), no ramo das ações de série; 'revisar_assinaturas' não aponta para nada (o contexto está na operação), como
-- 'decidir_revisao' e 'responder_guardar'.
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
  'marcar_assinatura', 'revisar_assinaturas'));
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
                 'marcar_assinatura')
      and target_id is not null and record_id is null and commitment_id is null)
  or (action in ('pagar_fatura', 'desfazer_pagamento_fatura')
      and target_id is not null and record_id is not null and commitment_id is not null)
  or (action = 'criar_ocorrencia' and commitment_id is not null and target_id is not null and record_id is null)
  or (action in ('decidir_revisao', 'responder_guardar', 'revisar_assinaturas')
      and record_id is null and commitment_id is null and target_id is null));

-- ---------------------------------------------------------------------------
-- Atividade (B5): mesma função da 0007, com a exceção nova. O gatilho record_operations_activity continua o mesmo.
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
  if new.action in ('decidir_revisao', 'responder_guardar', 'revisar_assinaturas') then
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

-- ---------------------------------------------------------------------------
-- Marcar ou desmarcar um gasto fixo mensal como assinatura (B1, B3).
-- Mesma estrutura das funções de série: sessão; chave; hash de jsonb_build_array(ação, argumentos)::text; trava da chave;
-- repetição (ação e hash iguais, leitura do contexto); trava e permissão da série; versão; validação; escrita; operação.
-- Retorno: o objeto {series, occurrences, changed} das outras funções de série (changed = 1 se a marca mudou, senão 0).
-- ---------------------------------------------------------------------------
create or replace function public.set_series_subscription(
  p_idempotency_key text,
  p_series_id uuid,
  p_expected_version integer,
  p_subscription boolean
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
  v_changed int := 0;
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  perform public.clarevo_check_key(p_idempotency_key);
  v_hash := md5(jsonb_build_array('marcar_assinatura', p_series_id, p_expected_version, p_subscription)::text);
  perform pg_advisory_xact_lock(hashtext('op:' || v_uid::text || ':' || p_idempotency_key));

  select * into v_op from public.record_operations where actor_id = v_uid and idempotency_key = p_idempotency_key;
  if found then
    if v_op.action <> 'marcar_assinatura' or v_op.request_hash <> v_hash then
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
  if p_subscription is null then
    raise exception 'marca_invalida' using errcode = '22023';
  end if;
  if v_s.kind <> 'mensal' then
    raise exception 'assinatura_so_gasto_fixo' using errcode = '22023';
  end if;

  if v_s.subscription is distinct from p_subscription then
    update public.commitment_series
       set subscription = p_subscription,
           subscription_reviewed_on = null,
           version = version + 1
     where id = v_s.id;
    v_changed := 1;
  end if;

  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id, target_id)
  values (v_uid, p_idempotency_key, 'marcar_assinatura', v_s.context_id, v_hash, null, null, v_s.id);

  return public.clarevo_series_result(v_s.id, v_changed);
end;
$$;

-- ---------------------------------------------------------------------------
-- "Revisei minhas assinaturas": grava a data de hoje nas assinaturas ativas do contexto (B4). Basta escrever no contexto; as
-- séries de outras pessoas só entram com "editar de outras pessoas". Sem assinatura ativa a chamada vale e muda 0.
-- Retorno: {reviewed_on, changed}. reviewed_on é o dia de hoje (na repetição, a data mais recente que as assinaturas têm).
-- ---------------------------------------------------------------------------
create or replace function public.mark_subscriptions_reviewed(
  p_idempotency_key text,
  p_context_id uuid
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
  v_today date;
  v_month date;
  v_all boolean;
  v_changed int;
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  perform public.clarevo_check_key(p_idempotency_key);
  v_hash := md5(jsonb_build_array('revisar_assinaturas', p_context_id)::text);
  perform pg_advisory_xact_lock(hashtext('op:' || v_uid::text || ':' || p_idempotency_key));

  select * into v_op from public.record_operations where actor_id = v_uid and idempotency_key = p_idempotency_key;
  if found then
    if v_op.action <> 'revisar_assinaturas' or v_op.request_hash <> v_hash then
      raise exception 'chave_reutilizada' using errcode = 'PT409';
    end if;
    if not public.context_permission(v_op.context_id, 'read') then
      raise exception 'nao_encontrado' using errcode = 'P0002';
    end if;
    return jsonb_build_object(
      'reviewed_on', (select max(s.subscription_reviewed_on) from public.commitment_series s
                       where s.context_id = v_op.context_id and s.deleted_at is null and s.subscription),
      'changed', 0);
  end if;

  if not public.context_permission(p_context_id, 'write') then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  v_today := public.clarevo_today(v_uid);
  v_month := date_trunc('month', v_today::timestamp)::date;
  v_all := public.context_permission(p_context_id, 'edit_others');

  -- Trava as assinaturas ativas que quem chama pode alterar, por id (sem inversão com as escritas de uma série só).
  perform 1 from public.commitment_series s
   where s.context_id = p_context_id and s.deleted_at is null and s.subscription
     and (v_all or s.created_by = v_uid)
     and (s.last_number is null
          or (s.last_number >= s.first_number and public.clarevo_series_month(s, s.last_number) >= v_month))
   order by s.id for update;                                                              -- trava 1: séries

  update public.commitment_series s
     set subscription_reviewed_on = v_today
   where s.context_id = p_context_id and s.deleted_at is null and s.subscription
     and (v_all or s.created_by = v_uid)
     and (s.last_number is null
          or (s.last_number >= s.first_number and public.clarevo_series_month(s, s.last_number) >= v_month))
     and (s.subscription_reviewed_on is null or s.subscription_reviewed_on < v_today);
  get diagnostics v_changed = row_count;

  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id, target_id)
  values (v_uid, p_idempotency_key, 'revisar_assinaturas', p_context_id, v_hash, null, null, null);

  return jsonb_build_object('reviewed_on', v_today, 'changed', v_changed);
end;
$$;

-- ---------------------------------------------------------------------------
-- Visão das séries: as duas colunas novas no fim (create or replace só aceita colunas novas no fim).
-- ---------------------------------------------------------------------------
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
       s.parts_per_year,
       s.subscription, s.subscription_reviewed_on
  from public.commitment_series s
 where s.deleted_at is null and public.context_permission(s.context_id, 'read');
comment on view public.series_items is 'Séries não excluídas que quem consulta pode ler, com vigências vivas, números pulados e contagens.';

-- ---------------------------------------------------------------------------
-- Leitura (RLS) e privilégios. commitment_series continua sem insert, update ou delete diretos; a marca e a data só mudam pelas
-- duas funções novas. Bloco inteiro da 0010 (idempotente), com as duas funções públicas novas no fim.
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
