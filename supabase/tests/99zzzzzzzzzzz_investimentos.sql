-- Investimentos (D-093; migração 0032): investments, investment_movements, investment_items e as sete funções. Confere: esquema, RLS e
-- privilégios; criar (com e sem valor atual, só no Pessoal, nome, tipo, valores, datas, limite de 50, repetição e chave reutilizada); o
-- valor de hoje pela regra I1 (atualização fecha o dia; fluxos depois dela somam); o saldo dia a dia nos movimentos (incluir, alterar e
-- excluir); encerrar e reabrir; editar; excluir de vez; operações e atividade; quem não é dono não lê.
-- Pessoas FICTÍCIAS: Lia (com uma Família) e Edu. Tudo em uma transação desfeita no fim.
\set ON_ERROR_STOP 1
\set lia '''00000000-0000-0000-0000-0000000000f1'''
\set edu '''00000000-0000-0000-0000-0000000000f2'''

begin;
set local clarevo.today = '2026-11-11';

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
create function pg_temp.expect_detail(p_sql text, p_code text, p_detail text) returns void language plpgsql as $$
declare
  d text;
begin
  begin
    execute p_sql;
  exception when others then
    get stacked diagnostics d = pg_exception_detail;
    if sqlerrm = p_code and d = p_detail then return; end if;
    raise exception 'esperado % (%), veio "%" (%) em: %', p_code, p_detail, sqlerrm, d, left(p_sql, 300);
  end;
  raise exception 'esperado erro %, mas passou: %', p_code, left(p_sql, 300);
end $$;

create temp table ids (name text primary key, id uuid);
grant select, insert on ids to authenticated, anon;
create function pg_temp.id(p_name text) returns uuid language sql as $$ select id from ids where name = p_name $$;
create function pg_temp.as_(p_name text) returns text language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(pg_temp.id(p_name)::text, ''), true)
$$;
create function pg_temp.item(p_name text) returns public.investment_items language sql security definer set search_path = public, pg_temp as $$
  select x from public.investment_items x where x.id = pg_temp.id(p_name)
$$;
create function pg_temp.ops(p_action text) returns bigint language sql security definer set search_path = public, pg_temp as $$
  select count(*) from public.record_operations where action = p_action
$$;
create function pg_temp.lastwrite(p_name text, p_ctx text) returns text language sql security definer set search_path = public, pg_temp as $$
  select coalesce((select to_char(last_write_on, 'YYYY-MM-DD') from public.context_activity
                    where person_id = pg_temp.id(p_name) and context_id = pg_temp.id(p_ctx)), '-')
$$;
create function pg_temp.mov(p_key text, p_inv text, p_kind text, p_cents bigint, p_on date) returns jsonb language sql as $$
  select public.add_investment_movement(p_key, pg_temp.id(p_inv), p_kind, p_cents, p_on, null)
$$;
create function pg_temp.mov_sql(p_key text, p_inv text, p_kind text, p_cents bigint, p_on date) returns text language sql as $$
  select format('select pg_temp.mov(%L, %L, %L, %s, %L::date)', p_key, p_inv, p_kind, p_cents, p_on)
$$;

-- ---------------------------------------------------------------------------
-- 1. Esquema, RLS e privilégios
-- ---------------------------------------------------------------------------
do $$ begin
  assert (select relrowsecurity from pg_class where oid = 'public.investments'::regclass)
     and (select relrowsecurity from pg_class where oid = 'public.investment_movements'::regclass), 'RLS ligada';
  assert (select reloptions from pg_class where oid = 'public.investment_items'::regclass) @> array['security_invoker=true'], 'a visão com a RLS de quem consulta';
  assert has_table_privilege('authenticated', 'public.investments', 'select') and not has_table_privilege('authenticated', 'public.investments', 'insert')
     and not has_table_privilege('authenticated', 'public.investment_movements', 'update') and not has_table_privilege('authenticated', 'public.investment_movements', 'delete'),
    'só leitura direta';
  assert not has_table_privilege('anon', 'public.investment_items', 'select'), 'anon não lê';
  assert has_function_privilege('authenticated', 'public.create_investment(text, uuid, text, text, bigint, date, bigint)', 'execute')
     and has_function_privilege('authenticated', 'public.add_investment_movement(text, uuid, text, bigint, date, text)', 'execute')
     and has_function_privilege('authenticated', 'public.delete_investment(text, uuid, integer)', 'execute'), 'o app executa as funções';
  assert not has_function_privilege('anon', 'public.create_investment(text, uuid, text, text, bigint, date, bigint)', 'execute'), 'anon não';
  assert not has_function_privilege('authenticated', 'public.clarevo_investment_negative_day(uuid)', 'execute')
     and not has_function_privilege('authenticated', 'public.clarevo_lock_investment(uuid)', 'execute')
     and not has_function_privilege('authenticated', 'public.clarevo_investment_result(uuid, uuid)', 'execute'), 'auxiliares fechadas';
