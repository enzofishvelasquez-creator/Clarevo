'use strict';
/**
 * Ajuda: a central de dúvidas, por tema, gerada de três fontes: as perguntas do suporte (`site-src/ajuda/perguntas.md`), as seções
 * "Usar o Clarevo" e "Dúvidas frequentes" do catálogo de Aprender e o guia de uso do app (`packages/core/src/guide`). A busca roda no
 * próprio navegador: um índice JSON gerado (`ajuda/indice.json`) e um script pequeno (`ajuda/busca.js`), sem enviar nada a ninguém.
 * Sem JavaScript, a lista completa continua visível.
 */
const path = require('node:path');
const { esc, markdownParaHtml } = require('../texto');
const { rel, textoSimples } = require('../util');
const { montarPagina, colunaTexto, bloco } = require('../modelo');
const { catalogo } = require('../catalogo');
const { lerPerguntas } = require('../conteudo');
const { SITE_SRC } = require('../config');
const { arquivoDoTema, SECOES_DO_SITE, REGRA_DO_CLAREVO } = require('./aprender');

/**
 * Os temas da Ajuda e o que vai em cada um. `guias`: ids do guia de uso do app; `topicos`: slugs do catálogo (seções "usar" e "dúvidas").
 * Toda entrada do guia e todo tema dessas duas seções precisa estar em exatamente um tema: o gerador recusa o que sobrar ou repetir, para
 * uma função nova do app nunca ficar fora da Ajuda sem aviso.
 */
const TEMAS = [
  {
    id: 'comecar',
    titulo: 'Começar',
    descricao: 'O que a Clarevo é, o que o Resumo mostra e como ler cada número.',
    guias: ['resumo', 'seu-mes', 'aprender', 'ajuda'],
    topicos: ['diferenca', 'realizado-previsto', 'saldo', 'demonstracao', 'o-que-a-clarevo-nao-faz'],
  },
  {
    id: 'organizar',
    titulo: 'Anotar e organizar',
    descricao: 'Anotar gastos e recebimentos, ler notas, importar extratos, orçamento, metas, simulador e calculadoras.',
    guias: ['anotar-gasto', 'nota-fiscal', 'movimentos', 'buscar', 'importar-extrato', 'ultimos-meses', 'evolucao', 'analises', 'orcamento', 'renda-comprometida', 'metas', 'plano-de-guardar', 'simulador', 'calculadoras', 'antes-de-financiar', 'plano-dividas'],
    topicos: ['sem-registro', 'contei-duas-vezes', 'voltei-depois'],
  },
  {
    id: 'contas',
    titulo: 'Contas e cartões',
    descricao: 'Contas a pagar, gastos fixos, parcelamentos, contas do ano, assinaturas, cartões e faturas.',
    guias: ['contas-a-pagar', 'vencidas', 'gastos-fixos', 'contas-do-ano', 'assinaturas', 'cartoes', 'contas-de-origem'],
    topicos: ['fatura', 'gasto-fixo', 'estimativa', 'parcelamentos', 'marcar-como-paga'],
  },
  {
    id: 'familia',
    titulo: 'Família',
    descricao: 'Criar a Família, convidar por link, papéis, sair e encerrar.',
    guias: ['familia'],
    topicos: [],
  },
  {
    id: 'beneficio',
    titulo: 'Benefício da empresa',
    descricao: 'Aceitar o convite da empresa, o que a empresa vê e o painel de quem administra o benefício.',
    guias: ['beneficio-da-empresa', 'painel-da-empresa'],
    topicos: ['empresa-ve'],
  },
  {
    id: 'privacidade',
    titulo: 'Privacidade e segurança',
    descricao: 'Quem vê os seus dados, ocultar valores, biometria e onde os dados ficam.',
    guias: ['quem-ve', 'ocultar-valores'],
    topicos: ['quem-ve-meus-dados'],
  },
  {
    id: 'conta',
    titulo: 'Conta e acesso',
    descricao: 'Senha, lembretes, exportar os seus dados e excluir a conta.',
    guias: ['lembretes', 'exportar', 'excluir-conta'],
    topicos: [],
  },
];

