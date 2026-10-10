import type { IsoDate, IsoMonth } from './dates';
import { isValidIsoDate } from './dates';
import type { Cents } from './money';
import { MAX_RECORD_CENTS, parseBRL } from './money';
import type { AccessKeyInfo, ReceiptErrorCode, ReceiptFacts } from './nota';
import { findAccessKey, friendlyIssuerName } from './nota';
import type { PaymentForm } from './nota-pagamento';
import { paymentFormsFromText } from './nota-pagamento';

/**
 * Leitura do DANFE da NF-e em PDF (Ciclo E, D-038, fase 2: compras online). O app extrai o texto do PDF no próprio aparelho
 * (biblioteca JS, sem servidor) e entrega o texto a `danfeFromText`, que acha:
 * - a chave de acesso (44 caracteres; o CNPJ do emitente e o mês da emissão vêm dela, com dígitos verificadores conferidos;
 *   o registro guarda só o resumo SHA-256 dela, `AccessKeyInfo.digest`, nunca a chave, que em emitente pessoa física tem o CPF);
 * - a data de emissão e o "VALOR TOTAL DA NOTA";
 * - o nome do emitente ("RECEBEMOS DE <nome> OS PRODUTOS..." ou o bloco "IDENTIFICAÇÃO DO EMITENTE").
 * - a forma de pagamento (D-042), quando o PDF traz o bloco "FORMA DE PAGAMENTO" ou o `tPag`; sem ele, nada (`nota-pagamento.ts`).
 *
 * O destinatário (nome, CPF ou CNPJ, endereço), as linhas de produtos, o transportador e os dados adicionais são ignorados: o
 * resultado nem tem campo para eles. O texto também não é guardado.
 *
 * Tolerância: espaços e quebras de linha em qualquer lugar entre as palavras dos rótulos, espaços especiais (NBSP), maiúsculas e
 * minúsculas, acentos presentes ou não nos rótulos, chave em grupos de 4, valor logo depois do rótulo ou em linha de valores
 * depois de uma linha de rótulos (alguns geradores de PDF escrevem assim).
 */

export type DanfeErrorCode = 'texto_vazio' | 'chave_nao_encontrada' | Exclude<ReceiptErrorCode, 'vazio' | 'codigo_nao_reconhecido' | 'chave_invalida'>;

export interface DanfeReading {
  key: AccessKeyInfo;
  /** Data da emissão, só quando cai no mês da chave. */
  issuedOn: IsoDate | null;
  /** "VALOR TOTAL DA NOTA" em centavos; null quando não achou. */
  totalCents: Cents | null;
  /** Razão social do emitente, como está no PDF (sem CPF); null quando não achou. */
  issuerName: string | null;
  /** Forma de pagamento do bloco "FORMA DE PAGAMENTO" (ou `tPag`), quando o PDF o traz; vazio quando não traz (D-042). */
  payments: PaymentForm[];
}

export type DanfeResult = { ok: true; reading: DanfeReading } | { ok: false; code: DanfeErrorCode };

/** Limite do texto lido (o DANFE de uma nota tem poucas páginas); o excedente é ignorado. */
export const DANFE_TEXT_MAX = 400_000;

// ---------------------------------------------------------------------------
// Rótulos
// ---------------------------------------------------------------------------

const ACCENTED: Record<string, string> = {
  A: 'AÁÀÂÃÄ',
  E: 'EÉÈÊË',
  I: 'IÍÌÎÏ',
  O: 'OÓÒÔÕÖ',
  U: 'UÚÙÛÜ',
  C: 'CÇ',
};

/** Expressão para um rótulo escrito em maiúsculas e sem acentos: espaços viram \s+, vogais aceitam acento, ignora caixa. */
function label(text: string): RegExp {
  const source = text
    .split('')
    .map((ch) => {
      if (ch === ' ') return '\\s+';
      const accented = ACCENTED[ch];
      if (accented) return `[${accented}]`;
      return /[A-Z0-9]/.test(ch) ? ch : `\\${ch}`;
    })
    .join('');
  return new RegExp(source, 'i');
}

const KEY_LABEL = label('CHAVE DE ACESSO');
const TOTAL_LABEL = /V(?:ALOR|\.)\s*TOTAL\s+DA\s+(?:NOTA|NF-?E)/i;
const EMISSION_LABELS = [label('DATA DE EMISSAO'), label('DATA DA EMISSAO'), /EMISS[ÃA]O\s*:?(?=\s*\d{2}\/\d{2}\/\d{4})/i];
const CANHOTO_NAME = /RECEBEMOS\s+DE\s+([\s\S]{3,120}?)\s+OS\s+PRODUTOS/i;
const ISSUER_BLOCK = label('IDENTIFICACAO DO EMITENTE');

