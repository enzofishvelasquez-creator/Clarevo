import type { IsoDate, IsoMonth } from './dates';
import { addDays, addMonths, dateInMonth, daysInMonth, formatDateBR, formatMonthBR, formatMonthName, formatMonthYearBR, isValidIsoMonth, monthOf } from './dates';
import { isBusinessDay, isCommitmentOverdue, weekdayName } from './dia-util';
import type { Investment, InvestmentPlan } from './investments';
import type { Cents } from './money';
import { formatBRL } from './money';
import type { Commitment, CommitmentSeries, Goal } from './records';
import { projectSeries } from './series';

/**
 * Calendário financeiro (D-105): uma tela só de leitura que junta, mês a mês, o que tem data. Nada é gravado aqui; cada item abre a tela
 * dele. As regras:
 *
 * C1. Contas a pagar e faturas com vencimento no mês, como estão no banco (as em aberto pelo valor previsto, as pagas pelo valor pago).
 *     A partir do mês de hoje, os gastos fixos, parcelamentos e contas do ano que ainda não têm conta criada entram como previsão
 *     (`projectSeries`, a mesma de "Próximos meses"); meses que já passaram não recebem previsão.
 * C2. Total do mês sem misturar previsto com realizado: "Previsto em contas e faturas" soma só o que está em aberto ou previsto; o que já
 *     foi pago tem a própria linha. Os aportes planejados das metas têm outra linha e nunca entram nas contas. O plano de aportes dos
 *     investimentos aparece como item, sem somar com as metas (pode ser o mesmo dinheiro).
 * C3. Aportes planejados (metas com plano por mês, plano de aportes dos investimentos) só do mês de hoje em diante, enquanto a meta
 *     está ativa, ainda não chegou ao valor e o prazo (se houver) não passou. O dia é o do lembrete do aporte, quando a pessoa o ligou
 *     neste aparelho; sem ele, o item fica "no mês", sem dia.
 * C4. Investimentos (vencimento e plano de aportes) e a temporada do Imposto de Renda só no Pessoal. O informe de rendimentos chega até
 *     o último dia útil de fevereiro (dia útil pela mesma regra dos vencimentos, `isBusinessDay`). O prazo da declaração muda a cada ano:
 *     de março a maio, o item manda conferir a data oficial, sem data inventada.
 * C5. Sem cor de alerta, sem cobrança: conta vencida diz "venceu em", e o resto é fato.
 */

/** O seletor do calendário vai de 24 meses antes a 12 meses depois do mês de hoje. */
export const CALENDAR_MONTH_RANGE = { back: 24, forward: 12 } as const;

/** Mês dentro do que o seletor oferece. */
export function isCalendarMonth(month: unknown, currentMonth: IsoMonth): month is IsoMonth {
  return (
    typeof month === 'string' &&
    isValidIsoMonth(month) &&
    month >= addMonths(currentMonth, -CALENDAR_MONTH_RANGE.back) &&
    month <= addMonths(currentMonth, CALENDAR_MONTH_RANGE.forward)
  );
}

/** O mês que o calendário abre: o do endereço, se valer; senão, o de hoje. */
export function calendarStartMonth(param: string | string[] | undefined, currentMonth: IsoMonth): IsoMonth {
  const value = Array.isArray(param) ? param[0] : param;
  return isCalendarMonth(value, currentMonth) ? value : currentMonth;
}

/** O mês seguinte ou anterior dentro da faixa; fora dela, null (o botão fica desativado). */
export function calendarStep(month: IsoMonth, currentMonth: IsoMonth, delta: 1 | -1): IsoMonth | null {
  const next = addMonths(month, delta);
  return isCalendarMonth(next, currentMonth) ? next : null;
}

/** Parâmetro de endereço para abrir o calendário num mês: o mês de hoje é o padrão e não vai no endereço. */
export function calendarMonthParams(month: IsoMonth, currentMonth: IsoMonth): { mes?: IsoMonth } {
  return month === currentMonth ? {} : { mes: month };
}

export type CalendarItemKind =
  | 'conta'
  | 'fatura'
  | 'previsto'
  | 'vencimento_investimento'
  | 'plano_aportes'
  | 'aporte_meta'
  | 'informe_ir'
  | 'declaracao_ir';

