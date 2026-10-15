import { todayIn } from '../dates';
import { MAX_RECORD_CENTS } from '../money';
import { decodeImportBytes } from './decode';
import type { ImportFileResult, ParsedLine } from './tipos';
import { IMPORT_MAX_LINES } from './tipos';
import { cleanDescription, parseFileDate } from './valores';

/**
 * Leitor de OFX (Open Financial Exchange) para extrato de conta (BANKMSGSRSV1) e fatura de cartão (CREDITCARDMSGSRSV1), nas duas
 * formas: SGML 1.x (valores sem tag de fechamento) e XML 2.x. Lê só o que importa: STMTTRN com DTPOSTED, TRNAMT, FITID, NAME e
 * MEMO. O saldo (LEDGERBAL, AVAILBAL), o número da conta, o banco e o cabeçalho são ignorados e não saem daqui.
 * Sinal: TRNAMT negativo = dinheiro que saiu (compra no cartão, gasto na conta); positivo = entrou.
 */

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/** &amp; &lt; &gt; &quot; &apos; e referências numéricas. O que não é entidade conhecida fica como está. */
export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, name: string) => {
    if (name[0] === '#') {
      const code = name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : all;
    }
    return ENTITIES[name.toLowerCase()] ?? all;
  });
}

/** O texto parece um arquivo OFX (cabeçalho OFXHEADER ou elemento <OFX>)? */
export function looksLikeOfx(text: string): boolean {
  const head = text.slice(0, 4096);
  return /OFXHEADER\s*:/i.test(head) || /<OFX[\s>]/i.test(text.slice(0, 20000));
}

interface RawTransaction {
  type?: string;
  posted?: string;
  amount?: string;
  fitId?: string;
  name?: string;
  memo?: string;
}

/** Descrição da linha: MEMO e NAME juntos quando trazem coisas diferentes ("NOME - detalhe" sem repetir o que um contém do outro). */
export function ofxDescription(name: string | undefined, memo: string | undefined): string {
  const n = cleanDescription(decodeEntities(name ?? ''));
  const m = cleanDescription(decodeEntities(memo ?? ''));
  if (n === '' || m === '') return n || m;
  const nl = n.toLocaleLowerCase('pt-BR');
  const ml = m.toLocaleLowerCase('pt-BR');
  if (nl === ml || ml.includes(nl)) return m;
  if (nl.includes(ml)) return n;
  return cleanDescription(`${n} ${m}`);
}

/** Fuso usado para converter a data de um OFX que informa o fuso, quando a tela não passa o do espaço. */
export const OFX_DEFAULT_TIME_ZONE = 'America/Sao_Paulo';

/**
 * Dia de DTPOSTED. Sem fuso, ou com a hora zerada (data sem hora, como os bancos mandam "20261002000000[0:GMT]"), vale o dia
 * escrito. Com hora e fuso ("20261002013000[0:GMT]", "[-3:BRT]"), o instante é convertido para o dia no fuso da pessoa
 * (`timeZone`, o do espaço; São Paulo se faltar), para uma compra da noite não cair no dia seguinte.
 */
export function ofxDate(value: string | undefined, timeZone: string = OFX_DEFAULT_TIME_ZONE): string | null {
  const m = /^\s*(\d{4})(\d{2})(\d{2})(?:(\d{2})(\d{2})(\d{2})?(?:\.\d+)?)?\s*(?:\[\s*([+-]?\d{1,2}(?:\.\d+)?)\s*(?::[^\]]*)?\])?/.exec(value ?? '');
  if (!m) return null;
  const day = parseFileDate(`${m[1]}-${m[2]}-${m[3]}`);
  if (day === null || m[4] === undefined || m[7] === undefined) return day;
  const [hh, mm, ss] = [Number(m[4]), Number(m[5]), Number(m[6] ?? '0')];
  if (hh > 23 || mm > 59 || ss > 59 || (hh === 0 && mm === 0 && ss === 0)) return day;
  const offsetHours = Number(m[7]);
  if (!Number.isFinite(offsetHours) || Math.abs(offsetHours) > 14) return day;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const instant = Date.UTC(y, mo - 1, d, hh, mm, ss) - Math.round(offsetHours * 3600) * 1000;
  try {
    return todayIn(timeZone, new Date(instant));
  } catch {
    return day;
  }
}

/**
 * Valor de TRNAMT em centavos, com sinal. Leitor próprio (o OFX não usa separador de milhar): sinal opcional, dígitos e no máximo
 * um separador decimal, "." ou ",". Mais de duas casas ("-1.500", "1,500"), mais de um separador ou outro caractere → null (a
 * linha fica de fora, em vez de virar R$ 1.500,00 ou R$ 1,50 por engano). Passa de 13 dígitos → acima do limite do app.
 */
