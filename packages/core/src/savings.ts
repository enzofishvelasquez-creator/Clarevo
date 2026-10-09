import { WEEKS_PER_YEAR } from './calculators/custo-por-ano';
import type { CommittedSummary } from './committed';
import type { IsoDate, IsoMonth } from './dates';
import { addDays, addMonths, formatMonthYearBR, todayIn } from './dates';
import {
  GOALS_TEXT,
  GOAL_DEADLINE_MAX_MONTHS,
  GOAL_ERROR_TEXT,
  GOAL_RESERVE_REFERENCE,
  RESERVE_NAME,
  emergencyTarget,
  firstProjectedMonth,
  goalProgress,
  goalsMonthTexts,
  monthReachedWithPlan,
  organizeGoals,
} from './goals';
import type { Cents } from './money';
import { MAX_RECORD_CENTS, ceilDiv, formatBRL, parseBRL, roundDiv } from './money';
import type { EssentialBaseSource, Goal, GoalMovement, IncomeReference, NewGoalInput, SavingsAnswer, SavingsCheck } from './records';

/**
 * Plano de guardar (spec7, Ciclo C). A pessoa responde se consegue guardar algum valor por mês; com "sim", o core monta um
 * plano em etapas com o valor informado; com "agora não", sugere uma reserva mínima. A resposta e as datas são só da
 * própria pessoa (tabela savings_checks, função set_savings_answer, repetidas no MemoryRepository).
 *
 * - Respostas: 'consigo' (valor de R$ 1,00 a R$ 9.999.999,99, ou seja, 100 a 999.999.999 centavos), 'agora_nao' (volta em 30
 *   dias) e 'depois' (volta em 7 dias).
 *   As datas de volta são calculadas na gravação, no dia da pessoa. Nenhuma notificação, e-mail ou contagem de dias.
 * - Etapas, sem rendimento: reserva de 1, 3 e 6 meses dos gastos essenciais (exemplos de meta para começar do Portal do
 *   Investidor, da CVM) e depois as metas da pessoa, por prazo. Falta = alvo da etapa menos o que a reserva já guarda
 *   (nas metas, o guardado delas). Mês previsto pela regra de monthReachedWithPlan, com P0 = firstProjectedMonth.
 * - Etapas da reserva são cumulativas (mesmo dinheiro): cada uma conta desde P0 com o valor por mês todo na reserva. As
 *   metas começam no mês seguinte ao da etapa da reserva escolhida (padrão: a primeira não alcançada) e seguem em
 *   fila, uma depois da outra, na ordem de prazo.
 * - Reserva mínima: a pessoa escolhe, a partir de R$ 100,00; nada vem marcado.
 */

export const SAVINGS_ANSWERS: readonly SavingsAnswer[] = ['consigo', 'agora_nao', 'depois'];
/** "Responder depois": a pergunta volta em 7 dias. */
export const SAVINGS_LATER_DAYS = 7;
/** "Agora não": a pergunta volta em 30 dias. */
export const SAVINGS_NOT_NOW_DAYS = 30;
/** Etapas da reserva, em meses de gastos essenciais (exemplos de meta da CVM). */
export const SAVINGS_STAGE_MONTHS: readonly number[] = [1, 3, 6];
/** Reserva mínima: o menor valor aceito, R$ 100,00. */
export const MINIMUM_RESERVE_MIN_CENTS = 10_000;
/** Valores prontos da reserva mínima, nenhum marcado no começo. */
export const MINIMUM_RESERVE_CHIPS: readonly Cents[] = [10_000, 30_000, 50_000, 100_000];
/** Valor por mês de "Sim, consigo": de R$ 1,00 (100 centavos, como o banco) a R$ 9.999.999,99. */
export const SAVINGS_MIN_MONTHLY_CENTS = 100;
/** Passo pequeno sugerido: R$ 10,00 por semana. */
export const SAVINGS_WEEKLY_STEP_CENTS = 1_000;

const isInt = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n);
const isAmount = (n: unknown): n is number => isInt(n) && n >= 1 && n <= MAX_RECORD_CENTS;

// ---------------------------------------------------------------------------
// Resposta e quando perguntar de novo
// ---------------------------------------------------------------------------

/** Códigos de set_savings_answer que o core confere (os outros vêm do repositório). */
export type SavingsErrorCode = 'resposta_invalida' | 'valor_invalido' | 'valor_acima_do_limite';

/** Dia em que a pergunta volta: 'depois' hoje + 7, 'agora_nao' hoje + 30, 'consigo' nenhum (como o banco). */
export function savingsAskAgainOn(answer: SavingsAnswer, today: IsoDate): IsoDate | null {
  if (answer === 'depois') return addDays(today, SAVINGS_LATER_DAYS);
  if (answer === 'agora_nao') return addDays(today, SAVINGS_NOT_NOW_DAYS);
  return null;
}

