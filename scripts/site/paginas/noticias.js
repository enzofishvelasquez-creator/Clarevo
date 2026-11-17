'use strict';
/**
 * Resumo semanal de notícias (D-106, `docs/22_SITE.md`, seção 16.5): só a estrutura. Cada edição é um arquivo de dados em
 * `site-src/noticias/semana-AAAA-MM-DD.json` (a data da edição), com uma lista de notícias, cada uma com título, um resumo de uma ou
 * duas frases escrito pela Clarevo, o nome do veículo, a autoria, a data e o link. Sem edição nenhuma, nenhuma página existe e nada
 * aparece no rodapé nem no mapa do site.
 *
 * O formato segue os cuidados de direito autoral do estudo: título e resumo com palavras da Clarevo, crédito ao veículo e à autoria,
 * link simples para a matéria (sem imagem de outros sites, sem script de terceiros, sem copiar o texto). Temas permitidos: Copom, IPCA,
 * regras do Tesouro, FGC e prazos do Imposto de Renda; nada sobre empresas listadas (o gerador recusa código de ação e índice de bolsa).
 */
const fs = require('node:fs');
const path = require('node:path');
const { SITE_SRC } = require('../config');
const { esc, nfc } = require('../texto');
const { rel, dataBR, dataPorExtensoIso } = require('../util');
const { montarPagina, colunaTexto } = require('../modelo');
const { dataExiste } = require('../conteudo');

const PASTA_NOTICIAS = path.join(SITE_SRC, 'noticias');
const ARQUIVO_INDICE = 'noticias/index.html';
const EDICAO = /^semana-(\d{4}-\d{2}-\d{2})\.json$/;
const arquivoDaEdicao = (data) => `noticias/semana-${data}.html`;

/** Os temas permitidos, com o rótulo que a página mostra. */
const TEMAS_DO_RESUMO = {
  copom: 'Copom e Selic',
  ipca: 'IPCA e inflação',
  tesouro: 'Regras do Tesouro Direto',
  fgc: 'FGC',
  'imposto-de-renda': 'Prazos do Imposto de Renda',
};
const CAMPOS = ['titulo', 'resumo', 'veiculo', 'autor', 'data', 'link', 'tema'];
const TAMANHOS = { titulo: 160, resumo: 320, veiculo: 80, autor: 120 };

/** O que não pode aparecer: código de ação (PETR4, VALE3), índice de bolsa, conselho de compra e venda, travessão e a expressão proibida. */
const PROIBIDOS = [
  { re: /\b[A-Z]{4}\d{1,2}\b/, motivo: 'código de ação' },
  { re: /\b(Ibovespa|IFIX|índice da bolsa)\b/i, motivo: 'índice de bolsa (nada sobre empresas listadas)' },
  { re: /\b(compre|venda já|vale a pena (comprar|investir)|recomendamos|recomendação de compra|preço-alvo|melhores (ações|investimentos|fundos))\b/i, motivo: 'conselho de compra, venda ou "melhores"' },
  { re: /[–—]/, motivo: 'travessão' },
  { re: /faz\w*\s+sentido/i, motivo: 'expressão proibida pela orientação do projeto' },
];

/** Frases de um texto (termina em ponto, interrogação ou exclamação seguidos de espaço ou do fim). */
const frases = (t) => (t.trim().match(/[^.!?]+[.!?]+(?=\s|$)/g) ?? [t]).length;

/** Dias entre duas datas "AAAA-MM-DD". */
const diasEntre = (de, ate) => Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / 86_400_000);

/**
 * Lê as edições da pasta (padrão: `site-src/noticias`), da mais nova para a mais antiga, e a lista de problemas (sem `--final`, avisos;
 * com `--final`, recusa): nome fora do padrão, JSON ilegível, data inválida ou depois da referência, edição vazia, campo faltando ou
 * grande demais, resumo com mais de duas frases, link que não é https, tema fora da lista, data da notícia fora da semana da edição e
 * conteúdo proibido. Uma edição com problema não vira página.
 */
