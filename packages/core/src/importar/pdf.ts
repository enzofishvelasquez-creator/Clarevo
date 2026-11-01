import type { PdfTextItem } from '../comprovante/tipos';
import { fold } from '../comprovante/texto';
import { isValidIsoDate, type IsoDate } from '../dates';
import { MAX_RECORD_CENTS } from '../money';
import { IMPORT_MAX_LINES, type ImportDestination, type ImportParse, type ParsedLine } from './tipos';

/**
 * Extrato ou fatura em PDF (D-078 A; retorno do teste: "o arquivo do banco é PDF; se não puder ser o do banco, não adianta"). Leitura
 * genérica, por regras, no aparelho, a partir da posição de cada pedaço de texto na página (`PdfTextItem`), sem modelo de banco:
 *
 * 1. Os pedaços viram linhas da página (mesma altura, até 3 pt de diferença), da esquerda para a direita.
 * 2. Uma linha é lançamento quando começa por uma data (DD/MM ou DD/MM/AAAA) e tem um valor (1.234,56). Sem data no começo, vale a
 *    data da linha anterior (extratos que mostram a data uma vez por dia), depois do primeiro lançamento.
 * 3. O valor é o primeiro número de dinheiro depois da descrição; um segundo, mais à direita, costuma ser o saldo, e é ignorado.
 * 4. O sinal, no extrato da conta, vem do próprio valor ("-1.234,56", "1.234,56-", "1.234,56 D" saiu; "C" entrou); sem marca, de
 *    palavras da descrição ("recebido", "salário", "depósito", "estorno" entraram); sem nada, saiu. Na fatura do cartão é o contrário:
 *    a compra vem sem sinal e o crédito ("-", "C", "estorno", "pagamento") entrou.
 * 5. Linhas de saldo, total e cabeçalho ficam de fora. O ano, quando a data não traz, é o mais comum entre as datas completas do
 *    arquivo (ou o de hoje), e uma data que cairia no futuro volta um ano.
 *
 * A pessoa revê cada linha (descrição, sinal, categoria) antes de importar, como no OFX e na planilha. Nada do PDF é guardado.
 */

const ROW_TOLERANCE = 3;
// O sinal tem de estar colado ao número ("-85,00", "85,00-"): o "-" do saldo, na coluna seguinte, não conta. O número não começa
// no meio de outro ("1234,56" é lido inteiro, com ou sem ponto de milhar).
const MONEY = /(?<![\d.,])(-\s?)?(?:R\$\s*)?(\d{1,3}(?:\.\d{3})+,\d{2}|\d+,\d{2})(?!\d)(-(?!\d))?(?:\s*([DC])\b)?/;
const MONEY_ALL = new RegExp(MONEY.source, 'g');
const DATE_START = /^(\d{2})\/(\d{2})(?:\/(\d{2}|\d{4}))?(?!\d)/;
const SKIP = /\b(saldo|total|subtotal|limite|resumo|periodo|pagina|lancamentos futuros)\b/;
const OUT_WORDS = /\b(enviad[oa]|pagamento|pagto|pag\b|compra|tarifa|saque|debito|deb\b|transferencia enviada|pix env|boleto|juros|iof|anuidade|fatura)\b/;
const IN_WORDS = /\b(recebid[oa]|salario|deposito|estorno|credito|rendimento|reembolso|pix rec|ted rec|transferencia recebida)\b/;
/** Na fatura: o que é crédito (entra). */
const CARD_IN_WORDS = /\b(estorno|pagamento|pagto|credito|reembolso|devolucao|cashback|ajuste a credito)\b/;

interface Row {
  page: number;
  y: number;
  items: PdfTextItem[];
}

function rowsOf(items: readonly PdfTextItem[]): Row[] {
  const sorted = [...items].filter((i) => i.str.trim() !== '').sort((a, b) => a.page - b.page || b.y - a.y || a.x - b.x);
  const rows: Row[] = [];
  for (const item of sorted) {
    const last = rows[rows.length - 1];
    if (last && last.page === item.page && Math.abs(last.y - item.y) <= ROW_TOLERANCE) last.items.push(item);
    else rows.push({ page: item.page, y: item.y, items: [item] });
  }
  for (const r of rows) r.items.sort((a, b) => a.x - b.x);
  return rows;
}

function cents(text: string): number {
  return Number(text.replace(/\./g, '').replace(',', ''));
}

