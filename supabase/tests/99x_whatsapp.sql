-- Anotar pelo WhatsApp, fase 1 (D-076; migração 0020): whatsapp_links, whatsapp_link_codes, whatsapp_messages, as funções do app
-- (my_whatsapp, create_whatsapp_code, unlink_whatsapp) e as do servidor (whatsapp_link, whatsapp_add_record, whatsapp_undo,
-- whatsapp_unlink, só service_role). Confere: o código (alfabeto, validade, uso único, um por pessoa, só o resumo guardado), o vínculo
-- (um número por pessoa, uma pessoa por número), anotar e desfazer pelas mesmas create_record e delete_record (autoria, conta principal,
-- operação, atividade, idempotência, sessão devolvida), os casos que viram resposta, a repetição da Meta, os limites (tentativas e
-- mensagens), a Família (quem sai não anota mais), desligar (pelo app e pelo WhatsApp), os 30 dias das mensagens, a exclusão da conta e os
-- privilégios. Nada do texto nem do número é guardado: as funções recebem só o resumo.
-- Pessoas FICTÍCIAS: Ana (Pessoal e Família), Bia (Pessoal), Eli (membro da Família da Ana) e Hugo (nunca entrou no app).
-- Tudo em uma transação desfeita no fim.
\set ON_ERROR_STOP 1
\set ana  '''00000000-0000-0000-0000-0000000000e1'''
\set bia  '''00000000-0000-0000-0000-0000000000e2'''
\set eli  '''00000000-0000-0000-0000-0000000000e3'''
\set hugo '''00000000-0000-0000-0000-0000000000e4'''

begin;
set local clarevo.today = '2026-10-30';

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
-- Como o PostgREST com a chave de serviço: sem pessoa na sessão.
create function pg_temp.as_service() returns void language sql as $$
  select set_config('request.jwt.claim.sub', '', true);
  select set_config('request.jwt.claims', '{"role":"service_role"}', true);
$$;
-- Resumo de um número (o servidor calcula o mesmo: SHA-256 dos algarismos).
create function pg_temp.ph(p_number text) returns text language sql as $$
  select encode(sha256(convert_to(p_number, 'UTF8')), 'hex')
$$;
-- Chamadas do servidor.
create function pg_temp.link(p_msg text, p_number text, p_code text) returns jsonb language sql as $$
  select public.whatsapp_link(p_msg, pg_temp.ph(p_number), p_code)
$$;
-- Data escrita na mensagem (p_on); pg_temp.addrel: "hoje" e "ontem" (dias antes do dia da pessoa no instante da mensagem).
create function pg_temp.add(p_msg text, p_number text, p_kind public.record_kind, p_cents bigint, p_on date, p_desc text, p_cat text default null)
returns jsonb language sql as $$
  select public.whatsapp_add_record(p_msg, pg_temp.ph(p_number), now(), p_kind, p_cents, null, p_on, p_desc, p_cat)
$$;
create function pg_temp.addrel(p_msg text, p_number text, p_days integer, p_desc text) returns jsonb language sql as $$
  select public.whatsapp_add_record(p_msg, pg_temp.ph(p_number), now(), 'despesa', 100, p_days, null, p_desc, null)
$$;
create function pg_temp.note(p_msg text, p_number text, p_outcome text) returns jsonb language sql as $$
  select public.whatsapp_note(p_msg, pg_temp.ph(p_number), p_outcome)
$$;
create function pg_temp.undo(p_msg text, p_number text) returns jsonb language sql as $$
  select public.whatsapp_undo(p_msg, pg_temp.ph(p_number))
$$;
create function pg_temp.unlink(p_msg text, p_number text) returns jsonb language sql as $$
  select public.whatsapp_unlink(p_msg, pg_temp.ph(p_number))
$$;
-- Leituras direto nas tabelas (sem a RLS).
create function pg_temp.linked(p_name text) returns text language sql security definer set search_path = public, pg_temp as $$
  select coalesce((select l.phone_hash || '@' || l.context_id from public.whatsapp_links l where l.person_id = pg_temp.id(p_name)), '-')
$$;
create function pg_temp.ncodes() returns bigint language sql security definer set search_path = public, pg_temp as $$
  select count(*) from public.whatsapp_link_codes
$$;
create function pg_temp.code_of(p_name text) returns text language sql security definer set search_path = public, pg_temp as $$
  select code_hash from public.whatsapp_link_codes where person_id = pg_temp.id(p_name)
$$;
create function pg_temp.outcome(p_msg text) returns text language sql security definer set search_path = public, pg_temp as $$
  select coalesce((select outcome from public.whatsapp_messages where message_id = p_msg), '-')
$$;
create function pg_temp.nrecords() returns bigint language sql security definer set search_path = public, pg_temp as $$
  select count(*) from public.financial_records
$$;
create function pg_temp.nops(p_action text, p_name text default null) returns bigint language sql security definer
set search_path = public, pg_temp as $$
  select count(*) from public.record_operations where action = p_action and (p_name is null or actor_id = pg_temp.id(p_name))
$$;
create function pg_temp.lastwrite(p_name text, p_ctx text) returns text language sql security definer set search_path = public, pg_temp as $$
  select coalesce((select to_char(last_write_on, 'YYYY-MM-DD') from public.context_activity
                    where person_id = pg_temp.id(p_name) and context_id = pg_temp.id(p_ctx)), '-')
$$;
-- Um código conhecido para a pessoa (a função só devolve o código uma vez; aqui o teste fixa um código para casos de validade).
create function pg_temp.fix_code(p_name text, p_code text, p_ctx text, p_expires timestamptz) returns void language sql security definer
set search_path = public, pg_temp as $$
  update public.whatsapp_link_codes set code_hash = encode(sha256(convert_to(p_code, 'UTF8')), 'hex'), context_id = pg_temp.id(p_ctx),
         expires_at = p_expires
   where person_id = pg_temp.id(p_name)
$$;
create temp table codes (name text primary key, code text);
grant select, insert, update on codes to authenticated, service_role;
create function pg_temp.code(p_name text) returns text language sql as $$ select code from codes where name = p_name $$;