function lerEdicoes(pasta = PASTA_NOTICIAS, { referencia } = {}) {
  const edicoes = [];
  const problemas = [];
  if (!fs.existsSync(pasta)) return { edicoes, problemas };
  for (const nome of fs.readdirSync(pasta).sort()) {
    if (!nome.endsWith('.json')) continue;
    const onde = `site-src/noticias/${nome}`;
    const m = EDICAO.exec(nome);
    if (!m) {
      problemas.push(`${onde}: o nome precisa ser semana-AAAA-MM-DD.json (a data da edição)`);
      continue;
    }
    const data = m[1];
    const erros = [];
    if (!dataExiste(data)) erros.push(`a data ${data} não existe`);
    else if (referencia && data > referencia) erros.push(`a data ${data} é depois da data de referência ${referencia}`);
    let json;
    try {
      json = JSON.parse(nfc(fs.readFileSync(path.join(pasta, nome), 'utf8')));
    } catch (e) {
      problemas.push(`${onde}: não é um JSON válido (${e.message})`);
      continue;
    }
    const itens = Array.isArray(json?.itens) ? json.itens : null;
    if (!itens || itens.length === 0) erros.push('a edição precisa de "itens" com pelo menos uma notícia');
    const lidos = [];
    for (const [i, item] of (itens ?? []).entries()) {
      const n = `notícia ${i + 1}`;
      if (typeof item !== 'object' || item === null) {
        erros.push(`${n}: não é um objeto`);
        continue;
      }
      const faltam = CAMPOS.filter((c) => typeof item[c] !== 'string' || item[c].trim() === '');
      if (faltam.length) {
        erros.push(`${n}: falta ${faltam.join(', ')}`);
        continue;
      }
      const v = Object.fromEntries(CAMPOS.map((c) => [c, item[c].trim()]));
      for (const [campo, max] of Object.entries(TAMANHOS)) if (v[campo].length > max) erros.push(`${n}: "${campo}" passa de ${max} caracteres`);
      if (frases(v.resumo) > 2) erros.push(`${n}: o resumo tem mais de duas frases`);
      if (!/^https:\/\/[^\s/]+\.[^\s/]+/.test(v.link)) erros.push(`${n}: o link precisa começar com https://`);
      if (!Object.prototype.hasOwnProperty.call(TEMAS_DO_RESUMO, v.tema)) erros.push(`${n}: o tema "${v.tema}" não é um dos permitidos (${Object.keys(TEMAS_DO_RESUMO).join(', ')})`);
      if (!dataExiste(v.data)) erros.push(`${n}: a data ${v.data} não existe`);
      else if (dataExiste(data) && (v.data > data || diasEntre(v.data, data) > 6)) erros.push(`${n}: a data ${v.data} não é da semana da edição (de ${dataBR(new Date(Date.parse(`${data}T00:00:00Z`) - 6 * 86_400_000).toISOString().slice(0, 10))} a ${dataBR(data)})`);
      for (const { re, motivo } of PROIBIDOS) for (const campo of ['titulo', 'resumo']) if (re.test(v[campo])) erros.push(`${n}: ${motivo} em "${campo}"`);
      lidos.push(v);
    }
    if (erros.length) problemas.push(...erros.map((e) => `${onde}: ${e}`));
    else edicoes.push({ data, arquivo: arquivoDaEdicao(data), itens: lidos });
  }
  edicoes.sort((a, b) => b.data.localeCompare(a.data));
  return { edicoes, problemas };
}

/** O host de cada link das edições (os links de texto que o site passa a ter). */
const hostsDasEdicoes = (edicoes) => [...new Set(edicoes.flatMap((e) => e.itens.map((i) => new URL(i.link).host)))].sort();

const COMO_MONTAMOS =
  'Cada notícia tem um título e um resumo escritos pela Clarevo, com o nome do veículo, a autoria, a data e o link para a matéria original. Os temas são só Copom, IPCA, regras do Tesouro Direto, FGC e prazos do Imposto de Renda: nada sobre empresas listadas, nada de previsão e nenhuma recomendação. Para ler a notícia completa, abra o link: o texto é do veículo.';

