import type { IsoDate, IsoMonth } from './dates';
import { formatDateBR, formatMonthYearBR, isValidIsoDate, monthOf } from './dates';
import type { Cents } from './money';
import { MAX_RECORD_CENTS, formatBRL } from './money';
import { sha256Hex } from './sha256';
import { DESCRIPTION_MAX } from './validation';

/**
 * Leitura de notas fiscais (Ciclo E, D-038, fase 1): QR da NFC-e, código de barras e chave de acesso da NF-e.
 *
 * Tudo roda no aparelho, sem servidor. Regras de privacidade (valem para nota.ts e danfe.ts):
 * - a chave de acesso (44 caracteres) NUNCA é guardada: a chave de uma NF-e de emitente pessoa física carrega o CPF dele
 *   ("000" + CPF no lugar do CNPJ). O que o app guarda, só quando a pessoa toca em Salvar, é o resumo SHA-256 da chave
 *   normalizada (64 hexadecimais minúsculos, `receiptKeyDigest`), que basta para avisar que a nota já foi anotada;
 * - o CPF ou CNPJ do destinatário que vem em alguns QR (parâmetro cDest, campo idDest) nunca é lido para fora destas funções;
 * - o CPF de emitente pessoa física também não aparece em nenhum resultado (`cnpj` e `cnpjFormatted` ficam null); a chave
 *   inteira só existe em memória em `AccessKeyInfo.key`, para conferir e consultar, e não é gravada nem mostrada;
 * - o link inteiro do QR não é guardado: só o endereço oficial sanitizado (`officialQueryUrl`) vai para a tela, para abrir.
 *
 * Sem `URL`, `URLSearchParams`, `normalize`, lookbehind, grupos nomeados nem `\p{}`: o Hermes (iOS e Android) tem suporte parcial.
 */

// ---------------------------------------------------------------------------
// Estados (código IBGE da chave de acesso)
// ---------------------------------------------------------------------------

/** Código IBGE da UF (2 primeiros dígitos da chave) para a sigla. */
export const UF_BY_CODE = {
  '11': 'RO',
  '12': 'AC',
  '13': 'AM',
  '14': 'RR',
  '15': 'PA',
  '16': 'AP',
  '17': 'TO',
  '21': 'MA',
  '22': 'PI',
  '23': 'CE',
  '24': 'RN',
  '25': 'PB',
  '26': 'PE',
  '27': 'AL',
  '28': 'SE',
  '29': 'BA',
  '31': 'MG',
  '32': 'ES',
  '33': 'RJ',
  '35': 'SP',
  '41': 'PR',
  '42': 'SC',
  '43': 'RS',
  '50': 'MS',
  '51': 'MT',
  '52': 'GO',
  '53': 'DF',
} as const;

export type UfSigla = (typeof UF_BY_CODE)[keyof typeof UF_BY_CODE];
export const UF_SIGLAS = Object.values(UF_BY_CODE) as UfSigla[];

// ---------------------------------------------------------------------------
// Erros
// ---------------------------------------------------------------------------

export const RECEIPT_ERROR_CODES = [
  'vazio',
  'codigo_nao_reconhecido',
  'chave_invalida',
  'digito_invalido',
  'uf_invalida',
  'data_invalida',
  'cnpj_invalido',
  'modelo_nao_suportado',
] as const;
export type ReceiptErrorCode = (typeof RECEIPT_ERROR_CODES)[number];

// ---------------------------------------------------------------------------
// Chave de acesso
// ---------------------------------------------------------------------------

/** 55 = NF-e (compras online, DANFE em PDF); 65 = NFC-e (varejo presencial, QR). */
export type ReceiptModel = '55' | '65';

/**
 * Atenção (privacidade): `AccessKeyInfo` e o resultado de `readReceiptCode` guardam a chave de 44 caracteres, que numa nota de
 * pessoa física contém o CPF do emitente. Só existem em memória, para a tela de confirmação. O que pode ir para o banco, para
 * o rascunho mantido sem conexão e para qualquer armazenamento do aparelho é o `ReceiptDraft` (com `receiptKey`, o resumo
 * SHA-256), nunca a leitura, a chave nem `key`.
 */
export interface AccessKeyInfo {
  /**
   * A chave inteira (44 caracteres, maiúsculas). Só em memória: NÃO é o que o registro guarda (a de pessoa física tem o CPF
   * do emitente). O registro guarda `digest`.
   */
  key: string;
  /** Resumo SHA-256 da chave (64 hexadecimais minúsculos): o `receiptKey` do registro e da compra no cartão. Não revela o CPF. */
  digest: string;
  uf: UfSigla;
  /** Mês da emissão (AAMM da chave). */
  yearMonth: IsoMonth;
  /** CNPJ do emitente (14 caracteres: letras e números a partir do CNPJ alfanumérico). Null quando o emitente é pessoa física. */
  cnpj: string | null;
  /** "12.345.678/0001-90". Null quando o emitente é pessoa física (o CPF nunca sai daqui). */
  cnpjFormatted: string | null;
  model: ReceiptModel;
  series: number;
  number: number;
  /** Tipo de emissão (1 = normal; 9 = contingência off-line da NFC-e). */
  emissionType: number;
}

export type AccessKeyResult = { ok: true; info: AccessKeyInfo } | { ok: false; code: ReceiptErrorCode };

/**
 * O que o app grava no lugar da chave (`receiptKey` de createRecord e addCardPurchase): o SHA-256 da chave normalizada
 * (44 caracteres, maiúsculas), em 64 hexadecimais minúsculos. Aceita a chave com espaços e minúsculas; devolve null quando a
 * chave não é válida (dígito verificador, UF, mês, CNPJ numérico ou alfanumérico, modelo). Mesmo resumo de
 * `AccessKeyInfo.digest` e de `encode(sha256(chave), 'hex')` no banco.
 */
export function receiptKeyDigest(accessKey: string): string | null {
  const parsed = parseAccessKey(accessKey);
  return parsed.ok ? parsed.info.digest : null;
}

/** Forma da chave desde o CNPJ alfanumérico (NT 2025.001): 6 números, 12 letras ou números, 26 números. */
const KEY_SHAPE = /^[0-9]{6}[0-9A-Z]{12}[0-9]{26}$/;

/**
 * Dígito verificador da chave: módulo 11, pesos de 2 a 9 da direita para a esquerda sobre os 43 primeiros caracteres, cada um
 * valendo seu código ASCII menos 48 (número = ele mesmo; letra do CNPJ alfanumérico = 17 a 42). Resto 0 ou 1 dá dígito 0.
 */