/**
 * Primeiro erro da resposta, na ordem do banco (set_savings_answer): resposta fora da lista (resposta_invalida); com
 * 'consigo', valor nulo ou menor que 100 centavos (valor_invalido) e acima de R$ 9.999.999,99 (valor_acima_do_limite);
 * nas outras respostas, qualquer valor é recusado (valor_invalido).
 */
export function savingsAnswerError(answer: unknown, monthlyCents: Cents | null | undefined): SavingsErrorCode | null {
  if (typeof answer !== 'string' || !(SAVINGS_ANSWERS as readonly string[]).includes(answer)) return 'resposta_invalida';
  if (answer !== 'consigo') return monthlyCents === null || monthlyCents === undefined ? null : 'valor_invalido';
  if (!isInt(monthlyCents) || monthlyCents < SAVINGS_MIN_MONTHLY_CENTS) return 'valor_invalido';
  return monthlyCents > MAX_RECORD_CENTS ? 'valor_acima_do_limite' : null;
}

/** "Quanto você consegue guardar por mês?": o texto digitado vira centavos (de 100 a 999.999.999, R$ 1,00 a R$ 9.999.999,99). */
export function validateSavingsDraft(
  text: string,
): { ok: true; monthlyCents: Cents } | { ok: false; code: 'valor_invalido' | 'valor_acima_do_limite'; error: string } {
  const v = parseBRL(text);
  if (v === null || v < SAVINGS_MIN_MONTHLY_CENTS) return { ok: false, code: 'valor_invalido', error: SAVINGS_ERROR_TEXT.valor_invalido };
  if (v > MAX_RECORD_CENTS) return { ok: false, code: 'valor_acima_do_limite', error: SAVINGS_ERROR_TEXT.valor_acima_do_limite };
  return { ok: true, monthlyCents: v };
}

/** Por que a pergunta aparece: ainda sem resposta, 'depois' vencido, 'agora_nao' vencido ou a renda de referência mudou. */
export type SavingsAskReason = 'primeira' | 'depois' | 'agora_nao' | 'renda_mudou';

/**
 * Motivo para perguntar agora, ou null.
 * - Sem resposta: 'primeira'.
 * - 'depois' e 'agora_nao': só a partir do dia marcado (hoje >= askAgainOn); antes disso, nada, nem se a renda mudar.
 * - 'consigo': nunca por data; só quando a renda de referência mudou depois do dia da resposta ('renda_mudou').
 * incomeReferenceChangedAfter: dia (no fuso da pessoa) da alteração mais recente da renda de referência para outro
 * valor (lastIncomeReferenceChange), ou null. Mudar no mesmo dia da resposta não faz a pergunta voltar.
 */
export function savingsAskReason(
  check: SavingsCheck | null,
  today: IsoDate,
  incomeReferenceChangedAfter: IsoDate | null = null,
): SavingsAskReason | null {
  if (check === null) return 'primeira';
  if (check.answer === 'consigo') {
    return incomeReferenceChangedAfter !== null && incomeReferenceChangedAfter > check.answeredOn ? 'renda_mudou' : null;
  }
  if (check.askAgainOn !== null && today < check.askAgainOn) return null;
  return check.answer === 'agora_nao' ? 'agora_nao' : 'depois';
}

/** A pergunta "Você consegue guardar algum valor por mês?" deve aparecer agora? */
export function shouldAskSavings(check: SavingsCheck | null, today: IsoDate, incomeReferenceChangedAfter: IsoDate | null = null): boolean {
  return savingsAskReason(check, today, incomeReferenceChangedAfter) !== null;
}

/** Card da aba Metas: a pergunta (com o título do motivo), o resumo do plano ou nada. */
export type SavingsCardState =
  | { kind: 'pergunta'; reason: SavingsAskReason; title: string; monthlyCents: Cents | null }
  | { kind: 'plano'; monthlyCents: Cents }
  | { kind: 'oculto' };

export function savingsCardState(check: SavingsCheck | null, today: IsoDate, incomeReferenceChangedAfter: IsoDate | null = null): SavingsCardState {
  const reason = savingsAskReason(check, today, incomeReferenceChangedAfter);
  if (reason !== null) {
    const title =
      reason === 'renda_mudou' ? SAVINGS_TEXT.incomeChangedTitle : reason === 'agora_nao' ? SAVINGS_TEXT.askAgainTitle : SAVINGS_TEXT.askTitle;
    return { kind: 'pergunta', reason, title, monthlyCents: check?.monthlyCents ?? null };
  }
  if (check !== null && check.answer === 'consigo' && check.monthlyCents !== null) return { kind: 'plano', monthlyCents: check.monthlyCents };
  return { kind: 'oculto' };
}

