import type { IsoDate } from './dates';
import { isValidIsoDate } from './dates';
import type { Cents } from './money';
import { MAX_RECORD_CENTS } from './money';
import type { AccessKeyInfo, ReceiptDraft, ReceiptFacts } from './nota';
import { findAccessKey, friendlyIssuerName, officialQueryUrl } from './nota';
import type { PaymentForm } from './nota-pagamento';
import { paymentFormsFromText } from './nota-pagamento';

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
 * Privacidade: o resultado só tem nome do estabelecimento, total, data de emissão, quantidade de itens e a forma de pagamento (D-042,
 * só a forma, sem valor pago nem troco; `nota-pagamento.ts`). O bloco do consumidor
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
  /** Forma de pagamento da tabela "Forma de pagamento" / "Valor pago" (D-042), sem valores nem troco; vazio quando a página não traz. */
  payments: PaymentForm[];
}

export type SefazPageErrorCode =
  | 'pagina_vazia'
  | 'pagina_nao_reconhecida'
  | 'nota_nao_encontrada'
  | 'nota_diferente';

export type SefazPageResult = { ok: true; reading: SefazPageReading } | { ok: false; code: SefazPageErrorCode };

/** Tamanho máximo do HTML lido (a consulta com 100 itens fica em torno de 100 mil caracteres). */
export const SEFAZ_PAGE_MAX_CHARS = 400_000;

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

/** Onde procurar o fechamento de script, estilo e cabeçalho; sem fechamento nesse trecho, a leitura trunca ali (marcação hostil). */
const CLOSE_WINDOW = 64_000;
/** Quanto do início de uma marca é examinado atrás de classe ou id do cabeçalho do estabelecimento. */
const TAG_INSPECT_CHARS = 500;
/** Onde procurar o fechamento do elemento do cabeçalho do estabelecimento. */
const MARKER_WINDOW = 2_000;
const SKIPPED_TAGS = new Set(['script', 'style', 'noscript', 'head']);
const BLOCK_CLOSING_TAGS = new Set(['div', 'p', 'tr', 'li', 'ul', 'ol', 'table', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'label', 'section', 'header', 'footer', 'td', 'th']);

