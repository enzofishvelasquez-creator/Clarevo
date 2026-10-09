import { MAX_RECORD_CENTS, parseBRL, type Cents } from '../money';

/**
 * Leitura do que a pessoa digita nas calculadoras. Nada aqui lança: cada campo devolve o valor ou um código.
 * Valores em reais passam por parseBRL (centavos inteiros, até MAX_RECORD_CENTS); taxas viram pontos-base inteiros.
 */
export type CalcErrorCode =
  /** Campo obrigatório em branco (ou opção não escolhida). */
  | 'vazio'
  /** Texto que não é número no formato aceito. */
  | 'invalido'
  /** Taxa com 3 casas ou mais depois da vírgula. */
  | 'casas_demais'
  /** Número fora da faixa do campo. */
  | 'fora_da_faixa'
  /** Valor em reais igual a zero onde precisa ser maior que zero. */
  | 'zero'
  /** Valor em reais acima de R$ 9.999.999,99. */
  | 'acima_do_limite'
  /** Texto (apelido) acima do tamanho máximo. */
  | 'longo'
  /** O resultado passaria do maior número que a calculadora mostra (só em valores e prazos extremos). */
  | 'resultado_alto';

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: CalcErrorCode };

/** Mensagens genéricas por código; cada campo pode ter a sua em CalcFieldSpec.errors (calcErrorText). */
export const CALC_ERROR_TEXT: Record<CalcErrorCode, string> = {
  vazio: 'Preencha este campo.',
  invalido: 'Confira o número digitado.',
  casas_demais: 'Use até 2 casas depois da vírgula, como 1,96.',
  fora_da_faixa: 'Use um número dentro da faixa indicada.',
  zero: 'Informe um valor maior que zero.',
  acima_do_limite: 'O valor máximo é R$ 9.999.999,99.',
  longo: 'Use no máximo 20 caracteres.',
  resultado_alto: 'Com estes números, o resultado passa do que a calculadora mostra. Use um valor ou um prazo menor.',
};

/**
 * Taxa em percentual → pontos-base inteiros. Aceita "1,96", "1.96", "2", "2%", "2 %", " 14 ", "2," e ",5".
 * Até 2 casas (3 ou mais: casas_demais); vazio: vazio; outro texto: invalido; fora de [min, max] (em bp):
 * fora_da_faixa. parsePercentBp('1,96', { min: 1, max: 9999 }) → { ok: true, value: 196 }.
 */
export function parsePercentBp(text: string, range: { min: number; max: number }): Parsed<number> {
  const raw = text.trim().replace(/\s*%$/, '');
  if (raw === '') return { ok: false, error: 'vazio' };
  const m = /^(\d*)(?:[.,](\d*))?$/.exec(raw);
  if (!m || (m[1] === '' && (m[2] ?? '') === '')) return { ok: false, error: 'invalido' };
  const intPart = m[1]!.replace(/^0+(?=\d)/, '');
  const decPart = m[2] ?? '';
  if (decPart.length > 2) return { ok: false, error: 'casas_demais' };
  if (intPart.length > 7) return { ok: false, error: 'fora_da_faixa' };
  const bp = Number(intPart || '0') * 100 + Number(decPart.padEnd(2, '0'));
  if (bp < range.min || bp > range.max) return { ok: false, error: 'fora_da_faixa' };
  return { ok: true, value: bp };
}

/**
 * Número inteiro de min a max: "12", " 36 ", "3.650" (milhar com ponto). Vazio: vazio; "12,5" ou "abc": invalido;
 * fora da faixa: fora_da_faixa.
 */
export function parseCount(text: string, min: number, max: number): Parsed<number> {
  const raw = text.trim();
  if (raw === '') return { ok: false, error: 'vazio' };
  if (!/^(\d+|\d{1,3}(\.\d{3})+)$/.test(raw)) return { ok: false, error: 'invalido' };
  const digits = raw.replace(/\./g, '').replace(/^0+(?=\d)/, '');
  if (digits.length > 9) return { ok: false, error: 'fora_da_faixa' };
  const value = Number(digits);
  if (value < min || value > max) return { ok: false, error: 'fora_da_faixa' };
  return { ok: true, value };
}

/**
 * Valor em reais (parseBRL) → centavos. Vazio: vazio; formato não aceito: invalido; acima de R$ 9.999.999,99:
 * acima_do_limite; zero sem allowZero: zero.
 */
export function parseMoney(text: string, opts: { allowZero?: boolean } = {}): Parsed<Cents> {
  if (text.trim() === '') return { ok: false, error: 'vazio' };
  const cents = parseBRL(text);
  if (cents === null) return { ok: false, error: 'invalido' };
  if (cents > MAX_RECORD_CENTS) return { ok: false, error: 'acima_do_limite' };
  if (cents === 0 && !opts.allowZero) return { ok: false, error: 'zero' };
  return { ok: true, value: cents };
}

/** Campo opcional em reais: em branco vale null (sem erro); zero é aceito. */
export function parseOptionalMoney(text: string | undefined): Parsed<Cents | null> {
  if (text === undefined || text.trim() === '') return { ok: true, value: null };
  return parseMoney(text, { allowZero: true });
}
