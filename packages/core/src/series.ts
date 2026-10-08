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
import type { Commitment, CommitmentSeries, FinancialRecord, SeriesInput, SeriesNature, SeriesTerm } from './records';
import type { AffectedRef } from './repository';

/**
 * Gastos fixos e parcelamentos (D-024). Regras puras, sem Date local, repetidas no banco
 * (clarevo_series_due_on, clarevo_materialize_series, update_series_from, end_series).
 *
 * - mêsDa(n) = primeiroMês + (n − primeiroNúmero) meses; númeroDo(mês) = primeiroNúmero + meses(primeiroMês, mês).
 * - Vencimento de n = dia da vigência de n no mês dele, limitado ao último dia; sempre a partir do dia escolhido,
 *   nunca do vencimento anterior (31/01 → 28/02 → 31/03).
 * - Só existem contas gravadas do mês anterior ao seguinte a hoje; o resto é previsão e não entra em totais.
 */

/** No máximo 100 gastos fixos ativos por contexto (limite_de_gastos_fixos). */
export const SERIES_LIMIT = 100;
/** Mensal com término: até 600 contas (último mês até primeiro mês + 599). */
export const SERIES_MAX_MONTHS = 600;
export const INSTALLMENTS_MIN = 2;
export const INSTALLMENTS_MAX = 480;

type SeriesShape = Pick<CommitmentSeries, 'firstDueMonth' | 'firstNumber'>;
type SeriesWithTerms = SeriesShape & Pick<CommitmentSeries, 'terms'>;
type SeriesRange = SeriesWithTerms & Pick<CommitmentSeries, 'lastNumber'>;
type SeriesForGeneration = SeriesRange & Pick<CommitmentSeries, 'id' | 'skippedNumbers' | 'generating'>;

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

export function seriesMonthOf(s: SeriesShape, n: number): IsoMonth {
  return addMonths(s.firstDueMonth, n - s.firstNumber);
}

export function numberOfMonth(s: SeriesShape, month: IsoMonth): number {
  return s.firstNumber + monthsBetween(s.firstDueMonth, month);
}

/** Vigência de n: a viva com o maior fromNumber ≤ n. */
export function termFor(terms: readonly SeriesTerm[], n: number): SeriesTerm | null {
  let best: SeriesTerm | null = null;
  for (const t of terms) if (t.fromNumber <= n && (!best || t.fromNumber > best.fromNumber)) best = t;
  return best;
}

