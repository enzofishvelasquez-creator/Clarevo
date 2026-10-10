import type { Invoice } from './cards';
import { recordShares } from './cards';
import type { CommittedSummary } from './committed';
import { COMMITTED_TEXT, formatPermille } from './committed';
import type { IsoDate, IsoMonth } from './dates';
import {
  addMonths,
  formatDateBR,
  formatDayMonth,
  formatMonthBR,
  formatMonthName,
  formatMonthYearBR,
  isValidIsoDate,
  isValidIsoMonth,
  monthOf,
  monthsBetween,
  parseDateBR,
  parseMonthBR,
} from './dates';
import { formatInteger } from './learn/format';
import type { Cents } from './money';
import { MAX_RECORD_CENTS, ceilDiv, formatBRL, parseBRL, roundDiv } from './money';
import type {
  Commitment,
  EssentialBaseSource,
  FinancialRecord,
  Goal,
  GoalInput,
  GoalMovement,
  GoalMovementInput,
  GoalMovementKind,
  GoalStatus,
  GoalType,
  NewGoalInput,
} from './records';
import { ERROR_TEXT, charCount } from './validation';

/**
 * Metas e reserva para imprevistos (D-027, Ciclo C). Regras puras, repetidas no banco pelas funções de metas
 * (create_goal, update_goal, set_goal_status, delete_goal, add_goal_movement, update_goal_movement e
 * delete_goal_movement) e pela visão goal_items.
 *
 * - guardado(t) = Σ sinal × valor dos movimentos vivos com data até t; guardado = guardado(hoje). Não existe contador.
 * - G1: o guardado ao fim de cada dia nunca fica negativo (um resgate com data passada não atravessa o passado).
 * - Progresso = piso(100 × guardado ÷ alvo): nunca mostra 100% antes de alcançar. "Meta alcançada" só com guardado ≥
 *   alvo; concluir é escolha da pessoa, sem celebração automática.
 * - P0 (primeiro mês projetado) = mês atual, se ainda não houve aporte nele; senão, o mês seguinte.
 * - Por mês até o prazo = teto(falta ÷ (meses(P0, prazo) + 1)); prazo antes de P0: "o prazo chegou".
 * - Mês previsto com o plano = P0 + teto(falta ÷ plano) − 1, sem rendimento.
 * - Guardado no mês = aportes − resgates do mês (sem o já guardado ao criar, rendimentos e (des)valorizações).
 * - Movimentos de meta nunca entram em Recebido, Pago, Diferença, Ainda a pagar nem na renda comprometida; o plano por
 *   mês é intenção, não aporte.
 * - Reserva = gastos essenciais por mês × meses (1 a 24). Essenciais sugeridos pela média do Pago em Moradia, Mercado,
 *   Transporte, Saúde e Educação (P-017) nos até 3 meses fechados mais recentes com gastos anotados, entre os 6
 *   anteriores, sem os gastos gerados por pagamento de conta do ano; sem esses meses, as contas do mês atual; senão,
 *   digitado. Sempre ajustável.
 * - Cobertura = piso(10 × guardado ÷ essenciais) décimos de mês ("0,9 mês"; singular abaixo de 2).
 * - Sem indicação de produto, banco, aplicação ou taxa. O Clarevo não guarda nem movimenta dinheiro.
 */

export const GOAL_TYPES: readonly GoalType[] = ['emergencia', 'oportunidade', 'objetivo'];
export const GOAL_STATUSES: readonly GoalStatus[] = ['ativa', 'concluida', 'arquivada'];
export const GOAL_MOVEMENT_KINDS: readonly GoalMovementKind[] = ['saldo_inicial', 'aporte', 'resgate', 'rendimento', 'valorizacao', 'desvalorizacao'];
export const ESSENTIAL_BASE_SOURCES: readonly EssentialBaseSource[] = ['media_gastos', 'contas_do_mes', 'informado', 'reserva_minima'];
/** Origem da reserva mínima ("Agora não"): base = alvo, sempre 1 mês. */
export const MINIMUM_RESERVE_SOURCE: EssentialBaseSource = 'reserva_minima';
/** Movimentos que a pessoa registra depois de criar a meta ('saldo_inicial' só ao criar). */
export const GOAL_ADDABLE_KINDS: readonly GoalMovementKind[] = ['aporte', 'resgate', 'rendimento', 'valorizacao', 'desvalorizacao'];

export const GOAL_NAME_MAX = 40;
export const GOAL_NOTE_MAX = 80;
export const RESERVE_MONTHS_MIN = 1;
export const RESERVE_MONTHS_MAX = 24;
/** Prazo aceito: do mês de hoje a 600 meses depois (o limite do simulador), como clarevo_validate_goal. */
export const GOAL_DEADLINE_MAX_MONTHS = 600;
/** Meses fechados olhados para a média de gastos essenciais e quantos deles, no máximo, entram na média. */
export const ESSENTIAL_LOOKBACK_MONTHS = 6;
export const ESSENTIAL_AVERAGE_MONTHS = 3;
/** Nome da reserva para imprevistos (fixo; a tela /reserva não pede nome). */
export const RESERVE_NAME = 'Reserva para imprevistos';
/**
 * Chips de "Quantos meses você quer cobrir?", além de "Outro" (1 a 24), nenhum marcado no começo. Os mesmos da
 * calculadora (RESERVA_MONTH_CHIPS): com as faixas da CVM (D-027(6) ajustada pela spec3), 1, 3 e 6 meses como meta para
 * começar e 6 a 12 meses de gastos.
 */
export const RESERVE_MONTH_CHIPS: readonly number[] = [1, 3, 6, 12];
/** Modelos de nome em "Nova meta" ("Outro" deixa o nome em branco). */
export const GOAL_TEMPLATES: readonly string[] = ['Viagem', 'Troca do carro', 'Entrada do imóvel', 'Estudos', 'Outro'];

/** Categorias que contam como gastos essenciais (P-017, proposta Claude, revisável). Lazer e "Sem categoria" ficam fora. */
export const ESSENTIAL_CATEGORIES: readonly string[] = ['Moradia', 'Mercado', 'Transporte', 'Saúde', 'Educação'];

/** Sinal de cada movimento no valor guardado. */
export const MOVEMENT_SIGN: Readonly<Record<GoalMovementKind, 1 | -1>> = {
  saldo_inicial: 1,
  aporte: 1,
  resgate: -1,
  rendimento: 1,
  valorizacao: 1,
  desvalorizacao: -1,
};

/**
 * Descrição digitada num gasto que parece dinheiro guardado: o formulário de gasto mostra "Dinheiro guardado não é
 * gasto" (GOALS_TEXT.savingsHint). Lê o texto da pessoa; fica fora do teste de textos.
 */
export const SAVINGS_HINT = /\b(reserva|poupan[cç]a|caixinha|cofrinho|investi|aplica[cç][aã]o|aporte)/i;

/** A descrição casa com SAVINGS_HINT? */
export function looksLikeSavings(description: string): boolean {
  return SAVINGS_HINT.test(description);
}

// ---------------------------------------------------------------------------
// Valor guardado e saldo dia a dia
// ---------------------------------------------------------------------------

type MovementLike = Pick<GoalMovement, 'kind' | 'amountCents' | 'occurredOn'>;
type MovementWithId = MovementLike & Pick<GoalMovement, 'id'>;

/** Divisão inteira para baixo, exata para inteiros não negativos (corrige o arredondamento do ponto flutuante). */
function floorDiv(a: number, b: number): number {
  let q = Math.floor(a / b);
  if (q * b > a) q -= 1;
  else if ((q + 1) * b <= a) q += 1;
  return q;
}

/** Valor do movimento com o sinal do tipo. */
export function signedAmount(m: Pick<GoalMovement, 'kind' | 'amountCents'>): Cents {
  return MOVEMENT_SIGN[m.kind] * m.amountCents;
}

/** Valor guardado: soma com sinal de todos os movimentos vivos (as datas são sempre até hoje). Igual a goal_items.saved_cents. */
export function goalSaved(movements: readonly Pick<GoalMovement, 'kind' | 'amountCents'>[]): Cents {
  return movements.reduce((acc, m) => acc + signedAmount(m), 0);
}

/** Valor guardado ao fim do dia `date`: só os movimentos com data até ele. */
export function savedOn(movements: readonly MovementLike[], date: IsoDate): Cents {
  return goalSaved(movements.filter((m) => m.occurredOn <= date));
}

/** Mudança proposta num movimento, para conferir o saldo dia a dia antes de gravar. */
export type GoalMovementChange =
  | { op: 'add'; kind: GoalMovementKind; amountCents: Cents; occurredOn: IsoDate }
  | { op: 'update'; id: string; amountCents: Cents; occurredOn: IsoDate }
  | { op: 'delete'; id: string };

/** Movimentos depois da mudança (o tipo de um movimento alterado nunca muda). */
export function applyMovementChange(movements: readonly MovementWithId[], change: GoalMovementChange | null): MovementLike[] {
  if (!change) return [...movements];
  if (change.op === 'add') return [...movements, { kind: change.kind, amountCents: change.amountCents, occurredOn: change.occurredOn }];
  if (change.op === 'delete') return movements.filter((m) => m.id !== change.id);
  return movements.map((m) => (m.id === change.id ? { ...m, amountCents: change.amountCents, occurredOn: change.occurredOn } : m));
}

