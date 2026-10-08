import type { IsoDate, IsoMonth } from './dates';
import {
  addMonths,
  dateInMonth,
  formatDateBR,
  formatDayMonth,
  formatMonthName,
  formatMonthSpanBR,
  formatMonthYearBR,
  monthOf,
  monthsBetween,
} from './dates';
import type { Cents } from './money';
import { formatBRL, roundDiv } from './money';
import type {
  Commitment,
  CommitmentSeries,
  FinancialRecord,
  SeriesEditInput,
  SeriesInput,
  SeriesKind,
  SeriesNature,
  SeriesTerm,
} from './records';
import { ANNUAL_LEAD_MONTHS, PARTS_PER_YEAR_MAX } from './records';
import type { AffectedRef } from './repository';

/**
 * Gastos fixos, parcelamentos (D-024) e contas do ano (D-029). Regras puras, sem Date local, repetidas no banco
 * (clarevo_series_month, clarevo_series_due, clarevo_materialize_series, update_series_from, end_series,
 * inform_series_year, skip_series_year).
 *
 * - Mensal e parcelada: mêsDa(n) = primeiroMês + (n − primeiroNúmero) meses.
 * - Anual (k parcelas por ano, em meses seguidos, numeração contínua entre os anos):
 *   âncora = primeiroMês − (primeiroNúmero − 1) meses (mês da parcela 1 do primeiro ano);
 *   mêsDa(n) = âncora + 12·⌊(n − 1)/k⌋ + ((n − 1) mod k), com divisão para baixo e resto não negativo (n = 0 cai no
 *   último mês do ano anterior).
 * - Vencimento de n = dia da vigência de n no mês dele, limitado ao último dia; sempre a partir do dia escolhido,
 *   nunca do vencimento anterior (31/01 → 28/02 → 31/03).
 * - Só existem contas gravadas do mês anterior ao seguinte a hoje (conta do ano: o ano inteiro, quando a 1ª parcela
 *   dele vence até o fim do 2º mês depois do atual); o resto é previsão e não entra em totais.
 */

/** No máximo 100 séries ativas por contexto, somando gastos fixos, parcelamentos e contas do ano (limite_de_gastos_fixos). */
export const SERIES_LIMIT = 100;
/** Mensal com término: até 600 contas (último mês até primeiro mês + 599). */
export const SERIES_MAX_MONTHS = 600;
export const INSTALLMENTS_MIN = 2;
export const INSTALLMENTS_MAX = 480;
/** Conta do ano com término: até 50 anos (último número até 50·k). */
export const ANNUAL_MAX_YEARS = 50;

type SeriesShape = Pick<CommitmentSeries, 'kind' | 'firstDueMonth' | 'firstNumber' | 'partsPerYear'>;
type SeriesWithTerms = SeriesShape & Pick<CommitmentSeries, 'terms'>;
type SeriesRange = SeriesWithTerms & Pick<CommitmentSeries, 'lastNumber'>;
type SeriesForGeneration = SeriesRange & Pick<CommitmentSeries, 'id' | 'skippedNumbers' | 'generating'>;
type SeriesCounts = Partial<Pick<CommitmentSeries, 'paidCount' | 'openCount'>>;

/** Conta de uma série calculada (a criar agora ou prevista). */
export interface PlannedOccurrence {
  number: number;
  month: IsoMonth;
  dueOn: IsoDate;
  description: string;
  category: string | null;
  amountCents: Cents;
  amountIsEstimate: boolean;
}

/** Nomes curtos do tipo, para legendas ("Parcelamento · financiamento"). */
export const SERIES_NATURE_SHORT: Record<SeriesNature, string> = {
  conta: 'gasto fixo',
  financiamento: 'financiamento',
  compra_parcelada: 'compra parcelada',
  outro_parcelamento: 'outro parcelamento',
};

/** Rótulos dos chips "Tipo do parcelamento". */
export const SERIES_NATURE_LABEL: Record<SeriesNature, string> = {
  conta: 'Gasto fixo',
  financiamento: 'Financiamento ou empréstimo',
  compra_parcelada: 'Compra parcelada (boleto ou crediário)',
  outro_parcelamento: 'Outro (imposto, taxa, matrícula, consórcio)',
};

/** Nome da série no texto corrido, com artigo: "o gasto fixo", "o parcelamento", "a conta do ano". */
export const SERIES_KIND_NAME: Record<SeriesKind, string> = {
  mensal: 'o gasto fixo',
  parcelada: 'o parcelamento',
  anual: 'a conta do ano',
};

/** Tipo fora da lista (dado corrompido): nunca tratar como outro tipo. */
function unknownKind(kind: never): never {
  throw new Error(`serie_inconsistente: ${String(kind)}`);
}

const mod = (a: number, b: number) => ((a % b) + b) % b;

/** Parcelas por ano da conta do ano (S9: de 1 a 12). */
function partsOf(s: Pick<CommitmentSeries, 'partsPerYear'>): number {
  const k = s.partsPerYear;
  if (k === null || !Number.isSafeInteger(k) || k < 1 || k > PARTS_PER_YEAR_MAX) throw new Error('serie_inconsistente');
  return k;
}

/** Conta do ano: mês da parcela 1 do primeiro ano (âncora), mesmo quando ela foi paga antes do Clarevo. */
function anchorOf(s: Pick<CommitmentSeries, 'firstDueMonth' | 'firstNumber'>): IsoMonth {
  return addMonths(s.firstDueMonth, -(s.firstNumber - 1));
}

/** Conta do ano: ano a = ⌊d/12⌋ e posição p = d − 12a do mês, com d = meses(âncora, mês). */
function annualPosition(s: SeriesShape, month: IsoMonth): { k: number; a: number; p: number } {
  const k = partsOf(s);
  const d = monthsBetween(anchorOf(s), month);
  const a = Math.floor(d / 12);
  return { k, a, p: d - 12 * a };
}

export function seriesMonthOf(s: SeriesShape, n: number): IsoMonth {
  switch (s.kind) {
    case 'mensal':
    case 'parcelada':
      return addMonths(s.firstDueMonth, n - s.firstNumber);
    case 'anual': {
      const k = partsOf(s);
      return addMonths(anchorOf(s), 12 * Math.floor((n - 1) / k) + mod(n - 1, k));
    }
    default:
      return unknownKind(s.kind);
  }
}

/** Número da ocorrência do mês; null quando a conta do ano não tem parcela naquele mês. */
export function numberOfMonth(s: SeriesShape, month: IsoMonth): number | null {
  if (s.kind !== 'anual') return s.firstNumber + monthsBetween(s.firstDueMonth, month);
  const { k, a, p } = annualPosition(s, month);
  return p < k ? a * k + p + 1 : null;
}

/** Primeira ocorrência no mês ou depois dele. Mensal e parcelada: a do mês. */
export function numberAtOrAfter(s: SeriesShape, month: IsoMonth): number {
  if (s.kind !== 'anual') return s.firstNumber + monthsBetween(s.firstDueMonth, month);
  const { k, a, p } = annualPosition(s, month);
  return p < k ? a * k + p + 1 : (a + 1) * k + 1;
}

/** Última ocorrência no mês ou antes dele. Mensal e parcelada: a do mês. */
export function numberAtOrBefore(s: SeriesShape, month: IsoMonth): number {
  if (s.kind !== 'anual') return s.firstNumber + monthsBetween(s.firstDueMonth, month);
  const { k, a, p } = annualPosition(s, month);
  return p < k ? a * k + p + 1 : a * k + k;
}

/** Vigência de n: a viva com o maior fromNumber ≤ n. */
export function termFor(terms: readonly SeriesTerm[], n: number): SeriesTerm | null {
  let best: SeriesTerm | null = null;
  for (const t of terms) if (t.fromNumber <= n && (!best || t.fromNumber > best.fromNumber)) best = t;
  return best;
}

function requireTerm(s: Pick<CommitmentSeries, 'terms'>, n: number): SeriesTerm {
  const t = termFor(s.terms, n);
  if (!t) throw new Error('serie_inconsistente'); // S5: sempre existe vigência em firstNumber
  return t;
}

export function seriesDueOn(s: SeriesWithTerms, n: number): IsoDate {
  return dateInMonth(seriesMonthOf(s, n), requireTerm(s, n).dueDay);
}

/** Mês da última conta; null sem término. */
export function seriesEndMonth(s: SeriesShape & Pick<CommitmentSeries, 'lastNumber'>): IsoMonth | null {
  return s.lastNumber === null ? null : seriesMonthOf(s, s.lastNumber);
}

/** Encerrada: sem nenhuma conta ou com a última conta antes do mês atual. */
export function seriesEnded(s: SeriesShape & Pick<CommitmentSeries, 'lastNumber'>, today: IsoDate): boolean {
  if (s.lastNumber === null) return false;
  return s.lastNumber < s.firstNumber || seriesMonthOf(s, s.lastNumber) < monthOf(today);
}

/** Conta para o limite de 100: sem término ou com último mês a partir do mês anterior a hoje (como create_series). */
export function seriesCountsTowardLimit(s: SeriesShape & Pick<CommitmentSeries, 'lastNumber'>, today: IsoDate): boolean {
  return s.lastNumber === null || seriesMonthOf(s, s.lastNumber) >= generationWindow(today).floor;
}

/**
 * Número da última conta para o mês escolhido em "Encerrar" ou "Termina em…": a última no mês ou antes dele
 * (na conta do ano, um mês sem parcela dá a última parcela anterior a ele).
 */
export function lastNumberFromEndMonth(s: SeriesShape, month: IsoMonth): number {
  return numberAtOrBefore(s, month);
}

/**
 * Conta do ano: último número para "Termina em 2028" = k·(a + 1), com a = índice do ano cujo rótulo começa em 2028
 * (rótulo = ano da 1ª parcela do ano). Para "nenhuma conta", use firstNumber − 1.
 */
export function lastNumberFromEndYear(s: SeriesShape, year: number): number {
  const k = partsOf(s);
  return k * (year - Number(anchorOf(s).slice(0, 4)) + 1);
}

/**
 * Conta do ano: mês da última parcela do ano `year` (rótulo do ano), que vai em SeriesInput.lastMonth
 * ("Termina em…", campo "Último ano"). A IPTU de fevereiro a novembro que termina em 2029 dá "2029-11".
 */
export function annualLastMonth(input: Pick<SeriesInput, 'firstDueMonth' | 'firstNumber' | 'partsPerYear'>, year: number): IsoMonth {
  const k = partsOf(input);
  const anchor = anchorOf(input);
  return addMonths(anchor, 12 * (year - Number(anchor.slice(0, 4))) + k - 1);
}