export function accessKeyCheckDigit(first43: string): number {
  let sum = 0;
  for (let i = 0; i < 43; i++) sum += (first43.charCodeAt(42 - i) - 48) * (2 + (i % 8));
  const r = sum % 11;
  return r < 2 ? 0 : 11 - r;
}

const CNPJ_W1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
const CNPJ_W2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

function mod11Digit(chars: string, weights: number[]): number {
  let sum = 0;
  for (let i = 0; i < weights.length; i++) sum += (chars.charCodeAt(i) - 48) * weights[i]!;
  const r = sum % 11;
  return r < 2 ? 0 : 11 - r;
}

/** CNPJ com dígitos verificadores (numérico ou alfanumérico: mesma conta, letra = ASCII menos 48). */
export function cnpjValid(cnpj: string): boolean {
  if (!/^[0-9A-Z]{12}[0-9]{2}$/.test(cnpj) || /^(.)\1{13}$/.test(cnpj)) return false;
  const d1 = mod11Digit(cnpj, CNPJ_W1);
  const d2 = mod11Digit(cnpj.slice(0, 12) + String(d1), CNPJ_W2);
  return cnpj.charCodeAt(12) - 48 === d1 && cnpj.charCodeAt(13) - 48 === d2;
}

/** CPF com dígitos verificadores. Só serve para reconhecer emitente pessoa física na chave; o número nunca é devolvido. */
function cpfValid(cpf: string): boolean {
  if (!/^[0-9]{11}$/.test(cpf) || /^(.)\1{10}$/.test(cpf)) return false;
  const digit = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += (cpf.charCodeAt(i) - 48) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return digit(9) === cpf.charCodeAt(9) - 48 && digit(10) === cpf.charCodeAt(10) - 48;
}

/** "12345678000190" → "12.345.678/0001-90" (também com letras). */
export function formatCnpj(cnpj: string): string {
  return `${cnpj.slice(0, 2)}.${cnpj.slice(2, 5)}.${cnpj.slice(5, 8)}/${cnpj.slice(8, 12)}-${cnpj.slice(12)}`;
}

/**
 * Lê a chave de acesso da NF-e (modelo 55) ou da NFC-e (modelo 65): 44 caracteres, dígito verificador, UF (código IBGE), AAMM,
 * CNPJ do emitente (com os dígitos verificadores dele), modelo, série e número. Aceita espaços entre os grupos de 4 e minúsculas.
 * Ordem das conferências: forma, dígito verificador, UF, mês e ano, CNPJ, modelo. O banco não vê a chave (só o resumo dela,
 * `digest`), então estas conferências são só do core.
 */
export function parseAccessKey(input: string): AccessKeyResult {
  if (typeof input !== 'string') return { ok: false, code: 'chave_invalida' };
  const key = input.replace(/\s+/g, '').toUpperCase();
  if (!KEY_SHAPE.test(key)) return { ok: false, code: 'chave_invalida' };
  if (accessKeyCheckDigit(key.slice(0, 43)) !== key.charCodeAt(43) - 48) return { ok: false, code: 'digito_invalido' };
  const uf = (UF_BY_CODE as Record<string, UfSigla | undefined>)[key.slice(0, 2)];
  if (!uf) return { ok: false, code: 'uf_invalida' };
  const year = 2000 + Number(key.slice(2, 4));
  const month = Number(key.slice(4, 6));
  // A NF-e começou em 2006; mês fora de 1 a 12 é chave digitada errada que passou pelo dígito verificador.
  if (year < 2006 || month < 1 || month > 12) return { ok: false, code: 'data_invalida' };
  const cnpjText = key.slice(6, 20);
  let cnpj: string | null = null;
  if (cnpjValid(cnpjText)) cnpj = cnpjText;
  // Emitente pessoa física (produtor rural, por exemplo): "000" + CPF no lugar do CNPJ.
  else if (!(cnpjText.startsWith('000') && cpfValid(cnpjText.slice(3)))) return { ok: false, code: 'cnpj_invalido' };
  const model = key.slice(20, 22);
  if (model !== '55' && model !== '65') return { ok: false, code: 'modelo_nao_suportado' };
  return {
    ok: true,
    info: {
      key,
      digest: sha256Hex(key),
      uf,
      yearMonth: `${year}-${key.slice(4, 6)}`,
      cnpj,
      cnpjFormatted: cnpj ? formatCnpj(cnpj) : null,
      model,
      series: Number(key.slice(22, 25)),
      number: Number(key.slice(25, 34)),
      emissionType: Number(key[34]),
    },
  };
}

export type KeySearch = { ok: true; info: AccessKeyInfo; index: number } | { ok: false; code: ReceiptErrorCode | 'chave_nao_encontrada' };

/** Prioridade do erro a mostrar quando há vários candidatos que parecem chave mas nenhum passa. */
const KEY_ERROR_RANK: Record<string, number> = { modelo_nao_suportado: 5, cnpj_invalido: 4, data_invalida: 3, uf_invalida: 2, digito_invalido: 1 };

/**
 * Procura uma chave de acesso válida num texto (mensagem colada, texto de um PDF). A chave pode vir em grupos de 4 separados por
 * espaços ou quebras de linha, como no DANFE. Com `after`, prefere a primeira chave que aparece depois desse trecho (o rótulo
 * "CHAVE DE ACESSO"); sem ele ou sem chave depois dele, a primeira válida do texto. Sem nenhuma válida, devolve o erro do candidato
 * que mais se aproximou ('chave_nao_encontrada' quando nada parece chave). Tolera extratores de PDF que colam o rótulo no começo da
 * chave ("CHAVE DE ACESSO3326 1012...", "NFe3326...") ou texto no fim dela ("...3214NATUREZA"); um número com mais de 44 dígitos
 * não é chave.
 */