const arquivoDoTemaDaAjuda = (id) => `ajuda/${id}.html`;

/** O tema da Ajuda que tem a entrada do guia (usado pela página O app). */
function temaDoGuia(idDoGuia) {
  const t = TEMAS.find((x) => x.guias.includes(idDoGuia));
  if (!t) throw new Error(`a entrada "${idDoGuia}" do guia não está em nenhum tema da Ajuda`);
  return t.id;
}

/** Confere que cada entrada do guia e cada tema de "usar" e "dúvidas" está em um só tema da Ajuda. */
function conferirCobertura() {
  const c = catalogo();
  const problemas = [];
  const guias = new Map();
  const topicos = new Map();
  for (const t of TEMAS) {
    for (const g of t.guias) guias.set(g, (guias.get(g) || 0) + 1);
    for (const s of t.topicos) topicos.set(s, (topicos.get(s) || 0) + 1);
  }
  for (const e of c.GUIA) if (!guias.has(e.id)) problemas.push(`a entrada "${e.id}" do guia do app não está em nenhum tema da Ajuda (scripts/site/paginas/ajuda.js, TEMAS)`);
  for (const [g, n] of guias) {
    if (!c.GUIA.some((e) => e.id === g)) problemas.push(`o tema da Ajuda cita a entrada "${g}", que não existe no guia do app`);
    if (n > 1) problemas.push(`a entrada "${g}" do guia está em mais de um tema da Ajuda`);
  }
  const deAjuda = c.publicados.filter((t) => ['usar', 'duvidas'].includes(t.section));
  for (const t of deAjuda) if (!topicos.has(t.slug)) problemas.push(`o tema "${t.slug}" do catálogo (${t.section}) não está em nenhum tema da Ajuda`);
  for (const [s, n] of topicos) {
    if (!deAjuda.some((t) => t.slug === s)) problemas.push(`o tema da Ajuda cita "${s}", que não é um tema publicado de "usar" ou "dúvidas"`);
    if (n > 1) problemas.push(`o tema "${s}" está em mais de um tema da Ajuda`);
  }
  return problemas;
}

/** Onde mora um tema do catálogo: página de Aprender ou resposta da Ajuda. */
function destinoDoTopico(slug, deArquivo) {
  const c = catalogo();
  const t = c.tema(slug);
  if (!t) return null;
  if (SECOES_DO_SITE.includes(t.section)) return { href: rel(deArquivo, arquivoDoTema(slug)), titulo: t.title };
  const tema = TEMAS.find((x) => x.topicos.includes(slug));
  return tema ? { href: rel(deArquivo, `${arquivoDoTemaDaAjuda(tema.id)}#tema-${slug}`), titulo: t.title } : null;
}

/**
 * O corpo de uma resposta que vem do catálogo, com tudo o que o app mostra no tema: resumo, parágrafos, exemplo com "Ver a conta",
 * hipóteses (também quando não há exemplo), os números e regras citados e a fonte. A fonte do tipo `clarevo` aparece só como
 * "Regra do próprio Clarevo", sem os códigos internos, como em Aprender.
 */
