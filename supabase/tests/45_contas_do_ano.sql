-- Contas do ano (D-029): séries anuais com cota única ou de 2 a 12 parcelas em meses seguidos, ano inteiro criado
-- dois meses antes, "Informar o valor do ano", "Tirar as parcelas do ano", "esta e as próximas", encerrar, retomar,
-- permissões e privilégios. Pessoas FICTÍCIAS: Elisa (titular), Fábio (família, só leitura), Gil (externo),
-- Hana (RH da empresa); Iara, Joel e Ivo usam só o próprio espaço (ausência, varredura de datas e limite).
-- Hoje = 07/10/2026, salvo indicação. Dentro de cada contexto conferido em S10, a data só anda para a frente.
\set ON_ERROR_STOP 1
\set elisa '''00000000-0000-0000-0000-0000000000a5'''
\set fabio '''00000000-0000-0000-0000-0000000000b5'''
\set gil   '''00000000-0000-0000-0000-0000000000c5'''
\set hana  '''00000000-0000-0000-0000-0000000000d5'''
\set iara  '''00000000-0000-0000-0000-0000000000e5'''
\set joel  '''00000000-0000-0000-0000-0000000000f5'''
\set ivo   '''00000000-0000-0000-0000-0000000000a6'''

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

-- Exige versao_desatualizada com o detalhe esperado.
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
-- Versão atual da série e vigências vivas ("de:valor:modo:dia").
create function pg_temp.sver(p_series text) returns int language sql as $$
  select version from public.series_items where id = pg_temp.id(p_series)
$$;
create function pg_temp.terms(p_series text) returns text language sql as $$
  select string_agg(format('%s:%s:%s:%s', t ->> 'from_number', t ->> 'amount_cents', t ->> 'amount_mode', t ->> 'due_day'), ' '
                    order by (t ->> 'from_number')::int)
    from public.series_items s, jsonb_array_elements(s.terms) t where s.id = pg_temp.id(p_series)
$$;
-- Linhas excluídas da série, que a RLS esconde: "número:versão:tirada:quem excluiu (final do id)", por número.
create function pg_temp.gone(p_series text) returns text language sql security definer set search_path = public, pg_temp as $$
  select string_agg(format('%s:%s:%s:%s', occurrence_number, version, series_skipped::text, right(deleted_by::text, 2)), ' ' order by occurrence_number)
    from public.commitments where series_id = pg_temp.id(p_series) and deleted_at is not null
$$;
-- Série de mentira para as auxiliares puras (só as colunas que a fórmula lê).
create function pg_temp.ser(p_kind text, p_first date, p_first_number int, p_k int) returns public.commitment_series language sql as $$
  select jsonb_populate_record(null::public.commitment_series, jsonb_build_object('kind', p_kind, 'first_due_month', p_first,
                                                                                  'first_number', p_first_number, 'parts_per_year', p_k))
$$;

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  (:elisa, 'elisa@exemplo.test', now(), '{"display_name":"Elisa"}'),
  (:fabio, 'fabio@exemplo.test', now(), '{"display_name":"Fábio"}'),
  (:gil,   'gil@exemplo.test',   now(), '{"display_name":"Gil"}'),
  (:hana,  'hana@empresa.test',  now(), '{"display_name":"Hana"}'),
  (:iara,  'iara@exemplo.test',  now(), '{"display_name":"Iara"}'),
  (:joel,  'joel@exemplo.test',  now(), '{"display_name":"Joel"}'),
  (:ivo,   'ivo@exemplo.test',   now(), '{"display_name":"Ivo"}');

-- 1. Mês e vencimento da ocorrência (conferidos como superusuário: authenticated não executa as auxiliares).
do $$
declare
  k int;
  fn int;
  n int;
  s public.commitment_series;
begin
  -- IPVA, cota única, 20/01, desde 2027.
  s := pg_temp.ser('anual', '2027-01-01', 1, 1);
  assert public.clarevo_series_due(s, 1, 20) = '2027-01-20' and public.clarevo_series_due(s, 2, 20) = '2028-01-20'
     and public.clarevo_series_due(s, 50, 20) = '2076-01-20' and public.clarevo_series_month(s, 0) = '2026-01-01',
    'IPVA: n1 20/01/2027, n2 20/01/2028, n50 20/01/2076; n0 em janeiro de 2026';
  -- IPTU, 10 parcelas de fevereiro a novembro, dia 10, desde 2027.
  s := pg_temp.ser('anual', '2027-02-01', 1, 10);
  assert public.clarevo_series_due(s, 1, 10) = '2027-02-10' and public.clarevo_series_due(s, 10, 10) = '2027-11-10'
     and public.clarevo_series_due(s, 11, 10) = '2028-02-10' and public.clarevo_series_due(s, 20, 10) = '2028-11-10'
     and public.clarevo_series_due(s, 21, 10) = '2029-02-10' and public.clarevo_series_month(s, 0) = '2026-11-01',
    'IPTU: n1 10/02/2027, n10 10/11/2027, n11 10/02/2028, n21 10/02/2029; n0 é a última de 2026';
  -- IPTU de 2026 com as parcelas 1 a 8 pagas antes do Clarevo (primeiro número 9, primeiro mês outubro de 2026).
  s := pg_temp.ser('anual', '2026-10-01', 9, 10);
  assert public.clarevo_series_due(s, 9, 10) = '2026-10-10' and public.clarevo_series_due(s, 10, 10) = '2026-11-10'
     and public.clarevo_series_due(s, 11, 10) = '2027-02-10' and public.clarevo_series_due(s, 20, 10) = '2027-11-10'
     and public.clarevo_series_month(s, 1) = '2026-02-01' and public.clarevo_series_month(s, 8) = '2026-09-01'
     and public.clarevo_series_month(s, 0) = '2025-11-01',
    'IPTU de 2026: n9 10/10/2026, n10 10/11/2026, n11 10/02/2027, n20 10/11/2027; âncora em fevereiro de 2026';
  -- Seguro, 4 parcelas a partir de novembro, dia 31 (ano "2026/2027").
  s := pg_temp.ser('anual', '2026-11-01', 1, 4);
  assert (select string_agg(to_char(public.clarevo_series_due(s, i, 31), 'YYYY-MM-DD'), ' ' order by i) from generate_series(1, 8) i)
    = '2026-11-30 2026-12-31 2027-01-31 2027-02-28 2027-11-30 2027-12-31 2028-01-31 2028-02-29',
    'seguro: 30/11/2026, 31/12/2026, 31/01/2027, 28/02/2027; n5 30/11/2027; n8 29/02/2028';
  -- Cota única em 29/02, desde 2028.
  s := pg_temp.ser('anual', '2028-02-01', 1, 1);
  assert public.clarevo_series_due(s, 1, 29) = '2028-02-29' and public.clarevo_series_due(s, 2, 29) = '2029-02-28', '29/02/2028 e 28/02/2029';
  -- 12 parcelas no ano: dezembro e janeiro seguidos; n0 em dezembro do ano anterior.
  s := pg_temp.ser('anual', '2027-01-01', 1, 12);
  assert public.clarevo_series_month(s, 12) = '2027-12-01' and public.clarevo_series_month(s, 13) = '2028-01-01'
     and public.clarevo_series_month(s, 0) = '2026-12-01', '12 parcelas: meses seguidos entre os anos';
  -- Mensal e parcelada: igual à 0003 (clarevo_series_due_on), inclusive n = first_number - 1.
  assert (select bool_and(public.clarevo_series_due(pg_temp.ser('parcelada', '2026-11-01', 13, null), i, d)
                          = public.clarevo_series_due_on('2026-11-01', 13, i, d)
                      and public.clarevo_series_due(pg_temp.ser('mensal', '2026-10-01', 1, null), i, d)
                          = public.clarevo_series_due_on('2026-10-01', 1, i, d))
            from generate_series(0, 120) i, unnest(array[1, 28, 29, 30, 31]) d), 'mensal e parcelada como na 0003';
  assert public.clarevo_series_month(pg_temp.ser('parcelada', '2026-10-01', 14, null), 48) = '2029-08-01'
     and public.clarevo_series_month(pg_temp.ser('parcelada', '2026-10-01', 14, null), 13) = '2026-09-01', 'carro: parcela 48 em agosto de 2029';
  -- Toda forma anual: o primeiro número cai no primeiro mês; parcelas do ano em meses seguidos; o ano seguinte começa
  -- 12 meses depois do anterior.
  for k in 1 .. 12 loop
    for fn in 1 .. k loop
      s := pg_temp.ser('anual', '2027-03-01', fn, k);
      assert public.clarevo_series_month(s, fn) = '2027-03-01', format('k=%s, primeiro número %s: primeiro mês', k, fn);
      for n in 0 .. 3 * k + 2 loop
        assert public.clarevo_months_between(public.clarevo_series_month(s, n), public.clarevo_series_month(s, n + 1))
               = case when n % k = 0 then 13 - k else 1 end,
          format('k=%s, primeiro número %s: de %s para %s', k, fn, n, n + 1);
      end loop;
    end loop;
  end loop;
end $$;

