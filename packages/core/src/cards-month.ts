import type { IsoMonth } from './dates';
import { addMonths, formatMonthName } from './dates';
import type { Cents } from './money';
import { formatBRL } from './money';
import type { IncomeReference } from './records';
import type { Invoice } from './cards';
import { committedPermille, formatPermille, referenceFor } from './committed';

/**
 * Faturas do mês e quanto isso pesa na renda de referência (D-042, pedido de Enzo de 10/10/2026: "Valor total em cartões, somando
 * valores. Quanto isso simboliza na porcentagem de comprometimento do seu saldo"; resposta: "Faturas do mês"). Mostrado no topo de
 * Cartões. Nenhuma conta nova: é a mesma soma do grupo "Faturas de cartão" da renda comprometida (D-026), vista pelos cartões.
 *
 * - Fatura do mês = fatura cujo VENCIMENTO cai no mês (D-037(2): o mês da fatura é o do vencimento). Paga conta pelo valor pago;
 *   aberta, fechada e paga em parte (sem pagamento) pelo total previsto. Fatura sem total não tem conta a pagar e vale zero.
 *   Por isso `totalCents` é igual a `CommittedSummary.cardCents` do mesmo mês (testado).
 * - Percentual como em D-026(3): milésimos arredondados com metade para cima sobre a renda de referência vigente no mês; sem
 *   referência, só o valor em reais. Sem cor de alerta, nota nem julgamento.
 * - "Próximas faturas": até 3 dos 6 meses seguintes que têm fatura com valor, sempre "previsto".
 * - Quem chama passa as faturas de todos os cartões do contexto, ativos e arquivados: a renda comprometida conta as faturas dos
 *   dois, e o número do mês precisa ser o mesmo nas duas telas.
 */

export const CARD_MONTH_UPCOMING_COUNT = 3;
/** Quantos meses à frente a lista de próximas faturas olha (os mesmos 6 de "Próximos meses" da renda comprometida). */
export const CARD_MONTH_UPCOMING_WINDOW = 6;

export interface CardMonthUpcoming {
  month: IsoMonth;
  cents: Cents;
}

export interface CardInvoicesMonth {
  month: IsoMonth;
  /** Soma das faturas que vencem no mês: pagas pelo valor pago, as outras pelo total. */
  totalCents: Cents;
  /** Parte já paga (valor pago). */
  paidCents: Cents;
  /** Parte ainda sem pagamento (total previsto). */
  openCents: Cents;
  /** Faturas do mês com valor. */
  invoiceCount: number;
  /** Alguma fatura do mês ainda está aberta (antes do fechamento): o valor pode mudar com novas compras. */
  hasOpenInvoice: boolean;
  /** Renda de referência vigente no mês; null sem ela. */
  referenceCents: Cents | null;
  /** Milésimos da renda de referência, metade para cima; null sem referência. */
  permille: number | null;
  /** "12,3%" ou "menos de 0,1%"; null sem referência ou sem fatura no mês. */
  percentText: string | null;
  /** Os próximos meses com fatura (até 3), em ordem, com o total previsto de cada um. */
  upcoming: CardMonthUpcoming[];
}

/** Valor da fatura no comprometido: paga pelo valor pago, as demais pelo total (zero quando não há conta a pagar). */
export function invoiceCommittedCents(i: Pick<Invoice, 'paidCents' | 'totalCents'>): Cents {
  return i.paidCents !== null ? i.paidCents : i.totalCents;
}

function monthCents(invoices: readonly Invoice[], month: IsoMonth): Cents {
  return invoices.filter((i) => i.month === month).reduce((acc, i) => acc + invoiceCommittedCents(i), 0);
}

/**
 * As faturas que vencem em `month`, somadas, e quanto isso é da renda de referência (`refs`: as referências do contexto).
 * `invoices`: as faturas de todos os cartões do contexto (buildInvoices de cada um).
 */
export function cardInvoicesMonth(invoices: readonly Invoice[], month: IsoMonth, refs: readonly IncomeReference[]): CardInvoicesMonth {
  const inMonth = invoices.filter((i) => i.month === month && invoiceCommittedCents(i) > 0);
  const paidCents = inMonth.reduce((acc, i) => acc + (i.paidCents !== null ? i.paidCents : 0), 0);
  const totalCents = inMonth.reduce((acc, i) => acc + invoiceCommittedCents(i), 0);
  const reference = referenceFor(refs, month);
  const referenceCents = reference ? reference.amountCents : null;
  const permille = committedPermille(totalCents, referenceCents);
  const upcoming: CardMonthUpcoming[] = [];
  for (let step = 1; step <= CARD_MONTH_UPCOMING_WINDOW && upcoming.length < CARD_MONTH_UPCOMING_COUNT; step++) {
    const next = addMonths(month, step);
    const cents = monthCents(invoices, next);
    if (cents > 0) upcoming.push({ month: next, cents });
  }
  return {
    month,
    totalCents,
    paidCents,
    openCents: totalCents - paidCents,
    invoiceCount: inMonth.length,
    hasOpenInvoice: inMonth.some((i) => i.situation === 'aberta'),
    referenceCents,
    permille,
    percentText: permille === null || totalCents <= 0 ? null : formatPermille(permille, totalCents),
    upcoming,
  };
}

export const CARD_MONTH_TEXT = {
  /** "Faturas de outubro" */
  title: (month: IsoMonth): string => `Faturas de ${formatMonthName(month)}`,
  /** Sem fatura vencendo no mês. */
  none: (month: IsoMonth): string => `Nenhuma fatura vence em ${formatMonthName(month)}.`,
  /** "12,3% da sua renda de referência" */
  percent: (percentText: string): string => `${percentText} da sua renda de referência`,
  noReference: 'Informe sua renda para ver quanto isso representa.',
  noReferenceLink: 'Informar minha renda de referência',
  /** Mostrado junto do total enquanto alguma fatura do mês ainda está aberta. */
  openNote: 'Inclui fatura ainda aberta: o valor pode mudar com novas compras.',
  /** Pagas pelo valor pago, as outras pelo total. */
  rule: 'Fatura paga entra pelo valor pago; as demais, pelo total previsto.',
  inCommitted: 'Já entra na sua renda comprometida, no grupo Faturas de cartão.',
  seeCommitted: 'Ver na renda comprometida',
  seeCommittedA11y: 'Ver na renda comprometida, grupo Faturas de cartão',
  /** "Próximas faturas (previsto): dezembro R$ 1.200,00, janeiro R$ 900,00" */
  upcoming: (items: readonly CardMonthUpcoming[]): string =>
    `Próximas faturas (previsto): ${items.map((u) => `${formatMonthName(u.month)} ${formatBRL(u.cents)}`).join(', ')}`,
} as const;
