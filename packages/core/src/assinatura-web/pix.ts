/**
 * Pix mês a mês na assinatura pela web (D-093, caminho B escolhido pelo Enzo em 11/11/2026; docs/39, seção 6). O que a função do servidor
 * e o app dividem: a referência da Clarevo no Checkout do Asaas, a tolerância e a janela para pagar o próximo período. Cada pagamento por
 * Pix vale um mês, a partir do dia do pagamento ou do fim do período já pago (o que vier depois), mais PIX_GRACE_DAYS de tolerância: a
 * mesma conta do banco (billing_pix_apply, migrações 0033 e 0047). Não é automático: a tela avisa perto do fim.
 *
 * Pix anual (D-127): um pagamento vale 12 meses, com a mesma tolerância; a janela para pagar o próximo período e o aviso no Resumo começam
 * mais cedo (PIX_PAY_AHEAD_DAYS_BY_PERIOD e PIX_WARNING_DAYS_BY_PERIOD), pelo período do último pagamento (`my_access.period`).
 */
import type { BillingPeriod, PlanKind } from '../plano-precos';

/** Dias de tolerância depois do último dia pago (os mesmos 3 dias de billing_pix_apply), no mensal e no anual. */
export const PIX_GRACE_DAYS = 3;
/** O próximo mês pode ser pago quando faltam até tantos dias para o fim do mês pago (evita pagar vários meses de uma vez sem querer). */
export const PIX_PAY_AHEAD_DAYS = 10;
/** A partir de quantos dias para o fim do acesso o Resumo (na web) avisa para pagar o próximo mês. */
export const PIX_WARNING_DAYS = 7;
/**
 * A janela para pagar o próximo período, pelo período em vigor: 10 dias no mensal e 30 no anual (um ano pago com um mês de antecedência no
 * máximo, para ninguém pagar dois anos de uma vez sem querer).
 */
export const PIX_PAY_AHEAD_DAYS_BY_PERIOD: Readonly<Record<BillingPeriod, number>> = { mensal: PIX_PAY_AHEAD_DAYS, anual: 30 };
/** O aviso do Resumo (na web), pelo período em vigor: nos últimos 7 dias do mês pago ou nos últimos 14 dias do ano pago. */
export const PIX_WARNING_DAYS_BY_PERIOD: Readonly<Record<BillingPeriod, number>> = { mensal: PIX_WARNING_DAYS, anual: 14 };

const DAY_MS = 86_400_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * `externalReference` do Checkout de Pix no Asaas: a pessoa e o plano, com o prefixo próprio, e ":anual" no Pix de um ano (D-127; o de um
 * mês continua sem o período, como antes). Nunca nome nem e-mail.
 */
export function pixReference(personId: string, plan: PlanKind, period: BillingPeriod = 'mensal'): string {
  return `clarevo-pix:${personId.toLowerCase()}:${plan}${period === 'anual' ? ':anual' : ''}`;
}

export function parsePixReference(ref: unknown): { personId: string; plan: PlanKind; period: BillingPeriod } | null {
  if (typeof ref !== 'string') return null;
  const m = /^clarevo-pix:([0-9a-f-]{36}):(individual|familiar)(?::(mensal|anual))?$/i.exec(ref.trim());
  if (!m || !UUID.test(m[1] ?? '')) return null;
  return { personId: (m[1] ?? '').toLowerCase(), plan: m[2]!.toLowerCase() as PlanKind, period: m[3]?.toLowerCase() === 'anual' ? 'anual' : 'mensal' };
}

/**
 * O primeiro instante em que o próximo período pode ser pago: o começo do dia (Brasília) N - 1 dias antes do último dia pago, com N a
 * janela do período em vigor (PIX_PAY_AHEAD_DAYS_BY_PERIOD). `until` é o fim do acesso (23:59:59,999 em Brasília do último dia pago mais
 * PIX_GRACE_DAYS), então é `until` menos N + PIX_GRACE_DAYS dias, mais 1 milissegundo. null sem data.
 */
export function pixNextPaymentFrom(until: string | null, period: BillingPeriod = 'mensal'): Date | null {
  if (!until) return null;
  const end = Date.parse(until);
  return Number.isNaN(end) ? null : new Date(end - (PIX_PAY_AHEAD_DAYS_BY_PERIOD[period] + PIX_GRACE_DAYS) * DAY_MS + 1);
}

/** Se já dá para pagar o próximo período (a mesma conta na tela e na função do servidor). Sem data, sim. */
export function pixCanPayNext(until: string | null, now: Date, period: BillingPeriod = 'mensal'): boolean {
  const from = pixNextPaymentFrom(until, period);
  return from === null || now.getTime() >= from.getTime();
}
