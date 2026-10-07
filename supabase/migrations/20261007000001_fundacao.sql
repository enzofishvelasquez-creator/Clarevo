-- Clarevo · migração 0001 · fundação de identidade, contextos, benefício e eventos financeiros
-- 07/10/2026
--
-- Princípios (ver docs/03_ACESSO_E_PERMISSOES.md):
-- 1. Pessoa, contexto financeiro, vínculo familiar, organização, licença e direito ao plano são entidades separadas.
-- 2. Autorização sobre dados é validada no banco (RLS), por recurso e ação. Esconder botão não protege dado.
-- 3. Licença empresarial habilita o plano. Não dá a ninguém da empresa acesso a finanças ou à família.
-- 4. Valores em centavos inteiros (bigint). Previsto e confirmado são situações distintas.
--
-- Depende do esquema `auth` do Supabase (auth.users, auth.uid()).

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Pessoas
-- ---------------------------------------------------------------------------
create table public.persons (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (length(trim(display_name)) between 1 and 80),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Contextos financeiros (Pessoal / Família) e vínculos
-- ---------------------------------------------------------------------------
create type public.context_kind as enum ('pessoal', 'familia');
create type public.membership_role as enum ('titular', 'membro');

create table public.financial_contexts (
  id uuid primary key default gen_random_uuid(),
  kind public.context_kind not null,
  name text not null check (length(trim(name)) between 1 and 60),
  owner_person_id uuid not null references public.persons (id),
  created_at timestamptz not null default now()
);

-- Cada pessoa tem exatamente um contexto pessoal.
create unique index one_personal_context_per_person
  on public.financial_contexts (owner_person_id) where kind = 'pessoal';

create table public.context_memberships (
  context_id uuid not null references public.financial_contexts (id) on delete cascade,
  person_id uuid not null references public.persons (id) on delete cascade,
  role public.membership_role not null,
  can_read boolean not null default true,
  can_write boolean not null default false,
  can_edit_others boolean not null default false,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  primary key (context_id, person_id)
);

-- Convite familiar. Não confundir com convite empresarial (benefit_invites).
create table public.family_invites (
  id uuid primary key default gen_random_uuid(),
  context_id uuid not null references public.financial_contexts (id) on delete cascade,
  invited_email text not null,
  token_hash text not null unique,
  can_write boolean not null default false,
  can_edit_others boolean not null default false,
  created_by uuid not null references public.persons (id),
  expires_at timestamptz not null,
  accepted_by uuid references public.persons (id),
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at > created_at)
);

-- ---------------------------------------------------------------------------
-- Organizações, contrato de benefício, licenças e direito ao plano
-- ---------------------------------------------------------------------------
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table public.organization_admins (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  person_id uuid not null references public.persons (id) on delete cascade,
  primary key (organization_id, person_id)
);

create table public.benefit_contracts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  seats integer not null check (seats > 0),
  plan text not null check (plan in ('individual', 'familiar')),
  starts_on date not null,
  ends_on date,
  created_at timestamptz not null default now(),
  check (ends_on is null or ends_on >= starts_on)
);

create type public.license_status as enum ('convidada', 'ativa', 'encerrada');

create table public.licenses (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.benefit_contracts (id) on delete cascade,
  invited_email text not null,
  person_id uuid references public.persons (id) on delete set null,
  status public.license_status not null default 'convidada',
  created_at timestamptz not null default now(),
  activated_at timestamptz,
  ended_at timestamptz
);

create unique index one_open_license_per_email_per_contract
  on public.licenses (contract_id, lower(invited_email)) where status <> 'encerrada';

-- Direito ao plano: de onde vem o acesso. O fim de um direito NÃO apaga conta, histórico ou vínculos.
create type public.entitlement_source as enum ('beneficio', 'particular', 'cortesia');

create table public.plan_entitlements (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.persons (id) on delete cascade,
  source public.entitlement_source not null,
  license_id uuid references public.licenses (id) on delete set null,
  plan text not null check (plan in ('individual', 'familiar')),
  valid_from timestamptz not null default now(),
  valid_until timestamptz,
  check (source <> 'beneficio' or license_id is not null)
);

