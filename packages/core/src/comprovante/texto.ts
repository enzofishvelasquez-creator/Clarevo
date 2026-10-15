import type { IsoDate } from '../dates';
import { isValidIsoDate } from '../dates';
import type { Cents } from '../money';
import { MAX_RECORD_CENTS } from '../money';
import { friendlyIssuerName } from '../nota';
import { COMPROVANTE_LINES_MAX, COMPROVANTE_LINE_MAX, COMPROVANTE_TEXT_MAX } from './tipos';

/**
 * Ferramentas de texto do leitor de comprovantes (D-051). Entrada hostil é esperada: o texto vem de um PDF qualquer.
 * Todas as passagens são lineares no tamanho do texto (o texto é cortado em `COMPROVANTE_TEXT_MAX` antes de tudo): nada de
 * expressão regular com repetição aninhada ou que volte atrás sobre um trecho longo; os trechos que passam por expressão regular têm
 * poucos caracteres (um valor, uma data, um nome). Sem `normalize`, lookbehind, grupos nomeados nem `\p{}`: o Hermes (iOS e
 * Android) tem suporte parcial.
 */

// ---------------------------------------------------------------------------
// Limpeza e linhas
// ---------------------------------------------------------------------------

/**
 * Espaços especiais viram espaço comum, caracteres invisíveis somem, todo tipo de quebra de linha vira uma só e os travessões
 * viram hífen (datas como "05 OUT 2026" seguida de travessão e da hora). Corta o texto no limite.
 */
export function cleanText(raw: string): string {
  const s = raw.length > COMPROVANTE_TEXT_MAX ? raw.slice(0, COMPROVANTE_TEXT_MAX) : raw;
  const out: string[] = [];
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 0x0d) {
      if (s.charCodeAt(i + 1) === 0x0a) i++;
      out.push('\n');
    } else if (c === 0x0a || c === 0x0b || c === 0x0c || c === 0x85 || c === 0x2028 || c === 0x2029) out.push('\n');
    else if (c === 0x09 || c === 0xa0 || c === 0x1680 || (c >= 0x2000 && c <= 0x200a) || c === 0x202f || c === 0x205f || c === 0x3000) out.push(' ');
    else if (c === 0xad || (c >= 0x200b && c <= 0x200f) || c === 0x2060 || c === 0xfeff) continue;
    else if (c === 0x2013 || c === 0x2014 || c === 0x2212) out.push('-');
    else if (c < 0x20 || c === 0x7f) out.push(' ');
    else out.push(s[i]!);
  }
  return out.join('');
}

/** Linhas sem espaço repetido nem vazias, limitadas em número e em tamanho. */
export function toLines(text: string): string[] {
  const lines: string[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\s+/g, ' ').trim();
    if (line === '') continue;
    lines.push(line.length > COMPROVANTE_LINE_MAX ? line.slice(0, COMPROVANTE_LINE_MAX) : line);
    if (lines.length >= COMPROVANTE_LINES_MAX) break;
  }
  return lines;
}

const FOLD_FROM = 'áàâãäéèêëíìîïóòôõöúùûüçñ';
const FOLD_TO = 'aaaaaeeeeiiiiooooouuuucn';
const FOLD: Record<string, string> = {};
for (let i = 0; i < FOLD_FROM.length; i++) {
  FOLD[FOLD_FROM[i]!] = FOLD_TO[i]!;
  FOLD[FOLD_FROM[i]!.toUpperCase()] = FOLD_TO[i]!;
}

/** Minúsculas e sem acento, caractere por caractere: o resultado tem o mesmo tamanho e as mesmas posições do texto. */
export function fold(text: string): string {
  const out: string[] = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    const c = text.charCodeAt(i);
    if (c < 128) out.push(c >= 65 && c <= 90 ? String.fromCharCode(c + 32) : ch);
    else out.push(FOLD[ch] ?? ch);
  }
  return out.join('');
}

export const isDigit = (c: number): boolean => c >= 48 && c <= 57;
export const isLetter = (c: number): boolean => (c >= 97 && c <= 122) || (c >= 65 && c <= 90) || (c >= 0xc0 && c <= 0xff && c !== 0xd7 && c !== 0xf7);
const isMoneyChar = (c: number): boolean => isDigit(c) || c === 46 || c === 44;

/** Tira de cada ponta os caracteres de `chars` (sem expressão regular de repetição que volta atrás). */
export function trimEdges(text: string, chars: string): string {
  let a = 0;
  let b = text.length;
  while (a < b && chars.includes(text[a]!)) a++;
  while (b > a && chars.includes(text[b - 1]!)) b--;
  return text.slice(a, b);
}

