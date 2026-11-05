-- Apagar de vez, depois de 6 meses, o que foi marcado como excluído (A7, migração 0025): o prazo mínimo, os itens velhos que saem, os
-- novos e os vivos que ficam, a conta a pagar que ainda tem registro (fica até o registro sair), o orçamento, a Família encerrada há mais
-- de 6 meses (apagada inteira) e os privilégios. Pessoa FICTÍCIA: Iara. Tudo em uma transação desfeita no fim.
\set ON_ERROR_STOP 1
\set iara '''00000000-0000-0000-0000-0000000000e1'''

begin;
set local clarevo.today = '2026-11-05';

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

create temp table ids (name text primary key, id uuid);
grant select, insert on ids to authenticated, anon, service_role;
create function pg_temp.id(p_name text) returns uuid language sql as $$ select id from ids where name = p_name $$;
-- Envelhecer o que foi excluído (como o dono do banco).
-- As guardas de atualização (deleted_at não muda depois de marcado) ficam de fora só aqui, para simular o tempo passando.
create function pg_temp.age(p_table text, p_name text, p_months int) returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  set local session_replication_role = replica;
  execute format('update public.%I set deleted_at = now() - make_interval(months => %s) where id = %L', p_table, p_months, pg_temp.id(p_name));
  set local session_replication_role = origin;
end $$;
create function pg_temp.exists_(p_table text, p_name text) returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v boolean;
begin
  execute format('select exists (select 1 from public.%I where id = %L)', p_table, pg_temp.id(p_name)) into v;
  return v;
end $$;

insert into ids values ('iara', :iara);
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values (:iara, 'iara.limpeza@exemplo.test', now(), '{"display_name":"Iara"}');

set role authenticated;
select set_config('request.jwt.claim.sub', :iara, true);
do $$
declare
  space jsonb;
  ctx uuid;
  acc uuid;
  r public.financial_records;
  c jsonb;
  b jsonb;
