/**
 * Os produtos da assinatura nas lojas (D-090), sem dependências: o app (a compra) e a função do servidor (os avisos do RevenueCat)
 * importam daqui. Os mesmos identificadores nas duas lojas, criados pelo Enzo no App Store Connect e no Google Play Console
 * (`docs/42_ASSINATURA_LOJAS.md`): na Apple, produtos de assinatura automática no mesmo grupo; no Google, uma assinatura por produto, cada
 * uma com um plano básico (base plan) só, que o RevenueCat chama de "<produto>:<plano básico>" ("clarevo_individual_mensal:mensal").
 * Identificador de produto da Apple não pode ser reaproveitado depois de criado: mudar daqui exige produto novo nas lojas.
 *
 * Plano anual (D-127): dois produtos novos, `clarevo_individual_anual` e `clarevo_familia_anual`, também os mesmos nas duas lojas. No
 * Google, assinaturas novas (cada uma com o plano básico `anual`), e não um segundo plano básico nas assinaturas mensais: assim o
 * identificador do produto sozinho diz o plano e o período nas duas lojas, o RevenueCat mostra quatro produtos com nomes claros, e a troca
 * entre mensal e anual no Android usa o mesmo caminho da troca de plano (substituir uma assinatura por outra). A escolha está em docs/42.
 */
import type { BillingPeriod, PlanKind } from '../plano-precos';

/** Os produtos de cada plano e período, os mesmos nas duas lojas. */
export const STORE_PRODUCTS: Readonly<Record<PlanKind, Readonly<Record<BillingPeriod, string>>>> = {
  individual: { mensal: 'clarevo_individual_mensal', anual: 'clarevo_individual_anual' },
  familiar: { mensal: 'clarevo_familia_mensal', anual: 'clarevo_familia_anual' },
};

/** Os produtos mensais (D-090), como antes do plano anual. */
export const STORE_PRODUCT_IDS: Readonly<Record<PlanKind, string>> = {
  individual: STORE_PRODUCTS.individual.mensal,
  familiar: STORE_PRODUCTS.familiar.mensal,
};

/** O plano básico de cada período no Google Play: `mensal` nas assinaturas mensais e `anual` nas anuais. */
export const GOOGLE_BASE_PLANS: Readonly<Record<BillingPeriod, string>> = { mensal: 'mensal', anual: 'anual' };

/** O plano básico mensal de cada assinatura mensal no Google Play (D-090). */
export const GOOGLE_BASE_PLAN = GOOGLE_BASE_PLANS.mensal;

/**
 * As ofertas (offerings) do RevenueCat, uma por plano, cada uma com o pacote mensal (`$rc_monthly`) e o anual (`$rc_annual`). O app compra
 * pelo pacote quando a oferta existe e o pacote traz o produto certo; sem ela, pelo identificador do produto (docs/42, seção 4).
 */
export const STORE_OFFERINGS: Readonly<Record<PlanKind, string>> = { individual: 'individual', familiar: 'familia' };
export const STORE_PACKAGES: Readonly<Record<BillingPeriod, string>> = { mensal: '$rc_monthly', anual: '$rc_annual' };

export interface StoreProductInfo {
  plan: PlanKind;
  period: BillingPeriod;
}

/**
 * O plano e o período de um produto da loja: aceita o identificador sozinho ou com o plano básico do Google ("...:mensal", "...:anual").
 * null fora da lista.
 */
export function storeProductInfo(id: unknown): StoreProductInfo | null {
  if (typeof id !== 'string') return null;
  const base = id.trim().split(':')[0] ?? '';
  for (const plan of ['individual', 'familiar'] as const) {
    for (const period of ['mensal', 'anual'] as const) {
      if (base === STORE_PRODUCTS[plan][period]) return { plan, period };
    }
  }
  return null;
}

/** O plano de um produto da loja (mensal ou anual). null fora da lista. */
export function planOfStoreProduct(id: unknown): PlanKind | null {
  return storeProductInfo(id)?.plan ?? null;
}
