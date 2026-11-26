-- Assinar na web durante o teste grátis (D-129; migração 0048): no cartão, a assinatura marcada para o fim do teste vai ao banco valendo só a
-- partir do dia da primeira cobrança (billing_apply com p_valid_from), e o acesso continua no teste até lá; cancelada antes, o acesso acaba
-- com o teste; com Pix, o pagamento feito no teste começa no fim do teste (billing_pix_payments.starts_on), e o feito depois do teste continua
-- como antes. A chamada antiga (sem p_valid_from) continua valendo. Pessoas FICTÍCIAS: Ana e Edu (cartão, no 3º dia do teste), Bia e Caio
-- (Pix mensal e anual, no 3º dia do teste) e Davi (Pix e cartão, depois do teste). Tudo em uma transação desfeita no fim.
\set ON_ERROR_STOP 1
\set ana '''00000000-0000-0000-0000-0000000000c1'''
\set bia '''00000000-0000-0000-0000-0000000000c2'''
\set caio '''00000000-0000-0000-0000-0000000000c3'''
\set davi '''00000000-0000-0000-0000-0000000000c4'''
\set edu '''00000000-0000-0000-0000-0000000000c5'''

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
create function pg_temp.ana() returns uuid language sql as $$ select '00000000-0000-0000-0000-0000000000c1'::uuid $$;
create function pg_temp.bia() returns uuid language sql as $$ select '00000000-0000-0000-0000-0000000000c2'::uuid $$;
create function pg_temp.caio() returns uuid language sql as $$ select '00000000-0000-0000-0000-0000000000c3'::uuid $$;
create function pg_temp.davi() returns uuid language sql as $$ select '00000000-0000-0000-0000-0000000000c4'::uuid $$;
create function pg_temp.edu() returns uuid language sql as $$ select '00000000-0000-0000-0000-0000000000c5'::uuid $$;
create function pg_temp.sha(p_text text) returns text language sql as $$ select encode(sha256(convert_to(p_text, 'UTF8')), 'hex') $$;
create function pg_temp.hoje() returns date language sql as $$ select (now() at time zone 'America/Sao_Paulo')::date $$;
-- O fim do acesso esperado para o último dia pago com Pix: mais 3 dias de tolerância, até o fim do dia em Brasília.
create function pg_temp.ate(p_paid_through date) returns timestamptz language sql as $$
  select ((p_paid_through + 4)::timestamp at time zone 'America/Sao_Paulo') - interval '1 millisecond'
$$;
-- O começo e o fim de um dia em Brasília (os da função do servidor para a primeira cobrança marcada).
create function pg_temp.inicio(p_day date) returns timestamptz language sql as $$ select p_day::timestamp at time zone 'America/Sao_Paulo' $$;
create function pg_temp.fim(p_day date) returns timestamptz language sql as $$
  select ((p_day + 1)::timestamp at time zone 'America/Sao_Paulo') - interval '1 millisecond'
$$;
-- Leituras direto nas tabelas (sem a RLS), como o dono do banco.
create function pg_temp.access(p_id uuid) returns jsonb language sql security definer set search_path = public, pg_temp as $$
  select public.clarevo_access(p_id)
$$;
-- O dia (Brasília) do fim do teste da pessoa, pelo mesmo acesso de my_access.
create function pg_temp.fim_do_teste(p_id uuid) returns date language sql security definer set search_path = public, pg_temp as $$
  select ((public.clarevo_access(p_id) ->> 'until')::timestamptz at time zone 'America/Sao_Paulo')::date
$$;
create function pg_temp.starts_on(p_hash text) returns date language sql security definer set search_path = public, pg_temp as $$
  select b.starts_on from public.billing_pix_payments b where b.payment_hash = p_hash
$$;
create function pg_temp.valid_from(p_ref text) returns timestamptz language sql security definer set search_path = public, pg_temp as $$
  select e.valid_from from public.plan_entitlements e where e.provider = 'web' and e.external_ref = p_ref
$$;

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  (:ana, 'ana.teste@exemplo.test', now(), '{"display_name":"Ana"}'),
  (:bia, 'bia.teste@exemplo.test', now(), '{"display_name":"Bia"}'),
  (:caio, 'caio.teste@exemplo.test', now(), '{"display_name":"Caio"}'),
  (:davi, 'davi.teste@exemplo.test', now(), '{"display_name":"Davi"}'),
  (:edu, 'edu.teste@exemplo.test', now(), '{"display_name":"Edu"}');
set role authenticated;
do $$
declare
  p uuid;
