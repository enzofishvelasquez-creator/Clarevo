import { describe, expect, it } from 'vitest';
import {
  BUDGET_CATEGORIES,
  BUDGET_ERROR_TEXT,
  BUDGET_TEXT,
  DEMO_TODAY,
  LIMIT_ERROR_TEXT,
  LIMIT_TEXT,
  MemoryRepository,
  RepoError,
  budgetAmountError,
  budgetCaption,
  budgetCategoryFromParam,
  budgetCrossing,
  budgetLevel,
  budgetMonthBounds,
  budgetMonthError,
  budgetRowFor,
  categoryUsage,
  createDemoRepository,
  limitCrossing,
  limitFor,
  limitMonthError,
  limitNotesFor,
  limitStatus,
  newOperationKey,
  parseLimitPercent,
  percentFloor,
  projectCommitted,
  readMonthBudget,
  summarizeBudget,
  summarizeCommitted,
  summarizeMonth,
  upcomingCommittedMonths,
  validateBudgetDraft,
  validateLimitDraft,
  type CardEntry,
  type CategoryBudget,
  type FinancialRecord,
  type MonthBudgetLine,
} from '../src';

const key = newOperationKey;
const code = (p: Promise<unknown>) => p.then(() => null, (e: unknown) => (e instanceof RepoError ? e.code : String(e)));

/** Registro mínimo para a conta do usado (só o que a regra lê). */
const rec = (kind: 'despesa' | 'receita', category: string | null, amountCents: number, occurredOn: string, invoice: FinancialRecord['invoice'] = null) =>
  ({ kind, category, amountCents, occurredOn, invoice }) as const;

/** Compra no cartão mínima: o total, as parcelas e a data da compra; a fatura da 1ª parcela não entra na conta. */
const purchase = (category: string | null, amountCents: number, installments: number, purchasedOn: string, invoiceMonth = '2099-01') =>
  ({ kind: 'compra', category, amountCents, installments, purchasedOn, invoiceMonth, sourceMonth: null }) as const;
const refund = (category: string | null, amountCents: number, invoiceMonth: string, sourceMonth: string | null = null) =>
  ({ kind: 'estorno', category, amountCents, installments: 1, purchasedOn: null, invoiceMonth, sourceMonth }) as const;
const charge = (amountCents: number, invoiceMonth: string) =>
  ({ kind: 'encargo', category: null, amountCents, installments: 1, purchasedOn: null, invoiceMonth, sourceMonth: null }) as const;

describe('usado no mês por categoria (competência)', () => {
  it('conta gastos da categoria com data no mês; recebimentos, outro mês, sem categoria e outra categoria ficam de fora', () => {
    const used = categoryUsage('2026-10', {
      records: [
        rec('despesa', 'Mercado', 41_230, '2026-10-02'),
        rec('despesa', 'Mercado', 1_000, '2026-10-31'),
        rec('despesa', 'Mercado', 9_999, '2026-09-30'),
        rec('despesa', 'Mercado', 9_999, '2026-11-01'),
        rec('receita', 'Mercado', 50_000, '2026-10-03'),
        rec('despesa', null, 7_000, '2026-10-04'),
        rec('despesa', 'Roupas', 7_000, '2026-10-04'),
        rec('despesa', 'Lazer', 2_500, '2026-10-05'),
      ],
      entries: [],
    });
    expect(used).toEqual({ Moradia: 0, Mercado: 42_230, Transporte: 0, 'Saúde': 0, 'Educação': 0, Lazer: 2_500 });
    expect(Object.keys(used)).toEqual([...BUDGET_CATEGORIES]);
  });

  it('o pagamento de uma fatura não conta: é só a quitação de compras que já foram contadas', () => {
    const used = categoryUsage('2026-10', {
      records: [rec('despesa', 'Mercado', 100_000, '2026-10-12', { cardId: 'c1', month: '2026-10' }), rec('despesa', 'Mercado', 500, '2026-10-12')],
      entries: [],
    });
    expect(used.Mercado).toBe(500);
  });

  it('compra parcelada: cada parcela conta no mês da compra mais (k - 1), com o resto de centavos na primeira', () => {
    const entries = [purchase('Lazer', 60_000, 3, '2026-10-05'), purchase('Educação', 15_000, 10, '2026-10-05'), purchase('Mercado', 100, 3, '2026-10-20')];
    const at = (m: string) => categoryUsage(m, { records: [], entries });
    expect(at('2026-09')).toEqual({ Moradia: 0, Mercado: 0, Transporte: 0, 'Saúde': 0, 'Educação': 0, Lazer: 0 });
    expect(at('2026-10')).toMatchObject({ Lazer: 20_000, 'Educação': 1_500, Mercado: 34 });
    expect(at('2026-11')).toMatchObject({ Lazer: 20_000, 'Educação': 1_500, Mercado: 33 });
    expect(at('2026-12')).toMatchObject({ Lazer: 20_000, 'Educação': 1_500, Mercado: 33 });
    expect(at('2027-01')).toMatchObject({ Lazer: 0, 'Educação': 1_500, Mercado: 0 });
    expect(at('2027-07')).toMatchObject({ 'Educação': 1_500 });
    expect(at('2027-08')).toMatchObject({ 'Educação': 0 });
    // A soma das parcelas de todos os meses é o total da compra.
    const total = ['2026-10', '2026-11', '2026-12', '2027-01'].reduce((s, m) => s + at(m).Lazer!, 0);
    expect(total).toBe(60_000);
  });

  it('a parcela 1 conta no mês da data da compra, não no mês da fatura (compra no fim do mês, fatura no mês seguinte)', () => {
    const entries = [purchase('Mercado', 12_000, 2, '2026-09-30', '2026-10')];
    expect(categoryUsage('2026-09', { records: [], entries }).Mercado).toBe(6_000);
    expect(categoryUsage('2026-10', { records: [], entries }).Mercado).toBe(6_000);
    expect(categoryUsage('2026-11', { records: [], entries }).Mercado).toBe(0);
  });

  it('estorno com categoria desconta no mês da fatura em que foi informado, nunca abaixo de zero por categoria', () => {
    const entries = [purchase('Lazer', 30_000, 1, '2026-10-05'), refund('Lazer', 5_000, '2026-10'), refund('Lazer', 90_000, '2026-11'), refund('Mercado', 1_000, '2026-10')];
    expect(categoryUsage('2026-10', { records: [rec('despesa', 'Mercado', 3_000, '2026-10-01')], entries })).toMatchObject({ Lazer: 25_000, Mercado: 2_000 });
    // Em novembro não há gasto em Lazer: o estorno maior que o gasto deixa zero, não negativo.
    expect(categoryUsage('2026-11', { records: [], entries }).Lazer).toBe(0);
    // O estorno de uma categoria não abate a de outra.
    expect(categoryUsage('2026-10', { records: [], entries }).Mercado).toBe(0);
  });

  it('encargo, estorno automático e saldo anterior (sem categoria) ficam fora', () => {
    const entries = [charge(5_000, '2026-10'), refund(null, 7_000, '2026-10', '2026-09')];
    expect(Object.values(categoryUsage('2026-10', { records: [], entries })).every((v) => v === 0)).toBe(true);
    // Mesmo com categoria gravada por engano, o estorno automático (com mês de origem) nunca conta.
    expect(categoryUsage('2026-10', { records: [rec('despesa', 'Lazer', 1_000, '2026-10-01')], entries: [refund('Lazer', 400, '2026-10', '2026-09')] }).Lazer).toBe(1_000);
  });
});

