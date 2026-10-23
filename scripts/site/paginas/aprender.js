'use strict';
/**
 * Aprender: uma página por tema PUBLICADO do catálogo do app (`packages/core/src/learn`, seções organizar, juros e tempo; não legado),
 * o índice por seção e a Agenda financeira, que vem do calendário de época do catálogo. O texto de cada página é o do catálogo, lido
 * do core: nada é copiado à mão. As seções "usar" e "dúvidas" do catálogo vão para a Ajuda.
 */
const { esc } = require('../texto');
const { rel, maiuscula } = require('../util');
const { montarPagina, colunaTexto, bloco, dominioDe, urlDoSite } = require('../modelo');
const { catalogo } = require('../catalogo');
const { AUTORIA_PADRAO } = require('../config');

/** As seções do catálogo que viram páginas de Aprender, na ordem do app. */
const SECOES_DO_SITE = ['organizar', 'juros', 'tempo'];

const arquivoDoTema = (slug) => `aprender/${slug}.html`;

/** Um tema do catálogo cabe no site? Publicado, não legado e de uma das três seções. */
const temasDoSite = () => catalogo().publicados.filter((t) => SECOES_DO_SITE.includes(t.section));

const linhaDeLeitura = (t) => {
  const c = catalogo();
  return `${c.minutosDeLeitura(t)} min de leitura · ${c.TEXTO.reviewedOn(t.reviewedOn)}`;
};

/** Uma fonte do catálogo como item de lista: link para a página oficial (só texto, sem carregar nada) e a data de consulta. */
function fonteHtml(s, idDoItem) {
  const c = catalogo();
  const linha = esc(c.TEXTO.sourceLine(s));
  const idAttr = idDoItem ? ` id="${idDoItem}"` : '';
  if (s.kind === 'oficial' || s.kind === 'mercado') {
    const meta = [s.kind === 'mercado' ? c.TEXTO.marketLabel : null, s.consultedOn ? c.TEXTO.consultedOn(s.consultedOn) : null].filter(Boolean);
    return `<li${idAttr}><a href="${esc(s.url)}" rel="noopener noreferrer">${linha}</a>${meta.length ? `<span class="fonte-meta">${esc(meta.join(' · '))}</span>` : ''}</li>`;
  }
  if (s.kind === 'obra') return `<li${idAttr}>${linha}${s.consultedOn ? `<span class="fonte-meta">${esc(c.TEXTO.consultedOn(s.consultedOn))}</span>` : ''}</li>`;
  return `<li${idAttr}>${linha}<span class="fonte-meta">Decisões do projeto Clarevo, sem link</span></li>`;
}

/** As fontes de um tema (lista numerada na ordem do catálogo, que é a que os "fatos" citam). */
const fontesHtml = (t, prefixo = 'fonte') => `<ol class="fontes">\n${t.sources.map((s, i) => fonteHtml(s, `${prefixo}-${i + 1}`)).join('\n')}\n</ol>`;

function cartaoDoTema(arquivo, t) {
  return `<li><a class="cartao" href="${rel(arquivo, arquivoDoTema(t.slug))}"><span class="titulo-cartao">${esc(t.title)}</span>${t.subtitle ? `<span class="tema-sub">${esc(t.subtitle)}</span>` : ''}<span class="tema-meta">${esc(linhaDeLeitura(t))}</span></a></li>`;
}

