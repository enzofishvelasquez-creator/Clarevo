-- "Conferi este mês" (D-060, item 2; resolve P-022; migração 0016): month_checks, set_month_check, clear_month_check e a leitura da marca em
-- months_overview (received_checked e paid_checked). A pessoa marca que um mês já terminado não teve recebimentos ("recebimentos") ou não
-- teve gastos ("pagamentos"): o zero confirmado, que se distingue do mês sem registro. A marca é por contexto, mês e tipo, nunca muda um
-- total, não conta como anotação para a atividade de "Seus últimos meses" (D-030) e deixa de valer (sem ser apagada) quando aparece um
-- registro do tipo no mês. Na Família, quem escreve marca e desmarca; quem só lê vê; a empresa nunca lê. Confere também permissões,
-- validação do mês e do tipo, idempotência e versão, a ação nova em record_operations, a gravação direta recusada, a exclusão da conta
-- (D-058: o Pessoal some; na Família a marca fica com a autoria "Pessoa que saiu") e os privilégios.
-- Pessoas FICTÍCIAS: Lia (titular da Família da Lia e do Pessoal), Davi (leitor), Mara (membro), Nuno (membro, depois removido),
-- Otávio (externo), Paula (RH da empresa; Lia tem a licença), Quim (conta nova), Ester (membro, que depois exclui a conta) e Tito
-- (titular sozinho, que exclui a conta). Tudo em uma transação desfeita no fim. Valores em centavos.
\set ON_ERROR_STOP 1
\set lia    '''00000000-0000-0000-0000-0000000000e1'''
\set davi   '''00000000-0000-0000-0000-0000000000e2'''
\set mara   '''00000000-0000-0000-0000-0000000000e3'''
\set nuno   '''00000000-0000-0000-0000-0000000000e4'''
\set otavio '''00000000-0000-0000-0000-0000000000e5'''
\set paula  '''00000000-0000-0000-0000-0000000000e6'''
\set quim   '''00000000-0000-0000-0000-0000000000e7'''
\set ester  '''00000000-0000-0000-0000-0000000000e8'''
\set tito   '''00000000-0000-0000-0000-0000000000e9'''

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

-- Chamadas em texto (para expect_*): nulo vira NULL.
create function pg_temp.sm(p_key text, p_ctx text, p_month date, p_kind text, p_version integer) returns text language sql as $$
  select format('select public.set_month_check(%L, %L, %L, %L, %L)', pg_temp.id(p_ctx), p_month, p_kind, p_key, p_version)
$$;
create function pg_temp.cm(p_key text, p_ctx text, p_month date, p_kind text, p_version integer) returns text language sql as $$
  select format('select public.clear_month_check(%L, %L, %L, %L, %L)', pg_temp.id(p_ctx), p_month, p_kind, p_key, p_version)
$$;

-- Como a pessoa lê o mês (months_overview, security invoker): "recebido contagem/valor/marca pago contagem/valor/marca".
create function pg_temp.ov(p_ctx text, p_month date) returns text language sql as $$
  select format('recebido %s/%s/%s pago %s/%s/%s', received_count, received_cents, case when received_checked then 't' else 'f' end,
                paid_count, paid_cents, case when paid_checked then 't' else 'f' end)
    from public.months_overview(pg_temp.id(p_ctx), p_month, p_month)
$$;

-- As marcas do contexto, direto na tabela (sem a RLS): "2026-08 pagamentos por Lia v1; ...".
create function pg_temp.marks(p_ctx text) returns text language sql security definer set search_path = public, pg_temp as $$
  select coalesce(string_agg(format('%s %s por %s v%s', to_char(c.month, 'YYYY-MM'), c.kind,
                                    coalesce(nullif((select p.display_name from public.persons p where p.id = c.checked_by), ''), 'anônima'), c.version),
                             '; ' order by c.month, c.kind), '-')
    from public.month_checks c where c.context_id = pg_temp.id(p_ctx)
$$;
create function pg_temp.nmarks() returns bigint language sql security definer set search_path = public, pg_temp as $$
  select count(*) from public.month_checks
$$;
-- Operações de conferir (marcar e desmarcar) da pessoa, ou todas.
create function pg_temp.nops(p_person text default null, p_action text default null) returns bigint language sql security definer
set search_path = public, pg_temp as $$
  select count(*) from public.record_operations
   where action in ('marcar_mes_conferido', 'desmarcar_mes_conferido')
     and (p_person is null or actor_id = pg_temp.id(p_person)) and (p_action is null or action = p_action)
$$;
-- Todas as operações (sem a RLS).
create function pg_temp.allops() returns bigint language sql security definer set search_path = public, pg_temp as $$
  select count(*) from public.record_operations
$$;
-- Atividade (D-030): "última anotação ausência-de ausência-até", direto na tabela (sem a RLS).
create function pg_temp.act(p_person text, p_ctx text) returns text language sql security definer set search_path = public, pg_temp as $$
  select format('%s %s %s', to_char(last_write_on, 'YYYY-MM-DD'), coalesce(to_char(absence_from_on, 'YYYY-MM-DD'), '-'),
                coalesce(to_char(absence_until_on, 'YYYY-MM-DD'), '-'))
    from public.context_activity where person_id = pg_temp.id(p_person) and context_id = pg_temp.id(p_ctx)
$$;
-- Impressão digital de tudo o que a marca não pode mudar: registros, contas a pagar, séries, renda de referência, metas, movimentos,
-- cartões, revisões, atividade e contas.
create function pg_temp.fp() returns text language sql security definer set search_path = public, pg_temp as $$
  select md5(concat_ws('#',
    (select coalesce(string_agg(to_jsonb(t)::text, ',' order by t.id), '') from public.financial_records t),
    (select coalesce(string_agg(to_jsonb(t)::text, ',' order by t.id), '') from public.commitments t),
    (select coalesce(string_agg(to_jsonb(t)::text, ',' order by t.id), '') from public.commitment_series t),
    (select coalesce(string_agg(to_jsonb(t)::text, ',' order by t.id), '') from public.income_references t),
    (select coalesce(string_agg(to_jsonb(t)::text, ',' order by t.id), '') from public.goals t),
    (select coalesce(string_agg(to_jsonb(t)::text, ',' order by t.id), '') from public.goal_movements t),
    (select coalesce(string_agg(to_jsonb(t)::text, ',' order by t.id), '') from public.card_entries t),
    (select coalesce(string_agg(to_jsonb(t)::text, ',' order by t.person_id, t.context_id), '') from public.return_reviews t),
    (select coalesce(string_agg(to_jsonb(t)::text, ',' order by t.person_id, t.context_id), '') from public.context_activity t),
    (select coalesce(string_agg(to_jsonb(t)::text, ',' order by t.id), '') from public.financial_accounts t)))
$$;
-- A conta padrão do contexto (para criar registros).
create function pg_temp.acc(p_ctx text) returns uuid language sql security definer set search_path = public, pg_temp as $$
  select id from public.financial_accounts where context_id = pg_temp.id(p_ctx) and is_default and deleted_at is null limit 1
$$;
-- Registro como a pessoa de quem a sessão está aberta: devolve o id.
create function pg_temp.rec(p_key text, p_ctx text, p_kind public.record_kind, p_cents bigint, p_day date, p_name text default 'Teste') returns uuid
language sql as $$
  select (public.create_record(p_key, pg_temp.id(p_ctx), pg_temp.acc(p_ctx), p_kind, p_cents, p_day, p_name, null)).id
