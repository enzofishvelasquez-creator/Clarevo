import type { IsoDate, IsoMonth } from './dates';
import {
  addMonths,
  dateInMonth,
  daysBetween,
  formatDateBR,
  formatDayMonth,
  formatMonthBR,
  formatMonthName,
  formatMonthSpanBR,
  formatMonthYearBR,
  monthOf,
  monthsBetween,
} from './dates';
import type { Cents } from './money';
import { formatBRL } from './money';
import type {
  Commitment,
  CommitmentSeries,
  CommitmentSeriesRef,
  FinancialRecord,
  MonthOverview,
  RecordKind,
  ReturnDecision,
  ReturnReviewState,
  SeriesKind,
} from './records';
import { annualYearLabelOf, numberAtOrAfter, numberAtOrBefore, occurrenceLabel, seriesMonthOf, termFor } from './series';
import type { RecordsRepository } from './repository';
import type { MonthSummary } from './summary';
import { ERROR_TEXT, PAYMENT_ERROR_TEXT } from './validation';

/**
 * Ciclo A4 · Seus últimos meses (D-030): revisão oferecida depois de um tempo sem anotar. Regras puras, sem Date local,
 * repetidas no banco (clarevo_long_absence, clarevo_track_activity, create_series_occurrence, decide_return_review e
 * months_overview).
 *
 * - Ausência longa entre os dias a < b: b − a ≥ 45 dias ou meses(mês(a), mês(b)) ≥ 2 (um mês inteiro sem anotação).
 * - A revisão aparece enquanto durar a ausência ("ausencia") ou por 14 dias contando o dia da volta ("volta"), e some
 *   com uma decisão posterior à âncora. Cobre os meses fechados desde o mês da âncora (no máximo os 11 anteriores ao
 *   atual, e depois do último mês já revisado) e as contas em aberto do mês atual vencidas antes de hoje.
 * - Nada é preenchido por média ou estimativa; nenhuma conta vira paga sem confirmação. Os textos não contam dias nem
 *   falam de ausência, e nunca cobram.
 */

/** Dias sem anotação a partir dos quais a ausência é longa (P-021; igual ao banco). */
export const ABSENCE_MIN_DAYS = 45;
/** Meses fechados no máximo, os anteriores ao atual (igual a create_series_occurrence e decide_return_review). */
export const REVIEW_MAX_CLOSED_MONTHS = 11;
/** Dias de faixa depois da volta, contando o dia da volta (P-021). */
export const RETURN_NOTICE_DAYS = 14;
/** Tema de Aprender que explica o mês sem registro (catálogo do A5): /explicacao/sem-registro. */
export const RETURN_TOPIC_SLUG = 'sem-registro';

/** Ausência longa entre a última anotação `from` e o dia `to` (clarevo_long_absence). Mesma data ou anterior: false. */
export function isLongAbsence(from: IsoDate, to: IsoDate): boolean {
  return to > from && (daysBetween(from, to) >= ABSENCE_MIN_DAYS || monthsBetween(monthOf(from), monthOf(to)) >= 2);
}

/** Último mês fechado (mês anterior ao de hoje): reviewedThrough de decideReturnReview. */
export function lastClosedMonth(today: IsoDate): IsoMonth {
  return addMonths(monthOf(today), -1);
}

/** Mês aceito por createSeriesOccurrence: um dos 11 meses fechados anteriores ao atual. */
export function isReviewableMonth(month: IsoMonth, today: IsoDate): boolean {
  const current = monthOf(today);
  return month < current && month >= addMonths(current, -REVIEW_MAX_CLOSED_MONTHS);
}

/** Período da revisão ativa. */
export interface ReturnWindow {
  /** 'ausencia': ainda sem anotar. 'volta': já voltou a anotar, há até 13 dias. */
  kind: 'ausencia' | 'volta';
  /** Último dia com anotação antes da ausência. */
  anchor: IsoDate;
  /** Volta: primeiro dia com anotação depois da ausência. null na ausência. */
  returnedOn: IsoDate | null;
  /** Primeiro mês fechado do resumo: max(mês da âncora, mês seguinte ao já revisado, mês atual − 11). */
  fromMonth: IsoMonth;
  /** Último mês fechado (mês anterior ao atual). fromMonth > toMonth: nenhum mês fechado, só as vencidas deste mês. */
  toMonth: IsoMonth;
  /** Mês atual: as contas em aberto dele vencidas antes de hoje entram em "Este mês". */
  currentMonth: IsoMonth;
  /** Primeiro mês do resumo quando o limite de 11 meses deixou meses de fora; null quando não deixou. */
  cutBefore: IsoMonth | null;
}

/**
 * Revisão ativa hoje, ou null (D-030):
 * 1. Âncora: "ausencia" quando a última anotação é de uma ausência longa até hoje; senão "volta" quando a última
 *    ausência terminou há no máximo 13 dias (14 dias contando o dia da volta); senão nada. Sem atividade, nada.
 * 2. Decisão com decidedOn depois da âncora esconde; no mesmo dia da âncora, não (é de uma ausência anterior).
 * 3. Período: de max(mês(âncora), reviewedThrough + 1, mês(hoje) − 11) ao mês anterior ao atual.
 * A faixa só aparece se buildReturnReview achar algo (isEmpty false).
 */
export function returnWindow(state: ReturnReviewState, today: IsoDate): ReturnWindow | null {
  const a = state.activity;
  if (!a) return null;
  let kind: ReturnWindow['kind'];
  let anchor: IsoDate;
  let returnedOn: IsoDate | null;
  if (isLongAbsence(a.lastWriteOn, today)) {
    kind = 'ausencia';
    anchor = a.lastWriteOn;
    returnedOn = null;
  } else if (a.absenceFromOn !== null && a.absenceUntilOn !== null && daysBetween(a.absenceUntilOn, today) <= RETURN_NOTICE_DAYS - 1) {
    kind = 'volta';
    anchor = a.absenceFromOn;
    returnedOn = a.absenceUntilOn;
  } else {
    return null;
  }
  const mark = state.mark;
  if (mark && mark.decidedOn > anchor) return null;
  const currentMonth = monthOf(today);
  const cap = addMonths(currentMonth, -REVIEW_MAX_CLOSED_MONTHS);
  const anchorMonth = monthOf(anchor);
  const afterMark = mark ? addMonths(mark.reviewedThrough, 1) : null;
  let fromMonth = anchorMonth;
  if (afterMark !== null && afterMark > fromMonth) fromMonth = afterMark;
  if (cap > fromMonth) fromMonth = cap;
  const cutBefore = cap > anchorMonth && (afterMark === null || cap > afterMark) ? cap : null;
  return { kind, anchor, returnedOn, fromMonth, toMonth: addMonths(currentMonth, -1), currentMonth, cutBefore };
}

/** 'sem_conta': número da série sem conta registrada. 'aberta': conta em aberto (de série ou avulsa). */
export type ReviewRowState = 'sem_conta' | 'aberta';

/** Uma conta a conferir na revisão. */
export interface ReviewRow {
  /** Chave estável: "serie:<id da série>:<número>" (sem conta registrada) ou "conta:<id da conta>" (em aberto). */
  key: string;
  state: ReviewRowState;
  /** Mês do vencimento. */
  month: IsoMonth;
  /** Vencimento: o da conta em aberto, ou o calculado pela série com a vigência do número. */
  dueOn: IsoDate;
  description: string;
  category: string | null;
  /** Previsto: o da conta em aberto ou o da vigência do número. */
  amountCents: Cents;
  amountIsEstimate: boolean;
  /** Série e número (como Commitment.series); null na conta avulsa. */
  series: CommitmentSeriesRef | null;
  /** Versão atual da série (expectedSeriesVersion de createSeriesOccurrence); null na conta avulsa. */
  seriesVersion: number | null;
  /** A conta em aberto; null em "sem conta registrada". */
  commitment: Commitment | null;
  /** "Parcela 10 de 48", "Parcela 3 de 10 de 2027" ou "Conta do ano de 2027"; null no gasto fixo mensal e na avulsa. */
  label: string | null;
}

