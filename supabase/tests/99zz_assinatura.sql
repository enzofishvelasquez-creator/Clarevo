-- Assinatura paga (D-083; migração 0023): o acesso de cada pessoa (clarevo_access e my_access), o início da cobrança marcado pela equipe,
-- os 14 dias de teste, a trava "só ver e exportar" no gatilho de record_operations (com as ações que valem sempre), a cortesia da equipe,
-- os avisos de pagamento (billing_apply: idempotência, renovação, plano familiar cobrindo a Família, fim e estorno), o Telegram em só
-- leitura e a exclusão da conta, que continua possível. Pessoas FICTÍCIAS: Ana (titular de uma Família), Bia (membro da Família da Ana)
-- e Caio (sozinho). Tudo em uma transação desfeita no fim.
\set ON_ERROR_STOP 1
\set ana  '''00000000-0000-0000-0000-0000000000a1'''
\set bia  '''00000000-0000-0000-0000-0000000000a2'''
\set caio '''00000000-0000-0000-0000-0000000000a3'''

begin;
set local clarevo.today = '2026-11-04';

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
-- Leituras e ajustes direto nas tabelas (sem a RLS), como o dono do banco.
create function pg_temp.access(p_name text) returns jsonb language sql security definer set search_path = public, pg_temp as $$
  select public.clarevo_access(pg_temp.id(p_name))
$$;
create function pg_temp.status(p_name text) returns text language sql security definer set search_path = public, pg_temp as $$
  select public.clarevo_access(pg_temp.id(p_name)) ->> 'status'
$$;
create function pg_temp.created_days_ago(p_name text, p_days int) returns void language sql security definer set search_path = public, pg_temp as $$
  update public.persons set created_at = now() - make_interval(days => p_days) where id = pg_temp.id(p_name)
$$;
create function pg_temp.account(p_ctx text) returns uuid language sql security definer set search_path = public, pg_temp as $$
  select id from public.financial_accounts where context_id = pg_temp.id(p_ctx) and is_default and deleted_at is null
$$;
create function pg_temp.nrecords(p_ctx text) returns bigint language sql security definer set search_path = public, pg_temp as $$
  select count(*) from public.financial_records where context_id = pg_temp.id(p_ctx) and deleted_at is null
$$;
create function pg_temp.sha(p_text text) returns text language sql as $$ select encode(sha256(convert_to(p_text, 'UTF8')), 'hex') $$;
-- Anotar como a pessoa (create_record pela sessão dela).
create function pg_temp.note(p_name text, p_key text) returns void language plpgsql as $$
begin
  perform pg_temp.as_(p_name);
  perform public.create_record(p_key, pg_temp.id(p_name || '_ctx'), pg_temp.account(p_name || '_ctx'), 'despesa', 1000, '2026-11-04', 'Mercado', null, null);
end $$;

insert into ids values ('ana', :ana), ('bia', :bia), ('caio', :caio);
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  (:ana,  'ana.assinatura@exemplo.test',  now(), '{"display_name":"Ana"}'),
  (:bia,  'bia.assinatura@exemplo.test',  now(), '{"display_name":"Bia"}'),
  (:caio, 'caio.assinatura@exemplo.test', now(), '{"display_name":"Caio"}');

set role authenticated;
do $$
declare
  p text;
  space jsonb;
  r jsonb;
