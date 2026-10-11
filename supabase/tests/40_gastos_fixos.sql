-- Gastos fixos e parcelamentos: séries, vigências, ocorrências, geração, "esta e as próximas", encerrar, excluir,
-- permissões e privilégios (D-023, D-024). Pessoas FICTÍCIAS: Ana (titular), Bruno (família, sem "editar de outras
-- pessoas"), Caio (família, só leitura), Davi (externo), Carla (RH da empresa). Hoje = 07/10/2026, salvo indicação.
\set ON_ERROR_STOP 1
\set ana   '''00000000-0000-0000-0000-0000000000a4'''
\set bruno '''00000000-0000-0000-0000-0000000000b4'''
\set caio  '''00000000-0000-0000-0000-0000000000c4'''
\set davi  '''00000000-0000-0000-0000-0000000000d4'''
\set carla '''00000000-0000-0000-0000-0000000000e4'''

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

-- S1 a S8 conferidas direto nas tabelas, sem a RLS (security definer), além dos gatilhos adiados.
create function pg_temp.check_series() returns void language plpgsql security definer set search_path = public, pg_temp as $$
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
                        and date_trunc('month', c.due_on::timestamp)::date
                            <> (s.first_due_month + make_interval(months => c.occurrence_number - s.first_number))::date),
    'S8: vencimento no mês da ocorrência';
  assert not exists (select 1 from public.commitments where series_skipped and deleted_at is null), 'pulada sempre excluída';
end $$;

-- Contexto pessoal da Ana: {recebido, pago, diferença} e {vencimento no mês, vencidas antes do mês, a pagar, quantidade}.
create function pg_temp.totals(p_month date) returns bigint[] language sql as $$
  select array[received_cents, paid_cents, difference_cents] from public.month_totals(pg_temp.id('ctx'), p_month)
$$;
create function pg_temp.to_pay(p_month date) returns bigint[] language sql as $$
  select array[due_in_month_cents, overdue_before_cents, to_pay_cents, open_count] from public.month_to_pay(pg_temp.id('ctx'), p_month)
$$;
-- Estimados dentro de "Ainda a pagar" do mês (critério de D-021(5)), somados direto de commitment_items.
create function pg_temp.estimated(p_month date) returns bigint language sql as $$
  select coalesce(sum(amount_cents), 0)::bigint from public.commitment_items
   where context_id = pg_temp.id('ctx') and status = 'aberto' and amount_is_estimate
     and due_on < (p_month + interval '1 month')::date
     and (due_on >= p_month or date_trunc('month', current_setting('clarevo.today')::date::timestamp)::date = p_month)
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

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  (:ana,   'ana@exemplo.test',   now(), '{"display_name":"Ana"}'),
  (:bruno, 'bruno@exemplo.test', now(), '{"display_name":"Bruno"}'),
  (:caio,  'caio@exemplo.test',  now(), '{"display_name":"Caio"}'),
  (:davi,  'davi@exemplo.test',  now(), '{"display_name":"Davi"}'),
  (:carla, 'carla@empresa.test', now(), '{"display_name":"Carla"}');

