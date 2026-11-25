import { centsToInput, parseBRL } from './money';

/**
 * Máscara de moeda dos campos de valor (estudo de 25/11/2026, sinal 26: "R$ 2000" ao lado de "R$ 400,00"). Vale em todo campo com o
 * prefixo "R$" (o `TextField` do app aplica as duas funções daqui): enquanto a pessoa digita, os milhares ganham o ponto ("2000" vira
 * "2.000") e a vírgula das casas decimais fica como foi digitada; ao sair do campo, o valor fica completo ("2.000,00"). O valor lido
 * nunca muda: o texto mascarado passa por `parseBRL` com o mesmo resultado do texto digitado.
 *
 * - Um ponto digitado pela pessoa (o teclado numérico de muitos celulares só tem o ponto) vale como a vírgula das casas decimais; com a
 *   vírgula já digitada, o ponto é ignorado.
 * - Apagar ou digitar um algarismo reagrupa os milhares (os pontos são da máscara).
 * - Texto colado (ou preenchido de uma vez) segue a leitura de `parseBRL`: "12.50" é 12,50 e "1.250" é mil duzentos e cinquenta; um
 *   agrupamento que não se lê ("1.2345") fica como está, para a validação do campo explicar.
 * - Texto com outra coisa além de algarismos, ponto e vírgula, ou com duas vírgulas, fica como está.
 */
export function maskMoneyTyping(previous: string, next: string): string {
  if (!/^[\d.,]*$/.test(next)) return next;
  const count = (s: string, c: string) => s.split(c).length - 1;
  const bare = (s: string) => s.replace(/\./g, '');
  let text = next;
  if (bare(next) === bare(previous) && count(next, '.') > count(previous, '.')) {
    // A pessoa digitou um ponto: vale como vírgula (sem vírgula ainda) ou é ignorado.
    if (next.includes(',')) return previous;
    let at = 0;
    while (at < previous.length && previous[at] === next[at]) at++;
    text = `${next.slice(0, at)},${next.slice(at + 1)}`;
  } else if (Math.abs(bare(next).length - bare(previous).length) > 1) {
    // Colado ou preenchido de uma vez: o ponto com uma ou duas casas no fim é decimal; outro ponto precisa ser um agrupamento que se lê.
    const dotDecimal = /^(\d+)\.(\d{1,2})$/.exec(next);
    if (dotDecimal) text = `${dotDecimal[1]},${dotDecimal[2]}`;
    else if (next.split(',')[0]!.includes('.') && !/^[1-9]\d{0,2}(\.\d{3})+(,\d*)?$/.test(next)) return next;
  }
  const parts = text.split(',');
  if (parts.length > 2) return next;
  const digits = bare(parts[0]!).replace(/^0+(?=\d)/, '');
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return parts.length === 2 ? `${grouped},${parts[1]}` : grouped;
}

/** Ao sair do campo: o valor completo ("2.000" vira "2.000,00"); um texto que não é um valor fica como está. */
export function completeMoneyText(text: string): string {
  const cents = parseBRL(text);
  return cents !== null && cents >= 0 ? centsToInput(cents) : text;
}
