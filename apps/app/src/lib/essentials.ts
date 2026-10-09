import type { Cents, EssentialBaseSource, EssentialEstimate } from '@clarevo/core';

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
 * Reserva mínima criada em "Agora não" (base = alvo, 1 mês, origem informada) e reserva de 1 mês com gastos essenciais
 * digitados têm a mesma forma no banco: nos dois casos "cobre X mês dos seus gastos essenciais" não seria verdade ou não
 * acrescentaria nada ao percentual. Nelas a cobertura não aparece.
 */
export function showsCoverage(goal: { essentialMonths: number | null; essentialBaseSource: EssentialBaseSource | null }): boolean {
  return !(goal.essentialMonths === 1 && goal.essentialBaseSource === 'informado');
}