set role authenticated;
select set_config('request.jwt.claim.sub', :bruno, true);
insert into ids select 'bruno_ctx', (public.ensure_personal_space('Conta principal') ->> 'context_id')::uuid;
select set_config('request.jwt.claim.sub', :caio, true);
insert into ids select 'caio_ctx', (public.ensure_personal_space('Conta principal') ->> 'context_id')::uuid;
select set_config('request.jwt.claim.sub', :davi, true);
with s as (select public.ensure_personal_space('Conta principal') as space)
  insert into ids select 'davi_ctx', (space ->> 'context_id')::uuid from s
  union all select 'davi_acc', (space #>> '{account,id}')::uuid from s;
select set_config('request.jwt.claim.sub', :carla, true);
insert into ids select 'carla_ctx', (public.ensure_personal_space('Conta principal') ->> 'context_id')::uuid;
select set_config('request.jwt.claim.sub', :ana, true);

-- 1. Conta nova nunca recebe gasto fixo de exemplo; gerar não cria nada.
do $$
declare
  space jsonb := public.ensure_personal_space('Conta principal');
begin
  insert into ids values ('ctx', (space ->> 'context_id')::uuid), ('acc', (space #>> '{account,id}')::uuid);
  assert (select count(*) from public.commitment_series) = 0, 'conta nova sem séries';
  assert (select count(*) from public.series_items) = 0, 'conta nova sem séries na visão';
  assert (select count(*) from public.series_terms) = 0, 'conta nova sem vigências';
  assert public.sync_series_occurrences(pg_temp.id('ctx')) = '{"created": 0, "created_overdue": 0}'::jsonb,
    'sincronizar conta nova não cria nada';
  assert (select count(*) from public.commitments) = 0, 'conta nova sem contas a pagar';
end $$;

-- 2. Validação no banco: mesmos códigos e mesma ordem do core (validateSeriesDraft). Hoje 07/10/2026:
-- primeiro mês de setembro de 2026 a outubro de 2027.
do $$
declare
  ctx uuid := pg_temp.id('ctx');
  -- tipo, natureza, descrição, categoria, valor, modo, dia, primeiro mês, próxima parcela, total, último mês, erro
  cases text[][] := array[
    array['semanal', 'conta', 'Escola', null, '100', 'fixo', '10', '2026-10-01', '1', null, null, 'tipo_invalido'],
    array[null, 'conta', 'Escola', null, '100', 'fixo', '10', '2026-10-01', '1', null, null, 'tipo_invalido'],
    array['mensal', 'financiamento', 'Escola', null, '100', 'fixo', '10', '2026-10-01', '1', null, null, 'natureza_invalida'],
    array['mensal', null, 'Escola', null, '100', 'fixo', '10', '2026-10-01', '1', null, null, 'natureza_invalida'],
    array['parcelada', 'conta', 'Carro', null, '100', 'fixo', '10', '2026-10-01', '1', '12', null, 'natureza_invalida'],
    array['parcelada', null, 'Carro', null, '100', 'fixo', '10', '2026-10-01', '1', '12', null, 'natureza_invalida'],
    array['mensal', 'conta', 'Escola', null, '0', 'fixo', '10', '2026-10-01', '1', null, null, 'valor_invalido'],
    array['mensal', 'conta', 'Escola', null, null, 'fixo', '10', '2026-10-01', '1', null, null, 'valor_invalido'],
    array['mensal', 'conta', 'Escola', null, '1000000000', 'fixo', '10', '2026-10-01', '1', null, null, 'valor_acima_do_limite'],
    array['mensal', 'conta', E'\t \n', null, '100', 'fixo', '10', '2026-10-01', '1', null, null, 'descricao_obrigatoria'],
    array['mensal', 'conta', repeat('x', 81), null, '100', 'fixo', '10', '2026-10-01', '1', null, null, 'descricao_longa'],
    array['mensal', 'conta', 'Escola', repeat('c', 41), '100', 'fixo', '10', '2026-10-01', '1', null, null, 'categoria_invalida'],
    array['mensal', 'conta', 'Escola', null, '100', 'misto', '10', '2026-10-01', '1', null, null, 'modo_de_valor_invalido'],
    array['mensal', 'conta', 'Escola', null, '100', null, '10', '2026-10-01', '1', null, null, 'modo_de_valor_invalido'],
    array['mensal', 'conta', 'Escola', null, '100', 'fixo', '0', '2026-10-01', '1', null, null, 'dia_invalido'],
    array['mensal', 'conta', 'Escola', null, '100', 'fixo', '32', '2026-10-01', '1', null, null, 'dia_invalido'],
    array['mensal', 'conta', 'Escola', null, '100', 'fixo', null, '2026-10-01', '1', null, null, 'dia_invalido'],
    array['mensal', 'conta', 'Escola', null, '100', 'fixo', '10', null, '1', null, null, 'inicio_fora_do_intervalo'],
    array['mensal', 'conta', 'Escola', null, '100', 'fixo', '10', '2026-10-15', '1', null, null, 'inicio_fora_do_intervalo'],
    array['mensal', 'conta', 'Escola', null, '100', 'fixo', '10', '2026-08-01', '1', null, null, 'inicio_fora_do_intervalo'],
    array['mensal', 'conta', 'Escola', null, '100', 'fixo', '10', '2027-11-01', '1', null, null, 'inicio_fora_do_intervalo'],
    array['parcelada', 'financiamento', 'Carro', null, '100', 'fixo', '10', '2026-10-01', '1', '1', null, 'parcelas_invalidas'],
    array['parcelada', 'financiamento', 'Carro', null, '100', 'fixo', '10', '2026-10-01', '1', '481', null, 'parcelas_invalidas'],
    array['parcelada', 'financiamento', 'Carro', null, '100', 'fixo', '10', '2026-10-01', '1', null, null, 'parcelas_invalidas'],
    array['mensal', 'conta', 'Escola', null, '100', 'fixo', '10', '2026-10-01', '1', '12', null, 'parcelas_invalidas'],
    array['parcelada', 'financiamento', 'Carro', null, '100', 'fixo', '10', '2026-10-01', '0', '48', null, 'parcela_inicial_invalida'],
    array['parcelada', 'financiamento', 'Carro', null, '100', 'fixo', '10', '2026-10-01', '49', '48', null, 'parcela_inicial_invalida'],
    array['parcelada', 'financiamento', 'Carro', null, '100', 'fixo', '10', '2026-10-01', null, '48', null, 'parcela_inicial_invalida'],
    array['mensal', 'conta', 'Escola', null, '100', 'fixo', '10', '2026-10-01', '2', null, null, 'parcela_inicial_invalida'],
    array['mensal', 'conta', 'Escola', null, '100', 'fixo', '10', '2026-10-01', '1', null, '2026-09-01', 'fim_invalido'],
    array['mensal', 'conta', 'Escola', null, '100', 'fixo', '10', '2026-10-01', '1', null, '2076-10-01', 'fim_invalido'],
    array['mensal', 'conta', 'Escola', null, '100', 'fixo', '10', '2026-10-01', '1', null, '2026-12-15', 'fim_invalido'],
    array['parcelada', 'financiamento', 'Carro', null, '100', 'fixo', '10', '2026-10-01', '1', '12', '2027-09-01', 'fim_invalido'],
    -- Ordem: o primeiro erro da lista vence.
    array['semanal', 'financiamento', 'Escola', null, '0', 'fixo', '10', '2026-10-01', '1', null, null, 'tipo_invalido'],
    array['mensal', 'financiamento', 'Escola', null, '0', 'fixo', '10', '2026-10-01', '1', null, null, 'natureza_invalida'],
    array['mensal', 'conta', '', null, '0', 'fixo', '0', null, '1', null, null, 'valor_invalido'],
    array['mensal', 'conta', 'Escola', null, '100', 'misto', '0', null, '1', null, null, 'modo_de_valor_invalido'],
    array['mensal', 'conta', 'Escola', null, '100', 'fixo', '0', null, '1', null, null, 'dia_invalido'],
    array['parcelada', 'financiamento', 'Carro', null, '100', 'fixo', '10', '2027-11-01', '0', '1', null, 'inicio_fora_do_intervalo'],
    array['parcelada', 'financiamento', 'Carro', null, '100', 'fixo', '10', '2026-10-01', '0', '1', '2026-12-01', 'parcelas_invalidas'],
    array['parcelada', 'financiamento', 'Carro', null, '100', 'fixo', '10', '2026-10-01', '0', '12', '2026-12-01', 'parcela_inicial_invalida']
  ];
  i int;
  res jsonb;
  ok uuid[] := '{}';
  sid uuid;
begin
  for i in 1 .. array_length(cases, 1) loop
    perform pg_temp.expect_error(format(
      'select public.create_series(%L, %L, %L, %L, %L, %L, %L::bigint, %L, %L::int, %L::date, %L::int, %L::int, %L::date)',
      'gf-vali-' || lpad(i::text, 4, '0'), ctx, cases[i][1], cases[i][2], cases[i][3], cases[i][4], cases[i][5], cases[i][6],
      cases[i][7], cases[i][8], cases[i][9], cases[i][10], cases[i][11]), cases[i][12]);
  end loop;
  assert (select count(*) from public.record_operations where idempotency_key like 'gf-vali-%') = 0, 'recusas não gravam operação';
  assert (select count(*) from public.commitment_series) = 0, 'recusas não gravam série';
  perform pg_temp.expect_error(format($f$select public.create_series('curta', %L, 'mensal', 'conta', 'x', null, 100, 'fixo', 10,
    '2026-10-01', 1, null, null)$f$, ctx), 'chave_invalida');

  -- Limites aceitos (cada série excluída em seguida): primeiro mês de setembro de 2026 a outubro de 2027, dias 1 e 31,
  -- 2 e 480 parcelas, último mês até 599 meses depois do primeiro (600 contas), próxima parcela igual ao total.
  -- Mensal aceita próxima parcela nula (grava 1).
  res := public.create_series('gf-vali-0101', ctx, 'mensal', 'conta', 'Limite', null, 1, 'fixo', 1, '2026-09-01', null, null, null);
  assert (res #>> '{series,first_number}')::int = 1 and res #>> '{series,last_number}' is null, 'mensal com próxima parcela nula grava 1';
  ok := ok || (res #>> '{series,id}')::uuid;
  res := public.create_series('gf-vali-0102', ctx, 'mensal', 'conta', 'Limite', null, 999999999, 'variavel', 31, '2027-10-01', 1, null,
                              '2077-09-01');
  assert (res #>> '{series,last_number}')::int = 600 and res -> 'changed' = '0'::jsonb, 'término em 599 meses: 600 contas, nenhuma criada agora';
  ok := ok || (res #>> '{series,id}')::uuid;
  res := public.create_series('gf-vali-0103', ctx, 'parcelada', 'compra_parcelada', 'Limite', null, 100, 'fixo', 10, '2026-10-01', 2, 2, null);
  assert (res #>> '{series,last_number}')::int = 2 and (res #>> '{series,installment_total}')::int = 2, '2 parcelas';
  ok := ok || (res #>> '{series,id}')::uuid;
  res := public.create_series('gf-vali-0104', ctx, 'parcelada', 'outro_parcelamento', 'Limite', null, 100, 'fixo', 10, '2026-10-01', 480, 480, null);
  assert (res #>> '{series,last_number}')::int = 480 and res -> 'changed' = '1'::jsonb, '480 parcelas, próxima é a última: só outubro';
  ok := ok || (res #>> '{series,id}')::uuid;
  res := public.create_series('gf-vali-0105', ctx, 'mensal', 'conta', 'Limite', null, 100, 'fixo', 10, '2026-10-01', 1, null, '2026-10-01');
  assert (res #>> '{series,last_number}')::int = 1 and res -> 'changed' = '1'::jsonb, 'último mês igual ao primeiro: 1 conta';
  ok := ok || (res #>> '{series,id}')::uuid;
  for i in 1 .. array_length(ok, 1) loop
    perform public.delete_series('gf-vali-02' || lpad(i::text, 2, '0'), ok[i],
      (select version from public.series_items where id = ok[i]),
      (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'version', version)), '[]'::jsonb)
         from public.commitment_items where series_id = ok[i]));
  end loop;

  -- Em 29/02/2028: de janeiro de 2028 a fevereiro de 2029.
  set local clarevo.today = '2028-02-29';
  perform pg_temp.expect_error(format($f$select public.create_series('gf-vali-0301', %L, 'mensal', 'conta', 'x', null, 100, 'fixo', 10,
    '2027-12-01', 1, null, null)$f$, ctx), 'inicio_fora_do_intervalo');
  perform pg_temp.expect_error(format($f$select public.create_series('gf-vali-0302', %L, 'mensal', 'conta', 'x', null, 100, 'fixo', 10,
    '2029-03-01', 1, null, null)$f$, ctx), 'inicio_fora_do_intervalo');
  res := public.create_series('gf-vali-0303', ctx, 'mensal', 'conta', 'Limite', null, 100, 'fixo', 31, '2028-01-01', 1, null, null);
  sid := (res #>> '{series,id}')::uuid;
  assert (select string_agg(to_char(due_on, 'YYYY-MM-DD'), ' ' order by occurrence_number) from public.commitment_items where series_id = sid)
    = '2028-01-31 2028-02-29 2028-03-31', 'dia 31: 31/01, 29/02 (bissexto) e 31/03';
  perform public.delete_series('gf-vali-0304', sid, 1, (select jsonb_agg(jsonb_build_object('id', id, 'version', version))
    from public.commitment_items where series_id = sid));
  res := public.create_series('gf-vali-0305', ctx, 'mensal', 'conta', 'Limite', null, 100, 'fixo', 10, '2029-02-01', 1, null, null);
  sid := (res #>> '{series,id}')::uuid;
  assert res -> 'changed' = '0'::jsonb, 'primeiro mês daqui a 12 meses: nenhuma conta ainda';
  perform public.delete_series('gf-vali-0306', sid, 1, '[]');
  set local clarevo.today = '2026-10-07';

  perform pg_temp.check_series();
  assert (select count(*) from public.series_items) = 0 and (select count(*) from public.commitment_items) = 0,
    'limites: nada sobrou (séries e contas excluídas)';
end $$;

-- 3. Sequência de aceite A (Pessoal, sem gastos anotados; as séries do caso 2 já foram excluídas). Valores em centavos.
-- Passo 1: gasto fixo "Escola", R$ 1.200,00, dia 10, de outubro a dezembro de 2026.
do $$
declare
  ctx uuid := pg_temp.id('ctx');
  res jsonb;
  again jsonb;
begin
  res := public.create_series('gf-a-0001', ctx, 'mensal', 'conta', E'\t Escola \n', 'Educação', 120000, 'fixo', 10,
                              '2026-10-01', 1, null, '2026-12-01');
  insert into ids values ('escola', (res #>> '{series,id}')::uuid);
  assert res -> 'changed' = '2'::jsonb, 'Escola: 2 contas criadas';
  assert res #>> '{series,kind}' = 'mensal' and res #>> '{series,nature}' = 'conta' and (res #>> '{series,first_number}')::int = 1
     and (res #>> '{series,last_number}')::int = 3 and res #>> '{series,installment_total}' is null
     and res #>> '{series,first_due_month}' = '2026-10-01' and (res #>> '{series,version}')::int = 1
     and res #>> '{series,currency}' = 'BRL' and (res #>> '{series,created_by}')::uuid = auth.uid()
     and res #>> '{series,deleted_at}' is null and res #> '{series,generating}' = 'true'::jsonb
     and (res #>> '{series,open_count}')::int = 2 and (res #>> '{series,paid_count}')::int = 0
     and res #> '{series,skipped_numbers}' = '[]'::jsonb, 'série: forma, autoria e término em dezembro (3 contas)';
  assert res #> '{series,terms}' = jsonb_build_array(jsonb_build_object('from_number', 1, 'description', 'Escola',
           'category', 'Educação', 'amount_cents', 120000, 'amount_mode', 'fixo', 'due_day', 10,
           'created_at', res #> '{series,terms,0,created_at}')), 'vigência inicial com texto aparado';
  assert jsonb_array_length(res -> 'occurrences') = 2
     and (res #>> '{occurrences,0,occurrence_number}')::int = 1 and (res #>> '{occurrences,1,occurrence_number}')::int = 2
     and res #>> '{occurrences,0,series_kind}' = 'mensal' and res #>> '{occurrences,0,series_nature}' = 'conta'
     and (res #>> '{occurrences,0,created_by}')::uuid = auth.uid() and res #>> '{occurrences,0,category}' = 'Educação'
     and res #>> '{occurrences,0,paid_record_id}' is null and (res #>> '{occurrences,0,version}')::int = 1,
     'ocorrências no formato de commitment_items, por número';
  assert pg_temp.occs('escola') = '1:2026-10-10:120000:false:false:aberto 2:2026-11-10:120000:false:false:aberto',
    'Escola 10/10 (n1) e 10/11 (n2)';
  assert (select (action, target_id, record_id is null, commitment_id is null) from public.record_operations
           where idempotency_key = 'gf-a-0001') = ('criar_serie'::text, pg_temp.id('escola'), true, true), 'operação criar_serie';
  perform pg_temp.check_series();
  assert pg_temp.totals('2026-10-01') = array[0, 0, 0]::bigint[], 'contas a pagar não entram em Recebido, Pago ou Diferença';
  assert pg_temp.to_pay('2026-10-01') = array[120000, 0, 120000, 1]::bigint[], 'passo 1: outubro 1.200';
  assert pg_temp.to_pay('2026-11-01') = array[120000, 0, 120000, 1]::bigint[], 'passo 1: novembro 1.200';
  assert pg_temp.estimated('2026-10-01') = 0, 'passo 1: nada estimado';

  -- Repetição (item 3): mesma chave e conteúdo (texto com espaços) devolve o mesmo resultado sem linhas novas.
  again := public.create_series('gf-a-0001', ctx, 'mensal', 'conta', 'Escola', E' Educação\t', 120000, 'fixo', 10,
                                '2026-10-01', 1, null, '2026-12-01');
  assert again -> 'series' = res -> 'series' and again -> 'occurrences' = res -> 'occurrences' and again -> 'changed' = '0'::jsonb,
    'repetição devolve a mesma série e as mesmas contas';
  assert (select count(*) from public.commitment_series) = 1 and (select count(*) from public.commitments) = 2
     and (select count(*) from public.series_terms where series_id = pg_temp.id('escola')) = 1, 'repetição não grava nada';
  perform pg_temp.expect_error(format($f$select public.create_series('gf-a-0001', %L, 'mensal', 'conta', 'Escola', 'Educação', 120001,
    'fixo', 10, '2026-10-01', 1, null, '2026-12-01')$f$, ctx), 'chave_reutilizada');
  -- Mensal com próxima parcela nula grava a mesma série, mas é outro pedido (nulo é diferente de 1 no hash).
  perform pg_temp.expect_error(format($f$select public.create_series('gf-a-0001', %L, 'mensal', 'conta', 'Escola', 'Educação', 120000,
    'fixo', 10, '2026-10-01', null, null, '2026-12-01')$f$, ctx), 'chave_reutilizada');
  -- Mesmo espaço de chaves das outras ações, nos dois sentidos.
  perform pg_temp.expect_error(format($f$select public.update_series_from('gf-a-0001', %L, 1, 1, '[]', 'conta', 'Escola', null, 1,
    'fixo', 10)$f$, pg_temp.id('escola')), 'chave_reutilizada');
  perform pg_temp.expect_error(format($f$select public.end_series('gf-a-0001', %L, 1, 3, '[]')$f$, pg_temp.id('escola')), 'chave_reutilizada');
  perform pg_temp.expect_error(format($f$select public.delete_series('gf-a-0001', %L, 1, '[]')$f$, pg_temp.id('escola')), 'chave_reutilizada');
  perform pg_temp.expect_error(format($f$select public.create_commitment('gf-a-0001', %L, 120000, '2026-10-10', 'Escola')$f$, ctx),
    'chave_reutilizada');
end $$;

-- Passo 2: gerar de novo não cria nada.
do $$ begin
  assert public.sync_series_occurrences(pg_temp.id('ctx')) = '{"created": 0, "created_overdue": 0}'::jsonb, 'passo 2: nada novo';
  assert pg_temp.occs('escola') = '1:2026-10-10:120000:false:false:aberto 2:2026-11-10:120000:false:false:aberto', 'passo 2: Escola igual';
  perform pg_temp.check_series();
  assert pg_temp.to_pay('2026-10-01') = array[120000, 0, 120000, 1]::bigint[] and pg_temp.to_pay('2026-11-01') = array[120000, 0, 120000, 1]::bigint[],
    'passo 2: totais iguais';
end $$;

-- Passo 3: parcelamento "Financiamento do carro", financiamento, 48 parcelas, próxima 14 em outubro, R$ 980,00, dia 20.
-- Passo 4: gasto fixo "Luz", valor que muda, referência R$ 210,00, dia 12, desde outubro.
do $$
declare
  ctx uuid := pg_temp.id('ctx');
  res jsonb;
begin
  res := public.create_series('gf-a-0003', ctx, 'parcelada', 'financiamento', 'Financiamento do carro', 'Transporte', 98000, 'fixo', 20,
                              '2026-10-01', 14, 48, null);
  insert into ids values ('carro', (res #>> '{series,id}')::uuid);
  assert res -> 'changed' = '2'::jsonb and (res #>> '{series,first_number}')::int = 14 and (res #>> '{series,last_number}')::int = 48
     and (res #>> '{series,installment_total}')::int = 48 and res #>> '{series,nature}' = 'financiamento',
     'carro: parcelas 14 a 48';
  assert res #>> '{occurrences,0,series_kind}' = 'parcelada' and res #>> '{occurrences,0,series_nature}' = 'financiamento'
     and (res #>> '{occurrences,0,series_installment_total}')::int = 48, 'tipo do parcelamento lido pela junção';
  assert pg_temp.occs('carro') = '14:2026-10-20:98000:false:false:aberto 15:2026-11-20:98000:false:false:aberto',
    'parcelas 14 (20/10) e 15 (20/11)';
  perform pg_temp.check_series();
  assert pg_temp.totals('2026-10-01') = array[0, 0, 0]::bigint[], 'passo 3: Pago 0';
  assert pg_temp.to_pay('2026-10-01') = array[218000, 0, 218000, 2]::bigint[], 'passo 3: outubro 2.180';
  assert pg_temp.to_pay('2026-11-01') = array[218000, 0, 218000, 2]::bigint[], 'passo 3: novembro 2.180';

  res := public.create_series('gf-a-0004', ctx, 'mensal', 'conta', 'Luz', 'Moradia', 21000, 'variavel', 12, '2026-10-01', 1, null, null);
  insert into ids values ('luz', (res #>> '{series,id}')::uuid);
  assert res #>> '{series,last_number}' is null and res #>> '{series,terms,0,amount_mode}' = 'variavel', 'Luz: sem término, valor que muda';
  assert pg_temp.occs('luz') = '1:2026-10-12:21000:true:false:aberto 2:2026-11-12:21000:true:false:aberto', 'Luz 12/10 e 12/11 estimadas';
  perform pg_temp.check_series();
  assert pg_temp.totals('2026-10-01') = array[0, 0, 0]::bigint[], 'passo 4: Pago 0';
  assert pg_temp.to_pay('2026-10-01') = array[239000, 0, 239000, 3]::bigint[] and pg_temp.estimated('2026-10-01') = 21000,
    'passo 4: outubro 2.390, inclui 210 estimados';
  assert pg_temp.to_pay('2026-11-01') = array[239000, 0, 239000, 3]::bigint[] and pg_temp.estimated('2026-11-01') = 21000,
    'passo 4: novembro 2.390, inclui 210 estimados';
end $$;

-- Passo 5: pagar a Luz de outubro, R$ 232,40 em 07/10. Passo 6: repetir o pagamento (mesma chave).
do $$
declare
  acc uuid := pg_temp.id('acc');
  luz1 uuid := pg_temp.occ('luz', 1);
  res jsonb;
  again jsonb;
begin
  res := public.pay_commitment('gf-a-0005', luz1, 1, acc, 23240, '2026-10-07', 'Moradia');
  assert res #>> '{commitment,status}' = 'quitado' and (res #>> '{commitment,version}')::int = 2
     and (res #>> '{commitment,amount_cents}')::bigint = 21000 and res #> '{commitment,amount_is_estimate}' = 'true'::jsonb
     and (res #>> '{commitment,paid_amount_cents}')::bigint = 23240 and res #>> '{commitment,series_kind}' = 'mensal',
     'Luz de outubro paga: previsto e marca de estimado não mudam; o valor pago é o real';
  assert res #>> '{record,kind}' = 'despesa' and (res #>> '{record,amount_cents}')::bigint = 23240
     and res #>> '{record,description}' = 'Luz' and (res #>> '{record,commitment_id}')::uuid = luz1, 'um gasto de 232,40';
  insert into ids values ('luz_gasto', (res #>> '{record,id}')::uuid);
  perform pg_temp.check_series();
  assert pg_temp.totals('2026-10-01') = array[0, 23240, -23240]::bigint[], 'passo 5: Pago 232,40';
  assert pg_temp.to_pay('2026-10-01') = array[218000, 0, 218000, 2]::bigint[] and pg_temp.estimated('2026-10-01') = 0, 'passo 5: outubro 2.180';
  assert pg_temp.to_pay('2026-11-01') = array[239000, 0, 239000, 3]::bigint[] and pg_temp.estimated('2026-11-01') = 21000,
    'passo 5: Luz de novembro continua 210 estimada';

  again := public.pay_commitment('gf-a-0005', luz1, 1, acc, 23240, '2026-10-07', 'Moradia');
  assert again = res, 'passo 6: repetição devolve o mesmo resultado';
  assert (select count(*) from public.financial_records where commitment_id = luz1) = 1, 'passo 6: um único gasto';
  perform pg_temp.check_series();
  assert pg_temp.totals('2026-10-01') = array[0, 23240, -23240]::bigint[], 'passo 6: Pago igual';
  assert pg_temp.to_pay('2026-10-01') = array[218000, 0, 218000, 2]::bigint[] and pg_temp.to_pay('2026-11-01') = array[239000, 0, 239000, 3]::bigint[],
    'passo 6: a pagar igual';
end $$;

-- Passo 7: "Informar o valor da conta" na Luz de novembro, R$ 210,00 (igual à estimativa).
-- Passo 8: excluir só a Escola de novembro.
do $$
declare
  res jsonb;
begin
  res := public.update_commitment('gf-a-0007', pg_temp.occ('luz', 2), 1, 21000, '2026-11-12', 'Luz', 'Moradia', false);
  assert (res #>> '{commitment,version}')::int = 2 and res #> '{commitment,amount_is_estimate}' = 'false'::jsonb
     and res #> '{commitment,series_override}' = 'true'::jsonb, 'deixa de ser estimada e fica alterada só neste mês';
  perform pg_temp.check_series();
  assert pg_temp.totals('2026-10-01') = array[0, 23240, -23240]::bigint[], 'passo 7: Pago igual';
  assert pg_temp.to_pay('2026-10-01') = array[218000, 0, 218000, 2]::bigint[], 'passo 7: outubro 2.180';
  assert pg_temp.to_pay('2026-11-01') = array[239000, 0, 239000, 3]::bigint[] and pg_temp.estimated('2026-11-01') = 0,
    'passo 7: novembro 2.390, nenhum estimado';

  insert into ids values ('escola2', pg_temp.occ('escola', 2));
  res := public.delete_commitment('gf-a-0008', pg_temp.id('escola2'), 1);
  assert res #>> '{commitment,deleted_at}' is not null and res #> '{commitment,series_skipped}' = 'true'::jsonb,
    'excluir só esta marca o número';
  perform pg_temp.check_series();
  assert (select (skipped_numbers, open_count, paid_count) from public.series_items where id = pg_temp.id('escola'))
    = ('[2]'::jsonb, 1, 0), 'Escola: novembro pulado';
  assert pg_temp.totals('2026-10-01') = array[0, 23240, -23240]::bigint[], 'passo 8: Pago igual';
  assert pg_temp.to_pay('2026-10-01') = array[218000, 0, 218000, 2]::bigint[], 'passo 8: outubro 2.180';
  assert pg_temp.to_pay('2026-11-01') = array[119000, 0, 119000, 2]::bigint[], 'passo 8: novembro 1.190';
end $$;

-- Passo 9: "Esta e as próximas" no carro a partir da parcela 15: R$ 1.010,00.
-- Passo 10: "Só esta conta" na Escola de outubro com vencimento 05/11: recusado.
do $$
declare
  carro uuid := pg_temp.id('carro');
  res jsonb;
  again jsonb;
begin
  res := public.update_series_from('gf-a-0009', carro, 1, 15, pg_temp.refs('carro', '{15}'), 'financiamento', 'Financiamento do carro',
                                   'Transporte', 101000, 'fixo', 20);
  assert res -> 'changed' = '1'::jsonb and (res #>> '{series,version}')::int = 2, 'uma conta alterada; série versão 2';
  assert pg_temp.occs('carro') = '14:2026-10-20:98000:false:false:aberto 15:2026-11-20:101000:false:false:aberto',
    'parcela 15 = 1.010; a 14 continua 980';
  assert (select version from public.commitment_items where id = pg_temp.occ('carro', 15)) = 2
     and (select version from public.commitment_items where id = pg_temp.occ('carro', 14)) = 1, 'só a parcela 15 soma 1 à versão';
  assert pg_temp.terms('carro') = '14:98000:fixo:20 15:101000:fixo:20', 'vigências: 980 da 14 e 1.010 da 15 em diante';
  assert (select (action, target_id) from public.record_operations where idempotency_key = 'gf-a-0009')
    = ('alterar_serie'::text, carro), 'operação alterar_serie';
  -- Repetição: mesmo pedido (o conjunto confirmado é o de antes), nada muda de novo.
  again := public.update_series_from('gf-a-0009', carro, 1, 15, jsonb_build_array(jsonb_build_object('id', pg_temp.occ('carro', 15), 'version', 1)),
                                     'financiamento', 'Financiamento do carro', 'Transporte', 101000, 'fixo', 20);
  assert again -> 'series' = res -> 'series' and again -> 'changed' = '0'::jsonb, 'repetição devolve a mesma série';
  assert (select count(*) from public.series_terms where series_id = carro) = 2
     and (select version from public.commitment_items where id = pg_temp.occ('carro', 15)) = 2, 'repetição não grava nada';
  perform pg_temp.check_series();
  assert pg_temp.totals('2026-10-01') = array[0, 23240, -23240]::bigint[], 'passo 9: Pago igual';
  assert pg_temp.to_pay('2026-10-01') = array[218000, 0, 218000, 2]::bigint[], 'passo 9: outubro 2.180';
  assert pg_temp.to_pay('2026-11-01') = array[122000, 0, 122000, 2]::bigint[], 'passo 9: novembro 1.220';

  perform pg_temp.expect_error(format($f$select public.update_commitment('gf-a-0010', %L, 1, 120000, '2026-11-05', 'Escola', 'Educação')$f$,
    pg_temp.occ('escola', 1)), 'vencimento_fora_do_mes');
  assert (select (due_on, version, series_override) from public.commitment_items where id = pg_temp.occ('escola', 1))
    = ('2026-10-10'::date, 1, false), 'passo 10: Escola de outubro intacta';
  assert (select count(*) from public.record_operations where idempotency_key = 'gf-a-0010') = 0, 'recusa não grava operação';
  perform pg_temp.check_series();
  assert pg_temp.to_pay('2026-10-01') = array[218000, 0, 218000, 2]::bigint[] and pg_temp.to_pay('2026-11-01') = array[122000, 0, 122000, 2]::bigint[],
    'passo 10: totais iguais';
end $$;

-- Hoje = 02/11/2026. Passo 11: gerar. Passo 12: encerrar a Luz sem nenhuma conta (recusado).
-- Passo 13: encerrar a Luz com última conta em outubro. Passo 14: retomar a Luz sem data para terminar.
do $$
declare
  luz uuid := pg_temp.id('luz');
  res jsonb;
begin
  set local clarevo.today = '2026-11-02';
  assert public.sync_series_occurrences(pg_temp.id('ctx')) = '{"created": 3, "created_overdue": 0}'::jsonb, 'passo 11: 3 contas de dezembro';
  assert pg_temp.occs('escola') = '1:2026-10-10:120000:false:false:aberto 3:2026-12-10:120000:false:false:aberto',
    'Escola de dezembro (a última) entra; a de novembro não volta';
  assert pg_temp.occs('carro') = '14:2026-10-20:98000:false:false:aberto 15:2026-11-20:101000:false:false:aberto 16:2026-12-20:101000:false:false:aberto',
    'parcela 16 pela vigência nova';
  assert pg_temp.occs('luz') = '1:2026-10-12:21000:true:false:quitado 2:2026-11-12:21000:false:true:aberto 3:2026-12-12:21000:true:false:aberto',
    'Luz de dezembro estimada pela referência';
  assert public.sync_series_occurrences(pg_temp.id('ctx')) = '{"created": 0, "created_overdue": 0}'::jsonb, 'gerar de novo não cria nada';
  perform pg_temp.check_series();
  assert pg_temp.to_pay('2026-12-01') = array[242000, 0, 242000, 3]::bigint[], 'passo 11: previsto para dezembro 2.420';
  assert pg_temp.to_pay('2026-11-01') = array[122000, 218000, 340000, 4]::bigint[], 'novembro (mês atual): vencidas de outubro incluídas';
  assert pg_temp.totals('2026-10-01') = array[0, 23240, -23240]::bigint[], 'passo 11: Pago de outubro igual';

  perform pg_temp.expect_error(format($f$select public.end_series('gf-a-0012', %L, 1, 0, %L::jsonb)$f$, luz, pg_temp.refs('luz', '{2,3}')),
    'serie_tem_pagamento_posterior');
  assert pg_temp.sver('luz') = 1, 'passo 12: recusa não muda a série';

  res := public.end_series('gf-a-0013', luz, 1, 1, pg_temp.refs('luz', '{2,3}'));
  assert res -> 'changed' = '2'::jsonb and (res #>> '{series,last_number}')::int = 1 and (res #>> '{series,version}')::int = 2
     and jsonb_array_length(res -> 'occurrences') = 1 and res #>> '{occurrences,0,status}' = 'quitado',
     'passo 13: Luz termina em outubro; novembro e dezembro saem';
  assert pg_temp.occs('luz') = '1:2026-10-12:21000:true:false:quitado', 'só a Luz de outubro (paga) continua';
  assert (select (action, target_id) from public.record_operations where idempotency_key = 'gf-a-0013')
    = ('encerrar_serie'::text, luz), 'operação encerrar_serie';
  assert (select skipped_numbers from public.series_items where id = luz) = '[]'::jsonb, 'encerrar não marca "excluída só neste mês"';
  perform pg_temp.check_series();
  assert pg_temp.to_pay('2026-12-01') = array[221000, 0, 221000, 2]::bigint[], 'passo 13: dezembro sem a Luz';
  assert pg_temp.to_pay('2026-11-01') = array[101000, 218000, 319000, 3]::bigint[], 'passo 13: novembro sem a Luz';

  res := public.end_series('gf-a-0014', luz, 2, null, '[]');
  assert res -> 'changed' = '0'::jsonb and res #>> '{series,last_number}' is null and (res #>> '{series,version}')::int = 3
     and jsonb_array_length(res -> 'occurrences') = 3, 'passo 14: retomada sem data para terminar';
  assert pg_temp.occs('luz') = '1:2026-10-12:21000:true:false:quitado 2:2026-11-12:21000:true:false:aberto 3:2026-12-12:21000:true:false:aberto',
    'novembro e dezembro recriados, estimados em 210; a marca "alterada só neste mês" de novembro não volta';
  perform pg_temp.check_series();
  assert pg_temp.to_pay('2026-12-01') = array[242000, 0, 242000, 3]::bigint[], 'passo 14: dezembro 2.420';
  assert pg_temp.to_pay('2026-11-01') = array[122000, 218000, 340000, 4]::bigint[] and pg_temp.estimated('2026-11-01') = 21000,
    'passo 14: novembro com a Luz estimada';
end $$;

-- Hoje = 15/03/2027 (ausência longa). Passo 15: gerar só do mês anterior ao seguinte; janeiro fica sem conta registrada.
do $$ begin
  set local clarevo.today = '2027-03-15';
  assert public.sync_series_occurrences(pg_temp.id('ctx')) = '{"created": 6, "created_overdue": 3}'::jsonb,
    'passo 15: 6 contas, 3 já vencidas (Luz 12/02, carro 20/02 e Luz 12/03)';
  assert pg_temp.occs('carro') = '14:2026-10-20:98000:false:false:aberto 15:2026-11-20:101000:false:false:aberto '
    '16:2026-12-20:101000:false:false:aberto 18:2027-02-20:101000:false:false:aberto 19:2027-03-20:101000:false:false:aberto '
    '20:2027-04-20:101000:false:false:aberto', 'carro: fevereiro (18), março (19) e abril (20); janeiro (17) não';
  assert pg_temp.occs('luz') = '1:2026-10-12:21000:true:false:quitado 2:2026-11-12:21000:true:false:aberto '
    '3:2026-12-12:21000:true:false:aberto 5:2027-02-12:21000:true:false:aberto 6:2027-03-12:21000:true:false:aberto '
    '7:2027-04-12:21000:true:false:aberto', 'Luz: fevereiro, março e abril; janeiro não';
  assert pg_temp.occs('escola') = '1:2026-10-10:120000:false:false:aberto 3:2026-12-10:120000:false:false:aberto', 'Escola terminou';
  assert public.sync_series_occurrences(pg_temp.id('ctx')) = '{"created": 0, "created_overdue": 0}'::jsonb, 'gerar de novo não cria nada';
  perform pg_temp.check_series();
  assert pg_temp.to_pay('2027-03-01') = array[122000, 704000, 826000, 11]::bigint[], 'março: a pagar com as vencidas de antes';
  assert pg_temp.estimated('2027-03-01') = 84000, 'março: 4 Luzes estimadas';
  set local clarevo.today = '2026-10-07';
end $$;

-- 4. update_commitment: assinatura antiga (7 argumentos nomeados) continua funcionando com o mesmo hash;
-- chave gravada antes da migração é reconhecida; estimativa só pode ser tirada.
do $$
declare
  ctx uuid := pg_temp.id('ctx');
  luz5 uuid := pg_temp.occ('luz', 5);
  res jsonb;
  feira uuid;
begin
  res := public.update_commitment(p_idempotency_key => 'gf-u-0001', p_commitment_id => luz5, p_expected_version => 1,
                                  p_amount_cents => 21000, p_due_on => '2027-02-20', p_description => 'Luz', p_category => 'Moradia');
  assert (res #>> '{commitment,version}')::int = 2 and res #>> '{commitment,due_on}' = '2027-02-20'
     and res #> '{commitment,amount_is_estimate}' = 'true'::jsonb and res #> '{commitment,series_override}' = 'true'::jsonb,
     'sem o parâmetro novo: mantém a estimativa; vencimento no mesmo mês aceito; alterada só neste mês';
  assert (select request_hash from public.record_operations where idempotency_key = 'gf-u-0001')
    = md5(jsonb_build_array('editar_compromisso', luz5, 1, 21000, '2027-02-20'::date, 'Luz', 'Moradia')::text),
    'hash idêntico ao da 0002 com o parâmetro nulo';
  perform pg_temp.expect_error(format($f$select public.update_commitment('gf-u-0001', %L, 1, 21000, '2027-02-20', 'Luz', 'Moradia', false)$f$,
    luz5), 'chave_reutilizada');
  perform pg_temp.expect_error(format($f$select public.update_commitment('gf-u-0002', %L, 2, 21000, '2027-03-01', 'Luz', 'Moradia')$f$, luz5),
    'vencimento_fora_do_mes');
  perform pg_temp.expect_error(format($f$select public.update_commitment('gf-u-0003', %L, 2, 21000, '2027-02-12', 'Luz', 'Moradia', true)$f$,
    luz5), 'estimativa_invalida');
  assert (select (version, amount_is_estimate) from public.commitment_items where id = luz5) = (2, true), 'recusas não mudam nada';

  -- Conta avulsa: "Informar o valor" não a transforma em conta de série.
  res := public.create_commitment('gf-u-0004', ctx, 5000, '2026-10-25', 'Feira');
  feira := (res #>> '{commitment,id}')::uuid;
  assert res #>> '{commitment,series_id}' is null and res #> '{commitment,series_override}' = 'false'::jsonb
     and res #> '{commitment,amount_is_estimate}' = 'false'::jsonb and res #> '{commitment,series_kind}' = 'null'::jsonb,
     'conta avulsa: sem série e sem marcas';
  insert into ids values ('feira', feira);
  res := public.update_commitment('gf-u-0005', feira, 1, 5500, '2026-10-25', 'Feira', null, false);
  assert (res #>> '{commitment,version}')::int = 2 and res #> '{commitment,series_override}' = 'false'::jsonb, 'avulsa não fica alterada só no mês';
  perform pg_temp.check_series();
end $$;
-- Chave gravada pela versão antiga (antes da migração), com o hash da 0002: a função nova a reconhece como repetição.
reset role;
insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id)
select :ana, 'gf-u-0006', 'editar_compromisso', pg_temp.id('ctx'),
       md5(jsonb_build_array('editar_compromisso', pg_temp.id('feira'), 2, 6000, '2026-10-25'::date, 'Feira', null::text)::text),
       null, pg_temp.id('feira');
set role authenticated;
do $$
declare
  res jsonb;
begin
  res := public.update_commitment('gf-u-0006', pg_temp.id('feira'), 2, 6000, '2026-10-25', 'Feira');
  assert (res #>> '{commitment,version}')::int = 2 and (res #>> '{commitment,amount_cents}')::bigint = 5500,
    'repetição em trânsito reconhecida: nada é aplicado de novo';
  res := public.delete_commitment('gf-u-0007', pg_temp.id('feira'), 2);
  assert res #> '{commitment,series_skipped}' = 'false'::jsonb, 'excluir conta avulsa não marca número pulado';
  perform pg_temp.check_series();
end $$;

-- 3b. Hash sem ambiguidade nas funções de série: um '|' na descrição ou na categoria não faz um pedido diferente
-- parecer repetição. Categoria vazia vira nula antes do hash (como em create_commitment): é o mesmo pedido.
do $$
declare
  ctx uuid := pg_temp.id('ctx');
  res jsonb;
  again jsonb;
begin
  res := public.create_series('gf-h-0001', ctx, 'mensal', 'conta', 'Água|Casa', 'Moradia', 9000, 'fixo', 5, '2026-11-01', 1, null, null);
  insert into ids values ('agua', (res #>> '{series,id}')::uuid);
  perform pg_temp.expect_error(format($f$select public.create_series('gf-h-0001', %L, 'mensal', 'conta', 'Água', 'Casa|Moradia', 9000, 'fixo', 5,
    '2026-11-01', 1, null, null)$f$, ctx), 'chave_reutilizada');
  again := public.create_series('gf-h-0001', ctx, 'mensal', 'conta', 'Água|Casa', 'Moradia', 9000, 'fixo', 5, '2026-11-01', 1, null, null);
  assert again #>> '{series,id}' = res #>> '{series,id}', 'repetição exata continua reconhecida';

  res := public.create_series('gf-h-0002', ctx, 'mensal', 'conta', 'Gás', null, 4000, 'fixo', 5, '2026-11-01', 1, null, null);
  insert into ids values ('gas', (res #>> '{series,id}')::uuid);
  again := public.create_series('gf-h-0002', ctx, 'mensal', 'conta', 'Gás', '  ', 4000, 'fixo', 5, '2026-11-01', 1, null, null);
  assert again #>> '{series,id}' = res #>> '{series,id}' and (select count(*) from public.series_items where id = pg_temp.id('gas')) = 1,
    'categoria vazia e nula: mesmo pedido';

  res := public.update_series_from('gf-h-0003', pg_temp.id('agua'), 1, 1, pg_temp.refs('agua', '{1}'), 'conta', 'Água|Conta', 'Moradia',
                                   9000, 'fixo', 5);
  assert pg_temp.terms('agua') = '1:9000:fixo:5' and (select description from public.commitment_items where id = pg_temp.occ('agua', 1)) = 'Água|Conta',
    'vigência do primeiro número substituída; a conta de novembro muda';
  perform pg_temp.expect_error(format($f$select public.update_series_from('gf-h-0003', %L, 1, 1, %L::jsonb, 'conta', 'Água', 'Conta|Moradia',
    9000, 'fixo', 5)$f$, pg_temp.id('agua'), jsonb_build_array(jsonb_build_object('id', pg_temp.occ('agua', 1), 'version', 1))), 'chave_reutilizada');
  assert (select count(*) from public.series_terms where series_id = pg_temp.id('agua')) = 2
     and (select count(*) from public.series_terms where series_id = pg_temp.id('agua') and superseded_at is not null) = 1,
    'a vigência substituída fica como histórico';
  perform pg_temp.check_series();
end $$;

-- 5. S1: no máximo uma ocorrência viva por (série, número); com a anterior excluída, a inserção passa.
-- 6. Gatilhos e restrições, com escrita direta do backend (cada caso desfeito no próprio bloco).
reset role;
select pg_temp.expect_error(format($$insert into public.commitments (context_id, description, amount_cents, due_on, created_by, series_id, occurrence_number)
  values (%L, 'Escola', 120000, '2026-10-10', %L, %L, 1)$$, pg_temp.id('ctx'), :ana, pg_temp.id('escola')), '%commitments_one_live_occurrence%');
do $$
begin
  begin
    insert into public.commitments (context_id, description, amount_cents, due_on, created_by, series_id, occurrence_number)
      values (pg_temp.id('ctx'), 'Escola', 120000, '2026-11-10', '00000000-0000-0000-0000-0000000000a4', pg_temp.id('escola'), 2);
    set constraints all immediate;
    set constraints all deferred;
    raise exception 'desfeito';
  exception when others then
    if sqlerrm <> 'desfeito' then
      raise exception 'com a ocorrência anterior excluída, a inserção deveria passar: %', sqlerrm;
    end if;
  end;
end $$;
select pg_temp.expect_error(format($$insert into public.commitments (context_id, description, amount_cents, due_on, created_by, series_id)
  values (%L, 'Escola', 120000, '2026-10-10', %L, %L)$$, pg_temp.id('ctx'), :ana, pg_temp.id('escola')), '%commitments_series_par%');
-- S2: série, vigências e ocorrências no mesmo contexto.
select pg_temp.expect_error(format($$insert into public.commitments (context_id, description, amount_cents, due_on, created_by, series_id, occurrence_number)
  values (%L, 'Escola', 120000, '2026-11-10', %L, %L, 2)$$, pg_temp.id('davi_ctx'), :ana, pg_temp.id('escola')), '%commitments_series_fk%');
select pg_temp.expect_error(format($$insert into public.series_terms (series_id, context_id, from_number, description, amount_cents, amount_mode, due_day, created_by)
  values (%L, %L, 5, 'Escola', 1, 'fixo', 1, %L)$$, pg_temp.id('escola'), pg_temp.id('davi_ctx'), :ana), '%series_terms_series_fk%');
-- S3: vínculo com a série e o número nunca mudam; "excluída só neste mês" é permanente.
select pg_temp.expect_error(format($$update public.commitments set series_id = %L where id = %L$$, pg_temp.id('carro'), pg_temp.occ('escola', 1)),
  'campo_imutavel');
select pg_temp.expect_error(format($$update public.commitments set series_id = null, occurrence_number = null where id = %L$$, pg_temp.occ('escola', 1)),
  'campo_imutavel');
select pg_temp.expect_error(format($$update public.commitments set occurrence_number = 2 where id = %L$$, pg_temp.occ('escola', 1)), 'campo_imutavel');
select pg_temp.expect_error(format($$update public.commitments set series_skipped = false where id = %L$$, pg_temp.id('escola2')), 'campo_imutavel');
select pg_temp.expect_error(format($$update public.commitments set deleted_at = null, deleted_by = null where id = %L$$, pg_temp.id('escola2')),
  '%commitments_pulada_excluida%');
select pg_temp.expect_error(format($$update public.commitments set series_skipped = true where id = %L$$, pg_temp.occ('escola', 1)),
  '%commitments_pulada_excluida%');
select pg_temp.expect_error(format($$update public.commitments set series_override = true where id = %L$$, pg_temp.id('feira')),
  '%commitments_series_marcas%');
select pg_temp.expect_error(format($$update public.commitments set amount_is_estimate = true where id = %L$$, pg_temp.id('feira')),
  '%commitments_series_marcas%');
-- S7: conta paga não muda, nem a marca de estimado.
select pg_temp.expect_error(format($$update public.commitments set amount_is_estimate = false where id = %L$$, pg_temp.occ('luz', 1)), 'campo_imutavel');
-- Vigência: só a substituição, uma vez, com quem substituiu.
select pg_temp.expect_error(format($$update public.series_terms set description = 'Outra' where series_id = %L$$, pg_temp.id('escola')), 'campo_imutavel');
select pg_temp.expect_error(format($$update public.series_terms set superseded_at = now() where series_id = %L and superseded_at is not null$$,
  pg_temp.id('agua')), 'campo_imutavel');
select pg_temp.expect_error(format($$update public.series_terms set superseded_at = now() where series_id = %L$$, pg_temp.id('escola')),
  '%series_terms_substituicao%');
-- Série: forma, início e autoria imutáveis; série excluída não muda mais.
select pg_temp.expect_error(format($$update public.commitment_series set kind = 'parcelada' where id = %L$$, pg_temp.id('escola')), 'campo_imutavel');
select pg_temp.expect_error(format($$update public.commitment_series set first_number = 2 where id = %L$$, pg_temp.id('escola')), 'campo_imutavel');
select pg_temp.expect_error(format($$update public.commitment_series set first_due_month = '2026-11-01' where id = %L$$, pg_temp.id('escola')),
  'campo_imutavel');
select pg_temp.expect_error(format($$update public.commitment_series set installment_total = 60 where id = %L$$, pg_temp.id('carro')), 'campo_imutavel');
select pg_temp.expect_error(format($$update public.commitment_series set created_by = %L where id = %L$$, :davi, pg_temp.id('escola')), 'campo_imutavel');
select pg_temp.expect_error(format($$update public.commitment_series set context_id = %L where id = %L$$, pg_temp.id('davi_ctx'), pg_temp.id('escola')),
  'campo_imutavel');
select pg_temp.expect_error($$update public.commitment_series set nature = 'conta' where deleted_at is not null$$, 'campo_imutavel');
-- Forma de cada tipo (um check com NULL passaria: a parcelada exige total e último número).
select pg_temp.expect_error(format($$insert into public.commitment_series (context_id, kind, nature, first_due_month, first_number, installment_total, created_by)
  values (%L, 'parcelada', 'financiamento', '2026-10-01', 1, 10, %L)$$, pg_temp.id('ctx'), :ana), '%commitment_series_forma%');
select pg_temp.expect_error(format($$insert into public.commitment_series (context_id, kind, nature, first_due_month, first_number, last_number, created_by)
  values (%L, 'parcelada', 'financiamento', '2026-10-01', 1, 10, %L)$$, pg_temp.id('ctx'), :ana), '%commitment_series_forma%');
select pg_temp.expect_error(format($$insert into public.commitment_series (context_id, kind, nature, first_due_month, first_number, last_number, installment_total, created_by)
  values (%L, 'parcelada', 'conta', '2026-10-01', 1, 10, 10, %L)$$, pg_temp.id('ctx'), :ana), '%commitment_series_forma%');
select pg_temp.expect_error(format($$insert into public.commitment_series (context_id, kind, nature, first_due_month, first_number, installment_total, created_by)
  values (%L, 'mensal', 'conta', '2026-10-01', 1, 10, %L)$$, pg_temp.id('ctx'), :ana), '%commitment_series_forma%');
select pg_temp.expect_error(format($$insert into public.commitment_series (context_id, kind, nature, first_due_month, first_number, last_number, created_by)
  values (%L, 'mensal', 'conta', '2026-10-01', 1, 601, %L)$$, pg_temp.id('ctx'), :ana), '%commitment_series_forma%');
select pg_temp.expect_error(format($$insert into public.commitment_series (context_id, kind, nature, first_due_month, first_number, created_by)
  values (%L, 'mensal', 'conta', '2026-10-15', 1, %L)$$, pg_temp.id('ctx'), :ana), '%commitment_series_first_due_month_check%');
-- S4, S5, S6 e S8 com escrita direta: recusadas no fim da transação.
select pg_temp.expect_error(format($$update public.commitment_series set last_number = 1 where id = %L; set constraints all immediate$$,
  pg_temp.id('escola')), 'serie_inconsistente');
select pg_temp.expect_error(format($$update public.commitment_series set last_number = 15 where id = %L; set constraints all immediate$$,
  pg_temp.id('carro')), 'serie_inconsistente');
select pg_temp.expect_error(format($$insert into public.series_terms (series_id, context_id, from_number, description, amount_cents, amount_mode, due_day, created_by)
  values (%L, %L, 10, 'Carro', 1, 'fixo', 1, %L); set constraints all immediate$$, pg_temp.id('carro'), pg_temp.id('ctx'), :ana), 'serie_inconsistente');
select pg_temp.expect_error(format($$update public.series_terms set superseded_at = now(), superseded_by = %L where series_id = %L;
  set constraints all immediate$$, :ana, pg_temp.id('escola')), 'serie_inconsistente');
select pg_temp.expect_error(format($$insert into public.commitment_series (context_id, kind, nature, first_due_month, first_number, created_by)
  values (%L, 'mensal', 'conta', '2026-10-01', 1, %L); set constraints all immediate$$, pg_temp.id('ctx'), :ana), 'serie_inconsistente');
select pg_temp.expect_error(format($$update public.commitment_series set deleted_at = now(), deleted_by = %L where id = %L; set constraints all immediate$$,
  :ana, pg_temp.id('escola')), 'serie_inconsistente');
select pg_temp.expect_error(format($$update public.commitments set due_on = '2026-11-10' where id = %L; set constraints all immediate$$,
  pg_temp.occ('escola', 1)), 'serie_inconsistente');
select pg_temp.expect_error(format($$update public.commitments set deleted_at = null, deleted_by = null where id = %L; set constraints all immediate$$,
  (select id from public.commitments where series_id = pg_temp.id('luz') and occurrence_number = 2 and deleted_at is not null)),
  '%commitments_one_live_occurrence%');
-- S5 e S3 também na exclusão física: sem a vigência viva do primeiro número, a geração falharia para o contexto
-- inteiro; sem a linha do número "excluído só neste mês" (Escola de novembro), a geração o recriaria.
select pg_temp.expect_error(format($$delete from public.series_terms where series_id = %L and superseded_at is null;
  set constraints all immediate$$, pg_temp.id('escola')), 'serie_inconsistente');
select pg_temp.expect_error(format($$delete from public.commitments where id = %L; set constraints all immediate$$, pg_temp.id('escola2')),
  'serie_inconsistente');
-- Apagar histórico sem marca continua possível: vigência substituída e conta removida por encerramento.
do $$
begin
  begin
    delete from public.series_terms where series_id = pg_temp.id('agua') and superseded_at is not null;
    delete from public.commitments where series_id = pg_temp.id('luz') and occurrence_number = 2 and deleted_at is not null;
    set constraints all immediate;
    set constraints all deferred;
    raise exception 'desfeito';
  exception when others then
    if sqlerrm <> 'desfeito' then
      raise exception 'apagar histórico sem marca deveria passar: %', sqlerrm;
    end if;
  end;
end $$;
select pg_temp.check_series();

-- 7. "Esta e as próximas": a conta escolhida sempre muda (inclusive alterada só no mês, que perde a marca);
-- as seguintes em aberto e não alteradas também; pagas e outras alteradas não mudam; vigências futuras substituídas.
set role authenticated;
select set_config('request.jwt.claim.sub', :ana, true);
do $$
declare
  ctx uuid := pg_temp.id('ctx');
  acc uuid := pg_temp.id('acc');
  acad uuid;
  res jsonb;
begin
  -- Academia: setembro (vencida), outubro e novembro. Mensal com próxima parcela nula grava 1.
  res := public.create_series('gf-e-0001', ctx, 'mensal', 'conta', 'Academia', null, 10000, 'fixo', 15, '2026-09-01', null, null, null);
  acad := (res #>> '{series,id}')::uuid;
  insert into ids values ('acad', acad);
  assert pg_temp.occs('acad') = '1:2026-09-15:10000:false:false:aberto 2:2026-10-15:10000:false:false:aberto 3:2026-11-15:10000:false:false:aberto',
    'Academia de setembro a novembro';
  perform public.pay_commitment('gf-e-0002', pg_temp.occ('acad', 1), 1, acc, 10000, '2026-10-01');
  perform public.update_commitment('gf-e-0003', pg_temp.occ('acad', 3), 1, 12000, '2026-11-16', 'Academia', null);
  perform pg_temp.check_series();

  -- Conjunto confirmado diferente do afetado (novembro foi alterada só no mês e não entra a partir de outubro).
  perform pg_temp.expect_stale(format($f$select public.update_series_from('gf-e-0004', %L, 1, 2, %L::jsonb, 'conta', 'Academia', null, 11000,
    'fixo', 20)$f$, acad, pg_temp.refs('acad', '{2,3}')), 'contas_afetadas_mudaram');

  res := public.update_series_from('gf-e-0005', acad, 1, 2, pg_temp.refs('acad', '{2}'), 'conta', 'Academia', null, 11000, 'fixo', 20);
  assert res -> 'changed' = '1'::jsonb and (res #>> '{series,version}')::int = 2, 'a partir de outubro: 1 conta';
  assert pg_temp.occs('acad') = '1:2026-09-15:10000:false:false:quitado 2:2026-10-20:11000:false:false:aberto 3:2026-11-16:12000:false:true:aberto',
    'outubro muda (valor e dia); setembro (paga) e novembro (alterada só no mês) não';
  assert (select array_agg(version order by occurrence_number) from public.commitment_items where series_id = acad) = array[2, 2, 2],
    'versões: setembro 2 (pagamento), outubro 2 (esta e as próximas), novembro 2 (só esta)';
  assert pg_temp.terms('acad') = '1:10000:fixo:15 2:11000:fixo:20', 'vigência nova a partir de outubro';

  -- A partir de novembro, que foi alterada só no mês: ela muda e perde a marca; dia 31 vira 30/11.
  res := public.update_series_from('gf-e-0006', acad, 2, 3, pg_temp.refs('acad', '{3}'), 'conta', 'Academia', 'Lazer', 13000, 'variavel', 31);
  assert res -> 'changed' = '1'::jsonb, 'a partir de novembro: 1 conta';
  assert pg_temp.occs('acad') = '1:2026-09-15:10000:false:false:quitado 2:2026-10-20:11000:false:false:aberto 3:2026-11-30:13000:true:false:aberto',
    'novembro segue a vigência nova, estimada, e deixa de ser alterada só no mês';
  assert (select (version, category) from public.commitment_items where id = pg_temp.occ('acad', 3)) = (3, 'Lazer'::text), 'novembro: versão 3';

  -- Reajuste programado (número ainda não criado) e substituição de vigências futuras.
  res := public.update_series_from('gf-e-0007', acad, 3, 5, '[]', 'conta', 'Academia', null, 14000, 'fixo', 15);
  assert res -> 'changed' = '0'::jsonb and pg_temp.terms('acad') = '1:10000:fixo:15 2:11000:fixo:20 3:13000:variavel:31 5:14000:fixo:15',
    'reajuste a partir de janeiro';
  res := public.update_series_from('gf-e-0008', acad, 4, 4, '[]', 'conta', 'Academia', null, 15000, 'fixo', 15);
  assert pg_temp.terms('acad') = '1:10000:fixo:15 2:11000:fixo:20 3:13000:variavel:31 4:15000:fixo:15' and pg_temp.sver('acad') = 5,
    'a vigência de dezembro substitui a de janeiro';
  assert (select count(*) from public.series_terms where series_id = acad and superseded_at is not null) = 1, 'uma vigência substituída';

  -- Recusas: conta paga, número fora da série, conjunto ou versão desatualizados, tipo e vigência inválidos.
  perform pg_temp.expect_error(format($f$select public.update_series_from('gf-e-0101', %L, 5, 1, '[]', 'conta', 'Academia', null, 1, 'fixo', 1)$f$,
    acad), 'inicio_em_conta_paga');
  -- Sem término: até 12 meses depois do mês atual (outubro de 2027, número 14).
  perform pg_temp.expect_error(format($f$select public.update_series_from('gf-e-0102', %L, 5, 15, '[]', 'conta', 'Academia', null, 0, 'fixo', 1)$f$,
    acad), 'numero_fora_da_serie');
  perform pg_temp.expect_error(format($f$select public.update_series_from('gf-e-0103', %L, 5, 0, '[]', 'conta', 'Academia', null, 1, 'fixo', 1)$f$,
    acad), 'numero_fora_da_serie');
  perform pg_temp.expect_error(format($f$select public.update_series_from('gf-e-0104', %L, 5, null, '[]', 'conta', 'Academia', null, 1, 'fixo', 1)$f$,
    acad), 'numero_fora_da_serie');
  perform pg_temp.expect_stale(format($f$select public.update_series_from('gf-e-0105', %L, 5, 2, %L::jsonb, 'conta', 'Academia', null, 1, 'fixo', 1)$f$,
    acad, jsonb_build_array(jsonb_build_object('id', pg_temp.occ('acad', 2), 'version', 1),
                            jsonb_build_object('id', pg_temp.occ('acad', 3), 'version', 3))), 'contas_afetadas_mudaram');
  perform pg_temp.expect_stale(format($f$select public.update_series_from('gf-e-0106', %L, 5, 2, null, 'conta', 'Academia', null, 1, 'fixo', 1)$f$,
    acad), 'contas_afetadas_mudaram');
  perform pg_temp.expect_stale(format($f$select public.update_series_from('gf-e-0107', %L, 5, 2, %L::jsonb, 'conta', 'Academia', null, 1, 'fixo', 1)$f$,
    acad, jsonb_build_array(jsonb_build_object('id', pg_temp.occ('acad', 2)), jsonb_build_object('id', pg_temp.occ('acad', 3)))),
    'contas_afetadas_mudaram');
  perform pg_temp.expect_stale(format($f$select public.update_series_from('gf-e-0108', %L, 5, 2, %L::jsonb, 'conta', 'Academia', null, 1, 'fixo', 1)$f$,
    acad, jsonb_build_object('id', pg_temp.occ('acad', 2), 'version', 2)), 'contas_afetadas_mudaram');
  perform pg_temp.expect_stale(format($f$select public.update_series_from('gf-e-0109', %L, 4, 2, '[]', 'conta', 'Academia', null, 1, 'fixo', 1)$f$,
    acad), 'versao_atual=5');
  perform pg_temp.expect_stale(format($f$select public.update_series_from('gf-e-0110', %L, null, 2, '[]', 'conta', 'Academia', null, 1, 'fixo', 1)$f$,
    acad), 'versao_atual=5');
  perform pg_temp.expect_error(format($f$select public.update_series_from('gf-e-0111', %L, 5, 2, '[]', 'financiamento', 'Academia', null, 1, 'fixo', 1)$f$,
    acad), 'natureza_invalida');
  perform pg_temp.expect_error(format($f$select public.update_series_from('gf-e-0112', %L, 5, 2, '[]', null, 'Academia', null, 1, 'fixo', 1)$f$,
    acad), 'natureza_invalida');
  perform pg_temp.expect_error(format($f$select public.update_series_from('gf-e-0113', %L, 5, 2, '[]', 'conta', 'Academia', null, 0, 'fixo', 1)$f$,
    acad), 'valor_invalido');
  perform pg_temp.expect_error(format($f$select public.update_series_from('gf-e-0114', %L, 5, 2, '[]', 'conta', '  ', null, 1, 'fixo', 1)$f$,
    acad), 'descricao_obrigatoria');
  perform pg_temp.expect_error(format($f$select public.update_series_from('gf-e-0115', %L, 5, 2, '[]', 'conta', 'Academia', null, 1, 'misto', 1)$f$,
    acad), 'modo_de_valor_invalido');
  perform pg_temp.expect_error(format($f$select public.update_series_from('gf-e-0116', %L, 5, 2, '[]', 'conta', 'Academia', null, 1, 'fixo', 32)$f$,
    acad), 'dia_invalido');
  assert pg_temp.sver('acad') = 5 and (select count(*) from public.record_operations where idempotency_key like 'gf-e-01%') = 0,
    'recusas não gravam nada';

  -- Contas criadas depois já seguem a vigência nova (hoje 01/12/2026: dezembro e janeiro).
  set local clarevo.today = '2026-12-01';
  perform public.sync_series_occurrences(ctx);
  assert pg_temp.occs('acad') = '1:2026-09-15:10000:false:false:quitado 2:2026-10-20:11000:false:false:aberto '
    '3:2026-11-30:13000:true:false:aberto 4:2026-12-15:15000:false:false:aberto 5:2027-01-15:15000:false:false:aberto',
    'dezembro e janeiro pela vigência de dezembro';
  set local clarevo.today = '2026-10-07';

  -- O tipo do parcelamento é da série inteira: vale para todos os meses, inclusive pagos, sem mudar nenhuma conta.
  perform public.pay_commitment('gf-e-0201', pg_temp.occ('carro', 14), 1, acc, 98000, '2026-10-07');
  res := public.update_series_from('gf-e-0202', pg_temp.id('carro'), pg_temp.sver('carro'), 20, pg_temp.refs('carro', '{20}'), 'compra_parcelada',
                                   'Financiamento do carro', 'Transporte', 101000, 'fixo', 20);
  assert res -> 'changed' = '1'::jsonb and res #>> '{series,nature}' = 'compra_parcelada', 'tipo trocado';
  assert (select array_agg(distinct series_nature) from public.commitment_items where series_id = pg_temp.id('carro')) = array['compra_parcelada'],
    'todas as parcelas leem o tipo novo';
  assert (select (status, version) from public.commitment_items where id = pg_temp.occ('carro', 14)) = ('quitado'::public.commitment_status, 2),
    'a parcela paga não mudou';
  perform pg_temp.expect_error(format($f$select public.update_series_from('gf-e-0203', %L, %s, 20, %L::jsonb, 'conta', 'Carro', null, 1, 'fixo', 1)$f$,
    pg_temp.id('carro'), pg_temp.sver('carro'), pg_temp.refs('carro', '{20}')), 'natureza_invalida');
  perform pg_temp.check_series();
end $$;

-- 8. Encerrar: limites, conta paga depois do último número, versão e conjunto afetado.
-- (A conferência depois da trava, com uma segunda sessão, está no fim do arquivo.)
do $$
declare
  acad uuid := pg_temp.id('acad');
  carro uuid := pg_temp.id('carro');
  res jsonb;
begin
  perform pg_temp.expect_error(format($f$select public.end_series('gf-f-0001', %L, %s, 601, '[]')$f$, acad, pg_temp.sver('acad')), 'fim_invalido');
  perform pg_temp.expect_error(format($f$select public.end_series('gf-f-0002', %L, %s, -1, '[]')$f$, acad, pg_temp.sver('acad')), 'fim_invalido');
  perform pg_temp.expect_error(format($f$select public.end_series('gf-f-0003', %L, %s, null, '[]')$f$, carro, pg_temp.sver('carro')), 'fim_invalido');
  perform pg_temp.expect_error(format($f$select public.end_series('gf-f-0004', %L, %s, 12, '[]')$f$, carro, pg_temp.sver('carro')), 'fim_invalido');
  perform pg_temp.expect_error(format($f$select public.end_series('gf-f-0005', %L, %s, 49, '[]')$f$, carro, pg_temp.sver('carro')), 'fim_invalido');
  -- Parcela 14 paga: encerrar sem nenhuma conta (13) é recusado.
  perform pg_temp.expect_error(format($f$select public.end_series('gf-f-0006', %L, %s, 13, '[]')$f$, carro, pg_temp.sver('carro')),
    'serie_tem_pagamento_posterior');
  perform pg_temp.expect_stale(format($f$select public.end_series('gf-f-0007', %L, 1, 3, %L::jsonb)$f$, acad, pg_temp.refs('acad', '{4,5}')),
    'versao_atual=5');
  perform pg_temp.expect_stale(format($f$select public.end_series('gf-f-0008', %L, 5, 3, %L::jsonb)$f$, acad, pg_temp.refs('acad', '{4}')),
    'contas_afetadas_mudaram');

  res := public.end_series('gf-f-0009', acad, 5, 3, pg_temp.refs('acad', '{4,5}'));
  assert res -> 'changed' = '2'::jsonb and (res #>> '{series,last_number}')::int = 3, 'Academia termina em novembro';
  assert pg_temp.occs('acad') = '1:2026-09-15:10000:false:false:quitado 2:2026-10-20:11000:false:false:aberto 3:2026-11-30:13000:true:false:aberto',
    'dezembro e janeiro saem';
  -- Retomar até janeiro ("Termina em"), com hoje 01/12/2026: as removidas voltam com a vigência atual.
  set local clarevo.today = '2026-12-01';
  res := public.end_series('gf-f-0010', acad, 6, 5, '[]');
  assert (res #>> '{series,last_number}')::int = 5 and res -> 'changed' = '0'::jsonb, 'retomada até janeiro';
  assert pg_temp.occs('acad') = '1:2026-09-15:10000:false:false:quitado 2:2026-10-20:11000:false:false:aberto '
    '3:2026-11-30:13000:true:false:aberto 4:2026-12-15:15000:false:false:aberto 5:2027-01-15:15000:false:false:aberto',
    'dezembro e janeiro de volta';
  set local clarevo.today = '2026-10-07';
  perform pg_temp.expect_error(format($f$select public.update_series_from('gf-f-0011', %L, 7, 6, '[]', 'conta', 'Academia', null, 1, 'fixo', 1)$f$,
    acad), 'numero_fora_da_serie');
  perform pg_temp.check_series();

  -- Ocorrência paga segue D-021: desfazer e excluir o gasto reabrem; cada pagamento gera um único gasto.
  res := public.undo_commitment_payment('gf-f-0101', pg_temp.occ('carro', 14), 2);
  assert res #>> '{commitment,status}' = 'aberto' and (res #>> '{commitment,version}')::int = 3, 'parcela 14 reaberta';
  perform pg_temp.check_series();
  res := public.pay_commitment('gf-f-0102', pg_temp.occ('carro', 14), 3, pg_temp.id('acc'), 98000, '2026-10-07');
  assert (select count(*) from public.financial_records where commitment_id = pg_temp.occ('carro', 14)) = 1, 'um único gasto vivo';
  perform pg_temp.check_series();
  perform public.delete_record('gf-f-0103', (res #>> '{record,id}')::uuid, 1);
  assert (select (status, version, paid_record_id is null) from public.commitment_items where id = pg_temp.occ('carro', 14))
    = ('aberto'::public.commitment_status, 5, true), 'excluir o gasto reabre a parcela';
  assert pg_temp.occs('carro') like '14:2026-10-20:98000:false:false:aberto %', 'previsto da parcela não mudou';
  perform pg_temp.check_series();
end $$;

-- 9. Excluir a série: recusado com conta paga; sem paga, exclui a série e as contas em aberto, e gerar não as recria.
do $$
declare
  escola uuid := pg_temp.id('escola');
  refs jsonb := pg_temp.refs('escola', '{1,3}');
  res jsonb;
  again jsonb;
begin
  perform pg_temp.expect_error(format($f$select public.delete_series('gf-x-0001', %L, %s, %L::jsonb)$f$,
    pg_temp.id('luz'), pg_temp.sver('luz'), pg_temp.refs('luz', '{2,3,5,6,7}')), 'serie_tem_pagamentos');
  perform pg_temp.expect_stale(format($f$select public.delete_series('gf-x-0002', %L, 1, %L::jsonb)$f$, escola, pg_temp.refs('escola', '{1}')),
    'contas_afetadas_mudaram');
  perform pg_temp.expect_stale(format($f$select public.delete_series('gf-x-0003', %L, 2, %L::jsonb)$f$, escola, refs), 'versao_atual=1');

  res := public.delete_series('gf-x-0004', escola, 1, refs);
  assert res -> 'changed' = '2'::jsonb and res #>> '{series,deleted_at}' is not null and (res #>> '{series,version}')::int = 2
     and res -> 'occurrences' = '[]'::jsonb and (res #>> '{series,open_count}')::int = 0, 'Escola excluída com as 2 contas em aberto';
  assert (select (action, target_id) from public.record_operations where idempotency_key = 'gf-x-0004') = ('excluir_serie'::text, escola),
    'operação excluir_serie';
  assert (select count(*) from public.series_items where id = escola) = 0 and (select count(*) from public.commitment_series where id = escola) = 0
     and (select count(*) from public.commitment_items where series_id = escola) = 0, 'série e contas somem das consultas';
  again := public.delete_series('gf-x-0004', escola, 1, refs);
  assert again -> 'series' = res -> 'series' and again -> 'changed' = '0'::jsonb, 'repetir a exclusão devolve a mesma série';

  set local clarevo.today = '2026-11-02';
  perform public.sync_series_occurrences(pg_temp.id('ctx'));
  assert (select count(*) from public.commitment_items where series_id = escola) = 0, 'gerar não recria contas de série excluída';
  set local clarevo.today = '2026-10-07';
  perform pg_temp.expect_error(format($f$select public.update_series_from('gf-x-0005', %L, 2, 1, '[]', 'conta', 'Escola', null, 1, 'fixo', 1)$f$,
    escola), 'nao_encontrado');
  perform pg_temp.expect_error(format($f$select public.end_series('gf-x-0006', %L, 2, 3, '[]')$f$, escola), 'nao_encontrado');
  perform pg_temp.expect_error(format($f$select public.delete_series('gf-x-0007', %L, 2, '[]')$f$, escola), 'nao_encontrado');
  perform pg_temp.expect_error(format($f$select public.update_commitment('gf-x-0008', %L, 2, 1, '2026-10-10', 'Escola')$f$,
    (refs -> 0 ->> 'id')), 'nao_encontrado');
  perform pg_temp.check_series();
end $$;

-- Preparação feita pelo backend: Família da Ana (Bruno escreve sem "editar de outras pessoas"; Caio só lê)
-- e empresa da Carla com a licença da Ana.
reset role;
with f as (
  insert into public.financial_contexts (kind, name, owner_person_id) values ('familia', 'Família da Ana', :ana) returning id
) insert into ids select 'familia', id from f;
insert into public.context_memberships (context_id, person_id, role, can_read, can_write, can_edit_others)
  select id, :ana::uuid, 'titular'::public.membership_role, true, true, true from ids where name = 'familia'
  union all
  select id, :bruno::uuid, 'membro'::public.membership_role, true, true, false from ids where name = 'familia'
  union all
  select id, :caio::uuid, 'membro'::public.membership_role, true, false, false from ids where name = 'familia';
insert into public.organizations (id, name) values ('10000000-0000-0000-0000-0000000000f4', 'Empresa Fictícia');
insert into public.organization_admins values ('10000000-0000-0000-0000-0000000000f4', :carla);
insert into public.benefit_contracts (id, organization_id, seats, plan, starts_on)
  values ('20000000-0000-0000-0000-0000000000f4', '10000000-0000-0000-0000-0000000000f4', 10, 'familiar', '2026-10-01');
insert into public.licenses (id, contract_id, invited_email, person_id, status, activated_at)
  values ('30000000-0000-0000-0000-0000000000f4', '20000000-0000-0000-0000-0000000000f4', 'ana@exemplo.test', :ana, 'ativa', now());
set role authenticated;

-- 10. Permissões: as regras do banco já valem para a Família.
select set_config('request.jwt.claim.sub', :ana, true);
with r as (
  select public.create_series('gf-p-0001', (select id from ids where name = 'familia'), 'mensal', 'conta', 'Condomínio', 'Moradia', 50000, 'fixo',
                              20, '2026-10-01', 1, null, null) as res
) insert into ids select 'condominio', (res #>> '{series,id}')::uuid from r;

-- Davi (externo): não vê nada e não descobre que as séries existem.
select set_config('request.jwt.claim.sub', :davi, true);
do $$ begin
  assert (select count(*) from public.commitment_series) = 0, 'Davi não lê séries';
  assert (select count(*) from public.series_terms) = 0, 'Davi não lê vigências';
  assert (select count(*) from public.series_items) = 0, 'Davi não lê a visão de séries';
  assert (select count(*) from public.commitment_items) = 0, 'Davi não lê contas a pagar';
end $$;
select pg_temp.expect_error(format($$select public.create_series('gf-dav-0001', %L, 'mensal', 'conta', 'Intruso', null, 100, 'fixo', 10,
  '2026-10-01', 1, null, null)$$, pg_temp.id('ctx')), 'sem_permissao');
select pg_temp.expect_error(format($$select public.update_series_from('gf-dav-0002', %L, 1, 20, '[]', 'financiamento', 'x', null, 100, 'fixo', 10)$$,
  pg_temp.id('carro')), 'nao_encontrado');
select pg_temp.expect_error(format($$select public.end_series('gf-dav-0003', %L, 1, 20, '[]')$$, pg_temp.id('carro')), 'nao_encontrado');
select pg_temp.expect_error(format($$select public.delete_series('gf-dav-0004', %L, 1, '[]')$$, pg_temp.id('carro')), 'nao_encontrado');
select pg_temp.expect_error(format($$select public.sync_series_occurrences(%L)$$, pg_temp.id('ctx')), 'sem_permissao');
select pg_temp.expect_error(format($$select public.sync_series_occurrences(%L)$$, pg_temp.id('familia')), 'sem_permissao');

-- Caio (só leitura): lê a série da família, não grava, mas a abertura do app dispara a geração com a autoria da Ana.
select set_config('request.jwt.claim.sub', :caio, true);
do $$ begin
  assert (select count(*) from public.series_items) = 1 and (select count(*) from public.commitment_series) = 1
     and (select count(*) from public.series_terms) = 1, 'Caio lê a série da família';
  assert (select count(*) from public.commitment_items where series_id = pg_temp.id('condominio')) = 2, 'e as contas dela';
  assert (select count(*) from public.series_items where context_id = pg_temp.id('ctx')) = 0, 'mas nada do pessoal da Ana';
end $$;
select pg_temp.expect_error(format($$select public.create_series('gf-cai-0001', %L, 'mensal', 'conta', 'Intruso', null, 100, 'fixo', 10,
  '2026-10-01', 1, null, null)$$, pg_temp.id('familia')), 'sem_permissao');
select pg_temp.expect_error(format($$select public.update_series_from('gf-cai-0002', %L, 1, 2, %L::jsonb, 'conta', 'Condomínio', null, 1, 'fixo', 1)$$,
  pg_temp.id('condominio'), pg_temp.refs('condominio', '{2}')), 'sem_permissao');
do $$ begin
  set local clarevo.today = '2026-11-02';
  assert public.sync_series_occurrences(pg_temp.id('familia')) = '{"created": 1, "created_overdue": 0}'::jsonb, 'leitor dispara a geração';
  assert (select created_by from public.commitment_items where series_id = pg_temp.id('condominio') and occurrence_number = 3)
    = '00000000-0000-0000-0000-0000000000a4', 'a conta gerada tem a autoria de quem criou a série';
  set local clarevo.today = '2026-10-07';
end $$;

-- Bruno (escreve, sem "editar de outras pessoas"): não altera a série da Ana; cria e altera a própria.
select set_config('request.jwt.claim.sub', :bruno, true);
select pg_temp.expect_error(format($$select public.update_series_from('gf-bru-0001', %L, 1, 2, %L::jsonb, 'conta', 'Condomínio', null, 1, 'fixo', 1)$$,
  pg_temp.id('condominio'), pg_temp.refs('condominio', '{2,3}')), 'sem_permissao');
select pg_temp.expect_error(format($$select public.end_series('gf-bru-0002', %L, 1, 1, '[]')$$, pg_temp.id('condominio')), 'sem_permissao');
select pg_temp.expect_error(format($$select public.delete_series('gf-bru-0003', %L, 1, '[]')$$, pg_temp.id('condominio')), 'sem_permissao');
do $$
declare
  res jsonb;
begin
  res := public.create_series('gf-bru-0004', pg_temp.id('familia'), 'mensal', 'conta', 'Feira', null, 8000, 'fixo', 5, '2026-10-01', 1, null, null);
  insert into ids values ('feira_familia', (res #>> '{series,id}')::uuid);
  assert (res #>> '{series,created_by}')::uuid = auth.uid() and (res #>> '{occurrences,0,created_by}')::uuid = auth.uid(), 'autoria do Bruno';
  res := public.update_series_from('gf-bru-0005', pg_temp.id('feira_familia'), 1, 2, pg_temp.refs('feira_familia', '{2}'), 'conta', 'Feira', null,
                                   8500, 'fixo', 5);
  assert res -> 'changed' = '1'::jsonb, 'Bruno altera a própria série';
  assert (select count(*) from public.series_items) = 2 and (select count(*) from public.series_items where context_id = pg_temp.id('ctx')) = 0,
    'Bruno vê as séries da família, não as do pessoal da Ana';
end $$;

-- Ana revoga o Bruno: a série dele para de gerar (generating = false), e nada é criado em nome dele.
select set_config('request.jwt.claim.sub', :ana, true);
update public.context_memberships set revoked_at = now() where context_id = pg_temp.id('familia') and person_id = :bruno;
do $$ begin
  assert (select generating from public.series_items where id = pg_temp.id('feira_familia')) = false, 'série do Bruno parou de gerar';
  assert (select generating from public.series_items where id = pg_temp.id('condominio')) = true, 'série da Ana continua gerando';
  set local clarevo.today = '2026-12-02';
  assert public.sync_series_occurrences(pg_temp.id('familia')) = '{"created": 1, "created_overdue": 0}'::jsonb,
    'só o Condomínio de janeiro; a Feira do Bruno não gera';
  assert pg_temp.occs('feira_familia') = '1:2026-10-05:8000:false:false:aberto 2:2026-11-05:8500:false:false:aberto', 'Feira sem contas novas';
  set local clarevo.today = '2026-10-07';
end $$;
select set_config('request.jwt.claim.sub', :bruno, true);
do $$ begin
  assert (select count(*) from public.series_items) = 0 and (select count(*) from public.commitment_series) = 0
     and (select count(*) from public.series_terms) = 0 and (select count(*) from public.commitment_items) = 0,
    'Bruno revogado não lê nada da família';
end $$;
select pg_temp.expect_error(format($$select public.sync_series_occurrences(%L)$$, pg_temp.id('familia')), 'sem_permissao');
-- Repetir uma operação antiga (mesma chave e conteúdo) não devolve a série depois da revogação.
select pg_temp.expect_error(format($$select public.create_series('gf-bru-0004', %L, 'mensal', 'conta', 'Feira', null, 8000, 'fixo', 5,
  '2026-10-01', 1, null, null)$$, pg_temp.id('familia')), 'nao_encontrado');

-- Carla (RH da empresa): vê a licença, não vê séries, vigências nem contas, nem descobre que existem.
select set_config('request.jwt.claim.sub', :carla, true);
do $$ begin
  assert (select count(*) from public.licenses) = 1, 'Carla vê a licença da empresa';
  assert (select count(*) from public.commitment_series) = 0 and (select count(*) from public.series_terms) = 0
     and (select count(*) from public.series_items) = 0 and (select count(*) from public.commitment_items) = 0,
    'Carla não lê séries, vigências nem contas a pagar';
end $$;
select pg_temp.expect_error(format($$select public.create_series('gf-car-0001', %L, 'mensal', 'conta', 'Intruso', null, 100, 'fixo', 10,
  '2026-10-01', 1, null, null)$$, pg_temp.id('ctx')), 'sem_permissao');
select pg_temp.expect_error(format($$select public.update_series_from('gf-car-0002', %L, 1, 2, '[]', 'conta', 'x', null, 100, 'fixo', 10)$$,
  pg_temp.id('luz')), 'nao_encontrado');
select pg_temp.expect_error(format($$select public.delete_series('gf-car-0003', %L, 1, '[]')$$, pg_temp.id('condominio')), 'nao_encontrado');
select pg_temp.expect_error(format($$select public.sync_series_occurrences(%L)$$, pg_temp.id('ctx')), 'sem_permissao');

-- Sem sessão: nada é gravado nem gerado.
select set_config('request.jwt.claim.sub', '', true);
select pg_temp.expect_error(format($$select public.create_series('gf-ses-0001', %L, 'mensal', 'conta', 'x', null, 100, 'fixo', 10,
  '2026-10-01', 1, null, null)$$, pg_temp.id('ctx')), 'nao_autenticado');
select pg_temp.expect_error(format($$select public.update_series_from('gf-ses-0002', %L, 1, 2, '[]', 'conta', 'x', null, 1, 'fixo', 1)$$,
  pg_temp.id('luz')), 'nao_autenticado');
select pg_temp.expect_error(format($$select public.end_series('gf-ses-0003', %L, 1, 2, '[]')$$, pg_temp.id('luz')), 'nao_autenticado');
select pg_temp.expect_error(format($$select public.delete_series('gf-ses-0004', %L, 1, '[]')$$, pg_temp.id('luz')), 'nao_autenticado');
select pg_temp.expect_error(format($$select public.sync_series_occurrences(%L)$$, pg_temp.id('ctx')), 'nao_autenticado');

-- Papel anônimo: sem acesso às tabelas, visões e funções novas.
reset role;
set role anon;
select pg_temp.expect_error($$select count(*) from public.commitment_series$$, 'permission denied%');
select pg_temp.expect_error($$select count(*) from public.series_terms$$, 'permission denied%');
select pg_temp.expect_error($$select count(*) from public.series_items$$, 'permission denied%');
select pg_temp.expect_error($$select public.sync_series_occurrences(gen_random_uuid())$$, 'permission denied%');
select pg_temp.expect_error($$select public.create_series('gf-anon-0001', gen_random_uuid(), 'mensal', 'conta', 'x', null, 100, 'fixo', 10,
  '2026-10-01', 1, null, null)$$, 'permission denied%');
reset role;

-- 11. record_operations: o alvo genérico (target_id) só vale para as ações de série; as ações antigas continuam aceitas.
do $$
begin
  begin
    insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, target_id)
      values ('00000000-0000-0000-0000-0000000000a4', 'gf-o-0001', 'criar_serie', pg_temp.id('ctx'), 'x', gen_random_uuid());
    insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id)
      values ('00000000-0000-0000-0000-0000000000a4', 'gf-o-0002', 'editar', pg_temp.id('ctx'), 'x', gen_random_uuid(), gen_random_uuid());
    insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id)
      values ('00000000-0000-0000-0000-0000000000a4', 'gf-o-0003', 'pagar_compromisso', pg_temp.id('ctx'), 'x', gen_random_uuid(), gen_random_uuid());
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
    array['criar_serie', 'r', null, 't'],
    array['criar_serie', null, null, null],
    array['alterar_serie', null, 'c', 't'],
    array['excluir_serie', 'r', 'c', 't'],
    array['criar', 'r', null, 't'],
    array['editar', 'r', 'c', 't'],
    array['criar_compromisso', null, 'c', 't'],
    array['pagar_compromisso', 'r', 'c', 't'],
    array['desfazer_pagamento', null, null, 't']
  ];
  i int;
begin
  for i in 1 .. array_length(cases, 1) loop
    perform pg_temp.expect_error(format($f$insert into public.record_operations
        (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id, target_id)
      values ('00000000-0000-0000-0000-0000000000a4', %L, %L, %L, 'x', %s, %s, %s)$f$,
      'gf-o-1' || lpad(i::text, 3, '0'), cases[i][1], pg_temp.id('ctx'),
      case when cases[i][2] is null then 'null' else 'gen_random_uuid()' end,
      case when cases[i][3] is null then 'null' else 'gen_random_uuid()' end,
      case when cases[i][4] is null then 'null' else 'gen_random_uuid()' end), '%record_operations_target_check%');
  end loop;
  perform pg_temp.expect_error($f$insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, target_id)
    values ('00000000-0000-0000-0000-0000000000a4', 'gf-o-2001', 'pausar_serie', gen_random_uuid(), 'x', gen_random_uuid())$f$,
    '%record_operations_action_check%');
  assert (select array_agg(distinct action order by action) from public.record_operations where action like '%serie')
    = array['alterar_serie', 'criar_serie', 'encerrar_serie', 'excluir_serie'], 'as 4 ações de série gravadas';
  assert not exists (select 1 from public.record_operations
                      where action like '%serie' and (target_id is null or record_id is not null or commitment_id is not null)),
    'toda operação de série aponta só para a série';
  assert not exists (select 1 from public.record_operations where action not like '%serie' and target_id is not null),
    'operações de registro e de conta a pagar sem target_id';
end $$;

-- 12. Limite de 100 gastos fixos ativos por contexto (sem término ou com último mês a partir do mês anterior a hoje).
set role authenticated;
select set_config('request.jwt.claim.sub', :davi, true);
do $$
declare
  ctx uuid := pg_temp.id('davi_ctx');
  res jsonb;
  sid uuid;
  i int;
begin
  res := public.create_series('gf-lim-0000', ctx, 'mensal', 'conta', 'Antiga', null, 100, 'fixo', 1, '2026-09-01', 1, null, null);
  insert into ids values ('antiga', (res #>> '{series,id}')::uuid);
  for i in 1 .. 99 loop
    perform public.create_series('gf-lim-' || lpad(i::text, 4, '0'), ctx, 'mensal', 'conta', 'Gasto ' || i, null, 100, 'fixo', 10,
                                 '2026-10-01', 1, null, null);
  end loop;
  assert (select count(*) from public.series_items where context_id = ctx) = 100, '100 gastos fixos ativos';
  begin
    perform public.create_series('gf-lim-0100', ctx, 'mensal', 'conta', 'Gasto 100', null, 100, 'fixo', 10, '2026-10-01', 1, null, null);
    raise exception 'FALHA: passou do limite';
  exception when others then
    assert sqlerrm = 'limite_de_gastos_fixos' and sqlstate = 'PT409', sqlerrm;
  end;
  -- Encerrada com o último mês antes do mês anterior a hoje (agosto) não conta mais.
  perform public.end_series('gf-lim-0101', pg_temp.id('antiga'), 1, 0, pg_temp.refs('antiga', '{1,2,3}'));
  perform public.create_series('gf-lim-0102', ctx, 'mensal', 'conta', 'Gasto 100', null, 100, 'fixo', 10, '2026-10-01', 1, null, null);
  perform pg_temp.expect_error(format($f$select public.create_series('gf-lim-0103', %L, 'mensal', 'conta', 'Gasto 101', null, 100, 'fixo', 10,
    '2026-10-01', 1, null, null)$f$, ctx), 'limite_de_gastos_fixos');
  assert (select count(*) from public.record_operations where idempotency_key in ('gf-lim-0100', 'gf-lim-0103')) = 0, 'recusas não gravam operação';

  -- Retomar a que já não contava (sem data para terminar, ou terminando em setembro) a faz contar de novo: mesmo limite.
  perform pg_temp.expect_error(format($f$select public.end_series('gf-lim-0104', %L, 2, null, '[]')$f$, pg_temp.id('antiga')),
    'limite_de_gastos_fixos');
  perform pg_temp.expect_error(format($f$select public.end_series('gf-lim-0105', %L, 2, 1, '[]')$f$, pg_temp.id('antiga')),
    'limite_de_gastos_fixos');
  assert (select (last_number, version) from public.series_items where id = pg_temp.id('antiga')) = (0, 2) and pg_temp.occs('antiga') is null
     and (select count(*) from public.record_operations where idempotency_key in ('gf-lim-0104', 'gf-lim-0105')) = 0,
    'retomada recusada não muda nada';
  -- A que já conta pode ser encerrada e retomada no limite.
  sid := (select target_id from public.record_operations where idempotency_key = 'gf-lim-0001');
  perform public.end_series('gf-lim-0106', sid, 1, 1, (select jsonb_agg(jsonb_build_object('id', id, 'version', version))
    from public.commitment_items where series_id = sid and occurrence_number > 1));
  res := public.end_series('gf-lim-0107', sid, 2, null, '[]');
  assert res #>> '{series,last_number}' is null and (res #>> '{series,version}')::int = 3, 'encerrar e retomar uma que já conta';
  -- Com uma vaga, a retomada passa, as contas voltam e o limite vale de novo.
  sid := (select target_id from public.record_operations where idempotency_key = 'gf-lim-0102');
  perform public.delete_series('gf-lim-0108', sid, 1, (select jsonb_agg(jsonb_build_object('id', id, 'version', version))
    from public.commitment_items where series_id = sid));
  res := public.end_series('gf-lim-0109', pg_temp.id('antiga'), 2, null, '[]');
  assert res #>> '{series,last_number}' is null and (res #>> '{series,version}')::int = 3, 'retomada com uma vaga';
  assert pg_temp.occs('antiga') = '1:2026-09-01:100:false:false:aberto 2:2026-10-01:100:false:false:aberto 3:2026-11-01:100:false:false:aberto',
    'setembro a novembro recriados';
  perform pg_temp.expect_error(format($f$select public.create_series('gf-lim-0110', %L, 'mensal', 'conta', 'Gasto 101', null, 100, 'fixo', 10,
    '2026-10-01', 1, null, null)$f$, ctx), 'limite_de_gastos_fixos');
  perform pg_temp.check_series();
end $$;

-- 13. Privilégios e funções auxiliares (conferidas como superusuário: authenticated não as executa).
reset role;
do $$ begin
  assert public.clarevo_months_between('2026-10-01', '2029-08-01') = 34 and public.clarevo_months_between('2026-10-01', '2026-09-01') = -1,
    'meses entre dois meses';
  assert public.clarevo_series_due_on('2027-01-01', 1, 1, 31) = '2027-01-31' and public.clarevo_series_due_on('2027-01-01', 1, 2, 31) = '2027-02-28'
     and public.clarevo_series_due_on('2027-01-01', 1, 3, 31) = '2027-03-31' and public.clarevo_series_due_on('2027-01-01', 1, 4, 31) = '2027-04-30',
    'dia 31 de janeiro a abril de 2027';
  assert public.clarevo_series_due_on('2028-02-01', 1, 1, 31) = '2028-02-29' and public.clarevo_series_due_on('2027-02-01', 1, 1, 30) = '2027-02-28',
    '29/02/2028; dia 30 em fevereiro';
  assert public.clarevo_series_due_on('2026-11-01', 13, 13, 10) = '2026-11-10' and public.clarevo_series_due_on('2026-11-01', 13, 14, 10) = '2026-12-10'
     and public.clarevo_series_due_on('2026-11-01', 13, 48, 10) = '2029-10-10', 'parcelas 13 a 48 de novembro de 2026 a outubro de 2029';
  assert public.clarevo_series_due_on('2026-10-01', 14, 48, 20) = '2029-08-20', 'a parcela 48 do carro vence em 20/08/2029';
  assert (select string_agg(to_char(public.clarevo_series_due_on('2027-01-01', 1, n, 31), 'DD'), ',' order by n) from generate_series(1, 12) n)
    = '31,28,31,30,31,30,31,31,30,31,30,31', '12 meses seguidos sem deslocamento';
  assert public.clarevo_same_refs('[{"id": "a", "version": 1}]', '[{"version": 1, "id": "a"}]') and public.clarevo_same_refs('[]', '[]')
     and not public.clarevo_same_refs('[{"id": "a", "version": 1}]', '[{"id": "a"}]')
     and not public.clarevo_same_refs('[{"id": "a", "version": 1}]', '[{"id": "a", "version": "1"}]')
     and not public.clarevo_same_refs('[{"id": "a", "version": 1}]', '[{"id": "a", "version": 1, "x": 1}]')
     and not public.clarevo_same_refs('[]', '{}') and not public.clarevo_same_refs('[]', null), 'igualdade de conjuntos {id, version}';

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
    'authenticated executa só as funções expostas';
  assert not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                      where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')), 'anon não executa nenhuma função';
  assert (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in ('clarevo_materialize_series', 'clarevo_lock_series', 'clarevo_validate_series',
             'clarevo_validate_series_term', 'clarevo_series_due_on', 'clarevo_months_between', 'clarevo_series_result', 'clarevo_same_refs',
             'clarevo_commitment_json', 'clarevo_check_series_consistency', 'commitment_series_guard', 'series_terms_guard')
             and not has_function_privilege('authenticated', p.oid, 'execute')) = 12, 'auxiliares sem execute para authenticated';
  assert to_regprocedure('public.update_commitment(text, uuid, integer, bigint, date, text, text)') is null
     and to_regprocedure('public.update_commitment(text, uuid, integer, bigint, date, text, text, boolean)') is not null,
    'a assinatura antiga de update_commitment não existe';
  assert not has_table_privilege('authenticated', 'public.commitment_series', 'insert, update, delete, truncate')
     and not has_any_column_privilege('authenticated', 'public.commitment_series', 'insert, update'), 'sem escrita direta em séries';
  assert not has_table_privilege('authenticated', 'public.series_terms', 'insert, update, delete, truncate')
     and not has_any_column_privilege('authenticated', 'public.series_terms', 'insert, update'), 'sem escrita direta em vigências';
  assert not has_table_privilege('authenticated', 'public.commitments', 'insert, update, delete, truncate')
     and not has_any_column_privilege('authenticated', 'public.commitments', 'insert, update'), 'sem escrita direta em contas a pagar';
  assert not has_table_privilege('authenticated', 'public.series_items', 'insert, update, delete, truncate')
     and not has_table_privilege('authenticated', 'public.commitment_items', 'insert, update, delete, truncate'), 'sem escrita pelas visões';
  assert has_table_privilege('authenticated', 'public.series_items', 'select') and has_table_privilege('authenticated', 'public.commitment_series', 'select')
     and has_table_privilege('authenticated', 'public.series_terms', 'select'), 'leitura (filtrada pela permissão)';
  assert not has_table_privilege('anon', 'public.series_items', 'select') and not has_table_privilege('anon', 'public.commitment_series', 'select')
     and not has_table_privilege('anon', 'public.series_terms', 'select'), 'anon não lê';
  assert (select relrowsecurity from pg_class where oid = 'public.commitment_series'::regclass)
     and (select relrowsecurity from pg_class where oid = 'public.series_terms'::regclass), 'RLS ligada nas tabelas novas';
  assert (select reloptions from pg_class where oid = 'public.series_items'::regclass) @> array['security_barrier=true']
     and not coalesce((select reloptions from pg_class where oid = 'public.series_items'::regclass) @> array['security_invoker=true'], false)
     and (select reloptions from pg_class where oid = 'public.commitment_items'::regclass) @> array['security_invoker=true'],
    'series_items: filtro explícito com security_barrier; commitment_items: security_invoker';
end $$;
set role authenticated;
select set_config('request.jwt.claim.sub', :ana, true);
select pg_temp.expect_error(format($$insert into public.commitment_series (context_id, kind, nature, first_due_month, first_number, created_by)
  values (%L, 'mensal', 'conta', '2026-10-01', 1, auth.uid())$$, pg_temp.id('ctx')), 'permission denied%');
select pg_temp.expect_error($$update public.commitment_series set nature = 'conta'$$, 'permission denied%');
select pg_temp.expect_error($$delete from public.commitment_series$$, 'permission denied%');
select pg_temp.expect_error(format($$insert into public.series_terms (series_id, context_id, from_number, description, amount_cents, amount_mode, due_day, created_by)
  values (%L, %L, 30, 'x', 1, 'fixo', 1, auth.uid())$$, pg_temp.id('luz'), pg_temp.id('ctx')), 'permission denied%');
select pg_temp.expect_error($$update public.series_terms set superseded_at = now(), superseded_by = auth.uid()$$, 'permission denied%');
select pg_temp.expect_error($$update public.commitments set series_override = true$$, 'permission denied%');
select pg_temp.expect_error($$update public.series_items set nature = 'conta'$$, 'permission denied%');
select pg_temp.expect_error($$delete from public.series_items$$, 'permission denied%');
-- A permissão é conferida antes de qualquer filtro de quem consulta: um cast que falha (ou uma divisão por zero
-- condicional) não revela o tipo, as datas nem os textos das séries de outros contextos.
select set_config('request.jwt.claim.sub', :carla, true);
do $$ begin
  assert (select count(*) from public.series_items where nature::int = 1) = 0
     and (select count(*) from public.series_items where 1 / (version - version) = 1) = 0
     and (select count(*) from public.series_items where (terms -> 0 ->> 'description')::int = 1) = 0,
    'filtro de quem consulta só vê as linhas permitidas (nenhuma)';
end $$;

-- Invariantes no fim de tudo.
reset role;
select pg_temp.check_series();

rollback;

-- 8b. Encerrar confere as contas pagas só depois da trava: numa segunda sessão (dblink), o pagamento da conta de
-- novembro fica com a transação aberta; o encerramento em outubro, com o conjunto visto antes do pagamento, espera a
-- trava dessa conta e, quando o pagamento termina, é recusado com serie_tem_pagamento_posterior.
-- As sessões do dblink só enxergam dados gravados: esta parte grava de verdade (pessoa fictícia Eli) e, no fim,
-- apaga o contexto inteiro (séries, vigências, contas e gastos), o que também confere que essa exclusão continua possível.
-- Sem a extensão dblink (ou sem conexão local), roda o equivalente determinístico numa sessão só e avisa.
\set eli '''00000000-0000-0000-0000-0000000000f4'''
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
  values (:eli, 'eli@exemplo.test', now(), '{"display_name":"Eli"}');
create temp table conc (name text primary key, id uuid);
grant select, insert on conc to authenticated;
begin;
set local clarevo.today = '2026-10-07';
set local role authenticated;
select set_config('request.jwt.claim.sub', :eli, true);
do $$
declare
  space jsonb := public.ensure_personal_space('Conta principal');
  res jsonb;
begin
  res := public.create_series('gf-c-0001', (space ->> 'context_id')::uuid, 'mensal', 'conta', 'Curso de idiomas', null, 30000, 'fixo', 15,
                              '2026-10-01', 1, null, null);
  insert into conc values ('pessoa', auth.uid()), ('ctx', (space ->> 'context_id')::uuid), ('acc', (space #>> '{account,id}')::uuid),
    ('serie', (res #>> '{series,id}')::uuid), ('n2', (res #>> '{occurrences,1,id}')::uuid);
  assert (res #>> '{occurrences,1,occurrence_number}')::int = 2, 'conta de novembro';
end $$;
commit;

do $$
declare
  v_eli uuid := (select id from conc where name = 'pessoa');
  v_ctx uuid := (select id from conc where name = 'ctx');
  v_acc uuid := (select id from conc where name = 'acc');
  v_serie uuid := (select id from conc where name = 'serie');
  v_n2 uuid := (select id from conc where name = 'n2');
  -- O que a tela mostrou antes do pagamento: novembro em aberto, versão 1.
  v_refs jsonb := jsonb_build_array(jsonb_build_object('id', (select id from conc where name = 'n2'), 'version', 1));
  v_session text := format('set local clarevo.today = %L; set local role authenticated; set local "request.jwt.claim.sub" = %L',
                           '2026-10-07', (select id from conc where name = 'pessoa'));
  v_dblink boolean := exists (select 1 from pg_available_extensions where name = 'dblink');
  v_connected boolean := false;
  v_pid int;
  v_waited boolean := false;
  i int;
begin
  if v_dblink then
    create schema testes_dblink;
    create extension dblink schema testes_dblink;
    begin
      perform testes_dblink.dblink_connect('pagar', format('dbname=%s port=%s', current_database(), current_setting('port')));
      perform testes_dblink.dblink_connect('encerrar', format('dbname=%s port=%s', current_database(), current_setting('port')));
      v_connected := true;
    exception when others then
      raise notice '8b: dblink sem conexão local (%); conferência sequencial numa sessão só', sqlerrm;
    end;
  else
    raise notice '8b: extensão dblink indisponível; conferência sequencial numa sessão só';
  end if;

  if v_connected then
    -- Sessão 1: paga a conta de novembro e segura a transação aberta (trava da conta).
    perform testes_dblink.dblink_exec('pagar', 'begin; ' || v_session);
    perform * from testes_dblink.dblink('pagar', format('select public.pay_commitment(%L, %L, 1, %L, 30000, %L)::text',
      'gf-c-0002', v_n2, v_acc, '2026-10-07')) as t(r text);
    -- Sessão 2: encerra em outubro; trava a série, depois espera a trava da conta de novembro.
    perform testes_dblink.dblink_exec('encerrar', 'begin; ' || v_session);
    select pid into v_pid from testes_dblink.dblink('encerrar', 'select pg_backend_pid()') as t(pid int);
    perform testes_dblink.dblink_send_query('encerrar', format('select public.end_series(%L, %L, 1, 1, %L::jsonb)::text',
      'gf-c-0003', v_serie, v_refs));
    for i in 1 .. 200 loop
      if exists (select 1 from pg_locks where pid = v_pid and not granted) then
        v_waited := true;
        exit;
      end if;
      perform pg_sleep(0.05);
    end loop;
    assert v_waited, 'o encerramento deveria esperar a trava da conta em pagamento';
    perform testes_dblink.dblink_exec('pagar', 'commit');
    begin
      perform * from testes_dblink.dblink_get_result('encerrar') as t(r text);
      raise exception 'FALHA: encerrou com conta paga depois do último número';
    exception when others then
      assert sqlerrm = 'serie_tem_pagamento_posterior', 'sessão 2: ' || sqlerrm;
    end;
    perform * from testes_dblink.dblink_get_result('encerrar') as t(r text);
    perform testes_dblink.dblink_exec('encerrar', 'rollback');
  else
    -- Equivalente determinístico: o pagamento termina antes do encerramento, com o mesmo conjunto confirmado.
    perform set_config('clarevo.today', '2026-10-07', true);
    perform set_config('request.jwt.claim.sub', v_eli::text, true);
    set local role authenticated;
    perform public.pay_commitment('gf-c-0002', v_n2, 1, v_acc, 30000, '2026-10-07');
    begin
      perform public.end_series('gf-c-0003', v_serie, 1, 1, v_refs);
      raise exception 'FALHA: encerrou com conta paga depois do último número';
    exception when others then
      assert sqlerrm = 'serie_tem_pagamento_posterior', 'sequencial: ' || sqlerrm;
    end;
    reset role;
  end if;
  if v_dblink then
    perform testes_dblink.dblink_disconnect(c) from unnest(testes_dblink.dblink_get_connections()) c;
    drop extension dblink;
    drop schema testes_dblink;
  end if;

  assert (select (status, deleted_at is null) from public.commitments where id = v_n2) = ('quitado'::public.commitment_status, true),
    'o pagamento ficou';
  assert (select count(*) from public.financial_records where commitment_id = v_n2 and deleted_at is null) = 1, 'um único gasto';
  assert (select (last_number is null, version) from public.commitment_series where id = v_serie) = (true, 1), 'a série não foi encerrada';
  assert (select count(*) from public.record_operations where idempotency_key = 'gf-c-0003') = 0, 'recusa não grava operação';

  -- Limpeza: apagar o contexto inteiro continua possível com séries (vigências em cascata).
  delete from public.financial_records where context_id = v_ctx;
  delete from public.financial_contexts where id = v_ctx;
  delete from auth.users where id = v_eli;
  set constraints all immediate;
  assert not exists (select 1 from public.commitment_series where context_id = v_ctx)
     and not exists (select 1 from public.series_terms where context_id = v_ctx)
     and not exists (select 1 from public.commitments where context_id = v_ctx), 'contexto apagado por inteiro';
end $$;
