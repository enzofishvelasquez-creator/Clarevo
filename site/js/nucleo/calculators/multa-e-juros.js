// Gerado por scripts/gerar-site.js a partir de packages/core/src/calculators/multa-e-juros.ts. Não edite: rode "node scripts/gerar-site.js".
import { lateChargesCents } from '../learn/math.js';
import { formatBRL } from '../money.js';
import { FieldReader, countField, daysCount, moneyField, rateField } from './common.js';
import { parseCount, parseMoney, parsePercentBp } from './inputs.js';
export const MULTA_RATE_RANGE = { min: 0, max: 2_000 };
export const MULTA_EXACT_TEXT = 'O valor exato é o do boleto atualizado.';
const HINT = 'Está no boleto ou no contrato.';
export const MULTA_FIELDS = {
    valor: moneyField('Valor da conta', 'o valor da conta', '200,00'),
    multaPct: rateField('Multa (%)', 'a multa', '2', MULTA_RATE_RANGE.min, MULTA_RATE_RANGE.max, 'Use uma multa de 0% a 20%.', HINT),
    jurosMesPct: rateField('Juros ao mês (%)', 'os juros ao mês', '1', MULTA_RATE_RANGE.min, MULTA_RATE_RANGE.max, 'Use juros de 0% a 20% ao mês.', HINT),
    dias: countField('Dias depois do vencimento', 'quantos dias passaram do vencimento', 1, 3_650, 'Use de 1 a 3.650 dias.'),
};
export function calcMultaEJuros(input) {
    const r = new FieldReader();
    const valor = r.read('valor', parseMoney(input.valor));
    const multaBp = r.read('multaPct', parsePercentBp(input.multaPct, MULTA_RATE_RANGE));
    const jurosBp = r.read('jurosMesPct', parsePercentBp(input.jurosMesPct, MULTA_RATE_RANGE));
    const dias = r.read('dias', parseCount(input.dias, 1, 3_650));
    if (!r.ok || valor === undefined || multaBp === undefined || jurosBp === undefined || dias === undefined)
        return { ok: false, errors: r.errors };
    const { fineCents, interestCents, totalCents } = lateChargesCents(valor, multaBp, jurosBp, dias);
    return {
        ok: true,
        result: {
            valorCents: valor,
            multaBp,
            jurosBp,
            dias,
            fineCents,
            interestCents,
            totalCents,
            resultLines: [
                `Com estes números, ${daysCount(dias)} depois do vencimento a conta fica em ${formatBRL(totalCents)}.`,
                `Multa: ${formatBRL(fineCents)}`,
                `Juros: ${formatBRL(interestCents)}`,
            ],
            hypotheses: ['Multa cobrada uma vez sobre o valor da conta.', 'Juros simples, proporcionais aos dias, com 30 dias por mês.'],
            notes: [MULTA_EXACT_TEXT],
        },
    };
}
