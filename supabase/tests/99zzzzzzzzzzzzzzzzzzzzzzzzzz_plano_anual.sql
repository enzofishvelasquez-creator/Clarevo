-- Plano anual (D-125 e D-127; migração 0047): o período ('mensal' ou 'anual') nas três tabelas da cobrança, com 'mensal' como padrão;
-- billing_apply, billing_checkout_record e billing_pix_apply com p_period (padrão 'mensal', a chamada antiga continua valendo); as funções
-- que acham a pessoa devolvem o período; o Pix de um ano vale 12 meses na mesma sequência do mensal; e my_access diz o período da
-- assinatura em vigor (nulo nas outras situações). Nenhuma ação nova e nenhuma função nova para o app. Pessoas FICTÍCIAS: Lia (titular de
-- uma Família), Rui (membro da Família da Lia), Téo (paga com Pix) e Uma (sozinha). Tudo em uma transação desfeita no fim.
\set ON_ERROR_STOP 1
\set lia '''00000000-0000-0000-0000-0000000000b1'''
\set rui '''00000000-0000-0000-0000-0000000000b2'''
\set teo '''00000000-0000-0000-0000-0000000000b3'''
\set uma '''00000000-0000-0000-0000-0000000000b4'''

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
create function pg_temp.lia() returns uuid language sql as $$ select '00000000-0000-0000-0000-0000000000b1'::uuid $$;
create function pg_temp.rui() returns uuid language sql as $$ select '00000000-0000-0000-0000-0000000000b2'::uuid $$;
create function pg_temp.teo() returns uuid language sql as $$ select '00000000-0000-0000-0000-0000000000b3'::uuid $$;
create function pg_temp.uma() returns uuid language sql as $$ select '00000000-0000-0000-0000-0000000000b4'::uuid $$;
create function pg_temp.sha(p_text text) returns text language sql as $$ select encode(sha256(convert_to(p_text, 'UTF8')), 'hex') $$;
create function pg_temp.hoje() returns date language sql as $$ select (now() at time zone 'America/Sao_Paulo')::date $$;
-- O fim do acesso esperado para o último dia pago com Pix: mais 3 dias de tolerância, até o fim do dia em Brasília.
create function pg_temp.ate(p_paid_through date) returns timestamptz language sql as $$
  select ((p_paid_through + 4)::timestamp at time zone 'America/Sao_Paulo') - interval '1 millisecond'
$$;
-- Leituras direto nas tabelas (sem a RLS), como o dono do banco.
create function pg_temp.access(p_id uuid) returns jsonb language sql security definer set search_path = public, pg_temp as $$
  select public.clarevo_access(p_id)
$$;
create function pg_temp.entitlement_period(p_id uuid, p_provider text) returns text language sql security definer set search_path = public, pg_temp as $$
  select e.period from public.plan_entitlements e where e.person_id = p_id and e.provider = p_provider order by e.valid_until desc nulls first limit 1
$$;
create function pg_temp.pix_period(p_hash text) returns text language sql security definer set search_path = public, pg_temp as $$
  select b.period from public.billing_pix_payments b where b.payment_hash = p_hash
$$;

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  (:lia, 'lia.anual@exemplo.test', now(), '{"display_name":"Lia"}'),
  (:rui, 'rui.anual@exemplo.test', now(), '{"display_name":"Rui"}'),
  (:teo, 'teo.anual@exemplo.test', now(), '{"display_name":"Téo"}'),
  (:uma, 'uma.anual@exemplo.test', now(), '{"display_name":"Uma"}');
set role authenticated;
do $$
declare
  r jsonb;
  fam uuid;
