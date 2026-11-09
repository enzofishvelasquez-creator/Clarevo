import { describe, expect, it } from 'vitest';
import {
  CSV_RECORD_HEADER,
  MemoryRepository,
  NEXT_MONTH_TEXT,
  buildExportReport,
  buildRecordsCsv,
  existingMonths,
  exportMonths,
  exportRows,
  isRepoError,
  loadExportSource,
  monthsOverview,
  nextMonthAllowed,
  recordMonth,
  summarizeMonth,
  validateRecordDraft,
  type FinancialRecord,
  type RecordDraft,
} from '../src';

/** Recebimento do fim do mês que conta no mês seguinte (D-089 A). */

function rec(over: Partial<FinancialRecord> & Pick<FinancialRecord, 'id' | 'occurredOn'>): FinancialRecord {
  return {
    contextId: 'c1',
    accountId: 'a1',
    kind: 'receita',
    status: 'realizado',
    amountCents: 1000,
    currency: 'BRL',
    description: 'Salário',
    category: 'Salário',
    commitmentId: null,
    invoice: null,
    receiptKey: null,
    createdBy: 'p1',
    version: 1,
    createdAt: `${over.occurredOn}T10:00:00.000Z`,
    updatedAt: `${over.occurredOn}T10:00:00.000Z`,
    ...over,
  };
}

async function fresh(day = '2026-11-09') {
  const clock = { today: day };
  const repo = new MemoryRepository({ actorId: 'pessoa-teste', displayName: 'Pessoa de teste', today: () => clock.today });
  const space = await repo.ensurePersonalSpace('Conta principal');
  return { repo, ctx: space.personalContextId, acc: space.accounts[0]!.id, clock };
}

const input = (amountCents: number, occurredOn: string, description: string, nextMonth?: boolean) => ({
  accountId: '',
  amountCents,
  occurredOn,
  description,
  category: null,
  ...(nextMonth === undefined ? {} : { nextMonth }),
});

describe('a janela dos últimos 7 dias e o mês em que conta', () => {
  it('nextMonthAllowed: os últimos 7 dias de cada mês, com fevereiro comum e bissexto', () => {
    expect(['2026-10-25', '2026-10-31'].every(nextMonthAllowed)).toBe(true);
    expect(nextMonthAllowed('2026-10-24')).toBe(false);
    expect(nextMonthAllowed('2026-09-24')).toBe(true);
    expect(nextMonthAllowed('2026-09-23')).toBe(false);
    expect(nextMonthAllowed('2026-02-22')).toBe(true);
    expect(nextMonthAllowed('2026-02-21')).toBe(false);
    expect(nextMonthAllowed('2028-02-23')).toBe(true);
    expect(nextMonthAllowed('2028-02-22')).toBe(false);
  });

  it('recordMonth: o mês da data, ou o seguinte com a marca (dezembro vira janeiro)', () => {
    expect(recordMonth({ occurredOn: '2026-10-30' })).toBe('2026-10');
    expect(recordMonth({ occurredOn: '2026-10-30', nextMonth: false })).toBe('2026-10');
    expect(recordMonth({ occurredOn: '2026-10-30', nextMonth: true })).toBe('2026-11');
    expect(recordMonth({ occurredOn: '2026-12-31', nextMonth: true })).toBe('2027-01');
  });

  it('os textos: o ajuste, a legenda com os dois meses, a linha da lista e o detalhe', () => {
    expect(NEXT_MONTH_TEXT.toggle).toBe('Este valor é do mês seguinte');
    expect(NEXT_MONTH_TEXT.caption('2026-10-30')).toBe('Entra no Recebido de novembro de 2026, não no de outubro de 2026.');
    expect(NEXT_MONTH_TEXT.caption('2026-12-29')).toBe('Entra no Recebido de janeiro de 2027, não no de dezembro de 2026.');
    expect(NEXT_MONTH_TEXT.rowNote('2026-11')).toBe('conta em novembro');
    expect(NEXT_MONTH_TEXT.detailSuffix).toBe(' (mês seguinte)');
  });
});