const seriesRefOf = (s: CommitmentSeries, n: number): CommitmentSeriesRef => ({
  id: s.id,
  number: n,
  kind: s.kind,
  nature: s.nature,
  installmentTotal: s.installmentTotal,
  partsPerYear: s.partsPerYear,
});

const labelOf = (series: CommitmentSeriesRef | null, dueOn: IsoDate): string | null =>
  series === null || series.kind === 'mensal' ? null : occurrenceLabel({ series, dueOn });

/**
 * Números da série sem conta registrada nos meses de `from` a `to`: de numberAtOrAfter(from) a numberAtOrBefore(to),
 * limitados a [firstNumber, lastNumber], sem ocorrência viva e sem marca "excluída só neste mês". Valor, dia, descrição e
 * marca de estimado vêm da vigência do número. `occurrences`: listCommitmentsDueBetween do período (abertas e pagas),
 * nunca listSeriesOccurrences, que traz só as 60 mais recentes.
 */
export function seriesGapsInRange(
  s: CommitmentSeries,
  occurrences: readonly Commitment[],
  from: IsoMonth,
  to: IsoMonth,
): ReviewRow[] {
  if (from > to) return [];
  const lo = Math.max(s.firstNumber, numberAtOrAfter(s, from));
  let hi = numberAtOrBefore(s, to);
  if (s.lastNumber !== null) hi = Math.min(hi, s.lastNumber);
  const live = new Set<number>();
  for (const c of occurrences) if (c.series && c.series.id === s.id) live.add(c.series.number);
  const skipped = new Set(s.skippedNumbers);
  const out: ReviewRow[] = [];
  for (let n = lo; n <= hi; n++) {
    if (live.has(n) || skipped.has(n)) continue;
    const t = termFor(s.terms, n);
    if (!t) throw new Error('serie_inconsistente'); // S5: sempre existe vigência em firstNumber
    const month = seriesMonthOf(s, n);
    const dueOn = dateInMonth(month, t.dueDay);
    const series = seriesRefOf(s, n);
    out.push({
      key: `serie:${s.id}:${n}`,
      state: 'sem_conta',
      month,
      dueOn,
      description: t.description,
      category: t.category,
      amountCents: t.amountCents,
      amountIsEstimate: t.amountMode === 'variavel',
      series,
      seriesVersion: s.version,
      commitment: null,
      label: labelOf(series, dueOn),
    });
  }
  return out;
}

function openRow(c: Commitment, seriesVersion: number | null): ReviewRow {
  return {
    key: `conta:${c.id}`,
    state: 'aberta',
    month: monthOf(c.dueOn),
    dueOn: c.dueOn,
    description: c.description,
    category: c.category,
    amountCents: c.amountCents,
    amountIsEstimate: c.amountIsEstimate,
    series: c.series,
    seriesVersion,
    commitment: c,
    label: labelOf(c.series, c.dueOn),
  };
}

/** Duas ou mais linhas da mesma conta do ano, do mesmo ano e na mesma situação, nos meses fechados. */
export interface ReviewAnnualGroup {
  /** "ano:<id da série>:<índice do ano>:<situação>" */
  key: string;
  seriesId: string;
  /** Índice do ano na série (0 = ano da parcela 1). */
  index: number;
  /** "2027" ou "2026/2027". */
  label: string;
  description: string;
  state: ReviewRowState;
  /** Por vencimento. */
  rows: ReviewRow[];
  /** Número de uma parcela do ano (a primeira do grupo): o `number` de affectedByYear e skipSeriesYear. */
  number: number;
  /** "IPTU de 2027" */
  title: string;
  /** "IPTU de 2027 · 5 parcelas sem conta registrada" ou "IPTU de 2027 · 2 parcelas em aberto" */
  text: string;
  /** "IPTU de 2027, 5 parcelas sem conta registrada, de 10/07/2027 a 10/11/2027" */
  a11yLabel: string;
}

/** O que o passo mostra em "Gastos fixos, parcelamentos e contas do ano". */
export type ReviewItem = { type: 'linha'; row: ReviewRow } | { type: 'ano'; group: ReviewAnnualGroup };

/** Um mês fechado da revisão. */
export interface ReviewMonth {
  month: IsoMonth;
  /** Recebimentos e gastos anotados no mês. */
  overview: MonthOverview;
  /** Todas as linhas com vencimento no mês (contas de série em aberto, sem conta registrada e avulsas em aberto). */
  rows: ReviewRow[];
  /**
   * Linhas de série a mostrar no mês, com os grupos de conta do ano. O grupo fica no mês da primeira linha dele e
   * leva as linhas dos meses seguintes (que não se repetem nesses meses).
   */
  items: ReviewItem[];
  /** "Outras contas vencidas": avulsas em aberto com vencimento no mês. */
  loose: ReviewRow[];
  /** "Com algo sem registro": sem recebimento anotado, sem gasto anotado ou com número de série sem conta registrada. */
  missing: boolean;
  /** Entra nos passos de "Atualizar agora": sem recebimento ou gasto anotado, ou com algo a mostrar (items ou loose). */
  toCheck: boolean;
}

/** Mês atual na revisão: só as contas em aberto vencidas antes de hoje. */
export interface ReviewCurrent {
  month: IsoMonth;
  /** Todas (de série e avulsas), por vencimento. */
  rows: ReviewRow[];
  /** As de série, como linhas (sem grupos). */
  items: ReviewItem[];
  /** As avulsas. */
  loose: ReviewRow[];
}

/** Um passo de "Atualizar agora": os meses com algo a conferir, do mais antigo ao mais recente, e por fim "Este mês". */
export interface ReviewStep {
  month: IsoMonth;
  current: boolean;
}

export interface ReturnReview {
  window: ReturnWindow;
  /** Meses fechados de window.fromMonth a window.toMonth, do mais antigo ao mais recente. */
  months: ReviewMonth[];
  current: ReviewCurrent;
  counts: {
    /** Meses fechados "com algo sem registro" (ReviewMonth.missing). */
    monthsWithGaps: number;
    /** Contas para conferir: todas as linhas dos meses fechados e as vencidas deste mês (cada parcela conta uma). */
    billsToCheck: number;
  };
  steps: ReviewStep[];
  /** Nada a conferir: sem faixa, e /retomar mostra "Nada para conferir". */
  isEmpty: boolean;
}

const zeroOverview = (month: IsoMonth): MonthOverview => ({ month, receivedCount: 0, receivedCents: 0, paidCount: 0, paidCents: 0 });

/** Meses de from a to (vazio quando from > to). */
function monthList(from: IsoMonth, to: IsoMonth): IsoMonth[] {
  const n = monthsBetween(from, to);
  const out: IsoMonth[] = [];
  for (let i = 0; i <= n; i++) out.push(addMonths(from, i));
  return out;
}

/**
 * Resumo mês a mês da revisão (2.2 da especificação):
 * - overview: monthsOverview(window.fromMonth, window.toMonth) (mês ausente vale zero);
 * - commitments: listCommitmentsDueBetween(window.fromMonth, window.currentMonth), abertas e pagas;
 * - series: listSeries (inclusive encerradas).
 * Por mês fechado: contas de série em aberto, números sem conta registrada e avulsas em aberto. Mês atual: só as em
 * aberto vencidas antes de hoje. Contas do ano com 2 ou mais linhas da mesma série, do mesmo ano e na mesma situação
 * viram um grupo, no mês da primeira linha.
 */
