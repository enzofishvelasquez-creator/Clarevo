-- Clarevo · migração 0014 · Painel de empresas: licenças por função, convite da empresa, indicadores de uso e cadastro pela equipe
-- (D-056, Ciclo M). Depois de 20261016000001_familia.sql.
-- Até aqui a empresa existia no modelo (organização, quem administra, contrato com vagas e plano, licença por e-mail e direito ao
-- plano), mas a escrita em `licenses` era direta e só a equipe do backend criava organização e contrato. Esta migração dá o caminho
-- completo, pelas recomendações M-1 a M-6 de docs/13_FAMILIA_E_EMPRESAS.md:
--   M-1 o RH vê vagas, convites, licenças e só as contagens de licenças (vagas, convidadas, ativas e encerradas), nunca finanças,
--       nem somadas, nem o uso do app (o indicador "pessoas que entraram no mês" saiu depois da revisão de segurança de 16/10/2026:
--       com o e-mail de cada licença à vista, ele permitiria identificar quem entrou);
--   M-2 o convite é um link da empresa, enviado pelo canal interno do RH (sem custo de envio pelo Clarevo);
--   M-3 a equipe Clarevo cria a organização, o contrato e a primeira pessoa administradora, por funções que só quem roda no SQL
--       Editor do Supabase executa (clarevo_staff_*, sem execute para public, anon, authenticated nem service_role);
--   M-4 fim do benefício: 30 dias de acesso pleno (plan_entitlements.valid_until) e depois o plano gratuito; encerrar nunca apaga
--       conta, histórico nem Família;
--   M-6 uma vaga por pessoa que recebe o benefício (licenças convidada + ativa nunca passam de seats).
-- Escrita de licença só por invite_licenses, renew_license_invite, cancel_license_invite, end_license e accept_license (mais
-- preview_license_invite, só leitura): autoria da sessão, chave de idempotência por pessoa (o mesmo espaço das outras operações),
-- hash em JSON e record_operations. O `insert`, o `update` e o `delete` diretos que a fundação concedeu em `licenses` saem, e a
-- política licenses_admin passa a ser só de leitura.
--
-- Invariantes:
-- E1. Licenças `convidada` + `ativa` de um contrato nunca passam de seats (gatilho licenses_seats_guard e trava consultiva do
--     contrato em todas as funções; clarevo_staff_update_contract não reduz as vagas abaixo do que está em uso).
-- E2. O código do convite tem 128 bits (32 hexadecimais) e aparece uma única vez, na resposta de invite_licenses ou de
--     renew_license_invite; o banco guarda só o SHA-256 (licenses.code_hash). Renovar troca o resumo (o código anterior deixa de
--     valer); aceitar, cancelar ou encerrar zeram o resumo.
-- E3. Convite inexistente, malformado, já usado, cancelado, de contrato fora da vigência ou de outro e-mail responde um único código,
--     convite_invalido, na prévia e no aceite, sem dizer o motivo. O e-mail da conta (confirmado) precisa ser igual ao e-mail do
--     convite, sem diferenciar maiúsculas.
-- E4. Uma licença ativa por pessoa (índice único parcial). Aceitar cria o direito ao plano de origem `beneficio`; encerrar fecha o
--     direito em fim + 30 dias e nunca apaga conta, registro, vínculo nem Família.
-- E5. A empresa não lê finanças: nenhuma função nem visão desta migração lê registros, contas, contas a pagar, gastos fixos, metas,
--     cartões, orçamento, Família, vínculos nem atividade. organization_usage lê só licenças e contratos e devolve só contagens
--     (nada de auth.users, nem do último acesso de ninguém).
-- E6. Cancelar um convite não apaga a linha: a licença passa a `encerrada` com cancelled_at (sem pessoa, sem ativação), e o e-mail
--     pode ser convidado de novo.
-- E7. Licença ativa de contrato já terminado não prende a pessoa: ao aceitar um convite novo, sob as travas, as licenças ativas dela
--     cujo contrato terminou (ends_on antes de hoje) são encerradas com ended_at no fim do contrato, e o direito ao plano delas
--     segue a regra dos 30 dias, contados do fim do contrato. my_benefit já mostra essa licença como encerrada.
-- E8. Apagar a conta de quem já teve licença é possível: a licença encerrada aceita só a troca de person_id para nulo (o
--     `on delete set null` da fundação) e o resto da linha não muda.
-- Ordem de travas: chave -> trava consultiva do contrato (e da pessoa, no aceite, com os contratos em ordem fixa) -> linha da licença. A atividade (gatilho de
-- record_operations, 0005) não conta nenhuma das cinco ações como anotação, e elas não têm contexto financeiro (context_id nulo).

-- ---------------------------------------------------------------------------
-- Organização, licença e direito ao plano
-- ---------------------------------------------------------------------------
alter table public.organizations
  add constraint organizations_name_check check (name = btrim(name) and char_length(name) between 1 and 120);

alter table public.licenses
  add column code_hash text,
  add column invited_at timestamptz not null default now(),
  add column cancelled_at timestamptz;
alter table public.licenses
  add constraint licenses_code_hash_check check (code_hash is null or code_hash ~ '^[0-9a-f]{64}$'),
  add constraint licenses_code_state_check check (code_hash is null or status = 'convidada'),
  add constraint licenses_cancel_check check (
    cancelled_at is null or (status = 'encerrada' and activated_at is null and person_id is null and ended_at is null and code_hash is null));
create unique index licenses_code_hash on public.licenses (code_hash) where code_hash is not null;
-- E4: uma licença ativa por pessoa e um direito ao plano por licença.
create unique index licenses_one_active_per_person on public.licenses (person_id) where status = 'ativa';
create unique index plan_entitlements_one_per_license on public.plan_entitlements (license_id) where license_id is not null;
comment on column public.licenses.code_hash is
  'SHA-256 (64 hexadecimais) do código de 128 bits do convite da empresa. O código nunca é gravado: aparece uma única vez, na resposta de invite_licenses ou de renew_license_invite. Só existe enquanto a licença está convidada.';
comment on column public.licenses.cancelled_at is
  'Quando o convite foi cancelado pela empresa (cancel_license_invite). A linha fica como encerrada, sem pessoa nem ativação.';
comment on column public.licenses.invited_at is
  'Quando o convite foi enviado pela última vez (criação ou novo link).';

