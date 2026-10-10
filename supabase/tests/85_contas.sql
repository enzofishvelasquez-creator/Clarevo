-- Contas cadastradas como origem do dinheiro (D-043): financial_accounts com tipo, principal, situação, versão e exclusão lógica;
-- create_account, update_account, set_default_account, set_account_status, delete_account; a conta opcional de aporte e resgate
-- de meta (goal_movements.account_id: add_goal_movement e update_goal_movement); a conta de saída em create_record, update_record,
-- pay_commitment e pay_invoice; gatilhos, restrições, record_operations e privilégios.
-- Sequência sobre contas FICTÍCIAS (Ada, hoje 07/10/2026). Tudo é só informativo: nada aqui muda Recebido, Pago, Diferença,
-- Ainda a pagar nem a renda comprometida (A7), e não existe saldo por conta (P-018).
-- Pessoas FICTÍCIAS: Ada (sequência; titular da Família da Ada), Davi (Família, só leitura), Elisa (Família, escreve sem
-- "editar de outras pessoas"), Fábio (Família, escreve e altera o que é dos outros), Gaia (externa) e Hugo (conta nova; validação,
-- repetição, versão e limites). Valores em centavos.
\set ON_ERROR_STOP 1
\set ada    '''00000000-0000-0000-0000-0000000000a5'''
\set davi   '''00000000-0000-0000-0000-0000000000d5'''
\set elisa  '''00000000-0000-0000-0000-0000000000e5'''
\set fabio  '''00000000-0000-0000-0000-0000000000f5'''
\set gaia   '''00000000-0000-0000-0000-0000000000a6'''
\set hugo   '''00000000-0000-0000-0000-0000000000c5'''

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

-- Confere agora as restrições adiadas (vínculos de contas, faturas e metas).
create function pg_temp.check_links() returns void language plpgsql as $$
begin
  set constraints all immediate;
  set constraints all deferred;
end $$;

-- Totais do mês, como a tela de Resumo lê, e o que as contas nunca podem gravar (A7).
create function pg_temp.totals(p_ctx text, p_month date) returns bigint[] language sql as $$
  select array[received_cents, paid_cents, difference_cents] from public.month_totals(pg_temp.id(p_ctx), p_month)
$$;
create function pg_temp.to_pay(p_ctx text, p_month date) returns bigint[] language sql as $$
  select array[due_in_month_cents, overdue_before_cents, to_pay_cents, open_count] from public.month_to_pay(pg_temp.id(p_ctx), p_month)
$$;
create function pg_temp.untouched() returns text language sql security definer set search_path = public, pg_temp as $$
  select format('%s %s %s %s %s', (select count(*) from public.financial_records), (select count(*) from public.commitments),
                (select count(*) from public.card_entries), (select count(*) from public.goals), (select count(*) from public.goal_movements))
$$;
create function pg_temp.records_state() returns text language sql security definer set search_path = public, pg_temp as $$
  select format('%s %s %s', (select count(*) from public.financial_records), (select count(*) from public.commitments),
                (select count(*) from public.card_entries))
$$;
-- A conta em texto: "nome|tipo|situação|principal|versão" (leitura como o app faz, com a RLS de quem consulta).
create function pg_temp.acc(p_name text) returns text language sql as $$
  select format('%s|%s|%s|%s|%s', name, kind, status, case when is_default then 'principal' else '-' end, version)
    from public.financial_accounts where id = pg_temp.id(p_name)
$$;
-- A conta em texto, sem a RLS (também a excluída): "nome|situação|principal|versão|excluída".
create function pg_temp.acc_raw(p_name text) returns text language sql security definer set search_path = public, pg_temp as $$
  select format('%s|%s|%s|%s|%s', name, status, case when is_default then 'principal' else '-' end, version,
                case when deleted_at is null then '-' else 'excluida' end)
    from public.financial_accounts where id = pg_temp.id(p_name)
$$;
create function pg_temp.vv(p_id uuid) returns int language sql as $$ select version from public.financial_accounts where id = p_id $$;
create function pg_temp.accver(p_name text) returns int language sql as $$ select version from public.financial_accounts where id = pg_temp.id(p_name) $$;
-- Chamadas como texto (para expect_code).
create function pg_temp.ca(p_key text, p_ctx uuid, p_name text, p_kind text) returns text language sql as $$
  select format('select public.create_account(%L, %L, %L, %L)', p_key, p_ctx, p_name, p_kind)
$$;
create function pg_temp.ua(p_key text, p_acc uuid, p_version integer, p_name text, p_kind text) returns text language sql as $$
  select format('select public.update_account(%L, %L, %L, %L, %L)', p_key, p_acc, p_version, p_name, p_kind)
$$;
create function pg_temp.da(p_key text, p_acc uuid, p_version integer) returns text language sql as $$
  select format('select public.set_default_account(%L, %L, %L)', p_key, p_acc, p_version)
$$;
create function pg_temp.sa(p_key text, p_acc uuid, p_version integer, p_status text, p_new uuid default null) returns text language sql as $$
  select format('select public.set_account_status(%L, %L, %L, %L, %L)', p_key, p_acc, p_version, p_status, p_new)
$$;
create function pg_temp.xa(p_key text, p_acc uuid, p_version integer) returns text language sql as $$
  select format('select public.delete_account(%L, %L, %L)', p_key, p_acc, p_version)
$$;
create function pg_temp.gm(p_key text, p_goal uuid, p_kind text, p_amount bigint, p_on date, p_acc uuid default null) returns text language sql as $$
  select format('select public.add_goal_movement(%L, %L, %L, %L, %L, null, %L)', p_key, p_goal, p_kind, p_amount, p_on, p_acc)
$$;
create function pg_temp.gu(p_key text, p_mov uuid, p_version integer, p_amount bigint, p_on date, p_acc uuid default null) returns text language sql as $$
  select format('select public.update_goal_movement(%L, %L, %L, %L, %L, null, %L)', p_key, p_mov, p_version, p_amount, p_on, p_acc)
$$;

insert into ids values ('ada', :ada), ('davi', :davi), ('elisa', :elisa), ('fabio', :fabio), ('gaia', :gaia), ('hugo', :hugo);
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  (:ada,   'ada@exemplo.test',   now(), '{"display_name":"Ada"}'),
  (:davi,  'davi@exemplo.test',  now(), '{"display_name":"Davi"}'),
  (:elisa, 'elisa@exemplo.test', now(), '{"display_name":"Elisa"}'),
  (:fabio, 'fabio@exemplo.test', now(), '{"display_name":"Fábio"}'),
  (:gaia,  'gaia@exemplo.test',  now(), '{"display_name":"Gaia"}'),
  (:hugo,  'hugo@exemplo.test',  now(), '{"display_name":"Hugo"}');

-- Espaços pessoais.
set role authenticated;
do $$
declare
  p text;
  space jsonb;