$$;
-- Cria uma Família como a pessoa e guarda o contexto; convida e aceita.
create function pg_temp.family(p_who text, p_name text, p_ctx text) returns void language plpgsql as $$
begin
  perform pg_temp.as_(p_who);
  insert into ids values (p_ctx, (public.create_family(p_name, 'mc-fam-' || p_ctx) #>> '{context,id}')::uuid);
end $$;
create function pg_temp.join_as(p_who text, p_by text, p_role text, p_ctx text) returns void language plpgsql as $$
declare
  r jsonb;
begin
  perform pg_temp.as_(p_by);
  r := public.create_family_invite(pg_temp.id(p_ctx), p_role, 'mc-inv-' || p_who || '-' || p_ctx);
  perform pg_temp.as_(p_who);
  perform public.accept_family_invite(r ->> 'code', 'mc-acc-' || p_who || '-' || p_ctx);
end $$;

insert into ids values ('lia', :lia), ('davi', :davi), ('mara', :mara), ('nuno', :nuno), ('otavio', :otavio), ('paula', :paula),
  ('quim', :quim), ('ester', :ester), ('tito', :tito);
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  (:lia,    'lia@exemplo.test',    now(), '{"display_name":"Lia"}'),
  (:davi,   'davi@exemplo.test',   now(), '{"display_name":"Davi"}'),
  (:mara,   'mara@exemplo.test',   now(), '{"display_name":"Mara"}'),
  (:nuno,   'nuno@exemplo.test',   now(), '{"display_name":"Nuno"}'),
  (:otavio, 'otavio@exemplo.test', now(), '{"display_name":"Otávio"}'),
  (:paula,  'paula@empresa.test',  now(), '{"display_name":"Paula"}'),
  (:quim,   'quim@exemplo.test',   now(), '{"display_name":"Quim"}'),
  (:ester,  'ester@exemplo.test',  now(), '{"display_name":"Ester"}'),
  (:tito,   'tito@exemplo.test',   now(), '{"display_name":"Tito"}');

-- Espaços pessoais, a Família da Lia (Davi lê; Mara e Nuno escrevem; Ester escreve) e a de Tito (sozinho); a empresa da Paula (Lia tem a licença).
set role authenticated;
do $$
declare
  p text;
  space jsonb;
begin
  foreach p in array array['lia', 'davi', 'mara', 'nuno', 'otavio', 'paula', 'quim', 'ester', 'tito'] loop
    perform pg_temp.as_(p);
    space := public.ensure_personal_space('Conta principal');
    insert into ids values (p || '_ctx', (space ->> 'context_id')::uuid);
  end loop;
  perform pg_temp.family('lia', 'Família da Lia', 'fam');
  perform pg_temp.join_as('davi', 'lia', 'leitor', 'fam');
  perform pg_temp.join_as('mara', 'lia', 'membro', 'fam');
  perform pg_temp.join_as('nuno', 'lia', 'membro', 'fam');
  perform pg_temp.join_as('ester', 'lia', 'membro', 'fam');
  perform pg_temp.family('tito', 'Família do Tito', 'tfam');
end $$;
reset role;
insert into public.organizations (id, name) values ('10000000-0000-0000-0000-0000000000e1', 'Empresa Fictícia do Conferi');
insert into public.organization_admins values ('10000000-0000-0000-0000-0000000000e1', :paula);
insert into public.benefit_contracts (id, organization_id, seats, plan, starts_on)
  values ('20000000-0000-0000-0000-0000000000e1', '10000000-0000-0000-0000-0000000000e1', 10, 'familiar', '2026-05-01');
insert into public.licenses (id, contract_id, invited_email, person_id, status, activated_at)
  values ('30000000-0000-0000-0000-0000000000e1', '20000000-0000-0000-0000-0000000000e1', 'lia@exemplo.test', :lia, 'ativa', now());

-- Papéis da Família, como o backend os guarda: titular, leitor e membros que escrevem.
do $$ begin
  assert (select array_agg(format('%s %s %s', p.display_name, m.role, case when m.can_write then 'escreve' else 'só lê' end) order by p.display_name)
            from public.context_memberships m join public.persons p on p.id = m.person_id where m.context_id = pg_temp.id('fam'))
       = array['Davi membro só lê', 'Ester membro escreve', 'Lia titular escreve', 'Mara membro escreve', 'Nuno membro escreve'],
    'a Família da Lia: titular, leitor e membros';
end $$;

-- ---------------------------------------------------------------------------
-- 1. Conta nova: nenhuma marca (nem para ninguém); a leitura mantém as colunas de antes e mês sem anotação vale zero e false.
-- ---------------------------------------------------------------------------
set role authenticated;
do $$ begin
  perform pg_temp.as_('quim');
  assert (select count(*) from public.month_checks) = 0, 'conta nova sem marca de exemplo';
  assert pg_temp.ov('quim_ctx', '2026-08-01') = 'recebido 0/0/f pago 0/0/f', 'mês sem anotação: zeros e sem marca';
end $$;
reset role;
do $$ begin
  assert pg_temp.nmarks() = 0, 'criar os espaços e a Família não grava marca para ninguém';
  assert pg_temp.nops() = 0, 'nenhuma operação de conferir ainda';
end $$;

-- ---------------------------------------------------------------------------
-- 2. Marcar no Pessoal: os dois tipos, o resultado, a linha, a operação e o que NÃO muda.
-- ---------------------------------------------------------------------------
set role authenticated;
do $$ begin
  perform pg_temp.as_('lia');
  perform pg_temp.rec('mc-lia-rec-0001', 'lia_ctx', 'despesa', 3500, '2026-09-10', 'Mercado de setembro');
  perform pg_temp.rec('mc-lia-rec-0002', 'lia_ctx', 'receita', 600000, '2026-09-01', 'Salário de setembro');
end $$;
reset role;
select pg_temp.keep('fp0', pg_temp.fp());
select pg_temp.keep('act0', pg_temp.act('lia', 'lia_ctx'));
set role authenticated;
do $$
declare
  r jsonb;
  totals_before text;
begin
  perform pg_temp.as_('lia');
  totals_before := (select format('%s/%s/%s', received_cents, paid_cents, difference_cents) from public.month_totals(pg_temp.id('lia_ctx'), '2026-08-01'));
  assert pg_temp.ov('lia_ctx', '2026-08-01') = 'recebido 0/0/f pago 0/0/f', 'agosto: sem registro, sem marca';
  -- Marcar: "não houve gastos em agosto" e "não houve recebimentos em agosto".
  r := public.set_month_check(pg_temp.id('lia_ctx'), '2026-08-01', 'pagamentos', 'mc-lia-set-0001', 0);
  assert (r ->> 'context_id', r ->> 'month', r ->> 'kind', r ->> 'checked', r ->> 'version') = (pg_temp.id('lia_ctx')::text, '2026-08-01', 'pagamentos', 'true', '1'),
    'o resultado diz a marca: ' || r::text;
  assert (r ->> 'checked_at')::timestamptz between now() - interval '1 minute' and now() + interval '1 minute', 'a hora de quem marcou';
  assert pg_temp.ov('lia_ctx', '2026-08-01') = 'recebido 0/0/f pago 0/0/t', 'só o tipo marcado vale (pagamentos)';
  r := public.set_month_check(pg_temp.id('lia_ctx'), '2026-08-01', 'recebimentos', 'mc-lia-set-0002', 0);
  assert (r ->> 'kind', r ->> 'checked', r ->> 'version') = ('recebimentos', 'true', '1'), 'o segundo tipo, no mesmo mês';
  assert pg_temp.ov('lia_ctx', '2026-08-01') = 'recebido 0/0/t pago 0/0/t', 'os dois tipos valem';
  -- Outros meses seguem sem marca; setembro tem registros nos dois tipos.
  assert pg_temp.ov('lia_ctx', '2026-07-01') = 'recebido 0/0/f pago 0/0/f', 'julho segue sem marca';
  assert pg_temp.ov('lia_ctx', '2026-09-01') = 'recebido 1/600000/f pago 1/3500/f', 'setembro segue com os registros';
  -- Nenhum total muda: a marca não é um lançamento.
  assert (select format('%s/%s/%s', received_cents, paid_cents, difference_cents) from public.month_totals(pg_temp.id('lia_ctx'), '2026-08-01')) = totals_before,
    'Recebido, Pago e Diferença de agosto são os mesmos';
  assert (select count(*) from public.month_checks) = 2, 'a Lia lê as duas marcas pela tabela';
  -- A leitura de vários meses de uma vez devolve cada mês com as suas marcas, do mais antigo ao mais recente.
  assert (select string_agg(format('%s:%s%s', to_char(month, 'MM'), case when received_checked then 'R' else '-' end, case when paid_checked then 'P' else '-' end),
                            ' ' order by month)
            from public.months_overview(pg_temp.id('lia_ctx'), '2026-06-01', '2026-09-01')) = '06:-- 07:-- 08:RP 09:--', 'quatro meses de uma vez';
end $$;
reset role;
do $$ begin
  assert pg_temp.marks('lia_ctx') = '2026-08 pagamentos por Lia v1; 2026-08 recebimentos por Lia v1', 'ordem por mês e tipo: ' || pg_temp.marks('lia_ctx');
  assert pg_temp.fp() = pg_temp.was('fp0'), 'nenhum registro, conta, série, meta, cartão, revisão, atividade nem conta de origem mudou';
  assert pg_temp.act('lia', 'lia_ctx') = pg_temp.was('act0'), 'conferir um mês não conta como anotação (a atividade de D-030 não mudou)';
  assert pg_temp.nops('lia') = 2 and pg_temp.nops('lia', 'marcar_mes_conferido') = 2, 'duas operações de marcar';
  assert not exists (select 1 from public.record_operations
                      where action in ('marcar_mes_conferido', 'desmarcar_mes_conferido')
                        and (record_id is not null or commitment_id is not null or target_id is not null or context_id <> pg_temp.id('lia_ctx'))),
    'a operação é sem alvo e no contexto certo';
  assert (select request_hash from public.record_operations where idempotency_key = 'mc-lia-set-0001')
       = md5(jsonb_build_array('marcar_mes_conferido', pg_temp.id('lia_ctx'), '2026-08-01'::date, 'pagamentos', 0)::text), 'o hash em JSON da chamada';
end $$;

-- ---------------------------------------------------------------------------
-- 3. Mês e tipo: só mês já terminado (primeiro dia), só os dois tipos; a ordem das recusas; recusa não grava nada.
-- ---------------------------------------------------------------------------
reset role;
select pg_temp.keep('fp1', pg_temp.fp());
set role authenticated;
do $$
declare
  n bigint := pg_temp.nops();
begin
  perform pg_temp.as_('lia');
  -- O mês atual (outubro) e os futuros são recusados, nos dois tipos; setembro, o último mês terminado, vale.
  perform pg_temp.expect_code(pg_temp.sm('mc-bad-0001', 'lia_ctx', '2026-10-01', 'pagamentos', 0), 'mes_invalido', '22023');
  perform pg_temp.expect_code(pg_temp.sm('mc-bad-0002', 'lia_ctx', '2026-10-01', 'recebimentos', 0), 'mes_invalido', '22023');
  perform pg_temp.expect_code(pg_temp.sm('mc-bad-0003', 'lia_ctx', '2026-11-01', 'pagamentos', 0), 'mes_invalido', '22023');
  perform pg_temp.expect_code(pg_temp.sm('mc-bad-0004', 'lia_ctx', '2030-01-01', 'recebimentos', 0), 'mes_invalido', '22023');
  perform pg_temp.expect_code(pg_temp.sm('mc-bad-0005', 'lia_ctx', '2026-08-15', 'pagamentos', 0), 'mes_invalido', '22023');
  perform pg_temp.expect_code(pg_temp.sm('mc-bad-0006', 'lia_ctx', '2026-08-02', 'pagamentos', 0), 'mes_invalido', '22023');
  perform pg_temp.expect_code(pg_temp.sm('mc-bad-0007', 'lia_ctx', '2026-08-31', 'pagamentos', 0), 'mes_invalido', '22023');
  perform pg_temp.expect_code(pg_temp.sm('mc-bad-0008', 'lia_ctx', null, 'pagamentos', 0), 'mes_invalido', '22023');
  perform pg_temp.expect_code($f$select public.set_month_check((select id from ids where name = 'lia_ctx'), 'infinity'::date, 'pagamentos', 'mc-bad-0009', 0)$f$, 'mes_invalido', '22023');
  perform pg_temp.expect_code($f$select public.set_month_check((select id from ids where name = 'lia_ctx'), '-infinity'::date, 'pagamentos', 'mc-bad-0010', 0)$f$, 'mes_invalido', '22023');
  -- Tipo: só 'recebimentos' e 'pagamentos'.
  perform pg_temp.expect_code(pg_temp.sm('mc-bad-0011', 'lia_ctx', '2026-07-01', 'gastos', 0), 'tipo_invalido', '22023');
  perform pg_temp.expect_code(pg_temp.sm('mc-bad-0012', 'lia_ctx', '2026-07-01', 'Pagamentos', 0), 'tipo_invalido', '22023');
  perform pg_temp.expect_code(pg_temp.sm('mc-bad-0013', 'lia_ctx', '2026-07-01', '', 0), 'tipo_invalido', '22023');
  perform pg_temp.expect_code(pg_temp.sm('mc-bad-0014', 'lia_ctx', '2026-07-01', null, 0), 'tipo_invalido', '22023');
  -- O tipo vem antes do mês quando os dois estão errados; a permissão vem antes dos dois.
  perform pg_temp.expect_code(pg_temp.sm('mc-bad-0015', 'lia_ctx', '2026-10-01', 'gastos', 0), 'tipo_invalido', '22023');
  perform pg_temp.as_('otavio');
  perform pg_temp.expect_code(pg_temp.sm('mc-bad-0016', 'lia_ctx', '2026-10-01', 'gastos', 0), 'sem_permissao', '42501');
  perform pg_temp.as_('lia');
  -- Chave: curta, nula; sessão ausente.
  perform pg_temp.expect_code(pg_temp.sm('curta', 'lia_ctx', '2026-07-01', 'pagamentos', 0), 'chave_invalida', '22023');
  perform pg_temp.expect_code(pg_temp.sm(null, 'lia_ctx', '2026-07-01', 'pagamentos', 0), 'chave_invalida', '22023');
  perform pg_temp.expect_code(pg_temp.cm('curta', 'lia_ctx', '2026-08-01', 'pagamentos', 1), 'chave_invalida', '22023');
  perform pg_temp.expect_code(format('select public.set_month_check(null, %L, %L, %L, 0)', '2026-07-01'::date, 'pagamentos', 'mc-bad-0017'), 'sem_permissao', '42501');
  -- Desmarcar valida o mês e o tipo do mesmo jeito.
  perform pg_temp.expect_code(pg_temp.cm('mc-bad-0018', 'lia_ctx', '2026-10-01', 'pagamentos', 1), 'mes_invalido', '22023');
  perform pg_temp.expect_code(pg_temp.cm('mc-bad-0019', 'lia_ctx', '2026-08-15', 'pagamentos', 1), 'mes_invalido', '22023');
  perform pg_temp.expect_code(pg_temp.cm('mc-bad-0020', 'lia_ctx', '2026-08-01', 'gastos', 1), 'tipo_invalido', '22023');
  assert pg_temp.nops() = n, 'recusa não grava operação (as chaves podem ser usadas de novo)';
  -- Sem sessão.
  perform set_config('request.jwt.claim.sub', '', true);
  perform pg_temp.expect_code(pg_temp.sm('mc-bad-0021', 'lia_ctx', '2026-07-01', 'pagamentos', 0), 'nao_autenticado', '42501');
  perform pg_temp.expect_code(pg_temp.cm('mc-bad-0022', 'lia_ctx', '2026-08-01', 'pagamentos', 1), 'nao_autenticado', '42501');
end $$;
reset role;
do $$ begin
  assert pg_temp.fp() = pg_temp.was('fp1') and pg_temp.nmarks() = 2, 'as recusas não gravaram nada';
end $$;

-- O "hoje" é o da pessoa: em novembro, outubro já terminou (vale) e novembro ainda não (recusado); a geração de gasto fixo e a hora não importam.
set role authenticated;
do $$ begin
  perform pg_temp.as_('lia');
  perform pg_temp.today('2026-11-02');
  perform pg_temp.expect_code(pg_temp.sm('mc-bad-0031', 'lia_ctx', '2026-11-01', 'pagamentos', 0), 'mes_invalido', '22023');
  perform public.set_month_check(pg_temp.id('lia_ctx'), '2026-10-01', 'recebimentos', 'mc-nov-0001', 0);
  assert pg_temp.ov('lia_ctx', '2026-10-01') = 'recebido 0/0/t pago 0/0/f', 'em novembro, outubro já vale';
  perform public.clear_month_check(pg_temp.id('lia_ctx'), '2026-10-01', 'recebimentos', 'mc-nov-0002', 1);
  perform pg_temp.today('2026-10-07');
  -- De volta a outubro: a marca de outubro foi desfeita, e outubro (mês atual) segue recusado.
  perform pg_temp.expect_code(pg_temp.sm('mc-bad-0032', 'lia_ctx', '2026-10-01', 'recebimentos', 0), 'mes_invalido', '22023');
  -- Um mês muito antigo vale (o banco não limita para trás: registros também podem ser antigos).
  perform public.set_month_check(pg_temp.id('lia_ctx'), '2019-03-01', 'pagamentos', 'mc-old-0001', 0);
  assert pg_temp.ov('lia_ctx', '2019-03-01') = 'recebido 0/0/f pago 0/0/t', 'março de 2019';
  perform public.clear_month_check(pg_temp.id('lia_ctx'), '2019-03-01', 'pagamentos', 'mc-old-0002', 1);
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 4. Idempotência e versão.
-- ---------------------------------------------------------------------------
set role authenticated;
do $$
declare
  r1 jsonb;
  r2 jsonb;
  n bigint;
begin
  perform pg_temp.as_('lia');
  -- Repetir a mesma chamada devolve o mesmo resultado, sem outra operação nem outra marca.
  n := pg_temp.allops();
  r1 := public.set_month_check(pg_temp.id('lia_ctx'), '2026-08-01', 'pagamentos', 'mc-lia-set-0001', 0);
  assert r1 ->> 'checked' = 'true' and r1 ->> 'version' = '1' and r1 ->> 'kind' = 'pagamentos', 'a repetição devolve a marca';
  assert pg_temp.allops() = n, 'a repetição não grava operação';
  -- A mesma chave com outros argumentos, ou de outra ação, é chave_reutilizada.
  perform pg_temp.expect_code(pg_temp.sm('mc-lia-set-0001', 'lia_ctx', '2026-08-01', 'recebimentos', 0), 'chave_reutilizada', 'PT409');
  perform pg_temp.expect_code(pg_temp.sm('mc-lia-set-0001', 'lia_ctx', '2026-07-01', 'pagamentos', 0), 'chave_reutilizada', 'PT409');
  perform pg_temp.expect_code(pg_temp.sm('mc-lia-set-0001', 'lia_ctx', '2026-08-01', 'pagamentos', 1), 'chave_reutilizada', 'PT409');
  perform pg_temp.expect_code(pg_temp.cm('mc-lia-set-0001', 'lia_ctx', '2026-08-01', 'pagamentos', 1), 'chave_reutilizada', 'PT409');
  perform pg_temp.expect_code(format('select public.create_record(%L, %L, %L, %L, 100, %L, %L, null)', 'mc-lia-set-0001', pg_temp.id('lia_ctx'),
                                     pg_temp.acc('lia_ctx'), 'despesa', '2026-09-05'::date, 'Outro'), 'chave_reutilizada', 'PT409');
  -- A chave de um registro não serve para marcar.
  perform pg_temp.expect_code(pg_temp.sm('mc-lia-rec-0001', 'lia_ctx', '2026-07-01', 'pagamentos', 0), 'chave_reutilizada', 'PT409');
  -- Marcar o que já está marcado: versão desatualizada (a marca viva é a 1), com ou sem a versão certa; marcar com versão que não é 0 também.
  perform pg_temp.expect_stale(pg_temp.sm('mc-ver-0001', 'lia_ctx', '2026-08-01', 'pagamentos', 0), 'versao_atual=1');
  perform pg_temp.expect_stale(pg_temp.sm('mc-ver-0002', 'lia_ctx', '2026-08-01', 'pagamentos', 1), 'versao_atual=1');
  perform pg_temp.expect_stale(pg_temp.sm('mc-ver-0003', 'lia_ctx', '2026-08-01', 'pagamentos', null), 'versao_atual=1');
  perform pg_temp.expect_stale(pg_temp.sm('mc-ver-0004', 'lia_ctx', '2026-07-01', 'pagamentos', 1), 'versao_atual=0');
  perform pg_temp.expect_stale(pg_temp.sm('mc-ver-0005', 'lia_ctx', '2026-07-01', 'pagamentos', null), 'versao_atual=0');
  perform pg_temp.expect_stale(pg_temp.sm('mc-ver-0006', 'lia_ctx', '2026-07-01', 'pagamentos', -1), 'versao_atual=0');
  -- Desmarcar: versão errada, nula, e mês sem marca (versao_atual=0).
  perform pg_temp.expect_stale(pg_temp.cm('mc-ver-0007', 'lia_ctx', '2026-08-01', 'pagamentos', 0), 'versao_atual=1');
  perform pg_temp.expect_stale(pg_temp.cm('mc-ver-0008', 'lia_ctx', '2026-08-01', 'pagamentos', 2), 'versao_atual=1');
  perform pg_temp.expect_stale(pg_temp.cm('mc-ver-0009', 'lia_ctx', '2026-08-01', 'pagamentos', null), 'versao_atual=1');
  perform pg_temp.expect_stale(pg_temp.cm('mc-ver-0010', 'lia_ctx', '2026-07-01', 'pagamentos', 1), 'versao_atual=0');
  perform pg_temp.expect_stale(pg_temp.cm('mc-ver-0011', 'lia_ctx', '2026-07-01', 'pagamentos', 0), 'versao_atual=0');
  assert pg_temp.ov('lia_ctx', '2026-08-01') = 'recebido 0/0/t pago 0/0/t', 'as recusas não desmarcaram nada';
  -- Desmarcar com a versão certa: a marca some, o outro tipo fica.
  r1 := public.clear_month_check(pg_temp.id('lia_ctx'), '2026-08-01', 'pagamentos', 'mc-lia-clr-0001', 1);
  assert (r1 ->> 'checked', r1 ->> 'version', r1 ->> 'kind', r1 ->> 'month') = ('false', '0', 'pagamentos', '2026-08-01'), 'o resultado de desmarcar: ' || r1::text;
  assert r1 -> 'checked_at' = 'null'::jsonb, 'sem hora quando não há marca';
  assert pg_temp.ov('lia_ctx', '2026-08-01') = 'recebido 0/0/t pago 0/0/f', 'só o tipo desmarcado deixa de valer';
  -- Repetir a mesma chamada de desmarcar devolve o mesmo resultado, sem outra operação.
  n := pg_temp.allops();
  r2 := public.clear_month_check(pg_temp.id('lia_ctx'), '2026-08-01', 'pagamentos', 'mc-lia-clr-0001', 1);
  assert r2 = r1 and pg_temp.allops() = n, 'a repetição de desmarcar devolve o mesmo resultado';
  perform pg_temp.expect_code(pg_temp.cm('mc-lia-clr-0001', 'lia_ctx', '2026-08-01', 'pagamentos', 2), 'chave_reutilizada', 'PT409');
  perform pg_temp.expect_code(pg_temp.sm('mc-lia-clr-0001', 'lia_ctx', '2026-08-01', 'pagamentos', 0), 'chave_reutilizada', 'PT409');
  -- Quem repete a marcação antiga depois de desmarcar vê o estado de agora (sem marca), sem refazer a marca.
  r1 := public.set_month_check(pg_temp.id('lia_ctx'), '2026-08-01', 'pagamentos', 'mc-lia-set-0001', 0);
  assert r1 ->> 'checked' = 'false' and r1 ->> 'version' = '0', 'a repetição mostra o estado atual: ' || r1::text;
  assert pg_temp.ov('lia_ctx', '2026-08-01') = 'recebido 0/0/t pago 0/0/f', 'a repetição não refaz a marca';
  -- Marcar de novo com chave nova e versão 0: vale (a versão da marca viva volta a ser 1) e a autoria é de quem marcou agora.
  r1 := public.set_month_check(pg_temp.id('lia_ctx'), '2026-08-01', 'pagamentos', 'mc-lia-set-0003', 0);
  assert (r1 ->> 'checked', r1 ->> 'version') = ('true', '1'), 'marcou de novo';
  assert pg_temp.ov('lia_ctx', '2026-08-01') = 'recebido 0/0/t pago 0/0/t', 'as duas valem de novo';
end $$;
reset role;
do $$ begin
  assert pg_temp.nops('lia', 'desmarcar_mes_conferido') = 3 and pg_temp.nops('lia', 'marcar_mes_conferido') = 5,
    'operações: ' || pg_temp.nops('lia', 'marcar_mes_conferido') || ' de marcar e ' || pg_temp.nops('lia', 'desmarcar_mes_conferido') || ' de desmarcar';
  assert (select count(*) from public.record_operations where idempotency_key = 'mc-lia-set-0001') = 1, 'uma operação por chave';
end $$;

-- ---------------------------------------------------------------------------
-- 5. A marca deixa de valer com um registro do tipo no mês, sem ser apagada, e volta a valer quando o registro sai.
-- ---------------------------------------------------------------------------
set role authenticated;
do $$
declare
  rec uuid;
  rec2 uuid;
begin
  perform pg_temp.as_('lia');
  -- Marcar um mês que já tem registro do tipo é recusado (mes_com_registros); o outro tipo, sem registro, vale. Setembro tem os dois.
  perform pg_temp.expect_code(pg_temp.sm('mc-reg-0001', 'lia_ctx', '2026-09-01', 'pagamentos', 0), 'mes_com_registros', 'PT409');
  perform pg_temp.expect_code(pg_temp.sm('mc-reg-0002', 'lia_ctx', '2026-09-01', 'recebimentos', 0), 'mes_com_registros', 'PT409');
  -- A ordem: a versão vem antes de mes_com_registros.
  perform pg_temp.expect_stale(pg_temp.sm('mc-reg-0003', 'lia_ctx', '2026-09-01', 'pagamentos', 1), 'versao_atual=0');
  -- Registro do outro tipo não impede: em julho entra uma receita; o tipo "pagamentos" segue livre, o "recebimentos" não.
  perform pg_temp.rec('mc-reg-rec-0001', 'lia_ctx', 'receita', 50000, '2026-07-31', 'Venda de julho');
  perform pg_temp.expect_code(pg_temp.sm('mc-reg-0004', 'lia_ctx', '2026-07-01', 'recebimentos', 0), 'mes_com_registros', 'PT409');
  perform public.set_month_check(pg_temp.id('lia_ctx'), '2026-07-01', 'pagamentos', 'mc-reg-0005', 0);
  assert pg_temp.ov('lia_ctx', '2026-07-01') = 'recebido 1/50000/f pago 0/0/t', 'julho: recebimento anotado e gastos conferidos';
  -- O dia 1 do mês seguinte e o último dia do anterior não contam para o mês.
  perform pg_temp.rec('mc-reg-rec-0002', 'lia_ctx', 'despesa', 1000, '2026-09-30', 'Fim de setembro');
  perform pg_temp.rec('mc-reg-rec-0003', 'lia_ctx', 'despesa', 1000, '2026-07-01', 'Começo de julho');
  perform pg_temp.expect_code(pg_temp.sm('mc-reg-0006', 'lia_ctx', '2026-07-01', 'pagamentos', 1), 'versao_desatualizada', 'PT409', 'versao_atual=1');
  -- Em agosto marcaram "pagamentos": um gasto de 31/08 faz a marca deixar de valer (a marca continua na tabela, versão 1).
  rec := pg_temp.rec('mc-reg-rec-0004', 'lia_ctx', 'despesa', 7000, '2026-08-31', 'Farmácia de agosto');
  assert pg_temp.ov('lia_ctx', '2026-08-01') = 'recebido 0/0/t pago 1/7000/f', 'com um gasto, a marca de pagamentos deixa de valer; a de recebimentos segue';
  perform pg_temp.expect_code(pg_temp.sm('mc-reg-0007', 'lia_ctx', '2026-08-01', 'pagamentos', 0), 'versao_desatualizada', 'PT409', 'versao_atual=1');
  -- Um segundo gasto, e a exclusão de um: a marca só volta a valer sem nenhum gasto vivo no mês.
  rec2 := pg_temp.rec('mc-reg-rec-0005', 'lia_ctx', 'despesa', 3000, '2026-08-01', 'Padaria de agosto');
  perform public.delete_record('mc-reg-del-0001', rec, 1);
  assert pg_temp.ov('lia_ctx', '2026-08-01') = 'recebido 0/0/t pago 1/3000/f', 'um gasto vivo ainda anula a marca';
  perform public.delete_record('mc-reg-del-0002', rec2, 1);
  assert pg_temp.ov('lia_ctx', '2026-08-01') = 'recebido 0/0/t pago 0/0/t', 'sem gasto vivo, a marca volta a valer (excluído não conta)';
  -- A marca nunca foi apagada nem mudou: mesma linha, versão 1, mesma autoria.
  assert (select count(*) from public.month_checks where context_id = pg_temp.id('lia_ctx') and month = '2026-08-01' and kind = 'pagamentos' and version = 1) = 1,
    'a marca de agosto é a mesma';
end $$;
reset role;
do $$ begin
  assert pg_temp.marks('lia_ctx') = '2026-07 pagamentos por Lia v1; 2026-08 pagamentos por Lia v1; 2026-08 recebimentos por Lia v1', 'marcas: ' || pg_temp.marks('lia_ctx');
  -- Os registros do mês de outra pessoa, ou de outro contexto, não valem para esta marca.
  assert (select count(*) from public.month_checks where context_id = pg_temp.id('davi_ctx')) = 0, 'o Pessoal do Davi não tem marca';
end $$;

-- O tipo "recebimentos" faz o mesmo: um recebimento no mês anula a marca de recebimentos (sem apagá-la), e excluí-lo a faz valer de novo.
set role authenticated;
do $$
declare
  rec uuid;
begin
  perform pg_temp.as_('lia');
  perform public.set_month_check(pg_temp.id('lia_ctx'), '2026-06-01', 'recebimentos', 'mc-rcb-0001', 0);
  assert pg_temp.ov('lia_ctx', '2026-06-01') = 'recebido 0/0/t pago 0/0/f', 'junho: recebimentos conferidos';
  rec := pg_temp.rec('mc-rcb-rec-0001', 'lia_ctx', 'receita', 80000, '2026-06-15', 'Venda de junho');
  assert pg_temp.ov('lia_ctx', '2026-06-01') = 'recebido 1/80000/f pago 0/0/f', 'com um recebimento, a marca de recebimentos deixa de valer';
  perform pg_temp.expect_code(pg_temp.sm('mc-rcb-0002', 'lia_ctx', '2026-06-01', 'recebimentos', 0), 'versao_desatualizada', 'PT409', 'versao_atual=1');
  perform public.delete_record('mc-rcb-del-0001', rec, 1);
  assert pg_temp.ov('lia_ctx', '2026-06-01') = 'recebido 0/0/t pago 0/0/f', 'sem o recebimento, a marca volta a valer';
  -- Um gasto não anula a marca de recebimentos, e a marca de pagamentos de junho não existe.
  perform pg_temp.rec('mc-rcb-rec-0002', 'lia_ctx', 'despesa', 2500, '2026-06-20', 'Gasto de junho');
  assert pg_temp.ov('lia_ctx', '2026-06-01') = 'recebido 0/0/t pago 1/2500/f', 'o gasto de junho não anula a marca de recebimentos';
  perform public.clear_month_check(pg_temp.id('lia_ctx'), '2026-06-01', 'recebimentos', 'mc-rcb-clr-0001', 1);
end $$;
reset role;
do $$ begin
  assert pg_temp.marks('lia_ctx') = '2026-07 pagamentos por Lia v1; 2026-08 pagamentos por Lia v1; 2026-08 recebimentos por Lia v1', 'depois de junho: marks ' || pg_temp.marks('lia_ctx');
end $$;

-- Marca com registro já existente na linha do tempo: o gatilho de atividade e os totais seguem como estão; a desmarcação vale com registro.
set role authenticated;
do $$
begin
  perform pg_temp.as_('lia');
  perform pg_temp.rec('mc-reg-rec-0006', 'lia_ctx', 'despesa', 500, '2026-08-20', 'Café de agosto');
  assert pg_temp.ov('lia_ctx', '2026-08-01') = 'recebido 0/0/t pago 1/500/f', 'agosto com um gasto: marca de pagamentos sem valer';
  -- Desmarcar vale mesmo com registro no mês (a marca que deixou de valer também pode sair).
  perform public.clear_month_check(pg_temp.id('lia_ctx'), '2026-08-01', 'pagamentos', 'mc-reg-clr-0001', 1);
  assert pg_temp.marks('lia_ctx') = '2026-07 pagamentos por Lia v1; 2026-08 recebimentos por Lia v1', 'a marca de pagamentos saiu';
  assert pg_temp.ov('lia_ctx', '2026-08-01') = 'recebido 0/0/t pago 1/500/f', 'segue com o gasto';
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 6. Família: titular, membro e leitor; quem escreve marca e desmarca (inclusive a marca de outra pessoa); quem só lê vê; fora, nada.
-- ---------------------------------------------------------------------------
set role authenticated;
do $$
declare
  fam uuid := pg_temp.id('fam');
begin
  -- Mara (membro) marca; Lia (titular) lê e desmarca a marca da Mara; Davi (leitor) lê, não marca nem desmarca.
  perform pg_temp.as_('mara');
  perform public.set_month_check(fam, '2026-08-01', 'pagamentos', 'mc-fam-0001', 0);
  assert pg_temp.ov('fam', '2026-08-01') = 'recebido 0/0/f pago 0/0/t', 'Mara lê a marca que fez';
  perform pg_temp.as_('davi');
  assert pg_temp.ov('fam', '2026-08-01') = 'recebido 0/0/f pago 0/0/t', 'Davi (leitor) vê a marca';
  assert (select count(*) from public.month_checks where context_id = fam) = 1, 'Davi lê a linha pela tabela';
  perform pg_temp.expect_code(pg_temp.sm('mc-fam-0002', 'fam', '2026-08-01', 'recebimentos', 0), 'sem_permissao', '42501');
  perform pg_temp.expect_code(pg_temp.sm('mc-fam-0003', 'fam', '2026-07-01', 'pagamentos', 0), 'sem_permissao', '42501');
  perform pg_temp.expect_code(pg_temp.cm('mc-fam-0004', 'fam', '2026-08-01', 'pagamentos', 1), 'sem_permissao', '42501');
  assert pg_temp.ov('fam', '2026-08-01') = 'recebido 0/0/f pago 0/0/t', 'o leitor não mudou nada';
  perform pg_temp.as_('lia');
  assert pg_temp.ov('fam', '2026-08-01') = 'recebido 0/0/f pago 0/0/t', 'a titular vê a marca da Mara';
  perform public.set_month_check(fam, '2026-08-01', 'recebimentos', 'mc-fam-0005', 0);
  assert pg_temp.ov('fam', '2026-08-01') = 'recebido 0/0/t pago 0/0/t', 'a titular marcou o outro tipo';
  -- Nuno (membro) desmarca a marca da Lia; a autoria de cada uma é de quem marcou.
  perform pg_temp.as_('nuno');
  perform public.clear_month_check(fam, '2026-08-01', 'recebimentos', 'mc-fam-0006', 1);
  assert pg_temp.ov('fam', '2026-08-01') = 'recebido 0/0/f pago 0/0/t', 'Nuno desmarcou a marca da Lia';
  perform public.set_month_check(fam, '2026-08-01', 'recebimentos', 'mc-fam-0007', 0);
  perform public.set_month_check(fam, '2026-07-01', 'recebimentos', 'mc-fam-0008', 0);
end $$;
reset role;
do $$ begin
  assert pg_temp.marks('fam') = '2026-07 recebimentos por Nuno v1; 2026-08 pagamentos por Mara v1; 2026-08 recebimentos por Nuno v1', 'autoria na Família: ' || pg_temp.marks('fam');
  -- A Família e o Pessoal são independentes: a marca de um não vale no outro.
  assert pg_temp.marks('lia_ctx') = '2026-07 pagamentos por Lia v1; 2026-08 recebimentos por Lia v1', 'o Pessoal da Lia não mudou';
end $$;

-- Fora da Família: Otávio (externo), Paula (RH; a empresa nunca lê finanças), Quim (outra conta) e sem sessão. Nada de leitura, nada de escrita.
set role authenticated;
do $$
declare
  fam uuid := pg_temp.id('fam');
  who text;
  n bigint := pg_temp.allops();
begin
  foreach who in array array['otavio', 'paula', 'quim'] loop
    perform pg_temp.as_(who);
    assert (select count(*) from public.month_checks) = 0, who || ' não lê marca de ninguém';
    perform pg_temp.expect_code(pg_temp.sm('mc-out-' || who || '-1', 'fam', '2026-06-01', 'pagamentos', 0), 'sem_permissao', '42501');
    perform pg_temp.expect_code(pg_temp.sm('mc-out-' || who || '-2', 'lia_ctx', '2026-06-01', 'pagamentos', 0), 'sem_permissao', '42501');
    perform pg_temp.expect_code(pg_temp.cm('mc-out-' || who || '-3', 'fam', '2026-08-01', 'pagamentos', 1), 'sem_permissao', '42501');
    perform pg_temp.expect_code(pg_temp.cm('mc-out-' || who || '-4', 'lia_ctx', '2026-08-01', 'recebimentos', 1), 'sem_permissao', '42501');
    perform pg_temp.expect_code(format($f$select * from public.months_overview(%L, '2026-08-01', '2026-08-01')$f$, fam), 'sem_permissao', '42501');
    perform pg_temp.expect_code(format($f$select * from public.months_overview(%L, '2026-08-01', '2026-08-01')$f$, pg_temp.id('lia_ctx')), 'sem_permissao', '42501');
  end loop;
  -- Contexto que não existe: o mesmo erro (não revela se existe).
  perform pg_temp.as_('lia');
  perform pg_temp.expect_code(format('select public.set_month_check(%L, %L, %L, %L, 0)', gen_random_uuid(), '2026-06-01'::date, 'pagamentos', 'mc-out-9001'), 'sem_permissao', '42501');
  perform pg_temp.expect_code(format('select public.clear_month_check(%L, %L, %L, %L, 1)', gen_random_uuid(), '2026-06-01'::date, 'pagamentos', 'mc-out-9002'), 'sem_permissao', '42501');
  perform pg_temp.expect_code(format('select public.set_month_check(null, %L, %L, %L, 0)', '2026-06-01'::date, 'pagamentos', 'mc-out-9003'), 'sem_permissao', '42501');
  assert pg_temp.allops() = n, 'as recusas não gravaram operação';
  -- Davi lê o Pessoal da Lia? Não: cada Pessoal é só da pessoa.
  perform pg_temp.as_('davi');
  perform pg_temp.expect_code(pg_temp.sm('mc-out-9004', 'lia_ctx', '2026-06-01', 'pagamentos', 0), 'sem_permissao', '42501');
  assert (select count(*) from public.month_checks where context_id = pg_temp.id('lia_ctx')) = 0, 'o leitor da Família não lê o Pessoal da Lia';
end $$;
reset role;

-- Vínculo revogado: Nuno é removido da Família pela titular; perde a leitura e a escrita na hora, e o que marcou fica.
set role authenticated;
do $$
declare
  fam uuid := pg_temp.id('fam');
begin
  perform pg_temp.as_('lia');
  perform public.remove_family_member(fam, pg_temp.id('nuno'), 'mc-rem-0001');
  perform pg_temp.as_('nuno');
  assert (select count(*) from public.month_checks where context_id = fam) = 0, 'o ex-membro não lê as marcas';
  perform pg_temp.expect_code(format($f$select * from public.months_overview(%L, '2026-08-01', '2026-08-01')$f$, fam), 'sem_permissao', '42501');
  perform pg_temp.expect_code(pg_temp.sm('mc-rem-0002', 'fam', '2026-06-01', 'pagamentos', 0), 'sem_permissao', '42501');
  perform pg_temp.expect_code(pg_temp.cm('mc-rem-0003', 'fam', '2026-08-01', 'recebimentos', 1), 'sem_permissao', '42501');
  -- Repetir a chave de uma marca feita antes de sair: o contexto já não é lido por ele (nao_encontrado).
  perform pg_temp.expect_code(pg_temp.sm('mc-fam-0007', 'fam', '2026-08-01', 'recebimentos', 0), 'nao_encontrado', 'P0002');
  perform pg_temp.as_('lia');
  assert pg_temp.ov('fam', '2026-08-01') = 'recebido 0/0/t pago 0/0/t', 'a marca do Nuno segue valendo para a Família';
end $$;
reset role;
do $$ begin
  assert pg_temp.marks('fam') = '2026-07 recebimentos por Nuno v1; 2026-08 pagamentos por Mara v1; 2026-08 recebimentos por Nuno v1', 'o que o Nuno marcou ficou';
end $$;

-- ---------------------------------------------------------------------------
-- 7. Gravação direta recusada: ninguém escreve em month_checks; a marca nunca muda; as restrições da tabela.
-- ---------------------------------------------------------------------------
set role authenticated;
do $$
declare
  fam uuid := pg_temp.id('fam');
begin
  perform pg_temp.as_('lia');
  perform pg_temp.expect_error(format($f$insert into public.month_checks (context_id, month, kind, checked_by) values (%L, '2026-05-01', 'pagamentos', %L)$f$,
    pg_temp.id('lia_ctx'), pg_temp.id('lia')), 'permission denied%');
  perform pg_temp.expect_error($f$update public.month_checks set kind = 'recebimentos'$f$, 'permission denied%');
  perform pg_temp.expect_error($f$update public.month_checks set version = 5$f$, 'permission denied%');
  perform pg_temp.expect_error($f$delete from public.month_checks$f$, 'permission denied%');
  perform pg_temp.expect_error($f$truncate public.month_checks$f$, 'permission denied%');
  assert (select count(*) from public.month_checks) >= 1, 'a titular segue lendo';
end $$;
reset role;
do $$
declare
  c uuid := pg_temp.id('lia_ctx');
  p uuid := pg_temp.id('lia');
begin
  -- A guarda: a marca não muda nem pelo dono da tabela (só nasce e some).
  perform pg_temp.expect_code($f$update public.month_checks set version = version + 1$f$, 'campo_imutavel', '42501');
  perform pg_temp.expect_code($f$update public.month_checks set checked_by = checked_by$f$, 'campo_imutavel', '42501');
  perform pg_temp.expect_code($f$update public.month_checks set checked_at = now()$f$, 'campo_imutavel', '42501');
  -- Restrições: um por contexto, mês e tipo; dia 1; tipo; contexto e autoria existentes; versão positiva.
  perform pg_temp.expect_error(format($f$insert into public.month_checks (context_id, month, kind, checked_by) values (%L, '2026-08-01', 'recebimentos', %L)$f$, c, p), '%month_checks_unica%');
  perform pg_temp.expect_error(format($f$insert into public.month_checks (context_id, month, kind, checked_by) values (%L, '2026-05-15', 'pagamentos', %L)$f$, c, p), '%month_checks_mes%');
  perform pg_temp.expect_error(format($f$insert into public.month_checks (context_id, month, kind, checked_by) values (%L, '2026-05-01', 'gastos', %L)$f$, c, p), '%month_checks_tipo%');
  perform pg_temp.expect_error(format($f$insert into public.month_checks (context_id, month, kind, checked_by) values (%L, null, 'pagamentos', %L)$f$, c, p), '%null value%');
  perform pg_temp.expect_error(format($f$insert into public.month_checks (context_id, month, kind, checked_by) values (gen_random_uuid(), '2026-05-01', 'pagamentos', %L)$f$, p), '%month_checks_context_id_fkey%');
  perform pg_temp.expect_error(format($f$insert into public.month_checks (context_id, month, kind, checked_by) values (%L, '2026-05-01', 'pagamentos', gen_random_uuid())$f$, c), '%month_checks_checked_by_fkey%');
  perform pg_temp.expect_error(format($f$insert into public.month_checks (context_id, month, kind, checked_by, version) values (%L, '2026-05-01', 'pagamentos', %L, 0)$f$, c, p), '%month_checks_version_check%');
  perform pg_temp.expect_error(format($f$insert into public.month_checks (context_id, month, kind, checked_by) values (%L, '2026-05-01', 'pagamentos', %L), (%L, '2026-05-01', 'pagamentos', %L)$f$, c, p, c, p), '%month_checks_unica%');
  -- record_operations: as ações novas existem e são sem alvo; com alvo, a restrição de alvo recusa.
  perform pg_temp.expect_error(format($f$insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, target_id)
    values (%L, 'mc-ops-0001', 'marcar_mes_conferido', %L, 'x', gen_random_uuid())$f$, p, c), '%record_operations_target_check%');
  perform pg_temp.expect_error(format($f$insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id)
    values (%L, 'mc-ops-0002', 'desmarcar_mes_conferido', %L, 'x', gen_random_uuid())$f$, p, c), '%record_operations_target_check%');
  perform pg_temp.expect_error(format($f$insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, commitment_id)
    values (%L, 'mc-ops-0003', 'marcar_mes_conferido', %L, 'x', gen_random_uuid())$f$, p, c), '%record_operations_target_check%');
  perform pg_temp.expect_error(format($f$insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash)
    values (%L, 'mc-ops-0004', 'conferir_mes', %L, 'x')$f$, p, c), '%record_operations_action_check%');
  assert (select count(*) from public.record_operations where idempotency_key like 'mc-ops-%') = 0, 'nenhuma operação de teste ficou';
