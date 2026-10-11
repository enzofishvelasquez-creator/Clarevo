import type { IsoDate } from './dates';
import { addDays, addMonthsToDate, formatDateBR, todayIn } from './dates';
import type { Cents } from './money';
import { formatBRL } from './money';
import type { CommitmentSeries } from './records';
import { currentTerm, seriesEnded } from './series';
import { ERROR_TEXT } from './validation';

/**
 * Assinaturas (D-046, Ciclo H2; ordem de Enzo em 10/10/2026, "sim"). Assinatura é um gasto fixo mensal que a pessoa marca como
 * tal (streaming, aplicativo, academia, clube, plano de celular). O Clarevo soma o que as assinaturas custam por mês e por ano e
 * lembra, dentro do app e sem notificação, de olhar cada uma de tempos em tempos. Regras puras, repetidas no banco pelas
 * funções set_series_subscription e mark_subscriptions_reviewed (migração 0011).
 *
 * Só informa: a marca e a data da revisão nunca mudam Recebido, Pago, Diferença, Ainda a pagar nem a renda comprometida, e o
 * Clarevo não cancela nada junto a quem presta o serviço. Os textos não julgam a assinatura nem citam marcas.
 *
 * Regras:
 * - Só gasto fixo mensal (kind 'mensal') pode ser assinatura; parcelamento e conta do ano nunca.
 * - Ativa: marcada e não encerrada (seriesEnded). Só as ativas entram nas somas e na revisão.
 * - Por mês: soma do valor vigente de cada ativa (a vigência do mês de hoje, ou da primeira conta antes de começar); por ano: por
 *   mês × 12. Valor que muda (estimado) entra pelo valor de referência e a tela diz que é estimado.
 * - Lembrete: com ao menos uma assinatura ativa, aparece se a última revisão (a data mais recente entre as ativas) foi há mais de
 *   6 meses; sem nenhuma revisão, se a assinatura mais antiga foi marcada como assinatura há 3 meses ou mais (o dia da marca,
 *   subscriptionSince, não o do cadastro da série: marcar um gasto fixo antigo não liga o aviso na hora). "Agora não" esconde o aviso por
 *   30 dias, só neste aparelho. "Revisei minhas assinaturas" grava a data no banco e o aviso some.
 */

export const SUBSCRIPTION_MONTHS_PER_YEAR = 12;
/** A última revisão com mais de 6 meses faz o aviso aparecer. */
export const SUBSCRIPTION_REVIEW_AFTER_MONTHS = 6;
/** Nunca revisada: o aviso aparece quando a assinatura mais antiga tem 3 meses ou mais. */
export const SUBSCRIPTION_FIRST_REVIEW_AFTER_MONTHS = 3;
/** "Agora não" esconde o aviso por 30 dias, só neste aparelho. */
export const SUBSCRIPTION_SNOOZE_DAYS = 30;

// ---------------------------------------------------------------------------
// Textos
// ---------------------------------------------------------------------------

export const SUBSCRIPTION_TEXT = {
  /** Interruptor do cadastro e da edição de gasto fixo mensal. */
  switchLabel: 'É uma assinatura?',
  switchCaption: 'Streaming, aplicativo, academia, clube, plano de celular.',
  /** Grupo no topo de Gastos fixos e parcelamentos. */
  groupTitle: 'Assinaturas',
  groupIntro: 'Gastos fixos que você marcou como assinatura.',
  groupEstimated: (cents: Cents): string => `Inclui ${formatBRL(cents)} por mês em valores estimados.`,
  /** "R$ 138,90 por mês · R$ 1.666,80 por ano". */
  totals: (monthlyCents: Cents, yearlyCents: Cents): string => `${formatBRL(monthlyCents)} por mês · ${formatBRL(yearlyCents)} por ano`,
  /** "R$ 478,80 por ano". */
  perYear: (yearlyCents: Cents): string => `${formatBRL(yearlyCents)} por ano`,
  perMonth: (monthlyCents: Cents): string => `${formatBRL(monthlyCents)} por mês`,
  reviewLink: 'Revisar assinaturas',
  /** Detalhe do gasto fixo marcado. */
  detailBadge: 'Assinatura',
  detailYear: (yearlyCents: Cents, estimated = false): string => `Assinatura · ${estimated ? 'cerca de ' : ''}${formatBRL(yearlyCents)} por ano`,
  /** Tela "Revisar assinaturas". */
  reviewTitle: 'Revisar assinaturas',
  reviewIntro: 'Vale olhar de tempos em tempos se cada uma ainda é usada.',
  reviewNote:
    'Encerrar aqui só tira a assinatura do Clarevo a partir do mês escolhido. Para deixar de pagar, é preciso encerrar também com quem oferece o serviço.',
  endFrom: 'Encerrar a partir de…',
  keeps: 'Continua',
  keepsHint: 'Marca só para você acompanhar a lista; não é guardado.',
  keepsCount: (kept: number, total: number): string => `${kept} de ${total} marcadas como Continua`,
  reviewedButton: 'Revisei minhas assinaturas',
  reviewedDone: 'Revisão registrada.',
  reviewFooter: 'O Clarevo guarda só a data da revisão.',
  lastReview: (reviewedOn: IsoDate | null): string =>
    reviewedOn === null ? 'Você ainda não registrou uma revisão.' : `Última revisão: ${formatDateBR(reviewedOn)}.`,
  empty: 'Nenhuma assinatura ativa. Marque um gasto fixo mensal como assinatura ao cadastrar ou editar.',
  emptyAction: 'Ver gastos fixos',
  loadFailed: 'Não foi possível carregar suas assinaturas. Tente novamente.',
  /** Lembrete dentro do app, no topo de Gastos fixos e parcelamentos. */
  reminderTitle: 'Faz tempo que você não revisa suas assinaturas.',
  reminderReview: 'Revisar agora',
  reminderLater: 'Agora não',
  reminderLaterHint: 'Esconde este aviso por 30 dias, só neste aparelho.',
  /** Depois de salvar o gasto fixo com a marca. */
  savedAs: 'Marcado como assinatura.',
  savedAsNot: 'Assinatura desmarcada.',
  /** O gasto fixo foi salvo, mas a marca não. */
  markFailed: 'O gasto fixo foi salvo, mas a marca de assinatura não. Abra o gasto fixo, escolha Editar e tente de novo.',
} as const;