/**
 * Janela de geração: do mês anterior ao seguinte a hoje (floor a top). Conta do ano: o ano inteiro entra quando a 1ª
 * parcela dele vence até o fim de annualTop (mês atual + 2), menos as parcelas antes de floor.
 */
export function generationWindow(today: IsoDate): { floor: IsoMonth; top: IsoMonth; annualTop: IsoMonth } {
  const m = monthOf(today);
  return { floor: addMonths(m, -1), top: addMonths(m, 1), annualTop: addMonths(m, ANNUAL_LEAD_MONTHS) };
}

function planned(s: SeriesWithTerms, n: number): PlannedOccurrence {
  const t = requireTerm(s, n);
  const month = seriesMonthOf(s, n);
  return {
    number: n,
    month,
    dueOn: dateInMonth(month, t.dueDay),
    description: t.description,
    category: t.category,
    amountCents: t.amountCents,
    amountIsEstimate: t.amountMode === 'variavel',
  };
}

/**
 * Primeiro número conhecido pela lista. listSeriesOccurrences traz só as 60 mais recentes: se a lista tem menos
 * ocorrências vivas do que a série conta, os números anteriores ao menor listado são desconhecidos, não ausentes.
 */
function knownFrom(s: Pick<CommitmentSeries, 'firstNumber'> & SeriesCounts, live: Map<number, Commitment>): number {
  const total = (s.paidCount ?? 0) + (s.openCount ?? 0);
  return live.size >= total ? s.firstNumber : Math.min(...live.keys());
}

/** Números das ocorrências vivas desta série na lista (o repositório não devolve excluídas). */
function liveByNumber(s: Pick<CommitmentSeries, 'id'>, list: readonly Commitment[]): Map<number, Commitment> {
  const out = new Map<number, Commitment>();
  for (const c of list) if (c.series && c.series.id === s.id) out.set(c.series.number, c);
  return out;
}

/**
 * Junta listas de ocorrências sem repetir conta (por id; fica a de maior versão), por número decrescente, como
 * listSeriesOccurrences. Uso: listSeriesOccurrences (as 60 mais recentes) + listOpenSeriesOccurrences (todas em aberto),
 * para affectedByEditFrom, affectedByEnd, affectedByDelete, affectedByYear e wholeYearPayment, que precisam de todas
 * as contas em aberto (o banco confere o conjunto inteiro). missingMonths continua com a lista cortada: knownFrom depende dela.
 */
export function mergeOccurrences(...lists: readonly (readonly Commitment[])[]): Commitment[] {
  const byId = new Map<string, Commitment>();
  for (const list of lists) {
    for (const c of list) {
      const seen = byId.get(c.id);
      if (!seen || c.version > seen.version) byId.set(c.id, c);
    }
  }
  return [...byId.values()].sort((a, b) => (b.series?.number ?? 0) - (a.series?.number ?? 0) || a.id.localeCompare(b.id));
}

/**
 * Contas que a geração cria hoje (mesma regra de clarevo_materialize_series), sem as que já existem vivas e sem as
 * excluídas só neste mês, dentro de [firstNumber, lastNumber]:
 * - mensal e parcelada: do mês anterior ao seguinte;
 * - anual: os dois anos mais recentes cuja 1ª parcela vence até o fim de annualTop (no máximo 2·k números).
 * Números com mês antes do piso (mês anterior a hoje) nunca são criados (ficam como "sem conta registrada").
 */
export function occurrencesToMaterialize(s: SeriesForGeneration, existing: readonly Commitment[], today: IsoDate): PlannedOccurrence[] {
  if (!s.generating) return [];
  const { floor, top, annualTop } = generationWindow(today);
  let from: number;
  let to: number;
  switch (s.kind) {
    case 'mensal':
    case 'parcelada':
      from = Math.max(s.firstNumber, s.firstNumber + monthsBetween(s.firstDueMonth, floor));
      to = s.firstNumber + monthsBetween(s.firstDueMonth, top);
      break;
    case 'anual': {
      const k = partsOf(s);
      const anchor = anchorOf(s);
      if (annualTop < anchor) return [];
      const yearTop = Math.floor(monthsBetween(anchor, annualTop) / 12); // último ano cuja 1ª parcela já entrou
      from = Math.max(s.firstNumber, (yearTop - 1) * k + 1);
      to = (yearTop + 1) * k;
      break;
    }
    default:
      return unknownKind(s.kind);
  }
  if (s.lastNumber !== null) to = Math.min(to, s.lastNumber);
  const live = liveByNumber(s, existing);
  const skipped = new Set(s.skippedNumbers);
  const out: PlannedOccurrence[] = [];
  for (let n = from; n <= to; n++) {
    if (seriesMonthOf(s, n) < floor) continue; // antes do piso: "sem conta registrada"
    if (!live.has(n) && !skipped.has(n)) out.push(planned(s, n));
  }
  return out;
}

/**
 * Contas previstas entre dois meses, só além da maior ocorrência viva, sem números pulados nem depois do término.
 * São previsão: nunca entram em "Ainda a pagar".
 */
export function projectSeries(
  s: SeriesRange & Pick<CommitmentSeries, 'id' | 'skippedNumbers'>,
  existing: readonly Commitment[],
  fromMonth: IsoMonth,
  toMonth: IsoMonth,
): PlannedOccurrence[] {
  const live = liveByNumber(s, existing);
  const maxLive = Math.max(s.firstNumber - 1, ...live.keys());
  const from = Math.max(s.firstNumber, numberAtOrAfter(s, fromMonth), maxLive + 1);
  const toN = numberAtOrBefore(s, toMonth);
  const to = s.lastNumber === null ? toN : Math.min(toN, s.lastNumber);
  const skipped = new Set(s.skippedNumbers);
  const out: PlannedOccurrence[] = [];
  for (let n = from; n <= to; n++) if (!skipped.has(n)) out.push(planned(s, n));
  return out;
}

/** "2027" ou, quando o ano da conta passa da virada, "2026/2027". */
function yearLabel(firstMonth: IsoMonth, lastMonth: IsoMonth): string {
  const a = firstMonth.slice(0, 4);
  const b = lastMonth.slice(0, 4);
  return a === b ? a : `${a}/${b}`;
}

/** Um ano de uma conta do ano. */
export interface AnnualYear {
  /** Índice do ano na série: 0 = ano da parcela 1 (âncora). */
  index: number;
  /** Posição do número pedido no ano, de 1 a k. */
  part: number;
  /** Números da 1ª e da última parcela do ano (as anteriores a firstNumber foram pagas antes do Clarevo). */
  firstNumber: number;
  lastNumber: number;
  firstMonth: IsoMonth;
  lastMonth: IsoMonth;
  /** Rótulo do ano: ano do mês da 1ª parcela, ou "2026/2027" quando a última cai no ano seguinte. */
  label: string;
}

/** Ano da parcela n: a = ⌊(n − 1)/k⌋, posição (n − 1) mod k + 1. */
export function annualYearOf(s: SeriesShape, n: number): AnnualYear {
  const k = partsOf(s);
  const index = Math.floor((n - 1) / k);
  const firstNumber = index * k + 1;
  const lastNumber = index * k + k;
  const firstMonth = seriesMonthOf(s, firstNumber);
  const lastMonth = seriesMonthOf(s, lastNumber);
  return { index, part: mod(n - 1, k) + 1, firstNumber, lastNumber, firstMonth, lastMonth, label: yearLabel(firstMonth, lastMonth) };
}

/** Rótulo do ano de índice a: "2027" ou "2026/2027". */
export function annualYearLabel(s: SeriesShape, a: number): string {
  return annualYearOf(s, a * partsOf(s) + 1).label;
}

/** Rótulo do ano de uma conta de série anual, pelo vencimento e pelo número (o mês é estrutural, S8); null nas outras. */
export function annualYearLabelOf(c: Pick<Commitment, 'series' | 'dueOn'>): string | null {
  if (!c.series || c.series.kind !== 'anual') return null;
  const k = c.series.partsPerYear ?? 1;
  const first = addMonths(monthOf(c.dueOn), -mod(c.series.number - 1, k));
  return yearLabel(first, addMonths(first, k - 1));
}

/** Posição da conta no ano dela (1 a k); null fora da conta do ano. */
function partOf(c: Pick<Commitment, 'series'>): number | null {
  if (!c.series || c.series.kind !== 'anual') return null;
  return mod(c.series.number - 1, c.series.partsPerYear ?? 1) + 1;
}

/**
 * "Parcela 13 de 48", "Todo mês", "Conta do ano de 2027" ou "Parcela 3 de 10 de 2027"; null em conta avulsa.
 * Na conta do ano, o ano vem do vencimento (sem ele, só "Conta do ano" ou "Parcela 3 de 10").
 */
export function occurrenceLabel(c: Pick<Commitment, 'series'> & { dueOn?: IsoDate }): string | null {
  if (!c.series) return null;
  switch (c.series.kind) {
    case 'parcelada':
      return `Parcela ${c.series.number} de ${c.series.installmentTotal}`;
    case 'mensal':
      return 'Todo mês';
    case 'anual': {
      const k = c.series.partsPerYear ?? 1;
      const label = c.dueOn ? annualYearLabelOf({ series: c.series, dueOn: c.dueOn }) : null;
      const year = label ? ` de ${label}` : '';
      return k === 1 ? `Conta do ano${year}` : `Parcela ${partOf(c)} de ${k}${year}`;
    }
    default:
      return unknownKind(c.series.kind);
  }
}

/**
 * Número "atual": o do mês de hoje ou, na conta do ano, a próxima parcela a partir dele; limitado ao período da série.
 * Sem hoje, o da última conta (ou a vigência mais recente, sem término).
 */
function currentNumber(s: SeriesRange, today?: IsoDate): number {
  if (today === undefined) {
    if (s.lastNumber !== null) return Math.max(s.firstNumber, s.lastNumber);
    return Math.max(s.firstNumber, ...s.terms.map((t) => t.fromNumber));
  }
  let n = Math.max(s.firstNumber, numberAtOrAfter(s, monthOf(today)));
  if (s.lastNumber !== null) n = Math.max(s.firstNumber, Math.min(n, s.lastNumber));
  return n;
}

/**
 * Vigência do mês atual (conta do ano: a da próxima parcela a partir deste mês), limitada ao período da série;
 * sem hoje, a da última conta (ou a mais recente, sem término).
 */
