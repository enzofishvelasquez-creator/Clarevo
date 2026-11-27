'use strict';
/**
 * Comece aqui (`comece.html`): a página do link da bio das redes sociais (Playbook de Redes v2.2, D-067 e D-068). Desde 26/11/2026 (D-128,
 * pedido do Enzo), uma página neutra de "como começar", sem nenhuma palavra de fase de testes nos dois estados do produto: o que é a Clarevo
 * em duas frases, as chamadas da capa ("Assine aqui" e "Conheça o app", pelo estado do produto), três passos para começar (escolher o plano,
 * usar no navegador ou no celular e os primeiros passos no app) e os caminhos para as outras páginas. Até 26/11/2026 a página contava o
 * estado do acesso ("Como está o acesso hoje", com a fase de testes): o endereço continuou o mesmo, para a bio e os links que já circulam
 * continuarem funcionando, e a âncora `#acesso` deu lugar a `#passos`.
 *
 * Desde 27/11/2026 (decisão do Enzo, jornada de compra de 27/11/2026, pergunta 1: quem vem das redes encontrava "em breve" no passo 1),
 * antes do lançamento o primeiro passo é "Crie a sua conta", com o botão "Criar conta grátis" (a tela de criar conta do app web) e a linha
 * "A assinatura abre em breve. Por enquanto, o acesso é completo e nada é cobrado." (`linhaDoConvite`), e os planos ficam no texto do
 * passo, com o link. Lançado, como antes: "Escolha o plano", com o link dos planos.
 *
 * Sem lista de espera, sem data de abertura, sem formulário e sem script. Os links não levam parâmetros de rastreamento: para saber quantas
 * pessoas chegam por aqui, a equipe lê as estatísticas de tráfego do painel da Cloudflare, medidas no servidor (`docs/24_REDES_SOCIAIS.md`,
 * seção 4). A demonstração não aparece aqui (D-128: só como link de texto em O app e em Use no navegador).
 */
const { esc } = require('../texto');
const { rel } = require('../util');
const { montarPagina, marcadoresEmHtml, bloco } = require('../modelo');
const { catalogo } = require('../catalogo');
const { botaoDoConvite, chamadas, linhaDaCapa, linhaDoConvite, noCelular, selosDasLojas } = require('../estado');
const { pessoasNaFamilia } = require('./planos');

const ARQUIVO = 'comece.html';
const DESCRICAO = 'Como começar na Clarevo: crie a conta, use no navegador ou no celular e dê os primeiros passos. E os caminhos para O app, o MEI, Aprender e a Ajuda.';

