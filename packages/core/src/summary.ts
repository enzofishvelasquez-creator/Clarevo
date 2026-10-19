import type { IsoDate, IsoMonth } from './dates';
import { monthOf, monthRange } from './dates';
import type { Cents } from './money';
import { CARD_CHARGES_CATEGORY, recordShares, type Invoice } from './cards';
import { isCommitmentOverdue } from './dia-util';
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
  /**
   * Em aberto com vencimento cadastrado antes do mês (só no mês corrente). A conta é pela data cadastrada, como no banco
   * (`month_to_pay`), e fora de "vencida de verdade" (D-061): nos primeiros dias do mês, a conta de um dia que não é útil no fim do mês
   * anterior ainda pode estar no próximo dia útil, e o texto de `toPayCaption` então diz "com vencimento", não "vencidas".
   */
  overdueBeforeCents: Cents;
  /** Parte do total com valor estimado (gasto fixo que muda, como luz): "Inclui R$ 180,00 em valores estimados." */
  estimatedCents: Cents;
  /** Compõem o total; ordem: vencimento, criação, id. */
  items: Commitment[];
  /**
   * Itens vencidos de verdade (D-061): com vencimento antes de hoje e, quando cai em sábado, domingo ou feriado nacional, depois
   * que o próximo dia útil termina (conta do ano: a partir do dia seguinte à data cadastrada, sem tolerância).
   */
  overdue: Commitment[];
  /** Itens que ainda não venceram de verdade: vencimento de hoje em diante ou no próximo dia útil (D-061). Ordem pela data cadastrada. */
  upcomingInMonth: Commitment[];
  overdueCount: number;
  /** Primeiro item que ainda não venceu de verdade. */
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
  // D-061: só os totais e a ordem seguem a data cadastrada; "vencida" é `isCommitmentOverdue` (próximo dia útil, conta do ano sem tolerância).
  const overdue = items.filter((c) => isCommitmentOverdue(c, today));
  const upcomingInMonth = items.filter((c) => !isCommitmentOverdue(c, today));
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

/** Uma barra de "Por categoria" na composição de Pago (ou de Recebido, na Evolução). */
export interface CategoryShare {
  /** null = "Sem categoria". */
  category: string | null;
  label: string;
  cents: Cents;
  /** Percentual de Pago (ou de Recebido) em décimos; a soma de todas é 1.000 (maior resto). */
  tenths: number;
  /** "23,4%" */
  percentText: string;
  /** "Mercado, R$ 412,30, 23,4% do pago" (em Recebido, "do recebido") */
  a11yLabel: string;
}

/**
 * A parte de um lançamento numa categoria: o gasto comum cabe inteiro na categoria dele; o pagamento de fatura de cartão (D-037) vem
 * dividido pelas categorias da fatura paga, uma parte para cada. A soma das partes de uma lista é o total dela (Pago ou Recebido),
 * então nada é contado duas vezes. `part` é verdadeiro quando a parte é menor que o lançamento inteiro.
 */
export interface CategoryPart {
  record: FinancialRecord;
  /** null = "Sem categoria"; "Encargos do cartão" para os encargos de uma fatura. */
  category: string | null;
  label: string;
  cents: Cents;
  part: boolean;
}

/**
 * As partes por categoria dos gastos de uma lista (os de Pago), com a mesma divisão da fatura de `categoryBreakdown`. Recebimentos
 * que vierem na lista ficam de fora. `invoices` traz as faturas desses gastos (loadInvoicesOfRecords); sem a fatura na lista, o gasto
 * fica inteiro na categoria dele.
 */
export function paidCategoryParts(paid: readonly FinancialRecord[], invoices: readonly Pick<Invoice, 'cardId' | 'month' | 'mix'>[] = []): CategoryPart[] {
  const out: CategoryPart[] = [];
  for (const r of paid) {
    if (r.kind !== 'despesa') continue;
    const shares = recordShares(r, invoices);
    if (shares) {
      for (const share of shares) {
        const category = share.charges ? CARD_CHARGES_CATEGORY : share.category;
        out.push({ record: r, category, label: category ?? NO_CATEGORY_LABEL, cents: share.cents, part: share.cents < r.amountCents });
      }
    } else {
      out.push({ record: r, category: r.category, label: r.category ?? NO_CATEGORY_LABEL, cents: r.amountCents, part: false });
    }
  }
  return out;
}

/** As partes por categoria dos recebimentos de uma lista (os de Recebido): cada um inteiro na categoria dele. Gastos ficam de fora. */
export function receivedCategoryParts(received: readonly FinancialRecord[]): CategoryPart[] {
  return received
    .filter((r) => r.kind === 'receita')
    .map((r) => ({ record: r, category: r.category, label: r.category ?? NO_CATEGORY_LABEL, cents: r.amountCents, part: false }));
}

/** Soma as partes por categoria, em ordem decrescente de valor (empate: nome), com "Sem categoria" por último; percentuais pelo maior resto. */
function rankedShares(parts: readonly CategoryPart[], noun: 'pago' | 'recebido'): CategoryShare[] {
  const byCategory = new Map<string | null, Cents>();
  for (const p of parts) byCategory.set(p.category, (byCategory.get(p.category) ?? 0) + p.cents);
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
    return { ...r, tenths: tenths[i]!, percentText, a11yLabel: `${r.label}, ${formatBRL(r.cents)}, ${percentText} do ${noun}` };
  });
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
  return rankedShares(paidCategoryParts(paid, invoices), 'pago');
}

/**
 * Recebido por categoria (Evolução, D-057 fase 2): o mesmo desenho de `categoryBreakdown` para os recebimentos. Soma por categoria,
 * em ordem decrescente de valor (empate: nome), com "Sem categoria" por último, percentuais em décimos pelo maior resto (a soma é
 * 1.000) e a soma dos centavos igual a Recebido. Gastos que vierem na lista ficam de fora; sem recebimentos, lista vazia.
 */
export function receivedCategoryBreakdown(received: readonly FinancialRecord[]): CategoryShare[] {
  return rankedShares(receivedCategoryParts(received), 'recebido');
}
