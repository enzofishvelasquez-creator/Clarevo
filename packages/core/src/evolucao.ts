import { isValidIsoMonth, monthsBetween, type IsoDate, type IsoMonth } from './dates';
import { averageCents, roundDivBig } from './learn/math';
import type { Cents } from './money';
import type { MonthOverview } from './records';
import type { CategoryPart } from './summary';

/**
 * Evolução financeira, fase 1a (docs/14 §4): só contas puras sobre as linhas que months_overview já entrega. Sem banco,
 * sem tela e sem texto. Dinheiro em centavos inteiros; somas em bigint; arredondamento metade para cima.
 *
 * - Recebido e Pago pela data do pagamento, como no Resumo (a mesma soma de month_totals).
 * - Mês sem lançamentos é "sem registros", nunca zero confirmado (P-022 segue pendente).
 * - Ocultar um mês só tira o ponto da comparação: o total canônico não depende dele.
 *
 * Fase 2 (D-057, "Entender o que mudou"): `explainChange` compara dois meses por categoria, também em conta pura, sem texto.
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

// ---------------------------------------------------------------------------------------------------------------------
// Entender o que mudou (fase 2, EF-16 e EF-17)
// ---------------------------------------------------------------------------------------------------------------------

/** Quantas categorias a explicação mostra e quantos lançamentos ela relaciona. */
export const EXPLAIN_TOP_CATEGORIES = 3;
export const EXPLAIN_TOP_RECORDS = 3;

/** Um dos dois meses da explicação: o total da métrica (o mesmo dos pontos do gráfico) e as partes por categoria dos lançamentos dele. */
export interface ChangeSide {
  month: IsoMonth;
  /** Recebido ou Pago do mês, como o gráfico e a variação mostram (`months_overview`). */
  totalCents: Cents;
  /** `paidCategoryParts` (Pago) ou `receivedCategoryParts` (Recebido) dos lançamentos do mês. */
  parts: readonly CategoryPart[];
}

export interface CategoryChange {
  /** null = "Sem categoria". */
  category: string | null;
  label: string;
  fromCents: Cents;
  toCents: Cents;
  /** toCents menos fromCents, com sinal (positivo: subiu). Nunca 0 nas categorias devolvidas. */
  differenceCents: number;
}

/** Um lançamento do mês de chegada na categoria que mais mudou: o valor é a parte dele nessa categoria. */
export interface RelatedRecord {
  id: string;
  description: string;
  occurredOn: IsoDate;
  /** O que o lançamento tem na categoria (num pagamento de fatura, só a parte que cabe a ela). */
  cents: Cents;
  /** O valor do lançamento inteiro. */
  recordCents: Cents;
  /** A parte é menor que o lançamento inteiro (pagamento de fatura dividido por categorias). */
  partial: boolean;
}

export interface ChangeExplanation {
  fromMonth: IsoMonth;
  toMonth: IsoMonth;
  fromCents: Cents;
  toCents: Cents;
  /** toCents menos fromCents, com sinal. */
  differenceCents: number;
  /**
   * As partes por categoria fecham com o total de cada mês. Se não fecham (leitura incompleta ou de outro instante), a explicação por
   * categoria não vale: `categories`, `otherCents` e `related` vêm vazios e o app diz que não consegue detalhar.
   */
  reconciled: boolean;
  /** As categorias com maior diferença absoluta (até 3, só as que mudaram), da maior para a menor; empate: nome. */
  categories: CategoryChange[];
  /**
   * O que sobra da diferença total depois de somar as categorias de `categories` (com sinal); 0 quando elas fecham a diferença.
   * Diferente de 0 quer dizer que outras categorias também mudaram, nunca que uma categoria foi a causa.
   */
  otherCents: number;
  /** Os maiores lançamentos do mês de chegada na categoria de maior diferença (até 3); vazio se o mês não tem nenhum nela. */
  related: RelatedRecord[];
}

function checkSide(side: ChangeSide, name: string): void {
  if (!isValidIsoMonth(side.month)) throw new RangeError(`${name}: mês inválido: ${side.month}`);
  nonNegativeSafeInt(side.totalCents, `${name}: total`);
  for (const p of side.parts) nonNegativeSafeInt(p.cents, `${name}: parte`);
}

