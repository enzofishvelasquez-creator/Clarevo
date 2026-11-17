-- Níveis de conta: a queda por tempo sem anotar e o nível Esmeralda (D-111; migração 0041). my_account_marks(true) devolve os marcos e
-- desde quando conta o tempo sem anotar (a última anotação de gasto ou recebimento, no Pessoal ou numa Família, ou a primeira leitura com
-- a regra, o que for depois); os 6 marcos de investimentos e reserva contam pelo uso; a chamada do app anterior (sem parâmetro) continua
-- igual e não começa a contagem; a contagem some com a pessoa que fica anônima.
-- Pessoas FICTÍCIAS: Ana e Bento. Tudo em uma transação desfeita no fim.
\set ON_ERROR_STOP 1
\set ana '''00000000-0000-0000-0000-0000000001a1'''
\set bento '''00000000-0000-0000-0000-0000000001b2'''

begin;

create function pg_temp.as_(p_id uuid) returns text language sql as $$
  select set_config('request.jwt.claim.sub', p_id::text, true)
$$;
create function pg_temp.expect_denied(p_sql text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when insufficient_privilege then return;
  end;
  raise exception 'esperado permissão negada em: %', p_sql;
end $$;
create function pg_temp.trues(p jsonb) returns text[] language sql as $$
  select coalesce(array_agg(k order by k), '{}') from jsonb_each(p) e(k, v) where v = 'true'::jsonb
$$;
-- O dia de Brasília de agora menos n dias (a transação tem um só "agora").
create function pg_temp.days_ago(n int) returns text language sql as $$
  select to_char((now() - make_interval(days => n)) at time zone 'America/Sao_Paulo', 'YYYY-MM-DD')
$$;
-- O tempo passa para uma pessoa: as operações dela e a contagem ficam n dias mais velhas (o registro das operações e a contagem só são
-- escritos pelas funções).
create function pg_temp.age(p_person uuid, p_days int) returns void language sql security definer set search_path = public, pg_temp as $$
  update public.record_operations set created_at = created_at - make_interval(days => p_days) where actor_id = p_person;
  update public.account_level_clock set started_at = started_at - make_interval(days => p_days),
         last_note_at = last_note_at - make_interval(days => p_days) where person_id = p_person;
$$;
-- Só as operações envelhecem (a pessoa estava parada antes de a regra chegar).
create function pg_temp.age_ops(p_person uuid, p_days int) returns void language sql security definer set search_path = public, pg_temp as $$
  update public.record_operations set created_at = created_at - make_interval(days => p_days) where actor_id = p_person;
$$;
-- O registro das operações perde as linhas da pessoa (como na limpeza dos excluídos e na Família apagada).
create function pg_temp.lose_ops(p_person uuid) returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  alter table public.record_operations disable trigger user;
  delete from public.record_operations where actor_id = p_person;
  alter table public.record_operations enable trigger user;
end $$;
create function pg_temp.clocks(p_person uuid) returns bigint language sql security definer set search_path = public, pg_temp as $$
  select count(*) from public.account_level_clock where person_id = p_person
$$;
create temp table ids (name text primary key, id uuid not null);
grant all on ids to authenticated;
create function pg_temp.id(p text) returns uuid language sql as $$ select id from ids where name = p $$;

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  (:ana, 'ana.queda@exemplo.test', now(), '{"display_name":"Ana"}'),
  (:bento, 'bento.queda@exemplo.test', now(), '{"display_name":"Bento"}');

-- 1. Privilégios: a função com o parâmetro só para quem está no app; a versão sem parâmetro saiu (a chamada sem parâmetro cai na nova);
-- ninguém lê a contagem direto.
do $$ begin
  assert has_function_privilege('authenticated', 'public.my_account_marks(boolean)', 'execute')
     and not has_function_privilege('anon', 'public.my_account_marks(boolean)', 'execute'), 'my_account_marks só para quem está no app';
  assert to_regprocedure('public.my_account_marks()') is null, 'a versão sem parâmetro saiu';
  assert (select p.prosecdef and p.proconfig @> array['search_path=public'] from pg_proc p where p.oid = 'public.my_account_marks(boolean)'::regprocedure),
    'security definer com search_path fixo';
  assert not has_table_privilege('authenticated', 'public.account_level_clock', 'select') and not has_table_privilege('anon', 'public.account_level_clock', 'select')
     and not has_table_privilege('service_role', 'public.account_level_clock', 'select'), 'ninguém lê account_level_clock direto';
  assert (select relrowsecurity from pg_class where oid = 'public.account_level_clock'::regclass), 'RLS ligada';
end $$;

set role authenticated;
select pg_temp.as_(:bento);
select public.ensure_personal_space('Conta principal');
select pg_temp.as_(:ana);
do $$
declare
  space jsonb := public.ensure_personal_space('Conta principal');
  m jsonb;
  s jsonb;
begin
  insert into ids values ('ana_ctx', (space ->> 'context_id')::uuid), ('ana_acc', (space #>> '{account,id}')::uuid);
  -- 2. A chamada do app anterior: os 24 marcos, como antes (sem "marks"), e a contagem não começa.
  m := public.my_account_marks();
  assert (select count(*) from jsonb_object_keys(m)) = 24 and not (m ? 'marks') and pg_temp.trues(m) = '{}', 'app anterior: 24 marcos, nenhum feito: ' || m::text;
  assert pg_temp.clocks(auth.uid()) = 0, 'o app anterior não começa a contagem';
  assert public.my_account_marks(false) = m, 'false é igual a sem parâmetro';
  -- 3. O app com a D-111: os marcos dentro de "marks", e a contagem começa hoje, sem anotação.
  s := public.my_account_marks(true);
  assert (select count(*) from jsonb_object_keys(s -> 'marks')) = 24 and pg_temp.trues(s -> 'marks') = '{}', 'os 24 marcos: ' || s::text;
  assert s ->> 'idle_since' = pg_temp.days_ago(0) and s -> 'last_note_on' = 'null'::jsonb, 'conta nova: conta desde hoje, sem anotação: ' || s::text;
  assert pg_temp.clocks(auth.uid()) = 1 and public.my_account_marks(true) = s, 'uma linha de contagem; ler de novo não muda nada';
end $$;

-- 4. A contagem: começa na primeira leitura; uma anotação de gasto ou recebimento a traz para hoje; o que não é anotação não mexe nela.
do $$
declare
  s jsonb;
  c jsonb;
begin
  perform pg_temp.age(auth.uid(), 50);
  s := public.my_account_marks(true);
  assert s ->> 'idle_since' = pg_temp.days_ago(50) and s -> 'last_note_on' = 'null'::jsonb, '50 dias sem anotação desde a primeira leitura: ' || s::text;
  -- Uma meta, um orçamento e um investimento não são anotação de gasto ou recebimento.
  perform public.create_goal('qd-meta-001', pg_temp.id('ana_ctx'), 'objetivo', 'Viagem', 500000, null, null, null, null, null, null, null);
  perform public.set_category_budget('qd-orc-0001', pg_temp.id('ana_ctx'), 'Mercado', '2026-11-01', 0, 80000);
  s := public.my_account_marks(true);
  assert s ->> 'idle_since' = pg_temp.days_ago(50), 'meta e orçamento não contam como anotação: ' || s::text;
  -- Um gasto conta.
  perform public.create_record('qd-gasto-01', pg_temp.id('ana_ctx'), pg_temp.id('ana_acc'), 'despesa', 5230, '2026-11-10', 'Mercado');
  s := public.my_account_marks(true);
  assert s ->> 'idle_since' = pg_temp.days_ago(0) and s ->> 'last_note_on' = pg_temp.days_ago(0), 'um gasto traz a contagem para hoje: ' || s::text;
  -- O tempo passa; uma conta paga também conta (o pagamento vira gasto).
  perform pg_temp.age(auth.uid(), 70);
  s := public.my_account_marks(true);
  assert s ->> 'idle_since' = pg_temp.days_ago(70) and s ->> 'last_note_on' = pg_temp.days_ago(70), '70 dias depois do gasto: ' || s::text;
  c := public.create_commitment('qd-conta-01', pg_temp.id('ana_ctx'), 15000, '2026-11-15', 'Internet', 'Moradia');
  assert public.my_account_marks(true) ->> 'idle_since' = pg_temp.days_ago(70), 'cadastrar a conta não é anotar';
  perform public.pay_commitment('qd-pagar-01', (c #>> '{commitment,id}')::uuid, 1, pg_temp.id('ana_acc'), 15000, '2026-11-15', 'Moradia');
  s := public.my_account_marks(true);
  assert s ->> 'idle_since' = pg_temp.days_ago(0) and s ->> 'last_note_on' = pg_temp.days_ago(0), 'pagar a conta conta: ' || s::text;
  -- O registro das operações perde as linhas (limpeza, Família apagada): a última anotação fica guardada e a contagem não volta atrás.
  perform pg_temp.age(auth.uid(), 30);
  perform pg_temp.lose_ops(auth.uid());
  s := public.my_account_marks(true);
  assert s ->> 'idle_since' = pg_temp.days_ago(30) and s ->> 'last_note_on' = pg_temp.days_ago(30), 'sem as operações, a última anotação fica: ' || s::text;
  assert (s #>> '{marks,gasto}')::boolean and (s #>> '{marks,pagou}')::boolean, 'e os marcos também';
end $$;

-- 5. Anotar numa Família também conta.
do $$
declare
  fam uuid := (public.create_family('Casa da Ana', 'qd-fam-0001') #>> '{context,id}')::uuid;
  fam_acc uuid;
  s jsonb;
begin
  insert into ids values ('fam', fam);
  select id into fam_acc from public.financial_accounts where context_id = fam and is_default and deleted_at is null;
  perform pg_temp.age(auth.uid(), 10);
  -- Os 30 dias de antes e mais 10: criar a Família não é anotar.
  assert public.my_account_marks(true) ->> 'idle_since' = pg_temp.days_ago(40), 'criar a Família não é anotar';
  perform public.create_record('qd-fam-rec1', fam, fam_acc, 'receita', 300000, '2026-11-05', 'Salário', 'Salário');
  s := public.my_account_marks(true);
  assert s ->> 'idle_since' = pg_temp.days_ago(0) and s ->> 'last_note_on' = pg_temp.days_ago(0), 'um recebimento na Família conta: ' || s::text;
end $$;

-- 6. Os marcos de investimentos e reserva, pelo uso.
do $$
declare
  ctx uuid := pg_temp.id('ana_ctx');
  inv jsonb;
  inv_id uuid;
  mov jsonb;
  reserva uuid;
  m jsonb;
  investing text[] := array['inv_aporte', 'inv_meta', 'inv_plano', 'inv_rendimento', 'inv_valor', 'reserva_plano'];
begin
  -- O investimento com o valor de hoje no cadastro: o marco do dia a dia, nenhum do grupo (o aporte e o valor do cadastro não contam).
  inv := public.create_investment('qd-inv-0001', ctx, 'Aplicação', 'renda_fixa', 100000, '2026-11-01', 100500);
  inv_id := (inv #>> '{investment,id}')::uuid;
  m := public.my_account_marks();
  assert (m ->> 'investimento')::boolean and not (pg_temp.trues(m) && investing), 'só o investimento: ' || m::text;
  -- Aporte, valor e rendimento registrados depois.
  perform public.add_investment_movement('qd-mov-0001', inv_id, 'aporte', 5000, '2026-11-10');
  assert pg_temp.trues(public.my_account_marks()) && array['inv_aporte'] and not (pg_temp.trues(public.my_account_marks()) && array['inv_valor', 'inv_rendimento']), 'aporte';
  mov := public.add_investment_movement('qd-mov-0002', inv_id, 'valor', 106000, '2026-11-12');
  assert (public.my_account_marks() ->> 'inv_valor')::boolean, 'valor atualizado';
  perform public.add_investment_movement('qd-mov-0003', inv_id, 'rendimento', 300, '2026-11-13', null, 'juros');
  assert (public.my_account_marks() ->> 'inv_rendimento')::boolean, 'rendimento recebido';
  -- Excluir o movimento não desfaz o marco (fica guardado).
  perform public.delete_investment_movement('qd-mov-0004', (mov #>> '{movement,id}')::uuid, 1);
  assert (public.my_account_marks() ->> 'inv_valor')::boolean, 'excluir o valor não desfaz o marco';
  -- O plano de aportes.
  perform public.set_investment_plan('qd-plano-01', ctx, 50000);
  assert (public.my_account_marks() ->> 'inv_plano')::boolean, 'plano de aportes';
  -- A reserva sem plano por mês não conta; o investimento ligado a ela conta.
  reserva := (public.create_goal('qd-res-0001', ctx, 'emergencia', 'Reserva para imprevistos', 2250000, null, null, 375000, 6, 'informado', null, null) #>> '{goal,id}')::uuid;
  m := public.my_account_marks();
  assert not (m ->> 'reserva_plano')::boolean and not (m ->> 'inv_meta')::boolean, 'reserva sem plano, nada ligado: ' || m::text;
  perform public.update_investment('qd-inv-0002', inv_id, (select version from public.investments where id = inv_id), 'Aplicação', 'renda_fixa',
                                   jsonb_build_object('goal_id', reserva::text));
  assert (public.my_account_marks() ->> 'inv_meta')::boolean, 'investimento ligado a uma meta';
  -- A reserva com plano por mês, criada pela pessoa na Família, conta.
  perform public.create_goal('qd-res-0002', pg_temp.id('fam'), 'emergencia', 'Reserva para imprevistos', 900000, null, 40000, 300000, 3, 'informado', null, null);
  m := public.my_account_marks(true) -> 'marks';
  assert pg_temp.trues(m) @> investing, 'os 6 marcos de investimentos e reserva: ' || m::text;
  -- Nenhum valor entra: a resposta só tem sim ou não.
  assert not exists (select 1 from jsonb_each(m) e where jsonb_typeof(e.value) <> 'boolean'), 'só sim ou não';
end $$;

-- 7. Cada pessoa só vê o seu; quem já estava parado quando a regra chegou tem os 60 dias inteiros a partir da primeira leitura.
select pg_temp.as_(:bento);
do $$
declare
  space jsonb := public.ensure_personal_space('Conta principal');
  s jsonb;
begin
  assert pg_temp.trues(public.my_account_marks()) = '{}', 'o Bento não herda os marcos da Ana';
  perform public.create_record('qd-bento-01', (space ->> 'context_id')::uuid, (space #>> '{account,id}')::uuid, 'despesa', 1000, '2026-11-10', 'Padaria');
  -- O Bento anotou há 200 dias e só usou o app anterior desde então (sem contagem).
  perform pg_temp.age_ops(auth.uid(), 200);
  perform public.my_account_marks();
  assert pg_temp.clocks(auth.uid()) = 0, 'o app anterior não começa a contagem';
  s := public.my_account_marks(true);
  assert s ->> 'idle_since' = pg_temp.days_ago(0) and s ->> 'last_note_on' = pg_temp.days_ago(200),
    'parado havia 200 dias: a contagem começa na primeira leitura com a regra, e a última anotação é a de verdade: ' || s::text;
  perform pg_temp.age(auth.uid(), 46);
  s := public.my_account_marks(true);
  assert s ->> 'idle_since' = pg_temp.days_ago(46) and s ->> 'last_note_on' = pg_temp.days_ago(246), '46 dias depois: ' || s::text;
end $$;
select pg_temp.expect_denied('select count(*) from public.account_level_clock');
reset role;

-- 8. Fuso inválido guardado na pessoa: os dias saem no fuso de Brasília.
update public.persons set time_zone = 'Nada/Zona' where id = :bento;
set role authenticated;
select pg_temp.as_(:bento);
do $$ begin
  assert public.my_account_marks(true) ->> 'idle_since' = pg_temp.days_ago(46), 'fuso inválido: o de Brasília';
end $$;
reset role;

-- 9. A pessoa que vira anônima na exclusão da conta: a contagem dela sai pelo gatilho persons_forget_anonymous; a do Bento fica. Depois,
-- uma chamada dela não grava contagem nem marcos e não diz desde quando conta (o nível não desce).
update public.persons set display_name = '', deleted_at = now() where id = :ana;
do $$ begin
  assert pg_temp.clocks('00000000-0000-0000-0000-0000000001a1') = 0 and (select count(*) from public.account_marks where person_id = '00000000-0000-0000-0000-0000000001a1') = 0,
    'a pessoa anônima fica sem contagem e sem marcos';
  assert pg_temp.clocks('00000000-0000-0000-0000-0000000001b2') = 1, 'a do Bento fica';
  assert pg_get_functiondef('public.clarevo_forget_anonymous()'::regprocedure) ~ 'delete from public\.account_level_clock', 'o gatilho apaga a contagem';
end $$;
set role authenticated;
select pg_temp.as_(:ana);
do $$
declare
  s jsonb := public.my_account_marks(true);
begin
  assert s -> 'idle_since' = 'null'::jsonb and s -> 'last_note_on' = 'null'::jsonb, 'sem contagem para a pessoa anônima: ' || s::text;
end $$;
reset role;
do $$ begin
  assert pg_temp.clocks('00000000-0000-0000-0000-0000000001a1') = 0 and (select count(*) from public.account_marks where person_id = '00000000-0000-0000-0000-0000000001a1') = 0,
    'nada gravado para a pessoa anônima';
end $$;

-- 10. Sem sessão: recusa.
set role authenticated;
do $$ begin
  perform set_config('request.jwt.claim.sub', '', true);
  begin
    perform public.my_account_marks(true);
    raise exception 'esperado nao_autenticado';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

rollback;
