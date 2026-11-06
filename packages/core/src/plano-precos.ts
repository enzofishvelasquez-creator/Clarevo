/**
 * Os planos e os preços da assinatura (D-083), sem dependências: a função do servidor da assinatura na web (D-084) importa daqui para
 * não levar o resto do núcleo. O que mais é da assinatura (acesso, textos das telas) fica em `plano.ts`, que reexporta isto.
 */
import type { Cents } from './money';

export type PlanKind = 'individual' | 'familiar';

/** Preço mensal de cada plano, em centavos: R$ 29,90 e R$ 69,90. */
export const PLAN_PRICE_CENTS: Readonly<Record<PlanKind, Cents>> = { individual: 2990, familiar: 6990 };

export const PLAN_NAME: Readonly<Record<PlanKind, string>> = { individual: 'Individual', familiar: 'Família' };
