import { decodeImportBytes } from './decode';
import type { ImportErrorCode, ImportParse, ParsedLine } from './tipos';
import { IMPORT_MAX_LINES } from './tipos';
import { cleanDescription, parseAmountCents, parseFileDate } from './valores';

/**
 * Leitor de planilhas CSV de extrato e de fatura. Detecta o separador (; , ou tabulação), o decimal (vírgula ou ponto) e o formato
 * da data (dd/mm/aaaa ou aaaa-mm-dd), e acha as colunas pelo nome do cabeçalho (data, descrição, valor ou débito e crédito). Se não
 * reconhecer o cabeçalho, devolve a tabela para a pessoa escolher as colunas. O saldo do arquivo nunca é lido.
 * Sinal: no extrato da conta, negativo = saiu e positivo = entrou. Na fatura do cartão, o banco costuma mostrar a compra como valor
 * positivo; por isso, com destino "cartão", a revisão inverte o sinal de uma planilha de valor único em que a maioria dos valores é
 * positiva (`cardPositive`). A tela deixa inverter de novo.
 */

export type CsvDelimiter = ';' | ',' | '\t';

export interface CsvTable {
  delimiter: CsvDelimiter;
  rows: string[][];
}

/** Quebra o texto em linhas e células, com aspas ("" dentro de aspas vira "), e aceita CRLF, LF e CR. */
export function splitCsv(text: string, delimiter: CsvDelimiter): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  let wasQuoted = false;
  const endCell = () => {
    row.push(wasQuoted ? cell : cell.trim());
    cell = '';
    wasQuoted = false;
  };
  const endRow = () => {
    endCell();
    if (row.some((c) => c.trim() !== '')) rows.push(row);
    row = [];
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += c;
      continue;
    }
    if (c === '"' && cell.trim() === '') {
      quoted = true;
      wasQuoted = true;
      cell = '';
    } else if (c === delimiter) endCell();
    else if (c === '\r') {
      if (text[i + 1] === '\n') i++;
      endRow();
    } else if (c === '\n') endRow();
    else cell += c;
  }
  if (cell !== '' || row.length > 0) endRow();
  return rows;
}

/** Conta separadores fora de aspas numa linha. */
function countOutsideQuotes(line: string, delimiter: string): number {
  let n = 0;
  let quoted = false;
  for (const c of line) {
    if (c === '"') quoted = !quoted;
    else if (!quoted && c === delimiter) n += 1;
  }
  return n;
}

/** Separador: o que mais aparece com pelo menos duas colunas nas primeiras linhas; empate vai para ";" e depois ",". */
export function detectDelimiter(text: string): CsvDelimiter {
  const lines = text.split(/\r\n|\n|\r/).filter((l) => l.trim() !== '').slice(0, 40);
  let best: CsvDelimiter = ';';
  let bestScore = -1;
  for (const d of [';', ',', '\t'] as const) {
    const score = lines.filter((l) => countOutsideQuotes(l, d) >= 2).length;
    if (score > bestScore) {
      best = d;
      bestScore = score;
    }
  }
  return best;
}

export function readCsvTable(text: string): CsvTable {
  const clean = text.replace(/^\ufeff/, '');
  const delimiter = detectDelimiter(clean);
  return { delimiter, rows: splitCsv(clean, delimiter) };
}

