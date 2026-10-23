'use strict';
/**
 * Kit de imprensa (D-066): `imprensa.html` e os arquivos de `imprensa/`. Logotipo e símbolo oficiais (SVG de `docs/marca/`, copiados sem
 * mudança, e PNG que `scripts/gerar-marca-imprensa.js` desenha desses mesmos SVG), cores, fonte, descrições prontas (uma frase, 50 e 100
 * palavras, fiéis ao que o produto faz), capturas da demonstração (dados fictícios, identificados), regras de uso do logotipo e contato.
 * Sem números de uso, clientes nem prêmios: o kit só diz o que o produto faz hoje.
 */
const fs = require('node:fs');
const path = require('node:path');
const { esc } = require('../texto');
const { rel } = require('../util');
const { montarPagina, marcadoresEmHtml, bloco, celular } = require('../modelo');
const { MARCA, SITE_SRC, RAIZ } = require('../config');
const { IMAGENS } = require('../imagens');
const png = require('../png');

const ARQUIVO = 'imprensa.html';
const PASTA = 'imprensa';

/** Os SVG de `docs/marca/` do kit, com o fundo em que cada um é usado e o texto de cada cartão. */
const MARCAS = [
  { nome: 'clarevo-logotipo', tipo: 'logotipo', titulo: 'Logotipo colorido', uso: 'Fundo claro. Nome azul e ponto lima.', fundo: 'claro' },
  { nome: 'clarevo-logotipo-reverso', tipo: 'logotipo', titulo: 'Logotipo reverso', uso: 'Fundo azul (cabeçalhos do app e telas de entrada). Nome branco e ponto lima.', fundo: 'azul' },
  { nome: 'clarevo-logotipo-uma-cor', tipo: 'logotipo', titulo: 'Logotipo de uma cor', uso: 'Impressão ou fundos em que a cor não é possível.', fundo: 'claro' },
  { nome: 'clarevo-simbolo', tipo: 'símbolo', titulo: 'Símbolo colorido', uso: 'Ícone do app e espaços pequenos, em fundo claro.', fundo: 'claro' },
  { nome: 'clarevo-simbolo-reverso', tipo: 'símbolo', titulo: 'Símbolo reverso', uso: 'Ícone sobre fundo azul.', fundo: 'azul' },
  { nome: 'clarevo-simbolo-uma-cor', tipo: 'símbolo', titulo: 'Símbolo de uma cor', uso: 'Impressão ou fundos em que a cor não é possível.', fundo: 'claro' },
];

/** As capturas do kit: as telas da demonstração em tamanho original (as de `docs/lojas/capturas/`), com o nome do arquivo para baixar. */
const CAPTURAS = [
  { id: 'resumo', arquivo: '01-resumo.png' },
  { id: 'anotar', arquivo: '02-anotar-gasto.png' },
  { id: 'contas', arquivo: '03-contas-a-pagar.png' },
  { id: 'cartoes', arquivo: '04-cartoes.png' },
  { id: 'evolucao', arquivo: '05-evolucao.png' },
  { id: 'metas', arquivo: '06-metas.png' },
];

/** As cores da marca (`CLAUDE.md` e `docs/marca/LEIAME.md`). */
const CORES = [
  { classe: 'azul', nome: 'Azul Clarevo', hex: '#2457F5', uso: 'Cor principal: cabeçalhos, botões e o nome no logotipo colorido.' },
  { classe: 'lima', nome: 'Lima Clarevo', hex: '#D4F05B', uso: 'O ponto do logotipo e os destaques.' },
  { classe: 'texto', nome: 'Texto', hex: '#17223B', uso: 'Texto e títulos sobre fundo claro.' },
];

/**
 * As descrições prontas. O número de palavras é parte do pedido (50 e 100), e o gerador recusa o texto que sair dele, para uma edição
 * nunca deixar o rótulo mentir. Cada afirmação é do que o produto faz hoje (`docs/lojas/ficha.md`, `docs/13` e o código do core).
 */