describe('orçamento vigente: "a partir de"', () => {
  const row = (category: string, fromMonth: string, amountCents: number | null, id = `${category}-${fromMonth}`): CategoryBudget => ({
    id,
    contextId: 'c',
    category,
    fromMonth,
    amountCents,
    createdBy: 'p',
    version: 1,
    createdAt: 'x',
    updatedAt: 'x',
  });

  it('vale a linha mais recente com início até o mês; meses anteriores não são reescritos', () => {
    const rows = [row('Mercado', '2026-10', 180_000), row('Mercado', '2026-12', 200_000), row('Lazer', '2026-10', 30_000)];
    expect(budgetRowFor(rows, 'Mercado', '2026-09')).toBeNull();
    expect(budgetRowFor(rows, 'Mercado', '2026-10')?.amountCents).toBe(180_000);
    expect(budgetRowFor(rows, 'Mercado', '2026-11')?.amountCents).toBe(180_000);
    expect(budgetRowFor(rows, 'Mercado', '2026-12')?.amountCents).toBe(200_000);
    expect(budgetRowFor(rows, 'Mercado', '2027-06')?.amountCents).toBe(200_000);
    expect(budgetRowFor(rows, 'Moradia', '2027-06')).toBeNull();
  });

  it('uma linha sem valor encerra a vigência a partir do mês; outubro continua como era', () => {
    const rows = [row('Mercado', '2026-10', 180_000), row('Mercado', '2026-11', null)];
    const oct = readMonthBudget('2026-10', rows, { records: [], entries: [] });
    const nov = readMonthBudget('2026-11', rows, { records: [], entries: [] });
    expect(oct.lines.find((l) => l.category === 'Mercado')!.budgetCents).toBe(180_000);
    const m = nov.lines.find((l) => l.category === 'Mercado')!;
    expect([m.budgetCents, m.budgetFrom]).toEqual([null, '2026-11']);
    expect(summarizeBudget(nov).without).toContain('Mercado');
    expect(summarizeBudget(oct).rows.map((r) => r.category)).toEqual(['Mercado']);
    // Um orçamento novo depois do encerramento volta a valer.
    const again = readMonthBudget('2027-01', [...rows, row('Mercado', '2027-01', 150_000)], { records: [], entries: [] });
    expect(again.lines.find((l) => l.category === 'Mercado')!.budgetCents).toBe(150_000);
  });

  it('limite pessoal: o mais recente com início até o mês', () => {
    const rows = [{ fromMonth: '2026-10', percent: 60 }, { fromMonth: '2027-02', percent: 50 }];
    expect(limitFor(rows, '2026-09')).toBeNull();
    expect(limitFor(rows, '2026-10')?.percent).toBe(60);
    expect(limitFor(rows, '2027-01')?.percent).toBe(60);
    expect(limitFor(rows, '2027-02')?.percent).toBe(50);
  });
});

