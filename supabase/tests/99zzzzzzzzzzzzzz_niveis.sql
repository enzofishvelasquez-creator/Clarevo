-- Níveis de conta (D-095; migração 0034): my_account_marks devolve os 18 marcos "já fez alguma vez" da pessoa que chama, lidos do
-- registro das operações dela, e guarda os alcançados em account_marks: o nível não desce nem quando o registro perde linhas (a
-- limpeza dos excluídos e a Família apagada). Não vê o que é de outra pessoa, e ninguém lê a tabela direto.
-- Pessoas FICTÍCIAS: Lia e Rui. Tudo em uma transação desfeita no fim.
\set ON_ERROR_STOP 1
\set lia '''00000000-0000-0000-0000-0000000000f1'''
\set rui '''00000000-0000-0000-0000-0000000000f2'''

begin;
set local clarevo.today = '2026-11-12';

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
-- Envelhece as operações de uma ação (para "anotou em três meses diferentes"): o registro das operações só é escrito pelas funções.
create function pg_temp.age_op(p_person uuid, p_key text, p_months int) returns void language sql security definer set search_path = public, pg_temp as $$
  update public.record_operations set created_at = created_at - make_interval(months => p_months) where actor_id = p_person and idempotency_key = p_key
$$;
-- O registro das operações perde as linhas da pessoa (como na Família apagada), e os lançamentos excluídos saem de vez (a limpeza).
create function pg_temp.lose_ops(p_person uuid) returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  alter table public.record_operations disable trigger user;
  delete from public.record_operations where actor_id = p_person;
  alter table public.record_operations enable trigger user;
end $$;
create function pg_temp.stored(p_person uuid) returns bigint language sql security definer set search_path = public, pg_temp as $$
  select count(*) from public.account_marks where person_id = p_person
$$;

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  (:lia, 'lia.niveis@exemplo.test', now(), '{"display_name":"Lia"}'),
  (:rui, 'rui.niveis@exemplo.test', now(), '{"display_name":"Rui"}');

-- 1. Privilégios: só quem está no app chama; sem sessão, recusa.
do $$ begin
  assert has_function_privilege('authenticated', 'public.my_account_marks()', 'execute')
     and not has_function_privilege('anon', 'public.my_account_marks()', 'execute'), 'my_account_marks só para quem está no app';
  assert not has_table_privilege('authenticated', 'public.account_marks', 'select') and not has_table_privilege('anon', 'public.account_marks', 'select')
     and not has_table_privilege('service_role', 'public.account_marks', 'select'), 'ninguém lê account_marks direto';
end $$;

