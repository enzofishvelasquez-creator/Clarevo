-- Anotar pelo Telegram (D-080; migração 0022): o segundo canal de mensagens, nas mesmas tabelas do WhatsApp (chat_links, chat_link_codes,
-- chat_messages, com o canal em cada linha) e pelas mesmas regras (as funções internas clarevo_chat_*). As regras comuns aos dois canais
-- (código, vínculo, anotar, desfazer, limites, Família, 30 dias) estão em 99x_whatsapp.sql; aqui, o que é do Telegram e o que separa os
-- canais: os privilégios das funções novas, o código que só vale no canal em que foi gerado, os dois canais ligados ao mesmo tempo, o
-- identificador das mensagens do Telegram, DESFAZER e DESLIGAR só no próprio canal, as operações (sem contar como anotação) e a exclusão
-- da conta. Do Telegram, as funções recebem só o resumo do identificador da pessoa, nunca o identificador, o nome nem o texto.
-- Pessoas FICTÍCIAS: Ana (Pessoal) e Bia (Pessoal). Tudo em uma transação desfeita no fim.
\set ON_ERROR_STOP 1
\set ana '''00000000-0000-0000-0000-0000000000f7'''
\set bia '''00000000-0000-0000-0000-0000000000f8'''

begin;
set local clarevo.today = '2026-11-01';

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
-- Resumos de quem escreve (o servidor usa HMAC com a chave de cada canal; aqui basta um resumo diferente por pessoa e canal).
create function pg_temp.th(p_user text) returns text language sql as $$ select encode(sha256(convert_to('telegram:' || p_user, 'UTF8')), 'hex') $$;
create function pg_temp.ph(p_number text) returns text language sql as $$ select encode(sha256(convert_to(p_number, 'UTF8')), 'hex') $$;
-- Identificador de uma mensagem do Telegram, como o servidor manda: 'telegram:' e um resumo de 64 hexadecimais (nunca a conversa, que é
-- a conta de quem escreve).
create function pg_temp.tm(p_user text, p_n int) returns text language sql as $$
  select 'telegram:' || encode(sha256(convert_to(p_user || ':' || p_n, 'UTF8')), 'hex')
$$;
create temp table codes (name text primary key, code text);
grant select, insert, update on codes to authenticated, service_role;
create function pg_temp.code(p_name text) returns text language sql as $$ select code from codes where name = p_name $$;
-- Leituras direto nas tabelas (sem a RLS).
create function pg_temp.links(p_name text) returns text language sql security definer set search_path = public, pg_temp as $$
  select coalesce(string_agg(l.channel, ',' order by l.channel), '-') from public.chat_links l where l.person_id = pg_temp.id(p_name)
$$;
create function pg_temp.code_channels(p_name text) returns text language sql security definer set search_path = public, pg_temp as $$
  select coalesce(string_agg(c.channel, ',' order by c.channel), '-') from public.chat_link_codes c where c.person_id = pg_temp.id(p_name)
$$;
create function pg_temp.nops(p_action text, p_name text) returns bigint language sql security definer set search_path = public, pg_temp as $$
  select count(*) from public.record_operations where action = p_action and actor_id = pg_temp.id(p_name)
$$;
create function pg_temp.lastwrite(p_name text, p_ctx text) returns text language sql security definer set search_path = public, pg_temp as $$
  select coalesce((select to_char(last_write_on, 'YYYY-MM-DD') from public.context_activity
                    where person_id = pg_temp.id(p_name) and context_id = pg_temp.id(p_ctx)), '-')
$$;
create function pg_temp.alive(p_desc text) returns bigint language sql security definer set search_path = public, pg_temp as $$
  select count(*) from public.financial_records where description = p_desc and deleted_at is null
$$;

insert into ids values ('ana', :ana), ('bia', :bia);
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  (:ana, 'ana.telegram@exemplo.test', now(), '{"display_name":"Ana"}'),
  (:bia, 'bia.telegram@exemplo.test', now(), '{"display_name":"Bia"}');

