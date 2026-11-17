import type { IsoDate, IsoMonth } from './dates';
import { addDays, formatDateBR, formatMonthName, isValidIsoDate, monthOf } from './dates';
import { calendarDaysBetween } from './investment-details';
import type { Investment } from './investments';
import type { Cents } from './money';
import { formatBRL } from './money';
import { ROUTINE_REMINDER_ID_PREFIX, ROUTINE_REMINDER_ROUTE, ROUTINE_REMINDER_TEXT, type RoutineReminderItem } from './routine-reminders';

/**
 * Lembretes dos investimentos com adiar e pausar (D-104, item 6): o aporte do plano, os vencimentos (e o fim da carência) e o valor sem
 * atualização. Em tom de fato, com uma pergunta ("Hoje é o dia do aporte de R$ 600,00 do seu plano de investimentos. Quer registrar?"), sem
 * cobrança, sem pressa e sem cor de alerta.
 *
 * L1. Adiar ("Lembrar de novo em 3 dias") e pausar ("Pausar este lembrete por 30 dias") valem por tipo de lembrete, para os avisos no
 *     celular e para os cartões do detalhe. A escolha fica só no aparelho (como os interruptores dos lembretes) e passa sozinha na data.
 * L2. Pausado: nenhum aviso do tipo antes da data, nem o cartão no detalhe. Adiado: nenhum aviso do tipo até a data; na data, um aviso só,
 *     se o fato ainda vale (o mês ainda sem aporte com plano; algum investimento ainda sem o valor do mês passado; um vencimento ou fim de
 *     carência de 30 dias antes até 7 dias depois da data).
 * L3. Na tela bloqueada, como os outros lembretes do dia a dia: sem nome, sem valor. Os valores aparecem só dentro do app, com "Ocultar
 *     valores" valendo.
 */

export type InvestmentReminderKind = 'aporte_investimentos' | 'vencimentos' | 'atualizar';
export const INVESTMENT_REMINDER_KINDS: readonly InvestmentReminderKind[] = ['aporte_investimentos', 'vencimentos', 'atualizar'];
export const REMINDER_SNOOZE_DAYS = 3;
export const REMINDER_PAUSE_DAYS = 30;
/** Vencimentos que o lembrete mostra: de 30 dias atrás (ainda ativos) até 30 dias à frente. */
export const REMINDER_DUE_WINDOW_DAYS = 30;

export interface ReminderHold {
  snoozedUntil: IsoDate | null;
  pausedUntil: IsoDate | null;
}
export type InvestmentReminderHolds = Readonly<Partial<Record<InvestmentReminderKind, ReminderHold>>>;

export function isInvestmentReminderKind(v: unknown): v is InvestmentReminderKind {
  return typeof v === 'string' && (INVESTMENT_REMINDER_KINDS as readonly string[]).includes(v);
}

/** O que foi guardado no aparelho vira escolhas válidas (datas no formato; o resto cai fora). */
export function parseInvestmentReminderHolds(value: unknown): InvestmentReminderHolds {
  const out: Partial<Record<InvestmentReminderKind, ReminderHold>> = {};
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return out;
  for (const k of INVESTMENT_REMINDER_KINDS) {
    const h = (value as Record<string, unknown>)[k];
    if (typeof h !== 'object' || h === null) continue;
    const date = (v: unknown) => (typeof v === 'string' && isValidIsoDate(v) ? v : null);
    const hold = { snoozedUntil: date((h as Record<string, unknown>).snoozedUntil), pausedUntil: date((h as Record<string, unknown>).pausedUntil) };
    if (hold.snoozedUntil || hold.pausedUntil) out[k] = hold;
  }
  return out;
}

export function snoozeReminder(holds: InvestmentReminderHolds, kind: InvestmentReminderKind, today: IsoDate, days = REMINDER_SNOOZE_DAYS): InvestmentReminderHolds {
  return { ...holds, [kind]: { snoozedUntil: addDays(today, days), pausedUntil: null } };
}

export function pauseReminder(holds: InvestmentReminderHolds, kind: InvestmentReminderKind, today: IsoDate, days = REMINDER_PAUSE_DAYS): InvestmentReminderHolds {
  return { ...holds, [kind]: { snoozedUntil: null, pausedUntil: addDays(today, days) } };
}

export function resumeReminder(holds: InvestmentReminderHolds, kind: InvestmentReminderKind): InvestmentReminderHolds {
  const next = { ...holds };
  delete next[kind];
  return next;
}

export type ReminderHoldState = { state: 'ativo' } | { state: 'adiado'; until: IsoDate } | { state: 'pausado'; until: IsoDate };