/**
 * Primeiro dia em que o valor guardado ao fim do dia fica negativo depois da mudança (como clarevo_goal_negative_day:
 * soma por data, acumulada em ordem de data), ou null. Um resgate com data passada é recusado mesmo quando o guardado
 * de hoje seria suficiente.
 */
export function firstNegativeDay(movements: readonly MovementWithId[], change: GoalMovementChange | null = null): IsoDate | null {
  const byDay = new Map<IsoDate, Cents>();
  for (const m of applyMovementChange(movements, change)) byDay.set(m.occurredOn, (byDay.get(m.occurredOn) ?? 0) + signedAmount(m));
  let total = 0;
  for (const day of [...byDay.keys()].sort()) {
    total += byDay.get(day)!;
    if (total < 0) return day;
  }
  return null;
}

/** Totais por tipo (como goal_items), sem sinal, e o guardado. */
export interface GoalComposition {
  savedCents: Cents;
  initialCents: Cents;
  depositsCents: Cents;
  withdrawalsCents: Cents;
  incomeCents: Cents;
  appreciationCents: Cents;
  depreciationCents: Cents;
  lastMovementOn: IsoDate | null;
}

/** Composição do guardado pelos movimentos vivos (mesmos campos de goal_items). */
export function goalComposition(movements: readonly MovementLike[]): GoalComposition {
  const sum = (kind: GoalMovementKind) => movements.filter((m) => m.kind === kind).reduce((acc, m) => acc + m.amountCents, 0);
  const last = movements.reduce<IsoDate | null>((acc, m) => (acc === null || m.occurredOn > acc ? m.occurredOn : acc), null);
  return {
    savedCents: goalSaved(movements),
    initialCents: sum('saldo_inicial'),
    depositsCents: sum('aporte'),
    withdrawalsCents: sum('resgate'),
    incomeCents: sum('rendimento'),
    appreciationCents: sum('valorizacao'),
    depreciationCents: sum('desvalorizacao'),
    lastMovementOn: last,
  };
}

// ---------------------------------------------------------------------------
// Progresso, prazo e plano
// ---------------------------------------------------------------------------

export interface GoalProgress {
  /** piso(100 × guardado ÷ alvo); pode passar de 100 depois de alcançar. */
  percent: number;
  /** Para a barra: o percentual limitado a 100. */
  barPercent: number;
  /** guardado ≥ alvo. */
  reached: boolean;
  /** max(alvo − guardado, 0). */
  missingCents: Cents;
}

/** Progresso arredondado para baixo: 22.499,99 de 22.500,00 dá 99%, nunca 100% antes de alcançar. */
export function goalProgress(savedCents: Cents, targetCents: Cents): GoalProgress {
  const saved = Math.max(0, savedCents);
  const percent = targetCents > 0 ? floorDiv(100 * saved, targetCents) : 0;
  return {
    percent,
    barPercent: Math.min(100, percent),
    reached: saved >= targetCents,
    missingCents: Math.max(targetCents - saved, 0),
  };
}

/** P0: o mês atual, se ainda não houve aporte nele; senão, o mês seguinte. movements: os da meta (pode ser só o mês atual). */
export function firstProjectedMonth(movements: readonly Pick<GoalMovement, 'kind' | 'occurredOn'>[], today: IsoDate): IsoMonth {
  const current = monthOf(today);
  return movements.some((m) => m.kind === 'aporte' && monthOf(m.occurredOn) === current) ? addMonths(current, 1) : current;
}

/** Meses de P0 até o prazo, inclusive (0 ou menos quando o prazo é antes de P0). */
export function monthsUntilDeadline(fromMonth: IsoMonth, targetMonth: IsoMonth): number {
  return monthsBetween(fromMonth, targetMonth) + 1;
}

/**
 * Valor por mês para chegar até o prazo, sem rendimento: teto(falta ÷ (meses(P0, prazo) + 1)). null quando o prazo é
 * antes de P0 ("o prazo chegou"); 0 quando nada falta.
 */
export function monthlyNeeded(missingCents: Cents, fromMonth: IsoMonth, targetMonth: IsoMonth): Cents | null {
  const months = monthsUntilDeadline(fromMonth, targetMonth);
  if (months < 1) return null;
  return missingCents <= 0 ? 0 : ceilDiv(missingCents, months);
}

/** Mês previsto guardando o plano todo mês desde P0, sem rendimento: P0 + teto(falta ÷ plano) − 1. null sem falta ou sem plano. */
export function monthReachedWithPlan(missingCents: Cents, plannedMonthlyCents: Cents | null, fromMonth: IsoMonth): IsoMonth | null {
  if (missingCents <= 0 || plannedMonthlyCents === null || plannedMonthlyCents <= 0) return null;
  return addMonths(fromMonth, ceilDiv(missingCents, plannedMonthlyCents) - 1);
}

/** Guardado no mês: aportes − resgates com data no mês (o já guardado ao criar, rendimentos e (des)valorizações ficam fora). */
export function savedInMonth(movements: readonly MovementLike[], month: IsoMonth): Cents {
  return movements
    .filter((m) => monthOf(m.occurredOn) === month && (m.kind === 'aporte' || m.kind === 'resgate'))
    .reduce((acc, m) => acc + signedAmount(m), 0);
}

/** Planejado para metas: soma do plano por mês das metas ativas. */
export function plannedForGoals(goals: readonly Pick<Goal, 'status' | 'plannedMonthlyCents'>[]): Cents {
  return goals.filter((g) => g.status === 'ativa').reduce((acc, g) => acc + (g.plannedMonthlyCents ?? 0), 0);
}

/** Plano da meta para as telas: progresso, P0, valor por mês até o prazo e mês previsto com o plano. */
export interface GoalPlan {
  savedCents: Cents;
  targetCents: Cents;
  progress: GoalProgress;
  firstProjectedMonth: IsoMonth;
  /** Com prazo: o mês, os meses de P0 até ele e o valor por mês (null = o prazo chegou). null sem prazo. */
  deadline: { month: IsoMonth; months: number; monthlyCents: Cents | null } | null;
  plannedMonthlyCents: Cents | null;
  /** Mês previsto com o plano (null sem plano ou já alcançada). */
  reachMonth: IsoMonth | null;
}

/**
 * goal: de listGoals ou getGoal (savedCents de goal_items). movements: os da meta; basta os do mês atual
 * (listGoalMovementsInMonth), porque só decidem P0.
 */
export function goalPlan(
  goal: Pick<Goal, 'id' | 'savedCents' | 'targetCents' | 'targetMonth' | 'plannedMonthlyCents'>,
  movements: readonly Pick<GoalMovement, 'goalId' | 'kind' | 'occurredOn'>[],
  today: IsoDate,
): GoalPlan {
  const progress = goalProgress(goal.savedCents, goal.targetCents);
  const p0 = firstProjectedMonth(
    movements.filter((m) => m.goalId === goal.id),
    today,
  );
  return {
    savedCents: goal.savedCents,
    targetCents: goal.targetCents,
    progress,
    firstProjectedMonth: p0,
    deadline:
      goal.targetMonth === null
        ? null
        : {
            month: goal.targetMonth,
            months: monthsUntilDeadline(p0, goal.targetMonth),
            monthlyCents: monthlyNeeded(progress.missingCents, p0, goal.targetMonth),
          },
    plannedMonthlyCents: goal.plannedMonthlyCents,
    reachMonth: monthReachedWithPlan(progress.missingCents, goal.plannedMonthlyCents, p0),
  };
}

/** Aba Metas: a reserva não arquivada, as metas ativas e as concluídas e arquivadas (recolhidas). */
export function organizeGoals<G extends Pick<Goal, 'goalType' | 'status' | 'createdAt' | 'updatedAt' | 'id'>>(
  goals: readonly G[],
): { reserve: G | null; active: G[]; closed: G[] } {
  const byCreation = (a: G, b: G) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
  const reserve = goals.find((g) => g.goalType === 'emergencia' && g.status !== 'arquivada') ?? null;
  const active = goals.filter((g) => g.goalType !== 'emergencia' && g.status === 'ativa').sort(byCreation);
  const closed = goals
    .filter((g) => g !== reserve && g.status !== 'ativa')
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
  return { reserve, active, closed };
}

// ---------------------------------------------------------------------------
// Reserva para imprevistos
// ---------------------------------------------------------------------------

const normalizeCategory = (category: string | null) => (category ?? '').trim().toLocaleLowerCase('pt-BR');
const ESSENTIAL_KEYS = ESSENTIAL_CATEGORIES.map((c) => normalizeCategory(c));

/** A categoria conta como gasto essencial (sem diferença de caixa nem espaços nas pontas)? */
export function isEssentialCategory(category: string | null): boolean {
  return ESSENTIAL_KEYS.includes(normalizeCategory(category));
}

/** Contas a pagar de séries anuais (contas do ano): os gastos gerados ao pagá-las ficam fora da média de essenciais. */
export function annualCommitmentIds(commitments: readonly Pick<Commitment, 'id' | 'series'>[]): Set<string> {
  return new Set(commitments.filter((c) => c.series?.kind === 'anual').map((c) => c.id));
}

