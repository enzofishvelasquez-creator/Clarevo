-- Desistência em 7 dias pela web (D-131, item F; migração 0050): o registro do pedido (billing_withdrawals, com RLS e sem leitura de fora),
-- as compras que podem estar no prazo e o acesso que fica depois (calculado como o aviso de estorno faria, sem gravar nada), o pedido uma vez
-- por compra (nova, em andamento, retomar, concluída), a compra de outra pessoa recusada, o prazo do pedido novo (no Pix, pelo dia que o
-- banco guarda), o caminho do aviso de estorno do Asaas que tira o período pago (de volta ao teste, só ver e exportar ou o período pago
-- antes), a pessoa que fica anônima e nada novo para o app. Pessoas FICTÍCIAS: Ana (cartão mensal, depois do teste), Bia (Pix pago no teste),
-- Caio (dois meses com Pix, o segundo pago adiantado), Davi (compras antigas, fora do prazo), Edu (outra pessoa) e Gil (fica anônima). Tudo em
-- uma transação desfeita no fim (now() é o mesmo em todo o teste).
\set ON_ERROR_STOP 1
\set ana '''00000000-0000-0000-0000-0000000000d1'''
\set bia '''00000000-0000-0000-0000-0000000000d2'''
\set caio '''00000000-0000-0000-0000-0000000000d3'''
\set davi '''00000000-0000-0000-0000-0000000000d4'''
\set edu '''00000000-0000-0000-0000-0000000000d5'''
\set gil '''00000000-0000-0000-0000-0000000000d6'''

begin;

