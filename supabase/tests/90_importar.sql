-- Importar extrato e fatura (D-048, migração 0012): import_records, import_key em financial_records e card_entries, a visão
-- import_items, a ação 'importar_extrato' em record_operations (com import_result), gatilhos de proteção, restrições e privilégios.
-- Pessoas FICTÍCIAS: Iris (sequência, hoje 07/10/2026; titular da Família da Iris), Joel (Família, só leitura), Kátia (Família,
-- escreve sem "editar de outras pessoas"), Lia (externa; sua atividade começa na importação), Nina (segundo contexto: cartão e chaves de outro contexto) e Otto (limite de
-- lançamentos do cartão). Valores em centavos. O arquivo nunca chega ao banco: só as linhas escolhidas e o resumo de cada uma.
\set iris   '''00000000-0000-0000-0000-0000000000a9'''
\set joel   '''00000000-0000-0000-0000-0000000000b9'''
\set katia  '''00000000-0000-0000-0000-0000000000c9'''
\set lia    '''00000000-0000-0000-0000-0000000000d9'''
\set nina   '''00000000-0000-0000-0000-0000000000e9'''
\set otto   '''00000000-0000-0000-0000-0000000000f9'''

begin;
set local clarevo.today = '2026-10-07';

create function pg_temp.expect_error(p_sql text, p_pattern text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm like p_pattern then return; end if;
    raise exception 'esperado "%", veio "%" (%) em: %', p_pattern, sqlerrm, sqlstate, p_sql;
  end;
  raise exception 'esperado erro "%", mas passou: %', p_pattern, p_sql;
end $$;

-- Exige o erro exato: mensagem, SQLSTATE e detalhe (vazio quando não há).
create function pg_temp.expect_code(p_sql text, p_code text, p_state text, p_detail text default '') returns void
language plpgsql as $$
declare
  v_detail text;
begin
  begin
    execute p_sql;
  exception when others then
    get stacked diagnostics v_detail = pg_exception_detail;
    if sqlerrm = p_code and sqlstate = p_state and coalesce(v_detail, '') = coalesce(p_detail, '') then return; end if;
    raise exception 'esperado % (%, "%"), veio "%" (%, "%") em: %', p_code, p_state, p_detail, sqlerrm, sqlstate, v_detail, left(p_sql, 300);
  end;
  raise exception 'esperado erro %, mas passou: %', p_code, left(p_sql, 300);
end $$;

create temp table ids (name text primary key, id uuid);
grant select, insert on ids to authenticated;
create function pg_temp.id(p_name text) returns uuid language sql as $$ select id from ids where name = p_name $$;
create function pg_temp.as_(p_name text) returns text language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(pg_temp.id(p_name)::text, ''), true)
$$;
create function pg_temp.check_links() returns void language plpgsql as $$
begin
  set constraints all immediate;
  set constraints all deferred;
end $$;

-- A chave da linha, como o aparelho a calcula: SHA-256 em hexadecimal de um texto (aqui, um nome qualquer).
create function pg_temp.k(p_name text) returns text language sql immutable as $$
  select encode(sha256(convert_to(p_name, 'UTF8')), 'hex')
$$;
-- Um item do lote: chave (nome), tipo, valor, dia, descrição e categoria.
create function pg_temp.it(p_key text, p_kind text, p_amount bigint, p_on date, p_desc text, p_cat text default null) returns jsonb language sql as $$
  select jsonb_build_object('import_key', pg_temp.k(p_key), 'kind', p_kind, 'amount_cents', p_amount, 'occurred_on', p_on,
                            'description', p_desc, 'category', p_cat)
$$;
-- A chamada como texto (para expect_code).
create function pg_temp.imp(p_key text, p_ctx uuid, p_dest text, p_target uuid, p_items jsonb) returns text language sql as $$
  select format('select public.import_records(%L, %L, %L, %L, %L::jsonb)', p_key, p_ctx, p_dest, p_target, p_items::text)
$$;
create function pg_temp.totals(p_ctx text, p_month date) returns bigint[] language sql as $$
  select array[received_cents, paid_cents, difference_cents] from public.month_totals(pg_temp.id(p_ctx), p_month)
$$;
create function pg_temp.to_pay(p_ctx text, p_month date) returns bigint[] language sql as $$
  select array[due_in_month_cents, overdue_before_cents, to_pay_cents, open_count] from public.month_to_pay(pg_temp.id(p_ctx), p_month)
$$;
-- O que existe, sem a RLS (gastos, contas a pagar e lançamentos de cartão).
create function pg_temp.state() returns text language sql security definer set search_path = public, pg_temp as $$
  select format('%s %s %s %s', (select count(*) from public.financial_records), (select count(*) from public.commitments),
                (select count(*) from public.card_entries), (select count(*) from public.record_operations))
$$;
-- Gastos importados de um contexto: "tipo valor dia descrição categoria" por linha, em ordem.
create function pg_temp.rec_lines(p_ctx text) returns text language sql security definer set search_path = public, pg_temp as $$
  select string_agg(format('%s %s %s %s %s', kind, amount_cents, occurred_on, description, coalesce(category, '-')), ' | '
                    order by occurred_on, amount_cents, description)
    from public.financial_records where context_id = pg_temp.id(p_ctx) and import_key is not null and deleted_at is null
$$;
-- Lançamentos de cartão importados: "tipo valor fatura parcela/total dia descrição" por linha.
create function pg_temp.entry_lines(p_card text) returns text language sql security definer set search_path = public, pg_temp as $$
  select string_agg(format('%s %s %s %s/%s %s %s', kind, amount_cents, to_char(invoice_month, 'YYYY-MM'), coalesce(installment_number::text, '-'),
                           coalesce(installment_total::text, '-'), coalesce(purchased_on::text, '-'), coalesce(description, '-')), ' | '
                    order by invoice_month, amount_cents, description)
    from public.card_entries where card_id = pg_temp.id(p_card) and import_key is not null and deleted_at is null
$$;

insert into ids values ('iris', :iris), ('joel', :joel), ('katia', :katia), ('lia', :lia), ('nina', :nina), ('otto', :otto);
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  (:iris,  'iris@exemplo.test',  now(), '{"display_name":"Iris"}'),
  (:joel,  'joel@exemplo.test',  now(), '{"display_name":"Joel"}'),
  (:katia, 'katia@exemplo.test', now(), '{"display_name":"Kátia"}'),
  (:lia,   'lia@exemplo.test',   now(), '{"display_name":"Lia"}'),
  (:nina,  'nina@exemplo.test',  now(), '{"display_name":"Nina"}'),
  (:otto,  'otto@exemplo.test',  now(), '{"display_name":"Otto"}');

set role authenticated;
do $$
declare
  p text;
  space jsonb;
