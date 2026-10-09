-- Renda comprometida (D-026, com o grupo "Contas do ano" de D-029(6)): income_references, set_income_reference,
-- delete_income_reference, month_committed, guarda, restrições de record_operations e privilégios.
-- Sequência de aceite B (spec2 2.3) sobre a montagem FICTÍCIA da demonstração (Lia, hoje 07/10/2026) e contas do ano
-- (janeiro e fevereiro de 2027). Em cada passo, month_committed é conferido por inteiro e recalculado a partir de
-- commitment_items (a lista que o app lê) e de month_to_pay, com a identidade comprometido = pagas + due_in_month_cents.
-- Pessoas FICTÍCIAS: Lia (sequência B; titular da Família da Lia), Gil (Família, só leitura), Iara (Família, escreve sem
-- "editar de outras pessoas"), Otto (Família, escreve e altera o que é dos outros), Hugo (externo), Kátia (RH da empresa;
-- Lia tem a licença) e Noa (conta nova; validação, repetição, versão e arredondamento). Valores em centavos.
\set ON_ERROR_STOP 1
\set lia   '''00000000-0000-0000-0000-0000000000a9'''
\set gil   '''00000000-0000-0000-0000-0000000000b9'''
\set iara  '''00000000-0000-0000-0000-0000000000c9'''
\set otto  '''00000000-0000-0000-0000-0000000000d9'''
\set hugo  '''00000000-0000-0000-0000-0000000000e9'''
\set katia '''00000000-0000-0000-0000-0000000000f9'''
\set noa   '''00000000-0000-0000-0000-0000000000aa'''

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

-- Contexto pedido: {recebido, pago, diferença} e {vencimento no mês, vencidas antes do mês, a pagar, quantidade}.
create function pg_temp.totals(p_ctx text, p_month date) returns bigint[] language sql as $$
  select array[received_cents, paid_cents, difference_cents] from public.month_totals(pg_temp.id(p_ctx), p_month)
$$;
create function pg_temp.to_pay(p_ctx text, p_month date) returns bigint[] language sql as $$
  select array[due_in_month_cents, overdue_before_cents, to_pay_cents, open_count] from public.month_to_pay(pg_temp.id(p_ctx), p_month)
$$;
create function pg_temp.sync(p_ctx text) returns jsonb language sql as $$
  select public.sync_series_occurrences(pg_temp.id(p_ctx))
$$;
-- Ocorrência viva n da série e a versão atual de uma conta a pagar.
create function pg_temp.occ(p_series text, p_n int) returns uuid language sql as $$
  select id from public.commitment_items where series_id = pg_temp.id(p_series) and occurrence_number = p_n
$$;
create function pg_temp.cver(p_cid uuid) returns int language sql as $$
  select version from public.commitment_items where id = p_cid
$$;
-- [{id, version}] das ocorrências vivas pedidas, como o app manda em p_expected_affected.
create function pg_temp.refs(p_series text, p_numbers int[]) returns jsonb language sql as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'version', version) order by occurrence_number), '[]'::jsonb)
    from public.commitment_items where series_id = pg_temp.id(p_series) and occurrence_number = any(p_numbers)
$$;
-- Paga pela versão atual (como a tela) e confere os vínculos (I1 a I4) logo depois.
create function pg_temp.pay(p_key text, p_cid uuid, p_acc uuid, p_amount bigint, p_on date) returns jsonb language plpgsql as $$
declare
  res jsonb;
begin
  res := public.pay_commitment(p_key, p_cid, pg_temp.cver(p_cid), p_acc, p_amount, p_on);
  perform pg_temp.check_links();
  return res;
end $$;
-- Atividade (A4): "última anotação ausência-de ausência-até", direto na tabela (sem a RLS).
create function pg_temp.act(p_person text, p_ctx text) returns text language sql security definer
set search_path = public, pg_temp as $$
  select format('%s %s %s', to_char(last_write_on, 'YYYY-MM-DD'), coalesce(to_char(absence_from_on, 'YYYY-MM-DD'), '-'),
                coalesce(to_char(absence_until_on, 'YYYY-MM-DD'), '-'))
    from public.context_activity where person_id = pg_temp.id(p_person) and context_id = pg_temp.id(p_ctx)
$$;

-- month_committed em texto, com todas as colunas:
-- "fixos F ano A parc P div D outras O = total | pago X aberto Y est E antes V | ref R@AAAA-MM(f|v) fora Z |
--  ‰total div ‰ fixos ‰ ano ‰ parc ‰ outras ‰" (nulo = "-").
create function pg_temp.mc(p_ctx text, p_month date) returns text language sql as $$
  select format('fixos %s ano %s parc %s div %s outras %s = %s | pago %s aberto %s est %s antes %s | ref %s fora %s | '
                '%s div %s fixos %s ano %s parc %s outras %s',
                fixed_cents, annual_cents, installment_cents, debt_cents, other_cents, committed_cents,
                paid_part_cents, open_part_cents, estimated_open_cents, overdue_before_cents,
                coalesce(reference_cents::text || '@' || to_char(reference_from, 'YYYY-MM')
                         || case when reference_varies then 'v' else 'f' end, '-'),
                coalesce(outside_cents::text, '-'), coalesce(committed_permille::text, '-'), coalesce(debt_permille::text, '-'),
                coalesce(fixed_permille::text, '-'), coalesce(annual_permille::text, '-'),
                coalesce(installment_permille::text, '-'), coalesce(other_permille::text, '-'))
    from public.month_committed(pg_temp.id(p_ctx), p_month)
$$;

-- Recalcula month_committed com a leitura do app (commitment_items e income_references, com a RLS de quem consulta) e
-- confere a identidade com month_to_pay: comprometido = pagas de C(M) + due_in_month_cents; em aberto = due_in_month_cents;
-- vencidas antes = overdue_before_cents. Milésimos = round(1000 × valor / referência), metade para cima.
create function pg_temp.check_mc(p_ctx text, p_month date) returns void language plpgsql as $$
declare
  m record;
  t record;
  ind record;
  ref record;
  v_next date := (p_month + interval '1 month')::date;
begin
  select * into m from public.month_committed(pg_temp.id(p_ctx), p_month);
  select * into t from public.month_to_pay(pg_temp.id(p_ctx), p_month);
  select coalesce(sum(v) filter (where series_kind = 'mensal'), 0) as fixed,
         coalesce(sum(v) filter (where series_kind = 'anual'), 0) as annual,
         coalesce(sum(v) filter (where series_kind = 'parcelada'), 0) as installment,
         coalesce(sum(v) filter (where series_kind = 'parcelada' and series_nature in ('financiamento', 'compra_parcelada')), 0) as debt,
         coalesce(sum(v) filter (where series_kind is null), 0) as other,
         coalesce(sum(v) filter (where status = 'quitado'), 0) as paid,
         coalesce(sum(v) filter (where status = 'aberto'), 0) as open,
         coalesce(sum(v) filter (where status = 'aberto' and amount_is_estimate), 0) as estimated
    into ind
    from (select case when status = 'quitado' then paid_amount_cents else amount_cents end as v, status, amount_is_estimate,
                 series_kind, series_nature
            from public.commitment_items
           where context_id = pg_temp.id(p_ctx) and due_on >= p_month and due_on < v_next) x;
  assert m.committed_cents = ind.paid + t.due_in_month_cents,
    format('identidade em %s: %s <> %s + %s', p_month, m.committed_cents, ind.paid, t.due_in_month_cents);
  assert m.open_part_cents = t.due_in_month_cents and m.overdue_before_cents = t.overdue_before_cents,
    format('em aberto e vencidas antes iguais a month_to_pay em %s', p_month);
  assert (m.fixed_cents, m.annual_cents, m.installment_cents, m.debt_cents, m.other_cents, m.paid_part_cents, m.open_part_cents,
          m.estimated_open_cents)
       = (ind.fixed, ind.annual, ind.installment, ind.debt, ind.other, ind.paid, ind.open, ind.estimated),
    format('grupos recalculados de commitment_items em %s', p_month);
  assert m.committed_cents = m.fixed_cents + m.annual_cents + m.installment_cents + m.other_cents
     and m.committed_cents = m.paid_part_cents + m.open_part_cents
     and m.debt_cents <= m.installment_cents and m.estimated_open_cents <= m.open_part_cents, 'somas coerentes';
  select amount_cents, from_month, varies into ref from public.income_references
   where context_id = pg_temp.id(p_ctx) and from_month <= p_month order by from_month desc limit 1;
  assert (m.reference_cents, m.reference_from, m.reference_varies) is not distinct from (ref.amount_cents, ref.from_month, ref.varies),
    format('referência vigente em %s', p_month);
  if m.reference_cents is null then
    assert m.outside_cents is null and m.committed_permille is null and m.debt_permille is null and m.fixed_permille is null
       and m.annual_permille is null and m.installment_permille is null and m.other_permille is null, 'sem referência: só reais';
  else
    assert m.outside_cents = m.reference_cents - m.committed_cents
       and m.committed_permille = round(1000.0 * m.committed_cents / m.reference_cents)
       and m.debt_permille = round(1000.0 * m.debt_cents / m.reference_cents)
       and m.fixed_permille = round(1000.0 * m.fixed_cents / m.reference_cents)
       and m.annual_permille = round(1000.0 * m.annual_cents / m.reference_cents)
       and m.installment_permille = round(1000.0 * m.installment_cents / m.reference_cents)
       and m.other_permille = round(1000.0 * m.other_cents / m.reference_cents), format('milésimos em %s', p_month);
  end if;
end $$;