-- Defesa adicional: identidade, contrato, e-mail e criação nunca mudam; o estado só anda para frente
-- (convidada -> ativa | encerrada por cancelamento; ativa -> encerrada) e uma licença encerrada não muda mais, com uma só
-- exceção: person_id pode passar a nulo (o `on delete set null` da fundação, quando a pessoa apaga a conta), desde que o resto da
-- linha continue igual. A licença ativa não aceita nem isso (ela exige pessoa): a empresa encerra a licença antes.
create or replace function public.licenses_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.id <> old.id or new.contract_id <> old.contract_id or new.invited_email <> old.invited_email or new.created_at <> old.created_at then
    raise exception 'campo_imutavel' using errcode = '42501';
  end if;
  if old.status = 'encerrada' then
    if new.status <> old.status
       or (new.person_id is distinct from old.person_id and not (new.person_id is null and old.person_id is not null))
       or new.activated_at is distinct from old.activated_at
       or new.ended_at is distinct from old.ended_at or new.cancelled_at is distinct from old.cancelled_at
       or new.code_hash is distinct from old.code_hash or new.invited_at <> old.invited_at then
      raise exception 'campo_imutavel' using errcode = '42501';
    end if;
  elsif old.status = 'ativa' then
    if new.status not in ('ativa', 'encerrada') or new.person_id is distinct from old.person_id
       or new.activated_at is distinct from old.activated_at or new.code_hash is not null or new.cancelled_at is not null
       or new.invited_at <> old.invited_at or (new.status = 'ativa') <> (new.ended_at is null) then
      raise exception 'campo_imutavel' using errcode = '42501';
    end if;
  else
    -- convidada: continua convidada (só o resumo do código e a data do envio mudam), ativa (aceite) ou encerrada (cancelamento).
    if new.status = 'convidada' then
      if new.person_id is not null or new.activated_at is not null or new.ended_at is not null or new.cancelled_at is not null then
        raise exception 'campo_imutavel' using errcode = '42501';
      end if;
    elsif new.status = 'ativa' then
      if new.person_id is null or new.activated_at is null or new.ended_at is not null or new.cancelled_at is not null or new.code_hash is not null then
        raise exception 'campo_imutavel' using errcode = '42501';
      end if;
    elsif new.cancelled_at is null or new.code_hash is not null or new.person_id is not null or new.activated_at is not null or new.ended_at is not null then
      raise exception 'campo_imutavel' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger licenses_guard
  before update on public.licenses
  for each row execute function public.licenses_guard();

-- E1: licenças convidada + ativa do contrato nunca passam das vagas, mesmo com escrita direta do backend. A trava consultiva é a
-- mesma das funções (reentrante na mesma transação).
create or replace function public.licenses_seats_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_seats integer;
  v_used integer;
begin
  if new.status in ('convidada', 'ativa') then
    perform pg_advisory_xact_lock(hashtext('contrato:' || new.contract_id::text));
    select seats into v_seats from public.benefit_contracts where id = new.contract_id;
    select count(*) into v_used from public.licenses
     where contract_id = new.contract_id and status in ('convidada', 'ativa') and id <> new.id;
    if v_used + 1 > v_seats then
      raise exception 'vagas_insuficientes' using errcode = 'PT409';
    end if;
  end if;
  return new;
end;
$$;

create trigger licenses_seats_guard
  before insert on public.licenses
  for each row execute function public.licenses_seats_guard();

-- O contrato não troca de organização, plano nem início, e as vagas nunca ficam abaixo do que está em uso.
create or replace function public.benefit_contracts_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.id <> old.id or new.organization_id <> old.organization_id or new.plan <> old.plan or new.starts_on <> old.starts_on
     or new.created_at <> old.created_at then
    raise exception 'campo_imutavel' using errcode = '42501';
  end if;
  if new.seats < old.seats then
    perform pg_advisory_xact_lock(hashtext('contrato:' || new.id::text));
    if (select count(*) from public.licenses where contract_id = new.id and status in ('convidada', 'ativa')) > new.seats then
      raise exception 'vagas_em_uso' using errcode = 'PT409';
    end if;
  end if;
  return new;
end;
$$;

create trigger benefit_contracts_guard
  before update on public.benefit_contracts
  for each row execute function public.benefit_contracts_guard();

-- ---------------------------------------------------------------------------
-- Operações: lista completa vigente (58 ações das migrações anteriores) mais as 5 das licenças. Elas não têm contexto financeiro
-- (context_id nulo) e apontam para o alvo em target_id: o contrato (convidar) ou a licença (renovar, cancelar, encerrar, aceitar).
-- license_result guarda, só em 'convidar_licencas', os ids das licenças do lote e o resultado de cada uma (nunca e-mail nem código),
-- para repetir a mesma chave devolver o mesmo resultado.
-- ---------------------------------------------------------------------------
alter table public.record_operations alter column context_id drop not null;
alter table public.record_operations add column license_result jsonb;
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
  'marcar_assinatura', 'revisar_assinaturas',
  'importar_extrato',
  'criar_familia', 'criar_convite_familia', 'cancelar_convite_familia', 'aceitar_convite_familia', 'sair_familia',
  'remover_membro_familia', 'alterar_papel_familia', 'transferir_titularidade_familia', 'encerrar_familia',
  'convidar_licencas', 'renovar_convite_licenca', 'cancelar_convite_licenca', 'encerrar_licenca', 'aceitar_licenca'));
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
                 'marcar_assinatura', 'importar_extrato',
                 'criar_familia', 'criar_convite_familia', 'cancelar_convite_familia', 'aceitar_convite_familia', 'sair_familia',
                 'remover_membro_familia', 'alterar_papel_familia', 'transferir_titularidade_familia', 'encerrar_familia',
                 'convidar_licencas', 'renovar_convite_licenca', 'cancelar_convite_licenca', 'encerrar_licenca', 'aceitar_licenca')
      and target_id is not null and record_id is null and commitment_id is null)
  or (action in ('pagar_fatura', 'desfazer_pagamento_fatura')
      and target_id is not null and record_id is not null and commitment_id is not null)
  or (action = 'criar_ocorrencia' and commitment_id is not null and target_id is not null and record_id is null)
  or (action in ('decidir_revisao', 'responder_guardar', 'revisar_assinaturas')
      and record_id is null and commitment_id is null and target_id is null));
-- Operação de licença não tem contexto financeiro; todas as outras têm. O resultado do lote só existe em convidar_licencas.
alter table public.record_operations add constraint record_operations_context_check check (
  (context_id is null) = (action in ('convidar_licencas', 'renovar_convite_licenca', 'cancelar_convite_licenca', 'encerrar_licenca', 'aceitar_licenca')));
alter table public.record_operations add constraint record_operations_license_check check (
  (license_result is not null) = (action = 'convidar_licencas'));