set role authenticated;
do $$
declare
  p text;
  space jsonb;
begin
  foreach p in array array['ana', 'bia'] loop
    perform pg_temp.as_(p);
    space := public.ensure_personal_space('Conta principal');
    insert into ids values (p || '_ctx', (space ->> 'context_id')::uuid);
  end loop;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 1. Privilégios (T5): o app executa só as três do Telegram para ele; a chave de serviço, só as cinco do servidor; anon nada.
-- ---------------------------------------------------------------------------
do $$
declare
  f text;
begin
  foreach f in array array['my_telegram()', 'create_telegram_code(uuid, text)', 'unlink_telegram(text)'] loop
    assert has_function_privilege('authenticated', 'public.' || f, 'execute'), 'authenticated executa ' || f;
    assert not has_function_privilege('anon', 'public.' || f, 'execute'), 'anon não executa ' || f;
    assert (select prosecdef from pg_proc where oid = ('public.' || f)::regprocedure), 'security definer: ' || f;
  end loop;
  foreach f in array array['telegram_note(text, text, text)', 'telegram_link(text, text, text)',
                           'telegram_add_record(text, text, timestamptz, public.record_kind, bigint, integer, date, text, text)',
                           'telegram_undo(text, text, timestamptz)', 'telegram_unlink(text, text)'] loop
    assert has_function_privilege('service_role', 'public.' || f, 'execute'), 'service_role executa ' || f;
    assert not has_function_privilege('authenticated', 'public.' || f, 'execute') and not has_function_privilege('anon', 'public.' || f, 'execute'),
      'só o servidor executa ' || f;
    assert not exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                        where p.oid = ('public.' || f)::regprocedure and a.grantee = 0), 'sem execute para public: ' || f;
    assert (select prosecdef from pg_proc where oid = ('public.' || f)::regprocedure), 'security definer: ' || f;
  end loop;
  -- O canal em cada linha, só os dois que existem, e o identificador do Telegram sempre com o prefixo.
  foreach f in array array['chat_links', 'chat_link_codes', 'chat_messages'] loop
    assert exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = f and column_name = 'channel' and is_nullable = 'NO' and column_default is null),
      'canal obrigatório e sem padrão em ' || f;
  end loop;
  assert (select array_agg(a.attname::text order by a.attnum) from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
           where c.conname = 'chat_links_pkey') = array['person_id', 'channel'], 'um vínculo por pessoa e canal';
  assert (select array_agg(a.attname::text order by a.attnum) from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
           where c.conname = 'chat_link_codes_pkey') = array['person_id', 'channel'], 'um código por pessoa e canal';
  assert exists (select 1 from pg_constraint where conname = 'chat_links_sender_hash_key' and contype = 'u'), 'um vínculo por resumo';
  assert not exists (select 1 from pg_class where relname like 'whatsapp\_%' and relnamespace = 'public'::regnamespace),
    'as tabelas, restrições e índices da 0020 mudaram de nome';
end $$;

set role anon;
select pg_temp.expect_code('select public.my_telegram()', 'permission denied for function my_telegram', '42501');
reset role;
set role authenticated;
select pg_temp.as_('ana');
select pg_temp.expect_code($q$select public.telegram_link('telegram:1:1', repeat('a', 64), 'ABCDEFGH')$q$, 'permission denied for function telegram_link', '42501');
select pg_temp.expect_code($q$select public.clarevo_chat_create_code('telegram', null, 'tg-x-0001')$q$, 'permission denied for function clarevo_chat_create_code', '42501');
reset role;

-- ---------------------------------------------------------------------------
-- 2. O código é por canal (T3): o do WhatsApp e o do Telegram convivem, e gerar outro só troca o do mesmo canal.
-- ---------------------------------------------------------------------------
set role authenticated;
do $$
declare
  r jsonb;
  s jsonb;
