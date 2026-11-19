/**
 * HTML das notícias (D-117): entidades, um leitor pequeno de marcação (sem DOM, roda no worker da Cloudflare), o texto puro de um trecho
 * e o filtro de HTML do texto inteiro.
 *
 * O filtro só deixa sair `p`, `br`, `a` (só `http:` e `https:`, com `rel="noopener noreferrer"`), `strong`, `em`, `ul`, `ol`, `li`,
 * `blockquote`, `h2` e `h3`. Tudo o mais some: imagens (a política de segurança do site só aceita imagem do próprio site, e as fotos das
 * agências podem ter outra licença), vídeos, `iframe`, `script`, `style`, formulários e todo atributo que não seja o `href` de um link.
 * Marcação que só enfeita (como `span`, `font` e `div`) sai, e o texto dela fica; `b` e `i` viram `strong` e `em`; `h1` vira `h2`, e `h4`
 * a `h6` viram `h3`. O texto em si não muda: o filtro tira marcação, não palavras (a licença do gov.br proíbe versão editada).
 */

/**
 * As entidades com nome que os feeds usam: as cinco do XML, as letras acentuadas e a pontuação comum, como pontos de código (os
 * caracteres não ficam escritos no código: o teste das fontes do app confere todo caractere das cadeias do núcleo).
 */
const CODIGOS: Record<string, number> = {
  amp: 0x26, lt: 0x3c, gt: 0x3e, quot: 0x22, apos: 0x27, nbsp: 0xa0, ensp: 0x2002, emsp: 0x2003, thinsp: 0x2009, zwnj: 0x200c, zwj: 0x200d,
  ndash: 0x2013, mdash: 0x2014, hellip: 0x2026, lsquo: 0x2018, rsquo: 0x2019, sbquo: 0x201a, ldquo: 0x201c, rdquo: 0x201d, bdquo: 0x201e,
  laquo: 0xab, raquo: 0xbb, bull: 0x2022, middot: 0xb7, ordm: 0xba, ordf: 0xaa, deg: 0xb0, copy: 0xa9, reg: 0xae, trade: 0x2122, euro: 0x20ac,
  cent: 0xa2, pound: 0xa3, yen: 0xa5, sect: 0xa7, para: 0xb6, shy: 0xad, times: 0xd7, divide: 0xf7, plusmn: 0xb1, frac12: 0xbd, frac14: 0xbc,
  frac34: 0xbe, sup1: 0xb9, sup2: 0xb2, sup3: 0xb3, iexcl: 0xa1, iquest: 0xbf, micro: 0xb5, szlig: 0xdf, AElig: 0xc6, aelig: 0xe6, Oslash: 0xd8,
  oslash: 0xf8, percnt: 0x25, dollar: 0x24, num: 0x23, excl: 0x21, quest: 0x3f, comma: 0x2c, period: 0x2e, colon: 0x3a, semi: 0x3b, lpar: 0x28,
  rpar: 0x29, sol: 0x2f, minus: 0x2212,
};
/** As marcas de acento (combinantes) e as letras que as entidades usam com cada uma (`aacute`, `atilde`, `ccedil`). */
const ACENTOS: Record<string, [number, string]> = { acute: [0x301, 'AEIOUYaeiouy'], grave: [0x300, 'AEIOUaeiou'], circ: [0x302, 'AEIOUaeiou'], tilde: [0x303, 'ANOano'], uml: [0x308, 'AEIOUaeiouy'], cedil: [0x327, 'Cc'], ring: [0x30a, 'Aa'] };

const ENTIDADES: Record<string, string> = (() => {
  const t: Record<string, string> = {};
  for (const [nome, codigo] of Object.entries(CODIGOS)) t[nome] = String.fromCodePoint(codigo);
  for (const [nome, [marca, letras]] of Object.entries(ACENTOS)) for (const l of letras) t[`${l}${nome}`] = `${l}${String.fromCodePoint(marca)}`.normalize('NFC');
  return t;
})();