insert into ids values ('ana', :ana), ('bia', :bia), ('eli', :eli), ('hugo', :hugo);
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  (:ana,  'ana@exemplo.test',  now(), '{"display_name":"Ana"}'),
  (:bia,  'bia@exemplo.test',  now(), '{"display_name":"Bia"}'),
  (:eli,  'eli@exemplo.test',  now(), '{"display_name":"Eli"}'),
  (:hugo, 'hugo@exemplo.test', now(), '{"display_name":"Hugo"}');

set role authenticated;
do $$
declare
  p text;
  space jsonb;
  r jsonb;
begin
  foreach p in array array['ana', 'bia', 'eli'] loop
    perform pg_temp.as_(p);
    space := public.ensure_personal_space('Conta principal');
    insert into ids values (p || '_ctx', (space ->> 'context_id')::uuid);
  end loop;
  perform pg_temp.as_('ana');
  insert into ids values ('fam', (public.create_family('Família da Ana', 'wa-fam-0001') #>> '{context,id}')::uuid);
  r := public.create_family_invite(pg_temp.id('fam'), 'membro', 'wa-inv-0001');
  perform pg_temp.as_('eli');
  perform public.accept_family_invite(r ->> 'code', 'wa-acc-0001');
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 1. Privilégios (W6): o app executa só as três funções dele; a chave de serviço, só as quatro do servidor (e nenhuma interna);
-- anon nada; tabelas com RLS e sem acesso direto.
-- ---------------------------------------------------------------------------
do $$
declare
  f text;
begin
  foreach f in array array['my_whatsapp()', 'create_whatsapp_code(uuid, text)', 'unlink_whatsapp(text)'] loop
    assert has_function_privilege('authenticated', 'public.' || f, 'execute'), 'authenticated executa ' || f;
    assert not has_function_privilege('anon', 'public.' || f, 'execute'), 'anon não executa ' || f;
  end loop;
  foreach f in array array['whatsapp_note(text, text, text)', 'whatsapp_link(text, text, text)',
                           'whatsapp_add_record(text, text, timestamptz, public.record_kind, bigint, integer, date, text, text)',
                           'whatsapp_undo(text, text, timestamptz)', 'whatsapp_unlink(text, text)'] loop
    assert has_function_privilege('service_role', 'public.' || f, 'execute'), 'service_role executa ' || f;
    assert not has_function_privilege('authenticated', 'public.' || f, 'execute') and not has_function_privilege('anon', 'public.' || f, 'execute'),
      'só o servidor executa ' || f;
    assert not exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                        where p.oid = ('public.' || f)::regprocedure and a.grantee = 0), 'sem execute para public: ' || f;
  end loop;
  assert (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname like 'clarevo\_whatsapp\_%') = 8, 'as oito internas';
  assert not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                      cross join (values ('service_role'), ('authenticated'), ('anon')) r (rolname)
                     where n.nspname = 'public' and p.proname like 'clarevo\_whatsapp\_%' and has_function_privilege(r.rolname, p.oid, 'execute')),
    'nenhuma interna executável de fora';
  foreach f in array array['whatsapp_links', 'whatsapp_link_codes', 'whatsapp_messages'] loop
    assert (select relrowsecurity from pg_class where oid = ('public.' || f)::regclass), 'RLS ligada em ' || f;
    assert not exists (select 1 from pg_policies where schemaname = 'public' and tablename = f), 'sem política em ' || f;
    assert not has_table_privilege('authenticated', 'public.' || f, 'select') and not has_table_privilege('authenticated', 'public.' || f, 'insert')
       and not has_table_privilege('authenticated', 'public.' || f, 'update') and not has_table_privilege('authenticated', 'public.' || f, 'delete')
       and not has_table_privilege('anon', 'public.' || f, 'select') and not has_table_privilege('service_role', 'public.' || f, 'select')
       and not has_table_privilege('service_role', 'public.' || f, 'insert'), 'sem acesso direto a ' || f;
  end loop;
  -- Nenhuma coluna guarda texto de mensagem nem número.
  assert not exists (select 1 from information_schema.columns
                      where table_schema = 'public' and table_name like 'whatsapp\_%'
                        and column_name in ('phone', 'number', 'text', 'body', 'message', 'wa_id', 'from')), 'nem número nem texto guardados';
end $$;

set role anon;
select pg_temp.expect_code('select public.my_whatsapp()', 'permission denied for function my_whatsapp', '42501');
select pg_temp.expect_code($q$select public.whatsapp_add_record('m', repeat('a', 64), now(), 'despesa', 100, 0, null, 'x')$q$,
                           'permission denied for function whatsapp_add_record', '42501');
reset role;
set role authenticated;
select pg_temp.as_('ana');
select pg_temp.expect_code($q$select public.whatsapp_link('m', repeat('a', 64), 'ABCDEFGH')$q$, 'permission denied for function whatsapp_link', '42501');
select pg_temp.expect_code('select count(*) from public.whatsapp_links', 'permission denied for table whatsapp_links', '42501');
reset role;

-- ---------------------------------------------------------------------------
-- 2. Estado inicial e o código (W3).
-- ---------------------------------------------------------------------------
set role authenticated;
do $$
declare
  r jsonb;
  s jsonb;
begin
  perform pg_temp.as_('ana');
  s := public.my_whatsapp();
  assert s = jsonb_build_object('linked', false, 'context_id', null, 'linked_at', null, 'code_context_id', null, 'code_expires_at', null),
    'conta nova: nada ligado e nenhum código: ' || s::text;

  r := public.create_whatsapp_code(pg_temp.id('ana_ctx'), 'wa-ana-code-0001');
  assert r ->> 'code' ~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$', 'código de 8 símbolos do alfabeto: ' || r::text;
  assert (r ->> 'context_id')::uuid = pg_temp.id('ana_ctx'), 'o espaço do código';
  assert (r ->> 'expires_at')::timestamptz between now() + interval '14 minutes' and now() + interval '15 minutes', 'vale 15 minutos';
  assert (select array_agg(k order by k) from jsonb_object_keys(r) k) = array['code', 'context_id', 'expires_at'], 'só os três campos';
  insert into codes values ('ana1', r ->> 'code');

  s := public.my_whatsapp();
  assert (s ->> 'linked')::boolean = false and (s ->> 'code_context_id')::uuid = pg_temp.id('ana_ctx')
     and (s ->> 'code_expires_at')::timestamptz = (r ->> 'expires_at')::timestamptz, 'o estado mostra o código pendente: ' || s::text;

  -- Repetição: o código não volta (só o resumo fica guardado); outro pedido com a mesma chave é recusado.
  r := public.create_whatsapp_code(pg_temp.id('ana_ctx'), 'wa-ana-code-0001');
  assert r ->> 'code' is null and (r ->> 'context_id')::uuid = pg_temp.id('ana_ctx') and r ->> 'expires_at' is not null,
    'repetir a chave devolve o código nulo: ' || r::text;
