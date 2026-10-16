import { isValidIsoMonth, monthsBetween, type IsoMonth } from './dates';
import { averageCents, roundDivBig } from './learn/math';
import type { Cents } from './money';
import type { MonthOverview } from './records';

/**
 * Evolução financeira, fase 1a (docs/14 §4): só contas puras sobre as linhas que months_overview já entrega. Sem banco,
 * sem tela e sem texto. Dinheiro em centavos inteiros; somas em bigint; arredondamento metade para cima.
 *
 * - Recebido e Pago pela data do pagamento, como no Resumo (a mesma soma de month_totals).
 * - Mês sem lançamentos é "sem registros", nunca zero confirmado (P-022 segue pendente).
 * - Ocultar um mês só tira o ponto da comparação: o total canônico não depende dele.
 */

/** Qual série mostrar: o que entrou (Recebido) ou o que saiu (Pago). */
export type EvolutionMetric = 'recebido' | 'pago';

/**
 * Estado de um ponto mensal:
 * - sem_registros: a contagem de lançamentos é 0 (o valor 0 não quer dizer que nada foi gasto ou recebido);
 * - em_andamento: o mês atual, que ainda pode receber lançamentos;
 * - com_registros: os demais, com ao menos um lançamento.
 */
export type EvolutionPointState = 'sem_registros' | 'em_andamento' | 'com_registros';

export interface EvolutionPoint {
  month: IsoMonth;
  cents: Cents;
  /** Lançamentos do mês na métrica. */
  count: number;
  state: EvolutionPointState;
}

function nonNegativeSafeInt(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(`${name} inválido: ${value}`);
  return value;
}

/**
 * Pontos da série, do mês mais antigo ao mais recente, a partir das linhas de months_overview (ou de monthsOverview, no
 * core). Linhas fora de ordem são ordenadas; mês repetido, mês inválido, valor negativo ou não inteiro lançam RangeError.
 * A contagem 0 vence: o mês atual sem lançamento é sem_registros. Não altera o que recebe.
 * evolutionPoints([{ month: '2026-04', receivedCount: 0, receivedCents: 0, paidCount: 2, paidCents: 780.000 }], 'pago', '2026-06')
 * → [{ month: '2026-04', cents: 780.000, count: 2, state: 'com_registros' }].
 */
export function evolutionPoints(overview: readonly MonthOverview[], metric: EvolutionMetric, currentMonth: IsoMonth): EvolutionPoint[] {
  if (metric !== 'recebido' && metric !== 'pago') throw new RangeError(`métrica inválida: ${String(metric)}`);
  if (!isValidIsoMonth(currentMonth)) throw new RangeError(`mês atual inválido: ${currentMonth}`);
  const points = overview.map((row): EvolutionPoint => {
    if (!isValidIsoMonth(row.month)) throw new RangeError(`mês inválido: ${row.month}`);
    const cents = nonNegativeSafeInt(metric === 'recebido' ? row.receivedCents : row.paidCents, 'valor');
    const count = nonNegativeSafeInt(metric === 'recebido' ? row.receivedCount : row.paidCount, 'contagem');
    const state: EvolutionPointState = count === 0 ? 'sem_registros' : row.month === currentMonth ? 'em_andamento' : 'com_registros';
    return { month: row.month, cents, count, state };
  });
  points.sort((a, b) => (a.month < b.month ? -1 : a.month > b.month ? 1 : 0));
  for (let i = 1; i < points.length; i++) {
    if (points[i]!.month === points[i - 1]!.month) throw new RangeError(`mês repetido: ${points[i]!.month}`);
  }
  return points;
}

/** Estados que entram na média e na mediana (D04): só mês fechado e com lançamentos. */
export const COMPARISON_ELIGIBLE_STATES: readonly Exclude<EvolutionPointState, 'sem_registros'>[] = ['com_registros'];

export interface ComparisonStats {
  /** N: pontos elegíveis (com ou sem ocultos). */
  eligibleCount: number;
  /** n: elegíveis que não estão ocultos. */
  visibleCount: number;
  /** Soma dos valores visíveis, exata. */
  visibleSum: bigint;
  /** Média dos visíveis, metade para cima; null com n = 0, nunca 0. */
  average: Cents | null;
  /** Mediana dos visíveis; com n par, a média dos dois do meio, metade para cima; null com n = 0, nunca 0. */
  median: Cents | null;
  /** Soma de todos os pontos, qualquer que seja a seleção: o total que os relatórios mostram. */
  canonicalTotal: bigint;
  /** Meses visíveis, na ordem dos pontos. */
  visibleMonths: IsoMonth[];
  /** Meses elegíveis que a pessoa ocultou, na ordem dos pontos. */
  hiddenMonths: IsoMonth[];
}

