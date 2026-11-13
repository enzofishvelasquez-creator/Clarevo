-- Clarevo · migração 0034 · Níveis de conta (pedido do Enzo em 12/11/2026, D-095; docs/48_NIVEIS.md). Depois de 20261111000003_pix_mes_a_mes.sql.
-- A conta ganha um nível (Bronze, Prata, Ouro e Diamante) pelo quanto a pessoa já usa a Clarevo: 18 marcos do tipo "já fez alguma vez".
-- O nível NUNCA mede dinheiro (nenhum valor entra na conta) e NUNCA desce.
-- (1) account_marks: os marcos que a pessoa já alcançou (a pessoa, o marco e quando). É o que garante o "nunca desce": o registro das
--     operações pode perder linhas (a limpeza dos excluídos depois de 6 meses e a Família apagada, revisão independente de 12/11/2026).
--     Nenhum valor, nome ou dado financeiro; some com a pessoa (on delete cascade). O app não lê nem grava a tabela.
-- (2) my_account_marks: calcula os marcos de agora pelo registro das operações da própria pessoa (record_operations), guarda os que
--     ficaram prontos e devolve os 18 sinais de sim ou não (o que está guardado ou o que acabou de ser calculado). Quantos marcos dão
--     cada nível fica no app (packages/core/src/levels.ts). Só grava em account_marks: não é anotação da pessoa, não entra no registro
--     das operações e funciona também para a conta em "só ver e exportar".
-- (3) A exclusão da conta: account_marks some em cascata quando a linha da pessoa sai. Quando a pessoa ainda é autora de algo numa Família
--     que continua, a linha fica, anônima (clarevo_erase_person, ramo X1), e a cascata não acontece: o gatilho clarevo_forget_anonymous
--     apaga então o que é só dela e saía só em cascata. Achado na mesma revisão: billing_checkouts (0026) e billing_pix_payments (0033)
--     tinham a mesma falha no ramo anônimo e entram no mesmo gatilho.
-- (4) billing_pix_apply (0033) com a mesma trava: um aviso de pagamento por Pix que chegue durante a exclusão da conta não grava
--     pagamento nem acesso para a pessoa que fica anônima (achado da mesma revisão). Só muda a conferência da pessoa.
-- Nenhum dado existente muda. Aplicar no SQL Editor (docs/05, passo 12z). Testes em supabase/tests/99zzzzzzzzzzzzzz_niveis.sql.

create table public.account_marks (
  person_id uuid not null references public.persons (id) on delete cascade,
  mark text not null check (mark in ('gasto', 'recebimento', 'gasto_fixo', 'guardar', 'meta', 'aporte', 'orcamento', 'renda', 'cartao',
    'investimento', 'pagou', 'tres_meses', 'importou', 'telegram', 'familia', 'conta', 'limite', 'imagem')),
  reached_at timestamptz not null default now(),
  primary key (person_id, mark)
);
comment on table public.account_marks is
  'Níveis de conta (D-095): os marcos "já fez alguma vez" que a pessoa alcançou, para o nível nunca descer. Só a pessoa, o marco e quando; '
  'nenhum valor nem dado financeiro. Escrita e leitura só por my_account_marks. Some com a pessoa.';

create or replace function public.my_account_marks()
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_live jsonb;
  v_marks jsonb;
