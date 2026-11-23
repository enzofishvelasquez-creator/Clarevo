import { escaparHtml, lerMarcacao, resolverLink, textoPuro } from './html';

/**
 * Leitor de feeds (D-117): RSS 2.0, RSS 1.0 (RDF, o dos portais gov.br) e Atom (o do Banco Central e da Receita Federal), sem DOM e sem
 * pacote, para rodar no worker da Cloudflare. Monta uma árvore pequena do XML (seções CDATA, entidades, nomes com prefixo), com limites de
 * tamanho, e tira de cada notícia o título, o link, a data, a autoria, os assuntos, o resumo curto e o corpo, quando o feed traz.
 *
 * Nada aqui busca endereço nenhum: quem busca é o atendimento (`servidor.ts`), e só os feeds configurados (`fontes.ts`).
 */

/** Um feed maior que isto nem é lido (os feeds conferidos têm de 10 a 90 KB): o teto deixa folga e limita o trabalho de um feed estranho. */
export const MAX_BYTES_DO_FEED = 512 * 1024;
/** No máximo tantas notícias por feed (os conferidos têm de 10 a 15). */
export const MAX_ITENS_POR_FEED = 50;
const MAX_ELEMENTOS = 50_000;
const MAX_PROFUNDIDADE = 64;

interface ElXml {
  nome: string;
  atributos: Record<string, string>;
  filhos: (ElXml | { texto: string; cru: boolean })[];
}

const local = (nome: string) => nome.slice(nome.indexOf(':') + 1);

/** A árvore do XML. Fechamento sem abertura é ignorado; o que ficou aberto no fim fecha sozinho. */
export function lerXml(xml: string): ElXml | null {
  if (xml.length > MAX_BYTES_DO_FEED) return null;
  const raiz: ElXml = { nome: '#documento', atributos: {}, filhos: [] };
  const pilha: ElXml[] = [raiz];
  let elementos = 0;
  for (const t of lerMarcacao(xml.replace(/^\ufeff/, ''), { xml: true })) {
    const topo = pilha[pilha.length - 1]!;
    if (t.tipo === 'texto') topo.filhos.push({ texto: t.texto, cru: t.cru });
    else if (t.tipo === 'abre') {
      if (++elementos > MAX_ELEMENTOS) return null;
      const el: ElXml = { nome: t.nome, atributos: t.atributos, filhos: [] };
      topo.filhos.push(el);
      if (!t.sozinha && pilha.length < MAX_PROFUNDIDADE) pilha.push(el);
    } else {
      const k = pilha.map((e) => e.nome).lastIndexOf(t.nome);
      if (k > 0) pilha.length = k;
    }
  }
  return raiz;
}

const elementos = (el: ElXml): ElXml[] => el.filhos.filter((f): f is ElXml => 'nome' in f);
/** O primeiro filho com um destes nomes (com prefixo, como `dc:creator`, ou sem). */
const filho = (el: ElXml, ...nomes: string[]): ElXml | undefined => elementos(el).find((f) => nomes.includes(f.nome));
const filhos = (el: ElXml, ...nomes: string[]): ElXml[] => elementos(el).filter((f) => nomes.includes(f.nome));

/** Escreve de volta a marcação dos filhos (o `<content type="xhtml">` do Atom). */
function marcacao(el: ElXml): string {
  return el.filhos
    .map((f) => {
      if (!('nome' in f)) return escaparHtml(f.texto);
      const attrs = Object.entries(f.atributos)
        .map(([k, v]) => ` ${k}="${escaparHtml(v)}"`)
        .join('');
      return `<${f.nome}${attrs}>${marcacao(f)}</${f.nome}>`;
    })
    .join('');
}

/** O texto de um elemento: o texto e as seções CDATA dele; se ele tiver elementos dentro, a marcação deles. */
function textoDe(el: ElXml | undefined): string {
  if (!el) return '';
  if (el.filhos.some((f) => 'nome' in f)) return marcacao(el);
  return el.filhos.map((f) => ('texto' in f ? f.texto : '')).join('');
}

/** O conteúdo de um elemento do Atom (`title`, `summary`, `content`) como HTML, conforme o `type` (texto, html ou xhtml). */
function htmlDoAtom(el: ElXml | undefined): string {
  if (!el) return '';
  const tipo = (el.atributos.type ?? 'text').toLowerCase();
  if (tipo === 'html' || tipo === 'text/html') return textoDe(el);
  if (tipo === 'xhtml' || tipo === 'application/xhtml+xml') return marcacao(el);
  return escaparHtml(textoDe(el));
}

const MESES: Record<string, number> = {
  jan: 1, feb: 2, fev: 2, mar: 3, apr: 4, abr: 4, may: 5, mai: 5, jun: 6, jul: 7, aug: 8, ago: 8, sep: 9, set: 9, oct: 10, out: 10, nov: 11, dec: 12, dez: 12,
};
const FUSOS: Record<string, number> = { gmt: 0, ut: 0, utc: 0, z: 0, est: -300, edt: -240, cst: -360, cdt: -300, mst: -420, mdt: -360, pst: -480, pdt: -420, brt: -180, brst: -120 };