/** A marca (texto entre "<" e ">") é o cabeçalho do estabelecimento: classe txtTopo ou id u20 (leiaute padrão das consultas de NFC-e). */
function isIssuerMarker(tag: string): boolean {
  const head = tag.slice(0, TAG_INSPECT_CHARS).toLowerCase();
  if (/\bid\s*=\s*["']u20["']/.test(head)) return true;
  return head.indexOf('txttopo') >= 0 && /\bclass\s*=\s*["'][^"']*\btxttopo\b/.test(head);
}

/**
 * Passa pelo HTML uma única vez, com `indexOf`, em tempo linear: blocos viram quebra de linha, o resto das marcas some, script,
 * estilo, comentário e cabeçalho são pulados. Marcação sem fechamento (comentário, script, marca sem ">") trunca a leitura ali
 * em vez de procurar o fechamento no resto da página. Também devolve o texto do elemento do estabelecimento (txtTopo ou u20).
 */
function scanHtml(html: string, wantMarker: boolean): { text: string; marker: string | null } {
  const parts: string[] = [];
  let marker: string | null = null;
  let i = 0;
  const n = html.length;
  while (i < n) {
    const lt = html.indexOf('<', i);
    if (lt < 0) {
      parts.push(html.slice(i));
      break;
    }
    if (lt > i) parts.push(html.slice(i, lt));
    if (html.startsWith('<!--', lt)) {
      const close = html.indexOf('-->', lt + 4);
      if (close < 0) break;
      parts.push(' ');
      i = close + 3;
      continue;
    }
    const gt = html.indexOf('>', lt + 1);
    if (gt < 0) break;
    const tag = html.slice(lt + 1, Math.min(gt, lt + 1 + TAG_INSPECT_CHARS));
    const named = /^(\/?)([A-Za-z][A-Za-z0-9]*)/.exec(tag);
    const closing = named ? named[1] === '/' : false;
    const name = named ? named[2]!.toLowerCase() : '';
    i = gt + 1;
    if (!closing && SKIPPED_TAGS.has(name) && html.charCodeAt(gt - 1) !== 47) {
      const window = html.slice(i, i + CLOSE_WINDOW);
      const close = new RegExp(`</${name}\\s*>`, 'i').exec(window);
      if (!close) break;
      parts.push(' ');
      i += close.index + close[0].length;
      continue;
    }
    if (wantMarker && marker === null && !closing && name !== '' && isIssuerMarker(tag)) {
      const window = html.slice(i, i + MARKER_WINDOW);
      const close = new RegExp(`</${name}\\s*>`, 'i').exec(window);
      if (close) marker = scanHtml(window.slice(0, close.index), false).text;
    }
    if (name === 'br' && !closing) parts.push('\n');
    else if (closing && BLOCK_CLOSING_TAGS.has(name)) parts.push('\n');
    else parts.push(' ');
  }
  return { text: parts.join(''), marker };
}

function linesOf(text: string): string[] {
  return decodeEntities(text)
    .split(/\r?\n/)
    .map((line) => line.replace(/[\s ]+/g, ' ').trim())
    .filter((line) => line !== '');
}

/** Tira o HTML para texto em linhas e acha o cabeçalho do estabelecimento (primeira linha do elemento txtTopo ou u20). */
function readHtml(html: string): { lines: string[]; marker: string | null } {
  const { text, marker } = scanHtml(html, true);
  return { lines: linesOf(text), marker: marker === null ? null : (linesOf(marker)[0] ?? null) };
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

/**
 * Onde começa o bloco do consumidor: a primeira menção a "consumidor" ou "destinatário", em qualquer ponto da linha. O nome do
 * documento ("Nota Fiscal de Consumidor Eletrônica") não conta, senão cortaria o cabeçalho antes do nome da loja.
 */
const CONSUMER_MARK = /\bconsumidor\b(?!\s+eletr[ôo]nica)|destinat[áa]rio/i;

/**
 * As linhas do estabelecimento: tudo antes do bloco do consumidor, cortando a linha em que ele começa no ponto da menção. A linha
 * do cabeçalho txtTopo (`marker`) é o nome da loja e nunca marca o começo do bloco do consumidor.
 */
function issuerLines(lines: string[], marker: string | null): string[] {
  const header = marker === null ? -1 : lines.indexOf(marker);
  for (let i = 0; i < lines.length; i++) {
    if (i === header) continue;
    const m = CONSUMER_MARK.exec(lines[i]!);
    if (!m) continue;
    const head = lines[i]!.slice(0, m.index).trim();
    return head === '' ? lines.slice(0, i) : [...lines.slice(0, i), head];
  }
  return lines;
}

function issuerFromPage(marker: string | null, lines: string[]): string | null {
  // 1) Cabeçalho do estabelecimento: classe txtTopo ou id u20 (leiaute padrão das consultas de NFC-e).
  const generic = /documento auxiliar|danfe|nfc-?e|nota fiscal|consulta p[úu]blica|secretaria de|sefaz|via consumidor|consumidor/i;
  // `generic` descarta títulos do documento; o nome que vem do cabeçalho txtTopo é o da loja e não passa por ele (uma loja pode se
  // chamar "Mercado do Consumidor Ltda").
  const clean = (candidate: string | null | undefined, applyGeneric = true): string | null => {
    if (!candidate) return null;
    const name = friendlyIssuerName(candidate.replace(/\bCNPJ\b.*$/i, '').replace(/[:|]\s*$/, '')).slice(0, 120).trim();
    if (name.length < 2 || !/[A-Za-zÀ-ÿ]/.test(name) || (applyGeneric && generic.test(name)) || /^\d/.test(name)) return null;
    return name;
  };
  const marked = clean(marker, false);
  if (marked) return marked;
  // 2) A linha de cima do CNPJ do estabelecimento (ou o trecho antes de "CNPJ" na mesma linha). Só antes do bloco do consumidor:
  //    o nome e o CNPJ de quem comprou nunca viram o nome da loja.
  const above = issuerLines(lines, marker);
  for (let i = 0; i < above.length; i++) {
    const line = above[i]!;
    if (!/\bCNPJ\b/i.test(line) && !CNPJ_TEXT.test(line)) continue;
    const before = line.replace(/\bCNPJ\b[\s\S]*$/i, '').trim();
    const same = clean(before);
    if (same) return same;
    for (let j = i - 1; j >= Math.max(0, i - 3); j--) {
      const name = clean(above[j]);
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
  const { lines, marker } = readHtml(html);
  const text = lines.join('\n');

  if (/nota\s+fiscal[^\n]{0,40}n[ãa]o\s+(?:foi\s+)?encontrada|n[ãa]o\s+foi\s+poss[ií]vel\s+(?:localizar|consultar)|chave\s+de\s+acesso\s+inv[áa]lida|nfc-?e\s+n[ãa]o\s+(?:foi\s+)?encontrada/i.test(text)) {
    return { ok: false, code: 'nota_nao_encontrada' };
  }

  // A página é desta nota? Precisa mostrar a chave lida ou o CNPJ do emitente (e nenhum outro), e o mês da emissão tem de bater.
  // Sem nenhum dos dois, não há como saber de quem é a página: 'pagina_nao_reconhecida', nada é aproveitado.
  const shown = findAccessKey(text);
  if (shown.ok && shown.info.digest !== key.digest) return { ok: false, code: 'nota_diferente' };
  const cnpjShown = key.cnpj ? CNPJ_TEXT.exec(issuerLines(lines, marker).join('\n')) : null;
  if (key.cnpj && cnpjShown && cnpjShown[1]!.replace(/[^0-9A-Z]/g, '') !== key.cnpj) return { ok: false, code: 'nota_diferente' };
  const sameKey = shown.ok && shown.info.digest === key.digest;
  const sameCnpj = Boolean(key.cnpj && cnpjShown && cnpjShown[1]!.replace(/[^0-9A-Z]/g, '') === key.cnpj);
  if (!sameKey && !sameCnpj) return { ok: false, code: 'pagina_nao_reconhecida' };

  const issuedOn = issuedOnFrom(text);
  if (issuedOn !== null && issuedOn.slice(0, 7) !== key.yearMonth) return { ok: false, code: 'nota_diferente' };

  const totalCents =
    valueAfter(text, /valor\s+a\s+pagar/i) ?? valueAfter(text, /valor\s+total\s+(?:da\s+nota|da\s+compra)?/i) ?? valueAfter(text, /total\s+da\s+nota/i);
  const items = /qtd\.?\s*total\s+de\s+itens\s*:?\s*(\d{1,4})/i.exec(text);
  const itemRows = html.match(/<tr\b[^>]*\bid\s*=\s*["']Item\s*\+?\s*\d+["']/gi);
  const itemCount = items ? Number(items[1]) : itemRows ? itemRows.length : null;
  const issuerName = issuerFromPage(marker, lines);
  // Só o trecho antes do bloco do consumidor: a forma de pagamento vem logo depois dos totais, e o resto da página não é lido para isso.
  const payments = paymentFormsFromText(issuerLines(lines, marker).join('\n'));

  if (issuerName === null && totalCents === null && issuedOn === null) return { ok: false, code: 'pagina_nao_reconhecida' };
  return { ok: true, reading: { issuerName, totalCents, issuedOn, itemCount: itemCount !== null && itemCount >= 1 ? itemCount : null, payments } };
}

/** Junta o que a página trouxe ao que o QR já dava (a página prevalece nos campos que ela traz). */
export function factsWithPage(facts: ReceiptFacts, reading: SefazPageReading): ReceiptFacts {
  return {
    ...facts,
    issuedOn: reading.issuedOn ?? facts.issuedOn ?? null,
    totalCents: reading.totalCents ?? facts.totalCents ?? null,
    issuerName: reading.issuerName ?? facts.issuerName ?? null,
    payments: reading.payments.length > 0 ? reading.payments : (facts.payments ?? null),
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

/**
 * O pedaço de `fetch` que a leitura usa (injetado: o app passa o `fetch` de `expo/fetch` no celular, que respeita `redirect: 'manual'`;
 * os testes, um falso). Com `redirect: 'manual'` a resposta de redirecionamento chega com `status` 3xx e o cabeçalho `Location`, e
 * quem chama decide se segue. Um `fetch` que ignore `redirect` e siga sozinho (como o global do React Native pode fazer) continua
 * seguro, porque as garantias não dependem dele: `url` é o endereço final e a leitura confere o domínio dele, e a página precisa ser
 * da mesma nota (chave de acesso) para ser aceita.
 */
export type SefazFetch = (
  url: string,
  init: { method: 'GET'; headers: Record<string, string>; signal?: AbortSignal; credentials?: 'omit'; redirect?: 'manual' | 'follow' },
) => Promise<{ ok: boolean; status: number; url?: string; headers?: { get(name: string): string | null }; text(): Promise<string> }>;

export const SEFAZ_READ_TIMEOUT_MS = 12_000;
/** Quantos redirecionamentos para o mesmo domínio a leitura segue. */
export const SEFAZ_MAX_REDIRECTS = 2;

/** O destino de um redirecionamento (cabeçalho Location), só se ficar no domínio oficial e em https; senão null. */
function redirectTarget(location: string, from: string, host: string): string | null {
  const loc = location.trim();
  if (loc === '' || /[\s\\]/.test(loc)) return null;
  let target: string;
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(loc)) target = loc;
  else if (loc.startsWith('//')) target = `https:${loc}`;
  else if (loc.startsWith('/')) target = `https://${host}${loc}`;
  else {
    const base = from.split('#')[0]!.split('?')[0]!;
    target = `${base.slice(0, base.lastIndexOf('/') + 1)}${loc}`;
  }
  const m = /^https:\/\/([A-Za-z0-9.-]+)(?::443)?(?:[/?#]|$)/i.exec(target);
  return m && m[1]!.toLowerCase() === host ? target.split('#')[0]! : null;
}

/**
 * Busca e lê a página oficial. Confere o endereço outra vez (só o domínio oficial da UF da chave e só o de leitura automática),
 * segue no máximo 2 redirecionamentos e só para o mesmo domínio (nunca outro), exige que a resposta diga de qual endereço veio,
 * tem tempo limite e nunca lança: qualquer falha vira um código, e a tela cai para o preenchimento manual ("Não deu para ler a
 * página da Sefaz. Confira o valor no cupom."). Nada da página é guardado.
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
      let current: string = url;
      for (let hop = 0; hop <= SEFAZ_MAX_REDIRECTS; hop++) {
        const res = await fetchImpl(current, {
          method: 'GET',
          headers: { Accept: 'text/html,application/xhtml+xml' },
          signal: controller?.signal,
          credentials: 'omit',
          redirect: 'manual',
        });
        if (res.status >= 300 && res.status < 400) {
          const location = res.headers?.get('location');
          const next = typeof location === 'string' ? redirectTarget(location, current, host) : null;
          if (next === null) return { ok: false, code: 'resposta_invalida' };
          current = next;
          continue;
        }
        if (!res.ok) return { ok: false, code: 'resposta_invalida' };
        // Sem o endereço de onde a resposta veio, não há como saber se é a página da Sefaz do estado: recusa.
        if (typeof res.url !== 'string' || res.url === '' || hostOfUrl(res.url) !== host) return { ok: false, code: 'resposta_invalida' };
        const html = await res.text();
        return parseSefazPage(html, key);
      }
      return { ok: false, code: 'resposta_invalida' };
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
