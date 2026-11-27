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
 * - "Próximas faturas": até 3 dos 6 meses seguintes que têm fatura com valor, sempre "previsto". Desde a análise geral de 26/11/2026
 *   (estudo de mercado, sinal 24: "Barras simples por mês para faturas"), em barras, uma por mês (`cardMonthUpcomingBars`), com o mês e o
 *   valor sempre escritos: a barra só desenha os mesmos números de `upcoming`, na escala do maior mês da lista, numa cor só.
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

/** Menor barra de "Próximas faturas", em décimos de por cento: um mês de valor pequeno ainda aparece como um traço. */
export const CARD_MONTH_BAR_MIN_TENTHS = 20;

/** Uma barra de "Próximas faturas": o mês, o valor previsto e a largura, na escala do maior mês da lista. */
export interface CardMonthUpcomingBar extends CardMonthUpcoming {
  /** "Novembro"; em outro ano que o do mês da tela, "Janeiro de 2027". */
  label: string;
  /** "R$ 550,00" */
  valueText: string;
  /** Largura da barra em décimos de por cento (de CARD_MONTH_BAR_MIN_TENTHS a 1000): 1000 é o maior mês da lista. */
  tenths: number;
  /** Nome acessível da linha: "Novembro: R$ 550,00, previsto" (com valores ocultos, "Novembro: valor oculto, previsto"). */
  a11y: string;
}

/**
 * As próximas faturas em barras (análise geral de 26/11/2026, sinal 24 do estudo de mercado). Nenhuma conta nova: os meses e os valores
 * são os de `cardInvoicesMonth(...).upcoming`, na mesma ordem; só a largura é calculada, em décimos do maior mês da lista (metade para
 * cima, com o mínimo de CARD_MONTH_BAR_MIN_TENTHS). O mês e o valor ficam sempre em texto: a barra é só desenho, numa cor só, que não
 * muda com o valor. Sem próximas faturas, lista vazia.
 */
export function cardMonthUpcomingBars(data: Pick<CardInvoicesMonth, 'month' | 'upcoming'>): CardMonthUpcomingBar[] {
  const max = data.upcoming.reduce((acc, u) => Math.max(acc, u.cents), 0);
  return data.upcoming.map((u) => {
    const name = formatMonthName(u.month);
    const label = CARD_MONTH_TEXT.barLabel(u.month.slice(0, 4) === data.month.slice(0, 4) ? name : `${name} de ${u.month.slice(0, 4)}`);
    const valueText = formatBRL(u.cents);
    const tenths = max > 0 ? Math.min(1000, Math.max(CARD_MONTH_BAR_MIN_TENTHS, Math.round((u.cents * 1000) / max))) : CARD_MONTH_BAR_MIN_TENTHS;
    return { month: u.month, cents: u.cents, label, valueText, tenths, a11y: CARD_MONTH_TEXT.barA11y(label, valueText) };
  });
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
  /** Título das barras das próximas faturas (até 26/11/2026, uma frase: "Próximas faturas (previsto): novembro R$ 550,00, ..."). */
  upcomingTitle: 'Próximas faturas (previsto)',
  /** Nome acessível da lista das barras. */
  upcomingListA11y: 'Próximas faturas, valores previstos por mês',
  /** "novembro" → "Novembro"; "janeiro de 2027" → "Janeiro de 2027". */
  barLabel: (month: string): string => `${month.charAt(0).toUpperCase()}${month.slice(1)}`,
  /** "Novembro: R$ 550,00, previsto" */
  barA11y: (label: string, valueText: string): string => `${label}: ${valueText}, previsto`,
} as const;
