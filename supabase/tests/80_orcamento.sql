-- Orçamento por categoria e limite pessoal de comprometimento (D-041): category_budgets, commitment_limits,
-- set_category_budget, delete_category_budget, set_commitment_limit, delete_commitment_limit, month_budget (o usado no mês por
-- competência, igual ao core: budget.ts), guardas, restrições de record_operations e privilégios.
-- Sequência sobre a montagem FICTÍCIA da demonstração (Cris, hoje 07/10/2026): gastos anotados, uma conta paga, e um cartão
-- (fecha dia 3, vence dia 10) com compras parceladas, estorno, encargo e o pagamento de uma fatura. Os números do usado são os
-- mesmos do teste do core ("o usado vem dos gastos e das compras no cartão do contexto, mês a mês"): Mercado R$ 70,00 em
-- setembro e R$ 472,30 em outubro; Lazer R$ 333,35 em outubro, R$ 293,33 em novembro e zero em dezembro (estorno maior que o gasto).
-- Orçamento e limite nunca mudam Recebido, Pago, Diferença, Ainda a pagar nem a renda comprometida (D4).
-- Pessoas FICTÍCIAS: Cris (sequência; titular da Família da Cris), Davi (Família, só leitura), Elisa (Família, escreve sem
-- "editar de outras pessoas"), Fábio (Família, escreve e altera o que é dos outros), Gaia (externa), Heitor (RH da empresa; Cris
-- tem a licença) e Ivo (conta nova; validação, repetição, versão e limites). Valores em centavos.
\set ON_ERROR_STOP 1
\set cris   '''00000000-0000-0000-0000-0000000000c8'''
\set davi   '''00000000-0000-0000-0000-0000000000d8'''
\set elisa  '''00000000-0000-0000-0000-0000000000e8'''
\set fabio  '''00000000-0000-0000-0000-0000000000f8'''
\set gaia   '''00000000-0000-0000-0000-0000000000a8'''
\set heitor '''00000000-0000-0000-0000-0000000000b8'''
\set ivo    '''00000000-0000-0000-0000-0000000000c7'''

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

-- Confere agora as restrições adiadas (vínculos de contas e faturas). Sem isso, o rollback final nunca as dispararia.
create function pg_temp.check_links() returns void language plpgsql as $$
begin
  set constraints all immediate;
  set constraints all deferred;
end $$;

-- Atividade (A4): "última anotação ausência-de ausência-até", direto na tabela (sem a RLS).
create function pg_temp.act(p_person text, p_ctx text) returns text language sql security definer
set search_path = public, pg_temp as $$
  select format('%s %s %s', to_char(last_write_on, 'YYYY-MM-DD'), coalesce(to_char(absence_from_on, 'YYYY-MM-DD'), '-'),
                coalesce(to_char(absence_until_on, 'YYYY-MM-DD'), '-'))
    from public.context_activity where person_id = pg_temp.id(p_person) and context_id = pg_temp.id(p_ctx)
$$;

-- month_budget de uma categoria em texto: "orçamento@início usado" (orçamento nulo = "-", início nulo = "-").
create function pg_temp.mb(p_ctx text, p_month date, p_category text) returns text language sql as $$
  select format('%s@%s %s', coalesce(budget_cents::text, '-'), coalesce(to_char(budget_from, 'YYYY-MM'), '-'), used_cents)
    from public.month_budget(pg_temp.id(p_ctx), p_month) where category = p_category
$$;
-- Totais do mês, como a tela de Resumo lê: {recebido, pago, diferença} e comprometido.
create function pg_temp.totals(p_ctx text, p_month date) returns bigint[] language sql as $$
  select array[received_cents, paid_cents, difference_cents] from public.month_totals(pg_temp.id(p_ctx), p_month)
$$;
create function pg_temp.committed(p_ctx text, p_month date) returns text language sql as $$
  select format('%s %s %s', committed_cents, coalesce(committed_permille::text, '-'), coalesce(reference_cents::text, '-'))
    from public.month_committed(pg_temp.id(p_ctx), p_month)
$$;
-- Contagens do que orçamento e limite nunca podem gravar (D4).
create function pg_temp.untouched() returns text language sql security definer set search_path = public, pg_temp as $$
  select format('%s %s %s %s %s', (select count(*) from public.financial_records), (select count(*) from public.commitments),
                (select count(*) from public.card_entries), (select count(*) from public.goals), (select count(*) from public.income_references))
$$;

insert into ids values ('cris', :cris), ('davi', :davi), ('elisa', :elisa), ('fabio', :fabio), ('gaia', :gaia), ('heitor', :heitor),
  ('ivo', :ivo);
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  (:cris,   'cris@exemplo.test',   now(), '{"display_name":"Cris"}'),
  (:davi,   'davi@exemplo.test',   now(), '{"display_name":"Davi"}'),
  (:elisa,  'elisa@exemplo.test',  now(), '{"display_name":"Elisa"}'),
  (:fabio,  'fabio@exemplo.test',  now(), '{"display_name":"Fábio"}'),
  (:gaia,   'gaia@exemplo.test',   now(), '{"display_name":"Gaia"}'),
  (:heitor, 'heitor@empresa.test', now(), '{"display_name":"Heitor"}'),
  (:ivo,    'ivo@exemplo.test',    now(), '{"display_name":"Ivo"}');

-- Espaços pessoais.
set role authenticated;
do $$
declare
  p text;
  space jsonb;