/** O ano mais comum entre as datas completas do texto; sem nenhuma, o de hoje. */
function baseYear(text: string, today: IsoDate): number {
  const counts = new Map<number, number>();
  for (const m of text.matchAll(/\b\d{2}\/\d{2}\/(\d{4})\b/g)) {
    const y = Number(m[1]);
    if (y >= 2000 && y <= 2099) counts.set(y, (counts.get(y) ?? 0) + 1);
  }
  let best = Number(today.slice(0, 4));
  let max = 0;
  for (const [y, n] of counts) if (n > max || (n === max && y > best)) [best, max] = [y, n];
  return best;
}

function isoOf(day: string, month: string, year: number, today: IsoDate): IsoDate | null {
  let date = `${year}-${month}-${day}`;
  if (!isValidIsoDate(date)) return null;
  // Sem ano no lançamento: uma data depois de hoje é do ano anterior (extrato de dezembro lido em janeiro).
  if (date > today) date = `${year - 1}-${month}-${day}`;
  return isValidIsoDate(date) ? (date as IsoDate) : null;
}

export function statementFromPdfItems(items: readonly PdfTextItem[], today: IsoDate): ImportParse | null {
  const rows = rowsOf(items);
  const allText = rows.map((r) => r.items.map((i) => i.str).join(' ')).join('\n');
  const folded = fold(allText);
  const year = baseYear(allText, today);
  // Fatura: "fatura" e "cartão" no arquivo e nenhum "extrato" no alto da primeira página (um extrato da conta pode citar o
  // pagamento da fatura do cartão numa linha).
  const top = fold(rows.slice(0, 12).map((r) => r.items.map((i) => i.str).join(' ')).join(' '));
  const statement: ImportDestination = /\bfatura\b/.test(folded) && /\bcartao\b/.test(folded) && !/\bextrato\b/.test(top) ? 'cartao' : 'conta';
  const lines: ParsedLine[] = [];
  let ignored = 0;
  let balanceIgnored = false;
  let currentDate: IsoDate | null = null;

  for (const row of rows) {
    const text = row.items
      .map((i) => i.str)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    const dateMatch = DATE_START.exec(text);
    let rest = text;
    if (dateMatch) {
      const y = dateMatch[3] ? (dateMatch[3].length === 2 ? 2000 + Number(dateMatch[3]) : Number(dateMatch[3])) : year;
      const iso = dateMatch[3] ? (isValidIsoDate(`${y}-${dateMatch[2]}-${dateMatch[1]}`) ? (`${y}-${dateMatch[2]}-${dateMatch[1]}` as IsoDate) : null) : isoOf(dateMatch[1]!, dateMatch[2]!, year, today);
      if (!iso) continue;
      currentDate = iso;
      rest = text.slice(dateMatch[0].length).trim();
    } else if (currentDate === null || lines.length === 0) {
      continue;
    }
    const money = MONEY.exec(rest);
    if (!money) {
      if (dateMatch) ignored++;
      continue;
    }
    const description = rest.slice(0, money.index).replace(/\s+/g, ' ').trim();
    const foldedDesc = fold(description);
    if (SKIP.test(foldedDesc)) {
      if (/\bsaldo\b/.test(foldedDesc)) balanceIgnored = true;
      ignored++;
      continue;
    }
    if (description === '' || !/[a-z]/i.test(description)) {
      ignored++;
      continue;
    }
    const value = cents(money[2]!);
    if (value <= 0 || value > MAX_RECORD_CENTS) {
      ignored++;
      continue;
    }
    // Um segundo valor na linha, mais à direita, é o saldo do dia: ignorado.
    if ([...rest.slice(money.index + money[0].length).matchAll(MONEY_ALL)].length > 0) balanceIgnored = true;
    const minus = Boolean(money[1] || money[3]);
    let out: boolean;
    if (statement === 'cartao') {
      // Fatura: compra sem sinal; "-", "C" ou as palavras de crédito são crédito (estorno, pagamento da fatura).
      if (money[4] === 'D') out = true;
      else if (minus || money[4] === 'C' || CARD_IN_WORDS.test(foldedDesc)) out = false;
      else out = true;
    } else if (minus || money[4] === 'D') out = true;
    else if (money[4] === 'C') out = false;
    else if (IN_WORDS.test(foldedDesc)) out = false;
    else if (OUT_WORDS.test(foldedDesc)) out = true;
    else out = true;
    lines.push({ ordinal: lines.length + 1, date: currentDate!, description: description.slice(0, 80), amountCents: out ? -value : value, fitId: null });
    if (lines.length >= IMPORT_MAX_LINES) break;
  }
  if (lines.length === 0) return null;
  // O sinal já sai certo para cada tipo de arquivo (nada a inverter na revisão).
  return { source: 'pdf', statement, lines, ignored, balanceIgnored, cardPositive: false };
}
