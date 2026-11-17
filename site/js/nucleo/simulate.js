// Gerado por scripts/gerar-site.js a partir de packages/core/src/simulate.ts. Não edite: rode "node scripts/gerar-site.js".
import { monthsCount } from './calculators/common.js';
import { parseCount, parseMoney, parseOptionalMoney, parsePercentBp } from './calculators/inputs.js';
import { addMonths, formatMonthInputBR, monthOf } from './dates.js';
import { formatBp, formatBpCompact } from './learn/format.js';
import { equivalentMonthlyBp, monthlyShareCents, monthsToReach } from './learn/math.js';
import { MAX_RECORD_CENTS, centsToInput, formatBRL } from './money.js';
export const SIMULATION_MODES = ['quanto-guardar', 'em-quanto-tempo', 'quanto-ter'];
export const SIMULATE_RATE_MAX_BP = 3_000;
export const SIMULATE_MONTHS_MIN = 1;
export const SIMULATE_MONTHS_MAX = 600;
export const SIMULATE_RESULT_MAX_CENTS = 99_999_999_999_999;
export const SIMULATE_TOPICS = {
    rate: 'taxa-mes-ano',
    inflation: 'inflacao-ipca',
    result: 'juros-simples-compostos',
    reading: 'simulacao',
};
function checkInt(value, name, min, max) {
    if (!Number.isSafeInteger(value) || value < min || value > max)
        throw new RangeError(`${name} inválido: ${value}`);
}
function checkRate(bp, name) {
    checkInt(bp, name, 0, SIMULATE_RATE_MAX_BP);
}
function logMonthly(bp) {
    return Math.log1p(bp / 10_000) / 12;
}
export function parseRateBp(text) {
    const parsed = parsePercentBp(text, { min: 0, max: SIMULATE_RATE_MAX_BP });
    return parsed.ok ? parsed.value : null;
}
export function monthlyRate(rateBp) {
    checkRate(rateBp, 'taxa');
    return rateBp === 0 ? 0 : Math.expm1(logMonthly(rateBp));
}
export function monthlyRateText(rateBp) {
    checkRate(rateBp, 'taxa');
    const bp = equivalentMonthlyBp(rateBp);
    return bp === 0 && rateBp > 0 ? 'menos de 0,01%' : formatBp(bp);
}
function depositsFactor(months, l) {
    return (Math.expm1(months * l) / Math.expm1(l)) * Math.exp(l);
}
function rawFinal(initial, monthly, months, rateBp) {
    const contributed = initial + monthly * months;
    if (rateBp === 0)
        return contributed;
    const l = logMonthly(rateBp);
    const value = Math.floor(initial * Math.exp(months * l) + monthly * depositsFactor(months, l));
    return Math.max(value, contributed);
}
function checkAmounts(initial, monthly, months, rateBp, minMonths) {
    checkInt(initial, 'valor inicial', 0, MAX_RECORD_CENTS);
    checkInt(monthly, 'valor por mês', 0, MAX_RECORD_CENTS);
    checkInt(months, 'prazo', minMonths, SIMULATE_MONTHS_MAX);
    checkRate(rateBp, 'taxa');
}
function safe(value) {
    if (value > Number.MAX_SAFE_INTEGER)
        throw new RangeError('resultado grande demais');
    return value;
}
export function finalValueCents(initial, monthly, months, rateBp) {
    checkAmounts(initial, monthly, months, rateBp, 0);
    return safe(rawFinal(initial, monthly, months, rateBp));
}
export function todayValueCents(valueCents, months, inflationBp) {
    checkInt(valueCents, 'valor', 0, Number.MAX_SAFE_INTEGER);
    checkInt(months, 'prazo', 0, SIMULATE_MONTHS_MAX);
    checkRate(inflationBp, 'inflação');
    if (inflationBp === 0 || months === 0)
        return valueCents;
    return Math.floor(valueCents / Math.exp(months * logMonthly(inflationBp)));
}
export function adjustedTargetCents(targetCents, months, inflationBp) {
    checkInt(targetCents, 'alvo', 0, Number.MAX_SAFE_INTEGER);
    checkInt(months, 'prazo', 0, SIMULATE_MONTHS_MAX);
    checkRate(inflationBp, 'inflação');
    if (inflationBp === 0 || months === 0)
        return targetCents;
    return Math.floor(targetCents * Math.exp(months * logMonthly(inflationBp)) + 0.5);
}
export function monthsForAdjustedTarget(target, initial, monthly, rateBp, inflationBp) {
    checkInt(target, 'alvo', 1, MAX_RECORD_CENTS);
    checkAmounts(initial, monthly, SIMULATE_MONTHS_MIN, rateBp, SIMULATE_MONTHS_MIN);
    checkRate(inflationBp, 'inflação');
    if (initial >= target)
        return 0;
    if (inflationBp === 0)
        return monthsForTarget(target, initial, monthly, rateBp);
    for (let n = 1; n <= SIMULATE_MONTHS_MAX; n++)
        if (rawFinal(initial, monthly, n, rateBp) >= adjustedTargetCents(target, n, inflationBp))
            return n;
    return null;
}
export function simulateGrowth(input) {
    const { initial, monthly, months, rateBp } = input;
    const inflationBp = input.inflationBp ?? null;
    checkAmounts(initial, monthly, months, rateBp, SIMULATE_MONTHS_MIN);
    if (inflationBp !== null)
        checkRate(inflationBp, 'inflação');
    const at = (n) => {
        const finalCents = safe(rawFinal(initial, monthly, n, rateBp));
        const contributedCents = initial + monthly * n;
        return {
            finalCents,
            contributedCents,
            earningsCents: finalCents - contributedCents,
            todayValueCents: inflationBp === null ? null : todayValueCents(finalCents, n, inflationBp),
        };
    };
    const byYear = [];
    for (let year = 1; (year - 1) * 12 < months; year++) {
        const n = Math.min(year * 12, months);
        byYear.push({ year, months: n, partial: n % 12 !== 0, ...at(n) });
    }
    return { ...at(months), byYear };
}
export function monthlyForTarget(target, initial, months, rateBp) {
    checkInt(target, 'alvo', 1, MAX_RECORD_CENTS);
    checkAmounts(initial, 0, months, rateBp, SIMULATE_MONTHS_MIN);
    if (initial >= target)
        return 0;
    if (rateBp === 0)
        return monthlyShareCents(target - initial, months);
    const l = logMonthly(rateBp);
    let m = Math.max(0, Math.ceil((target - initial * Math.exp(months * l)) / depositsFactor(months, l)));
    while (m > 0 && rawFinal(initial, m - 1, months, rateBp) >= target)
        m -= 1;
    while (rawFinal(initial, m, months, rateBp) < target)
        m += 1;
    return m;
}
export function monthsForTarget(target, initial, monthly, rateBp) {
    checkInt(target, 'alvo', 1, MAX_RECORD_CENTS);
    checkAmounts(initial, monthly, SIMULATE_MONTHS_MIN, rateBp, SIMULATE_MONTHS_MIN);
    if (initial >= target)
        return 0;
    if (rateBp === 0) {
        if (monthly === 0)
            return null;
        const n = monthsToReach(target - initial, monthly);
        return n <= SIMULATE_MONTHS_MAX ? n : null;
    }
    for (let n = 1; n <= SIMULATE_MONTHS_MAX; n++)
        if (rawFinal(initial, monthly, n, rateBp) >= target)
            return n;
    return null;
}
export function simulationInflationChoices(mode) {
    return mode === 'quanto-ter' ? ['nenhuma', 'mostrar'] : ['nenhuma', 'mostrar', 'corrigir'];
}
export function simulationInflationChoice(draft) {
    if (!draft.inflationOn)
        return 'nenhuma';
    return draft.adjustTarget === true && draft.mode !== 'quanto-ter' ? 'corrigir' : 'mostrar';
}
export function simulationInflationHint(mode, choice) {
    const F = SIMULATE_TEXT.fields;
    if (choice === 'mostrar' && mode === 'quanto-ter')
        return F.inflationShowHintTotal;
    if (choice === 'corrigir' && mode === 'em-quanto-tempo')
        return F.inflationAdjustHintTime;
    return F.inflationChoiceHints[choice];
}
export function simulationInflationPatch(choice) {
    return { inflationOn: choice !== 'nenhuma', adjustTarget: choice === 'corrigir' };
}
export const SIMULATION_FIELD_ORDER = ['mode', 'targetText', 'initialText', 'monthsText', 'monthlyText', 'rateText', 'inflationText'];
export const SIMULATION_MODE_FIELDS = {
    'quanto-guardar': ['targetText', 'initialText', 'monthsText', 'rateText', 'inflationText'],
    'em-quanto-tempo': ['targetText', 'initialText', 'monthlyText', 'rateText', 'inflationText'],
    'quanto-ter': ['initialText', 'monthsText', 'monthlyText', 'rateText', 'inflationText'],
};
export function emptySimulationDraft(mode = null) {
    return { mode, targetText: '', initialText: '', monthsText: '', monthlyText: '', rateText: '', inflationOn: false, inflationText: '' };
}
export function validateSimulationDraft(draft) {
    const codes = {};
    const read = (field, parsed) => {
        if (parsed.ok)
            return parsed.value;
        codes[field] ??= parsed.error;
        return undefined;
    };
    const mode = draft.mode !== null && SIMULATION_MODES.includes(draft.mode) ? draft.mode : null;
    if (mode === null)
        codes.mode = 'vazio';
    const uses = (field) => mode !== null && SIMULATION_MODE_FIELDS[mode].includes(field);
    const target = uses('targetText') ? read('targetText', parseMoney(draft.targetText)) : null;
    const initial = read('initialText', parseOptionalMoney(draft.initialText));
    const months = uses('monthsText') ? read('monthsText', parseCount(draft.monthsText, SIMULATE_MONTHS_MIN, SIMULATE_MONTHS_MAX)) : null;
    let monthly = null;
    if (mode === 'em-quanto-tempo')
        monthly = read('monthlyText', parseMoney(draft.monthlyText));
    else if (mode === 'quanto-ter') {
        monthly = read('monthlyText', parseMoney(draft.monthlyText, { allowZero: true }));
        if (monthly === 0 && initial !== undefined && (initial ?? 0) === 0)
            codes.monthlyText ??= 'zero';
    }
    const rate = read('rateText', parsePercentBp(draft.rateText, { min: 0, max: SIMULATE_RATE_MAX_BP }));
    const inflation = draft.inflationOn ? read('inflationText', parsePercentBp(draft.inflationText, { min: 0, max: SIMULATE_RATE_MAX_BP })) : null;
    const adjust = draft.inflationOn && draft.adjustTarget === true && mode !== 'quanto-ter';
    if (Object.keys(codes).length > 0 || mode === null || target === undefined || initial === undefined || months === undefined || monthly === undefined || rate === undefined || inflation === undefined) {
        return { ok: false, codes, errors: simulationErrors(codes) };
    }
    const input = {
        mode,
        targetCents: target,
        initialCents: initial ?? 0,
        months,
        monthlyCents: monthly,
        rateBp: rate,
        inflationBp: inflation,
        ...(adjust ? { adjustTarget: true } : {}),
    };
    if (resultTooHigh(input)) {
        const field = mode === 'em-quanto-tempo' ? 'monthlyText' : 'monthsText';
        codes[field] = 'resultado_alto';
        return { ok: false, codes, errors: simulationErrors(codes) };
    }
    return { ok: true, input, result: simulate(input) };
}
function resultTooHigh(input) {
    if (adjusting(input) && input.mode === 'quanto-guardar' && adjustedTargetCents(input.targetCents, input.months, input.inflationBp) > MAX_RECORD_CENTS)
        return true;
    const plan = planOf(input);
    return plan !== null && rawFinal(input.initialCents, plan.monthly, plan.months, input.rateBp) > SIMULATE_RESULT_MAX_CENTS;
}
function planOf(input) {
    const { mode, targetCents, initialCents, rateBp } = input;
    if (mode === 'quanto-ter')
        return { monthly: input.monthlyCents, months: input.months };
    if (initialCents >= targetCents)
        return null;
    if (mode === 'quanto-guardar')
        return { monthly: monthlyForTarget(goalOf(input, input.months), initialCents, input.months, rateBp), months: input.months };
    const months = monthsOf(input, input.monthlyCents, rateBp);
    return months === null ? null : { monthly: input.monthlyCents, months };
}
function adjusting(input) {
    return input.adjustTarget === true && input.inflationBp !== null && input.mode !== 'quanto-ter';
}
function goalOf(input, months) {
    return adjusting(input) ? adjustedTargetCents(input.targetCents, months, input.inflationBp) : input.targetCents;
}
function monthsOf(input, monthly, rateBp) {
    return adjusting(input)
        ? monthsForAdjustedTarget(input.targetCents, input.initialCents, monthly, rateBp, input.inflationBp)
        : monthsForTarget(input.targetCents, input.initialCents, monthly, rateBp);
}
export function simulate(input) {
    const { mode, targetCents, initialCents, rateBp, inflationBp } = input;
    checkRate(rateBp, 'taxa');
    if (inflationBp !== null)
        checkRate(inflationBp, 'inflação');
    checkInt(initialCents, 'valor inicial', 0, MAX_RECORD_CENTS);
    if (mode !== 'quanto-ter')
        checkInt(targetCents ?? -1, 'alvo', 1, MAX_RECORD_CENTS);
    if (mode !== 'em-quanto-tempo')
        checkInt(input.months ?? -1, 'prazo', SIMULATE_MONTHS_MIN, SIMULATE_MONTHS_MAX);
    if (mode !== 'quanto-guardar')
        checkInt(input.monthlyCents ?? -1, 'valor por mês', 0, MAX_RECORD_CENTS);
    const T = SIMULATE_TEXT;
    const adjust = adjusting(input);
    const base = { mode, input, hypotheses: T.hypotheses(mode, rateBp, inflationBp, adjust), disclaimer: T.disclaimer };
    const empty = { monthlyWithoutYieldCents: null, monthsWithoutYield: null, targetAdjustedCents: null };
    const growthOf = (monthly, months) => simulateGrowth({ initial: initialCents, monthly, months, rateBp, inflationBp });
    const todayLine = (g) => (g.todayValueCents === null || inflationBp === null ? [] : [T.todayValue(inflationBp, g.finalCents, g.todayValueCents)]);
    const showTip = inflationBp !== null && inflationBp > 0 && !adjust && mode !== 'quanto-ter' ? [T.adjustTip(targetCents)] : [];
    if (mode !== 'quanto-ter' && initialCents >= targetCents) {
        return {
            ...base,
            ...empty,
            reached: true,
            unreachable: false,
            monthlyCents: null,
            months: null,
            growth: null,
            texts: { intro: null, highlight: T.reached, lines: [] },
        };
    }
    if (mode === 'quanto-guardar') {
        const months = input.months;
        const goal = goalOf(input, months);
        const monthly = monthlyForTarget(goal, initialCents, months, rateBp);
        const withoutYield = monthlyShareCents(goal - initialCents, months);
        const growth = growthOf(monthly, months);
        return {
            ...base,
            ...empty,
            reached: false,
            unreachable: false,
            monthlyCents: monthly,
            monthlyWithoutYieldCents: withoutYield,
            months,
            targetAdjustedCents: adjust ? goal : null,
            growth,
            texts: {
                intro: T.introSave(targetCents, months, initialCents, adjust),
                highlight: T.monthlyHighlight(monthly),
                lines: [
                    ...(adjust ? [T.adjustedTarget(inflationBp, goal, months)] : []),
                    ...(monthly === 0 ? [T.initialAlone(growth.finalCents, months)] : []),
                    T.monthlyWithoutYield(withoutYield),
                    ...todayLine(growth),
                    ...showTip,
                ],
            },
        };
    }
    if (mode === 'em-quanto-tempo') {
        const monthly = input.monthlyCents;
        const months = monthsOf(input, monthly, rateBp);
        const withoutYield = monthsOf(input, monthly, 0);
        const intro = T.introTime(targetCents, initialCents, adjust);
        if (months === null) {
            return {
                ...base,
                reached: false,
                unreachable: true,
                monthlyCents: monthly,
                monthlyWithoutYieldCents: null,
                months: null,
                monthsWithoutYield: withoutYield,
                targetAdjustedCents: null,
                growth: null,
                texts: { intro, highlight: T.unreachable, lines: [] },
            };
        }
        const growth = growthOf(monthly, months);
        const goal = goalOf(input, months);
        return {
            ...base,
            reached: false,
            unreachable: false,
            monthlyCents: monthly,
            monthlyWithoutYieldCents: null,
            months,
            monthsWithoutYield: withoutYield,
            targetAdjustedCents: adjust ? goal : null,
            growth,
            texts: {
                intro,
                highlight: T.timeHighlight(monthly, months, withoutYield),
                lines: [...(adjust ? [T.adjustedTarget(inflationBp, goal, months)] : []), ...todayLine(growth), ...showTip],
            },
        };
    }
    const months = input.months;
    const monthly = input.monthlyCents;
    const growth = growthOf(monthly, months);
    return {
        ...base,
        ...empty,
        reached: false,
        unreachable: false,
        monthlyCents: monthly,
        months,
        growth,
        texts: {
            intro: T.introTotal(monthly, months, initialCents),
            highlight: T.totalHighlight(growth.finalCents, months),
            lines: [T.contributed(growth.contributedCents), T.earnings(growth.earningsCents), ...todayLine(growth), T.totalWithoutYield(growth.contributedCents)],
        },
    };
}
export function previewHypotheses(draft) {
    const rate = parseRateBp(draft.rateText);
    const inflation = draft.inflationOn ? parseRateBp(draft.inflationText) : null;
    const adjust = simulationInflationChoice(draft) === 'corrigir';
    const lines = SIMULATE_TEXT.hypotheses(draft.mode ?? 'quanto-guardar', rate ?? 0, inflation, adjust);
    if (rate === null)
        lines[0] = SIMULATE_TEXT.ratePending;
    if (draft.mode === null)
        lines.pop();
    return lines;
}
export function simulationResultLines(result) {
    return [...(result.texts.intro ? [result.texts.intro] : []), result.texts.highlight, ...result.texts.lines];
}
export function simulationErrorText(field, code) {
    return SIMULATE_ERROR_TEXT[field][code] ?? SIMULATE_ERROR_TEXT.fallback;
}
function simulationErrors(codes) {
    const out = {};
    for (const field of SIMULATION_FIELD_ORDER) {
        const code = codes[field];
        if (code)
            out[field] = simulationErrorText(field, code);
    }
    return out;
}
export function simulationGoalPrefill(result, today) {
    if (result.reached || result.unreachable || result.growth === null || result.months === null)
        return null;
    const target = result.mode === 'quanto-ter' ? result.growth.finalCents : (result.targetAdjustedCents ?? result.input.targetCents);
    const monthly = result.monthlyCents ?? 0;
    return {
        goalType: 'objetivo',
        targetText: target >= 1 && target <= MAX_RECORD_CENTS ? centsToInput(target) : '',
        targetMonthText: formatMonthInputBR(addMonths(monthOf(today), result.months - 1)),
        initialText: result.input.initialCents > 0 ? centsToInput(result.input.initialCents) : '',
        plannedText: monthly > 0 ? centsToInput(monthly) : '',
    };
}
const ORIGIN = /^[a-z0-9-]{1,30}$/;
export function simulateLinkParams(values) {
    const out = {};
    const money = (key, v, min) => {
        if (v !== undefined && Number.isSafeInteger(v) && v >= min && v <= MAX_RECORD_CENTS)
            out[key] = String(v);
    };
    if (values.modo && SIMULATION_MODES.includes(values.modo))
        out.modo = values.modo;
    money('alvo', values.alvoCents, 1);
    money('inicial', values.inicialCents, 0);
    if (values.meses !== undefined && Number.isSafeInteger(values.meses) && values.meses >= SIMULATE_MONTHS_MIN && values.meses <= SIMULATE_MONTHS_MAX) {
        out.meses = String(values.meses);
    }
    money('mensal', values.mensalCents, 1);
    if (values.origem && ORIGIN.test(values.origem))
        out.origem = values.origem;
    return out;
}
export function simulatePrefill(params) {
    const one = (key) => {
        const v = params[key];
        return typeof v === 'string' ? v : Array.isArray(v) ? v[0] : undefined;
    };
    const int = (key, min, max) => {
        const v = one(key);
        if (v === undefined || !/^\d{1,15}$/.test(v))
            return undefined;
        const n = Number(v);
        return n >= min && n <= max ? n : undefined;
    };
    const out = {};
    const modo = one('modo');
    if (modo && SIMULATION_MODES.includes(modo))
        out.mode = modo;
    const alvo = int('alvo', 1, MAX_RECORD_CENTS);
    if (alvo !== undefined)
        out.targetText = centsToInput(alvo);
    const inicial = int('inicial', 1, MAX_RECORD_CENTS);
    if (inicial !== undefined)
        out.initialText = centsToInput(inicial);
    const meses = int('meses', SIMULATE_MONTHS_MIN, SIMULATE_MONTHS_MAX);
    if (meses !== undefined)
        out.monthsText = String(meses);
    const mensal = int('mensal', 1, MAX_RECORD_CENTS);
    if (mensal !== undefined)
        out.monthlyText = centsToInput(mensal);
    const origem = one('origem');
    if (origem && ORIGIN.test(origem))
        out.origem = origem;
    return out;
}
export function simulateValuesFromObjetivo(result) {
    const values = { modo: result.modo === 'prazo' ? 'quanto-guardar' : 'em-quanto-tempo', alvoCents: result.alvoCents, origem: 'calculadora' };
    if (result.jaTemCents > 0)
        values.inicialCents = result.jaTemCents;
    if (result.modo === 'prazo' && result.months !== null)
        values.meses = result.months;
    if (result.modo === 'mensal' && result.monthlyCents !== null)
        values.mensalCents = result.monthlyCents;
    return values;
}
export function simulateValuesFromGoal(plan) {
    const values = { modo: 'quanto-guardar', alvoCents: plan.targetCents, origem: 'meta' };
    if (plan.savedCents > 0)
        values.inicialCents = plan.savedCents;
    const months = plan.deadline?.months ?? 0;
    if (months >= SIMULATE_MONTHS_MIN && months <= SIMULATE_MONTHS_MAX)
        values.meses = months;
    else if (plan.plannedMonthlyCents !== null && plan.plannedMonthlyCents > 0) {
        values.modo = 'em-quanto-tempo';
        values.mensalCents = plan.plannedMonthlyCents;
    }
    return values;
}
export const SIMULATE_DISCLAIMER = 'Simulação com as hipóteses que você informou. Não é promessa de rendimento nem recomendação de investimento.';
const RATE_RANGE_TEXT = 'Use uma taxa de 0% a 30% ao ano, com até 2 casas.';
const INFLATION_RANGE_TEXT = 'Use uma inflação de 0% a 30% ao ano, com até 2 casas.';
const LIMIT = 'O valor máximo é R$ 9.999.999,99.';
export const SIMULATE_ERROR_TEXT = {
    mode: { vazio: 'Escolha o que você quer saber.' },
    targetText: {
        vazio: 'Digite quanto quer juntar, como 22.500,00.',
        invalido: 'Confira o valor, como 22.500,00.',
        zero: 'Informe um valor maior que zero, como 22.500,00.',
        acima_do_limite: LIMIT,
    },
    initialText: { invalido: 'Confira o valor, como 4.500,00.', acima_do_limite: LIMIT },
    monthsText: {
        vazio: 'Digite em quantos meses, de 1 a 600.',
        invalido: 'Use só números inteiros, como 14.',
        fora_da_faixa: 'Use um prazo de 1 a 600 meses.',
        resultado_alto: 'Com estes números, o resultado passa do que o simulador mostra. Use um valor, uma taxa ou um prazo menor.',
    },
    monthlyText: {
        vazio: 'Digite quanto vai guardar por mês, como 1.000,00.',
        invalido: 'Confira o valor, como 1.000,00.',
        zero: 'Informe um valor maior que zero, como 1.000,00.',
        acima_do_limite: LIMIT,
        resultado_alto: 'Com estes números, o resultado passa do que o simulador mostra. Use um valor, uma taxa ou um prazo menor.',
    },
    rateText: {
        vazio: 'Digite a taxa ao ano que quer testar, de 0% a 30%.',
        invalido: RATE_RANGE_TEXT,
        casas_demais: RATE_RANGE_TEXT,
        fora_da_faixa: RATE_RANGE_TEXT,
    },
    inflationText: {
        vazio: 'Digite a inflação ao ano que quer testar, de 0% a 30%.',
        invalido: INFLATION_RANGE_TEXT,
        casas_demais: INFLATION_RANGE_TEXT,
        fora_da_faixa: INFLATION_RANGE_TEXT,
    },
    fallback: 'Confira o número digitado.',
};
const brl = formatBRL;
export const SIMULATE_TEXT = {
    title: 'Simular um plano',
    intro: 'Faça contas com hipóteses suas. Nada aqui é gravado até você escolher criar uma meta.',
    modeLabel: 'O que você quer saber?',
    modes: {
        'quanto-guardar': 'Quanto guardar por mês',
        'em-quanto-tempo': 'Em quanto tempo',
        'quanto-ter': 'Quanto posso ter',
    },
    fields: {
        target: 'Quanto quer juntar',
        initial: 'Quanto já tem (opcional)',
        months: 'Em quantos meses',
        monthsHint: 'De 1 a 600',
        monthly: 'Quanto vai guardar por mês',
        rate: 'Taxa de rendimento ao ano (%)',
        rateHint: 'Você informa a taxa que quer testar. A Clarevo não sugere taxas, produtos nem instituições.',
        inflationLabel: 'Inflação (opcional)',
        inflationChoices: {
            nenhuma: 'Sem inflação',
            mostrar: 'Mostrar em dinheiro de hoje',
            corrigir: 'Corrigir a meta pela inflação',
        },
        inflationChoiceHints: {
            nenhuma: 'Os valores ficam em reais de cada mês, sem inflação.',
            mostrar: 'Só informa: a meta e o valor por mês não mudam. O resultado mostra quanto o total vale em dinheiro de hoje.',
            corrigir: 'Para manter o poder de compra: a meta sobe com a inflação até o fim do prazo, e o valor por mês é recalculado.',
        },
        inflationShowHintTotal: 'Só informa: o valor por mês não muda. O resultado mostra quanto o total vale em dinheiro de hoje.',
        inflationAdjustHintTime: 'Para manter o poder de compra: a meta sobe com a inflação até o fim do prazo, e o prazo é recalculado.',
        inflation: 'Inflação ao ano (%)',
        inflationHint: 'Você informa a inflação que quer testar, de 0% a 30% ao ano.',
    },
    simulateButton: 'Simular',
    resultTitle: 'Resultado',
    waiting: 'Escolha o que quer saber, preencha os campos e toque em Simular.',
    hypothesesTitle: 'Hipóteses',
    ratePending: 'Taxa de rendimento: a que você informar, constante no período.',
    disclaimer: SIMULATE_DISCLAIMER,
    reached: 'Com estes números, você já tem o valor que quer juntar.',
    unreachable: 'Com estes valores, a meta não é alcançada em 50 anos na hipótese informada. Mude o valor por mês ou quanto quer juntar.',
    chart: {
        title: 'Ano a ano',
        contributed: 'Aportado',
        earnings: 'Rendimento na hipótese',
        showTable: 'Ver tabela ano a ano',
        hideTable: 'Ocultar tabela ano a ano',
    },
    table: {
        year: 'Ano',
        contributed: 'Aportado',
        earnings: 'Rendimento na hipótese',
        total: 'Total na hipótese',
        today: 'Em dinheiro de hoje',
    },
    createGoal: 'Criar meta com estes valores',
    createGoalHint: 'A meta recebe o valor, o prazo, o que você já tem e o valor por mês. A taxa não é gravada, e o progresso só anda com o que você registrar.',
    calcLink: 'Simular com rendimento',
    learnShortcut: 'Simular um plano',
    learnShortcutHint: 'Quanto guardar por mês, em quanto tempo e quanto você pode ter, com hipóteses suas.',
    introSave: (targetCents, months, initialCents, adjusted = false) => `Para juntar ${adjusted ? `o equivalente a ${brl(targetCents)} de hoje` : brl(targetCents)} em ${monthsCount(months)}${initialCents > 0 ? `, começando com ${brl(initialCents)}` : ''}:`,
    introTime: (targetCents, initialCents, adjusted = false) => `Para juntar ${adjusted ? `o equivalente a ${brl(targetCents)} de hoje` : brl(targetCents)}${initialCents > 0 ? `, começando com ${brl(initialCents)}` : ''}:`,
    adjustedTarget: (inflationBp, cents, months) => `Com inflação de ${formatBpCompact(inflationBp)} ao ano, a meta corrigida é de ${brl(cents)} em ${monthsCount(months)}.`,
    adjustTip: (targetCents) => `Para manter o poder de compra de ${brl(targetCents)}, escolha "Corrigir a meta pela inflação".`,
    introTotal: (monthlyCents, months, initialCents) => monthlyCents > 0
        ? `Guardando ${brl(monthlyCents)} por mês por ${monthsCount(months)}${initialCents > 0 ? `, começando com ${brl(initialCents)}` : ''}:`
        : `Com ${brl(initialCents)} por ${monthsCount(months)}, sem guardar mais nada por mês:`,
    monthlyHighlight: (monthlyCents) => `${brl(monthlyCents)} por mês na hipótese informada`,
    monthlyWithoutYield: (monthlyCents) => `Sem rendimento, seriam ${brl(monthlyCents)} por mês.`,
    initialAlone: (finalCents, months) => `Na hipótese informada, o que você já tem chega a ${brl(finalCents)} em ${monthsCount(months)}, sem guardar mais nada por mês.`,
    timeHighlight: (monthlyCents, months, monthsWithoutYield) => `Com ${brl(monthlyCents)} por mês: ${monthsCount(months)} na hipótese informada; ${monthsWithoutYield === null ? 'sem rendimento, não alcança em 50 anos' : `${monthsCount(monthsWithoutYield)} sem rendimento`}.`,
    totalHighlight: (finalCents, months) => `Na hipótese informada: ${brl(finalCents)} em ${monthsCount(months)}`,
    contributed: (cents) => `Total aportado: ${brl(cents)}`,
    earnings: (cents) => `Rendimento na hipótese: ${brl(cents)}`,
    totalWithoutYield: (cents) => `Sem rendimento, seriam ${brl(cents)}.`,
    todayValue: (inflationBp, finalCents, todayCents) => `Em dinheiro de hoje, com inflação de ${formatBpCompact(inflationBp)} ao ano, o total de ${brl(finalCents)} equivale a ${brl(todayCents)}.`,
    hypotheses: (mode, rateBp, inflationBp, adjustTarget = false) => [
        rateBp === 0
            ? 'Taxa de 0% ao ano: sem rendimento.'
            : `Taxa de ${formatBpCompact(rateBp)} ao ano (${monthlyRateText(rateBp)} ao mês, taxa equivalente), constante no período.`,
        'Aportes no início de cada mês, como na Calculadora do Cidadão do Banco Central.',
        'Valores brutos, sem imposto de renda, IOF ou taxas.',
        inflationBp === null
            ? 'Sem inflação, salvo se informada.'
            : `Inflação de ${formatBpCompact(inflationBp)} ao ano (${monthlyRateText(inflationBp)} ao mês, taxa equivalente), constante no período, ${adjustTarget && mode !== 'quanto-ter'
                ? 'para corrigir a meta: a meta de hoje com a inflação de todo o prazo, no centavo.'
                : `só para mostrar o valor em dinheiro de hoje${mode === 'quanto-ter' ? '' : ': a meta e o valor por mês não mudam'}.`}`,
        mode === 'quanto-guardar'
            ? 'Valor por mês arredondado para cima, no centavo; valores finais para baixo.'
            : mode === 'em-quanto-tempo'
                ? 'Prazo em meses inteiros, arredondado para cima; valores finais para baixo, no centavo.'
                : 'Valores finais arredondados para baixo, no centavo.',
    ],
    yearLabel: (row) => (row.partial ? `Ano ${row.year} (até o mês ${row.months})` : `Ano ${row.year}`),
    yearA11y: (row) => `${SIMULATE_TEXT.yearLabel(row)}: aportado ${brl(row.contributedCents)}, rendimento na hipótese ${brl(row.earningsCents)}, total ${brl(row.finalCents)}${row.todayValueCents === null ? '' : `, em dinheiro de hoje ${brl(row.todayValueCents)}`}.`,
    chartA11y: (growth, months) => `Gráfico por ano, até ${monthsCount(months)}: ${brl(growth.contributedCents)} aportados e ${brl(growth.earningsCents)} de rendimento na hipótese, total de ${brl(growth.finalCents)}.`,
};
