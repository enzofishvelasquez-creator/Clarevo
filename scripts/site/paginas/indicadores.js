'use strict';
/**
 * Indicadores oficiais e páginas de mercado (D-106, `docs/22_SITE.md`, seção 16): o painel (`indicadores/index.html`), uma página por
 * indicador ("Selic hoje", "CDI hoje", "IPCA em 12 meses", "Rendimento da poupança hoje" e "Dólar PTAX hoje"), o glossário e as duas
 * explicações permanentes ("O que muda quando a Selic muda" e "Como ler o IPCA").
 *
 * Os números vêm do retrato gravado na geração (`scripts/site/indicadores.js`): a página funciona sem JavaScript e quando a consulta
 * falha. Com JavaScript, `indicadores/painel.js` pergunta UMA vez ao próprio site (`/api/indicadores`, no worker) e troca os números e a
 * hora, sem perguntar de novo. Os textos, os códigos das séries e as contas são do núcleo (`packages/core/src/indicadores`). Cada página
 * leva no rodapé "Conteúdo educativo. Não é recomendação nem análise de valores mobiliários." Sem título, empresa, opinião, previsão,
 * ranking nem "melhores", e sem calendário do Copom: só o link para a página oficial do Banco Central.
 */
const { esc } = require('../texto');
const { rel, arquivoDaCalculadora, descricaoCurta } = require('../util');
const { montarPagina, colunaTexto } = require('../modelo');
const { catalogo } = require('../catalogo');
const { cartaoDoTema, fontesHtml } = require('./aprender');

const PASTA = 'indicadores';
const ARQUIVO_PAINEL = `${PASTA}/index.html`;
const ARQUIVO_GLOSSARIO = `${PASTA}/glossario.html`;
const SCRIPT_DO_PAINEL = `${PASTA}/painel.js`;
const arquivoDoIndicador = (id) => `${PASTA}/${catalogo().MERCADO.paginaDoIndicador(id).slug}.html`;
const arquivoDaExplicacao = (slug) => `${PASTA}/${slug}.html`;

/** Os campos que o script troca, pelo atributo `data-campo`, dentro de um elemento com `data-indicador`. */
function camposDoNumero(exib, { comExtra = true } = {}) {
  return {
    numero: `<span data-campo="numero">${esc(exib.numero)}</span>`,
    unidade: `<span class="indicador-unidade" data-campo="unidade">${esc(exib.unidade)}</span>`,
    data: `<span data-campo="data">${esc(exib.data)}</span>`,
    extra: comExtra ? `<span class="tema-sub" data-campo="extra"${exib.extra ? '' : ' hidden'}>${esc(exib.extra ?? '')}</span>` : '',
  };
}

/** A linha da hora e da fonte: "Retrato de 17/11/2026 às 13:12, horário de Brasília. Fonte: Banco Central do Brasil." */
function linhaDaHora(retrato) {
  const T = catalogo().INDICADORES.INDICADORES_TEXT;
  const hora = retrato.consultadoEm ? T.retrato(retrato.consultadoEm) : T.semRetrato;
  return `<span data-campo="hora">${esc(hora)}</span> ${esc(T.fonte)}`;
}

/** O cartão de um indicador no painel: nome, número, unidade e data, com link para a página dele. */
function cartaoDoIndicador(arquivo, id, retrato) {
  const exib = catalogo().INDICADORES.exibirIndicador(id, retrato.valores[id]);
  const f = camposDoNumero(exib);
  return `<li><a class="cartao indicador" href="${rel(arquivo, arquivoDoIndicador(id))}" data-indicador="${id}"><span class="titulo-cartao">${esc(exib.nome)}</span><span class="indicador-numero">${f.numero} ${f.unidade}</span><span class="tema-meta">${f.data}</span>${f.extra}</a></li>`;
}

/** Um link para outra página de mercado, no formato dos cartões de Aprender. */
const cartaoDeLink = (href, titulo, sub) => `<li><a class="cartao" href="${href}"><span class="titulo-cartao">${esc(titulo)}</span><span class="tema-sub">${esc(sub)}</span></a></li>`;

