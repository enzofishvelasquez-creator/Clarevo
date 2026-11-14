import type { IsoDate, IsoMonth } from './dates';
import { addMonths, formatMonthName, monthOf } from './dates';
import { liquidityBucket } from './investment-details';
import type { Investment, InvestmentMovement, InvestmentPlan } from './investments';
import { investmentErrorText } from './investments';
import type { Cents } from './money';
import { formatBRL, parseBRL } from './money';

/**
 * Plano de aportes dos investimentos (D-099, item 12) e investimentos ligados à reserva ou a uma meta (item 13, fase 1).
 *
 * P1. O plano é intenção, não cobrança (D-027): o app mostra o aportado do mês ao lado do plano, sem cor de alerta, sem sequência de dias,
 *     sem comparação com outras pessoas e sem dizer onde aplicar. Conta como aportado do mês todo aporte registrado nos investimentos do
 *     Pessoal com data no mês (o aporte inicial de quem cria um investimento com data no mês conta também).
 * M1. A ligação é só informação: a meta continua com o valor que a pessoa registrou nela; o valor dos investimentos vem da última
 *     atualização de cada um. A liquidez vem da ficha; sem ela, o investimento fica fora do "resgate em até 1 dia".
 */

/** Faixa do plano (igual à da tabela investment_plans). */
export const INVESTMENT_PLAN_MAX_CENTS = 999_999_999;

export function investmentPlanError(plannedCents: Cents | null): 'valor_invalido' | null {
  if (plannedCents === null) return null;
  return Number.isSafeInteger(plannedCents) && plannedCents >= 1 && plannedCents <= INVESTMENT_PLAN_MAX_CENTS ? null : 'valor_invalido';
}

export const INVESTMENT_PLAN_TEXT = {
  cardTitle: 'Plano de aportes',
  /** Sem plano: o convite, opcional. */
  emptyBody: 'Se quiser, defina quanto pretende aportar por mês nos investimentos. É só um plano: nada muda nos seus valores.',
  emptyAction: 'Definir plano de aportes',
  /** "Aportado em novembro: R$ 300,00. Seu plano: R$ 500,00." */
  monthLine: (month: IsoMonth, depositedCents: Cents, plannedCents: Cents) =>
    `Aportado em ${formatMonthName(month)}: ${formatBRL(depositedCents)}. Seu plano: ${formatBRL(plannedCents)}.`,
  editAction: 'Ver plano de aportes',
  screenTitle: 'Plano de aportes',
  intro: 'Quanto você pretende aportar por mês nos investimentos. É intenção, não cobrança: a Clarevo mostra o que foi aportado ao lado do plano.',
  amountLabel: 'Quanto pretende aportar por mês?',
  amountHint: 'A soma dos aportes em todos os investimentos do mês.',
  amountEmpty: 'Informe um valor.',
  amountInvalid: 'Informe um valor válido.',
  save: 'Salvar plano',
  remove: 'Tirar plano',
  removeTitle: 'Tirar o plano de aportes?',
  removeBody: 'Os investimentos e os aportes registrados continuam como estão.',
  removeConfirm: 'Tirar plano',
  cancel: 'Cancelar',
  saved: 'Plano de aportes salvo.',
  removed: 'Plano de aportes retirado.',
  historyTitle: 'Aportes dos últimos meses',
  /** "Novembro: R$ 300,00" (o mês de hoje leva "até agora"). */
  historyLine: (month: IsoMonth, depositedCents: Cents, current: boolean) => {
    const name = formatMonthName(month);
    return `${name.charAt(0).toUpperCase()}${name.slice(1)}${current ? ' (até agora)' : ''}: ${formatBRL(depositedCents)}`;
  },
  historyNote: 'Soma dos aportes registrados nos investimentos, pela data de cada um.',
  reminderNote: 'Se quiser um aviso no dia do aporte, ligue "Aportar nos investimentos" em Conta, Lembretes do dia a dia.',
  personalOnly: 'O plano de aportes fica só no seu Pessoal.',
  saveError: 'Não foi possível salvar. Tente de novo.',
} as const;

/** Meses mostrados no histórico do plano (o de hoje e os cinco anteriores). */
export const INVESTMENT_PLAN_HISTORY_MONTHS = 6;

/** Soma dos aportes registrados com data no mês (todos os investimentos do contexto, ativos ou encerrados). */
export function investmentDepositsInMonth(movements: readonly Pick<InvestmentMovement, 'kind' | 'amountCents' | 'occurredOn'>[], month: IsoMonth): Cents {
  let sum = 0;
  for (const m of movements) if (m.kind === 'aporte' && monthOf(m.occurredOn) === month) sum += m.amountCents;
  return sum;
}

/** O histórico do plano: o mês de hoje e os anteriores, do mais recente ao mais antigo. */
export function investmentDepositHistory(
  movements: readonly Pick<InvestmentMovement, 'kind' | 'amountCents' | 'occurredOn'>[],
  today: IsoDate,
  months: number = INVESTMENT_PLAN_HISTORY_MONTHS,
): { month: IsoMonth; depositedCents: Cents; current: boolean }[] {
  const now = monthOf(today);
  return Array.from({ length: Math.max(0, Math.floor(months)) }, (_, i) => {
    const month = addMonths(now, -i);
    return { month, depositedCents: investmentDepositsInMonth(movements, month), current: i === 0 };
  });
}