export function buildReturnReview(
  window: ReturnWindow,
  overview: readonly MonthOverview[],
  commitments: readonly Commitment[],
  series: readonly CommitmentSeries[],
  today: IsoDate,
): ReturnReview {
  const { fromMonth, toMonth, currentMonth } = window;
  const order = new Map(series.map((s, i) => [s.id, i]));
  const versionOf = new Map(series.map((s) => [s.id, s.version]));
  const closed: ReviewRow[] = [];
  const currentRows: ReviewRow[] = [];
  if (fromMonth <= toMonth) for (const s of series) closed.push(...seriesGapsInRange(s, commitments, fromMonth, toMonth));
  for (const c of commitments) {
    if (c.status !== 'aberto') continue;
    const m = monthOf(c.dueOn);
    const row = () => openRow(c, c.series ? (versionOf.get(c.series.id) ?? null) : null);
    if (m >= fromMonth && m <= toMonth) closed.push(row());
    else if (m === currentMonth && c.dueOn < today) currentRows.push(row());
  }
  const rank = (r: ReviewRow) => (r.series ? (order.get(r.series.id) ?? series.length) : series.length + 1);
  const byDue = (a: ReviewRow, b: ReviewRow) =>
    a.dueOn.localeCompare(b.dueOn) || rank(a) - rank(b) || (a.series?.number ?? 0) - (b.series?.number ?? 0) || a.key.localeCompare(b.key);
  closed.sort(byDue);
  currentRows.sort(byDue);

  // Grupos de conta do ano nos meses fechados.
  const groupKey = (r: ReviewRow) => {
    if (!r.series || r.series.kind !== 'anual') return null;
    const k = r.series.partsPerYear ?? 1;
    return `ano:${r.series.id}:${Math.floor((r.series.number - 1) / k)}:${r.state}`;
  };
  const members = new Map<string, ReviewRow[]>();
  for (const r of closed) {
    const key = groupKey(r);
    if (key !== null) members.set(key, [...(members.get(key) ?? []), r]);
  }
  const itemsByMonth = new Map<IsoMonth, ReviewItem[]>();
  const pushItem = (month: IsoMonth, item: ReviewItem) => itemsByMonth.set(month, [...(itemsByMonth.get(month) ?? []), item]);
  const placed = new Set<string>();
  for (const r of closed) {
    if (!r.series) continue;
    const key = groupKey(r);
    const group = key === null ? undefined : members.get(key);
    if (!group || group.length < 2) {
      pushItem(r.month, { type: 'linha', row: r });
      continue;
    }
    if (placed.has(key!)) continue;
    placed.add(key!);
    pushItem(r.month, { type: 'ano', group: annualGroup(key!, group) });
  }

  const months: ReviewMonth[] = monthList(fromMonth, toMonth).map((month) => {
    const ov = overview.find((o) => o.month === month) ?? zeroOverview(month);
    const rows = closed.filter((r) => r.month === month);
    const items = itemsByMonth.get(month) ?? [];
    const loose = rows.filter((r) => r.series === null);
    const noRecords = ov.receivedCount === 0 || ov.paidCount === 0;
    return {
      month,
      overview: ov,
      rows,
      items,
      loose,
      missing: noRecords || rows.some((r) => r.state === 'sem_conta'),
      toCheck: noRecords || items.length > 0 || loose.length > 0,
    };
  });
  const current: ReviewCurrent = {
    month: currentMonth,
    rows: currentRows,
    items: currentRows.filter((r) => r.series !== null).map((row): ReviewItem => ({ type: 'linha', row })),
    loose: currentRows.filter((r) => r.series === null),
  };
  const counts = { monthsWithGaps: months.filter((m) => m.missing).length, billsToCheck: closed.length + currentRows.length };
  const steps: ReviewStep[] = months.filter((m) => m.toCheck).map((m) => ({ month: m.month, current: false }));
  if (currentRows.length > 0) steps.push({ month: currentMonth, current: true });
  return { window, months, current, counts, steps, isEmpty: counts.monthsWithGaps === 0 && counts.billsToCheck === 0 };
}

function annualGroup(key: string, rows: ReviewRow[]): ReviewAnnualGroup {
  const first = rows[0]!;
  const last = rows[rows.length - 1]!;
  const ref = first.series!;
  const k = ref.partsPerYear ?? 1;
  const label = annualYearLabelOf({ series: ref, dueOn: first.dueOn })!;
  const title = `${first.description} de ${label}`;
  const what = RETURN_TEXT.groupState(rows.length, first.state);
  return {
    key,
    seriesId: ref.id,
    index: Math.floor((ref.number - 1) / k),
    label,
    description: first.description,
    state: first.state,
    rows,
    number: ref.number,
    title,
    text: `${title} · ${what}`,
    a11yLabel: `${first.description} de ${label.replace('/', ' a ')}, ${what}, de ${formatDateBR(first.dueOn)} a ${formatDateBR(last.dueOn)}`,
  };
}

/** Ações de uma linha (2.2): sem conta registrada, "Já paguei", "Não houve" e "Ainda não paguei"; em aberto, "Já paguei" e "Não houve". Parcela nunca tem "Não houve". */
export type ReviewAction = 'ja_paguei' | 'nao_houve' | 'ainda_nao_paguei';

/**
 * - Sem conta registrada: "Já paguei" (createSeriesOccurrence 'aberta' e payCommitment), "Não houve"
 *   (createSeriesOccurrence 'nao_houve') e "Ainda não paguei" (createSeriesOccurrence 'aberta').
 * - Em aberto, de série ou avulsa: "Já paguei" (payCommitment) e "Não houve" (deleteCommitment; em série, exclusão só
 *   daquele mês, que não volta).
 * - Parcela de parcelamento: sem "Não houve" (parcela não paga continua devida; quem precisar exclui no detalhe da conta).
 */
export function rowActions(row: ReviewRow): ReviewAction[] {
  // Fatura de cartão: sem "Já paguei" nem "Não houve" (pay_commitment e delete_commitment recusam); a tela abre a fatura.
  if (row.commitment?.invoice) return [];
  const installment = row.series?.kind === 'parcelada';
  if (row.state === 'sem_conta') return installment ? ['ja_paguei', 'ainda_nao_paguei'] : ['ja_paguei', 'nao_houve', 'ainda_nao_paguei'];
  return installment ? ['ja_paguei'] : ['ja_paguei', 'nao_houve'];
}

/** Grupo de conta do ano em aberto: "Não houve em 2027" (skipSeriesYear com affectedByYear(…, 'tirar')). */
export type ReviewGroupAction = 'nao_houve_ano';

export function groupActions(group: ReviewAnnualGroup): ReviewGroupAction[] {
  return group.state === 'aberta' ? ['nao_houve_ano'] : [];
}

/** Marcação em lote "pagas no vencimento": só valor fixo (estimada fica de fora). */
export function batchEligible(row: ReviewRow): boolean {
  return !row.amountIsEstimate && !row.commitment?.invoice;
}

/**
 * Preenchimento de "Já paguei": data do vencimento e categoria da conta ou da vigência; valor previsto só quando fixo
 * (estimado abre vazio, com a dica da estimativa). A conta de saída fica a cargo da tela.
 */
export function rowPaymentDraft(row: ReviewRow): { amountCents: Cents | null; paidOn: IsoDate; category: string | null } {
  return { amountCents: row.amountIsEstimate ? null : row.amountCents, paidOn: row.dueOn, category: row.category };
}

const sameText = (text: string) => text.trim().toLocaleLowerCase('pt-BR');

/**
 * Gasto já anotado no mês da linha com a mesma descrição (sem caixa e sem espaços nas pontas) e sem conta vinculada:
 * aviso contra contar duas vezes. `records`: listRecords do mês da linha.
 */
export function looseExpenseFor(row: ReviewRow, records: readonly FinancialRecord[]): FinancialRecord | null {
  const name = sameText(row.description);
  return (
    records.find((r) => r.kind === 'despesa' && r.commitmentId === null && monthOf(r.occurredOn) === row.month && sameText(r.description) === name) ??
    null
  );
}