begin
  foreach p in array array['iris', 'joel', 'katia', 'lia', 'nina', 'otto'] loop
    perform pg_temp.as_(p);
    space := public.ensure_personal_space('Conta principal');
    insert into ids values (p || '_ctx', (space ->> 'context_id')::uuid), (p || '_acc', (space #>> '{account,id}')::uuid);
  end loop;
end $$;
reset role;

-- Família da Iris (Joel só lê; Kátia escreve sem "editar de outras pessoas"), preparada pelo backend.
with f as (
  insert into public.financial_contexts (kind, name, owner_person_id) values ('familia', 'Família da Iris', :iris) returning id
) insert into ids select 'fam', id from f;
insert into public.context_memberships (context_id, person_id, role, can_read, can_write, can_edit_others)
  select id, :iris::uuid, 'titular'::public.membership_role, true, true, true from ids where name = 'fam'
  union all
  select id, :joel::uuid, 'membro'::public.membership_role, true, false, false from ids where name = 'fam'
  union all
  select id, :katia::uuid, 'membro'::public.membership_role, true, true, false from ids where name = 'fam';
with a as (
  insert into public.financial_accounts (context_id, name, created_by) select id, 'Conta da casa', :iris from ids where name = 'fam' returning id
) insert into ids select 'fam_acc', id from a;

-- ---------------------------------------------------------------------------
-- 1. Estrutura: colunas, restrições, índices únicos, guardas e a visão (como superusuário, sem passar pelas funções).
-- ---------------------------------------------------------------------------
do $$
declare
  r uuid := gen_random_uuid();
  c uuid := gen_random_uuid();
  ctx uuid := pg_temp.id('iris_ctx');
  acc uuid := pg_temp.id('iris_acc');
  k1 text := pg_temp.k('estrutura-1');
  k2 text := pg_temp.k('estrutura-2');
  card uuid;
begin
  assert (select data_type from information_schema.columns where table_name = 'financial_records' and column_name = 'import_key') = 'text'
     and (select data_type from information_schema.columns where table_name = 'card_entries' and column_name = 'import_key') = 'text'
     and (select data_type from information_schema.columns where table_name = 'record_operations' and column_name = 'import_result') = 'jsonb',
    'as três colunas novas';
  assert not exists (select 1 from public.financial_records where import_key is not null) and not exists (select 1 from public.card_entries where import_key is not null),
    'nada importado antes: nenhuma conta ganha linhas de exemplo';

  -- Forma da chave: 64 hexadecimais minúsculos.
  perform pg_temp.expect_error(format($f$insert into public.financial_records (context_id, account_id, kind, amount_cents, currency, occurred_on, description, created_by, import_key)
    values (%L, %L, 'despesa', 100, 'BRL', '2026-10-01', 'x', %L, 'abc')$f$, ctx, acc, pg_temp.id('iris')), '%financial_records_import_key%');
  perform pg_temp.expect_error(format($f$insert into public.financial_records (context_id, account_id, kind, amount_cents, currency, occurred_on, description, created_by, import_key)
    values (%L, %L, 'despesa', 100, 'BRL', '2026-10-01', 'x', %L, %L)$f$, ctx, acc, pg_temp.id('iris'), upper(k1)), '%financial_records_import_key%');
  insert into public.financial_records (id, context_id, account_id, kind, amount_cents, currency, occurred_on, description, created_by, import_key)
  values (r, ctx, acc, 'despesa', 100, 'BRL', '2026-10-01', 'Estrutura', pg_temp.id('iris'), k1);
  -- Única por contexto entre linhas vivas; a exclusão libera a chave.
  perform pg_temp.expect_error(format($f$insert into public.financial_records (context_id, account_id, kind, amount_cents, currency, occurred_on, description, created_by, import_key)
    values (%L, %L, 'despesa', 100, 'BRL', '2026-10-01', 'y', %L, %L)$f$, ctx, acc, pg_temp.id('iris'), k1), '%financial_records_import_key%');
  update public.financial_records set deleted_at = now(), deleted_by = pg_temp.id('iris') where id = r;
  insert into public.financial_records (context_id, account_id, kind, amount_cents, currency, occurred_on, description, created_by, import_key)
  values (ctx, acc, 'despesa', 100, 'BRL', '2026-10-01', 'de novo', pg_temp.id('iris'), k1);
  -- Outro contexto pode ter a mesma chave (a chave leva a conta, então na prática não repete, mas a regra é por contexto).
  insert into public.financial_records (context_id, account_id, kind, amount_cents, currency, occurred_on, description, created_by, import_key)
  values (pg_temp.id('nina_ctx'), pg_temp.id('nina_acc'), 'despesa', 100, 'BRL', '2026-10-01', 'outro contexto', pg_temp.id('nina'), k1);
  -- A chave é imutável (guarda), em gasto e em lançamento.
  perform pg_temp.expect_code(format($f$update public.financial_records set import_key = %L where context_id = %L and import_key = %L and deleted_at is null$f$, k2, ctx, k1),
    'campo_imutavel', '42501');
  perform pg_temp.expect_code(format($f$update public.financial_records set import_key = null where context_id = %L and import_key = %L and deleted_at is null$f$, ctx, k1),
    'campo_imutavel', '42501');
  -- Nunca em pagamento de conta ou de fatura (restrição): vale a forma do banco.
  perform pg_temp.expect_error(format($f$update public.financial_records set card_id = gen_random_uuid() where context_id = %L and import_key = %L and deleted_at is null$f$, ctx, k1), '%');

  -- Cartão: só na primeira parcela de uma compra e em estorno manual.
  perform pg_temp.as_('iris');
  card := (public.create_card('im-s-0001', ctx, 'Cartão Estrutura', null, 3, 10, null) #>> '{card,id}')::uuid;
  insert into ids values ('estrutura_card', card);
  insert into public.card_entries (id, context_id, card_id, kind, invoice_month, amount_cents, description, purchase_id, purchased_on,
                                   installment_number, installment_total, purchase_total_cents, created_by, import_key)
  values (c, ctx, card, 'parcela', '2026-11-01', 3000, 'Compra', c, '2026-10-05', 1, 1, 3000, pg_temp.id('iris'), k1);
  perform pg_temp.expect_error(format($f$insert into public.card_entries (context_id, card_id, kind, invoice_month, amount_cents, charge_kind, created_by, import_key)
    values (%L, %L, 'encargo', '2026-11-01', 100, 'tarifa', %L, %L)$f$, ctx, card, pg_temp.id('iris'), k2), '%card_entries_import_key%');
  perform pg_temp.expect_error(format($f$insert into public.card_entries (context_id, card_id, kind, invoice_month, amount_cents, description, purchase_id, purchased_on,
      installment_number, installment_total, purchase_total_cents, created_by, import_key)
    values (%L, %L, 'parcela', '2026-12-01', 1000, 'Parcela 2', %L, '2026-10-05', 2, 3, 3000, %L, %L)$f$, ctx, card, c, pg_temp.id('iris'), k2), '%card_entries_import_key%');
  perform pg_temp.expect_error(format($f$insert into public.card_entries (context_id, card_id, kind, invoice_month, amount_cents, description, created_by, import_key)
    values (%L, %L, 'estorno', '2026-11-01', 500, 'Estorno', %L, 'xyz')$f$, ctx, card, pg_temp.id('iris')), '%card_entries_import_key%');
  insert into public.card_entries (context_id, card_id, kind, invoice_month, amount_cents, description, created_by, import_key)
  values (ctx, card, 'estorno', '2026-11-01', 500, 'Estorno', pg_temp.id('iris'), k2);
  perform pg_temp.expect_error(format($f$insert into public.card_entries (context_id, card_id, kind, invoice_month, amount_cents, description, created_by, import_key)
    values (%L, %L, 'estorno', '2026-11-01', 700, 'Outro estorno', %L, %L)$f$, ctx, card, pg_temp.id('iris'), k2), '%card_entries_import_key%');
  perform pg_temp.expect_code(format($f$update public.card_entries set import_key = %L, version = version + 1 where id = %L$f$, pg_temp.k('outra'), c), 'campo_imutavel', '42501');
  -- A visão import_items (uma linha por gasto, compra ou estorno vivos com chave).
  set constraints all deferred;
  assert (select count(*) from public.import_items where context_id = ctx) = 3, 'import_items sem a RLS de superusuário vê as três linhas vivas do contexto';
  delete from public.card_entries where card_id = card;
  delete from public.cards where id = card;
  delete from public.financial_records where context_id in (ctx, pg_temp.id('nina_ctx')) and import_key is not null;
end $$;
select pg_temp.check_links();

do $$ begin
  assert (select array_agg(attname::text order by attnum) from pg_attribute where attrelid = 'public.import_items'::regclass and attnum > 0 and not attisdropped)
    = array['context_id', 'import_key', 'record_id', 'card_entry_id', 'card_id'], 'colunas de import_items';
  assert (select array_agg(format_type(atttypid, atttypmod) order by attnum) from pg_attribute where attrelid = 'public.import_items'::regclass and attnum > 0 and not attisdropped)
    = array['uuid', 'text', 'uuid', 'uuid', 'uuid'], 'tipos de import_items';
  assert to_regprocedure('public.import_records(text, uuid, text, uuid, jsonb)') is not null, 'a assinatura de import_records';
  assert (select prosecdef from pg_proc where oid = 'public.import_records(text, uuid, text, uuid, jsonb)'::regprocedure), 'import_records é definer';
  -- As assinaturas existentes não mudaram (o app publicado antes da 0012 segue funcionando).
  assert to_regprocedure('public.create_record(text, uuid, uuid, public.record_kind, bigint, date, text, text, text)') is not null
     and to_regprocedure('public.add_card_purchase(text, uuid, date, bigint, integer, text, text, text)') is not null
     and to_regprocedure('public.add_card_refund(text, uuid, date, bigint, text, text)') is not null
     and to_regprocedure('public.update_record(text, uuid, integer, uuid, bigint, date, text, text)') is not null
     and to_regprocedure('public.pay_invoice(text, uuid, date, integer, bigint, date, uuid)') is not null, 'assinaturas anteriores intactas';
  -- record_operations: import_result só na importação, e sempre nela.
  assert (select count(*) from pg_constraint where conname = 'record_operations_import_check') = 1, 'restrição de import_result';
  perform pg_temp.expect_error(format($f$insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, import_result)
    values (%L, 'im-op-0001', 'criar', gen_random_uuid(), 'x', gen_random_uuid(), '{"created":1,"skipped":0}')$f$, pg_temp.id('iris')), '%record_operations_import_check%');
  perform pg_temp.expect_error(format($f$insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, target_id)
    values (%L, 'im-op-0002', 'importar_extrato', gen_random_uuid(), 'x', gen_random_uuid())$f$, pg_temp.id('iris')), '%record_operations_import_check%');
  perform pg_temp.expect_error(format($f$insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, import_result)
    values (%L, 'im-op-0003', 'importar_extrato', gen_random_uuid(), 'x', '{"created":1,"skipped":0}')$f$, pg_temp.id('iris')), '%record_operations_target_check%');
  perform pg_temp.expect_error(format($f$insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, target_id, record_id, import_result)
    values (%L, 'im-op-0004', 'importar_extrato', gen_random_uuid(), 'x', gen_random_uuid(), gen_random_uuid(), '{"created":1,"skipped":0}')$f$, pg_temp.id('iris')), '%record_operations_target_check%');