function htmlDoTopico(topico, rels) {
  const c = catalogo();
  const linhasDaConta = topico.calculation ? topico.calculation.split(' · ').map((l) => l.trim()).filter(Boolean) : [];
  const conta = linhasDaConta.length
    ? `\n<details class="conta"><summary>${esc(c.TEXTO.showCalculation)}</summary><ol>${linhasDaConta.map((l) => `<li>${esc(l)}</li>`).join('')}</ol></details>`
    : '';
  const hipoteses = topico.hypotheses ? `<p class="nota"><strong>${esc(c.TEXTO.hypotheses)}.</strong> ${esc(topico.hypotheses)}</p>` : '';
  const exemplo = topico.example
    ? `<div class="exemplo"><p><strong>${esc(c.TEXTO.example)}.</strong> ${esc(topico.example)}</p>${conta}${hipoteses ? `\n${hipoteses}` : ''}</div>`
    : hipoteses || conta
      ? `<div class="exemplo">${hipoteses}${conta}</div>`
      : '';
  const fatos = topico.facts.length ? `<p class="pequeno"><strong>Números e regras citados:</strong> ${topico.facts.map((f) => esc(f.text)).join('; ')}.</p>` : '';
  const fontes = [...new Set(topico.sources.map((f) => (f.kind === 'clarevo' ? REGRA_DO_CLAREVO : c.TEXTO.sourceLine(f))))];
  const fonte = `${esc(c.TEXTO.reviewedOn(topico.reviewedOn))}. ${fontes.length === 1 ? 'Fonte' : 'Fontes'}: ${esc(fontes.join('; '))}.`;
  return `<p class="resposta-curta">${esc(topico.short)}</p>
${topico.paragraphs.map((p) => `<p>${esc(p)}</p>`).join('\n')}
${exemplo}
${fatos}
${rels.length ? `<p class="pequeno">Veja também: ${rels.map((r) => `<a href="${r.href}">${esc(r.titulo)}</a>`).join(', ')}.</p>` : ''}
<p class="revisao">${fonte}</p>`;
}

/** Todas as respostas da Ajuda, por tema: `{ id, grupo, pergunta, html, texto, palavras }`. */
function montarRespostas(valores) {
  const c = catalogo();
  const porTema = new Map(TEMAS.map((t) => [t.id, []]));
  const perguntas = lerPerguntas(path.join(SITE_SRC, 'ajuda', 'perguntas.md'));
  for (const p of perguntas) {
    if (!porTema.has(p.tema)) throw new Error(`site-src/ajuda/perguntas.md: a pergunta "${p.pergunta}" tem o tema "${p.tema}", que não existe`);
    if (!p.id) throw new Error(`site-src/ajuda/perguntas.md: a pergunta "${p.pergunta}" precisa de "- id:"`);
    const arquivo = arquivoDoTemaDaAjuda(p.tema);
    const html = markdownParaHtml(p.resposta, { valores, paginaAtual: arquivo });
    porTema.get(p.tema).push({ id: `p-${p.id}`, grupo: 'rapidas', pergunta: p.pergunta, html, palavras: '', md: p.resposta });
  }
  for (const t of TEMAS) {
    const arquivo = arquivoDoTemaDaAjuda(t.id);
    for (const slug of t.topicos) {
      const topico = c.tema(slug);
      if (!topico) continue;
      const rels = c.relacionados(slug).map((r) => destinoDoTopico(r.slug, arquivo)).filter(Boolean);
      const html = htmlDoTopico(topico, rels);
      porTema.get(t.id).push({ id: `tema-${slug}`, grupo: 'rapidas', pergunta: topico.title, html, palavras: topico.keywords.join(' ') });
    }
    for (const id of t.guias) {
      const e = c.GUIA.find((x) => x.id === id);
      if (!e) continue;
      const onde = c.guiaPasso(e.where);
      const tambem = (e.alsoWhere || []).map((w) => c.guiaPasso(w));
      const html = `<p>${esc(e.purpose)}</p>
<p class="onde"><strong>Onde fica:</strong> ${esc(onde)}${tambem.length ? `. Também em ${esc(tambem.join('; '))}` : ''}</p>
<ol>${e.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>${e.lines && e.lines.length ? `\n<ul>${e.lines.map((l) => `<li><strong>${esc(l.title)}.</strong> ${esc(l.caption)}</li>`).join('')}</ul>` : ''}`;
      porTema.get(t.id).push({ id: `guia-${id}`, grupo: 'guias', pergunta: `Como usar: ${e.title}`, html, palavras: e.keywords.join(' ') });
    }
  }
  return porTema;
}

const BUSCA = (arquivo) => `<div class="busca" role="search" data-busca data-indice="indice.json" hidden>
<label for="busca-campo">Buscar na Ajuda</label>
<input id="busca-campo" type="search" autocomplete="off" spellcheck="false" aria-controls="resultados" aria-describedby="busca-estado" placeholder="Por exemplo: senha, fatura, Família">
<p class="busca-estado" id="busca-estado" role="status" aria-live="polite"></p>
<ol class="resultados" id="resultados" aria-label="Resultados da busca"></ol>
</div>`;