-- Espaços pessoais. Família da Elisa (Fábio só lê) e empresa da Hana com a licença da Elisa, preparadas pelo backend.
set role authenticated;
select set_config('request.jwt.claim.sub', :fabio, true);
insert into ids select 'fabio_ctx', (public.ensure_personal_space('Conta principal') ->> 'context_id')::uuid;
select set_config('request.jwt.claim.sub', :gil, true);
insert into ids select 'gil_ctx', (public.ensure_personal_space('Conta principal') ->> 'context_id')::uuid;
select set_config('request.jwt.claim.sub', :hana, true);
insert into ids select 'hana_ctx', (public.ensure_personal_space('Conta principal') ->> 'context_id')::uuid;
select set_config('request.jwt.claim.sub', :iara, true);
insert into ids select 'iara_ctx', (public.ensure_personal_space('Conta principal') ->> 'context_id')::uuid;
select set_config('request.jwt.claim.sub', :joel, true);
insert into ids select 'joel_ctx', (public.ensure_personal_space('Conta principal') ->> 'context_id')::uuid;
select set_config('request.jwt.claim.sub', :ivo, true);
insert into ids select 'ivo_ctx', (public.ensure_personal_space('Conta principal') ->> 'context_id')::uuid;
select set_config('request.jwt.claim.sub', :elisa, true);
with s as (select public.ensure_personal_space('Conta principal') as space)
  insert into ids select 'ctx', (space ->> 'context_id')::uuid from s
  union all select 'acc', (space #>> '{account,id}')::uuid from s;
reset role;
with f as (
  insert into public.financial_contexts (kind, name, owner_person_id) values ('familia', 'Família da Elisa', :elisa) returning id
) insert into ids select 'fam', id from f;
insert into public.context_memberships (context_id, person_id, role, can_read, can_write, can_edit_others)
  select id, :elisa::uuid, 'titular'::public.membership_role, true, true, true from ids where name = 'fam'
  union all
  select id, :fabio::uuid, 'membro'::public.membership_role, true, false, false from ids where name = 'fam';
with c as (
  insert into public.financial_accounts (context_id, name, created_by) select id, 'Conta da casa', :elisa from ids where name = 'fam' returning id
) insert into ids select 'fam_acc', id from c;
insert into public.organizations (id, name) values ('10000000-0000-0000-0000-0000000000f5', 'Empresa Fictícia');
insert into public.organization_admins values ('10000000-0000-0000-0000-0000000000f5', :hana);
insert into public.benefit_contracts (id, organization_id, seats, plan, starts_on)
  values ('20000000-0000-0000-0000-0000000000f5', '10000000-0000-0000-0000-0000000000f5', 10, 'familiar', '2026-10-01');
insert into public.licenses (id, contract_id, invited_email, person_id, status, activated_at)
  values ('30000000-0000-0000-0000-0000000000f5', '20000000-0000-0000-0000-0000000000f5', 'elisa@exemplo.test', :elisa, 'ativa', now());
set role authenticated;
select set_config('request.jwt.claim.sub', :elisa, true);

-- 2. Validação no banco, mesmos códigos e mesma ordem do core (validateSeriesDraft). Hoje 07/10/2026:
-- conta do ano começa de setembro de 2026 a setembro de 2028.
do $$
declare
  ctx uuid := pg_temp.id('ctx');
  -- tipo, natureza, descrição, categoria, valor, modo, dia, primeiro mês, próxima parcela, total, último mês, parcelas no ano, erro
  cases text[][] := array[
    array['semanal', 'conta', 'IPVA', null, '100', 'fixo', '20', '2027-01-01', '1', null, null, '1', 'tipo_invalido'],
    array[null, 'conta', 'IPVA', null, '100', 'fixo', '20', '2027-01-01', '1', null, null, '1', 'tipo_invalido'],
    array['anual', 'financiamento', 'IPVA', null, '100', 'fixo', '20', '2027-01-01', '1', null, null, '1', 'natureza_invalida'],
    array['anual', 'compra_parcelada', 'IPVA', null, '100', 'fixo', '20', '2027-01-01', '1', null, null, '1', 'natureza_invalida'],
    array['anual', null, 'IPVA', null, '100', 'fixo', '20', '2027-01-01', '1', null, null, '1', 'natureza_invalida'],
    array['anual', 'conta', 'IPVA', null, '0', 'fixo', '20', '2027-01-01', '1', null, null, '1', 'valor_invalido'],
    array['anual', 'conta', 'IPVA', null, '1000000000', 'fixo', '20', '2027-01-01', '1', null, null, '1', 'valor_acima_do_limite'],
    array['anual', 'conta', ' ', null, '100', 'fixo', '20', '2027-01-01', '1', null, null, '1', 'descricao_obrigatoria'],
    array['anual', 'conta', 'IPVA', null, '100', 'misto', '20', '2027-01-01', '1', null, null, '1', 'modo_de_valor_invalido'],
    array['anual', 'conta', 'IPVA', null, '100', 'fixo', '32', '2027-01-01', '1', null, null, '1', 'dia_invalido'],
    array['anual', 'conta', 'IPVA', null, '100', 'fixo', '20', null, '1', null, null, '1', 'inicio_fora_do_intervalo'],
    array['anual', 'conta', 'IPVA', null, '100', 'fixo', '20', '2027-01-15', '1', null, null, '1', 'inicio_fora_do_intervalo'],
    array['anual', 'conta', 'IPVA', null, '100', 'fixo', '20', '2026-08-01', '1', null, null, '1', 'inicio_fora_do_intervalo'],
    array['anual', 'conta', 'IPVA', null, '100', 'fixo', '20', '2028-10-01', '1', null, null, '1', 'inicio_fora_do_intervalo'],
    array['mensal', 'conta', 'Luz', null, '100', 'fixo', '10', '2027-11-01', '1', null, null, null, 'inicio_fora_do_intervalo'],
    array['anual', 'conta', 'IPVA', null, '100', 'fixo', '20', '2027-01-01', '1', '12', null, '1', 'parcelas_invalidas'],
    array['anual', 'conta', 'IPTU', null, '100', 'fixo', '10', '2027-02-01', '1', null, null, '0', 'parcelas_no_ano_invalidas'],
    array['anual', 'conta', 'IPTU', null, '100', 'fixo', '10', '2027-02-01', '1', null, null, '13', 'parcelas_no_ano_invalidas'],
    array['anual', 'conta', 'IPTU', null, '100', 'fixo', '10', '2027-02-01', '1', null, null, null, 'parcelas_no_ano_invalidas'],
    array['mensal', 'conta', 'Luz', null, '100', 'fixo', '10', '2026-10-01', '1', null, null, '1', 'parcelas_no_ano_invalidas'],
    array['parcelada', 'financiamento', 'Carro', null, '100', 'fixo', '10', '2026-10-01', '1', '12', null, '1', 'parcelas_no_ano_invalidas'],
    array['anual', 'conta', 'IPTU', null, '100', 'fixo', '10', '2027-02-01', '11', null, null, '10', 'parcela_inicial_invalida'],
    array['anual', 'conta', 'IPTU', null, '100', 'fixo', '10', '2027-02-01', '0', null, null, '10', 'parcela_inicial_invalida'],
    array['anual', 'conta', 'IPTU', null, '100', 'fixo', '10', '2027-02-01', null, null, null, '10', 'parcela_inicial_invalida'],
    array['anual', 'conta', 'IPVA', null, '100', 'fixo', '20', '2027-01-01', '2', null, null, '1', 'parcela_inicial_invalida'],
    array['anual', 'conta', 'IPTU', null, '100', 'fixo', '10', '2027-02-01', '1', null, '2029-10-01', '10', 'fim_invalido'],
    array['anual', 'conta', 'IPTU', null, '100', 'fixo', '10', '2027-02-01', '1', null, '2027-01-01', '10', 'fim_invalido'],
    array['anual', 'conta', 'IPTU', null, '100', 'fixo', '10', '2027-02-01', '1', null, '2029-11-15', '10', 'fim_invalido'],
    array['anual', 'conta', 'IPTU', null, '100', 'fixo', '10', '2027-02-01', '1', null, '2077-11-01', '10', 'fim_invalido'],
    array['anual', 'conta', 'IPVA', null, '100', 'fixo', '20', '2027-01-01', '1', null, '2027-02-01', '1', 'fim_invalido'],
    array['anual', 'conta', 'IPTU', null, '100', 'fixo', '10', '2026-10-01', '9', null, '2026-10-01', '10', 'fim_invalido'],
    -- Ordem: o primeiro erro da lista vence.
    array['semanal', 'financiamento', 'IPVA', null, '0', 'fixo', '20', '2027-01-01', '1', null, null, '0', 'tipo_invalido'],
    array['anual', 'financiamento', 'IPVA', null, '0', 'fixo', '20', '2027-01-01', '1', null, null, '0', 'natureza_invalida'],
    array['anual', 'conta', 'IPVA', null, '0', 'fixo', '20', '2028-10-01', '1', null, null, '0', 'valor_invalido'],
    array['anual', 'conta', 'IPVA', null, '100', 'fixo', '20', '2028-10-01', '0', '12', null, '0', 'inicio_fora_do_intervalo'],
    array['anual', 'conta', 'IPTU', null, '100', 'fixo', '10', '2027-02-01', '0', '12', null, '0', 'parcelas_invalidas'],
    array['anual', 'conta', 'IPTU', null, '100', 'fixo', '10', '2027-02-01', '0', null, '2029-10-01', '0', 'parcelas_no_ano_invalidas'],
    array['anual', 'conta', 'IPTU', null, '100', 'fixo', '10', '2027-02-01', '11', null, '2029-10-01', '10', 'parcela_inicial_invalida']
  ];
  i int;
  res jsonb;
  ok uuid[] := '{}';
begin
  for i in 1 .. array_length(cases, 1) loop
    perform pg_temp.expect_error(format(
      'select public.create_series(%L, %L, %L, %L, %L, %L, %L::bigint, %L, %L::int, %L::date, %L::int, %L::int, %L::date, %L::int)',
      'a3-vali-' || lpad(i::text, 4, '0'), ctx, cases[i][1], cases[i][2], cases[i][3], cases[i][4], cases[i][5], cases[i][6],
      cases[i][7], cases[i][8], cases[i][9], cases[i][10], cases[i][11], cases[i][12]), cases[i][13]);
  end loop;
  assert (select count(*) from public.record_operations where idempotency_key like 'a3-vali-%') = 0, 'recusas não gravam operação';
  assert (select count(*) from public.commitment_series) = 0, 'recusas não gravam série';
  perform pg_temp.expect_error(format($f$select public.create_series('curta', %L, 'anual', 'conta', 'x', null, 100, 'fixo', 10,
    '2027-01-01', 1, null, null, 1)$f$, ctx), 'chave_invalida');

  -- Limites aceitos (cada série excluída em seguida).
  res := public.create_series('a3-vali-0101', ctx, 'anual', 'conta', 'Limite', null, 100, 'fixo', 10, '2028-09-01', 1, null, null, 1);
  assert res -> 'changed' = '0'::jsonb and res #>> '{series,kind}' = 'anual' and (res #>> '{series,parts_per_year}')::int = 1
     and (res #>> '{series,first_number}')::int = 1 and res #>> '{series,last_number}' is null and res #>> '{series,installment_total}' is null,
    'setembro de 2028 (23 meses depois) passa; nada criado agora';
  ok := ok || (res #>> '{series,id}')::uuid;
  res := public.create_series('a3-vali-0102', ctx, 'anual', 'conta', 'Limite', null, 100, 'fixo', 1, '2026-09-01', 1, null, null, 1);
  assert res -> 'changed' = '1'::jsonb and res #>> '{occurrences,0,due_on}' = '2026-09-01'
     and res #>> '{occurrences,0,series_kind}' = 'anual' and (res #>> '{occurrences,0,series_parts_per_year}')::int = 1,
    'setembro de 2026 (mês anterior) passa e já cria a conta vencida';
  ok := ok || (res #>> '{series,id}')::uuid;
  res := public.create_series('a3-vali-0103', ctx, 'anual', 'conta', 'Limite', null, 100, 'fixo', 10, '2027-02-01', 1, null, '2029-11-01', 10);
  assert (res #>> '{series,last_number}')::int = 30 and res -> 'changed' = '0'::jsonb, 'IPTU até novembro de 2029: last_number 30';
  ok := ok || (res #>> '{series,id}')::uuid;
  res := public.create_series('a3-vali-0104', ctx, 'anual', 'conta', 'Limite', null, 100, 'fixo', 10, '2027-02-01', 1, null, '2076-11-01', 10);
  assert (res #>> '{series,last_number}')::int = 500, '50 anos de IPTU: 500 parcelas';
  ok := ok || (res #>> '{series,id}')::uuid;
  res := public.create_series('a3-vali-0105', ctx, 'anual', 'conta', 'Limite', null, 100, 'fixo', 20, '2027-01-01', 1, null, '2027-01-01', 1);
  assert (res #>> '{series,last_number}')::int = 1, 'cota única só em 2027: last_number 1';
  ok := ok || (res #>> '{series,id}')::uuid;
  res := public.create_series('a3-vali-0106', ctx, 'anual', 'conta', 'Limite', null, 100, 'fixo', 31, '2026-12-01', 12, null, null, 12);
  assert res -> 'changed' = '1'::jsonb and (res #>> '{series,first_number}')::int = 12 and res #>> '{occurrences,0,due_on}' = '2026-12-31',
    '12 parcelas, próxima a 12: só dezembro';
  ok := ok || (res #>> '{series,id}')::uuid;
  res := public.create_series('a3-vali-0107', ctx, 'anual', 'conta', 'Limite', null, 100, 'fixo', 10, '2026-10-01', 9, null, '2027-11-01', 10);
  assert res -> 'changed' = '2'::jsonb and (res #>> '{series,last_number}')::int = 20
     and (select string_agg(format('%s:%s', o ->> 'occurrence_number', o ->> 'due_on'), ' ') from jsonb_array_elements(res -> 'occurrences') o)
         = '9:2026-10-10 10:2026-11-10', 'IPTU de 2026 a partir da parcela 9: outubro e novembro; termina em 2027 (20)';
  ok := ok || (res #>> '{series,id}')::uuid;
  for i in 1 .. array_length(ok, 1) loop
    perform public.delete_series('a3-vali-02' || lpad(i::text, 2, '0'), ok[i],
      (select version from public.series_items where id = ok[i]),
      (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'version', version)), '[]'::jsonb)
         from public.commitment_items where series_id = ok[i]));
  end loop;
  perform pg_temp.check_series('ctx');
  assert (select count(*) from public.series_items) = 0 and (select count(*) from public.commitment_items) = 0,
    'limites: nada sobrou (séries e contas excluídas)';
end $$;

-- 3. Sequência de aceite A3 (Pessoal da Elisa). Base em 07/10/2026: Recebido 6.000,00, Pago 3.900,00 e Ainda a pagar
-- 650,00 (Internet 150,00 em 15/10 e Condomínio 500,00 em 20/10); Seguro do carro 300,00 em 10/11. Valores em centavos.
do $$
declare
  ctx uuid := pg_temp.id('ctx');
  acc uuid := pg_temp.id('acc');
  res jsonb;
begin
  perform public.create_record('a3-base-0001', ctx, acc, 'receita', 600000, '2026-10-01', 'Salário');
  perform public.create_record('a3-base-0002', ctx, acc, 'despesa', 250000, '2026-10-05', 'Aluguel');
  perform public.create_record('a3-base-0003', ctx, acc, 'despesa', 140000, '2026-10-06', 'Mercado');
  res := public.create_commitment('a3-base-0004', ctx, 15000, '2026-10-15', 'Internet', 'Moradia');
  insert into ids values ('internet', (res #>> '{commitment,id}')::uuid);
  res := public.create_commitment('a3-base-0005', ctx, 50000, '2026-10-20', 'Condomínio', 'Moradia');
  insert into ids values ('condominio', (res #>> '{commitment,id}')::uuid);
  res := public.create_commitment('a3-base-0006', ctx, 30000, '2026-11-10', 'Seguro do carro', 'Transporte');
  insert into ids values ('seguro_carro', (res #>> '{commitment,id}')::uuid);
  assert pg_temp.totals('ctx', '2026-10-01') = array[600000, 390000, 210000]::bigint[], 'base: 6.000 / 3.900 / 2.100';
  assert pg_temp.to_pay('ctx', '2026-10-01') = array[65000, 0, 65000, 2]::bigint[], 'base: Ainda a pagar 650';
end $$;

-- Passos 1 a 4: IPVA (cota única, 20/01, desde 2027, referência 2.400,00, muda), IPTU (10 parcelas, fevereiro, dia 10,
-- desde 2027, referência 180,00, muda) e Matrícula (cota única, 10/12, desde 2026, 1.200,00 fixo); gerar de novo.
do $$
declare
  ctx uuid := pg_temp.id('ctx');
  res jsonb;
begin
  res := public.create_series('a3-a-0001', ctx, 'anual', 'conta', 'IPVA', 'Transporte', 240000, 'variavel', 20, '2027-01-01', 1, null, null, 1);
  insert into ids values ('ipva', (res #>> '{series,id}')::uuid);
  assert res -> 'changed' = '0'::jsonb and res -> 'occurrences' = '[]'::jsonb and res #>> '{series,kind}' = 'anual'
     and res #>> '{series,nature}' = 'conta' and (res #>> '{series,parts_per_year}')::int = 1 and (res #>> '{series,first_number}')::int = 1
     and res #>> '{series,last_number}' is null and res #>> '{series,first_due_month}' = '2027-01-01' and (res #>> '{series,version}')::int = 1
     and (res #>> '{series,open_count}')::int = 0 and res #> '{series,generating}' = 'true'::jsonb, 'passo 1: IPVA sem conta criada';
  assert (select (action, target_id, request_hash) from public.record_operations where idempotency_key = 'a3-a-0001')
    = ('criar_serie'::text, pg_temp.id('ipva'), md5(jsonb_build_array('criar_serie', ctx, 'anual', 'conta', 'IPVA', 'Transporte', 240000,
        'variavel', 20, '2027-01-01'::date, 1, null::int, null::date, 1)::text)), 'operação criar_serie com parts_per_year no fim do hash';
  perform pg_temp.check_series('ctx');
  assert pg_temp.to_pay('ctx', '2026-10-01') = array[65000, 0, 65000, 2]::bigint[] and pg_temp.totals('ctx', '2026-10-01') = array[600000, 390000, 210000]::bigint[],
    'passo 1: totais iguais';

  res := public.create_series('a3-a-0002', ctx, 'anual', 'conta', 'IPTU', 'Moradia', 18000, 'variavel', 10, '2027-02-01', 1, null, null, 10);
  insert into ids values ('iptu', (res #>> '{series,id}')::uuid);
  assert res -> 'changed' = '0'::jsonb and (res #>> '{series,parts_per_year}')::int = 10, 'passo 2: IPTU sem conta criada';
  perform pg_temp.check_series('ctx');
  assert pg_temp.to_pay('ctx', '2026-10-01') = array[65000, 0, 65000, 2]::bigint[], 'passo 2: Ainda a pagar 650';

  res := public.create_series('a3-a-0003', ctx, 'anual', 'conta', 'Matrícula', 'Educação', 120000, 'fixo', 10, '2026-12-01', 1, null, null, 1);
  insert into ids values ('matricula', (res #>> '{series,id}')::uuid);
  assert res -> 'changed' = '1'::jsonb, 'passo 3: Matrícula de 2026 criada';
  assert pg_temp.occs('matricula') = '1:2026-12-10:120000:false:false:aberto', 'passo 3: n1 10/12/2026 em Próximos meses';
  assert (select (series_kind, series_parts_per_year) from public.commitment_items where id = pg_temp.occ('matricula', 1))
    = ('anual'::text, 1::smallint), 'a conta lê o tipo e as parcelas no ano pela junção';
  perform pg_temp.check_series('ctx');
  assert pg_temp.to_pay('ctx', '2026-10-01') = array[65000, 0, 65000, 2]::bigint[] and pg_temp.totals('ctx', '2026-10-01') = array[600000, 390000, 210000]::bigint[],
    'passo 3: Ainda a pagar e Pago de outubro iguais';
  assert pg_temp.to_pay('ctx', '2026-12-01') = array[120000, 0, 120000, 1]::bigint[], 'passo 3: dezembro 1.200 (outro mês)';

  assert pg_temp.sync('ctx') = '{"created": 0, "created_overdue": 0}'::jsonb, 'passo 4: gerar de novo não cria nada';
  perform pg_temp.check_series('ctx');
  assert pg_temp.to_pay('ctx', '2026-10-01') = array[65000, 0, 65000, 2]::bigint[], 'passo 4: Ainda a pagar 650';
end $$;

-- Passo 5: pagar Internet, Condomínio e Seguro do carro em 07/10. Em 31/10, gerar não cria nada.
do $$
declare
  acc uuid := pg_temp.id('acc');
begin
  perform public.pay_commitment('a3-a-0005a', pg_temp.id('internet'), 1, acc, 15000, '2026-10-07');
  perform public.pay_commitment('a3-a-0005b', pg_temp.id('condominio'), 1, acc, 50000, '2026-10-07');
  perform public.pay_commitment('a3-a-0005c', pg_temp.id('seguro_carro'), 1, acc, 30000, '2026-10-07');
  perform pg_temp.check_series('ctx');
  assert pg_temp.to_pay('ctx', '2026-10-01') = array[0, 0, 0, 0]::bigint[], 'passo 5: Ainda a pagar 0';
  assert pg_temp.totals('ctx', '2026-10-01') = array[600000, 485000, 115000]::bigint[], 'passo 5: Pago 4.850';
  set local clarevo.today = '2026-10-31';
  assert pg_temp.sync('ctx') = '{"created": 0, "created_overdue": 0}'::jsonb, '31/10/2026: IPVA e IPTU ainda não entram';
  perform pg_temp.check_series('ctx');
end $$;

-- Passo 6 (01/11/2026): o IPVA de 2027 entra. Passo 7 (01/12/2026): as 10 parcelas do IPTU de 2027 entram.
-- Passo 8 (10/12/2026): pagar a Matrícula.
do $$
begin
  set local clarevo.today = '2026-11-01';
  assert pg_temp.sync('ctx') = '{"created": 1, "created_overdue": 0}'::jsonb, 'passo 6: IPVA n1';
  assert pg_temp.occs('ipva') = '1:2027-01-20:240000:true:false:aberto', 'passo 6: IPVA 20/01/2027, 2.400 estimado';
  assert pg_temp.occs('iptu') is null, 'passo 6: IPTU ainda não';
  perform pg_temp.check_series('ctx');
  assert pg_temp.to_pay('ctx', '2026-11-01') = array[0, 0, 0, 0]::bigint[] and pg_temp.totals('ctx', '2026-11-01') = array[0, 0, 0]::bigint[],
    'passo 6: Ainda a pagar 0 e Pago 0 em novembro';
  assert pg_temp.to_pay('ctx', '2027-01-01') = array[240000, 0, 240000, 1]::bigint[], 'month_to_pay(2027-01) em 01/11/2026';

  set local clarevo.today = '2026-12-01';
  assert pg_temp.sync('ctx') = '{"created": 10, "created_overdue": 0}'::jsonb, 'passo 7: IPTU n1 a n10';
  assert pg_temp.occs('iptu') = '1:2027-02-10:18000:true:false:aberto 2:2027-03-10:18000:true:false:aberto '
    '3:2027-04-10:18000:true:false:aberto 4:2027-05-10:18000:true:false:aberto 5:2027-06-10:18000:true:false:aberto '
    '6:2027-07-10:18000:true:false:aberto 7:2027-08-10:18000:true:false:aberto 8:2027-09-10:18000:true:false:aberto '
    '9:2027-10-10:18000:true:false:aberto 10:2027-11-10:18000:true:false:aberto', 'passo 7: 10/02 a 10/11/2027, 180 estimados';
  perform pg_temp.check_series('ctx');
  assert pg_temp.to_pay('ctx', '2026-12-01') = array[120000, 0, 120000, 1]::bigint[] and pg_temp.estimated('ctx', '2026-12-01') = 0,
    'passo 7: Ainda a pagar 1.200';
  assert pg_temp.totals('ctx', '2026-12-01') = array[0, 0, 0]::bigint[], 'passo 7: Pago 0';

  set local clarevo.today = '2026-12-10';
  perform public.pay_commitment('a3-a-0008', pg_temp.occ('matricula', 1), 1, pg_temp.id('acc'), 120000, '2026-12-10');
  perform pg_temp.check_series('ctx');
  assert pg_temp.to_pay('ctx', '2026-12-01') = array[0, 0, 0, 0]::bigint[], 'passo 8: Ainda a pagar 0';
  assert pg_temp.totals('ctx', '2026-12-01') = array[0, 120000, -120000]::bigint[], 'passo 8: Pago 1.200';
end $$;

-- Passo 9 (15/01/2027): informar 2027 no IPTU, 189,90. Passo 10: repetir com a mesma chave. Passo 11: informar o IPVA.
do $$
declare
  iptu uuid := pg_temp.id('iptu');
  seen jsonb := pg_temp.refs('iptu', '{1,2,3,4,5,6,7,8,9,10}');
  res jsonb;
  again jsonb;
begin
  set local clarevo.today = '2027-01-15';
  assert pg_temp.sync('ctx') = '{"created": 0, "created_overdue": 0}'::jsonb, '15/01/2027: nada novo';
  res := public.inform_series_year('a3-a-0009', iptu, 1, seen, 18990);
  assert res -> 'changed' = '10'::jsonb and (res #>> '{series,version}')::int = 1 and res #>> '{series,id}' = iptu::text
     and jsonb_array_length(res -> 'occurrences') = 10, 'passo 9: 10 parcelas mudam; a série não muda de versão';
  assert pg_temp.occs('iptu') = '1:2027-02-10:18990:false:true:aberto 2:2027-03-10:18990:false:true:aberto '
    '3:2027-04-10:18990:false:true:aberto 4:2027-05-10:18990:false:true:aberto 5:2027-06-10:18990:false:true:aberto '
    '6:2027-07-10:18990:false:true:aberto 7:2027-08-10:18990:false:true:aberto 8:2027-09-10:18990:false:true:aberto '
    '9:2027-10-10:18990:false:true:aberto 10:2027-11-10:18990:false:true:aberto', 'passo 9: 189,90, não estimadas, alteradas só em 2027';
  assert (select array_agg(distinct version) from public.commitment_items where series_id = iptu) = array[2], 'passo 9: versão 2';
  assert (select sum(amount_cents) from public.commitment_items where series_id = iptu) = 189900, 'total de 2027: 1.899,00';
  assert (select (action, target_id, record_id is null, commitment_id is null) from public.record_operations
           where idempotency_key = 'a3-a-0009') = ('informar_ano'::text, iptu, true, true), 'operação informar_ano aponta para a série';
  assert pg_temp.terms('iptu') = '1:18000:variavel:10', 'a vigência não muda';
  perform pg_temp.check_series('ctx');
  assert pg_temp.to_pay('ctx', '2027-01-01') = array[240000, 0, 240000, 1]::bigint[] and pg_temp.estimated('ctx', '2027-01-01') = 240000,
    'passo 9: Ainda a pagar 2.400 (inclui 2.400 estimados)';
  assert pg_temp.to_pay('ctx', '2027-02-01') = array[18990, 0, 18990, 1]::bigint[], 'fevereiro: parcela 1 com o valor informado';
  assert pg_temp.totals('ctx', '2027-01-01') = array[0, 0, 0]::bigint[], 'passo 9: Pago 0';

  again := public.inform_series_year('a3-a-0009', iptu, 1, seen, 18990);
  assert again -> 'series' = res -> 'series' and again -> 'occurrences' = res -> 'occurrences' and again -> 'changed' = '0'::jsonb,
    'passo 10: repetição devolve o mesmo resultado';
  assert (select array_agg(distinct version) from public.commitment_items where series_id = iptu) = array[2]
     and (select count(*) from public.record_operations where idempotency_key = 'a3-a-0009') = 1, 'passo 10: nada muda';
  perform pg_temp.expect_error(format($f$select public.inform_series_year('a3-a-0009', %L, 1, %L::jsonb, 18991)$f$, iptu, seen),
    'chave_reutilizada');
  perform pg_temp.expect_error(format($f$select public.skip_series_year('a3-a-0009', %L, 1, %L::jsonb)$f$, iptu, seen), 'chave_reutilizada');
  perform pg_temp.check_series('ctx');
  assert pg_temp.to_pay('ctx', '2027-01-01') = array[240000, 0, 240000, 1]::bigint[], 'passo 10: Ainda a pagar 2.400';

  res := public.inform_series_year('a3-a-0011', pg_temp.id('ipva'), 1, pg_temp.refs('ipva', '{1}'), 251230);
  assert res -> 'changed' = '1'::jsonb, 'passo 11: uma conta';
  assert pg_temp.occs('ipva') = '1:2027-01-20:251230:false:true:aberto', 'passo 11: IPVA 2.512,30, não estimado';
  perform pg_temp.check_series('ctx');
  assert pg_temp.to_pay('ctx', '2027-01-01') = array[251230, 0, 251230, 1]::bigint[] and pg_temp.estimated('ctx', '2027-01-01') = 0,
    'passo 11: Ainda a pagar 2.512,30';
end $$;

-- Passo 12 (20/01/2027): pagar o IPVA. Passo 13 (10/02/2027): "Paguei o ano todo de uma vez" no IPTU n1 (1.709,10)
-- e tirar n2 a n10. Passo 14: gerar. Passo 15: desfazer o pagamento. Passo 16: pagar de novo.
do $$
declare
  iptu uuid := pg_temp.id('iptu');
  acc uuid := pg_temp.id('acc');
  res jsonb;
begin
  set local clarevo.today = '2027-01-20';
  perform public.pay_commitment('a3-a-0012', pg_temp.occ('ipva', 1), 2, acc, 251230, '2027-01-20');
  perform pg_temp.check_series('ctx');
  assert pg_temp.to_pay('ctx', '2027-01-01') = array[0, 0, 0, 0]::bigint[], 'passo 12: Ainda a pagar 0';
  assert pg_temp.totals('ctx', '2027-01-01') = array[0, 251230, -251230]::bigint[], 'passo 12: Pago 2.512,30';

  set local clarevo.today = '2027-02-10';
  assert pg_temp.sync('ctx') = '{"created": 0, "created_overdue": 0}'::jsonb, '10/02/2027: nada novo';
  insert into ids values ('iptu1', pg_temp.occ('iptu', 1));
  res := public.pay_commitment('a3-a-0013a', pg_temp.id('iptu1'), 2, acc, 170910, '2027-02-10');
  assert (res #>> '{record,amount_cents}')::bigint = 170910 and (res #>> '{commitment,amount_cents}')::bigint = 18990,
    'cota única: o gasto é o valor total pago; o previsto da parcela não muda';
  res := public.skip_series_year('a3-a-0013b', iptu, 1, pg_temp.refs('iptu', '{2,3,4,5,6,7,8,9,10}'));
  assert res -> 'changed' = '9'::jsonb and (res #>> '{series,version}')::int = 1 and jsonb_array_length(res -> 'occurrences') = 1
     and res #> '{series,skipped_numbers}' = '[2, 3, 4, 5, 6, 7, 8, 9, 10]'::jsonb and (res #>> '{series,open_count}')::int = 0
     and (res #>> '{series,paid_count}')::int = 1, 'passo 13: 9 parcelas tiradas; a série não muda de versão';
  assert pg_temp.occs('iptu') = '1:2027-02-10:18990:false:true:quitado', 'passo 13: só a n1, paga';
  assert pg_temp.gone('iptu') = '2:3:true:a5 3:3:true:a5 4:3:true:a5 5:3:true:a5 6:3:true:a5 7:3:true:a5 8:3:true:a5 9:3:true:a5 10:3:true:a5',
    'tiradas: excluídas, marcadas, com autoria e versão + 1';
  assert (select (action, target_id) from public.record_operations where idempotency_key = 'a3-a-0013b') = ('tirar_ano'::text, iptu),
    'operação tirar_ano';
  assert (select (count(*), sum(amount_cents)) from public.financial_records where commitment_id = pg_temp.id('iptu1') and deleted_at is null)
    = (1::bigint, 170910::numeric), 'passo 13: um gasto de 1.709,10';
  perform pg_temp.check_series('ctx');
  assert pg_temp.to_pay('ctx', '2027-02-01') = array[0, 0, 0, 0]::bigint[], 'passo 13: Ainda a pagar 0';
  assert pg_temp.to_pay('ctx', '2027-03-01') = array[0, 0, 0, 0]::bigint[], 'março: a parcela 2 saiu';
  assert pg_temp.totals('ctx', '2027-02-01') = array[0, 170910, -170910]::bigint[], 'passo 13: Pago 1.709,10';

  assert pg_temp.sync('ctx') = '{"created": 0, "created_overdue": 0}'::jsonb, 'passo 14: nada recriado';
  assert pg_temp.occs('iptu') = '1:2027-02-10:18990:false:true:quitado', 'passo 14: IPTU igual';
  perform pg_temp.check_series('ctx');
  assert pg_temp.totals('ctx', '2027-02-01') = array[0, 170910, -170910]::bigint[], 'passo 14: Pago igual';

  res := public.undo_commitment_payment('a3-a-0015', pg_temp.id('iptu1'), 3);
  assert res #>> '{commitment,status}' = 'aberto' and (res #>> '{commitment,version}')::int = 4, 'passo 15: n1 reaberta';
  assert pg_temp.sync('ctx') = '{"created": 0, "created_overdue": 0}'::jsonb, 'passo 15: n2 a n10 não voltam';
  assert pg_temp.occs('iptu') = '1:2027-02-10:18990:false:true:aberto', 'passo 15: n1 em aberto, 189,90';
  assert (select skipped_numbers from public.series_items where id = iptu) = '[2, 3, 4, 5, 6, 7, 8, 9, 10]'::jsonb, 'passo 15: tiradas continuam';
  perform pg_temp.check_series('ctx');
  assert pg_temp.to_pay('ctx', '2027-02-01') = array[18990, 0, 18990, 1]::bigint[], 'passo 15: Ainda a pagar 189,90';
  assert pg_temp.totals('ctx', '2027-02-01') = array[0, 0, 0]::bigint[], 'passo 15: Pago 0';

  perform public.pay_commitment('a3-a-0016', pg_temp.id('iptu1'), 4, acc, 170910, '2027-02-10');
  perform pg_temp.check_series('ctx');
  assert pg_temp.to_pay('ctx', '2027-02-01') = array[0, 0, 0, 0]::bigint[], 'passo 16: Ainda a pagar 0';
  assert pg_temp.totals('ctx', '2027-02-01') = array[0, 170910, -170910]::bigint[], 'passo 16: Pago 1.709,10';
end $$;

-- Passo 17: sugestão do IPVA aceita, a partir da conta de 2028 (n2, ainda não criada).
-- Passo 18 (01/11/2027) e 19 (01/12/2027): gerar. Passo 20: encerrar o IPVA em 2028. Passo 21 (01/11/2028): gerar.
do $$
declare
  ipva uuid := pg_temp.id('ipva');
  res jsonb;
begin
  res := public.update_series_from('a3-a-0017', ipva, 1, 2, '[]', 'conta', 'IPVA', 'Transporte', 251230, 'variavel', 20);
  assert res -> 'changed' = '0'::jsonb and (res #>> '{series,version}')::int = 2, 'passo 17: nenhuma conta muda; série versão 2';
  assert pg_temp.terms('ipva') = '1:240000:variavel:20 2:251230:variavel:20', 'passo 17: vigência nova em n2';
  perform pg_temp.check_series('ctx');
  assert pg_temp.to_pay('ctx', '2027-02-01') = array[0, 0, 0, 0]::bigint[] and pg_temp.totals('ctx', '2027-02-01') = array[0, 170910, -170910]::bigint[],
    'passo 17: totais iguais';

  set local clarevo.today = '2027-11-01';
  assert pg_temp.sync('ctx') = '{"created": 2, "created_overdue": 0}'::jsonb, 'passo 18: IPVA de 2028 e Matrícula de 2027';
  assert pg_temp.occs('ipva') = '1:2027-01-20:251230:false:true:quitado 2:2028-01-20:251230:true:false:aberto',
    'passo 18: IPVA n2 20/01/2028, 2.512,30 estimado';
  assert pg_temp.occs('matricula') = '1:2026-12-10:120000:false:false:quitado 2:2027-12-10:120000:false:false:aberto', 'passo 18: Matrícula n2';
  assert pg_temp.occs('iptu') = '1:2027-02-10:18990:false:true:quitado', 'passo 18: IPTU de 2028 ainda não';
  perform pg_temp.check_series('ctx');
  assert pg_temp.to_pay('ctx', '2027-11-01') = array[0, 0, 0, 0]::bigint[] and pg_temp.totals('ctx', '2027-11-01') = array[0, 0, 0]::bigint[],
    'passo 18: Ainda a pagar 0 e Pago 0';

  set local clarevo.today = '2027-12-01';
  assert pg_temp.sync('ctx') = '{"created": 10, "created_overdue": 0}'::jsonb, 'passo 19: IPTU n11 a n20';
  assert pg_temp.occs('iptu') = '1:2027-02-10:18990:false:true:quitado 11:2028-02-10:18000:true:false:aberto '
    '12:2028-03-10:18000:true:false:aberto 13:2028-04-10:18000:true:false:aberto 14:2028-05-10:18000:true:false:aberto '
    '15:2028-06-10:18000:true:false:aberto 16:2028-07-10:18000:true:false:aberto 17:2028-08-10:18000:true:false:aberto '
    '18:2028-09-10:18000:true:false:aberto 19:2028-10-10:18000:true:false:aberto 20:2028-11-10:18000:true:false:aberto',
    'passo 19: 180 estimados (o valor informado valeu só em 2027)';
  perform pg_temp.check_series('ctx');
  assert pg_temp.to_pay('ctx', '2027-12-01') = array[120000, 0, 120000, 1]::bigint[], 'passo 19: Ainda a pagar 1.200';
  assert pg_temp.totals('ctx', '2027-12-01') = array[0, 0, 0]::bigint[], 'passo 19: Pago 0';
  assert pg_temp.to_pay('ctx', '2028-01-01') = array[251230, 0, 251230, 1]::bigint[], 'janeiro de 2028: IPVA pela referência nova';

  res := public.end_series('a3-a-0020', ipva, 2, 2, '[]');
  assert res -> 'changed' = '0'::jsonb and (res #>> '{series,last_number}')::int = 2 and (res #>> '{series,version}')::int = 3
     and jsonb_array_length(res -> 'occurrences') = 2, 'passo 20: IPVA termina em 2028; nada sai';
  perform pg_temp.check_series('ctx');
  assert pg_temp.to_pay('ctx', '2027-12-01') = array[120000, 0, 120000, 1]::bigint[], 'passo 20: Ainda a pagar 1.200';

  set local clarevo.today = '2028-11-01';
  assert pg_temp.sync('ctx') = '{"created": 1, "created_overdue": 0}'::jsonb, 'passo 21: só a Matrícula de 2028';
  assert pg_temp.occs('ipva') = '1:2027-01-20:251230:false:true:quitado 2:2028-01-20:251230:true:false:aberto', 'passo 21: IPVA de 2029 não';
  assert pg_temp.occs('matricula') = '1:2026-12-10:120000:false:false:quitado 2:2027-12-10:120000:false:false:aberto '
    '3:2028-12-10:120000:false:false:aberto', 'passo 21: Matrícula n3 10/12/2028';
  assert (select max(occurrence_number) from public.commitment_items where series_id = pg_temp.id('iptu')) = 20, 'passo 21: IPTU de 2029 ainda não';
  perform pg_temp.check_series('ctx');
end $$;

-- Depois da sequência (01/11/2028), no segundo ano do IPTU: "Só esta conta" mantém o mês; "esta e as próximas" com dia
-- novo mantém cada parcela no mês dela; levar uma parcela para outro mês é recusado.
do $$
declare
  iptu uuid := pg_temp.id('iptu');
  res jsonb;
begin
  res := public.update_commitment('a3-a-0022', pg_temp.occ('iptu', 11), 1, 18000, '2028-02-29', 'IPTU', 'Moradia');
  assert res #>> '{commitment,due_on}' = '2028-02-29' and res #> '{commitment,series_override}' = 'true'::jsonb
     and res #> '{commitment,amount_is_estimate}' = 'true'::jsonb and (res #>> '{commitment,series_parts_per_year}')::int = 10,
    'n11: 29/02/2028 no mês dela; alterada só neste ano';
  res := public.update_series_from('a3-a-0023', iptu, 1, 12, pg_temp.refs('iptu', '{12,13,14,15,16,17,18,19,20}'), 'conta', 'IPTU', 'Moradia',
                                   19500, 'variavel', 31);
  assert res -> 'changed' = '9'::jsonb and (res #>> '{series,version}')::int = 2, 'a partir da n12: 9 parcelas';
  assert pg_temp.occs('iptu') = '1:2027-02-10:18990:false:true:quitado 11:2028-02-29:18000:true:true:aberto '
    '12:2028-03-31:19500:true:false:aberto 13:2028-04-30:19500:true:false:aberto 14:2028-05-31:19500:true:false:aberto '
    '15:2028-06-30:19500:true:false:aberto 16:2028-07-31:19500:true:false:aberto 17:2028-08-31:19500:true:false:aberto '
    '18:2028-09-30:19500:true:false:aberto 19:2028-10-31:19500:true:false:aberto 20:2028-11-30:19500:true:false:aberto',
    'dia 31 em cada mês de março a novembro de 2028; a n11 (alterada só neste ano) e a n1 (paga) não mudam';
  perform pg_temp.expect_error(format($f$select public.update_commitment('a3-a-0024', %L, 2, 19500, '2028-05-01', 'IPTU', 'Moradia')$f$,
    pg_temp.occ('iptu', 13)), 'vencimento_fora_do_mes');
  assert pg_temp.sync('ctx') = '{"created": 0, "created_overdue": 0}'::jsonb, 'nada novo';
  perform pg_temp.check_series('ctx');
end $$;

-- 4. Ausência longa. Gil cria o IPTU em 07/10/2026 e ninguém abre o app até 15/06/2028.
-- Iara cria o mesmo IPTU e só abre o app em 01/12/2027 (linha "sem nenhuma criada antes" da tabela de geração).
set local clarevo.today = '2026-10-07';
select set_config('request.jwt.claim.sub', :gil, true);
with r as (
  select public.create_series('a3-g-0001', pg_temp.id('gil_ctx'), 'anual', 'conta', 'IPTU', 'Moradia', 18000, 'variavel', 10,
                              '2027-02-01', 1, null, null, 10) as res
) insert into ids select 'gil_iptu', (res #>> '{series,id}')::uuid from r;
select set_config('request.jwt.claim.sub', :iara, true);
with r as (
  select public.create_series('a3-g-0002', pg_temp.id('iara_ctx'), 'anual', 'conta', 'IPTU', 'Moradia', 18000, 'variavel', 10,
                              '2027-02-01', 1, null, null, 10) as res
) insert into ids select 'iara_iptu', (res #>> '{series,id}')::uuid from r;
do $$ begin
  set local clarevo.today = '2027-12-01';
  assert pg_temp.sync('iara_ctx') = '{"created": 11, "created_overdue": 1}'::jsonb, '01/12/2027: n10 (vencida) e n11 a n20';
  assert pg_temp.occs('iara_iptu') = '10:2027-11-10:18000:true:false:aberto 11:2028-02-10:18000:true:false:aberto '
    '12:2028-03-10:18000:true:false:aberto 13:2028-04-10:18000:true:false:aberto 14:2028-05-10:18000:true:false:aberto '
    '15:2028-06-10:18000:true:false:aberto 16:2028-07-10:18000:true:false:aberto 17:2028-08-10:18000:true:false:aberto '
    '18:2028-09-10:18000:true:false:aberto 19:2028-10-10:18000:true:false:aberto 20:2028-11-10:18000:true:false:aberto',
    'n1 a n9 ficam sem conta registrada';
  assert pg_temp.sync('iara_ctx') = '{"created": 0, "created_overdue": 0}'::jsonb, 'gerar de novo não cria nada';
  perform pg_temp.check_series('iara_ctx');
end $$;
select set_config('request.jwt.claim.sub', :gil, true);
do $$ begin
  set local clarevo.today = '2028-06-15';
  assert pg_temp.sync('gil_ctx') = '{"created": 7, "created_overdue": 2}'::jsonb, '15/06/2028: 7 contas, 2 vencidas (10/05 e 10/06/2028)';
  assert pg_temp.occs('gil_iptu') = '14:2028-05-10:18000:true:false:aberto 15:2028-06-10:18000:true:false:aberto '
    '16:2028-07-10:18000:true:false:aberto 17:2028-08-10:18000:true:false:aberto 18:2028-09-10:18000:true:false:aberto '
    '19:2028-10-10:18000:true:false:aberto 20:2028-11-10:18000:true:false:aberto', 'n14 a n20';
  assert pg_temp.sync('gil_ctx') = '{"created": 0, "created_overdue": 0}'::jsonb, 'gerar de novo não cria nada';
  perform pg_temp.check_series('gil_ctx');
end $$;
reset role;
do $$ begin
  assert (select count(*) from public.commitments where series_id = pg_temp.id('gil_iptu') and occurrence_number <= 13) = 0,
    'números 1 a 13 sem linha (nem excluída): "sem conta registrada"';
end $$;

-- Varredura de datas (Joel): oito formas anuais, geração no dia 1 e no último dia de cada mês, de 07/10/2026 a 31/12/2030.
-- Em toda data: S10; nenhum ano entra antes de a 1ª parcela vencer até o fim do 2º mês depois do mês de hoje; todo ano
-- que já entrou tem todas as parcelas a partir do piso; gerar duas vezes não cria nada; nada é criado já vencido.
set local clarevo.today = '2026-10-07';
set role authenticated;
select set_config('request.jwt.claim.sub', :joel, true);
do $$
declare
  ctx uuid := pg_temp.id('joel_ctx');
begin
  perform public.create_series('a3-j-0001', ctx, 'anual', 'conta', 'IPVA', null, 240000, 'variavel', 20, '2027-01-01', 1, null, null, 1);
  perform public.create_series('a3-j-0002', ctx, 'anual', 'conta', 'IPTU', null, 18000, 'variavel', 10, '2027-02-01', 1, null, null, 10);
  perform public.create_series('a3-j-0003', ctx, 'anual', 'conta', 'Matrícula', null, 120000, 'fixo', 10, '2026-12-01', 1, null, null, 1);
  perform public.create_series('a3-j-0004', ctx, 'anual', 'conta', 'Seguro', null, 12000, 'variavel', 31, '2026-11-01', 1, null, null, 4);
  perform public.create_series('a3-j-0005', ctx, 'anual', 'conta', 'Clube', null, 5000, 'fixo', 5, '2027-01-01', 1, null, null, 12);
  perform public.create_series('a3-j-0006', ctx, 'anual', 'conta', 'Taxa de março', null, 9000, 'fixo', 1, '2027-03-01', 1, null, null, 1);
  perform public.create_series('a3-j-0007', ctx, 'anual', 'conta', 'Taxa de setembro', null, 9000, 'fixo', 31, '2027-09-01', 1, null, null, 1);
  perform public.create_series('a3-j-0008', ctx, 'anual', 'conta', 'Seguro do carro', null, 30000, 'fixo', 15, '2026-12-01', 2, null, null, 2);
end $$;
reset role;
create temp table seen (id uuid primary key, first_seen date not null);
do $$
declare
  ctx uuid := pg_temp.id('joel_ctx');
  v_t date;
  v_top date;
  r jsonb;
begin
  for v_t in select d from (select '2026-10-07'::date as d
                            union all select m::date from generate_series('2026-11-01'::date, '2030-12-01'::date, interval '1 month') m
                            union all select (m + interval '1 month' - interval '1 day')::date
                                        from generate_series('2026-11-01'::date, '2030-12-01'::date, interval '1 month') m) x
               order by d loop
    perform set_config('clarevo.today', v_t::text, true);
    r := public.sync_series_occurrences(ctx);
    assert (r ->> 'created_overdue')::int = 0, format('%s: nada criado já vencido', v_t);
    assert public.sync_series_occurrences(ctx) = '{"created": 0, "created_overdue": 0}'::jsonb, format('%s: gerar de novo', v_t);
    insert into seen select c.id, v_t from public.commitments c where c.context_id = ctx and c.deleted_at is null on conflict do nothing;
    perform pg_temp.check_series('joel_ctx');
    v_top := (date_trunc('month', v_t::timestamp) + interval '2 months')::date;
    assert not exists (select 1 from public.commitments c join public.commitment_series s on s.id = c.series_id
                        where s.context_id = ctx
                          and public.clarevo_series_month(s, ((c.occurrence_number - 1) / s.parts_per_year) * s.parts_per_year + 1) > v_top),
      format('%s: nenhuma parcela de ano que ainda não entrou', v_t);
    assert not exists (select 1 from public.commitment_series s, generate_series(s.first_number, s.first_number + 80) n
                        where s.context_id = ctx
                          and public.clarevo_series_month(s, ((n - 1) / s.parts_per_year) * s.parts_per_year + 1) <= v_top
                          and public.clarevo_series_month(s, n) >= '2026-09-01'
                          and not exists (select 1 from public.commitments c
                                           where c.series_id = s.id and c.occurrence_number = n and c.deleted_at is null)),
      format('%s: ano que já entrou tem todas as parcelas', v_t);
  end loop;
  assert (select string_agg(format('%s:%s', d.description, d.n), ' ' order by d.description)
            from (select min(c.description) as description, count(*) as n from public.commitments c
                   where c.context_id = ctx and c.deleted_at is null group by c.series_id) d)
    = 'Clube:60 IPTU:50 IPVA:5 Matrícula:5 Seguro:20 Seguro do carro:9 Taxa de março:4 Taxa de setembro:4',
    'contas criadas até 31/12/2030';
  -- Cota única: entra de 59 a 91 dias antes de vencer (01/03 em 01/01 de ano não bissexto; 30/09 em 01/07).
  assert (select (min(c.due_on - s2.first_seen), max(c.due_on - s2.first_seen))
            from public.commitments c join seen s2 on s2.id = c.id join public.commitment_series s on s.id = c.series_id
           where s.parts_per_year = 1) = (59, 91), 'cota única: de 59 a 91 dias antes';
  perform set_config('clarevo.today', '2026-10-07', true);
end $$;
drop table seen;

-- 5. Idempotência de create_series (Família da Elisa, 07/10/2026).
set role authenticated;
select set_config('request.jwt.claim.sub', :elisa, true);
do $$
declare
  fam uuid := pg_temp.id('fam');
  res jsonb;
  again jsonb;
begin
  res := public.create_series('a3-i-0001', fam, 'anual', 'conta', 'Seguro residencial', 'Moradia', 12000, 'variavel', 31, '2026-11-01', 1,
                              null, null, 4);
  insert into ids values ('seguro', (res #>> '{series,id}')::uuid);
  assert res -> 'changed' = '4'::jsonb and (res #>> '{series,parts_per_year}')::int = 4
     and (select bool_and((o ->> 'series_parts_per_year')::int = 4 and o ->> 'series_kind' = 'anual') from jsonb_array_elements(res -> 'occurrences') o),
    'seguro de 4 parcelas: o ano 2026/2027 inteiro';
  assert pg_temp.occs('seguro') = '1:2026-11-30:12000:true:false:aberto 2:2026-12-31:12000:true:false:aberto '
    '3:2027-01-31:12000:true:false:aberto 4:2027-02-28:12000:true:false:aberto', '30/11, 31/12, 31/01 e 28/02';
  again := public.create_series('a3-i-0001', fam, 'anual', 'conta', ' Seguro residencial ', 'Moradia', 12000, 'variavel', 31, '2026-11-01', 1,
                                null, null, 4);
  assert again -> 'series' = res -> 'series' and again -> 'occurrences' = res -> 'occurrences' and again -> 'changed' = '0'::jsonb,
    'repetição devolve o mesmo resultado';
  assert (select count(*) from public.commitment_series where context_id = fam) = 1
     and (select count(*) from public.commitments where context_id = fam) = 4, 'repetição não grava nada';
  -- Mesmo pedido com outro número de parcelas no ano, ou sem ele (13 argumentos): outro pedido.
  perform pg_temp.expect_error(format($f$select public.create_series('a3-i-0001', %L, 'anual', 'conta', 'Seguro residencial', 'Moradia', 12000,
    'variavel', 31, '2026-11-01', 1, null, null, 5)$f$, fam), 'chave_reutilizada');
  perform pg_temp.expect_error(format($f$select public.create_series('a3-i-0001', %L, 'anual', 'conta', 'Seguro residencial', 'Moradia', 12000,
    'variavel', 31, '2026-11-01', 1, null, null)$f$, fam), 'chave_reutilizada');
  perform pg_temp.expect_error(format($f$select public.inform_series_year('a3-i-0001', %L, 1, '[]', 100)$f$, pg_temp.id('seguro')),
    'chave_reutilizada');

  -- Gasto fixo com os 13 argumentos nomeados do Ciclo A: continua funcionando, com o hash da 0003.
  res := public.create_series(p_idempotency_key => 'a3-i-0002', p_context_id => fam, p_kind => 'mensal', p_nature => 'conta',
                              p_description => 'Condomínio', p_category => 'Moradia', p_amount_cents => 50000, p_amount_mode => 'fixo',
                              p_due_day => 20, p_first_due_month => '2026-10-01', p_first_number => 1, p_installment_total => null,
                              p_last_month => null);
  insert into ids values ('cond', (res #>> '{series,id}')::uuid);
  assert res -> 'changed' = '2'::jsonb and res #> '{series,parts_per_year}' = 'null'::jsonb
     and res #> '{occurrences,0,series_parts_per_year}' = 'null'::jsonb, 'mensal: sem parcelas no ano';
  assert (select request_hash from public.record_operations where idempotency_key = 'a3-i-0002')
    = md5(jsonb_build_array('criar_serie', fam, 'mensal', 'conta', 'Condomínio', 'Moradia', 50000, 'fixo', 20, '2026-10-01'::date, 1,
                            null::int, null::date)::text), 'hash idêntico ao da 0003 sem parts_per_year';
  perform pg_temp.check_series('fam');
end $$;
-- Chave gravada pela assinatura antiga (antes da migração), com o hash da 0003: a função nova a reconhece como repetição.
reset role;
insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, target_id)
select :elisa, 'a3-i-0003', 'criar_serie', pg_temp.id('fam'),
       md5(jsonb_build_array('criar_serie', pg_temp.id('fam'), 'mensal', 'conta', 'Água', 'Moradia', 9000, 'fixo', 5, '2026-11-01'::date, 1,
                             null::int, null::date)::text), pg_temp.id('cond');
set role authenticated;
do $$
declare
  fam uuid := pg_temp.id('fam');
  res jsonb;
begin
  res := public.create_series('a3-i-0003', fam, 'mensal', 'conta', 'Água', 'Moradia', 9000, 'fixo', 5, '2026-11-01', 1, null, null);
  assert res #>> '{series,id}' = pg_temp.id('cond')::text and res -> 'changed' = '0'::jsonb, 'repetição em trânsito reconhecida';
  perform pg_temp.expect_error(format($f$select public.create_series('a3-i-0003', %L, 'mensal', 'conta', 'Água', 'Moradia', 9000, 'fixo', 5,
    '2026-11-01', 1, null, null, 1)$f$, fam), 'chave_reutilizada');
  assert (select count(*) from public.commitment_series where context_id = fam) = 2, 'nenhuma série nova';
end $$;

-- 6. inform_series_year: tipo, número, valor, conjunto confirmado; pagas e não estimadas não mudam; a série não muda
-- de versão; repetição; "esta e as próximas" com as versões antigas é recusada.
do $$
declare
  seguro uuid := pg_temp.id('seguro');
  fam_acc uuid := pg_temp.id('fam_acc');
  seen jsonb;
  res jsonb;
  again jsonb;
begin
  perform pg_temp.expect_error(format($f$select public.inform_series_year('a3-n-0001', %L, 1, %L::jsonb, 100)$f$,
    pg_temp.id('cond'), pg_temp.refs('cond', '{1}')), 'tipo_invalido');
  perform pg_temp.expect_error(format($f$select public.inform_series_year('a3-n-0002', %L, 0, '[]', 0)$f$, pg_temp.id('cond')), 'tipo_invalido');
  perform pg_temp.expect_error(format($f$select public.inform_series_year('a3-n-0003', %L, 0, '[]', 0)$f$, seguro), 'numero_fora_da_serie');
  perform pg_temp.expect_error(format($f$select public.inform_series_year('a3-n-0004', %L, null, '[]', 100)$f$, seguro), 'numero_fora_da_serie');
  perform pg_temp.expect_error(format($f$select public.inform_series_year('a3-n-0005', %L, 1, %L::jsonb, 0)$f$,
    seguro, pg_temp.refs('seguro', '{1,2,3,4}')), 'valor_invalido');
  perform pg_temp.expect_error(format($f$select public.inform_series_year('a3-n-0006', %L, 1, %L::jsonb, null)$f$,
    seguro, pg_temp.refs('seguro', '{1,2,3,4}')), 'valor_invalido');
  perform pg_temp.expect_error(format($f$select public.inform_series_year('a3-n-0007', %L, 1, %L::jsonb, 1000000000)$f$,
    seguro, pg_temp.refs('seguro', '{1,2,3,4}')), 'valor_acima_do_limite');
  perform pg_temp.expect_stale(format($f$select public.inform_series_year('a3-n-0008', %L, 1, '[]', 11400)$f$, seguro), 'contas_afetadas_mudaram');
  perform pg_temp.expect_stale(format($f$select public.inform_series_year('a3-n-0009', %L, 1, null, 11400)$f$, seguro), 'contas_afetadas_mudaram');
  perform pg_temp.expect_stale(format($f$select public.inform_series_year('a3-n-0010', %L, 1, %L::jsonb, 11400)$f$,
    seguro, pg_temp.refs('seguro', '{1,2,3}')), 'contas_afetadas_mudaram');
  perform pg_temp.expect_stale(format($f$select public.inform_series_year('a3-n-0011', %L, 1, %L::jsonb, 11400)$f$,
    seguro, (select jsonb_agg(jsonb_build_object('id', id)) from public.commitment_items where series_id = seguro)), 'contas_afetadas_mudaram');
  perform pg_temp.expect_stale(format($f$select public.inform_series_year('a3-n-0012', %L, 1, %L::jsonb, 11400)$f$,
    seguro, (select jsonb_agg(jsonb_build_object('id', id, 'version', 2)) from public.commitment_items where series_id = seguro)),
    'contas_afetadas_mudaram');
  perform pg_temp.expect_stale(format($f$select public.inform_series_year('a3-n-0013', %L, 1, %L::jsonb, 11400)$f$,
    seguro, pg_temp.refs('seguro', '{1}') -> 0), 'contas_afetadas_mudaram');
  -- Ano seguinte, ainda não criado: nada a informar.
  perform pg_temp.expect_stale(format($f$select public.inform_series_year('a3-n-0014', %L, 5, '[]', 11400)$f$, seguro), 'contas_afetadas_mudaram');
  assert (select count(*) from public.record_operations where idempotency_key like 'a3-n-00%') = 0, 'recusas não gravam operação';
  assert (select array_agg(distinct version) from public.commitment_items where series_id = seguro) = array[1], 'recusas não mudam nada';

  -- n1 paga e n2 com valor informado só nela: ficam fora do conjunto.
  perform public.pay_commitment('a3-n-0101', pg_temp.occ('seguro', 1), 1, fam_acc, 12000, '2026-10-07');
  perform public.update_commitment('a3-n-0102', pg_temp.occ('seguro', 2), 1, 12500, '2026-12-31', 'Seguro residencial', 'Moradia', false);
  perform pg_temp.expect_stale(format($f$select public.inform_series_year('a3-n-0103', %L, 3, %L::jsonb, 11400)$f$,
    seguro, pg_temp.refs('seguro', '{1,2,3,4}')), 'contas_afetadas_mudaram');
  seen := pg_temp.refs('seguro', '{3,4}');
  res := public.inform_series_year('a3-n-0104', seguro, 3, seen, 11400);
  assert res -> 'changed' = '2'::jsonb and (res #>> '{series,version}')::int = 1 and pg_temp.sver('seguro') = 1,
    'qualquer número do ano serve; 2 parcelas; a série não muda de versão';
  assert pg_temp.occs('seguro') = '1:2026-11-30:12000:true:false:quitado 2:2026-12-31:12500:false:true:aberto '
    '3:2027-01-31:11400:false:true:aberto 4:2027-02-28:11400:false:true:aberto', 'paga e já informada não mudam';
  assert (select array_agg(version order by occurrence_number) from public.commitment_items where series_id = seguro) = array[2, 2, 2, 2],
    'versões: paga 2, informada só nela 2, informadas no ano 2';
  assert pg_temp.terms('seguro') = '1:12000:variavel:31', 'a vigência não muda';
  again := public.inform_series_year('a3-n-0104', seguro, 3, seen, 11400);
  assert again -> 'series' = res -> 'series' and again -> 'occurrences' = res -> 'occurrences' and again -> 'changed' = '0'::jsonb,
    'repetição devolve o mesmo resultado';
  -- Nada mais a informar no ano.
  perform pg_temp.expect_stale(format($f$select public.inform_series_year('a3-n-0105', %L, 1, '[]', 11000)$f$, seguro), 'contas_afetadas_mudaram');
  -- "Esta e as próximas" com as versões vistas antes de informar.
  perform pg_temp.expect_stale(format($f$select public.update_series_from('a3-n-0106', %L, 1, 3, %L::jsonb, 'conta', 'Seguro residencial', 'Moradia',
    11000, 'fixo', 15)$f$, seguro, seen), 'contas_afetadas_mudaram');
  perform pg_temp.check_series('fam');
end $$;

-- 7. skip_series_year: tira só as em aberto; a geração não recria; desfazer o pagamento não traz as tiradas;
-- repetição; conjunto diferente é recusado.
do $$
declare
  fam uuid := pg_temp.id('fam');
  material uuid;
  seen jsonb;
  res jsonb;
  again jsonb;
begin
  res := public.create_series('a3-t-0001', fam, 'anual', 'conta', 'Material escolar', 'Educação', 30000, 'fixo', 10, '2026-11-01', 1, null, null, 3);
  material := (res #>> '{series,id}')::uuid;
  insert into ids values ('material', material);
  assert pg_temp.occs('material') = '1:2026-11-10:30000:false:false:aberto 2:2026-12-10:30000:false:false:aberto '
    '3:2027-01-10:30000:false:false:aberto', 'material: 3 parcelas de novembro a janeiro';
  perform pg_temp.expect_error(format($f$select public.skip_series_year('a3-t-0002', %L, 1, %L::jsonb)$f$,
    pg_temp.id('cond'), pg_temp.refs('cond', '{1,2}')), 'tipo_invalido');
  perform pg_temp.expect_error(format($f$select public.skip_series_year('a3-t-0003', %L, 0, '[]')$f$, material), 'numero_fora_da_serie');
  perform pg_temp.expect_error(format($f$select public.skip_series_year('a3-t-0004', %L, null, '[]')$f$, material), 'numero_fora_da_serie');

  -- "Paguei o ano todo de uma vez": paga a n1 com o total e tira as demais.
  perform public.pay_commitment('a3-t-0101', pg_temp.occ('material', 1), 1, pg_temp.id('fam_acc'), 81000, '2026-10-07');
  perform pg_temp.expect_stale(format($f$select public.skip_series_year('a3-t-0102', %L, 1, %L::jsonb)$f$,
    material, pg_temp.refs('material', '{2}')), 'contas_afetadas_mudaram');
  perform pg_temp.expect_stale(format($f$select public.skip_series_year('a3-t-0103', %L, 1, %L::jsonb)$f$,
    material, pg_temp.refs('material', '{1,2,3}')), 'contas_afetadas_mudaram');
  perform pg_temp.expect_stale(format($f$select public.skip_series_year('a3-t-0104', %L, 1, '[]')$f$, material), 'contas_afetadas_mudaram');
  assert (select count(*) from public.record_operations where idempotency_key like 'a3-t-010%' and action = 'tirar_ano') = 0,
    'recusas não gravam operação';
  seen := pg_temp.refs('material', '{2,3}');
  res := public.skip_series_year('a3-t-0105', material, 2, seen);
  assert res -> 'changed' = '2'::jsonb and (res #>> '{series,version}')::int = 1 and res #> '{series,skipped_numbers}' = '[2, 3]'::jsonb
     and (res #>> '{series,open_count}')::int = 0 and (res #>> '{series,paid_count}')::int = 1, 'n2 e n3 tiradas; a paga continua';
  assert pg_temp.occs('material') = '1:2026-11-10:30000:false:false:quitado', 'só a n1, paga';
  assert pg_temp.gone('material') = '2:2:true:a5 3:2:true:a5', 'n2 e n3 excluídas com a marca, pela Elisa';
  assert not exists (select 1 from public.financial_records where commitment_id in (select (e ->> 'id')::uuid from jsonb_array_elements(seen) e)),
    'tiradas sem gasto vinculado (I1)';
  assert pg_temp.sync('fam') = '{"created": 0, "created_overdue": 0}'::jsonb, 'a geração não recria as tiradas';
  again := public.skip_series_year('a3-t-0105', material, 2, seen);
  assert again -> 'series' = res -> 'series' and again -> 'occurrences' = res -> 'occurrences' and again -> 'changed' = '0'::jsonb,
    'repetição devolve o mesmo resultado';
  perform pg_temp.expect_error(format($f$select public.skip_series_year('a3-t-0105', %L, 3, %L::jsonb)$f$, material, seen), 'chave_reutilizada');

  res := public.undo_commitment_payment('a3-t-0106', pg_temp.occ('material', 1), 2);
  assert res #>> '{commitment,status}' = 'aberto', 'pagamento desfeito';
  assert pg_temp.sync('fam') = '{"created": 0, "created_overdue": 0}'::jsonb, 'desfazer não traz n2 e n3 de volta';
  assert pg_temp.occs('material') = '1:2026-11-10:30000:false:false:aberto' and pg_temp.sver('material') = 1
     and (select skipped_numbers from public.series_items where id = material) = '[2, 3]'::jsonb, 'n1 em aberto; n2 e n3 continuam fora';
  perform pg_temp.expect_stale(format($f$select public.skip_series_year('a3-t-0107', %L, 1, %L::jsonb)$f$, material, seen), 'contas_afetadas_mudaram');
  perform pg_temp.check_series('fam');
end $$;

-- 8. "Esta e as próximas" numa conta do ano: natureza 'conta'; limite do número; dia novo mantém cada parcela no mês
-- dela; "Só esta conta" não muda o mês.
do $$
declare
  fam uuid := pg_temp.id('fam');
  escolar uuid;
  res jsonb;
begin
  res := public.create_series('a3-e-0001', fam, 'anual', 'conta', 'Uniforme', 'Educação', 10000, 'fixo', 5, '2026-11-01', 1, null, null, 4);
  escolar := (res #>> '{series,id}')::uuid;
  insert into ids values ('escolar', escolar);
  assert pg_temp.occs('escolar') = '1:2026-11-05:10000:false:false:aberto 2:2026-12-05:10000:false:false:aberto '
    '3:2027-01-05:10000:false:false:aberto 4:2027-02-05:10000:false:false:aberto', 'uniforme: 4 parcelas';
  perform pg_temp.expect_error(format($f$select public.update_series_from('a3-e-0101', %L, 1, 1, %L::jsonb, 'financiamento', 'Uniforme', null, 1,
    'fixo', 1)$f$, escolar, pg_temp.refs('escolar', '{1,2,3,4}')), 'natureza_invalida');
  perform pg_temp.expect_error(format($f$select public.update_series_from('a3-e-0102', %L, 1, 1, %L::jsonb, 'compra_parcelada', 'Uniforme', null, 1,
    'fixo', 1)$f$, escolar, pg_temp.refs('escolar', '{1,2,3,4}')), 'natureza_invalida');
  perform pg_temp.expect_error(format($f$select public.update_series_from('a3-e-0103', %L, 1, 1, %L::jsonb, null, 'Uniforme', null, 1,
    'fixo', 1)$f$, escolar, pg_temp.refs('escolar', '{1,2,3,4}')), 'natureza_invalida');
  -- Sem término, até a última parcela do ano que começa até outubro de 2027: 4 (o ano de novembro de 2027 fica fora).
  perform pg_temp.expect_error(format($f$select public.update_series_from('a3-e-0104', %L, 1, 5, '[]', 'conta', 'Uniforme', null, 1, 'fixo', 1)$f$,
    escolar), 'numero_fora_da_serie');
  perform pg_temp.expect_error(format($f$select public.update_series_from('a3-e-0105', %L, 1, 0, '[]', 'conta', 'Uniforme', null, 1, 'fixo', 1)$f$,
    escolar), 'numero_fora_da_serie');
  assert pg_temp.sver('escolar') = 1, 'recusas não mudam a série';

  res := public.update_series_from('a3-e-0106', escolar, 1, 1, pg_temp.refs('escolar', '{1,2,3,4}'), 'conta', 'Uniforme', 'Educação', 10500,
                                   'fixo', 31);
  assert res -> 'changed' = '4'::jsonb and (res #>> '{series,version}')::int = 2 and res #>> '{series,nature}' = 'conta', 'as 4 parcelas mudam';
  assert pg_temp.occs('escolar') = '1:2026-11-30:10500:false:false:aberto 2:2026-12-31:10500:false:false:aberto '
    '3:2027-01-31:10500:false:false:aberto 4:2027-02-28:10500:false:false:aberto', 'dia 31: cada parcela no mês dela';
  assert pg_temp.terms('escolar') = '1:10500:fixo:31', 'vigência substituída';

  perform pg_temp.expect_error(format($f$select public.update_commitment('a3-e-0107', %L, 2, 10500, '2027-02-05', 'Uniforme', 'Educação')$f$,
    pg_temp.occ('escolar', 3)), 'vencimento_fora_do_mes');
  res := public.update_commitment('a3-e-0108', pg_temp.occ('escolar', 3), 2, 10500, '2027-01-10', 'Uniforme', 'Educação');
  assert res #>> '{commitment,due_on}' = '2027-01-10' and res #> '{commitment,series_override}' = 'true'::jsonb, 'só esta conta, no mesmo mês';

  -- Conta do ano que começa daqui a mais de 12 meses: a partir de qualquer número do primeiro ano (reajuste programado).
  res := public.create_series('a3-e-0002', fam, 'anual', 'conta', 'Taxa futura', null, 5000, 'fixo', 10, '2028-01-01', 1, null, null, 2);
  insert into ids values ('futura', (res #>> '{series,id}')::uuid);
  assert res -> 'changed' = '0'::jsonb, 'nada criado';
  res := public.update_series_from('a3-e-0109', pg_temp.id('futura'), 1, 2, '[]', 'conta', 'Taxa futura', null, 5500, 'fixo', 10);
  assert pg_temp.terms('futura') = '1:5000:fixo:10 2:5500:fixo:10', 'reajuste na parcela 2 do primeiro ano';
  perform pg_temp.expect_error(format($f$select public.update_series_from('a3-e-0110', %L, 2, 3, '[]', 'conta', 'Taxa futura', null, 1, 'fixo', 1)$f$,
    pg_temp.id('futura')), 'numero_fora_da_serie');
  perform pg_temp.check_series('fam');
end $$;

-- 9. Encerrar e retomar uma conta do ano: limites, conta paga depois, retomada dentro da janela anual.
do $$
declare
  escolar uuid := pg_temp.id('escolar');
  res jsonb;
begin
  perform pg_temp.expect_error(format($f$select public.end_series('a3-f-0001', %L, 2, -1, '[]')$f$, escolar), 'fim_invalido');
  perform pg_temp.expect_error(format($f$select public.end_series('a3-f-0002', %L, 2, 201, '[]')$f$, escolar), 'fim_invalido');
  perform pg_temp.expect_stale(format($f$select public.end_series('a3-f-0003', %L, 1, 3, '[]')$f$, escolar), 'versao_atual=2');
  perform public.pay_commitment('a3-f-0004', pg_temp.occ('escolar', 3), 3, pg_temp.id('fam_acc'), 10500, '2026-10-07');
  perform pg_temp.expect_error(format($f$select public.end_series('a3-f-0005', %L, 2, 2, %L::jsonb)$f$, escolar, pg_temp.refs('escolar', '{4}')),
    'serie_tem_pagamento_posterior');
  perform pg_temp.expect_error(format($f$select public.end_series('a3-f-0006', %L, 2, 0, %L::jsonb)$f$, escolar, pg_temp.refs('escolar', '{1,2,4}')),
    'serie_tem_pagamento_posterior');
  perform pg_temp.expect_stale(format($f$select public.end_series('a3-f-0007', %L, 2, 3, '[]')$f$, escolar), 'contas_afetadas_mudaram');
  assert pg_temp.sver('escolar') = 2, 'recusas não mudam a série';

  res := public.end_series('a3-f-0008', escolar, 2, 3, pg_temp.refs('escolar', '{4}'));
  assert res -> 'changed' = '1'::jsonb and (res #>> '{series,last_number}')::int = 3 and (res #>> '{series,version}')::int = 3,
    'termina na parcela 3; a 4 sai';
  assert (select skipped_numbers from public.series_items where id = escolar) = '[]'::jsonb and pg_temp.gone('escolar') = '4:3:false:a5',
    'encerrar exclui sem marcar número tirado';
  perform pg_temp.expect_error(format($f$select public.inform_series_year('a3-f-0009', %L, 4, '[]', 100)$f$, escolar), 'numero_fora_da_serie');
  perform pg_temp.expect_error(format($f$select public.skip_series_year('a3-f-0010', %L, 4, '[]')$f$, escolar), 'numero_fora_da_serie');
  perform pg_temp.expect_error(format($f$select public.update_series_from('a3-f-0011', %L, 3, 4, '[]', 'conta', 'Uniforme', null, 1, 'fixo', 1)$f$,
    escolar), 'numero_fora_da_serie');

  res := public.end_series('a3-f-0012', escolar, 3, null, '[]');
  assert res -> 'changed' = '0'::jsonb and res #>> '{series,last_number}' is null and (res #>> '{series,version}')::int = 4,
    'retomada sem data para terminar';
  assert pg_temp.occs('escolar') = '1:2026-11-30:10500:false:false:aberto 2:2026-12-31:10500:false:false:aberto '
    '3:2027-01-10:10500:false:true:quitado 4:2027-02-28:10500:false:false:aberto', 'a n4 volta pela vigência atual; o ano seguinte ainda não';
  res := public.end_series('a3-f-0013', escolar, 4, 200, '[]');
  assert (res #>> '{series,last_number}')::int = 200 and res -> 'changed' = '0'::jsonb, 'último número 50 × 4 aceito';
  res := public.end_series('a3-f-0014', escolar, 5, null, '[]');
  assert res #>> '{series,last_number}' is null, 'retomada de novo';
  perform pg_temp.check_series('fam');
end $$;

-- 10. Forma (S9), gatilhos e S8 com escrita direta do backend (cada caso desfeito no próprio bloco).
reset role;
select pg_temp.expect_error(format($$insert into public.commitment_series (context_id, kind, nature, first_due_month, first_number, parts_per_year, created_by)
  values (%L, 'anual', 'conta', '2027-01-01', 1, %s, %L)$$, pg_temp.id('ctx'), k, :elisa), '%commitment_series_forma%')
  from unnest(array['0', '13', 'null']) k;
select pg_temp.expect_error(format($$insert into public.commitment_series (context_id, kind, nature, first_due_month, first_number, parts_per_year, created_by)
  values (%L, 'anual', 'financiamento', '2027-01-01', 1, 1, %L)$$, pg_temp.id('ctx'), :elisa), '%commitment_series_forma%');
select pg_temp.expect_error(format($$insert into public.commitment_series (context_id, kind, nature, first_due_month, first_number, parts_per_year, created_by)
  values (%L, 'anual', 'conta', '2027-01-01', 3, 2, %L)$$, pg_temp.id('ctx'), :elisa), '%commitment_series_forma%');
select pg_temp.expect_error(format($$insert into public.commitment_series (context_id, kind, nature, first_due_month, first_number, parts_per_year, installment_total, created_by)
  values (%L, 'anual', 'conta', '2027-01-01', 1, 12, 12, %L)$$, pg_temp.id('ctx'), :elisa), '%commitment_series_forma%');
select pg_temp.expect_error(format($$insert into public.commitment_series (context_id, kind, nature, first_due_month, first_number, parts_per_year, last_number, created_by)
  values (%L, 'anual', 'conta', '2027-01-01', 1, 1, 51, %L)$$, pg_temp.id('ctx'), :elisa), '%commitment_series_forma%');
select pg_temp.expect_error(format($$insert into public.commitment_series (context_id, kind, nature, first_due_month, first_number, parts_per_year, last_number, created_by)
  values (%L, 'anual', 'conta', '2027-01-01', 3, 4, 1, %L)$$, pg_temp.id('ctx'), :elisa), '%commitment_series_forma%');
select pg_temp.expect_error(format($$insert into public.commitment_series (context_id, kind, nature, first_due_month, first_number, parts_per_year, created_by)
  values (%L, 'mensal', 'conta', '2027-01-01', 1, 1, %L)$$, pg_temp.id('ctx'), :elisa), '%commitment_series_forma%');
select pg_temp.expect_error(format($$insert into public.commitment_series (context_id, kind, nature, first_due_month, first_number, last_number, installment_total, parts_per_year, created_by)
  values (%L, 'parcelada', 'financiamento', '2027-01-01', 1, 12, 12, 1, %L)$$, pg_temp.id('ctx'), :elisa), '%commitment_series_forma%');
-- Tipo fora da lista: a forma (conferida antes, em ordem alfabética) já recusa; commitment_series_kind_check está na 14.
select pg_temp.expect_error(format($$insert into public.commitment_series (context_id, kind, nature, first_due_month, first_number, parts_per_year, created_by)
  values (%L, 'semanal', 'conta', '2027-01-01', 1, 1, %L)$$, pg_temp.id('ctx'), :elisa), '%commitment_series_forma%');
-- Limites aceitos pela forma (desfeitos): 12 parcelas e último número 50 × k; encerrada sem conta (first_number - 1).
do $$
begin
  begin
    insert into public.commitment_series (context_id, kind, nature, first_due_month, first_number, parts_per_year, last_number, created_by)
      values (pg_temp.id('ctx'), 'anual', 'conta', '2027-01-01', 12, 12, 600, '00000000-0000-0000-0000-0000000000a5'),
             (pg_temp.id('ctx'), 'anual', 'conta', '2027-01-01', 3, 4, 2, '00000000-0000-0000-0000-0000000000a5');
    raise exception 'desfeito';
  exception when others then
    if sqlerrm <> 'desfeito' then
      raise exception 'formas válidas deveriam passar: %', sqlerrm;
    end if;
  end;
end $$;
-- parts_per_year é imutável, como a forma e o início.
select pg_temp.expect_error(format($$update public.commitment_series set parts_per_year = 2 where id = %L$$, pg_temp.id('ipva')), 'campo_imutavel');
select pg_temp.expect_error(format($$update public.commitment_series set parts_per_year = null where id = %L$$, pg_temp.id('iptu')), 'campo_imutavel');
select pg_temp.expect_error(format($$update public.commitment_series set parts_per_year = 1 where id = %L$$, pg_temp.id('cond')), 'campo_imutavel');
-- S8 pelo mês da parcela: a n11 do IPTU (fevereiro de 2028) não vai para dezembro de 2027.
select pg_temp.expect_error(format($$update public.commitments set due_on = '2027-12-10' where id = %L; set constraints all immediate$$,
  pg_temp.occ('iptu', 11)), 'serie_inconsistente');
select pg_temp.expect_error(format($$update public.commitments set due_on = '2029-02-10' where id = %L; set constraints all immediate$$,
  pg_temp.occ('iptu', 11)), 'serie_inconsistente');
-- S3: parcela tirada do ano é permanente (nem a marca, nem a linha somem).
select pg_temp.expect_error(format($$update public.commitments set series_skipped = false where series_id = %L and occurrence_number = 2$$,
  pg_temp.id('material')), 'campo_imutavel');
select pg_temp.expect_error(format($$delete from public.commitments where series_id = %L and occurrence_number = 2; set constraints all immediate$$,
  pg_temp.id('material')), 'serie_inconsistente');
select pg_temp.check_series();

-- 11. Permissões.
set role authenticated;
-- Gil (externo): não vê a família e não descobre que as contas do ano existem.
select set_config('request.jwt.claim.sub', :gil, true);
do $$ begin
  assert (select count(*) from public.series_items where context_id = pg_temp.id('fam')) = 0
     and (select count(*) from public.commitment_items where context_id = pg_temp.id('fam')) = 0, 'Gil não lê a família';
end $$;
select pg_temp.expect_error(format($$select public.inform_series_year('a3-p-0001', %L, 1, '[]', 100)$$, pg_temp.id('seguro')), 'nao_encontrado');
select pg_temp.expect_error(format($$select public.skip_series_year('a3-p-0002', %L, 1, '[]')$$, pg_temp.id('material')), 'nao_encontrado');
select pg_temp.expect_error(format($$select public.create_series('a3-p-0003', %L, 'anual', 'conta', 'Intruso', null, 100, 'fixo', 10,
  '2027-01-01', 1, null, null, 1)$$, pg_temp.id('fam')), 'sem_permissao');
select pg_temp.expect_error(format($$select public.sync_series_occurrences(%L)$$, pg_temp.id('fam')), 'sem_permissao');

-- Fábio (só leitura): lê, não grava, mas a abertura do app dispara a geração com a autoria da Elisa.
select set_config('request.jwt.claim.sub', :fabio, true);
do $$ begin
  assert (select parts_per_year from public.series_items where id = pg_temp.id('seguro')) = 4
     and (select array_agg(distinct series_parts_per_year) from public.commitment_items where series_id = pg_temp.id('seguro')) = array[4::smallint],
    'Fábio lê a conta do ano e as parcelas';
end $$;
select pg_temp.expect_error(format($$select public.inform_series_year('a3-p-0101', %L, 1, %L::jsonb, 100)$$,
  pg_temp.id('escolar'), pg_temp.refs('escolar', '{1,2,4}')), 'sem_permissao');
select pg_temp.expect_error(format($$select public.skip_series_year('a3-p-0102', %L, 1, %L::jsonb)$$,
  pg_temp.id('material'), pg_temp.refs('material', '{1}')), 'sem_permissao');
select pg_temp.expect_error(format($$select public.create_series('a3-p-0103', %L, 'anual', 'conta', 'Intruso', null, 100, 'fixo', 10,
  '2027-01-01', 1, null, null, 1)$$, pg_temp.id('fam')), 'sem_permissao');
select pg_temp.expect_error(format($$select public.end_series('a3-p-0104', %L, 1, 4, '[]')$$, pg_temp.id('seguro')), 'sem_permissao');
do $$ begin
  assert (select count(*) from public.record_operations where idempotency_key like 'a3-p-%') = 0, 'recusas não gravam operação';
  assert pg_temp.sync('fam') = '{"created": 0, "created_overdue": 0}'::jsonb, 'leitor dispara a geração (nada novo hoje)';
  set local clarevo.today = '2027-09-01';
  assert pg_temp.sync('fam') = '{"created": 14, "created_overdue": 1}'::jsonb,
    '01/09/2027: condomínio de agosto (vencido) a outubro, e os anos 2027/2028 de seguro, material e uniforme';
  assert pg_temp.occs('material') = '1:2026-11-10:30000:false:false:aberto 4:2027-11-10:30000:false:false:aberto '
    '5:2027-12-10:30000:false:false:aberto 6:2028-01-10:30000:false:false:aberto', 'a conta do ano segue no ano seguinte ao tirado';
  assert pg_temp.occs('seguro') like '%5:2027-11-30:12000:true:false:aberto 6:2027-12-31:12000:true:false:aberto '
    '7:2028-01-31:12000:true:false:aberto 8:2028-02-29:12000:true:false:aberto', 'seguro de 2027/2028 pela referência';
  assert not exists (select 1 from public.commitment_items where context_id = pg_temp.id('fam')
                      and created_by <> '00000000-0000-0000-0000-0000000000a5'), 'toda conta gerada tem a autoria da Elisa';
  perform pg_temp.check_series('fam');
end $$;

-- Vínculo da Elisa revogado (backend): nada é gerado em nome dela.
reset role;
update public.context_memberships set revoked_at = now() where context_id = pg_temp.id('fam') and person_id = :elisa;
set role authenticated;
do $$ begin
  assert (select bool_and(not generating) from public.series_items where context_id = pg_temp.id('fam')), 'nenhuma série gera';
  set local clarevo.today = '2027-12-01';
  assert pg_temp.sync('fam') = '{"created": 0, "created_overdue": 0}'::jsonb, 'nada é gerado';
  perform pg_temp.check_series('fam');
end $$;

-- Hana (RH da empresa): vê a licença, não vê séries, vigências nem contas, nem descobre que existem.
select set_config('request.jwt.claim.sub', :hana, true);
do $$ begin
  assert (select count(*) from public.licenses) = 1, 'Hana vê a licença da empresa';
  assert (select count(*) from public.commitment_series) = 0 and (select count(*) from public.series_terms) = 0
     and (select count(*) from public.series_items) = 0 and (select count(*) from public.commitment_items) = 0,
    'Hana não lê contas do ano, vigências nem contas a pagar';
end $$;
select pg_temp.expect_error(format($$select public.inform_series_year('a3-p-0201', %L, 1, '[]', 100)$$, pg_temp.id('ipva')), 'nao_encontrado');
select pg_temp.expect_error(format($$select public.skip_series_year('a3-p-0202', %L, 1, '[]')$$, pg_temp.id('iptu')), 'nao_encontrado');

-- Sem sessão e papel anônimo.
select set_config('request.jwt.claim.sub', '', true);
select pg_temp.expect_error(format($$select public.inform_series_year('a3-p-0301', %L, 1, '[]', 100)$$, pg_temp.id('ipva')), 'nao_autenticado');
select pg_temp.expect_error(format($$select public.skip_series_year('a3-p-0302', %L, 1, '[]')$$, pg_temp.id('iptu')), 'nao_autenticado');
reset role;
set role anon;
select pg_temp.expect_error($$select public.inform_series_year('a3-anon-0001', gen_random_uuid(), 1, '[]', 100)$$, 'permission denied%');
select pg_temp.expect_error($$select public.skip_series_year('a3-anon-0002', gen_random_uuid(), 1, '[]')$$, 'permission denied%');
select pg_temp.expect_error($$select public.create_series('a3-anon-0003', gen_random_uuid(), 'anual', 'conta', 'x', null, 100, 'fixo', 10,
  '2027-01-01', 1, null, null, 1)$$, 'permission denied%');
reset role;

-- 12. record_operations: 'informar_ano' e 'tirar_ano' apontam só para a série.
do $$
begin
  begin
    insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, target_id)
      values ('00000000-0000-0000-0000-0000000000a5', 'a3-o-0001', 'informar_ano', pg_temp.id('ctx'), 'x', gen_random_uuid()),
             ('00000000-0000-0000-0000-0000000000a5', 'a3-o-0002', 'tirar_ano', pg_temp.id('ctx'), 'x', gen_random_uuid());
    raise exception 'desfeito';
  exception when others then
    if sqlerrm <> 'desfeito' then
      raise exception 'operações válidas deveriam passar: %', sqlerrm;
    end if;
  end;
end $$;
do $$
declare
  cases text[][] := array[
    array['informar_ano', null, 'c', 't'],
    array['informar_ano', 'r', null, 't'],
    array['informar_ano', null, null, null],
    array['tirar_ano', null, 'c', null],
    array['tirar_ano', 'r', 'c', 't'],
    array['tirar_ano', null, null, null]
  ];
  i int;
begin
  for i in 1 .. array_length(cases, 1) loop
    perform pg_temp.expect_error(format($f$insert into public.record_operations
        (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id, target_id)
      values ('00000000-0000-0000-0000-0000000000a5', %L, %L, %L, 'x', %s, %s, %s)$f$,
      'a3-o-1' || lpad(i::text, 3, '0'), cases[i][1], pg_temp.id('ctx'),
      case when cases[i][2] is null then 'null' else 'gen_random_uuid()' end,
      case when cases[i][3] is null then 'null' else 'gen_random_uuid()' end,
      case when cases[i][4] is null then 'null' else 'gen_random_uuid()' end), '%record_operations_target_check%');
  end loop;
  perform pg_temp.expect_error($f$insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, target_id)
    values ('00000000-0000-0000-0000-0000000000a5', 'a3-o-2001', 'pagar_ano', gen_random_uuid(), 'x', gen_random_uuid())$f$,
    '%record_operations_action_check%');
  assert (select array_agg(distinct action order by action) from public.record_operations where action in ('informar_ano', 'tirar_ano'))
    = array['informar_ano', 'tirar_ano'], 'as 2 ações novas gravadas';
  assert not exists (select 1 from public.record_operations
                      where action in ('informar_ano', 'tirar_ano') and (target_id is null or record_id is not null or commitment_id is not null)),
    'toda operação de conta do ano aponta só para a série';
end $$;

-- 13. Limite de 100 séries ativas por contexto, contando as contas do ano (Ivo, 07/10/2026).
set role authenticated;
select set_config('request.jwt.claim.sub', :ivo, true);
do $$
declare
  ctx uuid := pg_temp.id('ivo_ctx');
  res jsonb;
  sid uuid;
  i int;
begin
  set local clarevo.today = '2026-10-07';
  -- Conta do ano de outubro (01/10/2026, já vencida) e de dezembro, mais 98 gastos fixos.
  res := public.create_series('a3-l-0000', ctx, 'anual', 'conta', 'Taxa antiga', null, 100, 'fixo', 1, '2026-10-01', 1, null, null, 1);
  insert into ids values ('antiga', (res #>> '{series,id}')::uuid);
  assert res -> 'changed' = '1'::jsonb, 'taxa de 01/10/2026 criada';
  perform public.create_series('a3-l-0001', ctx, 'anual', 'conta', 'Taxa de dezembro', null, 100, 'fixo', 10, '2026-12-01', 1, null, null, 1);
  for i in 2 .. 99 loop
    perform public.create_series('a3-l-' || lpad(i::text, 4, '0'), ctx, 'mensal', 'conta', 'Gasto ' || i, null, 100, 'fixo', 10,
                                 '2026-10-01', 1, null, null);
  end loop;
  assert (select count(*) from public.series_items where context_id = ctx) = 100, '100 ativas (2 contas do ano)';
  begin
    perform public.create_series('a3-l-0100', ctx, 'anual', 'conta', 'IPVA', null, 100, 'fixo', 20, '2027-01-01', 1, null, null, 1);
    raise exception 'FALHA: passou do limite';
  exception when others then
    assert sqlerrm = 'limite_de_gastos_fixos' and sqlstate = 'PT409', sqlerrm;
  end;
  -- Encerrada sem conta (último número 0, mês de outubro de 2025): não conta mais.
  perform public.end_series('a3-l-0101', pg_temp.id('antiga'), 1, 0, pg_temp.refs('antiga', '{1}'));
  res := public.create_series('a3-l-0102', ctx, 'anual', 'conta', 'IPVA', null, 100, 'fixo', 20, '2027-01-01', 1, null, null, 1);
  sid := (res #>> '{series,id}')::uuid;
  perform pg_temp.expect_error(format($f$select public.create_series('a3-l-0103', %L, 'anual', 'conta', 'IPTU', null, 100, 'fixo', 10,
    '2027-02-01', 1, null, null, 10)$f$, ctx), 'limite_de_gastos_fixos');
  -- Retomar a que já não contava (sem término, ou terminando na conta de outubro de 2026) a faz contar de novo.
  perform pg_temp.expect_error(format($f$select public.end_series('a3-l-0104', %L, 2, null, '[]')$f$, pg_temp.id('antiga')),
    'limite_de_gastos_fixos');
  perform pg_temp.expect_error(format($f$select public.end_series('a3-l-0105', %L, 2, 1, '[]')$f$, pg_temp.id('antiga')),
    'limite_de_gastos_fixos');
  assert (select (last_number, version) from public.series_items where id = pg_temp.id('antiga')) = (0, 2) and pg_temp.occs('antiga') is null
     and (select count(*) from public.record_operations where idempotency_key in ('a3-l-0100', 'a3-l-0103', 'a3-l-0104', 'a3-l-0105')) = 0,
    'recusas não mudam nada';
  -- Com uma vaga, a retomada passa e a conta de outubro volta.
  perform public.delete_series('a3-l-0106', sid, 1, '[]');
  res := public.end_series('a3-l-0107', pg_temp.id('antiga'), 2, null, '[]');
  assert res #>> '{series,last_number}' is null and pg_temp.occs('antiga') = '1:2026-10-01:100:false:false:aberto', 'retomada com uma vaga';
  perform pg_temp.expect_error(format($f$select public.create_series('a3-l-0108', %L, 'anual', 'conta', 'IPTU', null, 100, 'fixo', 10,
    '2027-02-01', 1, null, null, 10)$f$, ctx), 'limite_de_gastos_fixos');
  perform pg_temp.check_series('ivo_ctx');
end $$;

-- 14. Privilégios e assinaturas (conferidos como superusuário).
reset role;
do $$ begin
  assert (select array_agg(p.proname::text order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and has_function_privilege('authenticated', p.oid, 'execute'))
    = array['add_goal_movement', 'context_permission', 'create_commitment', 'create_goal', 'create_record', 'create_series', 'create_series_occurrence',
            'decide_return_review', 'delete_commitment', 'delete_goal', 'delete_goal_movement', 'delete_income_reference', 'delete_record', 'delete_series', 'end_series', 'ensure_personal_space',
            'inform_series_year', 'is_org_admin', 'month_committed', 'month_to_pay', 'month_totals', 'months_overview',
            'pay_commitment', 'set_goal_status', 'set_income_reference', 'skip_series_year', 'sync_series_occurrences', 'undo_commitment_payment', 'update_commitment', 'update_goal', 'update_goal_movement', 'update_record',
            'update_series_from'],
    'authenticated executa só as funções expostas';
  assert not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                      where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')), 'anon não executa nenhuma função';
  assert (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in ('clarevo_series_month', 'clarevo_series_due', 'clarevo_materialize_series',
             'clarevo_lock_series', 'clarevo_validate_series', 'clarevo_validate_series_term', 'clarevo_series_due_on', 'clarevo_months_between',
             'clarevo_series_result', 'clarevo_same_refs', 'clarevo_commitment_json', 'clarevo_check_series_consistency',
             'commitment_series_guard', 'series_terms_guard')
             and not has_function_privilege('authenticated', p.oid, 'execute')) = 14, 'auxiliares sem execute para authenticated';
  assert to_regprocedure('public.create_series(text, uuid, text, text, text, text, bigint, text, integer, date, integer, integer, date)') is null
     and to_regprocedure('public.create_series(text, uuid, text, text, text, text, bigint, text, integer, date, integer, integer, date, integer)') is not null,
    'create_series: só a assinatura com p_parts_per_year';
  assert to_regprocedure('public.clarevo_validate_series(uuid, text, text, text, text, bigint, text, integer, date, integer, integer, date)') is null,
    'clarevo_validate_series: só a assinatura nova';
  assert (select pg_get_constraintdef(oid) from pg_constraint where conname = 'commitment_series_kind_check')
    = 'CHECK ((kind = ANY (ARRAY[''mensal''::text, ''parcelada''::text, ''anual''::text])))', 'tipos: mensal, parcelada e anual';
  assert to_regprocedure('public.inform_series_year(text, uuid, integer, jsonb, bigint)') is not null
     and to_regprocedure('public.skip_series_year(text, uuid, integer, jsonb)') is not null, 'funções novas';
  assert to_regprocedure('public.month_to_pay(uuid, date)') is not null
     and to_regprocedure('public.pay_commitment(text, uuid, integer, uuid, bigint, date, text)') is not null
     and to_regprocedure('public.undo_commitment_payment(text, uuid, integer)') is not null
     and to_regprocedure('public.update_commitment(text, uuid, integer, bigint, date, text, text, boolean)') is not null
     and to_regprocedure('public.update_series_from(text, uuid, integer, integer, jsonb, text, text, text, bigint, text, integer)') is not null
     and to_regprocedure('public.end_series(text, uuid, integer, integer, jsonb)') is not null, 'demais assinaturas sem mudança';
  assert (select array_agg(attname::text order by attnum) from pg_attribute
           where attrelid = 'public.commitment_items'::regclass and attnum > 0 and not attisdropped)
    = array['id', 'context_id', 'description', 'amount_cents', 'currency', 'due_on', 'status', 'category', 'created_by', 'version',
            'created_at', 'updated_at', 'paid_record_id', 'paid_on', 'paid_amount_cents', 'paid_account_id', 'series_id', 'occurrence_number',
            'series_override', 'amount_is_estimate', 'series_kind', 'series_nature', 'series_installment_total', 'series_parts_per_year'],
    'commitment_items: mesma lista, mais series_parts_per_year no fim';
  assert (select array_agg(attname::text order by attnum) from pg_attribute
           where attrelid = 'public.series_items'::regclass and attnum > 0 and not attisdropped)
    = array['id', 'context_id', 'kind', 'nature', 'first_due_month', 'first_number', 'last_number', 'installment_total', 'currency',
            'created_by', 'version', 'created_at', 'updated_at', 'terms', 'skipped_numbers', 'paid_count', 'open_count', 'generating',
            'parts_per_year'],
    'series_items: mesma lista, mais parts_per_year depois de generating';
  assert (select reloptions from pg_class where oid = 'public.series_items'::regclass) @> array['security_barrier=true']
     and not coalesce((select reloptions from pg_class where oid = 'public.series_items'::regclass) @> array['security_invoker=true'], false)
     and (select reloptions from pg_class where oid = 'public.commitment_items'::regclass) @> array['security_invoker=true'],
    'opções das visões mantidas';
  assert not has_table_privilege('authenticated', 'public.commitment_series', 'insert, update, delete, truncate')
     and not has_any_column_privilege('authenticated', 'public.commitment_series', 'insert, update'), 'sem escrita direta em séries';
  assert has_table_privilege('authenticated', 'public.series_items', 'select') and not has_table_privilege('anon', 'public.series_items', 'select'),
    'leitura só para authenticated';
end $$;
set role authenticated;
select set_config('request.jwt.claim.sub', :ivo, true);
select pg_temp.expect_error($$update public.commitment_series set parts_per_year = 2$$, 'permission denied%');
reset role;

-- Invariantes no fim de tudo.
select pg_temp.check_series();

rollback;
