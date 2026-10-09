import type { IsoDate, IsoMonth } from './dates';
import { addMonths, formatMonthBR, formatMonthName, formatMonthYearBR, isValidIsoMonth, monthOf, monthRange } from './dates';
import { formatInteger } from './learn/format';
import { monthlyShareCents, percentTenths } from './learn/math';
import type { Cents } from './money';
import { MAX_RECORD_CENTS, formatBRL, parseBRL, roundDiv } from './money';
import type { Commitment, CommitmentSeries, FinancialRecord, IncomeReference, SeriesKind, SeriesNature } from './records';
import { DEBT_NATURES } from './records';
import { annualYearOf, projectSeries, seriesMonthOf, seriesYearlyTotal, termFor } from './series';
import type { ToPaySummary } from './summary';
import { ERROR_TEXT } from './validation';

/**
 * Renda comprometida (D-026, Ciclo B), no contexto Pessoal. Regras puras, repetidas no banco por month_committed.
 *
 * - C(M) = contas a pagar não excluídas do contexto com vencimento no mês M; cada conta conta uma vez: paga pelo valor
 *   do gasto vinculado, em aberto pelo valor previsto (estimado ou não).
 * - Grupos: gastos fixos (séries mensais), contas do ano (séries anuais, que não são dívida), parcelamentos (séries
 *   parceladas) e outras contas a pagar (avulsas). "Dívidas" = parcelamentos de financiamento ou empréstimo e de compra
 *   parcelada (parte de "parcelamentos").
 * - Gastos anotados sem conta a pagar não entram. Contas em aberto vencidas antes do mês aparecem à parte (só no mês de
 *   hoje) e contam no mês do vencimento delas.
 * - Renda considerada = renda de referência viva com o maior "a partir de" até M; sem ela, só valores em reais.
 * - Percentual em milésimos, metade para cima, em inteiros: (2000 × comprometido + renda) ÷ (2 × renda); cada grupo é
 *   arredondado sozinho e o total sobre a soma.
 * - "Fora dos compromissos" = renda − comprometido (pode ser negativo); não é saldo nem dinheiro disponível.
 * - Identidade: comprometido(M) = Σ pagas de C(M) + summarizeToPay(…, M).dueInMonthCents.
 * - Contas do ano (P-019): linha informativa com o valor do ano dividido por 12, fora do percentual.
 */

/** Meses de "Próximos meses" depois do mês mostrado. */
export const UPCOMING_COMMITTED_MONTHS = 6;
/** Faixa de "Vale a partir de" aceita pelo banco: de 24 meses antes a 12 meses depois do mês de hoje. */
export const REFERENCE_MONTHS_BACK = 24;
export const REFERENCE_MONTHS_AHEAD = 12;

/**
 * Referência de mercado de 30% da renda líquida com dívidas (P-024: fonte privada identificada, só na linha de dívidas).
 * Conferida por trecho de resultado de busca da própria página (método de spec5_notes §2); o título indexado da página
 * mudou, por isso a fonte é descrita, não citada pelo título.
 */
export const DEBT_REFERENCE = {
  permille: 300,
  publisher: 'Serasa',
  description: 'página sobre comprometimento de renda',
  url: 'https://www.serasa.com.br/credito/blog/comprometimento-renda/',
  consultedOn: '2026-10-09',
} as const;

export type CommittedGroup = 'fixos' | 'anuais' | 'parcelamentos' | 'outras';
/** Ordem da composição na tela. */
export const COMMITTED_GROUPS: readonly CommittedGroup[] = ['fixos', 'anuais', 'parcelamentos', 'outras'];

/** Tipo fora da lista (dado corrompido): nunca tratar como outro grupo. */
function unknownKind(kind: never): never {
  throw new Error(`serie_inconsistente: ${String(kind)}`);
}

/** Grupo pelo tipo da série: mensal, anual ou parcelada; sem série (null), "outras contas a pagar". */
function groupOfKind(kind: SeriesKind | null): CommittedGroup {
  switch (kind) {
    case null:
      return 'outras';
    case 'mensal':
      return 'fixos';
    case 'anual':
      return 'anuais';
    case 'parcelada':
      return 'parcelamentos';
    default:
      return unknownKind(kind);
  }
}

/** Grupo da conta: série mensal, anual ou parcelada; sem série, "outras contas a pagar". */
export function committedGroupOf(c: Pick<Commitment, 'series'>): CommittedGroup {
  return groupOfKind(c.series ? c.series.kind : null);
}

const isDebtNature = (nature: SeriesNature) => DEBT_NATURES.includes(nature);

/** Parcela de financiamento ou empréstimo ou de compra parcelada: entra em "Dívidas". Contas do ano nunca. */
export function isDebtCommitment(c: Pick<Commitment, 'series'>): boolean {
  return c.series !== null && c.series.kind === 'parcelada' && isDebtNature(c.series.nature);
}

/** Valor da conta no comprometido: paga pelo valor do gasto vinculado, em aberto pelo previsto. */
export function committedValueOf(c: Pick<Commitment, 'status' | 'payment' | 'amountCents'>): Cents {
  return c.status === 'quitado' && c.payment ? c.payment.amountCents : c.amountCents;
}

/** Renda de referência viva com o maior "a partir de" até o mês (ou null). */
export function referenceFor(refs: readonly IncomeReference[], month: IsoMonth): IncomeReference | null {
  let best: IncomeReference | null = null;
  for (const r of refs) if (r.fromMonth <= month && (!best || r.fromMonth > best.fromMonth)) best = r;
  return best;
}

/** Milésimos da renda, metade para cima (D-026(3)); sem referência, null. */
export function committedPermille(cents: Cents, referenceCents: Cents | null): number | null {
  return referenceCents === null ? null : percentTenths(cents, referenceCents);
}

/**
 * Percentual com uma casa e vírgula: 525 → "52,5%", 0 → "0,0%", 1120 → "112,0%". Com comprometido maior que zero e
 * resultado zero, "menos de 0,1%".
 */
export function formatPermille(permille: number, committedCents: Cents): string {
  if (!Number.isSafeInteger(permille) || permille < 0) throw new RangeError(`milésimos inválidos: ${permille}`);
  if (committedCents > 0 && permille === 0) return 'menos de 0,1%';
  return `${formatInteger(Math.floor(permille / 10))},${permille % 10}%`;
}