function paginaIndice({ valores }) {
  const arquivo = 'aprender/index.html';
  const c = catalogo();
  const secoes = SECOES_DO_SITE.map((id) => {
    const s = c.SECOES.find((x) => x.id === id);
    const temas = c.publicados.filter((t) => t.section === id);
    return bloco(
      `<h2 id="${id}">${esc(s.title)}</h2>
<p class="lead-bloco">${esc(s.description)}</p>
<ul class="temas">
${temas.map((t) => cartaoDoTema(arquivo, t)).join('\n')}
</ul>`,
      { variante: id === 'juros' ? 'alt' : '', rotulo: id },
    );
  });
  const rodape = bloco(
    `<div class="aviso-edu"><p>${esc(c.TEXTO.footer)}</p></div>
<p>Dúvidas sobre como usar o app? Veja a <a href="${rel(arquivo, 'ajuda/index.html')}">Ajuda</a>.</p>`,
    { rotulo: null },
  );
  const capa = `<h1>Aprender</h1>
<p class="lead">Educação financeira em textos curtos, com exemplo calculado, fonte e data de revisão. É o conteúdo que está no app. O site não registra o que você lê.</p>
<div class="acoes">
<a class="botao botao-principal" href="${rel(arquivo, 'aprender/agenda.html')}">Agenda financeira</a>
<a class="botao botao-suave" href="${rel(arquivo, 'novidades/como-escrevemos.html')}">Como escrevemos</a>
</div>`;
  const pg = montarPagina({
    arquivo,
    titulo: 'Aprender',
    descricao: 'Educação financeira em textos curtos: organizar o mês, juros e crédito, inflação e Selic, cada tema com exemplo calculado, fontes e data de revisão.',
    capa,
    corpo: [...secoes, rodape].join('\n'),
    fonte: capa,
    valores,
    classeCapa: 'capa-simples',
  });
  return { arquivo, ...pg };
}

function paginaDoTema(t, { valores }) {
  const c = catalogo();
  const arquivo = arquivoDoTema(t.slug);
  const secao = c.SECOES.find((s) => s.id === t.section);
  const relacionados = c.relacionados(t.slug).filter((r) => SECOES_DO_SITE.includes(r.section));
  const calc = c.calculadora(t.slug);
  const linhasDaConta = t.calculation ? t.calculation.split(' · ').map((l) => l.trim()).filter(Boolean) : [];

  const exemplo = t.example
    ? `<section class="exemplo" aria-labelledby="exemplo">
<h2 id="exemplo">${esc(c.TEXTO.example)}</h2>
<p>${esc(t.example)}</p>${linhasDaConta.length ? `\n<details class="conta"><summary>${esc(c.TEXTO.showCalculation)}</summary><ol>${linhasDaConta.map((l) => `<li>${esc(l)}</li>`).join('')}</ol></details>` : ''}
</section>`
    : '';
  const hipoteses = t.hypotheses
    ? `<section class="hipoteses" aria-labelledby="hipoteses"><h2 id="hipoteses">${esc(c.TEXTO.hypotheses)}</h2><p>${esc(t.hypotheses)}</p></section>`
    : '';
  const fatos = t.facts.length
    ? `<section class="fatos" aria-labelledby="fatos"><h2 id="fatos">Números e regras citados</h2><ul>${t.facts.map((f) => `<li>${esc(f.text)} <a href="#fonte-${f.source + 1}">Fonte ${f.source + 1}</a></li>`).join('')}</ul></section>`
    : '';
  const noApp = calc
    ? `<p class="no-app">No app, você faz a conta com os seus números em ${esc(c.CALC_UI.learnCardTitle)}: ${esc(calc.titulo)}.</p>`
    : '';
  const rel_ = relacionados.length
    ? `<h2 id="relacionados">${esc(c.TEXTO.related)}</h2>
<ul class="temas">
${relacionados.map((r) => cartaoDoTema(arquivo, r)).join('\n')}
</ul>`
    : '';
  const revisao = [`${c.TEXTO.reviewedOn(t.reviewedOn)}.`, t.reviewEveryMonths ? `Revisamos este tema a cada ${t.reviewEveryMonths} meses.` : null].filter(Boolean).join(' ');

  const corpo = colunaTexto(
    `<p class="resposta-curta">${esc(t.short)}</p>
${t.paragraphs.map((p) => `<p>${esc(p)}</p>`).join('\n')}
${exemplo}
${hipoteses}
${fatos}
${noApp}
${rel_}
<h2 id="fontes">${esc(c.TEXTO.sources)}</h2>
${fontesHtml(t)}
<p class="revisao">${esc(revisao)}</p>
<div class="aviso-edu"><p>${esc(c.TEXTO.disclaimer)}</p></div>
<p><a href="${rel(arquivo, 'aprender/index.html')}">Voltar para Aprender</a></p>`,
    'artigo',
  );
  const capa = `<p class="migalha"><a href="${rel(arquivo, 'aprender/index.html')}">Aprender</a> · ${esc(secao.title)}</p>
<h1>${esc(t.title)}</h1>
${t.subtitle ? `<p class="lead">${esc(t.subtitle)}</p>` : ''}
<p class="meta-tema">${esc(linhaDeLeitura(t))}</p>`;

  const dominio = dominioDe(valores);
  const artigo = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: t.title,
    description: t.short,
    dateModified: t.reviewedOn,
    inLanguage: 'pt-BR',
    author: { '@type': 'Organization', name: AUTORIA_PADRAO },
    publisher: { '@type': 'Organization', name: 'Clarevo' },
    ...(dominio ? { mainEntityOfPage: urlDoSite(valores, arquivo), image: `https://${dominio}/og/clarevo.png` } : {}),
  };
  const pg = montarPagina({
    arquivo,
    titulo: t.title,
    descricao: t.short.length <= 160 ? t.short : `${t.short.slice(0, 157).replace(/\s+\S*$/, '')}...`,
    capa,
    corpo,
    fonte: capa,
    valores,
    classeCapa: 'capa-simples',
    tipoOg: 'article',
    jsonld: [artigo],
  });
  return { arquivo, ...pg };
}