export function findAccessKey(text: string, after?: RegExp): KeySearch {
  const tokens: { text: string; start: number }[] = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) tokens.push({ text: m[0], start: m.index });
  // Pontos de partida: palavras que começam por número. Alguns extratores de PDF colam o rótulo no valor ("ACESSO3326", "NFe3326..."):
  // a chave nunca começa por letra (UF e AAMM são números), então o trecho depois das letras iniciais também serve de partida.
  const starts: { i: number; skip: number }[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const word = tokens[i]!.text;
    if (/^[0-9]/.test(word)) starts.push({ i, skip: 0 });
    else {
      const glued = /^[^\d\s]+(?=\d)/.exec(word);
      if (glued) starts.push({ i, skip: glued[0].length });
    }
  }
  const found: { info: AccessKeyInfo; index: number }[] = [];
  let bestError: ReceiptErrorCode | null = null;
  for (const { i, skip } of starts) {
    let joined = '';
    for (let j = i; j < tokens.length && j < i + 44; j++) {
      const t = j === i ? tokens[i]!.text.slice(skip) : tokens[j]!.text;
      if (!/^[0-9A-Za-z]+$/.test(t)) break;
      joined += t;
      if (joined.length < 44) continue;
      // Mais de 44 só vale quando o excesso é texto colado no fim da chave ("...3214NATUREZA"); número maior que a chave não é chave.
      if (joined.length > 44 && !/[A-Za-z]/.test(joined[44]!)) break;
      const upper = joined.slice(0, 44).toUpperCase();
      if (KEY_SHAPE.test(upper)) {
        const parsed = parseAccessKey(upper);
        if (parsed.ok) found.push({ info: parsed.info, index: tokens[i]!.start + skip });
        else if (bestError === null || (KEY_ERROR_RANK[parsed.code] ?? 0) > (KEY_ERROR_RANK[bestError] ?? 0)) bestError = parsed.code;
      }
      break;
    }
  }
  if (found.length > 0) {
    let from = -1;
    if (after) {
      const g = new RegExp(after.source, after.flags.replace('g', ''));
      const lm = g.exec(text);
      if (lm) from = lm.index + lm[0].length;
    }
    const preferred = from >= 0 ? found.find((f) => f.index >= from) : undefined;
    const pick = preferred ?? found[0]!;
    return { ok: true, info: pick.info, index: pick.index };
  }
  return { ok: false, code: bestError ?? 'chave_nao_encontrada' };
}

// ---------------------------------------------------------------------------
// QR da NFC-e
// ---------------------------------------------------------------------------

export type QrLayout = 'nomeado' | 'v2' | 'v3' | 'outro';

export interface NfceQr {
  key: AccessKeyInfo;
  /** 'nomeado': versão antiga com chNFe, vNF e dhEmi; 'v2' e 'v3': p=chave|versão|...; 'outro': versão futura, só a chave. */
  layout: QrLayout;
  version: number | null;
  environment: 'producao' | 'homologacao' | null;
  /** v2 e v3 com dia da emissão e valor total no QR (contingência off-line). */
  contingency: boolean;
  /** Data da emissão quando o QR a traz (dia + mês da chave, ou dhEmi). Sempre dentro do mês da chave. */
  issuedOn: IsoDate | null;
  /** Valor total quando o QR o traz (vNF), em centavos; null se ausente, zero ou acima do limite do app. */
  totalCents: Cents | null;
}

export type NfceQrResult = { ok: true; qr: NfceQr } | { ok: false; code: ReceiptErrorCode };

const QR_MAX_LENGTH = 4000;

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function queryOf(text: string): string | null {
  const q = text.indexOf('?');
  if (q < 0) return null;
  const hash = text.indexOf('#', q);
  return text.slice(q + 1, hash < 0 ? undefined : hash);
}

/** Valor de um parâmetro da query (nome sem diferenciar maiúsculas), ainda codificado. */
function queryParam(query: string, name: string): string | null {
  const wanted = name.toLowerCase();
  for (const part of query.split('&')) {
    const eq = part.indexOf('=');
    const key = eq < 0 ? part : part.slice(0, eq);
    if (key.toLowerCase() === wanted) return eq < 0 ? '' : part.slice(eq + 1);
  }
  return null;
}

/** "87.40", "87,4", "87" → centavos, sem ponto flutuante. Zero e acima do limite do app viram null. */
function decimalToCents(text: string | undefined): Cents | null {
  if (text === undefined) return null;
  const m = /^(\d{1,9})(?:[.,](\d{1,2}))?$/.exec(text.trim());
  if (!m) return null;
  const cents = Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0') || '0');
  return cents >= 1 && cents <= MAX_RECORD_CENTS ? cents : null;
}

/** dhEmi do QR antigo: texto ISO em hexadecimal ("323031342d31312d3235..."), ou o próprio texto ISO. */
function dateFromDhEmi(value: string): IsoDate | null {
  let text = value.trim();
  if (/^([0-9a-fA-F]{2}){10,}$/.test(text)) {
    let decoded = '';
    for (let i = 0; i < text.length; i += 2) decoded += String.fromCharCode(parseInt(text.slice(i, i + 2), 16));
    text = decoded;
  }
  const day = text.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) && isValidIsoDate(day) ? day : null;
}

function environmentOf(value: string | undefined | null): NfceQr['environment'] {
  if (value === '1') return 'producao';
  if (value === '2') return 'homologacao';
  return null;
}

/** Dia (2 dígitos) da contingência + mês da chave → data. Dia que não existe no mês da chave vira null. */
function dateFromDay(day: string | undefined, yearMonth: IsoMonth): IsoDate | null {
  if (day === undefined || !/^\d{2}$/.test(day)) return null;
  const iso = `${yearMonth}-${day}`;
  return isValidIsoDate(iso) ? iso : null;
}

/**
 * Lê o endereço do QR da NFC-e (ou só o que vem depois de "p="):
 * - versão 2 online: `p=chave|2|ambiente|id do CSC|hash`;
 * - versão 2 em contingência: `p=chave|2|ambiente|dia|valor total|digest|id do CSC|hash`;
 * - versão 3 online: `p=chave|3|ambiente`;
 * - versão 3 em contingência: `p=chave|3|ambiente|dia|valor total|tipo do destinatário|CPF ou CNPJ do destinatário|assinatura`;
 * - versões antigas com parâmetros nomeados: `chNFe=...&nVersao=100&tpAmb=1&cDest=...&dhEmi=hex&vNF=87.40&...`.
 * Devolve a chave (conferida por `parseAccessKey`) e, quando o QR traz, a data e o valor total. O destinatário (cDest, idDest) e
 * os códigos de segurança (CSC, hash, assinatura, digest) são ignorados. O endereço (domínio) não é conferido aqui: quem abre a
 * página oficial usa `officialQueryUrl`.
 */