/** O caractere de substituição, para entidade numérica impossível. */
const SUBSTITUICAO = String.fromCodePoint(0xfffd);
const pontoDeCodigo = (n: number): string => (Number.isInteger(n) && n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : SUBSTITUICAO);

/** Troca as entidades (`&amp;`, `&#233;`, `&#xE9;`, `&eacute;`) pelos caracteres. Entidade desconhecida fica como está. */
export function decodificarEntidades(texto: string): string {
  if (!texto.includes('&')) return texto;
  return texto.replace(/&(#\d{1,7}|#[xX][0-9a-fA-F]{1,6}|[A-Za-z][A-Za-z0-9]{1,31});/g, (inteira, corpo: string) => {
    if (corpo[0] === '#') return pontoDeCodigo(corpo[1] === 'x' || corpo[1] === 'X' ? parseInt(corpo.slice(2), 16) : parseInt(corpo.slice(1), 10));
    return ENTIDADES[corpo] ?? inteira;
  });
}

/** Texto para dentro de HTML (texto e atributo entre aspas duplas). */
export const escaparHtml = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Caracteres invisíveis que os feeds trazem soltos (espaço de largura zero, marca de ordem de bytes). */
const INVISIVEIS = /[\u200b\u200c\u200d\u2060\ufeff]/g;

// ------------------------------------------------------------------------------------------------------------------------------
// O leitor de marcação

export type Token =
  | { tipo: 'texto'; texto: string; cru: boolean }
  | { tipo: 'abre'; nome: string; atributos: Record<string, string>; sozinha: boolean }
  | { tipo: 'fecha'; nome: string };

/** Elementos cujo conteúdo é texto cru no HTML (não é marcação): o leitor pula até o fechamento deles. */
const TEXTO_CRU = new Set(['script', 'style', 'textarea', 'title', 'xmp', 'iframe', 'noembed', 'noframes', 'noscript', 'plaintext']);
const ehLetra = (c: string | undefined): boolean => c !== undefined && /[A-Za-z]/.test(c);
const ehNome = (c: string | undefined): boolean => c !== undefined && /[A-Za-z0-9:_.-]/.test(c);
const ehEspaco = (c: string | undefined): boolean => c !== undefined && /[ \n\t\r\f]/.test(c);

/**
 * Lê a marcação em pedaços (texto, abre, fecha), sem expressão regular que possa demorar (cada caractere é visto poucas vezes). `xml`:
 * as seções CDATA viram texto cru (sem trocar entidades) e não há elementos de texto cru. Comentários, `<!DOCTYPE>` e `<?xml ?>` somem
 * (nenhuma entidade declarada no documento é expandida). Uma marca sem `>` até o fim é descartada. Os nomes saem em minúsculas.
 */