/**
 * Rótulos que vêm antes de "VALOR TOTAL DA NOTA" na mesma linha do bloco "CÁLCULO DO IMPOSTO" (DANFE retrato, manual do
 * contribuinte): quando o PDF escreve uma linha de rótulos e depois a linha de valores, a posição do total entre os rótulos é a
 * posição do valor entre os valores.
 */
const ROW_LABELS: RegExp[] = [
  label('BASE DE CALC. DO ICMS'),
  label('VALOR DO ICMS SUBST.'),
  label('VALOR DO ICMS'),
  label('BASE DE CALC. ICMS S.T.'),
  label('V. IMP. IMPORTACAO'),
  label('V. ICMS UF REMET.'),
  label('V. FCP UF DEST.'),
  label('V. ICMS UF DEST.'),
  label('VALOR TOTAL DOS PRODUTOS'),
  label('VALOR DO FRETE'),
  label('VALOR DO SEGURO'),
  label('DESCONTO'),
  label('OUTRAS DESPESAS ACESSORIAS'),
  label('VALOR TOTAL IPI'),
  /V\.\s*TOT(?:AL|\.)?\s+TRIB\./i,
];

// ---------------------------------------------------------------------------
// Texto
// ---------------------------------------------------------------------------

/** Espaços especiais viram espaço comum, caracteres invisíveis somem e todo tipo de quebra de linha vira uma só. */
function cleanText(raw: string): string {
  const s = raw.slice(0, DANFE_TEXT_MAX);
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 0x0d) {
      if (s.charCodeAt(i + 1) === 0x0a) i++;
      out += '\n';
    } else if (c === 0x0a || c === 0x2028 || c === 0x2029) out += '\n';
    else if (c === 0x09 || c === 0xa0 || c === 0x1680 || (c >= 0x2000 && c <= 0x200a) || c === 0x202f || c === 0x205f || c === 0x3000) out += ' ';
    else if (c === 0xad || (c >= 0x200b && c <= 0x200d) || c === 0x2060 || c === 0xfeff) continue;
    else out += s[i];
  }
  return out.replace(/[^\S\n]+/g, ' ');
}

const MONEY_AT_START = /^[\s:]*(?:R\$\s*)?(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})(?!\d)/;

/** Valores em reais, um depois do outro (só espaços e quebras de linha entre eles), a partir de `from`. */
function moneyRunAfter(text: string, from: number): Cents[] {
  const out: Cents[] = [];
  let rest = text.slice(from, from + 1500);
  for (let guard = 0; guard < 20; guard++) {
    const m = MONEY_AT_START.exec(rest);
    if (!m) break;
    const cents = parseBRL(m[1]!);
    if (cents === null) break;
    out.push(cents);
    rest = rest.slice(m[0].length);
  }
  return out;
}

/** Quantos rótulos conhecidos da mesma linha vêm logo antes (só espaço entre eles) de `end`. */
function labelsBefore(text: string, end: number): number {
  let before = text.slice(Math.max(0, end - 600), end);
  let count = 0;
  for (let guard = 0; guard < 20; guard++) {
    const trimmed = before.replace(/\s+$/, '');
    let matched = false;
    for (const re of ROW_LABELS) {
      const m = new RegExp(`(?:${re.source})$`, 'i').exec(trimmed);
      if (m) {
        before = trimmed.slice(0, m.index);
        count++;
        matched = true;
        break;
      }
    }
    if (!matched) break;
  }
  return count;
}

function validCents(c: Cents | null): Cents | null {
  return c !== null && c >= 1 && c <= MAX_RECORD_CENTS ? c : null;
}

/** "VALOR TOTAL: R$ 150,00" do canhoto (recibo no alto do DANFE). */
function canhotoTotal(text: string): Cents | null {
  const m = /V(?:ALOR|\.)\s*TOTAL\s*:\s*(?:R\$\s*)?(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})(?!\d)/i.exec(text);
  return m ? validCents(parseBRL(m[1]!)) : null;
}

function totalFromText(text: string): Cents | null {
  const canhoto = canhotoTotal(text);
  const re = new RegExp(TOTAL_LABEL.source, 'ig');
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const end = m.index + m[0].length;
    const run = moneyRunAfter(text, end);
    if (run.length === 0) continue;
    if (run.length === 1) return validCents(run[0]!);
    // Linha de valores depois da linha de rótulos: o total é o valor da mesma posição que o rótulo dele.
    // Sem rótulo conhecido antes (nomes diferentes do manual), o total é o último da linha: ele fecha a linha no DANFE.
    const last = run.length - 1;
    const before = labelsBefore(text, m.index);
    if (canhoto !== null && run.includes(canhoto)) return canhoto;
    return validCents(run[before > 0 ? Math.min(before, last) : last]!);
  }
  if (canhoto !== null) return canhoto;
  // NFC-e em PDF: "Valor a pagar R$ 87,40" ou "Valor total R$ 87,40".
  const nfce = /VALOR\s+(?:A\s+PAGAR|TOTAL)\s*(?:R\$)?\s*(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})(?!\d)/i.exec(text);
  return nfce ? validCents(parseBRL(nfce[1]!)) : null;
}

