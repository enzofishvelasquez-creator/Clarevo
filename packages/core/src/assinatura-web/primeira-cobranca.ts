/**
 * Assinar na web durante o teste grátis (D-129, decisão do Enzo de 26/11/2026): quem assina no teste não perde os dias que faltam. A primeira
 * cobrança no cartão e o período pago com Pix começam quando o teste acaba. O fim do teste vem sempre do servidor: `my_access` (status
 * "teste" e `until`, o fim do teste, migração 0047), lido pela função do servidor com a sessão da pessoa ao criar o Checkout e pelo app
 * para dizer a data na tela. No banco, `billing_pix_apply` (migração 0048) usa a mesma conta para o Pix: o dia, em Brasília, do fim do teste.
 *
 * Depois de assinar, a assinatura marcada para o fim do teste aparece no próprio direito da pessoa (`plan_entitlements`, provedor "web",
 * lido pelo app com a RLS, só as linhas dela): antes da primeira cobrança paga, o direito vale só do começo do dia dela, em Brasília, até o
 * fim do terceiro dia seguinte (`p_valid_from` de `billing_apply`). Uma janela de no máximo 4 dias é só desse caso: um período pago tem pelo
 * menos um mês. É por ela que o app sabe que há uma assinatura no cartão (para excluir a conta e para perguntar ao Asaas só quando há) e que a
 * primeira cobrança ainda não foi paga, sem ler nada do Asaas.
 *
 * Nas lojas nada disto vale: os produtos não têm oferta de teste, e a cobrança é no dia da compra (a tela das lojas diz isso).
 */
import { addDays, todayIn, type IsoDate } from '../dates';

/** O fuso do serviço de pagamento e do banco para os dias de cobrança: Brasília (o mesmo de ASAAS_TIME_ZONE e de billing_pix_apply). */
export const BILLING_TIME_ZONE = 'America/Sao_Paulo';

const DAY_MS = 86_400_000;
/** A janela do direito antes da primeira cobrança paga: o dia dela e os 3 seguintes (WEB_GRACE_DAYS), no máximo 4 dias. */
export const FIRST_CHARGE_WINDOW_MS = 4 * DAY_MS;

/**
 * O dia (em Brasília) em que começam a primeira cobrança no cartão e o período pago com Pix de quem assina agora na web: o dia do fim do teste
 * grátis, quando a pessoa está no teste (`status` "teste" de `my_access`) e o teste acaba depois de hoje; senão, null (começa hoje, como
 * antes). `until` é o fim do teste devolvido por `my_access`.
 */
export function paidStartDay(status: unknown, until: unknown, now: Date): IsoDate | null {
  if (status !== 'teste' || typeof until !== 'string') return null;
  const end = Date.parse(until);
  if (Number.isNaN(end) || end <= now.getTime()) return null;
  const day = todayIn(BILLING_TIME_ZONE, new Date(end));
  return day > todayIn(BILLING_TIME_ZONE, now) ? day : null;
}

/**
 * Como o dia da primeira cobrança (Brasília) fica perto do fim do teste no dia da pessoa (o fuso dela): no mesmo dia, no dia seguinte (a
 * oeste de Brasília, quando o teste acaba tarde da noite) ou na véspera (a leste, quando acaba logo depois da meia-noite). Para a tela dizer
 * as duas datas sem se contradizer (D-129).
 */
export type TrialEndRelation = 'mesmo-dia' | 'dia-seguinte' | 'vespera';

export function trialEndRelation(firstChargeDay: IsoDate, until: string | null, timeZone: string): TrialEndRelation {
  if (!until || Number.isNaN(Date.parse(until))) return 'mesmo-dia';
  const local = todayIn(timeZone, new Date(until));
  if (addDays(local, 1) === firstChargeDay) return 'dia-seguinte';
  if (addDays(firstChargeDay, 1) === local) return 'vespera';
  return 'mesmo-dia';
}

/** "quando o teste grátis acaba", ou o dia seguinte ou a véspera, quando o dia da cobrança (Brasília) e o do fim do teste (o da pessoa) diferem. */
export function trialEndPhrase(rel: TrialEndRelation): string {
  return rel === 'dia-seguinte' ? 'no dia seguinte ao fim do teste grátis' : rel === 'vespera' ? 'na véspera do fim do teste grátis' : 'quando o teste grátis acaba';
}

/** Um direito da própria pessoa pela web (`plan_entitlements`, provedor "web"): só o começo e o fim. */
export interface OwnWebEntitlement {
  validFrom: string;
  validUntil: string | null;
}

/** Lê as linhas de `plan_entitlements` (`valid_from`, `valid_until`); linha fora do formato fica de fora. */
export function parseOwnWebEntitlements(raw: unknown): OwnWebEntitlement[] {
  if (!Array.isArray(raw)) return [];
  const out: OwnWebEntitlement[] = [];
  for (const r of raw) {
    const o = r && typeof r === 'object' ? (r as Record<string, unknown>) : null;
    if (!o || typeof o.valid_from !== 'string' || Number.isNaN(Date.parse(o.valid_from))) continue;
    const until = typeof o.valid_until === 'string' && !Number.isNaN(Date.parse(o.valid_until)) ? o.valid_until : null;
    out.push({ validFrom: o.valid_from, validUntil: until });
  }
  return out;
}

/**
 * O direito pela web ainda vale ou vai valer: o fim depois de agora e depois do começo. Assim contam a assinatura paga e a marcada para o
 * fim do teste; a cancelada (o fim virou o instante do aviso do cancelamento) e a vencida, não.
 */
function live(e: OwnWebEntitlement, now: Date): e is OwnWebEntitlement & { validUntil: string } {
  if (!e.validUntil) return false;
  const until = Date.parse(e.validUntil);
  return until > now.getTime() && until > Date.parse(e.validFrom);
}

/** Se a pessoa tem uma assinatura no cartão da web que vale ou vai valer (paga ou marcada para o fim do teste). */
export function hasLiveWebEntitlement(entitlements: readonly OwnWebEntitlement[], now: Date): boolean {
  return entitlements.some((e) => live(e, now));
}

/**
 * O dia (Brasília) da primeira cobrança ainda não paga da assinatura no cartão feita no teste grátis (D-129): o começo do direito que vale,
 * quando a janela é a da primeira cobrança (no máximo 4 dias). Vale antes do dia (o banco ainda diz "teste") e no dia, até a confirmação do
 * cartão (o banco já diz "assinatura"). `cancelled`: o Asaas já disse que a assinatura foi cancelada (o aviso ainda não chegou ao banco).
 * null nas outras situações.
 */
export function pendingFirstCharge(entitlements: readonly OwnWebEntitlement[], now: Date, cancelled = false): IsoDate | null {
  if (cancelled) return null;
  for (const e of entitlements) {
    if (!live(e, now) || Date.parse(e.validUntil) - Date.parse(e.validFrom) > FIRST_CHARGE_WINDOW_MS) continue;
    return todayIn(BILLING_TIME_ZONE, new Date(e.validFrom));
  }
  return null;
}
