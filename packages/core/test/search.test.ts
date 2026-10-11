import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SEARCH,
  DEFAULT_SEARCH_DRAFT,
  DEMO_TODAY,
  MemoryRepository,
  NO_CATEGORY_LABEL,
  SEARCH_LIMIT,
  SEARCH_PERIODS,
  SEARCH_TEXT,
  SEARCH_TEXT_MAX,
  addMonths,
  createDemoRepository,
  effectiveSearchCategory,
  groupByMonth,
  includesCardPurchases,
  isDefaultDraft,
  moreFiltersActive,
  newOperationKey,
  normalizeSearchText,
  purchaseMatchesFilter,
  recordMatchesFilter,
  searchAccountOptions,
  searchCategoryOptions,
  searchFilterOf,
  searchFromDraft,
  searchRange,
  searchResultPurchases,
  searchResultRecords,
  searchSummaryLines,
  searchTerms,
  summarizeMonth,
  summarizePurchases,
  summarizeSearch,
  textMatchesSearch,
  type CardEntry,
  type FinancialAccount,
  type FinancialRecord,
  type RecordSearchFilter,
  type SearchDraft,
  type SearchParams,
} from '../src';

const NONE: RecordSearchFilter = { from: null, to: null, kind: null, category: null, accountId: null, minCents: null, maxCents: null };

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
    createdBy: 'p1',
    version: 1,
    createdAt: `${over.occurredOn}T10:00:00.000Z`,
    updatedAt: `${over.occurredOn}T10:00:00.000Z`,
    ...over,
  };
}

function purchase(over: Partial<CardEntry> & Pick<CardEntry, 'id'>): CardEntry {
  return {
    contextId: 'c1',
    cardId: 'k1',
    kind: 'compra',
    description: 'Tênis',
    category: 'Lazer',
    chargeType: null,
    purchasedOn: '2026-10-05',
    amountCents: 60000,
    installments: 3,
    invoiceMonth: '2026-11',
    sourceMonth: null,
    paymentRecordId: null,
    receiptKey: null,
    createdBy: 'p1',
    version: 1,
    createdAt: '2026-10-05T10:00:00.000Z',
    updatedAt: '2026-10-05T10:00:00.000Z',
    ...over,
  };
}

const params = (over: Partial<SearchParams> = {}): SearchParams => ({ ...DEFAULT_SEARCH, ...over });

describe('texto buscado (D-045)', () => {
  it('normaliza: minúsculas, sem acentos, espaços juntos', () => {
    expect(normalizeSearchText('  Conta de LUZ  ')).toBe('conta de luz');
    expect(normalizeSearchText('Farmácia São João')).toBe('farmacia sao joao');
    expect(normalizeSearchText('AÇÚCAR, café e pão')).toBe('acucar, cafe e pao');
    expect(normalizeSearchText('água')).toBe('agua');
    expect(normalizeSearchText('')).toBe('');
  });

  it('as palavras buscadas vêm normalizadas e o texto longo é cortado', () => {
    expect(searchTerms('  Conta   de Luz ')).toEqual(['conta', 'de', 'luz']);
    expect(searchTerms('   ')).toEqual([]);
    expect(searchTerms('a'.repeat(SEARCH_TEXT_MAX + 20))).toEqual(['a'.repeat(SEARCH_TEXT_MAX)]);
  });

  it('combina sem diferenciar maiúsculas nem acentos, com todas as palavras em qualquer ordem', () => {
    expect(textMatchesSearch('Conta de Luz', 'LUZ')).toBe(true);
    expect(textMatchesSearch('Farmácia', 'farmacia')).toBe(true);
    expect(textMatchesSearch('Farmacia', 'FARMÁCIA')).toBe(true);
    expect(textMatchesSearch('Conta de Luz (Enel)', 'luz conta')).toBe(true);
    expect(textMatchesSearch('Conta de Luz', 'luz agua')).toBe(false);
    expect(textMatchesSearch('Mercado', 'merc')).toBe(true);
    expect(textMatchesSearch('Mercado', 'xyz')).toBe(false);
    // Sem texto, tudo combina.
    expect(textMatchesSearch('Qualquer coisa', '')).toBe(true);
    expect(textMatchesSearch('Qualquer coisa', '   ')).toBe(true);
  });
});

