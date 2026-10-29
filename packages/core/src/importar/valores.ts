import { isValidIsoDate, type IsoDate } from '../dates';
import { MAX_RECORD_CENTS } from '../money';
import { DESCRIPTION_MAX } from '../validation';

/** Texto de uma descrição lida do arquivo: sem caracteres de controle, espaços do meio reduzidos a um, aparado e com até 80 caracteres. */
export function cleanDescription(raw: string): string {
  const text = raw
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028\u2029\ufeff]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const chars = [...text];
  if (chars.length <= DESCRIPTION_MAX) return text;
  const cut = chars.slice(0, DESCRIPTION_MAX).join('');
  const space = cut.lastIndexOf(' ');
  return (space > DESCRIPTION_MAX / 2 ? cut.slice(0, space) : cut).trim();
}

/**
 * Valor de uma célula em centavos inteiros, com sinal. `decimal` diz qual separador marca os centavos ('.' ou ','); com 'auto', o
 * último separador que aparece é o decimal quando há os dois, e a vírgula é decimal quando é a única. Aceita "R$", espaços, sinal
 * à frente ou atrás ("12,34-"), parênteses como negativo ("(12,34)") e "+". Mais de duas casas decimais, letras e vazio → null.
 * Valores com dígitos demais voltam acima do limite do app (para a linha ficar marcada, não perdida).
 */
export function parseAmountCents(raw: string, decimal: '.' | ',' | 'auto' = 'auto'): number | null {
  let text = raw.replace(/\u00a0/g, ' ').trim();
  if (text === '') return null;
  let negative = false;
  if (/^\(.*\)$/.test(text)) {
    negative = true;
    text = text.slice(1, -1).trim();
  }
  text = text.replace(/^R\$\s*/i, '').replace(/\s*R\$$/i, '');
  const lead = /^([+-])\s*(.*)$/.exec(text);
  if (lead) {
    if (lead[1] === '-') negative = !negative;
    text = lead[2]!;
  }
  const trail = /^(.*?)\s*([+-])$/.exec(text);
  if (trail) {
    if (trail[2] === '-') negative = !negative;
    text = trail[1]!;
  }
  text = text.replace(/^R\$\s*/i, '').replace(/\s/g, '');
  if (!/^[\d.,]+$/.test(text) || !/\d/.test(text)) return null;
  const lastDot = text.lastIndexOf('.');
  const lastComma = text.lastIndexOf(',');
  // Qual separador marca os centavos (null: nenhum, só milhares ou inteiro).
  let sep: '.' | ',' | null;
  if (decimal !== 'auto') sep = decimal;
  else if (lastDot >= 0 && lastComma >= 0) sep = lastDot > lastComma ? '.' : ',';
  else if (lastComma >= 0) sep = ',';
  else if (lastDot >= 0) sep = /^[1-9]\d{0,2}(\.\d{3})+$/.test(text) ? null : '.';
  else sep = null;
  const thousands = sep === '.' ? ',' : '.';
  let intPart = text;
  let decPart = '';
  if (sep !== null && text.includes(sep)) {
    const at = text.lastIndexOf(sep);
    intPart = text.slice(0, at);
    decPart = text.slice(at + 1);
    if (intPart.includes(sep)) return null;
    if (decPart === '' || decPart.length > 2) return null;
  }
  // O que sobra à esquerda: só dígitos, ou grupos de três separados pelo outro separador.
  if (intPart.includes(thousands)) {
    if (!/^[1-9]\d{0,2}(?:[.,]\d{3})+$/.test(intPart) || intPart.split(thousands).length !== intPart.split(/[.,]/).length) return null;
    intPart = intPart.split(thousands).join('');
  }
  if (intPart === '' && decPart === '') return null;
  if (!/^\d*$/.test(intPart)) return null;
  const whole = intPart.replace(/^0+(?=\d)/, '') || '0';
  if (whole.length > 13) return (negative ? -1 : 1) * (MAX_RECORD_CENTS + 1);
  const cents = Number(whole) * 100 + Number(decPart.padEnd(2, '0') || '0');
  return negative ? -cents : cents;
}

/**
 * Data de uma célula, em AAAA-MM-DD: dd/mm/aaaa, dd/mm/aa (anos 2000), dd-mm-aaaa, dd.mm.aaaa, aaaa-mm-dd e aaaa/mm/dd, com ou sem
 * hora depois. Data impossível (31/02) ou outro formato → null. Nunca passa pelo fuso do aparelho.
 */
export function parseFileDate(raw: string): IsoDate | null {
  const text = raw.trim();
  let y: string;
  let m: string;
  let d: string;
  let hit = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T].*)?$/.exec(text);
  if (hit) {
    [y, m, d] = [hit[1]!, hit[2]!, hit[3]!];
  } else {
    hit = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})(?:[ T].*)?$/.exec(text);
    if (!hit) return null;
    [d, m, y] = [hit[1]!, hit[2]!, hit[3]!];
    if (y.length === 2) y = `20${y}`;
  }
  const iso = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  return isValidIsoDate(iso) ? iso : null;
}
