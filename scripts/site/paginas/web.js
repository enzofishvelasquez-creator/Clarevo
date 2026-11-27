'use strict';
/**
 * Use a Clarevo no navegador (`web.html`, D-128, 26/11/2026, pedido do Enzo): a página da versão web, para incentivar o uso no navegador.
 * Só o que o app faz hoje, conferido no núcleo e nas decisões:
 *   - no navegador do computador ou do celular, sem instalar nada (o app web, `URL_APP`, do mesmo código do app, D-003);
 *   - no computador, o desenho largo, com o menu ao lado (as telas `docs/telas/630_computador_resumo.png` e `631_computador_movimentos.png`,
 *     gravadas da demonstração pelo roteiro de telas);
 *   - a mesma conta e os mesmos dados do app para celular (o mesmo banco, D-004);
 *   - na web, o pagamento é pelo serviço de pagamento (D-084 e D-093): no cartão, a assinatura renova sozinha a cada mês ou a cada ano e se
 *     cancela na tela Assinatura do app; com Pix, paga-se um mês ou um ano de cada vez, sem renovação automática, e o Resumo avisa antes de
 *     o período acabar (D-127); os dados do cartão e do Pix ficam com o serviço de pagamento, nunca na Clarevo (D-084). Os preços são os mesmos
 *     da web e das lojas (decisão do Enzo, 26/11/2026: o mesmo preço em todo lugar, sem desconto na web). Preço com número só nos cartões
 *     dos planos (o teste do site confere): aqui, o link para os planos.
 * A chamada principal segue o estado do produto (`estado.js`): "Assine aqui", para os planos antes do lançamento (que mostram "Em breve") e
 * para criar conta depois; a segunda é "Conheça o app". A demonstração fica só como link de texto discreto, logo abaixo das chamadas. Desde a
 * análise geral de 26/11/2026 (D-129), embaixo das chamadas da capa e da chamada final, nos dois estados, "Já tem conta? Entrar no
 * navegador" (a tela de entrar do app web).
 */
const { esc } = require('../texto');
const { rel } = require('../util');
const { montarPagina, marcadoresEmHtml, bloco, icone, telaLarga } = require('../modelo');
const { chamadas, jaTemConta, linhaDaCapa, linkDaDemonstracao, noCelular, selosDasLojas } = require('../estado');

const ARQUIVO = 'web.html';

/** O que muda no navegador, em três cartões (a grade de três fecha a linha: uma coluna no celular, três no computador). */
function vantagens() {
  return [
    { icone: 'navegador', titulo: 'Nada para instalar', texto: 'Abra a Clarevo no navegador do computador ou do celular, sem baixar nada.' },
    { icone: 'celular', titulo: 'A mesma conta do celular', texto: 'Entre com o mesmo e-mail e a mesma senha. O que você anota no navegador aparece no app para celular, e o contrário também.' },
    { icone: 'computador', titulo: 'A tela larga do computador', texto: 'No computador, o menu fica ao lado, e o Resumo, os movimentos e os formulários usam a tela inteira.' },
  ];
}

/**
 * "Use como app no celular" (jornada de compra de 27/11/2026, item S5): a versão web já pode ir para a tela de início do celular e abrir numa
 * janela própria, como um app (o app web tem o manifesto com `display: standalone`, `apps/app/public/manifest.webmanifest`), e nenhuma página
 * dizia isso. Os passos usam os nomes dos menus do Safari e do Chrome em português; como eles mudam um pouco com a versão, a nota diz isso.
 * Sem link para a tela inicial do app web (antes do lançamento, o site não leva a ela, D-129 A): a página já tem "Já tem conta?".
 */
const COMO_APP = [
  { titulo: 'No iPhone, pelo Safari', passos: ['Abra a versão web da Clarevo no Safari.', 'Toque em Compartilhar, o quadrado com a seta para cima.', 'Escolha Adicionar à Tela de Início e confirme.'] },
  { titulo: 'No Android, pelo Chrome', passos: ['Abra a versão web da Clarevo no Chrome.', 'Toque no menu, os três pontos no canto de cima.', 'Escolha Instalar app ou Adicionar à tela inicial e confirme.'] },
];

/** Como pagar na web, em itens curtos. */
const PAGAR = [
  'No cartão, a assinatura renova sozinha a cada mês ou a cada ano, no período que você escolher. Para cancelar, use a tela Assinatura do app, e o acesso continua até o fim do período já pago.',
  'Com Pix, você paga um mês ou um ano de cada vez. O Pix não renova sozinho: antes de o período acabar, o Resumo avisa.',
  'O pagamento é feito pelo serviço de pagamento: os dados do cartão e do Pix ficam com ele, nunca na Clarevo.',
  'Os preços são os mesmos na web, na App Store e no Google Play, e toda conta começa com 14 dias grátis, sem cartão.',
];

