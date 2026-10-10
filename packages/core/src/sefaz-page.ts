import type { IsoDate } from './dates';
import { isValidIsoDate } from './dates';
import type { Cents } from './money';
import { MAX_RECORD_CENTS } from './money';
import type { AccessKeyInfo, ReceiptDraft, ReceiptFacts } from './nota';
import { findAccessKey, friendlyIssuerName, officialQueryUrl } from './nota';

/**
 * Leitura da página pública da Sefaz (Ciclo E, D-038, decisão de Enzo de 09/10/2026: "Sim, ler a Sefaz-RJ já").
 *
 * Roda no próprio aparelho, sem servidor do Clarevo: o app busca o endereço oficial do QR, toca na leitura uma nota por vez e
 * descarta a página. Só o RJ tem leitura automática (domínio confirmado); os outros estados têm só o botão "Ver a nota no site
 * da Sefaz". Na web o navegador bloqueia a leitura (CORS): o app não tenta.
 *
 * O leitor é TOLERANTE: não depende de um leiaute só. Tira o HTML para texto e procura rótulos ("Valor a pagar", "Emissão",
 * "Qtd. total de itens"), com o nome do estabelecimento no topo (classe txtTopo, id u20) ou na linha acima do CNPJ. Os testes usam HTML
 * sintético no leiaute padrão das consultas de NFC-e; o aceite com cupons reais do RJ continua pendente (P-025).
 *
 * Privacidade: o resultado só tem nome do estabelecimento, total, data de emissão e quantidade de itens. O bloco do consumidor
 * (CPF, nome) nunca é lido, e a página inteira é descartada depois da leitura. Sem `URL`, lookbehind, grupos nomeados nem `\p{}`.
 */

export interface SefazPageReading {
  /** Nome do estabelecimento, no formato legível ("Mercado Exemplo Ltda"). */
  issuerName: string | null;
  /** "Valor a pagar" (ou "Valor total" quando é o único) em centavos, de R$ 0,01 até o limite do app. */
  totalCents: Cents | null;
  /** Data de emissão, sempre dentro do mês da chave. */
  issuedOn: IsoDate | null;
  /** Quantidade de itens da nota ("Qtd. total de itens"). */
  itemCount: number | null;
}

export type SefazPageErrorCode =
  | 'pagina_vazia'
  | 'pagina_nao_reconhecida'
  | 'nota_nao_encontrada'
  | 'nota_diferente';

export type SefazPageResult = { ok: true; reading: SefazPageReading } | { ok: false; code: SefazPageErrorCode };

/** Tamanho máximo do HTML lido (a consulta com muitos itens fica bem abaixo disso). */
export const SEFAZ_PAGE_MAX_CHARS = 1_500_000;

const ENTITIES: Record<string, string> = {
  nbsp: ' ',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  ordm: 'º',
  ordf: 'ª',
  deg: '°',
  copy: '©',
  ccedil: 'ç',
  Ccedil: 'Ç',
  atilde: 'ã',
  Atilde: 'Ã',
  otilde: 'õ',
  Otilde: 'Õ',
  aacute: 'á',
  Aacute: 'Á',
  eacute: 'é',
  Eacute: 'É',
  iacute: 'í',
  Iacute: 'Í',
  oacute: 'ó',
  Oacute: 'Ó',
  uacute: 'ú',
  Uacute: 'Ú',
  acirc: 'â',
  Acirc: 'Â',
  ecirc: 'ê',
  Ecirc: 'Ê',
  ocirc: 'ô',
  Ocirc: 'Ô',
  agrave: 'à',
  Agrave: 'À',
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-fA-F]{1,6}|#[0-9]{1,7}|[A-Za-z]{2,8});/g, (whole, body: string) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      if (!Number.isFinite(code) || code < 32 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return ' ';
      return String.fromCodePoint(code);
    }
    return ENTITIES[body] ?? whole;
  });
}

