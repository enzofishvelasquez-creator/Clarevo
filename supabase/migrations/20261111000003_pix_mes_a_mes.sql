-- Clarevo · migração 0033 · Pix mês a mês na assinatura pela web (D-093, caminho B escolhido pelo Enzo em 11/11/2026; docs/39, seção 6).
-- Depois de 20261111000002_investimentos.sql.
-- Na web, além do cartão (assinatura recorrente pelo Checkout do Asaas, migração 0026), a pessoa pode pagar um mês por vez com Pix, também
-- pelo Checkout do Asaas (cobrança avulsa). Não é automático: cada pagamento libera um mês, e a tela avisa quando está perto do fim. A
-- Clarevo continua sem receber CPF nem dado do Pix: a pessoa informa tudo na página do Asaas.
-- (1) O direito pago com Pix tem a origem própria 'pix' (o app mostra "pague o próximo mês" em vez de "cancelar"): as restrições de
--     plan_entitlements.provider e de billing_events.provider passam a aceitar 'pix'. clarevo_access não muda (já devolve a origem).
-- (2) billing_pix_payments: cada pagamento por Pix, só com o resumo SHA-256 do identificador da cobrança no Asaas, a pessoa, o plano e o
--     dia do pagamento (nulo enquanto não está pago, ou depois de estornado). Nada do pagador, do valor ou do Pix. Some com a pessoa.
-- (3) billing_pix_apply: a função do servidor grava a situação atual de um pagamento (consultada no Asaas a cada aviso) e recalcula até
--     quando o acesso vale: os pagamentos do plano, em ordem, cada um começando no dia do pagamento ou no fim do mês anterior já pago (o
--     que vier depois) e valendo um mês; mais PIX_GRACE_DAYS (3) dias de tolerância, até o fim do dia em Brasília. Estorno tira o mês.
--     Idempotente pelo identificador do aviso (billing_events). billing_pix_person acha a pessoa de um pagamento já gravado (estorno
--     de um pagamento antigo). Só a chave de serviço usa as duas.
-- Nenhum dado existente muda. Aplicar no SQL Editor (docs/05, passo 12y). Testes em supabase/tests/99zzzzzzzzzzzzz_pix.sql.

-- ---------------------------------------------------------------------------
-- (1) A origem 'pix'
-- ---------------------------------------------------------------------------
alter table public.plan_entitlements drop constraint plan_entitlements_provider_check;
alter table public.plan_entitlements add constraint plan_entitlements_provider_check check (provider in ('apple', 'google', 'web', 'pix', 'equipe'));
alter table public.billing_events drop constraint billing_events_provider_check;
alter table public.billing_events add constraint billing_events_provider_check check (provider in ('apple', 'google', 'web', 'pix'));

-- ---------------------------------------------------------------------------
-- (2) Os pagamentos por Pix
-- ---------------------------------------------------------------------------
create table public.billing_pix_payments (
  payment_hash text primary key check (payment_hash ~ '^[0-9a-f]{64}$'),
  person_id uuid not null references public.persons (id) on delete cascade,
  plan text not null check (plan in ('individual', 'familiar')),
  paid_on date,
  updated_at timestamptz not null default now()
);
create index billing_pix_payments_person_idx on public.billing_pix_payments (person_id, plan);
comment on table public.billing_pix_payments is
  'Pagamento de um mês com Pix pelo Checkout do Asaas (D-093): só o resumo SHA-256 do identificador da cobrança, a pessoa, o plano e o '
  'dia do pagamento (nulo se não pago ou estornado). Escrita e leitura só pela função do servidor (billing_pix_apply, billing_pix_person). '
  'Some com a pessoa.';