begin
  perform pg_temp.as_(pg_temp.lia());
  perform public.ensure_personal_space('Conta principal');
  fam := (public.create_family('Família da Lia', 'pa-fam-0001') #>> '{context,id}')::uuid;
  r := public.create_family_invite(fam, 'membro', 'pa-inv-0001');
  perform pg_temp.as_(pg_temp.rui());
  perform public.ensure_personal_space('Conta principal');
  perform public.accept_family_invite(r ->> 'code', 'pa-acc-0001');
  perform pg_temp.as_(pg_temp.teo());
  perform public.ensure_personal_space('Conta principal');
  perform pg_temp.as_(pg_temp.uma());
  perform public.ensure_personal_space('Conta principal');
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 1. O esquema: o período nas três tabelas, com 'mensal' como padrão e só os dois valores; as assinaturas antigas saíram; privilégios.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['plan_entitlements', 'billing_checkouts', 'billing_pix_payments'] loop
    assert (select column_default from information_schema.columns where table_schema = 'public' and table_name = t and column_name = 'period')
             = '''mensal''::text'
       and (select is_nullable from information_schema.columns where table_schema = 'public' and table_name = t and column_name = 'period') = 'NO',
      'período com padrão mensal e obrigatório em ' || t;
    assert (select count(*) from pg_constraint where conname = t || '_period_check'
              and pg_get_constraintdef(oid) like '%mensal%' and pg_get_constraintdef(oid) like '%anual%') = 1,
      'a restrição do período em ' || t;
  end loop;
  -- O que já existia antes da 0047 é mensal (as linhas de cortesia e de benefício também).
  assert not exists (select 1 from public.plan_entitlements where period <> 'mensal'), 'nenhum direito anual antes dos avisos deste teste';
  -- As assinaturas antigas saíram; as novas existem.
  assert to_regprocedure('public.billing_apply(text, text, uuid, text, text, timestamptz, timestamptz)') is null
     and to_regprocedure('public.billing_checkout_record(text, uuid, text)') is null
     and to_regprocedure('public.billing_pix_apply(text, uuid, text, text, date, timestamptz)') is null,
    'as assinaturas antigas saíram (a chamada por nome não fica ambígua)';
  -- billing_apply ganhou p_valid_from na 0048 (D-129, assinar no teste grátis).
  foreach t in array array['billing_apply(text, text, uuid, text, text, timestamptz, timestamptz, text, timestamptz)', 'billing_checkout_record(text, uuid, text, text)',
                           'billing_pix_apply(text, uuid, text, text, date, timestamptz, text)', 'billing_checkout_person(text)',
                           'billing_person_by_external_ref(text, text)', 'billing_pix_person(text)'] loop
    assert has_function_privilege('service_role', 'public.' || t, 'execute') and not has_function_privilege('authenticated', 'public.' || t, 'execute')
       and not has_function_privilege('anon', 'public.' || t, 'execute'), 'só a chave de serviço executa ' || t;
    assert (select prosecdef from pg_proc where oid = ('public.' || t)::regprocedure), t || ' é security definer';
  end loop;
  assert not has_function_privilege('authenticated', 'public.clarevo_access(uuid)', 'execute')
     and not has_function_privilege('service_role', 'public.clarevo_access(uuid)', 'execute'), 'clarevo_access continua interna';
  assert has_function_privilege('authenticated', 'public.my_access()', 'execute') and not has_function_privilege('anon', 'public.my_access()', 'execute'),
    'my_access continua só do app';
  assert (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and has_function_privilege('authenticated', p.oid, 'execute')) = 130,
    'nenhuma função nova para o app (130)';
  assert (select count(*) from pg_constraint c, regexp_matches(pg_get_constraintdef(c.oid), '''([a-z_]+)''::text', 'g') m
           where c.conname = 'record_operations_action_check') = 105, 'nenhuma ação nova em record_operations (105)';
end $$;
select pg_temp.expect_code($q$insert into public.billing_checkouts (checkout_hash, person_id, plan, period)
  values (encode(sha256('x'::bytea), 'hex'), '00000000-0000-0000-0000-0000000000b4', 'individual', 'semestral')$q$,
  'new row for relation "billing_checkouts" violates check constraint "billing_checkouts_period_check"', '23514');

-- Antes do início da cobrança, o período vem nulo.
do $$ begin
  assert pg_temp.access(pg_temp.uma()) ->> 'status' = 'pre_lancamento' and pg_temp.access(pg_temp.uma()) -> 'period' = 'null'::jsonb,
    'antes do início, sem período: ' || pg_temp.access(pg_temp.uma())::text;
end $$;
-- A cobrança começou há 20 dias e as contas são de antes: sem pagar, só leitura.
select public.clarevo_staff_set_billing_start(now() - interval '20 days');
update public.persons set created_at = now() - interval '60 days' where id in (:lia, :rui, :teo, :uma);

-- ---------------------------------------------------------------------------
-- 2. billing_apply: a loja ou o cartão anual, a troca entre mensal e anual na mesma linha e a chamada antiga, sem o período (mensal).
-- ---------------------------------------------------------------------------
set role service_role;
select pg_temp.as_service();
do $$
declare
  r jsonb;
