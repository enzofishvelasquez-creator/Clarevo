// Gerado por scripts/gerar-site.js a partir de packages/core/src/learn/format.ts. Não edite: rode "node scripts/gerar-site.js".
import { roundDivBig } from './math.js';
export function formatInteger(value) {
    const sign = value < 0 ? '-' : '';
    return sign + String(Math.abs(Math.trunc(value))).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}
function decimalText(scaled, casas) {
    const negative = scaled < 0n;
    const abs = negative ? -scaled : scaled;
    const unit = 10n ** BigInt(casas);
    const intPart = formatInteger(Number(abs / unit));
    const dec = casas > 0 ? `,${String(abs % unit).padStart(casas, '0')}` : '';
    return `${negative ? '-' : ''}${intPart}${dec}`;
}
export function formatBp(bp, casas = 2) {
    if (!Number.isSafeInteger(bp))
        throw new RangeError(`bp inválido: ${bp}`);
    if (!Number.isInteger(casas) || casas < 0 || casas > 2)
        throw new RangeError(`casas inválidas: ${casas}`);
    const scaled = roundDivBig(BigInt(bp), 10n ** BigInt(2 - casas));
    return `${decimalText(scaled, casas)}%`;
}
export function formatBpCompact(bp) {
    return formatBp(bp, 2).replace(/,00%$/, '%').replace(/(,\d)0%$/, '$1%');
}
export function formatRate(rate, casas = 2) {
    if (!Number.isFinite(rate))
        throw new RangeError(`taxa inválida: ${rate}`);
    const bp = rate * 10_000;
    const clean = Number(bp.toFixed(6));
    const unit = 10 ** (2 - casas);
    const scaled = Math.sign(clean) * Math.floor(Math.abs(clean) / unit + 0.5);
    return formatBp(scaled * unit, casas);
}
export function formatTenths(tenths) {
    if (!Number.isSafeInteger(tenths))
        throw new RangeError(`décimos inválidos: ${tenths}`);
    const negative = tenths < 0;
    const abs = Math.abs(tenths);
    const text = abs % 10 === 0 ? formatInteger(abs / 10) : `${formatInteger(Math.floor(abs / 10))},${abs % 10}`;
    return `${negative ? '-' : ''}${text}%`;
}
