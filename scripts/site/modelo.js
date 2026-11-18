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

/**
 * O que o rodapé de todas as páginas mostra além do fixo, decidido uma vez por geração (`configurarRodape`, chamado por `gerarSite`):
 * `resumoSemanal` liga o link do resumo semanal de notícias, que só existe quando há pelo menos uma edição (D-106).
 */
let extrasDoRodape = { resumoSemanal: false };
function configurarRodape({ resumoSemanal = false } = {}) {
  extrasDoRodape = { resumoSemanal: Boolean(resumoSemanal) };
}

/** O aviso do rodapé das páginas de mercado (indicadores, glossário, explicações e resumo semanal, D-106), do núcleo. */
function avisoDeMercado() {
  return require('./catalogo').catalogo().INDICADORES.INDICADORES_TEXT.avisoMercado;
}

function rodapeHtml(arquivo, valores, { aviso = false } = {}) {
  // Com a newsletter ligada (D-066), a coluna "Aprender e ajuda" ganha o caminho para a inscrição; com edições do resumo semanal (D-106),
  // o resumo entra depois do glossário.
  const extras = (c) => {
    if (c.titulo !== 'Aprender e ajuda') return c;
    let links = c.links;
    if (extrasDoRodape.resumoSemanal) {
      const i = links.findIndex((l) => l.arquivo === 'indicadores/glossario.html');
      links = [...links.slice(0, i + 1), { arquivo: 'noticias/index.html', rotulo: 'Resumo semanal' }, ...links.slice(i + 1)];
    }
    if (valores && valores.newsletter === true) links = [...links, { arquivo: 'novidades/receber.html', rotulo: 'Novidades por e-mail' }];
    return { ...c, links };
  };
  const colunasDoRodape = RODAPE_COLUNAS.map(extras);
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
<div class="rodape-fim">${aviso ? `<p class="rodape-aviso">${esc(avisoDeMercado())}</p>` : ''}<p>${legal}</p></div>
</div>
</footer>`;
}

/**
 * Uma página completa. `fonte` é o texto original (Markdown ou modelo) onde se procuram os marcadores que faltam; o rodapé entra na
 * conta. `capa`: HTML do herói, com o `h1`; `corpo`: HTML que vai direto em `<main>`, depois da capa.
 * `jsonld`: objetos de dados estruturados. `scripts`: arquivos `.js` do próprio site, com caminho a partir da raiz. `modulos`: o mesmo, como módulo ES
 * (as calculadoras, que importam o núcleo de `js/nucleo/`). `precarga`: módulos ES que a página vai precisar, com `modulepreload` no `<head>`
 * para o navegador pedir todos de uma vez (sem esperar cada `import`). `cabecalho`: HTML a mais no `<head>`. `atualizada`: a data
 * ("AAAA-MM-DD") do conteúdo da página, quando ele tem uma (post e tema de Aprender), que vira o `<lastmod>` do sitemap.
 * `avisoDeMercado`: as páginas de mercado (D-106) levam no rodapé "Conteúdo educativo. Não é recomendação nem análise de valores
 * mobiliários."
 */
function montarPagina({ arquivo, titulo, descricao, capa, corpo, fonte, valores, jsonld = [], scripts = [], modulos = [], precarga = [], cabecalho = '', classeCapa = '', tipoOg = 'website', semIndexar = false, tituloCompleto = false, atualizada = null, avisoDeMercado: comAviso = false }) {
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
${rodapeHtml(arquivo, valores, { aviso: comAviso })}
</body>
</html>
`;
  return { arquivo, html, pendencias, semIndexar, atualizada };
}

/** Uma coluna de texto (páginas de leitura): `<div class="miolo conteudo"><div class="texto">...</div></div>`. */
const colunaTexto = (html, classe = 'texto') => `<div class="miolo conteudo">\n<div class="${classe}">\n${html}\n</div>\n</div>`;

/** Um bloco de seção com fundo próprio: `variante` é '', 'alt' ou 'azul'. */
const bloco = (conteudo, { variante = '', rotulo = null, id = null } = {}) =>
  `<section class="bloco${variante ? ` bloco-${variante}` : ''}"${rotulo ? ` aria-labelledby="${rotulo}"` : ''}${id ? ` id="${id}"` : ''}>\n<div class="miolo">\n${conteudo}\n</div>\n</section>`;

