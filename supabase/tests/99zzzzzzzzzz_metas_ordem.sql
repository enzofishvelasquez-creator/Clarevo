-- Prioridade das metas (D-093; migração 0031): goals.priority, set_goal_order e goal_items.priority. Confere: a coluna, a visão e os
-- privilégios; a lista completa das metas ativas sem a reserva (faltando, sobrando, repetida, arquivada, a reserva, de outro contexto e
-- vazia são recusadas); a ordem gravada sem subir a versão nem mudar updated_at; a edição da meta continua com a mesma versão; a
-- repetição da chave; a operação com o contexto como alvo e sem contar como atividade; a Família (quem anota ordena, quem só vê não) e
-- outra pessoa sem acesso.
-- Pessoas FICTÍCIAS: Lia (titular de uma Família), Caio ("anota e vê" na Família), Duda ("só vê") e Edu (sem Família). Tudo em uma
-- transação desfeita no fim.
\set ON_ERROR_STOP 1
\set lia '''00000000-0000-0000-0000-0000000000e1'''
\set caio '''00000000-0000-0000-0000-0000000000e2'''
\set duda '''00000000-0000-0000-0000-0000000000e3'''
\set edu '''00000000-0000-0000-0000-0000000000e4'''

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

create temp table ids (name text primary key, id uuid);
grant select, insert on ids to authenticated, anon;
create function pg_temp.id(p_name text) returns uuid language sql as $$ select id from ids where name = p_name $$;
create function pg_temp.as_(p_name text) returns text language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(pg_temp.id(p_name)::text, ''), true)
$$;
-- Leituras direto na tabela (sem a RLS).
create function pg_temp.goal(p_name text) returns public.goals language sql security definer set search_path = public, pg_temp as $$
  select g from public.goals g where g.id = pg_temp.id(p_name)
$$;
create function pg_temp.ops(p_action text, p_ctx text) returns bigint language sql security definer set search_path = public, pg_temp as $$
  select count(*) from public.record_operations where action = p_action and context_id = pg_temp.id(p_ctx)
$$;
create function pg_temp.lastwrite(p_name text, p_ctx text) returns text language sql security definer set search_path = public, pg_temp as $$
  select coalesce((select to_char(last_write_on, 'YYYY-MM-DD') from public.context_activity
                    where person_id = pg_temp.id(p_name) and context_id = pg_temp.id(p_ctx)), '-')
$$;
create function pg_temp.ord(p_key text, p_ctx text, p_names text[]) returns jsonb language sql as $$
  select public.set_goal_order(p_key, pg_temp.id(p_ctx), (select array_agg(pg_temp.id(n) order by i) from unnest(p_names) with ordinality u(n, i)))
$$;
create function pg_temp.ord_sql(p_key text, p_ctx text, p_names text[]) returns text language sql as $$
  select format('select pg_temp.ord(%L, %L, %L::text[])', p_key, p_ctx, p_names)
$$;

-- ---------------------------------------------------------------------------
-- 1. Esquema e privilégios
-- ---------------------------------------------------------------------------
do $$ begin
  assert exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'goals'
                   and column_name = 'priority' and data_type = 'integer' and is_nullable = 'YES'), 'a coluna goals.priority';
  assert exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'goal_items'
                   and column_name = 'priority' and data_type = 'integer'), 'goal_items.priority';
  assert has_function_privilege('authenticated', 'public.set_goal_order(text, uuid, uuid[])', 'execute'), 'o app ordena';
  assert not has_function_privilege('anon', 'public.set_goal_order(text, uuid, uuid[])', 'execute'), 'anon não';
  assert (select prosecdef from pg_proc where oid = 'public.set_goal_order(text, uuid, uuid[])'::regprocedure), 'security definer';
end $$;

insert into ids values ('lia', :lia), ('caio', :caio), ('duda', :duda), ('edu', :edu);
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  (:lia, 'lia.ordem@exemplo.test', now(), '{"display_name":"Lia"}'),
  (:caio, 'caio.ordem@exemplo.test', now(), '{"display_name":"Caio"}'),
  (:duda, 'duda.ordem@exemplo.test', now(), '{"display_name":"Duda"}'),
  (:edu, 'edu.ordem@exemplo.test', now(), '{"display_name":"Edu"}');

set role authenticated;
do $$
declare
  p text;
  space jsonb;
  r jsonb;