export function lerMarcacao(fonte: string, { xml = false }: { xml?: boolean } = {}): Token[] {
  const tokens: Token[] = [];
  const n = fonte.length;
  let i = 0;
  const texto = (t: string, cru = false) => {
    if (t !== '') tokens.push({ tipo: 'texto', texto: cru ? t : decodificarEntidades(t), cru });
  };
  while (i < n) {
    const lt = fonte.indexOf('<', i);
    if (lt === -1) {
      texto(fonte.slice(i));
      break;
    }
    if (lt > i) texto(fonte.slice(i, lt));
    if (fonte.startsWith('<!--', lt)) {
      const fim = fonte.indexOf('-->', lt + 4);
      i = fim === -1 ? n : fim + 3;
      continue;
    }
    if (fonte.startsWith('<![CDATA[', lt)) {
      const fim = fonte.indexOf(']]>', lt + 9);
      const conteudo = fonte.slice(lt + 9, fim === -1 ? n : fim);
      // No XML, o conteúdo de uma seção CDATA é texto como está; no HTML não existe CDATA, e o conteúdo é só texto.
      texto(conteudo, xml);
      i = fim === -1 ? n : fim + 3;
      continue;
    }
    const proximo = fonte[lt + 1];
    if (proximo === '!' || proximo === '?') {
      const fim = fonte.indexOf('>', lt + 2);
      i = fim === -1 ? n : fim + 1;
      continue;
    }
    if (proximo === '/' && ehLetra(fonte[lt + 2])) {
      let j = lt + 2;
      while (j < n && ehNome(fonte[j])) j++;
      const nome = fonte.slice(lt + 2, j).toLowerCase();
      const fim = fonte.indexOf('>', j);
      if (fim === -1) break;
      tokens.push({ tipo: 'fecha', nome });
      i = fim + 1;
      continue;
    }
    if (!ehLetra(proximo)) {
      // Um "<" solto é texto.
      texto('<');
      i = lt + 1;
      continue;
    }
    let j = lt + 1;
    while (j < n && ehNome(fonte[j])) j++;
    const nome = fonte.slice(lt + 1, j).toLowerCase();
    const atributos: Record<string, string> = {};
    let sozinha = false;
    let fechou = false;
    while (j < n) {
      while (j < n && ehEspaco(fonte[j])) j++;
      const c = fonte[j];
      if (c === '>') {
        fechou = true;
        j++;
        break;
      }
      if (c === '/') {
        if (fonte[j + 1] === '>') {
          sozinha = true;
          fechou = true;
          j += 2;
          break;
        }
        j++;
        continue;
      }
      const ini = j;
      while (j < n && !ehEspaco(fonte[j]) && fonte[j] !== '=' && fonte[j] !== '>' && !(fonte[j] === '/' && fonte[j + 1] === '>')) j++;
      const atributo = fonte.slice(ini, j).toLowerCase();
      while (j < n && ehEspaco(fonte[j])) j++;
      let valor = '';
      if (fonte[j] === '=') {
        j++;
        while (j < n && ehEspaco(fonte[j])) j++;
        const aspa = fonte[j];
        if (aspa === '"' || aspa === "'") {
          const fim = fonte.indexOf(aspa, j + 1);
          if (fim === -1) {
            j = n;
            break;
          }
          valor = fonte.slice(j + 1, fim);
          j = fim + 1;
        } else {
          const ini2 = j;
          while (j < n && !ehEspaco(fonte[j]) && fonte[j] !== '>') j++;
          valor = fonte.slice(ini2, j);
        }
      }
      if (atributo !== '' && !(atributo in atributos)) atributos[atributo] = decodificarEntidades(valor);
    }
    if (!fechou) break;
    tokens.push({ tipo: 'abre', nome, atributos, sozinha });
    i = j;
    if (!xml && !sozinha && TEXTO_CRU.has(nome)) {
      // O conteúdo vai até o fechamento do mesmo elemento, sem ser lido como marcação.
      // Procura sem diferenciar maiúsculas (o nome só tem letras, números e : _ . -).
      const procura = new RegExp(`</${nome.replace(/[.]/g, '\\.')}`, 'gi');
      procura.lastIndex = i;
      const achou = procura.exec(fonte);
      const fim = achou ? achou.index : -1;
      texto(fonte.slice(i, fim === -1 ? n : fim), true);
      if (fim === -1) {
        i = n;
        break;
      }
      const maior = fonte.indexOf('>', fim);
      tokens.push({ tipo: 'fecha', nome });
      i = maior === -1 ? n : maior + 1;
    }
  }
  return tokens;
}

// ------------------------------------------------------------------------------------------------------------------------------
// Links

/**
 * O endereço absoluto de um link (`href` relativo resolvido contra `base`), só com `http:` ou `https:` e sem usuário nem senha. Qualquer
 * outro (`javascript:`, `data:`, `mailto:`, `file:`) vira `null`.
 */
