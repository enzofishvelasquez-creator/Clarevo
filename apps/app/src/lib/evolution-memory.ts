import { EvolutionSelectionStore, type EvolutionSelectionMetric, type IsoMonth } from '@clarevo/core';
import { useSyncExternalStore } from 'react';

/**
 * Meses que a pessoa tirou da comparação em Evolução (D-057, D03): só na memória do app, por pessoa, por contexto (Pessoal ou
 * Família) e por valor mostrado (Recebido, Pago, Renda comprometida e Guardado em metas, cada um com a sua seleção). Nada é gravado, nem no aparelho nem no servidor: some ao sair da conta, ao
 * trocar de pessoa (`clearReceiptMemory`, em state/session.tsx), ao trocar de contexto (state/view.tsx) e ao recarregar a página.
 * As regras estão em `packages/core/src/evolucao-tela.ts`.
 */
export const evolutionSelection = new EvolutionSelectionStore();

/** Os meses tirados da comparação nesta métrica, atualizados na tela quando mudam. Sem pessoa ou contexto: nenhum. */
export function useHiddenMonths(scope: string | null, metric: EvolutionSelectionMetric): ReadonlySet<IsoMonth> {
  const read = () => evolutionSelection.get(scope, metric);
  return useSyncExternalStore(evolutionSelection.subscribe, read, read);
}
