import { describe, expect, it } from 'vitest';
import {
  DEMO_EVENTS,
  DEMO_MONTH,
  Ledger,
  expenseFromDraft,
  formatBRL,
  parseBRL,
  summarizeMonth,
  validateExpenseDraft,
  type ExpenseDraft,
} from '../src';

const now = '2026-10-07T15:00:00.000Z';

function draft(overrides: Partial<ExpenseDraft> = {}): ExpenseDraft {
  return {
    contextId: 'ctx-pessoal',
    amountText: '80,00',
    description: 'Farmácia',
    category: 'Saúde',
    paidOn: '2026-10-07',
    idempotencyKey: 'form-1',
    ...overrides,
  };
}

function save(ledger: Ledger, d: ExpenseDraft, id = 'novo-1') {
  const v = validateExpenseDraft(d);
  if (!v.ok) throw new Error(JSON.stringify(v.errors));
  return ledger.add(expenseFromDraft(d, v.amountCents, { id, createdBy: 'pessoa-demo', now }));
}

describe('dinheiro', () => {
  it('formata em reais', () => {
    expect(formatBRL(210000)).toBe('R$ 2.100,00');
    expect(formatBRL(-5050)).toBe('-R$ 50,50');
  });

  it.each([
    ['1.400,00', 140000],
    ['1400', 140000],
    ['80,5', 8050],
    ['R$ 80', 8000],
    ['0,01', 1],
  ])('lê "%s"', (input, expected) => {
    expect(parseBRL(input)).toBe(expected);
  });

  it.each(['', 'abc', '1,234', '12.34', '1.40', '-10', '10,'])('rejeita "%s"', (input) => {
    expect(parseBRL(input)).toBeNull();
  });
});

describe('resumo do mês (CL-V003)', () => {
  it('cenário de aceite: 6.000 recebidos, 3.900 pagos, 2.100 de diferença, 650 a pagar separados', () => {
    const s = summarizeMonth(DEMO_EVENTS, 'ctx-pessoal', DEMO_MONTH);
    expect(s.receivedCents).toBe(600000);
    expect(s.paidCents).toBe(390000);
    expect(s.differenceCents).toBe(210000);
    expect(s.toPayCents).toBe(65000);
    expect(s.hasData).toBe(true);
  });

  it('novo pagamento de R$ 80 muda pago para 3.980 e diferença para 2.020; a pagar continua 650', () => {
    const ledger = new Ledger(DEMO_EVENTS);
    save(ledger, draft());
    const s = summarizeMonth(ledger.all(), 'ctx-pessoal', DEMO_MONTH);
    expect(s.paidCents).toBe(398000);
    expect(s.differenceCents).toBe(202000);
    expect(s.toPayCents).toBe(65000);
  });

  it('a composição soma exatamente o total, pelo mesmo critério', () => {
    const s = summarizeMonth(DEMO_EVENTS, 'ctx-pessoal', DEMO_MONTH);
    const total = (xs: { amountCents: number }[]) => xs.reduce((a, e) => a + e.amountCents, 0);
    expect(total(s.composition.paid)).toBe(s.paidCents);
    expect(total(s.composition.received)).toBe(s.receivedCents);
    expect(total(s.composition.toPay)).toBe(s.toPayCents);
  });

  it('contextos não se misturam: gasto da Família não entra no Pessoal', () => {
    const ledger = new Ledger(DEMO_EVENTS);
    save(ledger, draft({ contextId: 'ctx-familia' }));
    expect(summarizeMonth(ledger.all(), 'ctx-pessoal', DEMO_MONTH).paidCents).toBe(390000);
    expect(summarizeMonth(ledger.all(), 'ctx-familia', DEMO_MONTH).paidCents).toBe(248000);
  });

  it('pagamento de outro mês não entra no total de outubro', () => {
    const ledger = new Ledger(DEMO_EVENTS);
    save(ledger, draft({ paidOn: '2026-11-01' }));
    expect(summarizeMonth(ledger.all(), 'ctx-pessoal', DEMO_MONTH).paidCents).toBe(390000);
  });

  it('mês sem registros informa ausência de dados em vez de fingir zero', () => {
    const s = summarizeMonth(DEMO_EVENTS, 'ctx-pessoal', '2026-09');
    expect(s.hasData).toBe(false);
  });
});

describe('registro, edição e exclusão (CL-V004)', () => {
  it('envio repetido com a mesma chave não duplica', () => {
    const ledger = new Ledger(DEMO_EVENTS);
    const a = save(ledger, draft(), 'x1');
    const b = save(ledger, draft(), 'x2');
    expect(a.created).toBe(true);
    expect(b.created).toBe(false);
    expect(b.event.id).toBe('x1');
    expect(summarizeMonth(ledger.all(), 'ctx-pessoal', DEMO_MONTH).paidCents).toBe(398000);
  });

  it('edição atualiza o resumo', () => {
    const ledger = new Ledger(DEMO_EVENTS);
    save(ledger, draft());
    ledger.update('novo-1', { amountCents: 10000 }, now);
    expect(summarizeMonth(ledger.all(), 'ctx-pessoal', DEMO_MONTH).paidCents).toBe(400000);
  });

  it('exclusão retira do resumo e da composição', () => {
    const ledger = new Ledger(DEMO_EVENTS);
    save(ledger, draft());
    ledger.remove('novo-1', now);
    const s = summarizeMonth(ledger.all(), 'ctx-pessoal', DEMO_MONTH);
    expect(s.paidCents).toBe(390000);
    expect(s.composition.paid.some((e) => e.id === 'novo-1')).toBe(false);
  });

  it('valida campos e mantém mensagens por campo', () => {
    const v = validateExpenseDraft(draft({ amountText: '0', description: ' ', paidOn: '2026-02-30' }));
    expect(v.ok).toBe(false);
    if (!v.ok) {
      expect(v.errors.amountText).toBe('Confira o valor informado');
      expect(v.errors.description).toBeDefined();
      expect(v.errors.paidOn).toBeDefined();
    }
  });
});