begin
  foreach p in array array['lia', 'caio', 'duda', 'edu'] loop
    perform pg_temp.as_(p);
    space := public.ensure_personal_space('Conta principal');
    insert into ids values (p || '_ctx', (space ->> 'context_id')::uuid);
  end loop;
  -- Lia: três metas, a reserva e uma arquivada no Pessoal.
  perform pg_temp.as_('lia');
  insert into ids values ('viagem', (public.create_goal('mo-c-0001', pg_temp.id('lia_ctx'), 'objetivo', 'Viagem', 300000, null, 20000, null, null, null, null, null) #>> '{goal,id}')::uuid);
  insert into ids values ('curso', (public.create_goal('mo-c-0002', pg_temp.id('lia_ctx'), 'objetivo', 'Curso', 120000, null, null, null, null, null, null, null) #>> '{goal,id}')::uuid);
  insert into ids values ('carro', (public.create_goal('mo-c-0003', pg_temp.id('lia_ctx'), 'oportunidade', 'Carro', 900000, null, null, null, null, null, null, null) #>> '{goal,id}')::uuid);
  insert into ids values ('reserva', (public.create_goal('mo-c-0004', pg_temp.id('lia_ctx'), 'emergencia', 'Reserva para imprevistos', null, null, null, 300000, 3, 'informado', null, null) #>> '{goal,id}')::uuid);
  insert into ids values ('velha', (public.create_goal('mo-c-0005', pg_temp.id('lia_ctx'), 'objetivo', 'Velha', 1000, null, null, null, null, null, null, null) #>> '{goal,id}')::uuid);
  perform public.set_goal_status('mo-c-0006', pg_temp.id('velha'), 1, 'arquivada');
  -- Lia cria uma Família; Caio entra como "anota e vê" e Duda como "só vê".
  insert into ids values ('fam', (public.create_family('Casa da Lia', 'mo-fam-0001') #>> '{context,id}')::uuid);
  r := public.create_family_invite(pg_temp.id('fam'), 'membro', 'mo-inv-caio');
  perform pg_temp.as_('caio');
  perform public.accept_family_invite(r ->> 'code', 'mo-acc-caio');
  perform pg_temp.as_('lia');
  r := public.create_family_invite(pg_temp.id('fam'), 'leitor', 'mo-inv-duda');
  perform pg_temp.as_('duda');
  perform public.accept_family_invite(r ->> 'code', 'mo-acc-duda');
  -- Duas metas da casa, uma da Lia e uma do Caio.
  perform pg_temp.as_('lia');
  insert into ids values ('ferias', (public.create_goal('mo-f-0001', pg_temp.id('fam'), 'objetivo', 'Férias da casa', 800000, null, null, null, null, null, null, null) #>> '{goal,id}')::uuid);
  perform pg_temp.as_('caio');
  insert into ids values ('sofa', (public.create_goal('mo-f-0002', pg_temp.id('fam'), 'objetivo', 'Sofá novo', 400000, null, null, null, null, null, null, null) #>> '{goal,id}')::uuid);
end $$;

-- ---------------------------------------------------------------------------
-- 2. A lista tem de ser exatamente as metas ativas do contexto, sem a reserva
-- ---------------------------------------------------------------------------
do $$ begin
  perform pg_temp.as_('lia');
  perform pg_temp.expect_code(pg_temp.ord_sql('mo-o-0101', 'lia_ctx', array['carro', 'viagem']), 'lista_invalida', '22023');                         -- falta uma
  perform pg_temp.expect_code(pg_temp.ord_sql('mo-o-0102', 'lia_ctx', array['carro', 'viagem', 'curso', 'reserva']), 'lista_invalida', '22023');     -- a reserva
  perform pg_temp.expect_code(pg_temp.ord_sql('mo-o-0103', 'lia_ctx', array['carro', 'viagem', 'curso', 'velha']), 'lista_invalida', '22023');       -- arquivada
  perform pg_temp.expect_code(pg_temp.ord_sql('mo-o-0104', 'lia_ctx', array['carro', 'viagem', 'viagem']), 'lista_invalida', '22023');               -- repetida
  perform pg_temp.expect_code(pg_temp.ord_sql('mo-o-0105', 'lia_ctx', array['carro', 'viagem', 'curso', 'ferias']), 'lista_invalida', '22023');      -- de outro contexto
  perform pg_temp.expect_code(format('select public.set_goal_order(%L, %L, %L::uuid[])', 'mo-o-0106', pg_temp.id('lia_ctx'), '{}'), 'lista_invalida', '22023');
  perform pg_temp.expect_code(format('select public.set_goal_order(%L, %L, null)', 'mo-o-0107', pg_temp.id('lia_ctx')), 'lista_invalida', '22023');
  assert pg_temp.ops('ordenar_metas', 'lia_ctx') = 0, 'recusas não gravam operação';
  assert (pg_temp.goal('viagem')).priority is null and (pg_temp.goal('carro')).priority is null, 'recusas não mudam a ordem';
end $$;

-- ---------------------------------------------------------------------------
-- 3. A ordem gravada: sem subir a versão, sem mexer em updated_at, a edição segue com a mesma versão
-- ---------------------------------------------------------------------------
do $$
declare
  before_v integer := (pg_temp.goal('viagem')).version;
  before_u timestamptz := (pg_temp.goal('viagem')).updated_at;
  before_w text := pg_temp.lastwrite('lia', 'lia_ctx');
  r jsonb;
begin
  perform pg_temp.as_('lia');
  r := pg_temp.ord('mo-o-0201', 'lia_ctx', array['carro', 'viagem', 'curso']);
  assert r ->> 'context_id' = pg_temp.id('lia_ctx')::text
     and r -> 'ids' = to_jsonb(array[pg_temp.id('carro'), pg_temp.id('viagem'), pg_temp.id('curso')]), 'o retorno com a ordem';
  assert (pg_temp.goal('carro')).priority = 1 and (pg_temp.goal('viagem')).priority = 2 and (pg_temp.goal('curso')).priority = 3, 'a ordem gravada';
  assert (pg_temp.goal('reserva')).priority is null and (pg_temp.goal('velha')).priority is null, 'a reserva e a arquivada ficam sem ordem';
  assert (pg_temp.goal('viagem')).version = before_v and (pg_temp.goal('viagem')).updated_at = before_u, 'sem versão nova e sem updated_at novo';
  assert (select array_agg(name order by priority) from public.goal_items where context_id = pg_temp.id('lia_ctx') and priority is not null)
       = array['Carro', 'Viagem', 'Curso'], 'goal_items com a prioridade';
  -- A operação: uma, com o contexto como alvo; não conta como atividade.
  assert pg_temp.ops('ordenar_metas', 'lia_ctx') = 1, 'uma operação';
  assert exists (select 1 from public.record_operations where idempotency_key = 'mo-o-0201' and target_id = pg_temp.id('lia_ctx')
                   and record_id is null and commitment_id is null), 'o contexto como alvo';
  assert pg_temp.lastwrite('lia', 'lia_ctx') = before_w, 'ordenar não é anotação';
  -- Repetir a chave devolve o mesmo, sem nova operação; a mesma chave com outra lista é recusada.
  assert pg_temp.ord('mo-o-0201', 'lia_ctx', array['carro', 'viagem', 'curso']) = r, 'repetição';
  assert pg_temp.ops('ordenar_metas', 'lia_ctx') = 1, 'repetição sem operação nova';
  perform pg_temp.expect_code(pg_temp.ord_sql('mo-o-0201', 'lia_ctx', array['curso', 'viagem', 'carro']), 'chave_reutilizada', 'PT409');
  -- A edição da meta continua com a versão de antes da ordem.
  perform public.update_goal('mo-o-0202', pg_temp.id('viagem'), before_v, 'objetivo', 'Viagem longa', 300000, null, 20000, null, null, null);
  assert (pg_temp.goal('viagem')).version = before_v + 1 and (pg_temp.goal('viagem')).priority = 2, 'editar mantém a prioridade';
  -- Uma meta nova entra sem ordem; a lista seguinte precisa dela.
  insert into ids values ('casa', (public.create_goal('mo-o-0203', pg_temp.id('lia_ctx'), 'objetivo', 'Casa', 9000000, null, null, null, null, null, null, null) #>> '{goal,id}')::uuid);
  assert (pg_temp.goal('casa')).priority is null, 'meta nova sem ordem';
  perform pg_temp.expect_code(pg_temp.ord_sql('mo-o-0204', 'lia_ctx', array['carro', 'viagem', 'curso']), 'lista_invalida', '22023');
  perform pg_temp.ord('mo-o-0205', 'lia_ctx', array['casa', 'curso', 'carro', 'viagem']);
  assert (pg_temp.goal('casa')).priority = 1 and (pg_temp.goal('viagem')).priority = 4, 'a ordem nova';
  -- Ninguém grava a prioridade direto.
  begin
    update public.goals set priority = 9 where id = pg_temp.id('casa');
    raise exception 'deveria recusar';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Família: quem anota ordena (também as metas de outra pessoa); quem só vê não; quem não é da Família não acha o contexto
-- ---------------------------------------------------------------------------
do $$ begin
  perform pg_temp.as_('caio');
  perform pg_temp.ord('mo-o-0301', 'fam', array['sofa', 'ferias']);
  assert (pg_temp.goal('sofa')).priority = 1 and (pg_temp.goal('ferias')).priority = 2, 'Caio ordena as metas da casa';
  perform pg_temp.as_('duda');
  perform pg_temp.expect_code(pg_temp.ord_sql('mo-o-0302', 'fam', array['ferias', 'sofa']), 'sem_permissao', '42501');
  perform pg_temp.as_('edu');
  perform pg_temp.expect_code(pg_temp.ord_sql('mo-o-0303', 'fam', array['ferias', 'sofa']), 'nao_encontrado', 'P0002');
  perform pg_temp.expect_code(pg_temp.ord_sql('mo-o-0304', 'lia_ctx', array['casa', 'curso', 'carro', 'viagem']), 'nao_encontrado', 'P0002');
  perform pg_temp.as_('');
  perform pg_temp.expect_code(pg_temp.ord_sql('mo-o-0305', 'fam', array['ferias', 'sofa']), 'nao_autenticado', '42501');
end $$;

reset role;
rollback;