describe('período e filtro do servidor', () => {
  it('os últimos N meses incluem o mês de hoje e os anteriores, inteiros', () => {
    expect(searchRange('3m', '2026-10-07')).toEqual({ from: '2026-08-01', to: null });
    expect(searchRange('6m', '2026-10-07')).toEqual({ from: '2026-05-01', to: null });
    expect(searchRange('12m', '2026-10-07')).toEqual({ from: '2025-11-01', to: null });
    expect(searchRange('3m', '2026-02-28')).toEqual({ from: '2025-12-01', to: null });
  });

  it('este ano, ano passado e tudo', () => {
    expect(searchRange('ano', '2026-10-07')).toEqual({ from: '2026-01-01', to: '2026-12-31' });
    expect(searchRange('ano_passado', '2026-10-07')).toEqual({ from: '2025-01-01', to: '2025-12-31' });
    expect(searchRange('tudo', '2026-10-07')).toEqual({ from: null, to: null });
    expect(SEARCH_PERIODS).toHaveLength(6);
    expect(DEFAULT_SEARCH.period).toBe('12m');
  });

  it('o filtro do servidor leva período, tipo, categoria, conta e valor, mas não o texto', () => {
    const f = searchFilterOf(params({ text: 'luz', kind: 'despesa', period: 'ano', category: 'Moradia', accountId: 'a1', minCents: 500, maxCents: 9000 }), '2026-10-07');
    expect(f).toEqual({ from: '2026-01-01', to: '2026-12-31', kind: 'despesa', category: 'Moradia', accountId: 'a1', minCents: 500, maxCents: 9000 });
    expect(searchFilterOf(DEFAULT_SEARCH, '2026-10-07')).toEqual({ ...NONE, from: '2025-11-01' });
  });

  it('o registro passa pelo filtro: datas incluem os limites, tipo, categoria, conta e valor', () => {
    const r = rec({ id: 'r1', occurredOn: '2026-10-05', amountCents: 5000, category: null, accountId: 'a2' });
    expect(recordMatchesFilter(r, NONE)).toBe(true);
    expect(recordMatchesFilter(r, { ...NONE, from: '2026-10-05', to: '2026-10-05' })).toBe(true);
    expect(recordMatchesFilter(r, { ...NONE, from: '2026-10-06' })).toBe(false);
    expect(recordMatchesFilter(r, { ...NONE, to: '2026-10-04' })).toBe(false);
    expect(recordMatchesFilter(r, { ...NONE, kind: 'despesa' })).toBe(true);
    expect(recordMatchesFilter(r, { ...NONE, kind: 'receita' })).toBe(false);
    expect(recordMatchesFilter(r, { ...NONE, category: NO_CATEGORY_LABEL })).toBe(true);
    expect(recordMatchesFilter(r, { ...NONE, category: 'Moradia' })).toBe(false);
    expect(recordMatchesFilter(rec({ id: 'r2', occurredOn: '2026-10-05' }), { ...NONE, category: NO_CATEGORY_LABEL })).toBe(false);
    expect(recordMatchesFilter(r, { ...NONE, accountId: 'a2' })).toBe(true);
    expect(recordMatchesFilter(r, { ...NONE, accountId: 'a1' })).toBe(false);
    expect(recordMatchesFilter(r, { ...NONE, minCents: 5000, maxCents: 5000 })).toBe(true);
    expect(recordMatchesFilter(r, { ...NONE, minCents: 5001 })).toBe(false);
    expect(recordMatchesFilter(r, { ...NONE, maxCents: 4999 })).toBe(false);
  });

  it('a compra no cartão passa pela data da compra, categoria e valor total; recebimento e conta a excluem', () => {
    const e = purchase({ id: 'e1' });
    expect(purchaseMatchesFilter(e, NONE)).toBe(true);
    expect(purchaseMatchesFilter(e, { ...NONE, from: '2026-10-05', to: '2026-10-05' })).toBe(true);
    expect(purchaseMatchesFilter(e, { ...NONE, from: '2026-10-06' })).toBe(false);
    expect(purchaseMatchesFilter(e, { ...NONE, category: 'Lazer' })).toBe(true);
    expect(purchaseMatchesFilter(e, { ...NONE, category: NO_CATEGORY_LABEL })).toBe(false);
    // O valor é o total da compra, não a parcela de cada mês.
    expect(purchaseMatchesFilter(e, { ...NONE, minCents: 60000, maxCents: 60000 })).toBe(true);
    expect(purchaseMatchesFilter(e, { ...NONE, maxCents: 20000 })).toBe(false);
    expect(purchaseMatchesFilter(e, { ...NONE, kind: 'despesa' })).toBe(true);
    expect(purchaseMatchesFilter(e, { ...NONE, kind: 'receita' })).toBe(false);
    expect(purchaseMatchesFilter(e, { ...NONE, accountId: 'a1' })).toBe(false);
    expect(purchaseMatchesFilter(purchase({ id: 'e2', kind: 'encargo', purchasedOn: null }), NONE)).toBe(false);
    expect(includesCardPurchases({ kind: 'todos', accountId: null })).toBe(true);
    expect(includesCardPurchases({ kind: 'despesa', accountId: null })).toBe(true);
    expect(includesCardPurchases({ kind: 'receita', accountId: null })).toBe(false);
    expect(includesCardPurchases({ kind: 'todos', accountId: 'a1' })).toBe(false);
  });
});

