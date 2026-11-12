import { describe, expect, it } from 'vitest';

import { BUDGET_CELEBRATION_TEXT, budgetClosedWithin, summarizeBudget, type MonthBudgetRead } from '../src';

const line = (category: string, budgetCents: number | null, usedCents: number) => ({
  category,
  budgetCents,
  usedCents,
  budgetId: budgetCents === null ? null : `b-${category}`,
  budgetVersion: budgetCents === null ? null : 1,
  budgetFrom: budgetCents === null ? null : '2026-01',
});
const read = (...lines: ReturnType<typeof line>[]): MonthBudgetRead => ({ month: '2026-09', lines } as unknown as MonthBudgetRead);

describe('mês que fechou dentro do orçamento (pedido do Enzo em 12/11/2026)', () => {
  it('todas as categorias com orçamento no valor ou abaixo, com algum gasto: comemora, com quantas categorias', () => {
    expect(budgetClosedWithin(summarizeBudget(read(line('Mercado', 120000, 98000), line('Moradia', 250000, 250000), line('Lazer', null, 50000))))).toEqual({
      month: '2026-09',
      categories: 2,
    });
  });

  it('uma categoria acima, nenhum orçamento ou nenhum gasto nas categorias: nada aparece', () => {
    expect(budgetClosedWithin(summarizeBudget(read(line('Mercado', 120000, 120001), line('Moradia', 250000, 1000))))).toBeNull();
    expect(budgetClosedWithin(summarizeBudget(read(line('Mercado', null, 5000))))).toBeNull();
    expect(budgetClosedWithin(summarizeBudget(read(line('Mercado', 120000, 0), line('Moradia', 250000, 0))))).toBeNull();
  });

  it('os textos seguem as regras (sem travessão, sem julgamento, sem valor)', () => {
    const texts = [BUDGET_CELEBRATION_TEXT.eyebrow, BUDGET_CELEBRATION_TEXT.title('2026-09'), BUDGET_CELEBRATION_TEXT.body(1), BUDGET_CELEBRATION_TEXT.body(3), BUDGET_CELEBRATION_TEXT.open('2026-09'), BUDGET_CELEBRATION_TEXT.dismiss];
    expect(texts).toEqual([
      'Orçamento do mês',
      'Setembro de 2026 fechou dentro do orçamento',
      'A categoria com orçamento ficou dentro do valor que você definiu.',
      'As 3 categorias com orçamento ficaram dentro do valor que você definiu.',
      'Ver o orçamento de setembro de 2026',
      'Fechar',
    ]);
    for (const t of texts) {
      expect(t).not.toMatch(/—|–|R\$|parab[eé]ns|deveria|precisa\b/i);
    }
  });
});
