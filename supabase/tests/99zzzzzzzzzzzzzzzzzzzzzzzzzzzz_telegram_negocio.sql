-- Telegram e WhatsApp no espaço Negócio (decisão de 27/11/2026; migração 0049): o vínculo continua no Pessoal ou na Família, e a mensagem
-- que começa com a palavra "negócio" anota no negócio da própria pessoa, pelas funções novas do servidor (telegram_add_business_record,
-- telegram_add_business_card_purchase e as duas do WhatsApp), que acham o negócio pela pessoa do vínculo e nunca pelo texto. Confere: os
-- privilégios e o esquema (as internas com p_business, o resultado novo, 130 funções do app e 105 ações), anotar no negócio (espaço,
-- conta do negócio, autoria, operação, atividade, marcas vazias), a compra num cartão do negócio (nunca num do Pessoal), DESFAZER,
-- quem não tem negócio (sem_negocio, nada gravado, a resposta sem espaço), quem só anota no negócio de outra pessoa (Plus aberto só
-- neste teste: também sem_negocio), "só ver e exportar" (sem_assinatura), a ajuda e o ligado com "negocio" só para quem tem o próprio
-- negócio, a trava de end_business, o negócio encerrado e quem não está ligado.
-- Pessoas FICTÍCIAS: Ana (Pessoal e o negócio "Sacolé da Ana"), Bia (só o Pessoal) e Caio (anota no negócio da Ana, pelo Plus aberto
-- aqui). Tudo em uma transação desfeita no fim.
\set ON_ERROR_STOP 1
\set ana '''00000000-0000-0000-0000-0000000004a1'''
\set bia '''00000000-0000-0000-0000-0000000004a2'''
\set caio '''00000000-0000-0000-0000-0000000004a3'''

begin;
set local clarevo.today = '2026-11-27';

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
-- Resumos de quem escreve e identificadores das mensagens, como o servidor manda (aqui basta um resumo diferente por pessoa e canal).
create function pg_temp.th(p_user text) returns text language sql as $$ select encode(sha256(convert_to('telegram:' || p_user, 'UTF8')), 'hex') $$;
create function pg_temp.ph(p_number text) returns text language sql as $$ select encode(sha256(convert_to(p_number, 'UTF8')), 'hex') $$;
create function pg_temp.tm(p_user text, p_n int) returns text language sql as $$
  select 'telegram:' || encode(sha256(convert_to(p_user || ':' || p_n, 'UTF8')), 'hex')
$$;
create function pg_temp.wm(p_user text, p_n int) returns text language sql as $$
  select 'whatsapp:' || encode(sha256(convert_to('wa:' || p_user || ':' || p_n, 'UTF8')), 'hex')
$$;
create temp table codes (name text primary key, code text);
grant select, insert, update on codes to authenticated, service_role;
create function pg_temp.code(p_name text) returns text language sql as $$ select code from codes where name = p_name $$;
-- "negócio <descrição> <valor>" pelo Telegram de alguém: gasto de hoje, com a categoria que a leitura do núcleo mandaria.
create function pg_temp.biz(p_user text, p_n int, p_desc text, p_cents bigint default 12000, p_category text default 'Material e mercadoria')
returns jsonb language sql as $$
  select public.telegram_add_business_record(pg_temp.tm(p_user, p_n), pg_temp.th(p_user), now(), 'despesa', p_cents, 0, null, p_desc, p_category)
$$;
create function pg_temp.bizcard(p_user text, p_n int, p_desc text, p_hint text default null, p_cents bigint default 8000)
returns jsonb language sql as $$
  select public.telegram_add_business_card_purchase(pg_temp.tm(p_user, p_n), pg_temp.th(p_user), now(), p_cents, 0, null, p_desc,
                                                    'Combustível e transporte', p_hint)
$$;
-- Leituras direto nas tabelas (sem a RLS).
create function pg_temp.rec(p_desc text) returns public.financial_records language sql security definer set search_path = public, pg_temp as $$
  select r from public.financial_records r where r.description = p_desc and r.deleted_at is null order by r.created_at desc limit 1
