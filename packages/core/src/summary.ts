import type { IsoDate, IsoMonth } from './dates';
import { monthOf, monthRange } from './dates';
import type { Cents } from './money';
import { CARD_CHARGES_CATEGORY, recordShares, type Invoice } from './cards';
import { formatTenths } from './learn/format';
import { sharesCents } from './learn/math';
import { formatBRL } from './money';
import type { Commitment, FinancialRecord } from './records';
import { NO_CATEGORY_LABEL } from './records';

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
 * Ocorrências de gasto fixo são contas a pagar comuns; as previstas além do mês seguinte nunca chegam aqui.
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
  /** Parte do total com valor estimado (gasto fixo que muda, como luz): "Inclui R$ 180,00 em valores estimados." */
  estimatedCents: Cents;
  /** Compõem o total; ordem: vencimento, criação, id. */
  items: Commitment[];
  /** Itens com vencimento antes de hoje. */
  overdue: Commitment[];
  /** Itens com vencimento de hoje em diante. */
  upcomingInMonth: Commitment[];
  overdueCount: number;
  /** Primeiro item com vencimento de hoje em diante. */
  nextDue: Commitment | null;
  /**
   * Pagas que pertencem ao mês: com vencimento no mês ou com pagamento no mês (o gasto entra em Pago
   * pela data do pagamento). Uma conta paga em outro mês aparece nos dois. Não muda nenhum total.
   */
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
    estimatedCents: sum(items.filter((c) => c.amountIsEstimate)),
    items,
    overdue,
    upcomingInMonth,
    overdueCount: overdue.length,
    nextDue: upcomingInMonth[0] ?? null,
    paidInMonth: all.filter(
      (c) => c.status === 'quitado' && (monthOf(c.dueOn) === month || (c.payment !== null && monthOf(c.payment.paidOn) === month)),
    ),
    later: isCurrentMonth ? open.filter((c) => c.dueOn >= endExclusive) : [],
    hasAny: all.length > 0,
  };
}

export function sortNewestFirst(records: readonly FinancialRecord[]): FinancialRecord[] {
  return [...records].sort(newestFirst);
}

/** Uma barra de "Por categoria" na composição de Pago. */
export interface CategoryShare {
  /** null = "Sem categoria". */
  category: string | null;
  label: string;
  cents: Cents;
  /** Percentual de Pago em décimos; a soma de todas é 1.000 (maior resto). */
  tenths: number;
  /** "23,4%" */
  percentText: string;
  /** "Mercado, R$ 412,30, 23,4% do pago" */
  a11yLabel: string;
}

/**
 * "Por categoria" na composição de Pago (spec4 §1.2): soma dos gastos por categoria, em ordem decrescente de valor
 * (empate: nome), com "Sem categoria" por último. Percentuais em décimos pelo maior resto, para somarem 1.000; a soma
 * dos centavos é igual a Pago. Recebimentos que vierem na lista ficam de fora.
 *
 * Pagamento de fatura de cartão (D-037): o gasto é dividido pelas categorias dos lançamentos da fatura paga, na proporção
 * dos valores (maior resto, soma igual ao pago); os encargos ficam em "Encargos do cartão" e os estornos abatem a categoria
 * deles. `invoices` traz as faturas desses gastos (loadInvoicesOfRecords); sem a fatura na lista, o gasto fica na categoria
 * dele.
 */
export function categoryBreakdown(paid: readonly FinancialRecord[], invoices: readonly Pick<Invoice, 'cardId' | 'month' | 'mix'>[] = []): CategoryShare[] {
  const byCategory = new Map<string | null, Cents>();
  const add = (category: string | null, cents: Cents) => byCategory.set(category, (byCategory.get(category) ?? 0) + cents);
  for (const r of paid) {
    if (r.kind !== 'despesa') continue;
    const shares = recordShares(r, invoices);
    if (shares) for (const share of shares) add(share.charges ? CARD_CHARGES_CATEGORY : share.category, share.cents);
    else add(r.category, r.amountCents);
  }
  const rows = [...byCategory.entries()]
    .map(([category, cents]) => ({ category, label: category ?? NO_CATEGORY_LABEL, cents }))
    .sort((a, b) => {
      if ((a.category === null) !== (b.category === null)) return a.category === null ? 1 : -1;
      return b.cents - a.cents || a.label.localeCompare(b.label, 'pt-BR');
    });
  const total = rows.reduce((acc, r) => acc + r.cents, 0);
  if (total <= 0) return [];
  const tenths = sharesCents(1000, rows.map((r) => r.cents));
  return rows.map((r, i) => {
    const percentText = formatTenths(tenths[i]!);
    return { ...r, tenths: tenths[i]!, percentText, a11yLabel: `${r.label}, ${formatBRL(r.cents)}, ${percentText} do pago` };
  });
}