/** Nome de coluna sem acento, em minúsculas e só com letras, números e espaços. */
export function headerKey(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export interface CsvColumns {
  date: number;
  description: number;
  /** Uma coluna de valor com sinal; ou -1 quando há débito e crédito separados. */
  amount: number;
  debit: number;
  credit: number;
  /** Coluna D/C ou tipo (débito, crédito), quando os valores vêm sem sinal; -1 se não há. */
  kind: number;
}

export interface CsvMapping {
  /** Índice da primeira linha de dados (depois do cabeçalho). */
  firstRow: number;
  columns: CsvColumns;
}

/** Prioridade dos nomes da coluna de descrição: o primeiro da lista que existir vence. */
const DESCRIPTION_NAMES = ['descricao', 'historico', 'titulo', 'title', 'estabelecimento', 'lancamento', 'detalhes', 'detalhe', 'memo', 'description', 'nome', 'favorecido', 'beneficiario', 'local'];
const AMOUNT_NAMES = ['valor', 'quantia', 'amount', 'montante', 'value', 'valor r', 'valor rs'];

function isDateHeader(key: string): boolean {
  return /^(data|date|dt)\b/.test(key) && !/\b(vencimento|fechamento|saldo|pagamento da fatura)\b/.test(key);
}

/**
 * Acha as colunas pelo cabeçalho de uma linha. Precisa de data, descrição e valor (ou débito e crédito); senão, null.
 * Colunas de saldo nunca são lidas.
 */
export function detectColumns(header: string[]): CsvColumns | null {
  const keys = header.map(headerKey);
  const date = keys.findIndex(isDateHeader);
  if (date < 0) return null;
  let description = -1;
  for (const name of DESCRIPTION_NAMES) {
    const at = keys.findIndex((k, i) => i !== date && (k === name || k.startsWith(`${name} `) || (name === 'lancamento' && k === 'lancamento')));
    if (at >= 0) {
      description = at;
      break;
    }
  }
  if (description < 0) return null;
  const notBalance = (k: string) => !/\bsaldo\b/.test(k);
  const amount = keys.findIndex((k, i) => i !== date && i !== description && notBalance(k) && AMOUNT_NAMES.some((n) => k === n || k.startsWith(`${n} `)));
  const debit = keys.findIndex((k, i) => i !== date && i !== description && notBalance(k) && /^(debito|debitos|saida|saidas|valor debito)\b/.test(k));
  const credit = keys.findIndex((k, i) => i !== date && i !== description && notBalance(k) && /^(credito|creditos|entrada|entradas|valor credito)\b/.test(k));
  const kind = keys.findIndex((k, i) => i !== date && i !== description && i !== amount && /^(tipo|natureza|d c|dc|debito credito|tipo de lancamento|tipo lancamento)$/.test(k));
  if (amount >= 0) return { date, description, amount, debit: -1, credit: -1, kind };
  if (debit >= 0 && credit >= 0) return { date, description, amount: -1, debit, credit, kind: -1 };
  return null;
}

/** Procura o cabeçalho nas primeiras linhas (muitos bancos põem título e dados da conta antes). */
export function detectMapping(table: CsvTable): CsvMapping | null {
  const limit = Math.min(table.rows.length, 20);
  for (let i = 0; i < limit; i++) {
    const columns = detectColumns(table.rows[i]!);
    if (columns) return { firstRow: i + 1, columns };
  }
  return null;
}

/** O decimal do arquivo: o que mais aparece como separador de centavos nas células de valor; sem pista, vírgula (padrão do Brasil), ou ponto se o separador do arquivo é vírgula. */
export function detectDecimal(cells: string[], delimiter: CsvDelimiter): '.' | ',' {
  let comma = 0;
  let dot = 0;
  for (const raw of cells) {
    const c = raw.replace(/\s/g, '');
    if (/,\d{1,2}[-)]?$/.test(c)) comma += 1;
    else if (/\.\d{1,2}[-)]?$/.test(c)) dot += 1;
  }
  if (comma !== dot) return comma > dot ? ',' : '.';
  return delimiter === ',' ? '.' : ',';
}

/** Descrições que são linha de saldo ou de total do banco (e não um lançamento); "Total Express" é uma loja e fica. */
const BALANCE_ROW = new Set(['saldo', 'saldo anterior', 'saldo do dia', 'total']);

function kindSign(value: string): -1 | 1 | 0 {
  const k = headerKey(value);
  if (/^(d|deb|debito|debitos|saida|despesa|compra)\b/.test(k)) return -1;
  if (/^(c|cred|credito|creditos|entrada|receita|estorno)\b/.test(k)) return 1;
  return 0;
}