begin
  assert pg_temp.access(pg_temp.uma()) ->> 'status' = 'leitura' and pg_temp.access(pg_temp.uma()) -> 'period' = 'null'::jsonb, 'só leitura, sem período';
  -- A Lia assina o Família anual na App Store: um ano de acesso, com o período anual.
  r := public.billing_apply('pa-evt-1', 'apple', pg_temp.lia(), pg_temp.sha('revenuecat:lia'), 'familiar', now() + interval '365 days', now() - interval '1 minute', 'anual');
  assert r ->> 'result' = 'aplicado' and r #>> '{access,status}' = 'assinatura' and r #>> '{access,plan}' = 'familiar'
     and r #>> '{access,provider}' = 'apple' and r #>> '{access,period}' = 'anual', 'Família anual: ' || r::text;
  assert pg_temp.entitlement_period(pg_temp.lia(), 'apple') = 'anual', 'o período gravado no direito';
  -- O Rui, da Família da Lia, fica coberto pelo Família anual da titular: a situação é Plano Família, sem período (não é a assinatura dele).
  assert pg_temp.access(pg_temp.rui()) ->> 'status' = 'familia' and pg_temp.access(pg_temp.rui()) -> 'period' = 'null'::jsonb,
    'membro coberto pelo Família anual: ' || pg_temp.access(pg_temp.rui())::text;
  -- A troca para o mensal (na renovação) atualiza a mesma linha; a chamada sem o período grava mensal.
  r := public.billing_apply('pa-evt-2', 'apple', pg_temp.lia(), pg_temp.sha('revenuecat:lia'), 'familiar', now() + interval '30 days', now());
  assert r ->> 'result' = 'aplicado' and r #>> '{access,period}' = 'mensal', 'de volta ao mensal: ' || r::text;
  assert (select count(*) from public.plan_entitlements e where e.person_id = pg_temp.lia() and e.provider = 'apple') = 1, 'a mesma linha';
  -- Aviso mais antigo que o último aplicado não muda nada (nem o período).
  r := public.billing_apply('pa-evt-3', 'apple', pg_temp.lia(), pg_temp.sha('revenuecat:lia'), 'familiar', now() + interval '365 days', now() - interval '1 hour', 'anual');
  assert r ->> 'result' = 'antigo' and r #>> '{access,period}' = 'mensal', 'aviso antigo não muda o período: ' || r::text;
  -- A Uma assina o Individual anual na web (cartão, ciclo anual): o período anual.
  r := public.billing_apply('pa-evt-4', 'web', pg_temp.uma(), pg_temp.sha('sub_uma'), 'individual', now() + interval '368 days', now(), 'anual');
  assert r #>> '{access,status}' = 'assinatura' and r #>> '{access,provider}' = 'web' and r #>> '{access,period}' = 'anual', 'cartão anual: ' || r::text;
  -- A pessoa de uma assinatura já aplicada vem com o período.
  assert public.billing_person_by_external_ref('web', pg_temp.sha('sub_uma')) = jsonb_build_object('person_id', pg_temp.uma(), 'plan', 'individual', 'period', 'anual'),
    'a pessoa pelo resumo, com o período';
end $$;
select pg_temp.expect_code(format($q$select public.billing_apply('pa-evt-5', 'apple', %L, %L, 'individual', now() + interval '1 day', now(), 'semestral')$q$,
  pg_temp.uma(), pg_temp.sha('revenuecat:uma')), 'aviso_invalido', '22023');
select pg_temp.expect_code(format($q$select public.billing_apply('pa-evt-6', 'apple', %L, %L, 'individual', now() + interval '1 day', now(), null)$q$,
  pg_temp.uma(), pg_temp.sha('revenuecat:uma')), 'aviso_invalido', '22023');

-- ---------------------------------------------------------------------------
-- 3. O Checkout com o período.
-- ---------------------------------------------------------------------------
do $$
declare
  r jsonb;
begin
  r := public.billing_checkout_record(pg_temp.sha('pa-checkout-1'), pg_temp.teo(), 'individual', 'anual');
  assert r = '{"result": "gravado"}', 'Checkout anual gravado: ' || r::text;
  assert public.billing_checkout_person(pg_temp.sha('pa-checkout-1')) = jsonb_build_object('person_id', pg_temp.teo(), 'plan', 'individual', 'period', 'anual'),
    'o Checkout anual com o período';
  -- Sem o período (a função do servidor de antes): mensal.
  perform public.billing_checkout_record(pg_temp.sha('pa-checkout-2'), pg_temp.teo(), 'familiar');
  assert public.billing_checkout_person(pg_temp.sha('pa-checkout-2')) ->> 'period' = 'mensal', 'sem o período: mensal';