/** Os publishers das fontes oficiais de um tema, sem repetir. */
const publicadoresOficiais = (t) => [...new Set(t.sources.filter((s) => s.kind === 'oficial').map((s) => s.publisher))];

function paginaAgenda({ valores }) {
  const arquivo = 'aprender/agenda.html';
  const c = catalogo();
  const meses = c.CALENDARIO.map((m) => {
    const temas = m.slugs.map((slug) => c.tema(slug)).filter(Boolean);
    const nome = maiuscula(c.nomeDoMes(m.month));
    const lista = temas.length
      ? `<ul>${temas
          .map(
            (t) =>
              `<li><a href="${rel(arquivo, arquivoDoTema(t.slug))}"><strong>${esc(t.title)}</strong></a><span class="tema-sub">${esc(t.short)}</span><span class="tema-meta">${esc(c.TEXTO.reviewedOn(t.reviewedOn))}${publicadoresOficiais(t).length ? ` · Fontes oficiais: ${esc(publicadoresOficiais(t).join(', '))}` : ''}</span></li>`,
          )
          .join('')}</ul>`
      : `<p class="nota">Sem tema de época neste mês. Veja todos os temas em <a href="${rel(arquivo, 'aprender/index.html')}">Aprender</a>.</p>`;
    return `<section class="mes" aria-labelledby="mes-${m.month}"><h2 id="mes-${m.month}">${esc(nome)}</h2>${lista}</section>`;
  });
  const capa = `<h1>Agenda financeira</h1>
<p class="lead">Os temas de Aprender que costumam fazer diferença em cada mês do ano, como 13º salário, férias, volta às aulas e Imposto de Renda. É o mesmo calendário do card "Neste mês" do app.</p>`;
  const corpo = [
    bloco(
      `<div class="meses">
${meses.join('\n')}
</div>`,
      { rotulo: null },
    ),
    bloco(
      `<div class="aviso-edu"><p>O que depende do ano, como o prazo do Imposto de Renda e as datas e condições do IPVA e do IPTU de cada estado e município, deve ser conferido na fonte oficial do ano. Cada tema traz o link da fonte. ${esc(c.TEXTO.disclaimer)}</p></div>`,
      { variante: 'azul', rotulo: null },
    ),
  ].join('\n');
  const pg = montarPagina({
    arquivo,
    titulo: 'Agenda financeira',
    descricao: 'Mês a mês, os temas de educação financeira que costumam importar: 13º salário, férias, volta às aulas, Imposto de Renda e as contas do começo do ano.',
    capa,
    corpo,
    fonte: capa,
    valores,
    classeCapa: 'capa-simples',
  });
  return { arquivo, ...pg };
}

/** Todas as páginas de Aprender: índice, agenda e um tema por página. */
function paginasAprender(ctx) {
  return [paginaIndice(ctx), paginaAgenda(ctx), ...temasDoSite().map((t) => paginaDoTema(t, ctx))];
}

module.exports = { paginasAprender, temasDoSite, arquivoDoTema, fontesHtml, fonteHtml, SECOES_DO_SITE };
