import { describe, expect, it } from 'vitest';
import { DEMO_TODAY, categoryBreakdown, createDemoRepository, summarizeMonth, type FinancialRecord } from '../src';

let seq = 0;
const rec = (category: string | null, amountCents: number, kind: 'despesa' | 'receita' = 'despesa'): FinancialRecord => ({
  id: `r${++seq}`,
  contextId: 'c',
  accountId: 'a',
  kind,
  status: 'realizado',
  amountCents,
  currency: 'BRL',
  occurredOn: '2026-10-01',
  description: 'x',
  category,
  commitmentId: null,
  invoice: null,
  receiptKey: null,
  createdBy: 'p',
  version: 1,
  createdAt: '2026-10-01T00:00:00Z',
  updatedAt: '2026-10-01T00:00:00Z',
});

describe('Composição › Por categoria', () => {
  it('demonstração de outubro de 2026: Moradia R$ 2.500,00 (64,1%) e Mercado R$ 1.400,00 (35,9%), soma igual a Pago', async () => {
    const repo = await createDemoRepository();
    const ctx = (await repo.getSpace())!.personalContextId;
    const month = DEMO_TODAY.slice(0, 7);
    const s = summarizeMonth(await repo.listRecords(ctx, month), ctx, month);
    expect(s.paidCents).toBe(390_000);
    const rows = categoryBreakdown(s.composition.paid);
    expect(rows.map((r) => [r.label, r.cents, r.tenths, r.percentText])).toEqual([
      ['Moradia', 250_000, 641, '64,1%'],
      ['Mercado', 140_000, 359, '35,9%'],
    ]);
    expect(rows.reduce((a, r) => a + r.cents, 0)).toBe(s.paidCents);
    expect(rows.reduce((a, r) => a + r.tenths, 0)).toBe(1_000);
    expect(rows[0]!.a11yLabel).toBe('Moradia, R$ 2.500,00, 64,1% do pago');
  });

  it('ordem decrescente, empate pelo nome, "Sem categoria" por último mesmo sendo a maior', () => {
    const rows = categoryBreakdown([rec(null, 50_000), rec('Mercado', 41_230), rec('Lazer', 10_000), rec('Saúde', 10_000), rec('Mercado', 1), rec('Salário', 999_999, 'receita')]);
    expect(rows.map((r) => r.label)).toEqual(['Mercado', 'Lazer', 'Saúde', 'Sem categoria']);
    expect(rows.map((r) => r.category)).toEqual(['Mercado', 'Lazer', 'Saúde', null]);
    expect(rows.reduce((a, r) => a + r.cents, 0)).toBe(111_231);
    expect(rows.reduce((a, r) => a + r.tenths, 0)).toBe(1_000);
    expect(rows[0]!.a11yLabel).toBe('Mercado, R$ 412,31, 37,1% do pago');
  });

  it('percentuais pelo maior resto sempre somam 1.000; lista vazia ou só recebimentos: nada', () => {
    const rows = categoryBreakdown([rec('Moradia', 1), rec('Mercado', 1), rec('Lazer', 1)]);
    expect(rows.map((r) => r.tenths)).toEqual([334, 333, 333]);
    expect(categoryBreakdown([])).toEqual([]);
    expect(categoryBreakdown([rec('Salário', 100, 'receita')])).toEqual([]);
  });
});
