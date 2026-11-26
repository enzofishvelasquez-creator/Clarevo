-- Clarevo · migração 0047 · Plano anual (D-125 e D-127). Depois de 20261126000001_negocio_equipe.sql.
-- Decisão do Enzo (D-125, item 2): o plano anual entra no lançamento, Individual por R$ 269,90 por ano e Família por R$ 629,90 por ano
-- (até 6 pessoas, como o Família mensal), com os mesmos 14 dias grátis sem cartão e, depois, só ver e exportar. Os meios de pagamento
-- são os mesmos do mensal: nas lojas (RevenueCat, D-090), produtos anuais; na web (Asaas, D-084), a assinatura no cartão com o ciclo
-- anual e o Pix de um ano, que vale 12 meses (D-093). A compra continua fechada (SUBSCRIBE_OPEN): nada novo é vendido até o Enzo abrir.
--
-- O que muda no banco:
--   1. O período ('mensal' ou 'anual') guardado em três tabelas, sempre com 'mensal' como padrão: plan_entitlements.period (a
--      assinatura em vigor, para o app mostrar "Plano Individual anual"), billing_checkouts.period (o Checkout aberto, para o aviso do
--      Asaas achar o período quando a cobrança chega sem a referência da Clarevo) e billing_pix_payments.period (cada pagamento por Pix
--      vale um mês ou 12 meses). Tudo o que já existe fica 'mensal', que é o que era.
--   2. billing_apply ganha p_period (padrão 'mensal'), gravado junto com o plano a cada aviso aplicado (a troca entre mensal e anual
--      atualiza a mesma linha, como a troca de plano). As funções do servidor só mandam o período quando é anual: com o banco de antes
--      desta migração elas continuam funcionando, e sem o período o banco grava 'mensal'.
--   3. billing_checkout_record ganha p_period (padrão 'mensal'); billing_checkout_person, billing_pix_person e
--      billing_person_by_external_ref passam a devolver o período junto com a pessoa e o plano.
--   4. billing_pix_apply ganha p_period (padrão 'mensal'): cada pagamento conta 1 mês ou 12 meses na mesma sequência de antes (pago
--      antes do fim do período pago ou nos 3 dias de tolerância, continua; depois, começa outra no dia do pagamento); o período de um
--      pagamento não muda depois de gravado, como o plano. O direito por Pix guarda o período do último pagamento da sequência (é ele
--      que define quando o próximo pode ser pago: nos últimos 10 dias do mês pago ou nos últimos 30 do ano pago, na função do servidor).
--   5. clarevo_access (e com ela my_access) devolve também 'period': o da assinatura em vigor (cartão, lojas ou Pix); nulo nas outras
--      situações. A resposta só ganha uma chave: o app publicado ignora o que não conhece.
-- Nenhuma ação nova em record_operations, nenhuma função nova para o app (130 continuam), nenhum dado muda de valor. As três funções
-- com o parâmetro novo saem com a assinatura antiga e voltam com a nova (para a chamada da função do servidor, por nome, não ficar
-- ambígua); a chamada sem o período continua valendo. Aplicar no SQL Editor depois da 0046 (docs/05, passo 12an) e recarregar o esquema
-- da API. Testes em supabase/tests/99zzzzzzzzzzzzzzzzzzzzzzzzzz_plano_anual.sql.

-- ---------------------------------------------------------------------------
-- 1. O período nas tabelas (tudo o que já existe é mensal)
-- ---------------------------------------------------------------------------
alter table public.plan_entitlements add column period text not null default 'mensal';
alter table public.plan_entitlements add constraint plan_entitlements_period_check check (period in ('mensal', 'anual'));
comment on column public.plan_entitlements.period is
  'Período da assinatura (D-127): mensal ou anual. Gravado por billing_apply e billing_pix_apply; nas outras origens (benefício, '
  'cortesia) fica mensal e não é mostrado.';
alter table public.billing_checkouts add column period text not null default 'mensal';
alter table public.billing_checkouts add constraint billing_checkouts_period_check check (period in ('mensal', 'anual'));
comment on column public.billing_checkouts.period is 'Período do Checkout do Asaas (D-127): mensal ou anual.';
alter table public.billing_pix_payments add column period text not null default 'mensal';
alter table public.billing_pix_payments add constraint billing_pix_payments_period_check check (period in ('mensal', 'anual'));
comment on column public.billing_pix_payments.period is
  'Período pago com Pix (D-127): mensal (vale 1 mês) ou anual (vale 12 meses). Não muda depois de gravado.';

-- ---------------------------------------------------------------------------
-- 2. billing_apply com o período
-- ---------------------------------------------------------------------------
drop function public.billing_apply(text, text, uuid, text, text, timestamptz, timestamptz);