/** Sugestão de gastos essenciais por mês (D-027(6)); a pessoa sempre pode ajustar. */
export type EssentialEstimate =
  | {
      source: 'media_gastos';
      amountCents: Cents;
      /** Meses usados na média, do mais antigo ao mais recente. */
      months: IsoMonth[];
      /** Soma de cada categoria essencial nos meses usados, na ordem de ESSENTIAL_CATEGORIES (só as com valor). */
      byCategory: { category: string; cents: Cents }[];
      /** Gastos de contas do ano tirados da conta nesses meses. */
      excludedAnnualCents: Cents;
    }
  | { source: 'contas_do_mes'; amountCents: Cents; month: IsoMonth }
  | { source: 'informado'; amountCents: null };

/**
 * Gastos essenciais por mês.
 * - records: listRecords dos 6 meses fechados anteriores ao mês atual (outros meses e recebimentos são ignorados);
 * - currentCommittedCents: renda comprometida do mês atual (summarizeCommitted(...).committedCents), para quando não há
 *   meses com gastos;
 * - annualIds: contas a pagar de contas do ano (annualCommitmentIds); os gastos gerados ao pagá-las não contam;
 * - invoices: as faturas dos gastos de pagamento de fatura de cartão (loadInvoicesOfRecords). Como em "Por categoria"
 *   (categoryBreakdown), o pagamento de uma fatura é dividido pelas categorias dela (recordShares): o que foi comprado no cartão
 *   em Moradia, Mercado, Transporte, Saúde e Educação conta como essencial, e os encargos do cartão não. Sem a fatura na lista,
 *   o gasto fica na categoria dele (nenhuma, no pagamento de fatura).
 * Entre os 6 meses fechados, os até 3 mais recentes com algum gasto anotado (fora os de contas do ano):
 * roundDiv(Σ Pago em Moradia, Mercado, Transporte, Saúde e Educação, quantidade de meses). Média zero ou sem meses:
 * as contas do mês atual; sem elas: digitado.
 */
export function essentialMonthly(
  records: readonly (Pick<FinancialRecord, 'kind' | 'amountCents' | 'occurredOn' | 'category' | 'commitmentId'> & { invoice?: FinancialRecord['invoice'] })[],
  currentMonth: IsoMonth,
  currentCommittedCents: Cents | null = null,
  annualIds: Iterable<string> = [],
  invoices: readonly Pick<Invoice, 'cardId' | 'month' | 'mix'>[] = [],
): EssentialEstimate {
  const annual = new Set(annualIds);
  const closed = new Set(Array.from({ length: ESSENTIAL_LOOKBACK_MONTHS }, (_, i) => addMonths(currentMonth, -(i + 1))));
  const expenses = records.filter((r) => r.kind === 'despesa' && closed.has(monthOf(r.occurredOn)));
  const isAnnual = (r: (typeof expenses)[number]) => r.commitmentId !== null && annual.has(r.commitmentId);
  const counted = expenses.filter((r) => !isAnnual(r));
  const months = [...new Set(counted.map((r) => monthOf(r.occurredOn)))].sort().reverse().slice(0, ESSENTIAL_AVERAGE_MONTHS).sort();
  const used = new Set(months);
  // Cada gasto vira uma ou mais partes (categoria e valor): o pagamento de fatura, uma por categoria da fatura.
  const parts = counted
    .filter((r) => used.has(monthOf(r.occurredOn)))
    .flatMap((r) => {
      const shares = recordShares({ invoice: r.invoice ?? null, amountCents: r.amountCents }, invoices);
      return shares ? shares.map((x) => ({ category: x.charges ? null : x.category, cents: x.cents })) : [{ category: r.category, cents: r.amountCents }];
    });
  const byCategory = ESSENTIAL_CATEGORIES.map((category) => ({
    category,
    cents: parts.filter((x) => normalizeCategory(x.category) === normalizeCategory(category)).reduce((acc, x) => acc + x.cents, 0),
  })).filter((c) => c.cents > 0);
  const total = byCategory.reduce((acc, c) => acc + c.cents, 0);
  const amount = months.length > 0 ? roundDiv(total, months.length) : 0;
  if (amount >= 1) {
    const excludedAnnualCents = expenses.filter((r) => isAnnual(r) && used.has(monthOf(r.occurredOn))).reduce((acc, r) => acc + r.amountCents, 0);
    return { source: 'media_gastos', amountCents: amount, months, byCategory, excludedAnnualCents };
  }
  if (currentCommittedCents !== null && currentCommittedCents >= 1) return { source: 'contas_do_mes', amountCents: currentCommittedCents, month: currentMonth };
  return { source: 'informado', amountCents: null };
}

/** A reserva é a mínima de "Agora não" (origem 'reserva_minima')? */
export function isMinimumReserve(goal: { essentialBaseSource: EssentialBaseSource | null }): boolean {
  return goal.essentialBaseSource === MINIMUM_RESERVE_SOURCE;
}

/**
 * Gastos essenciais por mês guardados na reserva, para pré-preencher o plano de guardar e a própria reserva; null quando
 * não há base ou quando a reserva é a mínima (o valor dela é o alvo escolhido, nunca os gastos essenciais da pessoa).
 */
export function reserveEssentialBaseCents(
  goal: { essentialBaseCents: Cents | null; essentialBaseSource: EssentialBaseSource | null } | null | undefined,
): Cents | null {
  if (!goal || goal.essentialBaseCents === null || goal.essentialBaseSource === null || isMinimumReserve(goal)) return null;
  return goal.essentialBaseCents;
}

/** Alvo da reserva = essenciais × meses; null fora das faixas ou acima de R$ 9.999.999,99 (alvo_acima_do_limite). */
export function emergencyTarget(essentialCents: Cents, months: number): Cents | null {
  if (!Number.isSafeInteger(essentialCents) || essentialCents < 1 || essentialCents > MAX_RECORD_CENTS) return null;
  if (!Number.isSafeInteger(months) || months < RESERVE_MONTHS_MIN || months > RESERVE_MONTHS_MAX) return null;
  const target = essentialCents * months;
  return target > MAX_RECORD_CENTS ? null : target;
}

/** Meses cobertos em décimos: piso(10 × guardado ÷ essenciais). null sem essenciais. */
export function coverageTenths(savedCents: Cents, essentialCents: Cents | null): number | null {
  if (essentialCents === null || essentialCents <= 0) return null;
  return floorDiv(10 * Math.max(0, savedCents), essentialCents);
}

/** "0,9 mês", "1,0 mês", "2,5 meses" (singular abaixo de 2); com algo guardado e zero décimo, "menos de 0,1 mês". */
export function formatCoverage(tenths: number, savedCents: Cents = 0): string {
  if (tenths === 0 && savedCents > 0) return 'menos de 0,1 mês';
  return `${formatInteger(Math.floor(tenths / 10))},${tenths % 10} ${tenths < 20 ? 'mês' : 'meses'}`;
}

/** "Atualizar valor guardado": a diferença vira valorização ou desvalorização; igual, nada. */
export function updateSavedValue(savedCents: Cents, informedCents: Cents): { kind: 'valorizacao' | 'desvalorizacao'; amountCents: Cents } | null {
  const d = informedCents - savedCents;
  if (d === 0) return null;
  return d > 0 ? { kind: 'valorizacao', amountCents: d } : { kind: 'desvalorizacao', amountCents: -d };
}

// ---------------------------------------------------------------------------
// Validação (mesma ordem das funções do banco)
// ---------------------------------------------------------------------------

/** Códigos das funções de metas. */
export type GoalErrorCode =
  | 'sem_permissao'
  | 'nao_encontrado'
  | 'versao_desatualizada'
  | 'chave_reutilizada'
  | 'reserva_ja_existe'
  | 'tipo_invalido'
  | 'nome_da_meta_invalido'
  | 'valor_invalido'
  | 'valor_acima_do_limite'
  | 'meses_invalidos'
  | 'origem_invalida'
  | 'alvo_acima_do_limite'
  | 'alvo_invalido'
  | 'prazo_invalido'
  | 'plano_invalido'
  | 'saldo_inicial_invalido'
  | 'data_invalida'
  | 'data_futura'
  | 'observacao_longa'
  | 'situacao_invalida'
  | 'meta_arquivada'
  | 'saldo_da_meta_insuficiente';

/**
 * Campos da meta, na ordem do banco (clarevo_validate_goal, migração 0007): tipo (tipo_invalido); nome
 * (nome_da_meta_invalido); na reserva, base (valor_invalido), meses (meses_invalidos), origem (origem_invalida), base ×
 * meses acima do limite (alvo_acima_do_limite, conferido antes do produto) e alvo informado diferente do produto
 * (alvo_invalido; nulo é aceito); nos outros tipos, campos da reserva preenchidos (tipo_invalido), alvo (valor_invalido,
 * alvo_acima_do_limite); prazo (prazo_invalido); plano por mês (plano_invalido).
 */