/** Contas do ano divididas por 12 (P-019): informativo, fora do percentual. */
export interface AnnualShare {
  /** Σ k × vigência atual das contas do ano não encerradas (seriesYearlyTotal). */
  yearlyCents: Cents;
  /** ceilDiv(yearlyCents, 12): 4.200,00 → 350,00. */
  monthlyCents: Cents;
  /** Alguma conta do ano com valor que muda (referência estimada). */
  estimated: boolean;
}

/** Linha "Contas do ano: R$ X por mês se dividir o valor do ano por 12"; null sem conta do ano ativa. */
export function annualShare(series: readonly CommitmentSeries[], today: IsoDate): AnnualShare | null {
  const { totalCents, estimatedCents } = seriesYearlyTotal(series, today);
  if (totalCents <= 0) return null;
  return { yearlyCents: totalCents, monthlyCents: monthlyShareCents(totalCents, 12), estimated: estimatedCents > 0 };
}

/** Medidor horizontal na escala da renda de referência (milésimos, cheio em 1.000). */
export interface CommittedMeter {
  /** Parte "Já pago", de 0 a 1.000. */
  paidPermille: number;
  /** Parte "Em aberto", de 0 a 1.000 − paidPermille. */
  openPermille: number;
  /** Comprometido maior que a renda (em centavos): medidor cheio com "+". */
  over: boolean;
}

/** Medidor de 8 px: já pago sólido e em aberto listrado, na mesma escala em todos os meses; null sem referência. */
export function committedMeter(paidCents: Cents, openCents: Cents, referenceCents: Cents | null): CommittedMeter | null {
  if (referenceCents === null || referenceCents <= 0) return null;
  const total = Math.min(1000, percentTenths(paidCents + openCents, referenceCents));
  const paid = Math.min(total, percentTenths(paidCents, referenceCents));
  return { paidPermille: paid, openPermille: total - paid, over: paidCents + openCents > referenceCents };
}

interface GroupTotals {
  fixos: Cents;
  anuais: Cents;
  parcelamentos: Cents;
  outras: Cents;
  debt: Cents;
  committed: Cents;
  paid: Cents;
  open: Cents;
  estimatedOpen: Cents;
}

const emptyTotals = (): GroupTotals => ({ fixos: 0, anuais: 0, parcelamentos: 0, outras: 0, debt: 0, committed: 0, paid: 0, open: 0, estimatedOpen: 0 });

function addTo(t: GroupTotals, group: CommittedGroup, debt: boolean, value: Cents, paid: boolean, estimate: boolean) {
  t[group] += value;
  if (debt) t.debt += value;
  t.committed += value;
  if (paid) t.paid += value;
  else {
    t.open += value;
    if (estimate) t.estimatedOpen += value;
  }
}

/** Mesmo campo e mesma ordem de month_committed, mais percentuais por grupo, itens e textos de apoio. */
export interface CommittedSummary {
  contextId: string;
  month: IsoMonth;
  isCurrentMonth: boolean;
  /** month_committed.fixed_cents: séries mensais. */
  fixedCents: Cents;
  /** month_committed.annual_cents: séries anuais (contas do ano). Não são dívida. */
  annualCents: Cents;
  /** month_committed.installment_cents: séries parceladas. */
  installmentCents: Cents;
  /** month_committed.debt_cents: parcelamentos de financiamento ou compra parcelada (parte de installmentCents). */
  debtCents: Cents;
  /** month_committed.other_cents: contas avulsas. */
  otherCents: Cents;
  /** month_committed.committed_cents = fixed + annual + installment + other. */
  committedCents: Cents;
  /** month_committed.paid_part_cents: das pagas, pelo valor pago. */
  paidPartCents: Cents;
  /** month_committed.open_part_cents = committed − paid_part. */
  openPartCents: Cents;
  /** month_committed.estimated_open_cents: em aberto com marca de estimado. */
  estimatedOpenCents: Cents;
  /** month_committed.overdue_before_cents: só no mês de hoje, em aberto com vencimento antes dele. Fora do percentual. */
  overdueBeforeCents: Cents;
  /** Referência vigente (month_committed.reference_cents e reference_from). */
  reference: IncomeReference | null;
  referenceCents: Cents | null;
  referenceFrom: IsoMonth | null;
  /** month_committed.committed_permille e debt_permille; os demais só no core. null sem referência. */
  committedPermille: number | null;
  fixedPermille: number | null;
  annualPermille: number | null;
  installmentPermille: number | null;
  otherPermille: number | null;
  debtPermille: number | null;
  /** "Fora dos compromissos" = referência − comprometido (pode ser negativo); null sem referência. */
  outsideCents: Cents | null;
  /** Comprometido maior que a referência, em centavos (nunca pelo percentual arredondado). */
  overReference: boolean;
  /** Contas de C(M) por grupo, por vencimento, criação e id (abertas e pagas). */
  items: Record<CommittedGroup, Commitment[]>;
  /** Em aberto vencidas antes do mês (só no mês de hoje), para "Ver contas vencidas". */
  overdueBefore: Commitment[];
  /** Quantidade de contas em C(M). */
  count: number;
  /** Contas do ano ÷ 12 (P-019), fora do percentual; null sem conta do ano ativa ou sem a lista de séries. */
  annualShare: AnnualShare | null;
  /** Referência marcada "varia" e de um mês anterior ao mostrado: "Referência de setembro. Revise para outubro." */
  needsReview: boolean;
  /** Medidor (já pago e em aberto) na escala da referência; null sem referência. */
  meter: CommittedMeter | null;
}

const byDue = (a: Commitment, b: Commitment) =>
  a.dueOn.localeCompare(b.dueOn) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);

/**
 * Renda comprometida do mês. list: listCommitments(contexto, mês) (as contas do mês, abertas e pagas, e as em aberto
 * de outros meses); refs: listIncomeReferences(contexto); series (opcional): listSeries(contexto), só para a linha das
 * contas do ano (P-019). Contas e referências de outro contexto ficam fora.
 */