describe('formulário (validateRecordDraft)', () => {
  const draft = (over: Partial<RecordDraft> = {}): RecordDraft => ({
    accountId: 'conta-1',
    amountText: '6000,00',
    description: 'Salário',
    category: 'Salário',
    dateText: '30/10/2026',
    ...over,
  });

  it('a marca vai junto só com a data na janela; fora dela, cai em silêncio; sem a marca, o mesmo de antes', () => {
    const on = validateRecordDraft(draft({ nextMonth: true }), '2026-11-09');
    expect(on.ok && on.input.nextMonth).toBe(true);
    const out = validateRecordDraft(draft({ nextMonth: true, dateText: '15/10/2026' }), '2026-11-09');
    expect(out.ok && 'nextMonth' in out.input).toBe(false);
    const off = validateRecordDraft(draft({ nextMonth: false }), '2026-11-09');
    expect(off.ok && 'nextMonth' in off.input).toBe(false);
  });
});

describe('totais e leituras por mês', () => {
  const records = [
    rec({ id: 'r1', occurredOn: '2026-10-30', amountCents: 600_000, nextMonth: true }),
    rec({ id: 'r2', occurredOn: '2026-10-10', amountCents: 20_000, description: 'Freela', category: 'Renda extra' }),
    rec({ id: 'r3', occurredOn: '2026-10-05', amountCents: 150_000, kind: 'despesa', description: 'Aluguel', category: 'Moradia' }),
  ];

  it('summarizeMonth: o salário de 30/10 marcado entra em novembro, não em outubro', () => {
    expect(summarizeMonth(records, 'c1', '2026-10').receivedCents).toBe(20_000);
    expect(summarizeMonth(records, 'c1', '2026-11').receivedCents).toBe(600_000);
    expect(summarizeMonth(records, 'c1', '2026-11').composition.received.map((r) => r.id)).toEqual(['r1']);
  });

  it('monthsOverview (o mesmo de months_overview): a contagem e a soma pelo mês em que conta', () => {
    const [oct, nov] = monthsOverview(records, 'c1', '2026-10', '2026-11');
    expect([oct!.receivedCount, oct!.receivedCents]).toEqual([1, 20_000]);
    expect([nov!.receivedCount, nov!.receivedCents]).toEqual([1, 600_000]);
  });

  it('exportação: a coluna "Mês do resumo", a linha no mês em que conta e os meses do resumo', () => {
    const ctx = { accounts: [{ id: 'a1', name: 'Conta principal' }] as never, cards: [], commitments: new Map() } as never;
    expect(CSV_RECORD_HEADER.at(-1)).toBe('Mês do resumo');
    const rows = exportRows(records, ctx);
    expect(rows.find((r) => r.date === '2026-10-30')!.month).toBe('2026-11');
    const csv = buildRecordsCsv(rows).split('\r\n');
    expect(csv).toContain('30/10/2026;Recebimento;Salário;Salário;6000,00;Conta principal;Anotado;11/2026');
    expect(csv).toContain('10/10/2026;Recebimento;Freela;Renda extra;200,00;Conta principal;Anotado;10/2026');
    expect(exportMonths('tudo', '2026-11-09', records)).toEqual(['2026-10', '2026-11']);
    const report = buildExportReport({
      contextId: 'c1', period: 'tudo', today: '2026-11-09', records, purchases: [], accounts: [], cards: [], commitments: new Map(), invoices: [],
    } as never);
    expect(report.months.map((m) => [m.month, m.receivedCents, m.rows.length])).toEqual([
      ['2026-10', 20_000, 2],
      ['2026-11', 600_000, 1],
    ]);
  });

  it('importação: um dia do fim do mês também lê o mês seguinte (onde fica o recebimento marcado)', () => {
    expect(existingMonths([{ date: '2026-10-24' }])).toEqual(['2026-10', '2026-11']);
    expect(existingMonths([{ date: '2026-10-10' }])).toEqual(['2026-10']);
  });
});