-- ---------------------------------------------------------------------------
-- Atividade: mesma função da 0013, sem contar as cinco ações das licenças (administrar o benefício não é anotar, e elas não têm
-- contexto financeiro).
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
  if new.action in ('decidir_revisao', 'responder_guardar', 'revisar_assinaturas',
                    'criar_familia', 'criar_convite_familia', 'cancelar_convite_familia', 'aceitar_convite_familia', 'sair_familia',
                    'remover_membro_familia', 'alterar_papel_familia', 'transferir_titularidade_familia', 'encerrar_familia',
                    'convidar_licencas', 'renovar_convite_licenca', 'cancelar_convite_licenca', 'encerrar_licenca', 'aceitar_licenca') then
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
-- Funções auxiliares (sem execute para authenticated)
-- ---------------------------------------------------------------------------

-- E-mail como a empresa e a pessoa o escrevem: sem os espaços das pontas e em minúsculas.
create or replace function public.clarevo_normalize_email(p_email text)
returns text
language sql
immutable
set search_path = public
as $$
  select lower(public.clarevo_trim(p_email));
$$;

-- E-mail comum, já normalizado: até 254 caracteres, parte local de 1 a 64 (letras, números e . _ % + -, sem ponto no início, no fim
-- nem repetido), domínio com pelo menos um ponto e último trecho de 2 a 63 caracteres. Sem acentos. A mesma regra de
-- packages/core/src/company.ts (isValidEmail).
create or replace function public.clarevo_email_valid(p_email text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select coalesce(
    char_length(p_email) <= 254
    and p_email ~ '^[a-z0-9._%+-]{1,64}@[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$'
    and p_email !~ '^\.|\.\.|\.@'
    and p_email ~ '\.[a-z0-9-]{2,63}$',
    false);
$$;

-- O contrato está em vigor no dia: começou e ainda não terminou.
create or replace function public.clarevo_contract_open(p_contract uuid, p_day date)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.benefit_contracts c
                  where c.id = p_contract and c.starts_on <= p_day and (c.ends_on is null or c.ends_on >= p_day));
$$;

-- O instante em que o contrato termina em p_ends_on: o último segundo do dia, em São Paulo (o contrato vale até esse dia, inclusive).
-- É o ended_at das licenças ativas que o aceite de um convite novo encerra por contrato terminado (E7).
create or replace function public.clarevo_contract_ended_at(p_ends_on date)
returns timestamptz
language sql
stable
set search_path = public
as $$
  select case when p_ends_on is null then null
              else (p_ends_on::timestamp + interval '23 hours 59 minutes 59 seconds') at time zone 'America/Sao_Paulo' end;
$$;

-- Até quando vale o acesso pleno quando o contrato termina em p_ends_on: 30 dias depois (M-4), no fim do dia em São Paulo.
create or replace function public.clarevo_contract_access_until(p_ends_on date)
returns timestamptz
language sql
stable
set search_path = public
as $$
  select case when p_ends_on is null then null
              else ((p_ends_on + 30)::timestamp + interval '23 hours 59 minutes 59 seconds') at time zone 'America/Sao_Paulo' end;
$$;

