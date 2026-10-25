'use strict';
/**
 * O modelo de página, num só lugar: cabeçalho com o logotipo oficial e o menu (no celular, um `<details>`, que funciona sem
 * JavaScript), "Pular para o conteúdo", rodapé com todas as seções, as páginas legais e "[RAZÃO SOCIAL] · CNPJ [CNPJ]", título,
 * descrição, Open Graph e dados estruturados. Com domínio em `site/dados-da-empresa.json`, a página ganha `canonical`, `og:url` e
 * `og:image` com endereço completo; sem domínio, não há nada disso (e nada de sitemap).
 */
const { MENU, RODAPE_COLUNAS, RODAPE_LEGAL, URL_APP } = require('./config');
const { esc, expandirMarcador, FONTE_MARCADOR, pendenciasDoTexto, valorDe } = require('./texto');
const { rel, caminhoLimpo, jsonSeguro } = require('./util');

/** Troca os marcadores em um trecho de HTML escrito à mão (os modelos): o marcador só aparece em texto, nunca em atributo. */
function marcadoresEmHtml(html, valores) {
  return html.replace(new RegExp(FONTE_MARCADOR, 'g'), (m) => expandirMarcador(m, valores).html);
}

/** O domínio sem `https://` nem barras, ou texto vazio. */
function dominioDe(valores) {
  return valorDe(valores, 'DOMÍNIO').replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
}

const urlDoSite = (valores, arquivo) => {
  const d = dominioDe(valores);
  return d ? `https://${d}${caminhoLimpo(arquivo)}` : null;
};

function menuHtml(arquivo) {
  const pasta = arquivo.includes('/') ? arquivo.split('/')[0] : null;
  const item = (p) => {
    const atual = p.arquivo === arquivo;
    const secao = !atual && p.pasta !== null && p.pasta === pasta;
    const attrs = atual ? ' aria-current="page"' : secao ? ' class="secao-atual"' : '';
    return `<li><a href="${rel(arquivo, p.arquivo)}"${attrs}>${esc(p.rotulo)}</a></li>`;
  };
  const lista = MENU.map(item).join('');
  return `<nav class="menu" aria-label="Principal">
<ul class="menu-lista">${lista}</ul>
<a class="menu-cta" href="${esc(URL_APP)}" rel="noopener noreferrer">Abrir a versão web</a>
<details class="menu-movel"><summary>Menu</summary><ul>${lista}<li><a href="${esc(URL_APP)}" rel="noopener noreferrer">Abrir a versão web</a></li></ul></details>
</nav>`;
}

function rodapeHtml(arquivo, valores) {
  // Com a newsletter ligada (D-066), a coluna "Aprender e ajuda" ganha o caminho para a inscrição.
  const colunasDoRodape = RODAPE_COLUNAS.map((c) => (c.titulo === 'Aprender e ajuda' && valores && valores.newsletter === true ? { ...c, links: [...c.links, { arquivo: 'novidades/receber.html', rotulo: 'Novidades por e-mail' }] } : c));
  const colunas = colunasDoRodape.map(
    (c) => `<div><h2>${esc(c.titulo)}</h2><ul>${c.links.map((l) => `<li><a href="${rel(arquivo, l.arquivo)}">${esc(l.rotulo)}</a></li>`).join('')}</ul></div>`,
  ).join('\n');
  const legal = marcadoresEmHtml(esc(RODAPE_LEGAL), valores);
  return `<footer class="rodape">
<div class="miolo">
<nav class="rodape-grade" aria-label="Rodapé">
<div class="rodape-marca"><a href="${rel(arquivo, 'index.html')}" aria-label="Clarevo, página inicial"><img src="${rel(arquivo, 'marca/clarevo-logotipo-reverso.svg')}" alt="" width="130" height="26"></a><p>Cuidar da vida financeira faz parte de cuidar de você. Sem anúncios, sem venda de dados e sem recomendar produtos financeiros.</p></div>
${colunas}
</nav>
<div class="rodape-fim"><p>${legal}</p></div>
</div>
</footer>`;
}

/**
 * Uma página completa. `fonte` é o texto original (Markdown ou modelo) onde se procuram os marcadores que faltam; o rodapé entra na
 * conta. `capa`: HTML do herói, com o `h1`; `corpo`: HTML que vai direto em `<main>`, depois da capa.
 * `jsonld`: objetos de dados estruturados. `scripts`: arquivos `.js` do próprio site, com caminho a partir da raiz. `modulos`: o mesmo, como módulo ES
 * (as calculadoras, que importam o núcleo de `js/nucleo/`). `precarga`: módulos ES que a página vai precisar, com `modulepreload` no `<head>`
 * para o navegador pedir todos de uma vez (sem esperar cada `import`). `cabecalho`: HTML a mais no `<head>`.
 */
