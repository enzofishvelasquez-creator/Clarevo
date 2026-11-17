import type { IsoDate } from './dates';
import { addMonthsToDate, formatMonthYearBR, isValidIsoDate, monthOf, todayIn } from './dates';
import type { Cents } from './money';
import { formatBRL } from './money';
import type { Goal } from './records';

/**
 * Convite para rever as metas (D-105), a cada três meses e só se a pessoa quiser. Sem cobrança: o convite diz que é opcional, tem
 * "Agora não" e some por três meses com qualquer resposta. A data do próximo convite fica só no aparelho (como os outros lembretes), e
 * nada vai ao servidor.
 *
 * R1. Só com alguma meta ativa (a reserva para imprevistos conta).
 * R2. Sem data guardada: o convite aparece quando a meta ativa mais antiga já tem três meses (pela data de criação no fuso do aparelho).
 *     Com data guardada: a partir dela.
 * R3. "Rever metas" e "Agora não" guardam hoje + 3 meses; "Concluir revisão", na tela, também.
 */
export const GOALS_REVIEW_EVERY_MONTHS = 3;

type ReviewGoal = Pick<Goal, 'status' | 'createdAt'>;

/** A próxima data do convite a partir de hoje (R3). */
export function goalsReviewNextOn(today: IsoDate): IsoDate {
  return addMonthsToDate(today, GOALS_REVIEW_EVERY_MONTHS);
}

/** O convite aparece hoje? (R1 e R2). `nextOn` é a data guardada no aparelho (null sem nenhuma). */
export function goalsReviewDue(goals: readonly ReviewGoal[], today: IsoDate, nextOn: IsoDate | null, timeZone: string): boolean {
  const active = goals.filter((g) => g.status === 'ativa');
  if (active.length === 0) return false;
  if (nextOn !== null && isValidIsoDate(nextOn)) return today >= nextOn;
  const created = active.map((g) => todayIn(timeZone, new Date(g.createdAt))).sort()[0]!;
  return today >= goalsReviewNextOn(created);
}

export interface GoalReviewLine {
  id: string;
  name: string;
  /** "Guardado: R$ 3.500,00 de R$ 22.500,00". */
  saved: string;
  /** "Prazo: julho de 2027" ou "Sem prazo". */
  deadline: string;
  /** "Plano: R$ 480,00 por mês, sem contar rendimentos" ou "Sem plano por mês". */
  plan: string;
}

/** As linhas da tela de revisão, na ordem recebida (a mesma das metas). */
export function goalReviewLines(goals: readonly Pick<Goal, 'id' | 'name' | 'savedCents' | 'targetCents' | 'targetMonth' | 'plannedMonthlyCents'>[]): GoalReviewLine[] {
  const T = GOALS_REVIEW_TEXT;
  return goals.map((g) => ({
    id: g.id,
    name: g.name,
    saved: T.saved(g.savedCents, g.targetCents),
    deadline: g.targetMonth === null ? T.noDeadline : T.deadline(g.targetMonth),
    plan: g.plannedMonthlyCents === null ? T.noPlan : T.plan(g.plannedMonthlyCents),
  }));
}

export const GOALS_REVIEW_TEXT = {
  cardTitle: 'Quer rever as suas metas?',
  cardBody: 'Faz três meses. Valores, prazos e planos podem ter mudado. Rever é opcional e leva um minuto.',
  review: 'Rever metas',
  later: 'Agora não',
  laterA11y: 'Agora não: o convite para rever as metas volta em três meses',
  laterNotice: 'Combinado. O convite volta em três meses.',
  deviceOnly: 'O convite vale para este aparelho.',
  screenTitle: 'Rever metas',
  screenIntro: 'Confira cada meta. Se algo mudou, abra a meta e use Editar meta. Nada muda aqui sem você abrir a meta.',
  done: 'Concluir revisão',
  doneNotice: 'Revisão concluída. O próximo convite vem em três meses.',
  open: (name: string) => `Abrir a meta ${name}`,
  empty: 'Nenhuma meta ativa para rever.',
  saved: (savedCents: Cents, targetCents: Cents) => `Guardado: ${formatBRL(savedCents)} de ${formatBRL(targetCents)}`,
  deadline: (month: string) => `Prazo: ${formatMonthYearBR(month)}`,
  noDeadline: 'Sem prazo',
  plan: (cents: Cents) => `Plano: ${formatBRL(cents)} por mês, sem contar rendimentos`,
  noPlan: 'Sem plano por mês',
  questions: ['O valor da meta ainda é esse?', 'O prazo ainda vale?', 'O valor por mês cabe no seu mês hoje?'] as readonly string[],
  questionsTitle: 'Três perguntas para cada meta',
} as const;

/** O mês do próximo convite, para a frase de confirmação ("volta em fevereiro de 2027"). */
export function goalsReviewNextMonthText(today: IsoDate): string {
  return formatMonthYearBR(monthOf(goalsReviewNextOn(today)));
}
