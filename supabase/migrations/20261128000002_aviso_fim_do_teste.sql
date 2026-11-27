-- Clarevo · migração 0051 · Aviso de fim do teste por e-mail (D-131, item E). Numerada depois da 0050 (20261128000001_desistencia.sql),
-- mas não depende dela: precisa só da 0049 e de tudo o que veio antes.
-- Decisão do Enzo (27/11/2026): "e-mail de serviço só no fim do teste (2 dias antes)", depois do advogado e da chave do serviço de e-mail,
-- que é do Enzo. Esta migração prepara tudo DESLIGADO: nada é posto na fila e nada sai até o Enzo ligar (docs/53_AVISOS_POR_EMAIL.md).
--
-- Como funciona: o banco só prepara a fila; quem envia é a função do servidor "aviso-fim-do-teste" (Edge Function, gerada do núcleo), que
-- lê a fila, manda pela API do Resend com a chave RESEND_API_KEY (só nos segredos das funções, posta pelo Enzo) e grava o resultado. O banco
-- nunca fala com o Resend nem guarda chave nenhuma.
--   1. Todo dia, pelo pg_cron (o mesmo agendamento da limpeza da 0025), clarevo_trial_notice_prepare() põe na fila quem tem o fim do teste
--      daqui a 2 dias (calendário de Brasília), apaga os registros antigos e marca como expirado o que não saiu no dia dele.
--   2. De hora em hora, das 9h às 17h de Brasília, o agendamento acorda a função (com um token no cabeçalho, que o público não tem). A função
--      pede um aviso por vez (trial_notice_claim), envia e grava (trial_notice_finish), até a fila do dia acabar ou o limite da rodada.
--
-- Invariantes:
-- F1. Dois interruptores, os dois desligados: billing_settings.trial_notice_mode ('desligado', o padrão; 'ensaio'; 'ligado'), mudado só por
--     clarevo_staff_set_trial_notice_mode (SQL Editor), e a chave RESEND_API_KEY na função, que só o Enzo põe. Desligado: nada entra na fila e
--     trial_notice_claim não entrega nada. 'ensaio' (teste): a fila e a função andam iguais, mas a função só grava o que enviaria (situação
--     'ensaio'), sem chamar o Resend e sem precisar da chave. 'ligado' sem a chave (a função diz p_can_send falso): nada é entregue nem enviado.
-- F2. Quem recebe: no dia D (Brasília), quem tem o fim do teste no dia D + 2, pela mesma conta de my_access (clarevo_access: situação 'teste'
--     e 'until'), com e-mail confirmado e conta viva. Fica de fora quem tem um direito próprio que ainda não acabou (assinatura pelas lojas,
--     cartão ou Pix na web, a assinatura no cartão marcada para o fim do teste, D-129, com valid_from no futuro, benefício e cortesia) e quem
--     é de uma Família cuja titular tem um direito ao plano familiar que ainda não acabou (cobre agora ou a partir do começo marcado). Antes
--     do início da cobrança (billing_settings.enforced_from nulo ou no futuro, "pre_lancamento"), ninguém.
-- F3. Uma vez: um registro por pessoa e dia de fim do teste (e o do ensaio à parte, para o teste não impedir o envio de verdade); 'enviado'
--     não volta para a fila. Se a data do fim do teste mudar (o início da cobrança mudou), o aviso da data nova é outro.
-- F4. Horário: trial_notice_claim só entrega no próprio dia D e das 9h às 18h de Brasília (clarevo_trial_notice_window); o que não saiu no
--     dia vira 'expirado' na preparação seguinte. Falha passageira volta para a fila depois de 30 minutos, até 3 tentativas.
-- F5. Na hora de entregar, a regra F2 é conferida de novo: quem assinou, entrou numa Família coberta ou ganhou cortesia depois da
--     preparação fica 'dispensado'.
-- F6. Dados: a pessoa (persons.id), o dia do fim do teste, a situação, as horas, o identificador da mensagem no Resend ou um código de
--     erro curto. O e-mail é lido de auth.users só em trial_notice_claim, para a função, e nunca é gravado (no ensaio, nem é entregue).
-- F7. Privilégios: trial_notices com RLS e sem privilégio nenhum (nem o app nem a chave de serviço leem a tabela). trial_notice_claim e
--     trial_notice_finish só com a chave de serviço (a função); as outras, ninguém de fora (o pg_cron e o SQL Editor rodam como dono).
-- F8. Guarda: os registros saem 6 meses depois do dia do fim do teste, só na preparação diária (o agendamento -fila, que fica mesmo com o
--     aviso desligado, docs/53, seção 5); excluir a conta apaga os registros na hora (em cascata, ou pelo gatilho quando a pessoa fica anônima).
-- F9. Compatível com o app publicado e com as funções de hoje: nenhuma função existente muda, nenhuma função nova para o app (130 continuam),
--     nenhuma ação nova em record_operations (105).
--
-- Aplicar no SQL Editor (docs/05, passo 12ar; conferência 21am). Testes em
-- supabase/tests/99zzzzzzzzzzzzzzzzzzzzzzzzzzzzzz_aviso_fim_do_teste.sql.

