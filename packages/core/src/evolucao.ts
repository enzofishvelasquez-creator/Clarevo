import { summarizeCommitted, formatPermille } from './committed';
import { isValidIsoMonth, monthOf, monthsBetween, todayIn, type IsoDate, type IsoMonth } from './dates';
import { savedInMonth } from './goals';
import { averageCents, medianCents, roundDivBig } from './learn/math';
import { formatBRL, type Cents } from './money';
import type { Commitment, Goal, GoalMovement, IncomeReference, MonthOverview } from './records';
import type { CategoryPart } from './summary';

/**
 * Evolução financeira, fase 1a (docs/14 §4): só contas puras sobre as linhas que months_overview já entrega. Sem banco,
 * sem tela e sem texto. Dinheiro em centavos inteiros; somas em bigint; arredondamento metade para cima.
 *
 * - Recebido e Pago pela data do pagamento, como no Resumo (a mesma soma de month_totals).
 * - Mês sem lançamentos é "sem registros" (nunca um zero), a não ser que a pessoa tenha conferido (D-060, "Conferi este mês",
 *   P-022): aí é "zero confirmado", um zero de verdade que entra nas médias e na mediana (D04).
 * - Ocultar um mês só tira o ponto da comparação: o total canônico não depende dele.
 *
 * Fase 2 (D-057, "Entender o que mudou"): `explainChange` compara dois meses por categoria, também em conta pura, sem texto.
 *
 * Fase 3 (D-062 item 4): "Renda comprometida" (`committedEvolutionPoints`, o percentual do mês que `summarizeCommitted` já calcula) e
 * "Guardado em metas" (`savingsEvolutionPoints`, aportes menos resgates, `savedInMonth`), só de meses fechados: o mês atual e os
 * futuros nunca têm valor (nada de previsão). Cada um tem a própria base; mês sem base (renda de referência) ou sem registros fica
 * fora das médias e nunca vira zero; zero só quando há como afirmar (renda comprometida: nunca sem conta anotada; guardado: com
 * meta ativa no mês).
 */

/** Qual série mostrar: o que entrou (Recebido) ou o que saiu (Pago). */
export type EvolutionMetric = 'recebido' | 'pago';

/** Os dois valores novos da fase 3 (D-062 item 4): o percentual da renda de referência ligado a contas do mês e o guardado em metas. */
export type EvolutionPhase3Metric = 'comprometida' | 'guardado';

/** Tudo o que o seletor da Evolução oferece; a seleção de meses fora da comparação é separada por valor (T13). */
export type EvolutionSelectionMetric = EvolutionMetric | EvolutionPhase3Metric;

export function isPhase3Metric(value: unknown): value is EvolutionPhase3Metric {
  return value === 'comprometida' || value === 'guardado';
}

/**
 * Estado de um ponto mensal:
 * - sem_registros: a contagem de lançamentos é 0 e a pessoa não conferiu o mês (o valor 0 não quer dizer que nada foi gasto ou recebido);
 * - zero_confirmado: a contagem é 0 e a pessoa conferiu o mês já terminado (D-060): o zero é um fato, a tela mostra "R$ 0,00, conferido"
 *   e ele entra nas médias e na mediana como zero (D04);
 * - em_andamento: o mês atual, que ainda pode receber lançamentos (na fase 3 não tem valor: só meses fechados);
 * - com_registros: os demais, com ao menos um lançamento;
 * - sem_base (só na Renda comprometida, fase 3): mês fechado sem renda de referência, sem o que dividir: nunca é zero e fica fora das contas.
 *   Em "Guardado em metas", zero_confirmado é o mês fechado sem aporte nem resgate com ao menos uma meta ativa.
 */
export type EvolutionPointState = 'sem_registros' | 'zero_confirmado' | 'em_andamento' | 'com_registros' | 'sem_base';

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
 * A contagem 0 vence: o mês atual sem lançamento é sem_registros. Contagem 0 e a marca "conferi" (receivedChecked ou paidChecked, da
 * métrica) num mês já terminado é zero_confirmado; no mês atual ou num futuro a marca não vale (o banco nem a deixa existir). Com
 * lançamento a marca não conta: o mês é com_registros. Não altera o que recebe.
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
    const checked = (metric === 'recebido' ? row.receivedChecked : row.paidChecked) === true;
    const state: EvolutionPointState =
      count === 0 ? (checked && row.month < currentMonth ? 'zero_confirmado' : 'sem_registros') : row.month === currentMonth ? 'em_andamento' : 'com_registros';
    return { month: row.month, cents, count, state };
  });
  points.sort((a, b) => (a.month < b.month ? -1 : a.month > b.month ? 1 : 0));
  for (let i = 1; i < points.length; i++) {
    if (points[i]!.month === points[i - 1]!.month) throw new RangeError(`mês repetido: ${points[i]!.month}`);
  }
  return points;
}