export function currentTerm(s: SeriesRange, today?: IsoDate): SeriesTerm {
  if (today === undefined) return requireTerm(s, s.lastNumber === null ? Number.MAX_SAFE_INTEGER : Math.max(s.firstNumber, s.lastNumber));
  return requireTerm(s, currentNumber(s, today));
}

/**
 * "Todo mês, dia 5 · desde outubro de 2026", "Parcelamento · financiamento · parcelas 13 a 48",
 * "Todo ano em 20/01 · desde 2027" ou "Todo ano, 10 parcelas de fevereiro a novembro, dia 10 · desde 2027".
 */
export function seriesCaption(s: SeriesRange & Pick<CommitmentSeries, 'nature'>, today?: IsoDate): string {
  switch (s.kind) {
    case 'parcelada': {
      const head = `Parcelamento · ${SERIES_NATURE_SHORT[s.nature]}`;
      const last = s.lastNumber ?? s.firstNumber;
      return last < s.firstNumber ? `${head} · encerrado antes da parcela ${s.firstNumber}` : `${head} · parcelas ${s.firstNumber} a ${last}`;
    }
    case 'mensal': {
      const head = `Todo mês, dia ${currentTerm(s, today).dueDay}`;
      if (s.lastNumber === null) return `${head} · desde ${formatMonthYearBR(s.firstDueMonth)}`;
      if (s.lastNumber < s.firstNumber) return `${head} · encerrado antes da primeira conta`;
      return `${head} · ${formatMonthSpanBR(s.firstDueMonth, seriesMonthOf(s, s.lastNumber))}`;
    }
    case 'anual': {
      const k = partsOf(s);
      const n = currentNumber(s, today);
      const year = annualYearOf(s, n);
      const head =
        k === 1
          ? `Todo ano em ${formatDayMonth(seriesDueOn(s, n))}`
          : `Todo ano, ${k} parcelas de ${formatMonthName(year.firstMonth)} a ${formatMonthName(year.lastMonth)}, dia ${requireTerm(s, n).dueDay}`;
      const first = annualYearOf(s, s.firstNumber).label;
      if (s.lastNumber === null) return `${head} · desde ${first}`;
      if (s.lastNumber < s.firstNumber) return `${head} · encerrada antes da primeira conta`;
      const last = annualYearOf(s, s.lastNumber).label;
      return `${head} · ${first === last ? `em ${first}` : `de ${first} a ${last}`}`;
    }
    default:
      return unknownKind(s.kind);
  }
}

/** Conta do ano: período de fromN a toN em anos ("a partir de 2027", "de 2027 a 2028", "nas parcelas 3 a 10 de 2027"). */
function annualSpan(s: SeriesRange, fromN: number, toN: number | null): string {
  const k = partsOf(s);
  const from = annualYearOf(s, fromN);
  const fromWhole = from.part === 1 || fromN === s.firstNumber;
  if (toN === null) return fromWhole ? `a partir de ${from.label}` : `a partir da parcela ${from.part} de ${from.label}`;
  const to = annualYearOf(s, toN);
  const toWhole = to.part === k;
  if (from.index === to.index) {
    if (fromWhole && toWhole) return `em ${from.label}`;
    return from.part === to.part ? `na parcela ${from.part} de ${from.label}` : `nas parcelas ${from.part} a ${to.part} de ${from.label}`;
  }
  const a = fromWhole ? `de ${from.label}` : `da parcela ${from.part} de ${from.label}`;
  const b = toWhole ? `a ${to.label}` : `à parcela ${to.part} de ${to.label}`;
  return `${a} ${b}`;
}

/**
 * Histórico de valores (vigências vivas): "R$ 2.500,00 de outubro a dezembro de 2026" · "R$ 2.650,00 a partir de
 * janeiro de 2027". Conta do ano, em anos: "R$ 180,00 por parcela (estimado) a partir de 2027".
 */
export function termHistory(s: SeriesRange): { term: SeriesTerm; fromMonth: IsoMonth; toMonth: IsoMonth | null; text: string }[] {
  const terms = [...s.terms].sort((a, b) => a.fromNumber - b.fromNumber);
  const annual = s.kind === 'anual';
  const perPart = annual && partsOf(s) > 1 ? ' por parcela' : '';
  return terms
    .map((term, i) => {
      const next = terms[i + 1];
      const untilNext = next ? next.fromNumber - 1 : null;
      const lastN = untilNext === null ? s.lastNumber : s.lastNumber === null ? untilNext : Math.min(untilNext, s.lastNumber);
      const fromMonth = seriesMonthOf(s, term.fromNumber);
      const toMonth = lastN === null ? null : seriesMonthOf(s, lastN);
      const amount = `${formatBRL(term.amountCents)}${perPart}${term.amountMode === 'variavel' ? ' (estimado)' : ''}`;
      const when = annual
        ? annualSpan(s, term.fromNumber, lastN)
        : toMonth === null
          ? `a partir de ${formatMonthYearBR(fromMonth)}`
          : formatMonthSpanBR(fromMonth, toMonth);
      return { term, fromMonth, toMonth, lastN, text: `${amount} ${when}` };
    })
    .filter((h) => h.lastN === null || h.lastN >= h.term.fromNumber)
    .map(({ lastN: _lastN, ...h }) => h);
}

export interface InstallmentProgress {
  /** Total de parcelas do cadastro (null em gasto fixo). */
  total: number | null;
  /** Pagas antes do Clarevo (informado por você): firstNumber − 1. */
  paidBefore: number;
  /** Ocorrências vivas pagas. */
  paidInApp: number;
  /** "Faltam X parcelas": sem conta paga, sem exclusão "só esta" e sem "sem conta registrada". null sem término. */
  remaining: number | null;
  /** Vencimento da última conta. */
  lastDueOn: IsoDate | null;
  /** Previsto das criadas em aberto + vigência das ainda não criadas. Nunca é saldo devedor. */
  remainingCents: Cents | null;
  /** Algum valor da soma é estimado ("cerca de"). */
  approximate: boolean;
}

/**
 * "Faltam X parcelas" e a soma do que falta.
 * - occurrences: listSeriesOccurrences (as 60 mais recentes, abertas e pagas);
 * - open: listOpenSeriesOccurrences (todas as em aberto, sem limite). Sem ela, uma parcela antiga em aberto fora das
 *   60 mais recentes sumiria da conta.
 * Número fora das duas listas: até o mês atual, não falta (paga fora da lista cortada, excluída só esta ou sem conta
 * registrada); depois do mês atual, ainda não criado, entra com a vigência dele. Antes do primeiro número conhecido pela
 * lista cortada nada é deduzido como ausente: todas as em aberto já vêm em open.
 */
export function installmentProgress(
  s: SeriesRange & Pick<CommitmentSeries, 'id' | 'skippedNumbers' | 'installmentTotal'> & SeriesCounts,
  occurrences: readonly Commitment[],
  open: readonly Commitment[],
  today: IsoDate,
): InstallmentProgress {
  const listed = liveByNumber(s, occurrences);
  const live = liveByNumber(s, mergeOccurrences(occurrences, open));
  let paidInList = 0;
  for (const c of live.values()) if (c.status === 'quitado') paidInList += 1;
  // A contagem da série vale mesmo quando a lista de ocorrências vem cortada.
  const paidInApp = Math.max(paidInList, s.paidCount ?? 0);
  const base = { total: s.installmentTotal, paidBefore: s.firstNumber - 1, paidInApp };
  if (s.lastNumber === null) return { ...base, remaining: null, lastDueOn: null, remainingCents: null, approximate: false };
  const skipped = new Set(s.skippedNumbers);
  const current = numberAtOrBefore(s, monthOf(today));
  // Sem nenhuma conta na lista cortada, nada é conhecido antes: vale o primeiro número.
  const known = listed.size === 0 ? s.firstNumber : knownFrom(s, listed);
  let remaining = 0;
  let remainingCents = 0;
  let approximate = false;
  for (let n = s.firstNumber; n <= s.lastNumber; n++) {
    const c = live.get(n);
    if (c) {
      if (c.status === 'quitado') continue;
      remaining += 1;
      remainingCents += c.amountCents;
      approximate ||= c.amountIsEstimate;
    } else if (!skipped.has(n) && n > current && n >= known) {
      const t = requireTerm(s, n);
      remaining += 1;
      remainingCents += t.amountCents;
      approximate ||= t.amountMode === 'variavel';
    }
  }
  const lastDueOn = s.lastNumber >= s.firstNumber ? seriesDueOn(s, s.lastNumber) : null;
  return { ...base, remaining, lastDueOn, remainingCents, approximate };
}

/** Números até o mês atual sem ocorrência viva e não pulados: "Janeiro de 2027: sem conta registrada". */
export function missingMonths(
  s: SeriesShape & Pick<CommitmentSeries, 'id' | 'lastNumber' | 'skippedNumbers'> & SeriesCounts,
  occurrences: readonly Commitment[],
  today: IsoDate,
): { number: number; month: IsoMonth }[] {
  const live = liveByNumber(s, occurrences);
  const skipped = new Set(s.skippedNumbers);
  const current = numberAtOrBefore(s, monthOf(today));
  const to = s.lastNumber === null ? current : Math.min(current, s.lastNumber);
  const out: { number: number; month: IsoMonth }[] = [];
  for (let n = knownFrom(s, live); n <= to; n++) if (!live.has(n) && !skipped.has(n)) out.push({ number: n, month: seriesMonthOf(s, n) });
  return out;
}

const refs = (xs: readonly Commitment[]): AffectedRef[] => xs.map((c) => ({ id: c.id, version: c.version }));
const byNumber = (a: Commitment, b: Commitment) => (a.series?.number ?? 0) - (b.series?.number ?? 0);
const contas = (n: number) => (n === 1 ? '1 conta' : `${n} contas`);
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const money = (cents: Cents, approximate: boolean) => (approximate ? `cerca de ${formatBRL(cents)}` : formatBRL(cents));