function instante(ano: number, mes: number, dia: number, h: number, m: number, s: number, minutosDoFuso: number): number | null {
  if (!(ano >= 1990 && ano <= 2200 && mes >= 1 && mes <= 12 && dia >= 1 && dia <= 31 && h >= 0 && h <= 23 && m >= 0 && m <= 59 && s >= 0 && s <= 60)) return null;
  const t = Date.UTC(ano, mes - 1, dia, h, m, Math.min(s, 59));
  if (new Date(t).getUTCDate() !== dia) return null; // 31 de novembro e afins
  return t - minutosDoFuso * 60_000;
}

const fusoNumerico = (sinal: string, hh: string, mm = '0') => (sinal === '-' ? -1 : 1) * (Number(hh) * 60 + Number(mm));

/**
 * A data de uma notícia, em milissegundos, ou `null`. Aceita RFC 822 (`Thu, 19 Nov 2026 16:39:00 -0300`, o do RSS 2.0, com meses em
 * inglês ou português), ISO 8601 (`2026-11-19T16:56:05-03:00`, o do Atom e do Dublin Core) e o formato da busca do gov.br
 * (`2026/11/19 11:25:40 GMT-3`). Sem fuso, vale o horário de Brasília.
 */
export function lerDataDoFeed(bruto: string | null | undefined): number | null {
  const s = (bruto ?? '').replace(/\s+/g, ' ').trim();
  if (s === '' || s.length > 60) return null;
  let m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:[.,]\d{1,9})?)?)?\s*(Z|[+-]\d{2}(?::?\d{2})?)?$/i.exec(s);
  if (m) {
    const z = m[7];
    let fuso = -180;
    if (z !== undefined) {
      const digitos = z.slice(1).replace(':', '');
      fuso = /^z$/i.test(z) ? 0 : fusoNumerico(z[0]!, digitos.slice(0, 2), digitos.slice(2, 4) || '0');
    }
    return instante(Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4] ?? 0), Number(m[5] ?? 0), Number(m[6] ?? 0), fuso);
  }
  m = /^(?:[A-Za-zÀ-ú]{3,9}\.?,?\s+)?(\d{1,2})\s+([A-Za-zÀ-ú]{3,9})\.?\s+(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([A-Za-z]{1,5}|[+-]\d{4})?$/.exec(s);
  if (m) {
    const mes = MESES[m[2]!.slice(0, 3).toLowerCase()];
    if (!mes) return null;
    const z = m[7];
    let fuso = -180;
    if (z !== undefined) {
      if (/^[+-]\d{4}$/.test(z)) fuso = fusoNumerico(z[0]!, z.slice(1, 3), z.slice(3, 5));
      else if (z.toLowerCase() in FUSOS) fuso = FUSOS[z.toLowerCase()]!;
      else return null;
    }
    return instante(Number(m[3]), mes, Number(m[1]), Number(m[4]), Number(m[5]), Number(m[6] ?? 0), fuso);
  }
  m = /^(\d{4})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2})(?::(\d{2}))?(?: ?(?:GMT|UTC) ?([+-])(\d{1,2})(?::?(\d{2}))?)?$/i.exec(s);
  if (m) {
    const fuso = m[7] ? fusoNumerico(m[7], m[8]!, m[9] ?? '0') : -180;
    return instante(Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6] ?? 0), fuso);
  }
  return null;
}

/** Uma notícia como o feed traz, antes do filtro de temas e da regra de licença. */
export interface ItemDoFeed {
  titulo: string;
  /** O link da matéria, absoluto (`http:` ou `https:`), ou `null`. */
  link: string | null;
  /** A data, em milissegundos, ou `null`. */
  data: number | null;
  autor: string | null;
  categorias: string[];
  /** O resumo curto que o feed traz à parte (`summary`, ou `description` quando o corpo vem em `content:encoded`), em HTML. */
  resumoHtml: string | null;
  /** O corpo da matéria, quando o feed traz (`content:encoded`, `content` do Atom ou um `description` com a matéria inteira), em HTML. */
  corpoHtml: string | null;
}

export type FormatoDoFeed = 'rss2' | 'rss1' | 'atom';

/**
 * Um `description` que é a matéria inteira (a Agência Brasil manda o texto todo nele): tem vários parágrafos ou passa de 600 caracteres
 * de texto. Nesse caso ele é o corpo, e a notícia não tem resumo à parte (o resumo de um portal privado nunca sai do corpo).
 */
export function pareceCorpoInteiro(html: string): boolean {
  const blocos = (html.match(/<(p|div|h[1-6]|li|blockquote|table)\b/gi) ?? []).length;
  return blocos >= 3 || textoPuro(html).length > 600;
}

