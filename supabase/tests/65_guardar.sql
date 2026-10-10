-- Plano de guardar (D-036): savings_checks e set_savings_answer. A pergunta "Você consegue guardar algum valor por mês?" tem
-- uma resposta viva por pessoa e contexto: 'consigo' (com o valor por mês, R$ 1,00 a R$ 9.999.999,99), 'agora_nao' (volta
-- em 30 dias) ou 'depois' (volta em 7 dias). O banco calcula a data de voltar a perguntar. A resposta e as datas são lidas só
-- pela própria pessoa (nem Família, nem empresa, nem somadas); responder não é anotação (não conta como atividade do A4,
-- como decidir_revisao); nada além da resposta é gravado. Também confere a ação responder_guardar em record_operations,
-- a guarda, as restrições e os privilégios.
-- Pessoas FICTÍCIAS: Lara (titular da Família da Lara), Davi (Família, só leitura), Mara (Família, escreve sem "editar de
-- outras pessoas"), Nuno (Família, escreve e altera o que é dos outros), Otávio (externo), Paula (RH da empresa; Lara tem
-- a licença) e Quim (conta nova: validação, datas, versão e repetição). Valores em centavos.
\set ON_ERROR_STOP 1
\set lara   '''00000000-0000-0000-0000-0000000000d1'''
\set davi   '''00000000-0000-0000-0000-0000000000d2'''
\set mara   '''00000000-0000-0000-0000-0000000000d3'''
\set nuno   '''00000000-0000-0000-0000-0000000000d4'''
\set otavio '''00000000-0000-0000-0000-0000000000d5'''
\set paula  '''00000000-0000-0000-0000-0000000000d6'''
\set quim   '''00000000-0000-0000-0000-0000000000d7'''

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

-- versao_desatualizada (PT409) com o detalhe esperado.
create function pg_temp.expect_stale(p_sql text, p_detail text) returns void language sql as $$
  select pg_temp.expect_code(p_sql, 'versao_desatualizada', 'PT409', p_detail)
$$;

create temp table ids (name text primary key, id uuid);
grant select, insert on ids to authenticated;
create function pg_temp.id(p_name text) returns uuid language sql as $$ select id from ids where name = p_name $$;

-- Sessão de quem (nome em ids; nome desconhecido = sem sessão) e dia de hoje.
create function pg_temp.as_(p_name text) returns text language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(pg_temp.id(p_name)::text, ''), true)
$$;
create function pg_temp.today(p_day date) returns text language sql as $$
  select set_config('clarevo.today', to_char(p_day, 'YYYY-MM-DD'), true)
$$;

-- Chamada em texto (para expect_*): nulo vira NULL.
create function pg_temp.sa(p_key text, p_ctx uuid, p_version integer, p_answer text, p_cents bigint default null)
returns text language sql as $$
  select format('select public.set_savings_answer(%L, %L, %L, %L, %L)', p_key, p_ctx, p_version, p_answer, p_cents)
$$;

-- A resposta da pessoa no contexto, direto na tabela (sem a RLS): "resposta valor respondida-em voltar-em vN".
create function pg_temp.sc(p_person text, p_ctx text) returns text language sql security definer
set search_path = public, pg_temp as $$
  select format('%s %s %s %s v%s', answer, coalesce(monthly_cents::text, '-'), to_char(answered_on, 'YYYY-MM-DD'),
                coalesce(to_char(ask_again_on, 'YYYY-MM-DD'), '-'), version)
    from public.savings_checks where person_id = pg_temp.id(p_person) and context_id = pg_temp.id(p_ctx)
$$;
create function pg_temp.sv(p_person text, p_ctx text) returns int language sql security definer
set search_path = public, pg_temp as $$
  select version from public.savings_checks where person_id = pg_temp.id(p_person) and context_id = pg_temp.id(p_ctx)
$$;
create function pg_temp.nrows() returns bigint language sql security definer set search_path = public, pg_temp as $$
  select count(*) from public.savings_checks
$$;
-- Operações responder_guardar da pessoa (todas, ou do contexto pedido).
create function pg_temp.nops(p_person text, p_ctx text default null) returns bigint language sql security definer
set search_path = public, pg_temp as $$
  select count(*) from public.record_operations
   where action = 'responder_guardar' and actor_id = pg_temp.id(p_person) and (p_ctx is null or context_id = pg_temp.id(p_ctx))
$$;
-- Atividade (A4): "última anotação ausência-de ausência-até", direto na tabela (sem a RLS).
create function pg_temp.act(p_person text, p_ctx text) returns text language sql security definer
set search_path = public, pg_temp as $$
  select format('%s %s %s', to_char(last_write_on, 'YYYY-MM-DD'), coalesce(to_char(absence_from_on, 'YYYY-MM-DD'), '-'),
                coalesce(to_char(absence_until_on, 'YYYY-MM-DD'), '-'))
    from public.context_activity where person_id = pg_temp.id(p_person) and context_id = pg_temp.id(p_ctx)
$$;
-- Impressão digital de tudo o que a resposta não pode mudar: registros, contas a pagar, séries, renda de referência,
-- metas, movimentos, revisões, atividade e contas.
create function pg_temp.fp() returns text language sql security definer set search_path = public, pg_temp as $$
  select md5(concat_ws('#',
    (select coalesce(string_agg(to_jsonb(t)::text, ',' order by t.id), '') from public.financial_records t),
    (select coalesce(string_agg(to_jsonb(t)::text, ',' order by t.id), '') from public.commitments t),
    (select coalesce(string_agg(to_jsonb(t)::text, ',' order by t.id), '') from public.commitment_series t),
    (select coalesce(string_agg(to_jsonb(t)::text, ',' order by t.id), '') from public.income_references t),
    (select coalesce(string_agg(to_jsonb(t)::text, ',' order by t.id), '') from public.goals t),
    (select coalesce(string_agg(to_jsonb(t)::text, ',' order by t.id), '') from public.goal_movements t),
    (select coalesce(string_agg(to_jsonb(t)::text, ',' order by t.person_id, t.context_id), '') from public.return_reviews t),
    (select coalesce(string_agg(to_jsonb(t)::text, ',' order by t.person_id, t.context_id), '') from public.context_activity t),
    (select coalesce(string_agg(to_jsonb(t)::text, ',' order by t.id), '') from public.financial_accounts t)))
$$;

insert into ids values ('lara', :lara), ('davi', :davi), ('mara', :mara), ('nuno', :nuno), ('otavio', :otavio),
  ('paula', :paula), ('quim', :quim);
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  (:lara,   'lara@exemplo.test',   now(), '{"display_name":"Lara"}'),
  (:davi,   'davi@exemplo.test',   now(), '{"display_name":"Davi"}'),
  (:mara,   'mara@exemplo.test',   now(), '{"display_name":"Mara"}'),
  (:nuno,   'nuno@exemplo.test',   now(), '{"display_name":"Nuno"}'),
  (:otavio, 'otavio@exemplo.test', now(), '{"display_name":"Otávio"}'),
  (:paula,  'paula@empresa.test',  now(), '{"display_name":"Paula"}'),
  (:quim,   'quim@exemplo.test',   now(), '{"display_name":"Quim"}');

-- Espaços pessoais.
set role authenticated;
do $$
declare
  p text;
  space jsonb;