end $$;

-- ---------------------------------------------------------------------------
-- 8. Atividade (D-030): marcar e desmarcar NÃO são anotação, mesmo depois de uma ausência longa; anotar de verdade segue contando.
-- ---------------------------------------------------------------------------
reset role;
select pg_temp.keep('act1', pg_temp.act('lia', 'lia_ctx'));
select pg_temp.keep('rv0', (select count(*) from public.return_reviews)::text);
set role authenticated;
do $$ begin
  perform pg_temp.as_('lia');
  -- Setenta e três dias depois, um mês inteiro fechado sem anotação: a ausência seria longa se marcar contasse.
  perform pg_temp.today('2026-12-20');
  perform public.set_month_check(pg_temp.id('lia_ctx'), '2026-11-01', 'pagamentos', 'mc-act-0001', 0);
  perform public.clear_month_check(pg_temp.id('lia_ctx'), '2026-11-01', 'pagamentos', 'mc-act-0002', 1);
  perform public.set_month_check(pg_temp.id('lia_ctx'), '2026-11-01', 'recebimentos', 'mc-act-0003', 0);
end $$;
reset role;
do $$ begin
  assert pg_temp.act('lia', 'lia_ctx') = pg_temp.was('act1'), 'a atividade não mudou: nem o dia da última anotação nem uma ausência foram gravados (' || pg_temp.act('lia', 'lia_ctx') || ')';
  assert (select count(*) from public.return_reviews) = pg_temp.was('rv0')::bigint, 'nenhuma decisão da revisão foi gravada';
