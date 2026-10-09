-- Revisão depois de ausência, "Seus últimos meses" (D-030): atividade mantida pelo gatilho de record_operations,
-- create_series_occurrence, decide_return_review, months_overview, leitura só pela própria pessoa, guardas, restrições de
-- record_operations e privilégios. Sequências de aceite R (gastos fixos e parcelamento) e R7 (contas do ano).
-- Pessoas FICTÍCIAS: Rosa (sequência R; titular da Família da Rosa), Sílvio (Família, só leitura), Tito (Família, escreve e
-- altera o que é dos outros), Teo (externo; exemplo da Academia), Vera (RH da empresa), Yara (sequência R7, IPTU),
-- Zeca (ausências) e Uma (conta nova). Valores em centavos. Cada bloco fixa o dia de hoje (clarevo.today).
\set ON_ERROR_STOP 1
\set rosa   '''00000000-0000-0000-0000-0000000000a7'''
\set silvio '''00000000-0000-0000-0000-0000000000b7'''
\set teo    '''00000000-0000-0000-0000-0000000000c7'''
\set vera   '''00000000-0000-0000-0000-0000000000d7'''
\set yara   '''00000000-0000-0000-0000-0000000000e7'''
\set zeca   '''00000000-0000-0000-0000-0000000000f7'''
\set tito   '''00000000-0000-0000-0000-0000000000a8'''
\set uma    '''00000000-0000-0000-0000-0000000000b8'''

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

-- Exige versao_desatualizada (PT409) com o detalhe esperado.
create function pg_temp.expect_stale(p_sql text, p_detail text) returns void language plpgsql as $$
declare
  v_detail text;
begin
  begin
    execute p_sql;
  exception when others then
    get stacked diagnostics v_detail = pg_exception_detail;
    if sqlerrm = 'versao_desatualizada' and sqlstate = 'PT409' and v_detail = p_detail then return; end if;
    raise exception 'esperado versao_desatualizada (%), veio "%" (%, %) em: %', p_detail, sqlerrm, sqlstate, v_detail, p_sql;
  end;
  raise exception 'esperado versao_desatualizada, mas passou: %', p_sql;
end $$;

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

-- Confere agora as restrições adiadas (I1 e a consistência das séries). Sem isso, o rollback final nunca as dispararia.
create function pg_temp.check_links() returns void language plpgsql as $$
begin
  set constraints all immediate;
  set constraints all deferred;
end $$;

-- S1 a S9 em todas as séries, direto nas tabelas e sem a RLS (security definer), além dos gatilhos adiados.
-- S10 no contexto pedido, com o hoje atual: nenhum vencimento vivo de série depois do fim do 13º mês após o mês de hoje.
create function pg_temp.check_series(p_ctx text default null) returns void language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_end date := (date_trunc('month', current_setting('clarevo.today')::date::timestamp) + interval '14 months')::date;
begin
  perform pg_temp.check_links();
  assert not exists (select 1 from public.commitments where series_id is not null and deleted_at is null
                      group by series_id, occurrence_number having count(*) > 1), 'S1: duas ocorrências vivas com o mesmo número';
  assert not exists (select 1 from public.commitments c join public.commitment_series s on s.id = c.series_id
                      where c.context_id <> s.context_id)
     and not exists (select 1 from public.series_terms t join public.commitment_series s on s.id = t.series_id
                      where t.context_id <> s.context_id), 'S2: série, vigências e ocorrências no mesmo contexto';
  assert not exists (select 1 from public.commitments c join public.commitment_series s on s.id = c.series_id
                      where c.deleted_at is null
                        and (c.occurrence_number < s.first_number or c.occurrence_number > coalesce(s.last_number, c.occurrence_number))),
    'S4: ocorrência viva fora da série';
  assert not exists (select 1 from public.commitment_series s
                      where not exists (select 1 from public.series_terms t
                                         where t.series_id = s.id and t.superseded_at is null and t.from_number = s.first_number)
                         or exists (select 1 from public.series_terms t
                                     where t.series_id = s.id and t.superseded_at is null and t.from_number < s.first_number)),
    'S5: vigência viva no primeiro número e nenhuma antes';
  assert not exists (select 1 from public.commitments c join public.commitment_series s on s.id = c.series_id
                      where s.deleted_at is not null and c.deleted_at is null), 'S6: série excluída sem ocorrência viva';
  assert not exists (select 1 from public.commitments c join public.commitment_series s on s.id = c.series_id
                      where c.deleted_at is null
                        and date_trunc('month', c.due_on::timestamp)::date <> public.clarevo_series_month(s, c.occurrence_number)),
    'S8: vencimento no mês da ocorrência';
  assert not exists (select 1 from public.commitment_series s
                      where not coalesce((s.kind in ('mensal', 'parcelada') and s.parts_per_year is null)
                                or (s.kind = 'anual' and s.nature = 'conta' and s.installment_total is null
                                    and s.parts_per_year between 1 and 12 and s.first_number <= s.parts_per_year
                                    and (s.last_number is null or s.last_number between s.first_number - 1 and 50 * s.parts_per_year)),
                                false)), 'S9: forma das contas do ano';
  if p_ctx is not null then
    assert not exists (select 1 from public.commitments c
                        where c.context_id = pg_temp.id(p_ctx) and c.series_id is not null and c.deleted_at is null
                          and c.due_on >= v_end),
      format('S10: vencimento depois de %s em %s', v_end - 1, p_ctx);
  end if;
  assert not exists (select 1 from public.commitments where series_skipped and deleted_at is null), 'pulada sempre excluída';
end $$;

-- Contexto pedido: {recebido, pago, diferença} e {vencimento no mês, vencidas antes do mês, a pagar, quantidade}.
create function pg_temp.totals(p_ctx text, p_month date) returns bigint[] language sql as $$
  select array[received_cents, paid_cents, difference_cents] from public.month_totals(pg_temp.id(p_ctx), p_month)
$$;
create function pg_temp.to_pay(p_ctx text, p_month date) returns bigint[] language sql as $$
  select array[due_in_month_cents, overdue_before_cents, to_pay_cents, open_count] from public.month_to_pay(pg_temp.id(p_ctx), p_month)
$$;
-- Estimados dentro de "Ainda a pagar" do mês (critério de D-021(5)), somados direto de commitment_items.
create function pg_temp.estimated(p_ctx text, p_month date) returns bigint language sql as $$
  select coalesce(sum(amount_cents), 0)::bigint from public.commitment_items
   where context_id = pg_temp.id(p_ctx) and status = 'aberto' and amount_is_estimate
     and due_on < (p_month + interval '1 month')::date
     and (due_on >= p_month or date_trunc('month', current_setting('clarevo.today')::date::timestamp)::date = p_month)
$$;
-- Contas em aberto com vencimento em [p_from, p_to): {quantidade, soma, soma estimada}.
create function pg_temp.open_in(p_ctx text, p_from date, p_to date) returns bigint[] language sql as $$
  select array[count(*), coalesce(sum(amount_cents), 0), coalesce(sum(amount_cents) filter (where amount_is_estimate), 0)]::bigint[]
    from public.commitment_items
   where context_id = pg_temp.id(p_ctx) and status = 'aberto' and due_on >= p_from and due_on < p_to
$$;
create function pg_temp.sync(p_ctx text) returns jsonb language sql as $$
  select public.sync_series_occurrences(pg_temp.id(p_ctx))
$$;
-- Ocorrência viva n da série.
create function pg_temp.occ(p_series text, p_n int) returns uuid language sql as $$
  select id from public.commitment_items where series_id = pg_temp.id(p_series) and occurrence_number = p_n
$$;
-- Ocorrências vivas: "número:vencimento:valor:estimado:alterada:situação", por número.
create function pg_temp.occs(p_series text) returns text language sql as $$
  select string_agg(format('%s:%s:%s:%s:%s:%s', occurrence_number, to_char(due_on, 'YYYY-MM-DD'), amount_cents,
                           amount_is_estimate::text, series_override::text, status), ' ' order by occurrence_number)
    from public.commitment_items where series_id = pg_temp.id(p_series)
$$;
-- [{id, version}] das ocorrências vivas pedidas, como o app manda em p_expected_affected.
create function pg_temp.refs(p_series text, p_numbers int[]) returns jsonb language sql as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'version', version) order by occurrence_number), '[]'::jsonb)
    from public.commitment_items where series_id = pg_temp.id(p_series) and occurrence_number = any(p_numbers)
$$;
-- Versão atual da série e números "excluídos só neste mês" (como o app lê em series_items).
create function pg_temp.sver(p_series text) returns int language sql as $$
  select version from public.series_items where id = pg_temp.id(p_series)
$$;
create function pg_temp.skipped(p_series text) returns text language sql as $$
  select skipped_numbers::text from public.series_items where id = pg_temp.id(p_series)
$$;
-- Números "sem conta registrada" com mês em [p_from, p_to]: dentro da série, sem ocorrência viva nem pulada.
create function pg_temp.gaps(p_series text, p_from date, p_to date) returns text language sql security definer
set search_path = public, pg_temp as $$
  select coalesce(string_agg(n::text, ' ' order by n), '')
    from public.commitment_series s, generate_series(s.first_number, coalesce(s.last_number, s.first_number + 1200)) n
   where s.id = pg_temp.id(p_series)
     and public.clarevo_series_month(s, n) between p_from and p_to
     and not exists (select 1 from public.commitments c where c.series_id = s.id and c.occurrence_number = n
                       and (c.deleted_at is null or c.series_skipped))
$$;
-- Atividade ("última anotação ausência-de ausência-até") e marca da revisão, direto nas tabelas (sem a RLS).
create function pg_temp.act(p_person text, p_ctx text) returns text language sql security definer
set search_path = public, pg_temp as $$
  select format('%s %s %s', to_char(last_write_on, 'YYYY-MM-DD'), coalesce(to_char(absence_from_on, 'YYYY-MM-DD'), '-'),
                coalesce(to_char(absence_until_on, 'YYYY-MM-DD'), '-'))
    from public.context_activity where person_id = pg_temp.id(p_person) and context_id = pg_temp.id(p_ctx)
$$;
create function pg_temp.rev(p_person text, p_ctx text) returns text language sql security definer
set search_path = public, pg_temp as $$
  select format('%s %s %s v%s', to_char(reviewed_through, 'YYYY-MM-DD'), decision, to_char(decided_on, 'YYYY-MM-DD'), version)
    from public.return_reviews where person_id = pg_temp.id(p_person) and context_id = pg_temp.id(p_ctx)
$$;
-- Operações com o prefixo de chave pedido: "ação:quantidade", em ordem de ação.
create function pg_temp.ops(p_prefix text) returns text language sql security definer set search_path = public, pg_temp as $$
  select string_agg(format('%s:%s', action, n), ' ' order by action collate "C")
    from (select action, count(*) as n from public.record_operations where idempotency_key like p_prefix || '%' group by action) x
$$;
-- months_overview em texto: "AAAA-MM recebimentos/recebido gastos/pago | ...".
create function pg_temp.ov(p_ctx text, p_from date, p_to date) returns text language sql as $$
  select string_agg(format('%s %s/%s %s/%s', to_char(month, 'YYYY-MM'), received_count, received_cents, paid_count, paid_cents),
                    ' | ' order by month)
    from public.months_overview(pg_temp.id(p_ctx), p_from, p_to)
$$;
-- months_overview igual a month_totals e às contagens de financial_records (com a RLS de quem consulta), mês a mês,
-- com um mês por linha, sem faltar nenhum.
create function pg_temp.ov_ok(p_ctx text, p_from date, p_to date) returns boolean language sql as $$
  select count(*) = 1 + (extract(year from p_to) * 12 + extract(month from p_to)) - (extract(year from p_from) * 12 + extract(month from p_from))
     and coalesce(bool_and(o.received_cents = t.received_cents and o.paid_cents = t.paid_cents
       and o.received_count = (select count(*) from public.financial_records r where r.context_id = pg_temp.id(p_ctx) and r.kind = 'receita'
                                 and r.occurred_on >= o.month and r.occurred_on < (o.month + interval '1 month')::date)
       and o.paid_count = (select count(*) from public.financial_records r where r.context_id = pg_temp.id(p_ctx) and r.kind = 'despesa'
                             and r.occurred_on >= o.month and r.occurred_on < (o.month + interval '1 month')::date)), false)
    from public.months_overview(pg_temp.id(p_ctx), p_from, p_to) o
    cross join lateral public.month_totals(pg_temp.id(p_ctx), o.month) t
$$;
-- Paga pela versão atual (como a tela) e confere os vínculos (I1 a I4) logo depois.
create function pg_temp.pay(p_key text, p_cid uuid, p_acc uuid, p_amount bigint, p_on date) returns jsonb language plpgsql as $$
declare
  res jsonb;
begin
  res := public.pay_commitment(p_key, p_cid, (select version from public.commitment_items where id = p_cid), p_acc, p_amount, p_on);
  perform pg_temp.check_links();
  return res;
