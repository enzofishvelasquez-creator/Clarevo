/**
 * Valores monetários são guardados em centavos inteiros (BRL).
 * Nunca usar ponto flutuante para somar dinheiro.
 */
export type Cents = number;

/** Limite inicial por registro: R$ 9.999.999,99 (validado também no banco). */
export const MAX_RECORD_CENTS = 999_999_999;

const BRL = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** 210000 → "R$ 2.100,00" (espaço comum, não o espaço fino do Intl). */
export function formatBRL(cents: Cents): string {
  return BRL.format(cents / 100).replace(/ /g, ' ');
}

/** 8000 → "80,00": valor para preencher um campo em edição. */
export function centsToInput(cents: Cents): string {
  return formatBRL(cents).replace(/^-?R\$\s?/, '');
}

/**
 * Lê o que a pessoa digitou em "Valor em reais".
 * Aceita "80", "80,00", "80,5", "1.234,56", "1234,56" e "R$ 80".
 * Rejeita (retorna null): vazio, negativo, mais de duas casas, ponto como decimal ("12.34")
 * e agrupamento ambíguo ("1.40", "1,234").
 * Converte direto para centavos inteiros, sem passar por ponto flutuante.
 */
export function parseBRL(input: string): Cents | null {
  const raw = input.replace(/R\$/gi, '').replace(/\s/g, '');
  if (raw === '') return null;
  if (!/^(\d{1,3}(\.\d{3})+|\d+)(,\d{1,2})?$/.test(raw)) return null;
  const [intPart = '0', decPart = ''] = raw.replace(/\./g, '').split(',');
  const intDigits = intPart.replace(/^0+(?=\d)/, '');
  if (intDigits.length > 13) return null;
  const cents = Number(intDigits) * 100 + Number(decPart.padEnd(2, '0'));
  return Number.isSafeInteger(cents) ? cents : null;
}