$$;
create function pg_temp.nrec(p_desc text) returns bigint language sql security definer set search_path = public, pg_temp as $$
  select count(*) from public.financial_records where description = p_desc and deleted_at is null
$$;
create function pg_temp.nentries(p_desc text) returns bigint language sql security definer set search_path = public, pg_temp as $$
  select count(*) from public.card_entries where description = p_desc and deleted_at is null
$$;
create function pg_temp.msg(p_id text) returns public.chat_messages language sql security definer set search_path = public, pg_temp as $$
  select m from public.chat_messages m where m.message_id = p_id
$$;
create function pg_temp.lastwrite(p_name text, p_ctx text) returns text language sql security definer set search_path = public, pg_temp as $$
  select coalesce((select to_char(last_write_on, 'YYYY-MM-DD') from public.context_activity
                    where person_id = pg_temp.id(p_name) and context_id = pg_temp.id(p_ctx)), '-')
$$;
create function pg_temp.status(p_name text) returns text language sql security definer set search_path = public, pg_temp as $$
  select public.clarevo_access(pg_temp.id(p_name)) ->> 'status'
$$;
create function pg_temp.created_days_ago(p_name text, p_days int) returns void language sql security definer set search_path = public, pg_temp as $$
  update public.persons set created_at = now() - make_interval(days => p_days) where id = pg_temp.id(p_name)
$$;