function montarPagina({ arquivo, titulo, descricao, capa, corpo, fonte, valores, jsonld = [], scripts = [], modulos = [], precarga = [], cabecalho = '', classeCapa = '', tipoOg = 'website', semIndexar = false, tituloCompleto = false }) {
  const pendencias = pendenciasDoTexto(`${fonte}\n${RODAPE_LEGAL}`, valores);
  const faixa = pendencias.length
    ? `<div class="faixa" role="note"><div class="miolo"><p><strong>Versão preliminar, em revisão.</strong> Este texto ainda não vale como versão final: os trechos destacados serão preenchidos antes da publicação.</p></div></div>\n`
    : '';
  const noindex = pendencias.length > 0 || semIndexar;
  const dominio = dominioDe(valores);
  const url = urlDoSite(valores, arquivo);
  const tituloHtml = tituloCompleto ? titulo : `${titulo} · Clarevo`;
  const og = [
    `<meta property="og:type" content="${esc(tipoOg)}">`,
    `<meta property="og:site_name" content="Clarevo">`,
    `<meta property="og:locale" content="pt_BR">`,
    `<meta property="og:title" content="${esc(tituloHtml)}">`,
    `<meta property="og:description" content="${esc(descricao)}">`,
  ];
  if (dominio) {
    og.push(
      `<meta property="og:url" content="${esc(url)}">`,
      `<meta property="og:image" content="${esc(`https://${dominio}/og/clarevo.png`)}">`,
      '<meta property="og:image:width" content="1200">',
      '<meta property="og:image:height" content="630">',
      '<meta property="og:image:alt" content="Clarevo: cuidar da vida financeira faz parte de cuidar de você, mais clareza para decidir, com a tela Resumo do app">',
      '<meta name="twitter:card" content="summary_large_image">',
    );
  }
  const canonical = url ? `<link rel="canonical" href="${esc(url)}">\n` : '';
  const dados = jsonld.map((o) => `<script type="application/ld+json">${jsonSeguro(o)}</script>`).join('\n');
  const js = [...precarga.map((m) => `<link rel="modulepreload" href="${rel(arquivo, m)}">`), ...scripts.map((s) => `<script src="${rel(arquivo, s)}" defer></script>`), ...modulos.map((s) => `<script type="module" src="${rel(arquivo, s)}"></script>`)].join('\n');
  const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(tituloHtml)}</title>
<meta name="description" content="${esc(descricao)}">
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="#2457F5">
<meta name="referrer" content="same-origin">
${noindex ? '<meta name="robots" content="noindex">\n' : ''}${canonical}${og.join('\n')}
<link rel="icon" href="${rel(arquivo, 'favicon.svg')}" type="image/svg+xml">
<link rel="apple-touch-icon" href="${rel(arquivo, 'marca/icone-app.png')}">
<link rel="stylesheet" href="${rel(arquivo, 'estilo.css')}">
${cabecalho ? `${cabecalho}\n` : ''}${dados ? `${dados}\n` : ''}${js ? `${js}\n` : ''}</head>
<body>
<a class="pular" href="#conteudo">Pular para o conteúdo</a>
${faixa}<header class="topo">
<div class="miolo topo-i">
<a class="marca" href="${rel(arquivo, 'index.html')}"><img src="${rel(arquivo, 'marca/clarevo-logotipo-reverso.svg')}" alt="Clarevo, página inicial" width="140" height="28" class="logo-tela"><img src="${rel(arquivo, 'marca/clarevo-logotipo.svg')}" alt="Clarevo, página inicial" width="140" height="28" class="logo-papel"></a>
${menuHtml(arquivo)}
</div>
</header>
<main id="conteudo" tabindex="-1">
<section class="capa ${classeCapa}">
<div class="miolo">
${capa}
</div>
</section>
${corpo}
</main>
${rodapeHtml(arquivo, valores)}
</body>
</html>
`;
  return { arquivo, html, pendencias, semIndexar };
}

/** Uma coluna de texto (páginas de leitura): `<div class="miolo conteudo"><div class="texto">...</div></div>`. */
const colunaTexto = (html, classe = 'texto') => `<div class="miolo conteudo">\n<div class="${classe}">\n${html}\n</div>\n</div>`;

/** Um bloco de seção com fundo próprio: `variante` é '', 'alt' ou 'azul'. */
const bloco = (conteudo, { variante = '', rotulo = null, id = null } = {}) =>
  `<section class="bloco${variante ? ` bloco-${variante}` : ''}"${rotulo ? ` aria-labelledby="${rotulo}"` : ''}${id ? ` id="${id}"` : ''}>\n<div class="miolo">\n${conteudo}\n</div>\n</section>`;

/** O celular com a captura e a legenda de demonstração. `img` vem de `imagensDoSite().info`. */
function celular(img, arquivo, { legenda = true, carregamento = 'lazy' } = {}) {
  const { LEGENDA_DEMO } = require('./imagens');
  return `<figure class="celular"><div class="celular-moldura"><img src="${rel(arquivo, img.caminho)}" alt="${esc(img.alt)}" width="${img.largura}" height="${img.altura}" loading="${carregamento}" decoding="async"></div>${legenda ? `<figcaption>${LEGENDA_DEMO}</figcaption>` : ''}</figure>`;
}

/** A captura larga (painel no navegador) com a legenda de demonstração. */
function telaLarga(img, arquivo) {
  const { LEGENDA_DEMO } = require('./imagens');
  return `<figure class="larga"><div class="larga-moldura"><img src="${rel(arquivo, img.caminho)}" alt="${esc(img.alt)}" width="${img.largura}" height="${img.altura}" loading="lazy" decoding="async"></div><figcaption>${LEGENDA_DEMO}</figcaption></figure>`;
}

module.exports = { montarPagina, marcadoresEmHtml, colunaTexto, bloco, celular, telaLarga, dominioDe, urlDoSite };
