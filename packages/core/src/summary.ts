import type { IsoDate, IsoMonth } from './dates';
import { monthOf, monthRange } from './dates';
import type { Cents } from './money';
import type { Commitment, FinancialRecord } from './records';

/**
 * Resumo do mês de um contexto (CL C004).
 *
 * Critério único: registros realizados do contexto cuja data de pagamento/recebimento cai no mês.
 * - Recebido: receitas. Pago: despesas.
 * - Diferença do mês = recebido − pago. Não é saldo da conta nem dinheiro disponível.
 * Registros excluídos não chegam aqui (o repositório não os devolve).
 */
export interface MonthSummary {
  contextId: string;
  month: IsoMonth;
  receivedCents: Cents;
  paidCents: Cents;
  differenceCents: Cents;
  composition: { received: FinancialRecord[]; paid: FinancialRecord[] };
  recordCount: number;
}

const sum = (xs: { amountCents: Cents }[]): Cents => xs.reduce((acc, x) => acc + x.amountCents, 0);

const newestFirst = (a: FinancialRecord, b: FinancialRecord) =>
  b.occurredOn.localeCompare(a.occurredOn) || b.createdAt.localeCompare(a.createdAt);

export function summarizeMonth(records: readonly FinancialRecord[], contextId: string, month: IsoMonth): MonthSummary {
  const inMonth = records.filter((r) => r.contextId === contextId && r.status === 'realizado' && monthOf(r.occurredOn) === month);
  const received = inMonth.filter((r) => r.kind === 'receita').sort(newestFirst);
  const paid = inMonth.filter((r) => r.kind === 'despesa').sort(newestFirst);
  const receivedCents = sum(received);
  const paidCents = sum(paid);
  return {
    contextId,
    month,
    receivedCents,
    paidCents,
    differenceCents: receivedCents - paidCents,
    composition: { received, paid },
    recordCount: inMonth.length,
  };
}

/**
 * "Ainda a pagar" (D-021, regra 5). Estoque de contas em aberto hoje, não fluxo: não se soma entre meses.
 * - Mês corrente: em aberto com vencimento até o fim do mês, inclusive as vencidas de meses anteriores.
 * - Outros meses: em aberto com vencimento naquele mês.
 * Contas a pagar nunca entram em Recebido, Pago ou Diferença. Repetido no banco por month_to_pay.
 */
export interface ToPaySummary {
  month: IsoMonth;
  isCurrentMonth: boolean;
  /** Total do card. */
  toPayCents: Cents;
  /** Em aberto com vencimento no mês. */
  dueInMonthCents: Cents;
  /** Em aberto vencidas antes do mês (só no mês corrente). */
  overdueBeforeCents: Cents;
  /** Compõem o total; ordem: vencimento, criação, id. */
  items: Commitment[];
  /** Itens com vencimento antes de hoje. */
  overdue: Commitment[];
  /** Itens com vencimento de hoje em diante. */
  upcomingInMonth: Commitment[];
  overdueCount: number;
  /** Primeiro item com vencimento de hoje em diante. */
  nextDue: Commitment | null;
  /** Pagas com vencimento no mês. */
  paidInMonth: Commitment[];
  /** Só no mês corrente: em aberto com vencimento depois do mês. */
  later: Commitment[];
  /** A consulta trouxe alguma conta a pagar. */
  hasAny: boolean;
}

const byDue = (a: Commitment, b: Commitment) =>
  a.dueOn.localeCompare(b.dueOn) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);

export function summarizeToPay(list: readonly Commitment[], contextId: string, month: IsoMonth, today: IsoDate): ToPaySummary {
  const isCurrentMonth = monthOf(today) === month;
  const { start, endExclusive } = monthRange(month);
  const all = list.filter((c) => c.contextId === contextId).sort(byDue);
  const open = all.filter((c) => c.status === 'aberto');
  const items = open.filter((c) => c.dueOn < endExclusive && (isCurrentMonth || c.dueOn >= start));
  const overdue = items.filter((c) => c.dueOn < today);
  const upcomingInMonth = items.filter((c) => c.dueOn >= today);
  return {
    month,
    isCurrentMonth,
    toPayCents: sum(items),
    dueInMonthCents: sum(items.filter((c) => c.dueOn >= start)),
    overdueBeforeCents: sum(items.filter((c) => c.dueOn < start)),
    items,
    overdue,
    upcomingInMonth,
    overdueCount: overdue.length,
    nextDue: upcomingInMonth[0] ?? null,
    paidInMonth: all.filter((c) => c.status === 'quitado' && monthOf(c.dueOn) === month),
    later: isCurrentMonth ? open.filter((c) => c.dueOn >= endExclusive) : [],
    hasAny: all.length > 0,
  };
}

export function sortNewestFirst(records: readonly FinancialRecord[]): FinancialRecord[] {
  return [...records].sort(newestFirst);
}
