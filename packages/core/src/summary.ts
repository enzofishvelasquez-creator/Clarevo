import type { FinancialEvent, IsoMonth } from './events';
import { monthOf } from './events';
import type { Cents } from './money';

/**
 * Resumo do mês de um contexto (CL-V003).
 *
 * Critérios:
 * - Recebido / Pago: eventos confirmados cuja data de recebimento/pagamento (settledOn) cai no mês.
 * - Diferença do mês: recebido − pago. Não é saldo da conta.
 * - Ainda a pagar: saídas previstas com vencimento no mês (ou, sem vencimento, competência no mês).
 * - A receber: entradas previstas pelo mesmo critério.
 * Cada total traz a lista de eventos que o compõem, pelo mesmo critério.
 */
export interface MonthSummary {
  contextId: string;
  month: IsoMonth;
  receivedCents: Cents;
  paidCents: Cents;
  differenceCents: Cents;
  toPayCents: Cents;
  toReceiveCents: Cents;
  composition: {
    received: FinancialEvent[];
    paid: FinancialEvent[];
    toPay: FinancialEvent[];
    toReceive: FinancialEvent[];
  };
  /** Falso quando não há nenhum evento no mês: a interface mostra "sem registros", não R$ 0,00. */
  hasData: boolean;
}

function forecastMonth(e: FinancialEvent): IsoMonth {
  return e.dueOn ? monthOf(e.dueOn) : e.competence;
}

const sum = (events: FinancialEvent[]): Cents => events.reduce((acc, e) => acc + e.amountCents, 0);

export function summarizeMonth(
  events: readonly FinancialEvent[],
  contextId: string,
  month: IsoMonth,
): MonthSummary {
  const live = events.filter((e) => e.contextId === contextId && !e.deletedAt);

  const confirmedInMonth = live.filter(
    (e) => e.status === 'confirmado' && e.settledOn !== undefined && monthOf(e.settledOn) === month,
  );
  const forecastInMonth = live.filter((e) => e.status === 'previsto' && forecastMonth(e) === month);

  const received = confirmedInMonth.filter((e) => e.direction === 'entrada');
  const paid = confirmedInMonth.filter((e) => e.direction === 'saida');
  const toPay = forecastInMonth.filter((e) => e.direction === 'saida');
  const toReceive = forecastInMonth.filter((e) => e.direction === 'entrada');

  const byDateDesc = (a: FinancialEvent, b: FinancialEvent) =>
    (b.settledOn ?? b.dueOn ?? '').localeCompare(a.settledOn ?? a.dueOn ?? '') ||
    b.createdAt.localeCompare(a.createdAt);

  const receivedCents = sum(received);
  const paidCents = sum(paid);

  return {
    contextId,
    month,
    receivedCents,
    paidCents,
    differenceCents: receivedCents - paidCents,
    toPayCents: sum(toPay),
    toReceiveCents: sum(toReceive),
    composition: {
      received: received.sort(byDateDesc),
      paid: paid.sort(byDateDesc),
      // Previstos: o próximo vencimento primeiro.
      toPay: toPay.sort((a, b) => byDateDesc(b, a)),
      toReceive: toReceive.sort((a, b) => byDateDesc(b, a)),
    },
    hasData: confirmedInMonth.length + forecastInMonth.length > 0,
  };
}