export function parseNfceQr(input: string): NfceQrResult {
  if (typeof input !== 'string') return { ok: false, code: 'codigo_nao_reconhecido' };
  const text = input.trim();
  if (text === '') return { ok: false, code: 'vazio' };
  if (text.length > QR_MAX_LENGTH) return { ok: false, code: 'codigo_nao_reconhecido' };

  const query = queryOf(text);
  const named = query !== null ? queryParam(query, 'chNFe') : null;
  if (named !== null) return parseNamedQr(query!, safeDecode(named));

  const pValue = query !== null ? queryParam(query, 'p') : null;
  // Sem endereço: o texto pode ser só o conteúdo de p ("chave|2|1|1|hash").
  const payload = pValue !== null ? safeDecode(pValue) : query === null && /^[0-9A-Za-z]{44}\|/.test(text) ? text : null;
  if (payload === null) return { ok: false, code: 'codigo_nao_reconhecido' };

  const fields = payload.split('|');
  const key = parseAccessKey(fields[0] ?? '');
  if (!key.ok) return { ok: false, code: key.code };
  const version = /^\d{1,2}$/.test(fields[1] ?? '') ? Number(fields[1]) : null;
  const environment = environmentOf(fields[2]);
  const base = { key: key.info, version, environment };

  if (version === 2 || version === 3) {
    const contingency = fields.length >= 8;
    const issuedOn = contingency ? dateFromDay(fields[3], key.info.yearMonth) : null;
    const totalCents = contingency ? decimalToCents(fields[4]) : null;
    return { ok: true, qr: { ...base, layout: version === 2 ? 'v2' : 'v3', contingency, issuedOn, totalCents } };
  }
  // Versão que ainda não conhecemos: a chave basta para o resto do fluxo.
  return { ok: true, qr: { ...base, layout: 'outro', contingency: false, issuedOn: null, totalCents: null } };
}

function parseNamedQr(query: string, chNFe: string): NfceQrResult {
  const key = parseAccessKey(chNFe);
  if (!key.ok) return { ok: false, code: key.code };
  const get = (name: string) => {
    const v = queryParam(query, name);
    return v === null ? undefined : safeDecode(v);
  };
  const versionText = get('nVersao');
  const dhEmi = get('dhEmi');
  const issued = dhEmi ? dateFromDhEmi(dhEmi) : null;
  return {
    ok: true,
    qr: {
      key: key.info,
      layout: 'nomeado',
      version: versionText !== undefined && /^\d{1,4}$/.test(versionText) ? Number(versionText) : null,
      environment: environmentOf(get('tpAmb')),
      contingency: false,
      // A data tem de cair no mês da chave; senão o QR foi lido errado e a data não vale.
      issuedOn: issued !== null && issued.slice(0, 7) === key.info.yearMonth ? issued : null,
      totalCents: decimalToCents(get('vNF')),
    },
  };
}

// ---------------------------------------------------------------------------
// O que a câmera ou a colagem trouxe
// ---------------------------------------------------------------------------

export type ReceiptReading =
  | { ok: true; source: 'qr' | 'chave'; key: AccessKeyInfo; qr: NfceQr | null }
  | { ok: false; code: ReceiptErrorCode };

/**
 * Ponto de entrada de "Escanear nota fiscal" e de "Colar o link ou a chave da nota": aceita o endereço do QR (NFC-e), os 44
 * caracteres da chave (código de barras do DANFE, com ou sem espaços, pontos e traços, com "NFe" na frente) ou um texto que
 * contenha uma chave.
 */
export function readReceiptCode(raw: string): ReceiptReading {
  if (typeof raw !== 'string' || raw.trim() === '') return { ok: false, code: 'vazio' };
  const text = raw.trim();
  if (text.length > QR_MAX_LENGTH) return { ok: false, code: 'codigo_nao_reconhecido' };

  if (/^https?:\/\//i.test(text) || /[?&](p|chNFe)=/i.test(text) || /^[0-9A-Za-z]{44}\|/.test(text)) {
    const qr = parseNfceQr(text);
    if (qr.ok) return { ok: true, source: 'qr', key: qr.qr.key, qr: qr.qr };
    // Endereço de outro site (sem chave) cai para a busca de chave no texto, abaixo.
    if (qr.code !== 'codigo_nao_reconhecido') return qr;
  }

  const compact = text.replace(/^NFe/i, '').replace(/[\s.\-/]/g, '').toUpperCase();
  if (/^[0-9A-Z]{44}$/.test(compact)) {
    const parsed = parseAccessKey(compact);
    return parsed.ok ? { ok: true, source: 'chave', key: parsed.info, qr: null } : parsed;
  }
  const found = findAccessKey(text);
  if (found.ok) return { ok: true, source: 'chave', key: found.info, qr: null };
  if (found.code !== 'chave_nao_encontrada') return { ok: false, code: found.code };
  // Só números, mas com a contagem errada: provavelmente faltou ou sobrou um.
  if (/^[0-9]{30,60}$/.test(compact) || (/^[0-9A-Z]{40,48}$/.test(compact) && /[0-9]{20}/.test(compact))) return { ok: false, code: 'chave_invalida' };
  return { ok: false, code: 'codigo_nao_reconhecido' };
}

// ---------------------------------------------------------------------------
// Página oficial da Sefaz ("Ver a nota no site da Sefaz")
// ---------------------------------------------------------------------------

/**
 * Domínios oficiais de consulta pública da NFC-e por QR Code, por UF, reconferidos por busca em 09/10/2026. Só o domínio vale
 * (o caminho e a consulta são os do QR lido). Cada domínio é do próprio governo do estado (Sefaz, Sefin ou Sefa) e vem de uma
 * destas fontes: página oficial da Sefaz, nota impressa com o QR de uma compra recente, ou mais de uma fonte da comunidade que
 * emite NFC-e (fórum do ACBr, base de conhecimento de fornecedores), anotada em cada linha. A lista de cada UF no portal nacional
 * da NFC-e (nfce.encat.org/desenvolvedor/qrcode) não pôde ser aberta nesta conferência (só havia busca); vale conferir lá.
 *
 * Fora da lista, por falta de confirmação nesta conferência: AC, AP, MA, SE, MT, PA, PE e RR. Para eles, e para qualquer
 * estado que mude de endereço, vale a regra de Enzo (spec9 §5): o endereço vindo do próprio QR é aceito se o domínio termina em
 * ".gov.br" e é coerente com a UF da chave (a sigla da UF é um dos rótulos, como em "nfce.sefaz.pe.gov.br"); a lista é a rota
 * preferida e a regra vale quando o domínio não está nela (`officialQueryUrl`). O RJ só aceita o domínio confirmado. Para somar
 * um estado à lista: conferir no portal da Sefaz (ou em nota real) e acrescentar aqui e no teste (conferência com notas reais
 * é P-025).
 */