/** Corta em `max` caracteres, sem deixar meia palavra no fim. */
export function fitWords(text: string, max: number): string {
  const chars = [...text.trim()];
  if (chars.length <= max) return chars.join('');
  const cut = chars.slice(0, max).join('');
  const space = cut.lastIndexOf(' ');
  return (space > max / 2 ? cut.slice(0, space) : cut).trim();
}

// ---------------------------------------------------------------------------
// Valor
// ---------------------------------------------------------------------------

/**
 * Primeiro valor em reais de `text` que começa entre `from` e `limit`: "R$ 1.234,56", "1.234,56", "85,00" ou, com "R$" na frente,
 * "R$ 85" e "R$ 85.00". Número sem vírgula e sem "R$" (agência, data, hora, parte de um código) nunca é valor. Um dígito que
 * segue uma letra ("E1823...", "5F3A...") é parte de um código e não é lido. Valor fora de 1 centavo a R$ 9.999.999,99 é pulado.
 */
export function scanMoney(text: string, from = 0, limit = text.length): { cents: Cents; end: number } | null {
  const n = text.length;
  const last = Math.min(n, limit);
  let i = Math.max(0, from);
  while (i < last) {
    if (!isDigit(text.charCodeAt(i))) {
      i++;
      continue;
    }
    let j = i;
    while (j < n && j - i <= 17 && isMoneyChar(text.charCodeAt(j))) j++;
    const prev = i > 0 ? text.charCodeAt(i - 1) : 32;
    if (!isLetter(prev) && prev !== 95) {
      let token = text.slice(i, j);
      while (token.length > 0 && (token.endsWith('.') || token.endsWith(','))) token = token.slice(0, -1);
      if (token.length >= 1 && token.length <= 16) {
        let k = i - 1;
        while (k >= 0 && text[k] === ' ') k--;
        const hasR = k >= 1 && text[k] === '$' && (text[k - 1] === 'R' || text[k - 1] === 'r');
        const cents = moneyToken(token, hasR);
        if (cents !== null && cents >= 1 && cents <= MAX_RECORD_CENTS) return { cents, end: i + token.length };
      }
    }
    i = j;
  }
  return null;
}

function moneyToken(token: string, hasR: boolean): Cents | null {
  const comma = /^(\d{1,3}(?:\.\d{3})+|\d+),(\d{2})$/.exec(token);
  if (comma) return Number(comma[1]!.replace(/\./g, '')) * 100 + Number(comma[2]);
  if (!hasR) return null;
  const whole = /^(\d{1,3}(?:\.\d{3})+|\d+)$/.exec(token);
  if (whole) return Number(whole[1]!.replace(/\./g, '')) * 100;
  const dot = /^(\d+)\.(\d{2})$/.exec(token);
  return dot ? Number(dot[1]) * 100 + Number(dot[2]) : null;
}

// ---------------------------------------------------------------------------
// Data e hora (sobre texto já passado por `fold`)
// ---------------------------------------------------------------------------

const MONTH_WORDS: Readonly<Record<string, number>> = {
  jan: 1, janeiro: 1, fev: 2, fevereiro: 2, mar: 3, marco: 3, abr: 4, abril: 4, mai: 5, maio: 5, jun: 6, junho: 6,
  jul: 7, julho: 7, ago: 8, agosto: 8, set: 9, sete: 9, setembro: 9, out: 10, outubro: 10, nov: 11, novembro: 11, dez: 12, dezembro: 12,
};

function readDigits(s: string, from: number, to: number, max: number): { text: string; end: number } {
  let j = from;
  while (j < to && j - from < max && isDigit(s.charCodeAt(j))) j++;
  return { text: s.slice(from, j), end: j };
}

function pad2(text: string): string {
  return text.length === 1 ? `0${text}` : text;
}

/** Pula espaços, barras, hífens e pontos e, no máximo uma vez, a palavra "de" ("05 de outubro de 2026"). */
function skipTextSeparators(s: string, from: number, to: number): number {
  let q = from;
  while (q < to && (s[q] === ' ' || s[q] === '/' || s[q] === '-' || s[q] === '.')) q++;
  if (s.startsWith('de ', q) && q + 3 <= to) {
    q += 3;
    while (q < to && s[q] === ' ') q++;
  }
  return q;
}

function yearOf(text: string): string | null {
  if (text.length === 4) return text;
  if (text.length === 2) return `20${text}`;
  return null;
}