export function resolverLink(href: string, base?: string | null): string | null {
  // Tira os caracteres de controle (o `URL` já ignora tabulação e quebra de linha) e os espaços das pontas; um espaço no meio fica e vira
  // %20, como no navegador. Quem barra `javascript:` e afins é a conferência do protocolo, logo abaixo.
  const limpo = href.replace(INVISIVEIS, '').replace(/[\u0000-\u001f\u007f]+/g, '').trim();
  if (limpo === '' || limpo.length > 2000) return null;
  try {
    const u = base ? new URL(limpo, base) : new URL(limpo);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    if (u.username !== '' || u.password !== '') return null;
    return u.href;
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------------------------------------------------------------------
// O filtro de HTML

/** O que sai. */
const PERMITIDOS = new Set(['p', 'br', 'a', 'strong', 'em', 'ul', 'ol', 'li', 'blockquote', 'h2', 'h3']);
/** O que vira outro elemento permitido. */
const TROCAS: Record<string, string> = { b: 'strong', i: 'em', h1: 'h2', h4: 'h3', h5: 'h3', h6: 'h3', div: 'p', center: 'p', address: 'p', pre: 'p', td: 'p', th: 'p', dt: 'p', dd: 'p', caption: 'p' };
/** O que some com tudo o que tem dentro. */
const DESCARTADOS = new Set([
  'script', 'style', 'iframe', 'frame', 'frameset', 'object', 'embed', 'applet', 'param', 'noscript', 'noembed', 'noframes', 'template', 'svg', 'math',
  'video', 'audio', 'source', 'track', 'canvas', 'picture', 'figure', 'figcaption', 'img', 'map', 'area', 'form', 'input', 'button', 'select',
  'option', 'optgroup', 'textarea', 'datalist', 'output', 'head', 'title', 'link', 'meta', 'base', 'xmp', 'plaintext', 'dialog', 'slot', 'portal',
]);
/** Elementos sem conteúdo (não esperam fechamento). */
const VAZIOS = new Set(['br', 'hr', 'wbr', 'img', 'input', 'meta', 'link', 'source', 'track', 'area', 'col', 'base', 'embed', 'param', 'keygen']);
/** Elementos que separam blocos de texto: somem, mas fecham o parágrafo aberto. */
const FRONTEIRAS = new Set(['table', 'thead', 'tbody', 'tfoot', 'tr', 'colgroup', 'col', 'section', 'article', 'header', 'footer', 'main', 'aside', 'nav', 'hgroup', 'details', 'summary', 'dl', 'fieldset', 'legend', 'hr', 'menu']);

const BLOCOS_DE_TEXTO = new Set(['p', 'h2', 'h3', 'li']);
const EM_LINHA = new Set(['a', 'strong', 'em']);

interface No {
  tag: string;
  href?: string;
  filhos: (No | string)[];
}

/** Limites: o texto inteiro de uma notícia nunca chega perto; passou disso, a matéria fica só com o link para a fonte. */
const MAX_PROFUNDIDADE = 40;
export const MAX_TEXTO_DA_MATERIA = 200_000;

const ehQuebra = (f: No | string | undefined): boolean => typeof f === 'object' && f.tag === 'br';

function montarArvore(html: string, base: string | null): { raiz: No; tamanho: number } | null {
  const raiz: No = { tag: '#raiz', filhos: [] };
  const pilha: No[] = [raiz];
  let tamanho = 0;
  let pulando: { nome: string; nivel: number } | null = null;
  const topo = () => pilha[pilha.length - 1]!;
  const blocoAtual = (): No => {
    for (let k = pilha.length - 1; k >= 0; k--) if (!EM_LINHA.has(pilha[k]!.tag)) return pilha[k]!;
    return raiz;
  };
  const dentroDeTexto = () => BLOCOS_DE_TEXTO.has(blocoAtual().tag);
  const abrir = (tag: string, href?: string): No | null => {
    if (pilha.length >= MAX_PROFUNDIDADE) return null;
    const no: No = href ? { tag, href, filhos: [] } : { tag, filhos: [] };
    topo().filhos.push(no);
    pilha.push(no);
    return no;
  };
  const fecharEmLinha = () => {
    while (pilha.length > 1 && EM_LINHA.has(topo().tag)) pilha.pop();
  };
  const fecharParagrafo = () => {
    fecharEmLinha();
    const b = topo();
    if (b.tag === 'p' || b.tag === 'h2' || b.tag === 'h3') pilha.pop();
  };
  const fecharAte = (tag: string) => {
    const k = pilha.map((x) => x.tag).lastIndexOf(tag);
    if (k > 0) pilha.length = k;
  };
  /** Texto e marcação em linha só entram num bloco de texto: fora dele, abre um parágrafo (ou um item, dentro de uma lista). */
  const garantirTexto = () => {
    if (dentroDeTexto()) return;
    fecharEmLinha();
    const b = topo();
    abrir(b.tag === 'ul' || b.tag === 'ol' ? 'li' : 'p');
  };
  /** Bloco novo (lista, citação): não fica dentro de parágrafo; dentro de uma lista, entra num item. */
  const prepararBloco = () => {
    fecharParagrafo();
    const b = topo();
    if (b.tag === 'ul' || b.tag === 'ol') abrir('li');
  };

  for (const t of lerMarcacao(html)) {
    if (pulando) {
      if (t.tipo === 'abre' && t.nome === pulando.nome && !t.sozinha && !VAZIOS.has(t.nome)) pulando.nivel++;
      else if (t.tipo === 'fecha' && t.nome === pulando.nome && --pulando.nivel === 0) pulando = null;
      continue;
    }
    if (t.tipo === 'texto') {
      const s = t.texto.replace(INVISIVEIS, '');
      if (s.trim() === '') {
        // Um espaço só, e nenhum depois de uma quebra (assim "<br> <br> <br>" também conta como quebras seguidas).
        const ultimo = topo().filhos.at(-1);
        if (dentroDeTexto() && ultimo !== ' ' && !ehQuebra(ultimo)) topo().filhos.push(' ');
        continue;
      }
      tamanho += s.length;
      if (tamanho > MAX_TEXTO_DA_MATERIA) return null;
      garantirTexto();
      topo().filhos.push(s);
      continue;
    }
    const tag = TROCAS[t.nome] ?? t.nome;
    if (t.tipo === 'abre') {
      if (DESCARTADOS.has(t.nome)) {
        if (!t.sozinha && !VAZIOS.has(t.nome)) pulando = { nome: t.nome, nivel: 1 };
        continue;
      }
      if (FRONTEIRAS.has(t.nome)) {
        fecharParagrafo();
        continue;
      }
      if (!PERMITIDOS.has(tag)) continue; // Só enfeita: o texto de dentro fica.
      if (tag === 'br') {
        // No máximo duas quebras seguidas (uma linha em branco): uma fileira de milhares de `br` não vira trabalho nem espaço na página.
        if (dentroDeTexto() && !(ehQuebra(topo().filhos.at(-1)) && ehQuebra(topo().filhos.at(-2)))) topo().filhos.push({ tag: 'br', filhos: [] });
        continue;
      }
      if (tag === 'p' || tag === 'h2' || tag === 'h3') {
        fecharParagrafo();
        const b = topo();
        if (b.tag === 'ul' || b.tag === 'ol') abrir('li');
        if (!t.sozinha) abrir(tag);
        continue;
      }
      if (tag === 'li') {
        fecharParagrafo();
        if (topo().tag === 'li') pilha.pop();
        const b = topo();
        if (!t.sozinha) abrir(b.tag === 'ul' || b.tag === 'ol' ? 'li' : 'p');
        continue;
      }
      if (tag === 'ul' || tag === 'ol' || tag === 'blockquote') {
        prepararBloco();
        if (!t.sozinha) abrir(tag);
        continue;
      }
      // a, strong, em
      if (t.sozinha) continue;
      if (tag === 'a') {
        const href = resolverLink(t.atributos.href ?? '', base);
        if (pilha.some((x) => x.tag === 'a')) fecharAte('a');
        if (!href) continue; // Link para fora de http e https: só o texto fica.
        garantirTexto();
        abrir('a', href);
        continue;
      }
      garantirTexto();
      abrir(tag);
      continue;
    }
    // Fechamentos.
    if (FRONTEIRAS.has(t.nome)) {
      fecharParagrafo();
      continue;
    }
    if (!PERMITIDOS.has(tag) || tag === 'br') continue;
    fecharAte(tag);
  }
  return { raiz, tamanho };
}

const ehVazio = (s: string) => s.replace(INVISIVEIS, '').replace(/[\s\u00a0]+/g, '') === '';

/**
 * Tira os espaços e os `<br>` das pontas de um bloco, num laço que vê cada caractere uma vez (a expressão regular equivalente demora o
 * quadrado do tamanho numa fileira de espaços ou de `<br>` no meio do texto).
 */
function aparar(s: string): string {
  let ini = 0;
  let fim = s.length;
  for (;;) {
    if (ini < fim && /\s/.test(s[ini]!)) ini++;
    else if (ini + 4 <= fim && s.startsWith('<br>', ini)) ini += 4;
    else break;
  }
  for (;;) {
    if (fim > ini && /\s/.test(s[fim - 1]!)) fim--;
    else if (fim - 4 >= ini && s.startsWith('<br>', fim - 4)) fim -= 4;
    else break;
  }
  return s.slice(ini, fim);
}

/** Escreve a árvore: sem elemento vazio, sem `br` nas pontas de um bloco, espaços juntados, um bloco por linha. */
function escrever(no: No): string {
  const partes: string[] = [];
  for (const f of no.filhos) {
    if (typeof f === 'string') partes.push(escaparHtml(f.replace(/[\t\n\r\f ]+/g, ' ')));
    else partes.push(escrever(f));
  }
  if (no.tag === 'br') return '<br>';
  let dentro = partes.join('');
  if (no.tag === '#raiz') return partes.filter((p) => p !== '').join('\n');
  if (BLOCOS_DE_TEXTO.has(no.tag) || no.tag === 'blockquote' || no.tag === 'ul' || no.tag === 'ol') {
    if (no.tag === 'blockquote' || no.tag === 'ul' || no.tag === 'ol') {
      const blocos = partes.filter((p) => p !== '');
      if (blocos.length === 0) return '';
      return `<${no.tag}>\n${blocos.join('\n')}\n</${no.tag}>`;
    }
    dentro = aparar(dentro).replace(/ {2,}/g, ' ');
    if (ehVazio(dentro.replace(/<[^>]+>/g, '')) && !/<(ul|ol)>/.test(dentro)) return '';
    return `<${no.tag}>${dentro}</${no.tag}>`;
  }
  // Em linha: some quando fica vazio (um espaço sozinho continua espaço).
  if (ehVazio(dentro.replace(/<[^>]+>/g, ''))) return /[ \u00a0]/.test(dentro) ? ' ' : '';
  if (no.tag === 'a') return `<a href="${escaparHtml(no.href ?? '')}" rel="noopener noreferrer">${dentro}</a>`;
  return `<${no.tag}>${dentro}</${no.tag}>`;
}

/**
 * O HTML do texto inteiro de uma notícia, filtrado (veja o começo do arquivo). `base`: o endereço da matéria, para os links relativos (o
 * Banco Central usa `/estabilidadefinanceira/pix`). Devolve `null` quando o texto passa do limite ou não sobra nada.
 */
export function filtrarHtml(html: string, base: string | null = null): string | null {
  const arvore = montarArvore(html, base);
  if (!arvore) return null;
  const saida = escrever(arvore.raiz).trim();
  return saida === '' ? null : saida;
}

/**
 * O texto puro de um trecho de HTML (ou de texto simples com entidades): sem marcação, com o conteúdo dos elementos descartados fora
 * (script, estilo, imagem), uma linha em branco entre os blocos e espaços juntados.
 */
export function textoPuro(html: string): string {
  const linhas: string[] = [''];
  let pulando: { nome: string; nivel: number } | null = null;
  const BLOCO = new Set(['p', 'div', 'li', 'ul', 'ol', 'blockquote', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'tr', 'td', 'th', 'table', 'section', 'article', 'header', 'footer', 'dt', 'dd', 'pre', 'center', 'address', 'caption']);
  for (const t of lerMarcacao(html)) {
    if (pulando) {
      if (t.tipo === 'abre' && t.nome === pulando.nome && !t.sozinha && !VAZIOS.has(t.nome)) pulando.nivel++;
      else if (t.tipo === 'fecha' && t.nome === pulando.nome && --pulando.nivel === 0) pulando = null;
      continue;
    }
    if (t.tipo === 'texto') linhas[linhas.length - 1] += t.texto;
    else if (t.tipo === 'abre' && DESCARTADOS.has(t.nome)) {
      if (!t.sozinha && !VAZIOS.has(t.nome)) pulando = { nome: t.nome, nivel: 1 };
    } else if (t.nome === 'br') linhas[linhas.length - 1] += '\n';
    else if (BLOCO.has(t.nome)) linhas.push('');
  }
  return linhas
    .map((l) => l.replace(INVISIVEIS, '').split('\n').map((x) => x.replace(/[\s\u00a0]+/g, ' ').trim()).filter((x) => x !== '').join('\n'))
    .filter((l) => l !== '')
    .join('\n\n');
}

/** Os parágrafos de um trecho de HTML, em texto puro. */
export const paragrafos = (html: string): string[] =>
  textoPuro(html)
    .split(/\n{2,}/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter((p) => p !== '');

/** As frases de um texto (até o ponto, a interrogação, a exclamação ou as reticências seguidas de espaço ou do fim). */
export function frases(texto: string): string[] {
  const t = texto.replace(/\s+/g, ' ').trim();
  if (t === '') return [];
  // Corta depois do ponto (e de até três aspas ou parênteses que fecham a frase) seguido de espaço: "R$ 1.000,00" e "3.5" não cortam. O
  // limite de três deixa a procura para trás curta, mesmo numa fileira longa de aspas.
  return t
    .split(/(?<=[.!?\u2026]["'\u201d\u2019)\]]{0,3})\s+/)
    .map((f) => f.trim())
    .filter((f) => f !== '');
}

/**
 * Um resumo curto, com as palavras do próprio texto: as primeiras frases inteiras, até `maxFrases` (2) e `maxCaracteres` (300). Se a
 * primeira frase sozinha passar do limite, ela é cortada no fim de uma palavra, com reticências. Nada é reescrito.
 */
export function resumir(texto: string, { maxFrases = 2, maxCaracteres = 300 }: { maxFrases?: number; maxCaracteres?: number } = {}): string {
  const lista = frases(texto);
  let saida = '';
  for (const f of lista.slice(0, maxFrases)) {
    const junto = saida === '' ? f : `${saida} ${f}`;
    if (junto.length > maxCaracteres) break;
    saida = junto;
  }
  if (saida === '' && lista.length > 0) {
    const primeira = lista[0]!;
    const corte = primeira.slice(0, maxCaracteres - 1);
    const espaco = corte.lastIndexOf(' ');
    saida = `${(espaco > maxCaracteres / 2 ? corte.slice(0, espaco) : corte).replace(/[\s,;:]+$/, '')}\u2026`;
  }
  return saida;
}