function paginaDaEdicao(edicao, { valores }) {
  const arquivo = edicao.arquivo;
  const capa = `<p class="migalha"><a href="${rel(arquivo, ARQUIVO_INDICE)}">Resumo semanal</a> · ${esc(dataBR(edicao.data))}</p>
<h1>Resumo da semana: ${esc(dataPorExtensoIso(edicao.data))}</h1>
<p class="lead">As notícias da semana sobre juros, inflação e regras de aplicações, em poucas palavras, com link para cada fonte.</p>`;
  const itens = edicao.itens
    .map(
      (n, i) => `<article class="noticia" aria-labelledby="noticia-${i + 1}">
<h2 id="noticia-${i + 1}">${esc(n.titulo)}</h2>
<p>${esc(n.resumo)}</p>
<p class="noticia-fonte">${esc(TEMAS_DO_RESUMO[n.tema])} · ${esc(dataBR(n.data))} · ${esc(n.veiculo)}, por ${esc(n.autor)}. <a href="${esc(n.link)}" rel="noopener noreferrer">Ler a matéria completa no site de ${esc(n.veiculo)}</a></p>
</article>`,
    )
    .join('\n');
  const corpo = colunaTexto(
    `${itens}
<p class="nota">${esc(COMO_MONTAMOS)}</p>
<p class="voltar"><a href="${rel(arquivo, ARQUIVO_INDICE)}">Ver todas as edições</a></p>`,
    'artigo',
  );
  const pg = montarPagina({
    arquivo,
    titulo: `Resumo da semana de ${dataBR(edicao.data)}`,
    descricao: `As notícias da semana até ${dataBR(edicao.data)} sobre Copom, IPCA, Tesouro, FGC e Imposto de Renda, com resumo próprio e link para cada fonte.`,
    capa,
    corpo,
    fonte: capa,
    valores,
    classeCapa: 'capa-simples',
    avisoDeMercado: true,
    atualizada: edicao.data,
  });
  return { arquivo, ...pg };
}

function paginaIndice(edicoes, { valores }) {
  const arquivo = ARQUIVO_INDICE;
  const capa = `<h1>Resumo semanal</h1>
<p class="lead">As notícias da semana sobre Copom, IPCA, regras do Tesouro Direto, FGC e prazos do Imposto de Renda, com um resumo escrito pela Clarevo e o link para cada fonte.</p>`;
  const lista = edicoes
    .map(
      (e) =>
        `<li><a class="cartao" href="${rel(arquivo, e.arquivo)}"><span class="titulo-cartao">Resumo da semana: ${esc(dataPorExtensoIso(e.data))}</span><span class="tema-sub">${e.itens.length === 1 ? '1 notícia' : `${e.itens.length} notícias`}</span></a></li>`,
    )
    .join('\n');
  const corpo = colunaTexto(
    `<ul class="temas">
${lista}
</ul>
<p class="nota">${esc(COMO_MONTAMOS)}</p>
<p>Os números de hoje, com data e fonte, estão em <a href="${rel(arquivo, 'indicadores/index.html')}">Indicadores oficiais</a>.</p>`,
    'artigo',
  );
  const pg = montarPagina({
    arquivo,
    titulo: 'Resumo semanal de notícias',
    descricao: 'As notícias da semana sobre Copom, IPCA, Tesouro, FGC e Imposto de Renda, com resumo próprio da Clarevo e link para cada fonte.',
    capa,
    corpo,
    fonte: capa,
    valores,
    classeCapa: 'capa-simples',
    avisoDeMercado: true,
    atualizada: edicoes[0]?.data ?? null,
  });
  return { arquivo, ...pg };
}

/** As páginas do resumo semanal: nenhuma sem edição; com edições, o índice e uma página por edição. */
function paginasNoticias(edicoes, ctx) {
  if (edicoes.length === 0) return [];
  return [paginaIndice(edicoes, ctx), ...edicoes.map((e) => paginaDaEdicao(e, ctx))];
}

module.exports = { paginasNoticias, lerEdicoes, hostsDasEdicoes, PASTA_NOTICIAS, TEMAS_DO_RESUMO, ARQUIVO_INDICE };