function dateAt(s: string, i: number, to: number): { iso: IsoDate; start: number; end: number } | null {
  const first = readDigits(s, i, to, 5);
  let year: string | null = null;
  let month: string | null = null;
  let day: string | null = null;
  let end = first.end;
  if (first.text.length === 4) {
    const sep = s[first.end];
    if (sep !== '-' && sep !== '/') return null;
    const m = readDigits(s, first.end + 1, to, 3);
    if (m.text.length < 1 || m.text.length > 2 || s[m.end] !== sep) return null;
    const d = readDigits(s, m.end + 1, to, 3);
    if (d.text.length < 1 || d.text.length > 2) return null;
    [year, month, day, end] = [first.text, pad2(m.text), pad2(d.text), d.end];
  } else if (first.text.length >= 1 && first.text.length <= 2) {
    const sep = s[first.end];
    if ((sep === '/' || sep === '-' || sep === '.') && first.end + 1 < to && isDigit(s.charCodeAt(first.end + 1))) {
      const m = readDigits(s, first.end + 1, to, 3);
      const sep2 = s[m.end];
      if (m.text.length < 1 || m.text.length > 2 || (sep2 !== '/' && sep2 !== '-' && sep2 !== '.')) return null;
      const y = readDigits(s, m.end + 1, to, 5);
      year = yearOf(y.text);
      [month, day, end] = [pad2(m.text), pad2(first.text), y.end];
    } else {
      // Mês por extenso ou abreviado: "05 OUT 2026", "05/out/2026", "5 de outubro de 2026".
      const p = skipTextSeparators(s, first.end, to);
      if (p === first.end) return null;
      let q = p;
      while (q < to && q - p < 10 && s.charCodeAt(q) >= 97 && s.charCodeAt(q) <= 122) q++;
      const number = MONTH_WORDS[s.slice(p, q)];
      if (number === undefined) return null;
      if (s[q] === '.') q++;
      const p2 = skipTextSeparators(s, q, to);
      if (p2 === q) return null;
      const y = readDigits(s, p2, to, 5);
      year = yearOf(y.text);
      [month, day, end] = [pad2(String(number)), pad2(first.text), y.end];
    }
  } else return null;
  if (year === null || (end < to && isDigit(s.charCodeAt(end)))) return null;
  const iso = `${year}-${month}-${day}`;
  const y = Number(year);
  return y >= 1990 && y <= 2099 && isValidIsoDate(iso) ? { iso, start: i, end } : null;
}

/** Primeira data válida de `s` (já em `fold`): 05/10/2026, 05-10-26, 2026-10-05, 05 OUT 2026, 5 de outubro de 2026. */
export function scanDate(s: string, from = 0, to = s.length): { iso: IsoDate; start: number; end: number } | null {
  const n = Math.min(s.length, to);
  for (let i = Math.max(0, from); i < n; i++) {
    if (!isDigit(s.charCodeAt(i))) continue;
    const prev = i > 0 ? s.charCodeAt(i - 1) : 32;
    if (isDigit(prev) || isLetter(prev)) continue;
    const found = dateAt(s, i, n);
    if (found) return found;
  }
  return null;
}

