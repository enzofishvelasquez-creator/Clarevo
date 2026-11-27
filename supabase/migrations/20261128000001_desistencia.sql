-- Clarevo · migração 0050 · Desistência em 7 dias pela tela Assinatura, na web (direito de arrependimento, CDC art. 49; D-131, item F).
-- Depois de 20261127000003_telegram_negocio.sql.
-- Decisão do Enzo (27/11/2026, D-131, item F): "desistência em 7 dias por um botão na tela Assinatura, preparado desligado e ligado com o
-- texto do advogado" (pergunta 64 do resumo para o advogado, seção m). O botão fica desligado no núcleo (WITHDRAWAL_OPEN) até o advogado
-- aprovar o texto; esta migração só prepara o registro e não muda nada para ninguém.
--
-- O que entra:
--   1. billing_withdrawals: cada pedido de desistência (a manifestação de arrependimento, com a hora em que chegou, que a tela confirma na
--      hora, Decreto 7.962/2013, art. 5º, § 4º): a pessoa, de onde veio a compra (web: a assinatura no cartão; pix: um pagamento por Pix), o
--      resumo SHA-256 do identificador da compra no Asaas (o da assinatura ou o da cobrança, os mesmos de plan_entitlements.external_ref e
--      billing_pix_payments.payment_hash), o plano, o período, o valor devolvido, o dia de onde o prazo contou, a situação (pedida, devolvida
--      ou abandonada), as tentativas, uma trava de tentativa em andamento, a hora do encerramento e, só quando a equipe encerra, uma nota
--      curta. Uma linha por compra (unique): dois toques, duas abas ou uma repetição nunca devolvem duas vezes. Nenhum dado do pagamento, do
--      cartão ou do Asaas. Fica enquanto a conta existir (é o registro de que o pedido chegou no prazo) e some com ela: em cascata e, no ramo
--      anônimo da exclusão, pelo gatilho persons_forget_anonymous.
--      Por que uma tabela nova, e não billing_events: billing_events guarda só o identificador de um aviso já aplicado (sem a pessoa, sem a
--      hora do pedido, sem situação), e o pedido de desistência precisa da pessoa, da hora (a prova do prazo e a confirmação), da compra, de uma
--      situação que muda (pedida, devolvida) e da trava de uma tentativa em andamento.
--   2. As funções da função do servidor assinatura-web, só com a chave de serviço (security definer):
--      billing_withdrawal_options(p_person): as compras da pessoa que podem estar no prazo, pelo que o banco sabe (as assinaturas no cartão com
--        o direito começando nos últimos 15 dias e os pagamentos por Pix com o dia que conta nos últimos 8 dias) e, sempre, qualquer que seja a
--        idade, as compras com um pedido ainda 'pedida' (o pedido feito no prazo continua depois dele, inclusive o Pix já devolvido, sem o dia
--        pago); cada uma com o acesso que fica depois da desistência (a mesma conta de billing_apply e billing_pix_apply, feita numa
--        subtransação desfeita, clarevo_withdrawal_access_after); e os pedidos 'pedida' e os dos últimos 60 dias. A função do servidor confere
--        cada compra no Asaas antes de oferecer a desistência;
--      billing_withdrawal_begin(...): confere que a compra é da pessoa (pelo resumo gravado pelos avisos do Asaas) e que o pedido novo está no
--        prazo (no Pix, pelo dia que o próprio banco guarda), grava o pedido (ou retoma o que ficou pela metade, mesmo depois do prazo) e trava
--        a tentativa por 30 segundos; um pedido já devolvido responde 'concluida', um abandonado pela equipe, 'encerrada', e uma tentativa em
--        andamento, 'em_andamento';
--      billing_withdrawal_finish(...): marca a devolução feita (pela função do servidor ou pelo aviso de estorno do Asaas, que fecha também a
--        devolução feita pela equipe no painel) ou solta a trava; se o pedido de devolução ao Asaas ficou sem resposta clara, a trava fica por
--        5 minutos (p_unclear), e a próxima tentativa relê a cobrança antes de pedir de novo.
--   3. clarevo_staff_close_withdrawal(p_id, p_outcome, p_note): a equipe, no SQL Editor, encerra um pedido 'pedida' como devolvido ou
--      abandonado, com uma nota curta (sem dado pessoal). Ninguém de fora executa (nem o app nem a chave de serviço).
--   4. clarevo_forget_anonymous apaga também os pedidos de desistência da pessoa que fica anônima.
-- O período pago continua saindo pelo aviso de estorno do Asaas (billing_apply e billing_pix_apply, sem mudança): a conta volta ao teste
-- grátis, se ainda houver dias dele, ou fica só para ver e exportar. Compatível com o app publicado e com a assinatura-web publicada (nenhum
-- dos dois usa o que é novo; nenhuma função existente muda de assinatura nem de resposta). Nenhuma função nova para o app (130 continuam),
-- nenhuma ação nova em record_operations (105). Aplicar no SQL Editor depois da 0049 e recarregar o esquema da API (docs/05, passo 12aq,
-- conferência 21al). Testes em supabase/tests/99zzzzzzzzzzzzzzzzzzzzzzzzzzzzz_desistencia.sql.

