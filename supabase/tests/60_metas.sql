-- Metas e reserva para imprevistos (D-027): goals, goal_movements, goal_items, create_goal, update_goal, set_goal_status,
-- delete_goal, add_goal_movement, update_goal_movement e delete_goal_movement; saldo diário (G1) nas funções e no gatilho
-- adiado; meta e movimentos no mesmo contexto (G2); totais intocados (G3); exclusão em cascata lógica (G4); meta arquivada
-- (G5); uma reserva por contexto, inclusive ao reativar (G6); guardas, restrições de record_operations e privilégios.
-- Sequência de aceite C (spec2 2.5) sobre a montagem FICTÍCIA da demonstração (Bia, hoje 07/10/2026): em cada passo,
-- Recebido, Pago, Diferença, Ainda a pagar, renda comprometida e o resumo por mês ficam iguais à base, e as tabelas
-- financial_records e commitments não mudam.
-- Pessoas FICTÍCIAS: Bia (sequência C e demonstração; titular da Família da Bia), Caio (Família, só leitura), Iris (Família,
-- escreve sem "editar de outras pessoas"), Theo (Família, escreve e altera o que é dos outros), Rui (externo), Vera (RH da
-- empresa; Bia tem a licença) e Noel (conta nova; validação, repetição, versão e atividade). Valores em centavos.
\set ON_ERROR_STOP 1
\set bia  '''00000000-0000-0000-0000-0000000000c1'''
\set caio '''00000000-0000-0000-0000-0000000000c2'''
\set iris '''00000000-0000-0000-0000-0000000000c3'''
\set theo '''00000000-0000-0000-0000-0000000000c4'''
\set rui  '''00000000-0000-0000-0000-0000000000c5'''
\set vera '''00000000-0000-0000-0000-0000000000c6'''
\set noel '''00000000-0000-0000-0000-0000000000c7'''

begin;
set local clarevo.today = '2026-10-07';

-- Executa um comando e exige um erro cuja mensagem combine com o padrão (LIKE).
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
    raise exception 'esperado % (%, "%"), veio "%" (%, "%") em: %', p_code, p_state, p_detail, sqlerrm, sqlstate, v_detail, p_sql;
  end;
  raise exception 'esperado erro %, mas passou: %', p_code, p_sql;
end $$;

-- versao_desatualizada (PT409) com o detalhe esperado; saldo_da_meta_insuficiente (PT409) com o dia no detalhe.
create function pg_temp.expect_stale(p_sql text, p_detail text) returns void language sql as $$
  select pg_temp.expect_code(p_sql, 'versao_desatualizada', 'PT409', p_detail)
$$;
create function pg_temp.expect_neg(p_sql text, p_day text) returns void language sql as $$
  select pg_temp.expect_code(p_sql, 'saldo_da_meta_insuficiente', 'PT409', 'dia=' || p_day)
$$;

-- Escrita direta recusada só no fim da transação (gatilho adiado): executa, confere agora e desfaz.
create function pg_temp.expect_deferred(p_sql text, p_code text, p_state text, p_detail text default '') returns void
language plpgsql as $$
declare
  v_detail text;
begin
  begin
    execute p_sql;
    set constraints all immediate;
  exception when others then
    get stacked diagnostics v_detail = pg_exception_detail;
    set constraints all deferred;
    if sqlerrm = p_code and sqlstate = p_state and coalesce(v_detail, '') = coalesce(p_detail, '') then return; end if;
    raise exception 'esperado % (%, "%") no fim da transação, veio "%" (%, "%") em: %', p_code, p_state, p_detail, sqlerrm,
      sqlstate, v_detail, p_sql;
  end;
  set constraints all deferred;
  raise exception 'esperado erro adiado %, mas passou: %', p_code, p_sql;
end $$;

create temp table ids (name text primary key, id uuid);
grant select, insert on ids to authenticated;
create function pg_temp.id(p_name text) returns uuid language sql as $$ select id from ids where name = p_name $$;
-- Base para comparar (totais da Bia e impressão digital de financial_records e commitments).
create temp table snap (name text primary key, v text);
grant select, insert, update on snap to authenticated;

-- Sessão de quem (nome em ids; nome desconhecido = sem sessão) e dia de hoje.
create function pg_temp.as_(p_name text) returns text language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(pg_temp.id(p_name)::text, ''), true)
$$;
create function pg_temp.today(p_day date) returns text language sql as $$
  select set_config('clarevo.today', to_char(p_day, 'YYYY-MM-DD'), true)
$$;

-- Confere agora as restrições adiadas (I1, séries e G1, G4, G5). Sem isso, o rollback final nunca as dispararia.
create function pg_temp.check_links() returns void language plpgsql as $$
begin
  set constraints all immediate;
  set constraints all deferred;
end $$;

-- Contexto pedido: {recebido, pago, diferença} e {vencimento no mês, vencidas antes do mês, a pagar, quantidade}.
create function pg_temp.totals(p_ctx text, p_month date) returns bigint[] language sql as $$
  select array[received_cents, paid_cents, difference_cents] from public.month_totals(pg_temp.id(p_ctx), p_month)
$$;
create function pg_temp.to_pay(p_ctx text, p_month date) returns bigint[] language sql as $$
  select array[due_in_month_cents, overdue_before_cents, to_pay_cents, open_count] from public.month_to_pay(pg_temp.id(p_ctx), p_month)
$$;
create function pg_temp.sync(p_ctx text) returns jsonb language sql as $$
  select public.sync_series_occurrences(pg_temp.id(p_ctx))
$$;
create function pg_temp.occ(p_series text, p_n int) returns uuid language sql as $$
  select id from public.commitment_items where series_id = pg_temp.id(p_series) and occurrence_number = p_n
$$;
create function pg_temp.cver(p_cid uuid) returns int language sql as $$
  select version from public.commitment_items where id = p_cid
$$;
create function pg_temp.pay(p_key text, p_cid uuid, p_acc uuid, p_amount bigint, p_on date) returns jsonb language plpgsql as $$
declare
  res jsonb;
begin
  res := public.pay_commitment(p_key, p_cid, pg_temp.cver(p_cid), p_acc, p_amount, p_on);
  perform pg_temp.check_links();
  return res;
end $$;
-- Atividade (A4): "última anotação ausência-de ausência-até", direto na tabela (sem a RLS).
create function pg_temp.act(p_person text, p_ctx text) returns text language sql security definer
set search_path = public, pg_temp as $$
  select format('%s %s %s', to_char(last_write_on, 'YYYY-MM-DD'), coalesce(to_char(absence_from_on, 'YYYY-MM-DD'), '-'),
                coalesce(to_char(absence_until_on, 'YYYY-MM-DD'), '-'))
    from public.context_activity where person_id = pg_temp.id(p_person) and context_id = pg_temp.id(p_ctx)
$$;

-- Tudo o que as metas não podem mudar, pela leitura do app (com a RLS de quem consulta): Recebido, Pago e Diferença de
-- setembro a novembro, Ainda a pagar de outubro e novembro, renda comprometida de setembro a novembro e o resumo por mês.
create function pg_temp.money(p_ctx text) returns text language sql as $$
  select string_agg(x, ' || ' order by ord) from (
    select 1 as ord, (select to_jsonb(t)::text from public.month_totals(pg_temp.id(p_ctx), '2026-09-01') t) as x
    union all select 2, (select to_jsonb(t)::text from public.month_totals(pg_temp.id(p_ctx), '2026-10-01') t)
    union all select 3, (select to_jsonb(t)::text from public.month_totals(pg_temp.id(p_ctx), '2026-11-01') t)
    union all select 4, (select to_jsonb(t)::text from public.month_to_pay(pg_temp.id(p_ctx), '2026-10-01') t)
    union all select 5, (select to_jsonb(t)::text from public.month_to_pay(pg_temp.id(p_ctx), '2026-11-01') t)
    union all select 6, (select to_jsonb(t)::text from public.month_committed(pg_temp.id(p_ctx), '2026-09-01') t)
    union all select 7, (select to_jsonb(t)::text from public.month_committed(pg_temp.id(p_ctx), '2026-10-01') t)
    union all select 8, (select to_jsonb(t)::text from public.month_committed(pg_temp.id(p_ctx), '2026-11-01') t)
    union all select 9, (select jsonb_agg(to_jsonb(o) order by o.month)::text
                           from public.months_overview(pg_temp.id(p_ctx), '2026-08-01', '2026-11-01') o)) s
$$;
-- Impressão digital de todas as linhas de financial_records e commitments (inclusive excluídas e updated_at).
create function pg_temp.fc() returns text language sql security definer set search_path = public, pg_temp as $$
  select md5(coalesce((select string_agg(to_jsonb(r)::text, ',' order by r.id) from public.financial_records r), '')
             || '#' || coalesce((select string_agg(to_jsonb(c)::text, ',' order by c.id) from public.commitments c), ''))
$$;
create function pg_temp.same_money(p_ctx text, p_note text) returns void language plpgsql as $$
begin
  if pg_temp.money(p_ctx) is distinct from (select v from snap where name = p_ctx) then
    raise exception '%: totais mudaram: % <> %', p_note, pg_temp.money(p_ctx), (select v from snap where name = p_ctx);
  end if;
  if pg_temp.fc() is distinct from (select v from snap where name = 'fc') then
    raise exception '%: financial_records ou commitments mudaram', p_note;
  end if;
end $$;

-- Meta pela leitura do app (goal_items), em texto.
create function pg_temp.gi(p_goal uuid) returns text language sql as $$
  select format('alvo %s guardado %s | ini %s apo %s res %s ren %s val %s desv %s | %s v%s | ult %s',
                target_cents, saved_cents, initial_cents, deposits_cents, withdrawals_cents, income_cents, appreciation_cents,
                depreciation_cents, status, version, coalesce(to_char(last_movement_on, 'YYYY-MM-DD'), '-'))
    from public.goal_items where id = p_goal
$$;
-- goal_items confere com a soma com sinal dos movimentos lidos pelo app (como goalSaved no core) e o saldo de cada dia
-- é não negativo (G1).
create function pg_temp.check_goal(p_goal uuid) returns void language plpgsql as $$
declare
  g record;
  s record;
begin
  select * into g from public.goal_items where id = p_goal;
  select coalesce(sum(case when kind in ('resgate', 'desvalorizacao') then -amount_cents else amount_cents end), 0) as saved,
         coalesce(sum(amount_cents) filter (where kind = 'saldo_inicial'), 0) as ini,
         coalesce(sum(amount_cents) filter (where kind = 'aporte'), 0) as dep,
         coalesce(sum(amount_cents) filter (where kind = 'resgate'), 0) as wit,
         coalesce(sum(amount_cents) filter (where kind = 'rendimento'), 0) as inc,
         coalesce(sum(amount_cents) filter (where kind = 'valorizacao'), 0) as app,
         coalesce(sum(amount_cents) filter (where kind = 'desvalorizacao'), 0) as dpr,
         max(occurred_on) as last
    into s from public.goal_movements where goal_id = p_goal;
  assert (g.saved_cents, g.initial_cents, g.deposits_cents, g.withdrawals_cents, g.income_cents, g.appreciation_cents,
          g.depreciation_cents, g.last_movement_on)
     is not distinct from (s.saved::bigint, s.ini::bigint, s.dep::bigint, s.wit::bigint, s.inc::bigint, s.app::bigint,
          s.dpr::bigint, s.last), 'goal_items = soma dos movimentos lidos pelo app';
  assert not exists (select 1 from (
            select sum(sum(case when kind in ('resgate', 'desvalorizacao') then -amount_cents else amount_cents end))
                     over (order by occurred_on) as bal
              from public.goal_movements where goal_id = p_goal group by occurred_on) x where x.bal < 0), 'G1: nenhum dia negativo';
end $$;
create function pg_temp.expect_goal(p_goal uuid, p_expected text, p_note text) returns void language plpgsql as $$
declare
  v text := pg_temp.gi(p_goal);
begin
  if v is distinct from p_expected then
    raise exception '%: esperado "%", veio "%"', p_note, p_expected, v;
  end if;
  perform pg_temp.check_goal(p_goal);
end $$;
-- Progresso (para baixo) e cobertura em décimos de mês (para baixo), como goalProgress e coverageTenths no core.
create function pg_temp.pct(p_goal uuid) returns bigint language sql as $$
  select 100 * saved_cents / target_cents from public.goal_items where id = p_goal
$$;
create function pg_temp.cov(p_goal uuid) returns bigint language sql as $$
  select 10 * saved_cents / essential_base_cents from public.goal_items where id = p_goal
$$;
create function pg_temp.gver(p_goal uuid) returns int language sql as $$ select version from public.goal_items where id = p_goal $$;
create function pg_temp.mver(p_mov uuid) returns int language sql as $$ select version from public.goal_movements where id = p_mov $$;
create function pg_temp.run(p_sql text) returns jsonb language plpgsql as $$
declare
  r jsonb;
begin
  execute p_sql into r;
  return r;
end $$;

-- Chamadas em texto (para expect_*): nulo vira NULL.
create function pg_temp.cg(p_key text, p_ctx uuid, p_type text, p_name text, p_target bigint, p_month date, p_plan bigint,
  p_base bigint, p_months integer, p_source text, p_initial bigint, p_on date) returns text language sql as $$
  select format('select public.create_goal(%L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L)', p_key, p_ctx, p_type, p_name,
                p_target, p_month, p_plan, p_base, p_months, p_source, p_initial, p_on)
$$;
create function pg_temp.ug(p_key text, p_goal uuid, p_version integer, p_type text, p_name text, p_target bigint, p_month date,
  p_plan bigint, p_base bigint, p_months integer, p_source text) returns text language sql as $$
  select format('select public.update_goal(%L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L)', p_key, p_goal, p_version, p_type, p_name,
                p_target, p_month, p_plan, p_base, p_months, p_source)
$$;
create function pg_temp.sg(p_key text, p_goal uuid, p_version integer, p_status text) returns text language sql as $$
  select format('select public.set_goal_status(%L, %L, %L, %L)', p_key, p_goal, p_version, p_status)
$$;
create function pg_temp.dg(p_key text, p_goal uuid, p_version integer) returns text language sql as $$
  select format('select public.delete_goal(%L, %L, %L)', p_key, p_goal, p_version)
$$;
create function pg_temp.am(p_key text, p_goal uuid, p_kind text, p_amount bigint, p_on date, p_note text default null)
returns text language sql as $$
  select format('select public.add_goal_movement(%L, %L, %L, %L, %L, %L)', p_key, p_goal, p_kind, p_amount, p_on, p_note)
$$;
create function pg_temp.um(p_key text, p_mov uuid, p_version integer, p_amount bigint, p_on date, p_note text default null)
returns text language sql as $$
  select format('select public.update_goal_movement(%L, %L, %L, %L, %L, %L)', p_key, p_mov, p_version, p_amount, p_on, p_note)
$$;
create function pg_temp.dm(p_key text, p_mov uuid, p_version integer) returns text language sql as $$
  select format('select public.delete_goal_movement(%L, %L, %L)', p_key, p_mov, p_version)
$$;

insert into ids values ('bia', :bia), ('caio', :caio), ('iris', :iris), ('theo', :theo), ('rui', :rui), ('vera', :vera),
  ('noel', :noel);
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  (:bia,  'bia@exemplo.test',   now(), '{"display_name":"Bia"}'),
  (:caio, 'caio@exemplo.test',  now(), '{"display_name":"Caio"}'),
  (:iris, 'iris@exemplo.test',  now(), '{"display_name":"Iris"}'),
  (:theo, 'theo@exemplo.test',  now(), '{"display_name":"Theo"}'),
  (:rui,  'rui@exemplo.test',   now(), '{"display_name":"Rui"}'),
  (:vera, 'vera@empresa.test',  now(), '{"display_name":"Vera"}'),
  (:noel, 'noel@exemplo.test',  now(), '{"display_name":"Noel"}');

-- Espaços pessoais.
set role authenticated;
do $$
declare
  p text;
  space jsonb;
