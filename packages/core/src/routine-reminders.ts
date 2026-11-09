import { addDays, addMonths, isValidIsoDate, monthOf, type IsoDate, type IsoMonth } from './dates';
import type { ContextActivity, FinancialRecord } from './records';
import { recordMonth } from './records';
import { REMINDER_ID_PREFIX } from './reminders';

/**
 * Lembretes do dia a dia (D-087): notificações locais no aparelho, opcionais uma a uma, para manter o hábito de anotar.
 * Mesma base dos lembretes de vencimento (D-025): sem banco, o plano sai do que o app já lê (os registros do mês do
 * Pessoal e o dia da última anotação), e o app cancela e agenda os avisos a cada abertura, volta ao app e escrita.
 *
 * Quatro avisos, cada um com o seu interruptor em Conta:
 * - "gastos": todo dia, no horário escolhido, "Não se esqueça de anotar os gastos de hoje."; não entra no dia que já tem
 *   gasto ou compra no cartão anotados (pelo que o app sabe na hora de agendar: anotações pelo WhatsApp ou Telegram só
 *   contam na próxima abertura do app, e os avisos ficam agendados para as próximas duas semanas);
 * - "recebimentos": no dia 10 de cada mês, se o mês ainda não tem recebimento anotado;
 * - "mapa": no dia 15 de cada mês, para olhar o mapa de gastos do mês até agora;
 * - "ausencia": um aviso quando a última anotação completa 7 dias.
 *
 * Privacidade (tela bloqueada): nenhuma saída deste módulo leva valor, descrição, categoria ou identificador de registro.
 */

export type RoutineReminderKind = 'gastos' | 'recebimentos' | 'mapa' | 'ausencia';
export const ROUTINE_REMINDER_KINDS: readonly RoutineReminderKind[] = ['gastos', 'recebimentos', 'mapa', 'ausencia'];

/** Horários oferecidos em Conta ("Horário dos lembretes do dia a dia"), separados do horário dos lembretes de vencimento. */
export const ROUTINE_REMINDER_HOURS = [12, 18, 20, 21] as const;
export type RoutineReminderHour = (typeof ROUTINE_REMINDER_HOURS)[number];
export const DEFAULT_ROUTINE_REMINDER_HOUR: RoutineReminderHour = 20;

/** Dias à frente do aviso diário: o app reagenda a cada abertura, e o iOS guarda só as 64 notificações mais próximas. */
export const ROUTINE_DAILY_DAYS = 14;
/** Meses à frente dos avisos mensais (o mês atual, se o dia ainda não passou, e o seguinte). */
export const ROUTINE_MONTHLY_MONTHS = 2;
export const ROUTINE_INCOME_DAY = 10;
export const ROUTINE_MAP_DAY = 15;
export const ROUTINE_ABSENCE_DAYS = 7;
/** No máximo 20 avisos do dia a dia (14 + 2 + 2 + 1 = 19), somados aos 30 de vencimento: abaixo das 64 do iOS. */
export const ROUTINE_REMINDER_LIMIT = 20;

/** Identificadores "clarevo-lembrete-rotina-<tipo>-<dia ou mês>": o app cancela só os seus avisos (isReminderId). */
export const ROUTINE_REMINDER_ID_PREFIX = `${REMINDER_ID_PREFIX}rotina-`;

/** Tela aberta pelo toque em cada aviso (endereço do app, sem dado da pessoa). */
export const ROUTINE_REMINDER_ROUTE: Readonly<Record<RoutineReminderKind, string>> = {
  gastos: '/registro/novo',
  recebimentos: '/registro/novo?tipo=receita',
  mapa: '/analises',
  ausencia: '/',
};

