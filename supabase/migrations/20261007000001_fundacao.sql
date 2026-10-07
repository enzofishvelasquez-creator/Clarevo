-- Clarevo · migração 0001 · fundação: pessoa, contexto, conta, registros realizados, benefício empresarial
-- 07/10/2026 · primeiro ciclo (ainda não aplicada em nenhum ambiente; reescrita no lugar)
--
-- Princípios (ver docs/03_ACESSO_E_PERMISSOES.md):
-- 1. Pessoa, contexto financeiro, vínculo, conta, organização, contrato, licença e direito ao plano são entidades separadas.
-- 2. Autorização é validada no banco, por recurso e ação, em toda leitura e escrita. Esconder botão não protege dado.
-- 3. Licença empresarial habilita o plano. Não dá a ninguém da empresa acesso a finanças ou à família.
-- 4. Valores em centavos inteiros. Neste ciclo só existem registros realizados; compromissos ficam em origem separada.
-- 5. Registros só são gravados pelas funções create_record / update_record / delete_record:
--    autoria vem da sessão, chave de idempotência por pessoa, versão contra sobrescrita, exclusão lógica.
--
-- Depende do esquema `auth` do Supabase (auth.users, auth.uid()).
-- Os códigos de erro são a MENSAGEM da exceção (ex.: 'versao_desatualizada'); o app traduz para o texto da tela.

create extension if not exists pgcrypto;

-- O Supabase concede privilégios amplos por padrão a anon/authenticated em objetos novos.
-- Retiramos tudo ao final e concedemos só o necessário.

-- ---------------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------------
create type public.context_kind as enum ('pessoal', 'familia');
create type public.membership_role as enum ('titular', 'membro');
create type public.record_kind as enum ('receita', 'despesa');
create type public.record_status as enum ('realizado');
create type public.commitment_status as enum ('aberto', 'quitado', 'cancelado');
create type public.license_status as enum ('convidada', 'ativa', 'encerrada');
create type public.entitlement_source as enum ('beneficio', 'particular', 'cortesia');

-- ---------------------------------------------------------------------------
-- Pessoas
-- ---------------------------------------------------------------------------
create table public.persons (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 80),
  time_zone text not null default 'America/Sao_Paulo',
  locale text not null default 'pt-BR',
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Contextos (Pessoal / Família) e vínculos com permissões por ação
-- ---------------------------------------------------------------------------
create table public.financial_contexts (
  id uuid primary key default gen_random_uuid(),
  kind public.context_kind not null,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  owner_person_id uuid not null references public.persons (id),
  currency char(3) not null default 'BRL',
  created_at timestamptz not null default now()
);

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

-- ---------------------------------------------------------------------------
-- Contas financeiras
-- ---------------------------------------------------------------------------
create table public.financial_accounts (
  id uuid primary key default gen_random_uuid(),
  context_id uuid not null references public.financial_contexts (id) on delete cascade,
  name text not null check (name = btrim(name) and char_length(name) between 1 and 40),
  currency char(3) not null default 'BRL',
  status text not null default 'ativa' check (status in ('ativa', 'arquivada')),
  -- null = saldo inicial desconhecido, que é diferente de zero.
  initial_balance_cents bigint,
  created_by uuid not null references public.persons (id),
  created_at timestamptz not null default now(),
  unique (id, context_id, currency)
);

-- ---------------------------------------------------------------------------
-- Registros realizados: fonte única de lista, detalhe e totais
-- ---------------------------------------------------------------------------
create table public.financial_records (
  id uuid primary key default gen_random_uuid(),
  context_id uuid not null references public.financial_contexts (id) on delete restrict,
  account_id uuid not null,
  kind public.record_kind not null,
  status public.record_status not null default 'realizado',
  amount_cents bigint not null check (amount_cents between 1 and 999999999),
  currency char(3) not null,
  occurred_on date not null,
  description text not null check (description = btrim(description) and char_length(description) between 1 and 80),
  category text check (category is null or (category = btrim(category) and char_length(category) between 1 and 40)),
  created_by uuid not null references public.persons (id),
  version integer not null default 1 check (version >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references public.persons (id),
  -- Conta e registro sempre no mesmo contexto e moeda.
  foreign key (account_id, context_id, currency) references public.financial_accounts (id, context_id, currency)
);

create index financial_records_ctx_date on public.financial_records (context_id, occurred_on) where deleted_at is null;

-- Compromissos previstos ("Ainda a pagar"): origem separada, sem escrita neste ciclo.
create table public.commitments (
  id uuid primary key default gen_random_uuid(),
  context_id uuid not null references public.financial_contexts (id) on delete cascade,
  description text not null check (char_length(btrim(description)) between 1 and 80),
  amount_cents bigint not null check (amount_cents between 1 and 999999999),
  currency char(3) not null default 'BRL',
  due_on date not null,
  status public.commitment_status not null default 'aberto',
  created_by uuid not null references public.persons (id),
  created_at timestamptz not null default now()
);

-- Operações: chave de idempotência por pessoa. Repetir devolve o mesmo resultado.
create table public.record_operations (
  actor_id uuid not null references public.persons (id) on delete cascade,
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 80),
  action text not null check (action in ('criar', 'editar', 'excluir')),
  context_id uuid not null,
  request_hash text not null,
  record_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (actor_id, idempotency_key)
);

