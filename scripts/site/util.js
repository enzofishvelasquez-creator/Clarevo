'use strict';
/** Funções pequenas de caminho, data e HTML que as páginas usam. */
const path = require('node:path');
const { esc } = require('./texto');

/** Caminho relativo de uma página (`aprender/x.html`) até outro arquivo do site (`estilo.css`), para os links e as imagens. */
function rel(de, para) {
  // A 404 é servida em qualquer endereço que não existe, então só caminhos a partir da raiz funcionam nela.
  if (de === '404.html') return `/${para}`;
  const [alvo, ancora] = para.split('#');
  const r = path.posix.relative(path.posix.dirname(de), alvo) || path.posix.basename(alvo);
  return ancora !== undefined ? `${r}#${ancora}` : r;
}

/** A página de uma calculadora do app (`packages/core/src/calculators`), no site, e o índice delas. */
const ARQUIVO_CALCULADORAS = 'calculadoras/index.html';
const arquivoDaCalculadora = (slug) => `calculadoras/${slug}.html`;

/**
 * Endereço da calculadora visto de uma página, com os parâmetros que o app já usa nos links dos temas de Aprender (hoje só `modo`, por
 * exemplo `?modo=emprestimo`). Nada mais vai na URL.
 */
function enderecoDaCalculadora(de, slug, params = {}) {
  const consulta = Object.entries(params).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
  return `${rel(de, arquivoDaCalculadora(slug))}${consulta ? `?${consulta}` : ''}`;
}

/** Os cabeçalhos do bloco `/*` de um texto no formato do `_headers` do Cloudflare Pages: `{ nome: valor }`. */
function cabecalhosDoTexto(texto) {
  const cabecalhos = {};
  let dentro = false;
  for (const linha of texto.split('\n')) {
    if (linha.startsWith('#') || linha.trim() === '') continue;
    if (!linha.startsWith(' ')) {
      dentro = linha.trim() === '/*';
      continue;
    }
    const i = linha.indexOf(':');
    if (dentro && i > 0) cabecalhos[linha.slice(0, i).trim()] = linha.slice(i + 1).trim();
  }
  return cabecalhos;
}

/** Endereço limpo de uma página, como o Cloudflare Pages serve: `index.html` é a pasta, `x.html` é `x`. */
function caminhoLimpo(arquivo) {
  if (arquivo === 'index.html') return '/';
  if (arquivo.endsWith('/index.html')) return `/${arquivo.slice(0, -'index.html'.length)}`;
  return `/${arquivo.replace(/\.html$/, '')}`;
}

/** "AAAA-MM-DD" em "23/10/2026". */
const dataBR = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
/** "AAAA-MM-DD" em "23 de outubro de 2026". */
const dataPorExtensoIso = (iso) => `${Number(iso.slice(8, 10))} de ${MESES[Number(iso.slice(5, 7)) - 1]} de ${iso.slice(0, 4)}`;
const maiuscula = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/** Data RFC 822 de um dia, ao meio-dia em Brasília (UTC-3), para o RSS. */
function dataRfc822(iso) {
  const d = new Date(`${iso}T12:00:00-03:00`);
  const dias = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const meses = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const p = (n) => String(n).padStart(2, '0');
  return `${dias[d.getUTCDay()]}, ${p(d.getUTCDate())} ${meses[d.getUTCMonth()]} ${d.getUTCFullYear()} ${p(d.getUTCHours() - 3)}:00:00 -0300`;
}

/** Um parágrafo `<p>` por texto, já escapado. */
const paragrafos = (textos) => textos.map((t) => `<p>${esc(t)}</p>`).join('\n');

/** Texto corrido de HTML simples (sem etiquetas) para o índice da busca e os dados estruturados. */
function textoSimples(html) {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

/** JSON para dentro de `<script type="application/ld+json">`: nada que feche a etiqueta. */
const jsonSeguro = (obj) => JSON.stringify(obj).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

module.exports = { cabecalhosDoTexto, rel, ARQUIVO_CALCULADORAS, arquivoDaCalculadora, enderecoDaCalculadora, caminhoLimpo, dataBR, dataPorExtensoIso, dataRfc822, maiuscula, paragrafos, textoSimples, jsonSeguro, MESES };
