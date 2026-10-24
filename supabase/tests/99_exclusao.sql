-- Excluir a minha conta (D-058, migração 0015): delete_my_account, o gatilho de auth.users, a pessoa anônima ("Pessoa que saiu"),
-- as guardas da pessoa e a exclusão do Pessoal e da Família com todos os módulos.
-- Pessoas FICTÍCIAS: Eli (membro da Casa da Bia, com o Pessoal completo, uma licença ativa e papel de RH), Bia (titular da Casa da
-- Bia), Lia (leitora, depois titular), Gil (RH da Alfa), Mia (outra beneficiária), Otto (externo, com Pessoal e Família próprios),
-- Pia (membro da Casa do Otto), Rita (titular sozinha de duas Famílias, uma encerrada), Saulo e Teo (ex-membros da Casa da Rita),
-- Vic e Zeca (para o gatilho de auth.users), Xena (sem espaço pessoal) e Uri (para a conta nova com o e-mail livre).
-- Tudo em uma transação desfeita no fim. Valores em centavos.
\set eli   '''00000000-0000-0000-0000-0000000000a9'''
\set bia   '''00000000-0000-0000-0000-0000000000b9'''
\set lia   '''00000000-0000-0000-0000-0000000000c9'''
\set gil   '''00000000-0000-0000-0000-0000000000d9'''
\set mia   '''00000000-0000-0000-0000-0000000000e9'''
\set otto  '''00000000-0000-0000-0000-0000000000f9'''
\set pia   '''00000000-0000-0000-0000-000000000019'''
\set rita  '''00000000-0000-0000-0000-000000000029'''
\set saulo '''00000000-0000-0000-0000-000000000039'''
\set teo   '''00000000-0000-0000-0000-000000000049'''
\set vic   '''00000000-0000-0000-0000-000000000059'''
\set zeca  '''00000000-0000-0000-0000-000000000069'''
\set xena  '''00000000-0000-0000-0000-000000000079'''
\set uri   '''00000000-0000-0000-0000-000000000089'''
\set eli2  '''00000000-0000-0000-0000-0000000000aa'''

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

create temp table ids (name text primary key, id uuid);
grant select, insert on ids to authenticated, anon;
create function pg_temp.id(p_name text) returns uuid language sql as $$ select id from ids where name = p_name $$;
create function pg_temp.as_(p_name text) returns text language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(pg_temp.id(p_name)::text, ''), true)
$$;
-- Os vencimentos adiados são conferidos agora (a transação nunca chega ao commit).
create function pg_temp.check_links() returns void language plpgsql as $$
begin
  set constraints all immediate;
  set constraints all deferred;
end $$;
create function pg_temp.k(p_name text) returns text language sql immutable as $$
  select encode(sha256(convert_to(p_name, 'UTF8')), 'hex')
$$;

insert into ids values ('eli', :eli), ('bia', :bia), ('lia', :lia), ('gil', :gil), ('mia', :mia), ('otto', :otto), ('pia', :pia),
  ('rita', :rita), ('saulo', :saulo), ('teo', :teo), ('vic', :vic), ('zeca', :zeca), ('xena', :xena), ('uri', :uri);
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  (:eli,   'eli@exemplo.test',   now(), '{"display_name":"Eli Prado"}'),
  (:bia,   'bia@exemplo.test',   now(), '{"display_name":"Bia Lopes"}'),
  (:lia,   'lia@exemplo.test',   now(), '{"display_name":"Lia Nunes"}'),
  (:gil,   'gil@alfa.test',      now(), '{"display_name":"Gil Rocha"}'),
  (:mia,   'mia@exemplo.test',   now(), '{"display_name":"Mia Santos"}'),
  (:otto,  'otto@exemplo.test',  now(), '{"display_name":"Otto Reis"}'),
  (:pia,   'pia@exemplo.test',   now(), '{"display_name":"Pia Alves"}'),
  (:rita,  'rita@exemplo.test',  now(), '{"display_name":"Rita Melo"}'),
  (:saulo, 'saulo@exemplo.test', now(), '{"display_name":"Saulo Dias"}'),
  (:teo,   'teo@exemplo.test',   now(), '{"display_name":"Teo Cruz"}'),
  (:vic,   'vic@exemplo.test',   now(), '{"display_name":"Vic Sá"}'),
  (:zeca,  'zeca@exemplo.test',  now(), '{"display_name":"Zeca Pires"}'),
  (:xena,  'xena@exemplo.test',  now(), '{"display_name":"Xena"}'),
  (:uri,   'uri@exemplo.test',   now(), '{"display_name":"Uri Faria"}');

-- ---------------------------------------------------------------------------
-- Dados de todos os módulos num contexto (Pessoal ou Família), como a pessoa que chama. t é um rótulo curto e único.
-- ---------------------------------------------------------------------------
create function pg_temp.fill(p_ctx uuid, t text, p_singletons boolean default true) returns void language plpgsql as $$
declare
  acc uuid := (select id from public.financial_accounts where context_id = p_ctx and is_default and deleted_at is null limit 1);
  acc2 uuid;
  rec uuid;
  rec2 uuid;
  cid uuid;
  cid2 uuid;
  ser uuid;
  ser2 uuid;
  extra uuid;
  goal uuid;
  goal2 uuid;
  mov uuid;
  card uuid;
  card2 uuid;
  ent uuid;
  res jsonb;
  items jsonb;
  inv_ver int;
  inv_total bigint;
  v_month date;
  v_month2 date;
