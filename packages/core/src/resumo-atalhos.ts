import { ANALYSES_TEXT } from './analises';
import { CALENDAR_TEXT } from './calendar';
import type { IsoDate, IsoMonth } from './dates';
import { formatDateBR, formatMonthYearBR } from './dates';
import type { Investment } from './investments';
import type { Cents } from './money';
import { formatBRL } from './money';

/**
 * Atalhos do Resumo (D-105): um cartão curto, sem título, depois de "Pagamentos do mês", com as Análises do mês, o calendário do mês e, só no Pessoal e com
 * algum investimento ativo, a linha "Investir", que leva à aba com o valor de hoje e a data das atualizações. A ordem dos blocos aprovados não
 * muda (o cartão entra entre "Pagamentos do mês" e o cartão de Aprender). "Ocultar valores" vale para a linha de Investir.
 *
 * A data é a da última atualização de valor de cada investimento ativo: com todas no mesmo dia, "valores de 06/10/2026"; com dias
 * diferentes, o intervalo, "valores de 30/09/2026 a 06/10/2026" (o mais antigo primeiro, para nenhum valor velho passar por novo). Um
 * investimento ainda sem atualização vale o aportado: a linha diz quantos estão assim.
 */

export interface InvestmentsSummaryLine {
  /** Soma do valor de hoje dos investimentos ativos. */
  valueCents: Cents;
  count: number;
  /** Datas da atualização de valor (a mais antiga e a mais recente); null se nenhum tem atualização. */
  oldestOn: IsoDate | null;
  newestOn: IsoDate | null;
  /** Ativos sem nenhuma atualização de valor. */
  withoutUpdate: number;
  /** "R$ 15.955,00 · valores de 06/10/2026". */
  caption: string;
  /** Nome acessível, com o valor em reais (o app mascara com "Ocultar valores"). */
  a11y: string;
}

export const SUMMARY_SHORTCUTS_TEXT = {
  /** As Análises do mês (retorno do teste, 17/11/2026: "não estou mais achando as análises"), primeira linha do cartão. */
  analysesTitle: 'Análises do mês',
  analysesCaption: ANALYSES_TEXT.rowCaption,
  calendarTitle: CALENDAR_TEXT.rowTitle,
  /** "Contas, faturas e datas de outubro de 2026". */
  calendarCaption: (month: IsoMonth) => `Contas, faturas e datas de ${formatMonthYearBR(month)}`,
  /** "Investir", o nome da aba (o título "Seus investimentos hoje" fica só na aba, para as duas telas não se confundirem). */
  investTitle: 'Investir',
  sameDay: (d: IsoDate) => `valores de ${formatDateBR(d)}`,
  range: (from: IsoDate, to: IsoDate) => `valores de ${formatDateBR(from)} a ${formatDateBR(to)}`,
  withoutUpdate: (n: number) => (n === 1 ? '1 sem atualização de valor' : `${n} sem atualização de valor`),
  /** Toque: "Abre a aba Investir, para ver e atualizar valores". */
  investHint: 'Abre a aba Investir, para ver e atualizar valores',
} as const;

/** A linha de Investir no Resumo; null sem investimento ativo (a linha some). */
export function investmentsSummaryLine(investments: readonly Pick<Investment, 'status' | 'valueCents' | 'lastValueOn'>[]): InvestmentsSummaryLine | null {
  const active = investments.filter((i) => i.status === 'ativo');
  if (active.length === 0) return null;
  const T = SUMMARY_SHORTCUTS_TEXT;
  const dates = active.flatMap((i) => (i.lastValueOn ? [i.lastValueOn] : [])).sort();
  const oldestOn = dates[0] ?? null;
  const newestOn = dates[dates.length - 1] ?? null;
  const withoutUpdate = active.length - dates.length;
  const valueCents = active.reduce((sum, i) => sum + i.valueCents, 0);
  const parts = [formatBRL(valueCents)];
  if (oldestOn && newestOn) parts.push(oldestOn === newestOn ? T.sameDay(oldestOn) : T.range(oldestOn, newestOn));
  if (withoutUpdate > 0) parts.push(T.withoutUpdate(withoutUpdate));
  const caption = parts.join(' · ');
  return { valueCents, count: active.length, oldestOn, newestOn, withoutUpdate, caption, a11y: `${T.investTitle}, ${parts.join(', ')}` };
}

/**
 * A entrada das Análises no topo de Movimentos (D-105, retorno do teste de 17/11/2026): uma pílula "Análises" na linha do título, que não
 * empurra a lista. A linha "Ver análises do mês" depois da lista continua. O nome acessível começa pelo texto visível.
 */
export const ANALYSES_ENTRY_TEXT = {
  label: 'Análises',
  a11y: `Análises do mês. ${ANALYSES_TEXT.rowCaption}.`,
} as const;