end $$;
select pg_temp.expect_code(format('select public.create_whatsapp_code(%L, %L)', pg_temp.id('fam'), 'wa-ana-code-0001'), 'chave_reutilizada', 'PT409');
select pg_temp.expect_code(format('select public.create_whatsapp_code(%L, %L)', pg_temp.id('ana_ctx'), 'curta'), 'chave_invalida', '22023');
select pg_temp.expect_code(format('select public.create_whatsapp_code(%L, %L)', pg_temp.id('bia_ctx'), 'wa-ana-code-0002'), 'sem_permissao', '42501');
select pg_temp.expect_code('select public.create_whatsapp_code(null, ''wa-ana-code-0003'')', 'sem_permissao', '42501');
select pg_temp.as_('hugo');
select pg_temp.expect_code('select public.unlink_whatsapp(''wa-hugo-0001'')', 'sem_permissao', '42501');
select pg_temp.as_('nao-existe');
select pg_temp.expect_code('select public.my_whatsapp()', 'nao_autenticado', '42501');
reset role;
do $$
declare
  o public.record_operations%rowtype;
begin
  assert pg_temp.ncodes() = 1, 'um código';
  assert pg_temp.code_of('ana') = encode(sha256(convert_to(pg_temp.code('ana1'), 'UTF8')), 'hex'), 'só o resumo SHA-256 do código';
  select * into o from public.record_operations where action = 'gerar_codigo_whatsapp';
  assert o.actor_id = pg_temp.id('ana') and o.context_id = pg_temp.id('ana_ctx') and o.record_id is null and o.commitment_id is null
     and o.target_id is null, 'operação sem alvo, no espaço do código';
  assert pg_temp.lastwrite('ana', 'ana_ctx') = '-', 'gerar código não conta como anotação (W7)';
end $$;

-- Gerar outro substitui o anterior.
set role authenticated;
do $$
declare
  r jsonb;
begin
  perform pg_temp.as_('ana');
  r := public.create_whatsapp_code(pg_temp.id('ana_ctx'), 'wa-ana-code-0004');
  insert into codes values ('ana2', r ->> 'code');
  assert r ->> 'code' <> pg_temp.code('ana1'), 'código novo';
end $$;
reset role;
do $$ begin
  assert pg_temp.ncodes() = 1, 'ainda um código por pessoa';
end $$;

-- ---------------------------------------------------------------------------
-- 3. Ligar pelo servidor: código errado, código antigo, código certo, repetição e uso único.
-- ---------------------------------------------------------------------------
set role service_role;
select pg_temp.as_service();
do $$
declare
  r jsonb;
begin
  assert pg_temp.link('wa-m-001', '5521900000001', 'ZZZZ2222') = '{"result": "codigo_invalido"}', 'código que não existe';
  assert pg_temp.link('wa-m-002', '5521900000001', pg_temp.code('ana1')) = '{"result": "codigo_invalido"}', 'o código anterior não vale mais';
  r := pg_temp.link('wa-m-003', '5521900000001', lower(substr(pg_temp.code('ana2'), 1, 4) || '-' || substr(pg_temp.code('ana2'), 5)));
  assert r = '{"result": "ligado", "space": {"kind": "pessoal", "name": "Pessoal"}}', 'ligado no Pessoal (com hífen e minúsculas): ' || r::text;
  -- A sessão de serviço volta ao que era.
  assert current_setting('request.jwt.claims', true) = '{"role":"service_role"}' and current_setting('request.jwt.claim.sub', true) = '',
    'a sessão emprestada é devolvida';
  assert pg_temp.link('wa-m-003', '5521900000001', pg_temp.code('ana2')) = '{"result": "repetida"}', 'a mesma entrega repetida';
  assert pg_temp.link('wa-m-004', '5521900000002', pg_temp.code('ana2')) = '{"result": "codigo_invalido"}', 'o código serve uma vez';
end $$;
reset role;
do $$
declare
  o public.record_operations%rowtype;
begin
  assert pg_temp.linked('ana') = pg_temp.ph('5521900000001') || '@' || pg_temp.id('ana_ctx'), 'a Ana ligada pelo resumo do número';
  assert pg_temp.ncodes() = 0, 'o código usado sai';
  assert pg_temp.outcome('wa-m-001') = 'codigo_invalido' and pg_temp.outcome('wa-m-003') = 'ligado' and pg_temp.outcome('wa-m-004') = 'codigo_invalido',
    'as mensagens tratadas';
  assert (select person_id from public.whatsapp_messages where message_id = 'wa-m-001') is null
     and (select person_id from public.whatsapp_messages where message_id = 'wa-m-003') = pg_temp.id('ana'), 'a pessoa só nas que acharam alguém';
  select * into o from public.record_operations where action = 'ligar_whatsapp';
  assert o.actor_id = pg_temp.id('ana') and o.idempotency_key = 'whatsapp:' || md5('wa-m-003') and o.context_id = pg_temp.id('ana_ctx')
     and o.target_id is null and o.record_id is null, 'operação de ligar, sem alvo';
  assert pg_temp.nops('ligar_whatsapp') = 1, 'a repetição não grava outra';
  assert pg_temp.lastwrite('ana', 'ana_ctx') = '-', 'ligar não conta como anotação (W7)';
end $$;
set role authenticated;
do $$
declare
  s jsonb;
