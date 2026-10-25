'use strict';
/**
 * Novidades: posts em Markdown (`site-src/novidades/AAAA-MM-DD-slug.md`, com título, data, resumo, autoria e fontes), o índice, uma
 * página por post, o feed RSS e "Como escrevemos". Só fatos que já existem no repositório: nada de notícia externa. Um post pode
 * trazer texto do catálogo de Aprender com a linha `{{tema:SLUG:CAMPO}}` (CAMPO: titulo, subtitulo, short, p1 a p5, exemplo,
 * hipoteses), para a mesma frase nunca existir em dois lugares.
 */
const fs = require('node:fs');
const path = require('node:path');
const { esc, markdownParaHtml, separarTitulo } = require('../texto');
const { rel, dataPorExtensoIso, dataRfc822, caminhoLimpo } = require('../util');
const { montarPagina, colunaTexto, bloco, dominioDe, urlDoSite } = require('../modelo');
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
      itens.push(`<li><a href="${rel(post.arquivo, arquivoDoTema(t.slug))}">Aprender: ${esc(t.title)}</a><span class="fonte-meta">${esc(c.TEXTO.reviewedOn(t.reviewedOn))}. As fontes do tema:</span></li>`);
      for (const s of t.sources) itens.push(fonteHtml(s, null));
    } else if (f.tipo === 'link') {
      if (/^https:\/\//.test(f.destino)) itens.push(`<li><a href="${esc(f.destino)}" rel="noopener noreferrer">${esc(f.rotulo)}</a></li>`);
      else if (/^[a-z]+:/i.test(f.destino)) problemas.push(`${post.origem}: a fonte "${f.rotulo}" tem um endereço que não é https nem uma página do site`);
      else itens.push(`<li><a href="${rel(post.arquivo, f.destino)}">${esc(f.rotulo)}</a></li>`);
    } else itens.push(`<li>${esc(f.rotulo)}</li>`);
  }
  return { itens, problemas };
}

function paginaDoPost(post, { valores }) {
  const arquivo = post.arquivo;
  const { html: corpoHtml, faltas } = expandirDiretivas(markdownParaHtml(post.corpo, { valores, paginaAtual: arquivo }), post.origem);
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
<p><a href="${rel(arquivo, ARQUIVO_INDICE)}">Voltar para Novidades</a></p>`,
    'texto',
  );
  const capa = `<p class="migalha"><a href="${rel(arquivo, ARQUIVO_INDICE)}">Novidades</a></p>
<h1>${esc(post.titulo)}</h1>
<p class="lead">${esc(post.resumo)}</p>
<p class="meta-tema"><time datetime="${post.data}">${esc(dataPorExtensoIso(post.data))}</time> · ${esc(post.autoria)}</p>`;
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
    descricao: post.resumo,
    capa,
    corpo,
    fonte: post.corpo + capa,
    valores,
    classeCapa: 'capa-simples',
    tipoOg: 'article',
    jsonld: [artigo],
    cabecalho: linkDoFeed(arquivo, valores),
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
