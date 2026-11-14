-- Quantidade e CNPJ do fundo na ficha e meta que lê o valor dos investimentos ligados (D-099, itens 19, 20 e 13 fase 2; migração 0037):
-- Q1 (quantidade só em títulos públicos e fundos, CNPJ só em fundos e válido; sem a chave, ficam; nulo tira), V1 (origem do valor da
-- meta, só no Pessoal, com a operação e a soma dos investimentos ativos ligados). Privilégios e regras da tabela.
-- Pessoas FICTÍCIAS: Lu e Teo. Tudo em uma transação desfeita no fim.
\set ON_ERROR_STOP 1
\set lu '''00000000-0000-0000-0000-0000000000fa'''
\set teo '''00000000-0000-0000-0000-0000000000fb'''

begin;
set local clarevo.today = '2026-11-14';

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
create function pg_temp.saved(p_goal text) returns bigint language sql security definer set search_path = public, pg_temp as $$
  select saved_cents from public.goal_items where id = pg_temp.id(p_goal)
$$;

-- ---------------------------------------------------------------------------
-- 1. Esquema, privilégios e o CNPJ
-- ---------------------------------------------------------------------------
do $$ begin
  assert public.clarevo_cnpj_valid('00017024000153') and public.clarevo_cnpj_valid('12ABC34501DE35') and public.clarevo_cnpj_valid('11111111000191'),
    'CNPJ numérico e alfanumérico válidos';
  assert not public.clarevo_cnpj_valid('00017024000154') and not public.clarevo_cnpj_valid('11111111111111') and not public.clarevo_cnpj_valid('00.017.024/0001-53')
     and not public.clarevo_cnpj_valid('12abc34501de35') and not public.clarevo_cnpj_valid(null), 'dígitos errados, repetidos, com pontuação, minúsculas e nulo recusados';
  assert not has_function_privilege('authenticated', 'public.clarevo_cnpj_valid(text)', 'execute')
     and not has_function_privilege('authenticated', 'public.clarevo_investment_quantity(text, jsonb, bigint)', 'execute')
     and not has_function_privilege('authenticated', 'public.clarevo_investment_fund_cnpj(text, jsonb, text)', 'execute'), 'auxiliares fechados';
  assert has_function_privilege('authenticated', 'public.set_goal_value_source(text, uuid, integer, text)', 'execute')
     and not has_function_privilege('anon', 'public.set_goal_value_source(text, uuid, integer, text)', 'execute'), 'o app grava a origem do valor';
  assert (select p.prosecdef and p.proconfig @> array['search_path=public'] from pg_proc p where p.oid = 'public.set_goal_value_source(text, uuid, integer, text)'::regprocedure),
    'security definer com search_path fixo';
  assert (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in ('create_investment', 'update_investment')) = 2, 'uma de cada (mesma assinatura)';
  assert (select column_default from information_schema.columns where table_schema = 'public' and table_name = 'goals' and column_name = 'value_source') = '''registros''::text',
    'metas começam com o valor dos registros';
end $$;

insert into ids values ('lu', :lu), ('teo', :teo);
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  (:lu, 'lu.precos@exemplo.test', now(), '{"display_name":"Lu"}'),
  (:teo, 'teo.precos@exemplo.test', now(), '{"display_name":"Teo"}');

set role authenticated;
do $$
declare
  space jsonb;
  p text;
begin
  foreach p in array array['lu', 'teo'] loop
    perform pg_temp.as_(p);
    space := public.ensure_personal_space('Conta principal');
    insert into ids values (p || '_ctx', (space ->> 'context_id')::uuid);
  end loop;
  perform pg_temp.as_('lu');
  insert into ids values ('fam', (public.create_family('Casa da Lu', 'pc-fam-0001') #>> '{context,id}')::uuid);
end $$;

-- ---------------------------------------------------------------------------
-- 2. Quantidade e CNPJ (Q1)
-- ---------------------------------------------------------------------------
do $$
declare
  r jsonb;
begin
  perform pg_temp.as_('lu');
  r := public.create_investment('pc-c-0001', pg_temp.id('lu_ctx'), 'Fundo DI', 'fundos', 100000, '2026-10-01', null,
                                '{"subkind":"fundo_renda_fixa","quantity_micro":1234567891,"fund_cnpj":"00017024000153"}');
  insert into ids values ('fundo', (r #>> '{investment,id}')::uuid);
  assert (r #>> '{investment,quantity_micro}')::bigint = 1234567891 and r #>> '{investment,fund_cnpj}' = '00017024000153', 'fundo com quantidade e CNPJ';
  assert (select quantity_micro from public.investment_items where id = pg_temp.id('fundo')) = 1234567891, 'a visão mostra a quantidade';
  r := public.create_investment('pc-c-0002', pg_temp.id('lu_ctx'), 'Selic 2029', 'titulos_publicos', 1000000, '2026-10-01', null,
                                '{"subkind":"tesouro_selic","maturity_on":"2029-03-01","quantity_micro":500000}');
  insert into ids values ('selic', (r #>> '{investment,id}')::uuid);
  assert (r #>> '{investment,quantity_micro}')::bigint = 500000 and r #> '{investment,fund_cnpj}' = 'null'::jsonb, 'título com quantidade';
  -- Sem as chaves (versão anterior do app): sem quantidade e sem CNPJ.
  r := public.create_investment('pc-c-0003', pg_temp.id('lu_ctx'), 'Ações', 'acoes', 50000, '2026-10-01', null, '{"subkind":"acao"}');
  insert into ids values ('acoes', (r #>> '{investment,id}')::uuid);
  assert r #> '{investment,quantity_micro}' = 'null'::jsonb, 'sem a chave, sem quantidade';

  -- Recusas: quantidade em outro tipo, zero, fração, texto, acima do limite; CNPJ em outro tipo, dígitos errados, número, formatado.
  perform pg_temp.expect_code(format($q$select public.create_investment('pc-c-0010', %L, 'X', 'acoes', 100, '2026-10-01', null, '{"quantity_micro":1000000}')$q$, pg_temp.id('lu_ctx')), 'quantidade_invalida', '22023');
  perform pg_temp.expect_code(format($q$select public.create_investment('pc-c-0011', %L, 'X', 'fundos', 100, '2026-10-01', null, '{"quantity_micro":0}')$q$, pg_temp.id('lu_ctx')), 'quantidade_invalida', '22023');
  perform pg_temp.expect_code(format($q$select public.create_investment('pc-c-0012', %L, 'X', 'fundos', 100, '2026-10-01', null, '{"quantity_micro":1.5}')$q$, pg_temp.id('lu_ctx')), 'quantidade_invalida', '22023');
  perform pg_temp.expect_code(format($q$select public.create_investment('pc-c-0013', %L, 'X', 'fundos', 100, '2026-10-01', null, '{"quantity_micro":"1000"}')$q$, pg_temp.id('lu_ctx')), 'quantidade_invalida', '22023');
  perform pg_temp.expect_code(format($q$select public.create_investment('pc-c-0014', %L, 'X', 'fundos', 100, '2026-10-01', null, '{"quantity_micro":1000000000000001}')$q$, pg_temp.id('lu_ctx')), 'quantidade_invalida', '22023');
  perform pg_temp.expect_code(format($q$select public.create_investment('pc-c-0015', %L, 'X', 'titulos_publicos', 100, '2026-10-01', null, '{"fund_cnpj":"00017024000153"}')$q$, pg_temp.id('lu_ctx')), 'cnpj_invalido', '22023');
  perform pg_temp.expect_code(format($q$select public.create_investment('pc-c-0016', %L, 'X', 'fundos', 100, '2026-10-01', null, '{"fund_cnpj":"00017024000154"}')$q$, pg_temp.id('lu_ctx')), 'cnpj_invalido', '22023');
  perform pg_temp.expect_code(format($q$select public.create_investment('pc-c-0017', %L, 'X', 'fundos', 100, '2026-10-01', null, '{"fund_cnpj":17024000153}')$q$, pg_temp.id('lu_ctx')), 'cnpj_invalido', '22023');
  perform pg_temp.expect_code(format($q$select public.create_investment('pc-c-0018', %L, 'X', 'fundos', 100, '2026-10-01', null, '{"fund_cnpj":"00.017.024/0001-53"}')$q$, pg_temp.id('lu_ctx')), 'cnpj_invalido', '22023');
  -- A ficha confere os outros campos antes (mesma ordem do núcleo).
  perform pg_temp.expect_code(format($q$select public.create_investment('pc-c-0019', %L, 'X', 'fundos', 100, '2026-10-01', null, '{"subkind":"cdb","quantity_micro":0}')$q$, pg_temp.id('lu_ctx')), 'subtipo_invalido', '22023');
  assert (select count(*) from public.investments where context_id = pg_temp.id('lu_ctx')) = 3, 'recusas não gravam';

  -- Editar: sem a ficha, ficam; a ficha sem as chaves (versão anterior do app), ficam; nulos tiram; trocar o tipo tira o que não vale mais.
  r := public.update_investment('pc-e-0001', pg_temp.id('fundo'), 1, 'Fundo DI do banco', 'fundos');
  assert (r #>> '{investment,quantity_micro}')::bigint = 1234567891 and r #>> '{investment,fund_cnpj}' = '00017024000153', 'sem a ficha, ficam';
  r := public.update_investment('pc-e-0002', pg_temp.id('fundo'), 2, 'Fundo DI do banco', 'fundos', '{"subkind":"fundo_renda_fixa","institution":"Banco Azul"}');
  assert (r #>> '{investment,quantity_micro}')::bigint = 1234567891 and r #>> '{investment,fund_cnpj}' = '00017024000153' and r #>> '{investment,institution}' = 'Banco Azul',
    'a ficha sem as chaves mantém quantidade e CNPJ';
  r := public.update_investment('pc-e-0003', pg_temp.id('fundo'), 3, 'Fundo DI do banco', 'fundos', '{"quantity_micro":2000000,"fund_cnpj":null}');
  assert (r #>> '{investment,quantity_micro}')::bigint = 2000000 and r #> '{investment,fund_cnpj}' = 'null'::jsonb, 'quantidade trocada, CNPJ tirado';
  r := public.update_investment('pc-e-0004', pg_temp.id('fundo'), 4, 'Fundo DI do banco', 'fundos', '{"quantity_micro":null,"fund_cnpj":"12ABC34501DE35"}');
  assert r #> '{investment,quantity_micro}' = 'null'::jsonb and r #>> '{investment,fund_cnpj}' = '12ABC34501DE35', 'quantidade tirada, CNPJ alfanumérico';
  -- O título passa a fundo sem a ficha: a quantidade fica (o novo tipo aceita); a fundo de ações, a renda fixa: tudo sai.
  r := public.update_investment('pc-e-0005', pg_temp.id('selic'), 1, 'Selic 2029', 'fundos');
  assert (r #>> '{investment,quantity_micro}')::bigint = 500000, 'o novo tipo aceita a quantidade';
  r := public.update_investment('pc-e-0006', pg_temp.id('fundo'), 5, 'Fundo DI do banco', 'renda_fixa');
  assert r #> '{investment,fund_cnpj}' = 'null'::jsonb and r #> '{investment,quantity_micro}' = 'null'::jsonb, 'o novo tipo não aceita: saem';
  perform pg_temp.expect_code(format($q$select public.update_investment('pc-e-0007', %L, 2, 'Selic 2029', 'fundos', '{"fund_cnpj":"00017024000154"}')$q$, pg_temp.id('selic')), 'cnpj_invalido', '22023');
  assert (pg_temp.inv('selic')).version = 2, 'a recusa não muda a versão';
end $$;

-- As regras da tabela valem mesmo sem as funções (defesa adicional).
reset role;
do $$ begin
  perform pg_temp.expect_code(format($q$update public.investments set quantity_micro = 1, version = version + 1 where id = %L$q$, pg_temp.id('acoes')),
    'new row for relation "investments" violates check constraint "investments_quantity_rule"', '23514');
  perform pg_temp.expect_code(format($q$update public.investments set fund_cnpj = '00017024000154', version = version + 1 where id = %L$q$, pg_temp.id('selic')),
    'new row for relation "investments" violates check constraint "investments_fund_cnpj_rule"', '23514');
  perform pg_temp.expect_code(format($q$update public.investments set quantity_micro = 0, version = version + 1 where id = %L$q$, pg_temp.id('selic')),
    'new row for relation "investments" violates check constraint "investments_quantity_rule"', '23514');
end $$;

-- ---------------------------------------------------------------------------
-- 3. Meta que lê o valor dos investimentos ligados (V1)
-- ---------------------------------------------------------------------------
set role authenticated;
do $$
declare
  r jsonb;
  g jsonb;
begin
  perform pg_temp.as_('lu');
  -- Reserva com R$ 3.000,00 registrados; dois investimentos ligados (R$ 10.800,00 e R$ 2.000,00) e um encerrado ligado.
  g := public.create_goal('pc-g-0001', pg_temp.id('lu_ctx'), 'emergencia', 'Reserva', 2250000, null, null, 375000, 6, 'informado', 300000, '2026-10-01');
  insert into ids values ('reserva', (g #>> '{goal,id}')::uuid);
  r := public.create_investment('pc-i-0001', pg_temp.id('lu_ctx'), 'Caixinha', 'renda_fixa', 1000000, '2026-10-01', 1080000,
                                jsonb_build_object('goal_id', pg_temp.id('reserva')::text, 'liquidity', 'diaria'));
  insert into ids values ('caixinha', (r #>> '{investment,id}')::uuid);
  r := public.create_investment('pc-i-0002', pg_temp.id('lu_ctx'), 'CDB', 'renda_fixa', 200000, '2026-10-01', null, jsonb_build_object('goal_id', pg_temp.id('reserva')::text));
  insert into ids values ('cdb', (r #>> '{investment,id}')::uuid);
  r := public.create_investment('pc-i-0003', pg_temp.id('lu_ctx'), 'Antigo', 'renda_fixa', 70000, '2026-10-01', null, jsonb_build_object('goal_id', pg_temp.id('reserva')::text));
  insert into ids values ('antigo', (r #>> '{investment,id}')::uuid);
  perform public.set_investment_status('pc-i-0004', pg_temp.id('antigo'), 1, 'encerrado');
  assert pg_temp.saved('reserva') = 300000 and g #>> '{goal,value_source}' = 'registros', 'começa pelos registros';

  -- Pelos investimentos: a soma dos ativos ligados (o encerrado fica fora); o retorno da função tem o mesmo valor.
  g := public.set_goal_value_source('pc-v-0001', pg_temp.id('reserva'), 1, 'investimentos');
  assert g #>> '{goal,value_source}' = 'investimentos' and (g #>> '{goal,saved_cents}')::bigint = 1280000 and (g #>> '{goal,version}')::int = 2,
    'retorno com o valor dos investimentos';
  assert pg_temp.saved('reserva') = 1280000, 'goal_items com o valor dos investimentos';
  assert (select initial_cents from public.goal_items where id = pg_temp.id('reserva')) = 300000, 'os movimentos da meta seguem guardados';
  assert public.set_goal_value_source('pc-v-0001', pg_temp.id('reserva'), 1, 'investimentos') = g, 'repetição';
  assert (select count(*) from public.record_operations where action = 'origem_valor_meta') = 1, 'uma operação';
  assert (select o.target_id = pg_temp.id('reserva') and o.record_id is null and o.commitment_id is null
            from public.record_operations o where o.idempotency_key = 'pc-v-0001'), 'a meta no alvo';
  perform pg_temp.expect_code(format($q$select public.set_goal_value_source('pc-v-0001', %L, 1, 'registros')$q$, pg_temp.id('reserva')), 'chave_reutilizada', 'PT409');

  -- Um aporte no investimento muda o valor da meta (o CDB não tem valor atualizado: vale o aplicado); desligar o investimento também.
  perform public.add_investment_movement('pc-m-0001', pg_temp.id('cdb'), 'aporte', 50000, '2026-11-14', null);
  assert pg_temp.saved('reserva') = 1330000, 'o aporte no investimento conta na meta';
  r := public.update_investment('pc-e-0101', pg_temp.id('caixinha'), 1, 'Caixinha', 'renda_fixa', '{"liquidity":"diaria","goal_id":null}');
  assert pg_temp.saved('reserva') = 250000, 'sem a ligação da caixinha, só o CDB';

  -- Recusas: versão, origem estranha, meta da Família, meta de outra pessoa.
  perform pg_temp.expect_code(format($q$select public.set_goal_value_source('pc-v-0002', %L, 1, 'registros')$q$, pg_temp.id('reserva')), 'versao_desatualizada', 'PT409');
  perform pg_temp.expect_code(format($q$select public.set_goal_value_source('pc-v-0003', %L, 2, 'extrato')$q$, pg_temp.id('reserva')), 'origem_invalida', '22023');
  insert into ids values ('sofa', (public.create_goal('pc-g-0002', pg_temp.id('fam'), 'objetivo', 'Sofá', 300000, null, null, null, null, null, null, null) #>> '{goal,id}')::uuid);
  perform pg_temp.expect_code(format($q$select public.set_goal_value_source('pc-v-0004', %L, 1, 'investimentos')$q$, pg_temp.id('sofa')), 'contexto_invalido', '22023');
  assert (public.set_goal_value_source('pc-v-0005', pg_temp.id('sofa'), 1, 'registros') #>> '{goal,version}')::int = 2, 'na Família, "registros" pode';
  perform pg_temp.as_('teo');
  perform pg_temp.expect_code(format($q$select public.set_goal_value_source('pc-v-0006', %L, 2, 'registros')$q$, pg_temp.id('reserva')), 'nao_encontrado', 'P0002');
  perform pg_temp.as_('lu');
  assert (select count(*) from public.record_operations where idempotency_key between 'pc-v-0002' and 'pc-v-0004') = 0, 'recusas não gravam';

  -- De volta aos registros: o valor volta a ser o dos movimentos.
  g := public.set_goal_value_source('pc-v-0007', pg_temp.id('reserva'), 2, 'registros');
  assert (g #>> '{goal,saved_cents}')::bigint = 300000 and pg_temp.saved('reserva') = 300000, 'de volta aos registros';
end $$;

-- A regra da tabela das metas vale mesmo sem a função.
reset role;
do $$ begin
  perform pg_temp.expect_code(format($q$update public.goals set value_source = 'outra', version = version + 1 where id = %L$q$, pg_temp.id('reserva')),
    'new row for relation "goals" violates check constraint "goals_value_source_check"', '23514');
end $$;

rollback;
