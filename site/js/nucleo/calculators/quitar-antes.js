// Gerado por scripts/gerar-site.js a partir de packages/core/src/calculators/quitar-antes.ts. Não edite: rode "node scripts/gerar-site.js".
import { presentValueCents } from '../learn/math.js';
import { formatBRL } from '../money.js';
import { FieldReader, countField, moneyField, rateField } from './common.js';
import { parseCount, parseMoney, parsePercentBp } from './inputs.js';
import { DEBT_RATE_RANGE } from './custo-da-divida.js';
export const QUITAR_ESTIMATE_TEXT = 'Estimativa. O valor oficial é o que a instituição informar; peça o valor atualizado.';
export const QUITAR_FIELDS = {
    parcela: moneyField('Valor da parcela', 'o valor da parcela', '850,00'),
    restantes: countField('Parcelas que faltam', 'quantas parcelas faltam', 1, 480, 'Use de 1 a 480 parcelas.', 'De 1 a 480'),
    taxaMes: rateField('Taxa de juros ao mês do contrato (%)', 'a taxa ao mês do contrato', '1,5', DEBT_RATE_RANGE.min, DEBT_RATE_RANGE.max, 'Use uma taxa de 0,01% a 99,99% ao mês.', 'Está no contrato ou no extrato.'),
    modo: {
        label: 'O que você quer simular?',
        kind: 'opcao',
        default: 'tudo',
        options: [
            { value: 'tudo', label: 'Quitar tudo' },
            { value: 'ultimas', label: 'Adiantar as últimas' },
        ],
        errors: { vazio: 'Escolha entre quitar tudo ou adiantar as últimas.' },
    },
    quantas: (() => {
        const spec = countField('Quantas das últimas', 'quantas parcelas adiantar', 1, 480, 'Use de 1 até o número de parcelas que faltam.');
        return { ...spec, errors: { ...spec.errors, vazio: 'Digite quantas das últimas parcelas adiantar.' } };
    })(),
};
export function calcQuitarAntes(input) {
    const r = new FieldReader();
    const parcela = r.read('parcela', parseMoney(input.parcela));
    const restantes = r.read('restantes', parseCount(input.restantes, 1, 480));
    const bp = r.read('taxaMes', parsePercentBp(input.taxaMes, DEBT_RATE_RANGE));
    const modo = input.modo === 'tudo' || input.modo === 'ultimas' ? input.modo : r.fail('modo', 'vazio');
    const quantas = modo === 'ultimas' ? r.read('quantas', parseCount(input.quantas ?? '', 1, restantes ?? 480)) : undefined;
    if (!r.ok || parcela === undefined || restantes === undefined || bp === undefined || modo === undefined)
        return { ok: false, errors: r.errors };
    const count = modo === 'ultimas' ? quantas : restantes;
    const days = input.prazosEmDias;
    const usesDueDates = days !== undefined && days.length === restantes && days.every((d) => Number.isFinite(d));
    const all = usesDueDates ? days.map((d) => Math.max(0, d) / 30) : Array.from({ length: restantes }, (_, k) => k + 1);
    const times = all.slice(restantes - count);
    const pv = presentValueCents(parcela, bp, times);
    const sum = parcela * count;
    const discount = sum - pv;
    const last = count === 1 ? 'a última' : `as ${count} últimas`;
    const resultLines = modo === 'tudo'
        ? [
            `Valor estimado para quitar hoje: ${formatBRL(pv)}`,
            `Desconto estimado sobre a soma das parcelas: ${formatBRL(discount)}`,
            `Soma ${count === 1 ? 'da parcela' : `das ${count} parcelas`}: ${formatBRL(sum)}`,
        ]
        : [
            `Valor estimado para adiantar ${last} hoje: ${formatBRL(pv)}`,
            `Desconto estimado sobre a soma das parcelas: ${formatBRL(discount)}`,
            `Soma ${count === 1 ? 'da última parcela' : `das ${count} últimas parcelas`}: ${formatBRL(sum)}`,
        ];
    return {
        ok: true,
        result: {
            modo,
            parcelaCents: parcela,
            restantes,
            count,
            taxaBp: bp,
            sumCents: sum,
            presentValueCents: pv,
            discountCents: discount,
            usesDueDates,
            resultLines,
            hypotheses: [
                usesDueDates
                    ? 'Prazos contados pelos vencimentos das parcelas, com 30 dias por mês.'
                    : 'Próxima parcela em 1 mês e as outras a cada mês.',
                'Juros descontados pela taxa ao mês informada, com juros compostos.',
                'Todas as parcelas com o mesmo valor, sem tarifas e IOF.',
            ],
            notes: [QUITAR_ESTIMATE_TEXT],
        },
    };
}
