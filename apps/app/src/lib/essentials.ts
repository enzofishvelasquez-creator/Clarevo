import { MINIMUM_RESERVE_SOURCE, SAVINGS_STAGE_MONTHS, isMinimumReserve, type Cents, type EssentialBaseSource, type EssentialEstimate } from '@clarevo/core';

/** Valor e origem dos gastos essenciais já gravados na reserva que a pessoa tem. */
export interface SavedEssentials {
  cents: Cents;
  source: EssentialBaseSource;
}

/**
 * Origem dos gastos essenciais para o valor que está no campo: o mesmo da sugestão (média de gastos ou contas do mês) ou o da
 * reserva já salva guardam a origem deles; qualquer outro número é "informado" pela pessoa. A origem 'reserva_minima' só vale
 * para a reserva de 1 mês com o mesmo valor salvo: com outro número ou com outro prazo (`months` diferente de 1), é "informado".
 */
export function essentialSourceFor(
  cents: Cents | null,
  estimate: EssentialEstimate,
  saved: SavedEssentials | null,
  months?: number | null,
): EssentialBaseSource {
  if (cents !== null) {
    if (estimate.amountCents !== null && cents === estimate.amountCents) return estimate.source;
    if (saved && cents === saved.cents) {
      if (saved.source === MINIMUM_RESERVE_SOURCE && months !== undefined && months !== 1) return 'informado';
      return saved.source;
    }
  }
  return 'informado';
}

/**
 * Etapa do plano de guardar já escolhida ao abrir a tela: a da reserva que existe (1, 3 ou 6 meses), para "Usar este plano"
 * nunca diminuir o alvo sem a pessoa escolher. Na reserva mínima (1 mês, mas o alvo é o valor escolhido por ela) e na reserva de
 * outro prazo, nenhuma: a pessoa escolhe a etapa. Sem reserva, null (o padrão do core vale).
 */
export function savingsInitialStage(reserve: { essentialMonths: number | null; essentialBaseSource: EssentialBaseSource | null } | null): string | null {
  if (!reserve || reserve.essentialMonths === null || isMinimumReserve(reserve)) return null;
  return SAVINGS_STAGE_MONTHS.includes(reserve.essentialMonths) ? `reserva-${reserve.essentialMonths}` : null;
}

/** A reserva existe e a etapa do plano precisa ser escolhida (reserva mínima ou de outro prazo): sem escolha, o alvo não muda. */
export function savingsNeedsStageChoice(reserve: { essentialMonths: number | null; essentialBaseSource: EssentialBaseSource | null } | null): boolean {
  if (!reserve) return false;
  return isMinimumReserve(reserve) || (reserve.essentialMonths !== null && !SAVINGS_STAGE_MONTHS.includes(reserve.essentialMonths));
}

/**
 * A reserva mínima de "Agora não" (origem 'reserva_minima') guarda o próprio alvo como base de 1 mês: "cobre X mês dos seus
 * gastos essenciais" não seria verdade. Nela a cobertura não aparece. (Reserva de 1 mês com gastos essenciais digitados é
 * 'informado' e mostra a cobertura.)
 */
export function showsCoverage(goal: { essentialBaseSource: EssentialBaseSource | null }): boolean {
  return !isMinimumReserve(goal);
}