/** Modo "Dia": número de série sem conta registrada no mês com a mesma descrição do gasto que a pessoa está anotando. */
export function seriesGapForExpense(review: ReturnReview, month: IsoMonth, description: string): ReviewRow | null {
  const name = sameText(description);
  if (name === '') return null;
  const m = review.months.find((x) => x.month === month);
  return m?.rows.find((r) => r.state === 'sem_conta' && sameText(r.description) === name) ?? null;
}

export type DayError = 'dia_obrigatorio' | 'dia_invalido';

/** Último dia do mês. */
const lastDay = (month: IsoMonth) => Number(dateInMonth(month, 31).slice(8, 10));

/** Campo "Dia" do formulário no modo "Dia" (mês fechado já escolhido): "1" em junho de 2026 dá "2026-06-01". */
export function dayInMonthDate(month: IsoMonth, dayText: string): { date: IsoDate } | { error: DayError } {
  const t = dayText.trim();
  if (t === '') return { error: 'dia_obrigatorio' };
  if (!/^\d{1,2}$/.test(t)) return { error: 'dia_invalido' };
  const d = Number(t);
  if (d < 1 || d > lastDay(month)) return { error: 'dia_invalido' };
  return { date: `${month}-${String(d).padStart(2, '0')}` };
}

export function dayErrorText(code: DayError, month: IsoMonth): string {
  return code === 'dia_obrigatorio' ? RETURN_TEXT.dayRequired : RETURN_TEXT.dayInvalid(month);
}

/**
 * Linha a mais no cabeçalho do Resumo, só para meses fechados: "Nada anotado em junho.", "Nenhum recebimento anotado
 * em agosto." ou "Nenhum gasto anotado em agosto."; null no mês atual, nos seguintes e quando há os dois.
 */
export function emptyMonthCaption(summary: Pick<MonthSummary, 'composition'>, month: IsoMonth, currentMonth: IsoMonth): string | null {
  if (month >= currentMonth) return null;
  const received = summary.composition.received.length > 0;
  const paid = summary.composition.paid.length > 0;
  if (!received && !paid) return RETURN_TEXT.nothingNoted(month);
  if (!received) return RETURN_TEXT.noReceiptsNoted(month);
  if (!paid) return RETURN_TEXT.noExpensesNoted(month);
  return null;
}

/**
 * Recebimentos e gastos por mês, de from a to (months_overview): registros realizados do contexto pela data. Os
 * registros vêm sem os excluídos.
 */
export function monthsOverview(records: readonly FinancialRecord[], contextId: string, from: IsoMonth, to: IsoMonth): MonthOverview[] {
  return monthList(from, to).map((month) => {
    const out = zeroOverview(month);
    for (const r of records) {
      if (r.contextId !== contextId || r.status !== 'realizado' || monthOf(r.occurredOn) !== month) continue;
      if (r.kind === 'receita') {
        out.receivedCount += 1;
        out.receivedCents += r.amountCents;
      } else {
        out.paidCount += 1;
        out.paidCents += r.amountCents;
      }
    }
    return out;
  });
}

/**
 * Carga da revisão (useReturnReview): lê a atividade e a marca, aplica returnWindow e, havendo período, busca em paralelo
 * monthsOverview (só com mês fechado no período), listCommitmentsDueBetween(de, mês atual) e listSeries. Chame depois
 * de syncSeriesOccurrences dar certo. review null: nenhuma revisão ativa. review.isEmpty: nada a conferir (sem faixa).
 */
export async function loadReturnReview(
  repo: Pick<RecordsRepository, 'getReturnReviewState' | 'monthsOverview' | 'listCommitmentsDueBetween' | 'listSeries'>,
  contextId: string,
  today: IsoDate,
): Promise<{ state: ReturnReviewState; review: ReturnReview | null }> {
  const state = await repo.getReturnReviewState(contextId);
  const window = returnWindow(state, today);
  if (!window) return { state, review: null };
  const [overview, commitments, series] = await Promise.all([
    window.fromMonth <= window.toMonth ? repo.monthsOverview(contextId, window.fromMonth, window.toMonth) : Promise.resolve([]),
    repo.listCommitmentsDueBetween(contextId, window.fromMonth, window.currentMonth),
    repo.listSeries(contextId),
  ]);
  return { state, review: buildReturnReview(window, overview, commitments, series, today) };
}

/** Versão esperada por decideReturnReview: a da marca, ou 0 quando ainda não existe. */
export function reviewExpectedVersion(state: ReturnReviewState): number {
  return state.mark?.version ?? 0;
}

/** Decisão ao concluir: 'atualizou' se houve alguma ação na sessão, 'seguiu' se não houve. */
export function reviewDecision(acted: boolean): ReturnDecision {
  return acted ? 'atualizou' : 'seguiu';
}

// ---------------------------------------------------------------------------
// Textos (cobertos pelo teste de textos: sem cobrança, sem contar dias, sem falar de ausência).
// ---------------------------------------------------------------------------

const capitalize = (text: string) => `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
const money = (cents: Cents, estimate: boolean) => (estimate ? `cerca de ${formatBRL(cents)}` : formatBRL(cents));
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "a", "a e b", "a, b e c". */
function joinList(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} e ${items[items.length - 1]}`;
}

/** Posições em faixas: [6, 7, 8, 9, 10] → "6 a 10"; [1, 2] → "1 e 2". */
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

/** Nome da série no texto com "em": "no gasto fixo", "no parcelamento", "na conta do ano". */
const KIND_IN: Record<SeriesKind, string> = { mensal: 'no gasto fixo', parcelada: 'no parcelamento', anual: 'na conta do ano' };
const KIND_SUBJECT: Record<SeriesKind, string> = { mensal: 'O gasto fixo', parcelada: 'O parcelamento', anual: 'A conta do ano' };

/**
 * Nome da linha em listas e no lote: "Aluguel", "Financiamento do carro (parcela 10 de 48)", "IPVA de 2027" ou
 * "IPTU (parcela 6 de 10 de 2027)".
 */
export function rowName(row: Pick<ReviewRow, 'description' | 'series' | 'dueOn'>): string {
  const s = row.series;
  if (!s || s.kind === 'mensal') return row.description;
  if (s.kind === 'parcelada') return `${row.description} (parcela ${s.number} de ${s.installmentTotal})`;
  const label = annualYearLabelOf({ series: s, dueOn: row.dueOn });
  const k = s.partsPerYear ?? 1;
  if (k === 1) return `${row.description} de ${label}`;
  return `${row.description} (parcela ${((s.number - 1) % k) + 1} de ${k} de ${label})`;
}

/** Nome curto com o mês, para botões e anúncios: "Aluguel de julho". */
export function rowShortName(row: Pick<ReviewRow, 'description' | 'month'>): string {
  return `${row.description} de ${formatMonthName(row.month)}`;
}