begin
  perform pg_temp.as_('ana');
  s := public.my_telegram();
  assert s = jsonb_build_object('linked', false, 'context_id', null, 'linked_at', null, 'code_context_id', null, 'code_expires_at', null),
    'conta nova: nada ligado no Telegram: ' || s::text;
  r := public.create_whatsapp_code(pg_temp.id('ana_ctx'), 'tg-ana-wa-0001');
  insert into codes values ('ana_wa', r ->> 'code');
  r := public.create_telegram_code(pg_temp.id('ana_ctx'), 'tg-ana-tg-0001');
  assert r ->> 'code' ~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$' and (r ->> 'context_id')::uuid = pg_temp.id('ana_ctx'), 'código do Telegram: ' || r::text;
  insert into codes values ('ana_tg0', r ->> 'code');
  -- Repetição: o código não volta; outra ação com a mesma chave é recusada.
  r := public.create_telegram_code(pg_temp.id('ana_ctx'), 'tg-ana-tg-0001');
  assert r ->> 'code' is null and r ->> 'expires_at' is not null, 'repetir a chave devolve o código nulo e a validade do código do Telegram';
  r := public.create_telegram_code(pg_temp.id('ana_ctx'), 'tg-ana-tg-0002');
  insert into codes values ('ana_tg', r ->> 'code');
  s := public.my_telegram();
  assert (s ->> 'code_context_id')::uuid = pg_temp.id('ana_ctx') and (s ->> 'linked')::boolean = false, 'o estado do Telegram mostra o código';
  s := public.my_whatsapp();
  assert (s ->> 'code_context_id')::uuid = pg_temp.id('ana_ctx'), 'o código do WhatsApp continua';
end $$;
select pg_temp.expect_code(format('select public.create_whatsapp_code(%L, %L)', pg_temp.id('ana_ctx'), 'tg-ana-tg-0002'), 'chave_reutilizada', 'PT409');
select pg_temp.expect_code(format('select public.create_telegram_code(%L, %L)', pg_temp.id('bia_ctx'), 'tg-ana-tg-0003'), 'sem_permissao', '42501');
reset role;
do $$ begin
  assert pg_temp.code_channels('ana') = 'telegram,whatsapp', 'um código por canal: ' || pg_temp.code_channels('ana');
  assert pg_temp.nops('gerar_codigo_telegram', 'ana') = 2 and pg_temp.nops('gerar_codigo_whatsapp', 'ana') = 1, 'as operações de cada canal';
  assert pg_temp.lastwrite('ana', 'ana_ctx') = '-', 'gerar código do Telegram não conta como anotação (T6)';
end $$;

-- ---------------------------------------------------------------------------
-- 3. Ligar: o código só vale no canal dele; o identificador da mensagem diz o canal.
-- ---------------------------------------------------------------------------
set role service_role;
select pg_temp.as_service();
select pg_temp.expect_code(format('select public.telegram_note(%L, %L, %L)', '123:45', pg_temp.th('ana'), 'ajuda'), 'mensagem_invalida', '22023');
select pg_temp.expect_code(format('select public.whatsapp_note(%L, %L, %L)', 'telegram:1:2', pg_temp.ph('5521900000071'), 'ajuda'), 'mensagem_invalida', '22023');
select pg_temp.expect_code(format('select public.telegram_note(%L, %L, %L)', pg_temp.tm('x', 1), 'nao-e-resumo', 'ajuda'), 'mensagem_invalida', '22023');
-- O identificador do Telegram com a conversa à vista (telegram:<conta>:<mensagem>) é recusado: só o resumo entra (T1).
select pg_temp.expect_code(format('select public.telegram_note(%L, %L, %L)', 'telegram:700100200:5', pg_temp.th('ana'), 'ajuda'), 'mensagem_invalida', '22023');
do $$
declare
  r jsonb;
