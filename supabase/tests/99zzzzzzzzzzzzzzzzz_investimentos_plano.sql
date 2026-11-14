-- Plano de aportes dos investimentos e investimento ligado a uma meta (D-099, P2; migração 0036): P1 (só no Pessoal, uma linha por
-- contexto, sem valor a linha sai), P2 (operação e anotação), M1 (meta do contexto, viva e não arquivada; excluir de vez tira a
-- ligação) e M2 (a ligação viaja na ficha; sem a ficha, fica se a meta continuar valendo). Privilégios e guardas.
-- Pessoas FICTÍCIAS: Noa e Ivo. Tudo em uma transação desfeita no fim.
\set ON_ERROR_STOP 1
\set noa '''00000000-0000-0000-0000-0000000000f8'''
\set ivo '''00000000-0000-0000-0000-0000000000f9'''

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
create function pg_temp.ops(p_action text) returns bigint language sql security definer set search_path = public, pg_temp as $$
  select count(*) from public.record_operations where action = p_action
$$;
create function pg_temp.lastwrite(p_name text, p_ctx text) returns text language sql security definer set search_path = public, pg_temp as $$
  select coalesce((select to_char(last_write_on, 'YYYY-MM-DD') from public.context_activity
                    where person_id = pg_temp.id(p_name) and context_id = pg_temp.id(p_ctx)), '-')
$$;
create function pg_temp.goal_of(p_name text) returns uuid language sql security definer set search_path = public, pg_temp as $$
  select goal_id from public.investments where id = pg_temp.id(p_name)
$$;

-- ---------------------------------------------------------------------------
-- 1. Esquema e privilégios
-- ---------------------------------------------------------------------------
do $$ begin
  assert (select relrowsecurity from pg_class where oid = 'public.investment_plans'::regclass), 'RLS no plano';
  assert has_table_privilege('authenticated', 'public.investment_plans', 'select')
     and not has_table_privilege('authenticated', 'public.investment_plans', 'insert')
     and not has_table_privilege('authenticated', 'public.investment_plans', 'update')
     and not has_table_privilege('authenticated', 'public.investment_plans', 'delete')
     and not has_table_privilege('anon', 'public.investment_plans', 'select'), 'o app só lê o plano';
  assert has_function_privilege('authenticated', 'public.set_investment_plan(text, uuid, bigint)', 'execute')
     and not has_function_privilege('anon', 'public.set_investment_plan(text, uuid, bigint)', 'execute'), 'o app grava o plano pela função';
  assert not has_function_privilege('authenticated', 'public.clarevo_investment_goal(uuid, jsonb, uuid)', 'execute')
     and not has_function_privilege('authenticated', 'public.clarevo_investment_plan_result(uuid)', 'execute'), 'as internas fechadas';
  assert (select p.prosecdef and p.proconfig @> array['search_path=public'] from pg_proc p where p.oid = 'public.set_investment_plan(text, uuid, bigint)'::regprocedure),
    'security definer com search_path fixo';
  assert (select confdeltype from pg_constraint where conname = 'investments_goal_fk') = 'n'
     and (select array_agg(a.attname order by k.ord) from pg_constraint c cross join unnest(c.conkey) with ordinality k(attnum, ord)
            join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum where c.conname = 'investments_goal_fk') = array['goal_id', 'context_id']::name[]
     and (select confdelsetcols from pg_constraint where conname = 'investments_goal_fk') is not null,
    'a meta pela chave (goal_id, context_id), excluir de vez tira só goal_id';
end $$;

insert into ids values ('noa', :noa), ('ivo', :ivo);
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  (:noa, 'noa.plano@exemplo.test', now(), '{"display_name":"Noa"}'),
  (:ivo, 'ivo.plano@exemplo.test', now(), '{"display_name":"Ivo"}');

set role authenticated;
do $$
declare
  space jsonb;
  p text;