begin
  if v_me is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  with ops as materialized (
    select o.action, o.record_id, o.created_at from public.record_operations o where o.actor_id = v_me
  ),
  -- O que a pessoa importou (um extrato pode trazer só gastos ou só recebimentos; uma fatura traz compras no cartão): os lançamentos
  -- importados que ela criou.
  imported as materialized (
    select distinct r.kind::text as kind from public.financial_records r
     where r.created_by = v_me and r.import_key is not null and exists (select 1 from ops where action = 'importar_extrato')
    union
    select 'despesa' from public.card_entries c
     where c.created_by = v_me and c.import_key is not null and c.kind = 'parcela' and exists (select 1 from ops where action = 'importar_extrato')
  )
  select jsonb_build_object(
    -- Anotou um gasto: um gasto anotado, uma compra no cartão, uma conta ou fatura paga (o pagamento vira gasto) ou um gasto importado.
    'gasto', exists (select 1 from ops o join public.financial_records r on r.id = o.record_id where o.action = 'criar' and r.kind = 'despesa')
             or exists (select 1 from ops where action in ('criar_compra_cartao', 'pagar_compromisso', 'pagar_fatura'))
             or exists (select 1 from imported where kind = 'despesa'),
    'recebimento', exists (select 1 from ops o join public.financial_records r on r.id = o.record_id where o.action = 'criar' and r.kind = 'receita')
             or exists (select 1 from imported where kind = 'receita'),
    'gasto_fixo', exists (select 1 from ops where action in ('criar_serie', 'criar_compromisso')),
    'guardar', exists (select 1 from ops where action = 'responder_guardar'),
    'meta', exists (select 1 from ops where action = 'criar_meta'),
    'aporte', exists (select 1 from ops where action = 'registrar_movimento_meta'),
    'orcamento', exists (select 1 from ops where action = 'definir_orcamento_categoria'),
    'renda', exists (select 1 from ops where action = 'definir_renda_referencia'),
    'cartao', exists (select 1 from ops where action = 'criar_cartao'),
    'investimento', exists (select 1 from ops where action = 'criar_investimento'),
    'pagou', exists (select 1 from ops where action in ('pagar_compromisso', 'pagar_fatura')),
    -- Anotou em três meses diferentes (qualquer anotação, pelo mês de Brasília em que foi feita).
    'tres_meses', (select count(distinct date_trunc('month', o.created_at at time zone 'America/Sao_Paulo')) from ops o
                    where o.action in ('criar', 'criar_compra_cartao', 'pagar_compromisso', 'pagar_fatura', 'registrar_movimento_meta',
                                       'registrar_movimento_investimento', 'importar_extrato')) >= 3,
    'importou', exists (select 1 from ops where action = 'importar_extrato'),
    'telegram', exists (select 1 from ops where action = 'ligar_telegram'),
    'familia', exists (select 1 from ops where action in ('criar_familia', 'aceitar_convite_familia')),
    'conta', exists (select 1 from ops where action = 'criar_conta'),
    'limite', exists (select 1 from ops where action = 'definir_limite_comprometimento'),
    'imagem', exists (select 1 from ops where action = 'imagem_meta')
  ) into v_live;

  -- Guarda os marcos que ficaram prontos (uma vez cada), para o nível nunca descer; e devolve o guardado ou o de agora. A trava da
  -- linha da pessoa (for key share) faz uma chamada no meio da exclusão da conta esperar a exclusão; depois dela, a pessoa não é
  -- achada e nada é gravado (revisão independente de 12/11/2026: sem a trava, a pessoa que ficava anônima ganhava marcos de novo).
  perform 1 from public.persons p where p.id = v_me and p.deleted_at is null for key share;
  if found then
    insert into public.account_marks (person_id, mark)
    select v_me, e.key from jsonb_each(v_live) e where e.value = 'true'::jsonb
    on conflict do nothing;
  end if;
  select jsonb_object_agg(e.key, e.value = 'true'::jsonb or exists (select 1 from public.account_marks a where a.person_id = v_me and a.mark = e.key))
    into v_marks from jsonb_each(v_live) e;
  return v_marks;
end;
$$;

-- A pessoa que vira anônima na exclusão da conta (deleted_at preenchido só por clarevo_erase_person): sai o que é só dela.
create or replace function public.clarevo_forget_anonymous()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.account_marks where person_id = new.id;
  delete from public.billing_checkouts where person_id = new.id;
  delete from public.billing_pix_payments where person_id = new.id;
  return null;
end;
$$;
revoke all on function public.clarevo_forget_anonymous() from public, anon, authenticated;
create trigger persons_forget_anonymous
  after update of deleted_at on public.persons
  for each row when (old.deleted_at is null and new.deleted_at is not null)
  execute function public.clarevo_forget_anonymous();

-- (4) A conferência da pessoa no aviso de pagamento por Pix, com a trava da linha.
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
  v_anchor date;
  v_months int := 0;
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
  -- A pessoa viva, com a trava da linha (for key share): um aviso que chega durante a exclusão da conta espera a exclusão e, depois
  -- dela, não acha a pessoa (revisão independente de 12/11/2026; antes, gravava o pagamento e o acesso da pessoa que ficou anônima).
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
  -- O plano de um pagamento não muda (é o do Checkout); só a situação (pago, estornado) e o dia.
  insert into public.billing_pix_payments (payment_hash, person_id, plan, paid_on) values (p_payment_hash, p_person, p_plan, p_paid_on)
  on conflict (payment_hash) do update set paid_on = excluded.paid_on, updated_at = now();
  select b.plan into p_plan from public.billing_pix_payments b where b.payment_hash = p_payment_hash;

  -- Cada pagamento vale um mês. Pago até 3 dias depois do fim do mês já pago, continua a sequência; depois, começa outra no dia pago.
  for r in
    select b.paid_on from public.billing_pix_payments b
     where b.person_id = p_person and b.plan = p_plan and b.paid_on is not null
     order by b.paid_on, b.payment_hash
  loop
    if v_end is null or r.paid_on > v_end + 3 then
      v_anchor := r.paid_on;
      v_months := 1;
    else
      v_months := v_months + 1;
    end if;
    v_end := (v_anchor + make_interval(months => v_months))::date;
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

alter table public.account_marks enable row level security;
revoke all on public.account_marks from anon, authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'revoke all on public.account_marks from service_role';
    execute 'revoke all on function public.clarevo_forget_anonymous() from service_role';
  end if;
end $$;
revoke all on function public.my_account_marks() from public, anon;
grant execute on function public.my_account_marks() to authenticated;