const DESCRICOES = [
  {
    id: 'uma-frase',
    titulo: 'Em uma frase',
    palavras: null,
    texto:
      'O Clarevo é um aplicativo para organizar as finanças pessoais e da família: mostra o que entrou, o que saiu e o que ainda vai vencer, cada coisa separada da outra, e traz educação financeira com fonte.',
  },
  {
    id: 'cinquenta',
    titulo: 'Em 50 palavras',
    palavras: 50,
    texto:
      'O Clarevo é um aplicativo de organização de finanças pessoais e da família. Você anota o que recebe e o que paga, e ele mostra quanto entrou, quanto saiu e quanto ainda vai vencer, cada coisa separada da outra. Também traz educação financeira com fonte e não recomenda produtos financeiros.',
  },
  {
    id: 'cem',
    titulo: 'Em 100 palavras',
    palavras: 100,
    texto:
      'O Clarevo é um aplicativo de organização de finanças pessoais e da família. Você anota o que recebe e o que paga, e ele mostra quanto entrou, quanto saiu e quanto ainda vai vencer, cada coisa separada da outra. Também reúne contas a pagar, cartões de crédito, metas e uma reserva para imprevistos. Uma Família pode ter até seis pessoas, e uma empresa pode oferecer o Clarevo como benefício sem ver as finanças de ninguém. O Clarevo não é banco, não movimenta dinheiro, não recomenda produtos financeiros, não tem anúncios e não vende dados. Explica juros e taxas com fonte.',
  },
];

/** Quantas palavras tem um texto (separadas por espaço). */
const contarPalavras = (t) => t.trim().split(/\s+/).length;

function conferirDescricoes() {
  for (const d of DESCRICOES) {
    if (d.palavras !== null && contarPalavras(d.texto) !== d.palavras) throw new Error(`imprensa: a descrição "${d.titulo}" tem ${contarPalavras(d.texto)} palavras, e deveria ter ${d.palavras}`);
  }
}

/** "#2457F5" em "36, 87, 245". */
const rgbDe = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ');

const lerDeMarca = (nome) => fs.readFileSync(path.join(MARCA, nome));
const pngDaMarca = (nome) => fs.readFileSync(path.join(SITE_SRC, 'imprensa', nome));
const capturaOriginal = (id) => path.join(RAIZ, IMAGENS.find((i) => i.id === id).origem);

/**
 * Os arquivos de `imprensa/` no site: o SVG de `docs/marca/` (cópia exata), o PNG de `site-src/imprensa/` (desenhado desse SVG por
 * `scripts/gerar-marca-imprensa.js`) e as capturas em tamanho original. `avisos` diz se faltar o PNG.
 */
function arquivosDaImprensa() {
  const arquivos = new Map();
  const avisos = [];
  for (const m of MARCAS) {
    arquivos.set(`${PASTA}/${m.nome}.svg`, lerDeMarca(`${m.nome}.svg`));
    const alvo = path.join(SITE_SRC, 'imprensa', `${m.nome}.png`);
    if (fs.existsSync(alvo)) arquivos.set(`${PASTA}/${m.nome}.png`, fs.readFileSync(alvo));
    else avisos.push(`site-src/imprensa/${m.nome}.png não existe: rode "node scripts/gerar-marca-imprensa.js"`);
  }
  for (const c of CAPTURAS) arquivos.set(`${PASTA}/capturas/${c.arquivo}`, fs.readFileSync(capturaOriginal(c.id)));
  return { arquivos, avisos };
}

const kb = (bytes) => `${Math.round(bytes / 1024)} KB`;