begin
  foreach p in array array['ada', 'davi', 'elisa', 'fabio', 'gaia', 'hugo'] loop
    perform pg_temp.as_(p);
    space := public.ensure_personal_space('Conta principal');
    insert into ids values (p || '_ctx', (space ->> 'context_id')::uuid), (p || '_acc', (space #>> '{account,id}')::uuid);
  end loop;
end $$;
reset role;

-- Família da Ada (Davi só lê; Elisa escreve sem "editar de outras pessoas"; Fábio escreve e altera o que é dos outros), preparada
-- pelo backend, com a conta da casa criada por fora das funções (o gatilho a torna principal).
with f as (
  insert into public.financial_contexts (kind, name, owner_person_id) values ('familia', 'Família da Ada', :ada) returning id
) insert into ids select 'fam', id from f;
insert into public.context_memberships (context_id, person_id, role, can_read, can_write, can_edit_others)
  select id, :ada::uuid, 'titular'::public.membership_role, true, true, true from ids where name = 'fam'
  union all
  select id, :davi::uuid, 'membro'::public.membership_role, true, false, false from ids where name = 'fam'
  union all
  select id, :elisa::uuid, 'membro'::public.membership_role, true, true, false from ids where name = 'fam'
  union all
  select id, :fabio::uuid, 'membro'::public.membership_role, true, true, true from ids where name = 'fam';
with a as (
  insert into public.financial_accounts (context_id, name, created_by) select id, 'Conta da casa', :ada from ids where name = 'fam' returning id
) insert into ids select 'fam_acc', id from a;

-- ---------------------------------------------------------------------------
-- 1. Conta nova: só a "Conta principal" (banco, ativa, principal, versão 1); nenhuma conta de exemplo. O gatilho torna principal a
-- primeira conta ativa de um contexto sem principal (inclusive a criada por fora das funções) e não a seguinte.
-- ---------------------------------------------------------------------------
set role authenticated;
do $$ begin
  perform pg_temp.as_('hugo');
  assert (select count(*) from public.financial_accounts) = 1, 'conta nova: uma conta';
  assert pg_temp.acc('hugo_acc') = 'Conta principal|banco|ativa|principal|1', 'a Conta principal é banco, ativa, principal, versão 1';
  assert (select initial_balance_cents is null and currency = 'BRL' from public.financial_accounts), 'saldo inicial desconhecido, em reais';
  perform pg_temp.as_('ada');
  assert (select count(*) from public.financial_accounts) = 2 and exists (select 1 from public.financial_accounts where id = pg_temp.id('fam_acc')),
    'Ada vê a conta pessoal e a da casa';
end $$;
reset role;
do $$ begin
  assert (select is_default and kind = 'banco' and status = 'ativa' from public.financial_accounts where id = pg_temp.id('fam_acc')),
    'a conta da casa, primeira do contexto, nasceu principal pelo gatilho';
  insert into public.financial_accounts (context_id, name, created_by) values (pg_temp.id('fam'), 'Poupança da casa', pg_temp.id('ada'));
  insert into public.financial_accounts (context_id, name, status, created_by) values (pg_temp.id('fam'), 'Antiga', 'arquivada', pg_temp.id('ada'));
  assert (select array_agg(name order by name) from public.financial_accounts where context_id = pg_temp.id('fam') and is_default) = array['Conta da casa'],
    'a segunda conta não vira principal';
  assert (select count(*) from public.financial_accounts where context_id = pg_temp.id('fam')) = 3, 'três contas na Família (uma arquivada)';
  -- Contexto sem nenhuma conta ativa: a primeira ativa que chegar é a principal; a arquivada nunca é.
  insert into public.financial_contexts (kind, name, owner_person_id) values ('familia', 'Só arquivada', pg_temp.id('ada'));
  insert into public.financial_accounts (context_id, name, status, created_by)
    select id, 'A', 'arquivada', pg_temp.id('ada') from public.financial_contexts where name = 'Só arquivada';
  assert not exists (select 1 from public.financial_accounts where name = 'A' and is_default), 'arquivada nunca nasce principal';
  insert into public.financial_accounts (context_id, name, created_by)
    select id, 'B', pg_temp.id('ada') from public.financial_contexts where name = 'Só arquivada';
  assert (select is_default from public.financial_accounts where name = 'B'), 'a primeira ativa nasce principal';
  delete from public.financial_accounts where context_id in (select id from public.financial_contexts where name = 'Só arquivada');
  delete from public.financial_contexts where name = 'Só arquivada';
  delete from public.financial_accounts where name = 'Poupança da casa';
  delete from public.financial_accounts where name = 'Antiga';
end $$;

-- ---------------------------------------------------------------------------
-- 2. Validação (Hugo, hoje 07/10/2026): sessão, chave, permissão, nome e tipo, nessa ordem; recusas não gravam operação.
-- ---------------------------------------------------------------------------
set role authenticated;
do $$
declare
  ctx uuid := pg_temp.id('hugo_ctx');
  res jsonb;
begin
  perform pg_temp.as_('ninguem');
  perform pg_temp.expect_error(pg_temp.ca('ct-n-0001', ctx, 'Carteira', 'dinheiro'), 'nao_autenticado');
  perform pg_temp.expect_error(pg_temp.ua('ct-n-0002', pg_temp.id('hugo_acc'), 1, 'X', 'banco'), 'nao_autenticado');
  perform pg_temp.expect_error(pg_temp.da('ct-n-0003', pg_temp.id('hugo_acc'), 1), 'nao_autenticado');
  perform pg_temp.expect_error(pg_temp.sa('ct-n-0004', pg_temp.id('hugo_acc'), 1, 'arquivada'), 'nao_autenticado');
  perform pg_temp.expect_error(pg_temp.xa('ct-n-0005', pg_temp.id('hugo_acc'), 1), 'nao_autenticado');
  perform pg_temp.as_('hugo');
  perform pg_temp.expect_error(pg_temp.ca('curta', ctx, 'Carteira', 'dinheiro'), 'chave_invalida');
  perform pg_temp.expect_error(format($f$select public.create_account(null, %L, 'Carteira', 'dinheiro')$f$, ctx), 'chave_invalida');
  perform pg_temp.expect_error(pg_temp.ca(repeat('k', 81), ctx, 'Carteira', 'dinheiro'), 'chave_invalida');
  perform pg_temp.expect_error(pg_temp.ua('curta', pg_temp.id('hugo_acc'), 1, 'X', 'banco'), 'chave_invalida');
  perform pg_temp.expect_error(pg_temp.da('curta', pg_temp.id('hugo_acc'), 1), 'chave_invalida');
  perform pg_temp.expect_error(pg_temp.sa('curta', pg_temp.id('hugo_acc'), 1, 'ativa'), 'chave_invalida');
  perform pg_temp.expect_error(pg_temp.xa('curta', pg_temp.id('hugo_acc'), 1), 'chave_invalida');
  -- Permissão: contexto que não existe ou que não é dele (antes do formato).
  perform pg_temp.expect_code(pg_temp.ca('ct-n-0010', gen_random_uuid(), 'Carteira', 'dinheiro'), 'sem_permissao', '42501');
  perform pg_temp.expect_code(pg_temp.ca('ct-n-0011', pg_temp.id('ada_ctx'), 'Carteira', 'dinheiro'), 'sem_permissao', '42501');
  perform pg_temp.expect_code(pg_temp.ca('ct-n-0012', pg_temp.id('ada_ctx'), '', 'poupanca'), 'sem_permissao', '42501');
  -- Nome: de 1 a 40 caracteres, sem espaços (nem tabulação ou quebra de linha) nas pontas.
  perform pg_temp.expect_code(pg_temp.ca('ct-n-0013', ctx, '', 'banco'), 'nome_da_conta_invalido', '22023');
  perform pg_temp.expect_code(pg_temp.ca('ct-n-0014', ctx, '   ', 'banco'), 'nome_da_conta_invalido', '22023');
  perform pg_temp.expect_code(pg_temp.ca('ct-n-0015', ctx, E'\t \n', 'banco'), 'nome_da_conta_invalido', '22023');
  perform pg_temp.expect_code(format($f$select public.create_account('ct-n-0016', %L, null, 'banco')$f$, ctx), 'nome_da_conta_invalido', '22023');
  perform pg_temp.expect_code(pg_temp.ca('ct-n-0017', ctx, repeat('x', 41), 'banco'), 'nome_da_conta_invalido', '22023');
  -- Tipo: banco, dinheiro ou outra; o nome é conferido antes do tipo.
  perform pg_temp.expect_code(pg_temp.ca('ct-n-0018', ctx, 'Carteira', 'poupanca'), 'tipo_da_conta_invalido', '22023');
  perform pg_temp.expect_code(pg_temp.ca('ct-n-0019', ctx, 'Carteira', 'Banco'), 'tipo_da_conta_invalido', '22023');
  perform pg_temp.expect_code(pg_temp.ca('ct-n-0020', ctx, 'Carteira', ''), 'tipo_da_conta_invalido', '22023');
  perform pg_temp.expect_code(format($f$select public.create_account('ct-n-0021', %L, 'Carteira', null)$f$, ctx), 'tipo_da_conta_invalido', '22023');
  perform pg_temp.expect_code(pg_temp.ca('ct-n-0022', ctx, '', 'poupanca'), 'nome_da_conta_invalido', '22023');
  assert (select count(*) from public.record_operations where idempotency_key like 'ct-n-00%' or idempotency_key = 'curta') = 0, 'recusas não gravam operação';
  assert (select count(*) from public.financial_accounts) = 1, 'recusas não gravam conta';

  -- Aceitos: 1 e 40 caracteres; nome aparado; os três tipos; acentos e espaços no meio.
  res := public.create_account('ct-n-0030', ctx, 'x', 'outra');
  assert res ->> 'name' = 'x' and res ->> 'kind' = 'outra', 'nome de 1 caractere';
  insert into ids values ('hugo_x', (res ->> 'id')::uuid);
  res := public.create_account('ct-n-0031', ctx, repeat('é', 40), 'banco');
  assert char_length(res ->> 'name') = 40, 'nome de 40 caracteres';
  insert into ids values ('hugo_40', (res ->> 'id')::uuid);
  res := public.create_account('ct-n-0032', ctx, E'\t Cartão  de papel \n', 'dinheiro');
  assert res ->> 'name' = E'Cartão  de papel' and res ->> 'kind' = 'dinheiro', 'nome aparado nas pontas, espaços do meio mantidos';
  insert into ids values ('hugo_papel', (res ->> 'id')::uuid);
  perform public.delete_account('ct-n-0033', pg_temp.id('hugo_x'), 1);
  perform public.delete_account('ct-n-0034', pg_temp.id('hugo_40'), 1);
  perform public.delete_account('ct-n-0035', pg_temp.id('hugo_papel'), 1);
  assert (select count(*) from public.financial_accounts) = 1, 'desfeitas';
end $$;

-- ---------------------------------------------------------------------------
-- 3. Criar: forma da resposta, operação gravada, hash, repetição e conflito de chave (Hugo).
-- ---------------------------------------------------------------------------
do $$
declare
  ctx uuid := pg_temp.id('hugo_ctx');
  r1 jsonb;
  r2 jsonb;
begin
  perform pg_temp.as_('hugo');
  r1 := public.create_account('ct-c-0001', ctx, 'Carteira', 'dinheiro');
  insert into ids values ('hugo_cart', (r1 ->> 'id')::uuid);
  assert (select array_agg(k order by k) from jsonb_object_keys(r1) k)
    = array['context_id', 'created_at', 'created_by', 'currency', 'deleted_at', 'deleted_by', 'id', 'initial_balance_cents', 'is_default',
            'kind', 'name', 'status', 'updated_at', 'version'], 'a conta em JSON: a linha de financial_accounts';
  assert r1 ->> 'name' = 'Carteira' and r1 ->> 'kind' = 'dinheiro' and r1 ->> 'status' = 'ativa' and (r1 ->> 'is_default')::boolean = false
     and (r1 ->> 'version')::int = 1 and r1 ->> 'currency' = 'BRL' and r1 -> 'initial_balance_cents' = 'null'::jsonb
     and r1 ->> 'created_by' = auth.uid()::text and (r1 ->> 'context_id')::uuid = ctx and r1 -> 'deleted_at' = 'null'::jsonb,
    'conta nova: ativa, não principal, versão 1, em reais, sem saldo inicial, autoria da sessão';
  assert (select (action, record_id is null, commitment_id is null, target_id, context_id)
            from public.record_operations where idempotency_key = 'ct-c-0001')
       = ('criar_conta'::text, true, true, pg_temp.id('hugo_cart'), ctx), 'operação criar_conta aponta para a conta';
  assert (select request_hash from public.record_operations where idempotency_key = 'ct-c-0001')
       = md5(format('["criar_conta", "%s", "Carteira", "dinheiro"]', ctx)), 'hash em JSON';
  -- Repetição: mesma resposta; nada novo é gravado.
  assert public.create_account('ct-c-0001', ctx, 'Carteira', 'dinheiro') = r1, 'repetição devolve a mesma conta';
  assert (select count(*) from public.financial_accounts) = 2 and (select count(*) from public.record_operations where idempotency_key = 'ct-c-0001') = 1,
    'a repetição não grava de novo';
  assert public.create_account('ct-c-0001', ctx, E' Carteira\t', 'dinheiro') = r1, 'repetição com o nome sem aparar é o mesmo conteúdo';
  perform pg_temp.expect_code(pg_temp.ca('ct-c-0001', ctx, 'Carteira', 'banco'), 'chave_reutilizada', 'PT409');
  perform pg_temp.expect_code(pg_temp.ca('ct-c-0001', ctx, 'Outra', 'dinheiro'), 'chave_reutilizada', 'PT409');
  perform pg_temp.expect_code(pg_temp.ua('ct-c-0001', pg_temp.id('hugo_cart'), 1, 'Carteira', 'dinheiro'), 'chave_reutilizada', 'PT409');
  perform pg_temp.expect_code(pg_temp.xa('ct-c-0001', pg_temp.id('hugo_cart'), 1), 'chave_reutilizada', 'PT409');
  -- A chave de outra ação (aqui, de um gasto) também não vale.
  perform public.create_record('ct-c-0002', ctx, pg_temp.id('hugo_acc'), 'despesa', 1000, '2026-10-07', 'Café');
  perform pg_temp.expect_code(pg_temp.ca('ct-c-0002', ctx, 'Carteira', 'dinheiro'), 'chave_reutilizada', 'PT409');
  -- A chave é por pessoa: a mesma chave de outra pessoa não conflita.
  perform pg_temp.as_('gaia');
  r2 := public.create_account('ct-c-0001', pg_temp.id('gaia_ctx'), 'Carteira', 'dinheiro');
  assert (r2 ->> 'id') <> (r1 ->> 'id') and (r2 ->> 'context_id')::uuid = pg_temp.id('gaia_ctx'), 'a chave é por pessoa';
  insert into ids values ('gaia_cart', (r2 ->> 'id')::uuid);
  perform pg_temp.as_('hugo');
  -- A repetição só devolve a conta a quem ainda lê o contexto.
  assert pg_temp.acc('hugo_cart') = 'Carteira|dinheiro|ativa|-|1', 'leitura da conta nova';
end $$;

-- ---------------------------------------------------------------------------
-- 4. Nome repetido: sem diferenciar maiúsculas de minúsculas, entre as não excluídas (a arquivada também conta); a conta excluída
-- libera o nome; o nome de outro contexto não conflita.
-- ---------------------------------------------------------------------------
do $$
declare
  ctx uuid := pg_temp.id('hugo_ctx');
  r jsonb;
begin
  perform pg_temp.as_('hugo');
  perform pg_temp.expect_code(pg_temp.ca('ct-d-0001', ctx, 'Carteira', 'dinheiro'), 'nome_da_conta_repetido', 'PT409');
  perform pg_temp.expect_code(pg_temp.ca('ct-d-0002', ctx, 'CARTEIRA', 'banco'), 'nome_da_conta_repetido', 'PT409');
  perform pg_temp.expect_code(pg_temp.ca('ct-d-0003', ctx, 'carteira ', 'banco'), 'nome_da_conta_repetido', 'PT409');
  perform pg_temp.expect_code(pg_temp.ca('ct-d-0004', ctx, 'conta principal', 'banco'), 'nome_da_conta_repetido', 'PT409');
  -- Renomear para o nome de outra conta, mesmo arquivada.
  r := public.create_account('ct-d-0005', ctx, 'Reserva', 'banco');
  insert into ids values ('hugo_reserva', (r ->> 'id')::uuid);
  perform public.set_account_status('ct-d-0006', pg_temp.id('hugo_reserva'), 1, 'arquivada');
  perform pg_temp.expect_code(pg_temp.ca('ct-d-0007', ctx, 'reserva', 'banco'), 'nome_da_conta_repetido', 'PT409');
  perform pg_temp.expect_code(pg_temp.ua('ct-d-0008', pg_temp.id('hugo_cart'), 1, 'RESERVA', 'dinheiro'), 'nome_da_conta_repetido', 'PT409');
  -- O próprio nome (inclusive com outra caixa) e o próprio tipo não conflitam.
  r := public.update_account('ct-d-0009', pg_temp.id('hugo_cart'), 1, 'carteira', 'dinheiro');
  assert r ->> 'name' = 'carteira' and (r ->> 'version')::int = 2, 'trocar só a caixa do próprio nome vale';
  r := public.update_account('ct-d-0010', pg_temp.id('hugo_cart'), 2, 'Carteira', 'dinheiro');
  assert r ->> 'name' = 'Carteira' and (r ->> 'version')::int = 3, 'e voltar';
  -- Outro contexto: o mesmo nome vale.
  perform pg_temp.as_('gaia');
  assert (select count(*) from public.financial_accounts where lower(name) = 'carteira') = 1, 'Gaia tem a sua Carteira';
  perform pg_temp.as_('hugo');
  -- Excluída libera o nome.
  perform public.delete_account('ct-d-0011', pg_temp.id('hugo_reserva'), 2);
  r := public.create_account('ct-d-0012', ctx, 'Reserva', 'outra');
  assert r ->> 'name' = 'Reserva' and (r ->> 'id')::uuid <> pg_temp.id('hugo_reserva'), 'o nome da conta excluída pode ser usado de novo';
  perform public.delete_account('ct-d-0013', (r ->> 'id')::uuid, 1);
end $$;

-- ---------------------------------------------------------------------------
-- 5. Limite de 10 contas ativas por contexto: a 11ª é recusada; arquivar libera uma vaga; reativar com 10 ativas é recusado.
-- ---------------------------------------------------------------------------
do $$
declare
  ctx uuid := pg_temp.id('hugo_ctx');
  r jsonb;
  i int;
begin
  perform pg_temp.as_('hugo');
  -- Hugo tem 2 ativas (Conta principal e Carteira); chega a 10.
  for i in 1 .. 8 loop
    r := public.create_account('ct-l-' || lpad(i::text, 4, '0'), ctx, 'Conta ' || i, 'banco');
    insert into ids values ('hugo_l' || i, (r ->> 'id')::uuid);
  end loop;
  assert (select count(*) from public.financial_accounts where status = 'ativa') = 10, 'dez ativas';
  perform pg_temp.expect_code(pg_temp.ca('ct-l-0100', ctx, 'Conta 9', 'banco'), 'limite_de_contas', 'PT409');
  assert (select count(*) from public.record_operations where idempotency_key = 'ct-l-0100') = 0, 'a recusa não grava';
  -- Arquivar libera uma vaga; a arquivada não conta; a vaga é usada; reativar a arquivada agora estoura.
  perform public.set_account_status('ct-l-0101', pg_temp.id('hugo_l1'), 1, 'arquivada');
  r := public.create_account('ct-l-0102', ctx, 'Conta 9', 'banco');
  insert into ids values ('hugo_l9', (r ->> 'id')::uuid);
  perform pg_temp.expect_code(pg_temp.ca('ct-l-0103', ctx, 'Conta 10', 'banco'), 'limite_de_contas', 'PT409');
  perform pg_temp.expect_code(pg_temp.sa('ct-l-0104', pg_temp.id('hugo_l1'), 2, 'ativa'), 'limite_de_contas', 'PT409');
  assert pg_temp.acc('hugo_l1') = 'Conta 1|banco|arquivada|-|2', 'a recusa não muda a conta';
  -- Uma vaga a mais (arquivar outra) e a reativação passa.
  perform public.set_account_status('ct-l-0105', pg_temp.id('hugo_l2'), 1, 'arquivada');
  r := public.set_account_status('ct-l-0106', pg_temp.id('hugo_l1'), 2, 'ativa');
  assert r ->> 'status' = 'ativa' and (r ->> 'version')::int = 3, 'reativada';
  -- Excluir também libera a vaga (a excluída não conta).
  perform public.delete_account('ct-l-0107', pg_temp.id('hugo_l9'), 1);
  r := public.set_account_status('ct-l-0108', pg_temp.id('hugo_l2'), 2, 'ativa');
  assert r ->> 'status' = 'ativa', 'reativada com a vaga da excluída';
  assert (select count(*) from public.financial_accounts where status = 'ativa') = 10, 'dez ativas de novo';
  -- Limpeza do cenário: deixa só a Conta principal e a Carteira ativas.
  for i in 1 .. 8 loop
    if i <> 9 then
      perform public.delete_account('ct-l-9' || lpad(i::text, 3, '0'), pg_temp.id('hugo_l' || i), pg_temp.accver('hugo_l' || i));
    end if;
  end loop;
  assert (select count(*) from public.financial_accounts) = 2, 'de volta a duas contas';
end $$;
reset role;

-- O limite é por contexto: as outras pessoas não foram afetadas. As ativas por contexto (cinco com uma, Hugo e Gaia com duas):
do $$ begin
  assert (select array_agg(c order by c) from (select (count(*) filter (where status = 'ativa' and deleted_at is null))::int as c
            from public.financial_accounts group by context_id) x) = array[1, 1, 1, 1, 1, 2, 2], 'ativas por contexto';
end $$;

-- ---------------------------------------------------------------------------
-- 6. Alterar nome e tipo: versão, autoria, repetição; a conta arquivada também pode ser renomeada (Hugo).
-- ---------------------------------------------------------------------------
set role authenticated;
do $$
declare
  cart uuid := pg_temp.id('hugo_cart');
  r jsonb;
  v int;
begin
  perform pg_temp.as_('hugo');
  v := pg_temp.accver('hugo_cart');
  assert pg_temp.acc('hugo_cart') = 'Carteira|dinheiro|ativa|-|' || v, 'ponto de partida';
  perform pg_temp.expect_stale(pg_temp.ua('ct-u-0001', cart, v - 1, 'Dinheiro vivo', 'dinheiro'), 'versao_atual=' || v);
  perform pg_temp.expect_stale(pg_temp.ua('ct-u-0002', cart, null, 'Dinheiro vivo', 'dinheiro'), 'versao_atual=' || v);
  perform pg_temp.expect_stale(pg_temp.ua('ct-u-0003', cart, v + 1, 'Dinheiro vivo', 'dinheiro'), 'versao_atual=' || v);
  -- A versão vem antes do nome e do tipo.
  perform pg_temp.expect_stale(pg_temp.ua('ct-u-0004', cart, 1, '', 'poupanca'), 'versao_atual=' || v);
  perform pg_temp.expect_code(pg_temp.ua('ct-u-0005', cart, v, '', 'dinheiro'), 'nome_da_conta_invalido', '22023');
  perform pg_temp.expect_code(pg_temp.ua('ct-u-0006', cart, v, repeat('x', 41), 'dinheiro'), 'nome_da_conta_invalido', '22023');
  perform pg_temp.expect_code(pg_temp.ua('ct-u-0007', cart, v, 'Dinheiro vivo', 'poupanca'), 'tipo_da_conta_invalido', '22023');
  perform pg_temp.expect_code(pg_temp.ua('ct-u-0008', cart, v, 'Conta principal', 'dinheiro'), 'nome_da_conta_repetido', 'PT409');
  perform pg_temp.expect_code(pg_temp.ua('ct-u-0009', gen_random_uuid(), 1, 'X', 'banco'), 'nao_encontrado', 'P0002');
  assert pg_temp.acc('hugo_cart') = 'Carteira|dinheiro|ativa|-|' || v, 'as recusas não mudam a conta';
  assert (select count(*) from public.record_operations where idempotency_key like 'ct-u-%') = 0, 'nem gravam operação';

  r := public.update_account('ct-u-0010', cart, v, E' Dinheiro vivo \t', 'outra');
  assert r ->> 'name' = 'Dinheiro vivo' and r ->> 'kind' = 'outra' and (r ->> 'version')::int = v + 1 and r ->> 'status' = 'ativa'
     and not (r ->> 'is_default')::boolean, 'nome aparado, tipo novo, versão +1; situação e principal não mudam';
  assert (select (action, target_id) from public.record_operations where idempotency_key = 'ct-u-0010') = ('alterar_conta'::text, cart),
    'operação alterar_conta aponta para a conta';
  assert (select request_hash from public.record_operations where idempotency_key = 'ct-u-0010')
       = md5(format('["alterar_conta", "%s", %s, "Dinheiro vivo", "outra"]', cart, v)), 'hash em JSON';
  assert public.update_account('ct-u-0010', cart, v, 'Dinheiro vivo', 'outra') = r, 'repetição devolve o estado gravado';
  assert pg_temp.accver('hugo_cart') = v + 1, 'a repetição não sobe a versão';
  perform pg_temp.expect_code(pg_temp.ua('ct-u-0010', cart, v, 'Dinheiro vivo', 'banco'), 'chave_reutilizada', 'PT409');
  -- Salvar sem mudar nada também é uma escrita (versão +1), como nas demais funções.
  r := public.update_account('ct-u-0011', cart, v + 1, 'Dinheiro vivo', 'outra');
  assert (r ->> 'version')::int = v + 2, 'sem mudança, versão +1';
  r := public.update_account('ct-u-0012', cart, v + 2, 'Carteira', 'dinheiro');
  assert r ->> 'name' = 'Carteira', 'de volta ao nome';
  v := v + 3;
  -- Arquivada também renomeia; a situação continua.
  perform public.set_account_status('ct-u-0013', cart, v, 'arquivada');
  r := public.update_account('ct-u-0014', cart, v + 1, 'Carteira antiga', 'dinheiro');
  assert r ->> 'status' = 'arquivada' and r ->> 'name' = 'Carteira antiga', 'a arquivada pode ser renomeada';
  r := public.update_account('ct-u-0015', cart, v + 2, 'Carteira', 'dinheiro');
  r := public.set_account_status('ct-u-0016', cart, v + 3, 'ativa');
  assert pg_temp.acc('hugo_cart') = 'Carteira|dinheiro|ativa|-|' || (v + 4), 'reativada';

  -- Outra pessoa de fora não encontra a conta; a conta pessoal de outra pessoa nunca aparece.
  perform pg_temp.as_('gaia');
  perform pg_temp.expect_code(pg_temp.ua('ct-u-0020', cart, v + 4, 'Roubada', 'banco'), 'nao_encontrado', 'P0002');
  perform pg_temp.expect_code(pg_temp.da('ct-u-0021', cart, v + 4), 'nao_encontrado', 'P0002');
  perform pg_temp.expect_code(pg_temp.sa('ct-u-0022', cart, v + 4, 'arquivada'), 'nao_encontrado', 'P0002');
  perform pg_temp.expect_code(pg_temp.xa('ct-u-0023', cart, v + 4), 'nao_encontrado', 'P0002');
  assert not exists (select 1 from public.financial_accounts where id = cart), 'a conta de Hugo não aparece para Gaia';
  perform pg_temp.as_('hugo');
  assert pg_temp.acc('hugo_cart') = 'Carteira|dinheiro|ativa|-|' || (v + 4), 'nada mudou';
end $$;

-- ---------------------------------------------------------------------------
-- 7. Principal: tornar principal (a anterior sobe +1), já ser a principal não muda nada, arquivada recusada, repetição e hash.
-- ---------------------------------------------------------------------------
do $$
declare
  ctx uuid := pg_temp.id('hugo_ctx');
  principal uuid := pg_temp.id('hugo_acc');
  cart uuid := pg_temp.id('hugo_cart');
  pv int := pg_temp.accver('hugo_acc');
  cv int := pg_temp.accver('hugo_cart');
  r jsonb;
begin
  perform pg_temp.as_('hugo');
  assert pg_temp.acc('hugo_acc') like 'Conta principal|banco|ativa|principal|%', 'a principal de partida';
  perform pg_temp.expect_stale(pg_temp.da('ct-p-0001', cart, cv - 1), 'versao_atual=' || cv);
  perform pg_temp.expect_stale(pg_temp.da('ct-p-0002', cart, null), 'versao_atual=' || cv);
  perform pg_temp.expect_code(pg_temp.da('ct-p-0003', gen_random_uuid(), 1), 'nao_encontrado', 'P0002');
  r := public.set_default_account('ct-p-0004', cart, cv);
  assert (r ->> 'is_default')::boolean and (r ->> 'version')::int = cv + 1 and (r ->> 'id')::uuid = cart, 'a Carteira é a principal, versão +1';
  assert pg_temp.acc('hugo_acc') = 'Conta principal|banco|ativa|-|' || (pv + 1), 'a anterior deixou de ser principal, versão +1';
  assert (select count(*) from public.financial_accounts where is_default) = 1, 'uma só principal';
  assert (select (action, target_id, context_id) from public.record_operations where idempotency_key = 'ct-p-0004')
       = ('conta_principal'::text, cart, ctx), 'operação conta_principal aponta para a nova principal';
  assert (select request_hash from public.record_operations where idempotency_key = 'ct-p-0004')
       = md5(format('["conta_principal", "%s", %s]', cart, cv)), 'hash em JSON';
  assert public.set_default_account('ct-p-0004', cart, cv) = r, 'repetição devolve o estado gravado';
  assert pg_temp.accver('hugo_cart') = cv + 1 and pg_temp.accver('hugo_acc') = pv + 1, 'a repetição não sobe versão';
  perform pg_temp.expect_code(pg_temp.da('ct-p-0004', principal, pv), 'chave_reutilizada', 'PT409');
  perform pg_temp.expect_code(pg_temp.sa('ct-p-0004', cart, cv, 'ativa'), 'chave_reutilizada', 'PT409');
  -- Já ser a principal: aceito, nada muda (a versão não sobe), a operação é gravada.
  r := public.set_default_account('ct-p-0005', cart, cv + 1);
  assert (r ->> 'is_default')::boolean and (r ->> 'version')::int = cv + 1, 'já é a principal: sem mudança, versão igual';
  assert (select count(*) from public.record_operations where idempotency_key = 'ct-p-0005') = 1, 'a operação é gravada';
  -- Volta para a Conta principal.
  r := public.set_default_account('ct-p-0006', principal, pv + 1);
  assert pg_temp.acc('hugo_acc') = 'Conta principal|banco|ativa|principal|' || (pv + 2)
     and pg_temp.acc('hugo_cart') = 'Carteira|dinheiro|ativa|-|' || (cv + 2), 'de volta';
  -- Conta arquivada nunca é a principal.
  perform public.set_account_status('ct-p-0007', cart, cv + 2, 'arquivada');
  perform pg_temp.expect_code(pg_temp.da('ct-p-0008', cart, cv + 3), 'conta_arquivada', 'PT409');
  perform public.set_account_status('ct-p-0009', cart, cv + 3, 'ativa');
  assert pg_temp.acc('hugo_cart') = 'Carteira|dinheiro|ativa|-|' || (cv + 4), 'reativada';
end $$;

-- ---------------------------------------------------------------------------
-- 8. Situação: arquivar e reativar; nunca a última ativa; a principal só com outra escolhida no mesmo ato; mesma situação é aceita.
-- ---------------------------------------------------------------------------
do $$
declare
  ctx uuid := pg_temp.id('hugo_ctx');
  principal uuid := pg_temp.id('hugo_acc');
  cart uuid := pg_temp.id('hugo_cart');
  pv int;
  cv int;
  r jsonb;
  outra uuid;
begin
  perform pg_temp.as_('hugo');
  pv := pg_temp.accver('hugo_acc');
  cv := pg_temp.accver('hugo_cart');
  perform pg_temp.expect_stale(pg_temp.sa('ct-s-0001', cart, cv - 1, 'arquivada'), 'versao_atual=' || cv);
  perform pg_temp.expect_stale(pg_temp.sa('ct-s-0002', cart, null, 'arquivada'), 'versao_atual=' || cv);
  perform pg_temp.expect_code(pg_temp.sa('ct-s-0003', cart, cv, 'excluida'), 'situacao_invalida', '22023');
  perform pg_temp.expect_code(pg_temp.sa('ct-s-0004', cart, cv, 'ARQUIVADA'), 'situacao_invalida', '22023');
  perform pg_temp.expect_code(pg_temp.sa('ct-s-0005', cart, cv, ''), 'situacao_invalida', '22023');
  perform pg_temp.expect_code(format($f$select public.set_account_status('ct-s-0006', %L, %s, null, null)$f$, cart, cv), 'situacao_invalida', '22023');
  perform pg_temp.expect_code(pg_temp.sa('ct-s-0007', gen_random_uuid(), 1, 'arquivada'), 'nao_encontrado', 'P0002');
  -- A versão vem antes da situação.
  perform pg_temp.expect_stale(pg_temp.sa('ct-s-0008', cart, 1, 'excluida'), 'versao_atual=' || cv);
  -- A nova principal só quando se arquiva a principal.
  perform pg_temp.expect_code(pg_temp.sa('ct-s-0009', cart, cv, 'arquivada', principal), 'campo_nao_se_aplica', '22023');
  perform pg_temp.expect_code(pg_temp.sa('ct-s-0010', cart, cv, 'ativa', principal), 'campo_nao_se_aplica', '22023');
  perform pg_temp.expect_code(pg_temp.sa('ct-s-0011', principal, pv, 'ativa', cart), 'campo_nao_se_aplica', '22023');

  -- Arquivar a Carteira (não principal): some das ativas; os lançamentos continuam.
  perform public.create_record('ct-s-0100', ctx, cart, 'despesa', 2500, '2026-10-06', 'Pão');
  r := public.set_account_status('ct-s-0012', cart, cv, 'arquivada');
  assert r ->> 'status' = 'arquivada' and (r ->> 'version')::int = cv + 1 and not (r ->> 'is_default')::boolean, 'arquivada';
  assert (select count(*) from public.financial_records where account_id = cart and deleted_at is null) = 1, 'o gasto continua na conta arquivada';
  assert (select (action, target_id) from public.record_operations where idempotency_key = 'ct-s-0012') = ('situacao_conta'::text, cart),
    'operação situacao_conta aponta para a conta';
  assert (select request_hash from public.record_operations where idempotency_key = 'ct-s-0012')
       = md5(format('["situacao_conta", "%s", %s, "arquivada", null]', cart, cv)), 'hash em JSON, com a nova principal nula';
  assert public.set_account_status('ct-s-0012', cart, cv, 'arquivada') = r, 'repetição devolve o estado gravado';
  perform pg_temp.expect_code(pg_temp.sa('ct-s-0012', cart, cv, 'ativa'), 'chave_reutilizada', 'PT409');
  -- Mesma situação: aceita, não muda nada.
  r := public.set_account_status('ct-s-0013', cart, cv + 1, 'arquivada');
  assert (r ->> 'version')::int = cv + 1 and r ->> 'status' = 'arquivada', 'arquivar a arquivada: sem mudança';
  -- A última ativa nunca se arquiva (a Conta principal), nem com a nova principal arquivada.
  perform pg_temp.expect_code(pg_temp.sa('ct-s-0014', principal, pv, 'arquivada'), 'ultima_conta_ativa', 'PT409');
  perform pg_temp.expect_code(pg_temp.sa('ct-s-0015', principal, pv, 'arquivada', cart), 'ultima_conta_ativa', 'PT409');
  assert pg_temp.acc('hugo_acc') = 'Conta principal|banco|ativa|principal|' || pv, 'a recusa não mudou nada';
  -- Reativar; já ativa é aceito.
  r := public.set_account_status('ct-s-0016', cart, cv + 1, 'ativa');
  assert r ->> 'status' = 'ativa' and (r ->> 'version')::int = cv + 2, 'reativada';
  r := public.set_account_status('ct-s-0017', cart, cv + 2, 'ativa');
  assert (r ->> 'version')::int = cv + 2, 'ativar a ativa: sem mudança';

  -- Arquivar a principal exige escolher outra no mesmo ato.
  perform pg_temp.expect_code(pg_temp.sa('ct-s-0020', principal, pv, 'arquivada'), 'conta_principal', 'PT409');
  perform pg_temp.expect_code(pg_temp.sa('ct-s-0021', principal, pv, 'arquivada', principal), 'conta_invalida', '22023');
  perform pg_temp.expect_code(pg_temp.sa('ct-s-0022', principal, pv, 'arquivada', gen_random_uuid()), 'conta_invalida', '22023');
  perform pg_temp.expect_code(pg_temp.sa('ct-s-0023', principal, pv, 'arquivada', pg_temp.id('gaia_cart')), 'conta_invalida', '22023');
  outra := (public.create_account('ct-s-0024', ctx, 'Antiga', 'banco') ->> 'id')::uuid;
  insert into ids values ('hugo_antiga', outra);
  perform public.set_account_status('ct-s-0025', outra, 1, 'arquivada');
  perform pg_temp.expect_code(pg_temp.sa('ct-s-0026', principal, pv, 'arquivada', outra), 'conta_invalida', '22023');
  assert pg_temp.acc('hugo_acc') = 'Conta principal|banco|ativa|principal|' || pv, 'as recusas não mudaram nada';
  r := public.set_account_status('ct-s-0027', principal, pv, 'arquivada', cart);
  assert r ->> 'status' = 'arquivada' and not (r ->> 'is_default')::boolean and (r ->> 'version')::int = pv + 1, 'a principal arquivada deixa de ser principal';
  assert pg_temp.acc('hugo_cart') = 'Carteira|dinheiro|ativa|principal|' || (cv + 3), 'a Carteira é a nova principal (versão +1)';
  assert (select count(*) from public.financial_accounts where is_default) = 1, 'uma só principal';
  assert (select request_hash from public.record_operations where idempotency_key = 'ct-s-0027')
       = md5(format('["situacao_conta", "%s", %s, "arquivada", "%s"]', principal, pv, cart)), 'hash com a nova principal';
  assert public.set_account_status('ct-s-0027', principal, pv, 'arquivada', cart) = r, 'repetição devolve o estado gravado';
  -- Agora a Carteira é a principal e a única ativa: nada a arquivar. A Conta principal volta e a principal volta com ela.
  perform pg_temp.expect_code(pg_temp.sa('ct-s-0028', cart, cv + 3, 'arquivada', principal), 'ultima_conta_ativa', 'PT409');
  perform public.set_account_status('ct-s-0029', principal, pv + 1, 'ativa');
  perform public.set_default_account('ct-s-0030', principal, pv + 2);
  assert pg_temp.acc('hugo_acc') = 'Conta principal|banco|ativa|principal|' || (pv + 3)
     and pg_temp.acc('hugo_cart') = 'Carteira|dinheiro|ativa|-|' || (cv + 4), 'de volta: Conta principal e Carteira';
  perform public.delete_account('ct-s-0031', outra, 2);
end $$;

-- ---------------------------------------------------------------------------
-- 9. Excluir: a principal nunca; com lançamentos vivos (gasto ou movimento de meta) é recusado ("arquive"); sem eles, exclusão
-- lógica (fica arquivada, some da leitura, libera o nome); repetição devolve a conta excluída; a excluída não é mais encontrada.
-- ---------------------------------------------------------------------------
do $$
declare
  ctx uuid := pg_temp.id('hugo_ctx');
  principal uuid := pg_temp.id('hugo_acc');
  cart uuid := pg_temp.id('hugo_cart');
  v int;
  r jsonb;
  g jsonb;
  m uuid;
  rec uuid;
  acc uuid;
begin
  perform pg_temp.as_('hugo');
  v := pg_temp.accver('hugo_cart');
  perform pg_temp.expect_stale(pg_temp.xa('ct-x-0001', cart, v - 1), 'versao_atual=' || v);
  perform pg_temp.expect_stale(pg_temp.xa('ct-x-0002', cart, null), 'versao_atual=' || v);
  perform pg_temp.expect_code(pg_temp.xa('ct-x-0003', gen_random_uuid(), 1), 'nao_encontrado', 'P0002');
  -- A principal nunca se exclui (a versão vem antes).
  perform pg_temp.expect_code(pg_temp.xa('ct-x-0004', principal, pg_temp.accver('hugo_acc')), 'conta_principal', 'PT409');
  -- Com gasto vivo (a Carteira tem o "Pão"): recusado; o gasto excluído deixa de contar.
  perform pg_temp.expect_code(pg_temp.xa('ct-x-0005', cart, v), 'conta_com_lancamentos', 'PT409');
  select id into rec from public.financial_records where account_id = cart and deleted_at is null;
  perform public.delete_record('ct-x-0006', rec, 1);
  -- Com movimento de meta vivo: recusado; o movimento excluído deixa de contar.
  g := public.create_goal('ct-x-0007', ctx, 'objetivo', 'Viagem', 500000, null, null, null, null, null, null, null);
  m := (public.add_goal_movement('ct-x-0008', (g #>> '{goal,id}')::uuid, 'aporte', 10000, '2026-10-07', null, cart) #>> '{movement,id}')::uuid;
  perform pg_temp.expect_code(pg_temp.xa('ct-x-0009', cart, v), 'conta_com_lancamentos', 'PT409');
  perform public.delete_goal_movement('ct-x-0010', m, 1);
  assert pg_temp.acc('hugo_cart') = 'Carteira|dinheiro|ativa|-|' || v, 'as recusas não mudaram a conta';
  assert (select count(*) from public.record_operations where idempotency_key in ('ct-x-0001', 'ct-x-0002', 'ct-x-0003', 'ct-x-0004', 'ct-x-0005', 'ct-x-0009')) = 0,
    'recusas não gravam operação';
  -- A arquivada com lançamentos também não se exclui; sem eles, sim.
  perform public.create_record('ct-x-0011', ctx, cart, 'despesa', 100, '2026-10-07', 'Bala');
  perform public.set_account_status('ct-x-0012', cart, v, 'arquivada');
  perform pg_temp.expect_code(pg_temp.xa('ct-x-0013', cart, v + 1), 'conta_com_lancamentos', 'PT409');
  select id into rec from public.financial_records where account_id = cart and deleted_at is null;
  perform public.delete_record('ct-x-0014', rec, 1);

  r := public.delete_account('ct-x-0015', cart, v + 1);
  assert r ->> 'status' = 'arquivada' and r ->> 'deleted_at' is not null and r ->> 'deleted_by' = auth.uid()::text
     and (r ->> 'version')::int = v + 2 and not (r ->> 'is_default')::boolean, 'excluída: arquivada, com data e autoria, versão +1';
  assert (select (action, target_id) from public.record_operations where idempotency_key = 'ct-x-0015') = ('excluir_conta'::text, cart),
    'operação excluir_conta aponta para a conta';
  assert (select request_hash from public.record_operations where idempotency_key = 'ct-x-0015')
       = md5(format('["excluir_conta", "%s", %s]', cart, v + 1)), 'hash em JSON';
  assert public.delete_account('ct-x-0015', cart, v + 1) = r, 'repetição devolve a conta excluída';
  perform pg_temp.expect_code(pg_temp.xa('ct-x-0015', cart, v), 'chave_reutilizada', 'PT409');
  assert not exists (select 1 from public.financial_accounts where id = cart), 'some da leitura';
  assert pg_temp.acc_raw('hugo_cart') = 'Carteira|arquivada|-|' || (v + 2) || '|excluida', 'fica na tabela, arquivada e excluída';
  perform pg_temp.expect_code(pg_temp.xa('ct-x-0016', cart, v + 2), 'nao_encontrado', 'P0002');
  perform pg_temp.expect_code(pg_temp.ua('ct-x-0017', cart, v + 2, 'Volta', 'banco'), 'nao_encontrado', 'P0002');
  perform pg_temp.expect_code(pg_temp.da('ct-x-0018', cart, v + 2), 'nao_encontrado', 'P0002');
  perform pg_temp.expect_code(pg_temp.sa('ct-x-0019', cart, v + 2, 'ativa'), 'nao_encontrado', 'P0002');
  -- A conta excluída não recebe lançamento, pagamento nem movimento.
  perform pg_temp.expect_code(format($f$select public.create_record('ct-x-0020', %L, %L, 'despesa', 100, '2026-10-07', 'X')$f$, ctx, cart),
    'conta_invalida', '22023');
  perform pg_temp.expect_code(pg_temp.gm('ct-x-0021', (g #>> '{goal,id}')::uuid, 'aporte', 100, '2026-10-07', cart), 'conta_invalida', '22023');
  -- O nome volta a poder ser usado, por uma conta nova (outro id).
  acc := (public.create_account('ct-x-0022', ctx, 'Carteira', 'dinheiro') ->> 'id')::uuid;
  assert acc <> cart, 'conta nova com o nome da excluída';
  insert into ids values ('hugo_cart2', acc);
  perform public.delete_goal('ct-x-0023', (g #>> '{goal,id}')::uuid, 1);
end $$;
reset role;


-- ---------------------------------------------------------------------------
-- 10. A conta de saída nos gastos, contas a pagar e faturas: só conta ativa, não excluída e do mesmo contexto; editar o gasto de uma
-- conta arquivada mantendo a conta funciona; trocar para uma arquivada ou excluída não (Hugo).
-- ---------------------------------------------------------------------------
set role authenticated;
do $$
declare
  ctx uuid := pg_temp.id('hugo_ctx');
  principal uuid := pg_temp.id('hugo_acc');
  carteira uuid := pg_temp.id('hugo_cart2');
  velha uuid;
  rec uuid;
  troco uuid;
  r jsonb;
  c uuid;
  card uuid;
  v int;
begin
  perform pg_temp.as_('hugo');
  velha := (public.create_account('ct-g-0001', ctx, 'Conta velha', 'banco') ->> 'id')::uuid;
  insert into ids values ('hugo_velha', velha);
  -- Gastos e recebimento nas contas ativas; conta de outro contexto, nunca.
  rec := (public.create_record('ct-g-0002', ctx, carteira, 'despesa', 3000, '2026-10-06', 'Feira', 'Mercado')).id;
  insert into ids values ('gasto_cart', rec);
  perform public.create_record('ct-g-0003', ctx, principal, 'receita', 500000, '2026-10-01', 'Salário');
  perform pg_temp.expect_code(format($f$select public.create_record('ct-g-0004', %L, %L, 'despesa', 100, '2026-10-07', 'X')$f$, ctx, pg_temp.id('gaia_cart')),
    'conta_invalida', '22023');
  perform pg_temp.expect_code(format($f$select public.create_record('ct-g-0004', %L, %L, 'despesa', 100, '2026-10-07', 'X')$f$, ctx, gen_random_uuid()),
    'conta_invalida', '22023');
  -- Conta arquivada: nenhum gasto novo.
  troco := (public.create_record('ct-g-0005', ctx, velha, 'despesa', 700, '2026-10-05', 'Troco')).id;
  perform public.set_account_status('ct-g-0006', velha, 1, 'arquivada');
  perform pg_temp.expect_code(format($f$select public.create_record('ct-g-0007', %L, %L, 'despesa', 100, '2026-10-07', 'X')$f$, ctx, velha),
    'conta_invalida', '22023');
  -- Editar o gasto da arquivada mantendo a conta: vale (valor, data e descrição novos).
  r := to_jsonb(public.update_record('ct-g-0008', troco, 1, velha, 750, '2026-10-04', 'Troco do pão', null));
  assert r ->> 'account_id' = velha::text and (r ->> 'amount_cents')::bigint = 750 and r ->> 'description' = 'Troco do pão',
    'o gasto de uma conta arquivada continua editável com a mesma conta';
  -- Trocar de conta: para a excluída ou de outro contexto, não; para uma ativa, sim; e de volta para a arquivada, não.
  perform pg_temp.expect_code(format($f$select public.update_record('ct-g-0009', %L, 2, %L, 750, '2026-10-04', 'Troco do pão', null)$f$,
    troco, pg_temp.id('hugo_cart')), 'conta_invalida', '22023');
  perform pg_temp.expect_code(format($f$select public.update_record('ct-g-0010', %L, 2, %L, 750, '2026-10-04', 'Troco do pão', null)$f$,
    troco, pg_temp.id('gaia_cart')), 'conta_invalida', '22023');
  r := to_jsonb(public.update_record('ct-g-0011', troco, 2, carteira, 750, '2026-10-04', 'Troco do pão', null));
  assert r ->> 'account_id' = carteira::text and (r ->> 'version')::int = 3, 'trocar para a conta ativa vale';
  perform pg_temp.expect_code(format($f$select public.update_record('ct-g-0012', %L, 3, %L, 750, '2026-10-04', 'Troco do pão', null)$f$,
    troco, velha), 'conta_invalida', '22023');
  -- A validação do valor continua antes da conta (mesma ordem de sempre).
  perform pg_temp.expect_code(format($f$select public.update_record('ct-g-0013', %L, 3, %L, 0, '2026-10-04', 'Troco do pão', null)$f$,
    troco, velha), 'valor_invalido', '22023');
  perform public.delete_record('ct-g-0014', troco, 3);

  -- Conta a pagar paga em uma conta escolhida: o pagamento leva a conta; arquivada ou de outro contexto, não.
  r := public.create_commitment('ct-g-0020', ctx, 15000, '2026-10-15', 'Internet', 'Moradia');
  c := (r #>> '{commitment,id}')::uuid;
  perform pg_temp.expect_code(format($f$select public.pay_commitment('ct-g-0021', %L, 1, %L, 15000, '2026-10-07', 'Moradia')$f$, c, velha),
    'conta_invalida', '22023');
  perform pg_temp.expect_code(format($f$select public.pay_commitment('ct-g-0022', %L, 1, %L, 15000, '2026-10-07', 'Moradia')$f$, c, pg_temp.id('gaia_cart')),
    'conta_invalida', '22023');
  r := public.pay_commitment('ct-g-0023', c, 1, carteira, 15000, '2026-10-07', 'Moradia');
  assert r #>> '{record,account_id}' = carteira::text and (select paid_account_id from public.commitment_items where id = c) = carteira,
    'o pagamento leva a conta escolhida';
  -- Trocar a conta do gasto do pagamento (update_record): vale para uma ativa; a versão da conta a pagar sobe.
  rec := (r #>> '{record,id}')::uuid;
  r := to_jsonb(public.update_record('ct-g-0024', rec, 1, principal, 15000, '2026-10-07', 'Internet', 'Moradia'));
  assert r ->> 'account_id' = principal::text and (select paid_account_id from public.commitment_items where id = c) = principal,
    'trocar a conta do gasto muda a conta do pagamento';

  -- Fatura de cartão paga em uma conta escolhida; a conta arquivada, não.
  card := (public.create_card('ct-g-0030', ctx, 'Cartão Exemplo', '1234', 3, 10, 500000) #>> '{card,id}')::uuid;
  perform public.add_card_purchase('ct-g-0031', card, '2026-09-20', 20000, 1, 'Livro', 'Educação', null);
  v := (select commitment_version from public.invoice_items where card_id = card and month = '2026-10-01');
  perform pg_temp.expect_code(format($f$select public.pay_invoice('ct-g-0032', %L, '2026-10-01', %s, 20000, '2026-10-07', %L)$f$, card, v, velha),
    'conta_invalida', '22023');
  perform pg_temp.expect_code(format($f$select public.pay_invoice('ct-g-0033', %L, '2026-10-01', %s, 20000, '2026-10-07', %L)$f$, card, v, pg_temp.id('gaia_cart')),
    'conta_invalida', '22023');
  r := public.pay_invoice('ct-g-0034', card, '2026-10-01', v, 20000, '2026-10-07', carteira);
  assert r #>> '{record,account_id}' = carteira::text and (select paid_account_id from public.invoice_items where card_id = card and month = '2026-10-01') = carteira,
    'a fatura paga leva a conta escolhida';
  -- O gasto do pagamento da fatura só troca de conta (e de data): vale para uma ativa.
  rec := (r #>> '{record,id}')::uuid;
  r := to_jsonb(public.update_record('ct-g-0035', rec, 1, principal, 20000, '2026-10-07', 'Fatura Cartão Exemplo (outubro)', null));
  assert r ->> 'account_id' = principal::text, 'o pagamento da fatura troca de conta';
  -- Sem a conta, o banco usa uma conta ativa do contexto (a mais antiga; aqui todas nasceram na mesma transação).
  v := (select commitment_version from public.invoice_items where card_id = card and month = '2026-10-01');
  perform public.undo_invoice_payment('ct-g-0036', card, '2026-10-01', v);
  v := (select commitment_version from public.invoice_items where card_id = card and month = '2026-10-01');
  r := public.pay_invoice('ct-g-0037', card, '2026-10-01', v, 20000, '2026-10-07');
  assert exists (select 1 from public.financial_accounts a where a.id = (r #>> '{record,account_id}')::uuid and a.context_id = ctx and a.status = 'ativa'),
    'sem a conta, uma conta ativa do contexto';
  perform pg_temp.check_links();
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 11. Aporte e resgate de meta com a conta (A7): só aporte e resgate; conta ativa do mesmo contexto; só informativa. Alterar
-- movimento: a conta só é conferida quando muda; nulo tira a conta. Hash idêntico ao da 0007 com a conta nula.
-- ---------------------------------------------------------------------------
set role authenticated;
do $$
declare
  ctx uuid := pg_temp.id('hugo_ctx');
  principal uuid := pg_temp.id('hugo_acc');
  carteira uuid := pg_temp.id('hugo_cart2');
  velha uuid := pg_temp.id('hugo_velha');
  g uuid;
  r jsonb;
  m1 uuid;
  m2 uuid;
  m3 uuid;
  m4 uuid;
  before_totals bigint[];
  before_rows text;
begin
  perform pg_temp.as_('hugo');
  before_totals := pg_temp.totals('hugo_ctx', '2026-10-01');
  before_rows := pg_temp.records_state();
  g := (public.create_goal('ct-m-0001', ctx, 'objetivo', 'Reserva de teste', 500000, null, null, null, null, null, 100000, '2026-10-01') #>> '{goal,id}')::uuid;
  assert (select account_id is null from public.goal_movements where goal_id = g and kind = 'saldo_inicial'), 'o já guardado ao criar não leva conta';

  -- Sem a conta: igual ao de sempre, com o hash da 0007 (cliente antigo).
  r := public.add_goal_movement('ct-m-0002', g, 'aporte', 1000, '2026-10-07');
  m1 := (r #>> '{movement,id}')::uuid;
  assert r #>> '{movement,account_id}' is null and r -> 'movement' -> 'account_id' = 'null'::jsonb, 'sem conta: account_id nulo';
  assert (select request_hash from public.record_operations where idempotency_key = 'ct-m-0002')
       = md5(format('["registrar_movimento_meta", "%s", "aporte", 1000, "2026-10-07", null]', g)), 'hash da 0007 sem conta';
  assert public.add_goal_movement('ct-m-0002', g, 'aporte', 1000, '2026-10-07', null, null) = r, 'repetição com a conta explicitamente nula';
  -- Com a conta: aporte (Saiu de) e resgate (Foi para).
  r := public.add_goal_movement('ct-m-0003', g, 'aporte', 2000, '2026-10-07', 'Do salário', carteira);
  m2 := (r #>> '{movement,id}')::uuid;
  assert r #>> '{movement,account_id}' = carteira::text and (r #>> '{goal,saved_cents}')::bigint = 103000, 'aporte com a conta; o guardado soma como sempre';
  assert (select request_hash from public.record_operations where idempotency_key = 'ct-m-0003')
       = md5(format('["registrar_movimento_meta", "%s", "aporte", 2000, "2026-10-07", "Do salário", "%s"]', g, carteira)), 'hash com a conta';
  assert public.add_goal_movement('ct-m-0003', g, 'aporte', 2000, '2026-10-07', 'Do salário', carteira) = r, 'repetição devolve o estado gravado';
  perform pg_temp.expect_code(pg_temp.gm('ct-m-0003', g, 'aporte', 2000, '2026-10-07', principal), 'chave_reutilizada', 'PT409');
  perform pg_temp.expect_code(format($f$select public.add_goal_movement('ct-m-0003', %L, 'aporte', 2000, '2026-10-07', 'Do salário', null)$f$, g),
    'chave_reutilizada', 'PT409');
  r := public.add_goal_movement('ct-m-0004', g, 'resgate', 500, '2026-10-07', null, principal);
  m3 := (r #>> '{movement,id}')::uuid;
  assert r #>> '{movement,account_id}' = principal::text and (r #>> '{goal,saved_cents}')::bigint = 102500, 'resgate com a conta de destino';
  -- Só aporte e resgate levam conta.
  perform pg_temp.expect_code(pg_temp.gm('ct-m-0010', g, 'rendimento', 100, '2026-10-07', principal), 'campo_nao_se_aplica', '22023');
  perform pg_temp.expect_code(pg_temp.gm('ct-m-0011', g, 'valorizacao', 100, '2026-10-07', principal), 'campo_nao_se_aplica', '22023');
  perform pg_temp.expect_code(pg_temp.gm('ct-m-0012', g, 'desvalorizacao', 100, '2026-10-07', principal), 'campo_nao_se_aplica', '22023');
  perform pg_temp.expect_code(pg_temp.gm('ct-m-0013', g, 'saldo_inicial', 100, '2026-10-07', principal), 'tipo_invalido', '22023');
  -- Conta ativa do mesmo contexto: arquivada, excluída, de outro contexto ou inexistente são recusadas.
  perform pg_temp.expect_code(pg_temp.gm('ct-m-0014', g, 'aporte', 100, '2026-10-07', velha), 'conta_invalida', '22023');
  perform pg_temp.expect_code(pg_temp.gm('ct-m-0015', g, 'aporte', 100, '2026-10-07', pg_temp.id('hugo_cart')), 'conta_invalida', '22023');
  perform pg_temp.expect_code(pg_temp.gm('ct-m-0016', g, 'aporte', 100, '2026-10-07', pg_temp.id('gaia_cart')), 'conta_invalida', '22023');
  perform pg_temp.expect_code(pg_temp.gm('ct-m-0017', g, 'aporte', 100, '2026-10-07', gen_random_uuid()), 'conta_invalida', '22023');
  -- Ordem: tipo, depois valor, data e observação, depois a conta, depois o saldo da meta.
  perform pg_temp.expect_code(pg_temp.gm('ct-m-0018', g, 'poupar', 100, '2026-10-07', velha), 'tipo_invalido', '22023');
  perform pg_temp.expect_code(pg_temp.gm('ct-m-0019', g, 'aporte', 0, '2026-10-07', velha), 'valor_invalido', '22023');
  perform pg_temp.expect_code(pg_temp.gm('ct-m-0020', g, 'aporte', 100, '2026-10-08', velha), 'data_futura', '22023');
  perform pg_temp.expect_code(pg_temp.gm('ct-m-0021', g, 'rendimento', 100, '2026-10-08', velha), 'data_futura', '22023');
  perform pg_temp.expect_code(pg_temp.gm('ct-m-0022', g, 'resgate', 999999, '2026-10-07', velha), 'conta_invalida', '22023');
  perform pg_temp.expect_code(pg_temp.gm('ct-m-0023', g, 'resgate', 999999, '2026-10-07', carteira), 'saldo_da_meta_insuficiente', 'PT409', 'dia=2026-10-07');
  assert (select count(*) from public.record_operations where idempotency_key between 'ct-m-0010' and 'ct-m-0023') = 0, 'recusas não gravam operação';
  assert (select count(*) from public.goal_movements where goal_id = g and deleted_at is null) = 4, 'nem movimento';

  -- Alterar: a conta muda, é conferida só quando muda, e nula tira a conta.
  perform pg_temp.expect_stale(pg_temp.gu('ct-m-0030', m2, 0, 2000, '2026-10-07', carteira), 'versao_atual=1');
  r := public.update_goal_movement('ct-m-0031', m2, 1, 2500, '2026-10-06', 'Do salário', principal);
  assert r #>> '{movement,account_id}' = principal::text and (r #>> '{movement,version}')::int = 2 and (r #>> '{goal,saved_cents}')::bigint = 103000,
    'a conta mudou para a principal; o guardado reflete o valor novo';
  assert (select request_hash from public.record_operations where idempotency_key = 'ct-m-0031')
       = md5(format('["alterar_movimento_meta", "%s", 1, 2500, "2026-10-06", "Do salário", "%s"]', m2, principal)), 'hash com a conta';
  assert public.update_goal_movement('ct-m-0031', m2, 1, 2500, '2026-10-06', 'Do salário', principal) = r, 'repetição devolve o estado gravado';
  -- Nula tira a conta; o hash sem conta é o da 0007.
  r := public.update_goal_movement('ct-m-0032', m2, 2, 2500, '2026-10-06', 'Do salário');
  assert r #>> '{movement,account_id}' is null and (r #>> '{movement,version}')::int = 3, 'sem conta: a conta sai';
  assert (select request_hash from public.record_operations where idempotency_key = 'ct-m-0032')
       = md5(format('["alterar_movimento_meta", "%s", 2, 2500, "2026-10-06", "Do salário"]', m2)), 'hash da 0007 sem conta';
  perform pg_temp.expect_code(pg_temp.gu('ct-m-0033', m2, 3, 2500, '2026-10-06', velha), 'conta_invalida', '22023');
  perform pg_temp.expect_code(pg_temp.gu('ct-m-0034', m2, 3, 2500, '2026-10-06', pg_temp.id('gaia_cart')), 'conta_invalida', '22023');
  -- Movimento que não é aporte nem resgate não leva conta; o valor vem antes da conta.
  m4 := (public.add_goal_movement('ct-m-0035', g, 'rendimento', 300, '2026-10-07') #>> '{movement,id}')::uuid;
  perform pg_temp.expect_code(pg_temp.gu('ct-m-0036', m4, 1, 300, '2026-10-07', principal), 'campo_nao_se_aplica', '22023');
  perform pg_temp.expect_code(pg_temp.gu('ct-m-0037', m4, 1, 0, '2026-10-07', principal), 'valor_invalido', '22023');
  perform pg_temp.expect_code(pg_temp.gu('ct-m-0038', (select id from public.goal_movements where goal_id = g and kind = 'saldo_inicial'), 1, 100000,
    '2026-10-01', principal), 'campo_nao_se_aplica', '22023');
  -- Manter a conta do movimento depois de arquivada vale (só a troca para uma arquivada é recusada).
  perform public.update_goal_movement('ct-m-0039', m2, 3, 2500, '2026-10-06', 'Do salário', carteira);
  perform public.set_account_status('ct-m-0040', carteira, pg_temp.accver('hugo_cart2'), 'arquivada');
  r := public.update_goal_movement('ct-m-0041', m2, 4, 2600, '2026-10-06', 'Do salário', carteira);
  assert r #>> '{movement,account_id}' = carteira::text and (r #>> '{movement,amount_cents}')::bigint = 2600,
    'manter a conta arquivada do movimento vale';
  r := public.update_goal_movement('ct-m-0042', m2, 5, 2600, '2026-10-06', 'Do salário', null);
  assert r #>> '{movement,account_id}' is null, 'e tirar a conta também';
  perform pg_temp.expect_code(pg_temp.gu('ct-m-0043', m2, 6, 2600, '2026-10-06', carteira), 'conta_invalida', '22023');
  perform public.set_account_status('ct-m-0044', carteira, pg_temp.accver('hugo_cart2'), 'ativa');
  r := public.update_goal_movement('ct-m-0045', m2, 6, 2600, '2026-10-06', 'Do salário', carteira);
  assert r #>> '{movement,account_id}' = carteira::text, 'com a conta ativa de novo, a troca vale';

  -- Só informativo (A7): nenhum gasto, conta a pagar ou lançamento foi criado, e os totais do mês não mudaram.
  assert pg_temp.records_state() = before_rows and pg_temp.totals('hugo_ctx', '2026-10-01') = before_totals,
    'nenhum gasto, conta a pagar ou lançamento de cartão nasceu dos movimentos, e Recebido, Pago e Diferença não mudaram';
  perform pg_temp.check_links();
  -- Excluir o movimento: a conta fica livre dele.
  perform public.delete_goal_movement('ct-m-0050', m2, 7);
  perform public.delete_goal_movement('ct-m-0051', m3, 1);
  assert not exists (select 1 from public.goal_movements where goal_id = g and account_id is not null and deleted_at is null), 'nenhum movimento vivo com conta';
  insert into ids values ('hugo_goal', g);
end $$;
reset role;
do $$ begin
  -- Os movimentos de meta nunca entram nos totais: nenhum gasto nasceu deles.
  assert (select count(*) from public.financial_records r where r.description in ('Do salário', 'Reserva de teste')) = 0, 'movimentos não viram gasto';
end $$;


-- ---------------------------------------------------------------------------
-- 12. Permissões na Família da Ada: Davi só lê; Elisa escreve o que é dela; Fábio altera o que é dos outros; Gaia (de fora) não
-- encontra nada. A conta de outra pessoa exige "editar de outras pessoas".
-- ---------------------------------------------------------------------------
set role authenticated;
do $$
declare
  fam uuid := pg_temp.id('fam');
  casa uuid := pg_temp.id('fam_acc');
  cv int;
  r jsonb;
  e uuid;
begin
  -- Leitura: Davi, Elisa, Fábio e Ada veem as contas da Família; Gaia não.
  perform pg_temp.as_('davi');
  assert (select count(*) from public.financial_accounts where context_id = fam) = 1 and pg_temp.acc('fam_acc') = 'Conta da casa|banco|ativa|principal|1',
    'Davi lê a conta da casa';
  perform pg_temp.as_('gaia');
  assert (select count(*) from public.financial_accounts where context_id = fam) = 0, 'Gaia não vê as contas da Família';
  cv := 1;
  perform pg_temp.expect_code(pg_temp.ca('ct-f-0001', fam, 'Espiã', 'banco'), 'sem_permissao', '42501');
  perform pg_temp.expect_code(pg_temp.ua('ct-f-0002', casa, cv, 'Espiã', 'banco'), 'nao_encontrado', 'P0002');
  perform pg_temp.expect_code(pg_temp.da('ct-f-0003', casa, cv), 'nao_encontrado', 'P0002');
  perform pg_temp.expect_code(pg_temp.sa('ct-f-0004', casa, cv, 'arquivada'), 'nao_encontrado', 'P0002');
  perform pg_temp.expect_code(pg_temp.xa('ct-f-0005', casa, cv), 'nao_encontrado', 'P0002');
  -- Davi (só leitura): nenhuma escrita.
  perform pg_temp.as_('davi');
  perform pg_temp.expect_code(pg_temp.ca('ct-f-0010', fam, 'Do Davi', 'banco'), 'sem_permissao', '42501');
  perform pg_temp.expect_code(pg_temp.ua('ct-f-0011', casa, cv, 'Do Davi', 'banco'), 'sem_permissao', '42501');
  perform pg_temp.expect_code(pg_temp.da('ct-f-0012', casa, cv), 'sem_permissao', '42501');
  perform pg_temp.expect_code(pg_temp.sa('ct-f-0013', casa, cv, 'arquivada'), 'sem_permissao', '42501');
  perform pg_temp.expect_code(pg_temp.xa('ct-f-0014', casa, cv), 'sem_permissao', '42501');
  -- Elisa (escreve, sem "editar de outras pessoas"): cria a dela; não mexe na da Ada.
  perform pg_temp.as_('elisa');
  r := public.create_account('ct-f-0020', fam, 'Cartão da casa', 'outra');
  e := (r ->> 'id')::uuid;
  insert into ids values ('fam_elisa', e);
  assert not (r ->> 'is_default')::boolean and r ->> 'created_by' = pg_temp.id('elisa')::text, 'a conta de Elisa não é principal e leva a autoria dela';
  perform pg_temp.expect_code(pg_temp.ua('ct-f-0021', casa, cv, 'Da Elisa', 'banco'), 'sem_permissao', '42501');
  perform pg_temp.expect_code(pg_temp.da('ct-f-0022', casa, cv), 'sem_permissao', '42501');
  perform pg_temp.expect_code(pg_temp.sa('ct-f-0023', casa, cv, 'arquivada', e), 'sem_permissao', '42501');
  perform pg_temp.expect_code(pg_temp.xa('ct-f-0024', casa, cv), 'sem_permissao', '42501');
  r := public.update_account('ct-f-0025', e, 1, 'Cartão de vale', 'outra');
  assert r ->> 'name' = 'Cartão de vale' and (r ->> 'version')::int = 2, 'a própria conta ela altera';
  -- Fábio (altera o que é dos outros): renomeia a da Elisa e a da Ada, torna a de Elisa principal e a arquiva depois.
  perform pg_temp.as_('fabio');
  r := public.update_account('ct-f-0030', e, 2, 'Vale-refeição', 'outra');
  assert r ->> 'name' = 'Vale-refeição' and (r ->> 'version')::int = 3, 'Fábio altera a conta de Elisa';
  r := public.set_default_account('ct-f-0031', e, 3);
  assert (r ->> 'is_default')::boolean and pg_temp.acc('fam_acc') = 'Conta da casa|banco|ativa|-|2', 'Fábio muda a principal da Família';
  r := public.set_account_status('ct-f-0032', casa, 2, 'arquivada');
  assert r ->> 'status' = 'arquivada', 'Fábio arquiva a conta da Ada (não é a principal agora)';
  -- A única ativa (agora a de Elisa, também a principal) não se arquiva, com ou sem outra escolhida.
  perform pg_temp.expect_code(pg_temp.sa('ct-f-0033', e, 4, 'arquivada', casa), 'ultima_conta_ativa', 'PT409');
  perform pg_temp.expect_code(pg_temp.sa('ct-f-0034', e, 4, 'arquivada'), 'ultima_conta_ativa', 'PT409');
  r := public.set_account_status('ct-f-0036', casa, 3, 'ativa');
  r := public.set_account_status('ct-f-0037', e, 4, 'arquivada', casa);
  assert pg_temp.acc('fam_acc') like 'Conta da casa|banco|ativa|principal|%' and (select count(*) from public.financial_accounts where context_id = fam and is_default) = 1,
    'arquivar a principal passa a principal para a outra, na Família';
  r := public.delete_account('ct-f-0038', e, 5);
  assert r ->> 'deleted_at' is not null, 'Fábio exclui a conta de Elisa (sem lançamentos)';
  -- Elisa já não encontra a que foi excluída; Ada lê a da casa.
  perform pg_temp.as_('elisa');
  perform pg_temp.expect_code(pg_temp.ua('ct-f-0040', e, 6, 'Volta', 'outra'), 'nao_encontrado', 'P0002');
  perform pg_temp.as_('ada');
  assert (select count(*) from public.financial_accounts where context_id = fam) = 1, 'a Família volta a uma conta, a da casa';
  -- Revogar o vínculo: a repetição de uma criação anterior já não devolve a conta.
  perform pg_temp.as_('elisa');
  assert public.create_account('ct-f-0020', fam, 'Cartão da casa', 'outra') ->> 'id' = e::text, 'repetição da criação enquanto o vínculo vale';
  reset role;
  update public.context_memberships set revoked_at = now() where context_id = fam and person_id = pg_temp.id('elisa');
  set role authenticated;
  perform pg_temp.as_('elisa');
  perform pg_temp.expect_code(pg_temp.ca('ct-f-0020', fam, 'Cartão da casa', 'outra'), 'nao_encontrado', 'P0002');
  perform pg_temp.expect_code(pg_temp.ca('ct-f-0041', fam, 'Nova', 'outra'), 'sem_permissao', '42501');
  assert (select count(*) from public.financial_accounts where context_id = fam) = 0, 'sem vínculo, sem leitura';
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 13. Escrita direta, renomeação do app publicado, gatilhos e restrições.
-- ---------------------------------------------------------------------------
set role authenticated;
do $$
declare
  hugo_cart uuid := pg_temp.id('hugo_cart2');
  v int;
  n int;
begin
  perform pg_temp.as_('hugo');
  -- A renomeação direta do app publicado (update (name)) continua valendo e a versão sobe (gatilho).
  v := pg_temp.accver('hugo_cart2');
  update public.financial_accounts set name = 'Dinheiro' where id = hugo_cart;
  get diagnostics n = row_count;
  assert n = 1 and pg_temp.accver('hugo_cart2') = v + 1 and (select name from public.financial_accounts where id = hugo_cart) = 'Dinheiro',
    'update (name) direto: renomeia e soma 1 à versão';
  update public.financial_accounts set name = 'Carteira' where id = hugo_cart;
  -- Nome repetido na renomeação direta: o índice único recusa.
  perform pg_temp.expect_error(format($f$update public.financial_accounts set name = 'conta PRINCIPAL' where id = %L$f$, hugo_cart),
    '%financial_accounts_name_live%');
  perform pg_temp.expect_error(format($f$update public.financial_accounts set name = '' where id = %L$f$, hugo_cart), '%financial_accounts_name_check%');
  -- Nenhuma outra coluna e nenhuma outra operação direta.
  perform pg_temp.expect_error(format($f$update public.financial_accounts set status = 'arquivada' where id = %L$f$, hugo_cart), 'permission denied%');
  perform pg_temp.expect_error(format($f$update public.financial_accounts set is_default = true where id = %L$f$, hugo_cart), 'permission denied%');
  perform pg_temp.expect_error(format($f$update public.financial_accounts set kind = 'banco' where id = %L$f$, hugo_cart), 'permission denied%');
  perform pg_temp.expect_error(format($f$update public.financial_accounts set deleted_at = now() where id = %L$f$, hugo_cart), 'permission denied%');
  perform pg_temp.expect_error(format($f$update public.financial_accounts set version = 9 where id = %L$f$, hugo_cart), 'permission denied%');
  perform pg_temp.expect_error(format($f$update public.financial_accounts set initial_balance_cents = 0 where id = %L$f$, hugo_cart), 'permission denied%');
  perform pg_temp.expect_error(format($f$update public.financial_accounts set context_id = %L where id = %L$f$, pg_temp.id('gaia_ctx'), hugo_cart),
    'permission denied%');
  perform pg_temp.expect_error($f$insert into public.financial_accounts (context_id, name, created_by) values (gen_random_uuid(), 'X', gen_random_uuid())$f$,
    'permission denied%');
  perform pg_temp.expect_error(format($f$delete from public.financial_accounts where id = %L$f$, hugo_cart), 'permission denied%');
  -- RLS na renomeação direta: quem só lê ou não vê a conta não a renomeia.
  perform pg_temp.as_('davi');
  update public.financial_accounts set name = 'Invasão' where id = pg_temp.id('fam_acc');
  get diagnostics n = row_count;
  assert n = 0, 'Davi (só leitura) não renomeia';
  perform pg_temp.as_('gaia');
  update public.financial_accounts set name = 'Invasão' where id = hugo_cart;
  get diagnostics n = row_count;
  assert n = 0, 'Gaia não renomeia a conta de Hugo';
end $$;
reset role;


-- Gatilhos e restrições, conferidos como superusuário (sem a RLS nem os privilégios).
do $$
declare
  hc uuid := pg_temp.id('hugo_cart2');
  hp uuid := pg_temp.id('hugo_acc');
  hv uuid := pg_temp.id('hugo_velha');
  hx uuid := pg_temp.id('hugo_cart');   -- excluída
  v int;
begin
  -- A5: campos imutáveis.
  perform pg_temp.expect_error(format($f$update public.financial_accounts set context_id = %L where id = %L$f$, pg_temp.id('gaia_ctx'), hc), 'campo_imutavel');
  perform pg_temp.expect_error(format($f$update public.financial_accounts set created_by = %L where id = %L$f$, pg_temp.id('gaia'), hc), 'campo_imutavel');
  perform pg_temp.expect_error(format($f$update public.financial_accounts set created_at = created_at + interval '1 day' where id = %L$f$, hc), 'campo_imutavel');
  perform pg_temp.expect_error(format($f$update public.financial_accounts set currency = 'USD' where id = %L$f$, hc), 'campo_imutavel');
  perform pg_temp.expect_error(format($f$update public.financial_accounts set initial_balance_cents = 100 where id = %L$f$, hc), 'campo_imutavel');
  perform pg_temp.expect_error(format($f$update public.financial_accounts set id = gen_random_uuid() where id = %L$f$, hc), 'campo_imutavel');
  -- A conta excluída não muda mais.
  perform pg_temp.expect_error(format($f$update public.financial_accounts set name = 'Revive' where id = %L$f$, hx), 'campo_imutavel');
  perform pg_temp.expect_error(format($f$update public.financial_accounts set deleted_at = null, deleted_by = null where id = %L$f$, hx), 'campo_imutavel');
  -- A versão é do gatilho: soma 1 mesmo que a escrita mande outra, e a data de alteração é atualizada.
  v := pg_temp.accver('hugo_cart2');
  update public.financial_accounts set name = 'Carteira', version = 99 where id = hc;
  assert pg_temp.accver('hugo_cart2') = v + 1, 'a versão é sempre +1, do gatilho';
  -- Restrições.
  perform pg_temp.expect_error(format($f$update public.financial_accounts set kind = 'poupanca' where id = %L$f$, hc), '%financial_accounts_tipo%');
  perform pg_temp.expect_error(format($f$update public.financial_accounts set is_default = true where id = %L$f$, hc), '%financial_accounts_one_default%');
  perform pg_temp.expect_error(format($f$update public.financial_accounts set is_default = true where id = %L$f$, hv), '%financial_accounts_principal%');
  perform pg_temp.expect_error(format($f$update public.financial_accounts set is_default = true, deleted_at = now(), deleted_by = %L where id = %L$f$,
    pg_temp.id('hugo'), hc), '%financial_accounts_principal%');
  perform pg_temp.expect_error(format($f$update public.financial_accounts set deleted_at = now() where id = %L$f$, hc), '%financial_accounts_exclusao%');
  perform pg_temp.expect_error(format($f$update public.financial_accounts set deleted_by = %L where id = %L$f$, pg_temp.id('hugo'), hc), '%financial_accounts_exclusao%');
  perform pg_temp.expect_error(format($f$update public.financial_accounts set name = 'Conta Principal' where id = %L$f$, hc), '%financial_accounts_name_live%');
  perform pg_temp.expect_error(format($f$update public.financial_accounts set status = 'qualquer' where id = %L$f$, hc), '%financial_accounts_status_check%');
  perform pg_temp.expect_error(format($f$insert into public.financial_accounts (context_id, name, kind, created_by) values (%L, 'Z', 'poupanca', %L)$f$,
    pg_temp.id('hugo_ctx'), pg_temp.id('hugo')), '%financial_accounts_tipo%');
  perform pg_temp.expect_error(format($f$insert into public.financial_accounts (context_id, name, created_by, is_default) values (%L, 'Z', %L, true)$f$,
    pg_temp.id('hugo_ctx'), pg_temp.id('hugo')), '%financial_accounts_one_default%');
  perform pg_temp.expect_error(format($f$insert into public.financial_accounts (context_id, name, created_by, version) values (%L, 'Z', %L, 0)$f$,
    pg_temp.id('hugo_ctx'), pg_temp.id('hugo')), '%financial_accounts_versao%');
  -- Mesmo nome em contextos diferentes e mesmo nome de uma excluída: valem.
  perform pg_temp.expect_error(format($f$insert into public.financial_accounts (context_id, name, created_by) values (%L, 'carteira', %L)$f$,
    pg_temp.id('hugo_ctx'), pg_temp.id('hugo')), '%financial_accounts_name_live%');
  -- A7: movimento de meta e conta no mesmo contexto; só aporte e resgate.
  perform pg_temp.expect_error(format($f$update public.goal_movements set account_id = %L, version = version + 1 where goal_id = %L and kind = 'aporte' and deleted_at is null$f$,
    pg_temp.id('gaia_cart'), pg_temp.id('hugo_goal')), '%goal_movements_account_fk%');
  perform pg_temp.expect_error(format($f$update public.goal_movements set account_id = %L, version = version + 1 where goal_id = %L and kind = 'saldo_inicial'$f$,
    hp, pg_temp.id('hugo_goal')), '%goal_movements_conta%');
  -- Uma conta com movimento de meta (mesmo excluído) não é apagada fisicamente.
  perform pg_temp.expect_error(format($f$delete from public.financial_accounts where id = %L$f$, hc), '%violates foreign key%');
end $$;

-- ---------------------------------------------------------------------------
-- 14. Nada disso muda totais, contas a pagar, cartões, metas nem a renda comprometida (A7): o instantâneo antes e depois de uma
-- rodada de escritas de contas é o mesmo (Ada, contexto Pessoal com gastos, uma conta a pagar e uma meta).
-- ---------------------------------------------------------------------------
create function pg_temp.snapshot(p_ctx text) returns text language sql security definer set search_path = public, pg_temp as $$
  select format('%s | %s | %s | %s | %s',
    (select array[received_cents, paid_cents, difference_cents]::text from public.month_totals(pg_temp.id(p_ctx), '2026-10-01')),
    (select array[due_in_month_cents, overdue_before_cents, to_pay_cents, open_count]::text from public.month_to_pay(pg_temp.id(p_ctx), '2026-10-01')),
    (select format('%s %s', committed_cents, coalesce(committed_permille::text, '-')) from public.month_committed(pg_temp.id(p_ctx), '2026-10-01')),
    pg_temp.untouched(),
    (select coalesce(sum(saved_cents), 0) from public.goal_items where context_id = pg_temp.id(p_ctx)))
$$;
set role authenticated;
do $$
declare
  ctx uuid := pg_temp.id('ada_ctx');
  acc uuid := pg_temp.id('ada_acc');
  before_snap text;
  c uuid;
  n uuid;
  g jsonb;
begin
  perform pg_temp.as_('ada');
  perform public.create_record('ct-t-0001', ctx, acc, 'receita', 600000, '2026-10-01', 'Salário');
  perform public.create_record('ct-t-0002', ctx, acc, 'despesa', 250000, '2026-10-05', 'Aluguel');
  perform public.create_commitment('ct-t-0003', ctx, 15000, '2026-10-15', 'Internet', 'Moradia');
  g := public.create_goal('ct-t-0004', ctx, 'objetivo', 'Viagem', 500000, null, null, null, null, null, 100000, '2026-10-01');
  perform public.set_income_reference('ct-t-0005', ctx, '2026-09-01', 0, 600000, false);
  before_snap := pg_temp.snapshot('ada_ctx');
  assert before_snap like '{600000,250000,350000} | {15000,0,15000,1} | %', 'base de Ada: 6000 / 2500 / 3500 e 150 a pagar';
  n := (public.create_account('ct-t-0010', ctx, 'Carteira', 'dinheiro') ->> 'id')::uuid;
  c := (public.create_account('ct-t-0011', ctx, 'Cofre', 'outra') ->> 'id')::uuid;
  perform public.update_account('ct-t-0012', n, 1, 'Carteira de mão', 'dinheiro');
  perform public.set_default_account('ct-t-0013', n, 2);
  perform public.set_account_status('ct-t-0014', acc, pg_temp.vv(acc), 'arquivada');
  perform public.set_account_status('ct-t-0015', acc, pg_temp.vv(acc), 'ativa');
  perform public.set_default_account('ct-t-0016', acc, pg_temp.vv(acc));
  perform public.delete_account('ct-t-0017', c, 1);
  assert pg_temp.snapshot('ada_ctx') = before_snap, 'criar, alterar, tornar principal, arquivar, reativar e excluir contas não mudam nenhum total';
  -- Gastos e aportes em contas diferentes: os totais seguem a soma de sempre, sem separar por conta.
  perform public.create_record('ct-t-0020', ctx, n, 'despesa', 4000, '2026-10-06', 'Feira', 'Mercado');
  perform public.add_goal_movement('ct-t-0021', (g #>> '{goal,id}')::uuid, 'aporte', 10000, '2026-10-07', null, n);
  assert pg_temp.totals('ada_ctx', '2026-10-01') = array[600000, 254000, 346000]::bigint[], 'Pago soma os gastos de todas as contas';
  assert (select sum(saved_cents) from public.goal_items where context_id = ctx) = 110000, 'o guardado soma o aporte, de qualquer conta';
  assert (select count(*) from public.financial_records where context_id = ctx and kind = 'despesa') = 2, 'o aporte não virou gasto';
  insert into ids values ('ada_n', n);
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 15. Operações: as cinco ações novas apontam só para a conta (target_id), do mesmo contexto; a exclusão, para uma conta
-- excluída; os formatos errados são recusados; as cinco contam como anotação (A4).
-- ---------------------------------------------------------------------------
do $$
declare
  cases text[][] := array[
    -- ação, record_id, commitment_id, target_id
    array['criar_conta', null, null, null],
    array['alterar_conta', null, null, null],
    array['conta_principal', null, null, null],
    array['situacao_conta', null, null, null],
    array['excluir_conta', null, null, null],
    array['criar_conta', 'x', null, 'x'],
    array['alterar_conta', null, 'x', 'x'],
    array['conta_principal', 'x', 'x', 'x'],
    array['situacao_conta', 'x', null, 'x'],
    array['excluir_conta', null, 'x', 'x']
  ];
  i int;
begin
  for i in 1 .. array_length(cases, 1) loop
    perform pg_temp.expect_error(format($f$insert into public.record_operations
        (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id, target_id)
      values (%L, %L, %L, %L, 'x', %s, %s, %s)$f$,
      pg_temp.id('ada'), 'ct-o-1' || lpad(i::text, 3, '0'), cases[i][1], pg_temp.id('ada_ctx'),
      case when cases[i][2] is null then 'null' else 'gen_random_uuid()' end,
      case when cases[i][3] is null then 'null' else 'gen_random_uuid()' end,
      case when cases[i][4] is null then 'null' else 'gen_random_uuid()' end), '%record_operations_target_check%');
  end loop;
  perform pg_temp.expect_error(format($f$insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash)
    values (%L, 'ct-o-2001', 'criar_contas', gen_random_uuid(), 'x')$f$, pg_temp.id('ada')), '%record_operations_action_check%');
  perform pg_temp.expect_error(format($f$insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash)
    values (%L, 'ct-o-2002', 'principal_conta', gen_random_uuid(), 'x')$f$, pg_temp.id('ada')), '%record_operations_action_check%');
  assert (select array_agg(m[1] order by m[1] collate "C")
            from pg_constraint c, regexp_matches(pg_get_constraintdef(c.oid), '''([a-z_]+)''::text', 'g') m
           where c.conname = 'record_operations_action_check' and m[1] ~ 'conta' and m[1] !~ 'compromisso|cartao|fatura')
    = array['alterar_conta', 'conta_principal', 'criar_conta', 'excluir_conta', 'situacao_conta'], 'as 5 ações de conta';
  assert (select count(*) from pg_constraint c, regexp_matches(pg_get_constraintdef(c.oid), '''([a-z_]+)''::text', 'g') m
           where c.conname = 'record_operations_action_check') = 46, 'a lista vigente tem 46 ações (41 e as 5 de contas)';
  assert exists (select 1 from pg_constraint c where c.conname = 'record_operations_target_check'
                  and pg_get_constraintdef(c.oid) like '%criar_conta%' and pg_get_constraintdef(c.oid) like '%excluir_limite_comprometimento%'),
    'o ramo de alvo único inclui as cinco ações novas e as de antes';
  -- Toda operação de conta aponta para uma conta do mesmo contexto; a exclusão, para uma conta excluída.
  assert exists (select 1 from public.record_operations where action in ('criar_conta', 'alterar_conta', 'conta_principal', 'situacao_conta', 'excluir_conta')),
    'há operações de conta gravadas';
  assert not exists (select 1 from public.record_operations o
                      where o.action in ('criar_conta', 'alterar_conta', 'conta_principal', 'situacao_conta', 'excluir_conta')
                        and (o.record_id is not null or o.commitment_id is not null
                             or not exists (select 1 from public.financial_accounts a
                                             where a.id = o.target_id and a.context_id = o.context_id
                                               and (o.action <> 'excluir_conta' or a.deleted_at is not null)))),
    'operações apontam para a conta do mesmo contexto';
  assert (select count(distinct action) from public.record_operations
           where action in ('criar_conta', 'alterar_conta', 'conta_principal', 'situacao_conta', 'excluir_conta')) = 5,
    'as cinco ações foram gravadas por alguma função';
  -- A4: as escritas de conta contam como anotação (Gaia só criou uma conta).
  assert (select last_write_on from public.context_activity where person_id = pg_temp.id('gaia') and context_id = pg_temp.id('gaia_ctx')) = '2026-10-07',
    'criar conta conta como anotação na atividade';
end $$;

-- ---------------------------------------------------------------------------
-- 16. Privilégios e assinaturas (conferidos como superusuário).
-- ---------------------------------------------------------------------------
do $$ begin
  assert has_function_privilege('authenticated', 'public.create_account(text, uuid, text, text)', 'execute')
     and has_function_privilege('authenticated', 'public.update_account(text, uuid, integer, text, text)', 'execute')
     and has_function_privilege('authenticated', 'public.set_default_account(text, uuid, integer)', 'execute')
     and has_function_privilege('authenticated', 'public.set_account_status(text, uuid, integer, text, uuid)', 'execute')
     and has_function_privilege('authenticated', 'public.delete_account(text, uuid, integer)', 'execute')
     and has_function_privilege('authenticated', 'public.add_goal_movement(text, uuid, text, bigint, date, text, uuid)', 'execute')
     and has_function_privilege('authenticated', 'public.update_goal_movement(text, uuid, integer, bigint, date, text, uuid)', 'execute'),
    'authenticated executa as cinco funções de conta e as duas de movimento de meta';
  assert not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                      where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')), 'anon não executa nenhuma função';
  assert not has_function_privilege('authenticated', 'public.financial_accounts_guard()', 'execute')
     and not has_function_privilege('authenticated', 'public.financial_accounts_default()', 'execute')
     and not has_function_privilege('authenticated', 'public.clarevo_validate_account(text, text)', 'execute')
     and not has_function_privilege('authenticated', 'public.clarevo_check_account_name(uuid, text, uuid)', 'execute')
     and not has_function_privilege('authenticated', 'public.clarevo_check_account_limit(uuid, uuid)', 'execute')
     and not has_function_privilege('authenticated', 'public.clarevo_lock_account(uuid)', 'execute')
     and not has_function_privilege('authenticated', 'public.clarevo_validate_record(uuid, uuid, uuid, bigint, date, text, text, uuid)', 'execute'),
    'gatilhos e funções de apoio sem execute';
  assert pg_get_function_arguments('public.create_account(text, uuid, text, text)'::regprocedure)
       = 'p_idempotency_key text, p_context_id uuid, p_name text, p_kind text'
     and pg_get_function_arguments('public.update_account(text, uuid, integer, text, text)'::regprocedure)
       = 'p_idempotency_key text, p_account_id uuid, p_expected_version integer, p_name text, p_kind text'
     and pg_get_function_arguments('public.set_default_account(text, uuid, integer)'::regprocedure)
       = 'p_idempotency_key text, p_account_id uuid, p_expected_version integer'
     and pg_get_function_arguments('public.set_account_status(text, uuid, integer, text, uuid)'::regprocedure)
       = 'p_idempotency_key text, p_account_id uuid, p_expected_version integer, p_status text, p_new_default_id uuid DEFAULT NULL::uuid'
     and pg_get_function_arguments('public.delete_account(text, uuid, integer)'::regprocedure)
       = 'p_idempotency_key text, p_account_id uuid, p_expected_version integer'
     and pg_get_function_arguments('public.add_goal_movement(text, uuid, text, bigint, date, text, uuid)'::regprocedure)
       = 'p_idempotency_key text, p_goal_id uuid, p_kind text, p_amount_cents bigint, p_occurred_on date, p_note text DEFAULT NULL::text, p_account_id uuid DEFAULT NULL::uuid'
     and pg_get_function_arguments('public.update_goal_movement(text, uuid, integer, bigint, date, text, uuid)'::regprocedure)
       = 'p_idempotency_key text, p_movement_id uuid, p_expected_version integer, p_amount_cents bigint, p_occurred_on date, p_note text DEFAULT NULL::text, p_account_id uuid DEFAULT NULL::uuid',
    'assinaturas e nomes dos argumentos (chamada por nome no PostgREST)';
  assert (select bool_and(pg_get_function_result(p.oid) = 'jsonb' and p.prosecdef and p.provolatile = 'v')
            from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in ('create_account', 'update_account', 'set_default_account', 'set_account_status', 'delete_account'))
     and (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in ('create_account', 'update_account', 'set_default_account', 'set_account_status', 'delete_account')) = 5,
    'uma assinatura cada; retorno jsonb, definer, volatile';
  -- As assinaturas antigas saíram (sem sobrecarga ambígua); as demais continuam.
  assert to_regprocedure('public.add_goal_movement(text, uuid, text, bigint, date, text)') is null
     and to_regprocedure('public.update_goal_movement(text, uuid, integer, bigint, date, text)') is null
     and to_regprocedure('public.clarevo_validate_record(uuid, uuid, uuid, bigint, date, text, text)') is null
     and to_regprocedure('public.clarevo_validate_record(uuid, uuid, uuid, bigint, date, text, text, uuid)') is not null
     and (select count(*) from pg_proc where proname in ('add_goal_movement', 'update_goal_movement', 'clarevo_validate_record')) = 3,
    'as assinaturas antigas de metas e da validação saíram';
  assert to_regprocedure('public.update_record(text, uuid, integer, uuid, bigint, date, text, text)') is not null
     and to_regprocedure('public.pay_invoice(text, uuid, date, integer, bigint, date, uuid)') is not null
     and to_regprocedure('public.pay_commitment(text, uuid, integer, uuid, bigint, date, text)') is not null
     and to_regprocedure('public.create_record(text, uuid, uuid, public.record_kind, bigint, date, text, text, text)') is not null,
    'demais assinaturas sem mudança';
  assert (select array_agg(attname::text order by attnum) from pg_attribute
           where attrelid = 'public.financial_accounts'::regclass and attnum > 0 and not attisdropped)
    = array['id', 'context_id', 'name', 'currency', 'status', 'initial_balance_cents', 'created_by', 'created_at', 'kind', 'is_default',
            'version', 'updated_at', 'deleted_at', 'deleted_by'], 'colunas de financial_accounts';
  assert has_table_privilege('authenticated', 'public.financial_accounts', 'select')
     and not has_table_privilege('authenticated', 'public.financial_accounts', 'insert, delete, truncate')
     and not has_table_privilege('anon', 'public.financial_accounts', 'select')
     and has_column_privilege('authenticated', 'public.financial_accounts', 'name', 'update')
     and not has_column_privilege('authenticated', 'public.financial_accounts', 'status', 'update')
     and not has_column_privilege('authenticated', 'public.financial_accounts', 'kind', 'update')
     and not has_column_privilege('authenticated', 'public.financial_accounts', 'is_default', 'update')
     and not has_column_privilege('authenticated', 'public.financial_accounts', 'version', 'update')
     and not has_column_privilege('authenticated', 'public.financial_accounts', 'deleted_at', 'update'),
    'leitura (filtrada pela RLS); a única escrita direta é update (name), do app publicado, até a publicação da 0010';
  assert (select relrowsecurity from pg_class where oid = 'public.financial_accounts'::regclass), 'RLS ligada';
  assert (select count(*) from pg_policies where tablename = 'financial_accounts') = 2
     and (select qual from pg_policies where tablename = 'financial_accounts' and policyname = 'accounts_read') like '%deleted_at IS NULL%'
     and (select qual from pg_policies where tablename = 'financial_accounts' and policyname = 'accounts_rename') like '%deleted_at IS NULL%'
     and (select with_check from pg_policies where tablename = 'financial_accounts' and policyname = 'accounts_rename') like '%deleted_at IS NULL%',
    'duas políticas, as duas só para as contas não excluídas';
  assert (select indexdef from pg_indexes where indexname = 'financial_accounts_one_default')
       = 'CREATE UNIQUE INDEX financial_accounts_one_default ON public.financial_accounts USING btree (context_id) WHERE is_default'
     and (select indexdef from pg_indexes where indexname = 'financial_accounts_name_live')
       = 'CREATE UNIQUE INDEX financial_accounts_name_live ON public.financial_accounts USING btree (context_id, lower(name)) WHERE (deleted_at IS NULL)',
    'índices únicos: uma principal e um nome por contexto';
  assert exists (select 1 from pg_trigger where tgname = 'financial_accounts_guard' and tgrelid = 'public.financial_accounts'::regclass and not tgisinternal and tgenabled = 'O')
     and exists (select 1 from pg_trigger where tgname = 'financial_accounts_default' and tgrelid = 'public.financial_accounts'::regclass and not tgisinternal and tgenabled = 'O'),
    'gatilhos ligados';
  assert (select array_agg(attname::text order by attnum) from pg_attribute
           where attrelid = 'public.goal_movements'::regclass and attnum > 0 and not attisdropped)
    = array['id', 'goal_id', 'context_id', 'kind', 'amount_cents', 'occurred_on', 'note', 'created_by', 'version', 'created_at',
            'updated_at', 'deleted_at', 'deleted_by', 'account_id'], 'colunas de goal_movements';
  assert exists (select 1 from pg_constraint where conname = 'goal_movements_account_fk' and contype = 'f'
                  and pg_get_constraintdef(oid) like 'FOREIGN KEY (account_id, context_id) REFERENCES financial_accounts(id, context_id)%')
     and exists (select 1 from pg_constraint where conname = 'goal_movements_conta' and contype = 'c'), 'vínculo e restrição do movimento';
  assert not has_table_privilege('authenticated', 'public.goal_movements', 'insert, update, delete, truncate')
     and not has_any_column_privilege('authenticated', 'public.goal_movements', 'insert, update'), 'goal_movements segue sem escrita direta';
end $$;

-- Vínculos coerentes no fim de tudo.
select pg_temp.check_links();

rollback;
