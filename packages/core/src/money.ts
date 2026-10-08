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
 * Aceita "80", "80,00", "80,5", "1.234,56", "1234,56", "R$ 80" e, sem vírgula, ponto como decimal
 * com 1 ou 2 casas ("12.50"), comum em teclados numéricos.
 * Rejeita (retorna null): vazio, negativo, mais de duas casas, espaços no meio ("12 34")
 * e agrupamento ambíguo ("1,234", "1.2345,00").
 * Converte direto para centavos inteiros, sem passar por ponto flutuante.
 * Valores com dígitos demais voltam acima do limite, para a mensagem de limite aparecer.
 */
export function parseBRL(input: string): Cents | null {
  const raw = input.trim().replace(/^R\$\s*/i, '');
  if (raw === '') return null;
  let intPart: string;
  let decPart = '';
  const brl = /^(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?$/.exec(raw);
  const dotDecimal = /^(\d+)\.(\d{1,2})$/.exec(raw);
  if (brl) {
    intPart = brl[1]!.replace(/\./g, '');
    decPart = brl[2] ?? '';
  } else if (dotDecimal) {
    intPart = dotDecimal[1]!;
    decPart = dotDecimal[2]!;
  } else {
    return null;
  }
  const intDigits = intPart.replace(/^0+(?=\d)/, '');
  if (intDigits.length > 13) return MAX_RECORD_CENTS + 1;
  return Number(intDigits) * 100 + Number(decPart.padEnd(2, '0'));
}

/** Divisão de inteiros não negativos com metade para cima: floor((2a + b) / (2b)). */
export function roundDiv(a: number, b: number): number {
  return Math.floor((2 * a + b) / (2 * b));
}

/** Divisão de inteiros não negativos para cima: floor((a + b − 1) / b). */
export function ceilDiv(a: number, b: number): number {
  return Math.floor((a + b - 1) / b);
}
