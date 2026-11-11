/**
 * Pix mês a mês na assinatura pela web (D-093, caminho B escolhido pelo Enzo em 11/11/2026; docs/39, seção 6). O que a função do servidor
 * e o app dividem: a referência da Clarevo no Checkout do Asaas, a tolerância e a janela para pagar o próximo mês. Cada pagamento por Pix
 * vale um mês, a partir do dia do pagamento ou do fim do mês já pago (o que vier depois), mais PIX_GRACE_DAYS de tolerância: a mesma
 * conta do banco (billing_pix_apply, migração 0033). Não é automático: a tela avisa perto do fim.
 */
import type { PlanKind } from '../plano-precos';

/** Dias de tolerância depois do último dia pago (os mesmos 3 dias de billing_pix_apply). */
export const PIX_GRACE_DAYS = 3;
/** O próximo mês pode ser pago quando faltam até tantos dias para o fim do mês pago (evita pagar vários meses de uma vez sem querer). */
export const PIX_PAY_AHEAD_DAYS = 10;
/** A partir de quantos dias para o fim do acesso o Resumo (na web) avisa para pagar o próximo mês. */
export const PIX_WARNING_DAYS = 7;

const DAY_MS = 86_400_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `externalReference` do Checkout de Pix no Asaas: a pessoa e o plano, com o prefixo próprio. Nunca nome nem e-mail. */
export function pixReference(personId: string, plan: PlanKind): string {
  return `clarevo-pix:${personId.toLowerCase()}:${plan}`;
}

export function parsePixReference(ref: unknown): { personId: string; plan: PlanKind } | null {
  if (typeof ref !== 'string') return null;
  const m = /^clarevo-pix:([0-9a-f-]{36}):(individual|familiar)$/i.exec(ref.trim());
  if (!m || !UUID.test(m[1] ?? '')) return null;
  return { personId: (m[1] ?? '').toLowerCase(), plan: m[2] as PlanKind };
}

/**
 * O primeiro instante em que o próximo mês pode ser pago: o começo do dia (Brasília) PIX_PAY_AHEAD_DAYS - 1 dias antes do último dia
 * pago. `until` é o fim do acesso (23:59:59,999 em Brasília do último dia pago mais PIX_GRACE_DAYS), então é `until` menos
 * PIX_PAY_AHEAD_DAYS + PIX_GRACE_DAYS dias, mais 1 milissegundo. null sem data.
 */
export function pixNextPaymentFrom(until: string | null): Date | null {
  if (!until) return null;
  const end = Date.parse(until);
  return Number.isNaN(end) ? null : new Date(end - (PIX_PAY_AHEAD_DAYS + PIX_GRACE_DAYS) * DAY_MS + 1);
}

/** Se já dá para pagar o próximo mês (a mesma conta na tela e na função do servidor). Sem data, sim. */
export function pixCanPayNext(until: string | null, now: Date): boolean {
  const from = pixNextPaymentFrom(until);
  return from === null || now.getTime() >= from.getTime();
}
