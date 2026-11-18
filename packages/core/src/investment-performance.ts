import type { IsoDate, IsoMonth } from './dates';
import { addDays, addMonths, addMonthsToDate, daysBetween, formatDateBR, formatMonthYearBR, monthOf, monthsBetween } from './dates';
import { rateSummaryWithStep, type InvestmentDetails } from './investment-details';
import { REAL_GAIN_TEXT, isMarketBusinessDay, marketBusinessDaysInMonth, realRate } from './investment-insights';
import type { InvestmentMovement, MarketIndices } from './investments';
import { BCB_SERIES, INVESTMENT_TEXT, investmentValueOn } from './investments';

/**
 * Desempenho dos investimentos (D-103, item 8 do estudo): tocar no card azul da aba abre a evolução da carteira e a comparação com o CDI,
 * o IPCA e a poupança em três períodos fixos (no mês, em 12 meses, desde o início), sempre como estimativa e numa cor só.
 *
 * Cuidado de método: os valores são digitados à mão, em datas diferentes para cada investimento. Por isso não há uma porcentagem única
 * da carteira. Cada investimento é comparado no próprio período, do primeiro ao último valor conhecido dentro do período escolhido, com
 * os índices desse mesmo intervalo, e a taxa registrada na ficha aparece ao lado como referência.
 *
 * P1. Valor conhecido: o do fim do dia do primeiro movimento e o de cada atualização de valor ("valor").
 * P2. Começo: em "Desde o início", o primeiro movimento; nos outros, o último valor conhecido até 10 dias antes do começo do período (a
 *     atualização do fim do mês anterior vale para "No mês") ou, sem ele, o primeiro valor conhecido dentro do período.
 * P3. Fim: a última atualização de valor até hoje. Sem atualização depois do começo, não há comparação (a tela diz o que falta).
 * P4. Rendimento no intervalo pelo Dietz modificado: (V1 − V0 − aportes + resgates + rendimentos recebidos) ÷ (V0 + Σ peso × fluxo), com o
 *     peso do fluxo do dia d igual aos dias corridos de d até o fim ÷ os dias do intervalo (o fluxo entra no fim do dia).
 * P5. Índice no intervalo: o acumulado de cada mês entra pela fração dos dias úteis do mercado que o intervalo cobre nele; mês sem índice
 *     publicado repete o último publicado (a tela diz desde quando). Falta de mês antes do último publicado: sem o índice.
 * P6. "% do CDI": o rendimento dividido pelo CDI do mesmo intervalo, só com rendimento de zero ou mais, CDI acima de zero e pelo menos
 *     5 dias úteis (intervalos curtos dão proporções sem significado).
 */

type MovementLike = Pick<InvestmentMovement, 'kind' | 'amountCents' | 'occurredOn'> & { createdAt?: string; id?: string };

export type PerformancePeriod = 'mes' | '12m' | 'inicio';
export const PERFORMANCE_PERIODS: readonly PerformancePeriod[] = ['mes', '12m', 'inicio'];
export const PERFORMANCE_PERIOD_LABEL: Readonly<Record<PerformancePeriod, string>> = { mes: 'No mês', '12m': 'Em 12 meses', inicio: 'Desde o início' };
/** Tolerância antes do começo do período para achar o valor inicial (P2). */
export const PERFORMANCE_ANCHOR_DAYS = 10;
/** Mínimo de dias úteis para dizer "% do CDI" (P6). */
export const PERFORMANCE_MIN_BUSINESS_DAYS = 5;

/** O primeiro dia do período (null em "Desde o início"). */
export function performancePeriodStart(period: PerformancePeriod, today: IsoDate): IsoDate | null {
  if (period === 'mes') return `${monthOf(today)}-01` as IsoDate;
  if (period === '12m') return addMonthsToDate(today, -12);
  return null;
}

export interface OwnWindow {
  from: IsoDate;
  to: IsoDate;
}

/** O período próprio de um investimento dentro do período escolhido (P1 a P3), ou null sem dois valores conhecidos. */
export function ownWindow(movements: readonly MovementLike[], period: PerformancePeriod, today: IsoDate): OwnWindow | null {
  const live = movements.filter((m) => m.occurredOn <= today);
  if (live.length === 0) return null;
  const first = live.reduce((a, m) => (m.occurredOn < a ? m.occurredOn : a), live[0]!.occurredOn);
  const values = live.filter((m) => m.kind === 'valor').map((m) => m.occurredOn);
  if (values.length === 0) return null;
  const known = [...new Set([first, ...values])].sort();
  const lastValue = values.reduce((a, d) => (d > a ? d : a), values[0]!);
  const start = performancePeriodStart(period, today);
  let from: IsoDate | undefined;
  if (start === null) from = first;
  else {
    const floor = addDays(start, -PERFORMANCE_ANCHOR_DAYS);
    from = known.filter((d) => d <= start && d >= floor).pop() ?? known.find((d) => d > start);
  }
  if (from === undefined || lastValue <= from) return null;
  return { from, to: lastValue };
}