describe('resultado: texto, ordem, resumo e agrupamento', () => {
  const records = [
    rec({ id: 'r1', occurredOn: '2026-08-10', description: 'Conta de luz', amountCents: 15000 }),
    rec({ id: 'r2', occurredOn: '2026-09-10', description: 'Luz', amountCents: 17000 }),
    rec({ id: 'r3', occurredOn: '2026-10-10', description: 'LUZ - Enel', amountCents: 16050 }),
    rec({ id: 'r4', occurredOn: '2026-10-12', description: 'Mercado', amountCents: 9000, category: 'Mercado' }),
    rec({ id: 'r5', occurredOn: '2026-10-01', description: 'Salário', amountCents: 600000, kind: 'receita', category: 'Salário' }),
    rec({ id: 'r6', occurredOn: '2025-03-10', description: 'Luz', amountCents: 100 }),
  ];

  it('filtra pelo texto sem diferenciar acentos, repassa o filtro do servidor e ordena do mais recente ao mais antigo', () => {
    const found = searchResultRecords(records, params({ text: 'luz' }), '2026-10-07');
    // r6 (março de 2025) fica fora dos últimos 12 meses.
    expect(found.map((r) => r.id)).toEqual(['r3', 'r2', 'r1']);
    expect(searchResultRecords(records, params({ text: 'salario' }), '2026-10-07').map((r) => r.id)).toEqual(['r5']);
    expect(searchResultRecords(records, params({ text: 'luz', period: 'tudo' }), '2026-10-07').map((r) => r.id)).toEqual(['r3', 'r2', 'r1', 'r6']);
    expect(searchResultRecords(records, params({ kind: 'receita' }), '2026-10-07').map((r) => r.id)).toEqual(['r5']);
  });

  it('empate de data: o criado depois vem primeiro', () => {
    const a = rec({ id: 'a', occurredOn: '2026-10-10', createdAt: '2026-10-10T08:00:00.000Z' });
    const b = rec({ id: 'b', occurredOn: '2026-10-10', createdAt: '2026-10-10T09:00:00.000Z' });
    expect(searchResultRecords([a, b], params(), '2026-10-07').map((r) => r.id)).toEqual(['b', 'a']);
  });

  it('o resumo soma gastos e recebimentos e dá a média por mês com gasto (centavos, metade para cima)', () => {
    const s = summarizeSearch(searchResultRecords(records, params({ text: 'luz' }), '2026-10-07'));
    expect(s.paid).toEqual({ count: 3, cents: 48050, months: 3 });
    expect(s.received).toEqual({ count: 0, cents: 0, months: 0 });
    // 48.050 / 3 = 16.016,67 centavos: 16.017.
    expect(s.averagePaidCents).toBe(16017);
    expect(searchSummaryLines(s)).toEqual(['3 gastos · R$ 480,50 no período', 'média de R$ 160,17 por mês com gasto']);
  });

  it('a média usa só os meses que tiveram gasto, e metade sobe', () => {
    const two = [rec({ id: 'x1', occurredOn: '2026-10-01', amountCents: 100 }), rec({ id: 'x2', occurredOn: '2026-10-02', amountCents: 101 })];
    expect(summarizeSearch(two).averagePaidCents).toBe(201);
    const half = [rec({ id: 'y1', occurredOn: '2026-09-01', amountCents: 1 }), rec({ id: 'y2', occurredOn: '2026-10-02', amountCents: 2 })];
    // (1 + 2) / 2 = 1,5 → 2.
    expect(summarizeSearch(half).averagePaidCents).toBe(2);
  });

  it('o exemplo da especificação: 12 gastos em 12 meses, R$ 1.932,40, média de R$ 161,03', () => {
    const spec = Array.from({ length: 12 }, (_, i) =>
      rec({ id: `s${i}`, occurredOn: `${addMonths('2025-11', i)}-10`, amountCents: i === 0 ? 16107 : 16103 }),
    );
    const s = summarizeSearch(spec);
    expect(s.paid).toEqual({ count: 12, cents: 193240, months: 12 });
    expect(s.averagePaidCents).toBe(16103);
    expect(searchSummaryLines(s)).toEqual(['12 gastos · R$ 1.932,40 no período', 'média de R$ 161,03 por mês com gasto']);
  });

  it('gastos e recebimentos juntos: as duas somas e a média só dos gastos; sem registros, nenhuma linha', () => {
    const all = summarizeSearch(records);
    expect(all.paid).toEqual({ count: 5, cents: 57150, months: 4 });
    expect(all.received).toEqual({ count: 1, cents: 600000, months: 1 });
    // 57.150 / 4 = 14.287,5 centavos: metade para cima.
    expect(all.averagePaidCents).toBe(14288);
    expect(searchSummaryLines(all)).toEqual(['5 gastos · R$ 571,50 no período', 'média de R$ 142,88 por mês com gasto', '1 recebimento · R$ 6.000,00 no período']);
    expect(searchSummaryLines(summarizeSearch(records.filter((r) => r.kind === 'receita')))).toEqual(['1 recebimento · R$ 6.000,00 no período']);
    expect(searchSummaryLines(summarizeSearch([]))).toEqual([]);
    expect(summarizeSearch([]).averagePaidCents).toBeNull();
    expect(SEARCH_TEXT.expenses(1, 100)).toBe('1 gasto · R$ 1,00 no período');
    expect(SEARCH_TEXT.incomes(1, 100)).toBe('1 recebimento · R$ 1,00 no período');
    expect(SEARCH_TEXT.incomes(3, 600000)).toBe('3 recebimentos · R$ 6.000,00 no período');
  });

  it('agrupa por mês, do mais recente ao mais antigo, cada mês uma vez', () => {
    const found = searchResultRecords(records, params({ period: 'tudo' }), '2026-10-07');
    const groups = groupByMonth(found, (r) => r.occurredOn);
    expect(groups.map((g) => [g.month, g.items.map((r) => r.id)])).toEqual([
      ['2026-10', ['r4', 'r3', 'r5']],
      ['2026-09', ['r2']],
      ['2026-08', ['r1']],
      ['2025-03', ['r6']],
    ]);
    expect(groupByMonth([], (r: FinancialRecord) => r.occurredOn)).toEqual([]);
  });

  it('compras no cartão: filtro, ordem e total das compras (valor cheio, não a parcela)', () => {
    const entries = [
      purchase({ id: 'e1', description: 'Tênis de corrida', purchasedOn: '2026-10-05', amountCents: 60000, installments: 3 }),
      purchase({ id: 'e2', description: 'Notebook', purchasedOn: '2026-10-05', amountCents: 150000, installments: 10, category: 'Educação', createdAt: '2026-10-05T11:00:00.000Z' }),
      purchase({ id: 'e3', description: 'Restaurante', purchasedOn: '2026-10-06', amountCents: 20000, installments: 1 }),
      purchase({ id: 'e4', description: 'Tênis antigo', purchasedOn: '2024-01-06', amountCents: 20000 }),
      purchase({ id: 'e5', description: 'Juros', kind: 'encargo', purchasedOn: null, category: null }),
    ];
    const found = searchResultPurchases(entries, params(), '2026-10-07');
    expect(found.map((e) => e.id)).toEqual(['e3', 'e2', 'e1']);
    expect(searchResultPurchases(entries, params({ text: 'TENIS', period: 'tudo' }), '2026-10-07').map((e) => e.id)).toEqual(['e1', 'e4']);
    expect(summarizePurchases(found)).toEqual({ count: 3, totalCents: 230000 });
    expect(SEARCH_TEXT.cardsSummary(3, 230000)).toBe('3 compras · R$ 2.300,00 no total das compras');
    expect(SEARCH_TEXT.cardsSummary(1, 20000)).toBe('1 compra · R$ 200,00 no total das compras');
    expect(SEARCH_TEXT.purchaseCaption('2026-10-05', 'Cartão Exemplo', 3)).toBe('Compra · 05/10/2026 · Cartão Exemplo · em 3 vezes');
    expect(SEARCH_TEXT.purchaseCaption('2026-10-06', null, 1)).toBe('Compra · 06/10/2026 · à vista');
  });
});