const navTemas = (arquivo, atualId) =>
  `<ul class="nav-temas">${TEMAS.map((t) => `<li><a href="${rel(arquivo, arquivoDoTemaDaAjuda(t.id))}"${t.id === atualId ? ' aria-current="page"' : ''}>${esc(t.titulo)}</a></li>`).join('')}</ul>`;

function paginaDoTema(t, respostas, { valores }) {
  const arquivo = arquivoDoTemaDaAjuda(t.id);
  const rapidas = respostas.filter((r) => r.grupo === 'rapidas');
  const guias = respostas.filter((r) => r.grupo === 'guias');
  const itemHtml = (r) => `<article class="pergunta" id="${r.id}"><h3>${esc(r.pergunta)}</h3>\n${r.html}\n</article>`;
  const corpoRaw = `${navTemas(arquivo, t.id)}
${BUSCA(arquivo)}
<div data-some-na-busca>
${rapidas.length ? `<h2 id="respostas">Respostas rápidas</h2>\n${rapidas.map(itemHtml).join('\n')}` : ''}
${guias.length ? `<h2 id="passo-a-passo">Como usar, passo a passo</h2>\n${guias.map(itemHtml).join('\n')}` : ''}
</div>
<p class="nota">Não achou? Veja a página de <a href="${rel(arquivo, 'suporte.html')}">Suporte</a>.</p>`;
  const capa = `<p class="migalha"><a href="${rel(arquivo, 'ajuda/index.html')}">Ajuda</a></p>
<h1>${esc(t.titulo)}</h1>
<p class="lead">${esc(t.descricao)}</p>`;
  const faq = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: respostas.map((r) => ({ '@type': 'Question', name: r.pergunta, acceptedAnswer: { '@type': 'Answer', text: textoSimples(r.html) } })),
  };
  const pg = montarPagina({
    arquivo,
    titulo: `${t.titulo}: Ajuda`,
    descricao: t.descricao,
    capa,
    corpo: colunaTexto(corpoRaw, 'texto texto-largo'),
    fonte: respostas.map((r) => r.md || '').join('\n') + capa,
    valores,
    classeCapa: 'capa-simples',
    jsonld: [faq],
    scripts: ['ajuda/busca.js'],
  });
  return { arquivo, ...pg };
}

function paginaIndice(porTema, { valores }) {
  const arquivo = 'ajuda/index.html';
  const cartoes = TEMAS.map((t) => {
    const n = porTema.get(t.id).length;
    return `<a class="cartao" href="${rel(arquivo, arquivoDoTemaDaAjuda(t.id))}"><span class="titulo-cartao">${esc(t.titulo)}</span><p>${esc(t.descricao)}</p><p class="tema-meta">${n} ${n === 1 ? 'resposta' : 'respostas'}</p></a>`;
  }).join('\n');
  const comuns = [...porTema.values()].flat().filter((r) => r.id.startsWith('p-'));
  const linkDe = (r) => {
    const tema = TEMAS.find((t) => porTema.get(t.id).includes(r));
    return `<li><a href="${rel(arquivo, `${arquivoDoTemaDaAjuda(tema.id)}#${r.id}`)}">${esc(r.pergunta)}</a></li>`;
  };
  const corpo = [
    bloco(
      `${BUSCA(arquivo)}
<div data-some-na-busca>
<h2 id="temas">Temas</h2>
<div class="ajuda-temas">
${cartoes}
</div>
</div>`,
      { rotulo: null },
    ),
    bloco(
      `<div data-some-na-busca>
<h2 id="comuns">Perguntas mais comuns</h2>
<ul>
${comuns.map(linkDe).join('\n')}
</ul>
<p>Não achou o que procurava? Veja a página de <a href="${rel(arquivo, 'suporte.html')}">Suporte</a>.</p>
</div>`,
      { variante: 'alt', rotulo: null },
    ),
  ];
  const capa = `<h1>Ajuda</h1>
<p class="lead">Respostas por tema sobre como usar o app da Clarevo, com o passo a passo de cada função. A busca funciona no seu navegador e não envia o que você digita.</p>`;
  const pg = montarPagina({
    arquivo,
    titulo: 'Ajuda',
    descricao: 'Central de dúvidas da Clarevo: respostas por tema, passo a passo de cada função e busca no próprio navegador.',
    capa,
    corpo: corpo.join('\n'),
    fonte: capa,
    valores,
    classeCapa: 'capa-simples',
    scripts: ['ajuda/busca.js'],
  });
  return { arquivo, ...pg };
}