begin
  perform pg_temp.as_('ana');
  s := public.my_whatsapp();
  assert (s ->> 'linked')::boolean and (s ->> 'context_id')::uuid = pg_temp.id('ana_ctx') and s ->> 'linked_at' is not null
     and s ->> 'code_context_id' is null and s ->> 'code_expires_at' is null, 'o app vê ligado, sem número e sem código: ' || s::text;
end $$;
reset role;

-- Código vencido.
set role authenticated;
do $$ begin
  perform pg_temp.as_('bia');
  perform public.create_whatsapp_code(pg_temp.id('bia_ctx'), 'wa-bia-code-0001');
end $$;
reset role;
select pg_temp.fix_code('bia', 'BBBBCCCC', 'bia_ctx', now() - interval '1 second');
set role authenticated;
do $$ begin
  perform pg_temp.as_('bia');
  assert public.my_whatsapp() ->> 'code_expires_at' is null, 'código vencido não aparece como pendente';
end $$;
reset role;
set role service_role;
select pg_temp.as_service();
do $$ begin
  assert pg_temp.link('wa-m-010', '5521900000003', 'BBBBCCCC') = '{"result": "codigo_invalido"}', 'código vencido';
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 4. Tentativas (W3): cinco códigos errados em uma hora travam o número, mesmo com o código certo; outro número segue livre.
-- ---------------------------------------------------------------------------
select pg_temp.fix_code('bia', 'BBBBDDDD', 'bia_ctx', now() + interval '10 minutes');
set role service_role;
select pg_temp.as_service();
do $$
declare
  i integer;
begin
  -- wa-m-010 já foi um erro deste número; mais quatro.
  for i in 1..4 loop
    assert pg_temp.link('wa-m-02' || i, '5521900000003', 'ZZZZ333' || i) = '{"result": "codigo_invalido"}', 'erro ' || i;
  end loop;
  assert pg_temp.link('wa-m-030', '5521900000003', 'BBBBDDDD') = '{"result": "muitas_tentativas"}', 'travado por uma hora';
  assert pg_temp.outcome('wa-m-030') = 'muitas_tentativas', 'a tentativa travada fica registrada';
end $$;
reset role;
-- Passada a hora, o número volta (as tentativas antigas não contam).
update public.whatsapp_messages set received_at = received_at - interval '61 minutes' where phone_hash = pg_temp.ph('5521900000003');
set role service_role;
select pg_temp.as_service();
do $$ begin
  assert pg_temp.link('wa-m-031', '5521900000003', 'BBBB-DDDD') ->> 'result' = 'ligado', 'depois de uma hora, o código certo liga';
end $$;
reset role;
do $$ begin
  assert pg_temp.linked('bia') = pg_temp.ph('5521900000003') || '@' || pg_temp.id('bia_ctx'), 'a Bia ligada';
end $$;

-- ---------------------------------------------------------------------------
-- 5. Anotar (W4): pela create_record, em nome da pessoa, na conta principal do espaço ligado.
-- ---------------------------------------------------------------------------
set role service_role;
select pg_temp.as_service();
do $$
declare
  r jsonb;
begin
  assert pg_temp.add('wa-m-100', '5521900000099', 'despesa', 5230, '2026-10-30', 'Mercado', 'Mercado') = '{"result": "nao_ligado"}',
    'número sem vínculo não anota';
  r := pg_temp.add('wa-m-101', '5521900000001', 'despesa', 5230, '2026-10-30', 'Mercado', 'Mercado');
  assert r = jsonb_build_object('result', 'anotado', 'space', jsonb_build_object('kind', 'pessoal', 'name', 'Pessoal'),
                                'record', jsonb_build_object('kind', 'despesa', 'amount_cents', 5230, 'occurred_on', '2026-10-30',
                                                             'description', 'Mercado', 'category', 'Mercado', 'account_name', 'Conta principal'),
                                'today', '2026-10-30'),
    'anotado, com o registro, a conta de origem e o dia da pessoa: ' || r::text;
  assert current_setting('request.jwt.claims', true) = '{"role":"service_role"}' and current_setting('request.jwt.claim.sub', true) = '',
    'a sessão emprestada é devolvida';
  assert pg_temp.add('wa-m-101', '5521900000001', 'despesa', 5230, '2026-10-30', 'Mercado', 'Mercado') = '{"result": "repetida"}',
    'a mesma entrega não anota duas vezes';
  r := pg_temp.add('wa-m-102', '5521900000001', 'receita', 300000, '2026-10-29', 'Salário', 'Salário');
  assert r ->> 'result' = 'anotado' and r #>> '{record,kind}' = 'receita' and r #>> '{record,occurred_on}' = '2026-10-29', 'recebimento de ontem';
  r := pg_temp.add('wa-m-103', '5521900000001', 'despesa', 1000, '2026-10-30', 'Pão', null);
  assert r ->> 'result' = 'anotado' and r -> 'record' -> 'category' = 'null'::jsonb, 'sem categoria';
  -- Casos que viram resposta, sem anotar.
  assert pg_temp.add('wa-m-104', '5521900000001', 'despesa', 1000, '2026-10-31', 'Pão') ->> 'result' = 'data_futura', 'data futura';
  assert pg_temp.add('wa-m-105', '5521900000001', 'despesa', 0, '2026-10-30', 'Pão') ->> 'result' = 'valor_invalido', 'valor zero';
  assert pg_temp.add('wa-m-106', '5521900000001', 'despesa', 1000000000, '2026-10-30', 'Pão') ->> 'result' = 'valor_acima_do_limite', 'acima do limite';
  assert pg_temp.add('wa-m-107', '5521900000001', 'despesa', 1000, '2026-10-30', repeat('x', 81)) ->> 'result' = 'descricao_invalida', 'descrição longa';
  assert pg_temp.add('wa-m-108', '5521900000001', 'despesa', 1000, '2026-10-30', '   ') ->> 'result' = 'descricao_invalida', 'sem descrição';
  assert pg_temp.add('wa-m-108', '5521900000001', 'despesa', 1000, '2026-10-30', 'Pão') ->> 'result' = 'repetida', 'recusa também vale como tratada';
  assert current_setting('request.jwt.claims', true) = '{"role":"service_role"}' and current_setting('request.jwt.claim.sub', true) = '',
    'a sessão volta também depois das recusas';
