import { MAX_RECORD_CENTS, centsToInput, parseBRL } from './money';

/**
 * Máscara de moeda dos campos de valor (estudo de 25/11/2026, sinal 26: "R$ 2000" ao lado de "R$ 400,00"). Vale em todo campo com o
 * prefixo "R$" (o `TextField` do app aplica as funções daqui): enquanto a pessoa digita, os milhares ganham o ponto ("2000" vira "2.000")
 * e a vírgula das casas decimais fica como foi digitada; ao sair do campo, o valor fica completo ("2.000,00").
 *
 * O que mudou é lido pela parte comum do texto de antes e do de agora (começo e fim iguais); o trecho do meio é o que entrou:
 * - Um caractere digitado (também por cima de uma seleção):
 *   - algarismo ou vírgula: os milhares são reagrupados (os pontos são da máscara);
 *   - ponto: no teclado do computador, o ponto é o separador de milhares ("1.500", "10.000,00"); no teclado numérico de muitos celulares,
 *     que só tem o ponto, ele separa os centavos ("12.5"). Por isso o ponto digitado fica como está até ficar claro: seguido de três
 *     algarismos, é o dos milhares e a máscara volta a agrupar ("1.500"); com um ou dois algarismos depois, `parseBRL` lê como centavos e,
 *     ao sair do campo, vira a vírgula ("12.5" vira "12,50"). Enquanto isso, os pontos da máscara saem ("1.234" mais um ponto vira
 *     "1234."), para o texto continuar lido por `parseBRL` ("1234.56" é 1.234,56). Com a vírgula já digitada, ou com outro ponto ainda em
 *     aberto, o ponto é ignorado.
 * - Apagar: apagar um ponto da máscara apaga o algarismo antes dele (o de depois, com a tecla Delete, `forward`), porque o ponto voltaria
 *   sozinho e a tecla não faria nada; apagar outro caractere reagrupa os milhares.
 * - Mais de um caractere de uma vez (colado ou preenchido): segue a leitura de `parseBRL`, sem mudar o valor lido ("12.50" é 12,50, "9.99"
 *   por cima de "8,00" é 9,99 e "1.250" é mil duzentos e cinquenta); um texto que `parseBRL` não lê ("1.2345") fica como está, para a
 *   validação do campo explicar.
 * - Texto com outra coisa além de algarismos, ponto e vírgula fica como está.
 *
 * `caret`: na web, a posição do cursor depois da edição (o navegador a dá no texto ainda sem a máscara). A função devolve a posição
 * equivalente no texto mascarado, com os mesmos algarismos e a mesma vírgula depois do cursor, para ele não pular para o fim quando os
 * pontos mudam de lugar.
 */
export interface MoneyEdit {
  text: string;
  caret: number;
}

export interface MoneyEditOptions {
  /** A tecla foi a de apagar para a frente (Delete): o ponto da máscara apagado leva o algarismo de depois dele. */
  forward?: boolean;
}

/** Ponto digitado ainda em aberto: algarismos, um ponto e até dois algarismos depois dele, sem vírgula ("12.", "12.5", "1234.56"). */
const PENDING_DOT = /^\d*\.\d{0,2}$/;
/** Caracteres que contam para o cursor: os algarismos e a vírgula (os pontos da máscara mudam de lugar). */
const SIGNIFICANT = /[\d,]/;

/** Os milhares agrupados de novo; a parte depois da vírgula fica como foi digitada. Com duas vírgulas, null. */
function regroup(text: string): string | null {
  const parts = text.split(',');
  if (parts.length > 2) return null;
  const digits = parts[0]!.replace(/\./g, '').replace(/^0+(?=\d)/, '');
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return parts.length === 2 ? `${grouped},${parts[1]!.replace(/\./g, '')}` : grouped;
}

/** O texto já está como a máscara o deixaria (só pontos da máscara). */
function isMasked(text: string): boolean {
  return regroup(text) === text;
}

/** Texto colado ou preenchido de uma vez: o mesmo valor de `parseBRL`, com os milhares agrupados; o que não se lê fica como está. */
function pasted(text: string): string {
  if (parseBRL(text) === null) return text;
  const dotDecimal = /^(\d+)\.(\d{1,2})$/.exec(text);
  return regroup(dotDecimal ? `${dotDecimal[1]},${dotDecimal[2]}` : text) ?? text;
}

/** O trecho que mudou: a posição, o que saiu e o que entrou (o começo e o fim iguais ficam de fora). */
export function moneyEditSpan(previous: string, next: string): { at: number; removed: string; inserted: string } {
  const max = Math.min(previous.length, next.length);
  let at = 0;
  while (at < max && previous[at] === next[at]) at++;
  let tail = 0;
  while (tail < max - at && previous[previous.length - 1 - tail] === next[next.length - 1 - tail]) tail++;
  return { at, removed: previous.slice(at, previous.length - tail), inserted: next.slice(at, next.length - tail) };
}