create function pg_temp.expect_code(p_sql text, p_code text, p_state text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if (p_code is null or sqlerrm = p_code) and sqlstate = p_state then return; end if;
    raise exception 'esperado % (%), veio "%" (%) em: %', p_code, p_state, sqlerrm, sqlstate, left(p_sql, 300);
  end;
  raise exception 'esperado erro %, mas passou: %', coalesce(p_code, p_state), left(p_sql, 300);
end $$;
create function pg_temp.as_(p_id uuid) returns text language sql as $$
  select set_config('request.jwt.claim.sub', p_id::text, true)
$$;
create function pg_temp.as_service() returns void language sql as $$
  select set_config('request.jwt.claim.sub', '', true);
  select set_config('request.jwt.claims', '{"role":"service_role"}', true);
$$;
create function pg_temp.ana() returns uuid language sql as $$ select '00000000-0000-0000-0000-0000000000d1'::uuid $$;
create function pg_temp.bia() returns uuid language sql as $$ select '00000000-0000-0000-0000-0000000000d2'::uuid $$;
create function pg_temp.caio() returns uuid language sql as $$ select '00000000-0000-0000-0000-0000000000d3'::uuid $$;
create function pg_temp.davi() returns uuid language sql as $$ select '00000000-0000-0000-0000-0000000000d4'::uuid $$;
create function pg_temp.edu() returns uuid language sql as $$ select '00000000-0000-0000-0000-0000000000d5'::uuid $$;
create function pg_temp.gil() returns uuid language sql as $$ select '00000000-0000-0000-0000-0000000000d6'::uuid $$;
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
-- O fim do teste, pela mesma conta de clarevo_access (o maior entre a criação da conta e o início da cobrança, mais 14 dias).
create function pg_temp.fim_do_teste(p_id uuid) returns timestamptz language sql security definer set search_path = public, pg_temp as $$
  select greatest(p.created_at, s.enforced_from) + interval '14 days' from public.persons p, public.billing_settings s where p.id = p_id and s.id
$$;
create function pg_temp.pedidos(p_id uuid) returns bigint language sql security definer set search_path = public, pg_temp as $$
  select count(*) from public.billing_withdrawals w where w.person_id = p_id
$$;
create function pg_temp.pedido(p_hash text) returns public.billing_withdrawals language sql security definer set search_path = public, pg_temp as $$
  select * from public.billing_withdrawals w where w.purchase_hash = p_hash
$$;
create function pg_temp.estado() returns text language sql security definer set search_path = public, pg_temp as $$
  select (select count(*) from public.billing_events)::text || '|' ||
         (select string_agg(e.external_ref || ':' || e.valid_until::text, ',' order by e.external_ref) from public.plan_entitlements e) || '|' ||
         (select string_agg(b.payment_hash || ':' || coalesce(b.paid_on::text, '-'), ',' order by b.payment_hash) from public.billing_pix_payments b)
$$;

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  (:ana, 'ana.desistencia@exemplo.test', now(), '{"display_name":"Ana"}'),
  (:bia, 'bia.desistencia@exemplo.test', now(), '{"display_name":"Bia"}'),
  (:caio, 'caio.desistencia@exemplo.test', now(), '{"display_name":"Caio"}'),
  (:davi, 'davi.desistencia@exemplo.test', now(), '{"display_name":"Davi"}'),
  (:edu, 'edu.desistencia@exemplo.test', now(), '{"display_name":"Edu"}'),
  (:gil, 'gil.desistencia@exemplo.test', now(), '{"display_name":"Gil"}');
set role authenticated;
do $$
declare
  p uuid;
begin
  foreach p in array array[pg_temp.ana(), pg_temp.bia(), pg_temp.caio(), pg_temp.davi(), pg_temp.edu(), pg_temp.gil()] loop
    perform pg_temp.as_(p);
    perform public.ensure_personal_space('Conta principal');
  end loop;
end $$;
reset role;

-- A cobrança começou há 60 dias. Bia criou a conta há 2 dias (está no teste, que acaba daqui a 12 dias); os outros, há 40 dias (o teste deles
-- acabou há 26 dias).
select public.clarevo_staff_set_billing_start(now() - interval '60 days');
update public.persons set created_at = now() - interval '40 days' where id in (:ana, :caio, :davi, :edu, :gil);
update public.persons set created_at = now() - interval '2 days' where id = :bia;

-- ---------------------------------------------------------------------------
-- 1. O esquema: a tabela com RLS e sem privilégio de fora, as funções só da chave de serviço, a interna de ninguém, nada novo para o app.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  assert (select relrowsecurity from pg_class where oid = 'public.billing_withdrawals'::regclass), 'RLS ligada em billing_withdrawals';
  assert not exists (select 1 from pg_policies where tablename = 'billing_withdrawals'), 'nenhuma política: ninguém lê pela API';
  foreach t in array array['anon', 'authenticated', 'service_role'] loop
    assert not has_table_privilege(t, 'public.billing_withdrawals', 'select') and not has_table_privilege(t, 'public.billing_withdrawals', 'insert')
       and not has_table_privilege(t, 'public.billing_withdrawals', 'update') and not has_table_privilege(t, 'public.billing_withdrawals', 'delete'),
      'sem privilégio na tabela: ' || t;
  end loop;
  assert (select array_agg(attname::text order by attnum) from pg_attribute where attrelid = 'public.billing_withdrawals'::regclass and attnum > 0 and not attisdropped)
       = array['id', 'person_id', 'provider', 'purchase_hash', 'plan', 'period', 'amount_cents', 'contracted_on', 'requested_at', 'status', 'refunded_at', 'attempts', 'claimed_until'],
    'as colunas: nenhum dado do pagamento, só o resumo da compra';
  assert (select confdeltype from pg_constraint where conrelid = 'public.billing_withdrawals'::regclass and contype = 'f') = 'c', 'some com a pessoa (cascata)';
  assert exists (select 1 from pg_constraint where conname = 'billing_withdrawals_one_per_purchase' and contype = 'u'), 'um pedido por compra';
  foreach t in array array['billing_withdrawal_options(uuid)', 'billing_withdrawal_begin(uuid, text, text, text, text, bigint, date)',
                           'billing_withdrawal_finish(uuid, text, text, boolean)'] loop
    assert has_function_privilege('service_role', 'public.' || t, 'execute') and not has_function_privilege('authenticated', 'public.' || t, 'execute')
       and not has_function_privilege('anon', 'public.' || t, 'execute')
       and not exists (select 1 from aclexplode((select proacl from pg_proc where oid = ('public.' || t)::regprocedure)) a where a.grantee = 0),
      'só a chave de serviço executa ' || t;
    assert (select prosecdef and proconfig @> array['search_path=public'] from pg_proc where oid = ('public.' || t)::regprocedure), t || ' é security definer, com search_path fixo';
  end loop;
  assert not has_function_privilege('service_role', 'public.clarevo_withdrawal_access_after(uuid, text, text)', 'execute')
     and not has_function_privilege('authenticated', 'public.clarevo_withdrawal_access_after(uuid, text, text)', 'execute')
     and not has_function_privilege('anon', 'public.clarevo_withdrawal_access_after(uuid, text, text)', 'execute'), 'a interna: ninguém de fora';
  assert pg_get_functiondef('public.clarevo_forget_anonymous()'::regprocedure) ~ 'delete from public\.billing_withdrawals'
     and pg_get_functiondef('public.clarevo_forget_anonymous()'::regprocedure) ~ 'delete from public\.account_level_clock'
     and not has_function_privilege('service_role', 'public.clarevo_forget_anonymous()', 'execute'), 'o gatilho da pessoa anônima apaga também os pedidos';
  assert (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and has_function_privilege('authenticated', p.oid, 'execute')) = 130, 'nenhuma função nova para o app (130)';
  assert (select count(*) from pg_constraint c, regexp_matches(pg_get_constraintdef(c.oid), '''([a-z_]+)''::text', 'g') m
           where c.conname = 'record_operations_action_check') = 105, 'nenhuma ação nova em record_operations (105)';
end $$;

-- O app não lê a tabela nem chama as funções.
set role authenticated;
select pg_temp.as_(:ana);
select pg_temp.expect_code('select count(*) from public.billing_withdrawals', null, '42501');
select pg_temp.expect_code(format('select public.billing_withdrawal_options(%L)', pg_temp.ana()), null, '42501');
select pg_temp.expect_code(format($q$select public.billing_withdrawal_begin(%L, 'web', %L, 'individual', 'mensal', 2990, current_date)$q$, pg_temp.ana(), pg_temp.sha('sub_ana')), null, '42501');
reset role;

-- ---------------------------------------------------------------------------
-- 2. As compras (os avisos do Asaas, como a função do servidor as grava): Ana assinou no cartão hoje, depois do teste; Bia pagou um mês com
--    Pix hoje, no teste (o período começa no fim do teste); Caio pagou um mês com Pix há 25 dias e o seguinte hoje, adiantado; Davi assinou no
--    cartão há 20 dias e pagou com Pix há 10 (fora do prazo); Edu e Gil pagaram com Pix hoje.
-- ---------------------------------------------------------------------------
set role service_role;
select pg_temp.as_service();
do $$
declare
  r jsonb;
begin
  r := public.billing_apply('wd-a1', 'web', pg_temp.ana(), pg_temp.sha('sub_ana'), 'individual', now() + interval '33 days', now());
  assert r #>> '{access,status}' = 'assinatura' and r #>> '{access,provider}' = 'web', 'Ana assina: ' || r::text;
  r := public.billing_pix_apply('wd-b1', pg_temp.bia(), 'individual', pg_temp.sha('pay_bia'), pg_temp.hoje(), now());
  assert r #>> '{access,status}' = 'assinatura' and r #>> '{access,provider}' = 'pix', 'Bia paga com Pix no teste: ' || r::text;
  r := public.billing_pix_apply('wd-c1', pg_temp.caio(), 'familiar', pg_temp.sha('pay_caio_1'), pg_temp.hoje() - 25, now());
  r := public.billing_pix_apply('wd-c2', pg_temp.caio(), 'familiar', pg_temp.sha('pay_caio_2'), pg_temp.hoje(), now());
  assert (r ->> 'paid_through')::date = (pg_temp.hoje() - 25 + interval '2 months')::date, 'Caio: os dois meses em sequência: ' || r::text;
  r := public.billing_apply('wd-d1', 'web', pg_temp.davi(), pg_temp.sha('sub_davi'), 'individual', now() + interval '345 days', now(), 'anual', now() - interval '20 days');
  r := public.billing_pix_apply('wd-d2', pg_temp.davi(), 'individual', pg_temp.sha('pay_davi'), pg_temp.hoje() - 10, now());
  r := public.billing_pix_apply('wd-e1', pg_temp.edu(), 'individual', pg_temp.sha('pay_edu'), pg_temp.hoje(), now());
  r := public.billing_pix_apply('wd-g1', pg_temp.gil(), 'individual', pg_temp.sha('pay_gil'), pg_temp.hoje(), now());
end $$;

-- ---------------------------------------------------------------------------
-- 3. billing_withdrawal_options: as compras que podem estar no prazo, com o acesso que fica depois; a conta é feita sem gravar nada.
-- ---------------------------------------------------------------------------
do $$
declare
  antes text := pg_temp.estado();
  o jsonb;
  fim_teste_bia timestamptz := pg_temp.fim_do_teste(pg_temp.bia());
begin
  -- Bia está pagando com Pix: a situação é "assinatura"; o fim do teste vem da mesma conta de my_access (sem o direito).
  assert pg_temp.access(pg_temp.bia()) ->> 'status' = 'assinatura', 'Bia assina com Pix';
  o := public.billing_withdrawal_options(pg_temp.ana());
  assert o ->> 'result' = 'ok' and jsonb_array_length(o -> 'web') = 1 and jsonb_array_length(o -> 'pix') = 0 and o -> 'withdrawals' = '[]'::jsonb,
    'Ana: a assinatura no cartão: ' || o::text;
  assert o #>> '{web,0,external_ref}' = pg_temp.sha('sub_ana') and o #>> '{web,0,plan}' = 'individual' and o #>> '{web,0,period}' = 'mensal'
     and o #>> '{web,0,access_after,status}' = 'leitura', 'Ana: depois, só ver e exportar (o teste já acabou): ' || o::text;
  o := public.billing_withdrawal_options(pg_temp.bia());
  assert jsonb_array_length(o -> 'web') = 0 and jsonb_array_length(o -> 'pix') = 1 and o #>> '{pix,0,payment_hash}' = pg_temp.sha('pay_bia')
     and (o #>> '{pix,0,paid_on}')::date = pg_temp.hoje() and (o #>> '{pix,0,starts_on}')::date = pg_temp.hoje() + 12, 'Bia: o Pix pago no teste: ' || o::text;
  assert o #>> '{pix,0,access_after,status}' = 'teste' and (o #>> '{pix,0,access_after,until}')::timestamptz = fim_teste_bia,
    'Bia: depois, de volta ao teste, até o mesmo fim: ' || o::text;
  o := public.billing_withdrawal_options(pg_temp.caio());
  assert jsonb_array_length(o -> 'pix') = 1 and o #>> '{pix,0,payment_hash}' = pg_temp.sha('pay_caio_2') and o #>> '{pix,0,plan}' = 'familiar',
    'Caio: só o pagamento de hoje (o de 25 dias atrás passou do prazo): ' || o::text;
  assert o #>> '{pix,0,access_after,status}' = 'assinatura' and o #>> '{pix,0,access_after,provider}' = 'pix'
     and (o #>> '{pix,0,access_after,until}')::timestamptz = pg_temp.ate((pg_temp.hoje() - 25 + interval '1 month')::date),
    'Caio: depois, o mês pago antes continua: ' || o::text;
  o := public.billing_withdrawal_options(pg_temp.davi());
  assert o -> 'web' = '[]'::jsonb and o -> 'pix' = '[]'::jsonb, 'Davi: a assinatura de 20 dias e o Pix de 10 dias nem entram: ' || o::text;
  assert public.billing_withdrawal_options(null) ->> 'result' = 'sem_pessoa'
     and public.billing_withdrawal_options('00000000-0000-0000-0000-0000000000ff') ->> 'result' = 'sem_pessoa', 'sem pessoa';
  assert pg_temp.estado() = antes, 'a conta do acesso de depois não grava nada (nem aviso, nem direito, nem pagamento)';
  assert pg_temp.access(pg_temp.ana()) ->> 'status' = 'assinatura' and pg_temp.access(pg_temp.caio()) ->> 'status' = 'assinatura', 'o acesso continua o mesmo';
end $$;

-- ---------------------------------------------------------------------------
-- 4. billing_withdrawal_begin e billing_withdrawal_finish: um pedido por compra, sem devolver duas vezes.
-- ---------------------------------------------------------------------------
do $$
declare
  r jsonb;
  w public.billing_withdrawals;
begin
  -- Ana desiste: o pedido novo, com a hora, e a trava da tentativa.
  r := public.billing_withdrawal_begin(pg_temp.ana(), 'web', pg_temp.sha('sub_ana'), 'individual', 'mensal', 2990, pg_temp.hoje());
  assert r ->> 'result' = 'nova' and (r ->> 'requested_at')::timestamptz = now(), 'Ana: pedido novo: ' || r::text;
  w := pg_temp.pedido(pg_temp.sha('sub_ana'));
  assert w.person_id = pg_temp.ana() and w.status = 'pedida' and w.amount_cents = 2990 and w.contracted_on = pg_temp.hoje() and w.attempts = 1
     and w.claimed_until = now() + interval '30 seconds' and w.refunded_at is null, 'o pedido gravado';
  -- Um segundo toque (ou outra aba) durante a tentativa: em andamento, sem outra devolução.
  r := public.billing_withdrawal_begin(pg_temp.ana(), 'web', pg_temp.sha('sub_ana'), 'individual', 'mensal', 2990, pg_temp.hoje());
  assert r ->> 'result' = 'em_andamento' and (r ->> 'requested_at')::timestamptz = now(), 'segundo toque: em andamento: ' || r::text;
  -- O Asaas falhou: a trava sai, o pedido continua com a mesma hora; a repetição retoma.
  r := public.billing_withdrawal_finish(pg_temp.ana(), 'web', pg_temp.sha('sub_ana'), false);
  assert r ->> 'result' = 'pedida' and (pg_temp.pedido(pg_temp.sha('sub_ana'))).claimed_until is null, 'falha: a trava sai: ' || r::text;
  r := public.billing_withdrawal_begin(pg_temp.ana(), 'web', pg_temp.sha('sub_ana'), 'individual', 'mensal', 2990, pg_temp.hoje());
  assert r ->> 'result' = 'retomar' and (pg_temp.pedido(pg_temp.sha('sub_ana'))).attempts = 2, 'repetição: retoma: ' || r::text;
  -- O Asaas devolveu: concluída; outro pedido da mesma compra não devolve de novo.
  r := public.billing_withdrawal_finish(pg_temp.ana(), 'web', pg_temp.sha('sub_ana'), true);
  assert r ->> 'result' = 'devolvida' and (r ->> 'refunded_at')::timestamptz = now(), 'devolvida: ' || r::text;
  r := public.billing_withdrawal_begin(pg_temp.ana(), 'web', pg_temp.sha('sub_ana'), 'individual', 'mensal', 2990, pg_temp.hoje());
  assert r ->> 'result' = 'concluida' and (r ->> 'requested_at')::timestamptz = now() and pg_temp.pedidos(pg_temp.ana()) = 1,
    'concluída: um pedido só: ' || r::text;

  -- Pix: o dia que conta vem do banco (Bia pagou no teste: o fim do teste), não do que a função manda.
  r := public.billing_withdrawal_begin(pg_temp.bia(), 'pix', pg_temp.sha('pay_bia'), 'individual', 'mensal', 2990, date '2020-01-01');
  assert r ->> 'result' = 'nova' and (pg_temp.pedido(pg_temp.sha('pay_bia'))).contracted_on = pg_temp.hoje() + 12, 'Bia: o dia do fim do teste: ' || r::text;
  perform public.billing_withdrawal_finish(pg_temp.bia(), 'pix', pg_temp.sha('pay_bia'), true);
  r := public.billing_withdrawal_begin(pg_temp.caio(), 'pix', pg_temp.sha('pay_caio_2'), 'familiar', 'mensal', 6990, pg_temp.hoje());
  assert r ->> 'result' = 'nova', 'Caio: o pagamento adiantado: ' || r::text;
  perform public.billing_withdrawal_finish(pg_temp.caio(), 'pix', pg_temp.sha('pay_caio_2'), true);

  -- Fora do prazo: o pedido novo de uma compra de 8 dias atrás (no fuso do Acre); o Pix de 10 dias atrás, pelo dia do banco.
  r := public.billing_withdrawal_begin(pg_temp.davi(), 'web', pg_temp.sha('sub_davi'), 'individual', 'anual', 26990, (now() at time zone 'America/Rio_Branco')::date - 8);
  assert r ->> 'result' = 'fora_do_prazo' and pg_temp.pedido(pg_temp.sha('sub_davi')) is null, 'Davi: fora do prazo, nada gravado: ' || r::text;
  r := public.billing_withdrawal_begin(pg_temp.davi(), 'pix', pg_temp.sha('pay_davi'), 'individual', 'mensal', 2990, pg_temp.hoje());
  assert r ->> 'result' = 'fora_do_prazo', 'Davi: o Pix de 10 dias, pelo dia do banco: ' || r::text;
  -- O 7º dia (no fuso do Acre) ainda está no prazo.
  r := public.billing_withdrawal_begin(pg_temp.davi(), 'web', pg_temp.sha('sub_davi'), 'individual', 'anual', 26990, (now() at time zone 'America/Rio_Branco')::date - 7);
  assert r ->> 'result' = 'nova', 'Davi: o 7º dia ainda vale: ' || r::text;

  -- Muitas tentativas da mesma compra: para (protege a cota do Asaas), sem retomar.
  perform public.billing_withdrawal_finish(pg_temp.davi(), 'web', pg_temp.sha('sub_davi'), false);
end $$;
reset role;
update public.billing_withdrawals set attempts = 20 where purchase_hash = encode(sha256(convert_to('sub_davi', 'UTF8')), 'hex');
set role service_role;
select pg_temp.as_service();
do $$
declare
  r jsonb;
begin
  r := public.billing_withdrawal_begin(pg_temp.davi(), 'web', pg_temp.sha('sub_davi'), 'individual', 'anual', 26990, pg_temp.hoje());
  assert r ->> 'result' = 'muitas_tentativas' and (pg_temp.pedido(pg_temp.sha('sub_davi'))).claimed_until is null, 'muitas tentativas: ' || r::text;
  assert public.billing_withdrawal_finish(pg_temp.edu(), 'pix', pg_temp.sha('nada'), true) ->> 'result' = 'sem_pedido', 'sem pedido';
  assert public.billing_withdrawal_begin(null, 'pix', pg_temp.sha('pay_edu'), 'individual', 'mensal', 2990, pg_temp.hoje()) ->> 'result' = 'sem_pessoa', 'sem pessoa';
end $$;
-- A compra de outra pessoa (Edu com a assinatura da Ana, ou com um resumo que não é de ninguém) e os argumentos fora do formato.
select pg_temp.expect_code(format($q$select public.billing_withdrawal_begin(%L, 'web', %L, 'individual', 'mensal', 2990, %L)$q$, pg_temp.edu(), pg_temp.sha('sub_ana'), pg_temp.hoje()),
  'compra_de_outra_pessoa', '22023');
select pg_temp.expect_code(format($q$select public.billing_withdrawal_begin(%L, 'pix', %L, 'individual', 'mensal', 2990, %L)$q$, pg_temp.edu(), pg_temp.sha('pay_bia'), pg_temp.hoje()),
  'compra_de_outra_pessoa', '22023');
select pg_temp.expect_code(format($q$select public.billing_withdrawal_begin(%L, 'web', %L, 'individual', 'mensal', 2990, %L)$q$, pg_temp.edu(), pg_temp.sha('sub_de_ninguem'), pg_temp.hoje()),
  'compra_de_outra_pessoa', '22023');
select pg_temp.expect_code(format($q$select public.billing_withdrawal_begin(%L, 'apple', %L, 'individual', 'mensal', 2990, %L)$q$, pg_temp.edu(), pg_temp.sha('pay_edu'), pg_temp.hoje()),
  'pedido_invalido', '22023');
select pg_temp.expect_code(format($q$select public.billing_withdrawal_begin(%L, 'pix', %L, 'individual', 'mensal', 0, %L)$q$, pg_temp.edu(), pg_temp.sha('pay_edu'), pg_temp.hoje()),
  'pedido_invalido', '22023');
select pg_temp.expect_code(format($q$select public.billing_withdrawal_begin(%L, 'pix', 'nao-e-resumo', 'individual', 'mensal', 2990, %L)$q$, pg_temp.edu(), pg_temp.hoje()),
  'pedido_invalido', '22023');
select pg_temp.expect_code(format($q$select public.billing_withdrawal_finish(%L, 'pix', %L, null)$q$, pg_temp.edu(), pg_temp.sha('pay_edu')), 'pedido_invalido', '22023');

-- ---------------------------------------------------------------------------
-- 5. O aviso de estorno do Asaas tira o período pago, como hoje (billing_apply e billing_pix_apply, sem mudança), e o acesso fica o que a
--    tela disse antes de confirmar.
-- ---------------------------------------------------------------------------
do $$
declare
  r jsonb;
  o jsonb;
  fim_teste_bia timestamptz := pg_temp.fim_do_teste(pg_temp.bia());
begin
  -- Ana (cartão, depois do teste): a assinatura removida e a cobrança estornada: o direito acaba agora; só ver e exportar.
  r := public.billing_apply('wd-a2', 'web', pg_temp.ana(), pg_temp.sha('sub_ana'), 'individual', now(), now());
  assert r #>> '{access,status}' = 'leitura' and r #>> '{access,can_write}' = 'false', 'Ana: só ver e exportar: ' || r::text;
  -- Bia (Pix pago no teste): a cobrança devolvida sai do período pago; de volta ao teste, até o mesmo fim.
  r := public.billing_pix_apply('wd-b2', pg_temp.bia(), 'individual', pg_temp.sha('pay_bia'), null, now());
  assert r -> 'paid_through' = 'null'::jsonb and r #>> '{access,status}' = 'teste' and (r #>> '{access,until}')::timestamptz = fim_teste_bia,
    'Bia: de volta ao teste: ' || r::text;
  -- Caio (o mês pago adiantado devolvido): o mês pago antes continua.
  r := public.billing_pix_apply('wd-c3', pg_temp.caio(), 'familiar', pg_temp.sha('pay_caio_2'), null, now());
  assert r #>> '{access,status}' = 'assinatura' and (r #>> '{access,until}')::timestamptz = pg_temp.ate((pg_temp.hoje() - 25 + interval '1 month')::date),
    'Caio: o mês pago antes continua: ' || r::text;
  -- Depois do estorno, o Pix devolvido não é mais compra no prazo, e o pedido continua lá (com a hora), para a confirmação.
  o := public.billing_withdrawal_options(pg_temp.bia());
  assert o -> 'pix' = '[]'::jsonb and jsonb_array_length(o -> 'withdrawals') = 1 and o #>> '{withdrawals,0,status}' = 'devolvida'
     and o #>> '{withdrawals,0,purchase_hash}' = pg_temp.sha('pay_bia') and (o #>> '{withdrawals,0,amount_cents}')::int = 2990
     and (o #>> '{withdrawals,0,requested_at}')::timestamptz = now(), 'Bia: o pedido continua, sem compra no prazo: ' || o::text;
  -- Pix já devolvido sem pedido (a equipe fez pelo painel): sem pagamento valendo, nada a pedir.
  r := public.billing_pix_apply('wd-e2', pg_temp.edu(), 'individual', pg_temp.sha('pay_edu'), null, now());
  r := public.billing_withdrawal_begin(pg_temp.edu(), 'pix', pg_temp.sha('pay_edu'), 'individual', 'mensal', 2990, pg_temp.hoje());
  assert r ->> 'result' = 'sem_pagamento' and pg_temp.pedido(pg_temp.sha('pay_edu')) is null, 'Edu: já devolvido, nada gravado: ' || r::text;
  -- Gil pede a desistência (fica gravada) e, depois, a conta fica anônima.
  r := public.billing_withdrawal_begin(pg_temp.gil(), 'pix', pg_temp.sha('pay_gil'), 'individual', 'mensal', 2990, pg_temp.hoje());
  assert r ->> 'result' = 'nova', 'Gil: pedido: ' || r::text;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 6. A pessoa que fica anônima na exclusão da conta perde os pedidos (pelo gatilho persons_forget_anonymous); os dos outros ficam.
-- ---------------------------------------------------------------------------
update public.persons set display_name = '', deleted_at = now() where id = :gil;
do $$ begin
  assert (select count(*) from public.billing_withdrawals where person_id = pg_temp.gil()) = 0, 'Gil, anônima, fica sem pedidos';
  assert (select count(*) from public.billing_withdrawals where person_id in (pg_temp.ana(), pg_temp.bia(), pg_temp.caio(), pg_temp.davi())) = 4, 'os dos outros ficam';
end $$;
set role service_role;
select pg_temp.as_service();
do $$ begin
  assert public.billing_withdrawal_options(pg_temp.gil()) ->> 'result' = 'sem_pessoa', 'conta excluída: sem pessoa';
end $$;
reset role;

rollback;