end $$;
set role authenticated;
do $$ begin
  perform pg_temp.as_('lia');
  -- Anotar de verdade conta: a ausência longa aparece, como antes.
  perform pg_temp.rec('mc-act-rec-0001', 'lia_ctx', 'despesa', 1000, '2026-12-20', 'Anotação de dezembro');
end $$;
reset role;
do $$ begin
  assert pg_temp.act('lia', 'lia_ctx') <> pg_temp.was('act1') and pg_temp.act('lia', 'lia_ctx') like '2026-12-20 2026-10-%', 'uma anotação de verdade conta como atividade: ' || pg_temp.act('lia', 'lia_ctx');
  perform pg_temp.today('2026-10-07');
end $$;

-- ---------------------------------------------------------------------------
-- 9. Exclusão da conta (D-058): o Pessoal some com as marcas; na Família a marca fica com a autoria "Pessoa que saiu".
-- ---------------------------------------------------------------------------
set role authenticated;
do $$
declare
  fam uuid := pg_temp.id('fam');
  tfam uuid := pg_temp.id('tfam');
begin
  -- Ester marca no Pessoal e na Família da Lia; Tito marca no Pessoal e na própria Família.
  perform pg_temp.as_('ester');
  perform public.set_month_check(pg_temp.id('ester_ctx'), '2026-08-01', 'pagamentos', 'mc-del-0001', 0);
  perform public.set_month_check(pg_temp.id('ester_ctx'), '2026-07-01', 'recebimentos', 'mc-del-0002', 0);
  perform public.set_month_check(fam, '2026-06-01', 'pagamentos', 'mc-del-0003', 0);
  perform public.set_month_check(fam, '2026-06-01', 'recebimentos', 'mc-del-0004', 0);
  perform pg_temp.as_('tito');
  perform public.set_month_check(pg_temp.id('tito_ctx'), '2026-08-01', 'pagamentos', 'mc-del-0005', 0);
  perform public.set_month_check(tfam, '2026-08-01', 'pagamentos', 'mc-del-0006', 0);
  perform public.set_month_check(tfam, '2026-08-01', 'recebimentos', 'mc-del-0007', 0);