/** O estado de hoje (L1): a pausa vale até a véspera da data; o adiamento, até o próprio dia (o aviso adiado sai nele). */
export function reminderHoldState(holds: InvestmentReminderHolds, kind: InvestmentReminderKind, today: IsoDate): ReminderHoldState {
  const h = holds[kind];
  if (h?.pausedUntil && today < h.pausedUntil) return { state: 'pausado', until: h.pausedUntil };
  if (h?.snoozedUntil && today < h.snoozedUntil) return { state: 'adiado', until: h.snoozedUntil };
  return { state: 'ativo' };
}

// ---------------------------------------------------------------------------
// Avisos no celular (L2)
// ---------------------------------------------------------------------------

export interface InvestmentReminderFacts {
  /** O plano de aportes existe e o mês de hoje ainda não tem aporte. */
  depositDue?: boolean;
  /** Algum investimento ativo ainda sem o valor do extrato do mês passado. */
  updateDue?: boolean;
  /** As datas de vencimento e de fim da carência dos ativos. */
  dueDates?: readonly { on: IsoDate; release: boolean }[];
}

/** O vencimento (ou fim de carência) que o aviso adiado para `on` cita: o mais próximo de 30 dias antes a 7 dias depois. */
function dueForSnooze(dates: readonly { on: IsoDate; release: boolean }[], on: IsoDate): { on: IsoDate; release: boolean } | null {
  const candidates = dates.filter((d) => isValidIsoDate(d.on) && calendarDaysBetween(on, d.on) <= 7 && calendarDaysBetween(on, d.on) >= -REMINDER_DUE_WINDOW_DAYS);
  return candidates.sort((a, b) => Math.abs(calendarDaysBetween(on, a.on)) - Math.abs(calendarDaysBetween(on, b.on)) || (a.on < b.on ? -1 : 1))[0] ?? null;
}

/** O texto do aviso adiado (sem nome e sem valor). */
export function snoozedReminderBody(kind: InvestmentReminderKind, on: IsoDate, facts: InvestmentReminderFacts): string | null {
  if (kind === 'aporte_investimentos') return facts.depositDue ? 'Como você pediu, voltou o lembrete do aporte do seu plano de investimentos. Quer registrar?' : null;
  if (kind === 'atualizar') return facts.updateDue ? 'Como você pediu, voltou o lembrete: quer atualizar o valor dos investimentos com o extrato?' : null;
  const due = dueForSnooze(facts.dueDates ?? [], on);
  if (!due) return null;
  const days = calendarDaysBetween(on, due.on);
  const what = due.release ? 'A carência de um investimento' : 'Um investimento';
  const when = days > 0 ? (due.release ? `termina em ${formatDateBR(due.on)}` : `vence em ${formatDateBR(due.on)}`) : days === 0 ? (due.release ? 'termina hoje' : 'vence hoje') : due.release ? `terminou em ${formatDateBR(due.on)}` : `venceu em ${formatDateBR(due.on)}`;
  return `${what} ${when}. Quer conferir?`;
}

/**
 * Aplica o adiar e o pausar ao plano dos avisos do dia a dia (L2). `enabled`: os tipos ligados em Conta (um tipo desligado não ganha o aviso
 * adiado). `nowMinutes`: o aviso adiado para hoje só entra se o horário ainda não passou.
 */
export function applyInvestmentReminderHolds(
  items: readonly RoutineReminderItem[],
  holds: InvestmentReminderHolds,
  today: IsoDate,
  facts: InvestmentReminderFacts,
  enabled: Readonly<Partial<Record<InvestmentReminderKind, boolean>>>,
  hour: number,
  nowMinutes?: number,
): RoutineReminderItem[] {
  let out = [...items];
  for (const kind of INVESTMENT_REMINDER_KINDS) {
    const h = holds[kind];
    if (!h) continue;
    if (h.pausedUntil && today < h.pausedUntil) {
      const until = h.pausedUntil;
      out = out.filter((i) => i.kind !== kind || i.date >= until);
      continue;
    }
    if (!h.snoozedUntil || today > h.snoozedUntil) continue;
    const until = h.snoozedUntil;
    out = out.filter((i) => i.kind !== kind || i.date > until);
    const body = snoozedReminderBody(kind, until, facts);
    if (!enabled[kind] || body === null) continue;
    if (until === today && nowMinutes !== undefined && nowMinutes >= hour * 60) continue;
    out.push({
      kind,
      id: `${ROUTINE_REMINDER_ID_PREFIX}${kind}-adiado-${until}`,
      date: until,
      fireAt: `${until}T${String(hour).padStart(2, '0')}:00`,
      hour: hour as RoutineReminderItem['hour'],
      title: ROUTINE_REMINDER_TEXT.kinds[kind].title,
      body,
      route: ROUTINE_REMINDER_ROUTE[kind],
    });
  }
  return out.sort((a, b) => (a.fireAt < b.fireAt ? -1 : a.fireAt > b.fireAt ? 1 : 0));
}