describe('opções e rascunho', () => {
  it('categorias por tipo, com "Sem categoria" no fim; a que não serve ao tipo é ignorada', () => {
    expect(searchCategoryOptions('despesa')).toEqual(['Moradia', 'Mercado', 'Transporte', 'Saúde', 'Educação', 'Lazer', NO_CATEGORY_LABEL]);
    expect(searchCategoryOptions('receita')).toEqual(['Salário', 'Renda extra', 'Reembolso', NO_CATEGORY_LABEL]);
    expect(searchCategoryOptions('todos')).toHaveLength(10);
    expect(effectiveSearchCategory('despesa', 'Salário')).toBeNull();
    expect(effectiveSearchCategory('todos', 'Salário')).toBe('Salário');
    expect(effectiveSearchCategory('despesa', NO_CATEGORY_LABEL)).toBe(NO_CATEGORY_LABEL);
    expect(effectiveSearchCategory('despesa', null)).toBeNull();
  });

  const account = (id: string, name: string, over: Partial<FinancialAccount> = {}): FinancialAccount => ({
    id,
    contextId: 'c1',
    name,
    currency: 'BRL',
    initialBalanceCents: null,
    kind: 'banco',
    status: 'ativa',
    isDefault: false,
    version: 1,
    ...over,
  });

  it('conta: chips só com 2 ou mais contas ativas; a arquivada vem por último, marcada', () => {
    const one = [account('a1', 'Conta principal', { isDefault: true })];
    expect(searchAccountOptions(one)).toEqual([]);
    const two = [account('a2', 'Carteira'), account('a1', 'Conta principal', { isDefault: true }), account('a3', 'Antiga', { status: 'arquivada' })];
    expect(searchAccountOptions(two)).toEqual([
      { id: null, label: 'Todas' },
      { id: 'a1', label: 'Conta principal' },
      { id: 'a2', label: 'Carteira' },
      { id: 'a3', label: 'Antiga (arquivada)' },
    ]);
    // Uma ativa e uma arquivada ainda é "sem escolha": nenhum chip.
    expect(searchAccountOptions([account('a1', 'Conta principal', { isDefault: true }), account('a3', 'Antiga', { status: 'arquivada' })])).toEqual([]);
  });

  const draft = (over: Partial<SearchDraft> = {}): SearchDraft => ({ ...DEFAULT_SEARCH_DRAFT, ...over });

  it('lê o rascunho: valores em reais viram centavos, vazio é qualquer valor', () => {
    const ok = searchFromDraft(draft({ text: 'luz', min: '10', max: '1.234,56' }));
    expect(ok).toEqual({ ok: true, params: { ...DEFAULT_SEARCH, text: 'luz', minCents: 1000, maxCents: 123456 } });
    expect(searchFromDraft(draft())).toEqual({ ok: true, params: DEFAULT_SEARCH });
    expect(searchFromDraft(draft({ min: '0', max: '0,00' }))).toEqual({ ok: true, params: { ...DEFAULT_SEARCH, minCents: 0, maxCents: 0 } });
  });

  it('valor inválido, acima do limite ou final menor que o inicial: erro no campo, sem busca', () => {
    expect(searchFromDraft(draft({ min: 'abc' }))).toEqual({ ok: false, errors: { min: SEARCH_TEXT.amountInvalid } });
    expect(searchFromDraft(draft({ max: '12,345' }))).toEqual({ ok: false, errors: { max: SEARCH_TEXT.amountInvalid } });
    expect(searchFromDraft(draft({ max: '10.000.000,00' }))).toEqual({ ok: false, errors: { max: SEARCH_TEXT.amountInvalid } });
    expect(searchFromDraft(draft({ min: '50', max: '20' }))).toEqual({ ok: false, errors: { max: SEARCH_TEXT.amountOrder } });
    expect(searchFromDraft(draft({ min: '20', max: '20' })).ok).toBe(true);
  });

  it('a categoria que não serve ao tipo sai da busca', () => {
    const r = searchFromDraft(draft({ kind: 'despesa', category: 'Salário' }));
    expect(r.ok && r.params.category).toBeNull();
    const r2 = searchFromDraft(draft({ kind: 'despesa', category: 'Mercado' }));
    expect(r2.ok && r2.params.category).toBe('Mercado');
  });

  it('conta os filtros de "Mais filtros" e reconhece a busca como no começo', () => {
    expect(moreFiltersActive(draft())).toBe(0);
    expect(moreFiltersActive(draft({ category: 'Mercado', kind: 'despesa', accountId: 'a1', min: '1', max: ' ' }))).toBe(3);
    // Categoria que não serve ao tipo não conta.
    expect(moreFiltersActive(draft({ category: 'Salário', kind: 'despesa' }))).toBe(0);
    expect(isDefaultDraft(draft())).toBe(true);
    expect(isDefaultDraft(draft({ text: '  ' }))).toBe(true);
    expect(isDefaultDraft(draft({ text: 'luz' }))).toBe(false);
    expect(isDefaultDraft(draft({ period: 'tudo' }))).toBe(false);
    expect(isDefaultDraft(draft({ kind: 'despesa' }))).toBe(false);
    expect(isDefaultDraft(draft({ min: '5' }))).toBe(false);
  });
});

