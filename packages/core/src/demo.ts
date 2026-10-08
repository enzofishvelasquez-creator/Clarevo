import { MemoryRepository } from './memory-repository';
import { newOperationKey } from './repository';

/**
 * Dados FICTÍCIOS da conta de demonstração. Não representam nenhuma pessoa real
 * e nunca entram em uma conta criada pelo cadastro (conta nova nunca recebe série de exemplo).
 * Outubro reproduz a base de aceite: R$ 6.000 recebidos, R$ 3.900 pagos e R$ 650 em contas a pagar.
 * O aluguel de outubro é a conta do gasto fixo, paga em 05/10. Em "Próximos meses": Aluguel (05/11),
 * Financiamento do carro (parcela 13 de 48, 10/11), Seguro do carro (10/11) e Luz estimada (12/11).
 */
export const DEMO_TODAY = '2026-10-07';
export const DEMO_EMAIL = 'demo@clarevo.app';

export async function createDemoRepository(opts: { latencyMs?: number } = {}) {
  const repo = new MemoryRepository({
    actorId: 'pessoa-demo',
    displayName: 'Maria Alves',
    today: () => DEMO_TODAY,
    latencyMs: 0,
  });
  const space = await repo.ensurePersonalSpace('Conta principal');
  const ctx = space.personalContextId;
  const accountId = space.accounts[0]!.id;
  const add = (kind: 'receita' | 'despesa', description: string, reais: number, occurredOn: string, category: string | null) =>
    repo.createRecord(newOperationKey(), ctx, kind, { accountId, amountCents: reais * 100, occurredOn, description, category });

  await add('receita', 'Salário', 6000, '2026-09-01', 'Salário');
  await add('despesa', 'Aluguel', 2500, '2026-09-05', 'Moradia');
  await add('despesa', 'Mercado', 1250, '2026-09-12', 'Mercado');
  await add('receita', 'Salário', 6000, '2026-10-01', 'Salário');
  await add('despesa', 'Mercado', 1400, '2026-10-06', 'Mercado');

  // Gastos fixos e contas a pagar passam pelas mesmas regras do cadastro (sem semente direta).
  const fixed = (description: string, reais: number, dueDay: number, firstDueMonth: string, amountMode: 'fixo' | 'variavel', category: string) =>
    repo.createSeries(newOperationKey(), ctx, {
      kind: 'mensal',
      nature: 'conta',
      description,
      category,
      amountCents: reais * 100,
      amountMode,
      dueDay,
      firstDueMonth,
      firstNumber: 1,
      installmentTotal: null,
      lastMonth: null,
    });
  const aluguel = await fixed('Aluguel', 2500, 5, '2026-10', 'fixo', 'Moradia');
  // A conta de outubro é paga no vencimento: o gasto de 05/10 nasce do pagamento.
  const outubro = aluguel.occurrences.find((c) => c.dueOn === '2026-10-05')!;
  await repo.payCommitment(newOperationKey(), outubro.id, outubro.version, {
    accountId,
    amountCents: outubro.amountCents,
    paidOn: '2026-10-05',
    category: 'Moradia',
  });
  await fixed('Luz', 180, 12, '2026-11', 'variavel', 'Moradia');
  await repo.createSeries(newOperationKey(), ctx, {
    kind: 'parcelada',
    nature: 'financiamento',
    description: 'Financiamento do carro',
    category: 'Transporte',
    amountCents: 85000,
    amountMode: 'fixo',
    dueDay: 10,
    firstDueMonth: '2026-11',
    firstNumber: 13,
    installmentTotal: 48,
    lastMonth: null,
  });

  const bill = (description: string, reais: number, dueOn: string, category: string) =>
    repo.createCommitment(newOperationKey(), ctx, { description, amountCents: reais * 100, dueOn, category });
  await bill('Internet', 150, '2026-10-15', 'Moradia');
  await bill('Condomínio', 500, '2026-10-20', 'Moradia');
  await bill('Seguro do carro', 300, '2026-11-10', 'Transporte'); // só em "Próximos meses"
  await repo.syncSeriesOccurrences(ctx); // o app sincroniza ao abrir; aqui não cria nada

  // A latência só passa a valer depois de semear, para a demonstração abrir rápido.
  repo.latencyMs = opts.latencyMs ?? 0;
  return repo;
}