/** 4º passo de "Primeiros passos" ("Planejar quanto guardar"): concluído com 'consigo' ou 'agora_nao'. */
export function isSavingsStepDone(check: SavingsCheck | null): boolean {
  return check !== null && (check.answer === 'consigo' || check.answer === 'agora_nao');
}

/**
 * Dia da última mudança da renda de referência para outro valor, ou null. Conta: uma referência alterada (versão acima
 * de 1, no dia da alteração) e uma referência nova, de mês posterior, com valor diferente da anterior (no dia em que foi
 * criada). A primeira referência da pessoa não é mudança. timeZone: fuso da pessoa para converter o instante em dia
 * (sem ele, o dia do instante em UTC).
 */
export function lastIncomeReferenceChange(
  references: readonly Pick<IncomeReference, 'fromMonth' | 'amountCents' | 'version' | 'createdAt' | 'updatedAt'>[],
  timeZone?: string,
): IsoDate | null {
  const day = (instant: string): IsoDate => {
    if (timeZone) {
      try {
        return todayIn(timeZone, new Date(instant));
      } catch {
        // Fuso ou instante inválido: cai no dia do instante.
      }
    }
    return instant.slice(0, 10);
  };
  const sorted = [...references].sort((a, b) => a.fromMonth.localeCompare(b.fromMonth));
  let latest: IsoDate | null = null;
  for (let i = 0; i < sorted.length; i += 1) {
    const r = sorted[i]!;
    const previous = sorted[i - 1];
    const instants: string[] = [];
    if (r.version > 1) instants.push(r.updatedAt);
    if (previous && previous.amountCents !== r.amountCents) instants.push(r.createdAt);
    for (const instant of instants) {
      const d = day(instant);
      if (latest === null || d > latest) latest = d;
    }
  }
  return latest;
}

// ---------------------------------------------------------------------------
// Plano em etapas ("Sim, consigo")
// ---------------------------------------------------------------------------

export type SavingsStageKind = 'reserva' | 'meta';

/** Uma etapa do plano: uma reserva de 1, 3 ou 6 meses de gastos essenciais, ou uma meta da pessoa. */
export interface SavingsStage {
  /** 'reserva-1', 'reserva-3', 'reserva-6' ou 'meta-<id da meta>'. */
  id: string;
  kind: SavingsStageKind;
  /** Reserva: 1, 3 ou 6. Meta: null. */
  months: number | null;
  /** Meta: a meta. Reserva: a reserva que já existe, se houver. */
  goalId: string | null;
  /** "1 mês dos seus gastos essenciais" ou o nome da meta. */
  label: string;
  targetCents: Cents;
  /** Reserva: o que a reserva guarda hoje (igual nas etapas). Meta: o guardado dela. */
  savedCents: Cents;
  /** max(alvo − guardado, 0). */
  missingCents: Cents;
  /** guardado >= alvo. */
  reached: boolean;
  /** Prazo da meta (null na reserva e em metas sem prazo). */
  targetMonth: IsoMonth | null;
  /** Mês previsto com o valor por mês, sem rendimento (null quando alcançada, sem previsão ou além do limite). */
  reachMonth: IsoMonth | null;
  /** Faltam mais de 600 meses (50 anos): sem mês previsto. */
  beyond: boolean;
}

export interface SavingsPlanInput {
  /** Quanto a pessoa consegue guardar por mês (R$ 1,00 a R$ 9.999.999,99; o plano não recusa, só deixa sem previsão). */
  monthlyCents: Cents;
  /** Gastos essenciais por mês (a sugestão de essentialMonthly, já ajustada pela pessoa); null = ainda não informou. */
  essentialCents: Cents | null;
  /** listGoals(contexto): a reserva não arquivada e as metas ativas entram no plano. */
  goals: readonly Pick<Goal, 'id' | 'goalType' | 'name' | 'status' | 'targetCents' | 'targetMonth' | 'savedCents' | 'createdAt' | 'updatedAt'>[];
  /** Movimentos do mês atual (listGoalMovementsInMonth): só os aportes da reserva no mês decidem P0. */
  movements: readonly Pick<GoalMovement, 'goalId' | 'kind' | 'occurredOn'>[];
  today: IsoDate;
  /** Etapa da reserva escolhida ('reserva-1', 'reserva-3' ou 'reserva-6'); padrão: a primeira não alcançada. */
  chosenStageId?: string | null;
}