end $$;

-- ---------------------------------------------------------------------------
-- 2. Validação do pedido (Iris, conta): sessão, chave, destino, itens, permissão e conta, nessa ordem; recusa não grava nada.
-- ---------------------------------------------------------------------------
set role authenticated;
do $$
declare
  ctx uuid := pg_temp.id('iris_ctx');
  acc uuid := pg_temp.id('iris_acc');
  one jsonb := jsonb_build_array(pg_temp.it('v1', 'despesa', 1000, '2026-10-01', 'Padaria'));
  many jsonb;
  s0 text;
begin
  perform pg_temp.as_('ninguem');
  perform pg_temp.expect_code(pg_temp.imp('im-v-0001', ctx, 'conta', acc, one), 'nao_autenticado', '42501');
  perform pg_temp.as_('iris');
  s0 := pg_temp.state();
  perform pg_temp.expect_code(pg_temp.imp('curta', ctx, 'conta', acc, one), 'chave_invalida', '22023');
  perform pg_temp.expect_code(format($f$select public.import_records(null, %L, 'conta', %L, %L::jsonb)$f$, ctx, acc, one::text), 'chave_invalida', '22023');
  perform pg_temp.expect_code(pg_temp.imp(repeat('k', 81), ctx, 'conta', acc, one), 'chave_invalida', '22023');
  -- Destino: conta ou cartao.
  perform pg_temp.expect_code(pg_temp.imp('im-v-0010', ctx, 'banco', acc, one), 'destino_invalido', '22023');
  perform pg_temp.expect_code(pg_temp.imp('im-v-0011', ctx, 'Conta', acc, one), 'destino_invalido', '22023');
  perform pg_temp.expect_code(format($f$select public.import_records('im-v-0012', %L, null, %L, %L::jsonb)$f$, ctx, acc, one::text), 'destino_invalido', '22023');
  -- Itens: um array de 1 a 500 itens (conferido antes da permissão, que vem em seguida).
  perform pg_temp.expect_code(format($f$select public.import_records('im-v-0020', %L, 'conta', %L, null)$f$, ctx, acc), 'itens_invalidos', '22023');
  perform pg_temp.expect_code(pg_temp.imp('im-v-0021', ctx, 'conta', acc, '[]'::jsonb), 'itens_invalidos', '22023');
  perform pg_temp.expect_code(pg_temp.imp('im-v-0022', ctx, 'conta', acc, '{}'::jsonb), 'itens_invalidos', '22023');
  perform pg_temp.expect_code(pg_temp.imp('im-v-0023', ctx, 'conta', acc, '"x"'::jsonb), 'itens_invalidos', '22023');
  select jsonb_agg(pg_temp.it('m' || n, 'despesa', 100, '2026-10-01', 'Linha ' || n)) into many from generate_series(1, 501) n;
  perform pg_temp.expect_code(pg_temp.imp('im-v-0024', ctx, 'conta', acc, many), 'itens_invalidos', '22023');
  perform pg_temp.expect_code(pg_temp.imp('im-v-0025', pg_temp.id('lia_ctx'), 'conta', acc, '[]'::jsonb), 'itens_invalidos', '22023');
  -- Permissão: contexto que não é dela ou não existe.
  perform pg_temp.expect_code(pg_temp.imp('im-v-0030', pg_temp.id('lia_ctx'), 'conta', pg_temp.id('lia_acc'), one), 'sem_permissao', '42501');
  perform pg_temp.expect_code(pg_temp.imp('im-v-0031', gen_random_uuid(), 'conta', acc, one), 'sem_permissao', '42501');
  -- Conta: a de outro contexto, uma que não existe e nula valem conta_invalida.
  perform pg_temp.expect_code(pg_temp.imp('im-v-0040', ctx, 'conta', pg_temp.id('nina_acc'), one), 'conta_invalida', '22023');
  perform pg_temp.expect_code(pg_temp.imp('im-v-0041', ctx, 'conta', gen_random_uuid(), one), 'conta_invalida', '22023');
  perform pg_temp.expect_code(format($f$select public.import_records('im-v-0042', %L, 'conta', null, %L::jsonb)$f$, ctx, one::text), 'conta_invalida', '22023');
  -- Cartão que não existe, ou de outro contexto: nao_encontrado.
  perform pg_temp.expect_code(pg_temp.imp('im-v-0043', ctx, 'cartao', gen_random_uuid(), one), 'nao_encontrado', 'P0002');
  reset role;
  assert pg_temp.state() = s0, 'recusas não gravam registro, conta a pagar, lançamento nem operação';
  set role authenticated;
  perform pg_temp.as_('iris');
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 3. Validação de cada item (conta), na ordem de create_record, com a posição do item no detalhe; nada é gravado.
-- ---------------------------------------------------------------------------
set role authenticated;
do $$
declare
  ctx uuid := pg_temp.id('iris_ctx');
  acc uuid := pg_temp.id('iris_acc');
  good jsonb := pg_temp.it('g1', 'despesa', 1000, '2026-10-01', 'Padaria');
  s0 text;
  function_ok boolean;
