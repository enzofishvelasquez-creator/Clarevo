// Gerado por scripts/gerar-site.js a partir de packages/core/src/calculators/custo-por-ano.ts. Não edite: rode "node scripts/gerar-site.js".
import { MAX_RECORD_CENTS, formatBRL, roundDiv } from '../money.js';
import { FieldReader, moneyField } from './common.js';
import { parseMoney } from './inputs.js';
export const WORKDAYS_PER_MONTH = 22;
export const WEEKS_PER_YEAR = 52;
export const DAYS_PER_YEAR = 365;
export const CUSTO_POR_ANO_FIELDS = {
    valor: moneyField('Valor', 'o valor', '39,90'),
    frequencia: {
        label: 'Com que frequência?',
        kind: 'opcao',
        options: [
            { value: 'dia_util', label: 'Por dia útil' },
            { value: 'semana', label: 'Por semana' },
            { value: 'mes', label: 'Por mês' },
        ],
        errors: { vazio: 'Escolha a frequência.' },
    },
};
const FREQUENCIAS = ['dia_util', 'semana', 'mes'];
export function calcCustoPorAno(input) {
    const r = new FieldReader();
    const valor = r.read('valor', parseMoney(input.valor));
    const frequencia = input.frequencia && FREQUENCIAS.includes(input.frequencia) ? input.frequencia : r.fail('frequencia', 'vazio');
    if (!r.ok || valor === undefined || frequencia === undefined)
        return { ok: false, errors: r.errors };
    let monthlyCents;
    let yearlyCents;
    let hypotheses;
    switch (frequencia) {
        case 'dia_util':
            monthlyCents = valor * WORKDAYS_PER_MONTH;
            yearlyCents = monthlyCents * 12;
            hypotheses = ['22 dias úteis por mês.', '12 meses por ano.'];
            break;
        case 'semana':
            monthlyCents = roundDiv(valor * WEEKS_PER_YEAR, 12);
            yearlyCents = valor * WEEKS_PER_YEAR;
            hypotheses = ['52 semanas por ano.', 'Por mês, o valor do ano dividido por 12.'];
            break;
        case 'mes':
            monthlyCents = valor;
            yearlyCents = valor * 12;
            hypotheses = ['12 meses por ano.'];
            break;
    }
    const dailyCents = frequencia === 'dia_util' ? null : roundDiv(yearlyCents, DAYS_PER_YEAR);
    if (dailyCents !== null)
        hypotheses.push('Por dia, o valor do ano dividido por 365.');
    hypotheses.push('O mesmo valor em todos os períodos.');
    const resultLines = [`Com estes números, o gasto soma ${formatBRL(yearlyCents)} por ano.`, `Por mês, fica em ${formatBRL(monthlyCents)}.`];
    if (dailyCents !== null)
        resultLines.push(`Por dia, fica em ${formatBRL(dailyCents)}.`);
    return {
        ok: true,
        result: {
            valorCents: valor,
            frequencia,
            monthlyCents,
            yearlyCents,
            dailyCents,
            noteParams: monthlyCents <= MAX_RECORD_CENTS ? { tipo: 'mensal', valor: monthlyCents } : null,
            resultLines,
            hypotheses,
            notes: [],
        },
    };
}