describe('resumo do mês e textos', () => {
  const line = (category: string, budgetCents: number | null, usedCents: number): MonthBudgetLine => ({
    category,
    budgetId: budgetCents === null ? null : `${category}-id`,
    budgetVersion: budgetCents === null ? null : 1,
    budgetFrom: budgetCents === null ? null : '2026-10',
    budgetCents,
    usedCents,
  });

  it('"R$ 412,30 de R$ 1.200,00", "Faltam R$ 787,70" e o percentual com uma casa', () => {
    const s = summarizeBudget({ month: '2026-10', lines: BUDGET_CATEGORIES.map((c) => (c === 'Mercado' ? line(c, 120_000, 41_230) : line(c, null, 0))) });
    const m = s.rows[0]!;
    expect([m.amountLine, m.balanceLine, m.percentText, m.level, m.barTenths]).toEqual(['R$ 412,30 de R$ 1.200,00', 'Faltam R$ 787,70', '34,4%', 0, 344]);
    expect(m.a11yLabel).toBe('Mercado, R$ 412,30 de R$ 1.200,00, 34,4% do orçamento. Faltam R$ 787,70.');
    expect(s.totalLine).toBe('Orçado R$ 1.200,00 · Usado R$ 412,30');
    expect(budgetCaption(s)).toBe('Mercado: R$ 412,30 de R$ 1.200,00');
    expect(s.without).toEqual(['Moradia', 'Transporte', 'Saúde', 'Educação', 'Lazer']);
  });

  it('acima do orçamento: "R$ 12,30 acima do orçamento", barra cheia e percentual real', () => {
    const s = summarizeBudget({ month: '2026-10', lines: [line('Lazer', 30_000, 31_230)] });
    const r = s.rows[0]!;
    expect([r.balanceLine, r.percentText, r.barTenths, r.level, r.overCents, r.leftCents]).toEqual(['R$ 12,30 acima do orçamento', '104,1%', 1000, 2, 1_230, 0]);
  });

  it('exatamente no valor do orçamento: "Orçamento usado por inteiro" (nível 1, não passou)', () => {
    const r = summarizeBudget({ month: '2026-10', lines: [line('Moradia', 250_000, 250_000)] }).rows[0]!;
    expect([r.balanceLine, r.percentText, r.level, r.overCents]).toEqual(['Orçamento usado por inteiro', '100,0%', 1, 0]);
  });

  it('o total soma só as categorias com orçamento; a categoria mais perto do limite é a de maior percentual', () => {
    const s = summarizeBudget({
      month: '2026-10',
      lines: [line('Moradia', 250_000, 250_000), line('Mercado', 180_000, 140_000), line('Transporte', null, 99_999), line('Saúde', null, 0), line('Educação', null, 0), line('Lazer', 30_000, 40_000)],
    });
    expect([s.budgetCents, s.usedCents, s.totalLine]).toEqual([460_000, 430_000, 'Orçado R$ 4.600,00 · Usado R$ 4.300,00']);
    expect(s.nearest?.category).toBe('Lazer');
    expect(budgetCaption(s)).toBe('Lazer: R$ 400,00 de R$ 300,00');
    expect(s.without).toEqual(['Transporte', 'Saúde', 'Educação']);
  });

  it('sem orçamento: "Nenhum orçamento definido", sem total', () => {
    const s = summarizeBudget(readMonthBudget('2026-10', [], { records: [], entries: [] }));
    expect([s.hasAny, s.totalLine, s.nearest, budgetCaption(s), s.without.length]).toEqual([false, null, null, 'Nenhum orçamento definido', 6]);
  });

  it('níveis pelo valor exato: 79,99% abaixo, 80% e 100% no nível 1, 100,01% passou', () => {
    expect(budgetLevel(7_999, 10_000)).toBe(0);
    expect(budgetLevel(8_000, 10_000)).toBe(1);
    expect(budgetLevel(10_000, 10_000)).toBe(1);
    expect(budgetLevel(10_001, 10_000)).toBe(2);
    expect(percentFloor(8_499, 10_000)).toBe(84);
    expect(percentFloor(8_500, 10_000)).toBe(85);
    expect(percentFloor(999_999_999, 100)).toBe(999_999_999);
  });
});

describe('aviso dentro do app ao cruzar 80% ou 100%', () => {
  const l = (usedCents: number, budgetCents: number | null = 120_000) => ({ category: 'Mercado', usedCents, budgetCents });
  const cross = (before: number, after: number, hide = false, month = '2026-10') => budgetCrossing(l(before), l(after), month, DEMO_TODAY, hide);

  it('chegou a 80% ou mais: "Mercado chegou a 85% do orçamento de outubro."', () => {
    expect(cross(90_000, 102_000)).toBe('Mercado chegou a 85% do orçamento de outubro.');
    expect(cross(0, 96_000)).toBe('Mercado chegou a 80% do orçamento de outubro.');
    expect(cross(95_999, 96_000)).toBe('Mercado chegou a 80% do orçamento de outubro.');
    // Exatamente o valor do orçamento ainda não passou.
    expect(cross(90_000, 120_000)).toBe('Mercado chegou a 100% do orçamento de outubro.');
  });

  it('passou de 100%: com o valor, e sem ele quando os valores estão ocultos', () => {
    expect(cross(100_000, 121_230)).toBe('Mercado passou do orçamento de outubro em R$ 12,30.');
    expect(cross(100_000, 121_230, true)).toBe('Mercado passou do orçamento de outubro.');
    // De abaixo de 80% direto para acima de 100%: só a frase de ter passado.
    expect(cross(10_000, 130_000)).toBe('Mercado passou do orçamento de outubro em R$ 100,00.');
    expect(cross(120_000, 120_001)).toBe('Mercado passou do orçamento de outubro em R$ 0,01.');
  });

  it('só no cruzamento: dentro do mesmo nível, descendo ou sem orçamento, nada', () => {
    expect(cross(100_000, 110_000)).toBeNull();
    expect(cross(97_000, 100_000)).toBeNull();
    expect(cross(130_000, 140_000)).toBeNull();
    expect(cross(130_000, 50_000)).toBeNull();
    expect(cross(10_000, 20_000)).toBeNull();
    expect(budgetCrossing(l(0), l(130_000, null), '2026-10', DEMO_TODAY)).toBeNull();
    expect(budgetCrossing(l(0, null), l(130_000), '2026-10', DEMO_TODAY)).toBeNull();
    expect(budgetCrossing(null, l(130_000), '2026-10', DEMO_TODAY)).toBeNull();
    expect(budgetCrossing(l(0), null, '2026-10', DEMO_TODAY)).toBeNull();
  });

  it('outro ano: o mês leva o ano', () => {
    expect(cross(0, 130_000, false, '2025-12')).toBe('Mercado passou do orçamento de dezembro de 2025 em R$ 100,00.');
  });
});

