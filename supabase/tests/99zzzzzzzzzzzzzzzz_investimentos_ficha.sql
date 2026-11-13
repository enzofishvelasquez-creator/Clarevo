-- Ficha ampliada dos investimentos (D-099; migração 0035): colunas opcionais, tipo do rendimento, validação (F1 a F4), editar grava a
-- ficha inteira (F5), as funções novas no lugar das antigas, privilégios e a visão com as colunas no fim.
-- Pessoa FICTÍCIA: Rui. Tudo em uma transação desfeita no fim.
\set ON_ERROR_STOP 1
\set rui '''00000000-0000-0000-0000-0000000000f7'''

begin;
set local clarevo.today = '2026-11-13';

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
grant select, insert on ids to authenticated, anon;
create function pg_temp.id(p_name text) returns uuid language sql as $$ select id from ids where name = p_name $$;
create function pg_temp.as_(p_name text) returns text language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(pg_temp.id(p_name)::text, ''), true)
$$;

-- ---------------------------------------------------------------------------
-- 1. Esquema e privilégios
-- ---------------------------------------------------------------------------
do $$ begin
  assert (select array_agg(attname order by attnum) from pg_attribute where attrelid = 'public.investment_items'::regclass and attnum > 0 and not attisdropped)
       = array['id', 'context_id', 'name', 'kind', 'status', 'created_by', 'version', 'created_at', 'updated_at', 'deposits_cents', 'withdrawals_cents',
               'income_cents', 'value_cents', 'last_value_on', 'first_movement_on', 'subkind', 'institution', 'index_kind', 'rate_bp', 'maturity_on',
               'liquidity', 'liquidity_on', 'liquidity_days']::name[], 'a visão com a ficha no fim';
  assert (select reloptions from pg_class where oid = 'public.investment_items'::regclass) @> array['security_invoker=true'], 'a visão com a RLS de quem consulta';
  assert has_table_privilege('authenticated', 'public.investment_items', 'select') and not has_table_privilege('anon', 'public.investment_items', 'select'), 'leitura';
  assert has_function_privilege('authenticated', 'public.create_investment(text, uuid, text, text, bigint, date, bigint, jsonb)', 'execute')
     and has_function_privilege('authenticated', 'public.update_investment(text, uuid, integer, text, text, jsonb)', 'execute')
     and has_function_privilege('authenticated', 'public.add_investment_movement(text, uuid, text, bigint, date, text, text)', 'execute')
     and has_function_privilege('authenticated', 'public.update_investment_movement(text, uuid, integer, bigint, date, text, text)', 'execute'), 'o app executa';
  assert not has_function_privilege('anon', 'public.create_investment(text, uuid, text, text, bigint, date, bigint, jsonb)', 'execute')
     and not has_function_privilege('anon', 'public.update_investment_movement(text, uuid, integer, bigint, date, text, text)', 'execute'), 'anon não';
  assert not has_function_privilege('authenticated', 'public.clarevo_validate_investment_details(text, jsonb)', 'execute'), 'validação fechada';
  assert to_regprocedure('public.create_investment(text, uuid, text, text, bigint, date, bigint)') is null
     and to_regprocedure('public.update_investment(text, uuid, integer, text, text)') is null
     and to_regprocedure('public.add_investment_movement(text, uuid, text, bigint, date, text)') is null
     and to_regprocedure('public.update_investment_movement(text, uuid, integer, bigint, date, text)') is null, 'as antigas saíram';
  assert (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in ('create_investment', 'update_investment', 'add_investment_movement', 'update_investment_movement')) = 4,
    'uma de cada';
end $$;

-- ---------------------------------------------------------------------------
-- 2. Validação (F1 a F3), sem gravar nada
-- ---------------------------------------------------------------------------
do $$
declare
  v jsonb;