/**
 * Estados que entram na média e na mediana (D04): só mês fechado e com lançamentos, ou conferido sem lançamentos (zero confirmado, que
 * entra como zero). O mês em andamento e o mês sem registros ficam de fora.
 */
export const COMPARISON_ELIGIBLE_STATES: readonly Exclude<EvolutionPointState, 'sem_registros' | 'sem_base'>[] = ['com_registros', 'zero_confirmado'];

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

/**
 * Média, mediana e totais da comparação.
 * - Elegíveis: os pontos cujo estado está em eligibleStates (padrão COMPARISON_ELIGIBLE_STATES: com_registros e zero_confirmado, então o
 *   mês em andamento e os meses sem registros ficam de fora). Sem registros e sem base nunca são elegíveis, mesmo se a lista pedir. O
 *   zero confirmado entra com valor 0: puxa a média e a mediana para baixo, como o zero que é. Os valores podem ser negativos (Guardado
 *   em metas, com mais resgates que aportes) e podem ser milésimos da renda (Renda comprometida): a média e a mediana são as mesmas
 *   contas, metade para cima (para longe do zero nos negativos).
 * - Visíveis: os elegíveis fora de hiddenMonths. Mês oculto que não existe nos pontos, ou que não é elegível, é ignorado.
 * - canonicalTotal soma todos os pontos e não depende de hiddenMonths nem de eligibleStates.
 * Com n = 0, average e median são null. Não altera points nem hiddenMonths.
 * Seis meses 320.000, 340.000, 330.000, 780.000, 345.000 e 360.000: média 412.500, mediana 342.500, total 2.475.000;
 * sem o de 780.000, média 339.000, mediana 340.000, n = 5, total 2.475.000. Com um sétimo mês, zero confirmado: média 353.571
 * (2.475.000 / 7, metade para cima), mediana 340.000, n = 7.
 */