begin
  -- O código do Telegram mandado ao WhatsApp, e o do WhatsApp ao Telegram, não ligam (e não se gastam).
  assert public.whatsapp_link('tg-wa-m-001', pg_temp.ph('5521900000071'), pg_temp.code('ana_tg')) ->> 'result' = 'codigo_invalido',
    'código do Telegram no WhatsApp';
  assert public.telegram_link(pg_temp.tm('ana', 1), pg_temp.th('ana'), pg_temp.code('ana_wa')) ->> 'result' = 'codigo_invalido',
    'código do WhatsApp no Telegram';
  assert public.telegram_link(pg_temp.tm('ana', 2), pg_temp.th('ana'), pg_temp.code('ana_tg0')) ->> 'result' = 'codigo_invalido',
    'o código substituído não vale mais';
  r := public.telegram_link(pg_temp.tm('ana', 3), pg_temp.th('ana'), pg_temp.code('ana_tg'));
  assert r = jsonb_build_object('result', 'ligado', 'space', jsonb_build_object('kind', 'pessoal', 'name', 'Pessoal'), 'name', 'Ana'),
    'o Telegram liga, com o nome de quem gerou o código: ' || r::text;
  assert public.telegram_link(pg_temp.tm('ana', 3), pg_temp.th('ana'), pg_temp.code('ana_tg')) = '{"result": "repetida"}', 'a mesma entrega não liga de novo';
  -- O WhatsApp liga com o código dele, que continuou valendo.
  assert public.whatsapp_link('tg-wa-m-002', pg_temp.ph('5521900000071'), pg_temp.code('ana_wa')) ->> 'result' = 'ligado', 'o WhatsApp também liga';
end $$;
reset role;
do $$ begin
  assert pg_temp.links('ana') = 'telegram,whatsapp', 'os dois canais ligados ao mesmo tempo (T2): ' || pg_temp.links('ana');
  assert pg_temp.code_channels('ana') = '-', 'cada código saiu ao ligar o seu canal';
  assert pg_temp.nops('ligar_telegram', 'ana') = 1 and pg_temp.nops('ligar_whatsapp', 'ana') = 1, 'uma operação de ligar por canal';
  assert exists (select 1 from public.record_operations where action = 'ligar_telegram' and idempotency_key = 'telegram:' || md5(pg_temp.tm('ana', 3))),
    'a chave da operação do Telegram é telegram:<md5 do identificador>';
  assert (select array_agg(channel || ':' || outcome order by message_id) from public.chat_messages where person_id = pg_temp.id('ana') or sender_hash = pg_temp.th('ana'))
       @> array['telegram:codigo_invalido', 'telegram:ligado', 'whatsapp:ligado'], 'as mensagens ficam com o canal';
  assert pg_temp.lastwrite('ana', 'ana_ctx') = '-', 'ligar o Telegram não conta como anotação (T6)';
end $$;
-- Uma mensagem do Telegram não pode entrar como de outro canal, nem o contrário.
select pg_temp.expect_code(format($q$insert into public.chat_messages (channel, message_id, sender_hash, outcome) values ('whatsapp', %L, %L, 'ajuda')$q$,
                                  pg_temp.tm('x', 9), pg_temp.th('x')), 'new row for relation "chat_messages" violates check constraint "chat_messages_id_channel_check"', '23514');
select pg_temp.expect_code(format($q$insert into public.chat_messages (channel, message_id, sender_hash, outcome) values ('telegram', 'telegram:9:9', %L, 'ajuda')$q$,
                                  pg_temp.th('x')), 'new row for relation "chat_messages" violates check constraint "chat_messages_id_channel_check"', '23514');
select pg_temp.expect_code(format($q$insert into public.chat_messages (channel, message_id, sender_hash, outcome) values ('sms', 'x-1', %L, 'ajuda')$q$,
                                  pg_temp.th('x')), 'new row for relation "chat_messages" violates check constraint "chat_messages_channel_check"', '23514');
set role authenticated;
select pg_temp.as_('ana');
do $$
declare
  s jsonb;
