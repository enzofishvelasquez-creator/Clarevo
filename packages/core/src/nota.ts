import type { IsoDate, IsoMonth } from './dates';
import { formatDateBR, formatMonthYearBR, isValidIsoDate, monthOf } from './dates';
import type { Cents } from './money';
import { MAX_RECORD_CENTS, formatBRL } from './money';
import { DESCRIPTION_MAX } from './validation';

/**
 * Leitura de notas fiscais (Ciclo E, D-038, fase 1): QR da NFC-e, código de barras e chave de acesso da NF-e.
 *
 * Tudo roda no aparelho, sem servidor. Regras de privacidade (valem para nota.ts e danfe.ts):
 * - só a chave de acesso (44 caracteres, sem dados pessoais) é guardada pelo app, e só quando a pessoa toca em Salvar;
 * - o CPF ou CNPJ do destinatário que vem em alguns QR (parâmetro cDest, campo idDest) nunca é lido para fora destas funções;
 * - o CPF de emitente pessoa física (chave com "000" + CPF) também nunca sai: o resultado diz só que o emitente é pessoa física;
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

export interface AccessKeyInfo {
  /** A chave inteira (44 caracteres, maiúsculas). É o que o registro guarda em `receiptKey`. */
  key: string;
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
 * Ordem das conferências: forma, dígito verificador, UF, mês e ano, CNPJ, modelo. Mesma regra de clarevo_receipt_key_valid no
 * banco para chaves só com números.
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
 * que mais se aproximou ('chave_nao_encontrada' quando nada parece chave).
 */