export interface SavingsPlan {
  monthlyCents: Cents;
  /** P0 da reserva: o mês atual, se ainda não houve aporte nele; senão, o seguinte. */
  firstProjectedMonth: IsoMonth;
  /** Gastos essenciais usados (null quando não calculáveis: só as metas aparecem). */
  essentialCents: Cents | null;
  /** A pessoa já tem uma reserva para imprevistos (não arquivada). */
  hasReserve: boolean;
  reserveSavedCents: Cents;
  /** Reservas de 1, 3 e 6 meses (as que cabem no limite) e depois as metas ativas, por prazo. */
  stages: SavingsStage[];
  /** Etapa da reserva escolhida: a pedida ou a primeira não alcançada; null sem etapas de reserva. */
  chosenStageId: string | null;
}

/** Mês previsto e se passa do limite. from null: a etapa anterior não tem previsão. */
function project(missingCents: Cents, monthlyCents: Cents, from: IsoMonth | null): { reachMonth: IsoMonth | null; beyond: boolean } {
  if (missingCents <= 0 || !isAmount(monthlyCents)) return { reachMonth: null, beyond: false };
  if (from === null || ceilDiv(missingCents, monthlyCents) > GOAL_DEADLINE_MAX_MONTHS) return { reachMonth: null, beyond: true };
  return { reachMonth: monthReachedWithPlan(missingCents, monthlyCents, from), beyond: false };
}

const reserveStageLabel = (months: number) => `${GOALS_TEXT.reserve.monthChip(months)} dos seus gastos essenciais`;

/** Metas por prazo (sem prazo no fim), depois por criação. */
function byDeadline<G extends Pick<Goal, 'targetMonth' | 'createdAt' | 'id'>>(a: G, b: G): number {
  return (a.targetMonth ?? '9999-99').localeCompare(b.targetMonth ?? '9999-99') || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
}

/**
 * Plano em etapas com o valor por mês informado, sem rendimento:
 * 1. reserva de 1 mês dos gastos essenciais; 2. de 3 meses; 3. de 6 meses; 4. metas ativas da pessoa, na ordem de prazo.
 * Cada etapa: valor, quanto falta (descontando o que a reserva já guarda; nas metas, o guardado delas) e o mês previsto
 * (monthReachedWithPlan a partir de P0). As metas começam no mês seguinte ao da etapa da reserva escolhida e seguem em
 * fila. Sem gastos essenciais calculáveis, só as metas, a partir de P0. Metas já alcançadas ficam na lista, com reached.
 */
export function savingsPlan(input: SavingsPlanInput): SavingsPlan {
  const essential = isAmount(input.essentialCents) ? input.essentialCents : null;
  const { reserve, active } = organizeGoals(input.goals);
  const reserveSaved = reserve?.savedCents ?? 0;
  const p0 = firstProjectedMonth(reserve ? input.movements.filter((m) => m.goalId === reserve.id) : [], input.today);

  const stages: SavingsStage[] = [];
  if (essential !== null) {
    for (const months of SAVINGS_STAGE_MONTHS) {
      const target = emergencyTarget(essential, months);
      if (target === null) continue;
      const progress = goalProgress(reserveSaved, target);
      const projected = project(progress.missingCents, input.monthlyCents, p0);
      stages.push({
        id: `reserva-${months}`,
        kind: 'reserva',
        months,
        goalId: reserve?.id ?? null,
        label: reserveStageLabel(months),
        targetCents: target,
        savedCents: reserveSaved,
        missingCents: progress.missingCents,
        reached: progress.reached,
        targetMonth: null,
        ...projected,
      });
    }
  }

  const reserveStages = stages.filter((s) => s.kind === 'reserva');
  const chosen = reserveStages.find((s) => s.id === input.chosenStageId) ?? reserveStages.find((s) => !s.reached) ?? null;
  let start: IsoMonth | null = p0;
  if (chosen !== null && !chosen.reached) start = chosen.reachMonth === null ? null : addMonths(chosen.reachMonth, 1);

  for (const goal of [...active].sort(byDeadline)) {
    const progress = goalProgress(goal.savedCents, goal.targetCents);
    const projected = project(progress.missingCents, input.monthlyCents, start);
    stages.push({
      id: `meta-${goal.id}`,
      kind: 'meta',
      months: null,
      goalId: goal.id,
      label: goal.name,
      targetCents: goal.targetCents,
      savedCents: goal.savedCents,
      missingCents: progress.missingCents,
      reached: progress.reached,
      targetMonth: goal.targetMonth,
      ...projected,
    });
    if (projected.reachMonth !== null) start = addMonths(projected.reachMonth, 1);
    else if (progress.missingCents > 0) start = null;
  }

  return {
    monthlyCents: input.monthlyCents,
    firstProjectedMonth: p0,
    essentialCents: essential,
    hasReserve: reserve !== null,
    reserveSavedCents: reserveSaved,
    stages,
    chosenStageId: chosen?.id ?? null,
  };
}

