'use strict';
/**
 * O modelo de página, num só lugar: cabeçalho com o logotipo oficial e o menu (no celular, um `<details>`, que funciona sem
 * JavaScript), "Pular para o conteúdo", rodapé com todas as seções, as páginas legais e "[RAZÃO SOCIAL] · CNPJ [CNPJ]", título,
 * descrição, Open Graph e dados estruturados. Com domínio em `site/dados-da-empresa.json`, a página ganha `canonical`, `og:url` e
 * `og:image` com endereço completo; sem domínio, não há nada disso (e nada de sitemap).
 */
const { MENU, RODAPE_COLUNAS, RODAPE_LEGAL } = require('./config');
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
  // A chamada do cabeçalho segue o estado do produto (D-125): "Abrir a versão web" antes do lançamento, "Testar grátis" depois.
  const { estadoEmVigor, chamadaDoMenu } = require('./estado');
  const cta = chamadaDoMenu(estadoEmVigor());
  return `<nav class="menu" aria-label="Principal">
<ul class="menu-lista">${lista}</ul>
<a class="menu-cta" href="${esc(cta.href)}" rel="noopener noreferrer">${esc(cta.texto)}</a>
<details class="menu-movel"><summary>Menu</summary><ul>${lista}<li><a href="${esc(cta.href)}" rel="noopener noreferrer">${esc(cta.texto)}</a></li></ul></details>
</nav>`;
}

/** O aviso do rodapé das páginas de mercado (indicadores, glossário, explicações, notícias e resumo semanal, D-106 e D-117), do núcleo. */
function avisoDeMercado() {
  return require('./catalogo').catalogo().INDICADORES.INDICADORES_TEXT.avisoMercado;
}

function rodapeHtml(arquivo, valores, { aviso = false } = {}) {
  // Com a newsletter ligada (D-066), a coluna "Aprender e ajuda" ganha o caminho para a inscrição.
  const extras = (c) => {
    if (c.titulo !== 'Aprender e ajuda') return c;
    let links = c.links;
    if (valores && valores.newsletter === true) links = [...links, { arquivo: 'novidades/receber.html', rotulo: 'Novidades por e-mail' }];
    return { ...c, links };
  };
  const colunasDoRodape = RODAPE_COLUNAS.map(extras);
  const colunas = colunasDoRodape.map(
    (c) => `<div><h2>${esc(c.titulo)}</h2><ul>${c.links.map((l) => `<li><a href="${rel(arquivo, l.arquivo)}">${esc(l.rotulo)}</a></li>`).join('')}</ul></div>`,
  ).join('\n');
  const legal = marcadoresEmHtml(esc(RODAPE_LEGAL), valores);
  // O tema do site (D-115): começa escondido e só aparece com o script do tema (js/tema.js); sem ele, o site segue o tema do aparelho.
  const icone = (d) => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${d}</svg>`;
  const opcao = (valor, rotulo, desenho) => `<label class="tema-opcao"><input type="radio" name="tema-site" value="${valor}"><span>${icone(desenho)}${esc(rotulo)}</span></label>`;
  const tema = `<fieldset class="tema-site" data-tema-site hidden><legend>Tema do site</legend><div class="tema-opcoes">${[
    opcao('aparelho', 'Igual ao aparelho', '<rect x="4" y="4" width="16" height="11" rx="2"/><path d="M8 20h8M12 15v5"/>'),
    opcao('claro', 'Claro', '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>'),
    opcao('escuro', 'Escuro', '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>'),
  ].join('')}</div></fieldset>`;
  return `<footer class="rodape">
<div class="miolo">
<nav class="rodape-grade" aria-label="Rodapé">
<div class="rodape-marca"><a href="${rel(arquivo, 'index.html')}" aria-label="Clarevo, página inicial"><img src="${rel(arquivo, 'marca/clarevo-logotipo-reverso.svg')}" alt="" width="130" height="26"></a><p>Cuidar da vida financeira faz parte de cuidar de você. Sem anúncios, sem venda de dados e sem recomendar produtos financeiros.</p></div>
${colunas}
</nav>
<div class="rodape-fim">${tema}${aviso ? `<p class="rodape-aviso">${esc(avisoDeMercado())}</p>` : ''}<p>${legal}</p></div>
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
/**
 * O script do tema do site (D-115), em todas as páginas, no <head> e antes do estilo, sem `defer`: ele marca o <html> com o tema escolhido
 * antes de a página aparecer (sem piscar no tema errado). É pequeno, do próprio site e não pede nada a ninguém.
 */
const SCRIPT_DO_TEMA = 'js/tema.js';

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
<script src="${rel(arquivo, SCRIPT_DO_TEMA)}"></script>
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
  // "Você decide o que entra" (D-125): a bandeja de entrada.
  entrada: '<path d="M4 13.5V18a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4.5"/><path d="M4 13.5h4.5l1.5 2.5h4l1.5-2.5H20L17.5 5h-11z"/>',
  // "Sem anúncios e sem venda de dados": o escudo com a marca de conferido.
  escudo: '<path d="M12 3.5 5 6.2v5.3c0 4.2 2.9 7.6 7 9 4.1-1.4 7-4.8 7-9V6.2z"/><path d="M9 12l2 2 4-4"/>',
  dinheiro: '<path d="M4 8h14l-3-3M20 16H6l3 3"/>',
  cartao: '<rect x="3" y="5.5" width="18" height="13" rx="2.5"/><path d="M3 10h18M7 15h4"/>',
};

