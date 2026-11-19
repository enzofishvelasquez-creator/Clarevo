// Gerado por scripts/gerar-site.js a partir de packages/core/src/calculators/multa-e-juros.ts. Não edite: rode "node scripts/gerar-site.js".
import { iofCents, lateChargesCents } from '../learn/math.js';
import { formatBRL } from '../money.js';
import { FieldReader, countField, daysCount, moneyField, rateField } from './common.js';
import { parseCount, parseMoney, parsePercentBp } from './inputs.js';
export const FATURA_CYCLE_DAYS = 30;
export const CONSUMER_FINE_CAP_BP = 200;
export const MULTA_RATE_RANGE = { min: 0, max: 2_000 };
export const JUROS_RATE_RANGE = { min: 0, max: 9_999 };
export const MULTA_EXACT_TEXT = 'O valor exato é o do boleto atualizado.';
export const MULTA_CARD_TEXT = 'Para a fatura do cartão, escolha "Fatura do cartão" no começo: a conta soma o rotativo, a mora, a multa e o IOF.';
export const MULTA_CONSUMER_FINE_TEXT = 'A multa informada passa de 2%. Em relações de consumo abrangidas pelo Código de Defesa do Consumidor (art. 52, § 1º), a multa é limitada a 2%; outras obrigações, como aluguel e tributos, têm regras próprias. A conta usa o valor informado, sem dizer se a cobrança vale.';
export const MULTA_FATURA_TEXT = {
    cap: 'Desde 2024, os juros e os encargos do rotativo não podem passar do valor que ficou sem pagar (Lei 14.690/2023). Por isso, a conta para nesse teto.',
    rotativo: 'O rotativo vale só até a próxima fatura. Depois, o banco precisa oferecer o parcelamento do que falta, com juros menores.',
    exact: 'O valor exato é o da próxima fatura.',
    beyondCycle: (dias) => `Você informou ${daysCount(dias)}. O rotativo só vale até a próxima fatura: depois, o que falta passa para o parcelamento ou outra modalidade, com outra taxa e outros pagamentos, e a conta não projeta esse período. Peça o valor atualizado à instituição.`,
    fine: 'A multa informada passa de 2%. Na fatura do cartão, uma relação de consumo, a multa é limitada a 2% (Código de Defesa do Consumidor, art. 52, § 1º). A conta usa o valor informado, fora dessa regra, sem dizer que a cobrança vale.',
};
export const MULTA_FATURA_HYPOTHESES = {
    interest: 'Juros simples, proporcionais aos dias, com 30 dias por mês. A instituição pode capitalizar os juros e usar outras datas e outra taxa: o valor dela pode ser diferente desta estimativa.',
    cycle: 'Primeiro ciclo: a conta vai até a próxima fatura, 30 dias depois do vencimento; parcelamento e renegociação ficam de fora.',
    fine: 'Multa cobrada uma vez sobre o valor que ficou sem pagar.',
    iof: 'IOF estimado numa hipótese simplificada: 0,38% mais 0,0082% por dia sobre o valor que ficou sem pagar, como se ele ficasse parado. Não é o valor legal: a instituição calcula sobre o saldo de cada dia, e o IOF pode já estar na fatura; nesse caso, não some de novo.',
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
    multaPct: rateField('Multa (%)', 'a multa', '2', MULTA_RATE_RANGE.min, MULTA_RATE_RANGE.max, 'Use uma multa de 0% a 20%.', 'Está na fatura. Na fatura do cartão, vai até 2%.'),
    dias: countField('Dias depois do vencimento', 'quantos dias passaram do vencimento', 1, 3_650, 'Use de 1 a 3.650 dias.', 'A conta vai até a próxima fatura, 30 dias depois do vencimento.'),
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
    const aboveConsumerFine = multaBp > CONSUMER_FINE_CAP_BP;
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
            aboveConsumerFine,
            resultLines: [
                `Com estes números, ${daysCount(dias)} depois do vencimento a conta fica em ${formatBRL(totalCents)}.`,
                `Multa: ${formatBRL(fineCents)}`,
                `Juros: ${formatBRL(interestCents)}`,
            ],
            hypotheses: [
                'Multa cobrada uma vez sobre o valor da conta.',
                'Juros simples, proporcionais aos dias, com 30 dias por mês.',
                'Sem correção monetária nem regras próprias, como as de tributos e de alguns contratos.',
            ],
            notes: [...(aboveConsumerFine ? [MULTA_CONSUMER_FINE_TEXT] : []), MULTA_EXACT_TEXT, MULTA_CARD_TEXT],
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
    const cycleDays = Math.min(dias, FATURA_CYCLE_DAYS);
    const beyondCycle = dias > FATURA_CYCLE_DAYS;
    const base = lateChargesCents(valor, multaBp, rotativoBp, cycleDays);
    const fine = Math.min(base.fineCents, valor);
    let rotativo = base.interestCents;
    let mora = lateChargesCents(valor, 0, moraBp, cycleDays).interestCents;
    const room = valor - fine;
    const capped = rotativo + mora > room;
    if (capped) {
        const total = rotativo + mora;
        mora = Math.floor((mora * room) / total);
        rotativo = room - mora;
    }
    const iof = iofCents(valor, cycleDays).totalCents;
    const totalCents = valor + rotativo + mora + fine + iof;
    const aboveConsumerFine = multaBp > CONSUMER_FINE_CAP_BP;
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
            cycleDays,
            beyondCycle,
            aboveConsumerFine,
            resultLines: [
                beyondCycle
                    ? `Com estes números, até a próxima fatura (${daysCount(cycleDays)} depois do vencimento) a fatura fica em ${formatBRL(totalCents)}.`
                    : `Com estes números, ${daysCount(dias)} depois do vencimento a fatura fica em ${formatBRL(totalCents)}.`,
                `Juros do rotativo: ${formatBRL(rotativo)}`,
                `Juros de mora: ${formatBRL(mora)}`,
                `Multa: ${formatBRL(fine)}`,
                `IOF estimado: ${formatBRL(iof)}`,
            ],
            hypotheses: [MULTA_FATURA_HYPOTHESES.interest, MULTA_FATURA_HYPOTHESES.cycle, MULTA_FATURA_HYPOTHESES.fine, MULTA_FATURA_HYPOTHESES.iof],
            notes: [
                ...(beyondCycle ? [MULTA_FATURA_TEXT.beyondCycle(dias)] : []),
                ...(capped ? [MULTA_FATURA_TEXT.cap] : []),
                ...(aboveConsumerFine ? [MULTA_FATURA_TEXT.fine] : []),
                MULTA_FATURA_TEXT.rotativo,
                MULTA_FATURA_TEXT.exact,
            ],
        },
    };
}