begin
  foreach p in array array['noa', 'ivo'] loop
    perform pg_temp.as_(p);
    space := public.ensure_personal_space('Conta principal');
    insert into ids values (p || '_ctx', (space ->> 'context_id')::uuid);
  end loop;
  perform pg_temp.as_('noa');
  insert into ids values ('fam', (public.create_family('Casa da Noa', 'pl-fam-0001') #>> '{context,id}')::uuid);
end $$;

-- ---------------------------------------------------------------------------
-- 2. Plano de aportes (P1, P2)
-- ---------------------------------------------------------------------------
do $$
declare
  r jsonb;
begin
  perform pg_temp.as_('noa');
  assert (select count(*) from public.investment_plans) = 0, 'sem plano no começo';
  assert pg_temp.lastwrite('noa', 'noa_ctx') = '-', 'nada anotado ainda';

  r := public.set_investment_plan('pl-p-0001', pg_temp.id('noa_ctx'), 50000);
  assert (r #>> '{plan,planned_monthly_cents}')::bigint = 50000 and (r #>> '{plan,version}')::int = 1
     and (r #>> '{plan,context_id}')::uuid = pg_temp.id('noa_ctx'), 'plano definido';
  assert pg_temp.ops('definir_plano_investimentos') = 1, 'uma operação';
  assert pg_temp.lastwrite('noa', 'noa_ctx') = '2026-11-14', 'conta como anotação';
  assert (select o.target_id is null and o.record_id is null and o.commitment_id is null and o.entry_id is null
            from public.record_operations o where o.idempotency_key = 'pl-p-0001'), 'sem alvo, registro, conta ou lançamento';

  -- Repetição devolve o mesmo e não grava; a mesma chave com outro valor é recusada.
  assert public.set_investment_plan('pl-p-0001', pg_temp.id('noa_ctx'), 50000) = r, 'repetição';
  assert pg_temp.ops('definir_plano_investimentos') = 1, 'repetição não grava';
  perform pg_temp.expect_code(format($q$select public.set_investment_plan('pl-p-0001', %L, 60000)$q$, pg_temp.id('noa_ctx')), 'chave_reutilizada', 'PT409');
  perform pg_temp.expect_code(format($q$select public.set_investment_plan('pl-p-0001', %L)$q$, pg_temp.id('noa_ctx')), 'chave_reutilizada', 'PT409');

  -- Trocar o valor: a mesma linha, versão seguinte.
  r := public.set_investment_plan('pl-p-0002', pg_temp.id('noa_ctx'), 75050);
  assert (r #>> '{plan,planned_monthly_cents}')::bigint = 75050 and (r #>> '{plan,version}')::int = 2, 'plano trocado';
  assert (select count(*) from public.investment_plans) = 1, 'uma linha por contexto';

  -- Recusas: valor fora da faixa, Família, contexto de outra pessoa, sem contexto, chave inválida.
  perform pg_temp.expect_code(format($q$select public.set_investment_plan('pl-p-0003', %L, 0)$q$, pg_temp.id('noa_ctx')), 'valor_invalido', '22023');
  perform pg_temp.expect_code(format($q$select public.set_investment_plan('pl-p-0004', %L, -100)$q$, pg_temp.id('noa_ctx')), 'valor_invalido', '22023');
  perform pg_temp.expect_code(format($q$select public.set_investment_plan('pl-p-0005', %L, 1000000000)$q$, pg_temp.id('noa_ctx')), 'valor_invalido', '22023');
  perform pg_temp.expect_code(format($q$select public.set_investment_plan('pl-p-0006', %L, 50000)$q$, pg_temp.id('fam')), 'contexto_invalido', '22023');
  perform pg_temp.expect_code(format($q$select public.set_investment_plan('pl-p-0007', %L, 50000)$q$, pg_temp.id('ivo_ctx')), 'nao_encontrado', 'P0002');
  perform pg_temp.expect_code($q$select public.set_investment_plan('pl-p-0008', null, 50000)$q$, 'nao_encontrado', 'P0002');
  perform pg_temp.expect_code(format($q$select public.set_investment_plan('x', %L, 50000)$q$, pg_temp.id('noa_ctx')), 'chave_invalida', '22023');
  assert (select count(*) from public.record_operations where idempotency_key between 'pl-p-0003' and 'pl-p-0008') = 0, 'recusas não gravam';
  assert (select planned_monthly_cents from public.investment_plans where context_id = pg_temp.id('noa_ctx')) = 75050, 'recusas não mudam o plano';
end $$;

-- Outra pessoa não vê o plano (RLS) nem repete a chave de outra pessoa.
do $$ begin
  perform pg_temp.as_('ivo');
  assert (select count(*) from public.investment_plans) = 0, 'Ivo não vê o plano da Noa';
  assert (public.set_investment_plan('pl-p-0001', pg_temp.id('ivo_ctx'), 30000) #>> '{plan,planned_monthly_cents}')::bigint = 30000,
    'a chave é por pessoa';
  perform pg_temp.as_('noa');
  assert (select count(*) from public.investment_plans) = 1, 'Noa vê só o dela';
end $$;

-- Tirar o plano: a linha sai; repetir devolve sem plano; tirar sem plano grava a operação e segue sem plano.
do $$
declare
  r jsonb;
begin
  perform pg_temp.as_('noa');
  r := public.set_investment_plan('pl-x-0001', pg_temp.id('noa_ctx'));
  assert r = '{"plan": null}'::jsonb, 'sem plano';
  assert not exists (select 1 from public.investment_plans where context_id = pg_temp.id('noa_ctx')), 'a linha saiu';
  assert pg_temp.ops('excluir_plano_investimentos') = 1, 'operação de tirar';
  assert public.set_investment_plan('pl-x-0001', pg_temp.id('noa_ctx')) = r, 'repetição de tirar';
  assert public.set_investment_plan('pl-x-0002', pg_temp.id('noa_ctx'), null) = r and pg_temp.ops('excluir_plano_investimentos') = 2, 'tirar sem plano';
  -- Definir de novo começa na versão 1.
  assert (public.set_investment_plan('pl-p-0010', pg_temp.id('noa_ctx'), 20000) #>> '{plan,version}')::int = 1, 'novo plano, versão 1';
end $$;

-- Sem pessoa: recusa.
do $$ begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform pg_temp.expect_code(format($q$select public.set_investment_plan('pl-a-0001', %L, 100)$q$, pg_temp.id('noa_ctx')), 'nao_autenticado', '42501');
end $$;

-- ---------------------------------------------------------------------------
-- 3. Investimento ligado a uma meta (M1, M2)
-- ---------------------------------------------------------------------------
do $$
declare
  r jsonb;
  g jsonb;
begin
  perform pg_temp.as_('noa');
  insert into ids values ('reserva', (public.create_goal('pl-g-0001', pg_temp.id('noa_ctx'), 'emergencia', 'Reserva para imprevistos', 2250000, null, null, 375000, 6, 'informado', null, null) #>> '{goal,id}')::uuid);
  insert into ids values ('viagem', (public.create_goal('pl-g-0002', pg_temp.id('noa_ctx'), 'objetivo', 'Viagem', 500000, '2027-10-01', null, null, null, null, null, null) #>> '{goal,id}')::uuid);
  insert into ids values ('velha', (public.create_goal('pl-g-0003', pg_temp.id('noa_ctx'), 'oportunidade', 'Bicicleta', 90000, null, null, null, null, null, null, null) #>> '{goal,id}')::uuid);
  g := public.set_goal_status('pl-g-0004', pg_temp.id('velha'), 1, 'arquivada');
  assert g #>> '{goal,status}' = 'arquivada', 'meta arquivada';
  perform pg_temp.as_('ivo');
  insert into ids values ('ivo_meta', (public.create_goal('pl-g-0005', pg_temp.id('ivo_ctx'), 'objetivo', 'Carro', 3000000, null, null, null, null, null, null, null) #>> '{goal,id}')::uuid);
  perform pg_temp.as_('noa');
  insert into ids values ('fam_meta', (public.create_goal('pl-g-0006', pg_temp.id('fam'), 'objetivo', 'Sofá', 300000, null, null, null, null, null, null, null) #>> '{goal,id}')::uuid);

  -- Criar ligado à reserva (o resto da ficha junto).
  r := public.create_investment('pl-i-0001', pg_temp.id('noa_ctx'), 'Caixinha', 'renda_fixa', 300000, '2026-10-01', null,
                                jsonb_build_object('goal_id', pg_temp.id('reserva')::text, 'liquidity', 'diaria'));
  insert into ids values ('caixinha', (r #>> '{investment,id}')::uuid);
  assert (r #>> '{investment,goal_id}')::uuid = pg_temp.id('reserva') and r #>> '{investment,liquidity}' = 'diaria', 'criado ligado à reserva';
  assert (select goal_id from public.investment_items where id = pg_temp.id('caixinha')) = pg_temp.id('reserva'), 'a visão mostra a meta';
  assert public.create_investment('pl-i-0001', pg_temp.id('noa_ctx'), 'Caixinha', 'renda_fixa', 300000, '2026-10-01', null,
                                  jsonb_build_object('goal_id', pg_temp.id('reserva')::text, 'liquidity', 'diaria')) = r, 'repetição';
  perform pg_temp.expect_code(format($q$select public.create_investment('pl-i-0001', %L, 'Caixinha', 'renda_fixa', 300000, '2026-10-01', null, %L)$q$,
    pg_temp.id('noa_ctx'), jsonb_build_object('goal_id', pg_temp.id('viagem')::text, 'liquidity', 'diaria')), 'chave_reutilizada', 'PT409');

  -- Recusas: arquivada, de outra pessoa, da Família, inexistente, texto que não é uuid, número.
  perform pg_temp.expect_code(format($q$select public.create_investment('pl-i-0002', %L, 'X', 'renda_fixa', 100, '2026-10-01', null, %L)$q$,
    pg_temp.id('noa_ctx'), jsonb_build_object('goal_id', pg_temp.id('velha')::text)), 'meta_invalida', '22023');
  perform pg_temp.expect_code(format($q$select public.create_investment('pl-i-0003', %L, 'X', 'renda_fixa', 100, '2026-10-01', null, %L)$q$,
    pg_temp.id('noa_ctx'), jsonb_build_object('goal_id', pg_temp.id('ivo_meta')::text)), 'meta_invalida', '22023');
  perform pg_temp.expect_code(format($q$select public.create_investment('pl-i-0004', %L, 'X', 'renda_fixa', 100, '2026-10-01', null, %L)$q$,
    pg_temp.id('noa_ctx'), jsonb_build_object('goal_id', pg_temp.id('fam_meta')::text)), 'meta_invalida', '22023');
  perform pg_temp.expect_code(format($q$select public.create_investment('pl-i-0005', %L, 'X', 'renda_fixa', 100, '2026-10-01', null, '{"goal_id":"00000000-0000-0000-0000-000000000001"}')$q$,
    pg_temp.id('noa_ctx')), 'meta_invalida', '22023');
  perform pg_temp.expect_code(format($q$select public.create_investment('pl-i-0006', %L, 'X', 'renda_fixa', 100, '2026-10-01', null, '{"goal_id":"reserva"}')$q$,
    pg_temp.id('noa_ctx')), 'meta_invalida', '22023');
  perform pg_temp.expect_code(format($q$select public.create_investment('pl-i-0007', %L, 'X', 'renda_fixa', 100, '2026-10-01', null, '{"goal_id":12}')$q$,
    pg_temp.id('noa_ctx')), 'meta_invalida', '22023');
  assert (select count(*) from public.investments where context_id = pg_temp.id('noa_ctx')) = 1, 'recusas não gravam';
  -- goal_id nulo na ficha: sem meta.
  r := public.create_investment('pl-i-0008', pg_temp.id('noa_ctx'), 'Ações', 'acoes', 100000, '2026-10-01', null, '{"goal_id":null}');
  insert into ids values ('acoes', (r #>> '{investment,id}')::uuid);
  assert r #> '{investment,goal_id}' = 'null'::jsonb, 'sem meta';

  -- Editar com a ficha troca a meta; a ficha sem a chave (versão do app anterior à 0036) mantém; "goal_id" nulo tira.
  r := public.update_investment('pl-e-0001', pg_temp.id('acoes'), 1, 'Ações', 'acoes', jsonb_build_object('goal_id', pg_temp.id('viagem')::text));
  assert (r #>> '{investment,goal_id}')::uuid = pg_temp.id('viagem') and (r #>> '{investment,version}')::int = 2, 'ligado à viagem';
  r := public.update_investment('pl-e-0002', pg_temp.id('acoes'), 2, 'Ações', 'acoes', '{"institution":"Corretora"}');
  assert (r #>> '{investment,goal_id}')::uuid = pg_temp.id('viagem') and r #>> '{investment,institution}' = 'Corretora', 'ficha sem a chave mantém a meta';
  r := public.update_investment('pl-e-0002b', pg_temp.id('acoes'), 3, 'Ações', 'acoes', '{"goal_id":null}');
  assert r #> '{investment,goal_id}' = 'null'::jsonb and r #> '{investment,institution}' = 'null'::jsonb, 'goal_id nulo tira a meta';
  r := public.update_investment('pl-e-0003', pg_temp.id('acoes'), 4, 'Ações', 'acoes', jsonb_build_object('goal_id', pg_temp.id('viagem')::text));
  perform pg_temp.expect_code(format($q$select public.update_investment('pl-e-0004', %L, 5, 'Ações', 'acoes', %L)$q$,
    pg_temp.id('acoes'), jsonb_build_object('goal_id', pg_temp.id('velha')::text)), 'meta_invalida', '22023');
  assert pg_temp.goal_of('acoes') = pg_temp.id('viagem'), 'a recusa não muda a meta';
  -- Sem a ficha (versão antiga do app): a meta fica, se ela continuar valendo.
  r := public.update_investment('pl-e-0005', pg_temp.id('acoes'), 5, 'Ações e fundos', 'acoes');
  assert (r #>> '{investment,goal_id}')::uuid = pg_temp.id('viagem') and r #>> '{investment,name}' = 'Ações e fundos', 'sem a ficha, a meta fica';
  -- A meta foi arquivada depois: sem a ficha, a ligação sai na próxima edição; com a ficha, não pode ser escolhida.
  g := public.set_goal_status('pl-g-0007', pg_temp.id('viagem'), (select version from public.goals where id = pg_temp.id('viagem')), 'arquivada');
  r := public.update_investment('pl-e-0006', pg_temp.id('acoes'), 6, 'Ações e fundos', 'acoes');
  assert r #> '{investment,goal_id}' = 'null'::jsonb, 'meta arquivada sai ao editar sem a ficha';
  g := public.set_goal_status('pl-g-0008', pg_temp.id('viagem'), (select version from public.goals where id = pg_temp.id('viagem')), 'ativa');
  r := public.update_investment('pl-e-0007', pg_temp.id('acoes'), 7, 'Ações e fundos', 'acoes', jsonb_build_object('goal_id', pg_temp.id('viagem')::text));
  assert (r #>> '{investment,goal_id}')::uuid = pg_temp.id('viagem'), 'ligado de novo';

  -- Meta com marca de excluída: a visão mostra nenhuma; a linha guarda a ligação até a meta sair de vez.
  perform public.delete_goal('pl-g-0009', pg_temp.id('viagem'), (select version from public.goals where id = pg_temp.id('viagem')));
  assert (select goal_id from public.investment_items where id = pg_temp.id('acoes')) is null, 'meta excluída aparece como nenhuma';
  assert pg_temp.goal_of('acoes') = pg_temp.id('viagem'), 'a ligação fica guardada';
  r := public.update_investment('pl-e-0008', pg_temp.id('acoes'), 8, 'Ações e fundos', 'acoes');
  assert r #> '{investment,goal_id}' = 'null'::jsonb and pg_temp.goal_of('acoes') is null, 'editar sem a ficha tira a meta excluída';
  perform pg_temp.expect_code(format($q$select public.update_investment('pl-e-0009', %L, 9, 'Ações e fundos', 'acoes', %L)$q$,
    pg_temp.id('acoes'), jsonb_build_object('goal_id', pg_temp.id('viagem')::text)), 'meta_invalida', '22023');
end $$;

-- Excluir a meta de vez (limpeza dos excluídos, exclusão da conta): a chave tira a ligação sem passar pela versão.
reset role;
do $$
declare
  v_before integer := (select version from public.investments where id = pg_temp.id('caixinha'));
begin
  delete from public.goal_movements where goal_id = pg_temp.id('reserva');
  delete from public.goals where id = pg_temp.id('reserva');
  assert pg_temp.goal_of('caixinha') is null, 'a ligação saiu com a meta';
  assert (select version from public.investments where id = pg_temp.id('caixinha')) = v_before, 'sem versão nova';
  -- O guarda segue pedindo a versão em qualquer outra mudança, e não aceita trocar a meta junto com outro campo sem versão.
  perform pg_temp.expect_code(format($q$update public.investments set name = 'Outro' where id = %L$q$, pg_temp.id('caixinha')), 'campo_imutavel', '42501');
  update public.investments set goal_id = (select id from public.goals where name = 'Bicicleta' and context_id = pg_temp.id('noa_ctx')), version = version + 1
   where id = pg_temp.id('caixinha');
  perform pg_temp.expect_code(format($q$update public.investments set goal_id = null, name = 'Outro' where id = %L$q$, pg_temp.id('caixinha')), 'campo_imutavel', '42501');
  -- A meta precisa ser do mesmo contexto também na tabela (defesa adicional).
  perform pg_temp.expect_code(format($q$update public.investments set goal_id = %L, version = version + 1 where id = %L$q$, pg_temp.id('fam_meta'), pg_temp.id('caixinha')),
    'insert or update on table "investments" violates foreign key constraint "investments_goal_fk"', '23503');
  -- O plano: guarda e faixa.
  perform pg_temp.expect_code(format($q$update public.investment_plans set planned_monthly_cents = 1 where context_id = %L$q$, pg_temp.id('noa_ctx')), 'campo_imutavel', '42501');
  perform pg_temp.expect_code(format($q$update public.investment_plans set planned_monthly_cents = 0, version = version + 1 where context_id = %L$q$, pg_temp.id('noa_ctx')),
    'new row for relation "investment_plans" violates check constraint "investment_plans_planned_monthly_cents_check"', '23514');
  -- Excluir o contexto leva o plano junto.
  assert exists (select 1 from public.investment_plans where context_id = pg_temp.id('ivo_ctx')), 'Ivo tem plano';
  perform public.clarevo_erase_context(pg_temp.id('ivo_ctx'));
  assert not exists (select 1 from public.investment_plans where context_id = pg_temp.id('ivo_ctx')), 'o plano saiu com o contexto';
end $$;

rollback;