export const GOAL_INPUT_CODE_ORDER = [
  'tipo_invalido',
  'nome_da_meta_invalido',
  'valor_invalido',
  'meses_invalidos',
  'origem_invalida',
  'alvo_acima_do_limite',
  'alvo_invalido',
  'prazo_invalido',
  'plano_invalido',
] as const;

const isInt = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n);
const isAmount = (n: unknown) => isInt(n) && n >= 1;

/**
 * O mês do prazo é válido? Formato sempre; com checkRange (padrão), também do mês de hoje a 600 meses depois. Na edição
 * com o prazo igual ao gravado, checkRange = false (um prazo que já passou continua editável).
 */
export function deadlineError(targetMonth: IsoMonth | null, today: IsoDate, checkRange = true): 'prazo_invalido' | null {
  if (targetMonth === null || targetMonth === undefined) return null;
  if (typeof targetMonth !== 'string' || !isValidIsoMonth(targetMonth)) return 'prazo_invalido';
  if (!checkRange) return null;
  const current = monthOf(today);
  return targetMonth < current || targetMonth > addMonths(current, GOAL_DEADLINE_MAX_MONTHS) ? 'prazo_invalido' : null;
}

/**
 * Primeiro erro dos campos da meta, na ordem do banco. Textos já aparados. checkDeadline: false na edição quando o
 * prazo não mudou (um prazo que já passou continua editável).
 */
export function goalInputError(input: GoalInput, today: IsoDate, opts: { checkDeadline?: boolean } = {}): GoalErrorCode | null {
  if (!GOAL_TYPES.includes(input.goalType)) return 'tipo_invalido';
  const name = typeof input.name === 'string' ? input.name : '';
  if (name.length === 0 || name !== name.trim() || charCount(name) > GOAL_NAME_MAX) return 'nome_da_meta_invalido';
  if (input.goalType === 'emergencia') {
    const base = input.essentialBaseCents;
    if (!isAmount(base)) return 'valor_invalido';
    const months = input.essentialMonths;
    if (!isInt(months) || months < RESERVE_MONTHS_MIN || months > RESERVE_MONTHS_MAX) return 'meses_invalidos';
    if (!ESSENTIAL_BASE_SOURCES.includes(input.essentialBaseSource!)) return 'origem_invalida';
    // Reserva mínima é sempre de 1 mês (a base é o próprio alvo).
    if (input.essentialBaseSource === MINIMUM_RESERVE_SOURCE && months !== 1) return 'meses_invalidos';
    // Conferido antes do produto, como no banco: base × meses <= limite <=> base <= limite div meses.
    if (base! > Math.floor(MAX_RECORD_CENTS / months)) return 'alvo_acima_do_limite';
    if (input.targetCents !== null && input.targetCents !== undefined && input.targetCents !== base! * months) return 'alvo_invalido';
  } else {
    if (input.essentialBaseCents != null || input.essentialMonths != null || input.essentialBaseSource != null) return 'tipo_invalido';
    if (!isAmount(input.targetCents)) return 'valor_invalido';
    if (input.targetCents! > MAX_RECORD_CENTS) return 'alvo_acima_do_limite';
  }
  if (deadlineError(input.targetMonth, today, opts.checkDeadline !== false)) return 'prazo_invalido';
  const planned = input.plannedMonthlyCents;
  if (planned !== null && planned !== undefined && (!isAmount(planned) || planned > MAX_RECORD_CENTS)) return 'plano_invalido';
  return null;
}

/** Alvo gravado: na reserva, base × meses (targetCents nulo ou igual ao produto); nos outros tipos, o informado. */
export function goalTargetOf(input: GoalInput): Cents {
  return input.goalType === 'emergencia' ? input.essentialBaseCents! * input.essentialMonths! : input.targetCents!;
}

/** Saldo inicial de create_goal: nulo ou 0 não cria movimento (a data é ignorada); acima de 0 exige data até hoje. */
export function initialMovementError(initialCents: Cents | null, initialOn: IsoDate | null, today: IsoDate): GoalErrorCode | null {
  if (initialCents === null || initialCents === undefined) return null;
  if (!isInt(initialCents) || initialCents < 0 || initialCents > MAX_RECORD_CENTS) return 'saldo_inicial_invalido';
  if (initialCents === 0) return null;
  if (typeof initialOn !== 'string' || !isValidIsoDate(initialOn)) return 'data_invalida';
  if (initialOn > today) return 'data_futura';
  return null;
}

/**
 * Movimento (add_goal_movement e update_goal_movement), na ordem do banco: tipo ('saldo_inicial' só ao criar a meta ou
 * na edição dele, allowInitial); valor; data; observação (já aparada; vazia = null).
 */
export function goalMovementError(
  kind: GoalMovementKind,
  input: GoalMovementInput,
  today: IsoDate,
  opts: { allowInitial?: boolean } = {},
): GoalErrorCode | null {
  if (!GOAL_MOVEMENT_KINDS.includes(kind) || (kind === 'saldo_inicial' && !opts.allowInitial)) return 'tipo_invalido';
  if (!isAmount(input.amountCents)) return 'valor_invalido';
  if (input.amountCents > MAX_RECORD_CENTS) return 'valor_acima_do_limite';
  if (typeof input.occurredOn !== 'string' || !isValidIsoDate(input.occurredOn)) return 'data_invalida';
  if (input.occurredOn > today) return 'data_futura';
  if (input.note !== null && charCount(input.note) > GOAL_NOTE_MAX) return 'observacao_longa';
  return null;
}

/** Observação aparada; vazia vira null (como clarevo_trim). */
export function normalizeGoalNote(note: string | null | undefined): string | null {
  const t = (note ?? '').trim();
  return t === '' ? null : t;
}

/** Rascunho dos formulários de meta (/meta/nova, editar meta) e da reserva (/reserva). Guarda o texto digitado. */
export interface GoalDraft {
  goalType: GoalType;
  name: string;
  /** Objetivo e oportunidade: "Valor da meta". Ignorado na reserva. */
  targetText: string;
  /** Reserva: gastos essenciais por mês, meses (chip ou "Outro") e origem da base. Ignorados nos outros tipos. */
  essentialBaseText: string;
  essentialMonthsText: string;
  essentialBaseSource: EssentialBaseSource;
  /** "Até quando? (opcional)", MM/AAAA. */
  targetMonthText: string;
  /** "Quanto você já tem guardado ...? (opcional)". Só ao criar; vira o saldo inicial com a data de hoje. */
  initialText: string;
  /** "Quanto pretende guardar por mês? (opcional)". */
  plannedText: string;
}

export type GoalField = 'name' | 'targetText' | 'essentialBaseText' | 'essentialMonthsText' | 'targetMonthText' | 'initialText' | 'plannedText';
export type GoalFieldErrors = Partial<Record<GoalField, string>>;
/** Ordem dos campos na tela: o foco vai para o primeiro erro. */
export const GOAL_FIELD_ORDER: GoalField[] = ['name', 'essentialBaseText', 'essentialMonthsText', 'targetText', 'targetMonthText', 'initialText', 'plannedText'];

/**
 * Formulário de meta com as regras e a ordem do banco. code é o primeiro erro na ordem do banco (o mesmo que
 * create_goal ou update_goal devolveria). mode 'editar': sem saldo inicial e prazo conferido só quando muda
 * (originalTargetMonth). O saldo inicial leva a data de hoje.
 */
