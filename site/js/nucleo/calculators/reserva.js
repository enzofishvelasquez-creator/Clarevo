// Gerado por scripts/gerar-site.js a partir de packages/core/src/calculators/reserva.ts. Não edite: rode "node scripts/gerar-site.js".
import { monthsToReach } from '../learn/math.js';
import { formatBRL } from '../money.js';
import { FieldReader, countField, monthsCount, monthsDuration, moneyField } from './common.js';
import { formatInteger } from '../learn/format.js';
import { parseCount, parseMoney, parseOptionalMoney } from './inputs.js';
export const RESERVA_REFERENCIA = {
    text: 'O Portal do Investidor, da CVM, explica como pensar em quantos meses guardar, conforme o tipo de renda.',
    url: null,
    checkedOn: null,
};
export const RESERVA_MONTH_CHIPS = [1, 3, 6, 12];
export const RESERVA_TEXT = {
    chooseMonths: 'Escolha quantos meses cobrir.',
};
export const RESERVA_FIELDS = {
    essenciais: moneyField('Gastos essenciais por mês', 'os gastos essenciais por mês', '3.750,00', {
        hint: 'Moradia, mercado, contas da casa, saúde e transporte.',
    }),
    meses: countField('Quantos meses cobrir', 'quantos meses cobrir', 1, 24, 'Use de 1 a 24 meses.', 'Escolha 1, 3, 6 ou 12, ou outro de 1 a 24.'),
    guardado: moneyField('Quanto já tem guardado', 'quanto já tem guardado', '4.500,00', { optional: true }),
    mensal: moneyField('Quanto guarda por mês', 'quanto guarda por mês', '500,00', { optional: true }),
};
function tenthsOfMonth(tenths) {
    const text = tenths % 10 === 0 ? formatInteger(tenths / 10) : `${formatInteger(Math.floor(tenths / 10))},${tenths % 10}`;
    return `${text} ${tenths < 20 ? 'mês' : 'meses'}`;
}
export function calcReserva(input) {
    const r = new FieldReader();
    const essenciais = r.read('essenciais', parseMoney(input.essenciais));
    const meses = r.read('meses', parseCount(input.meses, 1, 24));
    const guardado = r.read('guardado', parseOptionalMoney(input.guardado));
    const mensal = r.read('mensal', parseOptionalMoney(input.mensal));
    if (!r.ok || essenciais === undefined || meses === undefined || guardado === undefined || mensal === undefined) {
        return { ok: false, errors: r.errors };
    }
    const target = essenciais * meses;
    const saved = guardado ?? 0;
    const missing = Math.max(0, target - saved);
    const coverageTenths = guardado === null ? null : Math.floor((guardado * 10) / essenciais);
    const monthsToTarget = mensal !== null && mensal > 0 && missing > 0 ? monthsToReach(missing, mensal) : null;
    const resultLines = [`Com estes números, a reserva de ${monthsCount(meses)} é de ${formatBRL(target)}.`];
    if (guardado !== null && guardado > 0) {
        if (missing === 0)
            resultLines.push(`O que você já guardou cobre a reserva de ${monthsCount(meses)}.`);
        else {
            resultLines.push(coverageTenths === 0
                ? 'O que você já guardou cobre menos de 0,1 mês de gastos essenciais.'
                : `O que você já guardou cobre ${tenthsOfMonth(coverageTenths)} de gastos essenciais.`);
            resultLines.push(`Faltam ${formatBRL(missing)}.`);
        }
    }
    if (monthsToTarget !== null) {
        resultLines.push(`Guardando ${formatBRL(mensal)} por mês, a reserva fica completa em ${monthsDuration(monthsToTarget)}.`);
    }
    const hypotheses = ['Sem rendimento: o valor guardado não cresce com juros.', 'Gastos essenciais iguais em todos os meses.'];
    if (guardado !== null && guardado > 0 && missing > 0)
        hypotheses.push('Meses cobertos arredondados para baixo, em décimos de mês.');
    return {
        ok: true,
        result: {
            essenciaisCents: essenciais,
            meses,
            targetCents: target,
            guardadoCents: guardado,
            mensalCents: mensal,
            coverageTenths,
            missingCents: missing,
            monthsToTarget,
            reference: RESERVA_REFERENCIA,
            resultLines,
            hypotheses,
            notes: [],
        },
    };
}
