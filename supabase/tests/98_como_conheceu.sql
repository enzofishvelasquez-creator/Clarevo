-- "Como você conheceu o Clarevo?" e as contagens da equipe (D-067, item 2; migração 0018): signup_sources, set_signup_source e
-- clarevo_staff_signup_metrics. A pessoa responde, se quiser, de onde conheceu o Clarevo (instagram, indicacao, empresa, busca, outro ou
-- prefiro_nao_dizer; lista fechada, sem texto livre) e pode mudar a resposta depois; a resposta é só dela (RLS), só entra em contagens
-- por semana e some com a conta (D-058). A escrita é só pela função: idempotência pela chave, versão crescente que o app manda, conta
-- sem espaço pessoal ou excluída recusada, operação gravada por último em record_operations e SEM contar como anotação para a atividade
-- (D-030). A função da equipe só roda no SQL Editor (nunca authenticated, anon nem service_role) e devolve, por semana inteira
-- (segunda a domingo, America/Sao_Paulo): contas criadas, contas com registro nos 7 primeiros dias e respostas por origem, com toda
-- contagem de 1 a 4 escondida ("menos de 5"), complemento escondido, janela aberta e sem total do período.
-- Pessoas FICTÍCIAS: Ana, Bia, Caio, Dora (exclui a conta), Eli (membro da Família da Ana, exclui a conta e vira "Pessoa que saiu"),
-- Gil (titular sozinho, exclui a conta), Hugo (nunca entrou no app), Iris (apagada direto em auth.users) e as coortes das semanas.
-- Tudo em uma transação desfeita no fim.
\set ON_ERROR_STOP 1
\set ana  '''00000000-0000-0000-0000-0000000000f1'''
\set bia  '''00000000-0000-0000-0000-0000000000f2'''
\set caio '''00000000-0000-0000-0000-0000000000f3'''
\set dora '''00000000-0000-0000-0000-0000000000f4'''
\set eli  '''00000000-0000-0000-0000-0000000000f5'''
\set gil  '''00000000-0000-0000-0000-0000000000f6'''
\set hugo '''00000000-0000-0000-0000-0000000000f7'''
\set iris '''00000000-0000-0000-0000-0000000000f8'''

begin;
set local clarevo.today = '2026-10-07';

create function pg_temp.expect_error(p_sql text, p_pattern text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm like p_pattern then return; end if;
    raise exception 'esperado "%", veio "%" (%) em: %', p_pattern, sqlerrm, sqlstate, left(p_sql, 300);
  end;
  raise exception 'esperado erro "%", mas passou: %', p_pattern, left(p_sql, 300);
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
    raise exception 'esperado % (%, "%"), veio "%" (%, "%") em: %', p_code, p_state, p_detail, sqlerrm, sqlstate, v_detail, left(p_sql, 300);
  end;
  raise exception 'esperado erro %, mas passou: %', p_code, left(p_sql, 300);
end $$;

-- versao_desatualizada (PT409) com o detalhe esperado.
create function pg_temp.expect_stale(p_sql text, p_detail text) returns void language sql as $$
  select pg_temp.expect_code(p_sql, 'versao_desatualizada', 'PT409', p_detail)
$$;

create temp table ids (name text primary key, id uuid);
grant select, insert on ids to authenticated, anon;
create temp table snaps (name text primary key, v text);
grant select on snaps to authenticated;
create function pg_temp.keep(p_name text, p_value text) returns void language sql as $$
  insert into snaps values (p_name, p_value) on conflict (name) do update set v = excluded.v
$$;
create function pg_temp.was(p_name text) returns text language sql as $$ select v from snaps where name = p_name $$;
create function pg_temp.id(p_name text) returns uuid language sql as $$ select id from ids where name = p_name $$;
-- Sessão de quem (nome em ids; nome desconhecido = sem sessão) e dia de hoje.
create function pg_temp.as_(p_name text) returns text language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(pg_temp.id(p_name)::text, ''), true)
$$;
create function pg_temp.today(p_day date) returns text language sql as $$
  select set_config('clarevo.today', to_char(p_day, 'YYYY-MM-DD'), true)
$$;

-- Chamada em texto (para expect_*).
create function pg_temp.ss(p_source text, p_key text, p_version integer) returns text language sql as $$
  select format('select public.set_signup_source(%L, %L, %L)', p_source, p_key, p_version)
$$;
-- A resposta da pessoa, direto na tabela (sem a RLS): "origem vversão" ou "-".
create function pg_temp.ans(p_name text) returns text language sql security definer set search_path = public, pg_temp as $$
  select coalesce((select format('%s v%s', source, version) from public.signup_sources where person_id = pg_temp.id(p_name)), '-')
$$;
-- Linhas e operações de responder (sem a RLS).
create function pg_temp.nrows() returns bigint language sql security definer set search_path = public, pg_temp as $$
  select count(*) from public.signup_sources
$$;
create function pg_temp.nops(p_person text default null) returns bigint language sql security definer set search_path = public, pg_temp as $$
  select count(*) from public.record_operations
   where action = 'responder_origem_cadastro' and (p_person is null or actor_id = pg_temp.id(p_person))
$$;
-- Atividade (D-030): "última anotação ausência-de ausência-até", direto na tabela (sem a RLS).
create function pg_temp.act(p_person text, p_ctx text) returns text language sql security definer set search_path = public, pg_temp as $$
  select coalesce((select format('%s %s %s', to_char(last_write_on, 'YYYY-MM-DD'), coalesce(to_char(absence_from_on, 'YYYY-MM-DD'), '-'),
                                 coalesce(to_char(absence_until_on, 'YYYY-MM-DD'), '-'))
                     from public.context_activity where person_id = pg_temp.id(p_person) and context_id = pg_temp.id(p_ctx)), '-')
$$;
-- Impressão digital de tudo o que a pergunta não pode mudar: registros, contas a pagar, séries, metas, cartões, marcas e revisões.
create function pg_temp.fp() returns text language sql security definer set search_path = public, pg_temp as $$
  select md5(concat_ws('#',
    (select coalesce(string_agg(to_jsonb(t)::text, ',' order by t.id), '') from public.financial_records t),
    (select coalesce(string_agg(to_jsonb(t)::text, ',' order by t.id), '') from public.commitments t),
    (select coalesce(string_agg(to_jsonb(t)::text, ',' order by t.id), '') from public.commitment_series t),
    (select coalesce(string_agg(to_jsonb(t)::text, ',' order by t.id), '') from public.goals t),
    (select coalesce(string_agg(to_jsonb(t)::text, ',' order by t.id), '') from public.goal_movements t),
    (select coalesce(string_agg(to_jsonb(t)::text, ',' order by t.id), '') from public.card_entries t),
    (select coalesce(string_agg(to_jsonb(t)::text, ',' order by t.id), '') from public.month_checks t),
    (select coalesce(string_agg(to_jsonb(t)::text, ',' order by t.person_id, t.context_id), '') from public.savings_checks t),
    (select coalesce(string_agg(to_jsonb(t)::text, ',' order by t.person_id, t.context_id), '') from public.return_reviews t),
    (select coalesce(string_agg(to_jsonb(t)::text, ',' order by t.id), '') from public.financial_accounts t)))
$$;
-- A conta padrão do contexto (para criar registros).
create function pg_temp.acc(p_ctx text) returns uuid language sql security definer set search_path = public, pg_temp as $$
  select id from public.financial_accounts where context_id = pg_temp.id(p_ctx) and is_default and deleted_at is null limit 1
$$;

insert into ids values ('ana', :ana), ('bia', :bia), ('caio', :caio), ('dora', :dora), ('eli', :eli), ('gil', :gil), ('hugo', :hugo), ('iris', :iris);
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  (:ana,  'ana@exemplo.test',  now(), '{"display_name":"Ana"}'),
  (:bia,  'bia@exemplo.test',  now(), '{"display_name":"Bia"}'),
  (:caio, 'caio@exemplo.test', now(), '{"display_name":"Caio"}'),
  (:dora, 'dora@exemplo.test', now(), '{"display_name":"Dora"}'),
  (:eli,  'eli@exemplo.test',  now(), '{"display_name":"Eli"}'),
  (:gil,  'gil@exemplo.test',  now(), '{"display_name":"Gil"}'),
  (:hugo, 'hugo@exemplo.test', now(), '{"display_name":"Hugo"}'),
  (:iris, 'iris@exemplo.test', now(), '{"display_name":"Iris"}');

-- Espaços pessoais (menos o do Hugo, que nunca entrou no app) e a Família da Ana, com o Eli (membro) e o Gil com a própria Família.
set role authenticated;
do $$
declare
  p text;
  space jsonb;
  r jsonb;