/** A linha do card na aba Investir (null sem plano). */
export function investmentPlanLine(plan: InvestmentPlan | null, movements: readonly Pick<InvestmentMovement, 'kind' | 'amountCents' | 'occurredOn'>[], today: IsoDate): string | null {
  if (!plan) return null;
  const month = monthOf(today);
  return INVESTMENT_PLAN_TEXT.monthLine(month, investmentDepositsInMonth(movements, month), plan.plannedMonthlyCents);
}

/** O valor digitado no plano: vazio ou fora da faixa é erro (para tirar o plano, o botão "Tirar plano"). */
export function validateInvestmentPlanText(text: string): { ok: true; cents: Cents } | { ok: false; error: string } {
  if (text.trim() === '') return { ok: false, error: INVESTMENT_PLAN_TEXT.amountEmpty };
  const cents = parseBRL(text);
  if (cents === null || cents < 1 || cents > INVESTMENT_PLAN_MAX_CENTS) return { ok: false, error: INVESTMENT_PLAN_TEXT.amountInvalid };
  return { ok: true, cents };
}

// ---------------------------------------------------------------------------
// Investimento ligado à reserva ou a uma meta (item 13, fase 1)
// ---------------------------------------------------------------------------

export const INVESTMENT_GOAL_TEXT = {
  formLabel: 'Para que é este dinheiro? (opcional)',
  formHint: 'Ligar a uma meta é só informação: a meta continua com o valor que você registrou nela.',
  noGoal: 'Sem meta',
  /** Linha da ficha: "Para: Viagem". */
  fichaLine: (goalName: string) => `Para: ${goalName}`,
  fichaLabel: 'Para',
  openGoal: 'Ver a meta',
  openReserve: 'Ver a reserva',
  reserveTitle: 'Investimentos ligados à reserva',
  goalTitle: 'Investimentos ligados à meta',
  /** "Valor dos investimentos ligados: R$ 8.000,00 (2 investimentos)." */
  totalLine: (valueCents: Cents, count: number) =>
    `Valor dos investimentos ligados: ${formatBRL(valueCents)} (${count} ${count === 1 ? 'investimento' : 'investimentos'}).`,
  /** "Com resgate em até 1 dia, pela ficha: R$ 6.000,00." */
  quickLine: (valueCents: Cents) => `Com resgate em até 1 dia, pela ficha: ${formatBRL(valueCents)}.`,
  /** Investimentos sem a liquidez na ficha (ficam fora da linha acima). */
  unknownLine: (count: number) =>
    count === 1 ? '1 investimento ligado está sem a liquidez na ficha.' : `${count} investimentos ligados estão sem a liquidez na ficha.`,
  note: 'Só informação: o valor guardado é o que você registra aqui. O valor de cada investimento vem da última atualização dele, na aba Investir.',
  invalid: 'Esta meta não pode mais ser escolhida. Escolha outra ou deixe sem meta.',
  archivedNote: 'A meta ligada a este investimento foi arquivada. Ao salvar, a ligação sai.',
} as const;

/** Texto do erro ao salvar um investimento, com o da meta ligada (o resto, como investmentErrorText). */
export function investmentSaveErrorText(code: string): string {
  return code === 'meta_invalida' ? INVESTMENT_GOAL_TEXT.invalid : investmentErrorText(code);
}

export interface LinkedInvestmentsSummary {
  /** Os investimentos ativos ligados à meta, por nome. */
  items: { id: string; name: string; valueCents: Cents }[];
  valueCents: Cents;
  /** Soma dos que têm resgate em até 1 dia pela ficha (liquidez diária, em 1 dia ou data de resgate até amanhã). */
  quickCents: Cents;
  /** Quantos estão sem a liquidez na ficha. */
  unknownLiquidity: number;
}

/** Os investimentos ativos ligados à meta (null sem nenhum). Encerrados ficam fora: o dinheiro já saiu. */
export function linkedInvestmentsSummary(goalId: string, investments: readonly Investment[], today: IsoDate): LinkedInvestmentsSummary | null {
  const linked = investments.filter((i) => i.status === 'ativo' && i.goalId === goalId).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR') || a.id.localeCompare(b.id));
  if (linked.length === 0) return null;
  let valueCents = 0;
  let quickCents = 0;
  let unknownLiquidity = 0;
  for (const i of linked) {
    valueCents += i.valueCents;
    const bucket = liquidityBucket(i, today);
    if (bucket === null) unknownLiquidity += 1;
    else if (bucket === 'ate_1_dia') quickCents += i.valueCents;
  }
  return { items: linked.map((i) => ({ id: i.id, name: i.name, valueCents: i.valueCents })), valueCents, quickCents, unknownLiquidity };
}