/** Textos novos do Ciclo A4. Funções recebem só dados já calculados; nenhum texto conta dias. */
export const RETURN_TEXT = {
  title: 'Seus últimos meses',

  // Faixa no Resumo.
  monthsPart: (n: number) => plural(n, 'mês com algo sem registro', 'meses com algo sem registro'),
  billsPart: (n: number) => plural(n, 'conta para conferir', 'contas para conferir'),
  /** "Sua última anotação foi em 20/05/2026. Desde então: 4 meses com algo sem registro e 13 contas para conferir." */
  bannerAbsence: (lastWriteOn: IsoDate, counts: string) => `Sua última anotação foi em ${formatDateBR(lastWriteOn)}. Desde então: ${counts}.`,
  /** "Entre 20/05/2026 e 07/10/2026, nada foi anotado. Nesse período: …" */
  bannerReturn: (from: IsoDate, until: IsoDate, counts: string) =>
    `Entre ${formatDateBR(from)} e ${formatDateBR(until)}, nada foi anotado. Nesse período: ${counts}.`,
  bannerNote: 'Atualizar é opcional. Nada é preenchido sem a sua confirmação.',
  seeSummary: 'Ver resumo',
  moveOn: 'Seguir adiante',
  /** Aviso de sucesso depois de "Seguir adiante". */
  movedOn: 'Combinado. Os meses ficam como estão, e você pode anotar datas passadas quando quiser.',
  decideFailed: 'Não foi possível salvar sua escolha. Tente novamente.',
  /** Botão da faixa de contas criadas vencidas em /a-pagar enquanto a faixa do retorno estiver ativa. */
  toPayAction: 'Ver resumo dos últimos meses',

  // /retomar · Seus últimos meses.
  /** "Sua última anotação foi em 20/05/2026. Abaixo, …" */
  openingAbsence: (lastWriteOn: IsoDate, what: string) => `Sua última anotação foi em ${formatDateBR(lastWriteOn)}. Abaixo, ${what}.`,
  openingReturn: (from: IsoDate, until: IsoDate, what: string) =>
    `Entre ${formatDateBR(from)} e ${formatDateBR(until)}, nada foi anotado. Abaixo, ${what}.`,
  /** "o que está registrado de maio a setembro de 2026" */
  openingMonths: (from: IsoMonth, to: IsoMonth) => `o que está registrado ${formatMonthSpanBR(from, to)}`,
  openingCurrent: 'as contas vencidas deste mês',
  note: 'Mês sem anotação não quer dizer mês sem gastos. Aqui aparece só o que está registrado no Clarevo.',
  learnMore: 'Entenda',
  learnMoreA11y: 'Entenda o mês sem registro',
  monthTitle: (month: IsoMonth) => formatMonthBR(month),
  currentTitle: (month: IsoMonth) => `${formatMonthBR(month)} (este mês)`,
  /** "Recebido: R$ 6.000,00 · 1 recebimento" ou "Recebido: nenhum recebimento anotado" */
  received: (o: MonthOverview) =>
    o.receivedCount > 0
      ? `Recebido: ${formatBRL(o.receivedCents)} · ${plural(o.receivedCount, 'recebimento', 'recebimentos')}`
      : 'Recebido: nenhum recebimento anotado',
  paid: (o: MonthOverview) =>
    o.paidCount > 0 ? `Pago: ${formatBRL(o.paidCents)} · ${plural(o.paidCount, 'gasto', 'gastos')}` : 'Pago: nenhum gasto anotado',
  /** "Contas em aberto: 3 · R$ 3.530,00 · inclui R$ 180,00 estimados" */
  openBills: (count: number, totalCents: Cents, estimatedCents: Cents) =>
    `Contas em aberto: ${count} · ${formatBRL(totalCents)}${estimatedCents > 0 ? ` · inclui ${formatBRL(estimatedCents)} estimados` : ''}`,
  /** "Sem conta registrada: Aluguel · Luz · Financiamento do carro (parcela 10 de 48)" */
  gapBills: (names: readonly string[]) => `Sem conta registrada: ${names.join(' · ')}`,
  /** "5 parcelas sem conta registrada" ou "2 parcelas em aberto" (linha do grupo de conta do ano). */
  groupState: (n: number, state: ReviewRowState) =>
    state === 'sem_conta' ? `${plural(n, 'parcela', 'parcelas')} sem conta registrada` : `${plural(n, 'parcela', 'parcelas')} em aberto`,
  /** "Outras contas vencidas: 1 · R$ 150,00" */
  looseBills: (count: number, totalCents: Cents) => `Outras contas vencidas: ${count} · ${formatBRL(totalCents)}`,
  nothingToCheck: 'Nenhuma conta para conferir.',
  /** "1 conta vencida em aberto: Aluguel, R$ 2.500,00, venceu em 05/10." */
  currentOne: (row: Pick<ReviewRow, 'description' | 'amountCents' | 'amountIsEstimate' | 'dueOn'>) =>
    `1 conta vencida em aberto: ${row.description}, ${money(row.amountCents, row.amountIsEstimate)}, venceu em ${formatDayMonth(row.dueOn)}.`,
  /** "3 contas vencidas em aberto: Aluguel, Financiamento do carro e Luz." */
  currentMany: (names: readonly string[]) => `${names.length} contas vencidas em aberto: ${joinList(names)}.`,
  /** "Meses antes de novembro de 2025 não entram neste resumo." */
  cut: (month: IsoMonth) => `Meses antes de ${formatMonthYearBR(month)} não entram neste resumo.`,
  updateNow: 'Atualizar agora',
  moveOnHint: 'Seguir adiante não apaga nem cria nada. Os meses continuam sem registro, e as contas em aberto continuam em Contas a pagar.',
  emptyTitle: 'Nada para conferir',
  emptyBody: 'Os meses desde a sua última anotação já estão registrados.',
  backToSummary: 'Voltar ao Resumo',
  loadFailed: 'Não foi possível carregar o resumo dos últimos meses.',
  retry: 'Tentar novamente',

  // /retomar/atualizar · passo a passo.
  /** "Mês 1 de 5" */
  stepCounter: (i: number, n: number) => `Mês ${i} de ${n}`,
  sectionSeries: 'Gastos fixos, parcelamentos e contas do ano',
  sectionLoose: 'Outras contas vencidas',
  sectionRecords: 'Recebimentos e gastos',
  stateOpen: 'em aberto',
  stateGap: 'sem conta registrada',
  stateEstimate: 'estimado',
  paidButton: 'Já paguei',
  notHappenedButton: 'Não houve',
  stillOpenButton: 'Ainda não paguei',
  /** "Já paguei: Luz de julho" */
  paidButtonA11y: (shortName: string) => `Já paguei: ${shortName}`,
  notHappenedA11y: (shortName: string) => `Não houve: ${shortName}`,
  stillOpenA11y: (shortName: string) => `Ainda não paguei: ${shortName}`,
  /** "Não houve em 2027" (grupo de conta do ano em aberto). */
  notHappenedYear: (label: string) => `Não houve em ${label}`,
  /** "Você já anotou o gasto Aluguel em 05/07/2026 (R$ 2.500,00). Se ele é o pagamento desta conta, …" */
  looseExpense: (r: Pick<FinancialRecord, 'description' | 'occurredOn' | 'amountCents'>) =>
    `Você já anotou o gasto ${r.description} em ${formatDateBR(r.occurredOn)} (${formatBRL(r.amountCents)}). Se ele é o pagamento desta conta, exclua esse gasto e use Já paguei, para não contar duas vezes.`,
  /** "Selecionar Aluguel de julho, R$ 2.500,00" */
  selectA11y: (shortName: string, amountCents: Cents) => `Selecionar ${shortName}, ${formatBRL(amountCents)}`,
  /** "Marcar as 2 selecionadas como pagas no vencimento" */
  batchButton: (n: number) => (n === 1 ? 'Marcar a selecionada como paga no vencimento' : `Marcar as ${n} selecionadas como pagas no vencimento`),
  batchTitle: (n: number) => (n === 1 ? 'Marcar 1 conta como paga?' : `Marcar ${n} contas como pagas?`),
  /** "Aluguel: R$ 2.500,00 em 05/07/2026. … Saem da conta Conta principal." (accountName null: várias contas, com chips) */
  batchBody: (rows: readonly Pick<ReviewRow, 'description' | 'series' | 'dueOn' | 'amountCents'>[], accountName: string | null) =>
    [
      ...rows.map((r) => `${rowName(r)}: ${formatBRL(r.amountCents)} em ${formatDateBR(r.dueOn)}.`),
      accountName === null ? null : `${rows.length === 1 ? 'Sai' : 'Saem'} da conta ${accountName}.`,
    ]
      .filter(Boolean)
      .join(' '),
  batchAccountLabel: 'Conta de saída',
  back: 'Voltar',
  batchConfirm: (n: number) => (n === 1 ? 'Marcar como paga' : 'Marcar como pagas'),
  /** "1 de 2 marcadas como pagas. Financiamento do carro de julho: algo mudou em outro aparelho. Confira e tente de novo." */
  batchPartial: (done: number, total: number, failedShortName: string, conflict: boolean) =>
    `${done === 0 ? 'Nenhuma conta foi marcada como paga.' : `${done} de ${total} marcadas como pagas.`} ${failedShortName}: ${
      conflict ? 'algo mudou em outro aparelho. Confira e tente de novo.' : 'não foi possível salvar. Tente de novo.'
    }`,
  /** Anúncio do lote (uma vez, só o resultado final). */
  batchDone: (n: number) => (n === 1 ? '1 conta marcada como paga' : `${n} contas marcadas como pagas`),
  payTitle: 'Marcar como paga?',
  /** "Aluguel de julho: R$ 2.500,00 em 05/07/2026, da conta Conta principal." */
  payBody: (shortName: string, amountCents: Cents, paidOn: IsoDate, accountName: string) =>
    `${shortName}: ${formatBRL(amountCents)} em ${formatDateBR(paidOn)}, da conta ${accountName}.`,
  payChange: 'Mudar valor ou data',
  confirm: 'Confirmar',
  /** "Não houve esta conta em julho?" */
  notHappenedGapTitle: (month: IsoMonth) => `Não houve esta conta em ${formatMonthName(month)}?`,
  /** "A conta de julho de Academia fica registrada como não houve e não volta a aparecer. Os outros meses não mudam." */
  notHappenedGapBody: (month: IsoMonth, description: string) =>
    `A conta de ${formatMonthName(month)} de ${description} fica registrada como não houve e não volta a aparecer. Os outros meses não mudam.`,
  /** "Tirar a conta de junho?" */
  notHappenedOpenTitle: (month: IsoMonth) => `Tirar a conta de ${formatMonthName(month)}?`,
  notHappenedOpenSeriesBody: 'Ela sai de Contas a pagar e não volta a ser criada.',
  notHappenedOpenLooseBody: 'Ela sai de Contas a pagar.',
  notHappenedOpenConfirm: 'Tirar conta',
  stillOpenDone: 'Registrada em aberto. Ela aparece em Contas a pagar como vencida.',
  /** Linha resolvida: "Paga em 05/07/2026 · R$ 2.500,00" */
  resolvedPaid: (paidOn: IsoDate, amountCents: Cents) => `Paga em ${formatDateBR(paidOn)} · ${formatBRL(amountCents)}`,
  resolvedNotHappened: 'Não houve',
  resolvedOpen: 'Registrada em aberto',
  undo: 'Desfazer',
  /** Anúncios (uma vez, polidos). */
  announcePaid: (shortName: string) => `Pagamento registrado: ${shortName}.`,
  announceNotHappened: (shortName: string) => `Registrada como não houve: ${shortName}.`,
  announceStillOpen: (shortName: string) => `Registrada em aberto: ${shortName}.`,
  /** "Recebimentos: R$ 6.000,00 · 1" ou "Recebimentos: nenhum anotado" */
  receiptsLine: (o: MonthOverview) => (o.receivedCount > 0 ? `Recebimentos: ${formatBRL(o.receivedCents)} · ${o.receivedCount}` : 'Recebimentos: nenhum anotado'),
  expensesLine: (o: MonthOverview) => (o.paidCount > 0 ? `Gastos: ${formatBRL(o.paidCents)} · ${o.paidCount}` : 'Gastos: nenhum anotado'),
  addReceipts: 'Anotar recebimentos',
  addExpenses: 'Anotar gastos',
  /** "Anote só o que você sabe. Se não lembra de cada gasto, pode anotar um total, como "Mercado de junho"." */
  recordsHint: (month: IsoMonth) =>
    `Anote só o que você sabe. Se não lembra de cada gasto, pode anotar um total, como "Mercado de ${formatMonthName(month)}".`,
  skipMonth: 'Pular este mês',
  nextMonth: 'Próximo mês',
  finish: 'Concluir',
  finishNow: 'Concluir agora',
  /** Faixa no Resumo depois de concluir. */
  finished: (skippedSomething: boolean) => (skippedSomething ? 'Meses atualizados. O que você pulou continua sem registro.' : 'Meses atualizados.'),

  // /retomar/pagar · conta sem registro: registrar e pagar.
  payScreenTitle: 'Registrar pagamento',
  /** "A conta de julho será registrada e marcada como paga." */
  payScreenExplain: (month: IsoMonth) => `A conta de ${formatMonthName(month)} será registrada e marcada como paga.`,
  /** "Digite o valor da conta. A estimativa era R$ 180,00." */
  estimateHint: (amountCents: Cents) => `Digite o valor da conta. A estimativa era ${formatBRL(amountCents)}.`,
  savePayment: 'Salvar pagamento',
  /** Falha parcial: a conta foi criada, o pagamento não. "Salvar de novo" repete o pagamento com a mesma chave. */
  partialFailure: (month: IsoMonth) => `A conta de ${formatMonthName(month)} foi registrada, mas o pagamento não foi salvo. Tente salvar de novo.`,
  saveAgain: 'Salvar de novo',
  saveFailed: ERROR_TEXT.salvar_falhou,

  // Formulário no modo "Dia".
  dayLabel: 'Dia',
  /** Sufixo do campo: "/06/2026" */
  daySuffix: (month: IsoMonth) => `/${month.slice(5, 7)}/${month.slice(0, 4)}`,
  /** "Dia do recebimento em junho de 2026." */
  dayHint: (kind: RecordKind, month: IsoMonth) => `Dia do ${kind === 'receita' ? 'recebimento' : 'gasto'} em ${formatMonthYearBR(month)}.`,
  otherDate: 'Usar outra data',
  dayRequired: 'Informe o dia.',
  /** "Junho tem 30 dias." */
  dayInvalid: (month: IsoMonth) => `${capitalize(formatMonthName(month))} tem ${lastDay(month)} dias.`,
  saveAndAnother: 'Salvar e anotar outro',
  save: 'Salvar',
  /** "Anotado: Salário, R$ 6.000,00 em 01/06/2026." */
  noted: (r: Pick<FinancialRecord, 'description' | 'amountCents' | 'occurredOn'>) =>
    `Anotado: ${r.description}, ${formatBRL(r.amountCents)} em ${formatDateBR(r.occurredOn)}.`,
  /** "O gasto fixo Aluguel não tem conta registrada em julho. Para contar no gasto fixo, use Já paguei na revisão." */
  dayGapHint: (row: Pick<ReviewRow, 'description' | 'month' | 'series'>) => {
    const kind = row.series?.kind ?? 'mensal';
    return `${KIND_SUBJECT[kind]} ${row.description} não tem conta registrada em ${formatMonthName(row.month)}. Para contar ${KIND_IN[kind]}, use Já paguei na revisão.`;
  },
  backToReview: 'Voltar para a revisão',

  // Detalhe da série (troca "Se você pagou, anote o gasto em Anotar gasto" nos 11 meses fechados).
  /** "Julho de 2026: sem conta registrada." */
  seriesGap: (month: IsoMonth) => `${formatMonthBR(month)}: sem conta registrada.`,
  /** Mês fora dos 11 fechados. */
  seriesGapOld: (month: IsoMonth) =>
    `${formatMonthBR(month)}: sem conta registrada. Meses com mais de 1 ano não podem ser registrados aqui; se pagou, anote o gasto em Anotar gasto.`,
  /** Conta do ano com 2 ou mais parcelas: "2027: parcelas 6 a 10 sem conta registrada." */
  annualGap: (label: string, parts: readonly number[]) =>
    parts.length === 1 ? `${label}: parcela ${parts[0]} sem conta registrada.` : `${label}: parcelas ${partsText(parts)} sem conta registrada.`,
  registerMonth: 'Registrar este mês',
  registerInstallment: 'Registrar esta parcela',
  registerParts: 'Registrar parcelas',
  /** Progresso do parcelamento: "Sem conta registrada: 2" */
  progressGaps: (n: number) => `Sem conta registrada: ${n}`,

  // "Quem vê estes dados?"
  privacy: 'A data da sua última anotação e suas escolhas na revisão dos últimos meses ficam só com você. A empresa e outras pessoas da Família não veem.',

  // Resumo de meses fechados (emptyMonthCaption).
  nothingNoted: (month: IsoMonth) => `Nada anotado em ${formatMonthName(month)}.`,
  noReceiptsNoted: (month: IsoMonth) => `Nenhum recebimento anotado em ${formatMonthName(month)}.`,
  noExpensesNoted: (month: IsoMonth) => `Nenhum gasto anotado em ${formatMonthName(month)}.`,

  /** Códigos novos (2.4). Os internos (o app nunca provoca) usam o texto genérico de falha. */
  errors: {
    ocorrencia_existente: 'Esta conta já foi registrada, talvez em outro aparelho. A lista foi atualizada.',
    mes_fora_da_revisao: 'Só é possível registrar contas dos últimos 11 meses fechados. Para meses mais antigos, anote o gasto em Anotar gasto.',
    versao_desatualizada: 'Algo mudou em outro aparelho. A lista foi atualizada; confira e tente de novo.',
    modo_invalido: ERROR_TEXT.salvar_falhou,
    decisao_invalida: ERROR_TEXT.salvar_falhou,
    mes_invalido: ERROR_TEXT.salvar_falhou,
    periodo_invalido: ERROR_TEXT.salvar_falhou,
  },
} as const;

