import type { Cents } from '../money';

/**
 * Contas de juros, parcelas e divisão usadas em Aprender e nas calculadoras (spec3 §3.11, spec4 §1.1).
 *
 * - Dinheiro em centavos inteiros; taxas em pontos-base inteiros (1,96% = 196 bp).
 * - Potências inteiras em aritmética exata com BigInt (racionais), arredondando só no fim, metade para cima.
 * - Ponto flutuante só em expoente fracionário (presentValueCents com prazo não inteiro) e na bisseção
 *   (impliedMonthlyRate).
 * - Entradas fora do domínio (negativas, não inteiras, não finitas) lançam RangeError: as calculadoras validam antes.
 */

const BP = 10_000n;
const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

function int(value: number, name: string, min = 0): bigint {
  if (!Number.isSafeInteger(value) || value < min) throw new RangeError(`${name} inválido: ${value}`);
  return BigInt(value);
}

function toNumber(value: bigint): number {
  if (value > MAX_SAFE || value < -MAX_SAFE) throw new RangeError('resultado grande demais');
  return Number(value);
}

/**
 * Divisão de inteiros com arredondamento metade para cima (para longe do zero quando o resultado é negativo).
 * roundDivBig(5n, 2n) = 3n; roundDivBig(-5n, 2n) = -3n. Divisor zero lança RangeError.
 */
export function roundDivBig(a: bigint, b: bigint): bigint {
  if (b === 0n) throw new RangeError('divisão por zero');
  if (b < 0n) {
    a = -a;
    b = -b;
  }
  if (a >= 0n) return (2n * a + b) / (2n * b);
  return -((2n * -a + b) / (2n * b));
}

/** Juros simples: principal × (1 + taxa × meses). simpleTotalCents(100.000, 200, 12) = 124.000. */
export function simpleTotalCents(principalCents: Cents, monthlyBp: number, months: number): Cents {
  const p = int(principalCents, 'principal');
  return toNumber(p + roundDivBig(p * int(monthlyBp, 'taxa') * int(months, 'meses'), BP));
}

/** Total com juros compostos, exato até o fim: compoundTotalBig(100.000, 1.500, 3) = 152.088n. */
export function compoundTotalBig(principalCents: Cents, monthlyBp: number, months: number): bigint {
  const n = int(months, 'meses');
  return roundDivBig(int(principalCents, 'principal') * (BP + int(monthlyBp, 'taxa')) ** n, BP ** n);
}

/**
 * Juros compostos: principal × (1 + taxa)^meses, exato e arredondado só no fim.
 * compoundTotalCents(100.000, 1.500, 3) = 152.088 (ponto flutuante daria 152.087). Resultado acima de
 * Number.MAX_SAFE_INTEGER lança RangeError (use compoundTotalBig para conferir antes).
 */
export function compoundTotalCents(principalCents: Cents, monthlyBp: number, months: number): Cents {
  return toNumber(compoundTotalBig(principalCents, monthlyBp, months));
}

/** Taxa ao ano equivalente, em bp: (1 + i)^12 − 1. equivalentAnnualBp(200) = 2.682 (26,82%). */
export function equivalentAnnualBp(monthlyBp: number): number {
  const q = BP + int(monthlyBp, 'taxa');
  return toNumber(roundDivBig(q ** 12n - BP ** 12n, BP ** 11n));
}

/**
 * Taxa ao mês equivalente, em bp: (1 + a)^(1/12) − 1, arredondada metade para cima.
 * O palpite vem de ponto flutuante e é conferido em inteiros: r é o maior inteiro com
 * (20.000 + 2r − 1)^12 ≤ 2^12 × 10.000^11 × (10.000 + a). equivalentMonthlyBp(1.200) = 95 (0,95%).
 */
export function equivalentMonthlyBp(annualBp: number): number {
  const a = int(annualBp, 'taxa');
  const limit = 2n ** 12n * BP ** 11n * (BP + a);
  const fits = (r: number) => (20_000n + 2n * BigInt(r) - 1n) ** 12n <= limit;
  let r = Math.max(0, Math.floor(10_000 * (Math.pow(1 + annualBp / 10_000, 1 / 12) - 1) + 0.5));
  while (fits(r + 1)) r += 1;
  while (r > 0 && !fits(r)) r -= 1;
  return r;
}

/** Taxa ao ano equivalente a uma taxa ao mês dada como fração (0,0196 → 0,2627…), em ponto flutuante. */
export function equivalentAnnualRate(monthlyRate: number): number {
  if (!Number.isFinite(monthlyRate) || monthlyRate <= -1) throw new RangeError(`taxa inválida: ${monthlyRate}`);
  return Math.expm1(12 * Math.log1p(monthlyRate));
}