/** O índice da busca: uma linha por resposta, com o texto simples para comparar. */
function indiceDaBusca(porTema) {
  const itens = [];
  for (const t of TEMAS) {
    for (const r of porTema.get(t.id)) {
      itens.push({ i: r.id, t: r.pergunta, a: t.titulo, u: `${t.id}.html#${r.id}`, k: r.palavras, x: textoSimples(r.html).slice(0, 1600) });
    }
  }
  return itens;
}

const BUSCA_JS = `/* Busca da Ajuda: roda só neste navegador. Lê ajuda/indice.json (gerado pelo site) e não envia nada a ninguém. */
(function () {
  'use strict';
  var caixa = document.querySelector('[data-busca]');
  if (!caixa || !window.fetch) return;
  var campo = caixa.querySelector('input');
  var estado = caixa.querySelector('.busca-estado');
  var lista = caixa.querySelector('.resultados');
  var escondidos = document.querySelectorAll('[data-some-na-busca]');
  var indice = null;

  function norma(s) {
    return String(s).toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g, '');
  }
  function mostrarLista(buscando) {
    for (var i = 0; i < escondidos.length; i++) escondidos[i].hidden = buscando;
  }
  function buscar() {
    var consulta = norma(campo.value).trim();
    lista.textContent = '';
    if (!consulta) {
      estado.textContent = '';
      mostrarLista(false);
      return;
    }
    var termos = consulta.split(/\\s+/);
    var achados = [];
    for (var i = 0; i < indice.length; i++) {
      var item = indice[i];
      var titulo = norma(item.t);
      var resto = norma(item.k + ' ' + item.x);
      var pontos = 0;
      var todos = true;
      for (var j = 0; j < termos.length; j++) {
        if (titulo.indexOf(termos[j]) >= 0) pontos += 3;
        else if (resto.indexOf(termos[j]) >= 0) pontos += 1;
        else { todos = false; break; }
      }
      if (todos) achados.push({ item: item, pontos: pontos });
    }
    achados.sort(function (a, b) { return b.pontos - a.pontos; });
    achados = achados.slice(0, 20);
    mostrarLista(true);
    estado.textContent = achados.length === 0 ? 'Nenhuma resposta para "' + campo.value.trim() + '". Tente outra palavra.' : (achados.length === 1 ? '1 resposta' : achados.length + ' respostas') + ' para "' + campo.value.trim() + '".';
    for (var k = 0; k < achados.length; k++) {
      var li = document.createElement('li');
      var a = document.createElement('a');
      a.href = achados[k].item.u;
      a.textContent = achados[k].item.t;
      var tema = document.createElement('small');
      tema.textContent = achados[k].item.a;
      a.appendChild(tema);
      li.appendChild(a);
      lista.appendChild(li);
    }
  }
  fetch(caixa.getAttribute('data-indice'))
    .then(function (r) { if (!r.ok) throw new Error('índice'); return r.json(); })
    .then(function (dados) {
      indice = dados;
      caixa.hidden = false;
      campo.addEventListener('input', buscar);
    })
    .catch(function () { /* sem índice, a lista completa continua na página */ });
})();
`;

/** Todas as páginas e arquivos da Ajuda. */
function paginasAjuda(ctx) {
  const porTema = montarRespostas(ctx.valores);
  const paginas = [paginaIndice(porTema, ctx), ...TEMAS.map((t) => paginaDoTema(t, porTema.get(t.id), ctx))];
  return { paginas, indice: indiceDaBusca(porTema), script: BUSCA_JS };
}

module.exports = { paginasAjuda, temaDoGuia, conferirCobertura, TEMAS };