export function summarizeCommitted(
  list: readonly Commitment[],
  contextId: string,
  month: IsoMonth,
  today: IsoDate,
  refs: readonly IncomeReference[],
  series: readonly CommitmentSeries[] = [],
): CommittedSummary {
  const isCurrentMonth = monthOf(today) === month;
  const { start } = monthRange(month);
  const own = list.filter((c) => c.contextId === contextId).sort(byDue);
  const inMonth = own.filter((c) => monthOf(c.dueOn) === month);
  const items: Record<CommittedGroup, Commitment[]> = { fixos: [], anuais: [], parcelamentos: [], outras: [] };
  const t = emptyTotals();
  for (const c of inMonth) {
    const group = committedGroupOf(c);
    items[group].push(c);
    addTo(t, group, isDebtCommitment(c), committedValueOf(c), c.status === 'quitado', c.amountIsEstimate);
  }
  const overdueBefore = isCurrentMonth ? own.filter((c) => c.status === 'aberto' && c.dueOn < start) : [];
  const reference = referenceFor(
    refs.filter((r) => r.contextId === contextId),
    month,
  );
  const ref = reference?.amountCents ?? null;
  return {
    contextId,
    month,
    isCurrentMonth,
    fixedCents: t.fixos,
    annualCents: t.anuais,
    installmentCents: t.parcelamentos,
    debtCents: t.debt,
    otherCents: t.outras,
    committedCents: t.committed,
    paidPartCents: t.paid,
    openPartCents: t.open,
    estimatedOpenCents: t.estimatedOpen,
    overdueBeforeCents: overdueBefore.reduce((acc, c) => acc + c.amountCents, 0),
    reference,
    referenceCents: ref,
    referenceFrom: reference?.fromMonth ?? null,
    committedPermille: committedPermille(t.committed, ref),
    fixedPermille: committedPermille(t.fixos, ref),
    annualPermille: committedPermille(t.anuais, ref),
    installmentPermille: committedPermille(t.parcelamentos, ref),
    otherPermille: committedPermille(t.outras, ref),
    debtPermille: committedPermille(t.debt, ref),
    outsideCents: ref === null ? null : ref - t.committed,
    overReference: ref !== null && t.committed > ref,
    items,
    overdueBefore,
    count: inMonth.length,
    annualShare: annualShare(
      series.filter((s) => s.contextId === contextId),
      today,
    ),
    needsReview: reference !== null && reference.varies && reference.fromMonth < month,
    meter: committedMeter(t.paid, t.open, ref),
  };
}

// ---------------------------------------------------------------------------
// Próximos meses: contas já criadas e previsão das séries
// ---------------------------------------------------------------------------

/** Meses de "Próximos meses": os 6 seguintes ao mês mostrado. */
export function upcomingCommittedMonths(month: IsoMonth, count = UPCOMING_COMMITTED_MONTHS): IsoMonth[] {
  return Array.from({ length: count }, (_, i) => addMonths(month, i + 1));
}

/** Um mês de "Próximos meses", sempre "Previsto". */
export interface CommittedProjectionMonth {
  month: IsoMonth;
  fixedCents: Cents;
  annualCents: Cents;
  installmentCents: Cents;
  debtCents: Cents;
  otherCents: Cents;
  committedCents: Cents;
  /** Contas pagas antes do mês, pelo valor pago. */
  paidPartCents: Cents;
  /** Em aberto estimadas e previstas de séries com valor que muda. */
  estimatedCents: Cents;
  /** Parte que ainda não é conta criada (previsão das séries). */
  plannedCents: Cents;
  reference: IncomeReference | null;
  committedPermille: number | null;
  annualPermille: number | null;
  debtPermille: number | null;
  meter: CommittedMeter | null;
  /** "Novembro de 2026 · R$ 3.830,00 · 63,8%" (sem percentual quando não há referência). */
  text: string;
  /** "Novembro de 2026, previsto: R$ 3.830,00 em contas, 63,8% da renda de referência, inclui R$ 180,00 em valores estimados." */
  a11yLabel: string;
}

export type CommittedMilestoneKind = 'novo_valor' | 'conta_do_ano' | 'ultima_conta' | 'ultima_parcela';
const MILESTONE_ORDER: readonly CommittedMilestoneKind[] = ['novo_valor', 'conta_do_ano', 'ultima_conta', 'ultima_parcela'];

/** "O que muda": marcos calculados das séries. */
export interface CommittedMilestone {
  kind: CommittedMilestoneKind;
  month: IsoMonth;
  seriesId: string;
  description: string;
  amountCents: Cents;
  /** Valor estimado (série com valor que muda): "cerca de". */
  approximate: boolean;
  /** Conta do ano com parcelas: quantas no ano (1 = cota única). */
  parts: number;
  /** "Outubro de 2029: última parcela de Financiamento do carro (R$ 850,00)." */
  text: string;
}

export interface CommittedProjection {
  months: CommittedProjectionMonth[];
  milestones: CommittedMilestone[];
}

const money = (cents: Cents, approximate: boolean) => (approximate ? `cerca de ${formatBRL(cents)}` : formatBRL(cents));

function milestoneText(m: Omit<CommittedMilestone, 'text'>): string {
  const when = formatMonthBR(m.month);
  switch (m.kind) {
    case 'novo_valor':
      return `${when}: ${m.description} passa a ${money(m.amountCents, m.approximate)}.`;
    case 'conta_do_ano':
      return m.parts === 1
        ? `${when}: ${m.description}, ${money(m.amountCents, m.approximate)}.`
        : `${when}: ${m.description}, ${m.parts} parcelas de ${money(m.amountCents, m.approximate)}.`;
    case 'ultima_conta':
      return `${when}: última conta de ${m.description} (${money(m.amountCents, m.approximate)}).`;
    case 'ultima_parcela':
      return `${when}: última parcela de ${m.description} (${money(m.amountCents, m.approximate)}).`;
    default:
      return unknownKind(m.kind);
  }
}