end $$;
select pg_temp.expect_code($q$select pg_temp.add('', '5521900000001', 'despesa', 100, '2026-10-30', 'x')$q$, 'mensagem_invalida', '22023');
select pg_temp.expect_code($q$select public.whatsapp_add_record('wa-m-109', pg_temp.ph('5521900000001'), now(), 'despesa', 100, 0, '2026-10-30', 'x')$q$,
                           'mensagem_invalida', '22023');
select pg_temp.expect_code($q$select public.whatsapp_add_record('wa-m-109', pg_temp.ph('5521900000001'), now(), 'despesa', 100, null, null, 'x')$q$,
                           'mensagem_invalida', '22023');
select pg_temp.expect_code($q$select public.whatsapp_add_record('wa-m-109', pg_temp.ph('5521900000001'), null, 'despesa', 100, 0, null, 'x')$q$,
                           'mensagem_invalida', '22023');
reset role;
do $$
declare
  rec public.financial_records%rowtype;
  o public.record_operations%rowtype;
begin
  select * into rec from public.financial_records where description = 'Mercado' and deleted_at is null;
  assert rec.created_by = pg_temp.id('ana') and rec.context_id = pg_temp.id('ana_ctx') and rec.amount_cents = 5230
     and rec.account_id = (select id from public.financial_accounts where context_id = pg_temp.id('ana_ctx') and is_default), 'autoria da Ana, conta principal';
  select * into o from public.record_operations where record_id = rec.id;
  assert o.action = 'criar' and o.actor_id = pg_temp.id('ana') and o.idempotency_key = 'whatsapp:' || md5('wa-m-101'), 'operação criar, chave da mensagem';
  assert pg_temp.lastwrite('ana', 'ana_ctx') = '2026-10-30', 'anotar pelo WhatsApp conta como anotação';
  assert pg_temp.nrecords() = 3, 'três registros, nenhum das recusas nem da repetição';
  assert pg_temp.outcome('wa-m-100') = 'nao_ligado' and pg_temp.outcome('wa-m-104') = 'data_futura' and pg_temp.outcome('wa-m-105') = 'valor_invalido'
     and pg_temp.outcome('wa-m-106') = 'valor_acima_do_limite' and pg_temp.outcome('wa-m-107') = 'descricao_invalida', 'as recusas ficam registradas';
  assert (select record_id from public.whatsapp_messages where message_id = 'wa-m-101') = rec.id, 'a mensagem aponta o registro';
end $$;

-- Sem conta de origem principal: sem_conta. Só o teste tira a principal (direto na tabela) e devolve depois.
update public.financial_accounts set is_default = false where context_id = pg_temp.id('bia_ctx');
set role service_role;
select pg_temp.as_service();
do $$ begin
  assert pg_temp.add('wa-m-110', '5521900000003', 'despesa', 100, '2026-10-30', 'Café')
       = '{"result": "sem_conta", "space": {"kind": "pessoal", "name": "Pessoal"}, "today": "2026-10-30"}', 'sem conta principal';
  assert pg_temp.outcome('wa-m-110') = 'sem_conta', 'registrada';
end $$;
reset role;
update public.financial_accounts set is_default = true where context_id = pg_temp.id('bia_ctx');

-- ---------------------------------------------------------------------------
-- 6. Família: o membro liga a Família e anota nela; quem sai não anota mais.
-- ---------------------------------------------------------------------------
set role authenticated;
do $$
declare
  r jsonb;
begin
  perform pg_temp.as_('eli');
  r := public.create_whatsapp_code(pg_temp.id('fam'), 'wa-eli-code-0001');
  insert into codes values ('eli1', r ->> 'code');
end $$;
reset role;
set role service_role;
select pg_temp.as_service();
do $$
declare
  r jsonb;
begin
  r := pg_temp.link('wa-m-200', '5521900000004', 'ativar' || pg_temp.code('eli1'));
  assert r ->> 'result' = 'codigo_invalido', 'a palavra "ativar" é tirada pelo servidor, não pelo banco';
  r := pg_temp.link('wa-m-201', '5521900000004', pg_temp.code('eli1'));
  assert r = '{"result": "ligado", "space": {"kind": "familia", "name": "Família da Ana"}}', 'ligado na Família: ' || r::text;
  r := pg_temp.add('wa-m-202', '5521900000004', 'despesa', 4500, '2026-10-30', 'Farmácia', 'Saúde');
  assert r ->> 'result' = 'anotado' and r #>> '{space,name}' = 'Família da Ana', 'anotado na Família';
end $$;
reset role;
do $$ begin
  assert (select created_by from public.financial_records where description = 'Farmácia') = pg_temp.id('eli')
     and (select context_id from public.financial_records where description = 'Farmácia') = pg_temp.id('fam'), 'na Família, com a autoria do Eli';
end $$;
set role authenticated;
select pg_temp.as_('ana');
select public.remove_family_member(pg_temp.id('fam'), pg_temp.id('eli'), 'wa-rem-0001');
reset role;
set role service_role;
select pg_temp.as_service();
do $$
declare
  n bigint := pg_temp.nrecords();
  r jsonb;
begin
  r := pg_temp.add('wa-m-203', '5521900000004', 'despesa', 100, '2026-10-30', 'Café');
  assert r = '{"result": "sem_permissao", "space": {"kind": "familia", "name": "Família da Ana"}, "today": "2026-10-30"}', 'quem saiu não anota: ' || r::text;
  assert pg_temp.nrecords() = n, 'nada anotado';
  -- O desfazer também respeita a permissão de hoje: a anotação da Família que a pessoa deixou não entra (nem trava as outras).
  r := pg_temp.undo('wa-m-204', '5521900000004');
  assert r = '{"result": "nada_para_desfazer"}', 'quem saiu não desfaz a anotação da Família: ' || r::text;
end $$;
reset role;

-- O código gerado para a Família antes de sair também não liga.
set role authenticated;
do $$
declare
  r jsonb;
