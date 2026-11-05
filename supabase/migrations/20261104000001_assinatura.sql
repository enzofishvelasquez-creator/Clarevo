-- Clarevo · migração 0023 · Assinatura paga (D-083). Depois de 20261101000001_telegram.sql.
-- A Clarevo passa a ser paga: R$ 29,90 por mês (plano individual) ou R$ 69,90 (plano familiar, até 6 pessoas, pago pela titular), com
-- 14 dias grátis sem cartão; depois, sem assinatura, a conta fica só para ver e exportar. Quem tem o benefício pela empresa (D-056)
-- continua com acesso pleno. Esta migração não muda nada para ninguém enquanto a equipe não marcar o início da cobrança
-- (clarevo_staff_set_billing_start): até lá, todo mundo está em "pre_lancamento", com acesso pleno.
--
-- Invariantes:
-- A1. O acesso de cada pessoa (clarevo_access), nesta ordem: um direito próprio vigente em plan_entitlements (assinatura, origem
--     'particular'; benefício da empresa; cortesia da equipe) > ser membro ativo de uma Família cuja titular tem um direito vigente de
--     plano 'familiar' > antes do início da cobrança (billing_settings.enforced_from nulo ou no futuro) > 14 dias de teste contados do
--     maior entre a criação da pessoa e o início da cobrança > só leitura.
-- A2. Só leitura: o gatilho de record_operations (o ponto por onde toda função de escrita passa, 0016) recusa 'assinatura_necessaria'
--     (PT402) em toda ação que cria ou muda dados, salvo as de sair, desligar, aceitar um benefício ou convite de Família, administrar
--     quem está na Família e as licenças da empresa, responder "Como você conheceu a Clarevo?" e decidir a revisão dos últimos meses
--     (lista em clarevo_write_free_actions). Ler, exportar (no aparelho) e
--     excluir a conta (sem operação) continuam sempre possíveis. A geração das contas de gastos fixos (sem operação) também continua.
-- A3. O direito por assinatura só é gravado por billing_apply (chave de serviço, chamada pela função do servidor que recebe os avisos
--     das lojas e do pagamento na web), idempotente pelo identificador do evento (billing_events, sem dado pessoal) e na ordem em que os
--     eventos aconteceram (plan_entitlements.last_event_at: aviso mais antigo que o último aplicado não muda nada, porque as lojas
--     reenviam avisos com atraso e fora de ordem); da assinatura na loja fica só um resumo SHA-256 do identificador
--     (plan_entitlements.external_ref). A cortesia só pela equipe no SQL Editor
--     (clarevo_staff_grant_courtesy), e o início da cobrança só por clarevo_staff_set_billing_start.
-- A4. my_access (authenticated) devolve o acesso da própria pessoa: {status, plan, until, can_write}.
-- A5. Telegram e WhatsApp: anotar e desfazer em só leitura respondem sem_assinatura (sem anotar nada).
--
-- Aplicar no SQL Editor depois da 0022 (docs/05, passo 12m). Testes em supabase/tests/99zz_assinatura.sql.

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------
create table public.billing_settings (
  id boolean primary key default true check (id),
  enforced_from timestamptz,
  updated_at timestamptz not null default now()
);
insert into public.billing_settings (id) values (true);
comment on table public.billing_settings is
  'Início da cobrança (D-083): enforced_from nulo ou no futuro deixa todas as pessoas com acesso pleno. Uma linha só, mudada só por '
  'clarevo_staff_set_billing_start.';

create table public.billing_events (
  event_id text primary key check (char_length(event_id) between 1 and 200),
  provider text not null check (provider in ('apple', 'google', 'web')),
  received_at timestamptz not null default now()
);
create index billing_events_received_idx on public.billing_events (received_at);
comment on table public.billing_events is
  'Avisos de pagamento já aplicados (D-083), para não aplicar duas vezes o mesmo aviso: só o identificador do evento, a origem e a hora, '
  'nunca dado da pessoa. Escrita só por billing_apply.';

alter table public.plan_entitlements add column provider text check (provider in ('apple', 'google', 'web', 'equipe'));
alter table public.plan_entitlements add column external_ref text check (external_ref ~ '^[0-9a-f]{64}$');
-- Quando aconteceu o último evento aplicado (a data do evento na loja ou no serviço de pagamento, não a da chegada do aviso).
alter table public.plan_entitlements add column last_event_at timestamptz;
create unique index plan_entitlements_one_per_external on public.plan_entitlements (provider, external_ref) where external_ref is not null;

