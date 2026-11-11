// Gerado por scripts/gerar-site.js a partir de packages/core/src/calculators/multa-e-juros.ts. Não edite: rode "node scripts/gerar-site.js".
import { iofCents, lateChargesCents } from '../learn/math.js';
import { formatBRL } from '../money.js';
import { FieldReader, countField, daysCount, moneyField, rateField } from './common.js';
import { parseCount, parseMoney, parsePercentBp } from './inputs.js';
export const MULTA_RATE_RANGE = { min: 0, max: 2_000 };
export const JUROS_RATE_RANGE = { min: 0, max: 9_999 };
export const MULTA_EXACT_TEXT = 'O valor exato é o do boleto atualizado.';
export const MULTA_CARD_TEXT = 'Para a fatura do cartão, escolha "Fatura do cartão" no começo: a conta soma o rotativo, a mora, a multa e o IOF.';
export const MULTA_FATURA_TEXT = {
    cap: 'Desde 2024, os juros e os encargos do rotativo não podem passar do valor que ficou sem pagar (Lei 14.690/2023). Por isso, a conta para nesse teto.',
    rotativo: 'O rotativo vale só até a próxima fatura. Depois, o banco precisa oferecer o parcelamento do que falta, com juros menores.',
    exact: 'O valor exato é o da próxima fatura.',
};
const HINT = 'Está no boleto ou no contrato.';
export const MULTA_FIELDS = {
    modo: {
        label: 'Que conta passou do vencimento?',
        kind: 'opcao',
        default: 'conta',
        options: [
            { value: 'conta', label: 'Conta ou boleto' },
            { value: 'fatura', label: 'Fatura do cartão' },
        ],
        errors: { vazio: 'Escolha que conta passou do vencimento.' },
    },
    valor: moneyField('Valor da conta', 'o valor da conta', '200,00'),
    multaPct: rateField('Multa (%)', 'a multa', '2', MULTA_RATE_RANGE.min, MULTA_RATE_RANGE.max, 'Use uma multa de 0% a 20%.', HINT),
    jurosMesPct: rateField('Juros ao mês (%)', 'os juros ao mês', '1', JUROS_RATE_RANGE.min, JUROS_RATE_RANGE.max, 'Use juros de 0% a 99,99% ao mês.', HINT),
    dias: countField('Dias depois do vencimento', 'quantos dias passaram do vencimento', 1, 3_650, 'Use de 1 a 3.650 dias.'),
    rotativoPct: rateField('Juros do rotativo ao mês (%)', 'os juros do rotativo', '15', JUROS_RATE_RANGE.min, JUROS_RATE_RANGE.max, 'Use juros de 0% a 99,99% ao mês.', 'Está na fatura, em "juros do rotativo" ou "crédito rotativo".'),
    moraPct: rateField('Juros de mora ao mês (%)', 'os juros de mora', '1', MULTA_RATE_RANGE.min, MULTA_RATE_RANGE.max, 'Use juros de mora de 0% a 20% ao mês.', 'Está na fatura. Em geral, 1% ao mês.'),
};
export const MULTA_FATURA_FIELDS = {
    ...MULTA_FIELDS,
    valor: moneyField('Valor que ficou sem pagar', 'o valor que ficou sem pagar', '1.000,00', { hint: 'O total da fatura menos o que você pagou.' }),
    multaPct: rateField('Multa (%)', 'a multa', '2', MULTA_RATE_RANGE.min, MULTA_RATE_RANGE.max, 'Use uma multa de 0% a 20%.', 'Está na fatura. Em geral, 2%.'),
};
export function calcMultaEJuros(input) {
    if (input.modo === 'fatura')
        return calcFatura(input);
    const r = new FieldReader();
    const valor = r.read('valor', parseMoney(input.valor));
    const multaBp = r.read('multaPct', parsePercentBp(input.multaPct, MULTA_RATE_RANGE));
    const jurosBp = r.read('jurosMesPct', parsePercentBp(input.jurosMesPct, JUROS_RATE_RANGE));
    const dias = r.read('dias', parseCount(input.dias, 1, 3_650));
    if (!r.ok || valor === undefined || multaBp === undefined || jurosBp === undefined || dias === undefined)
        return { ok: false, errors: r.errors };
    const { fineCents, interestCents, totalCents } = lateChargesCents(valor, multaBp, jurosBp, dias);
    return {
        ok: true,
        result: {
            modo: 'conta',
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
            notes: [MULTA_EXACT_TEXT, MULTA_CARD_TEXT],
        },
    };
}
function calcFatura(input) {
    const r = new FieldReader();
    const valor = r.read('valor', parseMoney(input.valor));
    const rotativoBp = r.read('rotativoPct', parsePercentBp(input.rotativoPct ?? '', JUROS_RATE_RANGE));
    const moraBp = r.read('moraPct', parsePercentBp(input.moraPct ?? '', MULTA_RATE_RANGE));
    const multaBp = r.read('multaPct', parsePercentBp(input.multaPct, MULTA_RATE_RANGE));
    const dias = r.read('dias', parseCount(input.dias, 1, 3_650));
    if (!r.ok || valor === undefined || rotativoBp === undefined || moraBp === undefined || multaBp === undefined || dias === undefined)
        return { ok: false, errors: r.errors };
    const base = lateChargesCents(valor, multaBp, rotativoBp, dias);
    const fine = Math.min(base.fineCents, valor);
    let rotativo = base.interestCents;
    let mora = lateChargesCents(valor, 0, moraBp, dias).interestCents;
    const room = valor - fine;
    const capped = rotativo + mora > room;
    if (capped) {
        const total = rotativo + mora;
        mora = Math.floor((mora * room) / total);
        rotativo = room - mora;
    }
    const iof = iofCents(valor, dias).totalCents;
    const totalCents = valor + rotativo + mora + fine + iof;
    return {
        ok: true,
        result: {
            modo: 'fatura',
            valorCents: valor,
            multaBp,
            jurosBp: rotativoBp + moraBp,
            dias,
            fineCents: fine,
            interestCents: rotativo + mora,
            totalCents,
            rotativoCents: rotativo,
            moraCents: mora,
            iofCents: iof,
            capped,
            resultLines: [
                `Com estes números, ${daysCount(dias)} depois do vencimento a fatura fica em ${formatBRL(totalCents)}.`,
                `Juros do rotativo: ${formatBRL(rotativo)}`,
                `Juros de mora: ${formatBRL(mora)}`,
                `Multa: ${formatBRL(fine)}`,
                `IOF estimado: ${formatBRL(iof)}`,
            ],
            hypotheses: [
                'Juros simples, proporcionais aos dias, com 30 dias por mês. O banco costuma cobrar juros sobre juros, então a fatura pode vir um pouco maior.',
                'Multa cobrada uma vez sobre o valor que ficou sem pagar.',
                'IOF de pessoa física: 0,38% mais 0,0082% por dia, até 365 dias.',
            ],
            notes: [...(capped ? [MULTA_FATURA_TEXT.cap] : []), MULTA_FATURA_TEXT.rotativo, MULTA_FATURA_TEXT.exact],
        },
    };
}
