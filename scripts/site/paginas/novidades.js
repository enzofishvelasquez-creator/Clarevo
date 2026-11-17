'use strict';
/**
 * Novidades: posts em Markdown (`site-src/novidades/AAAA-MM-DD-slug.md`, com título, data, resumo, autoria e fontes), o índice, uma
 * página por post, o feed RSS e "Como escrevemos". Só fatos que já existem no repositório: nada de notícia externa. Um post pode
 * trazer texto do catálogo de Aprender com a linha `{{tema:SLUG:CAMPO}}` (CAMPO: titulo, subtitulo, short, p1 a p5, exemplo,
 * hipoteses), para a mesma frase nunca existir em dois lugares.
 *
 * Imagens (D-114): `capa: <id>` no cabeçalho põe a imagem de capa no topo da matéria, à direita do título (no celular, embaixo dele): uma
 * tela da demonstração no celular ou, na matéria sem tela, uma ilustração da marca. Uma linha sozinha `{{tela:<id>}}` numa seção põe a
 * tela ao lado do texto dela (no celular, embaixo); a tela larga (o painel da empresa) fica embaixo do texto da seção, na largura dele. As
 * telas têm a versão do tema escuro, largura, altura, texto alternativo e a legenda "Tela da demonstração, com dados fictícios".
 */
const fs = require('node:fs');
const path = require('node:path');
const { esc, markdownParaHtml, separarTitulo } = require('../texto');
const { rel, dataPorExtensoIso, dataRfc822, caminhoLimpo, descricaoCurta } = require('../util');
const { montarPagina, colunaTexto, bloco, dominioDe, urlDoSite, celular, telaLarga } = require('../modelo');
const { LEGENDA_TELA } = require('../videos');
const { catalogo } = require('../catalogo');
const { lerPosts, lerCabecalho } = require('../conteudo');
const { SITE_SRC } = require('../config');
const { fonteHtml, arquivoDoTema } = require('./aprender');
const { blocoDaNewsletterEmNovidades } = require('./formularios');

const PASTA_POSTS = path.join(SITE_SRC, 'novidades');
const ARQUIVO_INDICE = 'novidades/index.html';
const ARQUIVO_FEED = 'novidades/feed.xml';

/** O feed só existe com domínio (feedRss): sem ele, não há link para ele nas páginas. */
const linkDoFeed = (arquivo, valores) =>
  dominioDe(valores) ? `<link rel="alternate" type="application/rss+xml" title="Novidades da Clarevo" href="${rel(arquivo, ARQUIVO_FEED)}">` : '';

/** Um campo de um tema do catálogo, em texto (ou `null` se o tema ou o campo não existem). */
function campoDoTema(slug, campo) {
  const t = catalogo().tema(slug);
  if (!t) return null;
  const par = /^p([1-9])$/.exec(campo);
  if (par) return t.paragraphs[Number(par[1]) - 1] ?? null;
  return { titulo: t.title, subtitulo: t.subtitle, short: t.short, exemplo: t.example, hipoteses: t.hypotheses }[campo] ?? null;
}

/**
 * Troca cada parágrafo `{{tema:SLUG:CAMPO}}` pelo texto do catálogo. Devolve o HTML e a lista do que não achou. Um tema ou campo que
 * não existe nunca some em silêncio: o parágrafo fica na página, destacado como pendente, e a falta vira aviso no console e
 * problema que o `--final` recusa.
 */
