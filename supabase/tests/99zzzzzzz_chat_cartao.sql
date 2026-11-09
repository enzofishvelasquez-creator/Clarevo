-- Compra no cartão pelo Telegram e pelo WhatsApp (D-089 C; migração 0028): whatsapp_add_card_purchase e telegram_add_card_purchase (só
-- service_role) anotam uma compra à vista no cartão pela add_card_purchase do app, em nome da pessoa; DESFAZER (clarevo_chat_undo)
-- desfaz também a compra, na ordem das anotações do canal. Confere: os privilégios, sem cartão (resposta e nada gravado), um cartão só,
-- mais de um cartão (o nome escolhe, sem acento e sem caixa; sem um só que combine, a resposta pergunta com os apelidos), a fatura em que
-- a compra cai, a autoria, a operação, a atividade, o registro da mensagem com entry_id, o DESFAZER misturando gasto e compra, a data
-- futura, a Família (cartões só no Pessoal) e a exclusão em cascata.
-- Pessoas FICTÍCIAS: Ana (Pessoal, com cartões) e Bia (titular de uma Família). Tudo em uma transação desfeita no fim.
\set ON_ERROR_STOP 1
\set ana '''00000000-0000-0000-0000-0000000000c1'''
\set bia '''00000000-0000-0000-0000-0000000000c2'''

begin;
set local clarevo.today = '2026-11-09';

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
create function pg_temp.th(p_user text) returns text language sql as $$ select encode(sha256(convert_to('telegram:' || p_user, 'UTF8')), 'hex') $$;
create function pg_temp.ph(p_number text) returns text language sql as $$ select encode(sha256(convert_to(p_number, 'UTF8')), 'hex') $$;
create function pg_temp.tm(p_user text, p_n int) returns text language sql as $$
  select 'telegram:' || encode(sha256(convert_to(p_user || ':' || p_n, 'UTF8')), 'hex')
$$;
create temp table codes (name text primary key, code text);
grant select, insert, update on codes to authenticated, service_role;
create function pg_temp.code(p_name text) returns text language sql as $$ select code from codes where name = p_name $$;
-- A compra pelo Telegram da Ana: valor em centavos, hoje, descrição, categoria e o nome do cartão escrito (ou nenhum).
create function pg_temp.buy(p_n int, p_desc text, p_hint text default null, p_cents bigint default 4100, p_days int default 0, p_on date default null)
returns jsonb language sql as $$
  select public.telegram_add_card_purchase(pg_temp.tm('ana', p_n), pg_temp.th('ana'), now(), p_cents, p_days, p_on, p_desc, 'Saúde', p_hint)
$$;
-- Leituras direto nas tabelas (sem a RLS).
create function pg_temp.entries(p_desc text) returns bigint language sql security definer set search_path = public, pg_temp as $$
  select count(*) from public.card_entries where description = p_desc and deleted_at is null
$$;
create function pg_temp.msg(p_n int) returns public.chat_messages language sql security definer set search_path = public, pg_temp as $$
  select m from public.chat_messages m where m.message_id = pg_temp.tm('ana', p_n)
$$;
create function pg_temp.lastwrite(p_name text, p_ctx text) returns text language sql security definer set search_path = public, pg_temp as $$
  select coalesce((select to_char(last_write_on, 'YYYY-MM-DD') from public.context_activity
                    where person_id = pg_temp.id(p_name) and context_id = pg_temp.id(p_ctx)), '-')
$$;