function requireTerm(s: SeriesWithTerms, n: number): SeriesTerm {
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

/** Número da última conta para o mês escolhido em "Encerrar" ou "Termina em…". */
export function lastNumberFromEndMonth(s: SeriesShape, month: IsoMonth): number {
  return numberOfMonth(s, month);
}

/** Janela de geração: do mês anterior ao seguinte a hoje. */
export function generationWindow(today: IsoDate): { floor: IsoMonth; top: IsoMonth } {
  const m = monthOf(today);
  return { floor: addMonths(m, -1), top: addMonths(m, 1) };
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
function knownFrom(s: Pick<CommitmentSeries, 'firstNumber'> & Partial<Pick<CommitmentSeries, 'paidCount' | 'openCount'>>, live: Map<number, Commitment>): number {
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
 * para affectedByEditFrom, affectedByEnd e affectedByDelete, que precisam de todas as contas em aberto (o banco confere
 * o conjunto inteiro). missingMonths continua com a lista cortada: knownFrom depende dela.
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
 * Contas que a geração cria hoje (mesma regra de clarevo_materialize_series): do mês anterior ao seguinte,
 * dentro de [firstNumber, lastNumber], sem as que já existem vivas e sem as excluídas só neste mês.
 * Números anteriores ao piso nunca são criados (ficam como "sem conta registrada").
 */
export function occurrencesToMaterialize(s: SeriesForGeneration, existing: readonly Commitment[], today: IsoDate): PlannedOccurrence[] {
  if (!s.generating) return [];
  const { floor, top } = generationWindow(today);
  const from = Math.max(s.firstNumber, numberOfMonth(s, floor));
  const to = s.lastNumber === null ? numberOfMonth(s, top) : Math.min(numberOfMonth(s, top), s.lastNumber);
  const live = liveByNumber(s, existing);
  const skipped = new Set(s.skippedNumbers);
  const out: PlannedOccurrence[] = [];
  for (let n = from; n <= to; n++) if (!live.has(n) && !skipped.has(n)) out.push(planned(s, n));
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
  const from = Math.max(s.firstNumber, numberOfMonth(s, fromMonth), maxLive + 1);
  const to = s.lastNumber === null ? numberOfMonth(s, toMonth) : Math.min(numberOfMonth(s, toMonth), s.lastNumber);
  const skipped = new Set(s.skippedNumbers);
  const out: PlannedOccurrence[] = [];
  for (let n = from; n <= to; n++) if (!skipped.has(n)) out.push(planned(s, n));
  return out;
}

/** "Parcela 13 de 48" ou "Todo mês"; null em conta avulsa. */
export function occurrenceLabel(c: Pick<Commitment, 'series'>): string | null {
  if (!c.series) return null;
  return c.series.kind === 'parcelada' ? `Parcela ${c.series.number} de ${c.series.installmentTotal}` : 'Todo mês';
}

/** Vigência do mês atual (limitada ao período da série); sem hoje, a da última conta (ou a mais recente, sem término). */
export function currentTerm(s: SeriesRange, today?: IsoDate): SeriesTerm {
  if (today === undefined) return requireTerm(s, s.lastNumber === null ? Number.MAX_SAFE_INTEGER : Math.max(s.firstNumber, s.lastNumber));
  let n = Math.max(s.firstNumber, numberOfMonth(s, monthOf(today)));
  if (s.lastNumber !== null) n = Math.max(s.firstNumber, Math.min(n, s.lastNumber));
  return requireTerm(s, n);
}

/** "Todo mês, dia 5 · desde outubro de 2026" ou "Parcelamento · financiamento · parcelas 13 a 48". */
export function seriesCaption(s: SeriesRange & Pick<CommitmentSeries, 'kind' | 'nature'>, today?: IsoDate): string {
  if (s.kind === 'parcelada') {
    const head = `Parcelamento · ${SERIES_NATURE_SHORT[s.nature]}`;
    const last = s.lastNumber ?? s.firstNumber;
    return last < s.firstNumber ? `${head} · encerrado antes da parcela ${s.firstNumber}` : `${head} · parcelas ${s.firstNumber} a ${last}`;
  }
  const head = `Todo mês, dia ${currentTerm(s, today).dueDay}`;
  if (s.lastNumber === null) return `${head} · desde ${formatMonthYearBR(s.firstDueMonth)}`;
  if (s.lastNumber < s.firstNumber) return `${head} · encerrado antes da primeira conta`;
  return `${head} · ${formatMonthSpanBR(s.firstDueMonth, seriesMonthOf(s, s.lastNumber))}`;
}

/** Histórico de valores (vigências vivas): "R$ 2.500,00 de outubro a dezembro de 2026" · "R$ 2.650,00 a partir de janeiro de 2027". */
export function termHistory(s: SeriesRange): { term: SeriesTerm; fromMonth: IsoMonth; toMonth: IsoMonth | null; text: string }[] {
  const terms = [...s.terms].sort((a, b) => a.fromNumber - b.fromNumber);
  return terms
    .map((term, i) => {
      const next = terms[i + 1];
      const untilNext = next ? next.fromNumber - 1 : null;
      const lastN = untilNext === null ? s.lastNumber : s.lastNumber === null ? untilNext : Math.min(untilNext, s.lastNumber);
      const fromMonth = seriesMonthOf(s, term.fromNumber);
      const toMonth = lastN === null ? null : seriesMonthOf(s, lastN);
      const amount = `${formatBRL(term.amountCents)}${term.amountMode === 'variavel' ? ' (estimado)' : ''}`;
      const when = toMonth === null ? `a partir de ${formatMonthYearBR(fromMonth)}` : formatMonthSpanBR(fromMonth, toMonth);
      return { term, fromMonth, toMonth, text: `${amount} ${when}` };
    })
    .filter((h) => h.toMonth === null || h.toMonth >= h.fromMonth);
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
  s: SeriesRange &
    Pick<CommitmentSeries, 'id' | 'skippedNumbers' | 'installmentTotal'> &
    Partial<Pick<CommitmentSeries, 'paidCount' | 'openCount'>>,
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
  const current = numberOfMonth(s, monthOf(today));
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
  s: SeriesShape & Pick<CommitmentSeries, 'id' | 'lastNumber' | 'skippedNumbers'> & Partial<Pick<CommitmentSeries, 'paidCount' | 'openCount'>>,
  occurrences: readonly Commitment[],
  today: IsoDate,
): { number: number; month: IsoMonth }[] {
  const live = liveByNumber(s, occurrences);
  const skipped = new Set(s.skippedNumbers);
  const current = numberOfMonth(s, monthOf(today));
  const to = s.lastNumber === null ? current : Math.min(current, s.lastNumber);
  const out: { number: number; month: IsoMonth }[] = [];
  for (let n = knownFrom(s, live); n <= to; n++) if (!live.has(n) && !skipped.has(n)) out.push({ number: n, month: seriesMonthOf(s, n) });
  return out;
}

const refs = (xs: readonly Commitment[]): AffectedRef[] => xs.map((c) => ({ id: c.id, version: c.version }));
const byNumber = (a: Commitment, b: Commitment) => (a.series?.number ?? 0) - (b.series?.number ?? 0);
const contas = (n: number) => (n === 1 ? '1 conta' : `${n} contas`);

/** "a", "a e b", "a, b e c". */
function joinList(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} e ${items[items.length - 1]}`;
}

const monthOfDue = (c: Commitment) => formatMonthName(monthOf(c.dueOn));

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
  const reasonText = { paga: 'paga', alterada: 'alterada só para aquele mês', anterior: 'antes do mês escolhido' };
  const parts = [
    changing.length ? `Vão mudar: ${joinList(changing.map((c) => `${monthOfDue(c)} (${formatDayMonth(c.dueOn)})`))}.` : null,
    unchanged.length ? `Não mudam: ${joinList(unchanged.map((u) => `${monthOfDue(u.commitment)} (${reasonText[u.reason]})`))}.` : null,
    'As contas criadas depois já seguem o novo valor.',
    chosen?.seriesOverride
      ? `A conta de ${monthOfDue(chosen)} tinha sido alterada só para aquele mês (${formatBRL(chosen.amountCents)}) e passa a seguir o novo valor.`
      : null,
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
    const where = last < s.firstNumber ? '' : ` depois de ${formatMonthName(seriesMonthOf(s, last))}`;
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
 * das até 3 ocorrências pagas de maior número. 165,30 + 180,00 + 171,90 → R$ 172,40.
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

/** Por mês, se os valores não mudarem: soma das vigências atuais dos gastos fixos não encerrados. */
export function seriesMonthlyTotal(
  list: readonly (SeriesRange & Pick<CommitmentSeries, 'kind'>)[],
  today: IsoDate,
): { totalCents: Cents; estimatedCents: Cents } {
  let totalCents = 0;
  let estimatedCents = 0;
  for (const s of list) {
    if (seriesEnded(s, today)) continue;
    const t = currentTerm(s, today);
    totalCents += t.amountCents;
    if (t.amountMode === 'variavel') estimatedCents += t.amountCents;
  }
  return { totalCents, estimatedCents };
}

/** Série virtual de um cadastro ainda não salvo. */
function seriesFromInput(input: SeriesInput): SeriesForGeneration {
  const firstNumber = input.kind === 'mensal' ? 1 : input.firstNumber;
  const lastNumber =
    input.kind === 'parcelada'
      ? input.installmentTotal
      : input.lastMonth === null
        ? null
        : 1 + monthsBetween(input.firstDueMonth, input.lastMonth);
  const term: SeriesTerm = {
    fromNumber: firstNumber,
    description: input.description,
    category: input.category,
    amountCents: input.amountCents,
    amountMode: input.amountMode,
    dueDay: input.dueDay,
  };
  return { id: '', firstDueMonth: input.firstDueMonth, firstNumber, lastNumber, terms: [term], skippedNumbers: [], generating: true };
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
}

/** Prévia do formulário de série. O cadastro precisa estar validado (validateSeriesDraft). */
export function seriesPreview(input: SeriesInput, today: IsoDate): SeriesPreview {
  const s = seriesFromInput(input);
  const variable = input.amountMode === 'variavel';
  const money = (cents: Cents) => (variable ? `cerca de ${formatBRL(cents)}` : formatBRL(cents));
  const lastN = s.lastNumber;
  const count = lastN === null ? null : lastN - s.firstNumber + 1;
  const nextTo = lastN === null ? s.firstNumber + 2 : Math.min(lastN, s.firstNumber + 2);
  const next: PlannedOccurrence[] = [];
  for (let n = s.firstNumber; n <= nextTo; n++) next.push(planned(s, n));
  const createdNow = occurrencesToMaterialize(s, [], today);
  const lastDueOn = lastN === null ? null : seriesDueOn(s, lastN);
  const firstMonth = input.firstDueMonth;
  const lastMonth = lastN === null ? null : seriesMonthOf(s, lastN);
  const totalCents = count === null ? null : count * input.amountCents;
  const lines = next.map((o) => `${formatDateBR(o.dueOn)} · ${money(o.amountCents)}${variable ? ' (estimado)' : ''}`);

  let text: string;
  if (input.kind === 'parcelada') {
    const first = next[0]!;
    const sum = `Soma das ${count} parcelas: ${money(totalCents!)}. Não é o valor para quitar.`;
    text =
      count === 1
        ? `Parcela ${s.firstNumber} de ${input.installmentTotal}: ${money(input.amountCents)}, em ${formatDateBR(first.dueOn)}. Não é o valor para quitar.`
        : `Parcelas ${s.firstNumber} a ${lastN} de ${money(input.amountCents)}, todo dia ${input.dueDay}, de ${formatDateBR(first.dueOn)} a ${formatDateBR(lastDueOn!)}. ${sum}`;
  } else {
    const amount = variable ? `${money(input.amountCents)} (estimado)` : money(input.amountCents);
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
  };
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
    const when = dueOn < today ? `venceu em ${formatDayMonth(dueOn)}` : dueOn === today ? 'vence hoje' : `vence em ${formatDayMonth(dueOn)}`;
    return { month, dueOn, label: `${name.charAt(0).toUpperCase()}${name.slice(1)} (${when})`, isDefault: false };
  });
  const def = choices.find((c) => c.dueOn >= today) ?? choices[choices.length - 1]!;
  def.isDefault = true;
  return choices;
}

export interface SeriesConflicts {
  /** Gasto anotado no primeiro mês com a mesma descrição. */
  record: FinancialRecord | null;
  /** Conta a pagar avulsa no primeiro mês com a mesma descrição. */
  commitment: Commitment | null;
  /** Gasto fixo com a mesma descrição que ainda tem contas a partir do primeiro mês. */
  similar: CommitmentSeries | null;
  /** Mês seguinte ao primeiro ("Começar em novembro"). */
  suggestedFirstMonth: IsoMonth;
  texts: { record: string | null; commitment: string | null; similar: string | null; startNext: string };
}

const sameText = (text: string) => text.trim().toLocaleLowerCase('pt-BR');

/**
 * Avisos contra contar duas vezes no formulário de série. Descrições comparadas sem caixa e sem espaços nas pontas.
 * records e commitments: do mês da primeira conta; series: do contexto.
 */
export function findSeriesConflicts(
  preview: Pick<SeriesPreview, 'input' | 'firstMonth'>,
  commitments: readonly Commitment[],
  records: readonly FinancialRecord[],
  series: readonly CommitmentSeries[],
): SeriesConflicts {
  const name = sameText(preview.input.description);
  const month = preview.firstMonth;
  const next = addMonths(month, 1);
  const nextName = formatMonthName(next);
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
  return {
    record,
    commitment,
    similar,
    suggestedFirstMonth: next,
    texts: {
      record: record
        ? `Você já anotou o gasto ${record.description} em ${formatDayMonth(record.occurredOn)} (${formatBRL(record.amountCents)}). Para não contar duas vezes, o gasto fixo pode começar em ${nextName}.`
        : null,
      commitment: commitment
        ? `Você já tem a conta a pagar ${commitment.description} com vencimento em ${formatDayMonth(commitment.dueOn)}. Começar a repetição em ${nextName}?`
        : null,
      similar: similar ? `Você já tem o gasto fixo ${similarName}. Quer cadastrar outro mesmo assim?` : null,
      startNext: `Começar em ${nextName}`,
    },
  };
}