export const ROUTINE_REMINDER_TEXT = {
  section: 'Lembretes do dia a dia',
  intro: 'Avisos para manter o hábito de anotar. Cada um é opcional, sem valores nem descrições na tela bloqueada, e fica neste aparelho.',
  hourLabel: 'Horário dos lembretes do dia a dia',
  channelName: 'Lembretes do dia a dia',
  kinds: {
    gastos: {
      toggle: 'Anotar os gastos do dia',
      caption: 'Todo dia, no horário escolhido. Não avisa no dia em que você já anotou um gasto ou uma compra no cartão.',
      title: 'Anotar gasto',
      body: 'Não se esqueça de anotar os gastos de hoje.',
    },
    recebimentos: {
      toggle: 'Recebimentos do mês',
      caption: 'No dia 10, se o mês ainda não tem recebimento anotado.',
      title: 'Registrar recebimento',
      body: 'Não se esqueça de anotar o que você recebeu este mês.',
    },
    mapa: {
      toggle: 'Mapa de gastos do mês',
      caption: 'No dia 15, para ver como está o mês até agora.',
      title: 'Análises',
      body: 'Acompanhe o mapa de gastos do seu mês até agora.',
    },
    ausencia: {
      toggle: 'Uma semana sem anotar',
      caption: 'Um aviso quando a última anotação completa 7 dias.',
      title: 'Resumo',
      body: 'Faz uma semana sem anotações. Quando quiser, é só retomar.',
    },
  } as Readonly<Record<RoutineReminderKind, { toggle: string; caption: string; title: string; body: string }>>,
} as const;

/** As escolhas da pessoa, uma por aviso (ficam só no aparelho). */
export type RoutineReminderChoices = Readonly<Record<RoutineReminderKind, boolean>>;
export const NO_ROUTINE_REMINDERS: RoutineReminderChoices = { gastos: false, recebimentos: false, mapa: false, ausencia: false };

export function isRoutineReminderKind(value: unknown): value is RoutineReminderKind {
  return typeof value === 'string' && (ROUTINE_REMINDER_KINDS as readonly string[]).includes(value);
}

export function isRoutineReminderHour(value: unknown): value is RoutineReminderHour {
  return typeof value === 'number' && (ROUTINE_REMINDER_HOURS as readonly number[]).includes(value);
}

/** O que foi guardado no aparelho vira escolhas válidas: só `true` liga; o resto (faltando, inválido) fica desligado. */
export function parseRoutineReminderChoices(value: unknown): RoutineReminderChoices {
  const v = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  return { gastos: v.gastos === true, recebimentos: v.recebimentos === true, mapa: v.mapa === true, ausencia: v.ausencia === true };
}

/** Algum lembrete do dia a dia ligado? (Preferências ainda sem o campo, de uma versão anterior do app, contam como nenhum.) */
export function anyRoutineReminder(choices: RoutineReminderChoices | undefined): boolean {
  return choices !== undefined && ROUTINE_REMINDER_KINDS.some((k) => choices[k] === true);
}

export interface RoutineReminderItem {
  kind: RoutineReminderKind;
  /** "clarevo-lembrete-rotina-gastos-AAAA-MM-DD", "clarevo-lembrete-rotina-recebimentos-AAAA-MM", ... */
  id: string;
  /** Dia do aviso. */
  date: IsoDate;
  /** Hora local do aparelho: "AAAA-MM-DDTHH:00". */
  fireAt: string;
  hour: RoutineReminderHour;
  title: string;
  body: string;
  /** Endereço aberto pelo toque. */
  route: string;
}

export interface RoutineReminderPlanOptions {
  /** Minutos desde a meia-noite de `today` (hora local do aparelho). O aviso de hoje só entra se o horário ainda não passou. */
  nowMinutes?: number;
  /** Só os registros deste contexto (o Pessoal de quem usa o aparelho). */
  contextId?: string;
  limit?: number;
  /** Hoje já tem compra no cartão anotada (lida à parte, em card_entries): conta como gasto anotado para o aviso do dia. */
  cardPurchaseToday?: boolean;
}

function hh(hour: number): string {
  return String(hour).padStart(2, '0');
}

/**
 * Plano dos avisos do dia a dia a partir dos registros do mês de hoje (`records`, os que o app já lê) e do dia da última
 * anotação (`activity`, de `getReturnReviewState`; nulo quando "Uma semana sem anotar" está desligado ou nunca houve anotação):
 * - "gastos": um por dia, de hoje a hoje + 13; o de hoje fica fora se o horário já passou ou se hoje já tem gasto anotado
 *   (registro de despesa ou, por `options.cardPurchaseToday`, compra no cartão);
 * - "recebimentos": dia 10 do mês atual (se ainda não passou e o mês não tem recebimento) e do mês seguinte;
 * - "mapa": dia 15 do mês atual (se ainda não passou) e do mês seguinte;
 * - "ausencia": última anotação + 7 dias, se ainda não passou.
 * Em ordem de data e hora, cortado em `limit`. Escolhas todas desligadas, hoje inválido ou hora fora da lista: nenhum aviso.
 */
