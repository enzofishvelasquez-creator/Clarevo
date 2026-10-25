'use strict';
/**
 * Comece aqui (`comece.html`): a página do link da bio das redes sociais (Playbook de Redes v2.2, D-067 e D-068). Diz em duas frases o que é a
 * Clarevo, conta o estado real do acesso e leva às páginas de entrada: O app, a demonstração, Aprender, Calculadoras, Para empresas e Ajuda.
 *
 * Sem lista de espera, sem data de abertura, sem formulário e sem script. Os links não levam parâmetros de rastreamento: para saber quantas
 * pessoas chegam por aqui, a equipe lê as estatísticas de tráfego do painel da Cloudflare, medidas no servidor (`docs/24_REDES_SOCIAIS.md`,
 * seção 4). O estado do acesso é o de hoje (D-064: cadastro de pessoas reais só no piloto) e muda aqui, no texto de `ACESSO`, quando o
 * piloto abrir.
 */
const { esc } = require('../texto');
const { rel } = require('../util');
const { URL_DEMO } = require('../config');
const { montarPagina, marcadoresEmHtml, bloco } = require('../modelo');

const ARQUIVO = 'comece.html';
const DESCRICAO = 'Cuidar da vida financeira faz parte de cuidar de você. Veja o que é a Clarevo, como está o acesso hoje e por onde começar: demonstração, Aprender, calculadoras e dúvidas.';

/** O texto do estado do acesso, que as peças das redes repetem (P03, "versão com acesso em preparação"). */
const ACESSO = 'A Clarevo está em fase de testes. A versão para pessoas e empresas abre no piloto; acompanhe as Novidades.';

function paginaComece({ valores }) {
  const u = (d) => rel(ARQUIVO, d);

  const capa = `<h1>Comece aqui</h1>
<p class="lead">A Clarevo é uma solução de bem-estar financeiro, apoiada por um aplicativo de finanças pessoais e da família: você anota o que recebe e o que paga, e o app mostra o que entrou, o que saiu e o que ainda vai vencer, cada coisa separada da outra. Não é banco, não movimenta dinheiro e não recomenda produtos financeiros.</p>
<p class="lead">Cuidar da vida financeira faz parte de cuidar de você. Mais clareza para decidir.</p>`;

  const caminhos = [
    { href: u('app/index.html'), titulo: 'O app', texto: 'Veja o que o app faz, tela por tela, com as capturas da demonstração.' },
    { href: URL_DEMO, titulo: 'Ver a demonstração', texto: 'Abra o app com dados fictícios, no navegador. Nada é gravado fora do seu aparelho.', externo: true },
    { href: u('aprender/index.html'), titulo: 'Aprender', texto: 'Explicações curtas sobre juros, taxas e contas do dia a dia, cada uma com fonte e data de revisão.' },
    { href: u('calculadoras/index.html'), titulo: 'Calculadoras', texto: 'Contas rápidas, como parcelado ou à vista, feitas no navegador com os números que você digita. Nada é enviado.' },
    { href: u('empresas/index.html'), titulo: 'Para empresas', texto: 'Como a empresa integra o cuidado financeiro ao programa de bem-estar e oferece a Clarevo como benefício, sem ver as finanças de ninguém.' },
    { href: u('ajuda/index.html'), titulo: 'Ajuda', texto: 'Respostas por tema e busca no próprio navegador, sem enviar o que você digita.' },
  ];
  const cartoes = caminhos
    .map((c) => `<a class="cartao" href="${esc(c.href)}"${c.externo ? ' rel="noopener noreferrer"' : ''}><span class="titulo-cartao">${esc(c.titulo)}</span><p>${esc(c.texto)}</p></a>`)
    .join('\n');

  const brutas = [
    bloco(
      `<div class="destaque">
<h2 id="acesso">Como está o acesso hoje</h2>
<p>${esc(ACESSO).replace('Novidades', `<a href="${u('novidades/index.html')}">Novidades</a>`)}</p>
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
    titulo: 'Comece aqui',
    descricao: DESCRICAO,
    capa,
    corpo: brutas.map((b) => marcadoresEmHtml(b, valores)).join('\n'),
    fonte: brutas.join('\n') + capa,
    valores,
    classeCapa: 'capa-simples',
  });
}

module.exports = { paginaComece, ACESSO_DO_CLAREVO: ACESSO };