end $$;
reset role;
select pg_temp.keep('marks_before', pg_temp.nmarks()::text);
select pg_temp.keep('fam_before', pg_temp.marks('fam'));
do $$
declare
  ester uuid := pg_temp.id('ester');
  tito uuid := pg_temp.id('tito');
  fam uuid := pg_temp.id('fam');
begin
  assert (select count(*) from public.month_checks where checked_by = ester) = 4 and (select count(*) from public.month_checks where checked_by = tito) = 3, 'as marcas de Ester e Tito';
end $$;

-- Ester (membro) exclui a conta: o Pessoal dela some com as marcas; as da Família ficam, de autoria anônima.
set role authenticated;
do $$ begin
  perform pg_temp.as_('ester');
  perform public.delete_my_account('EXCLUIR', 'mc-del-ester-01');
end $$;
reset role;
do $$
declare
  ester uuid := pg_temp.id('ester');
  fam uuid := pg_temp.id('fam');
begin
  assert (select count(*) from public.month_checks where context_id = pg_temp.id('ester_ctx')) = 0
     and not exists (select 1 from public.financial_contexts where id = pg_temp.id('ester_ctx')), 'o Pessoal da Ester e as marcas dele sumiram';
  assert (select count(*) from public.month_checks where checked_by = ester) = 2 and (select count(*) from public.month_checks where checked_by = ester and context_id = fam) = 2,
    'na Família ficaram as duas marcas dela';
  assert (select (deleted_at is not null, display_name) from public.persons where id = ester) = (true, ''::text), 'a autoria é a pessoa anônima, sem nome';
  assert pg_temp.marks('fam') = replace(pg_temp.was('fam_before'), 'por Ester', 'por anônima'), 'a Família guarda as marcas, com a autoria anônima: ' || pg_temp.marks('fam');
  assert (select count(*) from public.record_operations where actor_id = ester) = 0, 'o rastro técnico da Ester saiu junto';
  assert pg_temp.nmarks() = pg_temp.was('marks_before')::bigint - 2, 'só as 2 marcas do Pessoal da Ester saíram';