create function pg_temp.expect_mc(p_ctx text, p_month date, p_expected text, p_note text) returns void language plpgsql as $$
declare
  v text := pg_temp.mc(p_ctx, p_month);
begin
  if v is distinct from p_expected then
    raise exception '% (%): esperado "%", veio "%"', p_note, p_month, p_expected, v;
  end if;
  perform pg_temp.check_mc(p_ctx, p_month);
end $$;

insert into ids values ('lia', :lia), ('gil', :gil), ('iara', :iara), ('otto', :otto), ('hugo', :hugo), ('katia', :katia),
  ('noa', :noa);
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  (:lia,   'lia@exemplo.test',   now(), '{"display_name":"Lia"}'),
  (:gil,   'gil@exemplo.test',   now(), '{"display_name":"Gil"}'),
  (:iara,  'iara@exemplo.test',  now(), '{"display_name":"Iara"}'),
  (:otto,  'otto@exemplo.test',  now(), '{"display_name":"Otto"}'),
  (:hugo,  'hugo@exemplo.test',  now(), '{"display_name":"Hugo"}'),
  (:katia, 'katia@empresa.test', now(), '{"display_name":"Kátia"}'),
  (:noa,   'noa@exemplo.test',   now(), '{"display_name":"Noa"}');

-- Espaços pessoais.
set role authenticated;
do $$
declare
  p text;
  space jsonb;
