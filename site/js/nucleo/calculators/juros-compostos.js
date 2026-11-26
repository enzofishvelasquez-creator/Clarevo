// Gerado por scripts/gerar-site.js a partir de packages/core/src/calculators/juros-compostos.ts. Não edite: rode "node scripts/gerar-site.js".
import { formatBpCompact } from '../learn/format.js';
import { formatBRL } from '../money.js';
import { SIMULATE_MONTHS_MAX, SIMULATE_MONTHS_MIN, SIMULATE_RATE_MAX_BP, SIMULATE_RESULT_MAX_CENTS, SIMULATE_TEXT, monthlyRateText, simulateGrowth } from '../simulate.js';
import { FieldReader, calcNotes, countField, monthsDuration, moneyField, rateField } from './common.js';
import { parseCount, parseMoney, parseOptionalMoney, parsePercentBp } from './inputs.js';
export const JUROS_COMPOSTOS_FIELDS = {
    inicial: moneyField('Quanto já tem para começar', 'quanto já tem para começar', '4.500,00', { optional: true }),
    mensal: moneyField('Quanto vai guardar por mês', 'quanto vai guardar por mês', '500,00', {
        hint: 'Pode ser 0, se você só quer ver o valor inicial render.',
        errors: { zero: 'Informe quanto vai guardar por mês ou quanto já tem para começar.' },
    }),
    taxaAno: rateField('Taxa de rendimento ao ano (%)', 'a taxa ao ano', '10', 0, SIMULATE_RATE_MAX_BP, 'Use de 0% a 30% ao ano.', SIMULATE_TEXT.fields.rateHint),
    meses: countField('Por quantos meses', 'por quantos meses', SIMULATE_MONTHS_MIN, SIMULATE_MONTHS_MAX, 'Use de 1 a 600 meses.', 'De 1 a 600'),
};
export const JUROS_COMPOSTOS_TEXT = {
    highlight: (finalCents, months) => `Estimativa: ${formatBRL(finalCents)} em ${monthsDuration(months)}`,
    contributed: (cents) => `Total guardado: ${formatBRL(cents)}`,
    interest: (cents) => `Juros na estimativa: ${formatBRL(cents)}`,
    note: 'É uma estimativa: na vida real a taxa muda com o tempo, e imposto, taxas e inflação mudam o resultado.',
    hypotheses: (rateBp, monthly) => [
        rateBp === 0 ? 'Taxa de 0% ao ano: sem juros.' : `Taxa de ${formatBpCompact(rateBp)} ao ano (${monthlyRateText(rateBp)} ao mês, taxa equivalente), a mesma em todo o prazo.`,
        ...(monthly > 0 ? ['Valor de cada mês guardado no início do mês, como na Calculadora do Cidadão do Banco Central.'] : []),
        'Valores brutos, sem Imposto de Renda, IOF, taxas nem inflação.',
        'Valores arredondados para baixo, no centavo.',
    ],
};
export function calcJurosCompostos(input) {
    const r = new FieldReader();
    const inicial = r.read('inicial', parseOptionalMoney(input.inicial));
    const mensal = r.read('mensal', parseMoney(input.mensal, { allowZero: true }));
    const taxa = r.read('taxaAno', parsePercentBp(input.taxaAno, { min: 0, max: SIMULATE_RATE_MAX_BP }));
    const meses = r.read('meses', parseCount(input.meses, SIMULATE_MONTHS_MIN, SIMULATE_MONTHS_MAX));
    if (mensal === 0 && inicial !== undefined && (inicial ?? 0) === 0)
        r.fail('mensal', 'zero');
    if (!r.ok || inicial === undefined || mensal === undefined || taxa === undefined || meses === undefined)
        return { ok: false, errors: r.errors };
    const initial = inicial ?? 0;
    let growth;
    try {
        growth = simulateGrowth({ initial, monthly: mensal, months: meses, rateBp: taxa });
    }
    catch {
        growth = { finalCents: Number.POSITIVE_INFINITY, contributedCents: 0, earningsCents: 0, todayValueCents: null, byYear: [] };
    }
    if (!(growth.finalCents <= SIMULATE_RESULT_MAX_CENTS))
        return { ok: false, errors: { meses: 'resultado_alto' } };
    const T = JUROS_COMPOSTOS_TEXT;
    return {
        ok: true,
        result: {
            initialCents: initial,
            monthlyCents: mensal,
            rateBp: taxa,
            months: meses,
            finalCents: growth.finalCents,
            contributedCents: growth.contributedCents,
            interestCents: growth.earningsCents,
            resultLines: [T.highlight(growth.finalCents, meses), T.contributed(growth.contributedCents), T.interest(growth.earningsCents)],
            ...calcNotes(['estimate', T.note]),
            hypotheses: T.hypotheses(taxa, mensal),
        },
    };
}