const limpar = (s: string) => s.replace(/[\u200b\u200c\u200d\u2060\ufeff]/g, '').replace(/\s+/g, ' ').trim();
const opcional = (s: string): string | null => (s.trim() === '' ? null : s);

/**
 * Lê um feed. Devolve o formato e as notícias (no máximo `MAX_ITENS_POR_FEED`), ou `null` se não for um feed reconhecível.
 * `descricaoEhCorpo`: a fonte põe a matéria no `description` (a Agência Brasil), que então é sempre o corpo, mesmo curto, e nunca o resumo.
 */
export function lerFeed(xml: string, { base, descricaoEhCorpo = false }: { base: string; descricaoEhCorpo?: boolean }): { formato: FormatoDoFeed; itens: ItemDoFeed[] } | null {
  const doc = lerXml(xml);
  if (!doc) return null;
  const raiz = elementos(doc)[0];
  if (!raiz) return null;
  const nomeDaRaiz = local(raiz.nome);
  if (nomeDaRaiz === 'feed') return { formato: 'atom', itens: lerAtom(raiz, base) };
  if (nomeDaRaiz === 'rss') {
    const canal = filho(raiz, 'channel') ?? raiz;
    return { formato: 'rss2', itens: lerItensRss(filhos(canal, 'item'), base, descricaoEhCorpo) };
  }
  if (nomeDaRaiz === 'rdf') return { formato: 'rss1', itens: lerItensRss(filhos(raiz, 'item'), base, descricaoEhCorpo) };
  return null;
}

function lerItensRss(itens: ElXml[], base: string, descricaoEhCorpo: boolean): ItemDoFeed[] {
  return itens.slice(0, MAX_ITENS_POR_FEED).map((it) => {
    const linkTexto = limpar(textoDe(filho(it, 'link')));
    const guid = filho(it, 'guid');
    const guidTexto = limpar(textoDe(guid));
    const guidLink = guid && (guid.atributos.ispermalink ?? 'true') !== 'false' && /^https?:\/\//i.test(guidTexto) ? guidTexto : '';
    const link = resolverLink(linkTexto || guidLink || it.atributos['rdf:about'] || '', base);
    const descricao = textoDe(filho(it, 'description'));
    const conteudo = textoDe(filho(it, 'content:encoded'));
    let corpo: string | null = opcional(conteudo);
    let resumo: string | null = opcional(descricao);
    if (descricaoEhCorpo) {
      // A fonte põe a matéria no description: ele nunca é o resumo, nem quando o corpo vem também em content:encoded.
      corpo ??= resumo;
      resumo = null;
    } else if (!corpo && resumo && pareceCorpoInteiro(resumo)) {
      corpo = resumo;
      resumo = null;
    }
    const autor = limpar(textoPuro(textoDe(filho(it, 'dc:creator', 'author'))));
    return {
      titulo: limpar(textoPuro(textoDe(filho(it, 'title')))),
      link,
      data: lerDataDoFeed(textoDe(filho(it, 'pubdate', 'dc:date'))),
      autor: autor === '' ? null : autor,
      categorias: filhos(it, 'category', 'dc:subject').map((c) => limpar(textoPuro(textoDe(c)))).filter((c) => c !== ''),
      resumoHtml: resumo,
      corpoHtml: corpo,
    };
  });
}

function lerAtom(feed: ElXml, baseDoFeed: string): ItemDoFeed[] {
  const baseGeral = resolverLink(feed.atributos['xml:base'] ?? '', baseDoFeed) ?? baseDoFeed;
  return filhos(feed, 'entry')
    .slice(0, MAX_ITENS_POR_FEED)
    .map((e) => {
      const base = resolverLink(e.atributos['xml:base'] ?? '', baseGeral) ?? baseGeral;
      const links = filhos(e, 'link');
      const alternativo = links.find((l) => (l.atributos.rel ?? 'alternate') === 'alternate') ?? links[0];
      const link = resolverLink(alternativo?.atributos.href ?? '', base);
      const autor = filho(e, 'author');
      const nomeDoAutor = autor ? limpar(textoPuro(textoDe(filho(autor, 'name')) || textoDe(autor))) : '';
      let corpo = opcional(htmlDoAtom(filho(e, 'content')));
      let resumo = opcional(htmlDoAtom(filho(e, 'summary')));
      if (!corpo && resumo && pareceCorpoInteiro(resumo)) {
        corpo = resumo;
        resumo = null;
      }
      return {
        titulo: limpar(textoPuro(htmlDoAtom(filho(e, 'title')))),
        link,
        data: lerDataDoFeed(textoDe(filho(e, 'published')) || textoDe(filho(e, 'updated')) || textoDe(filho(e, 'dc:date'))),
        autor: nomeDoAutor === '' ? null : nomeDoAutor,
        categorias: filhos(e, 'category')
          .map((c) => limpar(c.atributos.label ?? c.atributos.term ?? textoDe(c)))
          .filter((c) => c !== ''),
        resumoHtml: resumo,
        corpoHtml: corpo,
      };
    });
}