export const SEFAZ_QR_HOSTS: Readonly<Partial<Record<UfSigla, readonly string[]>>> = {
  // https://portal.fazenda.rj.gov.br/dfe (atualizada em 14/04/2026) e https://ndd.tech/fiscal-blog/sefaz-rj-alteracao-na-url-do-qrcode-da-nfce-impacta-nas-operacoes-fiscais-das-empresas/:
  // QR da NFC-e em https://consultadfe.fazenda.rj.gov.br/consultaNFCe/QRCode desde 19/12/2023; o endereço antigo, www4.fazenda.rj.gov.br,
  // valeu até 02/09/2024 e não é aceito aqui.
  RJ: ['consultadfe.fazenda.rj.gov.br'],
  // https://portal.fazenda.sp.gov.br/servicos/nfce/Paginas/WebServices.aspx (consulta do QR, ConsultaQRCode.aspx) e QR de produção
  // https://www.nfce.fazenda.sp.gov.br/qrcode?p=... em XML real (https://www.projetoacbr.com.br/forum/topic/40056-link-url-qr-code-nfce-400-sp/).
  SP: ['www.nfce.fazenda.sp.gov.br'],
  // Sefaz-MG trocou o endereço do QR em 2022, para o portal SPED, e desativou o antigo (nfce.fazenda.mg.gov.br) em 04/04/2022:
  // https://portalsped.fazenda.mg.gov.br/portalnfce/sistema/qrcode.xhtml (https://inventti.com.br/sefaz-mg-nota-fiscal-consumidor-eletronica-alteracao-da-url-de-consultas-via-qrcode/
  // e https://www.projetoacbr.com.br/forum/topic/66167-sefaz-mg-troca-da-url-de-consulta-a-nfc-e-via-qr-code/).
  MG: ['portalsped.fazenda.mg.gov.br'],
  // https://sefaz.es.gov.br/qr-code (Sefaz-ES): consulta por QR em www2.sefaz.es.gov.br/nfce/consulta; app.sefaz.es.gov.br é o endereço
  // de consulta por chave da página https://sefaz.es.gov.br/url-dos-web-services e já apareceu em QR de produção (fórum do ACBr).
  ES: ['www2.sefaz.es.gov.br', 'app.sefaz.es.gov.br'],
  // https://sped.fazenda.pr.gov.br/NFCe/Pagina/QR-Code (NFC-e 4.0): http://www.fazenda.pr.gov.br/nfce/qrcode
  // (https://www.projetoacbr.com.br/forum/topic/38060-nfc-e-40-paran%C3%A1-pr-exception-na-transmiss%C3%A3o/).
  PR: ['www.fazenda.pr.gov.br'],
  // https://www.sef.sc.gov.br/api-portal/Documento/ver/1398 (URL do QR Code e da consulta em SC): https://sat.sef.sc.gov.br/nfce/consulta
  // (QR de produção também no fórum do ACBr, https://www.projetoacbr.com.br/forum/topic/61960-nfce-sc-999-qr-code-inv%C3%A1lido/).
  SC: ['sat.sef.sc.gov.br'],
  // Fonte secundária (a Sefaz-RS publica o endereço só no portal nacional): base de conhecimento da Oobj sobre a rejeição 395,
  // https://oobj.com.br/bc/rejeicao-395-como-resolver/, que dá https://www.sefaz.rs.gov.br/NFCE/NFCE-COM.aspx como o esperado para o RS.
  RS: ['www.sefaz.rs.gov.br'],
  // Notas impressas de 2026 com o QR http://nfe.sefaz.ba.gov.br/servicos/nfce/qrcode.aspx?p=... (por exemplo
  // https://www.camara.leg.br/cota-parlamentar/documentos/publ/3200/2026/8057417.pdf) e https://www.sefaz.ba.gov.br/docs/inspetoria-eletronica/icms/nfce_configuracao_programa_emissor.pdf.
  BA: ['nfe.sefaz.ba.gov.br'],
  // Informe Técnico 2025.003, obrigatório desde 31/08/2025: https://goias.gov.br/economia/alteracao-na-url-de-consulta-nfc-e/ e
  // https://inventti.com.br/informe-tecnico-2025-003-alteracao-da-url-do-qr-code-para-consulta-da-nfc-e-em-goias/ (https://nfeweb.sefaz.go.gov.br/nfeweb/sites/nfce/danfeNFCe).
  GO: ['nfeweb.sefaz.go.gov.br'],
  // Notas impressas com o QR em dfe.ms.gov.br/nfce/qrcode (documentos de transparência do Senado, por exemplo
  // https://www6g.senado.leg.br/transparencia/sen/download/ceaps/documento/180081) e página de web services da Sefaz-MS (https://www.nfce.ms.gov.br/urls-webservices/).
  MS: ['www.dfe.ms.gov.br', 'dfe.ms.gov.br'],
  // Nota do DF de setembro de 2025 com o QR http://www.fazenda.df.gov.br/nfce/qrcode?p=... (https://www.camara.leg.br/cota-parlamentar/documentos/publ/3200/2025/8002838.pdf).
  DF: ['www.fazenda.df.gov.br'],
  // QR de produção em nfce.sefaz.ce.gov.br (várias mensagens do fórum do ACBr, por exemplo https://www.projetoacbr.com.br/forum/profile/8630-atilacamurca/content/)
  // e consulta em http://nfce.sefaz.ce.gov.br/pages/consultaNota.jsf (https://infosimples.com/consultas/sefaz-ce-nfce/).
  CE: ['nfce.sefaz.ce.gov.br'],
  // Comunicado da Sefaz-PB de 2024: desde 01/04/2024 o QR tem um único endereço, http://www.sefaz.pb.gov.br/nfce, e o antigo (receita.pb.gov.br)
  // deixou de existir: https://www.sefaz.pb.gov.br/announcements/8996-sefaz-tem-novo-endereco-do-qr-code-da-nfc-e,
  // https://inventti.com.br/?p=20336 e https://www.totvs.com/blog/fiscal-clientes/sefaz-pb-extincao-url-qr-code-nfc-e-antiga/.
  PB: ['www.sefaz.pb.gov.br'],
  // Orientação da Sefaz-PI: QR versão 2.0 em http://www.sefaz.pi.gov.br/nfce/qrcode (https://netcpa.com.br/colunas/icmspi-contribuintes-devem-alterar-endereco-de-consulta-eletronico-nas-nfc-e/1971).
  PI: ['www.sefaz.pi.gov.br'],
  // A Sefaz-RN trocou o domínio SET por SEFAZ e o antigo (nfce.set.rn.gov.br) deixou de existir (aviso de 18/05/2026 reproduzido em
  // https://www.projetoacbr.com.br/forum/topic/92374-aten%C3%A7%C3%A3o-devs-sefaz-rn-link-do-qr-code-da-nfc-e-mudou-de-set-para-sefaz/):
  // QR em https://nfce.sefaz.rn.gov.br/consultarNFCe.aspx?p=... (exemplo real no fórum) e consulta em nfce.sefaz.rn.gov.br/portalDFE/NFCe/ConsultaNFCe.aspx (https://infosimples.com/consultas/sefaz-rn-nfce-resumida/).
  RN: ['nfce.sefaz.rn.gov.br'],
  // Perguntas frequentes da Sefin-RO, https://www.sefin.ro.gov.br/portalsefin/downloads/PERGUNTAS-FREQUENTES-NFCE-FINAL.pdf: portal da NFC-e em http://www.nfce.sefin.ro.gov.br
  // (consulta por chave ou QR); instrução normativa do QR em https://www.sefin.ro.gov.br/portalsefin/anexos/576.4566558137594IN15_022___QRcode.pdf.
  RO: ['www.nfce.sefin.ro.gov.br'],
  // Versão 2.0 do QR em http://www.sefaz.to.gov.br/nfce/qrcode (fórum do ACBr, https://www.projetoacbr.com.br/forum/tags/tocantins/); a versão 1.0, em apps.sefaz.to.gov.br, não é aceita.
  TO: ['www.sefaz.to.gov.br'],
  // Consulta da NFC-e em https://nfce.sefaz.al.gov.br/consultaNFCe.htm (https://infosimples.com/consultas/sefaz-al-nfce/) e QR em nfce.sefaz.al.gov.br/QRCode/consultarNFCe.jsp
  // (fórum do ACBr, https://www.projetoacbr.com.br/forum/topic/56494-url-nfc-e-al/). Fonte secundária.
  AL: ['nfce.sefaz.al.gov.br'],
  // Portal do desenvolvedor da Sefaz-AM (https://portalnfce.sefaz.am.gov.br/desenvolvedor/documentacao-tecnica/) e fórum do ACBr
  // (https://www.projetoacbr.com.br/forum/topic/40618-nfc-e-40-amazonas/): QR de produção em sistemas.sefaz.am.gov.br/nfceweb/consultarNFCe.jsp.
  AM: ['sistemas.sefaz.am.gov.br'],
};