/** Texto de erro das escritas da revisão: os códigos novos, depois os do pagamento; o resto, falha genérica. */
export function returnErrorText(code: string): string {
  const own = RETURN_TEXT.errors as Record<string, string>;
  const pay = PAYMENT_ERROR_TEXT as Record<string, string>;
  return own[code] ?? pay[code] ?? ERROR_TEXT.salvar_falhou;
}

/** "4 meses com algo sem registro e 13 contas para conferir" (sem contas: só os meses; sem meses: só as contas). */
export function reviewCountsText(counts: ReturnReview['counts']): string {
  const parts = [
    counts.monthsWithGaps > 0 ? RETURN_TEXT.monthsPart(counts.monthsWithGaps) : null,
    counts.billsToCheck > 0 ? RETURN_TEXT.billsPart(counts.billsToCheck) : null,
  ].filter((p): p is string => p !== null);
  return joinList(parts);
}

/** Textos da faixa "Seus últimos meses" (sem valores); null quando não há nada a conferir. */
export function returnBannerText(review: ReturnReview): { title: string; body: string; note: string; primary: string; secondary: string } | null {
  if (review.isEmpty) return null;
  const w = review.window;
  const counts = reviewCountsText(review.counts);
  return {
    title: RETURN_TEXT.title,
    body: w.kind === 'volta' && w.returnedOn !== null ? RETURN_TEXT.bannerReturn(w.anchor, w.returnedOn, counts) : RETURN_TEXT.bannerAbsence(w.anchor, counts),
    note: RETURN_TEXT.bannerNote,
    primary: RETURN_TEXT.seeSummary,
    secondary: RETURN_TEXT.moveOn,
  };
}