/** Para onde o toque leva. A tela traduz em endereço. */
export type CalendarTarget =
  | { kind: 'conta'; commitmentId: string; invoice: { cardId: string; month: IsoMonth } | null }
  | { kind: 'gasto_fixo'; seriesId: string }
  | { kind: 'investimento'; investmentId: string }
  | { kind: 'plano_aportes' }
  | { kind: 'meta'; goalId: string }
  | { kind: 'tema'; slug: 'imposto-de-renda' };

/** Como o valor do item entra nos totais: em aberto ou previsto, já pago ou aporte planejado. */
export type CalendarAmountKind = 'previsto' | 'pago' | 'planejado';

export interface CalendarItem {
  key: string;
  kind: CalendarItemKind;
  /** O dia; null para o que vale no mês sem dia marcado. */
  date: IsoDate | null;
  title: string;
  /** Uma linha curta: "Conta a pagar · em aberto", "Paga em 05/10/2026", "Gasto fixo · previsto". */
  caption: string;
  amountCents: Cents | null;
  amountKind: CalendarAmountKind | null;
  /** Valor de referência de conta que muda (luz, água) ou de fatura em aberto. */
  estimate: boolean;
  target: CalendarTarget;
}

export interface CalendarDay {
  date: IsoDate;
  /** "Hoje, 7 de outubro" ou "Quinta, 15 de outubro". */
  title: string;
  items: CalendarItem[];
}

export interface CalendarTotals {
  /** Contas e faturas em aberto e gastos fixos previstos do mês (previsto). */
  toPayCents: Cents;
  toPayCount: number;
  /** Parte do previsto que é valor de referência (estimado). */
  toPayEstimatedCents: Cents;
  /** Contas e faturas do mês já pagas (realizado), pelo valor pago. */
  paidCents: Cents;
  paidCount: number;
  /** Aportes planejados nas metas (previsto). */
  goalsPlannedCents: Cents;
  goalsPlannedCount: number;
}

export interface FinancialCalendar {
  month: IsoMonth;
  days: CalendarDay[];
  /** O que vale no mês sem dia marcado, depois dos dias. */
  undated: CalendarItem[];
  totals: CalendarTotals;
  empty: boolean;
}

export interface CalendarInput {
  month: IsoMonth;
  today: IsoDate;
  /** Contas vivas com vencimento no mês (`listCommitmentsDueBetween(contexto, mês, mês)`); outras datas são ignoradas. */
  commitments: readonly Commitment[];
  /** Gastos fixos, parcelamentos e contas do ano do contexto (`listSeries`), para a previsão. */
  series: readonly CommitmentSeries[];
  /** Metas do contexto (`listGoals`). */
  goals: readonly Pick<Goal, 'id' | 'name' | 'goalType' | 'status' | 'plannedMonthlyCents' | 'targetCents' | 'savedCents' | 'targetMonth'>[];
  /** Pessoal: investimentos, plano de aportes e a temporada do Imposto de Renda entram. Na Família, não. */
  personal: boolean;
  /** Investimentos do Pessoal (null na Família ou sem leitura). */
  investments: readonly Pick<Investment, 'id' | 'name' | 'status' | 'maturityOn'>[] | null;
  investmentPlan: Pick<InvestmentPlan, 'plannedMonthlyCents'> | null;
  /** Dia do lembrete para guardar nas metas, quando ligado neste aparelho; null sem lembrete. */
  goalDepositDay: number | null;
  /** Dia do lembrete do aporte nos investimentos, quando ligado neste aparelho; null sem lembrete. */
  investmentDepositDay: number | null;
}