export function parseOfxAmount(raw: string): number | null {
  const m = /^([+-])?(\d*)(?:[.,](\d{1,2}))?$/.exec(raw.trim());
  if (!m || (m[2] === '' && m[3] === undefined)) return null;
  const whole = (m[2] ?? '').replace(/^0+(?=\d)/, '') || '0';
  const negative = m[1] === '-';
  if (whole.length > 13) return (negative ? -1 : 1) * (MAX_RECORD_CENTS + 1);
  const cents = Number(whole) * 100 + Number((m[3] ?? '').padEnd(2, '0') || '0');
  return negative ? -cents : cents;
}

/** Lê o texto de um OFX. Erros: ofx_invalido (nenhum extrato), moeda_diferente, linhas_demais, sem_lancamentos. */
export function parseOfxText(text: string, timeZone: string = OFX_DEFAULT_TIME_ZONE): ImportFileResult {
  const start = text.search(/<OFX[\s>]/i);
  if (start < 0) return { ok: false, code: 'ofx_invalido' };
  const body = text.slice(start);
  const tag = /<(\/?)([A-Za-z][A-Za-z0-9_.]*)\s*>([^<]*)/g;
  const raws: RawTransaction[] = [];
  let current: RawTransaction | null = null;
  let currency: string | null = null;
  let hasCard = false;
  let hasBank = false;
  let balance = false;
  let overflow = false;
  for (let m = tag.exec(body); m !== null; m = tag.exec(body)) {
    const closing = m[1] === '/';
    const name = m[2]!.toUpperCase();
    const value = m[3]!.trim();
    if (name === 'STMTTRN') {
      if (closing) {
        if (current) raws.push(current);
        current = null;
      } else {
        if (current) raws.push(current);
        current = {};
      }
      if (raws.length > IMPORT_MAX_LINES) {
        overflow = true;
        break;
      }
      continue;
    }
    if (closing) {
      if (current && (name === 'BANKTRANLIST' || name === 'STMTRS' || name === 'CCSTMTRS')) {
        raws.push(current);
        current = null;
      }
      continue;
    }
    if (name === 'CURDEF') currency = value.toUpperCase();
    else if (name === 'CCSTMTRS' || name === 'CREDITCARDMSGSRSV1') hasCard = true;
    else if (name === 'STMTRS' || name === 'BANKMSGSRSV1') hasBank = true;
    else if (name === 'LEDGERBAL' || name === 'AVAILBAL' || name === 'BALAMT') balance = true;
    if (!current) continue;
    switch (name) {
      case 'TRNTYPE':
        current.type = value;
        break;
      case 'DTPOSTED':
        current.posted = value;
        break;
      case 'TRNAMT':
        current.amount = value;
        break;
      case 'FITID':
        current.fitId = value;
        break;
      case 'NAME':
        current.name = value;
        break;
      case 'MEMO':
        current.memo = value;
        break;
      default:
    }
  }
  if (current) raws.push(current);
  if (overflow || raws.length > IMPORT_MAX_LINES) return { ok: false, code: 'linhas_demais' };
  if (!hasCard && !hasBank && raws.length === 0) return { ok: false, code: 'ofx_invalido' };
  if (currency !== null && currency !== 'BRL' && currency !== '') return { ok: false, code: 'moeda_diferente' };
  const lines: ParsedLine[] = [];
  let ignored = 0;
  for (const r of raws) {
    const date = ofxDate(r.posted, timeZone);
    const cents = r.amount === undefined ? null : parseOfxAmount(decodeEntities(r.amount));
    if (date === null || cents === null || cents === 0) {
      ignored += 1;
      continue;
    }
    const fit = r.fitId ? cleanFitId(decodeEntities(r.fitId)) : '';
    lines.push({
      ordinal: lines.length + 1,
      date,
      description: ofxDescription(r.name, r.memo) || 'Sem descrição',
      amountCents: cents,
      fitId: fit === '' ? null : fit,
    });
  }
  if (lines.length === 0) return { ok: false, code: 'sem_lancamentos' };
  return {
    ok: true,
    parse: { source: 'ofx', statement: hasCard && !hasBank ? 'cartao' : hasBank && !hasCard ? 'conta' : null, lines, ignored, balanceIgnored: balance, cardPositive: false },
  };
}

/** FITID com no máximo 64 caracteres visíveis; serve só para o resumo da chave. */
function cleanFitId(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, 64);
}

/** Lê os bytes de um OFX (UTF-8 ou Windows-1252). */
export function parseOfxBytes(bytes: Uint8Array, timeZone: string = OFX_DEFAULT_TIME_ZONE): ImportFileResult {
  return parseOfxText(decodeImportBytes(bytes).text, timeZone);
}