begin
  foreach p in array array['ana', 'bia', 'caio', 'dora', 'eli', 'gil', 'iris'] loop
    perform pg_temp.as_(p);
    space := public.ensure_personal_space('Conta principal');
    insert into ids values (p || '_ctx', (space ->> 'context_id')::uuid);
  end loop;
  perform pg_temp.as_('ana');
  insert into ids values ('fam', (public.create_family('Família da Ana', 'oc-fam-0001') #>> '{context,id}')::uuid);
  r := public.create_family_invite(pg_temp.id('fam'), 'membro', 'oc-inv-0001');
  perform pg_temp.as_('eli');
  perform public.accept_family_invite(r ->> 'code', 'oc-acc-0001');
  perform pg_temp.as_('gil');
  insert into ids values ('gfam', (public.create_family('Família do Gil', 'oc-fam-0002') #>> '{context,id}')::uuid);
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 1. Conta nova: nenhuma resposta (nem para ninguém), nenhuma operação, nenhuma pergunta feita pelo banco.
-- ---------------------------------------------------------------------------
set role authenticated;
do $$ begin
  perform pg_temp.as_('caio');
  assert (select count(*) from public.signup_sources) = 0, 'conta nova sem resposta de exemplo';
end $$;
reset role;
do $$ begin
  assert pg_temp.nrows() = 0 and pg_temp.nops() = 0, 'criar os espaços e a Família não grava resposta nem operação para ninguém';
end $$;

-- ---------------------------------------------------------------------------
-- 2. Primeira resposta: o resultado, a linha, a operação, e o que NÃO muda (dados e atividade).
-- ---------------------------------------------------------------------------
set role authenticated;
do $$
begin
  -- Ana anota um gasto em 07/10/2026; é a última anotação dela.
  perform pg_temp.as_('ana');
  perform public.create_record('oc-ana-rec-0001', pg_temp.id('ana_ctx'), pg_temp.acc('ana_ctx'), 'despesa', 1500, '2026-10-05', 'Café');
end $$;
reset role;
select pg_temp.keep('fp', pg_temp.fp());
do $$ begin
  assert pg_temp.act('ana', 'ana_ctx') = '2026-10-07 - -', 'a última anotação da Ana é de 07/10/2026';
end $$;
select pg_temp.today('2026-10-20');
set role authenticated;
do $$
declare
  r jsonb;
begin
  perform pg_temp.as_('ana');
  r := public.set_signup_source('instagram', 'oc-ana-0001', 0);
  assert r ->> 'source' = 'instagram' and (r ->> 'version')::int = 1 and r ->> 'answered_at' is not null and r ->> 'updated_at' is not null
     and (select array_agg(k order by k) from jsonb_object_keys(r) k) = array['answered_at', 'source', 'updated_at', 'version'],
    'a primeira resposta: instagram, versão 1, só os quatro campos: ' || r::text;
  -- A pessoa lê a própria linha.
  assert (select count(*) from public.signup_sources) = 1 and (select source from public.signup_sources) = 'instagram'
     and (select version from public.signup_sources) = 1, 'a Ana lê a própria resposta';
  -- Bia, que nunca anotou nada, responde: sem linha de atividade.
  perform pg_temp.as_('bia');
  assert (select count(*) from public.signup_sources) = 0, 'a Bia não lê a resposta da Ana';
  perform public.set_signup_source('prefiro_nao_dizer', 'oc-bia-0001', 0);
end $$;
reset role;
do $$
declare
  o public.record_operations%rowtype;
begin
  assert pg_temp.nrows() = 2 and pg_temp.ans('ana') = 'instagram v1' and pg_temp.ans('bia') = 'prefiro_nao_dizer v1', 'duas linhas: Ana e Bia';
  select * into o from public.record_operations where actor_id = pg_temp.id('ana') and idempotency_key = 'oc-ana-0001';
  assert o.action = 'responder_origem_cadastro' and o.context_id = pg_temp.id('ana_ctx')
     and o.record_id is null and o.commitment_id is null and o.target_id is null and o.request_hash ~ '^[0-9a-f]{32}$',
    'a operação fica no Pessoal da Ana, sem alvo';
  assert pg_temp.nops('ana') = 1 and pg_temp.nops('bia') = 1, 'uma operação cada';
  -- Responder não é anotar (D-030): a atividade da Ana não saiu de 07/10 (mesmo 13 dias depois), e a da Bia nem existe.
  assert pg_temp.act('ana', 'ana_ctx') = '2026-10-07 - -', 'responder não conta como anotação: ' || pg_temp.act('ana', 'ana_ctx');
  assert pg_temp.act('bia', 'bia_ctx') = '-', 'responder não cria atividade';
  assert pg_temp.fp() = pg_temp.was('fp'), 'a resposta não mudou nenhum registro, conta, meta, cartão, marca nem conta de origem';
end $$;
-- Controle: anotar de verdade, no mesmo dia, passa a contar.
set role authenticated;
do $$ begin
  perform pg_temp.as_('ana');
  perform public.create_record('oc-ana-rec-0002', pg_temp.id('ana_ctx'), pg_temp.acc('ana_ctx'), 'despesa', 900, '2026-10-19', 'Pão');
end $$;
reset role;
do $$ begin
  assert pg_temp.act('ana', 'ana_ctx') like '2026-10-20 %', 'anotar de verdade conta (o gatilho segue ligado): ' || pg_temp.act('ana', 'ana_ctx');
end $$;
select pg_temp.today('2026-10-07');

-- ---------------------------------------------------------------------------
-- 3. Validação e a ordem das recusas; recusa não grava nada e a chave pode ser usada de novo.
-- ---------------------------------------------------------------------------
select pg_temp.keep('rows', pg_temp.nrows()::text);
select pg_temp.keep('ops', pg_temp.nops()::text);
set role authenticated;
do $$
declare
  o text;
begin
  -- Sem sessão.
  perform pg_temp.as_('ninguem');
  perform pg_temp.expect_code(pg_temp.ss('instagram', 'oc-val-0001', 0), 'nao_autenticado', '42501');
  -- Chave: de 8 a 80 caracteres, e antes de qualquer outra coisa (nem a conta nem a origem são conferidas).
  perform pg_temp.as_('caio');
  perform pg_temp.expect_code(pg_temp.ss('instagram', null, 0), 'chave_invalida', '22023');
  perform pg_temp.expect_code(pg_temp.ss('instagram', '', 0), 'chave_invalida', '22023');
  perform pg_temp.expect_code(pg_temp.ss('instagram', 'curta12', 0), 'chave_invalida', '22023');
  perform pg_temp.expect_code(pg_temp.ss('instagram', repeat('x', 81), 0), 'chave_invalida', '22023');
  perform pg_temp.expect_code(pg_temp.ss('facebook', 'curta12', 0), 'chave_invalida', '22023');
  -- Hugo nunca entrou no app (sem Pessoal): sem_permissao, mesmo com origem inválida e versão errada.
  perform pg_temp.as_('hugo');
  perform pg_temp.expect_code(pg_temp.ss('instagram', 'oc-val-0002', 0), 'sem_permissao', '42501');
  perform pg_temp.expect_code(pg_temp.ss('facebook', 'oc-val-0003', 7), 'sem_permissao', '42501');
  -- Origem: só as seis da lista, em minúsculas e sem espaços; nada de texto livre.
  perform pg_temp.as_('caio');
  foreach o in array array['', ' ', 'Instagram', 'INSTAGRAM', ' instagram', 'instagram ', 'facebook', 'tiktok', 'amigo', 'indicação', 'prefiro não dizer',
                           'outro: um amigo me contou', 'instagram,busca', 'x'' or ''1''=''1', repeat('a', 500)] loop
    perform pg_temp.expect_code(pg_temp.ss(o, 'oc-val-0004', 0), 'origem_invalida', '22023');
  end loop;
  perform pg_temp.expect_code(pg_temp.ss(null, 'oc-val-0004', 0), 'origem_invalida', '22023');
  -- A origem é conferida antes da versão.
  perform pg_temp.expect_code(pg_temp.ss('facebook', 'oc-val-0004', 9), 'origem_invalida', '22023');
  -- Versão: sem resposta, a certa é 0.
  perform pg_temp.expect_stale(pg_temp.ss('instagram', 'oc-val-0004', 1), 'versao_atual=0');
  perform pg_temp.expect_stale(pg_temp.ss('instagram', 'oc-val-0004', 2), 'versao_atual=0');
  perform pg_temp.expect_stale(pg_temp.ss('instagram', 'oc-val-0004', -1), 'versao_atual=0');
  perform pg_temp.expect_stale(pg_temp.ss('instagram', 'oc-val-0004', null), 'versao_atual=0');
end $$;
reset role;
do $$ begin
  assert pg_temp.nrows()::text = pg_temp.was('rows') and pg_temp.nops()::text = pg_temp.was('ops') and pg_temp.ans('caio') = '-', 'recusa não grava nada';
end $$;
-- A chave recusada serve de novo: a mesma 'oc-val-0004' agora funciona (a Caio responde "empresa").
set role authenticated;
do $$
declare
  r jsonb;
begin
  perform pg_temp.as_('caio');
  r := public.set_signup_source('empresa', 'oc-val-0004', 0);
  assert r ->> 'source' = 'empresa' and (r ->> 'version')::int = 1, 'a chave que só foi recusada pode ser usada';
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 4. Idempotência e versão: mudar a resposta soma 1; a mesma origem não grava; versão velha (outro aparelho) é recusada.
-- ---------------------------------------------------------------------------
select pg_temp.keep('ops_antes', pg_temp.nops('ana')::text);
set role authenticated;
do $$
declare
  r jsonb;
begin
  perform pg_temp.as_('ana');
  -- Repetir a mesma chave e o mesmo pedido devolve o mesmo resultado e não grava de novo.
  r := public.set_signup_source('instagram', 'oc-ana-0001', 0);
  assert r ->> 'source' = 'instagram' and (r ->> 'version')::int = 1, 'a repetição devolve a resposta';
  -- A mesma chave com outro pedido (outra origem, outra versão) ou de outra operação é reutilizada.
  perform pg_temp.expect_code(pg_temp.ss('busca', 'oc-ana-0001', 0), 'chave_reutilizada', 'PT409');
  perform pg_temp.expect_code(pg_temp.ss('instagram', 'oc-ana-0001', 1), 'chave_reutilizada', 'PT409');
  perform pg_temp.expect_code(pg_temp.ss('instagram', 'oc-ana-rec-0001', 0), 'chave_reutilizada', 'PT409');
  -- A chave é por pessoa: a Bia, que tem a resposta "prefiro_nao_dizer" na versão 1, usa a chave 'oc-ana-0001' (da Ana) sem conflito, e
  -- a chave dela com outro pedido é reutilizada.
  perform pg_temp.as_('bia');
  perform pg_temp.expect_code(pg_temp.ss('instagram', 'oc-bia-0001', 0), 'chave_reutilizada', 'PT409');
  r := public.set_signup_source('busca', 'oc-ana-0001', 1);
  assert r ->> 'source' = 'busca' and (r ->> 'version')::int = 2, 'a chave da Ana é só da Ana: a Bia a usa para outra operação sua';
end $$;
reset role;
do $$ begin
  assert pg_temp.nops('ana')::text = pg_temp.was('ops_antes'), 'repetir e recusar não grava operação';
  assert pg_temp.ans('ana') = 'instagram v1', 'a resposta segue a mesma';
end $$;
select pg_temp.keep('ana_u1', (select updated_at::text from public.signup_sources where person_id = :ana));
select pg_temp.keep('ana_a1', (select answered_at::text from public.signup_sources where person_id = :ana));
set role authenticated;
do $$
declare
  r jsonb;
begin
  perform pg_temp.as_('ana');
  -- Mudar a resposta: versão 2; o dia da primeira resposta não muda.
  r := public.set_signup_source('busca', 'oc-ana-0002', 1);
  assert r ->> 'source' = 'busca' and (r ->> 'version')::int = 2 and (r ->> 'answered_at')::timestamptz = pg_temp.was('ana_a1')::timestamptz,
    'mudou para busca na versão 2, com a mesma data da primeira resposta';
  -- Outro aparelho ainda com a versão 1 (ou 0, ou nenhuma) é recusado, com a versão atual.
  perform pg_temp.expect_stale(pg_temp.ss('outro', 'oc-ana-0003', 1), 'versao_atual=2');
  perform pg_temp.expect_stale(pg_temp.ss('outro', 'oc-ana-0003', 0), 'versao_atual=2');
  perform pg_temp.expect_stale(pg_temp.ss('outro', 'oc-ana-0003', 3), 'versao_atual=2');
  perform pg_temp.expect_stale(pg_temp.ss('outro', 'oc-ana-0003', null), 'versao_atual=2');
  -- A repetição da primeira chave, depois da mudança, devolve a resposta de agora (como nas outras funções), sem erro e sem gravar.
  r := public.set_signup_source('instagram', 'oc-ana-0001', 0);
  assert r ->> 'source' = 'busca' and (r ->> 'version')::int = 2, 'a repetição devolve a resposta atual';
end $$;
reset role;
do $$ begin
  assert pg_temp.ans('ana') = 'busca v2' and pg_temp.nops('ana') = pg_temp.was('ops_antes')::bigint + 1, 'uma operação a mais, a da mudança';
end $$;
select pg_temp.keep('ana_u2', (select updated_at::text from public.signup_sources where person_id = :ana));
set role authenticated;
do $$
declare
  r jsonb;
begin
  perform pg_temp.as_('ana');
  -- Responder a mesma origem com a versão certa não muda nada (a versão não sobe), mas a chave fica gravada.
  r := public.set_signup_source('busca', 'oc-ana-0004', 2);
  assert r ->> 'source' = 'busca' and (r ->> 'version')::int = 2, 'a mesma origem devolve a resposta, versão 2';
  -- Com a versão velha, até a mesma origem é recusada.
  perform pg_temp.expect_stale(pg_temp.ss('busca', 'oc-ana-0005', 1), 'versao_atual=2');
  -- A chave da mesma origem repetida também é idempotente.
  r := public.set_signup_source('busca', 'oc-ana-0004', 2);
  assert (r ->> 'version')::int = 2, 'a repetição da mesma origem';
end $$;
reset role;
do $$ begin
  assert pg_temp.ans('ana') = 'busca v2', 'a versão não subiu';
  assert (select updated_at::text from public.signup_sources where person_id = pg_temp.id('ana')) = pg_temp.was('ana_u2'), 'a mesma origem não mexeu em updated_at';
  assert pg_temp.nops('ana') = pg_temp.was('ops_antes')::bigint + 2, 'a operação da mesma origem ficou gravada';
end $$;
-- As seis origens, uma depois da outra (Bia): a versão sobe de 1 em 1.
set role authenticated;
do $$
declare
  o text;
  i int := 2;
  r jsonb;
begin
  perform pg_temp.as_('bia');
  foreach o in array array['instagram', 'indicacao', 'empresa', 'busca', 'outro', 'prefiro_nao_dizer'] loop
    r := public.set_signup_source(o, 'oc-bia-seq-' || o, i);
    assert r ->> 'source' = o and (r ->> 'version')::int = i + 1, 'a origem ' || o || ' é aceita: ' || r::text;
    i := i + 1;
  end loop;
end $$;
reset role;
do $$ begin
  assert pg_temp.ans('bia') = 'prefiro_nao_dizer v8', 'a Bia terminou em prefiro_nao_dizer, versão 8';
  assert (select md5(string_agg(to_jsonb(t)::text, ',' order by t.id)) from public.financial_records t) is not null, 'os registros seguem lá';
end $$;

-- ---------------------------------------------------------------------------
-- 5. Leitura só da própria pessoa; escrita direta recusada; as restrições e a guarda da tabela.
-- ---------------------------------------------------------------------------
set role authenticated;
do $$
declare
  fam uuid := pg_temp.id('fam');
begin
  -- Eli, membro da Família da Ana, responde no Pessoal dele; a Ana (titular da Família) não lê a resposta do Eli, nem o Eli a da Ana.
  perform pg_temp.as_('eli');
  perform public.set_signup_source('empresa', 'oc-eli-0001', 0);
  perform public.create_record('oc-eli-rec-0001', fam, (select id from public.financial_accounts where context_id = fam and deleted_at is null limit 1), 'despesa', 700, '2026-10-05', 'Lanche da casa');
  assert (select count(*) from public.signup_sources) = 1 and (select source from public.signup_sources) = 'empresa', 'o Eli lê só a dele';
  perform pg_temp.as_('ana');
  assert (select count(*) from public.signup_sources) = 1 and (select source from public.signup_sources) = 'busca', 'a Ana lê só a dela, mesmo sendo titular da Família do Eli';
  perform pg_temp.as_('caio');
  assert (select count(*) from public.signup_sources) = 1 and (select source from public.signup_sources) = 'empresa', 'o Caio lê só a dele';
  perform pg_temp.as_('hugo');
  assert (select count(*) from public.signup_sources) = 0, 'quem nunca entrou no app não lê nada';
  perform pg_temp.as_('ninguem');
  assert (select count(*) from public.signup_sources) = 0, 'sem sessão não lê nada';
  -- Nenhuma visão nem função do app agrega a tabela: a única leitura é a própria linha, por (select auth.uid()).
  assert (select count(*) from public.signup_sources where person_id <> auth.uid()) = 0, 'nenhuma linha de outra pessoa';
end $$;
-- Escrita direta: ninguém grava, muda nem apaga.
select pg_temp.as_('ana');
select pg_temp.expect_error(format($f$insert into public.signup_sources (person_id, source) values (%L, 'instagram')$f$, pg_temp.id('hugo')), 'permission denied%');
select pg_temp.expect_error($f$insert into public.signup_sources (person_id, source) values (auth.uid(), 'instagram')$f$, 'permission denied%');
select pg_temp.expect_error($f$update public.signup_sources set source = 'instagram'$f$, 'permission denied%');
select pg_temp.expect_error($f$update public.signup_sources set version = 9$f$, 'permission denied%');
select pg_temp.expect_error($f$delete from public.signup_sources$f$, 'permission denied%');
select pg_temp.expect_error($f$truncate public.signup_sources$f$, 'permission denied%');
select pg_temp.expect_error($f$select person_id from public.signup_sources where false for update$f$, 'permission denied%');
reset role;
do $$ begin
  assert pg_temp.ans('ana') = 'busca v2' and pg_temp.ans('eli') = 'empresa v1' and pg_temp.nrows() = 4, 'nada mudou com as tentativas: Ana, Bia, Caio e Eli';
end $$;
set role anon;
select pg_temp.expect_error($f$select * from public.signup_sources$f$, 'permission denied%');
select pg_temp.expect_error($f$insert into public.signup_sources (person_id, source) values (gen_random_uuid(), 'instagram')$f$, 'permission denied%');
select pg_temp.expect_error($f$select public.set_signup_source('instagram', 'oc-anon-0001', 0)$f$, 'permission denied%');
reset role;
-- As restrições da tabela (como dono do banco) e a guarda: só a origem muda, uma versão por vez.
do $$
declare
  p uuid := pg_temp.id('ana');
begin
  perform pg_temp.expect_error(format($f$insert into public.signup_sources (person_id, source) values (%L, 'tiktok')$f$, pg_temp.id('hugo')), '%signup_sources_origem%');
  perform pg_temp.expect_error(format($f$insert into public.signup_sources (person_id, source) values (%L, '')$f$, pg_temp.id('hugo')), '%signup_sources_origem%');
  perform pg_temp.expect_error(format($f$insert into public.signup_sources (person_id, source) values (%L, null)$f$, pg_temp.id('hugo')), '%null value%');
  perform pg_temp.expect_error(format($f$insert into public.signup_sources (person_id, source, version) values (%L, 'busca', 0)$f$, pg_temp.id('hugo')), '%signup_sources_version_check%');
  perform pg_temp.expect_error($f$insert into public.signup_sources (person_id, source) values (gen_random_uuid(), 'busca')$f$, '%signup_sources_person_id_fkey%');
  perform pg_temp.expect_error(format($f$insert into public.signup_sources (person_id, source) values (%L, 'busca')$f$, p), '%signup_sources_pkey%');
  perform pg_temp.expect_code(format($f$update public.signup_sources set source = 'outro' where person_id = %L$f$, p), 'campo_imutavel', '42501');
  perform pg_temp.expect_code(format($f$update public.signup_sources set version = version + 1 where person_id = %L$f$, p), 'campo_imutavel', '42501');
  perform pg_temp.expect_code(format($f$update public.signup_sources set source = 'outro', version = version + 2 where person_id = %L$f$, p), 'campo_imutavel', '42501');
  perform pg_temp.expect_code(format($f$update public.signup_sources set source = 'outro', version = version - 1 where person_id = %L$f$, p), 'campo_imutavel', '42501');
  perform pg_temp.expect_code(format($f$update public.signup_sources set updated_at = now() where person_id = %L$f$, p), 'campo_imutavel', '42501');
  perform pg_temp.expect_code(format($f$update public.signup_sources set source = 'outro', version = version + 1, answered_at = answered_at + interval '1 day' where person_id = %L$f$, p), 'campo_imutavel', '42501');
  perform pg_temp.expect_code(format($f$update public.signup_sources set source = 'outro', version = version + 1, person_id = %L where person_id = %L$f$, pg_temp.id('hugo'), p), 'campo_imutavel', '42501');
  assert pg_temp.ans('ana') = 'busca v2', 'as tentativas não mudaram a linha';
  -- A guarda deixa mudar a origem uma versão por vez, e carimba updated_at.
  update public.signup_sources set source = 'outro', version = version + 1, updated_at = '2000-01-01' where person_id = p;
  assert (select (source, version) from public.signup_sources where person_id = p) = ('outro'::text, 3)
     and (select updated_at > '2020-01-01' from public.signup_sources where person_id = p), 'a mudança por fora da função respeita a guarda';
  update public.signup_sources set source = 'busca', version = version + 1 where person_id = p;
  assert pg_temp.ans('ana') = 'busca v4', 'a Ana ficou em busca, versão 4 (a conta feita à mão acima)';
end $$;
select pg_temp.keep('ana_busca_v4', pg_temp.ans('ana'));
-- Sem texto livre: a única coluna de texto é a origem (e a lista é fechada); o resto é pessoa, datas e versão.
do $$ begin
  assert (select array_agg(format('%s %s', column_name, data_type) order by ordinal_position) from information_schema.columns
           where table_schema = 'public' and table_name = 'signup_sources')
       = array['person_id uuid', 'source text', 'answered_at timestamp with time zone', 'updated_at timestamp with time zone', 'version integer'],
    'as colunas da tabela: pessoa, origem, datas e versão';
  assert (select pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.signup_sources'::regclass and conname = 'signup_sources_origem')
       like '%instagram%indicacao%empresa%busca%outro%prefiro_nao_dizer%', 'a lista fechada das seis origens';
  assert (select confdeltype from pg_constraint where conrelid = 'public.signup_sources'::regclass and contype = 'f') = 'c', 'a chave para persons tem cascata';
end $$;

-- ---------------------------------------------------------------------------
-- 6. Contagens da equipe: privilégios, validação do período e o que cada semana mostra.
-- ---------------------------------------------------------------------------
-- 6a. Só quem roda no SQL Editor executa.
do $$
declare
  f constant text := 'clarevo_staff_signup_metrics(date, date)';
begin
  assert exists (select 1 from pg_roles where rolname = 'service_role' and rolbypassrls and not rolinherit and not rolcanlogin), 'o papel service_role existe, como no Supabase';
  assert has_function_privilege('service_role', 'public.clarevo_normalize_email(text)', 'execute'), 'o teste vale: service_role mantém o execute padrão nas outras funções';
  assert not has_function_privilege('authenticated', 'public.' || f, 'execute') and not has_function_privilege('anon', 'public.' || f, 'execute'),
    'sem execute para authenticated nem anon';
  assert not has_function_privilege('service_role', 'public.' || f, 'execute'), 'sem execute para service_role';
  assert not exists (select 1 from pg_proc p where p.oid = ('public.' || f)::regprocedure
                        and exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where a.grantee = 0)), 'sem execute para public';
  assert (select prosecdef and proconfig @> array['search_path=public'] and provolatile = 's' and proretset from pg_proc where oid = ('public.' || f)::regprocedure),
    'security definer com search_path fixo, stable, devolve conjunto';
  assert (select array_agg(format('%s %s', a.arg, a.t::regtype::text) order by a.o) from pg_proc p,
            lateral unnest(p.proargnames, p.proargmodes::text[], p.proallargtypes::oid[]) with ordinality as a(arg, m, t, o)
           where p.oid = ('public.' || f)::regprocedure and a.m = 't') = array['week_start date', 'measure text', 'total integer', 'mark text'], 'as colunas da resposta';
end $$;
set role authenticated;
select pg_temp.as_('ana');
select pg_temp.expect_error($f$select * from public.clarevo_staff_signup_metrics('2026-08-01', '2026-10-01')$f$, 'permission denied%');
reset role;
set role anon;
select pg_temp.expect_error($f$select * from public.clarevo_staff_signup_metrics('2026-08-01', '2026-10-01')$f$, 'permission denied%');
reset role;
set role service_role;
select pg_temp.expect_error($f$select * from public.clarevo_staff_signup_metrics('2026-08-01', '2026-10-01')$f$, 'permission denied%');
reset role;

-- 6b. Período: datas obrigatórias e finitas, fim depois do começo, no máximo 104 semanas; datas soltas viram semanas inteiras.
do $$ begin
  perform pg_temp.expect_code($f$select * from public.clarevo_staff_signup_metrics(null, '2026-10-01')$f$, 'periodo_invalido', '22023');
  perform pg_temp.expect_code($f$select * from public.clarevo_staff_signup_metrics('2026-10-01', null)$f$, 'periodo_invalido', '22023');
  perform pg_temp.expect_code($f$select * from public.clarevo_staff_signup_metrics('2026-10-02', '2026-10-01')$f$, 'periodo_invalido', '22023');
  perform pg_temp.expect_code($f$select * from public.clarevo_staff_signup_metrics('-infinity', '2026-10-01')$f$, 'periodo_invalido', '22023');
  perform pg_temp.expect_code($f$select * from public.clarevo_staff_signup_metrics('2026-10-01', 'infinity')$f$, 'periodo_invalido', '22023');
  -- 104 semanas cabem; 105 não.
  assert (select count(*) from public.clarevo_staff_signup_metrics('2024-10-07', '2026-10-04')) = 104 * 8, '104 semanas inteiras cabem: 832 linhas';
  perform pg_temp.expect_code($f$select * from public.clarevo_staff_signup_metrics('2024-09-30', '2026-10-04')$f$, 'periodo_invalido', '22023');
  -- Um dia solto vira a semana inteira dele (segunda a domingo); duas datas em semanas vizinhas, duas semanas.
  assert (select array_agg(distinct week_start) from public.clarevo_staff_signup_metrics('2026-08-05', '2026-08-05')) = array['2026-08-03'::date], 'quarta-feira: a semana de segunda 03/08';
  assert (select array_agg(distinct week_start order by week_start) from public.clarevo_staff_signup_metrics('2026-08-09', '2026-08-10'))
       = array['2026-08-03'::date, '2026-08-10'], 'domingo e segunda: duas semanas';
  assert (select array_agg(distinct week_start order by week_start) from public.clarevo_staff_signup_metrics('2026-08-03', '2026-08-09')) = array['2026-08-03'::date], 'segunda a domingo: uma semana';
  assert (select array_agg(measure) from public.clarevo_staff_signup_metrics('2026-08-03', '2026-08-03'))
       = array['contas_criadas', 'contas_com_registro_7_dias', 'origem_instagram', 'origem_indicacao', 'origem_empresa', 'origem_busca', 'origem_outro', 'origem_prefiro_nao_dizer'],
    'as oito medidas, nesta ordem';
end $$;

-- 6c. As coortes. Cada pessoa nasce pelas funções do app e depois tem as datas ajustadas (como dono do banco, sem os gatilhos), porque
-- o teste precisa de contas "criadas" em semanas passadas. A semana é a do cadastro (America/Sao_Paulo); registro é o que a
-- migração documenta. Hoje, para a função, é 07/10/2026 (quarta-feira).
create temp table plan (name text primary key, created timestamptz, kind text, delay interval, src text);
grant select on plan to authenticated;
-- W0 (06/07): a Ana, a Bia, o Caio, a Dora, o Eli, o Gil e a Iris, mais 5 pessoas que responderam "instagram". Nenhuma tem registro nos 7 dias.
insert into plan (name, created, src)
select 'w0_x' || i, '2026-07-08 12:00:00-03'::timestamptz, 'instagram' from generate_series(1, 5) i;
-- W1 (03/08, fechada): 14 contas, 7 com registro nos 7 primeiros dias.
insert into plan values
  ('w1_r1', '2026-08-04 12:00:00-03', 'registro',                 interval '0',                      'instagram'),  -- no mesmo instante (conta)
  ('w1_r2', '2026-08-04 12:00:00-03', 'registro',                 interval '6 days 23:59:59',        'instagram'),  -- um segundo antes de fechar
  ('w1_r3', '2026-08-04 12:00:00-03', 'conta',                    interval '2 days',                 'instagram'),  -- conta a pagar avulsa
  ('w1_r4', '2026-08-04 12:00:00-03', 'serie',                    interval '1 day',                  'instagram'),  -- gasto fixo
  ('w1_r5', '2026-08-04 12:00:00-03', 'cartao',                   interval '3 days',                 'instagram'),  -- compra no cartão
  ('w1_r6', '2026-08-04 12:00:00-03', 'registro_excluido',        interval '1 day',                  'indicacao'),  -- excluído depois: conta
  ('w1_r7', '2026-08-04 12:00:00-03', 'cartao_parcelas',          interval '2 days',                 'indicacao'),  -- compra parcelada: a 1ª parcela conta
  ('w1_n1', '2026-08-04 12:00:00-03', 'registro',                 interval '7 days',                 'indicacao'),  -- exatamente 7 dias: fora
  ('w1_n2', '2026-08-04 12:00:00-03', 'registro',                 interval '8 days',                 'busca'),
  ('w1_n3', '2026-08-04 12:00:00-03', 'serie_gerada',             interval '10 days',                'outro'),      -- as contas que a série gera não contam
  ('w1_n4', '2026-08-04 12:00:00-03', 'cartao_encargo',           interval '1 day',                  'outro'),      -- encargo e fatura não contam
  ('w1_n5', '2026-08-04 12:00:00-03', 'preparacao',               interval '1 day',                  null),         -- conta de origem, cartão, meta, plano, marca
  ('w1_n6', '2026-08-04 12:00:00-03', 'registro',                 interval '-1 second',              null),         -- antes de a conta existir: fora
  ('w1_n7', '2026-08-04 12:00:00-03', 'cartao_parcelas_tarde',    interval '10 days',                null);         -- só as parcelas 2 e 3 dentro: fora
-- W2 (10/08): 3 contas, as 3 com registro.
insert into plan select 'w2_' || i, '2026-08-11 12:00:00-03'::timestamptz, 'registro', interval '1 day', 'outro' from generate_series(1, 3) i;
-- W3 (17/08): 20 contas, 17 com registro (as 3 sem registro são o complemento); 8 "empresa" e 6 "instagram".
insert into plan
select 'w3_' || i, '2026-08-18 12:00:00-03'::timestamptz, case when i <= 17 then 'registro' end, interval '1 day',
       case when i <= 8 then 'empresa' when i <= 14 then 'instagram' end
  from generate_series(1, 20) i;
-- W4 (24/08): 6 contas, 1 com registro; 5 "indicacao" e 1 "busca".
insert into plan
select 'w4_' || i, '2026-08-25 12:00:00-03'::timestamptz, case when i = 1 then 'registro' end, interval '1 day', case when i <= 5 then 'indicacao' else 'busca' end
  from generate_series(1, 6) i;
-- W5 (31/08): só uma conta, criada no domingo 06/09 às 23:30 de São Paulo (02:30 UTC de segunda): a semana é a de São Paulo, não a do UTC.
insert into plan values ('w5_tz1', '2026-09-07 02:30:00+00', null, interval '1 day', null);
-- W6 (07/09): 5 contas, nenhuma com registro. A segunda 00:00 de São Paulo (03:00 UTC) e o domingo 23:59:59 de São Paulo (02:59:59 UTC de segunda)
-- do fim da semana; duas respondem "outro".
insert into plan values
  ('w6_tz2', '2026-09-07 03:00:00+00', null, interval '1 day', 'outro'),
  ('w6_tz3', '2026-09-14 02:59:59+00', null, interval '1 day', 'outro');
insert into plan select 'w6_' || i, '2026-09-09 12:00:00-03'::timestamptz, null, interval '1 day', null from generate_series(1, 3) i;
-- W7 (14/09): 8 contas, 4 com registro (4 sem registro); 5 "prefiro_nao_dizer" e 3 "busca".
insert into plan
select 'w7_' || i, '2026-09-15 12:00:00-03'::timestamptz, case when i <= 4 then 'registro' end, interval '1 day', case when i <= 5 then 'prefiro_nao_dizer' else 'busca' end
  from generate_series(1, 8) i;
-- W8 (21/09, fechada desde 05/10): 5 contas, as 5 com registro (o complemento é zero).
insert into plan select 'w8_' || i, '2026-09-22 12:00:00-03'::timestamptz, 'registro', interval '1 day', null from generate_series(1, 5) i;
-- W9 (28/09): terminou em 04/10, mas a janela de 7 dias só fecha em 12/10: 6 contas, 2 com registro.
insert into plan select 'w9_' || i, '2026-09-29 12:00:00-03'::timestamptz, case when i <= 2 then 'registro' end, interval '1 day', null from generate_series(1, 6) i;
-- W10 (05/10): a semana de hoje: 5 contas, 5 respostas "instagram".
insert into plan select 'w10_' || i, '2026-10-06 12:00:00-03'::timestamptz, null, interval '1 day', 'instagram' from generate_series(1, 5) i;

-- Cadastro dos espaços e do que cada pessoa faz (pelas funções do app), no dia fixo.
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
select md5('oc-' || name)::uuid, name || '@coorte.test', now(), jsonb_build_object('display_name', 'Pessoa ' || name) from plan;
insert into ids select name, md5('oc-' || name)::uuid from plan;
set role authenticated;
do $$
declare
  r record;
  ctx uuid;
  acc uuid;
  card uuid;
  rec uuid;
  ser uuid;
  n int := 0;
begin
  for r in select * from plan order by name loop
    perform pg_temp.as_(r.name);
    ctx := (public.ensure_personal_space('Conta principal') ->> 'context_id')::uuid;
    acc := (select id from public.financial_accounts where context_id = ctx and is_default and deleted_at is null limit 1);
    n := n + 1;
    if r.kind in ('registro', 'registro_excluido') then
      rec := (public.create_record('oc-c-' || r.name || '-1', ctx, acc, 'despesa', 1000, '2026-10-05', 'Teste')).id;
      if r.kind = 'registro_excluido' then
        perform public.delete_record('oc-c-' || r.name || '-2', rec, 1);
      end if;
    elsif r.kind = 'conta' then
      perform public.create_commitment('oc-c-' || r.name || '-1', ctx, 5000, '2026-10-20', 'Conta avulsa', null);
    elsif r.kind in ('serie', 'serie_gerada') then
      perform public.create_series('oc-c-' || r.name || '-1', ctx, 'mensal', 'conta', 'Streaming', null, 4500, 'fixo', 10, '2026-10-01', 1, null, null, null);
    elsif r.kind in ('cartao', 'cartao_parcelas', 'cartao_parcelas_tarde', 'cartao_encargo') then
      card := (public.create_card('oc-c-' || r.name || '-1', ctx, 'Cartão', '1234', 5, 12, 500000) #>> '{card,id}')::uuid;
      if r.kind = 'cartao_encargo' then
        perform public.add_card_charge('oc-c-' || r.name || '-2', card, '2026-11-01', 'juros', 1230);
      else
        perform public.add_card_purchase('oc-c-' || r.name || '-2', card, '2026-10-02', 3000, case when r.kind = 'cartao' then 1 else 3 end, 'Compra', null, null);
      end if;
    elsif r.kind = 'preparacao' then
      perform public.create_account('oc-c-' || r.name || '-1', ctx, 'Carteira', 'dinheiro');
      perform public.create_card('oc-c-' || r.name || '-2', ctx, 'Cartão', '1234', 5, 12, 500000);
      perform public.create_goal('oc-c-' || r.name || '-3', ctx, 'objetivo', 'Viagem', 500000, '2027-10-01', 50000, null, null, null, 10000, '2026-10-07');
      perform public.set_savings_answer('oc-c-' || r.name || '-4', ctx, 0, 'depois');
      perform public.set_month_check(ctx, '2026-08-01', 'recebimentos', 'oc-c-' || r.name || '-5', 0);
    end if;
    if r.src is not null then
      perform public.set_signup_source(r.src, 'oc-c-' || r.name || '-src', 0);
    end if;
  end loop;
  assert n = (select count(*) from plan), 'todas as pessoas da coorte entraram';
end $$;
reset role;

-- As datas: tudo o que as pessoas criaram vai para 30 dias depois do cadastro (fora da janela); depois cada tipo vai para onde o plano manda.
-- As bases (Ana, Bia, Caio, Dora, Eli, Gil e Iris) vão para a semana W0, com o mesmo critério.
update public.persons set created_at = '2026-07-08 12:00:00-03' where id in (:ana, :bia, :caio, :dora, :eli, :gil, :iris);
update public.persons p set created_at = pl.created from plan pl join ids i on i.name = pl.name where p.id = i.id;
set session_replication_role = replica;
update public.financial_records r set created_at = p.created_at + interval '30 days' from public.persons p where r.created_by = p.id;
update public.commitments c set created_at = p.created_at + interval '30 days' from public.persons p where c.created_by = p.id;
update public.commitment_series s set created_at = p.created_at + interval '30 days' from public.persons p where s.created_by = p.id;
update public.card_entries e set created_at = p.created_at + interval '30 days' from public.persons p where e.created_by = p.id;
-- registro e registro_excluido: o gasto.
update public.financial_records r set created_at = p.created_at + pl.delay
  from public.persons p join ids i on i.id = p.id join plan pl on pl.name = i.name
 where r.created_by = p.id and pl.kind in ('registro', 'registro_excluido');
-- conta: a conta a pagar avulsa.
update public.commitments c set created_at = p.created_at + pl.delay
  from public.persons p join ids i on i.id = p.id join plan pl on pl.name = i.name
 where c.created_by = p.id and pl.kind = 'conta' and c.series_id is null and c.card_id is null;
-- serie: a série; serie_gerada: a série fora da janela e as contas que ela gerou dentro.
update public.commitment_series s set created_at = p.created_at + pl.delay
  from public.persons p join ids i on i.id = p.id join plan pl on pl.name = i.name
 where s.created_by = p.id and pl.kind in ('serie', 'serie_gerada');
update public.commitments c set created_at = p.created_at + interval '1 day'
  from public.persons p join ids i on i.id = p.id join plan pl on pl.name = i.name
 where c.created_by = p.id and pl.kind = 'serie_gerada' and c.series_id is not null;
-- cartao e cartao_parcelas: a 1ª parcela no dia do plano; cartao_parcelas_tarde: a 1ª parcela fora e as outras dentro; cartao_encargo: o encargo e a fatura dentro.
update public.card_entries e set created_at = p.created_at + pl.delay
  from public.persons p join ids i on i.id = p.id join plan pl on pl.name = i.name
 where e.created_by = p.id and pl.kind in ('cartao', 'cartao_parcelas', 'cartao_parcelas_tarde') and e.kind = 'parcela' and e.installment_number = 1;
update public.card_entries e set created_at = p.created_at + interval '1 day'
  from public.persons p join ids i on i.id = p.id join plan pl on pl.name = i.name
 where e.created_by = p.id and ((pl.kind = 'cartao_parcelas_tarde' and e.installment_number > 1) or (pl.kind = 'cartao_encargo' and e.kind = 'encargo'));
update public.commitments c set created_at = p.created_at + interval '1 day'
  from public.persons p join ids i on i.id = p.id join plan pl on pl.name = i.name
 where c.created_by = p.id and pl.kind in ('cartao_encargo', 'cartao_parcelas_tarde', 'cartao_parcelas') and c.card_id is not null;
set session_replication_role = origin;

-- 6d. O que cada semana mostra. Formato: n contas criadas, r com registro, ig/in/em/bu/ou/pr as origens; "[marca]" quando há marca; valor
-- vazio quando escondido.
create function pg_temp.wk(p_week date) returns text language sql security definer set search_path = public, pg_temp as $$
  select string_agg(
           case t.measure when 'contas_criadas' then 'n' when 'contas_com_registro_7_dias' then 'r' when 'origem_instagram' then 'ig'
                          when 'origem_indicacao' then 'in' when 'origem_empresa' then 'em' when 'origem_busca' then 'bu'
                          when 'origem_outro' then 'ou' else 'pr' end
           || '=' || coalesce(t.total::text, '') || coalesce('[' || t.mark || ']', ''), ' ' order by t.rn)
    from public.clarevo_staff_signup_metrics(p_week, p_week) with ordinality as t(week_start, measure, total, mark, rn)
$$;
do $$ begin
  -- W0: 7 bases e 5 extras (12 contas, nenhuma com registro, e 12 - 0 não é pequeno). Respostas até aqui: 5 "instagram" (as extras), "empresa"
  -- (Caio e Eli: 2), "busca" (Ana) e "prefiro_nao_dizer" (Bia): só o instagram aparece, e o zero de indicacao e de outro.
  assert pg_temp.wk('2026-07-06') = 'n=12 r=0 ig=5 in=0 em=[menos de 5] bu=[menos de 5] ou=0 pr=[menos de 5]',
    'W0 antes: ' || pg_temp.wk('2026-07-06');
  -- W1: 14 contas; 7 com registro (14 - 7 = 7, sem complemento pequeno); instagram 5; indicacao 3, busca 1 e outro 2 escondidos.
  assert pg_temp.wk('2026-08-03') = 'n=14 r=7 ig=5 in=[menos de 5] em=0 bu=[menos de 5] ou=[menos de 5] pr=0', 'W1: ' || pg_temp.wk('2026-08-03');
  -- W2: 3 contas escondidas; as 3 com registro, escondidas; "outro" 3 escondido.
  assert pg_temp.wk('2026-08-10') = 'n=[menos de 5] r=[menos de 5] ig=0 in=0 em=0 bu=0 ou=[menos de 5] pr=0', 'W2: ' || pg_temp.wk('2026-08-10');
  -- W3: 20 contas, 17 com registro, mas as 3 sem registro seriam reveladas por 20 - 17: o registro fica escondido (complemento).
  assert pg_temp.wk('2026-08-17') = 'n=20 r=[complemento menor que 5] ig=6 in=0 em=8 bu=0 ou=0 pr=0', 'W3: ' || pg_temp.wk('2026-08-17');
  -- W4: 6 contas, 1 com registro escondido; indicacao 5 (exatamente 5 aparece); busca 1 escondida.
  assert pg_temp.wk('2026-08-24') = 'n=6 r=[menos de 5] ig=0 in=5 em=0 bu=[menos de 5] ou=0 pr=0', 'W4: ' || pg_temp.wk('2026-08-24');
  -- W5: uma só conta (a das 23:30 de domingo em São Paulo, 02:30 UTC de segunda): n escondido e o registro (zero, com complemento 1) também.
  assert pg_temp.wk('2026-08-31') = 'n=[menos de 5] r=[complemento menor que 5] ig=0 in=0 em=0 bu=0 ou=0 pr=0', 'W5: ' || pg_temp.wk('2026-08-31');
  -- W6: 5 contas (a de segunda 00:00 e a de domingo 23:59:59 de São Paulo entram aqui), nenhuma com registro: zero aparece (complemento 5).
  assert pg_temp.wk('2026-09-07') = 'n=5 r=0 ig=0 in=0 em=0 bu=0 ou=[menos de 5] pr=0', 'W6: ' || pg_temp.wk('2026-09-07');
  -- W7: 8 contas, 4 com registro (escondido, 1 a 4); prefiro_nao_dizer 5 aparece; busca 3 escondida.
  assert pg_temp.wk('2026-09-14') = 'n=8 r=[menos de 5] ig=0 in=0 em=0 bu=[menos de 5] ou=0 pr=5', 'W7: ' || pg_temp.wk('2026-09-14');
  -- W8: 5 contas, 5 com registro (complemento zero): aparece. A janela fechou em 05/10.
  assert pg_temp.wk('2026-09-21') = 'n=5 r=5 ig=0 in=0 em=0 bu=0 ou=0 pr=0', 'W8: ' || pg_temp.wk('2026-09-21');
  -- W9: a semana terminou, mas a janela de 7 dias fecha em 12/10: o registro sai sem valor.
  assert pg_temp.wk('2026-09-28') = 'n=6 r=[janela aberta] ig=0 in=0 em=0 bu=0 ou=0 pr=0', 'W9: ' || pg_temp.wk('2026-09-28');
  -- W10: a semana de hoje: as contagens aparecem com a marca de semana em andamento; o registro, com a janela aberta.
  assert pg_temp.wk('2026-10-05') = 'n=5[semana em andamento] r=[janela aberta] ig=5[semana em andamento] in=0[semana em andamento] em=0[semana em andamento] bu=0[semana em andamento] ou=0[semana em andamento] pr=0[semana em andamento]',
    'W10: ' || pg_temp.wk('2026-10-05');
end $$;

-- 6e. Uma consulta de várias semanas devolve as mesmas linhas das consultas de uma semana (cada semana é independente), nenhuma linha
-- de total, e nada identifica ninguém.
do $$
declare
  w date;
  junto text;
begin
  for w in select g::date from generate_series('2026-07-06'::date, '2026-10-05'::date, interval '7 days') g loop
    junto := (select string_agg(
               case t.measure when 'contas_criadas' then 'n' when 'contas_com_registro_7_dias' then 'r' when 'origem_instagram' then 'ig'
                              when 'origem_indicacao' then 'in' when 'origem_empresa' then 'em' when 'origem_busca' then 'bu'
                              when 'origem_outro' then 'ou' else 'pr' end
               || '=' || coalesce(t.total::text, '') || coalesce('[' || t.mark || ']', ''), ' ' order by t.rn)
              from public.clarevo_staff_signup_metrics('2026-07-06', '2026-10-11') with ordinality as t(week_start, measure, total, mark, rn)
             where t.week_start = w);
    assert junto = pg_temp.wk(w), 'a semana ' || w || ' é a mesma sozinha e em conjunto';
  end loop;
  assert (select count(*) from public.clarevo_staff_signup_metrics('2026-07-06', '2026-10-11')) = 14 * 8, '14 semanas de 07/07 a 11/10, 8 medidas cada, sem linha de total';
  assert (select count(distinct week_start) from public.clarevo_staff_signup_metrics('2026-07-06', '2026-10-11')) = 14, 'só linhas de semana';
  -- A coluna total nunca traz 1 a 4: toda contagem pequena sai nula, com marca.
  assert not exists (select 1 from public.clarevo_staff_signup_metrics('2024-10-14', '2026-10-11') where total between 1 and 4), 'nenhuma contagem de 1 a 4 sai com valor';
  assert not exists (select 1 from public.clarevo_staff_signup_metrics('2024-10-14', '2026-10-11') where total is null and mark is null), 'toda contagem escondida traz marca';
  assert not exists (select 1 from public.clarevo_staff_signup_metrics('2024-10-14', '2026-10-11') where mark is not null
                        and mark not in ('menos de 5', 'complemento menor que 5', 'janela aberta', 'semana em andamento')), 'só as quatro marcas';
  -- Semanas sem ninguém aparecem com zero (não são omitidas).
  assert (select count(*) from public.clarevo_staff_signup_metrics('2024-10-07', '2024-10-13') where total = 0) = 8, 'uma semana vazia: oito zeros';
end $$;

-- ---------------------------------------------------------------------------
-- 7. Exclusão da conta (D-058): a resposta some com a conta, também quando a linha de persons continua como "Pessoa que saiu".
-- ---------------------------------------------------------------------------
select pg_temp.keep('ana_antes', (select to_jsonb(s)::text from public.signup_sources s where person_id = :ana));
select pg_temp.keep('bia_antes', (select to_jsonb(s)::text from public.signup_sources s where person_id = :bia));
select pg_temp.keep('caio_antes', (select to_jsonb(s)::text from public.signup_sources s where person_id = :caio));
set role authenticated;
do $$ begin
  -- Gil, Dora, Eli e Iris respondem (Gil e Iris ainda não tinham respondido).
  perform pg_temp.as_('gil');  perform public.set_signup_source('indicacao', 'oc-gil-0001', 0);
  perform pg_temp.as_('dora'); perform public.set_signup_source('outro', 'oc-dora-0001', 0);
  perform pg_temp.as_('iris'); perform public.set_signup_source('instagram', 'oc-iris-0001', 0);
end $$;
reset role;
do $$ begin
  assert pg_temp.ans('gil') = 'indicacao v1' and pg_temp.ans('dora') = 'outro v1' and pg_temp.ans('iris') = 'instagram v1' and pg_temp.ans('eli') = 'empresa v1', 'as respostas de quem vai sair';
  assert pg_temp.nops('dora') = 1 and pg_temp.nops('eli') = 1 and pg_temp.nops('gil') = 1 and pg_temp.nops('iris') = 1, 'uma operação cada';
  -- W0 com as respostas deles: instagram 6 (as 5 extras e a Iris); indicacao (Gil), outro (Dora), empresa (Caio e Eli), busca e prefiro, escondidos.
  assert pg_temp.wk('2026-07-06') = 'n=12 r=0 ig=6 in=[menos de 5] em=[menos de 5] bu=[menos de 5] ou=[menos de 5] pr=[menos de 5]', 'W0 com todas as respostas: ' || pg_temp.wk('2026-07-06');
end $$;

-- Dora (só o Pessoal) exclui a conta: a resposta, a operação e a pessoa somem.
set role authenticated;
do $$ begin
  perform pg_temp.as_('dora');
  perform public.delete_my_account('EXCLUIR', 'oc-del-dora-01');
end $$;
reset role;
do $$ begin
  assert pg_temp.ans('dora') = '-' and pg_temp.nops('dora') = 0 and not exists (select 1 from public.persons where id = pg_temp.id('dora')), 'a Dora saiu com a resposta e o rastro';
end $$;
-- Com o token ainda válido, a conta excluída não responde.
set role authenticated;
do $$ begin
  perform pg_temp.as_('dora');
  perform pg_temp.expect_code(pg_temp.ss('instagram', 'oc-dora-0002', 0), 'sem_permissao', '42501');
  assert (select count(*) from public.signup_sources) = 0, 'a conta excluída não lê nada';
end $$;
reset role;
do $$ begin
  assert pg_temp.ans('dora') = '-' and pg_temp.nops('dora') = 0, 'nada foi gravado para a Dora';
end $$;

-- Eli (membro da Família da Ana, onde anotou) exclui a conta: a linha de persons fica anônima, mas a resposta sai.
set role authenticated;
do $$ begin
  perform pg_temp.as_('eli');
  perform public.delete_my_account('EXCLUIR', 'oc-del-eli-01');
end $$;
reset role;
do $$
declare
  eli uuid := pg_temp.id('eli');
begin
  assert (select (deleted_at is not null, display_name) from public.persons where id = eli) = (true, ''::text), 'a linha do Eli continua, anônima, por causa do que ele anotou na Família da Ana';
  assert pg_temp.ans('eli') = '-' and pg_temp.nops('eli') = 0, 'mas a resposta e o rastro dele saíram';
  assert not exists (select 1 from public.signup_sources s join public.persons p on p.id = s.person_id where p.deleted_at is not null), 'nenhuma resposta de pessoa anônima';
  -- A pessoa anônima não responde (não tem Pessoal), com o token ainda válido.
  assert not exists (select 1 from public.financial_contexts where owner_person_id = eli), 'a pessoa anônima não tem Pessoal';
end $$;
set role authenticated;
do $$ begin
  perform pg_temp.as_('eli');
  perform pg_temp.expect_code(pg_temp.ss('instagram', 'oc-eli-0002', 0), 'sem_permissao', '42501');
end $$;
reset role;
-- A guarda de record_operations também recusa a pessoa anônima (a operação é sempre a última gravação).
do $$ begin
  perform pg_temp.expect_code(format($f$insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash)
                                          values (%L, 'oc-fantasma-01', 'responder_origem_cadastro', %L, 'x')$f$, pg_temp.id('eli'), pg_temp.id('ana_ctx')),
                              'conta_excluida', '42501');
end $$;

-- Gil (titular sozinho da própria Família) exclui a conta: o Pessoal e a Família somem, com a resposta.
set role authenticated;
do $$ begin
  perform pg_temp.as_('gil');
  perform public.delete_my_account('EXCLUIR', 'oc-del-gil-01');
end $$;
reset role;
do $$ begin
  assert pg_temp.ans('gil') = '-' and pg_temp.nops('gil') = 0 and not exists (select 1 from public.persons where id = pg_temp.id('gil'))
     and not exists (select 1 from public.financial_contexts where id in (pg_temp.id('gil_ctx'), pg_temp.id('gfam'))), 'o Gil saiu com tudo';
end $$;

-- Iris é apagada direto em auth.users (o painel do Supabase): o gatilho aplica as mesmas regras e a resposta sai.
delete from auth.users where id = :iris;
do $$ begin
  assert pg_temp.ans('iris') = '-' and pg_temp.nops('iris') = 0 and not exists (select 1 from public.persons where id = pg_temp.id('iris')), 'a Iris saiu com a resposta';
end $$;

-- Quem ficou não mudou (Ana, Bia e Caio), e nenhuma resposta sobrou sem pessoa viva.
do $$ begin
  assert (select to_jsonb(s)::text from public.signup_sources s where person_id = pg_temp.id('bia')) = pg_temp.was('bia_antes')
     and (select to_jsonb(s)::text from public.signup_sources s where person_id = pg_temp.id('caio')) = pg_temp.was('caio_antes')
     and (select to_jsonb(s)::text from public.signup_sources s where person_id = pg_temp.id('ana')) = pg_temp.was('ana_antes')
     and pg_temp.ans('ana') = pg_temp.was('ana_busca_v4') and pg_temp.ans('bia') = 'prefiro_nao_dizer v8' and pg_temp.ans('caio') = 'empresa v1', 'Ana, Bia e Caio seguem iguais';
  assert not exists (select 1 from public.signup_sources s left join public.persons p on p.id = s.person_id where p.id is null or p.deleted_at is not null),
    'nenhuma resposta de pessoa que já não existe';
  -- A coorte W0 depois das exclusões: Dora, Eli, Gil e Iris saíram da contagem (a pessoa anônima nunca conta): 12 - 4 = 8; instagram 6 - 1 = 5;
  -- indicacao (Gil) e outro (Dora) voltam a zero e empresa (Eli) cai de 2 para 1, escondido.
  assert pg_temp.wk('2026-07-06') = 'n=8 r=0 ig=5 in=0 em=[menos de 5] bu=[menos de 5] ou=0 pr=[menos de 5]', 'W0 depois: ' || pg_temp.wk('2026-07-06');
end $$;
-- Excluir a conta de uma pessoa da coorte tira a pessoa da semana dela (e a resposta da origem).
set role authenticated;
do $$ begin
  perform pg_temp.as_('w3_1');
  perform public.delete_my_account('EXCLUIR', 'oc-del-w3-01');
end $$;
reset role;
do $$ begin
  -- W3: 19 contas, 16 com registro (a que saiu tinha registro e era "empresa"): o complemento segue 3; empresa 7.
  assert pg_temp.wk('2026-08-17') = 'n=19 r=[complemento menor que 5] ig=6 in=0 em=7 bu=0 ou=0 pr=0', 'W3 depois: ' || pg_temp.wk('2026-08-17');
end $$;

-- ---------------------------------------------------------------------------
-- 8. Catálogo: assinaturas, privilégios, definição e a ação nova de record_operations.
-- ---------------------------------------------------------------------------
do $$ begin
  assert to_regprocedure('public.set_signup_source(text, text, integer)') is not null
     and to_regprocedure('public.clarevo_staff_signup_metrics(date, date)') is not null
     and to_regprocedure('public.clarevo_signup_source_result(uuid)') is not null
     and to_regprocedure('public.signup_sources_guard()') is not null, 'as assinaturas';
  assert (select array_agg(a.parameter_name order by a.ord) from (select unnest(proargnames) as parameter_name, generate_series(1, array_length(proargnames, 1)) as ord
            from pg_proc where oid = 'public.set_signup_source(text, text, integer)'::regprocedure) a) = array['p_source', 'p_key', 'p_version'], 'os parâmetros são p_source, p_key e p_version';
  assert has_function_privilege('authenticated', 'public.set_signup_source(text, text, integer)', 'execute')
     and not has_function_privilege('anon', 'public.set_signup_source(text, text, integer)', 'execute')
     and (select p.proacl is not null and not exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0) from pg_proc p where p.oid = 'public.set_signup_source(text, text, integer)'::regprocedure),
    'só authenticated executa set_signup_source';
  assert (select prosecdef and proconfig @> array['search_path=public'] and not proretset and provolatile = 'v' from pg_proc where oid = 'public.set_signup_source(text, text, integer)'::regprocedure),
    'set_signup_source é security definer com search_path fixo';
  assert not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                      where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')), 'anon não executa nenhuma função';
  assert (select count(*) from pg_proc p where p.oid in ('public.signup_sources_guard()'::regprocedure, 'public.clarevo_signup_source_result(uuid)'::regprocedure,
                                                        'public.clarevo_staff_signup_metrics(date, date)'::regprocedure)
             and not has_function_privilege('authenticated', p.oid, 'execute') and not has_function_privilege('anon', p.oid, 'execute')
             and not has_function_privilege('service_role', p.oid, 'execute')
             and not exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where a.grantee = 0)) = 3,
    'a guarda, o auxiliar e a função da equipe não são executáveis por ninguém com sessão';
  assert has_table_privilege('authenticated', 'public.signup_sources', 'select')
     and not has_table_privilege('authenticated', 'public.signup_sources', 'insert, update, delete, truncate, references, trigger')
     and not has_any_column_privilege('authenticated', 'public.signup_sources', 'insert, update'), 'só leitura (filtrada pela RLS), sem escrita direta';
  assert not has_table_privilege('anon', 'public.signup_sources', 'select, insert, update, delete, truncate, references, trigger')
     and not has_any_column_privilege('anon', 'public.signup_sources', 'select, insert, update, references'), 'anon não tem nada na tabela';
  assert (select relrowsecurity from pg_class where oid = 'public.signup_sources'::regclass), 'RLS ligada';
  assert (select count(*) from pg_policies where tablename = 'signup_sources') = 1
     and (select roles from pg_policies where tablename = 'signup_sources' and policyname = 'signup_sources_own' and cmd = 'SELECT') = array['authenticated']::name[]
     and (select qual from pg_policies where tablename = 'signup_sources' and policyname = 'signup_sources_own') like '%( SELECT auth.uid() AS uid)%',
    'uma política de leitura, só da própria pessoa, com (select auth.uid())';
  assert exists (select 1 from pg_trigger where tgname = 'signup_sources_guard' and tgrelid = 'public.signup_sources'::regclass and not tgisinternal and tgenabled = 'O'), 'guarda ligada';
  assert (select array_agg(m[1] order by m[1] collate "C") from pg_constraint c, regexp_matches(pg_get_constraintdef(c.oid), '''([a-z_]+)''::text', 'g') m
           where c.conname = 'record_operations_action_check' and m[1] = 'responder_origem_cadastro') = array['responder_origem_cadastro'], 'a ação nova existe';
  -- A atividade não conta a ação nova (o gatilho a lista) e a limpeza da pessoa apaga a resposta.
  assert (select pg_get_functiondef(oid) from pg_proc where oid = 'public.clarevo_track_activity()'::regprocedure) like '%''responder_origem_cadastro''%',
    'o gatilho de atividade não conta a ação nova';
  assert (select pg_get_functiondef(oid) from pg_proc where oid = 'public.clarevo_erase_person(uuid)'::regprocedure) like '%delete from public.signup_sources where person_id = p_person%',
    'clarevo_erase_person apaga a resposta';
  -- Toda escrita termina na operação: set_signup_source grava em record_operations por último, depois da resposta; nunca apaga.
  assert (select position('insert into public.signup_sources' in d) < position('insert into public.record_operations' in d)
                 and position('update public.signup_sources' in d) < position('insert into public.record_operations' in d)
                 and position('delete from public.signup_sources' in d) = 0
            from (select pg_get_functiondef('public.set_signup_source(text, text, integer)'::regprocedure) as d) x),
    'a operação é a última gravação, e a função nunca apaga a resposta';
  -- A função da equipe só lê: nenhum insert, update nem delete.
  assert (select position('insert ' in lower(d)) = 0 and position('update ' in lower(d)) = 0 and position('delete ' in lower(d)) = 0
            from (select pg_get_functiondef('public.clarevo_staff_signup_metrics(date, date)'::regprocedure) as d) x), 'a função da equipe não escreve';
  -- Sem rastreamento: a função da equipe não lê e-mail, nome, endereço nem identificador na resposta (só semana, medida, contagem e marca).
  assert (select position('email' in lower(d)) = 0 and position('display_name' in lower(d)) = 0 and position('auth.users' in lower(d)) = 0
            from (select pg_get_functiondef('public.clarevo_staff_signup_metrics(date, date)'::regprocedure) as d) x), 'a função da equipe não toca em e-mail nem nome';
end $$;

rollback;
