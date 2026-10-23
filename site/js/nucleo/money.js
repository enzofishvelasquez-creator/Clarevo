// Gerado por scripts/gerar-site.js a partir de packages/core/src/money.ts. Não edite: rode "node scripts/gerar-site.js".
export const MAX_RECORD_CENTS = 999_999_999;
const BRL = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
});
export function formatBRL(cents) {
    return BRL.format(cents / 100).replace(/ /g, ' ');
}
export function centsToInput(cents) {
    return formatBRL(cents).replace(/^-?R\$\s?/, '');
}
export function parseBRL(input) {
    const raw = input.trim().replace(/^R\$\s*/i, '');
    if (raw === '')
        return null;
    let intPart;
    let decPart = '';
    const brl = /^(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?$/.exec(raw);
    const dotDecimal = /^(\d+)\.(\d{1,2})$/.exec(raw);
    if (brl) {
        intPart = brl[1].replace(/\./g, '');
        decPart = brl[2] ?? '';
    }
    else if (dotDecimal) {
        intPart = dotDecimal[1];
        decPart = dotDecimal[2];
    }
    else {
        return null;
    }
    const intDigits = intPart.replace(/^0+(?=\d)/, '');
    if (intDigits.length > 13)
        return MAX_RECORD_CENTS + 1;
    return Number(intDigits) * 100 + Number(decPart.padEnd(2, '0'));
}
export function roundDiv(a, b) {
    return Math.floor((2 * a + b) / (2 * b));
}
export function ceilDiv(a, b) {
    return Math.floor((a + b - 1) / b);
}
