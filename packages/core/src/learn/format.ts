import { roundDivBig } from './math';

/** Inteiro com separador de milhar: 1234567 → "1.234.567". */
export function formatInteger(value: number): string {
  const sign = value < 0 ? '-' : '';
  return sign + String(Math.abs(Math.trunc(value))).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** Número em centésimos (ou décimos etc.) com `casas` casas e vírgula: (2627, 2) → "26,27". */
function decimalText(scaled: bigint, casas: number): string {
  const negative = scaled < 0n;
  const abs = negative ? -scaled : scaled;
  const unit = 10n ** BigInt(casas);
  const intPart = formatInteger(Number(abs / unit));
  const dec = casas > 0 ? `,${String(abs % unit).padStart(casas, '0')}` : '';
  return `${negative ? '-' : ''}${intPart}${dec}`;
}

/**
 * Pontos-base como percentual, com `casas` casas (0 a 2), metade para cima: formatBp(2627) → "26,27%",
 * formatBp(2627, 1) → "26,3%", formatBp(1_000_000) → "10.000,00%".
 */
export function formatBp(bp: number, casas = 2): string {
  if (!Number.isSafeInteger(bp)) throw new RangeError(`bp inválido: ${bp}`);
  if (!Number.isInteger(casas) || casas < 0 || casas > 2) throw new RangeError(`casas inválidas: ${casas}`);
  const scaled = roundDivBig(BigInt(bp), 10n ** BigInt(2 - casas));
  return `${decimalText(scaled, casas)}%`;
}

/**
 * Pontos-base como a pessoa digitaria, sem zeros à direita: 800 → "8%", 150 → "1,5%", 196 → "1,96%".
 */
export function formatBpCompact(bp: number): string {
  return formatBp(bp, 2).replace(/,00%$/, '%').replace(/(,\d)0%$/, '$1%');
}

/**
 * Taxa como fração (0,019629…) em percentual com 2 casas, metade para cima: formatRate(0.019629) → "1,96%".
 * O ruído de ponto flutuante abaixo de 10^-6 bp é descartado antes de arredondar.
 */
export function formatRate(rate: number, casas = 2): string {
  if (!Number.isFinite(rate)) throw new RangeError(`taxa inválida: ${rate}`);
  const bp = rate * 10_000;
  const clean = Number(bp.toFixed(6));
  const unit = 10 ** (2 - casas);
  const scaled = Math.sign(clean) * Math.floor(Math.abs(clean) / unit + 0.5);
  return formatBp(scaled * unit, casas);
}

/** Décimos de ponto percentual: 400 → "40%", 234 → "23,4%", 1 → "0,1%". */
export function formatTenths(tenths: number): string {
  if (!Number.isSafeInteger(tenths)) throw new RangeError(`décimos inválidos: ${tenths}`);
  const negative = tenths < 0;
  const abs = Math.abs(tenths);
  const text = abs % 10 === 0 ? formatInteger(abs / 10) : `${formatInteger(Math.floor(abs / 10))},${abs % 10}`;
  return `${negative ? '-' : ''}${text}%`;
}