/**
 * A faixa de confiança da capa (pedido do Enzo, 18/11/2026, D-115): três frases curtas com um ícone pequeno cada, no lugar das seções "O
 * que a Clarevo não é" (página inicial) e "O que o app não faz" (O app), que eram caixas largas empilhadas. A faixa inteira é um link só
 * para a página Segurança e privacidade, com o convite visível "Segurança e privacidade" sublinhado no fim (desde 19/11/2026: antes era
 * "Ver o que a Clarevo não faz", com link para o bloco desse nome, que ficou recolhido no fim de Segurança); as vírgulas e o "Mais em"
 * escondidos da tela fazem o nome do link ser uma frase para quem usa leitor de tela.
 *
 * Desde 25/11/2026 (D-125), a primeira frase é "Você decide o que entra" (era "Sem conexão com o seu banco"): continua verdadeira hoje (só
 * entra o que a pessoa anota, importa ou manda por mensagem) e não envelhece se um dia houver uma conexão opcional. A terceira passou a ser o
 * modelo de negócio ("Sem anúncios e sem venda de dados"); o detalhe do cartão continua em Segurança.
 */
const FRASES_DA_CONFIANCA = [
  ['entrada', 'Você decide o que entra'],
  ['escudo', 'Sem anúncios e sem venda de dados'],
  ['dinheiro', 'Não movimenta dinheiro nem oferece crédito'],
];
function faixaDeConfianca(arquivo) {
  const item = (icone, texto) => `<span class="confianca-item"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONES_DA_CONFIANCA[icone]}</svg>${esc(texto)}</span>`;
  return `<p class="confianca"><a href="${rel(arquivo, 'seguranca.html')}">${FRASES_DA_CONFIANCA.map(([icone, texto]) => item(icone, texto)).join('<span class="so-leitor">, </span>')}<span class="so-leitor">. Mais em </span><span class="confianca-mais">Segurança e privacidade<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M5 12h14M13 6l6 6-6 6"/></svg></span><span class="so-leitor">.</span></a></p>`;
}

/**
 * Os ícones de linha dos recursos (23/11/2026, "O que o plano inclui" em cartões) e a seta dos atalhos: o mesmo traço da faixa de confiança e
 * do tema do rodapé (24 x 24, linha de 1,8, pontas redondas), no próprio HTML, sem arquivo, sem estilo em atributo e sem marca de terceiros
 * (o Telegram é um balão de conversa). Decorativos: o nome vem sempre do texto ao lado.
 */
