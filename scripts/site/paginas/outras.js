'use strict';
/** Sobre, Suporte (a página de contato que as lojas citam), as páginas legais (de `docs/legal`) e a 404. */
const path = require('node:path');
const { PAGINAS_LEGAIS, MAPA_LINKS_SITE, SITE_SRC } = require('../config');
const { esc, emLinha, contexto, markdownParaHtml, separarTitulo, textoPuro } = require('../texto');
const { rel } = require('../util');
const { montarPagina, marcadoresEmHtml, colunaTexto, bloco } = require('../modelo');
const { TEMAS } = require('./ajuda');
const { lerPerguntas } = require('../conteudo');

function paginaSobre({ valores }) {
  const arquivo = 'sobre.html';
  const u = (d) => rel(arquivo, d);
  const capa = `<h1>Sobre o Clarevo</h1>
<p class="lead">O que move o Clarevo e quem está por trás dele.</p>`;
  const brutas = [
    bloco(
      `<h2 id="move">O que move o Clarevo</h2>
<div class="grade">
<article class="cartao">
<h3>Clareza</h3>
<p>Cada número do app vem com a explicação de onde sai. O que você recebeu, o que já pagou e o que ainda vai vencer ficam separados, e a diferença do mês nunca é apresentada como saldo.</p>
</article>
<article class="cartao">
<h3>Sem anúncio</h3>
<p>Não há anúncios no app nem neste site, e o Clarevo não ganha nada por mostrar um produto ou uma empresa a você.</p>
</article>
<article class="cartao">
<h3>Sem venda de dados</h3>
<p>Não vendemos nem compartilhamos dados para publicidade. O que você anota é seu, e você exclui a conta quando quiser.</p>
</article>
<article class="cartao">
<h3>Sem recomendar produtos</h3>
<p>Não indicamos banco, cartão, investimento nem crédito. O conteúdo de Aprender é educativo e geral, com fonte e data de revisão.</p>
</article>
</div>`,
      { rotulo: 'move' },
    ),
    bloco(
      `<h2 id="como">Como pensamos o produto</h2>
<ul>
<li>O app mostra o que você ou as pessoas da sua Família anotaram ou importaram. Ele não se conecta ao banco e não movimenta dinheiro.</li>
<li>A privacidade vale no banco de dados, e não só na tela: quem pode ver cada dado é decidido a cada leitura.</li>
<li>Uma empresa pode oferecer o Clarevo como benefício sem ver as finanças de ninguém. <a href="${u('empresas/index.html')}">Veja como</a>.</li>
<li>Escrevemos de forma simples, com fonte e data, e corrigimos no próprio texto. <a href="${u('novidades/como-escrevemos.html')}">Veja como escrevemos</a>.</li>
</ul>`,
      { variante: 'alt', rotulo: 'como' },
    ),
    bloco(
      `<h2 id="quem">Quem está por trás</h2>
<p>O Clarevo é oferecido por [RAZÃO SOCIAL], CNPJ [CNPJ], com sede em [ENDEREÇO].</p>
<p>Para falar com a equipe, escreva para [E-MAIL DE CONTATO]. Para ajuda com o app, veja a <a href="${u('ajuda/index.html')}">Ajuda</a> e o <a href="${u('suporte.html')}">Suporte</a>. Os dados pessoais são tratados como descreve a <a href="${u('privacidade.html')}">Política de privacidade</a>.</p>`,
      { rotulo: 'quem' },
    ),
  ];
  return montarPagina({
    arquivo,
    titulo: 'Sobre',
    descricao: 'O que move o Clarevo: clareza, sem anúncio, sem venda de dados e sem recomendar produtos financeiros, e quem está por trás.',
    capa,
    corpo: brutas.map((b) => marcadoresEmHtml(b, valores)).join('\n'),
    fonte: brutas.join('\n') + capa,
    valores,
    classeCapa: 'capa-simples',
  });
}