/**
 * Parcela da tabela Price: P × i × (1 + i)^n ÷ ((1 + i)^n − 1), exata e arredondada metade para cima.
 * Taxa zero: P ÷ n, metade para cima. installmentCents(500.000, 200, 12) = 47.280.
 */
export function installmentCents(principalCents: Cents, monthlyBp: number, installments: number): Cents {
  const p = int(principalCents, 'principal');
  const bp = int(monthlyBp, 'taxa');
  const n = int(installments, 'parcelas', 1);
  if (bp === 0n) return toNumber(roundDivBig(p, n));
  const qn = (BP + bp) ** n;
  return toNumber(roundDivBig(p * bp * qn, BP * (qn - BP ** n)));
}

export interface SacRow {
  amortizationCents: Cents;
  interestCents: Cents;
  paymentCents: Cents;
}

export interface SacTotals {
  rows: SacRow[];
  interestCents: Cents;
  totalCents: Cents;
  firstCents: Cents;
  lastCents: Cents;
}

/**
 * Tabela SAC: amortização constante (P ÷ n; os centavos que sobram vão para as primeiras parcelas) e juros sobre o
 * saldo de cada mês, arredondados metade para cima. sacTotals(1.200.000, 100, 12): juros 78.000, 1ª 112.000, 12ª 101.000.
 */
export function sacTotals(principalCents: Cents, monthlyBp: number, installments: number): SacTotals {
  const p = int(principalCents, 'principal');
  const bp = int(monthlyBp, 'taxa');
  const n = int(installments, 'parcelas', 1);
  const base = p / n;
  const extra = p % n;
  let balance = p;
  let interestSum = 0n;
  let totalSum = 0n;
  const rows: SacRow[] = [];
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
    firstCents: rows[0]!.paymentCents,
    lastCents: rows[rows.length - 1]!.paymentCents,
  };
}

/**
 * Valor presente de parcelas iguais: Σ parcela ÷ (1 + i)^t, com t em meses (0 = hoje).
 * Com todos os prazos inteiros, a soma é exata (racional) e arredondada só no fim; com algum prazo fracionário
 * (dias ÷ 30), a soma inteira é em ponto flutuante. presentValueCents(85.000, 150, [1..36]) = 2.351.158.
 */
export function presentValueCents(paymentCents: Cents, monthlyBp: number, times: readonly number[]): Cents {
  const pay = int(paymentCents, 'parcela');
  const bp = int(monthlyBp, 'taxa');
  for (const t of times) if (!Number.isFinite(t) || t < 0) throw new RangeError(`prazo inválido: ${t}`);
  if (times.length === 0) return 0;
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
  for (const t of times) sum += paymentCents / Math.pow(1 + rate, t);
  return Math.floor(sum + 0.5);
}

/** Fator de valor presente de n parcelas: (1 − (1 + i)^−n) ÷ i, estável para i pequeno. */
function annuityFactor(rate: number, n: number): number {
  if (rate === 0) return n;
  return -Math.expm1(-n * Math.log1p(rate)) / rate;
}

/**
 * Taxa ao mês (fração, sem arredondar) que faz n parcelas iguais valerem o principal hoje, pela tabela Price:
 * principal = parcela × (1 − (1 + i)^−n) ÷ i, por bisseção. Soma das parcelas igual ao principal: 0.
 * Sem solução (soma menor que o principal, principal zero ou taxa sem limite): null.
 * impliedMonthlyRate(108.000, 12.000, 10) ≈ 0,019630 (1,96% ao mês, 26,27% ao ano).
 */