begin
  foreach p in array array['lia', 'gil', 'iara', 'otto', 'hugo', 'katia', 'noa'] loop
    perform pg_temp.as_(p);
    space := public.ensure_personal_space('Conta principal');
    insert into ids values (p || '_ctx', (space ->> 'context_id')::uuid), (p || '_acc', (space #>> '{account,id}')::uuid);
  end loop;
end $$;
reset role;

-- Família da Lia (Gil só lê; Iara escreve sem "editar de outras pessoas"; Otto escreve e altera o que é dos outros) e a
-- empresa da Kátia com a licença da Lia, preparadas pelo backend.
with f as (
  insert into public.financial_contexts (kind, name, owner_person_id) values ('familia', 'Família da Lia', :lia) returning id
) insert into ids select 'fam', id from f;
insert into public.context_memberships (context_id, person_id, role, can_read, can_write, can_edit_others)
  select id, :lia::uuid, 'titular'::public.membership_role, true, true, true from ids where name = 'fam'
  union all
  select id, :gil::uuid, 'membro'::public.membership_role, true, false, false from ids where name = 'fam'
  union all
  select id, :iara::uuid, 'membro'::public.membership_role, true, true, false from ids where name = 'fam'
  union all
  select id, :otto::uuid, 'membro'::public.membership_role, true, true, true from ids where name = 'fam';
insert into public.organizations (id, name) values ('10000000-0000-0000-0000-0000000000a9', 'Empresa Fictícia da Renda');
insert into public.organization_admins values ('10000000-0000-0000-0000-0000000000a9', :katia);
insert into public.benefit_contracts (id, organization_id, seats, plan, starts_on)
  values ('20000000-0000-0000-0000-0000000000a9', '10000000-0000-0000-0000-0000000000a9', 10, 'familiar', '2026-05-01');
insert into public.licenses (id, contract_id, invited_email, person_id, status, activated_at)
  values ('30000000-0000-0000-0000-0000000000a9', '20000000-0000-0000-0000-0000000000a9', 'lia@exemplo.test', :lia, 'ativa', now());

-- ---------------------------------------------------------------------------
-- 1. Conta nova: nenhuma renda de referência de exemplo; mês sem contas dá zero em reais e nenhum percentual.
-- ---------------------------------------------------------------------------
set role authenticated;
do $$ begin
  perform pg_temp.as_('noa');
  assert (select count(*) from public.income_references) = 0, 'conta nova sem renda de referência';
  assert pg_temp.sync('noa_ctx') = '{"created": 0, "created_overdue": 0}'::jsonb, 'conta nova sem gasto fixo';
  perform pg_temp.expect_mc('noa_ctx', '2026-10-01',
    'fixos 0 ano 0 parc 0 div 0 outras 0 = 0 | pago 0 aberto 0 est 0 antes 0 | ref - fora - | - div - fixos - ano - parc - outras -',
    'conta nova');
  assert (select count(*) from public.month_committed(pg_temp.id('noa_ctx'), '2026-10-01')) = 1, 'sempre uma linha';
end $$;

-- ---------------------------------------------------------------------------
-- 2. Validação (Noa, hoje 07/10/2026): sessão, chave, permissão, mês, versão e autoria antes da validação, intervalo de
-- 24 meses antes a 12 meses depois do mês de hoje, valor e tipo de renda, nessa ordem. month_committed: mes_invalido antes de
-- sem_permissao, como month_to_pay.
-- ---------------------------------------------------------------------------
do $$
declare
  ctx uuid := pg_temp.id('noa_ctx');
  res jsonb;
begin
  perform pg_temp.as_('ninguem');
  perform pg_temp.expect_error(format($f$select public.set_income_reference('rc-n-0001', %L, '2026-09-01', 0, 600000, false)$f$, ctx),
    'nao_autenticado');
  perform pg_temp.expect_error(format($f$select public.delete_income_reference('rc-n-0002', %L, 1)$f$, ctx), 'nao_autenticado');
  perform pg_temp.expect_error(format($f$select * from public.month_committed(%L, '2026-10-01')$f$, ctx), 'sem_permissao');
  perform pg_temp.expect_error(format($f$select * from public.month_committed(%L, '2026-10-02')$f$, ctx), 'mes_invalido');

  perform pg_temp.as_('noa');
  perform pg_temp.expect_error(format($f$select public.set_income_reference('curta', %L, '2026-09-01', 0, 600000, false)$f$, ctx),
    'chave_invalida');
  perform pg_temp.expect_error(format($f$select public.set_income_reference(null, %L, '2026-09-01', 0, 600000, false)$f$, ctx),
    'chave_invalida');
  perform pg_temp.expect_error(format($f$select public.set_income_reference(%L, %L, '2026-09-01', 0, 600000, false)$f$,
    repeat('k', 81), ctx), 'chave_invalida');
  perform pg_temp.expect_error($f$select public.delete_income_reference('curta', gen_random_uuid(), 1)$f$, 'chave_invalida');
  perform pg_temp.expect_error($f$select public.set_income_reference('rc-n-0003', gen_random_uuid(), '2026-09-01', 0, 600000, false)$f$,
    'sem_permissao');
  perform pg_temp.expect_error(format($f$select public.set_income_reference('rc-n-0004', %L, '2026-09-01', 0, 600000, false)$f$,
    pg_temp.id('lia_ctx')), 'sem_permissao');
  perform pg_temp.expect_error(format($f$select public.set_income_reference('rc-n-0005', %L, '2026-10-15', 0, 600000, false)$f$,
    pg_temp.id('lia_ctx')), 'sem_permissao');
  perform pg_temp.expect_error(format($f$select public.set_income_reference('rc-n-0006', %L, null, 0, 600000, false)$f$, ctx),
    'mes_invalido');
  perform pg_temp.expect_error(format($f$select public.set_income_reference('rc-n-0007', %L, '2026-10-15', 0, 600000, false)$f$, ctx),
    'mes_invalido');
  perform pg_temp.expect_error(format($f$select * from public.month_committed(%L, null)$f$, ctx), 'mes_invalido');
  perform pg_temp.expect_error(format($f$select * from public.month_committed(%L, '2026-10-15')$f$, pg_temp.id('lia_ctx')),
    'mes_invalido');
  perform pg_temp.expect_error(format($f$select * from public.month_committed(%L, '2026-10-01')$f$, pg_temp.id('lia_ctx')),
    'sem_permissao');

  perform pg_temp.expect_error(format($f$select public.set_income_reference('rc-n-0008', %L, '2026-12-01', 0, null, false)$f$, ctx),
    'valor_invalido');
  perform pg_temp.expect_error(format($f$select public.set_income_reference('rc-n-0009', %L, '2026-12-01', 0, 0, false)$f$, ctx),
    'valor_invalido');
  perform pg_temp.expect_error(format($f$select public.set_income_reference('rc-n-0010', %L, '2026-12-01', 0, -1, false)$f$, ctx),
    'valor_invalido');
  perform pg_temp.expect_error(format($f$select public.set_income_reference('rc-n-0011', %L, '2026-12-01', 0, 1000000000, false)$f$, ctx),
    'valor_acima_do_limite');
  perform pg_temp.expect_error(format($f$select public.set_income_reference('rc-n-0012', %L, '2024-09-01', 0, 600000, false)$f$, ctx),
    'referencia_fora_do_intervalo');
  perform pg_temp.expect_error(format($f$select public.set_income_reference('rc-n-0013', %L, '2027-11-01', 0, 600000, false)$f$, ctx),
    'referencia_fora_do_intervalo');
  perform pg_temp.expect_error(format($f$select public.set_income_reference('rc-n-0014', %L, '2026-12-01', 0, 600000, null)$f$, ctx),
    'tipo_invalido');
  -- Ordem: intervalo, depois valor, depois tipo de renda.
  perform pg_temp.expect_error(format($f$select public.set_income_reference('rc-n-0015', %L, '2027-11-01', 0, 0, null)$f$, ctx),
    'referencia_fora_do_intervalo');
  perform pg_temp.expect_error(format($f$select public.set_income_reference('rc-n-0016', %L, '2027-10-01', 0, 0, null)$f$, ctx),
    'valor_invalido');
  assert (select count(*) from public.record_operations where idempotency_key like 'rc-n-00%') = 0, 'recusas não gravam operação';

  -- Limites aceitos: 24 meses antes e 12 meses depois do mês de hoje; R$ 9.999.999,99.
  res := public.set_income_reference('rc-n-0017', ctx, '2024-10-01', 0, 999999999, true);
  assert res ->> 'from_month' = '2024-10-01' and (res ->> 'amount_cents')::bigint = 999999999 and (res ->> 'varies')::boolean
     and (res ->> 'version')::int = 1, 'limite inferior';
  perform public.delete_income_reference('rc-n-0018', (res ->> 'id')::uuid, 1);
  res := public.set_income_reference('rc-n-0019', ctx, '2027-10-01', 0, 1, false);
  assert res ->> 'from_month' = '2027-10-01' and (res ->> 'amount_cents')::bigint = 1, 'limite superior';
  perform public.delete_income_reference('rc-n-0020', (res ->> 'id')::uuid, 1);
  assert (select count(*) from public.income_references) = 0, 'limites desfeitos';

  -- O intervalo acompanha o hoje da pessoa (29/02/2028: de fevereiro de 2026 a fevereiro de 2029).
  perform pg_temp.today('2028-02-29');
  perform pg_temp.expect_error(format($f$select public.set_income_reference('rc-n-0021', %L, '2026-01-01', 0, 600000, false)$f$, ctx),
    'referencia_fora_do_intervalo');
  perform pg_temp.expect_error(format($f$select public.set_income_reference('rc-n-0022', %L, '2029-03-01', 0, 600000, false)$f$, ctx),
    'referencia_fora_do_intervalo');
  res := public.set_income_reference('rc-n-0023', ctx, '2029-02-01', 0, 600000, false);
  perform public.delete_income_reference('rc-n-0024', (res ->> 'id')::uuid, 1);
  res := public.set_income_reference('rc-n-0025', ctx, '2026-02-01', 0, 600000, false);
  perform public.delete_income_reference('rc-n-0026', (res ->> 'id')::uuid, 1);
  perform pg_temp.today('2026-10-07');
end $$;

-- ---------------------------------------------------------------------------
-- 3. Repetição, hash e versão (Noa, hoje 07/10/2026).
-- ---------------------------------------------------------------------------
do $$
declare
  ctx uuid := pg_temp.id('noa_ctx');
  r1 jsonb;
  r2 jsonb;
  sep uuid;
  cid uuid;
begin
  perform pg_temp.as_('noa');
  r1 := public.set_income_reference('rc-n-0101', ctx, '2026-09-01', 0, 600000, false);
  sep := (r1 ->> 'id')::uuid;
  assert (select array_agg(k order by k) from jsonb_object_keys(r1) k)
    = array['amount_cents', 'context_id', 'created_at', 'created_by', 'deleted_at', 'deleted_by', 'from_month', 'id', 'updated_at',
            'varies', 'version'], 'retorno: a linha de income_references';
  assert r1 ->> 'context_id' = ctx::text and r1 ->> 'from_month' = '2026-09-01' and (r1 ->> 'amount_cents')::bigint = 600000
     and not (r1 ->> 'varies')::boolean and r1 ->> 'created_by' = auth.uid()::text and (r1 ->> 'version')::int = 1
     and r1 -> 'deleted_at' = 'null'::jsonb and r1 -> 'deleted_by' = 'null'::jsonb, 'referência criada com versão 1';

  -- Mesma chave e mesmo pedido: o mesmo resultado, sem linha nova.
  r2 := public.set_income_reference('rc-n-0101', ctx, '2026-09-01', 0, 600000, false);
  assert r2 = r1, 'repetição devolve o mesmo resultado';
  assert (select count(*) from public.income_references) = 1
     and (select count(*) from public.record_operations where idempotency_key = 'rc-n-0101') = 1, 'repetição não grava nada';
  -- Hash em JSON (D-021, regra 7) e alvo da operação.
  assert (select (action, request_hash, target_id, record_id, commitment_id, context_id) from public.record_operations
           where idempotency_key = 'rc-n-0101')
       is not distinct from ('definir_renda_referencia'::text,
          md5(format('["definir_renda_referencia", "%s", "2026-09-01", 0, 600000, false]', ctx)), sep, null::uuid, null::uuid, ctx),
    'hash md5 de jsonb_build_array(ação, argumentos)::text e alvo em target_id';

  -- Mesma chave com outro pedido ou outra ação: chave_reutilizada (nos dois sentidos).
  perform pg_temp.expect_error(format($f$select public.set_income_reference('rc-n-0101', %L, '2026-09-01', 0, 600001, false)$f$, ctx),
    'chave_reutilizada');
  perform pg_temp.expect_error(format($f$select public.set_income_reference('rc-n-0101', %L, '2026-09-01', 0, 600000, true)$f$, ctx),
    'chave_reutilizada');
  perform pg_temp.expect_error(format($f$select public.delete_income_reference('rc-n-0101', %L, 1)$f$, sep), 'chave_reutilizada');
  perform pg_temp.expect_error(format($f$select public.create_commitment('rc-n-0101', %L, 1000, '2026-10-30', 'Feira')$f$, ctx),
    'chave_reutilizada');
  cid := (public.create_commitment('rc-n-0102', ctx, 1000, '2026-10-30', 'Feira') #>> '{commitment,id}')::uuid;
  perform pg_temp.expect_error(format($f$select public.set_income_reference('rc-n-0102', %L, '2026-09-01', 0, 600000, false)$f$, ctx),
    'chave_reutilizada');
  perform public.delete_commitment('rc-n-0103', cid, 1);

  -- Tipo de renda nulo é recusado sem gastar a chave; com falso, a mesma chave cria.
  perform pg_temp.expect_error(format($f$select public.set_income_reference('rc-n-0104', %L, '2026-11-01', 0, 500000, null)$f$, ctx),
    'tipo_invalido');
  assert not exists (select 1 from public.record_operations where idempotency_key = 'rc-n-0104'), 'recusa não gasta a chave';
  r2 := public.set_income_reference('rc-n-0104', ctx, '2026-11-01', 0, 500000, false);
  assert (r2 ->> 'version')::int = 1 and r2 ->> 'from_month' = '2026-11-01', 'mesma chave depois da recusa';

  -- Alterar com a versão: +1, valor e tipo novos, mesma linha.
  r2 := public.set_income_reference('rc-n-0105', ctx, '2026-09-01', 1, 610000, true);
  assert (r2 ->> 'id')::uuid = sep and (r2 ->> 'version')::int = 2 and (r2 ->> 'amount_cents')::bigint = 610000
     and (r2 ->> 'varies')::boolean and r2 ->> 'created_by' = auth.uid()::text, 'alteração com versão';
  assert (select count(*) from public.income_references) = 2, 'alterar não cria linha';
  -- Repetição antiga devolve a linha atual.
  r2 := public.set_income_reference('rc-n-0101', ctx, '2026-09-01', 0, 600000, false);
  assert (r2 ->> 'version')::int = 2 and (r2 ->> 'amount_cents')::bigint = 610000, 'repetição devolve o estado atual';

  -- Versão: criar de novo no mesmo mês, versão antiga, nula; mês sem referência com versão maior que 0 ou nula.
  -- A versão é conferida antes da validação.
  perform pg_temp.expect_stale(format($f$select public.set_income_reference('rc-n-0106', %L, '2026-09-01', 0, 600000, false)$f$, ctx),
    'versao_atual=2');
  perform pg_temp.expect_stale(format($f$select public.set_income_reference('rc-n-0107', %L, '2026-09-01', 1, 600000, false)$f$, ctx),
    'versao_atual=2');
  perform pg_temp.expect_stale(format($f$select public.set_income_reference('rc-n-0108', %L, '2026-09-01', null, 600000, false)$f$, ctx),
    'versao_atual=2');
  perform pg_temp.expect_stale(format($f$select public.set_income_reference('rc-n-0109', %L, '2026-09-01', 3, 600000, false)$f$, ctx),
    'versao_atual=2');
  perform pg_temp.expect_stale(format($f$select public.set_income_reference('rc-n-0110', %L, '2026-12-01', 1, 600000, false)$f$, ctx),
    'versao_atual=0');
  perform pg_temp.expect_stale(format($f$select public.set_income_reference('rc-n-0111', %L, '2026-12-01', null, 600000, false)$f$, ctx),
    'versao_atual=0');
  perform pg_temp.expect_stale(format($f$select public.set_income_reference('rc-n-0112', %L, '2026-09-01', 0, 0, null)$f$, ctx),
    'versao_atual=2');

  -- Excluir: versão antiga ou nula recusada; com a versão, exclusão lógica (+1). Repetição devolve a linha excluída.
  perform pg_temp.expect_stale(format($f$select public.delete_income_reference('rc-n-0113', %L, 1)$f$, sep), 'versao_atual=2');
  perform pg_temp.expect_stale(format($f$select public.delete_income_reference('rc-n-0114', %L, null)$f$, sep), 'versao_atual=2');
  r1 := public.delete_income_reference('rc-n-0115', sep, 2);
  assert (r1 ->> 'id')::uuid = sep and (r1 ->> 'version')::int = 3 and r1 ->> 'deleted_at' is not null
     and r1 ->> 'deleted_by' = auth.uid()::text and (r1 ->> 'amount_cents')::bigint = 610000, 'exclusão lógica com versão';
  assert public.delete_income_reference('rc-n-0115', sep, 2) = r1, 'repetição da exclusão';
  r2 := public.set_income_reference('rc-n-0101', ctx, '2026-09-01', 0, 600000, false);
  assert r2 = r1, 'repetição da criação devolve a linha já excluída';
  assert not exists (select 1 from public.income_references where id = sep), 'a excluída some da leitura';
  perform pg_temp.expect_error(format($f$select public.delete_income_reference('rc-n-0116', %L, 3)$f$, sep), 'nao_encontrado');
  perform pg_temp.expect_error($f$select public.delete_income_reference('rc-n-0117', gen_random_uuid(), 1)$f$, 'nao_encontrado');
  assert (select (action, target_id) from public.record_operations where idempotency_key = 'rc-n-0115')
       = ('excluir_renda_referencia'::text, sep)
     and (select request_hash from public.record_operations where idempotency_key = 'rc-n-0115')
       = md5(format('["excluir_renda_referencia", "%s", 2]', sep)), 'hash e alvo da exclusão';

  -- Depois de excluir, o mesmo mês aceita uma referência nova (versão 0, outra linha).
  r2 := public.set_income_reference('rc-n-0118', ctx, '2026-09-01', 0, 620000, false);
  assert (r2 ->> 'id')::uuid <> sep and (r2 ->> 'version')::int = 1, 'nova referência no mês de uma excluída';
  perform public.delete_income_reference('rc-n-0119', (r2 ->> 'id')::uuid, 1);
  perform public.delete_income_reference('rc-n-0120', (select id from public.income_references where from_month = '2026-11-01'), 1);
  assert (select count(*) from public.income_references) = 0, 'Noa sem referência viva';
end $$;

-- ---------------------------------------------------------------------------
-- 4. Arredondamento e limites (Noa): "menos de 0,1%" (comprometido > 0 com 0‰), metade para cima, acima de 100% e
-- valores grandes sem estouro (milésimos em bigint).
-- ---------------------------------------------------------------------------
do $$
declare
  ctx uuid := pg_temp.id('noa_ctx');
  ref uuid;
  i int;
begin
  perform pg_temp.as_('noa');
  perform public.create_commitment('rc-n-0201', ctx, 1, '2026-10-20', 'Centavo');
  ref := (public.set_income_reference('rc-n-0202', ctx, '2026-10-01', 0, 999999999, false) ->> 'id')::uuid;
  perform pg_temp.expect_mc('noa_ctx', '2026-10-01',
    'fixos 0 ano 0 parc 0 div 0 outras 1 = 1 | pago 0 aberto 1 est 0 antes 0 | ref 999999999@2026-10f fora 999999998 | '
    '0 div 0 fixos 0 ano 0 parc 0 outras 0', 'comprometido maior que zero com 0‰ ("menos de 0,1%")');
  perform public.set_income_reference('rc-n-0203', ctx, '2026-10-01', 1, 2000, false);
  perform pg_temp.expect_mc('noa_ctx', '2026-10-01',
    'fixos 0 ano 0 parc 0 div 0 outras 1 = 1 | pago 0 aberto 1 est 0 antes 0 | ref 2000@2026-10f fora 1999 | '
    '1 div 0 fixos 0 ano 0 parc 0 outras 1', '0,5‰ exato: metade para cima');
  perform public.set_income_reference('rc-n-0204', ctx, '2026-10-01', 2, 2001, false);
  perform pg_temp.expect_mc('noa_ctx', '2026-10-01',
    'fixos 0 ano 0 parc 0 div 0 outras 1 = 1 | pago 0 aberto 1 est 0 antes 0 | ref 2001@2026-10f fora 2000 | '
    '0 div 0 fixos 0 ano 0 parc 0 outras 0', 'pouco menos de 0,5‰: para baixo');
  for i in 1 .. 5 loop
    perform public.create_commitment('rc-n-021' || i, ctx, 999999999, ('2026-10-2' || i)::date, 'Conta grande ' || i);
  end loop;
  perform public.set_income_reference('rc-n-0205', ctx, '2026-10-01', 3, 1, false);
  perform pg_temp.expect_mc('noa_ctx', '2026-10-01',
    'fixos 0 ano 0 parc 0 div 0 outras 4999999996 = 4999999996 | pago 0 aberto 4999999996 est 0 antes 0 | ref 1@2026-10f '
    'fora -4999999995 | 4999999996000 div 0 fixos 0 ano 0 parc 0 outras 4999999996000', 'sem estouro');
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 5. Sequência de aceite B (Lia, montagem FICTÍCIA da demonstração; hoje 07/10/2026). Tudo pelas funções de escrita.
-- Base de outubro: Recebido 6.000,00, Pago 3.900,00, Diferença 2.100,00, Ainda a pagar 650,00.
-- ---------------------------------------------------------------------------
set role authenticated;
do $$
declare
  ctx uuid := pg_temp.id('lia_ctx');
  acc uuid := pg_temp.id('lia_acc');
  res jsonb;
  cid uuid;
begin
  perform pg_temp.as_('lia');
  perform pg_temp.today('2026-10-07');
  perform public.create_record('rc-l-0001', ctx, acc, 'receita', 600000, '2026-09-01', 'Salário', 'Salário');
  perform public.create_record('rc-l-0002', ctx, acc, 'despesa', 250000, '2026-09-05', 'Aluguel', 'Moradia');
  perform public.create_record('rc-l-0003', ctx, acc, 'despesa', 125000, '2026-09-12', 'Mercado', 'Mercado');
  perform public.create_record('rc-l-0004', ctx, acc, 'receita', 600000, '2026-10-01', 'Salário', 'Salário');
  perform public.create_record('rc-l-0005', ctx, acc, 'despesa', 140000, '2026-10-06', 'Mercado', 'Mercado');
  res := public.create_series('rc-l-0006', ctx, 'mensal', 'conta', 'Aluguel', 'Moradia', 250000, 'fixo', 5, '2026-10-01', 1, null, null);
  insert into ids values ('aluguel', (res #>> '{series,id}')::uuid);
  perform pg_temp.pay('rc-l-0007', pg_temp.occ('aluguel', 1), acc, 250000, '2026-10-05');
  res := public.create_series('rc-l-0008', ctx, 'mensal', 'conta', 'Luz', 'Moradia', 18000, 'variavel', 12, '2026-11-01', 1, null, null);
  insert into ids values ('luz', (res #>> '{series,id}')::uuid);
  res := public.create_series('rc-l-0009', ctx, 'parcelada', 'financiamento', 'Financiamento do carro', 'Transporte', 85000, 'fixo', 10,
                              '2026-11-01', 13, 48, null);
  insert into ids values ('carro', (res #>> '{series,id}')::uuid);
  res := public.create_series('rc-l-0010', ctx, 'anual', 'conta', 'IPVA', 'Transporte', 240000, 'variavel', 20, '2027-01-01', 1, null, null, 1);
  insert into ids values ('ipva', (res #>> '{series,id}')::uuid);
  res := public.create_series('rc-l-0011', ctx, 'anual', 'conta', 'IPTU', 'Moradia', 18000, 'variavel', 10, '2027-02-01', 1, null, null, 10);
  insert into ids values ('iptu', (res #>> '{series,id}')::uuid);
  res := public.create_commitment('rc-l-0012', ctx, 15000, '2026-10-15', 'Internet', 'Moradia');
  insert into ids values ('internet', (res #>> '{commitment,id}')::uuid);
  res := public.create_commitment('rc-l-0013', ctx, 50000, '2026-10-20', 'Condomínio', 'Moradia');
  res := public.create_commitment('rc-l-0014', ctx, 30000, '2026-11-10', 'Seguro do carro', 'Transporte');
  assert pg_temp.sync('lia_ctx') = '{"created": 0, "created_overdue": 0}'::jsonb, 'nada a gerar';
  assert pg_temp.totals('lia_ctx', '2026-10-01') = '{600000,390000,210000}' and pg_temp.to_pay('lia_ctx', '2026-10-01') = '{65000,0,65000,2}',
    'base de outubro da demonstração';
  assert (select count(*) from public.commitment_items where series_id in (pg_temp.id('ipva'), pg_temp.id('iptu'))) = 0,
    'contas do ano ainda não criadas';

  -- Sem referência: só valores em reais.
  perform pg_temp.expect_mc('lia_ctx', '2026-10-01',
    'fixos 250000 ano 0 parc 0 div 0 outras 65000 = 315000 | pago 250000 aberto 65000 est 0 antes 0 | ref - fora - | '
    '- div - fixos - ano - parc - outras -', 'sem referência');

  -- Base: referência 6.000,00 desde setembro.
  res := public.set_income_reference('rc-l-0101', ctx, '2026-09-01', 0, 600000, false);
  insert into ids values ('ref_set', (res ->> 'id')::uuid);
  perform pg_temp.expect_mc('lia_ctx', '2026-10-01',
    'fixos 250000 ano 0 parc 0 div 0 outras 65000 = 315000 | pago 250000 aberto 65000 est 0 antes 0 | ref 600000@2026-09f fora 285000 | '
    '525 div 0 fixos 417 ano 0 parc 0 outras 108', 'base: 52,5%');
  perform pg_temp.expect_mc('lia_ctx', '2026-11-01',
    'fixos 268000 ano 0 parc 85000 div 85000 outras 30000 = 383000 | pago 0 aberto 383000 est 18000 antes 0 | ref 600000@2026-09f fora 217000 | '
    '638 div 142 fixos 447 ano 0 parc 142 outras 50', 'novembro: 63,8%, dívidas 14,2%, inclui 180,00 estimados');
  perform pg_temp.expect_mc('lia_ctx', '2026-09-01',
    'fixos 0 ano 0 parc 0 div 0 outras 0 = 0 | pago 0 aberto 0 est 0 antes 0 | ref 600000@2026-09f fora 600000 | '
    '0 div 0 fixos 0 ano 0 parc 0 outras 0', 'setembro: o aluguel anotado como gasto comum não entra');
  perform pg_temp.expect_mc('lia_ctx', '2026-08-01',
    'fixos 0 ano 0 parc 0 div 0 outras 0 = 0 | pago 0 aberto 0 est 0 antes 0 | ref - fora - | - div - fixos - ano - parc - outras -',
    'agosto: nenhuma referência começa até agosto');
  assert pg_temp.totals('lia_ctx', '2026-10-01') = '{600000,390000,210000}', 'a referência não entra em Recebido';

  -- Pagar a Internet com 159,90: entra o valor pago (52,665% → 52,7%).
  perform pg_temp.pay('rc-l-0102', pg_temp.id('internet'), acc, 15990, '2026-10-07');
  perform pg_temp.expect_mc('lia_ctx', '2026-10-01',
    'fixos 250000 ano 0 parc 0 div 0 outras 65990 = 315990 | pago 265990 aberto 50000 est 0 antes 0 | ref 600000@2026-09f fora 284010 | '
    '527 div 0 fixos 417 ano 0 parc 0 outras 110', 'Internet paga com 159,90');
  assert pg_temp.to_pay('lia_ctx', '2026-10-01') = '{50000,0,50000,1}', 'Ainda a pagar sem a Internet';

  -- Desfazer: volta à base.
  perform public.undo_commitment_payment('rc-l-0103', pg_temp.id('internet'), pg_temp.cver(pg_temp.id('internet')));
  perform pg_temp.check_links();
  perform pg_temp.expect_mc('lia_ctx', '2026-10-01',
    'fixos 250000 ano 0 parc 0 div 0 outras 65000 = 315000 | pago 250000 aberto 65000 est 0 antes 0 | ref 600000@2026-09f fora 285000 | '
    '525 div 0 fixos 417 ano 0 parc 0 outras 108', 'desfeito: base');
  assert pg_temp.to_pay('lia_ctx', '2026-10-01') = '{65000,0,65000,2}', 'Ainda a pagar de volta';

  -- Conta avulsa "Conserto da geladeira", 300,00, vence 28/10.
  res := public.create_commitment('rc-l-0104', ctx, 30000, '2026-10-28', 'Conserto da geladeira', 'Casa');
  perform pg_temp.expect_mc('lia_ctx', '2026-10-01',
    'fixos 250000 ano 0 parc 0 div 0 outras 95000 = 345000 | pago 250000 aberto 95000 est 0 antes 0 | ref 600000@2026-09f fora 255000 | '
    '575 div 0 fixos 417 ano 0 parc 0 outras 158', 'Conserto da geladeira: 57,5%');

  -- Gasto comum "Mercado" 200,00: muda Pago, não o comprometido.
  perform public.create_record('rc-l-0105', ctx, acc, 'despesa', 20000, '2026-10-07', 'Mercado', 'Mercado');
  perform pg_temp.expect_mc('lia_ctx', '2026-10-01',
    'fixos 250000 ano 0 parc 0 div 0 outras 95000 = 345000 | pago 250000 aberto 95000 est 0 antes 0 | ref 600000@2026-09f fora 255000 | '
    '575 div 0 fixos 417 ano 0 parc 0 outras 158', 'gasto sem conta a pagar não entra');
  assert pg_temp.totals('lia_ctx', '2026-10-01') = '{600000,410000,190000}', 'Pago de outubro com o Mercado';

  -- Gás 40,00, vence 28/09: linha à parte em outubro (só no mês de hoje), conta em setembro.
  res := public.create_commitment('rc-l-0106', ctx, 4000, '2026-09-28', 'Gás', 'Moradia');
  perform pg_temp.expect_mc('lia_ctx', '2026-10-01',
    'fixos 250000 ano 0 parc 0 div 0 outras 95000 = 345000 | pago 250000 aberto 95000 est 0 antes 4000 | ref 600000@2026-09f fora 255000 | '
    '575 div 0 fixos 417 ano 0 parc 0 outras 158', 'R$ 40,00 vencidos antes de outubro, fora do percentual');
  perform pg_temp.expect_mc('lia_ctx', '2026-09-01',
    'fixos 0 ano 0 parc 0 div 0 outras 4000 = 4000 | pago 0 aberto 4000 est 0 antes 0 | ref 600000@2026-09f fora 596000 | '
    '7 div 0 fixos 0 ano 0 parc 0 outras 7', 'setembro: 0,7% (sem linha de vencidas: não é o mês de hoje)');
  assert pg_temp.to_pay('lia_ctx', '2026-10-01') = '{95000,4000,99000,4}', 'Ainda a pagar com o Gás vencido';

  -- Pagar hoje o Aluguel de novembro (2.500,00): muda Pago de outubro, não muda nenhum comprometido.
  perform pg_temp.pay('rc-l-0107', pg_temp.occ('aluguel', 2), acc, 250000, '2026-10-07');
  perform pg_temp.expect_mc('lia_ctx', '2026-10-01',
    'fixos 250000 ano 0 parc 0 div 0 outras 95000 = 345000 | pago 250000 aberto 95000 est 0 antes 4000 | ref 600000@2026-09f fora 255000 | '
    '575 div 0 fixos 417 ano 0 parc 0 outras 158', 'outubro não muda');
  perform pg_temp.expect_mc('lia_ctx', '2026-11-01',
    'fixos 268000 ano 0 parc 85000 div 85000 outras 30000 = 383000 | pago 250000 aberto 133000 est 18000 antes 0 | ref 600000@2026-09f fora 217000 | '
    '638 div 142 fixos 447 ano 0 parc 142 outras 50', 'novembro continua 3.830,00, agora com 2.500,00 já pagos');
  assert pg_temp.totals('lia_ctx', '2026-10-01') = '{600000,660000,-60000}', 'Pago de outubro: 6.600,00';

  -- Referência 5.000,00 a partir de outubro: 69,0%; setembro não muda; novembro 76,6%.
  res := public.set_income_reference('rc-l-0108', ctx, '2026-10-01', 0, 500000, false);
  insert into ids values ('ref_out', (res ->> 'id')::uuid);
  perform pg_temp.expect_mc('lia_ctx', '2026-10-01',
    'fixos 250000 ano 0 parc 0 div 0 outras 95000 = 345000 | pago 250000 aberto 95000 est 0 antes 4000 | ref 500000@2026-10f fora 155000 | '
    '690 div 0 fixos 500 ano 0 parc 0 outras 190', 'referência de outubro: 69,0%');
  perform pg_temp.expect_mc('lia_ctx', '2026-09-01',
    'fixos 0 ano 0 parc 0 div 0 outras 4000 = 4000 | pago 0 aberto 4000 est 0 antes 0 | ref 600000@2026-09f fora 596000 | '
    '7 div 0 fixos 0 ano 0 parc 0 outras 7', 'setembro mantém 6.000,00');
  perform pg_temp.expect_mc('lia_ctx', '2026-11-01',
    'fixos 268000 ano 0 parc 85000 div 85000 outras 30000 = 383000 | pago 250000 aberto 133000 est 18000 antes 0 | ref 500000@2026-10f fora 117000 | '
    '766 div 170 fixos 536 ano 0 parc 170 outras 60', 'novembro: 76,6%');
  assert pg_temp.totals('lia_ctx', '2026-10-01') = '{600000,660000,-60000}', 'referência nunca entra em Recebido';

  -- Excluir a referência de outubro: volta a de setembro.
  perform public.delete_income_reference('rc-l-0109', pg_temp.id('ref_out'), 1);
  perform pg_temp.expect_mc('lia_ctx', '2026-10-01',
    'fixos 250000 ano 0 parc 0 div 0 outras 95000 = 345000 | pago 250000 aberto 95000 est 0 antes 4000 | ref 600000@2026-09f fora 255000 | '
    '575 div 0 fixos 417 ano 0 parc 0 outras 158', 'de volta a setembro: 57,5%');
  perform pg_temp.expect_mc('lia_ctx', '2026-11-01',
    'fixos 268000 ano 0 parc 85000 div 85000 outras 30000 = 383000 | pago 250000 aberto 133000 est 18000 antes 0 | ref 600000@2026-09f fora 217000 | '
    '638 div 142 fixos 447 ano 0 parc 142 outras 50', 'novembro de volta a 63,8%');

  -- Excluir também a de setembro: sem percentual, sem "fora dos compromissos".
  perform public.delete_income_reference('rc-l-0110', pg_temp.id('ref_set'), 1);
  perform pg_temp.expect_mc('lia_ctx', '2026-10-01',
    'fixos 250000 ano 0 parc 0 div 0 outras 95000 = 345000 | pago 250000 aberto 95000 est 0 antes 4000 | ref - fora - | '
    '- div - fixos - ano - parc - outras -', 'sem referência');
  perform pg_temp.expect_mc('lia_ctx', '2026-09-01',
    'fixos 0 ano 0 parc 0 div 0 outras 4000 = 4000 | pago 0 aberto 4000 est 0 antes 0 | ref - fora - | '
    '- div - fixos - ano - parc - outras -', 'setembro sem referência');
  assert pg_temp.totals('lia_ctx', '2026-10-01') = '{600000,660000,-60000}' and pg_temp.to_pay('lia_ctx', '2026-10-01') = '{95000,4000,99000,4}',
    'Pago e Ainda a pagar não mudam com a referência';

  -- Acima de 100% (valor real, "fora" negativo) e exatamente 100%, com "Minha renda varia".
  res := public.set_income_reference('rc-l-0201', ctx, '2026-10-01', 0, 300000, false);
  perform pg_temp.expect_mc('lia_ctx', '2026-10-01',
    'fixos 250000 ano 0 parc 0 div 0 outras 95000 = 345000 | pago 250000 aberto 95000 est 0 antes 4000 | ref 300000@2026-10f fora -45000 | '
    '1150 div 0 fixos 833 ano 0 parc 0 outras 317', 'acima de 100%: 115,0%');
  res := public.set_income_reference('rc-l-0202', ctx, '2026-10-01', 1, 345000, true);
  perform pg_temp.expect_mc('lia_ctx', '2026-10-01',
    'fixos 250000 ano 0 parc 0 div 0 outras 95000 = 345000 | pago 250000 aberto 95000 est 0 antes 4000 | ref 345000@2026-10v fora 0 | '
    '1000 div 0 fixos 725 ano 0 parc 0 outras 275', 'exatamente 100%, renda que varia');
  perform public.delete_income_reference('rc-l-0203', (res ->> 'id')::uuid, 2);

  -- Conta excluída não entra.
  cid := (public.create_commitment('rc-l-0204', ctx, 1000, '2026-10-25', 'Teste') #>> '{commitment,id}')::uuid;
  assert (select committed_cents from public.month_committed(ctx, '2026-10-01')) = 346000, 'conta nova entra';
  perform public.delete_commitment('rc-l-0205', cid, 1);
  perform pg_temp.expect_mc('lia_ctx', '2026-10-01',
    'fixos 250000 ano 0 parc 0 div 0 outras 95000 = 345000 | pago 250000 aberto 95000 est 0 antes 4000 | ref - fora - | '
    '- div - fixos - ano - parc - outras -', 'conta excluída não entra');

  -- Referência de setembro de novo (para as seções seguintes).
  res := public.set_income_reference('rc-l-0206', ctx, '2026-09-01', 0, 600000, false);
  insert into ids values ('ref_set2', (res ->> 'id')::uuid);
  assert (select count(*) from public.income_references) = 1, 'Lia lê só a referência viva';
end $$;

-- ---------------------------------------------------------------------------
-- 6. Permissões: Família (escrita, autoria e "editar de outras pessoas"), Pessoal de outra pessoa, empresa, externo e
-- vínculo revogado. A Família não lê o Pessoal; a empresa não lê nada, nem somado.
-- ---------------------------------------------------------------------------
do $$
declare
  fam uuid := pg_temp.id('fam');
  lia uuid := pg_temp.id('lia_ctx');
  res jsonb;
  p text;
  fsep uuid;
  fout uuid;
begin
  perform pg_temp.today('2026-10-07');
  -- Iara cria; Otto altera a de Iara ("editar de outras pessoas"); Iara altera a própria.
  perform pg_temp.as_('iara');
  fsep := (public.set_income_reference('rc-f-0001', fam, '2026-09-01', 0, 900000, false) ->> 'id')::uuid;
  perform pg_temp.as_('otto');
  res := public.set_income_reference('rc-f-0002', fam, '2026-09-01', 1, 910000, false);
  assert (res ->> 'version')::int = 2 and res ->> 'created_by' = pg_temp.id('iara')::text, 'Otto altera a de Iara; a autoria fica';
  perform pg_temp.as_('iara');
  res := public.set_income_reference('rc-f-0003', fam, '2026-09-01', 2, 920000, true);
  assert (res ->> 'version')::int = 3, 'Iara altera a própria';
  -- Otto cria outubro; Iara não altera nem exclui a de Otto.
  perform pg_temp.as_('otto');
  fout := (public.set_income_reference('rc-f-0004', fam, '2026-10-01', 0, 950000, false) ->> 'id')::uuid;
  perform pg_temp.as_('iara');
  perform pg_temp.expect_error(format($f$select public.set_income_reference('rc-f-0005', %L, '2026-10-01', 1, 1, false)$f$, fam),
    'sem_permissao');
  perform pg_temp.expect_error(format($f$select public.delete_income_reference('rc-f-0006', %L, 1)$f$, fout), 'sem_permissao');
  -- A autoria é conferida antes da validação, depois da versão.
  perform pg_temp.expect_stale(format($f$select public.set_income_reference('rc-f-0007', %L, '2026-10-01', 9, 0, false)$f$, fam),
    'versao_atual=1');
  perform pg_temp.expect_error(format($f$select public.set_income_reference('rc-f-0008', %L, '2026-10-01', 1, 0, null)$f$, fam),
    'sem_permissao');

  -- Gil só lê: lê as referências e a renda comprometida da Família; não grava.
  perform pg_temp.as_('gil');
  perform pg_temp.expect_error(format($f$select public.set_income_reference('rc-f-0009', %L, '2026-11-01', 0, 1, false)$f$, fam),
    'sem_permissao');
  perform pg_temp.expect_error(format($f$select public.delete_income_reference('rc-f-0010', %L, 3)$f$, fsep), 'sem_permissao');
  assert (select count(*) from public.income_references where context_id = fam) = 2, 'Gil lê as duas da Família';

  -- Conta da Família conta só na Família.
  perform pg_temp.as_('lia');
  perform public.create_commitment('rc-f-0011', fam, 120000, '2026-10-12', 'Escola');
  perform pg_temp.as_('gil');
  perform pg_temp.expect_mc('fam', '2026-10-01',
    'fixos 0 ano 0 parc 0 div 0 outras 120000 = 120000 | pago 0 aberto 120000 est 0 antes 0 | ref 950000@2026-10f fora 830000 | '
    '126 div 0 fixos 0 ano 0 parc 0 outras 126', 'Família: só as contas da Família');
  perform pg_temp.as_('lia');
  assert (select committed_cents from public.month_committed(lia, '2026-10-01')) = 345000, 'o Pessoal da Lia não muda';

  -- Família, empresa e externo não leem o Pessoal da Lia: nem a referência, nem a renda comprometida, nem por repetição.
  foreach p in array array['gil', 'iara', 'otto', 'katia', 'hugo'] loop
    perform pg_temp.as_(p);
    assert (select count(*) from public.income_references where context_id = lia) = 0, p || ' não lê a referência da Lia';
    perform pg_temp.expect_error(format($f$select * from public.month_committed(%L, '2026-10-01')$f$, lia), 'sem_permissao');
    perform pg_temp.expect_error(format($f$select public.set_income_reference(%L, %L, '2026-11-01', 0, 1, false)$f$,
      'rc-x-' || p, lia), 'sem_permissao');
    perform pg_temp.expect_error(format($f$select public.delete_income_reference(%L, %L, 1)$f$,
      'rc-y-' || p, pg_temp.id('ref_set2')), 'nao_encontrado');
  end loop;
  -- Empresa e externo também não leem a Família.
  foreach p in array array['katia', 'hugo'] loop
    perform pg_temp.as_(p);
    assert (select count(*) from public.income_references) = 0, p || ' não lê nenhuma referência';
    perform pg_temp.expect_error(format($f$select * from public.month_committed(%L, '2026-10-01')$f$, fam), 'sem_permissao');
    perform pg_temp.expect_error(format($f$select public.delete_income_reference(%L, %L, 3)$f$, 'rc-z-' || p, fsep), 'nao_encontrado');
  end loop;
end $$;

-- Vínculo revogado: Iara deixa de ler, de repetir e de excluir a própria referência da Família.
reset role;
update public.context_memberships set revoked_at = now() where context_id = (select id from ids where name = 'fam') and person_id = :iara;
set role authenticated;
do $$
declare
  fam uuid := pg_temp.id('fam');
begin
  perform pg_temp.as_('iara');
  assert (select count(*) from public.income_references) = 0, 'revogada não lê';
  perform pg_temp.expect_error(format($f$select * from public.month_committed(%L, '2026-10-01')$f$, fam), 'sem_permissao');
  perform pg_temp.expect_error(format($f$select public.set_income_reference('rc-f-0003', %L, '2026-09-01', 2, 920000, true)$f$, fam),
    'nao_encontrado');
  perform pg_temp.expect_error(format($f$select public.delete_income_reference('rc-f-0012', %L, 3)$f$,
    (select target_id from public.record_operations where idempotency_key = 'rc-f-0001')), 'nao_encontrado');
  -- A titular exclui a de Otto ("editar de outras pessoas").
  perform pg_temp.as_('lia');
  perform public.delete_income_reference('rc-f-0013', (select id from public.income_references where context_id = fam
                                                         and from_month = '2026-10-01'), 1);
  assert (select count(*) from public.income_references where context_id = fam) = 1, 'titular exclui a de outra pessoa';
end $$;

-- ---------------------------------------------------------------------------
-- 7. Contas do ano (D-029(6)): grupo próprio, nunca dívida, no mês do vencimento (Lia, hoje 05/01/2027).
-- Janeiro de 2027 = 2.500 + 180 + 850 (parcela 15) + 2.400 (IPVA) = 5.930,00 → 98,8% (contas do ano 40,0%);
-- fevereiro = 2.500 + 180 + 850 + 180 (IPTU 1 de 10) = 3.710,00 → 61,8% (3,0%).
-- ---------------------------------------------------------------------------
do $$
declare
  ctx uuid := pg_temp.id('lia_ctx');
  acc uuid := pg_temp.id('lia_acc');
  res jsonb;
begin
  perform pg_temp.as_('lia');
  perform pg_temp.today('2027-01-05');
  assert pg_temp.act('lia', 'lia_ctx') = '2026-10-07 - -', 'última anotação em 07/10';
  assert pg_temp.sync('lia_ctx') = '{"created": 20, "created_overdue": 3}'::jsonb,
    'dezembro a fevereiro dos mensais e do carro, IPVA de 2027 e as 10 parcelas do IPTU de 2027';
  assert pg_temp.act('lia', 'lia_ctx') = '2026-10-07 - -', 'gerar não é anotação';
  -- Alterar a referência é uma anotação (A4, R1): conta para a atividade.
  res := public.set_income_reference('rc-l-0301', ctx, '2026-09-01', 1, 600000, false);
  assert (res ->> 'version')::int = 2, 'mesma referência, versão 2';
  assert pg_temp.act('lia', 'lia_ctx') = '2027-01-05 2026-10-07 2027-01-05', 'definir a referência conta como anotação';

  perform pg_temp.expect_mc('lia_ctx', '2026-12-01',
    'fixos 268000 ano 0 parc 85000 div 85000 outras 0 = 353000 | pago 0 aberto 353000 est 18000 antes 0 | ref 600000@2026-09f fora 247000 | '
    '588 div 142 fixos 447 ano 0 parc 142 outras 0', 'dezembro: 3.530,00, 58,8%');
  perform pg_temp.expect_mc('lia_ctx', '2027-01-01',
    'fixos 268000 ano 240000 parc 85000 div 85000 outras 0 = 593000 | pago 0 aberto 593000 est 258000 antes 585000 | ref 600000@2026-09f fora 7000 | '
    '988 div 142 fixos 447 ano 400 parc 142 outras 0', 'janeiro: 98,8%, contas do ano 40,0%, IPVA não é dívida');
  perform pg_temp.expect_mc('lia_ctx', '2027-02-01',
    'fixos 268000 ano 18000 parc 85000 div 85000 outras 0 = 371000 | pago 0 aberto 371000 est 36000 antes 0 | ref 600000@2026-09f fora 229000 | '
    '618 div 142 fixos 447 ano 30 parc 142 outras 0', 'fevereiro: 61,8%, contas do ano 3,0%');

  -- IPVA pago com 2.512,30: entra o valor pago.
  perform pg_temp.pay('rc-l-0302', pg_temp.occ('ipva', 1), acc, 251230, '2027-01-05');
  perform pg_temp.expect_mc('lia_ctx', '2027-01-01',
    'fixos 268000 ano 251230 parc 85000 div 85000 outras 0 = 604230 | pago 251230 aberto 353000 est 18000 antes 585000 | ref 600000@2026-09f fora -4230 | '
    '1007 div 142 fixos 447 ano 419 parc 142 outras 0', 'IPVA pago com 2.512,30');

  -- Tirar as parcelas do IPTU de 2027: excluídas não entram.
  res := public.skip_series_year('rc-l-0303', pg_temp.id('iptu'), 1, pg_temp.refs('iptu', '{1,2,3,4,5,6,7,8,9,10}'));
  perform pg_temp.check_links();
  perform pg_temp.expect_mc('lia_ctx', '2027-02-01',
    'fixos 268000 ano 0 parc 85000 div 85000 outras 0 = 353000 | pago 0 aberto 353000 est 18000 antes 0 | ref 600000@2026-09f fora 247000 | '
    '588 div 142 fixos 447 ano 0 parc 142 outras 0', 'IPTU de 2027 tirado');

  -- Dívidas: compra parcelada entra; "outro parcelamento" não. O tipo é lido da série (junção): mudar o tipo muda dívidas.
  res := public.create_series('rc-l-0304', ctx, 'parcelada', 'compra_parcelada', 'Geladeira', 'Casa', 30000, 'fixo', 15,
                              '2027-02-01', 1, 3, null);
  res := public.create_series('rc-l-0305', ctx, 'parcelada', 'outro_parcelamento', 'Matrícula parcelada', 'Educação', 20000, 'fixo', 10,
                              '2027-02-01', 1, 2, null);
  insert into ids values ('matricula', (res #>> '{series,id}')::uuid);
  perform pg_temp.expect_mc('lia_ctx', '2027-02-01',
    'fixos 268000 ano 0 parc 135000 div 115000 outras 0 = 403000 | pago 0 aberto 403000 est 18000 antes 0 | ref 600000@2026-09f fora 197000 | '
    '672 div 192 fixos 447 ano 0 parc 225 outras 0', 'compra parcelada é dívida; outro parcelamento não');
  res := public.update_series_from('rc-l-0306', pg_temp.id('matricula'), 1, 1, pg_temp.refs('matricula', '{1}'), 'compra_parcelada',
                                   'Matrícula parcelada', 'Educação', 20000, 'fixo', 10);
  perform pg_temp.expect_mc('lia_ctx', '2027-02-01',
    'fixos 268000 ano 0 parc 135000 div 135000 outras 0 = 403000 | pago 0 aberto 403000 est 18000 antes 0 | ref 600000@2026-09f fora 197000 | '
    '672 div 225 fixos 447 ano 0 parc 225 outras 0', 'tipo novo lido pela junção');
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 8. record_operations: as duas ações novas apontam só para a referência (target_id); a lista vigente tem 18 ações.
-- ---------------------------------------------------------------------------
do $$
declare
  cases text[][] := array[
    array['definir_renda_referencia', 'r', null, 't'],
    array['definir_renda_referencia', null, 'c', 't'],
    array['definir_renda_referencia', null, null, null],
    array['excluir_renda_referencia', 'r', null, null],
    array['excluir_renda_referencia', null, 'c', null],
    array['excluir_renda_referencia', null, null, null],
    array['excluir_renda_referencia', null, 'c', 't']
  ];
  i int;
begin
  for i in 1 .. array_length(cases, 1) loop
    perform pg_temp.expect_error(format($f$insert into public.record_operations
        (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id, target_id)
      values (%L, %L, %L, %L, 'x', %s, %s, %s)$f$,
      pg_temp.id('lia'), 'rc-o-1' || lpad(i::text, 3, '0'), cases[i][1], pg_temp.id('lia_ctx'),
      case when cases[i][2] is null then 'null' else 'gen_random_uuid()' end,
      case when cases[i][3] is null then 'null' else 'gen_random_uuid()' end,
      case when cases[i][4] is null then 'null' else 'gen_random_uuid()' end), '%record_operations_target_check%');
  end loop;
  perform pg_temp.expect_error(format($f$insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash)
    values (%L, 'rc-o-2001', 'definir_renda', gen_random_uuid(), 'x')$f$, pg_temp.id('lia')), '%record_operations_action_check%');
  assert (select array_agg(m[1] order by m[1] collate "C")
            from pg_constraint c, regexp_matches(pg_get_constraintdef(c.oid), '''([a-z_]+)''::text', 'g') m
           where c.conname = 'record_operations_action_check')
    = array['alterar_meta', 'alterar_movimento_meta', 'alterar_serie', 'criar', 'criar_compromisso', 'criar_meta', 'criar_ocorrencia', 'criar_serie', 'decidir_revisao',
            'definir_renda_referencia', 'desfazer_pagamento', 'editar', 'editar_compromisso', 'encerrar_serie', 'excluir',
            'excluir_compromisso', 'excluir_meta', 'excluir_movimento_meta', 'excluir_renda_referencia', 'excluir_serie', 'informar_ano', 'pagar_compromisso',
            'registrar_movimento_meta', 'responder_guardar', 'situacao_meta', 'tirar_ano'],
    'as 26 ações vigentes (com as 7 de metas, testadas em 60, e a de guardar, testada em 65)';
  -- Toda operação nova aponta para uma referência do mesmo contexto; a exclusão, para uma referência excluída.
  assert not exists (select 1 from public.record_operations o
                      where o.action in ('definir_renda_referencia', 'excluir_renda_referencia')
                        and not exists (select 1 from public.income_references r
                                         where r.id = o.target_id and r.context_id = o.context_id
                                           and (o.action = 'definir_renda_referencia' or r.deleted_at is not null))),
    'operações apontam para a referência';
  assert (select count(*) from public.record_operations where action = 'definir_renda_referencia') = 22
     and (select count(*) from public.record_operations where action = 'excluir_renda_referencia') = 11,
    'uma operação por escrita (repetições e recusas não gravam)';
  -- B4: nenhuma função nova grava registros nem contas a pagar.
  assert not exists (select 1 from public.record_operations
                      where action in ('definir_renda_referencia', 'excluir_renda_referencia')
                        and (record_id is not null or commitment_id is not null)), 'sem registro nem conta a pagar';
end $$;

-- ---------------------------------------------------------------------------
-- 9. Guarda e restrições da tabela (escrita direta do backend; cada caso desfeito no próprio bloco).
-- ---------------------------------------------------------------------------
do $$
declare
  live uuid := pg_temp.id('ref_set2');
  dead uuid := pg_temp.id('ref_set');
  ctx uuid := pg_temp.id('lia_ctx');
begin
  perform pg_temp.expect_error(format('update public.income_references set from_month = %L, version = version + 1 where id = %L',
    '2026-08-01', live), 'campo_imutavel');
  perform pg_temp.expect_error(format('update public.income_references set context_id = %L, version = version + 1 where id = %L',
    pg_temp.id('fam'), live), 'campo_imutavel');
  perform pg_temp.expect_error(format('update public.income_references set created_by = %L, version = version + 1 where id = %L',
    pg_temp.id('gil'), live), 'campo_imutavel');
  perform pg_temp.expect_error(format($f$update public.income_references set created_at = created_at - interval '1 day',
    version = version + 1 where id = %L$f$, live), 'campo_imutavel');
  perform pg_temp.expect_error(format('update public.income_references set id = gen_random_uuid(), version = version + 1 where id = %L',
    live), 'campo_imutavel');
  perform pg_temp.expect_error(format('update public.income_references set amount_cents = 1 where id = %L', live), 'campo_imutavel');
  perform pg_temp.expect_error(format('update public.income_references set version = version + 2 where id = %L', live), 'campo_imutavel');
  perform pg_temp.expect_error(format('update public.income_references set amount_cents = 1, version = version + 1 where id = %L', dead),
    'campo_imutavel');
  perform pg_temp.expect_error(format(
    'update public.income_references set deleted_at = null, deleted_by = null, version = version + 1 where id = %L', dead),
    'campo_imutavel');
  -- Uma escrita válida passa pela guarda (e é desfeita).
  begin
    update public.income_references set amount_cents = 610000, version = version + 1 where id = live;
    assert (select (amount_cents, version) from public.income_references where id = live) = (610000::bigint, 3), 'guarda aceita +1';
    raise exception 'desfazer';
  exception when raise_exception then
    assert sqlerrm = 'desfazer', sqlerrm;
  end;
  assert (select (amount_cents, version) from public.income_references where id = live) = (600000::bigint, 2), 'desfeito';

  perform pg_temp.expect_error(format($f$insert into public.income_references (context_id, from_month, amount_cents, created_by)
    values (%L, '2026-09-01', 1, %L)$f$, ctx, pg_temp.id('lia')), '%income_references_one_live%');
  perform pg_temp.expect_error(format($f$insert into public.income_references (context_id, from_month, amount_cents, created_by)
    values (%L, '2026-07-15', 1, %L)$f$, ctx, pg_temp.id('lia')), '%income_references_mes%');
  perform pg_temp.expect_error(format($f$insert into public.income_references (context_id, from_month, amount_cents, created_by)
    values (%L, '2026-07-01', 0, %L)$f$, ctx, pg_temp.id('lia')), '%income_references_valor%');
  perform pg_temp.expect_error(format($f$insert into public.income_references (context_id, from_month, amount_cents, created_by)
    values (%L, '2026-07-01', 1000000000, %L)$f$, ctx, pg_temp.id('lia')), '%income_references_valor%');
  perform pg_temp.expect_error(format($f$insert into public.income_references (context_id, from_month, amount_cents, created_by, deleted_at)
    values (%L, '2026-07-01', 1, %L, now())$f$, ctx, pg_temp.id('lia')), '%income_references_exclusao%');
  perform pg_temp.expect_error(format($f$insert into public.income_references (context_id, from_month, amount_cents, created_by)
    values (gen_random_uuid(), '2026-07-01', 1, %L)$f$, pg_temp.id('lia')), '%income_references_context_id_fkey%');
  -- Excluída não bloqueia o mês (B1 só vale para as vivas): Lia tem a excluída de setembro e a viva.
  assert (select count(*) from public.income_references where context_id = ctx and from_month = '2026-09-01') = 2
     and (select count(*) from public.income_references where context_id = ctx and from_month = '2026-09-01' and deleted_at is null) = 1,
    'uma viva e uma excluída em setembro';
end $$;
set role authenticated;
select pg_temp.as_('lia');
select pg_temp.expect_error(format($f$insert into public.income_references (context_id, from_month, amount_cents, created_by)
  values (%L, '2026-07-01', 1, %L)$f$, pg_temp.id('lia_ctx'), pg_temp.id('lia')), 'permission denied%');
select pg_temp.expect_error(format('update public.income_references set amount_cents = 1, version = version + 1 where id = %L',
  pg_temp.id('ref_set2')), 'permission denied%');
select pg_temp.expect_error(format('delete from public.income_references where id = %L', pg_temp.id('ref_set2')), 'permission denied%');
reset role;

-- ---------------------------------------------------------------------------
-- 10. Privilégios e assinaturas (conferidos como superusuário).
-- ---------------------------------------------------------------------------
do $$ begin
  assert (select array_agg(p.proname::text order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and has_function_privilege('authenticated', p.oid, 'execute'))
    = array['add_goal_movement', 'context_permission', 'create_commitment', 'create_goal', 'create_record', 'create_series', 'create_series_occurrence',
            'decide_return_review', 'delete_commitment', 'delete_goal', 'delete_goal_movement', 'delete_income_reference', 'delete_record', 'delete_series', 'end_series',
            'ensure_personal_space', 'inform_series_year', 'is_org_admin', 'month_committed', 'month_to_pay', 'month_totals',
            'months_overview', 'pay_commitment', 'set_goal_status', 'set_income_reference', 'set_savings_answer', 'skip_series_year', 'sync_series_occurrences',
            'undo_commitment_payment', 'update_commitment', 'update_goal', 'update_goal_movement', 'update_record', 'update_series_from'],
    'authenticated executa só as funções expostas (3 novas)';
  assert not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                      where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')), 'anon não executa nenhuma função';
  assert not has_function_privilege('authenticated', 'public.income_references_guard()', 'execute'), 'guarda sem execute';
  assert pg_get_function_identity_arguments('public.set_income_reference(text, uuid, date, integer, bigint, boolean)'::regprocedure)
       = 'p_idempotency_key text, p_context_id uuid, p_from_month date, p_expected_version integer, p_amount_cents bigint, p_varies boolean'
     and pg_get_function_identity_arguments('public.delete_income_reference(text, uuid, integer)'::regprocedure)
       = 'p_idempotency_key text, p_id uuid, p_expected_version integer'
     and pg_get_function_identity_arguments('public.month_committed(uuid, date)'::regprocedure) = 'p_context_id uuid, p_month date',
    'assinaturas e nomes dos argumentos (chamada por nome no PostgREST)';
  assert pg_get_function_result('public.month_committed(uuid, date)'::regprocedure)
    = 'TABLE(fixed_cents bigint, annual_cents bigint, installment_cents bigint, debt_cents bigint, other_cents bigint, '
      'committed_cents bigint, paid_part_cents bigint, open_part_cents bigint, estimated_open_cents bigint, overdue_before_cents bigint, '
      'reference_cents bigint, reference_from date, reference_varies boolean, outside_cents bigint, committed_permille bigint, '
      'debt_permille bigint, fixed_permille bigint, annual_permille bigint, installment_permille bigint, other_permille bigint)',
    'colunas de month_committed';
  assert pg_get_function_result('public.set_income_reference(text, uuid, date, integer, bigint, boolean)'::regprocedure) = 'jsonb'
     and pg_get_function_result('public.delete_income_reference(text, uuid, integer)'::regprocedure) = 'jsonb', 'retorno jsonb';
  assert (select bool_and(prosecdef) from pg_proc where oid in ('public.set_income_reference(text, uuid, date, integer, bigint, boolean)'::regprocedure,
            'public.delete_income_reference(text, uuid, integer)'::regprocedure, 'public.month_committed(uuid, date)'::regprocedure))
     and (select provolatile from pg_proc where oid = 'public.month_committed(uuid, date)'::regprocedure) = 's'
     and (select provolatile from pg_proc where oid = 'public.set_income_reference(text, uuid, date, integer, bigint, boolean)'::regprocedure) = 'v'
     and (select provolatile from pg_proc where oid = 'public.delete_income_reference(text, uuid, integer)'::regprocedure) = 'v',
    'definer; leitura stable, escritas volatile';
  assert (select array_agg(attname::text order by attnum) from pg_attribute
           where attrelid = 'public.income_references'::regclass and attnum > 0 and not attisdropped)
    = array['id', 'context_id', 'from_month', 'amount_cents', 'varies', 'created_by', 'version', 'created_at', 'updated_at',
            'deleted_at', 'deleted_by'], 'colunas de income_references';
  assert has_table_privilege('authenticated', 'public.income_references', 'select'), 'leitura (filtrada pela RLS)';
  assert not has_table_privilege('authenticated', 'public.income_references', 'insert, update, delete, truncate')
     and not has_any_column_privilege('authenticated', 'public.income_references', 'insert, update'), 'sem escrita direta';
  assert not has_table_privilege('anon', 'public.income_references', 'select'), 'anon não lê';
  assert (select relrowsecurity from pg_class where oid = 'public.income_references'::regclass)
     and exists (select 1 from pg_policies where tablename = 'income_references' and policyname = 'income_references_read'
                   and cmd = 'SELECT' and roles = '{authenticated}'), 'RLS ligada, só leitura';
  assert (select confdeltype from pg_constraint where conname = 'income_references_context_id_fkey') = 'c',
    'sai junto com o contexto (exclusão de dados)';
  assert exists (select 1 from pg_trigger where tgname = 'income_references_guard' and tgrelid = 'public.income_references'::regclass
                   and not tgisinternal and tgenabled = 'O'), 'guarda ligada';
  -- As assinaturas das migrações anteriores continuam.
  assert to_regprocedure('public.month_to_pay(uuid, date)') is not null
     and to_regprocedure('public.update_commitment(text, uuid, integer, bigint, date, text, text, boolean)') is not null
     and to_regprocedure('public.create_series(text, uuid, text, text, text, text, bigint, text, integer, date, integer, integer, date, integer)') is not null
     and to_regprocedure('public.create_series_occurrence(text, uuid, integer, integer, text)') is not null
     and to_regprocedure('public.months_overview(uuid, date, date)') is not null, 'demais assinaturas sem mudança';
end $$;
set role anon;
select pg_temp.expect_error($$select public.set_income_reference('rc-anon-0001', gen_random_uuid(), '2026-09-01', 0, 1, false)$$, 'permission denied%');
select pg_temp.expect_error($$select public.delete_income_reference('rc-anon-0002', gen_random_uuid(), 1)$$, 'permission denied%');
select pg_temp.expect_error($$select * from public.month_committed(gen_random_uuid(), '2026-09-01')$$, 'permission denied%');
select pg_temp.expect_error($$select * from public.income_references$$, 'permission denied%');
reset role;

-- Vínculos e séries coerentes no fim de tudo.
select pg_temp.check_links();

rollback;
