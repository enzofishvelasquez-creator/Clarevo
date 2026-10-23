// Gerado por scripts/gerar-site.js a partir de packages/core/src/calculators/common.ts. Não edite: rode "node scripts/gerar-site.js".
import { formatInteger, formatRate } from '../learn/format.js';
export const LIMIT_TEXT = 'O valor máximo é R$ 9.999.999,99.';
export function moneyField(label, what, example, extra = {}) {
    return {
        label,
        kind: 'dinheiro',
        ...extra,
        errors: {
            vazio: `Digite ${what}, como ${example}.`,
            invalido: `Confira o valor, como ${example}.`,
            zero: `Informe um valor maior que zero, como ${example}.`,
            acima_do_limite: LIMIT_TEXT,
            ...extra.errors,
        },
    };
}
export function rateField(label, what, example, min, max, rangeText, hint) {
    return {
        label,
        kind: 'taxa',
        min,
        max,
        ...(hint ? { hint } : {}),
        errors: {
            vazio: `Digite ${what}, como ${example}.`,
            invalido: `Use só números, como ${example}.`,
            casas_demais: 'Use até 2 casas depois da vírgula, como 1,96.',
            fora_da_faixa: rangeText,
        },
    };
}
export function countField(label, what, min, max, rangeText, hint) {
    return {
        label,
        kind: 'inteiro',
        min,
        max,
        ...(hint ? { hint } : {}),
        errors: {
            vazio: `Digite ${what}, de ${formatInteger(min)} a ${formatInteger(max)}.`,
            invalido: 'Use só números inteiros, como 12.',
            fora_da_faixa: rangeText,
        },
    };
}
export class FieldReader {
    errors = {};
    read(field, parsed) {
        if (parsed.ok)
            return parsed.value;
        this.errors[field] = parsed.error;
        return undefined;
    }
    fail(field, code) {
        this.errors[field] = code;
        return undefined;
    }
    get ok() {
        return Object.keys(this.errors).length === 0;
    }
}
export function monthsCount(n) {
    return n === 1 ? '1 mês' : `${formatInteger(n)} meses`;
}
export function monthsDuration(n) {
    if (n < 12)
        return monthsCount(n);
    const years = Math.floor(n / 12);
    const rest = n % 12;
    const y = years === 1 ? '1 ano' : `${formatInteger(years)} anos`;
    return `${monthsCount(n)} (${rest === 0 ? y : `${y} e ${monthsCount(rest)}`})`;
}
export function daysCount(n) {
    return n === 1 ? '1 dia' : `${formatInteger(n)} dias`;
}
export const RATE_DISPLAY_MAX = 100;
export function rateText(rate) {
    if (rate > RATE_DISPLAY_MAX)
        return 'mais de 10.000%';
    const text = formatRate(rate);
    return rate > 0 && text === '0,00%' ? 'menos de 0,01%' : text;
}