/** Rendimento no intervalo pelo Dietz modificado (P4); null com base de zero ou menos. */
export function windowReturn(movements: readonly MovementLike[], w: OwnWindow): number | null {
  const len = daysBetween(w.from, w.to);
  if (len <= 0) return null;
  const live = movements.filter((m) => m.occurredOn <= w.to);
  const v0 = investmentValueOn(live, w.from);
  const v1 = investmentValueOn(live, w.to);
  let flows = 0;
  let weighted = 0;
  let income = 0;
  for (const m of live) {
    if (m.occurredOn <= w.from) continue;
    if (m.kind === 'rendimento') income += m.amountCents;
    else if (m.kind === 'aporte' || m.kind === 'resgate') {
      const f = m.kind === 'aporte' ? m.amountCents : -m.amountCents;
      flows += f;
      weighted += (daysBetween(m.occurredOn, w.to) / len) * f;
    }
  }
  const base = v0 + weighted;
  if (base <= 0) return null;
  const r = (v1 - v0 - flows + income) / base;
  return Number.isFinite(r) && r > -1 ? r : null;
}

/** Dias úteis do mercado em [from, to). */
export function marketBusinessDaysBetween(from: IsoDate, to: IsoDate): number {
  let n = 0;
  for (let d = from; d < to; d = addDays(d, 1)) if (isMarketBusinessDay(d)) n += 1;
  return n;
}

export interface IndexOverWindow {
  /** Fração (0,0365 = 3,65%). */
  value: number;
  /** Primeiro mês que repetiu o último índice publicado (null quando todos tinham índice). */
  projectedFrom: IsoMonth | null;
}

/** O índice acumulado no intervalo (P5), ou null sem série ou com falta de mês antes do último publicado. */
export function indexOverWindow(series: Readonly<Record<IsoMonth, number>> | null | undefined, w: OwnWindow): IndexOverWindow | null {
  if (!series) return null;
  const published = (Object.keys(series) as IsoMonth[]).sort();
  if (published.length === 0 || w.to <= w.from) return null;
  const lastPublished = published[published.length - 1]!;
  const lastMonth = monthOf(addDays(w.to, -1));
  let acc = 1;
  let projectedFrom: IsoMonth | null = null;
  for (let m = monthOf(w.from); monthsBetween(m, lastMonth) >= 0; m = addMonths(m, 1)) {
    const monthStart = `${m}-01` as IsoDate;
    const nextStart = `${addMonths(m, 1)}-01` as IsoDate;
    const a = w.from > monthStart ? w.from : monthStart;
    const b = w.to < nextStart ? w.to : nextStart;
    const n = Math.max(1, marketBusinessDaysInMonth(m));
    const k = a === monthStart && b === nextStart ? n : marketBusinessDaysBetween(a, b);
    if (k === 0) continue;
    let v = series[m];
    if (v === undefined) {
      if (monthsBetween(lastPublished, m) <= 0) return null;
      v = series[lastPublished]!;
      if (projectedFrom === null) projectedFrom = m;
    }
    acc *= (1 + v / 100) ** (k / n);
  }
  return { value: acc - 1, projectedFrom };
}

export interface InvestmentComparison {
  window: OwnWindow | null;
  /** Rendimento no período próprio (fração). */
  rate: number | null;
  cdi: IndexOverWindow | null;
  ipca: IndexOverWindow | null;
  poupanca: IndexOverWindow | null;
  /** Rendimento ÷ CDI (0,98 = 98% do CDI), pela regra P6. */
  ofCdi: number | null;
  /** (1 + rendimento) ÷ (1 + IPCA) − 1, no mesmo período. */
  real: number | null;
  /** O primeiro mês em que algum dos índices repetiu o último publicado. */
  projectedFrom: IsoMonth | null;
}

/** A comparação de um investimento no período escolhido. Sem índices (falha ou ainda carregando), só o rendimento. */
export function compareInvestment(movements: readonly MovementLike[], period: PerformancePeriod, indices: MarketIndices | null, today: IsoDate): InvestmentComparison {
  const window = ownWindow(movements, period, today);
  if (!window) return { window: null, rate: null, cdi: null, ipca: null, poupanca: null, ofCdi: null, real: null, projectedFrom: null };
  const rate = windowReturn(movements, window);
  const cdi = indices ? indexOverWindow(indices.cdi, window) : null;
  const ipca = indices ? indexOverWindow(indices.ipca, window) : null;
  const poupanca = indices ? indexOverWindow(indices.poupanca, window) : null;
  const enoughDays = marketBusinessDaysBetween(window.from, window.to) >= PERFORMANCE_MIN_BUSINESS_DAYS;
  const ofCdi = rate !== null && rate >= 0 && cdi !== null && cdi.value > 0 && enoughDays ? rate / cdi.value : null;
  const real = rate !== null && ipca !== null ? realRate(rate, ipca.value) : null;
  const projections = [cdi, ipca, poupanca].map((x) => x?.projectedFrom ?? null).filter((m): m is IsoMonth => m !== null).sort();
  return { window, rate, cdi, ipca, poupanca, ofCdi, real, projectedFrom: projections[0] ?? null };
}

