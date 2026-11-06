-- Assinatura na web pelo Asaas (D-084; migração 0026): o acesso diz de onde vem o direito (provider), e o Checkout do Asaas fica ligado à
-- pessoa só pelas funções da chave de serviço (billing_checkout_record e billing_checkout_person), com o resumo do identificador.
-- Pessoa FICTÍCIA: Dora. Tudo em uma transação desfeita no fim.
\set ON_ERROR_STOP 1
\set dora '''00000000-0000-0000-0000-0000000000d1'''

begin;
set local clarevo.today = '2026-11-06';

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
create function pg_temp.dora() returns uuid language sql as $$ select '00000000-0000-0000-0000-0000000000d1'::uuid $$;
create function pg_temp.sha(p_text text) returns text language sql as $$ select encode(sha256(convert_to(p_text, 'UTF8')), 'hex') $$;
create function pg_temp.access(p_id uuid) returns jsonb language sql security definer set search_path = public, pg_temp as $$
  select public.clarevo_access(p_id)
$$;
create function pg_temp.checkouts(p_id uuid) returns bigint language sql security definer set search_path = public, pg_temp as $$
  select count(*) from public.billing_checkouts where person_id = p_id
$$;
create function pg_temp.age_checkout(p_hash text, p_days int) returns void language sql security definer set search_path = public, pg_temp as $$
  update public.billing_checkouts set created_at = now() - make_interval(days => p_days) where checkout_hash = p_hash
$$;

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  (:dora, 'dora.assinatura.web@exemplo.test', now(), '{"display_name":"Dora"}');
set role authenticated;
select pg_temp.as_(:dora);
select public.ensure_personal_space('Conta principal');
reset role;

-- ---------------------------------------------------------------------------
-- 1. Privilégios: só a chave de serviço usa as funções do Checkout; ninguém lê a tabela direto; my_access continua do app.
-- ---------------------------------------------------------------------------
do $$ begin
  assert has_function_privilege('service_role', 'public.billing_checkout_record(text, uuid, text)', 'execute')
     and not has_function_privilege('authenticated', 'public.billing_checkout_record(text, uuid, text)', 'execute')
     and not has_function_privilege('anon', 'public.billing_checkout_record(text, uuid, text)', 'execute'),
    'billing_checkout_record só com a chave de serviço';
  assert has_function_privilege('service_role', 'public.billing_checkout_person(text)', 'execute')
     and not has_function_privilege('authenticated', 'public.billing_checkout_person(text)', 'execute')
     and not has_function_privilege('anon', 'public.billing_checkout_person(text)', 'execute'),
    'billing_checkout_person só com a chave de serviço';
  assert not has_table_privilege('authenticated', 'public.billing_checkouts', 'select')
     and not has_table_privilege('anon', 'public.billing_checkouts', 'select')
     and not has_table_privilege('service_role', 'public.billing_checkouts', 'select'),
    'ninguém lê billing_checkouts direto';
  assert has_function_privilege('authenticated', 'public.my_access()', 'execute'), 'my_access continua do app';
end $$;

-- ---------------------------------------------------------------------------
-- 2. O acesso diz de onde vem o direito: nulo antes do início da cobrança, no teste e em só leitura; 'web' na assinatura da web.
-- ---------------------------------------------------------------------------
do $$
declare
  a jsonb;
begin
  a := pg_temp.access(pg_temp.dora());
  assert a ->> 'status' = 'pre_lancamento' and a ? 'provider' and a -> 'provider' = 'null'::jsonb, 'antes do início: provider nulo: ' || a::text;
  perform public.clarevo_staff_set_billing_start(now() - interval '20 days');
  update public.persons set created_at = now() - interval '30 days' where id = pg_temp.dora();
  a := pg_temp.access(pg_temp.dora());
  assert a ->> 'status' = 'leitura' and a -> 'provider' = 'null'::jsonb, 'só leitura: provider nulo: ' || a::text;
end $$;
set role service_role;
select pg_temp.as_service();
do $$
declare
  r jsonb;