begin
  perform pg_temp.as_('eli');
  -- Volta à Família por convite novo, gera o código e sai de novo antes de mandar.
  perform pg_temp.as_('ana');
  r := public.create_family_invite(pg_temp.id('fam'), 'membro', 'wa-inv-0002');
  perform pg_temp.as_('eli');
  perform public.accept_family_invite(r ->> 'code', 'wa-acc-0002');
  r := public.create_whatsapp_code(pg_temp.id('fam'), 'wa-eli-code-0002');
  update codes set code = r ->> 'code' where name = 'eli1';
  perform public.leave_family(pg_temp.id('fam'), 'wa-leave-0001');
end $$;
reset role;
set role service_role;
select pg_temp.as_service();
do $$ begin
  assert pg_temp.link('wa-m-205', '5521900000005', pg_temp.code('eli1')) = '{"result": "sem_permissao", "space": {"kind": "familia", "name": "Família da Ana"}}',
    'código de um espaço em que a pessoa não anota mais';
end $$;
reset role;
do $$ begin
  assert pg_temp.code_of('eli') is null, 'o código recusado sai';
end $$;

-- ---------------------------------------------------------------------------
-- 7. Desfazer: só a última anotação pelo WhatsApp, nas últimas 24 horas, pela delete_record.
-- ---------------------------------------------------------------------------
-- A ordem das mensagens é a do recebimento: Pão (103) depois de Salário (102) depois de Mercado (101).
update public.whatsapp_messages set received_at = now() - interval '3 minutes' where message_id = 'wa-m-101';
update public.whatsapp_messages set received_at = now() - interval '2 minutes' where message_id = 'wa-m-102';
update public.whatsapp_messages set received_at = now() - interval '1 minute' where message_id = 'wa-m-103';
set role service_role;
select pg_temp.as_service();
do $$
declare
  r jsonb;
begin
  r := pg_temp.undo('wa-m-300', '5521900000001');
  assert r ->> 'result' = 'desfeito' and r #>> '{record,description}' = 'Pão' and r #>> '{space,kind}' = 'pessoal', 'desfaz a última: ' || r::text;
  assert current_setting('request.jwt.claims', true) = '{"role":"service_role"}' and current_setting('request.jwt.claim.sub', true) = '',
    'a sessão emprestada é devolvida';
  assert pg_temp.undo('wa-m-300', '5521900000001') = '{"result": "repetida"}', 'repetição';
  r := pg_temp.undo('wa-m-301', '5521900000001');
  assert r ->> 'result' = 'desfeito' and r #>> '{record,description}' = 'Salário', 'depois, a anterior';
end $$;
reset role;
-- Mercado foi há mais de 24 horas: não se desfaz pelo WhatsApp.
update public.whatsapp_messages set received_at = now() - interval '25 hours' where message_id = 'wa-m-101';
set role service_role;
select pg_temp.as_service();
do $$ begin
  assert pg_temp.undo('wa-m-302', '5521900000001') = '{"result": "nada_para_desfazer"}', 'nada nas últimas 24 horas';
  assert pg_temp.undo('wa-m-303', '5521900000099') = '{"result": "nao_ligado"}', 'número sem vínculo';
end $$;
reset role;
do $$
declare
  rec public.financial_records%rowtype;
begin
  select * into rec from public.financial_records where description = 'Pão' and amount_cents = 1000;
  assert rec.deleted_at is not null and rec.deleted_by = pg_temp.id('ana'), 'exclusão lógica, com a autoria da Ana';
  assert exists (select 1 from public.record_operations where action = 'excluir' and record_id = rec.id and actor_id = pg_temp.id('ana')
                    and idempotency_key = 'whatsapp:' || md5('wa-m-300')), 'operação excluir, chave da mensagem';
  assert (select undone_at from public.whatsapp_messages where message_id = 'wa-m-103') is not null, 'a anotação fica marcada como desfeita';
  assert (select deleted_at from public.financial_records where description = 'Mercado') is null, 'Mercado continua';
end $$;

-- ---------------------------------------------------------------------------
-- 8. Um número por pessoa e uma pessoa por número (W2).
-- ---------------------------------------------------------------------------
-- A Bia liga o número que era da Ana: a Ana fica sem vínculo. Depois a Ana liga outro número.
set role authenticated;
do $$
declare
  r jsonb;
begin
  perform pg_temp.as_('bia');
  r := public.create_whatsapp_code(pg_temp.id('bia_ctx'), 'wa-bia-code-0002');
  insert into codes values ('bia2', r ->> 'code');
  perform pg_temp.as_('ana');
  r := public.create_whatsapp_code(pg_temp.id('fam'), 'wa-ana-code-0005');
  insert into codes values ('ana3', r ->> 'code');
end $$;
reset role;
set role service_role;
select pg_temp.as_service();
do $$ begin
  assert pg_temp.link('wa-m-400', '5521900000001', pg_temp.code('bia2')) ->> 'result' = 'ligado', 'a Bia liga o número da Ana';
end $$;
reset role;
do $$ begin
  assert pg_temp.linked('ana') = '-', 'a Ana perde o número';
  assert pg_temp.linked('bia') = pg_temp.ph('5521900000001') || '@' || pg_temp.id('bia_ctx'), 'a Bia troca de número';
  assert (select count(*) from public.whatsapp_links where phone_hash = pg_temp.ph('5521900000003')) = 0, 'o número antigo da Bia sai';