export function findAccessKey(text: string, after?: RegExp): KeySearch {
  const tokens: { text: string; start: number }[] = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) tokens.push({ text: m[0], start: m.index });
  const found: { info: AccessKeyInfo; index: number }[] = [];
  let bestError: ReceiptErrorCode | null = null;
  for (let i = 0; i < tokens.length; i++) {
    if (!/^[0-9]/.test(tokens[i]!.text)) continue;
    let joined = '';
    for (let j = i; j < tokens.length && j < i + 44; j++) {
      const t = tokens[j]!.text;
      if (!/^[0-9A-Za-z]+$/.test(t)) break;
      joined += t;
      if (joined.length > 44) break;
      if (joined.length < 44) continue;
      const upper = joined.toUpperCase();
      if (KEY_SHAPE.test(upper)) {
        const parsed = parseAccessKey(upper);
        if (parsed.ok) found.push({ info: parsed.info, index: tokens[i]!.start });
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
 * Domínios oficiais de consulta pública da NFC-e por QR Code, por UF, conferidos por busca em 09/10/2026. Só o domínio vale
 * (o caminho e a consulta são os do QR lido). Cada fonte é a página da própria Sefaz, salvo onde dito. Estados que não aparecem
 * (AC, AP, MA, SE) não tiveram o domínio do QR confirmado em fonte oficial: para eles o botão não aparece, o resto funciona.
 * Para somar um estado: conferir no portal da Sefaz (ou em nfce.encat.org/desenvolvedor/qrcode) e acrescentar aqui e no teste.
 */
export const SEFAZ_QR_HOSTS: Readonly<Partial<Record<UfSigla, readonly string[]>>> = {
  // https://portal.fazenda.rj.gov.br/dfe (atualizada em 14/04/2026): QR da NFC-e em https://consultadfe.fazenda.rj.gov.br/consultaNFCe/QRCode
  // desde 19/12/2023; o endereço antigo, www4.fazenda.rj.gov.br, valeu até 02/09/2024 e não é aceito aqui.
  RJ: ['consultadfe.fazenda.rj.gov.br'],
  // https://portal.fazenda.sp.gov.br/servicos/nfce/Paginas/WebServices.aspx: https://www.nfce.fazenda.sp.gov.br/NFCeConsultaPublica/Paginas/ConsultaQRCode.aspx
  // (também https://www.nfce.fazenda.sp.gov.br/qrcode).
  SP: ['www.nfce.fazenda.sp.gov.br'],
  // https://portalsped.fazenda.mg.gov.br/spedmg/nfce/web-services/ : https://portalsped.fazenda.mg.gov.br/portalnfce/sistema/qrcode.xhtml;
  // o endereço anterior, nfce.fazenda.mg.gov.br, também atende (Sefaz-MG, página do QR).
  MG: ['portalsped.fazenda.mg.gov.br', 'nfce.fazenda.mg.gov.br'],
  // https://app.sefaz.es.gov.br/ConsultaNFCe/QRCode.aspx (página de web services) e www2.sefaz.es.gov.br/nfce/consulta (https://sefaz.es.gov.br/qr-code).
  ES: ['app.sefaz.es.gov.br', 'www2.sefaz.es.gov.br'],
  // https://sped.fazenda.pr.gov.br/NFCe/Pagina/QR-Code: http://www.fazenda.pr.gov.br/nfce/qrcode
  PR: ['www.fazenda.pr.gov.br'],
  // https://www.sef.sc.gov.br/api-portal/Documento/ver/1398 (URL do QR Code e da consulta em SC): https://sat.sef.sc.gov.br/nfce/consulta
  SC: ['sat.sef.sc.gov.br'],
  // Fonte secundária (a Sefaz-RS publica o endereço só no portal nacional da NFC-e): https://www.sefaz.rs.gov.br/NFCE/NFCE-COM.aspx, como
  // configurado no ACBr e na base da Oobj. O domínio é o da própria Sefaz-RS.
  RS: ['www.sefaz.rs.gov.br'],
  // https://www.sefaz.ba.gov.br/docs/inspetoria-eletronica/icms/nfce_configuracao_programa_emissor.pdf: nfe.sefaz.ba.gov.br/servicos/nfce/qrcode.aspx
  BA: ['nfe.sefaz.ba.gov.br'],
  // Novo endereço do QR (Informe Técnico 2025.003, em vigor desde 16/06/2025, o antigo só até 30/08/2025): https://nfeweb.sefaz.go.gov.br/nfeweb/sites/nfce/danfeNFCe.
  // Fonte do domínio: Inventti, Tecnospeed e fórum ACBr; a mudança em si está em https://goias.gov.br/economia/alteracao-na-url-de-consulta-nfc-e/.
  GO: ['nfeweb.sefaz.go.gov.br'],
  // https://www.dfe.ms.gov.br/nfce/qrcode (página de web services da Sefaz-MS, https://www.nfce.ms.gov.br/urls-webservices/).
  MS: ['www.dfe.ms.gov.br'],
  // Cupom de NFC-e do DF autorizado em 2025 traz http://www.fazenda.df.gov.br/nfce/qrcode (a nota só é autorizada com o endereço previsto pela Sefaz, regra de rejeição 395).
  DF: ['www.fazenda.df.gov.br'],
  // http://www.sefaz.mt.gov.br/nfce/consultanfce (portal da NFC-e da Sefaz-MT, https://www.sefaz.mt.gov.br/portal/nfce/).
  MT: ['www.sefaz.mt.gov.br'],
  // http://nfce.sefaz.ce.gov.br/pages/ShowNFCe.html (página de web services da Sefaz-CE, http://nfce.sefaz.ce.gov.br/pages/informacoes/web_services.jsf).
  CE: ['nfce.sefaz.ce.gov.br'],
  // https://appnfc.sefa.pa.gov.br/portal/view/consultas/nfce/nfceForm.seam (página do desenvolvedor, http://nfce.sefa.pa.gov.br/index.php/desenvolvedor).
  PA: ['appnfc.sefa.pa.gov.br'],
  // http://www.sefaz.pb.gov.br/nfce (endereço único do QR, https://www.sefaz.pb.gov.br/announcements/14409-...).
  PB: ['www.sefaz.pb.gov.br'],
  // http://nfce.sefaz.pe.gov.br/nfce/consulta (aviso da Sefaz-PE, https://www.sefaz.pe.gov.br/Servicos/Nota-Fiscal-de-Consumidor-Eletronica/).
  PE: ['nfce.sefaz.pe.gov.br'],
  // http://www.sefaz.pi.gov.br/nfce/qrcode (comunicado da Sefaz-PI, https://portal-admin.sefaz.pi.gov.br/noticias/contribuintes-devem-alterar-endereco-de-consulta-eletronico-nas-nfc-e/).
  PI: ['www.sefaz.pi.gov.br'],
  // Consulta pública da NFC-e da Sefaz-RN, https://nfce.set.rn.gov.br/portalDFE/NFCe/ (a página http://www.set.rn.gov.br/nfce/consulta/ diz que o QR leva a ela).
  RN: ['nfce.set.rn.gov.br'],
  // https://www.nfce.sefin.ro.gov.br/docTecnica.jsp: http://www.nfce.sefin.ro.gov.br/consultanfce/consulta.jsp
  RO: ['www.nfce.sefin.ro.gov.br'],
  // https://portalapp.sefaz.rr.gov.br/nfce/servlet/qrcode (consulta por QR Code da Sefaz-RR).
  RR: ['portalapp.sefaz.rr.gov.br'],
  // https://www.to.gov.br/sefaz/documentacao/4zw4v3wp9rrc: http://www.sefaz.to.gov.br/nfce/qrcode (v2.0); a v1.0 usava http://apps.sefaz.to.gov.br/portal-nfce/qrcodeNFCe.
  TO: ['www.sefaz.to.gov.br', 'apps.sefaz.to.gov.br'],
  // https://www.sefaz.al.gov.br/nfce/nfce-documentacao: http://nfce.sefaz.al.gov.br/QRCode/consultarNFCe.jsp
  AL: ['nfce.sefaz.al.gov.br'],
  // https://portalnfce.sefaz.am.gov.br/desenvolvedor/documentacao-tecnica/: https://sistemas.sefaz.am.gov.br/nfceweb/consultarNFCe.jsp
  AM: ['sistemas.sefaz.am.gov.br'],
};

/**
 * Endereço para "Ver a nota no site da Sefaz": o endereço do QR lido, só quando o domínio é um dos oficiais da UF da chave.
 * Devolve `esquema://domínio/caminho?consulta` (sem usuário, porta nem trecho "#"; domínio em minúsculas) ou null quando o domínio
 * não é conhecido, o endereço tem usuário, porta, espaço ou contra-barra, o esquema não é http nem https, ou não há consulta.
 * Sem esquema, usa https. Só chama o endereço quem toca no botão; nada é guardado.
 */
export function officialQueryUrl(uf: UfSigla, qrUrl: string | null | undefined): string | null {
  if (typeof qrUrl !== 'string') return null;
  const hosts = SEFAZ_QR_HOSTS[uf];
  if (!hosts) return null;
  const m = /^(?:(https?):\/\/)?([A-Za-z0-9.-]+)(\/[^\s?#\\]*)?(\?[^\s#\\]*)?(?:#\S*)?$/i.exec(qrUrl.trim());
  if (!m) return null;
  const host = m[2]!.toLowerCase();
  if (!hosts.includes(host)) return null;
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
  /** Chave de acesso, para `receiptKey` do registro ou da compra no cartão. */
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
  /** Endereço oficial da Sefaz, quando o QR veio de um domínio conhecido da UF. */
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
    receiptKey: key.key,
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
    officialUrl: officialQueryUrl(key.uf, facts.qrUrl),
    testNote: facts.environment === 'homologacao' ? NOTA_TEXT.testNote : null,
    futureNote: month > todayMonth ? NOTA_TEXT.futureMonth : null,
  };
}

/** Quantos caracteres a descrição sugerida pode ter no máximo (limite do app). */
export const RECEIPT_DESCRIPTION_MAX = DESCRIPTION_MAX;

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
  chooseDay: 'Escolha o dia da compra',
  filled: 'Preenchemos o que a nota informa. Confira e toque em Salvar.',
  privacy: 'Guardamos só a chave de acesso da nota, que não tem dados pessoais. Não guardamos CPF nem o link.',
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
