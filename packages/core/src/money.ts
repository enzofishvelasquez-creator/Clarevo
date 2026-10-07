/**
 * Valores monetários são guardados em centavos inteiros (BRL).
 * Nunca usar ponto flutuante para somar dinheiro.
 */
export type Cents = number;

export function assertCents(value: number): Cents {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`Valor em centavos inválido: ${value}`);
  }
  return value;
}

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

/**
 * Lê o que a pessoa digitou em "Valor em reais".
 * Aceita "1.400,00", "1400,5", "1400", "R$ 80". Retorna null se não for um valor válido.
 * Não interpreta ponto como decimal ("1.400" = mil e quatrocentos).
 */
export function parseBRL(input: string): Cents | null {
  const raw = input.replace(/R\$/gi, '').replace(/\s/g, '');
  if (raw === '') return null;
  if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+(,\d{1,2})?$/.test(raw)) return null;
  const [intPart = '0', decPart = ''] = raw.replace(/\./g, '').split(',');
  const cents = Number(intPart) * 100 + Number(decPart.padEnd(2, '0'));
  return Number.isSafeInteger(cents) ? cents : null;
}