/** O cartão de uma calculadora (do app ou só do site). */
function cartaoDaCalculadora(arquivo, slug) {
  const info = catalogo().calculadoraPorSlug(slug);
  if (!info) throw new Error(`páginas de mercado: a calculadora "${slug}" não existe`);
  return cartaoDeLink(rel(arquivo, arquivoDaCalculadora(slug)), info.title, `${info.subtitle}. A conta é feita no seu navegador.`);
}

/** Os temas de Aprender de uma lista de slugs (só os que viram página no site). */
function temasDoSite(slugs) {
  const c = catalogo();
  return slugs.map((s) => {
    const t = c.tema(s);
    if (!t) throw new Error(`páginas de mercado: o tema de Aprender "${s}" não está publicado no site`);
    return t;
  });
}

const revisao = () => {
  const m = catalogo().MERCADO;
  return `${catalogo().TEXTO.reviewedOn(m.INDICADORES_REVIEWED_ON)}. Revisamos esta página a cada ${m.INDICADORES_REVIEW_EVERY_MONTHS} meses.`;
};

/** As explicações e o glossário, para os blocos "Para entender". */
function cartoesParaEntender(arquivo) {
  const m = catalogo().MERCADO;
  return [
    cartaoDeLink(rel(arquivo, ARQUIVO_GLOSSARIO), 'Glossário', 'CDI, IPCA, Selic, FGC, come-cotas, marcação a mercado e outros termos'),
    ...m.explicacoesDeMercado().map((e) => cartaoDeLink(rel(arquivo, arquivoDaExplicacao(e.slug)), e.titulo, e.subtitulo.replace(/\.$/, ''))),
  ];
}

/** O link para a página oficial do Copom (a única coisa sobre as reuniões: nada de datas no site). */
function linkDoCopom() {
  const copom = catalogo().MERCADO.FONTES_INDICADORES.copom;
  return `<a href="${esc(copom.url)}" rel="noopener noreferrer">página oficial do Copom, no site do Banco Central</a>`;
}

function paginaDoPainel({ valores, retrato, resumoSemanal }) {
  const arquivo = ARQUIVO_PAINEL;
  const c = catalogo();
  const { INDICADOR_IDS, INDICADORES_TEXT: T, SGS_INDICADORES } = c.INDICADORES;
  const capa = `<h1>${esc(T.tituloPainel)}</h1>
<p class="lead">Selic, CDI, IPCA, poupança e dólar PTAX, com a data de cada número e a fonte: o Banco Central do Brasil. Para entender cada um, e o que ele muda na sua vida, abra o cartão.</p>`;
  const numeros = `<section class="bloco" aria-labelledby="numeros" data-painel data-consultado="${esc(retrato.consultadoEm ?? '')}">
<div class="miolo">
<h2 id="numeros">Os números</h2>
<p class="indicadores-estado">${linhaDaHora(retrato)}</p>
<ul class="temas">
${INDICADOR_IDS.map((id) => cartaoDoIndicador(arquivo, id, retrato)).join('\n')}
</ul>
</div>
</section>`;
  const series = INDICADOR_IDS.map((id) => `<li><a href="${rel(arquivo, arquivoDoIndicador(id))}">${esc(T.nomes[id])}</a>: série ${SGS_INDICADORES[id]}.</li>`).join('\n');
  const origem = `<section class="bloco bloco-alt" aria-labelledby="origem">
<div class="miolo">
<h2 id="origem">De onde vêm os números</h2>
<div class="texto">
<p>${esc(T.naoAoVivo)}</p>
<p>${esc(T.comoAtualiza)}</p>
<p>As séries são do Sistema Gerenciador de Séries Temporais (SGS) do Banco Central, publicadas no <a href="${esc(c.MERCADO.FONTES_INDICADORES.dadosAbertos.url)}" rel="noopener noreferrer">Portal de Dados Abertos do Banco Central</a>:</p>
<ul>
${series}
</ul>
<p>As datas das reuniões do Comitê de Política Monetária, que decide a meta da Selic, e as decisões ficam na ${linkDoCopom()}.</p>
</div>
</div>
</section>`;
  const entender = [...cartoesParaEntender(arquivo), ...(resumoSemanal ? [cartaoDeLink(rel(arquivo, 'noticias/index.html'), 'Resumo semanal', 'As notícias da semana sobre Copom, IPCA, Tesouro, FGC e Imposto de Renda, com link para cada fonte')] : [])];
  const paraEntender = `<section class="bloco" aria-labelledby="entender">
<div class="miolo">
<h2 id="entender">Para entender</h2>
<ul class="temas">
${entender.join('\n')}
</ul>
</div>
</section>`;
  const pg = montarPagina({
    arquivo,
    titulo: T.tituloPainel,
    descricao: 'Selic, CDI, IPCA em 12 meses, rendimento da poupança e dólar PTAX, com a data de cada número. Fonte: Banco Central do Brasil.',
    capa,
    corpo: [numeros, origem, paraEntender].join('\n'),
    fonte: capa,
    valores,
    classeCapa: 'capa-simples',
    scripts: [SCRIPT_DO_PAINEL],
    avisoDeMercado: true,
  });
  return { arquivo, ...pg };
}