/** Textos de erro das escritas de assinatura (nomes e regras do banco). */
export const SUBSCRIPTION_ERROR_TEXT = {
  assinatura_so_gasto_fixo: 'Só um gasto fixo mensal pode ser marcado como assinatura.',
  marca_invalida: ERROR_TEXT.salvar_falhou,
  versao_desatualizada: 'Este gasto fixo foi alterado em outro aparelho. Abra de novo para conferir a versão atual.',
  nao_encontrado: 'Este gasto fixo não está mais disponível.',
  sem_permissao: ERROR_TEXT.sem_permissao,
  salvar_falhou: ERROR_TEXT.salvar_falhou,
  carregar_falhou: ERROR_TEXT.carregar_falhou,
  review_failed: 'Não foi possível registrar a revisão. Tente novamente.',
} as const;

/** Texto de um erro das telas de assinatura; o que não é conhecido cai em "Não foi possível salvar...". */
export function subscriptionErrorText(code: string): string {
  return (SUBSCRIPTION_ERROR_TEXT as Record<string, string>)[code] ?? SUBSCRIPTION_ERROR_TEXT.salvar_falhou;
}

// ---------------------------------------------------------------------------
// Quais são e quanto custam
// ---------------------------------------------------------------------------

/** O que as regras precisam de uma série. */
export type SubscriptionSeries = Pick<
  CommitmentSeries,
  'id' | 'kind' | 'firstDueMonth' | 'firstNumber' | 'lastNumber' | 'partsPerYear' | 'terms' | 'subscription' | 'subscriptionReviewedOn' | 'subscriptionSince' | 'createdAt'
>;

/** Gasto fixo mensal marcado e não encerrado. */
export function isActiveSubscription(s: SubscriptionSeries, today: IsoDate): boolean {
  return s.kind === 'mensal' && s.subscription && !seriesEnded(s, today);
}

/** Por ano = por mês × 12 (o valor vigente se repetir). */
export function subscriptionYearlyCents(monthlyCents: Cents): Cents {
  return monthlyCents * SUBSCRIPTION_MONTHS_PER_YEAR;
}

/** Uma assinatura ativa, pronta para a lista. */
export interface SubscriptionRow {
  id: string;
  name: string;
  monthlyCents: Cents;
  yearlyCents: Cents;
  /** Valor que muda de um mês para outro: o valor é o de referência. */
  estimated: boolean;
  dueDay: number;
  reviewedOn: IsoDate | null;
}

export function subscriptionRow(s: SubscriptionSeries, today: IsoDate): SubscriptionRow {
  const term = currentTerm(s, today);
  return {
    id: s.id,
    name: term.description,
    monthlyCents: term.amountCents,
    yearlyCents: subscriptionYearlyCents(term.amountCents),
    estimated: term.amountMode === 'variavel',
    dueDay: term.dueDay,
    reviewedOn: s.subscriptionReviewedOn,
  };
}

/** As assinaturas ativas, da que mais custa por ano para a que menos custa (empate: pelo nome). */
export function subscriptionRows(list: readonly SubscriptionSeries[], today: IsoDate): SubscriptionRow[] {
  return list
    .filter((s) => isActiveSubscription(s, today))
    .map((s) => subscriptionRow(s, today))
    .sort((a, b) => b.monthlyCents - a.monthlyCents || a.name.localeCompare(b.name, 'pt-BR') || a.id.localeCompare(b.id));
}

export interface SubscriptionTotals {
  count: number;
  monthlyCents: Cents;
  yearlyCents: Cents;
  /** Parte do por mês que vem de valores de referência (valor que muda). */
  estimatedMonthlyCents: Cents;
}

