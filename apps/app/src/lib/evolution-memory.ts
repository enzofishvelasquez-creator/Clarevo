import { EvolutionSelectionStore, type EvolutionMetric, type IsoMonth } from '@clarevo/core';
import { useSyncExternalStore } from 'react';

/**
 * Meses que a pessoa tirou da comparação em Evolução (D-057, D03): só na memória do app, por pessoa, por contexto (Pessoal ou
 * Família) e por métrica (Recebido e Pago separados). Nada é gravado, nem no aparelho nem no servidor: some ao sair da conta, ao
 * trocar de pessoa (`clearReceiptMemory`, em state/session.tsx), ao trocar de contexto (state/view.tsx) e ao recarregar a página.
 * As regras estão em `packages/core/src/evolucao-tela.ts`.
 */
export const evolutionSelection = new EvolutionSelectionStore();

/** Os meses tirados da comparação nesta métrica, atualizados na tela quando mudam. Sem pessoa ou contexto: nenhum. */
export function useHiddenMonths(scope: string | null, metric: EvolutionMetric): ReadonlySet<IsoMonth> {
  const read = () => evolutionSelection.get(scope, metric);
  return useSyncExternalStore(evolutionSelection.subscribe, read, read);
}