-- ---------------------------------------------------------------------------
-- Eventos financeiros (fonte única para resumo, listas e composição)
-- ---------------------------------------------------------------------------
create type public.event_direction as enum ('entrada', 'saida');
create type public.event_status as enum ('previsto', 'confirmado');

create table public.financial_events (
  id uuid primary key default gen_random_uuid(),
  context_id uuid not null references public.financial_contexts (id) on delete restrict,
  direction public.event_direction not null,
  status public.event_status not null,
  amount_cents bigint not null check (amount_cents > 0 and amount_cents <= 10000000000),
  description text not null check (length(trim(description)) between 1 and 120),
  category text not null default 'Outros',
  competence date not null check (extract(day from competence) = 1),
  due_on date,
  settled_on date,
  idempotency_key text not null check (length(idempotency_key) between 8 and 80),
  created_by uuid not null references public.persons (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  -- Confirmado exige data de recebimento/pagamento; previsto não pode tê-la.
  check ((status = 'confirmado') = (settled_on is not null)),
  -- Proteção contra envio duplicado.
  unique (context_id, idempotency_key)
);

create index financial_events_ctx_settled on public.financial_events (context_id, settled_on) where deleted_at is null;
create index financial_events_ctx_due on public.financial_events (context_id, due_on) where deleted_at is null;

-- ---------------------------------------------------------------------------
-- Funções de autorização (security definer para não recursar nas políticas)
-- ---------------------------------------------------------------------------
create or replace function public.context_permission(p_context uuid, p_action text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.context_memberships m
    where m.context_id = p_context
      and m.person_id = auth.uid()
      and m.revoked_at is null
      and case p_action
            when 'read' then m.can_read
            when 'write' then m.can_write
            when 'edit_others' then m.can_edit_others
            when 'manage' then m.role = 'titular'
            else false
          end
  );
$$;

create or replace function public.is_org_admin(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.organization_admins a
    where a.organization_id = p_org and a.person_id = auth.uid()
  );
$$;

revoke all on function public.context_permission(uuid, text) from public;
revoke all on function public.is_org_admin(uuid) from public;
grant execute on function public.context_permission(uuid, text) to authenticated;
grant execute on function public.is_org_admin(uuid) to authenticated;

-- Ao criar a pessoa, cria o contexto pessoal e o vínculo de titular.
create or replace function public.create_personal_context()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ctx uuid;
begin
  insert into public.financial_contexts (kind, name, owner_person_id)
  values ('pessoal', 'Pessoal', new.id)
  returning id into v_ctx;
  insert into public.context_memberships (context_id, person_id, role, can_read, can_write, can_edit_others)
  values (v_ctx, new.id, 'titular', true, true, true);
  return new;
end;
$$;

create trigger persons_create_personal_context
  after insert on public.persons
  for each row execute function public.create_personal_context();

-- Criar uma família: quem cria vira titular.
create or replace function public.create_family_context(p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ctx uuid;
begin
  if auth.uid() is null then
    raise exception 'não autenticado' using errcode = '42501';
  end if;
  insert into public.financial_contexts (kind, name, owner_person_id)
  values ('familia', p_name, auth.uid())
  returning id into v_ctx;
  insert into public.context_memberships (context_id, person_id, role, can_read, can_write, can_edit_others)
  values (v_ctx, auth.uid(), 'titular', true, true, true);
  return v_ctx;
end;
$$;

revoke all on function public.create_family_context(text) from public;
grant execute on function public.create_family_context(text) to authenticated;

-- Eventos: updated_at automático e autoria imutável.
create or replace function public.financial_events_guard()
returns trigger
language plpgsql
as $$
begin
  if new.created_by <> old.created_by or new.context_id <> old.context_id or new.created_at <> old.created_at then
    raise exception 'autoria, contexto e criação não podem ser alterados' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger financial_events_guard
  before update on public.financial_events
  for each row execute function public.financial_events_guard();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.persons enable row level security;
alter table public.financial_contexts enable row level security;
alter table public.context_memberships enable row level security;
alter table public.family_invites enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_admins enable row level security;
alter table public.benefit_contracts enable row level security;
alter table public.licenses enable row level security;
alter table public.plan_entitlements enable row level security;
alter table public.financial_events enable row level security;

-- Pessoas: cada um vê a si mesmo e quem compartilha um contexto ativo consigo (para mostrar "Quem vê estes dados?").
create policy persons_self_insert on public.persons
  for insert to authenticated with check (id = auth.uid());
create policy persons_self_update on public.persons
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy persons_visible on public.persons
  for select to authenticated using (
    id = auth.uid()
    or exists (
      select 1 from public.context_memberships m
      where m.person_id = persons.id and m.revoked_at is null
        and public.context_permission(m.context_id, 'read')
    )
  );

-- Contextos: só membros ativos veem.
create policy contexts_member_read on public.financial_contexts
  for select to authenticated using (public.context_permission(id, 'read'));
create policy contexts_titular_update on public.financial_contexts
  for update to authenticated using (public.context_permission(id, 'manage'))
  with check (public.context_permission(id, 'manage'));

-- Vínculos: membros veem quem participa; só titular altera ou revoga.
create policy memberships_read on public.context_memberships
  for select to authenticated using (
    person_id = auth.uid() or public.context_permission(context_id, 'read')
  );
create policy memberships_titular_update on public.context_memberships
  for update to authenticated using (public.context_permission(context_id, 'manage'))
  with check (public.context_permission(context_id, 'manage'));
-- Qualquer membro pode sair (revogar o próprio vínculo) via função dedicada (próxima migração).

-- Convites familiares: só titular cria e vê.
create policy family_invites_titular on public.family_invites
  for all to authenticated
  using (public.context_permission(context_id, 'manage'))
  with check (public.context_permission(context_id, 'manage') and created_by = auth.uid());

-- Organizações e benefício: administradores da empresa gerem contrato e licenças.
-- NENHUMA política dá a eles acesso a contextos, vínculos ou eventos financeiros.
create policy org_admin_read on public.organizations
  for select to authenticated using (public.is_org_admin(id));
create policy org_admins_read on public.organization_admins
  for select to authenticated using (public.is_org_admin(organization_id));
create policy contracts_admin_read on public.benefit_contracts
  for select to authenticated using (public.is_org_admin(organization_id));
create policy licenses_admin_all on public.licenses
  for all to authenticated
  using (exists (select 1 from public.benefit_contracts c where c.id = contract_id and public.is_org_admin(c.organization_id)))
  with check (exists (select 1 from public.benefit_contracts c where c.id = contract_id and public.is_org_admin(c.organization_id)));
create policy licenses_own_read on public.licenses
  for select to authenticated using (person_id = auth.uid());

create policy entitlements_own_read on public.plan_entitlements
  for select to authenticated using (person_id = auth.uid());

-- Eventos financeiros: leitura, registro e edição por permissão do vínculo.
create policy events_read on public.financial_events
  for select to authenticated using (public.context_permission(context_id, 'read'));
create policy events_insert on public.financial_events
  for insert to authenticated with check (
    created_by = auth.uid() and public.context_permission(context_id, 'write')
  );
create policy events_update on public.financial_events
  for update to authenticated
  using (
    public.context_permission(context_id, 'write')
    and (created_by = auth.uid() or public.context_permission(context_id, 'edit_others'))
  )
  with check (public.context_permission(context_id, 'write'));
-- Sem política de DELETE: exclusão é lógica (deleted_at), preservando autoria e auditoria.

grant usage on schema public to authenticated;
grant select, insert, update on all tables in schema public to authenticated;
revoke delete on all tables in schema public from authenticated;
grant delete on public.family_invites, public.licenses to authenticated;