begin
  foreach p in array array['bia', 'caio', 'iris', 'theo', 'rui', 'vera', 'noel'] loop
    perform pg_temp.as_(p);
    space := public.ensure_personal_space('Conta principal');
    insert into ids values (p || '_ctx', (space ->> 'context_id')::uuid), (p || '_acc', (space #>> '{account,id}')::uuid);
  end loop;
end $$;
reset role;

-- Família da Bia (Caio só lê; Iris escreve sem "editar de outras pessoas"; Theo escreve e altera o que é dos outros) e a
-- empresa da Vera com a licença da Bia, preparadas pelo backend.
with f as (
  insert into public.financial_contexts (kind, name, owner_person_id) values ('familia', 'Família da Bia', :bia) returning id
) insert into ids select 'fam', id from f;
insert into public.context_memberships (context_id, person_id, role, can_read, can_write, can_edit_others)
  select id, :bia::uuid, 'titular'::public.membership_role, true, true, true from ids where name = 'fam'
  union all
  select id, :caio::uuid, 'membro'::public.membership_role, true, false, false from ids where name = 'fam'
  union all
  select id, :iris::uuid, 'membro'::public.membership_role, true, true, false from ids where name = 'fam'
  union all
  select id, :theo::uuid, 'membro'::public.membership_role, true, true, true from ids where name = 'fam';
insert into public.organizations (id, name) values ('10000000-0000-0000-0000-0000000000c1', 'Empresa Fictícia das Metas');
insert into public.organization_admins values ('10000000-0000-0000-0000-0000000000c1', :vera);
insert into public.benefit_contracts (id, organization_id, seats, plan, starts_on)
  values ('20000000-0000-0000-0000-0000000000c1', '10000000-0000-0000-0000-0000000000c1', 10, 'familiar', '2026-05-01');
insert into public.licenses (id, contract_id, invited_email, person_id, status, activated_at)
  values ('30000000-0000-0000-0000-0000000000c1', '20000000-0000-0000-0000-0000000000c1', 'bia@exemplo.test', :bia, 'ativa', now());

-- ---------------------------------------------------------------------------
-- 1. Conta nova: nenhuma meta nem movimento de exemplo.
-- ---------------------------------------------------------------------------
set role authenticated;
do $$ begin
  perform pg_temp.as_('noel');
  assert (select count(*) from public.goals) = 0 and (select count(*) from public.goal_movements) = 0
     and (select count(*) from public.goal_items) = 0, 'conta nova sem meta de exemplo';
end $$;

-- ---------------------------------------------------------------------------
-- 2. Validação (Noel, hoje 07/10/2026): sessão, chave, permissão e, em create_goal, tipo, nome, alvo (reserva: base,
-- meses, origem, base × meses no limite, alvo igual ao produto; outras: sem campos da reserva, valor, limite), prazo,
-- plano por mês e valor já guardado (valor, data), nessa ordem. Recusas não gravam operação.
-- ---------------------------------------------------------------------------
do $$
declare
  ctx uuid := pg_temp.id('noel_ctx');
  res jsonb;
begin
  perform pg_temp.as_('ninguem');
  perform pg_temp.expect_code(pg_temp.cg('mt-n-0001', ctx, 'objetivo', 'Curso', 100000, null, null, null, null, null, null, null),
    'nao_autenticado', '42501');
  perform pg_temp.expect_code(pg_temp.ug('mt-n-0002', gen_random_uuid(), 1, 'objetivo', 'Curso', 1, null, null, null, null, null),
    'nao_autenticado', '42501');
  perform pg_temp.expect_code(pg_temp.sg('mt-n-0003', gen_random_uuid(), 1, 'ativa'), 'nao_autenticado', '42501');
  perform pg_temp.expect_code(pg_temp.dg('mt-n-0004', gen_random_uuid(), 1), 'nao_autenticado', '42501');
  perform pg_temp.expect_code(pg_temp.am('mt-n-0005', gen_random_uuid(), 'aporte', 1, '2026-10-07'), 'nao_autenticado', '42501');
  perform pg_temp.expect_code(pg_temp.um('mt-n-0006', gen_random_uuid(), 1, 1, '2026-10-07'), 'nao_autenticado', '42501');
  perform pg_temp.expect_code(pg_temp.dm('mt-n-0007', gen_random_uuid(), 1), 'nao_autenticado', '42501');

  perform pg_temp.as_('noel');
  -- Chave: nula, curta ou com mais de 80 caracteres, em todas as funções.
  perform pg_temp.expect_code(pg_temp.cg('curta', ctx, 'objetivo', 'Curso', 100000, null, null, null, null, null, null, null),
    'chave_invalida', '22023');
  perform pg_temp.expect_code(pg_temp.cg(null, ctx, 'objetivo', 'Curso', 100000, null, null, null, null, null, null, null),
    'chave_invalida', '22023');
  perform pg_temp.expect_code(pg_temp.cg(repeat('k', 81), ctx, 'objetivo', 'Curso', 100000, null, null, null, null, null, null, null),
    'chave_invalida', '22023');
  perform pg_temp.expect_code(pg_temp.ug('curta', gen_random_uuid(), 1, 'objetivo', 'Curso', 1, null, null, null, null, null),
    'chave_invalida', '22023');
  perform pg_temp.expect_code(pg_temp.sg('curta', gen_random_uuid(), 1, 'ativa'), 'chave_invalida', '22023');
  perform pg_temp.expect_code(pg_temp.dg('curta', gen_random_uuid(), 1), 'chave_invalida', '22023');
  perform pg_temp.expect_code(pg_temp.am('curta', gen_random_uuid(), 'aporte', 1, '2026-10-07'), 'chave_invalida', '22023');
  perform pg_temp.expect_code(pg_temp.um('curta', gen_random_uuid(), 1, 1, '2026-10-07'), 'chave_invalida', '22023');
  perform pg_temp.expect_code(pg_temp.dm('curta', gen_random_uuid(), 1), 'chave_invalida', '22023');

  -- Permissão antes da validação: contexto inexistente ou de outra pessoa, mesmo com dados inválidos.
  perform pg_temp.expect_code(pg_temp.cg('mt-n-0010', gen_random_uuid(), 'objetivo', 'Curso', 100000, null, null, null, null, null,
    null, null), 'sem_permissao', '42501');
  perform pg_temp.expect_code(pg_temp.cg('mt-n-0011', pg_temp.id('bia_ctx'), 'x', '', 0, null, null, null, null, null, null, null),
    'sem_permissao', '42501');
  -- Meta ou movimento inexistente: nao_encontrado.
  perform pg_temp.expect_code(pg_temp.ug('mt-n-0012', gen_random_uuid(), 1, 'objetivo', 'Curso', 1, null, null, null, null, null),
    'nao_encontrado', 'P0002');
  perform pg_temp.expect_code(pg_temp.sg('mt-n-0013', gen_random_uuid(), 1, 'ativa'), 'nao_encontrado', 'P0002');
  perform pg_temp.expect_code(pg_temp.dg('mt-n-0014', gen_random_uuid(), 1), 'nao_encontrado', 'P0002');
  perform pg_temp.expect_code(pg_temp.am('mt-n-0015', gen_random_uuid(), 'aporte', 1, '2026-10-07'), 'nao_encontrado', 'P0002');
  perform pg_temp.expect_code(pg_temp.um('mt-n-0016', gen_random_uuid(), 1, 1, '2026-10-07'), 'nao_encontrado', 'P0002');
  perform pg_temp.expect_code(pg_temp.dm('mt-n-0017', gen_random_uuid(), 1), 'nao_encontrado', 'P0002');

  -- Tipo.
  perform pg_temp.expect_code(pg_temp.cg('mt-n-0020', ctx, null, 'Curso', 100000, null, null, null, null, null, null, null),
    'tipo_invalido', '22023');
  perform pg_temp.expect_code(pg_temp.cg('mt-n-0021', ctx, 'meta', 'Curso', 100000, null, null, null, null, null, null, null),
    'tipo_invalido', '22023');
  perform pg_temp.expect_code(pg_temp.cg('mt-n-0022', ctx, 'x', '', 0, '2026-01-15', 0, 0, 0, 'x', -1, '2027-01-01'),
    'tipo_invalido', '22023');
  -- Nome (aparado): nulo, vazio, só espaços, 41 caracteres; nome antes do valor.
  perform pg_temp.expect_code(pg_temp.cg('mt-n-0023', ctx, 'objetivo', null, 100000, null, null, null, null, null, null, null),
    'nome_da_meta_invalido', '22023');
  perform pg_temp.expect_code(pg_temp.cg('mt-n-0024', ctx, 'objetivo', '', 100000, null, null, null, null, null, null, null),
    'nome_da_meta_invalido', '22023');
  perform pg_temp.expect_code(pg_temp.cg('mt-n-0025', ctx, 'objetivo', E' \t\n ', 100000, null, null, null, null, null, null, null),
    'nome_da_meta_invalido', '22023');
  perform pg_temp.expect_code(pg_temp.cg('mt-n-0026', ctx, 'objetivo', repeat('a', 41), 100000, null, null, null, null, null, null,
    null), 'nome_da_meta_invalido', '22023');
  perform pg_temp.expect_code(pg_temp.cg('mt-n-0027', ctx, 'objetivo', '', 0, '2026-01-15', 0, null, null, null, -1, null),
    'nome_da_meta_invalido', '22023');
  -- Objetivo e reserva de oportunidade: sem campos da reserva; valor de 1 a 999.999.999.
  perform pg_temp.expect_code(pg_temp.cg('mt-n-0030', ctx, 'objetivo', 'Curso', null, null, null, null, null, null, null, null),
    'valor_invalido', '22023');
  perform pg_temp.expect_code(pg_temp.cg('mt-n-0031', ctx, 'objetivo', 'Curso', 0, null, null, null, null, null, null, null),
    'valor_invalido', '22023');
  perform pg_temp.expect_code(pg_temp.cg('mt-n-0032', ctx, 'oportunidade', 'Curso', -1, null, null, null, null, null, null, null),
    'valor_invalido', '22023');
  perform pg_temp.expect_code(pg_temp.cg('mt-n-0033', ctx, 'objetivo', 'Curso', 1000000000, null, null, null, null, null, null, null),
    'alvo_acima_do_limite', '22023');
  perform pg_temp.expect_code(pg_temp.cg('mt-n-0034', ctx, 'objetivo', 'Curso', 100000, null, null, 1, null, null, null, null),
    'tipo_invalido', '22023');
  perform pg_temp.expect_code(pg_temp.cg('mt-n-0035', ctx, 'oportunidade', 'Curso', 100000, null, null, null, 6, null, null, null),
    'tipo_invalido', '22023');
  perform pg_temp.expect_code(pg_temp.cg('mt-n-0036', ctx, 'objetivo', 'Curso', 100000, null, null, null, null, 'informado', null,
    null), 'tipo_invalido', '22023');
  perform pg_temp.expect_code(pg_temp.cg('mt-n-0037', ctx, 'objetivo', 'Curso', 0, null, null, 1, 6, 'informado', null, null),
    'tipo_invalido', '22023');
  -- Reserva: base, meses (1 a 24), origem, base × meses até 999.999.999 (sem estouro), alvo informado igual ao produto.
  perform pg_temp.expect_code(pg_temp.cg('mt-n-0040', ctx, 'emergencia', 'Reserva', null, null, null, null, 6, 'informado', null,
    null), 'valor_invalido', '22023');
  perform pg_temp.expect_code(pg_temp.cg('mt-n-0041', ctx, 'emergencia', 'Reserva', null, null, null, 0, 6, 'informado', null, null),
    'valor_invalido', '22023');
  perform pg_temp.expect_code(pg_temp.cg('mt-n-0042', ctx, 'emergencia', 'Reserva', null, null, null, 375000, null, 'informado', null,
    null), 'meses_invalidos', '22023');
  perform pg_temp.expect_code(pg_temp.cg('mt-n-0043', ctx, 'emergencia', 'Reserva', null, null, null, 375000, 0, 'informado', null,
    null), 'meses_invalidos', '22023');
  perform pg_temp.expect_code(pg_temp.cg('mt-n-0044', ctx, 'emergencia', 'Reserva', null, null, null, 375000, 25, 'informado', null,
    null), 'meses_invalidos', '22023');
  perform pg_temp.expect_code(pg_temp.cg('mt-n-0045', ctx, 'emergencia', 'Reserva', null, null, null, 375000, 40000, 'informado',
    null, null), 'meses_invalidos', '22023');
  perform pg_temp.expect_code(pg_temp.cg('mt-n-0046', ctx, 'emergencia', 'Reserva', null, null, null, 375000, 6, null, null, null),
    'origem_invalida', '22023');
  perform pg_temp.expect_code(pg_temp.cg('mt-n-0047', ctx, 'emergencia', 'Reserva', null, null, null, 375000, 6, 'media', null, null),
    'origem_invalida', '22023');
  perform pg_temp.expect_code(pg_temp.cg('mt-n-0048', ctx, 'emergencia', 'Reserva', null, null, null, 0, 0, null, null, null),
    'valor_invalido', '22023');
  perform pg_temp.expect_code(pg_temp.cg('mt-n-0049', ctx, 'emergencia', 'Reserva', null, null, null, 1, 0, null, null, null),
    'meses_invalidos', '22023');
  perform pg_temp.expect_code(pg_temp.cg('mt-n-0050', ctx, 'emergencia', 'Reserva', null, null, null, 41666667, 24, 'informado', null,
    null), 'alvo_acima_do_limite', '22023');
  perform pg_temp.expect_code(pg_temp.cg('mt-n-0051', ctx, 'emergencia', 'Reserva', null, null, null, 999999999, 2, 'informado', null,
    null), 'alvo_acima_do_limite', '22023');
  perform pg_temp.expect_code(pg_temp.cg('mt-n-0052', ctx, 'emergencia', 'Reserva', null, null, null, 1000000000, 1, 'informado',
    null, null), 'alvo_acima_do_limite', '22023');
  perform pg_temp.expect_code(pg_temp.cg('mt-n-0053', ctx, 'emergencia', 'Reserva', null, null, null, 9223372036854775807, 24,
    'informado', null, null), 'alvo_acima_do_limite', '22023');
  perform pg_temp.expect_code(pg_temp.cg('mt-n-0054', ctx, 'emergencia', 'Reserva', 2250001, null, null, 375000, 6, 'media_gastos',
    null, null), 'alvo_invalido', '22023');
  perform pg_temp.expect_code(pg_temp.cg('mt-n-0055', ctx, 'emergencia', 'Reserva', 0, null, null, 375000, 6, 'media_gastos', null,
    null), 'alvo_invalido', '22023');
  -- Prazo: primeiro dia de um mês, do mês de hoje a 600 meses depois; prazo antes do plano.
  perform pg_temp.expect_code(pg_temp.cg('mt-n-0060', ctx, 'objetivo', 'Curso', 100000, '2026-10-15', null, null, null, null, null,
    null), 'prazo_invalido', '22023');
  perform pg_temp.expect_code(pg_temp.cg('mt-n-0061', ctx, 'objetivo', 'Curso', 100000, '2026-09-01', null, null, null, null, null,
    null), 'prazo_invalido', '22023');
  perform pg_temp.expect_code(pg_temp.cg('mt-n-0062', ctx, 'objetivo', 'Curso', 100000, '2076-11-01', null, null, null, null, null,
    null), 'prazo_invalido', '22023');
  perform pg_temp.expect_code(pg_temp.cg('mt-n-0063', ctx, 'emergencia', 'Reserva', null, '2026-09-01', 0, 375000, 6, 'informado',
    -1, null), 'prazo_invalido', '22023');
  -- Plano por mês: de 1 a 999.999.999 (nulo = sem plano); plano antes do valor já guardado.
  perform pg_temp.expect_code(pg_temp.cg('mt-n-0070', ctx, 'objetivo', 'Curso', 100000, null, 0, null, null, null, null, null),
    'plano_invalido', '22023');
  perform pg_temp.expect_code(pg_temp.cg('mt-n-0071', ctx, 'objetivo', 'Curso', 100000, null, -1, null, null, null, null, null),
    'plano_invalido', '22023');
  perform pg_temp.expect_code(pg_temp.cg('mt-n-0072', ctx, 'objetivo', 'Curso', 100000, null, 1000000000, null, null, null, null,
    null), 'plano_invalido', '22023');
  perform pg_temp.expect_code(pg_temp.cg('mt-n-0073', ctx, 'objetivo', 'Curso', 100000, null, 0, null, null, null, -1, '2027-01-01'),
    'plano_invalido', '22023');
  -- Valor já guardado: de 0 a 999.999.999; com valor, data até hoje; valor antes da data.
  perform pg_temp.expect_code(pg_temp.cg('mt-n-0080', ctx, 'objetivo', 'Curso', 100000, null, null, null, null, null, -1, '2026-10-01'),
    'saldo_inicial_invalido', '22023');
  perform pg_temp.expect_code(pg_temp.cg('mt-n-0081', ctx, 'objetivo', 'Curso', 100000, null, null, null, null, null, 1000000000,
    '2026-10-01'), 'saldo_inicial_invalido', '22023');
  perform pg_temp.expect_code(pg_temp.cg('mt-n-0082', ctx, 'objetivo', 'Curso', 100000, null, null, null, null, null, -1, null),
    'saldo_inicial_invalido', '22023');
  perform pg_temp.expect_code(pg_temp.cg('mt-n-0083', ctx, 'objetivo', 'Curso', 100000, null, null, null, null, null, 100, null),
    'data_invalida', '22023');
  perform pg_temp.expect_code(pg_temp.cg('mt-n-0084', ctx, 'objetivo', 'Curso', 100000, null, null, null, null, null, 100,
    '2026-10-08'), 'data_futura', '22023');
  assert (select count(*) from public.record_operations where idempotency_key like 'mt-n-00%') = 0, 'recusas não gravam operação';
  assert (select count(*) from public.goals) = 0, 'recusas não gravam meta';

  -- Limites aceitos: nome de 40 caracteres, alvo, plano e valor já guardado de R$ 9.999.999,99, prazo 600 meses depois,
  -- valor já guardado com data de hoje.
  res := public.create_goal('mt-n-0101', ctx, 'objetivo', repeat('a', 40), 999999999, '2076-10-01', 999999999, null, null, null,
                            999999999, '2026-10-07');
  assert res #>> '{goal,name}' = repeat('a', 40) and (res #>> '{goal,target_cents}')::bigint = 999999999
     and res #>> '{goal,target_month}' = '2076-10-01' and (res #>> '{goal,planned_monthly_cents}')::bigint = 999999999
     and (res #>> '{goal,saved_cents}')::bigint = 999999999 and res #>> '{movement,kind}' = 'saldo_inicial'
     and res #>> '{movement,occurred_on}' = '2026-10-07', 'limites superiores';
  perform public.delete_goal('mt-n-0102', (res #>> '{goal,id}')::uuid, 1);
  -- Reserva: nome aparado, alvo = base × meses (999.999.984 = 41.666.666 × 24) com alvo nulo, prazo no mês de hoje,
  -- valor já guardado 0 sem movimento.
  res := public.create_goal('mt-n-0103', ctx, 'emergencia', E'  Reserva \n', null, '2026-10-01', 1, 41666666, 24, 'informado', 0, null);
  assert res #>> '{goal,name}' = 'Reserva' and (res #>> '{goal,target_cents}')::bigint = 999999984
     and (res #>> '{goal,essential_months}')::int = 24 and res #>> '{goal,essential_base_source}' = 'informado'
     and res #>> '{goal,status}' = 'ativa' and res -> 'movement' = 'null'::jsonb and (res #>> '{goal,saved_cents}')::bigint = 0,
    'reserva no limite, sem valor já guardado';
  perform public.delete_goal('mt-n-0104', (res #>> '{goal,id}')::uuid, 1);
  -- Reserva com o alvo informado igual ao produto; sem valor já guardado, a data é ignorada (mesmo futura).
  res := public.create_goal('mt-n-0105', ctx, 'emergencia', 'Reserva', 2250000, null, null, 375000, 6, 'contas_do_mes', null,
                            '2027-01-01');
  assert (res #>> '{goal,target_cents}')::bigint = 2250000 and res -> 'movement' = 'null'::jsonb
     and not exists (select 1 from public.goal_movements), 'alvo igual ao produto; data ignorada sem valor';
  perform public.delete_goal('mt-n-0106', (res #>> '{goal,id}')::uuid, 1);

  -- O prazo e a data acompanham o hoje da pessoa (29/02/2028: prazo de fevereiro de 2028 a fevereiro de 2078).
  perform pg_temp.today('2028-02-29');
  perform pg_temp.expect_code(pg_temp.cg('mt-n-0090', ctx, 'objetivo', 'Curso', 100000, '2028-01-01', null, null, null, null, null,
    null), 'prazo_invalido', '22023');
  perform pg_temp.expect_code(pg_temp.cg('mt-n-0091', ctx, 'objetivo', 'Curso', 100000, '2078-03-01', null, null, null, null, null,
    null), 'prazo_invalido', '22023');
  perform pg_temp.expect_code(pg_temp.cg('mt-n-0092', ctx, 'objetivo', 'Curso', 100000, '2078-02-01', null, null, null, null, 100,
    '2028-03-01'), 'data_futura', '22023');
  res := public.create_goal('mt-n-0107', ctx, 'objetivo', 'Curso', 100000, '2078-02-01', null, null, null, null, 100, '2028-02-29');
  perform public.delete_goal('mt-n-0108', (res #>> '{goal,id}')::uuid, 1);
  res := public.create_goal('mt-n-0109', ctx, 'objetivo', 'Curso', 100000, '2028-02-01', null, null, null, null, null, null);
  perform public.delete_goal('mt-n-0110', (res #>> '{goal,id}')::uuid, 1);
  perform pg_temp.today('2026-10-07');
  assert (select count(*) from public.goal_items) = 0, 'limites desfeitos';
end $$;

-- ---------------------------------------------------------------------------
-- 3. Repetição, hash, versão, movimentos e situação (Noel, hoje 07/10/2026).
-- ---------------------------------------------------------------------------
do $$
declare
  ctx uuid := pg_temp.id('noel_ctx');
  r1 jsonb;
  r2 jsonb;
  r3 jsonb;
  g uuid;
  m0 uuid;
  m1 uuid;
  m2 uuid;
  m3 uuid;
  m4 uuid;
  m5 uuid;
  cid uuid;
begin
  perform pg_temp.as_('noel');
  r1 := public.create_goal('mt-n-0201', ctx, 'objetivo', '  Curso  ', 120000, '2027-03-01', 5000, null, null, null, 10000, '2026-10-01');
  g := (r1 #>> '{goal,id}')::uuid;
  m0 := (r1 #>> '{movement,id}')::uuid;
  assert (select array_agg(k order by k) from jsonb_object_keys(r1) k) = array['goal', 'movement'], 'retorno {goal, movement}';
  assert (select array_agg(k order by k) from jsonb_object_keys(r1 -> 'goal') k)
    = array['appreciation_cents', 'context_id', 'created_at', 'created_by', 'deleted_at', 'deleted_by', 'deposits_cents',
            'depreciation_cents', 'essential_base_cents', 'essential_base_source', 'essential_months', 'goal_type', 'id', 'income_cents',
            'initial_cents', 'last_movement_on', 'name', 'planned_monthly_cents', 'saved_cents', 'status', 'target_cents',
            'target_month', 'updated_at', 'version', 'withdrawals_cents'], 'goal: a linha de goals com as somas de goal_items';
  assert (select array_agg(k order by k) from jsonb_object_keys(r1 -> 'movement') k)
    = array['account_id', 'amount_cents', 'context_id', 'created_at', 'created_by', 'deleted_at', 'deleted_by', 'goal_id', 'id', 'kind',
            'note', 'occurred_on', 'updated_at', 'version'], 'movement: a linha de goal_movements (com a conta opcional da 0010)';
  assert r1 #>> '{goal,name}' = 'Curso' and r1 #>> '{goal,goal_type}' = 'objetivo' and (r1 #>> '{goal,target_cents}')::bigint = 120000
     and r1 #>> '{goal,target_month}' = '2027-03-01' and (r1 #>> '{goal,planned_monthly_cents}')::bigint = 5000
     and r1 #> '{goal,essential_base_cents}' = 'null'::jsonb and r1 #>> '{goal,status}' = 'ativa'
     and (r1 #>> '{goal,version}')::int = 1 and r1 #>> '{goal,created_by}' = auth.uid()::text and r1 #>> '{goal,context_id}' = ctx::text
     and r1 #> '{goal,deleted_at}' = 'null'::jsonb and (r1 #>> '{goal,saved_cents}')::bigint = 10000
     and (r1 #>> '{goal,initial_cents}')::bigint = 10000 and r1 #>> '{goal,last_movement_on}' = '2026-10-01', 'meta criada';
  assert r1 #>> '{movement,kind}' = 'saldo_inicial' and (r1 #>> '{movement,amount_cents}')::bigint = 10000
     and r1 #>> '{movement,occurred_on}' = '2026-10-01' and r1 #> '{movement,note}' = 'null'::jsonb
     and r1 #>> '{movement,goal_id}' = g::text and r1 #>> '{movement,context_id}' = ctx::text
     and (r1 #>> '{movement,version}')::int = 1 and r1 #>> '{movement,created_by}' = auth.uid()::text, 'já guardado ao criar';
  assert (select to_jsonb(i) from public.goal_items i where i.id = g) = (r1 -> 'goal') - 'deleted_at' - 'deleted_by',
    'goal_items no mesmo formato do resultado';
  perform pg_temp.expect_goal(g, 'alvo 120000 guardado 10000 | ini 10000 apo 0 res 0 ren 0 val 0 desv 0 | ativa v1 | ult 2026-10-01',
    'meta criada');

  -- Repetição (o nome é aparado antes do hash): o mesmo resultado, sem linha nova.
  r2 := public.create_goal('mt-n-0201', ctx, 'objetivo', 'Curso', 120000, '2027-03-01', 5000, null, null, null, 10000, '2026-10-01');
  assert r2 = r1, 'repetição devolve o mesmo resultado';
  assert (select count(*) from public.goals) = 1 and (select count(*) from public.goal_movements) = 1
     and (select count(*) from public.record_operations where idempotency_key = 'mt-n-0201') = 1, 'repetição não grava nada';
  assert (select (action, request_hash, target_id, record_id, commitment_id, context_id) from public.record_operations
           where idempotency_key = 'mt-n-0201')
       is not distinct from ('criar_meta'::text,
          md5(format('["criar_meta", "%s", "objetivo", "Curso", 120000, "2027-03-01", 5000, null, null, null, 10000, "2026-10-01"]', ctx)),
          g, null::uuid, null::uuid, ctx), 'hash md5 de jsonb_build_array(ação, argumentos)::text e alvo em target_id';
  -- Mesma chave com outro pedido ou outra ação: chave_reutilizada (nos dois sentidos, inclusive com conta a pagar).
  perform pg_temp.expect_code(pg_temp.cg('mt-n-0201', ctx, 'objetivo', 'Curso', 120001, '2027-03-01', 5000, null, null, null, 10000,
    '2026-10-01'), 'chave_reutilizada', 'PT409');
  perform pg_temp.expect_code(pg_temp.cg('mt-n-0201', ctx, 'objetivo', 'Curso', 120000, '2027-03-01', 5000, null, null, null, 10000,
    null), 'chave_reutilizada', 'PT409');
  perform pg_temp.expect_code(pg_temp.am('mt-n-0201', g, 'aporte', 1, '2026-10-07'), 'chave_reutilizada', 'PT409');
  perform pg_temp.expect_code(pg_temp.dg('mt-n-0201', g, 1), 'chave_reutilizada', 'PT409');
  perform pg_temp.expect_error(format($f$select public.create_commitment('mt-n-0201', %L, 1000, '2026-10-30', 'Feira')$f$, ctx),
    'chave_reutilizada');
  cid := (public.create_commitment('mt-n-0202', ctx, 1000, '2026-10-30', 'Feira') #>> '{commitment,id}')::uuid;
  perform pg_temp.expect_code(pg_temp.cg('mt-n-0202', ctx, 'objetivo', 'Curso', 1, null, null, null, null, null, null, null),
    'chave_reutilizada', 'PT409');
  perform pg_temp.expect_code(pg_temp.am('mt-n-0202', g, 'aporte', 1, '2026-10-07'), 'chave_reutilizada', 'PT409');
  perform public.delete_commitment('mt-n-0203', cid, 1);
  -- Recusa não gasta a chave.
  perform pg_temp.expect_code(pg_temp.cg('mt-n-0204', ctx, 'objetivo', '', 50000, null, null, null, null, null, null, null),
    'nome_da_meta_invalido', '22023');
  assert not exists (select 1 from public.record_operations where idempotency_key = 'mt-n-0204'), 'recusa não gasta a chave';
  r2 := public.create_goal('mt-n-0204', ctx, 'oportunidade', 'Bicicleta', 50000, null, null, null, null, null, null, null);
  assert r2 #>> '{goal,goal_type}' = 'oportunidade' and r2 -> 'movement' = 'null'::jsonb, 'mesma chave depois da recusa';

  -- Movimentos: aporte com observação aparada (aspas e barra vertical no hash em JSON); a versão da meta não muda.
  r2 := public.add_goal_movement('mt-n-0205', g, 'aporte', 2500, '2026-10-05', '  Parte "extra" | bônus  ');
  m1 := (r2 #>> '{movement,id}')::uuid;
  assert r2 #>> '{movement,note}' = 'Parte "extra" | bônus' and r2 #>> '{movement,kind}' = 'aporte'
     and (r2 #>> '{movement,version}')::int = 1 and (r2 #>> '{goal,saved_cents}')::bigint = 12500
     and (r2 #>> '{goal,deposits_cents}')::bigint = 2500 and (r2 #>> '{goal,version}')::int = 1, 'aporte registrado';
  assert (select (action, request_hash, target_id, record_id, commitment_id, context_id) from public.record_operations
           where idempotency_key = 'mt-n-0205')
       is not distinct from ('registrar_movimento_meta'::text,
          md5(format('["registrar_movimento_meta", "%s", "aporte", 2500, "2026-10-05", "Parte \"extra\" | bônus"]', g)),
          m1, null::uuid, null::uuid, ctx), 'hash e alvo do movimento';
  assert public.add_goal_movement('mt-n-0205', g, 'aporte', 2500, '2026-10-05', 'Parte "extra" | bônus') = r2, 'repetição do aporte';
  perform pg_temp.expect_code(pg_temp.am('mt-n-0205', g, 'aporte', 2500, '2026-10-05', 'Parte "extra" | bonus'), 'chave_reutilizada',
    'PT409');
  -- Observação vazia ou só com espaços vale nula (mesmo hash).
  r2 := public.add_goal_movement('mt-n-0206', g, 'rendimento', 100, '2026-10-06', '');
  m2 := (r2 #>> '{movement,id}')::uuid;
  assert r2 #> '{movement,note}' = 'null'::jsonb and (r2 #>> '{goal,saved_cents}')::bigint = 12600, 'rendimento recebido';
  assert public.add_goal_movement('mt-n-0206', g, 'rendimento', 100, '2026-10-06', null) = r2
     and public.add_goal_movement('mt-n-0206', g, 'rendimento', 100, '2026-10-06', '   ') = r2, 'observação vazia = nula';
  assert (select request_hash from public.record_operations where idempotency_key = 'mt-n-0206')
       = md5(format('["registrar_movimento_meta", "%s", "rendimento", 100, "2026-10-06", null]', g)), 'nulo no hash';
  -- Observação de 80 caracteres aceita; 81, recusada.
  r2 := public.add_goal_movement('mt-n-0207', g, 'valorizacao', 1, '2026-10-06', repeat('o', 80));
  m3 := (r2 #>> '{movement,id}')::uuid;
  assert char_length(r2 #>> '{movement,note}') = 80, 'observação de 80 caracteres';
  -- Validação do movimento: tipo (saldo_inicial só ao criar), valor, data e observação, nessa ordem.
  perform pg_temp.expect_code(pg_temp.am('mt-n-0210', g, null, 100, '2026-10-07'), 'tipo_invalido', '22023');
  perform pg_temp.expect_code(pg_temp.am('mt-n-0211', g, 'saldo_inicial', 100, '2026-10-07'), 'tipo_invalido', '22023');
  perform pg_temp.expect_code(pg_temp.am('mt-n-0212', g, 'deposito', 100, '2026-10-07'), 'tipo_invalido', '22023');
  perform pg_temp.expect_code(pg_temp.am('mt-n-0213', g, 'x', 0, null, repeat('o', 81)), 'tipo_invalido', '22023');
  perform pg_temp.expect_code(pg_temp.am('mt-n-0214', g, 'aporte', null, '2026-10-07'), 'valor_invalido', '22023');
  perform pg_temp.expect_code(pg_temp.am('mt-n-0215', g, 'aporte', 0, '2026-10-07'), 'valor_invalido', '22023');
  perform pg_temp.expect_code(pg_temp.am('mt-n-0216', g, 'resgate', -1, '2026-10-07'), 'valor_invalido', '22023');
  perform pg_temp.expect_code(pg_temp.am('mt-n-0217', g, 'aporte', 1000000000, '2026-10-07'), 'valor_acima_do_limite', '22023');
  perform pg_temp.expect_code(pg_temp.am('mt-n-0218', g, 'aporte', 0, null, repeat('o', 81)), 'valor_invalido', '22023');
  perform pg_temp.expect_code(pg_temp.am('mt-n-0219', g, 'aporte', 100, null), 'data_invalida', '22023');
  perform pg_temp.expect_code(pg_temp.am('mt-n-0220', g, 'aporte', 100, '2026-10-08'), 'data_futura', '22023');
  perform pg_temp.expect_code(pg_temp.am('mt-n-0221', g, 'aporte', 100, null, repeat('o', 81)), 'data_invalida', '22023');
  perform pg_temp.expect_code(pg_temp.am('mt-n-0222', g, 'aporte', 100, '2026-10-07', repeat('o', 81)), 'observacao_longa', '22023');
  assert not exists (select 1 from public.record_operations where idempotency_key between 'mt-n-0210' and 'mt-n-0222'),
    'recusas de movimento não gravam operação';
  perform pg_temp.expect_goal(g, 'alvo 120000 guardado 12601 | ini 10000 apo 2500 res 0 ren 100 val 1 desv 0 | ativa v1 | ult 2026-10-06',
    'depois dos movimentos');

  -- Alterar movimento com a versão (o tipo não muda); recusas de versão antes da validação.
  r2 := public.update_goal_movement('mt-n-0230', m1, 1, 3000, '2026-10-06', null);
  assert (r2 #>> '{movement,id}')::uuid = m1 and (r2 #>> '{movement,version}')::int = 2
     and (r2 #>> '{movement,amount_cents}')::bigint = 3000 and r2 #>> '{movement,occurred_on}' = '2026-10-06'
     and r2 #> '{movement,note}' = 'null'::jsonb and r2 #>> '{movement,kind}' = 'aporte'
     and (r2 #>> '{goal,saved_cents}')::bigint = 13101 and (r2 #>> '{goal,version}')::int = 1, 'movimento alterado';
  assert (select request_hash from public.record_operations where idempotency_key = 'mt-n-0230')
       = md5(format('["alterar_movimento_meta", "%s", 1, 3000, "2026-10-06", null]', m1)), 'hash da alteração';
  perform pg_temp.expect_stale(pg_temp.um('mt-n-0231', m1, 1, 3000, '2026-10-06'), 'versao_atual=2');
  perform pg_temp.expect_stale(pg_temp.um('mt-n-0232', m1, null, 3000, '2026-10-06'), 'versao_atual=2');
  perform pg_temp.expect_stale(pg_temp.um('mt-n-0233', m1, 3, 3000, '2026-10-06'), 'versao_atual=2');
  perform pg_temp.expect_stale(pg_temp.um('mt-n-0234', m1, 1, 0, null), 'versao_atual=2');
  perform pg_temp.expect_code(pg_temp.um('mt-n-0235', m1, 2, 0, '2026-10-06'), 'valor_invalido', '22023');
  perform pg_temp.expect_code(pg_temp.um('mt-n-0236', m1, 2, 1000000000, '2026-10-06'), 'valor_acima_do_limite', '22023');
  perform pg_temp.expect_code(pg_temp.um('mt-n-0237', m1, 2, 3000, null), 'data_invalida', '22023');
  perform pg_temp.expect_code(pg_temp.um('mt-n-0238', m1, 2, 3000, '2026-10-08'), 'data_futura', '22023');
  perform pg_temp.expect_code(pg_temp.um('mt-n-0239', m1, 2, 3000, '2026-10-06', repeat('o', 81)), 'observacao_longa', '22023');
  -- A repetição antiga do aporte devolve o estado atual.
  r2 := public.add_goal_movement('mt-n-0205', g, 'aporte', 2500, '2026-10-05', 'Parte "extra" | bônus');
  assert (r2 #>> '{movement,amount_cents}')::bigint = 3000 and (r2 #>> '{movement,version}')::int = 2, 'repetição: estado atual';

  -- Alterar a meta com a versão.
  r2 := public.update_goal('mt-n-0240', g, 1, 'objetivo', 'Curso de inglês', 150000, '2027-03-01', 5000, null, null, null);
  assert (r2 #>> '{goal,version}')::int = 2 and r2 #>> '{goal,name}' = 'Curso de inglês'
     and (r2 #>> '{goal,target_cents}')::bigint = 150000 and (r2 #>> '{goal,saved_cents}')::bigint = 13101
     and r2 -> 'movement' = 'null'::jsonb, 'meta alterada';
  assert (select request_hash from public.record_operations where idempotency_key = 'mt-n-0240')
       = md5(format('["alterar_meta", "%s", 1, "objetivo", "Curso de inglês", 150000, "2027-03-01", 5000, null, null, null]', g)),
    'hash da alteração da meta';
  perform pg_temp.expect_stale(pg_temp.ug('mt-n-0241', g, 1, 'objetivo', 'Curso', 150000, null, null, null, null, null), 'versao_atual=2');
  perform pg_temp.expect_stale(pg_temp.ug('mt-n-0242', g, null, 'objetivo', 'Curso', 150000, null, null, null, null, null), 'versao_atual=2');
  perform pg_temp.expect_stale(pg_temp.ug('mt-n-0243', g, 9, 'objetivo', 'Curso', 150000, null, null, null, null, null), 'versao_atual=2');
  perform pg_temp.expect_stale(pg_temp.ug('mt-n-0244', g, 1, 'x', '', 0, '2020-01-15', 0, null, null, null), 'versao_atual=2');
  perform pg_temp.expect_code(pg_temp.ug('mt-n-0245', g, 2, 'objetivo', '', 150000, null, null, null, null, null),
    'nome_da_meta_invalido', '22023');
  perform pg_temp.expect_code(pg_temp.ug('mt-n-0246', g, 2, 'objetivo', 'Curso', 150000, '2026-09-01', null, null, null, null),
    'prazo_invalido', '22023');
  perform pg_temp.expect_code(pg_temp.ug('mt-n-0247', g, 2, 'objetivo', 'Curso', 150000, null, 0, null, null, null),
    'plano_invalido', '22023');
  -- Movimentos não sobem a versão da meta (registrar, alterar e excluir).
  r2 := public.add_goal_movement('mt-n-0248', g, 'aporte', 1000, '2026-10-07');
  m4 := (r2 #>> '{movement,id}')::uuid;
  perform public.delete_goal_movement('mt-n-0249', m3, 1);
  assert pg_temp.gver(g) = 2, 'movimento não sobe a versão da meta';
  perform pg_temp.expect_goal(g, 'alvo 150000 guardado 14100 | ini 10000 apo 4000 res 0 ren 100 val 0 desv 0 | ativa v2 | ult 2026-10-07',
    'depois de alterar a meta');

  -- Tipo: objetivo e reserva de oportunidade trocam livremente; virar reserva exige base, meses e origem (alvo = produto);
  -- deixar de ser reserva exige tirar os três.
  r2 := public.update_goal('mt-n-0250', g, 2, 'oportunidade', 'Curso de inglês', 150000, '2027-03-01', 5000, null, null, null);
  assert r2 #>> '{goal,goal_type}' = 'oportunidade' and (r2 #>> '{goal,version}')::int = 3, 'objetivo vira oportunidade';
  perform pg_temp.expect_code(pg_temp.ug('mt-n-0251', g, 3, 'emergencia', 'Curso de inglês', 150000, '2027-03-01', 5000, null, null,
    null), 'valor_invalido', '22023');
  r2 := public.update_goal('mt-n-0252', g, 3, 'emergencia', 'Curso de inglês', null, '2027-03-01', 5000, 2500, 6, 'informado');
  assert r2 #>> '{goal,goal_type}' = 'emergencia' and (r2 #>> '{goal,target_cents}')::bigint = 15000
     and (r2 #>> '{goal,essential_base_cents}')::bigint = 2500 and (r2 #>> '{goal,version}')::int = 4, 'vira reserva: alvo = base × meses';
  perform pg_temp.expect_code(pg_temp.ug('mt-n-0253', g, 4, 'objetivo', 'Curso de inglês', 150000, '2027-03-01', 5000, 2500, 6,
    'informado'), 'tipo_invalido', '22023');
  r2 := public.update_goal('mt-n-0254', g, 4, 'objetivo', 'Curso de inglês', 150000, '2027-03-01', 5000, null, null, null);
  assert r2 #>> '{goal,goal_type}' = 'objetivo' and r2 #> '{goal,essential_months}' = 'null'::jsonb
     and (r2 #>> '{goal,version}')::int = 5, 'deixa de ser reserva';

  -- Situação: concluir (escolha da pessoa, sem exigir o alvo), meta concluída continua recebendo movimentos, reativar.
  perform pg_temp.expect_code(pg_temp.sg('mt-n-0260', g, 5, null), 'situacao_invalida', '22023');
  perform pg_temp.expect_code(pg_temp.sg('mt-n-0261', g, 5, 'pausada'), 'situacao_invalida', '22023');
  perform pg_temp.expect_stale(pg_temp.sg('mt-n-0262', g, 4, 'concluida'), 'versao_atual=5');
  perform pg_temp.expect_stale(pg_temp.sg('mt-n-0263', g, null, 'concluida'), 'versao_atual=5');
  perform pg_temp.expect_stale(pg_temp.sg('mt-n-0264', g, 4, 'pausada'), 'versao_atual=5');
  r2 := public.set_goal_status('mt-n-0265', g, 5, 'concluida');
  assert r2 #>> '{goal,status}' = 'concluida' and (r2 #>> '{goal,version}')::int = 6
     and (r2 #>> '{goal,saved_cents}')::bigint < (r2 #>> '{goal,target_cents}')::bigint, 'concluída antes de alcançar';
  assert (select request_hash from public.record_operations where idempotency_key = 'mt-n-0265')
       = md5(format('["situacao_meta", "%s", 5, "concluida"]', g)), 'hash da situação';
  assert public.set_goal_status('mt-n-0265', g, 5, 'concluida') = r2, 'repetição da situação';
  r2 := public.add_goal_movement('mt-n-0266', g, 'resgate', 4100, '2026-10-07', 'Matrícula');
  m5 := (r2 #>> '{movement,id}')::uuid;
  assert (r2 #>> '{goal,saved_cents}')::bigint = 10000 and (r2 #>> '{goal,version}')::int = 6, 'concluída recebe movimento';
  r2 := public.set_goal_status('mt-n-0267', g, 6, 'ativa');
  assert r2 #>> '{goal,status}' = 'ativa' and (r2 #>> '{goal,version}')::int = 7, 'reativada';

  -- Excluir movimento com a versão.
  perform pg_temp.expect_stale(pg_temp.dm('mt-n-0270', m1, 1), 'versao_atual=2');
  perform pg_temp.expect_stale(pg_temp.dm('mt-n-0271', m1, null), 'versao_atual=2');
  r2 := public.delete_goal_movement('mt-n-0272', m1, 2);
  assert (r2 #>> '{movement,id}')::uuid = m1 and (r2 #>> '{movement,version}')::int = 3 and r2 #>> '{movement,deleted_at}' is not null
     and r2 #>> '{movement,deleted_by}' = auth.uid()::text and (r2 #>> '{goal,saved_cents}')::bigint = 7000
     and (r2 #>> '{goal,version}')::int = 7, 'movimento excluído';
  assert (select request_hash from public.record_operations where idempotency_key = 'mt-n-0272')
       = md5(format('["excluir_movimento_meta", "%s", 2]', m1)), 'hash da exclusão do movimento';
  assert public.delete_goal_movement('mt-n-0272', m1, 2) = r2, 'repetição da exclusão do movimento';
  assert not exists (select 1 from public.goal_movements where id = m1), 'o excluído some da leitura';
  perform pg_temp.expect_code(pg_temp.dm('mt-n-0273', m1, 3), 'nao_encontrado', 'P0002');
  perform pg_temp.expect_code(pg_temp.um('mt-n-0274', m1, 3, 1, '2026-10-07'), 'nao_encontrado', 'P0002');
  perform pg_temp.expect_goal(g,
    'alvo 150000 guardado 7000 | ini 10000 apo 1000 res 4100 ren 100 val 0 desv 0 | ativa v7 | ult 2026-10-07', 'antes do prazo');

  -- Prazo vencido só é conferido quando muda (hoje 10/05/2027, prazo de março de 2027).
  perform pg_temp.today('2027-05-10');
  r2 := public.update_goal('mt-n-0280', g, 7, 'objetivo', 'Curso', 150000, '2027-03-01', 5000, null, null, null);
  assert (r2 #>> '{goal,version}')::int = 8 and r2 #>> '{goal,target_month}' = '2027-03-01', 'prazo vencido, sem mudar, é aceito';
  perform pg_temp.expect_code(pg_temp.ug('mt-n-0281', g, 8, 'objetivo', 'Curso', 150000, '2027-04-01', 5000, null, null, null),
    'prazo_invalido', '22023');
  perform pg_temp.today('2026-10-07');

  -- Excluir a meta: os movimentos vivos saem junto (versão +1 em cada); repetições devolvem o estado atual.
  perform pg_temp.expect_stale(pg_temp.dg('mt-n-0290', g, 7), 'versao_atual=8');
  perform pg_temp.expect_stale(pg_temp.dg('mt-n-0291', g, null), 'versao_atual=8');
  r2 := public.delete_goal('mt-n-0292', g, 8);
  assert (r2 #>> '{goal,version}')::int = 9 and r2 #>> '{goal,deleted_at}' is not null and r2 #>> '{goal,deleted_by}' = auth.uid()::text
     and (r2 #>> '{goal,saved_cents}')::bigint = 0 and r2 -> 'movement' = 'null'::jsonb, 'meta excluída';
  assert (select request_hash from public.record_operations where idempotency_key = 'mt-n-0292')
       = md5(format('["excluir_meta", "%s", 8]', g)), 'hash da exclusão da meta';
  assert public.delete_goal('mt-n-0292', g, 8) = r2, 'repetição da exclusão';
  assert not exists (select 1 from public.goal_items where id = g) and not exists (select 1 from public.goals where id = g)
     and not exists (select 1 from public.goal_movements where goal_id = g), 'meta e movimentos somem da leitura';
  r3 := public.create_goal('mt-n-0201', ctx, 'objetivo', 'Curso', 120000, '2027-03-01', 5000, null, null, null, 10000, '2026-10-01');
  assert (r3 #>> '{goal,id}')::uuid = g and r3 #>> '{goal,deleted_at}' is not null and r3 #>> '{movement,id}' = m0::text
     and r3 #>> '{movement,deleted_at}' is not null and (r3 #>> '{movement,version}')::int = 2, 'repetição da criação: excluídas';
  perform pg_temp.expect_code(pg_temp.am('mt-n-0293', g, 'aporte', 1, '2026-10-07'), 'nao_encontrado', 'P0002');
  perform pg_temp.expect_code(pg_temp.ug('mt-n-0294', g, 9, 'objetivo', 'Curso', 1, null, null, null, null, null), 'nao_encontrado', 'P0002');
  perform pg_temp.expect_code(pg_temp.sg('mt-n-0295', g, 9, 'ativa'), 'nao_encontrado', 'P0002');
  perform pg_temp.expect_code(pg_temp.dg('mt-n-0296', g, 9), 'nao_encontrado', 'P0002');
  perform pg_temp.expect_code(pg_temp.um('mt-n-0297', m4, 2, 1, '2026-10-07'), 'nao_encontrado', 'P0002');
  perform pg_temp.expect_code(pg_temp.dm('mt-n-0298', m5, 2), 'nao_encontrado', 'P0002');
  insert into ids values ('noel_goal', g), ('noel_m0', m0), ('noel_m1', m1), ('noel_m2', m2), ('noel_m3', m3), ('noel_m4', m4),
    ('noel_m5', m5);
end $$;
reset role;

-- Exclusão da meta: todos os movimentos ficam excluídos; os vivos ganharam versão +1 e a autoria da exclusão; os já
-- excluídos não mudaram (conferido sem a RLS).
do $$ begin
  assert (select array_agg(format('%s v%s %s', kind, version, deleted_by = pg_temp.id('noel')) order by occurred_on, kind, amount_cents)
            from public.goal_movements where goal_id = pg_temp.id('noel_goal'))
    = array['saldo_inicial v2 t', 'aporte v3 t', 'rendimento v2 t', 'valorizacao v2 t', 'aporte v2 t', 'resgate v2 t'],
    'versões dos movimentos depois de excluir a meta';
  assert not exists (select 1 from public.goal_movements where goal_id = pg_temp.id('noel_goal') and deleted_at is null), 'G4';
end $$;

-- ---------------------------------------------------------------------------
-- 4. Sequência de aceite C (Bia, montagem FICTÍCIA da demonstração; hoje 07/10/2026). Tudo pelas funções de escrita.
-- Base de outubro: Recebido 6.000,00, Pago 3.900,00, Diferença 2.100,00, Ainda a pagar 650,00, renda comprometida 52,5%.
-- ---------------------------------------------------------------------------
set role authenticated;
do $$
declare
  ctx uuid := pg_temp.id('bia_ctx');
  acc uuid := pg_temp.id('bia_acc');
  res jsonb;
  rid uuid;
  d bigint;
begin
  perform pg_temp.as_('bia');
  perform public.create_record('mt-b-0001', ctx, acc, 'receita', 600000, '2026-09-01', 'Salário', 'Salário');
  perform public.create_record('mt-b-0002', ctx, acc, 'despesa', 250000, '2026-09-05', 'Aluguel', 'Moradia');
  perform public.create_record('mt-b-0003', ctx, acc, 'despesa', 125000, '2026-09-12', 'Mercado', 'Mercado');
  perform public.create_record('mt-b-0004', ctx, acc, 'receita', 600000, '2026-10-01', 'Salário', 'Salário');
  perform public.create_record('mt-b-0005', ctx, acc, 'despesa', 140000, '2026-10-06', 'Mercado', 'Mercado');
  res := public.create_series('mt-b-0006', ctx, 'mensal', 'conta', 'Aluguel', 'Moradia', 250000, 'fixo', 5, '2026-10-01', 1, null, null);
  insert into ids values ('aluguel', (res #>> '{series,id}')::uuid);
  perform pg_temp.pay('mt-b-0007', pg_temp.occ('aluguel', 1), acc, 250000, '2026-10-05');
  perform public.create_series('mt-b-0008', ctx, 'mensal', 'conta', 'Luz', 'Moradia', 18000, 'variavel', 12, '2026-11-01', 1, null, null);
  perform public.create_series('mt-b-0009', ctx, 'parcelada', 'financiamento', 'Financiamento do carro', 'Transporte', 85000, 'fixo', 10,
                               '2026-11-01', 13, 48, null);
  perform public.create_series('mt-b-0010', ctx, 'anual', 'conta', 'IPVA', 'Transporte', 240000, 'variavel', 20, '2027-01-01', 1, null,
                               null, 1);
  perform public.create_series('mt-b-0011', ctx, 'anual', 'conta', 'IPTU', 'Moradia', 18000, 'variavel', 10, '2027-02-01', 1, null,
                               null, 10);
  perform public.create_commitment('mt-b-0012', ctx, 15000, '2026-10-15', 'Internet', 'Moradia');
  perform public.create_commitment('mt-b-0013', ctx, 50000, '2026-10-20', 'Condomínio', 'Moradia');
  perform public.create_commitment('mt-b-0014', ctx, 30000, '2026-11-10', 'Seguro do carro', 'Transporte');
  perform public.set_income_reference('mt-b-0015', ctx, '2026-09-01', 0, 600000, false);
  assert pg_temp.sync('bia_ctx') = '{"created": 0, "created_overdue": 0}'::jsonb, 'nada a gerar';
  assert pg_temp.totals('bia_ctx', '2026-10-01') = '{600000,390000,210000}' and pg_temp.to_pay('bia_ctx', '2026-10-01') = '{65000,0,65000,2}',
    'base de outubro da demonstração';
  assert (select (committed_cents, committed_permille, outside_cents) from public.month_committed(ctx, '2026-10-01'))
       = (315000::bigint, 525::bigint, 285000::bigint), 'renda comprometida de outubro: 52,5%, fora dos compromissos 2.850,00';
  insert into snap values ('bia_ctx', pg_temp.money('bia_ctx'));
  insert into snap values ('fc', pg_temp.fc());
  -- Gastos essenciais (P-017): entre os 6 meses fechados anteriores, só setembro tem gastos; Moradia 2.500,00 + Mercado
  -- 1.250,00 = 3.750,00 (a base é sugestão do core; o banco guarda a confirmada e a origem).
  assert (select sum(amount_cents) from public.financial_records
           where context_id = ctx and kind = 'despesa' and occurred_on >= '2026-09-01' and occurred_on < '2026-10-01'
             and category in ('Moradia', 'Mercado', 'Transporte', 'Saúde', 'Educação')) = 375000, 'essenciais de setembro';

  -- Passo 1: reserva com essenciais 3.750,00 e 6 meses → alvo 22.500,00; já guardado 3.000,00 em 01/10.
  res := public.create_goal('mt-b-0101', ctx, 'emergencia', 'Reserva para imprevistos', null, null, null, 375000, 6, 'media_gastos',
                            300000, '2026-10-01');
  rid := (res #>> '{goal,id}')::uuid;
  insert into ids values ('reserva', rid);
  assert res #>> '{goal,goal_type}' = 'emergencia' and (res #>> '{goal,essential_base_cents}')::bigint = 375000
     and (res #>> '{goal,essential_months}')::int = 6 and res #>> '{goal,essential_base_source}' = 'media_gastos', 'reserva criada';
  perform pg_temp.expect_goal(rid,
    'alvo 2250000 guardado 300000 | ini 300000 apo 0 res 0 ren 0 val 0 desv 0 | ativa v1 | ult 2026-10-01', 'passo 1');
  assert pg_temp.pct(rid) = 13 and pg_temp.cov(rid) = 8, 'passo 1: 13% e 0,8 mês';
  perform pg_temp.check_links();
  perform pg_temp.same_money('bia_ctx', 'passo 1');

  -- Passo 2: aporte de 1.500,00 em 06/10.
  res := public.add_goal_movement('mt-b-0102', rid, 'aporte', 150000, '2026-10-06');
  perform pg_temp.expect_goal(rid,
    'alvo 2250000 guardado 450000 | ini 300000 apo 150000 res 0 ren 0 val 0 desv 0 | ativa v1 | ult 2026-10-06', 'passo 2');
  assert pg_temp.pct(rid) = 20 and pg_temp.cov(rid) = 12, 'passo 2: 20% e 1,2 mês';
  -- Com 4.500,00 (P0 = novembro, houve aporte em outubro): até dezembro de 2027, n = 14 → 1.285,72 por mês; com plano de
  -- 1.000,00, 18 aportes → abril de 2028 (contas do core, conferidas sobre os valores lidos de goal_items).
  assert (select (target_cents - saved_cents + 13) / 14 from public.goal_items where id = rid) = 128572, 'R$ 1.285,72 por mês';
  assert (select (date '2026-11-01' + make_interval(months => ((target_cents - saved_cents + 99999) / 100000)::int - 1))::date
            from public.goal_items where id = rid) = '2028-04-01', 'abril de 2028 com 1.000,00 por mês';
  perform pg_temp.check_links();
  perform pg_temp.same_money('bia_ctx', 'passo 2');

  -- Passo 3: resgate de 3.500,00 com data 02/10: em 02/10 ficaria -500,00. Recusado, com a data no detalhe.
  perform pg_temp.expect_neg(pg_temp.am('mt-b-0103', rid, 'resgate', 350000, '2026-10-02'), '2026-10-02');
  assert not exists (select 1 from public.record_operations where idempotency_key = 'mt-b-0103'), 'recusa não grava operação';
  perform pg_temp.expect_goal(rid,
    'alvo 2250000 guardado 450000 | ini 300000 apo 150000 res 0 ren 0 val 0 desv 0 | ativa v1 | ult 2026-10-06', 'passo 3');
  perform pg_temp.same_money('bia_ctx', 'passo 3');

  -- Passo 4: resgate de 500,00 em 07/10.
  res := public.add_goal_movement('mt-b-0104', rid, 'resgate', 50000, '2026-10-07');
  perform pg_temp.expect_goal(rid,
    'alvo 2250000 guardado 400000 | ini 300000 apo 150000 res 50000 ren 0 val 0 desv 0 | ativa v1 | ult 2026-10-07', 'passo 4');
  assert pg_temp.pct(rid) = 17 and pg_temp.cov(rid) = 10, 'passo 4: 17% e 1,0 mês';
  perform pg_temp.check_links();
  perform pg_temp.same_money('bia_ctx', 'passo 4');

  -- Passo 5: "Atualizar valor guardado" para 4.037,20: diferença + 37,20, registrada como valorização.
  d := 403720 - (select saved_cents from public.goal_items where id = rid);
  assert d = 3720, 'diferença de 37,20';
  res := public.add_goal_movement('mt-b-0105', rid, 'valorizacao', d, '2026-10-07');
  perform pg_temp.expect_goal(rid,
    'alvo 2250000 guardado 403720 | ini 300000 apo 150000 res 50000 ren 0 val 3720 desv 0 | ativa v1 | ult 2026-10-07', 'passo 5');
  assert pg_temp.pct(rid) = 17 and pg_temp.cov(rid) = 10, 'passo 5: 17% e 1,0 mês';
  assert (select (target_cents - saved_cents + 13) / 14 from public.goal_items where id = rid) = 131878, 'R$ 1.318,78 por mês';
  perform pg_temp.check_links();
  perform pg_temp.same_money('bia_ctx', 'passo 5');

  -- Passo 6: resgate de 4.100,00 em 07/10: ficaria -62,80. Recusado.
  perform pg_temp.expect_neg(pg_temp.am('mt-b-0106', rid, 'resgate', 410000, '2026-10-07'), '2026-10-07');
  perform pg_temp.expect_goal(rid,
    'alvo 2250000 guardado 403720 | ini 300000 apo 150000 res 50000 ren 0 val 3720 desv 0 | ativa v1 | ult 2026-10-07', 'passo 6');

  -- Guardado em outubro (aportes menos resgates; sem o já guardado ao criar e a valorização): 1.000,00.
  assert (select sum(case kind when 'aporte' then amount_cents when 'resgate' then -amount_cents else 0 end)
            from public.goal_movements where goal_id = rid and occurred_on >= '2026-10-01' and occurred_on < '2026-11-01') = 100000,
    'guardado em outubro: 1.000,00';
  assert pg_temp.gver(rid) = 1, 'movimentos não sobem a versão da reserva';
  perform pg_temp.check_links();
  perform pg_temp.same_money('bia_ctx', 'fim da sequência C');
end $$;

-- ---------------------------------------------------------------------------
-- 5. Saldo diário (G1): resgate retroativo recusado mesmo com o guardado atual suficiente; alterar ou excluir um
-- movimento também é conferido dia a dia; só o fim de cada dia conta (Bia, hoje 07/10/2026).
-- ---------------------------------------------------------------------------
do $$
declare
  ctx uuid := pg_temp.id('bia_ctx');
  res jsonb;
  vid uuid;
  m_ini uuid;
  m_ap uuid;
  m_rs uuid;
  m_z uuid;
  bid uuid;
begin
  perform pg_temp.as_('bia');
  res := public.create_goal('mt-b-0201', ctx, 'objetivo', 'Viagem', 600000, '2027-07-01', 48000, null, null, null, 120000, '2026-10-01');
  vid := (res #>> '{goal,id}')::uuid;
  m_ini := (res #>> '{movement,id}')::uuid;
  insert into ids values ('viagem', vid), ('viagem_ini', m_ini);
  m_ap := (public.add_goal_movement('mt-b-0202', vid, 'aporte', 100000, '2026-10-05') #>> '{movement,id}')::uuid;
  insert into ids values ('viagem_ap', m_ap);
  -- Guardado hoje 2.200,00 ≥ 1.500,00, mas em 03/10 ficaria -300,00.
  perform pg_temp.expect_neg(pg_temp.am('mt-b-0203', vid, 'resgate', 150000, '2026-10-03'), '2026-10-03');
  -- No mesmo dia do aporte: fim do dia 05/10 com 700,00.
  m_rs := (public.add_goal_movement('mt-b-0204', vid, 'resgate', 150000, '2026-10-05') #>> '{movement,id}')::uuid;
  perform pg_temp.expect_goal(vid,
    'alvo 600000 guardado 70000 | ini 120000 apo 100000 res 150000 ren 0 val 0 desv 0 | ativa v1 | ult 2026-10-05', 'resgate no dia');
  -- Alterar: aporte para depois do resgate, aporte menor, resgate para antes do aporte.
  perform pg_temp.expect_neg(pg_temp.um('mt-b-0205', m_ap, 1, 100000, '2026-10-06'), '2026-10-05');
  perform pg_temp.expect_neg(pg_temp.um('mt-b-0206', m_ap, 1, 20000, '2026-10-05'), '2026-10-05');
  perform pg_temp.expect_neg(pg_temp.um('mt-b-0207', m_rs, 1, 150000, '2026-10-02'), '2026-10-02');
  perform pg_temp.expect_neg(pg_temp.um('mt-b-0208', m_rs, 1, 220001, '2026-10-05'), '2026-10-05');
  -- Excluir: o aporte ou o já guardado ao criar deixariam 05/10 negativo.
  perform pg_temp.expect_neg(pg_temp.dm('mt-b-0209', m_ap, 1), '2026-10-05');
  perform pg_temp.expect_neg(pg_temp.dm('mt-b-0210', m_ini, 1), '2026-10-05');
  -- Desvalorização maior que o guardado.
  perform pg_temp.expect_neg(pg_temp.am('mt-b-0211', vid, 'desvalorizacao', 70001, '2026-10-07'), '2026-10-07');
  assert not exists (select 1 from public.record_operations where idempotency_key between 'mt-b-0203' and 'mt-b-0211'
                        and idempotency_key <> 'mt-b-0204'), 'recusas não gravam operação';
  assert pg_temp.mver(m_ap) = 1 and pg_temp.mver(m_rs) = 1 and pg_temp.mver(m_ini) = 1, 'recusas não mudam versões';
  -- Até zero é aceito; desfazer o resgate também.
  m_z := (public.add_goal_movement('mt-b-0212', vid, 'desvalorizacao', 70000, '2026-10-07') #>> '{movement,id}')::uuid;
  assert (select saved_cents from public.goal_items where id = vid) = 0, 'guardado zero é aceito';
  perform public.delete_goal_movement('mt-b-0213', m_z, 1);
  -- Alterar o resgate para um valor que cabe: aceito.
  res := public.update_goal_movement('mt-b-0214', m_rs, 1, 220000, '2026-10-05', 'Passagens');
  assert (res #>> '{goal,saved_cents}')::bigint = 0 and res #>> '{movement,note}' = 'Passagens', 'resgate até zero no dia';
  res := public.update_goal_movement('mt-b-0215', m_rs, 2, 150000, '2026-10-05', 'Passagens');
  perform pg_temp.expect_goal(vid,
    'alvo 600000 guardado 70000 | ini 120000 apo 100000 res 150000 ren 0 val 0 desv 0 | ativa v1 | ult 2026-10-05', 'de volta');

  -- Só o fim do dia conta: sem nada guardado, o resgate é recusado; depois de um aporte no mesmo dia, aceito.
  res := public.create_goal('mt-b-0220', ctx, 'objetivo', 'Bicicleta', 200000, null, null, null, null, null, null, null);
  bid := (res #>> '{goal,id}')::uuid;
  perform pg_temp.expect_neg(pg_temp.am('mt-b-0221', bid, 'resgate', 100, '2026-10-07'), '2026-10-07');
  perform public.add_goal_movement('mt-b-0222', bid, 'aporte', 100, '2026-10-07');
  perform public.add_goal_movement('mt-b-0223', bid, 'resgate', 100, '2026-10-07');
  perform pg_temp.expect_goal(bid, 'alvo 200000 guardado 0 | ini 0 apo 100 res 100 ren 0 val 0 desv 0 | ativa v1 | ult 2026-10-07',
    'fim do dia em zero');
  insert into ids values ('bicicleta', bid);
  perform pg_temp.check_links();
  perform pg_temp.same_money('bia_ctx', 'saldo diário');
end $$;
reset role;

-- G1, G2, G4 por escrita direta do backend (sem as funções): o gatilho adiado recusa no fim da transação.
do $$
declare
  vid uuid := pg_temp.id('viagem');
  bia uuid := pg_temp.id('bia');
  ctx uuid := pg_temp.id('bia_ctx');
begin
  perform pg_temp.expect_deferred(format($f$insert into public.goal_movements (goal_id, context_id, kind, amount_cents, occurred_on,
    created_by) values (%L, %L, 'resgate', 500000, '2026-10-02', %L)$f$, vid, ctx, bia), 'saldo_da_meta_insuficiente', 'PT409',
    'dia=2026-10-02');
  perform pg_temp.expect_deferred(format('delete from public.goal_movements where id = %L', pg_temp.id('viagem_ap')),
    'saldo_da_meta_insuficiente', 'PT409', 'dia=2026-10-05');
  perform pg_temp.expect_deferred(format('update public.goal_movements set amount_cents = 1, version = version + 1 where id = %L',
    pg_temp.id('viagem_ap')), 'saldo_da_meta_insuficiente', 'PT409', 'dia=2026-10-05');
  perform pg_temp.expect_deferred(format('update public.goal_movements set occurred_on = %L, version = version + 1 where id = %L',
    '2026-10-06', pg_temp.id('viagem_ap')), 'saldo_da_meta_insuficiente', 'PT409', 'dia=2026-10-05');
  -- G4: meta excluída com movimento vivo.
  perform pg_temp.expect_deferred(format('update public.goals set deleted_at = now(), deleted_by = %L, version = version + 1 where id = %L',
    bia, vid), 'meta_inconsistente', '23514');
  perform pg_temp.expect_deferred(format($f$insert into public.goal_movements (goal_id, context_id, kind, amount_cents, occurred_on,
    created_by) values (%L, %L, 'aporte', 1, '2026-10-07', %L)$f$, pg_temp.id('noel_goal'), pg_temp.id('noel_ctx'), pg_temp.id('noel')),
    'meta_inconsistente', '23514');
  -- G2: movimento em outro contexto que o da meta (FK composta, imediata).
  perform pg_temp.expect_error(format($f$insert into public.goal_movements (goal_id, context_id, kind, amount_cents, occurred_on,
    created_by) values (%L, %L, 'aporte', 1, '2026-10-07', %L)$f$, vid, pg_temp.id('fam'), bia), '%goal_movements_goal_fk%');
  -- Escritas coerentes passam (e são desfeitas): aporte direto; meta apagada fisicamente leva os movimentos.
  begin
    insert into public.goal_movements (goal_id, context_id, kind, amount_cents, occurred_on, created_by)
    values (vid, ctx, 'aporte', 1, '2026-10-07', bia);
    delete from public.goals where id = pg_temp.id('bicicleta');
    set constraints all immediate;
    assert not exists (select 1 from public.goal_movements where goal_id = pg_temp.id('bicicleta')), 'cascata física';
    raise exception 'desfazer';
  exception when raise_exception then
    assert sqlerrm = 'desfazer', sqlerrm;
  end;
  set constraints all deferred;
  assert (select count(*) from public.goal_movements where goal_id = pg_temp.id('bicicleta')) = 2, 'desfeito';
end $$;

-- ---------------------------------------------------------------------------
-- 6. Uma reserva não arquivada por contexto (G6), inclusive ao reativar; meta arquivada não recebe movimento (G5).
-- ---------------------------------------------------------------------------
set role authenticated;
do $$
declare
  ctx uuid := pg_temp.id('bia_ctx');
  rid uuid := pg_temp.id('reserva');
  vid uuid := pg_temp.id('viagem');
  res jsonb;
  r2id uuid;
  fid uuid;
  mov uuid;
begin
  perform pg_temp.as_('bia');
  perform pg_temp.expect_code(pg_temp.cg('mt-b-0301', ctx, 'emergencia', 'Outra reserva', null, null, null, 100000, 3, 'informado',
    null, null), 'reserva_ja_existe', 'PT409');
  assert not exists (select 1 from public.record_operations where idempotency_key = 'mt-b-0301'), 'recusa não gasta a chave';
  -- A validação vem antes.
  perform pg_temp.expect_code(pg_temp.cg('mt-b-0302', ctx, 'emergencia', 'Outra reserva', null, null, null, 100000, 0, 'informado',
    null, null), 'meses_invalidos', '22023');
  -- Virar reserva com outra ativa: recusado.
  perform pg_temp.expect_code(pg_temp.ug('mt-b-0303', vid, 1, 'emergencia', 'Viagem', null, '2027-07-01', 48000, 100000, 6, 'informado'),
    'reserva_ja_existe', 'PT409');
  -- A própria reserva continua editável (base, meses, plano).
  res := public.update_goal('mt-b-0304', rid, 1, 'emergencia', 'Reserva para imprevistos', null, null, 50000, 375000, 6, 'media_gastos');
  assert (res #>> '{goal,version}')::int = 2 and (res #>> '{goal,planned_monthly_cents}')::bigint = 50000, 'reserva editável';

  -- Arquivar a reserva: não recebe, não altera e não exclui movimentos; continua editável.
  res := public.set_goal_status('mt-b-0305', rid, 2, 'arquivada');
  assert res #>> '{goal,status}' = 'arquivada' and (res #>> '{goal,version}')::int = 3, 'arquivada';
  mov := (select id from public.goal_movements where goal_id = rid and kind = 'aporte');
  perform pg_temp.expect_code(pg_temp.am('mt-b-0306', rid, 'aporte', 100, '2026-10-07'), 'meta_arquivada', 'PT409');
  perform pg_temp.expect_code(pg_temp.am('mt-b-0307', rid, 'x', 0, null), 'meta_arquivada', 'PT409');
  perform pg_temp.expect_code(pg_temp.um('mt-b-0308', mov, 1, 100, '2026-10-07'), 'meta_arquivada', 'PT409');
  perform pg_temp.expect_stale(pg_temp.um('mt-b-0309', mov, 9, 100, '2026-10-07'), 'versao_atual=1');
  perform pg_temp.expect_code(pg_temp.dm('mt-b-0310', mov, 1), 'meta_arquivada', 'PT409');
  res := public.update_goal('mt-b-0311', rid, 3, 'emergencia', 'Reserva antiga', null, null, 50000, 375000, 6, 'media_gastos');
  assert res #>> '{goal,name}' = 'Reserva antiga' and (res #>> '{goal,version}')::int = 4 and res #>> '{goal,status}' = 'arquivada',
    'arquivada continua editável';
  perform pg_temp.expect_goal(rid,
    'alvo 2250000 guardado 403720 | ini 300000 apo 150000 res 50000 ren 0 val 3720 desv 0 | arquivada v4 | ult 2026-10-07',
    'arquivada mantém o guardado');

  -- Com a antiga arquivada, uma reserva nova é aceita; reativar ou concluir a antiga, não.
  res := public.create_goal('mt-b-0312', ctx, 'emergencia', 'Reserva nova', null, null, null, 375000, 3, 'informado', null, null);
  r2id := (res #>> '{goal,id}')::uuid;
  assert (res #>> '{goal,target_cents}')::bigint = 1125000, 'reserva nova: 3 × 3.750,00';
  perform pg_temp.expect_code(pg_temp.sg('mt-b-0313', rid, 4, 'ativa'), 'reserva_ja_existe', 'PT409');
  perform pg_temp.expect_code(pg_temp.sg('mt-b-0314', rid, 4, 'concluida'), 'reserva_ja_existe', 'PT409');
  perform pg_temp.expect_stale(pg_temp.sg('mt-b-0315', rid, 3, 'ativa'), 'versao_atual=4');
  -- Editar a arquivada continua possível com outra ativa.
  res := public.update_goal('mt-b-0316', rid, 4, 'emergencia', 'Reserva antiga', null, null, 40000, 375000, 6, 'media_gastos');
  assert (res #>> '{goal,version}')::int = 5, 'arquivada editável com outra ativa';
  perform pg_temp.expect_code(pg_temp.ug('mt-b-0317', vid, 1, 'emergencia', 'Viagem', null, '2027-07-01', 48000, 100000, 6, 'informado'),
    'reserva_ja_existe', 'PT409');
  -- Concluída também ocupa a vaga.
  res := public.set_goal_status('mt-b-0318', r2id, 1, 'concluida');
  perform pg_temp.expect_code(pg_temp.sg('mt-b-0319', rid, 5, 'ativa'), 'reserva_ja_existe', 'PT409');
  perform pg_temp.expect_code(pg_temp.cg('mt-b-0320', ctx, 'emergencia', 'Mais uma', null, null, null, 1000, 1, 'informado', null, null),
    'reserva_ja_existe', 'PT409');
  -- Excluída libera: reativar a antiga.
  perform public.delete_goal('mt-b-0321', r2id, 2);
  res := public.set_goal_status('mt-b-0322', rid, 5, 'ativa');
  assert res #>> '{goal,status}' = 'ativa' and (res #>> '{goal,version}')::int = 6, 'reativada depois de excluir a outra';
  res := public.add_goal_movement('mt-b-0323', rid, 'rendimento', 1280, '2026-10-07', 'Extrato de outubro');
  perform pg_temp.expect_goal(rid,
    'alvo 2250000 guardado 405000 | ini 300000 apo 150000 res 50000 ren 1280 val 3720 desv 0 | ativa v6 | ult 2026-10-07',
    'reativada recebe movimento');
  -- Arquivar e reativar sem outra reserva.
  res := public.set_goal_status('mt-b-0324', rid, 6, 'arquivada');
  res := public.set_goal_status('mt-b-0325', rid, 7, 'ativa');
  assert (res #>> '{goal,version}')::int = 8, 'arquivar e reativar';

  -- Cada contexto tem a sua: a Família pode ter uma reserva.
  res := public.create_goal('mt-b-0326', pg_temp.id('fam'), 'emergencia', 'Reserva da casa', null, null, null, 500000, 3, 'informado',
                            100000, '2026-10-01');
  fid := (res #>> '{goal,id}')::uuid;
  insert into ids values ('fam_reserva', fid);
  -- Meta arquivada para a escrita direta de G5 (seção seguinte).
  res := public.create_goal('mt-b-0327', ctx, 'objetivo', 'Antiga', 1000, null, null, null, null, null, null, null);
  insert into ids values ('antiga', (res #>> '{goal,id}')::uuid);
  perform public.set_goal_status('mt-b-0328', (res #>> '{goal,id}')::uuid, 1, 'arquivada');
  perform pg_temp.check_links();
  perform pg_temp.same_money('bia_ctx', 'uma reserva por contexto');
end $$;
reset role;

-- G5 e G6 por escrita direta do backend.
do $$ begin
  perform pg_temp.expect_deferred(format($f$insert into public.goal_movements (goal_id, context_id, kind, amount_cents, occurred_on,
    created_by) values (%L, %L, 'aporte', 1, '2026-10-07', %L)$f$, pg_temp.id('antiga'), pg_temp.id('bia_ctx'), pg_temp.id('bia')),
    'meta_inconsistente', '23514');
  perform pg_temp.expect_error(format($f$insert into public.goals (context_id, goal_type, name, target_cents, essential_base_cents,
    essential_months, essential_base_source, created_by) values (%L, 'emergencia', 'Dupla', 1000, 1000, 1, 'informado', %L)$f$,
    pg_temp.id('bia_ctx'), pg_temp.id('bia')), '%goals_one_emergency%');
  -- Arquivada não bloqueia: uma reserva arquivada direta ao lado da ativa é aceita (e desfeita).
  begin
    insert into public.goals (context_id, goal_type, name, target_cents, essential_base_cents, essential_months, essential_base_source,
                              status, created_by)
    values (pg_temp.id('bia_ctx'), 'emergencia', 'Arquivada', 1000, 1000, 1, 'informado', 'arquivada', pg_temp.id('bia'));
    raise exception 'desfazer';
  exception when raise_exception then
    assert sqlerrm = 'desfazer', sqlerrm;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 7. Excluir meta: os movimentos vivos saem junto (G4); nada pode ser feito depois (Bia).
-- ---------------------------------------------------------------------------
create temp table before_delete as
  select id, version from public.goal_movements where goal_id = (select id from ids where name = 'viagem') and deleted_at is null;
set role authenticated;
do $$
declare
  vid uuid := pg_temp.id('viagem');
  res jsonb;
  n int;
begin
  perform pg_temp.as_('bia');
  n := (select count(*) from public.goal_movements where goal_id = vid);
  assert n = 3, 'Viagem com 3 movimentos vivos';
  res := public.delete_goal('mt-b-0401', vid, 1);
  assert res #>> '{goal,deleted_at}' is not null and res #>> '{goal,deleted_by}' = auth.uid()::text
     and (res #>> '{goal,version}')::int = 2 and (res #>> '{goal,saved_cents}')::bigint = 0 and res #>> '{goal,status}' = 'ativa',
    'Viagem excluída';
  assert public.delete_goal('mt-b-0401', vid, 1) = res, 'repetição';
  assert not exists (select 1 from public.goal_items where id = vid) and not exists (select 1 from public.goal_movements where goal_id = vid),
    'meta e movimentos somem';
  perform pg_temp.expect_code(pg_temp.am('mt-b-0402', vid, 'aporte', 1, '2026-10-07'), 'nao_encontrado', 'P0002');
  perform pg_temp.expect_code(pg_temp.ug('mt-b-0403', vid, 2, 'objetivo', 'Viagem', 1, null, null, null, null, null), 'nao_encontrado', 'P0002');
  perform pg_temp.expect_code(pg_temp.sg('mt-b-0404', vid, 2, 'ativa'), 'nao_encontrado', 'P0002');
  perform pg_temp.expect_code(pg_temp.dg('mt-b-0405', vid, 2), 'nao_encontrado', 'P0002');
  perform pg_temp.expect_code(pg_temp.um('mt-b-0406', pg_temp.id('viagem_ap'), 2, 1, '2026-10-07'), 'nao_encontrado', 'P0002');
  perform pg_temp.expect_code(pg_temp.dm('mt-b-0407', pg_temp.id('viagem_ap'), 2), 'nao_encontrado', 'P0002');
  perform pg_temp.check_links();
  perform pg_temp.same_money('bia_ctx', 'exclusão da meta');
end $$;
reset role;
do $$ begin
  assert (select bool_and(m.deleted_at is not null and m.deleted_by = pg_temp.id('bia') and m.version = b.version + 1)
            from public.goal_movements m join before_delete b on b.id = m.id) and (select count(*) from before_delete) = 3,
    'cada movimento vivo excluído, com versão +1';
  assert (select count(*) from public.goal_movements where goal_id = pg_temp.id('viagem')) = 4, 'nenhuma linha apagada (3 e a já excluída)';
end $$;

-- ---------------------------------------------------------------------------
-- 8. Permissões: Família (escrita, autoria e "editar de outras pessoas"), Pessoal de outra pessoa, empresa, externo e
-- vínculo revogado. A empresa não lê nada, nem somado.
-- ---------------------------------------------------------------------------
set role authenticated;
do $$
declare
  fam uuid := pg_temp.id('fam');
  bia uuid := pg_temp.id('bia_ctx');
  rid uuid := pg_temp.id('reserva');
  rmov uuid;
  res jsonb;
  p text;
  g_iris uuid;
  g_theo uuid;
  m_theo uuid;
  m_iris uuid;
begin
  -- Iris cria; Theo registra aporte e altera a meta de Iris ("editar de outras pessoas"); a autoria fica a de Iris.
  perform pg_temp.as_('iris');
  res := public.create_goal('mt-f-0001', fam, 'objetivo', 'Viagem em família', 800000, '2027-12-01', null, null, null, null, 50000,
                            '2026-10-01');
  g_iris := (res #>> '{goal,id}')::uuid;
  insert into ids values ('g_iris', g_iris);
  perform pg_temp.as_('theo');
  res := public.add_goal_movement('mt-f-0002', g_iris, 'aporte', 20000, '2026-10-06');
  m_theo := (res #>> '{movement,id}')::uuid;
  assert res #>> '{movement,created_by}' = pg_temp.id('theo')::text, 'movimento com a autoria de Theo';
  res := public.update_goal('mt-f-0003', g_iris, 1, 'objetivo', 'Viagem da família', 800000, '2027-12-01', 30000, null, null, null);
  assert (res #>> '{goal,version}')::int = 2 and res #>> '{goal,created_by}' = pg_temp.id('iris')::text, 'Theo altera a de Iris';
  -- Iris altera a própria meta e registra na própria meta; não altera nem exclui o movimento de Theo.
  perform pg_temp.as_('iris');
  res := public.update_goal('mt-f-0004', g_iris, 2, 'objetivo', 'Viagem da família', 800000, '2027-12-01', 40000, null, null, null);
  assert (res #>> '{goal,version}')::int = 3, 'Iris altera a própria';
  m_iris := (public.add_goal_movement('mt-f-0005', g_iris, 'aporte', 10000, '2026-10-07') #>> '{movement,id}')::uuid;
  perform pg_temp.expect_code(pg_temp.um('mt-f-0006', m_theo, 1, 1, '2026-10-06'), 'sem_permissao', '42501');
  perform pg_temp.expect_code(pg_temp.dm('mt-f-0007', m_theo, 1), 'sem_permissao', '42501');
  -- Theo cria; Iris não mexe na meta de Theo (autoria antes da versão, como nas outras travas).
  perform pg_temp.as_('theo');
  g_theo := (public.create_goal('mt-f-0010', fam, 'oportunidade', 'Oportunidade', 300000, null, null, null, null, null, 10000,
                                '2026-10-02') #>> '{goal,id}')::uuid;
  perform pg_temp.as_('iris');
  perform pg_temp.expect_code(pg_temp.ug('mt-f-0011', g_theo, 1, 'oportunidade', 'Minha', 1, null, null, null, null, null),
    'sem_permissao', '42501');
  perform pg_temp.expect_code(pg_temp.ug('mt-f-0012', g_theo, 9, 'x', '', 0, null, null, null, null, null), 'sem_permissao', '42501');
  perform pg_temp.expect_code(pg_temp.sg('mt-f-0013', g_theo, 1, 'arquivada'), 'sem_permissao', '42501');
  perform pg_temp.expect_code(pg_temp.dg('mt-f-0014', g_theo, 1), 'sem_permissao', '42501');
  perform pg_temp.expect_code(pg_temp.am('mt-f-0015', g_theo, 'aporte', 1, '2026-10-07'), 'sem_permissao', '42501');
  perform pg_temp.expect_code(pg_temp.dm('mt-f-0016', (select id from public.goal_movements where goal_id = g_theo), 1),
    'sem_permissao', '42501');
  -- Iris lê tudo da Família.
  assert (select count(*) from public.goal_items where context_id = fam) = 3, 'Iris lê as 3 metas da Família';

  -- Caio só lê: lê metas e movimentos da Família; não grava nada.
  perform pg_temp.as_('caio');
  assert (select count(*) from public.goals where context_id = fam) = 3 and (select count(*) from public.goal_items where context_id = fam) = 3
     and (select count(*) from public.goal_movements where context_id = fam) = 5, 'Caio lê a Família';
  assert (select saved_cents from public.goal_items where id = g_iris) = 80000, 'Caio vê o guardado';
  perform pg_temp.expect_code(pg_temp.cg('mt-f-0020', fam, 'objetivo', 'Caio', 1, null, null, null, null, null, null, null),
    'sem_permissao', '42501');
  perform pg_temp.expect_code(pg_temp.am('mt-f-0021', g_iris, 'aporte', 1, '2026-10-07'), 'sem_permissao', '42501');
  perform pg_temp.expect_code(pg_temp.um('mt-f-0022', m_iris, 1, 1, '2026-10-07'), 'sem_permissao', '42501');
  perform pg_temp.expect_code(pg_temp.sg('mt-f-0023', g_iris, 3, 'concluida'), 'sem_permissao', '42501');

  -- Família, empresa e externo não leem o Pessoal da Bia, nem por função.
  perform pg_temp.as_('bia');
  rmov := (select id from public.goal_movements where goal_id = rid and kind = 'rendimento');
  foreach p in array array['caio', 'iris', 'theo', 'vera', 'rui'] loop
    perform pg_temp.as_(p);
    assert (select count(*) from public.goals where context_id = bia) = 0
       and (select count(*) from public.goal_movements where context_id = bia) = 0
       and (select count(*) from public.goal_items where context_id = bia) = 0, p || ' não lê as metas da Bia';
    perform pg_temp.expect_code(pg_temp.cg('mt-x-' || p, bia, 'objetivo', 'Intrusa', 1, null, null, null, null, null, null, null),
      'sem_permissao', '42501');
    perform pg_temp.expect_code(pg_temp.am('mt-y-' || p, rid, 'aporte', 1, '2026-10-07'), 'nao_encontrado', 'P0002');
    perform pg_temp.expect_code(pg_temp.ug('mt-z-' || p, rid, 8, 'emergencia', 'X', null, null, null, 1, 1, 'informado'),
      'nao_encontrado', 'P0002');
    perform pg_temp.expect_code(pg_temp.sg('mt-w-' || p, rid, 8, 'arquivada'), 'nao_encontrado', 'P0002');
    perform pg_temp.expect_code(pg_temp.dg('mt-v-' || p, rid, 8), 'nao_encontrado', 'P0002');
    perform pg_temp.expect_code(pg_temp.um('mt-u-' || p, rmov, 1, 1, '2026-10-07'), 'nao_encontrado', 'P0002');
    perform pg_temp.expect_code(pg_temp.dm('mt-t-' || p, rmov, 1), 'nao_encontrado', 'P0002');
    -- Repetição de uma chave da Bia por outra pessoa: chave por pessoa, então é uma chamada nova (sem permissão).
    perform pg_temp.expect_code(pg_temp.am('mt-b-0102', rid, 'aporte', 150000, '2026-10-06'), 'nao_encontrado', 'P0002');
  end loop;
  -- Empresa e externo também não leem a Família.
  foreach p in array array['vera', 'rui'] loop
    perform pg_temp.as_(p);
    assert (select count(*) from public.goals) = 0 and (select count(*) from public.goal_movements) = 0
       and (select count(*) from public.goal_items) = 0, p || ' não lê nenhuma meta';
    perform pg_temp.expect_code(pg_temp.cg('mt-s-' || p, fam, 'objetivo', 'Intrusa', 1, null, null, null, null, null, null, null),
      'sem_permissao', '42501');
    perform pg_temp.expect_code(pg_temp.am('mt-r-' || p, g_iris, 'aporte', 1, '2026-10-07'), 'nao_encontrado', 'P0002');
    perform pg_temp.expect_code(pg_temp.dm('mt-q-' || p, m_iris, 1), 'nao_encontrado', 'P0002');
  end loop;
end $$;

-- Vínculo revogado: Iris deixa de ler, de repetir e de registrar na própria meta da Família.
reset role;
update public.context_memberships set revoked_at = now() where context_id = (select id from ids where name = 'fam') and person_id = :iris;
set role authenticated;
do $$
declare
  fam uuid := pg_temp.id('fam');
  g_iris uuid := pg_temp.id('g_iris');
begin
  perform pg_temp.as_('iris');
  assert (select count(*) from public.goals) = 0 and (select count(*) from public.goal_movements) = 0
     and (select count(*) from public.goal_items) = 0, 'revogada não lê';
  perform pg_temp.expect_code(pg_temp.cg('mt-f-0001', fam, 'objetivo', 'Viagem em família', 800000, '2027-12-01', null, null, null, null,
    50000, '2026-10-01'), 'nao_encontrado', 'P0002');
  perform pg_temp.expect_code(pg_temp.am('mt-f-0030', g_iris, 'aporte', 1, '2026-10-07'), 'nao_encontrado', 'P0002');
  perform pg_temp.expect_code(pg_temp.cg('mt-f-0031', fam, 'objetivo', 'Outra', 1, null, null, null, null, null, null, null),
    'sem_permissao', '42501');
  -- A titular exclui a meta de Theo e o movimento de Theo na meta de Iris ("editar de outras pessoas").
  perform pg_temp.as_('bia');
  perform public.delete_goal('mt-f-0032', (select id from public.goals where context_id = fam and name = 'Oportunidade'), 1);
  perform public.delete_goal_movement('mt-f-0033', (select id from public.goal_movements where goal_id = g_iris
                                                      and created_by = pg_temp.id('theo')), 1);
  assert (select count(*) from public.goal_items where context_id = fam) = 2
     and (select saved_cents from public.goal_items where id = g_iris) = 60000, 'titular altera o que é dos outros';
  perform pg_temp.check_links();
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 9. Demonstração FICTÍCIA do Ciclo C (Bia, hoje 07/10/2026), no lugar das metas da sequência: reserva 15% e 0,9 mês,
-- viagem 20% e R$ 480,00 por mês; guardado em outubro 500,00; planejado 980,00; fora dos compromissos depois do
-- planejado 1.870,00. Os totais continuam os da base.
-- ---------------------------------------------------------------------------
set role authenticated;
do $$
declare
  ctx uuid := pg_temp.id('bia_ctx');
  res jsonb;
  g record;
  rid uuid;
  tid uuid;
begin
  perform pg_temp.as_('bia');
  for g in select id, version from public.goal_items where context_id = ctx loop
    perform public.delete_goal('mt-d-' || g.id, g.id, g.version);
  end loop;
  assert (select count(*) from public.goal_items where context_id = ctx) = 0, 'sem metas';
  res := public.create_goal('mt-d-0001', ctx, 'emergencia', 'Reserva para imprevistos', null, null, 50000, 375000, 6, 'media_gastos',
                            300000, '2026-10-01');
  rid := (res #>> '{goal,id}')::uuid;
  perform public.add_goal_movement('mt-d-0002', rid, 'aporte', 50000, '2026-10-06');
  res := public.create_goal('mt-d-0003', ctx, 'objetivo', 'Viagem de férias', 600000, '2027-07-01', 48000, null, null, null, 120000,
                            '2026-10-01');
  tid := (res #>> '{goal,id}')::uuid;
  perform pg_temp.expect_goal(rid,
    'alvo 2250000 guardado 350000 | ini 300000 apo 50000 res 0 ren 0 val 0 desv 0 | ativa v1 | ult 2026-10-06', 'reserva da demonstração');
  assert pg_temp.pct(rid) = 15 and pg_temp.cov(rid) = 9, 'reserva: 15% e 0,9 mês';
  -- Com 500,00 por mês (P0 = novembro), 38 aportes → dezembro de 2029.
  assert (select (date '2026-11-01' + make_interval(months => ((target_cents - saved_cents + planned_monthly_cents - 1)
                   / planned_monthly_cents)::int - 1))::date from public.goal_items where id = rid) = '2029-12-01', 'dezembro de 2029';
  perform pg_temp.expect_goal(tid,
    'alvo 600000 guardado 120000 | ini 120000 apo 0 res 0 ren 0 val 0 desv 0 | ativa v1 | ult 2026-10-01', 'viagem da demonstração');
  assert pg_temp.pct(tid) = 20, 'viagem: 20%';
  -- Sem aporte em outubro, P0 = outubro; até julho de 2027, n = 10 → 480,00 por mês, chega em julho de 2027.
  assert (select (target_cents - saved_cents + 9) / 10 from public.goal_items where id = tid) = 48000, 'R$ 480,00 por mês';
  assert (select sum(case m.kind when 'aporte' then m.amount_cents when 'resgate' then -m.amount_cents else 0 end)
            from public.goal_movements m where m.context_id = ctx and m.occurred_on >= '2026-10-01' and m.occurred_on < '2026-11-01') = 50000,
    'guardado em metas em outubro: 500,00';
  assert (select sum(planned_monthly_cents) from public.goal_items where context_id = ctx and status = 'ativa') = 98000,
    'planejado para metas: 980,00 por mês';
  assert (select outside_cents from public.month_committed(ctx, '2026-10-01')) - 98000 = 187000,
    'fora dos compromissos depois do planejado: 1.870,00';
  perform pg_temp.check_links();
  perform pg_temp.same_money('bia_ctx', 'demonstração');

  -- Atividade (A4, R1): registrar movimento de meta é anotação (hoje 05/01/2027, última anotação em 07/10/2026).
  assert pg_temp.act('bia', 'bia_ctx') = '2026-10-07 - -', 'última anotação em 07/10';
  perform pg_temp.today('2027-01-05');
  perform public.add_goal_movement('mt-d-0004', rid, 'aporte', 50000, '2027-01-05');
  assert pg_temp.act('bia', 'bia_ctx') = '2027-01-05 2026-10-07 2027-01-05', 'aporte conta como anotação';
  perform pg_temp.today('2026-10-07');
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 10. record_operations: as sete ações novas apontam só para o alvo (target_id); a lista vigente tem 26 ações (a 26ª,
-- responder_guardar, é testada em 65).
-- G3: nenhuma operação de metas grava registro ou conta a pagar.
-- ---------------------------------------------------------------------------
do $$
declare
  acts text[] := array['criar_meta', 'alterar_meta', 'situacao_meta', 'excluir_meta', 'registrar_movimento_meta',
                       'alterar_movimento_meta', 'excluir_movimento_meta'];
  a text;
  i int := 0;
begin
  foreach a in array acts loop
    i := i + 1;
    perform pg_temp.expect_error(format($f$insert into public.record_operations
        (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id, target_id)
      values (%L, %L, %L, %L, 'x', gen_random_uuid(), null, gen_random_uuid())$f$,
      pg_temp.id('bia'), 'mt-o-1' || lpad(i::text, 3, '0'), a, pg_temp.id('bia_ctx')), '%record_operations_target_check%');
    perform pg_temp.expect_error(format($f$insert into public.record_operations
        (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id, target_id)
      values (%L, %L, %L, %L, 'x', null, gen_random_uuid(), gen_random_uuid())$f$,
      pg_temp.id('bia'), 'mt-o-2' || lpad(i::text, 3, '0'), a, pg_temp.id('bia_ctx')), '%record_operations_target_check%');
    perform pg_temp.expect_error(format($f$insert into public.record_operations
        (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id, target_id)
      values (%L, %L, %L, %L, 'x', null, null, null)$f$,
      pg_temp.id('bia'), 'mt-o-3' || lpad(i::text, 3, '0'), a, pg_temp.id('bia_ctx')), '%record_operations_target_check%');
  end loop;
  perform pg_temp.expect_error(format($f$insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash)
    values (%L, 'mt-o-4001', 'criar_metas', gen_random_uuid(), 'x')$f$, pg_temp.id('bia')), '%record_operations_action_check%');
  assert (select array_agg(m[1] order by m[1] collate "C")
            from pg_constraint c, regexp_matches(pg_get_constraintdef(c.oid), '''([a-z_]+)''::text', 'g') m
           where c.conname = 'record_operations_action_check')
    = array['alterar_cartao', 'alterar_conta', 'alterar_lancamento_cartao', 'alterar_meta', 'alterar_movimento_meta',
            'alterar_serie', 'conta_principal', 'criar', 'criar_cartao', 'criar_compra_cartao', 'criar_compromisso',
            'criar_conta', 'criar_encargo_cartao', 'criar_estorno_cartao', 'criar_meta', 'criar_ocorrencia', 'criar_serie',
            'decidir_revisao', 'definir_limite_comprometimento', 'definir_orcamento_categoria', 'definir_renda_referencia',
            'desfazer_pagamento', 'desfazer_pagamento_fatura', 'editar', 'editar_compromisso', 'encerrar_serie', 'excluir',
            'excluir_cartao', 'excluir_compromisso', 'excluir_conta', 'excluir_lancamento_cartao',
            'excluir_limite_comprometimento', 'excluir_meta', 'excluir_movimento_meta', 'excluir_orcamento_categoria',
            'excluir_renda_referencia', 'excluir_serie', 'informar_ano', 'marcar_assinatura', 'pagar_compromisso', 'pagar_fatura',
            'registrar_movimento_meta', 'responder_guardar', 'revisar_assinaturas', 'situacao_cartao', 'situacao_conta', 'situacao_meta',
            'tirar_ano'],
    'as 48 ações vigentes (as 7 de metas, a de guardar, testada em 65, as 11 de cartões, testadas em 70, as 4 de orçamento e limite, testadas em 80, as 5 de contas, testadas em 85, e as 2 de assinaturas, testadas em 88)';
  -- Toda operação de meta aponta para uma meta do mesmo contexto (a exclusão, para uma excluída); toda operação de
  -- movimento, para um movimento do mesmo contexto (a exclusão, para um excluído).
  assert not exists (select 1 from public.record_operations o
                      where o.action in ('criar_meta', 'alterar_meta', 'situacao_meta', 'excluir_meta')
                        and not exists (select 1 from public.goals g where g.id = o.target_id and g.context_id = o.context_id
                                          and (o.action <> 'excluir_meta' or g.deleted_at is not null))),
    'operações de meta apontam para a meta';
  assert not exists (select 1 from public.record_operations o
                      where o.action in ('registrar_movimento_meta', 'alterar_movimento_meta', 'excluir_movimento_meta')
                        and not exists (select 1 from public.goal_movements m where m.id = o.target_id and m.context_id = o.context_id
                                          and (o.action <> 'registrar_movimento_meta' or m.kind <> 'saldo_inicial')
                                          and (o.action <> 'excluir_movimento_meta' or m.deleted_at is not null))),
    'operações de movimento apontam para o movimento';
  -- Uma operação por escrita: cada meta nasceu de um criar_meta; cada movimento (menos o já guardado ao criar), de um
  -- registrar_movimento_meta; cada meta excluída, de um excluir_meta; cada exclusão de movimento, um movimento.
  assert (select count(*) from public.record_operations where action = 'criar_meta') = (select count(*) from public.goals)
     and (select count(*) from public.record_operations where action = 'registrar_movimento_meta')
       = (select count(*) from public.goal_movements where kind <> 'saldo_inicial')
     and (select count(*) from public.record_operations where action = 'excluir_meta')
       = (select count(*) from public.goals where deleted_at is not null)
     and (select count(*) from public.record_operations where action = 'excluir_movimento_meta')
       = (select count(distinct target_id) from public.record_operations where action = 'excluir_movimento_meta'),
    'uma operação por escrita (repetições e recusas não gravam)';
  assert (select count(*) from public.goal_movements m where m.kind = 'saldo_inicial')
       = (select count(*) from public.goals g where exists (select 1 from public.goal_movements m where m.goal_id = g.id
                                                              and m.kind = 'saldo_inicial')), 'no máximo um já guardado ao criar';
  assert not exists (select 1 from public.record_operations
                      where action in ('criar_meta', 'alterar_meta', 'situacao_meta', 'excluir_meta', 'registrar_movimento_meta',
                                       'alterar_movimento_meta', 'excluir_movimento_meta')
                        and (record_id is not null or commitment_id is not null)), 'G3: sem registro nem conta a pagar';
  -- R1 (A4): toda operação de metas é anotação de quem a fez no contexto.
  assert not exists (select 1 from public.record_operations o
                      where o.action like '%meta' and not exists (select 1 from public.context_activity a
                                                                    where a.person_id = o.actor_id and a.context_id = o.context_id)),
    'atividade de toda operação de metas';
end $$;

-- ---------------------------------------------------------------------------
-- 11. Guardas e restrições das tabelas (escrita direta do backend; cada caso desfeito no próprio bloco).
-- ---------------------------------------------------------------------------
do $$
declare
  rid uuid := pg_temp.id('fam_reserva');
  fam uuid := pg_temp.id('fam');
  dead uuid := pg_temp.id('viagem');
  mov uuid := (select id from public.goal_movements where goal_id = (select id from ids where name = 'fam_reserva'));
  dmov uuid := pg_temp.id('viagem_ap');
  ctx uuid := pg_temp.id('bia_ctx');
  bia uuid := pg_temp.id('bia');
begin
  -- goals: identidade, contexto, autoria e criação imutáveis; versão exatamente +1; excluída não muda nem volta.
  perform pg_temp.expect_error(format('update public.goals set context_id = %L, version = version + 1 where id = %L',
    ctx, rid), 'campo_imutavel');
  perform pg_temp.expect_error(format('update public.goals set created_by = %L, version = version + 1 where id = %L',
    pg_temp.id('caio'), rid), 'campo_imutavel');
  perform pg_temp.expect_error(format($f$update public.goals set created_at = created_at - interval '1 day', version = version + 1
    where id = %L$f$, rid), 'campo_imutavel');
  perform pg_temp.expect_error(format('update public.goals set id = gen_random_uuid(), version = version + 1 where id = %L', rid),
    'campo_imutavel');
  perform pg_temp.expect_error(format($f$update public.goals set name = 'X' where id = %L$f$, rid), 'campo_imutavel');
  perform pg_temp.expect_error(format('update public.goals set version = version + 2 where id = %L', rid), 'campo_imutavel');
  perform pg_temp.expect_error(format($f$update public.goals set name = 'X', version = version + 1 where id = %L$f$, dead),
    'campo_imutavel');
  perform pg_temp.expect_error(format('update public.goals set deleted_at = null, deleted_by = null, version = version + 1 where id = %L',
    dead), 'campo_imutavel');
  -- goal_movements: também o tipo e a meta.
  perform pg_temp.expect_error(format($f$update public.goal_movements set kind = 'aporte', version = version + 1 where id = %L$f$, mov),
    'campo_imutavel');
  perform pg_temp.expect_error(format('update public.goal_movements set goal_id = %L, version = version + 1 where id = %L',
    pg_temp.id('g_iris'), mov), 'campo_imutavel');
  perform pg_temp.expect_error(format('update public.goal_movements set context_id = %L, version = version + 1 where id = %L', ctx, mov),
    'campo_imutavel');
  perform pg_temp.expect_error(format('update public.goal_movements set created_by = %L, version = version + 1 where id = %L',
    pg_temp.id('caio'), mov), 'campo_imutavel');
  perform pg_temp.expect_error(format($f$update public.goal_movements set created_at = created_at - interval '1 day',
    version = version + 1 where id = %L$f$, mov), 'campo_imutavel');
  perform pg_temp.expect_error(format('update public.goal_movements set amount_cents = 2 where id = %L', mov), 'campo_imutavel');
  perform pg_temp.expect_error(format('update public.goal_movements set amount_cents = 2, version = version + 1 where id = %L', dmov),
    'campo_imutavel');
  -- Escritas válidas passam pelas guardas (e são desfeitas).
  begin
    update public.goals set name = 'Reserva', version = version + 1 where id = rid;
    update public.goal_movements set amount_cents = 100001, version = version + 1 where id = mov;
    assert (select (name, version) from public.goals where id = rid) = ('Reserva'::text, 2)
       and (select (amount_cents, version) from public.goal_movements where id = mov) = (100001::bigint, 2), 'guardas aceitam +1';
    raise exception 'desfazer';
  exception when raise_exception then
    assert sqlerrm = 'desfazer', sqlerrm;
  end;
  assert (select (name, version) from public.goals where id = rid) = ('Reserva da casa'::text, 1), 'desfeito';

  -- Restrições de goals.
  perform pg_temp.expect_error(format($f$insert into public.goals (context_id, goal_type, name, target_cents, created_by)
    values (%L, 'emergencia', 'Sem base', 1000, %L)$f$, pg_temp.id('noel_ctx'), bia), '%goals_reserva%');
  perform pg_temp.expect_error(format($f$insert into public.goals (context_id, goal_type, name, target_cents, essential_base_cents,
    essential_months, essential_base_source, created_by) values (%L, 'emergencia', 'Alvo errado', 1001, 1000, 1, 'informado', %L)$f$,
    pg_temp.id('noel_ctx'), bia), '%goals_reserva%');
  perform pg_temp.expect_error(format($f$insert into public.goals (context_id, goal_type, name, target_cents, essential_base_cents,
    created_by) values (%L, 'objetivo', 'Com base', 1000, 1000, %L)$f$, ctx, bia), '%goals_reserva%');
  perform pg_temp.expect_error(format($f$insert into public.goals (context_id, goal_type, name, target_cents, essential_months,
    created_by) values (%L, 'oportunidade', 'Com meses', 1000, 3, %L)$f$, ctx, bia), '%goals_reserva%');
  perform pg_temp.expect_error(format($f$insert into public.goals (context_id, goal_type, name, target_cents, created_by)
    values (%L, 'sonho', 'Tipo', 1000, %L)$f$, ctx, bia), '%goals_goal_type_check%');
  perform pg_temp.expect_error(format($f$insert into public.goals (context_id, goal_type, name, target_cents, created_by)
    values (%L, 'objetivo', ' Nome', 1000, %L)$f$, ctx, bia), '%goals_name_check%');
  perform pg_temp.expect_error(format($f$insert into public.goals (context_id, goal_type, name, target_cents, created_by)
    values (%L, 'objetivo', %L, 1000, %L)$f$, ctx, repeat('a', 41), bia), '%goals_name_check%');
  perform pg_temp.expect_error(format($f$insert into public.goals (context_id, goal_type, name, target_cents, created_by)
    values (%L, 'objetivo', 'Zero', 0, %L)$f$, ctx, bia), '%goals_target_cents_check%');
  perform pg_temp.expect_error(format($f$insert into public.goals (context_id, goal_type, name, target_cents, target_month, created_by)
    values (%L, 'objetivo', 'Dia', 1000, '2027-01-15', %L)$f$, ctx, bia), '%goals_target_month_check%');
  perform pg_temp.expect_error(format($f$insert into public.goals (context_id, goal_type, name, target_cents, planned_monthly_cents,
    created_by) values (%L, 'objetivo', 'Plano', 1000, 0, %L)$f$, ctx, bia), '%goals_planned_monthly_cents_check%');
  perform pg_temp.expect_error(format($f$insert into public.goals (context_id, goal_type, name, target_cents, essential_base_cents,
    essential_months, essential_base_source, created_by) values (%L, 'emergencia', 'Meses', 25000, 1000, 25, 'informado', %L)$f$,
    pg_temp.id('noel_ctx'), bia), '%goals_essential_months_check%');
  perform pg_temp.expect_error(format($f$insert into public.goals (context_id, goal_type, name, target_cents, essential_base_cents,
    essential_months, essential_base_source, created_by) values (%L, 'emergencia', 'Origem', 1000, 1000, 1, 'chute', %L)$f$,
    pg_temp.id('noel_ctx'), bia), '%goals_essential_base_source_check%');
  perform pg_temp.expect_error(format($f$insert into public.goals (context_id, goal_type, name, target_cents, status, created_by)
    values (%L, 'objetivo', 'Situação', 1000, 'pausada', %L)$f$, ctx, bia), '%goals_status_check%');
  perform pg_temp.expect_error(format($f$insert into public.goals (context_id, goal_type, name, target_cents, created_by, deleted_at)
    values (%L, 'objetivo', 'Exclusão', 1000, %L, now())$f$, ctx, bia), '%goals_exclusao%');
  perform pg_temp.expect_error(format($f$insert into public.goals (context_id, goal_type, name, target_cents, created_by)
    values (gen_random_uuid(), 'objetivo', 'Contexto', 1000, %L)$f$, bia), '%goals_context_id_fkey%');
  -- Restrições de goal_movements.
  perform pg_temp.expect_error(format($f$insert into public.goal_movements (goal_id, context_id, kind, amount_cents, occurred_on,
    created_by) values (%L, %L, 'deposito', 1, '2026-10-07', %L)$f$, rid, fam, bia), '%goal_movements_kind_check%');
  perform pg_temp.expect_error(format($f$insert into public.goal_movements (goal_id, context_id, kind, amount_cents, occurred_on,
    created_by) values (%L, %L, 'aporte', 0, '2026-10-07', %L)$f$, rid, fam, bia), '%goal_movements_amount_cents_check%');
  perform pg_temp.expect_error(format($f$insert into public.goal_movements (goal_id, context_id, kind, amount_cents, occurred_on,
    created_by) values (%L, %L, 'aporte', 1000000000, '2026-10-07', %L)$f$, rid, fam, bia), '%goal_movements_amount_cents_check%');
  perform pg_temp.expect_error(format($f$insert into public.goal_movements (goal_id, context_id, kind, amount_cents, occurred_on, note,
    created_by) values (%L, %L, 'aporte', 1, '2026-10-07', '', %L)$f$, rid, fam, bia), '%goal_movements_note_check%');
  perform pg_temp.expect_error(format($f$insert into public.goal_movements (goal_id, context_id, kind, amount_cents, occurred_on, note,
    created_by) values (%L, %L, 'aporte', 1, '2026-10-07', ' x', %L)$f$, rid, fam, bia), '%goal_movements_note_check%');
  perform pg_temp.expect_error(format($f$insert into public.goal_movements (goal_id, context_id, kind, amount_cents, occurred_on,
    created_by, deleted_at) values (%L, %L, 'aporte', 1, '2026-10-07', %L, now())$f$, rid, fam, bia), '%goal_movements_exclusao%');
  perform pg_temp.expect_error(format($f$insert into public.goal_movements (goal_id, context_id, kind, amount_cents, occurred_on,
    created_by) values (%L, %L, 'saldo_inicial', 1, '2026-10-07', %L)$f$, rid, fam, bia), '%goal_movements_one_initial%');
  perform pg_temp.expect_error(format($f$insert into public.goal_movements (goal_id, context_id, kind, amount_cents, occurred_on,
    created_by) values (gen_random_uuid(), %L, 'aporte', 1, '2026-10-07', %L)$f$, ctx, bia), '%goal_movements_goal_fk%');
end $$;
set role authenticated;
select pg_temp.as_('bia');
select pg_temp.expect_error(format($f$insert into public.goals (context_id, goal_type, name, target_cents, created_by)
  values (%L, 'objetivo', 'Direta', 1000, %L)$f$, pg_temp.id('bia_ctx'), pg_temp.id('bia')), 'permission denied%');
select pg_temp.expect_error(format($f$update public.goals set name = 'X', version = version + 1 where id = %L$f$, pg_temp.id('reserva')),
  'permission denied%');
select pg_temp.expect_error(format('delete from public.goals where id = %L', pg_temp.id('fam_reserva')), 'permission denied%');
select pg_temp.expect_error(format($f$insert into public.goal_movements (goal_id, context_id, kind, amount_cents, occurred_on, created_by)
  values (%L, %L, 'aporte', 1, '2026-10-07', %L)$f$, pg_temp.id('reserva'), pg_temp.id('bia_ctx'), pg_temp.id('bia')), 'permission denied%');
select pg_temp.expect_error(format($f$update public.goal_movements set amount_cents = 1, version = version + 1 where goal_id = %L$f$,
  pg_temp.id('fam_reserva')), 'permission denied%');
select pg_temp.expect_error(format('delete from public.goal_movements where goal_id = %L', pg_temp.id('fam_reserva')), 'permission denied%');
reset role;

-- ---------------------------------------------------------------------------
-- 11b. Reserva mínima ("Agora não"): origem 'reserva_minima', base = alvo, sempre 1 mês. Nunca serve de base de gastos
-- essenciais; o app e o core a reconhecem por esta origem (Rui, conta própria sem reserva).
-- ---------------------------------------------------------------------------
set role authenticated;
do $$
declare
  ctx uuid := pg_temp.id('rui_ctx');
  res jsonb;
  rid uuid;
begin
  perform pg_temp.as_('rui');
  -- Só com 1 mês (meses_invalidos), depois de conferir a origem.
  perform pg_temp.expect_code(pg_temp.cg('mt-m-0001', ctx, 'emergencia', 'Reserva', null, null, null, 30000, 3, 'reserva_minima', null,
    null), 'meses_invalidos', '22023');
  perform pg_temp.expect_code(pg_temp.cg('mt-m-0002', ctx, 'emergencia', 'Reserva', null, null, null, 30000, 24, 'reserva_minima', null,
    null), 'meses_invalidos', '22023');
  perform pg_temp.expect_code(pg_temp.cg('mt-m-0003', ctx, 'emergencia', 'Reserva', null, null, null, 30000, 0, 'reserva_minima', null,
    null), 'meses_invalidos', '22023');
  perform pg_temp.expect_code(pg_temp.cg('mt-m-0004', ctx, 'emergencia', 'Reserva', null, null, null, 30000, 1, 'minima', null, null),
    'origem_invalida', '22023');
  -- Outros tipos não aceitam a origem.
  perform pg_temp.expect_code(pg_temp.cg('mt-m-0005', ctx, 'objetivo', 'Curso', 30000, null, null, null, null, 'reserva_minima', null,
    null), 'tipo_invalido', '22023');
  assert (select count(*) from public.goals where context_id = ctx) = 0, 'recusas não gravam';

  res := public.create_goal('mt-m-0010', ctx, 'emergencia', 'Reserva para imprevistos', null, null, 5000, 30000, 1, 'reserva_minima',
    null, null);
  rid := (res #>> '{goal,id}')::uuid;
  assert res #>> '{goal,essential_base_source}' = 'reserva_minima' and (res #>> '{goal,essential_months}')::int = 1
     and (res #>> '{goal,essential_base_cents}')::bigint = 30000 and (res #>> '{goal,target_cents}')::bigint = 30000
     and (res #>> '{goal,planned_monthly_cents}')::bigint = 5000, 'reserva mínima criada: base = alvo, 1 mês';
  assert (select essential_base_source from public.goal_items where id = rid) = 'reserva_minima', 'a visão traz a origem';
  -- Repetição devolve a mesma reserva.
  assert (public.create_goal('mt-m-0010', ctx, 'emergencia', 'Reserva para imprevistos', null, null, 5000, 30000, 1, 'reserva_minima',
    null, null) #>> '{goal,id}')::uuid = rid, 'repetição';
  -- Editar o alvo mantendo a origem e 1 mês; com mais meses, só com outra origem (os gastos essenciais passam a ser a base).
  execute pg_temp.ug('mt-m-0011', rid, 1, 'emergencia', 'Reserva para imprevistos', null, null, 5000, 50000, 1, 'reserva_minima') into res;
  assert (res #>> '{goal,target_cents}')::bigint = 50000 and res #>> '{goal,essential_base_source}' = 'reserva_minima', 'alvo editado';
  perform pg_temp.expect_code(pg_temp.ug('mt-m-0012', rid, 2, 'emergencia', 'Reserva para imprevistos', null, null, 5000, 50000, 3,
    'reserva_minima'), 'meses_invalidos', '22023');
  execute pg_temp.ug('mt-m-0013', rid, 2, 'emergencia', 'Reserva para imprevistos', null, null, 5000, 375000, 3, 'informado') into res;
  assert (res #>> '{goal,target_cents}')::bigint = 1125000 and res #>> '{goal,essential_base_source}' = 'informado', 'com gastos essenciais';
end $$;
reset role;
do $$
begin
  -- Escrita direta do backend: a restrição vale também fora das funções.
  perform pg_temp.expect_error(format($f$insert into public.goals (context_id, goal_type, name, target_cents, essential_base_cents,
    essential_months, essential_base_source, created_by) values (%L, 'emergencia', 'Mínima 3', 3000, 1000, 3, 'reserva_minima', %L)$f$,
    pg_temp.id('rui_ctx'), pg_temp.id('rui')), '%goals_reserva_minima%');
  begin
    insert into public.goals (context_id, goal_type, name, target_cents, essential_base_cents, essential_months, essential_base_source,
                              status, created_by)
    values (pg_temp.id('rui_ctx'), 'emergencia', 'Mínima arquivada', 1000, 1000, 1, 'reserva_minima', 'arquivada', pg_temp.id('rui'));
    raise exception 'desfazer';
  exception when raise_exception then
    assert sqlerrm = 'desfazer', sqlerrm;
  end;
  perform pg_temp.check_links();
end $$;

-- ---------------------------------------------------------------------------
-- 12. Privilégios e assinaturas (conferidos como superusuário).
-- ---------------------------------------------------------------------------
do $$ begin
  assert (select array_agg(p.proname::text order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and has_function_privilege('authenticated', p.oid, 'execute'))
    = array['add_card_charge', 'add_card_purchase', 'add_card_refund', 'add_goal_movement', 'context_permission',
            'create_account', 'create_card', 'create_commitment', 'create_goal', 'create_record', 'create_series',
            'create_series_occurrence', 'decide_return_review', 'delete_account', 'delete_card', 'delete_card_entry',
            'delete_category_budget', 'delete_commitment', 'delete_commitment_limit', 'delete_goal', 'delete_goal_movement',
            'delete_income_reference', 'delete_record', 'delete_series', 'end_series', 'ensure_personal_space',
            'inform_series_year', 'invoice_closing_on', 'invoice_due_on', 'invoice_month_for', 'is_org_admin', 'mark_subscriptions_reviewed', 'month_budget',
            'month_committed', 'month_to_pay', 'month_totals', 'months_overview', 'my_today', 'pay_commitment', 'pay_invoice',
            'set_account_status', 'set_card_status', 'set_category_budget', 'set_commitment_limit', 'set_default_account',
            'set_goal_status', 'set_income_reference', 'set_savings_answer', 'set_series_subscription', 'skip_series_year', 'sync_series_occurrences',
            'undo_commitment_payment', 'undo_invoice_payment', 'update_account', 'update_card', 'update_card_entry',
            'update_commitment', 'update_goal', 'update_goal_movement', 'update_record', 'update_series_from'],
    'authenticated executa só as funções expostas (7 novas)';
  assert not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                      where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')), 'anon não executa nenhuma função';
  assert (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in ('goals_guard', 'goal_movements_guard', 'clarevo_goal_negative_day',
             'clarevo_check_goal_consistency', 'clarevo_lock_goal', 'clarevo_lock_goal_movement', 'clarevo_validate_goal',
             'clarevo_validate_goal_movement', 'clarevo_check_one_emergency', 'clarevo_require_goal_balance', 'clarevo_goal_json',
             'clarevo_goal_result')
             and not has_function_privilege('authenticated', p.oid, 'execute')) = 12, 'auxiliares sem execute para authenticated';
  assert pg_get_function_identity_arguments('public.create_goal(text, uuid, text, text, bigint, date, bigint, bigint, integer, text, bigint, date)'::regprocedure)
       = 'p_idempotency_key text, p_context_id uuid, p_goal_type text, p_name text, p_target_cents bigint, p_target_month date, '
         'p_planned_monthly_cents bigint, p_essential_base_cents bigint, p_essential_months integer, p_essential_base_source text, '
         'p_initial_cents bigint, p_initial_on date'
     and pg_get_function_identity_arguments('public.update_goal(text, uuid, integer, text, text, bigint, date, bigint, bigint, integer, text)'::regprocedure)
       = 'p_idempotency_key text, p_goal_id uuid, p_expected_version integer, p_goal_type text, p_name text, p_target_cents bigint, '
         'p_target_month date, p_planned_monthly_cents bigint, p_essential_base_cents bigint, p_essential_months integer, '
         'p_essential_base_source text'
     and pg_get_function_identity_arguments('public.set_goal_status(text, uuid, integer, text)'::regprocedure)
       = 'p_idempotency_key text, p_goal_id uuid, p_expected_version integer, p_status text'
     and pg_get_function_identity_arguments('public.delete_goal(text, uuid, integer)'::regprocedure)
       = 'p_idempotency_key text, p_goal_id uuid, p_expected_version integer'
     and pg_get_function_identity_arguments('public.add_goal_movement(text, uuid, text, bigint, date, text, uuid)'::regprocedure)
       = 'p_idempotency_key text, p_goal_id uuid, p_kind text, p_amount_cents bigint, p_occurred_on date, p_note text, p_account_id uuid'
     and pg_get_function_identity_arguments('public.update_goal_movement(text, uuid, integer, bigint, date, text, uuid)'::regprocedure)
       = 'p_idempotency_key text, p_movement_id uuid, p_expected_version integer, p_amount_cents bigint, p_occurred_on date, p_note text, p_account_id uuid'
     and pg_get_function_identity_arguments('public.delete_goal_movement(text, uuid, integer)'::regprocedure)
       = 'p_idempotency_key text, p_movement_id uuid, p_expected_version integer',
    'assinaturas e nomes dos argumentos (chamada por nome no PostgREST)';
  assert (select array_agg(pg_get_function_arguments(p.oid) like '%p_note text DEFAULT NULL::text%' order by p.proname)
            from pg_proc p where p.proname in ('add_goal_movement', 'update_goal_movement')) = array[true, true], 'observação opcional';
  assert (select bool_and(pg_get_function_result(p.oid) = 'jsonb' and p.prosecdef and p.provolatile = 'v')
            from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in ('create_goal', 'update_goal', 'set_goal_status', 'delete_goal', 'add_goal_movement',
                                                        'update_goal_movement', 'delete_goal_movement'))
     and (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in ('create_goal', 'update_goal', 'set_goal_status', 'delete_goal', 'add_goal_movement',
                                                        'update_goal_movement', 'delete_goal_movement')) = 7,
    'uma assinatura cada; retorno jsonb, definer, volatile';
  assert (select array_agg(attname::text order by attnum) from pg_attribute
           where attrelid = 'public.goals'::regclass and attnum > 0 and not attisdropped)
    = array['id', 'context_id', 'goal_type', 'name', 'target_cents', 'target_month', 'planned_monthly_cents', 'essential_base_cents',
            'essential_months', 'essential_base_source', 'status', 'created_by', 'version', 'created_at', 'updated_at', 'deleted_at',
            'deleted_by'], 'colunas de goals';
  assert (select array_agg(attname::text order by attnum) from pg_attribute
           where attrelid = 'public.goal_movements'::regclass and attnum > 0 and not attisdropped)
    = array['id', 'goal_id', 'context_id', 'kind', 'amount_cents', 'occurred_on', 'note', 'created_by', 'version', 'created_at',
            'updated_at', 'deleted_at', 'deleted_by', 'account_id'], 'colunas de goal_movements (a conta opcional é da 0010)';
  assert (select array_agg(attname::text || ':' || format_type(atttypid, atttypmod) order by attnum) from pg_attribute
           where attrelid = 'public.goal_items'::regclass and attnum > 0 and not attisdropped)
    = array['id:uuid', 'context_id:uuid', 'goal_type:text', 'name:text', 'target_cents:bigint', 'target_month:date',
            'planned_monthly_cents:bigint', 'essential_base_cents:bigint', 'essential_months:smallint', 'essential_base_source:text',
            'status:text', 'created_by:uuid', 'version:integer', 'created_at:timestamp with time zone',
            'updated_at:timestamp with time zone', 'saved_cents:bigint', 'initial_cents:bigint', 'deposits_cents:bigint',
            'withdrawals_cents:bigint', 'income_cents:bigint', 'appreciation_cents:bigint', 'depreciation_cents:bigint',
            'last_movement_on:date'], 'colunas e tipos de goal_items';
  assert (select reloptions from pg_class where oid = 'public.goal_items'::regclass) @> array['security_invoker=true'],
    'goal_items com a RLS de quem consulta';
  assert has_table_privilege('authenticated', 'public.goals', 'select') and has_table_privilege('authenticated', 'public.goal_movements', 'select')
     and has_table_privilege('authenticated', 'public.goal_items', 'select'), 'leitura (filtrada pela RLS)';
  assert not has_table_privilege('authenticated', 'public.goals', 'insert, update, delete, truncate')
     and not has_table_privilege('authenticated', 'public.goal_movements', 'insert, update, delete, truncate')
     and not has_table_privilege('authenticated', 'public.goal_items', 'insert, update, delete, truncate')
     and not has_any_column_privilege('authenticated', 'public.goals', 'insert, update')
     and not has_any_column_privilege('authenticated', 'public.goal_movements', 'insert, update'), 'sem escrita direta';
  assert not has_table_privilege('anon', 'public.goals', 'select') and not has_table_privilege('anon', 'public.goal_movements', 'select')
     and not has_table_privilege('anon', 'public.goal_items', 'select'), 'anon não lê';
  assert (select relrowsecurity from pg_class where oid = 'public.goals'::regclass)
     and (select relrowsecurity from pg_class where oid = 'public.goal_movements'::regclass)
     and exists (select 1 from pg_policies where tablename = 'goals' and policyname = 'goals_read' and cmd = 'SELECT'
                   and roles = '{authenticated}')
     and exists (select 1 from pg_policies where tablename = 'goal_movements' and policyname = 'goal_movements_read' and cmd = 'SELECT'
                   and roles = '{authenticated}')
     and (select count(*) from pg_policies where tablename in ('goals', 'goal_movements')) = 2, 'RLS ligada, só leitura';
  assert (select confdeltype from pg_constraint where conname = 'goals_context_id_fkey') = 'c'
     and (select confdeltype from pg_constraint where conname = 'goal_movements_goal_fk') = 'c',
    'saem junto com o contexto (exclusão de dados)';
  assert (select count(*) from pg_trigger where tgrelid in ('public.goals'::regclass, 'public.goal_movements'::regclass)
            and not tgisinternal and tgenabled = 'O' and tgname in ('goals_guard', 'goal_movements_guard')) = 2, 'guardas ligadas';
  assert (select count(*) from pg_trigger where not tgisinternal and tgdeferrable and tginitdeferred
            and tgname in ('goal_movements_consistency', 'goal_movements_consistency_del', 'goals_consistency')) = 3,
    'gatilhos de consistência adiados';
  -- G3: nenhuma FK nem gatilho liga metas a registros ou contas a pagar.
  assert not exists (select 1 from pg_constraint c
                      where c.contype = 'f'
                        and ((c.conrelid in ('public.goals'::regclass, 'public.goal_movements'::regclass)
                              and c.confrelid in ('public.financial_records'::regclass, 'public.commitments'::regclass))
                          or (c.conrelid in ('public.financial_records'::regclass, 'public.commitments'::regclass)
                              and c.confrelid in ('public.goals'::regclass, 'public.goal_movements'::regclass)))),
    'G3: sem FK entre metas e registros ou contas a pagar';
  assert not exists (select 1 from pg_trigger t join pg_proc p on p.oid = t.tgfoid
                      where t.tgrelid in ('public.financial_records'::regclass, 'public.commitments'::regclass)
                        and p.prosrc ~ 'goal')
     and not exists (select 1 from pg_trigger t join pg_proc p on p.oid = t.tgfoid
                      where t.tgrelid in ('public.goals'::regclass, 'public.goal_movements'::regclass)
                        and p.prosrc ~ '(financial_records|commitments)'), 'G3: sem gatilho cruzado';
  assert not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                      where n.nspname = 'public' and (p.proname like '%goal%')
                        and p.prosrc ~ '(financial_records|commitments|commitment_series|income_references)'),
    'G3: nenhuma função de metas lê ou grava registros, contas a pagar, séries ou renda';
  -- As assinaturas das migrações anteriores continuam.
  assert to_regprocedure('public.month_committed(uuid, date)') is not null
     and to_regprocedure('public.set_income_reference(text, uuid, date, integer, bigint, boolean)') is not null
     and to_regprocedure('public.month_to_pay(uuid, date)') is not null
     and to_regprocedure('public.create_series_occurrence(text, uuid, integer, integer, text)') is not null, 'demais assinaturas sem mudança';
end $$;
set role anon;
select pg_temp.expect_error($$select public.create_goal('mt-anon-0001', gen_random_uuid(), 'objetivo', 'X', 1, null, null, null, null, null,
  null, null)$$, 'permission denied%');
select pg_temp.expect_error($$select public.add_goal_movement('mt-anon-0002', gen_random_uuid(), 'aporte', 1, '2026-10-07')$$,
  'permission denied%');
select pg_temp.expect_error($$select * from public.goals$$, 'permission denied%');
select pg_temp.expect_error($$select * from public.goal_movements$$, 'permission denied%');
select pg_temp.expect_error($$select * from public.goal_items$$, 'permission denied%');
reset role;

-- Vínculos, séries e metas coerentes no fim de tudo.
select pg_temp.check_links();

rollback;