/**
 * A frase da chamada final (D-129): lançado, o convite de sempre; antes do lançamento, só o que a página oferece (ver o app por dentro e
 * entrar, para quem já tem conta), sem convidar a criar conta: "Assine aqui" leva aos planos, que dizem que a assinatura abre em breve.
 */
function fimDaPagina(estado) {
  return estado.lancado
    ? 'Abra a Clarevo no computador, anote os gastos de hoje e veja o mês tomar forma.'
    : 'Por enquanto, veja o app por dentro. Quando a assinatura abrir, é só abrir a Clarevo no computador, anotar os gastos de hoje e ver o mês tomar forma.';
}

function paginaWeb({ valores, img, estado }) {
  const u = (d) => rel(ARQUIVO, d);
  const { catalogo } = require('../catalogo');
  const dias = catalogo().PLANOS.diasDeTeste;

  const capa = `<h1>Use a Clarevo no navegador</h1>
<p class="lead">No computador ou no celular, sem instalar nada. A mesma conta e os mesmos dados do app para celular, com a tela larga e o menu ao lado no computador.</p>
${chamadas(ARQUIVO, estado, { secundaria: 'app' })}
<p class="estado-produto">${esc(linhaDaCapa(estado))}</p>
${jaTemConta()}
${linkDaDemonstracao()}
${selosDasLojas(estado, { pequenos: true })}`;

  const cartoes = vantagens()
    .map(
      (v) => `<li class="recurso-cartao recurso-fixo">
<div class="recurso-topo"><span class="recurso-icone">${icone(v.icone)}</span><h3>${esc(v.titulo)}</h3></div>
<p class="recurso-texto">${esc(v.texto)}</p>
</li>`,
    )
    .join('\n');

  const brutas = [
    bloco(
      `<h2 id="no-navegador">No navegador, do seu jeito</h2>
<ul class="recursos-grade" role="list">
${cartoes}
</ul>`,
      { rotulo: 'no-navegador' },
    ),
    bloco(
      `<h2 id="no-computador">No computador</h2>
<p class="lead-bloco">O menu fica ao lado, com Anotar gasto sempre à mão, e as telas aproveitam a largura: o Resumo do mês num olhar só e os movimentos numa tabela.</p>
<div class="telas-web">
${telaLarga(img['computador-resumo'], ARQUIVO)}
${telaLarga(img['computador-movimentos'], ARQUIVO)}
</div>`,
      { variante: 'alt', rotulo: 'no-computador' },
    ),
    bloco(
      `<h2 id="como-app">Use como app no celular</h2>
<p class="lead-bloco">No celular, a versão web pode ficar na tela de início, com o ícone da Clarevo, e abrir numa janela própria, como um app, com a mesma conta.</p>
<div class="grade">
${COMO_APP.map((c) => `<article class="cartao">\n<h3>${esc(c.titulo)}</h3>\n<ol class="passos-curtos">\n${c.passos.map((x) => `<li>${esc(x)}</li>`).join('\n')}\n</ol>\n</article>`).join('\n')}
</div>
<p class="nota">Os nomes dos menus podem mudar um pouco com a versão do aparelho e do navegador. Os lembretes de vencimento e a leitura do QR Code pela câmera são do app para celular.</p>`,
      { rotulo: 'como-app' },
    ),
    bloco(
      `<div class="pagar-web">
<h2 id="pagar">Assinar na web${estado.lancado ? '' : ' <span class="etiqueta">Em breve</span>'}</h2>
<ul class="como-funciona lista-marcada">
${PAGAR.map((i) => `<li>${esc(i.replace('14 dias', `${dias} dias`))}</li>`).join('\n')}
</ul>
<p class="nota"><a href="${u('planos.html')}">Ver os planos</a> · <a href="${u('ajuda/conta.html')}#guia-assinatura">Como funciona a assinatura</a></p>
</div>`,
      { variante: 'alt', rotulo: 'pagar' },
    ),
    bloco(
      `<div class="chamada-final">
<h2 id="comecar">Comece pelo navegador</h2>
<p>${esc(`${fimDaPagina(estado)} ${noCelular(estado)}`)}</p>
${chamadas(ARQUIVO, estado, { secundaria: 'app' })}
${jaTemConta()}
</div>`,
      { rotulo: 'comecar' },
    ),
  ];

  return montarPagina({
    arquivo: ARQUIVO,
    titulo: 'Use a Clarevo no navegador: controle de gastos na web',
    descricao: 'A Clarevo no navegador do computador ou do celular, sem instalar nada: a mesma conta do app, a tela larga com o menu ao lado e a assinatura com cartão ou Pix.',
    capa,
    corpo: brutas.map((b) => marcadoresEmHtml(b, valores)).join('\n'),
    fonte: brutas.join('\n') + capa,
    valores,
    classeCapa: 'capa-simples',
  });
}

module.exports = { paginaWeb, ARQUIVO_WEB: ARQUIVO };