-- ---------------------------------------------------------------------------
-- Organização, contrato de benefício, licença e direito ao plano
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

create table public.licenses (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.benefit_contracts (id) on delete cascade,
  invited_email text not null,
  person_id uuid references public.persons (id) on delete set null,
  status public.license_status not null default 'convidada',
  created_at timestamptz not null default now(),
  activated_at timestamptz,
  ended_at timestamptz,
  -- Licença ativa sempre tem beneficiário aceito; isso é definido pelo servidor no aceite, não pela empresa.
  check (status <> 'ativa' or (person_id is not null and activated_at is not null))
);

create unique index one_open_license_per_email_per_contract
  on public.licenses (contract_id, lower(invited_email)) where status <> 'encerrada';

-- De onde vem o acesso ao plano. Encerrar NÃO apaga conta, histórico ou vínculos.
create table public.plan_entitlements (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.persons (id) on delete cascade,
  source public.entitlement_source not null,
  license_id uuid references public.licenses (id) on delete restrict,
  plan text not null check (plan in ('individual', 'familiar')),
  valid_from timestamptz not null default now(),
  valid_until timestamptz,
  check (source <> 'beneficio' or license_id is not null)
);

-- ---------------------------------------------------------------------------
-- Funções de autorização
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
            when 'write' then m.can_read and m.can_write
            when 'edit_others' then m.can_read and m.can_write and m.can_edit_others
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

-- Dia atual da pessoa (data civil no fuso dela).
-- Gancho de teste: a configuração `clarevo.today` fixa o dia (usada só nos testes automatizados;
-- só afeta a recusa de datas futuras). Em produção ela não é definida.
create or replace function public.clarevo_today(p_person uuid)
returns date
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_override text := nullif(current_setting('clarevo.today', true), '');
  v_tz text;
begin
  if v_override is not null then
    return v_override::date;
  end if;
  select time_zone into v_tz from public.persons where id = p_person;
  begin
    return (now() at time zone coalesce(v_tz, 'America/Sao_Paulo'))::date;
  exception when others then
    return (now() at time zone 'America/Sao_Paulo')::date;
  end;
end;
$$;

-- ---------------------------------------------------------------------------
-- Primeira entrada: espaço pessoal e primeira conta (idempotente)
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

  select * into v_account from public.financial_accounts where context_id = v_ctx order by created_at, id limit 1;
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
-- Registros: criar, editar, excluir (atômico, idempotente, versionado)
-- ---------------------------------------------------------------------------

-- Remove espaços em branco das pontas (espaço, tabulação, quebra de linha), como o trim() do app.
create or replace function public.clarevo_trim(p text)
returns text
language sql
immutable
set search_path = public
as $$
  select regexp_replace(coalesce(p, ''), '^\s+|\s+$', '', 'g');
$$;

-- Validação comum (mesmas regras do app em packages/core/src/validation.ts).
create or replace function public.clarevo_validate_record(
  p_actor uuid, p_context_id uuid, p_account_id uuid, p_amount_cents bigint, p_occurred_on date, p_description text,
  p_category text default null
)
returns public.financial_accounts
language plpgsql
stable
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
  select * into v_account from public.financial_accounts
   where id = p_account_id and context_id = p_context_id and status = 'ativa';
  if not found then
    raise exception 'conta_invalida' using errcode = '22023';
  end if;
  return v_account;
end;
$$;