end $$;
set role service_role;
select pg_temp.as_service();
do $$ begin
  assert pg_temp.link('wa-m-401', '5521900000006', pg_temp.code('ana3')) ->> 'result' = 'ligado', 'a Ana liga outro número, na Família';
  assert pg_temp.add('wa-m-402', '5521900000006', 'despesa', 2000, '2026-10-30', 'Feira') #>> '{space,name}' = 'Família da Ana', 'anota na Família';
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 9. Limite de mensagens (W5): 30 em 10 minutos pelo mesmo número.
-- ---------------------------------------------------------------------------
insert into public.whatsapp_messages (message_id, phone_hash, person_id, outcome)
select 'wa-lote-' || g, pg_temp.ph('5521900000006'), pg_temp.id('ana'), 'nao_ligado' from generate_series(1, 29) g;
set role service_role;
select pg_temp.as_service();
do $$ begin
  assert pg_temp.add('wa-m-500', '5521900000006', 'despesa', 100, '2026-10-30', 'Café') = '{"result": "muitas_mensagens"}', 'trinta em dez minutos';
  assert pg_temp.add('wa-m-500b', '5521900000006', 'despesa', 100, '2026-10-30', 'Café') = '{"result": "silencio"}', 'depois, sem resposta';
  assert pg_temp.note('wa-m-500c', '5521900000006', 'ajuda') = '{"result": "silencio"}', 'vale também para a ajuda';
  assert pg_temp.link('wa-m-500d', '5521900000006', 'ZZZZ2222') = '{"result": "silencio"}', 'e para o código';
end $$;
reset role;
update public.whatsapp_messages set received_at = now() - interval '11 minutes' where phone_hash = pg_temp.ph('5521900000006');
set role service_role;
select pg_temp.as_service();
do $$ begin
  assert pg_temp.add('wa-m-501', '5521900000006', 'despesa', 100, '2026-10-30', 'Café') ->> 'result' = 'anotado', 'depois de dez minutos, volta';
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 10. As mensagens ficam 30 dias.
-- ---------------------------------------------------------------------------
update public.whatsapp_messages set received_at = now() - interval '31 days' where message_id like 'wa-lote-%';
set role service_role;
select pg_temp.as_service();
select pg_temp.add('wa-m-600', '5521900000099', 'despesa', 100, '2026-10-30', 'Café');
reset role;
do $$ begin
  assert not exists (select 1 from public.whatsapp_messages where message_id like 'wa-lote-%'), 'mais de 30 dias: apagadas';
  assert pg_temp.outcome('wa-m-501') = 'anotado', 'as recentes ficam';
end $$;

-- ---------------------------------------------------------------------------
-- 11. Desligar: pelo WhatsApp e pelo app.
-- ---------------------------------------------------------------------------
set role service_role;
select pg_temp.as_service();
do $$ begin
  assert pg_temp.unlink('wa-m-700', '5521900000001') = '{"result": "desligado"}', 'a Bia desliga pelo WhatsApp';
  assert pg_temp.unlink('wa-m-700', '5521900000001') = '{"result": "repetida"}', 'repetição';
  assert pg_temp.unlink('wa-m-701', '5521900000001') = '{"result": "nao_ligado"}', 'já desligado';
  assert pg_temp.add('wa-m-702', '5521900000001', 'despesa', 100, '2026-10-30', 'Café') = '{"result": "nao_ligado"}', 'não anota mais';
end $$;
reset role;
do $$ begin
  assert pg_temp.linked('bia') = '-', 'sem vínculo';
  assert exists (select 1 from public.record_operations where action = 'desligar_whatsapp' and actor_id = pg_temp.id('bia')
                    and idempotency_key = 'whatsapp:' || md5('wa-m-700') and target_id is null), 'operação de desligar';
  assert pg_temp.lastwrite('bia', 'bia_ctx') = '-', 'desligar não conta como anotação (W7)';
end $$;
set role authenticated;
do $$
declare
  s jsonb;
begin
  perform pg_temp.as_('ana');
  perform public.create_whatsapp_code(pg_temp.id('ana_ctx'), 'wa-ana-code-0006');
  s := public.unlink_whatsapp('wa-ana-unlink-0001');
  assert s = jsonb_build_object('linked', false, 'context_id', null, 'linked_at', null, 'code_context_id', null, 'code_expires_at', null),
    'desligar pelo app apaga o vínculo e o código pendente: ' || s::text;
  assert public.unlink_whatsapp('wa-ana-unlink-0001') = s, 'repetição devolve o estado';
end $$;
select pg_temp.expect_code('select public.unlink_whatsapp(''wa-ana-code-0006'')', 'chave_reutilizada', 'PT409');
reset role;
do $$ begin
  assert pg_temp.linked('ana') = '-' and pg_temp.code_of('ana') is null, 'a Ana sem vínculo e sem código';
  assert (select context_id from public.record_operations where idempotency_key = 'wa-ana-unlink-0001') = pg_temp.id('ana_ctx'),
    'a operação fica no Pessoal';
end $$;
set role service_role;
select pg_temp.as_service();
do $$ begin
  assert pg_temp.add('wa-m-703', '5521900000006', 'despesa', 100, '2026-10-30', 'Café') = '{"result": "nao_ligado"}', 'desligado pelo app';
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 12. Exclusão da conta (W8): o vínculo, o código e as mensagens da pessoa saem, mesmo quando ela continua como "Pessoa que saiu".
-- ---------------------------------------------------------------------------
-- O Eli volta à Família, liga o número e exclui a conta (o que ele anotou na Família continua, com autoria anônima).
set role authenticated;
do $$
declare
  r jsonb;
begin
  perform pg_temp.as_('ana');
  r := public.create_family_invite(pg_temp.id('fam'), 'membro', 'wa-inv-0003');
  perform pg_temp.as_('eli');
  perform public.accept_family_invite(r ->> 'code', 'wa-acc-0003');
  r := public.create_whatsapp_code(pg_temp.id('fam'), 'wa-eli-code-0003');
  update codes set code = r ->> 'code' where name = 'eli1';
end $$;
reset role;
set role service_role;
select pg_temp.as_service();
do $$ begin
  assert pg_temp.link('wa-m-800', '5521900000007', pg_temp.code('eli1')) ->> 'result' = 'ligado', 'o Eli liga';
  assert pg_temp.add('wa-m-801', '5521900000007', 'despesa', 700, '2026-10-30', 'Padaria') ->> 'result' = 'anotado', 'e anota na Família';
end $$;
reset role;
set role authenticated;
do $$ begin
  perform pg_temp.as_('eli');
  perform public.create_whatsapp_code(pg_temp.id('eli_ctx'), 'wa-eli-code-0004');
  perform public.delete_my_account('EXCLUIR', 'wa-del-eli-0001');