begin
  perform pg_temp.as_('iris');
  s0 := pg_temp.state();
  -- O 2º item é o que falha: o 1º, válido, também não é gravado (tudo ou nada), e o detalhe diz "item=2".
  perform pg_temp.expect_code(pg_temp.imp('im-i-0001', ctx, 'conta', acc, jsonb_build_array(good, '"texto"'::jsonb)), 'itens_invalidos', '22023', 'item=2');
  perform pg_temp.expect_code(pg_temp.imp('im-i-0002', ctx, 'conta', acc, jsonb_build_array(good, '{"kind":"despesa"}'::jsonb)), 'chave_de_importacao_invalida', '22023', 'item=2');
  perform pg_temp.expect_code(pg_temp.imp('im-i-0003', ctx, 'conta', acc, jsonb_build_array(good, jsonb_set(pg_temp.it('g2', 'despesa', 1000, '2026-10-01', 'x'), '{import_key}', '"ABC"'))),
    'chave_de_importacao_invalida', '22023', 'item=2');
  perform pg_temp.expect_code(pg_temp.imp('im-i-0004', ctx, 'conta', acc, jsonb_build_array(good, jsonb_set(pg_temp.it('g2', 'despesa', 1000, '2026-10-01', 'x'), '{import_key}', to_jsonb(repeat('a', 63))))),
    'chave_de_importacao_invalida', '22023', 'item=2');
  perform pg_temp.expect_code(pg_temp.imp('im-i-0005', ctx, 'conta', acc, jsonb_build_array(good, jsonb_set(pg_temp.it('g2', 'despesa', 1000, '2026-10-01', 'x'), '{import_key}', 'null'))),
    'chave_de_importacao_invalida', '22023', 'item=2');
  -- Tipo: despesa ou receita (compra e estorno são do cartão).
  perform pg_temp.expect_code(pg_temp.imp('im-i-0010', ctx, 'conta', acc, jsonb_build_array(pg_temp.it('g2', 'compra', 1000, '2026-10-01', 'x'))), 'tipo_invalido', '22023', 'item=1');
  perform pg_temp.expect_code(pg_temp.imp('im-i-0011', ctx, 'conta', acc, jsonb_build_array(pg_temp.it('g2', 'estorno', 1000, '2026-10-01', 'x'))), 'tipo_invalido', '22023', 'item=1');
  perform pg_temp.expect_code(pg_temp.imp('im-i-0012', ctx, 'conta', acc, jsonb_build_array(pg_temp.it('g2', 'Despesa', 1000, '2026-10-01', 'x'))), 'tipo_invalido', '22023', 'item=1');
  perform pg_temp.expect_code(pg_temp.imp('im-i-0013', ctx, 'conta', acc, jsonb_build_array(jsonb_set(pg_temp.it('g2', 'despesa', 1000, '2026-10-01', 'x'), '{kind}', 'null'))), 'tipo_invalido', '22023', 'item=1');
  -- Valor: inteiro de 1 centavo a R$ 9.999.999,99.
  perform pg_temp.expect_code(pg_temp.imp('im-i-0020', ctx, 'conta', acc, jsonb_build_array(good, pg_temp.it('g2', 'despesa', 0, '2026-10-01', 'x'))), 'valor_invalido', '22023', 'item=2');
  perform pg_temp.expect_code(pg_temp.imp('im-i-0021', ctx, 'conta', acc, jsonb_build_array(pg_temp.it('g2', 'despesa', -5, '2026-10-01', 'x'))), 'valor_invalido', '22023', 'item=1');
  perform pg_temp.expect_code(pg_temp.imp('im-i-0022', ctx, 'conta', acc, jsonb_build_array(jsonb_set(pg_temp.it('g2', 'despesa', 1, '2026-10-01', 'x'), '{amount_cents}', '12.5'))), 'valor_invalido', '22023', 'item=1');
  perform pg_temp.expect_code(pg_temp.imp('im-i-0023', ctx, 'conta', acc, jsonb_build_array(jsonb_set(pg_temp.it('g2', 'despesa', 1, '2026-10-01', 'x'), '{amount_cents}', '"100"'))), 'valor_invalido', '22023', 'item=1');
  perform pg_temp.expect_code(pg_temp.imp('im-i-0024', ctx, 'conta', acc, jsonb_build_array(jsonb_set(pg_temp.it('g2', 'despesa', 1, '2026-10-01', 'x'), '{amount_cents}', 'null'))), 'valor_invalido', '22023', 'item=1');
  perform pg_temp.expect_code(pg_temp.imp('im-i-0025', ctx, 'conta', acc, jsonb_build_array(pg_temp.it('g2', 'despesa', 1000000000, '2026-10-01', 'x'))), 'valor_acima_do_limite', '22023', 'item=1');
  perform pg_temp.expect_code(pg_temp.imp('im-i-0026', ctx, 'conta', acc, jsonb_build_array(jsonb_set(pg_temp.it('g2', 'despesa', 1, '2026-10-01', 'x'), '{amount_cents}', '99999999999999999999'))), 'valor_invalido', '22023', 'item=1');
  -- Descrição: de 1 a 80 caracteres depois de aparar; categoria até 40.
  perform pg_temp.expect_code(pg_temp.imp('im-i-0030', ctx, 'conta', acc, jsonb_build_array(pg_temp.it('g2', 'despesa', 100, '2026-10-01', ''))), 'descricao_obrigatoria', '22023', 'item=1');
  perform pg_temp.expect_code(pg_temp.imp('im-i-0031', ctx, 'conta', acc, jsonb_build_array(pg_temp.it('g2', 'despesa', 100, '2026-10-01', E'  \t '))), 'descricao_obrigatoria', '22023', 'item=1');
  perform pg_temp.expect_code(pg_temp.imp('im-i-0032', ctx, 'conta', acc, jsonb_build_array(jsonb_set(pg_temp.it('g2', 'despesa', 100, '2026-10-01', 'x'), '{description}', 'null'))), 'descricao_obrigatoria', '22023', 'item=1');
  perform pg_temp.expect_code(pg_temp.imp('im-i-0033', ctx, 'conta', acc, jsonb_build_array(pg_temp.it('g2', 'despesa', 100, '2026-10-01', repeat('x', 81)))), 'descricao_longa', '22023', 'item=1');
  perform pg_temp.expect_code(pg_temp.imp('im-i-0034', ctx, 'conta', acc, jsonb_build_array(pg_temp.it('g2', 'despesa', 100, '2026-10-01', 'x', repeat('c', 41)))), 'categoria_invalida', '22023', 'item=1');
  -- Dia: data civil válida, até hoje (07/10/2026).
  perform pg_temp.expect_code(pg_temp.imp('im-i-0040', ctx, 'conta', acc, jsonb_build_array(pg_temp.it('g2', 'despesa', 100, '2026-10-08', 'x'))), 'data_futura', '22023', 'item=1');
  perform pg_temp.expect_code(pg_temp.imp('im-i-0041', ctx, 'conta', acc, jsonb_build_array(jsonb_set(pg_temp.it('g2', 'despesa', 100, '2026-10-01', 'x'), '{occurred_on}', '"2026-02-30"'))), 'data_invalida', '22023', 'item=1');
  perform pg_temp.expect_code(pg_temp.imp('im-i-0042', ctx, 'conta', acc, jsonb_build_array(jsonb_set(pg_temp.it('g2', 'despesa', 100, '2026-10-01', 'x'), '{occurred_on}', '"07/10/2026"'))), 'data_invalida', '22023', 'item=1');
  perform pg_temp.expect_code(pg_temp.imp('im-i-0043', ctx, 'conta', acc, jsonb_build_array(jsonb_set(pg_temp.it('g2', 'despesa', 100, '2026-10-01', 'x'), '{occurred_on}', 'null'))), 'data_invalida', '22023', 'item=1');
  perform pg_temp.expect_code(pg_temp.imp('im-i-0044', ctx, 'conta', acc, jsonb_build_array(jsonb_set(pg_temp.it('g2', 'despesa', 100, '2026-10-01', 'x'), '{occurred_on}', '20261001'))), 'data_invalida', '22023', 'item=1');
  -- A ordem de create_record: com valor e descrição inválidos juntos, vale o valor; com data e descrição, a descrição.
  perform pg_temp.expect_code(pg_temp.imp('im-i-0050', ctx, 'conta', acc, jsonb_build_array(pg_temp.it('g2', 'despesa', 0, '2026-10-08', ''))), 'valor_invalido', '22023', 'item=1');
  perform pg_temp.expect_code(pg_temp.imp('im-i-0051', ctx, 'conta', acc, jsonb_build_array(pg_temp.it('g2', 'despesa', 100, '2026-10-08', ''))), 'descricao_obrigatoria', '22023', 'item=1');
  perform pg_temp.expect_code(pg_temp.imp('im-i-0052', ctx, 'conta', acc, jsonb_build_array(jsonb_set(pg_temp.it('g2', 'despesa', 100, '2026-10-01', ''), '{occurred_on}', '"abc"'))), 'descricao_obrigatoria', '22023', 'item=1');
  -- O item ruim é o último de um lote grande: o detalhe aponta a posição, e nada do lote é gravado.
  perform pg_temp.expect_code(pg_temp.imp('im-i-0060', ctx, 'conta', acc,
    (select jsonb_agg(pg_temp.it('big' || n, 'despesa', 100, '2026-10-01', 'Linha ' || n) order by n) || jsonb_build_array(pg_temp.it('bigx', 'despesa', 0, '2026-10-01', 'x'))
       from generate_series(1, 499) n)), 'valor_invalido', '22023', 'item=500');
  reset role;
  assert pg_temp.state() = s0, 'nenhum item recusado deixa rastro (nem registro, nem operação)';
  set role authenticated;
  perform pg_temp.as_('iris');
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 4. Importar para a conta (Iris): criados, pulados, operação, repetição, conflito de chave e exclusão que libera a chave.
-- ---------------------------------------------------------------------------
create function pg_temp.rec_by(p_ctx text, p_desc text) returns public.financial_records language sql security definer set search_path = public, pg_temp as $$
  select * from public.financial_records where context_id = pg_temp.id(p_ctx) and description = p_desc and deleted_at is null and import_key is not null
$$;

-- Linhas com a chave (todas e vivas), sem a RLS: "total vivas".
create function pg_temp.key_rows(p_name text) returns text language sql security definer set search_path = public, pg_temp as $$
  select format('%s %s', count(*), count(*) filter (where deleted_at is null)) from public.financial_records where import_key = pg_temp.k(p_name)
$$;

set role authenticated;
do $$
declare
  ctx uuid := pg_temp.id('iris_ctx');
  acc uuid := pg_temp.id('iris_acc');
  items jsonb;
  res jsonb;
  pay0 bigint[];
  v_state text;