export function validateGoalDraft(
  draft: GoalDraft,
  today: IsoDate,
  opts: { mode?: 'criar' | 'editar'; originalTargetMonth?: IsoMonth | null } = {},
): { ok: true; input: NewGoalInput } | { ok: false; errors: GoalFieldErrors; code: GoalErrorCode } {
  const errors: GoalFieldErrors = {};
  let code: GoalErrorCode | null = null;
  const fail = (c: GoalErrorCode, field: GoalField, text: string) => {
    code ??= c;
    errors[field] ??= text;
  };
  const T = GOAL_ERROR_TEXT;
  const editing = opts.mode === 'editar';
  const reserve = draft.goalType === 'emergencia';
  if (!GOAL_TYPES.includes(draft.goalType)) code = 'tipo_invalido';

  const name = draft.name.trim();
  if (name === '' || charCount(name) > GOAL_NAME_MAX) fail('nome_da_meta_invalido', 'name', T.nome_da_meta_invalido);

  let base: Cents | null = null;
  let months: number | null = null;
  let target: Cents | null = null;
  if (reserve) {
    // Ordem do banco: base, meses, origem e só então o limite de base × meses.
    base = parseBRL(draft.essentialBaseText);
    const baseOk = base !== null && base >= 1;
    if (!baseOk) fail('valor_invalido', 'essentialBaseText', T.base_invalida);
    months = /^\s*\d{1,3}\s*$/.test(draft.essentialMonthsText) ? Number(draft.essentialMonthsText.trim()) : null;
    const monthsOk = months !== null && months >= RESERVE_MONTHS_MIN && months <= RESERVE_MONTHS_MAX;
    if (!monthsOk) fail('meses_invalidos', 'essentialMonthsText', T.meses_invalidos);
    if (!ESSENTIAL_BASE_SOURCES.includes(draft.essentialBaseSource)) code ??= 'origem_invalida';
    else if (draft.essentialBaseSource === MINIMUM_RESERVE_SOURCE && monthsOk && months !== 1) fail('meses_invalidos', 'essentialMonthsText', T.meses_invalidos);
    if (baseOk && base! > MAX_RECORD_CENTS) fail('alvo_acima_do_limite', 'essentialBaseText', T.valor_acima_do_limite);
    else if (baseOk && monthsOk) {
      target = emergencyTarget(base!, months!);
      if (target === null) fail('alvo_acima_do_limite', 'essentialMonthsText', T.alvo_acima_do_limite);
    }
  } else {
    target = parseBRL(draft.targetText);
    if (target === null || target < 1) fail('valor_invalido', 'targetText', T.alvo_vazio);
    else if (target > MAX_RECORD_CENTS) fail('alvo_acima_do_limite', 'targetText', T.alvo_acima_do_limite);
  }

  let targetMonth: IsoMonth | null = null;
  if (draft.targetMonthText.trim() !== '') {
    targetMonth = parseMonthBR(draft.targetMonthText);
    if (targetMonth === null) fail('prazo_invalido', 'targetMonthText', T.prazo_formato);
    else if (deadlineError(targetMonth, today, !(editing && targetMonth === (opts.originalTargetMonth ?? null)))) {
      fail('prazo_invalido', 'targetMonthText', T.prazo_invalido);
    }
  }

  const optionalAmount = (text: string, field: GoalField, c: GoalErrorCode, zeroOk: boolean, invalidText: string): Cents | null => {
    if (text.trim() === '') return null;
    const v = parseBRL(text);
    if (v === null || v < 0 || (v === 0 && !zeroOk)) fail(c, field, invalidText);
    else if (v > MAX_RECORD_CENTS) fail(c, field, T.valor_acima_do_limite);
    return v;
  };
  const planned = optionalAmount(draft.plannedText, 'plannedText', 'plano_invalido', false, T.plano_invalido);
  const initial = editing ? null : optionalAmount(draft.initialText, 'initialText', 'saldo_inicial_invalido', true, T.saldo_inicial_invalido);

  if (code !== null) return { ok: false, errors, code };
  const initialCents = initial !== null && initial > 0 ? initial : null;
  return {
    ok: true,
    input: {
      goalType: draft.goalType,
      name,
      targetCents: target,
      targetMonth,
      plannedMonthlyCents: planned,
      essentialBaseCents: reserve ? base : null,
      essentialMonths: reserve ? months : null,
      essentialBaseSource: reserve ? draft.essentialBaseSource : null,
      initialCents,
      initialOn: initialCents === null ? null : today,
    },
  };
}

/** Rascunho de aporte, resgate, rendimento recebido (e da edição de qualquer movimento). */
export interface GoalMovementDraft {
  kind: GoalMovementKind;
  amountText: string;
  /** DD/MM/AAAA ("Hoje" e "Ontem" preenchem). */
  dateText: string;
  note: string;
}

export type GoalMovementField = 'amountText' | 'dateText' | 'note';
export const GOAL_MOVEMENT_FIELD_ORDER: GoalMovementField[] = ['amountText', 'dateText', 'note'];

/** Formulário de movimento, na ordem do banco. editing: permite editar o já guardado ao criar. */
export function validateGoalMovementDraft(
  draft: GoalMovementDraft,
  today: IsoDate,
  opts: { editing?: boolean } = {},
): { ok: true; kind: GoalMovementKind; input: GoalMovementInput } | { ok: false; errors: Partial<Record<GoalMovementField, string>>; code: GoalErrorCode } {
  const errors: Partial<Record<GoalMovementField, string>> = {};
  let code: GoalErrorCode | null = null;
  const fail = (c: GoalErrorCode, field: GoalMovementField | null, text: string) => {
    code ??= c;
    if (field) errors[field] ??= text;
  };
  if (!GOAL_MOVEMENT_KINDS.includes(draft.kind) || (draft.kind === 'saldo_inicial' && !opts.editing)) fail('tipo_invalido', null, ERROR_TEXT.salvar_falhou);
  const amount = parseBRL(draft.amountText);
  if (amount === null || amount < 1) fail('valor_invalido', 'amountText', GOAL_ERROR_TEXT.valor_invalido);
  else if (amount > MAX_RECORD_CENTS) fail('valor_acima_do_limite', 'amountText', GOAL_ERROR_TEXT.valor_acima_do_limite);
  const occurredOn = parseDateBR(draft.dateText);
  if (occurredOn === null) fail('data_invalida', 'dateText', GOAL_ERROR_TEXT.data_invalida);
  else if (occurredOn > today) fail('data_futura', 'dateText', futureDateText(draft.kind));
  const note = normalizeGoalNote(draft.note);
  if (note !== null && charCount(note) > GOAL_NOTE_MAX) fail('observacao_longa', 'note', GOAL_ERROR_TEXT.observacao_longa);
  if (code !== null) return { ok: false, errors, code };
  return { ok: true, kind: draft.kind, input: { amountCents: amount!, occurredOn: occurredOn!, note } };
}

/** "Atualizar valor guardado": aceita 0 (nada mais guardado); igual ao guardado não registra nada (change null). */
export function validateSavedValueDraft(
  text: string,
  savedCents: Cents,
): { ok: true; informedCents: Cents; change: { kind: 'valorizacao' | 'desvalorizacao'; amountCents: Cents } | null } | { ok: false; error: string; code: GoalErrorCode } {
  const v = parseBRL(text);
  if (v === null) return { ok: false, error: GOAL_ERROR_TEXT.valor_atual_invalido, code: 'valor_invalido' };
  if (v > MAX_RECORD_CENTS) return { ok: false, error: GOAL_ERROR_TEXT.valor_acima_do_limite, code: 'valor_acima_do_limite' };
  const change = updateSavedValue(savedCents, v);
  if (change && change.amountCents > MAX_RECORD_CENTS) return { ok: false, error: GOAL_ERROR_TEXT.valor_acima_do_limite, code: 'valor_acima_do_limite' };
  return { ok: true, informedCents: v, change };
}

/** Primeiro dia negativo no detalhe do erro do banco (AAAA-MM-DD em qualquer posição) ou null. */
export function negativeDayFromDetail(detail: string | null | undefined): IsoDate | null {
  const m = /(\d{4}-\d{2}-\d{2})/.exec(detail ?? '');
  return m && isValidIsoDate(m[1]!) ? m[1]! : null;
}

// ---------------------------------------------------------------------------
// Textos (spec2 §4.6, com os ajustes da spec3 e das notas do Ciclo C)
// ---------------------------------------------------------------------------

/** Referência da reserva com fonte e data (D-027(6) ajustada: faixas da CVM, referência e não regra). */
export const GOAL_RESERVE_REFERENCE = {
  text: 'O Portal do Investidor, da CVM, fala em 6 a 12 meses de gastos, conforme o tipo de renda, e cita 1, 3 ou 6 meses como exemplo de meta para começar. A escolha é sua.',
  sourceText:
    'Fonte: CVM, Portal do Investidor, páginas "Emergências e aposentadoria" e "Planejamento e gestão de reservas financeiras", consultadas em 09/10/2026.',
  sources: [
    {
      publisher: 'CVM, Portal do Investidor',
      title: 'Emergências e aposentadoria',
      url: 'https://www.gov.br/investidor/pt-br/investir/antes-de-investir/defina-seus-objetivos/emergencias-e-aposentadoria',
      consultedOn: '2026-10-09',
    },
    {
      publisher: 'CVM, Portal do Investidor',
      title: 'Planejamento e gestão de reservas financeiras',
      url: 'https://www.gov.br/investidor/pt-br/penso-logo-invisto/planejamento-e-gestao-de-reservas-financeiras',
      consultedOn: '2026-10-09',
    },
  ],
} as const;

export const GOAL_TYPE_LABEL: Readonly<Record<GoalType, string>> = {
  emergencia: 'Reserva para imprevistos',
  oportunidade: 'Reserva de oportunidade',
  objetivo: 'Objetivo',
};

export const GOAL_STATUS_LABEL: Readonly<Record<GoalStatus, string>> = {
  ativa: 'Ativa',
  concluida: 'Concluída',
  arquivada: 'Arquivada',
};

export const MOVEMENT_LABEL: Readonly<Record<GoalMovementKind, string>> = {
  saldo_inicial: 'Já guardado ao criar a meta',
  aporte: 'Aporte',
  resgate: 'Resgate',
  rendimento: 'Rendimento recebido',
  valorizacao: 'Valorização',
  desvalorizacao: 'Desvalorização',
};