export function impliedMonthlyRate(principalCents: Cents, paymentCents: Cents, installments: number): number | null {
  int(principalCents, 'principal');
  int(paymentCents, 'parcela');
  int(installments, 'parcelas', 1);
  const total = paymentCents * installments;
  if (principalCents <= 0 || total < principalCents) return null;
  if (total === principalCents) return 0;
  const f = (rate: number) => paymentCents * annuityFactor(rate, installments) - principalCents;
  let lo = 0;
  let hi = 1;
  while (f(hi) > 0) {
    hi *= 2;
    if (hi > 2 ** 60) return null;
  }
  for (let k = 0; k < 400; k++) {
    const mid = (lo + hi) / 2;
    if (mid <= lo || mid >= hi) break;
    if (f(mid) > 0) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** IOF de crédito para pessoa física, em partes por milhão: 0,38% fixo e 0,0082% ao dia, até 365 dias. */
export const IOF_FIXED_PPM = 3_800;
export const IOF_DAILY_PPM = 82;
export const IOF_MAX_DAYS = 365;

/**
 * IOF de uma operação de crédito: parte fixa e parte diária, cada uma arredondada metade para cima.
 * iofCents(200.000, 90) = { fixedCents: 760, dailyCents: 1.476, totalCents: 2.236 }. Teto: 33.730 ppm (3,37%).
 */
export function iofCents(principalCents: Cents, days: number): { fixedCents: Cents; dailyCents: Cents; totalCents: Cents } {
  const p = int(principalCents, 'principal');
  const d = BigInt(Math.min(Number(int(days, 'dias')), IOF_MAX_DAYS));
  const fixedCents = toNumber(roundDivBig(p * BigInt(IOF_FIXED_PPM), 1_000_000n));
  const dailyCents = toNumber(roundDivBig(p * BigInt(IOF_DAILY_PPM) * d, 1_000_000n));
  return { fixedCents, dailyCents, totalCents: fixedCents + dailyCents };
}

/**
 * Multa e juros depois do vencimento: multa = valor × multa; juros = valor × juros ao mês × dias ÷ 30 (simples e
 * proporcionais), cada um arredondado metade para cima. lateChargesCents(20.000, 200, 100, 10) = 400 + 67 = 20.467.
 */
export function lateChargesCents(
  valueCents: Cents,
  fineBp: number,
  monthlyInterestBp: number,
  days: number,
): { fineCents: Cents; interestCents: Cents; totalCents: Cents } {
  const v = int(valueCents, 'valor');
  const fineCents = toNumber(roundDivBig(v * int(fineBp, 'multa'), BP));
  const interestCents = toNumber(roundDivBig(v * int(monthlyInterestBp, 'juros') * int(days, 'dias'), BP * 30n));
  return { fineCents, interestCents, totalCents: valueCents + fineCents + interestCents };
}

/** Valor de hoje em dinheiro de antes: valor ÷ (1 + inflação). realValueCents(100.000, 500) = 95.238. */
export function realValueCents(valueCents: Cents, inflationBp: number): Cents {
  return toNumber(roundDivBig(int(valueCents, 'valor') * BP, BP + int(inflationBp, 'inflação')));
}

/**
 * Percentual com uma casa, em décimos, metade para cima (D-026(3)): (2.000 × parte + todo) ÷ (2 × todo), divisão
 * inteira. percentTenths(115.000, 600.000) = 192 (19,2%). Todo zero ou negativo: 0.
 */
export function percentTenths(part: number, whole: number): number {
  const p = int(part, 'parte');
  if (!Number.isSafeInteger(whole) || whole <= 0) return 0;
  const w = BigInt(whole);
  return toNumber((2000n * p + w) / (2n * w));
}

/**
 * Divide um total em partes proporcionais aos pesos, pelo maior resto: cada parte recebe o piso e os centavos que
 * sobram vão para os maiores restos (empate: a primeira da lista). A soma sempre fecha com o total.
 * sharesCents(10.000, [1, 1, 1]) = [3.334, 3.333, 3.333]. Pesos inteiros, não negativos e com soma maior que zero.
 */
export function sharesCents(totalCents: Cents, weights: readonly number[]): Cents[] {
  const total = int(totalCents, 'total');
  const w = weights.map((x) => int(x, 'peso'));
  const sum = w.reduce((a, b) => a + b, 0n);
  if (sum === 0n) throw new RangeError('pesos sem soma');
  const base = w.map((x) => (total * x) / sum);
  const rest = w.map((x, i) => ({ i, r: (total * x) % sum }));
  let left = total - base.reduce((a, b) => a + b, 0n);
  rest.sort((a, b) => (a.r === b.r ? a.i - b.i : a.r > b.r ? -1 : 1));
  for (const { i } of rest) {
    if (left === 0n) break;
    base[i] = base[i]! + 1n;
    left -= 1n;
  }
  return base.map(toNumber);
}

/** Parte por mês para juntar um total em n meses, para cima no centavo: monthlyShareCents(450.000, 12) = 37.500. */
export function monthlyShareCents(totalCents: Cents, months: number): Cents {
  const total = int(totalCents, 'total');
  const n = int(months, 'meses', 1);
  return toNumber((total + n - 1n) / n);
}

/** Média em centavos, metade para cima: averageCents([16.530, 18.000, 17.190]) = 17.240. Lista vazia: RangeError. */
export function averageCents(values: readonly Cents[]): Cents {
  if (values.length === 0) throw new RangeError('lista vazia');
  const sum = values.reduce((acc, v) => acc + int(v, 'valor'), 0n);
  return toNumber(roundDivBig(sum, BigInt(values.length)));
}

/** Meses para juntar um valor guardando o mesmo tanto por mês, para cima: monthsToReach(375.000, 50.000) = 8. */
export function monthsToReach(targetCents: Cents, monthlyCents: Cents): number {
  const m = int(monthlyCents, 'por mês', 1);
  if (!Number.isSafeInteger(targetCents)) throw new RangeError(`alvo inválido: ${targetCents}`);
  if (targetCents <= 0) return 0;
  const t = BigInt(targetCents);
  return toNumber((t + m - 1n) / m);
}
