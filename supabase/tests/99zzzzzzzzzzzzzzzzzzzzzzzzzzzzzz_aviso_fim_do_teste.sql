-- Aviso de fim do teste por e-mail (D-131, item E; migração 0051): tudo nasce desligado; antes do início da cobrança ninguém entra na fila;
-- quem recebe (fim do teste daqui a 2 dias, no calendário de Brasília) e quem não recebe (assinatura pelas lojas, no cartão marcada para o fim
-- do teste, Pix pago no teste, Família coberta agora ou a partir do começo marcado, cortesia, benefício, conta excluída, e-mail não
-- confirmado, fim do teste em outro dia); uma vez só; o ensaio sem e-mail e sem impedir o envio de verdade; ligado sem a chave, nada; o
-- horário; a nova conferência na entrega; falha passageira com até 3 tentativas; expirado, guarda de 6 meses e a conta excluída; e os
-- privilégios (só a chave de serviço entrega e grava; ninguém lê a tabela). Pessoas FICTÍCIAS. Tudo em uma transação desfeita no fim.
\set ON_ERROR_STOP 1

begin;

create function pg_temp.expect_code(p_sql text, p_code text, p_state text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm = p_code and sqlstate = p_state then return; end if;
    raise exception 'esperado % (%), veio "%" (%) em: %', p_code, p_state, sqlerrm, sqlstate, left(p_sql, 300);
  end;
  raise exception 'esperado erro %, mas passou: %', p_code, left(p_sql, 300);
end $$;
-- Só o código do erro (a mensagem de "permission denied" traz o nome do objeto).
create function pg_temp.expect_state(p_sql text, p_state text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlstate = p_state then return; end if;
    raise exception 'esperado o código %, veio "%" (%) em: %', p_state, sqlerrm, sqlstate, left(p_sql, 300);
  end;
  raise exception 'esperado o código %, mas passou: %', p_state, left(p_sql, 300);
end $$;

create temp table ids (name text primary key, id uuid);
grant select, insert on ids to authenticated, anon, service_role;
create function pg_temp.id(p_name text) returns uuid language sql as $$ select id from ids where name = p_name $$;
create function pg_temp.as_(p_name text) returns text language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(pg_temp.id(p_name)::text, ''), true)
$$;
create function pg_temp.as_service() returns void language sql as $$
  select set_config('request.jwt.claim.sub', '', true);
  select set_config('request.jwt.claims', '{"role":"service_role"}', true);
$$;
create function pg_temp.sha(p_text text) returns text language sql as $$ select encode(sha256(convert_to(p_text, 'UTF8')), 'hex') $$;
create function pg_temp.hoje() returns date language sql as $$ select (now() at time zone 'America/Sao_Paulo')::date $$;
create function pg_temp.inicio(p_day date) returns timestamptz language sql as $$ select p_day::timestamp at time zone 'America/Sao_Paulo' $$;
create function pg_temp.fim(p_day date) returns timestamptz language sql as $$
  select ((p_day + 1)::timestamp at time zone 'America/Sao_Paulo') - interval '1 millisecond'
$$;
-- Leituras e ajustes direto nas tabelas (sem a RLS), como o dono do banco.
create function pg_temp.status(p_name text) returns text language sql security definer set search_path = public, pg_temp as $$
  select public.clarevo_access(pg_temp.id(p_name)) ->> 'status'
$$;
create function pg_temp.created_days_ago(p_name text, p_days int) returns void language sql security definer set search_path = public, pg_temp as $$
  update public.persons set created_at = now() - make_interval(days => p_days) where id = pg_temp.id(p_name)
$$;
-- Quem a preparação de hoje poria na fila, pelos nomes.
create function pg_temp.due_names() returns text language sql security definer set search_path = public, pg_temp as $$
  select coalesce(string_agg(i.name, ',' order by i.name), '') from public.clarevo_trial_notice_due(pg_temp.hoje()) d join ids i on i.id = d.person_id
$$;
create function pg_temp.notice(p_name text, p_dry boolean) returns public.trial_notices language sql security definer set search_path = public, pg_temp as $$
  select n.* from public.trial_notices n where n.person_id = pg_temp.id(p_name) and n.trial_ends_on = pg_temp.hoje() + 2 and n.dry_run = p_dry
$$;
create function pg_temp.notices(p_name text) returns bigint language sql security definer set search_path = public, pg_temp as $$
  select count(*) from public.trial_notices where person_id = pg_temp.id(p_name)
$$;
-- O mesmo pedido da função do servidor, com a chave de serviço.
create function pg_temp.claim(p_limit int, p_can_send boolean) returns jsonb language plpgsql as $$
declare
  r jsonb;
begin
  set local role service_role;
  perform pg_temp.as_service();
  r := public.trial_notice_claim(p_limit, p_can_send);
  reset role;
  return r;
end $$;
create function pg_temp.finish(p_name text, p_outcome text, p_message_id text, p_error text) returns jsonb language plpgsql as $$
declare
  r jsonb;
  v_id uuid := (pg_temp.notice(p_name, p_outcome = 'ensaio')).id;
begin
  set local role service_role;
  perform pg_temp.as_service();
  r := public.trial_notice_finish(v_id, p_outcome, p_message_id, p_error);
  reset role;
  return r;
end $$;
-- Os nomes das pessoas entregues numa resposta de trial_notice_claim.
create function pg_temp.claimed(p_claim jsonb) returns text language sql security definer set search_path = public, pg_temp as $$
  select coalesce(string_agg(i.name, ',' order by i.name), '')
    from jsonb_array_elements(p_claim -> 'items') x
    join public.trial_notices n on n.id = (x ->> 'id')::uuid
    join ids i on i.id = n.person_id
$$;
-- Volta a hora da última entrega de um aviso (para a nova tentativa depois de 30 minutos).
create function pg_temp.back(p_name text, p_minutes int) returns void language sql security definer set search_path = public, pg_temp as $$
  update public.trial_notices set claimed_at = claimed_at - make_interval(mins => p_minutes)
   where person_id = pg_temp.id(p_name) and trial_ends_on = pg_temp.hoje() + 2 and not dry_run
$$;

-- ---------------------------------------------------------------------------
-- 0. As pessoas. Todas criam o Pessoal antes do início da cobrança (acesso completo). Ana cria uma Família e chama Olga (Ana não assina:
--    a Família sozinha não tira ninguém do aviso); Edu cria uma Família e chama Davi; Gil cria uma Família e chama Fê; Rita administra o
--    benefício da empresa e convida Ivo.
-- ---------------------------------------------------------------------------
insert into ids values
  ('ana', '00000000-0000-0000-0000-0000000005e1'), ('bia', '00000000-0000-0000-0000-0000000005e2'), ('caio', '00000000-0000-0000-0000-0000000005e3'),
  ('davi', '00000000-0000-0000-0000-0000000005e4'), ('edu', '00000000-0000-0000-0000-0000000005e5'), ('fe', '00000000-0000-0000-0000-0000000005e6'),
  ('gil', '00000000-0000-0000-0000-0000000005e7'), ('hana', '00000000-0000-0000-0000-0000000005e8'), ('ivo', '00000000-0000-0000-0000-0000000005e9'),
  ('julia', '00000000-0000-0000-0000-0000000005ea'), ('leo', '00000000-0000-0000-0000-0000000005eb'), ('mia', '00000000-0000-0000-0000-0000000005ec'),
  ('nina', '00000000-0000-0000-0000-0000000005ed'), ('olga', '00000000-0000-0000-0000-0000000005ee'), ('pedro', '00000000-0000-0000-0000-0000000005ef'),
  ('quim', '00000000-0000-0000-0000-0000000005f0'), ('rita', '00000000-0000-0000-0000-0000000005f1');
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
select i.id, i.name || '.aviso@exemplo.test', now(), jsonb_build_object('display_name', initcap(i.name)) from ids i;

set role authenticated;
do $$
declare
  p text;
  r jsonb;
begin
  foreach p in array array['ana', 'bia', 'caio', 'davi', 'edu', 'fe', 'gil', 'hana', 'ivo', 'julia', 'leo', 'mia', 'nina', 'olga', 'pedro', 'quim', 'rita'] loop
    perform pg_temp.as_(p);
    perform public.ensure_personal_space('Conta principal');
  end loop;
  perform pg_temp.as_('ana');
  insert into ids values ('fam_ana', (public.create_family('Família da Ana', 'av-fam-ana') #>> '{context,id}')::uuid);
  r := public.create_family_invite(pg_temp.id('fam_ana'), 'membro', 'av-inv-olga');
  perform pg_temp.as_('olga');
  perform public.accept_family_invite(r ->> 'code', 'av-acc-olga');
  perform pg_temp.as_('edu');
  insert into ids values ('fam_edu', (public.create_family('Família do Edu', 'av-fam-edu') #>> '{context,id}')::uuid);
  r := public.create_family_invite(pg_temp.id('fam_edu'), 'membro', 'av-inv-davi');
  perform pg_temp.as_('davi');
  perform public.accept_family_invite(r ->> 'code', 'av-acc-davi');
  perform pg_temp.as_('gil');
  insert into ids values ('fam_gil', (public.create_family('Família do Gil', 'av-fam-gil') #>> '{context,id}')::uuid);
  r := public.create_family_invite(pg_temp.id('fam_gil'), 'membro', 'av-inv-fe');
  perform pg_temp.as_('fe');
  perform public.accept_family_invite(r ->> 'code', 'av-acc-fe');
end $$;
reset role;

do $$
declare
  r jsonb;
begin
  r := public.clarevo_staff_create_organization('Empresa Aviso', 5, 'individual', (now() - interval '30 days')::date, null, 'rita.aviso@exemplo.test');
  insert into ids values ('contrato', (r ->> 'contract_id')::uuid);
end $$;
set role authenticated;
do $$
declare
  r jsonb;
begin
  perform pg_temp.as_('rita');
  r := public.invite_licenses(pg_temp.id('contrato'), array['ivo.aviso@exemplo.test'], 'av-lic-ivo');
  perform pg_temp.as_('ivo');
  perform public.accept_license(r #>> '{results,0,code}', 'av-acc-ivo');
end $$;
reset role;

-- Rita criou a conta há 40 dias (o teste dela já acabou); Leo, há 11 (o teste acaba daqui a 3 dias); as outras, há 12 (acaba daqui a 2).
do $$
declare
  p text;
begin
  foreach p in array array['ana', 'bia', 'caio', 'davi', 'edu', 'fe', 'gil', 'hana', 'ivo', 'julia', 'mia', 'nina', 'olga', 'pedro', 'quim'] loop
    perform pg_temp.created_days_ago(p, 12);
  end loop;
  perform pg_temp.created_days_ago('leo', 11);
  perform pg_temp.created_days_ago('rita', 40);
end $$;

-- ---------------------------------------------------------------------------
-- 1. O esquema: o interruptor desligado, a tabela fechada, os privilégios e nada novo para o app.
-- ---------------------------------------------------------------------------
do $$
declare
  f text;
begin
  assert (select trial_notice_mode from public.billing_settings where id) = 'desligado', 'o interruptor nasce desligado';
  assert (select column_default from information_schema.columns where table_schema = 'public' and table_name = 'billing_settings'
           and column_name = 'trial_notice_mode') = '''desligado''::text', 'padrão desligado';
  assert (select relrowsecurity from pg_class where oid = 'public.trial_notices'::regclass), 'RLS ligada';
  assert not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'trial_notices'), 'nenhuma política (ninguém lê pela API)';
  assert not has_table_privilege('authenticated', 'public.trial_notices', 'select') and not has_table_privilege('anon', 'public.trial_notices', 'select')
     and not has_table_privilege('service_role', 'public.trial_notices', 'select') and not has_table_privilege('authenticated', 'public.trial_notices', 'insert')
     and not has_table_privilege('service_role', 'public.trial_notices', 'insert'), 'a tabela sem privilégio para o app e para a chave de serviço';
  assert not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'trial_notices' and column_name ilike '%mail%'),
    'a tabela não guarda e-mail';
  foreach f in array array['trial_notice_claim(integer, boolean)', 'trial_notice_finish(uuid, text, text, text)'] loop
    assert has_function_privilege('service_role', 'public.' || f, 'execute') and not has_function_privilege('authenticated', 'public.' || f, 'execute')
       and not has_function_privilege('anon', 'public.' || f, 'execute'), 'só a chave de serviço executa ' || f;
    assert (select prosecdef from pg_proc where oid = ('public.' || f)::regprocedure), f || ' é security definer';
  end loop;
  foreach f in array array['clarevo_trial_notice_cleanup()', 'clarevo_trial_notice_window(timestamptz)', 'clarevo_trial_notice_eligible(uuid, date)',
                           'clarevo_trial_notice_due(date)', 'clarevo_trial_notice_prepare()', 'clarevo_staff_set_trial_notice_mode(text)'] loop
    assert not has_function_privilege('service_role', 'public.' || f, 'execute') and not has_function_privilege('authenticated', 'public.' || f, 'execute')
       and not has_function_privilege('anon', 'public.' || f, 'execute'), 'ninguém de fora executa ' || f;
  end loop;
  assert (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.prosecdef and p.proname in ('trial_notice_claim', 'trial_notice_finish', 'clarevo_trial_notice_cleanup',
             'clarevo_trial_notice_eligible', 'clarevo_trial_notice_due', 'clarevo_trial_notice_prepare', 'clarevo_staff_set_trial_notice_mode')) = 7,
    'as sete funções com dados são security definer';
  assert (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and has_function_privilege('authenticated', p.oid, 'execute')) = 130,
    'nenhuma função nova para o app (130)';
  assert (select count(*) from pg_constraint c, regexp_matches(pg_get_constraintdef(c.oid), '''([a-z_]+)''::text', 'g') m
           where c.conname = 'record_operations_action_check') = 105, 'nenhuma ação nova em record_operations (105)';
  assert (select count(*) from public.trial_notices) = 0, 'nenhum aviso na fila';
  -- O horário (F4): das 9h às 18h de Brasília (UTC-3).
  assert not public.clarevo_trial_notice_window('2026-12-10 11:59:59Z') and public.clarevo_trial_notice_window('2026-12-10 12:00:00Z')
     and public.clarevo_trial_notice_window('2026-12-10 20:59:59Z') and not public.clarevo_trial_notice_window('2026-12-10 21:00:00Z')
     and not public.clarevo_trial_notice_window('2026-12-10 02:00:00Z'), 'o horário do envio: 9h às 18h de Brasília';
end $$;

-- Os privilégios na prática: o app não lê nem pede; a chave de serviço não lê a tabela nem prepara a fila.
set role authenticated;
select pg_temp.as_('ana');
select pg_temp.expect_state($q$select count(*) from public.trial_notices$q$, '42501');
select pg_temp.expect_state($q$select public.trial_notice_claim(10, true)$q$, '42501');
select pg_temp.expect_state($q$select public.trial_notice_finish(gen_random_uuid(), 'enviado', 'x', null)$q$, '42501');
select pg_temp.expect_state($q$select public.clarevo_trial_notice_prepare()$q$, '42501');
select pg_temp.expect_state($q$select public.clarevo_staff_set_trial_notice_mode('ligado')$q$, '42501');
reset role;
set role service_role;
select pg_temp.as_service();
select pg_temp.expect_state($q$select count(*) from public.trial_notices$q$, '42501');
select pg_temp.expect_state($q$select public.clarevo_trial_notice_prepare()$q$, '42501');
select pg_temp.expect_state($q$select public.clarevo_staff_set_trial_notice_mode('ligado')$q$, '42501');
select pg_temp.expect_state($q$select * from public.clarevo_trial_notice_due(current_date)$q$, '42501');
select pg_temp.expect_code($q$select public.trial_notice_claim(0, true)$q$, 'pedido_invalido', '22023');
select pg_temp.expect_code($q$select public.trial_notice_claim(51, true)$q$, 'pedido_invalido', '22023');
select pg_temp.expect_code($q$select public.trial_notice_claim(1, null)$q$, 'pedido_invalido', '22023');
reset role;
select pg_temp.expect_code($q$select public.clarevo_staff_set_trial_notice_mode('sim')$q$, 'modo_invalido', '22023');
select pg_temp.expect_code($q$select public.clarevo_staff_set_trial_notice_mode(null)$q$, 'modo_invalido', '22023');

-- ---------------------------------------------------------------------------
-- 2. Antes do início da cobrança (hoje, em produção): todo mundo em "pre_lancamento" e ninguém na fila, nem com o interruptor ligado.
-- ---------------------------------------------------------------------------
do $$
declare
  r jsonb;
begin
  assert (select enforced_from from public.billing_settings where id) is null, 'sem início da cobrança';
  assert pg_temp.status('ana') = 'pre_lancamento', 'Ana em pre_lancamento';
  assert pg_temp.due_names() = '', 'antes do início da cobrança, ninguém: ' || pg_temp.due_names();
  r := public.clarevo_staff_set_trial_notice_mode('ligado');
  assert r ->> 'modo' = 'ligado' and (r #>> '{fila,na_fila}')::int = 0, 'ligado sem início da cobrança: ninguém na fila: ' || r::text;
  -- Início da cobrança marcado para daqui a 10 dias: ainda pre_lancamento, ninguém.
  perform public.clarevo_staff_set_billing_start(now() + interval '10 days');
  assert pg_temp.status('ana') = 'pre_lancamento' and pg_temp.due_names() = '', 'início no futuro: ninguém';
  assert (public.clarevo_trial_notice_prepare() ->> 'na_fila')::int = 0, 'início no futuro: nada na fila';
  r := public.clarevo_staff_set_trial_notice_mode('desligado');
  assert r ->> 'modo' = 'desligado' and (select trial_notice_mode from public.billing_settings where id) = 'desligado', 'desligado de novo';
  assert (select count(*) from public.trial_notices) = 0, 'nada na fila';
end $$;

-- ---------------------------------------------------------------------------
-- 3. A cobrança começou há 20 dias. Quem tem o fim do teste daqui a 2 dias e quem fica de fora.
-- ---------------------------------------------------------------------------
select public.clarevo_staff_set_billing_start(now() - interval '20 days');
do $$
declare
  d date := pg_temp.hoje() + 2;
  r jsonb;
begin
  -- Caio assina pela App Store; Edu assina o Família pela loja (cobre Davi agora).
  perform public.billing_apply('av-caio', 'apple', pg_temp.id('caio'), pg_temp.sha('apple-caio'), 'individual', now() + interval '30 days', now());
  perform public.billing_apply('av-edu', 'apple', pg_temp.id('edu'), pg_temp.sha('apple-edu'), 'familiar', now() + interval '30 days', now());
  -- Bia assina no cartão durante o teste (D-129): o direito começa no dia do fim do teste. Gil, o mesmo no Família (cobre Fê só a partir de lá).
  perform public.billing_apply('av-bia', 'web', pg_temp.id('bia'), pg_temp.sha('web-bia'), 'individual', pg_temp.fim(d + 3), now(), 'mensal', pg_temp.inicio(d));
  perform public.billing_apply('av-gil', 'web', pg_temp.id('gil'), pg_temp.sha('web-gil'), 'familiar', pg_temp.fim(d + 3), now(), 'mensal', pg_temp.inicio(d));
  -- Quim assinou no cartão no teste e cancelou antes da primeira cobrança: o direito acabou, ele recebe o aviso.
  perform public.billing_apply('av-quim-1', 'web', pg_temp.id('quim'), pg_temp.sha('web-quim'), 'individual', pg_temp.fim(d + 3), now() - interval '1 minute', 'mensal', pg_temp.inicio(d));
  perform public.billing_apply('av-quim-2', 'web', pg_temp.id('quim'), pg_temp.sha('web-quim'), 'individual', now(), now());
  -- Nina pagou um mês com Pix no teste (começa no fim do teste, mas o acesso já é "assinatura").
  r := public.billing_pix_apply('av-nina', pg_temp.id('nina'), 'individual', pg_temp.sha('pix-nina'), pg_temp.hoje(), now());
  assert r ->> 'result' = 'aplicado', 'Pix da Nina: ' || r::text;
  -- Hana ganhou cortesia da equipe.
  perform public.clarevo_staff_grant_courtesy('hana.aviso@exemplo.test', 'individual', now() + interval '30 days');
  -- Mia trocou o e-mail e o novo ainda não foi confirmado.
  update auth.users set email_confirmed_at = null where id = pg_temp.id('mia');

  assert pg_temp.status('ana') = 'teste' and pg_temp.status('olga') = 'teste' and pg_temp.status('bia') = 'teste'
     and pg_temp.status('gil') = 'teste' and pg_temp.status('fe') = 'teste' and pg_temp.status('quim') = 'teste'
     and pg_temp.status('mia') = 'teste' and pg_temp.status('leo') = 'teste', 'no teste (inclusive Bia, Gil e Fê, com a assinatura marcada)';
  assert pg_temp.status('caio') = 'assinatura' and pg_temp.status('edu') = 'assinatura' and pg_temp.status('davi') = 'familia'
     and pg_temp.status('nina') = 'assinatura' and pg_temp.status('hana') = 'cortesia' and pg_temp.status('ivo') = 'beneficio'
     and pg_temp.status('rita') = 'leitura', 'fora do teste';
  -- Recebem: Ana, Olga (membro de uma Família sem assinatura), Pedro, Quim e Júlia. Leo (fim do teste em 3 dias) e Mia, não.
  assert pg_temp.due_names() = 'ana,julia,olga,pedro,quim', 'quem recebe: ' || pg_temp.due_names();
  assert not public.clarevo_trial_notice_eligible(pg_temp.id('ana'), d + 1) and not public.clarevo_trial_notice_eligible(pg_temp.id('leo'), d)
     and public.clarevo_trial_notice_eligible(pg_temp.id('leo'), d + 1), 'o dia do fim do teste precisa bater';
end $$;

-- ---------------------------------------------------------------------------
-- 4. Desligado: nada na fila e nada entregue.
-- ---------------------------------------------------------------------------
do $$
declare
  r jsonb;
begin
  r := public.clarevo_trial_notice_prepare();
  assert r ->> 'modo' = 'desligado' and (r ->> 'na_fila')::int = 0 and (r ->> 'fim_do_teste')::date = pg_temp.hoje() + 2, 'desligado: ' || r::text;
  r := pg_temp.claim(10, true);
  assert r ->> 'mode' = 'desligado' and jsonb_array_length(r -> 'items') = 0 and (r ->> 'seen')::int = 0, 'desligado: nada entregue: ' || r::text;
  assert (select count(*) from public.trial_notices) = 0, 'desligado: tabela vazia';
end $$;

-- Daqui em diante, o horário fica aberto (o teste roda a qualquer hora); o horário fechado é conferido na seção 8.
create or replace function public.clarevo_trial_notice_window(p_at timestamptz) returns boolean language sql stable set search_path = public as $$ select true $$;

-- ---------------------------------------------------------------------------
-- 5. Ensaio: a fila anda, sem e-mail, sem envio e sem impedir o envio de verdade. Júlia exclui a conta: o aviso dela sai junto.
-- ---------------------------------------------------------------------------
do $$
declare
  r jsonb;
  x jsonb;
begin
  r := public.clarevo_staff_set_trial_notice_mode('ensaio');
  assert (r #>> '{fila,na_fila}')::int = 5, 'ensaio: cinco na fila: ' || r::text;
  assert (select bool_and(dry_run and status = 'pendente' and attempts = 0) from public.trial_notices), 'ensaio: todos marcados como ensaio, pendentes';
  assert (public.clarevo_trial_notice_prepare() ->> 'na_fila')::int = 0, 'preparar de novo não repete ninguém';
end $$;
set role authenticated;
select pg_temp.as_('julia');
select public.delete_my_account('EXCLUIR', 'av-del-julia');
reset role;
do $$
declare
  r jsonb;
  x jsonb;
begin
  assert not exists (select 1 from public.persons where id = pg_temp.id('julia')) and pg_temp.notices('julia') = 0, 'a conta da Júlia saiu com o aviso';
  -- O ensaio não precisa da chave (p_can_send falso) e não entrega e-mail.
  r := pg_temp.claim(50, false);
  assert r ->> 'mode' = 'ensaio' and (r ->> 'window')::boolean and (r ->> 'seen')::int = 4, 'ensaio: ' || r::text;
  assert pg_temp.claimed(r) = 'ana,olga,pedro,quim', 'ensaio entregue: ' || pg_temp.claimed(r);
  for x in select * from jsonb_array_elements(r -> 'items') loop
    assert x -> 'email' = 'null'::jsonb and (x ->> 'dry_run')::boolean and (x ->> 'trial_ends_on')::date = pg_temp.hoje() + 2, 'ensaio sem e-mail: ' || x::text;
  end loop;
  assert jsonb_array_length(pg_temp.claim(50, false) -> 'items') = 0, 'o que foi entregue não volta na hora';
  assert pg_temp.finish('ana', 'ensaio', null, null) ->> 'status' = 'ensaio', 'o ensaio grava ensaio';
  perform pg_temp.finish(p, 'ensaio', null, null) from unnest(array['olga', 'pedro', 'quim']) p;
  assert (select count(*) from public.trial_notices where status = 'ensaio' and sent_at is null and provider_message_id is null and claimed_at is not null) = 4,
    'ensaio: quatro gravados, nenhum enviado';
  assert pg_temp.finish('ana', 'ensaio', null, null) ->> 'result' = 'ignorado', 'gravar de novo não muda nada';
end $$;

-- ---------------------------------------------------------------------------
-- 6. Ligado: sem a chave nada é entregue; com a chave, cada um uma vez; quem passou a ter cortesia fica dispensado.
-- ---------------------------------------------------------------------------
do $$
declare
  r jsonb;
  x jsonb;
begin
  r := public.clarevo_staff_set_trial_notice_mode('ligado');
  assert (r #>> '{fila,na_fila}')::int = 4, 'ligado: os quatro de novo, agora de verdade (o ensaio não impede): ' || r::text;
  r := pg_temp.claim(50, false);
  assert r ->> 'mode' = 'ligado' and jsonb_array_length(r -> 'items') = 0 and (r ->> 'seen')::int = 0, 'ligado sem a chave: nada entregue: ' || r::text;
  assert (select bool_and(status = 'pendente' and attempts = 0 and claimed_at is null) from public.trial_notices where not dry_run),
    'ligado sem a chave: a fila fica como estava';
  -- Pedro ganha cortesia depois da preparação: na entrega, fica dispensado.
  perform public.clarevo_staff_grant_courtesy('pedro.aviso@exemplo.test', 'individual', now() + interval '30 days');
  r := pg_temp.claim(50, true);
  assert (r ->> 'seen')::int = 4 and pg_temp.claimed(r) = 'ana,olga,quim', 'ligado: entregues ' || pg_temp.claimed(r) || ' ' || r::text;
  for x in select * from jsonb_array_elements(r -> 'items') loop
    assert not (x ->> 'dry_run')::boolean and x ->> 'email' like '%.aviso@exemplo.test', 'de verdade, com o e-mail: ' || x::text;
  end loop;
  assert (pg_temp.notice('pedro', false)).status = 'dispensado', 'Pedro dispensado';
  assert (pg_temp.notice('ana', false)).status = 'enviando' and (pg_temp.notice('ana', false)).attempts = 1, 'Ana enviando, 1ª tentativa';
  assert jsonb_array_length(pg_temp.claim(50, true) -> 'items') = 0, 'nada entregue duas vezes';
end $$;

-- O resultado: validação, enviado, recusado e falha passageira (até 3 tentativas).
set role service_role;
select pg_temp.as_service();
select pg_temp.expect_code($q$select public.trial_notice_finish((pg_temp.notice('ana', false)).id, 'ensaio', null, null)$q$, 'pedido_invalido', '22023');
select pg_temp.expect_code($q$select public.trial_notice_finish((pg_temp.notice('ana', false)).id, 'outro', null, null)$q$, 'pedido_invalido', '22023');
select pg_temp.expect_code($q$select public.trial_notice_finish((pg_temp.notice('ana', false)).id, 'enviado', null, null)$q$, 'pedido_invalido', '22023');
select pg_temp.expect_code($q$select public.trial_notice_finish((pg_temp.notice('ana', false)).id, 'enviado', 'id com espaço', null)$q$, 'pedido_invalido', '22023');
select pg_temp.expect_code($q$select public.trial_notice_finish((pg_temp.notice('ana', false)).id, 'enviado', 'abc-123', 'http_500')$q$, 'pedido_invalido', '22023');
select pg_temp.expect_code($q$select public.trial_notice_finish((pg_temp.notice('ana', false)).id, 'falhou', null, null)$q$, 'pedido_invalido', '22023');
select pg_temp.expect_code($q$select public.trial_notice_finish((pg_temp.notice('ana', false)).id, 'falhou', null, 'Erro com ana@exemplo.test')$q$, 'pedido_invalido', '22023');
select pg_temp.expect_code($q$select public.trial_notice_finish((pg_temp.notice('ana', false)).id, 'recusado', 'abc', 'http_422')$q$, 'pedido_invalido', '22023');
reset role;
do $$
declare
  r jsonb;
  n public.trial_notices;
begin
  r := pg_temp.finish('ana', 'enviado', '49a3999c-0ce1-4ea6-ab68-afcd6dc2e794', null);
  n := pg_temp.notice('ana', false);
  assert r ->> 'result' = 'gravado' and n.status = 'enviado' and n.sent_at is not null and n.provider_message_id = '49a3999c-0ce1-4ea6-ab68-afcd6dc2e794'
     and n.error_code is null, 'Ana enviado: ' || r::text;
  assert pg_temp.finish('ana', 'enviado', 'outro-id', null) ->> 'result' = 'ignorado', 'enviado não muda';
  assert (select public.trial_notice_finish(gen_random_uuid(), 'enviado', 'x', null)) ->> 'result' = 'sem_aviso', 'aviso que não existe';

  r := pg_temp.finish('quim', 'recusado', null, 'http_422_validation_error');
  assert r ->> 'status' = 'erro' and (pg_temp.notice('quim', false)).error_code = 'http_422_validation_error', 'Quim recusado: erro, sem nova tentativa';

  -- Olga: limite do Resend (passageira). Volta para a fila, mas só depois de 30 minutos.
  assert pg_temp.finish('olga', 'falhou', null, 'http_429_rate_limit_exceeded') ->> 'status' = 'pendente', 'Olga de volta para a fila';
  assert jsonb_array_length(pg_temp.claim(50, true) -> 'items') = 0, 'a nova tentativa espera 30 minutos';
  perform pg_temp.back('olga', 31);
  assert pg_temp.claimed(pg_temp.claim(50, true)) = 'olga' and (pg_temp.notice('olga', false)).attempts = 2, '2ª tentativa';
  assert pg_temp.finish('olga', 'falhou', null, 'rede') ->> 'status' = 'pendente', 'ainda pendente';
  perform pg_temp.back('olga', 31);
  assert pg_temp.claimed(pg_temp.claim(50, true)) = 'olga' and (pg_temp.notice('olga', false)).attempts = 3, '3ª tentativa';
  assert pg_temp.finish('olga', 'falhou', null, 'http_503') ->> 'status' = 'erro', 'depois da 3ª, erro';
  perform pg_temp.back('olga', 31);
  assert jsonb_array_length(pg_temp.claim(50, true) -> 'items') = 0, 'erro não volta para a fila';

  -- Sem resultado gravado depois da 3ª entrega (a função caiu no meio): erro, sem_resposta.
  update public.trial_notices set status = 'enviando', error_code = null, attempts = 3, claimed_at = now() - interval '31 minutes'
   where id = (pg_temp.notice('quim', false)).id;
  r := pg_temp.claim(50, true);
  assert jsonb_array_length(r -> 'items') = 0 and (r ->> 'seen')::int = 1, 'a entrega sem resultado não volta: ' || r::text;
  assert (pg_temp.notice('quim', false)).status = 'erro' and (pg_temp.notice('quim', false)).error_code = 'sem_resposta', 'Quim: sem_resposta';

  -- Uma vez só: preparar de novo não põe ninguém (quem já recebeu, foi recusado ou dispensado).
  assert (public.clarevo_trial_notice_prepare() ->> 'na_fila')::int = 0, 'ninguém de novo';
  assert (select count(*) from public.trial_notices where not dry_run) = 4, 'quatro de verdade';
end $$;

-- ---------------------------------------------------------------------------
-- 7. O horário fechado e o interruptor desligado param a entrega na hora; ligado de novo, continua.
-- ---------------------------------------------------------------------------
select pg_temp.created_days_ago('leo', 12);
do $$
declare
  r jsonb;
begin
  assert (public.clarevo_trial_notice_prepare() ->> 'na_fila')::int = 1, 'Leo na fila';
end $$;
create or replace function public.clarevo_trial_notice_window(p_at timestamptz) returns boolean language sql stable set search_path = public as $$ select false $$;
do $$
declare
  r jsonb;
begin
  r := pg_temp.claim(50, true);
  assert r ->> 'mode' = 'ligado' and not (r ->> 'window')::boolean and jsonb_array_length(r -> 'items') = 0, 'fora do horário, nada: ' || r::text;
  assert (pg_temp.notice('leo', false)).status = 'pendente' and (pg_temp.notice('leo', false)).attempts = 0, 'Leo continua na fila';
end $$;
create or replace function public.clarevo_trial_notice_window(p_at timestamptz) returns boolean language sql stable set search_path = public as $$ select true $$;
do $$
declare
  r jsonb;
begin
  r := public.clarevo_staff_set_trial_notice_mode('desligado');
  assert (r #>> '{fila,na_fila}')::int = 0, 'desligado não põe ninguém';
  r := pg_temp.claim(50, true);
  assert r ->> 'mode' = 'desligado' and jsonb_array_length(r -> 'items') = 0, 'desligado: para na hora: ' || r::text;
  assert (pg_temp.notice('leo', false)).status = 'pendente', 'Leo continua na fila';
  perform public.clarevo_staff_set_trial_notice_mode('ligado');
  r := pg_temp.claim(1, true);
  assert pg_temp.claimed(r) = 'leo' and jsonb_array_length(r -> 'items') = 1, 'ligado de novo: Leo entregue';
  assert pg_temp.finish('leo', 'enviado', 'id-do-leo', null) ->> 'status' = 'enviado', 'Leo enviado';
end $$;

-- ---------------------------------------------------------------------------
-- 8. Expirado, guarda de 6 meses e a pessoa que fica anônima.
-- ---------------------------------------------------------------------------
do $$
declare
  r jsonb;
begin
  -- O aviso de ontem (fim do teste amanhã) que não saiu: expira. Os registros com mais de 6 meses do fim do teste saem.
  insert into public.trial_notices (person_id, trial_ends_on, status) values (pg_temp.id('ana'), pg_temp.hoje() + 1, 'pendente');
  insert into public.trial_notices (person_id, trial_ends_on, status, error_code)
  values (pg_temp.id('ana'), (pg_temp.hoje() - interval '6 months')::date - 1, 'erro', 'http_422'),
         (pg_temp.id('ana'), (pg_temp.hoje() - interval '6 months')::date, 'expirado', null);
  r := public.clarevo_trial_notice_prepare();
  assert (r ->> 'expirados')::int = 1 and (r ->> 'apagados')::int = 1 and (r ->> 'na_fila')::int = 0, 'expira e apaga: ' || r::text;
  assert (select status from public.trial_notices where person_id = pg_temp.id('ana') and trial_ends_on = pg_temp.hoje() + 1) = 'expirado', 'o de ontem expirou';
  assert exists (select 1 from public.trial_notices where person_id = pg_temp.id('ana') and trial_ends_on = (pg_temp.hoje() - interval '6 months')::date),
    'o de exatamente 6 meses fica até o dia seguinte';
  assert jsonb_array_length(pg_temp.claim(50, true) -> 'items') = 0, 'o expirado não é entregue';
  -- Olga sai da conta com autoria na Família da Ana (fica anônima): os avisos dela saem na hora.
  assert pg_temp.notices('olga') = 2, 'Olga com o ensaio e o de verdade';
  update public.persons set deleted_at = now(), display_name = '' where id = pg_temp.id('olga');
  assert pg_temp.notices('olga') = 0, 'a pessoa anônima perde os avisos';
  -- Nada mudou para o app.
  assert (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and has_function_privilege('authenticated', p.oid, 'execute')) = 130, 'continuam 130 funções do app';
end $$;

rollback;
