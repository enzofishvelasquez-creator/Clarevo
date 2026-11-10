/**
 * Os produtos da assinatura nas lojas (D-090), sem dependências: o app (a compra) e a função do servidor (os avisos do RevenueCat)
 * importam daqui. Os mesmos identificadores nas duas lojas, criados pelo Enzo no App Store Connect e no Google Play Console
 * (`docs/42_ASSINATURA_LOJAS.md`): na Apple, dois produtos de assinatura automática no mesmo grupo; no Google, duas assinaturas, cada
 * uma com o plano básico (base plan) mensal `GOOGLE_BASE_PLAN`, que o RevenueCat chama de "clarevo_individual_mensal:mensal".
 * Identificador de produto da Apple não pode ser reaproveitado depois de criado: mudar daqui exige produto novo nas lojas.
 */
import type { PlanKind } from '../plano-precos';

export const STORE_PRODUCT_IDS: Readonly<Record<PlanKind, string>> = {
  individual: 'clarevo_individual_mensal',
  familiar: 'clarevo_familia_mensal',
};

/** O plano básico mensal de cada assinatura no Google Play. */
export const GOOGLE_BASE_PLAN = 'mensal';

/** O plano de um produto da loja: aceita o identificador sozinho ou com o plano básico do Google ("...:mensal"). null fora da lista. */
export function planOfStoreProduct(id: unknown): PlanKind | null {
  if (typeof id !== 'string') return null;
  const base = id.trim().split(':')[0] ?? '';
  if (base === STORE_PRODUCT_IDS.individual) return 'individual';
  if (base === STORE_PRODUCT_IDS.familiar) return 'familiar';
  return null;
}
