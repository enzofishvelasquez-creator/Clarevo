import type { IsoMonth } from './dates';
import { monthOf } from './dates';
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

/** "Ainda a pagar neste mês": compromissos abertos com vencimento no mês. Origem separada. */
export function summarizeCommitments(commitments: readonly Commitment[], contextId: string, month: IsoMonth) {
  const items = commitments
    .filter((c) => c.contextId === contextId && c.status === 'aberto' && monthOf(c.dueOn) === month)
    .sort((a, b) => a.dueOn.localeCompare(b.dueOn));
  return { toPayCents: sum(items), items };
}

export function sortNewestFirst(records: readonly FinancialRecord[]): FinancialRecord[] {
  return [...records].sort(newestFirst);
}