/** Quanto as assinaturas ativas custam: por mês, a soma dos valores vigentes; por ano, por mês × 12. */
export function subscriptionTotals(list: readonly SubscriptionSeries[], today: IsoDate): SubscriptionTotals {
  let monthlyCents = 0;
  let estimatedMonthlyCents = 0;
  const rows = subscriptionRows(list, today);
  for (const r of rows) {
    monthlyCents += r.monthlyCents;
    if (r.estimated) estimatedMonthlyCents += r.monthlyCents;
  }
  return { count: rows.length, monthlyCents, yearlyCents: subscriptionYearlyCents(monthlyCents), estimatedMonthlyCents };
}

/** "2 assinaturas" / "1 assinatura". */
export function subscriptionCount(n: number): string {
  return n === 1 ? '1 assinatura' : `${n} assinaturas`;
}

// ---------------------------------------------------------------------------
// Lembrete
// ---------------------------------------------------------------------------

/**
 * O dia civil em que a série foi cadastrada: a data do instante de criação no fuso da pessoa (o do espaço). Sem fuso, ou com fuso
 * ou instante inválido, o dia do instante em UTC.
 */
export function createdDay(s: Pick<CommitmentSeries, 'createdAt'>, timeZone?: string): IsoDate {
  if (timeZone) {
    try {
      return todayIn(timeZone, new Date(s.createdAt));
    } catch {
      // Fuso ou instante inválido: cai no dia do instante.
    }
  }
  return s.createdAt.slice(0, 10);
}

/** O dia em que a assinatura começou a contar para o lembrete: o da marca (subscriptionSince); só sem ele, o do cadastro. */
export function subscriptionStartDay(s: Pick<CommitmentSeries, 'subscriptionSince' | 'createdAt'>, timeZone?: string): IsoDate {
  return s.subscriptionSince ?? createdDay(s, timeZone);
}

/** A data mais recente de revisão entre as assinaturas ativas; null se nenhuma foi revisada. */
export function lastSubscriptionReview(list: readonly SubscriptionSeries[], today: IsoDate): IsoDate | null {
  let latest: IsoDate | null = null;
  for (const s of list) {
    if (!isActiveSubscription(s, today) || s.subscriptionReviewedOn === null) continue;
    if (latest === null || s.subscriptionReviewedOn > latest) latest = s.subscriptionReviewedOn;
  }
  return latest;
}

/** O dia da marca (ou, sem ele, do cadastro) da assinatura ativa mais antiga; null sem assinatura ativa. */
export function oldestSubscriptionDay(list: readonly SubscriptionSeries[], today: IsoDate, timeZone?: string): IsoDate | null {
  let oldest: IsoDate | null = null;
  for (const s of list) {
    if (!isActiveSubscription(s, today)) continue;
    const day = subscriptionStartDay(s, timeZone);
    if (oldest === null || day < oldest) oldest = day;
  }
  return oldest;
}

/**
 * O lembrete é devido? Com ao menos uma assinatura ativa: a última revisão foi há mais de 6 meses (hoje depois de revisão + 6
 * meses), ou nunca houve revisão e a assinatura mais antiga foi marcada há 3 meses ou mais (hoje a partir da marca + 3
 * meses). A idade conta do dia da marca como assinatura (subscriptionSince), não do cadastro da série; timeZone (o do espaço) só
 * serve ao último recurso, o dia do cadastro de quem não tem o dia da marca. Meses civis, com o dia limitado ao fim do mês.
 * Revisão no futuro (relógio do aparelho para trás) não faz o aviso aparecer.
 */
export function subscriptionReminderDue(list: readonly SubscriptionSeries[], today: IsoDate, timeZone?: string): boolean {
  const oldest = oldestSubscriptionDay(list, today, timeZone);
  if (oldest === null) return false;
  const last = lastSubscriptionReview(list, today);
  if (last !== null) return today > addMonthsToDate(last, SUBSCRIPTION_REVIEW_AFTER_MONTHS);
  return today >= addMonthsToDate(oldest, SUBSCRIPTION_FIRST_REVIEW_AFTER_MONTHS);
}

/** O dia até o qual "Agora não" esconde o aviso: hoje + 30 dias. */
export function subscriptionSnoozeUntil(today: IsoDate): IsoDate {
  return addDays(today, SUBSCRIPTION_SNOOZE_DAYS);
}

/** "Agora não" ainda vale? Escondido enquanto hoje é antes do dia guardado; valor inválido ou vazio não esconde. */
export function subscriptionSnoozed(snoozedUntil: string | null | undefined, today: IsoDate): boolean {
  return typeof snoozedUntil === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(snoozedUntil) && today < snoozedUntil;
}

/** O aviso aparece agora? Devido e não escondido por "Agora não". */
export function subscriptionReminderVisible(
  list: readonly SubscriptionSeries[],
  today: IsoDate,
  snoozedUntil: string | null | undefined,
  timeZone?: string,
): boolean {
  return subscriptionReminderDue(list, today, timeZone) && !subscriptionSnoozed(snoozedUntil, today);
}