/** Linha de um mês previsto. */
function projectionMonth(month: IsoMonth, t: GroupTotals, planned: Cents, reference: IncomeReference | null): CommittedProjectionMonth {
  const ref = reference?.amountCents ?? null;
  const permille = committedPermille(t.committed, ref);
  const pct = permille === null ? null : formatPermille(permille, t.committed);
  const name = formatMonthBR(month);
  const estimated = t.estimatedOpen > 0 ? `, inclui ${formatBRL(t.estimatedOpen)} em valores estimados` : '';
  return {
    month,
    fixedCents: t.fixos,
    annualCents: t.anuais,
    installmentCents: t.parcelamentos,
    debtCents: t.debt,
    otherCents: t.outras,
    committedCents: t.committed,
    paidPartCents: t.paid,
    estimatedCents: t.estimatedOpen,
    plannedCents: planned,
    reference,
    committedPermille: permille,
    annualPermille: committedPermille(t.anuais, ref),
    debtPermille: committedPermille(t.debt, ref),
    meter: committedMeter(t.paid, t.open, ref),
    text: pct === null ? `${name} · ${formatBRL(t.committed)}` : `${name} · ${formatBRL(t.committed)} · ${pct}`,
    a11yLabel:
      `${name}, previsto: ${formatBRL(t.committed)} em contas` +
      (pct === null ? '' : `, ${pct} da renda de referência`) +
      `${estimated}.`,
  };
}

/**
 * "Próximos meses" (D-026(6)) e "O que muda".
 * - series: listSeries(contexto) (vivas, inclusive encerradas);
 * - dueList: listCommitmentsDueBetween(contexto, primeiro mês, último mês): as contas já criadas desses meses;
 * - refs: listIncomeReferences(contexto); months: upcomingCommittedMonths(mês mostrado).
 * Cada mês soma as contas já criadas (pagas pelo valor pago, em aberto pelo previsto) e, a partir do mês de hoje, a
 * previsão das séries (projectSeries: só além da maior conta viva, sem números excluídos só neste mês nem depois do
 * término). Meses antes do mês de hoje não recebem previsão (números sem conta ficam "sem conta registrada").
 * Marcos: novo valor programado e contas do ano (1ª parcela do ano) dentro dos meses; última conta de um gasto fixo
 * com término e última parcela de um parcelamento a partir do primeiro mês, mesmo depois do último (é o que muda o
 * número nos anos seguintes).
 */
export function projectCommitted(
  series: readonly CommitmentSeries[],
  dueList: readonly Commitment[],
  refs: readonly IncomeReference[],
  months: readonly IsoMonth[],
  today: IsoDate,
): CommittedProjection {
  const sorted = [...new Set(months)].filter(isValidIsoMonth).sort();
  if (sorted.length === 0) return { months: [], milestones: [] };
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  const current = monthOf(today);
  const byId = new Map(series.map((s) => [s.id, s]));
  const milestones: CommittedMilestone[] = [];
  const push = (m: Omit<CommittedMilestone, 'text'>) => milestones.push({ ...m, text: milestoneText(m) });

  /** Conta do ano: marco na 1ª parcela do ano que a pessoa paga pelo Clarevo, quando ela cai nos meses. */
  const annualMilestone = (s: CommitmentSeries, n: number, month: IsoMonth, description: string, amountCents: Cents, approximate: boolean) => {
    const year = annualYearOf(s, n);
    const firstOfYear = Math.max(year.firstNumber, s.firstNumber);
    if (n !== firstOfYear) return;
    const lastOfYear = s.lastNumber === null ? year.lastNumber : Math.min(year.lastNumber, s.lastNumber);
    const skipped = new Set(s.skippedNumbers);
    let parts = 0;
    for (let x = firstOfYear; x <= lastOfYear; x++) if (!skipped.has(x)) parts += 1;
    push({ kind: 'conta_do_ano', month, seriesId: s.id, description, amountCents, approximate, parts: Math.max(parts, 1) });
  };

  const out = sorted.map((month) => {
    const t = emptyTotals();
    let planned = 0;
    for (const c of dueList) {
      if (monthOf(c.dueOn) !== month) continue;
      const value = committedValueOf(c);
      addTo(t, committedGroupOf(c), isDebtCommitment(c), value, c.status === 'quitado', c.amountIsEstimate);
      const s = c.series ? byId.get(c.series.id) : undefined;
      if (s && s.kind === 'anual') annualMilestone(s, c.series!.number, month, c.description, value, c.status === 'aberto' && c.amountIsEstimate);
    }
    if (month >= current) {
      for (const s of series) {
        for (const p of projectSeries(s, dueList, month, month)) {
          addTo(t, groupOfKind(s.kind), s.kind === 'parcelada' && isDebtNature(s.nature), p.amountCents, false, p.amountIsEstimate);
          planned += p.amountCents;
          if (s.kind === 'anual') annualMilestone(s, p.number, month, p.description, p.amountCents, p.amountIsEstimate);
        }
      }
    }
    return projectionMonth(month, t, planned, referenceFor(refs, month));
  });

  for (const s of series) {
    // Novo valor programado ("esta e as próximas" a partir de um mês futuro), dentro dos meses.
    const terms = [...s.terms].sort((a, b) => a.fromNumber - b.fromNumber);
    for (let i = 1; i < terms.length; i++) {
      const term = terms[i]!;
      if (term.fromNumber <= s.firstNumber || (s.lastNumber !== null && term.fromNumber > s.lastNumber)) continue;
      if (term.amountCents === terms[i - 1]!.amountCents) continue;
      const month = seriesMonthOf(s, term.fromNumber);
      if (month < first || month > last || month < current) continue;
      push({
        kind: 'novo_valor',
        month,
        seriesId: s.id,
        description: term.description,
        amountCents: term.amountCents,
        approximate: term.amountMode === 'variavel',
        parts: 1,
      });
    }
    // Última conta de um gasto fixo com término e última parcela de um parcelamento.
    if (s.kind === 'anual' || s.lastNumber === null || s.lastNumber < s.firstNumber) continue;
    const month = seriesMonthOf(s, s.lastNumber);
    if (month < first || month < current) continue;
    const term = termFor(s.terms, s.lastNumber);
    if (!term) continue;
    push({
      kind: s.kind === 'parcelada' ? 'ultima_parcela' : 'ultima_conta',
      month,
      seriesId: s.id,
      description: term.description,
      amountCents: term.amountCents,
      approximate: term.amountMode === 'variavel',
      parts: 1,
    });
  }
  milestones.sort(
    (a, b) =>
      a.month.localeCompare(b.month) ||
      MILESTONE_ORDER.indexOf(a.kind) - MILESTONE_ORDER.indexOf(b.kind) ||
      a.description.localeCompare(b.description, 'pt-BR'),
  );
  return { months: out, milestones };
}