-- ---------------------------------------------------------------------------
-- 1. Os pedidos de desistência
-- ---------------------------------------------------------------------------
create table public.billing_withdrawals (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.persons (id) on delete cascade,
  provider text not null check (provider in ('web', 'pix')),
  purchase_hash text not null check (purchase_hash ~ '^[0-9a-f]{64}$'),
  plan text not null check (plan in ('individual', 'familiar')),
  period text not null default 'mensal' check (period in ('mensal', 'anual')),
  amount_cents bigint not null check (amount_cents between 1 and 10000000),
  contracted_on date not null,
  requested_at timestamptz not null default now(),
  status text not null default 'pedida' check (status in ('pedida', 'devolvida', 'abandonada')),
  refunded_at timestamptz,
  attempts integer not null default 1 check (attempts between 1 and 1000),
  claimed_until timestamptz,
  closed_at timestamptz,
  staff_note text check (staff_note is null or char_length(btrim(staff_note)) between 1 and 300),
  constraint billing_withdrawals_one_per_purchase unique (provider, purchase_hash),
  constraint billing_withdrawals_refunded check ((status = 'devolvida') = (refunded_at is not null)),
  constraint billing_withdrawals_closed check ((status = 'pedida') = (closed_at is null)),
  constraint billing_withdrawals_abandoned check (status <> 'abandonada' or staff_note is not null)
);
create index billing_withdrawals_person_idx on public.billing_withdrawals (person_id, requested_at desc);
comment on table public.billing_withdrawals is
  'Pedidos de desistência em 7 dias pela web (CDC art. 49; D-131, item F; 0050): um por compra (o resumo SHA-256 da assinatura ou da cobrança '
  'no Asaas), com a pessoa, o plano, o período, o valor, o dia de onde o prazo contou, a hora do pedido, a situação (pedida, devolvida ou '
  'abandonada) e, quando a equipe encerra, uma nota curta. Nenhum dado do pagamento. Escrita e leitura só pelas funções billing_withdrawal_*, '
  'com a chave de serviço, e por clarevo_staff_close_withdrawal, no SQL Editor; ninguém lê pela API. Some com a conta.';