/** Um nome de domínio de verdade: rótulos de letras, números e hífen (sem hífen nas pontas), separados por ponto, sem rótulo vazio. */
function validHost(host: string): boolean {
  return host.length <= 253 && host.split('.').every((label) => /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(label));
}

/**
 * Rótulos que identificam o órgão fiscal da UF (Sefaz, Fazenda, Sefin e os portais de nota). O rótulo logo antes da sigla da UF
 * precisa ser um destes: assim "nfce.sefaz.pe.gov.br" e "www.fazenda.df.gov.br" passam, e prefeituras ("www.recife.pe.gov.br",
 * "fazenda.recife.pe.gov.br"), secretarias de outras áreas e o portal geral do estado ("pe.gov.br") não.
 */
export const SEFAZ_HOST_LABELS: readonly string[] = [
  'sefaz',
  'sefaznet',
  'sefa',
  'sef',
  'set',
  'sefin',
  'fazenda',
  'receita',
  'nfce',
  'nfe',
  'nfeweb',
  'dfe',
  'portalsped',
  'portalnfce',
];

/**
 * O domínio é de governo e de órgão fiscal da UF da chave: termina em "<sigla da UF>.gov.br" (a sigla é o rótulo LOGO ANTES de
 * "gov.br", então "sp.qualquer.rj.gov.br" não vale para SP nem para RJ) e o rótulo logo antes da sigla é um de
 * `SEFAZ_HOST_LABELS`, como em "fazenda.sp.gov.br", "sefaz.go.gov.br" ou "nfce.sefaz.pe.gov.br". Regra de Enzo (spec9 §5) para
 * os estados fora da lista de `SEFAZ_QR_HOSTS`, que fica como a rota preferida; vale também quando um estado muda de endereço,
 * até a lista ser atualizada.
 */
function govHostOfUf(host: string, uf: UfSigla): boolean {
  if (!host.endsWith('.gov.br') || !validHost(host)) return false;
  const labels = host.split('.');
  return labels.length >= 4 && labels[labels.length - 3] === uf.toLowerCase() && SEFAZ_HOST_LABELS.includes(labels[labels.length - 4]!);
}

/**
 * Endereço para "Ver a nota no site da Sefaz": o endereço do QR lido, só quando o domínio é oficial da UF da chave. Dois
 * caminhos: (1) o domínio está na lista `SEFAZ_QR_HOSTS` da UF; (2) para os outros estados, um domínio de órgão fiscal ".gov.br" coerente
 * com a UF da chave ("<Sefaz, Fazenda...>.<sigla da UF>.gov.br", ver `SEFAZ_HOST_LABELS`; prefeituras não valem). O RJ só aceita o domínio confirmado (o endereço antigo
 * deixou de valer de propósito). Devolve `esquema://domínio/caminho?consulta` (sem usuário, porta nem trecho "#"; domínio em
 * minúsculas) ou null quando o domínio não serve, o endereço tem usuário, porta, espaço ou contra-barra, o esquema não é http
 * nem https, ou não há consulta. Sem esquema, usa https. Só chama o endereço quem toca no botão; nada é guardado.
 */