/** Primeira hora válida de `s` entre `from` e `to`: "14:32", "14:32:10" (vira 14:32) ou "14h32". */
export function scanTime(s: string, from = 0, to = s.length): string | null {
  const n = Math.min(s.length, to);
  for (let i = Math.max(0, from); i < n; i++) {
    if (!isDigit(s.charCodeAt(i))) continue;
    if (i > 0 && isDigit(s.charCodeAt(i - 1))) continue;
    const hh = readDigits(s, i, n, 2);
    const sep = s[hh.end];
    if (hh.text.length < 1 || (sep !== ':' && sep !== 'h')) continue;
    const mm = readDigits(s, hh.end + 1, n, 2);
    if (mm.text.length !== 2) continue;
    if (mm.end < n && isDigit(s.charCodeAt(mm.end))) continue;
    if (Number(hh.text) <= 23 && Number(mm.text) <= 59) return `${pad2(hh.text)}:${mm.text}`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Nome e mensagem
// ---------------------------------------------------------------------------

/**
 * Corta o texto no primeiro trecho que parece documento ou número de conta: uma sequência de dígitos, asteriscos, pontos, hífens e
 * barras com `minSignal` ou mais dígitos ou asteriscos ("123.456.789-09", "***.456.789-**", "12.345.678/0001-90", "(21) 99999-9999").
 * Em nome, seis; em mensagem (que pode ter "10/2026"), oito.
 */
export function cutAtDocument(s: string, minSignal = 6): string {
  const n = s.length;
  let i = 0;
  while (i < n) {
    const c = s.charCodeAt(i);
    if (isDigit(c) || c === 42 || c === 0x2022) {
      let j = i;
      let signal = 0;
      while (j < n) {
        const d = s.charCodeAt(j);
        if (isDigit(d) || d === 42 || d === 0x2022) {
          signal++;
          j++;
        } else if (d === 46 || d === 45 || d === 47) j++;
        else break;
      }
      if (signal >= minSignal) return s.slice(0, i);
      i = j;
    } else i++;
  }
  return s;
}

const NOT_A_NAME = new Set([
  'nome', 'cpf', 'cnpj', 'nao informado', 'nao informada', 'nao consta', 'nao se aplica', 'n/a', 'na', 'sem nome', 'confidencial', 'sigiloso',
  'pix', 'ted', 'transferencia', 'pagamento', 'banco', 'instituicao', 'conta', 'agencia', 'chave', 'origem', 'destino', 'dados', 'voce',
  'eu', 'valor', 'data', 'hora', 'tipo', 'documento', 'comprovante', 'conta corrente', 'conta poupanca', 'conta pagamento', 'conta salario',
  'conta digital', 'saldo em conta', 'cartao',
]);

/** O ponto final fica: "S.A." e "Ltda." são parte do nome. */
const NAME_EDGES = ' :|-/,;·•';

const TRAILING_LABEL_WORDS = new Set(['cpf', 'cnpj', 'documento', 'doc', 'rg', 'chave', 'banco', 'conta', 'agencia', 'ci']);

/**
 * Nome da pessoa ou da empresa da outra ponta, sem documento: corta no primeiro CPF ou CNPJ (inteiro ou mascarado) e nas palavras
 * soltas "CPF", "CNPJ" e semelhantes que sobram no fim; recusa e-mail, endereço da internet, telefone, chave aleatória e valores sem
 * letras; nome todo em maiúsculas vira "Maria da Silva". null quando não sobra um nome.
 */
export function cleanPersonName(raw: string): string | null {
  const short = raw.length > 300 ? raw.slice(0, 300) : raw;
  let s = cutAtDocument(short);
  const cut = s.length < short.length;
  s = trimEdges(s, NAME_EDGES);
  // Palavras de rótulo ("MARIA SILVA CPF") e, se a poda tirou um telefone ou documento, o "+55 21" que sobrou no fim.
  for (let guard = 0; guard < 6; guard++) {
    const space = s.lastIndexOf(' ');
    if (space < 0) break;
    const word = s.slice(space + 1);
    let letters = false;
    for (let i = 0; i < word.length && !letters; i++) letters = isLetter(word.charCodeAt(i));
    if (!TRAILING_LABEL_WORDS.has(fold(word)) && (letters || !cut)) break;
    s = trimEdges(s.slice(0, space), NAME_EDGES);
  }
  if (s.length < 2) return null;
  const plain = fold(s);
  if (NOT_A_NAME.has(plain)) return null;
  if (s.includes('@') || s.includes('*') || s.includes('•') || plain.includes('http') || plain.includes('www.')) return null;
  let digits = 0;
  let letters = 0;
  let run = 0;
  let longest = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (isDigit(c)) digits++;
    else if (isLetter(c)) letters++;
    if (c === 32) run = 0;
    else longest = Math.max(longest, ++run);
  }
  if (letters < 2 || digits > 8 || longest > 40) return null;
  const friendly = friendlyIssuerName(s);
  if (friendly.length < 2) return null;
  return fitWords(friendly, 80);
}

const NOT_A_MESSAGE = new Set([
  'pix', 'ted', 'transferencia', 'pagamento', 'nao informado', 'nao informada', 'sem descricao', 'sem mensagem', 'nenhum', 'nenhuma',
  'n/a', 'na', 'nao ha', 'nao consta', 'boleto', 'debito',
]);

/**
 * Mensagem ou descrição que a pessoa escreveu no comprovante, para mostrar como está. É texto livre: some o que parece documento,
 * número de conta, telefone, e-mail, endereço da internet ou chave (nove dígitos ou mais, trecho longo sem espaço), e os textos
 * padrão ("Pix", "Não informado"). Até 80 caracteres.
 */
export function cleanMessage(raw: string): string | null {
  const s = trimEdges(raw.length > 300 ? raw.slice(0, 300) : raw, ' :|-/.,;');
  if (s.length < 2) return null;
  if (cutAtDocument(s, 8) !== s) return null;
  const plain = fold(s);
  if (NOT_A_MESSAGE.has(plain) || s.includes('@') || plain.includes('http') || plain.includes('www.')) return null;
  let digits = 0;
  let letters = 0;
  let run = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (isDigit(c)) digits++;
    else if (isLetter(c)) letters++;
    if (c === 32) run = 0;
    else if (++run > 24) return null;
  }
  if (letters < 2 || digits >= 9) return null;
  return fitWords(s, 80);
}