function paginaImprensa({ valores, img }) {
  conferirDescricoes();
  const u = (d) => rel(ARQUIVO, d);
  const { arquivos } = arquivosDaImprensa();

  const capa = `<h1>Kit de imprensa</h1>
<p class="lead">Logotipo, cores, descrições prontas e capturas de tela do Clarevo, para quem vai escrever sobre ele. Tudo sai direto da marca e do produto, sem retoque.</p>
<div class="acoes">
<a class="botao botao-principal" href="#descricoes">Descrições prontas</a>
<a class="botao botao-suave" href="#logotipo">Logotipo e símbolo</a>
</div>`;

  const descricoes = DESCRICOES.map(
    (d) =>
      `<article class="cartao descricao" id="${d.id}">
<h3>${esc(d.titulo)}${d.palavras ? ` <span class="etiqueta etiqueta-azul">${contarPalavras(d.texto)} palavras</span>` : ''}</h3>
<p>${esc(d.texto)}</p>
</article>`,
  ).join('\n');

  const cartaoDaMarca = (m) => {
    const svg = `${PASTA}/${m.nome}.svg`;
    const pngArq = `${PASTA}/${m.nome}.png`;
    const dim = arquivos.has(pngArq) ? png.dimensoes(arquivos.get(pngArq)) : null;
    return `<article class="cartao marca-cartao">
<div class="marca-amostra marca-${m.fundo}"><img src="${u(svg)}" alt="${esc(m.titulo)}" width="${m.tipo === 'logotipo' ? 240 : 96}" height="${m.tipo === 'logotipo' ? 48 : 100}" loading="lazy" decoding="async"></div>
<h3>${esc(m.titulo)}</h3>
<p>${esc(m.uso)}</p>
<p class="baixar"><a href="${u(svg)}" download>SVG (${kb(arquivos.get(svg).length)})</a>${dim ? ` · <a href="${u(pngArq)}" download>PNG, ${dim.largura} x ${dim.altura} px, fundo transparente e margem de respiro (${kb(arquivos.get(pngArq).length)})</a>` : ''}</p>
</article>`;
  };

  const capturas = CAPTURAS.map((c) => {
    const original = arquivos.get(`${PASTA}/capturas/${c.arquivo}`);
    const dim = png.dimensoes(original);
    return `<div class="captura-imprensa">
${celular(img[c.id], ARQUIVO)}
<p class="baixar"><a href="${u(`${PASTA}/capturas/${c.arquivo}`)}" download>Baixar em tamanho original (${dim.largura} x ${dim.altura} px, ${kb(original.length)})</a></p>
</div>`;
  }).join('\n');

  const cores = CORES.map(
    (c) => `<article class="cartao cor-cartao">
<div class="amostra amostra-${c.classe}" role="img" aria-label="Amostra da cor ${esc(c.nome)}, ${esc(c.hex)}"></div>
<h3>${esc(c.nome)}</h3>
<p><code>${esc(c.hex)}</code> · RGB ${esc(rgbDe(c.hex))}</p>
<p>${esc(c.uso)}</p>
</article>`,
  ).join('\n');

  const brutas = [
    bloco(
      `<h2 id="descricoes">Descrições prontas</h2>
<p class="lead-bloco">Textos para copiar, em três tamanhos. Eles só dizem o que o Clarevo faz hoje.</p>
<div class="grade grade-3">
${descricoes}
</div>`,
      { rotulo: 'descricoes' },
    ),
    bloco(
      `<h2 id="fatos">Fatos para conferir</h2>
<ul>
<li><strong>Nome:</strong> escreva Clarevo. O logotipo é "clarevo." em minúsculas, com o ponto lima.</li>
<li><strong>O que é:</strong> um aplicativo e uma versão web para organizar finanças pessoais e da família, com educação financeira com fonte.</li>
<li><strong>O que não é:</strong> não é banco, não movimenta dinheiro, não oferece crédito, não recomenda produtos financeiros e não se conecta a contas bancárias.</li>
<li><strong>Onde usar:</strong> na versão web. Os apps para iPhone e Android estão em breve na App Store e no Google Play.</li>
<li><strong>Para empresas:</strong> uma empresa pode oferecer o Clarevo como benefício e nunca vê as finanças de ninguém. <a href="${u('empresas/index.html')}">Veja como funciona</a>.</li>
<li><strong>Dados:</strong> sem anúncios, sem venda de dados e sem rastreamento para publicidade. <a href="${u('seguranca.html')}">Segurança e privacidade</a>.</li>
<li><strong>Quem oferece:</strong> [RAZÃO SOCIAL], CNPJ [CNPJ].</li>
</ul>
<p class="nota">O kit não traz números de uso, clientes nem prêmios.</p>`,
      { variante: 'alt', rotulo: 'fatos' },
    ),
    bloco(
      `<h2 id="logotipo">Logotipo e símbolo</h2>
<p class="lead-bloco">Os arquivos oficiais da marca, sem retoque. Os PNG são os mesmos SVG, desenhados em alta resolução, com uma margem transparente em volta para o logotipo respirar.</p>
<div class="grade grade-3">
${MARCAS.map(cartaoDaMarca).join('\n')}
</div>`,
      { rotulo: 'logotipo' },
    ),
    bloco(
      `<h2 id="regras">Regras de uso do logotipo</h2>
<div class="ve-nao-ve">
<div class="cartao ve">
<h3>Pode</h3>
<ul>
<li>usar os arquivos desta página, sem mudança, para falar do Clarevo;</li>
<li>usar o logotipo reverso sobre o azul e o colorido sobre fundo claro;</li>
<li>usar a versão de uma cor quando a cor não for possível;</li>
<li>usar o símbolo como ícone ou em espaços pequenos;</li>
<li>deixar espaço livre ao redor, para o nome respirar.</li>
</ul>
</div>
<div class="cartao nunca-ve">
<h3>Não pode</h3>
<ul>
<li>redesenhar o logotipo ou escrever "clarevo" em outra fonte;</li>
<li>tirar o ponto lima, trocar a cor dele ou usar o nome do logotipo sem o ponto;</li>
<li>trocar as cores, esticar, girar ou aplicar sombra e outros efeitos;</li>
<li>usar o símbolo no lugar do logotipo em cabeçalhos;</li>
<li>sugerir que o Clarevo apoia, recomenda ou é apoiado por um produto, uma empresa ou uma marca.</li>
</ul>
</div>
</div>
<p class="nota">Em fundo branco, o ponto lima tem pouco contraste. Ele é decorativo, e o nome continua legível. Para qualquer uso além de falar do Clarevo, como anúncio, parceria ou produto, escreva antes para [E-MAIL DE CONTATO].</p>`,
      { variante: 'alt', rotulo: 'regras' },
    ),
    bloco(
      `<h2 id="cores">Cores</h2>
<div class="grade grade-3">
${cores}
</div>`,
      { rotulo: 'cores' },
    ),
    bloco(
      `<h2 id="fonte">Fonte</h2>
<p>O texto do app e do site usa a <strong>Manrope</strong>, nos pesos Medium (500), Bold (700) e ExtraBold (800), com a licença SIL Open Font License 1.1. O logotipo foi desenhado com a Manrope ExtraBold. A licença está em <a href="${u('fontes/OFL.txt')}">fontes/OFL.txt</a>, e os arquivos das três fontes, que são os do site, estão em <a href="${u('fontes/Manrope_500Medium.ttf')}">Medium</a>, <a href="${u('fontes/Manrope_700Bold.ttf')}">Bold</a> e <a href="${u('fontes/Manrope_800ExtraBold.ttf')}">ExtraBold</a>.</p>`,
      { variante: 'alt', rotulo: 'fonte' },
    ),
    bloco(
      `<h2 id="capturas">Capturas de tela</h2>
<p class="lead-bloco">Telas da demonstração do Clarevo. Os dados são fictícios, e a etiqueta "Demonstração" aparece no próprio app. Cite sempre como demonstração.</p>
<div class="capturas-imprensa">
${capturas}
</div>`,
      { rotulo: 'capturas' },
    ),
    bloco(
      `<h2 id="contato">Contato</h2>
<p>Para entrevistas, dúvidas ou conferir um fato, escreva para [E-MAIL DE CONTATO]. Para ajuda com o app, veja a <a href="${u('ajuda/index.html')}">Ajuda</a>.</p>`,
      { rotulo: 'contato' },
    ),
  ];
  const pg = montarPagina({
    arquivo: ARQUIVO,
    titulo: 'Kit de imprensa',
    descricao: 'Logotipo, símbolo, cores, fonte, descrições prontas e capturas de tela do Clarevo para a imprensa, com as regras de uso da marca.',
    capa,
    corpo: brutas.map((b) => marcadoresEmHtml(b, valores)).join('\n'),
    fonte: brutas.join('\n') + capa,
    valores,
    classeCapa: 'capa-simples',
  });
  return { arquivo: ARQUIVO, ...pg };
}

module.exports = { paginaImprensa, arquivosDaImprensa, contarPalavras, DESCRICOES, MARCAS, CAPTURAS, CORES, ARQUIVO };