create or replace function public.create_record(
  p_idempotency_key text,
  p_context_id uuid,
  p_account_id uuid,
  p_kind public.record_kind,
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
  v_account public.financial_accounts%rowtype;
  v_record public.financial_records%rowtype;
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  v_hash := md5(concat_ws('|', 'criar', p_context_id, p_account_id, p_kind, p_amount_cents, p_occurred_on, v_description, coalesce(v_category, '')));
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

  if not public.context_permission(p_context_id, 'write') then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  v_account := public.clarevo_validate_record(v_uid, p_context_id, p_account_id, p_amount_cents, p_occurred_on, v_description, v_category);

  insert into public.financial_records
    (context_id, account_id, kind, amount_cents, currency, occurred_on, description, category, created_by)
  values
    (p_context_id, p_account_id, p_kind, p_amount_cents, v_account.currency, p_occurred_on, v_description, v_category, v_uid)
  returning * into v_record;

  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id)
  values (v_uid, p_idempotency_key, 'criar', p_context_id, v_hash, v_record.id);

  return v_record;
end;
$$;

-- Carrega o registro para alteração, sem revelar se existe para quem não pode lê-lo.
create or replace function public.clarevo_lock_record(p_record_id uuid)
returns public.financial_records
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_record public.financial_records%rowtype;
begin
  select * into v_record from public.financial_records where id = p_record_id for update;
  if not found or v_record.deleted_at is not null or not public.context_permission(v_record.context_id, 'read') then
    raise exception 'nao_encontrado' using errcode = 'P0002';
  end if;
  if not public.context_permission(v_record.context_id, 'write')
     or (v_record.created_by <> auth.uid() and not public.context_permission(v_record.context_id, 'edit_others')) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  return v_record;
end;
$$;

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

  v_record := public.clarevo_lock_record(p_record_id);
  if v_record.version <> p_expected_version then
    raise exception 'versao_desatualizada' using errcode = 'PT409', detail = 'versao_atual=' || v_record.version;
  end if;
  perform public.clarevo_validate_record(v_uid, v_record.context_id, p_account_id, p_amount_cents, p_occurred_on, v_description, v_category);

  update public.financial_records
     set account_id = p_account_id,
         amount_cents = p_amount_cents,
         occurred_on = p_occurred_on,
         description = v_description,
         category = v_category,
         version = version + 1
   where id = p_record_id
  returning * into v_record;

  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id)
  values (v_uid, p_idempotency_key, 'editar', v_record.context_id, v_hash, v_record.id);

  return v_record;
end;
$$;

create or replace function public.delete_record(
  p_idempotency_key text,
  p_record_id uuid,
  p_expected_version integer
)
returns public.financial_records
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_hash text;
  v_op public.record_operations%rowtype;
  v_record public.financial_records%rowtype;
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  v_hash := md5(concat_ws('|', 'excluir', p_record_id, p_expected_version));
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

  v_record := public.clarevo_lock_record(p_record_id);
  if v_record.version <> p_expected_version then
    raise exception 'versao_desatualizada' using errcode = 'PT409', detail = 'versao_atual=' || v_record.version;
  end if;

  -- Exclusão lógica: some das consultas, mantém o rastro mínimo de autoria e operação.
  update public.financial_records
     set deleted_at = now(), deleted_by = v_uid, version = version + 1
   where id = p_record_id
  returning * into v_record;

  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id)
  values (v_uid, p_idempotency_key, 'excluir', v_record.context_id, v_hash, v_record.id);

  return v_record;
end;
$$;

-- Totais do mês pela mesma origem e critério do app (RLS se aplica: security invoker).
create or replace function public.month_totals(p_context_id uuid, p_month date)
returns table (received_cents bigint, paid_cents bigint, difference_cents bigint)
language plpgsql
stable
security invoker
set search_path = public
as $$
begin
  if p_month is null or extract(day from p_month) <> 1 then
    raise exception 'mes_invalido' using errcode = '22023';
  end if;
  if not public.context_permission(p_context_id, 'read') then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  return query
  select coalesce(sum(r.amount_cents) filter (where r.kind = 'receita'), 0)::bigint,
         coalesce(sum(r.amount_cents) filter (where r.kind = 'despesa'), 0)::bigint,
         (coalesce(sum(r.amount_cents) filter (where r.kind = 'receita'), 0)
          - coalesce(sum(r.amount_cents) filter (where r.kind = 'despesa'), 0))::bigint
    from public.financial_records r
   where r.context_id = p_context_id
     and r.deleted_at is null
     and r.occurred_on >= p_month
     and r.occurred_on < (p_month + interval '1 month')::date;