function paginaSuporte({ valores }) {
  const arquivo = 'suporte.html';
  const u = (d) => rel(arquivo, d);
  const perguntas = lerPerguntas(path.join(SITE_SRC, 'ajuda', 'perguntas.md'));
  const links = perguntas
    .map((p) => {
      const tema = TEMAS.find((t) => t.id === p.tema);
      return `<li><a href="${u(`ajuda/${tema.id}.html#p-${p.id}`)}">${esc(p.pergunta)}</a></li>`;
    })
    .join('\n');
  const brutas = `<section class="secao" aria-labelledby="contato">
<h2 id="contato">Como falar com o suporte</h2>
<ul>
<li>Suporte do app: [E-MAIL DE SUPORTE]</li>
<li>Dúvidas sobre dados pessoais (acesso, correção e exclusão): [E-MAIL DE PRIVACIDADE]</li>
<li>Responsável pelo Clarevo: [RAZÃO SOCIAL], CNPJ [CNPJ]</li>
<li>Endereço: [ENDEREÇO]</li>
</ul>
<p>Para facilitar a resposta, conte o e-mail da sua conta, o aparelho (iPhone, Android ou navegador) e o que aconteceu. Não envie sua senha, número de cartão, dados bancários nem fotos de documentos: o suporte nunca pede essas informações.</p>
<p>Sobre como tratamos os seus dados, leia a <a href="${u('privacidade.html')}">Política de privacidade</a>.</p>
</section>

<section class="secao duvida" aria-labelledby="perguntas">
<h2 id="perguntas">Antes de escrever</h2>
<p>A <a href="${u('ajuda/index.html')}">Ajuda</a> tem respostas por tema, com busca. As perguntas mais comuns do suporte:</p>
<ul>
${links}
</ul>
</section>`;
  const capa = `<h1>Suporte</h1>
<p class="lead">Como falar com a equipe do Clarevo e onde achar respostas para as dúvidas mais comuns.</p>`;
  return montarPagina({
    arquivo,
    titulo: 'Suporte',
    descricao: 'Como falar com o suporte do Clarevo e onde achar respostas para as perguntas mais frequentes.',
    capa,
    corpo: colunaTexto(marcadoresEmHtml(brutas, valores), 'texto'),
    fonte: brutas,
    valores,
    classeCapa: 'capa-simples',
  });
}

/** Uma página legal a partir do Markdown, ou o espaço reservado (com `[A DEFINIR: ...]`) enquanto o texto não existir. */
function paginaLegal(pagina, md, valores) {
  const avisos = [];
  let fonte = md;
  if (md === null) {
    fonte = `# ${pagina.titulo}\n\nEste texto está em revisão e será publicado nesta página. [A DEFINIR: texto desta página, que vem de docs/legal/${pagina.md}]\n`;
  }
  const { titulo, corpo } = separarTitulo(fonte);
  if (titulo === null) avisos.push(`docs/legal/${pagina.md}: não tem título "# ..." (usei "${pagina.titulo}")`);
  const h1 = titulo ?? pagina.titulo;
  const capa = `<h1>${emLinha(h1, contexto({ valores }))}</h1>`;
  const html = markdownParaHtml(corpo, { valores, rebaixarH1: true, mapaLinks: MAPA_LINKS_SITE, paginaAtual: pagina.arquivo });
  const pg = montarPagina({
    arquivo: pagina.arquivo,
    titulo: textoPuro(h1),
    descricao: pagina.descricao,
    capa,
    corpo: colunaTexto(html, 'texto'),
    fonte,
    valores,
    classeCapa: 'capa-simples',
  });
  return { ...pg, avisos };
}

function pagina404({ valores }) {
  const arquivo = '404.html';
  const u = (d) => rel(arquivo, d);
  const capa = `<h1>Página não encontrada</h1>
<p class="lead">O endereço que você abriu não existe ou mudou de lugar.</p>
<div class="acoes">
<a class="botao botao-principal" href="${u('index.html')}">Ir para o início</a>
<a class="botao botao-suave" href="${u('ajuda/index.html')}">Abrir a Ajuda</a>
</div>`;
  const corpo = bloco(
    `<h2 id="talvez">Talvez você procure</h2>
<ul>
<li><a href="${u('app/index.html')}">O app</a></li>
<li><a href="${u('aprender/index.html')}">Aprender</a></li>
<li><a href="${u('novidades/index.html')}">Novidades</a></li>
<li><a href="${u('suporte.html')}">Suporte</a></li>
</ul>`,
    { rotulo: 'talvez' },
  );
  return montarPagina({ arquivo, titulo: 'Página não encontrada', descricao: 'Esta página não existe no site do Clarevo.', capa, corpo, fonte: capa, valores, classeCapa: 'capa-simples', semIndexar: true });
}

module.exports = { paginaSobre, paginaSuporte, paginaLegal, pagina404, PAGINAS_LEGAIS };