/**
 * "Usar este plano": os campos da reserva para imprevistos com o alvo da etapa escolhida (opts.stageId ou a escolhida do
 * plano) e o valor planejado por mês igual ao informado. Serve a createGoal (sem reserva) e a updateGoal (com reserva:
 * passe existing para manter o nome e o prazo). source: de onde vieram os gastos essenciais (essentialMonthly). null
 * sem etapa de reserva.
 */
export function savingsReserveInput(
  plan: SavingsPlan,
  source: EssentialBaseSource,
  opts: { stageId?: string | null; existing?: Pick<Goal, 'name' | 'targetMonth'> | null } = {},
): NewGoalInput | null {
  const id = opts.stageId ?? plan.chosenStageId;
  const stage = plan.stages.find((s) => s.kind === 'reserva' && s.id === id);
  if (!stage || stage.months === null || plan.essentialCents === null) return null;
  return {
    goalType: 'emergencia',
    name: opts.existing?.name ?? RESERVE_NAME,
    targetCents: stage.targetCents,
    targetMonth: opts.existing?.targetMonth ?? null,
    plannedMonthlyCents: isAmount(plan.monthlyCents) ? plan.monthlyCents : null,
    essentialBaseCents: plan.essentialCents,
    essentialMonths: stage.months,
    essentialBaseSource: source,
    initialCents: null,
    initialOn: null,
  };
}

// ---------------------------------------------------------------------------
// Reserva mínima e passos pequenos ("Agora não")
// ---------------------------------------------------------------------------

export interface MinimumReserveOption {
  /** 'valor-10000', 'valor-30000', 'valor-50000', 'valor-100000', 'essenciais' ou 'outro'. */
  id: string;
  kind: 'valor' | 'essenciais' | 'outro';
  /** "R$ 100,00", "1 mês dos seus gastos essenciais" ou "Outro valor". */
  label: string;
  /** Valor da reserva mínima; null em "Outro valor" (a pessoa digita, a partir de MINIMUM_RESERVE_MIN_CENTS). */
  cents: Cents | null;
}

/**
 * Opções da reserva mínima, nenhuma marcada: R$ 100,00, R$ 300,00, R$ 500,00, R$ 1.000,00, "1 mês dos seus gastos
 * essenciais" (só quando calculável e a partir de R$ 100,00) e "Outro valor" (mínimo R$ 100,00).
 */
export function minimumReserveOptions(essentialCents: Cents | null): MinimumReserveOption[] {
  const options: MinimumReserveOption[] = MINIMUM_RESERVE_CHIPS.map((cents) => ({
    id: `valor-${cents}`,
    kind: 'valor',
    label: formatBRL(cents),
    cents,
  }));
  if (isAmount(essentialCents) && essentialCents >= MINIMUM_RESERVE_MIN_CENTS) {
    options.push({ id: 'essenciais', kind: 'essenciais', label: SAVINGS_TEXT.minimumEssentials, cents: essentialCents });
  }
  options.push({ id: 'outro', kind: 'outro', label: SAVINGS_TEXT.minimumOther, cents: null });
  return options;
}

/** "Outro valor" da reserva mínima: de R$ 100,00 a R$ 9.999.999,99. */
export function validateMinimumReserveDraft(
  text: string,
): { ok: true; targetCents: Cents } | { ok: false; code: 'valor_invalido' | 'valor_acima_do_limite'; error: string } {
  const v = parseBRL(text);
  if (v === null || v < MINIMUM_RESERVE_MIN_CENTS) return { ok: false, code: 'valor_invalido', error: SAVINGS_ERROR_TEXT.minimum_invalido };
  if (v > MAX_RECORD_CENTS) return { ok: false, code: 'valor_acima_do_limite', error: SAVINGS_ERROR_TEXT.valor_acima_do_limite };
  return { ok: true, targetCents: v };
}

/**
 * "Criar reserva mínima": reserva para imprevistos com o alvo escolhido. A reserva do Ciclo C exige base × meses; aqui a
 * base é o próprio alvo, com 1 mês. source: 'informado' (o valor foi escolhido pela pessoa) ou, na opção "1 mês dos
 * seus gastos essenciais", a origem dos gastos essenciais. plannedMonthlyCents: o valor por mês de um passo pequeno,
 * quando a pessoa escolheu um; senão null.
 */
