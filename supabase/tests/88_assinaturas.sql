-- Assinaturas (D-046, Ciclo H2): a marca subscription e as datas subscription_reviewed_on e subscription_since (o dia em que a
-- marca foi posta, base do lembrete de primeira revisão) em commitment_series (e na visão series_items), set_series_subscription, mark_subscriptions_reviewed, as duas ações novas de record_operations, a atividade
-- (marcar conta como anotação; revisar não conta), restrições e privilégios. As funções de série da 0003/0004 não mudam de
-- assinatura: o app publicado antes da 0011 segue funcionando (seção 9).
-- Sequência sobre pessoas FICTÍCIAS (hoje 07/10/2026): Lia (sequência; titular da Família da Lia), Davi (Família, só leitura),
-- Elisa (Família, escreve sem "editar de outras pessoas"), Fábio (Família, escreve e altera o que é dos outros), Gaia (externa),
-- Hugo (validação, repetição e versão) e Íris (atividade). Valores em centavos. A marca nunca muda Recebido, Pago, Diferença,
-- Ainda a pagar nem a renda comprometida (seção 8).
\set ON_ERROR_STOP 1
\set lia    '''00000000-0000-0000-0000-0000000000a8'''
\set davi   '''00000000-0000-0000-0000-0000000000d8'''
\set elisa  '''00000000-0000-0000-0000-0000000000e8'''
\set fabio  '''00000000-0000-0000-0000-0000000000f8'''
\set gaia   '''00000000-0000-0000-0000-0000000000a9'''
\set hugo   '''00000000-0000-0000-0000-0000000000c8'''
\set iris   '''00000000-0000-0000-0000-0000000000b8'''

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

-- Confere agora as restrições adiadas (séries, vigências e contas).
create function pg_temp.check_links() returns void language plpgsql as $$
begin
  set constraints all immediate;
  set constraints all deferred;
end $$;

-- A série como o app lê (visão series_items, com a RLS de quem consulta): "marca|última revisão|versão".
create function pg_temp.sub(p_name text) returns text language sql as $$
  select format('%s|%s|%s', subscription::text, coalesce(subscription_reviewed_on::text, '-'), version)
    from public.series_items where id = pg_temp.id(p_name)
$$;
-- O dia em que a série virou assinatura (subscription_since), sem a RLS: '-' se nulo.
create function pg_temp.since(p_name text) returns text language sql security definer set search_path = public, pg_temp as $$
  select coalesce(subscription_since::text, '-') from public.commitment_series where id = pg_temp.id(p_name)
$$;
-- A mesma série sem a RLS (também a excluída).
create function pg_temp.sub_raw(p_name text) returns text language sql security definer set search_path = public, pg_temp as $$
  select format('%s|%s|%s|%s', subscription::text, coalesce(subscription_reviewed_on::text, '-'), version,
                case when deleted_at is null then '-' else 'excluida' end)
    from public.commitment_series where id = pg_temp.id(p_name)
$$;
-- O que a marca nunca pode tocar: contas a pagar, registros e vigências (conteúdo inteiro, sem a RLS).
create function pg_temp.untouched() returns text language sql security definer set search_path = public, pg_temp as $$
  select md5(coalesce((select string_agg(c::text, '|' order by c.id) from public.commitments c), '')
          || coalesce((select string_agg(r::text, '|' order by r.id) from public.financial_records r), '')
          || coalesce((select string_agg(t::text, '|' order by t.id) from public.series_terms t), ''))
$$;
-- Contas em aberto da série, como a pessoa confirma ao encerrar ou excluir.
create function pg_temp.open_refs(p_name text, p_after int default 0) returns jsonb language sql as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'version', version) order by occurrence_number), '[]'::jsonb)
    from public.commitments where series_id = pg_temp.id(p_name) and deleted_at is null and status = 'aberto' and occurrence_number > p_after
$$;
-- Chamadas como texto (para expect_code).
create function pg_temp.mk(p_key text, p_series uuid, p_version integer, p_flag boolean) returns text language sql as $$
  select format('select public.set_series_subscription(%L, %L, %L, %L)', p_key, p_series, p_version, p_flag)
$$;
create function pg_temp.rv(p_key text, p_ctx uuid) returns text language sql as $$
  select format('select public.mark_subscriptions_reviewed(%L, %L)', p_key, p_ctx)
$$;
-- Gasto fixo mensal pela função de série (assinatura de 14 argumentos, a mesma de antes da 0011).
create function pg_temp.monthly(p_key text, p_ctx uuid, p_description text, p_cents bigint, p_day int, p_from date,
                                p_last date default null) returns jsonb language sql as $$
  select public.create_series(p_key, p_ctx, 'mensal', 'conta', p_description, null, p_cents, 'fixo', p_day, p_from, 1, null, p_last, null)
$$;

insert into ids values ('lia', :lia), ('davi', :davi), ('elisa', :elisa), ('fabio', :fabio), ('gaia', :gaia), ('hugo', :hugo), ('iris', :iris);
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  (:lia,   'lia@exemplo.test',   now(), '{"display_name":"Lia"}'),
  (:davi,  'davi@exemplo.test',  now(), '{"display_name":"Davi"}'),
  (:elisa, 'elisa@exemplo.test', now(), '{"display_name":"Elisa"}'),
  (:fabio, 'fabio@exemplo.test', now(), '{"display_name":"Fábio"}'),
  (:gaia,  'gaia@exemplo.test',  now(), '{"display_name":"Gaia"}'),
  (:hugo,  'hugo@exemplo.test',  now(), '{"display_name":"Hugo"}'),
  (:iris,  'iris@exemplo.test',  now(), '{"display_name":"Íris"}');

-- Espaços pessoais.
set role authenticated;
do $$
declare
  p text;
  space jsonb;
