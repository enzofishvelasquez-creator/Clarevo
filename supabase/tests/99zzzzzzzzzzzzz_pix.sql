-- Pix mês a mês na assinatura pela web (D-093, caminho B; migração 0033): cada pagamento por Pix vale um mês, encadeado a partir do dia do
-- pagamento ou do fim do mês já pago, com 3 dias de tolerância; estorno tira o mês; a origem do direito é 'pix'. Só a chave de serviço
-- usa billing_pix_apply e billing_pix_person; o app não lê a tabela. Pessoas FICTÍCIAS: Eva e Ivo. Tudo em uma transação desfeita no fim.
\set ON_ERROR_STOP 1
\set eva '''00000000-0000-0000-0000-0000000000e7'''
\set ivo '''00000000-0000-0000-0000-0000000000e8'''
\set gil '''00000000-0000-0000-0000-0000000000e9'''

begin;

create function pg_temp.expect_code(p_sql text, p_code text, p_state text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm = p_code and sqlstate = p_state then return; end if;
    raise exception 'esperado % (%), veio "%" (%) em: %', p_code, p_state, sqlerrm, sqlstate, left(p_sql, 300);
  end;
  raise exception 'esperado erro %, mas passou: %', p_code, left(p_sql, 300);
end $$;
create function pg_temp.as_(p_id uuid) returns text language sql as $$
  select set_config('request.jwt.claim.sub', p_id::text, true)
$$;
create function pg_temp.as_service() returns void language sql as $$
  select set_config('request.jwt.claim.sub', '', true);
  select set_config('request.jwt.claims', '{"role":"service_role"}', true);
$$;
create function pg_temp.eva() returns uuid language sql as $$ select '00000000-0000-0000-0000-0000000000e7'::uuid $$;
create function pg_temp.ivo() returns uuid language sql as $$ select '00000000-0000-0000-0000-0000000000e8'::uuid $$;
create function pg_temp.gil() returns uuid language sql as $$ select '00000000-0000-0000-0000-0000000000e9'::uuid $$;
create function pg_temp.sha(p_text text) returns text language sql as $$ select encode(sha256(convert_to(p_text, 'UTF8')), 'hex') $$;
-- O dia de hoje em Brasília (as datas do Asaas e do acesso são de Brasília).
create function pg_temp.hoje() returns date language sql as $$ select (now() at time zone 'America/Sao_Paulo')::date $$;
-- O fim do acesso esperado para o último dia pago: mais 3 dias de tolerância, até o fim do dia em Brasília.
create function pg_temp.ate(p_paid_through date) returns timestamptz language sql as $$
  select ((p_paid_through + 4)::timestamp at time zone 'America/Sao_Paulo') - interval '1 millisecond'
$$;
create function pg_temp.access(p_id uuid) returns jsonb language sql security definer set search_path = public, pg_temp as $$
  select public.clarevo_access(p_id)
$$;
create function pg_temp.pix_rows(p_id uuid) returns bigint language sql security definer set search_path = public, pg_temp as $$
  select count(*) from public.billing_pix_payments where person_id = p_id
$$;
create function pg_temp.pix_until(p_id uuid, p_plan text) returns timestamptz language sql security definer set search_path = public, pg_temp as $$
  select e.valid_until from public.plan_entitlements e where e.person_id = p_id and e.provider = 'pix' and e.plan = p_plan
$$;

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  (:eva, 'eva.pix@exemplo.test', now(), '{"display_name":"Eva"}'),
  (:ivo, 'ivo.pix@exemplo.test', now(), '{"display_name":"Ivo"}'),
  (:gil, 'gil.pix@exemplo.test', now(), '{"display_name":"Gil"}');
set role authenticated;
select pg_temp.as_(:eva);
select public.ensure_personal_space('Conta principal');
select pg_temp.as_(:ivo);
select public.ensure_personal_space('Conta principal');
select pg_temp.as_(:gil);
select public.ensure_personal_space('Conta principal');
reset role;
-- A cobrança começou há 20 dias e as contas são de antes: sem pagar, só leitura.
select public.clarevo_staff_set_billing_start(now() - interval '20 days');
update public.persons set created_at = now() - interval '60 days' where id in (:eva, :ivo, :gil);

-- ---------------------------------------------------------------------------
-- 1. Privilégios: só a chave de serviço; ninguém lê a tabela direto; a origem 'pix' passa nas restrições.
-- ---------------------------------------------------------------------------
do $$ begin
  assert has_function_privilege('service_role', 'public.billing_pix_apply(text, uuid, text, text, date, timestamptz)', 'execute')
     and not has_function_privilege('authenticated', 'public.billing_pix_apply(text, uuid, text, text, date, timestamptz)', 'execute')
     and not has_function_privilege('anon', 'public.billing_pix_apply(text, uuid, text, text, date, timestamptz)', 'execute'),
    'billing_pix_apply só com a chave de serviço';
  assert has_function_privilege('service_role', 'public.billing_pix_person(text)', 'execute')
     and not has_function_privilege('authenticated', 'public.billing_pix_person(text)', 'execute')
     and not has_function_privilege('anon', 'public.billing_pix_person(text)', 'execute'),
    'billing_pix_person só com a chave de serviço';
  assert not has_table_privilege('authenticated', 'public.billing_pix_payments', 'select')
     and not has_table_privilege('anon', 'public.billing_pix_payments', 'select')
     and not has_table_privilege('service_role', 'public.billing_pix_payments', 'select'),
    'ninguém lê billing_pix_payments direto';
  assert pg_temp.access(pg_temp.eva()) ->> 'status' = 'leitura', 'sem pagar: só leitura';
end $$;

-- ---------------------------------------------------------------------------
-- 2. Pagamentos encadeados, aviso repetido, pagamento pendente, estorno e plano à parte.
-- ---------------------------------------------------------------------------
set role service_role;
select pg_temp.as_service();
do $$
declare
  r jsonb;
  d1 date := pg_temp.hoje() - 5;
  end1 date := (pg_temp.hoje() - 5 + interval '1 month')::date;
begin
  -- Criado e ainda não pago: grava a linha, sem acesso.
  r := public.billing_pix_apply('evt_pix_1', pg_temp.eva(), 'individual', pg_temp.sha('pay_eva_1'), null, now() - interval '6 days');
  assert r ->> 'result' = 'aplicado' and r -> 'paid_through' = 'null'::jsonb and r #>> '{access,status}' = 'leitura', 'pendente: ' || r::text;
  assert pg_temp.pix_rows(pg_temp.eva()) = 1 and pg_temp.pix_until(pg_temp.eva(), 'individual') is null, 'pendente não cria direito';
  -- Pago há 5 dias: um mês a partir do pagamento, com a tolerância; a origem é 'pix'.
  r := public.billing_pix_apply('evt_pix_2', pg_temp.eva(), 'individual', pg_temp.sha('pay_eva_1'), d1, now() - interval '5 days');
  assert r ->> 'result' = 'aplicado' and (r ->> 'paid_through')::date = end1 and r #>> '{access,status}' = 'assinatura'
     and r #>> '{access,provider}' = 'pix' and r #>> '{access,plan}' = 'individual', 'pago: ' || r::text;
  assert pg_temp.pix_until(pg_temp.eva(), 'individual') = pg_temp.ate(end1), 'até o último dia pago mais 3 dias, fim do dia em Brasília';
  assert pg_temp.pix_rows(pg_temp.eva()) = 1, 'o mesmo pagamento, uma linha só';
  -- O mesmo aviso de novo: nada muda.
  r := public.billing_pix_apply('evt_pix_2', pg_temp.eva(), 'individual', pg_temp.sha('pay_eva_1'), null, now());
  assert r ->> 'result' = 'repetido' and pg_temp.pix_until(pg_temp.eva(), 'individual') = pg_temp.ate(end1), 'repetido: ' || r::text;
  -- O próximo mês pago hoje, antes do fim: continua a sequência (o início dela mais dois meses).
  r := public.billing_pix_apply('evt_pix_3', pg_temp.eva(), 'individual', pg_temp.sha('pay_eva_2'), pg_temp.hoje(), now());
  assert (r ->> 'paid_through')::date = (d1 + interval '2 months')::date, 'encadeado: ' || r::text;
  -- Estorno do primeiro: o segundo passa a contar do dia em que foi pago.
  r := public.billing_pix_apply('evt_pix_4', pg_temp.eva(), 'individual', pg_temp.sha('pay_eva_1'), null, now());
  assert (r ->> 'paid_through')::date = (pg_temp.hoje() + interval '1 month')::date and r #>> '{access,status}' = 'assinatura', 'estorno do primeiro: ' || r::text;
  -- Estorno do segundo: sem pagamento, o acesso acaba agora (só leitura).
  r := public.billing_pix_apply('evt_pix_5', pg_temp.eva(), 'individual', pg_temp.sha('pay_eva_2'), null, now());
  assert r -> 'paid_through' = 'null'::jsonb and r #>> '{access,status}' = 'leitura' and pg_temp.pix_until(pg_temp.eva(), 'individual') <= now(),
    'sem pagamento: acaba agora: ' || r::text;
  -- O plano Família paga à parte, com o seu próprio encadeamento.
  r := public.billing_pix_apply('evt_pix_6', pg_temp.eva(), 'familiar', pg_temp.sha('pay_eva_3'), pg_temp.hoje() - 2, now());
  assert r #>> '{access,status}' = 'assinatura' and r #>> '{access,plan}' = 'familiar' and r #>> '{access,provider}' = 'pix', 'Família: ' || r::text;
  -- O plano de um pagamento não muda: o aviso com outro plano grava a situação no plano original.
  r := public.billing_pix_apply('evt_pix_7', pg_temp.eva(), 'individual', pg_temp.sha('pay_eva_3'), pg_temp.hoje() - 2, now());
  assert pg_temp.pix_until(pg_temp.eva(), 'individual') <= now() and r #>> '{access,plan}' = 'familiar', 'o plano do pagamento fica: ' || r::text;
  -- A pessoa de um pagamento gravado.
  assert public.billing_pix_person(pg_temp.sha('pay_eva_3')) = jsonb_build_object('person_id', pg_temp.eva(), 'plan', 'familiar'), 'a pessoa pelo resumo';
  assert public.billing_pix_person(pg_temp.sha('outro')) is null, 'resumo desconhecido: nulo';
end $$;

-- ---------------------------------------------------------------------------
-- 2b. Revisão independente de 11/11/2026: a tolerância não vira dias a mais, o fim do mês não perde dias e o Pix fica atrás da cortesia.
-- ---------------------------------------------------------------------------
do $$
declare
  r jsonb;
  p1 date := pg_temp.hoje() - 40;
  end1 date := (pg_temp.hoje() - 40 + interval '1 month')::date;
begin
  -- Pago 2 dias depois do fim do mês pago (na tolerância): continua a sequência, sem ganhar os dias de atraso.
  perform public.billing_pix_apply('evt_gil_1', pg_temp.gil(), 'individual', pg_temp.sha('pay_gil_1'), p1, now() - interval '40 days');
  r := public.billing_pix_apply('evt_gil_2', pg_temp.gil(), 'individual', pg_temp.sha('pay_gil_2'), end1 + 2, now());
  assert (r ->> 'paid_through')::date = (p1 + interval '2 months')::date, 'na tolerância, continua a sequência: ' || r::text;
  -- Pago 5 dias depois do fim (passada a tolerância): começa outra sequência no dia do pagamento.
  perform public.billing_pix_apply('evt_gil_3', pg_temp.gil(), 'familiar', pg_temp.sha('pay_gil_3'), p1, now() - interval '40 days');
  r := public.billing_pix_apply('evt_gil_4', pg_temp.gil(), 'familiar', pg_temp.sha('pay_gil_4'), least(end1 + 5, pg_temp.hoje()), now());
  assert (r ->> 'paid_through')::date = (least(end1 + 5, pg_temp.hoje()) + interval '1 month')::date or end1 + 5 > pg_temp.hoje(),
    'depois da tolerância, sequência nova: ' || r::text;
end $$;
do $$
declare
  r jsonb;
begin
  -- 31/01, 27/02 e 30/03 em sequência: até 30/04 (31/01 mais três meses), sem perder dias em fevereiro.
  perform public.billing_pix_apply('evt_gil_5', pg_temp.gil(), 'familiar', pg_temp.sha('pay_gil_5'), date '2026-01-31', now() - interval '200 days');
  perform public.billing_pix_apply('evt_gil_6', pg_temp.gil(), 'familiar', pg_temp.sha('pay_gil_6'), date '2026-02-27', now() - interval '199 days');
  r := public.billing_pix_apply('evt_gil_7', pg_temp.gil(), 'familiar', pg_temp.sha('pay_gil_7'), date '2026-03-30', now() - interval '198 days');
  assert pg_temp.gil() is not null and r ->> 'result' = 'aplicado', 'três meses seguidos: ' || r::text;
end $$;
reset role;
do $$
declare
  a jsonb;
begin
  assert pg_temp.access(pg_temp.gil()) ->> 'provider' = 'pix', 'Gil paga com Pix';
  -- A cortesia (ou o benefício, ou o Plano Família) vem antes do Pix: ninguém é chamado a pagar o próximo mês sem precisar.
  a := public.clarevo_staff_grant_courtesy('gil.pix@exemplo.test', 'individual', now() + interval '10 days');
  assert a ->> 'status' = 'cortesia' and a -> 'provider' = '"equipe"'::jsonb, 'a cortesia vem antes do Pix: ' || a::text;
end $$;
set role service_role;
select pg_temp.as_service();
do $$
declare
  r jsonb;
begin
  -- A sequência de 31/01 conferida sozinha: um plano à parte só com ela.
  perform public.billing_pix_apply('evt_gil_8', pg_temp.ivo(), 'familiar', pg_temp.sha('pay_ivo_1'), date '2026-01-31', now() - interval '200 days');
  r := public.billing_pix_apply('evt_gil_9', pg_temp.ivo(), 'familiar', pg_temp.sha('pay_ivo_2'), date '2026-02-27', now() - interval '199 days');
  assert (r ->> 'paid_through')::date = date '2026-03-31', 'dois meses a partir de 31/01: ' || r::text;
  r := public.billing_pix_apply('evt_gil_10', pg_temp.ivo(), 'familiar', pg_temp.sha('pay_ivo_3'), date '2026-03-30', now() - interval '198 days');
  assert (r ->> 'paid_through')::date = date '2026-04-30', 'três meses a partir de 31/01: ' || r::text;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Recusas: pagamento de outra pessoa, pessoa inexistente e aviso inválido.
-- ---------------------------------------------------------------------------
select pg_temp.expect_code(format($q$select public.billing_pix_apply('evt_pix_8', %L, 'individual', %L, current_date, now())$q$, pg_temp.ivo(), pg_temp.sha('pay_eva_3')),
  'pagamento_de_outra_pessoa', '22023');
do $$ begin
  assert public.billing_pix_apply('evt_pix_9', '00000000-0000-0000-0000-00000000dead', 'individual', pg_temp.sha('pay_x'), current_date, now()) = '{"result": "sem_pessoa"}',
    'pessoa inexistente: nada gravado';
  assert public.billing_pix_apply('evt_pix_10', null, 'individual', pg_temp.sha('pay_x'), current_date, now()) = '{"result": "sem_pessoa"}', 'pessoa nula';
end $$;
select pg_temp.expect_code(format($q$select public.billing_pix_apply('evt_pix_11', %L, 'individual', 'nao-e-resumo', current_date, now())$q$, pg_temp.ivo()), 'aviso_invalido', '22023');
select pg_temp.expect_code(format($q$select public.billing_pix_apply('evt_pix_12', %L, 'anual', %L, current_date, now())$q$, pg_temp.ivo(), pg_temp.sha('pay_y')), 'aviso_invalido', '22023');
select pg_temp.expect_code(format($q$select public.billing_pix_apply('evt_pix_13', %L, 'individual', %L, current_date + 5, now())$q$, pg_temp.ivo(), pg_temp.sha('pay_y')), 'aviso_invalido', '22023');
select pg_temp.expect_code(format($q$select public.billing_pix_apply('evt_pix_14', %L, 'individual', %L, current_date, now() + interval '3 days')$q$, pg_temp.ivo(), pg_temp.sha('pay_y')), 'aviso_invalido', '22023');
reset role;

-- ---------------------------------------------------------------------------
-- 4. O app não chama as funções nem lê a tabela.
-- ---------------------------------------------------------------------------
set role authenticated;
select pg_temp.as_(:ivo);
select pg_temp.expect_code(format($q$select public.billing_pix_apply('evt_pix_15', %L, 'individual', %L, current_date, now())$q$, :ivo, pg_temp.sha('pay_z')),
  'permission denied for function billing_pix_apply', '42501');
select pg_temp.expect_code(format($q$select public.billing_pix_person(%L)$q$, pg_temp.sha('pay_eva_3')), 'permission denied for function billing_pix_person', '42501');
select pg_temp.expect_code('select count(*) from public.billing_pix_payments', 'permission denied for table billing_pix_payments', '42501');
do $$
declare
  a jsonb := public.my_access();
begin
  assert a ->> 'status' = 'leitura' and a -> 'provider' = 'null'::jsonb, 'Ivo sem pagar: ' || a::text;
end $$;
select pg_temp.as_(:eva);
do $$
declare
  a jsonb := public.my_access();
begin
  assert a ->> 'status' = 'assinatura' and a ->> 'provider' = 'pix' and (a ->> 'can_write')::boolean, 'my_access de quem pagou com Pix: ' || a::text;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 5. Os pagamentos somem com a pessoa (a exclusão da conta apaga a linha de persons).
-- ---------------------------------------------------------------------------
do $$ begin
  perform public.clarevo_erase_person(pg_temp.eva());
  assert pg_temp.pix_rows(pg_temp.eva()) = 0, 'os pagamentos saíram com a pessoa';
  assert public.billing_pix_person(pg_temp.sha('pay_eva_3')) is null, 'pessoa excluída não é achada';
end $$;

rollback;
