-- Clarevo · migração 0026 · Assinatura na web pelo Asaas (D-084). Depois de 20261105000002_apagar_excluidos.sql.
-- Duas coisas, para a função do servidor "assinatura-web" (supabase/functions/assinatura-web, gerada do núcleo):
-- (1) clarevo_access e my_access passam a dizer de onde vem o direito ('provider': apple, google, web ou equipe; nulo nas outras
--     situações). O app só mostra "Cancelar assinatura" para a assinatura feita na web; a das lojas se cancela na loja. A resposta só
--     ganha uma chave: o app publicado ignora o que não conhece.
-- (2) billing_checkouts: a ligação entre o Checkout do Asaas e a pessoa, para o aviso da assinatura achar a pessoa quando chega sem a
--     referência da Clarevo. Só o resumo SHA-256 do identificador do Checkout, a pessoa, o plano e a hora: nenhum dado do pagamento,
--     do cartão ou do Asaas. Escrita e leitura só com a chave de serviço (billing_checkout_record e billing_checkout_person); o app não lê
--     nem grava a tabela. A linha some com a pessoa (on delete cascade; a exclusão da conta apaga a linha de persons) e as linhas com
--     mais de 90 dias saem a cada gravação nova (o Checkout vale 60 minutos; depois disso a assinatura já leva a referência).
-- Nada muda para ninguém: nenhum dado existente é alterado. Aplicar no SQL Editor depois da 0025 (docs/05, passo 12p). Testes em
-- supabase/tests/99zzzzz_assinatura_web.sql.

-- ---------------------------------------------------------------------------
-- (1) De onde vem o direito
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
  v_provider text;
  v_from timestamptz;
  v_created timestamptz;
  v_trial timestamptz;
begin
  select e.source, e.plan, e.valid_until, e.provider into v_source, v_plan, v_until, v_provider
    from public.plan_entitlements e
   where e.person_id = p_person and e.valid_from <= v_now and (e.valid_until is null or e.valid_until > v_now)
   order by case e.source when 'particular' then 0 when 'beneficio' then 1 else 2 end, e.valid_until desc nulls first
   limit 1;
  if found then
    return jsonb_build_object('status', case v_source when 'particular' then 'assinatura' when 'beneficio' then 'beneficio' else 'cortesia' end,
                              'plan', v_plan, 'until', v_until, 'can_write', true, 'provider', v_provider);
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
    return jsonb_build_object('status', 'familia', 'plan', 'familiar', 'until', v_until, 'can_write', true, 'provider', null);
  end if;

  select s.enforced_from into v_from from public.billing_settings s where s.id;
  if v_from is null or v_now < v_from then
    return jsonb_build_object('status', 'pre_lancamento', 'plan', null, 'until', v_from, 'can_write', true, 'provider', null);
  end if;
  select p.created_at into v_created from public.persons p where p.id = p_person;
  v_trial := greatest(coalesce(v_created, v_now), v_from) + interval '14 days';
  if v_now < v_trial then
    return jsonb_build_object('status', 'teste', 'plan', null, 'until', v_trial, 'can_write', true, 'provider', null);
  end if;
  return jsonb_build_object('status', 'leitura', 'plan', null, 'until', v_trial, 'can_write', false, 'provider', null);
end;
$$;

-- ---------------------------------------------------------------------------
-- (2) O Checkout do Asaas ligado à pessoa
-- ---------------------------------------------------------------------------
create table public.billing_checkouts (
  checkout_hash text primary key check (checkout_hash ~ '^[0-9a-f]{64}$'),
  person_id uuid not null references public.persons (id) on delete cascade,
  plan text not null check (plan in ('individual', 'familiar')),
  created_at timestamptz not null default now()
);
create index billing_checkouts_person_idx on public.billing_checkouts (person_id);
create index billing_checkouts_created_idx on public.billing_checkouts (created_at);
comment on table public.billing_checkouts is
  'Checkout do Asaas (D-084) ligado à pessoa que o abriu: só o resumo SHA-256 do identificador, a pessoa, o plano e a hora. Escrita e '
  'leitura só pela função do servidor, com a chave de serviço (billing_checkout_record, billing_checkout_person). Some com a pessoa.';

-- A função do servidor grava a ligação logo depois de criar o Checkout. Pessoa inexistente ou excluída: sem_pessoa (nada gravado).
-- A cada gravação, as ligações com mais de 90 dias saem.
create or replace function public.billing_checkout_record(p_checkout_hash text, p_person uuid, p_plan text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if p_checkout_hash is null or p_checkout_hash !~ '^[0-9a-f]{64}$' or p_plan is null or p_plan not in ('individual', 'familiar') then
    raise exception 'checkout_invalido' using errcode = '22023';
  end if;
  if p_person is null or not exists (select 1 from public.persons p where p.id = p_person and p.deleted_at is null) then
    return jsonb_build_object('result', 'sem_pessoa');
  end if;
  delete from public.billing_checkouts where created_at < now() - interval '90 days';
  insert into public.billing_checkouts (checkout_hash, person_id, plan) values (p_checkout_hash, p_person, p_plan)
  on conflict (checkout_hash) do update set person_id = excluded.person_id, plan = excluded.plan;
  return jsonb_build_object('result', 'gravado');
end;
$$;

-- A função do servidor lê a pessoa e o plano de um Checkout quando o aviso da assinatura chega sem a referência. null quando não há.
create or replace function public.billing_checkout_person(p_checkout_hash text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('person_id', c.person_id, 'plan', c.plan)
    from public.billing_checkouts c
    join public.persons p on p.id = c.person_id and p.deleted_at is null
   where c.checkout_hash = p_checkout_hash
$$;

-- ---------------------------------------------------------------------------
-- Privilégios: o app não lê nem grava; só a chave de serviço (a função do servidor) usa as duas funções.
-- ---------------------------------------------------------------------------
alter table public.billing_checkouts enable row level security;
revoke all on public.billing_checkouts from anon, authenticated;
revoke all on function public.billing_checkout_record(text, uuid, text) from public, anon, authenticated;
revoke all on function public.billing_checkout_person(text) from public, anon, authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'revoke all on public.billing_checkouts from service_role';
    execute 'grant execute on function public.billing_checkout_record(text, uuid, text) to service_role';
    execute 'grant execute on function public.billing_checkout_person(text) to service_role';
  end if;
end $$;