describe('formulário do orçamento', () => {
  const T = DEMO_TODAY;

  it('"A partir de" vai de 24 meses atrás a 12 meses à frente', () => {
    expect(budgetMonthBounds(T)).toEqual({ min: '2024-10', max: '2027-10' });
    expect(budgetMonthError('2024-10', T)).toBeNull();
    expect(budgetMonthError('2024-09', T)).toBe('vigencia_fora_do_intervalo');
    expect(budgetMonthError('2027-10', T)).toBeNull();
    expect(budgetMonthError('2027-11', T)).toBe('vigencia_fora_do_intervalo');
    expect(budgetMonthError('2026-13', T)).toBe('mes_invalido');
    expect(budgetMonthError(undefined, T)).toBe('mes_invalido');
  });

  it('valor de R$ 1,00 a R$ 9.999.999,99; nulo (tirar o orçamento) é aceito', () => {
    expect([budgetAmountError(100), budgetAmountError(99), budgetAmountError(0), budgetAmountError(999_999_999), budgetAmountError(1_000_000_000), budgetAmountError(null)]).toEqual([
      null,
      'valor_invalido',
      'valor_invalido',
      null,
      'valor_acima_do_limite',
      null,
    ]);
    expect(budgetAmountError(12.5)).toBe('valor_invalido');
  });

  it('validateBudgetDraft: mês antes do valor, mensagens do texto', () => {
    expect(validateBudgetDraft({ category: 'Mercado', amountText: '1.200,00', fromMonth: '2026-10' }, T)).toEqual({
      ok: true,
      category: 'Mercado',
      fromMonth: '2026-10',
      amountCents: 120_000,
    });
    const bad = validateBudgetDraft({ category: 'Mercado', amountText: '0,50', fromMonth: '2020-01' }, T);
    expect(bad).toEqual({ ok: false, errors: { fromMonth: BUDGET_ERROR_TEXT.vigencia_fora_do_intervalo, amountText: BUDGET_ERROR_TEXT.valor_invalido } });
    expect(validateBudgetDraft({ category: 'Mercado', amountText: '', fromMonth: '2026-10' }, T)).toMatchObject({ ok: false, errors: { amountText: BUDGET_ERROR_TEXT.valor_invalido } });
    expect(validateBudgetDraft({ category: 'Mercado', amountText: '10.000.000,00', fromMonth: '2026-10' }, T)).toMatchObject({
      ok: false,
      errors: { amountText: BUDGET_ERROR_TEXT.valor_acima_do_limite },
    });
  });

  it('o endereço aceita só as seis categorias de despesa', () => {
    expect(budgetCategoryFromParam('Mercado')).toBe('Mercado');
    expect(budgetCategoryFromParam(['Saúde'])).toBe('Saúde');
    expect(budgetCategoryFromParam('Salário')).toBeNull();
    expect(budgetCategoryFromParam('Sem categoria')).toBeNull();
    expect(budgetCategoryFromParam(undefined)).toBeNull();
  });
});