export function officialQueryUrl(uf: UfSigla, qrUrl: string | null | undefined): string | null {
  if (typeof qrUrl !== 'string') return null;
  const m = /^(?:(https?):\/\/)?([A-Za-z0-9.-]+)(\/[^\s?#\\]*)?(\?[^\s#\\]*)?(?:#\S*)?$/i.exec(qrUrl.trim());
  if (!m) return null;
  const host = m[2]!.toLowerCase();
  const listed = SEFAZ_QR_HOSTS[uf]?.includes(host) ?? false;
  if (!listed && (uf === 'RJ' || !govHostOfUf(host, uf))) return null;
  const query = m[4] ?? '';
  if (query.length < 2) return null;
  return `${(m[1] ?? 'https').toLowerCase()}://${host}${m[3] ?? ''}${query}`;
}

// ---------------------------------------------------------------------------
// Rascunho do registro
// ---------------------------------------------------------------------------

/** O que se sabe da nota, venha do QR, da chave ou do DANFE em PDF. Nada aqui é CPF nem dado do destinatário. */
export interface ReceiptFacts {
  key: AccessKeyInfo;
  issuedOn?: IsoDate | null;
  totalCents?: Cents | null;
  issuerName?: string | null;
  environment?: 'producao' | 'homologacao' | null;
  /** Endereço lido do QR, só para calcular `officialUrl`. */
  qrUrl?: string | null;
}

export function factsFromQr(qr: NfceQr, qrUrl?: string | null): ReceiptFacts {
  return { key: qr.key, issuedOn: qr.issuedOn, totalCents: qr.totalCents, environment: qr.environment, qrUrl: qrUrl ?? null };
}

export function factsFromKey(key: AccessKeyInfo): ReceiptFacts {
  return { key };
}

export interface ReceiptDraft {
  /**
   * Resumo SHA-256 da chave de acesso (64 hexadecimais minúsculos), para `receiptKey` do registro ou da compra no cartão. Nunca
   * a chave: a de pessoa física carrega o CPF do emitente.
   */
  receiptKey: string;
  uf: UfSigla;
  model: ReceiptModel;
  /** Descrição sugerida (editável): "Compra (CNPJ 12.345.678/0001-90)" ou "Compra em Loja Exemplo". Até 80 caracteres. */
  description: string;
  /** Valor total em centavos quando a nota informa; senão null (a pessoa digita). */
  amountCents: Cents | null;
  /** Data da compra quando se sabe, ou o dia de hoje quando a chave é do mês atual; senão null. */
  occurredOn: IsoDate | null;
  /** true quando `occurredOn` é null: a tela pede "Escolha o dia da compra", dentro de `month`. */
  needsDay: boolean;
  /** Mês da emissão (da chave). */
  month: IsoMonth;
  issuerCnpj: string | null;
  issuerName: string | null;
  /** "Nota fiscal do RJ, emitida em outubro de 2026" (ou "emitida em 12/10/2026" quando o dia é conhecido). */
  summary: string;
  /** Endereço oficial da Sefaz, quando o QR veio de um domínio oficial da UF (lista ou ".gov.br" coerente com a UF). Nunca em nota de teste. */
  officialUrl: string | null;
  /** Texto quando a nota é de ambiente de teste (sem valor fiscal). */
  testNote: string | null;
  /** Texto quando o mês da chave ainda não chegou (relógio do aparelho ou chave errada). */
  futureNote: string | null;
}

const SMALL_WORDS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'em', 'na', 'no']);
const KEEP_UPPER = new Set(['ME', 'EPP', 'MEI', 'SA', 'S/A', 'S.A.', 'S.A', 'CIA']);

/** "LOJA EXEMPLO LTDA" → "Loja Exemplo Ltda". Nome que já tem minúsculas fica como está. Tira qualquer CPF que apareça no nome (MEI). */
export function friendlyIssuerName(name: string): string {
  const noCpf = name.replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, ' ');
  const cleaned = noCpf.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim();
  if (cleaned === '' || cleaned !== cleaned.toUpperCase()) return cleaned;
  return cleaned
    .split(' ')
    .map((word, i) => {
      if (KEEP_UPPER.has(word)) return word;
      if (/\d/.test(word)) return word;
      const lower = word.toLowerCase();
      if (i > 0 && SMALL_WORDS.has(lower)) return lower;
      return lower.replace(/(^|[^a-zà-ÿ])([a-zà-ÿ])/g, (_m, pre: string, ch: string) => pre + ch.toUpperCase());
    })
    .join(' ');
}

/** Corta em `max` caracteres (como a pessoa vê), sem deixar meia palavra no fim. */
function fit(text: string, max: number): string {
  const chars = [...text];
  if (chars.length <= max) return text;
  const cut = chars.slice(0, max).join('');
  const space = cut.lastIndexOf(' ');
  return (space > max / 2 ? cut.slice(0, space) : cut).trim();
}

/**
 * Preenche o que se sabe para "Anotar gasto" (nada é gravado sem "Salvar"):
 * - valor: o total da nota quando vem (QR em contingência, DANFE);
 * - data: a da nota quando vem; senão, o dia de hoje se a chave é do mês atual; senão `needsDay` ("Escolha o dia da compra");
 * - descrição: "Compra (CNPJ ...)" ou, com o nome do emitente (DANFE), "Compra em <nome>".
 */
export function receiptDraft(facts: ReceiptFacts, today: IsoDate): ReceiptDraft {
  const { key } = facts;
  const month = key.yearMonth;
  const todayMonth = monthOf(today);
  const known = facts.issuedOn && facts.issuedOn.slice(0, 7) === month && isValidIsoDate(facts.issuedOn) && facts.issuedOn <= today ? facts.issuedOn : null;
  const occurredOn = known ?? (month === todayMonth ? today : null);
  const name = facts.issuerName ? friendlyIssuerName(facts.issuerName) : '';
  const description = name !== '' ? fit(`Compra em ${name}`, DESCRIPTION_MAX) : key.cnpjFormatted ? `Compra (CNPJ ${key.cnpjFormatted})` : 'Compra';
  const when = known ? formatDateBR(known) : formatMonthYearBR(month);
  return {
    receiptKey: key.digest,
    uf: key.uf,
    model: key.model,
    description,
    amountCents: facts.totalCents && facts.totalCents > 0 && facts.totalCents <= MAX_RECORD_CENTS ? facts.totalCents : null,
    occurredOn,
    needsDay: occurredOn === null,
    month,
    issuerCnpj: key.cnpjFormatted,
    issuerName: name !== '' ? name : null,
    summary: NOTA_TEXT.summary(key.uf, when),
    // Nota de homologação (teste) não existe na página de produção da Sefaz: sem o botão.
    officialUrl: facts.environment === 'homologacao' ? null : officialQueryUrl(key.uf, facts.qrUrl),
    testNote: facts.environment === 'homologacao' ? NOTA_TEXT.testNote : null,
    futureNote: month > todayMonth ? NOTA_TEXT.futureMonth : null,
  };
}

/** Quantos caracteres a descrição sugerida pode ter no máximo (limite do app). */
export const RECEIPT_DESCRIPTION_MAX = DESCRIPTION_MAX;

// ---------------------------------------------------------------------------
// Nota de exemplo (demonstração e e2e)
// ---------------------------------------------------------------------------

/** Domínio reservado (RFC 2606, ".invalid" nunca existe) do QR de exemplo: a nota fictícia nunca aponta para a Sefaz de verdade. */
export const EXAMPLE_RECEIPT_HOST = 'nota-de-exemplo.invalid';

