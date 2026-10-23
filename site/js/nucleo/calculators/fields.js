// Gerado por scripts/gerar-site.js a partir de packages/core/src/calculators/fields.ts. Não edite: rode "node scripts/gerar-site.js".
import { ANTES_FIELDS } from './antes-de-financiar.js';
import { CUSTO_POR_ANO_FIELDS } from './custo-por-ano.js';
import { DIVIDA_FIELDS } from './custo-da-divida.js';
import { DIVIDIR_FIELDS } from './dividir-contas.js';
import { CALC_ERROR_TEXT } from './inputs.js';
import { OBJETIVO_FIELDS } from './juntar-para-objetivo.js';
import { MULTA_FIELDS } from './multa-e-juros.js';
import { COTA_UNICA_FIELDS, PARCELADO_FIELDS } from './parcelado-ou-a-vista.js';
import { PLANO_FIELDS } from './plano-dividas.js';
import { QUITAR_FIELDS } from './quitar-antes.js';
import { RESERVA_FIELDS } from './reserva.js';
export const CALC_FIELDS = {
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
export function calcFields(slug, modo) {
    if (slug === 'parcelado-ou-a-vista' && modo === 'cota-unica')
        return COTA_UNICA_FIELDS;
    return CALC_FIELDS[slug];
}
export function calcErrorText(slug, field, code, modo) {
    const spec = calcFields(slug, modo)[field.replace(/\.\d+$/, '')];
    return spec?.errors?.[code] ?? CALC_ERROR_TEXT[code];
}