set role authenticated;
select pg_temp.as_(:rui);
select public.ensure_personal_space('Conta principal');
select pg_temp.as_(:lia);
do $$
declare
  space jsonb := public.ensure_personal_space('Conta principal');
  ctx uuid := (space ->> 'context_id')::uuid;
  acc uuid := (space #>> '{account,id}')::uuid;
  m jsonb;
  gasto public.financial_records;
  goal uuid;
begin
  -- 2. Conta nova: os 18 marcos, todos "não".
  m := public.my_account_marks();
  assert (select count(*) from jsonb_object_keys(m)) = 18 and pg_temp.trues(m) = '{}', 'conta nova: 18 marcos, nenhum feito: ' || m::text;
  assert pg_temp.stored(auth.uid()) = 0, 'conta nova: nada guardado';
  -- 3. Um gasto e um recebimento: cada um o seu marco.
  gasto := public.create_record('nv-gasto-01', ctx, acc, 'despesa', 5230, '2026-11-10', 'Mercado');
  assert pg_temp.trues(public.my_account_marks()) = '{gasto}', 'um gasto: ' || public.my_account_marks()::text;
  perform public.create_record('nv-receb-01', ctx, acc, 'receita', 300000, '2026-11-05', 'Salário', 'Salário');
  assert pg_temp.trues(public.my_account_marks()) = '{gasto,recebimento}', 'gasto e recebimento';
  -- 4. Excluir o gasto não desfaz o marco (o nível nunca desce).
  perform public.delete_record('nv-excl-001', gasto.id, gasto.version);
  assert pg_temp.trues(public.my_account_marks()) = '{gasto,recebimento}', 'excluir não desfaz: ' || public.my_account_marks()::text;
  -- 5. Uma meta e um investimento.
  goal := (public.create_goal('nv-meta-001', ctx, 'objetivo', 'Viagem', 500000, '2027-06-01', 40000, null, null, null, null, null) #>> '{goal,id}')::uuid;
  perform public.create_investment('nv-inv-0001', ctx, 'Aplicação', 'renda_fixa', 100000, '2026-11-01', null);
  assert pg_temp.trues(public.my_account_marks()) = '{gasto,investimento,meta,recebimento}', 'meta e investimento: ' || public.my_account_marks()::text;
  -- 6. Três meses diferentes: mais duas anotações, envelhecidas em um e dois meses.
  perform public.create_record('nv-gasto-02', ctx, acc, 'despesa', 1000, '2026-11-11', 'Padaria');
  perform public.create_record('nv-gasto-03', ctx, acc, 'despesa', 2000, '2026-11-11', 'Farmácia');
  assert not (public.my_account_marks() ->> 'tres_meses')::boolean, 'tudo no mesmo mês: ainda não';
  perform pg_temp.age_op(auth.uid(), 'nv-gasto-02', 1);
  assert not (public.my_account_marks() ->> 'tres_meses')::boolean, 'dois meses: ainda não';
  perform pg_temp.age_op(auth.uid(), 'nv-gasto-03', 2);
  assert (public.my_account_marks() ->> 'tres_meses')::boolean, 'três meses diferentes';
  -- 6b. Os marcos que não envolvem dinheiro: uma conta de origem a mais, o limite pessoal e a imagem da meta.
  perform public.create_account('nv-conta-01', ctx, 'Carteira', 'dinheiro');
  perform public.set_commitment_limit('nv-lim-0001', ctx, '2026-11-01', 0, 40);
  perform public.set_goal_image(goal, 'casa', null, 0, 'nv-img-0001');
  assert pg_temp.trues(public.my_account_marks()) = '{conta,gasto,imagem,investimento,limite,meta,recebimento,tres_meses}',
    'conta de origem, limite e imagem: ' || public.my_account_marks()::text;
  -- 6c. O nível nunca desce: os alcançados ficam guardados, mesmo se o registro das operações perder as linhas da pessoa.
  assert pg_temp.stored(auth.uid()) = 8, 'os oito marcos guardados: ' || pg_temp.stored(auth.uid());
  perform pg_temp.lose_ops(auth.uid());
  assert pg_temp.trues(public.my_account_marks()) = '{conta,gasto,imagem,investimento,limite,meta,recebimento,tres_meses}',
    'sem as operações, os marcos continuam: ' || public.my_account_marks()::text;
end $$;
select pg_temp.expect_denied('select count(*) from public.account_marks');

-- 7. Cada pessoa só vê os seus marcos.
select pg_temp.as_(:rui);
do $$ begin
  assert pg_temp.trues(public.my_account_marks()) = '{}', 'o Rui não herda os marcos da Lia: ' || public.my_account_marks()::text;
end $$;
reset role;

-- 8. A pessoa que vira anônima na exclusão da conta (ainda autora numa Família que continua): os marcos, o Checkout e os pagamentos
-- por Pix dela saem pelo gatilho persons_forget_anonymous; os do Rui ficam.
insert into public.billing_checkouts (checkout_hash, person_id, plan) values (repeat('a', 64), :lia, 'individual'), (repeat('b', 64), :rui, 'individual');
insert into public.billing_pix_payments (payment_hash, person_id, plan, paid_on) values (repeat('c', 64), :lia, 'individual', '2026-11-01'), (repeat('d', 64), :rui, 'individual', '2026-11-01');
insert into public.account_marks (person_id, mark) values (:rui, 'gasto');
update public.persons set display_name = '', deleted_at = now() where id = :lia;
do $$ begin
  assert (select count(*) from public.account_marks where person_id = '00000000-0000-0000-0000-0000000000f1') = 0
     and (select count(*) from public.billing_checkouts where person_id = '00000000-0000-0000-0000-0000000000f1') = 0
     and (select count(*) from public.billing_pix_payments where person_id = '00000000-0000-0000-0000-0000000000f1') = 0,
    'a pessoa anônima fica sem marcos, sem Checkout e sem pagamentos por Pix';
  assert (select count(*) from public.account_marks where person_id = '00000000-0000-0000-0000-0000000000f2') = 1
     and (select count(*) from public.billing_checkouts where person_id = '00000000-0000-0000-0000-0000000000f2') = 1
     and (select count(*) from public.billing_pix_payments where person_id = '00000000-0000-0000-0000-0000000000f2') = 1,
    'os do Rui ficam';
  assert not has_function_privilege('authenticated', 'public.clarevo_forget_anonymous()', 'execute'), 'o gatilho não é chamado pelo app';
end $$;

rollback;
