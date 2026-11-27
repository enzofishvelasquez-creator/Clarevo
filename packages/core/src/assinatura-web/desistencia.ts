/**
 * A desistência em 7 dias na web (direito de arrependimento, CDC art. 49, e Decreto 7.962/2013, art. 5º; D-131, item F): as regras que a
 * função do servidor `assinatura-web` usa (este arquivo vai na função; os textos da tela ficam em `desistencia-app.ts`, fora dela). Fechada
 * pelo interruptor WITHDRAWAL_OPEN (`plano-precos.ts`) até o advogado aprovar o texto (pergunta 64 do resumo para o advogado, seção m).
 *
 * De onde o prazo conta ("a contar de sua assinatura ou do ato de recebimento do produto ou serviço", CDC art. 49): do dia em que o dinheiro
 * saiu e o período pago começou, o que vier depois, sempre pelo que o servidor sabe (o Asaas e o banco), nunca pelo que o app manda.
 * - Cartão: o dia da primeira cobrança paga da assinatura (o vencimento ou, se a confirmação veio depois, o dia dela). Fora do teste grátis, é
 *   o próprio dia em que a pessoa assinou (o Checkout cobra no dia); assinada no teste (D-129), é o dia em que o teste acaba e o cartão é
 *   cobrado. Antes da primeira cobrança nada foi pago: não há o que devolver, e "Cancelar assinatura" já encerra sem cobrar nada (o botão de
 *   desistir não aparece, e a função responde "nada_cobrado"). As renovações não abrem prazo novo (a assinatura é o mesmo contrato).
 * - Pix: cada pagamento é uma compra; o prazo conta do dia do pagamento ou, se ele foi feito no teste grátis, do dia em que o período pago
 *   começa (o fim do teste, `billing_pix_payments.starts_on`, D-129).
 * O prazo vale até o fim do 7º dia seguinte (o dia do começo não conta, Código Civil, art. 132) no fuso mais a oeste do Brasil (Acre, UTC-5):
 * ninguém perde horas por estar a oeste de Brasília. A tela mostra o 7º dia.
 *
 * Desistir devolve o valor integral da compra no mesmo meio de pagamento (o estorno no cartão, a devolução do Pix), pela API do Asaas
 * (`POST /v3/payments/{id}/refund`, sem valor: o integral), e, no cartão, remove a assinatura antes (`DELETE /v3/subscriptions/{id}`), para
 * nada mais ser cobrado. O período pago sai pelo aviso de estorno do Asaas (PAYMENT_REFUNDED e PAYMENT_REFUND_IN_PROGRESS), como já saía na
 * devolução feita pela equipe: a conta volta ao teste grátis, se ainda houver dias dele, ou fica só para ver e exportar.
 */
import { addDays, type IsoDate } from '../dates';
import type { AsaasPayment } from './servidor';

/** Os dias do direito de arrependimento (CDC, art. 49). */
export const WITHDRAWAL_DAYS = 7;
/** O fuso mais a oeste do Brasil (Acre, UTC-5): o prazo vale até o fim do 7º dia ali (e, assim, em todo o país). */
export const WITHDRAWAL_DEADLINE_OFFSET = '-05:00';
/** A descrição do estorno no Asaas (a mesma para o cartão e o Pix). */
export const WITHDRAWAL_REFUND_DESCRIPTION = 'Desistência da compra em até 7 dias (CDC, art. 49)';

/** Situações de cobrança que dá para devolver pela API (paga no cartão ou no Pix, sem contestação). */
export const REFUNDABLE_STATUSES: ReadonlySet<string> = new Set(['CONFIRMED', 'RECEIVED']);
/** Situações de cobrança já devolvida ou com a devolução em andamento: nunca se pede outra devolução. */
export const REFUND_STATUSES: ReadonlySet<string> = new Set(['REFUNDED', 'REFUND_REQUESTED', 'REFUND_IN_PROGRESS']);
/** Situações de uma cobrança que já foi paga alguma vez (para achar a primeira cobrança paga, inclusive a já devolvida ou contestada). */
const EVER_PAID: ReadonlySet<string> = new Set([
  ...REFUNDABLE_STATUSES,
  ...REFUND_STATUSES,
  'RECEIVED_IN_CASH',
  'DUNNING_RECEIVED',
  'CHARGEBACK_REQUESTED',
  'CHARGEBACK_DISPUTE',
  'AWAITING_CHARGEBACK_REVERSAL',
]);

/** O último dia do prazo (Brasília), a partir do dia de onde ele conta: o 7º dia seguinte. */
export function withdrawalLastDay(startDay: IsoDate): IsoDate {
  return addDays(startDay, WITHDRAWAL_DAYS);
}

/** O fim do prazo: o fim do 7º dia seguinte no fuso mais a oeste do Brasil. */
export function withdrawalDeadline(startDay: IsoDate): Date {
  return new Date(`${withdrawalLastDay(startDay)}T23:59:59.999${WITHDRAWAL_DEADLINE_OFFSET}`);
}

/** Se ainda está no prazo. */
export function withinWithdrawal(startDay: IsoDate, now: Date): boolean {
  return now.getTime() <= withdrawalDeadline(startDay).getTime();
}