// ---------------------------------------------------------------------------
// Dentro do app: a tela do lembrete e o cartão do detalhe
// ---------------------------------------------------------------------------

type InvestmentLike = Pick<Investment, 'id' | 'name' | 'status' | 'valueCents' | 'lastValueOn' | 'firstMovementOn' | 'maturityOn' | 'liquidity' | 'liquidityOn'>;

/** Último dia do mês passado: o valor dessa data já vale para o mês (é a data que a aba pede para o mês fechado). */
export function previousMonthEnd(today: IsoDate): IsoDate {
  return addDays(`${monthOf(today)}-01` as IsoDate, -1);
}

/** Investimento ativo sem o valor do extrato do mês passado (nem deste): a mesma regra do aviso do dia 1. */
export function valueUpdateDue(i: InvestmentLike, today: IsoDate): boolean {
  if (i.status !== 'ativo' || i.firstMovementOn === null) return false;
  const ref = i.lastValueOn ?? i.firstMovementOn;
  return ref < previousMonthEnd(today);
}

export interface DueItem {
  investment: InvestmentLike;
  on: IsoDate;
  /** Dias até a data (negativo: já passou). */
  days: number;
  release: boolean;
}

/** Vencimentos (com valor) e fins de carência dos ativos, de 30 dias atrás a 30 dias à frente, na ordem da data. */
export function dueItems(list: readonly InvestmentLike[], today: IsoDate): DueItem[] {
  const out: DueItem[] = [];
  for (const i of list) {
    if (i.status !== 'ativo') continue;
    if (i.maturityOn) {
      const days = calendarDaysBetween(today, i.maturityOn);
      if (days <= REMINDER_DUE_WINDOW_DAYS && days >= -REMINDER_DUE_WINDOW_DAYS && (days >= 0 || i.valueCents > 0)) out.push({ investment: i, on: i.maturityOn, days, release: false });
    }
    if (i.liquidity === 'a_partir_de' && i.liquidityOn && i.liquidityOn !== i.maturityOn) {
      const days = calendarDaysBetween(today, i.liquidityOn);
      if (days >= 0 && days <= REMINDER_DUE_WINDOW_DAYS) out.push({ investment: i, on: i.liquidityOn, days, release: true });
    }
  }
  return out.sort((a, b) => (a.on < b.on ? -1 : a.on > b.on ? 1 : a.investment.name.localeCompare(b.investment.name, 'pt-BR')));
}

export type DetailReminder = { kind: 'vencimentos'; due: DueItem } | { kind: 'atualizar'; lastValueOn: IsoDate | null; since: IsoDate };

/**
 * O cartão de lembrete do detalhe (L1): o vencimento (ou fim de carência) de até 7 dias à frente, ou já passado com valor; senão, o valor sem
 * atualização do mês passado. Nada com o tipo pausado ou adiado.
 */
export function detailReminder(i: InvestmentLike, today: IsoDate, holds: InvestmentReminderHolds): DetailReminder | null {
  if (i.status !== 'ativo') return null;
  if (reminderHoldState(holds, 'vencimentos', today).state === 'ativo') {
    const due = dueItems([i], today).find((d) => d.days <= 7);
    if (due) return { kind: 'vencimentos', due };
  }
  if (reminderHoldState(holds, 'atualizar', today).state === 'ativo' && valueUpdateDue(i, today)) {
    return { kind: 'atualizar', lastValueOn: i.lastValueOn, since: i.lastValueOn ?? i.firstMovementOn! };
  }
  return null;
}

const dayPhrase = (d: DueItem) =>
  d.release
    ? d.days === 0
      ? `termina a carência hoje, ${formatDateBR(d.on)}`
      : `termina a carência em ${formatDateBR(d.on)}, daqui a ${d.days === 1 ? '1 dia' : `${d.days} dias`}`
    : d.days === 0
      ? `vence hoje, ${formatDateBR(d.on)}`
      : d.days > 0
        ? `vence em ${formatDateBR(d.on)}, daqui a ${d.days === 1 ? '1 dia' : `${d.days} dias`}`
        : `venceu em ${formatDateBR(d.on)}`;