insert into ids values ('ana', :ana), ('bia', :bia);
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  (:ana, 'ana.cartao@exemplo.test', now(), '{"display_name":"Ana"}'),
  (:bia, 'bia.cartao@exemplo.test', now(), '{"display_name":"Bia"}');

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
  -- Bia é titular de uma Família, que vai ligar ao Telegram dela.
  perform pg_temp.as_('bia');
  insert into ids values ('fam', (public.create_family('Família da Bia', 'cc-fam-0001') #>> '{context,id}')::uuid);
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 1. Privilégios e esquema: só o servidor executa as duas funções novas; as internas, ninguém de fora; a coluna e os resultados novos.
-- ---------------------------------------------------------------------------
do $$
declare
  f text;
begin
  foreach f in array array['whatsapp_add_card_purchase(text, text, timestamptz, bigint, integer, date, text, text, text)',
                           'telegram_add_card_purchase(text, text, timestamptz, bigint, integer, date, text, text, text)'] loop
    assert has_function_privilege('service_role', 'public.' || f, 'execute'), 'service_role executa ' || f;
    assert not has_function_privilege('authenticated', 'public.' || f, 'execute') and not has_function_privilege('anon', 'public.' || f, 'execute'),
      'só o servidor executa ' || f;
    assert not exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                        where p.oid = ('public.' || f)::regprocedure and a.grantee = 0), 'sem execute para public: ' || f;
    assert (select prosecdef from pg_proc where oid = ('public.' || f)::regprocedure), 'security definer: ' || f;
  end loop;
  foreach f in array array['clarevo_chat_add_card_purchase(text, text, text, timestamptz, bigint, integer, date, text, text, text)',
                           'clarevo_chat_purchase(uuid)', 'clarevo_chat_fold(text)', 'clarevo_chat_log(text, text, text, uuid, text, uuid, uuid)'] loop
    assert not has_function_privilege('service_role', 'public.' || f, 'execute') and not has_function_privilege('authenticated', 'public.' || f, 'execute')
       and not has_function_privilege('anon', 'public.' || f, 'execute'), 'ninguém de fora executa ' || f;
  end loop;
  assert not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                      where n.nspname = 'public' and p.proname = 'clarevo_chat_log' and pg_get_function_identity_arguments(p.oid) not like '%p_entry%'),
    'a clarevo_chat_log antiga saiu';
  assert exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'chat_messages' and column_name = 'entry_id'),
    'chat_messages.entry_id';
  assert exists (select 1 from pg_constraint where conname = 'chat_messages_um_alvo'), 'um alvo por mensagem';
  assert (select pg_get_constraintdef(oid) from pg_constraint where conname = 'chat_messages_outcome_check') like '%compra_anotada%', 'os resultados novos';
  assert public.clarevo_chat_fold('Cartão AZUL  ') = 'cartao azul  ' and public.clarevo_chat_fold(null) = '', 'sem acento e em minúsculas';
end $$;
select pg_temp.expect_code(format($q$insert into public.chat_messages (channel, message_id, sender_hash, outcome, record_id, entry_id)
                                   select 'telegram', %L, %L, 'anotado', r.id, e.id from public.financial_records r, public.card_entries e limit 1$q$,
                                  pg_temp.tm('x', 1), pg_temp.th('x')), 'new row for relation "chat_messages" violates check constraint "chat_messages_um_alvo"', '23514')
 where exists (select 1 from public.financial_records) and exists (select 1 from public.card_entries);

-- ---------------------------------------------------------------------------
-- 2. Ligar: Ana no Pessoal, Bia na Família.
-- ---------------------------------------------------------------------------
set role authenticated;
do $$
declare
  r jsonb;
begin
  perform pg_temp.as_('ana');
  r := public.create_telegram_code(pg_temp.id('ana_ctx'), 'cc-ana-tg-0001');
  insert into codes values ('ana', r ->> 'code');
  perform pg_temp.as_('bia');
  r := public.create_telegram_code(pg_temp.id('fam'), 'cc-bia-tg-0001');
  insert into codes values ('bia', r ->> 'code');
end $$;
reset role;
set role service_role;
select pg_temp.as_service();
do $$ begin
  assert public.telegram_link(pg_temp.tm('ana', 1), pg_temp.th('ana'), pg_temp.code('ana')) ->> 'result' = 'ligado', 'Ana liga o Telegram no Pessoal';
  assert public.telegram_link(pg_temp.tm('bia', 1), pg_temp.th('bia'), pg_temp.code('bia')) #>> '{space,kind}' = 'familia', 'Bia liga o Telegram na Família';
