-- Contas a pagar: cadastro, pagamento atômico, desfazer, "Ainda a pagar", vínculos garantidos e privilégios (D-020, D-021).
-- Pessoa FICTÍCIA: Ana. Hoje = 07/10/2026.
\set ON_ERROR_STOP 1
\set ana '''00000000-0000-0000-0000-0000000000a3'''

begin;
set local clarevo.today = '2026-10-07';

-- Executa um comando e exige um erro cuja mensagem combine com o padrão (LIKE).
create function pg_temp.expect_error(p_sql text, p_pattern text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm like p_pattern then return; end if;
    raise exception 'esperado "%", veio "%" (%) em: %', p_pattern, sqlerrm, sqlstate, p_sql;
  end;
  raise exception 'esperado erro "%", mas passou: %', p_pattern, p_sql;
end $$;

create temp table ids (name text primary key, id uuid);
grant select, insert on ids to authenticated;
create function pg_temp.id(p_name text) returns uuid language sql as $$ select id from ids where name = p_name $$;

-- Confere agora as restrições adiadas (invariante I1). Sem isso, o rollback final nunca as dispararia.
create function pg_temp.check_links() returns void language plpgsql as $$
begin
  set constraints all immediate;
  set constraints all deferred;
end $$;

-- Contexto pessoal da Ana: {recebido, pago, diferença} e {vencimento no mês, vencidas antes do mês, a pagar, quantidade}.
create function pg_temp.totals(p_month date) returns bigint[] language sql as $$
  select array[received_cents, paid_cents, difference_cents] from public.month_totals(pg_temp.id('ctx'), p_month)
$$;
create function pg_temp.to_pay(p_month date) returns bigint[] language sql as $$
  select array[due_in_month_cents, overdue_before_cents, to_pay_cents, open_count] from public.month_to_pay(pg_temp.id('ctx'), p_month)
$$;

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
  values (:ana, 'ana@exemplo.test', now(), '{"display_name":"Ana"}');

set role authenticated;
select set_config('request.jwt.claim.sub', :ana, true);

-- 1. Conta nova nunca recebe contas a pagar de exemplo.
do $$
declare
  space jsonb := public.ensure_personal_space('Conta principal');
begin
  insert into ids values ('ctx', (space ->> 'context_id')::uuid), ('acc', (space #>> '{account,id}')::uuid);
  assert (select count(*) from public.commitments) = 0, 'conta nova sem contas a pagar';
  assert (select count(*) from public.commitment_items) = 0, 'conta nova sem contas a pagar na visão';
  assert pg_temp.to_pay('2026-10-01') = array[0, 0, 0, 0]::bigint[], 'conta nova: nada a pagar';
end $$;

-- 2. Base de aceite: R$ 6.000 recebidos, R$ 3.900 pagos, R$ 650 a pagar em outubro; Seguro do carro vence em novembro.
do $$
declare
  ctx uuid := pg_temp.id('ctx');
  acc uuid := pg_temp.id('acc');
  res jsonb;
begin
  perform public.create_record('base-000001', ctx, acc, 'receita', 600000, '2026-10-01', 'Salário');
  perform public.create_record('base-000002', ctx, acc, 'despesa', 250000, '2026-10-05', 'Aluguel');
  perform public.create_record('base-000003', ctx, acc, 'despesa', 140000, '2026-10-06', 'Mercado');

  res := public.create_commitment('cp-base-0001', ctx, 15000, '2026-10-15', 'Internet', 'Moradia');
  assert (res #>> '{commitment,version}')::int = 1 and res #>> '{commitment,status}' = 'aberto'
     and (res #>> '{commitment,created_by}')::uuid = auth.uid() and res #>> '{commitment,paid_record_id}' is null
     and res -> 'record' = 'null'::jsonb, 'nova conta a pagar: versão 1, em aberto, autoria da sessão, sem pagamento';
  assert (res #>> '{commitment,amount_cents}')::bigint = 15000 and res #>> '{commitment,due_on}' = '2026-10-15'
     and res #>> '{commitment,category}' = 'Moradia' and res #>> '{commitment,currency}' = 'BRL'
     and res #>> '{commitment,deleted_at}' is null, 'campos gravados como enviados';
  insert into ids values ('internet', (res #>> '{commitment,id}')::uuid);
  res := public.create_commitment('cp-base-0002', ctx, 50000, '2026-10-20', 'Condomínio', 'Moradia');
  insert into ids values ('condominio', (res #>> '{commitment,id}')::uuid);
  res := public.create_commitment('cp-base-0003', ctx, 30000, '2026-11-10', 'Seguro do carro', 'Transporte');
  insert into ids values ('seguro', (res #>> '{commitment,id}')::uuid);
  perform pg_temp.check_links();

  assert (select (action, record_id is null, commitment_id) from public.record_operations where idempotency_key = 'cp-base-0001')
    = ('criar_compromisso'::text, true, pg_temp.id('internet')), 'operação criar_compromisso sem registro';
  assert pg_temp.totals('2026-10-01') = array[600000, 390000, 210000]::bigint[], 'base 6000/3900/2100';
  assert pg_temp.to_pay('2026-10-01') = array[65000, 0, 65000, 2]::bigint[], 'outubro: 650 a pagar';
  assert pg_temp.to_pay('2026-11-01') = array[30000, 0, 30000, 1]::bigint[], 'novembro: só o Seguro do carro';
end $$;

-- 3. Idempotência: mesma chave e conteúdo devolve a mesma conta; outro conteúdo ou outra ação é recusado.
do $$
declare
  ctx uuid := pg_temp.id('ctx');
  acc uuid := pg_temp.id('acc');
  res jsonb;
begin
  res := public.create_commitment('cp-base-0001', ctx, 15000, '2026-10-15', E'\t Internet \n', E' Moradia\t');
  assert (res #>> '{commitment,id}')::uuid = pg_temp.id('internet'), 'repetição devolve a mesma conta a pagar';
  assert (select count(*) from public.commitments where description = 'Internet') = 1, 'uma única Internet';
  perform pg_temp.expect_error(format($f$select public.create_commitment('cp-base-0001', %L, 15001, '2026-10-15', 'Internet', 'Moradia')$f$,
    ctx), 'chave_reutilizada');
  -- Mesmo espaço de chaves das operações de registro, nos dois sentidos.
  perform pg_temp.expect_error(format($f$select public.create_commitment('base-000001', %L, 15000, '2026-10-15', 'Internet', 'Moradia')$f$,
    ctx), 'chave_reutilizada');
  perform pg_temp.expect_error(format($f$select public.create_record('cp-base-0001', %L, %L, 'despesa', 15000, '2026-10-07', 'Internet')$f$,
    ctx, acc), 'chave_reutilizada');
  perform pg_temp.expect_error(format($f$select public.create_commitment('curta', %L, 100, '2026-10-15', 'x')$f$, ctx), 'chave_invalida');
  perform pg_temp.expect_error(format($f$select public.create_commitment(null, %L, 100, '2026-10-15', 'x')$f$, ctx), 'chave_invalida');
  assert (select count(*) from public.commitments) = 3, 'nenhuma conta a pagar nova';
end $$;

-- 3b. Hash sem ambiguidade: um '|' na descrição ou na categoria não faz um pedido diferente parecer repetição
-- (com campos unidos por '|', 'Luz|Casa' + 'Moradia' e 'Luz' + 'Casa|Moradia' dariam o mesmo hash).
-- A data entra em ISO no hash, qualquer que seja o DateStyle da sessão.
do $$
declare
  ctx uuid := pg_temp.id('ctx');
  v_datestyle text := current_setting('datestyle');
  res jsonb;
  again jsonb;
  luz uuid;
begin
  res := public.create_commitment('cp-hash-0001', ctx, 100, '2026-10-15', 'Luz|Casa', 'Moradia');
  luz := (res #>> '{commitment,id}')::uuid;
  perform pg_temp.expect_error(format($f$select public.create_commitment('cp-hash-0001', %L, 100, '2026-10-15', 'Luz', 'Casa|Moradia')$f$,
    ctx), 'chave_reutilizada');
  again := public.create_commitment('cp-hash-0001', ctx, 100, '2026-10-15', 'Luz|Casa', 'Moradia');
  assert (again #>> '{commitment,id}')::uuid = luz, 'repetição exata continua devolvendo a mesma conta a pagar';

  res := public.update_commitment('cp-hash-0002', luz, 1, 100, '2026-10-15', 'Luz|Conta', 'Moradia');
  assert (res #>> '{commitment,version}')::int = 2, 'edição com | gravada';
  perform pg_temp.expect_error(format($f$select public.update_commitment('cp-hash-0002', %L, 1, 100, '2026-10-15', 'Luz', 'Conta|Moradia')$f$,
    luz), 'chave_reutilizada');
  assert (select (description, category, version) from public.commitments where id = luz) = ('Luz|Conta'::text, 'Moradia'::text, 2),
    'pedido diferente com a mesma chave não altera nada';

  perform set_config('datestyle', 'SQL, DMY', true);
  res := public.create_commitment('cp-base-0001', ctx, 15000, '2026-10-15', 'Internet', 'Moradia');
  assert (res #>> '{commitment,id}')::uuid = pg_temp.id('internet'), 'repetição com outro DateStyle devolve a mesma conta a pagar';
  perform set_config('datestyle', v_datestyle, true);

  perform public.delete_commitment('cp-hash-0003', luz, 2);
  perform pg_temp.check_links();
  assert (select count(*) from public.commitments) = 3, 'só as 3 contas a pagar da base';
end $$;

-- 4. Validação no banco (mesmos códigos e mesma ordem do app). Vencimento: de 1 ano antes a 2 anos depois de hoje.
do $$
declare
  ctx uuid := pg_temp.id('ctx');
  cases text[][] := array[
    array['0', '2026-10-15', 'Água', null, 'valor_invalido'],
    array['1000000000', '2026-10-15', 'Água', null, 'valor_acima_do_limite'],
    array['100', '2026-10-15', '   ', null, 'descricao_obrigatoria'],
    array['100', '2026-10-15', E'\t \n', null, 'descricao_obrigatoria'],
    array['100', '2026-10-15', repeat('x', 81), null, 'descricao_longa'],
    array['100', '2026-10-15', 'Água', repeat('c', 41), 'categoria_invalida'],
    array['100', null, 'Água', null, 'data_invalida'],
    array['100', '2025-10-06', 'Água', null, 'vencimento_fora_do_intervalo'],
    array['100', '2028-10-08', 'Água', null, 'vencimento_fora_do_intervalo']
  ];
  accepted text[] := array['2025-10-07', '2028-10-07'];
  i int;
  res jsonb;
begin
  for i in 1 .. array_length(cases, 1) loop
    perform pg_temp.expect_error(format('select public.create_commitment(%L, %L, %s, %L::date, %L, %L)',
      'cp-vali-' || lpad(i::text, 4, '0'), ctx, cases[i][1], cases[i][2], cases[i][3], cases[i][4]), cases[i][5]);
  end loop;
  assert (select count(*) from public.record_operations where idempotency_key like 'cp-vali-%') = 0, 'recusas não gravam operação';

  -- Limites aceitos (e excluídos em seguida); 80 caracteres contados como caracteres (emoji conta 1).
  for i in 1 .. array_length(accepted, 1) loop
    res := public.create_commitment('cp-vali-01' || lpad(i::text, 2, '0'), ctx, 100, accepted[i]::date, 'Limite');
    perform public.delete_commitment('cp-vali-02' || lpad(i::text, 2, '0'), (res #>> '{commitment,id}')::uuid, 1);
  end loop;
  res := public.create_commitment('cp-vali-0103', ctx, 100, '2026-10-15', repeat('🧾', 80));
  perform public.delete_commitment('cp-vali-0203', (res #>> '{commitment,id}')::uuid, 1);

  -- 29/02: a janela limita o dia ao fim do mês, como no core.
  set local clarevo.today = '2028-02-29';
  res := public.create_commitment('cp-vali-0301', ctx, 100, '2027-02-28', 'Limite');
  insert into ids values ('limite1', (res #>> '{commitment,id}')::uuid);
  res := public.create_commitment('cp-vali-0302', ctx, 100, '2030-02-28', 'Limite');
  insert into ids values ('limite2', (res #>> '{commitment,id}')::uuid);
  perform pg_temp.expect_error(format($f$select public.create_commitment('cp-vali-0303', %L, 100, '2027-02-27', 'Limite')$f$, ctx),
    'vencimento_fora_do_intervalo');
  perform pg_temp.expect_error(format($f$select public.create_commitment('cp-vali-0304', %L, 100, '2030-03-01', 'Limite')$f$, ctx),
    'vencimento_fora_do_intervalo');
  set local clarevo.today = '2026-10-07';
  perform public.delete_commitment('cp-vali-0305', pg_temp.id('limite1'), 1);
  perform public.delete_commitment('cp-vali-0306', pg_temp.id('limite2'), 1);
  perform pg_temp.check_links();
  assert pg_temp.to_pay('2026-10-01') = array[65000, 0, 65000, 2]::bigint[], 'validação não deixou resto em outubro';
end $$;

-- 5. Sequência de aceite (D-021): vencida no mês e vencida de setembro entram em "Ainda a pagar neste mês".
do $$
declare
  ctx uuid := pg_temp.id('ctx');
  res jsonb;
begin
  res := public.create_commitment('cp-seq-0001', ctx, 9000, '2026-10-05', 'Água', 'Moradia');
  insert into ids values ('agua', (res #>> '{commitment,id}')::uuid);
  perform pg_temp.check_links();
  assert pg_temp.to_pay('2026-10-01') = array[74000, 0, 74000, 3]::bigint[], 'anotar Água vencida em 05/10: 740';
  res := public.create_commitment('cp-seq-0002', ctx, 4000, '2026-09-28', 'Gás');
  insert into ids values ('gas', (res #>> '{commitment,id}')::uuid);
  perform pg_temp.check_links();
  assert pg_temp.to_pay('2026-10-01') = array[74000, 4000, 78000, 4]::bigint[], 'anotar Gás vencido em 28/09: 780, inclui 40 de setembro';
  assert pg_temp.to_pay('2026-09-01') = array[4000, 0, 4000, 1]::bigint[], 'setembro: previsto 40';
  assert pg_temp.totals('2026-10-01') = array[600000, 390000, 210000]::bigint[], 'contas a pagar não entram em Recebido, Pago ou Diferença';
end $$;

-- 6. Marcar como paga: um único gasto realizado com o valor e a data pagos; a conta a pagar fica quitada.
do $$
declare
  acc uuid := pg_temp.id('acc');
  internet uuid := pg_temp.id('internet');
  res jsonb;
  r public.financial_records;
  ci public.commitment_items;
begin
  res := public.pay_commitment('cp-pay-0001', internet, 1, acc, 15500, '2026-10-07', 'Moradia');
  r := jsonb_populate_record(null::public.financial_records, res -> 'record');
  assert r.kind = 'despesa' and r.commitment_id = internet and r.description = 'Internet' and r.category = 'Moradia'
     and r.amount_cents = 15500 and r.occurred_on = '2026-10-07' and r.account_id = acc and r.version = 1
     and r.created_by = auth.uid() and r.deleted_at is null, 'gasto gerado com valor e data pagos';
  assert res #>> '{commitment,status}' = 'quitado' and (res #>> '{commitment,version}')::int = 2
     and (res #>> '{commitment,paid_record_id}')::uuid = r.id, 'conta quitada, versão 2, com o pagamento';
  insert into ids values ('gasto1', r.id);
  perform pg_temp.check_links();

  select * into ci from public.commitment_items where id = internet;
  assert ci.status = 'quitado' and ci.version = 2 and ci.paid_record_id = r.id and ci.paid_amount_cents = 15500
     and ci.paid_on = '2026-10-07' and ci.paid_account_id = acc and ci.amount_cents = 15000,
     'visão: pagamento lido do gasto vivo; previsto não muda';
  assert pg_temp.totals('2026-10-01') = array[600000, 405500, 194500]::bigint[], 'pagar 155: 6000/4055/1945';
  assert pg_temp.to_pay('2026-10-01') = array[59000, 4000, 63000, 3]::bigint[], 'pagar Internet: a pagar 630';
  assert (select (action, record_id, commitment_id) from public.record_operations where idempotency_key = 'cp-pay-0001')
    = ('pagar_compromisso'::text, r.id, internet), 'operação pagar_compromisso com registro e conta a pagar';
end $$;

-- 7. Repetir o pagamento (mesma chave) não cria outro gasto; outra tentativa é recusada pela versão ou pela situação.
do $$
declare
  acc uuid := pg_temp.id('acc');
  internet uuid := pg_temp.id('internet');
  res jsonb;
  v_detail text;
begin
  res := public.pay_commitment('cp-pay-0001', internet, 1, acc, 15500, '2026-10-07', 'Moradia');
  assert (res #>> '{record,id}')::uuid = pg_temp.id('gasto1'), 'repetição devolve o mesmo gasto';
  assert (select count(*) from public.financial_records where commitment_id = internet) = 1, 'um único gasto vivo vinculado';
  assert pg_temp.totals('2026-10-01') = array[600000, 405500, 194500]::bigint[], 'repetição não muda os totais';
  perform pg_temp.expect_error(format($f$select public.pay_commitment('cp-pay-0001', %L, 1, %L, 15600, '2026-10-07', 'Moradia')$f$,
    internet, acc), 'chave_reutilizada');
  begin
    perform public.pay_commitment('cp-pay-0101', internet, 1, acc, 15500, '2026-10-07');
    raise exception 'FALHA: pagou com versão antiga';
  exception when others then
    get stacked diagnostics v_detail = pg_exception_detail;
    assert sqlerrm = 'versao_desatualizada' and sqlstate = 'PT409' and v_detail = 'versao_atual=2',
      sqlerrm || ' / ' || coalesce(v_detail, '');
  end;
  perform pg_temp.expect_error(format($f$select public.pay_commitment('cp-pay-0102', %L, 2, %L, 15500, '2026-10-07')$f$,
    internet, acc), 'compromisso_quitado');
  perform pg_temp.expect_error(format($f$select public.pay_commitment('cp-pay-0103', %L, null, %L, 15500, '2026-10-07')$f$,
    internet, acc), 'versao_desatualizada');
  assert (select count(*) from public.financial_records where commitment_id = internet) = 1, 'continua um único gasto vivo';
end $$;

-- 8. Conta paga não é editada nem excluída sem antes desfazer o pagamento. Versão ausente é recusada.
do $$
declare
  internet uuid := pg_temp.id('internet');
begin
  perform pg_temp.expect_error(format($f$select public.update_commitment('cp-edit-0101', %L, 2, 15000, '2026-10-15', 'Internet', 'Moradia')$f$,
    internet), 'compromisso_quitado');
  perform pg_temp.expect_error(format($f$select public.delete_commitment('cp-excl-0101', %L, 2)$f$, internet), 'compromisso_quitado');
  perform pg_temp.expect_error(format($f$select public.update_commitment('cp-edit-0102', %L, null, 15000, '2026-10-15', 'Internet', 'Moradia')$f$,
    internet), 'versao_desatualizada');
  perform pg_temp.expect_error(format($f$select public.delete_commitment('cp-excl-0102', %L, null)$f$, internet), 'versao_desatualizada');
  perform pg_temp.expect_error(format($f$select public.undo_commitment_payment('cp-undo-0102', %L, null)$f$, internet), 'versao_desatualizada');
  assert (select (status, version) from public.commitment_items where id = internet) = ('quitado'::public.commitment_status, 2),
    'recusas não mudam a conta paga';
end $$;

-- 9. O gasto gerado continua editável; editá-lo soma 1 à versão da conta a pagar (o previsto não muda).
do $$
declare
  acc uuid := pg_temp.id('acc');
  internet uuid := pg_temp.id('internet');
  r public.financial_records;
  ci public.commitment_items;
begin
  r := public.update_record('cp-rec-0001', pg_temp.id('gasto1'), 1, acc, 15800, '2026-10-07', 'Internet', 'Moradia');
  assert r.version = 2 and r.commitment_id = internet, 'edição mantém o vínculo';
  perform pg_temp.check_links();
  select * into ci from public.commitment_items where id = internet;
  assert ci.status = 'quitado' and ci.version = 3 and ci.paid_amount_cents = 15800 and ci.amount_cents = 15000,
    'conta continua paga, versão 3, pagamento atualizado';
  assert (select (action, commitment_id) from public.record_operations where idempotency_key = 'cp-rec-0001')
    = ('editar'::text, internet), 'operação editar registra a conta a pagar';
  assert pg_temp.totals('2026-10-01') = array[600000, 405800, 194200]::bigint[], 'editar o gasto para 158 muda Pago';
  perform pg_temp.expect_error(format($f$select public.undo_commitment_payment('cp-undo-0103', %L, 2)$f$, internet), 'versao_desatualizada');
end $$;

-- 10. Desfazer o pagamento: o gasto é excluído logicamente (vínculo mantido como rastro) e a conta volta a ficar em aberto.
do $$
declare
  internet uuid := pg_temp.id('internet');
  res jsonb;
  again jsonb;
  r public.financial_records;
  ci public.commitment_items;
begin
  res := public.undo_commitment_payment('cp-undo-0001', internet, 3);
  r := jsonb_populate_record(null::public.financial_records, res -> 'record');
  assert r.id = pg_temp.id('gasto1') and r.deleted_at is not null and r.deleted_by = auth.uid()
     and r.commitment_id = internet and r.version = 3, 'gasto excluído logicamente, vínculo mantido';
  assert res #>> '{commitment,status}' = 'aberto' and (res #>> '{commitment,version}')::int = 4
     and res #>> '{commitment,paid_record_id}' is null, 'conta reaberta, versão 4';
  perform pg_temp.check_links();
  select * into ci from public.commitment_items where id = internet;
  assert ci.status = 'aberto' and ci.version = 4 and ci.paid_record_id is null and ci.paid_amount_cents is null,
    'visão sem pagamento depois de desfazer';
  assert (select count(*) from public.financial_records where id = r.id) = 0, 'gasto desfeito some das consultas';
  assert pg_temp.totals('2026-10-01') = array[600000, 390000, 210000]::bigint[], 'desfazer: de volta à base';
  assert pg_temp.to_pay('2026-10-01') = array[74000, 4000, 78000, 4]::bigint[], 'desfazer: a pagar 780';
  assert (select (action, record_id, commitment_id) from public.record_operations where idempotency_key = 'cp-undo-0001')
    = ('desfazer_pagamento'::text, r.id, internet), 'operação desfazer_pagamento';

  again := public.undo_commitment_payment('cp-undo-0001', internet, 3);
  assert again = res, 'repetir o desfazer devolve o mesmo resultado';
  perform pg_temp.expect_error(format($f$select public.undo_commitment_payment('cp-undo-0104', %L, 4)$f$, internet), 'compromisso_aberto');
end $$;

-- 11. Pagar de novo e excluir o gasto em Movimentações: a conta a pagar volta a ficar em aberto, uma única vez.
do $$
declare
  acc uuid := pg_temp.id('acc');
  internet uuid := pg_temp.id('internet');
  res jsonb;
  gasto2 uuid;
  r public.financial_records;
  again public.financial_records;
  ci public.commitment_items;
begin
  res := public.pay_commitment('cp-pay-0002', internet, 4, acc, 15000, '2026-10-07');
  gasto2 := (res #>> '{record,id}')::uuid;
  assert gasto2 <> pg_temp.id('gasto1'), 'novo pagamento cria outro gasto';
  assert (res #>> '{commitment,version}')::int = 5 and res #>> '{record,category}' is null, 'versão 5; sem categoria enviada';
  perform pg_temp.check_links();
  assert pg_temp.totals('2026-10-01') = array[600000, 405000, 195000]::bigint[], 'pagar 150: 6000/4050/1950';
  assert pg_temp.to_pay('2026-10-01') = array[59000, 4000, 63000, 3]::bigint[], 'pagar Internet de novo: a pagar 630';

  r := public.delete_record('cp-del-0001', gasto2, 1);
  assert r.deleted_at is not null and r.commitment_id = internet, 'gasto excluído mantém o vínculo';
  perform pg_temp.check_links();
  select * into ci from public.commitment_items where id = internet;
  assert ci.status = 'aberto' and ci.version = 6 and ci.paid_record_id is null, 'excluir o gasto reabre a conta, versão 6';
  assert pg_temp.totals('2026-10-01') = array[600000, 390000, 210000]::bigint[], 'excluir o gasto: de volta à base';
  assert pg_temp.to_pay('2026-10-01') = array[74000, 4000, 78000, 4]::bigint[], 'excluir o gasto: a pagar 780';
  assert (select (action, record_id, commitment_id) from public.record_operations where idempotency_key = 'cp-del-0001')
    = ('excluir'::text, gasto2, internet), 'operação excluir registra a conta a pagar';

  again := public.delete_record('cp-del-0001', gasto2, 1);
  assert again.id = gasto2, 'repetição devolve o mesmo gasto';
  perform pg_temp.check_links();
  assert (select (status, version) from public.commitment_items where id = internet) = ('aberto'::public.commitment_status, 6),
    'repetir a exclusão não reabre de novo';
end $$;

-- Preparação feita pelo backend: conta arquivada da Ana (caso 12) e um contexto Família com conta (caso 16).
reset role;
with a as (
  insert into public.financial_accounts (context_id, name, status, created_by)
    select id, 'Conta antiga', 'arquivada', :ana from ids where name = 'ctx' returning id
) insert into ids select 'acc_arquivada', id from a;
with f as (
  insert into public.financial_contexts (kind, name, owner_person_id) values ('familia', 'Família da Ana', :ana) returning id
) insert into ids select 'familia', id from f;
with c as (
  insert into public.financial_accounts (context_id, name, created_by) select id, 'Conta da casa', :ana from ids where name = 'familia' returning id
) insert into ids select 'familia_conta', id from c;
set role authenticated;

-- 12. Atomicidade: pagamento recusado não grava nada (nem gasto, nem conta quitada, nem operação).
do $$
declare
  acc uuid := pg_temp.id('acc');
  internet uuid := pg_temp.id('internet');
  cases text[][] := array[
    array['cp-atom-0001', acc::text, '15000', '2026-10-08', null, 'data_futura'],
    array['cp-atom-0002', pg_temp.id('acc_arquivada')::text, '15000', '2026-10-07', null, 'conta_invalida'],
    array['cp-atom-0003', gen_random_uuid()::text, '15000', '2026-10-07', null, 'conta_invalida'],
    array['cp-atom-0004', acc::text, '0', '2026-10-07', null, 'valor_invalido'],
    array['cp-atom-0005', acc::text, '1000000000', '2026-10-07', null, 'valor_acima_do_limite'],
    array['cp-atom-0006', acc::text, '15000', '2026-10-07', repeat('c', 41), 'categoria_invalida']
  ];
  records_before bigint := (select count(*) from public.financial_records);
  i int;
  res jsonb;
begin
  for i in 1 .. array_length(cases, 1) loop
    perform pg_temp.expect_error(format('select public.pay_commitment(%L, %L, 6, %L, %s, %L, %L)',
      cases[i][1], internet, cases[i][2], cases[i][3], cases[i][4], cases[i][5]), cases[i][6]);
    assert (select (status, version) from public.commitment_items where id = internet) = ('aberto'::public.commitment_status, 6),
      'recusa ' || cases[i][6] || ': conta a pagar intacta';
    assert (select count(*) from public.financial_records) = records_before, 'recusa ' || cases[i][6] || ': nenhum gasto novo';
    assert (select count(*) from public.record_operations where idempotency_key = cases[i][1]) = 0,
      'recusa ' || cases[i][6] || ': nenhuma operação';
  end loop;

  -- A mesma chave da recusa por data futura, agora com data válida, passa: nada tinha ficado gravado.
  res := public.pay_commitment('cp-atom-0001', internet, 6, acc, 15000, '2026-10-07');
  assert res #>> '{commitment,status}' = 'quitado' and (res #>> '{commitment,version}')::int = 7, 'pagamento depois das recusas';
  perform pg_temp.check_links();
  res := public.undo_commitment_payment('cp-atom-0101', internet, 7);
  perform pg_temp.check_links();
  assert (res #>> '{commitment,version}')::int = 8, 'desfeito, versão 8';
  assert pg_temp.to_pay('2026-10-01') = array[74000, 4000, 78000, 4]::bigint[], 'de volta a 780';
end $$;

-- 13. Pagamento adiantado: entra em Pago do mês da data do pagamento e sai de "Ainda a pagar" do vencimento.
do $$
declare
  acc uuid := pg_temp.id('acc');
  condominio uuid := pg_temp.id('condominio');
begin
  perform public.pay_commitment('cp-adia-0001', condominio, 1, acc, 50000, '2026-09-30', 'Moradia');
  perform pg_temp.check_links();
  assert pg_temp.totals('2026-09-01') = array[0, 50000, -50000]::bigint[], 'pago em 30/09: entra em setembro';
  assert pg_temp.totals('2026-10-01') = array[600000, 390000, 210000]::bigint[], 'outubro: Pago igual';
  assert pg_temp.to_pay('2026-10-01') = array[24000, 4000, 28000, 3]::bigint[], 'outubro: a pagar 780 - 500';
  perform public.undo_commitment_payment('cp-adia-0002', condominio, 2);
  perform pg_temp.check_links();
  assert pg_temp.totals('2026-09-01') = array[0, 0, 0]::bigint[], 'desfazer: setembro sem o gasto';
  assert pg_temp.to_pay('2026-10-01') = array[74000, 4000, 78000, 4]::bigint[], 'desfazer: outubro de volta a 780';
end $$;

-- 14. Edição: mudar o vencimento muda o mês; a janela só vale quando o vencimento é novo ou muda.
do $$
declare
  agua uuid := pg_temp.id('agua');
  res jsonb;
begin
  res := public.update_commitment('cp-edit-0001', agua, 1, 9000, '2026-11-05', E' Água\t', '  ');
  assert (res #>> '{commitment,version}')::int = 2 and res #>> '{commitment,due_on}' = '2026-11-05'
     and res #>> '{commitment,description}' = 'Água' and res #>> '{commitment,category}' is null,
     'edição: versão +1, texto aparado, categoria vazia vira nula';
  perform pg_temp.check_links();
  assert pg_temp.to_pay('2026-10-01') = array[65000, 4000, 69000, 3]::bigint[], 'outubro: a pagar - 90';
  assert pg_temp.to_pay('2026-11-01') = array[39000, 0, 39000, 2]::bigint[], 'novembro: a pagar + 90';
  assert (select (action, record_id is null, commitment_id) from public.record_operations where idempotency_key = 'cp-edit-0001')
    = ('editar_compromisso'::text, true, agua), 'operação editar_compromisso';
  perform pg_temp.expect_error(format($f$select public.update_commitment('cp-edit-0103', %L, 1, 9100, '2026-11-05', 'Água')$f$, agua),
    'versao_desatualizada');

  -- Conta antiga continua editável enquanto o vencimento não muda.
  set local clarevo.today = '2027-12-01';
  res := public.update_commitment('cp-edit-0002', agua, 2, 9500, '2026-11-05', 'Água');
  assert (res #>> '{commitment,version}')::int = 3 and (res #>> '{commitment,amount_cents}')::bigint = 9500,
    'vencimento fora da janela, mas inalterado: aceito';
  perform pg_temp.expect_error(format($f$select public.update_commitment('cp-edit-0104', %L, 3, 9500, '2026-11-06', 'Água')$f$, agua),
    'vencimento_fora_do_intervalo');
  set local clarevo.today = '2026-10-07';
  perform pg_temp.check_links();
end $$;

-- 15. Exclusão lógica: some de tudo; repetir devolve a mesma linha; nada mais vale para a conta excluída.
do $$
declare
  acc uuid := pg_temp.id('acc');
  agua uuid := pg_temp.id('agua');
  res jsonb;
  again jsonb;
begin
  res := public.delete_commitment('cp-excl-0001', agua, 3);
  assert res #>> '{commitment,deleted_at}' is not null and (res #>> '{commitment,version}')::int = 4
     and res #>> '{commitment,status}' = 'aberto', 'excluída: deleted_at, versão 4, em aberto';
  perform pg_temp.check_links();
  assert (select count(*) from public.commitments where id = agua) = 0, 'excluída some da tabela';
  assert (select count(*) from public.commitment_items where id = agua) = 0, 'excluída some da visão';
  assert pg_temp.to_pay('2026-11-01') = array[30000, 0, 30000, 1]::bigint[], 'excluída sai de Ainda a pagar';
  again := public.delete_commitment('cp-excl-0001', agua, 3);
  assert again = res, 'repetir a exclusão devolve a mesma linha';
  perform pg_temp.expect_error(format($f$select public.update_commitment('cp-edit-0105', %L, 4, 9000, '2026-11-05', 'Água')$f$, agua),
    'nao_encontrado');
  perform pg_temp.expect_error(format($f$select public.pay_commitment('cp-pay-0104', %L, 4, %L, 9000, '2026-10-07')$f$, agua, acc),
    'nao_encontrado');
  perform pg_temp.expect_error(format($f$select public.delete_commitment('cp-excl-0103', %L, 4)$f$, agua), 'nao_encontrado');
  perform pg_temp.expect_error(format($f$select public.undo_commitment_payment('cp-undo-0105', %L, 4)$f$, agua), 'nao_encontrado');

  perform public.delete_commitment('cp-excl-0002', pg_temp.id('gas'), 1);
  perform pg_temp.check_links();
  assert pg_temp.to_pay('2026-10-01') = array[65000, 0, 65000, 2]::bigint[], 'excluir Água e Gás: de volta a 650';
  assert pg_temp.to_pay('2026-09-01') = array[0, 0, 0, 0]::bigint[], 'setembro sem contas em aberto';
end $$;

-- Internet paga para os casos de integridade.
do $$
declare
  res jsonb;
begin
  res := public.pay_commitment('cp-pay-0003', pg_temp.id('internet'), 8, pg_temp.id('acc'), 15000, '2026-10-07', 'Moradia');
  insert into ids values ('gasto3', (res #>> '{record,id}')::uuid);
  perform pg_temp.check_links();
end $$;

-- 16. Integridade garantida no banco mesmo para escrita direta do backend (cada caso desfeito no próprio bloco).
reset role;
-- I1: conta quitada sem gasto, ou gasto da conta paga excluído sem reabrir (pega no fim da transação).
select pg_temp.expect_error(format($$update public.commitments set status = 'quitado' where id = %L; set constraints all immediate$$,
  pg_temp.id('condominio')), 'vinculo_inconsistente');
select pg_temp.expect_error(format($$update public.financial_records set deleted_at = now() where id = %L; set constraints all immediate$$,
  pg_temp.id('gasto3')), 'vinculo_inconsistente');
-- I1 também na exclusão física: apagar o gasto vivo de uma conta paga deixaria a conta 'quitado' sem gasto.
select pg_temp.expect_error(format($$delete from public.financial_records where id = %L; set constraints all immediate$$,
  pg_temp.id('gasto3')), 'vinculo_inconsistente');
-- Apagar só o rastro (gasto já excluído logicamente) não quebra o vínculo; apagar a conta a pagar e os gastos
-- na mesma transação (exclusão do contexto inteiro) também passa. Cada caso é desfeito em seguida.
do $$
begin
  begin
    delete from public.financial_records where id = pg_temp.id('gasto1');
    set constraints all immediate;
    set constraints all deferred;
    raise exception 'desfeito';
  exception when others then
    if sqlerrm <> 'desfeito' then
      raise exception 'apagar o rastro do pagamento deveria passar: %', sqlerrm;
    end if;
  end;
  begin
    delete from public.financial_records where context_id = pg_temp.id('ctx');
    delete from public.financial_contexts where id = pg_temp.id('ctx');
    set constraints all immediate;
    set constraints all deferred;
    raise exception 'desfeito';
  exception when others then
    if sqlerrm <> 'desfeito' then
      raise exception 'apagar o contexto inteiro deveria passar: %', sqlerrm;
    end if;
  end;
  assert (select count(*) from public.financial_records where id = pg_temp.id('gasto1')) = 1, 'rastro de volta';
  assert (select (status, version) from public.commitments where id = pg_temp.id('internet'))
    = ('quitado'::public.commitment_status, 9), 'Internet continua paga';
end $$;
-- Um único gasto vivo por conta a pagar; só despesa; mesmo contexto da conta a pagar.
select pg_temp.expect_error(format($$insert into public.financial_records
    (context_id, account_id, kind, amount_cents, currency, occurred_on, description, created_by, commitment_id)
  values (%L, %L, 'despesa', 100, 'BRL', '2026-10-07', 'Segundo pagamento', %L, %L)$$,
  pg_temp.id('ctx'), pg_temp.id('acc'), :ana, pg_temp.id('internet')), '%financial_records_one_live_payment%');
select pg_temp.expect_error(format($$insert into public.financial_records
    (context_id, account_id, kind, amount_cents, currency, occurred_on, description, created_by, commitment_id)
  values (%L, %L, 'receita', 100, 'BRL', '2026-10-07', 'Recebimento', %L, %L)$$,
  pg_temp.id('ctx'), pg_temp.id('acc'), :ana, pg_temp.id('condominio')), '%financial_records_commitment_kind%');
select pg_temp.expect_error(format($$insert into public.financial_records
    (context_id, account_id, kind, amount_cents, currency, occurred_on, description, created_by, commitment_id)
  values (%L, %L, 'despesa', 100, 'BRL', '2026-10-07', 'Outro contexto', %L, %L)$$,
  pg_temp.id('familia'), pg_temp.id('familia_conta'), :ana, pg_temp.id('condominio')), '%financial_records_commitment_fk%');
-- Vínculo, contexto e previsto de conta paga são imutáveis; "cancelado" bloqueado; excluída só em aberto.
select pg_temp.expect_error(format($$update public.financial_records set commitment_id = null where id = %L$$, pg_temp.id('gasto3')),
  'campo_imutavel');
select pg_temp.expect_error(format($$update public.commitments set context_id = %L where id = %L$$, pg_temp.id('familia'), pg_temp.id('condominio')),
  'campo_imutavel');
select pg_temp.expect_error(format($$update public.commitments set amount_cents = 1 where id = %L$$, pg_temp.id('internet')), 'campo_imutavel');
select pg_temp.expect_error(format($$update public.commitments set status = 'cancelado' where id = %L$$, pg_temp.id('condominio')),
  '%commitments_status_neste_ciclo%');
select pg_temp.expect_error(format($$update public.commitments set deleted_at = now() where id = %L$$, pg_temp.id('internet')),
  '%commitments_excluida_aberta%');
select pg_temp.check_links();

-- 17. Escrita direta como authenticated é recusada (só pelas funções).
set role authenticated;
select pg_temp.expect_error(format($$insert into public.commitments (context_id, description, amount_cents, due_on, created_by)
  values (%L, 'Direto', 100, '2026-10-10', auth.uid())$$, pg_temp.id('ctx')), 'permission denied%');
select pg_temp.expect_error($$update public.commitments set amount_cents = 1$$, 'permission denied%');
select pg_temp.expect_error($$delete from public.commitments$$, 'permission denied%');
-- A visão tem junção (não é atualizável): o Postgres recusa antes de olhar privilégios. O caso 20 confere que não há insert.
select pg_temp.expect_error(format($$insert into public.commitment_items (id, context_id, description, amount_cents, due_on)
  values (gen_random_uuid(), %L, 'Direto', 100, '2026-10-10')$$, pg_temp.id('ctx')), 'cannot insert into view%');
select pg_temp.expect_error(format($$update public.financial_records set commitment_id = %L where description = 'Mercado'$$,
  pg_temp.id('condominio')), 'permission denied%');
select pg_temp.expect_error(format($$insert into public.record_operations
    (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id)
  values (auth.uid(), 'chave-falsa-01', 'pagar_compromisso', %L, 'x', gen_random_uuid(), %L)$$,
  pg_temp.id('ctx'), pg_temp.id('condominio')), 'permission denied%');

-- 18. month_to_pay exige o primeiro dia do mês; sem sessão nada é gravado nem lido.
select pg_temp.expect_error(format($$select * from public.month_to_pay(%L, '2026-10-02')$$, pg_temp.id('ctx')), 'mes_invalido');
select pg_temp.expect_error(format($$select * from public.month_to_pay(%L, null)$$, pg_temp.id('ctx')), 'mes_invalido');
select set_config('request.jwt.claim.sub', '', true);
select pg_temp.expect_error(format($$select public.create_commitment('cp-sess-0001', %L, 100, '2026-10-15', 'x')$$, pg_temp.id('ctx')),
  'nao_autenticado');
select pg_temp.expect_error(format($$select public.pay_commitment('cp-sess-0002', %L, 1, %L, 100, '2026-10-07')$$,
  pg_temp.id('condominio'), pg_temp.id('acc')), 'nao_autenticado');
select pg_temp.expect_error(format($$select * from public.month_to_pay(%L, '2026-10-01')$$, pg_temp.id('ctx')), 'sem_permissao');
select set_config('request.jwt.claim.sub', :ana, true);

-- 19. Operações gravadas: as 5 ações novas, todas com o alvo certo.
do $$ begin
  assert (select array_agg(distinct action order by action) from public.record_operations where action not in ('criar', 'editar', 'excluir'))
    = array['criar_compromisso', 'desfazer_pagamento', 'editar_compromisso', 'excluir_compromisso', 'pagar_compromisso'],
    'as 5 ações de conta a pagar';
  assert not exists (
    select 1 from public.record_operations
     where not ((action in ('criar', 'editar', 'excluir') and record_id is not null)
             or (action in ('criar_compromisso', 'editar_compromisso', 'excluir_compromisso') and commitment_id is not null and record_id is null)
             or (action in ('pagar_compromisso', 'desfazer_pagamento') and commitment_id is not null and record_id is not null))
  ), 'toda operação aponta para o alvo da sua ação';
end $$;

-- 20. Privilégios: authenticated executa só as funções expostas; anon não executa nada; sem escrita direta.
-- A lista inclui as funções de séries das migrações de gastos fixos e de contas do ano (testadas em 40 e 45) e as da
-- revisão dos últimos meses (testadas em 47), as da renda comprometida (testadas em 50), as de metas (testadas em 60) e
-- a do plano de guardar (testada em 65).
reset role;
do $$ begin
  assert (select array_agg(p.proname::text order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and has_function_privilege('authenticated', p.oid, 'execute'))
    = array['add_card_charge', 'add_card_purchase', 'add_card_refund', 'add_goal_movement', 'context_permission',
            'create_account', 'create_card', 'create_commitment', 'create_goal', 'create_record', 'create_series',
            'create_series_occurrence', 'decide_return_review', 'delete_account', 'delete_card', 'delete_card_entry',
            'delete_category_budget', 'delete_commitment', 'delete_commitment_limit', 'delete_goal', 'delete_goal_movement',
            'delete_income_reference', 'delete_record', 'delete_series', 'end_series', 'ensure_personal_space',
            'inform_series_year', 'invoice_closing_on', 'invoice_due_on', 'invoice_month_for', 'is_org_admin', 'mark_subscriptions_reviewed', 'month_budget',
            'month_committed', 'month_to_pay', 'month_totals', 'months_overview', 'my_today', 'pay_commitment', 'pay_invoice',
            'set_account_status', 'set_card_status', 'set_category_budget', 'set_commitment_limit', 'set_default_account',
            'set_goal_status', 'set_income_reference', 'set_savings_answer', 'set_series_subscription', 'skip_series_year', 'sync_series_occurrences',
            'undo_commitment_payment', 'undo_invoice_payment', 'update_account', 'update_card', 'update_card_entry',
            'update_commitment', 'update_goal', 'update_goal_movement', 'update_record', 'update_series_from'],
    'authenticated executa só as funções expostas';
  assert not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                      where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')), 'anon não executa nenhuma função';
  assert not has_table_privilege('authenticated', 'public.commitments', 'insert, update, delete, truncate'), 'sem escrita direta em commitments';
  assert not has_table_privilege('authenticated', 'public.commitment_items', 'insert, update, delete, truncate'), 'sem escrita pela visão';
  assert has_table_privilege('authenticated', 'public.commitment_items', 'select'), 'leitura pela visão';
  assert not has_table_privilege('anon', 'public.commitment_items', 'select'), 'anon não lê a visão';
end $$;

-- Vínculos coerentes no fim de tudo.
select pg_temp.check_links();

rollback;