-- ---------------------------------------------------------------------------
-- (3) Aplicar a situação de um pagamento e recalcular o acesso
-- ---------------------------------------------------------------------------
-- Ordem: aviso_invalido; repetido (o mesmo aviso já aplicado); sem_pessoa (pessoa nula ou excluída: nada gravado, para valer quando chegar
-- de novo); trava da pessoa; pagamento_de_outra_pessoa; aplicado. Retorno: {result, paid_through?, access?}. paid_through é o último dia do
-- período pago (sem a tolerância), nulo sem pagamento.
create or replace function public.billing_pix_apply(
  p_event_id text, p_person uuid, p_plan text, p_payment_hash text, p_paid_on date, p_event_at timestamptz
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_start date;
  v_end date;
  v_ref text;
  v_until timestamptz;
  v_id uuid;
  r record;
begin
  if p_event_id is null or char_length(p_event_id) not between 1 and 200 or p_payment_hash is null or p_payment_hash !~ '^[0-9a-f]{64}$'
     or p_plan is null or p_plan not in ('individual', 'familiar') or p_event_at is null or p_event_at > now() + interval '1 day'
     or (p_paid_on is not null and (p_paid_on < date '2026-01-01' or p_paid_on > (now() at time zone 'America/Sao_Paulo')::date + 1)) then
    raise exception 'aviso_invalido' using errcode = '22023';
  end if;
  if exists (select 1 from public.billing_events where event_id = p_event_id) then
    return jsonb_build_object('result', 'repetido');
  end if;
  if p_person is null or not exists (select 1 from public.persons p where p.id = p_person and p.deleted_at is null) then
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
  -- O plano de um pagamento não muda (é o do Checkout); só a situação (pago, estornado) e o dia.
  insert into public.billing_pix_payments (payment_hash, person_id, plan, paid_on) values (p_payment_hash, p_person, p_plan, p_paid_on)
  on conflict (payment_hash) do update set paid_on = excluded.paid_on, updated_at = now();
  select b.plan into p_plan from public.billing_pix_payments b where b.payment_hash = p_payment_hash;

  -- Cada pagamento vale um mês, a partir do dia do pagamento ou do fim do mês já pago, o que vier depois.
  for r in
    select b.paid_on from public.billing_pix_payments b
     where b.person_id = p_person and b.plan = p_plan and b.paid_on is not null
     order by b.paid_on, b.payment_hash
  loop
    v_start := greatest(r.paid_on, coalesce(v_end, r.paid_on));
    v_end := (v_start + interval '1 month')::date;
  end loop;

  v_ref := encode(sha256(convert_to('pix:' || p_person::text || ':' || p_plan, 'UTF8')), 'hex');
  -- Até o fim do dia (Brasília) do último dia pago mais 3 dias de tolerância; sem pagamento, acaba agora.
  v_until := case when v_end is null then now()
                  else ((v_end + 4)::timestamp at time zone 'America/Sao_Paulo') - interval '1 millisecond' end;
  select e.id into v_id from public.plan_entitlements e where e.provider = 'pix' and e.external_ref = v_ref for update;
  if v_id is null then
    if v_end is not null then
      insert into public.plan_entitlements (person_id, source, plan, valid_from, valid_until, provider, external_ref, last_event_at)
      values (p_person, 'particular', p_plan, now(), v_until, 'pix', v_ref, p_event_at);
    end if;
  else
    update public.plan_entitlements
       set valid_until = v_until, last_event_at = greatest(coalesce(last_event_at, p_event_at), p_event_at)
     where id = v_id;
  end if;
  return jsonb_build_object('result', 'aplicado', 'paid_through', v_end, 'access', public.clarevo_access(p_person));
end;
$$;

-- A função do servidor lê a pessoa e o plano de um pagamento já gravado (pelo resumo do identificador da cobrança). null quando não há.
create or replace function public.billing_pix_person(p_payment_hash text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('person_id', b.person_id, 'plan', b.plan)
    from public.billing_pix_payments b
    join public.persons p on p.id = b.person_id and p.deleted_at is null
   where b.payment_hash = p_payment_hash
$$;

-- ---------------------------------------------------------------------------
-- Privilégios: o app não lê nem grava; só a chave de serviço (a função do servidor) usa as duas funções.
-- ---------------------------------------------------------------------------
alter table public.billing_pix_payments enable row level security;
revoke all on public.billing_pix_payments from anon, authenticated;
revoke all on function public.billing_pix_apply(text, uuid, text, text, date, timestamptz) from public, anon, authenticated;
revoke all on function public.billing_pix_person(text) from public, anon, authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'revoke all on public.billing_pix_payments from service_role';
    execute 'grant execute on function public.billing_pix_apply(text, uuid, text, text, date, timestamptz) to service_role';
    execute 'grant execute on function public.billing_pix_person(text) to service_role';
  end if;
end $$;