export const CALENDAR_TEXT = {
  title: 'Calendário',
  intro: 'Contas, faturas, vencimentos e datas do mês, num lugar só. Toque em um item para abrir a tela dele.',
  /** Linha em Movimentos › Organizar e no Resumo. */
  rowTitle: 'Calendário do mês',
  rowCaption: 'Contas, faturas e datas do mês, num lugar só',
  monthGroup: 'Mês do calendário',
  previous: (month: IsoMonth) => `Mês anterior: ${formatMonthBR(month).toLowerCase()}`,
  next: (month: IsoMonth) => `Próximo mês: ${formatMonthBR(month).toLowerCase()}`,
  backToCurrent: (month: IsoMonth) => `Voltar para ${formatMonthBR(month).toLowerCase()}`,
  totalsTitle: 'No mês',
  /** O previsto, sempre com a palavra "previsto". */
  toPayLabel: 'Previsto em contas e faturas',
  toPayCaption: (count: number) => `${count} ${count === 1 ? 'conta em aberto ou prevista' : 'contas em aberto ou previstas'}. Valores previstos, separados do que já foi pago.`,
  toPayEstimated: (cents: Cents) => `Inclui ${formatBRL(cents)} em valores estimados.`,
  toPayNone: 'Nenhuma conta em aberto ou prevista neste mês.',
  /** Realizado: o que já foi pago, à parte. */
  paidLine: (cents: Cents, count: number) => `Já pago: ${formatBRL(cents)} em ${count} ${count === 1 ? 'conta' : 'contas'}.`,
  goalsPlannedLine: (cents: Cents) => `Aportes planejados nas metas: ${formatBRL(cents)}, previsto.`,
  goalsPlannedNote: 'Planos de guardar são intenção: não entram em Pago nem nas contas.',
  undatedTitle: 'No mês, sem dia marcado',
  empty: (month: IsoMonth) => `Nada com data em ${formatMonthYearBR(month)}.`,
  emptyBody: 'Contas a pagar, faturas, gastos fixos e aportes planejados aparecem aqui no dia de cada um.',
  loading: 'Carregando o calendário',
  loadError: 'Não foi possível carregar o calendário.',
  investmentsPersonal: 'Vencimentos e plano de aportes dos investimentos aparecem só no seu Pessoal.',
  readOnly: 'O calendário só mostra: para pagar, editar ou registrar, abra o item.',
  depositDayHint: 'O dia dos aportes planejados é o do lembrete para guardar, se você o ligou em Conta, Lembretes do dia a dia.',
  caption: {
    open: 'Conta a pagar · em aberto',
    overdue: (dueOn: IsoDate) => `Conta a pagar · venceu em ${formatDateBR(dueOn)}`,
    paid: (paidOn: IsoDate) => `Paga em ${formatDateBR(paidOn)}`,
    invoiceOpen: 'Fatura de cartão · em aberto',
    invoiceOverdue: (dueOn: IsoDate) => `Fatura de cartão · venceu em ${formatDateBR(dueOn)}`,
    invoicePaid: (paidOn: IsoDate) => `Fatura paga em ${formatDateBR(paidOn)}`,
    plannedFixed: 'Gasto fixo · previsto',
    plannedInstallment: (n: number, total: number | null) => (total === null ? `Parcela ${n} · prevista` : `Parcela ${n} de ${total} · prevista`),
    plannedAnnual: 'Conta do ano · prevista',
    maturity: 'Vencimento do investimento',
    investmentPlan: 'Aporte planejado nos investimentos',
    goal: 'Aporte planejado para a meta',
    reserve: 'Aporte planejado para a reserva',
  },
  estimateSuffix: 'valor estimado',
  investmentPlanTitle: 'Plano de aportes',
  informTitle: 'Informes de rendimentos',
  informCaption: 'Bancos, corretoras e quem pagou você entregam os informes até o último dia útil de fevereiro.',
  declarationTitle: 'Declaração do Imposto de Renda',
  declarationCaption: 'A Receita Federal define o prazo de cada ano. Confira a data oficial no site da Receita.',
  /** Nome acessível de um item: "Internet, R$ 150,00, conta a pagar · em aberto. 15 de outubro." */
  itemA11y: (item: Pick<CalendarItem, 'title' | 'caption' | 'amountCents' | 'estimate' | 'date'>) => {
    const value = item.amountCents === null ? '' : `, ${formatBRL(item.amountCents)}${item.estimate ? `, ${CALENDAR_TEXT.estimateSuffix}` : ''}`;
    const when = item.date === null ? 'No mês, sem dia marcado.' : `${Number(item.date.slice(8, 10))} de ${formatMonthName(monthOf(item.date))}.`;
    // Legenda que já termina em ponto (as do Imposto de Renda) não ganha outro.
    return `${item.title}${value}. ${item.caption.replace(/\.$/, '')}. ${when}`;
  },
} as const;

const upperFirst = (text: string): string => `${text.charAt(0).toUpperCase()}${text.slice(1)}`;

/** "Hoje, 7 de outubro" ou "Quinta, 15 de outubro". */
export function calendarDayTitle(date: IsoDate, today: IsoDate): string {
  const day = `${Number(date.slice(8, 10))} de ${formatMonthName(monthOf(date))}`;
  return date === today ? `Hoje, ${day}` : `${upperFirst(weekdayName(date))}, ${day}`;
}