end $$;
set role authenticated;
do $$
declare
  fam uuid := pg_temp.id('fam');
begin
  -- A Lia (titular) e a Mara (membro) seguem lendo as marcas; o rótulo da autoria é "Pessoa que saiu".
  perform pg_temp.as_('lia');
  assert pg_temp.ov('fam', '2026-06-01') = 'recebido 0/0/t pago 0/0/t', 'a Lia lê o junho conferido pela Ester';
  assert (select first_name from public.family_member_items where context_id = fam and person_id = pg_temp.id('ester')) = 'Pessoa que saiu', 'a autoria é "Pessoa que saiu"';
  perform pg_temp.as_('mara');
  assert pg_temp.ov('fam', '2026-06-01') = 'recebido 0/0/t pago 0/0/t', 'a Mara também';
  -- Quem escreve ainda desmarca a marca de quem saiu.
  perform public.clear_month_check(fam, '2026-06-01', 'pagamentos', 'mc-del-0008', 1);
  assert pg_temp.ov('fam', '2026-06-01') = 'recebido 0/0/t pago 0/0/f', 'desmarcou a marca da pessoa que saiu';
  -- A conta excluída não marca nem desmarca com um token ainda válido: já não é da Família.
  perform pg_temp.as_('ester');
  perform pg_temp.expect_code(pg_temp.sm('mc-del-0009', 'fam', '2026-05-01', 'pagamentos', 0), 'sem_permissao', '42501');
  perform pg_temp.expect_code(pg_temp.cm('mc-del-0010', 'fam', '2026-06-01', 'recebimentos', 1), 'sem_permissao', '42501');
  assert (select count(*) from public.month_checks) = 0, 'a conta excluída não lê marca nenhuma';
