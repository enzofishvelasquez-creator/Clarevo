import { describe, expect, it } from 'vitest';
import {
  CSV_BOM,
  CSV_EOL,
  CSV_PURCHASE_HEADER,
  CSV_RECORD_HEADER,
  DEFAULT_EXPORT_FORMAT,
  DEFAULT_EXPORT_PERIOD,
  DEMO_TODAY,
  EXPORT_FORMATS,
  EXPORT_MAX_ROWS,
  EXPORT_ORIGIN_LABEL,
  EXPORT_PERIODS,
  EXPORT_TEXT,
  buildExportFiles,
  buildExportReport,
  buildPurchasesCsv,
  buildRecordsCsv,
  categoryBreakdown,
  createDemoRepository,
  csvAmount,
  csvCell,
  csvText,
  escapeHtml,
  exportAfterAuth,
  exportCardLabel,
  exportFileName,
  exportFilterOf,
  exportMonths,
  exportPurchaseRows,
  exportRange,
  exportReportHtml,
  exportRows,
  formatBRL,
  loadExportSource,
  loadInvoicesOfRecords,
  newOperationKey,
  recordOriginOf,
  summarizeMonth,
  type CardEntry,
  type Commitment,
  type ExportContext,
  type ExportSource,
  type FinancialRecord,
  type RecordsRepository,
} from '../src';

const key = newOperationKey;

function rec(over: Partial<FinancialRecord> & Pick<FinancialRecord, 'id' | 'occurredOn'>): FinancialRecord {
  return {
    contextId: 'c1',
    accountId: 'a1',
    kind: 'despesa',
    status: 'realizado',
    amountCents: 1000,
    currency: 'BRL',
    description: 'Luz',
    category: 'Moradia',
    commitmentId: null,
    invoice: null,
    receiptKey: null,
    createdBy: 'pessoa-secreta',
    version: 1,
    createdAt: `${over.occurredOn}T10:00:00.000Z`,
    updatedAt: `${over.occurredOn}T10:00:00.000Z`,
    ...over,
  };
}

const CTX: ExportContext = {
  accounts: [{ id: 'a1', name: 'Conta principal', status: 'ativa' }],
  cards: [{ id: 'k1', name: 'Cartão Exemplo', lastDigits: '1234' }],
  commitments: new Map(),
};