/**
 * A imagem de uma captura. Com a versão do tema escuro (`img.escura`, as telas das Novidades, D-114), um `<picture>`: quem visita no tema
 * escuro vê a tela escura do app, e a `<img>` (o tema claro) continua com o texto alternativo, a largura e a altura.
 */
function imagemDaTela(img, arquivo, carregamento) {
  const tag = `<img src="${rel(arquivo, img.caminho)}" alt="${esc(img.alt)}" width="${img.largura}" height="${img.altura}" loading="${carregamento}" decoding="async">`;
  if (!img.escura) return tag;
  return `<picture><source srcset="${rel(arquivo, img.escura)}" media="(prefers-color-scheme: dark)" width="${img.largura}" height="${img.altura}">${tag}</picture>`;
}

/**
 * O celular com a captura e a legenda de demonstração. `img` vem de `imagensDoSite().info`. `textoLegenda`: outra legenda (as Novidades
 * usam "Tela da demonstração, com dados fictícios"); `classe`: uma classe a mais na figura.
 */
function celular(img, arquivo, { legenda = true, carregamento = 'lazy', textoLegenda = null, classe = '' } = {}) {
  const { LEGENDA_DEMO } = require('./imagens');
  return `<figure class="celular${classe ? ` ${classe}` : ''}"><div class="celular-moldura">${imagemDaTela(img, arquivo, carregamento)}</div>${legenda ? `<figcaption>${esc(textoLegenda || LEGENDA_DEMO)}</figcaption>` : ''}</figure>`;
}

/** Os ícones da faixa de confiança, desenhados em linha (SVG no próprio HTML, sem arquivo nem estilo em atributo). */
const ICONES_DA_CONFIANCA = {
  banco: '<path d="M3 9.5 12 4l9 5.5M5 10v7M9.5 10v7M14.5 10v7M19 10v7M3 20h18"/>',
  dinheiro: '<path d="M4 8h14l-3-3M20 16H6l3 3"/>',
  cartao: '<rect x="3" y="5.5" width="18" height="13" rx="2.5"/><path d="M3 10h18M7 15h4"/>',
};

/**
 * A faixa de confiança da capa (pedido do Enzo, 18/11/2026, D-115): três frases curtas com um ícone pequeno cada, no lugar das seções "O
 * que a Clarevo não é" (página inicial) e "O que o app não faz" (O app), que eram caixas largas empilhadas. A faixa inteira é um link só
 * para o bloco "O que a Clarevo não faz" de Segurança e privacidade, onde está o texto completo; as vírgulas e o fim escondidos da tela
 * fazem o nome do link ser uma frase para quem usa leitor de tela.
 */
function faixaDeConfianca(arquivo) {
  const item = (icone, texto) => `<span class="confianca-item"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONES_DA_CONFIANCA[icone]}</svg>${esc(texto)}</span>`;
  return `<p class="confianca"><a href="${rel(arquivo, 'seguranca.html')}#nao-faz">${item('banco', 'Sem conexão com o seu banco')}<span class="so-leitor">, </span>${item('dinheiro', 'Não movimenta dinheiro nem oferece crédito')}<span class="so-leitor">, </span>${item('cartao', 'Não guarda os dados completos do cartão')}<span class="so-leitor">. Veja o que a Clarevo não faz, em Segurança e privacidade.</span></a></p>`;
}

/** A captura larga (painel no navegador) com a legenda de demonstração (ou `textoLegenda`). */
function telaLarga(img, arquivo, { textoLegenda = null, classe = '' } = {}) {
  const { LEGENDA_DEMO } = require('./imagens');
  return `<figure class="larga${classe ? ` ${classe}` : ''}"><div class="larga-moldura">${imagemDaTela(img, arquivo, 'lazy')}</div><figcaption>${esc(textoLegenda || LEGENDA_DEMO)}</figcaption></figure>`;
}

module.exports = { montarPagina, marcadoresEmHtml, colunaTexto, bloco, celular, telaLarga, faixaDeConfianca, dominioDe, urlDoSite, configurarRodape };
