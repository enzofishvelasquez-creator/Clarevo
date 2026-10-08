-- Registros realizados: sequência de aceite do primeiro ciclo, idempotência, versões (inclusive ausente), períodos e validação.
-- Pessoa FICTÍCIA: Ana.
\set ON_ERROR_STOP 1
\set ana '''00000000-0000-0000-0000-0000000000a1'''

begin;
set local clarevo.today = '2026-10-07';

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
  values (:ana, 'ana@exemplo.test', now(), '{"display_name":"Ana"}');

set role authenticated;
select set_config('request.jwt.claim.sub', :ana, true);

do $$
declare
  space jsonb := public.ensure_personal_space('Conta principal');
  ctx uuid := (space ->> 'context_id')::uuid;
  acc uuid := (space #>> '{account,id}')::uuid;
  g public.financial_records;
  r public.financial_records;
  again public.financial_records;
  t record;
  sep public.financial_records;

  procedure_check text;
begin
  -- Base: R$ 6.000 recebidos, R$ 3.900 pagos.
  perform public.create_record('base-000001', ctx, acc, 'receita', 600000, '2026-10-01', 'Salário');
  perform public.create_record('base-000002', ctx, acc, 'despesa', 250000, '2026-10-05', 'Aluguel');
  perform public.create_record('base-000003', ctx, acc, 'despesa', 140000, '2026-10-06', 'Mercado');
  select * into t from public.month_totals(ctx, '2026-10-01');
  assert (t.received_cents, t.paid_cents, t.difference_cents) = (600000::bigint, 390000::bigint, 210000::bigint), 'base 6000/3900/2100';

  -- Gasto de 80 → 95 → excluir.
  g := public.create_record('seq-0000001', ctx, acc, 'despesa', 8000, '2026-10-07', 'Café');
  select * into t from public.month_totals(ctx, '2026-10-01');
  assert (t.paid_cents, t.difference_cents) = (398000::bigint, 202000::bigint), 'gasto 80: 3980/2020';
  r := public.update_record('seq-0000002', g.id, g.version, acc, 9500, '2026-10-07', 'Café');
  assert r.id = g.id and r.version = g.version + 1, 'edição mantém o ID e soma 1 à versão';
  select * into t from public.month_totals(ctx, '2026-10-01');
  assert (t.paid_cents, t.difference_cents) = (399500::bigint, 200500::bigint), 'editar para 95: 3995/2005';
  -- Repetir a mesma edição não incrementa de novo.
  again := public.update_record('seq-0000002', g.id, g.version, acc, 9500, '2026-10-07', 'Café');
  assert again.version = r.version, 'repetição da edição não soma versão';
  r := public.delete_record('seq-0000003', g.id, r.version);
  again := public.delete_record('seq-0000003', g.id, r.version - 1);
  select * into t from public.month_totals(ctx, '2026-10-01');
  assert (t.paid_cents, t.difference_cents) = (390000::bigint, 210000::bigint), 'excluir: 3900/2100 (uma única vez)';
  assert (select count(*) from public.financial_records where id = g.id) = 0, 'excluído some das consultas';
  begin
    perform public.update_record('seq-0000004', g.id, r.version, acc, 100, '2026-10-07', 'Café');
    raise exception 'FALHA: editou registro excluído';
  exception when others then assert sqlerrm = 'nao_encontrado', 'excluído não pode ser editado: ' || sqlerrm;
  end;

  -- Recebimento de 200 → 250 → excluir.
  g := public.create_record('seq-0000005', ctx, acc, 'receita', 20000, '2026-10-07', 'Freela');
  select * into t from public.month_totals(ctx, '2026-10-01');
  assert (t.received_cents, t.difference_cents) = (620000::bigint, 230000::bigint), 'recebimento 200: 6200/2300';
  r := public.update_record('seq-0000006', g.id, g.version, acc, 25000, '2026-10-07', 'Freela');
  select * into t from public.month_totals(ctx, '2026-10-01');
  assert (t.received_cents, t.difference_cents) = (625000::bigint, 235000::bigint), 'editar para 250: 6250/2350';
  perform public.delete_record('seq-0000007', g.id, r.version);
  select * into t from public.month_totals(ctx, '2026-10-01');
  assert (t.received_cents, t.paid_cents, t.difference_cents) = (600000::bigint, 390000::bigint, 210000::bigint), 'de volta à base';

  -- Idempotência: mesma chave e conteúdo devolve o mesmo registro; outro conteúdo é recusado.
  g := public.create_record('idem-000001', ctx, acc, 'despesa', 1000, '2026-10-07', 'Pão');
  again := public.create_record('idem-000001', ctx, acc, 'despesa', 1000, '2026-10-07', '  Pão  ');
  assert again.id = g.id, 'repetição devolve o mesmo registro';
  assert (select count(*) from public.financial_records where description = 'Pão') = 1, 'um único registro';
  assert (select record_id from public.record_operations where idempotency_key = 'idem-000001') = g.id, 'operação aponta para o registro';
  begin
    perform public.create_record('idem-000001', ctx, acc, 'despesa', 1100, '2026-10-07', 'Pão');
    raise exception 'FALHA: chave reutilizada aceita';
  exception when others then assert sqlerrm = 'chave_reutilizada', sqlerrm;
  end;

  -- Versão: edição com versão antiga não sobrescreve.
  r := public.update_record('vers-000001', g.id, 1, acc, 1200, '2026-10-07', 'Pão');
  begin
    perform public.update_record('vers-000002', g.id, 1, acc, 1500, '2026-10-07', 'Pão');
    raise exception 'FALHA: sobrescreveu versão nova';
  exception when others then assert sqlerrm = 'versao_desatualizada', sqlerrm;
  end;
  assert (select amount_cents from public.financial_records where id = g.id) = 1200, 'valor da versão atual mantido';
  begin
    perform public.delete_record('vers-000003', g.id, 1);
    raise exception 'FALHA: excluiu com versão antiga';
  exception when others then assert sqlerrm = 'versao_desatualizada', sqlerrm;
  end;
  perform public.delete_record('vers-000004', g.id, r.version);

  -- Versão ausente (NULL) é recusada como desatualizada: não passa sem conferir conflito.
  g := public.create_record('nulo-000000', ctx, acc, 'despesa', 500, '2026-10-07', 'Banca');
  begin
    perform public.update_record('nulo-000001', g.id, null, acc, 600, '2026-10-07', 'Banca');
    raise exception 'FALHA: editou sem versão';
  exception when others then assert sqlerrm = 'versao_desatualizada', sqlerrm;
  end;
  begin
    perform public.delete_record('nulo-000002', g.id, null);
    raise exception 'FALHA: excluiu sem versão';
  exception when others then assert sqlerrm = 'versao_desatualizada', sqlerrm;
  end;
  assert (select (version, amount_cents, deleted_at is null) from public.financial_records where id = g.id) = (1, 500::bigint, true),
    'sem versão: registro mantém versão e valor';
  assert (select count(*) from public.record_operations where idempotency_key in ('nulo-000001', 'nulo-000002')) = 0,
    'sem versão: nenhuma operação gravada';
  perform public.delete_record('nulo-000003', g.id, g.version);

  -- Período: 30/09 não entra em outubro; mover para 01/10 atualiza os dois meses.
  sep := public.create_record('peri-000001', ctx, acc, 'despesa', 8000, '2026-09-30', 'Farmácia');
  select * into t from public.month_totals(ctx, '2026-10-01');
  assert t.paid_cents = 390000, 'setembro não entra em outubro';
  select * into t from public.month_totals(ctx, '2026-09-01');
  assert t.paid_cents = 8000, 'setembro tem o gasto';
  perform public.update_record('peri-000002', sep.id, sep.version, acc, 8000, '2026-10-01', 'Farmácia');
  select * into t from public.month_totals(ctx, '2026-09-01');
  assert t.paid_cents = 0, 'setembro sem o gasto depois de mover';
  select * into t from public.month_totals(ctx, '2026-10-01');
  assert t.paid_cents = 398000, 'outubro com o gasto depois de mover';

  -- Texto com < e > é guardado como texto.
  g := public.create_record('text-000001', ctx, acc, 'despesa', 100, '2026-10-07', '<b>café</b> & <script>');
  assert (select description from public.financial_records where id = g.id) = '<b>café</b> & <script>', 'texto literal';
  assert g.category is null, 'sem categoria é null';

  -- Validação no banco (mesmos códigos do app).
  declare
    cases text[][] := array[
      array['0', '2026-10-07', 'x', 'valor_invalido'],
      array['1000000000', '2026-10-07', 'x', 'valor_acima_do_limite'],
      array['100', '2026-10-08', 'x', 'data_futura'],
      array['100', '2026-10-07', '   ', 'descricao_obrigatoria'],
      array['100', '2026-10-07', repeat('x', 81), 'descricao_longa'],
      array['100', '2026-10-07', E'\t \n', 'descricao_obrigatoria']
    ];
    i int;
  begin
    for i in 1 .. array_length(cases, 1) loop
      begin
        perform public.create_record('vali-00000' || i, ctx, acc, 'despesa', cases[i][1]::bigint, cases[i][2]::date, cases[i][3]);
        raise exception 'FALHA: aceitou caso %', cases[i][4];
      exception when others then assert sqlerrm = cases[i][4], 'esperado ' || cases[i][4] || ', veio ' || sqlerrm;
      end;
    end loop;
  end;
  perform public.create_record('vali-000099', ctx, acc, 'despesa', 999999999, '2026-10-07', repeat('x', 80));
  -- Espaços, tabulações e quebras nas pontas são removidos; categoria acima de 40 caracteres é recusada.
  g := public.create_record('vali-000100', ctx, acc, 'despesa', 100, '2026-10-07', E'\t Café \n', E' Mercado\t');
  assert g.description = 'Café' and g.category = 'Mercado', 'normalização igual à do app';
  begin
    perform public.create_record('vali-000101', ctx, acc, 'despesa', 100, '2026-10-07', 'x', repeat('c', 41));
    raise exception 'FALHA: categoria longa aceita';
  exception when others then assert sqlerrm = 'categoria_invalida', sqlerrm;
  end;
  -- 80 caracteres contados como caracteres (emoji conta 1), como no app.
  perform public.create_record('vali-000102', ctx, acc, 'despesa', 100, '2026-10-07', repeat('🍞', 80));

  -- month_totals exige o primeiro dia do mês.
  begin
    perform public.month_totals(ctx, '2026-10-02');
    raise exception 'FALHA: mês inválido aceito';
  exception when others then assert sqlerrm = 'mes_invalido', sqlerrm;
  end;
end $$;

rollback;