begin
  perform pg_temp.as_('iris');
  assert pg_temp.totals('iris_ctx', '2026-10-01') = array[0, 0, 0]::bigint[] and pg_temp.totals('iris_ctx', '2026-09-01') = array[0, 0, 0]::bigint[],
    'setembro e outubro da Iris começam zerados';
  pay0 := pg_temp.to_pay('iris_ctx', '2026-10-01');
  items := jsonb_build_array(
    pg_temp.it('a1', 'despesa', 4590, '2026-10-02', E'  Padaria  Pão Quente \n', 'Mercado'),
    pg_temp.it('a2', 'despesa', 12000, '2026-10-03', 'Posto de combustível', 'Transporte'),
    pg_temp.it('a3', 'receita', 500000, '2026-10-05', 'Salário', 'Salário'),
    pg_temp.it('a4', 'despesa', 3500, '2026-09-28', 'Farmácia', ''),
    pg_temp.it('a5', 'despesa', 999, '2026-09-30', 'Tarifa', null));
  res := public.import_records('im-a-0001', ctx, 'conta', acc, items);
  assert res = '{"created": 5, "skipped": 0}'::jsonb, 'cinco criados, nenhum pulado';
  assert pg_temp.rec_lines('iris_ctx') =
    'despesa 3500 2026-09-28 Farmácia - | despesa 999 2026-09-30 Tarifa - | despesa 4590 2026-10-02 Padaria  Pão Quente Mercado | despesa 12000 2026-10-03 Posto de combustível Transporte | receita 500000 2026-10-05 Salário Salário',
    'os registros: descrição aparada nas pontas, categoria vazia vira sem categoria, tipo e dia do item';
  assert (select bool_and(account_id = acc and created_by = pg_temp.id('iris') and commitment_id is null and card_id is null and receipt_key is null and version = 1
                          and import_key ~ '^[0-9a-f]{64}$' and currency = 'BRL')
            from public.financial_records where import_key is not null), 'todos na conta escolhida, de autoria da sessão, sem vínculo, versão 1';
  assert (select import_key from pg_temp.rec_by('iris_ctx', 'Farmácia')) = pg_temp.k('a4'), 'a chave gravada é a do item';
  -- D-021: o gasto da conta entra em Pago no dia dele; o recebimento em Recebido; nada vai para Ainda a pagar.
  assert pg_temp.totals('iris_ctx', '2026-10-01') = array[500000, 16590, 483410]::bigint[], 'outubro: recebido 5.000,00, pago 165,90';
  assert pg_temp.totals('iris_ctx', '2026-09-01') = array[0, 4499, -4499]::bigint[], 'setembro: pago 44,99 (3.500 e 999)';
  assert pg_temp.to_pay('iris_ctx', '2026-10-01') = pay0, 'Ainda a pagar não muda';
  -- A operação: ação, destino e resultado; sem registro nem conta a pagar apontados.
  assert (select (action, target_id, record_id, commitment_id, entry_id, context_id, import_result)::text
            from public.record_operations where idempotency_key = 'im-a-0001' and actor_id = pg_temp.id('iris'))
       = (select ('importar_extrato', acc, null::uuid, null::uuid, null::uuid, ctx, '{"created": 5, "skipped": 0}'::jsonb)::text), 'a operação gravada';

  -- Repetição (mesma chave, mesmo conteúdo): devolve o resultado gravado, sem escrever.
  v_state := pg_temp.state();
  assert public.import_records('im-a-0001', ctx, 'conta', acc, items) = res, 'a repetição devolve o mesmo resultado';
  assert pg_temp.state() = v_state, 'a repetição não grava nada';
  -- Mesma chave com outro conteúdo, outro destino ou outra ação: chave_reutilizada.
  perform pg_temp.expect_code(pg_temp.imp('im-a-0001', ctx, 'conta', acc, items - 4), 'chave_reutilizada', 'PT409');
  perform pg_temp.expect_code(pg_temp.imp('im-a-0001', ctx, 'conta', pg_temp.id('iris_acc'), jsonb_build_array(pg_temp.it('a1', 'despesa', 4591, '2026-10-02', 'Padaria', 'Mercado'))),
    'chave_reutilizada', 'PT409');
  perform pg_temp.expect_code(format($f$select public.create_record('im-a-0001', %L, %L, 'despesa', 100, '2026-10-01', 'x', null, null)$f$, ctx, acc), 'chave_reutilizada', 'PT409');
  perform public.create_record('im-a-0002', ctx, acc, 'despesa', 100, '2026-10-01', 'Avulso', null, null);
  perform pg_temp.expect_code(pg_temp.imp('im-a-0002', ctx, 'conta', acc, items), 'chave_reutilizada', 'PT409');

  -- Mesmo arquivo importado de novo com outra chave de operação: todas as linhas já existem e são puladas.
  assert public.import_records('im-a-0003', ctx, 'conta', acc, items) = '{"created": 0, "skipped": 5}'::jsonb, 'tudo pulado';
  assert (select count(*) from public.financial_records where import_key is not null) = 5, 'nenhum registro a mais';
  -- Metade nova: pula as que existem. Um item pulado não é validado (valor 0, mas a chave já existe).
  res := public.import_records('im-a-0004', ctx, 'conta', acc, jsonb_build_array(
    pg_temp.it('a1', 'despesa', 0, '2026-10-02', '', null), pg_temp.it('a2', 'despesa', 12000, '2026-10-03', 'Posto de combustível', 'Transporte'),
    pg_temp.it('a6', 'despesa', 2500, '2026-10-06', 'Lanche', 'Lazer')));
  assert res = '{"created": 1, "skipped": 2}'::jsonb, 'um criado, dois pulados';
  -- A mesma chave duas vezes no mesmo lote: o segundo é pulado.
  res := public.import_records('im-a-0005', ctx, 'conta', acc, jsonb_build_array(pg_temp.it('a7', 'despesa', 700, '2026-10-06', 'Bala'), pg_temp.it('a7', 'despesa', 700, '2026-10-06', 'Bala')));
  assert res = '{"created": 1, "skipped": 1}'::jsonb, 'chave repetida no lote: um criado, um pulado';
  -- Editar o registro importado mantém a chave (reimportar continua pulando); excluir libera a chave.
  perform public.update_record('im-a-0006', (pg_temp.rec_by('iris_ctx', 'Bala')).id, 1, acc, 750, '2026-10-06', 'Bala de menta', 'Lazer');
  assert (select import_key from pg_temp.rec_by('iris_ctx', 'Bala de menta')) = pg_temp.k('a7') and (select version from pg_temp.rec_by('iris_ctx', 'Bala de menta')) = 2,
    'a edição mantém a chave';
  assert public.import_records('im-a-0007', ctx, 'conta', acc, jsonb_build_array(pg_temp.it('a7', 'despesa', 700, '2026-10-06', 'Bala'))) = '{"created": 0, "skipped": 1}'::jsonb,
    'depois de editar, a linha continua "já anotada"';
  perform public.delete_record('im-a-0008', (pg_temp.rec_by('iris_ctx', 'Bala de menta')).id, 2);
  assert public.import_records('im-a-0009', ctx, 'conta', acc, jsonb_build_array(pg_temp.it('a7', 'despesa', 700, '2026-10-06', 'Bala'))) = '{"created": 1, "skipped": 0}'::jsonb,
    'depois de excluir, a mesma linha pode ser importada de novo';
  assert pg_temp.key_rows('a7') = '2 1', 'a excluída fica como rastro; só uma viva';
  -- A mesma chave em outra conta do mesmo contexto: única por contexto, então também é pulada.
  declare
    other uuid := (public.create_account('im-a-0010', ctx, 'Carteira', 'dinheiro') ->> 'id')::uuid;
  begin
    assert public.import_records('im-a-0011', ctx, 'conta', other, jsonb_build_array(pg_temp.it('a1', 'despesa', 4590, '2026-10-02', 'Padaria'))) = '{"created": 0, "skipped": 1}'::jsonb,
      'chave única por contexto';
    assert public.import_records('im-a-0012', ctx, 'conta', other, jsonb_build_array(pg_temp.it('w1', 'despesa', 1800, '2026-10-02', 'Banca'))) = '{"created": 1, "skipped": 0}'::jsonb,
      'a conta escolhida recebe';
    assert (select account_id from pg_temp.rec_by('iris_ctx', 'Banca')) = other, 'o registro ficou na Carteira';
    -- Conta arquivada não recebe importação.
    perform public.set_account_status('im-a-0013', other, 1, 'arquivada');
    perform pg_temp.expect_code(pg_temp.imp('im-a-0014', ctx, 'conta', other, jsonb_build_array(pg_temp.it('w2', 'despesa', 100, '2026-10-02', 'x'))), 'conta_invalida', '22023');
    -- Excluir a conta com lançamentos continua recusado (os importados contam como lançamentos).
    perform pg_temp.expect_code(format($f$select public.delete_account('im-a-0015', %L, 2)$f$, other), 'conta_com_lancamentos', 'PT409');
  end;
  -- Dia com horas e outros formatos já chegam como AAAA-MM-DD do aparelho; o banco só aceita esse.
  assert pg_temp.totals('iris_ctx', '2026-10-01') = array[500000, 16590 + 2500 + 700 + 1800 + 100, 500000 - (16590 + 2500 + 700 + 1800 + 100)]::bigint[], 'os totais de outubro somam os importados vivos (sem a Bala excluída) e o gasto avulso de R$ 1,00';
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 5. Importar para o cartão (Iris, fechamento dia 3, vencimento dia 10, hoje 07/10/2026).
-- ---------------------------------------------------------------------------
set role authenticated;
do $$
declare
  ctx uuid := pg_temp.id('iris_ctx');
  card uuid;
  card2 uuid;
  items jsonb;
  res jsonb;
  pay0 bigint[];
  tot0 bigint[];
  v_state text;
  v integer;