describe('limite pessoal de comprometimento', () => {
  const T = DEMO_TODAY;

  it('percentual inteiro de 10 a 100; aceita "40" e "40%"', () => {
    expect(['40', ' 40 ', '40%', '100', '10'].map(parseLimitPercent)).toEqual([40, 40, 40, 100, 10]);
    expect(['', '4,5', '40.5', 'abc', '-3', '1000'].map(parseLimitPercent)).toEqual([null, null, null, null, null, null]);
    expect(validateLimitDraft({ percentText: '40', fromMonth: '2026-10' }, T)).toEqual({ ok: true, fromMonth: '2026-10', percent: 40 });
    for (const text of ['9', '101', '0', '30,5', '']) {
      expect(validateLimitDraft({ percentText: text, fromMonth: '2026-10' }, T), text).toEqual({ ok: false, errors: { percentText: LIMIT_ERROR_TEXT.percentual_invalido } });
    }
    expect(validateLimitDraft({ percentText: '40', fromMonth: '2027-11' }, T)).toEqual({ ok: false, errors: { fromMonth: LIMIT_ERROR_TEXT.vigencia_fora_do_intervalo } });
    expect(limitMonthError('2024-10', T)).toBeNull();
    expect(limitMonthError('2024-09', T)).toBe('vigencia_fora_do_intervalo');
  });

  it('"28,0% de 30% que você escolheu" e a linha neutra a 5 pontos do limite', () => {
    const s = limitStatus('2026-11', 280, 168_000, 30, T)!;
    expect([s.kind, s.line, s.diffTenths]).toEqual(['perto', '28,0% de 30% que você escolheu', 20]);
    expect(s.note).toBe('Novembro está a 2,0 pontos do limite de 30% que você escolheu.');
  });

  it('passou do limite: "Novembro passou 3,5 pontos do limite de 30% que você escolheu."', () => {
    const s = limitStatus('2026-11', 335, 201_000, 30, T)!;
    expect([s.kind, s.diffTenths]).toEqual(['acima', -35]);
    expect(s.note).toBe('Novembro passou 3,5 pontos do limite de 30% que você escolheu.');
  });

  it('as fronteiras: no limite, 5,0 pontos (perto), 5,1 pontos (dentro, sem linha) e 0,1 acima', () => {
    expect(limitStatus('2026-11', 300, 1, 30, T)).toMatchObject({ kind: 'perto', note: 'Novembro está no limite de 30% que você escolheu.' });
    expect(limitStatus('2026-11', 250, 1, 30, T)).toMatchObject({ kind: 'perto', note: 'Novembro está a 5,0 pontos do limite de 30% que você escolheu.' });
    expect(limitStatus('2026-11', 249, 1, 30, T)).toMatchObject({ kind: 'dentro', note: null });
    expect(limitStatus('2026-11', 301, 1, 30, T)).toMatchObject({ kind: 'acima', note: 'Novembro passou 0,1 ponto do limite de 30% que você escolheu.' });
    expect(limitStatus('2026-11', 290, 1, 30, T)).toMatchObject({ note: 'Novembro está a 1,0 ponto do limite de 30% que você escolheu.' });
    expect(limitStatus('2026-11', 285, 1, 30, T)).toMatchObject({ note: 'Novembro está a 1,5 pontos do limite de 30% que você escolheu.' });
  });

  it('só com renda de referência e com limite escolhido; outro ano leva o ano', () => {
    expect(limitStatus('2026-11', null, 100, 30, T)).toBeNull();
    expect(limitStatus('2026-11', 300, 100, null, T)).toBeNull();
    expect(limitStatus('2027-01', 310, 100, 30, T)!.note).toBe('Janeiro de 2027 passou 1,0 ponto do limite de 30% que você escolheu.');
    expect(limitStatus('2026-11', 0, 0, 30, T)!.line).toBe('0,0% de 30% que você escolheu');
  });

  it('aviso ao gravar uma conta: só no mês que cruza o limite', () => {
    const limits = [{ fromMonth: '2026-10', percent: 30 }];
    const m = (month: string, committedPermille: number | null) => ({ month, committedPermille, committedCents: 1_000 });
    expect(limitCrossing([m('2026-11', 280)], [m('2026-11', 320)], limits, T)).toBe(
      'Com esta conta, novembro chega a 32,0% da renda, acima do limite de 30% que você escolheu.',
    );
    // Já estava acima: não é cruzamento. Continua dentro: nada. Sem renda de referência ou sem limite no mês: nada.
    expect(limitCrossing([m('2026-11', 320)], [m('2026-11', 340)], limits, T)).toBeNull();
    expect(limitCrossing([m('2026-11', 280)], [m('2026-11', 299)], limits, T)).toBeNull();
    expect(limitCrossing([m('2026-11', 300)], [m('2026-11', 300)], limits, T)).toBeNull();
    expect(limitCrossing([m('2026-11', null)], [m('2026-11', null)], limits, T)).toBeNull();
    expect(limitCrossing([m('2026-09', 100)], [m('2026-09', 900)], limits, T)).toBeNull();
    expect(limitCrossing([], [m('2026-11', 320)], limits, T)).toContain('novembro chega a 32,0%');
    // Vários meses: o primeiro que cruza.
    expect(limitCrossing([m('2026-11', 280), m('2026-12', 290)], [m('2026-12', 310), m('2026-11', 305)], limits, T)).toContain('novembro chega a 30,5%');
  });

  it('próximos meses: a frase só nos meses previstos que passam do limite', () => {
    const months = [
      { month: '2026-11', committedPermille: 730, committedCents: 438_000 },
      { month: '2026-12', committedPermille: 590, committedCents: 1 },
      { month: '2027-01', committedPermille: null, committedCents: 1 },
    ];
    expect(limitNotesFor(months, [{ fromMonth: '2026-10', percent: 60 }], DEMO_TODAY)).toEqual({
      '2026-11': 'Novembro passou 13,0 pontos do limite de 60% que você escolheu.',
    });
    expect(limitNotesFor(months, [], DEMO_TODAY)).toEqual({});
  });
});