function paginaComece({ valores, estado }) {
  const u = (d) => rel(ARQUIVO, d);
  const { PLANOS } = catalogo();

  const capa = `<h1>Comece aqui</h1>
<p class="lead">A Clarevo é um app para organizar as contas, os cartões e os gastos do mês, com o pessoal, a família e o negócio separados. Você anota o que recebe e o que paga, e o app mostra o que entrou, o que saiu e o que ainda vence. Não é banco, não movimenta dinheiro e não recomenda produtos financeiros.</p>
${chamadas(ARQUIVO, estado, { secundaria: 'app' })}
<p class="estado-produto">${esc(linhaDaCapa(estado))}</p>
${selosDasLojas(estado, { pequenos: true })}`;

  // Os três passos, verdadeiros nos dois estados: criar a conta (antes do lançamento) ou escolher o plano (lançado), onde usar (o celular pelo
  // estado do produto) e o que fazer primeiro no app (o card Primeiros passos do Resumo, D-033, e os atalhos da conta nova, D-125).
  const passos = [
    estado.lancado
      ? {
          titulo: 'Escolha o plano',
          texto: `Individual, para uma pessoa, ou Família, para até ${pessoasNaFamilia()} pessoas. Os dois têm todos os recursos e começam com ${PLANOS.diasDeTeste} dias grátis, sem cartão.`,
          link: { href: u('planos.html'), texto: 'Ver os planos' },
        }
      : {
          // Antes do lançamento (desde 27/11/2026): o convite ao cadastro, com a linha honesta e o botão; os planos, só no texto, sem preço.
          titulo: 'Crie a sua conta',
          texto: `${linhaDoConvite(estado)} Os planos Individual, para uma pessoa, e Família, para até ${pessoasNaFamilia()} pessoas, têm todos os recursos.`,
          link: { href: u('planos.html'), texto: 'Ver os planos' },
          botao: botaoDoConvite(estado),
        },
    {
      titulo: 'Use no navegador ou no celular',
      texto: `A mesma conta no computador e no celular, com os mesmos dados. No computador, é só abrir o navegador, sem instalar nada. ${noCelular(estado)}`,
      link: { href: u('web.html'), texto: 'Use a Clarevo no navegador' },
    },
    {
      titulo: 'Dê os primeiros passos',
      texto: 'Anote os gastos de hoje ou importe o extrato, a fatura ou um print do banco. Numa conta nova, o Resumo mostra os primeiros passos, com um atalho para cada um.',
      link: { href: u('ajuda/comecar.html'), texto: 'Como começar, na Ajuda' },
    },
  ];

  const caminhos = [
    { href: u('app/index.html'), titulo: 'O app', texto: 'Veja o que o app faz, tela por tela, com as telas da demonstração.' },
    { href: u('web.html'), titulo: 'Use no navegador', texto: 'A Clarevo no computador ou no celular, sem instalar nada, com a mesma conta.' },
    { href: u('planos.html'), titulo: 'Planos', texto: 'Os planos Individual e Família, com os mesmos recursos, e como funciona a assinatura.' },
    { href: u('mei.html'), titulo: 'Para quem trabalha por conta e MEI', texto: 'O Espaço Negócio, incluído na assinatura: o dinheiro do negócio separado do da casa.' },
    { href: u('empresas/index.html'), titulo: 'Para empresas', texto: 'Como a empresa oferece a Clarevo como benefício, sem ver as finanças de ninguém.' },
    { href: u('aprender/index.html'), titulo: 'Aprender', texto: 'Explicações curtas sobre juros, taxas e contas do dia a dia, cada uma com fonte e data de revisão.' },
    { href: u('calculadoras/index.html'), titulo: 'Calculadoras', texto: 'Contas rápidas, como parcelado ou à vista, feitas no navegador com os números que você digita. Nada é enviado.' },
    { href: u('ajuda/index.html'), titulo: 'Ajuda', texto: 'Respostas por tema e busca no próprio navegador, sem enviar o que você digita.' },
  ];
  const cartoes = caminhos.map((c) => `<a class="cartao" href="${esc(c.href)}"><span class="titulo-cartao">${esc(c.titulo)}</span><p>${esc(c.texto)}</p></a>`).join('\n');

  const brutas = [
    bloco(
      `<h2 id="passos">Três passos para começar</h2>
<ol class="passos">
${passos.map((p) => `<li><h3>${esc(p.titulo)}</h3><p>${esc(p.texto)}</p>${p.botao ? `<p class="acoes acoes-passo">${p.botao}</p>` : ''}<p class="passo-link"><a href="${esc(p.link.href)}">${esc(p.link.texto)}</a></p></li>`).join('\n')}
</ol>`,
      { rotulo: 'passos' },
    ),
    bloco(
      `<h2 id="por-onde">Por onde continuar</h2>
<div class="grade">
${cartoes}
</div>`,
      { variante: 'alt', rotulo: 'por-onde' },
    ),
  ];

  return montarPagina({
    arquivo: ARQUIVO,
    titulo: 'Comece aqui: como começar a usar a Clarevo',
    descricao: DESCRICAO,
    capa,
    corpo: brutas.map((b) => marcadoresEmHtml(b, valores)).join('\n'),
    fonte: brutas.join('\n') + capa,
    valores,
    classeCapa: 'capa-simples',
  });
}

module.exports = { paginaComece };