/** Mediana de uma lista não vazia: o do meio, ou a média dos dois do meio (metade para cima), sem somar em ponto flutuante. */
function medianCents(values: readonly Cents[]): Cents {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle]!;
  return Number(roundDivBig(BigInt(sorted[middle - 1]!) + BigInt(sorted[middle]!), 2n));
}

/**
 * Média, mediana e totais da comparação.
 * - Elegíveis: os pontos cujo estado está em eligibleStates (padrão COMPARISON_ELIGIBLE_STATES: só com_registros, então o
 *   mês em andamento e os meses sem registros ficam de fora). Sem registros nunca é elegível, mesmo se a lista pedir.
 * - Visíveis: os elegíveis fora de hiddenMonths. Mês oculto que não existe nos pontos, ou que não é elegível, é ignorado.
 * - canonicalTotal soma todos os pontos e não depende de hiddenMonths nem de eligibleStates.
 * Com n = 0, average e median são null. Não altera points nem hiddenMonths.
 * Seis meses 320.000, 340.000, 330.000, 780.000, 345.000 e 360.000: média 412.500, mediana 342.500, total 2.475.000;
 * sem o de 780.000, média 339.000, mediana 340.000, n = 5, total 2.475.000.
 */
export function comparisonStats(
  points: readonly EvolutionPoint[],
  hiddenMonths: Iterable<IsoMonth>,
  eligibleStates: readonly Exclude<EvolutionPointState, 'sem_registros'>[] = COMPARISON_ELIGIBLE_STATES,
): ComparisonStats {
  const hidden = new Set(hiddenMonths);
  const eligible = new Set<EvolutionPointState>(eligibleStates);
  eligible.delete('sem_registros');
  let canonicalTotal = 0n;
  let eligibleCount = 0;
  let visibleSum = 0n;
  const visible: EvolutionPoint[] = [];
  const hiddenOut: IsoMonth[] = [];
  for (const p of points) {
    canonicalTotal += BigInt(p.cents);
    if (!eligible.has(p.state)) continue;
    eligibleCount += 1;
    if (hidden.has(p.month)) {
      hiddenOut.push(p.month);
    } else {
      visible.push(p);
      visibleSum += BigInt(p.cents);
    }
  }
  const values = visible.map((p) => p.cents);
  return {
    eligibleCount,
    visibleCount: visible.length,
    visibleSum,
    average: values.length === 0 ? null : averageCents(values),
    median: values.length === 0 ? null : medianCents(values),
    canonicalTotal,
    visibleMonths: visible.map((p) => p.month),
    hiddenMonths: hiddenOut,
  };
}

interface PointVariationBase {
  /** Mês de partida (a) e mês de chegada (b): a tela mostra sempre as duas datas. */
  fromMonth: IsoMonth;
  toMonth: IsoMonth;
  /** Falso quando os meses não são vizinhos no calendário (com ou sem mês oculto no meio): nunca chamar de mês a mês. */
  adjacent: boolean;
  /** b menos a, em centavos, com sinal (positivo: subiu). Só a conta dos dois valores. */
  differenceCents: Cents;
}

/**
 * Variação entre dois pontos. Com comparable false não há percentual: a base (a) é zero ou algum dos dois meses está
 * sem registros, e a tela não deve apresentar a diferença como mudança.
 */
export type PointVariation = PointVariationBase & ({ comparable: true; permille: number } | { comparable: false; permille: null });

/**
 * Variação de a para b: diferença em centavos e percentual em milésimos (permille, metade para longe do zero) sobre a
 * base a, só quando a base é maior que zero e nenhum dos dois pontos está sem registros. Resultado fora do inteiro seguro
 * lança RangeError.
 * De março (330.000) para abril (780.000): +450.000, 1.364 permille (136,4%), adjacent true.
 * De março para maio (345.000) com abril oculto: +15.000, 45 permille, adjacent false.
 */
export function pointVariation(a: EvolutionPoint, b: EvolutionPoint): PointVariation {
  const base: PointVariationBase = {
    fromMonth: a.month,
    toMonth: b.month,
    adjacent: Math.abs(monthsBetween(a.month, b.month)) === 1,
    differenceCents: b.cents - a.cents,
  };
  if (a.cents <= 0 || a.state === 'sem_registros' || b.state === 'sem_registros') return { ...base, comparable: false, permille: null };
  const permille = roundDivBig((BigInt(b.cents) - BigInt(a.cents)) * 1000n, BigInt(a.cents));
  if (permille > BigInt(Number.MAX_SAFE_INTEGER) || permille < -BigInt(Number.MAX_SAFE_INTEGER)) throw new RangeError('variação grande demais');
  return { ...base, comparable: true, permille: Number(permille) };
}
