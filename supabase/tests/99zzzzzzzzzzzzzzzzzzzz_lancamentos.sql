-- Gasto e recebimento ligados, subcategorias e troca de tipo (D-107; migração 20261117000002_lancamentos_vinculos.sql). Confere: as
-- colunas, as restrições, as assinaturas novas (as antigas saíram), os privilégios e as auxiliares fechadas; a subcategoria (criar,
-- editar, manter, tirar, recusas); o lançamento importado editado por inteiro (tipo, categoria, subcategoria, conta, data, valor e
-- descrição) e de volta; o tipo que não muda (conta a pagar e nota); o rendimento de investimento (criar, editar, desligar, ligar na
-- edição, trocar para gasto, excluir, recusas) sem contar duas vezes; ligar um gasto que já existe a uma conta a pagar e a uma fatura
-- (sem criar outro gasto, com repetição, recusas e o desfazer que mantém o gasto); o app antigo (chaves de antes); e o guarda.
-- Pessoa FICTÍCIA: Bia. Tudo em uma transação desfeita no fim.
\set ON_ERROR_STOP 1
\set bia '''00000000-0000-0000-0000-0000000000e7'''

begin;
set local clarevo.today = '2026-11-17';

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
create function pg_temp.id(p_name text) returns uuid language sql as $$ select current_setting('test.' || p_name)::uuid $$;
create function pg_temp.keep(p_name text, p_value text) returns void language sql as $$ select set_config('test.' || p_name, p_value, true) $$;
create function pg_temp.totals(p_month date) returns bigint[] language sql as $$
  select array[received_cents, paid_cents] from public.month_totals(pg_temp.id('ctx'), p_month)
$$;
-- Quantos registros vivos o contexto tem (sem a RLS).
create function pg_temp.live_records() returns bigint language sql security definer set search_path = public, pg_temp as $$
  select count(*) from public.financial_records where context_id = current_setting('test.ctx')::uuid and deleted_at is null
$$;
create function pg_temp.income(p_inv uuid) returns bigint language sql security definer set search_path = public, pg_temp as $$
  select income_cents from public.investment_items where id = p_inv
$$;
create function pg_temp.movement(p_id uuid) returns public.investment_movements language sql security definer set search_path = public, pg_temp as $$
  select * from public.investment_movements where id = p_id
$$;

-- ---------------------------------------------------------------------------
-- 1. Esquema: colunas, restrições, assinaturas e privilégios
-- ---------------------------------------------------------------------------
do $$ begin
  assert (select array_agg(column_name::text order by column_name) from information_schema.columns
           where table_schema = 'public' and table_name = 'financial_records'
             and column_name in ('subcategory', 'linked_payment', 'investment_id', 'investment_movement_id'))
       = array['investment_id', 'investment_movement_id', 'linked_payment', 'subcategory'], 'as quatro colunas novas';
  assert exists (select 1 from pg_constraint where conname = 'financial_records_subcategoria')
     and exists (select 1 from pg_constraint where conname = 'financial_records_vinculo_pagamento')
     and exists (select 1 from pg_constraint where conname = 'financial_records_investimento'), 'as restrições novas';
  assert pg_get_constraintdef((select oid from pg_constraint where conname = 'financial_records_import_key')) not like '%commitment_id%',
    'a importação já não exige gasto sem conta a pagar e sem fatura';
  assert (select confdeltype from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
           where c.conrelid = 'public.financial_records'::regclass and c.contype = 'f' and a.attname = 'investment_movement_id') = 'n',
    'o rendimento apagado pela ficha do investimento só desfaz a ligação';
  assert to_regprocedure('public.create_record(text, uuid, uuid, public.record_kind, bigint, date, text, text, text, boolean)') is null
     and to_regprocedure('public.update_record(text, uuid, integer, uuid, bigint, date, text, text, boolean)') is null
     and to_regprocedure('public.pay_commitment(text, uuid, integer, uuid, bigint, date, text)') is null
     and to_regprocedure('public.undo_commitment_payment(text, uuid, integer)') is null
     and to_regprocedure('public.pay_invoice(text, uuid, date, integer, bigint, date, uuid)') is null
     and to_regprocedure('public.undo_invoice_payment(text, uuid, date, integer)') is null, 'as assinaturas antigas saíram';
  assert has_function_privilege('authenticated', 'public.create_record(text, uuid, uuid, public.record_kind, bigint, date, text, text, text, boolean, text, uuid)', 'execute')
     and has_function_privilege('authenticated', 'public.update_record(text, uuid, integer, uuid, bigint, date, text, text, boolean, public.record_kind, text, uuid, boolean)', 'execute')
     and has_function_privilege('authenticated', 'public.pay_commitment(text, uuid, integer, uuid, bigint, date, text, uuid)', 'execute')
     and has_function_privilege('authenticated', 'public.undo_commitment_payment(text, uuid, integer, boolean)', 'execute')
     and has_function_privilege('authenticated', 'public.pay_invoice(text, uuid, date, integer, bigint, date, uuid, uuid)', 'execute')
     and has_function_privilege('authenticated', 'public.undo_invoice_payment(text, uuid, date, integer, boolean)', 'execute'), 'o app executa as seis';
  assert not has_function_privilege('anon', 'public.create_record(text, uuid, uuid, public.record_kind, bigint, date, text, text, text, boolean, text, uuid)', 'execute')
     and not has_function_privilege('anon', 'public.update_record(text, uuid, integer, uuid, bigint, date, text, text, boolean, public.record_kind, text, uuid, boolean)', 'execute')
     and not has_function_privilege('anon', 'public.pay_invoice(text, uuid, date, integer, bigint, date, uuid, uuid)', 'execute'), 'anon não';
  assert not has_function_privilege('authenticated', 'public.clarevo_check_subcategory(public.record_kind, text, text)', 'execute')
     and not has_function_privilege('authenticated', 'public.clarevo_income_investment(uuid, uuid)', 'execute'), 'auxiliares fechadas';
  assert (select prosecdef and provolatile = 'v' from pg_proc where oid = 'public.update_record(text, uuid, integer, uuid, bigint, date, text, text, boolean, public.record_kind, text, uuid, boolean)'::regprocedure),
    'update_record é definer e volátil';
  -- pay_invoice continua escolhendo a conta principal e travando a conta (A8, A9).
  assert (select prosrc from pg_proc where oid = 'public.pay_invoice(text, uuid, date, integer, bigint, date, uuid, uuid)'::regprocedure) like '%a.is_default desc%',
    'pay_invoice sem conta usa a principal';