begin
  v := public.clarevo_validate_investment_details('renda_fixa', '{"subkind":"cdb","institution":"  Banco   Azul ","index_kind":"cdi","rate_bp":11000,"maturity_on":"2028-03-15","liquidity":"no_vencimento","extra":1}');
  assert v = '{"subkind":"cdb","institution":"Banco Azul","index_kind":"cdi","rate_bp":11000,"maturity_on":"2028-03-15","liquidity":"no_vencimento","liquidity_on":null,"liquidity_days":null}'::jsonb,
    'normalizada, chave desconhecida ignorada';
  assert public.clarevo_validate_investment_details('outro', null) = '{"subkind":null,"institution":null,"index_kind":null,"rate_bp":null,"maturity_on":null,"liquidity":null,"liquidity_on":null,"liquidity_days":null}'::jsonb, 'sem ficha';
  assert public.clarevo_validate_investment_details('renda_fixa', '{"institution":"   "}') ->> 'institution' is null, 'instituição só com espaços fica vazia';
  assert (public.clarevo_validate_investment_details('titulos_publicos', '{"subkind":"tesouro_selic","index_kind":"selic","rate_bp":0}') ->> 'rate_bp')::int = 0, 'Selic sem taxa';
  assert (public.clarevo_validate_investment_details('renda_fixa', '{"liquidity":"a_partir_de","liquidity_on":"2027-01-10"}') ->> 'liquidity_on') = '2027-01-10', 'carência';
  assert (public.clarevo_validate_investment_details('renda_fixa', '{"liquidity":"dias","liquidity_days":30}') ->> 'liquidity_days')::int = 30, 'em dias';

  perform pg_temp.expect_code($q$select public.clarevo_validate_investment_details('acoes', '{"subkind":"cdb"}')$q$, 'subtipo_invalido', '22023');
  perform pg_temp.expect_code($q$select public.clarevo_validate_investment_details('cripto', '{"subkind":"acao"}')$q$, 'subtipo_invalido', '22023');
  perform pg_temp.expect_code($q$select public.clarevo_validate_investment_details('renda_fixa', '{"subkind":1}')$q$, 'subtipo_invalido', '22023');
  perform pg_temp.expect_code($q$select public.clarevo_validate_investment_details('renda_fixa', '[1]')$q$, 'subtipo_invalido', '22023');
  perform pg_temp.expect_code(format($q$select public.clarevo_validate_investment_details('renda_fixa', %L)$q$, jsonb_build_object('institution', repeat('x', 41))), 'instituicao_invalida', '22023');
  perform pg_temp.expect_code($q$select public.clarevo_validate_investment_details('renda_fixa', '{"index_kind":"dolar"}')$q$, 'rendimento_invalido', '22023');
  perform pg_temp.expect_code($q$select public.clarevo_validate_investment_details('renda_fixa', '{"index_kind":"cdi"}')$q$, 'taxa_invalida', '22023');
  perform pg_temp.expect_code($q$select public.clarevo_validate_investment_details('renda_fixa', '{"index_kind":"cdi","rate_bp":0}')$q$, 'taxa_invalida', '22023');
  perform pg_temp.expect_code($q$select public.clarevo_validate_investment_details('renda_fixa', '{"index_kind":"cdi","rate_bp":110.5}')$q$, 'taxa_invalida', '22023');
  perform pg_temp.expect_code($q$select public.clarevo_validate_investment_details('renda_fixa', '{"index_kind":"poupanca","rate_bp":100}')$q$, 'taxa_invalida', '22023');
  perform pg_temp.expect_code($q$select public.clarevo_validate_investment_details('renda_fixa', '{"rate_bp":100}')$q$, 'taxa_invalida', '22023');
  perform pg_temp.expect_code($q$select public.clarevo_validate_investment_details('renda_fixa', '{"index_kind":"prefixado","rate_bp":10001}')$q$, 'taxa_invalida', '22023');
  perform pg_temp.expect_code($q$select public.clarevo_validate_investment_details('renda_fixa', '{"maturity_on":"2026-02-30"}')$q$, 'vencimento_invalido', '22023');
  perform pg_temp.expect_code($q$select public.clarevo_validate_investment_details('renda_fixa', '{"maturity_on":"15/03/2028"}')$q$, 'vencimento_invalido', '22023');
  perform pg_temp.expect_code($q$select public.clarevo_validate_investment_details('renda_fixa', '{"maturity_on":"2101-01-01"}')$q$, 'vencimento_invalido', '22023');
  perform pg_temp.expect_code($q$select public.clarevo_validate_investment_details('renda_fixa', '{"liquidity":"a_partir_de"}')$q$, 'liquidez_invalida', '22023');
  perform pg_temp.expect_code($q$select public.clarevo_validate_investment_details('renda_fixa', '{"liquidity":"dias","liquidity_days":0}')$q$, 'liquidez_invalida', '22023');
  perform pg_temp.expect_code($q$select public.clarevo_validate_investment_details('renda_fixa', '{"liquidity":"dias","liquidity_days":1801}')$q$, 'liquidez_invalida', '22023');
  perform pg_temp.expect_code($q$select public.clarevo_validate_investment_details('renda_fixa', '{"liquidity":"diaria","liquidity_days":3}')$q$, 'liquidez_invalida', '22023');
  perform pg_temp.expect_code($q$select public.clarevo_validate_investment_details('renda_fixa', '{"liquidity_on":"2027-01-10"}')$q$, 'liquidez_invalida', '22023');
  perform pg_temp.expect_code($q$select public.clarevo_validate_investment_details('renda_fixa', '{"liquidity":"sempre"}')$q$, 'liquidez_invalida', '22023');
