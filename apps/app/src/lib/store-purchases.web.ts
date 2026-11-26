/**
 * Versão web de `store-purchases.ts`: na web a assinatura é pelo Asaas (D-084), não pelas lojas (D-090). Mesmas funções, sem efeito,
 * para o pacote nativo do RevenueCat ficar fora do site.
 */
import type { BillingPeriod, PlanKind, StoreName, StorePurchaseResult, StoreRestoreResult } from '@clarevo/core';

export const DEVICE_STORE: StoreName | null = null;
export const STORE_PURCHASES_READY = false;
export const STORE_TEST = false;

export interface StoreChoice {
  plan: PlanKind;
  period: BillingPeriod;
}

export async function buyPlan(_personId: string, _choice: StoreChoice, _current: StoreChoice | null = null): Promise<StorePurchaseResult> {
  return 'indisponivel';
}

export async function restorePurchases(_personId: string): Promise<StoreRestoreResult> {
  return 'indisponivel';
}

export async function openStoreSubscriptions(): Promise<boolean> {
  return false;
}

export async function storeUsedHere(_personId: string): Promise<boolean> {
  return false;
}

export async function forgetStoreUse(_personId: string): Promise<void> {}

export async function warmUpStore(_personId: string, _storeAccess: boolean): Promise<void> {}