end $$;

insert into ids values ('lia', :lia), ('edu', :edu);
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  (:lia, 'lia.inv@exemplo.test', now(), '{"display_name":"Lia"}'),
  (:edu, 'edu.inv@exemplo.test', now(), '{"display_name":"Edu"}');

set role authenticated;
do $$
declare
  p text;
  space jsonb;
begin
  foreach p in array array['lia', 'edu'] loop
    perform pg_temp.as_(p);
    space := public.ensure_personal_space('Conta principal');
    insert into ids values (p || '_ctx', (space ->> 'context_id')::uuid);
  end loop;
  perform pg_temp.as_('lia');
  insert into ids values ('fam', (public.create_family('Casa da Lia', 'iv-fam-0001') #>> '{context,id}')::uuid);
end $$;

-- ---------------------------------------------------------------------------
-- 2. Criar
-- ---------------------------------------------------------------------------
do $$
declare
  r jsonb;
  before_w text := pg_temp.lastwrite('lia', 'lia_ctx');
begin
  perform pg_temp.as_('lia');
  -- Com valor atual: R$ 1.000,00 aplicados em 10/03/2026 e R$ 1.080,00 hoje.
  r := public.create_investment('iv-c-0001', pg_temp.id('lia_ctx'), '  Reserva   no banco ', 'renda_fixa', 100000, '2026-03-10', 108000);
  insert into ids values ('rf', (r #>> '{investment,id}')::uuid);
  assert r #>> '{investment,name}' = 'Reserva no banco' and r #>> '{investment,kind}' = 'renda_fixa' and r #>> '{investment,status}' = 'ativo'
     and (r #>> '{investment,deposits_cents}')::bigint = 100000 and (r #>> '{investment,value_cents}')::bigint = 108000
     and r #>> '{investment,last_value_on}' = '2026-11-11' and r #>> '{investment,first_movement_on}' = '2026-03-10'
     and (r #>> '{investment,version}')::int = 1 and r -> 'movement' = 'null'::jsonb, 'criado com o aporte e o valor de hoje';
  assert (select count(*) from public.investment_movements where investment_id = pg_temp.id('rf')) = 2, 'dois movimentos';
  assert public.create_investment('iv-c-0001', pg_temp.id('lia_ctx'), '  Reserva   no banco ', 'renda_fixa', 100000, '2026-03-10', 108000) = r, 'repetição';
  assert pg_temp.ops('criar_investimento') = 1, 'uma operação';
  assert pg_temp.lastwrite('lia', 'lia_ctx') = '2026-11-11', 'conta como anotação';
  perform pg_temp.expect_code($q$select public.create_investment('iv-c-0001', pg_temp.id('lia_ctx'), 'Outro', 'renda_fixa', 1, '2026-03-10', null)$q$, 'chave_reutilizada', 'PT409');
  -- Sem valor atual: o valor é o custo, sem data de atualização.
  r := public.create_investment('iv-c-0002', pg_temp.id('lia_ctx'), 'Ações', 'acoes', 50000, '2026-11-11', null);
  insert into ids values ('acoes', (r #>> '{investment,id}')::uuid);
  assert (r #>> '{investment,value_cents}')::bigint = 50000 and r #> '{investment,last_value_on}' = 'null'::jsonb, 'sem valor atual: o custo';
  -- Recusas.
  perform pg_temp.expect_code($q$select public.create_investment('iv-c-0101', pg_temp.id('fam'), 'Da casa', 'fundos', 1000, '2026-11-01', null)$q$, 'contexto_invalido', '22023');
  perform pg_temp.expect_code($q$select public.create_investment('iv-c-0102', pg_temp.id('edu_ctx'), 'Do Edu', 'fundos', 1000, '2026-11-01', null)$q$, 'nao_encontrado', 'P0002');
  perform pg_temp.expect_code($q$select public.create_investment('iv-c-0103', pg_temp.id('lia_ctx'), '   ', 'fundos', 1000, '2026-11-01', null)$q$, 'nome_invalido', '22023');
  perform pg_temp.expect_code($q$select public.create_investment('iv-c-0104', pg_temp.id('lia_ctx'), repeat('x', 41), 'fundos', 1000, '2026-11-01', null)$q$, 'nome_invalido', '22023');
  perform pg_temp.expect_code($q$select public.create_investment('iv-c-0105', pg_temp.id('lia_ctx'), 'Poupança', 'poupanca', 1000, '2026-11-01', null)$q$, 'tipo_invalido', '22023');
  perform pg_temp.expect_code($q$select public.create_investment('iv-c-0106', pg_temp.id('lia_ctx'), 'Zero', 'fundos', 0, '2026-11-01', null)$q$, 'valor_invalido', '22023');
  perform pg_temp.expect_code($q$select public.create_investment('iv-c-0107', pg_temp.id('lia_ctx'), 'Amanhã', 'fundos', 1000, '2026-11-12', null)$q$, 'data_futura', '22023');
  perform pg_temp.expect_code($q$select public.create_investment('iv-c-0108', pg_temp.id('lia_ctx'), 'Negativo', 'fundos', 1000, '2026-11-01', -1)$q$, 'valor_invalido', '22023');
  assert pg_temp.ops('criar_investimento') = 2, 'recusas não gravam';
end $$;

-- Limite de 50 ativos.
do $$
declare
  i int;
begin
  perform pg_temp.as_('lia');
  for i in 3 .. 50 loop
    perform public.create_investment('iv-l-' || lpad(i::text, 4, '0'), pg_temp.id('lia_ctx'), 'Extra ' || i, 'outro', 100, '2026-11-11', null);
  end loop;
  perform pg_temp.expect_code($q$select public.create_investment('iv-l-0051', pg_temp.id('lia_ctx'), 'O 51', 'outro', 100, '2026-11-11', null)$q$, 'limite_de_investimentos', 'PT409');
end $$;

-- ---------------------------------------------------------------------------
-- 3. Movimentos, o valor de hoje e o saldo dia a dia (I1)
-- ---------------------------------------------------------------------------
do $$
declare
  r jsonb;
  m uuid;
begin
  perform pg_temp.as_('lia');
  -- Um aporte de R$ 200,00 hoje, depois da atualização de hoje no mesmo dia: a atualização fecha o dia e já o inclui.
  r := pg_temp.mov('iv-m-0001', 'rf', 'aporte', 20000, '2026-11-11');
  assert (pg_temp.item('rf')).value_cents = 108000 and (pg_temp.item('rf')).deposits_cents = 120000, 'a atualização do dia fecha o dia';
  -- Uma atualização em 01/11 (antes da de hoje) não muda o valor de hoje.
  perform pg_temp.mov('iv-m-0002', 'rf', 'valor', 104000, '2026-11-01');
  assert (pg_temp.item('rf')).value_cents = 108000 and (pg_temp.item('rf')).last_value_on = '2026-11-11', 'vale a atualização mais recente';
  -- Ações, sem atualização: o valor é o aportado menos o resgatado.
  perform pg_temp.mov('iv-m-0003', 'acoes', 'resgate', 10000, '2026-11-11');
  assert (pg_temp.item('acoes')).value_cents = 40000 and (pg_temp.item('acoes')).withdrawals_cents = 10000, 'custo menos resgate';
  -- Rendimento pago não muda o valor.
  perform pg_temp.mov('iv-m-0004', 'acoes', 'rendimento', 1500, '2026-11-11');
  assert (pg_temp.item('acoes')).value_cents = 40000 and (pg_temp.item('acoes')).income_cents = 1500, 'rendimento à parte';
  -- I1: resgate maior que o valor do dia.
  perform pg_temp.expect_detail(pg_temp.mov_sql('iv-m-0101', 'acoes', 'resgate', 40001, '2026-11-11'), 'valor_insuficiente', 'dia=2026-11-11');
  -- I1: um resgate no passado que passa do valor daquele dia (a aplicação de R$ 1.000,00 é de 10/03; antes dela, nada).
  perform pg_temp.expect_detail(pg_temp.mov_sql('iv-m-0102', 'rf', 'resgate', 1000, '2026-03-01'), 'valor_insuficiente', 'dia=2026-03-01');
  -- Atualização para R$ 0,00 aceita. Um resgate no mesmo dia também passa: a atualização fecha o dia e já o inclui (I1).
  perform pg_temp.mov('iv-m-0005', 'acoes', 'valor', 0, '2026-11-11');
  assert (pg_temp.item('acoes')).value_cents = 0, 'perda total';
  perform pg_temp.mov('iv-m-0103', 'acoes', 'resgate', 1, '2026-11-11');
  assert (pg_temp.item('acoes')).value_cents = 0 and (pg_temp.item('acoes')).withdrawals_cents = 10001, 'o resgate do dia fica dentro da atualização';
  -- Validação.
  perform pg_temp.expect_code(pg_temp.mov_sql('iv-m-0104', 'rf', 'aporte', 0, '2026-11-11'), 'valor_invalido', '22023');
  perform pg_temp.expect_code(pg_temp.mov_sql('iv-m-0105', 'rf', 'aporte', 100, '2026-11-12'), 'data_futura', '22023');
  perform pg_temp.expect_code(pg_temp.mov_sql('iv-m-0106', 'rf', 'dividendo', 100, '2026-11-11'), 'tipo_invalido', '22023');
  assert pg_temp.ops('registrar_movimento_investimento') = 6, 'só os que gravaram';

  -- Alterar: a versão, o tipo fixo e o saldo dia a dia.
  m := (r #>> '{movement,id}')::uuid;
  r := public.update_investment_movement('iv-u-0001', m, 1, 25000, '2026-11-11', 'ajuste');
  assert (r #>> '{movement,version}')::int = 2 and (r #>> '{movement,amount_cents}')::bigint = 25000 and r #>> '{movement,note}' = 'ajuste', 'alterado';
  perform pg_temp.expect_code(format($q$select public.update_investment_movement('iv-u-0002', %L, 1, 1, '2026-11-11', null)$q$, m), 'versao_desatualizada', 'PT409');
  -- O aporte inicial de R$ 1.000,00 em 10/03 sustenta a carteira até a atualização de 01/11: tirar ele para 2026-11-02 deixa 01/11 com R$ 1.040,00 (a atualização), sem negativo.
  -- Mas um resgate de R$ 1.000,00 em 20/03, com o aporte movido para depois dele, fica negativo.
  perform pg_temp.mov('iv-m-0006', 'rf', 'resgate', 50000, '2026-03-20');
  perform pg_temp.expect_detail(format($q$select public.update_investment_movement('iv-u-0003', %L, 1, 100000, '2026-03-25', null)$q$,
    (select id from public.investment_movements where investment_id = pg_temp.id('rf') and kind = 'aporte' and occurred_on = '2026-03-10')), 'valor_insuficiente', 'dia=2026-03-20');
  -- Excluir o aporte que cobre o resgate também é recusado.
  perform pg_temp.expect_detail(format($q$select public.delete_investment_movement('iv-d-0001', %L, 1)$q$,
    (select id from public.investment_movements where investment_id = pg_temp.id('rf') and kind = 'aporte' and occurred_on = '2026-03-10')), 'valor_insuficiente', 'dia=2026-03-20');
  -- Excluir o resgate passa.
  r := public.delete_investment_movement('iv-d-0002', (select id from public.investment_movements where investment_id = pg_temp.id('rf') and kind = 'resgate'), 1);
  assert r ->> 'deleted' = 'true' and (r #>> '{investment,withdrawals_cents}')::bigint = 0, 'resgate excluído de vez';
  assert public.delete_investment_movement('iv-d-0002', (r ->> 'id')::uuid, 1) ->> 'deleted' = 'true', 'repetição da exclusão';
end $$;

-- ---------------------------------------------------------------------------
-- 4. Encerrar, reabrir, editar e excluir
-- ---------------------------------------------------------------------------
do $$
declare
  r jsonb;
begin
  perform pg_temp.as_('lia');
  r := public.set_investment_status('iv-s-0001', pg_temp.id('acoes'), 1, 'encerrado');
  assert r #>> '{investment,status}' = 'encerrado' and (r #>> '{investment,version}')::int = 2, 'encerrado';
  perform pg_temp.expect_code(pg_temp.mov_sql('iv-s-0101', 'acoes', 'aporte', 100, '2026-11-11'), 'investimento_encerrado', 'PT409');
  perform pg_temp.expect_code(format($q$select public.set_investment_status('iv-s-0102', %L, 1, 'ativo')$q$, pg_temp.id('acoes')), 'versao_desatualizada', 'PT409');
  perform pg_temp.expect_code(format($q$select public.set_investment_status('iv-s-0103', %L, 2, 'pausado')$q$, pg_temp.id('acoes')), 'situacao_invalida', '22023');
  -- Com 49 ativos (Ações saiu), reabrir passa; o limite volta a valer.
  r := public.set_investment_status('iv-s-0002', pg_temp.id('acoes'), 2, 'ativo');
  assert r #>> '{investment,status}' = 'ativo', 'reaberto';
  -- Editar nome e tipo.
  r := public.update_investment('iv-e-0001', pg_temp.id('acoes'), 3, 'Ações da bolsa', 'acoes');
  assert r #>> '{investment,name}' = 'Ações da bolsa' and (r #>> '{investment,version}')::int = 4, 'editado';
  perform pg_temp.expect_code(format($q$select public.update_investment('iv-e-0002', %L, 3, 'X', 'acoes')$q$, pg_temp.id('acoes')), 'versao_desatualizada', 'PT409');
  perform pg_temp.expect_code(format($q$select public.update_investment('iv-e-0003', %L, 4, 'X', 'imovel')$q$, pg_temp.id('acoes')), 'tipo_invalido', '22023');
  -- Excluir de vez, com os movimentos.
  r := public.delete_investment('iv-x-0001', pg_temp.id('acoes'), 4);
  assert r ->> 'deleted' = 'true' and r ->> 'id' = pg_temp.id('acoes')::text, 'excluído';
  assert public.delete_investment('iv-x-0001', pg_temp.id('acoes'), 4) = r, 'repetição';
  assert pg_temp.item('acoes') is null and not exists (select 1 from public.investment_movements where investment_id = pg_temp.id('acoes')), 'sem rastro';
  perform pg_temp.expect_code(format($q$select public.delete_investment('iv-x-0002', %L, 4)$q$, pg_temp.id('acoes')), 'nao_encontrado', 'P0002');
end $$;

-- ---------------------------------------------------------------------------
-- 5. Quem não é dono não lê nem escreve
-- ---------------------------------------------------------------------------
do $$ begin
  perform pg_temp.as_('edu');
  assert (select count(*) from public.investment_items) = 0 and (select count(*) from public.investment_movements) = 0, 'Edu não vê os da Lia';
  perform pg_temp.expect_code(pg_temp.mov_sql('iv-o-0001', 'rf', 'aporte', 100, '2026-11-11'), 'nao_encontrado', 'P0002');
  perform pg_temp.expect_code(format($q$select public.delete_investment('iv-o-0002', %L, 1)$q$, pg_temp.id('rf')), 'nao_encontrado', 'P0002');
  perform pg_temp.as_('');
  perform pg_temp.expect_code($q$select public.create_investment('iv-o-0003', null, 'X', 'outro', 1, '2026-11-01', null)$q$, 'nao_autenticado', '42501');
end $$;

-- Toda operação aponta para o alvo.
reset role;
do $$ begin
  assert not exists (select 1 from public.record_operations where action like '%investimento%' and (target_id is null or record_id is not null or commitment_id is not null)),
    'operações com alvo';
end $$;

rollback;
