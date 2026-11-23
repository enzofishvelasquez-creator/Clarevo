'use strict';
/**
 * Notícias (D-117, `docs/22_SITE.md`, seção 18) e o resumo semanal (D-106, seção 16.5), na mesma área do site.
 *
 * `noticias/index.html` é a página de notícias de fontes públicas: a lista vem da `/api/noticias` (o worker busca os feeds configurados em
 * `packages/core/src/noticias/fontes.ts`), pelo script do próprio site `noticias/noticias.js`, que pergunta uma vez ao abrir a página. Sem
 * JavaScript, ou quando a API falha, a página mostra uma frase curta e os links para as fontes; com as rotas desligadas (sem a variável
 * NOTICIAS=ligado no painel da Cloudflare, o padrão até a resposta do advogado), "Em breve". `noticias/materia.html?id=...` mostra o texto
 * inteiro de uma notícia cuja licença permite, com a fonte, a data, a autoria, a linha de licença e "Ver a matéria original".
 *
 * O resumo semanal continua: cada edição é um arquivo de dados em `site-src/noticias/semana-AAAA-MM-DD.json` (a data da edição), com uma
 * lista de notícias, cada uma com título, um resumo de uma ou duas frases escrito pela Clarevo, o nome do veículo, a autoria, a data e o
 * link. Com edições, a página de notícias ganha "Resumos da semana" e cada edição tem a página dela.
 *
 * O formato segue os cuidados de direito autoral do estudo: crédito à fonte e à autoria, link simples para a matéria (sem imagem de outros
 * sites, sem script de terceiros), texto inteiro só quando a licença da fonte permite. Nada sobre empresas listadas, ações ou bolsa.
 */
const fs = require('node:fs');
const path = require('node:path');
const { SITE_SRC } = require('../config');
const { esc, nfc } = require('../texto');
const { rel, dataBR, dataPorExtensoIso } = require('../util');
const { montarPagina, colunaTexto } = require('../modelo');
const { dataExiste } = require('../conteudo');
const { catalogo } = require('../catalogo');

const PASTA_NOTICIAS = path.join(SITE_SRC, 'noticias');
const ARQUIVO_INDICE = 'noticias/index.html';
const ARQUIVO_MATERIA = 'noticias/materia.html';
/** O script das duas páginas de notícias: pergunta uma vez ao próprio site e mostra a lista ou a matéria. */
const SCRIPT_DAS_NOTICIAS = 'noticias/noticias.js';
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
  const capa = `<p class="migalha"><a href="${rel(arquivo, ARQUIVO_INDICE)}">Notícias</a> · ${esc(dataBR(edicao.data))}</p>
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
<p class="voltar"><a href="${rel(arquivo, `${ARQUIVO_INDICE}#resumos`)}">Ver todas as edições</a></p>`,
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

/** Os textos e as fontes das notícias, do núcleo (`packages/core/src/noticias/fontes.ts`). */
const doNucleo = () => catalogo().NOTICIAS;

/** Os links para ler direto nas fontes (sem JavaScript, com a API fora do ar ou com as notícias desligadas). */
function linksDasFontes() {
  const { fontesParaLer } = doNucleo();
  return `<ul class="fontes-para-ler" data-fontes-para-ler>
${fontesParaLer()
  .map((f) => `<li><a href="${esc(f.site)}" rel="noopener noreferrer">${esc(f.nome)}</a></li>`)
  .join('\n')}
</ul>`;
}

/** Os avisos de estado: sem JavaScript (visível de saída) e os que o script mostra. */
const estado = (nome, texto, visivel = false) => `<p class="noticias-estado" data-estado="${nome}"${visivel ? '' : ' hidden'}>${esc(texto)}</p>`;

/** O host de cada fonte de notícias (os links de texto que a página tem para elas). */
const hostsDasFontesDeNoticias = () => [...new Set(doNucleo().FONTES_NOTICIAS.map((f) => new URL(f.site).host))].sort();

