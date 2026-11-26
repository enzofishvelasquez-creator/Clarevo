/**
 * Os planos e os preços da assinatura (D-083), sem dependências: a função do servidor da assinatura na web (D-084) importa daqui para
 * não levar o resto do núcleo. O que mais é da assinatura (acesso, textos das telas) fica em `plano.ts`, que reexporta isto.
 *
 * Desde a D-127 (27/11/2026), cada plano tem dois períodos: mensal e anual (D-125, item 2). O anual é uma cobrança só por ano, com os
 * mesmos recursos e os mesmos meios de pagamento do mensal. O teste grátis é da conta, antes de assinar: o anual não tem teste próprio.
 */
import type { Cents } from './money';

export type PlanKind = 'individual' | 'familiar';

/** O período da cobrança: mensal ou anual (D-125). O que já existia antes da D-127 é mensal. */
export type BillingPeriod = 'mensal' | 'anual';

export const BILLING_PERIODS: readonly BillingPeriod[] = ['mensal', 'anual'];

/** Quantos meses cada período cobre (o mesmo número do banco, em billing_pix_apply, migração 0047). */
export const PERIOD_MONTHS: Readonly<Record<BillingPeriod, number>> = { mensal: 1, anual: 12 };

/** Preço mensal de cada plano, em centavos: R$ 29,90 e R$ 69,90. */
export const PLAN_PRICE_CENTS: Readonly<Record<PlanKind, Cents>> = { individual: 2990, familiar: 6990 };

/**
 * Preço de cada plano em cada período, em centavos (D-125): Individual R$ 29,90 por mês ou R$ 269,90 por ano; Família R$ 69,90 por mês ou
 * R$ 629,90 por ano (25% sobre 12 mensalidades, arredondado de R$ 629,10).
 */
export const PLAN_PERIOD_PRICE_CENTS: Readonly<Record<PlanKind, Readonly<Record<BillingPeriod, Cents>>>> = {
  individual: { mensal: 2990, anual: 26990 },
  familiar: { mensal: 6990, anual: 62990 },
};

export const PLAN_NAME: Readonly<Record<PlanKind, string>> = { individual: 'Individual', familiar: 'Família' };

/** "anual" ou "mensal", como vai nos nomes ("plano Individual anual"). */
export const PERIOD_NAME: Readonly<Record<BillingPeriod, string>> = { mensal: 'mensal', anual: 'anual' };

/** Lê um período vindo de fora (banco, pedido do app). Fora da lista: null. */
export function parseBillingPeriod(v: unknown): BillingPeriod | null {
  return v === 'mensal' || v === 'anual' ? v : null;
}