function expandirDiretivas(html, onde) {
  const faltas = [];
  const saida = html.replace(/<p>\{\{tema:([a-z0-9-]+):([a-z0-9]+)\}\}<\/p>/g, (_, slug, campo) => {
    const texto = campoDoTema(slug, campo);
    if (texto === null) {
      faltas.push(`${onde}: {{tema:${slug}:${campo}}} não existe no catálogo de Aprender`);
      return `<p><mark class="pendente">Falta o texto do tema "${esc(slug)}", campo "${esc(campo)}": ele não existe no catálogo de Aprender.</mark></p>`;
    }
    return `<p>${esc(texto)}</p>`;
  });
  if (/\{\{/.test(saida)) faltas.push(`${onde}: sobrou uma chave "{{" que não é uma diretiva de tema válida`);
  return { html: saida, faltas };
}

/** Uma tela é larga (o painel da empresa no navegador) quando é mais larga que alta. */
const telaEhLarga = (img) => img.largura > img.altura;

/**
 * Troca cada parágrafo `{{tela:ID}}` pela tela. A tela de celular vai ao lado do texto da seção dela (do `<h2>` até o próximo): a seção
 * vira uma grade de duas colunas no computador. A tela larga fica no lugar da linha, na largura do texto. Um id que não existe fica na
 * página, destacado, e vira aviso (o `--final` recusa).
 */
function expandirTelas(html, { img, arquivo, onde }) {
  const faltas = [];
  const figura = (id) => {
    const i = img[id];
    if (!i || i.ilustracao) return null;
    return telaEhLarga(i) ? telaLarga(i, arquivo, { textoLegenda: LEGENDA_TELA, classe: 'post-tela' }) : celular(i, arquivo, { textoLegenda: LEGENDA_TELA, classe: 'post-tela' });
  };
  // As seções: o que vem antes do primeiro <h2> e cada <h2> com o que vem depois dele.
  const partes = html.split(/(?=<h2[\s>])/);
  const saida = partes.map((parte) => {
    const achados = [...parte.matchAll(/<p>\{\{tela:([a-z0-9-]+)\}\}<\/p>\n?/g)];
    if (!achados.length) return parte;
    let ladoALado = null;
    let texto = parte;
    for (const [linha, id] of achados) {
      const fig = figura(id);
      if (!fig) {
        faltas.push(`${onde}: {{tela:${id}}} não é uma tela das Novidades (scripts/site/imagens.js)`);
        texto = texto.replace(linha, `<p><mark class="pendente">Falta a tela "${esc(id)}": ela não existe entre as imagens do site.</mark></p>\n`);
      } else if (telaEhLarga(img[id])) texto = texto.replace(linha, `${fig}\n`);
      else {
        if (ladoALado) faltas.push(`${onde}: a seção já tem uma tela ao lado do texto ({{tela:${id}}} ficou de fora)`);
        else ladoALado = fig;
        texto = texto.replace(linha, '');
      }
    }
    return ladoALado ? `<div class="post-secao">\n<div class="post-secao-texto">\n${texto.trim()}\n</div>\n${ladoALado}\n</div>\n` : texto;
  });
  return { html: saida.join(''), faltas };
}

/** A figura da capa: a tela no celular (com a legenda) ou a ilustração. `null` sem capa. */
function figuraDaCapa(post, img) {
  if (!post.capa) return { html: null, faltas: [] };
  const i = img[post.capa];
  if (!i) return { html: null, faltas: [`${post.origem}: a capa "${post.capa}" não existe entre as imagens do site (scripts/site/imagens.js)`] };
  if (i.ilustracao) {
    return { html: `<figure class="capa-ilustracao"><img src="${rel(post.arquivo, i.caminho)}" alt="${esc(i.alt)}" width="${i.largura}" height="${i.altura}" decoding="async"></figure>`, faltas: [] };
  }
  if (telaEhLarga(i)) return { html: null, faltas: [`${post.origem}: a capa "${post.capa}" é uma tela larga; a capa precisa ser uma tela de celular ou uma ilustração`] };
  return { html: celular(i, post.arquivo, { textoLegenda: LEGENDA_TELA, carregamento: 'eager', classe: 'capa-tela' }), faltas: [] };
}

/** As fontes de um post como itens de lista. */
function fontesDoPost(post) {
  const c = catalogo();
  const itens = [];
  const problemas = [];
  for (const f of post.fontes) {
    if (f.tipo === 'tema') {
      const t = c.tema(f.slug);
      if (!t) {
        problemas.push(`${post.origem}: a fonte "tema: ${f.slug}" não existe no catálogo de Aprender`);
        continue;
      }
      // As fontes do tema ficam numa lista dentro do item do tema, e não soltas na numeração do post (12/11/2026).
      itens.push(`<li><a href="${rel(post.arquivo, arquivoDoTema(t.slug))}">Aprender: ${esc(t.title)}</a><span class="fonte-meta">${esc(c.TEXTO.reviewedOn(t.reviewedOn))}. As fontes do tema:</span>
<ol class="fontes">
${t.sources.map((s) => fonteHtml(s, null)).join('\n')}
</ol></li>`);
    } else if (f.tipo === 'link') {
      if (/^https:\/\//.test(f.destino)) itens.push(`<li><a href="${esc(f.destino)}" rel="noopener noreferrer">${esc(f.rotulo)}</a></li>`);
      else if (/^[a-z]+:/i.test(f.destino)) problemas.push(`${post.origem}: a fonte "${f.rotulo}" tem um endereço que não é https nem uma página do site`);
      else itens.push(`<li><a href="${rel(post.arquivo, f.destino)}">${esc(f.rotulo)}</a></li>`);
    } else itens.push(`<li>${esc(f.rotulo)}</li>`);
  }
  return { itens, problemas };
}

function paginaDoPost(post, { valores, img }) {
  const arquivo = post.arquivo;
  const comTelas = expandirTelas(markdownParaHtml(post.corpo, { valores, paginaAtual: arquivo }), { img, arquivo, onde: post.origem });
  const { html: corpoHtml, faltas: faltasDoTema } = expandirDiretivas(comTelas.html, post.origem);
  const daCapa = figuraDaCapa(post, img);
  const faltas = [...comTelas.faltas, ...faltasDoTema, ...daCapa.faltas];
  const { itens, problemas } = fontesDoPost(post);
  const corpo = colunaTexto(
    `<div class="post-corpo">
${corpoHtml}
</div>
<section class="post-fontes" aria-labelledby="fontes">
<h2 id="fontes">Fontes</h2>
<ol class="fontes">
${itens.join('\n')}
</ol>
<p class="revisao">Publicado em ${esc(dataPorExtensoIso(post.data))} por ${esc(post.autoria)}. Se encontrarmos um erro, corrigimos neste mesmo texto e registramos a correção aqui. Veja <a href="${rel(arquivo, 'novidades/como-escrevemos.html')}">como escrevemos</a>.</p>
</section>
<p class="voltar"><a href="${rel(arquivo, ARQUIVO_INDICE)}">Voltar para Novidades</a></p>`,
    'texto texto-post',
  );
  const cabecalhoDoPost = `<p class="migalha"><a href="${rel(arquivo, ARQUIVO_INDICE)}">Novidades</a></p>
<h1>${esc(post.titulo)}</h1>
<p class="lead">${esc(post.resumo)}</p>
<p class="meta-tema"><time datetime="${post.data}">${esc(dataPorExtensoIso(post.data))}</time> · ${esc(post.autoria)}</p>`;
  // Com capa, o topo vira duas colunas no computador: o título à esquerda e a imagem à direita, no lugar do disco azul vazio (D-114).
  const capa = daCapa.html ? `<div class="capa-grade capa-post">\n<div>\n${cabecalhoDoPost}\n</div>\n${daCapa.html}\n</div>` : cabecalhoDoPost;
  const dominio = dominioDe(valores);
  const artigo = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.titulo,
    description: post.resumo,
    datePublished: post.data,
    dateModified: post.data,
    inLanguage: 'pt-BR',
    author: { '@type': 'Organization', name: post.autoria },
    publisher: { '@type': 'Organization', name: 'Clarevo' },
    ...(dominio ? { mainEntityOfPage: urlDoSite(valores, arquivo), image: `https://${dominio}/og/clarevo.png` } : {}),
  };
  const pg = montarPagina({
    arquivo,
    titulo: post.titulo,
    // O resumo inteiro (até 220 caracteres) fica na capa, no índice e no feed; a descrição para as buscas cabe em 160.
    descricao: descricaoCurta(post.resumo),
    capa,
    corpo,
    fonte: post.corpo + capa,
    valores,
    classeCapa: daCapa.html ? 'capa-simples capa-com-imagem' : 'capa-simples',
    tipoOg: 'article',
    jsonld: [artigo],
    cabecalho: linkDoFeed(arquivo, valores),
    atualizada: post.data,
  });
  return { arquivo, ...pg, avisos: [...faltas, ...problemas] };
}

function paginaIndice(posts, { valores }) {
  const arquivo = ARQUIVO_INDICE;
  const cartoes = posts
    .map(
      (p) => `<li><a class="cartao" href="${rel(arquivo, p.arquivo)}"><span class="post-data"><time datetime="${p.data}">${esc(dataPorExtensoIso(p.data))}</time> · ${esc(p.autoria)}</span><span class="titulo-cartao">${esc(p.titulo)}</span><p>${esc(p.resumo)}</p></a></li>`,
    )
    .join('\n');
  const capa = `<h1>Novidades</h1>
<p class="lead">Textos curtos da Equipe Clarevo, com data e fonte. Só publicamos o que já existe e pode ser conferido.</p>
<div class="acoes">
<a class="botao botao-principal" href="${rel(arquivo, 'novidades/como-escrevemos.html')}">Como escrevemos</a>
${dominioDe(valores) ? `<a class="botao botao-suave" href="${rel(arquivo, ARQUIVO_FEED)}">Feed RSS</a>\n` : ''}</div>`;
  const corpo = bloco(
    `<h2 id="textos">Textos publicados</h2>
<ul class="posts">
${cartoes}
</ul>`,
    { rotulo: 'textos' },
  );
  const pg = montarPagina({
    arquivo,
    titulo: 'Novidades',
    descricao: 'Textos curtos da Equipe Clarevo sobre o app, a empresa como benefício e educação financeira, cada um com data e fontes.',
    capa,
    corpo: [corpo, blocoDaNewsletterEmNovidades(valores, arquivo)].filter(Boolean).join('\n'),
    fonte: capa,
    valores,
    classeCapa: 'capa-simples',
    cabecalho: linkDoFeed(arquivo, valores),
    // O post mais novo (a lista vem do mais novo para o mais antigo), para o sitemap.
    atualizada: posts.length ? posts[0].data : null,
  });
  return { arquivo, ...pg };
}

/**
 * Feed RSS 2.0, só com domínio: um feed precisa de endereços completos, e sem domínio eles seriam relativos (feed inválido). Sem
 * domínio, devolve `null` e o site não tem `novidades/feed.xml` nem link para ele.
 */
function feedRss(posts, valores) {
  const dominio = dominioDe(valores);
  if (!dominio) return null;
  const base = `https://${dominio}`;
  const caminho = (arquivo) => `${base}${caminhoLimpo(arquivo)}`;
  const itens = posts
    .map(
      (p) => `<item>
<title>${esc(p.titulo)}</title>
<link>${esc(caminho(p.arquivo))}</link>
<guid isPermaLink="true">${esc(caminho(p.arquivo))}</guid>
<pubDate>${dataRfc822(p.data)}</pubDate>
<description>${esc(p.resumo)}</description>
<category>${esc(p.autoria)}</category>
</item>`,
    )
    .join('\n');
  const ultima = posts.length ? dataRfc822(posts[0].data) : dataRfc822('2026-10-23');
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
<title>Novidades da Clarevo</title>
<link>${esc(`${base}/novidades/`)}</link>
<description>Textos curtos da Equipe Clarevo, com data e fontes.</description>
<language>pt-BR</language>
<lastBuildDate>${ultima}</lastBuildDate>
<atom:link href="${esc(`${base}/novidades/feed.xml`)}" rel="self" type="application/rss+xml"/>
${itens}
</channel>
</rss>
`;
}

/** "Como escrevemos": as regras editoriais, de `site-src/paginas/como-escrevemos.md`. */
function paginaComoEscrevemos({ valores }) {
  const arquivo = 'novidades/como-escrevemos.html';
  const origem = path.join(SITE_SRC, 'paginas', 'como-escrevemos.md');
  const { meta, corpo: md } = lerCabecalho(fs.readFileSync(origem, 'utf8'));
  const { titulo, corpo } = separarTitulo(md);
  const html = markdownParaHtml(corpo, { valores, paginaAtual: arquivo });
  const capa = `<p class="migalha"><a href="${rel(arquivo, ARQUIVO_INDICE)}">Novidades</a></p>
<h1>${esc(titulo || meta.titulo || 'Como escrevemos')}</h1>
<p class="lead">${esc(meta.lead || '')}</p>`;
  const pg = montarPagina({
    arquivo,
    titulo: meta.titulo || titulo || 'Como escrevemos',
    descricao: meta.descricao || 'As regras editoriais da Clarevo: fonte oficial ou identificada, data, revisão, sem publicidade e sem recomendar produto financeiro.',
    capa,
    corpo: colunaTexto(html, 'texto'),
    fonte: md,
    valores,
    classeCapa: 'capa-simples',
  });
  return { arquivo, ...pg };
}

/** `ctx.referencia`: a data de hoje (ou a de `--referencia`), para recusar post com data futura. */
function paginasNovidades(ctx) {
  const { posts, problemas } = lerPosts(ctx.pastaDePosts || PASTA_POSTS, { referencia: ctx.referencia });
  const paginas = [paginaIndice(posts, ctx), paginaComoEscrevemos(ctx), ...posts.map((p) => paginaDoPost(p, ctx))];
  const avisos = [...problemas, ...paginas.flatMap((p) => p.avisos || [])];
  return { paginas, posts, feed: feedRss(posts, ctx.valores), avisos };
}

module.exports = { paginasNovidades, feedRss, campoDoTema };