end $$;

-- ---------------------------------------------------------------------------
-- 3. Criar, editar (F5) e o tipo do rendimento (F4)
-- ---------------------------------------------------------------------------
insert into ids values ('rui', :rui);
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values (:rui, 'rui.ficha@exemplo.test', now(), '{"display_name":"Rui"}');

set role authenticated;
do $$
declare
  space jsonb;
  r jsonb;
  m jsonb;
  ficha jsonb := '{"subkind":"cdb","institution":"Banco Azul","index_kind":"cdi","rate_bp":11000,"maturity_on":"2028-03-15","liquidity":"no_vencimento"}';
begin
  perform pg_temp.as_('rui');
  space := public.ensure_personal_space('Conta principal');
  insert into ids values ('ctx', (space ->> 'context_id')::uuid);

  r := public.create_investment('fi-c-0001', pg_temp.id('ctx'), 'CDB do banco', 'renda_fixa', 1000000, '2026-03-10', 1080000, ficha);
  insert into ids values ('cdb', (r #>> '{investment,id}')::uuid);
  assert r #>> '{investment,subkind}' = 'cdb' and r #>> '{investment,institution}' = 'Banco Azul' and r #>> '{investment,index_kind}' = 'cdi'
     and (r #>> '{investment,rate_bp}')::int = 11000 and r #>> '{investment,maturity_on}' = '2028-03-15' and r #>> '{investment,liquidity}' = 'no_vencimento'
     and r #> '{investment,liquidity_on}' = 'null'::jsonb, 'criado com a ficha';
  assert public.create_investment('fi-c-0001', pg_temp.id('ctx'), 'CDB do banco', 'renda_fixa', 1000000, '2026-03-10', 1080000, ficha) = r, 'repetição';
  perform pg_temp.expect_code(format($q$select public.create_investment('fi-c-0001', %L, 'CDB do banco', 'renda_fixa', 1000000, '2026-03-10', 1080000, '{"subkind":"lci"}')$q$, pg_temp.id('ctx')),
    'chave_reutilizada', 'PT409');
  perform pg_temp.expect_code(format($q$select public.create_investment('fi-c-0002', %L, 'Ações', 'acoes', 1000, '2026-03-10', null, '{"subkind":"cdb"}')$q$, pg_temp.id('ctx')),
    'subtipo_invalido', '22023');
  assert (select count(*) from public.investments) = 1, 'a recusa não grava';
  -- Sem ficha, como antes (chamada com sete argumentos).
  r := public.create_investment('fi-c-0003', pg_temp.id('ctx'), 'Ações', 'acoes', 50000, '2026-11-13', null);
  insert into ids values ('acoes', (r #>> '{investment,id}')::uuid);
  assert r #> '{investment,subkind}' = 'null'::jsonb and r #> '{investment,rate_bp}' = 'null'::jsonb, 'sem ficha';

  -- Editar grava a ficha inteira; sem ficha, apaga os campos.
  r := public.update_investment('fi-e-0001', pg_temp.id('cdb'), 1, 'CDB do banco', 'renda_fixa', '{"subkind":"lci","institution":"Banco Azul","liquidity":"a_partir_de","liquidity_on":"2027-01-10"}');
  assert r #>> '{investment,subkind}' = 'lci' and r #> '{investment,index_kind}' = 'null'::jsonb and r #> '{investment,maturity_on}' = 'null'::jsonb
     and r #>> '{investment,liquidity_on}' = '2027-01-10' and (r #>> '{investment,version}')::int = 2, 'ficha trocada inteira';
  perform pg_temp.expect_code(format($q$select public.update_investment('fi-e-0002', %L, 2, 'X', 'acoes', '{"subkind":"lci"}')$q$, pg_temp.id('cdb')), 'subtipo_invalido', '22023');
  r := public.update_investment('fi-e-0003', pg_temp.id('cdb'), 2, 'CDB do banco', 'renda_fixa');
  assert r #> '{investment,subkind}' = 'null'::jsonb and r #> '{investment,institution}' = 'null'::jsonb and r #> '{investment,liquidity}' = 'null'::jsonb, 'sem ficha, campos vazios';

  -- Tipo do rendimento só no rendimento.
  m := public.add_investment_movement('fi-m-0001', pg_temp.id('acoes'), 'rendimento', 1500, '2026-11-13', null, 'jcp');
  assert m #>> '{movement,income_kind}' = 'jcp', 'JCP gravado';
  assert public.add_investment_movement('fi-m-0001', pg_temp.id('acoes'), 'rendimento', 1500, '2026-11-13', null, 'jcp') = m, 'repetição';
  perform pg_temp.expect_code(format($q$select public.add_investment_movement('fi-m-0001', %L, 'rendimento', 1500, '2026-11-13', null, 'dividendo')$q$, pg_temp.id('acoes')),
    'chave_reutilizada', 'PT409');
  perform pg_temp.expect_code(format($q$select public.add_investment_movement('fi-m-0002', %L, 'aporte', 1500, '2026-11-13', null, 'jcp')$q$, pg_temp.id('acoes')),
    'tipo_rendimento_invalido', '22023');
  perform pg_temp.expect_code(format($q$select public.add_investment_movement('fi-m-0003', %L, 'rendimento', 1500, '2026-11-13', null, 'aluguel')$q$, pg_temp.id('acoes')),
    'tipo_rendimento_invalido', '22023');
  m := public.update_investment_movement('fi-u-0001', (m #>> '{movement,id}')::uuid, 1, 1600, '2026-11-13', null, 'dividendo');
  assert m #>> '{movement,income_kind}' = 'dividendo' and (m #>> '{movement,amount_cents}')::bigint = 1600, 'alterado';
  m := public.update_investment_movement('fi-u-0002', (m #>> '{movement,id}')::uuid, 2, 1600, '2026-11-13', null);
  assert m #> '{movement,income_kind}' = 'null'::jsonb, 'sem tipo';
  perform pg_temp.expect_code(format($q$select public.update_investment_movement('fi-u-0003', %L, 1, 100, '2026-11-13', null, 'juros')$q$,
    (select id from public.investment_movements where investment_id = pg_temp.id('acoes') and kind = 'aporte')), 'tipo_rendimento_invalido', '22023');
end $$;

-- As regras da tabela valem mesmo sem as funções (defesa adicional).
reset role;
do $$ begin
  perform pg_temp.expect_code(format($q$update public.investments set rate_bp = 5, version = version + 1 where id = %L$q$, pg_temp.id('acoes')), 'new row for relation "investments" violates check constraint "investments_rate_rule"', '23514');
  perform pg_temp.expect_code(format($q$update public.investments set subkind = 'cdb', version = version + 1 where id = %L$q$, pg_temp.id('acoes')), 'new row for relation "investments" violates check constraint "investments_subkind_rule"', '23514');
  perform pg_temp.expect_code(format($q$update public.investments set liquidity = 'dias', version = version + 1 where id = %L$q$, pg_temp.id('acoes')), 'new row for relation "investments" violates check constraint "investments_liquidity_rule"', '23514');
  -- Os ramos com nulo também recusam (regra nula passaria).
  perform pg_temp.expect_code(format($q$update public.investments set index_kind = 'cdi', version = version + 1 where id = %L$q$, pg_temp.id('acoes')), 'new row for relation "investments" violates check constraint "investments_rate_rule"', '23514');
end $$;

rollback;
