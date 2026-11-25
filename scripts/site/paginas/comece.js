'use strict';
/**
 * Comece aqui (`comece.html`): a página do link da bio das redes sociais (Playbook de Redes v2.2, D-067 e D-068). Diz em duas frases o que é a
 * Clarevo, conta o estado real do acesso e leva às páginas de entrada: O app, a demonstração, Aprender, Calculadoras, Para empresas e Ajuda.
 *
 * Sem lista de espera, sem data de abertura, sem formulário e sem script. Os links não levam parâmetros de rastreamento: para saber quantas
 * pessoas chegam por aqui, a equipe lê as estatísticas de tráfego do painel da Cloudflare, medidas no servidor (`docs/24_REDES_SOCIAIS.md`,
 * seção 4). O estado do acesso vem do estado do produto (`scripts/site/estado.js`, D-125): o mesmo texto do fim da página inicial e da
 * página do MEI, que muda sozinho quando `ESTADO_DO_PRODUTO.lancado` (`config.js`) passa a `true`. Até 25/11/2026 o texto era "A Clarevo
 * está em fase de testes. A versão para pessoas e empresas abre no piloto; acompanhe as Novidades.", e a página inicial já vendia planos.
 */
const { esc } = require('../texto');
const { rel } = require('../util');
const { URL_DEMO } = require('../config');
const { montarPagina, marcadoresEmHtml, bloco } = require('../modelo');
const { textoDoAcesso, chamadas, selosDasLojas } = require('../estado');

const ARQUIVO = 'comece.html';
const DESCRICAO = 'O que é a Clarevo, como está o acesso e por onde começar: a demonstração, os planos, o Espaço Negócio para MEI, Aprender e as calculadoras.';

function paginaComece({ valores, estado }) {
  const u = (d) => rel(ARQUIVO, d);

  const capa = `<p class="assinatura-marca">Cuidar da vida financeira faz parte de cuidar de você.</p>
<h1>Comece aqui</h1>
<p class="lead">A Clarevo é um app para organizar as contas, os cartões e os gastos do mês, com o pessoal, a família e o negócio separados. Você anota o que recebe e o que paga, e o app mostra o que entrou, o que saiu e o que ainda vai vencer. Não é banco, não movimenta dinheiro e não recomenda produtos financeiros.</p>`;

  const caminhos = [
    { href: URL_DEMO, titulo: 'Ver a demonstração', texto: 'Abra o app com dados fictícios, no navegador. Nada é gravado fora do seu aparelho.', externo: true },
    { href: u('app/index.html'), titulo: 'O app', texto: 'Veja o que o app faz, tela por tela, com as capturas da demonstração.' },
    { href: u('planos.html'), titulo: 'Planos', texto: 'Os planos Individual e Família, com os mesmos recursos, e como funciona a assinatura.' },
    { href: u('mei.html'), titulo: 'Para quem trabalha por conta e MEI', texto: 'O Espaço Negócio, incluído na assinatura: o dinheiro do negócio separado do da casa.' },
    { href: u('empresas/index.html'), titulo: 'Para empresas', texto: 'Como a empresa oferece a Clarevo como benefício, sem ver as finanças de ninguém.' },
    { href: u('aprender/index.html'), titulo: 'Aprender', texto: 'Explicações curtas sobre juros, taxas e contas do dia a dia, cada uma com fonte e data de revisão.' },
    { href: u('calculadoras/index.html'), titulo: 'Calculadoras', texto: 'Contas rápidas, como parcelado ou à vista, feitas no navegador com os números que você digita. Nada é enviado.' },
    { href: u('ajuda/index.html'), titulo: 'Ajuda', texto: 'Respostas por tema e busca no próprio navegador, sem enviar o que você digita.' },
  ];
  const cartoes = caminhos
    .map((c) => `<a class="cartao" href="${esc(c.href)}"${c.externo ? ' rel="noopener noreferrer"' : ''}><span class="titulo-cartao">${esc(c.titulo)}</span><p>${esc(c.texto)}</p></a>`)
    .join('\n');

  const brutas = [
    bloco(
      `<div class="destaque">
<h2 id="acesso">Como está o acesso hoje</h2>
<p>${esc(textoDoAcesso(estado)).replace('Novidades', `<a href="${u('novidades/index.html')}">Novidades</a>`).replace('pedir uma apresentação', `<a href="${u('empresas/index.html')}#apresentacao">pedir uma apresentação</a>`)}</p>
${estado.lancado ? `${chamadas(ARQUIVO, estado)}\n${selosDasLojas(estado)}` : ''}
</div>`,
      { rotulo: 'acesso' },
    ),
    bloco(
      `<h2 id="por-onde">Por onde começar</h2>
<div class="grade">
${cartoes}
</div>`,
      { variante: 'alt', rotulo: 'por-onde' },
    ),
  ];

  return montarPagina({
    arquivo: ARQUIVO,
    titulo: 'Comece aqui: o que é a Clarevo e como ter acesso',
    descricao: DESCRICAO,
    capa,
    corpo: brutas.map((b) => marcadoresEmHtml(b, valores)).join('\n'),
    fonte: brutas.join('\n') + capa,
    valores,
    classeCapa: 'capa-simples',
  });
}

module.exports = { paginaComece };