export const INVESTMENT_REMINDER_TEXT = {
  screenTitle: 'Lembrete dos investimentos',
  kindTitle: { aporte_investimentos: 'Aporte do plano', vencimentos: 'Vencimentos', atualizar: 'Valor sem atualização' } as Readonly<Record<InvestmentReminderKind, string>>,
  aporte: {
    /** "Hoje é o dia do aporte de R$ 600,00 do seu plano de investimentos. Quer registrar?" */
    today: (cents: Cents) => `Hoje é o dia do aporte de ${formatBRL(cents)} do seu plano de investimentos. Quer registrar?`,
    otherDay: (cents: Cents, day: number) => `O seu plano de investimentos é de ${formatBRL(cents)} por mês, com o lembrete no dia ${day}. Quer registrar um aporte?`,
    /** "Em outubro, os aportes registrados somam R$ 500,00." */
    monthSoFar: (month: IsoMonth, cents: Cents) =>
      cents > 0 ? `Em ${formatMonthName(month)}, os aportes registrados somam ${formatBRL(cents)}.` : `Em ${formatMonthName(month)}, nenhum aporte registrado até agora.`,
    noPlan: 'Você não tem um plano de aportes agora. Se quiser, dá para definir um na aba Investir.',
    pick: 'Em qual investimento?',
    register: (name: string) => `Registrar aporte em ${name}`,
    noActive: 'Nenhum investimento ativo agora.',
  },
  atualizar: {
    intro: 'Estes investimentos estão sem o valor do extrato do mês passado. Quer atualizar?',
    /** "Aplicação do banco: atualizado por você em 30/08/2026." */
    line: (name: string, lastValueOn: IsoDate | null, since: IsoDate) =>
      lastValueOn ? `${name}: atualizado por você em ${formatDateBR(lastValueOn)}.` : `${name}: sem valor do extrato desde o primeiro aporte, em ${formatDateBR(since)}.`,
    action: (name: string) => `Atualizar o valor de ${name}`,
    none: 'Todos os investimentos ativos têm o valor do extrato do mês passado ou deste mês.',
  },
  vencimentos: {
    intro: 'Vencimentos e fins de carência de 30 dias atrás a 30 dias à frente:',
    /** "Aplicação do banco vence em 01/11/2026, daqui a 5 dias." */
    line: (d: DueItem) => `${d.investment.name} ${dayPhrase(d)}.`,
    resgate: (name: string) => `Registrar resgate de ${name}`,
    open: (name: string) => `Ver ${name}`,
    none: 'Nenhum investimento vence nos próximos 30 dias.',
  },
  /** Cartão do detalhe. */
  card: {
    due: (d: DueItem) =>
      d.days < 0
        ? `Este investimento venceu em ${formatDateBR(d.on)}. Se o dinheiro já voltou para a conta, quer registrar o resgate?`
        : `Este investimento ${dayPhrase(d)}. Quer conferir?`,
    stale: (lastValueOn: IsoDate | null, since: IsoDate) =>
      lastValueOn
        ? `O valor deste investimento foi atualizado por você em ${formatDateBR(lastValueOn)}. Quer atualizar com o extrato?`
        : `Este investimento está sem valor do extrato desde o primeiro aporte, em ${formatDateBR(since)}. Quer atualizar?`,
    update: 'Atualizar com o extrato',
    resgate: 'Registrar o resgate',
  },
  holdTitle: 'Adiar ou pausar',
  snooze: `Lembrar de novo em ${REMINDER_SNOOZE_DAYS} dias`,
  pause: `Pausar este lembrete por ${REMINDER_PAUSE_DAYS} dias`,
  resume: 'Retomar este lembrete',
  snoozed: (until: IsoDate) => `Combinado: este lembrete volta em ${formatDateBR(until)}.`,
  paused: (until: IsoDate) => `Lembrete pausado até ${formatDateBR(until)}. Dá para retomar quando quiser.`,
  resumed: 'Lembrete retomado.',
  stateLine: (s: ReminderHoldState) =>
    s.state === 'pausado' ? `Este lembrete está pausado até ${formatDateBR(s.until)}.` : s.state === 'adiado' ? `Este lembrete volta em ${formatDateBR(s.until)}.` : null,
  note: 'É só um lembrete: você decide se e quando registrar. Adiar e pausar valem para este tipo de lembrete, ficam só neste aparelho e passam sozinhos na data.',
  settingsNote: 'Os avisos no celular ligam e desligam em Conta, Lembretes.',
  /** Conta › Lembretes: a linha embaixo do interruptor de cada tipo. */
  settingsState: (s: ReminderHoldState) =>
    s.state === 'pausado' ? `Pausado até ${formatDateBR(s.until)}.` : s.state === 'adiado' ? `Adiado até ${formatDateBR(s.until)}.` : null,
} as const;