begin
  space := public.ensure_personal_space('Conta principal');
  ctx := (space ->> 'context_id')::uuid;
  select id into acc from public.financial_accounts where context_id = ctx and is_default;
  insert into ids values ('ctx', ctx), ('acc', acc);

  -- Registros: um velho excluído, um novo excluído e um vivo.
  r := public.create_record('lp-r-0001', ctx, acc, 'despesa', 1000, '2026-11-01', 'Velho', null, null);
  insert into ids values ('r_velho', r.id);
  perform public.delete_record('lp-r-0002', r.id, r.version);
  r := public.create_record('lp-r-0003', ctx, acc, 'despesa', 2000, '2026-11-01', 'Novo', null, null);
  insert into ids values ('r_novo', r.id);
  perform public.delete_record('lp-r-0004', r.id, r.version);
  r := public.create_record('lp-r-0005', ctx, acc, 'despesa', 3000, '2026-11-01', 'Vivo', null, null);
  insert into ids values ('r_vivo', r.id);

  -- Conta a pagar velha excluída, sem registro: sai.
  c := public.create_commitment('lp-c-0001', ctx, 5000, '2026-11-10', 'Conta velha');
  insert into ids values ('c_velha', (c #>> '{commitment,id}')::uuid);
  perform public.delete_commitment('lp-c-0002', (c #>> '{commitment,id}')::uuid, (c #>> '{commitment,version}')::int);

  -- Conta a pagar paga e depois excluída com o pagamento desfeito: o registro do pagamento (excluído agora) segura a conta.
  c := public.create_commitment('lp-c-0003', ctx, 7000, '2026-11-03', 'Conta com pagamento');
  insert into ids values ('c_paga', (c #>> '{commitment,id}')::uuid);
  c := public.pay_commitment('lp-c-0004', (c #>> '{commitment,id}')::uuid, (c #>> '{commitment,version}')::int, acc, 7000, '2026-11-03', null);
  c := public.undo_commitment_payment('lp-c-0005', pg_temp.id('c_paga'), (select version from public.commitments where id = pg_temp.id('c_paga')));
  perform public.delete_commitment('lp-c-0006', pg_temp.id('c_paga'), (select version from public.commitments where id = pg_temp.id('c_paga')));

  -- Orçamento velho excluído.
  b := public.set_category_budget('lp-b-0001', ctx, 'Mercado', '2026-11-01', 0, 50000);
  insert into ids values ('b_velho', (b ->> 'id')::uuid);
  perform public.delete_category_budget('lp-b-0002', (b ->> 'id')::uuid, (b ->> 'version')::int);

  -- Família encerrada.
  insert into ids values ('fam', (public.create_family('Família da Iara', 'lp-f-0001') #>> '{context,id}')::uuid);
  perform public.end_family(pg_temp.id('fam'), 'lp-f-0002');
end $$;
reset role;

-- O registro do pagamento desfeito da conta paga (excluído agora, no desfazer).
insert into ids select 'r_pagamento', r.id from public.financial_records r where r.commitment_id = (select id from ids where name = 'c_paga');

-- Envelhece: 7 meses para os velhos e para a conta paga; o registro do pagamento continua novo.
select pg_temp.age('financial_records', 'r_velho', 7);
select pg_temp.age('financial_records', 'r_novo', 2);
select pg_temp.age('commitments', 'c_velha', 7);
select pg_temp.age('commitments', 'c_paga', 7);
select pg_temp.age('category_budgets', 'b_velho', 7);
update public.financial_contexts set ended_at = now() - interval '7 months' where id = (select id from ids where name = 'fam');

-- ---------------------------------------------------------------------------
-- 1. Privilégios e prazo mínimo.
-- ---------------------------------------------------------------------------
do $$ begin
  assert not has_function_privilege('authenticated', 'public.clarevo_purge_deleted(timestamptz)', 'execute')
     and not has_function_privilege('anon', 'public.clarevo_purge_deleted(timestamptz)', 'execute')
     and not has_function_privilege('service_role', 'public.clarevo_purge_deleted(timestamptz)', 'execute'), 'ninguém de fora executa';
end $$;
select pg_temp.expect_code($q$select public.clarevo_purge_deleted(now() - interval '5 months')$q$, 'prazo_invalido', '22023');
select pg_temp.expect_code($q$select public.clarevo_purge_deleted(null)$q$, 'prazo_invalido', '22023');

-- ---------------------------------------------------------------------------
-- 2. A limpeza: sai o que é velho e nada usa; fica o novo, o vivo e o que ainda é usado.
-- ---------------------------------------------------------------------------
do $$
declare
  r jsonb;
begin
  r := public.clarevo_purge_deleted();
  assert (r ->> 'familias')::int = 1 and (r ->> 'registros')::int = 1 and (r ->> 'contas_a_pagar')::int = 1 and (r ->> 'orcamentos')::int = 1,
    'contagens: ' || r::text;
  assert not pg_temp.exists_('financial_records', 'r_velho'), 'o registro excluído há 7 meses saiu';
  assert pg_temp.exists_('financial_records', 'r_novo'), 'o excluído há 2 meses fica';
  assert pg_temp.exists_('financial_records', 'r_vivo'), 'o vivo fica';
  assert not pg_temp.exists_('commitments', 'c_velha'), 'a conta a pagar velha, sem registro, saiu';
  assert pg_temp.exists_('commitments', 'c_paga'), 'a conta com o registro do pagamento (ainda no prazo) fica';
  assert pg_temp.exists_('financial_records', 'r_pagamento'), 'e o registro do pagamento também';
  assert not pg_temp.exists_('category_budgets', 'b_velho'), 'o orçamento velho saiu';
  assert not pg_temp.exists_('financial_contexts', 'fam'), 'a Família encerrada há 7 meses foi apagada inteira';
  assert pg_temp.exists_('financial_contexts', 'ctx'), 'o Pessoal fica';
  -- Rodar de novo não apaga mais nada.
  r := public.clarevo_purge_deleted();
  assert (r ->> 'registros')::int = 0 and (r ->> 'contas_a_pagar')::int = 0 and (r ->> 'familias')::int = 0, 'nada mais a apagar: ' || r::text;
end $$;

-- Quando o registro do pagamento também passa do prazo, os dois saem juntos.
select pg_temp.age('financial_records', 'r_pagamento', 7);
do $$
declare
  r jsonb;
begin
  r := public.clarevo_purge_deleted();
  assert (r ->> 'registros')::int = 1 and (r ->> 'contas_a_pagar')::int = 1, 'o registro e depois a conta: ' || r::text;
  assert not pg_temp.exists_('commitments', 'c_paga') and not pg_temp.exists_('financial_records', 'r_pagamento'), 'saíram os dois';
  assert pg_temp.exists_('financial_records', 'r_vivo'), 'o vivo continua';
end $$;

rollback;