/** Abertura de /retomar: "Sua última anotação foi em 20/05/2026. Abaixo, o que está registrado de maio a setembro de 2026 e as contas vencidas deste mês." */
export function returnOpeningText(review: ReturnReview): string {
  const w = review.window;
  const parts = [
    review.months.length > 0 ? RETURN_TEXT.openingMonths(w.fromMonth, w.toMonth) : null,
    review.current.rows.length > 0 ? RETURN_TEXT.openingCurrent : null,
  ].filter((p): p is string => p !== null);
  const what = joinList(parts);
  return w.kind === 'volta' && w.returnedOn !== null ? RETURN_TEXT.openingReturn(w.anchor, w.returnedOn, what) : RETURN_TEXT.openingAbsence(w.anchor, what);
}

/** Cartão de um mês fechado em /retomar. lines vazio = cartão compacto (nada a conferir além de recebimentos e gastos). */
export interface ReviewMonthCard {
  title: string;
  received: string;
  paid: string;
  /** Contas em aberto, sem conta registrada, grupos de conta do ano e outras vencidas; ou "Nenhuma conta para conferir." */
  lines: string[];
  /** Nada a conferir no mês (nem recebimentos e gastos faltando, nem contas): mostrar compacto. */
  compact: boolean;
}

export function reviewMonthCard(m: ReviewMonth): ReviewMonthCard {
  const singles = m.items.flatMap((i) => (i.type === 'linha' ? [i.row] : []));
  const groups = m.items.flatMap((i) => (i.type === 'ano' ? [i.group] : []));
  const open = singles.filter((r) => r.state === 'aberta');
  const gaps = singles.filter((r) => r.state === 'sem_conta');
  const sum = (rows: readonly ReviewRow[], only?: (r: ReviewRow) => boolean) =>
    rows.reduce((acc, r) => acc + (!only || only(r) ? r.amountCents : 0), 0);
  const lines = [
    open.length ? RETURN_TEXT.openBills(open.length, sum(open), sum(open, (r) => r.amountIsEstimate)) : null,
    gaps.length ? RETURN_TEXT.gapBills(gaps.map(rowName)) : null,
    ...groups.map((g) => g.text),
    m.loose.length ? RETURN_TEXT.looseBills(m.loose.length, sum(m.loose)) : null,
  ].filter((l): l is string => l !== null);
  return {
    title: RETURN_TEXT.monthTitle(m.month),
    received: RETURN_TEXT.received(m.overview),
    paid: RETURN_TEXT.paid(m.overview),
    lines: lines.length ? lines : [RETURN_TEXT.nothingToCheck],
    compact: !m.toCheck,
  };
}

/** "Outubro de 2026 (este mês) · 1 conta vencida em aberto: Aluguel, R$ 2.500,00, venceu em 05/10."; null sem vencidas. */
export function reviewCurrentText(current: ReviewCurrent): string | null {
  const rows = current.rows;
  if (rows.length === 0) return null;
  const body = rows.length === 1 ? RETURN_TEXT.currentOne(rows[0]!) : RETURN_TEXT.currentMany(rows.map((r) => r.description));
  return `${RETURN_TEXT.currentTitle(current.month)} · ${body}`;
}

/** Título do passo: "Junho de 2026" ou "Outubro de 2026 (este mês)". */
export function reviewStepTitle(step: ReviewStep): string {
  return step.current ? RETURN_TEXT.currentTitle(step.month) : RETURN_TEXT.monthTitle(step.month);
}

/**
 * Linha do passo: "Aluguel · R$ 2.500,00 · venceu em 05/06/2026 · em aberto", "Financiamento do carro · Parcela 10 de
 * 48 · R$ 850,00 · vencimento em 10/07/2026 · sem conta registrada" ou "Luz · cerca de R$ 180,00 (estimado) · …".
 */
export function reviewRowText(row: ReviewRow): string {
  const amount = `${money(row.amountCents, row.amountIsEstimate)}${row.amountIsEstimate ? ` (${RETURN_TEXT.stateEstimate})` : ''}`;
  const when = row.state === 'aberta' ? `venceu em ${formatDateBR(row.dueOn)}` : `vencimento em ${formatDateBR(row.dueOn)}`;
  const state = row.state === 'aberta' ? RETURN_TEXT.stateOpen : RETURN_TEXT.stateGap;
  return [row.description, row.label, amount, when, state].filter(Boolean).join(' · ');
}