export function comparisonStats(
  points: readonly EvolutionPoint[],
  hiddenMonths: Iterable<IsoMonth>,
  eligibleStates: readonly Exclude<EvolutionPointState, 'sem_registros' | 'sem_base'>[] = COMPARISON_ELIGIBLE_STATES,
): ComparisonStats {
  const hidden = new Set(hiddenMonths);
  const eligible = new Set<EvolutionPointState>(eligibleStates);
  eligible.delete('sem_registros');
  eligible.delete('sem_base');
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
    average: values.length === 0 ? null : averageCents(values, { signed: true }),
    median: values.length === 0 ? null : medianCents(values, { signed: true }),
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

// ---------------------------------------------------------------------------------------------------------------------
// Fase 3 (D-062 item 4): Renda comprometida e Guardado em metas, só de meses fechados
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Um mês de "Renda comprometida" ou de "Guardado em metas". `cents` é o valor da métrica: milésimos da renda de referência na Renda
 * comprometida (525 = 52,5%) e centavos, com sinal, no Guardado em metas (aportes menos resgates; negativo com mais resgates que
 * aportes). Sem valor (mês em andamento, sem base, sem registros), `cents` é 0 e `valueText` é null: nunca se lê o 0 como dado.
 */
export interface Phase3Point extends EvolutionPoint {
  /** "52,5%", "menos de 0,1%" ou "R$ 200,00"; null quando o mês não tem valor. */
  valueText: string | null;
}

function checkPhase3Months(months: readonly IsoMonth[], currentMonth: IsoMonth): void {
  if (!isValidIsoMonth(currentMonth)) throw new RangeError(`mês atual inválido: ${currentMonth}`);
  for (const month of months) {
    if (!isValidIsoMonth(month)) throw new RangeError(`mês inválido: ${month}`);
    if (month > currentMonth) throw new RangeError(`mês futuro: ${month}`);
  }
}

const noValue = (month: IsoMonth, state: EvolutionPointState): Phase3Point => ({ month, cents: 0, count: 0, state, valueText: null });

/**
 * Os pontos da "Renda comprometida" (D-062 item 4), um por mês de `months`, do mês de cada conta que `summarizeCommitted` já resume (o
 * percentual do mês é o `committedPermille` dele, o mesmo de `month_committed`; por mês, uma leitura de `listCommitments`):
 * - mês atual: em_andamento, sem valor (só meses fechados: nada do mês atual nem de meses futuros);
 * - mês fechado sem renda de referência que valha nele: sem_base, sem valor, nunca 0% (não há com o que dividir), mesmo com contas;
 * - mês fechado com a referência e sem nenhuma conta anotada com vencimento nele: sem_registros, sem valor (conta não anotada não é
 *   0%, como Pago sem lançamento não é R$ 0,00);
 * - os demais: com_registros, com o percentual em milésimos ("52,5%", "menos de 0,1%").
 * `commitmentsByMonth` traz a leitura de cada mês fechado (`listCommitments(contexto, mês)`); mês fechado que falta lança RangeError (a
 * tela só monta com tudo lido, nunca com dado parcial) e mês depois do atual também. Contas e referências de outro contexto ficam fora.
 */
export function committedEvolutionPoints(input: {
  months: readonly IsoMonth[];
  currentMonth: IsoMonth;
  contextId: string;
  today: IsoDate;
  commitmentsByMonth: ReadonlyMap<IsoMonth, readonly Commitment[]>;
  refs: readonly IncomeReference[];
}): Phase3Point[] {
  const { months, currentMonth } = input;
  checkPhase3Months(months, currentMonth);
  return months.map((month): Phase3Point => {
    if (month === currentMonth) return noValue(month, 'em_andamento');
    const list = input.commitmentsByMonth.get(month);
    if (!list) throw new RangeError(`contas do mês não lidas: ${month}`);
    const summary = summarizeCommitted(list, input.contextId, month, input.today, input.refs);
    if (summary.referenceCents === null || summary.committedPermille === null) return noValue(month, 'sem_base');
    if (summary.count === 0) return noValue(month, 'sem_registros');
    return {
      month,
      cents: summary.committedPermille,
      count: summary.count,
      state: 'com_registros',
      valueText: formatPermille(summary.committedPermille, summary.committedCents),
    };
  });
}

/**
 * A meta estava ativa no mês `month`? O Clarevo só guarda a situação de agora, sem histórico: vale a meta ativa hoje que foi criada até o
 * fim do mês (no fuso de quem usa) ou que tem algum movimento, de qualquer tipo, no mês (o saldo inicial pode ter data de antes da
 * criação). Meta concluída ou arquivada não conta, porque não há como saber desde quando ficou assim: na dúvida, o mês fica sem registros
 * e nunca vira um zero afirmado.
 */
function goalActiveIn(goal: Goal, movements: readonly GoalMovement[], month: IsoMonth, timeZone: string): boolean {
  if (goal.status !== 'ativa') return false;
  if (movements.some((m) => m.goalId === goal.id)) return true;
  const created = new Date(goal.createdAt);
  return !Number.isNaN(created.getTime()) && monthOf(todayIn(timeZone, created)) <= month;
}

/**
 * Os pontos do "Guardado em metas" (D-062 item 4), um por mês de `months`: aportes menos resgates do mês (`savedInMonth`; o já guardado ao
 * criar, rendimentos e valorizações ficam fora), que pode ser negativo:
 * - mês atual: em_andamento, sem valor (só meses fechados);
 * - mês fechado com ao menos um aporte ou resgate: com_registros, com o valor (R$ 0,00 se se anularam);
 * - mês fechado sem aporte nem resgate: zero_confirmado (R$ 0,00) se havia ao menos uma meta ativa no mês, senão sem_registros, sem
 *   valor (sem meta, não há o que afirmar). Meta ativa: ver `goalActiveIn`.
 * `movementsByMonth` traz os movimentos de cada mês fechado (`listGoalMovementsInMonth`); `goals` vem de `listGoals`. Mês fechado que
 * falta lança RangeError, e mês depois do atual também. `timeZone` é o fuso de quem usa (a data de criação da meta).
 */
export function savingsEvolutionPoints(input: {
  months: readonly IsoMonth[];
  currentMonth: IsoMonth;
  goals: readonly Goal[];
  movementsByMonth: ReadonlyMap<IsoMonth, readonly GoalMovement[]>;
  timeZone: string;
}): Phase3Point[] {
  const { months, currentMonth } = input;
  checkPhase3Months(months, currentMonth);
  return months.map((month): Phase3Point => {
    if (month === currentMonth) return noValue(month, 'em_andamento');
    const movements = input.movementsByMonth.get(month);
    if (!movements) throw new RangeError(`movimentos das metas do mês não lidos: ${month}`);
    const counted = movements.filter((m) => monthOf(m.occurredOn) === month && (m.kind === 'aporte' || m.kind === 'resgate'));
    if (counted.length > 0) {
      const saved = savedInMonth(movements, month);
      return { month, cents: saved, count: counted.length, state: 'com_registros', valueText: formatBRL(saved) };
    }
    const active = input.goals.some((g) => goalActiveIn(g, movements, month, input.timeZone));
    return active ? { month, cents: 0, count: 0, state: 'zero_confirmado', valueText: formatBRL(0) } : noValue(month, 'sem_registros');
  });
}

/** Os meses fechados de uma janela (todos menos o atual), do mais antigo ao mais recente: o que a Renda comprometida e o Guardado em metas leem. */
export function phase3ClosedMonths(months: readonly IsoMonth[], currentMonth: IsoMonth): IsoMonth[] {
  return months.filter((m) => m < currentMonth);
}

/** Meses lidos por janela, no máximo: um `listCommitments` por mês fechado (11 numa janela de 12 meses; o limite do contrato é 12). */
export const PHASE3_MAX_MONTH_READS = 12;