describe('MemoryRepository: buscar (D-045)', () => {
  it('na demonstração: tudo em ordem, pagamentos de conta incluídos, e a leitura não muda nenhum total', async () => {
    const repo = await createDemoRepository();
    const space = (await repo.getSpace())!;
    const ctx = space.personalContextId;
    const before = summarizeMonth(await repo.listRecords(ctx, '2026-10'), ctx, '2026-10');
    const page = await repo.searchRecords(ctx, searchFilterOf(DEFAULT_SEARCH, DEMO_TODAY));
    expect(page.truncated).toBe(false);
    expect(page.items.map((r) => `${r.occurredOn} ${r.description}`)).toEqual([
      '2026-10-06 Mercado',
      '2026-10-05 Aluguel',
      '2026-10-01 Salário',
      '2026-09-12 Mercado',
      '2026-09-05 Aluguel',
      '2026-09-01 Salário',
    ]);
    // O aluguel de outubro é o pagamento de uma conta a pagar.
    expect(page.items.find((r) => r.id && r.commitmentId)?.description).toBe('Aluguel');
    const mercado = searchResultRecords(page.items, params({ text: 'MERCADO' }), DEMO_TODAY);
    expect(summarizeSearch(mercado).paid).toEqual({ count: 2, cents: 265000, months: 2 });
    expect(summarizeSearch(mercado).averagePaidCents).toBe(132500);
    const after = summarizeMonth(await repo.listRecords(ctx, '2026-10'), ctx, '2026-10');
    expect(after).toEqual(before);
    expect([after.receivedCents, after.paidCents]).toEqual([600000, 390000]);
  });

  it('filtra por tipo, categoria, conta, período e valor no "servidor"', async () => {
    const repo = await createDemoRepository();
    const space = (await repo.getSpace())!;
    const ctx = space.personalContextId;
    const accounts = await repo.listAccounts(ctx);
    const carteira = accounts.find((a) => a.name === 'Carteira')!;
    const ids = async (over: Partial<SearchParams>) => (await repo.searchRecords(ctx, searchFilterOf(params(over), DEMO_TODAY))).items.map((r) => `${r.occurredOn} ${r.description}`);
    expect(await ids({ kind: 'receita' })).toEqual(['2026-10-01 Salário', '2026-09-01 Salário']);
    expect(await ids({ kind: 'despesa', category: 'Moradia' })).toEqual(['2026-10-05 Aluguel', '2026-09-05 Aluguel']);
    expect(await ids({ accountId: carteira.id })).toEqual(['2026-10-06 Mercado', '2026-09-12 Mercado']);
    expect(await ids({ period: '3m' })).toHaveLength(6);
    expect(await ids({ period: 'ano_passado' })).toEqual([]);
    expect(await ids({ minCents: 140000, maxCents: 250000 })).toEqual(['2026-10-06 Mercado', '2026-10-05 Aluguel', '2026-09-05 Aluguel']);
    expect(await ids({ category: NO_CATEGORY_LABEL })).toEqual([]);
  });

  it('compras no cartão: uma linha por compra, com o total e as parcelas; nunca entram em Pago', async () => {
    const repo = await createDemoRepository();
    const ctx = (await repo.getSpace())!.personalContextId;
    const page = await repo.searchCardPurchases(ctx, searchFilterOf(DEFAULT_SEARCH, DEMO_TODAY));
    expect(page.items.map((e) => [e.purchasedOn, e.description, e.amountCents, e.installments])).toEqual([
      ['2026-10-06', 'Restaurante', 20000, 1],
      ['2026-10-05', 'Notebook', 150000, 10],
      ['2026-10-05', 'Tênis de corrida', 60000, 3],
    ]);
    expect(summarizePurchases(page.items)).toEqual({ count: 3, totalCents: 230000 });
    // Só recebimentos ou uma conta de origem: nenhuma compra.
    expect((await repo.searchCardPurchases(ctx, searchFilterOf(params({ kind: 'receita' }), DEMO_TODAY))).items).toEqual([]);
    expect((await repo.searchCardPurchases(ctx, searchFilterOf(params({ accountId: 'qualquer' }), DEMO_TODAY))).items).toEqual([]);
    expect((await repo.searchCardPurchases(ctx, searchFilterOf(params({ category: 'Educação' }), DEMO_TODAY))).items.map((e) => e.description)).toEqual(['Notebook']);
    // Os registros não trazem a compra: só o pagamento da fatura (que ainda não existe) seria gasto.
    const records = await repo.searchRecords(ctx, searchFilterOf(DEFAULT_SEARCH, DEMO_TODAY));
    expect(records.items.some((r) => /tênis|notebook|restaurante/i.test(r.description))).toBe(false);
  });

  it('pagamento de fatura aparece como um gasto só, sem abrir as compras', async () => {
    let today = '2026-10-07';
    const repo = new MemoryRepository({ actorId: 'p', displayName: 'Maria', today: () => today });
    const space = await repo.ensurePersonalSpace('Conta principal');
    const ctx = space.personalContextId;
    const account = space.accounts[0]!.id;
    const card = (await repo.createCard(newOperationKey(), ctx, { name: 'Nubank', lastDigits: null, closingDay: 3, dueDay: 10, limitCents: null })).card;
    await repo.addCardPurchase(newOperationKey(), card.id, { description: 'Livro', category: 'Educação', purchasedOn: '2026-09-20', totalCents: 8000, installments: 2 });
    today = '2026-10-20';
    const invoices = await repo.listInvoiceItems(card.id);
    const october = invoices.find((i) => i.month === '2026-10')!;
    await repo.payInvoice(newOperationKey(), card.id, '2026-10', october.commitmentVersion!, october.totalCents, '2026-10-12', account);
    const found = await repo.searchRecords(ctx, searchFilterOf(params({ kind: 'despesa' }), today));
    expect(found.items).toHaveLength(1);
    expect(found.items[0]!.invoice).toEqual({ cardId: card.id, month: '2026-10' });
    expect(found.items[0]!.description).toBe('Fatura Nubank (outubro)');
    expect(found.items[0]!.amountCents).toBe(4000);
    // A compra segue no grupo à parte, com o valor total, e a soma de gastos só tem o pagamento.
    const purchases = await repo.searchCardPurchases(ctx, searchFilterOf(params({ kind: 'despesa' }), today));
    expect(summarizePurchases(purchases.items)).toEqual({ count: 1, totalCents: 8000 });
    expect(summarizeSearch(found.items).paid.cents).toBe(4000);
  });

  it('excluído não aparece, e passar de 1.000 linhas traz as mais recentes e avisa', async () => {
    const repo = new MemoryRepository({ actorId: 'p', displayName: 'Maria', today: () => '2026-10-07' });
    const space = await repo.ensurePersonalSpace('Conta principal');
    const ctx = space.personalContextId;
    const account = space.accounts[0]!.id;
    const first = await repo.createRecord(newOperationKey(), ctx, 'despesa', { accountId: account, amountCents: 100, occurredOn: '2025-01-01', description: 'Mais antigo', category: null });
    const gone = await repo.createRecord(newOperationKey(), ctx, 'despesa', { accountId: account, amountCents: 100, occurredOn: '2026-10-01', description: 'Excluído', category: null });
    await repo.deleteRecord(newOperationKey(), gone.id, gone.version);
    for (let i = 0; i < SEARCH_LIMIT - 1; i++) {
      const day = String((i % 28) + 1).padStart(2, '0');
      const month = String((i % 9) + 1).padStart(2, '0');
      await repo.createRecord(newOperationKey(), ctx, 'despesa', { accountId: account, amountCents: 100, occurredOn: `2026-${month}-${day}`, description: `Gasto ${i}`, category: null });
    }
    const filter = searchFilterOf(params({ period: 'tudo' }), '2026-10-07');
    // 1.000 registros vivos (999 + o mais antigo): exatamente no limite, sem aviso.
    let page = await repo.searchRecords(ctx, filter);
    expect(page.items).toHaveLength(SEARCH_LIMIT);
    expect(page.truncated).toBe(false);
    expect(page.items.some((r) => r.description === 'Excluído')).toBe(false);
    // Mais um: o mais antigo sai e o aviso aparece.
    await repo.createRecord(newOperationKey(), ctx, 'despesa', { accountId: account, amountCents: 100, occurredOn: '2026-09-02', description: 'Mais um', category: null });
    page = await repo.searchRecords(ctx, filter);
    expect(page.items).toHaveLength(SEARCH_LIMIT);
    expect(page.truncated).toBe(true);
    expect(page.items.some((r) => r.id === first.id)).toBe(false);
    expect(page.items[0]!.occurredOn >= page.items[SEARCH_LIMIT - 1]!.occurredOn).toBe(true);
  }, 30000);

  it('a leitura de quem não é dono do contexto volta vazia, e a busca não grava nada', async () => {
    const repo = await createDemoRepository();
    expect(await repo.searchRecords('outro-contexto', NONE)).toEqual({ items: [], truncated: false });
    expect(await repo.searchCardPurchases('outro-contexto', NONE)).toEqual({ items: [], truncated: false });
    const ctx = (await repo.getSpace())!.personalContextId;
    const before = JSON.stringify(await repo.listRecords(ctx, '2026-10'));
    await repo.searchRecords(ctx, NONE);
    expect(JSON.stringify(await repo.listRecords(ctx, '2026-10'))).toBe(before);
  });
});