end $$;
reset role;

-- Tito (titular sozinho) exclui a conta: o Pessoal e a Família dele somem, com as marcas, e nada anônimo sobra.
set role authenticated;
do $$ begin
  perform pg_temp.as_('tito');
  perform public.delete_my_account('EXCLUIR', 'mc-del-tito-01');
end $$;
reset role;
do $$
declare
  tito uuid := pg_temp.id('tito');
begin
  assert (select count(*) from public.month_checks where context_id in (pg_temp.id('tito_ctx'), pg_temp.id('tfam'))) = 0
     and (select count(*) from public.month_checks where checked_by = tito) = 0, 'as marcas do Pessoal e da Família do Tito sumiram';
  assert not exists (select 1 from public.financial_contexts where id in (pg_temp.id('tito_ctx'), pg_temp.id('tfam')))
     and not exists (select 1 from public.persons where id = tito), 'sem contexto e sem pessoa anônima';
  assert pg_temp.nmarks() = pg_temp.was('marks_before')::bigint - 2 - 1 - 3, 'as 3 marcas do Tito saíram (e antes saíram 2 do Pessoal da Ester e 1 desmarcada pela Mara)';
end $$;

-- Apagar um contexto leva as marcas dele (a cascata é a que a exclusão da conta usa).
do $$
declare
  c uuid;
