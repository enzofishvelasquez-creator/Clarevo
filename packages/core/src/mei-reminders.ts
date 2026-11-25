import { addMonths, formatMonthName, isValidIsoDate, monthOf, type IsoDate, type IsoMonth } from './dates';
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

/**
 * As datas da regra, como o limite do MEI (business.ts, MEI_ANNUAL_LIMIT_CENTS): o DAS do MEI vence no dia 20 de cada mês, e a declaração
 * anual do MEI (DASN-SIMEI) vai até 31 de maio. Datas em vigor em novembro de 2026, conferidas na pesquisa de 18/11/2026 (o item 9 da
 * lista priorizada e a tabela de obrigações por perfil do relatório "Registros financeiros de pequenos negócios"). Se a regra mudar, troque aqui: os textos dos avisos e
 * dos interruptores saem destas constantes (e os testes conferem a frase montada).
 */
export const MEI_DAS_DUE_DAY = 20;
export const MEI_DECLARATION_DEADLINE_DAY = 31;
export const MEI_DECLARATION_DEADLINE_MONTH = 5;

/**
 * Quando cada aviso sai (escolha do app, não da regra): o do DAS cinco dias antes do vencimento, no dia 15; o da declaração no começo do
 * mês do prazo, em 2 de maio.
 */
export const MEI_DAS_REMINDER_DAY = 15;
export const MEI_DECLARATION_REMINDER_MONTH = MEI_DECLARATION_DEADLINE_MONTH;
export const MEI_DECLARATION_REMINDER_DAY = 2;

/** "maio": o nome do mês de um número de 1 a 12. */
const monthName = (month: number): string => formatMonthName(`2000-${String(month).padStart(2, '0')}`);
const DAS_BODY = `O DAS do MEI vence no dia ${MEI_DAS_DUE_DAY}.`;
const DECLARATION_BODY = `A declaração anual do MEI vai até ${MEI_DECLARATION_DEADLINE_DAY} de ${monthName(MEI_DECLARATION_DEADLINE_MONTH)}.`;
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
      caption: `No dia ${MEI_DAS_REMINDER_DAY} de cada mês: "${DAS_BODY}"`,
      title: 'Seu negócio',
      body: DAS_BODY,
    },
    declaracao: {
      toggle: 'Declaração anual do MEI',
      caption: `Em ${MEI_DECLARATION_REMINDER_DAY} de ${monthName(MEI_DECLARATION_REMINDER_MONTH)}: "${DECLARATION_BODY}"`,
      title: 'Seu negócio',
      body: DECLARATION_BODY,
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
