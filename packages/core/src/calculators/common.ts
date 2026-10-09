import { formatInteger, formatRate } from '../learn/format';
import type { CalcErrorCode, Parsed } from './inputs';

/** Resultado de uma calculadora: o cálculo ou os erros por campo (um código por campo). */
export type CalcOutcome<R, F extends string> = { ok: true; result: R } | { ok: false; errors: Partial<Record<F, CalcErrorCode>> };

/** Textos montados no core; o app só exibe, na ordem. */
export interface CalcTexts {
  /** Frases do resultado; a primeira é o destaque. */
  resultLines: string[];
  /** Hipóteses, listadas logo abaixo do resultado. */
  hypotheses: string[];
  /** Avisos que acompanham o resultado (teto do cheque especial, CET, estimativa, boleto atualizado). */
  notes: string[];
}

export type CalcFieldKind = 'dinheiro' | 'taxa' | 'inteiro' | 'opcao' | 'sim_nao' | 'texto';

/** Descrição de um campo: rótulo visível, dica, tipo, faixa e mensagens de erro próprias. */
export interface CalcFieldSpec {
  label: string;
  /** Dica curta abaixo do rótulo (faixa, onde achar o número). */
  hint?: string;
  /** dinheiro e taxa: teclado decimal; inteiro: numérico; opcao: chips; sim_nao: Não | Sim; texto: livre. */
  kind: CalcFieldKind;
  /** Campo que pode ficar em branco. */
  optional?: boolean;
  /** inteiro: contagem; taxa: em pontos-base. */
  min?: number;
  max?: number;
  /** opcao: valores e rótulos, na ordem dos chips. */
  options?: readonly { value: string; label: string }[];
  /** Valor inicial (sim_nao e opcao); ausente: nada marcado. */
  default?: string | boolean;
  /** Mensagens deste campo; o que faltar vem de CALC_ERROR_TEXT. */
  errors?: Partial<Record<CalcErrorCode, string>>;
}

export const LIMIT_TEXT = 'O valor máximo é R$ 9.999.999,99.';

/** Campo em reais com mensagens no padrão do app ("Digite o preço à vista, como 1.080,00."). */
export function moneyField(label: string, what: string, example: string, extra: Partial<CalcFieldSpec> = {}): CalcFieldSpec {
  return {
    label,
    kind: 'dinheiro',
    ...extra,
    errors: {
      vazio: `Digite ${what}, como ${example}.`,
      invalido: `Confira o valor, como ${example}.`,
      zero: `Informe um valor maior que zero, como ${example}.`,
      acima_do_limite: LIMIT_TEXT,
      ...extra.errors,
    },
  };
}

/** Taxa em percentual, com a faixa em bp ("Digite a taxa ao mês, como 2,5."). */
export function rateField(label: string, what: string, example: string, min: number, max: number, rangeText: string, hint?: string): CalcFieldSpec {
  return {
    label,
    kind: 'taxa',
    min,
    max,
    ...(hint ? { hint } : {}),
    errors: {
      vazio: `Digite ${what}, como ${example}.`,
      invalido: `Use só números, como ${example}.`,
      casas_demais: `Use até 2 casas depois da vírgula, como ${example}.`,
      fora_da_faixa: rangeText,
    },
  };
}

/** Número inteiro de min a max ("Digite o número de parcelas, de 2 a 480."). */
export function countField(label: string, what: string, min: number, max: number, rangeText: string, hint?: string): CalcFieldSpec {
  return {
    label,
    kind: 'inteiro',
    min,
    max,
    ...(hint ? { hint } : {}),
    errors: {
      vazio: `Digite ${what}, de ${formatInteger(min)} a ${formatInteger(max)}.`,
      invalido: 'Use só números inteiros, como 12.',
      fora_da_faixa: rangeText,
    },
  };
}

/** Lê os campos e junta os erros: quem chama recebe os valores ou o mapa de erros por campo. */
export class FieldReader<F extends string> {
  readonly errors: Partial<Record<F, CalcErrorCode>> = {};

  /** Valor do campo, ou undefined com o erro guardado. */
  read<T>(field: F, parsed: Parsed<T>): T | undefined {
    if (parsed.ok) return parsed.value;
    this.errors[field] = parsed.error;
    return undefined;
  }

  fail(field: F, code: CalcErrorCode): undefined {
    this.errors[field] = code;
    return undefined;
  }

  get ok(): boolean {
    return Object.keys(this.errors).length === 0;
  }
}

/** "1 mês", "6 meses". */
export function monthsCount(n: number): string {
  return n === 1 ? '1 mês' : `${formatInteger(n)} meses`;
}

/** Prazo em meses, com anos a partir de 12: "8 meses", "18 meses (1 ano e 6 meses)", "36 meses (3 anos)". */
export function monthsDuration(n: number): string {
  if (n < 12) return monthsCount(n);
  const years = Math.floor(n / 12);
  const rest = n % 12;
  const y = years === 1 ? '1 ano' : `${formatInteger(years)} anos`;
  return `${monthsCount(n)} (${rest === 0 ? y : `${y} e ${monthsCount(rest)}`})`;
}

/** "1 dia", "10 dias". */
export function daysCount(n: number): string {
  return n === 1 ? '1 dia' : `${formatInteger(n)} dias`;
}

/** Acima disto (10.000% ao mês ou ao ano), a taxa aparece como "mais de 10.000%". */
export const RATE_DISPLAY_MAX = 100;

/** Taxa (fração) para o texto, com o teto de RATE_DISPLAY_MAX: "1,96%" ou "mais de 10.000%". */
export function rateText(rate: number): string {
  return rate > RATE_DISPLAY_MAX ? 'mais de 10.000%' : formatRate(rate);
}