function paginaIndice(edicoes, { valores }) {
  const arquivo = ARQUIVO_INDICE;
  const { NOTICIAS_TEXT: T, FONTES_NOTICIAS, licencaEfetiva } = doNucleo();
  const capa = `<h1>${esc(T.titulo)}</h1>
<p class="lead">${esc(T.lead)}</p>`;
  const lista = `<section class="noticias" aria-labelledby="ultimas" data-noticias data-endereco-materia="${esc(rel(arquivo, ARQUIVO_MATERIA))}" data-ler-aqui="${esc(T.lerAqui)}" data-ler-na-fonte="${esc(T.lerNaFonte)}">
<h2 id="ultimas">${esc(T.tituloDaLista)}</h2>
<p class="nota noticias-atualizado" data-noticias-atualizado hidden></p>
${estado('sem-js', T.semJavaScript, true)}
${estado('carregando', T.carregando)}
${estado('em-breve', T.emBreve)}
${estado('falha', T.falha)}
${estado('vazia', T.vazia)}
${linksDasFontes()}
<ol class="noticias-lista" data-noticias-lista hidden></ol>
</section>`;
  // Uma linha por fonte (as duas do Banco Central numa só), com a regra de licença em palavras simples.
  const vistas = new Map();
  for (const f of FONTES_NOTICIAS) {
    const regra = licencaEfetiva(f) === 'texto_completo' ? T.regraTextoCompleto : T.regraSoResumo;
    const linha = vistas.get(f.nome) ?? { site: f.site, regras: new Set() };
    linha.regras.add(regra);
    vistas.set(f.nome, linha);
  }
  const fontes = [...vistas]
    .map(([nome, l]) => `<li><a href="${esc(l.site)}" rel="noopener noreferrer"><strong>${esc(nome)}</strong></a>: ${esc([...l.regras].join('; '))}.</li>`)
    .join('\n');
  const deOnde = `<section aria-labelledby="de-onde">
<h2 id="de-onde">${esc(T.tituloDeOnde)}</h2>
<p>${esc(T.deOnde)}</p>
<p>${esc(T.comoLer)}</p>
<ul class="noticias-fontes">
${fontes}
</ul>
</section>`;
  const resumos = edicoes.length
    ? `<section aria-labelledby="resumos">
<h2 id="resumos">${esc(T.tituloDosResumos)}</h2>
<p>${esc(COMO_MONTAMOS)}</p>
<ul class="temas">
${edicoes
  .map(
    (e) =>
      `<li><a class="cartao" href="${rel(arquivo, e.arquivo)}"><span class="titulo-cartao">Resumo da semana: ${esc(dataPorExtensoIso(e.data))}</span><span class="tema-sub">${e.itens.length === 1 ? '1 notícia' : `${e.itens.length} notícias`}</span></a></li>`,
  )
  .join('\n')}
</ul>
</section>`
    : '';
  const corpo = colunaTexto(
    `${lista}
${deOnde}
${resumos}
<p>Os números de hoje, com data e fonte, estão em <a href="${rel(arquivo, 'indicadores/index.html')}">Indicadores oficiais</a>.</p>`.replace(/\n{2,}/g, '\n'),
    'artigo',
  );
  const pg = montarPagina({
    arquivo,
    titulo: T.titulo,
    descricao: T.descricao,
    capa,
    corpo,
    fonte: capa,
    valores,
    classeCapa: 'capa-simples',
    scripts: [SCRIPT_DAS_NOTICIAS],
    avisoDeMercado: true,
    atualizada: edicoes[0]?.data ?? null,
  });
  return { arquivo, ...pg };
}

/**
 * A página de leitura (`noticias/materia.html?id=...`): o script lê o `id` do endereço, pergunta ao próprio site e mostra o título, a data,
 * a fonte, a autoria, a linha de licença, "Ver a matéria original" e o texto filtrado. Fica fora do mapa do site e pede para não ser
 * indexada: o conteúdo é da fonte, e o endereço original é o que vale.
 */
function paginaDaMateria({ valores }) {
  const arquivo = ARQUIVO_MATERIA;
  const { NOTICIAS_TEXT: T } = doNucleo();
  const capa = `<p class="migalha"><a href="${rel(arquivo, ARQUIVO_INDICE)}">${esc(T.titulo)}</a></p>
<h1 data-materia-titulo>${esc(T.tituloDaMateria)}</h1>
<p class="lead materia-meta" data-materia-meta hidden></p>`;
  const corpo = colunaTexto(
    `<article class="materia" data-materia data-ver-original="${esc(T.verOriginal)}">
${estado('sem-js', T.materiaSemJavaScript, true)}
${estado('carregando', T.materiaCarregando)}
${estado('em-breve', T.emBreve)}
${estado('nao-encontrada', T.materiaNaoEncontrada)}
${estado('falha', T.materiaFalha)}
${linksDasFontes()}
<p class="materia-credito" data-materia-credito hidden></p>
<p class="materia-licenca" data-materia-licenca hidden></p>
<p class="materia-original" data-materia-original hidden></p>
<div class="materia-texto" data-materia-texto hidden></div>
<p class="nota" data-materia-nota hidden>${esc(T.notaDaMateria)}</p>
<p class="materia-original" data-materia-original-fim hidden></p>
</article>
<p class="voltar"><a href="${rel(arquivo, ARQUIVO_INDICE)}">${esc(T.verTodas)}</a></p>`,
    'artigo',
  );
  const pg = montarPagina({
    arquivo,
    titulo: T.tituloDaMateria,
    descricao: T.descricaoDaMateria,
    capa,
    corpo,
    fonte: capa,
    valores,
    classeCapa: 'capa-simples',
    scripts: [SCRIPT_DAS_NOTICIAS],
    avisoDeMercado: true,
    semIndexar: true,
  });
  return { arquivo, ...pg };
}

/** As páginas de notícias: a lista e a página de leitura sempre (prontas; as rotas é que ligam), e uma página por edição do resumo semanal. */
function paginasNoticias(edicoes, ctx) {
  return [paginaIndice(edicoes, ctx), paginaDaMateria(ctx), ...edicoes.map((e) => paginaDaEdicao(e, ctx))];
}

module.exports = { paginasNoticias, lerEdicoes, hostsDasEdicoes, hostsDasFontesDeNoticias, PASTA_NOTICIAS, TEMAS_DO_RESUMO, ARQUIVO_INDICE, ARQUIVO_MATERIA, SCRIPT_DAS_NOTICIAS };
