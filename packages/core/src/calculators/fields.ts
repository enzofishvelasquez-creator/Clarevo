import { ANTES_FIELDS } from './antes-de-financiar';
import type { CalcSlug } from './catalog';
import type { CalcFieldSpec } from './common';
import { CUSTO_POR_ANO_FIELDS } from './custo-por-ano';
import { DIVIDA_FIELDS } from './custo-da-divida';
import { DIVIDIR_FIELDS } from './dividir-contas';
import { CALC_ERROR_TEXT, type CalcErrorCode } from './inputs';
import { OBJETIVO_FIELDS } from './juntar-para-objetivo';
import { MULTA_FIELDS } from './multa-e-juros';
import { COTA_UNICA_FIELDS, PARCELADO_FIELDS } from './parcelado-ou-a-vista';
import { PLANO_FIELDS } from './plano-dividas';
import { QUITAR_FIELDS } from './quitar-antes';
import { RESERVA_FIELDS } from './reserva';

/** Campos de cada calculadora (rótulo, dica, tipo, faixa e mensagens), na ordem da tela. */
export const CALC_FIELDS: Record<CalcSlug, Record<string, CalcFieldSpec>> = {
  'antes-de-financiar': ANTES_FIELDS,
  'parcelado-ou-a-vista': PARCELADO_FIELDS,
  'custo-por-ano': CUSTO_POR_ANO_FIELDS,
  'custo-da-divida': DIVIDA_FIELDS,
  'quitar-antes': QUITAR_FIELDS,
  'multa-e-juros': MULTA_FIELDS,
  'plano-dividas': PLANO_FIELDS,
  reserva: RESERVA_FIELDS,
  'juntar-para-objetivo': OBJETIVO_FIELDS,
  'dividir-contas': DIVIDIR_FIELDS,
};

/** Campos da calculadora; "Parcelado ou à vista?" no modo cota-unica usa os rótulos da conta do ano. */
export function calcFields(slug: CalcSlug, modo?: string): Record<string, CalcFieldSpec> {
  if (slug === 'parcelado-ou-a-vista' && modo === 'cota-unica') return COTA_UNICA_FIELDS;
  return CALC_FIELDS[slug];
}

/**
 * Mensagem de um erro devolvido por calcX: a do campo ou, sem ela, a genérica do código. Campos por pessoa
 * ("renda.1", "apelido.0") usam a mensagem de "renda" e "apelido".
 */
export function calcErrorText(slug: CalcSlug, field: string, code: CalcErrorCode, modo?: string): string {
  const spec = calcFields(slug, modo)[field.replace(/\.\d+$/, '')];
  return spec?.errors?.[code] ?? CALC_ERROR_TEXT[code];
}