begin
  foreach p in array array['lara', 'davi', 'mara', 'nuno', 'otavio', 'paula', 'quim'] loop
    perform pg_temp.as_(p);
    space := public.ensure_personal_space('Conta principal');
    insert into ids values (p || '_ctx', (space ->> 'context_id')::uuid), (p || '_acc', (space #>> '{account,id}')::uuid);
  end loop;
end $$;
reset role;

-- Família da Lara (Davi só lê; Mara escreve sem "editar de outras pessoas"; Nuno escreve e altera o que é dos outros) e a
-- empresa da Paula com a licença da Lara, preparadas pelo backend.
with f as (
  insert into public.financial_contexts (kind, name, owner_person_id) values ('familia', 'Família da Lara', :lara) returning id
) insert into ids select 'fam', id from f;
insert into public.context_memberships (context_id, person_id, role, can_read, can_write, can_edit_others)
  select id, :lara::uuid, 'titular'::public.membership_role, true, true, true from ids where name = 'fam'
  union all
  select id, :davi::uuid, 'membro'::public.membership_role, true, false, false from ids where name = 'fam'
  union all
  select id, :mara::uuid, 'membro'::public.membership_role, true, true, false from ids where name = 'fam'
  union all
  select id, :nuno::uuid, 'membro'::public.membership_role, true, true, true from ids where name = 'fam';
insert into public.organizations (id, name) values ('10000000-0000-0000-0000-0000000000d1', 'Empresa Fictícia do Guardar');
insert into public.organization_admins values ('10000000-0000-0000-0000-0000000000d1', :paula);
insert into public.benefit_contracts (id, organization_id, seats, plan, starts_on)
  values ('20000000-0000-0000-0000-0000000000d1', '10000000-0000-0000-0000-0000000000d1', 10, 'familiar', '2026-05-01');
insert into public.licenses (id, contract_id, invited_email, person_id, status, activated_at)
  values ('30000000-0000-0000-0000-0000000000d1', '20000000-0000-0000-0000-0000000000d1', 'lara@exemplo.test', :lara, 'ativa', now());

-- ---------------------------------------------------------------------------
-- 1. Conta nova: nenhuma resposta de exemplo (nem para ninguém).
-- ---------------------------------------------------------------------------
set role authenticated;
do $$ begin
  perform pg_temp.as_('quim');
  assert (select count(*) from public.savings_checks) = 0, 'conta nova sem resposta de exemplo';
end $$;
reset role;
do $$ begin
  assert pg_temp.nrows() = 0, 'criar o espaço pessoal não grava resposta para ninguém';
  assert (select count(*) from public.record_operations where action = 'responder_guardar') = 0, 'nenhuma operação ainda';
end $$;

-- ---------------------------------------------------------------------------
-- 2. Validação (Quim, hoje 07/10/2026), nesta ordem: sessão; chave; repetição; permissão; resposta; valor (consigo: de
-- R$ 1,00 a R$ 9.999.999,99; as outras respostas, sem valor); versão. Recusa não grava resposta nem operação.
-- ---------------------------------------------------------------------------
set role authenticated;
do $$
declare
  ctx uuid := pg_temp.id('quim_ctx');
  answers text[] := array['', 'sim', 'CONSIGO', ' consigo', 'consigo ', 'nao', 'agora não', 'agora-nao', 'Depois', 'consigo,depois'];
  a text;
  i int := 0;
begin
  perform pg_temp.as_('ninguem');
  perform pg_temp.expect_code(pg_temp.sa('gd-n-0001', ctx, 0, 'consigo', 30000), 'nao_autenticado', '42501');
  perform pg_temp.expect_code(pg_temp.sa('gd-n-0001', ctx, 0, 'talvez'), 'nao_autenticado', '42501');

  perform pg_temp.as_('quim');
  -- Chave: nula, curta ou com mais de 80 caracteres (antes da permissão e de qualquer validação).
  perform pg_temp.expect_code(pg_temp.sa(null, ctx, 0, 'consigo', 30000), 'chave_invalida', '22023');
  perform pg_temp.expect_code(pg_temp.sa('curta', ctx, 0, 'consigo', 30000), 'chave_invalida', '22023');
  perform pg_temp.expect_code(pg_temp.sa('gd-n-07', ctx, 0, 'consigo', 30000), 'chave_invalida', '22023');
  perform pg_temp.expect_code(pg_temp.sa('gd-n-' || repeat('x', 76), ctx, 0, 'consigo', 30000), 'chave_invalida', '22023');
  perform pg_temp.expect_code(pg_temp.sa('curta', gen_random_uuid(), 0, 'talvez', 5), 'chave_invalida', '22023');

  -- Permissão antes de qualquer validação: contexto inexistente, nulo ou de outra pessoa.
  perform pg_temp.expect_code(pg_temp.sa('gd-n-0002', gen_random_uuid(), 0, 'consigo', 30000), 'sem_permissao', '42501');
  perform pg_temp.expect_code(pg_temp.sa('gd-n-0003', gen_random_uuid(), null, 'talvez', 5), 'sem_permissao', '42501');
  perform pg_temp.expect_code(pg_temp.sa('gd-n-0004', null, 0, 'consigo', 30000), 'sem_permissao', '42501');
  perform pg_temp.expect_code(pg_temp.sa('gd-n-0005', pg_temp.id('lara_ctx'), 0, 'talvez', 5), 'sem_permissao', '42501');
  perform pg_temp.expect_code(pg_temp.sa('gd-n-0006', pg_temp.id('fam'), 0, 'consigo', 30000), 'sem_permissao', '42501');

  -- Resposta: nula ou fora das três (sem aparar nem trocar caixa).
  perform pg_temp.expect_code(pg_temp.sa('gd-n-1000', ctx, 0, null), 'resposta_invalida', '22023');
  perform pg_temp.expect_code(pg_temp.sa('gd-n-1001', ctx, 0, null, 30000), 'resposta_invalida', '22023');
  foreach a in array answers loop
    i := i + 1;
    perform pg_temp.expect_code(pg_temp.sa('gd-n-11' || lpad(i::text, 2, '0'), ctx, 0, a), 'resposta_invalida', '22023');
    perform pg_temp.expect_code(pg_temp.sa('gd-n-12' || lpad(i::text, 2, '0'), ctx, 0, a, 30000), 'resposta_invalida', '22023');
  end loop;
  -- A resposta é conferida antes do valor.
  perform pg_temp.expect_code(pg_temp.sa('gd-n-1300', ctx, 0, 'talvez', 0), 'resposta_invalida', '22023');
  perform pg_temp.expect_code(pg_temp.sa('gd-n-1301', ctx, 0, 'talvez', 1000000000), 'resposta_invalida', '22023');

  -- "Consigo": valor de 100 a 999.999.999 (R$ 1,00 a R$ 9.999.999,99).
  perform pg_temp.expect_code(pg_temp.sa('gd-n-2000', ctx, 0, 'consigo'), 'valor_invalido', '22023');
  perform pg_temp.expect_code(pg_temp.sa('gd-n-2001', ctx, 0, 'consigo', 0), 'valor_invalido', '22023');
  perform pg_temp.expect_code(pg_temp.sa('gd-n-2002', ctx, 0, 'consigo', -1), 'valor_invalido', '22023');
  perform pg_temp.expect_code(pg_temp.sa('gd-n-2003', ctx, 0, 'consigo', 99), 'valor_invalido', '22023');
  perform pg_temp.expect_code(pg_temp.sa('gd-n-2004', ctx, 0, 'consigo', -9223372036854775807), 'valor_invalido', '22023');
  perform pg_temp.expect_code(pg_temp.sa('gd-n-2005', ctx, 0, 'consigo', 1000000000), 'valor_acima_do_limite', '22023');
  perform pg_temp.expect_code(pg_temp.sa('gd-n-2006', ctx, 0, 'consigo', 9223372036854775807), 'valor_acima_do_limite', '22023');
  -- "Agora não" e "Depois": nenhum valor (nem zero, nem acima do limite).
  perform pg_temp.expect_code(pg_temp.sa('gd-n-3000', ctx, 0, 'agora_nao', 5000), 'valor_invalido', '22023');
  perform pg_temp.expect_code(pg_temp.sa('gd-n-3001', ctx, 0, 'depois', 0), 'valor_invalido', '22023');
  perform pg_temp.expect_code(pg_temp.sa('gd-n-3002', ctx, 0, 'depois', 100), 'valor_invalido', '22023');
  perform pg_temp.expect_code(pg_temp.sa('gd-n-3003', ctx, 0, 'agora_nao', -5), 'valor_invalido', '22023');
  perform pg_temp.expect_code(pg_temp.sa('gd-n-3004', ctx, 0, 'agora_nao', 5000000000), 'valor_invalido', '22023');

  -- Versão: ausência de resposta é 0; nula é recusada. A validação vem antes da versão.
  perform pg_temp.expect_code(pg_temp.sa('gd-n-4000', ctx, 9, 'talvez'), 'resposta_invalida', '22023');
  perform pg_temp.expect_code(pg_temp.sa('gd-n-4001', ctx, null, 'consigo', 99), 'valor_invalido', '22023');
  perform pg_temp.expect_code(pg_temp.sa('gd-n-4002', ctx, 9, 'consigo', 1000000000), 'valor_acima_do_limite', '22023');
  perform pg_temp.expect_stale(pg_temp.sa('gd-n-4003', ctx, 9, 'consigo', 100), 'versao_atual=0');
  perform pg_temp.expect_stale(pg_temp.sa('gd-n-4004', ctx, 1, 'depois'), 'versao_atual=0');
  perform pg_temp.expect_stale(pg_temp.sa('gd-n-4005', ctx, null, 'agora_nao'), 'versao_atual=0');
  perform pg_temp.expect_stale(pg_temp.sa('gd-n-4006', ctx, -1, 'agora_nao'), 'versao_atual=0');
end $$;
reset role;
do $$ begin
  assert pg_temp.nrows() = 0 and (select count(*) from public.record_operations where action = 'responder_guardar') = 0,
    'recusas não gravam resposta nem operação';
end $$;

-- Chaves aceitas: 8 e 80 caracteres (Davi, no espaço pessoal dele).
set role authenticated;
do $$
declare
  ctx uuid := pg_temp.id('davi_ctx');
  res jsonb;
begin
  perform pg_temp.as_('davi');
  res := public.set_savings_answer('gd-d-001', ctx, 0, 'depois');
  assert res ->> 'answer' = 'depois' and (res ->> 'version')::int = 1, 'chave de 8 caracteres';
  res := public.set_savings_answer('gd-d-' || repeat('y', 75), ctx, 1, 'agora_nao');
  assert res ->> 'answer' = 'agora_nao' and (res ->> 'version')::int = 2, 'chave de 80 caracteres';
end $$;
reset role;
do $$ begin
  assert pg_temp.sc('davi', 'davi_ctx') = 'agora_nao - 2026-10-07 2026-11-06 v2', 'Davi: 30 dias depois de 07/10';
end $$;

-- ---------------------------------------------------------------------------
-- 3. Respostas e datas de voltar a perguntar (Quim). O banco calcula: depois = hoje + 7 dias, agora_nao = hoje + 30 dias,
-- consigo = nenhuma. A resposta nova substitui a anterior (versão + 1) e "agora_nao" ou "depois" apaga o valor por mês.
-- ---------------------------------------------------------------------------
set role authenticated;
do $$
declare
  ctx uuid := pg_temp.id('quim_ctx');
  res jsonb;
  steps text[][] := array[
    -- dia, resposta, valor, voltar a perguntar em
    array['2026-10-07', 'depois',    null,        '2026-10-14'],
    array['2026-10-07', 'agora_nao', null,        '2026-11-06'],
    array['2026-10-07', 'consigo',   '100',       '-'],
    array['2026-10-07', 'consigo',   '999999999', '-'],
    array['2026-10-07', 'consigo',   '30000',     '-'],
    array['2026-10-07', 'depois',    null,        '2026-10-14'],
    array['2026-10-07', 'consigo',   '50000',     '-'],
    array['2026-10-07', 'agora_nao', null,        '2026-11-06'],
    array['2026-12-28', 'depois',    null,        '2027-01-04'],
    array['2026-12-20', 'agora_nao', null,        '2027-01-19'],
    array['2027-02-01', 'agora_nao', null,        '2027-03-03'],
    array['2027-02-25', 'depois',    null,        '2027-03-04'],
    array['2028-02-01', 'agora_nao', null,        '2028-03-02'],
    array['2028-02-25', 'depois',    null,        '2028-03-03'],
    array['2028-12-25', 'depois',    null,        '2029-01-01'],
    array['2026-10-31', 'depois',    null,        '2026-11-07'],
    array['2026-10-31', 'agora_nao', null,        '2026-11-30'],
    array['2026-10-01', 'agora_nao', null,        '2026-10-31'],
    array['2026-10-07', 'consigo',   '50000',     '-']
  ];
  i int;
  v int := 0;
  cents bigint;
begin
  perform pg_temp.as_('quim');
  for i in 1 .. array_length(steps, 1) loop
    perform pg_temp.today(steps[i][1]::date);
    cents := steps[i][3]::bigint;
    res := public.set_savings_answer('gd-j-' || lpad(i::text, 4, '0'), ctx, v, steps[i][2], cents);
    v := v + 1;
    assert (res ->> 'version')::int = v and res ->> 'answer' = steps[i][2] and res ->> 'answered_on' = steps[i][1]
       and coalesce(res ->> 'ask_again_on', '-') = steps[i][4] and (res ->> 'monthly_cents')::bigint is not distinct from cents,
      format('passo %s: %s', i, res);
    assert pg_temp.sc('quim', 'quim_ctx') = format('%s %s %s %s v%s', steps[i][2], coalesce(steps[i][3], '-'), steps[i][1],
                                                   steps[i][4], v), format('passo %s na tabela: %s', i, pg_temp.sc('quim', 'quim_ctx'));
    -- Também pelos dias entre as datas.
    assert (select coalesce(ask_again_on - answered_on, 0) from public.savings_checks where person_id = auth.uid())
           = case steps[i][2] when 'depois' then 7 when 'agora_nao' then 30 else 0 end, format('passo %s: 7 ou 30 dias', i);
  end loop;
  assert v = 19, 'dezenove respostas';
  perform pg_temp.today('2026-10-07');
end $$;
reset role;
do $$ begin
  assert pg_temp.nrows() = 2 and pg_temp.sv('quim', 'quim_ctx') = 19 and pg_temp.nops('quim') = 19,
    'uma linha por pessoa e contexto (substituída a cada resposta) e uma operação por resposta';
  assert pg_temp.act('quim', 'quim_ctx') is null, 'responder não cria atividade (A4)';
end $$;

-- ---------------------------------------------------------------------------
-- 4. Versão: recusa a antiga, a nula, a maior e o zero depois da primeira resposta, sem escrever nada. A chave recusada
-- pode ser usada de novo.
-- ---------------------------------------------------------------------------
set role authenticated;
do $$
declare
  ctx uuid := pg_temp.id('quim_ctx');
  v int := pg_temp.sv('quim', 'quim_ctx');
  before text := pg_temp.sc('quim', 'quim_ctx');
  res jsonb;
begin
  assert v = 19, 'ponto de partida';
  perform pg_temp.as_('quim');
  perform pg_temp.expect_stale(pg_temp.sa('gd-v-0001', ctx, v - 1, 'consigo', 70000), 'versao_atual=19');
  perform pg_temp.expect_stale(pg_temp.sa('gd-v-0002', ctx, v + 1, 'consigo', 70000), 'versao_atual=19');
  perform pg_temp.expect_stale(pg_temp.sa('gd-v-0003', ctx, 0, 'consigo', 70000), 'versao_atual=19');
  perform pg_temp.expect_stale(pg_temp.sa('gd-v-0004', ctx, null, 'consigo', 70000), 'versao_atual=19');
  perform pg_temp.expect_stale(pg_temp.sa('gd-v-0005', ctx, 1, 'depois'), 'versao_atual=19');
  perform pg_temp.expect_stale(pg_temp.sa('gd-v-0006', ctx, 2147483647, 'agora_nao'), 'versao_atual=19');
  -- A versão é por pessoa e contexto: a de Davi (2) não vale para o Quim e a do Quim não vale para o Davi.
  perform pg_temp.expect_stale(pg_temp.sa('gd-v-0007', ctx, 2, 'consigo', 70000), 'versao_atual=19');
  assert pg_temp.sc('quim', 'quim_ctx') = before, 'recusas não mudam a resposta';
  -- A chave de uma recusa não foi gasta.
  res := public.set_savings_answer('gd-v-0001', ctx, v, 'consigo', 70000);
  assert (res ->> 'version')::int = 20 and (res ->> 'monthly_cents')::bigint = 70000, 'mesma chave, versão certa';
end $$;
reset role;
do $$ begin
  assert pg_temp.sc('quim', 'quim_ctx') = 'consigo 70000 2026-10-07 - v20' and pg_temp.nops('quim') = 20, 'só a escrita certa gravou';
end $$;

-- ---------------------------------------------------------------------------
-- 5. Repetição (idempotência): mesma chave, ação e conteúdo devolve o estado atual sem gravar; outro conteúdo ou outra ação
-- com a mesma chave é chave_reutilizada (nos dois sentidos); o hash é o JSON da ação e dos argumentos; a chave é por pessoa.
-- ---------------------------------------------------------------------------
set role authenticated;
do $$
declare
  ctx uuid := pg_temp.id('quim_ctx');
  res1 jsonb;
  res2 jsonb;
  res3 jsonb;
begin
  perform pg_temp.as_('quim');
  res1 := public.set_savings_answer('gd-i-0001', ctx, 20, 'agora_nao');
  assert pg_temp.sc('quim', 'quim_ctx') = 'agora_nao - 2026-10-07 2026-11-06 v21', 'primeira chamada grava';
  res2 := public.set_savings_answer('gd-i-0001', ctx, 20, 'agora_nao');
  assert res2 = res1, 'repetição devolve o mesmo JSON';
  assert pg_temp.sc('quim', 'quim_ctx') = 'agora_nao - 2026-10-07 2026-11-06 v21', 'repetição não grava (versão e datas iguais)';
  -- Repetição em outro dia não recalcula as datas.
  perform pg_temp.today('2026-10-20');
  res2 := public.set_savings_answer('gd-i-0001', ctx, 20, 'agora_nao');
  assert res2 = res1 and pg_temp.sc('quim', 'quim_ctx') = 'agora_nao - 2026-10-07 2026-11-06 v21', 'repetição em outro dia: nada muda';
  perform pg_temp.today('2026-10-07');
  -- Repetição devolve o estado ATUAL, não o da primeira chamada.
  res3 := public.set_savings_answer('gd-i-0002', ctx, 21, 'consigo', 45000);
  assert (res3 ->> 'version')::int = 22, 'segunda escrita';
  res2 := public.set_savings_answer('gd-i-0001', ctx, 20, 'agora_nao');
  assert res2 = res3 and res2 ->> 'answer' = 'consigo' and (res2 ->> 'monthly_cents')::bigint = 45000,
    'repetição da primeira chave devolve o estado atual';
  assert pg_temp.sc('quim', 'quim_ctx') = 'consigo 45000 2026-10-07 - v22', 'e continua sem gravar';

  -- Mesma chave com outro conteúdo: resposta, valor, versão ou contexto.
  perform pg_temp.expect_code(pg_temp.sa('gd-i-0002', ctx, 21, 'consigo', 45001), 'chave_reutilizada', 'PT409');
  perform pg_temp.expect_code(pg_temp.sa('gd-i-0002', ctx, 21, 'depois'), 'chave_reutilizada', 'PT409');
  perform pg_temp.expect_code(pg_temp.sa('gd-i-0002', ctx, 22, 'consigo', 45000), 'chave_reutilizada', 'PT409');
  perform pg_temp.expect_code(pg_temp.sa('gd-i-0002', ctx, null, 'consigo', 45000), 'chave_reutilizada', 'PT409');
  perform pg_temp.expect_code(pg_temp.sa('gd-i-0002', gen_random_uuid(), 21, 'consigo', 45000), 'chave_reutilizada', 'PT409');
  perform pg_temp.expect_code(pg_temp.sa('gd-i-0001', ctx, 20, 'agora_nao', 100), 'chave_reutilizada', 'PT409');
  perform pg_temp.expect_code(pg_temp.sa('gd-i-0001', ctx, 20, 'depois'), 'chave_reutilizada', 'PT409');
  -- A chave de repetição vem antes da validação: o conteúdo inválido de uma chave já usada é chave_reutilizada.
  perform pg_temp.expect_code(pg_temp.sa('gd-i-0001', ctx, 20, 'talvez'), 'chave_reutilizada', 'PT409');
  assert pg_temp.sc('quim', 'quim_ctx') = 'consigo 45000 2026-10-07 - v22', 'recusas não gravam';
end $$;
-- A ação da operação também é conferida (não só o hash): outra ação com o mesmo hash e a mesma chave é chave_reutilizada.
reset role;
do $$
declare
  ctx uuid := pg_temp.id('quim_ctx');
begin
  begin
    insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash)
      values (pg_temp.id('quim'), 'gd-i-9001', 'decidir_revisao', ctx,
              md5(jsonb_build_array('responder_guardar', ctx, 22, 'depois', null)::text));
    perform pg_temp.as_('quim');
    perform pg_temp.expect_code(pg_temp.sa('gd-i-9001', ctx, 22, 'depois'), 'chave_reutilizada', 'PT409');
    raise exception 'desfeito';
  exception when others then
    if sqlerrm <> 'desfeito' then
      raise;
    end if;
  end;
  assert pg_temp.sc('quim', 'quim_ctx') = 'consigo 45000 2026-10-07 - v22', 'nada mudou';
end $$;
set role authenticated;
-- A chave é por pessoa: a mesma chave de outra pessoa é outra operação.
do $$
declare
  res jsonb;
begin
  perform pg_temp.as_('mara');
  res := public.set_savings_answer('gd-i-0001', pg_temp.id('mara_ctx'), 0, 'consigo', 20000);
  assert (res ->> 'version')::int = 1 and res ->> 'answer' = 'consigo', 'a chave do Quim não vale para a Mara';
  res := public.set_savings_answer('gd-i-0001', pg_temp.id('mara_ctx'), 0, 'consigo', 20000);
  assert (res ->> 'version')::int = 1, 'e a repetição dela devolve a dela';
  perform pg_temp.expect_code(pg_temp.sa('gd-i-0001', pg_temp.id('mara_ctx'), 1, 'consigo', 20000), 'chave_reutilizada', 'PT409');
end $$;
-- Chave de outra ação (registro, meta) nos dois sentidos (Davi).
do $$
declare
  ctx uuid := pg_temp.id('davi_ctx');
  acc uuid := pg_temp.id('davi_acc');
begin
  perform pg_temp.as_('davi');
  perform public.create_record('gd-x-0001', ctx, acc, 'despesa', 1000, '2026-10-07', 'Café');
  perform pg_temp.expect_code(pg_temp.sa('gd-x-0001', ctx, 2, 'consigo', 20000), 'chave_reutilizada', 'PT409');
  perform public.set_savings_answer('gd-x-0002', ctx, 2, 'consigo', 20000);
  perform pg_temp.expect_error(format($f$select public.create_record('gd-x-0002', %L, %L, 'despesa', 1000, '2026-10-07', 'Café')$f$, ctx, acc),
    'chave_reutilizada');
  perform public.create_goal('gd-x-0003', ctx, 'objetivo', 'Curso', 100000, null, null, null, null, null, null, null);
  perform pg_temp.expect_code(pg_temp.sa('gd-x-0003', ctx, 3, 'depois'), 'chave_reutilizada', 'PT409');
  perform public.set_savings_answer('gd-x-0004', ctx, 3, 'depois');
  perform pg_temp.expect_error(format($f$select public.create_goal('gd-x-0004', %L, 'objetivo', 'Curso', 100000, null, null, null, null, null, null, null)$f$,
    ctx), 'chave_reutilizada');
  assert pg_temp.sc('davi', 'davi_ctx') = 'depois - 2026-10-07 2026-10-14 v4', 'Davi: quatro respostas';
end $$;
reset role;
-- Hash: o texto exato do JSON com a ação e os argumentos (nulos como null).
do $$
declare
  ctx text := pg_temp.id('quim_ctx')::text;
begin
  assert (select request_hash from public.record_operations where idempotency_key = 'gd-j-0001' and actor_id = pg_temp.id('quim'))
       = md5('["responder_guardar", "' || ctx || '", 0, "depois", null]'), 'hash de "depois" sem valor';
  assert (select request_hash from public.record_operations where idempotency_key = 'gd-j-0003' and actor_id = pg_temp.id('quim'))
       = md5('["responder_guardar", "' || ctx || '", 2, "consigo", 100]'), 'hash de "consigo" com valor';
  assert (select request_hash from public.record_operations where idempotency_key = 'gd-i-0002' and actor_id = pg_temp.id('quim'))
       = md5('["responder_guardar", "' || ctx || '", 21, "consigo", 45000]'), 'hash com a versão esperada';
  assert (select request_hash from public.record_operations where idempotency_key = 'gd-i-0001' and actor_id = pg_temp.id('quim'))
       = md5(jsonb_build_array('responder_guardar', pg_temp.id('quim_ctx'), 20, 'agora_nao', null)::text), 'hash = md5 do JSON da ação';
end $$;

-- ---------------------------------------------------------------------------
-- 6. record_operations: responder_guardar não aponta para nada (o contexto já está em context_id), como decidir_revisao;
-- a lista vigente tem 37 ações (26 e as 11 de cartões, testadas em 70); uma operação por escrita.
-- ---------------------------------------------------------------------------
do $$
declare
  cases text[][] := array[
    array['r', null, null],
    array[null, 'c', null],
    array[null, null, 't'],
    array['r', 'c', null],
    array['r', null, 't'],
    array[null, 'c', 't'],
    array['r', 'c', 't']
  ];
  i int;
begin
  for i in 1 .. array_length(cases, 1) loop
    perform pg_temp.expect_error(format($f$insert into public.record_operations
        (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id, target_id)
      values (%L, %L, 'responder_guardar', %L, 'x', %s, %s, %s)$f$,
      pg_temp.id('quim'), 'gd-o-1' || lpad(i::text, 3, '0'), pg_temp.id('quim_ctx'),
      case when cases[i][1] is null then 'null' else 'gen_random_uuid()' end,
      case when cases[i][2] is null then 'null' else 'gen_random_uuid()' end,
      case when cases[i][3] is null then 'null' else 'gen_random_uuid()' end), '%record_operations_target_check%');
  end loop;
  perform pg_temp.expect_error(format($f$insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash)
    values (%L, 'gd-o-2001', 'responder_guard', %L, 'x')$f$, pg_temp.id('quim'), pg_temp.id('quim_ctx')), '%record_operations_action_check%');
  perform pg_temp.expect_error(format($f$insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash)
    values (%L, 'gd-o-2002', 'responder', %L, 'x')$f$, pg_temp.id('quim'), pg_temp.id('quim_ctx')), '%record_operations_action_check%');
  -- A ação sem alvo é aceita (e o caso é desfeito no próprio bloco).
  begin
    insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id, target_id)
      values (pg_temp.id('quim'), 'gd-o-3001', 'responder_guardar', pg_temp.id('quim_ctx'), 'x', null, null, null);
    raise exception 'desfeito';
  exception when others then
    if sqlerrm <> 'desfeito' then
      raise exception 'operação sem alvo deveria passar: %', sqlerrm;
    end if;
  end;
  assert (select count(*) from pg_constraint c, regexp_matches(pg_get_constraintdef(c.oid), '''([a-z_]+)''::text', 'g') m
           where c.conname = 'record_operations_action_check') = 37, 'a lista vigente tem 37 ações (26 e as 11 de cartões, testadas em 70)';
  assert (select count(*) from pg_constraint c, regexp_matches(pg_get_constraintdef(c.oid), '''responder_guardar''::text', 'g') m
           where c.conname = 'record_operations_action_check') = 1, 'responder_guardar na lista de ações';
  -- As 25 anteriores continuam aceitas pela restrição de ação (cada caso desfeito no próprio bloco).
  assert (select array_agg(m[1] order by m[1] collate "C")
            from pg_constraint c, regexp_matches(pg_get_constraintdef(c.oid), '''([a-z_]+)''::text', 'g') m
           where c.conname = 'record_operations_action_check' and m[1] <> 'responder_guardar')
    = array['alterar_cartao', 'alterar_lancamento_cartao', 'alterar_meta', 'alterar_movimento_meta', 'alterar_serie', 'criar',
            'criar_cartao', 'criar_compra_cartao', 'criar_compromisso', 'criar_encargo_cartao', 'criar_estorno_cartao',
            'criar_meta', 'criar_ocorrencia', 'criar_serie', 'decidir_revisao', 'definir_renda_referencia', 'desfazer_pagamento',
            'desfazer_pagamento_fatura', 'editar', 'editar_compromisso', 'encerrar_serie', 'excluir', 'excluir_cartao',
            'excluir_compromisso', 'excluir_lancamento_cartao', 'excluir_meta', 'excluir_movimento_meta',
            'excluir_renda_referencia', 'excluir_serie', 'informar_ano', 'pagar_compromisso', 'pagar_fatura',
            'registrar_movimento_meta', 'situacao_cartao', 'situacao_meta', 'tirar_ano'],
    'as ações anteriores continuam (as 25 de antes do guardar e as 11 de cartões, testadas em 70)';
  -- Cada resposta que gravou é uma operação sem alvo, no contexto certo, com o hash da chamada.
  assert not exists (select 1 from public.record_operations
                      where action = 'responder_guardar'
                        and (record_id is not null or commitment_id is not null or target_id is not null)), 'sem alvo';
  assert pg_temp.nops('quim') = pg_temp.sv('quim', 'quim_ctx') and pg_temp.nops('quim', 'quim_ctx') = pg_temp.nops('quim')
     and pg_temp.nops('davi', 'davi_ctx') = pg_temp.sv('davi', 'davi_ctx') and pg_temp.nops('mara', 'mara_ctx') = 1,
    'uma operação por escrita (repetições e recusas não gravam): operações = versão da linha';
  assert (select count(*) from public.record_operations o where o.action = 'responder_guardar'
            and not exists (select 1 from public.savings_checks s where s.person_id = o.actor_id and s.context_id = o.context_id)) = 0,
    'cada operação tem a resposta da pessoa no contexto';
end $$;
-- A operação é lida pela própria pessoa (operations_read_own) e por mais ninguém.
set role authenticated;
do $$ begin
  perform pg_temp.as_('quim');
  assert (select count(*) from public.record_operations where action = 'responder_guardar') = pg_temp.sv('quim', 'quim_ctx'),
    'Quim lê as próprias operações';
  perform pg_temp.as_('paula');
  assert (select count(*) from public.record_operations where action = 'responder_guardar') = 0, 'Paula não lê operações de ninguém';
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 7. Atividade (A4): responder não é anotação. Não cria a atividade, não avança o dia da última anotação e não encurta nem
-- cria ausência; a anotação de verdade depois da ausência continua registrando a ausência.
-- ---------------------------------------------------------------------------
set role authenticated;
do $$
declare
  ctx uuid := pg_temp.id('mara_ctx');
  acc uuid := pg_temp.id('mara_acc');
begin
  perform pg_temp.as_('mara');
  perform pg_temp.today('2026-05-20');
  perform public.create_record('gd-a-0001', ctx, acc, 'despesa', 1000, '2026-05-20', 'Café');
  assert pg_temp.act('mara', 'mara_ctx') = '2026-05-20 - -', 'anotação em 20/05';
  perform pg_temp.today('2026-10-07');
  perform public.set_savings_answer('gd-a-0002', ctx, 1, 'depois');
  assert pg_temp.sc('mara', 'mara_ctx') = 'depois - 2026-10-07 2026-10-14 v2', 'Mara respondeu em 07/10';
  assert pg_temp.act('mara', 'mara_ctx') = '2026-05-20 - -', 'a resposta não conta como anotação (nem cria ausência)';
  perform pg_temp.today('2026-10-08');
  perform public.set_savings_answer('gd-a-0003', ctx, 2, 'consigo', 30000);
  assert pg_temp.act('mara', 'mara_ctx') = '2026-05-20 - -', 'outra resposta, outro dia: igual';
  perform pg_temp.today('2026-10-07');
  perform public.create_record('gd-a-0004', ctx, acc, 'despesa', 2000, '2026-10-07', 'Padaria');
  assert pg_temp.act('mara', 'mara_ctx') = '2026-10-07 2026-05-20 2026-10-07', 'a anotação de verdade registra a ausência de 20/05 a 07/10';
  perform pg_temp.today('2026-11-20');
  perform public.set_savings_answer('gd-a-0005', ctx, 3, 'agora_nao');
  assert pg_temp.act('mara', 'mara_ctx') = '2026-10-07 2026-05-20 2026-10-07', 'responder um mês depois não muda a atividade';
  perform pg_temp.today('2026-10-07');
end $$;
reset role;
do $$ begin
  -- Toda atividade vem de alguma operação que não é responder_guardar.
  assert not exists (select 1 from public.context_activity a
                      where not exists (select 1 from public.record_operations o
                                         where o.actor_id = a.person_id and o.context_id = a.context_id
                                           and o.action <> 'responder_guardar')), 'atividade só de anotações';
  assert pg_temp.act('quim', 'quim_ctx') is null and pg_temp.act('mara', 'fam') is null, 'quem só respondeu não tem atividade';
end $$;

-- ---------------------------------------------------------------------------
-- 8. Permissões e leitura. Escrever exige escrita no contexto; ler, só a própria linha e só enquanto lê o contexto. Nem
-- Família (inclusive quem altera o que é dos outros), nem empresa, nem externo.
-- ---------------------------------------------------------------------------
set role authenticated;
do $$
declare
  fam uuid := pg_temp.id('fam');
begin
  -- Lara responde no espaço pessoal e na Família; Nuno e Mara, na Família; Davi não escreve na Família.
  perform pg_temp.as_('lara');
  perform public.set_savings_answer('gd-p-0001', pg_temp.id('lara_ctx'), 0, 'consigo', 50000);
  perform public.set_savings_answer('gd-p-0002', fam, 0, 'depois');
  perform pg_temp.as_('nuno');
  perform public.set_savings_answer('gd-p-0003', fam, 0, 'consigo', 40000);
  perform pg_temp.as_('mara');
  perform public.set_savings_answer('gd-p-0004', fam, 0, 'agora_nao');
  perform pg_temp.as_('davi');
  perform pg_temp.expect_code(pg_temp.sa('gd-p-0005', fam, 0, 'consigo', 10000), 'sem_permissao', '42501');
  perform pg_temp.expect_code(pg_temp.sa('gd-p-0006', fam, 0, 'talvez'), 'sem_permissao', '42501');
  -- Ninguém responde no contexto de outra pessoa.
  perform pg_temp.as_('lara');
  perform pg_temp.expect_code(pg_temp.sa('gd-p-0101', pg_temp.id('nuno_ctx'), 0, 'depois'), 'sem_permissao', '42501');
  perform pg_temp.as_('nuno');
  perform pg_temp.expect_code(pg_temp.sa('gd-p-0102', pg_temp.id('lara_ctx'), 1, 'depois'), 'sem_permissao', '42501');
  perform pg_temp.as_('quim');
  perform pg_temp.expect_code(pg_temp.sa('gd-p-0103', pg_temp.id('lara_ctx'), 1, 'depois'), 'sem_permissao', '42501');
  perform pg_temp.expect_code(pg_temp.sa('gd-p-0104', fam, 0, 'depois'), 'sem_permissao', '42501');
  perform pg_temp.as_('otavio');
  perform pg_temp.expect_code(pg_temp.sa('gd-p-0105', pg_temp.id('lara_ctx'), 1, 'depois'), 'sem_permissao', '42501');
  perform pg_temp.expect_code(pg_temp.sa('gd-p-0106', fam, 0, 'depois'), 'sem_permissao', '42501');
  perform pg_temp.as_('paula');
  perform pg_temp.expect_code(pg_temp.sa('gd-p-0107', pg_temp.id('lara_ctx'), 1, 'depois'), 'sem_permissao', '42501');
  perform pg_temp.expect_code(pg_temp.sa('gd-p-0108', fam, 0, 'depois'), 'sem_permissao', '42501');
end $$;
do $$ begin
  perform pg_temp.as_('lara');
  assert (select count(*) from public.savings_checks) = 2 and not exists (select 1 from public.savings_checks where person_id <> auth.uid()),
    'Lara (titular, altera o que é dos outros) lê só as próprias respostas';
  assert (select answer from public.savings_checks where context_id = pg_temp.id('lara_ctx')) = 'consigo'
     and (select monthly_cents from public.savings_checks where context_id = pg_temp.id('lara_ctx')) = 50000, 'o valor dela';
  perform pg_temp.as_('nuno');
  assert (select count(*) from public.savings_checks) = 1 and (select person_id from public.savings_checks) = auth.uid()
     and (select monthly_cents from public.savings_checks) = 40000, 'Nuno (altera o que é dos outros) lê só a dele';
  perform pg_temp.as_('mara');
  assert (select count(*) from public.savings_checks) = 2 and not exists (select 1 from public.savings_checks where person_id <> auth.uid())
     and (select count(*) from public.savings_checks where context_id = pg_temp.id('fam')) = 1, 'Mara lê só as dela (pessoal e Família)';
  perform pg_temp.as_('davi');
  assert (select count(*) from public.savings_checks) = 1 and (select context_id from public.savings_checks) = pg_temp.id('davi_ctx'),
    'Davi (só leitura na Família) lê só a do espaço dele';
  perform pg_temp.as_('quim');
  assert (select count(*) from public.savings_checks) = 1 and (select context_id from public.savings_checks) = pg_temp.id('quim_ctx'),
    'Quim lê só a dele';
  perform pg_temp.as_('otavio');
  assert (select count(*) from public.savings_checks) = 0, 'Otávio (externo) não lê nada';
  perform pg_temp.as_('paula');
  assert (select count(*) from public.licenses) = 1, 'Paula vê a licença da empresa';
  assert (select count(*) from public.savings_checks) = 0, 'Paula (RH) não lê resposta de ninguém';
  -- A permissão vem antes de qualquer filtro de quem consulta: uma divisão por zero não revela as linhas dos outros.
  assert (select count(*) from public.savings_checks where 1 / (version - version) = 1) = 0
     and (select count(*) from public.savings_checks where 1 / (extract(day from answered_on)::int - extract(day from answered_on)::int) = 1) = 0,
    'filtro de quem consulta só vê as linhas permitidas (nenhuma)';
  perform pg_temp.as_('ninguem');
  assert (select count(*) from public.savings_checks) = 0, 'sem sessão: nada';
end $$;
reset role;
do $$ begin
  assert pg_temp.nrows() = 7, 'sete respostas no total: Quim, Davi, Mara (2), Lara (2) e Nuno: ' || pg_temp.nrows();
  assert (select count(*) from public.savings_checks where context_id = pg_temp.id('fam')) = 3, 'três na Família (Lara, Nuno e Mara)';
end $$;

-- Mara perde a escrita na Família: não responde mais, mas ainda lê a própria resposta e repete a chave que já usou.
update public.context_memberships set can_write = false where context_id = pg_temp.id('fam') and person_id = :mara;
set role authenticated;
do $$
declare
  fam uuid := pg_temp.id('fam');
begin
  perform pg_temp.as_('mara');
  perform pg_temp.expect_code(pg_temp.sa('gd-m-0001', fam, 1, 'consigo', 20000), 'sem_permissao', '42501');
  perform pg_temp.expect_code(pg_temp.sa('gd-m-0002', fam, 1, 'talvez'), 'sem_permissao', '42501');
  assert (select count(*) from public.savings_checks where context_id = fam) = 1, 'ainda lê a própria resposta na Família';
  assert (public.set_savings_answer('gd-p-0004', fam, 0, 'agora_nao') ->> 'answer') = 'agora_nao',
    'a repetição só pede leitura (devolve o estado atual)';
end $$;
reset role;
-- Escrita de volta; depois o vínculo é revogado: nada a ler, a repetição some e a escrita é recusada.
update public.context_memberships set can_write = true where context_id = pg_temp.id('fam') and person_id = :mara;
set role authenticated;
do $$
declare
  fam uuid := pg_temp.id('fam');
  res jsonb;
begin
  perform pg_temp.as_('mara');
  res := public.set_savings_answer('gd-m-0003', fam, 1, 'consigo', 20000);
  assert (res ->> 'version')::int = 2 and (res ->> 'monthly_cents')::bigint = 20000, 'escrita de volta';
end $$;
reset role;
update public.context_memberships set revoked_at = now() where context_id = pg_temp.id('fam') and person_id = :mara;
set role authenticated;
do $$
declare
  fam uuid := pg_temp.id('fam');
begin
  perform pg_temp.as_('mara');
  assert (select count(*) from public.savings_checks where context_id = fam) = 0, 'vínculo revogado: a resposta da Família some da leitura';
  assert (select count(*) from public.savings_checks) = 1 and (select context_id from public.savings_checks) = pg_temp.id('mara_ctx'),
    'e a do espaço pessoal continua';
  perform pg_temp.expect_code(pg_temp.sa('gd-p-0004', fam, 0, 'agora_nao'), 'nao_encontrado', 'P0002');
  perform pg_temp.expect_code(pg_temp.sa('gd-m-0003', fam, 1, 'consigo', 20000), 'nao_encontrado', 'P0002');
  perform pg_temp.expect_code(pg_temp.sa('gd-m-0004', fam, 2, 'depois'), 'sem_permissao', '42501');
  -- Repetição com conteúdo diferente continua sendo chave_reutilizada (a repetição vem antes da leitura).
  perform pg_temp.expect_code(pg_temp.sa('gd-m-0003', fam, 1, 'depois'), 'chave_reutilizada', 'PT409');
end $$;
reset role;
do $$ begin
  assert pg_temp.sc('mara', 'fam') = 'consigo 20000 2026-10-07 - v2', 'a linha continua (sai junto com a pessoa ou o contexto)';
end $$;

-- Nenhuma visão nem função agrega ou expõe as respostas: só set_savings_answer (da própria pessoa) toca a tabela.
do $$ begin
  assert (select count(*) from pg_views where schemaname = 'public' and definition ilike '%savings_checks%') = 0, 'nenhuma visão';
  assert (select count(*) from pg_matviews where definition ilike '%savings_checks%') = 0, 'nenhuma visão materializada';
  assert (select array_agg(p.proname::text order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.prosrc ilike '%savings_checks%') = array['set_savings_answer'],
    'só set_savings_answer lê ou grava savings_checks';
  assert (select count(*) from pg_policies where tablename = 'savings_checks') = 1
     and exists (select 1 from pg_policies where tablename = 'savings_checks' and policyname = 'savings_checks_own'
                   and cmd = 'SELECT' and roles = '{authenticated}'), 'uma política só, de leitura';
  assert (select relrowsecurity from pg_class where oid = 'public.savings_checks'::regclass), 'RLS ligada';
end $$;

-- ---------------------------------------------------------------------------
-- 9. Nenhum efeito além da resposta (G8): registros, contas a pagar, séries, renda de referência, metas, movimentos,
-- revisões, atividade e contas ficam idênticos; só savings_checks e record_operations mudam.
-- ---------------------------------------------------------------------------
set role authenticated;
do $$
declare
  fp text := pg_temp.fp();
  ops bigint := (select count(*) from public.record_operations);
  rows bigint := pg_temp.nrows();
begin
  -- Antes: Lara e Nuno com metas e gastos (para a impressão digital não ser de tabelas vazias).
  perform pg_temp.as_('lara');
  perform public.create_goal('gd-g-0001', pg_temp.id('lara_ctx'), 'objetivo', 'Viagem', 600000, '2027-07-01', 48000, null, null, null, 120000, '2026-10-01');
  perform public.create_record('gd-g-0002', pg_temp.id('lara_ctx'), pg_temp.id('lara_acc'), 'receita', 600000, '2026-10-05', 'Salário');
  perform public.create_commitment('gd-g-0003', pg_temp.id('lara_ctx'), 65000, '2026-10-20', 'Internet', 'Moradia');
  fp := pg_temp.fp();
  ops := (select count(*) from public.record_operations);
  rows := pg_temp.nrows();
  assert fp <> md5(''), 'impressão digital calculada';
  -- Respostas novas, repetições e recusas.
  perform public.set_savings_answer('gd-g-1001', pg_temp.id('lara_ctx'), 1, 'agora_nao');
  perform public.set_savings_answer('gd-g-1002', pg_temp.id('lara_ctx'), 2, 'consigo', 80000);
  perform public.set_savings_answer('gd-g-1002', pg_temp.id('lara_ctx'), 2, 'consigo', 80000);
  perform public.set_savings_answer('gd-g-1003', pg_temp.id('fam'), 1, 'consigo', 30000);
  perform pg_temp.expect_stale(pg_temp.sa('gd-g-1004', pg_temp.id('lara_ctx'), 1, 'depois'), 'versao_atual=3');
  perform pg_temp.expect_code(pg_temp.sa('gd-g-1005', pg_temp.id('lara_ctx'), 3, 'consigo', 5), 'valor_invalido', '22023');
  assert pg_temp.fp() = fp, 'nada fora da resposta mudou (registros, contas, séries, renda, metas, revisões, atividade, contas)';
  assert (select count(*) from public.record_operations) = ops + 3 and pg_temp.nrows() = rows, 'três operações novas; nenhuma linha nova';
  assert pg_temp.sc('lara', 'lara_ctx') = 'consigo 80000 2026-10-07 - v3' and pg_temp.sc('lara', 'fam') = 'consigo 30000 2026-10-07 - v2',
    'as respostas da Lara';
end $$;
reset role;

-- Excluir os dados: a resposta sai junto com o contexto ou com a pessoa (cascata). Cada caso desfeito no próprio bloco.
do $$
declare
  n bigint := pg_temp.nrows();
begin
  begin
    delete from public.financial_contexts where id = pg_temp.id('fam');
    assert pg_temp.nrows() = n - 3, 'apagar a Família apaga as três respostas dela';
    raise exception 'desfeito';
  exception when others then
    if sqlerrm <> 'desfeito' then
      raise;
    end if;
  end;
  assert pg_temp.nrows() = n, 'desfeito';
  assert (select array_agg(conname::text order by conname) from pg_constraint where conrelid = 'public.savings_checks'::regclass and contype = 'f')
    = array['savings_checks_context_id_fkey', 'savings_checks_person_id_fkey']
     and (select bool_and(confdeltype = 'c') from pg_constraint where conrelid = 'public.savings_checks'::regclass and contype = 'f'),
    'saem junto com a pessoa ou o contexto (exclusão de dados)';
end $$;

-- ---------------------------------------------------------------------------
-- 10. Guarda e restrições da tabela (escrita direta do backend; cada caso desfeito no próprio bloco).
-- ---------------------------------------------------------------------------
do $$
declare
  w text := format('person_id = %L and context_id = %L', pg_temp.id('quim'), pg_temp.id('quim_ctx'));
  quim uuid := pg_temp.id('quim');
  qctx uuid := pg_temp.id('quim_ctx');
  nova uuid := pg_temp.id('otavio_ctx');
begin
  assert pg_temp.sc('quim', 'quim_ctx') = 'consigo 45000 2026-10-07 - v22', 'ponto de partida';
  -- Guarda: pessoa, contexto e criação imutáveis; versão exatamente + 1.
  perform pg_temp.expect_error(format('update public.savings_checks set person_id = %L, version = version + 1 where ', pg_temp.id('otavio')) || w,
    'campo_imutavel');
  perform pg_temp.expect_error(format('update public.savings_checks set context_id = %L, version = version + 1 where ', nova) || w,
    'campo_imutavel');
  perform pg_temp.expect_error($f$update public.savings_checks set created_at = created_at - interval '1 day', version = version + 1 where $f$ || w,
    'campo_imutavel');
  perform pg_temp.expect_error($f$update public.savings_checks set monthly_cents = 100 where $f$ || w, 'campo_imutavel');
  perform pg_temp.expect_error($f$update public.savings_checks set monthly_cents = 100, version = version + 2 where $f$ || w, 'campo_imutavel');
  perform pg_temp.expect_error($f$update public.savings_checks set monthly_cents = 100, version = version where $f$ || w, 'campo_imutavel');
  perform pg_temp.expect_error($f$update public.savings_checks set monthly_cents = 100, version = version - 1 where $f$ || w, 'campo_imutavel');
  -- Uma escrita válida passa pela guarda (e é desfeita).
  begin
    update public.savings_checks set answer = 'depois', monthly_cents = null, ask_again_on = answered_on + 7, version = version + 1 where person_id = quim and context_id = qctx;
    assert pg_temp.sc('quim', 'quim_ctx') = 'depois - 2026-10-07 2026-10-14 v23', 'guarda aceita +1';
    raise exception 'desfeito';
  exception when others then
    if sqlerrm <> 'desfeito' then
      raise exception 'escrita com versão + 1 deveria passar: %', sqlerrm;
    end if;
  end;
  assert pg_temp.sc('quim', 'quim_ctx') = 'consigo 45000 2026-10-07 - v22', 'desfeito';

  -- Restrições: resposta, valor, data de voltar a perguntar, versão, nulos, chave e vínculos.
  perform pg_temp.expect_error(format($f$insert into public.savings_checks (person_id, context_id, answer, monthly_cents, answered_on)
    values (%L, %L, 'talvez', null, '2026-10-07')$f$, pg_temp.id('otavio'), nova), '%savings_checks_resposta%');
  perform pg_temp.expect_error(format($f$insert into public.savings_checks (person_id, context_id, answer, monthly_cents, answered_on)
    values (%L, %L, 'consigo', null, '2026-10-07')$f$, pg_temp.id('otavio'), nova), '%savings_checks_valor%');
  perform pg_temp.expect_error(format($f$insert into public.savings_checks (person_id, context_id, answer, monthly_cents, answered_on)
    values (%L, %L, 'consigo', 99, '2026-10-07')$f$, pg_temp.id('otavio'), nova), '%savings_checks_valor%');
  perform pg_temp.expect_error(format($f$insert into public.savings_checks (person_id, context_id, answer, monthly_cents, answered_on)
    values (%L, %L, 'consigo', 1000000000, '2026-10-07')$f$, pg_temp.id('otavio'), nova), '%savings_checks_valor%');
  perform pg_temp.expect_error(format($f$insert into public.savings_checks (person_id, context_id, answer, monthly_cents, answered_on, ask_again_on)
    values (%L, %L, 'agora_nao', 100, '2026-10-07', '2026-11-06')$f$, pg_temp.id('otavio'), nova), '%savings_checks_valor%');
  perform pg_temp.expect_error(format($f$insert into public.savings_checks (person_id, context_id, answer, monthly_cents, answered_on, ask_again_on)
    values (%L, %L, 'depois', 0, '2026-10-07', '2026-10-14')$f$, pg_temp.id('otavio'), nova), '%savings_checks_valor%');
  perform pg_temp.expect_error(format($f$insert into public.savings_checks (person_id, context_id, answer, monthly_cents, answered_on, ask_again_on)
    values (%L, %L, 'consigo', 100, '2026-10-07', '2026-11-06')$f$, pg_temp.id('otavio'), nova), '%savings_checks_retorno%');
  perform pg_temp.expect_error(format($f$insert into public.savings_checks (person_id, context_id, answer, monthly_cents, answered_on)
    values (%L, %L, 'agora_nao', null, '2026-10-07')$f$, pg_temp.id('otavio'), nova), '%savings_checks_retorno%');
  perform pg_temp.expect_error(format($f$insert into public.savings_checks (person_id, context_id, answer, monthly_cents, answered_on, ask_again_on)
    values (%L, %L, 'depois', null, '2026-10-07', '2026-10-07')$f$, pg_temp.id('otavio'), nova), '%savings_checks_retorno%');
  perform pg_temp.expect_error(format($f$insert into public.savings_checks (person_id, context_id, answer, monthly_cents, answered_on, ask_again_on)
    values (%L, %L, 'depois', null, '2026-10-07', '2026-10-06')$f$, pg_temp.id('otavio'), nova), '%savings_checks_retorno%');
  perform pg_temp.expect_error(format($f$insert into public.savings_checks (person_id, context_id, answer, monthly_cents, answered_on, ask_again_on)
    values (%L, %L, 'depois', null, null, '2026-10-14')$f$, pg_temp.id('otavio'), nova), '%answered_on%');
  perform pg_temp.expect_error(format($f$insert into public.savings_checks (person_id, context_id, answer, monthly_cents, answered_on, ask_again_on, version)
    values (%L, %L, 'depois', null, '2026-10-07', '2026-10-14', 0)$f$, pg_temp.id('otavio'), nova), '%savings_checks_version_check%');
  perform pg_temp.expect_error(format($f$insert into public.savings_checks (person_id, context_id, answer, monthly_cents, answered_on, ask_again_on)
    values (%L, %L, 'depois', null, '2026-10-07', '2026-10-14')$f$, quim, qctx), '%savings_checks_pkey%');
  perform pg_temp.expect_error(format($f$insert into public.savings_checks (person_id, context_id, answer, monthly_cents, answered_on, ask_again_on)
    values (%L, gen_random_uuid(), 'depois', null, '2026-10-07', '2026-10-14')$f$, quim), '%savings_checks_context_id_fkey%');
  perform pg_temp.expect_error(format($f$insert into public.savings_checks (person_id, context_id, answer, monthly_cents, answered_on, ask_again_on)
    values (gen_random_uuid(), %L, 'depois', null, '2026-10-07', '2026-10-14')$f$, nova), '%savings_checks_person_id_fkey%');
  perform pg_temp.expect_error(format($f$update public.savings_checks set answer = 'talvez', version = version + 1 where $f$) || w,
    '%savings_checks_resposta%');
  perform pg_temp.expect_error(format($f$update public.savings_checks set monthly_cents = 99, version = version + 1 where $f$) || w,
    '%savings_checks_valor%');
  perform pg_temp.expect_error(format($f$update public.savings_checks set ask_again_on = '2026-10-14', version = version + 1 where $f$) || w,
    '%savings_checks_retorno%');
  perform pg_temp.expect_error(format($f$update public.savings_checks set answer = 'depois', monthly_cents = null, version = version + 1 where $f$) || w,
    '%savings_checks_retorno%');
  -- Os valores mínimo e máximo e as duas datas de voltar a perguntar passam pelas restrições (e são desfeitos).
  begin
    insert into public.savings_checks (person_id, context_id, answer, monthly_cents, answered_on, ask_again_on) values
      (pg_temp.id('otavio'), nova, 'consigo', 100, '2026-10-07', null);
    assert pg_temp.sc('otavio', 'otavio_ctx') = 'consigo 100 2026-10-07 - v1', 'mínimo';
    update public.savings_checks set monthly_cents = 999999999, version = version + 1 where person_id = pg_temp.id('otavio');
    update public.savings_checks set answer = 'agora_nao', monthly_cents = null, ask_again_on = '2026-11-06', version = version + 1
      where person_id = pg_temp.id('otavio');
    update public.savings_checks set answer = 'depois', ask_again_on = '2026-10-08', version = version + 1
      where person_id = pg_temp.id('otavio');
    assert pg_temp.sc('otavio', 'otavio_ctx') = 'depois - 2026-10-07 2026-10-08 v4', 'restrições aceitam o válido';
    raise exception 'desfeito';
  exception when others then
    if sqlerrm <> 'desfeito' then
      raise exception 'escrita válida deveria passar: %', sqlerrm;
    end if;
  end;
  assert pg_temp.sc('otavio', 'otavio_ctx') is null, 'desfeito';
end $$;
set role authenticated;
do $$ begin
  perform pg_temp.as_('quim');
  perform pg_temp.expect_error(format($f$insert into public.savings_checks (person_id, context_id, answer, monthly_cents, answered_on, ask_again_on)
    values (auth.uid(), %L, 'depois', null, '2026-10-07', '2026-10-14')$f$, pg_temp.id('quim_ctx')), 'permission denied%');
  perform pg_temp.expect_error($f$update public.savings_checks set answer = 'consigo', monthly_cents = 100, ask_again_on = null$f$, 'permission denied%');
  perform pg_temp.expect_error($f$delete from public.savings_checks$f$, 'permission denied%');
  perform pg_temp.expect_error($f$truncate public.savings_checks$f$, 'permission denied%');
end $$;
reset role;
do $$ begin
  assert pg_temp.sc('quim', 'quim_ctx') = 'consigo 45000 2026-10-07 - v22', 'nada mudou';
end $$;

-- ---------------------------------------------------------------------------
-- 11. Privilégios e assinaturas (conferidos como superusuário).
-- A lista exata das funções de authenticated está em 30, 40, 45, 47, 50 e 60 (todas com set_savings_answer).
-- ---------------------------------------------------------------------------
do $$ begin
  assert has_function_privilege('authenticated', 'public.set_savings_answer(text, uuid, integer, text, bigint)', 'execute'),
    'authenticated executa set_savings_answer';
  assert not has_function_privilege('anon', 'public.set_savings_answer(text, uuid, integer, text, bigint)', 'execute'), 'anon não';
  assert not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                      where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')), 'anon não executa nenhuma função';
  assert not has_function_privilege('authenticated', 'public.savings_checks_guard()', 'execute')
     and not has_function_privilege('authenticated', 'public.clarevo_track_activity()', 'execute'), 'guarda e gatilho sem execute';
  assert pg_get_function_identity_arguments('public.set_savings_answer(text, uuid, integer, text, bigint)'::regprocedure)
       = 'p_idempotency_key text, p_context_id uuid, p_expected_version integer, p_answer text, p_monthly_cents bigint',
    'nomes dos argumentos (chamada por nome no PostgREST)';
  assert pg_get_function_arguments('public.set_savings_answer(text, uuid, integer, text, bigint)'::regprocedure)
       = 'p_idempotency_key text, p_context_id uuid, p_expected_version integer, p_answer text, p_monthly_cents bigint DEFAULT NULL::bigint',
    'p_monthly_cents é opcional (nulo)';
  assert pg_get_function_result('public.set_savings_answer(text, uuid, integer, text, bigint)'::regprocedure) = 'jsonb', 'retorno jsonb';
  assert (select prosecdef from pg_proc where oid = 'public.set_savings_answer(text, uuid, integer, text, bigint)'::regprocedure)
     and (select provolatile from pg_proc where oid = 'public.set_savings_answer(text, uuid, integer, text, bigint)'::regprocedure) = 'v',
    'definer e volatile';
  assert (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'set_savings_answer') = 1,
    'uma assinatura só';
  assert (select array_agg(attname::text || ':' || format_type(atttypid, atttypmod) order by attnum) from pg_attribute
           where attrelid = 'public.savings_checks'::regclass and attnum > 0 and not attisdropped)
    = array['person_id:uuid', 'context_id:uuid', 'answer:text', 'monthly_cents:bigint', 'answered_on:date', 'ask_again_on:date',
            'version:integer', 'created_at:timestamp with time zone', 'updated_at:timestamp with time zone'], 'colunas de savings_checks';
  assert (select array_agg(conname::text order by conname) from pg_constraint where conrelid = 'public.savings_checks'::regclass)
    = array['savings_checks_context_id_fkey', 'savings_checks_person_id_fkey', 'savings_checks_pkey', 'savings_checks_resposta',
            'savings_checks_retorno', 'savings_checks_valor', 'savings_checks_version_check'], 'restrições da tabela';
  assert has_table_privilege('authenticated', 'public.savings_checks', 'select'), 'leitura (filtrada pela RLS)';
  assert not has_table_privilege('authenticated', 'public.savings_checks', 'insert, update, delete, truncate')
     and not has_any_column_privilege('authenticated', 'public.savings_checks', 'insert, update'), 'sem escrita direta';
  assert not has_table_privilege('anon', 'public.savings_checks', 'select')
     and not has_any_column_privilege('anon', 'public.savings_checks', 'select, insert, update'), 'anon não lê';
  assert exists (select 1 from pg_trigger where tgname = 'savings_checks_guard' and tgrelid = 'public.savings_checks'::regclass
                   and not tgisinternal and tgenabled = 'O'), 'guarda ligada';
  assert exists (select 1 from pg_trigger where tgname = 'record_operations_activity' and tgrelid = 'public.record_operations'::regclass
                   and not tgisinternal and tgenabled = 'O'), 'gatilho de atividade ligado';
  assert pg_get_functiondef('public.clarevo_track_activity()'::regprocedure) like '%responder_guardar%'
     and pg_get_functiondef('public.clarevo_track_activity()'::regprocedure) like '%decidir_revisao%', 'atividade exclui as duas ações';
  -- As assinaturas das migrações anteriores continuam.
  assert to_regprocedure('public.decide_return_review(text, uuid, integer, date, text)') is not null
     and to_regprocedure('public.create_goal(text, uuid, text, text, bigint, date, bigint, bigint, integer, text, bigint, date)') is not null
     and to_regprocedure('public.add_goal_movement(text, uuid, text, bigint, date, text)') is not null, 'demais assinaturas sem mudança';
end $$;
set role anon;
select pg_temp.expect_error($$select public.set_savings_answer('gd-anon-001', gen_random_uuid(), 0, 'depois')$$, 'permission denied%');
select pg_temp.expect_error($$select * from public.savings_checks$$, 'permission denied%');
reset role;

rollback;
