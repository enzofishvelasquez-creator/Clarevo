import { calcLinkParams, type CalcLinkValues, type CalcSlug } from '@clarevo/core';
import { router } from 'expo-router';
import { BadgePercent, CalendarRange, CalendarX2, ListOrdered, Percent, ShoppingBag, Target, Umbrella, Users, type LucideIcon } from 'lucide-react-native';

/** Ícone de cada calculadora na lista e nas portas (Metas). Só ilustra: o nome vem sempre escrito. */
export const CALC_ICONS: Record<CalcSlug, LucideIcon> = {
  'parcelado-ou-a-vista': ShoppingBag,
  'custo-por-ano': CalendarRange,
  'custo-da-divida': Percent,
  'quitar-antes': BadgePercent,
  'multa-e-juros': CalendarX2,
  'plano-dividas': ListOrdered,
  reserva: Umbrella,
  'juntar-para-objetivo': Target,
  'dividir-contas': Users,
};

/**
 * Abre uma calculadora, preenchida pelos valores do contexto (centavos, contagens e prazos; a taxa nunca vem no link).
 * Ex.: openCalc('multa-e-juros', multaLink(conta, hoje)!). Os parâmetros são lidos de volta por calcPrefill.
 */
export function openCalc<S extends CalcSlug>(slug: S, values: CalcLinkValues<S> = {} as CalcLinkValues<S>) {
  router.push({ pathname: '/calcular/[slug]', params: { slug, ...calcLinkParams(slug, values) } });
}