const DATE_AT = /(\d{2})\/(\d{2})\/(\d{4})/;

function firstDateAfter(text: string, from: number, month: IsoMonth): IsoDate | null {
  const rest = text.slice(from, from + 800);
  const re = new RegExp(DATE_AT.source, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(rest)) !== null) {
    const iso = `${m[3]}-${m[2]}-${m[1]}`;
    if (isValidIsoDate(iso)) return iso.slice(0, 7) === month ? iso : null;
  }
  return null;
}

/**
 * Data da emissão: primeira data depois de "DATA DA EMISSÃO", "DATA DE EMISSÃO" ou "EMISSÃO:". A emissão sempre cai no mês da
 * chave (AAMM); data de outro mês é leitura errada e não vale.
 */
function issuedOnFromText(text: string, month: IsoMonth): IsoDate | null {
  for (const re of EMISSION_LABELS) {
    const g = new RegExp(re.source, 'ig');
    let m: RegExpExecArray | null;
    while ((m = g.exec(text)) !== null) {
      const date = firstDateAfter(text, m.index + m[0].length, month);
      if (date) return date;
    }
  }
  return null;
}

const NOT_A_NAME = /DANFE|DOCUMENTO\s+AUXILIAR|CHAVE\s+DE|NATUREZA|PROTOCOLO|CNPJ|CPF|INSCRI|DESTINAT|REMETENTE|\d{5,}/i;

function cleanName(name: string): string | null {
  const friendly = friendlyIssuerName(name);
  const compact = friendly.replace(/\s+/g, ' ').trim();
  if (compact.length < 2 || compact.length > 80 || !/[A-Za-zÀ-ÿ]{2}/.test(compact) || /DESTINAT/i.test(compact)) return null;
  return compact;
}

/** Nome do emitente: o do canhoto ("RECEBEMOS DE <nome> OS PRODUTOS...") ou a primeira linha do bloco do emitente. */
function issuerNameFromText(text: string): string | null {
  const canhoto = CANHOTO_NAME.exec(text);
  if (canhoto) {
    const name = cleanName(canhoto[1]!.replace(/\s+/g, ' '));
    if (name) return name;
  }
  const block = ISSUER_BLOCK.exec(text);
  if (block) {
    const lines = text
      .slice(block.index + block[0].length, block.index + block[0].length + 400)
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l !== '');
    const line = lines[0];
    if (line && line.length <= 80 && !NOT_A_NAME.test(line)) return cleanName(line);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Entrada
// ---------------------------------------------------------------------------

/**
 * Lê o texto extraído do PDF de um DANFE. Erros: `texto_vazio` (PDF sem texto, como uma foto), `chave_nao_encontrada` (não parece
 * ser o PDF de uma nota) e os da própria chave (`digito_invalido`, `modelo_nao_suportado` etc.). Sem a chave não há leitura: ela
 * confere que é mesmo uma nota e serve ao aviso de nota já anotada.
 */
export function danfeFromText(raw: string): DanfeResult {
  const text = typeof raw === 'string' ? cleanText(raw) : '';
  if (text.replace(/\s+/g, '').length < 30) return { ok: false, code: 'texto_vazio' };
  const found = findAccessKey(text, KEY_LABEL);
  if (!found.ok) {
    const code = found.code;
    return { ok: false, code: code === 'chave_nao_encontrada' || code === 'vazio' || code === 'codigo_nao_reconhecido' || code === 'chave_invalida' ? 'chave_nao_encontrada' : code };
  }
  const key = found.info;
  return {
    ok: true,
    reading: {
      key,
      issuedOn: issuedOnFromText(text, key.yearMonth),
      totalCents: totalFromText(text),
      issuerName: issuerNameFromText(text),
      payments: paymentFormsFromText(text, { withCodes: true }),
    },
  };
}

/** O que `receiptDraft` precisa a partir do DANFE lido. */
export function factsFromDanfe(reading: DanfeReading): ReceiptFacts {
  return { key: reading.key, issuedOn: reading.issuedOn, totalCents: reading.totalCents, issuerName: reading.issuerName, payments: reading.payments };
}