end;
$$;

-- Defesa adicional: identidade, autoria, contexto e tipo de um registro nunca mudam.
create or replace function public.financial_records_guard()
returns trigger
language plpgsql
as $$
begin
  if new.id <> old.id or new.created_by <> old.created_by or new.context_id <> old.context_id
     or new.kind <> old.kind or new.created_at <> old.created_at then
    raise exception 'campo_imutavel' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger financial_records_guard
  before update on public.financial_records
  for each row execute function public.financial_records_guard();

-- ---------------------------------------------------------------------------
-- Row Level Security (negado por padrão; só o que as políticas permitem)
-- ---------------------------------------------------------------------------
alter table public.persons enable row level security;
alter table public.financial_contexts enable row level security;
alter table public.context_memberships enable row level security;
alter table public.financial_accounts enable row level security;
alter table public.financial_records enable row level security;
alter table public.commitments enable row level security;
alter table public.record_operations enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_admins enable row level security;
alter table public.benefit_contracts enable row level security;
alter table public.licenses enable row level security;
alter table public.plan_entitlements enable row level security;

-- Pessoas: a própria e quem divide um contexto ativo (para "Quem vê estes dados?").
create policy persons_read on public.persons for select to authenticated using (
  id = auth.uid()
  or exists (
    select 1 from public.context_memberships m
    where m.person_id = persons.id and m.revoked_at is null and public.context_permission(m.context_id, 'read')
  )
);
create policy persons_update_self on public.persons for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy contexts_read on public.financial_contexts for select to authenticated
  using (public.context_permission(id, 'read'));

create policy memberships_read on public.context_memberships for select to authenticated
  using (person_id = auth.uid() or public.context_permission(context_id, 'read'));
-- O titular gerencia os demais vínculos; o vínculo de titular não pode ser alterado nem revogado por aqui
-- (todo contexto mantém um titular).
create policy memberships_manage on public.context_memberships for update to authenticated
  using (public.context_permission(context_id, 'manage') and role <> 'titular')
  with check (public.context_permission(context_id, 'manage') and role <> 'titular');

create policy accounts_read on public.financial_accounts for select to authenticated
  using (public.context_permission(context_id, 'read'));
create policy accounts_rename on public.financial_accounts for update to authenticated
  using (public.context_permission(context_id, 'write'))
  with check (public.context_permission(context_id, 'write'));

create policy records_read on public.financial_records for select to authenticated
  using (deleted_at is null and public.context_permission(context_id, 'read'));

create policy commitments_read on public.commitments for select to authenticated
  using (public.context_permission(context_id, 'read'));

create policy operations_read_own on public.record_operations for select to authenticated
  using (actor_id = auth.uid());

-- Empresa: administra contrato e licenças. NENHUMA política dá acesso a contextos, contas ou registros.
create policy organizations_admin_read on public.organizations for select to authenticated
  using (public.is_org_admin(id));
create policy organization_admins_read on public.organization_admins for select to authenticated
  using (public.is_org_admin(organization_id));
create policy contracts_admin_read on public.benefit_contracts for select to authenticated
  using (public.is_org_admin(organization_id));
create policy licenses_admin on public.licenses for all to authenticated
  using (exists (select 1 from public.benefit_contracts c where c.id = contract_id and public.is_org_admin(c.organization_id)))
  with check (exists (select 1 from public.benefit_contracts c where c.id = contract_id and public.is_org_admin(c.organization_id)));
create policy licenses_own_read on public.licenses for select to authenticated
  using (person_id = auth.uid());

create policy entitlements_own_read on public.plan_entitlements for select to authenticated
  using (person_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Privilégios: retirar os padrões e conceder só o necessário
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
grant execute on function public.create_record(text, uuid, uuid, public.record_kind, bigint, date, text, text) to authenticated;
grant execute on function public.update_record(text, uuid, integer, uuid, bigint, date, text, text) to authenticated;
grant execute on function public.delete_record(text, uuid, integer) to authenticated;
grant execute on function public.month_totals(uuid, date) to authenticated;
-- Usadas pelas políticas (avaliadas com os privilégios de quem consulta).
grant execute on function public.context_permission(uuid, text) to authenticated;
grant execute on function public.is_org_admin(uuid) to authenticated;