export function minimumReserveInput(
  targetCents: Cents,
  plannedMonthlyCents: Cents | null = null,
  source: EssentialBaseSource = 'informado',
  existing: Pick<Goal, 'name' | 'targetMonth'> | null = null,
): NewGoalInput {
  return {
    goalType: 'emergencia',
    name: existing?.name ?? RESERVE_NAME,
    targetCents,
    targetMonth: existing?.targetMonth ?? null,
    plannedMonthlyCents,
    essentialBaseCents: targetCents,
    essentialMonths: 1,
    essentialBaseSource: source,
    initialCents: null,
    initialOn: null,
  };
}

/** Passo semanal por mês, como em "Quanto custa por ano?": arredonda(valor × 52 ÷ 12). R$ 10,00 por semana: R$ 43,33. */
export function weeklySavingsToMonthly(weeklyCents: Cents): Cents {
  return roundDiv(weeklyCents * WEEKS_PER_YEAR, 12);
}

export interface SavingsSmallStep {
  id: 'semanal' | 'extra';
  /** "Guardar R$ 10,00 por semana" ou "Guardar quando entrar um valor extra". */
  label: string;
  /** Valor por mês que vira o plano da reserva mínima; null no passo sem valor fixo. */
  monthlyCents: Cents | null;
  /** "R$ 43,33 por mês" ou null. */
  monthlyLabel: string | null;
}

/** Passos pequenos sugeridos. Nada é gravado até a pessoa escolher. */
export function savingsSmallSteps(): SavingsSmallStep[] {
  const monthly = weeklySavingsToMonthly(SAVINGS_WEEKLY_STEP_CENTS);
  return [
    { id: 'semanal', label: SAVINGS_TEXT.weeklyStep(SAVINGS_WEEKLY_STEP_CENTS), monthlyCents: monthly, monthlyLabel: SAVINGS_TEXT.weeklyStepMonthly(monthly) },
    { id: 'extra', label: SAVINGS_TEXT.extraStep, monthlyCents: null, monthlyLabel: null },
  ];
}

// ---------------------------------------------------------------------------
// Textos
// ---------------------------------------------------------------------------

/** Mensagens do plano de guardar (as dos códigos de set_savings_answer e dos campos). */
export const SAVINGS_ERROR_TEXT = {
  valor_invalido: 'Informe um valor entre R$ 1,00 e R$ 9.999.999,99, como 300,00.',
  valor_acima_do_limite: GOAL_ERROR_TEXT.valor_acima_do_limite,
  /** Reserva mínima abaixo de R$ 100,00 ou ilegível. */
  minimum_invalido: 'Informe um valor a partir de R$ 100,00, como 300,00.',
  versao_desatualizada: 'Esta resposta foi alterada em outro aparelho. Confira a versão atual antes de salvar.',
  salvar_falhou: GOAL_ERROR_TEXT.salvar_falhou,
  sem_permissao: GOAL_ERROR_TEXT.sem_permissao,
} as const;

/** Mensagem de um código do plano de guardar; código desconhecido: falha genérica. */
export function savingsErrorText(code: string): string {
  const texts: Record<string, string> = SAVINGS_ERROR_TEXT;
  return code in texts ? texts[code]! : SAVINGS_ERROR_TEXT.salvar_falhou;
}

const ORDINAL: Readonly<Record<number, string>> = { 1: 'primeira', 2: 'segunda', 3: 'terceira' };
const capitalize = (text: string) => `${text.charAt(0).toUpperCase()}${text.slice(1)}`;