/**
 * O dia em que uma cobrança do cartão foi feita: o vencimento ou, se a confirmação veio depois (o Checkout pago depois da meia-noite, o cartão
 * recusado e pago num outro dia), o dia da confirmação. Nunca o dia do crédito (`paymentDate`, 32 dias depois no cartão). null se a cobrança
 * nunca foi paga.
 */
export function cardChargeDay(p: AsaasPayment): IsoDate | null {
  if (p.deleted || !EVER_PAID.has(p.status) || !p.dueDate) return null;
  const confirmed = p.confirmedOn ?? null;
  return confirmed && confirmed > p.dueDate ? confirmed : p.dueDate;
}

/** O que a desistência de uma compra encontra no Asaas. */
export type WithdrawalCheck =
  /** No prazo, com cobrança paga para devolver. */
  | { state: 'pode'; startDay: IsoDate; refundable: AsaasPayment[]; amountCents: number }
  /** No prazo, e tudo o que foi pago já está devolvido (ou com a devolução em andamento): uma tentativa anterior deu certo. */
  | { state: 'devolvida'; startDay: IsoDate }
  /** Nada foi pago ainda (a assinatura feita no teste grátis, antes da primeira cobrança): "Cancelar assinatura" já não cobra nada. */
  | { state: 'nada_cobrado' }
  /** O prazo de 7 dias terminou. */
  | { state: 'fora_do_prazo'; startDay: IsoDate }
  /** Paga, mas em contestação ou sem o valor no Asaas: fica com a equipe. */
  | { state: 'sem_compra' };

const cents = (p: AsaasPayment) => (typeof p.valueCents === 'number' && Number.isSafeInteger(p.valueCents) && p.valueCents > 0 ? p.valueCents : null);

/** O valor a devolver: a soma das cobranças pagas que voltam (null se alguma não diz o valor). */
function refundTotal(refundable: readonly AsaasPayment[]): number | null {
  let total = 0;
  for (const p of refundable) {
    const c = cents(p);
    if (c === null) return null;
    total += c;
  }
  return total;
}

/**
 * A desistência de uma assinatura no cartão, pelas cobranças dela no Asaas: o prazo conta da primeira cobrança paga, e voltam todas as
 * cobranças pagas da assinatura que ainda dá para devolver (normalmente só essa). As já devolvidas não voltam de novo.
 */
export function cardWithdrawal(payments: readonly AsaasPayment[], now: Date): WithdrawalCheck {
  const charged = payments.map((p) => ({ p, day: cardChargeDay(p) })).filter((x): x is { p: AsaasPayment; day: IsoDate } => x.day !== null);
  if (charged.length === 0) return { state: 'nada_cobrado' };
  const startDay = charged.map((x) => x.day).sort()[0]!;
  if (!withinWithdrawal(startDay, now)) return { state: 'fora_do_prazo', startDay };
  const refundable = charged.map((x) => x.p).filter((p) => REFUNDABLE_STATUSES.has(p.status));
  if (refundable.length === 0) {
    return charged.some((x) => REFUND_STATUSES.has(x.p.status)) ? { state: 'devolvida', startDay } : { state: 'sem_compra' };
  }
  const amountCents = refundTotal(refundable);
  return amountCents === null ? { state: 'sem_compra' } : { state: 'pode', startDay, refundable, amountCents };
}

/** Um pagamento por Pix como o banco o guarda (`billing_pix_payments`): o resumo do identificador, o plano, o período e os dias. */
export interface PixPurchaseRow {
  paymentHash: string;
  plan: 'individual' | 'familiar';
  period: 'mensal' | 'anual';
  paidOn: IsoDate;
  /** O dia em que o período pago começa quando o pagamento foi feito no teste grátis (o fim do teste, D-129); nulo, o dia do pagamento. */
  startsOn: IsoDate | null;
}

/** O dia de onde conta o prazo de um pagamento por Pix: o do pagamento ou, pago no teste grátis, o do começo do período pago. */
export function pixWithdrawalStart(row: Pick<PixPurchaseRow, 'paidOn' | 'startsOn'>): IsoDate {
  return row.startsOn && row.startsOn > row.paidOn ? row.startsOn : row.paidOn;
}

/** A desistência de um pagamento por Pix: o dia vem do banco; a situação e o valor, da cobrança atual no Asaas. */
export function pixWithdrawal(row: Pick<PixPurchaseRow, 'paidOn' | 'startsOn'>, payment: AsaasPayment, now: Date): WithdrawalCheck {
  const startDay = pixWithdrawalStart(row);
  if (payment.deleted) return { state: 'sem_compra' };
  if (!withinWithdrawal(startDay, now)) return { state: 'fora_do_prazo', startDay };
  if (REFUND_STATUSES.has(payment.status)) return { state: 'devolvida', startDay };
  if (!REFUNDABLE_STATUSES.has(payment.status)) return { state: 'sem_compra' };
  const amountCents = cents(payment);
  return amountCents === null ? { state: 'sem_compra' } : { state: 'pode', startDay, refundable: [payment], amountCents };
}