function paginaDoIndicador(p, { valores, retrato }) {
  const arquivo = arquivoDoIndicador(p.id);
  const c = catalogo();
  const { INDICADOR_IDS, INDICADORES_TEXT: T, exibirIndicador } = c.INDICADORES;
  const exib = exibirIndicador(p.id, retrato.valores[p.id]);
  const f = camposDoNumero(exib);
  const capa = `<p class="migalha"><a href="${rel(arquivo, ARQUIVO_PAINEL)}">${esc(T.tituloPainel)}</a> · ${esc(exib.nome)}</p>
<h1>${esc(p.titulo)}</h1>
<p class="lead">${esc(p.subtitulo)}</p>
<div class="indicador-capa" data-painel data-consultado="${esc(retrato.consultadoEm ?? '')}" data-indicador="${p.id}">
<p class="indicador-capa-numero">${f.numero} ${f.unidade}</p>
<p class="meta-tema">${f.data}${f.extra ? ` ${f.extra}` : ''}</p>
<p class="meta-tema">${linhaDaHora(retrato)}</p>
</div>`;
  const temas = temasDoSite(p.temas);
  const calculadoras = p.calculadoras.length
    ? `<h2 id="calculadoras">Faça a conta</h2>
<ul class="temas">
${p.calculadoras.map((s) => cartaoDaCalculadora(arquivo, s)).join('\n')}
</ul>`
    : '';
  const outros = INDICADOR_IDS.filter((id) => id !== p.id).map((id) => {
    const o = c.MERCADO.paginaDoIndicador(id);
    return cartaoDeLink(rel(arquivo, arquivoDoIndicador(id)), o.titulo, o.subtitulo.replace(/\.$/, ''));
  });
  const corpo = colunaTexto(
    `<h2 id="o-que-e">O que é</h2>
${p.oQueE.map((t) => `<p>${esc(t)}</p>`).join('\n')}
<h2 id="o-que-muda">O que muda na sua vida</h2>
${p.oQueMuda.map((s) => `<h3>${esc(s.titulo)}</h3>\n<p>${esc(s.texto)}</p>`).join('\n')}
<h2 id="de-onde-vem">De onde vem o número</h2>
<p>${esc(p.origem)}</p>
<p>${esc(T.naoAoVivo)} ${esc(T.comoAtualiza)}</p>
${p.id === 'selic' ? `<p>As datas das reuniões do Copom e as decisões ficam na ${linkDoCopom()}.</p>\n` : ''}<h2 id="aprender">Para entender melhor</h2>
<ul class="temas">
${[...temas.map((t) => cartaoDoTema(arquivo, t)), ...cartoesParaEntender(arquivo)].join('\n')}
</ul>
${calculadoras}
<h2 id="outros">Outros indicadores</h2>
<ul class="temas">
${outros.join('\n')}
</ul>
<h2 id="fontes">${esc(c.TEXTO.sources)}</h2>
${fontesHtml({ sources: p.fontes })}
<p class="revisao">${esc(revisao())}</p>
<p class="voltar"><a href="${rel(arquivo, ARQUIVO_PAINEL)}">Voltar para ${esc(T.tituloPainel)}</a></p>`,
    'artigo',
  );
  // A descrição traz o número do retrato, quando há: é o que as buscas mostram.
  const descricao = retrato.valores[p.id]
    ? descricaoCurta(`${p.titulo}: ${exib.numero} ${exib.unidade}. ${exib.data}. ${T.fonte}`)
    : descricaoCurta(`${p.titulo}: ${p.subtitulo.charAt(0).toLowerCase()}${p.subtitulo.slice(1)}`);
  const pg = montarPagina({ arquivo, titulo: p.titulo, descricao, capa, corpo, fonte: capa, valores, classeCapa: 'capa-simples', scripts: [SCRIPT_DO_PAINEL], avisoDeMercado: true });
  return { arquivo, ...pg };
}