begin
  s := public.my_telegram();
  assert (s ->> 'linked')::boolean and (s ->> 'context_id')::uuid = pg_temp.id('ana_ctx') and s ->> 'code_context_id' is null,
    'o app vê o Telegram ligado: ' || s::text;
  assert (public.my_whatsapp() ->> 'linked')::boolean, 'e o WhatsApp ligado';
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 4. Anotar pelos dois canais; DESFAZER desfaz só a última do próprio canal (T4).
-- ---------------------------------------------------------------------------
set role service_role;
select pg_temp.as_service();
do $$
declare
  r jsonb;
begin
  r := public.telegram_add_record(pg_temp.tm('ana', 10), pg_temp.th('ana'), now(), 'despesa', 5230, 0, null, 'Mercado pelo Telegram', 'Mercado');
  assert r ->> 'result' = 'anotado' and r #>> '{record,amount_cents}' = '5230' and r #>> '{record,occurred_on}' = '2026-11-01'
     and r #>> '{record,account_name}' = 'Conta principal' and r ->> 'today' = '2026-11-01', 'anota pelo Telegram: ' || r::text;
  r := public.telegram_add_record(pg_temp.tm('ana', 11), pg_temp.th('ana'), now(), 'receita', 150000, null, '2026-10-30', 'Salário pelo Telegram', 'Salário');
  assert r ->> 'result' = 'anotado' and r #>> '{record,occurred_on}' = '2026-10-30', 'recebimento com data escrita';
  r := public.whatsapp_add_record('tg-wa-m-010', pg_temp.ph('5521900000071'), now(), 'despesa', 990, 0, null, 'Café pelo WhatsApp', null);
  assert r ->> 'result' = 'anotado', 'anota pelo WhatsApp depois';
  -- DESFAZER no Telegram: sai a última do Telegram (o salário), não a do WhatsApp, que é mais nova.
  r := public.telegram_undo(pg_temp.tm('ana', 12), pg_temp.th('ana'), now());
  assert r ->> 'result' = 'desfeito' and r #>> '{record,description}' = 'Salário pelo Telegram', 'desfaz a última do Telegram: ' || r::text;
  r := public.telegram_undo(pg_temp.tm('ana', 13), pg_temp.th('ana'), now());
  assert r ->> 'result' = 'desfeito' and r #>> '{record,description}' = 'Mercado pelo Telegram', 'depois, a anterior do Telegram';
  assert public.telegram_undo(pg_temp.tm('ana', 14), pg_temp.th('ana'), now()) = '{"result": "nada_para_desfazer"}', 'nada mais do Telegram';
  -- Um resumo que não está ligado no Telegram não anota (o do WhatsApp da Ana não vale no Telegram).
  assert public.telegram_add_record(pg_temp.tm('outro', 1), pg_temp.ph('5521900000071'), now(), 'despesa', 100, 0, null, 'Teste', null)
       = '{"result": "nao_ligado"}', 'o resumo do WhatsApp não é um vínculo do Telegram';
end $$;
reset role;
do $$ begin
  assert pg_temp.alive('Café pelo WhatsApp') = 1 and pg_temp.alive('Mercado pelo Telegram') = 0 and pg_temp.alive('Salário pelo Telegram') = 0,
    'a anotação do WhatsApp continua; as do Telegram foram desfeitas';
  assert (select created_by from public.financial_records where description = 'Mercado pelo Telegram') = pg_temp.id('ana'), 'a autoria é da Ana';
  assert exists (select 1 from public.record_operations where action = 'criar' and actor_id = pg_temp.id('ana')
                  and idempotency_key = 'telegram:' || md5(pg_temp.tm('ana', 10))), 'anotar pelo Telegram passa pela create_record com a chave do canal';
  assert pg_temp.lastwrite('ana', 'ana_ctx') = '2026-11-01', 'anotar pelo Telegram conta como anotação, como no app';
end $$;

