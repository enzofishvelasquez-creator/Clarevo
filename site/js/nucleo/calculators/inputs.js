// Gerado por scripts/gerar-site.js a partir de packages/core/src/calculators/inputs.ts. Não edite: rode "node scripts/gerar-site.js".
import { MAX_RECORD_CENTS, parseBRL } from '../money.js';
export const CALC_ERROR_TEXT = {
    vazio: 'Preencha este campo.',
    invalido: 'Confira o número digitado.',
    casas_demais: 'Use até 2 casas depois da vírgula, como 1,96.',
    fora_da_faixa: 'Use um número dentro da faixa indicada.',
    zero: 'Informe um valor maior que zero.',
    acima_do_limite: 'O valor máximo é R$ 9.999.999,99.',
    longo: 'Use no máximo 20 caracteres.',
    resultado_alto: 'Com estes números, o resultado passa do que a calculadora mostra. Use um valor ou um prazo menor.',
};
export function parsePercentBp(text, range) {
    const raw = text.trim().replace(/\s*%$/, '');
    if (raw === '')
        return { ok: false, error: 'vazio' };
    const m = /^(\d*)(?:[.,](\d*))?$/.exec(raw);
    if (!m || (m[1] === '' && (m[2] ?? '') === ''))
        return { ok: false, error: 'invalido' };
    const intPart = m[1].replace(/^0+(?=\d)/, '');
    const decPart = m[2] ?? '';
    if (decPart.length > 2)
        return { ok: false, error: 'casas_demais' };
    if (intPart.length > 7)
        return { ok: false, error: 'fora_da_faixa' };
    const bp = Number(intPart || '0') * 100 + Number(decPart.padEnd(2, '0'));
    if (bp < range.min || bp > range.max)
        return { ok: false, error: 'fora_da_faixa' };
    return { ok: true, value: bp };
}
export function parseCount(text, min, max) {
    const raw = text.trim();
    if (raw === '')
        return { ok: false, error: 'vazio' };
    if (!/^(\d+|\d{1,3}(\.\d{3})+)$/.test(raw))
        return { ok: false, error: 'invalido' };
    const digits = raw.replace(/\./g, '').replace(/^0+(?=\d)/, '');
    if (digits.length > 9)
        return { ok: false, error: 'fora_da_faixa' };
    const value = Number(digits);
    if (value < min || value > max)
        return { ok: false, error: 'fora_da_faixa' };
    return { ok: true, value };
}
export function parseMoney(text, opts = {}) {
    if (text.trim() === '')
        return { ok: false, error: 'vazio' };
    const cents = parseBRL(text);
    if (cents === null)
        return { ok: false, error: 'invalido' };
    if (cents > MAX_RECORD_CENTS)
        return { ok: false, error: 'acima_do_limite' };
    if (cents === 0 && !opts.allowZero)
        return { ok: false, error: 'zero' };
    return { ok: true, value: cents };
}
export function parseOptionalMoney(text) {
    if (text === undefined || text.trim() === '')
        return { ok: true, value: null };
    return parseMoney(text, { allowZero: true });
}