describe('MemoryRepository: orçamento e limite', () => {
  const setup = async (today = '2026-10-07') => {
    const repo = new MemoryRepository({ actorId: 'p1', displayName: 'Pessoa Teste', today: () => today });
    const space = await repo.ensurePersonalSpace('Conta');
    return { repo, ctx: space.personalContextId, account: space.accounts[0]!.id };
  };

  it('define, altera com a versão, repete a mesma chave e recusa chave reutilizada', async () => {
    const { repo, ctx } = await setup();
    const k = key();
    const a = await repo.setCategoryBudget(k, ctx, 'Mercado', '2026-10', 0, 120_000);
    expect([a.version, a.category, a.fromMonth, a.amountCents]).toEqual([1, 'Mercado', '2026-10', 120_000]);
    expect(await repo.setCategoryBudget(k, ctx, 'Mercado', '2026-10', 0, 120_000)).toEqual(a);
    expect(await code(repo.setCategoryBudget(k, ctx, 'Mercado', '2026-10', 0, 130_000))).toBe('chave_reutilizada');
    expect(await code(repo.setCategoryBudget(k, ctx, 'Lazer', '2026-10', 0, 120_000))).toBe('chave_reutilizada');
    expect(await code(repo.deleteCategoryBudget(k, a.id, 1))).toBe('chave_reutilizada');
    // Versão 0 com linha viva e versão errada: versao_desatualizada.
    expect(await code(repo.setCategoryBudget(key(), ctx, 'Mercado', '2026-10', 0, 100))).toBe('versao_desatualizada');
    expect(await code(repo.setCategoryBudget(key(), ctx, 'Mercado', '2026-10', 3, 100))).toBe('versao_desatualizada');
    expect(await code(repo.setCategoryBudget(key(), ctx, 'Mercado', '2026-11', 1, 100))).toBe('versao_desatualizada');
    expect(await code(repo.setCategoryBudget(key(), ctx, 'Mercado', '2026-10', null as unknown as number, 100))).toBe('versao_desatualizada');
    const b = await repo.setCategoryBudget(key(), ctx, 'Mercado', '2026-10', 1, 150_000);
    expect([b.id, b.version, b.amountCents]).toEqual([a.id, 2, 150_000]);
    // A repetição da primeira chave devolve o estado atual, sem gravar de novo.
    expect(await repo.setCategoryBudget(k, ctx, 'Mercado', '2026-10', 0, 120_000)).toEqual(b);
    expect(await repo.listCategoryBudgets(ctx)).toEqual([b]);
  });

  it('validação na ordem do banco: mês, categoria, versão, faixa do mês, valor', async () => {
    const { repo, ctx } = await setup();
    const set = (category: string, month: string, version: number, cents: number | null) => code(repo.setCategoryBudget(key(), ctx, category, month, version, cents));
    expect(await set('Mercado', '2026-13', 0, 100)).toBe('mes_invalido');
    expect(await set('Salário', '2026-10', 0, 100)).toBe('categoria_invalida');
    expect(await set('Sem categoria', '2026-10', 0, 100)).toBe('categoria_invalida');
    // A versão vem antes da faixa do mês e do valor.
    expect(await set('Mercado', '2020-01', 5, 100)).toBe('versao_desatualizada');
    expect(await set('Mercado', '2024-09', 0, 100)).toBe('vigencia_fora_do_intervalo');
    expect(await set('Mercado', '2027-11', 0, 100)).toBe('vigencia_fora_do_intervalo');
    expect(await set('Mercado', '2026-10', 0, 99)).toBe('valor_invalido');
    expect(await set('Mercado', '2026-10', 0, 1_000_000_000)).toBe('valor_acima_do_limite');
    expect(await set('Mercado', '2024-10', 0, 100)).toBeNull();
    expect(await set('Mercado', '2027-10', 0, 999_999_999)).toBeNull();
    expect((await repo.listCategoryBudgets(ctx)).map((b) => [b.fromMonth, b.amountCents])).toEqual([['2024-10', 100], ['2027-10', 999_999_999]]);
  });

  it('excluir: versão, nao_encontrado e a linha anterior volta a valer', async () => {
    const { repo, ctx } = await setup();
    const old = await repo.setCategoryBudget(key(), ctx, 'Lazer', '2026-08', 0, 20_000);
    const cur = await repo.setCategoryBudget(key(), ctx, 'Lazer', '2026-10', 0, 30_000);
    expect((await repo.getMonthBudget(ctx, '2026-10')).lines.find((l) => l.category === 'Lazer')!.budgetCents).toBe(30_000);
    expect(await code(repo.deleteCategoryBudget(key(), cur.id, 9))).toBe('versao_desatualizada');
    expect(await code(repo.deleteCategoryBudget(key(), 'nao-existe', 1))).toBe('nao_encontrado');
    const gone = await repo.deleteCategoryBudget(key(), cur.id, 1);
    expect(gone.version).toBe(2);
    expect(await code(repo.deleteCategoryBudget(key(), cur.id, 2))).toBe('nao_encontrado');
    expect((await repo.getMonthBudget(ctx, '2026-10')).lines.find((l) => l.category === 'Lazer')!.budgetCents).toBe(20_000);
    expect(await repo.listCategoryBudgets(ctx)).toEqual([old]);
    // Depois de excluída, a mesma categoria e mês aceitam uma linha nova (versão 0).
    expect((await repo.setCategoryBudget(key(), ctx, 'Lazer', '2026-10', 0, 31_000)).version).toBe(1);
  });

  it('"Tirar o orçamento a partir de novembro" não reescreve outubro', async () => {
    const { repo, ctx } = await setup();
    await repo.setCategoryBudget(key(), ctx, 'Mercado', '2026-10', 0, 180_000);
    const removed = await repo.setCategoryBudget(key(), ctx, 'Mercado', '2026-11', 0, null);
    expect(removed.amountCents).toBeNull();
    const at = async (m: string) => (await repo.getMonthBudget(ctx, m)).lines.find((l) => l.category === 'Mercado')!;
    expect((await at('2026-10')).budgetCents).toBe(180_000);
    expect((await at('2026-11')).budgetCents).toBeNull();
    expect((await at('2026-12')).budgetCents).toBeNull();
    // Mudar o valor do mês antigo não mexe em meses posteriores já encerrados.
    await repo.setCategoryBudget(key(), ctx, 'Mercado', '2026-10', 1, 200_000);
    expect((await at('2026-10')).budgetCents).toBe(200_000);
    expect((await at('2026-11')).budgetCents).toBeNull();
  });

  it('getMonthBudget: mês fora do formato e outro contexto', async () => {
    const { repo, ctx } = await setup();
    expect(await code(repo.getMonthBudget(ctx, '2026-13'))).toBe('mes_invalido');
    expect(await code(repo.getMonthBudget('outro-contexto', '2026-10'))).toBe('sem_permissao');
    expect(await repo.listCategoryBudgets('outro-contexto')).toEqual([]);
    expect(await code(repo.setCategoryBudget(key(), 'outro-contexto', 'Mercado', '2026-10', 0, 100))).toBe('sem_permissao');
  });

  it('o usado vem dos gastos e das compras no cartão do contexto, mês a mês, sem mexer nos totais do mês', async () => {
    const { repo, ctx, account } = await setup();
    const add = (kind: 'receita' | 'despesa', description: string, cents: number, occurredOn: string, category: string | null) =>
      repo.createRecord(key(), ctx, kind, { accountId: account, amountCents: cents, occurredOn, description, category });
    await add('despesa', 'Feira', 41_230, '2026-10-02', 'Mercado');
    await add('despesa', 'Sem categoria', 5_000, '2026-10-02', null);
    await add('receita', 'Salário', 600_000, '2026-10-01', 'Salário');
    const card = (await repo.createCard(key(), ctx, { name: 'Cartão', lastDigits: null, closingDay: 3, dueDay: 10, limitCents: null })).card;
    // Compra de 30/09 (fatura de outubro): a 1ª parcela conta em setembro, a 2ª em outubro.
    await repo.addCardPurchase(key(), card.id, { description: 'Geladeira', category: 'Mercado', purchasedOn: '2026-09-30', totalCents: 12_000, installments: 2 });
    await repo.addCardPurchase(key(), card.id, { description: 'Show', category: 'Lazer', purchasedOn: '2026-10-05', totalCents: 90_000, installments: 3 });
    await repo.addCardRefund(key(), card.id, { description: 'Devolução', category: 'Lazer', amountCents: 4_000, invoiceMonth: '2026-11' });
    await repo.setCategoryBudget(key(), ctx, 'Mercado', '2026-09', 0, 100_000);
    await repo.setCategoryBudget(key(), ctx, 'Lazer', '2026-10', 0, 30_000);
    const totalsBefore = summarizeMonth(await repo.listRecords(ctx, '2026-10'), ctx, '2026-10');
    const used = async (m: string) => Object.fromEntries((await repo.getMonthBudget(ctx, m)).lines.map((l) => [l.category, l.usedCents]));
    expect(await used('2026-09')).toMatchObject({ Mercado: 6_000, Lazer: 0 });
    expect(await used('2026-10')).toMatchObject({ Mercado: 47_230, Lazer: 30_000 });
    expect(await used('2026-11')).toMatchObject({ Mercado: 0, Lazer: 26_000 });
    expect(await used('2026-12')).toMatchObject({ Lazer: 30_000 });
    // Compra no cartão nunca entra em Pago: o Pago de outubro é só o gasto anotado.
    expect([totalsBefore.paidCents, totalsBefore.receivedCents]).toEqual([46_230, 600_000]);
    // Excluir a compra devolve o usado; o usado acompanha o gasto excluído.
    const oct = await repo.listRecords(ctx, '2026-10');
    await repo.deleteRecord(key(), oct.find((r) => r.description === 'Feira')!.id, 1);
    expect((await used('2026-10')).Mercado).toBe(6_000);
  });

  it('orçamento e limite contam como anotação e a repetição não duplica a operação', async () => {
    const { repo, ctx } = await setup();
    const k = key();
    await repo.setCommitmentLimit(k, ctx, '2026-10', 0, 40);
    await repo.setCommitmentLimit(k, ctx, '2026-10', 0, 40);
    expect((await repo.listCommitmentLimits(ctx)).length).toBe(1);
  });

  it('limite: validação, versão, exclusão e a anterior volta a valer', async () => {
    const { repo, ctx } = await setup();
    const set = (m: string, v: number, p: number) => code(repo.setCommitmentLimit(key(), ctx, m, v, p));
    expect(await set('2026-13', 0, 40)).toBe('mes_invalido');
    expect(await set('2026-10', 4, 40)).toBe('versao_desatualizada');
    expect(await set('2024-09', 0, 40)).toBe('vigencia_fora_do_intervalo');
    expect(await set('2027-11', 0, 40)).toBe('vigencia_fora_do_intervalo');
    for (const p of [9, 101, 0, 30.5, -1, Number.NaN]) expect(await set('2026-10', 0, p), String(p)).toBe('percentual_invalido');
    const a = await repo.setCommitmentLimit(key(), ctx, '2026-10', 0, 60);
    const b = await repo.setCommitmentLimit(key(), ctx, '2026-12', 0, 40);
    expect(limitFor(await repo.listCommitmentLimits(ctx), '2026-12')?.percent).toBe(40);
    const changed = await repo.setCommitmentLimit(key(), ctx, '2026-12', 1, 45);
    expect([changed.id, changed.version, changed.percent]).toEqual([b.id, 2, 45]);
    expect(await code(repo.deleteCommitmentLimit(key(), b.id, 1))).toBe('versao_desatualizada');
    const gone = await repo.deleteCommitmentLimit(key(), b.id, 2);
    expect(gone.version).toBe(3);
    expect(limitFor(await repo.listCommitmentLimits(ctx), '2026-12')?.percent).toBe(60);
    expect(await code(repo.deleteCommitmentLimit(key(), b.id, 3))).toBe('nao_encontrado');
    expect(await repo.listCommitmentLimits(ctx)).toEqual([a]);
  });
});