begin
  -- Contas de origem do dinheiro.
  res := public.create_account(t || '-acc-0001', p_ctx, 'Carteira ' || t, 'dinheiro');
  acc2 := (res ->> 'id')::uuid;
  -- Registros: com a chave de uma nota, uma receita, um editado e um excluído (deleted_by).
  rec := (public.create_record(t || '-rec-0001', p_ctx, acc, 'despesa', 3500, '2026-10-02', 'Mercado ' || t, 'Mercado', pg_temp.k(t || 'nota1'))).id;
  perform public.create_record(t || '-rec-0002', p_ctx, acc, 'receita', 600000, '2026-10-01', 'Salário ' || t, 'Salário');
  rec2 := (public.create_record(t || '-rec-0003', p_ctx, acc2, 'despesa', 1200, '2026-10-03', 'Farmácia ' || t, 'Saúde')).id;
  perform public.update_record(t || '-rec-0004', rec2, 1, acc2, 1300, '2026-10-03', 'Farmácia ' || t, 'Saúde');
  rec2 := (public.create_record(t || '-rec-0005', p_ctx, acc, 'despesa', 900, '2026-10-04', 'Café ' || t, null)).id;
  perform public.delete_record(t || '-rec-0006', rec2, 1);
  -- Contas a pagar: uma paga (gasto ligado), uma em aberto e uma excluída.
  cid := (public.create_commitment(t || '-cmp-0001', p_ctx, 15000, '2026-10-15', 'Internet ' || t, 'Moradia') #>> '{commitment,id}')::uuid;
  perform public.pay_commitment(t || '-cmp-0002', cid, 1, null, 15000, '2026-10-07', 'Moradia');
  perform public.create_commitment(t || '-cmp-0003', p_ctx, 50000, '2026-10-20', 'Condomínio ' || t, 'Moradia');
  cid2 := (public.create_commitment(t || '-cmp-0004', p_ctx, 7000, '2026-10-25', 'Taxa ' || t, null) #>> '{commitment,id}')::uuid;
  perform public.delete_commitment(t || '-cmp-0005', cid2, 1);
  -- Gastos fixos (com assinatura e uma vigência trocada), parcelamento e conta do ano; as contas de cada mês.
  ser := (public.create_series(t || '-ser-0001', p_ctx, 'mensal', 'conta', 'Streaming ' || t, null, 4500, 'fixo', 10, '2026-10-01', 1, null, null, null) #>> '{series,id}')::uuid;
  perform public.set_series_subscription(t || '-ser-0002', ser, 1, true);
  perform public.update_series_from(t || '-ser-0003', ser, (select version from public.series_items where id = ser), 1,
    (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'version', version) order by occurrence_number), '[]'::jsonb)
       from public.commitment_items where series_id = ser and status = 'aberto'),
    'conta', 'Streaming ' || t, null, 4900, 'fixo', 10);
  perform public.create_series(t || '-ser-0004', p_ctx, 'parcelada', 'compra_parcelada', 'Sofá ' || t, null, 20000, 'fixo', 15, '2026-11-01', 1, 10, null, null);
  perform public.create_series(t || '-ser-0005', p_ctx, 'anual', 'conta', 'IPVA ' || t, null, 240000, 'variavel', 20, '2027-01-01', 1, null, null, 1);
  perform public.sync_series_occurrences(p_ctx);
  -- Exclusões lógicas que gravam deleted_by: um gasto fixo (com a conta do mês) e uma conta de origem.
  ser2 := (public.create_series(t || '-ser-0006', p_ctx, 'mensal', 'conta', 'Revista ' || t, null, 3000, 'fixo', 12, '2026-10-01', 1, null, null, null) #>> '{series,id}')::uuid;
  perform public.delete_series(t || '-ser-0007', ser2, 1,
    (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'version', version) order by occurrence_number), '[]'::jsonb)
       from public.commitment_items where series_id = ser2 and status = 'aberto'));
  extra := (public.create_account(t || '-acc-0002', p_ctx, 'Antiga ' || t, 'outra') ->> 'id')::uuid;
  perform public.delete_account(t || '-acc-0003', extra, 1);
  -- Metas: movimentos (um excluído) e uma meta excluída.
  res := public.create_goal(t || '-gol-0001', p_ctx, 'objetivo', 'Viagem ' || t, 500000, '2027-10-01', 50000, null, null, null, 10000, '2026-10-07');
  goal := (res #>> '{goal,id}')::uuid;
  perform public.add_goal_movement(t || '-gol-0002', goal, 'aporte', 2500, '2026-10-05', 'Extra', acc2);
  mov := (public.add_goal_movement(t || '-gol-0003', goal, 'rendimento', 100, '2026-10-06', null) #>> '{movement,id}')::uuid;
  perform public.delete_goal_movement(t || '-gol-0004', mov, 1);
  goal2 := (public.create_goal(t || '-gol-0005', p_ctx, 'oportunidade', 'Bicicleta ' || t, 50000, null, null, null, null, null, null, null) #>> '{goal,id}')::uuid;
  perform public.delete_goal(t || '-gol-0006', goal2, 1);
  -- Plano de guardar, renda de referência, orçamento, limite e a revisão dos últimos meses.
  perform public.set_savings_answer(t || '-sav-0001', p_ctx, 0, 'depois');
  -- Renda de referência, orçamento e limite têm uma linha por mês no contexto: só quem preenche primeiro as grava.
  if p_singletons then
    perform public.set_income_reference(t || '-inc-0001', p_ctx, '2026-10-01', 0, 600000, false);
    perform public.set_category_budget(t || '-bud-0001', p_ctx, 'Mercado', '2026-10-01', 0, 100000);
    perform public.set_commitment_limit(t || '-bud-0002', p_ctx, '2026-10-01', 0, 40);
    -- Linhas que a pessoa cria e exclui (deleted_by).
    extra := (public.set_income_reference(t || '-inc-0002', p_ctx, '2026-11-01', 0, 500000, true) ->> 'id')::uuid;
    perform public.delete_income_reference(t || '-inc-0003', extra, 1);
    extra := (public.set_category_budget(t || '-bud-0003', p_ctx, 'Lazer', '2026-10-01', 0, 20000) ->> 'id')::uuid;
    perform public.delete_category_budget(t || '-bud-0004', extra, 1);
    extra := (public.set_commitment_limit(t || '-bud-0005', p_ctx, '2026-11-01', 0, 30) ->> 'id')::uuid;
    perform public.delete_commitment_limit(t || '-bud-0006', extra, 1);
  end if;
  perform public.decide_return_review(t || '-rev-0001', p_ctx, 0, '2026-09-01', 'seguiu');
  -- "Conferi este mês" (D-060): um mês já terminado e sem nenhum registro, conferido nos dois tipos. Cada preenchimento usa o primeiro mês
  -- (de agosto para trás) ainda sem linha no contexto, porque há uma linha por contexto, mês e tipo (e ela não sai ao desmarcar).
  v_month := (select g::date from generate_series(timestamp '2026-08-01', timestamp '2026-01-01', interval '-1 month') g
               where not exists (select 1 from public.month_checks c where c.context_id = p_ctx and c.month = g::date) limit 1);
  perform public.set_month_check(p_ctx, v_month, 'recebimentos', t || '-mes-0001', 0);
  perform public.set_month_check(p_ctx, v_month, 'pagamentos', t || '-mes-0002', 0);
  -- Uma marca desfeita, em outro mês: a linha fica, desligada, na versão 2 (e o rastro, a operação).
  v_month2 := (select g::date from generate_series(timestamp '2026-08-01', timestamp '2026-01-01', interval '-1 month') g
                where not exists (select 1 from public.month_checks c where c.context_id = p_ctx and c.month = g::date) limit 1);
  perform public.set_month_check(p_ctx, v_month2, 'recebimentos', t || '-mes-0004', 0);
  perform public.clear_month_check(p_ctx, v_month2, 'recebimentos', t || '-mes-0005', 1);
  -- Cartões: compra parcelada com nota, encargo, estorno, fatura de outubro paga, um lançamento excluído e um cartão excluído.
  card := (public.create_card(t || '-crt-0001', p_ctx, 'Cartão ' || t, '1234', 5, 12, 500000) #>> '{card,id}')::uuid;
  perform public.add_card_purchase(t || '-crt-0002', card, '2026-09-20', 30000, 3, 'Geladeira ' || t, 'Moradia', pg_temp.k(t || 'nota2'));
  perform public.add_card_charge(t || '-crt-0003', card, '2026-11-01', 'juros', 1230);
  perform public.add_card_refund(t || '-crt-0004', card, '2026-11-01', 4000, 'Devolução ' || t, 'Saúde');
  ent := (public.add_card_purchase(t || '-crt-0005', card, '2026-10-02', 1500, 1, 'Lanche ' || t, null) #>> '{entry,id}')::uuid;
  perform public.delete_card_entry(t || '-crt-0006', ent, 1);
  select commitment_version, total_cents into inv_ver, inv_total from public.invoice_items where card_id = card and month = '2026-10-01';
  perform public.pay_invoice(t || '-crt-0007', card, '2026-10-01', inv_ver, inv_total, '2026-10-07');
  card2 := (public.create_card(t || '-crt-0008', p_ctx, 'Outro ' || t, null, 10, 20, null) #>> '{card,id}')::uuid;
  perform public.delete_card(t || '-crt-0009', card2, 1);
  -- Importação (extrato na conta e fatura no cartão), cada linha com o resumo da chave.
  perform public.import_records(t || '-imp-0001', p_ctx, 'conta', acc2, jsonb_build_array(
    jsonb_build_object('import_key', pg_temp.k(t || 'i1'), 'kind', 'despesa', 'amount_cents', 2100, 'occurred_on', '2026-10-03', 'description', 'Padaria', 'category', null),
    jsonb_build_object('import_key', pg_temp.k(t || 'i2'), 'kind', 'receita', 'amount_cents', 9000, 'occurred_on', '2026-10-04', 'description', 'Reembolso', 'category', null)));
  perform public.import_records(t || '-imp-0002', p_ctx, 'cartao', card, jsonb_build_array(
    jsonb_build_object('import_key', pg_temp.k(t || 'i3'), 'kind', 'compra', 'amount_cents', 8050, 'occurred_on', '2026-10-06', 'description', 'Mercado do bairro', 'category', 'Mercado')));
end $$;


-- ---------------------------------------------------------------------------
-- Instantâneos e contagens (sem a RLS). Servem para provar o que mudou e, principalmente, o que NÃO mudou.
-- ---------------------------------------------------------------------------
-- Linhas de cada tabela com context_id num contexto (mais o próprio contexto), como JSON.
create function pg_temp.ctx_rows(p_ctx uuid) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  r record;
  n bigint;
  out jsonb := '{}';
begin
  for r in select distinct c.table_name from information_schema.columns c
             join pg_class pc on pc.relname = c.table_name and pc.relnamespace = 'public'::regnamespace and pc.relkind = 'r'
            where c.table_schema = 'public' and c.column_name = 'context_id' order by 1 loop
    execute format('select count(*) from public.%I where context_id = $1', r.table_name) into n using p_ctx;
    out := out || jsonb_build_object(r.table_name, n);
  end loop;
  return out || jsonb_build_object('financial_contexts', (select count(*) from public.financial_contexts where id = p_ctx));
end $$;
-- As tabelas com context_id (a lista que a exclusão precisa cobrir; uma tabela nova com context_id obriga a atualizar este teste).
create function pg_temp.ctx_tables() returns text[] language sql security definer set search_path = public, pg_temp as $$
  select array_agg(distinct c.table_name::text order by c.table_name::text) from information_schema.columns c
    join pg_class pc on pc.relname = c.table_name and pc.relnamespace = 'public'::regnamespace and pc.relkind = 'r'
   where c.table_schema = 'public' and c.column_name = 'context_id'
$$;
-- Quantas linhas apontam para a pessoa por chave estrangeira (tabela.coluna), fora do contexto p_except (nulo: em qualquer lugar).
create function pg_temp.refs_to(p_person uuid, p_except uuid default null) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  r record;
  n bigint;
  out jsonb := '{}';
begin
  for r in select c.conrelid::regclass::text as tbl, a.attname::text as col,
                  exists (select 1 from pg_attribute x where x.attrelid = c.conrelid and x.attname = 'context_id' and not x.attisdropped) as has_ctx
             from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
            where c.contype = 'f' and c.confrelid = 'public.persons'::regclass order by 1, 2 loop
    execute format('select count(*) from %s where %I = $1 %s', r.tbl, r.col,
                   case when r.has_ctx and p_except is not null then 'and context_id <> $2' else 'and $2::uuid is not distinct from $2::uuid' end)
      into n using p_person, p_except;
    if n > 0 then out := out || jsonb_build_object(r.tbl || '.' || r.col, n); end if;
  end loop;
  return out;
end $$;
-- Todas as chaves estrangeiras que apontam para persons (tabela.coluna: o que a exclusão da conta precisa tratar).
create function pg_temp.person_fks() returns text[] language sql security definer set search_path = public, pg_temp as $$
  select array_agg(c.conrelid::regclass::text || '.' || a.attname order by c.conrelid::regclass::text, a.attname)
    from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
   where c.contype = 'f' and c.confrelid = 'public.persons'::regclass
$$;
-- Resumo (md5) do conteúdo de um contexto: as tabelas de dados e, com p_all, também vínculos, convites e operações. As linhas por
-- pessoa (person_id, actor_id) de p_skip ficam de fora.
create function pg_temp.snap_ctx(p_ctx uuid, p_skip uuid default null, p_all boolean default false) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  r record;
  acc text := '';
  part text;
begin
  for r in select t.table_name,
                  (select k.column_name from information_schema.columns k
                    where k.table_schema = 'public' and k.table_name = t.table_name and k.column_name in ('person_id', 'actor_id') limit 1) as pcol
             from (select distinct c.table_name from information_schema.columns c
                     join pg_class pc on pc.relname = c.table_name and pc.relnamespace = 'public'::regnamespace and pc.relkind = 'r'
                    where c.table_schema = 'public' and c.column_name = 'context_id') t
            where p_all or t.table_name not in ('context_memberships', 'family_invites', 'record_operations')
            order by t.table_name loop
    execute format('select md5(coalesce(string_agg(t::text, ''|'' order by t::text), '''')) from public.%I t where context_id = $1 and %s',
                   r.table_name, case when r.pcol is not null then format('(%I is distinct from $2)', r.pcol) else '$2::uuid is not distinct from $2::uuid' end)
      into part using p_ctx, p_skip;
    acc := acc || r.table_name || '=' || part || ';';
  end loop;
  return md5(acc);
end $$;
-- Resumo do que é só da pessoa (a linha em persons e em auth.users, direitos, licenças, administração, operações e as quatro tabelas por
-- pessoa). p_except tira o que está ligado a um contexto que vai acabar (uma Família apagada leva as operações de todos os que anotaram nela).
create function pg_temp.snap_person(p uuid, p_except uuid default null) returns text language sql security definer set search_path = public, pg_temp as $$
  select md5(concat_ws('#',
    (select string_agg(t::text, '|' order by t::text) from public.persons t where t.id = p),
    (select string_agg(t::text, '|' order by t::text) from auth.users t where t.id = p),
    (select string_agg(t::text, '|' order by t::text) from public.plan_entitlements t where t.person_id = p),
    (select string_agg(t::text, '|' order by t::text) from public.licenses t where t.person_id = p),
    (select string_agg(t::text, '|' order by t::text) from public.organization_admins t where t.person_id = p),
    (select string_agg(t::text, '|' order by t::text) from public.record_operations t where t.actor_id = p and (p_except is null or t.context_id is distinct from p_except)),
    (select string_agg(t::text, '|' order by t::text) from public.context_activity t where t.person_id = p and (p_except is null or t.context_id is distinct from p_except)),
    (select string_agg(t::text, '|' order by t::text) from public.return_reviews t where t.person_id = p and (p_except is null or t.context_id is distinct from p_except)),
    (select string_agg(t::text, '|' order by t::text) from public.savings_checks t where t.person_id = p and (p_except is null or t.context_id is distinct from p_except)),
    (select string_agg(t::text, '|' order by t::text) from public.signup_sources t where t.person_id = p)))
$$;
-- A empresa: organizações, contratos, quem administra, licenças e direitos, menos o que é da pessoa p e a licença l.
create function pg_temp.snap_company(p uuid, l uuid) returns text language sql security definer set search_path = public, pg_temp as $$
  select md5(concat_ws('#',
    (select string_agg(t::text, '|' order by t::text) from public.organizations t),
    (select string_agg(t::text, '|' order by t::text) from public.benefit_contracts t),
    (select string_agg(t::text, '|' order by t::text) from public.organization_admins t where t.person_id is distinct from p),
    (select string_agg(t::text, '|' order by t::text) from public.licenses t where t.id is distinct from l),
    (select string_agg(t::text, '|' order by t::text) from public.plan_entitlements t where t.person_id is distinct from p)))
$$;
-- O banco inteiro (todas as tabelas de public e auth.users).
create function pg_temp.world() returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare
  r record;
  acc text := '';
  part text;
begin
  for r in select c.oid::regclass::text as tbl from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' order by 1 loop
    execute format('select md5(coalesce(string_agg(t::text, ''|'' order by t::text), '''')) from %s t', r.tbl) into part;
    acc := acc || r.tbl || '=' || part || ';';
  end loop;
  return md5(acc || (select md5(coalesce(string_agg(u::text, '|' order by u::text), '')) from auth.users u));
end $$;
create temp table snaps (name text primary key, v text);
grant select on snaps to authenticated;
create function pg_temp.keep(p_name text, p_value text) returns void language sql as $$
  insert into snaps values (p_name, p_value) on conflict (name) do update set v = excluded.v
$$;
create function pg_temp.was(p_name text) returns text language sql as $$ select v from snaps where name = p_name $$;
-- Cada tabela de dados do Pessoal tem linhas (o teste não vale se o preenchimento deixar alguma vazia).
create function pg_temp.rows_of(p_ctx text, p_table text) returns bigint language sql security definer set search_path = public, pg_temp as $$
  select (pg_temp.ctx_rows(pg_temp.id(p_ctx)) ->> p_table)::bigint
$$;

-- No Supabase o e-mail da conta é único: o teste do e-mail livre precisa disso (o auth simulado não impõe).
create unique index auth_users_email_unico on auth.users (lower(email));

-- ---------------------------------------------------------------------------
-- 0. Primeira entrada de todos (menos Xena, sem espaço) e a empresa Alfa (a equipe cadastra; Gil é o RH; Eli também administra).
-- ---------------------------------------------------------------------------
set role authenticated;
do $$
declare
  n text;
  r jsonb;
begin
  foreach n in array array['eli', 'bia', 'lia', 'gil', 'mia', 'otto', 'pia', 'rita', 'saulo', 'teo', 'vic', 'zeca', 'uri'] loop
    perform pg_temp.as_(n);
    r := public.ensure_personal_space('Conta principal');
    insert into ids values (n || '_ctx', (r ->> 'context_id')::uuid);
  end loop;
end $$;
reset role;
do $$
declare
  r jsonb;
begin
  r := public.clarevo_staff_create_organization('Alfa', 3, 'individual', '2026-01-01', null, 'gil@alfa.test');
  insert into ids values ('alfa_o', (r ->> 'organization_id')::uuid), ('alfa_c', (r ->> 'contract_id')::uuid);
  perform public.clarevo_staff_add_org_admin(pg_temp.id('alfa_o'), 'eli@exemplo.test');
end $$;

-- ---------------------------------------------------------------------------
-- 1. Montagem: o benefício da Alfa (Eli e Mia aceitam; um convite fica pendente), as Famílias e os dados de todos os módulos.
-- ---------------------------------------------------------------------------
create temp table codes (name text primary key, code text, invite uuid);
grant select, insert on codes to authenticated;
create function pg_temp.code(p_name text) returns text language sql as $$ select code from codes where name = p_name $$;
-- Cria um convite da Família como a pessoa e guarda o código.
create function pg_temp.inv(p_name text, p_who text, p_role text, p_ctx text) returns void language plpgsql as $$
declare
  r jsonb;
begin
  perform pg_temp.as_(p_who);
  r := public.create_family_invite(pg_temp.id(p_ctx), p_role, 'ex-inv-' || p_name);
  insert into codes values (p_name, r ->> 'code', (r #>> '{invite,id}')::uuid);
end $$;
-- Quem recebe aceita o convite.
create function pg_temp.join_as(p_name text, p_who text) returns void language plpgsql as $$
begin
  perform pg_temp.as_(p_who);
  perform public.accept_family_invite(pg_temp.code(p_name), 'ex-acc-' || p_name);
end $$;
-- Cria uma Família como a pessoa e guarda o contexto.
create function pg_temp.family(p_who text, p_name text, p_ctx text) returns void language plpgsql as $$
begin
  perform pg_temp.as_(p_who);
  insert into ids values (p_ctx, (public.create_family(p_name, 'ex-fam-' || p_ctx) #>> '{context,id}')::uuid);
end $$;

set role authenticated;
do $$
declare
  r jsonb;
  x jsonb;
begin
  -- Benefício: Gil convida Eli, Mia e um e-mail que nunca aceita; Eli e Mia aceitam.
  perform pg_temp.as_('gil');
  r := public.invite_licenses(pg_temp.id('alfa_c'), array['eli@exemplo.test', 'mia@exemplo.test', 'novo@exemplo.test'], 'ex-lic-0001');
  for x in select e from jsonb_array_elements(r -> 'results') e loop
    insert into codes values (split_part(x ->> 'email', '@', 1), x ->> 'code', null);
    insert into ids values ('lic_' || split_part(x ->> 'email', '@', 1), (x #>> '{license,id}')::uuid);
  end loop;
  perform pg_temp.as_('eli');
  perform public.accept_license(pg_temp.code('eli'), 'ex-lic-eli');
  perform pg_temp.as_('mia');
  perform public.accept_license(pg_temp.code('mia'), 'ex-lic-mia');

  -- Casa da Bia: Eli (membro) e Lia (leitora). Teo e Saulo, Rita e Otto abaixo.
  perform pg_temp.family('bia', 'Casa da Bia', 'fam1');
  perform pg_temp.inv('eli_in', 'bia', 'membro', 'fam1');
  perform pg_temp.inv('lia_in', 'bia', 'leitor', 'fam1');
  perform pg_temp.join_as('eli_in', 'eli');
  perform pg_temp.join_as('lia_in', 'lia');
  -- Um convite da Bia que fica pendente (outro destinatário): a exclusão do Eli não toca nele.
  perform pg_temp.inv('pendente', 'bia', 'leitor', 'fam1');

  -- Casa do Otto: Pia (membro).
  perform pg_temp.family('otto', 'Casa do Otto', 'famo');
  perform pg_temp.inv('pia_in', 'otto', 'membro', 'famo');
  perform pg_temp.join_as('pia_in', 'pia');

  -- Rita: a Casa A é encerrada (os dados ficam guardados, sem leitura); depois cria a Casa B, onde Saulo e Teo anotam e saem.
  perform pg_temp.family('rita', 'Casa da Rita A', 'famra');
  perform pg_temp.fill(pg_temp.id('famra'), 'rita_a');
  perform public.end_family(pg_temp.id('famra'), 'ex-end-rita-a');
  perform pg_temp.family('rita', 'Casa da Rita B', 'famrb');
  perform pg_temp.inv('saulo_in', 'rita', 'membro', 'famrb');
  perform pg_temp.inv('teo_in', 'rita', 'membro', 'famrb');
  perform pg_temp.join_as('saulo_in', 'saulo');
  perform pg_temp.join_as('teo_in', 'teo');

  -- Vic e Zeca (o gatilho de auth.users).
  perform pg_temp.family('vic', 'Casa do Vic', 'famv');
  perform pg_temp.inv('zeca_in', 'vic', 'membro', 'famv');
  perform pg_temp.join_as('zeca_in', 'zeca');
end $$;

-- Todos os módulos, no Pessoal de cada um e nas Famílias (cada pessoa anota o que a Família dela permite).
do $$
begin
  perform pg_temp.as_('eli');   perform pg_temp.fill(pg_temp.id('eli_ctx'), 'eli');
  perform pg_temp.fill(pg_temp.id('fam1'), 'elf');
  perform pg_temp.as_('bia');   perform pg_temp.fill(pg_temp.id('bia_ctx'), 'bia');
  perform pg_temp.fill(pg_temp.id('fam1'), 'bif', false);
  perform pg_temp.as_('lia');   perform pg_temp.fill(pg_temp.id('lia_ctx'), 'lia');
  perform pg_temp.as_('mia');   perform pg_temp.fill(pg_temp.id('mia_ctx'), 'mia');
  perform pg_temp.as_('otto');  perform pg_temp.fill(pg_temp.id('otto_ctx'), 'otto');
  perform pg_temp.fill(pg_temp.id('famo'), 'otf');
  perform pg_temp.as_('pia');   perform pg_temp.fill(pg_temp.id('pia_ctx'), 'pia');
  perform pg_temp.fill(pg_temp.id('famo'), 'pif', false);
  perform pg_temp.as_('rita');  perform pg_temp.fill(pg_temp.id('rita_ctx'), 'rita');
  perform pg_temp.fill(pg_temp.id('famrb'), 'rib');
  perform pg_temp.as_('saulo'); perform pg_temp.fill(pg_temp.id('saulo_ctx'), 'saulo');
  perform pg_temp.fill(pg_temp.id('famrb'), 'sab', false);
  perform public.leave_family(pg_temp.id('famrb'), 'ex-leave-saulo');
  perform pg_temp.as_('teo');   perform pg_temp.fill(pg_temp.id('teo_ctx'), 'teo');
  perform pg_temp.fill(pg_temp.id('famrb'), 'teb', false);
  perform public.leave_family(pg_temp.id('famrb'), 'ex-leave-teo');
  perform pg_temp.as_('vic');   perform pg_temp.fill(pg_temp.id('vic_ctx'), 'vic');
  perform pg_temp.fill(pg_temp.id('famv'), 'vif');
  perform pg_temp.as_('zeca');  perform pg_temp.fill(pg_temp.id('zeca_ctx'), 'zeca');
  perform pg_temp.fill(pg_temp.id('famv'), 'zef', false);
  perform pg_temp.as_('uri');   perform pg_temp.fill(pg_temp.id('uri_ctx'), 'uri');
end $$;
-- "Como você conheceu o Clarevo?" (D-067, 0018): a resposta é só da pessoa, e uma linha de signup_sources por pessoa que respondeu (inclusive
-- quem vai ficar como "Pessoa que saiu"): a exclusão da conta precisa apagá-la, e a das outras pessoas não pode mexer nela.
do $$
declare
  n text;
  o text[] := array['instagram', 'indicacao', 'empresa', 'busca', 'outro', 'prefiro_nao_dizer'];
  i int := 0;
begin
  foreach n in array array['eli', 'bia', 'lia', 'gil', 'mia', 'otto', 'pia', 'rita', 'saulo', 'teo', 'vic', 'zeca', 'uri'] loop
    perform pg_temp.as_(n);
    perform public.set_signup_source(o[1 + i % 6], 'ex-src-' || n, 0);
    i := i + 1;
  end loop;
end $$;
reset role;
select pg_temp.check_links();

-- ---------------------------------------------------------------------------
-- 2. Antes: o preenchimento não deixou nenhuma tabela vazia, e os instantâneos de tudo que não pode mudar.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
  expected text[] := array['card_entries', 'cards', 'category_budgets', 'commitment_limits', 'commitment_series', 'commitments',
    'context_activity', 'context_memberships', 'family_invites', 'financial_accounts', 'financial_records', 'goal_movements', 'goals',
    'income_references', 'month_checks', 'record_operations', 'return_reviews', 'savings_checks', 'series_terms'];
begin
  -- A lista das tabelas com context_id é a que a exclusão cobre: tabela nova com context_id obriga a revisar clarevo_erase_context.
  assert pg_temp.ctx_tables() = expected, 'as tabelas com context_id são as 19 que a exclusão cobre: ' || array_to_string(pg_temp.ctx_tables(), ', ');
  -- O Pessoal do Eli tem linhas em todas as tabelas de dados (menos convites, que só existem na Família).
  foreach t in array expected loop
    assert (t = 'family_invites' and pg_temp.rows_of('eli_ctx', t) = 0) or pg_temp.rows_of('eli_ctx', t) > 0, 'o Pessoal do Eli tem linhas em ' || t;
  end loop;
  assert (select count(*) from public.financial_records where context_id = pg_temp.id('eli_ctx') and receipt_key is not null) = 1
     and (select count(*) from public.financial_records where context_id = pg_temp.id('eli_ctx') and import_key is not null) = 2
     and (select count(*) from public.card_entries where context_id = pg_temp.id('eli_ctx') and import_key is not null) = 1
     and (select count(*) from public.card_entries where context_id = pg_temp.id('eli_ctx') and receipt_key is not null) >= 1
     and (select count(*) from public.commitment_series where context_id = pg_temp.id('eli_ctx') and subscription) = 1
     and (select count(*) from public.commitments where context_id = pg_temp.id('eli_ctx') and card_id is not null) >= 1
     and (select count(*) from public.financial_records where context_id = pg_temp.id('eli_ctx') and card_id is not null) = 1
     and (select count(*) from public.financial_accounts where context_id = pg_temp.id('eli_ctx')) = 3
     and (select count(*) from public.series_terms where context_id = pg_temp.id('eli_ctx') and superseded_by is not null) >= 1,
    'nota, importação, assinatura, fatura paga, contas de origem e vigência trocada existem no Pessoal do Eli';
  -- A Casa da Bia tem autoria do Eli em todos os módulos (criou e excluiu).
  assert (select count(*) from public.financial_records where context_id = pg_temp.id('fam1') and created_by = pg_temp.id('eli')) >= 4
     and (select count(*) from public.financial_records where context_id = pg_temp.id('fam1') and deleted_by = pg_temp.id('eli')) = 1
     and (select count(*) from public.commitments where context_id = pg_temp.id('fam1') and deleted_by = pg_temp.id('eli')) >= 1
     and (select count(*) from public.goals where context_id = pg_temp.id('fam1') and deleted_by = pg_temp.id('eli')) = 1
     and (select count(*) from public.goal_movements where context_id = pg_temp.id('fam1') and deleted_by = pg_temp.id('eli')) = 1
     and (select count(*) from public.cards where context_id = pg_temp.id('fam1') and deleted_by = pg_temp.id('eli')) = 1
     and (select count(*) from public.card_entries where context_id = pg_temp.id('fam1') and deleted_by = pg_temp.id('eli')) >= 1,
    'o Eli é autor, e excluiu coisas, na Casa da Bia';
  assert (select count(*) from public.licenses where person_id = pg_temp.id('eli') and status = 'ativa') = 1
     and (select count(*) from public.plan_entitlements where person_id = pg_temp.id('eli')) = 1
     and (select count(*) from public.organization_admins where person_id = pg_temp.id('eli')) = 1, 'Eli tem licença ativa, direito ao plano e papel de RH';
  assert (select count(*) from public.licenses where contract_id = pg_temp.id('alfa_c') and status = 'convidada') = 1, 'um convite da Alfa segue pendente';

  -- O que não pode mudar com a saída do Eli.
  perform pg_temp.keep('fam1_dados', pg_temp.snap_ctx(pg_temp.id('fam1'), pg_temp.id('eli')));
  perform pg_temp.keep('fam1_linhas', pg_temp.ctx_rows(pg_temp.id('fam1'))::text);
  perform pg_temp.keep('empresa', pg_temp.snap_company(pg_temp.id('eli'), pg_temp.id('lic_eli')));
  foreach t in array array['bia', 'lia', 'mia', 'otto', 'pia', 'rita', 'saulo', 'teo', 'vic', 'zeca', 'uri'] loop
    perform pg_temp.keep(t || '_pessoal', pg_temp.snap_ctx(pg_temp.id(t || '_ctx'), null, true));
    perform pg_temp.keep(t || '_pessoa', pg_temp.snap_person(pg_temp.id(t)));
  end loop;
  -- Teo anotou na Casa B da Rita, que acaba com a conta dela: o que é dele fora da Casa B é o que não pode mudar.
  perform pg_temp.keep('teo_pessoa_sem_b', pg_temp.snap_person(pg_temp.id('teo'), pg_temp.id('famrb')));
  perform pg_temp.keep('famo', pg_temp.snap_ctx(pg_temp.id('famo'), null, true));
  perform pg_temp.keep('famv_dados', pg_temp.snap_ctx(pg_temp.id('famv'), pg_temp.id('zeca')));
  perform pg_temp.keep('mundo', pg_temp.world());
  perform pg_temp.keep('fam1_ops_eli', (select count(*) from public.record_operations where actor_id = pg_temp.id('eli') and context_id = pg_temp.id('fam1'))::text);
  perform pg_temp.keep('fam1_ops', (select count(*) from public.record_operations where context_id = pg_temp.id('fam1'))::text);
  perform pg_temp.keep('fam1_registros_eli', (select count(*) from public.financial_records where context_id = pg_temp.id('fam1') and created_by = pg_temp.id('eli'))::text);
  perform pg_temp.keep('fam1_registros_eli_vivos', (select count(*) from public.financial_records where context_id = pg_temp.id('fam1') and created_by = pg_temp.id('eli') and deleted_at is null)::text);
  perform pg_temp.keep('usuarios', (select count(*) from auth.users)::text);
end $$;

-- ---------------------------------------------------------------------------
-- 3. Recusas: nada muda.
-- ---------------------------------------------------------------------------
set role authenticated;
do $$
declare
  w text := pg_temp.world();
begin
  -- Sem sessão, chave curta, confirmação errada de todos os jeitos, chave já usada em outra operação.
  perform set_config('request.jwt.claim.sub', '', true);
  perform pg_temp.expect_code($f$select public.delete_my_account('EXCLUIR', 'ex-del-eli-0001')$f$, 'nao_autenticado', '42501');
  perform pg_temp.as_('eli');
  perform pg_temp.expect_code($f$select public.delete_my_account('EXCLUIR', 'curta')$f$, 'chave_invalida', '22023');
  perform pg_temp.expect_code($f$select public.delete_my_account('EXCLUIR', null)$f$, 'chave_invalida', '22023');
  perform pg_temp.expect_code($f$select public.delete_my_account('excluir', 'ex-del-eli-0001')$f$, 'confirmacao_invalida', '22023');
  perform pg_temp.expect_code($f$select public.delete_my_account(' EXCLUIR', 'ex-del-eli-0001')$f$, 'confirmacao_invalida', '22023');
  perform pg_temp.expect_code($f$select public.delete_my_account('EXCLUIR ', 'ex-del-eli-0001')$f$, 'confirmacao_invalida', '22023');
  perform pg_temp.expect_code($f$select public.delete_my_account('Excluir', 'ex-del-eli-0001')$f$, 'confirmacao_invalida', '22023');
  perform pg_temp.expect_code($f$select public.delete_my_account('', 'ex-del-eli-0001')$f$, 'confirmacao_invalida', '22023');
  perform pg_temp.expect_code($f$select public.delete_my_account(null, 'ex-del-eli-0001')$f$, 'confirmacao_invalida', '22023');
  perform pg_temp.expect_code($f$select public.delete_my_account('SIM', 'ex-del-eli-0001')$f$, 'confirmacao_invalida', '22023');
  perform pg_temp.expect_code($f$select public.delete_my_account('EXCLUIR!', 'ex-del-eli-0001')$f$, 'confirmacao_invalida', '22023');
  perform pg_temp.expect_code($f$select public.delete_my_account('EXCLUIR', 'eli-rec-0001')$f$, 'chave_reutilizada', 'PT409');
  -- A confirmação vem antes da chave reutilizada, e a chave vem antes de tudo.
  perform pg_temp.expect_code($f$select public.delete_my_account('x', 'eli-rec-0001')$f$, 'confirmacao_invalida', '22023');
  perform pg_temp.expect_code($f$select public.delete_my_account('x', 'curta')$f$, 'chave_invalida', '22023');
  reset role;
  assert pg_temp.world() = w, 'as recusas não mudaram nada em nenhuma tabela';
  set role authenticated;

  -- Bia é titular da Casa da Bia com Eli e Lia ativos: precisa passar a titularidade ou remover as pessoas antes.
  perform pg_temp.as_('bia');
  perform pg_temp.expect_code($f$select public.delete_my_account('EXCLUIR', 'ex-del-bia-0001')$f$, 'transferir_antes', 'PT409');
  reset role;
  assert pg_temp.world() = w, 'titular com outras pessoas ativas: nada mudou (a conta, o Pessoal e a Família inteiros)';
  assert exists (select 1 from auth.users where id = pg_temp.id('bia')) and exists (select 1 from public.persons where id = pg_temp.id('bia') and deleted_at is null),
    'a conta da Bia segue inteira';
  -- O mesmo vale para quem apaga o usuário direto (o painel do Supabase): o gatilho de auth.users aplica as mesmas regras.
  perform pg_temp.expect_code(format('delete from auth.users where id = %L', pg_temp.id('bia')), 'transferir_antes', 'PT409');
  perform pg_temp.expect_code(format('delete from auth.users where id = %L', pg_temp.id('vic')), 'transferir_antes', 'PT409');
  assert pg_temp.world() = w, 'apagar o usuário do titular com outras pessoas ativas também não muda nada';
  -- Anônimo não executa; nem a chave de serviço faz nada sem sessão (auth.uid() nulo).
  set role anon;
  perform pg_temp.expect_error($f$select public.delete_my_account('EXCLUIR', 'ex-del-anon-0001')$f$, 'permission denied%');
  reset role;
  perform set_config('request.jwt.claim.sub', '', true);
  set role service_role;
  perform pg_temp.expect_code($f$select public.delete_my_account('EXCLUIR', 'ex-del-svc-0001')$f$, 'nao_autenticado', '42501');
  reset role;
  assert pg_temp.world() = w, 'anon e service_role sem sessão não mudam nada';
end $$;

-- ---------------------------------------------------------------------------
-- 4. Eli exclui a conta (membro da Casa da Bia, Pessoal completo, licença ativa, papel de RH).
-- ---------------------------------------------------------------------------
set role authenticated;
do $$
declare
  r jsonb;
begin
  perform pg_temp.as_('eli');
  r := public.delete_my_account('EXCLUIR', 'ex-del-eli-0001');
  assert r = '{"deleted": true}'::jsonb, 'a resposta não traz dado nenhum: ' || r::text;
end $$;
reset role;
select pg_temp.check_links();
do $$
declare
  eli uuid := pg_temp.id('eli');
  fam uuid := pg_temp.id('fam1');
  t text;
  l public.licenses%rowtype;
begin
  -- A conta: sai de auth.users (o e-mail fica livre) e o Pessoal inteiro foi apagado de verdade, tabela por tabela.
  assert not exists (select 1 from auth.users where id = eli or lower(email) = 'eli@exemplo.test'), 'a conta e o e-mail saíram de auth.users';
  assert (select count(*) from auth.users) = pg_temp.was('usuarios')::int - 1, 'só uma conta saiu';
  assert (select bool_and(value::bigint = 0) from jsonb_each_text(pg_temp.ctx_rows(pg_temp.id('eli_ctx')))) and jsonb_typeof(pg_temp.ctx_rows(pg_temp.id('eli_ctx'))) = 'object',
    'nada sobrou do Pessoal em nenhuma tabela (nem o contexto): ' || pg_temp.ctx_rows(pg_temp.id('eli_ctx'))::text;
  assert not exists (select 1 from public.financial_contexts where owner_person_id = eli), 'nenhum contexto é dele';
  assert (select count(*) from public.context_activity where person_id = eli) = 0 and (select count(*) from public.return_reviews where person_id = eli) = 0
     and (select count(*) from public.savings_checks where person_id = eli) = 0 and (select count(*) from public.record_operations where actor_id = eli) = 0
     and (select count(*) from public.plan_entitlements where person_id = eli) = 0 and (select count(*) from public.organization_admins where person_id = eli) = 0
     and (select count(*) from public.family_invites where created_by = eli or used_by = eli) = 0,
    'atividade, revisão, resposta do plano de guardar, operações, direitos ao plano, administração e convites saíram junto';

  -- A pessoa anônima: sem nome, marcada como excluída, e só enquanto é autora de algo na Casa da Bia.
  assert (select (deleted_at is not null, display_name, time_zone, locale) from public.persons where id = eli) = (true, ''::text, 'America/Sao_Paulo'::text, 'pt-BR'::text),
    'a linha de persons virou anônima: sem nome, marcada como excluída';
  assert pg_temp.refs_to(eli, fam) = '{}'::jsonb, 'nada fora da Casa da Bia aponta para a pessoa anônima: ' || pg_temp.refs_to(eli, fam)::text;
  assert (select array_agg(k order by k collate "C") from jsonb_object_keys(pg_temp.refs_to(eli)) k) = array[
      'card_entries.created_by', 'card_entries.deleted_by', 'cards.created_by', 'cards.deleted_by', 'category_budgets.created_by',
      'category_budgets.deleted_by', 'commitment_limits.created_by', 'commitment_limits.deleted_by', 'commitment_series.created_by',
      'commitment_series.deleted_by', 'commitments.created_by', 'commitments.deleted_by', 'context_memberships.person_id',
      'financial_accounts.created_by', 'financial_accounts.deleted_by', 'financial_records.created_by', 'financial_records.deleted_by',
      'goal_movements.created_by', 'goal_movements.deleted_by', 'goals.created_by', 'goals.deleted_by', 'income_references.created_by',
      'income_references.deleted_by', 'month_checks.updated_by', 'series_terms.created_by', 'series_terms.superseded_by'],
    'a autoria (criou, excluiu, trocou a vigência) e o vínculo ficaram, em todos os módulos: ' || pg_temp.refs_to(eli)::text;
  -- Conferi este mês (D-060): as linhas do Pessoal do Eli saíram com o contexto; na Casa da Bia ficam as dele (2 ligadas e 1 desligada) e as
  -- da Bia (2 ligadas e 1 desligada), e a autoria das dele é a pessoa anônima ("Pessoa que saiu"); a marca segue valendo para quem lê a
  -- Casa (conferido abaixo, como Bia e Lia).
  assert (select count(*) from public.month_checks where context_id = pg_temp.id('eli_ctx')) = 0, 'as marcas do Pessoal do Eli saíram com o contexto';
  assert (select count(*) from public.month_checks where context_id = fam) = 6
     and (select count(*) from public.month_checks where context_id = fam and updated_by = eli and checked) = 2
     and (select count(*) from public.month_checks where context_id = fam and updated_by = eli and not checked) = 1
     and (select count(*) from public.month_checks where context_id = fam and updated_by = pg_temp.id('bia') and checked) = 2
     and (select count(*) from public.month_checks where context_id = fam and updated_by = pg_temp.id('bia') and not checked) = 1,
    'na Casa da Bia, as linhas do Eli e da Bia continuam, ligadas e desligadas';
  assert not exists (select 1 from public.month_checks where updated_by = eli and context_id <> fam), 'nenhuma marca do Eli fora da Casa da Bia';

  -- A Casa da Bia: o que o Eli anotou continua, igual, e ninguém perdeu nada.
  assert pg_temp.snap_ctx(fam, eli) = pg_temp.was('fam1_dados'), 'o conteúdo da Casa da Bia está idêntico (registros, contas, séries, metas, cartões, orçamento, de todos)';
  assert (select count(*) from public.financial_records where context_id = fam and created_by = eli) = pg_temp.was('fam1_registros_eli')::int, 'os registros do Eli continuam na Casa';
  assert (pg_temp.ctx_rows(fam) - 'record_operations' - 'context_activity' - 'return_reviews' - 'savings_checks')
       = ((pg_temp.was('fam1_linhas')::jsonb) - 'record_operations' - 'context_activity' - 'return_reviews' - 'savings_checks'), 'as contagens da Casa não mudaram';
  assert (pg_temp.ctx_rows(fam) ->> 'record_operations')::int = pg_temp.was('fam1_ops')::int - pg_temp.was('fam1_ops_eli')::int, 'só as operações do Eli saíram da Casa';
  assert (select (role, can_write, revoked_at is not null) from public.context_memberships where context_id = fam and person_id = eli) = ('membro'::public.membership_role, true, true),
    'o vínculo do Eli ficou, revogado (ex-membro)';
  assert (select count(*) from public.context_memberships where context_id = fam and revoked_at is null) = 2, 'Bia e Lia seguem na Casa';
  assert (select count(*) from public.family_invites where context_id = fam and used_at is null and cancelled_at is null) = 1, 'o convite pendente da Bia continua valendo';
  assert not exists (select 1 from public.persons where id = eli and (display_name <> '' or deleted_at is null)), 'a linha anônima não guarda nome';

  -- Empresa: a licença terminou no ato e ficou sem a pessoa; o resto da empresa não mudou; o e-mail é o que a própria empresa informou.
  select * into l from public.licenses where id = pg_temp.id('lic_eli');
  assert (l.status, l.person_id is null, l.ended_at is not null, l.activated_at is not null, l.invited_email, l.code_hash is null, l.cancelled_at is null)
       = ('encerrada'::public.license_status, true, true, true, 'eli@exemplo.test'::text, true, true), 'licença encerrada, sem pessoa, com a data do fim';
  assert l.ended_at >= now() - interval '1 minute' and l.ended_at <= now(), 'a licença terminou agora';
  assert pg_temp.snap_company(eli, pg_temp.id('lic_eli')) = pg_temp.was('empresa'), 'organização, contrato, outras licenças, administração e direitos da empresa estão idênticos';
  assert (select count(*) from public.licenses where status = 'ativa' and person_id = pg_temp.id('mia')) = 1
     and (select count(*) from public.plan_entitlements where person_id = pg_temp.id('mia')) = 1, 'o benefício da Mia segue ativo';
  assert (select count(*) from public.licenses where contract_id = pg_temp.id('alfa_c') and status = 'convidada') = 1, 'o convite pendente da Alfa segue valendo';
  perform pg_temp.expect_code(format($f$update public.licenses set person_id = %L where id = %L$f$, pg_temp.id('mia'), l.id), 'campo_imutavel', '42501');

  -- Nenhuma outra pessoa perdeu dado: Pessoal, vínculos, operações e rastros de cada uma, e as outras Famílias.
  foreach t in array array['bia', 'lia', 'mia', 'otto', 'pia', 'rita', 'saulo', 'teo', 'vic', 'zeca', 'uri'] loop
    assert pg_temp.snap_ctx(pg_temp.id(t || '_ctx'), null, true) = pg_temp.was(t || '_pessoal'), 'o Pessoal de ' || t || ' está idêntico';
    assert pg_temp.snap_person(pg_temp.id(t)) = pg_temp.was(t || '_pessoa'), 'a conta de ' || t || ' está idêntica';
  end loop;
  assert pg_temp.snap_ctx(pg_temp.id('famo'), null, true) = pg_temp.was('famo'), 'a Casa do Otto está idêntica';
  assert pg_temp.snap_ctx(pg_temp.id('famv'), pg_temp.id('zeca')) = pg_temp.was('famv_dados'), 'a Casa do Vic está idêntica';
end $$;

-- A visão dos membros mostra "Pessoa que saiu", sem nome e sem e-mail, para quem lê a Casa.
set role authenticated;
do $$
declare
  n text;
begin
  foreach n in array array['bia', 'lia'] loop
    perform pg_temp.as_(n);
    assert (select (first_name, role, status, is_me, left_at is not null) from public.family_member_items where context_id = pg_temp.id('fam1') and person_id = pg_temp.id('eli'))
         = ('Pessoa que saiu'::text, 'membro'::text, 'ex-membro'::text, false, true), n || ' lê a autoria anônima';
    assert (select count(*) from public.family_member_items where context_id = pg_temp.id('fam1')) = 3, n || ' lê as três pessoas';
    -- A marca do Eli em agosto (recebimentos e pagamentos) segue valendo na Casa, lida por quem fica.
    assert (select (received_checked, paid_checked, received_count, paid_count) from public.months_overview(pg_temp.id('fam1'), '2026-08-01', '2026-08-01'))
         = (true, true, 0, 0), n || ' lê a marca do Eli em agosto';
    assert not exists (select 1 from public.family_member_items where first_name like '%@%' or first_name ilike '%Prado%' or first_name ilike '%eli%'), 'nenhum nome nem e-mail do Eli';
    assert (select count(*) from public.financial_records where context_id = pg_temp.id('fam1') and created_by = pg_temp.id('eli')) = pg_temp.was('fam1_registros_eli_vivos')::int
       and pg_temp.was('fam1_registros_eli_vivos')::int > 0, n || ' ainda lê o que o Eli anotou';
  end loop;
  -- Gil, o RH, vê só as contagens e a licença encerrada.
  perform pg_temp.as_('gil');
  assert (select (public.organization_usage(pg_temp.id('alfa_o')) ->> 'seats')::int) = 3
     and (public.organization_usage(pg_temp.id('alfa_o')) ->> 'active')::int = 1
     and (public.organization_usage(pg_temp.id('alfa_o')) ->> 'ended')::int = 1
     and (public.organization_usage(pg_temp.id('alfa_o')) ->> 'invited')::int = 1, 'a Alfa conta 1 ativa, 1 encerrada e 1 convite';
  assert (select count(*) from public.licenses where status = 'encerrada') = 1, 'o RH lê a licença encerrada';
end $$;
reset role;

-- O e-mail fica livre: uma conta nova com o mesmo e-mail começa vazia e não lê nada da Casa da Bia.
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values (:eli2, 'Eli@Exemplo.test', now(), '{"display_name":"Eli Prado"}');
insert into ids values ('eli2', :eli2);
set role authenticated;
do $$
declare
  r jsonb;
begin
  perform pg_temp.as_('eli2');
  r := public.ensure_personal_space('Conta principal');
  insert into ids values ('eli2_ctx', (r ->> 'context_id')::uuid);
  assert (r ->> 'person_id')::uuid = pg_temp.id('eli2') and pg_temp.id('eli2') <> pg_temp.id('eli'), 'a conta nova é outra pessoa';
  assert (select count(*) from public.financial_records) = 0 and (select count(*) from public.commitments) = 0 and (select count(*) from public.goals) = 0
     and (select count(*) from public.cards) = 0 and (select count(*) from public.family_member_items) = 0 and (select count(*) from public.my_benefit) = 0
     and (select count(*) from public.financial_contexts) = 1, 'a conta nova não lê nada da conta antiga nem da Casa da Bia';
end $$;
reset role;
do $$
begin
  assert pg_temp.ctx_rows(pg_temp.id('eli2_ctx')) = (select jsonb_object_agg(k, case when k in ('financial_accounts', 'context_memberships', 'financial_contexts') then 1 else 0 end)
                                                       from jsonb_object_keys(pg_temp.ctx_rows(pg_temp.id('eli2_ctx'))) k),
    'a conta nova tem só a "Conta principal" e o próprio vínculo: nenhum dado de exemplo';
  assert (select count(*) from public.persons where id = pg_temp.id('eli2') and display_name = 'Eli Prado' and deleted_at is null) = 1
     and (select count(*) from public.persons where deleted_at is not null) = 1, 'a pessoa nova tem o nome dela; a anônima segue anônima';
end $$;

-- ---------------------------------------------------------------------------
-- 5. Com o token ainda válido: repetir a exclusão responde sem erro e sem efeito, e a conta não volta a agir.
-- ---------------------------------------------------------------------------
select pg_temp.keep('mundo2', pg_temp.world());
set role authenticated;
do $$
declare
  w text := pg_temp.world();
  r jsonb;
  n bigint;
begin
  perform pg_temp.as_('eli');
  -- A mesma chave e uma chave nova: a conta já não existe, e a resposta é a mesma de sempre.
  r := public.delete_my_account('EXCLUIR', 'ex-del-eli-0001');
  assert r = '{"deleted": true}'::jsonb, 'repetir a mesma chave depois de excluída responde sem erro';
  r := public.delete_my_account('EXCLUIR', 'ex-del-eli-0002');
  assert r = '{"deleted": true}'::jsonb, 'e com outra chave também';
  perform pg_temp.expect_code($f$select public.delete_my_account('quero apagar', 'ex-del-eli-0001')$f$, 'confirmacao_invalida', '22023');
  assert pg_temp.world() = w, 'repetir a exclusão não mudou nada em nenhuma tabela';

  -- A conta não volta a agir: sem espaço (a conta não existe), sem Família nova, sem entrar em Família, sem renomear a linha anônima.
  perform pg_temp.expect_code($f$select public.ensure_personal_space('Conta principal')$f$, 'email_nao_confirmado', '42501');
  perform pg_temp.expect_code($f$select public.create_family('Casa fantasma', 'ex-fam-eli-0009')$f$, 'sem_permissao', '42501');
  perform pg_temp.expect_code(format($f$select public.accept_family_invite(%L, 'ex-acc-eli-0009')$f$, pg_temp.code('pendente')), 'sem_permissao', '42501');
  perform pg_temp.expect_code(format($f$select public.create_record('ex-rec-eli-0009', %L, gen_random_uuid(), 'despesa', 100, '2026-10-01', 'x', null)$f$, pg_temp.id('fam1')),
    'sem_permissao', '42501');
  perform pg_temp.expect_code(format($f$select public.leave_family(%L, 'ex-lv-eli-0009')$f$, pg_temp.id('fam1')), 'nao_encontrado', 'P0002');
  perform pg_temp.expect_code($f$select public.accept_license('00000000000000000000000000000000', 'ex-lic-eli-0009')$f$, 'convite_invalido', 'P0002');
  update public.persons set display_name = 'Eli Prado' where id = pg_temp.id('eli');
  get diagnostics n = row_count;
  assert n = 0, 'a linha anônima não se renomeia (a política de renomear exige a pessoa viva)';
  assert (select count(*) from public.financial_records) = 0 and (select count(*) from public.commitments) = 0 and (select count(*) from public.goals) = 0
     and (select count(*) from public.cards) = 0 and (select count(*) from public.financial_accounts) = 0 and (select count(*) from public.family_member_items) = 0
     and (select count(*) from public.my_benefit) = 0 and (select count(*) from public.licenses) = 0 and (select count(*) from public.plan_entitlements) = 0
     and (select count(*) from public.record_operations) = 0 and (select count(*) from public.financial_contexts) = 0, 'o token antigo não lê nada';
  assert (select count(*) from public.family_invites) = 0, 'nem convites';
  reset role;
  assert pg_temp.world() = w, 'nada disso mudou o banco';
  assert (select valid_until is null from public.plan_entitlements where person_id = pg_temp.id('mia')), 'o direito da Mia segue como estava';
  set role authenticated;
end $$;
reset role;

-- As guardas da pessoa e dos contextos (também contra escrita direta do backend).
do $$
declare
  eli uuid := pg_temp.id('eli');
begin
  perform pg_temp.expect_error(format($f$update public.persons set deleted_at = now() where id = %L$f$, pg_temp.id('bia')), '%persons_display_name_check%');
  perform pg_temp.expect_error(format($f$update public.persons set display_name = 'Eli' where id = %L$f$, eli), '%persons_display_name_check%');
  perform pg_temp.expect_code($f$insert into public.persons (id, display_name) values (gen_random_uuid(), 'Sem conta')$f$, 'pessoa_sem_conta', '23503');
  perform pg_temp.expect_code(format($f$insert into public.financial_contexts (kind, name, owner_person_id) values ('familia', 'Fantasma', %L)$f$, eli), 'sem_permissao', '42501');
  perform pg_temp.expect_code(format($f$insert into public.financial_contexts (kind, name, owner_person_id) values ('pessoal', 'Pessoal', %L)$f$, eli), 'sem_permissao', '42501');
  perform pg_temp.expect_code(format($f$insert into public.context_memberships (context_id, person_id, role) values (%L, %L, 'membro')$f$, pg_temp.id('famo'), eli), 'sem_permissao', '42501');
  perform pg_temp.expect_code(format($f$insert into public.context_memberships (context_id, person_id, role) values (%L, %L, 'membro') on conflict (context_id, person_id) do update set revoked_at = null$f$, pg_temp.id('fam1'), eli),
    'sem_permissao', '42501');
  assert pg_temp.world() = pg_temp.was('mundo2'), 'as guardas não deixaram nada para trás';
  -- Apagar de novo, pelo gatilho ou pela função de apoio, não faz nada: a pessoa já foi tratada.
  perform public.clarevo_erase_person(eli);
  perform public.clarevo_erase_person(null);
  perform public.clarevo_erase_person(gen_random_uuid());
  assert pg_temp.world() = pg_temp.was('mundo2'), 'apagar quem já foi apagado (ou quem não existe) não muda nada';
end $$;

-- ---------------------------------------------------------------------------
-- 6. Rita, titular sozinha: o Pessoal e as duas Famílias (uma encerrada) são apagados; as pessoas anônimas que só existiam por causa
-- delas também. Saulo, que saiu da Casa B e exclui a conta antes, fica anônimo até a Casa B acabar; Teo, que saiu e segue com conta, não perde nada.
-- ---------------------------------------------------------------------------
select pg_temp.keep('rita_famra', pg_temp.ctx_rows(pg_temp.id('famra'))::text);
select pg_temp.keep('rita_famrb', pg_temp.ctx_rows(pg_temp.id('famrb'))::text);
do $$
declare
  saulo uuid := pg_temp.id('saulo');
begin
  assert (select ended_at is not null from public.financial_contexts where id = pg_temp.id('famra')) and pg_temp.rows_of('famra', 'financial_records') > 0
     and pg_temp.rows_of('famra', 'cards') > 0 and pg_temp.rows_of('famra', 'savings_checks') > 0, 'a Casa A está encerrada e guarda dados (antes de a Rita sair)';
  assert (select count(*) from public.context_memberships where context_id = pg_temp.id('famrb') and revoked_at is not null) = 2
     and (select count(*) from public.context_memberships where context_id = pg_temp.id('famrb') and revoked_at is null) = 1, 'na Casa B, Saulo e Teo saíram e Rita segue';
  assert pg_temp.rows_of('famrb', 'financial_records') > 0 and (select count(*) from public.financial_records where context_id = pg_temp.id('famrb') and created_by = saulo) > 0,
    'Saulo e Teo anotaram na Casa B';
end $$;
set role authenticated;
do $$
begin
  -- Rita ainda não pode ser tratada como quem "sai sozinha" sem efeito: a Casa B tem só ela de ativa, então a exclusão vale.
  perform pg_temp.as_('saulo');
  perform public.delete_my_account('EXCLUIR', 'ex-del-saulo-0001');
end $$;
reset role;
select pg_temp.check_links();
do $$
declare
  saulo uuid := pg_temp.id('saulo');
begin
  assert not exists (select 1 from auth.users where id = saulo) and (select deleted_at is not null and display_name = '' from public.persons where id = saulo),
    'Saulo: conta apagada e linha anônima (ainda é autor na Casa B)';
  assert (select bool_and(value::bigint = 0) from jsonb_each_text(pg_temp.ctx_rows(pg_temp.id('saulo_ctx')))), 'o Pessoal do Saulo foi apagado';
  assert pg_temp.refs_to(saulo, pg_temp.id('famrb')) = '{}'::jsonb, 'nada fora da Casa B aponta para o Saulo';
  assert (select count(*) from public.financial_records where context_id = pg_temp.id('famrb') and created_by = saulo) > 0, 'o que o Saulo anotou continua na Casa B';
  assert pg_temp.snap_ctx(pg_temp.id('teo_ctx'), null, true) = pg_temp.was('teo_pessoal') and pg_temp.snap_person(pg_temp.id('teo')) = pg_temp.was('teo_pessoa'), 'o Teo não mudou';
end $$;

set role authenticated;
do $$
declare
  r jsonb;
begin
  perform pg_temp.as_('rita');
  r := public.delete_my_account('EXCLUIR', 'ex-del-rita-0001');
  assert r = '{"deleted": true}'::jsonb, 'Rita excluiu';
end $$;
reset role;
select pg_temp.check_links();
do $$
declare
  rita uuid := pg_temp.id('rita');
  saulo uuid := pg_temp.id('saulo');
  teo uuid := pg_temp.id('teo');
  t text;
begin
  assert not exists (select 1 from auth.users where id = rita) and not exists (select 1 from public.persons where id = rita), 'Rita: nem conta nem linha (não é autora de nada que continue)';
  assert (select bool_and(value::bigint = 0) from jsonb_each_text(pg_temp.ctx_rows(pg_temp.id('rita_ctx')))), 'o Pessoal da Rita foi apagado';
  assert (select bool_and(value::bigint = 0) from jsonb_each_text(pg_temp.ctx_rows(pg_temp.id('famra')))), 'a Casa A (encerrada) foi apagada, com os dados que guardava';
  assert (select bool_and(value::bigint = 0) from jsonb_each_text(pg_temp.ctx_rows(pg_temp.id('famrb')))), 'a Casa B foi apagada, com o que Saulo, Teo e Rita anotaram';
  assert not exists (select 1 from public.financial_contexts where id in (pg_temp.id('famra'), pg_temp.id('famrb'), pg_temp.id('rita_ctx'))), 'nenhum dos três contextos existe';
  assert not exists (select 1 from public.persons where id = saulo), 'Saulo, anônimo só por causa da Casa B, foi apagado junto com ela';
  assert pg_temp.refs_to(rita) = '{}'::jsonb and pg_temp.refs_to(saulo) = '{}'::jsonb, 'nada aponta para Rita nem para Saulo';
  assert exists (select 1 from public.persons where id = teo and deleted_at is null) and exists (select 1 from auth.users where id = teo), 'Teo segue com conta e nome';
  assert pg_temp.snap_ctx(pg_temp.id('teo_ctx'), null, true) = pg_temp.was('teo_pessoal') and pg_temp.snap_person(teo, pg_temp.id('famrb')) = pg_temp.was('teo_pessoa_sem_b'),
    'o Pessoal e a conta do Teo não mudaram (só o que ele anotou na Casa B saiu com a Casa)';
  assert not exists (select 1 from public.record_operations where actor_id = teo and context_id = pg_temp.id('famrb')), 'as operações do Teo na Casa B saíram com a Casa';
  assert not exists (select 1 from public.context_memberships where context_id in (pg_temp.id('famra'), pg_temp.id('famrb'))), 'os vínculos das duas Casas saíram';
  foreach t in array array['bia', 'lia', 'mia', 'otto', 'pia', 'vic', 'zeca', 'uri'] loop
    assert pg_temp.snap_ctx(pg_temp.id(t || '_ctx'), null, true) = pg_temp.was(t || '_pessoal') and pg_temp.snap_person(pg_temp.id(t)) = pg_temp.was(t || '_pessoa'),
      'nada mudou para ' || t;
  end loop;
  assert pg_temp.snap_ctx(pg_temp.id('famo'), null, true) = pg_temp.was('famo') and pg_temp.snap_ctx(pg_temp.id('famv'), pg_temp.id('zeca')) = pg_temp.was('famv_dados'), 'as outras Famílias não mudaram';
end $$;
-- Quem nunca teve linha em persons (já apagada) com o token antigo também não cria Família.
set role authenticated;
do $$
begin
  perform pg_temp.as_('rita');
  perform pg_temp.expect_code($f$select public.create_family('Casa fantasma', 'ex-fam-rita-0009')$f$, 'sem_permissao', '42501');
  assert public.delete_my_account('EXCLUIR', 'ex-del-rita-0002') = '{"deleted": true}'::jsonb, 'repetir a exclusão da Rita também responde sem erro';
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 7. Passar a titularidade (Bia para Lia), Bia exclui como membro; Lia, titular sozinha com dois ex-membros anônimos (Eli e Bia),
-- exclui e a Casa acaba por inteiro, com as duas pessoas anônimas.
-- ---------------------------------------------------------------------------
set role authenticated;
do $$
begin
  perform pg_temp.as_('bia');
  perform public.transfer_family_ownership(pg_temp.id('fam1'), pg_temp.id('lia'), 'ex-tr-bia-0001');
end $$;
reset role;
select pg_temp.keep('fam1_dados_b', pg_temp.snap_ctx(pg_temp.id('fam1'), pg_temp.id('bia')));
select pg_temp.keep('lia_pessoal_2', pg_temp.snap_ctx(pg_temp.id('lia_ctx'), null, true));
do $$
begin
  assert (select (role, revoked_at is null) from public.context_memberships where context_id = pg_temp.id('fam1') and person_id = pg_temp.id('lia')) = ('titular'::public.membership_role, true)
     and (select (role, revoked_at is null) from public.context_memberships where context_id = pg_temp.id('fam1') and person_id = pg_temp.id('bia')) = ('membro'::public.membership_role, true),
    'Lia é a titular e Bia é membro';
  assert (select owner_person_id from public.financial_contexts where id = pg_temp.id('fam1')) = pg_temp.id('lia'), 'a Casa é da Lia';
  assert exists (select 1 from public.family_invites where id = (select invite from codes where name = 'pendente')), 'o convite pendente é da Bia (quem era titular)';
end $$;
set role authenticated;
do $$
begin
  perform pg_temp.as_('bia');
  assert public.delete_my_account('EXCLUIR', 'ex-del-bia-0002') = '{"deleted": true}'::jsonb, 'Bia excluiu como membro';
end $$;
reset role;
select pg_temp.check_links();
do $$
declare
  bia uuid := pg_temp.id('bia');
  fam uuid := pg_temp.id('fam1');
begin
  assert not exists (select 1 from auth.users where id = bia) and (select deleted_at is not null and display_name = '' from public.persons where id = bia), 'Bia: conta apagada, linha anônima';
  assert (select bool_and(value::bigint = 0) from jsonb_each_text(pg_temp.ctx_rows(pg_temp.id('bia_ctx')))), 'o Pessoal da Bia foi apagado';
  assert pg_temp.refs_to(bia, fam) = '{}'::jsonb and (select count(*) from jsonb_object_keys(pg_temp.refs_to(bia))) >= 15, 'a Bia só aponta para a Casa da Bia, onde segue como autora';
  assert pg_temp.snap_ctx(fam, bia) = pg_temp.was('fam1_dados_b'), 'o conteúdo da Casa não mudou (o que a Bia e o Eli anotaram continua)';
  assert (select (revoked_at is not null) from public.context_memberships where context_id = fam and person_id = bia), 'o vínculo da Bia ficou, revogado';
  assert not exists (select 1 from public.family_invites where id = (select invite from codes where name = 'pendente')), 'o convite que a Bia criou saiu com ela';
  assert (select count(*) from public.family_invites where created_by = bia or used_by = bia) = 0, 'nenhum convite aponta para a Bia';
  assert pg_temp.snap_ctx(pg_temp.id('lia_ctx'), null, true) = pg_temp.was('lia_pessoal_2'), 'o Pessoal da Lia não mudou';
  assert (select count(*) from public.context_memberships where context_id = fam and revoked_at is null) = 1, 'só a Lia segue ativa na Casa';
end $$;
set role authenticated;
do $$
begin
  -- O convite que a Bia criou deixa de valer para qualquer um.
  perform pg_temp.as_('uri');
  perform pg_temp.expect_code(format($f$select public.preview_family_invite(%L)$f$, pg_temp.code('pendente')), 'convite_invalido', 'P0002');
  -- Lia, titular, cria um convite e depois exclui a conta: está sozinha na Casa (os dois ex-membros são anônimos).
  perform pg_temp.inv('lia_novo', 'lia', 'membro', 'fam1');
  assert (select first_name from public.family_member_items where context_id = pg_temp.id('fam1') and person_id = pg_temp.id('bia')) = 'Pessoa que saiu', 'Lia lê a Bia como "Pessoa que saiu"';
  assert (select count(*) from public.family_member_items where context_id = pg_temp.id('fam1') and first_name = 'Pessoa que saiu' and status = 'ex-membro') = 2, 'dois ex-membros anônimos';
end $$;
reset role;
select pg_temp.keep('otto_pessoal_2', pg_temp.snap_ctx(pg_temp.id('otto_ctx'), null, true));
set role authenticated;
do $$
begin
  perform pg_temp.as_('lia');
  assert public.delete_my_account('EXCLUIR', 'ex-del-lia-0001') = '{"deleted": true}'::jsonb, 'Lia excluiu como titular sozinha';
end $$;
reset role;
select pg_temp.check_links();
do $$
declare
  t text;
begin
  assert not exists (select 1 from auth.users where id = pg_temp.id('lia')) and not exists (select 1 from public.persons where id = pg_temp.id('lia')), 'Lia: nem conta nem linha';
  assert (select bool_and(value::bigint = 0) from jsonb_each_text(pg_temp.ctx_rows(pg_temp.id('fam1')))) and (select bool_and(value::bigint = 0) from jsonb_each_text(pg_temp.ctx_rows(pg_temp.id('lia_ctx')))),
    'a Casa da Bia e o Pessoal da Lia foram apagados por inteiro';
  assert not exists (select 1 from public.persons where id in (pg_temp.id('eli'), pg_temp.id('bia'), pg_temp.id('lia'))), 'as duas pessoas anônimas que só existiam por causa da Casa saíram com ela';
  assert not exists (select 1 from public.persons where deleted_at is not null), 'nenhuma pessoa anônima sobrou no banco';
  assert pg_temp.refs_to(pg_temp.id('eli')) = '{}'::jsonb and pg_temp.refs_to(pg_temp.id('bia')) = '{}'::jsonb and pg_temp.refs_to(pg_temp.id('lia')) = '{}'::jsonb, 'nada aponta para nenhuma das três';
  assert not exists (select 1 from public.family_invites where context_id = pg_temp.id('fam1')), 'os convites da Casa saíram';
  assert exists (select 1 from public.persons where id = pg_temp.id('eli2') and deleted_at is null), 'a conta nova com o e-mail do Eli não foi tocada';
  foreach t in array array['mia', 'otto', 'pia', 'vic', 'zeca', 'uri', 'teo'] loop
    assert pg_temp.snap_ctx(pg_temp.id(t || '_ctx'), null, true) = pg_temp.was(t || '_pessoal'), 'o Pessoal de ' || t || ' não mudou';
  end loop;
  assert pg_temp.snap_ctx(pg_temp.id('famo'), null, true) = pg_temp.was('famo'), 'a Casa do Otto não mudou';
end $$;

-- ---------------------------------------------------------------------------
-- 8. Apagar o usuário direto (o "Delete user" do painel do Supabase): o gatilho de auth.users aplica as mesmas regras.
-- ---------------------------------------------------------------------------
do $$
declare
  zeca uuid := pg_temp.id('zeca');
  vic uuid := pg_temp.id('vic');
begin
  -- Zeca (membro da Casa do Vic): a conta sai, o Pessoal sai, a autoria fica anônima.
  delete from auth.users where id = zeca;
  perform pg_temp.check_links();
  assert (select deleted_at is not null and display_name = '' from public.persons where id = zeca), 'Zeca virou anônimo (autor na Casa do Vic)';
  assert (select bool_and(value::bigint = 0) from jsonb_each_text(pg_temp.ctx_rows(pg_temp.id('zeca_ctx')))), 'o Pessoal do Zeca foi apagado pelo gatilho';
  assert pg_temp.refs_to(zeca, pg_temp.id('famv')) = '{}'::jsonb, 'nada fora da Casa do Vic aponta para o Zeca';
  assert pg_temp.snap_ctx(pg_temp.id('famv'), zeca) = pg_temp.was('famv_dados'), 'a Casa do Vic não mudou';
  assert pg_temp.snap_ctx(pg_temp.id('vic_ctx'), null, true) = pg_temp.was('vic_pessoal'), 'o Pessoal do Vic não mudou';
  -- Vic, agora sozinho: a Casa e o Zeca anônimo saem com ele.
  delete from auth.users where id = vic;
  perform pg_temp.check_links();
  assert not exists (select 1 from public.persons where id in (vic, zeca)) and not exists (select 1 from auth.users where id in (vic, zeca)), 'Vic e Zeca saíram por completo';
  assert (select bool_and(value::bigint = 0) from jsonb_each_text(pg_temp.ctx_rows(pg_temp.id('famv')))) and (select bool_and(value::bigint = 0) from jsonb_each_text(pg_temp.ctx_rows(pg_temp.id('vic_ctx')))),
    'a Casa do Vic e o Pessoal dele foram apagados';
  assert pg_temp.refs_to(vic) = '{}'::jsonb and pg_temp.refs_to(zeca) = '{}'::jsonb, 'nada aponta para Vic nem para Zeca';
end $$;
-- Quem nunca criou o espaço (Xena, sem linha em persons) também exclui a conta: só sai de auth.users.
select pg_temp.keep('mundo3', pg_temp.world());
set role authenticated;
do $$
begin
  perform pg_temp.as_('xena');
  assert public.delete_my_account('EXCLUIR', 'ex-del-xena-0001') = '{"deleted": true}'::jsonb, 'Xena excluiu';
end $$;
reset role;
do $$
begin
  -- 14 contas no começo, mais a nova com o e-mail do Eli, menos as oito que saíram (Eli, Saulo, Rita, Bia, Lia, Zeca, Vic e Xena).
  assert not exists (select 1 from auth.users where id = pg_temp.id('xena')) and (select count(*) from auth.users) = 14 + 1 - 8,
    'só a conta da Xena saiu desta vez: ela nunca tinha espaço, e o banco não tinha nada dela além de auth.users';
  assert pg_temp.world() <> pg_temp.was('mundo3') and not exists (select 1 from public.persons where id = pg_temp.id('xena')), 'a Xena não tinha linha em persons';
  assert pg_temp.snap_ctx(pg_temp.id('uri_ctx'), null, true) = pg_temp.was('uri_pessoal') and pg_temp.snap_person(pg_temp.id('uri')) = pg_temp.was('uri_pessoa'), 'Uri, que nunca saiu, não mudou';
end $$;

-- ---------------------------------------------------------------------------
-- 9. Estrutura: as chaves estrangeiras que a exclusão cobre, o gatilho de auth.users, os privilégios e as guardas.
-- ---------------------------------------------------------------------------
-- As funções de public que o app executa (com sessão), com a definição; a definição só é lida das que passam no filtro.
create function pg_temp.app_functions() returns table (proname name, def text) language sql as $$
  select p.proname, case when p.prokind = 'f' then pg_get_functiondef(p.oid) end
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and has_function_privilege('authenticated', p.oid, 'execute')
$$;
do $$
declare
  f text;
begin
  -- As 37 chaves estrangeiras para persons: 11 são do que é só da pessoa (apagadas), 26 são autoria e vínculo (ficam, anônimas).
  -- Uma chave nova obriga a decidir aqui, e em clarevo_erase_person, o que fazer com ela.
  assert pg_temp.person_fks() = array[
      'card_entries.created_by', 'card_entries.deleted_by', 'cards.created_by', 'cards.deleted_by', 'category_budgets.created_by',
      'category_budgets.deleted_by', 'commitment_limits.created_by', 'commitment_limits.deleted_by', 'commitment_series.created_by',
      'commitment_series.deleted_by', 'commitments.created_by', 'commitments.deleted_by', 'context_activity.person_id',
      'context_memberships.person_id', 'family_invites.created_by', 'family_invites.used_by', 'financial_accounts.created_by',
      'financial_accounts.deleted_by', 'financial_contexts.owner_person_id', 'financial_records.created_by', 'financial_records.deleted_by',
      'goal_movements.created_by', 'goal_movements.deleted_by', 'goals.created_by', 'goals.deleted_by', 'income_references.created_by',
      'income_references.deleted_by', 'licenses.person_id', 'month_checks.updated_by', 'organization_admins.person_id', 'plan_entitlements.person_id',
      'record_operations.actor_id', 'return_reviews.person_id', 'savings_checks.person_id', 'series_terms.created_by', 'series_terms.superseded_by',
      'signup_sources.person_id'],
    'as chaves estrangeiras para persons são as 37 que a exclusão da conta trata';
  -- E as que apontam para financial_contexts (financial_records é restrict: por isso os registros saem antes do contexto).
  assert (select array_agg(c.conrelid::regclass::text || '.' || a.attname || ' ' || c.confdeltype::text order by c.conrelid::regclass::text, a.attname)
            from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
           where c.contype = 'f' and c.confrelid = 'public.financial_contexts'::regclass)
       = array['cards.context_id c', 'category_budgets.context_id c', 'commitment_limits.context_id c', 'commitment_series.context_id c', 'commitments.context_id c',
               'context_activity.context_id c', 'context_memberships.context_id c', 'family_invites.context_id c', 'financial_accounts.context_id c',
               'financial_records.context_id r', 'goals.context_id c', 'income_references.context_id c', 'month_checks.context_id c', 'return_reviews.context_id c', 'savings_checks.context_id c'],
    'as chaves estrangeiras para financial_contexts: 14 com cascata e financial_records com restrict';
  assert not exists (select 1 from pg_constraint where conrelid = 'public.persons'::regclass and contype = 'f'), 'persons não depende mais de auth.users por chave estrangeira';
  assert (select count(*) from pg_attribute where attrelid = 'public.persons'::regclass and attname = 'deleted_at' and not attisdropped) = 1
     and (select pg_get_constraintdef(oid) from pg_constraint where conname = 'persons_display_name_check') like '%deleted_at IS NOT NULL%', 'persons.deleted_at e a regra do nome vazio';

  -- O gatilho de auth.users: antes de apagar a linha, em cada linha.
  assert exists (select 1 from pg_trigger t where t.tgrelid = 'auth.users'::regclass and t.tgname = 'clarevo_erase_on_user_delete' and not t.tgisinternal
                    and (t.tgtype & 1) = 1 and (t.tgtype & 2) = 2 and (t.tgtype & 8) = 8 and t.tgenabled = 'O'), 'gatilho antes de apagar auth.users';

  -- A função: security definer, search_path fixo, só authenticated (nem public, nem anon).
  assert (select p.prosecdef and p.proconfig @> array['search_path=public'] from pg_proc p where p.oid = 'public.delete_my_account(text, text)'::regprocedure),
    'delete_my_account é security definer com search_path fixo';
  assert has_function_privilege('authenticated', 'public.delete_my_account(text, text)', 'execute')
     and not has_function_privilege('anon', 'public.delete_my_account(text, text)', 'execute')
     and (select p.proacl is not null and not exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0) from pg_proc p where p.oid = 'public.delete_my_account(text, text)'::regprocedure),
    'só authenticated executa delete_my_account';
  assert (select array_agg(a.parameter_name) from (select unnest(proargnames) as parameter_name from pg_proc where oid = 'public.delete_my_account(text, text)'::regprocedure) a) = array['p_confirmation', 'p_key'],
    'os parâmetros são p_confirmation e p_key';
  -- As funções de apoio e os gatilhos: ninguém executa (nem a chave de serviço).
  foreach f in array array['persons_auth_guard()', 'financial_contexts_person_guard()', 'context_memberships_person_guard()', 'record_operations_actor_guard()',
                           'clarevo_erase_context(uuid)', 'clarevo_erase_person(uuid)', 'clarevo_erase_on_user_delete()'] loop
    assert not has_function_privilege('authenticated', 'public.' || f, 'execute') and not has_function_privilege('anon', 'public.' || f, 'execute')
       and not has_function_privilege('service_role', 'public.' || f, 'execute')
       and not exists (select 1 from aclexplode((select proacl from pg_proc where oid = ('public.' || f)::regprocedure)) a where a.grantee = 0),
      'sem execute para ninguém com sessão: ' || f;
    assert (select prosecdef from pg_proc where oid = ('public.' || f)::regprocedure), 'security definer: ' || f;
  end loop;
  assert (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and has_function_privilege('authenticated', p.oid, 'execute')) = 83, 'authenticated executa 83 funções (as 80 da 0015, as 2 de conferir o mês e a de responder de onde conheceu o Clarevo)';
  assert not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                      where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')), 'anon não executa nenhuma função';

  -- A política de renomear a própria linha exige a pessoa viva; a visão dos membros mantém as colunas e a barreira.
  assert (select qual like '%deleted_at IS NULL%' and with_check like '%deleted_at IS NULL%' from pg_policies where tablename = 'persons' and policyname = 'persons_update_self'),
    'só a pessoa viva renomeia a própria linha';
  assert (select array_agg(attname::text order by attnum) from pg_attribute where attrelid = 'public.family_member_items'::regclass and attnum > 0 and not attisdropped)
       = array['context_id', 'person_id', 'first_name', 'role', 'status', 'is_me', 'joined_at', 'left_at']
     and (select reloptions @> array['security_barrier=true'] from pg_class where oid = 'public.family_member_items'::regclass), 'a visão dos membros manteve as colunas e a barreira';
  -- Correções da revisão de segurança (X5 a X7): as travas estão nas definições, na ordem certa.
  -- A guarda de persons trava a linha de auth.users (for key share) e recusa se ela não existe.
  assert (select pg_get_functiondef(oid) from pg_proc where oid = 'public.persons_auth_guard()'::regprocedure) ~ 'from auth\.users u where u\.id = new\.id for key share',
    'persons_auth_guard trava a linha de auth.users com for key share';
  -- ensure_personal_space toma a trava por pessoa da exclusão ANTES de ler auth.users.
  assert (select position('familia:p:' in pg_get_functiondef(oid)) > 0
              and position('familia:p:' in pg_get_functiondef(oid)) < position('from auth.users where id' in pg_get_functiondef(oid))
            from pg_proc where oid = 'public.ensure_personal_space(text, text)'::regprocedure),
    'ensure_personal_space toma a trava por pessoa antes de ler auth.users';
  -- O gatilho de record_operations: antes de gravar, em cada linha, ligado; trava a pessoa e recusa a excluída ou anônima.
  assert exists (select 1 from pg_trigger t where t.tgrelid = 'public.record_operations'::regclass and t.tgname = 'record_operations_actor_guard' and not t.tgisinternal
                    and (t.tgtype & 1) = 1 and (t.tgtype & 2) = 2 and (t.tgtype & 4) = 4 and t.tgenabled = 'O'), 'gatilho antes de gravar em record_operations';
  assert (select pg_get_functiondef(oid) from pg_proc where oid = 'public.record_operations_actor_guard()'::regprocedure) ~ 'for key share'
     and (select pg_get_functiondef(oid) from pg_proc where oid = 'public.record_operations_actor_guard()'::regprocedure) ~ 'conta_excluida',
    'o gatilho de record_operations trava a pessoa (for key share) e recusa com conta_excluida';
  -- A exclusão: trava da pessoa, travas das Famílias, linha da pessoa (for update) e só depois o que é dela e o que é dos outros.
  assert (select position('familia:p:' in d) < position('familia:c:' in d)
              and position('familia:c:' in d) < position('for update' in d)
              and position('for update' in d) < position('select coalesce(array_agg(c.id order by c.id), ''{}'') into v_owned' in d)
              and position('select coalesce(array_agg(c.id order by c.id), ''{}'') into v_owned' in d) < position('transferir_antes' in d)
            from (select pg_get_functiondef('public.clarevo_erase_person(uuid)'::regprocedure) as d) x),
    'clarevo_erase_person: trava da pessoa, travas das Famílias, linha da pessoa e só depois o cálculo do que é dela';
  -- A pessoa só vira anônima se já não é dona nem titular de nada.
  assert (select pg_get_functiondef('public.clarevo_erase_person(uuid)'::regprocedure) ~ 'owner_person_id = p_person\)\s+or exists \(select 1 from public\.context_memberships m where m\.person_id = p_person and m\.role = ''titular'' and m\.revoked_at is null\) then\s+raise exception ''transferir_antes''')
    , 'o ramo anônimo recusa se a pessoa ainda é dona ou titular de algo';
  -- A geração de contas de gasto fixo, a única escrita sem operação, confere a pessoa que criou a série antes de travar a série.
  assert (select position('persons p where p.id = v_creator and p.deleted_at is null for key share' in d) > 0
              and position('persons p where p.id = v_creator' in d) < position('where id = p_series_id for update' in d)
            from (select pg_get_functiondef('public.clarevo_materialize_series(uuid)'::regprocedure) as d) x),
    'clarevo_materialize_series confere a pessoa que criou a série antes de travar a série';
  -- Toda função de escrita que o app executa termina gravando a operação (o gatilho acima é o ponto comum). As únicas sem operação:
  -- delete_my_account (a pessoa sai com o rastro), ensure_personal_space (cria a pessoa, sob a trava por pessoa e a guarda de auth.users)
  -- e sync_series_occurrences (a geração, que confere a pessoa que criou a série).
  assert (select array_agg(x.proname::text order by x.proname) from pg_temp.app_functions() x
           where (x.def ~* '(insert into|update|delete from) (public|auth)\.' or x.def ~* 'clarevo_materialize_series') and x.def !~* 'insert into public\.record_operations')
       = array['delete_my_account', 'ensure_personal_space', 'sync_series_occurrences'],
    'toda função de escrita grava a operação, menos delete_my_account, ensure_personal_space e sync_series_occurrences';
  assert (select count(*) from pg_temp.app_functions() x where x.def ~* 'insert into public\.record_operations') = 66,
    'as 66 funções de escrita com operação são as que o gatilho de record_operations protege';
  -- Nada novo em record_operations pela exclusão: a conta some com o rastro, então nenhuma ação nova (as 2 de conferir o mês vêm da 0016).
  assert (select count(*) from pg_constraint c, regexp_matches(pg_get_constraintdef(c.oid), '''([a-z_]+)''::text', 'g') m where c.conname = 'record_operations_action_check') = 66,
    'a lista de ações de record_operations segue com 66 (excluir a conta não deixa operação)';
end $$;
rollback;

-- ---------------------------------------------------------------------------
-- 10. Corridas (revisão de segurança): duas sessões de verdade, uma segurando a transação aberta e a outra esperando a trava.
-- As sessões do dblink só enxergam dados gravados: esta parte grava de verdade (pessoas fictícias abaixo) e, no fim, apaga tudo.
-- Sem a extensão dblink (ou sem conexão local), roda o equivalente determinístico numa sessão só (a primeira termina antes da
-- segunda) e avisa. Para conferir o equivalente com dblink disponível: set clarevo.sem_dblink = 'on'.
--   S1. A titularidade chega a Beto enquanto ele exclui a conta: a Família nunca fica sem titular (transferir_antes).
--   S2. A titular passa a titularidade enquanto exclui a conta: ela sai como membro, e a Família segue com o novo titular.
--   S3. ensure_personal_space durante a exclusão: a pessoa e o Pessoal não são recriados.
--   S4. Criar a linha de persons direto durante a exclusão do usuário: pessoa_sem_conta (a guarda trava auth.users).
--   S5. create_record na Família durante a exclusão (outro aparelho): erro, e nada da pessoa sobra (nem operação, nem atividade).
--   S6. A mesma gravação, mas que chegou antes: termina, e a exclusão a leva (o registro fica na Família, com a autoria anônima).
--   S7. A geração das contas de gasto fixo durante a exclusão de quem criou a série: nada é gerado em nome de quem saiu.
--   S8. As outras funções de escrita: set_savings_answer, accept_family_invite e accept_license durante a exclusão.
-- ---------------------------------------------------------------------------
\set t1 '''00000000-0000-0000-0000-00000000c101'''
\set b1 '''00000000-0000-0000-0000-00000000c102'''
\set t2 '''00000000-0000-0000-0000-00000000c103'''
\set b2 '''00000000-0000-0000-0000-00000000c104'''
\set uli '''00000000-0000-0000-0000-00000000c105'''
\set gus '''00000000-0000-0000-0000-00000000c106'''
\set t5 '''00000000-0000-0000-0000-00000000c107'''
\set b5 '''00000000-0000-0000-0000-00000000c108'''
\set b6 '''00000000-0000-0000-0000-00000000c109'''
\set b7 '''00000000-0000-0000-0000-00000000c10a'''
\set t8 '''00000000-0000-0000-0000-00000000c10b'''
\set b8a '''00000000-0000-0000-0000-00000000c10c'''
\set b8b '''00000000-0000-0000-0000-00000000c10d'''
\set b8c '''00000000-0000-0000-0000-00000000c10e'''
\set t8d '''00000000-0000-0000-0000-00000000c10f'''
\set gil8 '''00000000-0000-0000-0000-00000000c110'''
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  (:t1,   't1@corrida-exclusao.test',   now(), '{"display_name":"Tina Um"}'),
  (:b1,   'b1@corrida-exclusao.test',   now(), '{"display_name":"Beto Um"}'),
  (:t2,   't2@corrida-exclusao.test',   now(), '{"display_name":"Tina Dois"}'),
  (:b2,   'b2@corrida-exclusao.test',   now(), '{"display_name":"Beto Dois"}'),
  (:uli,  'uli@corrida-exclusao.test',  now(), '{"display_name":"Ulisses Corrida"}'),
  (:gus,  'gus@corrida-exclusao.test',  now(), '{"display_name":"Gustavo Corrida"}'),
  (:t5,   't5@corrida-exclusao.test',   now(), '{"display_name":"Tina Cinco"}'),
  (:b5,   'b5@corrida-exclusao.test',   now(), '{"display_name":"Beto Cinco"}'),
  (:b6,   'b6@corrida-exclusao.test',   now(), '{"display_name":"Beto Seis"}'),
  (:b7,   'b7@corrida-exclusao.test',   now(), '{"display_name":"Beto Sete"}'),
  (:t8,   't8@corrida-exclusao.test',   now(), '{"display_name":"Tina Oito"}'),
  (:b8a,  'b8a@corrida-exclusao.test',  now(), '{"display_name":"Beto Oito A"}'),
  (:b8b,  'b8b@corrida-exclusao.test',  now(), '{"display_name":"Beto Oito B"}'),
  (:b8c,  'b8c@corrida-exclusao.test',  now(), '{"display_name":"Beto Oito C"}'),
  (:t8d,  't8d@corrida-exclusao.test',  now(), '{"display_name":"Tina Oito D"}'),
  (:gil8, 'gil8@corrida-exclusao.test', now(), '{"display_name":"Gil Oito"}');

create temp table cp (name text primary key, id uuid, code text);
grant select, insert on cp to authenticated;
create function pg_temp.cid(p_name text) returns uuid language sql as $$ select id from cp where name = p_name $$;
create function pg_temp.ccode(p_name text) returns text language sql as $$ select code from cp where name = p_name $$;
create function pg_temp.cas(p_name text) returns text language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(pg_temp.cid(p_name)::text, ''), true)
$$;
-- A sessão de uma pessoa nas conexões do dblink (e o "hoje" dela): a Tina Cinco gera as contas em dezembro.
create function pg_temp.csess(p_name text, p_today text default '2026-10-07') returns text language sql as $$
  select format('set local clarevo.today = %L; set local role authenticated; set local "request.jwt.claim.sub" = %L', p_today, pg_temp.cid(p_name))
$$;
insert into cp (name, id) values ('t1', :t1), ('b1', :b1), ('t2', :t2), ('b2', :b2), ('uli', :uli), ('gus', :gus), ('t5', :t5), ('b5', :b5), ('b6', :b6),
  ('b7', :b7), ('t8', :t8), ('b8a', :b8a), ('b8b', :b8b), ('b8c', :b8c), ('t8d', :t8d), ('gil8', :gil8);

-- 10.0 Montagem (gravada de verdade): o Pessoal de todos, as Famílias e o que cada pessoa anotou.
set role authenticated;
begin;
set local clarevo.today = '2026-10-07';
do $$
declare
  n text;
  r jsonb;
  fam uuid;
  code text;
  acc uuid;
begin
  foreach n in array array['t1', 'b1', 't2', 'b2', 'uli', 't5', 'b5', 'b6', 'b7', 't8', 'b8a', 'b8b', 'b8c', 't8d', 'gil8'] loop
    perform pg_temp.cas(n);
    r := public.ensure_personal_space('Conta principal');
    insert into cp values (n || '_ctx', (r ->> 'context_id')::uuid, null), (n || '_acc', (r #>> '{account,id}')::uuid, null);
    perform public.create_record('cor-pes-' || n, (r ->> 'context_id')::uuid, (r #>> '{account,id}')::uuid, 'despesa', 1500, '2026-10-02', 'Mercado ' || n, 'Mercado');
  end loop;
  -- Famílias: a de S1 (t1 titular, b1 membro), a de S2 (t2, b2), a de S5 a S7 (t5, b5, b6, b7), a de S8 (t8, b8a, b8b, b8c) e a que b8b encontra depois (t8d).
  foreach n in array array['f1:t1:b1', 'f2:t2:b2', 'f5:t5:b5,b6,b7', 'f8:t8:b8a,b8b,b8c', 'f8d:t8d:'] loop
    perform pg_temp.cas(split_part(n, ':', 2));
    fam := (public.create_family('Casa ' || split_part(n, ':', 1), 'cor-fam-' || split_part(n, ':', 1)) #>> '{context,id}')::uuid;
    insert into cp values (split_part(n, ':', 1), fam, null);
    acc := (select id from public.financial_accounts where context_id = fam order by created_at limit 1);
    insert into cp values (split_part(n, ':', 1) || '_acc', acc, null);
    perform public.create_record('cor-rt-' || split_part(n, ':', 2), fam, acc, 'despesa', 2500, '2026-10-03', 'Feira da titular ' || split_part(n, ':', 2), null);
    for code in select unnest(string_to_array(nullif(split_part(n, ':', 3), ''), ',')) loop
      perform pg_temp.cas(split_part(n, ':', 2));
      r := public.create_family_invite(fam, 'membro', 'cor-inv-' || code);
      perform pg_temp.cas(code);
      perform public.accept_family_invite(r ->> 'code', 'cor-acc-' || code);
      -- Cada membro anota uma vez na Família (por isso a linha dele fica anônima depois de excluir a conta).
      perform public.create_record('cor-rm-' || code, fam, acc, 'despesa', 1800, '2026-10-04', 'Padaria de ' || code, null);
    end loop;
  end loop;
end $$;
commit;
reset role;

-- A conta de b8b sai da Casa f8 antes da corrida (ela fica com uma anotação lá) e recebe o convite da Casa f8d.
set role authenticated;
begin;
set local clarevo.today = '2026-10-07';
do $$
declare
  r jsonb;
begin
  perform pg_temp.cas('b8b');
  perform public.leave_family(pg_temp.cid('f8'), 'cor-lv-b8b');
  perform pg_temp.cas('t8d');
  r := public.create_family_invite(pg_temp.cid('f8d'), 'membro', 'cor-inv-b8b-d');
  insert into cp values ('code_b8b', null, r ->> 'code');
end $$;
commit;
reset role;

-- A série de gasto fixo de b7 na Casa f5 (S7), com as contas de outubro e novembro geradas.
set role authenticated;
begin;
set local clarevo.today = '2026-10-07';
do $$
declare
  ser uuid;
begin
  perform pg_temp.cas('b7');
  ser := (public.create_series('cor-ser-b7', pg_temp.cid('f5'), 'mensal', 'conta', 'Streaming corrida', null, 4500, 'fixo', 10, '2026-10-01', 1, null, null, null) #>> '{series,id}')::uuid;
  insert into cp values ('ser_b7', ser, null);
end $$;
commit;
reset role;

-- A empresa da corrida: Gil Oito convida b8c, que ainda não aceitou (S8).
begin;
set local clarevo.today = '2026-10-07';
do $$
declare
  r jsonb;
  x jsonb;
begin
  r := public.clarevo_staff_create_organization('Empresa da Corrida do Banco', 3, 'individual', '2026-01-01', null, 'gil8@corrida-exclusao.test');
  insert into cp values ('org', (r ->> 'organization_id')::uuid, null), ('contrato', (r ->> 'contract_id')::uuid, null);
end $$;
set local role authenticated;
do $$
declare
  r jsonb;
begin
  perform pg_temp.cas('gil8');
  r := public.invite_licenses(pg_temp.cid('contrato'), array['b8c@corrida-exclusao.test'], 'cor-lic-0001');
  insert into cp values ('code_b8c', null, r #>> '{results,0,code}');
end $$;
commit;
reset role;

-- A extensão dblink e a corrida: a sessão A segura a transação aberta; a sessão B começa depois e espera a trava; A grava (commit) e B
-- termina (ou é recusada). Devolve o desfecho de B: 'ok:<resposta>' ou '<sqlstate>:<mensagem>'. Sem dblink, o equivalente numa sessão só.
create temp table cmode (dblink boolean);
do $$
declare
  v_ok boolean := exists (select 1 from pg_available_extensions where name = 'dblink') and coalesce(current_setting('clarevo.sem_dblink', true), '') <> 'on';
begin
  if v_ok then
    create schema testes_dblink;
    create extension dblink schema testes_dblink;
    begin
      perform testes_dblink.dblink_connect('conectar', format('dbname=%s port=%s', current_database(), current_setting('port')));
      perform testes_dblink.dblink_disconnect('conectar');
    exception when others then
      raise notice '99/10: dblink sem conexão local (%); conferência sequencial numa sessão só', sqlerrm;
      drop extension dblink;
      drop schema testes_dblink;
      v_ok := false;
    end;
  else
    raise notice '99/10: extensão dblink indisponível (ou desligada); conferência sequencial numa sessão só';
  end if;
  insert into cmode values (v_ok);
end $$;

create function pg_temp.race(p_a_sess text, p_a_sql text, p_b_sess text, p_b_sql text, p_b_waits boolean default true) returns text
language plpgsql as $$
declare
  v_conn text := format('dbname=%s port=%s', current_database(), current_setting('port'));
  v_pid int;
  v_waited boolean := false;
  v_out text;
  i int;
begin
  if (select dblink from cmode) then
    perform testes_dblink.dblink_connect('ra', v_conn);
    perform testes_dblink.dblink_connect('rb', v_conn);
    -- A: faz a sua parte e segura a transação aberta.
    perform testes_dblink.dblink_exec('ra', 'begin; ' || p_a_sess);
    perform * from testes_dblink.dblink('ra', p_a_sql) as t(r text);
    -- B: começa depois e espera.
    perform testes_dblink.dblink_exec('rb', 'begin; ' || p_b_sess);
    select pid into v_pid from testes_dblink.dblink('rb', 'select pg_backend_pid()') as t(pid int);
    perform testes_dblink.dblink_send_query('rb', p_b_sql);
    if p_b_waits then
      for i in 1 .. 200 loop
        if exists (select 1 from pg_locks where pid = v_pid and not granted) then
          v_waited := true;
          exit;
        end if;
        perform pg_sleep(0.05);
      end loop;
      if not v_waited then
        raise exception 'a sessão B deveria esperar a trava da sessão A';
      end if;
    end if;
    perform testes_dblink.dblink_exec('ra', 'commit');
    begin
      select r into v_out from testes_dblink.dblink_get_result('rb') as t(r text);
      v_out := 'ok:' || coalesce(v_out, '');
    exception when others then
      v_out := sqlstate || ':' || sqlerrm;
    end;
    begin
      perform * from testes_dblink.dblink_get_result('rb') as t(r text);
    exception when others then
      null;
    end;
    -- B que terminou grava (commit); B recusada já foi desfeita pelo banco.
    perform testes_dblink.dblink_exec('rb', case when v_out like 'ok:%' then 'commit' else 'rollback' end);
    perform testes_dblink.dblink_disconnect('ra');
    perform testes_dblink.dblink_disconnect('rb');
    return v_out;
  end if;
  -- Equivalente determinístico: A termina antes de B.
  if p_a_sess <> '' then
    execute p_a_sess;
  end if;
  execute p_a_sql;
  reset role;
  begin
    if p_b_sess <> '' then
      execute p_b_sess;
    end if;
    execute p_b_sql into v_out;
    v_out := 'ok:' || coalesce(v_out, '');
  exception when others then
    v_out := sqlstate || ':' || sqlerrm;
  end;
  reset role;
  return v_out;
end $$;

-- Com dblink, o erro exato; sem ele (A termina antes de B), B é recusada por uma guarda mais cedo (o vínculo já foi revogado, a conta já não
-- existe), então basta que seja recusada.
create function pg_temp.same_failure(p_out text, p_expected text) returns boolean language sql as $$
  select case when (select dblink from cmode) then p_out = p_expected else p_out not like 'ok:%' end
$$;

-- ---------------------------------------------------------------------------
-- S1. Tina Um passa a titularidade para Beto Um enquanto ele exclui a conta. Beto espera a trava da Família, vê que agora é titular com
-- outra pessoa ativa e recebe transferir_antes: a Família continua com um titular (antes, ele saía "como membro" e a Família ficava sem).
-- ---------------------------------------------------------------------------
do $$
declare
  o text;
  fam uuid := pg_temp.cid('f1');
  b1 uuid := pg_temp.cid('b1');
  t1 uuid := pg_temp.cid('t1');
begin
  o := pg_temp.race(pg_temp.csess('t1'), format($q$select public.transfer_family_ownership(%L, %L, 'cor-tr-s1-0001')::text$q$, fam, b1),
                    pg_temp.csess('b1'), $q$select public.delete_my_account('EXCLUIR', 'cor-del-s1-0001')::text$q$);
  assert pg_temp.same_failure(o, 'PT409:transferir_antes'), 'S1: ' || o;
  assert (select count(*) from public.context_memberships where context_id = fam and role = 'titular' and revoked_at is null) = 1
     and (select person_id from public.context_memberships where context_id = fam and role = 'titular' and revoked_at is null) = b1
     and (select owner_person_id from public.financial_contexts where id = fam) = b1, 'S1: a Família tem um titular ativo, Beto, e é dele';
  assert (select role from public.context_memberships where context_id = fam and person_id = t1 and revoked_at is null) = 'membro', 'S1: Tina segue na Família, como membro';
  assert exists (select 1 from auth.users where id = b1) and exists (select 1 from public.persons where id = b1 and deleted_at is null)
     and exists (select 1 from public.financial_contexts where id = pg_temp.cid('b1_ctx'))
     and (select count(*) from public.financial_records where context_id = pg_temp.cid('b1_ctx')) = 1, 'S1: a conta e o Pessoal de Beto seguem como estavam';
  -- Sem corrida, a mesma recusa: Beto é titular com Tina ativa.
  assert pg_temp.race('', $q$select 'x'$q$, pg_temp.csess('b1'), $q$select public.delete_my_account('EXCLUIR', 'cor-del-s1-0002')::text$q$, false) = 'PT409:transferir_antes', 'S1: sem corrida, a mesma recusa';
end $$;

-- ---------------------------------------------------------------------------
-- S2. Tina Dois passa a titularidade para Beto Dois e, em outro aparelho, exclui a conta ao mesmo tempo. Tina espera a trava da Família,
-- vê que já não é titular e sai como membro; a Família continua, com Beto como titular (antes: "titular com outras pessoas", recusa).
-- ---------------------------------------------------------------------------
do $$
declare
  o text;
  fam uuid := pg_temp.cid('f2');
  b2 uuid := pg_temp.cid('b2');
  t2 uuid := pg_temp.cid('t2');
begin
  o := pg_temp.race(pg_temp.csess('t2'), format($q$select public.transfer_family_ownership(%L, %L, 'cor-tr-s2-0001')::text$q$, fam, b2),
                    pg_temp.csess('t2'), $q$select public.delete_my_account('EXCLUIR', 'cor-del-s2-0001')::text$q$);
  assert o = 'ok:{"deleted": true}', 'S2: ' || o;
  assert (select count(*) from public.context_memberships where context_id = fam and role = 'titular' and revoked_at is null) = 1
     and (select person_id from public.context_memberships where context_id = fam and role = 'titular' and revoked_at is null) = b2
     and (select owner_person_id from public.financial_contexts where id = fam) = b2, 'S2: a Família segue com Beto como titular ativo';
  assert (select revoked_at is not null from public.context_memberships where context_id = fam and person_id = t2), 'S2: Tina saiu da Família';
  assert not exists (select 1 from auth.users where id = t2) and not exists (select 1 from public.financial_contexts where id = pg_temp.cid('t2_ctx'))
     and (select deleted_at is not null and display_name = '' from public.persons where id = t2), 'S2: a conta e o Pessoal de Tina saíram; a linha dela ficou anônima';
  assert (select count(*) from public.financial_records where context_id = fam and created_by = t2) = 1, 'S2: o que Tina anotou continua na Família';
  assert exists (select 1 from auth.users where id = b2) and (select count(*) from public.financial_records where context_id = pg_temp.cid('b2_ctx')) = 1, 'S2: Beto não perdeu nada';
end $$;

-- ---------------------------------------------------------------------------
-- S3. ensure_personal_space durante a exclusão (outro aparelho entrando de novo): espera, não acha a conta e não recria a pessoa.
-- ---------------------------------------------------------------------------
do $$
declare
  o text;
  uli uuid := pg_temp.cid('uli');
begin
  o := pg_temp.race(pg_temp.csess('uli'), $q$select public.delete_my_account('EXCLUIR', 'cor-del-s3-0001')::text$q$,
                    pg_temp.csess('uli'), $q$select public.ensure_personal_space('Conta principal')::text$q$);
  assert o = '42501:email_nao_confirmado', 'S3: ' || o;
  assert not exists (select 1 from auth.users where id = uli) and not exists (select 1 from public.persons where id = uli)
     and not exists (select 1 from public.financial_contexts where owner_person_id = uli) and not exists (select 1 from public.financial_accounts where context_id = pg_temp.cid('uli_ctx'))
     and not exists (select 1 from public.context_memberships where person_id = uli) and not exists (select 1 from public.record_operations where actor_id = uli),
    'S3: a pessoa, o Pessoal e a conta de origem não voltaram';
end $$;

-- ---------------------------------------------------------------------------
-- S4. Criar a linha de persons direto (sem passar por ensure_personal_space) enquanto o usuário é apagado: a guarda trava a linha de
-- auth.users, espera o fim da exclusão e recusa. (Antes: a guarda lia a linha que ainda não tinha saído e a pessoa renascia sem usuário.)
-- ---------------------------------------------------------------------------
do $$
declare
  o text;
  gus uuid := pg_temp.cid('gus');
begin
  o := pg_temp.race('', format($q$delete from auth.users where id = %L returning id::text$q$, gus),
                    '', format($q$insert into public.persons (id, display_name) values (%L, 'Fantasma') returning id::text$q$, gus));
  assert o = '23503:pessoa_sem_conta', 'S4: ' || o;
  assert not exists (select 1 from auth.users where id = gus) and not exists (select 1 from public.persons where id = gus), 'S4: nenhuma pessoa sem usuário';
  assert not exists (select 1 from public.persons p where p.deleted_at is null and not exists (select 1 from auth.users u where u.id = p.id)), 'S4: nenhuma pessoa viva sem usuário no banco';
end $$;

-- ---------------------------------------------------------------------------
-- S5. create_record na Família, em outro aparelho, durante a exclusão: o gravador espera a linha da pessoa, vê que ela saiu (anônima) e a
-- transação inteira dele é desfeita (conta_excluida). Nada da pessoa sobra além da anotação antiga que a regra 3 mantém.
-- ---------------------------------------------------------------------------
do $$
declare
  o text;
  fam uuid := pg_temp.cid('f5');
  b5 uuid := pg_temp.cid('b5');
begin
  o := pg_temp.race(pg_temp.csess('b5'), $q$select public.delete_my_account('EXCLUIR', 'cor-del-s5-0001')::text$q$,
                    pg_temp.csess('b5'), format($q$select (public.create_record('cor-rec-s5-0001', %L, %L, 'despesa', 3100, '2026-10-06', 'Feira fantasma', null)).id::text$q$, fam, pg_temp.cid('f5_acc')));
  assert pg_temp.same_failure(o, '42501:conta_excluida'), 'S5: ' || o;
  assert not exists (select 1 from public.financial_records where description = 'Feira fantasma'), 'S5: o registro novo não foi gravado';
  assert (select count(*) from public.financial_records where context_id = fam and created_by = b5) = 1, 'S5: sobra só a anotação antiga da Família';
  assert not exists (select 1 from public.record_operations where actor_id = b5) and not exists (select 1 from public.context_activity where person_id = b5),
    'S5: nem operação nem atividade da pessoa';
  assert (select deleted_at is not null and display_name = '' from public.persons where id = b5) and not exists (select 1 from auth.users where id = b5)
     and not exists (select 1 from public.financial_contexts where id = pg_temp.cid('b5_ctx')), 'S5: a conta saiu, o Pessoal também, e a linha dela ficou anônima';
  assert (select count(*) from public.financial_records where context_id = fam and created_by = pg_temp.cid('t5')) = 1, 'S5: Tina não perdeu nada';
end $$;

-- ---------------------------------------------------------------------------
-- S6. A mesma gravação, mas que chegou antes da exclusão: ela termina, e a exclusão espera a linha da pessoa e a leva: o registro fica na
-- Família com a autoria anônima (regra 3), e a operação e a atividade da pessoa saem com ela.
-- ---------------------------------------------------------------------------
do $$
declare
  o text;
  fam uuid := pg_temp.cid('f5');
  b6 uuid := pg_temp.cid('b6');
begin
  o := pg_temp.race(pg_temp.csess('b6'), format($q$select (public.create_record('cor-rec-s6-0001', %L, %L, 'despesa', 3200, '2026-10-06', 'Feira que chegou antes', null)).id::text$q$, fam, pg_temp.cid('f5_acc')),
                    pg_temp.csess('b6'), $q$select public.delete_my_account('EXCLUIR', 'cor-del-s6-0001')::text$q$);
  assert o = 'ok:{"deleted": true}', 'S6: ' || o;
  assert (select count(*) from public.financial_records where context_id = fam and created_by = b6) = 2
     and exists (select 1 from public.financial_records where context_id = fam and created_by = b6 and description = 'Feira que chegou antes'), 'S6: os dois registros dele ficam na Família';
  assert not exists (select 1 from public.record_operations where actor_id = b6) and not exists (select 1 from public.context_activity where person_id = b6),
    'S6: nem operação nem atividade da pessoa';
  assert (select deleted_at is not null and display_name = '' from public.persons where id = b6) and not exists (select 1 from auth.users where id = b6), 'S6: a conta saiu e a linha ficou anônima';
end $$;

-- ---------------------------------------------------------------------------
-- S7. Tina Cinco abre a Família em dezembro (a geração das contas de gasto fixo) enquanto Beto Sete, que criou o gasto fixo, exclui a
-- conta: nada é gerado em nome de quem saiu (antes, as contas de dezembro e janeiro nasciam com a autoria anônima, depois da saída).
-- ---------------------------------------------------------------------------
do $$
declare
  o text;
  fam uuid := pg_temp.cid('f5');
  ser uuid := pg_temp.cid('ser_b7');
  b7 uuid := pg_temp.cid('b7');
begin
  assert (select count(*) from public.commitments where series_id = ser) = 2, 'S7: antes, as contas de outubro e novembro';
  o := pg_temp.race(pg_temp.csess('b7'), $q$select public.delete_my_account('EXCLUIR', 'cor-del-s7-0001')::text$q$,
                    pg_temp.csess('t5', '2026-12-10'), format($q$select public.sync_series_occurrences(%L)::text$q$, fam));
  assert o = 'ok:{"created": 0, "created_overdue": 0}', 'S7: ' || o;
  assert (select count(*) from public.commitments where series_id = ser) = 2, 'S7: nenhuma conta nova em nome de quem saiu';
  assert (select deleted_at is not null from public.persons where id = b7) and not exists (select 1 from auth.users where id = b7), 'S7: a conta saiu';
  -- Sem corrida, em dezembro, a geração segue sem criar nada para a série de quem saiu.
  assert pg_temp.race('', $q$select 'x'$q$, pg_temp.csess('t5', '2026-12-10'), format($q$select public.sync_series_occurrences(%L)::text$q$, fam), false) = 'ok:{"created": 0, "created_overdue": 0}', 'S7: depois, a mesma resposta';
  assert (select count(*) from public.commitments where series_id = ser) = 2, 'S7: e continua sem conta nova';
end $$;

-- ---------------------------------------------------------------------------
-- S8. As outras funções de escrita durante a exclusão: todas terminam em record_operations, então o mesmo gatilho as desfaz por inteiro.
-- ---------------------------------------------------------------------------
do $$
declare
  o text;
  fam uuid := pg_temp.cid('f8');
  b8a uuid := pg_temp.cid('b8a');
  b8b uuid := pg_temp.cid('b8b');
  b8c uuid := pg_temp.cid('b8c');
begin
  -- set_savings_answer (grava savings_checks da pessoa, na Família).
  o := pg_temp.race(pg_temp.csess('b8a'), $q$select public.delete_my_account('EXCLUIR', 'cor-del-s8a-0001')::text$q$,
                    pg_temp.csess('b8a'), format($q$select public.set_savings_answer('cor-sav-s8a-0001', %L, 0, 'depois')::text$q$, fam));
  assert pg_temp.same_failure(o, '42501:conta_excluida'), 'S8 set_savings_answer: ' || o;
  assert not exists (select 1 from public.savings_checks where person_id = b8a) and not exists (select 1 from public.record_operations where actor_id = b8a)
     and (select deleted_at is not null from public.persons where id = b8a), 'S8 set_savings_answer: nada da pessoa sobrou';

  -- accept_family_invite (b8b saiu da Casa f8 e recebeu o convite da Casa f8d): a Casa f8d não ganha o vínculo da pessoa excluída.
  o := pg_temp.race(pg_temp.csess('b8b'), $q$select public.delete_my_account('EXCLUIR', 'cor-del-s8b-0001')::text$q$,
                    pg_temp.csess('b8b'), format($q$select public.accept_family_invite(%L, 'cor-acc-s8b-0001')::text$q$, pg_temp.ccode('code_b8b')));
  assert pg_temp.same_failure(o, '42501:sem_permissao'), 'S8 accept_family_invite: ' || o;
  assert not exists (select 1 from public.context_memberships where context_id = pg_temp.cid('f8d') and person_id = b8b)
     and not exists (select 1 from public.family_invites where context_id = pg_temp.cid('f8d') and (used_at is not null or used_by is not null))
     and not exists (select 1 from public.record_operations where actor_id = b8b), 'S8 accept_family_invite: a Casa f8d segue só com a titular, e o convite segue sem uso';

  -- accept_license (b8c aceita a licença da empresa): a licença segue convidada, sem pessoa e sem direito ao plano.
  o := pg_temp.race(pg_temp.csess('b8c'), $q$select public.delete_my_account('EXCLUIR', 'cor-del-s8c-0001')::text$q$,
                    pg_temp.csess('b8c'), format($q$select public.accept_license(%L, 'cor-lic-s8c-0001')::text$q$, pg_temp.ccode('code_b8c')));
  assert pg_temp.same_failure(o, '42501:conta_excluida'), 'S8 accept_license: ' || o;
  assert (select status from public.licenses where contract_id = pg_temp.cid('contrato') and invited_email = 'b8c@corrida-exclusao.test') = 'convidada'
     and not exists (select 1 from public.licenses where person_id = b8c) and not exists (select 1 from public.plan_entitlements where person_id = b8c)
     and not exists (select 1 from public.record_operations where actor_id = b8c) and (select deleted_at is not null from public.persons where id = b8c), 'S8 accept_license: nada da pessoa sobrou';
end $$;

-- ---------------------------------------------------------------------------
-- Limpeza: tudo que esta parte gravou (a empresa, as Famílias, o Pessoal e as pessoas, as anônimas inclusive).
-- ---------------------------------------------------------------------------
do $$
declare
  n text;
  v_dblink boolean := (select dblink from cmode);
begin
  delete from public.organizations where id = pg_temp.cid('org');
  -- Quem é membro sai antes; titulares sozinhas levam a Família e as pessoas anônimas dela.
  foreach n in array array['t1', 'b1', 'b2', 't2', 'uli', 'gus', 'b5', 'b6', 'b7', 't5', 'b8a', 'b8b', 'b8c', 't8', 't8d', 'gil8'] loop
    delete from auth.users where id = pg_temp.cid(n);
  end loop;
  if v_dblink then
    perform testes_dblink.dblink_disconnect(c) from unnest(testes_dblink.dblink_get_connections()) c;
    drop extension dblink;
    drop schema testes_dblink;
  end if;
  assert not exists (select 1 from auth.users where email like '%@corrida-exclusao.test') and not exists (select 1 from public.persons where id in (select id from cp))
     and not exists (select 1 from public.financial_contexts where id in (select id from cp) or owner_person_id in (select id from cp))
     and not exists (select 1 from public.context_memberships where person_id in (select id from cp))
     and not exists (select 1 from public.record_operations where actor_id in (select id from cp)) and not exists (select 1 from public.context_activity where person_id in (select id from cp))
     and not exists (select 1 from public.financial_records where created_by in (select id from cp)) and not exists (select 1 from public.commitments where created_by in (select id from cp))
     and not exists (select 1 from public.organizations where name = 'Empresa da Corrida do Banco') and not exists (select 1 from public.licenses where invited_email like '%@corrida-exclusao.test'),
    'a corrida não deixou nada (nem a pessoa anônima)';
end $$;
