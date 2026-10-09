import { CALC_UI_TEXT } from './calculators/catalog';
import type { IsoDate, IsoMonth } from './dates';
import { formatMonthName, formatMonthYearBR, monthOf } from './dates';
import { formatBRL, type Cents } from './money';
import type { CommitmentSeries } from './records';
import type { ToPaySummary } from './summary';

/**
 * Bloco "Organizar" de Movimentos (docs/08 §2.2; spec4 §1.2): legendas dinâmicas das duas primeiras linhas e a fixa
 * de "Calculadoras". Enquanto carrega e em erro, o app mostra a legenda fixa (fallback). Nenhuma cor de alerta.
 */
export const ORGANIZE_TEXT = {
  title: 'Organizar',
  payables: { title: 'Contas a pagar', fallback: 'Vencidas, a vencer e próximos meses' },
  series: { title: 'Gastos fixos e parcelamentos', fallback: 'Aluguel, escola, financiamentos e contas do ano' },
  calculators: { title: CALC_UI_TEXT.shortcutTitle, caption: CALC_UI_TEXT.shortcutCaption },
} as const;

export interface PayablesCaptionInput {
  /** "Ainda a pagar" do mês mostrado (summarizeToPay(...).toPayCents, D-021(5)). */
  openCents: Cents;
  /** Contas em aberto vencidas antes de hoje entre as do total (summarizeToPay(...).overdueCount). */
  overdueCount: number;
  /** Mês mostrado em Movimentos. */
  month: IsoMonth;
  /** Mês de hoje. */
  currentMonth: IsoMonth;
}

/**
 * Legenda de "Contas a pagar": "R$ 650,00 em aberto neste mês · 1 vencida", "Nada em aberto neste mês",
 * "R$ 300,00 em aberto em novembro", "Nada em aberto em novembro"; em outro ano, "em janeiro de 2027".
 */
export function payablesCaption({ openCents, overdueCount, month, currentMonth }: PayablesCaptionInput): string {
  const where = month === currentMonth ? 'neste mês' : month.slice(0, 4) === currentMonth.slice(0, 4) ? `em ${formatMonthName(month)}` : `em ${formatMonthYearBR(month)}`;
  if (openCents <= 0) return `Nada em aberto ${where}`;
  const overdue = overdueCount <= 0 ? '' : overdueCount === 1 ? ' · 1 vencida' : ` · ${overdueCount} vencidas`;
  return `${formatBRL(openCents)} em aberto ${where}${overdue}`;
}

/** payablesCaption a partir do mesmo resumo do card "Ainda a pagar" (summarizeToPay). */
export function payablesCaptionFromSummary(s: Pick<ToPaySummary, 'toPayCents' | 'overdueCount' | 'month'>, today: IsoDate): string {
  return payablesCaption({ openCents: s.toPayCents, overdueCount: s.overdueCount, month: s.month, currentMonth: monthOf(today) });
}

/**
 * Legenda de "Gastos fixos e parcelamentos", contando tudo o que está cadastrado (como a lista, inclusive encerrados):
 * "Nenhum cadastrado. Aluguel, escola, financiamento, IPVA", "1 cadastrado", "4 cadastrados" e, com alguma conta do ano
 * entre eles, "5 cadastrados, com as contas do ano".
 */
export function seriesCaptionShort(list: readonly Pick<CommitmentSeries, 'kind'>[]): string {
  const n = list.length;
  if (n === 0) return 'Nenhum cadastrado. Aluguel, escola, financiamento, IPVA';
  if (n === 1) return '1 cadastrado';
  return list.some((s) => s.kind === 'anual') ? `${n} cadastrados, com as contas do ano` : `${n} cadastrados`;
}

/** Nome acessível da linha: "Contas a pagar, R$ 650,00 em aberto neste mês, 1 vencida". */
export function shortcutA11yLabel(title: string, caption: string): string {
  return `${title}, ${caption.replace(/ · /g, ', ')}`;
}