-- ---------------------------------------------------------------------------
-- 1. O interruptor do banco (F1)
-- ---------------------------------------------------------------------------
alter table public.billing_settings
  add column trial_notice_mode text not null default 'desligado' check (trial_notice_mode in ('desligado', 'ensaio', 'ligado'));
comment on column public.billing_settings.trial_notice_mode is
  'Aviso de fim do teste por e-mail (D-131 E, 0051): desligado (padrão, nada na fila), ensaio (grava o que enviaria, sem enviar) ou ligado. '
  'Mudado só por clarevo_staff_set_trial_notice_mode. O envio de verdade ainda depende da chave RESEND_API_KEY na função.';

-- ---------------------------------------------------------------------------
-- 2. O registro de cada aviso (F3, F6, F8)
-- ---------------------------------------------------------------------------
create table public.trial_notices (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.persons (id) on delete cascade,
  trial_ends_on date not null,
  dry_run boolean not null default false,
  status text not null default 'pendente'
    check (status in ('pendente', 'enviando', 'enviado', 'ensaio', 'erro', 'dispensado', 'expirado')),
  attempts smallint not null default 0 check (attempts between 0 and 3),
  claimed_at timestamptz,
  sent_at timestamptz,
  provider_message_id text check (provider_message_id ~ '^[A-Za-z0-9-]{1,100}$'),
  error_code text check (error_code ~ '^[a-z0-9_]{1,60}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trial_notices_uma_vez unique (person_id, trial_ends_on, dry_run),
  constraint trial_notices_enviado check ((status = 'enviado') = (sent_at is not null and provider_message_id is not null)),
  constraint trial_notices_ensaio check ((status <> 'ensaio' or dry_run) and (status <> 'enviado' or not dry_run))
);
create index trial_notices_fila on public.trial_notices (trial_ends_on, created_at) where status in ('pendente', 'enviando');
comment on table public.trial_notices is
  'Aviso de fim do teste por e-mail (D-131 E, 0051): um por pessoa e dia de fim do teste (e o do ensaio à parte). Sem e-mail: só a pessoa, '
  'o dia, a situação, as horas e o identificador do Resend ou um código de erro. Escrita só pelas funções da 0051; ninguém lê pela API. '
  'Sai 6 meses depois do fim do teste e, na hora, com a conta.';

-- F8: a pessoa que fica anônima (exclusão da conta com autoria numa Família que continua) perde os registros na hora.
create or replace function public.clarevo_trial_notice_cleanup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.trial_notices where person_id = new.id;
  return new;
end;
$$;

create trigger persons_trial_notice_cleanup
  after update of deleted_at on public.persons
  for each row
  when (new.deleted_at is not null and old.deleted_at is null)
  execute function public.clarevo_trial_notice_cleanup();

-- ---------------------------------------------------------------------------
-- 3. Horário e regra de quem recebe (F2, F4, F5)
-- ---------------------------------------------------------------------------
-- F4: das 9h (inclusive) às 18h (exclusive), no horário de Brasília (sem horário de verão desde 2019).
create or replace function public.clarevo_trial_notice_window(p_at timestamptz)
returns boolean
language sql
stable
set search_path = public
as $$
  select (p_at at time zone 'America/Sao_Paulo')::time >= time '09:00' and (p_at at time zone 'America/Sao_Paulo')::time < time '18:00'
$$;

-- F2: a pessoa recebe o aviso do fim do teste no dia p_trial_ends_on (Brasília)? Usada na preparação e de novo na entrega (F5).
create or replace function public.clarevo_trial_notice_eligible(p_person uuid, p_trial_ends_on date)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_access jsonb;
begin
  if p_person is null or p_trial_ends_on is null then
    return false;
  end if;
  -- Conta viva, com e-mail confirmado (a anônima e a apagada ficam de fora).
  if not exists (select 1 from public.persons p join auth.users u on u.id = p.id
                  where p.id = p_person and p.deleted_at is null and u.email_confirmed_at is not null and coalesce(btrim(u.email), '') <> '') then
    return false;
  end if;
  -- No teste, que acaba no dia pedido: a mesma conta de my_access (fora do teste, inclusive antes do início da cobrança, não recebe).
  v_access := public.clarevo_access(p_person);
  if v_access ->> 'status' is distinct from 'teste'
     or ((v_access ->> 'until')::timestamptz at time zone 'America/Sao_Paulo')::date is distinct from p_trial_ends_on then
    return false;
  end if;
  -- Um direito próprio que ainda não acabou: assinatura (lojas, cartão, Pix), a marcada para o fim do teste (valid_from no futuro, D-129),
  -- benefício ou cortesia. A assinatura cancelada antes da primeira cobrança acaba na hora (valid_until = o cancelamento) e não conta.
  if exists (select 1 from public.plan_entitlements e where e.person_id = p_person and (e.valid_until is null or e.valid_until > now())) then
    return false;
  end if;
  -- Membro ativo de uma Família que não terminou, cuja titular ativa tem um direito ao plano familiar que ainda não acabou (o que cobre
  -- agora e o marcado para começar depois).
  if exists (select 1
               from public.context_memberships m
               join public.financial_contexts c on c.id = m.context_id and c.kind = 'familia' and c.ended_at is null
               join public.context_memberships t on t.context_id = c.id and t.role = 'titular' and t.revoked_at is null and t.person_id <> p_person
               join public.plan_entitlements e on e.person_id = t.person_id and e.plan = 'familiar'
                                              and (e.valid_until is null or e.valid_until > now())
              where m.person_id = p_person and m.revoked_at is null) then
    return false;
  end if;
  return true;
end;
$$;

-- Quem tem o fim do teste no dia p_today + 2 e recebe o aviso (F2). Antes do início da cobrança, ninguém.
create or replace function public.clarevo_trial_notice_due(p_today date)
returns table (person_id uuid, trial_ends_on date)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p_today + 2
    from public.billing_settings s
    join public.persons p on p.deleted_at is null
   where s.id and s.enforced_from is not null and s.enforced_from <= now()
     and ((greatest(p.created_at, s.enforced_from) + interval '14 days') at time zone 'America/Sao_Paulo')::date = p_today + 2
     and public.clarevo_trial_notice_eligible(p.id, p_today + 2)
$$;

-- ---------------------------------------------------------------------------
-- 4. A fila (pg_cron) e o interruptor (equipe)
-- ---------------------------------------------------------------------------
-- Preparação do dia (pg_cron, docs/53; também pelo SQL Editor): apaga o que passou de 6 meses (F8), marca como expirado o que não saiu no
-- dia dele (F4) e, com o interruptor em ensaio ou ligado, põe na fila quem tem o fim do teste daqui a 2 dias (F2, F3). Desligado, não põe
-- ninguém. Devolve só contagens.
create or replace function public.clarevo_trial_notice_prepare()
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_mode text;
  n_queued int := 0;
  n_expired int := 0;
  n_deleted int := 0;
begin
  delete from public.trial_notices n where n.trial_ends_on < (v_today - interval '6 months')::date;
  get diagnostics n_deleted = row_count;

  update public.trial_notices n set status = 'expirado', updated_at = now()
   where n.status in ('pendente', 'enviando') and n.trial_ends_on - 2 < v_today;
  get diagnostics n_expired = row_count;

  select s.trial_notice_mode into v_mode from public.billing_settings s where s.id;
  if v_mode in ('ensaio', 'ligado') then
    insert into public.trial_notices (person_id, trial_ends_on, dry_run)
    select d.person_id, d.trial_ends_on, v_mode = 'ensaio' from public.clarevo_trial_notice_due(v_today) d
    on conflict on constraint trial_notices_uma_vez do nothing;
    get diagnostics n_queued = row_count;
  end if;

  return jsonb_build_object('modo', coalesce(v_mode, 'desligado'), 'dia', v_today, 'fim_do_teste', v_today + 2, 'na_fila', n_queued,
                            'expirados', n_expired, 'apagados', n_deleted);
end;
$$;

-- Equipe (SQL Editor): liga, põe em ensaio ou desliga o aviso, e prepara a fila do dia na hora (desligado, só a limpeza).
create or replace function public.clarevo_staff_set_trial_notice_mode(p_mode text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if p_mode is null or p_mode not in ('desligado', 'ensaio', 'ligado') then
    raise exception 'modo_invalido' using errcode = '22023';
  end if;
  update public.billing_settings set trial_notice_mode = p_mode where id;
  return jsonb_build_object('modo', p_mode, 'fila', public.clarevo_trial_notice_prepare());
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. A entrega para a função do servidor (só a chave de serviço)
-- ---------------------------------------------------------------------------
-- Servidor: até p_limit avisos do dia, para a função enviar. p_can_send: a função tem a chave do Resend e a compra está aberta; sem isso, no
-- modo ligado nada é entregue (o ensaio não precisa). Fora do horário, com o interruptor desligado ou fora do dia, nada. Cada aviso
-- entregue fica 'enviando' (uma tentativa a mais); quem já não recebe fica 'dispensado' (F5). Retorno:
-- {mode, window, seen, items: [{id, email, trial_ends_on, dry_run}]}; no ensaio, email nulo. seen conta também os dispensados.
create or replace function public.trial_notice_claim(p_limit integer, p_can_send boolean)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_mode text;
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_open boolean := public.clarevo_trial_notice_window(now());
  v_items jsonb := '[]'::jsonb;
  n_seen int := 0;
  r record;
begin
  if p_limit is null or p_limit not between 1 and 50 or p_can_send is null then
    raise exception 'pedido_invalido' using errcode = '22023';
  end if;
  select s.trial_notice_mode into v_mode from public.billing_settings s where s.id;
  v_mode := coalesce(v_mode, 'desligado');
  if v_mode = 'desligado' or not v_open or (v_mode = 'ligado' and not p_can_send) then
    return jsonb_build_object('mode', v_mode, 'window', v_open, 'seen', 0, 'items', v_items);
  end if;

  for r in
    select n.id, n.person_id, n.trial_ends_on, n.dry_run, n.attempts
      from public.trial_notices n
     where n.trial_ends_on = v_today + 2 and n.dry_run = (v_mode = 'ensaio')
       and n.status in ('pendente', 'enviando') and (n.claimed_at is null or n.claimed_at < now() - interval '30 minutes')
     order by n.created_at, n.id
     limit p_limit
     for update skip locked
  loop
    n_seen := n_seen + 1;
    if r.attempts >= 3 then
      -- Três tentativas sem resultado gravado: não tenta de novo.
      update public.trial_notices set status = 'erro', error_code = coalesce(error_code, 'sem_resposta'), updated_at = now() where id = r.id;
    elsif not public.clarevo_trial_notice_eligible(r.person_id, r.trial_ends_on) then
      update public.trial_notices set status = 'dispensado', updated_at = now() where id = r.id;
    else
      update public.trial_notices set status = 'enviando', claimed_at = now(), attempts = attempts + 1, updated_at = now() where id = r.id;
      v_items := v_items || jsonb_build_array(jsonb_build_object(
        'id', r.id,
        'email', case when r.dry_run then null else (select u.email from auth.users u where u.id = r.person_id) end,
        'trial_ends_on', r.trial_ends_on,
        'dry_run', r.dry_run));
    end if;
  end loop;
  return jsonb_build_object('mode', v_mode, 'window', true, 'seen', n_seen, 'items', v_items);
end;
$$;

-- Servidor: o resultado de um aviso entregue. 'enviado' (com o identificador do Resend), 'ensaio' (só no ensaio), 'falhou' (passageira: volta
-- para a fila depois de 30 minutos, até a 3ª tentativa) ou 'recusado' (o Resend recusou: erro, sem nova tentativa), com um código curto.
-- Só muda o que está 'enviando'. Retorno: {result: 'gravado', status} | {result: 'ignorado', status} | {result: 'sem_aviso'}.
create or replace function public.trial_notice_finish(p_id uuid, p_outcome text, p_message_id text default null, p_error text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_status text;
  v_dry boolean;
  v_attempts smallint;
  v_new text;
begin
  if p_id is null or p_outcome is null or p_outcome not in ('enviado', 'ensaio', 'falhou', 'recusado')
     or (p_outcome = 'enviado' and (p_message_id is null or p_message_id !~ '^[A-Za-z0-9-]{1,100}$'))
     or (p_outcome <> 'enviado' and p_message_id is not null)
     or (p_outcome in ('falhou', 'recusado') and (p_error is null or p_error !~ '^[a-z0-9_]{1,60}$'))
     or (p_outcome in ('enviado', 'ensaio') and p_error is not null) then
    raise exception 'pedido_invalido' using errcode = '22023';
  end if;
  select n.status, n.dry_run, n.attempts into v_status, v_dry, v_attempts from public.trial_notices n where n.id = p_id for update;
  if not found then
    return jsonb_build_object('result', 'sem_aviso');
  end if;
  if v_status <> 'enviando' then
    return jsonb_build_object('result', 'ignorado', 'status', v_status);
  end if;
  -- O ensaio só grava 'ensaio', e o aviso de verdade nunca grava 'ensaio'.
  if (p_outcome = 'ensaio') <> v_dry then
    raise exception 'pedido_invalido' using errcode = '22023';
  end if;
  v_new := case p_outcome when 'enviado' then 'enviado' when 'ensaio' then 'ensaio' when 'recusado' then 'erro'
                          else case when v_attempts >= 3 then 'erro' else 'pendente' end end;
  update public.trial_notices
     set status = v_new,
         sent_at = case when p_outcome = 'enviado' then now() end,
         provider_message_id = case when p_outcome = 'enviado' then p_message_id end,
         error_code = p_error,
         updated_at = now()
   where id = p_id;
  return jsonb_build_object('result', 'gravado', 'status', v_new);
end;
$$;

-- ---------------------------------------------------------------------------
-- Privilégios, só do que é novo (F7). A tabela: RLS ligada e nenhuma política nem privilégio.
-- ---------------------------------------------------------------------------
alter table public.trial_notices enable row level security;
revoke all on public.trial_notices from anon, authenticated;

revoke all on function public.clarevo_trial_notice_cleanup() from public, anon, authenticated;
revoke all on function public.clarevo_trial_notice_window(timestamptz) from public, anon, authenticated;
revoke all on function public.clarevo_trial_notice_eligible(uuid, date) from public, anon, authenticated;
revoke all on function public.clarevo_trial_notice_due(date) from public, anon, authenticated;
revoke all on function public.clarevo_trial_notice_prepare() from public, anon, authenticated;
revoke all on function public.clarevo_staff_set_trial_notice_mode(text) from public, anon, authenticated;
revoke all on function public.trial_notice_claim(integer, boolean) from public, anon, authenticated;
revoke all on function public.trial_notice_finish(uuid, text, text, text) from public, anon, authenticated;
do $$
declare
  f text;
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'revoke all on public.trial_notices from service_role';
    foreach f in array array['clarevo_trial_notice_cleanup()', 'clarevo_trial_notice_window(timestamptz)', 'clarevo_trial_notice_eligible(uuid, date)',
                             'clarevo_trial_notice_due(date)', 'clarevo_trial_notice_prepare()', 'clarevo_staff_set_trial_notice_mode(text)'] loop
      execute format('revoke all on function public.%s from service_role', f);
    end loop;
    execute 'grant execute on function public.trial_notice_claim(integer, boolean) to service_role';
    execute 'grant execute on function public.trial_notice_finish(uuid, text, text, text) to service_role';
  end if;
end $$;