/** Tira o HTML para texto em linhas: blocos viram quebra de linha, o resto das marcas some, as entidades são decodificadas. */
function htmlToLines(html: string): string[] {
  const text = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|head)\b[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(div|p|tr|li|ul|ol|table|h[1-6]|label|section|header|footer|td|th)\s*>/gi, '\n')
    .replace(/<[^>]*>/g, ' ');
  return decodeEntities(text)
    .split(/\r?\n/)
    .map((line) => line.replace(/[\s ]+/g, ' ').trim())
    .filter((line) => line !== '');
}

/** "87,40" ou "1.250,90" em centavos; null se não for um valor de 0,01 até o limite do app. */
function centsOfBrazilian(text: string): Cents | null {
  const m = /^(\d{1,3}(?:\.\d{3})*|\d+),(\d{2})$/.exec(text.trim());
  if (!m) return null;
  const cents = Number(m[1]!.replace(/\./g, '')) * 100 + Number(m[2]);
  return Number.isSafeInteger(cents) && cents >= 1 && cents <= MAX_RECORD_CENTS ? cents : null;
}

/** O valor que vem depois do rótulo, com "R$", dois pontos e espaços (ou a linha seguinte) no meio. */
function valueAfter(text: string, label: RegExp): Cents | null {
  const re = new RegExp(label.source, label.flags.includes('g') ? label.flags : `${label.flags}g`);
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const tail = text.slice(m.index + m[0].length, m.index + m[0].length + 40);
    const v = /^[\sR$:.]*?(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})(?![\d,])/.exec(tail);
    if (v) {
      const cents = centsOfBrazilian(v[1]!);
      if (cents !== null) return cents;
    }
  }
  return null;
}

const CNPJ_TEXT = /\b([0-9A-Z]{2}\.[0-9A-Z]{3}\.[0-9A-Z]{3}\/[0-9A-Z]{4}-[0-9]{2})\b/;

function issuerFromHtml(html: string, lines: string[]): string | null {
  // 1) Cabeçalho do estabelecimento: classe txtTopo ou id u20 (leiaute padrão das consultas de NFC-e).
  const byMarker = /<(\w+)\b[^>]*\b(?:class\s*=\s*["'][^"']*\btxtTopo\b[^"']*["']|id\s*=\s*["']u20["'])[^>]*>([\s\S]*?)<\/\1\s*>/i.exec(html);
  const fromMarker = byMarker ? htmlToLines(byMarker[2]!)[0] : undefined;
  const generic = /documento auxiliar|danfe|nfc-?e|nota fiscal|consulta p[úu]blica|secretaria de|sefaz|via consumidor/i;
  const clean = (candidate: string | undefined): string | null => {
    if (!candidate) return null;
    const name = friendlyIssuerName(candidate.replace(/\bCNPJ\b.*$/i, '').replace(/[:|]\s*$/, '')).slice(0, 120).trim();
    if (name.length < 2 || !/[A-Za-zÀ-ÿ]/.test(name) || generic.test(name) || /^\d/.test(name)) return null;
    return name;
  };
  const marked = clean(fromMarker);
  if (marked) return marked;
  // 2) A linha de cima do CNPJ do estabelecimento (ou o trecho antes de "CNPJ" na mesma linha).
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (!/\bCNPJ\b/i.test(line) && !CNPJ_TEXT.test(line)) continue;
    const before = line.replace(/\bCNPJ\b[\s\S]*$/i, '').trim();
    const same = clean(before);
    if (same) return same;
    for (let j = i - 1; j >= Math.max(0, i - 3); j--) {
      const name = clean(lines[j]);
      if (name) return name;
    }
    return null;
  }
  return null;
}

function issuedOnFrom(text: string): IsoDate | null {
  const re = /emiss[ãa]o[^0-9]{0,24}?(\d{2})\/(\d{2})\/(\d{4})/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const iso = `${m[3]}-${m[2]}-${m[1]}`;
    if (isValidIsoDate(iso)) return iso;
  }
  return null;
}

/**
 * Lê o HTML da consulta pública da NFC-e. `key` é a chave da nota que foi escaneada: a página precisa ser dela. Se a página mostra
 * outra chave, outro CNPJ ou outro mês de emissão, devolve 'nota_diferente' (nada é aproveitado). Campos que a página não traz ficam
 * null; sem nenhum campo reconhecido, 'pagina_nao_reconhecida' (captcha, página de erro ou leiaute novo).
 */
