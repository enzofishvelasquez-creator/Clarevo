'use strict';
/** O que o gerador confere nas páginas: links internos, marcas de rascunho e títulos. O `--final` recusa o que sobrar. */
const path = require('node:path');
const { problemasDeTitulos } = require('./texto');

/** Todo endereço relativo (`href` e `src`) de uma página, e se o arquivo e a âncora existem entre os arquivos gerados. */
function linksQuebrados(arquivos) {
  const problemas = [];
  const paginas = [...arquivos.keys()].filter((k) => k.endsWith('.html'));
  const idsDe = (html) => new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  for (const nome of paginas) {
    const html = String(arquivos.get(nome));
    for (const m of html.matchAll(/\s(?:href|src)="([^"]*)"/g)) {
      const url = m[1].replace(/&amp;/g, '&');
      if (/^[a-z][a-z0-9+.-]*:/i.test(url)) continue;
      // O endereço pode trazer parâmetros (`?modo=emprestimo`, como nos temas de Aprender): o arquivo é o que vem antes.
      const [semAncora, ancora] = url.split('#');
      const alvo = semAncora.split('?')[0];
      let destino = alvo === '' ? nome : alvo.startsWith('/') ? path.posix.normalize(alvo.slice(1)) : path.posix.normalize(path.posix.join(path.posix.dirname(nome), alvo));
      if (destino === '.' || destino === '' || destino.endsWith('/')) destino = `${destino === '.' ? '' : destino}index.html`;
      if (!arquivos.has(destino)) {
        problemas.push(`${nome}: "${url}" aponta para um arquivo que não existe`);
        continue;
      }
      if (ancora && destino.endsWith('.html') && !idsDe(String(arquivos.get(destino))).has(ancora)) problemas.push(`${nome}: "${url}" aponta para uma âncora que não existe`);
    }
  }
  return problemas;
}

/**
 * O que ainda marca um texto como rascunho, além dos marcadores. No modo normal só vira aviso; o `--final` recusa. Os padrões de
 * proposta cobrem o texto corrido ("Proposta: ...") que o advogado precisa resolver; a marca padrão de proposta é `[PROPOSTA: ...]`,
 * tratada como os outros marcadores.
 */
const MARCAS_DE_RASCUNHO = [
  { re: /Rascunho preparado pela equipe da Clarevo/i, motivo: 'frase de rascunho ("Rascunho preparado pela equipe da Clarevo para revisão jurídica. Não é parecer jurídico.")', visivel: true },
  { re: /\b[Pp]ropostas?\s*:/, motivo: 'texto de proposta ("Proposta:")', visivel: true },
  { re: /propostas?,?\s+ainda\s+sem\s+confirma/i, motivo: 'texto de proposta ("proposta, ainda sem confirmação")', visivel: true },
  { re: /[\u2013\u2014]/, motivo: 'travessão (a redação do produto não usa)', visivel: false },
  { re: /faz\w*\s+sentido/i, motivo: 'expressão proibida pela orientação do projeto', visivel: false },
];

/** O texto que a pessoa lê (sem etiquetas, estilo, script nem título do navegador), com espaços simples. */
function textoVisivel(html) {
  return html
    .replace(/<(style|title|script)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');
}

/** Problemas de uma página que o `--final` não aceita: marcas de rascunho e de proposta, travessão e título fora de ordem. */
function problemasFinaisDaPagina(nome, html) {
  const problemas = [];
  const visivel = textoVisivel(html);
  for (const { re, motivo, visivel: soVisivel } of MARCAS_DE_RASCUNHO) {
    const alvo = soVisivel ? visivel : html;
    const m = re.exec(alvo);
    if (m) {
      const trecho = alvo.slice(Math.max(0, m.index - 20), m.index + m[0].length + 30).replace(/\s+/g, ' ').trim();
      problemas.push(`${nome}: ${motivo}, em "...${trecho}..."`);
    }
  }
  for (const problema of problemasDeTitulos(html)) problemas.push(`${nome}: ${problema}`);
  return problemas;
}

module.exports = { linksQuebrados, MARCAS_DE_RASCUNHO, textoVisivel, problemasFinaisDaPagina };