/** Nome acessível completo: "Luz, cerca de R$ 180,00, valor estimado, vencimento em 12/07/2026, sem conta registrada". */
export function reviewRowA11yLabel(row: ReviewRow): string {
  const label = row.label ? `${row.label.charAt(0).toLowerCase()}${row.label.slice(1)}` : null;
  const when = row.state === 'aberta' ? `venceu em ${formatDateBR(row.dueOn)}` : `vencimento em ${formatDateBR(row.dueOn)}`;
  const state = row.state === 'aberta' ? RETURN_TEXT.stateOpen : RETURN_TEXT.stateGap;
  return [row.description, label, money(row.amountCents, row.amountIsEstimate), row.amountIsEstimate ? 'valor estimado' : null, when, state]
    .filter(Boolean)
    .join(', ');
}

/** Corpo do diálogo "Não houve" de uma linha. */
export function notHappenedDialog(row: ReviewRow): { title: string; body: string; confirm: string } {
  if (row.state === 'sem_conta') {
    return { title: RETURN_TEXT.notHappenedGapTitle(row.month), body: RETURN_TEXT.notHappenedGapBody(row.month, row.description), confirm: RETURN_TEXT.confirm };
  }
  return {
    title: RETURN_TEXT.notHappenedOpenTitle(row.month),
    body: row.series ? RETURN_TEXT.notHappenedOpenSeriesBody : RETURN_TEXT.notHappenedOpenLooseBody,
    confirm: RETURN_TEXT.notHappenedOpenConfirm,
  };
}

/**
 * Todos os textos de RETURN_TEXT com dados fictícios (para o teste de textos). Inclui os calculados pelas funções desta
 * página que montam frases.
 */
export function returnTextSamples(): string[] {
  const T = RETURN_TEXT;
  const ov = (receivedCount: number, paidCount: number): MonthOverview => ({
    month: '2026-06',
    receivedCount,
    receivedCents: receivedCount * 600_000,
    paidCount,
    paidCents: paidCount * 167_500,
  });
  const luz: ReviewRow = {
    key: 'serie:luz:3',
    state: 'sem_conta',
    month: '2026-07',
    dueOn: '2026-07-12',
    description: 'Luz',
    category: 'Moradia',
    amountCents: 18_000,
    amountIsEstimate: true,
    series: { id: 'luz', number: 3, kind: 'mensal', nature: 'conta', installmentTotal: null, partsPerYear: null },
    seriesVersion: 1,
    commitment: null,
    label: null,
  };
  const carro: ReviewRow = {
    ...luz,
    key: 'serie:carro:10',
    state: 'aberta',
    dueOn: '2026-07-10',
    description: 'Financiamento do carro',
    amountCents: 85_000,
    amountIsEstimate: false,
    series: { id: 'carro', number: 10, kind: 'parcelada', nature: 'financiamento', installmentTotal: 48, partsPerYear: null },
    label: 'Parcela 10 de 48',
  };
  const iptu: ReviewRow = {
    ...luz,
    key: 'serie:iptu:6',
    month: '2027-07',
    dueOn: '2027-07-10',
    description: 'IPTU',
    series: { id: 'iptu', number: 6, kind: 'anual', nature: 'conta', installmentTotal: null, partsPerYear: 10 },
    label: 'Parcela 6 de 10 de 2027',
  };
  const ipva: ReviewRow = { ...iptu, description: 'IPVA', series: { ...iptu.series!, number: 1, partsPerYear: 1 }, dueOn: '2027-01-20', month: '2027-01' };
  const avulsa: ReviewRow = { ...carro, key: 'conta:internet', description: 'Internet', series: null, seriesVersion: null, label: null, amountCents: 15_000 };
  const record = { description: 'Aluguel', occurredOn: '2026-07-05', amountCents: 250_000 };
  const strings = (Object.values(T) as unknown[]).filter((v): v is string => typeof v === 'string');
  return [
    ...strings,
    ...Object.values(T.errors),
    T.monthsPart(1),
    T.monthsPart(4),
    T.billsPart(1),
    T.billsPart(13),
    T.bannerAbsence('2026-05-20', reviewCountsText({ monthsWithGaps: 4, billsToCheck: 13 })),
    T.bannerReturn('2026-05-20', '2026-10-07', reviewCountsText({ monthsWithGaps: 1, billsToCheck: 0 })),
    T.openingAbsence('2026-05-20', joinList([T.openingMonths('2026-05', '2026-09'), T.openingCurrent])),
    T.openingReturn('2026-05-20', '2026-10-07', T.openingMonths('2026-09', '2026-09')),
    T.monthTitle('2026-06'),
    T.currentTitle('2026-10'),
    T.received(ov(0, 0)),
    T.received(ov(1, 4)),
    T.paid(ov(0, 0)),
    T.paid(ov(2, 1)),
    T.openBills(3, 353_000, 18_000),
    T.gapBills([rowName(luz), rowName(carro), rowName(iptu), rowName(ipva)]),
    T.groupState(5, 'sem_conta'),
    T.groupState(1, 'aberta'),
    T.looseBills(1, 15_000),
    T.currentOne(avulsa),
    T.currentMany(['Aluguel', 'Financiamento do carro', 'Luz']),
    T.cut('2025-11'),
    T.stepCounter(1, 5),
    T.paidButtonA11y(rowShortName(luz)),
    T.notHappenedA11y(rowShortName(luz)),
    T.stillOpenA11y(rowShortName(luz)),
    T.notHappenedYear('2027'),
    T.looseExpense(record),
    T.selectA11y(rowShortName(carro), carro.amountCents),
    T.batchButton(1),
    T.batchButton(2),
    T.batchTitle(1),
    T.batchTitle(2),
    T.batchBody([carro, avulsa], 'Conta principal'),
    T.batchBody([carro], 'Conta principal'),
    T.batchBody([carro], null),
    T.batchConfirm(1),
    T.batchConfirm(2),
    T.batchPartial(1, 2, rowShortName(carro), true),
    T.batchPartial(0, 2, rowShortName(carro), false),
    T.batchDone(1),
    T.batchDone(2),
    T.payBody(rowShortName(carro), 85_000, '2026-07-10', 'Conta principal'),
    T.notHappenedGapTitle('2026-07'),
    T.notHappenedGapBody('2026-07', 'Academia'),
    T.notHappenedOpenTitle('2026-06'),
    T.resolvedPaid('2026-07-05', 250_000),
    T.announcePaid(rowShortName(carro)),
    T.announceNotHappened(rowShortName(luz)),
    T.announceStillOpen(rowShortName(luz)),
    T.receiptsLine(ov(0, 2)),
    T.receiptsLine(ov(1, 2)),
    T.expensesLine(ov(1, 0)),
    T.expensesLine(ov(1, 2)),
    T.recordsHint('2026-06'),
    T.finished(true),
    T.finished(false),
    T.payScreenExplain('2026-07'),
    T.estimateHint(18_000),
    T.partialFailure('2026-07'),
    T.daySuffix('2026-06'),
    T.dayHint('receita', '2026-06'),
    T.dayHint('despesa', '2026-06'),
    T.dayInvalid('2026-06'),
    T.dayInvalid('2028-02'),
    T.noted({ description: 'Salário', amountCents: 600_000, occurredOn: '2026-06-01' }),
    T.dayGapHint({ ...luz, description: 'Aluguel' }),
    T.dayGapHint(carro),
    T.dayGapHint(iptu),
    T.seriesGap('2026-07'),
    T.seriesGapOld('2025-07'),
    T.annualGap('2027', [6, 7, 8, 9, 10]),
    T.annualGap('2027', [6]),
    T.progressGaps(2),
    T.nothingNoted('2026-06'),
    T.noReceiptsNoted('2026-08'),
    T.noExpensesNoted('2026-08'),
    reviewRowText(luz),
    reviewRowText(carro),
    reviewRowText(iptu),
    reviewRowA11yLabel(luz),
    reviewRowA11yLabel(carro),
    ...Object.values(notHappenedDialog(luz)),
    ...Object.values(notHappenedDialog(carro)),
    ...Object.values(notHappenedDialog(avulsa)),
  ];
}