end $$;

-- ---------------------------------------------------------------------------
-- 3. Sem cartão: a resposta explica e nada é gravado. Na Família, idem (cartões só no Pessoal).
-- ---------------------------------------------------------------------------
do $$
declare
  r jsonb;
begin
  r := pg_temp.buy(10, 'Farmácia');
  assert r = jsonb_build_object('result', 'sem_cartao', 'space', jsonb_build_object('kind', 'pessoal', 'name', 'Pessoal'), 'today', '2026-11-09'),
    'sem cartão no Pessoal: ' || r::text;
  r := public.telegram_add_card_purchase(pg_temp.tm('bia', 2), pg_temp.th('bia'), now(), 4100, 0, null, 'Farmácia', 'Saúde', null);
  assert r ->> 'result' = 'sem_cartao' and r #>> '{space,kind}' = 'familia', 'na Família, sem compra no cartão: ' || r::text;
  assert (pg_temp.msg(10)).outcome = 'sem_cartao' and (pg_temp.msg(10)).entry_id is null, 'a mensagem fica registrada como sem_cartao';
  assert pg_temp.entries('Farmácia') = 0, 'nada gravado';
  -- Entregas inválidas, como na clarevo_chat_add_record.
  perform pg_temp.expect_code(format('select public.telegram_add_card_purchase(%L, %L, now(), 4100, 0, %L, %L, null, null)', pg_temp.tm('ana', 11), pg_temp.th('ana'), '2026-11-09', 'X'),
                              'mensagem_invalida', '22023');
  perform pg_temp.expect_code(format('select public.telegram_add_card_purchase(%L, %L, now(), 4100, 40, null, %L, null, null)', pg_temp.tm('ana', 11), pg_temp.th('ana'), 'X'),
                              'mensagem_invalida', '22023');
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 4. Um cartão só: é ele. A compra entra pela add_card_purchase, à vista, na fatura natural da data, em nome da Ana.
-- ---------------------------------------------------------------------------
set role authenticated;
select pg_temp.as_('ana');
do $$ begin
  insert into ids values ('azul', (public.create_card('cc-azul-0001', pg_temp.id('ana_ctx'), 'Cartão Azul', null, 5, 10, 82000) #>> '{card,id}')::uuid);
end $$;
reset role;
set role service_role;
select pg_temp.as_service();
do $$
declare
  r jsonb;
  m public.chat_messages;
begin
  r := pg_temp.buy(12, 'Farmácia');
  assert r ->> 'result' = 'compra_anotada' and r #>> '{space,kind}' = 'pessoal' and r ->> 'today' = '2026-11-09', 'compra anotada: ' || r::text;
  assert r -> 'purchase' = jsonb_build_object('amount_cents', 4100, 'purchased_on', '2026-11-09', 'description', 'Farmácia', 'category', 'Saúde',
                                               'card_nickname', 'Cartão Azul', 'invoice_month', '2026-12-01'),
    'a compra na resposta, com o apelido do cartão e a fatura de dezembro (fecha dia 5, a compra é dia 9): ' || (r -> 'purchase')::text;
  assert pg_temp.entries('Farmácia') = 1, 'um lançamento vivo';
  assert (select array[kind, installment_number::text, installment_total::text, purchase_total_cents::text, created_by::text, context_id::text]
            from public.card_entries where description = 'Farmácia' and deleted_at is null)
       = array['parcela', '1', '1', '4100', pg_temp.id('ana')::text, pg_temp.id('ana_ctx')::text], 'parcela única, autoria da Ana, no Pessoal';
  assert exists (select 1 from public.record_operations where action = 'criar_compra_cartao' and actor_id = pg_temp.id('ana')
                  and idempotency_key = 'telegram:' || md5(pg_temp.tm('ana', 12))), 'passa pela add_card_purchase com a chave do canal';
  m := pg_temp.msg(12);
  assert m.outcome = 'compra_anotada' and m.record_id is null and m.entry_id = (select id from public.card_entries where description = 'Farmácia'),
    'a mensagem guarda o lançamento do cartão';
  assert pg_temp.lastwrite('ana', 'ana_ctx') = '2026-11-09', 'a compra pelo chat conta como anotação';
  -- A mesma entrega de novo: repetida, sem segunda compra.
  assert pg_temp.buy(12, 'Farmácia') = '{"result": "repetida"}' and pg_temp.entries('Farmácia') = 1, 'repetida';
  -- Com um cartão só, o nome escrito não importa (mesmo errado): é ele.
  r := pg_temp.buy(13, 'Padaria', 'verde', 1250);
  assert r ->> 'result' = 'compra_anotada' and r #>> '{purchase,card_nickname}' = 'Cartão Azul', 'um cartão só: é ele, com qualquer nome: ' || r::text;
  -- Data futura e valor inválido viram resposta, sem gravar.
  assert pg_temp.buy(14, 'Amanhã', null, 100, null, '2026-11-10') ->> 'result' = 'data_futura', 'data futura';
  assert pg_temp.buy(15, 'Zero', null, 0) ->> 'result' = 'valor_invalido', 'valor inválido';
  assert pg_temp.entries('Amanhã') = 0 and pg_temp.entries('Zero') = 0, 'nada gravado nas recusas';
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 5. Mais de um cartão: o nome escolhe (sem acento e sem caixa); sem nome, ou sem um só que combine, a resposta pergunta com os apelidos.
-- ---------------------------------------------------------------------------
set role authenticated;
select pg_temp.as_('ana');
do $$ begin
  insert into ids values ('roxo', (public.create_card('cc-roxo-0001', pg_temp.id('ana_ctx'), 'Roxo', null, 20, 27, null) #>> '{card,id}')::uuid);
end $$;
reset role;
set role service_role;
select pg_temp.as_service();
do $$
declare
  r jsonb;
begin
  r := pg_temp.buy(20, 'Mercado');
  assert r = jsonb_build_object('result', 'qual_cartao', 'space', jsonb_build_object('kind', 'pessoal', 'name', 'Pessoal'),
                                'cards', jsonb_build_array('Cartão Azul', 'Roxo'), 'today', '2026-11-09'), 'sem o nome: pergunta qual, com os apelidos: ' || r::text;
  assert (pg_temp.msg(20)).outcome = 'qual_cartao' and pg_temp.entries('Mercado') = 0, 'nada gravado ao perguntar';
  r := pg_temp.buy(21, 'Mercado', 'ROX', 12000);
  assert r ->> 'result' = 'compra_anotada' and r #>> '{purchase,card_nickname}' = 'Roxo' and r #>> '{purchase,invoice_month}' = '2026-11-01',
    'o nome escolhe, sem caixa; fecha dia 20, a compra do dia 9 cai na fatura de novembro: ' || r::text;
  r := pg_temp.buy(22, 'Padaria', 'cartao azul', 800);
  assert r ->> 'result' = 'compra_anotada' and r #>> '{purchase,card_nickname}' = 'Cartão Azul', 'o nome sem acento acha o cartão com acento';
  r := pg_temp.buy(23, 'Luz', 'verde');
  assert r ->> 'result' = 'qual_cartao' and r -> 'cards' = jsonb_build_array('Cartão Azul', 'Roxo'), 'nome que não combina: pergunta';
  -- Cartão arquivado não conta.
  perform set_config('request.jwt.claim.sub', pg_temp.id('ana')::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', pg_temp.id('ana'), 'role', 'authenticated')::text, true);
  perform public.set_card_status('cc-roxo-arq', pg_temp.id('roxo'), (select version from public.cards where id = pg_temp.id('roxo')), 'arquivado');
  perform pg_temp.as_service();
  r := pg_temp.buy(24, 'Pão', null, 700);
  assert r ->> 'result' = 'compra_anotada' and r #>> '{purchase,card_nickname}' = 'Cartão Azul', 'com o Roxo arquivado, sobra um cartão: é ele';
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 6. DESFAZER: a última anotação do canal, compra no cartão ou gasto, na ordem; depois de tudo, nada para desfazer.
-- ---------------------------------------------------------------------------
set role service_role;
select pg_temp.as_service();
do $$
declare
  r jsonb;
begin
  r := public.telegram_add_record(pg_temp.tm('ana', 30), pg_temp.th('ana'), now(), 'despesa', 990, 0, null, 'Café', null);
  assert r ->> 'result' = 'anotado', 'um gasto comum depois das compras';
  r := public.telegram_undo(pg_temp.tm('ana', 31), pg_temp.th('ana'), now());
  assert r ->> 'result' = 'desfeito' and r #>> '{record,description}' = 'Café', 'desfaz o gasto, que foi o último: ' || r::text;
  r := public.telegram_undo(pg_temp.tm('ana', 32), pg_temp.th('ana'), now());
  assert r ->> 'result' = 'compra_desfeita' and r #>> '{purchase,description}' = 'Pão' and r #>> '{purchase,card_nickname}' = 'Cartão Azul'
     and r #>> '{space,kind}' = 'pessoal' and r ->> 'today' = '2026-11-09', 'desfaz a compra mais recente: ' || r::text;
  assert pg_temp.entries('Pão') = 0 and (pg_temp.msg(24)).undone_at is not null and (pg_temp.msg(32)).outcome = 'compra_desfeita'
     and (pg_temp.msg(32)).entry_id = (select id from public.card_entries where description = 'Pão'), 'a compra saiu, a mensagem foi marcada e a de desfazer guarda o lançamento';
  assert exists (select 1 from public.record_operations where action = 'excluir_lancamento_cartao' and actor_id = pg_temp.id('ana')
                  and idempotency_key = 'telegram:' || md5(pg_temp.tm('ana', 32))), 'passa pela delete_card_entry com a chave do canal';
  -- Pelo WhatsApp (não ligado) não desfaz o que foi pelo Telegram.
  assert public.whatsapp_undo('cc-wa-0001', pg_temp.ph('5521900000099'), now()) = '{"result": "nao_ligado"}', 'outro canal, não ligado';
  -- Em ordem: Padaria (22), Mercado (21), Padaria (13), Farmácia (12); depois, nada.
  assert public.telegram_undo(pg_temp.tm('ana', 33), pg_temp.th('ana'), now()) #>> '{purchase,description}' = 'Padaria', 'a compra 22';
  assert public.telegram_undo(pg_temp.tm('ana', 34), pg_temp.th('ana'), now()) #>> '{purchase,card_nickname}' = 'Roxo', 'a compra 21, mesmo com o cartão arquivado';
  assert public.telegram_undo(pg_temp.tm('ana', 35), pg_temp.th('ana'), now()) #>> '{purchase,amount_cents}' = '1250', 'a compra 13';
  assert public.telegram_undo(pg_temp.tm('ana', 36), pg_temp.th('ana'), now()) #>> '{purchase,description}' = 'Farmácia', 'a compra 12';
  assert public.telegram_undo(pg_temp.tm('ana', 37), pg_temp.th('ana'), now()) = '{"result": "nada_para_desfazer"}', 'nada mais';
  assert (select count(*) from public.card_entries where context_id = pg_temp.id('ana_ctx') and deleted_at is null) = 0, 'nenhum lançamento vivo';
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 7. Exclusão em cascata: apagar o lançamento de vez apaga a referência da mensagem (nada fica apontando para o nada).
-- ---------------------------------------------------------------------------
do $$ begin
  delete from public.card_entries where description = 'Farmácia';
  assert not exists (select 1 from public.chat_messages where message_id in (pg_temp.tm('ana', 12), pg_temp.tm('ana', 36))), 'as mensagens da compra saíram junto';
end $$;

rollback;
