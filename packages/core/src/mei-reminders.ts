import { addMonths, isValidIsoDate, monthOf, type IsoDate, type IsoMonth } from './dates';
import { ROUTINE_REMINDER_ID_PREFIX, isRoutineReminderHour, type RoutineReminderHour } from './routine-reminders';

/**
 * Lembretes do MEI (D-122, item 9 da pesquisa de 18/11/2026): dois avisos locais no aparelho, opcionais e desligados por padrão, pelo
 * mesmo caminho dos lembretes do dia a dia (routine-reminders.ts, D-087: o app cancela e agenda a cada abertura, volta ao app e escrita,
 * no horário dos lembretes do dia a dia). Só com o tipo do negócio "MEI" (D-121); os interruptores ficam em "Seu negócio", não em Conta.
 *
 * Texto neutro, de data, sem pressão e sem orientação de imposto (a Clarevo não calcula o DAS nem diz o que declarar):
 * - "DAS do mês": no dia 15 de cada mês, "O DAS do MEI vence no dia 20.";
 * - "Declaração anual do MEI": em 2 de maio, "A declaração anual do MEI vai até 31 de maio.".
 *
 * Privacidade (tela bloqueada): nenhum valor, nome do negócio nem identificador; o toque abre "Seu negócio".
 */

export type MeiReminderKind = 'das' | 'declaracao';
export const MEI_REMINDER_KINDS: readonly MeiReminderKind[] = ['das', 'declaracao'];

/** As escolhas da pessoa (ficam só no aparelho, como os lembretes do dia a dia). Desligadas por padrão. */
export type MeiReminderChoices = Readonly<Record<MeiReminderKind, boolean>>;
export const NO_MEI_REMINDERS: MeiReminderChoices = { das: false, declaracao: false };

/** O dia do aviso do DAS (o DAS do MEI vence no dia 20) e o dia e o mês do aviso da declaração anual (vai até 31 de maio). */
export const MEI_DAS_REMINDER_DAY = 15;
export const MEI_DECLARATION_REMINDER_MONTH = 5;
export const MEI_DECLARATION_REMINDER_DAY = 2;
/** Meses à frente do aviso do DAS (o mês atual, se o dia ainda não passou, e o seguinte), como os mensais do dia a dia. */
export const MEI_DAS_MONTHS = 2;
/** No máximo 3 avisos do MEI (2 do DAS e 1 da declaração): somados aos 30 de vencimento, aos 21 do dia a dia e ao do nível, abaixo dos 64 do iOS. */
export const MEI_REMINDER_LIMIT = 3;

/** Identificadores "clarevo-lembrete-rotina-mei-das-AAAA-MM" e "clarevo-lembrete-rotina-mei-declaracao-AAAA": avisos do dia a dia. */
export const MEI_REMINDER_ID_PREFIX = `${ROUTINE_REMINDER_ID_PREFIX}mei-`;
/** O toque abre "Seu negócio". */
export const MEI_REMINDER_ROUTE = '/negocio';

export const MEI_REMINDER_TEXT = {
  title: 'Lembretes do MEI',
  intro: 'Dois avisos opcionais neste aparelho, desligados até você ligar. São só datas: a Clarevo não calcula imposto.',
  hourNote: 'Saem no horário dos lembretes do dia a dia, que você escolhe em Conta.',
  kinds: {
    das: {
      toggle: 'DAS do mês',
      caption: 'No dia 15 de cada mês: "O DAS do MEI vence no dia 20."',
      title: 'Seu negócio',
      body: 'O DAS do MEI vence no dia 20.',
    },
    declaracao: {
      toggle: 'Declaração anual do MEI',
      caption: 'Em 2 de maio: "A declaração anual do MEI vai até 31 de maio."',
      title: 'Seu negócio',
      body: 'A declaração anual do MEI vai até 31 de maio.',
    },
  } as Readonly<Record<MeiReminderKind, { toggle: string; caption: string; title: string; body: string }>>,
} as const;

export function isMeiReminderKind(value: unknown): value is MeiReminderKind {
  return typeof value === 'string' && (MEI_REMINDER_KINDS as readonly string[]).includes(value);
}

/** O que foi guardado no aparelho vira escolhas válidas: só `true` liga; o resto (faltando, inválido) fica desligado. */
export function parseMeiReminderChoices(value: unknown): MeiReminderChoices {
  const v = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  return { das: v.das === true, declaracao: v.declaracao === true };
}

export function anyMeiReminder(choices: MeiReminderChoices | undefined): boolean {
  return choices !== undefined && MEI_REMINDER_KINDS.some((k) => choices[k] === true);
}

export interface MeiReminderItem {
  kind: MeiReminderKind;
  id: string;
  date: IsoDate;
  /** Hora local do aparelho: "AAAA-MM-DDTHH:00". */
  fireAt: string;
  hour: RoutineReminderHour;
  title: string;
  body: string;
  route: string;
}

const hh = (n: number): string => String(n).padStart(2, '0');

/**
 * O plano dos avisos do MEI: só com `mei` (o tipo do negócio é MEI) e as escolhas ligadas. "DAS do mês": dia 15 do mês atual (se o aviso
 * ainda cabe) e do seguinte; "Declaração anual do MEI": 2 de maio deste ano (se ainda cabe) ou do ano seguinte. O de hoje só entra se o
 * horário ainda não passou (`nowMinutes`). Em ordem de data, cortado em MEI_REMINDER_LIMIT. Hoje inválido ou hora fora da lista: nenhum.
 */
export function meiReminderPlan(
  choices: MeiReminderChoices,
  today: IsoDate,
  hour: RoutineReminderHour,
  options: { mei: boolean; nowMinutes?: number },
): MeiReminderItem[] {
  if (!options.mei || !anyMeiReminder(choices) || !isValidIsoDate(today) || !isRoutineReminderHour(hour)) return [];
  const todayPassed = options.nowMinutes !== undefined && options.nowMinutes >= hour * 60;
  const fits = (date: IsoDate) => date > today || (date === today && !todayPassed);
  const items: MeiReminderItem[] = [];
  const push = (kind: MeiReminderKind, date: IsoDate, suffix: string) => {
    const t = MEI_REMINDER_TEXT.kinds[kind];
    items.push({ kind, id: `${MEI_REMINDER_ID_PREFIX}${kind}-${suffix}`, date, fireAt: `${date}T${hh(hour)}:00`, hour, title: t.title, body: t.body, route: MEI_REMINDER_ROUTE });
  };
  if (choices.das) {
    for (let m = 0; m < MEI_DAS_MONTHS; m += 1) {
      const month: IsoMonth = addMonths(monthOf(today), m);
      const date: IsoDate = `${month}-${hh(MEI_DAS_REMINDER_DAY)}`;
      if (fits(date)) push('das', date, month);
    }
  }
  if (choices.declaracao) {
    const year = Number(today.slice(0, 4));
    for (const y of [year, year + 1]) {
      const date: IsoDate = `${String(y).padStart(4, '0')}-${hh(MEI_DECLARATION_REMINDER_MONTH)}-${hh(MEI_DECLARATION_REMINDER_DAY)}`;
      if (fits(date)) {
        push('declaracao', date, String(y));
        break;
      }
    }
  }
  return items.sort((a, b) => (a.fireAt < b.fireAt ? -1 : a.fireAt > b.fireAt ? 1 : 0)).slice(0, MEI_REMINDER_LIMIT);
}