end $$;
-- Registra a conta de um mês passado da série (pela versão atual da série) e devolve o id da conta.
create function pg_temp.gap(p_key text, p_series text, p_n int, p_mode text) returns uuid language plpgsql as $$
declare
  res jsonb;
begin
  res := public.create_series_occurrence(p_key, pg_temp.id(p_series), pg_temp.sver(p_series), p_n, p_mode);
  perform pg_temp.check_links();
  return (res #>> '{commitment,id}')::uuid;
end $$;

insert into ids values ('rosa', :rosa), ('silvio', :silvio), ('teo', :teo), ('vera', :vera), ('yara', :yara), ('zeca', :zeca),
  ('tito', :tito), ('uma', :uma);
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  (:rosa,   'rosa@exemplo.test',   now(), '{"display_name":"Rosa"}'),
  (:silvio, 'silvio@exemplo.test', now(), '{"display_name":"Sílvio"}'),
  (:teo,    'teo@exemplo.test',    now(), '{"display_name":"Teo"}'),
  (:vera,   'vera@empresa.test',   now(), '{"display_name":"Vera"}'),
  (:yara,   'yara@exemplo.test',   now(), '{"display_name":"Yara"}'),
  (:zeca,   'zeca@exemplo.test',   now(), '{"display_name":"Zeca"}'),
  (:tito,   'tito@exemplo.test',   now(), '{"display_name":"Tito"}'),
  (:uma,    'uma@exemplo.test',    now(), '{"display_name":"Uma"}');

-- Espaços pessoais (o primeiro acesso não grava operação nem atividade).
set role authenticated;
do $$
declare
  p text;
  space jsonb;
begin
  foreach p in array array['rosa', 'silvio', 'teo', 'vera', 'yara', 'zeca', 'tito', 'uma'] loop
    perform pg_temp.as_(p);
    space := public.ensure_personal_space('Conta principal');
    insert into ids values (p || '_ctx', (space ->> 'context_id')::uuid), (p || '_acc', (space #>> '{account,id}')::uuid);
  end loop;
end $$;
reset role;

-- Família da Rosa (Sílvio só lê; Tito escreve e altera o que é dos outros) e empresa da Vera com a licença da Rosa,
-- preparadas pelo backend.
with f as (
  insert into public.financial_contexts (kind, name, owner_person_id) values ('familia', 'Família da Rosa', :rosa) returning id
) insert into ids select 'fam', id from f;
insert into public.context_memberships (context_id, person_id, role, can_read, can_write, can_edit_others)
  select id, :rosa::uuid, 'titular'::public.membership_role, true, true, true from ids where name = 'fam'
  union all
  select id, :silvio::uuid, 'membro'::public.membership_role, true, false, false from ids where name = 'fam'
  union all
  select id, :tito::uuid, 'membro'::public.membership_role, true, true, true from ids where name = 'fam';
with c as (
  insert into public.financial_accounts (context_id, name, created_by) select id, 'Conta da casa', :rosa from ids where name = 'fam' returning id
) insert into ids select 'fam_acc', id from c;
insert into public.organizations (id, name) values ('10000000-0000-0000-0000-0000000000a7', 'Empresa Fictícia do Retorno');
insert into public.organization_admins values ('10000000-0000-0000-0000-0000000000a7', :vera);
insert into public.benefit_contracts (id, organization_id, seats, plan, starts_on)
  values ('20000000-0000-0000-0000-0000000000a7', '10000000-0000-0000-0000-0000000000a7', 10, 'familiar', '2026-05-01');
insert into public.licenses (id, contract_id, invited_email, person_id, status, activated_at)
  values ('30000000-0000-0000-0000-0000000000a7', '20000000-0000-0000-0000-0000000000a7', 'rosa@exemplo.test', :rosa, 'ativa', now());

-- ---------------------------------------------------------------------------
-- 1. Conta nova: sem atividade nem revisão (nunca recebe dados de exemplo). A primeira anotação cria a linha com o dia
-- de hoje. A geração e a decisão da revisão não contam; informar e tirar o ano, como toda escrita pelas funções, contam.
-- ---------------------------------------------------------------------------
set role authenticated;
do $$
declare
  ctx uuid := pg_temp.id('uma_ctx');
  acc uuid := pg_temp.id('uma_acc');
  res jsonb;
  rid uuid;
  cid uuid;
begin
  perform pg_temp.as_('uma');
  perform pg_temp.today('2026-10-07');
  assert pg_temp.act('uma', 'uma_ctx') is null and pg_temp.rev('uma', 'uma_ctx') is null, 'conta nova sem atividade nem revisão';
  assert (select count(*) from public.context_activity) = 0 and (select count(*) from public.return_reviews) = 0, 'nada a ler';
  assert pg_temp.sync('uma_ctx') = '{"created": 0, "created_overdue": 0}'::jsonb, 'gerar não cria nada';
  res := public.decide_return_review('rt-u-0001', ctx, 0, '2026-09-01', 'seguiu');
  assert pg_temp.act('uma', 'uma_ctx') is null, 'gerar e decidir não são anotações';
  assert pg_temp.rev('uma', 'uma_ctx') = '2026-09-01 seguiu 2026-10-07 v1', 'a decisão fica gravada mesmo assim';

  rid := (public.create_record('rt-u-0002', ctx, acc, 'despesa', 1000, '2026-10-07', 'Padaria')).id;
  assert pg_temp.act('uma', 'uma_ctx') = '2026-10-07 - -', 'primeira anotação: a linha nasce com o dia de hoje';
  assert (select count(*) from public.context_activity) = 1
     and (select (person_id, last_write_on) from public.context_activity) = (auth.uid(), '2026-10-07'::date), 'Uma lê a própria atividade';

  perform pg_temp.today('2026-10-20');
  res := public.create_series('rt-u-0003', ctx, 'anual', 'conta', 'Seguro', null, 12000, 'variavel', 31, '2026-11-01', 1, null, null, 4);
  insert into ids values ('uma_seguro', (res #>> '{series,id}')::uuid);
  res := public.create_series('rt-u-0004', ctx, 'mensal', 'conta', 'Academia', null, 12000, 'fixo', 15, '2026-11-01', 1, null, null);
  insert into ids values ('uma_academia', (res #>> '{series,id}')::uuid);
  assert pg_temp.occs('uma_seguro') = '1:2026-11-30:12000:true:false:aberto 2:2026-12-31:12000:true:false:aberto '
    '3:2027-01-31:12000:true:false:aberto 4:2027-02-28:12000:true:false:aberto', 'seguro 2026/2027 criado';
  assert pg_temp.act('uma', 'uma_ctx') = '2026-10-20 - -', 'criar série';

  perform pg_temp.today('2026-11-01');
  assert pg_temp.sync('uma_ctx') = '{"created": 1, "created_overdue": 0}'::jsonb, 'a geração cria dezembro da Academia';
  assert pg_temp.act('uma', 'uma_ctx') = '2026-10-20 - -', 'a geração não é anotação';

  perform pg_temp.today('2026-11-02');
  res := public.inform_series_year('rt-u-0005', pg_temp.id('uma_seguro'), 1, pg_temp.refs('uma_seguro', '{1,2,3,4}'), 12500);
  assert res -> 'changed' = '4'::jsonb and pg_temp.act('uma', 'uma_ctx') = '2026-11-02 - -', 'informar o valor do ano';

  perform pg_temp.today('2026-11-03');
  res := public.skip_series_year('rt-u-0006', pg_temp.id('uma_seguro'), 1, pg_temp.refs('uma_seguro', '{1,2,3,4}'));
  assert res -> 'changed' = '4'::jsonb and pg_temp.act('uma', 'uma_ctx') = '2026-11-03 - -', 'tirar as parcelas do ano';

  perform pg_temp.today('2026-11-04');
  res := public.decide_return_review('rt-u-0007', ctx, 1, '2026-10-01', 'seguiu');
  assert pg_temp.act('uma', 'uma_ctx') = '2026-11-03 - -' and pg_temp.rev('uma', 'uma_ctx') = '2026-10-01 seguiu 2026-11-04 v2',
    'decidir não é anotação';

  perform pg_temp.today('2026-11-05');
  res := public.create_commitment('rt-u-0008', ctx, 5000, '2026-11-20', 'Presente');
  cid := (res #>> '{commitment,id}')::uuid;
  assert pg_temp.act('uma', 'uma_ctx') = '2026-11-05 - -', 'anotar conta a pagar';
  perform pg_temp.today('2026-11-06');
  perform public.pay_commitment('rt-u-0009', cid, 1, acc, 5000, '2026-11-06');
  assert pg_temp.act('uma', 'uma_ctx') = '2026-11-06 - -', 'pagar';
  perform pg_temp.today('2026-11-07');
  perform public.undo_commitment_payment('rt-u-0010', cid, 2);
  assert pg_temp.act('uma', 'uma_ctx') = '2026-11-07 - -', 'desfazer o pagamento';
  perform pg_temp.today('2026-11-08');
  perform public.update_commitment('rt-u-0011', cid, 3, 5500, '2026-11-20', 'Presente', null);
  assert pg_temp.act('uma', 'uma_ctx') = '2026-11-08 - -', 'editar conta a pagar';
  perform pg_temp.today('2026-11-09');
  perform public.delete_commitment('rt-u-0012', cid, 4);
  assert pg_temp.act('uma', 'uma_ctx') = '2026-11-09 - -', 'excluir conta a pagar';
  perform pg_temp.today('2026-11-10');
  perform public.update_record('rt-u-0013', rid, 1, acc, 1200, '2026-10-07', 'Padaria', null);
  assert pg_temp.act('uma', 'uma_ctx') = '2026-11-10 - -', 'editar registro';
  perform pg_temp.today('2026-11-11');
  perform public.delete_record('rt-u-0014', rid, 2);
  assert pg_temp.act('uma', 'uma_ctx') = '2026-11-11 - -', 'excluir registro';
  perform pg_temp.today('2026-11-12');
  perform public.update_series_from('rt-u-0015', pg_temp.id('uma_academia'), 1, 2, pg_temp.refs('uma_academia', '{2}'), 'conta',
                                    'Academia', null, 13000, 'fixo', 15);
  assert pg_temp.act('uma', 'uma_ctx') = '2026-11-12 - -', 'esta e as próximas';
  perform pg_temp.today('2026-11-13');
  perform public.end_series('rt-u-0016', pg_temp.id('uma_academia'), 2, 2, '[]');
  assert pg_temp.act('uma', 'uma_ctx') = '2026-11-13 - -', 'encerrar';
  perform pg_temp.today('2026-11-14');
  perform public.delete_series('rt-u-0017', pg_temp.id('uma_academia'), 3, pg_temp.refs('uma_academia', '{1,2}'));
  assert pg_temp.act('uma', 'uma_ctx') = '2026-11-14 - -', 'excluir série';

  assert (select array_agg(distinct action collate "C" order by action collate "C") from public.record_operations)
    = array['alterar_serie', 'criar', 'criar_compromisso', 'criar_serie', 'decidir_revisao', 'desfazer_pagamento', 'editar',
            'editar_compromisso', 'encerrar_serie', 'excluir', 'excluir_compromisso', 'excluir_serie', 'informar_ano',
            'pagar_compromisso', 'tirar_ano'], 'todas as ações conferidas';
  assert pg_temp.ops('rt-u-') like '%decidir_revisao:2%', 'as duas decisões gravadas como operação';
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 2. Ausência longa: 45 dias ou mais, ou um mês inteiro fechado sem anotação (conferido como superusuário:
-- authenticated não executa as auxiliares). Depois, o gatilho em sequência (Zeca).
-- ---------------------------------------------------------------------------
do $$
declare
  zeca uuid := pg_temp.id('zeca');
begin
  -- Tabela da especificação (2.2).
  assert public.clarevo_long_absence('2026-05-20', '2026-10-07'), '20/05 a 07/10: 140 dias';
  assert not public.clarevo_long_absence('2026-09-02', '2026-10-16'), '02/09 a 16/10: 44 dias, 1 mês';
  assert public.clarevo_long_absence('2026-09-02', '2026-10-17'), '02/09 a 17/10: 45 dias';
  assert public.clarevo_long_absence('2026-08-31', '2026-10-01'), '31/08 a 01/10: setembro inteiro sem anotação';
  assert not public.clarevo_long_absence('2026-09-05', '2026-10-10'), '05/09 a 10/10: 35 dias';
  assert public.clarevo_long_absence('2025-05-20', '2026-10-07'), '20/05/2025 a 07/10/2026';
  -- Mesma data, data anterior, nulos, fevereiro.
  assert not public.clarevo_long_absence('2026-10-07', '2026-10-07') and not public.clarevo_long_absence('2026-10-07', '2026-05-20')
     and not public.clarevo_long_absence(null, '2026-10-07') and not public.clarevo_long_absence('2026-10-07', null),
    'mesma data, data anterior e nulos: não';
  assert not public.clarevo_long_absence('2026-10-15', '2026-11-28') and public.clarevo_long_absence('2026-10-15', '2026-11-29'),
    'R4: 44 dias não, 45 sim';
  assert not public.clarevo_long_absence('2026-01-31', '2026-02-28') and public.clarevo_long_absence('2026-01-31', '2026-03-01'),
    'fevereiro inteiro sem anotação (29 dias)';

  -- Dia de um instante no fuso da pessoa (carga inicial), com a proteção contra fuso inválido.
  assert public.clarevo_local_date(zeca, '2026-10-08 02:59:00+00') = '2026-10-07'
     and public.clarevo_local_date(zeca, '2026-10-08 03:00:00+00') = '2026-10-08', 'São Paulo (UTC-3)';
  update public.persons set time_zone = 'Asia/Tokyo' where id = zeca;
  assert public.clarevo_local_date(zeca, '2026-10-07 14:59:00+00') = '2026-10-07'
     and public.clarevo_local_date(zeca, '2026-10-07 15:00:00+00') = '2026-10-08', 'Tóquio (UTC+9)';
  update public.persons set time_zone = 'Fuso/Inexistente' where id = zeca;
  assert public.clarevo_local_date(zeca, '2026-10-08 02:59:00+00') = '2026-10-07', 'fuso inválido: São Paulo';
  assert public.clarevo_local_date('00000000-0000-0000-0000-000000000000', '2026-10-08 02:59:00+00') = '2026-10-07',
    'pessoa sem cadastro: São Paulo';
  update public.persons set time_zone = 'America/Sao_Paulo' where id = zeca;
end $$;

set role authenticated;
do $$
declare
  ctx uuid := pg_temp.id('zeca_ctx');
  acc uuid := pg_temp.id('zeca_acc');
  r record;
  i int := 0;
begin
  perform pg_temp.as_('zeca');
  for r in select * from (values
      ('2026-05-20'::date, '2026-05-20 - -', 'primeira anotação'),
      ('2026-10-07', '2026-10-07 2026-05-20 2026-10-07', '140 dias: ausência de 20/05 a 07/10'),
      ('2026-10-08', '2026-10-08 2026-05-20 2026-10-07', 'dia seguinte: a ausência fica'),
      ('2026-10-08', '2026-10-08 2026-05-20 2026-10-07', 'mesmo dia: nada muda'),
      ('2026-10-07', '2026-10-08 2026-05-20 2026-10-07', 'dia anterior ao último (relógio para trás): nada muda'),
      ('2026-11-21', '2026-11-21 2026-05-20 2026-10-07', '44 dias, 1 mês: não grava'),
      ('2027-01-05', '2027-01-05 2026-11-21 2027-01-05', '45 dias e dezembro inteiro: grava'),
      ('2027-02-19', '2027-02-19 2027-01-05 2027-02-19', '45 dias, 1 mês: grava'),
      ('2027-03-31', '2027-03-31 2027-01-05 2027-02-19', '40 dias, 1 mês: não grava'),
      ('2027-05-01', '2027-05-01 2027-03-31 2027-05-01', '31 dias com abril inteiro sem anotação: grava')
    ) v(d, expected, note) loop
    i := i + 1;
    perform pg_temp.today(r.d);
    perform public.create_record('rt-z-' || lpad(i::text, 4, '0'), ctx, acc, 'despesa', 1000, r.d, 'Café');
    assert pg_temp.act('zeca', 'zeca_ctx') = r.expected,
      format('%s: %s (veio %s)', r.d, r.note, pg_temp.act('zeca', 'zeca_ctx'));
  end loop;
  -- Decidir não muda a atividade.
  perform public.decide_return_review('rt-z-0100', ctx, 0, '2027-04-01', 'seguiu');
  assert pg_temp.act('zeca', 'zeca_ctx') = '2027-05-01 2027-03-31 2027-05-01', 'decidir não é anotação';
  assert (select count(*) from public.context_activity) = 1, 'Zeca lê só a própria linha';
end $$;

-- ---------------------------------------------------------------------------
-- 3. Sequência R. Montagem em 20/05/2026 (Pessoal da Rosa): S1 Aluguel (mensal, 2.500,00, dia 5, desde maio),
-- S2 Luz (mensal, valor que muda, referência 180,00, dia 12, desde maio), S3 Financiamento do carro (48 parcelas de
-- 850,00, próxima 8 em maio, dia 10). Geração de abril a junho; pagamentos e anotações de maio.
-- Família da Rosa: Internet da casa (mensal, 100,00, dia 20, desde maio), criada pela Rosa.
-- Teo: Academia (mensal, 120,00, dia 15, desde maio), exemplo do "Não houve".
-- ---------------------------------------------------------------------------
do $$
declare
  ctx uuid := pg_temp.id('rosa_ctx');
  acc uuid := pg_temp.id('rosa_acc');
  res jsonb;
begin
  perform pg_temp.as_('rosa');
  perform pg_temp.today('2026-05-20');
  res := public.create_series('rt-r-0001', ctx, 'mensal', 'conta', 'Aluguel', 'Moradia', 250000, 'fixo', 5, '2026-05-01', 1, null, null);
  insert into ids values ('aluguel', (res #>> '{series,id}')::uuid);
  res := public.create_series('rt-r-0002', ctx, 'mensal', 'conta', 'Luz', 'Moradia', 18000, 'variavel', 12, '2026-05-01', 1, null, null);
  insert into ids values ('luz', (res #>> '{series,id}')::uuid);
  res := public.create_series('rt-r-0003', ctx, 'parcelada', 'financiamento', 'Financiamento do carro', 'Transporte', 85000, 'fixo', 10,
                              '2026-05-01', 8, 48, null);
  insert into ids values ('carro', (res #>> '{series,id}')::uuid);
  assert pg_temp.occs('aluguel') = '1:2026-05-05:250000:false:false:aberto 2:2026-06-05:250000:false:false:aberto'
     and pg_temp.occs('luz') = '1:2026-05-12:18000:true:false:aberto 2:2026-06-12:18000:true:false:aberto'
     and pg_temp.occs('carro') = '8:2026-05-10:85000:false:false:aberto 9:2026-06-10:85000:false:false:aberto',
    'geração de maio e junho';
  perform pg_temp.pay('rt-r-0004', pg_temp.occ('aluguel', 1), acc, 250000, '2026-05-05');
  perform pg_temp.pay('rt-r-0005', pg_temp.occ('luz', 1), acc, 16530, '2026-05-12');
  perform pg_temp.pay('rt-r-0006', pg_temp.occ('carro', 8), acc, 85000, '2026-05-10');
  perform public.create_record('rt-r-0007', ctx, acc, 'receita', 600000, '2026-05-01', 'Salário');
  perform public.create_record('rt-r-0008', ctx, acc, 'despesa', 125000, '2026-05-15', 'Mercado');
  assert pg_temp.totals('rosa_ctx', '2026-05-01') = array[600000, 476530, 123470]::bigint[], 'maio: 6.000,00 / 4.765,30 / 1.234,70';
  assert pg_temp.act('rosa', 'rosa_ctx') = '2026-05-20 - -', 'última anotação em 20/05/2026';

  res := public.create_series('rt-r-0009', pg_temp.id('fam'), 'mensal', 'conta', 'Internet da casa', 'Moradia', 10000, 'fixo', 20,
                              '2026-05-01', 1, null, null);
  insert into ids values ('internet', (res #>> '{series,id}')::uuid);
  assert pg_temp.act('rosa', 'fam') = '2026-05-20 - -', 'atividade por contexto';
  perform pg_temp.check_series('rosa_ctx');

  perform pg_temp.as_('teo');
  res := public.create_series('rt-t-0001', pg_temp.id('teo_ctx'), 'mensal', 'conta', 'Academia', 'Saúde', 12000, 'fixo', 15,
                              '2026-05-01', 1, null, null);
  insert into ids values ('academia', (res #>> '{series,id}')::uuid);
end $$;

-- R1 · 07/10/2026, abrir: a geração cria setembro a novembro (9 contas, 4 já vencidas); nada mais muda.
do $$
declare
  ctx uuid := pg_temp.id('rosa_ctx');
  v_refs jsonb;
begin
  perform pg_temp.as_('rosa');
  perform pg_temp.today('2026-10-07');
  assert pg_temp.sync('rosa_ctx') = '{"created": 9, "created_overdue": 4}'::jsonb, 'R1: 9 contas, 4 já vencidas';
  assert pg_temp.act('rosa', 'rosa_ctx') = '2026-05-20 - -' and pg_temp.rev('rosa', 'rosa_ctx') is null,
    'a geração não é anotação; nenhuma decisão';
  -- Maio anotado; junho a setembro sem nenhuma anotação.
  assert pg_temp.ov('rosa_ctx', '2026-05-01', '2026-09-01')
    = '2026-05 1/600000 4/476530 | 2026-06 0/0 0/0 | 2026-07 0/0 0/0 | 2026-08 0/0 0/0 | 2026-09 0/0 0/0', 'R1: resumo mês a mês';
  assert pg_temp.ov_ok('rosa_ctx', '2026-05-01', '2026-10-01'), 'R1: months_overview igual a month_totals';
  -- Junho e setembro: 3 em aberto (3.530,00, com 180,00 estimados); julho e agosto: 3 sem conta registrada cada.
  assert pg_temp.open_in('rosa_ctx', '2026-06-01', '2026-07-01') = array[3, 353000, 18000]::bigint[]
     and pg_temp.open_in('rosa_ctx', '2026-09-01', '2026-10-01') = array[3, 353000, 18000]::bigint[]
     and pg_temp.open_in('rosa_ctx', '2026-07-01', '2026-09-01') = array[0, 0, 0]::bigint[], 'R1: em aberto em junho e setembro';
  assert pg_temp.gaps('aluguel', '2026-05-01', '2026-09-01') = '3 4' and pg_temp.gaps('luz', '2026-05-01', '2026-09-01') = '3 4'
     and pg_temp.gaps('carro', '2026-05-01', '2026-09-01') = '10 11', 'R1: julho e agosto sem conta registrada';
  -- Este mês: só o Aluguel de 05/10 vencido. Ao todo, 13 contas para conferir (7 em aberto e 6 sem conta registrada).
  assert pg_temp.open_in('rosa_ctx', '2026-10-01', '2026-10-07') = array[1, 250000, 0]::bigint[], 'R1: Aluguel de 05/10 vencido';
  assert pg_temp.open_in('rosa_ctx', '2026-05-01', '2026-10-07') = array[7, 956000, 36000]::bigint[], 'R1: 7 em aberto vencidas';
  -- Ainda a pagar de outubro: 3.530,00 do mês e 7.060,00 vencidas antes; 540,00 estimados.
  assert pg_temp.to_pay('rosa_ctx', '2026-10-01') = array[353000, 706000, 1059000, 9]::bigint[]
     and pg_temp.estimated('rosa_ctx', '2026-10-01') = 54000, 'R1: Ainda a pagar 10.590,00';
  -- Carro: pagas antes 7 (primeiro número 8), no Clarevo 1, sem conta registrada 2, em aberto 4; faltam 38 (32.300,00).
  assert (select (first_number, installment_total, paid_count, open_count, skipped_numbers)
            from public.series_items where id = pg_temp.id('carro')) = (8, 48, 1, 4, '[]'::jsonb), 'R1: progresso do carro';
  assert (48 - 7 - 1 - 2) * 85000 = 3230000, 'R1: faltam 38, soma 32.300,00';
  perform pg_temp.check_series('rosa_ctx');

  -- O conjunto afetado muda com uma conta registrada no passado: "esta e as próximas" com o conjunto visto antes
  -- (julho sem conta; setembro a novembro em aberto) é recusada; com o conjunto novo, passa. Tudo desfeito no fim.
  v_refs := pg_temp.refs('luz', '{5,6,7}');
  begin
    perform pg_temp.gap('rt-x-0001', 'luz', 3, 'aberta');
    assert pg_temp.sver('luz') = 1, 'registrar a conta de um mês passado não muda a versão da série';
    perform pg_temp.expect_stale(format($f$select public.update_series_from('rt-x-0002', %L, 1, 3, %L::jsonb, 'conta', 'Luz',
      'Moradia', 20000, 'variavel', 12)$f$, pg_temp.id('luz'), v_refs), 'contas_afetadas_mudaram');
    perform public.update_series_from('rt-x-0003', pg_temp.id('luz'), 1, 3, pg_temp.refs('luz', '{3,5,6,7}'), 'conta', 'Luz',
                                      'Moradia', 20000, 'variavel', 12);
    raise exception 'desfeito';
  exception when others then
    if sqlerrm <> 'desfeito' then
      raise;
    end if;
  end;
  assert pg_temp.gaps('luz', '2026-05-01', '2026-09-01') = '3 4' and pg_temp.sver('luz') = 1
     and pg_temp.act('rosa', 'rosa_ctx') = '2026-05-20 - -', 'desfeito';
end $$;

-- Ramo A (a partir de R1): Seguir adiante, uma anotação na volta e outra ausência longa.
savepoint ramo_a;
do $$
declare
  ctx uuid := pg_temp.id('rosa_ctx');
  acc uuid := pg_temp.id('rosa_acc');
  res jsonb;
begin
  perform pg_temp.as_('rosa');
  perform pg_temp.today('2026-10-07');
  -- R2 · Seguir adiante: só a decisão (versão 0 para 1); nada é criado, pago ou excluído.
  res := public.decide_return_review('rt-a-0001', ctx, 0, '2026-09-01', 'seguiu');
  assert res ->> 'decision' = 'seguiu' and (res ->> 'version')::int = 1 and res ->> 'reviewed_through' = '2026-09-01'
     and res ->> 'decided_on' = '2026-10-07' and (res ->> 'person_id')::uuid = auth.uid() and (res ->> 'context_id')::uuid = ctx,
    'R2: marca gravada';
  assert (select (action, record_id, commitment_id, target_id, request_hash) from public.record_operations where idempotency_key = 'rt-a-0001')
    is not distinct from ('decidir_revisao'::text, null::uuid, null::uuid, null::uuid,
       md5(jsonb_build_array('decidir_revisao', ctx, 0, '2026-09-01'::date, 'seguiu')::text)), 'R2: operação sem alvo, hash em JSON';
  assert pg_temp.act('rosa', 'rosa_ctx') = '2026-05-20 - -', 'R2: a última anotação continua 20/05';
  assert pg_temp.to_pay('rosa_ctx', '2026-10-01') = array[353000, 706000, 1059000, 9]::bigint[]
     and pg_temp.gaps('aluguel', '2026-05-01', '2026-09-01') = '3 4' and pg_temp.gaps('carro', '2026-05-01', '2026-09-01') = '10 11'
     and pg_temp.ov('rosa_ctx', '2026-06-01', '2026-09-01') = '2026-06 0/0 0/0 | 2026-07 0/0 0/0 | 2026-08 0/0 0/0 | 2026-09 0/0 0/0',
    'R2: nada mais muda';
  -- R3 · 15/10: Mercado 300,00. Ausência de 20/05 a 15/10; a decisão de 07/10 é posterior à âncora (sem faixa, no core).
  perform pg_temp.today('2026-10-15');
  perform public.create_record('rt-a-0002', ctx, acc, 'despesa', 30000, '2026-10-15', 'Mercado');
  assert pg_temp.act('rosa', 'rosa_ctx') = '2026-10-15 2026-05-20 2026-10-15', 'R3: ausência de 20/05 a 15/10';
  assert pg_temp.rev('rosa', 'rosa_ctx') = '2026-09-01 seguiu 2026-10-07 v1', 'R3: decisão de 07/10';
  -- R4 · 29/11, sem anotar: 45 dias desde 15/10 (a faixa volta no core, só com outubro e as vencidas de novembro).
  perform pg_temp.today('2026-11-29');
  assert pg_temp.sync('rosa_ctx') = '{"created": 3, "created_overdue": 0}'::jsonb, 'R4: a geração cria dezembro';
  assert pg_temp.act('rosa', 'rosa_ctx') = '2026-10-15 2026-05-20 2026-10-15' and pg_temp.rev('rosa', 'rosa_ctx') = '2026-09-01 seguiu 2026-10-07 v1',
    'R4: nada muda na atividade nem na marca';
end $$;
rollback to savepoint ramo_a;

-- R5 (ramo B, a partir de R1) · Atualizar agora, mês a mês, em 07/10/2026.
set role authenticated;
do $$
declare
  ctx uuid := pg_temp.id('rosa_ctx');
  acc uuid := pg_temp.id('rosa_acc');
  res jsonb;
  cid uuid;
  n_records bigint;
begin
  perform pg_temp.as_('rosa');
  perform pg_temp.today('2026-10-07');
  assert pg_temp.rev('rosa', 'rosa_ctx') is null and pg_temp.act('rosa', 'rosa_ctx') = '2026-05-20 - -', 'ramo A desfeito';
  n_records := (select count(*) from public.financial_records where context_id = ctx);

  -- Junho: lote Aluguel n2 (05/06) e carro n9 (10/06); Luz n2 "Já paguei" 171,90 em 12/06; Salário com "Dia" 1.
  perform pg_temp.pay('rt-b-0001', pg_temp.occ('aluguel', 2), acc, 250000, '2026-06-05');
  perform pg_temp.pay('rt-b-0002', pg_temp.occ('carro', 9), acc, 85000, '2026-06-10');
  perform pg_temp.pay('rt-b-0003', pg_temp.occ('luz', 2), acc, 17190, '2026-06-12');
  perform public.create_record('rt-b-0004', ctx, acc, 'receita', 600000, '2026-06-01', 'Salário');
  assert pg_temp.totals('rosa_ctx', '2026-06-01') = array[600000, 352190, 247810]::bigint[], 'junho: 6.000,00 / 3.521,90 / 2.478,10';

  -- Julho: lote com criação (Aluguel n3 e carro n10, pagos no vencimento); Luz n3 criada e paga com 179,90; Salário.
  res := public.create_series_occurrence('rt-b-0101', pg_temp.id('aluguel'), 1, 3, 'aberta');
  assert res -> 'record' = 'null'::jsonb and res #>> '{commitment,status}' = 'aberto'
     and (res #>> '{commitment,occurrence_number}')::int = 3 and (res #>> '{commitment,series_id}')::uuid = pg_temp.id('aluguel')
     and res #>> '{commitment,due_on}' = '2026-07-05' and (res #>> '{commitment,amount_cents}')::bigint = 250000
     and res #> '{commitment,amount_is_estimate}' = 'false'::jsonb and res #> '{commitment,series_skipped}' = 'false'::jsonb
     and res #> '{commitment,series_override}' = 'false'::jsonb and res #>> '{commitment,deleted_at}' is null
     and (res #>> '{commitment,created_by}')::uuid = auth.uid() and res #>> '{commitment,description}' = 'Aluguel'
     and res #>> '{commitment,category}' = 'Moradia' and res #>> '{commitment,currency}' = 'BRL'
     and res #>> '{commitment,series_kind}' = 'mensal' and res #>> '{commitment,series_nature}' = 'conta'
     and (res #>> '{commitment,version}')::int = 1 and res #>> '{commitment,paid_record_id}' is null,
    'julho do Aluguel em aberto, pela vigência do número';
  assert (select (action, commitment_id, target_id, record_id, request_hash) from public.record_operations where idempotency_key = 'rt-b-0101')
    is not distinct from ('criar_ocorrencia'::text, (res #>> '{commitment,id}')::uuid, pg_temp.id('aluguel'), null::uuid,
       md5(jsonb_build_array('criar_ocorrencia', pg_temp.id('aluguel'), 1, 3, 'aberta')::text)),
    'operação criar_ocorrencia: conta e série, sem registro; hash em JSON';
  assert (select count(*) from public.financial_records where context_id = ctx) = n_records + 4, 'registrar a conta não grava gasto (R6)';
  perform pg_temp.check_links();
  perform pg_temp.pay('rt-b-0102', (res #>> '{commitment,id}')::uuid, acc, 250000, '2026-07-05');
  cid := pg_temp.gap('rt-b-0103', 'carro', 10, 'aberta');
  assert (select (due_on, amount_cents, amount_is_estimate, series_kind, series_installment_total) from public.commitment_items where id = cid)
    = ('2026-07-10'::date, 85000::bigint, false, 'parcelada'::text, 48), 'parcela 10 de 48 em 10/07/2026';
  perform pg_temp.pay('rt-b-0104', cid, acc, 85000, '2026-07-10');
  cid := pg_temp.gap('rt-b-0105', 'luz', 3, 'aberta');
  assert (select (due_on, amount_cents, amount_is_estimate) from public.commitment_items where id = cid)
    = ('2026-07-12'::date, 18000::bigint, true), 'Luz de julho: cerca de 180,00 (estimado)';
  perform pg_temp.pay('rt-b-0106', cid, acc, 17990, '2026-07-12');
  perform public.create_record('rt-b-0107', ctx, acc, 'receita', 600000, '2026-07-01', 'Salário');
  assert pg_temp.totals('rosa_ctx', '2026-07-01') = array[600000, 352990, 247010]::bigint[], 'julho: 6.000,00 / 3.529,90 / 2.470,10';

  -- Agosto: lote Aluguel n4 e carro n11; Luz n4 "Ainda não paguei" (em aberto, 180,00 estimados); recebimentos pulados.
  cid := pg_temp.gap('rt-b-0201', 'aluguel', 4, 'aberta');
  perform pg_temp.pay('rt-b-0202', cid, acc, 250000, '2026-08-05');
  cid := pg_temp.gap('rt-b-0203', 'carro', 11, 'aberta');
  perform pg_temp.pay('rt-b-0204', cid, acc, 85000, '2026-08-10');
  cid := pg_temp.gap('rt-b-0205', 'luz', 4, 'aberta');
  assert (select (status, due_on, amount_is_estimate) from public.commitment_items where id = cid)
    = ('aberto'::public.commitment_status, '2026-08-12'::date, true), 'Luz de agosto registrada em aberto';
  assert pg_temp.totals('rosa_ctx', '2026-08-01') = array[0, 335000, -335000]::bigint[], 'agosto: 0 / 3.350,00 / -3.350,00';

  -- Setembro: lote Aluguel n5 e carro n12; Luz n5 194,20; Salário.
  perform pg_temp.pay('rt-b-0301', pg_temp.occ('aluguel', 5), acc, 250000, '2026-09-05');
  perform pg_temp.pay('rt-b-0302', pg_temp.occ('carro', 12), acc, 85000, '2026-09-10');
  perform pg_temp.pay('rt-b-0303', pg_temp.occ('luz', 5), acc, 19420, '2026-09-12');
  perform public.create_record('rt-b-0304', ctx, acc, 'receita', 600000, '2026-09-01', 'Salário');
  assert pg_temp.totals('rosa_ctx', '2026-09-01') = array[600000, 354420, 245580]::bigint[], 'setembro: 6.000,00 / 3.544,20 / 2.455,80';

  -- Este mês: Aluguel n6 pago em 05/10. Concluir.
  perform pg_temp.pay('rt-b-0401', pg_temp.occ('aluguel', 6), acc, 250000, '2026-10-05');
  res := public.decide_return_review('rt-b-0901', ctx, 0, '2026-09-01', 'atualizou');
  assert res ->> 'decision' = 'atualizou' and (res ->> 'version')::int = 1 and res ->> 'reviewed_through' = '2026-09-01'
     and res ->> 'decided_on' = '2026-10-07', 'Concluir: versão 1, atualizou';

  -- Resultado de R5.
  assert pg_temp.totals('rosa_ctx', '2026-10-01') = array[0, 250000, -250000]::bigint[], 'outubro: Pago 2.500,00';
  assert pg_temp.to_pay('rosa_ctx', '2026-10-01') = array[103000, 18000, 121000, 3]::bigint[]
     and pg_temp.estimated('rosa_ctx', '2026-10-01') = 36000, 'Ainda a pagar 1.210,00 (1.030,00 do mês e a Luz de agosto), 360,00 estimados';
  assert pg_temp.gaps('aluguel', '2026-05-01', '2026-09-01') = '' and pg_temp.gaps('luz', '2026-05-01', '2026-09-01') = ''
     and pg_temp.gaps('carro', '2026-05-01', '2026-09-01') = '', 'nenhuma conta sem registro';
  assert (select (paid_count, open_count, skipped_numbers) from public.series_items where id = pg_temp.id('carro')) = (5, 2, '[]'::jsonb)
     and (select (occurrence_number, due_on) from public.commitment_items
           where series_id = pg_temp.id('carro') and status = 'aberto' order by occurrence_number limit 1) = (13, '2026-10-10'::date),
    'carro: pagas antes 7, no Clarevo 5, sem conta 0, faltam 36; próxima parcela 13 em 10/10/2026';
  assert (48 - 7 - 5) * 85000 = 3060000, 'carro: faltam 36, soma 30.600,00';
  assert (select skipped_numbers from public.series_items where id = pg_temp.id('aluguel')) = '[]'::jsonb
     and (select skipped_numbers from public.series_items where id = pg_temp.id('luz')) = '[]'::jsonb, 'nada excluído';
  assert pg_temp.act('rosa', 'rosa_ctx') = '2026-10-07 2026-05-20 2026-10-07', 'atividade: ausência de 20/05 a 07/10';
  assert pg_temp.rev('rosa', 'rosa_ctx') = '2026-09-01 atualizou 2026-10-07 v1', 'decisão versão 1, atualizou';
  assert pg_temp.ops('rt-b-') = 'criar:3 criar_ocorrencia:6 decidir_revisao:1 pagar_compromisso:12', 'operações de R5';
  assert (select count(*) from public.record_operations o join public.financial_records r on r.id = o.record_id
           where o.idempotency_key like 'rt-b-%' and o.action = 'pagar_compromisso' and r.commitment_id = o.commitment_id
             and r.deleted_at is null and r.kind = 'despesa') = 12, '12 gastos gerados, um por pagamento';
  assert not exists (select 1 from public.record_operations where action in ('criar_ocorrencia', 'decidir_revisao') and record_id is not null),
    'nenhuma operação nova aponta para registro';
  assert pg_temp.ov('rosa_ctx', '2026-05-01', '2026-10-01')
    = '2026-05 1/600000 4/476530 | 2026-06 1/600000 3/352190 | 2026-07 1/600000 3/352990 | 2026-08 0/0 2/335000 | '
      '2026-09 1/600000 3/354420 | 2026-10 0/0 1/250000', 'resumo mês a mês depois de atualizar';
  assert pg_temp.ov_ok('rosa_ctx', '2026-05-01', '2026-10-01'), 'months_overview igual a month_totals';
  perform pg_temp.check_series('rosa_ctx');
end $$;

-- R6 · erros, depois de R5 (07/10/2026). Recusas não gravam nada.
do $$
declare
  ctx uuid := pg_temp.id('rosa_ctx');
  n_ops bigint;
  n_items bigint;
  res jsonb;
begin
  perform pg_temp.as_('rosa');
  perform pg_temp.today('2026-10-07');
  n_ops := (select count(*) from public.record_operations);
  n_items := (select count(*) from public.commitment_items where context_id = ctx);
  perform pg_temp.expect_error(format($f$select public.create_series_occurrence('rt-e-0001', %L, 1, 3, 'aberta')$f$,
    pg_temp.id('aluguel')), 'ocorrencia_existente');
  perform pg_temp.expect_error(format($f$select public.create_series_occurrence('rt-e-0002', %L, 1, 6, 'aberta')$f$,
    pg_temp.id('aluguel')), 'mes_fora_da_revisao');
  perform pg_temp.expect_error(format($f$select public.create_series_occurrence('rt-e-0003', %L, 1, 7, 'aberta')$f$,
    pg_temp.id('carro')), 'numero_fora_da_serie');
  perform pg_temp.expect_stale(format($f$select public.create_series_occurrence('rt-e-0004', %L, 2, 3, 'aberta')$f$,
    pg_temp.id('aluguel')), 'versao_atual=1');
  perform pg_temp.expect_error(format($f$select public.create_series_occurrence('rt-b-0101', %L, 1, 3, 'nao_houve')$f$,
    pg_temp.id('aluguel')), 'chave_reutilizada');
  perform pg_temp.expect_stale(format($f$select public.decide_return_review('rt-e-0005', %L, 0, '2026-09-01', 'seguiu')$f$, ctx),
    'versao_atual=1');
  perform pg_temp.expect_error(format($f$select public.decide_return_review('rt-e-0006', %L, 1, '2026-10-01', 'seguiu')$f$, ctx),
    'mes_invalido');
  perform pg_temp.expect_error(format($f$select public.decide_return_review('rt-e-0007', %L, 1, '2025-10-01', 'seguiu')$f$, ctx),
    'mes_invalido');
  perform pg_temp.expect_error(format($f$select public.decide_return_review('rt-e-0008', %L, 1, '2026-09-01', 'talvez')$f$, ctx),
    'decisao_invalida');
  assert (select count(*) from public.record_operations) = n_ops and (select count(*) from public.commitment_items where context_id = ctx) = n_items
     and pg_temp.rev('rosa', 'rosa_ctx') = '2026-09-01 atualizou 2026-10-07 v1', 'recusas não gravam nada';

  -- Seguir com um mês anterior: o mês revisado não recua (2026-09-01 continua); a versão sobe.
  res := public.decide_return_review('rt-e-0009', ctx, 1, '2026-08-01', 'seguiu');
  assert res ->> 'reviewed_through' = '2026-09-01' and (res ->> 'version')::int = 2 and res ->> 'decision' = 'seguiu',
    'reviewed_through continua 2026-09-01';
  assert pg_temp.rev('rosa', 'rosa_ctx') = '2026-09-01 seguiu 2026-10-07 v2', 'marca versão 2';

  -- Repetições: mesma chave e mesmo pedido devolvem o resultado sem gravar nada (a conta e a marca como estão agora).
  n_ops := (select count(*) from public.record_operations);
  res := public.create_series_occurrence('rt-b-0101', pg_temp.id('aluguel'), 1, 3, 'aberta');
  assert (res #>> '{commitment,id}')::uuid = pg_temp.occ('aluguel', 3) and res #>> '{commitment,status}' = 'quitado'
     and res -> 'record' = 'null'::jsonb, 'repetição: a mesma conta, já paga';
  res := public.decide_return_review('rt-b-0901', ctx, 0, '2026-09-01', 'atualizou');
  assert (res ->> 'version')::int = 2 and res ->> 'decision' = 'seguiu', 'repetição da decisão: a marca atual';
  assert (select count(*) from public.record_operations) = n_ops
     and (select count(*) from public.commitment_items where context_id = ctx) = n_items, 'repetições não gravam nada';
end $$;

-- R7 · contas do ano. Yara cria o IPTU (10 parcelas, fevereiro, dia 10, desde 2027, referência 180,00, muda) em 07/10/2026,
-- sua última anotação; ninguém abre o app até 15/06/2028.
do $$
declare
  ctx uuid := pg_temp.id('yara_ctx');
  acc uuid := pg_temp.id('yara_acc');
  res jsonb;
  cid uuid;
begin
  perform pg_temp.as_('yara');
  perform pg_temp.today('2026-10-07');
  res := public.create_series('rt-y-0001', ctx, 'anual', 'conta', 'IPTU', 'Moradia', 18000, 'variavel', 10, '2027-02-01', 1, null, null, 10);
  insert into ids values ('iptu', (res #>> '{series,id}')::uuid);
  assert res -> 'changed' = '0'::jsonb and pg_temp.act('yara', 'yara_ctx') = '2026-10-07 - -', 'IPTU sem parcela criada; última anotação';

  -- R7.1 · 15/06/2028, abrir: n14 a n20, 2 vencidas (10/05 e 10/06/2028). Período de julho de 2027 a maio de 2028.
  perform pg_temp.today('2028-06-15');
  assert pg_temp.sync('yara_ctx') = '{"created": 7, "created_overdue": 2}'::jsonb, 'R7.1: 7 contas, 2 vencidas';
  assert pg_temp.occs('iptu') = '14:2028-05-10:18000:true:false:aberto 15:2028-06-10:18000:true:false:aberto '
    '16:2028-07-10:18000:true:false:aberto 17:2028-08-10:18000:true:false:aberto 18:2028-09-10:18000:true:false:aberto '
    '19:2028-10-10:18000:true:false:aberto 20:2028-11-10:18000:true:false:aberto', 'R7.1: n14 a n20';
  assert pg_temp.act('yara', 'yara_ctx') = '2026-10-07 - -', 'R7.1: a geração não é anotação';
  assert pg_temp.gaps('iptu', '2027-07-01', '2028-05-01') = '6 7 8 9 10 11 12 13',
    'R7.1: IPTU de 2027 (n6 a n10) e de 2028 (n11 a n13) sem conta registrada';
  assert pg_temp.gaps('iptu', '2026-10-01', '2027-06-01') = '1 2 3 4 5', 'antes do corte (julho de 2027): fora do período';
  assert pg_temp.open_in('yara_ctx', '2028-05-01', '2028-06-01') = array[1, 18000, 18000]::bigint[]
     and pg_temp.open_in('yara_ctx', '2028-06-01', '2028-06-15') = array[1, 18000, 18000]::bigint[],
    'R7.1: maio com n14 em aberto; este mês, n15 vencida em 10/06';
  assert pg_temp.to_pay('yara_ctx', '2028-06-01') = array[18000, 18000, 36000, 2]::bigint[]
     and pg_temp.estimated('yara_ctx', '2028-06-01') = 36000, 'R7.1: Ainda a pagar de junho 360,00, todos estimados';
  assert (select count(*) from public.months_overview(ctx, '2027-07-01', '2028-05-01')
           where received_count = 0 and received_cents = 0 and paid_count = 0 and paid_cents = 0) = 11, 'R7.1: 11 meses sem anotação';

  -- R7.2 · "Não houve" em n6 (julho de 2027): conta gravada excluída só naquele mês; a geração não recria.
  res := public.create_series_occurrence('rt-y-0002', pg_temp.id('iptu'), 1, 6, 'nao_houve');
  assert res #>> '{commitment,deleted_at}' is not null and res #> '{commitment,series_skipped}' = 'true'::jsonb
     and (res #>> '{commitment,deleted_by}')::uuid = auth.uid() and res #>> '{commitment,status}' = 'aberto'
     and res #>> '{commitment,due_on}' = '2027-07-10' and (res #>> '{commitment,occurrence_number}')::int = 6
     and (res #>> '{commitment,series_parts_per_year}')::int = 10 and res -> 'record' = 'null'::jsonb, 'R7.2: n6 não houve';
  assert pg_temp.skipped('iptu') = '[6]' and pg_temp.occ('iptu', 6) is null
     and pg_temp.gaps('iptu', '2027-07-01', '2028-05-01') = '7 8 9 10 11 12 13', 'R7.2: n6 fica de fora das contas e das lacunas';
  assert pg_temp.sync('yara_ctx') = '{"created": 0, "created_overdue": 0}'::jsonb, 'R7.2: gerar de novo não cria nada';
  perform pg_temp.check_links();

  -- R7.3 · "Já paguei" em n7 com 189,90 em 10/08/2027.
  cid := pg_temp.gap('rt-y-0003', 'iptu', 7, 'aberta');
  assert (select (due_on, amount_cents, amount_is_estimate) from public.commitment_items where id = cid)
    = ('2027-08-10'::date, 18000::bigint, true), 'R7.3: n7 em 10/08/2027, cerca de 180,00';
  perform pg_temp.pay('rt-y-0004', cid, acc, 18990, '2027-08-10');
  assert pg_temp.totals('yara_ctx', '2027-08-01') = array[0, 18990, -18990]::bigint[], 'R7.3: Pago de agosto de 2027 = 189,90';
  assert (select (paid_count, open_count) from public.series_items where id = pg_temp.id('iptu')) = (1, 7), 'R7.3: 1 paga, 7 em aberto';
  assert pg_temp.ov_ok('yara_ctx', '2027-07-01', '2028-05-01'), 'R7.3: months_overview igual a month_totals';

  -- R7.4 · erros: n5 (junho de 2027, 12 meses antes), n15 (este mês), n16 (mês seguinte), n14 (viva), n6 (pulada).
  perform pg_temp.expect_error(format($f$select public.create_series_occurrence('rt-y-0005', %L, 1, 5, 'aberta')$f$, pg_temp.id('iptu')),
    'mes_fora_da_revisao');
  perform pg_temp.expect_error(format($f$select public.create_series_occurrence('rt-y-0006', %L, 1, 15, 'aberta')$f$, pg_temp.id('iptu')),
    'mes_fora_da_revisao');
  perform pg_temp.expect_error(format($f$select public.create_series_occurrence('rt-y-0007', %L, 1, 16, 'aberta')$f$, pg_temp.id('iptu')),
    'mes_fora_da_revisao');
  perform pg_temp.expect_error(format($f$select public.create_series_occurrence('rt-y-0008', %L, 1, 14, 'aberta')$f$, pg_temp.id('iptu')),
    'ocorrencia_existente');
  perform pg_temp.expect_error(format($f$select public.create_series_occurrence('rt-y-0009', %L, 1, 6, 'aberta')$f$, pg_temp.id('iptu')),
    'ocorrencia_existente');

  -- Grupo de 2027 em aberto: "Ainda não paguei" em n8 muda o conjunto do ano (informar e tirar com o conjunto antigo
  -- são recusados); "Não houve em 2027" (skip_series_year, A3) tira a parcela em aberto.
  perform pg_temp.gap('rt-y-0010', 'iptu', 8, 'aberta');
  perform pg_temp.expect_stale(format($f$select public.inform_series_year('rt-y-0011', %L, 8, '[]', 19000)$f$, pg_temp.id('iptu')),
    'contas_afetadas_mudaram');
  perform pg_temp.expect_stale(format($f$select public.skip_series_year('rt-y-0012', %L, 8, '[]')$f$, pg_temp.id('iptu')),
    'contas_afetadas_mudaram');
  res := public.skip_series_year('rt-y-0013', pg_temp.id('iptu'), 8, pg_temp.refs('iptu', '{8}'));
  assert res -> 'changed' = '1'::jsonb and pg_temp.skipped('iptu') = '[6, 8]'
     and pg_temp.gaps('iptu', '2027-07-01', '2028-05-01') = '9 10 11 12 13', 'Não houve em 2027: n8 tirada';
  assert pg_temp.act('yara', 'yara_ctx') = '2028-06-15 2026-10-07 2028-06-15', 'R7: ausência de 07/10/2026 a 15/06/2028';
  perform pg_temp.check_series('yara_ctx');
end $$;

-- ---------------------------------------------------------------------------
-- 4. create_series_occurrence: demais recusas, exemplo da Academia, autoria e permissões.
-- ---------------------------------------------------------------------------
do $$
declare
  ctx uuid := pg_temp.id('rosa_ctx');
  n_ops bigint;
  n_records bigint;
  res jsonb;
  sid uuid;
begin
  perform pg_temp.as_('rosa');
  perform pg_temp.today('2026-10-07');
  n_ops := (select count(*) from public.record_operations);
  -- Modo, número, versão e chave.
  perform pg_temp.expect_error(format($f$select public.create_series_occurrence('rt-c-0001', %L, 1, 4, 'paga')$f$, pg_temp.id('luz')),
    'modo_invalido');
  perform pg_temp.expect_error(format($f$select public.create_series_occurrence('rt-c-0002', %L, 1, 4, null)$f$, pg_temp.id('luz')),
    'modo_invalido');
  perform pg_temp.expect_error(format($f$select public.create_series_occurrence('rt-c-0003', %L, 1, null, 'aberta')$f$, pg_temp.id('luz')),
    'numero_fora_da_serie');
  perform pg_temp.expect_error(format($f$select public.create_series_occurrence('rt-c-0004', %L, 1, 49, 'aberta')$f$, pg_temp.id('carro')),
    'numero_fora_da_serie');
  perform pg_temp.expect_error(format($f$select public.create_series_occurrence('rt-c-0005', %L, 1, 0, 'aberta')$f$, pg_temp.id('aluguel')),
    'numero_fora_da_serie');
  perform pg_temp.expect_error(format($f$select public.create_series_occurrence('rt-c-0006', %L, 1, 2147483647, 'aberta')$f$,
    pg_temp.id('aluguel')), 'mes_fora_da_revisao');
  perform pg_temp.expect_stale(format($f$select public.create_series_occurrence('rt-c-0007', %L, null, 3, 'aberta')$f$, pg_temp.id('aluguel')),
    'versao_atual=1');
  perform pg_temp.expect_error(format($f$select public.create_series_occurrence('curta', %L, 1, 3, 'aberta')$f$, pg_temp.id('aluguel')),
    'chave_invalida');
  perform pg_temp.expect_error(format($f$select public.create_series_occurrence(null, %L, 1, 3, 'aberta')$f$, pg_temp.id('aluguel')),
    'chave_invalida');
  perform pg_temp.expect_error($f$select public.create_series_occurrence('rt-c-0008', null, 1, 3, 'aberta')$f$, 'nao_encontrado');
  -- Mesmo espaço de chaves das outras ações, nos dois sentidos.
  perform pg_temp.expect_error(format($f$select public.create_series_occurrence('rt-r-0007', %L, 1, 3, 'aberta')$f$, pg_temp.id('aluguel')),
    'chave_reutilizada');
  perform pg_temp.expect_error(format($f$select public.create_series_occurrence('rt-b-0901', %L, 1, 3, 'aberta')$f$, pg_temp.id('aluguel')),
    'chave_reutilizada');
  perform pg_temp.expect_error(format($f$select public.create_commitment('rt-b-0101', %L, 100, '2026-10-20', 'x')$f$, ctx),
    'chave_reutilizada');
  perform pg_temp.expect_error(format($f$select public.decide_return_review('rt-b-0101', %L, 2, '2026-09-01', 'seguiu')$f$, ctx),
    'chave_reutilizada');
  -- Série excluída: não encontrada.
  res := public.create_series('rt-c-0010', ctx, 'mensal', 'conta', 'Curso', null, 30000, 'fixo', 15, '2026-10-01', 1, null, null);
  sid := (res #>> '{series,id}')::uuid;
  insert into ids values ('curso', sid);
  perform public.delete_series('rt-c-0011', sid, 1, pg_temp.refs('curso', '{1,2}'));
  perform pg_temp.expect_error(format($f$select public.create_series_occurrence('rt-c-0012', %L, 2, 1, 'aberta')$f$, sid), 'nao_encontrado');
  assert (select count(*) from public.record_operations) = n_ops + 2, 'recusas não gravam operação';

  -- Exemplo da Academia (Teo): julho e agosto sem conta registrada; "Não houve" nos dois grava os números 3 e 4 como
  -- excluídos só naquele mês. Pago de julho e agosto inalterado; nenhuma lacuna; a geração nunca recria esses números.
  -- Nenhuma função nova grava financial_records (R6).
  perform pg_temp.as_('teo');
  n_records := (select count(*) from public.financial_records where context_id = pg_temp.id('teo_ctx'));
  assert pg_temp.sync('teo_ctx') = '{"created": 3, "created_overdue": 1}'::jsonb, 'Academia: a geração cria setembro a novembro';
  assert pg_temp.gaps('academia', '2026-05-01', '2026-09-01') = '3 4', 'Academia: julho e agosto sem conta registrada';
  res := public.create_series_occurrence('rt-t-0002', pg_temp.id('academia'), 1, 3, 'nao_houve');
  res := public.create_series_occurrence('rt-t-0003', pg_temp.id('academia'), 1, 4, 'nao_houve');
  assert pg_temp.skipped('academia') = '[3, 4]' and pg_temp.gaps('academia', '2026-05-01', '2026-09-01') = '',
    'Academia: skipped_numbers [3, 4] e nenhuma lacuna';
  assert pg_temp.totals('teo_ctx', '2026-07-01') = array[0, 0, 0]::bigint[] and pg_temp.totals('teo_ctx', '2026-08-01') = array[0, 0, 0]::bigint[]
     and pg_temp.open_in('teo_ctx', '2026-07-01', '2026-09-01') = array[0, 0, 0]::bigint[], 'Academia: julho e agosto inalterados';
  perform pg_temp.today('2026-07-20');                    -- janela da geração com julho e agosto: nada é recriado
  assert pg_temp.sync('teo_ctx') = '{"created": 0, "created_overdue": 0}'::jsonb, 'a geração não recria 3 e 4';
  perform pg_temp.today('2026-10-07');
  assert (select count(*) from public.financial_records where context_id = pg_temp.id('teo_ctx')) = n_records, 'nenhum registro gravado';
  assert pg_temp.act('teo', 'teo_ctx') = '2026-10-07 2026-05-20 2026-10-07', 'Teo: ausência de 20/05 a 07/10';
  perform pg_temp.check_series('teo_ctx');
end $$;

-- Autoria: a conta leva a autoria de quem criou a série (Rosa). Tito altera o que é dos outros; sem a escrita da Rosa no
-- contexto, a conta não pode ser criada em nome dela.
reset role;
update public.context_memberships set can_write = false where context_id = pg_temp.id('fam') and person_id = :rosa;
set role authenticated;
do $$ begin
  perform pg_temp.as_('tito');
  perform pg_temp.today('2026-10-07');
  perform pg_temp.expect_error(format($f$select public.create_series_occurrence('rt-f-0001', %L, 1, 3, 'aberta')$f$, pg_temp.id('internet')),
    'sem_permissao');
  assert pg_temp.act('tito', 'fam') is null, 'recusa não é anotação';
end $$;
reset role;
update public.context_memberships set can_write = true where context_id = pg_temp.id('fam') and person_id = :rosa;
set role authenticated;
do $$
declare
  res jsonb;
begin
  perform pg_temp.as_('tito');
  perform pg_temp.today('2026-10-07');
  res := public.create_series_occurrence('rt-f-0001', pg_temp.id('internet'), 1, 3, 'aberta');
  assert (res #>> '{commitment,created_by}')::uuid = pg_temp.id('rosa') and res #>> '{commitment,due_on}' = '2026-07-20'
     and (res #>> '{commitment,amount_cents}')::bigint = 10000 and (res #>> '{commitment,context_id}')::uuid = pg_temp.id('fam'),
    'Tito registra julho da Internet da casa, com a autoria da Rosa';
  assert pg_temp.act('tito', 'fam') = '2026-10-07 - -' and pg_temp.act('rosa', 'fam') = '2026-05-20 - -',
    'a atividade é de quem anotou';
  perform pg_temp.check_series();
  -- Sílvio só lê: não registra contas; decidir a própria revisão basta leitura e não é anotação.
  perform pg_temp.as_('silvio');
  perform pg_temp.expect_error(format($f$select public.create_series_occurrence('rt-f-0002', %L, 1, 4, 'aberta')$f$, pg_temp.id('internet')),
    'sem_permissao');
  res := public.decide_return_review('rt-f-0003', pg_temp.id('fam'), 0, '2026-09-01', 'seguiu');
  assert (res ->> 'person_id')::uuid = pg_temp.id('silvio') and pg_temp.act('silvio', 'fam') is null
     and pg_temp.rev('silvio', 'fam') = '2026-09-01 seguiu 2026-10-07 v1', 'Sílvio decide a própria revisão';
  -- Teo (externo): a série da Rosa não existe para ele.
  perform pg_temp.as_('teo');
  perform pg_temp.expect_error(format($f$select public.create_series_occurrence('rt-f-0004', %L, 1, 4, 'aberta')$f$, pg_temp.id('luz')),
    'nao_encontrado');
  perform pg_temp.expect_error(format($f$select public.create_series_occurrence('rt-f-0005', %L, 1, 4, 'aberta')$f$, pg_temp.id('internet')),
    'nao_encontrado');
end $$;

-- ---------------------------------------------------------------------------
-- 5. decide_return_review: versão, mês, decisão, permissão, chave e datas que não recuam.
-- ---------------------------------------------------------------------------
do $$
declare
  ctx uuid := pg_temp.id('rosa_ctx');
  v_datestyle text := current_setting('datestyle');
  res jsonb;
begin
  perform pg_temp.as_('rosa');
  perform pg_temp.today('2026-10-07');
  perform pg_temp.expect_stale(format($f$select public.decide_return_review('rt-d-0001', %L, null, '2026-09-01', 'seguiu')$f$, ctx),
    'versao_atual=2');
  perform pg_temp.expect_error(format($f$select public.decide_return_review('rt-d-0002', %L, 2, '2026-09-15', 'seguiu')$f$, ctx),
    'mes_invalido');
  perform pg_temp.expect_error(format($f$select public.decide_return_review('rt-d-0003', %L, 2, null, 'seguiu')$f$, ctx), 'mes_invalido');
  perform pg_temp.expect_error(format($f$select public.decide_return_review('rt-d-0004', %L, 2, '2026-11-01', 'seguiu')$f$, ctx),
    'mes_invalido');
  perform pg_temp.expect_error(format($f$select public.decide_return_review('rt-d-0005', %L, 2, '2026-09-01', null)$f$, ctx),
    'decisao_invalida');
  perform pg_temp.expect_error(format($f$select public.decide_return_review('rt-d-0006', %L, 0, '2026-09-01', 'seguiu')$f$,
    pg_temp.id('teo_ctx')), 'sem_permissao');
  perform pg_temp.expect_error($f$select public.decide_return_review('rt-d-0007', null, 0, '2026-09-01', 'seguiu')$f$, 'sem_permissao');
  perform pg_temp.expect_error(format($f$select public.decide_return_review('curta', %L, 2, '2026-09-01', 'seguiu')$f$, ctx), 'chave_invalida');
  -- Mesma chave com outro pedido; repetição com outro DateStyle (a data entra em ISO no hash).
  perform pg_temp.expect_error(format($f$select public.decide_return_review('rt-e-0009', %L, 1, '2026-08-01', 'atualizou')$f$, ctx),
    'chave_reutilizada');
  perform set_config('datestyle', 'SQL, DMY', true);
  res := public.decide_return_review('rt-e-0009', ctx, 1, '2026-08-01', 'seguiu');
  perform set_config('datestyle', v_datestyle, true);
  assert (res ->> 'version')::int = 2, 'repetição com outro DateStyle reconhecida';
  assert pg_temp.rev('rosa', 'rosa_ctx') = '2026-09-01 seguiu 2026-10-07 v2', 'nada mudou';

  -- Teo: o mais antigo aceito é 11 meses antes do mês atual; o mês revisado e o dia da decisão nunca recuam
  -- (relógio para trás num segundo aparelho).
  perform pg_temp.as_('teo');
  perform pg_temp.expect_error(format($f$select public.decide_return_review('rt-d-0101', %L, 0, '2025-10-01', 'seguiu')$f$,
    pg_temp.id('teo_ctx')), 'mes_invalido');
  res := public.decide_return_review('rt-d-0102', pg_temp.id('teo_ctx'), 0, '2025-11-01', 'seguiu');
  assert res ->> 'reviewed_through' = '2025-11-01' and (res ->> 'version')::int = 1, 'novembro de 2025: 11 meses antes';
  res := public.decide_return_review('rt-d-0103', pg_temp.id('teo_ctx'), 1, '2026-09-01', 'atualizou');
  assert pg_temp.rev('teo', 'teo_ctx') = '2026-09-01 atualizou 2026-10-07 v2', 'avança';
  perform pg_temp.today('2026-09-30');
  res := public.decide_return_review('rt-d-0104', pg_temp.id('teo_ctx'), 2, '2026-08-01', 'seguiu');
  assert pg_temp.rev('teo', 'teo_ctx') = '2026-09-01 seguiu 2026-10-07 v3', 'mês revisado e dia da decisão não recuam';
  perform pg_temp.today('2026-10-07');
  -- Sem sessão.
  perform pg_temp.as_('ninguem');
  perform pg_temp.expect_error(format($f$select public.decide_return_review('rt-d-0201', %L, 0, '2026-09-01', 'seguiu')$f$, ctx),
    'nao_autenticado');
  perform pg_temp.expect_error(format($f$select public.create_series_occurrence('rt-d-0202', %L, 1, 3, 'aberta')$f$, pg_temp.id('luz')),
    'nao_autenticado');
end $$;

-- ---------------------------------------------------------------------------
-- 6. months_overview: igual a month_totals mês a mês; período de 1 a 12 meses; primeiro o período, depois a permissão.
-- ---------------------------------------------------------------------------
do $$
declare
  ctx uuid := pg_temp.id('rosa_ctx');
  acc uuid := pg_temp.id('rosa_acc');
  rid uuid;
begin
  perform pg_temp.as_('rosa');
  perform pg_temp.today('2026-10-07');
  assert pg_temp.ov_ok('rosa_ctx', '2025-11-01', '2026-10-01'), '12 meses: igual a month_totals';
  assert pg_temp.ov('rosa_ctx', '2026-06-01', '2026-06-01') = '2026-06 1/600000 3/352190', 'um mês';
  -- Registro excluído não conta.
  rid := (public.create_record('rt-m-0001', ctx, acc, 'despesa', 5000, '2026-06-20', 'Farmácia')).id;
  assert pg_temp.ov('rosa_ctx', '2026-06-01', '2026-06-01') = '2026-06 1/600000 4/357190', 'gasto novo em junho';
  perform public.delete_record('rt-m-0002', rid, 1);
  assert pg_temp.ov('rosa_ctx', '2026-06-01', '2026-06-01') = '2026-06 1/600000 3/352190'
     and pg_temp.ov_ok('rosa_ctx', '2026-05-01', '2026-10-01'), 'gasto excluído some';
  perform pg_temp.expect_error(format($f$select * from public.months_overview(%L, '2025-10-01', '2026-10-01')$f$, ctx), 'periodo_invalido');
  perform pg_temp.expect_error(format($f$select * from public.months_overview(%L, '2026-09-01', '2026-05-01')$f$, ctx), 'periodo_invalido');
  perform pg_temp.expect_error(format($f$select * from public.months_overview(%L, '2026-05-02', '2026-06-01')$f$, ctx), 'periodo_invalido');
  perform pg_temp.expect_error(format($f$select * from public.months_overview(%L, '2026-05-01', '2026-06-30')$f$, ctx), 'periodo_invalido');
  perform pg_temp.expect_error(format($f$select * from public.months_overview(%L, null, '2026-06-01')$f$, ctx), 'periodo_invalido');
  perform pg_temp.expect_error(format($f$select * from public.months_overview(%L, '2026-05-01', null)$f$, ctx), 'periodo_invalido');
  -- Datas não finitas: recusadas (antes, 'infinity' nas duas pontas nunca terminava).
  perform pg_temp.expect_error(format($f$select * from public.months_overview(%L, 'infinity', 'infinity')$f$, ctx), 'periodo_invalido');
  perform pg_temp.expect_error(format($f$select * from public.months_overview(%L, '-infinity', '-infinity')$f$, ctx), 'periodo_invalido');
  perform pg_temp.expect_error(format($f$select * from public.months_overview(%L, '-infinity', 'infinity')$f$, ctx), 'periodo_invalido');
  perform pg_temp.expect_error(format($f$select * from public.months_overview(%L, '2026-05-01', 'infinity')$f$, ctx), 'periodo_invalido');
  perform pg_temp.expect_error(format($f$select * from public.months_overview(%L, 'infinity', 'infinity')$f$, pg_temp.id('teo_ctx')),
    'periodo_invalido');
  perform pg_temp.expect_error(format($f$select * from public.months_overview(%L, '2026-05-01', '2026-09-01')$f$, pg_temp.id('teo_ctx')),
    'sem_permissao');
  perform pg_temp.expect_error($f$select * from public.months_overview(null, '2026-05-01', '2026-09-01')$f$, 'sem_permissao');
  perform pg_temp.expect_error(format($f$select * from public.months_overview(%L, '2026-09-01', '2026-05-01')$f$, pg_temp.id('teo_ctx')),
    'periodo_invalido');
end $$;

-- ---------------------------------------------------------------------------
-- 7. Leitura: atividade e revisão só da própria pessoa, só enquanto lê o contexto. Nem Família, nem empresa.
-- ---------------------------------------------------------------------------
do $$ begin
  perform pg_temp.today('2026-10-07');
  perform pg_temp.as_('rosa');
  assert (select array_agg(context_id order by context_id) from public.context_activity)
         = (select array_agg(id order by id) from ids where name in ('rosa_ctx', 'fam'))
     and not exists (select 1 from public.context_activity where person_id <> auth.uid()), 'Rosa lê só as próprias linhas';
  assert (select count(*) from public.return_reviews) = 1 and (select count(*) from public.return_reviews where context_id = pg_temp.id('fam')) = 0,
    'Rosa não lê a decisão do Sílvio na Família';
  perform pg_temp.as_('tito');
  assert (select count(*) from public.context_activity) = 1 and (select person_id from public.context_activity) = auth.uid(),
    'Tito lê só a própria atividade na Família';
  perform pg_temp.as_('silvio');
  assert (select count(*) from public.context_activity) = 0 and (select count(*) from public.return_reviews) = 1,
    'Sílvio não lê a atividade da Rosa nem a do Tito; lê a própria decisão';
  perform pg_temp.as_('teo');
  assert (select count(*) from public.context_activity) = 1 and (select context_id from public.context_activity) = pg_temp.id('teo_ctx')
     and (select count(*) from public.return_reviews) = 1, 'Teo lê só o que é dele';
  perform pg_temp.expect_error(format($f$select * from public.months_overview(%L, '2026-05-01', '2026-09-01')$f$, pg_temp.id('rosa_ctx')),
    'sem_permissao');
  perform pg_temp.expect_error(format($f$select public.decide_return_review('rt-l-0001', %L, 0, '2026-09-01', 'seguiu')$f$,
    pg_temp.id('rosa_ctx')), 'sem_permissao');
  -- Vera (RH da empresa): vê a licença, não vê atividade, revisão nem números somados de ninguém.
  perform pg_temp.as_('vera');
  assert (select count(*) from public.licenses) = 1, 'Vera vê a licença da empresa';
  assert (select count(*) from public.context_activity) = 0 and (select count(*) from public.return_reviews) = 0,
    'Vera não lê atividade nem revisão';
  -- A permissão vem antes de qualquer filtro de quem consulta: uma divisão por zero não revela as datas dos outros.
  assert (select count(*) from public.context_activity
           where 1 / (extract(day from last_write_on)::int - extract(day from last_write_on)::int) = 1) = 0
     and (select count(*) from public.return_reviews where 1 / (version - version) = 1) = 0,
    'filtro de quem consulta só vê as linhas permitidas (nenhuma)';
  perform pg_temp.expect_error(format($f$select * from public.months_overview(%L, '2026-05-01', '2026-09-01')$f$, pg_temp.id('rosa_ctx')),
    'sem_permissao');
  perform pg_temp.expect_error(format($f$select * from public.months_overview(%L, '2026-05-01', '2026-09-01')$f$, pg_temp.id('fam')),
    'sem_permissao');
  perform pg_temp.expect_error(format($f$select public.decide_return_review('rt-l-0002', %L, 0, '2026-09-01', 'seguiu')$f$,
    pg_temp.id('rosa_ctx')), 'sem_permissao');
  perform pg_temp.expect_error(format($f$select public.create_series_occurrence('rt-l-0003', %L, 1, 4, 'aberta')$f$, pg_temp.id('luz')),
    'nao_encontrado');
end $$;

-- Tito perde o vínculo (backend): bloqueio imediato da leitura da própria atividade na Família e da repetição.
reset role;
update public.context_memberships set revoked_at = now() where context_id = pg_temp.id('fam') and person_id = :tito;
set role authenticated;
do $$ begin
  perform pg_temp.as_('tito');
  assert (select count(*) from public.context_activity) = 0, 'vínculo revogado: nada a ler';
  perform pg_temp.expect_error(format($f$select public.create_series_occurrence('rt-f-0001', %L, 1, 3, 'aberta')$f$, pg_temp.id('internet')),
    'nao_encontrado');
  perform pg_temp.expect_error(format($f$select public.create_series_occurrence('rt-f-0006', %L, 1, 4, 'aberta')$f$, pg_temp.id('internet')),
    'nao_encontrado');
  perform pg_temp.expect_error(format($f$select * from public.months_overview(%L, '2026-05-01', '2026-09-01')$f$, pg_temp.id('fam')),
    'sem_permissao');
  perform pg_temp.expect_error(format($f$select public.decide_return_review('rt-f-0007', %L, 0, '2026-09-01', 'seguiu')$f$, pg_temp.id('fam')),
    'sem_permissao');
  assert pg_temp.act('tito', 'fam') = '2026-10-07 - -', 'a linha continua (sai junto com a pessoa ou o contexto)';
end $$;

-- ---------------------------------------------------------------------------
-- 8. Escrita direta: authenticated não grava nas tabelas novas; as guardas protegem até a escrita do backend
-- (cada caso desfeito no próprio bloco).
-- ---------------------------------------------------------------------------
do $$ begin
  perform pg_temp.as_('rosa');
  perform pg_temp.expect_error(format($f$insert into public.context_activity (person_id, context_id, last_write_on)
    values (auth.uid(), %L, '2026-12-01')$f$, pg_temp.id('yara_ctx')), 'permission denied%');
  perform pg_temp.expect_error($f$update public.context_activity set last_write_on = '2026-12-01'$f$, 'permission denied%');
  perform pg_temp.expect_error($f$delete from public.context_activity$f$, 'permission denied%');
  perform pg_temp.expect_error(format($f$insert into public.return_reviews (person_id, context_id, reviewed_through, decision, decided_on)
    values (auth.uid(), %L, '2026-09-01', 'seguiu', '2026-10-07')$f$, pg_temp.id('fam')), 'permission denied%');
  perform pg_temp.expect_error($f$update public.return_reviews set reviewed_through = '2026-09-01'$f$, 'permission denied%');
  perform pg_temp.expect_error($f$delete from public.return_reviews$f$, 'permission denied%');
end $$;
reset role;
do $$
declare
  rosa uuid := pg_temp.id('rosa');
  ctx uuid := pg_temp.id('rosa_ctx');
  w text := format('person_id = %L and context_id = %L', pg_temp.id('rosa'), pg_temp.id('rosa_ctx'));
begin
  assert pg_temp.act('rosa', 'rosa_ctx') = '2026-10-07 2026-05-20 2026-10-07' and pg_temp.rev('rosa', 'rosa_ctx') = '2026-09-01 seguiu 2026-10-07 v2',
    'ponto de partida';
  -- Atividade.
  perform pg_temp.expect_error($f$update public.context_activity set last_write_on = '2026-10-06' where $f$ || w, 'campo_imutavel');
  perform pg_temp.expect_error(format($f$update public.context_activity set context_id = %L where $f$, pg_temp.id('yara_ctx')) || w,
    'campo_imutavel');
  perform pg_temp.expect_error(format($f$update public.context_activity set person_id = %L where $f$, pg_temp.id('yara')) || w,
    'campo_imutavel');
  perform pg_temp.expect_error($f$update public.context_activity set absence_from_on = '2026-09-30' where $f$ || w,
    'atividade_inconsistente');
  perform pg_temp.expect_error($f$update public.context_activity set absence_from_on = null where $f$ || w, '%context_activity_ausencia%');
  perform pg_temp.expect_error($f$update public.context_activity set absence_until_on = '2026-10-08' where $f$ || w,
    '%context_activity_ausencia%');
  perform pg_temp.expect_error(format($f$insert into public.context_activity (person_id, context_id, last_write_on, absence_from_on,
    absence_until_on) values (%L, %L, '2026-10-05', '2026-10-01', '2026-10-05')$f$, rosa, pg_temp.id('yara_ctx')), 'atividade_inconsistente');
  begin
    update public.context_activity set last_write_on = '2026-10-08' where person_id = rosa and context_id = ctx;
    raise exception 'desfeito';
  exception when others then
    if sqlerrm <> 'desfeito' then
      raise exception 'avanço do dia deveria passar: %', sqlerrm;
    end if;
  end;
  -- Revisão.
  perform pg_temp.expect_error($f$update public.return_reviews set reviewed_through = '2026-08-01', version = version + 1 where $f$ || w,
    'campo_imutavel');
  perform pg_temp.expect_error($f$update public.return_reviews set decided_on = '2026-10-06', version = version + 1 where $f$ || w,
    'campo_imutavel');
  perform pg_temp.expect_error($f$update public.return_reviews set decision = 'atualizou' where $f$ || w, 'campo_imutavel');
  perform pg_temp.expect_error($f$update public.return_reviews set decision = 'atualizou', version = version + 2 where $f$ || w,
    'campo_imutavel');
  perform pg_temp.expect_error($f$update public.return_reviews set created_at = created_at - interval '1 day', version = version + 1 where $f$ || w,
    'campo_imutavel');
  perform pg_temp.expect_error(format($f$update public.return_reviews set context_id = %L, version = version + 1 where $f$, pg_temp.id('fam')) || w,
    'campo_imutavel');
  perform pg_temp.expect_error($f$update public.return_reviews set reviewed_through = '2026-09-15', version = version + 1 where $f$ || w,
    '%return_reviews_mes%');
  perform pg_temp.expect_error($f$update public.return_reviews set decision = 'talvez', version = version + 1 where $f$ || w,
    '%return_reviews_decisao%');
  begin
    update public.return_reviews set decision = 'atualizou', version = version + 1 where person_id = rosa and context_id = ctx;
    raise exception 'desfeito';
  exception when others then
    if sqlerrm <> 'desfeito' then
      raise exception 'escrita com versão + 1 deveria passar: %', sqlerrm;
    end if;
  end;
  assert pg_temp.act('rosa', 'rosa_ctx') = '2026-10-07 2026-05-20 2026-10-07' and pg_temp.rev('rosa', 'rosa_ctx') = '2026-09-01 seguiu 2026-10-07 v2',
    'nada mudou';
end $$;

-- ---------------------------------------------------------------------------
-- 9. record_operations: lista completa de ações (com informar_ano e tirar_ano do A3); criar_ocorrencia aponta para a
-- conta e a série; decidir_revisao para nada. Ações antigas continuam aceitas (cada caso desfeito no próprio bloco).
-- ---------------------------------------------------------------------------
do $$
declare
  v_rosa uuid := pg_temp.id('rosa');
  v_vera uuid := pg_temp.id('vera');
  v_ctx uuid := pg_temp.id('rosa_ctx');
begin
  begin
    insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id, target_id) values
      (v_rosa, 'rt-o-0001', 'criar', v_ctx, 'x', gen_random_uuid(), null, null),
      (v_rosa, 'rt-o-0002', 'editar', v_ctx, 'x', gen_random_uuid(), gen_random_uuid(), null),
      (v_rosa, 'rt-o-0003', 'criar_compromisso', v_ctx, 'x', null, gen_random_uuid(), null),
      (v_rosa, 'rt-o-0004', 'pagar_compromisso', v_ctx, 'x', gen_random_uuid(), gen_random_uuid(), null),
      (v_rosa, 'rt-o-0005', 'criar_serie', v_ctx, 'x', null, null, gen_random_uuid()),
      (v_rosa, 'rt-o-0006', 'informar_ano', v_ctx, 'x', null, null, gen_random_uuid()),
      (v_rosa, 'rt-o-0007', 'tirar_ano', v_ctx, 'x', null, null, gen_random_uuid()),
      (v_rosa, 'rt-o-0008', 'criar_ocorrencia', v_ctx, 'x', null, gen_random_uuid(), gen_random_uuid()),
      (v_vera, 'rt-o-0009', 'decidir_revisao', v_ctx, 'x', null, null, null);
    assert pg_temp.act('vera', 'rosa_ctx') is null, 'decidir_revisao não grava atividade';
    insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id, target_id)
      values (v_vera, 'rt-o-0010', 'criar_ocorrencia', v_ctx, 'x', null, gen_random_uuid(), gen_random_uuid());
    assert pg_temp.act('vera', 'rosa_ctx') = '2026-10-07 - -', 'criar_ocorrencia grava atividade';
    raise exception 'desfeito';
  exception when others then
    if sqlerrm <> 'desfeito' then
      raise exception 'operações válidas deveriam passar: %', sqlerrm;
    end if;
  end;
  assert pg_temp.act('vera', 'rosa_ctx') is null, 'desfeito';
end $$;
do $$
declare
  cases text[][] := array[
    array['criar_ocorrencia', 'r', 'c', 't'],
    array['criar_ocorrencia', null, null, 't'],
    array['criar_ocorrencia', null, 'c', null],
    array['criar_ocorrencia', null, null, null],
    array['decidir_revisao', 'r', null, null],
    array['decidir_revisao', null, 'c', null],
    array['decidir_revisao', null, null, 't'],
    array['informar_ano', null, 'c', 't'],
    array['tirar_ano', null, null, null],
    array['criar', 'r', null, 't']
  ];
  i int;
begin
  for i in 1 .. array_length(cases, 1) loop
    perform pg_temp.expect_error(format($f$insert into public.record_operations
        (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id, target_id)
      values (%L, %L, %L, %L, 'x', %s, %s, %s)$f$,
      pg_temp.id('rosa'), 'rt-o-1' || lpad(i::text, 3, '0'), cases[i][1], pg_temp.id('rosa_ctx'),
      case when cases[i][2] is null then 'null' else 'gen_random_uuid()' end,
      case when cases[i][3] is null then 'null' else 'gen_random_uuid()' end,
      case when cases[i][4] is null then 'null' else 'gen_random_uuid()' end), '%record_operations_target_check%');
  end loop;
  perform pg_temp.expect_error(format($f$insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash)
    values (%L, 'rt-o-2001', 'pular_mes', gen_random_uuid(), 'x')$f$, pg_temp.id('rosa')), '%record_operations_action_check%');
  assert (select array_agg(m[1] order by m[1] collate "C")
            from pg_constraint c, regexp_matches(pg_get_constraintdef(c.oid), '''([a-z_]+)''::text', 'g') m
           where c.conname = 'record_operations_action_check')
    = array['alterar_meta', 'alterar_movimento_meta', 'alterar_serie', 'criar', 'criar_compromisso', 'criar_meta', 'criar_ocorrencia', 'criar_serie', 'decidir_revisao',
            'definir_renda_referencia', 'desfazer_pagamento', 'editar', 'editar_compromisso', 'encerrar_serie', 'excluir',
            'excluir_compromisso', 'excluir_meta', 'excluir_movimento_meta', 'excluir_renda_referencia', 'excluir_serie', 'informar_ano', 'pagar_compromisso',
            'registrar_movimento_meta', 'responder_guardar', 'situacao_meta', 'tirar_ano'],
    'as 26 ações vigentes (com as 2 da renda comprometida, testadas em 50, as 7 de metas, testadas em 60, e a de guardar, testada em 65)';
  assert not exists (select 1 from public.record_operations
                      where (action = 'criar_ocorrencia' and (commitment_id is null or target_id is null or record_id is not null))
                         or (action = 'decidir_revisao' and (record_id is not null or commitment_id is not null or target_id is not null))),
    'toda operação nova aponta para o alvo da sua ação';
  assert (select count(*) from public.record_operations o join public.commitments c on c.id = o.commitment_id
           where o.action = 'criar_ocorrencia' and c.series_id = o.target_id and c.context_id = o.context_id)
       = (select count(*) from public.record_operations where action = 'criar_ocorrencia'), 'a conta criada é da série apontada';
  -- R1: toda pessoa com operação (menos decidir_revisao) num contexto tem a atividade dele.
  assert not exists (select 1 from public.record_operations o
                      where o.action <> 'decidir_revisao'
                        and not exists (select 1 from public.context_activity a where a.person_id = o.actor_id and a.context_id = o.context_id)),
    'atividade de toda anotação';
end $$;

-- ---------------------------------------------------------------------------
-- 10. Privilégios e assinaturas (conferidos como superusuário).
-- ---------------------------------------------------------------------------
do $$ begin
  assert (select array_agg(p.proname::text order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and has_function_privilege('authenticated', p.oid, 'execute'))
    = array['add_goal_movement', 'context_permission', 'create_commitment', 'create_goal', 'create_record', 'create_series', 'create_series_occurrence',
            'decide_return_review', 'delete_commitment', 'delete_goal', 'delete_goal_movement', 'delete_income_reference', 'delete_record', 'delete_series', 'end_series', 'ensure_personal_space',
            'inform_series_year', 'is_org_admin', 'month_committed', 'month_to_pay', 'month_totals', 'months_overview',
            'pay_commitment', 'set_goal_status', 'set_income_reference', 'set_savings_answer', 'skip_series_year', 'sync_series_occurrences', 'undo_commitment_payment', 'update_commitment', 'update_goal', 'update_goal_movement', 'update_record',
            'update_series_from'],
    'authenticated executa só as funções expostas (3 novas)';
  assert not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                      where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')), 'anon não executa nenhuma função';
  assert (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in ('clarevo_long_absence', 'clarevo_local_date', 'clarevo_track_activity',
             'context_activity_guard', 'return_reviews_guard')
             and not has_function_privilege('authenticated', p.oid, 'execute')) = 5, 'auxiliares sem execute para authenticated';
  assert to_regprocedure('public.create_series_occurrence(text, uuid, integer, integer, text)') is not null
     and to_regprocedure('public.decide_return_review(text, uuid, integer, date, text)') is not null
     and to_regprocedure('public.months_overview(uuid, date, date)') is not null, 'assinaturas das funções novas';
  assert (select prosecdef from pg_proc where oid = 'public.months_overview(uuid, date, date)'::regprocedure) = false
     and (select prosecdef from pg_proc where oid = 'public.create_series_occurrence(text, uuid, integer, integer, text)'::regprocedure)
     and (select prosecdef from pg_proc where oid = 'public.decide_return_review(text, uuid, integer, date, text)'::regprocedure),
    'months_overview com a RLS de quem consulta; as de escrita como definer';
  assert exists (select 1 from pg_trigger where tgname = 'record_operations_activity' and tgrelid = 'public.record_operations'::regclass
                   and not tgisinternal and tgenabled = 'O'), 'gatilho de atividade ligado';
  assert has_table_privilege('authenticated', 'public.context_activity', 'select')
     and has_table_privilege('authenticated', 'public.return_reviews', 'select'), 'leitura (filtrada pela RLS)';
  assert not has_table_privilege('authenticated', 'public.context_activity', 'insert, update, delete, truncate')
     and not has_any_column_privilege('authenticated', 'public.context_activity', 'insert, update')
     and not has_table_privilege('authenticated', 'public.return_reviews', 'insert, update, delete, truncate')
     and not has_any_column_privilege('authenticated', 'public.return_reviews', 'insert, update'), 'sem escrita direta';
  assert not has_table_privilege('anon', 'public.context_activity', 'select') and not has_table_privilege('anon', 'public.return_reviews', 'select'),
    'anon não lê';
  assert (select relrowsecurity from pg_class where oid = 'public.context_activity'::regclass)
     and (select relrowsecurity from pg_class where oid = 'public.return_reviews'::regclass), 'RLS ligada nas tabelas novas';
  assert (select array_agg(conname::text order by conname) from pg_constraint where conrelid = 'public.context_activity'::regclass and contype = 'f')
    = array['context_activity_context_id_fkey', 'context_activity_person_id_fkey']
     and (select bool_and(confdeltype = 'c') from pg_constraint where conrelid in ('public.context_activity'::regclass, 'public.return_reviews'::regclass)
            and contype = 'f'), 'saem junto com a pessoa ou o contexto (exclusão de dados)';
  -- Carro de R5: a última parcela (48) vence em 10/09/2029.
  assert (select public.clarevo_series_due(s, 48, 10) from public.commitment_series s where s.id = pg_temp.id('carro')) = '2029-09-10',
    'última parcela do carro em 10/09/2029';
end $$;
set role anon;
select pg_temp.expect_error($$select public.create_series_occurrence('rt-anon-0001', gen_random_uuid(), 1, 1, 'aberta')$$, 'permission denied%');
select pg_temp.expect_error($$select public.decide_return_review('rt-anon-0002', gen_random_uuid(), 0, '2026-09-01', 'seguiu')$$, 'permission denied%');
select pg_temp.expect_error($$select * from public.months_overview(gen_random_uuid(), '2026-09-01', '2026-09-01')$$, 'permission denied%');
select pg_temp.expect_error($$select * from public.context_activity$$, 'permission denied%');
select pg_temp.expect_error($$select * from public.return_reviews$$, 'permission denied%');
reset role;

-- Invariantes no fim de tudo.
select pg_temp.check_series();

rollback;
