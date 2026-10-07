import type { FinancialContext, FinancialEvent } from './events';

/**
 * Dados FICTÍCIOS para demonstração e testes. Não representam nenhuma pessoa real.
 * Reproduzem o cenário de aceite do CL-V003: R$ 6.000 recebidos, R$ 3.900 pagos, R$ 650 a pagar.
 */
export const DEMO_USER_ID = 'pessoa-demo';
export const DEMO_MONTH = '2026-10';

export const DEMO_CONTEXTS: FinancialContext[] = [
  { id: 'ctx-pessoal', kind: 'pessoal', name: 'Pessoal' },
  { id: 'ctx-familia', kind: 'familia', name: 'Família' },
];

const at = '2026-10-01T12:00:00.000Z';

function ev(
  id: string,
  contextId: string,
  partial: Pick<FinancialEvent, 'direction' | 'status' | 'amountCents' | 'description' | 'category'> &
    Partial<FinancialEvent>,
): FinancialEvent {
  return {
    id,
    contextId,
    competence: DEMO_MONTH,
    idempotencyKey: `seed-${id}`,
    createdBy: DEMO_USER_ID,
    createdAt: at,
    updatedAt: at,
    ...partial,
  };
}

export const DEMO_EVENTS: FinancialEvent[] = [
  // Pessoal
  ev('p1', 'ctx-pessoal', { direction: 'entrada', status: 'confirmado', amountCents: 600000, description: 'Salário', category: 'Renda', settledOn: '2026-10-01' }),
  ev('p2', 'ctx-pessoal', { direction: 'saida', status: 'confirmado', amountCents: 180000, description: 'Aluguel', category: 'Moradia', settledOn: '2026-10-02' }),
  ev('p3', 'ctx-pessoal', { direction: 'saida', status: 'confirmado', amountCents: 30000, description: 'Energia', category: 'Moradia', settledOn: '2026-10-03' }),
  ev('p4', 'ctx-pessoal', { direction: 'saida', status: 'confirmado', amountCents: 40000, description: 'Transporte', category: 'Transporte', settledOn: '2026-10-04' }),
  ev('p5', 'ctx-pessoal', { direction: 'saida', status: 'confirmado', amountCents: 140000, description: 'Mercado', category: 'Mercado', settledOn: '2026-10-05' }),
  ev('p6', 'ctx-pessoal', { direction: 'saida', status: 'previsto', amountCents: 15000, description: 'Internet', category: 'Moradia', dueOn: '2026-10-15' }),
  ev('p7', 'ctx-pessoal', { direction: 'saida', status: 'previsto', amountCents: 50000, description: 'Fatura do cartão', category: 'Cartão', dueOn: '2026-10-20' }),
  // Família
  ev('f1', 'ctx-familia', { direction: 'saida', status: 'confirmado', amountCents: 150000, description: 'Escola', category: 'Educação', settledOn: '2026-10-03' }),
  ev('f2', 'ctx-familia', { direction: 'saida', status: 'confirmado', amountCents: 70000, description: 'Mercado', category: 'Mercado', settledOn: '2026-10-05' }),
  ev('f3', 'ctx-familia', { direction: 'saida', status: 'confirmado', amountCents: 20000, description: 'Transporte', category: 'Transporte', settledOn: '2026-10-06' }),
];

/** Orçamento fictício da família para outubro. */
export const DEMO_FAMILY_BUDGET_CENTS = 300000;