/** Lê o CSV de volta: tira o BOM, quebra por linha e separa as colunas respeitando aspas. */
function parseCsv(text: string): string[][] {
  const body = text.startsWith(CSV_BOM) ? text.slice(1) : text;
  const rows: string[][] = [];
  let cell = '';
  let row: string[] = [];
  let quoted = false;
  for (let i = 0; i < body.length; i++) {
    const c = body[i]!;
    if (quoted) {
      if (c === '"' && body[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ';') {
      row.push(cell);
      cell = '';
    } else if (c === '\r' && body[i + 1] === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      i++;
    } else cell += c;
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

describe('CSV: células, valores e proteção contra fórmula (D-047)', () => {
  it('valor com vírgula decimal, sem "R$" e sem ponto de milhar', () => {
    expect(csvAmount(0)).toBe('0,00');
    expect(csvAmount(5)).toBe('0,05');
    expect(csvAmount(100)).toBe('1,00');
    expect(csvAmount(123456)).toBe('1234,56');
    expect(csvAmount(999_999_999)).toBe('9999999,99');
    expect(csvAmount(-1250)).toBe('-12,50');
  });

  it('texto que começa com =, +, -, @ ou tabulação ganha um apóstrofo; o resto fica como está', () => {
    for (const bad of ['=SOMA(A1:A9)', '+55 11 99999', '-2+3', '@usuario', '\tabc', '=HYPERLINK("http://x")', '-']) expect(csvText(bad), bad).toBe(`'${bad}`);
    for (const ok of ['Mercado', 'Pagamento = parcial', 'a-b', 'R$ 10', '1+1', ' =x', '']) expect(csvText(ok), ok).toBe(ok);
    // Quebra de linha vira espaço: cada lançamento fica numa linha só. Retorno de linha no começo não protege nada além do espaço.
    expect(csvText('linha 1\nlinha 2')).toBe('linha 1 linha 2');
    expect(csvText('\r\n=1+1')).toBe(' =1+1');
    expect(csvText('=1\r\n+2')).toBe("'=1 +2");
  });

  it('entre aspas quando há ponto e vírgula, aspas ou quebra de linha; as aspas internas dobram', () => {
    expect(csvCell('Mercado')).toBe('Mercado');
    expect(csvCell('Pão; leite')).toBe('"Pão; leite"');
    expect(csvCell('Disse "oi"')).toBe('"Disse ""oi"""');
    expect(csvCell('a\nb')).toBe('"a\nb"');
    expect(csvCell('vírgula, ok')).toBe('vírgula, ok');
  });
});

describe('CSV de lançamentos (D-047)', () => {
  const rows = exportRows(
    [
      rec({ id: 'r2', occurredOn: '2026-10-06', description: 'Mercado; feira "boa"', amountCents: 140_000 }),
      rec({ id: 'r1', occurredOn: '2026-09-01', description: 'Salário', kind: 'receita', category: 'Salário', amountCents: 600_000 }),
      rec({ id: 'r3', occurredOn: '2026-10-06', description: '=CMD()', category: null, amountCents: 5 }),
      rec({ id: 'r4', occurredOn: '2026-10-07', description: 'Fatura Cartão Exemplo (novembro)', amountCents: 55_000, invoice: { cardId: 'k1', month: '2026-11' }, commitmentId: 'cm-fatura' }),
    ],
    CTX,
  );

  it('começa com o BOM UTF-8, tem o cabeçalho certo e termina cada linha com CRLF', () => {
    const csv = buildRecordsCsv(rows);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(new TextEncoder().encode(csv).slice(0, 3)).toEqual(new Uint8Array([0xef, 0xbb, 0xbf]));
    expect(csv.slice(1).split(CSV_EOL)[0]).toBe('Data;Tipo;Descrição;Categoria;Valor (R$);Conta de origem;Origem');
    expect(CSV_RECORD_HEADER).toHaveLength(7);
    expect(csv.endsWith(CSV_EOL)).toBe(true);
    expect(csv.split(CSV_EOL)).toHaveLength(rows.length + 2);
    // Nenhum caractere de controle solto, nem separador de linha no meio do texto.
    expect(csv.slice(1).replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
  });

  it('uma linha por lançamento, do mais antigo ao mais novo, com data dd/mm/aaaa, valor positivo e rótulos em português', () => {
    const parsed = parseCsv(buildRecordsCsv(rows));
    expect(parsed).toHaveLength(5);
    expect(parsed[1]).toEqual(['01/09/2026', 'Recebimento', 'Salário', 'Salário', '6000,00', 'Conta principal', 'Anotado']);
    expect(parsed[2]).toEqual(['06/10/2026', 'Gasto', 'Mercado; feira "boa"', 'Moradia', '1400,00', 'Conta principal', 'Anotado']);
    expect(parsed[3]).toEqual(['06/10/2026', 'Gasto', "'=CMD()", 'Sem categoria', '0,05', 'Conta principal', 'Anotado']);
    expect(parsed[4]).toEqual(['07/10/2026', 'Pagamento de fatura', 'Fatura Cartão Exemplo (novembro)', 'Moradia', '550,00', 'Conta principal', 'Fatura']);
    for (const line of parsed.slice(1)) expect(line).toHaveLength(7);
    // Nenhum valor negativo: o tipo diz se é gasto ou recebimento.
    for (const line of parsed.slice(1)) expect(line[4]).not.toMatch(/^-/);
  });

  it('o CSV nunca leva id, autoria nem chave de nota', () => {
    const key64 = 'ab'.repeat(32);
    const csv = buildRecordsCsv(exportRows([rec({ id: 'r-secreto', occurredOn: '2026-10-06', receiptKey: key64 })], CTX));
    expect(csv).not.toContain('r-secreto');
    expect(csv).not.toContain('pessoa-secreta');
    expect(csv).not.toContain(key64);
    expect(csv).not.toContain('a1;');
  });

  it('cabeçalho e valores de cartão: apelido e final, valor total e parcelas', () => {
    const entry = {
      id: 'e-secreto',
      contextId: 'c1',
      cardId: 'k1',
      kind: 'compra',
      description: '+1 compra',
      category: 'Lazer',
      chargeType: null,
      purchasedOn: '2026-10-05',
      amountCents: 150_000,
      installments: 10,
      invoiceMonth: '2026-11',
      sourceMonth: null,
      paymentRecordId: null,
      receiptKey: 'cd'.repeat(32),
      createdBy: 'pessoa-secreta',
      version: 1,
      createdAt: '2026-10-05T10:00:00.000Z',
      updatedAt: '2026-10-05T10:00:00.000Z',
    } satisfies CardEntry;
    const csv = buildPurchasesCsv(exportPurchaseRows([entry], CTX));
    expect(csv.slice(1).split(CSV_EOL)[0]).toBe('Data da compra;Cartão;Descrição;Categoria;Valor total (R$);Parcelas');
    expect(CSV_PURCHASE_HEADER).toHaveLength(6);
    expect(parseCsv(csv)[1]).toEqual(['05/10/2026', 'Cartão Exemplo (final 1234)', "'+1 compra", 'Lazer', '1500,00', '10']);
    expect(csv).not.toContain('e-secreto');
    expect(csv).not.toContain('cd'.repeat(32));
    expect(exportCardLabel({ name: 'Cartão', lastDigits: null })).toBe('Cartão');
  });

  it('a origem diz se o gasto veio de conta a pagar, gasto fixo, parcelamento, conta do ano ou fatura', () => {
    const series = (kind: 'mensal' | 'parcelada' | 'anual') => ({ series: { id: 's', number: 1, kind, nature: 'conta' as const, installmentTotal: null, partsPerYear: null } });
    const commitments = new Map<string, Pick<Commitment, 'series'>>([
      ['avulsa', { series: null }],
      ['fixa', series('mensal')],
      ['parcela', series('parcelada')],
      ['ano', series('anual')],
    ]);
    const of = (over: Partial<FinancialRecord>) => recordOriginOf({ invoice: null, commitmentId: null, ...over }, commitments);
    expect(of({})).toBe('anotado');
    expect(of({ commitmentId: 'avulsa' })).toBe('conta_a_pagar');
    expect(of({ commitmentId: 'fixa' })).toBe('gasto_fixo');
    expect(of({ commitmentId: 'parcela' })).toBe('parcelamento');
    expect(of({ commitmentId: 'ano' })).toBe('conta_do_ano');
    expect(of({ commitmentId: 'desconhecida' })).toBe('conta_a_pagar');
    expect(of({ commitmentId: 'fixa', invoice: { cardId: 'k1', month: '2026-11' } })).toBe('fatura');
    expect(Object.values(EXPORT_ORIGIN_LABEL)).toEqual(['Anotado', 'Conta a pagar', 'Gasto fixo', 'Parcelamento', 'Conta do ano', 'Fatura']);
  });
});

describe('período e meses (D-047)', () => {
  it('as opções, o padrão e o intervalo de cada período', () => {
    expect(EXPORT_PERIODS).toEqual(['mes', '3m', '6m', '12m', 'ano', 'ano_passado', 'tudo']);
    expect(DEFAULT_EXPORT_PERIOD).toBe('12m');
    expect(DEFAULT_EXPORT_FORMAT).toBe('csv');
    expect(EXPORT_FORMATS).toEqual(['csv', 'pdf']);
    expect(exportRange('mes', '2026-10-07')).toEqual({ from: '2026-10-01', to: null });
    expect(exportRange('3m', '2026-10-07')).toEqual({ from: '2026-08-01', to: null });
    expect(exportRange('12m', '2026-10-07')).toEqual({ from: '2025-11-01', to: null });
    expect(exportRange('ano', '2026-10-07')).toEqual({ from: '2026-01-01', to: '2026-12-31' });
    expect(exportRange('ano_passado', '2026-10-07')).toEqual({ from: '2025-01-01', to: '2025-12-31' });
    expect(exportRange('tudo', '2026-10-07')).toEqual({ from: null, to: null });
  });

  it('o filtro da leitura só tem o período', () => {
    expect(exportFilterOf('6m', '2026-10-07')).toEqual({ from: '2026-05-01', to: null, kind: null, category: null, accountId: null, minCents: null, maxCents: null, terms: [] });
  });

  it('os meses do resumo vão do início ao mês de hoje, do mais antigo ao mais novo', () => {
    expect(exportMonths('mes', '2026-10-07', [])).toEqual(['2026-10']);
    expect(exportMonths('3m', '2026-10-07', [])).toEqual(['2026-08', '2026-09', '2026-10']);
    expect(exportMonths('12m', '2026-10-07', [])).toHaveLength(12);
    expect(exportMonths('12m', '2026-10-07', [])[0]).toBe('2025-11');
    expect(exportMonths('ano', '2026-10-07', [])).toHaveLength(10);
    expect(exportMonths('ano', '2026-10-07', []).at(-1)).toBe('2026-10');
    expect(exportMonths('ano_passado', '2026-10-07', [])).toHaveLength(12);
    expect(exportMonths('ano_passado', '2026-10-07', []).at(-1)).toBe('2025-12');
    // "Tudo" começa no mês do registro mais antigo; sem registro, só o mês de hoje.
    expect(exportMonths('tudo', '2026-10-07', [{ occurredOn: '2025-08-20' }, { occurredOn: '2026-03-01' }])[0]).toBe('2025-08');
    expect(exportMonths('tudo', '2026-10-07', [])).toEqual(['2026-10']);
  });
});

describe('totais por mês iguais aos do Resumo (D-047)', () => {
  it('Recebido, Pago, Diferença e Por categoria de cada mês saem das mesmas contas do Resumo, com pagamento de fatura dividido por categoria', async () => {
    const repo = await createDemoRepository();
    const ctx = (await repo.getSpace())!.personalContextId;
    // Duas compras de setembro caem na fatura de outubro (fechada em 03/10), paga em 07/10: o gasto entra em outubro e se divide
    // pelas categorias da fatura.
    const [card] = await repo.listCards(ctx);
    await repo.addCardPurchase(key(), card!.id, { description: 'Livro', category: 'Educação', purchasedOn: '2026-09-20', totalCents: 20_000, installments: 1 });
    await repo.addCardPurchase(key(), card!.id, { description: 'Jantar', category: 'Lazer', purchasedOn: '2026-09-21', totalCents: 10_000, installments: 1 });
    const invoice = (await repo.listInvoiceItems(card!.id)).find((i) => i.month === '2026-10')!;
    expect(invoice.totalCents).toBe(30_000);
    await repo.payInvoice(key(), card!.id, '2026-10', invoice.commitmentVersion!, invoice.totalCents, DEMO_TODAY);

    const load = await loadExportSource(repo, ctx, '12m', DEMO_TODAY, { withInvoices: true });
    expect(load.ok).toBe(true);
    if (!load.ok) return;
    const report = buildExportReport(load.source);
    expect(report.months.map((m) => m.month)).toEqual(exportMonths('12m', DEMO_TODAY, []));
    expect(load.source.invoices.length).toBeGreaterThan(0);

    const all = [...(await repo.listRecords(ctx, '2026-09')), ...(await repo.listRecords(ctx, '2026-10'))];
    const invoices = await loadInvoicesOfRecords(repo, all, DEMO_TODAY);
    for (const month of ['2026-09', '2026-10'] as const) {
      const resumo = summarizeMonth(await repo.listRecords(ctx, month), ctx, month);
      const mine = report.months.find((m) => m.month === month)!;
      expect([mine.receivedCents, mine.paidCents, mine.differenceCents]).toEqual([resumo.receivedCents, resumo.paidCents, resumo.differenceCents]);
      expect(mine.categories).toEqual(categoryBreakdown(resumo.composition.paid, invoices));
      expect(mine.rows).toHaveLength(resumo.recordCount);
    }
    const oct = report.months.find((m) => m.month === '2026-10')!;
    // 6.000 recebidos; 2.500 (aluguel) + 1.400 (mercado) + 300 (fatura) pagos.
    expect([oct.receivedCents, oct.paidCents, oct.differenceCents]).toEqual([600_000, 420_000, 180_000]);
    expect(oct.categories.map((c) => [c.label, c.cents])).toEqual([
      ['Moradia', 250_000],
      ['Mercado', 140_000],
      ['Educação', 20_000],
      ['Lazer', 10_000],
    ]);
    expect(oct.rows.find((r) => r.kind === 'pagamento_fatura')).toMatchObject({ amountCents: 30_000, origin: 'fatura', account: 'Conta principal' });
    // Meses sem lançamento ficam com zero, como no Resumo.
    expect(report.months.find((m) => m.month === '2026-08')).toMatchObject({ receivedCents: 0, paidCents: 0, differenceCents: 0, rows: [] });
    // O período é a soma dos meses.
    expect(report.totals).toEqual({ receivedCents: 1_200_000, paidCents: 795_000, differenceCents: 405_000 });
  });

  it('sem a fatura na lista, o pagamento fica na categoria dele; o total de Pago não muda', async () => {
    const repo = await createDemoRepository();
    const ctx = (await repo.getSpace())!.personalContextId;
    const load = await loadExportSource(repo, ctx, 'mes', DEMO_TODAY);
    if (!load.ok) throw new Error('esperava ok');
    expect(load.source.invoices).toEqual([]);
    const [oct] = buildExportReport(load.source).months;
    expect([oct!.receivedCents, oct!.paidCents, oct!.differenceCents]).toEqual([600_000, 390_000, 210_000]);
  });
});

describe('leitura (D-047)', () => {
  it('lê o período todo, as compras no cartão, as contas e a origem de gasto fixo, e monta os dois CSV', async () => {
    const repo = await createDemoRepository();
    const ctx = (await repo.getSpace())!.personalContextId;
    const load = await loadExportSource(repo, ctx, '12m', DEMO_TODAY);
    if (!load.ok) throw new Error('esperava ok');
    const built = buildExportFiles(load.source, 'csv');
    expect(built.empty).toBe(false);
    expect(built.files.map((f) => f.fileName)).toEqual(['clarevo-lancamentos-2026-10-07.csv', 'clarevo-compras-no-cartao-2026-10-07.csv']);
    expect([built.recordCount, built.purchaseCount]).toEqual([6, 3]);
    const records = parseCsv(built.files[0]!.content);
    expect(records.slice(1).map((r) => r.slice(0, 2))).toEqual([
      ['01/09/2026', 'Recebimento'],
      ['05/09/2026', 'Gasto'],
      ['12/09/2026', 'Gasto'],
      ['01/10/2026', 'Recebimento'],
      ['05/10/2026', 'Gasto'],
      ['06/10/2026', 'Gasto'],
    ]);
    expect(records).toHaveLength(7);
    const aluguel = records.find((r) => r[0] === '05/10/2026')!;
    expect(aluguel).toEqual(['05/10/2026', 'Gasto', 'Aluguel', 'Moradia', '2500,00', 'Conta principal', 'Gasto fixo']);
    expect(records.find((r) => r[0] === '06/10/2026')).toEqual(['06/10/2026', 'Gasto', 'Mercado', 'Mercado', '1400,00', 'Carteira', 'Anotado']);
    const purchases = parseCsv(built.files[1]!.content);
    expect(purchases).toHaveLength(4);
    expect(purchases.find((r) => r[2] === 'Notebook')).toEqual(['05/10/2026', 'Cartão Exemplo (final 1234)', 'Notebook', 'Educação', '1500,00', '10']);
    // As compras no cartão não entram no CSV de lançamentos nem em nenhum total.
    expect(built.files[0]!.content).not.toContain('Notebook');
  });

  it('só um arquivo quando não há compras no cartão; nenhum quando não há nada', async () => {
    const repo = await createDemoRepository({ cards: false });
    const ctx = (await repo.getSpace())!.personalContextId;
    const load = await loadExportSource(repo, ctx, '12m', DEMO_TODAY);
    if (!load.ok) throw new Error('esperava ok');
    expect(buildExportFiles(load.source, 'csv').files.map((f) => f.id)).toEqual(['lancamentos']);
    const empty = await loadExportSource(repo, ctx, 'ano_passado', DEMO_TODAY);
    if (!empty.ok) throw new Error('esperava ok');
    expect(buildExportFiles(empty.source, 'csv')).toMatchObject({ empty: true, files: [], recordCount: 0, purchaseCount: 0 });
    expect(buildExportFiles(empty.source, 'pdf').empty).toBe(true);
  });

  it('a conta nova (sem registro) não tem o que exportar e nunca recebe exemplo', async () => {
    const { MemoryRepository } = await import('../src');
    const repo = new MemoryRepository({ actorId: 'pessoa-nova', displayName: 'Jade', today: () => DEMO_TODAY, latencyMs: 0 });
    const ctx = (await repo.ensurePersonalSpace('Conta principal')).personalContextId;
    const load = await loadExportSource(repo, ctx, 'tudo', DEMO_TODAY, { withInvoices: true });
    if (!load.ok) throw new Error('esperava ok');
    expect(buildExportFiles(load.source, 'csv').empty).toBe(true);
  });

  it('passou de 20.000 linhas: não monta nada e pede um período menor', async () => {
    const repo = await createDemoRepository();
    const ctx = (await repo.getSpace())!.personalContextId;
    expect(EXPORT_MAX_ROWS).toBe(20_000);
    const asked: unknown[] = [];
    const fake = Object.create(repo) as RecordsRepository;
    fake.searchRecords = async (_c, _f, limit) => {
      asked.push(limit);
      return { items: [], truncated: true };
    };
    expect(await loadExportSource(fake, ctx, 'tudo', DEMO_TODAY)).toEqual({ ok: false, reason: 'muitas_linhas' });
    expect(asked).toEqual([EXPORT_MAX_ROWS]);
    // Registros e compras juntos passando do limite também contam.
    const half = Object.create(repo) as RecordsRepository;
    const item = (await repo.searchRecords(ctx, exportFilterOf('tudo', DEMO_TODAY))).items[0]!;
    half.searchRecords = async () => ({ items: Array.from({ length: EXPORT_MAX_ROWS }, (_, i) => ({ ...item, id: `r${i}` })), truncated: false });
    expect(await loadExportSource(half, ctx, 'tudo', DEMO_TODAY)).toEqual({ ok: false, reason: 'muitas_linhas' });
    expect(EXPORT_TEXT.tooMany).toContain('20.000');
  });

  it('o repositório aceita o limite da leitura e avisa que havia mais', async () => {
    const repo = await createDemoRepository();
    const ctx = (await repo.getSpace())!.personalContextId;
    const filter = exportFilterOf('tudo', DEMO_TODAY);
    expect((await repo.searchRecords(ctx, filter, 2))).toMatchObject({ truncated: true, items: expect.any(Array) });
    expect((await repo.searchRecords(ctx, filter, 2)).items).toHaveLength(2);
    expect((await repo.searchRecords(ctx, filter, 6)).truncated).toBe(false);
    expect((await repo.searchCardPurchases(ctx, filter, 1)).truncated).toBe(true);
    expect((await repo.searchRecords(ctx, filter)).items).toHaveLength(6);
  });

  it('a conta paga com muito atraso é achada pelo id quando a leitura por vencimento não a traz', async () => {
    const repo = await createDemoRepository();
    const ctx = (await repo.getSpace())!.personalContextId;
    const reads: string[] = [];
    const fake = Object.create(repo) as RecordsRepository;
    fake.listCommitmentsDueBetween = async () => [];
    fake.getCommitment = async (id) => {
      reads.push(id);
      return repo.getCommitment(id);
    };
    const load = await loadExportSource(fake, ctx, '12m', DEMO_TODAY);
    if (!load.ok) throw new Error('esperava ok');
    expect(reads).toHaveLength(1);
    const aluguel = exportRows(load.source.records, { accounts: load.source.accounts, cards: load.source.cards, commitments: load.source.commitments }).find((r) => r.description === 'Aluguel' && r.date === '2026-10-05');
    expect(aluguel?.origin).toBe('gasto_fixo');
  });
});

describe('HTML do PDF (D-047)', () => {
  const source: ExportSource = {
    contextId: 'c1',
    period: '3m',
    today: '2026-10-11',
    records: [
      rec({ id: 'r1', occurredOn: '2026-10-01', kind: 'receita', category: 'Salário', description: 'Salário <b>x</b>', amountCents: 600_000 }),
      rec({ id: 'r2', occurredOn: '2026-10-05', description: 'Aluguel & cia', category: 'Moradia', amountCents: 250_000 }),
      rec({ id: 'r3', occurredOn: '2026-09-05', description: 'Mercado', category: 'Mercado', amountCents: 40_000, receiptKey: 'ef'.repeat(32) }),
    ],
    purchases: [],
    accounts: CTX.accounts,
    cards: CTX.cards,
    commitments: new Map(),
    invoices: [],
  };

  it('tem o logotipo "clarevo.", a data de geração, o período e o resumo de cada mês', () => {
    const html = exportReportHtml(buildExportReport(source));
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('lang="pt-BR"');
    expect(html).toContain('clarevo<span class="dot">.</span>');
    expect(html).toContain('Gerado em 11/10/2026');
    expect(html).toContain('Período: Últimos 3 meses (de agosto a outubro de 2026)');
    for (const label of ['Recebido', 'Pago', 'Diferença', 'Por categoria', 'Lançamentos', 'Outubro de 2026', 'Setembro de 2026', 'Agosto de 2026', 'No período']) expect(html).toContain(label);
    expect(html).toContain(formatBRL(600_000));
    expect(html).toContain(formatBRL(350_000));
    expect(html).toContain(formatBRL(250_000));
    expect(html).toContain('Sem lançamentos neste mês.');
    expect(html).toContain('Não é saldo da conta nem dinheiro disponível.');
  });

  it('mês sem lançamento vira uma linha só e os meses com lançamento levam a tabela de totais', () => {
    const html = exportReportHtml(buildExportReport(source));
    const agosto = html.slice(html.indexOf('Agosto de 2026'), html.indexOf('Setembro de 2026'));
    expect(agosto).toContain('Sem lançamentos neste mês.');
    expect(agosto).not.toContain('<table');
    const outubro = html.slice(html.indexOf('Outubro de 2026'));
    expect(outubro).toContain('<table class="sum">');
    // Soma do período: agosto vazio não muda nada.
    expect(buildExportReport(source).totals).toEqual({ receivedCents: 600_000, paidCents: 290_000, differenceCents: 310_000 });
  });

  it('escapa o texto da pessoa e não leva chave de nota, id nem autoria', () => {
    const html = exportReportHtml(buildExportReport(source));
    expect(html).not.toContain('<b>x</b>');
    expect(html).toContain('Salário &lt;b&gt;x&lt;/b&gt;');
    expect(html).toContain('Aluguel &amp; cia');
    expect(html).not.toContain('ef'.repeat(32));
    expect(html).not.toContain('pessoa-secreta');
    expect(html).not.toMatch(/\br[123]\b/);
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
  });

  it('usa o logotipo em SVG quando o app o passa, e lista as compras no cartão à parte, sem somar em Pago', () => {
    const purchase = {
      id: 'e1',
      contextId: 'c1',
      cardId: 'k1',
      kind: 'compra',
      description: 'Notebook',
      category: 'Educação',
      chargeType: null,
      purchasedOn: '2026-10-05',
      amountCents: 150_000,
      installments: 10,
      invoiceMonth: '2026-11',
      sourceMonth: null,
      paymentRecordId: null,
      receiptKey: null,
      createdBy: 'p1',
      version: 1,
      createdAt: '2026-10-05T10:00:00.000Z',
      updatedAt: '2026-10-05T10:00:00.000Z',
    } satisfies CardEntry;
    const report = buildExportReport({ ...source, purchases: [purchase] });
    const html = exportReportHtml(report, { logoSvg: '<svg id="logo-oficial"></svg>' });
    expect(html).toContain('<svg id="logo-oficial"></svg>');
    expect(html).not.toContain('clarevo<span');
    expect(html).toContain('Compras no cartão');
    expect(html).toContain('Cartão Exemplo (final 1234)');
    expect(html).toContain('1 compra · R$ 1.500,00 no total das compras');
    expect(html).toContain('não entram em Pago');
    expect(report.months.find((m) => m.month === '2026-10')!.paidCents).toBe(250_000);
  });

  it('o PDF é um arquivo só, com o nome certo, e o relatório de um mês só não repete a soma do período', () => {
    const built = buildExportFiles({ ...source, period: 'mes', records: source.records.filter((r) => r.occurredOn.startsWith('2026-10')) }, 'pdf');
    expect(built.files).toHaveLength(1);
    expect(built.files[0]).toMatchObject({ id: 'resumo', fileName: 'clarevo-resumo-2026-10-11.pdf', mime: 'application/pdf', kind: 'pdf' });
    expect(built.files[0]!.content).not.toContain('No período');
    expect(exportFileName('lancamentos', '2026-10-11')).toBe('clarevo-lancamentos-2026-10-11.csv');
    expect(exportFileName('compras', '2026-10-11')).toBe('clarevo-compras-no-cartao-2026-10-11.csv');
    expect(exportFileName('resumo', '2026-10-11')).toBe('clarevo-resumo-2026-10-11.pdf');
  });
});

describe('biometria antes de gerar (D-047)', () => {
  it('confirmar ou não ter biometria deixa seguir; cancelar ou falhar, não', () => {
    expect(exportAfterAuth('ok')).toBe('seguir');
    expect(exportAfterAuth('indisponivel')).toBe('seguir');
    expect(exportAfterAuth('cancelado')).toBe('cancelado');
    expect(exportAfterAuth('falhou')).toBe('falhou');
  });
});