-- Servidor (A3 da 0023): aplicar um aviso de pagamento. Igual à de antes, com o período (p_period, padrão 'mensal') gravado junto com o
-- plano. Ordem: aviso_invalido; trava da assinatura; repetido; sem_pessoa; assinatura_de_outra_pessoa; antigo; aplicado.
create or replace function public.billing_apply(
  p_event_id text, p_provider text, p_person uuid, p_external_ref text, p_plan text, p_valid_until timestamptz, p_event_at timestamptz,
  p_period text default 'mensal'
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
     or p_period is null or p_period not in ('mensal', 'anual')
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
    insert into public.plan_entitlements (person_id, source, plan, period, valid_from, valid_until, provider, external_ref, last_event_at)
    values (p_person, 'particular', p_plan, p_period, now(), p_valid_until, p_provider, p_external_ref, p_event_at);
  else
    update public.plan_entitlements
       set plan = p_plan, period = p_period, valid_until = p_valid_until, last_event_at = p_event_at
     where id = v_id;
  end if;
  return jsonb_build_object('result', 'aplicado', 'access', public.clarevo_access(p_person));
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. O Checkout com o período, e a pessoa com o período
-- ---------------------------------------------------------------------------
drop function public.billing_checkout_record(text, uuid, text);

-- Igual à da 0026, com o período do Checkout (p_period, padrão 'mensal').
create or replace function public.billing_checkout_record(p_checkout_hash text, p_person uuid, p_plan text, p_period text default 'mensal')
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if p_checkout_hash is null or p_checkout_hash !~ '^[0-9a-f]{64}$' or p_plan is null or p_plan not in ('individual', 'familiar')
     or p_period is null or p_period not in ('mensal', 'anual') then
    raise exception 'checkout_invalido' using errcode = '22023';
  end if;
  if p_person is null or not exists (select 1 from public.persons p where p.id = p_person and p.deleted_at is null) then
    return jsonb_build_object('result', 'sem_pessoa');
  end if;
  perform pg_advisory_xact_lock(hashtext('billing_checkout:' || p_person::text));
  if (select count(*) from public.billing_checkouts c where c.person_id = p_person and c.created_at > now() - interval '1 hour') >= 5 then
    return jsonb_build_object('result', 'muitas_tentativas');
  end if;
  delete from public.billing_checkouts where created_at < now() - interval '90 days';
  insert into public.billing_checkouts (checkout_hash, person_id, plan, period) values (p_checkout_hash, p_person, p_plan, p_period)
  on conflict (checkout_hash) do update set person_id = excluded.person_id, plan = excluded.plan, period = excluded.period;
  return jsonb_build_object('result', 'gravado');
end;
$$;

-- A pessoa, o plano e o período de um Checkout (o aviso que chega sem a referência). null quando não há.
create or replace function public.billing_checkout_person(p_checkout_hash text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('person_id', c.person_id, 'plan', c.plan, 'period', c.period)
    from public.billing_checkouts c
    join public.persons p on p.id = c.person_id and p.deleted_at is null
   where c.checkout_hash = p_checkout_hash
$$;

-- A pessoa, o plano e o período de uma assinatura já aplicada (pelo resumo do identificador). null quando não há.
create or replace function public.billing_person_by_external_ref(p_provider text, p_external_ref text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('person_id', e.person_id, 'plan', e.plan, 'period', e.period)
    from public.plan_entitlements e
    join public.persons p on p.id = e.person_id and p.deleted_at is null
   where e.provider = p_provider and e.external_ref = p_external_ref
   order by e.valid_until desc nulls first
   limit 1
$$;

-- A pessoa, o plano e o período de um pagamento por Pix já gravado. null quando não há.
create or replace function public.billing_pix_person(p_payment_hash text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('person_id', b.person_id, 'plan', b.plan, 'period', b.period)
    from public.billing_pix_payments b
    join public.persons p on p.id = b.person_id and p.deleted_at is null
   where b.payment_hash = p_payment_hash
$$;

-- ---------------------------------------------------------------------------
-- 4. billing_pix_apply com o período: cada pagamento vale 1 mês ou 12 meses
-- ---------------------------------------------------------------------------
drop function public.billing_pix_apply(text, uuid, text, text, date, timestamptz);

-- Igual à da 0034 (a pessoa travada antes de gravar), com o período de cada pagamento. Ordem: aviso_invalido; repetido; sem_pessoa; trava
-- da pessoa; pagamento_de_outra_pessoa; aplicado. Retorno: {result, paid_through?, access?}. paid_through é o último dia do período pago
-- (sem a tolerância), nulo sem pagamento.
create or replace function public.billing_pix_apply(
  p_event_id text, p_person uuid, p_plan text, p_payment_hash text, p_paid_on date, p_event_at timestamptz, p_period text default 'mensal'
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_anchor date;
  v_months int := 0;
  v_end date;
  v_last_period text;
  v_ref text;
  v_until timestamptz;
  v_id uuid;
  r record;
begin
  if p_event_id is null or char_length(p_event_id) not between 1 and 200 or p_payment_hash is null or p_payment_hash !~ '^[0-9a-f]{64}$'
     or p_plan is null or p_plan not in ('individual', 'familiar') or p_period is null or p_period not in ('mensal', 'anual')
     or p_event_at is null or p_event_at > now() + interval '1 day'
     or (p_paid_on is not null and (p_paid_on < date '2026-01-01' or p_paid_on > (now() at time zone 'America/Sao_Paulo')::date + 1)) then
    raise exception 'aviso_invalido' using errcode = '22023';
  end if;
  if exists (select 1 from public.billing_events where event_id = p_event_id) then
    return jsonb_build_object('result', 'repetido');
  end if;
  -- A pessoa viva, com a trava da linha (for key share): um aviso que chega durante a exclusão da conta espera a exclusão e, depois
  -- dela, não acha a pessoa.
  if p_person is not null then
    perform 1 from public.persons p where p.id = p_person and p.deleted_at is null for key share;
  end if;
  if p_person is null or not found then
    return jsonb_build_object('result', 'sem_pessoa');
  end if;
  perform pg_advisory_xact_lock(hashtext('billing_pix:' || p_person::text));
  if exists (select 1 from public.billing_events where event_id = p_event_id) then
    return jsonb_build_object('result', 'repetido');
  end if;
  select b.person_id into v_owner from public.billing_pix_payments b where b.payment_hash = p_payment_hash for update;
  if v_owner is not null and v_owner <> p_person then
    raise exception 'pagamento_de_outra_pessoa' using errcode = '22023';
  end if;
  insert into public.billing_events (event_id, provider) values (p_event_id, 'pix');
  -- O plano e o período de um pagamento não mudam (são os do Checkout); só a situação (pago, estornado) e o dia.
  insert into public.billing_pix_payments (payment_hash, person_id, plan, period, paid_on)
  values (p_payment_hash, p_person, p_plan, p_period, p_paid_on)
  on conflict (payment_hash) do update set paid_on = excluded.paid_on, updated_at = now();
  select b.plan into p_plan from public.billing_pix_payments b where b.payment_hash = p_payment_hash;

  -- Cada pagamento vale 1 mês (mensal) ou 12 meses (anual). Pago até 3 dias depois do fim do período já pago, continua a sequência;
  -- depois, começa outra no dia pago. O fim de uma sequência é o início dela mais a soma dos meses (sem perder dias no fim do mês).
  for r in
    select b.paid_on, b.period from public.billing_pix_payments b
     where b.person_id = p_person and b.plan = p_plan and b.paid_on is not null
     order by b.paid_on, b.payment_hash
  loop
    if v_end is null or r.paid_on > v_end + 3 then
      v_anchor := r.paid_on;
      v_months := case r.period when 'anual' then 12 else 1 end;
    else
      v_months := v_months + case r.period when 'anual' then 12 else 1 end;
    end if;
    v_end := (v_anchor + make_interval(months => v_months))::date;
    v_last_period := r.period;
  end loop;

  v_ref := encode(sha256(convert_to('pix:' || p_person::text || ':' || p_plan, 'UTF8')), 'hex');
  -- Até o fim do dia (Brasília) do último dia pago mais 3 dias de tolerância; sem pagamento, acaba agora.
  v_until := case when v_end is null then now()
                  else ((v_end + 4)::timestamp at time zone 'America/Sao_Paulo') - interval '1 millisecond' end;
  select e.id into v_id from public.plan_entitlements e where e.provider = 'pix' and e.external_ref = v_ref for update;
  if v_id is null then
    if v_end is not null then
      insert into public.plan_entitlements (person_id, source, plan, period, valid_from, valid_until, provider, external_ref, last_event_at)
      values (p_person, 'particular', p_plan, v_last_period, now(), v_until, 'pix', v_ref, p_event_at);
    end if;
  else
    -- Sem pagamento valendo, o período fica como estava (o direito acaba agora de qualquer forma).
    update public.plan_entitlements
       set valid_until = v_until, period = coalesce(v_last_period, period),
           last_event_at = greatest(coalesce(last_event_at, p_event_at), p_event_at)
     where id = v_id;
  end if;
  return jsonb_build_object('result', 'aplicado', 'paid_through', v_end, 'access', public.clarevo_access(p_person));
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. O acesso com o período da assinatura
-- ---------------------------------------------------------------------------
-- Igual à da 0033 (o Pix depois do benefício, da cortesia e do Plano Família), com a chave 'period': o da assinatura em vigor (cartão,
-- lojas ou Pix); nulo no benefício, na cortesia, no Plano Família de outra pessoa, antes do início da cobrança, no teste e em só leitura.
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
  v_period text;
  v_until timestamptz;
  v_provider text;
  v_from timestamptz;
  v_created timestamptz;
  v_trial timestamptz;
begin
  -- O direito da própria pessoa, menos o período pago com Pix: assinatura (cartão ou lojas), benefício ou cortesia.
  select e.source, e.plan, e.period, e.valid_until, e.provider into v_source, v_plan, v_period, v_until, v_provider
    from public.plan_entitlements e
   where e.person_id = p_person and e.valid_from <= v_now and (e.valid_until is null or e.valid_until > v_now)
     and e.provider is distinct from 'pix'
   order by case e.source when 'particular' then 0 when 'beneficio' then 1 else 2 end, e.valid_until desc nulls first
   limit 1;
  if found then
    return jsonb_build_object('status', case v_source when 'particular' then 'assinatura' when 'beneficio' then 'beneficio' else 'cortesia' end,
                              'plan', v_plan, 'until', v_until, 'can_write', true, 'provider', v_provider,
                              'period', case when v_source = 'particular' then v_period end);
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
    return jsonb_build_object('status', 'familia', 'plan', 'familiar', 'until', v_until, 'can_write', true, 'provider', null, 'period', null);
  end if;

  -- O período pago com Pix (D-093 e D-127): depois de tudo o que cobre a pessoa sem pagar.
  select e.plan, e.period, e.valid_until into v_plan, v_period, v_until
    from public.plan_entitlements e
   where e.person_id = p_person and e.provider = 'pix' and e.valid_from <= v_now and e.valid_until > v_now
   order by e.valid_until desc
   limit 1;
  if found then
    return jsonb_build_object('status', 'assinatura', 'plan', v_plan, 'until', v_until, 'can_write', true, 'provider', 'pix', 'period', v_period);
  end if;

  select s.enforced_from into v_from from public.billing_settings s where s.id;
  if v_from is null or v_now < v_from then
    return jsonb_build_object('status', 'pre_lancamento', 'plan', null, 'until', v_from, 'can_write', true, 'provider', null, 'period', null);
  end if;
  select p.created_at into v_created from public.persons p where p.id = p_person;
  v_trial := greatest(coalesce(v_created, v_now), v_from) + interval '14 days';
  if v_now < v_trial then
    return jsonb_build_object('status', 'teste', 'plan', null, 'until', v_trial, 'can_write', true, 'provider', null, 'period', null);
  end if;
  return jsonb_build_object('status', 'leitura', 'plan', null, 'until', v_trial, 'can_write', false, 'provider', null, 'period', null);
end;
$$;

-- ---------------------------------------------------------------------------
-- Privilégios: as funções novas como as de antes. O app não executa nenhuma delas (my_access continua a única do app, sem mudança);
-- só a chave de serviço (a função do servidor) usa as do servidor; clarevo_access é interna.
-- ---------------------------------------------------------------------------
revoke all on function public.billing_apply(text, text, uuid, text, text, timestamptz, timestamptz, text) from public, anon, authenticated;
revoke all on function public.billing_checkout_record(text, uuid, text, text) from public, anon, authenticated;
revoke all on function public.billing_checkout_person(text) from public, anon, authenticated;
revoke all on function public.billing_person_by_external_ref(text, text) from public, anon, authenticated;
revoke all on function public.billing_pix_person(text) from public, anon, authenticated;
revoke all on function public.billing_pix_apply(text, uuid, text, text, date, timestamptz, text) from public, anon, authenticated;
revoke all on function public.clarevo_access(uuid) from public, anon, authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'revoke all on function public.clarevo_access(uuid) from service_role';
    execute 'grant execute on function public.billing_apply(text, text, uuid, text, text, timestamptz, timestamptz, text) to service_role';
    execute 'grant execute on function public.billing_checkout_record(text, uuid, text, text) to service_role';
    execute 'grant execute on function public.billing_checkout_person(text) to service_role';
    execute 'grant execute on function public.billing_person_by_external_ref(text, text) to service_role';
    execute 'grant execute on function public.billing_pix_person(text) to service_role';
    execute 'grant execute on function public.billing_pix_apply(text, uuid, text, text, date, timestamptz, text) to service_role';
  end if;
end $$;
