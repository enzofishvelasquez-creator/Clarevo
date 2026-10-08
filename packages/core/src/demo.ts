import { MemoryRepository } from './memory-repository';
import { newOperationKey } from './repository';

/**
 * Dados FICTÍCIOS da conta de demonstração. Não representam nenhuma pessoa real
 * e nunca entram em uma conta criada pelo cadastro.
 * Outubro reproduz a base de aceite: R$ 6.000 recebidos, R$ 3.900 pagos e R$ 650 em contas a pagar.
 * Seguro do carro vence em novembro e não entra no total de outubro.
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
  // Contas a pagar passam pelas mesmas regras do cadastro (sem semente direta).
  const bill = (description: string, reais: number, dueOn: string, category: string) =>
    repo.createCommitment(newOperationKey(), ctx, { description, amountCents: reais * 100, dueOn, category });
  await bill('Internet', 150, '2026-10-15', 'Moradia');
  await bill('Condomínio', 500, '2026-10-20', 'Moradia');
  await bill('Seguro do carro', 300, '2026-11-10', 'Transporte'); // só em "Próximos meses"

  // A latência só passa a valer depois de semear, para a demonstração abrir rápido.
  repo.latencyMs = opts.latencyMs ?? 0;
  return repo;
}
