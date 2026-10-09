import { addDays, isValidIsoDate, type IsoDate } from './dates';
import type { Commitment } from './records';

/**
 * Lembretes de contas a pagar (D-025, Ciclo A2): notificação local no aparelho, um aviso por dia que tenha conta em
 * aberto do Pessoal com vencimento no dia seguinte, no horário escolhido. Sem banco: o plano sai das contas que o app
 * já lê, e o app cancela e agenda os avisos a cada abertura, volta ao app e escrita.
 *
 * Privacidade (tela bloqueada): nenhuma saída deste módulo leva valor, descrição, categoria ou identificador de conta.
 */

/** Horários oferecidos em Conta ("Horário do aviso"). */
export const REMINDER_HOURS = [8, 9, 12, 19] as const;
export type ReminderHour = (typeof REMINDER_HOURS)[number];
export const DEFAULT_REMINDER_HOUR: ReminderHour = 9;

/** O iOS guarda só as 64 notificações locais mais próximas; o Clarevo agenda no máximo 30. */
export const REMINDER_LIMIT = 30;

/** Prefixo dos identificadores: o app cancela só os seus avisos ("clarevo-lembrete-AAAA-MM-DD"). */
export const REMINDER_ID_PREFIX = 'clarevo-lembrete-';

/** Tela aberta pelo toque no aviso. */
export const REMINDER_ROUTE = '/a-pagar';

export const REMINDER_TEXT = {
  section: 'Lembretes',
  toggle: 'Lembretes de contas a pagar',
  caption: 'Um aviso no dia anterior ao vencimento. Sem valores nem descrições na tela bloqueada. Os lembretes ficam neste aparelho.',
  hourLabel: 'Horário do aviso',
  offerTitle: 'Quer receber um aviso no dia anterior ao vencimento?',
  offerCaption: 'O aviso chega às 9h, sem valores nem descrições na tela bloqueada. O horário pode ser mudado em Conta.',
  offerAccept: 'Ativar lembretes',
  offerDecline: 'Agora não',
  denied: 'Os avisos estão desativados nas configurações do aparelho.',
  openSettings: 'Abrir configurações',
  web: 'Lembretes estão disponíveis no app para celular.',
  demo: 'Demonstração: nenhum aviso é agendado.',
  notificationTitle: 'Contas a pagar',
  channelName: 'Lembretes de contas a pagar',
} as const;

export function isReminderHour(value: unknown): value is ReminderHour {
  return typeof value === 'number' && (REMINDER_HOURS as readonly number[]).includes(value);
}

/** "8h", "9h", "12h", "19h". */
export function reminderHourLabel(hour: ReminderHour): string {
  return `${hour}h`;
}

/** Leitor de tela: "8 horas", "12 horas". */
export function reminderHourA11y(hour: ReminderHour): string {
  return `${hour} horas`;
}

/** "Você tem 1 conta com vencimento amanhã." / "Você tem 3 contas com vencimento amanhã." */
export function reminderBody(count: number): string {
  return count === 1 ? 'Você tem 1 conta com vencimento amanhã.' : `Você tem ${count} contas com vencimento amanhã.`;
}

export interface ReminderItem {
  /** "clarevo-lembrete-AAAA-MM-DD", com o dia do aviso. */
  id: string;
  /** Dia do aviso (véspera do vencimento). */
  date: IsoDate;
  /** Hora local do aparelho: "AAAA-MM-DDTHH:00". */
  fireAt: string;
  hour: ReminderHour;
  /** Vencimento das contas avisadas. */
  dueOn: IsoDate;
  /** Contas em aberto que vencem em dueOn. */
  count: number;
  title: string;
  body: string;
}

export interface ReminderPlanOptions {
  /**
   * Minutos desde a meia-noite de `today` (hora local do aparelho). O aviso de hoje só entra se o horário ainda não
   * passou. Sem o valor, o aviso de hoje entra.
   */
  nowMinutes?: number;
  /** Só as contas deste contexto (o Pessoal de quem usa o aparelho). */
  contextId?: string;
}

/**
 * Plano de avisos: um item por dia com conta em aberto vencendo no dia seguinte, agrupando as contas do dia, em ordem
 * de data e cortado em `limit`. Ficam fora as contas pagas, as vencidas, as que vencem hoje (o aviso seria ontem) e as de
 * amanhã quando o horário de hoje já passou.
 */
export function reminderPlan(
  commitments: readonly Commitment[],
  today: IsoDate,
  hour: ReminderHour,
  limit: number = REMINDER_LIMIT,
  options: ReminderPlanOptions = {},
): ReminderItem[] {
  if (!isValidIsoDate(today) || !isReminderHour(hour) || !(limit > 0)) return [];
  const tomorrow = addDays(today, 1);
  const todayPassed = options.nowMinutes !== undefined && options.nowMinutes >= hour * 60;
  const firstDue = todayPassed ? addDays(today, 2) : tomorrow;

  const byDue = new Map<IsoDate, number>();
  for (const c of commitments) {
    if (c.status !== 'aberto') continue;
    if (options.contextId !== undefined && c.contextId !== options.contextId) continue;
    if (!isValidIsoDate(c.dueOn) || c.dueOn < firstDue) continue;
    byDue.set(c.dueOn, (byDue.get(c.dueOn) ?? 0) + 1);
  }

  const hh = String(hour).padStart(2, '0');
  return [...byDue.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .slice(0, Math.floor(limit))
    .map(([dueOn, count]) => {
      const date = addDays(dueOn, -1);
      return {
        id: `${REMINDER_ID_PREFIX}${date}`,
        date,
        fireAt: `${date}T${hh}:00`,
        hour,
        dueOn,
        count,
        title: REMINDER_TEXT.notificationTitle,
        body: reminderBody(count),
      };
    });
}

/** O identificador é de um aviso do Clarevo? (O app nunca cancela notificações de outra origem.) */
export function isReminderId(id: string): boolean {
  return id.startsWith(REMINDER_ID_PREFIX);
}