end $$;

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
  values (:bia, 'bia@exemplo.test', now(), '{"display_name":"Bia"}');

set role authenticated;
select set_config('request.jwt.claim.sub', :bia, true);

-- ---------------------------------------------------------------------------
-- 2. Subcategoria
-- ---------------------------------------------------------------------------
do $$
declare
  space jsonb := public.ensure_personal_space('Conta principal');
  ctx uuid := (space ->> 'context_id')::uuid;
  acc uuid := (space #>> '{account,id}')::uuid;
  r public.financial_records;
  again public.financial_records;
begin
  perform pg_temp.keep('ctx', ctx::text);
  perform pg_temp.keep('acc', acc::text);
  perform pg_temp.keep('acc2', ((public.create_account('lc-acc-0002', ctx, 'Carteira', 'dinheiro')) ->> 'id'));
  r := public.create_record('lc-sub-0001', ctx, acc, 'despesa', 17052, '2026-11-10', 'Luz de novembro', 'Moradia', null, false, ' Conta de luz ');
  assert r.subcategory = 'Conta de luz' and r.category = 'Moradia', 'a subcategoria entra sem espaços nas pontas';
  again := public.create_record('lc-sub-0001', ctx, acc, 'despesa', 17052, '2026-11-10', 'Luz de novembro', 'Moradia', null, false, 'Conta de luz');
  assert again.id = r.id, 'repetição devolve o mesmo';
  perform pg_temp.expect_code(format('select public.create_record(%L, %L, %L, %L, %s, %L, %L, %L)', 'lc-sub-0001', ctx, acc, 'despesa', 17052, '2026-11-10', 'Luz de novembro', 'Moradia'),
                              'chave_reutilizada', 'PT409');
  perform pg_temp.expect_code(format('select public.create_record(%L, %L, %L, %L, %s, %L, %L, null, null, false, %L)', 'lc-sub-0002', ctx, acc, 'despesa', 100, '2026-11-10', 'Sem categoria', 'Luz'),
                              'subcategoria_invalida', '22023');
  perform pg_temp.expect_code(format('select public.create_record(%L, %L, %L, %L, %s, %L, %L, %L, null, false, %L)', 'lc-sub-0003', ctx, acc, 'receita', 100, '2026-11-10', 'Pix', 'Renda extra', 'Bico'),
                              'subcategoria_invalida', '22023');
  perform pg_temp.expect_code(format('select public.create_record(%L, %L, %L, %L, %s, %L, %L, %L, null, false, %L)', 'lc-sub-0004', ctx, acc, 'despesa', 100, '2026-11-10', 'Longa', 'Moradia', repeat('x', 31)),
                              'subcategoria_invalida', '22023');
  -- Editar: nulo (o app antigo) mantém com a mesma categoria; outra categoria tira; '' tira; um texto troca.
  r := public.update_record('lc-sub-0005', r.id, 1, acc, 17100, '2026-11-10', 'Luz de novembro', 'Moradia');
  assert r.subcategory = 'Conta de luz' and r.amount_cents = 17100, 'o app antigo mantém a subcategoria';
  r := public.update_record('lc-sub-0006', r.id, 2, acc, 17100, '2026-11-10', 'Luz de novembro', 'Moradia', null, null, 'Internet');
  assert r.subcategory = 'Internet', 'troca';
  r := public.update_record('lc-sub-0007', r.id, 3, acc, 17100, '2026-11-10', 'Luz de novembro', 'Mercado');
  assert r.subcategory is null and r.category = 'Mercado', 'outra categoria tira a subcategoria';
  r := public.update_record('lc-sub-0008', r.id, 4, acc, 17100, '2026-11-10', 'Luz de novembro', 'Moradia', null, null, 'Conta de luz');
  r := public.update_record('lc-sub-0009', r.id, 5, acc, 17100, '2026-11-10', 'Luz de novembro', 'Moradia', null, null, '');
  assert r.subcategory is null and r.version = 6, 'vazio tira';
  perform pg_temp.keep('luz', r.id::text);
end $$;

-- ---------------------------------------------------------------------------
-- 3. O lançamento importado editado por inteiro, de gasto para recebimento e de volta
-- ---------------------------------------------------------------------------
do $$
declare
  ctx uuid := pg_temp.id('ctx');
  acc uuid := pg_temp.id('acc');
  acc2 uuid := pg_temp.id('acc2');
  res jsonb;
  r public.financial_records;
  before bigint[];
begin
  res := public.import_records('lc-imp-0001', ctx, 'conta', acc, jsonb_build_array(
    jsonb_build_object('import_key', md5('lc-imp-1') || md5('lc-imp-1b'), 'kind', 'despesa', 'amount_cents', 1, 'occurred_on', '2026-11-16',
                       'description', 'ENTRADA REND PAGO APLIC AUT APR', 'category', null)));
  select * into r from public.financial_records where context_id = ctx and description = 'ENTRADA REND PAGO APLIC AUT APR' and deleted_at is null;
  assert r.import_key is not null and r.kind = 'despesa', 'importado como gasto';
  before := pg_temp.totals('2026-11-01');
  -- Tudo muda numa edição só: tipo, categoria, conta, data, valor e descrição.
  r := public.update_record('lc-imp-0002', r.id, r.version, acc2, 2, '2026-11-15', 'Rendimento da aplicação', 'Renda extra', null, 'receita');
  assert r.kind = 'receita' and r.category = 'Renda extra' and r.account_id = acc2 and r.occurred_on = '2026-11-15' and r.amount_cents = 2
     and r.description = 'Rendimento da aplicação' and r.import_key is not null, 'o importado vira recebimento, com tudo trocado';
  assert pg_temp.totals('2026-11-01') = array[before[1] + 2, before[2] - 1], 'sai de Pago e entra em Recebido';
  -- Um recebimento do fim do mês pode contar no mês seguinte; voltar para gasto tira a marca e põe a subcategoria.
  r := public.update_record('lc-imp-0003', r.id, r.version, acc2, 2, '2026-10-28', 'Rendimento da aplicação', 'Renda extra', true);
  assert r.next_month, 'mês seguinte no recebimento';
  perform pg_temp.expect_code(format('select public.update_record(%L, %L, %s, %L, 2, %L, %L, %L, true, %L)', 'lc-imp-0004', r.id, r.version, acc2, '2026-10-28', 'X', 'Moradia', 'despesa'),
                              'mes_seguinte_invalido', '22023');
  r := public.update_record('lc-imp-0005', r.id, r.version, acc, 1, '2026-11-16', 'Tarifa', 'Moradia', null, 'despesa', 'Condomínio');
  assert r.kind = 'despesa' and not r.next_month and r.subcategory = 'Condomínio', 'de volta a gasto, sem a marca, com subcategoria';
  -- Trocar para recebimento leva a subcategoria embora (só gasto tem).
  perform pg_temp.expect_code(format('select public.update_record(%L, %L, %s, %L, 1, %L, %L, %L, null, %L, %L)', 'lc-imp-0006', r.id, r.version, acc, '2026-11-16', 'X', 'Salário', 'receita', 'Condomínio'),
                              'subcategoria_invalida', '22023');
  r := public.update_record('lc-imp-0007', r.id, r.version, acc, 1, '2026-11-16', 'Tarifa', 'Salário', null, 'receita');
  assert r.subcategory is null and r.kind = 'receita', 'nulo com outra categoria tira';
  perform pg_temp.keep('imp', r.id::text);
end $$;

-- ---------------------------------------------------------------------------
-- 4. Rendimento de investimento: o recebimento grava o rendimento no investimento, sem contar duas vezes
-- ---------------------------------------------------------------------------
do $$
declare
  ctx uuid := pg_temp.id('ctx');
  acc uuid := pg_temp.id('acc');
  inv uuid;
  inv2 uuid;
  r public.financial_records;
  m public.investment_movements;
  mid uuid;
  before bigint[];
begin
  inv := ((public.create_investment('lc-inv-0001', ctx, 'Aplicação automática', 'renda_fixa', 100000, '2026-10-01')) #>> '{investment,id}')::uuid;
  inv2 := ((public.create_investment('lc-inv-0002', ctx, 'Previdência', 'previdencia', 50000, '2026-10-01')) #>> '{investment,id}')::uuid;
  perform pg_temp.keep('inv', inv::text);
  before := pg_temp.totals('2026-11-01');
  r := public.create_record('lc-inv-0003', ctx, acc, 'receita', 1250, '2026-11-05', 'Rendimento de outubro', 'Renda extra', null, false, null, inv);
  assert r.investment_id = inv and r.investment_movement_id is not null, 'o recebimento aponta para o rendimento';
  m := pg_temp.movement(r.investment_movement_id);
  assert m.kind = 'rendimento' and m.amount_cents = 1250 and m.occurred_on = '2026-11-05' and m.note = 'Rendimento de outubro' and m.investment_id = inv,
    'o rendimento recebido entrou no investimento com o valor, a data e a descrição';
  assert pg_temp.income(inv) = 1250, 'o investimento soma o rendimento';
  assert pg_temp.totals('2026-11-01') = array[before[1] + 1250, before[2]], 'Recebido conta o valor uma vez só';
  -- Editar o recebimento atualiza o rendimento; o app antigo (sem os parâmetros novos) mantém a ligação.
  r := public.update_record('lc-inv-0004', r.id, 1, acc, 1300, '2026-11-06', 'Rendimento de outubro', 'Renda extra');
  m := pg_temp.movement(r.investment_movement_id);
  assert r.investment_id = inv and m.amount_cents = 1300 and m.occurred_on = '2026-11-06' and m.version = 2, 'o rendimento acompanha';
  -- Desligar apaga o rendimento; ligar a outro investimento cria outro.
  mid := r.investment_movement_id;
  r := public.update_record('lc-inv-0005', r.id, 2, acc, 1300, '2026-11-06', 'Rendimento de outubro', 'Renda extra', null, null, null, null, false);
  assert r.investment_id is null and r.investment_movement_id is null and (pg_temp.movement(mid)).id is null and pg_temp.income(inv) = 0, 'desligado';
  r := public.update_record('lc-inv-0006', r.id, 3, acc, 1300, '2026-11-06', 'Rendimento de outubro', 'Renda extra', null, null, null, inv2, true);
  assert r.investment_id = inv2 and pg_temp.income(inv2) = 1300, 'ligado na edição';
  mid := r.investment_movement_id;
  r := public.update_record('lc-inv-0007', r.id, 4, acc, 1300, '2026-11-06', 'Rendimento de outubro', 'Renda extra', null, null, null, inv, true);
  assert r.investment_id = inv and (pg_temp.movement(mid)).id is null and pg_temp.income(inv2) = 0 and pg_temp.income(inv) = 1300, 'trocado de investimento';
  -- Trocar para gasto tira o rendimento.
  mid := r.investment_movement_id;
  r := public.update_record('lc-inv-0008', r.id, 5, acc, 1300, '2026-11-06', 'Rendimento de outubro', null, null, 'despesa');
  assert r.kind = 'despesa' and r.investment_id is null and (pg_temp.movement(mid)).id is null and pg_temp.income(inv) = 0, 'gasto não tem rendimento';
  -- Excluir o recebimento tira o rendimento.
  r := public.create_record('lc-inv-0009', ctx, acc, 'receita', 900, '2026-11-07', 'Dividendos', 'Renda extra', null, false, null, inv);
  mid := r.investment_movement_id;
  r := public.delete_record('lc-inv-0010', r.id, 1);
  assert (pg_temp.movement(mid)).id is null and pg_temp.income(inv) = 0, 'excluído junto';
  -- O rendimento apagado pela ficha só desfaz a ligação: a edição seguinte segue sem ele.
  r := public.create_record('lc-inv-0011', ctx, acc, 'receita', 800, '2026-11-08', 'Juros', 'Renda extra', null, false, null, inv);
  perform public.delete_investment_movement('lc-inv-0012', r.investment_movement_id, 1);
  r := public.update_record('lc-inv-0013', r.id, 1, acc, 850, '2026-11-08', 'Juros', 'Renda extra');
  assert r.investment_movement_id is null and r.investment_id is null and pg_temp.income(inv) = 0, 'sem o rendimento, sem a ligação';
  -- Recusas: gasto com investimento, investimento de outro jeito inválido, investimento encerrado.
  perform pg_temp.expect_code(format('select public.create_record(%L, %L, %L, %L, 100, %L, %L, null, null, false, null, %L)', 'lc-inv-0014', ctx, acc, 'despesa', '2026-11-08', 'X', inv),
                              'investimento_invalido', '22023');
  perform pg_temp.expect_code(format('select public.create_record(%L, %L, %L, %L, 100, %L, %L, null, null, false, null, %L)', 'lc-inv-0015', ctx, acc, 'receita', '2026-11-08', 'X', gen_random_uuid()),
                              'investimento_invalido', '22023');
  perform pg_temp.expect_code(format('select public.update_record(%L, %L, %s, %L, 850, %L, %L, %L, null, null, null, null, true)', 'lc-inv-0016', r.id, r.version, acc, '2026-11-08', 'Juros', 'Renda extra'),
                              'investimento_invalido', '22023');
  perform public.set_investment_status('lc-inv-0017', inv2, 1, 'encerrado');
  perform pg_temp.expect_code(format('select public.create_record(%L, %L, %L, %L, 100, %L, %L, null, null, false, null, %L)', 'lc-inv-0018', ctx, acc, 'receita', '2026-11-08', 'X', inv2),
                              'investimento_encerrado', 'PT409');
end $$;

-- ---------------------------------------------------------------------------
-- 5. Ligar um gasto que já existe a uma conta a pagar (sem criar outro gasto) e desligar mantendo o gasto
-- ---------------------------------------------------------------------------
do $$
declare
  ctx uuid := pg_temp.id('ctx');
  acc uuid := pg_temp.id('acc');
  cp jsonb;
  cid uuid;
  g public.financial_records;
  res jsonb;
  again jsonb;
  n bigint;
  before bigint[];
begin
  cp := public.create_commitment('lc-cp-0001', ctx, 26500, '2026-11-10', 'Acordo, parcela 18 de 21', 'Crédito e parcelas');
  cid := (cp #>> '{commitment,id}')::uuid;
  g := public.create_record('lc-cp-0002', ctx, acc, 'despesa', 26500, '2026-11-12', 'Pagamento do acordo', 'Crédito e parcelas');
  n := pg_temp.live_records();
  before := pg_temp.totals('2026-11-01');
  -- A tela manda o valor, a data e a conta que viu; outro valor é versão desatualizada.
  perform pg_temp.expect_code(format('select public.pay_commitment(%L, %L, 1, %L, 26000, %L, null, %L)', 'lc-cp-0003', cid, acc, '2026-11-12', g.id),
                              'versao_desatualizada', 'PT409');
  res := public.pay_commitment('lc-cp-0004', cid, 1, acc, 26500, '2026-11-12', null, g.id);
  assert res #>> '{commitment,status}' = 'quitado' and (res #>> '{record,id}')::uuid = g.id and (res #>> '{record,commitment_id}')::uuid = cid
     and (res #>> '{record,linked_payment}')::boolean and (res #>> '{record,description}') = 'Pagamento do acordo', 'o gasto virou o pagamento, com a descrição dele';
  assert pg_temp.live_records() = n and pg_temp.totals('2026-11-01') = before, 'nenhum gasto a mais: Pago não muda';
  assert (select paid_record_id from public.commitment_items where id = cid) = g.id, 'a conta lê o pagamento do gasto ligado';
  again := public.pay_commitment('lc-cp-0004', cid, 1, acc, 26500, '2026-11-12', null, g.id);
  assert again #>> '{record,id}' = g.id::text, 'repetição devolve o mesmo';
  -- O gasto ligado não troca de tipo; outra conta não liga o mesmo gasto; recebimento não paga conta.
  select * into g from public.financial_records where id = g.id;
  perform pg_temp.expect_code(format('select public.update_record(%L, %L, %s, %L, 26500, %L, %L, null, null, %L)', 'lc-cp-0005', g.id, g.version, acc, '2026-11-12', 'Pagamento do acordo', 'receita'),
                              'tipo_nao_muda', 'PT409');
  cp := public.create_commitment('lc-cp-0006', ctx, 26500, '2026-12-10', 'Acordo, parcela 19 de 21', 'Crédito e parcelas');
  perform pg_temp.expect_code(format('select public.pay_commitment(%L, %L, 1, %L, 26500, %L, null, %L)', 'lc-cp-0007', cp #>> '{commitment,id}', acc, '2026-11-12', g.id),
                              'registro_ja_ligado', 'PT409');
  perform pg_temp.expect_code(format('select public.pay_commitment(%L, %L, 1, %L, 1, %L, null, %L)', 'lc-cp-0008', cp #>> '{commitment,id}', acc, '2026-11-16', pg_temp.id('imp')),
                              'registro_invalido', '22023');
  -- Editar o gasto ligado continua valendo (a conta sobe de versão), com a subcategoria.
  g := public.update_record('lc-cp-0009', g.id, g.version, acc, 26500, '2026-11-12', 'Pagamento do acordo', 'Crédito e parcelas', null, null, 'Acordo de dívida');
  assert g.commitment_id = cid and g.subcategory = 'Acordo de dívida', 'editado e ainda ligado';
  -- "Nenhuma destas": desfazer mantendo o gasto. A conta volta para Ainda a pagar e o gasto continua em Pago.
  res := public.undo_commitment_payment('lc-cp-0010', cid, (select version from public.commitments where id = cid), true);
  assert res #>> '{commitment,status}' = 'aberto' and (res #>> '{record,deleted_at}') is null and (res #>> '{record,commitment_id}') is null
     and not (res #>> '{record,linked_payment}')::boolean, 'a conta reabre e o gasto fica';
  assert pg_temp.live_records() = n and pg_temp.totals('2026-11-01') = before, 'o gasto continua contando uma vez';
  -- Pagar pelo "Já paguei" de sempre e desfazer sem manter: o gasto criado sai, como antes.
  res := public.pay_commitment('lc-cp-0011', cid, (select version from public.commitments where id = cid), acc, 26500, '2026-11-12');
  assert (res #>> '{record,id}')::uuid <> g.id and not (res #>> '{record,linked_payment}')::boolean, 'o caminho de antes cria o gasto';
  res := public.undo_commitment_payment('lc-cp-0012', cid, (select version from public.commitments where id = cid));
  assert (res #>> '{record,deleted_at}') is not null, 'e o desfazer de antes o apaga';
  -- Excluir um gasto ligado reabre a conta (como sempre).
  res := public.pay_commitment('lc-cp-0013', cid, (select version from public.commitments where id = cid), acc, 26500, '2026-11-12', null, g.id);
  select * into g from public.financial_records where id = g.id;
  perform public.delete_record('lc-cp-0014', g.id, g.version);
  assert (select status from public.commitments where id = cid) = 'aberto', 'excluir o gasto ligado reabre a conta';
end $$;

-- ---------------------------------------------------------------------------
-- 6. Ligar um gasto que já existe à fatura de um cartão
-- ---------------------------------------------------------------------------
do $$
declare
  ctx uuid := pg_temp.id('ctx');
  acc uuid := pg_temp.id('acc');
  card uuid;
  ver integer;
  g public.financial_records;
  res jsonb;
  n bigint;
  before bigint[];
begin
  card := (public.create_card('lc-ct-0001', ctx, 'Cartão Exemplo', '1234', 3, 10, 500000) #>> '{card,id}')::uuid;
  -- Compras de 01 e 02/11 entram na fatura que fechou em 03/11 (vencimento em 10/11): hoje ela já fechou.
  perform public.add_card_purchase('lc-ct-0002', card, '2026-11-01', 100000, 1, 'Mercado do mês', 'Mercado', null);
  perform public.add_card_purchase('lc-ct-0003', card, '2026-11-02', 20000, 1, 'Farmácia', 'Saúde', null);
  ver := (select version from public.commitments where card_id = card and invoice_month = '2026-11-01');
  g := public.create_record('lc-ct-0004', ctx, acc, 'despesa', 100000, '2026-11-10', 'PAGAMENTO DE PIX QR CREDITO', 'Crédito e parcelas');
  n := pg_temp.live_records();
  before := pg_temp.totals('2026-11-01');
  perform pg_temp.expect_code(format('select public.pay_invoice(%L, %L, %L, %s, 99999, %L, null, %L)', 'lc-ct-0005', card, '2026-11-01', ver, '2026-11-10', g.id),
                              'versao_desatualizada', 'PT409');
  -- A fatura de dezembro ainda não fechou: não se liga.
  res := public.add_card_purchase('lc-ct-0006', card, '2026-11-10', 5000, 1, 'Livro', 'Educação', null);
  perform pg_temp.expect_code(format('select public.pay_invoice(%L, %L, %L, %s, 100000, %L, null, %L)', 'lc-ct-0007', card, '2026-12-01',
                                     (select version from public.commitments where card_id = card and invoice_month = '2026-12-01'), '2026-11-10', g.id),
                              'fatura_aberta', 'PT409');
  -- Pagamento parcial (R$ 1.000,00 de R$ 1.200,00): o gasto vira o pagamento e o resto vai para a fatura seguinte.
  res := public.pay_invoice('lc-ct-0008', card, '2026-11-01', ver, 100000, '2026-11-10', null, g.id);
  assert (res #>> '{record,id}')::uuid = g.id and (res #>> '{record,card_id}')::uuid = card and res #>> '{record,invoice_month}' = '2026-11-01'
     and (res #>> '{record,linked_payment}')::boolean and res #>> '{commitment,status}' = 'quitado' and res #>> '{record,description}' = 'PAGAMENTO DE PIX QR CREDITO',
    'o gasto virou o pagamento da fatura, com a descrição dele';
  assert pg_temp.live_records() = n and pg_temp.totals('2026-11-01') = before, 'nenhum gasto a mais: a fatura não conta duas vezes';
  assert exists (select 1 from public.card_entries where card_id = card and kind = 'saldo_anterior' and amount_cents = 20000 and payment_record_id = g.id and deleted_at is null),
    'o saldo anterior foi para a fatura seguinte';
  -- O gasto da fatura não muda o valor nem o tipo por update_record; excluir é pelo caminho da fatura.
  perform pg_temp.expect_code(format('select public.update_record(%L, %L, %s, %L, 99000, %L, %L, %L)', 'lc-ct-0009', g.id, g.version + 1, acc, '2026-11-10', 'PAGAMENTO DE PIX QR CREDITO', 'Crédito e parcelas'),
                              'pagamento_de_fatura', 'PT409');
  -- Desligar mantendo o gasto: a fatura reabre, o saldo anterior sai e o gasto continua em Pago.
  res := public.undo_invoice_payment('lc-ct-0010', card, '2026-11-01', (select version from public.commitments where card_id = card and invoice_month = '2026-11-01'), true);
  assert res #>> '{commitment,status}' = 'aberto' and (res #>> '{record,deleted_at}') is null and (res #>> '{record,card_id}') is null
     and (res #>> '{record,commitment_id}') is null and not (res #>> '{record,linked_payment}')::boolean, 'a fatura reabre e o gasto fica';
  assert not exists (select 1 from public.card_entries where payment_record_id = g.id and deleted_at is null), 'o saldo anterior saiu';
  assert pg_temp.live_records() = n and pg_temp.totals('2026-11-01') = before, 'Pago igual';
  -- Um gasto com nota fiscal não vira pagamento de fatura.
  g := public.create_record('lc-ct-0011', ctx, acc, 'despesa', 100, '2026-11-10', 'Nota', 'Mercado', repeat('a', 64));
  perform pg_temp.expect_code(format('select public.pay_invoice(%L, %L, %L, %s, 100, %L, null, %L)', 'lc-ct-0012', card, '2026-11-01',
                                     (select version from public.commitments where card_id = card and invoice_month = '2026-11-01'), '2026-11-10', g.id),
                              'registro_invalido', '22023');
  perform pg_temp.expect_code(format('select public.update_record(%L, %L, %s, %L, 100, %L, %L, %L, null, %L)', 'lc-ct-0013', g.id, g.version, acc, '2026-11-10', 'Nota', 'Salário', 'receita'),
                              'tipo_nao_muda', 'PT409');
end $$;

-- ---------------------------------------------------------------------------
-- 7. O guarda: fora das funções, tipo e vínculo não mudam; a subcategoria só com categoria
-- ---------------------------------------------------------------------------
reset role;
do $$ begin
  perform pg_temp.expect_code(format('update public.financial_records set kind = %L where id = %L', 'despesa', pg_temp.id('imp')), 'campo_imutavel', '42501');
  perform pg_temp.expect_code(format('update public.financial_records set commitment_id = gen_random_uuid() where id = %L', pg_temp.id('imp')), 'campo_imutavel', '42501');
  begin
    update public.financial_records set subcategory = 'Conta de luz', category = null where id = pg_temp.id('luz');
    raise exception 'subcategoria sem categoria passou';
  exception when check_violation then
    null;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 8. DESFAZER pela conversa (revisão de 17/11/2026): um gasto anotado pelo Telegram que virou, no app, o pagamento de uma fatura
--    (pay_invoice com p_record_id) não é apagado; a conversa recebe o resultado próprio 'pagamento_de_fatura' (antes, delete_record
--    recusava com pagamento_de_fatura, fora do case, e a função falhava). Desligado da fatura no app, o DESFAZER volta a valer.
-- ---------------------------------------------------------------------------
create function pg_temp.th(p_user text) returns text language sql as $$ select encode(sha256(convert_to('telegram:' || p_user, 'UTF8')), 'hex') $$;
create function pg_temp.tm(p_user text, p_n int) returns text language sql as $$
  select 'telegram:' || encode(sha256(convert_to(p_user || ':' || p_n, 'UTF8')), 'hex')
$$;
create function pg_temp.as_service() returns void language sql as $$
  select set_config('request.jwt.claim.sub', '', true);
  select set_config('request.jwt.claims', '{"role":"service_role"}', true);
$$;
create function pg_temp.as_bia() returns void language sql as $$
  select set_config('request.jwt.claims', '', true);
  select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e7', true);
$$;
-- Leituras direto nas tabelas (sem a RLS).
create function pg_temp.chat_msg(p_id text) returns public.chat_messages language sql security definer set search_path = public, pg_temp as $$
  select m from public.chat_messages m where m.message_id = p_id
$$;
create function pg_temp.rec(p_id uuid) returns public.financial_records language sql security definer set search_path = public, pg_temp as $$
  select * from public.financial_records where id = p_id
$$;
create function pg_temp.bill_status(p_card uuid, p_month date) returns text language sql security definer set search_path = public, pg_temp as $$
  select status::text from public.commitments where card_id = p_card and invoice_month = p_month and deleted_at is null
$$;

do $$ begin
  assert (select pg_get_constraintdef(oid) from pg_constraint where conname = 'chat_messages_outcome_check') like '%pagamento_de_fatura%',
    'chat_messages aceita o resultado novo';
  assert pg_get_functiondef('public.clarevo_chat_undo(text, text, text, timestamptz)'::regprocedure) like '%when ''pagamento_de_fatura'' then ''pagamento_de_fatura''%',
    'clarevo_chat_undo conhece pagamento_de_fatura';
  assert not has_function_privilege('authenticated', 'public.clarevo_chat_undo(text, text, text, timestamptz)', 'execute')
     and not has_function_privilege('anon', 'public.clarevo_chat_undo(text, text, text, timestamptz)', 'execute')
     and not has_function_privilege('service_role', 'public.clarevo_chat_undo(text, text, text, timestamptz)', 'execute'),
    'clarevo_chat_undo continua interna (ninguém de fora executa)';
  assert has_function_privilege('service_role', 'public.telegram_undo(text, text, timestamptz)', 'execute')
     and has_function_privilege('service_role', 'public.whatsapp_undo(text, text, timestamptz)', 'execute')
     and not has_function_privilege('authenticated', 'public.telegram_undo(text, text, timestamptz)', 'execute'), 'as do servidor, só service_role';
end $$;

set role authenticated;
select pg_temp.as_bia();
do $$ begin
  perform pg_temp.keep('tgcode', public.create_telegram_code(pg_temp.id('ctx'), 'lc-tg-0001') ->> 'code');
end $$;
reset role;
set role service_role;
select pg_temp.as_service();
do $$
declare
  r jsonb;
begin
  assert public.telegram_link(pg_temp.tm('bia', 1), pg_temp.th('bia'), current_setting('test.tgcode')) ->> 'result' = 'ligado', 'Bia liga o Telegram';
  r := public.telegram_add_record(pg_temp.tm('bia', 2), pg_temp.th('bia'), now(), 'despesa', 3000, 0, null, 'Fatura do cartão', null);
  assert r ->> 'result' = 'anotado', 'gasto anotado pelo Telegram: ' || r::text;
  perform pg_temp.keep('tgrec', (pg_temp.chat_msg(pg_temp.tm('bia', 2))).record_id::text);
end $$;
reset role;

-- No app, o gasto vira o pagamento de uma fatura fechada.
set role authenticated;
select pg_temp.as_bia();
do $$
declare
  card uuid;
  res jsonb;
begin
  card := (public.create_card('lc-tg-0002', pg_temp.id('ctx'), 'Cartão Conversa', '5678', 3, 10, 500000) #>> '{card,id}')::uuid;
  perform pg_temp.keep('tgcard', card::text);
  perform public.add_card_purchase('lc-tg-0003', card, '2026-11-01', 3000, 1, 'Livro', 'Educação', null);
  res := public.pay_invoice('lc-tg-0004', card, '2026-11-01', (select version from public.commitments where card_id = card and invoice_month = '2026-11-01'),
                            3000, '2026-11-17', null, pg_temp.id('tgrec'));
  assert (res #>> '{record,id}')::uuid = pg_temp.id('tgrec') and (res #>> '{record,card_id}')::uuid = card and res #>> '{commitment,status}' = 'quitado',
    'o gasto do Telegram virou o pagamento da fatura: ' || res::text;
end $$;
reset role;

-- DESFAZER pelo Telegram: resposta própria, nada apagado, a mensagem anotada não é marcada como desfeita.
set role service_role;
select pg_temp.as_service();
do $$
declare
  r jsonb;
begin
  r := public.telegram_undo(pg_temp.tm('bia', 3), pg_temp.th('bia'), now());
  assert r = '{"result": "pagamento_de_fatura"}', 'resposta própria para o gasto que virou pagamento de fatura: ' || r::text;
  assert (pg_temp.rec(pg_temp.id('tgrec'))).deleted_at is null and (pg_temp.rec(pg_temp.id('tgrec'))).card_id = pg_temp.id('tgcard'),
    'o gasto continua, como pagamento da fatura';
  assert pg_temp.bill_status(pg_temp.id('tgcard'), '2026-11-01') = 'quitado', 'a fatura continua paga';
  assert (pg_temp.chat_msg(pg_temp.tm('bia', 2))).undone_at is null, 'a anotação não foi marcada como desfeita';
  assert (pg_temp.chat_msg(pg_temp.tm('bia', 3))).outcome = 'pagamento_de_fatura', 'a mensagem do DESFAZER fica registrada com o resultado';
  -- A mesma entrega de novo: repetida.
  assert public.telegram_undo(pg_temp.tm('bia', 3), pg_temp.th('bia'), now()) = '{"result": "repetida"}', 'repetida';
end $$;
reset role;

-- Desligado da fatura no app (o gasto fica), o DESFAZER pelo Telegram apaga o gasto como antes.
set role authenticated;
select pg_temp.as_bia();
do $$
declare
  card uuid := pg_temp.id('tgcard');
begin
  perform public.undo_invoice_payment('lc-tg-0005', card, '2026-11-01', (select version from public.commitments where card_id = card and invoice_month = '2026-11-01'), true);
end $$;
reset role;
set role service_role;
select pg_temp.as_service();
do $$
declare
  r jsonb;
begin
  r := public.telegram_undo(pg_temp.tm('bia', 4), pg_temp.th('bia'), now());
  assert r ->> 'result' = 'desfeito' and r #>> '{record,description}' = 'Fatura do cartão', 'desligado da fatura, desfaz: ' || r::text;
  assert (pg_temp.rec(pg_temp.id('tgrec'))).deleted_at is not null and (pg_temp.chat_msg(pg_temp.tm('bia', 2))).undone_at is not null, 'o gasto saiu';
end $$;
reset role;

rollback;