/** Mensagens das funções de metas e dos formulários. */
export const GOAL_ERROR_TEXT = {
  ...ERROR_TEXT,
  valor_invalido: 'Informe um valor maior que zero, como 500,00.',
  valor_acima_do_limite: 'O valor passa do limite de R$ 9.999.999,99.',
  data_futura: 'Use uma data até hoje. Registre o movimento depois que ele acontecer.',
  observacao_longa: 'Use no máximo 80 caracteres.',
  versao_desatualizada: 'Esta meta foi alterada em outro aparelho. Confira a versão atual antes de salvar.',
  // Sem "disponível" nos textos de metas (para não confundir com saldo).
  nao_encontrado: 'Esta meta ou este movimento foi excluído. Confira a lista atual.',
  reserva_ja_existe: 'Você já tem uma reserva para imprevistos. Abra a reserva para alterar o valor.',
  nome_da_meta_invalido: 'Dê um nome de 1 a 40 caracteres.',
  alvo_acima_do_limite: 'O valor passa do limite de R$ 9.999.999,99.',
  prazo_invalido: 'Escolha um mês a partir deste.',
  prazo_formato: 'Use mês e ano, como 07/2027.',
  meses_invalidos: 'Escolha de 1 a 24 meses.',
  meta_arquivada: 'Esta meta está arquivada. Reative para registrar movimentos.',
  saldo_da_meta_insuficiente: 'Com esta mudança, o valor guardado ficaria negativo. Confira o valor e a data.',
  plano_invalido: 'Informe um valor por mês maior que zero, ou deixe em branco.',
  saldo_inicial_invalido: 'Confira o valor já guardado, como 1.200,00, ou deixe em branco.',
  /** Só no formulário: "Valor da meta" vazio ou zero (o banco devolve valor_invalido). */
  alvo_vazio: 'Informe o valor da meta, como 6.000,00.',
  base_invalida: 'Informe quanto você gasta por mês com o essencial, como 3.750,00.',
  valor_atual_invalido: 'Informe quanto há guardado hoje, como 4.037,20.',
  // Internos (o app nunca provoca): texto genérico de falha.
  tipo_invalido: ERROR_TEXT.salvar_falhou,
  origem_invalida: ERROR_TEXT.salvar_falhou,
  alvo_invalido: ERROR_TEXT.salvar_falhou,
  situacao_invalida: ERROR_TEXT.salvar_falhou,
} as const;

/** data_futura do formulário de movimento: o aporte tem texto próprio. */
function futureDateText(kind: GoalMovementKind): string {
  return kind === 'aporte' ? GOALS_TEXT.movement.aporte.futureDate : GOAL_ERROR_TEXT.data_futura;
}

/**
 * Texto de um código das funções de metas. saldo_da_meta_insuficiente com o dia (RepoError.detail ou firstNegativeDay):
 * "Com este resgate, o valor guardado ficaria negativo em 02/10/2026. Confira o valor e a data." (outros tipos e
 * exclusões: "Com esta mudança, ..."). Código desconhecido: falha genérica.
 */
export function goalErrorText(code: string, opts: { kind?: GoalMovementKind; negativeDay?: IsoDate | null } = {}): string {
  if (code === 'saldo_da_meta_insuficiente') {
    if (!opts.negativeDay) return GOAL_ERROR_TEXT.saldo_da_meta_insuficiente;
    return GOALS_TEXT.negativeOn(opts.negativeDay, opts.kind === 'resgate');
  }
  if (code === 'data_futura' && opts.kind) return futureDateText(opts.kind);
  const texts: Record<string, string> = GOAL_ERROR_TEXT;
  return code in texts ? texts[code]! : ERROR_TEXT.salvar_falhou;
}

/** "15%" */
const pct = (percent: number) => `${formatInteger(percent)}%`;

/** Sinal do movimento no histórico: "+" ou "−" (o já guardado ao criar aparece sem sinal). */
function signOf(kind: GoalMovementKind): string {
  if (kind === 'saldo_inicial') return '';
  return MOVEMENT_SIGN[kind] > 0 ? '+ ' : '− ';
}

