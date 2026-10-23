// Gerado por scripts/gerar-site.js a partir de packages/core/src/learn/math.ts. Não edite: rode "node scripts/gerar-site.js".
const BP = 10000n;
const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);
function int(value, name, min = 0) {
    if (!Number.isSafeInteger(value) || value < min)
        throw new RangeError(`${name} inválido: ${value}`);
    return BigInt(value);
}
function toNumber(value) {
    if (value > MAX_SAFE || value < -MAX_SAFE)
        throw new RangeError('resultado grande demais');
    return Number(value);
}
export function roundDivBig(a, b) {
    if (b === 0n)
        throw new RangeError('divisão por zero');
    if (b < 0n) {
        a = -a;
        b = -b;
    }
    if (a >= 0n)
        return (2n * a + b) / (2n * b);
    return -((2n * -a + b) / (2n * b));
}
export function simpleTotalCents(principalCents, monthlyBp, months) {
    const p = int(principalCents, 'principal');
    return toNumber(p + roundDivBig(p * int(monthlyBp, 'taxa') * int(months, 'meses'), BP));
}
export function compoundTotalBig(principalCents, monthlyBp, months) {
    const n = int(months, 'meses');
    return roundDivBig(int(principalCents, 'principal') * (BP + int(monthlyBp, 'taxa')) ** n, BP ** n);
}
export function compoundTotalCents(principalCents, monthlyBp, months) {
    return toNumber(compoundTotalBig(principalCents, monthlyBp, months));
}
export function equivalentAnnualBp(monthlyBp) {
    const q = BP + int(monthlyBp, 'taxa');
    return toNumber(roundDivBig(q ** 12n - BP ** 12n, BP ** 11n));
}
export function equivalentMonthlyBp(annualBp) {
    const a = int(annualBp, 'taxa');
    const limit = 2n ** 12n * BP ** 11n * (BP + a);
    const fits = (r) => (20000n + 2n * BigInt(r) - 1n) ** 12n <= limit;
    let r = Math.max(0, Math.floor(10_000 * (Math.pow(1 + annualBp / 10_000, 1 / 12) - 1) + 0.5));
    while (fits(r + 1))
        r += 1;
    while (r > 0 && !fits(r))
        r -= 1;
    return r;
}
export function equivalentAnnualRate(monthlyRate) {
    if (!Number.isFinite(monthlyRate) || monthlyRate <= -1)
        throw new RangeError(`taxa inválida: ${monthlyRate}`);
    return Math.expm1(12 * Math.log1p(monthlyRate));
}
export function installmentCents(principalCents, monthlyBp, installments) {
    const p = int(principalCents, 'principal');
    const bp = int(monthlyBp, 'taxa');
    const n = int(installments, 'parcelas', 1);
    if (bp === 0n)
        return toNumber(roundDivBig(p, n));
    const qn = (BP + bp) ** n;
    return toNumber(roundDivBig(p * bp * qn, BP * (qn - BP ** n)));
}
export function sacTotals(principalCents, monthlyBp, installments) {
    const p = int(principalCents, 'principal');
    const bp = int(monthlyBp, 'taxa');
    const n = int(installments, 'parcelas', 1);
    const base = p / n;
    const extra = p % n;
    let balance = p;
    let interestSum = 0n;
    let totalSum = 0n;
    const rows = [];
    for (let k = 0n; k < n; k++) {
        const amortization = base + (k < extra ? 1n : 0n);
        const interest = roundDivBig(balance * bp, BP);
        balance -= amortization;
        interestSum += interest;
        totalSum += amortization + interest;
        rows.push({ amortizationCents: toNumber(amortization), interestCents: toNumber(interest), paymentCents: toNumber(amortization + interest) });
    }
    return {
        rows,
        interestCents: toNumber(interestSum),
        totalCents: toNumber(totalSum),
        firstCents: rows[0].paymentCents,
        lastCents: rows[rows.length - 1].paymentCents,
    };
}
export function presentValueCents(paymentCents, monthlyBp, times) {
    const pay = int(paymentCents, 'parcela');
    const bp = int(monthlyBp, 'taxa');
    for (const t of times)
        if (!Number.isFinite(t) || t < 0)
            throw new RangeError(`prazo inválido: ${t}`);
    if (times.length === 0)
        return 0;
    if (times.every((t) => Number.isSafeInteger(t))) {
        const q = BP + bp;
        const max = BigInt(Math.max(...times));
        let numerator = 0n;
        for (const t of times) {
            const tt = BigInt(t);
            numerator += pay * BP ** tt * q ** (max - tt);
        }
        return toNumber(roundDivBig(numerator, q ** max));
    }
    const rate = monthlyBp / 10_000;
    let sum = 0;
    for (const t of times)
        sum += paymentCents / Math.pow(1 + rate, t);
    return Math.floor(sum + 0.5);
}
function annuityFactor(rate, n) {
    if (rate === 0)
        return n;
    return -Math.expm1(-n * Math.log1p(rate)) / rate;
}
export function impliedMonthlyRate(principalCents, paymentCents, installments) {
    int(principalCents, 'principal');
    int(paymentCents, 'parcela');
    int(installments, 'parcelas', 1);
    const total = paymentCents * installments;
    if (principalCents <= 0 || total < principalCents)
        return null;
    if (total === principalCents)
        return 0;
    const f = (rate) => paymentCents * annuityFactor(rate, installments) - principalCents;
    let lo = 0;
    let hi = 1;
    while (f(hi) > 0) {
        hi *= 2;
        if (hi > 2 ** 60)
            return null;
    }
    for (let k = 0; k < 400; k++) {
        const mid = (lo + hi) / 2;
        if (mid <= lo || mid >= hi)
            break;
        if (f(mid) > 0)
            lo = mid;
        else
            hi = mid;
    }
    return (lo + hi) / 2;
}
export const IOF_FIXED_PPM = 3_800;
export const IOF_DAILY_PPM = 82;
export const IOF_MAX_DAYS = 365;
export function iofCents(principalCents, days) {
    const p = int(principalCents, 'principal');
    const d = BigInt(Math.min(Number(int(days, 'dias')), IOF_MAX_DAYS));
    const fixedCents = toNumber(roundDivBig(p * BigInt(IOF_FIXED_PPM), 1000000n));
    const dailyCents = toNumber(roundDivBig(p * BigInt(IOF_DAILY_PPM) * d, 1000000n));
    return { fixedCents, dailyCents, totalCents: fixedCents + dailyCents };
}
export function lateChargesCents(valueCents, fineBp, monthlyInterestBp, days) {
    const v = int(valueCents, 'valor');
    const fineCents = toNumber(roundDivBig(v * int(fineBp, 'multa'), BP));
    const interestCents = toNumber(roundDivBig(v * int(monthlyInterestBp, 'juros') * int(days, 'dias'), BP * 30n));
    return { fineCents, interestCents, totalCents: valueCents + fineCents + interestCents };
}
export function realValueCents(valueCents, inflationBp) {
    return toNumber(roundDivBig(int(valueCents, 'valor') * BP, BP + int(inflationBp, 'inflação')));
}
export function percentTenths(part, whole) {
    const p = int(part, 'parte');
    if (!Number.isSafeInteger(whole) || whole <= 0)
        return 0;
    const w = BigInt(whole);
    return toNumber((2000n * p + w) / (2n * w));
}
export function sharesCents(totalCents, weights) {
    const total = int(totalCents, 'total');
    const w = weights.map((x) => int(x, 'peso'));
    const sum = w.reduce((a, b) => a + b, 0n);
    if (sum === 0n)
        throw new RangeError('pesos sem soma');
    const base = w.map((x) => (total * x) / sum);
    const rest = w.map((x, i) => ({ i, r: (total * x) % sum }));
    let left = total - base.reduce((a, b) => a + b, 0n);
    rest.sort((a, b) => (a.r === b.r ? a.i - b.i : a.r > b.r ? -1 : 1));
    for (const { i } of rest) {
        if (left === 0n)
            break;
        base[i] = base[i] + 1n;
        left -= 1n;
    }
    return base.map(toNumber);
}
export function monthlyShareCents(totalCents, months) {
    const total = int(totalCents, 'total');
    const n = int(months, 'meses', 1);
    return toNumber((total + n - 1n) / n);
}
const statMin = (options) => (options.signed === true ? Number.MIN_SAFE_INTEGER : 0);
export function averageCents(values, options = {}) {
    if (values.length === 0)
        throw new RangeError('lista vazia');
    const min = statMin(options);
    const sum = values.reduce((acc, v) => acc + int(v, 'valor', min), 0n);
    return toNumber(roundDivBig(sum, BigInt(values.length)));
}
export function medianCents(values, options = {}) {
    if (values.length === 0)
        throw new RangeError('lista vazia');
    const min = statMin(options);
    const sorted = values.map((v) => int(v, 'valor', min)).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    const middle = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 1)
        return toNumber(sorted[middle]);
    return toNumber(roundDivBig(sorted[middle - 1] + sorted[middle], 2n));
}
export function monthsToReach(targetCents, monthlyCents) {
    const m = int(monthlyCents, 'por mês', 1);
    if (!Number.isSafeInteger(targetCents))
        throw new RangeError(`alvo inválido: ${targetCents}`);
    if (targetCents <= 0)
        return 0;
    const t = BigInt(targetCents);
    return toNumber((t + m - 1n) / m);
}
export function thirteenthFirstCents(monthlySalaryCents) {
    return toNumber(roundDivBig(int(monthlySalaryCents, 'salário'), 2n));
}
export function thirteenthCents(monthlyCents, months) {
    const m = int(months, 'meses');
    if (m > 12n)
        throw new RangeError(`meses inválidos: ${months}`);
    return toNumber(roundDivBig(int(monthlyCents, 'remuneração') * m, 12n));
}
export function thirteenthMonthsCount(workedDays) {
    return workedDays.filter((d) => {
        if (int(d, 'dias') > 31n)
            throw new RangeError(`dias inválidos: ${d}`);
        return d >= 15;
    }).length;
}
export function vacationPayCents(monthlySalaryCents, days = 30) {
    const d = int(days, 'dias', 1);
    if (d > 30n)
        throw new RangeError(`dias inválidos: ${days}`);
    const baseCents = toNumber(roundDivBig(int(monthlySalaryCents, 'salário') * d, 30n));
    const thirdCents = toNumber(roundDivBig(BigInt(baseCents), 3n));
    return { baseCents, thirdCents, totalCents: baseCents + thirdCents };
}
export const INCOME_TAX_MAX_QUOTAS = 8;
export const INCOME_TAX_MIN_QUOTA_CENTS = 5_000;
export const INCOME_TAX_SINGLE_PAYMENT_BELOW_CENTS = 10_000;
export function incomeTaxMaxQuotas(taxCents) {
    const tax = int(taxCents, 'imposto');
    if (tax === 0n)
        return 0;
    if (tax < BigInt(INCOME_TAX_SINGLE_PAYMENT_BELOW_CENTS))
        return 1;
    return Math.min(INCOME_TAX_MAX_QUOTAS, Number(tax / BigInt(INCOME_TAX_MIN_QUOTA_CENTS)));
}
export function incomeTaxQuotas(taxCents, quotas) {
    const n = int(quotas, 'quotas', 1);
    if (Number(n) > incomeTaxMaxQuotas(taxCents))
        throw new RangeError(`quotas demais para o imposto: ${quotas}`);
    return sharesCents(taxCents, Array.from({ length: Number(n) }, () => 1));
}