begin
  foreach p in array array['lia', 'davi', 'elisa', 'fabio', 'gaia', 'hugo', 'iris'] loop
    perform pg_temp.as_(p);
    space := public.ensure_personal_space('Conta principal');
    insert into ids values (p || '_ctx', (space ->> 'context_id')::uuid), (p || '_acc', (space #>> '{account,id}')::uuid);
  end loop;
end $$;
reset role;

-- Família da Lia (Davi só lê; Elisa escreve sem "editar de outras pessoas"; Fábio escreve e altera o que é dos outros).
with f as (
  insert into public.financial_contexts (kind, name, owner_person_id) values ('familia', 'Família da Lia', :lia) returning id
) insert into ids select 'fam', id from f;
insert into public.context_memberships (context_id, person_id, role, can_read, can_write, can_edit_others)
  select id, :lia::uuid, 'titular'::public.membership_role, true, true, true from ids where name = 'fam'
  union all
  select id, :davi::uuid, 'membro'::public.membership_role, true, false, false from ids where name = 'fam'
  union all
  select id, :elisa::uuid, 'membro'::public.membership_role, true, true, false from ids where name = 'fam'
  union all
  select id, :fabio::uuid, 'membro'::public.membership_role, true, true, true from ids where name = 'fam';

-- ---------------------------------------------------------------------------
-- 1. Conta nova e esquema: as colunas começam vazias (nenhuma assinatura de exemplo), a visão as devolve no fim e as
-- restrições valem para quem escreve por fora das funções (B1, B2).
-- ---------------------------------------------------------------------------
set role authenticated;
do $$
begin
  perform pg_temp.as_('hugo');
  assert (select count(*) from public.series_items) = 0, 'conta nova: nenhuma série, nenhuma assinatura';
  assert (select array_agg(column_name::text order by ordinal_position) from information_schema.columns
           where table_schema = 'public' and table_name = 'series_items' and ordinal_position > 18)
       = array['parts_per_year', 'subscription', 'subscription_reviewed_on', 'subscription_since'], 'as três colunas novas ficam no fim da visão';
  assert (select data_type || ',' || is_nullable || ',' || coalesce(column_default, '-') from information_schema.columns
           where table_schema = 'public' and table_name = 'commitment_series' and column_name = 'subscription')
       = 'boolean,NO,false', 'subscription: boolean, não nulo, padrão falso';
  assert (select data_type || ',' || is_nullable from information_schema.columns
           where table_schema = 'public' and table_name = 'commitment_series' and column_name = 'subscription_reviewed_on')
       = 'date,YES', 'subscription_reviewed_on: data, pode ser nula';
  assert (select data_type || ',' || is_nullable from information_schema.columns
           where table_schema = 'public' and table_name = 'commitment_series' and column_name = 'subscription_since')
       = 'date,YES', 'subscription_since: data, pode ser nula';
end $$;
reset role;
do $$
declare
  ctx uuid := pg_temp.id('hugo_ctx');
  uid uuid := pg_temp.id('hugo');
  s uuid;
begin
  -- Restrições (B1 e B2), por fora das funções.
  insert into public.commitment_series (context_id, kind, nature, first_due_month, first_number, last_number, installment_total, created_by)
    values (ctx, 'parcelada', 'compra_parcelada', '2026-11-01', 1, 10, 10, uid) returning id into s;
  insert into public.series_terms (series_id, context_id, from_number, description, amount_cents, amount_mode, due_day, created_by)
    values (s, ctx, 1, 'Sofá', 10000, 'fixo', 10, uid);
  perform pg_temp.expect_error(format('update public.commitment_series set subscription = true where id = %L', s), '%commitment_series_assinatura%');
  perform pg_temp.expect_error(format('update public.commitment_series set subscription_reviewed_on = %L where id = %L', '2026-10-07', s),
    '%commitment_series_assinatura%');
  perform pg_temp.expect_error(
    format('update public.commitment_series set subscription = true, subscription_reviewed_on = %L where id = %L', '2026-10-07', s),
    '%commitment_series_assinatura%');
  perform pg_temp.expect_error(format('update public.commitment_series set subscription_since = %L where id = %L', '2026-10-07', s),
    '%commitment_series_assinatura%');
  perform pg_temp.expect_error(
    format('update public.commitment_series set subscription = true, subscription_since = %L where id = %L', '2026-10-07', s),
    '%commitment_series_assinatura%');
  insert into public.commitment_series (context_id, kind, nature, first_due_month, first_number, parts_per_year, created_by)
    values (ctx, 'anual', 'conta', '2027-01-01', 1, 1, uid) returning id into s;
  insert into public.series_terms (series_id, context_id, from_number, description, amount_cents, amount_mode, due_day, created_by)
    values (s, ctx, 1, 'IPVA', 240000, 'variavel', 20, uid);
  perform pg_temp.expect_error(format('update public.commitment_series set subscription = true where id = %L', s), '%commitment_series_assinatura%');
  perform pg_temp.expect_error(
    format($f$insert into public.commitment_series (context_id, kind, nature, first_due_month, first_number, parts_per_year, subscription, created_by)
      values (%L, 'anual', 'conta', '2027-01-01', 1, 1, true, %L)$f$, ctx, uid), '%commitment_series_assinatura%');
  -- Mensal: a marca e as datas cabem; as datas sem marca não.
  insert into public.commitment_series (context_id, kind, nature, first_due_month, first_number, created_by, subscription, subscription_reviewed_on, subscription_since)
    values (ctx, 'mensal', 'conta', '2026-11-01', 1, uid, true, '2026-10-01', '2026-09-15') returning id into s;
  insert into public.series_terms (series_id, context_id, from_number, description, amount_cents, amount_mode, due_day, created_by)
    values (s, ctx, 1, 'Streaming', 3990, 'fixo', 10, uid);
  perform pg_temp.expect_error(format('update public.commitment_series set subscription = false where id = %L', s), '%commitment_series_assinatura%');
  perform pg_temp.expect_error(format('update public.commitment_series set subscription = false, subscription_reviewed_on = null where id = %L', s),
    '%commitment_series_assinatura%');
  update public.commitment_series set subscription = false, subscription_reviewed_on = null, subscription_since = null where id = s;
  assert (select not subscription and subscription_reviewed_on is null and subscription_since is null from public.commitment_series where id = s),
    'desmarcar com as datas limpas';
  -- Limpeza das linhas de teste da seção.
  delete from public.series_terms where context_id = ctx;
  delete from public.commitment_series where context_id = ctx;
  assert (select count(*) from public.commitment_series where context_id = ctx) = 0, 'seção 1 limpa';
end $$;
select pg_temp.check_links();

-- ---------------------------------------------------------------------------
-- 2. Validação de set_series_subscription (Hugo, hoje 07/10/2026): sessão, chave, série, permissão, versão, marca e tipo, nessa
-- ordem; recusas não gravam operação nem mudam a série.
-- ---------------------------------------------------------------------------
set role authenticated;
do $$
declare
  ctx uuid := pg_temp.id('hugo_ctx');
  res jsonb;
  before_ text;
begin
  perform pg_temp.as_('hugo');
  res := pg_temp.monthly('as-v-0001', ctx, 'Streaming', 3990, 10, '2026-10-01');
  insert into ids values ('hugo_stream', (res #>> '{series,id}')::uuid);
  assert res #>> '{series,subscription}' = 'false' and res #>> '{series,subscription_reviewed_on}' is null,
    'a série criada pela função de antes nasce sem a marca (create_series não mudou)';
  res := public.create_series('as-v-0002', ctx, 'parcelada', 'compra_parcelada', 'Sofá', null, 20000, 'fixo', 15, '2026-11-01', 1, 10, null, null);
  insert into ids values ('hugo_sofa', (res #>> '{series,id}')::uuid);
  res := public.create_series('as-v-0003', ctx, 'anual', 'conta', 'IPVA', null, 240000, 'variavel', 20, '2027-01-01', 1, null, null, 1);
  insert into ids values ('hugo_ipva', (res #>> '{series,id}')::uuid);
  assert (select count(*) from public.series_items) = 3, 'três séries';
  assert pg_temp.sub('hugo_stream') = 'false|-|1' and pg_temp.sub('hugo_sofa') = 'false|-|1' and pg_temp.sub('hugo_ipva') = 'false|-|1', 'versão 1, sem marca';
  before_ := pg_temp.untouched();

  -- Sessão.
  perform pg_temp.as_('ninguem');
  perform pg_temp.expect_code(pg_temp.mk('as-n-0001', pg_temp.id('hugo_stream'), 1, true), 'nao_autenticado', '42501');
  perform pg_temp.expect_code(pg_temp.rv('as-n-0002', ctx), 'nao_autenticado', '42501');
  perform pg_temp.as_('hugo');
  -- Chave: de 8 a 80 caracteres (antes de tudo, inclusive da série e do contexto).
  perform pg_temp.expect_code(pg_temp.mk('curta', pg_temp.id('hugo_stream'), 1, true), 'chave_invalida', '22023');
  perform pg_temp.expect_code(format($f$select public.set_series_subscription(null, %L, 1, true)$f$, pg_temp.id('hugo_stream')), 'chave_invalida', '22023');
  perform pg_temp.expect_code(pg_temp.mk(repeat('k', 81), gen_random_uuid(), 1, true), 'chave_invalida', '22023');
  perform pg_temp.expect_code(pg_temp.rv('curta', ctx), 'chave_invalida', '22023');
  perform pg_temp.expect_code(format($f$select public.mark_subscriptions_reviewed(null, %L)$f$, ctx), 'chave_invalida', '22023');
  perform pg_temp.expect_code(pg_temp.rv(repeat('k', 81), gen_random_uuid()), 'chave_invalida', '22023');
  -- Série: não existe, ou é de outra pessoa (sem leitura): não revela a existência.
  perform pg_temp.expect_code(pg_temp.mk('as-n-0010', gen_random_uuid(), 1, true), 'nao_encontrado', 'P0002');
  perform pg_temp.expect_code(pg_temp.mk('as-n-0011', null, 1, true), 'nao_encontrado', 'P0002');
  perform pg_temp.as_('iris');
  perform pg_temp.expect_code(pg_temp.mk('as-n-0012', pg_temp.id('hugo_stream'), 1, true), 'nao_encontrado', 'P0002');
  perform pg_temp.as_('hugo');
  -- Versão: antes da marca e do tipo.
  perform pg_temp.expect_stale(pg_temp.mk('as-n-0020', pg_temp.id('hugo_stream'), 2, true), 'versao_atual=1');
  perform pg_temp.expect_stale(pg_temp.mk('as-n-0021', pg_temp.id('hugo_stream'), 0, true), 'versao_atual=1');
  perform pg_temp.expect_stale(format($f$select public.set_series_subscription('as-n-0022', %L, null, true)$f$, pg_temp.id('hugo_stream')), 'versao_atual=1');
  perform pg_temp.expect_stale(pg_temp.mk('as-n-0023', pg_temp.id('hugo_sofa'), 5, true), 'versao_atual=1');
  -- Marca: nula é recusada (antes do tipo).
  perform pg_temp.expect_code(format($f$select public.set_series_subscription('as-n-0030', %L, 1, null)$f$, pg_temp.id('hugo_stream')), 'marca_invalida', '22023');
  perform pg_temp.expect_code(format($f$select public.set_series_subscription('as-n-0031', %L, 1, null)$f$, pg_temp.id('hugo_sofa')), 'marca_invalida', '22023');
  -- Tipo: só gasto fixo mensal (parcelamento e conta do ano nunca são assinatura, nem para desmarcar).
  perform pg_temp.expect_code(pg_temp.mk('as-n-0040', pg_temp.id('hugo_sofa'), 1, true), 'assinatura_so_gasto_fixo', '22023');
  perform pg_temp.expect_code(pg_temp.mk('as-n-0041', pg_temp.id('hugo_sofa'), 1, false), 'assinatura_so_gasto_fixo', '22023');
  perform pg_temp.expect_code(pg_temp.mk('as-n-0042', pg_temp.id('hugo_ipva'), 1, true), 'assinatura_so_gasto_fixo', '22023');
  perform pg_temp.expect_code(pg_temp.mk('as-n-0043', pg_temp.id('hugo_ipva'), 1, false), 'assinatura_so_gasto_fixo', '22023');
  -- Revisão: contexto que não existe ou que não é dele.
  perform pg_temp.expect_code(pg_temp.rv('as-n-0050', gen_random_uuid()), 'sem_permissao', '42501');
  perform pg_temp.expect_code(pg_temp.rv('as-n-0051', pg_temp.id('lia_ctx')), 'sem_permissao', '42501');
  perform pg_temp.expect_code(pg_temp.rv('as-n-0052', null), 'sem_permissao', '42501');
  assert (select count(*) from public.record_operations where idempotency_key like 'as-n-%' or idempotency_key = 'curta') = 0, 'recusas não gravam operação';
  assert pg_temp.sub('hugo_stream') = 'false|-|1' and pg_temp.sub('hugo_sofa') = 'false|-|1' and pg_temp.sub('hugo_ipva') = 'false|-|1',
    'recusas não mudam nenhuma série';
  assert pg_temp.untouched() = before_, 'recusas não mudam contas, registros nem vigências';
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 3. Marcar e desmarcar (Hugo): forma da resposta, operação gravada, hash, repetição, conflito de chave, marcar o que já está
-- marcado (nada muda, versão igual) e desmarcar (apaga a data da revisão).
-- ---------------------------------------------------------------------------
set role authenticated;
do $$
declare
  ctx uuid := pg_temp.id('hugo_ctx');
  s uuid := pg_temp.id('hugo_stream');
  res jsonb;
  again jsonb;
  ops int;
  before_ text;
begin
  perform pg_temp.as_('hugo');
  before_ := pg_temp.untouched();
  res := public.set_series_subscription('as-m-0001', s, 1, true);
  assert (res #>> '{series,subscription}')::boolean and res #>> '{series,subscription_reviewed_on}' is null
     and (res #>> '{series,version}')::int = 2 and (res ->> 'changed')::int = 1, 'marcada: versão 2, sem data de revisão, changed 1';
  assert res #>> '{series,id}' = s::text and res #>> '{series,kind}' = 'mensal' and res #>> '{series,context_id}' = ctx::text, 'a mesma série';
  assert jsonb_array_length(res -> 'occurrences') = (select count(*) from public.commitments where series_id = s and deleted_at is null),
    'as ocorrências vivas vêm junto, como nas outras funções de série';
  assert jsonb_array_length(res #> '{series,terms}') = 1 and res #>> '{series,terms,0,description}' = 'Streaming', 'a vigência não mudou';
  assert pg_temp.sub('hugo_stream') = 'true|-|2', 'a visão devolve a marca e a versão nova';
  assert pg_temp.since('hugo_stream') = '2026-10-07' and res #>> '{series,subscription_since}' = '2026-10-07'
     and (select subscription_since::text from public.series_items where id = s) = '2026-10-07',
    'marcar grava o dia de hoje em subscription_since (resposta e visão), não o do cadastro da série';
  assert pg_temp.since('hugo_sofa') = '-' and pg_temp.since('hugo_ipva') = '-', 'quem não é assinatura não tem subscription_since';
  assert (select count(*) from public.record_operations where idempotency_key = 'as-m-0001' and action = 'marcar_assinatura'
             and context_id = ctx and target_id = s and record_id is null and commitment_id is null and actor_id = pg_temp.id('hugo')
             and request_hash = md5(jsonb_build_array('marcar_assinatura', s, 1, true)::text)) = 1,
    'operação marcar_assinatura: série em target_id, hash em JSON, sem registro nem conta';
  assert pg_temp.untouched() = before_, 'marcar não muda contas, registros nem vigências';

  -- Repetição: mesma chave e mesmo conteúdo devolve o estado atual, sem gravar de novo.
  ops := (select count(*) from public.record_operations);
  again := public.set_series_subscription('as-m-0001', s, 1, true);
  assert again = (res || jsonb_build_object('changed', 0)), 'repetição devolve o estado atual com changed 0';
  assert (select count(*) from public.record_operations) = ops and pg_temp.sub('hugo_stream') = 'true|-|2', 'repetição não grava nem sobe a versão';
  -- Conflito de chave: outro conteúdo, outra série ou outra ação.
  perform pg_temp.expect_code(pg_temp.mk('as-m-0001', s, 1, false), 'chave_reutilizada', 'PT409');
  perform pg_temp.expect_code(pg_temp.mk('as-m-0001', s, 2, true), 'chave_reutilizada', 'PT409');
  perform pg_temp.expect_code(pg_temp.mk('as-m-0001', pg_temp.id('hugo_sofa'), 1, true), 'chave_reutilizada', 'PT409');
  perform pg_temp.expect_code(pg_temp.rv('as-m-0001', ctx), 'chave_reutilizada', 'PT409');
  perform pg_temp.expect_code(format($f$select public.delete_series('as-m-0001', %L, 2, '[]')$f$, s), 'chave_reutilizada', 'PT409');
  -- A chave é por pessoa: outra pessoa com a mesma chave faz outra operação, e esta não alcança a série de Hugo.
  perform pg_temp.as_('iris');
  perform pg_temp.expect_code(pg_temp.mk('as-m-0001', s, 2, true), 'nao_encontrado', 'P0002');
  perform pg_temp.as_('hugo');

  -- Marcar o que já está marcado: nada muda, a versão fica, a operação é gravada.
  perform pg_temp.today('2026-10-05');
  res := public.set_series_subscription('as-m-0002', s, 2, true);
  perform pg_temp.today('2026-10-07');
  assert (res ->> 'changed')::int = 0 and (res #>> '{series,version}')::int = 2 and (res #>> '{series,subscription}')::boolean, 'já marcada: changed 0, versão 2';
  assert pg_temp.since('hugo_stream') = '2026-10-07' and res #>> '{series,subscription_since}' = '2026-10-07', 'já marcada: o dia da marca fica';
  assert (select count(*) from public.record_operations where idempotency_key = 'as-m-0002' and action = 'marcar_assinatura' and target_id = s) = 1,
    'a operação do que não mudou também é gravada';
  perform pg_temp.expect_stale(pg_temp.mk('as-m-0003', s, 1, true), 'versao_atual=2');

  -- Desmarcar apaga a data da revisão; marcar de novo começa sem data.
  res := public.mark_subscriptions_reviewed('as-m-0004', ctx);
  assert res ->> 'reviewed_on' = '2026-10-07' and (res ->> 'changed')::int = 1, 'revisão de hoje em uma assinatura';
  assert pg_temp.sub('hugo_stream') = 'true|2026-10-07|2', 'a revisão não muda a versão da série';
  res := public.set_series_subscription('as-m-0005', s, 2, false);
  assert not (res #>> '{series,subscription}')::boolean and res #>> '{series,subscription_reviewed_on}' is null
     and (res #>> '{series,version}')::int = 3 and (res ->> 'changed')::int = 1, 'desmarcada: sem data, versão 3';
  assert pg_temp.sub('hugo_stream') = 'false|-|3', 'a visão devolve a série comum';
  assert pg_temp.since('hugo_stream') = '-' and res #>> '{series,subscription_since}' is null, 'desmarcar apaga subscription_since';
  res := public.set_series_subscription('as-m-0006', s, 3, false);
  assert (res ->> 'changed')::int = 0 and (res #>> '{series,version}')::int = 3, 'desmarcar o que não está marcado: nada muda';
  assert pg_temp.since('hugo_stream') = '-', 'desmarcar o que não está marcado não cria o dia da marca';
  perform pg_temp.today('2026-10-06');
  res := public.set_series_subscription('as-m-0007', s, 3, true);
  perform pg_temp.today('2026-10-07');
  assert res #>> '{series,subscription_reviewed_on}' is null and (res #>> '{series,version}')::int = 4, 'marcar de novo: sem data, versão 4';
  assert pg_temp.since('hugo_stream') = '2026-10-06' and res #>> '{series,subscription_since}' = '2026-10-06',
    'marcar de novo começa um novo subscription_since (o dia da nova marca)';
  assert pg_temp.untouched() = before_, 'nada disso muda contas, registros nem vigências';
end $$;
reset role;
select pg_temp.check_links();

-- ---------------------------------------------------------------------------
-- 4. "Revisei minhas assinaturas" (Lia, contexto pessoal): só as assinaturas ATIVAS recebem a data de hoje; encerradas,
-- excluídas e gastos fixos comuns ficam como estão; a data nunca recua; repetir no mesmo dia não muda nada; a versão da série
-- não sobe; a repetição da mesma chave devolve a data mais recente.
-- ---------------------------------------------------------------------------
set role authenticated;
do $$
declare
  ctx uuid := pg_temp.id('lia_ctx');
  res jsonb;
  v int;
  before_ text;
  ops int;
begin
  perform pg_temp.as_('lia');
  -- Sem nenhuma assinatura: a chamada vale e muda 0 (a operação é gravada).
  res := public.mark_subscriptions_reviewed('as-r-0001', ctx);
  assert res ->> 'reviewed_on' = '2026-10-07' and (res ->> 'changed')::int = 0, 'sem assinatura: changed 0';
  assert (select count(*) from public.record_operations where idempotency_key = 'as-r-0001' and action = 'revisar_assinaturas' and context_id = ctx
             and record_id is null and commitment_id is null and target_id is null
             and request_hash = md5(jsonb_build_array('revisar_assinaturas', ctx)::text)) = 1,
    'operação revisar_assinaturas: só o contexto, sem alvo, hash em JSON';

  -- Montagem: duas ativas, uma encerrada (último mês em setembro), uma excluída, uma comum, um parcelamento.
  res := pg_temp.monthly('as-r-0010', ctx, 'Streaming', 3990, 10, '2026-10-01');
  insert into ids values ('lia_stream', (res #>> '{series,id}')::uuid);
  res := pg_temp.monthly('as-r-0011', ctx, 'Academia', 9900, 5, '2026-11-01');
  insert into ids values ('lia_gym', (res #>> '{series,id}')::uuid);
  res := pg_temp.monthly('as-r-0012', ctx, 'Clube', 4500, 20, '2026-09-01', '2026-09-01');
  insert into ids values ('lia_clube', (res #>> '{series,id}')::uuid);
  res := pg_temp.monthly('as-r-0013', ctx, 'Revista', 1990, 1, '2026-10-01');
  insert into ids values ('lia_revista', (res #>> '{series,id}')::uuid);
  res := pg_temp.monthly('as-r-0014', ctx, 'Aluguel', 250000, 5, '2026-10-01');
  insert into ids values ('lia_aluguel', (res #>> '{series,id}')::uuid);
  res := public.create_series('as-r-0015', ctx, 'parcelada', 'compra_parcelada', 'Sofá', null, 20000, 'fixo', 15, '2026-11-01', 1, 10, null, null);
  insert into ids values ('lia_sofa', (res #>> '{series,id}')::uuid);
  perform public.set_series_subscription('as-r-0020', pg_temp.id('lia_stream'), 1, true);
  perform public.set_series_subscription('as-r-0021', pg_temp.id('lia_gym'), 1, true);
  perform public.set_series_subscription('as-r-0022', pg_temp.id('lia_clube'), 1, true);
  perform public.set_series_subscription('as-r-0023', pg_temp.id('lia_revista'), 1, true);
  perform public.delete_series('as-r-0024', pg_temp.id('lia_revista'), 2, pg_temp.open_refs('lia_revista'));
  assert pg_temp.sub_raw('lia_revista') = 'true|-|3|excluida', 'a excluída continua marcada, mas excluída';
  assert (select count(*) from public.series_items where subscription and context_id = ctx) = 3
     and not exists (select 1 from public.series_items where id = pg_temp.id('lia_revista')), 'a visão mostra as três marcadas e não mostra a excluída';
  assert pg_temp.sub('lia_clube') = 'true|-|2' and pg_temp.sub('lia_aluguel') = 'false|-|1', 'estado antes da revisão';
  before_ := pg_temp.untouched();

  res := public.mark_subscriptions_reviewed('as-r-0030', ctx);
  assert res ->> 'reviewed_on' = '2026-10-07' and (res ->> 'changed')::int = 2, 'duas ativas receberam a data';
  assert pg_temp.sub('lia_stream') = 'true|2026-10-07|2' and pg_temp.sub('lia_gym') = 'true|2026-10-07|2', 'datas gravadas, versões iguais';
  assert pg_temp.since('lia_stream') = '2026-10-07' and pg_temp.since('lia_gym') = '2026-10-07' and pg_temp.since('lia_aluguel') = '-',
    'a revisão não mexe em subscription_since; gasto fixo comum não tem';
  assert pg_temp.sub('lia_clube') = 'true|-|2', 'a encerrada não recebe a data';
  assert pg_temp.sub_raw('lia_revista') = 'true|-|3|excluida', 'a excluída não recebe a data';
  assert pg_temp.sub('lia_aluguel') = 'false|-|1' and pg_temp.sub('lia_sofa') = 'false|-|1', 'gasto fixo comum e parcelamento não mudam';
  assert pg_temp.untouched() = before_, 'revisar não muda contas, registros nem vigências';

  -- Repetição da mesma chave: devolve a data mais recente, sem gravar.
  ops := (select count(*) from public.record_operations);
  assert public.mark_subscriptions_reviewed('as-r-0030', ctx) = jsonb_build_object('reviewed_on', '2026-10-07', 'changed', 0), 'repetição: changed 0';
  assert (select count(*) from public.record_operations) = ops, 'repetição não grava';
  perform pg_temp.expect_code(pg_temp.rv('as-r-0030', pg_temp.id('fam')), 'chave_reutilizada', 'PT409');
  perform pg_temp.expect_code(pg_temp.mk('as-r-0030', pg_temp.id('lia_stream'), 2, true), 'chave_reutilizada', 'PT409');
  -- Outra chave, mesmo dia: nada muda.
  res := public.mark_subscriptions_reviewed('as-r-0031', ctx);
  assert (res ->> 'changed')::int = 0 and res ->> 'reviewed_on' = '2026-10-07', 'mesmo dia: changed 0';
  -- Relógio para trás: a data nunca recua.
  perform pg_temp.today('2026-10-01');
  res := public.mark_subscriptions_reviewed('as-r-0032', ctx);
  assert (res ->> 'changed')::int = 0 and pg_temp.sub('lia_stream') = 'true|2026-10-07|2', 'relógio para trás: a data fica';
  -- Dia seguinte: muda de novo, sem subir a versão.
  perform pg_temp.today('2026-10-08');
  res := public.mark_subscriptions_reviewed('as-r-0033', ctx);
  assert res ->> 'reviewed_on' = '2026-10-08' and (res ->> 'changed')::int = 2, 'dia seguinte: as duas ativas de novo';
  assert pg_temp.sub('lia_stream') = 'true|2026-10-08|2' and pg_temp.sub('lia_gym') = 'true|2026-10-08|2', 'datas novas, versões iguais';
  -- Retomar a encerrada a torna ativa: a próxima revisão a inclui; a série ganha versão pelo end_series, não pela revisão.
  perform public.end_series('as-r-0034', pg_temp.id('lia_clube'), 2, null, '[]');
  v := (select version from public.series_items where id = pg_temp.id('lia_clube'));
  assert v = 3, 'retomada: versão 3';
  perform pg_temp.today('2026-10-09');
  res := public.mark_subscriptions_reviewed('as-r-0035', ctx);
  assert (res ->> 'changed')::int = 3 and pg_temp.sub('lia_clube') = 'true|2026-10-09|3', 'a retomada entra na revisão';
  -- Desmarcar tira da revisão e apaga a data.
  perform public.set_series_subscription('as-r-0036', pg_temp.id('lia_gym'), 2, false);
  assert pg_temp.sub('lia_gym') = 'false|-|3', 'desmarcada: sem data';
  perform pg_temp.today('2026-10-10');
  res := public.mark_subscriptions_reviewed('as-r-0037', ctx);
  assert (res ->> 'changed')::int = 2, 'só as duas que continuam marcadas';
  perform pg_temp.today('2026-10-07');
end $$;
reset role;
select pg_temp.check_links();

-- ---------------------------------------------------------------------------
-- 5. Permissões na Família: leitura sem escrita não marca nem revisa (Davi); quem escreve marca as próprias (Elisa) e, com
-- "editar de outras pessoas", também as dos outros (Fábio); a revisão só alcança o que quem chama pode alterar; externo e vínculo
-- revogado não veem a série (Gaia).
-- ---------------------------------------------------------------------------
set role authenticated;
do $$
declare
  fam uuid := pg_temp.id('fam');
  res jsonb;
begin
  perform pg_temp.as_('elisa');
  res := pg_temp.monthly('as-f-0001', fam, 'Streaming da casa', 3990, 10, '2026-10-01');
  insert into ids values ('fam_elisa', (res #>> '{series,id}')::uuid);
  perform pg_temp.as_('fabio');
  res := pg_temp.monthly('as-f-0002', fam, 'Internet móvel', 7990, 12, '2026-10-01');
  insert into ids values ('fam_fabio', (res #>> '{series,id}')::uuid);
  res := pg_temp.monthly('as-f-0003', fam, 'Clube', 12000, 15, '2026-10-01');
  insert into ids values ('fam_fabio2', (res #>> '{series,id}')::uuid);
  perform pg_temp.check_links();

  -- Só leitura.
  perform pg_temp.as_('davi');
  assert pg_temp.sub('fam_elisa') = 'false|-|1', 'Davi lê a série';
  perform pg_temp.expect_code(pg_temp.mk('as-f-0010', pg_temp.id('fam_elisa'), 1, true), 'sem_permissao', '42501');
  perform pg_temp.expect_code(pg_temp.rv('as-f-0011', fam), 'sem_permissao', '42501');
  -- Externa: não lê a série e não escreve no contexto.
  perform pg_temp.as_('gaia');
  assert (select count(*) from public.series_items where context_id = fam) = 0, 'Gaia não vê as séries da Família';
  perform pg_temp.expect_code(pg_temp.mk('as-f-0012', pg_temp.id('fam_elisa'), 1, true), 'nao_encontrado', 'P0002');
  perform pg_temp.expect_code(pg_temp.rv('as-f-0013', fam), 'sem_permissao', '42501');
  -- Elisa (escreve, sem "editar de outras pessoas"): a própria sim, a do Fábio não.
  perform pg_temp.as_('elisa');
  perform pg_temp.expect_code(pg_temp.mk('as-f-0020', pg_temp.id('fam_fabio'), 1, true), 'sem_permissao', '42501');
  res := public.set_series_subscription('as-f-0021', pg_temp.id('fam_elisa'), 1, true);
  assert (res #>> '{series,subscription}')::boolean and (res ->> 'changed')::int = 1, 'Elisa marca a própria';
  assert pg_temp.sub('fam_fabio') = 'false|-|1', 'a do Fábio continua como estava';
  -- Fábio (altera o que é dos outros): marca a da Elisa e as dele.
  perform pg_temp.as_('fabio');
  res := public.set_series_subscription('as-f-0022', pg_temp.id('fam_fabio'), 1, true);
  assert (res ->> 'changed')::int = 1, 'Fábio marca a própria';
  res := public.set_series_subscription('as-f-0023', pg_temp.id('fam_fabio2'), 1, true);
  assert (res ->> 'changed')::int = 1, 'e outra';
  res := public.set_series_subscription('as-f-0024', pg_temp.id('fam_elisa'), 2, false);
  assert not (res #>> '{series,subscription}')::boolean and (res #>> '{series,version}')::int = 3, 'Fábio desmarca a da Elisa (editar de outras pessoas)';
  res := public.set_series_subscription('as-f-0025', pg_temp.id('fam_elisa'), 3, true);
  assert (res #>> '{series,version}')::int = 4, 'e marca de novo';
  -- A revisão alcança só o que quem chama pode alterar.
  perform pg_temp.as_('elisa');
  res := public.mark_subscriptions_reviewed('as-f-0030', fam);
  assert (res ->> 'changed')::int = 1 and pg_temp.sub('fam_elisa') = 'true|2026-10-07|4', 'Elisa revisa só a dela';
  assert pg_temp.sub('fam_fabio') = 'true|-|2' and pg_temp.sub('fam_fabio2') = 'true|-|2', 'as do Fábio ficam sem data';
  perform pg_temp.today('2026-10-08');
  perform pg_temp.as_('fabio');
  res := public.mark_subscriptions_reviewed('as-f-0031', fam);
  assert (res ->> 'changed')::int = 3 and pg_temp.sub('fam_fabio') = 'true|2026-10-08|2' and pg_temp.sub('fam_elisa') = 'true|2026-10-08|4',
    'Fábio revisa as três';
  perform pg_temp.today('2026-10-07');
  -- Vínculo revogado: some a série e a escrita.
  reset role;
  update public.context_memberships set revoked_at = now() where context_id = pg_temp.id('fam') and person_id = pg_temp.id('elisa');
  set role authenticated;
  perform pg_temp.as_('elisa');
  assert (select count(*) from public.series_items where context_id = fam) = 0, 'vínculo revogado: nenhuma série à vista';
  perform pg_temp.expect_code(pg_temp.mk('as-f-0040', pg_temp.id('fam_elisa'), 4, false), 'nao_encontrado', 'P0002');
  perform pg_temp.expect_code(pg_temp.rv('as-f-0041', fam), 'sem_permissao', '42501');
  -- A repetição de uma chave antiga também não revela nada a quem perdeu o acesso.
  perform pg_temp.expect_code(pg_temp.mk('as-f-0021', pg_temp.id('fam_elisa'), 1, true), 'nao_encontrado', 'P0002');
  perform pg_temp.as_('davi');
  assert (select count(*) from public.series_items where context_id = fam and subscription) = 3, 'Davi continua vendo as três marcas';
end $$;
reset role;
select pg_temp.check_links();

-- ---------------------------------------------------------------------------
-- 6. Escrita direta: ninguém grava a marca nem a data fora das funções (RLS, privilégios e visão).
-- ---------------------------------------------------------------------------
set role authenticated;
do $$
begin
  perform pg_temp.as_('lia');
  perform pg_temp.expect_error(format('update public.commitment_series set subscription = true where id = %L', pg_temp.id('lia_aluguel')), 'permission denied%');
  perform pg_temp.expect_error(format('update public.commitment_series set subscription_reviewed_on = %L', '2026-10-07'), 'permission denied%');
  perform pg_temp.expect_error(format('update public.commitment_series set subscription_since = %L', '2026-10-07'), 'permission denied%');
  perform pg_temp.expect_error(format('update public.series_items set subscription = true where id = %L', pg_temp.id('lia_aluguel')), 'permission denied%');
  perform pg_temp.expect_error(format($f$insert into public.commitment_series (context_id, kind, nature, first_due_month, created_by, subscription)
    values (%L, 'mensal', 'conta', '2026-11-01', %L, true)$f$, pg_temp.id('lia_ctx'), pg_temp.id('lia')), 'permission denied%');
  assert not has_any_column_privilege('authenticated', 'public.commitment_series', 'insert, update'), 'sem escrita direta em nenhuma coluna';
  assert not has_table_privilege('authenticated', 'public.series_items', 'insert, update, delete, truncate'), 'sem escrita pela visão';
  assert has_column_privilege('authenticated', 'public.commitment_series', 'subscription', 'select')
     and has_column_privilege('authenticated', 'public.commitment_series', 'subscription_reviewed_on', 'select')
     and has_column_privilege('authenticated', 'public.commitment_series', 'subscription_since', 'select'), 'as colunas se leem';
  assert pg_temp.sub('lia_aluguel') = 'false|-|1', 'nada mudou';
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 7. record_operations: as duas ações novas e a lista vigente (48); cada ação aponta só para o que ela deve apontar.
-- ---------------------------------------------------------------------------
do $$
declare
  cases text[][] := array[
    -- ação, record_id, commitment_id, target_id (1 = preenchido, null = vazio)
    ['marcar_assinatura', null, null, '1'],
    ['marcar_assinatura', '1', null, '1'],
    ['marcar_assinatura', null, '1', '1'],
    ['marcar_assinatura', null, null, null],
    ['revisar_assinaturas', null, null, null],
    ['revisar_assinaturas', '1', null, null],
    ['revisar_assinaturas', null, '1', null],
    ['revisar_assinaturas', null, null, '1']];
  ok_cases int[] := array[1, 5];
begin
  for i in 1 .. array_length(cases, 1) loop
    if i = any (ok_cases) then
      insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id, target_id)
        values (pg_temp.id('lia'), 'as-o-1' || lpad(i::text, 3, '0'), cases[i][1], pg_temp.id('lia_ctx'), 'x',
          case when cases[i][2] is null then null else gen_random_uuid() end,
          case when cases[i][3] is null then null else gen_random_uuid() end,
          case when cases[i][4] is null then null else gen_random_uuid() end);
    else
      perform pg_temp.expect_error(format($f$insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id, target_id)
        values (%L, %L, %L, %L, 'x', %s, %s, %s)$f$,
        pg_temp.id('lia'), 'as-o-1' || lpad(i::text, 3, '0'), cases[i][1], pg_temp.id('lia_ctx'),
        case when cases[i][2] is null then 'null' else 'gen_random_uuid()' end,
        case when cases[i][3] is null then 'null' else 'gen_random_uuid()' end,
        case when cases[i][4] is null then 'null' else 'gen_random_uuid()' end), '%record_operations_target_check%');
    end if;
  end loop;
  perform pg_temp.expect_error(format($f$insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash)
    values (%L, 'as-o-2001', 'marcar_assinaturas', gen_random_uuid(), 'x')$f$, pg_temp.id('lia')), '%record_operations_action_check%');
  perform pg_temp.expect_error(format($f$insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash)
    values (%L, 'as-o-2002', 'revisar_assinatura', gen_random_uuid(), 'x')$f$, pg_temp.id('lia')), '%record_operations_action_check%');
  delete from public.record_operations where idempotency_key like 'as-o-1%';
  assert (select array_agg(m[1] order by m[1] collate "C")
            from pg_constraint c, regexp_matches(pg_get_constraintdef(c.oid), '''([a-z_]+)''::text', 'g') m
           where c.conname = 'record_operations_action_check' and m[1] ~ 'assinatura')
    = array['marcar_assinatura', 'revisar_assinaturas'], 'as 2 ações de assinatura';
  assert (select count(*) from pg_constraint c, regexp_matches(pg_get_constraintdef(c.oid), '''([a-z_]+)''::text', 'g') m
           where c.conname = 'record_operations_action_check') = 48, 'a lista vigente tem 48 ações (46 e as 2 de assinaturas)';
  assert exists (select 1 from pg_constraint c where c.conname = 'record_operations_target_check'
                  and pg_get_constraintdef(c.oid) like '%marcar_assinatura%' and pg_get_constraintdef(c.oid) like '%revisar_assinaturas%'
                  and pg_get_constraintdef(c.oid) like '%excluir_conta%'),
    'o alvo único inclui a marca e as de antes; a revisão fica no ramo sem alvo';
  -- Toda operação de assinatura aponta para uma série do mesmo contexto (marcar) ou para nada (revisar).
  assert exists (select 1 from public.record_operations where action = 'marcar_assinatura')
     and exists (select 1 from public.record_operations where action = 'revisar_assinaturas'), 'as duas ações foram gravadas pelas funções';
  assert not exists (select 1 from public.record_operations o where o.action = 'marcar_assinatura'
                      and not exists (select 1 from public.commitment_series s where s.id = o.target_id and s.context_id = o.context_id)),
    'marcar aponta para uma série do mesmo contexto';
  assert not exists (select 1 from public.record_operations o where o.action = 'revisar_assinaturas'
                      and (o.record_id is not null or o.commitment_id is not null or o.target_id is not null)), 'revisar não aponta para nada';
end $$;

-- ---------------------------------------------------------------------------
-- 8. A marca não mexe em nada do mês (Lia): contas a pagar, registros, totais e Ainda a pagar ficam iguais; a atividade conta
-- marcar como anotação e não conta revisar (Íris, depois de 74 dias sem anotar).
-- ---------------------------------------------------------------------------
set role authenticated;
do $$
declare
  ctx uuid := pg_temp.id('lia_ctx');
  totals_ bigint[];
  pay_ bigint[];
  list_ text;
  n_ops int;
begin
  perform pg_temp.as_('lia');
  perform pg_temp.today('2026-10-07');
  totals_ := (select array[received_cents, paid_cents, difference_cents] from public.month_totals(ctx, '2026-10-01'));
  pay_ := (select array[due_in_month_cents, overdue_before_cents, to_pay_cents, open_count] from public.month_to_pay(ctx, '2026-10-01'));
  list_ := (select string_agg(format('%s|%s|%s|%s', description, amount_cents, due_on, status), ';' order by due_on, description) from public.commitment_items);
  n_ops := (select count(*) from public.financial_records);
  -- Marca e desmarca o gasto fixo comum e revisa: os números do mês não mudam.
  perform public.set_series_subscription('as-8-0001', pg_temp.id('lia_aluguel'), 1, true);
  perform public.mark_subscriptions_reviewed('as-8-0002', ctx);
  perform public.set_series_subscription('as-8-0003', pg_temp.id('lia_aluguel'), 2, false);
  assert (select array[received_cents, paid_cents, difference_cents] from public.month_totals(ctx, '2026-10-01')) = totals_, 'Recebido, Pago e Diferença iguais';
  assert (select array[due_in_month_cents, overdue_before_cents, to_pay_cents, open_count] from public.month_to_pay(ctx, '2026-10-01')) = pay_, 'Ainda a pagar igual';
  assert (select string_agg(format('%s|%s|%s|%s', description, amount_cents, due_on, status), ';' order by due_on, description) from public.commitment_items) = list_,
    'as contas a pagar são as mesmas';
  assert (select count(*) from public.financial_records) = n_ops, 'nenhum registro novo';

  -- Atividade (Íris). Criar a série em 07/10 é anotação; 74 dias depois, revisar não conta, marcar conta.
  perform pg_temp.as_('iris');
  perform pg_temp.today('2026-10-07');
  perform pg_temp.monthly('as-8-0010', pg_temp.id('iris_ctx'), 'Streaming', 3990, 10, '2026-10-01');
  insert into ids select 'iris_stream', id from public.series_items where context_id = pg_temp.id('iris_ctx');
  assert (select last_write_on::text from public.context_activity where context_id = pg_temp.id('iris_ctx')) = '2026-10-07'
     and (select absence_from_on from public.context_activity where context_id = pg_temp.id('iris_ctx')) is null, 'anotou em 07/10';
  perform pg_temp.today('2026-12-20');
  perform public.set_series_subscription('as-8-0011', pg_temp.id('iris_stream'), 1, true);
  assert (select last_write_on::text || '|' || absence_from_on::text || '|' || absence_until_on::text from public.context_activity
           where context_id = pg_temp.id('iris_ctx')) = '2026-12-20|2026-10-07|2026-12-20', 'marcar conta como anotação e registra a ausência de 74 dias';
  -- Outra pessoa nova: a revisão sozinha não toca a atividade.
  perform pg_temp.as_('hugo');
  perform pg_temp.today('2026-10-07');
  perform pg_temp.monthly('as-8-0020', pg_temp.id('hugo_ctx'), 'Aplicativo', 1990, 3, '2026-10-01');
  perform pg_temp.today('2026-12-20');
  perform public.mark_subscriptions_reviewed('as-8-0021', pg_temp.id('hugo_ctx'));
  assert (select last_write_on::text from public.context_activity where context_id = pg_temp.id('hugo_ctx')) = '2026-10-07'
     and (select absence_from_on from public.context_activity where context_id = pg_temp.id('hugo_ctx')) is null,
    'revisar assinaturas não é anotação: a última anotação e a ausência ficam como estavam';
  perform pg_temp.today('2026-10-07');
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 9. O app publicado antes da 0011: as funções de série têm as mesmas assinaturas e seguem funcionando; a marca sobrevive a
-- editar a partir de um mês, encerrar e retomar; excluir devolve a série com a marca; a série criada pelo app antigo nasce sem marca.
-- ---------------------------------------------------------------------------
do $$
begin
  assert to_regprocedure('public.create_series(text, uuid, text, text, text, text, bigint, text, integer, date, integer, integer, date, integer)') is not null
     and to_regprocedure('public.update_series_from(text, uuid, integer, integer, jsonb, text, text, text, bigint, text, integer)') is not null
     and to_regprocedure('public.end_series(text, uuid, integer, integer, jsonb)') is not null
     and to_regprocedure('public.delete_series(text, uuid, integer, jsonb)') is not null
     and to_regprocedure('public.sync_series_occurrences(uuid)') is not null
     and to_regprocedure('public.inform_series_year(text, uuid, integer, jsonb, bigint)') is not null
     and to_regprocedure('public.skip_series_year(text, uuid, integer, jsonb)') is not null
     and to_regprocedure('public.create_series_occurrence(text, uuid, integer, integer, text)') is not null,
    'as funções de série mantêm as assinaturas da 0010';
end $$;
set role authenticated;
do $$
declare
  ctx uuid := pg_temp.id('lia_ctx');
  s uuid := pg_temp.id('lia_stream');
  res jsonb;
  open_ jsonb;
begin
  perform pg_temp.as_('lia');
  perform pg_temp.today('2026-10-07');
  -- Editar a partir de novembro (a assinatura sobe de R$ 39,90 para R$ 44,90) mantém a marca e a data.
  assert pg_temp.sub('lia_stream') = 'true|2026-10-10|2' and pg_temp.since('lia_stream') = '2026-10-07', 'antes de editar';
  open_ := (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'version', version) order by occurrence_number), '[]'::jsonb)
              from public.commitments where series_id = s and deleted_at is null and status = 'aberto' and occurrence_number >= 2);
  res := public.update_series_from('as-c-0001', s, 2, 2, open_, 'conta', 'Streaming', null, 4490, 'fixo', 10);
  assert (res #>> '{series,subscription}')::boolean and res #>> '{series,subscription_reviewed_on}' = '2026-10-10'
     and (res #>> '{series,version}')::int = 3 and pg_temp.since('lia_stream') = '2026-10-07', 'update_series_from mantém a marca e as datas';
  -- Encerrar e retomar mantêm a marca; a encerrada deixa de contar na revisão e volta quando retomada.
  res := public.end_series('as-c-0002', s, 3, 1, pg_temp.open_refs('lia_stream', 1));
  assert (res #>> '{series,subscription}')::boolean and pg_temp.since('lia_stream') = '2026-10-07', 'end_series mantém a marca e o dia dela';
  res := public.end_series('as-c-0003', s, 4, null, '[]');
  assert (res #>> '{series,subscription}')::boolean and res #>> '{series,subscription_reviewed_on}' = '2026-10-10'
     and pg_temp.since('lia_stream') = '2026-10-07', 'retomar mantém a marca e as datas';
  -- Uma série criada pela assinatura antiga de create_series (14 argumentos) nasce sem marca.
  res := public.create_series('as-c-0010', ctx, 'mensal', 'conta', 'Água', null, 6000, 'variavel', 8, '2026-11-01', 1, null, null, null);
  assert not (res #>> '{series,subscription}')::boolean and res #>> '{series,subscription_reviewed_on}' is null
     and res #>> '{series,subscription_since}' is null, 'create_series: sem marca';
  -- Excluir a série marcada devolve a série excluída com a marca (a repetição lê a série excluída).
  open_ := pg_temp.open_refs('lia_stream');
  res := public.delete_series('as-c-0011', s, 5, open_);
  assert (res #>> '{series,subscription}')::boolean and res #>> '{series,deleted_at}' is not null, 'delete_series devolve a série excluída com a marca';
  assert (public.delete_series('as-c-0011', s, 5, open_) #>> '{series,subscription}')::boolean, 'a repetição segue funcionando';
  perform pg_temp.expect_code(pg_temp.mk('as-c-0012', s, 6, false), 'nao_encontrado', 'P0002');
end $$;
reset role;
select pg_temp.check_links();

-- ---------------------------------------------------------------------------
-- 10. Privilégios: as duas funções públicas novas são executáveis por authenticated e por mais ninguém; nada ficou aberto.
-- ---------------------------------------------------------------------------
do $$
begin
  assert has_function_privilege('authenticated', 'public.set_series_subscription(text, uuid, integer, boolean)', 'execute')
     and has_function_privilege('authenticated', 'public.mark_subscriptions_reviewed(text, uuid)', 'execute'), 'authenticated executa as duas';
  assert not has_function_privilege('anon', 'public.set_series_subscription(text, uuid, integer, boolean)', 'execute')
     and not has_function_privilege('anon', 'public.mark_subscriptions_reviewed(text, uuid)', 'execute'), 'anon não executa';
  assert (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in ('set_series_subscription', 'mark_subscriptions_reviewed')) = 2, 'só uma versão de cada';
  assert (select bool_and(p.prosecdef and p.provolatile = 'v' and p.proconfig @> array['search_path=public'])
            from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in ('set_series_subscription', 'mark_subscriptions_reviewed')),
    'security definer, volátil, com search_path fixo';
  assert pg_get_function_arguments('public.set_series_subscription(text, uuid, integer, boolean)'::regprocedure)
       = 'p_idempotency_key text, p_series_id uuid, p_expected_version integer, p_subscription boolean'
     and pg_get_function_arguments('public.mark_subscriptions_reviewed(text, uuid)'::regprocedure)
       = 'p_idempotency_key text, p_context_id uuid', 'nomes dos argumentos';
  assert not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                      where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')), 'anon não executa nenhuma função';
  assert not has_function_privilege('authenticated', 'public.clarevo_track_activity()', 'execute'), 'o gatilho de atividade continua fechado';
end $$;

rollback;