/** Textos do plano de guardar (spec7): pergunta, "Sim, consigo", "Agora não", reserva mínima e passos pequenos. */
export const SAVINGS_TEXT = {
  // Pergunta (card no topo da aba Metas, antes de "Seu mês" e da reserva).
  askTitle: 'Você consegue guardar algum valor por mês?',
  askBody: 'Sua resposta ajuda a montar um plano com os seus números. Ela fica só com você.',
  /** Quando "Agora não" vence (30 dias). */
  askAgainTitle: 'Sua situação mudou? Você consegue guardar algum valor por mês?',
  /** Quando a renda de referência mudou depois de "Sim, consigo". */
  incomeChangedTitle: 'Sua renda de referência mudou. Quer rever quanto guardar por mês?',
  yes: 'Sim, consigo',
  notNow: 'Agora não',
  later: 'Responder depois',
  changeValue: 'Mudar valor',
  keepValue: 'Manter o valor',
  privacy: 'Sua resposta e as datas de volta ficam só com você. A empresa que oferece o benefício não vê, nem somada às de outras pessoas.',
  /** 4º passo de "Primeiros passos" no Resumo. */
  firstStepTitle: 'Planejar quanto guardar',
  firstStepText: 'Diga se consegue guardar um valor por mês e veja um plano.',

  // "Sim, consigo".
  amountLabel: 'Quanto você consegue guardar por mês?',
  amountHint: 'De R$ 1,00 a R$ 9.999.999,99.',
  /** Depois da referência: "Fora dos compromissos em outubro: R$ 2.850,00. Não é saldo: ainda precisa cobrir gastos do dia a dia." */
  referenceNote: 'Não é saldo: ainda precisa cobrir gastos do dia a dia.',
  amountSaved: 'Valor por mês salvo.',
  planTitle: 'Seu plano de guardar',
  /** "Você planeja guardar R$ 500,00 por mês." */
  planMonthly: (monthlyCents: Cents) => `Você planeja guardar ${formatBRL(monthlyCents)} por mês.`,
  stagesTitle: 'Etapas do plano',
  goalsTitle: 'Suas metas, por prazo',
  stagesReference:
    'As etapas de 1, 3 e 6 meses seguem os exemplos de meta para começar citados pelo Portal do Investidor, da CVM. A escolha é sua.',
  stagesReferenceSource: GOAL_RESERVE_REFERENCE.sourceText,
  noInterest: 'Sem contar rendimentos.',
  needsEssentials: 'Para montar as etapas da reserva, informe quanto você gasta por mês com o essencial: moradia, mercado, transporte, saúde e educação.',
  chooseStage: 'Até qual etapa você quer ir agora?',
  useThisPlan: 'Usar este plano',
  afterStage: 'Depois, o mesmo valor pode ir para as suas metas.',
  planUsed: 'Plano salvo na sua reserva.',
  /** "a primeira etapa (R$ 3.750,00, 1 mês dos seus gastos essenciais)" */
  stageSubjectReserve: (ordinal: number, targetCents: Cents, label: string) =>
    `a ${ORDINAL[ordinal] ?? String(ordinal)} etapa (${formatBRL(targetCents)}, ${label})`,
  /** "a meta Viagem de férias (R$ 6.000,00)" */
  stageSubjectGoal: (name: string, targetCents: Cents) => `a meta ${name} (${formatBRL(targetCents)})`,
  /** "Com R$ 300,00 por mês, a primeira etapa (R$ 3.750,00, 1 mês dos seus gastos essenciais) chega em novembro de 2027." */
  stageWithMonth: (monthlyCents: Cents, subject: string, month: IsoMonth) =>
    `Com ${formatBRL(monthlyCents)} por mês, ${subject} chega em ${formatMonthYearBR(month)}.`,
  stageReachedSentence: (subject: string, reserve: boolean) =>
    reserve ? `${capitalize(subject)} já está alcançada com o que a reserva guarda.` : `${capitalize(subject)} já está alcançada.`,
  stageBeyondSentence: (monthlyCents: Cents, subject: string) => `Com ${formatBRL(monthlyCents)} por mês, ${subject} passa de 50 anos.`,
  stageNoForecast: (subject: string, missingCents: Cents) => `${capitalize(subject)}: faltam ${formatBRL(missingCents)}.`,
  /** "Chega em novembro de 2027" */
  stageMonth: (month: IsoMonth) => `Chega em ${formatMonthYearBR(month)}`,
  stageBeyond: 'Passa de 50 anos',
  stageReached: 'Alcançada',

  // "Agora não".
  notNowBody: 'Tudo bem. Muita gente começa com valores pequenos, e qualquer valor guardado ajuda num imprevisto.',
  minimumTitle: 'Quer começar uma reserva mínima?',
  minimumEssentials: '1 mês dos seus gastos essenciais',
  minimumOther: 'Outro valor',
  minimumOtherLabel: 'Valor da reserva mínima',
  minimumOtherHint: 'A partir de R$ 100,00.',
  minimumCreate: 'Criar reserva mínima',
  minimumCreated: 'Reserva mínima criada.',
  smallStepsTitle: 'Passos pequenos',
  smallStepsHint: 'Se escolher um valor por mês, ele vira o plano da sua reserva mínima.',
  /** "Guardar R$ 10,00 por semana" */
  weeklyStep: (weeklyCents: Cents) => `Guardar ${formatBRL(weeklyCents)} por semana`,
  /** "R$ 43,33 por mês" */
  weeklyStepMonthly: (monthlyCents: Cents) => `${formatBRL(monthlyCents)} por mês`,
  weeklyStepBasis: '52 semanas por ano; por mês, o valor do ano dividido por 12.',
  extraStep: 'Guardar quando entrar um valor extra',
  helpWhere: 'Ver para onde foi o dinheiro',
  helpCommitted: GOALS_TEXT.seeCommitted,
  askNextMonth: 'Me pergunte de novo no próximo mês',
} as const;