-- Licenças que ocupam vaga no contrato.
create or replace function public.clarevo_contract_used(p_contract uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer from public.licenses where contract_id = p_contract and status in ('convidada', 'ativa');
$$;

-- A licença como a empresa a lê: sem o resumo do código e sem a pessoa.
create or replace function public.clarevo_license_json(p_license uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('id', l.id, 'contract_id', l.contract_id, 'invited_email', l.invited_email, 'status', l.status,
                            'invited_at', l.invited_at, 'created_at', l.created_at, 'activated_at', l.activated_at,
                            'ended_at', l.ended_at, 'cancelled_at', l.cancelled_at)
    from public.licenses l where l.id = p_license;
$$;

-- O benefício como a pessoa o lê: a licença, o nome da organização, o plano e até quando vale o acesso pleno. Licença ainda ativa de
-- contrato que já terminou aparece como encerrada, com o fim do contrato (a mesma regra da visão my_benefit, E7).
create or replace function public.clarevo_benefit_json(p_license uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('license_id', l.id, 'organization_name', o.name, 'plan', c.plan,
                            'status', case when l.status = 'ativa' and c.ends_on < public.clarevo_today(auth.uid()) then 'encerrada' else l.status::text end,
                            'activated_at', l.activated_at,
                            'ended_at', case when l.status = 'ativa' and c.ends_on < public.clarevo_today(auth.uid())
                                             then public.clarevo_contract_ended_at(c.ends_on) else l.ended_at end,
                            'access_until', e.valid_until, 'contract_ends_on', c.ends_on)
    from public.licenses l
    join public.benefit_contracts c on c.id = l.contract_id
    join public.organizations o on o.id = c.organization_id
    left join public.plan_entitlements e on e.license_id = l.id
   where l.id = p_license;
$$;

-- Quem chama precisa administrar a organização do contrato (senão "não encontrado", sem revelar que existe).
create or replace function public.clarevo_require_contract_admin(p_contract uuid)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_contract is null or not exists (select 1 from public.benefit_contracts c where c.id = p_contract and public.is_org_admin(c.organization_id)) then
    raise exception 'nao_encontrado' using errcode = 'P0002';
  end if;
end;
$$;

-- O e-mail confirmado da conta de quem chama, normalizado; nulo se a conta não tem e-mail confirmado.
create or replace function public.clarevo_session_email()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select public.clarevo_normalize_email(u.email) from auth.users u where u.id = auth.uid() and u.email_confirmed_at is not null;
$$;

-- ---------------------------------------------------------------------------
-- O benefício de quem o recebe (M-1): a licença da própria pessoa, o nome da organização e o plano. Sem security_invoker e com
-- security_barrier, como as outras visões: o filtro (a licença é de quem consulta) é explícito, e a visão lê a organização e o
-- contrato com os privilégios de quem a criou. Nunca devolve vagas, outras licenças, e-mails nem a identidade de ninguém.
-- Licença ainda ativa de contrato que já terminou (ends_on antes de hoje) aparece como encerrada, com o fim do contrato em
-- ended_at (E7): o aceite de um convite novo a encerra de verdade, mas a pessoa já a lê assim antes disso. A visão só usa my_today()
-- (a única função que o papel authenticated executa aqui) e a mesma conta de clarevo_contract_ended_at, escrita por extenso.
-- ---------------------------------------------------------------------------
create view public.my_benefit with (security_barrier = true) as
select l.id as license_id,
       o.name as organization_name,
       c.plan,
       case when l.status = 'ativa' and c.ends_on < public.my_today() then 'encerrada' else l.status::text end as status,
       l.activated_at,
       case when l.status = 'ativa' and c.ends_on < public.my_today()
            then (c.ends_on::timestamp + interval '23 hours 59 minutes 59 seconds') at time zone 'America/Sao_Paulo' else l.ended_at end as ended_at,
       e.valid_until as access_until,
       c.ends_on as contract_ends_on
  from public.licenses l
  join public.benefit_contracts c on c.id = l.contract_id
  join public.organizations o on o.id = c.organization_id
  left join public.plan_entitlements e on e.license_id = l.id
 where l.person_id = auth.uid() and l.activated_at is not null;
comment on view public.my_benefit is
  'O benefício que a própria pessoa recebe da empresa: nome da organização, plano, desde quando e, se encerrado, até quando vale o acesso pleno. Só as licenças dela.';

-- ---------------------------------------------------------------------------
-- Equipe Clarevo (M-3). Só quem roda no SQL Editor do Supabase executa: sem execute para public, anon nem authenticated.
-- Cria a organização, o contrato e a primeira pessoa administradora, que precisa já ter conta (e-mail confirmado e primeira conta
-- criada no app). O e-mail é procurado em auth.users sem diferenciar maiúsculas. Sem conta, erro claro (com dica).
-- ---------------------------------------------------------------------------
create or replace function public.clarevo_staff_find_admin(p_email text)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_email text := public.clarevo_normalize_email(p_email);
  v_user auth.users%rowtype;
begin
  if not public.clarevo_email_valid(v_email) then
    raise exception 'email_invalido' using errcode = '22023', hint = 'Confira o e-mail da pessoa administradora.';
  end if;
  select * into v_user from auth.users u where public.clarevo_normalize_email(u.email) = v_email order by u.id limit 1;
  if not found then
    raise exception 'administrador_sem_conta' using errcode = 'P0002',
      hint = 'A pessoa administradora precisa criar a conta no app com este e-mail antes. Peça que ela crie a conta, confirme o e-mail e tente de novo.';
  end if;
  if v_user.email_confirmed_at is null then
    raise exception 'administrador_sem_conta' using errcode = 'P0002',
      hint = 'A conta existe, mas o e-mail ainda não foi confirmado. Peça que a pessoa confirme o e-mail e tente de novo.';
  end if;
  if not exists (select 1 from public.persons p where p.id = v_user.id) then
    raise exception 'administrador_sem_espaco' using errcode = 'P0002',
      hint = 'A pessoa confirmou o e-mail, mas ainda não terminou a primeira entrada no app. Peça que ela abra o app e crie a primeira conta.';
  end if;
  return v_user.id;
end;
$$;

create or replace function public.clarevo_staff_create_organization(
  p_name text,
  p_seats integer,
  p_plan text,
  p_starts_on date,
  p_ends_on date,
  p_admin_email text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_name text := public.clarevo_trim(p_name);
  v_admin uuid;
  v_org uuid;
  v_contract uuid;
begin
  if char_length(v_name) not between 1 and 120 then
    raise exception 'nome_da_organizacao_invalido' using errcode = '22023', hint = 'Use de 1 a 120 caracteres.';
  end if;
  if p_seats is null or p_seats < 1 or p_seats > 1000000 then
    raise exception 'vagas_invalidas' using errcode = '22023', hint = 'As vagas são um número inteiro maior que zero.';
  end if;
  if p_plan is null or p_plan not in ('individual', 'familiar') then
    raise exception 'plano_invalido' using errcode = '22023', hint = 'O plano é individual ou familiar.';
  end if;
  if p_starts_on is null or (p_ends_on is not null and p_ends_on < p_starts_on) then
    raise exception 'datas_invalidas' using errcode = '22023', hint = 'Informe o início e, se houver, um fim que não seja antes do início.';
  end if;
  if exists (select 1 from public.organizations o where lower(o.name) = lower(v_name)) then
    raise exception 'organizacao_ja_existe' using errcode = 'PT409',
      hint = 'Já existe uma organização com este nome. Para outra pessoa administradora, use clarevo_staff_add_org_admin.';
  end if;
  v_admin := public.clarevo_staff_find_admin(p_admin_email);

  insert into public.organizations (name) values (v_name) returning id into v_org;
  insert into public.benefit_contracts (organization_id, seats, plan, starts_on, ends_on)
  values (v_org, p_seats, p_plan, p_starts_on, p_ends_on) returning id into v_contract;
  insert into public.organization_admins (organization_id, person_id) values (v_org, v_admin);

  return jsonb_build_object('organization_id', v_org, 'contract_id', v_contract, 'admin_person_id', v_admin);
end;
$$;

create or replace function public.clarevo_staff_add_org_admin(p_org uuid, p_admin_email text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_admin uuid;
  v_added boolean;
begin
  if p_org is null or not exists (select 1 from public.organizations where id = p_org) then
    raise exception 'organizacao_nao_encontrada' using errcode = 'P0002';
  end if;
  v_admin := public.clarevo_staff_find_admin(p_admin_email);
  insert into public.organization_admins (organization_id, person_id) values (p_org, v_admin) on conflict do nothing;
  get diagnostics v_added = row_count;
  return jsonb_build_object('organization_id', p_org, 'admin_person_id', v_admin, 'already_admin', not v_added);
end;
$$;

-- Vagas e fim do contrato. As vagas nunca ficam abaixo das licenças convidada + ativa (vagas_em_uso). O fim (nulo = sem fim) não
-- pode ser antes do início. Mudar o fim também move o fim do acesso pleno das licenças ativas (fim + 30 dias, M-4).
create or replace function public.clarevo_staff_update_contract(p_contract uuid, p_seats integer, p_ends_on date)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_contract public.benefit_contracts%rowtype;
begin
  select * into v_contract from public.benefit_contracts where id = p_contract;
  if not found then
    raise exception 'contrato_nao_encontrado' using errcode = 'P0002';
  end if;
  perform pg_advisory_xact_lock(hashtext('contrato:' || p_contract::text));
  if p_seats is null or p_seats < 1 or p_seats > 1000000 then
    raise exception 'vagas_invalidas' using errcode = '22023', hint = 'As vagas são um número inteiro maior que zero.';
  end if;
  if p_ends_on is not null and p_ends_on < v_contract.starts_on then
    raise exception 'datas_invalidas' using errcode = '22023', hint = 'O fim não pode ser antes do início do contrato.';
  end if;
  if p_seats < public.clarevo_contract_used(p_contract) then
    raise exception 'vagas_em_uso' using errcode = 'PT409',
      hint = 'Há mais licenças convidadas e ativas do que as vagas pedidas. Cancele convites ou encerre licenças antes.';
  end if;
  update public.benefit_contracts set seats = p_seats, ends_on = p_ends_on where id = p_contract;
  -- Licenças ativas seguem o contrato: com fim, o acesso pleno vai até o fim + 30 dias; sem fim, fica aberto.
  update public.plan_entitlements e
     set valid_until = public.clarevo_contract_access_until(p_ends_on)
   where e.license_id in (select l.id from public.licenses l where l.contract_id = p_contract and l.status = 'ativa');
  return jsonb_build_object('contract_id', p_contract, 'seats', p_seats, 'ends_on', p_ends_on,
                            'in_use', public.clarevo_contract_used(p_contract));
end;
$$;

revoke all on function public.clarevo_staff_find_admin(text) from public, anon, authenticated;
revoke all on function public.clarevo_staff_create_organization(text, integer, text, date, date, text) from public, anon, authenticated;
revoke all on function public.clarevo_staff_add_org_admin(uuid, text) from public, anon, authenticated;
revoke all on function public.clarevo_staff_update_contract(uuid, integer, date) from public, anon, authenticated;
-- No Supabase, os privilégios padrão dão execute também ao papel service_role (a chave de serviço, usada por backends e funções de
-- borda). Estas funções são só de quem roda no SQL Editor (o dono do banco), então ele também perde o execute. O papel pode não
-- existir (Postgres comum), por isso a conferência em pg_roles.
do $$
declare
  f text;
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    foreach f in array array['clarevo_staff_find_admin(text)', 'clarevo_staff_create_organization(text, integer, text, date, date, text)',
                             'clarevo_staff_add_org_admin(uuid, text)', 'clarevo_staff_update_contract(uuid, integer, date)'] loop
      execute format('revoke all on function public.%s from service_role', f);
    end loop;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Convidar pessoas (M-2). Só quem administra a organização do contrato. Recebe uma lista de e-mails; normaliza (sem espaços nas
-- pontas, minúsculas) e tira os repetidos, mantendo a ordem. Recusa e-mail inválido (email_invalido, detalhe item=N) e lista vazia
-- ou com mais de 500 (itens_invalidos). O contrato precisa estar em vigor (contrato_nao_vigente) e as licenças convidada + ativa
-- não passam de seats (vagas_insuficientes, detalhe disponiveis=N): a conta é feita antes de gravar, tudo ou nada. E-mail que já tem
-- licença aberta (convidada ou ativa) no contrato volta como "ja_convidado", sem novo código. Os demais ganham uma licença
-- convidada e um código de 128 bits, devolvido uma única vez.
-- Ordem: sessão; chave; repetição; contrato lido por quem administra (nao_encontrado); trava do contrato; lista; vigência; vagas.
-- Retorno: {contract_id, results: [{email, outcome: 'convidada' | 'ja_convidado', code, license}], seats, in_use}. Repetir a mesma
-- chave devolve os mesmos resultados com code nulo (quem perdeu a resposta pede um novo link com renew_license_invite).
-- ---------------------------------------------------------------------------
create or replace function public.invite_licenses(p_contract uuid, p_emails text[], p_key text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_list text[];
  v_hash text;
  v_op public.record_operations%rowtype;
  v_contract public.benefit_contracts%rowtype;
  v_org uuid;
  v_i integer;
  v_new integer;
  v_used integer;
  v_lic public.licenses%rowtype;
  v_code text;
  v_results jsonb := '[]'::jsonb;
  v_stored jsonb := '[]'::jsonb;
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  perform public.clarevo_check_key(p_key);
  -- Os e-mails normalizados, sem repetidos, na ordem em que aparecem.
  select coalesce(array_agg(s.e order by s.first_pos), '{}') into v_list
    from (select n.e, min(t.ord) as first_pos
            from unnest(coalesce(p_emails, '{}')) with ordinality as t(raw, ord)
            cross join lateral (select public.clarevo_normalize_email(t.raw) as e) n
           group by n.e) s;
  v_hash := md5(jsonb_build_array('convidar_licencas', p_contract, to_jsonb(v_list))::text);
  perform pg_advisory_xact_lock(hashtext('op:' || v_uid::text || ':' || p_key));

  select * into v_op from public.record_operations where actor_id = v_uid and idempotency_key = p_key;
  if found then
    if v_op.action <> 'convidar_licencas' or v_op.request_hash <> v_hash then
      raise exception 'chave_reutilizada' using errcode = 'PT409';
    end if;
    perform public.clarevo_require_contract_admin(v_op.target_id);
    select coalesce(jsonb_agg(jsonb_build_object('email', l.invited_email, 'outcome', r.outcome, 'code', null::text,
                                                 'license', public.clarevo_license_json(l.id)) order by r.ord), '[]'::jsonb)
      into v_results
      from jsonb_to_recordset(v_op.license_result) as r(ord integer, license_id uuid, outcome text)
      join public.licenses l on l.id = r.license_id;
    select seats into v_i from public.benefit_contracts where id = v_op.target_id;
    return jsonb_build_object('contract_id', v_op.target_id, 'results', v_results, 'seats', v_i,
                              'in_use', public.clarevo_contract_used(v_op.target_id));
  end if;

  select * into v_contract from public.benefit_contracts where id = p_contract;
  v_org := v_contract.organization_id;
  if not found or not public.is_org_admin(v_org) then
    raise exception 'nao_encontrado' using errcode = 'P0002';
  end if;
  perform pg_advisory_xact_lock(hashtext('contrato:' || p_contract::text));
  select * into v_contract from public.benefit_contracts where id = p_contract;

  if cardinality(v_list) not between 1 and 500 then
    raise exception 'itens_invalidos' using errcode = '22023';
  end if;
  for v_i in 1 .. cardinality(v_list) loop
    if not public.clarevo_email_valid(v_list[v_i]) then
      raise exception 'email_invalido' using errcode = '22023', detail = 'item=' || v_i;
    end if;
  end loop;
  if not public.clarevo_contract_open(p_contract, public.clarevo_today(v_uid)) then
    raise exception 'contrato_nao_vigente' using errcode = 'PT409';
  end if;
  select count(*)::integer into v_new
    from unnest(v_list) e
   where not exists (select 1 from public.licenses l
                      where l.contract_id = p_contract and lower(l.invited_email) = e and l.status <> 'encerrada');
  v_used := public.clarevo_contract_used(p_contract);
  if v_used + v_new > v_contract.seats then
    raise exception 'vagas_insuficientes' using errcode = 'PT409', detail = 'disponiveis=' || greatest(v_contract.seats - v_used, 0);
  end if;

  for v_i in 1 .. cardinality(v_list) loop
    select * into v_lic from public.licenses
     where contract_id = p_contract and lower(invited_email) = v_list[v_i] and status <> 'encerrada';
    if found then
      v_results := v_results || jsonb_build_array(jsonb_build_object('email', v_list[v_i], 'outcome', 'ja_convidado', 'code', null::text,
                                                                     'license', public.clarevo_license_json(v_lic.id)));
      v_stored := v_stored || jsonb_build_array(jsonb_build_object('ord', v_i, 'license_id', v_lic.id, 'outcome', 'ja_convidado'));
    else
      v_code := encode(gen_random_bytes(16), 'hex');
      insert into public.licenses (contract_id, invited_email, code_hash)
      values (p_contract, v_list[v_i], encode(sha256(convert_to(v_code, 'UTF8')), 'hex'))
      returning * into v_lic;
      v_results := v_results || jsonb_build_array(jsonb_build_object('email', v_list[v_i], 'outcome', 'convidada', 'code', v_code,
                                                                     'license', public.clarevo_license_json(v_lic.id)));
      v_stored := v_stored || jsonb_build_array(jsonb_build_object('ord', v_i, 'license_id', v_lic.id, 'outcome', 'convidada'));
    end if;
  end loop;

  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id, target_id, license_result)
  values (v_uid, p_key, 'convidar_licencas', null, v_hash, null, null, p_contract, v_stored);

  return jsonb_build_object('contract_id', p_contract, 'results', v_results, 'seats', v_contract.seats,
                            'in_use', public.clarevo_contract_used(p_contract));
end;
$$;

-- ---------------------------------------------------------------------------
-- Reenviar (novo link). Só quem administra a organização da licença; só licença convidada (licenca_nao_convidada); contrato em
-- vigor (contrato_nao_vigente). Gera um código novo e troca o resumo: o link anterior deixa de valer (E2).
-- Retorno: {license, code}. Repetir a mesma chave devolve a licença com code nulo.
-- ---------------------------------------------------------------------------
create or replace function public.renew_license_invite(p_license uuid, p_key text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_hash text;
  v_op public.record_operations%rowtype;
  v_contract uuid;
  v_lic public.licenses%rowtype;
  v_code text;
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  perform public.clarevo_check_key(p_key);
  v_hash := md5(jsonb_build_array('renovar_convite_licenca', p_license)::text);
  perform pg_advisory_xact_lock(hashtext('op:' || v_uid::text || ':' || p_key));

  select * into v_op from public.record_operations where actor_id = v_uid and idempotency_key = p_key;
  if found then
    if v_op.action <> 'renovar_convite_licenca' or v_op.request_hash <> v_hash then
      raise exception 'chave_reutilizada' using errcode = 'PT409';
    end if;
    perform public.clarevo_require_contract_admin((select contract_id from public.licenses where id = v_op.target_id));
    return jsonb_build_object('license', public.clarevo_license_json(v_op.target_id), 'code', null);
  end if;

  -- O contrato de uma licença nunca muda: ler antes da trava é seguro.
  select contract_id into v_contract from public.licenses where id = p_license;
  perform public.clarevo_require_contract_admin(v_contract);
  perform pg_advisory_xact_lock(hashtext('contrato:' || v_contract::text));
  select * into v_lic from public.licenses where id = p_license for update;
  if v_lic.status <> 'convidada' then
    raise exception 'licenca_nao_convidada' using errcode = 'PT409';
  end if;
  if not public.clarevo_contract_open(v_contract, public.clarevo_today(v_uid)) then
    raise exception 'contrato_nao_vigente' using errcode = 'PT409';
  end if;

  v_code := encode(gen_random_bytes(16), 'hex');
  update public.licenses
     set code_hash = encode(sha256(convert_to(v_code, 'UTF8')), 'hex'), invited_at = now()
   where id = p_license;

  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id, target_id)
  values (v_uid, p_key, 'renovar_convite_licenca', null, v_hash, null, null, p_license);

  return jsonb_build_object('license', public.clarevo_license_json(p_license), 'code', v_code);
end;
$$;

-- ---------------------------------------------------------------------------
-- Cancelar um convite. Só quem administra a organização da licença; só licença convidada (licenca_nao_convidada). A linha não é
-- apagada: vira `encerrada` com cancelled_at, sem resumo de código (E6); a vaga volta e o e-mail pode ser convidado de novo. Convite
-- já cancelado segue cancelado, sem erro. Retorno: {license}.
-- ---------------------------------------------------------------------------
create or replace function public.cancel_license_invite(p_license uuid, p_key text)
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
  v_contract uuid;
  v_lic public.licenses%rowtype;
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  perform public.clarevo_check_key(p_key);
  v_hash := md5(jsonb_build_array('cancelar_convite_licenca', p_license)::text);
  perform pg_advisory_xact_lock(hashtext('op:' || v_uid::text || ':' || p_key));

  select * into v_op from public.record_operations where actor_id = v_uid and idempotency_key = p_key;
  if found then
    if v_op.action <> 'cancelar_convite_licenca' or v_op.request_hash <> v_hash then
      raise exception 'chave_reutilizada' using errcode = 'PT409';
    end if;
    perform public.clarevo_require_contract_admin((select contract_id from public.licenses where id = v_op.target_id));
    return jsonb_build_object('license', public.clarevo_license_json(v_op.target_id));
  end if;

  select contract_id into v_contract from public.licenses where id = p_license;
  perform public.clarevo_require_contract_admin(v_contract);
  perform pg_advisory_xact_lock(hashtext('contrato:' || v_contract::text));
  select * into v_lic from public.licenses where id = p_license for update;
  if v_lic.status = 'convidada' then
    update public.licenses set status = 'encerrada', cancelled_at = now(), code_hash = null where id = p_license;
  elsif not (v_lic.status = 'encerrada' and v_lic.cancelled_at is not null) then
    raise exception 'licenca_nao_convidada' using errcode = 'PT409';
  end if;

  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id, target_id)
  values (v_uid, p_key, 'cancelar_convite_licenca', null, v_hash, null, null, p_license);

  return jsonb_build_object('license', public.clarevo_license_json(p_license));
end;
$$;

-- ---------------------------------------------------------------------------
-- Encerrar a licença (M-4). Só quem administra a organização da licença; só licença ativa (licenca_nao_ativa). Marca `encerrada` e
-- ended_at e fecha o direito ao plano (plan_entitlements.valid_until) em fim + 30 dias, nunca depois do que o contrato já previa.
-- Nunca apaga nem muda conta, registro, vínculo ou Família da pessoa (E4). Retorno: {license}.
-- ---------------------------------------------------------------------------
create or replace function public.end_license(p_license uuid, p_key text)
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
  v_contract uuid;
  v_lic public.licenses%rowtype;
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  perform public.clarevo_check_key(p_key);
  v_hash := md5(jsonb_build_array('encerrar_licenca', p_license)::text);
  perform pg_advisory_xact_lock(hashtext('op:' || v_uid::text || ':' || p_key));

  select * into v_op from public.record_operations where actor_id = v_uid and idempotency_key = p_key;
  if found then
    if v_op.action <> 'encerrar_licenca' or v_op.request_hash <> v_hash then
      raise exception 'chave_reutilizada' using errcode = 'PT409';
    end if;
    perform public.clarevo_require_contract_admin((select contract_id from public.licenses where id = v_op.target_id));
    return jsonb_build_object('license', public.clarevo_license_json(v_op.target_id));
  end if;

  select contract_id into v_contract from public.licenses where id = p_license;
  perform public.clarevo_require_contract_admin(v_contract);
  perform pg_advisory_xact_lock(hashtext('contrato:' || v_contract::text));
  select * into v_lic from public.licenses where id = p_license for update;
  if v_lic.status <> 'ativa' then
    raise exception 'licenca_nao_ativa' using errcode = 'PT409';
  end if;

  update public.licenses set status = 'encerrada', ended_at = now() where id = p_license;
  update public.plan_entitlements
     set valid_until = least(coalesce(valid_until, 'infinity'::timestamptz), now() + interval '30 days')
   where license_id = p_license;

  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id, target_id)
  values (v_uid, p_key, 'encerrar_licenca', null, v_hash, null, null, p_license);

  return jsonb_build_object('license', public.clarevo_license_json(p_license));
end;
$$;

-- ---------------------------------------------------------------------------
-- Prévia do convite da empresa (só leitura, E3): antes de aceitar, a pessoa vê só o nome da organização e o plano. Convite com
-- formato inválido, que não existe, usado, cancelado, trocado por um link novo, de contrato fora da vigência ou de outro e-mail
-- responde sempre convite_invalido, sem revelar qual caso. Exige sessão; o papel anônimo não executa.
-- Retorno: {organization_name, plan}.
-- ---------------------------------------------------------------------------
create or replace function public.preview_license_invite(p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_hash text := public.clarevo_invite_hash(p_code);
  v_lic public.licenses%rowtype;
  v_email text;
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  v_email := public.clarevo_session_email();
  if v_hash is not null and v_email is not null then
    select * into v_lic from public.licenses where code_hash = v_hash;
  end if;
  if v_hash is null or v_email is null or v_lic.id is null or v_lic.status <> 'convidada'
     or public.clarevo_normalize_email(v_lic.invited_email) <> v_email
     or not public.clarevo_contract_open(v_lic.contract_id, public.clarevo_today(v_uid)) then
    raise exception 'convite_invalido' using errcode = 'P0002';
  end if;
  return (select jsonb_build_object('organization_name', o.name, 'plan', c.plan)
            from public.benefit_contracts c join public.organizations o on o.id = c.organization_id
           where c.id = v_lic.contract_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Aceitar o convite da empresa (E3, E4). A pessoa logada aceita; o e-mail confirmado da conta precisa ser igual ao do convite (sem
-- diferenciar maiúsculas), senão convite_invalido, o mesmo código de qualquer convite que não vale. Ordem: sessão; chave; repetição;
-- espaço pessoal da pessoa (sem_permissao, antes de olhar o código: quem ainda não tem espaço recebe a mesma resposta para qualquer
-- código); depois, sob as travas da pessoa e dos contratos, tudo de novo: convite_invalido; encerra as licenças ativas da pessoa
-- cujo contrato já terminou (E7); ja_tem_licenca (uma licença ativa por pessoa). Marca a licença `ativa` com a pessoa e a data,
-- zera o resumo do código e cria o direito ao plano de origem `beneficio` (valid_until só se o contrato tem fim: fim + 30 dias).
-- Repetir a mesma chave devolve o mesmo resultado.
-- Travas: a da pessoa e, em ordem fixa de contrato (para dois aceites cruzados nunca se travarem), a do contrato do convite e as dos
-- contratos já terminados das licenças ativas dela.
-- Retorno: {license_id, organization_name, plan, status, activated_at, ended_at, access_until, contract_ends_on}.
-- ---------------------------------------------------------------------------
create or replace function public.accept_license(p_code text, p_key text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_code_hash text := public.clarevo_invite_hash(p_code);
  v_hash text;
  v_op public.record_operations%rowtype;
  v_lic public.licenses%rowtype;
  v_contract public.benefit_contracts%rowtype;
  v_email text;
  v_today date;
  v_lock uuid;
  v_old record;
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  perform public.clarevo_check_key(p_key);
  -- O pedido leva só o resumo do código, nunca o código.
  v_hash := md5(jsonb_build_array('aceitar_licenca', v_code_hash)::text);
  perform pg_advisory_xact_lock(hashtext('op:' || v_uid::text || ':' || p_key));

  select * into v_op from public.record_operations where actor_id = v_uid and idempotency_key = p_key;
  if found then
    if v_op.action <> 'aceitar_licenca' or v_op.request_hash <> v_hash then
      raise exception 'chave_reutilizada' using errcode = 'PT409';
    end if;
    if not exists (select 1 from public.licenses where id = v_op.target_id and person_id = v_uid) then
      raise exception 'nao_encontrado' using errcode = 'P0002';
    end if;
    return public.clarevo_benefit_json(v_op.target_id);
  end if;

  if not exists (select 1 from public.persons where id = v_uid) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  v_email := public.clarevo_session_email();
  if v_code_hash is null or v_email is null then
    raise exception 'convite_invalido' using errcode = 'P0002';
  end if;
  select * into v_lic from public.licenses where code_hash = v_code_hash;
  if not found then
    raise exception 'convite_invalido' using errcode = 'P0002';
  end if;

  v_today := public.clarevo_today(v_uid);
  perform pg_advisory_xact_lock(hashtext('licenca:p:' || v_uid::text));
  for v_lock in
    select s.contract_id
      from (select v_lic.contract_id
            union
            select l.contract_id from public.licenses l join public.benefit_contracts c on c.id = l.contract_id
             where l.person_id = v_uid and l.status = 'ativa' and c.ends_on < v_today) s
     order by s.contract_id
  loop
    perform pg_advisory_xact_lock(hashtext('contrato:' || v_lock::text));
  end loop;
  -- Com as travas, relê a licença e confere de novo (uso único, troca de link e cancelamento sob corrida).
  select * into v_lic from public.licenses where id = v_lic.id for update;
  select * into v_contract from public.benefit_contracts where id = v_lic.contract_id;
  if v_lic.status <> 'convidada' or v_lic.code_hash is distinct from v_code_hash
     or public.clarevo_normalize_email(v_lic.invited_email) <> v_email
     or not public.clarevo_contract_open(v_lic.contract_id, v_today) then
    raise exception 'convite_invalido' using errcode = 'P0002';
  end if;
  -- E7: a licença ativa de um contrato que já terminou não prende a pessoa. Encerra no fim do contrato; o direito ao plano dela
  -- segue a regra dos 30 dias, contados a partir do fim do contrato (nunca depois do que já valia). Não apaga nada da pessoa.
  for v_old in
    select l.id, c.ends_on
      from public.licenses l join public.benefit_contracts c on c.id = l.contract_id
     where l.person_id = v_uid and l.status = 'ativa' and c.ends_on < v_today
     order by l.id
       for update of l
  loop
    update public.licenses set status = 'encerrada', ended_at = public.clarevo_contract_ended_at(v_old.ends_on) where id = v_old.id;
    update public.plan_entitlements
       set valid_until = least(coalesce(valid_until, 'infinity'::timestamptz), public.clarevo_contract_access_until(v_old.ends_on))
     where license_id = v_old.id;
  end loop;
  if exists (select 1 from public.licenses where person_id = v_uid and status = 'ativa') then
    raise exception 'ja_tem_licenca' using errcode = 'PT409';
  end if;

  update public.licenses
     set status = 'ativa', person_id = v_uid, activated_at = now(), code_hash = null
   where id = v_lic.id;
  insert into public.plan_entitlements (person_id, source, license_id, plan, valid_from, valid_until)
  values (v_uid, 'beneficio', v_lic.id, v_contract.plan, now(), public.clarevo_contract_access_until(v_contract.ends_on));

  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id, target_id)
  values (v_uid, p_key, 'aceitar_licenca', null, v_hash, null, null, v_lic.id);

  return public.clarevo_benefit_json(v_lic.id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Contagens de licenças (M-1). Só quem administra a organização (nao_encontrado para qualquer outra pessoa). Devolve vagas dos
-- contratos em vigor e licenças convidadas, ativas e encerradas (depois de ativadas; convites cancelados não contam): as mesmas
-- contagens que o RH já vê na lista de licenças. O indicador "pessoas que entraram no mês" (último acesso, auth.users) saiu depois da
-- revisão de segurança de 16/10/2026: o RH vê o e-mail de cada licença e pode controlar contas próprias, então um número de acessos
-- permitiria identificar quem entrou (e o último acesso nem muda quando a sessão é renovada). Lê só licenças e contratos: nunca
-- registros, contas, metas, cartões, Família, atividade nem auth.users, e nunca devolve pessoas.
-- Retorno: {organization_id, seats, invited, active, ended}.
-- ---------------------------------------------------------------------------
create or replace function public.organization_usage(p_org uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_today date;
  v_seats integer;
  v_invited integer;
  v_active integer;
  v_ended integer;
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  if p_org is null or not public.is_org_admin(p_org) then
    raise exception 'nao_encontrado' using errcode = 'P0002';
  end if;
  v_today := public.clarevo_today(v_uid);

  select coalesce(sum(c.seats), 0)::integer into v_seats
    from public.benefit_contracts c
   where c.organization_id = p_org and c.starts_on <= v_today and (c.ends_on is null or c.ends_on >= v_today);
  select count(*) filter (where l.status = 'convidada')::integer,
         count(*) filter (where l.status = 'ativa')::integer,
         count(*) filter (where l.status = 'encerrada' and l.cancelled_at is null)::integer
    into v_invited, v_active, v_ended
    from public.licenses l join public.benefit_contracts c on c.id = l.contract_id
   where c.organization_id = p_org;

  return jsonb_build_object('organization_id', p_org, 'seats', v_seats, 'invited', v_invited, 'active', v_active, 'ended', v_ended);
end;
$$;

-- ---------------------------------------------------------------------------
-- Políticas: quem administra a empresa só lê as licenças do próprio contrato (a escrita é só pelas funções). A pessoa continua
-- lendo a própria licença (licenses_own_read, da fundação).
-- ---------------------------------------------------------------------------
drop policy licenses_admin on public.licenses;
create policy licenses_admin on public.licenses for select to authenticated
  using (exists (select 1 from public.benefit_contracts c where c.id = contract_id and public.is_org_admin(c.organization_id)));

-- ---------------------------------------------------------------------------
-- Privilégios: retirar os padrões e conceder só o necessário (a mesma lista da 0013, sem a escrita direta em licenses, mais as
-- funções e a visão desta migração)
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;
-- As funções da equipe Clarevo também não são executáveis por service_role (de novo aqui, para o estado final não depender da ordem
-- dos blocos acima nem de privilégios padrão concedidos depois).
do $$
declare
  f text;
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    foreach f in array array['clarevo_staff_find_admin(text)', 'clarevo_staff_create_organization(text, integer, text, date, date, text)',
                             'clarevo_staff_add_org_admin(uuid, text)', 'clarevo_staff_update_contract(uuid, integer, date)'] loop
      execute format('revoke all on function public.%s from service_role', f);
    end loop;
  end if;
end $$;

grant usage on schema public to authenticated;
grant select on all tables in schema public to authenticated;
grant update (display_name, locale) on public.persons to authenticated;
grant update (name) on public.financial_accounts to authenticated;

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

grant execute on function public.import_records(text, uuid, text, uuid, jsonb) to authenticated;

grant execute on function public.create_family(text, text) to authenticated;
grant execute on function public.create_family_invite(uuid, text, text) to authenticated;
grant execute on function public.cancel_family_invite(uuid, text) to authenticated;
grant execute on function public.preview_family_invite(text) to authenticated;
grant execute on function public.accept_family_invite(text, text) to authenticated;
grant execute on function public.leave_family(uuid, text) to authenticated;
grant execute on function public.remove_family_member(uuid, uuid, text) to authenticated;
grant execute on function public.set_member_role(uuid, uuid, text, text) to authenticated;
grant execute on function public.transfer_family_ownership(uuid, uuid, text) to authenticated;
grant execute on function public.end_family(uuid, text) to authenticated;

-- Empresa (D-056): as licenças só mudam por estas funções; a equipe Clarevo (clarevo_staff_*) não tem execute para ninguém com sessão.
grant execute on function public.invite_licenses(uuid, text[], text) to authenticated;
grant execute on function public.renew_license_invite(uuid, text) to authenticated;
grant execute on function public.cancel_license_invite(uuid, text) to authenticated;
grant execute on function public.end_license(uuid, text) to authenticated;
grant execute on function public.preview_license_invite(text) to authenticated;
grant execute on function public.accept_license(text, text) to authenticated;
grant execute on function public.organization_usage(uuid) to authenticated;

revoke select on public.family_invites from authenticated;
grant select (id, context_id, created_by, role, expires_at, used_at, used_by, cancelled_at, created_at)
  on public.family_invites to authenticated;

-- Licenças: a empresa lê as do próprio contrato e a pessoa lê a própria, sempre sem o resumo do código e sem a identidade de quem
-- aceitou (a pessoa lê o próprio benefício pela visão my_benefit). Nenhum insert, update nem delete direto.
revoke select on public.licenses from authenticated;
grant select (id, contract_id, invited_email, status, invited_at, activated_at, ended_at, cancelled_at, created_at)
  on public.licenses to authenticated;