/** O último dia útil de um mês (sem sábado, domingo e feriado nacional), como na regra dos vencimentos. */
export function lastBusinessDayOf(month: IsoMonth): IsoDate {
  const [y, m] = month.split('-').map(Number) as [number, number];
  let day = dateInMonth(month, daysInMonth(y, m));
  for (let i = 0; i < 10 && !isBusinessDay(day); i++) day = addDays(day, -1);
  return day;
}

/** Dia do lembrete no mês, limitado ao último dia (os dias oferecidos vão até 25, mas a regra não depende disso). */
function dayIn(month: IsoMonth, day: number | null): IsoDate | null {
  if (day === null || !Number.isInteger(day) || day < 1) return null;
  const [y, m] = month.split('-').map(Number) as [number, number];
  return dateInMonth(month, Math.min(day, daysInMonth(y, m)));
}

/** Os itens de um mês, em dias e "no mês", com os totais (C1 a C5). Não altera o que recebe. */
export function buildFinancialCalendar(input: CalendarInput): FinancialCalendar {
  const { month, today } = input;
  const current = monthOf(today);
  const items: CalendarItem[] = [];
  const totals: CalendarTotals = { toPayCents: 0, toPayCount: 0, toPayEstimatedCents: 0, paidCents: 0, paidCount: 0, goalsPlannedCents: 0, goalsPlannedCount: 0 };
  const T = CALENDAR_TEXT.caption;

  // C1: contas e faturas do mês, como estão.
  const inMonth = input.commitments.filter((c) => monthOf(c.dueOn) === month);
  for (const c of inMonth) {
    const invoice = c.invoice ? { cardId: c.invoice.cardId, month: c.invoice.month } : null;
    const target: CalendarTarget = { kind: 'conta', commitmentId: c.id, invoice };
    if (c.status === 'quitado' && c.payment) {
      items.push({
        key: `conta-${c.id}`,
        kind: invoice ? 'fatura' : 'conta',
        date: c.dueOn,
        title: c.description,
        caption: invoice ? T.invoicePaid(c.payment.paidOn) : T.paid(c.payment.paidOn),
        amountCents: c.payment.amountCents,
        amountKind: 'pago',
        estimate: false,
        target,
      });
      totals.paidCents += c.payment.amountCents;
      totals.paidCount += 1;
      continue;
    }
    const overdue = isCommitmentOverdue(c, today);
    items.push({
      key: `conta-${c.id}`,
      kind: invoice ? 'fatura' : 'conta',
      date: c.dueOn,
      title: c.description,
      caption: invoice ? (overdue ? T.invoiceOverdue(c.dueOn) : T.invoiceOpen) : overdue ? T.overdue(c.dueOn) : T.open,
      amountCents: c.amountCents,
      amountKind: 'previsto',
      estimate: c.amountIsEstimate,
      target,
    });
    totals.toPayCents += c.amountCents;
    totals.toPayCount += 1;
    if (c.amountIsEstimate) totals.toPayEstimatedCents += c.amountCents;
  }

  // C1: a previsão das séries, só do mês de hoje em diante.
  if (month >= current) {
    for (const s of input.series) {
      for (const p of projectSeries(s, inMonth, month, month)) {
        const caption = s.kind === 'parcelada' ? T.plannedInstallment(p.number, s.installmentTotal) : s.kind === 'anual' ? T.plannedAnnual : T.plannedFixed;
        items.push({
          key: `previsto-${s.id}-${p.number}`,
          kind: 'previsto',
          date: p.dueOn,
          title: p.description,
          caption,
          amountCents: p.amountCents,
          amountKind: 'previsto',
          estimate: p.amountIsEstimate,
          target: { kind: 'gasto_fixo', seriesId: s.id },
        });
        totals.toPayCents += p.amountCents;
        totals.toPayCount += 1;
        if (p.amountIsEstimate) totals.toPayEstimatedCents += p.amountCents;
      }
    }
  }

  // C3: aportes planejados nas metas, do mês de hoje em diante.
  if (month >= current) {
    const goalDate = dayIn(month, input.goalDepositDay);
    for (const g of input.goals) {
      if (g.status !== 'ativa' || g.plannedMonthlyCents === null || g.plannedMonthlyCents <= 0) continue;
      if (g.savedCents >= g.targetCents) continue;
      if (g.targetMonth !== null && month > g.targetMonth) continue;
      items.push({
        key: `meta-${g.id}`,
        kind: 'aporte_meta',
        date: goalDate,
        title: g.name,
        caption: g.goalType === 'emergencia' ? T.reserve : T.goal,
        amountCents: g.plannedMonthlyCents,
        amountKind: 'planejado',
        estimate: false,
        target: { kind: 'meta', goalId: g.id },
      });
      totals.goalsPlannedCents += g.plannedMonthlyCents;
      totals.goalsPlannedCount += 1;
    }
  }

  // C4: investimentos e Imposto de Renda, só no Pessoal.
  if (input.personal) {
    for (const i of input.investments ?? []) {
      if (i.status !== 'ativo' || i.maturityOn === null || monthOf(i.maturityOn) !== month) continue;
      items.push({
        key: `vencimento-${i.id}`,
        kind: 'vencimento_investimento',
        date: i.maturityOn,
        title: i.name,
        caption: T.maturity,
        amountCents: null,
        amountKind: null,
        estimate: false,
        target: { kind: 'investimento', investmentId: i.id },
      });
    }
    if (input.investments !== null && input.investmentPlan && month >= current) {
      items.push({
        key: 'plano-aportes',
        kind: 'plano_aportes',
        date: dayIn(month, input.investmentDepositDay),
        title: CALENDAR_TEXT.investmentPlanTitle,
        caption: T.investmentPlan,
        amountCents: input.investmentPlan.plannedMonthlyCents,
        amountKind: 'planejado',
        estimate: false,
        target: { kind: 'plano_aportes' },
      });
    }
    const m = Number(month.slice(5, 7));
    if (m === 2) {
      items.push({
        key: 'informe-ir',
        kind: 'informe_ir',
        date: lastBusinessDayOf(month),
        title: CALENDAR_TEXT.informTitle,
        caption: CALENDAR_TEXT.informCaption,
        amountCents: null,
        amountKind: null,
        estimate: false,
        target: { kind: 'tema', slug: 'imposto-de-renda' },
      });
    }
    if (m >= 3 && m <= 5) {
      items.push({
        key: 'declaracao-ir',
        kind: 'declaracao_ir',
        date: null,
        title: CALENDAR_TEXT.declarationTitle,
        caption: CALENDAR_TEXT.declarationCaption,
        amountCents: null,
        amountKind: null,
        estimate: false,
        target: { kind: 'tema', slug: 'imposto-de-renda' },
      });
    }
  }

  const ORDER: Record<CalendarItemKind, number> = {
    informe_ir: 0,
    vencimento_investimento: 1,
    fatura: 2,
    conta: 3,
    previsto: 4,
    plano_aportes: 5,
    aporte_meta: 6,
    declaracao_ir: 7,
  };
  const byOrder = (a: CalendarItem, b: CalendarItem) => ORDER[a.kind] - ORDER[b.kind] || a.title.localeCompare(b.title, 'pt-BR') || a.key.localeCompare(b.key);
  const dated = items.filter((i) => i.date !== null).sort((a, b) => a.date!.localeCompare(b.date!) || byOrder(a, b));
  const days: CalendarDay[] = [];
  for (const item of dated) {
    const last = days[days.length - 1];
    if (last && last.date === item.date) last.items.push(item);
    else days.push({ date: item.date!, title: calendarDayTitle(item.date!, today), items: [item] });
  }
  const undated = items.filter((i) => i.date === null).sort(byOrder);
  return { month, days, undated, totals, empty: items.length === 0 };
}

/** Linhas dos totais, só com o que existe no mês (C2). */
export function calendarTotalsLines(t: CalendarTotals): { toPay: string | null; estimated: string | null; paid: string | null; goals: string | null } {
  return {
    toPay: t.toPayCount > 0 ? CALENDAR_TEXT.toPayCaption(t.toPayCount) : null,
    estimated: t.toPayEstimatedCents > 0 ? CALENDAR_TEXT.toPayEstimated(t.toPayEstimatedCents) : null,
    paid: t.paidCount > 0 ? CALENDAR_TEXT.paidLine(t.paidCents, t.paidCount) : null,
    goals: t.goalsPlannedCount > 0 ? CALENDAR_TEXT.goalsPlannedLine(t.goalsPlannedCents) : null,
  };
}