/** O mês de onde a busca dos índices precisa partir para todos os períodos: o do primeiro movimento entre os investimentos. */
export function performanceIndicesFrom(groups: readonly (readonly MovementLike[])[], today: IsoDate): IsoMonth | null {
  let first: IsoDate | null = null;
  for (const g of groups) for (const m of g) if (m.occurredOn <= today && (first === null || m.occurredOn < first)) first = m.occurredOn;
  return first === null ? null : monthOf(first);
}

const pct = (fraction: number) => INVESTMENT_TEXT.percent(fraction);

/**
 * A linha da taxa da ficha em cada investimento do Desempenho, como referência: "variável" diz que não há taxa; com a taxa que muda numa
 * data (D-104, item 13), o mesmo texto da ficha (`rateSummaryWithStep`), com a taxa que vale hoje; sem taxa registrada, nada (null).
 */
export function performanceRateLine(inv: Pick<InvestmentDetails, 'indexKind' | 'rateBp' | 'rateUntil' | 'rateAfterBp'>, today: IsoDate): string | null {
  if (inv.indexKind === 'variavel') return PERFORMANCE_TEXT.variable;
  const summary = rateSummaryWithStep(inv, today);
  return summary ? PERFORMANCE_TEXT.contracted(summary) : null;
}

export const PERFORMANCE_TEXT = {
  title: 'Desempenho',
  intro: 'Quanto cada investimento rendeu no período, ao lado do CDI, do IPCA e da poupança no mesmo intervalo. É uma estimativa feita com os valores que você registra.',
  open: 'Ver desempenho',
  openHint: 'Abre a evolução e a comparação com CDI, IPCA e poupança',
  compareTitle: INVESTMENT_TEXT.compare,
  periodLabel: 'Período',
  estimate: 'Estimativa',
  estimateA11y: 'Estimativa: feita com os valores que você registra',
  /** "De 30/09/2026 a 06/10/2026, pelos valores que você registrou." */
  window: (w: OwnWindow) => `De ${formatDateBR(w.from)} a ${formatDateBR(w.to)}, pelos valores que você registrou.`,
  /** "Rendeu +0,15%, cerca de 89% do CDI." */
  rate: (rate: number | null, ofCdi: number | null) =>
    rate === null ? 'Sem como medir o rendimento neste intervalo.' : ofCdi === null ? `Rendeu ${pct(rate)}.` : `Rendeu ${pct(rate)}, cerca de ${Math.round(ofCdi * 100)}% do CDI.`,
  /** A taxa da ficha, como referência. */
  contracted: (summary: string) => `Taxa registrada na ficha: ${summary}.`,
  /** A ficha diz que rende de forma variável (sem taxa para servir de referência). */
  variable: 'Rende de forma variável, sem taxa combinada na ficha.',
  cdi: (v: IndexOverWindow | null) => (v === null ? 'CDI: sem dados para todo o intervalo' : `CDI no mesmo intervalo: ${pct(v.value)}`),
  ipca: (v: IndexOverWindow | null) => (v === null ? 'IPCA: sem dados para todo o intervalo' : `IPCA no mesmo intervalo: ${pct(v.value)}`),
  poupanca: (v: IndexOverWindow | null) => (v === null ? 'Poupança: sem dados para todo o intervalo' : `Poupança no mesmo intervalo: ${pct(v.value)}`),
  real: (r: number) => REAL_GAIN_TEXT.real(r),
  noWindow: (period: PerformancePeriod) =>
    period === 'mes'
      ? 'Ainda sem dois valores registrados para este mês. Para comparar, atualize o valor com o extrato.'
      : 'Ainda sem dois valores registrados neste período. Para comparar, atualize o valor com o extrato.',
  projected: (m: IsoMonth) => `Desde ${formatMonthYearBR(m)}, sem índice publicado, a conta repete o último mês publicado.`,
  indicesLoading: 'Buscando o CDI, o IPCA e a poupança',
  indicesError: 'Não foi possível buscar o CDI, o IPCA e a poupança agora. O rendimento de cada investimento continua aqui.',
  method:
    'Cada investimento é comparado no próprio período: do primeiro ao último valor registrado dentro do período escolhido. A Clarevo não junta tudo numa porcentagem só, porque os valores de cada um têm datas diferentes.',
  formulas: '% do CDI: o rendimento dividido pelo CDI do mesmo intervalo. Acima da inflação: (1 + rendimento) ÷ (1 + IPCA) − 1, no mesmo intervalo.',
  premise: 'O índice de um mês incompleto entra pela parte dos dias úteis que o intervalo cobre. A poupança é a de quem tem aniversário no dia 1.',
  source: (fetchedOn: IsoDate | null) =>
    `Fonte do CDI, do IPCA e da poupança: Banco Central do Brasil, séries ${BCB_SERIES.cdi}, ${BCB_SERIES.ipca} e ${BCB_SERIES.poupanca}${fetchedOn ? `, consulta em ${formatDateBR(fetchedOn)}` : ''}.`,
  example: INVESTMENT_TEXT.indicesExample,
  empty: 'Nenhum investimento ativo para comparar.',
} as const;