function paginaDoGlossario({ valores }) {
  const arquivo = ARQUIVO_GLOSSARIO;
  const c = catalogo();
  const m = c.MERCADO;
  const capa = `<p class="migalha"><a href="${rel(arquivo, ARQUIVO_PAINEL)}">${esc(c.INDICADORES.INDICADORES_TEXT.tituloPainel)}</a> · Glossário</p>
<h1>Glossário</h1>
<p class="lead">Os termos que aparecem nos indicadores, nas aplicações e no Imposto de Renda, em poucas palavras. Cada um leva aos temas de Aprender que explicam mais, com fonte e data de revisão.</p>`;
  const indice = `<ul class="nav-temas" aria-label="Termos">${m.GLOSSARIO.map((t) => `<li><a href="#${t.id}">${esc(t.termo)}</a></li>`).join('')}</ul>`;
  const termos = m.GLOSSARIO.map((t) => {
    const links = [
      ...temasDoSite(t.temas).map((tema) => `<a href="${rel(arquivo, `aprender/${tema.slug}.html`)}">${esc(tema.title)}</a>`),
      ...(t.indicador ? [`<a href="${rel(arquivo, arquivoDoIndicador(t.indicador))}">${esc(m.paginaDoIndicador(t.indicador).titulo)}</a>`] : []),
    ];
    const fontes = t.fontes.map((s) => `<a href="${esc(s.url)}" rel="noopener noreferrer">${esc(c.TEXTO.sourceLine(s))}</a>`);
    return `<section class="termo" aria-labelledby="${t.id}">
<h2 id="${t.id}">${esc(t.termo)}</h2>
<p>${esc(t.definicao)}</p>
${links.length ? `<p class="termo-links">Para entender mais: ${links.join(' · ')}</p>\n` : ''}${fontes.length ? `<p class="fonte-meta">Fonte: ${fontes.join(' · ')}</p>\n` : ''}</section>`;
  }).join('\n');
  const corpo = colunaTexto(
    `${indice}
${termos}
<p class="revisao">${esc(revisao())}</p>
<p class="voltar"><a href="${rel(arquivo, ARQUIVO_PAINEL)}">Voltar para ${esc(c.INDICADORES.INDICADORES_TEXT.tituloPainel)}</a></p>`,
    'artigo',
  );
  const pg = montarPagina({
    arquivo,
    titulo: 'Glossário de finanças',
    descricao: 'CDI, IPCA, Selic, FGC, come-cotas, marcação a mercado, liquidez, IR regressivo, IOF e PTAX, em poucas palavras, com link para os temas de Aprender.',
    capa,
    corpo,
    fonte: capa,
    valores,
    classeCapa: 'capa-simples',
    avisoDeMercado: true,
  });
  return { arquivo, ...pg };
}