const ICONES = {
  anotar: '<path d="M4 20h4L18.5 9.5a2.12 2.12 0 0 0-3-3L5 17v3z"/><path d="M13.5 8.5l3 3"/>',
  conta: '<path d="M6 3.5h12v17l-3-2-3 2-3-2-3 2z"/><path d="M9 8.5h6M9 12h6M9 15.5h3"/>',
  calendario: '<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4M8 14h2M14 14h2"/>',
  cartao: ICONES_DA_CONFIANCA.cartao,
  dinheiro: ICONES_DA_CONFIANCA.dinheiro,
  entrada: ICONES_DA_CONFIANCA.entrada,
  escudo: ICONES_DA_CONFIANCA.escudo,
  // A receber (D-122, página do MEI): o relógio.
  receber: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  // Família (as três portas da página inicial): duas pessoas.
  pessoas: '<circle cx="9" cy="8.5" r="3"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0"/><circle cx="17" cy="9.5" r="2.4"/><path d="M15.5 14.2A4.5 4.5 0 0 1 21 18.5"/>',
  // Empresas (as três portas): o prédio.
  empresa: '<path d="M4.5 20V5.5A1.5 1.5 0 0 1 6 4h7a1.5 1.5 0 0 1 1.5 1.5V20M14.5 10H18a1.5 1.5 0 0 1 1.5 1.5V20M3 20h18M8 8h3M8 11.5h3M8 15h3"/>',
  importar: '<path d="M14 3.5H7.5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V8z"/><path d="M14 3.5V8h4.5M12 11v6M9.5 14.5 12 17l2.5-2.5"/>',
  ler: '<path d="M4 8.5V6a2 2 0 0 1 2-2h2.5M15.5 4H18a2 2 0 0 1 2 2v2.5M20 15.5V18a2 2 0 0 1-2 2h-2.5M8.5 20H6a2 2 0 0 1-2-2v-2.5"/><path d="M8 12h8"/>',
  meta: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.75"/><circle cx="12" cy="12" r="1.25"/>',
  investir: '<path d="M4 4v16h16"/><path d="M7.5 14.5 11 11l3 3 5-5"/>',
  aprender: '<path d="M12 6.5C10.5 5.2 8 4.5 4 4.5v13c4 0 6.5.7 8 2 1.5-1.3 4-2 8-2v-13c-4 0-6.5.7-8 2z"/><path d="M12 6.5v13"/>',
  mensagem: '<path d="M20 11.5a7.5 7.5 0 0 1-11.1 6.6L4 19.5l1.4-4.4A7.5 7.5 0 1 1 20 11.5z"/><path d="M9 10h6M9 13.5h4"/>',
  negocio: '<rect x="3.5" y="7" width="17" height="13" rx="2.5"/><path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7M3.5 12.5h17"/>',
  tema: '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor" stroke="none"/>',
  ocultar: '<path d="M3.5 3.5l17 17"/><path d="M10.4 5.6A9.4 9.4 0 0 1 12 5.5c4.8 0 8 4.2 9 6.5a12.6 12.6 0 0 1-2.5 3.6M6.4 7.1C4.6 8.3 3.5 10.2 3 12c1 2.3 4.2 6.5 9 6.5 1.6 0 3-.4 4.2-1.1"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  exportar: '<path d="M12 4v10.5M7.75 10.25 12 14.5l4.25-4.25"/><path d="M4.5 17v1.5A1.5 1.5 0 0 0 6 20h12a1.5 1.5 0 0 0 1.5-1.5V17"/>',
  seta: '<path d="M5 12h14M13 6l6 6-6 6"/>',
};

/** Um ícone de `ICONES`, decorativo (`aria-hidden`), no tamanho pedido. */
function icone(nome, tamanho = 24, traco = 1.8) {
  if (!ICONES[nome]) throw new Error(`o ícone "${nome}" não existe (scripts/site/modelo.js, ICONES)`);
  return `<svg viewBox="0 0 24 24" width="${tamanho}" height="${tamanho}" fill="none" stroke="currentColor" stroke-width="${traco}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONES[nome]}</svg>`;
}

/**
 * Uma lista de atalhos (23/11/2026, no lugar das listas de links sublinhados de "Perguntas mais comuns" da Ajuda e de "Antes de escrever"
 * do Suporte): cada item é um link só, numa caixa com pelo menos 56 px de altura, o texto em negrito, a linha de baixo (`sub`, o tema) em
 * letra menor e a seta. Uma coluna no celular e duas a partir de 40 rem; com `tres`, três no computador (a página toda, como na Ajuda).
 * A grade fecha as linhas, como a dos recursos dos planos. `itens`: `{ href, texto, sub }`.
 */
function listaDeAtalhos(itens, { tres = false } = {}) {
  return `<ul class="atalhos${tres ? ' atalhos-tres' : ''}" role="list">
${itens.map((i) => `<li><a class="atalho" href="${i.href}"><span class="atalho-texto"><span class="atalho-titulo">${esc(i.texto)}</span>${i.sub ? `<small>${esc(i.sub)}</small>` : ''}</span>${icone('seta', 18, 2)}</a></li>`).join('\n')}
</ul>`;
}

/** A captura larga (painel no navegador) com a legenda de demonstração (ou `textoLegenda`). */
function telaLarga(img, arquivo, { textoLegenda = null, classe = '' } = {}) {
  const { LEGENDA_DEMO } = require('./imagens');
  return `<figure class="larga${classe ? ` ${classe}` : ''}"><div class="larga-moldura">${imagemDaTela(img, arquivo, 'lazy')}</div><figcaption>${esc(textoLegenda || LEGENDA_DEMO)}</figcaption></figure>`;
}

module.exports = { SCRIPT_DO_TEMA, FRASES_DA_CONFIANCA, montarPagina, marcadoresEmHtml, colunaTexto, bloco, celular, telaLarga, faixaDeConfianca, icone, listaDeAtalhos, dominioDe, urlDoSite };