insert into ids values ('ana', :ana), ('bia', :bia), ('caio', :caio);
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  (:ana, 'ana.tgnegocio@exemplo.test', now(), '{"display_name":"Ana"}'),
  (:bia, 'bia.tgnegocio@exemplo.test', now(), '{"display_name":"Bia"}'),
  (:caio, 'caio.tgnegocio@exemplo.test', now(), '{"display_name":"Caio"}');

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
  -- Ana cria o negócio e um cartão no Pessoal (que nunca recebe compra do negócio); liga o Telegram e o WhatsApp no Pessoal.
  perform pg_temp.as_('ana');
  insert into ids values ('biz', (public.create_business('Sacolé da Ana', 'tn-ana-biz-0001') #>> '{context,id}')::uuid);
  insert into ids values ('azul', (public.create_card('tn-ana-azul-0001', pg_temp.id('ana_ctx'), 'Azul', null, 5, 10, null) #>> '{card,id}')::uuid);
  r := public.create_telegram_code(pg_temp.id('ana_ctx'), 'tn-ana-tg-0001');
  insert into codes values ('ana', r ->> 'code');
  r := public.create_whatsapp_code(pg_temp.id('ana_ctx'), 'tn-ana-wa-0001');
  insert into codes values ('ana_wa', r ->> 'code');
  perform pg_temp.as_('bia');
  r := public.create_telegram_code(pg_temp.id('bia_ctx'), 'tn-bia-tg-0001');
  insert into codes values ('bia', r ->> 'code');
  perform pg_temp.as_('caio');
  r := public.create_telegram_code(pg_temp.id('caio_ctx'), 'tn-caio-tg-0001');
  insert into codes values ('caio', r ->> 'code');
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 1. Esquema e privilégios: as quatro do servidor só para service_role; as internas, ninguém de fora; as internas antigas saíram; o
--    resultado novo; e as contagens da conferência (21ak): nenhuma função nova para o app e nenhuma ação nova.
-- ---------------------------------------------------------------------------
do $$
declare
  f text;
begin
  foreach f in array array['telegram_add_business_record(text, text, timestamptz, public.record_kind, bigint, integer, date, text, text)',
                           'telegram_add_business_card_purchase(text, text, timestamptz, bigint, integer, date, text, text, text)',
                           'whatsapp_add_business_record(text, text, timestamptz, public.record_kind, bigint, integer, date, text, text)',
                           'whatsapp_add_business_card_purchase(text, text, timestamptz, bigint, integer, date, text, text, text)'] loop
    assert has_function_privilege('service_role', 'public.' || f, 'execute'), 'service_role executa ' || f;
    assert not has_function_privilege('authenticated', 'public.' || f, 'execute') and not has_function_privilege('anon', 'public.' || f, 'execute'),
      'só o servidor executa ' || f;
    assert not exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                        where p.oid = ('public.' || f)::regprocedure and a.grantee = 0), 'sem execute para public: ' || f;
    assert (select prosecdef from pg_proc where oid = ('public.' || f)::regprocedure), 'security definer: ' || f;
  end loop;
  foreach f in array array['clarevo_own_business(uuid)', 'clarevo_own_business_locked(uuid)',
                           'clarevo_chat_add_record(text, text, text, timestamptz, public.record_kind, bigint, integer, date, text, text, boolean)',
                           'clarevo_chat_add_card_purchase(text, text, text, timestamptz, bigint, integer, date, text, text, text, boolean)',
                           'clarevo_chat_note(text, text, text, text)', 'clarevo_chat_link(text, text, text, text)'] loop
    assert not has_function_privilege('service_role', 'public.' || f, 'execute') and not has_function_privilege('authenticated', 'public.' || f, 'execute')
       and not has_function_privilege('anon', 'public.' || f, 'execute'), 'ninguém de fora executa ' || f;
    assert not (select prosecdef from pg_proc where oid = ('public.' || f)::regprocedure), 'interna sem security definer: ' || f;
  end loop;
  assert to_regprocedure('public.clarevo_chat_add_record(text, text, text, timestamptz, public.record_kind, bigint, integer, date, text, text)') is null
     and to_regprocedure('public.clarevo_chat_add_card_purchase(text, text, text, timestamptz, bigint, integer, date, text, text, text)') is null,
    'as internas de 10 parâmetros saíram (a chamada das funções de cada canal não fica ambígua)';
  assert (select pg_get_constraintdef(oid) from pg_constraint where conname = 'chat_messages_outcome_check') like '%''sem_negocio''%', 'o resultado novo';
  assert position('familia:c:' in pg_get_functiondef('public.clarevo_own_business_locked(uuid)'::regprocedure)) > 0, 'a trava de end_business';
  assert (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and has_function_privilege('authenticated', p.oid, 'execute')) = 130, 'funções do app: 130, como antes';
  assert (select count(*) from pg_constraint c, regexp_matches(pg_get_constraintdef(c.oid), '''([a-z_]+)''::text', 'g') m
           where c.conname = 'record_operations_action_check') = 105, 'ações de record_operations: 105, como antes';
end $$;

-- ---------------------------------------------------------------------------
-- 2. Ligar: os três no Pessoal (o código de ligar continua recusando o negócio). O ligado diz "negocio" só para quem tem o próprio.
-- ---------------------------------------------------------------------------
set role service_role;
select pg_temp.as_service();
do $$
declare
  r jsonb;
begin
  r := public.telegram_link(pg_temp.tm('ana', 1), pg_temp.th('ana'), pg_temp.code('ana'));
  assert r = jsonb_build_object('result', 'ligado', 'space', jsonb_build_object('kind', 'pessoal', 'name', 'Pessoal'), 'name', 'Ana', 'negocio', true),
    'Ana tem o próprio negócio: o ligado diz: ' || r::text;
  r := public.telegram_link(pg_temp.tm('bia', 1), pg_temp.th('bia'), pg_temp.code('bia'));
  assert r = jsonb_build_object('result', 'ligado', 'space', jsonb_build_object('kind', 'pessoal', 'name', 'Pessoal'), 'name', 'Bia'),
    'Bia sem negócio: o ligado de antes, sem a chave: ' || r::text;
  r := public.telegram_link(pg_temp.tm('caio', 1), pg_temp.th('caio'), pg_temp.code('caio'));
  assert r ->> 'result' = 'ligado' and not (r ? 'negocio'), 'Caio sem negócio';
  r := public.whatsapp_link(pg_temp.wm('ana', 1), pg_temp.ph('5521900004401'), pg_temp.code('ana_wa'));
  assert r ->> 'result' = 'ligado' and (r ->> 'negocio')::boolean, 'Ana liga o WhatsApp também';
  -- A ajuda: "negocio" só na de quem tem o próprio negócio; mídia e "não entendi", nunca.
  assert public.telegram_note(pg_temp.tm('ana', 2), pg_temp.th('ana'), 'ajuda') = '{"result": "registrada", "negocio": true}', 'ajuda da Ana';
  assert public.telegram_note(pg_temp.tm('ana', 3), pg_temp.th('ana'), 'midia') = '{"result": "registrada"}', 'mídia da Ana';
  assert public.telegram_note(pg_temp.tm('ana', 4), pg_temp.th('ana'), 'nao_entendi') = '{"result": "registrada"}', 'não entendi da Ana';
  assert public.telegram_note(pg_temp.tm('bia', 2), pg_temp.th('bia'), 'ajuda') = '{"result": "registrada"}', 'ajuda da Bia';
  assert public.telegram_note(pg_temp.tm('x', 1), pg_temp.th('ninguem'), 'ajuda') = '{"result": "registrada"}', 'ajuda de quem não está ligado';
  assert public.whatsapp_note(pg_temp.wm('ana', 2), pg_temp.ph('5521900004401'), 'ajuda') = '{"result": "registrada", "negocio": true}', 'ajuda da Ana no WhatsApp';
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 3. Anotar no negócio: o espaço é o negócio da Ana (não o do vínculo), na conta do negócio, com a autoria dela, pela create_record.
-- ---------------------------------------------------------------------------
set role service_role;
select pg_temp.as_service();
do $$
declare
  r jsonb;
  rec public.financial_records;
  m public.chat_messages;
begin
  r := pg_temp.biz('ana', 10, 'Material');
  assert r = jsonb_build_object(
    'result', 'anotado', 'space', jsonb_build_object('kind', 'negocio', 'name', 'Sacolé da Ana'),
    'record', jsonb_build_object('kind', 'despesa', 'amount_cents', 12000, 'occurred_on', '2026-11-27', 'description', 'Material',
                                 'category', 'Material e mercadoria', 'account_name', 'Conta do negócio'),
    'today', '2026-11-27'), 'anotado no negócio: ' || r::text;
  rec := pg_temp.rec('Material');
  assert rec.context_id = pg_temp.id('biz') and rec.created_by = pg_temp.id('ana') and rec.kind = 'despesa' and rec.amount_cents = 12000,
    'no negócio, em nome da Ana';
  assert (select name from public.financial_accounts where id = rec.account_id) = 'Conta do negócio', 'na conta principal do negócio';
  -- As marcas do negócio ficam vazias: a pessoa preenche no app.
  assert rec.has_invoice is null and rec.payer_kind is null and rec.receivable_id is null and rec.paired_record_id is null, 'marcas vazias';
  assert exists (select 1 from public.record_operations where action = 'criar' and actor_id = pg_temp.id('ana') and context_id = pg_temp.id('biz')
                  and idempotency_key = 'telegram:' || md5(pg_temp.tm('ana', 10))), 'a operação de criar, com a chave do canal';
  m := pg_temp.msg(pg_temp.tm('ana', 10));
  assert m.outcome = 'anotado' and m.record_id = rec.id and m.person_id = pg_temp.id('ana') and m.channel = 'telegram', 'a mensagem guarda o registro';
  assert pg_temp.lastwrite('ana', 'biz') = '2026-11-27', 'conta como anotação no negócio';
  -- A mesma entrega de novo: repetida, sem segundo registro.
  assert pg_temp.biz('ana', 10, 'Material') = '{"result": "repetida"}' and pg_temp.nrec('Material') = 1, 'repetida';
  -- Entrada no negócio.
  r := public.telegram_add_business_record(pg_temp.tm('ana', 11), pg_temp.th('ana'), now(), 'receita', 30000, 0, null, 'Conserto', 'Serviços');
  assert r ->> 'result' = 'anotado' and r #>> '{record,kind}' = 'receita' and r #>> '{space,name}' = 'Sacolé da Ana'
     and (pg_temp.rec('Conserto')).context_id = pg_temp.id('biz'), 'entrada no negócio: ' || r::text;
  -- Sem a palavra, o espaço do vínculo (o Pessoal), como sempre.
  r := public.telegram_add_record(pg_temp.tm('ana', 12), pg_temp.th('ana'), now(), 'despesa', 5230, 0, null, 'Mercado', 'Mercado');
  assert r #>> '{space,kind}' = 'pessoal' and (pg_temp.rec('Mercado')).context_id = pg_temp.id('ana_ctx'), 'sem a palavra, no Pessoal';
  -- Ontem e data escrita, data futura e valor inválido: as respostas de sempre.
  r := public.telegram_add_business_record(pg_temp.tm('ana', 13), pg_temp.th('ana'), now(), 'despesa', 900, 1, null, 'Gelo', null);
  assert r ->> 'result' = 'anotado' and r #>> '{record,occurred_on}' = '2026-11-26', 'ontem';
  assert public.telegram_add_business_record(pg_temp.tm('ana', 14), pg_temp.th('ana'), now(), 'despesa', 900, null, '2026-11-28', 'Amanhã', null) ->> 'result'
         = 'data_futura', 'data futura';
  assert pg_temp.biz('ana', 15, 'Zero', 0) ->> 'result' = 'valor_invalido' and pg_temp.nrec('Zero') = 0, 'valor inválido, nada gravado';
  -- Entregas inválidas, como nas funções de sempre.
  perform pg_temp.expect_code(format('select public.telegram_add_business_record(%L, %L, now(), %L, 900, 0, %L, %L, null)',
                                     pg_temp.tm('ana', 16), pg_temp.th('ana'), 'despesa', '2026-11-27', 'X'), 'mensagem_invalida', '22023');
  -- O WhatsApp (ainda em piloto fechado) chega ao mesmo negócio.
  r := public.whatsapp_add_business_record(pg_temp.wm('ana', 10), pg_temp.ph('5521900004401'), now(), 'despesa', 1500, 0, null, 'Embalagem', 'Material e mercadoria');
  assert r ->> 'result' = 'anotado' and (pg_temp.rec('Embalagem')).context_id = pg_temp.id('biz') and (pg_temp.msg(pg_temp.wm('ana', 10))).channel = 'whatsapp',
    'pelo WhatsApp, no mesmo negócio: ' || r::text;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 4. Compra no cartão do negócio: só os cartões do negócio (o Azul do Pessoal nunca), com as mesmas regras de escolha.
-- ---------------------------------------------------------------------------
set role service_role;
select pg_temp.as_service();
do $$
declare
  r jsonb;
begin
  r := pg_temp.bizcard('ana', 20, 'Gasolina');
  assert r = jsonb_build_object('result', 'sem_cartao', 'space', jsonb_build_object('kind', 'negocio', 'name', 'Sacolé da Ana'), 'today', '2026-11-27'),
    'o negócio sem cartão: sem_cartao, mesmo com o Azul no Pessoal: ' || r::text;
  assert pg_temp.nentries('Gasolina') = 0 and (pg_temp.msg(pg_temp.tm('ana', 20))).outcome = 'sem_cartao', 'nada gravado';
end $$;
reset role;
set role authenticated;
select pg_temp.as_('ana');
do $$ begin
  insert into ids values ('loja', (public.create_card('tn-ana-loja-0001', pg_temp.id('biz'), 'Cartão da loja', null, 5, 10, null) #>> '{card,id}')::uuid);
end $$;
reset role;
set role service_role;
select pg_temp.as_service();
do $$
declare
  r jsonb;
begin
  r := pg_temp.bizcard('ana', 21, 'Gasolina', 'azul');
  assert r ->> 'result' = 'compra_anotada' and r #>> '{space,kind}' = 'negocio' and r #>> '{purchase,card_nickname}' = 'Cartão da loja'
     and r #>> '{purchase,invoice_month}' = '2026-12-01', 'um cartão no negócio: é ele (o nome "azul" não leva ao cartão do Pessoal): ' || r::text;
  assert (select array[context_id::text, card_id::text, created_by::text] from public.card_entries where description = 'Gasolina' and deleted_at is null)
       = array[pg_temp.id('biz')::text, pg_temp.id('loja')::text, pg_temp.id('ana')::text], 'no cartão do negócio, em nome da Ana';
  assert (pg_temp.msg(pg_temp.tm('ana', 21))).entry_id is not null, 'a mensagem guarda o lançamento do cartão';
  -- Sem a palavra, o cartão do Pessoal, como sempre.
  r := public.telegram_add_card_purchase(pg_temp.tm('ana', 22), pg_temp.th('ana'), now(), 4100, 0, null, 'Farmácia', 'Saúde', null);
  assert r ->> 'result' = 'compra_anotada' and r #>> '{purchase,card_nickname}' = 'Azul' and r #>> '{space,kind}' = 'pessoal', 'sem a palavra, o Azul';
end $$;
reset role;
set role authenticated;
select pg_temp.as_('ana');
do $$ begin
  insert into ids values ('roxo', (public.create_card('tn-ana-roxo-0001', pg_temp.id('biz'), 'Roxo', null, 20, 27, null) #>> '{card,id}')::uuid);
end $$;
reset role;
set role service_role;
select pg_temp.as_service();
do $$
declare
  r jsonb;
begin
  r := pg_temp.bizcard('ana', 23, 'Frete');
  assert r = jsonb_build_object('result', 'qual_cartao', 'space', jsonb_build_object('kind', 'negocio', 'name', 'Sacolé da Ana'),
                                'cards', jsonb_build_array('Cartão da loja', 'Roxo'), 'today', '2026-11-27'),
    'dois cartões no negócio: pergunta, só com os do negócio: ' || r::text;
  r := pg_temp.bizcard('ana', 24, 'Frete', 'ROXO', 2500);
  assert r ->> 'result' = 'compra_anotada' and r #>> '{purchase,card_nickname}' = 'Roxo', 'o nome escolhe, sem caixa';
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 5. DESFAZER: a última anotação do canal, no negócio ou no Pessoal, na ordem.
-- ---------------------------------------------------------------------------
set role service_role;
select pg_temp.as_service();
do $$
declare
  r jsonb;
begin
  r := public.telegram_undo(pg_temp.tm('ana', 30), pg_temp.th('ana'), now());
  assert r ->> 'result' = 'compra_desfeita' and r #>> '{space,kind}' = 'negocio' and r #>> '{purchase,description}' = 'Frete'
     and r #>> '{purchase,card_nickname}' = 'Roxo', 'desfaz a compra no cartão do negócio: ' || r::text;
  r := public.telegram_undo(pg_temp.tm('ana', 31), pg_temp.th('ana'), now());
  assert r ->> 'result' = 'compra_desfeita' and r #>> '{space,kind}' = 'pessoal' and r #>> '{purchase,description}' = 'Farmácia', 'depois, a do Pessoal';
  r := public.telegram_undo(pg_temp.tm('ana', 32), pg_temp.th('ana'), now());
  assert r ->> 'result' = 'compra_desfeita' and r #>> '{purchase,description}' = 'Gasolina' and pg_temp.nentries('Gasolina') = 0, 'a do cartão da loja';
  r := public.telegram_undo(pg_temp.tm('ana', 33), pg_temp.th('ana'), now());
  assert r ->> 'result' = 'desfeito' and r #>> '{space,kind}' = 'negocio' and r #>> '{record,description}' = 'Gelo' and pg_temp.nrec('Gelo') = 0,
    'o gasto de ontem no negócio: ' || r::text;
  assert exists (select 1 from public.record_operations where action = 'excluir' and actor_id = pg_temp.id('ana')
                  and idempotency_key = 'telegram:' || md5(pg_temp.tm('ana', 33))), 'pela delete_record, com a chave do canal';
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 6. Sem negócio próprio: sem_negocio, nada gravado, a resposta sem espaço. Bia não tem negócio; Caio só anota no da Ana (Plus aberto
--    só neste teste, para haver outra pessoa num negócio).
-- ---------------------------------------------------------------------------
set role service_role;
select pg_temp.as_service();
do $$
declare
  r jsonb;
begin
  r := pg_temp.biz('bia', 10, 'Farinha');
  assert r = '{"result": "sem_negocio", "today": "2026-11-27"}', 'Bia sem negócio: ' || r::text;
  assert not (r ? 'space'), 'a resposta não diz espaço nenhum';
  assert pg_temp.nrec('Farinha') = 0 and (pg_temp.msg(pg_temp.tm('bia', 10))).outcome = 'sem_negocio'
     and (pg_temp.msg(pg_temp.tm('bia', 10))).person_id = pg_temp.id('bia') and (pg_temp.msg(pg_temp.tm('bia', 10))).record_id is null, 'registrada, sem registro';
  r := pg_temp.bizcard('bia', 11, 'Farinha');
  assert r = '{"result": "sem_negocio", "today": "2026-11-27"}' and pg_temp.nentries('Farinha') = 0, 'compra no cartão: sem_negocio';
  -- Quem não está ligado não fica sabendo de nada.
  assert pg_temp.biz('ninguem', 1, 'X') = '{"result": "nao_ligado"}', 'não ligado';
  assert public.telegram_add_business_card_purchase(pg_temp.tm('ninguem', 2), pg_temp.th('ninguem'), now(), 100, 0, null, 'X', null, null) = '{"result": "nao_ligado"}',
    'não ligado (cartão)';
end $$;
reset role;

do $$ begin
  perform public.clarevo_staff_set_plus(now() - interval '1 minute');
end $$;
set role authenticated;
select pg_temp.as_('ana');
do $$ begin
  insert into codes values ('convite_caio', public.create_business_invite(pg_temp.id('biz'), 'membro', 'tn-ana-inv-0001') ->> 'code');
end $$;
select pg_temp.as_('caio');
do $$ begin
  perform public.accept_business_invite(pg_temp.code('convite_caio'), 'tn-caio-inv-0001');
  assert public.context_permission(pg_temp.id('biz'), 'write'), 'Caio anota no negócio da Ana pelo app';
end $$;
reset role;
set role service_role;
select pg_temp.as_service();
do $$
declare
  r jsonb;
begin
  r := pg_temp.biz('caio', 10, 'Gelo do Caio');
  assert r = '{"result": "sem_negocio", "today": "2026-11-27"}', 'Caio só anota no negócio de outra pessoa: sem_negocio: ' || r::text;
  assert pg_temp.nrec('Gelo do Caio') = 0, 'nada entra no negócio da Ana pelo Telegram do Caio';
  assert pg_temp.bizcard('caio', 11, 'Frete do Caio') ->> 'result' = 'sem_negocio' and pg_temp.nentries('Frete do Caio') = 0, 'nem no cartão do negócio';
  assert public.telegram_note(pg_temp.tm('caio', 12), pg_temp.th('caio'), 'ajuda') = '{"result": "registrada"}', 'a ajuda do Caio não ensina a palavra';
  -- A chave de serviço não executa a interna: só as funções do servidor a chamam.
  perform pg_temp.expect_code(format('select public.clarevo_own_business(%L)', pg_temp.id('ana')), 'permission denied for function clarevo_own_business', '42501');
end $$;
reset role;
do $$ begin
  assert public.clarevo_own_business(pg_temp.id('caio')) is null and public.clarevo_own_business(pg_temp.id('ana')) = pg_temp.id('biz')
     and public.clarevo_own_business(pg_temp.id('bia')) is null, 'o negócio da própria pessoa: o da Ana; Caio e Bia, nenhum';
end $$;

-- ---------------------------------------------------------------------------
-- 7. "Só ver e exportar": anotar no negócio responde sem_assinatura e não grava, como no Pessoal.
-- ---------------------------------------------------------------------------
savepoint so_leitura;
do $$ begin
  perform pg_temp.created_days_ago('ana', 400);
  perform public.clarevo_staff_set_billing_start(now() - interval '20 days');
  assert pg_temp.status('ana') = 'leitura', 'Ana em só leitura';
end $$;
set role service_role;
select pg_temp.as_service();
do $$
declare
  r jsonb;
begin
  r := pg_temp.biz('ana', 40, 'Material só leitura');
  assert r = jsonb_build_object('result', 'sem_assinatura', 'space', jsonb_build_object('kind', 'negocio', 'name', 'Sacolé da Ana'), 'today', '2026-11-27'),
    'só leitura: ' || r::text;
  assert pg_temp.bizcard('ana', 41, 'Frete só leitura', 'roxo') ->> 'result' = 'sem_assinatura', 'só leitura (cartão)';
  assert pg_temp.nrec('Material só leitura') = 0 and pg_temp.nentries('Frete só leitura') = 0, 'nada gravado';
  assert (pg_temp.msg(pg_temp.tm('ana', 40))).outcome = 'sem_assinatura', 'registrada com o resultado';
end $$;
reset role;
rollback to savepoint so_leitura;

-- ---------------------------------------------------------------------------
-- 8. Banco ou carteira: o negócio sem conta principal responde sem_conta, com o espaço do negócio.
-- ---------------------------------------------------------------------------
savepoint sem_conta;
do $$ begin
  update public.financial_accounts set is_default = false where context_id = pg_temp.id('biz');
end $$;
set role service_role;
select pg_temp.as_service();
do $$
declare
  r jsonb := pg_temp.biz('ana', 45, 'Sem conta');
begin
  assert r = jsonb_build_object('result', 'sem_conta', 'space', jsonb_build_object('kind', 'negocio', 'name', 'Sacolé da Ana'), 'today', '2026-11-27'),
    'sem conta principal no negócio: ' || r::text;
end $$;
reset role;
rollback to savepoint sem_conta;

-- ---------------------------------------------------------------------------
-- 9. O negócio encerrado deixa de receber (sem_negocio), e o que foi anotado nele não sai mais pelo DESFAZER.
-- ---------------------------------------------------------------------------
set role service_role;
select pg_temp.as_service();
do $$ begin
  -- A última anotação do canal antes de encerrar é no negócio (depois do gasto do Pessoal, "Mercado").
  assert pg_temp.biz('ana', 49, 'Último no negócio', 700, null) ->> 'result' = 'anotado', 'anota no negócio antes de encerrar';
end $$;
reset role;
set role authenticated;
select pg_temp.as_('ana');
do $$ begin
  -- Encerrar pede o negócio sem outras pessoas ativas: Caio sai antes.
  perform public.remove_business_member(pg_temp.id('biz'), pg_temp.id('caio'), 'tn-ana-rm-0001');
  perform public.end_business(pg_temp.id('biz'), 'tn-ana-end-0001');
end $$;
reset role;
set role service_role;
select pg_temp.as_service();
do $$
declare
  r jsonb;
begin
  assert pg_temp.biz('ana', 50, 'Depois de encerrar') = '{"result": "sem_negocio", "today": "2026-11-27"}' and pg_temp.nrec('Depois de encerrar') = 0,
    'negócio encerrado: sem_negocio';
  assert public.telegram_note(pg_temp.tm('ana', 51), pg_temp.th('ana'), 'ajuda') = '{"result": "registrada"}', 'a ajuda deixa de ensinar a palavra';
  -- O DESFAZER pula o que ficou no negócio encerrado (sem escrita), mesmo sendo o mais recente, e desfaz o gasto do Pessoal.
  r := public.telegram_undo(pg_temp.tm('ana', 52), pg_temp.th('ana'), now());
  assert r ->> 'result' = 'desfeito' and r #>> '{record,description}' = 'Mercado' and r #>> '{space,kind}' = 'pessoal', 'desfaz o do Pessoal: ' || r::text;
  assert pg_temp.nrec('Último no negócio') = 1 and pg_temp.nrec('Conserto') = 1 and pg_temp.nrec('Material') = 1,
    'o que foi anotado no negócio continua guardado';
end $$;
reset role;

rollback;