function paginaDaExplicacao(e, { valores }) {
  const arquivo = arquivoDaExplicacao(e.slug);
  const c = catalogo();
  const { INDICADORES_TEXT: T } = c.INDICADORES;
  const capa = `<p class="migalha"><a href="${rel(arquivo, ARQUIVO_PAINEL)}">${esc(T.tituloPainel)}</a> · Explicação</p>
<h1>${esc(e.titulo)}</h1>
<p class="lead">${esc(e.subtitulo)}</p>
<p class="meta-tema">${esc(c.TEXTO.reviewedOn(c.MERCADO.INDICADORES_REVIEWED_ON))}</p>`;
  const exemplo = `<section class="exemplo" aria-labelledby="exemplo">
<h2 id="exemplo">${esc(c.TEXTO.example)}</h2>
<p>${esc(e.exemplo.texto)}</p>
<details class="conta"><summary>${esc(c.TEXTO.showCalculation)}</summary><ol>${e.exemplo.conta.map((l) => `<li>${esc(l)}</li>`).join('')}</ol></details>
</section>
<section class="hipoteses" aria-labelledby="hipoteses"><h2 id="hipoteses">${esc(c.TEXTO.hypotheses)}</h2><p>${esc(e.exemplo.hipoteses)}</p></section>`;
  const numeros = e.indicadores.map((id) => {
    const p = c.MERCADO.paginaDoIndicador(id);
    return cartaoDeLink(rel(arquivo, arquivoDoIndicador(id)), p.titulo, p.subtitulo.replace(/\.$/, ''));
  });
  const corpo = colunaTexto(
    `<p class="resposta-curta">${esc(e.resumo)}</p>
${e.secoes.map((s, i) => `<h2 id="secao-${i + 1}">${esc(s.titulo)}</h2>\n${s.paragrafos.map((t) => `<p>${esc(t)}</p>`).join('\n')}`).join('\n')}
${e.slug === 'quando-a-selic-muda' ? `<p>As datas das reuniões e as decisões ficam na ${linkDoCopom()}.</p>\n` : ''}${exemplo}
<h2 id="numeros">Os números de hoje</h2>
<ul class="temas">
${numeros.join('\n')}
</ul>
<h2 id="aprender">Para entender melhor</h2>
<ul class="temas">
${temasDoSite(e.temas).map((t) => cartaoDoTema(arquivo, t)).join('\n')}
</ul>
<h2 id="fontes">${esc(c.TEXTO.sources)}</h2>
${fontesHtml({ sources: e.fontes })}
<p class="revisao">${esc(revisao())}</p>
<p class="voltar"><a href="${rel(arquivo, ARQUIVO_PAINEL)}">Voltar para ${esc(T.tituloPainel)}</a></p>`,
    'artigo',
  );
  const pg = montarPagina({
    arquivo,
    titulo: e.titulo,
    descricao: descricaoCurta(e.resumo),
    capa,
    corpo,
    fonte: capa,
    valores,
    classeCapa: 'capa-simples',
    tipoOg: 'article',
    avisoDeMercado: true,
    atualizada: c.MERCADO.INDICADORES_REVIEWED_ON,
  });
  return { arquivo, ...pg };
}

/** Todas as páginas de mercado: o painel, uma por indicador, o glossário e as duas explicações. */
function paginasIndicadores(ctx) {
  const m = catalogo().MERCADO;
  return [paginaDoPainel(ctx), ...m.PAGINAS_INDICADORES.map((p) => paginaDoIndicador(p, ctx)), paginaDoGlossario(ctx), ...m.explicacoesDeMercado().map((e) => paginaDaExplicacao(e, ctx))];
}

module.exports = { paginasIndicadores, ARQUIVO_PAINEL, ARQUIVO_GLOSSARIO, SCRIPT_DO_PAINEL, arquivoDoIndicador, arquivoDaExplicacao };
