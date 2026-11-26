/**
 * Assinar na web durante o teste grátis (D-129, decisão do Enzo de 26/11/2026): quem assina no teste não perde os dias que faltam. A primeira
 * cobrança no cartão e o período pago com Pix começam quando o teste acaba. O fim do teste vem sempre do servidor: `my_access` (status
 * "teste" e `until`, o fim do teste, migração 0047), lido pela função do servidor com a sessão da pessoa ao criar o Checkout e pelo app
 * para dizer a data na tela. No banco, `billing_pix_apply` (migração 0048) usa a mesma conta para o Pix: o dia, em Brasília, do fim do teste.
 *
 * Nas lojas nada disto vale: os produtos não têm oferta de teste, e a cobrança é no dia da compra (a tela das lojas diz isso).
 */
import { todayIn, type IsoDate } from '../dates';

/** O fuso do serviço de pagamento e do banco para os dias de cobrança: Brasília (o mesmo de ASAAS_TIME_ZONE e de billing_pix_apply). */
export const BILLING_TIME_ZONE = 'America/Sao_Paulo';

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