/**
 * Referência do mês na pergunta "Sim, consigo": "Fora dos compromissos em outubro: R$ 2.850,00. Não é saldo: ainda
 * precisa cobrir gastos do dia a dia." Sem renda de referência: null. Com as contas acima da referência, só a frase do
 * Ciclo B (As contas do mês passam a renda de referência em ...).
 */
export function savingsReferenceText(summary: CommittedSummary | null, month: IsoMonth): string | null {
  const outside = goalsMonthTexts(summary, 0, month).outside;
  if (outside === null) return null;
  return summary !== null && summary.outsideCents !== null && summary.outsideCents >= 0 ? `${outside}. ${SAVINGS_TEXT.referenceNote}` : outside;
}

export interface SavingsStageTexts {
  id: string;
  /** "1 mês dos seus gastos essenciais" ou o nome da meta. */
  title: string;
  /** "R$ 3.750,00" */
  amount: string;
  /** "Faltam R$ 250,00" ou "Alcançada". */
  missing: string;
  /** "Chega em novembro de 2026", "Passa de 50 anos" ou null (alcançada ou sem previsão). */
  month: string | null;
  /** A frase completa da etapa, também usada como descrição para leitor de tela. */
  sentence: string;
}

/** Textos de uma etapa com o valor por mês do plano. */
export function savingsStageTexts(stage: SavingsStage, monthlyCents: Cents): SavingsStageTexts {
  const reserve = stage.kind === 'reserva';
  const ordinal = reserve ? SAVINGS_STAGE_MONTHS.indexOf(stage.months!) + 1 : 0;
  const subject = reserve
    ? SAVINGS_TEXT.stageSubjectReserve(ordinal, stage.targetCents, stage.label)
    : SAVINGS_TEXT.stageSubjectGoal(stage.label, stage.targetCents);
  let sentence: string;
  if (stage.reached) sentence = SAVINGS_TEXT.stageReachedSentence(subject, reserve);
  else if (stage.reachMonth !== null) sentence = SAVINGS_TEXT.stageWithMonth(monthlyCents, subject, stage.reachMonth);
  else if (stage.beyond) sentence = SAVINGS_TEXT.stageBeyondSentence(monthlyCents, subject);
  else sentence = SAVINGS_TEXT.stageNoForecast(subject, stage.missingCents);
  return {
    id: stage.id,
    title: stage.label,
    amount: formatBRL(stage.targetCents),
    missing: stage.reached ? SAVINGS_TEXT.stageReached : GOALS_TEXT.detail.missing(stage.missingCents),
    month: stage.reachMonth !== null ? SAVINGS_TEXT.stageMonth(stage.reachMonth) : stage.beyond ? SAVINGS_TEXT.stageBeyond : null,
    sentence,
  };
}

export interface SavingsPlanTexts {
  /** "Você planeja guardar R$ 500,00 por mês." */
  monthly: string;
  /** A frase da etapa escolhida da reserva (ou da primeira meta sem alcançar, sem reserva). */
  headline: string | null;
  stages: SavingsStageTexts[];
  /** "Depois, o mesmo valor pode ir para as suas metas." (só com reserva escolhida e metas por alcançar). */
  afterStage: string | null;
  /** Sem gastos essenciais: pede o valor. */
  needsEssentials: string | null;
  reference: string;
  referenceSource: string;
  noInterest: string;
}

/** Textos do resumo e da lista de etapas do plano. */
export function savingsPlanTexts(plan: SavingsPlan): SavingsPlanTexts {
  const stages = plan.stages.map((s) => savingsStageTexts(s, plan.monthlyCents));
  const chosen = plan.stages.findIndex((s) => s.id === plan.chosenStageId);
  const firstGoal = plan.stages.findIndex((s) => s.kind === 'meta' && !s.reached);
  const headlineIndex = chosen >= 0 ? chosen : firstGoal;
  return {
    monthly: SAVINGS_TEXT.planMonthly(plan.monthlyCents),
    headline: headlineIndex >= 0 ? stages[headlineIndex]!.sentence : null,
    stages,
    afterStage: chosen >= 0 && firstGoal >= 0 ? SAVINGS_TEXT.afterStage : null,
    needsEssentials: plan.essentialCents === null ? SAVINGS_TEXT.needsEssentials : null,
    reference: SAVINGS_TEXT.stagesReference,
    referenceSource: SAVINGS_TEXT.stagesReferenceSource,
    noInterest: SAVINGS_TEXT.noInterest,
  };
}
