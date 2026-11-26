-- Clarevo · migração 0048 · Assinar na web durante o teste grátis (D-129). Depois de 20261127000001_plano_anual.sql.
-- Decisão do Enzo (26/11/2026): na web, quem assina durante os 14 dias grátis não perde os dias que faltam. A primeira cobrança e o período
-- pago começam quando o teste acaba. Nas lojas nada muda (os produtos não têm oferta de teste; a tela das lojas diz que a cobrança é no dia
-- da compra).
--
-- O que muda no banco:
--   1. Cartão (assinatura do Asaas): a função do servidor cria o Checkout com a primeira cobrança no dia do fim do teste (lido em my_access,
--      com a sessão da pessoa). Até essa cobrança ser paga, não há período pago; para não haver buraco entre o fim do teste e a confirmação
--      do cartão, a função manda o direito valendo só do começo do dia da primeira cobrança (Brasília) até o fim dele mais a tolerância de
--      3 dias. billing_apply ganha p_valid_from (padrão nulo: o agora, como antes, no direito novo; o que já estava, no direito que existe),
--      só aceito na web, nunca depois do fim do direito nem a mais de 31 dias. Antes desse dia, clarevo_access continua dizendo "teste" (o
--      direito ainda não começou: valid_from > agora). Cancelada antes da primeira cobrança, o direito acaba na hora (valid_until = agora),
--      nada é cobrado e o acesso acaba com o teste.
--   2. Pix: billing_pix_payments ganha starts_on, o dia em que o período daquele pagamento começa quando ele foi pago no teste grátis (o
--      dia, em Brasília, do fim do teste, pelo mesmo clarevo_access de my_access); nulo, o dia do pagamento (como antes). É gravado uma vez,
--      quando o pagamento aparece pago pela primeira vez, e não muda depois (um estorno seguido de nova confirmação mantém o dia). A
--      sequência dos períodos pagos (billing_pix_apply) passa a contar do maior entre o dia pago e starts_on: pago no 3º dia do teste, o
--      mês vai do fim do teste até um mês depois (ou 12 meses, no anual). O direito por Pix vale desde o pagamento (a pessoa vê "Pago com
--      Pix até ..." e não paga de novo sem querer), até o fim do período que começa no fim do teste.
-- Compatível com o app publicado (nada muda na resposta de my_access) e com a função assinatura-web publicada antes desta migração: ela não
-- manda p_valid_from (o padrão nulo é o comportamento de antes) e chama billing_pix_apply com a mesma assinatura (o Pix pago no teste já
-- passa a começar no fim do teste). A função nova só manda p_valid_from na assinatura marcada para o fim do teste: publicar a função DEPOIS
-- de aplicar esta migração (docs/05, passo 12ao). Nenhuma ação nova em record_operations, nenhuma função nova para o app (130 continuam).
-- billing_apply sai com a assinatura antiga e volta com a nova (para a chamada por nome, da função do servidor, não ficar ambígua); a
-- chamada sem p_valid_from continua valendo. Aplicar no SQL Editor depois da 0047 e recarregar o esquema da API. Testes em
-- supabase/tests/99zzzzzzzzzzzzzzzzzzzzzzzzzzz_assinar_no_teste.sql.

-- ---------------------------------------------------------------------------
-- 1. O dia em que começa o período de um pagamento por Pix feito no teste grátis
-- ---------------------------------------------------------------------------
alter table public.billing_pix_payments add column starts_on date;
comment on column public.billing_pix_payments.starts_on is
  'Dia (Brasília) em que começa o período pago deste pagamento quando ele foi pago no teste grátis (D-129): o fim do teste. Nulo: o dia '
  'do pagamento. Gravado por billing_pix_apply na primeira vez que o pagamento aparece pago; não muda depois.';

-- ---------------------------------------------------------------------------
-- 2. billing_apply com o começo do direito (a assinatura no cartão marcada para o fim do teste)
-- ---------------------------------------------------------------------------
drop function public.billing_apply(text, text, uuid, text, text, timestamptz, timestamptz, text);

-- Servidor (A3 da 0023): aplicar um aviso de pagamento. Igual à da 0047, com o começo do direito (p_valid_from, padrão nulo): no direito
-- novo, o agora quando nulo; no que existe, muda só quando vem. Ordem: aviso_invalido; trava da assinatura; repetido; sem_pessoa;
-- assinatura_de_outra_pessoa; antigo; aplicado.
create or replace function public.billing_apply(
  p_event_id text, p_provider text, p_person uuid, p_external_ref text, p_plan text, p_valid_until timestamptz, p_event_at timestamptz,
  p_period text default 'mensal', p_valid_from timestamptz default null
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
     or p_valid_until is null or p_event_at is null or p_event_at > now() + interval '1 day'
     or (p_valid_from is not null and (p_provider <> 'web' or p_valid_from > p_valid_until or p_valid_from > now() + interval '31 days')) then
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
    values (p_person, 'particular', p_plan, p_period, coalesce(p_valid_from, now()), p_valid_until, p_provider, p_external_ref, p_event_at);
  else
    update public.plan_entitlements
       set plan = p_plan, period = p_period, valid_until = p_valid_until, valid_from = coalesce(p_valid_from, valid_from), last_event_at = p_event_at
     where id = v_id;
  end if;
  return jsonb_build_object('result', 'aplicado', 'access', public.clarevo_access(p_person));
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. billing_pix_apply: o pagamento feito no teste grátis começa no fim do teste
-- ---------------------------------------------------------------------------
-- Igual à da 0047 (mesma assinatura), com starts_on. Ordem: aviso_invalido; repetido; sem_pessoa; trava da pessoa; pagamento_de_outra_pessoa;
-- aplicado. Retorno: {result, paid_through?, access?}. paid_through é o último dia do período pago (sem a tolerância), nulo sem pagamento.
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
  v_prev_paid date;
  v_prev_start date;
  v_access jsonb;
  v_trial_day date;
  v_start date;
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
  select b.person_id, b.paid_on, b.starts_on into v_owner, v_prev_paid, v_prev_start
    from public.billing_pix_payments b where b.payment_hash = p_payment_hash for update;
  if v_owner is not null and v_owner <> p_person then
    raise exception 'pagamento_de_outra_pessoa' using errcode = '22023';
  end if;
  insert into public.billing_events (event_id, provider) values (p_event_id, 'pix');
  -- D-129: na primeira vez que o pagamento aparece pago, se a pessoa está no teste grátis (o mesmo acesso de my_access), o período dele
  -- começa no dia (Brasília) do fim do teste, quando esse dia vem depois do dia pago.
  if p_paid_on is not null and v_prev_paid is null and v_prev_start is null then
    v_access := public.clarevo_access(p_person);
    if v_access ->> 'status' = 'teste' and v_access ->> 'until' is not null then
      v_trial_day := ((v_access ->> 'until')::timestamptz at time zone 'America/Sao_Paulo')::date;
      if v_trial_day > p_paid_on then
        v_start := v_trial_day;
      end if;
    end if;
  end if;
  -- O plano e o período de um pagamento não mudam (são os do Checkout), nem o dia em que ele começa; só a situação (pago, estornado) e o dia.
  insert into public.billing_pix_payments (payment_hash, person_id, plan, period, paid_on, starts_on)
  values (p_payment_hash, p_person, p_plan, p_period, p_paid_on, v_start)
  on conflict (payment_hash) do update
    set paid_on = excluded.paid_on, starts_on = coalesce(public.billing_pix_payments.starts_on, excluded.starts_on), updated_at = now();
  select b.plan into p_plan from public.billing_pix_payments b where b.payment_hash = p_payment_hash;

  -- Cada pagamento vale 1 mês (mensal) ou 12 meses (anual), a partir do dia em que começa (o dia pago ou, se foi pago no teste grátis, o fim
  -- do teste). Começando até 3 dias depois do fim do período já pago, continua a sequência; depois, começa outra nesse dia. O fim de uma
  -- sequência é o início dela mais a soma dos meses (sem perder dias no fim do mês).
  for r in
    select greatest(b.paid_on, coalesce(b.starts_on, b.paid_on)) as day, b.period from public.billing_pix_payments b
     where b.person_id = p_person and b.plan = p_plan and b.paid_on is not null
     order by 1, b.payment_hash
  loop
    if v_end is null or r.day > v_end + 3 then
      v_anchor := r.day;
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
-- Privilégios: as duas funções como antes. O app não executa nenhuma delas; só a chave de serviço (a função do servidor).
-- ---------------------------------------------------------------------------
revoke all on function public.billing_apply(text, text, uuid, text, text, timestamptz, timestamptz, text, timestamptz) from public, anon, authenticated;
revoke all on function public.billing_pix_apply(text, uuid, text, text, date, timestamptz, text) from public, anon, authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.billing_apply(text, text, uuid, text, text, timestamptz, timestamptz, text, timestamptz) to service_role';
    execute 'grant execute on function public.billing_pix_apply(text, uuid, text, text, date, timestamptz, text) to service_role';
  end if;
end $$;