begin
  perform pg_temp.as_('iris');
  card := (public.create_card('im-c-0001', ctx, 'Cartão Exemplo', '4321', 3, 10, 500000) #>> '{card,id}')::uuid;
  insert into ids values ('iris_card', card);
  tot0 := pg_temp.totals('iris_ctx', '2026-10-01');
  pay0 := pg_temp.to_pay('iris_ctx', '2026-10-01');
  items := jsonb_build_array(
    pg_temp.it('c1', 'compra', 20000, '2026-09-20', 'Livro', 'Educação'),
    pg_temp.it('c2', 'compra', 8050, '2026-10-03', 'Mercado do bairro', 'Mercado'),
    pg_temp.it('c3', 'compra', 15990, '2026-10-04', 'Cinema', 'Lazer'),
    pg_temp.it('c4', 'compra', 3000, '2026-10-06', E' Café ', null),
    pg_temp.it('c5', 'estorno', 4000, '2026-10-05', 'Devolução do cinema', 'Lazer'));
  res := public.import_records('im-c-0010', ctx, 'cartao', card, items);
  assert res = '{"created": 5, "skipped": 0}'::jsonb, 'cinco criados no cartão';
  assert pg_temp.entry_lines('iris_card') =
    'parcela 8050 2026-10 1/1 2026-10-03 Mercado do bairro | parcela 20000 2026-10 1/1 2026-09-20 Livro | parcela 3000 2026-11 1/1 2026-10-06 Café | estorno 4000 2026-11 -/- - Devolução do cinema | parcela 15990 2026-11 1/1 2026-10-04 Cinema',
    'compras à vista na fatura da data (fechamento dia 3 entra na fatura de outubro) e o estorno na fatura da data';
  assert (select bool_and(import_key ~ '^[0-9a-f]{64}$' and created_by = pg_temp.id('iris') and version = 1 and receipt_key is null and charge_kind is null
                          and (kind <> 'parcela' or (purchase_id = id and purchase_total_cents = amount_cents))) from public.card_entries where import_key is not null),
    'a compra é a própria parcela 1 (id da compra), sem nota; versão 1';
  -- D-037: compra no cartão nunca entra em Pago; as contas das faturas são mantidas pela mesma transação.
  assert pg_temp.totals('iris_ctx', '2026-10-01') = tot0, 'Recebido, Pago e Diferença não mudam';
  assert (select array_agg(amount_cents order by invoice_month) from public.commitments where card_id = card and deleted_at is null) = array[28050, 14990]::bigint[],
    'faturas: outubro 280,50 e novembro 149,90 (159,90 + 30,00 - 40,00)';
  assert (select array_agg(total_cents order by month) from public.invoice_items where card_id = card) = array[28050, 14990]::bigint[], 'invoice_items confere';
  assert (pg_temp.to_pay('iris_ctx', '2026-10-01'))[3] - pay0[3] = 28050, 'Ainda a pagar de outubro cresce com a fatura de outubro';
  assert (select (action, target_id, import_result)::text from public.record_operations where idempotency_key = 'im-c-0010')
       = (select ('importar_extrato', card, '{"created": 5, "skipped": 0}'::jsonb)::text), 'a operação aponta para o cartão';
  assert (select count(*) from public.record_operations where action <> 'criar' and entry_id is not null and idempotency_key = 'im-c-0010') = 0, 'sem entry_id';
  -- Repetição e chave reutilizada.
  v_state := pg_temp.state();
  assert public.import_records('im-c-0010', ctx, 'cartao', card, items) = res, 'a repetição devolve o resultado';
  assert pg_temp.state() = v_state, 'sem escrita na repetição';
  perform pg_temp.expect_code(pg_temp.imp('im-c-0010', ctx, 'cartao', card, items - 0), 'chave_reutilizada', 'PT409');
  -- De novo com outra chave: tudo pulado. Compra e estorno têm chaves próprias.
  assert public.import_records('im-c-0011', ctx, 'cartao', card, items) = '{"created": 0, "skipped": 5}'::jsonb, 'tudo pulado';
  v_state := pg_temp.state();
  -- Tipo: despesa e receita são da conta; compra e estorno, do cartão.
  perform pg_temp.expect_code(pg_temp.imp('im-c-0012', ctx, 'cartao', card, jsonb_build_array(pg_temp.it('d1', 'despesa', 100, '2026-10-01', 'x'))), 'tipo_invalido', '22023', 'item=1');
  perform pg_temp.expect_code(pg_temp.imp('im-c-0013', ctx, 'cartao', card, jsonb_build_array(pg_temp.it('d1', 'receita', 100, '2026-10-01', 'x'))), 'tipo_invalido', '22023', 'item=1');
  -- Validação de add_card_purchase e add_card_refund, com a posição do item.
  perform pg_temp.expect_code(pg_temp.imp('im-c-0020', ctx, 'cartao', card, jsonb_build_array(pg_temp.it('d1', 'compra', 0, '2026-10-01', 'x'))), 'valor_invalido', '22023', 'item=1');
  perform pg_temp.expect_code(pg_temp.imp('im-c-0021', ctx, 'cartao', card, jsonb_build_array(pg_temp.it('d1', 'compra', 1000000000, '2026-10-01', 'x'))), 'valor_acima_do_limite', '22023', 'item=1');
  perform pg_temp.expect_code(pg_temp.imp('im-c-0022', ctx, 'cartao', card, jsonb_build_array(pg_temp.it('d1', 'compra', 100, '2026-10-01', ''))), 'descricao_obrigatoria', '22023', 'item=1');
  perform pg_temp.expect_code(pg_temp.imp('im-c-0023', ctx, 'cartao', card, jsonb_build_array(pg_temp.it('d1', 'compra', 100, '2026-10-01', repeat('x', 81)))), 'descricao_longa', '22023', 'item=1');
  perform pg_temp.expect_code(pg_temp.imp('im-c-0024', ctx, 'cartao', card, jsonb_build_array(pg_temp.it('d1', 'compra', 100, '2026-10-01', 'x', repeat('c', 41)))), 'categoria_invalida', '22023', 'item=1');
  perform pg_temp.expect_code(pg_temp.imp('im-c-0025', ctx, 'cartao', card, jsonb_build_array(pg_temp.it('d1', 'compra', 100, '2026-10-08', 'x'))), 'data_futura', '22023', 'item=1');
  perform pg_temp.expect_code(pg_temp.imp('im-c-0026', ctx, 'cartao', card, jsonb_build_array(pg_temp.it('d1', 'compra', 100, '2022-09-30', 'x'))), 'data_invalida', '22023', 'item=1');
  -- Estorno: a fatura é a da data; mais de 48 meses atrás é mes_invalido; data futura, data_futura.
  perform pg_temp.expect_code(pg_temp.imp('im-c-0030', ctx, 'cartao', card, jsonb_build_array(pg_temp.it('d1', 'estorno', 100, '2022-06-15', 'x'))), 'mes_invalido', '22023', 'item=1');
  perform pg_temp.expect_code(pg_temp.imp('im-c-0031', ctx, 'cartao', card, jsonb_build_array(pg_temp.it('d1', 'estorno', 100, '2026-10-08', 'x'))), 'data_futura', '22023', 'item=1');
  perform pg_temp.expect_code(pg_temp.imp('im-c-0032', ctx, 'cartao', card, jsonb_build_array(pg_temp.it('d1', 'estorno', 100, '2026-10-05', ''))), 'descricao_obrigatoria', '22023', 'item=1');
  perform pg_temp.expect_code(pg_temp.imp('im-c-0033', ctx, 'cartao', card, jsonb_build_array(pg_temp.it('d1', 'estorno', 0, '2026-10-05', 'x'))), 'valor_invalido', '22023', 'item=1');
  perform pg_temp.expect_code(pg_temp.imp('im-c-0034', ctx, 'cartao', card, jsonb_build_array(
    jsonb_set(pg_temp.it('d1', 'estorno', 100, '2026-10-05', 'x'), '{occurred_on}', '"2026-13-01"'))), 'data_invalida', '22023', 'item=1');
  assert pg_temp.state() = v_state, 'as recusas do cartão não gravam nada';

  -- Fatura paga: não recebe compra nem estorno, e o lote inteiro é desfeito (o item bom, antes, também).
  v := (select commitment_version from public.invoice_items where card_id = card and month = '2026-10-01');
  perform public.pay_invoice('im-c-0040', card, '2026-10-01', v, 28050, '2026-10-07');
  v_state := pg_temp.state();
  perform pg_temp.expect_code(pg_temp.imp('im-c-0041', ctx, 'cartao', card, jsonb_build_array(pg_temp.it('e1', 'compra', 500, '2026-10-06', 'Pão'), pg_temp.it('e2', 'compra', 700, '2026-09-25', 'Livro usado'))),
    'fatura_paga', 'PT409', 'item=2');
  perform pg_temp.expect_code(pg_temp.imp('im-c-0042', ctx, 'cartao', card, jsonb_build_array(pg_temp.it('e3', 'estorno', 700, '2026-09-25', 'Devolução'))), 'fatura_paga', 'PT409', 'item=1');
  assert pg_temp.state() = v_state, 'nada gravado com a fatura paga';
  -- Já importadas e puladas numa fatura paga continuam puladas (sem erro); novas em outra fatura entram.
  assert public.import_records('im-c-0043', ctx, 'cartao', card, jsonb_build_array(pg_temp.it('c1', 'compra', 20000, '2026-09-20', 'Livro', 'Educação'), pg_temp.it('e1', 'compra', 500, '2026-10-06', 'Pão')))
    = '{"created": 1, "skipped": 1}'::jsonb, 'pulado na fatura paga; criado na seguinte';
  assert (select amount_cents from public.commitments where card_id = card and invoice_month = '2026-11-01' and deleted_at is null) = 15490, 'a fatura de novembro soma o pão';

  -- Cartão arquivado, cartão de outro contexto e sem escrita.
  card2 := (public.create_card('im-c-0050', ctx, 'Cartão Velho', null, 28, 5, null) #>> '{card,id}')::uuid;
  insert into ids values ('iris_card2', card2);
  -- Limite de 48 meses da compra: o primeiro dia do mês, 48 meses antes, ainda vale.
  assert public.import_records('im-c-0051', ctx, 'cartao', card2, jsonb_build_array(pg_temp.it('f1', 'compra', 1234, '2022-10-01', 'Compra antiga'))) = '{"created": 1, "skipped": 0}'::jsonb, 'compra de 48 meses atrás entra';
  assert (select invoice_month from public.card_entries where card_id = card2 and import_key = pg_temp.k('f1')) = '2022-11-01', 'na fatura de novembro de 2022 (fecha dia 28 de outubro, vence dia 5)';
  perform public.set_card_status('im-c-0052', card2, 1, 'arquivado');
  perform pg_temp.expect_code(pg_temp.imp('im-c-0053', ctx, 'cartao', card2, jsonb_build_array(pg_temp.it('f2', 'compra', 100, '2026-10-01', 'x'))), 'cartao_arquivado', 'PT409');
  perform pg_temp.as_('nina');
  insert into ids values ('nina_card', (public.create_card('im-c-0054', pg_temp.id('nina_ctx'), 'Cartão da Nina', null, 3, 10, null) #>> '{card,id}')::uuid);
  perform pg_temp.as_('iris');
  perform pg_temp.expect_code(pg_temp.imp('im-c-0055', ctx, 'cartao', pg_temp.id('nina_card'), jsonb_build_array(pg_temp.it('f3', 'compra', 100, '2026-10-01', 'x'))), 'nao_encontrado', 'P0002');
  perform pg_temp.expect_code(pg_temp.imp('im-c-0056', pg_temp.id('nina_ctx'), 'cartao', pg_temp.id('nina_card'), jsonb_build_array(pg_temp.it('f3', 'compra', 100, '2026-10-01', 'x'))), 'sem_permissao', '42501');
  perform pg_temp.expect_code(pg_temp.imp('im-c-0057', ctx, 'cartao', pg_temp.id('iris_acc'), jsonb_build_array(pg_temp.it('f3', 'compra', 100, '2026-10-01', 'x'))), 'nao_encontrado', 'P0002');
  perform pg_temp.expect_code(pg_temp.imp('im-c-0058', pg_temp.id('nina_ctx'), 'conta', pg_temp.id('iris_acc'), jsonb_build_array(pg_temp.it('f3', 'despesa', 100, '2026-10-01', 'x'))), 'sem_permissao', '42501');
  -- Cartão de um contexto com o contexto de outro: nao_encontrado (o cartão não é desse contexto).
  perform pg_temp.expect_code(pg_temp.imp('im-c-0059', ctx, 'cartao', card, '[]'::jsonb), 'itens_invalidos', '22023');

  -- Depois: editar a compra importada (3 parcelas) mantém a chave só na primeira parcela; reimportar continua pulando; excluir libera.
  declare
    e uuid := (select id from public.card_entries where card_id = card and import_key = pg_temp.k('c3'));
    ver integer := (select version from public.card_entries where id = e);
  begin
    perform public.update_card_entry('im-c-0060', e, ver, 'compra', 15990, '2026-10-04', 'Cinema', 'Lazer', 3);
    assert (select count(*) from public.card_entries where purchase_id = e and deleted_at is null) = 3
       and (select count(*) from public.card_entries where purchase_id = e and import_key is not null) = 1
       and (select installment_number from public.card_entries where purchase_id = e and import_key is not null) = 1, 'três parcelas; a chave fica na primeira';
    assert public.import_records('im-c-0061', ctx, 'cartao', card, jsonb_build_array(pg_temp.it('c3', 'compra', 15990, '2026-10-04', 'Cinema', 'Lazer'))) = '{"created": 0, "skipped": 1}'::jsonb,
      'a compra parcelada depois continua "já anotada"';
    ver := (select version from public.card_entries where id = e);
    perform public.delete_card_entry('im-c-0062', e, ver);
    assert public.import_records('im-c-0063', ctx, 'cartao', card, jsonb_build_array(pg_temp.it('c3', 'compra', 15990, '2026-10-04', 'Cinema', 'Lazer'))) = '{"created": 1, "skipped": 0}'::jsonb,
      'excluída a compra, a linha pode ser importada de novo';
  end;
end $$;
reset role;
select pg_temp.check_links();

-- ---------------------------------------------------------------------------
-- 6. Família: quem escreve importa; leitor não; vínculo revogado não repete nem importa; a chave é por contexto.
-- ---------------------------------------------------------------------------
set role authenticated;
do $$
declare
  fam uuid := pg_temp.id('fam');
  facc uuid := pg_temp.id('fam_acc');
  items jsonb := jsonb_build_array(pg_temp.it('fam1', 'despesa', 20000, '2026-10-01', 'Condomínio', 'Moradia'), pg_temp.it('fam2', 'receita', 30000, '2026-10-02', 'Reembolso', 'Reembolso'));
begin
  perform pg_temp.as_('joel');
  perform pg_temp.expect_code(pg_temp.imp('im-f-0001', fam, 'conta', facc, items), 'sem_permissao', '42501');
  perform pg_temp.as_('lia');
  perform pg_temp.expect_code(pg_temp.imp('im-f-0002', fam, 'conta', facc, items), 'sem_permissao', '42501');
  perform pg_temp.as_('katia');
  assert public.import_records('im-f-0003', fam, 'conta', facc, items) = '{"created": 2, "skipped": 0}'::jsonb, 'quem escreve importa';
  assert (select array_agg(created_by) from public.financial_records where context_id = fam and import_key is not null) = array[pg_temp.id('katia'), pg_temp.id('katia')], 'de autoria da Kátia';
  -- A chave é por contexto: a Iris importando as mesmas linhas encontra-as e pula.
  perform pg_temp.as_('iris');
  assert public.import_records('im-f-0004', fam, 'conta', facc, items) = '{"created": 0, "skipped": 2}'::jsonb, 'a Iris pula as linhas da Kátia';
  -- Leitura: Joel e a Iris veem as linhas importadas em import_items; Lia não vê nada da Família.
  perform pg_temp.as_('joel');
  assert (select count(*) from public.import_items where context_id = fam) = 2, 'Joel lê as linhas importadas';
  perform pg_temp.as_('lia');
  assert (select count(*) from public.import_items) = 0, 'Lia não vê as linhas dos outros';
  -- A operação é de quem importou: Joel não a lê, e repetir a chave da Kátia com outra pessoa é só dela.
  perform pg_temp.as_('joel');
  assert (select count(*) from public.record_operations where idempotency_key = 'im-f-0003') = 0, 'a operação é só de quem a fez';
  -- Vínculo revogado: nem repete, nem importa.
  reset role;
  update public.context_memberships set revoked_at = now() where context_id = fam and person_id = pg_temp.id('katia');
  set role authenticated;
  perform pg_temp.as_('katia');
  perform pg_temp.expect_code(pg_temp.imp('im-f-0003', fam, 'conta', facc, items), 'nao_encontrado', 'P0002');
  perform pg_temp.expect_code(pg_temp.imp('im-f-0005', fam, 'conta', facc, items), 'sem_permissao', '42501');
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 7. A atividade (D-030): a importação conta como anotação, como as demais escritas (Lia, que ainda não escreveu nada).
-- ---------------------------------------------------------------------------
set role authenticated;
do $$
declare
  ctx uuid := pg_temp.id('lia_ctx');
  acc uuid := pg_temp.id('lia_acc');
begin
  perform pg_temp.as_('lia');
  assert (select count(*) from public.context_activity) = 0, 'sem atividade antes da primeira anotação';
  assert (select count(*) from public.financial_records) = 0 and (select count(*) from public.card_entries) = 0, 'conta nova sem dados de exemplo';
  perform public.import_records('im-l-0001', ctx, 'conta', acc, jsonb_build_array(pg_temp.it('l1', 'despesa', 1500, '2026-10-06', 'Feira', 'Mercado')));
  assert (select (person_id, context_id, last_write_on)::text from public.context_activity) = (select (pg_temp.id('lia'), ctx, '2026-10-07'::date)::text),
    'a importação registra a atividade de hoje';
  assert (select count(*) from public.import_items) = 1, 'import_items mostra a linha da própria Lia';
end $$;
reset role;

-- Vínculos coerentes até aqui (as contas de fatura batem com os lançamentos). A seção seguinte enche um cartão com 5.000
-- lançamentos e não confere os vínculos adiados: a conferência de cada linha custaria minutos.
select pg_temp.check_links();

-- ---------------------------------------------------------------------------
-- 8. Limites: 500 por chamada e 5.000 lançamentos vivos por cartão (Otto).
-- ---------------------------------------------------------------------------
set role authenticated;
do $$
declare
  ctx uuid := pg_temp.id('otto_ctx');
  card uuid;
  b integer;
  items jsonb;
begin
  perform pg_temp.as_('otto');
  card := (public.create_card('im-o-0001', ctx, 'Cartão Cheio', null, 3, 10, null) #>> '{card,id}')::uuid;
  -- Exatamente 500 itens é permitido; dez lotes enchem o cartão.
  for b in 0 .. 9 loop
    select jsonb_agg(pg_temp.it('o' || (b * 500 + n), 'compra', 100 + n, '2026-09-20', 'Compra ' || (b * 500 + n)) order by n) into items from generate_series(1, 500) n;
    assert public.import_records('im-o-1' || lpad(b::text, 3, '0'), ctx, 'cartao', card, items) = '{"created": 500, "skipped": 0}'::jsonb, 'lote de 500';
  end loop;
  assert (select count(*) from public.card_entries where card_id = card and deleted_at is null) = 5000, '5.000 lançamentos vivos';
  assert (select amount_cents from public.commitments where card_id = card and deleted_at is null) = (select sum(100 + n) * 10 from generate_series(1, 500) n), 'a fatura soma os 5.000';
  -- Um a mais passa do limite; e o lote com um criado e um pulado também (o criado é o que estoura).
  perform pg_temp.expect_code(pg_temp.imp('im-o-2001', ctx, 'cartao', card, jsonb_build_array(pg_temp.it('o-extra', 'compra', 100, '2026-09-20', 'Mais uma'))), 'limite_de_lancamentos', 'PT409', 'item=1');
  perform pg_temp.expect_code(pg_temp.imp('im-o-2002', ctx, 'cartao', card, jsonb_build_array(pg_temp.it('o1', 'compra', 101, '2026-09-20', 'Compra 1'), pg_temp.it('o-extra', 'compra', 100, '2026-09-20', 'Mais uma'))),
    'limite_de_lancamentos', 'PT409', 'item=2');
  -- Só pulados passa mesmo no limite.
  assert public.import_records('im-o-2003', ctx, 'cartao', card, jsonb_build_array(pg_temp.it('o1', 'compra', 101, '2026-09-20', 'Compra 1'))) = '{"created": 0, "skipped": 1}'::jsonb, 'pulado não conta no limite';
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 9. Privilégios e leitura: nenhuma escrita direta, anon sem acesso, a visão filtra pela RLS.
-- ---------------------------------------------------------------------------
set role authenticated;
do $$
begin
  perform pg_temp.as_('iris');
  assert (select count(*) from public.import_items where context_id = pg_temp.id('iris_ctx')) > 0, 'a Iris lê as próprias linhas importadas';
  assert (select count(*) from public.import_items where context_id = pg_temp.id('nina_ctx')) = 0, 'e não as da Nina';
  assert (select count(*) from public.import_items where card_id is not null) = (select count(*) from public.card_entries where import_key is not null and deleted_at is null), 'a visão traz as compras e estornos vivos';
  perform pg_temp.expect_error($f$insert into public.financial_records (context_id, account_id, kind, amount_cents, currency, occurred_on, description, created_by, import_key)
    values (gen_random_uuid(), gen_random_uuid(), 'despesa', 1, 'BRL', '2026-10-01', 'x', gen_random_uuid(), 'a')$f$, 'permission denied%');
  perform pg_temp.expect_error($f$update public.financial_records set import_key = null$f$, 'permission denied%');
  perform pg_temp.expect_error($f$update public.card_entries set import_key = null$f$, 'permission denied%');
  perform pg_temp.expect_error($f$insert into public.card_entries (context_id, card_id, kind, invoice_month, amount_cents, import_key) values (gen_random_uuid(), gen_random_uuid(), 'estorno', '2026-10-01', 1, 'a')$f$, 'permission denied%');
  perform pg_temp.expect_error($f$update public.record_operations set import_result = '{}'$f$, 'permission denied%');
end $$;
reset role;
set role anon;
select pg_temp.expect_error($$select public.import_records('im-anon-0001', gen_random_uuid(), 'conta', gen_random_uuid(), '[]'::jsonb)$$, 'permission denied%');
select pg_temp.expect_error($$select * from public.import_items$$, 'permission denied%');
reset role;
do $$ begin
  assert has_function_privilege('authenticated', 'public.import_records(text, uuid, text, uuid, jsonb)', 'execute')
     and not has_function_privilege('anon', 'public.import_records(text, uuid, text, uuid, jsonb)', 'execute'), 'só authenticated executa import_records';
  assert has_table_privilege('authenticated', 'public.import_items', 'select') and not has_table_privilege('anon', 'public.import_items', 'select')
     and not has_table_privilege('authenticated', 'public.import_items', 'insert, update, delete, truncate'), 'a visão só lê';
  assert not has_table_privilege('authenticated', 'public.financial_records', 'insert, update, delete, truncate')
     and not has_table_privilege('authenticated', 'public.card_entries', 'insert, update, delete, truncate'), 'sem escrita direta nas tabelas';
  -- Toda importação gravou uma operação com o resultado, e toda operação aponta para um destino do contexto.
  assert not exists (select 1 from public.record_operations o where o.action = 'importar_extrato'
                      and not (o.target_id in (select a.id from public.financial_accounts a where a.context_id = o.context_id)
                               or o.target_id in (select c.id from public.cards c where c.context_id = o.context_id))), 'o destino da operação é do contexto';
  assert not exists (select 1 from public.record_operations where action = 'importar_extrato' and (import_result ->> 'created')::int + (import_result ->> 'skipped')::int not between 1 and 500),
    'created + skipped de cada operação fica entre 1 e 500';
end $$;

rollback;