/** Textos fixos e montados da aba Metas, da reserva, das metas, dos movimentos e do aviso no formulário de gasto. */
export const GOALS_TEXT = {
  tabTitle: 'Metas',

  // Seu mês (com a renda comprometida).
  monthTitle: 'Seu mês',
  /** "Fora dos compromissos em outubro: R$ 2.850,00" */
  monthOutside: (month: IsoMonth, cents: Cents) => `Fora dos compromissos em ${formatMonthName(month)}: ${formatBRL(cents)}`,
  /** "52,5% da renda de referência já tem destino." */
  monthCommitted: (percentText: string) => `${percentText} da renda de referência já tem destino.`,
  /** "Guardado em outubro: R$ 500,00" */
  monthSaved: (month: IsoMonth, cents: Cents) => `Guardado em ${formatMonthName(month)}: ${formatBRL(cents)}`,
  /** "Em outubro, os resgates passaram os aportes em R$ 200,00." */
  monthWithdrawn: (month: IsoMonth, cents: Cents) => `Em ${formatMonthName(month)}, os resgates passaram os aportes em ${formatBRL(cents)}.`,
  seeCommitted: 'Ver renda comprometida',

  // Card da reserva para imprevistos.
  reserveTitle: RESERVE_NAME,
  reserveEmpty: 'Cobre imprevistos sem recorrer a crédito. O valor sai dos seus gastos essenciais.',
  reserveCalculate: 'Calcular minha reserva',
  /** "R$ 3.500,00 de R$ 22.500,00" */
  savedOfTarget: (savedCents: Cents, targetCents: Cents) => `${formatBRL(savedCents)} de ${formatBRL(targetCents)}`,
  /** "15%" */
  percent: pct,
  /** "Cobre 0,9 mês dos seus gastos essenciais" */
  coverage: (tenths: number, savedCents: Cents) => `Cobre ${formatCoverage(tenths, savedCents)} dos seus gastos essenciais`,
  /** "Planejado: R$ 500,00 por mês" */
  plannedShort: (cents: Cents) => `Planejado: ${formatBRL(cents)} por mês`,
  addDeposit: 'Registrar aporte',
  seeDetails: 'Ver detalhes',
  /** Barra: "Reserva para imprevistos: 15% da meta, R$ 3.500,00 de R$ 22.500,00." */
  progressA11y: (name: string, percent: number, savedCents: Cents, targetCents: Cents) =>
    `${name}: ${pct(percent)} da meta, ${formatBRL(savedCents)} de ${formatBRL(targetCents)}.`,

  // Suas metas.
  goalsTitle: 'Suas metas',
  newGoal: 'Nova meta',
  emptyTitle: 'Nenhuma meta ainda',
  emptyBody: 'Viagem, curso, troca do carro ou entrada de um imóvel. Uma meta mostra só o que você registrou como guardado.',
  /** "Até julho de 2027 · R$ 480,00 por mês para chegar lá" */
  cardDeadline: (month: IsoMonth, monthlyCents: Cents) => `Até ${formatMonthYearBR(month)} · ${formatBRL(monthlyCents)} por mês para chegar lá`,
  /** "Prazo: setembro de 2026" (o prazo chegou) */
  cardDeadlinePassed: (month: IsoMonth) => `Prazo: ${formatMonthYearBR(month)}`,
  /** "Planejado: R$ 500,00 por mês · chega lá em dezembro de 2029" */
  cardPlanned: (cents: Cents, month: IsoMonth) => `Planejado: ${formatBRL(cents)} por mês · chega lá em ${formatMonthYearBR(month)}`,
  reachedBadge: 'Meta alcançada',
  closedTitle: 'Concluídas e arquivadas',

  // Simular e Aprender.
  simulateTitle: 'Simular um plano',
  simulateBody: 'Quanto guardar por mês, em quanto tempo e quanto você pode ter, com hipóteses suas.',
  learnReserves: 'Reserva para imprevistos e reserva de oportunidade',
  learnDeposit: 'O que muda ao registrar um aporte',
  calculators: 'Calculadoras',
  whoSees: 'Quem vê estes dados?',
  /** Acréscimo em "Quem vê estes dados?" (Ciclos A a D). */
  whoSeesGoals:
    'Gastos fixos, renda de referência, renda comprometida, metas e simulações também são só seus. A empresa que oferece o benefício não vê nada disso, nem em números somados aos de outras pessoas.',
  footer: 'O Clarevo não guarda nem movimenta dinheiro. Os valores mostram só o que você registrou.',

  // Calculadora da reserva (/reserva).
  reserve: {
    title: RESERVE_NAME,
    essentialsTitle: 'Seus gastos essenciais por mês',
    /** "Média de setembro de 2026 em Moradia e Mercado. Lazer e gastos sem categoria não entram." */
    essentialsAverage: (months: readonly IsoMonth[], categories: readonly string[]) =>
      `Média de ${monthsListText(months)} em ${listText(categories)}. Lazer e gastos sem categoria não entram.`,
    essentialsAnnualOut: 'Pagamentos de contas do ano, como IPVA e IPTU, também não entram.',
    /** "Começamos pelas contas de outubro: R$ 3.150,00. Some o que costuma gastar com mercado, transporte e saúde." */
    essentialsBills: (month: IsoMonth, cents: Cents) =>
      `Começamos pelas contas de ${formatMonthName(month)}: ${formatBRL(cents)}. Some o que costuma gastar com mercado, transporte e saúde.`,
    essentialsNone: 'Informe quanto você gasta por mês com moradia, mercado, transporte, saúde e educação.',
    essentialsLabel: 'Gastos essenciais por mês',
    adjust: 'Ajustar valor',
    monthsQuestion: 'Quantos meses você quer cobrir?',
    /** "1 mês", "6 meses" */
    monthChip: (n: number) => (n === 1 ? '1 mês' : `${formatInteger(n)} meses`),
    otherMonths: 'Outro',
    otherMonthsLabel: 'Quantos meses (1 a 24)',
    monthsReference: GOAL_RESERVE_REFERENCE.text,
    monthsReferenceSource: GOAL_RESERVE_REFERENCE.sourceText,
    /** "Valor da reserva: R$ 22.500,00 (6 × R$ 3.750,00)" */
    result: (targetCents: Cents, months: number, essentialCents: Cents) =>
      `Valor da reserva: ${formatBRL(targetCents)} (${formatInteger(months)} × ${formatBRL(essentialCents)})`,
    savedQuestion: 'Quanto você já tem guardado para imprevistos? (opcional)',
    plannedQuestion: 'Quanto pretende guardar por mês? (opcional)',
    deadlineQuestion: 'Até quando? (opcional)',
    noteEmergency: 'A reserva para imprevistos é para emergências. Para aproveitar oportunidades, crie uma meta separada.',
    noteNoProducts: 'O Clarevo não guarda nem aplica dinheiro e não indica produtos, bancos ou aplicações.',
    create: 'Criar reserva',
    save: 'Salvar reserva',
    created: 'Reserva criada.',
    saved: 'Reserva salva.',
  },

  /** "Com R$ 500,00 por mês, chega lá em dezembro de 2029, sem contar rendimentos." */
  previewPlanned: (plannedCents: Cents, month: IsoMonth) =>
    `Com ${formatBRL(plannedCents)} por mês, chega lá em ${formatMonthYearBR(month)}, sem contar rendimentos.`,
  /** "Para chegar até julho de 2027: R$ 480,00 por mês, sem contar rendimentos." */
  previewDeadline: (month: IsoMonth, monthlyCents: Cents) =>
    `Para chegar até ${formatMonthYearBR(month)}: ${formatBRL(monthlyCents)} por mês, sem contar rendimentos.`,
  previewReached: 'Com o que você já tem guardado, a meta já está alcançada.',

  // Nova meta (/meta/nova) e editar meta.
  form: {
    newTitle: 'Nova meta',
    editTitle: 'Editar meta',
    typeObjective: GOAL_TYPE_LABEL.objetivo,
    typeOpportunity: GOAL_TYPE_LABEL.oportunidade,
    opportunityHint: 'Para aproveitar oportunidades, separada da reserva para imprevistos.',
    nameLabel: 'Nome da meta',
    nameHint: 'Use um nome curto, como Viagem ou Curso. Evite detalhes de saúde, religião ou de outras pessoas.',
    targetLabel: 'Valor da meta',
    deadlineLabel: 'Até quando? (opcional)',
    initialLabel: 'Quanto você já tem guardado para isso? (opcional)',
    plannedLabel: 'Quanto pretende guardar por mês? (opcional)',
    create: 'Criar meta',
    save: 'Salvar meta',
    created: 'Meta criada.',
    saved: 'Meta salva.',
  },

  // Detalhe (/meta/[id]).
  detail: {
    /** "de R$ 22.500,00 · 20%" */
    ofTarget: (targetCents: Cents, percent: number) => `de ${formatBRL(targetCents)} · ${pct(percent)}`,
    /** "Faltam R$ 18.000,00" */
    missing: (cents: Cents) => `Faltam ${formatBRL(cents)}`,
    /** "Até dezembro de 2027: R$ 1.285,72 por mês, sem contar rendimentos." */
    deadline: (month: IsoMonth, monthlyCents: Cents) => `Até ${formatMonthYearBR(month)}: ${formatBRL(monthlyCents)} por mês, sem contar rendimentos.`,
    /** "O prazo de setembro de 2026 chegou. Para ver quanto guardar por mês, escolha um novo prazo em Editar meta." */
    deadlinePassed: (month: IsoMonth) =>
      `O prazo de ${formatMonthYearBR(month)} chegou. Para ver quanto guardar por mês, escolha um novo prazo em Editar meta.`,
    /** "Você planejou guardar R$ 1.000,00 por mês. Nesse ritmo, chega lá em abril de 2028." */
    planned: (plannedCents: Cents, month: IsoMonth) =>
      `Você planejou guardar ${formatBRL(plannedCents)} por mês. Nesse ritmo, chega lá em ${formatMonthYearBR(month)}.`,
    simulate: 'Simular com rendimento',
    compositionInitial: (cents: Cents) => `Já guardado ao criar: ${formatBRL(cents)}`,
    compositionDeposits: (cents: Cents) => `Aportes: ${formatBRL(cents)}`,
    compositionWithdrawals: (cents: Cents) => `Resgates: ${formatBRL(cents)}`,
    compositionIncome: (cents: Cents) => `Rendimentos e valorizações: ${formatBRL(cents)}`,
    compositionDepreciation: (cents: Cents) => `Desvalorizações: ${formatBRL(cents)}`,
    rule: 'Aportes e resgates não entram em Pago nem em Recebido: o dinheiro continua seu, só mudou de lugar.',
    addDeposit: 'Registrar aporte',
    addWithdrawal: 'Registrar resgate',
    updateSaved: 'Atualizar valor guardado',
    addIncome: 'Registrar rendimento recebido',
    edit: 'Editar meta',
    archive: 'Arquivar',
    reactivate: 'Reativar',
    delete: 'Excluir meta',
    conclude: 'Concluir meta',
    reachedBadge: 'Meta alcançada',
    reachedBody: 'Você pode concluir ou continuar guardando.',
    historyTitle: 'Movimentos',
    historyEmpty: 'Nenhum movimento registrado.',
    /** "Excluir Viagem de férias?" */
    deleteTitle: (name: string) => `Excluir ${name}?`,
    deleteBody: 'Os movimentos registrados nela também deixam de aparecer.',
    deleteConfirm: 'Excluir meta',
    cancel: 'Cancelar',
    concluded: 'Meta concluída.',
    archived: 'Meta arquivada.',
    reactivated: 'Meta reativada.',
    deleted: 'Meta excluída.',
  },

  // Movimentos (/meta/[id]/movimento).
  movement: {
    aporte: {
      title: 'Registrar aporte',
      help: 'Registre o dinheiro que você já separou. Intenção de guardar não conta como aporte. Guardar não é gasto: não anote este valor em Anotar gasto.',
      futureDate: 'Use uma data até hoje. Registre o aporte depois de guardar.',
      saved: 'Aporte registrado.',
    },
    resgate: {
      title: 'Registrar resgate',
      help: 'Resgate não é renda: ele diminui o valor guardado e não entra em Recebido. Se usou o dinheiro, anote o gasto normalmente.',
      saved: 'Resgate registrado.',
    },
    rendimento: {
      title: 'Registrar rendimento recebido',
      help: 'Informe o rendimento que apareceu no seu extrato. O Clarevo não estima rendimentos.',
      saved: 'Rendimento registrado.',
    },
    valorizacao: { saved: 'Valorização registrada.' },
    desvalorizacao: { saved: 'Desvalorização registrada.' },
    amountLabel: 'Valor',
    dateLabel: 'Data',
    today: 'Hoje',
    yesterday: 'Ontem',
    noteLabel: 'Observação (opcional)',
    save: 'Salvar',
    /** "Editar aporte", "Editar já guardado ao criar a meta" */
    editTitle: (kind: GoalMovementKind) => `Editar ${MOVEMENT_LABEL[kind].charAt(0).toLowerCase()}${MOVEMENT_LABEL[kind].slice(1)}`,
    deleteTitle: 'Excluir este movimento?',
    deleteBody: 'O valor guardado da meta é calculado de novo, sem ele.',
    deleteConfirm: 'Excluir movimento',
    updated: 'Movimento alterado.',
    deleted: 'Movimento excluído.',
  },

  // Atualizar valor guardado.
  update: {
    title: 'Atualizar valor guardado',
    question: 'Quanto há guardado hoje para esta meta, segundo o seu banco ou aplicação?',
    /** "Diferença: + R$ 37,20, registrada como valorização." */
    preview: (kind: 'valorizacao' | 'desvalorizacao', cents: Cents) =>
      kind === 'valorizacao'
        ? `Diferença: + ${formatBRL(cents)}, registrada como valorização.`
        : `Diferença: − ${formatBRL(cents)}, registrada como desvalorização.`,
    /** "Registrar valorização de R$ 37,20" */
    button: (kind: 'valorizacao' | 'desvalorizacao', cents: Cents) =>
      `Registrar ${kind === 'valorizacao' ? 'valorização' : 'desvalorização'} de ${formatBRL(cents)}`,
    same: 'É o mesmo valor guardado. Nada muda.',
  },

  /** "Com este resgate, o valor guardado ficaria negativo em 02/10/2026. Confira o valor e a data." */
  negativeOn: (day: IsoDate, withdrawal: boolean) =>
    `Com ${withdrawal ? 'este resgate' : 'esta mudança'}, o valor guardado ficaria negativo em ${formatDateBR(day)}. Confira o valor e a data.`,

  // Formulário de gasto: descrição que parece dinheiro guardado (SAVINGS_HINT).
  savingsHint: 'Dinheiro guardado não é gasto. Se você separou este valor para uma meta, registre como aporte.',
  savingsHintLink: 'Ir para Metas',
} as const;