/**
 * Endereço de QR de uma nota de exemplo FICTÍCIA e identificada, para a demonstração e o e2e (sem câmera): NFC-e do RJ do mês
 * dado, CNPJ de exemplo 11.222.333/0001-81, série 999 e número 1, em AMBIENTE DE TESTE (homologação, tpAmb=2) e num domínio que
 * não existe (`EXAMPLE_RECEIPT_HOST`). Por isso o rascunho mostra "Esta é uma nota de teste, sem valor fiscal." e nunca oferece
 * "Ver a nota no site da Sefaz" (`officialUrl` null): a nota inventada não é aberta na Sefaz de verdade como se fosse de produção.
 * Só é usada quando a pessoa toca em "Usar nota de exemplo"; conta nova nunca recebe dado de exemplo. Passa por `readReceiptCode`
 * como qualquer QR e, salva, aparece como nota já anotada se for lida de novo.
 */
export function exampleReceiptQr(month: IsoMonth): string {
  const body = `33${month.slice(2, 4)}${month.slice(5, 7)}1122233300018165999000000001100000000`;
  return `https://${EXAMPLE_RECEIPT_HOST}/consultaNFCe/QRCode?p=${body}${accessKeyCheckDigit(body)}|2|2|1|${'0'.repeat(40)}`;
}

// ---------------------------------------------------------------------------
// Textos
// ---------------------------------------------------------------------------

export const NOTA_ERROR_TEXT: Record<ReceiptErrorCode, string> = {
  vazio: 'Cole o link do QR da nota ou a chave de acesso, com 44 caracteres.',
  codigo_nao_reconhecido: 'Não reconhecemos este código como de uma nota fiscal. Escaneie o QR da nota ou o código de barras da chave, ou cole o link ou a chave.',
  chave_invalida: 'A chave de acesso tem 44 caracteres. Confira se não faltou ou sobrou algum.',
  digito_invalido: 'A chave não confere. Confira os números ou escaneie de novo.',
  uf_invalida: 'Esta chave não parece ser de uma nota fiscal. Confira os números ou escaneie de novo.',
  data_invalida: 'Esta chave não parece ser de uma nota fiscal. Confira os números ou escaneie de novo.',
  cnpj_invalido: 'Esta chave não parece ser de uma nota fiscal. Confira os números ou escaneie de novo.',
  modelo_nao_suportado: 'Esta chave é de outro tipo de documento. Por enquanto lemos NF-e e NFC-e.',
};

/** Mensagem do erro de leitura (código desconhecido cai no texto genérico). */
export function noteErrorText(code: string): string {
  const texts: Record<string, string> = NOTA_ERROR_TEXT;
  return code in texts ? texts[code]! : NOTA_ERROR_TEXT.codigo_nao_reconhecido;
}

export const NOTA_TEXT = {
  scanButton: 'Escanear nota fiscal',
  scanTitle: 'Escanear nota fiscal',
  scanHint: 'Aponte a câmera para o QR da nota ou para o código de barras da chave de acesso.',
  cameraPermission: 'O Clarevo usa a câmera só para ler o código da nota. Nada é gravado sem você tocar em Salvar.',
  cameraAllow: 'Permitir câmera',
  cameraDenied: 'Sem acesso à câmera. Você pode colar o link ou a chave da nota.',
  pasteLabel: 'Colar o link ou a chave da nota',
  pasteHint: 'Cole o link do QR da nota ou os 44 caracteres da chave de acesso.',
  pasteAction: 'Usar',
  pdfButton: 'Ler o PDF da nota',
  pdfHint: 'Escolha o PDF da nota fiscal (o DANFE que a loja enviou). A leitura é feita aqui no aparelho e o arquivo não sai dele.',
  pdfReading: 'Lendo o PDF',
  viewOnSefaz: 'Ver a nota no site da Sefaz',
  openRecord: 'Abrir registro',
  /** Folha do primeiro toque em "Escanear nota fiscal", antes de pedir a câmera. */
  sheet: { camera: 'Usar a câmera', pdf: 'Escolher o PDF da nota', paste: 'Colar o link ou a chave' },
  /** Anúncio para leitor de tela (iOS e região viva) quando a nota é lida. */
  readAnnounce: 'Nota lida',
  /** Dica depois de uns 10 segundos sem ler. */
  torchHint: 'Não achou o código? Use a lanterna ou cole a chave.',
  /** Para NF-e (modelo 55): compra em carnê ou crediário. */
  installmentsHint: 'Comprou no carnê ou crediário? Anotar como parcelamento',
  /** Nota de exemplo fictícia, só na demonstração e no e2e. */
  example: { button: 'Usar nota de exemplo', note: 'Nota de exemplo fictícia, só para conhecer o recurso.' },
  chooseDay: 'Escolha o dia da compra',
  filled: 'Preenchemos o que a nota informa. Confira e toque em Salvar.',
  privacy: 'Guardamos só um resumo da chave de acesso da nota, para avisar se ela for lida de novo. Não guardamos CPF, a chave nem o link.',
  testNote: 'Esta é uma nota de teste, sem valor fiscal.',
  futureMonth: 'Esta chave é de um mês que ainda não chegou. Confira os números.',
  summary: (uf: string, when: string): string => `Nota fiscal do ${uf}, emitida em ${when}`,
  /** "Esta nota já foi anotada em 12/10/2026: Mercado, R$ 87,40." */
  alreadyNoted: (date: IsoDate, description: string, cents: Cents): string => `Esta nota já foi anotada em ${formatDateBR(date)}: ${description}, ${formatBRL(cents)}.`,
  /** Compra no cartão: "Esta nota já foi anotada em 12/10/2026 no cartão Nubank: Mercado, R$ 87,40." */
  alreadyNotedCard: (date: IsoDate, description: string, cents: Cents, cardName: string): string =>
    `Esta nota já foi anotada em ${formatDateBR(date)} no cartão ${cardName}: ${description}, ${formatBRL(cents)}.`,
  pdf: {
    noText: 'Não encontramos texto neste PDF. Ele pode ser uma foto da nota. Tente escanear o código de barras da chave ou colar a chave.',
    noKey: 'Não encontramos a chave de acesso neste PDF. Confira se é o PDF da nota fiscal (o DANFE).',
    tooBig: 'Este PDF é grande demais para ler aqui. Tente escanear o código de barras da chave ou colar a chave.',
    failed: 'Não foi possível ler este PDF. Tente escanear o código de barras da chave ou colar a chave.',
    notPdf: 'Este arquivo não é um PDF.',
  },
} as const;