-- O acesso que fica depois da desistência de uma compra: a mesma conta que o aviso de estorno do Asaas faz (billing_apply com o fim do
-- direito no agora, na assinatura do cartão; billing_pix_apply sem o dia pago, no Pix), numa subtransação que é desfeita no fim (nada fica
-- gravado: nem o direito, nem o pagamento, nem o aviso). Devolve o clarevo_access de depois, ou null se não deu para calcular. Interna.
create or replace function public.clarevo_withdrawal_access_after(p_person uuid, p_provider text, p_purchase_hash text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_after jsonb;
  v_plan text;
  v_period text;
  v_last timestamptz;
begin
  begin
    if p_provider = 'web' then
      select e.plan, e.period, e.last_event_at into v_plan, v_period, v_last
        from public.plan_entitlements e where e.provider = 'web' and e.external_ref = p_purchase_hash and e.person_id = p_person;
      if found then
        v_after := public.billing_apply('desistencia-previa:' || gen_random_uuid()::text, 'web', p_person, p_purchase_hash, v_plan, now(),
                                        greatest(now(), coalesce(v_last, now())), v_period) -> 'access';
      end if;
    elsif p_provider = 'pix' then
      select b.plan, b.period into v_plan, v_period
        from public.billing_pix_payments b where b.payment_hash = p_purchase_hash and b.person_id = p_person;
      if found then
        v_after := public.billing_pix_apply('desistencia-previa:' || gen_random_uuid()::text, p_person, v_plan, p_purchase_hash, null, now(), v_period) -> 'access';
      end if;
    end if;
    raise exception 'previa_desfeita' using errcode = 'P0001';
  exception when others then
    -- A subtransação é desfeita aqui (a de propósito e qualquer recusa); o valor calculado fica na variável.
    null;
  end;
  return v_after;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. As funções da função do servidor (só a chave de serviço)
-- ---------------------------------------------------------------------------
-- As compras da pessoa que podem estar no prazo e os pedidos. Pessoa inexistente ou excluída: sem_pessoa. Retorno:
-- {result: 'ok', web: [{external_ref, plan, period, access_after}], pix: [{payment_hash, plan, period, paid_on, starts_on, access_after}],
--  withdrawals: [{provider, purchase_hash, status, requested_at, refunded_at, amount_cents, contracted_on}]}.
-- Uma compra com pedido 'pedida' entra sempre, qualquer que seja a idade, e vem primeiro: o pedido feito no prazo continua depois dele (o
-- estorno que ficou sem resposta no 7º dia é concluído na manhã seguinte). No Pix já devolvido pelo aviso de estorno (sem o dia pago), o dia
-- de onde o prazo contou fica no pedido (contracted_on). Até 10 compras de cada meio (vários assina e cancela em 15 dias não empurram a
-- compra certa para fora) e até 20 pedidos (todos os 'pedida' e os dos últimos 60 dias).
create or replace function public.billing_withdrawal_options(p_person uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_web jsonb := '[]'::jsonb;
  v_pix jsonb := '[]'::jsonb;
  v_done jsonb;
  r record;
begin
  if p_person is null or not exists (select 1 from public.persons p where p.id = p_person and p.deleted_at is null) then
    return jsonb_build_object('result', 'sem_pessoa');
  end if;
  -- Cartão: o direito da assinatura começa no dia da assinatura (fora do teste) ou no da primeira cobrança (no teste, D-129); 15 dias cobrem
  -- os 7 do prazo e uma cobrança confirmada dias depois do vencimento. Quem passou disso nem chega ao Asaas, a não ser com um pedido 'pedida'.
  for r in
    select e.external_ref, e.plan, e.period
      from public.plan_entitlements e
      left join public.billing_withdrawals w
        on w.provider = 'web' and w.purchase_hash = e.external_ref and w.person_id = p_person and w.status = 'pedida'
     where e.person_id = p_person and e.provider = 'web' and e.external_ref is not null
       and (e.valid_from >= now() - interval '15 days' or w.id is not null)
     order by (w.id is not null) desc, e.valid_from desc, e.external_ref
     limit 10
  loop
    v_web := v_web || jsonb_build_array(jsonb_build_object('external_ref', r.external_ref, 'plan', r.plan, 'period', r.period,
               'access_after', public.clarevo_withdrawal_access_after(p_person, 'web', r.external_ref)));
  end loop;
  -- Pix: pago (e ainda não devolvido), com o dia que conta (o do pagamento ou, pago no teste, o do fim do teste) nos últimos 8 dias; e o que
  -- tem pedido 'pedida', mesmo já devolvido (paid_on nulo).
  for r in
    select b.payment_hash, b.plan, b.period, b.paid_on, b.starts_on
      from public.billing_pix_payments b
      left join public.billing_withdrawals w
        on w.provider = 'pix' and w.purchase_hash = b.payment_hash and w.person_id = p_person and w.status = 'pedida'
     where b.person_id = p_person
       and ((b.paid_on is not null and greatest(b.paid_on, coalesce(b.starts_on, b.paid_on)) >= v_today - 8) or w.id is not null)
     order by (w.id is not null) desc, greatest(b.paid_on, coalesce(b.starts_on, b.paid_on)) desc nulls last, b.payment_hash
     limit 10
  loop
    v_pix := v_pix || jsonb_build_array(jsonb_build_object('payment_hash', r.payment_hash, 'plan', r.plan, 'period', r.period, 'paid_on', r.paid_on,
               'starts_on', r.starts_on, 'access_after', public.clarevo_withdrawal_access_after(p_person, 'pix', r.payment_hash)));
  end loop;
  select coalesce(jsonb_agg(jsonb_build_object('provider', w.provider, 'purchase_hash', w.purchase_hash, 'status', w.status,
                                               'requested_at', w.requested_at, 'refunded_at', w.refunded_at, 'amount_cents', w.amount_cents,
                                               'contracted_on', w.contracted_on)
                            order by (w.status = 'pedida') desc, w.requested_at desc), '[]'::jsonb)
    into v_done
    from (select * from public.billing_withdrawals x
           where x.person_id = p_person and (x.status = 'pedida' or x.requested_at >= now() - interval '60 days')
           order by (x.status = 'pedida') desc, x.requested_at desc limit 20) w;
  return jsonb_build_object('result', 'ok', 'web', v_web, 'pix', v_pix, 'withdrawals', v_done);
end;
$$;

-- Grava o pedido de desistência de uma compra, ou retoma o que ficou pela metade, e trava a tentativa por 30 segundos. Ordem: pedido_invalido;
-- sem_pessoa; compra_de_outra_pessoa; trava da compra; o pedido que já existe (concluida, encerrada, em_andamento, muitas_tentativas ou
-- retomar); o pagamento por Pix sem pagamento valendo (sem_pagamento); fora_do_prazo; nova. O prazo só vale para o pedido novo: a repetição de
-- um pedido feito no prazo continua, mesmo depois dele. 'encerrada': a equipe abandonou o pedido (clarevo_staff_close_withdrawal), e a tela
-- não retoma. Retorno: {result, requested_at?, refunded_at?}.
create or replace function public.billing_withdrawal_begin(
  p_person uuid, p_provider text, p_purchase_hash text, p_plan text, p_period text, p_amount_cents bigint, p_contracted_on date
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_row public.billing_withdrawals%rowtype;
  v_start date := p_contracted_on;
  v_paid date;
  v_starts date;
begin
  if p_provider is null or p_provider not in ('web', 'pix') or p_purchase_hash is null or p_purchase_hash !~ '^[0-9a-f]{64}$'
     or p_plan is null or p_plan not in ('individual', 'familiar') or p_period is null or p_period not in ('mensal', 'anual')
     or p_amount_cents is null or p_amount_cents not between 1 and 10000000 or p_contracted_on is null then
    raise exception 'pedido_invalido' using errcode = '22023';
  end if;
  -- A pessoa viva, com a trava da linha: um pedido no meio da exclusão da conta espera a exclusão e, depois dela, não acha a pessoa.
  if p_person is not null then
    perform 1 from public.persons p where p.id = p_person and p.deleted_at is null for key share;
  end if;
  if p_person is null or not found then
    return jsonb_build_object('result', 'sem_pessoa');
  end if;
  -- A compra é da pessoa, pelo que o banco já sabe (o resumo que os avisos do Asaas gravaram).
  if p_provider = 'web' then
    if not exists (select 1 from public.plan_entitlements e where e.provider = 'web' and e.external_ref = p_purchase_hash and e.person_id = p_person) then
      raise exception 'compra_de_outra_pessoa' using errcode = '22023';
    end if;
  else
    select b.paid_on, b.starts_on into v_paid, v_starts from public.billing_pix_payments b where b.payment_hash = p_purchase_hash and b.person_id = p_person;
    if not found then
      raise exception 'compra_de_outra_pessoa' using errcode = '22023';
    end if;
  end if;
  perform pg_advisory_xact_lock(hashtext('billing_withdrawal:' || p_provider || ':' || p_purchase_hash));
  select * into v_row from public.billing_withdrawals w where w.provider = p_provider and w.purchase_hash = p_purchase_hash for update;
  if found then
    if v_row.status = 'devolvida' then
      return jsonb_build_object('result', 'concluida', 'requested_at', v_row.requested_at, 'refunded_at', v_row.refunded_at);
    end if;
    if v_row.status = 'abandonada' then
      return jsonb_build_object('result', 'encerrada', 'requested_at', v_row.requested_at);
    end if;
    if v_row.claimed_until is not null and v_row.claimed_until > now() then
      return jsonb_build_object('result', 'em_andamento', 'requested_at', v_row.requested_at);
    end if;
    if v_row.attempts >= 20 then
      return jsonb_build_object('result', 'muitas_tentativas', 'requested_at', v_row.requested_at);
    end if;
    update public.billing_withdrawals set attempts = attempts + 1, claimed_until = now() + interval '30 seconds' where id = v_row.id;
    return jsonb_build_object('result', 'retomar', 'requested_at', v_row.requested_at);
  end if;
  -- Pix: o dia que conta vem do banco (o do pagamento ou, pago no teste grátis, o do fim do teste, D-129); sem pagamento valendo (pendente ou
  -- já devolvido), nada a devolver.
  if p_provider = 'pix' then
    if v_paid is null then
      return jsonb_build_object('result', 'sem_pagamento');
    end if;
    v_start := greatest(v_paid, coalesce(v_starts, v_paid));
  end if;
  -- O prazo: até o fim do 7º dia depois do dia que conta, no fuso mais a oeste do Brasil (Acre). O dia que conta pode estar à frente (o Pix
  -- pago no teste conta do fim do teste, e desistir antes dele também vale), mas nunca a mais de 31 dias (o mesmo limite de D-129).
  if v_start < (now() at time zone 'America/Rio_Branco')::date - 7 or v_start > (now() at time zone 'America/Sao_Paulo')::date + 31 then
    return jsonb_build_object('result', 'fora_do_prazo');
  end if;
  insert into public.billing_withdrawals (person_id, provider, purchase_hash, plan, period, amount_cents, contracted_on, claimed_until)
  values (p_person, p_provider, p_purchase_hash, p_plan, p_period, p_amount_cents, v_start, now() + interval '30 seconds')
  returning * into v_row;
  return jsonb_build_object('result', 'nova', 'requested_at', v_row.requested_at);
end;
$$;

-- Depois de pedir a devolução ao Asaas, ou no aviso de estorno do Asaas: p_refunded, a devolução feita (o Asaas aceitou, já tinha devolvido ou
-- avisou o estorno, inclusive o feito pela equipe no painel; um pedido abandonado também passa a devolvido); senão, só a trava: solta na hora
-- (a falha foi antes do pedido de devolução ou foi uma recusa clara, e a próxima tentativa relê o Asaas) ou, com p_unclear (o pedido de
-- devolução ficou sem resposta clara: prazo, rede, erro do Asaas), fica por 5 minutos, para uma repetição ou outra aba não pedirem de novo
-- enquanto o Asaas pode estar devolvendo. Sem pedido da compra, nada muda ('sem_pedido'). Retorno: {result: 'devolvida' | 'pedida' |
-- 'abandonada' | 'sem_pedido', requested_at?, refunded_at?}.
create or replace function public.billing_withdrawal_finish(
  p_person uuid, p_provider text, p_purchase_hash text, p_refunded boolean, p_unclear boolean default false
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_row public.billing_withdrawals%rowtype;
begin
  if p_provider is null or p_provider not in ('web', 'pix') or p_purchase_hash is null or p_purchase_hash !~ '^[0-9a-f]{64}$' or p_refunded is null
     or p_unclear is null then
    raise exception 'pedido_invalido' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtext('billing_withdrawal:' || p_provider || ':' || p_purchase_hash));
  update public.billing_withdrawals w
     set status = case when p_refunded then 'devolvida' else w.status end,
         refunded_at = case when p_refunded then coalesce(w.refunded_at, now()) else w.refunded_at end,
         closed_at = case when p_refunded then coalesce(w.closed_at, now()) else w.closed_at end,
         claimed_until = case when p_refunded or not p_unclear then null
                              else greatest(coalesce(w.claimed_until, now()), now() + interval '5 minutes') end
   where w.provider = p_provider and w.purchase_hash = p_purchase_hash and w.person_id = p_person
  returning * into v_row;
  if not found then
    return jsonb_build_object('result', 'sem_pedido');
  end if;
  return jsonb_build_object('result', v_row.status, 'requested_at', v_row.requested_at, 'refunded_at', v_row.refunded_at);
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. A equipe (só o SQL Editor): o pedido que ficou sem devolução
-- ---------------------------------------------------------------------------
-- Equipe (só quem roda no SQL Editor; docs/39, seção 9): encerra um pedido ainda 'pedida', pelo identificador da linha, como devolvido (a
-- devolução saiu por outro caminho, conferida no painel do Asaas) ou abandonado (a pessoa desistiu do pedido, a compra está em contestação,
-- ou a equipe resolveu de outro jeito), com uma nota curta (1 a 300 caracteres, sem dado pessoal: nem nome, nem e-mail, nem CPF). O pedido
-- abandonado não volta para a tela (billing_withdrawal_begin responde 'encerrada'); um aviso de estorno do Asaas depois disso ainda o marca
-- como devolvido. Retorno: {result: 'encerrada', status, requested_at, closed_at} | {result: 'ja_encerrada', status} | {result: 'sem_pedido'}.
create or replace function public.clarevo_staff_close_withdrawal(p_id uuid, p_outcome text, p_note text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_row public.billing_withdrawals%rowtype;
begin
  if p_id is null or p_outcome is null or p_outcome not in ('devolvida', 'abandonada')
     or p_note is null or char_length(btrim(p_note)) not between 1 and 300 then
    raise exception 'pedido_invalido' using errcode = '22023';
  end if;
  select * into v_row from public.billing_withdrawals w where w.id = p_id;
  if not found then
    return jsonb_build_object('result', 'sem_pedido');
  end if;
  perform pg_advisory_xact_lock(hashtext('billing_withdrawal:' || v_row.provider || ':' || v_row.purchase_hash));
  select * into v_row from public.billing_withdrawals w where w.id = p_id for update;
  if not found then
    return jsonb_build_object('result', 'sem_pedido');
  end if;
  if v_row.status <> 'pedida' then
    return jsonb_build_object('result', 'ja_encerrada', 'status', v_row.status);
  end if;
  update public.billing_withdrawals w
     set status = p_outcome,
         refunded_at = case when p_outcome = 'devolvida' then now() end,
         closed_at = now(),
         claimed_until = null,
         staff_note = btrim(p_note)
   where w.id = p_id
  returning * into v_row;
  return jsonb_build_object('result', 'encerrada', 'status', v_row.status, 'requested_at', v_row.requested_at, 'closed_at', v_row.closed_at);
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. A pessoa que fica anônima (exclusão da conta com autoria numa Família que continua) perde também os pedidos de desistência
-- ---------------------------------------------------------------------------
-- Igual à da 0041, com a linha de billing_withdrawals.
create or replace function public.clarevo_forget_anonymous()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.account_marks where person_id = new.id;
  delete from public.account_level_clock where person_id = new.id;
  delete from public.billing_checkouts where person_id = new.id;
  delete from public.billing_pix_payments where person_id = new.id;
  delete from public.billing_withdrawals where person_id = new.id;
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Privilégios: a tabela com RLS e sem privilégio para ninguém de fora; as três funções do servidor só com a chave de serviço; a interna e a
-- da equipe, ninguém de fora (o SQL Editor roda como dono).
-- ---------------------------------------------------------------------------
alter table public.billing_withdrawals enable row level security;
revoke all on public.billing_withdrawals from anon, authenticated;
revoke all on function public.clarevo_withdrawal_access_after(uuid, text, text) from public, anon, authenticated;
revoke all on function public.billing_withdrawal_options(uuid) from public, anon, authenticated;
revoke all on function public.billing_withdrawal_begin(uuid, text, text, text, text, bigint, date) from public, anon, authenticated;
revoke all on function public.billing_withdrawal_finish(uuid, text, text, boolean, boolean) from public, anon, authenticated;
revoke all on function public.clarevo_staff_close_withdrawal(uuid, text, text) from public, anon, authenticated;
revoke all on function public.clarevo_forget_anonymous() from public, anon, authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'revoke all on public.billing_withdrawals from service_role';
    execute 'revoke all on function public.clarevo_withdrawal_access_after(uuid, text, text) from service_role';
    execute 'revoke all on function public.clarevo_staff_close_withdrawal(uuid, text, text) from service_role';
    execute 'revoke all on function public.clarevo_forget_anonymous() from service_role';
    execute 'grant execute on function public.billing_withdrawal_options(uuid) to service_role';
    execute 'grant execute on function public.billing_withdrawal_begin(uuid, text, text, text, text, bigint, date) to service_role';
    execute 'grant execute on function public.billing_withdrawal_finish(uuid, text, text, boolean, boolean) to service_role';
  end if;
end $$;