/**
 * Lê as linhas de dados com o mapeamento. Linhas sem data ou sem valor legível, de saldo ou com valor zero são contadas em
 * `ignored`. O sinal fica como está no arquivo (negativo = saiu); `cardPositive` avisa que o valor vem numa coluna só, sem tipo e
 * com a maioria dos valores positiva: numa fatura de cartão a compra é o valor positivo (o destino "cartão" inverte o sinal na
 * revisão). Se a maioria é negativa, a fatura já usa o sinal do app e nada é invertido.
 */
export function applyMapping(table: CsvTable, mapping: CsvMapping): ImportParse | { error: ImportErrorCode } {
  const { columns: c } = mapping;
  const data = table.rows.slice(mapping.firstRow);
  const amountCells = c.amount >= 0 ? data.map((r) => r[c.amount] ?? '') : data.flatMap((r) => [r[c.debit] ?? '', r[c.credit] ?? '']);
  const decimal = detectDecimal(amountCells.filter((x) => x !== ''), table.delimiter);
  const hasNegative = amountCells.some((x) => /^\s*[-(]|-\s*$/.test(x));
  const byKind = c.amount >= 0 && c.kind >= 0 && !hasNegative;
  const lines: ParsedLine[] = [];
  let ignored = 0;
  for (const row of data) {
    if (row.every((x) => x === '')) continue;
    const date = parseFileDate(row[c.date] ?? '');
    const description = cleanDescription(row[c.description] ?? '');
    let cents: number | null;
    if (c.amount >= 0) {
      cents = parseAmountCents(row[c.amount] ?? '', decimal);
      if (cents !== null && byKind) {
        const sign = kindSign(row[c.kind] ?? '');
        if (sign !== 0) cents = sign * Math.abs(cents);
      }
    } else {
      const debit = parseAmountCents(row[c.debit] ?? '', decimal);
      const credit = parseAmountCents(row[c.credit] ?? '', decimal);
      cents = debit === null && credit === null ? null : Math.abs(credit ?? 0) - Math.abs(debit ?? 0);
    }
    if (date === null || cents === null || cents === 0 || BALANCE_ROW.has(headerKey(description))) {
      ignored += 1;
      continue;
    }
    lines.push({ ordinal: lines.length + 1, date, description: description || 'Sem descrição', amountCents: cents, fitId: null });
    if (lines.length > IMPORT_MAX_LINES) return { error: 'linhas_demais' };
  }
  if (lines.length === 0) return { error: 'sem_lancamentos' };
  // Fatura com o valor positivo na compra é a que o banco mostra assim; se a maioria vem negativa, o sinal já é o do app.
  const positives = lines.filter((l) => l.amountCents > 0).length;
  const negatives = lines.length - positives;
  const header = table.rows[mapping.firstRow - 1] ?? [];
  return {
    source: 'csv',
    statement: null,
    lines,
    ignored,
    balanceIgnored: header.some((h) => /\bsaldo\b/.test(headerKey(h))),
    cardPositive: c.amount >= 0 && !byKind && positives > negatives,
  };
}

export type CsvRead =
  | { kind: 'ok'; parse: ImportParse; table: CsvTable }
  | { kind: 'mapear'; table: CsvTable }
  | { kind: 'erro'; code: ImportErrorCode };

/** Lê o texto de uma planilha. Sem cabeçalho reconhecido, devolve a tabela para a pessoa escolher as colunas. */
export function parseCsvText(text: string): CsvRead {
  const table = readCsvTable(text);
  if (table.rows.length === 0) return { kind: 'erro', code: 'arquivo_vazio' };
  if (table.rows.every((r) => r.length < 2)) return { kind: 'erro', code: 'csv_invalido' };
  const mapping = detectMapping(table);
  if (!mapping) return { kind: 'mapear', table };
  const result = applyMapping(table, mapping);
  if ('error' in result) return { kind: 'erro', code: result.error };
  return { kind: 'ok', parse: result, table };
}

export function parseCsvBytes(bytes: Uint8Array): CsvRead {
  return parseCsvText(decodeImportBytes(bytes).text);
}
