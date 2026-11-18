-- Taxa com data de fim e condição, e descrição dos investimentos (D-104, itens 12 e 13; migração 0039): T1 (o par data de fim e taxa de
-- depois, só com taxa, nos limites da forma de render), T2 (condição até 60 caracteres, só com taxa), T3 (descrição até 120 caracteres, em
-- qualquer tipo), T4 (sem a ficha ou sem a chave, ficam; nulo tira; trocar a forma de render tira a taxa de depois e a condição) e T5 (a
-- visão). Privilégios e regras da tabela.
-- Pessoas FICTÍCIAS: Ivo e Bia. Tudo em uma transação desfeita no fim.
\set ON_ERROR_STOP 1
\set ivo '''00000000-0000-0000-0000-0000000000fc'''
\set bia '''00000000-0000-0000-0000-0000000000fd'''

begin;
set local clarevo.today = '2026-11-17';

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
create function pg_temp.inv(p_name text) returns public.investments language sql security definer set search_path = public, pg_temp as $$
  select i from public.investments i where i.id = pg_temp.id(p_name)
$$;

-- ---------------------------------------------------------------------------
-- 1. Esquema e privilégios
-- ---------------------------------------------------------------------------
do $$ begin
  assert not has_function_privilege('authenticated', 'public.clarevo_investment_rate_step(text, jsonb, text, date, integer, text)', 'execute')
     and not has_function_privilege('service_role', 'public.clarevo_investment_rate_step(text, jsonb, text, date, integer, text)', 'execute')
     and not has_function_privilege('authenticated', 'public.clarevo_investment_description(jsonb, text)', 'execute')
     and not has_function_privilege('anon', 'public.clarevo_investment_description(jsonb, text)', 'execute'), 'auxiliares fechadas';
  assert (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in ('create_investment', 'update_investment')) = 2, 'uma de cada (mesma assinatura)';
  assert has_function_privilege('authenticated', 'public.create_investment(text, uuid, text, text, bigint, date, bigint, jsonb)', 'execute')
     and has_function_privilege('authenticated', 'public.update_investment(text, uuid, integer, text, text, jsonb)', 'execute')
     and not has_function_privilege('anon', 'public.update_investment(text, uuid, integer, text, text, jsonb)', 'execute'), 'o app continua gravando';
  assert (select array_agg(column_name::text order by ordinal_position) from information_schema.columns
           where table_schema = 'public' and table_name = 'investment_items' and ordinal_position > 26)
       = array['rate_until', 'rate_after_bp', 'rate_condition', 'description'], 'a visão ganha as quatro colunas no fim';
  assert (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'investment_items') = 30, '30 colunas na visão';
end $$;

insert into ids values ('ivo', :ivo), ('bia', :bia);
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  (:ivo, 'ivo.taxa@exemplo.test', now(), '{"display_name":"Ivo"}'),
  (:bia, 'bia.taxa@exemplo.test', now(), '{"display_name":"Bia"}');

set role authenticated;
do $$
declare
  space jsonb;
  p text;
begin
  foreach p in array array['ivo', 'bia'] loop
    perform pg_temp.as_(p);
    space := public.ensure_personal_space('Conta principal');
    insert into ids values (p || '_ctx', (space ->> 'context_id')::uuid);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Criar (T1 a T3)
-- ---------------------------------------------------------------------------
do $$
declare
  r jsonb;
