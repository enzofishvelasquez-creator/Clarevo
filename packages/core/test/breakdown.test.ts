import { describe, expect, it } from 'vitest';
import { CARD_CHARGES_CATEGORY, DEMO_TODAY, categoryBreakdown, createDemoRepository, paidCategoryParts, receivedCategoryBreakdown, receivedCategoryParts, summarizeMonth, type FinancialRecord } from '../src';

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

describe('Recebido por categoria (Evolução, fase 2)', () => {
  it('o mesmo desenho de Pago: ordem decrescente, empate pelo nome, "Sem categoria" por último, soma igual a Recebido', () => {
    const rows = receivedCategoryBreakdown([
      rec('Salário', 500_000, 'receita'),
      rec(null, 900_000, 'receita'),
      rec('Reembolso', 20_000, 'receita'),
      rec('Aluguel recebido', 20_000, 'receita'),
      rec('Salário', 1, 'receita'),
      rec('Mercado', 999_999),
    ]);
    expect(rows.map((r) => [r.label, r.cents])).toEqual([
      ['Salário', 500_001],
      ['Aluguel recebido', 20_000],
      ['Reembolso', 20_000],
      ['Sem categoria', 900_000],
    ]);
    expect(rows.map((r) => r.category)).toEqual(['Salário', 'Aluguel recebido', 'Reembolso', null]);
    expect(rows.reduce((a, r) => a + r.cents, 0)).toBe(1_440_001);
    expect(rows.reduce((a, r) => a + r.tenths, 0)).toBe(1_000);
    expect(rows[0]!.a11yLabel).toBe('Salário, R$ 5.000,01, 34,7% do recebido');
  });

  it('percentuais pelo maior resto somam 1.000, como em Pago; lista vazia ou só gastos: nada', () => {
    const received = [rec('Salário', 1, 'receita'), rec('Freela', 1, 'receita'), rec('Reembolso', 1, 'receita')];
    expect(receivedCategoryBreakdown(received).map((r) => r.tenths)).toEqual([334, 333, 333]);
    // Os mesmos valores em Pago dão os mesmos percentuais: a conta é uma só.
    expect(categoryBreakdown([rec('Moradia', 1), rec('Mercado', 1), rec('Lazer', 1)]).map((r) => r.tenths)).toEqual([334, 333, 333]);
    expect(receivedCategoryBreakdown([])).toEqual([]);
    expect(receivedCategoryBreakdown([rec('Mercado', 100)])).toEqual([]);
  });

  it('um recebimento só: 100% do recebido; não altera a lista que recebe', () => {
    const received = [rec('Salário', 520_000, 'receita')];
    const before = JSON.stringify(received);
    const rows = receivedCategoryBreakdown(received);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ label: 'Salário', cents: 520_000, tenths: 1_000, percentText: '100%' });
    expect(JSON.stringify(received)).toBe(before);
  });

  it('o cenário "evolucao": Recebido de abril é o salário de R$ 5.200,00, e março não tem recebimento', async () => {
    const repo = await createDemoRepository({ scenario: 'evolucao' });
    const ctx = (await repo.getSpace())!.personalContextId;
    const april = summarizeMonth(await repo.listRecords(ctx, '2026-04'), ctx, '2026-04');
    const rows = receivedCategoryBreakdown(april.composition.received);
    expect(rows.map((r) => [r.label, r.cents, r.percentText])).toEqual([['Salário', 520_000, '100%']]);
    expect(rows.reduce((a, r) => a + r.cents, 0)).toBe(april.receivedCents);
    expect(receivedCategoryBreakdown(summarizeMonth(await repo.listRecords(ctx, '2026-03'), ctx, '2026-03').composition.received)).toEqual([]);
  });
});

describe('partes por categoria (a base de "Entender o que mudou")', () => {
  const invoicePayment = (amountCents: number): FinancialRecord => ({ ...rec('Cartão', amountCents), invoice: { cardId: 'cartao', month: '2026-10' }, description: 'Fatura do cartão' });
  const invoices = [
    {
      cardId: 'cartao',
      month: '2026-10',
      mix: [
        { category: 'Mercado', charges: false, cents: 60_000 },
        { category: 'Lazer', charges: false, cents: 30_000 },
        { category: null, charges: true, cents: 10_000 },
      ],
    },
  ];

  it('a soma das partes de cada categoria é a de categoryBreakdown, com a fatura dividida e sem contar nada duas vezes', () => {
    const paid = [rec('Mercado', 25_000), invoicePayment(100_000), rec(null, 5_000), rec('Salário', 999_999, 'receita')];
    const parts = paidCategoryParts(paid, invoices);
    const byLabel = new Map<string, number>();
    for (const p of parts) byLabel.set(p.label, (byLabel.get(p.label) ?? 0) + p.cents);
    for (const row of categoryBreakdown(paid, invoices)) expect(byLabel.get(row.label), row.label).toBe(row.cents);
    expect(parts.reduce((a, p) => a + p.cents, 0)).toBe(130_000);
    expect(byLabel.get(CARD_CHARGES_CATEGORY)).toBe(10_000);
    // O pagamento da fatura vira três partes, cada uma marcada como parte; o gasto comum é inteiro.
    const ofInvoice = parts.filter((p) => p.record.invoice);
    expect(ofInvoice.map((p) => [p.label, p.cents, p.part])).toEqual([
      ['Mercado', 60_000, true],
      ['Lazer', 30_000, true],
      [CARD_CHARGES_CATEGORY, 10_000, true],
    ]);
    expect(parts.filter((p) => !p.record.invoice).every((p) => !p.part && p.cents === p.record.amountCents)).toBe(true);
  });

  it('sem a fatura na lista, o pagamento fica inteiro na categoria dele; recebimentos ficam fora de Pago e gastos fora de Recebido', () => {
    const paid = [invoicePayment(100_000), rec('Mercado', 1_000, 'receita')];
    expect(paidCategoryParts(paid, []).map((p) => [p.label, p.cents, p.part])).toEqual([['Cartão', 100_000, false]]);
    expect(receivedCategoryParts([rec('Salário', 5_000, 'receita'), rec('Mercado', 1_000)]).map((p) => [p.label, p.cents])).toEqual([['Salário', 5_000]]);
  });
});
