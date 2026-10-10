import { isMinimumReserve, type Cents, type EssentialBaseSource, type EssentialEstimate } from '@clarevo/core';

/** Valor e origem dos gastos essenciais já gravados na reserva que a pessoa tem. */
export interface SavedEssentials {
  cents: Cents;
  source: EssentialBaseSource;
}

/**
 * Origem dos gastos essenciais para o valor que está no campo: o mesmo da sugestão (média de gastos ou contas do mês) ou o da
 * reserva já salva guardam a origem deles; qualquer outro número é "informado" pela pessoa.
 */
export function essentialSourceFor(cents: Cents | null, estimate: EssentialEstimate, saved: SavedEssentials | null): EssentialBaseSource {
  if (cents !== null) {
    if (estimate.amountCents !== null && cents === estimate.amountCents) return estimate.source;
    if (saved && cents === saved.cents) return saved.source;
  }
  return 'informado';
}

/**
 * A reserva mínima de "Agora não" (origem 'reserva_minima') guarda o próprio alvo como base de 1 mês: "cobre X mês dos seus
 * gastos essenciais" não seria verdade. Nela a cobertura não aparece. (Reserva de 1 mês com gastos essenciais digitados é
 * 'informado' e mostra a cobertura.)
 */
export function showsCoverage(goal: { essentialBaseSource: EssentialBaseSource | null }): boolean {
  return !isMinimumReserve(goal);
}