begin
  perform pg_temp.as_('ivo');
  -- 120% do CDI até 31/03/2027, depois 100%, com a condição (os espaços sobrando saem).
  r := public.create_investment('tx-c-0001', pg_temp.id('ivo_ctx'), 'CDB com taxa nova', 'renda_fixa', 100000, '2026-10-01', null,
                                '{"subkind":"cdb","index_kind":"cdi","rate_bp":12000,"rate_until":"2027-03-31","rate_after_bp":10000,"rate_condition":"  para  saldo novo ","description":" Aplicação  do  bônus "}');
  insert into ids values ('cdb', (r #>> '{investment,id}')::uuid);
  assert r #>> '{investment,rate_until}' = '2027-03-31' and (r #>> '{investment,rate_after_bp}')::int = 10000
     and r #>> '{investment,rate_condition}' = 'para saldo novo' and r #>> '{investment,description}' = 'Aplicação do bônus', 'taxa com data de fim, condição e descrição';
  assert (select rate_until from public.investment_items where id = pg_temp.id('cdb')) = '2027-03-31', 'a visão mostra a data de fim';
  -- Outro investimento, sem taxa, com descrição (T3 em qualquer tipo).
  r := public.create_investment('tx-c-0002', pg_temp.id('ivo_ctx'), 'Consórcio', 'outro', 50000, '2026-10-01', 52000, '{"description":"Carta de crédito do carro"}');
  insert into ids values ('outro', (r #>> '{investment,id}')::uuid);
  assert r #>> '{investment,description}' = 'Carta de crédito do carro' and r #> '{investment,rate_until}' = 'null'::jsonb and (r #>> '{investment,value_cents}')::bigint = 52000,
    'outro com descrição e valor de hoje';
  -- Sem as chaves (versão anterior do app): tudo vazio.
  r := public.create_investment('tx-c-0003', pg_temp.id('ivo_ctx'), 'Prefixado', 'renda_fixa', 50000, '2026-10-01', null, '{"index_kind":"prefixado","rate_bp":1250}');
  insert into ids values ('pre', (r #>> '{investment,id}')::uuid);
  assert r #> '{investment,rate_until}' = 'null'::jsonb and r #> '{investment,rate_condition}' = 'null'::jsonb and r #> '{investment,description}' = 'null'::jsonb, 'sem as chaves, vazio';
  -- Sem ficha nenhuma.
  r := public.create_investment('tx-c-0004', pg_temp.id('ivo_ctx'), 'Sem ficha', 'acoes', 50000, '2026-10-01');
  assert r #> '{investment,description}' = 'null'::jsonb, 'sem ficha, sem descrição';

  -- Recusas (T1): só a data, só a taxa, sem taxa na forma de render, fora dos limites do CDI e do prefixado, data fora do intervalo, data mal
  -- escrita, taxa fracionária ou em texto.
  perform pg_temp.expect_code(format($q$select public.create_investment('tx-c-0010', %L, 'X', 'renda_fixa', 100, '2026-10-01', null, '{"index_kind":"cdi","rate_bp":11000,"rate_until":"2027-03-31"}')$q$, pg_temp.id('ivo_ctx')), 'taxa_condicional_invalida', '22023');
  perform pg_temp.expect_code(format($q$select public.create_investment('tx-c-0011', %L, 'X', 'renda_fixa', 100, '2026-10-01', null, '{"index_kind":"cdi","rate_bp":11000,"rate_after_bp":10000}')$q$, pg_temp.id('ivo_ctx')), 'taxa_condicional_invalida', '22023');
  perform pg_temp.expect_code(format($q$select public.create_investment('tx-c-0012', %L, 'X', 'renda_fixa', 100, '2026-10-01', null, '{"index_kind":"poupanca","rate_until":"2027-03-31","rate_after_bp":100}')$q$, pg_temp.id('ivo_ctx')), 'taxa_condicional_invalida', '22023');
  perform pg_temp.expect_code(format($q$select public.create_investment('tx-c-0013', %L, 'X', 'renda_fixa', 100, '2026-10-01', null, '{"index_kind":"cdi","rate_bp":11000,"rate_until":"2027-03-31","rate_after_bp":0}')$q$, pg_temp.id('ivo_ctx')), 'taxa_condicional_invalida', '22023');
  perform pg_temp.expect_code(format($q$select public.create_investment('tx-c-0014', %L, 'X', 'renda_fixa', 100, '2026-10-01', null, '{"index_kind":"prefixado","rate_bp":1100,"rate_until":"2027-03-31","rate_after_bp":10001}')$q$, pg_temp.id('ivo_ctx')), 'taxa_condicional_invalida', '22023');
  perform pg_temp.expect_code(format($q$select public.create_investment('tx-c-0015', %L, 'X', 'renda_fixa', 100, '2026-10-01', null, '{"index_kind":"cdi","rate_bp":11000,"rate_until":"2101-01-01","rate_after_bp":10000}')$q$, pg_temp.id('ivo_ctx')), 'taxa_condicional_invalida', '22023');
  perform pg_temp.expect_code(format($q$select public.create_investment('tx-c-0016', %L, 'X', 'renda_fixa', 100, '2026-10-01', null, '{"index_kind":"cdi","rate_bp":11000,"rate_until":"31/03/2027","rate_after_bp":10000}')$q$, pg_temp.id('ivo_ctx')), 'taxa_condicional_invalida', '22023');
  perform pg_temp.expect_code(format($q$select public.create_investment('tx-c-0017', %L, 'X', 'renda_fixa', 100, '2026-10-01', null, '{"index_kind":"cdi","rate_bp":11000,"rate_until":"2027-02-30","rate_after_bp":10000}')$q$, pg_temp.id('ivo_ctx')), 'taxa_condicional_invalida', '22023');
  perform pg_temp.expect_code(format($q$select public.create_investment('tx-c-0018', %L, 'X', 'renda_fixa', 100, '2026-10-01', null, '{"index_kind":"cdi","rate_bp":11000,"rate_until":"2027-03-31","rate_after_bp":100.5}')$q$, pg_temp.id('ivo_ctx')), 'taxa_condicional_invalida', '22023');
  perform pg_temp.expect_code(format($q$select public.create_investment('tx-c-0019', %L, 'X', 'renda_fixa', 100, '2026-10-01', null, '{"index_kind":"cdi","rate_bp":11000,"rate_until":"2027-03-31","rate_after_bp":"10000"}')$q$, pg_temp.id('ivo_ctx')), 'taxa_condicional_invalida', '22023');
  -- Selic e IPCA aceitam taxa de depois negativa nos limites.
  r := public.create_investment('tx-c-0020', pg_temp.id('ivo_ctx'), 'IPCA', 'renda_fixa', 100, '2026-10-01', null, '{"index_kind":"ipca","rate_bp":600,"rate_until":"2026-12-31","rate_after_bp":-100}');
  assert (r #>> '{investment,rate_after_bp}')::int = -100, 'IPCA com taxa de depois negativa';
  -- Recusas (T2 e T3): condição sem taxa, longa ou número; descrição longa ou número.
  perform pg_temp.expect_code(format($q$select public.create_investment('tx-c-0021', %L, 'X', 'renda_fixa', 100, '2026-10-01', null, '{"index_kind":"variavel","rate_condition":"todo mês"}')$q$, pg_temp.id('ivo_ctx')), 'condicao_invalida', '22023');
  perform pg_temp.expect_code(format($q$select public.create_investment('tx-c-0022', %L, 'X', 'renda_fixa', 100, '2026-10-01', null, %L)$q$, pg_temp.id('ivo_ctx'),
    jsonb_build_object('index_kind', 'cdi', 'rate_bp', 11000, 'rate_condition', repeat('a', 61))), 'condicao_invalida', '22023');
  perform pg_temp.expect_code(format($q$select public.create_investment('tx-c-0023', %L, 'X', 'renda_fixa', 100, '2026-10-01', null, '{"index_kind":"cdi","rate_bp":11000,"rate_condition":5}')$q$, pg_temp.id('ivo_ctx')), 'condicao_invalida', '22023');
  perform pg_temp.expect_code(format($q$select public.create_investment('tx-c-0024', %L, 'X', 'outro', 100, '2026-10-01', null, %L)$q$, pg_temp.id('ivo_ctx'),
    jsonb_build_object('description', repeat('b', 121))), 'descricao_investimento_invalida', '22023');
  perform pg_temp.expect_code(format($q$select public.create_investment('tx-c-0025', %L, 'X', 'outro', 100, '2026-10-01', null, '{"description":12}')$q$, pg_temp.id('ivo_ctx')), 'descricao_investimento_invalida', '22023');
  -- A ficha da 0035 confere antes (mesma ordem do núcleo): a taxa contratada inválida vem primeiro.
  perform pg_temp.expect_code(format($q$select public.create_investment('tx-c-0026', %L, 'X', 'renda_fixa', 100, '2026-10-01', null, '{"index_kind":"cdi","rate_bp":0,"rate_until":"2027-03-31"}')$q$, pg_temp.id('ivo_ctx')), 'taxa_invalida', '22023');
  -- Condição de 60 caracteres e descrição de 120 passam (os limites).
  r := public.create_investment('tx-c-0027', pg_temp.id('ivo_ctx'), 'Limites', 'renda_fixa', 100, '2026-10-01', null,
                                jsonb_build_object('index_kind', 'cdi', 'rate_bp', 11000, 'rate_condition', repeat('c', 60), 'description', repeat('d', 120)));
  assert char_length(r #>> '{investment,rate_condition}') = 60 and char_length(r #>> '{investment,description}') = 120, 'nos limites';
  assert (select count(*) from public.investments where context_id = pg_temp.id('ivo_ctx')) = 6, 'recusas não gravam';
end $$;

-- ---------------------------------------------------------------------------
-- 3. Editar (T4)
-- ---------------------------------------------------------------------------
do $$
declare
  r jsonb;
begin
  perform pg_temp.as_('ivo');
  -- Sem a ficha (app anterior à 0035): tudo fica.
  r := public.update_investment('tx-e-0001', pg_temp.id('cdb'), 1, 'CDB com taxa nova', 'renda_fixa');
  assert r #>> '{investment,rate_until}' = '2027-03-31' and r #>> '{investment,rate_condition}' = 'para saldo novo' and r #>> '{investment,description}' = 'Aplicação do bônus',
    'sem a ficha, ficam';
  -- A ficha sem as chaves novas (app anterior à 0039), mesma forma de render com outra taxa: ficam.
  r := public.update_investment('tx-e-0002', pg_temp.id('cdb'), 2, 'CDB com taxa nova', 'renda_fixa', '{"subkind":"cdb","index_kind":"cdi","rate_bp":11500,"institution":"Banco Azul"}');
  assert (r #>> '{investment,rate_bp}')::int = 11500 and (r #>> '{investment,rate_after_bp}')::int = 10000 and r #>> '{investment,rate_condition}' = 'para saldo novo'
     and r #>> '{investment,description}' = 'Aplicação do bônus' and r #>> '{investment,institution}' = 'Banco Azul', 'a ficha sem as chaves mantém a taxa de depois, a condição e a descrição';
  -- Uma chave do par basta: a que falta conta como nula (recusa); as duas nulas tiram.
  perform pg_temp.expect_code(format($q$select public.update_investment('tx-e-0003', %L, 3, 'CDB', 'renda_fixa', '{"index_kind":"cdi","rate_bp":11500,"rate_until":"2027-06-30"}')$q$, pg_temp.id('cdb')), 'taxa_condicional_invalida', '22023');
  r := public.update_investment('tx-e-0004', pg_temp.id('cdb'), 3, 'CDB com taxa nova', 'renda_fixa', '{"index_kind":"cdi","rate_bp":11500,"rate_until":null,"rate_after_bp":null,"rate_condition":null,"description":null}');
  assert r #> '{investment,rate_until}' = 'null'::jsonb and r #> '{investment,rate_after_bp}' = 'null'::jsonb and r #> '{investment,rate_condition}' = 'null'::jsonb
     and r #> '{investment,description}' = 'null'::jsonb, 'nulos tiram';
  r := public.update_investment('tx-e-0005', pg_temp.id('cdb'), 4, 'CDB com taxa nova', 'renda_fixa', '{"index_kind":"cdi","rate_bp":11500,"rate_until":"2027-06-30","rate_after_bp":9500,"rate_condition":"com aporte mensal"}');
  assert r #>> '{investment,rate_until}' = '2027-06-30' and (r #>> '{investment,rate_after_bp}')::int = 9500, 'de novo';
  -- Trocar a forma de render sem as chaves (app anterior): a taxa de depois e a condição saem; a descrição fica.
  r := public.update_investment('tx-e-0006', pg_temp.id('cdb'), 5, 'CDB com taxa nova', 'renda_fixa', '{"index_kind":"prefixado","rate_bp":1300,"description":"Agora prefixado"}');
  assert r #> '{investment,rate_until}' = 'null'::jsonb and r #> '{investment,rate_condition}' = 'null'::jsonb and r #>> '{investment,description}' = 'Agora prefixado',
    'outra forma de render: saem a taxa de depois e a condição';
  -- Sem a ficha, com a forma de render sem taxa (variável): nada da taxa fica.
  r := public.update_investment('tx-e-0007', pg_temp.id('pre'), 1, 'Prefixado', 'renda_fixa', '{"index_kind":"prefixado","rate_bp":1250,"rate_until":"2027-01-31","rate_after_bp":1100}');
  r := public.update_investment('tx-e-0008', pg_temp.id('pre'), 2, 'Prefixado', 'renda_fixa', '{"index_kind":"variavel"}');
  assert r #> '{investment,rate_until}' = 'null'::jsonb and r #> '{investment,rate_after_bp}' = 'null'::jsonb, 'sem taxa, sem data de fim';
  -- A repetição devolve o mesmo; outra ficha com a mesma chave é recusada.
  assert public.update_investment('tx-e-0008', pg_temp.id('pre'), 2, 'Prefixado', 'renda_fixa', '{"index_kind":"variavel"}') #>> '{investment,version}' = '3', 'repetição';
  perform pg_temp.expect_code(format($q$select public.update_investment('tx-e-0008', %L, 2, 'Prefixado', 'renda_fixa', '{"index_kind":"cdi","rate_bp":10000}')$q$, pg_temp.id('pre')), 'chave_reutilizada', 'PT409');
  -- A recusa não muda a versão.
  perform pg_temp.expect_code(format($q$select public.update_investment('tx-e-0009', %L, 1, 'Consórcio', 'outro', %L)$q$, pg_temp.id('outro'),
    jsonb_build_object('description', repeat('e', 121))), 'descricao_investimento_invalida', '22023');
  assert (pg_temp.inv('outro')).version = 1 and (pg_temp.inv('outro')).description = 'Carta de crédito do carro', 'a recusa não muda nada';
  -- Outra pessoa não edita.
  perform pg_temp.as_('bia');
  perform pg_temp.expect_code(format($q$select public.update_investment('tx-e-0010', %L, 1, 'Consórcio', 'outro', '{"description":"meu"}')$q$, pg_temp.id('outro')), 'nao_encontrado', 'P0002');
  assert (select count(*) from public.investment_items where id = pg_temp.id('outro')) = 0, 'a outra pessoa não lê';
end $$;

-- ---------------------------------------------------------------------------
-- 4. As regras da tabela valem mesmo sem as funções (defesa adicional)
-- ---------------------------------------------------------------------------
reset role;
do $$ begin
  perform pg_temp.expect_code(format($q$update public.investments set rate_until = '2027-01-01', version = version + 1 where id = %L$q$, pg_temp.id('outro')),
    'new row for relation "investments" violates check constraint "investments_rate_step_rule"', '23514');
  perform pg_temp.expect_code(format($q$update public.investments set rate_until = '2027-01-01', rate_after_bp = 60000, version = version + 1 where id = %L$q$, pg_temp.id('cdb')),
    'new row for relation "investments" violates check constraint "investments_rate_step_rule"', '23514');
  perform pg_temp.expect_code(format($q$update public.investments set rate_condition = 'todo mês', version = version + 1 where id = %L$q$, pg_temp.id('outro')),
    'new row for relation "investments" violates check constraint "investments_rate_condition_rule"', '23514');
  perform pg_temp.expect_code(format($q$update public.investments set description = ' x', version = version + 1 where id = %L$q$, pg_temp.id('outro')),
    'new row for relation "investments" violates check constraint "investments_description_rule"', '23514');
  perform pg_temp.expect_code(format($q$update public.investments set description = 'a  b', version = version + 1 where id = %L$q$, pg_temp.id('outro')),
    'new row for relation "investments" violates check constraint "investments_description_rule"', '23514');
  perform pg_temp.expect_code(format($q$update public.investments set description = '', version = version + 1 where id = %L$q$, pg_temp.id('outro')),
    'new row for relation "investments" violates check constraint "investments_description_rule"', '23514');
end $$;

rollback;