describe('a demonstração (fictícia): orçamento de outubro e limite de 60%', () => {
  it('usado em outubro: Moradia 100%, Mercado 77,8%, Lazer com a 1ª parcela do tênis e o restaurante (133,3%)', async () => {
    const repo = await createDemoRepository();
    const ctx = (await repo.getSpace())!.personalContextId;
    const oct = summarizeBudget(await repo.getMonthBudget(ctx, '2026-10'));
    expect(oct.rows.map((r) => [r.category, r.amountLine, r.percentText, r.balanceLine])).toEqual([
      ['Moradia', 'R$ 2.500,00 de R$ 2.500,00', '100,0%', 'Orçamento usado por inteiro'],
      ['Mercado', 'R$ 1.400,00 de R$ 1.800,00', '77,8%', 'Faltam R$ 400,00'],
      ['Lazer', 'R$ 400,00 de R$ 300,00', '133,3%', 'R$ 100,00 acima do orçamento'],
    ]);
    expect(oct.totalLine).toBe('Orçado R$ 4.600,00 · Usado R$ 4.300,00');
    expect(oct.without).toEqual(['Transporte', 'Saúde', 'Educação']);
    expect(budgetCaption(oct)).toBe('Lazer: R$ 400,00 de R$ 300,00');
    // Setembro, antes da vigência, não tem orçamento; novembro e dezembro seguem as parcelas do tênis (R$ 200,00).
    expect(summarizeBudget(await repo.getMonthBudget(ctx, '2026-09')).hasAny).toBe(false);
    const lazer = async (m: string) => summarizeBudget(await repo.getMonthBudget(ctx, m)).rows.find((r) => r.category === 'Lazer')!.usedCents;
    expect([await lazer('2026-11'), await lazer('2026-12'), await lazer('2027-01')]).toEqual([20_000, 20_000, 0]);
  });

  it('os totais de outubro não mudam (6.000 / 3.900 / 2.100) nem o comprometido (52,5%), e o limite de 60% aparece', async () => {
    const repo = await createDemoRepository();
    const ctx = (await repo.getSpace())!.personalContextId;
    const s = summarizeMonth(await repo.listRecords(ctx, '2026-10'), ctx, '2026-10');
    expect([s.receivedCents, s.paidCents, s.differenceCents]).toEqual([600_000, 390_000, 210_000]);
    const refs = await repo.listIncomeReferences(ctx);
    const limits = await repo.listCommitmentLimits(ctx);
    const c = summarizeCommitted(await repo.listCommitments(ctx, '2026-10'), ctx, '2026-10', DEMO_TODAY, refs, []);
    expect(c.committedPermille).toBe(525);
    expect(limits.map((l) => [l.fromMonth, l.percent])).toEqual([['2026-10', 60]]);
    const status = limitStatus('2026-10', c.committedPermille, c.committedCents, 60, DEMO_TODAY)!;
    expect([status.line, status.kind, status.note]).toEqual(['52,5% de 60% que você escolheu', 'dentro', null]);
    // Novembro (73,0%) passa do limite em 13,0 pontos.
    const months = upcomingCommittedMonths('2026-10');
    const p = projectCommitted(await repo.listSeries(ctx), await repo.listCommitmentsDueBetween(ctx, months[0]!, months[5]!), refs, months, DEMO_TODAY);
    expect(limitNotesFor(p.months, limits, DEMO_TODAY)['2026-11']).toBe('Novembro passou 13,0 pontos do limite de 60% que você escolheu.');
  });

  it('conta nova: sem orçamento nem limite, e nada de exemplo', async () => {
    const repo = new MemoryRepository({ actorId: 'nova', displayName: 'Pessoa Nova', today: () => DEMO_TODAY });
    const ctx = (await repo.ensurePersonalSpace('Conta')).personalContextId;
    expect(await repo.listCategoryBudgets(ctx)).toEqual([]);
    expect(await repo.listCommitmentLimits(ctx)).toEqual([]);
    const s = summarizeBudget(await repo.getMonthBudget(ctx, '2026-10'));
    expect([s.hasAny, s.rows.length, s.without.length, budgetCaption(s)]).toEqual([false, 0, 6, 'Nenhum orçamento definido']);
  });
});

describe('textos montados', () => {
  it('as frases do enunciado saem exatamente como escritas', () => {
    expect(BUDGET_TEXT.cardRule).toBe('Compras no cartão contam no mês da compra (cada parcela no seu mês), mesmo antes de a fatura ser paga.');
    expect(BUDGET_TEXT.crossedNear('Mercado', 85, 'outubro')).toBe('Mercado chegou a 85% do orçamento de outubro.');
    expect(BUDGET_TEXT.crossedOver('Mercado', 'outubro', 1_230)).toBe('Mercado passou do orçamento de outubro em R$ 12,30.');
    expect(BUDGET_TEXT.crossedOverHidden('Mercado', 'outubro')).toBe('Mercado passou do orçamento de outubro.');
    expect(BUDGET_TEXT.budgeted(120_000)).toBe('de R$ 1.200,00 orçados');
    expect(BUDGET_TEXT.form.removeFrom('2026-11')).toBe('Tirar o orçamento a partir de novembro de 2026');
    expect(LIMIT_TEXT.crossed('novembro', '32,0%', 30)).toBe('Com esta conta, novembro chega a 32,0% da renda, acima do limite de 30% que você escolheu.');
  });
});