begin
  insert into public.financial_contexts (kind, name, owner_person_id) values ('familia', 'Casa do apagar', pg_temp.id('quim')) returning id into c;
  insert into public.month_checks (context_id, month, kind, checked_by) values (c, '2026-05-01', 'pagamentos', pg_temp.id('quim'));
  assert (select count(*) from public.month_checks where context_id = c) = 1, 'uma marca no contexto';
  delete from public.financial_contexts where id = c;
  assert (select count(*) from public.month_checks where context_id = c) = 0, 'o contexto levou a marca';
end $$;

-- ---------------------------------------------------------------------------
-- 10. Privilégios, assinaturas e a definição das funções.
-- ---------------------------------------------------------------------------
do $$ begin
  assert to_regprocedure('public.set_month_check(uuid, date, text, text, integer)') is not null
     and to_regprocedure('public.clear_month_check(uuid, date, text, text, integer)') is not null
     and to_regprocedure('public.months_overview(uuid, date, date)') is not null, 'as assinaturas';
  assert (select array_agg(p.proname::text order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and has_function_privilege('authenticated', p.oid, 'execute') and p.proname in ('set_month_check', 'clear_month_check', 'months_overview'))
       = array['clear_month_check', 'months_overview', 'set_month_check'], 'authenticated executa as duas funções novas e a leitura';
  assert not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                      where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')), 'anon não executa nenhuma função';
  assert (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in ('month_checks_guard', 'clarevo_month_check_result', 'clarevo_month_check_validate')
             and not has_function_privilege('authenticated', p.oid, 'execute') and not has_function_privilege('anon', p.oid, 'execute')
             and not has_function_privilege('service_role', p.oid, 'execute')) = 3, 'a guarda e os auxiliares não são executáveis por quem tem sessão';
  assert (select bool_and(prosecdef and proconfig @> array['search_path=public'] and not proretset) from pg_proc
           where oid in ('public.set_month_check(uuid, date, text, text, integer)'::regprocedure, 'public.clear_month_check(uuid, date, text, text, integer)'::regprocedure)),
    'as de escrita são security definer com search_path fixo';
  assert (select prosecdef from pg_proc where oid = 'public.months_overview(uuid, date, date)'::regprocedure) = false
     and (select provolatile from pg_proc where oid = 'public.months_overview(uuid, date, date)'::regprocedure) = 's', 'months_overview segue com a RLS de quem consulta (invoker, stable)';
  assert (select array_agg(format('%s %s', a, t) order by o) from (
            select a.arg as a, a.t::regtype::text as t, a.o from pg_proc p,
                   lateral unnest(p.proargnames, p.proargmodes::text[], p.proallargtypes::oid[]) with ordinality as a(arg, m, t, o)
             where p.oid = 'public.months_overview(uuid, date, date)'::regprocedure and a.m = 't') z)
       = array['month date', 'received_count integer', 'received_cents bigint', 'paid_count integer', 'paid_cents bigint', 'received_checked boolean', 'paid_checked boolean'],
    'as 5 colunas de antes, na mesma ordem e com os mesmos tipos, e as 2 novas no fim';
  assert has_table_privilege('authenticated', 'public.month_checks', 'select')
     and not has_table_privilege('authenticated', 'public.month_checks', 'insert, update, delete, truncate')
     and not has_any_column_privilege('authenticated', 'public.month_checks', 'insert, update'), 'só leitura (filtrada pela RLS), sem escrita direta';
  assert not has_table_privilege('anon', 'public.month_checks', 'select'), 'anon não lê';
  assert (select relrowsecurity from pg_class where oid = 'public.month_checks'::regclass), 'RLS ligada';
  assert (select count(*) from pg_policies where tablename = 'month_checks') = 1
     and (select qual from pg_policies where tablename = 'month_checks' and policyname = 'month_checks_read' and cmd = 'SELECT') like '%context_permission(context_id, ''read''::text)%',
    'uma política de leitura, com a permissão de leitura do contexto';
  assert (select count(*) from pg_constraint where conrelid = 'public.month_checks'::regclass and contype = 'u' and conname = 'month_checks_unica') = 1, 'única por contexto, mês e tipo';
  assert (select array_agg(confdeltype::text order by conname) from pg_constraint where conrelid = 'public.month_checks'::regclass and contype = 'f')
       = array['a', 'c'], 'a autoria (checked_by) não tem cascata; o contexto (context_id) tem';
  assert (select confdeltype from pg_constraint where conrelid = 'public.month_checks'::regclass and conname = 'month_checks_context_id_fkey') = 'c', 'context_id com on delete cascade';
  assert exists (select 1 from pg_trigger where tgname = 'month_checks_guard' and tgrelid = 'public.month_checks'::regclass and not tgisinternal and tgenabled = 'O'), 'guarda ligada';
  assert (select array_agg(m[1] order by m[1] collate "C") from pg_constraint c, regexp_matches(pg_get_constraintdef(c.oid), '''([a-z_]+)''::text', 'g') m
           where c.conname = 'record_operations_action_check' and m[1] like '%_mes_conferido') = array['desmarcar_mes_conferido', 'marcar_mes_conferido'], 'as 2 ações novas';
  -- A atividade não conta as duas ações (a função do gatilho as lista).
  assert (select pg_get_functiondef(oid) from pg_proc where oid = 'public.clarevo_track_activity()'::regprocedure) like '%''marcar_mes_conferido'', ''desmarcar_mes_conferido''%',
    'o gatilho de atividade não conta as duas ações';
  -- Toda escrita termina na operação: as duas funções gravam em record_operations por último (depois da marca).
  assert (select position('insert into public.month_checks' in d) < position('insert into public.record_operations' in d)
            from (select pg_get_functiondef('public.set_month_check(uuid, date, text, text, integer)'::regprocedure) as d) x)
     and (select position('delete from public.month_checks' in d) < position('insert into public.record_operations' in d)
            from (select pg_get_functiondef('public.clear_month_check(uuid, date, text, text, integer)'::regprocedure) as d) x), 'a operação é a última gravação';
end $$;
set role anon;
select pg_temp.expect_error($$select public.set_month_check(gen_random_uuid(), '2026-08-01', 'pagamentos', 'mc-anon-0001', 0)$$, 'permission denied%');
select pg_temp.expect_error($$select public.clear_month_check(gen_random_uuid(), '2026-08-01', 'pagamentos', 'mc-anon-0002', 1)$$, 'permission denied%');
select pg_temp.expect_error($$select * from public.months_overview(gen_random_uuid(), '2026-08-01', '2026-08-01')$$, 'permission denied%');
select pg_temp.expect_error($$select * from public.month_checks$$, 'permission denied%');
reset role;
-- As funções de apoio e a guarda não são chamáveis nem como authenticated.
set role authenticated;
select pg_temp.expect_error($$select public.clarevo_month_check_result(gen_random_uuid(), '2026-08-01', 'pagamentos')$$, 'permission denied%');
select pg_temp.expect_error($$select public.clarevo_month_check_validate(gen_random_uuid(), '2026-08-01', 'pagamentos')$$, 'permission denied%');
reset role;

rollback;
