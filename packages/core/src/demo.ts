import { MemoryRepository } from './memory-repository';
import { newOperationKey } from './repository';

/**
 * Dados FICTÍCIOS da conta de demonstração. Não representam nenhuma pessoa real
 * e nunca entram em uma conta criada pelo cadastro.
 * Outubro reproduz a base de aceite: R$ 6.000 recebidos, R$ 3.900 pagos, R$ 650 em compromissos.
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

  await add('receita', 'Salário', 6000, '2026-09-01', 'Renda');
  await add('despesa', 'Aluguel', 2500, '2026-09-05', 'Moradia');
  await add('despesa', 'Mercado', 1250, '2026-09-12', 'Mercado');
  await add('receita', 'Salário', 6000, '2026-10-01', 'Renda');
  await add('despesa', 'Aluguel', 2500, '2026-10-05', 'Moradia');
  await add('despesa', 'Mercado', 1400, '2026-10-06', 'Mercado');
  repo.seedCommitment({ contextId: ctx, description: 'Internet', amountCents: 15000, dueOn: '2026-10-15', status: 'aberto' });
  repo.seedCommitment({ contextId: ctx, description: 'Fatura do cartão', amountCents: 50000, dueOn: '2026-10-20', status: 'aberto' });

  // A latência só passa a valer depois de semear, para a demonstração abrir rápido.
  repo.latencyMs = opts.latencyMs ?? 0;
  return repo;
}