begin
  foreach p in array array[pg_temp.ana(), pg_temp.bia(), pg_temp.caio(), pg_temp.davi(), pg_temp.edu()] loop
    perform pg_temp.as_(p);
    perform public.ensure_personal_space('Conta principal');
  end loop;
end $$;
reset role;

-- A cobrança começou há 20 dias. Ana, Bia, Caio e Edu criaram a conta há 2 dias (estão no 3º dia do teste, que acaba daqui a 12 dias);
-- Davi, há 60 dias (o teste dele já acabou: só ver e exportar).
select public.clarevo_staff_set_billing_start(now() - interval '20 days');
update public.persons set created_at = now() - interval '2 days' where id in (:ana, :bia, :caio, :edu);
update public.persons set created_at = now() - interval '60 days' where id = :davi;

-- ---------------------------------------------------------------------------
-- 1. O esquema: starts_on, a assinatura nova de billing_apply (a antiga saiu), os privilégios e nada novo para o app.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  assert (select data_type from information_schema.columns where table_schema = 'public' and table_name = 'billing_pix_payments' and column_name = 'starts_on') = 'date'
     and (select is_nullable from information_schema.columns where table_schema = 'public' and table_name = 'billing_pix_payments' and column_name = 'starts_on') = 'YES',
    'starts_on: dia, opcional';
  assert not exists (select 1 from public.billing_pix_payments where starts_on is not null), 'nenhum pagamento de antes ganha starts_on';
  assert to_regprocedure('public.billing_apply(text, text, uuid, text, text, timestamptz, timestamptz, text)') is null,
    'a assinatura antiga de billing_apply saiu (a chamada por nome não fica ambígua)';
  foreach t in array array['billing_apply(text, text, uuid, text, text, timestamptz, timestamptz, text, timestamptz)',
                           'billing_pix_apply(text, uuid, text, text, date, timestamptz, text)'] loop
    assert has_function_privilege('service_role', 'public.' || t, 'execute') and not has_function_privilege('authenticated', 'public.' || t, 'execute')
       and not has_function_privilege('anon', 'public.' || t, 'execute'), 'só a chave de serviço executa ' || t;
    assert (select prosecdef from pg_proc where oid = ('public.' || t)::regprocedure), t || ' é security definer';
  end loop;
  assert (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and has_function_privilege('authenticated', p.oid, 'execute')) = 130,
    'nenhuma função nova para o app (130)';
  assert (select count(*) from pg_constraint c, regexp_matches(pg_get_constraintdef(c.oid), '''([a-z_]+)''::text', 'g') m
           where c.conname = 'record_operations_action_check') = 105, 'nenhuma ação nova em record_operations (105)';
  assert pg_temp.access(pg_temp.ana()) ->> 'status' = 'teste' and pg_temp.fim_do_teste(pg_temp.ana()) = ((now() + interval '12 days') at time zone 'America/Sao_Paulo')::date,
    'Ana no teste, que acaba daqui a 12 dias: ' || pg_temp.access(pg_temp.ana())::text;
  assert pg_temp.access(pg_temp.davi()) ->> 'status' = 'leitura', 'Davi depois do teste';
end $$;

-- ---------------------------------------------------------------------------
-- 2. Cartão: a assinatura marcada para o fim do teste. O acesso continua no teste; no dia da primeira cobrança, o direito começa (sem
--    buraco até a confirmação); paga, o período conta do fim do teste; cancelada antes, nada muda no teste.
-- ---------------------------------------------------------------------------
set role service_role;
select pg_temp.as_service();
do $$
declare
  r jsonb;
  d date := pg_temp.fim_do_teste(pg_temp.ana());
  until_teste text := pg_temp.access(pg_temp.ana()) ->> 'until';
begin
  -- Ana assina o Individual mensal no 3º dia do teste: o aviso da assinatura chega antes de haver cobrança paga, com a primeira cobrança no
  -- dia do fim do teste. O direito vai valendo do começo desse dia ao fim dele mais 3 dias, e o acesso continua no teste até lá.
  r := public.billing_apply('nt-evt-1', 'web', pg_temp.ana(), pg_temp.sha('sub_ana'), 'individual', pg_temp.fim(d + 3), now(), 'mensal', pg_temp.inicio(d));
  assert r ->> 'result' = 'aplicado' and r #>> '{access,status}' = 'teste' and r #>> '{access,until}' = until_teste and r #> '{access,provider}' = 'null'::jsonb,
    'assinou no teste: continua no teste, até o mesmo fim: ' || r::text;
  assert pg_temp.valid_from(pg_temp.sha('sub_ana')) = pg_temp.inicio(d), 'o direito começa no dia da primeira cobrança';
  -- Um aviso repetido da mesma assinatura, ainda sem cobrança paga: nada muda.
  r := public.billing_apply('nt-evt-2', 'web', pg_temp.ana(), pg_temp.sha('sub_ana'), 'individual', pg_temp.fim(d + 3), now(), 'mensal', pg_temp.inicio(d));
  assert r #>> '{access,status}' = 'teste' and (select count(*) from public.plan_entitlements e where e.person_id = pg_temp.ana()) = 1, 'a mesma linha, ainda no teste';
end $$;
reset role;
-- O dia da primeira cobrança chega (simulado: o começo do direito passa para um minuto atrás). Sem buraco: até a confirmação do cartão, o
-- direito da assinatura cobre a pessoa, mesmo depois do fim do teste.
update public.plan_entitlements set valid_from = now() - interval '1 minute' where provider = 'web' and external_ref = encode(sha256(convert_to('sub_ana', 'UTF8')), 'hex');
do $$ begin
  assert pg_temp.access(pg_temp.ana()) ->> 'status' = 'assinatura' and pg_temp.access(pg_temp.ana()) ->> 'provider' = 'web',
    'no dia da primeira cobrança, a assinatura vale: ' || pg_temp.access(pg_temp.ana())::text;
end $$;
set role service_role;
select pg_temp.as_service();
do $$
declare
  r jsonb;
  d date := pg_temp.hoje() + 12;
  inicio timestamptz := now() - interval '1 minute';
begin
  -- A primeira cobrança paga (vencimento no fim do teste): o período vai do fim do teste a um mês depois, mais a tolerância. Sem p_valid_from
  -- (a função do servidor só manda antes da primeira cobrança paga), o começo do direito fica como estava.
  r := public.billing_apply('nt-evt-3', 'web', pg_temp.ana(), pg_temp.sha('sub_ana'), 'individual', pg_temp.fim((d + interval '1 month')::date + 3), now());
  assert r #>> '{access,status}' = 'assinatura' and (r #>> '{access,until}')::timestamptz = pg_temp.fim((d + interval '1 month')::date + 3),
    'paga: um mês a partir do fim do teste: ' || r::text;
  assert pg_temp.valid_from(pg_temp.sha('sub_ana')) = inicio, 'o começo do direito não muda sem p_valid_from';

  -- Edu assina no 3º dia do teste e cancela antes da primeira cobrança: o aviso da assinatura removida, sem cobrança paga, encerra o direito
  -- na hora; nada foi cobrado, e o acesso continua no teste até o fim dele.
  r := public.billing_apply('nt-evt-4', 'web', pg_temp.edu(), pg_temp.sha('sub_edu'), 'familiar', pg_temp.fim(pg_temp.fim_do_teste(pg_temp.edu()) + 3), now() - interval '1 minute', 'anual',
                            pg_temp.inicio(pg_temp.fim_do_teste(pg_temp.edu())));
  assert r #>> '{access,status}' = 'teste', 'Edu assinou no teste: ' || r::text;
  r := public.billing_apply('nt-evt-5', 'web', pg_temp.edu(), pg_temp.sha('sub_edu'), 'familiar', now(), now(), 'anual');
  assert r #>> '{access,status}' = 'teste' and pg_temp.fim_do_teste(pg_temp.edu()) = pg_temp.hoje() + 12, 'cancelada antes da primeira cobrança: o teste continua: ' || r::text;

  -- Davi, depois do teste, assina no cartão: a chamada sem p_valid_from (a de antes, e a de quem assina fora do teste) vale do agora.
  r := public.billing_apply('nt-evt-6', 'web', pg_temp.davi(), pg_temp.sha('sub_davi'), 'individual', now() + interval '33 days', now());
  assert r #>> '{access,status}' = 'assinatura' and pg_temp.valid_from(pg_temp.sha('sub_davi')) = now(), 'fora do teste, como antes: ' || r::text;
end $$;
-- p_valid_from só na web, nunca depois do fim do direito nem a mais de 31 dias.
select pg_temp.expect_code(format($q$select public.billing_apply('nt-evt-7', 'apple', %L, %L, 'individual', now() + interval '40 days', now(), 'mensal', now() + interval '10 days')$q$,
  pg_temp.bia(), pg_temp.sha('revenuecat:bia')), 'aviso_invalido', '22023');
select pg_temp.expect_code(format($q$select public.billing_apply('nt-evt-8', 'web', %L, %L, 'individual', now() + interval '5 days', now(), 'mensal', now() + interval '10 days')$q$,
  pg_temp.bia(), pg_temp.sha('sub_bia')), 'aviso_invalido', '22023');
select pg_temp.expect_code(format($q$select public.billing_apply('nt-evt-9', 'web', %L, %L, 'individual', now() + interval '60 days', now(), 'mensal', now() + interval '32 days')$q$,
  pg_temp.bia(), pg_temp.sha('sub_bia')), 'aviso_invalido', '22023');

-- ---------------------------------------------------------------------------
-- 3. Pix: pago no 3º dia do teste, o período começa no fim do teste (um mês ou 12 meses depois dele); depois do teste, como antes.
-- ---------------------------------------------------------------------------
do $$
declare
  r jsonb;
  d date := pg_temp.fim_do_teste(pg_temp.bia());
begin
  -- Bia: o aviso da cobrança pendente grava o pagamento sem dia de começo; pago hoje, no teste, o período vai do fim do teste a um mês depois.
  r := public.billing_pix_apply('nt-pix-1', pg_temp.bia(), 'individual', pg_temp.sha('nt_pay_bia_1'), null, now() - interval '1 minute');
  assert r -> 'paid_through' = 'null'::jsonb and r #>> '{access,status}' = 'teste' and pg_temp.starts_on(pg_temp.sha('nt_pay_bia_1')) is null, 'pendente: ' || r::text;
  r := public.billing_pix_apply('nt-pix-2', pg_temp.bia(), 'individual', pg_temp.sha('nt_pay_bia_1'), pg_temp.hoje(), now());
  assert (r ->> 'paid_through')::date = (d + interval '1 month')::date and pg_temp.starts_on(pg_temp.sha('nt_pay_bia_1')) = d,
    'pago no teste: do fim do teste a um mês depois: ' || r::text;
  -- O direito vale desde já (a tela diz "Pago com Pix até ..."), até o fim do período mais a tolerância.
  assert r #>> '{access,status}' = 'assinatura' and r #>> '{access,provider}' = 'pix' and (r #>> '{access,until}')::timestamptz = pg_temp.ate((d + interval '1 month')::date),
    'o direito por Pix: ' || r::text;
  -- O estorno e uma nova confirmação mantêm o dia de começo (gravado uma vez).
  r := public.billing_pix_apply('nt-pix-3', pg_temp.bia(), 'individual', pg_temp.sha('nt_pay_bia_1'), null, now());
  assert r -> 'paid_through' = 'null'::jsonb and pg_temp.starts_on(pg_temp.sha('nt_pay_bia_1')) = d, 'estornado: sem período, o dia guardado: ' || r::text;
  assert r #>> '{access,status}' = 'teste', 'estornado no teste: volta ao teste: ' || r::text;
  r := public.billing_pix_apply('nt-pix-4', pg_temp.bia(), 'individual', pg_temp.sha('nt_pay_bia_1'), pg_temp.hoje(), now());
  assert (r ->> 'paid_through')::date = (d + interval '1 month')::date, 'confirmado de novo, o mesmo período: ' || r::text;

  -- Caio: um ano pago com Pix no 3º dia do teste: do fim do teste a 12 meses depois.
  r := public.billing_pix_apply('nt-pix-5', pg_temp.caio(), 'familiar', pg_temp.sha('nt_pay_caio_1'), pg_temp.hoje(), now(), 'anual');
  assert (r ->> 'paid_through')::date = (pg_temp.hoje() + 12 + interval '12 months')::date and r #>> '{access,period}' = 'anual',
    'um ano pago no teste: do fim do teste a 12 meses depois: ' || r::text;

  -- Davi, depois do teste: o mês conta do dia do pagamento, como antes (sem dia de começo).
  r := public.billing_pix_apply('nt-pix-6', pg_temp.davi(), 'familiar', pg_temp.sha('nt_pay_davi_1'), pg_temp.hoje(), now());
  assert (r ->> 'paid_through')::date = (pg_temp.hoje() + interval '1 month')::date and pg_temp.starts_on(pg_temp.sha('nt_pay_davi_1')) is null,
    'depois do teste, como antes: ' || r::text;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 4. O app: my_access de quem assinou no cartão durante o teste continua no teste (com o fim do teste); o app não chama as funções do servidor.
-- ---------------------------------------------------------------------------
set role authenticated;
select pg_temp.as_(:edu);
do $$
declare
  a jsonb := public.my_access();
begin
  assert a ->> 'status' = 'teste' and (a ->> 'can_write')::boolean and a -> 'provider' = 'null'::jsonb, 'my_access do Edu: ' || a::text;
end $$;
select pg_temp.expect_code(format($q$select public.billing_apply('nt-evt-10', 'web', %L, %L, 'individual', now() + interval '1 day', now(), 'mensal', now())$q$,
  :edu, pg_temp.sha('sub_edu_2')), 'permission denied for function billing_apply', '42501');
reset role;

rollback;