// ---------------------------------------------------------------------------
// Renda de referência: sugestão e formulário
// ---------------------------------------------------------------------------

/** Sugestão de renda de referência (nunca aplicada sozinha). */
export interface ReferenceSuggestion {
  amountCents: Cents;
  /** Meses fechados com recebimentos considerados, em ordem. */
  months: IsoMonth[];
}

const isReimbursement = (category: string | null) => category !== null && category.trim().toLocaleLowerCase('pt-BR') === 'reembolso';

/**
 * Entre os 3 meses fechados anteriores ao mês de hoje, os que têm algum recebimento que não é reembolso; média, com
 * metade para cima, do total desses recebimentos por mês. Reembolsos ficam fora (categoria comparada sem caixa e sem
 * espaços nas pontas). records: listRecords dos 3 meses (outros meses e gastos são ignorados). Sem nenhum: null.
 */
export function suggestReference(records: readonly FinancialRecord[], currentMonth: IsoMonth): ReferenceSuggestion | null {
  const closed = [-3, -2, -1].map((d) => addMonths(currentMonth, d));
  const totals = new Map<IsoMonth, Cents>();
  for (const r of records) {
    const m = monthOf(r.occurredOn);
    if (r.kind !== 'receita' || !closed.includes(m) || isReimbursement(r.category)) continue;
    totals.set(m, (totals.get(m) ?? 0) + r.amountCents);
  }
  const months = closed.filter((m) => (totals.get(m) ?? 0) > 0);
  if (months.length === 0) return null;
  const sum = months.reduce((acc, m) => acc + totals.get(m)!, 0);
  return { amountCents: roundDiv(sum, months.length), months };
}