-- ---------------------------------------------------------------------------
-- Acesso (A1)
-- ---------------------------------------------------------------------------
create or replace function public.clarevo_access(p_person uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_source public.entitlement_source;
  v_plan text;
  v_until timestamptz;
  v_from timestamptz;
  v_created timestamptz;
  v_trial timestamptz;
begin
  select e.source, e.plan, e.valid_until into v_source, v_plan, v_until
    from public.plan_entitlements e
   where e.person_id = p_person and e.valid_from <= v_now and (e.valid_until is null or e.valid_until > v_now)
   order by case e.source when 'particular' then 0 when 'beneficio' then 1 else 2 end, e.valid_until desc nulls first
   limit 1;
  if found then
    return jsonb_build_object('status', case v_source when 'particular' then 'assinatura' when 'beneficio' then 'beneficio' else 'cortesia' end,
                              'plan', v_plan, 'until', v_until, 'can_write', true);
  end if;

  -- Membro ativo de uma Família que não terminou, cuja titular ativa tem um direito vigente de plano familiar.
  select e.valid_until into v_until
    from public.context_memberships m
    join public.financial_contexts c on c.id = m.context_id and c.kind = 'familia' and c.ended_at is null
    join public.context_memberships t on t.context_id = c.id and t.role = 'titular' and t.revoked_at is null and t.person_id <> p_person
    join public.plan_entitlements e on e.person_id = t.person_id and e.plan = 'familiar'
                                   and e.valid_from <= v_now and (e.valid_until is null or e.valid_until > v_now)
   where m.person_id = p_person and m.revoked_at is null
   order by e.valid_until desc nulls first
   limit 1;
  if found then
    return jsonb_build_object('status', 'familia', 'plan', 'familiar', 'until', v_until, 'can_write', true);
  end if;

  select s.enforced_from into v_from from public.billing_settings s where s.id;
  if v_from is null or v_now < v_from then
    return jsonb_build_object('status', 'pre_lancamento', 'plan', null, 'until', v_from, 'can_write', true);
  end if;
  select p.created_at into v_created from public.persons p where p.id = p_person;
  v_trial := greatest(coalesce(v_created, v_now), v_from) + interval '14 days';
  if v_now < v_trial then
    return jsonb_build_object('status', 'teste', 'plan', null, 'until', v_trial, 'can_write', true);
  end if;
  return jsonb_build_object('status', 'leitura', 'plan', null, 'until', v_trial, 'can_write', false);
end;
$$;

-- As ações que valem mesmo em só leitura (A2): sair, desligar, aceitar benefício ou convite, administrar quem está na Família e as
-- licenças da empresa, responder "Como você conheceu a Clarevo?" e decidir a revisão dos últimos meses. Nenhuma muda dados financeiros.
create or replace function public.clarevo_write_free_actions()
returns text[]
language sql
immutable
set search_path = public
as $$
  select array['sair_familia', 'aceitar_convite_familia', 'encerrar_familia', 'remover_membro_familia', 'transferir_titularidade_familia',
               'alterar_papel_familia', 'cancelar_convite_familia', 'aceitar_licenca', 'convidar_licencas', 'renovar_convite_licenca', 'cancelar_convite_licenca',
               'encerrar_licenca', 'ligar_whatsapp', 'desligar_whatsapp', 'ligar_telegram', 'desligar_telegram',
               'responder_origem_cadastro', 'decidir_revisao']::text[];
$$;

-- O gatilho de record_operations (0016): conta excluída, como antes, e agora a assinatura (A2).
create or replace function public.record_operations_actor_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted timestamptz;
begin
  select p.deleted_at into v_deleted from public.persons p where p.id = new.actor_id for key share;
  if not found or v_deleted is not null then
    raise exception 'conta_excluida' using errcode = '42501';
  end if;
  if not (new.action = any (public.clarevo_write_free_actions()))
     and not coalesce((public.clarevo_access(new.actor_id) ->> 'can_write')::boolean, false) then
    raise exception 'assinatura_necessaria' using errcode = 'PT402';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- App (A4)
-- ---------------------------------------------------------------------------
create or replace function public.my_access()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  return public.clarevo_access(auth.uid());
end;
$$;

-- ---------------------------------------------------------------------------
-- Servidor (A3): aplicar um aviso de pagamento. p_external_ref é o resumo SHA-256 do identificador da assinatura na loja ou no serviço
-- de pagamento; p_valid_until é o fim do período pago (renovar empurra a data; cancelar não mexe, e o acesso acaba sozinho no fim do
-- período; estorno manda a data de agora); p_event_at é quando o evento aconteceu na loja ou no serviço (a Apple manda signedDate, o
-- Google eventTimeMillis). Ordem: aviso_invalido; trava da assinatura; repetido (o mesmo evento já aplicado); sem_pessoa (pessoa
-- nula ou excluída: o aviso não é gravado, para valer quando chegar de novo com a pessoa); assinatura_de_outra_pessoa; antigo (evento
-- anterior ao último aplicado: gravado, sem mudar nada); aplicado. Retorno: {result, access?}.
-- ---------------------------------------------------------------------------
create or replace function public.billing_apply(
  p_event_id text, p_provider text, p_person uuid, p_external_ref text, p_plan text, p_valid_until timestamptz, p_event_at timestamptz
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_owner uuid;
  v_last timestamptz;
begin
  if p_event_id is null or char_length(p_event_id) not between 1 and 200 or p_provider is null or p_provider not in ('apple', 'google', 'web')
     or p_external_ref is null or p_external_ref !~ '^[0-9a-f]{64}$' or p_plan is null or p_plan not in ('individual', 'familiar')
     or p_valid_until is null or p_event_at is null or p_event_at > now() + interval '1 day' then
    raise exception 'aviso_invalido' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtext('billing:' || p_provider || ':' || p_external_ref));
  if exists (select 1 from public.billing_events where event_id = p_event_id) then
    return jsonb_build_object('result', 'repetido');
  end if;
  if p_person is null or not exists (select 1 from public.persons p where p.id = p_person and p.deleted_at is null) then
    return jsonb_build_object('result', 'sem_pessoa');
  end if;

  select e.id, e.person_id, e.last_event_at into v_id, v_owner, v_last
    from public.plan_entitlements e where e.provider = p_provider and e.external_ref = p_external_ref for update;
  if v_id is not null and v_owner <> p_person then
    raise exception 'assinatura_de_outra_pessoa' using errcode = '22023';
  end if;
  insert into public.billing_events (event_id, provider) values (p_event_id, p_provider);
  if v_id is not null and v_last is not null and p_event_at < v_last then
    return jsonb_build_object('result', 'antigo', 'access', public.clarevo_access(p_person));
  end if;
  if v_id is null then
    insert into public.plan_entitlements (person_id, source, plan, valid_from, valid_until, provider, external_ref, last_event_at)
    values (p_person, 'particular', p_plan, now(), p_valid_until, p_provider, p_external_ref, p_event_at);
  else
    update public.plan_entitlements set plan = p_plan, valid_until = p_valid_until, last_event_at = p_event_at where id = v_id;
  end if;
  return jsonb_build_object('result', 'aplicado', 'access', public.clarevo_access(p_person));
end;
$$;

-- ---------------------------------------------------------------------------
-- Equipe (só quem roda no SQL Editor): o início da cobrança e a cortesia (A3).
-- ---------------------------------------------------------------------------
create or replace function public.clarevo_staff_set_billing_start(p_at timestamptz)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  update public.billing_settings set enforced_from = p_at, updated_at = now() where id;
  return (select jsonb_build_object('enforced_from', s.enforced_from, 'updated_at', s.updated_at) from public.billing_settings s where s.id);
end;
$$;

-- Cortesia: acesso pleno sem pagar até p_until (nulo: sem fim), para quem testa o app, imprensa ou parcerias. A pessoa precisa já ter conta
-- (e-mail confirmado). Retorno: o acesso da pessoa.
create or replace function public.clarevo_staff_grant_courtesy(p_email text, p_plan text, p_until timestamptz)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_person uuid;
begin
  if p_plan is null or p_plan not in ('individual', 'familiar') then
    raise exception 'plano_invalido' using errcode = '22023';
  end if;
  select u.id into v_person from auth.users u
    join public.persons p on p.id = u.id and p.deleted_at is null
   where lower(u.email) = lower(btrim(coalesce(p_email, ''))) and u.email_confirmed_at is not null;
  if v_person is null then
    raise exception 'pessoa_sem_conta' using errcode = '22023';
  end if;
  insert into public.plan_entitlements (person_id, source, plan, valid_from, valid_until, provider)
  values (v_person, 'cortesia', p_plan, now(), p_until, 'equipe');
  return public.clarevo_access(v_person);
end;
$$;

-- ---------------------------------------------------------------------------
-- Telegram e WhatsApp (A5): o resultado novo e as duas funções da 0022 com a assinatura mapeada.
-- ---------------------------------------------------------------------------
alter table public.chat_messages drop constraint chat_messages_outcome_check;
alter table public.chat_messages add constraint chat_messages_outcome_check check (outcome in (
  'ligado', 'anotado', 'desfeito', 'desligado', 'nao_ligado', 'codigo_invalido', 'ja_ligado', 'muitas_tentativas', 'muitas_mensagens',
  'nada_para_desfazer', 'sem_permissao', 'sem_conta', 'data_futura', 'valor_invalido', 'valor_acima_do_limite', 'descricao_invalida',
  'sem_assinatura', 'ajuda', 'midia', 'nao_entendi'));

create or replace function public.clarevo_chat_add_record(
  p_channel text, p_message_id text, p_sender_hash text, p_sent_at timestamptz, p_kind public.record_kind, p_amount_cents bigint,
  p_days_ago integer, p_occurred_on date, p_description text, p_category text
)
returns jsonb
language plpgsql
volatile
set search_path = public
as $$
declare
  v_gate jsonb;
  v_link public.chat_links%rowtype;
  v_today date;
  v_on date;
  v_account uuid;
  v_record public.financial_records%rowtype;
  v_claims text := coalesce(current_setting('request.jwt.claims', true), '');
  v_sub text := coalesce(current_setting('request.jwt.claim.sub', true), '');
  v_error text;
  v_result text;
begin
  if p_sent_at is null or (p_days_ago is null) = (p_occurred_on is null) or p_days_ago not between 0 and 31 then
    raise exception 'mensagem_invalida' using errcode = '22023';
  end if;
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
  v_on := coalesce(p_occurred_on, v_today - p_days_ago);

  select a.id into v_account from public.financial_accounts a
   where a.context_id = v_link.context_id and a.is_default and a.deleted_at is null;
  if v_account is null then
    perform public.clarevo_chat_log(p_channel, p_message_id, p_sender_hash, v_link.person_id, 'sem_conta');
    return jsonb_build_object('result', 'sem_conta', 'space', public.clarevo_chat_space(v_link.context_id), 'today', v_today);
  end if;

  begin
    perform public.clarevo_chat_as(v_link.person_id);
    v_record := public.create_record(p_channel || ':' || md5(p_message_id), v_link.context_id, v_account, p_kind, p_amount_cents,
                                     v_on, p_description, p_category, null);
    perform public.clarevo_chat_as(null, v_claims, v_sub);
  exception when others then
    -- O bloco desfaz o que a create_record gravou e a sessão emprestada. Só os casos esperados viram resposta.
    get stacked diagnostics v_error = message_text;
    v_result := case v_error
      when 'sem_permissao' then 'sem_permissao'
      when 'conta_excluida' then 'nao_ligado'
      when 'conta_invalida' then 'sem_conta'
      when 'data_futura' then 'data_futura'
      when 'data_invalida' then 'data_futura'
      when 'valor_invalido' then 'valor_invalido'
      when 'valor_acima_do_limite' then 'valor_acima_do_limite'
      when 'descricao_obrigatoria' then 'descricao_invalida'
      when 'descricao_longa' then 'descricao_invalida'
      when 'categoria_invalida' then 'descricao_invalida'
      when 'assinatura_necessaria' then 'sem_assinatura'
    end;
    if v_result is null then
      raise;
    end if;
    perform public.clarevo_chat_log(p_channel, p_message_id, p_sender_hash,
                                    case when v_result = 'nao_ligado' then null else v_link.person_id end, v_result);
    return jsonb_build_object('result', v_result, 'space', public.clarevo_chat_space(v_link.context_id), 'today', v_today);
  end;

  perform public.clarevo_chat_log(p_channel, p_message_id, p_sender_hash, v_link.person_id, 'anotado', v_record.id);
  return jsonb_build_object('result', 'anotado', 'space', public.clarevo_chat_space(v_link.context_id),
                            'record', public.clarevo_chat_record(v_record.id), 'today', v_today);
end;
$$;

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

  select m.* into v_msg from public.chat_messages m
    join public.financial_records r on r.id = m.record_id and r.deleted_at is null and r.created_by = v_link.person_id
   where m.person_id = v_link.person_id and m.channel = p_channel and m.outcome = 'anotado' and m.undone_at is null
     and m.received_at > now() - interval '24 hours'
     and exists (select 1 from public.context_memberships cm
                  where cm.context_id = r.context_id and cm.person_id = v_link.person_id and cm.revoked_at is null and cm.can_write)
   order by m.received_at desc, m.message_id desc
   limit 1
   for update of m;
  -- A versão é lida com a linha travada: uma edição no app ao mesmo tempo espera aqui.
  if found then
    select * into v_record from public.financial_records where id = v_msg.record_id and deleted_at is null for update;
  end if;
  if v_record.id is null then
    perform public.clarevo_chat_log(p_channel, p_message_id, p_sender_hash, v_link.person_id, 'nada_para_desfazer');
    return jsonb_build_object('result', 'nada_para_desfazer');
  end if;

  begin
    perform public.clarevo_chat_as(v_link.person_id);
    perform public.delete_record(p_channel || ':' || md5(p_message_id), v_record.id, v_record.version);
    perform public.clarevo_chat_as(null, v_claims, v_sub);
  exception when others then
    get stacked diagnostics v_error = message_text;
    v_result := case v_error
      when 'sem_permissao' then 'sem_permissao'
      when 'nao_encontrado' then 'nada_para_desfazer'
      when 'conta_excluida' then 'nao_ligado'
      when 'assinatura_necessaria' then 'sem_assinatura'
    end;
    if v_result is null then
      raise;
    end if;
    perform public.clarevo_chat_log(p_channel, p_message_id, p_sender_hash,
                                    case when v_result = 'nao_ligado' then null else v_link.person_id end, v_result);
    return case when v_result = 'sem_permissao'
                then jsonb_build_object('result', v_result, 'space', public.clarevo_chat_space(v_record.context_id))
                else jsonb_build_object('result', v_result) end;
  end;

  update public.chat_messages set undone_at = now() where message_id = v_msg.message_id;
  perform public.clarevo_chat_log(p_channel, p_message_id, p_sender_hash, v_link.person_id, 'desfeito', v_record.id);
  return jsonb_build_object('result', 'desfeito', 'space', public.clarevo_chat_space(v_record.context_id),
                            'record', public.clarevo_chat_record(v_record.id), 'today', v_today);
end;
$$;

-- ---------------------------------------------------------------------------
-- Privilégios, só do que é novo. As tabelas ficam sem leitura e escrita direta (RLS ligada, sem política).
-- ---------------------------------------------------------------------------
alter table public.billing_settings enable row level security;
alter table public.billing_events enable row level security;
revoke all on public.billing_settings, public.billing_events from anon, authenticated;

revoke all on function public.clarevo_access(uuid) from public, anon, authenticated;
revoke all on function public.clarevo_write_free_actions() from public, anon, authenticated;
revoke all on function public.my_access() from public, anon, authenticated;
revoke all on function public.billing_apply(text, text, uuid, text, text, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.clarevo_staff_set_billing_start(timestamptz) from public, anon, authenticated;
revoke all on function public.clarevo_staff_grant_courtesy(text, text, timestamptz) from public, anon, authenticated;
do $$
declare
  f text;
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'revoke all on public.billing_settings, public.billing_events from service_role';
    foreach f in array array['clarevo_access(uuid)', 'clarevo_write_free_actions()', 'my_access()',
                             'clarevo_staff_set_billing_start(timestamptz)', 'clarevo_staff_grant_courtesy(text, text, timestamptz)'] loop
      execute format('revoke all on function public.%s from service_role', f);
    end loop;
    execute 'grant execute on function public.billing_apply(text, text, uuid, text, text, timestamptz, timestamptz) to service_role';
  end if;
end $$;

grant execute on function public.my_access() to authenticated;