export function routineReminderPlan(
  choices: RoutineReminderChoices,
  records: readonly FinancialRecord[],
  activity: Pick<ContextActivity, 'lastWriteOn'> | null,
  today: IsoDate,
  hour: RoutineReminderHour,
  options: RoutineReminderPlanOptions = {},
): RoutineReminderItem[] {
  if (!isValidIsoDate(today) || !isRoutineReminderHour(hour) || !anyRoutineReminder(choices)) return [];
  const limit = options.limit ?? ROUTINE_REMINDER_LIMIT;
  if (!(limit > 0)) return [];
  const todayPassed = options.nowMinutes !== undefined && options.nowMinutes >= hour * 60;
  const mine = (r: FinancialRecord) => options.contextId === undefined || r.contextId === options.contextId;
  const thisMonth = monthOf(today);
  const expenseToday = options.cardPurchaseToday === true || records.some((r) => mine(r) && r.kind === 'despesa' && r.occurredOn === today);
  const incomeThisMonth = records.some((r) => mine(r) && r.kind === 'receita' && isValidIsoDate(r.occurredOn) && recordMonth(r) === thisMonth);
  /** O aviso em `date` ainda cabe: hoje só se o horário não passou; nunca no passado. */
  const fits = (date: IsoDate) => date > today || (date === today && !todayPassed);

  const items: RoutineReminderItem[] = [];
  const push = (kind: RoutineReminderKind, date: IsoDate, suffix: string) => {
    const t = ROUTINE_REMINDER_TEXT.kinds[kind];
    items.push({
      kind,
      id: `${ROUTINE_REMINDER_ID_PREFIX}${kind}-${suffix}`,
      date,
      fireAt: `${date}T${hh(hour)}:00`,
      hour,
      title: t.title,
      body: t.body,
      route: ROUTINE_REMINDER_ROUTE[kind],
    });
  };

  if (choices.gastos) {
    for (let d = 0; d < ROUTINE_DAILY_DAYS; d += 1) {
      const date = addDays(today, d);
      if (d === 0 && expenseToday) continue;
      if (fits(date)) push('gastos', date, date);
    }
  }
  const monthly = (kind: RoutineReminderKind, day: number, skipThisMonth: boolean) => {
    for (let m = 0; m < ROUTINE_MONTHLY_MONTHS; m += 1) {
      const month: IsoMonth = addMonths(thisMonth, m);
      if (m === 0 && skipThisMonth) continue;
      const date: IsoDate = `${month}-${hh(day)}`;
      if (fits(date)) push(kind, date, month);
    }
  };
  if (choices.recebimentos) monthly('recebimentos', ROUTINE_INCOME_DAY, incomeThisMonth);
  if (choices.mapa) monthly('mapa', ROUTINE_MAP_DAY, false);
  if (choices.ausencia && activity && isValidIsoDate(activity.lastWriteOn)) {
    const date = addDays(activity.lastWriteOn, ROUTINE_ABSENCE_DAYS);
    if (fits(date)) push('ausencia', date, date);
  }

  return items.sort((a, b) => (a.fireAt < b.fireAt ? -1 : a.fireAt > b.fireAt ? 1 : 0)).slice(0, Math.floor(limit));
}

/**
 * Assinatura de um aviso agendado: muda quando o dia, a hora, o texto ou a tela do toque muda, e só então o aparelho cancela e
 * agenda de novo (um aviso já agendado por uma versão anterior do app, com outro texto ou outra tela, é trocado).
 */
export function routineReminderSignature(item: Pick<RoutineReminderItem, 'fireAt' | 'title' | 'body' | 'route'>): string {
  return `${item.fireAt}|${item.title}|${item.body}|${item.route}`;
}

/** O identificador é de um aviso do dia a dia? (Os de vencimento são "clarevo-lembrete-AAAA-MM-DD".) */
export function isRoutineReminderId(id: string): boolean {
  return id.startsWith(ROUTINE_REMINDER_ID_PREFIX);
}