begin
  r := public.billing_apply('evt_web_dora_1', 'web', pg_temp.dora(), pg_temp.sha('sub_dora'), 'familiar', now() + interval '33 days', now() - interval '1 minute');
  assert r ->> 'result' = 'aplicado' and r #>> '{access,status}' = 'assinatura' and r #>> '{access,provider}' = 'web'
     and r #>> '{access,plan}' = 'familiar', 'assinatura da web: ' || r::text;
end $$;
reset role;
set role authenticated;
select pg_temp.as_(:dora);
do $$
declare
  a jsonb := public.my_access();
begin
  assert a ->> 'status' = 'assinatura' and a ->> 'provider' = 'web' and (a ->> 'can_write')::boolean, 'my_access com provider: ' || a::text;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 3. O Checkout ligado à pessoa: gravar, ler, repetir, pessoa inexistente, resumo inválido e limpeza das ligações antigas.
-- ---------------------------------------------------------------------------
set role service_role;
select pg_temp.as_service();
do $$
declare
  r jsonb;
begin
  r := public.billing_checkout_record(pg_temp.sha('checkout-1'), pg_temp.dora(), 'individual');
  assert r = '{"result": "gravado"}', 'gravou: ' || r::text;
  assert public.billing_checkout_person(pg_temp.sha('checkout-1')) = jsonb_build_object('person_id', pg_temp.dora(), 'plan', 'individual'), 'leu a pessoa e o plano';
  -- Gravar de novo o mesmo Checkout atualiza o plano, sem duplicar.
  r := public.billing_checkout_record(pg_temp.sha('checkout-1'), pg_temp.dora(), 'familiar');
  assert r = '{"result": "gravado"}' and (public.billing_checkout_person(pg_temp.sha('checkout-1')) ->> 'plan') = 'familiar', 'atualizou o plano';
  assert public.billing_checkout_person(pg_temp.sha('checkout-desconhecido')) is null, 'Checkout desconhecido: nulo';
  assert public.billing_checkout_record(pg_temp.sha('checkout-2'), '00000000-0000-0000-0000-00000000dead', 'individual') = '{"result": "sem_pessoa"}',
    'pessoa que não existe: nada gravado';
  assert pg_temp.checkouts(pg_temp.dora()) = 1, 'uma ligação da Dora';
end $$;
select pg_temp.expect_code(format($q$select public.billing_checkout_record('nao-e-resumo', %L, 'individual')$q$, :dora), 'checkout_invalido', '22023');
select pg_temp.expect_code(format($q$select public.billing_checkout_record(%L, %L, 'mensal')$q$, pg_temp.sha('checkout-3'), :dora), 'checkout_invalido', '22023');
reset role;
-- Ligação com mais de 90 dias sai na próxima gravação.
select pg_temp.age_checkout(pg_temp.sha('checkout-1'), 91);
set role service_role;
select pg_temp.as_service();
do $$ begin
  perform public.billing_checkout_record(pg_temp.sha('checkout-4'), pg_temp.dora(), 'individual');
  assert public.billing_checkout_person(pg_temp.sha('checkout-1')) is null and pg_temp.checkouts(pg_temp.dora()) = 1, 'a ligação antiga saiu';
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 4. O app não chama as funções do Checkout nem lê a tabela.
-- ---------------------------------------------------------------------------
set role authenticated;
select pg_temp.as_(:dora);
select pg_temp.expect_code(format($q$select public.billing_checkout_record(%L, %L, 'individual')$q$, pg_temp.sha('checkout-5'), :dora), 'permission denied for function billing_checkout_record', '42501');
select pg_temp.expect_code(format($q$select public.billing_checkout_person(%L)$q$, pg_temp.sha('checkout-4')), 'permission denied for function billing_checkout_person', '42501');
select pg_temp.expect_code('select count(*) from public.billing_checkouts', 'permission denied for table billing_checkouts', '42501');
reset role;

-- ---------------------------------------------------------------------------
-- 5. A ligação some com a pessoa (a exclusão da conta apaga a linha de persons).
-- ---------------------------------------------------------------------------
do $$ begin
  perform public.clarevo_erase_person(pg_temp.dora());
  assert pg_temp.checkouts(pg_temp.dora()) = 0, 'a ligação saiu com a pessoa';
end $$;

rollback;