function sumByCategory(parts: readonly CategoryPart[]): Map<string | null, Cents> {
  const out = new Map<string | null, Cents>();
  for (const p of parts) out.set(p.category, (out.get(p.category) ?? 0) + p.cents);
  return out;
}

const byLabel = (a: { label: string }, b: { label: string }): number => a.label.localeCompare(b.label, 'pt-BR');

/**
 * O que mudou entre dois meses da mesma métrica, descrito sem julgamento e sem causa: a diferença total, as categorias com maior
 * diferença absoluta e os maiores lançamentos do mês de chegada na categoria que mais mudou. Determinística: mesmas entradas, mesma
 * saída (empate de categoria pelo nome; de lançamento por valor, data mais recente, descrição e id). Usa as mesmas partes de
 * `categoryBreakdown`, então o pagamento de fatura entra dividido pelas categorias e nada é contado duas vezes (T15).
 *
 * Março com Casa R$ 1.200,00 e abril com Casa R$ 5.600,00: Casa muda R$ 4.400,00 a mais. Se a soma das 3 categorias que mais mudaram
 * não é a diferença total, a sobra vai em `otherCents` ("Outras categorias também mudaram"). Não altera o que recebe. Lança RangeError
 * com mês inválido, os dois meses iguais, total negativo ou não inteiro e parte negativa.
 */
export function explainChange(from: ChangeSide, to: ChangeSide): ChangeExplanation {
  checkSide(from, 'mês de partida');
  checkSide(to, 'mês de chegada');
  if (from.month === to.month) throw new RangeError(`os dois meses são ${from.month}`);
  const before = sumByCategory(from.parts);
  const after = sumByCategory(to.parts);
  let beforeSum = 0;
  for (const c of before.values()) beforeSum += c;
  let afterSum = 0;
  for (const c of after.values()) afterSum += c;
  const differenceCents = to.totalCents - from.totalCents;
  const reconciled = beforeSum === from.totalCents && afterSum === to.totalCents;
  const empty: ChangeExplanation = {
    fromMonth: from.month,
    toMonth: to.month,
    fromCents: from.totalCents,
    toCents: to.totalCents,
    differenceCents,
    reconciled,
    categories: [],
    otherCents: 0,
    related: [],
  };
  if (!reconciled) return empty;
  const labels = new Map<string | null, string>();
  for (const p of [...from.parts, ...to.parts]) labels.set(p.category, p.label);
  const changes: CategoryChange[] = [...new Set([...before.keys(), ...after.keys()])]
    .map((category): CategoryChange => {
      const fromCents = before.get(category) ?? 0;
      const toCents = after.get(category) ?? 0;
      return { category, label: labels.get(category)!, fromCents, toCents, differenceCents: toCents - fromCents };
    })
    .filter((c) => c.differenceCents !== 0)
    .sort((a, b) => Math.abs(b.differenceCents) - Math.abs(a.differenceCents) || byLabel(a, b));
  const categories = changes.slice(0, EXPLAIN_TOP_CATEGORIES);
  const otherCents = differenceCents - categories.reduce((acc, c) => acc + c.differenceCents, 0);
  const leading = categories[0];
  const perRecord = new Map<string, RelatedRecord>();
  if (leading) {
    for (const p of to.parts) {
      if (p.category !== leading.category) continue;
      const seen = perRecord.get(p.record.id);
      if (seen) seen.cents += p.cents;
      else perRecord.set(p.record.id, { id: p.record.id, description: p.record.description, occurredOn: p.record.occurredOn, cents: p.cents, recordCents: p.record.amountCents, partial: false });
    }
  }
  const related = [...perRecord.values()]
    .map((r) => ({ ...r, partial: r.cents < r.recordCents }))
    .sort((a, b) => b.cents - a.cents || b.occurredOn.localeCompare(a.occurredOn) || a.description.localeCompare(b.description, 'pt-BR') || a.id.localeCompare(b.id))
    .slice(0, EXPLAIN_TOP_RECORDS);
  return { ...empty, categories, otherCents, related };
}