end $$;
reset role;
do $$ begin
  assert pg_temp.linked('eli') = '-' and pg_temp.code_of('eli') is null, 'vínculo e código do Eli saem';
  assert not exists (select 1 from public.whatsapp_messages where person_id = pg_temp.id('eli')), 'as mensagens do Eli saem';
  assert exists (select 1 from public.persons where id = pg_temp.id('eli') and deleted_at is not null), 'o Eli continua como "Pessoa que saiu"';
  assert exists (select 1 from public.financial_records where description = 'Padaria' and deleted_at is null), 'o que ele anotou na Família continua';
end $$;
set role service_role;
select pg_temp.as_service();
do $$ begin
  assert pg_temp.add('wa-m-802', '5521900000007', 'despesa', 100, '2026-10-30', 'Café') = '{"result": "nao_ligado"}', 'conta excluída não anota';
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 13. Mensagens respondidas sem ir aos dados (whatsapp_note): ficam registradas para a repetição e para o limite, sem pessoa.
-- ---------------------------------------------------------------------------
set role service_role;
select pg_temp.as_service();
do $$ begin
  assert pg_temp.note('wa-m-900', '5521900000020', 'ajuda') = '{"result": "registrada"}', 'ajuda registrada';
  assert pg_temp.note('wa-m-900', '5521900000020', 'ajuda') = '{"result": "repetida"}', 'a repetição não responde de novo';
  assert pg_temp.note('wa-m-901', '5521900000020', 'midia') = '{"result": "registrada"}', 'mídia';
  assert pg_temp.note('wa-m-902', '5521900000020', 'nao_entendi') = '{"result": "registrada"}', 'não entendi';
end $$;
select pg_temp.expect_code($q$select pg_temp.note('wa-m-903', '5521900000020', 'outro')$q$, 'resultado_invalido', '22023');
reset role;
do $$ begin
  assert pg_temp.outcome('wa-m-900') = 'ajuda' and pg_temp.outcome('wa-m-901') = 'midia' and pg_temp.outcome('wa-m-902') = 'nao_entendi', 'registradas';
  assert (select count(*) from public.whatsapp_messages where message_id like 'wa-m-90%' and person_id is not null) = 0, 'sem pessoa';
end $$;

-- ---------------------------------------------------------------------------
-- 14. O dia da mensagem no fuso da pessoa (o mesmo que o banco usa para recusar data futura).
-- ---------------------------------------------------------------------------
do $$
declare
  v_at timestamptz := '2026-10-31 03:30:00+00';  -- 00h30 de 31/10 em Brasília; 22h30 de 30/10 no Acre
begin
  perform set_config('clarevo.today', '', true);
  update public.persons set time_zone = 'America/Rio_Branco' where id = pg_temp.id('bia');
  assert public.clarevo_whatsapp_day(pg_temp.id('bia'), v_at) = '2026-10-30', 'no Acre ainda é 30/10';
  update public.persons set time_zone = 'America/Sao_Paulo' where id = pg_temp.id('bia');
  assert public.clarevo_whatsapp_day(pg_temp.id('bia'), v_at) = '2026-10-31', 'em Brasília já é 31/10';
  update public.persons set time_zone = 'Fuso/Inexistente' where id = pg_temp.id('bia');
  assert public.clarevo_whatsapp_day(pg_temp.id('bia'), v_at) = '2026-10-31', 'fuso inválido: Brasília';
  perform set_config('clarevo.today', '2026-10-30', true);
  assert public.clarevo_whatsapp_day(pg_temp.id('bia'), v_at) = '2026-10-30', 'o gancho de teste vale';
  update public.persons set time_zone = 'America/Sao_Paulo' where id = pg_temp.id('bia');
end $$;
-- "ontem" pelo dia da pessoa: a Bia liga um número e anota com p_days_ago = 1.
set role authenticated;
do $$
declare
  r jsonb;
begin
  perform pg_temp.as_('bia');
  r := public.create_whatsapp_code(pg_temp.id('bia_ctx'), 'wa-bia-code-0009');
  insert into codes values ('bia9', r ->> 'code');
end $$;
reset role;
set role service_role;
select pg_temp.as_service();
do $$
declare
  r jsonb;
begin
  assert pg_temp.link('wa-m-910', '5521900000021', pg_temp.code('bia9')) ->> 'result' = 'ligado', 'liga';
  r := pg_temp.addrel('wa-m-911', '5521900000021', 1, 'Pão de ontem');
  assert r #>> '{record,occurred_on}' = '2026-10-29' and r ->> 'today' = '2026-10-30', 'ontem é 29/10: ' || r::text;
  r := pg_temp.addrel('wa-m-912', '5521900000021', 0, 'Pão de hoje');
  assert r #>> '{record,occurred_on}' = '2026-10-30', 'hoje é 30/10';
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 15. A exclusão da conta toma a trava do WhatsApp da pessoa antes de travar a linha dela (W8), e as funções do servidor releem o vínculo
-- com a mesma trava.
-- ---------------------------------------------------------------------------
do $$
declare
  d text := pg_get_functiondef('public.clarevo_erase_person(uuid)'::regprocedure);
begin
  assert position('whatsapp:p:' in d) > 0
     and position('whatsapp:p:' in d) < position('from public.persons p where p.id = p_person and p.deleted_at is null for update' in d),
    'clarevo_erase_person: trava do WhatsApp antes da linha da pessoa';
  assert position('clarevo_whatsapp_link_locked' in pg_get_functiondef('public.whatsapp_add_record(text, text, timestamptz, public.record_kind, bigint, integer, date, text, text)'::regprocedure)) > 0
     and position('clarevo_whatsapp_link_locked' in pg_get_functiondef('public.whatsapp_undo(text, text, timestamptz)'::regprocedure)) > 0
     and position('clarevo_whatsapp_link_locked' in pg_get_functiondef('public.whatsapp_unlink(text, text)'::regprocedure)) > 0,
    'anotar, desfazer e desligar releem o vínculo com a trava da pessoa';
  assert position('whatsapp:p:' in pg_get_functiondef('public.clarevo_whatsapp_link_locked(text)'::regprocedure)) > 0, 'a trava da pessoa';
end $$;

rollback;