/** "a", "a e b", "a, b e c". */
function listText(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} e ${items[items.length - 1]}`;
}

/** "setembro de 2026", "julho, agosto e setembro de 2026" ou "dezembro de 2026 e janeiro de 2027". */
function monthsListText(months: readonly IsoMonth[]): string {
  const years = new Set(months.map((m) => m.slice(0, 4)));
  if (years.size === 1) return `${listText(months.map((m) => formatMonthName(m)))} de ${months[0]!.slice(0, 4)}`;
  return listText(months.map((m) => formatMonthYearBR(m)));
}

/** Linha do histórico de movimentos. */
export interface GoalMovementLine {
  /** "06/10" */
  date: string;
  label: string;
  /** "+ R$ 1.500,00", "− R$ 500,00" ou, no já guardado ao criar, "R$ 3.000,00" */
  amount: string;
  /** "06/10 · Aporte · + R$ 1.500,00" */
  text: string;
  /** "Aporte de R$ 1.500,00 em 06/10/2026." */
  a11yLabel: string;
}

export function movementLine(m: Pick<GoalMovement, 'kind' | 'amountCents' | 'occurredOn'>): GoalMovementLine {
  const date = formatDayMonth(m.occurredOn);
  const label = MOVEMENT_LABEL[m.kind];
  const amount = `${signOf(m.kind)}${formatBRL(m.amountCents)}`;
  return {
    date,
    label,
    amount,
    text: `${date} · ${label} · ${amount}`,
    a11yLabel:
      m.kind === 'saldo_inicial'
        ? `${label}: ${formatBRL(m.amountCents)} em ${formatDateBR(m.occurredOn)}.`
        : `${label} de ${formatBRL(m.amountCents)} em ${formatDateBR(m.occurredOn)}.`,
  };
}

/** Histórico por mês, do mais recente ao mais antigo ("Outubro de 2026"). */
export function movementsByMonth<M extends Pick<GoalMovement, 'kind' | 'amountCents' | 'occurredOn' | 'createdAt' | 'id'>>(
  movements: readonly M[],
): { month: IsoMonth; title: string; items: M[] }[] {
  const sorted = [...movements].sort(
    (a, b) => b.occurredOn.localeCompare(a.occurredOn) || b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id),
  );
  const groups: { month: IsoMonth; title: string; items: M[] }[] = [];
  for (const m of sorted) {
    const month = monthOf(m.occurredOn);
    const last = groups[groups.length - 1];
    if (last && last.month === month) last.items.push(m);
    else groups.push({ month, title: formatMonthBR(month), items: [m] });
  }
  return groups;
}

/** Texto do card de uma meta na aba (prazo, plano, alcançada) ou null. */
export function goalCardCaption(plan: GoalPlan): string | null {
  if (plan.progress.reached) return GOALS_TEXT.reachedBadge;
  if (plan.deadline) {
    return plan.deadline.monthlyCents === null
      ? GOALS_TEXT.cardDeadlinePassed(plan.deadline.month)
      : GOALS_TEXT.cardDeadline(plan.deadline.month, plan.deadline.monthlyCents);
  }
  if (plan.plannedMonthlyCents !== null && plan.reachMonth !== null) return GOALS_TEXT.cardPlanned(plan.plannedMonthlyCents, plan.reachMonth);
  return null;
}

/** Textos do card da reserva na aba Metas. */
export interface ReserveCardTexts {
  amounts: string;
  percent: string;
  coverage: string | null;
  planned: string | null;
  a11yLabel: string;
}

export function reserveCardTexts(goal: Goal): ReserveCardTexts {
  const p = goalProgress(goal.savedCents, goal.targetCents);
  const tenths = coverageTenths(goal.savedCents, goal.essentialBaseCents);
  return {
    amounts: GOALS_TEXT.savedOfTarget(goal.savedCents, goal.targetCents),
    percent: GOALS_TEXT.percent(p.percent),
    coverage: tenths === null ? null : GOALS_TEXT.coverage(tenths, goal.savedCents),
    planned: goal.plannedMonthlyCents === null ? null : GOALS_TEXT.plannedShort(goal.plannedMonthlyCents),
    a11yLabel: GOALS_TEXT.progressA11y(goal.name, p.percent, goal.savedCents, goal.targetCents),
  };
}

/** Textos do detalhe de uma meta (plano, composição, alcançada). movements: todos os da meta (listGoalMovements). */
export interface GoalDetailTexts {
  saved: string;
  ofTarget: string;
  missing: string | null;
  deadline: string | null;
  planned: string | null;
  composition: string[];
  reached: { badge: string; body: string } | null;
  coverage: string | null;
}

export function goalDetailTexts(goal: Goal, movements: readonly GoalMovement[], today: IsoDate): GoalDetailTexts {
  const plan = goalPlan(goal, movements, today);
  const D = GOALS_TEXT.detail;
  const c = goalComposition(movements);
  const tenths = goal.goalType === 'emergencia' ? coverageTenths(goal.savedCents, goal.essentialBaseCents) : null;
  return {
    saved: formatBRL(goal.savedCents),
    ofTarget: D.ofTarget(goal.targetCents, plan.progress.percent),
    missing: plan.progress.missingCents > 0 ? D.missing(plan.progress.missingCents) : null,
    deadline:
      plan.deadline === null || plan.progress.reached
        ? null
        : plan.deadline.monthlyCents === null
          ? D.deadlinePassed(plan.deadline.month)
          : D.deadline(plan.deadline.month, plan.deadline.monthlyCents),
    planned: plan.plannedMonthlyCents !== null && plan.reachMonth !== null ? D.planned(plan.plannedMonthlyCents, plan.reachMonth) : null,
    composition: [
      D.compositionInitial(c.initialCents),
      D.compositionDeposits(c.depositsCents),
      D.compositionWithdrawals(c.withdrawalsCents),
      D.compositionIncome(c.incomeCents + c.appreciationCents),
      ...(c.depreciationCents > 0 ? [D.compositionDepreciation(c.depreciationCents)] : []),
    ],
    reached: plan.progress.reached ? { badge: D.reachedBadge, body: D.reachedBody } : null,
    coverage: tenths === null ? null : GOALS_TEXT.coverage(tenths, goal.savedCents),
  };
}

/**
 * Prévia dos formulários (nova meta e reserva): com prazo, o valor por mês; com plano, o mês previsto. Uma meta nova
 * ainda não tem aporte, então P0 = mês atual; na edição, passe os movimentos da meta.
 */
export function goalPreview(
  draft: { targetCents: Cents; savedCents: Cents; targetMonth: IsoMonth | null; plannedMonthlyCents: Cents | null },
  today: IsoDate,
  movements: readonly Pick<GoalMovement, 'kind' | 'occurredOn'>[] = [],
): string | null {
  const p = goalProgress(draft.savedCents, draft.targetCents);
  if (p.reached) return GOALS_TEXT.previewReached;
  const p0 = firstProjectedMonth(movements, today);
  if (draft.targetMonth !== null) {
    const monthly = monthlyNeeded(p.missingCents, p0, draft.targetMonth);
    return monthly === null ? null : GOALS_TEXT.previewDeadline(draft.targetMonth, monthly);
  }
  const reach = monthReachedWithPlan(p.missingCents, draft.plannedMonthlyCents, p0);
  return reach === null ? null : GOALS_TEXT.previewPlanned(draft.plannedMonthlyCents!, reach);
}

/** Texto de origem dos gastos essenciais na tela /reserva. */
export function essentialEstimateText(e: EssentialEstimate): string {
  const R = GOALS_TEXT.reserve;
  if (e.source === 'media_gastos') {
    const base = R.essentialsAverage(
      e.months,
      e.byCategory.map((c) => c.category),
    );
    return e.excludedAnnualCents > 0 ? `${base} ${R.essentialsAnnualOut}` : base;
  }
  if (e.source === 'contas_do_mes') return R.essentialsBills(e.month, e.amountCents);
  return R.essentialsNone;
}

/** "Seu mês" na aba Metas: fora dos compromissos e percentual (com referência) e o guardado no mês. */
export interface GoalsMonthTexts {
  outside: string | null;
  committed: string | null;
  saved: string;
}

export function goalsMonthTexts(summary: CommittedSummary | null, savedInMonthCents: Cents, month: IsoMonth): GoalsMonthTexts {
  const withRef = summary !== null && summary.referenceCents !== null && summary.committedPermille !== null;
  return {
    outside: !withRef
      ? null
      : summary.outsideCents !== null && summary.outsideCents >= 0
        ? GOALS_TEXT.monthOutside(month, summary.outsideCents)
        : COMMITTED_TEXT.overReference(summary.committedCents - summary.referenceCents!),
    committed: withRef ? GOALS_TEXT.monthCommitted(formatPermille(summary.committedPermille!, summary.committedCents)) : null,
    saved: savedInMonthCents >= 0 ? GOALS_TEXT.monthSaved(month, savedInMonthCents) : GOALS_TEXT.monthWithdrawn(month, -savedInMonthCents),
  };
}
