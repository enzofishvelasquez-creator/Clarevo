// Gerado por scripts/gerar-site.js a partir de packages/core/src/calculators/rendimento-cdi.ts. Não edite: rode "node scripts/gerar-site.js".
import { formatBpCompact, formatInteger, formatRate } from '../learn/format.js';
import { fixedIncomeTaxBp, fixedIncomeTaxCents } from '../learn/math.js';
import { formatBRL } from '../money.js';
import { FieldReader, calcNotes, countField, monthsDuration, moneyField, rateField } from './common.js';
import { parseCount, parseMoney, parsePercentBp } from './inputs.js';
export const RENDIMENTO_CDI_PERCENT_MIN_BP = 100;
export const RENDIMENTO_CDI_PERCENT_MAX_BP = 30_000;
export const RENDIMENTO_CDI_RATE_MAX_BP = 3_000;
export const RENDIMENTO_CDI_MONTHS_MAX = 600;
export const RENDIMENTO_CDI_BUSINESS_DAYS_YEAR = 252;
export const RENDIMENTO_CDI_BUSINESS_DAYS_MONTH = 21;
export const RENDIMENTO_CDI_RESULT_MAX_CENTS = 99_999_999_999_999;
export const RENDIMENTO_CDI_FIELDS = {
    valor: moneyField('Quanto vai aplicar', 'quanto vai aplicar', '10.000,00'),
    percentual: rateField('Percentual do CDI (%)', 'o percentual do CDI', '100', RENDIMENTO_CDI_PERCENT_MIN_BP, RENDIMENTO_CDI_PERCENT_MAX_BP, 'Use de 1% a 300% do CDI.', 'Quanto do CDI a aplicação rende, como 100 para 100% do CDI.'),
    cdiAno: rateField('CDI ao ano (%)', 'o CDI ao ano', '10', 0, RENDIMENTO_CDI_RATE_MAX_BP, 'Use de 0% a 30% ao ano.', 'Você informa o CDI que quer testar. A Clarevo não sugere taxas, produtos nem instituições.'),
    meses: countField('Por quantos meses', 'por quantos meses', 1, RENDIMENTO_CDI_MONTHS_MAX, 'Use de 1 a 600 meses.', 'De 1 a 600'),
    imposto: {
        label: 'Imposto de Renda',
        kind: 'opcao',
        default: 'regressivo',
        options: [
            { value: 'regressivo', label: 'Tabela regressiva' },
            { value: 'isento', label: 'Isento' },
        ],
        errors: { vazio: 'Escolha se a aplicação paga Imposto de Renda.' },
    },
};
export function regressiveTableText() {
    const a = (days) => formatBpCompact(fixedIncomeTaxBp(days));
    return `${a(180)} até 180 dias, ${a(360)} de 181 a 360, ${a(720)} de 361 a 720 e ${a(721)} acima de 720 dias`;
}
export const RENDIMENTO_CDI_TEXT = {
    highlightTaxed: (netCents, months) => `Estimativa: ${formatBRL(netCents)} ao fim de ${monthsDuration(months)}, já sem o Imposto de Renda`,
    highlightExempt: (grossCents, months) => `Estimativa: ${formatBRL(grossCents)} ao fim de ${monthsDuration(months)}`,
    gross: (grossCents, yieldCents, share) => `Valor bruto: ${formatBRL(grossCents)} (rendimento de ${formatBRL(yieldCents)}, ${share} no período)`,
    yieldExempt: (yieldCents, share) => `Rendimento: ${formatBRL(yieldCents)} (${share} no período)`,
    tax: (taxCents, rateBp, days) => `Imposto de Renda estimado: ${formatBRL(taxCents)} (${formatBpCompact(rateBp)} do rendimento, para cerca de ${formatInteger(days)} dias)`,
    netYield: (yieldCents, share) => `Rendimento líquido: ${formatBRL(yieldCents)} (${share} no período)`,
    noteTable: () => `Na tabela regressiva, a alíquota cai com o prazo: ${regressiveTableText()}.`,
    noteCdi: 'O CDI acompanha a Selic e muda com o tempo: o resultado de verdade pode ser maior ou menor que esta estimativa.',
    hypotheses: (cdiBp, percentBp, days, imposto) => [
        `CDI de ${formatBpCompact(cdiBp)} ao ano, o mesmo em todo o prazo.`,
        `A aplicação rende ${formatBpCompact(percentBp)} do CDI em cada dia útil, com ${RENDIMENTO_CDI_BUSINESS_DAYS_MONTH} dias úteis por mês (${RENDIMENTO_CDI_BUSINESS_DAYS_YEAR} por ano).`,
        `Prazo de cerca de ${formatInteger(days)} dias corridos, sem resgatar antes. Resgates com menos de 30 dias também pagam IOF.`,
        imposto === 'regressivo'
            ? 'Imposto de Renda pela tabela regressiva da renda fixa (Lei 11.033/2004), só sobre o rendimento, no resgate.'
            : 'Sem Imposto de Renda, como nas aplicações que a lei isenta para pessoa física.',
        'Sem taxas, custódia nem come-cotas. Valores no centavo.',
    ],
};
function shareText(part, whole) {
    return formatRate(part / whole);
}
export function calcRendimentoCdi(input) {
    const r = new FieldReader();
    const valor = r.read('valor', parseMoney(input.valor));
    const percentual = r.read('percentual', parsePercentBp(input.percentual, { min: RENDIMENTO_CDI_PERCENT_MIN_BP, max: RENDIMENTO_CDI_PERCENT_MAX_BP }));
    const cdi = r.read('cdiAno', parsePercentBp(input.cdiAno, { min: 0, max: RENDIMENTO_CDI_RATE_MAX_BP }));
    const meses = r.read('meses', parseCount(input.meses, 1, RENDIMENTO_CDI_MONTHS_MAX));
    const imposto = input.imposto === 'regressivo' || input.imposto === 'isento' ? input.imposto : r.fail('imposto', 'vazio');
    if (!r.ok || valor === undefined || percentual === undefined || cdi === undefined || meses === undefined || imposto === undefined)
        return { ok: false, errors: r.errors };
    const businessDays = meses * RENDIMENTO_CDI_BUSINESS_DAYS_MONTH;
    const calendarDays = Math.round((meses * 365) / 12);
    const cdiDaily = Math.expm1(Math.log1p(cdi / 10_000) / RENDIMENTO_CDI_BUSINESS_DAYS_YEAR);
    const daily = (cdiDaily * percentual) / 10_000;
    const grossRaw = valor * Math.exp(businessDays * Math.log1p(daily));
    if (!Number.isFinite(grossRaw) || grossRaw > RENDIMENTO_CDI_RESULT_MAX_CENTS)
        return { ok: false, errors: { meses: 'resultado_alto' } };
    const grossCents = Math.max(valor, Math.floor(grossRaw + 1e-6));
    const grossYieldCents = grossCents - valor;
    const taxRateBp = imposto === 'regressivo' ? fixedIncomeTaxBp(calendarDays) : null;
    const taxCents = imposto === 'regressivo' ? fixedIncomeTaxCents(grossYieldCents, calendarDays) : 0;
    const netCents = grossCents - taxCents;
    const netYieldCents = grossYieldCents - taxCents;
    const T = RENDIMENTO_CDI_TEXT;
    const resultLines = imposto === 'regressivo'
        ? [
            T.highlightTaxed(netCents, meses),
            T.gross(grossCents, grossYieldCents, shareText(grossYieldCents, valor)),
            T.tax(taxCents, taxRateBp, calendarDays),
            T.netYield(netYieldCents, shareText(netYieldCents, valor)),
        ]
        : [T.highlightExempt(grossCents, meses), T.yieldExempt(grossYieldCents, shareText(grossYieldCents, valor))];
    return {
        ok: true,
        result: {
            valueCents: valor,
            percentBp: percentual,
            cdiBp: cdi,
            months: meses,
            businessDays,
            calendarDays,
            imposto,
            grossCents,
            grossYieldCents,
            taxRateBp,
            taxCents,
            netCents,
            netYieldCents,
            resultLines,
            ...calcNotes(imposto === 'regressivo' && ['info', T.noteTable()], ['estimate', T.noteCdi]),
            hypotheses: T.hypotheses(cdi, percentual, calendarDays, imposto),
        },
    };
}