-- ---------------------------------------------------------------------------
-- 5. DESLIGAR e o desligar do app só mexem no próprio canal (T4).
-- ---------------------------------------------------------------------------
set role service_role;
select pg_temp.as_service();
do $$ begin
  assert public.telegram_unlink(pg_temp.tm('ana', 20), pg_temp.th('ana')) = '{"result": "desligado"}', 'DESLIGAR no Telegram';
  assert public.telegram_add_record(pg_temp.tm('ana', 21), pg_temp.th('ana'), now(), 'despesa', 100, 0, null, 'Depois de desligar', null)
       = '{"result": "nao_ligado"}', 'o Telegram desligado não anota';
  assert public.whatsapp_add_record('tg-wa-m-020', pg_temp.ph('5521900000071'), now(), 'despesa', 100, 0, null, 'WhatsApp segue', null) ->> 'result' = 'anotado',
    'o WhatsApp segue ligado';
end $$;
reset role;
do $$ begin
  assert pg_temp.links('ana') = 'whatsapp', 'só o WhatsApp ficou: ' || pg_temp.links('ana');
  assert pg_temp.nops('desligar_telegram', 'ana') = 1, 'a operação de desligar o Telegram';
end $$;

-- Liga de novo e desliga pelo app: o WhatsApp continua.
set role authenticated;
do $$
declare
  r jsonb;
begin
  perform pg_temp.as_('ana');
  r := public.create_telegram_code(pg_temp.id('ana_ctx'), 'tg-ana-tg-0010');
  insert into codes values ('ana_tg2', r ->> 'code');
end $$;
reset role;
set role service_role;
select pg_temp.as_service();
do $$ begin
  assert public.telegram_link(pg_temp.tm('ana', 30), pg_temp.th('ana'), pg_temp.code('ana_tg2')) ->> 'result' = 'ligado', 'liga de novo';
end $$;
reset role;
set role authenticated;
do $$
declare
  s jsonb;
begin
  perform pg_temp.as_('ana');
  s := public.unlink_telegram('tg-ana-unl-0001');
  assert s = jsonb_build_object('linked', false, 'context_id', null, 'linked_at', null, 'code_context_id', null, 'code_expires_at', null),
    'desligar pelo app devolve o estado do Telegram: ' || s::text;
  assert public.unlink_telegram('tg-ana-unl-0001') = s, 'repetir a chave devolve o estado atual';
  assert (public.my_whatsapp() ->> 'linked')::boolean, 'o WhatsApp continua ligado';
end $$;
select pg_temp.expect_code('select public.unlink_whatsapp(''tg-ana-unl-0001'')', 'chave_reutilizada', 'PT409');
reset role;
do $$ begin
  assert pg_temp.links('ana') = 'whatsapp', 'desligar o Telegram pelo app não mexe no WhatsApp';
  assert pg_temp.lastwrite('ana', 'ana_ctx') = '2026-11-01', 'desligar não conta como anotação';
end $$;

-- ---------------------------------------------------------------------------
-- 6. Quem escreve já ligado a outra pessoa não passa sozinho a quem mandou o código (T2, ja_ligado): o link do Telegram com o código de
-- outra pessoa não desvia as mensagens. Desligando antes, pela própria conversa, liga.
-- ---------------------------------------------------------------------------
set role authenticated;
do $$
declare
  r jsonb;
begin
  perform pg_temp.as_('ana');
  r := public.create_telegram_code(pg_temp.id('ana_ctx'), 'tg-ana-tg-0020');
  insert into codes values ('ana_tg3', r ->> 'code');
  perform pg_temp.as_('bia');
  r := public.create_telegram_code(pg_temp.id('bia_ctx'), 'tg-bia-tg-0001');
  insert into codes values ('bia_tg', r ->> 'code');