describe('repositório em memória (mesmas regras de create_record, update_record e set_month_check)', () => {
  it('criar: só recebimento, só na janela; a lista e os totais pelo mês em que conta; a data não muda', async () => {
    const { repo, ctx, acc } = await fresh();
    const sal = await repo.createRecord('ms-1', ctx, 'receita', { ...input(600_000, '2026-10-30', 'Salário', true), accountId: acc });
    expect([sal.nextMonth, sal.occurredOn]).toEqual([true, '2026-10-30']);
    expect((await repo.listRecords(ctx, '2026-10')).map((r) => r.id)).not.toContain(sal.id);
    expect((await repo.listRecords(ctx, '2026-11')).map((r) => r.id)).toContain(sal.id);
    const plain = await repo.createRecord('ms-2', ctx, 'receita', { ...input(5_000, '2026-10-31', 'Reembolso'), accountId: acc });
    expect('nextMonth' in plain).toBe(false);
    for (const [kind, on] of [['despesa', '2026-10-30'], ['receita', '2026-10-24']] as const) {
      const err = await repo.createRecord(`ms-x-${kind}`, ctx, kind, { ...input(100, on, 'X', true), accountId: acc }).catch((e) => e);
      expect(isRepoError(err, 'mes_seguinte_invalido')).toBe(true);
    }
    // A mesma chave com e sem a marca é outro conteúdo; false é o mesmo conteúdo de sem a marca.
    const reused = await repo.createRecord('ms-1', ctx, 'receita', { ...input(600_000, '2026-10-30', 'Salário'), accountId: acc }).catch((e) => e);
    expect(isRepoError(reused, 'chave_reutilizada')).toBe(true);
    expect((await repo.createRecord('ms-2', ctx, 'receita', { ...input(5_000, '2026-10-31', 'Reembolso', false), accountId: acc })).id).toBe(plain.id);
  });

  it('editar: ausente mantém a marca enquanto a data cabe; false e true explícitos; fora da janela, true recusa', async () => {
    const { repo, ctx, acc } = await fresh();
    let sal = await repo.createRecord('ms-1', ctx, 'receita', { ...input(600_000, '2026-10-30', 'Salário', true), accountId: acc });
    sal = await repo.updateRecord('ms-u1', sal.id, sal.version, { ...input(610_000, '2026-10-31', 'Salário'), accountId: acc });
    expect(sal.nextMonth).toBe(true);
    sal = await repo.updateRecord('ms-u2', sal.id, sal.version, { ...input(610_000, '2026-10-31', 'Salário', false), accountId: acc });
    expect('nextMonth' in sal).toBe(false);
    sal = await repo.updateRecord('ms-u3', sal.id, sal.version, { ...input(610_000, '2026-10-31', 'Salário', true), accountId: acc });
    expect(sal.nextMonth).toBe(true);
    sal = await repo.updateRecord('ms-u4', sal.id, sal.version, { ...input(610_000, '2026-10-15', 'Salário'), accountId: acc });
    expect('nextMonth' in sal).toBe(false);
    const err = await repo.updateRecord('ms-u5', sal.id, sal.version, { ...input(610_000, '2026-10-15', 'Salário', true), accountId: acc }).catch((e) => e);
    expect(isRepoError(err, 'mes_seguinte_invalido')).toBe(true);
  });

  it('"Conferi este mês": outubro sem recebimento além do salário marcado pode ser conferido; novembro tem o salário', async () => {
    const { repo, ctx, acc } = await fresh('2026-12-02');
    await repo.createRecord('ms-1', ctx, 'receita', { ...input(600_000, '2026-10-30', 'Salário', true), accountId: acc });
    expect((await repo.setMonthCheck('ms-c1', ctx, '2026-10', 'recebimentos', 0)).checked).toBe(true);
    const err = await repo.setMonthCheck('ms-c2', ctx, '2026-11', 'recebimentos', 0).catch((e) => e);
    expect(isRepoError(err, 'mes_com_registros')).toBe(true);
  });

  it('exportação "Este mês": o salário de 30/10 marcado entra no resumo de novembro; o de 30/10 sem marca, não', async () => {
    const { repo, ctx, acc } = await fresh();
    await repo.createRecord('ms-1', ctx, 'receita', { ...input(600_000, '2026-10-30', 'Salário', true), accountId: acc });
    await repo.createRecord('ms-2', ctx, 'receita', { ...input(20_000, '2026-10-30', 'Freela'), accountId: acc });
    const load = await loadExportSource(repo, ctx, 'mes', '2026-11-09');
    expect(load.ok).toBe(true);
    if (!load.ok) return;
    expect(load.source.records.map((r) => r.description)).toEqual(['Salário']);
    expect(buildExportReport(load.source).months.map((m) => [m.month, m.receivedCents])).toEqual([['2026-11', 600_000]]);
  });
});