begin
  foreach p in array array['ana', 'bia', 'caio'] loop
    perform pg_temp.as_(p);
    space := public.ensure_personal_space('Conta principal');
    insert into ids values (p || '_ctx', (space ->> 'context_id')::uuid);
  end loop;
  perform pg_temp.as_('ana');
  insert into ids values ('fam', (public.create_family('Família da Ana', 'as-fam-0001') #>> '{context,id}')::uuid);
  r := public.create_family_invite(pg_temp.id('fam'), 'membro', 'as-inv-0001');
  perform pg_temp.as_('bia');
  perform public.accept_family_invite(r ->> 'code', 'as-acc-0001');
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 1. Privilégios: o app lê só o próprio acesso; a chave de serviço só aplica avisos; a equipe só pelo SQL Editor; nada de tabela direta.
-- ---------------------------------------------------------------------------
do $$
declare
  f text;
begin
  assert has_function_privilege('authenticated', 'public.my_access()', 'execute') and not has_function_privilege('anon', 'public.my_access()', 'execute'),
    'my_access só para quem entrou';
  assert (select prosecdef from pg_proc where oid = 'public.my_access()'::regprocedure), 'my_access é security definer';
  assert has_function_privilege('service_role', 'public.billing_apply(text, text, uuid, text, text, timestamptz, timestamptz)', 'execute')
     and not has_function_privilege('authenticated', 'public.billing_apply(text, text, uuid, text, text, timestamptz, timestamptz)', 'execute')
     and not has_function_privilege('anon', 'public.billing_apply(text, text, uuid, text, text, timestamptz, timestamptz)', 'execute'),
    'billing_apply só com a chave de serviço';
  foreach f in array array['clarevo_access(uuid)', 'clarevo_write_free_actions()', 'clarevo_staff_set_billing_start(timestamptz)',
                           'clarevo_staff_grant_courtesy(text, text, timestamptz)'] loop
    assert not has_function_privilege('authenticated', 'public.' || f, 'execute') and not has_function_privilege('anon', 'public.' || f, 'execute')
       and not has_function_privilege('service_role', 'public.' || f, 'execute'), 'ninguém de fora executa ' || f;
  end loop;
  foreach f in array array['billing_settings', 'billing_events'] loop
    assert (select relrowsecurity from pg_class where oid = ('public.' || f)::regclass), 'RLS ligada em ' || f;
    assert not has_table_privilege('authenticated', 'public.' || f, 'select') and not has_table_privilege('service_role', 'public.' || f, 'select'),
      'sem leitura direta de ' || f;
  end loop;
  assert (select count(*) from public.billing_settings) = 1 and (select enforced_from from public.billing_settings) is null,
    'uma linha só, sem início da cobrança';
end $$;

-- ---------------------------------------------------------------------------
-- 2. Antes do início da cobrança: todo mundo com acesso pleno ("pre_lancamento"), mesmo com a conta antiga.
-- ---------------------------------------------------------------------------
select pg_temp.created_days_ago('caio', 400);
set role authenticated;
do $$
declare
  a jsonb;
begin
  perform pg_temp.as_('caio');
  a := public.my_access();
  assert a ->> 'status' = 'pre_lancamento' and (a ->> 'can_write')::boolean and a ->> 'until' is null, 'antes do início: ' || a::text;
  perform pg_temp.note('caio', 'as-caio-0001');
end $$;
reset role;
do $$ begin
  assert pg_temp.nrecords('caio_ctx') = 1, 'anota antes do início da cobrança';
  -- Início marcado para o futuro: ainda "pre_lancamento", com a data de início.
  perform public.clarevo_staff_set_billing_start(now() + interval '3 days');
  assert pg_temp.status('caio') = 'pre_lancamento' and (pg_temp.access('caio') ->> 'until')::timestamptz > now(), 'início no futuro';
end $$;

-- ---------------------------------------------------------------------------
-- 3. Cobrança valendo: 14 dias contados do maior entre a criação da conta e o início; depois, só leitura.
-- ---------------------------------------------------------------------------
do $$
declare
  a jsonb;
begin
  perform public.clarevo_staff_set_billing_start(now() - interval '5 days');
  -- Caio tem conta de 400 dias: os 14 dias contam do início da cobrança (5 dias atrás), então faltam 9.
  a := pg_temp.access('caio');
  assert a ->> 'status' = 'teste' and (a ->> 'until')::timestamptz between now() + interval '8 days 23 hours' and now() + interval '9 days 1 hour',
    'conta antiga ganha os 14 dias a partir do início: ' || a::text;
  -- Ana criou a conta hoje: 14 dias a partir de agora.
  a := pg_temp.access('ana');
  assert a ->> 'status' = 'teste' and (a ->> 'until')::timestamptz > now() + interval '13 days', 'conta nova: 14 dias';
  -- Caio, com o início da cobrança há 20 dias: o teste acabou.
  perform public.clarevo_staff_set_billing_start(now() - interval '20 days');
  a := pg_temp.access('caio');
  assert a ->> 'status' = 'leitura' and not (a ->> 'can_write')::boolean, 'depois dos 14 dias, só leitura: ' || a::text;
end $$;

-- Em só leitura: anotar, excluir e criar são recusados com assinatura_necessaria (PT402); ler continua.
set role authenticated;
select pg_temp.expect_code($q$select pg_temp.note('caio', 'as-caio-0002')$q$, 'assinatura_necessaria', 'PT402');
do $$
declare
  r public.financial_records%rowtype;
begin
  perform pg_temp.as_('caio');
  select * into r from public.financial_records where context_id = pg_temp.id('caio_ctx') and deleted_at is null limit 1;
  assert r.id is not null, 'em só leitura, a pessoa ainda lê os registros dela';
  begin
    perform public.delete_record('as-caio-0003', r.id, r.version);
    raise exception 'excluir deveria ser recusado';
  exception when sqlstate 'PT402' then
    null;
  end;
  -- As ações livres continuam: responder de onde conheceu e desligar o Telegram.
  perform public.set_signup_source('indicacao', 'as-caio-0004', 0);
  perform public.unlink_telegram('as-caio-0005');
  assert (public.my_access() ->> 'status') = 'leitura', 'continua em só leitura';
end $$;
select pg_temp.expect_code(format('select public.create_telegram_code(%L, %L)', pg_temp.id('caio_ctx'), 'as-caio-0006'), 'assinatura_necessaria', 'PT402');
reset role;
do $$ begin
  assert pg_temp.nrecords('caio_ctx') = 1, 'nada novo foi gravado e nada foi excluído';
  assert 'sair_familia' = any (public.clarevo_write_free_actions()) and 'aceitar_licenca' = any (public.clarevo_write_free_actions())
     and not ('criar' = any (public.clarevo_write_free_actions())) and not ('excluir' = any (public.clarevo_write_free_actions())),
    'sair e aceitar benefício valem sempre; criar e excluir não';
end $$;

-- ---------------------------------------------------------------------------
-- 4. Cortesia da equipe: acesso pleno sem pagar.
-- ---------------------------------------------------------------------------
select pg_temp.expect_code($q$select public.clarevo_staff_grant_courtesy('ninguem@exemplo.test', 'individual', null)$q$, 'pessoa_sem_conta', '22023');
select pg_temp.expect_code($q$select public.clarevo_staff_grant_courtesy('caio.assinatura@exemplo.test', 'outro', null)$q$, 'plano_invalido', '22023');
do $$
declare
  a jsonb;
begin
  a := public.clarevo_staff_grant_courtesy('CAIO.assinatura@exemplo.test', 'individual', now() + interval '30 days');
  assert a ->> 'status' = 'cortesia' and (a ->> 'can_write')::boolean and a ->> 'plan' = 'individual', 'cortesia por 30 dias: ' || a::text;
end $$;
set role authenticated;
select pg_temp.note('caio', 'as-caio-0007');
reset role;
do $$ begin
  assert pg_temp.nrecords('caio_ctx') = 2, 'com a cortesia, volta a anotar';
end $$;

-- ---------------------------------------------------------------------------
-- 5. Avisos de pagamento (billing_apply): assinatura, repetição, plano familiar cobrindo a Família, estorno, aviso atrasado (fora de
--    ordem) e aviso que chega antes de a pessoa ser identificada. Dentro da transação now() não anda: as datas dos eventos são explícitas.
-- ---------------------------------------------------------------------------
select pg_temp.created_days_ago('ana', 30);
select pg_temp.created_days_ago('bia', 30);
do $$ begin
  assert pg_temp.status('ana') = 'leitura' and pg_temp.status('bia') = 'leitura', 'Ana e Bia passaram dos 14 dias';
end $$;
set role service_role;
select pg_temp.as_service();
select pg_temp.expect_code(format($q$select public.billing_apply('ev-x', 'loja', %L, %L, 'individual', now(), now())$q$, pg_temp.id('ana'), pg_temp.sha('x')), 'aviso_invalido', '22023');
select pg_temp.expect_code(format($q$select public.billing_apply('ev-x', 'apple', %L, 'nao-e-resumo', 'individual', now(), now())$q$, pg_temp.id('ana')), 'aviso_invalido', '22023');
select pg_temp.expect_code(format($q$select public.billing_apply('ev-x', 'apple', %L, %L, 'mensal', now(), now())$q$, pg_temp.id('ana'), pg_temp.sha('x')), 'aviso_invalido', '22023');
select pg_temp.expect_code(format($q$select public.billing_apply('ev-x', 'apple', %L, %L, 'individual', now(), null)$q$, pg_temp.id('ana'), pg_temp.sha('x')), 'aviso_invalido', '22023');
select pg_temp.expect_code(format($q$select public.billing_apply('ev-x', 'apple', %L, %L, 'individual', now(), now() + interval '2 days')$q$, pg_temp.id('ana'), pg_temp.sha('x')), 'aviso_invalido', '22023');
do $$
declare
  r jsonb;
begin
  r := public.billing_apply('ev-ana-1', 'apple', pg_temp.id('ana'), pg_temp.sha('apple-sub-ana'), 'individual', now() + interval '30 days',
                            now() - interval '10 days');
  assert r ->> 'result' = 'aplicado' and r #>> '{access,status}' = 'assinatura' and r #>> '{access,plan}' = 'individual', 'assinou: ' || r::text;
  assert public.billing_apply('ev-ana-1', 'apple', pg_temp.id('ana'), pg_temp.sha('apple-sub-ana'), 'individual', now() + interval '30 days',
                              now() - interval '10 days')
       = '{"result": "repetido"}', 'o mesmo aviso não se aplica duas vezes';
  -- Aviso sem pessoa identificada (ou de pessoa que não existe): não fica gravado, para valer quando chegar de novo com a pessoa.
  assert public.billing_apply('ev-web-1', 'web', null, pg_temp.sha('web-bia'), 'individual', now() + interval '30 days', now() - interval '2 days')
       = '{"result": "sem_pessoa"}', 'aviso sem pessoa';
  assert public.billing_apply('ev-sem-pessoa', 'web', '00000000-0000-0000-0000-00000000dead', pg_temp.sha('web-x'), 'individual',
                              now() + interval '30 days', now() - interval '2 days')
       = '{"result": "sem_pessoa"}', 'aviso de pessoa que não existe';
end $$;
reset role;
do $$ begin
  assert pg_temp.status('ana') = 'assinatura' and pg_temp.status('bia') = 'leitura', 'o plano individual da Ana não cobre a Bia';
  assert (select external_ref from public.plan_entitlements where person_id = pg_temp.id('ana') and source = 'particular') = pg_temp.sha('apple-sub-ana'),
    'da assinatura na loja fica só o resumo';
end $$;
set role service_role;
select pg_temp.as_service();
do $$
declare
  r jsonb;
begin
  -- Ana passa para o plano familiar: a Bia, membro da Família da Ana, fica coberta.
  r := public.billing_apply('ev-ana-2', 'apple', pg_temp.id('ana'), pg_temp.sha('apple-sub-ana'), 'familiar', now() + interval '30 days',
                            now() - interval '5 days');
  assert r #>> '{access,plan}' = 'familiar', 'troca para o familiar';
  -- A mesma assinatura não passa para outra pessoa.
  begin
    perform public.billing_apply('ev-ana-3', 'apple', pg_temp.id('caio'), pg_temp.sha('apple-sub-ana'), 'familiar', now() + interval '30 days',
                                 now() - interval '4 days');
    raise exception 'deveria recusar';
  exception when others then
    assert sqlerrm = 'assinatura_de_outra_pessoa', 'assinatura de outra pessoa: ' || sqlerrm;
  end;
end $$;
reset role;
do $$ begin
  assert pg_temp.status('bia') = 'familia' and (pg_temp.access('bia') ->> 'can_write')::boolean, 'a Bia, coberta pelo familiar da titular';
  assert pg_temp.status('caio') = 'cortesia', 'o aviso recusado não mexeu no Caio';
end $$;
set role authenticated;
select pg_temp.note('bia', 'as-bia-0001');
-- A Bia sai da Família (ação livre) e perde a cobertura.
select pg_temp.as_('bia');
select public.leave_family(pg_temp.id('fam'), 'as-bia-0002');
reset role;
do $$ begin
  assert pg_temp.nrecords('bia_ctx') = 1, 'a Bia anotou enquanto coberta';
  assert pg_temp.status('bia') = 'leitura', 'fora da Família, a Bia volta ao que tem: só leitura';
end $$;
-- Estorno: a Ana perde o acesso na hora. Depois, chega atrasada a reentrega de um aviso anterior (de 7 dias atrás, com o período pago
-- até daqui a 30 dias, plano individual): fica registrada, mas não devolve o acesso nem muda o plano.
set role service_role;
select pg_temp.as_service();
select public.billing_apply('ev-ana-4', 'apple', pg_temp.id('ana'), pg_temp.sha('apple-sub-ana'), 'familiar', now() - interval '1 second',
                            now() - interval '1 day');
do $$
declare
  r jsonb;
begin
  r := public.billing_apply('ev-ana-atrasado', 'apple', pg_temp.id('ana'), pg_temp.sha('apple-sub-ana'), 'individual', now() + interval '30 days',
                            now() - interval '7 days');
  assert r ->> 'result' = 'antigo' and r #>> '{access,status}' = 'leitura', 'aviso atrasado não muda nada: ' || r::text;
  assert public.billing_apply('ev-ana-atrasado', 'apple', pg_temp.id('ana'), pg_temp.sha('apple-sub-ana'), 'individual', now() + interval '30 days',
                              now() - interval '7 days') = '{"result": "repetido"}', 'e não volta a ser considerado';
  -- O aviso que tinha chegado sem pessoa chega de novo, agora com a Bia: vale.
  r := public.billing_apply('ev-web-1', 'web', pg_temp.id('bia'), pg_temp.sha('web-bia'), 'individual', now() + interval '30 days', now() - interval '2 days');
  assert r ->> 'result' = 'aplicado' and r #>> '{access,status}' = 'assinatura', 'o aviso de antes vale com a pessoa: ' || r::text;
end $$;
reset role;
do $$ begin
  assert pg_temp.status('ana') = 'leitura', 'depois do estorno, só leitura';
  assert (select plan from public.plan_entitlements where person_id = pg_temp.id('ana') and source = 'particular') = 'familiar'
     and (select last_event_at from public.plan_entitlements where person_id = pg_temp.id('ana') and source = 'particular') = now() - interval '1 day',
    'o aviso atrasado não mexeu no plano nem na data do último evento';
  assert (select array_agg(event_id order by event_id) from public.billing_events where event_id like 'ev-%')
       = array['ev-ana-1', 'ev-ana-2', 'ev-ana-4', 'ev-ana-atrasado', 'ev-web-1'],
    'cada aviso aceito fica registrado uma vez; os inválidos, o recusado e os sem pessoa não ficam';
  assert 'alterar_papel_familia' = any (public.clarevo_write_free_actions()), 'a titular em só leitura ainda administra quem está na Família';
end $$;

-- ---------------------------------------------------------------------------
-- 6. Telegram em só leitura: anotar responde sem_assinatura e não grava nada.
-- ---------------------------------------------------------------------------
do $$ begin
  perform public.clarevo_staff_set_billing_start(null);
end $$;
set role authenticated;
do $$
declare
  r jsonb;
begin
  perform pg_temp.as_('ana');
  r := public.create_telegram_code(pg_temp.id('ana_ctx'), 'as-ana-tg-0001');
  insert into ids values ('ana_code:' || (r ->> 'code'), null);
end $$;
reset role;
set role service_role;
select pg_temp.as_service();
do $$
declare
  v_code text := (select substr(name, 10) from ids where name like 'ana_code:%');
  v_msg text := 'telegram:' || encode(sha256(convert_to('ana:1', 'UTF8')), 'hex');
begin
  assert public.telegram_link(v_msg, pg_temp.sha('tg-ana'), v_code) ->> 'result' = 'ligado', 'liga antes da cobrança';
end $$;
reset role;
do $$ begin
  perform public.clarevo_staff_set_billing_start(now() - interval '20 days');
  assert pg_temp.status('ana') = 'leitura', 'Ana em só leitura';
end $$;
set role service_role;
select pg_temp.as_service();
do $$
declare
  r jsonb;
begin
  r := public.telegram_add_record('telegram:' || encode(sha256(convert_to('ana:2', 'UTF8')), 'hex'), pg_temp.sha('tg-ana'), now(), 'despesa', 500,
                                  0, null, 'Café', null);
  assert r ->> 'result' = 'sem_assinatura', 'Telegram em só leitura: ' || r::text;
end $$;
reset role;
do $$ begin
  assert pg_temp.nrecords('ana_ctx') = 0, 'nada anotado pelo Telegram';
  assert exists (select 1 from public.chat_messages where outcome = 'sem_assinatura'), 'a mensagem fica registrada com o resultado';
end $$;

-- ---------------------------------------------------------------------------
-- 7. Excluir a conta continua possível em só leitura (não grava operação). A cortesia do Caio acaba antes, para ele estar em só leitura.
-- ---------------------------------------------------------------------------
create function pg_temp.end_courtesy(p_name text) returns void language sql security definer set search_path = public, pg_temp as $$
  update public.plan_entitlements set valid_until = now() - interval '1 second' where person_id = pg_temp.id(p_name) and source = 'cortesia'
$$;
select pg_temp.end_courtesy('caio');
do $$ begin
  assert pg_temp.status('caio') = 'leitura', 'Caio em só leitura antes de excluir';
end $$;
set role authenticated;
do $$ begin
  perform pg_temp.as_('caio');
  perform public.delete_my_account('EXCLUIR', 'as-caio-del-0001');
end $$;
reset role;
do $$ begin
  assert not exists (select 1 from public.persons where id = pg_temp.id('caio')), 'a conta do Caio foi excluída';
  assert not exists (select 1 from public.plan_entitlements where person_id = pg_temp.id('caio')), 'a cortesia saiu junto';
end $$;

rollback;