export function parseSefazPage(html: string, key: AccessKeyInfo): SefazPageResult {
  if (typeof html !== 'string' || html.trim() === '') return { ok: false, code: 'pagina_vazia' };
  if (html.length > SEFAZ_PAGE_MAX_CHARS) return { ok: false, code: 'pagina_nao_reconhecida' };
  const lines = htmlToLines(html);
  const text = lines.join('\n');

  if (/nota\s+fiscal[^\n]{0,40}n[ãa]o\s+(?:foi\s+)?encontrada|n[ãa]o\s+foi\s+poss[ií]vel\s+(?:localizar|consultar)|chave\s+de\s+acesso\s+inv[áa]lida|nfc-?e\s+n[ãa]o\s+(?:foi\s+)?encontrada/i.test(text)) {
    return { ok: false, code: 'nota_nao_encontrada' };
  }

  // A página é desta nota? Chave mostrada, CNPJ do estabelecimento e mês da emissão precisam bater com o que foi escaneado.
  const shown = findAccessKey(text);
  if (shown.ok && shown.info.digest !== key.digest) return { ok: false, code: 'nota_diferente' };
  const cnpjShown = CNPJ_TEXT.exec(text.split(/\bconsumidor\b/i)[0]!);
  if (key.cnpj && cnpjShown && cnpjShown[1]!.replace(/[^0-9A-Z]/g, '') !== key.cnpj) return { ok: false, code: 'nota_diferente' };

  const issuedOn = issuedOnFrom(text);
  if (issuedOn !== null && issuedOn.slice(0, 7) !== key.yearMonth) return { ok: false, code: 'nota_diferente' };

  const totalCents =
    valueAfter(text, /valor\s+a\s+pagar/i) ?? valueAfter(text, /valor\s+total\s+(?:da\s+nota|da\s+compra)?/i) ?? valueAfter(text, /total\s+da\s+nota/i);
  const items = /qtd\.?\s*total\s+de\s+itens\s*:?\s*(\d{1,4})/i.exec(text);
  const itemRows = html.match(/<tr\b[^>]*\bid\s*=\s*["']Item\s*\+?\s*\d+["']/gi);
  const itemCount = items ? Number(items[1]) : itemRows ? itemRows.length : null;
  const issuerName = issuerFromHtml(html, lines);

  if (issuerName === null && totalCents === null && issuedOn === null) return { ok: false, code: 'pagina_nao_reconhecida' };
  return { ok: true, reading: { issuerName, totalCents, issuedOn, itemCount: itemCount !== null && itemCount >= 1 ? itemCount : null } };
}

/** Junta o que a página trouxe ao que o QR já dava (a página prevalece nos campos que ela traz). */
export function factsWithPage(facts: ReceiptFacts, reading: SefazPageReading): ReceiptFacts {
  return {
    ...facts,
    issuedOn: reading.issuedOn ?? facts.issuedOn ?? null,
    totalCents: reading.totalCents ?? facts.totalCents ?? null,
    issuerName: reading.issuerName ?? facts.issuerName ?? null,
  };
}

/** Domínios com leitura automática (confirmados). Os outros estados só têm "Ver a nota no site da Sefaz". */
export const SEFAZ_READ_HOSTS: Readonly<Record<string, readonly string[]>> = { RJ: ['consultadfe.fazenda.rj.gov.br'] };

function hostOfUrl(url: string): string | null {
  const m = /^https?:\/\/([A-Za-z0-9.-]+)(?::\d+)?(?:[/?#]|$)/i.exec(url.trim());
  return m ? m[1]!.toLowerCase() : null;
}

/** A nota pode ter a página lida no aparelho: NFC-e do RJ, em produção, com o endereço oficial do QR. */
export function canReadSefazPage(draft: Pick<ReceiptDraft, 'uf' | 'model' | 'officialUrl' | 'testNote'>): boolean {
  if (draft.model !== '65' || draft.testNote !== null || draft.officialUrl === null) return false;
  const hosts = SEFAZ_READ_HOSTS[draft.uf];
  const host = hostOfUrl(draft.officialUrl);
  return Boolean(hosts && host && hosts.includes(host));
}

export type SefazReadErrorCode = SefazPageErrorCode | 'tempo_esgotado' | 'sem_conexao' | 'resposta_invalida' | 'endereco_invalido';
export type SefazReadResult = { ok: true; reading: SefazPageReading } | { ok: false; code: SefazReadErrorCode };

/** O pedaço de `fetch` que a leitura usa (injetado: o app passa o `fetch` do aparelho; os testes, um falso). */
export type SefazFetch = (
  url: string,
  init: { method: 'GET'; headers: Record<string, string>; signal?: AbortSignal; credentials?: 'omit' },
) => Promise<{ ok: boolean; status: number; url?: string; text(): Promise<string> }>;

export const SEFAZ_READ_TIMEOUT_MS = 12_000;

/**
 * Busca e lê a página oficial. Confere o endereço outra vez (só o domínio oficial da UF da chave e só o de leitura automática),
 * não segue para outro domínio, tem tempo limite e nunca lança: qualquer falha vira um código, e a tela cai para o preenchimento
 * manual ("Não deu para ler a página da Sefaz. Confira o valor no cupom."). Nada da página é guardado.
 */
export async function readSefazPage(
  fetchImpl: SefazFetch,
  officialUrl: string,
  key: AccessKeyInfo,
  options: { timeoutMs?: number } = {},
): Promise<SefazReadResult> {
  const url = officialQueryUrl(key.uf, officialUrl);
  const host = url ? hostOfUrl(url) : null;
  const hosts = SEFAZ_READ_HOSTS[key.uf];
  if (!url || !host || !hosts || !hosts.includes(host)) return { ok: false, code: 'endereco_invalido' };

  const timeoutMs = options.timeoutMs ?? SEFAZ_READ_TIMEOUT_MS;
  const Abort = (globalThis as { AbortController?: new () => AbortController }).AbortController;
  const controller = Abort ? new Abort() : null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<'tempo'>((resolve) => {
    timer = setTimeout(() => {
      controller?.abort();
      resolve('tempo');
    }, timeoutMs);
  });
  const work = (async (): Promise<SefazReadResult> => {
    try {
      const res = await fetchImpl(url, { method: 'GET', headers: { Accept: 'text/html,application/xhtml+xml' }, signal: controller?.signal, credentials: 'omit' });
      if (!res.ok) return { ok: false, code: 'resposta_invalida' };
      // Redirecionamento para outro domínio: a página não é a da Sefaz do estado.
      if (typeof res.url === 'string' && res.url !== '' && hostOfUrl(res.url) !== host) return { ok: false, code: 'resposta_invalida' };
      const html = await res.text();
      return parseSefazPage(html, key);
    } catch {
      return { ok: false, code: 'sem_conexao' };
    }
  })();
  try {
    const first = await Promise.race([work, timeout]);
    return first === 'tempo' ? { ok: false, code: 'tempo_esgotado' } : first;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export const SEFAZ_TEXT = {
  reading: 'Lendo a página da Sefaz…',
  readingA11y: 'Lendo a página da Sefaz para trazer loja, valor e data',
  done: 'Loja, valor e data lidos da página da Sefaz. Confira antes de salvar.',
  failed: 'Não deu para ler a página da Sefaz. Confira o valor no cupom.',
  differentNote: 'A página da Sefaz é de outra nota. Confira o valor no cupom.',
  notFound: 'A Sefaz ainda não mostra esta nota. Confira o valor no cupom.',
  webOnlyLink: 'Neste navegador, a página da Sefaz não pode ser lida pelo Clarevo. Abra a nota no site da Sefaz e digite o total.',
} as const;

/** Mensagem para a falha da leitura da página (todas caem no preenchimento manual). */
export function sefazReadErrorText(code: SefazReadErrorCode): string {
  if (code === 'nota_diferente') return SEFAZ_TEXT.differentNote;
  if (code === 'nota_nao_encontrada') return SEFAZ_TEXT.notFound;
  return SEFAZ_TEXT.failed;
}
