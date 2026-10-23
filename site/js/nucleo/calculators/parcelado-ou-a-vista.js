// Gerado por scripts/gerar-site.js a partir de packages/core/src/calculators/parcelado-ou-a-vista.ts. Não edite: rode "node scripts/gerar-site.js".
import { equivalentAnnualRate, impliedMonthlyRate } from '../learn/math.js';
import { formatBRL } from '../money.js';
import { FieldReader, countField, moneyField, rateText } from './common.js';
import { parseCount, parseMoney } from './inputs.js';
export const PARCELADO_RANGE = { compra: { min: 2, max: 480 }, 'cota-unica': { min: 2, max: 12 } };
export const PARCELADO_FIELDS = {
    aVista: moneyField('Preço à vista', 'o preço à vista', '1.080,00'),
    parcelas: countField('Número de parcelas', 'o número de parcelas', 2, 480, 'Use de 2 a 480 parcelas.', 'De 2 a 480'),
    parcela: moneyField('Valor de cada parcela', 'o valor de cada parcela', '120,00'),
    primeiraNaCompra: {
        label: 'A primeira parcela é paga na compra?',
        kind: 'sim_nao',
        default: false,
        options: [
            { value: 'nao', label: 'Não' },
            { value: 'sim', label: 'Sim' },
        ],
    },
    formaPagamento: {
        label: 'Como vai pagar as parcelas?',
        kind: 'opcao',
        optional: true,
        options: [
            { value: 'boleto', label: 'Boleto ou carnê' },
            { value: 'debito', label: 'Débito ou Pix' },
            { value: 'cartao', label: 'Cartão de crédito' },
        ],
    },
};
export const COTA_UNICA_FIELDS = {
    aVista: moneyField('Valor da cota única', 'o valor da cota única', '2.400,00'),
    parcelas: countField('Número de parcelas', 'o número de parcelas', 2, 12, 'Use de 2 a 12 parcelas.', 'De 2 a 12'),
    parcela: moneyField('Valor de cada parcela', 'o valor de cada parcela', '480,00'),
    primeiraNaCompra: {
        label: 'A primeira parcela vence junto com a cota única?',
        kind: 'sim_nao',
        default: true,
        options: [
            { value: 'nao', label: 'Não' },
            { value: 'sim', label: 'Sim' },
        ],
    },
};
export function calcParceladoOuAVista(input) {
    const modo = input.modo === 'cota-unica' ? 'cota-unica' : 'compra';
    const cota = modo === 'cota-unica';
    const range = PARCELADO_RANGE[modo];
    const r = new FieldReader();
    const aVista = r.read('aVista', parseMoney(input.aVista));
    const n = r.read('parcelas', parseCount(input.parcelas, range.min, range.max));
    const parcela = r.read('parcela', parseMoney(input.parcela));
    if (!r.ok || aVista === undefined || n === undefined || parcela === undefined)
        return { ok: false, errors: r.errors };
    const first = input.primeiraNaCompra;
    const totalCents = n * parcela;
    const differenceCents = totalCents - aVista;
    const financedCents = first ? aVista - parcela : aVista;
    const financedInstallments = first ? n - 1 : n;
    const noInterest = differenceCents <= 0;
    const monthlyRate = noInterest || financedCents <= 0 ? null : impliedMonthlyRate(financedCents, parcela, financedInstallments);
    const annualRate = monthlyRate === null ? null : equivalentAnnualRate(monthlyRate);
    const base = cota ? 'a cota única' : 'o preço à vista';
    const resultLines = [];
    if (noInterest) {
        resultLines.push(`Não há juros embutidos: o total parcelado é igual ou menor que ${base}.`);
    }
    else {
        resultLines.push(cota
            ? `Com estes números, parcelar custa ${formatBRL(differenceCents)} a mais que a cota única.`
            : `Com estes números, o parcelado custa ${formatBRL(differenceCents)} a mais.`);
        resultLines.push(monthlyRate !== null && annualRate !== null
            ? `Isso equivale a juros de ${rateText(monthlyRate)} ao mês (${rateText(annualRate)} ao ano).`
            : `Como a primeira parcela já cobre ${base}, não há uma taxa ao mês para mostrar.`);
    }
    resultLines.push(`Total parcelado: ${formatBRL(totalCents)} (${n} × ${formatBRL(parcela)}).`);
    const hypotheses = [
        cota
            ? first
                ? 'Primeira parcela junto com a cota única e as outras a cada mês.'
                : 'Primeira parcela 1 mês depois da cota única e as outras a cada mês.'
            : first
                ? 'Primeira parcela paga na compra e as outras a cada mês.'
                : 'Primeira parcela 1 mês depois da compra e as outras a cada mês.',
        ...(monthlyRate !== null ? [`Taxa que iguala as parcelas ${cota ? 'à cota única' : 'ao preço à vista'}, com juros compostos.`] : []),
    ];
    const action = cota ? null : input.formaPagamento === 'cartao' ? 'aviso_cartao' : 'anotar_parcelamento';
    return {
        ok: true,
        result: {
            modo,
            parcelas: n,
            parcelaCents: parcela,
            aVistaCents: aVista,
            totalCents,
            differenceCents,
            financedCents,
            financedInstallments,
            noInterest,
            monthlyRate,
            annualRate,
            action,
            noteParams: action === 'anotar_parcelamento' ? { tipo: 'parcelada', natureza: 'compra_parcelada', parcelas: n, valor: parcela } : null,
            resultLines,
            hypotheses,
            notes: [],
        },
    };
}