end $$;
select pg_temp.expect_code(format($q$select public.billing_checkout_record(%L, %L, 'individual', 'trimestral')$q$, pg_temp.sha('pa-checkout-3'), pg_temp.teo()),
  'checkout_invalido', '22023');

-- ---------------------------------------------------------------------------
-- 4. Pix de um ano: vale 12 meses; o mensal seguinte continua a sequência; o estorno reconta; o período de um pagamento não muda.
-- ---------------------------------------------------------------------------
do $$
declare
  r jsonb;
  d1 date := pg_temp.hoje() - 5;
  end_year date := (pg_temp.hoje() - 5 + interval '12 months')::date;
begin
  -- Pendente: grava a linha com o período, sem acesso.
  r := public.billing_pix_apply('pa-pix-1', pg_temp.teo(), 'individual', pg_temp.sha('pa_pay_teo_1'), null, now() - interval '6 days', 'anual');
  assert r ->> 'result' = 'aplicado' and r -> 'paid_through' = 'null'::jsonb and r #>> '{access,status}' = 'leitura', 'pendente: ' || r::text;
  assert pg_temp.pix_period(pg_temp.sha('pa_pay_teo_1')) = 'anual', 'o pagamento guarda o período';
  -- Pago há 5 dias: 12 meses a partir do pagamento, com a tolerância; o direito diz anual.
  r := public.billing_pix_apply('pa-pix-2', pg_temp.teo(), 'individual', pg_temp.sha('pa_pay_teo_1'), d1, now() - interval '5 days', 'anual');
  assert (r ->> 'paid_through')::date = end_year and r #>> '{access,status}' = 'assinatura' and r #>> '{access,provider}' = 'pix'
     and r #>> '{access,period}' = 'anual', 'um ano pago: ' || r::text;
  assert (r #>> '{access,until}')::timestamptz = pg_temp.ate(end_year), 'até o último dia pago mais 3 dias, fim do dia em Brasília';
  -- O aviso seguinte do mesmo pagamento, sem o período (a função de antes), não o muda: continua anual.
  r := public.billing_pix_apply('pa-pix-3', pg_temp.teo(), 'individual', pg_temp.sha('pa_pay_teo_1'), d1, now() - interval '4 days');
  assert pg_temp.pix_period(pg_temp.sha('pa_pay_teo_1')) = 'anual' and (r ->> 'paid_through')::date = end_year, 'o período do pagamento não muda: ' || r::text;
  assert public.billing_pix_person(pg_temp.sha('pa_pay_teo_1')) = jsonb_build_object('person_id', pg_temp.teo(), 'plan', 'individual', 'period', 'anual'),
    'a pessoa do pagamento, com o período';
  -- Um mês pago hoje, dentro do ano pago: continua a sequência (o início dela mais 13 meses), e o direito passa a dizer mensal (o último).
  r := public.billing_pix_apply('pa-pix-4', pg_temp.teo(), 'individual', pg_temp.sha('pa_pay_teo_2'), pg_temp.hoje(), now());
  assert (r ->> 'paid_through')::date = (d1 + interval '13 months')::date and r #>> '{access,period}' = 'mensal', 'ano e mais um mês: ' || r::text;
  -- Estorno do ano: o mês passa a contar do dia em que foi pago.
  r := public.billing_pix_apply('pa-pix-5', pg_temp.teo(), 'individual', pg_temp.sha('pa_pay_teo_1'), null, now());
  assert (r ->> 'paid_through')::date = (pg_temp.hoje() + interval '1 month')::date and r #>> '{access,period}' = 'mensal', 'estorno do ano: ' || r::text;
  -- Estorno do mês: sem pagamento valendo, o acesso acaba agora (só leitura), sem período.
  r := public.billing_pix_apply('pa-pix-6', pg_temp.teo(), 'individual', pg_temp.sha('pa_pay_teo_2'), null, now());
  assert r -> 'paid_through' = 'null'::jsonb and r #>> '{access,status}' = 'leitura' and r #> '{access,period}' = 'null'::jsonb, 'sem pagamento: ' || r::text;
end $$;
do $$
declare
  r jsonb;
begin
  -- Datas fixas, no Individual da Lia (o acesso dela vem da App Store; aqui só a conta do período pago importa).
  -- 31/01 anual: até 31/01 do ano seguinte (31/01 mais 12 meses).
  r := public.billing_pix_apply('pa-pix-7', pg_temp.lia(), 'individual', pg_temp.sha('pa_pay_lia_1'), date '2026-01-31', now() - interval '300 days', 'anual');
  assert (r ->> 'paid_through')::date = date '2027-01-31', '31/01 mais um ano: ' || r::text;
  -- Um mês pago antes do fim: 31/01 mais 13 meses (28/02/2027, sem passar do fim do mês).
  r := public.billing_pix_apply('pa-pix-8', pg_temp.lia(), 'individual', pg_temp.sha('pa_pay_lia_2'), date '2026-02-27', now() - interval '299 days');
  assert (r ->> 'paid_through')::date = date '2027-02-28', 'um ano e um mês a partir de 31/01: ' || r::text;
  -- A situação da Lia continua a da App Store (a assinatura da loja vem antes do Pix).
  assert r #>> '{access,provider}' = 'apple' and r #>> '{access,period}' = 'mensal', 'a loja antes do Pix: ' || r::text;
end $$;
select pg_temp.expect_code(format($q$select public.billing_pix_apply('pa-pix-9', %L, 'individual', %L, current_date, now(), 'bienal')$q$, pg_temp.teo(), pg_temp.sha('pa_pay_x')),
  'aviso_invalido', '22023');
reset role;

-- ---------------------------------------------------------------------------
-- 5. O app: my_access com o período da própria assinatura; a cortesia e o benefício sem período; o app não chama as funções do servidor.
-- ---------------------------------------------------------------------------
do $$
declare
  a jsonb;
begin
  a := public.clarevo_staff_grant_courtesy('rui.anual@exemplo.test', 'individual', now() + interval '10 days');
  assert a ->> 'status' = 'cortesia' and a -> 'period' = 'null'::jsonb, 'cortesia sem período: ' || a::text;
end $$;
set role authenticated;
select pg_temp.as_(:uma);
do $$
declare
  a jsonb := public.my_access();
begin
  assert a ->> 'status' = 'assinatura' and a ->> 'period' = 'anual' and a ->> 'provider' = 'web' and (a ->> 'can_write')::boolean, 'my_access da Uma: ' || a::text;
end $$;
select pg_temp.as_(:teo);
do $$
declare
  a jsonb := public.my_access();
begin
  -- O ano e o mês pagos com Pix foram estornados: só leitura, sem período.
  assert a ->> 'status' = 'leitura' and a -> 'period' = 'null'::jsonb, 'my_access do Téo: ' || a::text;
end $$;
select pg_temp.expect_code(format($q$select public.billing_apply('pa-evt-7', 'apple', %L, %L, 'individual', now() + interval '1 day', now(), 'anual')$q$,
  :teo, pg_temp.sha('revenuecat:teo')), 'permission denied for function billing_apply', '42501');
select pg_temp.expect_code(format($q$select public.billing_checkout_record(%L, %L, 'individual', 'anual')$q$, pg_temp.sha('pa-checkout-4'), :teo),
  'permission denied for function billing_checkout_record', '42501');
select pg_temp.expect_code(format($q$select public.billing_pix_apply('pa-pix-10', %L, 'individual', %L, current_date, now(), 'anual')$q$, :teo, pg_temp.sha('pa_pay_y')),
  'permission denied for function billing_pix_apply', '42501');
reset role;

-- ---------------------------------------------------------------------------
-- 6. Tudo some com a pessoa (a exclusão da conta apaga a linha de persons): o direito anual, o Checkout e os pagamentos por Pix.
-- ---------------------------------------------------------------------------
do $$ begin
  perform public.clarevo_erase_person(pg_temp.teo());
  assert public.billing_pix_person(pg_temp.sha('pa_pay_teo_1')) is null and public.billing_checkout_person(pg_temp.sha('pa-checkout-1')) is null,
    'os pagamentos e o Checkout saíram com a pessoa';
  perform public.clarevo_erase_person(pg_temp.uma());
  assert public.billing_person_by_external_ref('web', pg_temp.sha('sub_uma')) is null, 'o direito anual saiu com a pessoa';
end $$;

rollback;