begin
  foreach p in array array['cris', 'davi', 'elisa', 'fabio', 'gaia', 'heitor', 'ivo'] loop
    perform pg_temp.as_(p);
    space := public.ensure_personal_space('Conta principal');
    insert into ids values (p || '_ctx', (space ->> 'context_id')::uuid), (p || '_acc', (space #>> '{account,id}')::uuid);
  end loop;
end $$;
reset role;

-- Família da Cris (Davi só lê; Elisa escreve sem "editar de outras pessoas"; Fábio escreve e altera o que é dos outros) e a
-- empresa do Heitor com a licença da Cris, preparadas pelo backend.
with f as (
  insert into public.financial_contexts (kind, name, owner_person_id) values ('familia', 'Família da Cris', :cris) returning id
) insert into ids select 'fam', id from f;
insert into public.context_memberships (context_id, person_id, role, can_read, can_write, can_edit_others)
  select id, :cris::uuid, 'titular'::public.membership_role, true, true, true from ids where name = 'fam'
  union all
  select id, :davi::uuid, 'membro'::public.membership_role, true, false, false from ids where name = 'fam'
  union all
  select id, :elisa::uuid, 'membro'::public.membership_role, true, true, false from ids where name = 'fam'
  union all
  select id, :fabio::uuid, 'membro'::public.membership_role, true, true, true from ids where name = 'fam';
insert into public.organizations (id, name) values ('10000000-0000-0000-0000-0000000000c8', 'Empresa Fictícia do Orçamento');
insert into public.organization_admins values ('10000000-0000-0000-0000-0000000000c8', :heitor);
insert into public.benefit_contracts (id, organization_id, seats, plan, starts_on)
  values ('20000000-0000-0000-0000-0000000000c8', '10000000-0000-0000-0000-0000000000c8', 10, 'familiar', '2026-05-01');
insert into public.licenses (id, contract_id, invited_email, person_id, status, activated_at)
  values ('30000000-0000-0000-0000-0000000000c8', '20000000-0000-0000-0000-0000000000c8', 'cris@exemplo.test', :cris, 'ativa', now());

-- ---------------------------------------------------------------------------
-- 1. Conta nova: nenhum orçamento nem limite de exemplo; month_budget devolve as seis categorias, sem orçamento e sem uso.
-- ---------------------------------------------------------------------------
set role authenticated;
do $$ begin
  perform pg_temp.as_('ivo');
  assert (select count(*) from public.category_budgets) = 0 and (select count(*) from public.commitment_limits) = 0,
    'conta nova sem orçamento nem limite';
  assert (select array_agg(category) from public.month_budget(pg_temp.id('ivo_ctx'), '2026-10-01'))
       = array['Moradia', 'Mercado', 'Transporte', 'Saúde', 'Educação', 'Lazer'], 'as seis categorias, na ordem de sempre';
  assert not exists (select 1 from public.month_budget(pg_temp.id('ivo_ctx'), '2026-10-01')
                      where budget_id is not null or budget_version is not null or budget_from is not null or budget_cents is not null
                         or used_cents <> 0), 'nenhum orçamento, nenhum uso';
  assert (select count(*) from public.month_budget(pg_temp.id('ivo_ctx'), '2026-10-01')) = 6, 'sempre seis linhas';
end $$;

-- ---------------------------------------------------------------------------
-- 2. Validação (Ivo, hoje 07/10/2026): sessão, chave, permissão, formato (mês e categoria), versão e autoria antes do intervalo
-- do mês (24 meses antes a 12 meses depois do mês de hoje) e do valor, nessa ordem. month_budget: mes_invalido antes de
-- sem_permissao, como month_committed.
-- ---------------------------------------------------------------------------
do $$
declare
  ctx uuid := pg_temp.id('ivo_ctx');
  res jsonb;
begin
  perform pg_temp.as_('ninguem');
  perform pg_temp.expect_error(format($f$select public.set_category_budget('or-n-0001', %L, 'Mercado', '2026-10-01', 0, 100000)$f$, ctx),
    'nao_autenticado');
  perform pg_temp.expect_error(format($f$select public.delete_category_budget('or-n-0002', %L, 1)$f$, ctx), 'nao_autenticado');
  perform pg_temp.expect_error(format($f$select public.set_commitment_limit('or-n-0003', %L, '2026-10-01', 0, 40)$f$, ctx), 'nao_autenticado');
  perform pg_temp.expect_error(format($f$select public.delete_commitment_limit('or-n-0004', %L, 1)$f$, ctx), 'nao_autenticado');
  perform pg_temp.expect_error(format($f$select * from public.month_budget(%L, '2026-10-01')$f$, ctx), 'sem_permissao');
  perform pg_temp.expect_error(format($f$select * from public.month_budget(%L, '2026-10-02')$f$, ctx), 'mes_invalido');

  perform pg_temp.as_('ivo');
  perform pg_temp.expect_error(format($f$select public.set_category_budget('curta', %L, 'Mercado', '2026-10-01', 0, 100000)$f$, ctx),
    'chave_invalida');
  perform pg_temp.expect_error(format($f$select public.set_category_budget(null, %L, 'Mercado', '2026-10-01', 0, 100000)$f$, ctx),
    'chave_invalida');
  perform pg_temp.expect_error(format($f$select public.set_commitment_limit(%L, %L, '2026-10-01', 0, 40)$f$, repeat('k', 81), ctx),
    'chave_invalida');
  perform pg_temp.expect_error($f$select public.delete_commitment_limit('curta', gen_random_uuid(), 1)$f$, 'chave_invalida');
  -- Permissão: contexto que não existe ou que não é dele.
  perform pg_temp.expect_error($f$select public.set_category_budget('or-n-0005', gen_random_uuid(), 'Mercado', '2026-10-01', 0, 100000)$f$,
    'sem_permissao');
  perform pg_temp.expect_error(format($f$select public.set_category_budget('or-n-0006', %L, 'Mercado', '2026-10-01', 0, 100000)$f$,
    pg_temp.id('cris_ctx')), 'sem_permissao');
  perform pg_temp.expect_error(format($f$select public.set_commitment_limit('or-n-0007', %L, '2026-10-01', 0, 40)$f$, pg_temp.id('cris_ctx')),
    'sem_permissao');
  -- A permissão vem antes do formato.
  perform pg_temp.expect_error(format($f$select public.set_category_budget('or-n-0008', %L, 'Salário', '2026-10-15', 0, 100000)$f$,
    pg_temp.id('cris_ctx')), 'sem_permissao');
  -- Formato: mês no dia 1, depois a categoria.
  perform pg_temp.expect_error(format($f$select public.set_category_budget('or-n-0009', %L, 'Mercado', null, 0, 100000)$f$, ctx), 'mes_invalido');
  perform pg_temp.expect_error(format($f$select public.set_category_budget('or-n-0010', %L, 'Mercado', '2026-10-15', 0, 100000)$f$, ctx),
    'mes_invalido');
  perform pg_temp.expect_error(format($f$select public.set_category_budget('or-n-0011', %L, 'Salário', '2026-10-15', 0, 100000)$f$, ctx),
    'mes_invalido');
  perform pg_temp.expect_error(format($f$select public.set_category_budget('or-n-0012', %L, 'Salário', '2026-10-01', 0, 100000)$f$, ctx),
    'categoria_invalida');
  perform pg_temp.expect_error(format($f$select public.set_category_budget('or-n-0013', %L, 'Sem categoria', '2026-10-01', 0, 100000)$f$, ctx),
    'categoria_invalida');
  perform pg_temp.expect_error(format($f$select public.set_category_budget('or-n-0014', %L, null, '2026-10-01', 0, 100000)$f$, ctx),
    'categoria_invalida');
  perform pg_temp.expect_error(format($f$select public.set_category_budget('or-n-0015', %L, 'mercado', '2026-10-01', 0, 100000)$f$, ctx),
    'categoria_invalida');
  perform pg_temp.expect_error(format($f$select public.set_commitment_limit('or-n-0016', %L, '2026-10-15', 0, 40)$f$, ctx), 'mes_invalido');
  perform pg_temp.expect_error(format($f$select public.set_commitment_limit('or-n-0017', %L, null, 0, 40)$f$, ctx), 'mes_invalido');
  perform pg_temp.expect_error(format($f$select * from public.month_budget(%L, null)$f$, ctx), 'mes_invalido');
  perform pg_temp.expect_error(format($f$select * from public.month_budget(%L, '2026-10-15')$f$, pg_temp.id('cris_ctx')), 'mes_invalido');
  perform pg_temp.expect_error(format($f$select * from public.month_budget(%L, '2026-10-01')$f$, pg_temp.id('cris_ctx')), 'sem_permissao');

  -- Intervalo do mês de início (de 10/2024 a 10/2027), valor e percentual.
  perform pg_temp.expect_error(format($f$select public.set_category_budget('or-n-0018', %L, 'Mercado', '2024-09-01', 0, 100000)$f$, ctx),
    'vigencia_fora_do_intervalo');
  perform pg_temp.expect_error(format($f$select public.set_category_budget('or-n-0019', %L, 'Mercado', '2027-11-01', 0, 100000)$f$, ctx),
    'vigencia_fora_do_intervalo');
  perform pg_temp.expect_error(format($f$select public.set_category_budget('or-n-0020', %L, 'Mercado', '2026-10-01', 0, 99)$f$, ctx),
    'valor_invalido');
  perform pg_temp.expect_error(format($f$select public.set_category_budget('or-n-0021', %L, 'Mercado', '2026-10-01', 0, 0)$f$, ctx),
    'valor_invalido');
  perform pg_temp.expect_error(format($f$select public.set_category_budget('or-n-0022', %L, 'Mercado', '2026-10-01', 0, -100)$f$, ctx),
    'valor_invalido');
  perform pg_temp.expect_error(format($f$select public.set_category_budget('or-n-0023', %L, 'Mercado', '2026-10-01', 0, 1000000000)$f$, ctx),
    'valor_acima_do_limite');
  -- Ordem: intervalo antes do valor.
  perform pg_temp.expect_error(format($f$select public.set_category_budget('or-n-0024', %L, 'Mercado', '2027-11-01', 0, 0)$f$, ctx),
    'vigencia_fora_do_intervalo');
  perform pg_temp.expect_error(format($f$select public.set_commitment_limit('or-n-0025', %L, '2024-09-01', 0, 40)$f$, ctx),
    'vigencia_fora_do_intervalo');
  perform pg_temp.expect_error(format($f$select public.set_commitment_limit('or-n-0026', %L, '2027-11-01', 0, 40)$f$, ctx),
    'vigencia_fora_do_intervalo');
  perform pg_temp.expect_error(format($f$select public.set_commitment_limit('or-n-0027', %L, '2026-10-01', 0, 9)$f$, ctx), 'percentual_invalido');
  perform pg_temp.expect_error(format($f$select public.set_commitment_limit('or-n-0028', %L, '2026-10-01', 0, 101)$f$, ctx), 'percentual_invalido');
  perform pg_temp.expect_error(format($f$select public.set_commitment_limit('or-n-0029', %L, '2026-10-01', 0, 0)$f$, ctx), 'percentual_invalido');
  perform pg_temp.expect_error(format($f$select public.set_commitment_limit('or-n-0031', %L, '2027-11-01', 0, 9)$f$, ctx),
    'vigencia_fora_do_intervalo');
  perform pg_temp.expect_error(format($f$select public.set_commitment_limit('or-n-0032', %L, '2027-11-01', 0, null)$f$, ctx),
    'vigencia_fora_do_intervalo');
  perform pg_temp.expect_error(format($f$select public.set_commitment_limit('or-n-0033', %L, '2026-10-15', 0, null)$f$, ctx), 'mes_invalido');
  assert (select count(*) from public.record_operations where idempotency_key like 'or-n-00%') = 0, 'recusas não gravam operação';
  assert (select count(*) from public.category_budgets) = 0 and (select count(*) from public.commitment_limits) = 0, 'recusas não gravam linha';

  -- Limites aceitos: 24 meses antes e 12 meses depois do mês de hoje; R$ 1,00 e R$ 9.999.999,99; "sem valor" (tirar); 10% e 100%.
  res := public.set_category_budget('or-n-0040', ctx, 'Mercado', '2024-10-01', 0, 100);
  assert res ->> 'from_month' = '2024-10-01' and (res ->> 'amount_cents')::bigint = 100 and (res ->> 'version')::int = 1, 'limite inferior e R$ 1,00';
  perform public.delete_category_budget('or-n-0041', (res ->> 'id')::uuid, 1);
  res := public.set_category_budget('or-n-0042', ctx, 'Mercado', '2027-10-01', 0, 999999999);
  assert res ->> 'from_month' = '2027-10-01' and (res ->> 'amount_cents')::bigint = 999999999, 'limite superior e R$ 9.999.999,99';
  perform public.delete_category_budget('or-n-0043', (res ->> 'id')::uuid, 1);
  res := public.set_category_budget('or-n-0044', ctx, 'Lazer', '2026-11-01', 0, null);
  assert res -> 'amount_cents' = 'null'::jsonb and (res ->> 'version')::int = 1, 'valor nulo grava a linha que encerra a vigência';
  perform public.delete_category_budget('or-n-0045', (res ->> 'id')::uuid, 1);
  res := public.set_commitment_limit('or-n-0046', ctx, '2024-10-01', 0, 10);
  assert (res ->> 'percent')::int = 10 and res ->> 'from_month' = '2024-10-01', 'limite de 10%';
  perform public.delete_commitment_limit('or-n-0047', (res ->> 'id')::uuid, 1);
  res := public.set_commitment_limit('or-n-0048', ctx, '2027-10-01', 0, 100);
  assert (res ->> 'percent')::int = 100 and res ->> 'from_month' = '2027-10-01', 'limite de 100%';
  perform public.delete_commitment_limit('or-n-0049', (res ->> 'id')::uuid, 1);
  -- Percentual nulo grava a linha que encerra a vigência do limite ("Tirar o limite a partir de novembro").
  res := public.set_commitment_limit('or-n-0057', ctx, '2026-11-01', 0, null);
  assert res -> 'percent' = 'null'::jsonb and (res ->> 'version')::int = 1, 'percentual nulo grava a linha que encerra a vigência';
  assert public.set_commitment_limit('or-n-0057', ctx, '2026-11-01', 0, null) = res, 'repetição da linha sem percentual';
  perform pg_temp.expect_error(format($f$select public.set_commitment_limit('or-n-0057', %L, '2026-11-01', 0, 40)$f$, ctx), 'chave_reutilizada');
  res := public.set_commitment_limit('or-n-0058', ctx, '2026-11-01', 1, 40);
  assert res ->> 'percent' = '40' and (res ->> 'version')::int = 2, 'um percentual volta a valer na linha encerrada';
  res := public.set_commitment_limit('or-n-0059', ctx, '2026-11-01', 2, null);
  assert res -> 'percent' = 'null'::jsonb and (res ->> 'version')::int = 3, 'e a linha volta a encerrar';
  perform public.delete_commitment_limit('or-n-0060', (res ->> 'id')::uuid, 3);
  assert (select count(*) from public.category_budgets) = 0 and (select count(*) from public.commitment_limits) = 0, 'limites desfeitos';

  -- O intervalo acompanha o hoje da pessoa (29/02/2028: de fevereiro de 2026 a fevereiro de 2029).
  perform pg_temp.today('2028-02-29');
  perform pg_temp.expect_error(format($f$select public.set_category_budget('or-n-0050', %L, 'Mercado', '2026-01-01', 0, 100000)$f$, ctx),
    'vigencia_fora_do_intervalo');
  perform pg_temp.expect_error(format($f$select public.set_category_budget('or-n-0051', %L, 'Mercado', '2029-03-01', 0, 100000)$f$, ctx),
    'vigencia_fora_do_intervalo');
  perform pg_temp.expect_error(format($f$select public.set_commitment_limit('or-n-0052', %L, '2026-01-01', 0, 40)$f$, ctx), 'vigencia_fora_do_intervalo');
  res := public.set_category_budget('or-n-0053', ctx, 'Mercado', '2029-02-01', 0, 100000);
  perform public.delete_category_budget('or-n-0054', (res ->> 'id')::uuid, 1);
  res := public.set_category_budget('or-n-0055', ctx, 'Mercado', '2026-02-01', 0, 100000);
  perform public.delete_category_budget('or-n-0056', (res ->> 'id')::uuid, 1);
  perform pg_temp.today('2026-10-07');
end $$;

-- ---------------------------------------------------------------------------
-- 3. Repetição, hash e versão (Ivo, hoje 07/10/2026).
-- ---------------------------------------------------------------------------
do $$
declare
  ctx uuid := pg_temp.id('ivo_ctx');
  r1 jsonb;
  r2 jsonb;
  b uuid;
  l uuid;
  cid uuid;
begin
  perform pg_temp.as_('ivo');
  r1 := public.set_category_budget('or-n-0101', ctx, 'Mercado', '2026-10-01', 0, 180000);
  b := (r1 ->> 'id')::uuid;
  assert (select array_agg(k order by k) from jsonb_object_keys(r1) k)
    = array['amount_cents', 'category', 'context_id', 'created_at', 'created_by', 'deleted_at', 'deleted_by', 'from_month', 'id',
            'updated_at', 'version'], 'retorno: a linha de category_budgets';
  assert r1 ->> 'context_id' = ctx::text and r1 ->> 'category' = 'Mercado' and r1 ->> 'from_month' = '2026-10-01'
     and (r1 ->> 'amount_cents')::bigint = 180000 and r1 ->> 'created_by' = auth.uid()::text and (r1 ->> 'version')::int = 1
     and r1 -> 'deleted_at' = 'null'::jsonb and r1 -> 'deleted_by' = 'null'::jsonb, 'orçamento criado com versão 1';

  -- Mesma chave e mesmo pedido: o mesmo resultado, sem linha nova.
  r2 := public.set_category_budget('or-n-0101', ctx, 'Mercado', '2026-10-01', 0, 180000);
  assert r2 = r1, 'repetição devolve o mesmo resultado';
  assert (select count(*) from public.category_budgets) = 1
     and (select count(*) from public.record_operations where idempotency_key = 'or-n-0101') = 1, 'repetição não grava nada';
  -- Hash em JSON (D-021, regra 7) e alvo da operação.
  assert (select (action, request_hash, target_id, record_id, commitment_id, context_id) from public.record_operations
           where idempotency_key = 'or-n-0101')
       is not distinct from ('definir_orcamento_categoria'::text,
          md5(format('["definir_orcamento_categoria", "%s", "Mercado", "2026-10-01", 0, 180000]', ctx)), b, null::uuid, null::uuid, ctx),
    'hash md5 de jsonb_build_array(ação, argumentos)::text e alvo em target_id';

  -- Mesma chave com outro pedido ou outra ação: chave_reutilizada (nos dois sentidos).
  perform pg_temp.expect_error(format($f$select public.set_category_budget('or-n-0101', %L, 'Mercado', '2026-10-01', 0, 180001)$f$, ctx),
    'chave_reutilizada');
  perform pg_temp.expect_error(format($f$select public.set_category_budget('or-n-0101', %L, 'Lazer', '2026-10-01', 0, 180000)$f$, ctx),
    'chave_reutilizada');
  perform pg_temp.expect_error(format($f$select public.set_category_budget('or-n-0101', %L, 'Mercado', '2026-11-01', 0, 180000)$f$, ctx),
    'chave_reutilizada');
  perform pg_temp.expect_error(format($f$select public.delete_category_budget('or-n-0101', %L, 1)$f$, b), 'chave_reutilizada');
  perform pg_temp.expect_error(format($f$select public.set_commitment_limit('or-n-0101', %L, '2026-10-01', 0, 40)$f$, ctx), 'chave_reutilizada');
  perform pg_temp.expect_error(format($f$select public.create_commitment('or-n-0101', %L, 1000, '2026-10-30', 'Feira')$f$, ctx),
    'chave_reutilizada');
  cid := (public.create_commitment('or-n-0102', ctx, 1000, '2026-10-30', 'Feira') #>> '{commitment,id}')::uuid;
  perform pg_temp.expect_error(format($f$select public.set_category_budget('or-n-0102', %L, 'Mercado', '2026-10-01', 0, 180000)$f$, ctx),
    'chave_reutilizada');
  perform public.delete_commitment('or-n-0103', cid, 1);

  -- Valor inválido é recusado sem gastar a chave; com valor certo, a mesma chave cria.
  perform pg_temp.expect_error(format($f$select public.set_category_budget('or-n-0104', %L, 'Lazer', '2026-11-01', 0, 99)$f$, ctx), 'valor_invalido');
  assert not exists (select 1 from public.record_operations where idempotency_key = 'or-n-0104'), 'recusa não gasta a chave';
  r2 := public.set_category_budget('or-n-0104', ctx, 'Lazer', '2026-11-01', 0, 30000);
  assert (r2 ->> 'version')::int = 1 and r2 ->> 'from_month' = '2026-11-01', 'mesma chave depois da recusa';

  -- Alterar com a versão: +1, valor novo, mesma linha; também para nulo ("Tirar o orçamento") e de volta.
  r2 := public.set_category_budget('or-n-0105', ctx, 'Mercado', '2026-10-01', 1, 190000);
  assert (r2 ->> 'id')::uuid = b and (r2 ->> 'version')::int = 2 and (r2 ->> 'amount_cents')::bigint = 190000
     and r2 ->> 'created_by' = auth.uid()::text, 'alteração com versão';
  assert (select count(*) from public.category_budgets) = 2, 'alterar não cria linha';
  r2 := public.set_category_budget('or-n-0106', ctx, 'Mercado', '2026-10-01', 2, null);
  assert (r2 ->> 'version')::int = 3 and r2 -> 'amount_cents' = 'null'::jsonb, 'alterar para "sem valor"';
  r2 := public.set_category_budget('or-n-0107', ctx, 'Mercado', '2026-10-01', 3, 180000);
  assert (r2 ->> 'version')::int = 4 and (r2 ->> 'amount_cents')::bigint = 180000, 'e de volta ao valor';
  -- Repetição antiga devolve a linha atual.
  r2 := public.set_category_budget('or-n-0101', ctx, 'Mercado', '2026-10-01', 0, 180000);
  assert (r2 ->> 'version')::int = 4 and (r2 ->> 'amount_cents')::bigint = 180000, 'repetição devolve o estado atual';

  -- Versão: criar de novo no mesmo mês, versão antiga, nula; mês sem linha com versão maior que 0 ou nula. A versão é conferida
  -- antes do intervalo do mês e do valor, e depois da categoria.
  perform pg_temp.expect_stale(format($f$select public.set_category_budget('or-n-0108', %L, 'Mercado', '2026-10-01', 0, 180000)$f$, ctx), 'versao_atual=4');
  perform pg_temp.expect_stale(format($f$select public.set_category_budget('or-n-0109', %L, 'Mercado', '2026-10-01', 1, 180000)$f$, ctx), 'versao_atual=4');
  perform pg_temp.expect_stale(format($f$select public.set_category_budget('or-n-0110', %L, 'Mercado', '2026-10-01', null, 180000)$f$, ctx), 'versao_atual=4');
  perform pg_temp.expect_stale(format($f$select public.set_category_budget('or-n-0111', %L, 'Mercado', '2026-10-01', 5, 180000)$f$, ctx), 'versao_atual=4');
  perform pg_temp.expect_stale(format($f$select public.set_category_budget('or-n-0112', %L, 'Mercado', '2026-12-01', 1, 180000)$f$, ctx), 'versao_atual=0');
  perform pg_temp.expect_stale(format($f$select public.set_category_budget('or-n-0113', %L, 'Mercado', '2026-12-01', null, 180000)$f$, ctx), 'versao_atual=0');
  perform pg_temp.expect_stale(format($f$select public.set_category_budget('or-n-0114', %L, 'Mercado', '2020-01-01', 2, 0)$f$, ctx), 'versao_atual=0');
  perform pg_temp.expect_stale(format($f$select public.set_category_budget('or-n-0115', %L, 'Mercado', '2026-10-01', 0, 0)$f$, ctx), 'versao_atual=4');
  -- A mesma categoria em outro mês e outra categoria no mesmo mês são linhas diferentes (versão 0).
  perform pg_temp.expect_stale(format($f$select public.set_category_budget('or-n-0116', %L, 'Lazer', '2026-10-01', 4, 1000)$f$, ctx), 'versao_atual=0');

  -- Excluir: versão antiga ou nula recusada; com a versão, exclusão lógica (+1). Repetição devolve a linha excluída.
  perform pg_temp.expect_stale(format($f$select public.delete_category_budget('or-n-0120', %L, 1)$f$, b), 'versao_atual=4');
  perform pg_temp.expect_stale(format($f$select public.delete_category_budget('or-n-0121', %L, null)$f$, b), 'versao_atual=4');
  perform pg_temp.expect_error($f$select public.delete_category_budget('or-n-0122', gen_random_uuid(), 1)$f$, 'nao_encontrado');
  r1 := public.delete_category_budget('or-n-0123', b, 4);
  assert (r1 ->> 'id')::uuid = b and (r1 ->> 'version')::int = 5 and r1 ->> 'deleted_at' is not null
     and r1 ->> 'deleted_by' = auth.uid()::text and (r1 ->> 'amount_cents')::bigint = 180000, 'exclusão lógica com versão';
  assert public.delete_category_budget('or-n-0123', b, 4) = r1, 'repetição da exclusão';
  r2 := public.set_category_budget('or-n-0101', ctx, 'Mercado', '2026-10-01', 0, 180000);
  assert r2 = r1, 'repetição da criação devolve a linha já excluída';
  assert not exists (select 1 from public.category_budgets where id = b), 'a excluída some da leitura';
  perform pg_temp.expect_error(format($f$select public.delete_category_budget('or-n-0124', %L, 5)$f$, b), 'nao_encontrado');
  -- Excluída não bloqueia o mês: uma linha nova (versão 0) na mesma categoria e mês.
  r2 := public.set_category_budget('or-n-0125', ctx, 'Mercado', '2026-10-01', 0, 170000);
  assert (r2 ->> 'version')::int = 1 and (r2 ->> 'id')::uuid <> b, 'linha nova no mês da excluída';
  perform public.delete_category_budget('or-n-0126', (r2 ->> 'id')::uuid, 1);
  perform public.delete_category_budget('or-n-0127', (select id from public.category_budgets where category = 'Lazer'), 1);
  assert (select count(*) from public.category_budgets) = 0, 'orçamentos desfeitos';

  -- Limite: criar, repetir, alterar, versões, excluir.
  r1 := public.set_commitment_limit('or-n-0201', ctx, '2026-10-01', 0, 60);
  l := (r1 ->> 'id')::uuid;
  assert (select array_agg(k order by k) from jsonb_object_keys(r1) k)
    = array['context_id', 'created_at', 'created_by', 'deleted_at', 'deleted_by', 'from_month', 'id', 'percent', 'updated_at', 'version'],
    'retorno: a linha de commitment_limits';
  assert (r1 ->> 'percent')::int = 60 and r1 ->> 'from_month' = '2026-10-01' and (r1 ->> 'version')::int = 1, 'limite criado';
  assert public.set_commitment_limit('or-n-0201', ctx, '2026-10-01', 0, 60) = r1, 'repetição do limite';
  assert (select request_hash from public.record_operations where idempotency_key = 'or-n-0201')
       = md5(format('["definir_limite_comprometimento", "%s", "2026-10-01", 0, 60]', ctx)), 'hash de definir_limite_comprometimento';
  perform pg_temp.expect_error(format($f$select public.set_commitment_limit('or-n-0201', %L, '2026-10-01', 0, 61)$f$, ctx), 'chave_reutilizada');
  perform pg_temp.expect_error(format($f$select public.delete_commitment_limit('or-n-0201', %L, 1)$f$, l), 'chave_reutilizada');
  perform pg_temp.expect_stale(format($f$select public.set_commitment_limit('or-n-0202', %L, '2026-10-01', 0, 50)$f$, ctx), 'versao_atual=1');
  perform pg_temp.expect_stale(format($f$select public.set_commitment_limit('or-n-0203', %L, '2026-10-01', null, 50)$f$, ctx), 'versao_atual=1');
  perform pg_temp.expect_stale(format($f$select public.set_commitment_limit('or-n-0204', %L, '2026-11-01', 1, 50)$f$, ctx), 'versao_atual=0');
  perform pg_temp.expect_stale(format($f$select public.set_commitment_limit('or-n-0205', %L, '2026-10-01', 0, 5)$f$, ctx), 'versao_atual=1');
  r2 := public.set_commitment_limit('or-n-0206', ctx, '2026-10-01', 1, 55);
  assert (r2 ->> 'id')::uuid = l and (r2 ->> 'version')::int = 2 and (r2 ->> 'percent')::int = 55, 'limite alterado';
  assert (public.set_commitment_limit('or-n-0201', ctx, '2026-10-01', 0, 60) ->> 'percent')::int = 55, 'repetição devolve o estado atual';
  perform pg_temp.expect_stale(format($f$select public.delete_commitment_limit('or-n-0207', %L, 1)$f$, l), 'versao_atual=2');
  perform pg_temp.expect_stale(format($f$select public.delete_commitment_limit('or-n-0208', %L, null)$f$, l), 'versao_atual=2');
  perform pg_temp.expect_error($f$select public.delete_commitment_limit('or-n-0209', gen_random_uuid(), 1)$f$, 'nao_encontrado');
  r1 := public.delete_commitment_limit('or-n-0210', l, 2);
  assert (r1 ->> 'version')::int = 3 and r1 ->> 'deleted_at' is not null and r1 ->> 'deleted_by' = auth.uid()::text, 'limite excluído';
  assert public.delete_commitment_limit('or-n-0210', l, 2) = r1, 'repetição da exclusão do limite';
  perform pg_temp.expect_error(format($f$select public.delete_commitment_limit('or-n-0211', %L, 3)$f$, l), 'nao_encontrado');
  assert (select count(*) from public.commitment_limits) = 0, 'limite excluído some da leitura';
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 4. Montagem da Cris (hoje 07/10/2026): gastos, uma conta paga e um cartão com compras, estornos e encargo.
-- ---------------------------------------------------------------------------
set role authenticated;
do $$
declare
  ctx uuid := pg_temp.id('cris_ctx');
  acc uuid := pg_temp.id('cris_acc');
  res jsonb;
  card uuid;
  cid uuid;
begin
  perform pg_temp.as_('cris');
  perform public.create_record('or-c-0001', ctx, acc, 'receita', 600000, '2026-10-01', 'Salário', 'Salário');
  perform public.create_record('or-c-0002', ctx, acc, 'despesa', 41230, '2026-10-02', 'Feira', 'Mercado');
  perform public.create_record('or-c-0003', ctx, acc, 'despesa', 5000, '2026-10-02', 'Sem categoria', null);
  -- Um recebimento com o nome de uma categoria de gasto nunca conta no orçamento.
  perform public.create_record('or-c-0004', ctx, acc, 'receita', 50000, '2026-10-03', 'Reembolso do mercado', 'Mercado');
  perform public.create_record('or-c-0005', ctx, acc, 'despesa', 1000, '2026-09-30', 'Pão', 'Mercado');
  -- Aluguel pago pela conta a pagar: o gasto da conta conta na categoria dela.
  cid := (public.create_commitment('or-c-0010', ctx, 250000, '2026-10-05', 'Aluguel', 'Moradia') #>> '{commitment,id}')::uuid;
  perform public.pay_commitment('or-c-0011', cid, 1, acc, 250000, '2026-10-05', 'Moradia');
  perform pg_temp.check_links();

  -- Cartão (fecha dia 3, vence dia 10), como na demonstração.
  res := public.create_card('or-c-0020', ctx, 'Cartão Exemplo', '1234', 3, 10, 500000);
  card := (res #>> '{card,id}')::uuid;
  insert into ids values ('card', card);
  -- Compra de 30/09: a fatura natural é a de outubro (fecha em 03/10), mas a 1ª parcela conta em setembro (mês da compra).
  perform public.add_card_purchase('or-c-0021', card, '2026-09-30', 12000, 2, 'Geladeira', 'Mercado');
  perform public.add_card_purchase('or-c-0022', card, '2026-10-05', 90000, 3, 'Show', 'Lazer');
  -- 10001 em 3 vezes: 33,35 + 33,33 + 33,33 (o resto de centavos na primeira).
  perform public.add_card_purchase('or-c-0023', card, '2026-10-05', 10001, 3, 'Jogos', 'Lazer');
  perform public.add_card_purchase('or-c-0024', card, '2026-10-06', 5000, 1, 'Sem categoria no cartão', null);
  perform public.add_card_refund('or-c-0025', card, '2026-11-01', 4000, 'Devolução', 'Lazer');
  perform public.add_card_charge('or-c-0026', card, '2026-11-01', 'juros', 1500);
  -- Estorno maior que o gasto: o usado da categoria nunca fica abaixo de zero.
  perform public.add_card_refund('or-c-0027', card, '2026-12-01', 50000, 'Estorno grande', 'Lazer');
  perform pg_temp.check_links();
  -- A data futura (01/11, hoje é 07/10) continua recusada para o gasto.
  perform pg_temp.expect_error(format($f$select public.create_record('or-c-0006', %L, %L, 'despesa', 9900, '2026-11-01', 'Futuro', 'Mercado')$f$,
    ctx, acc), 'data_futura');
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 5. Orçamento vigente e usado no mês (Cris), igual ao core: competência, parcelas pelo mês da compra, estornos, exclusões.
-- Os números repetem os do teste do core (packages/core/test/budget.test.ts) para a mesma montagem.
-- ---------------------------------------------------------------------------
set role authenticated;
do $$
declare
  ctx uuid := pg_temp.id('cris_ctx');
  card uuid := pg_temp.id('card');
  untouched_before text;
  totals_before bigint[];
  committed_before text;
begin
  perform pg_temp.as_('cris');
  assert pg_temp.totals('cris_ctx', '2026-10-01') = '{650000,296230,353770}', 'Recebido 6.500,00 e Pago 2.962,30 (gastos e o aluguel)';
  assert pg_temp.committed('cris_ctx', '2026-10-01') = '256000 - -', 'comprometido de outubro: o aluguel e a fatura de outubro (sem referência)';
  assert (select count(*) from public.month_budget(ctx, '2026-10-01')) = 6, 'sempre seis linhas';

  -- Sem nenhum orçamento: o usado já aparece (sem dado de exemplo), sem valor de orçamento.
  assert pg_temp.mb('cris_ctx', '2026-10-01', 'Mercado') = '-@- 47230', 'Mercado: 472,30 em outubro (a feira e a 2ª parcela da geladeira)';
  assert pg_temp.mb('cris_ctx', '2026-09-01', 'Mercado') = '-@- 7000', 'Mercado em setembro: 70,00 (o pão e a 1ª parcela da geladeira)';
  assert pg_temp.mb('cris_ctx', '2026-10-01', 'Moradia') = '-@- 250000', 'o gasto da conta paga conta na categoria dela';
  assert pg_temp.mb('cris_ctx', '2026-10-01', 'Lazer') = '-@- 33335', 'Lazer em outubro: 1ª parcela do show (300,00) e dos jogos (33,35)';
  assert pg_temp.mb('cris_ctx', '2026-11-01', 'Lazer') = '-@- 29333', 'Lazer em novembro: 2ª parcela do show e dos jogos, menos o estorno de 40,00';
  assert pg_temp.mb('cris_ctx', '2026-12-01', 'Lazer') = '-@- 0', 'Lazer em dezembro: o estorno maior que o gasto deixa zero, nunca negativo';
  assert pg_temp.mb('cris_ctx', '2027-01-01', 'Lazer') = '-@- 0', 'depois da 3ª parcela, nada';
  assert pg_temp.mb('cris_ctx', '2026-11-01', 'Mercado') = '-@- 0', 'a compra de 30/09 não vai para novembro (mês da fatura)';
  assert pg_temp.mb('cris_ctx', '2026-10-01', 'Transporte') = '-@- 0', 'categoria sem gasto';

  untouched_before := pg_temp.untouched();
  totals_before := pg_temp.totals('cris_ctx', '2026-10-01');
  committed_before := pg_temp.committed('cris_ctx', '2026-10-01');

  -- Os orçamentos de Cris: Mercado desde setembro, Moradia e Lazer desde outubro.
  perform public.set_category_budget('or-c-0101', ctx, 'Mercado', '2026-09-01', 0, 100000);
  perform public.set_category_budget('or-c-0102', ctx, 'Moradia', '2026-10-01', 0, 250000);
  perform public.set_category_budget('or-c-0103', ctx, 'Lazer', '2026-10-01', 0, 30000);
  assert pg_temp.mb('cris_ctx', '2026-08-01', 'Mercado') = '-@- 0', 'antes da vigência, sem orçamento';
  assert pg_temp.mb('cris_ctx', '2026-09-01', 'Mercado') = '100000@2026-09 7000', 'setembro: 70,00 de 1.000,00';
  assert pg_temp.mb('cris_ctx', '2026-10-01', 'Mercado') = '100000@2026-09 47230', 'a vigência de setembro continua em outubro';
  assert pg_temp.mb('cris_ctx', '2026-10-01', 'Moradia') = '250000@2026-10 250000', 'Moradia: 2.500,00 de 2.500,00';
  assert pg_temp.mb('cris_ctx', '2026-09-01', 'Moradia') = '-@- 0', 'Moradia não vale em setembro';
  assert pg_temp.mb('cris_ctx', '2026-10-01', 'Lazer') = '30000@2026-10 33335', 'Lazer: 333,35 de 300,00';
  assert pg_temp.mb('cris_ctx', '2026-11-01', 'Lazer') = '30000@2026-10 29333', 'novembro: 293,33';
  assert pg_temp.mb('cris_ctx', '2026-12-01', 'Lazer') = '30000@2026-10 0', 'dezembro: zero';
  assert (select budget_version from public.month_budget(ctx, '2026-10-01') where category = 'Lazer') = 1
     and (select budget_id from public.month_budget(ctx, '2026-10-01') where category = 'Lazer')
       = (select id from public.category_budgets where category = 'Lazer'), 'a linha vigente vem com id e versão';
  assert (select budget_id from public.month_budget(ctx, '2026-10-01') where category = 'Transporte') is null, 'sem linha vigente, nulos';

  -- Vigência: um valor novo a partir de dezembro não reescreve meses anteriores.
  perform public.set_category_budget('or-c-0104', ctx, 'Mercado', '2026-12-01', 0, 150000);
  assert pg_temp.mb('cris_ctx', '2026-11-01', 'Mercado') = '100000@2026-09 0', 'novembro mantém o valor de setembro';
  assert pg_temp.mb('cris_ctx', '2026-12-01', 'Mercado') = '150000@2026-12 0', 'dezembro usa o novo valor';
  assert pg_temp.mb('cris_ctx', '2027-06-01', 'Mercado') = '150000@2026-12 0', 'e continua depois';
  -- Mudar o valor do mês antigo (setembro) não muda dezembro nem meses anteriores a setembro.
  perform public.set_category_budget('or-c-0105', ctx, 'Mercado', '2026-09-01', 1, 90000);
  assert pg_temp.mb('cris_ctx', '2026-10-01', 'Mercado') = '90000@2026-09 47230', 'outubro acompanha a linha de setembro';
  assert pg_temp.mb('cris_ctx', '2026-12-01', 'Mercado') = '150000@2026-12 0', 'dezembro não muda';
  assert pg_temp.mb('cris_ctx', '2026-08-01', 'Mercado') = '-@- 0', 'agosto continua sem orçamento';

  -- "Tirar o orçamento a partir de novembro": linha sem valor, que encerra a vigência (budget_from mostra o mês dela).
  perform public.set_category_budget('or-c-0106', ctx, 'Lazer', '2026-11-01', 0, null);
  assert pg_temp.mb('cris_ctx', '2026-10-01', 'Lazer') = '30000@2026-10 33335', 'outubro continua como era';
  assert pg_temp.mb('cris_ctx', '2026-11-01', 'Lazer') = '-@2026-11 29333', 'novembro sem orçamento, mas com o uso';
  assert pg_temp.mb('cris_ctx', '2027-03-01', 'Lazer') = '-@2026-11 0', 'e depois';
  -- Um orçamento novo depois do encerramento volta a valer.
  perform public.set_category_budget('or-c-0107', ctx, 'Lazer', '2027-01-01', 0, 20000);
  assert pg_temp.mb('cris_ctx', '2026-12-01', 'Lazer') = '-@2026-11 0', 'dezembro continua encerrado';
  assert pg_temp.mb('cris_ctx', '2027-01-01', 'Lazer') = '20000@2027-01 0', 'janeiro de 2027 volta a ter orçamento';
  -- Excluir a linha que encerra: a anterior volta a valer.
  perform public.delete_category_budget('or-c-0108', (select id from public.category_budgets where category = 'Lazer' and from_month = '2026-11-01'), 1);
  assert pg_temp.mb('cris_ctx', '2026-11-01', 'Lazer') = '30000@2026-10 29333', 'a linha anterior volta a valer';
  perform public.delete_category_budget('or-c-0109', (select id from public.category_budgets where category = 'Lazer' and from_month = '2027-01-01'), 1);
  perform public.delete_category_budget('or-c-0110', (select id from public.category_budgets where category = 'Mercado' and from_month = '2026-12-01'), 1);
  assert pg_temp.mb('cris_ctx', '2026-12-01', 'Mercado') = '90000@2026-09 0', 'excluir dezembro devolve setembro';

  -- D4: nada disso mexeu em registros, contas a pagar, lançamentos de cartão, metas nem referências de renda.
  assert pg_temp.untouched() = untouched_before, 'orçamento não grava registros, contas, lançamentos, metas nem referências';
  assert pg_temp.totals('cris_ctx', '2026-10-01') = totals_before, 'Recebido, Pago e Diferença não mudam';
  assert pg_temp.committed('cris_ctx', '2026-10-01') = committed_before, 'a renda comprometida não muda';
  assert (select count(*) from public.month_to_pay(ctx, '2026-10-01')) = 1 and (select to_pay_cents from public.month_to_pay(ctx, '2026-10-01')) = 6000,
    'Ainda a pagar: só a fatura de outubro (R$ 60,00)';

  -- O usado acompanha o que é anotado e excluído (o orçamento é só a leitura).
  perform public.delete_record('or-c-0120', (select id from public.financial_records where description = 'Feira'), 1);
  assert pg_temp.mb('cris_ctx', '2026-10-01', 'Mercado') = '90000@2026-09 6000', 'excluir o gasto devolve o usado';
  perform public.create_record('or-c-0121', ctx, pg_temp.id('cris_acc'), 'despesa', 20000, '2026-10-06', 'Feira nova', 'Mercado');
  assert pg_temp.mb('cris_ctx', '2026-10-01', 'Mercado') = '90000@2026-09 26000', 'gasto novo conta no mês da data';
  perform public.update_record('or-c-0122', (select id from public.financial_records where description = 'Feira nova'), 1, pg_temp.id('cris_acc'),
    20000, '2026-09-20', 'Feira nova', 'Mercado');
  assert pg_temp.mb('cris_ctx', '2026-10-01', 'Mercado') = '90000@2026-09 6000'
     and pg_temp.mb('cris_ctx', '2026-09-01', 'Mercado') = '90000@2026-09 27000', 'mudar a data muda o mês do usado';
  perform public.update_record('or-c-0123', (select id from public.financial_records where description = 'Feira nova'), 2, pg_temp.id('cris_acc'),
    20000, '2026-09-20', 'Feira nova', 'Lazer');
  assert pg_temp.mb('cris_ctx', '2026-09-01', 'Mercado') = '90000@2026-09 7000' and pg_temp.mb('cris_ctx', '2026-09-01', 'Lazer') = '-@- 20000',
    'mudar a categoria muda de linha';
  perform public.delete_record('or-c-0124', (select id from public.financial_records where description = 'Feira nova'), 3);
  -- Excluir a compra no cartão tira todas as parcelas dos meses.
  perform public.delete_card_entry('or-c-0125', (select id from public.card_entries where description = 'Jogos' and installment_number = 1),
    (select version from public.card_entry_items where description = 'Jogos'));
  assert pg_temp.mb('cris_ctx', '2026-10-01', 'Lazer') = '30000@2026-10 30000' and pg_temp.mb('cris_ctx', '2026-11-01', 'Lazer') = '30000@2026-10 26000'
     and pg_temp.mb('cris_ctx', '2026-12-01', 'Lazer') = '30000@2026-10 0', 'sem a compra dos jogos';
  perform pg_temp.check_links();

  -- Pagamento de fatura nunca conta: é a quitação de compras já contadas, mesmo com categoria gravada à força.
  perform public.pay_invoice('or-c-0130', card, '2026-10-01', (select commitment_version from public.invoice_items where card_id = card and month = '2026-10-01'),
    6000, '2026-10-06');
  assert pg_temp.mb('cris_ctx', '2026-10-01', 'Mercado') = '90000@2026-09 6000', 'pagar a fatura não muda o usado de outubro';
  assert pg_temp.totals('cris_ctx', '2026-10-01') = '{650000,261000,389000}', 'o pagamento entra em Pago (gasto sem categoria 50,00, aluguel e fatura 60,00)';
end $$;
reset role;
-- Mesmo que o gasto do pagamento tivesse categoria (escrita direta do backend), o filtro por fatura o deixa de fora.
do $$
declare
  rid uuid := (select id from public.financial_records where card_id is not null);
  ctx uuid := pg_temp.id('cris_ctx');
begin
  perform pg_temp.check_links();
  alter table public.financial_records disable trigger user;
  update public.financial_records set category = 'Mercado' where id = rid;
  alter table public.financial_records enable trigger user;
  perform pg_temp.as_('cris');
  assert (select used_cents from public.month_budget(ctx, '2026-10-01') where category = 'Mercado') = 6000,
    'o pagamento de fatura com categoria à força continua fora do usado';
  alter table public.financial_records disable trigger user;
  update public.financial_records set category = null where id = rid;
  alter table public.financial_records enable trigger user;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Permissões na Família (Davi só lê; Elisa escreve sem "editar de outras pessoas"; Fábio e a titular alteram o dos outros) e
-- quem não pode ver o Pessoal da Cris.
-- ---------------------------------------------------------------------------
set role authenticated;
do $$
declare
  fam uuid := pg_temp.id('fam');
  res jsonb;
  p text;
begin
  -- Elisa escreve e Davi só lê.
  perform pg_temp.as_('elisa');
  res := public.set_category_budget('or-f-0001', fam, 'Mercado', '2026-10-01', 0, 200000);
  insert into ids values ('fam_mercado', (res ->> 'id')::uuid);
  res := public.set_commitment_limit('or-f-0002', fam, '2026-10-01', 0, 50);
  insert into ids values ('fam_limite', (res ->> 'id')::uuid);
  assert (select count(*) from public.category_budgets where context_id = fam) = 1, 'Elisa lê o que criou';

  perform pg_temp.as_('davi');
  assert (select count(*) from public.category_budgets where context_id = fam) = 1
     and (select count(*) from public.commitment_limits where context_id = fam) = 1, 'Davi lê o orçamento e o limite da Família';
  assert pg_temp.mb('fam', '2026-10-01', 'Mercado') = '200000@2026-10 0', 'Davi lê month_budget da Família';
  perform pg_temp.expect_error(format($f$select public.set_category_budget('or-f-0003', %L, 'Lazer', '2026-10-01', 0, 1000)$f$, fam), 'sem_permissao');
  perform pg_temp.expect_error(format($f$select public.set_commitment_limit('or-f-0004', %L, '2026-11-01', 0, 40)$f$, fam), 'sem_permissao');
  perform pg_temp.expect_error(format($f$select public.delete_category_budget('or-f-0005', %L, 1)$f$, pg_temp.id('fam_mercado')), 'sem_permissao');
  perform pg_temp.expect_error(format($f$select public.delete_commitment_limit('or-f-0006', %L, 1)$f$, pg_temp.id('fam_limite')), 'sem_permissao');
  perform pg_temp.expect_error(format($f$select public.set_category_budget('or-f-0007', %L, 'Mercado', '2026-10-01', 1, 1000)$f$, fam), 'sem_permissao');

  -- Fábio (escreve e altera o que é dos outros) altera e exclui o de Elisa; a versão continua valendo.
  perform pg_temp.as_('fabio');
  perform pg_temp.expect_stale(format($f$select public.set_category_budget('or-f-0008', %L, 'Mercado', '2026-10-01', 0, 1000)$f$, fam), 'versao_atual=1');
  res := public.set_category_budget('or-f-0009', fam, 'Mercado', '2026-10-01', 1, 210000);
  assert (res ->> 'version')::int = 2 and res ->> 'created_by' = pg_temp.id('elisa')::text, 'Fábio altera o de Elisa; a autoria fica com ela';
  res := public.set_category_budget('or-f-0010', fam, 'Lazer', '2026-10-01', 0, 40000);
  insert into ids values ('fam_lazer', (res ->> 'id')::uuid);

  -- Elisa altera o próprio, mas não o de Fábio (sem "editar de outras pessoas"); a recusa não gasta a chave.
  perform pg_temp.as_('elisa');
  res := public.set_category_budget('or-f-0011', fam, 'Mercado', '2026-10-01', 2, 215000);
  assert (res ->> 'version')::int = 3, 'Elisa altera o que criou';
  perform pg_temp.expect_error(format($f$select public.set_category_budget('or-f-0012', %L, 'Lazer', '2026-10-01', 1, 41000)$f$, fam), 'sem_permissao');
  perform pg_temp.expect_error(format($f$select public.delete_category_budget('or-f-0013', %L, 1)$f$, pg_temp.id('fam_lazer')), 'sem_permissao');
  assert not exists (select 1 from public.record_operations where idempotency_key in ('or-f-0012', 'or-f-0013')), 'recusa não grava operação';
  -- A titular exclui o de Fábio e o limite de Elisa ("editar de outras pessoas").
  perform pg_temp.as_('cris');
  perform public.delete_category_budget('or-f-0014', pg_temp.id('fam_lazer'), 1);
  res := public.set_commitment_limit('or-f-0015', fam, '2026-10-01', 1, 45);
  assert (res ->> 'percent')::int = 45 and res ->> 'created_by' = pg_temp.id('elisa')::text, 'titular altera o limite de Elisa';
  assert (select count(*) from public.category_budgets where context_id = fam) = 1, 'a titular excluiu a linha de Fábio';

  -- O Pessoal da Cris: Família, empresa e externa não leem orçamento, limite nem o usado, nem por repetição.
  perform pg_temp.as_('cris');
  perform public.set_category_budget('or-f-0020', pg_temp.id('cris_ctx'), 'Mercado', '2026-10-01', 0, 111111);
  insert into ids values ('cris_mercado', (select id from public.category_budgets where context_id = pg_temp.id('cris_ctx') and category = 'Mercado' and from_month = '2026-10-01'));
  perform public.set_commitment_limit('or-f-0021', pg_temp.id('cris_ctx'), '2026-10-01', 0, 33);
  foreach p in array array['davi', 'elisa', 'fabio', 'heitor', 'gaia'] loop
    perform pg_temp.as_(p);
    assert (select count(*) from public.category_budgets where context_id = pg_temp.id('cris_ctx')) = 0, p || ' não lê o orçamento da Cris';
    assert (select count(*) from public.commitment_limits where context_id = pg_temp.id('cris_ctx')) = 0, p || ' não lê o limite da Cris';
    perform pg_temp.expect_error(format($f$select * from public.month_budget(%L, '2026-10-01')$f$, pg_temp.id('cris_ctx')), 'sem_permissao');
    perform pg_temp.expect_error(format($f$select public.set_category_budget(%L, %L, 'Mercado', '2026-11-01', 0, 100)$f$, 'or-x-' || p, pg_temp.id('cris_ctx')),
      'sem_permissao');
    perform pg_temp.expect_error(format($f$select public.delete_category_budget(%L, %L, 1)$f$, 'or-y-' || p, pg_temp.id('cris_mercado')), 'nao_encontrado');
    perform pg_temp.expect_error(format($f$select public.delete_commitment_limit(%L, %L, 1)$f$, 'or-z-' || p,
      (select id from public.commitment_limits where context_id = pg_temp.id('cris_ctx'))), 'nao_encontrado');
  end loop;
  -- Empresa e externa também não leem a Família.
  foreach p in array array['heitor', 'gaia'] loop
    perform pg_temp.as_(p);
    assert (select count(*) from public.category_budgets where context_id = fam) = 0, p || ' não lê o orçamento da Família';
    perform pg_temp.expect_error(format($f$select * from public.month_budget(%L, '2026-10-01')$f$, fam), 'sem_permissao');
  end loop;
end $$;

-- Vínculo revogado: Elisa deixa de ler, de repetir e de excluir o que criou.
reset role;
update public.context_memberships set revoked_at = now() where context_id = (select id from ids where name = 'fam') and person_id = :elisa;
set role authenticated;
do $$
declare
  fam uuid := pg_temp.id('fam');
begin
  perform pg_temp.as_('elisa');
  assert (select count(*) from public.category_budgets) = 0 and (select count(*) from public.commitment_limits) = 0, 'revogada não lê';
  perform pg_temp.expect_error(format($f$select * from public.month_budget(%L, '2026-10-01')$f$, fam), 'sem_permissao');
  perform pg_temp.expect_error(format($f$select public.set_category_budget('or-f-0001', %L, 'Mercado', '2026-10-01', 0, 200000)$f$, fam), 'nao_encontrado');
  perform pg_temp.expect_error(format($f$select public.delete_category_budget('or-f-0030', %L, 3)$f$, pg_temp.id('fam_mercado')), 'nao_encontrado');
end $$;

-- ---------------------------------------------------------------------------
-- 7. Atividade (A4): orçamento e limite contam como anotação, como as demais escritas (Gaia, conta nova).
-- ---------------------------------------------------------------------------
do $$
declare
  ctx uuid := pg_temp.id('gaia_ctx');
begin
  perform pg_temp.as_('gaia');
  assert pg_temp.act('gaia', 'gaia_ctx') is null, 'nenhuma atividade antes';
  perform public.set_category_budget('or-a-0001', ctx, 'Saúde', '2026-10-01', 0, 30000);
  assert pg_temp.act('gaia', 'gaia_ctx') = '2026-10-07 - -', 'definir o orçamento conta como anotação';
  perform pg_temp.today('2027-01-05');
  perform public.set_commitment_limit('or-a-0002', ctx, '2027-01-01', 0, 40);
  assert pg_temp.act('gaia', 'gaia_ctx') = '2027-01-05 2026-10-07 2027-01-05', 'o limite também conta (e registra a ausência longa)';
  perform pg_temp.today('2027-01-06');
  perform public.delete_commitment_limit('or-a-0003', (select id from public.commitment_limits), 1);
  assert pg_temp.act('gaia', 'gaia_ctx') = '2027-01-06 2026-10-07 2027-01-05', 'excluir conta';
  perform public.delete_category_budget('or-a-0004', (select id from public.category_budgets), 1);
  -- Ler não é anotação: month_budget não mexe na atividade.
  perform pg_temp.today('2027-06-01');
  perform * from public.month_budget(ctx, '2027-06-01');
  assert pg_temp.act('gaia', 'gaia_ctx') = '2027-01-06 2026-10-07 2027-01-05', 'ler não conta';
  perform pg_temp.today('2026-10-07');
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 8. record_operations: as quatro ações novas apontam só para a linha (target_id); a lista vigente tem 41 ações.
-- ---------------------------------------------------------------------------
do $$
declare
  cases text[][] := array[
    array['definir_orcamento_categoria', 'r', null, 't'],
    array['definir_orcamento_categoria', null, 'c', 't'],
    array['definir_orcamento_categoria', null, null, null],
    array['excluir_orcamento_categoria', 'r', null, null],
    array['excluir_orcamento_categoria', null, 'c', null],
    array['excluir_orcamento_categoria', null, null, null],
    array['definir_limite_comprometimento', 'r', null, 't'],
    array['definir_limite_comprometimento', null, null, null],
    array['excluir_limite_comprometimento', null, 'c', 't'],
    array['excluir_limite_comprometimento', null, null, null]
  ];
  i int;
begin
  for i in 1 .. array_length(cases, 1) loop
    perform pg_temp.expect_error(format($f$insert into public.record_operations
        (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id, target_id)
      values (%L, %L, %L, %L, 'x', %s, %s, %s)$f$,
      pg_temp.id('cris'), 'or-o-1' || lpad(i::text, 3, '0'), cases[i][1], pg_temp.id('cris_ctx'),
      case when cases[i][2] is null then 'null' else 'gen_random_uuid()' end,
      case when cases[i][3] is null then 'null' else 'gen_random_uuid()' end,
      case when cases[i][4] is null then 'null' else 'gen_random_uuid()' end), '%record_operations_target_check%');
  end loop;
  perform pg_temp.expect_error(format($f$insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash)
    values (%L, 'or-o-2001', 'definir_orcamento', gen_random_uuid(), 'x')$f$, pg_temp.id('cris')), '%record_operations_action_check%');
  assert (select array_agg(m[1] order by m[1] collate "C")
            from pg_constraint c, regexp_matches(pg_get_constraintdef(c.oid), '''([a-z_]+)''::text', 'g') m
           where c.conname = 'record_operations_action_check')
    = array['alterar_cartao', 'alterar_lancamento_cartao', 'alterar_meta', 'alterar_movimento_meta', 'alterar_serie', 'criar',
            'criar_cartao', 'criar_compra_cartao', 'criar_compromisso', 'criar_encargo_cartao', 'criar_estorno_cartao',
            'criar_meta', 'criar_ocorrencia', 'criar_serie', 'decidir_revisao', 'definir_limite_comprometimento',
            'definir_orcamento_categoria', 'definir_renda_referencia', 'desfazer_pagamento', 'desfazer_pagamento_fatura', 'editar',
            'editar_compromisso', 'encerrar_serie', 'excluir', 'excluir_cartao', 'excluir_compromisso', 'excluir_lancamento_cartao',
            'excluir_limite_comprometimento', 'excluir_meta', 'excluir_movimento_meta', 'excluir_orcamento_categoria',
            'excluir_renda_referencia', 'excluir_serie', 'informar_ano', 'pagar_compromisso', 'pagar_fatura',
            'registrar_movimento_meta', 'responder_guardar', 'situacao_cartao', 'situacao_meta', 'tirar_ano'],
    'as 41 ações vigentes (com as 4 de orçamento e limite; as outras, testadas em 30 a 70)';
  assert (select count(*) from pg_constraint c, regexp_matches(pg_get_constraintdef(c.oid), '''([a-z_]+)''::text', 'g') m
           where c.conname = 'record_operations_action_check') = 41, '41 ações';
  -- Toda operação nova aponta para uma linha do mesmo contexto; a exclusão, para uma linha excluída.
  assert not exists (select 1 from public.record_operations o
                      where o.action in ('definir_orcamento_categoria', 'excluir_orcamento_categoria')
                        and not exists (select 1 from public.category_budgets b
                                         where b.id = o.target_id and b.context_id = o.context_id
                                           and (o.action = 'definir_orcamento_categoria' or b.deleted_at is not null))),
    'operações apontam para a linha do orçamento';
  assert not exists (select 1 from public.record_operations o
                      where o.action in ('definir_limite_comprometimento', 'excluir_limite_comprometimento')
                        and not exists (select 1 from public.commitment_limits l
                                         where l.id = o.target_id and l.context_id = o.context_id
                                           and (o.action = 'definir_limite_comprometimento' or l.deleted_at is not null))),
    'operações apontam para a linha do limite';
  -- D4: nenhuma função nova grava registros, contas a pagar nem lançamentos.
  assert not exists (select 1 from public.record_operations
                      where action in ('definir_orcamento_categoria', 'excluir_orcamento_categoria', 'definir_limite_comprometimento',
                                       'excluir_limite_comprometimento')
                        and (record_id is not null or commitment_id is not null or entry_id is not null)), 'sem registro, conta nem lançamento';
  -- Uma operação por escrita: as repetições e as recusas não gravam (as recusas da seção 2 usaram chaves "or-n-00").
  assert not exists (select 1 from public.record_operations where idempotency_key between 'or-n-0001' and 'or-n-0039'), 'recusas não gravam operação';
  assert (select count(*) from public.record_operations where idempotency_key = 'or-n-0101') = 1, 'repetições não gravam operação';
end $$;

-- ---------------------------------------------------------------------------
-- 9. Guardas e restrições das tabelas (escrita direta do backend; cada caso desfeito no próprio bloco).
-- ---------------------------------------------------------------------------
do $$
declare
  live uuid := (select id from public.category_budgets where category = 'Mercado' and from_month = '2026-09-01'
                   and context_id = (select id from ids where name = 'cris_ctx') and deleted_at is null);
  dead uuid := (select id from public.category_budgets where deleted_at is not null limit 1);
  ctx uuid := pg_temp.id('cris_ctx');
  lim uuid := (select id from public.commitment_limits where context_id = (select id from ids where name = 'cris_ctx'));
  dlim uuid := (select id from public.commitment_limits where deleted_at is not null limit 1);
begin
  -- Orçamento: nada de identidade muda; versão só +1; excluída não volta.
  perform pg_temp.expect_error(format('update public.category_budgets set from_month = %L, version = version + 1 where id = %L', '2026-08-01', live), 'campo_imutavel');
  perform pg_temp.expect_error(format('update public.category_budgets set category = %L, version = version + 1 where id = %L', 'Lazer', live), 'campo_imutavel');
  perform pg_temp.expect_error(format('update public.category_budgets set context_id = %L, version = version + 1 where id = %L', pg_temp.id('fam'), live), 'campo_imutavel');
  perform pg_temp.expect_error(format('update public.category_budgets set created_by = %L, version = version + 1 where id = %L', pg_temp.id('davi'), live), 'campo_imutavel');
  perform pg_temp.expect_error(format($f$update public.category_budgets set created_at = created_at - interval '1 day', version = version + 1 where id = %L$f$, live), 'campo_imutavel');
  perform pg_temp.expect_error(format('update public.category_budgets set id = gen_random_uuid(), version = version + 1 where id = %L', live), 'campo_imutavel');
  perform pg_temp.expect_error(format('update public.category_budgets set amount_cents = 1000 where id = %L', live), 'campo_imutavel');
  perform pg_temp.expect_error(format('update public.category_budgets set version = version + 2 where id = %L', live), 'campo_imutavel');
  perform pg_temp.expect_error(format('update public.category_budgets set amount_cents = 1000, version = version + 1 where id = %L', dead), 'campo_imutavel');
  perform pg_temp.expect_error(format('update public.category_budgets set deleted_at = null, deleted_by = null, version = version + 1 where id = %L', dead), 'campo_imutavel');
  -- Uma escrita válida passa pela guarda (e é desfeita).
  begin
    update public.category_budgets set amount_cents = 123400, version = version + 1 where id = live;
    assert (select (amount_cents, version) from public.category_budgets where id = live) = (123400::bigint, (select version from public.category_budgets where id = live)),
      'guarda aceita +1';
    raise exception 'desfazer';
  exception when raise_exception then
    assert sqlerrm = 'desfazer', sqlerrm;
  end;
  assert (select amount_cents from public.category_budgets where id = live) = 90000, 'desfeito';

  perform pg_temp.expect_error(format($f$insert into public.category_budgets (context_id, category, from_month, amount_cents, created_by)
    values (%L, 'Mercado', '2026-09-01', 100000, %L)$f$, ctx, pg_temp.id('cris')), '%category_budgets_one_live%');
  perform pg_temp.expect_error(format($f$insert into public.category_budgets (context_id, category, from_month, amount_cents, created_by)
    values (%L, 'Mercado', '2026-07-15', 100000, %L)$f$, ctx, pg_temp.id('cris')), '%category_budgets_mes%');
  perform pg_temp.expect_error(format($f$insert into public.category_budgets (context_id, category, from_month, amount_cents, created_by)
    values (%L, 'Salário', '2026-07-01', 100000, %L)$f$, ctx, pg_temp.id('cris')), '%category_budgets_categoria%');
  perform pg_temp.expect_error(format($f$insert into public.category_budgets (context_id, category, from_month, amount_cents, created_by)
    values (%L, 'Sem categoria', '2026-07-01', 100000, %L)$f$, ctx, pg_temp.id('cris')), '%category_budgets_categoria%');
  perform pg_temp.expect_error(format($f$insert into public.category_budgets (context_id, category, from_month, amount_cents, created_by)
    values (%L, 'Lazer', '2026-07-01', 99, %L)$f$, ctx, pg_temp.id('cris')), '%category_budgets_valor%');
  perform pg_temp.expect_error(format($f$insert into public.category_budgets (context_id, category, from_month, amount_cents, created_by)
    values (%L, 'Lazer', '2026-07-01', 0, %L)$f$, ctx, pg_temp.id('cris')), '%category_budgets_valor%');
  perform pg_temp.expect_error(format($f$insert into public.category_budgets (context_id, category, from_month, amount_cents, created_by)
    values (%L, 'Lazer', '2026-07-01', 1000000000, %L)$f$, ctx, pg_temp.id('cris')), '%category_budgets_valor%');
  perform pg_temp.expect_error(format($f$insert into public.category_budgets (context_id, category, from_month, amount_cents, created_by, deleted_at)
    values (%L, 'Lazer', '2026-07-01', 1000, %L, now())$f$, ctx, pg_temp.id('cris')), '%category_budgets_exclusao%');
  perform pg_temp.expect_error(format($f$insert into public.category_budgets (context_id, category, from_month, amount_cents, created_by)
    values (gen_random_uuid(), 'Lazer', '2026-07-01', 1000, %L)$f$, pg_temp.id('cris')), '%category_budgets_context_id_fkey%');
  -- "Sem valor" (nulo) é aceito na tabela: é a linha que encerra a vigência.
  begin
    insert into public.category_budgets (context_id, category, from_month, amount_cents, created_by)
    values (ctx, 'Lazer', '2030-01-01', null, pg_temp.id('cris'));
    raise exception 'desfazer';
  exception when raise_exception then
    assert sqlerrm = 'desfazer', sqlerrm;
  end;
  -- Excluída não bloqueia o mês (D1 só vale para as vivas).
  assert (select count(*) from public.category_budgets where context_id = ctx and category = 'Lazer' and from_month = '2026-11-01') = 1
     and (select count(*) from public.category_budgets where context_id = ctx and category = 'Lazer' and from_month = '2026-11-01' and deleted_at is null) = 0,
    'a linha excluída de novembro não bloqueia nada';

  -- Limite: mesma guarda e restrições.
  perform pg_temp.expect_error(format('update public.commitment_limits set from_month = %L, version = version + 1 where id = %L', '2026-08-01', lim), 'campo_imutavel');
  perform pg_temp.expect_error(format('update public.commitment_limits set context_id = %L, version = version + 1 where id = %L', pg_temp.id('fam'), lim), 'campo_imutavel');
  perform pg_temp.expect_error(format('update public.commitment_limits set created_by = %L, version = version + 1 where id = %L', pg_temp.id('davi'), lim), 'campo_imutavel');
  perform pg_temp.expect_error(format('update public.commitment_limits set percent = 50 where id = %L', lim), 'campo_imutavel');
  perform pg_temp.expect_error(format('update public.commitment_limits set percent = 50, version = version + 1 where id = %L', dlim), 'campo_imutavel');
  perform pg_temp.expect_error(format('update public.commitment_limits set percent = 9, version = version + 1 where id = %L', lim), '%commitment_limits_percentual%');
  perform pg_temp.expect_error(format('update public.commitment_limits set percent = 101, version = version + 1 where id = %L', lim), '%commitment_limits_percentual%');
  -- Percentual nulo (a linha que encerra a vigência) passa pela guarda e pela restrição, na alteração e na inserção (desfeitas).
  begin
    update public.commitment_limits set percent = null, version = version + 1 where id = lim;
    assert (select percent is null from public.commitment_limits where id = lim), 'a guarda aceita percentual nulo';
    raise exception 'desfazer';
  exception when raise_exception then
    assert sqlerrm = 'desfazer', sqlerrm;
  end;
  begin
    insert into public.commitment_limits (context_id, from_month, percent, created_by) values (ctx, '2026-07-01', null, pg_temp.id('cris'));
    assert (select count(*) from public.commitment_limits where context_id = ctx and from_month = '2026-07-01' and percent is null) = 1,
      'a restrição aceita percentual nulo';
    raise exception 'desfazer';
  exception when raise_exception then
    assert sqlerrm = 'desfazer', sqlerrm;
  end;
  perform pg_temp.expect_error(format($f$insert into public.commitment_limits (context_id, from_month, percent, created_by)
    values (%L, '2026-10-01', 40, %L)$f$, ctx, pg_temp.id('cris')), '%commitment_limits_one_live%');
  perform pg_temp.expect_error(format($f$insert into public.commitment_limits (context_id, from_month, percent, created_by)
    values (%L, '2026-07-15', 40, %L)$f$, ctx, pg_temp.id('cris')), '%commitment_limits_mes%');
  perform pg_temp.expect_error(format($f$insert into public.commitment_limits (context_id, from_month, percent, created_by)
    values (%L, '2026-07-01', 0, %L)$f$, ctx, pg_temp.id('cris')), '%commitment_limits_percentual%');
  perform pg_temp.expect_error(format($f$insert into public.commitment_limits (context_id, from_month, percent, created_by, deleted_at)
    values (%L, '2026-07-01', 40, %L, now())$f$, ctx, pg_temp.id('cris')), '%commitment_limits_exclusao%');
  perform pg_temp.expect_error(format($f$insert into public.commitment_limits (context_id, from_month, percent, created_by)
    values (gen_random_uuid(), '2026-07-01', 40, %L)$f$, pg_temp.id('cris')), '%commitment_limits_context_id_fkey%');
end $$;
set role authenticated;
select pg_temp.as_('cris');
select pg_temp.expect_error(format($f$insert into public.category_budgets (context_id, category, from_month, amount_cents, created_by)
  values (%L, 'Lazer', '2026-07-01', 1000, %L)$f$, pg_temp.id('cris_ctx'), pg_temp.id('cris')), 'permission denied%');
select pg_temp.expect_error(format('update public.category_budgets set amount_cents = 1000, version = version + 1 where id = %L', pg_temp.id('cris_mercado')), 'permission denied%');
select pg_temp.expect_error(format('delete from public.category_budgets where id = %L', pg_temp.id('cris_mercado')), 'permission denied%');
select pg_temp.expect_error(format($f$insert into public.commitment_limits (context_id, from_month, percent, created_by)
  values (%L, '2026-07-01', 40, %L)$f$, pg_temp.id('cris_ctx'), pg_temp.id('cris')), 'permission denied%');
select pg_temp.expect_error(format('update public.commitment_limits set percent = 50, version = version + 1 where id = %L',
  (select id from public.commitment_limits where context_id = pg_temp.id('cris_ctx'))), 'permission denied%');
select pg_temp.expect_error('delete from public.commitment_limits', 'permission denied%');
set role anon;
select pg_temp.expect_error($$select * from public.category_budgets$$, 'permission denied%');
select pg_temp.expect_error($$select * from public.commitment_limits$$, 'permission denied%');
select pg_temp.expect_error($$select * from public.month_budget(gen_random_uuid(), '2026-10-01')$$, 'permission denied%');
select pg_temp.expect_error($$select public.set_category_budget('or-anon-001', gen_random_uuid(), 'Mercado', '2026-10-01', 0, 100)$$, 'permission denied%');
select pg_temp.expect_error($$select public.set_commitment_limit('or-anon-002', gen_random_uuid(), '2026-10-01', 0, 40)$$, 'permission denied%');
reset role;

-- ---------------------------------------------------------------------------
-- 10. Privilégios e assinaturas (conferidos como superusuário).
-- ---------------------------------------------------------------------------
do $$ begin
  assert (select array_agg(p.proname::text order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and has_function_privilege('authenticated', p.oid, 'execute'))
    = array['add_card_charge', 'add_card_purchase', 'add_card_refund', 'add_goal_movement', 'context_permission', 'create_card',
            'create_commitment', 'create_goal', 'create_record', 'create_series', 'create_series_occurrence',
            'decide_return_review', 'delete_card', 'delete_card_entry', 'delete_category_budget', 'delete_commitment',
            'delete_commitment_limit', 'delete_goal', 'delete_goal_movement', 'delete_income_reference', 'delete_record',
            'delete_series', 'end_series', 'ensure_personal_space', 'inform_series_year', 'invoice_closing_on', 'invoice_due_on',
            'invoice_month_for', 'is_org_admin', 'month_budget', 'month_committed', 'month_to_pay', 'month_totals', 'months_overview',
            'my_today', 'pay_commitment', 'pay_invoice', 'set_card_status', 'set_category_budget', 'set_commitment_limit',
            'set_goal_status', 'set_income_reference', 'set_savings_answer', 'skip_series_year', 'sync_series_occurrences',
            'undo_commitment_payment', 'undo_invoice_payment', 'update_card', 'update_card_entry', 'update_commitment', 'update_goal',
            'update_goal_movement', 'update_record', 'update_series_from'],
    'authenticated executa só as 54 funções expostas (as 5 de orçamento e limite, testadas aqui)';
  assert not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                      where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')), 'anon não executa nenhuma função';
  assert not has_function_privilege('authenticated', 'public.category_budgets_guard()', 'execute')
     and not has_function_privilege('authenticated', 'public.commitment_limits_guard()', 'execute'), 'guardas sem execute';
  assert pg_get_function_arguments('public.set_category_budget(text, uuid, text, date, integer, bigint)'::regprocedure)
       = 'p_idempotency_key text, p_context_id uuid, p_category text, p_from_month date, p_expected_version integer, p_amount_cents bigint'
     and pg_get_function_arguments('public.delete_category_budget(text, uuid, integer)'::regprocedure)
       = 'p_idempotency_key text, p_id uuid, p_expected_version integer'
     and pg_get_function_arguments('public.set_commitment_limit(text, uuid, date, integer, integer)'::regprocedure)
       = 'p_idempotency_key text, p_context_id uuid, p_from_month date, p_expected_version integer, p_percent integer'
     and pg_get_function_arguments('public.delete_commitment_limit(text, uuid, integer)'::regprocedure)
       = 'p_idempotency_key text, p_id uuid, p_expected_version integer'
     and pg_get_function_arguments('public.month_budget(uuid, date)'::regprocedure) = 'p_context_id uuid, p_month date',
    'assinaturas e nomes dos argumentos (chamada por nome no PostgREST)';
  assert pg_get_function_result('public.month_budget(uuid, date)'::regprocedure)
    = 'TABLE(category text, budget_id uuid, budget_version integer, budget_from date, budget_cents bigint, used_cents bigint)',
    'colunas de month_budget';
  assert (select bool_and(pg_get_function_result(p.oid) = 'jsonb' and p.prosecdef and p.provolatile = 'v')
            from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in ('set_category_budget', 'delete_category_budget', 'set_commitment_limit', 'delete_commitment_limit'))
     and (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in ('set_category_budget', 'delete_category_budget', 'set_commitment_limit', 'delete_commitment_limit')) = 4,
    'uma assinatura cada; retorno jsonb, definer, volatile';
  assert (select prosecdef and provolatile = 's' from pg_proc where oid = 'public.month_budget(uuid, date)'::regprocedure), 'month_budget: definer e stable';
  assert (select array_agg(attname::text order by attnum) from pg_attribute
           where attrelid = 'public.category_budgets'::regclass and attnum > 0 and not attisdropped)
    = array['id', 'context_id', 'category', 'from_month', 'amount_cents', 'created_by', 'version', 'created_at', 'updated_at', 'deleted_at',
            'deleted_by'], 'colunas de category_budgets';
  assert (select array_agg(attname::text order by attnum) from pg_attribute
           where attrelid = 'public.commitment_limits'::regclass and attnum > 0 and not attisdropped)
    = array['id', 'context_id', 'from_month', 'percent', 'created_by', 'version', 'created_at', 'updated_at', 'deleted_at', 'deleted_by'],
    'colunas de commitment_limits';
  assert has_table_privilege('authenticated', 'public.category_budgets', 'select') and has_table_privilege('authenticated', 'public.commitment_limits', 'select'),
    'leitura (filtrada pela RLS)';
  assert not has_table_privilege('authenticated', 'public.category_budgets', 'insert, update, delete, truncate')
     and not has_table_privilege('authenticated', 'public.commitment_limits', 'insert, update, delete, truncate')
     and not has_any_column_privilege('authenticated', 'public.category_budgets', 'insert, update')
     and not has_any_column_privilege('authenticated', 'public.commitment_limits', 'insert, update'), 'sem escrita direta';
  assert not has_table_privilege('anon', 'public.category_budgets', 'select') and not has_table_privilege('anon', 'public.commitment_limits', 'select'), 'anon não lê';
  assert (select relrowsecurity from pg_class where oid = 'public.category_budgets'::regclass)
     and (select relrowsecurity from pg_class where oid = 'public.commitment_limits'::regclass), 'RLS ligada';
  assert exists (select 1 from pg_trigger where tgname = 'category_budgets_guard' and tgrelid = 'public.category_budgets'::regclass and not tgisinternal and tgenabled = 'O')
     and exists (select 1 from pg_trigger where tgname = 'commitment_limits_guard' and tgrelid = 'public.commitment_limits'::regclass and not tgisinternal and tgenabled = 'O'),
    'guardas ligadas';
  -- O índice do usado no mês (item 3 da revisão do F2): parcial (só as vivas), pelo contexto, o tipo e a categoria.
  assert (select indexdef from pg_indexes where schemaname = 'public' and tablename = 'card_entries' and indexname = 'card_entries_ctx_kind')
    = 'CREATE INDEX card_entries_ctx_kind ON public.card_entries USING btree (context_id, kind, category) WHERE (deleted_at IS NULL)',
    'índice card_entries_ctx_kind';
  -- As assinaturas das migrações anteriores continuam.
  assert to_regprocedure('public.set_income_reference(text, uuid, date, integer, bigint, boolean)') is not null
     and to_regprocedure('public.month_committed(uuid, date)') is not null
     and to_regprocedure('public.pay_invoice(text, uuid, date, integer, bigint, date, uuid)') is not null, 'demais assinaturas sem mudança';
end $$;

-- Vínculos coerentes no fim de tudo.
select pg_temp.check_links();

rollback;
