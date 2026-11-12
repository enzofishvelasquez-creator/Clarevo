-- Níveis de conta (D-095; migração 0034): my_account_marks devolve os 16 marcos "já fez alguma vez" da pessoa que chama, lidos do
-- registro das operações dela. Não desce quando o lançamento é excluído, não vê o que é de outra pessoa e não guarda nada.
-- Pessoas FICTÍCIAS: Lia e Rui. Tudo em uma transação desfeita no fim.
\set ON_ERROR_STOP 1
\set lia '''00000000-0000-0000-0000-0000000000f1'''
\set rui '''00000000-0000-0000-0000-0000000000f2'''

begin;
set local clarevo.today = '2026-11-12';

create function pg_temp.as_(p_id uuid) returns text language sql as $$
  select set_config('request.jwt.claim.sub', p_id::text, true)
$$;
create function pg_temp.trues(p jsonb) returns text[] language sql as $$
  select coalesce(array_agg(k order by k), '{}') from jsonb_each(p) e(k, v) where v = 'true'::jsonb
$$;
-- Envelhece as operações de uma ação (para "anotou em três meses diferentes"): o registro das operações só é escrito pelas funções.
create function pg_temp.age_op(p_person uuid, p_key text, p_months int) returns void language sql security definer set search_path = public, pg_temp as $$
  update public.record_operations set created_at = created_at - make_interval(months => p_months) where actor_id = p_person and idempotency_key = p_key
$$;

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  (:lia, 'lia.niveis@exemplo.test', now(), '{"display_name":"Lia"}'),
  (:rui, 'rui.niveis@exemplo.test', now(), '{"display_name":"Rui"}');

-- 1. Privilégios: só quem está no app chama; sem sessão, recusa.
do $$ begin
  assert has_function_privilege('authenticated', 'public.my_account_marks()', 'execute')
     and not has_function_privilege('anon', 'public.my_account_marks()', 'execute'), 'my_account_marks só para quem está no app';
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
begin
  -- 2. Conta nova: os 16 marcos, todos "não".
  m := public.my_account_marks();
  assert (select count(*) from jsonb_object_keys(m)) = 16 and pg_temp.trues(m) = '{}', 'conta nova: 16 marcos, nenhum feito: ' || m::text;
  -- 3. Um gasto e um recebimento: cada um o seu marco.
  gasto := public.create_record('nv-gasto-01', ctx, acc, 'despesa', 5230, '2026-11-10', 'Mercado');
  assert pg_temp.trues(public.my_account_marks()) = '{gasto}', 'um gasto: ' || public.my_account_marks()::text;
  perform public.create_record('nv-receb-01', ctx, acc, 'receita', 300000, '2026-11-05', 'Salário', 'Salário');
  assert pg_temp.trues(public.my_account_marks()) = '{gasto,recebimento}', 'gasto e recebimento';
  -- 4. Excluir o gasto não desfaz o marco (o nível nunca desce).
  perform public.delete_record('nv-excl-001', gasto.id, gasto.version);
  assert pg_temp.trues(public.my_account_marks()) = '{gasto,recebimento}', 'excluir não desfaz: ' || public.my_account_marks()::text;
  -- 5. Uma meta e um investimento.
  perform public.create_goal('nv-meta-001', ctx, 'objetivo', 'Viagem', 500000, '2027-06-01', 40000, null, null, null, null, null);
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
end $$;

-- 7. Cada pessoa só vê os seus marcos.
select pg_temp.as_(:rui);
do $$ begin
  assert pg_temp.trues(public.my_account_marks()) = '{}', 'o Rui não herda os marcos da Lia: ' || public.my_account_marks()::text;
end $$;
reset role;

rollback;