/** "a", "a e b", "a, b e c". */
function joinList(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} e ${items[items.length - 1]}`;
}

/** Nomes de meses: "setembro", "julho, agosto e setembro" ou, em anos diferentes, "dezembro de 2026 e janeiro de 2027". */
function monthsText(months: readonly IsoMonth[]): string {
  const sameYear = months.every((m) => m.slice(0, 4) === months[0]!.slice(0, 4));
  return joinList(months.map((m) => (sameYear ? formatMonthName(m) : formatMonthYearBR(m))));
}

/** Mês de um texto curto: "setembro" no mesmo ano de `other`, senão "dezembro de 2026". */
function monthNear(month: IsoMonth, other: IsoMonth): string {
  return month.slice(0, 4) === other.slice(0, 4) ? formatMonthName(month) : formatMonthYearBR(month);
}

/** "Vale a partir de": de 24 meses antes a 12 depois do mês de hoje (como set_income_reference). */
export function referenceMonthBounds(today: IsoDate): { min: IsoMonth; max: IsoMonth } {
  const m = monthOf(today);
  return { min: addMonths(m, -REFERENCE_MONTHS_BACK), max: addMonths(m, REFERENCE_MONTHS_AHEAD) };
}

/** Mesmos códigos do banco: mes_invalido e referencia_fora_do_intervalo; null quando aceito. */
export function referenceMonthError(month: string, today: IsoDate): 'mes_invalido' | 'referencia_fora_do_intervalo' | null {
  if (typeof month !== 'string' || !isValidIsoMonth(month)) return 'mes_invalido';
  const { min, max } = referenceMonthBounds(today);
  return month < min || month > max ? 'referencia_fora_do_intervalo' : null;
}

/** Chips "Vale a partir de": mês passado, este e o seguinte ("Setembro" · "Outubro" · "Novembro"); padrão: este. */
export function referenceMonthChoices(today: IsoDate): { month: IsoMonth; label: string; isDefault: boolean }[] {
  const m = monthOf(today);
  return [-1, 0, 1].map((d) => {
    const month = addMonths(m, d);
    const name = formatMonthName(month);
    const label = `${name.charAt(0).toUpperCase()}${name.slice(1)}${month.slice(0, 4) === m.slice(0, 4) ? '' : ` de ${month.slice(0, 4)}`}`;
    return { month, label, isDefault: d === 0 };
  });
}

/** Mensagens da renda de referência; códigos do banco e do formulário. */
export const INCOME_REFERENCE_ERROR_TEXT = {
  ...ERROR_TEXT,
  valor_invalido: 'Informe um valor maior que zero, como 6.000,00.',
  valor_acima_do_limite: 'O valor máximo é R$ 9.999.999,99.',
  mes_invalido: 'Escolha um mês entre dois anos atrás e os próximos 12 meses.',
  referencia_fora_do_intervalo: 'Escolha um mês entre dois anos atrás e os próximos 12 meses.',
  versao_desatualizada: 'A renda de referência deste mês foi alterada em outro aparelho. Confira o valor atual antes de salvar.',
  // Sem "disponível" nos textos da renda comprometida (para não confundir com saldo).
  nao_encontrado: 'Esta renda de referência foi excluída. Confira as referências atuais.',
  // Interno (o app nunca provoca): texto genérico de falha.
  tipo_invalido: ERROR_TEXT.salvar_falhou,
} as const;

export interface IncomeReferenceDraft {
  amountText: string;
  fromMonth: IsoMonth;
  varies: boolean;
}

export type IncomeReferenceValidation =
  | { ok: true; fromMonth: IsoMonth; amountCents: Cents; varies: boolean }
  | { ok: false; errors: Partial<Record<'amountText' | 'fromMonth', string>> };

/** Validação do formulário, na ordem do banco (mês, valor). */
export function validateIncomeReferenceDraft(draft: IncomeReferenceDraft, today: IsoDate): IncomeReferenceValidation {
  const errors: Partial<Record<'amountText' | 'fromMonth', string>> = {};
  const monthError = referenceMonthError(draft.fromMonth, today);
  if (monthError) errors.fromMonth = INCOME_REFERENCE_ERROR_TEXT[monthError];
  const cents = parseBRL(draft.amountText);
  if (cents === null || cents < 1) errors.amountText = INCOME_REFERENCE_ERROR_TEXT.valor_invalido;
  else if (cents > MAX_RECORD_CENTS) errors.amountText = INCOME_REFERENCE_ERROR_TEXT.valor_acima_do_limite;
  if (errors.fromMonth || errors.amountText) return { ok: false, errors };
  return { ok: true, fromMonth: draft.fromMonth, amountCents: cents!, varies: draft.varies };
}

// ---------------------------------------------------------------------------
// Previsão dos pagamentos do mês (docs/08 §5 item 7): só em /a-pagar e só no mês de hoje
// ---------------------------------------------------------------------------

export interface PaymentsForecast {
  month: IsoMonth;
  /** Pago do mês + "Ainda a pagar" (as em aberto até o fim do mês, inclusive vencidas de meses anteriores). */
  totalCents: Cents;
  estimatedCents: Cents;
  /** "Se pagar tudo o que está em aberto, os pagamentos de outubro chegam a R$ 4.550,00." */
  text: string;
  /** "Inclui R$ 180,00 estimados." ou null. */
  estimatedText: string | null;
}

/**
 * Se a pessoa pagar hoje ou no vencimento tudo o que está em aberto, Pago do mês chega a Pago + Ainda a pagar (vencidas
 * antigas pagas agora entram em Pago deste mês, D-021(1)). Só no mês de hoje e com algo em aberto; senão null. Nunca
 * usa "Diferença", "disponível" nem "sobra", e nunca vai para o Resumo.
 */
export function paymentsForecast(paidCents: Cents, toPay: ToPaySummary): PaymentsForecast | null {
  if (!toPay.isCurrentMonth || toPay.toPayCents <= 0) return null;
  const totalCents = paidCents + toPay.toPayCents;
  return {
    month: toPay.month,
    totalCents,
    estimatedCents: toPay.estimatedCents,
    text: COMMITTED_TEXT.forecast(toPay.month, totalCents),
    estimatedText: toPay.estimatedCents > 0 ? COMMITTED_TEXT.forecastEstimated(toPay.estimatedCents) : null,
  };
}

// ---------------------------------------------------------------------------
// Textos (spec2 §4.5, com os ajustes da spec3 e das notas do Ciclo B)
// ---------------------------------------------------------------------------

const pctOrNull = (permille: number | null, cents: Cents) => (permille === null ? null : formatPermille(permille, cents));

/** Textos fixos e montados da renda comprometida, da renda de referência e da previsão dos pagamentos do mês. */
export const COMMITTED_TEXT = {
  title: 'Renda comprometida',
  planned: 'Previsto',
  retry: 'Tentar novamente',
  loadError: 'Não foi possível calcular a renda comprometida.',

  // Resumo: linha dentro do card "Ainda a pagar" (sem card novo, D-026(7)).
  /** "Renda comprometida em outubro" */
  resumoTitle: (month: IsoMonth) => `Renda comprometida em ${formatMonthName(month)}`,
  resumoNoReference: 'Veja quanto da sua renda já está comprometido',
  resumoNoReferenceA11y: 'Veja quanto da sua renda já está comprometido. Abre a renda comprometida.',
  /** "Renda comprometida em outubro: 52,5% da renda de referência. R$ 3.150,00 de R$ 6.000,00. Abre os detalhes." */
  resumoA11y: (month: IsoMonth, pct: string, committedCents: Cents, referenceCents: Cents) =>
    `Renda comprometida em ${formatMonthName(month)}: ${pct} da renda de referência. ${formatBRL(committedCents)} de ${formatBRL(referenceCents)}. Abre os detalhes.`,
  /** "Renda comprometida em outubro: 0,0% da renda de referência. Nenhuma conta a pagar com vencimento em outubro. Abre os detalhes." */
  resumoEmptyA11y: (month: IsoMonth) =>
    `Renda comprometida em ${formatMonthName(month)}: 0,0% da renda de referência. Nenhuma conta a pagar com vencimento em ${formatMonthName(month)}. Abre os detalhes.`,
  /** "Nenhuma conta a pagar com vencimento em outubro." */
  emptyMonth: (month: IsoMonth) => `Nenhuma conta a pagar com vencimento em ${formatMonthName(month)}.`,

  // Tela /renda-comprometida.
  /** "da sua renda de referência em outubro de 2026" */
  highlightCaption: (month: IsoMonth) => `da sua renda de referência em ${formatMonthYearBR(month)}`,
  /** "R$ 3.150,00 em contas de R$ 6.000,00" */
  highlightAmounts: (committedCents: Cents, referenceCents: Cents) => `${formatBRL(committedCents)} em contas de ${formatBRL(referenceCents)}`,
  /** "Já pago · R$ 2.500,00" */
  meterPaid: (cents: Cents) => `Já pago · ${formatBRL(cents)}`,
  /** "Em aberto · R$ 650,00" */
  meterOpen: (cents: Cents) => `Em aberto · ${formatBRL(cents)}`,
  /** "52,5% da renda de referência: já pago R$ 2.500,00, em aberto R$ 650,00." */
  meterA11y: (pct: string, paidCents: Cents, openCents: Cents) =>
    `${pct} da renda de referência: já pago ${formatBRL(paidCents)}, em aberto ${formatBRL(openCents)}.`,
  /** Medidor acima de 100%: o "+" no fim da barra. */
  meterOver: '+',
  groupLabel: {
    fixos: 'Gastos fixos',
    anuais: 'Contas do ano',
    parcelamentos: 'Parcelamentos',
    outras: 'Outras contas a pagar',
  } satisfies Record<CommittedGroup, string>,
  /** "Gastos fixos · R$ 2.500,00 · 41,7%" (sem percentual quando não há referência). */
  groupLine: (label: string, cents: Cents, pct: string | null) => (pct === null ? `${label} · ${formatBRL(cents)}` : `${label} · ${formatBRL(cents)} · ${pct}`),
  /** "Gastos fixos: R$ 2.500,00, 41,7% da renda de referência." */
  groupA11y: (label: string, cents: Cents, pct: string | null) =>
    pct === null ? `${label}: ${formatBRL(cents)}.` : `${label}: ${formatBRL(cents)}, ${pct} da renda de referência.`,
  /** "Dívidas: R$ 850,00 · 14,2% da renda de referência." */
  debtLine: (cents: Cents, pct: string | null) => (pct === null ? `Dívidas: ${formatBRL(cents)}.` : `Dívidas: ${formatBRL(cents)} · ${pct} da renda de referência.`),
  debtReference:
    'Referência usada pela Serasa: até 30% da renda líquida com parcelas de dívidas. É uma referência geral, não uma regra para você.',
  debtReferenceSource: 'Fonte: Serasa, página sobre comprometimento de renda, consultada em 09/10/2026.',
  hideReference: 'Ocultar referência',
  showReference: 'Mostrar referência',
  /** "Fora dos compromissos: R$ 2.850,00" */
  outside: (cents: Cents) => `Fora dos compromissos: ${formatBRL(cents)}`,
  outsideNote: 'Não é saldo: ainda precisa cobrir gastos do dia a dia, como mercado, e não considera o dinheiro que já estava na conta.',
  /** "Inclui R$ 180,00 em valores estimados." */
  estimated: (cents: Cents) => `Inclui ${formatBRL(cents)} em valores estimados.`,
  /** "Além disso, R$ 40,00 de contas vencidas antes de outubro continuam em aberto. Elas contam no mês do vencimento." */
  overdueBefore: (cents: Cents, month: IsoMonth) =>
    `Além disso, ${formatBRL(cents)} de contas vencidas antes de ${formatMonthName(month)} continuam em aberto. Elas contam no mês do vencimento.`,
  seeOverdue: 'Ver contas vencidas',
  /** "As contas do mês passam a renda de referência em R$ 720,00." */
  overReference: (cents: Cents) => `As contas do mês passam a renda de referência em ${formatBRL(cents)}.`,
  /** "Contas do ano: R$ 350,00 por mês se dividir o valor do ano por 12." (P-019, fora do percentual) */
  annualShare: (monthlyCents: Cents) => `Contas do ano: ${formatBRL(monthlyCents)} por mês se dividir o valor do ano por 12.`,
  annualShareNote: 'Não entra no percentual.',
  annualShareEstimated: 'O valor do ano usa valores estimados.',
  /** "R$ 6.000,00 por mês, desde setembro de 2026" */
  referenceLine: (cents: Cents, fromMonth: IsoMonth) => `${formatBRL(cents)} por mês, desde ${formatMonthYearBR(fromMonth)}`,
  /** "Recebido em outubro: R$ 6.000,00" */
  received: (month: IsoMonth, cents: Cents) => `Recebido em ${formatMonthName(month)}: ${formatBRL(cents)}`,
  change: 'Alterar',
  /** "Referência de setembro. Revise para outubro." */
  reviewHint: (fromMonth: IsoMonth, month: IsoMonth) => `Referência de ${monthNear(fromMonth, month)}. Revise para ${monthNear(month, fromMonth)}.`,
  review: 'Revisar',
  /** "Contas de outubro" */
  noReferenceLabel: (month: IsoMonth) => `Contas de ${formatMonthName(month)}`,
  noReferenceHint: 'Para ver quanto isso representa da sua renda, informe sua renda de referência.',
  noReferenceButton: 'Informar renda de referência',
  monthBills: 'Contas do mês',
  upcomingTitle: 'Próximos meses',
  upcomingLegend: 'Previsto: contas já criadas e repetições programadas. Valores estimados podem mudar.',
  milestonesTitle: 'O que muda',
  howTitle: 'Como calculamos',
  /** Critério escrito do mês mostrado. */
  how: (month: IsoMonth) =>
    `Somamos as contas a pagar com vencimento em ${formatMonthName(month)}: o valor pago das que já foram pagas e o valor previsto das que estão em aberto. ` +
    'Gastos anotados sem conta a pagar, como mercado, ficam fora. Por isso este número é diferente de Pago e de Ainda a pagar.',
  howLink: 'Como ler este número',
  links: {
    series: 'Gastos fixos e parcelamentos',
    payables: 'Contas a pagar',
    whoSees: 'Quem vê estes dados?',
  },

  // Tela /renda-comprometida/referencia.
  reference: {
    title: 'Renda de referência',
    intro: 'Quanto costuma cair na sua conta por mês, já com descontos. Usamos esse valor só para calcular percentuais. Ele não conta como recebido.',
    amountLabel: 'Valor por mês',
    /** "Nos meses com recebimentos anotados, a média foi R$ 6.000,00 (setembro). Reembolsos ficam fora." */
    suggestion: (cents: Cents, months: readonly IsoMonth[]) =>
      `Nos meses com recebimentos anotados, a média foi ${formatBRL(cents)} (${monthsText(months)}). Reembolsos ficam fora.`,
    /** "Usar R$ 6.000,00" */
    useSuggestion: (cents: Cents) => `Usar ${formatBRL(cents)}`,
    fromLabel: 'Vale a partir de',
    fixed: 'Minha renda é fixa',
    varies: 'Minha renda varia',
    variesHint: 'Vamos pedir uma revisão no começo de cada mês.',
    save: 'Salvar renda de referência',
    delete: 'Excluir esta referência',
    /** "Excluir a renda de referência de outubro?" */
    deleteTitle: (fromMonth: IsoMonth) => `Excluir a renda de referência de ${formatMonthName(fromMonth)}?`,
    deleteBody: 'A referência anterior volta a valer. Sem nenhuma, mostramos só os valores em reais.',
    deleteConfirm: 'Excluir referência',
    cancel: 'Cancelar',
    /** "Renda de referência salva. Ela vale a partir de outubro." */
    saved: (fromMonth: IsoMonth) => `Renda de referência salva. Ela vale a partir de ${formatMonthName(fromMonth)}.`,
    /** "Renda de referência excluída." */
    deleted: 'Renda de referência excluída.',
    monthError: 'Escolha um mês entre dois anos atrás e os próximos 12 meses.',
  },

  // /a-pagar, só no mês de hoje: previsão dos pagamentos do mês.
  /** "Se pagar tudo o que está em aberto, os pagamentos de outubro chegam a R$ 4.550,00." */
  forecast: (month: IsoMonth, cents: Cents) =>
    `Se pagar tudo o que está em aberto, os pagamentos de ${formatMonthName(month)} chegam a ${formatBRL(cents)}.`,
  /** "Inclui R$ 180,00 estimados." */
  forecastEstimated: (cents: Cents) => `Inclui ${formatBRL(cents)} estimados.`,
} as const;

/** Linha "Renda comprometida" no card "Ainda a pagar" do Resumo (depois do resumo tocável). */
export type CommittedLine =
  | { kind: 'sem_referencia'; title: string; a11yLabel: string }
  | { kind: 'percentual'; title: string; value: string; caption: string | null; meter: CommittedMeter; a11yLabel: string };

/** Estado da linha do Resumo. Carregando e erro ficam no app (Skeleton; erro com "Tentar novamente", nunca 0%). */
export function committedLine(s: CommittedSummary): CommittedLine {
  if (s.referenceCents === null || s.committedPermille === null || s.meter === null) {
    return { kind: 'sem_referencia', title: COMMITTED_TEXT.resumoNoReference, a11yLabel: COMMITTED_TEXT.resumoNoReferenceA11y };
  }
  const value = formatPermille(s.committedPermille, s.committedCents);
  const empty = s.count === 0;
  return {
    kind: 'percentual',
    title: COMMITTED_TEXT.resumoTitle(s.month),
    value,
    caption: empty ? COMMITTED_TEXT.emptyMonth(s.month) : null,
    meter: s.meter,
    a11yLabel: empty
      ? COMMITTED_TEXT.resumoEmptyA11y(s.month)
      : COMMITTED_TEXT.resumoA11y(s.month, value, s.committedCents, s.referenceCents),
  };
}

/** Linha de um grupo da composição. */
export interface CommittedGroupLine {
  group: CommittedGroup;
  label: string;
  cents: Cents;
  permille: number | null;
  /** "41,7%" ou null sem referência. */
  percentText: string | null;
  /** "Gastos fixos · R$ 2.500,00 · 41,7%" */
  line: string;
  a11yLabel: string;
}

/** Textos da tela /renda-comprometida para o mês mostrado (null quando o bloco não aparece). */
export interface CommittedTexts {
  /** "52,5%" (único número grande); null sem referência. */
  highlight: string | null;
  highlightCaption: string | null;
  highlightAmounts: string | null;
  meterPaid: string;
  meterOpen: string;
  meterA11y: string | null;
  groups: CommittedGroupLine[];
  /** Só com dívidas no mês. */
  debt: string | null;
  /** null sem referência ou acima dela (aí aparece overReference). */
  outside: string | null;
  outsideNote: string | null;
  estimated: string | null;
  overdueBefore: string | null;
  overReference: string | null;
  annualShare: string | null;
  annualShareNote: string | null;
  reference: string | null;
  received: string | null;
  review: string | null;
  noReference: { label: string; amount: string; hint: string; button: string } | null;
  empty: string | null;
  how: string;
}

/** Monta os textos da tela. receivedCents: Recebido do mês (summarizeMonth), mostrado ao lado da referência. */
export function committedTexts(s: CommittedSummary, receivedCents: Cents | null = null): CommittedTexts {
  const ref = s.referenceCents;
  const pct = pctOrNull(s.committedPermille, s.committedCents);
  const groupCents: Record<CommittedGroup, Cents> = { fixos: s.fixedCents, anuais: s.annualCents, parcelamentos: s.installmentCents, outras: s.otherCents };
  const groupPermille: Record<CommittedGroup, number | null> = {
    fixos: s.fixedPermille,
    anuais: s.annualPermille,
    parcelamentos: s.installmentPermille,
    outras: s.otherPermille,
  };
  // Contas do ano só aparecem na composição quando há alguma no mês (antes do Ciclo A3, o grupo não existia).
  const groups = COMMITTED_GROUPS.filter((g) => g !== 'anuais' || s.annualCents > 0 || s.items.anuais.length > 0).map((group) => {
    const label = COMMITTED_TEXT.groupLabel[group];
    const cents = groupCents[group];
    const percentText = pctOrNull(groupPermille[group], cents);
    return {
      group,
      label,
      cents,
      permille: groupPermille[group],
      percentText,
      line: COMMITTED_TEXT.groupLine(label, cents, percentText),
      a11yLabel: COMMITTED_TEXT.groupA11y(label, cents, percentText),
    };
  });
  return {
    highlight: pct,
    highlightCaption: ref === null ? null : COMMITTED_TEXT.highlightCaption(s.month),
    highlightAmounts: ref === null ? null : COMMITTED_TEXT.highlightAmounts(s.committedCents, ref),
    meterPaid: COMMITTED_TEXT.meterPaid(s.paidPartCents),
    meterOpen: COMMITTED_TEXT.meterOpen(s.openPartCents),
    meterA11y: pct === null ? null : COMMITTED_TEXT.meterA11y(pct, s.paidPartCents, s.openPartCents),
    groups,
    debt: s.debtCents > 0 ? COMMITTED_TEXT.debtLine(s.debtCents, pctOrNull(s.debtPermille, s.debtCents)) : null,
    // Acima da referência, a frase "passam a renda de referência" substitui um valor negativo.
    outside: s.outsideCents === null || s.outsideCents < 0 ? null : COMMITTED_TEXT.outside(s.outsideCents),
    outsideNote: s.outsideCents === null || s.outsideCents < 0 ? null : COMMITTED_TEXT.outsideNote,
    estimated: s.estimatedOpenCents > 0 ? COMMITTED_TEXT.estimated(s.estimatedOpenCents) : null,
    overdueBefore: s.overdueBeforeCents > 0 ? COMMITTED_TEXT.overdueBefore(s.overdueBeforeCents, s.month) : null,
    overReference: s.overReference && ref !== null ? COMMITTED_TEXT.overReference(s.committedCents - ref) : null,
    annualShare: s.annualShare ? COMMITTED_TEXT.annualShare(s.annualShare.monthlyCents) : null,
    annualShareNote: s.annualShare ? COMMITTED_TEXT.annualShareNote : null,
    reference: s.reference ? COMMITTED_TEXT.referenceLine(s.reference.amountCents, s.reference.fromMonth) : null,
    received: s.reference && receivedCents !== null ? COMMITTED_TEXT.received(s.month, receivedCents) : null,
    review: s.needsReview && s.reference ? COMMITTED_TEXT.reviewHint(s.reference.fromMonth, s.month) : null,
    noReference:
      ref === null
        ? {
            label: COMMITTED_TEXT.noReferenceLabel(s.month),
            amount: formatBRL(s.committedCents),
            hint: COMMITTED_TEXT.noReferenceHint,
            button: COMMITTED_TEXT.noReferenceButton,
          }
        : null,
    empty: s.count === 0 ? COMMITTED_TEXT.emptyMonth(s.month) : null,
    how: COMMITTED_TEXT.how(s.month),
  };
}
