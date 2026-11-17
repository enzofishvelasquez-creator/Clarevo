import { SIMULATE_DISCLAIMER } from '../simulate';
import type { CalcGroup } from './catalog';
import type { CalcFieldSpec } from './common';
import { JUROS_COMPOSTOS_FIELDS } from './juros-compostos';
import { RENDIMENTO_CDI_FIELDS } from './rendimento-cdi';

/**
 * Calculadoras que, por enquanto, só o site mostra (D-106, `docs/22_SITE.md`, seção 16). Ficam fora de `CALCULATORS` (a lista da tela
 * "Calculadoras" do app), para o app continuar igual até ganhar a tela delas; o site junta as duas listas, no grupo de cada uma. O
 * desenho é o das outras: campos (`CalcFieldSpec`), uma função `calcX` que devolve `CalcOutcome` com as linhas do resultado, os avisos e
 * as hipóteses, e o aviso fixo de baixo.
 */
export type SiteCalcSlug = 'juros-compostos' | 'rendimento-cdi';

export interface SiteCalcInfo {
  slug: SiteCalcSlug;
  title: string;
  subtitle: string;
  group: CalcGroup;
  /** O aviso fixo da calculadora: o do simulador, porque as duas falam de rendimento e não de crédito. */
  disclaimer: string;
}

export const SITE_CALCULATORS: readonly SiteCalcInfo[] = [
  { slug: 'juros-compostos', title: 'Juros compostos', subtitle: 'Quanto um valor guardado pode virar com o tempo', group: 'guardar', disclaimer: SIMULATE_DISCLAIMER },
  { slug: 'rendimento-cdi', title: 'Quanto rende a um percentual do CDI?', subtitle: 'Bruto, Imposto de Renda e líquido, numa estimativa', group: 'guardar', disclaimer: SIMULATE_DISCLAIMER },
];

/** Os campos de cada uma (rótulo, dica, tipo, faixa e mensagens), como `CALC_FIELDS` faz para as do app. */
export const SITE_CALC_FIELDS: Record<SiteCalcSlug, Record<string, CalcFieldSpec>> = {
  'juros-compostos': JUROS_COMPOSTOS_FIELDS,
  'rendimento-cdi': RENDIMENTO_CDI_FIELDS,
};

export function isSiteCalcSlug(value: unknown): value is SiteCalcSlug {
  return typeof value === 'string' && SITE_CALCULATORS.some((c) => c.slug === value);
}
