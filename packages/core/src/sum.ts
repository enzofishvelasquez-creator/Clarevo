import { MAX_RECORD_CENTS, formatBRL, parseBRL, type Cents } from './money';

/**
 * "Somar valores" nos campos Valor (docs/08 §2.2): cada valor passa por parseBRL, a soma é inteira em centavos, o
 * total respeita MAX_RECORD_CENTS e só o total é salvo (o campo recebe o total formatado).
 */
export type SumError = 'invalido' | 'acima_do_limite' | 'total_alto';

export type SumResult = { ok: true; cents: Cents; count: number } | { ok: false; index: number; error: SumError };

/** Até 10 valores por soma. */
export const SUM_MAX_VALUES = 10;

/**
 * Soma os textos, ignorando os em branco. Erro no primeiro valor inválido (index dele), ou no valor que faz o total
 * passar de R$ 9.999.999,99 (total_alto). Sem nenhum valor: { ok: true, cents: 0, count: 0 }.
 * sumAmounts(['35,90', '12,50']) → { ok: true, cents: 4840, count: 2 }.
 */
export function sumAmounts(texts: readonly string[]): SumResult {
  let cents = 0;
  let count = 0;
  for (let index = 0; index < texts.length; index++) {
    const text = texts[index]!;
    if (text.trim() === '') continue;
    const value = parseBRL(text);
    if (value === null) return { ok: false, index, error: 'invalido' };
    if (value > MAX_RECORD_CENTS) return { ok: false, index, error: 'acima_do_limite' };
    cents += value;
    count += 1;
    if (cents > MAX_RECORD_CENTS) return { ok: false, index, error: 'total_alto' };
  }
  return { ok: true, cents, count };
}

export const SUM_TEXT = {
  open: 'Somar valores',
  add: 'Adicionar outro valor',
  use: 'Usar o total',
  close: 'Fechar a soma',
  /** "Total: R$ 48,40" (anunciado ao leitor de tela). */
  total: (cents: Cents) => `Total: ${formatBRL(cents)}`,
  /** Nome acessível de cada campo: "Valor 1 da soma". */
  itemLabel: (index: number) => `Valor ${index + 1} da soma`,
  remove: (index: number) => `Tirar o valor ${index + 1} da soma`,
  /** Ao chegar a 10 valores, no lugar de "Adicionar outro valor". */
  maxReached: 'Dá para somar até 10 valores.',
  errors: {
    invalido: 'Confira este valor, como 35,90.',
    acima_do_limite: 'O valor máximo é R$ 9.999.999,99.',
    total_alto: 'A soma passa do valor máximo de R$ 9.999.999,99.',
  } satisfies Record<SumError, string>,
} as const;