/** Quantos algarismos e vírgulas há depois da posição `at`. */
function significantAfter(text: string, at: number): number {
  let n = 0;
  for (let i = Math.max(0, at); i < text.length; i++) if (SIGNIFICANT.test(text[i]!)) n++;
  return n;
}

/** A posição mais à direita com `after` algarismos e vírgulas depois dela. */
function caretWith(text: string, after: number): number {
  for (let at = text.length; at >= 0; at--) if (significantAfter(text, at) >= after) return at;
  return 0;
}

/** Um caractere digitado (`typed`) na posição `at`, por cima do que estava selecionado. */
function typedChar(previous: string, next: string, at: number, typed: string): string {
  // O texto sem o caractere digitado: o de antes, sem a seleção.
  const rest = next.slice(0, at) + next.slice(at + 1);
  if (typed === '.') {
    if (next.includes(',') || (rest.includes('.') && !isMasked(rest))) return previous;
    const before = next.slice(0, at).replace(/\./g, '');
    const after = next.slice(at + 1).replace(/\./g, '');
    // Três algarismos depois: é o ponto dos milhares, no mesmo lugar em que a máscara o poria.
    if (after.length === 3) return regroup(before + after)!;
    // Até dois (ou nenhum, ainda): fica em aberto, sem os pontos da máscara. Com mais de três, não se lê de jeito nenhum: ignorado.
    return after.length < 3 ? `${before}.${after}` : previous;
  }
  // Com um ponto em aberto: o algarismo continua em aberto até o terceiro depois do ponto, que o fecha como o dos milhares.
  if (PENDING_DOT.test(rest)) {
    if (typed === ',') return next;
    return next.length - next.indexOf('.') - 1 < 3 ? next : regroup(next)!;
  }
  return regroup(next) ?? next;
}

/** A máscara aplicada a uma edição, com a posição do cursor no texto mascarado (veja a explicação no começo do arquivo). */
export function maskMoneyEdit(previous: string, next: string, caret: number = next.length, options: MoneyEditOptions = {}): MoneyEdit {
  if (!/^[\d.,]*$/.test(next)) return { text: next, caret };
  const after = significantAfter(next, caret);
  const result = (text: string, dropAfter = 0): MoneyEdit => ({ text, caret: caretWith(text, Math.max(0, after - dropAfter)) });
  const { at, removed, inserted } = moneyEditSpan(previous, next);
  if (inserted.length > 1) return result(pasted(next));
  if (inserted.length === 1) return result(typedChar(previous, next, at, inserted));
  // Só apagou.
  if (removed === '.' && isMasked(previous) && at > 0) {
    // Um ponto da máscara: apaga o algarismo antes dele (ou o de depois, com Delete), senão o ponto voltaria e nada mudaria.
    if (options.forward) return at < next.length ? result(regroup(next.slice(0, at) + next.slice(at + 1))!, 1) : result(regroup(next)!);
    return result(regroup(next.slice(0, at - 1) + next.slice(at))!);
  }
  if (PENDING_DOT.test(previous) && PENDING_DOT.test(next)) return result(next);
  return result(regroup(next) ?? next);
}

/** Só o texto da máscara (sem o cursor). */
export function maskMoneyTyping(previous: string, next: string, options: MoneyEditOptions = {}): string {
  return maskMoneyEdit(previous, next, next.length, options).text;
}

/**
 * Ao sair do campo: o valor completo ("2.000" vira "2.000,00", "12.5" vira "12,50"). Fica como está um texto que não é um valor e um
 * valor acima do limite de um registro (`parseBRL` devolve MAX_RECORD_CENTS + 1 como marca de "acima do limite", que não é um valor).
 */
export function completeMoneyText(text: string): string {
  const cents = parseBRL(text);
  return cents !== null && cents >= 0 && cents <= MAX_RECORD_CENTS ? centsToInput(cents) : text;
}

/**
 * O que gravar ao sair de um campo de valor: o valor completo (`completeMoneyText`), ou null quando nada deve mudar: o texto já está
 * completo, não é um valor, passa do limite, ou há um erro na tela. Com erro, o campo fica como está: o formulário apaga o erro do campo a
 * cada mudança, e completar "0" para "0,00" tiraria o "maior que zero" com o valor ainda inválido.
 */
export function moneyTextOnBlur(text: string, hasError: boolean): string | null {
  if (hasError) return null;
  const complete = completeMoneyText(text);
  return complete === text ? null : complete;
}