/** "a", "a e b", "a, b e c". */
function joinList(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} e ${items[items.length - 1]}`;
}

/** Posições em faixas: [1, 2, 3, 5] → "1 a 3 e 5"; [1, 2] → "1 e 2". */
function partsText(parts: readonly number[]): string {
  const items: string[] = [];
  let i = 0;
  while (i < parts.length) {
    let j = i;
    while (j + 1 < parts.length && parts[j + 1] === parts[j]! + 1) j++;
    if (j - i >= 2) items.push(`${parts[i]} a ${parts[j]}`);
    else for (let x = i; x <= j; x++) items.push(String(parts[x]));
    i = j + 1;
  }
  return joinList(items);
}

const monthOfDue = (c: Commitment) => formatMonthName(monthOf(c.dueOn));

/** Nome curto da conta no texto: "novembro" (mês), "2028" (cota única) ou "parcela 3 de 2027". */
function occurrenceName(c: Commitment): string {
  const label = annualYearLabelOf(c);
  if (label === null) return monthOfDue(c);
  return (c.series!.partsPerYear ?? 1) === 1 ? label : `parcela ${partOf(c)} de ${label}`;
}

export type EditFromPlan =
  | { ok: false; code: 'inicio_em_conta_paga' }
  | {
      ok: true;
      /** Conjunto que vai em expectedAffected. */
      affected: AffectedRef[];
      /** A conta escolhida (sempre) e as seguintes em aberto não alteradas só no mês. */
      changing: Commitment[];
      /** Pagas, outras alteradas só no mês e anteriores em aberto. */
      unchanged: { commitment: Commitment; reason: 'paga' | 'alterada' | 'anterior' }[];
      /** A conta escolhida, se já existir. */
      chosen: Commitment | null;
      /** Texto do diálogo "Aplicar a partir de novembro?". */
      text: string;
    };

/**
 * "Esta e as próximas" a partir do número k (mesma seleção de update_series_from):
 * muda a conta k em aberto, sempre (mesmo alterada só no mês), e as seguintes em aberto não alteradas.
 * Na conta do ano, alterada inclui a conta com o valor do ano informado.
 */
export function affectedByEditFrom(list: readonly Commitment[], s: Pick<CommitmentSeries, 'id'>, k: number): EditFromPlan {
  const live = [...liveByNumber(s, list).values()].sort(byNumber);
  const chosen = live.find((c) => c.series!.number === k) ?? null;
  if (chosen?.status === 'quitado') return { ok: false, code: 'inicio_em_conta_paga' };
  const changing = live.filter((c) => c.status === 'aberto' && (c.series!.number === k || (c.series!.number > k && !c.seriesOverride)));
  const unchanged = live
    .filter((c) => !changing.includes(c) && (c.series!.number >= k - 1 || c.status === 'aberto'))
    .map((commitment) => ({
      commitment,
      reason: commitment.status === 'quitado' ? ('paga' as const) : commitment.series!.number > k ? ('alterada' as const) : ('anterior' as const),
    }));
  const annual = live[0]?.series?.kind === 'anual';
  const single = annual && (live[0]!.series!.partsPerYear ?? 1) === 1;
  const reasonText = !annual
    ? { paga: 'paga', alterada: 'alterada só para aquele mês', anterior: 'antes do mês escolhido' }
    : single
      ? { paga: 'paga', alterada: 'valor informado ou alterado só naquele ano', anterior: 'antes do ano escolhido' }
      : { paga: 'paga', alterada: 'valor informado ou alterado à parte', anterior: 'antes da parcela escolhida' };
  let chosenText: string | null = null;
  if (chosen?.seriesOverride) {
    const amount = formatBRL(chosen.amountCents);
    chosenText = !annual
      ? `A conta de ${monthOfDue(chosen)} tinha sido alterada só para aquele mês (${amount}) e passa a seguir o novo valor.`
      : single
        ? `A conta de ${annualYearLabelOf(chosen)} tinha o valor informado ou alterado só naquele ano (${amount}) e passa a seguir o novo valor.`
        : `A ${occurrenceName(chosen)} tinha o valor informado ou alterado à parte (${amount}) e passa a seguir o novo valor.`;
  }
  const parts = [
    changing.length ? `Vão mudar: ${joinList(changing.map((c) => `${occurrenceName(c)} (${formatDayMonth(c.dueOn)})`))}.` : null,
    unchanged.length ? `Não mudam: ${joinList(unchanged.map((u) => `${occurrenceName(u.commitment)} (${reasonText[u.reason]})`))}.` : null,
    'As contas criadas depois já seguem o novo valor.',
    chosenText,
  ];
  return { ok: true, affected: refs(changing), changing, unchanged, chosen, text: parts.filter(Boolean).join(' ') };
}

export type RemovalPlan<Code extends string> =
  | { ok: false; code: Code }
  | {
      ok: true;
      affected: AffectedRef[];
      /** Contas em aberto que saem da lista. */
      removed: Commitment[];
      /** "1 conta em aberto depois de outubro vai sair da lista. As contas pagas continuam no histórico." */
      text: string | null;
    };

/** Encerrar com a última conta `last` (null = sem data para terminar): saem as em aberto com número maior. */
export function affectedByEnd(
  list: readonly Commitment[],
  s: SeriesShape & Pick<CommitmentSeries, 'id'>,
  last: number | null,
): RemovalPlan<'serie_tem_pagamento_posterior'> {
  const after = [...liveByNumber(s, list).values()].filter((c) => last !== null && c.series!.number > last).sort(byNumber);
  if (after.some((c) => c.status === 'quitado')) return { ok: false, code: 'serie_tem_pagamento_posterior' };
  const n = after.length;
  let text: string | null = null;
  if (n > 0 && last !== null) {
    const verb = n === 1 ? 'vai' : 'vão';
    let where = '';
    if (last >= s.firstNumber) {
      if (s.kind === 'anual') {
        const y = annualYearOf(s, last);
        where = y.part === partsOf(s) ? ` depois de ${y.label}` : ` depois da parcela ${y.part} de ${y.label}`;
      } else {
        where = ` depois de ${formatMonthName(seriesMonthOf(s, last))}`;
      }
    }
    text = `${contas(n)} em aberto${where} ${verb} sair da lista. As contas pagas continuam no histórico.`;
  }
  return { ok: true, affected: refs(after), removed: after, text };
}

/** Excluir o gasto fixo: só sem conta paga; saem todas as em aberto. */
export function affectedByDelete(list: readonly Commitment[], s: Pick<CommitmentSeries, 'id'>): RemovalPlan<'serie_tem_pagamentos'> {
  const live = [...liveByNumber(s, list).values()].sort(byNumber);
  if (live.some((c) => c.status === 'quitado')) return { ok: false, code: 'serie_tem_pagamentos' };
  const n = live.length;
  return { ok: true, affected: refs(live), removed: live, text: n ? `${contas(n)} em aberto ${n === 1 ? 'vai' : 'vão'} sair da lista.` : null };
}

/**
 * Sugestão de nova referência (nunca aplicada sozinha): média, com metade para cima, dos valores pagos
 * das até 3 ocorrências pagas de maior número. 165,30 + 180,00 + 171,90 → R$ 172,40. Para contas do ano,
 * use suggestedAnnualReference.
 */
export function suggestedReference(paidOccurrences: readonly Commitment[]): { amountCents: Cents; count: number } | null {
  const paid = paidOccurrences
    .filter((c) => c.status === 'quitado' && c.payment !== null && c.series !== null)
    .sort((a, b) => b.series!.number - a.series!.number)
    .slice(0, 3);
  if (paid.length === 0) return null;
  const total = paid.reduce((acc, c) => acc + c.payment!.amountCents, 0);
  return { amountCents: roundDiv(total, paid.length), count: paid.length };
}

/** Por mês, se os valores não mudarem: soma das vigências atuais dos gastos fixos e parcelamentos não encerrados. Contas do ano ficam fora. */
export function seriesMonthlyTotal(list: readonly SeriesRange[], today: IsoDate): { totalCents: Cents; estimatedCents: Cents } {
  let totalCents = 0;
  let estimatedCents = 0;
  for (const s of list) {
    if (s.kind === 'anual' || seriesEnded(s, today)) continue;
    const t = currentTerm(s, today);
    totalCents += t.amountCents;
    if (t.amountMode === 'variavel') estimatedCents += t.amountCents;
  }
  return { totalCents, estimatedCents };
}

/**
 * Por ano, se os valores não mudarem: Σ k × vigência atual (a da próxima parcela a partir deste mês) das contas do ano
 * não encerradas. "Por ano, se os valores não mudarem: R$ 4.200,00 (inclui R$ 4.200,00 estimados)."
 */
export function seriesYearlyTotal(list: readonly SeriesRange[], today: IsoDate): { totalCents: Cents; estimatedCents: Cents } {
  let totalCents = 0;
  let estimatedCents = 0;
  for (const s of list) {
    if (s.kind !== 'anual' || seriesEnded(s, today)) continue;
    const t = currentTerm(s, today);
    const year = partsOf(s) * t.amountCents;
    totalCents += year;
    if (t.amountMode === 'variavel') estimatedCents += year;
  }
  return { totalCents, estimatedCents };
}

/** Série virtual de um cadastro ainda não salvo (mesmos números de create_series). */
function seriesFromInput(input: SeriesInput): SeriesForGeneration {
  let firstNumber: number;
  let lastNumber: number | null;
  const partsPerYear = input.kind === 'anual' ? input.partsPerYear : null;
  switch (input.kind) {
    case 'mensal':
      firstNumber = 1;
      lastNumber = input.lastMonth === null ? null : 1 + monthsBetween(input.firstDueMonth, input.lastMonth);
      break;
    case 'parcelada':
      firstNumber = input.firstNumber;
      lastNumber = input.installmentTotal;
      break;
    case 'anual': {
      firstNumber = input.firstNumber;
      const k = partsOf(input);
      lastNumber =
        input.lastMonth === null ? null : (Math.floor(monthsBetween(anchorOf(input), input.lastMonth) / 12) + 1) * k;
      break;
    }
    default:
      return unknownKind(input.kind);
  }
  const term: SeriesTerm = {
    fromNumber: firstNumber,
    description: input.description,
    category: input.category,
    amountCents: input.amountCents,
    amountMode: input.amountMode,
    dueDay: input.dueDay,
  };
  return {
    id: '',
    kind: input.kind,
    firstDueMonth: input.firstDueMonth,
    firstNumber,
    lastNumber,
    partsPerYear,
    terms: [term],
    skippedNumbers: [],
    generating: true,
  };
}

export interface SeriesPreview {
  input: SeriesInput;
  firstNumber: number;
  lastNumber: number | null;
  firstMonth: IsoMonth;
  lastMonth: IsoMonth | null;
  /** Até 3 primeiros vencimentos. */
  next: PlannedOccurrence[];
  /** Contas que já entram em Contas a pagar ao salvar. */
  createdNow: PlannedOccurrence[];
  /** A primeira conta já venceu. */
  firstOverdue: boolean;
  /** Total de contas, quando há término. */
  count: number | null;
  /** Soma das contas, quando há término (no parcelamento: "Soma das 36 parcelas"). */
  totalCents: Cents | null;
  lastDueOn: IsoDate | null;
  /** Uma linha por vencimento de next: "15/10/2026 · cerca de R$ 180,00 (estimado)". */
  lines: string[];
  /** Texto "Como vai ficar". */
  text: string;
  /**
   * Só conta do ano: faixa depois de salvar ("Conta do ano salva. A conta de 2027 entra em Contas a pagar em novembro
   * de 2026." ou "Conta do ano salva. A conta de 2026 já está em Contas a pagar."). null nas outras.
   */
  savedText: string | null;
}

/** Textos da prévia da conta do ano (seção 1.7). */
function annualPreviewTexts(
  input: SeriesInput,
  s: SeriesForGeneration,
  next: readonly PlannedOccurrence[],
  createdNow: readonly PlannedOccurrence[],
  today: IsoDate,
): { text: string; savedText: string } {
  const k = partsOf(s);
  const variable = input.amountMode === 'variavel';
  const first = annualYearOf(s, s.firstNumber);
  const amount = variable ? `cerca de ${formatBRL(input.amountCents)} (estimado)` : formatBRL(input.amountCents);
  const what = k === 1 ? amount : `${k} parcelas de ${amount}`;
  const when =
    k === 1
      ? `todo ano em ${formatDayMonth(next[0]!.dueOn)}`
      : `todo dia ${input.dueDay}, de ${formatMonthName(first.firstMonth)} a ${formatMonthName(first.lastMonth)}`;
  const lastLabel = s.lastNumber === null ? null : annualYearOf(s, s.lastNumber).label;
  const span = lastLabel === null ? `a partir de ${first.label}` : lastLabel === first.label ? `em ${first.label}` : `de ${first.label} a ${lastLabel}`;
  const perYear = k > 1 ? ` ${variable ? `Cerca de ${formatBRL(k * input.amountCents)}` : formatBRL(k * input.amountCents)} por ano.` : '';
  // Parcelas do primeiro ano dentro do período da série.
  const firstYearLast = s.lastNumber === null ? first.lastNumber : Math.min(first.lastNumber, s.lastNumber);
  const inFirstYear = firstYearLast - s.firstNumber + 1;
  let entry: string;
  let saved: string;
  if (createdNow.length === 0) {
    const enters = formatMonthYearBR(addMonths(first.firstMonth, -ANNUAL_LEAD_MONTHS));
    if (k === 1) {
      entry = `A conta de ${first.label} entra em Contas a pagar em ${enters}, dois meses antes de vencer, e só entra em Ainda a pagar em ${formatMonthName(first.firstMonth)}.`;
      saved = `A conta de ${first.label} entra em Contas a pagar em ${enters}.`;
    } else if (inFirstYear === 1) {
      const part = first.part;
      entry = `A parcela ${part} de ${first.label} entra em Contas a pagar em ${enters} e só entra em Ainda a pagar no mês em que vence.`;
      saved = `A parcela ${part} de ${first.label} entra em Contas a pagar em ${enters}.`;
    } else {
      entry = `As ${inFirstYear} parcelas de ${first.label} entram em Contas a pagar em ${enters}; cada uma só entra em Ainda a pagar no mês em que vence.`;
      saved = `As ${inFirstYear} parcelas de ${first.label} entram em Contas a pagar em ${enters}.`;
    }
  } else {
    const labels = [...new Set(createdNow.map((o) => annualYearOf(s, o.number).label))];
    if (k === 1) {
      const later = createdNow[0]!.month > monthOf(today);
      entry = `A conta de ${labels[0]} já entra em Contas a pagar${later ? ', em Próximos meses' : ' e em Ainda a pagar'}.`;
      saved = `A conta de ${labels[0]} já está em Contas a pagar.`;
    } else if (labels.length > 1) {
      entry = `As parcelas de ${joinList(labels)} já entram em Contas a pagar; cada uma só entra em Ainda a pagar no mês em que vence.`;
      saved = `As parcelas de ${joinList(labels)} já estão em Contas a pagar.`;
    } else if (createdNow.length === 1) {
      const part = annualYearOf(s, createdNow[0]!.number).part;
      entry = `A parcela ${part} de ${labels[0]} já entra em Contas a pagar e só entra em Ainda a pagar no mês em que vence.`;
      saved = `A parcela ${part} de ${labels[0]} já está em Contas a pagar.`;
    } else {
      entry = `As ${createdNow.length} parcelas de ${labels[0]} já entram em Contas a pagar; cada uma só entra em Ainda a pagar no mês em que vence.`;
      saved = `As ${createdNow.length} parcelas de ${labels[0]} já estão em Contas a pagar.`;
    }
  }
  return { text: `${input.description} · ${what} · ${when} · ${span}.${perYear} ${entry}`, savedText: `Conta do ano salva. ${saved}` };
}

/** Prévia do formulário de série. O cadastro precisa estar validado (validateSeriesDraft). */
export function seriesPreview(input: SeriesInput, today: IsoDate): SeriesPreview {
  const s = seriesFromInput(input);
  const variable = input.amountMode === 'variavel';
  const fmt = (cents: Cents) => (variable ? `cerca de ${formatBRL(cents)}` : formatBRL(cents));
  const lastN = s.lastNumber;
  const count = lastN === null ? null : lastN - s.firstNumber + 1;
  const nextTo = lastN === null ? s.firstNumber + 2 : Math.min(lastN, s.firstNumber + 2);
  const next: PlannedOccurrence[] = [];
  for (let n = s.firstNumber; n <= nextTo; n++) next.push(planned(s, n));
  const createdNow = occurrencesToMaterialize(s, [], today);
  const lastDueOn = lastN === null || lastN < s.firstNumber ? null : seriesDueOn(s, lastN);
  const firstMonth = input.firstDueMonth;
  const lastMonth = lastN === null || lastN < s.firstNumber ? null : seriesMonthOf(s, lastN);
  const totalCents = count === null ? null : count * input.amountCents;
  const lines = next.map((o) => `${formatDateBR(o.dueOn)} · ${fmt(o.amountCents)}${variable ? ' (estimado)' : ''}`);

  let text: string;
  let savedText: string | null = null;
  switch (input.kind) {
    case 'parcelada': {
      const first = next[0]!;
      const sum = `Soma das ${count} parcelas: ${fmt(totalCents!)}. Não é o valor para quitar.`;
      text =
        count === 1
          ? `Parcela ${s.firstNumber} de ${input.installmentTotal}: ${fmt(input.amountCents)}, em ${formatDateBR(first.dueOn)}. Não é o valor para quitar.`
          : `Parcelas ${s.firstNumber} a ${lastN} de ${fmt(input.amountCents)}, todo dia ${input.dueDay}, de ${formatDateBR(first.dueOn)} a ${formatDateBR(lastDueOn!)}. ${sum}`;
      break;
    }
    case 'mensal': {
      const amount = variable ? `${fmt(input.amountCents)} (estimado)` : fmt(input.amountCents);
      const span = lastMonth === null ? `desde ${formatMonthYearBR(firstMonth)}` : `${formatMonthSpanBR(firstMonth, lastMonth)} (${contas(count!)})`;
      const months = createdNow.map((o) => formatMonthName(o.month));
      const moreLater = lastN === null || (createdNow[createdNow.length - 1]?.number ?? s.firstNumber - 1) < lastN;
      const tail = moreLater ? '; as próximas aparecem um mês antes de vencer.' : '.';
      const created =
        months.length === 0
          ? `A primeira conta aparece em Contas a pagar a partir de ${formatMonthYearBR(addMonths(firstMonth, -1))}.`
          : months.length === 1
            ? `A conta de ${months[0]} já entra em Contas a pagar${tail}`
            : `As contas de ${joinList(months)} já entram em Contas a pagar${tail}`;
      text = `${input.description} · ${amount} · todo dia ${input.dueDay} · ${span}. ${created}`;
      break;
    }
    case 'anual':
      ({ text, savedText } = annualPreviewTexts(input, s, next, createdNow, today));
      break;
    default:
      return unknownKind(input.kind);
  }
  return {
    input,
    firstNumber: s.firstNumber,
    lastNumber: lastN,
    firstMonth,
    lastMonth,
    next,
    createdNow,
    firstOverdue: next[0] !== undefined && next[0].dueOn < today,
    count,
    totalCents,
    lastDueOn,
    lines,
    text,
    savedText,
  };
}

/** "venceu em 05/10", "vence hoje" ou "vence em 15/10" (com o ano, se pedido). */
function whenDue(dueOn: IsoDate, today: IsoDate, withYear: boolean): string {
  const date = withYear ? formatDateBR(dueOn) : formatDayMonth(dueOn);
  return dueOn < today ? `venceu em ${date}` : dueOn === today ? 'vence hoje' : `vence em ${date}`;
}

/**
 * Chips "Primeira conta": mês atual e seguinte com o vencimento no dia escolhido.
 * Padrão: o primeiro vencimento a partir de hoje. "Outro mês" fica a cargo da tela.
 */
export function firstMonthChoices(dueDay: number, today: IsoDate): { month: IsoMonth; dueOn: IsoDate; label: string; isDefault: boolean }[] {
  const current = monthOf(today);
  const months = [current, addMonths(current, 1)];
  const choices = months.map((month) => {
    const dueOn = dateInMonth(month, dueDay);
    const name = formatMonthName(month);
    return { month, dueOn, label: `${name.charAt(0).toUpperCase()}${name.slice(1)} (${whenDue(dueOn, today, false)})`, isDefault: false };
  });
  const def = choices.find((c) => c.dueOn >= today) ?? choices[choices.length - 1]!;
  def.isDefault = true;
  return choices;
}

/** Escolha de início da conta do ano: vai em SeriesInput.firstDueMonth e firstNumber. */
export interface AnnualStartChoice {
  firstDueMonth: IsoMonth;
  firstNumber: number;
  dueOn: IsoDate;
  /** "2027 (vence em 20/01/2027)" ou "Parcela 9 (vence em 10/10)". */
  label: string;
  isDefault: boolean;
}

export interface AnnualStartChoices {
  /** Chips "Primeiro ano" (a partir da parcela 1 do ano). */
  years: AnnualStartChoice[];
  /**
   * Ano já começado (só com 2 ou mais parcelas): "Próxima parcela a pagar em 2026", com as parcelas do ano a partir do
   * mês passado. null quando não há ano começado na faixa aceita.
   */
  started: { yearLabel: string; title: string; hint: string; parts: AnnualStartChoice[] } | null;
}

/**
 * Chips do início da conta do ano (k parcelas, 1ª parcela do ano no mês `month`, de 1 a 12, no dia `day`), dentro da
 * faixa aceita pelo banco (do mês passado a 23 meses à frente). Um único padrão nas duas listas: o primeiro vencimento a
 * partir de hoje (num ano já começado, a próxima parcela a pagar).
 */
export function annualStartChoices(k: number, month: number, day: number, today: IsoDate): AnnualStartChoices {
  const current = monthOf(today);
  const min = addMonths(current, -1);
  const max = addMonths(current, 23);
  const mm = String(month).padStart(2, '0');
  const y0 = Number(min.slice(0, 4));
  const label = (start: IsoMonth) => yearLabel(start, addMonths(start, k - 1));
  const years: AnnualStartChoice[] = [];
  let started: AnnualStartChoices['started'] = null;
  for (let y = y0 - 1; y <= y0 + 3; y++) {
    const start = `${y}-${mm}`;
    if (start >= min && start <= max) {
      const dueOn = dateInMonth(start, day);
      const when = whenDue(dueOn, today, true);
      years.push({ firstDueMonth: start, firstNumber: 1, dueOn, label: `${label(start)} (${k === 1 ? when : `primeira ${when}`})`, isDefault: false });
    } else if (k > 1 && start < min && addMonths(start, k - 1) >= min) {
      const parts: AnnualStartChoice[] = [];
      for (let p = 2; p <= k; p++) {
        const m = addMonths(start, p - 1);
        if (m < min) continue;
        const dueOn = dateInMonth(m, day);
        parts.push({ firstDueMonth: m, firstNumber: p, dueOn, label: `Parcela ${p} (${whenDue(dueOn, today, false)})`, isDefault: false });
      }
      started = {
        yearLabel: label(start),
        title: `Próxima parcela a pagar em ${label(start)}`,
        hint: 'As parcelas anteriores deste ano não viram gastos.',
        parts,
      };
    }
  }
  const all = [...(started?.parts ?? []), ...years];
  const def = all.find((c) => c.dueOn >= today) ?? all[all.length - 1];
  if (def) def.isDefault = true;
  return { years, started };
}

export interface SeriesConflicts {
  /** Gasto anotado no primeiro mês com a mesma descrição. */
  record: FinancialRecord | null;
  /** Conta a pagar avulsa no primeiro mês com a mesma descrição. */
  commitment: Commitment | null;
  /** Gasto fixo com a mesma descrição que ainda tem contas a partir do primeiro mês. */
  similar: CommitmentSeries | null;
  /** Mês seguinte ao primeiro ("Começar em novembro"); na conta do ano, o 1º mês do ano seguinte ("Começar em 2028"). */
  suggestedFirstMonth: IsoMonth;
  /**
   * Parcelamento: a parcela do mês seguinte (a conta ou o gasto do primeiro mês já é a parcela informada), que
   * "Começar em novembro (parcela 13)" põe no cadastro junto do mês. Conta do ano: 1 (o ano seguinte inteiro).
   * null no gasto fixo e quando a parcela informada já é a última (não há mês seguinte para começar).
   */
  suggestedFirstNumber: number | null;
  /** startNext null: sem botão "Começar em…" (parcela informada já é a última). */
  texts: { record: string | null; commitment: string | null; similar: string | null; startNext: string | null };
}

const sameText = (text: string) => text.trim().toLocaleLowerCase('pt-BR');

/**
 * Avisos contra contar duas vezes no formulário de série. Descrições comparadas sem caixa e sem espaços nas pontas.
 * records e commitments: do mês da primeira conta; series: do contexto. Série encerrada antes do primeiro mês não conta.
 */
export function findSeriesConflicts(
  preview: Pick<SeriesPreview, 'input' | 'firstMonth'>,
  commitments: readonly Commitment[],
  records: readonly FinancialRecord[],
  series: readonly CommitmentSeries[],
): SeriesConflicts {
  const name = sameText(preview.input.description);
  const month = preview.firstMonth;
  const kind = preview.input.kind;
  const record = records.find((r) => r.kind === 'despesa' && monthOf(r.occurredOn) === month && sameText(r.description) === name) ?? null;
  const commitment =
    commitments.find((c) => c.series === null && monthOf(c.dueOn) === month && sameText(c.description) === name) ?? null;
  let similar: CommitmentSeries | null = null;
  let similarName = '';
  for (const s of series) {
    const end = seriesEndMonth(s);
    if (end !== null && (s.lastNumber! < s.firstNumber || end < month)) continue;
    const term = s.terms.find((t) => sameText(t.description) === name);
    if (term) {
      similar = s;
      similarName = currentTerm(s).description;
      break;
    }
  }
  const similarText = similar
    ? `Você já tem ${SERIES_KIND_NAME[similar.kind]} ${similarName}. ${
        kind === 'anual'
          ? 'Quer cadastrar esta conta do ano mesmo assim?'
          : similar.kind === 'anual'
            ? 'Quer cadastrar mesmo assim?'
            : 'Quer cadastrar outro mesmo assim?'
      }`
    : null;

  if (kind === 'anual') {
    // Conta do ano: começar no ano seguinte, a partir da parcela 1 dele.
    const s = seriesFromInput(preview.input);
    const k = partsOf(s);
    const next = addMonths(annualYearOf(s, s.firstNumber).firstMonth, 12);
    const nextLabel = yearLabel(next, addMonths(next, k - 1));
    return {
      record,
      commitment,
      similar,
      suggestedFirstMonth: next,
      suggestedFirstNumber: 1,
      texts: {
        record: record
          ? `Você já anotou o gasto ${record.description} em ${formatDateBR(record.occurredOn)} (${formatBRL(record.amountCents)}). Para não contar duas vezes, a conta do ano pode começar em ${nextLabel}.`
          : null,
        commitment: commitment
          ? `Você já tem a conta a pagar ${commitment.description} com vencimento em ${formatDateBR(commitment.dueOn)}. Começar a repetição em ${nextLabel}?`
          : null,
        similar: similarText,
        startNext: `Começar em ${nextLabel}`,
      },
    };
  }

  const next = addMonths(month, 1);
  const nextName = formatMonthName(next);
  const parcelada = kind === 'parcelada';
  const n = preview.input.firstNumber;
  const last = parcelada && n >= (preview.input.installmentTotal ?? n);
  const nextNumber = parcelada && !last ? n + 1 : null;
  // Parcelamento: começar no mês seguinte é começar na parcela seguinte; se a informada já é a última, não há seguinte.
  const recordTail = !parcelada
    ? `Para não contar duas vezes, o gasto fixo pode começar em ${nextName}.`
    : last
      ? `Se esse gasto foi a parcela ${n}, a última, não há mais parcelas a cadastrar.`
      : `Para não contar duas vezes, o parcelamento pode começar com a parcela ${nextNumber}, em ${nextName}.`;
  const commitmentTail = !parcelada
    ? `Começar a repetição em ${nextName}?`
    : last
      ? `Se ela é a parcela ${n}, a última, não há mais parcelas a cadastrar.`
      : `Começar o parcelamento com a parcela ${nextNumber}, em ${nextName}?`;
  return {
    record,
    commitment,
    similar,
    suggestedFirstMonth: next,
    suggestedFirstNumber: nextNumber,
    texts: {
      record: record
        ? `Você já anotou o gasto ${record.description} em ${formatDayMonth(record.occurredOn)} (${formatBRL(record.amountCents)}). ${recordTail}`
        : null,
      commitment: commitment
        ? `Você já tem a conta a pagar ${commitment.description} com vencimento em ${formatDayMonth(commitment.dueOn)}. ${commitmentTail}`
        : null,
      similar: similarText,
      startNext: !parcelada ? `Começar em ${nextName}` : last ? null : `Começar em ${nextName} (parcela ${nextNumber})`,
    },
  };
}

// ---------------------------------------------------------------------------
// Contas do ano (D-029): ano a ano, informar o valor do ano, tirar as parcelas do ano, cota única e sugestão.
// ---------------------------------------------------------------------------

type AnnualSeries = SeriesRange & Pick<CommitmentSeries, 'id' | 'skippedNumbers'> & SeriesCounts;

/**
 * Anos a mostrar em "Ano a ano" (índices, de from a to; vazio quando to < from): do primeiro ano da série até o
 * próximo ano ainda não criado (o "previsto"), limitado ao último ano da série.
 */
export function annualYearRange(s: SeriesShape & Pick<CommitmentSeries, 'lastNumber'>, today: IsoDate): { from: number; to: number } {
  const k = partsOf(s);
  const from = Math.floor((s.firstNumber - 1) / k);
  if (s.lastNumber !== null && s.lastNumber < s.firstNumber) return { from, to: from - 1 };
  const anchor = anchorOf(s);
  const { annualTop } = generationWindow(today);
  let to = annualTop < anchor ? 0 : Math.floor(monthsBetween(anchor, annualTop) / 12) + 1;
  if (s.lastNumber !== null) to = Math.min(to, Math.floor((s.lastNumber - 1) / k));
  return { from, to };
}

export interface AnnualYearSummary {
  year: AnnualYear;
  /** Parcelas do ano dentro do período da série (sem as pagas antes do Clarevo e sem as depois do término). */
  count: number;
  /** Ocorrências vivas pagas. */
  paid: number;
  /** Ocorrências vivas em aberto. */
  open: number;
  /** Tiradas ("excluída só esta", "Tirar as parcelas do ano" ou "Não houve"): nunca voltam. */
  skipped: number;
  /** Sem conta registrada: antes do piso da geração, nunca serão criadas. */
  missing: number;
  /** Pagas antes do Clarevo (informado por você): números do primeiro ano antes de firstNumber. */
  paidBefore: number;
  /** Ainda não criadas (o ano ainda não entrou, ou entra na próxima geração). */
  notCreated: number;
  /** Fora da lista cortada (listSeriesOccurrences traz só as 60 mais recentes): nada é deduzido sobre elas. */
  unknown: number;
  /** Posições (1 a k) sem conta registrada. */
  missingParts: number[];
  /** Pagas pelo valor pago + em aberto pelo previsto + ainda não criadas pela vigência. Sem tiradas e sem "sem conta". */
  totalCents: Cents;
  /** Algum valor da soma é estimado ("cerca de"). */
  approximate: boolean;
  /** Mês em que o ano entra em Contas a pagar: mês da 1ª parcela do ano − 2. */
  entersOn: IsoMonth;
  /** O ano ainda não entrou em Contas a pagar ("previsto"). */
  planned: boolean;
  texts: {
    /** "2027 · 10 parcelas · 3 pagas · 7 em aberto · R$ 1.899,00" ou "2028 · previsto · cerca de R$ 1.800,00 · entra em Contas a pagar em dezembro de 2027". */
    line: string;
    /** "2026: parcelas 1 a 8 pagas antes do Clarevo (informado por você)." */
    paidBefore: string | null;
    /** "2027: as 10 parcelas ficaram sem conta registrada. Se você pagou, anote o gasto em Anotar gasto." */
    missing: string | null;
  };
}

/**
 * Resumo de um ano (índice a) da conta do ano, para "Ano a ano". Como installmentProgress:
 * - occurrences: listSeriesOccurrences (as 60 mais recentes, abertas e pagas);
 * - open: listOpenSeriesOccurrences (todas as em aberto).
 */
export function annualYearSummary(
  s: AnnualSeries,
  occurrences: readonly Commitment[],
  open: readonly Commitment[],
  a: number,
  today: IsoDate,
): AnnualYearSummary {
  const k = partsOf(s);
  const year = annualYearOf(s, a * k + 1);
  const listed = liveByNumber(s, occurrences);
  const live = liveByNumber(s, mergeOccurrences(occurrences, open));
  const known = listed.size === 0 ? s.firstNumber : knownFrom(s, listed);
  const skippedSet = new Set(s.skippedNumbers);
  const { floor, annualTop } = generationWindow(today);
  const planned = year.firstMonth > annualTop;
  let count = 0;
  let paid = 0;
  let openCount = 0;
  let skipped = 0;
  let paidBefore = 0;
  let notCreated = 0;
  let unknown = 0;
  let totalCents = 0;
  let approximate = false;
  const missingParts: number[] = [];
  for (let n = year.firstNumber; n <= year.lastNumber; n++) {
    if (n < s.firstNumber) {
      paidBefore += 1;
      continue;
    }
    if (s.lastNumber !== null && n > s.lastNumber) continue;
    count += 1;
    const c = live.get(n);
    if (c) {
      if (c.status === 'quitado') {
        paid += 1;
        totalCents += c.payment?.amountCents ?? c.amountCents;
      } else {
        openCount += 1;
        totalCents += c.amountCents;
        approximate ||= c.amountIsEstimate;
      }
    } else if (skippedSet.has(n)) {
      skipped += 1;
    } else if (n < known) {
      unknown += 1;
    } else if (seriesMonthOf(s, n) < floor) {
      missingParts.push(n - year.firstNumber + 1);
    } else {
      notCreated += 1;
      const t = requireTerm(s, n);
      totalCents += t.amountCents;
      approximate ||= t.amountMode === 'variavel';
    }
  }
  const missing = missingParts.length;
  const entersOn = addMonths(year.firstMonth, -ANNUAL_LEAD_MONTHS);
  const Y = year.label;
  const valued = paid + openCount + notCreated > 0;
  let line: string;
  if (planned) {
    line = `${Y} · previsto · ${money(totalCents, approximate)} · entra em Contas a pagar em ${formatMonthYearBR(entersOn)}`;
  } else if (k === 1) {
    const state = paid ? 'paga' : openCount ? 'em aberto' : skipped ? 'não houve' : missing ? 'sem conta registrada' : notCreated ? 'ainda não criada' : null;
    line = [Y, state, valued ? money(totalCents, approximate) : null].filter(Boolean).join(' · ');
  } else {
    line = [
      Y,
      plural(count, 'parcela', 'parcelas'),
      paid ? plural(paid, 'paga', 'pagas') : null,
      openCount ? `${openCount} em aberto` : null,
      skipped ? plural(skipped, 'tirada', 'tiradas') : null,
      missing ? `${missing} sem conta registrada` : null,
      notCreated ? plural(notCreated, 'ainda não criada', 'ainda não criadas') : null,
      valued ? money(totalCents, approximate) : null,
    ]
      .filter(Boolean)
      .join(' · ');
  }
  let missingText: string | null = null;
  if (missing > 0) {
    const hint = 'Se você pagou, anote o gasto em Anotar gasto.';
    if (k === 1) missingText = `${Y}: ficou sem conta registrada. ${hint}`;
    else if (missing === count && count > 1) missingText = `${Y}: as ${count} parcelas ficaram sem conta registrada. ${hint}`;
    else if (missing === 1) missingText = `${Y}: parcela ${missingParts[0]} sem conta registrada.`;
    else missingText = `${Y}: parcelas ${partsText(missingParts)} sem conta registrada.`;
  }
  const paidBeforeText =
    paidBefore === 0
      ? null
      : paidBefore === 1
        ? `${Y}: parcela 1 paga antes do Clarevo (informado por você).`
        : `${Y}: parcelas 1 a ${paidBefore} pagas antes do Clarevo (informado por você).`;
  return {
    year,
    count,
    paid,
    open: openCount,
    skipped,
    missing,
    paidBefore,
    notCreated,
    unknown,
    missingParts,
    totalCents,
    approximate,
    entersOn,
    planned,
    texts: { line, paidBefore: paidBeforeText, missing: missingText },
  };
}

export type YearMode = 'informar' | 'tirar';

export type YearPlan =
  | { ok: false; code: 'tipo_invalido' | 'numero_fora_da_serie' }
  | { ok: false; code: 'nada_a_mudar'; year: AnnualYear; text: string }
  | {
      ok: true;
      year: AnnualYear;
      /** Conjunto que vai em expectedAffected de informSeriesYear ou skipSeriesYear. */
      affected: AffectedRef[];
      /** Informar: em aberto e estimadas. Tirar: todas as em aberto do ano. */
      changing: Commitment[];
      /** As outras contas do ano: pagas e, ao informar, em aberto com valor já informado. */
      unchanged: { commitment: Commitment; reason: 'paga' | 'informada' }[];
      /** "Informar o valor de 2027" ou "Tirar as 7 parcelas de 2027 em aberto?". */
      title: string;
      /** Prévia de informar ou texto do diálogo de tirar. */
      text: string;
      /** Faixa ou anúncio depois de gravar ("9 parcelas de 2027 saíram de Contas a pagar."). */
      doneText: string;
      /**
       * Total do ano depois da escrita: pagas pelo valor pago, mais (informar, com amountCents) as em aberto pelo valor.
       * null ao informar sem valor.
       */
      totalCents: Cents | null;
    };

/**
 * "Informar o valor de 2027" e "Tirar as parcelas de 2027" (mesma seleção de inform_series_year e skip_series_year):
 * o ano é o da parcela n; informar muda as em aberto e estimadas, tirar exclui todas as em aberto. Use a lista completa
 * (mergeOccurrences de listSeriesOccurrences e listOpenSeriesOccurrences). Conjunto vazio: o banco recusaria
 * (versao_desatualizada), então o plano vem com nada_a_mudar.
 */
export function affectedByYear(
  list: readonly Commitment[],
  s: SeriesShape & Pick<CommitmentSeries, 'id' | 'lastNumber'>,
  n: number,
  mode: YearMode,
  amountCents?: Cents,
): YearPlan {
  if (s.kind !== 'anual') return { ok: false, code: 'tipo_invalido' };
  if (!Number.isSafeInteger(n) || n < s.firstNumber || (s.lastNumber !== null && n > s.lastNumber)) return { ok: false, code: 'numero_fora_da_serie' };
  const k = partsOf(s);
  const year = annualYearOf(s, n);
  const Y = year.label;
  const inYear = [...liveByNumber(s, list).values()]
    .filter((c) => c.series!.number >= year.firstNumber && c.series!.number <= year.lastNumber)
    .sort(byNumber);
  const changing = inYear.filter((c) => c.status === 'aberto' && (mode === 'tirar' || c.amountIsEstimate));
  const unchanged = inYear
    .filter((c) => !changing.includes(c))
    .map((commitment) => ({ commitment, reason: commitment.status === 'quitado' ? ('paga' as const) : ('informada' as const) }));
  const paidCents = inYear.reduce((acc, c) => acc + (c.status === 'quitado' ? (c.payment?.amountCents ?? c.amountCents) : 0), 0);
  const N = changing.length;
  const name = (c: Commitment) => (k === 1 ? `a conta de ${Y}` : `a parcela ${partOf(c)} de ${Y}`);
  if (N === 0) {
    const text =
      mode === 'informar'
        ? k === 1
          ? `A conta de ${Y} não está em aberto com valor estimado.`
          : `Nenhuma parcela de ${Y} está em aberto com valor estimado.`
        : k === 1
          ? `A conta de ${Y} não está em aberto.`
          : `Nenhuma parcela de ${Y} está em aberto.`;
    return { ok: false, code: 'nada_a_mudar', year, text };
  }
  const one = changing[0]!;
  let title: string;
  let text: string;
  let doneText: string;
  let totalCents: Cents | null;
  if (mode === 'informar') {
    title = `Informar o valor de ${Y}`;
    const keptOpen = unchanged.reduce((acc, u) => acc + (u.reason === 'informada' ? u.commitment.amountCents : 0), 0);
    totalCents = amountCents === undefined ? null : paidCents + keptOpen + N * amountCents;
    const head = N === 1 ? `Vai mudar: ${name(one)}, em aberto com valor estimado.` : `Vão mudar: as ${N} parcelas de ${Y} em aberto com valor estimado.`;
    const total = totalCents === null ? '' : ` Total de ${Y}: ${formatBRL(totalCents)}.`;
    const rule = k > 1 ? ' Não mudam: parcelas pagas e parcelas com valor já informado.' : '';
    text = `${head}${total}${rule}`;
    doneText =
      k === 1
        ? `Valor de ${Y} informado. A conta deixou de ser estimada.`
        : N === 1
          ? `Valor de ${Y} informado. A parcela ${partOf(one)} deixou de ser estimada.`
          : `Valor de ${Y} informado. As parcelas deixaram de ser estimadas.`;
  } else {
    totalCents = paidCents;
    title = k === 1 ? `Tirar a conta de ${Y}?` : N === 1 ? `Tirar a parcela ${partOf(one)} de ${Y}?` : `Tirar as ${N} parcelas de ${Y} em aberto?`;
    const continues = s.lastNumber === null || s.lastNumber > year.lastNumber;
    const nextLabel = annualYearLabel(s, year.index + 1);
    text = [
      N === 1 ? 'Ela sai de Contas a pagar e não volta a ser criada.' : 'Elas saem de Contas a pagar e não voltam a ser criadas.',
      unchanged.length > 0 ? 'As parcelas pagas continuam.' : null,
      continues ? `A conta do ano continua em ${nextLabel}.` : null,
    ]
      .filter(Boolean)
      .join(' ');
    doneText =
      k === 1
        ? `A conta de ${Y} saiu de Contas a pagar.`
        : N === 1
          ? `A parcela ${partOf(one)} de ${Y} saiu de Contas a pagar.`
          : `${N} parcelas de ${Y} saíram de Contas a pagar.`;
  }
  return { ok: true, year, affected: refs(changing), changing, unchanged, title, text, doneText, totalCents };
}

/** "Paguei o ano todo de uma vez (cota única)": pagar a parcela escolhida com o valor total e depois tirar as outras. */
export interface WholeYearPayment {
  year: AnnualYear;
  /** As outras parcelas do ano em aberto, que saem depois do pagamento. */
  others: Commitment[];
  /** expectedAffected de skipSeriesYear depois do pagamento (o pagamento não muda a versão das outras). */
  affectedAfterPayment: AffectedRef[];
  /** Soma das parcelas do ano em aberto, inclusive a escolhida: sugestão para o valor total pago. */
  openTotalCents: Cents;
  approximate: boolean;
  /** Rótulo da caixa. */
  label: string;
  /** Dica da caixa. */
  hint: string;
  /** Faixa depois das duas chamadas. */
  doneText: string;
  /** Faixa quando o pagamento foi gravado e skipSeriesYear falhou. */
  failedText: string;
}

/**
 * Caixa "Paguei o ano todo de uma vez" no pagamento de uma parcela de conta do ano com 2 ou mais parcelas e outras em
 * aberto no mesmo ano; null quando não se aplica. O app chama payCommitment(chosen, valor total) e depois
 * skipSeriesYear(chosen.series.number, affectedAfterPayment). Use a lista completa (mergeOccurrences).
 */
export function wholeYearPayment(
  list: readonly Commitment[],
  s: SeriesShape & Pick<CommitmentSeries, 'id' | 'lastNumber'>,
  chosen: Commitment,
): WholeYearPayment | null {
  if (s.kind !== 'anual' || partsOf(s) === 1 || chosen.status !== 'aberto' || chosen.series?.id !== s.id) return null;
  const plan = affectedByYear(list, s, chosen.series.number, 'tirar');
  if (!plan.ok) return null;
  const others = plan.changing.filter((c) => c.id !== chosen.id);
  if (others.length === 0) return null;
  const Y = plan.year.label;
  const N = others.length;
  return {
    year: plan.year,
    others,
    affectedAfterPayment: refs(others),
    openTotalCents: others.reduce((acc, c) => acc + c.amountCents, chosen.amountCents),
    approximate: chosen.amountIsEstimate || others.some((c) => c.amountIsEstimate),
    label: 'Paguei o ano todo de uma vez (cota única)',
    hint:
      N === 1
        ? `Informe o valor total pago. A outra parcela de ${Y} em aberto sai de Contas a pagar e não volta, mesmo se você desfizer este pagamento.`
        : `Informe o valor total pago. As outras ${N} parcelas de ${Y} em aberto saem de Contas a pagar e não voltam, mesmo se você desfizer este pagamento.`,
    doneText:
      N === 1
        ? `Pagamento registrado. A outra parcela de ${Y} saiu de Contas a pagar.`
        : `Pagamento registrado. As outras ${N} parcelas de ${Y} saíram de Contas a pagar.`,
    failedText: `Pagamento registrado. Não foi possível tirar ${N === 1 ? 'a outra parcela' : 'as outras parcelas'} agora. Use Tirar as parcelas de ${Y} na conta do ano.`,
  };
}

/** Sugestão de referência da conta do ano para os anos seguintes. Aplicar = updateSeriesFrom(fromNumber, …, edit). */
export interface AnnualReferenceSuggestion {
  /** Valor pago da parcela paga de maior número. */
  amountCents: Cents;
  /** Ano da parcela paga. */
  paidYear: AnnualYear;
  /** 1º número do ano seguinte (pode ainda não existir, como o reajuste programado do Ciclo A). */
  fromNumber: number;
  /** Rótulo do ano seguinte. */
  fromLabel: string;
  /** "Esta e as próximas" pronta: a vigência de fromNumber com o valor novo (mesmo modo, dia, descrição e categoria). */
  edit: SeriesEditInput;
  /** "Em 2027 você pagou R$ 2.512,30. Usar esse valor como referência a partir de 2028?" */
  text: string;
  /** "Usar R$ 2.512,30 a partir de 2028" */
  action: string;
}

/**
 * Sugestão de referência (nunca aplicada sozinha): o valor pago da parcela paga de maior número, se o ano dela não tem
 * parcela tirada, a série continua no ano seguinte e a vigência do ano seguinte tem outro valor. Lista:
 * listSeriesOccurrences. Para aplicar, o conjunto esperado é affectedByEditFrom(lista completa, s, fromNumber).
 */
export function suggestedAnnualReference(
  s: SeriesRange & Pick<CommitmentSeries, 'id' | 'nature' | 'skippedNumbers'>,
  occurrences: readonly Commitment[],
): AnnualReferenceSuggestion | null {
  if (s.kind !== 'anual') return null;
  const k = partsOf(s);
  const last = [...liveByNumber(s, occurrences).values()]
    .filter((c) => c.status === 'quitado' && c.payment !== null)
    .sort((a, b) => b.series!.number - a.series!.number)[0];
  if (!last) return null;
  const paidYear = annualYearOf(s, last.series!.number);
  if (s.skippedNumbers.some((n) => n >= paidYear.firstNumber && n <= paidYear.lastNumber)) return null;
  const fromNumber = paidYear.lastNumber + 1;
  if (s.lastNumber !== null && fromNumber > s.lastNumber) return null;
  const amountCents = last.payment!.amountCents;
  const term = requireTerm(s, fromNumber);
  if (term.amountCents === amountCents) return null;
  const fromLabel = annualYearLabel(s, paidYear.index + 1);
  const value = formatBRL(amountCents);
  return {
    amountCents,
    paidYear,
    fromNumber,
    fromLabel,
    edit: {
      nature: s.nature,
      description: term.description,
      category: term.category,
      amountCents,
      amountMode: term.amountMode,
      dueDay: term.dueDay,
    },
    text:
      k === 1
        ? `Em ${paidYear.label} você pagou ${value}. Usar esse valor como referência a partir de ${fromLabel}?`
        : `Em ${paidYear.label} você pagou ${value} na parcela ${paidYear.part}. Usar esse valor como referência de cada parcela a partir de ${fromLabel}?`,
    action: k === 1 ? `Usar ${value} a partir de ${fromLabel}` : `Usar ${value} por parcela a partir de ${fromLabel}`,
  };
}

/** Parcelas de uma conta do ano no mesmo ano, mostradas como um grupo em "Próximos meses" e em "Contas vencidas". */
export interface AnnualGroup {
  seriesId: string;
  /** Índice do ano na série. */
  index: number;
  /** "2027" ou "2026/2027". */
  label: string;
  description: string;
  /** Na ordem da lista recebida (vencimento). */
  commitments: Commitment[];
  count: number;
  firstDueOn: IsoDate;
  lastDueOn: IsoDate;
  totalCents: Cents;
  /** Alguma parcela com valor estimado. */
  approximate: boolean;
  /** Todas com valor fixo: "Selecionar as 10" nas vencidas. */
  allFixed: boolean;
  /** "IPTU de 2027" */
  title: string;
  /** "10 parcelas, de 10/02 a 10/11/2027 · estimado" */
  caption: string;
  /** Nome acessível único: "IPTU de 2027, 10 parcelas de cerca de R$ 180,00, valor estimado, de 10/02/2027 a 10/11/2027, conta do ano. Toque para ver as parcelas." */
  a11yLabel: string;
}

export type GroupedCommitment = { type: 'conta'; commitment: Commitment } | { type: 'ano'; group: AnnualGroup };

/**
 * Junta 2 ou mais parcelas da mesma conta do ano e do mesmo ano (summarizeToPay.later ou a lista de vencidas, já em
 * ordem de vencimento). O grupo fica na posição da primeira parcela; as outras contas continuam como estão.
 */
export function groupAnnualLater(list: readonly Commitment[]): GroupedCommitment[] {
  const keyOf = (c: Commitment) => {
    if (!c.series || c.series.kind !== 'anual') return null;
    const k = c.series.partsPerYear ?? 1;
    return `${c.series.id}|${Math.floor((c.series.number - 1) / k)}`;
  };
  const members = new Map<string, Commitment[]>();
  for (const c of list) {
    const key = keyOf(c);
    if (key !== null) members.set(key, [...(members.get(key) ?? []), c]);
  }
  const out: GroupedCommitment[] = [];
  const done = new Set<string>();
  for (const c of list) {
    const key = keyOf(c);
    const group = key === null ? undefined : members.get(key);
    if (!group || group.length < 2) {
      out.push({ type: 'conta', commitment: c });
      continue;
    }
    if (done.has(key!)) continue;
    done.add(key!);
    const first = group[0]!;
    const k = first.series!.partsPerYear ?? 1;
    const label = annualYearLabelOf(first)!;
    const dues = group.map((x) => x.dueOn).sort();
    const firstDueOn = dues[0]!;
    const lastDueOn = dues[dues.length - 1]!;
    const totalCents = group.reduce((acc, x) => acc + x.amountCents, 0);
    const approximate = group.some((x) => x.amountIsEstimate);
    const count = group.length;
    const span =
      firstDueOn.slice(0, 4) === lastDueOn.slice(0, 4)
        ? `de ${formatDayMonth(firstDueOn)} a ${formatDateBR(lastDueOn)}`
        : `de ${formatDateBR(firstDueOn)} a ${formatDateBR(lastDueOn)}`;
    const sameAmount = group.every((x) => x.amountCents === first.amountCents);
    const about = approximate ? 'cerca de ' : '';
    const amountPhrase = sameAmount ? ` de ${about}${formatBRL(first.amountCents)}` : `, ${about}${formatBRL(totalCents)} no total`;
    out.push({
      type: 'ano',
      group: {
        seriesId: first.series!.id,
        index: Math.floor((first.series!.number - 1) / k),
        label,
        description: first.description,
        commitments: group,
        count,
        firstDueOn,
        lastDueOn,
        totalCents,
        approximate,
        allFixed: !approximate,
        title: `${first.description} de ${label}`,
        caption: `${count} parcelas, ${span}${approximate ? ' · estimado' : ''}`,
        a11yLabel:
          `${first.description} de ${label.replace('/', ' a ')}, ${count} parcelas${amountPhrase}${approximate ? ', valor estimado' : ''}, ` +
          `de ${formatDateBR(firstDueOn)} a ${formatDateBR(lastDueOn)}, conta do ano. Toque para ver as parcelas.`,
      },
    });
  }
  return out;
}