end $$;
reset role;
set role service_role;
select pg_temp.as_service();
do $$ begin
  assert public.telegram_link(pg_temp.tm('compartilhado', 1), pg_temp.th('compartilhado'), pg_temp.code('ana_tg3')) ->> 'result' = 'ligado', 'liga como Ana';
  assert public.telegram_link(pg_temp.tm('compartilhado', 2), pg_temp.th('compartilhado'), pg_temp.code('bia_tg')) = '{"result": "ja_ligado"}',
    'o código da Bia não tira a conta da Ana';
  assert public.telegram_link(pg_temp.tm('compartilhado', 2), pg_temp.th('compartilhado'), pg_temp.code('bia_tg')) = '{"result": "repetida"}',
    'a mesma entrega repetida';
  assert public.telegram_add_record(pg_temp.tm('compartilhado', 5), pg_temp.th('compartilhado'), now(), 'despesa', 100, 0, null, 'Segue na Ana', null)
       #>> '{record,description}' = 'Segue na Ana', 'e as mensagens seguem na Ana';
  assert public.telegram_unlink(pg_temp.tm('compartilhado', 6), pg_temp.th('compartilhado')) = '{"result": "desligado"}', 'quem escreve desliga';
  assert public.telegram_link(pg_temp.tm('compartilhado', 7), pg_temp.th('compartilhado'), pg_temp.code('bia_tg')) ->> 'result' = 'ligado',
    'e o código da Bia, que não se gastou, liga';
end $$;
reset role;
do $$ begin
  assert pg_temp.links('ana') = 'whatsapp' and pg_temp.links('bia') = 'telegram', 'a conta do Telegram passou à Bia; o WhatsApp da Ana fica';
  assert (select outcome from public.chat_messages where message_id = pg_temp.tm('compartilhado', 2)) = 'ja_ligado'
     and (select person_id from public.chat_messages where message_id = pg_temp.tm('compartilhado', 2)) is null, 'registrado sem pessoa';
  assert (select count(*) from public.chat_links where sender_hash = pg_temp.th('compartilhado')) = 1, 'um vínculo por resumo';
end $$;

-- ---------------------------------------------------------------------------
-- 7. Exclusão da conta (T7): saem os vínculos, os códigos e as mensagens dos dois canais.
-- ---------------------------------------------------------------------------
set role authenticated;
do $$
declare
  r jsonb;
begin
  perform pg_temp.as_('bia');
  r := public.create_whatsapp_code(pg_temp.id('bia_ctx'), 'tg-bia-wa-0001');
  insert into codes values ('bia_wa', r ->> 'code');
end $$;
reset role;
set role service_role;
select pg_temp.as_service();
do $$ begin
  assert public.whatsapp_link('tg-wa-m-100', pg_temp.ph('5521900000072'), pg_temp.code('bia_wa')) ->> 'result' = 'ligado', 'a Bia liga o WhatsApp';
  assert public.telegram_add_record(pg_temp.tm('compartilhado', 3), pg_temp.th('compartilhado'), now(), 'despesa', 100, 0, null, 'Da Bia', null) ->> 'result' = 'anotado',
    'e anota pelo Telegram';
end $$;
reset role;
set role authenticated;
do $$ begin
  perform pg_temp.as_('bia');
  perform public.create_telegram_code(pg_temp.id('bia_ctx'), 'tg-bia-tg-0002');
  perform public.delete_my_account('EXCLUIR', 'tg-del-bia-0001');
end $$;
reset role;
do $$ begin
  assert pg_temp.links('bia') = '-' and pg_temp.code_channels('bia') = '-', 'os vínculos e os códigos da Bia saem';
  assert not exists (select 1 from public.chat_messages where person_id = pg_temp.id('bia')), 'as mensagens da Bia saem';
  assert pg_temp.links('ana') = 'whatsapp', 'os da Ana ficam';
  assert position('chat:p:' in pg_get_functiondef('public.clarevo_erase_person(uuid)'::regprocedure)) > 0, 'a exclusão toma a trava das mensagens';
end $$;
set role service_role;
select pg_temp.as_service();
do $$ begin
  assert public.telegram_add_record(pg_temp.tm('compartilhado', 4), pg_temp.th('compartilhado'), now(), 'despesa', 100, 0, null, 'Depois', null)
       = '{"result": "nao_ligado"}', 'conta excluída não anota pelo Telegram';
end $$;
reset role;

rollback;
