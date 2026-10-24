'use strict';
/** Início: o que é o Clarevo, para quem é, recursos com captura, "A empresa nunca vê suas finanças", o que ele não é e as chamadas. */
const { URL_APP } = require('../config');
const { esc } = require('../texto');
const { rel } = require('../util');
const { montarPagina, marcadoresEmHtml, bloco, celular, dominioDe } = require('../modelo');
const { catalogo } = require('../catalogo');
const { valorDe } = require('../texto');

const ARQUIVO = 'index.html';
const DESCRICAO = 'Mais clareza para decidir. O Clarevo é um organizador de finanças pessoais e da família: anote gastos e recebimentos, acompanhe contas a pagar e cartões e aprenda.';

function paginaInicial({ valores, img }) {
  const u = (d) => rel(ARQUIVO, d);
  const temas = catalogo().publicados.filter((t) => ['organizar', 'juros', 'tempo'].includes(t.section)).length;
  const calculadoras = catalogo().CALCULADORAS.length;

  const recursos = [
    { id: 'anotar', titulo: 'Anotar e ver o mês', texto: 'Anote um gasto ou um recebimento em poucos toques. O Resumo mostra Recebido, Pago, a diferença entre os dois e o que ainda falta pagar, com a explicação de cada número.' },
    { id: 'contas', titulo: 'Contas, cartões e gastos fixos', texto: 'Contas a pagar com vencimentos e lembretes no aparelho. Cartões de crédito com faturas e limite usado: o app guarda só o apelido e, se você quiser, os 4 últimos dígitos, nunca o número inteiro. Gastos fixos, parcelamentos e contas do ano, como IPVA e IPTU, aparecem sozinhos nos meses certos.' },
    { id: 'metas', titulo: 'Metas e reserva', texto: 'Metas e reserva para imprevistos, com um plano de guardar que mostra as etapas e o mês previsto, sem contar rendimento.' },
    { id: 'aprender', titulo: 'Aprender e simular', texto: 'Explicações curtas sobre juros, taxas e contas do dia a dia, cada uma com fonte e data de revisão. O simulador e as calculadoras usam só os números que você digita, e as calculadoras também funcionam aqui no site.' },
  ];
  const mini = recursos
    .map(
      (r) => `<article class="cartao">
<h3>${esc(r.titulo)}</h3>
<p>${esc(r.texto)}</p>
${celular(img[r.id], ARQUIVO)}
</article>`,
    )
    .join('\n');

  const capa = `<div class="capa-grade">
<div>
<h1>Mais clareza para decidir</h1>
<p class="lead">O Clarevo é um organizador de finanças pessoais e da família. Você anota o que recebe e o que paga, e o app mostra quanto entrou, quanto saiu e quanto ainda vai vencer, cada coisa separada da outra. Pode ser oferecido pela empresa como benefício.</p>
<div class="acoes">
<a class="botao botao-principal" href="${esc(URL_APP)}" rel="noopener noreferrer">Abrir a versão web</a>
<a class="botao botao-suave" href="${u('app/index.html')}">Conhecer o app</a>
</div>
<p class="lojas">Em breve na App Store e no Google Play.</p>
</div>
${celular(img.resumo, ARQUIVO, { carregamento: 'eager' })}
</div>`;

  const brutas = [
    bloco(
      `<h2 id="telas">O que o Clarevo faz</h2>
<p class="lead-bloco">Telas da demonstração do Clarevo. Os dados são fictícios, e uma conta nova começa vazia.</p>
<div class="mini">
${mini}
</div>
<p class="acoes"><a class="botao botao-principal" href="${u('app/index.html')}">Ver o app por dentro</a></p>`,
      { rotulo: 'telas' },
    ),
    bloco(
      `<h2 id="para-quem">Para quem é</h2>
<div class="grade">
<article class="cartao">
<h3>Para pessoas</h3>
<p>Use o Clarevo para entender para onde o dinheiro do mês foi e o que ainda vai vencer. Tudo o que aparece no app foi anotado ou importado por você ou pelas pessoas da sua Família. No seu Pessoal, só você anota e decide o que registrar.</p>
<p>Dá para criar uma Família de até 6 pessoas, com convite por link, e sair ou encerrar quando quiser.</p>
</article>
<article class="cartao">
<h3>Para empresas</h3>
<p>A empresa pode oferecer o Clarevo como benefício. O painel das empresas existe só na web e mostra os e-mails convidados, a situação de cada convite ou licença, as datas e as contagens de vagas. Nunca mostra finanças.</p>
<p><a href="${u('empresas/index.html')}">Veja como funciona para empresas</a>.</p>
</article>
</div>`,
      { variante: 'alt', rotulo: 'para-quem' },
    ),
    bloco(
      `<div class="destaque">
<h2 id="empresa-nao-ve">A empresa nunca vê suas finanças</h2>
<p>Se a sua empresa oferece o Clarevo, ela vê os e-mails que convidou, a situação de cada convite ou licença (convite enviado, convite cancelado, ativa ou encerrada), as datas (como a em que você aceitou o convite e a de encerramento) e as contagens de vagas e licenças. Nunca vê gastos, recebimentos, valores, categorias, metas, contas, cartões, a sua Família nem números somados. Também não vê quando você abre o app nem o que você anota.</p>
<p>Se o benefício terminar, sua conta e seu histórico não são apagados.</p>
<p><a href="${u('empresas/index.html')}">Para empresas</a> · <a href="${u('seguranca.html')}">Segurança e privacidade</a></p>
</div>`,
      { rotulo: 'empresa-nao-ve' },
    ),
    bloco(
      `<h2 id="nao-e">O que o Clarevo não é</h2>
<ul class="nao-e">
<li>Não é banco e não guarda o seu dinheiro.</li>
<li>Não movimenta dinheiro: não faz pagamentos nem transferências.</li>
<li>Não oferece crédito.</li>
<li>Não recomenda produtos financeiros.</li>
<li>Não se conecta a contas bancárias.</li>
</ul>
<p class="nota">O Clarevo é uma ferramenta de organização e de educação financeira. As simulações são exemplos feitos com os números que você digita e não garantem resultado.</p>`,
      { variante: 'alt', rotulo: 'nao-e' },
    ),
    bloco(
      `<h2 id="mais">Aprender, calcular, ficar por dentro e tirar dúvidas</h2>
<div class="grade">
<a class="cartao" href="${u('aprender/index.html')}"><span class="titulo-cartao">Aprender</span><p>${temas} temas de educação financeira, cada um com fontes, data de revisão e, quando cabe, um exemplo calculado.</p></a>
<a class="cartao" href="${u('calculadoras/index.html')}"><span class="titulo-cartao">Calculadoras</span><p>${calculadoras} calculadoras para contas rápidas, como parcelado ou à vista, dívidas e reserva, feitas no navegador com os números que você digita. Nada é enviado.</p></a>
<a class="cartao" href="${u('novidades/index.html')}"><span class="titulo-cartao">Novidades</span><p>Textos curtos da Equipe Clarevo, com fonte e data, e as regras de como escrevemos.</p></a>
<a class="cartao" href="${u('ajuda/index.html')}"><span class="titulo-cartao">Ajuda</span><p>Respostas por tema e busca no próprio navegador, sem enviar o que você digita.</p></a>
<a class="cartao" href="${u('seguranca.html')}"><span class="titulo-cartao">Segurança e privacidade</span><p>O que guardamos, o que não guardamos e quem vê o quê, em linguagem simples.</p></a>
</div>`,
      { rotulo: 'mais' },
    ),
    bloco(
      `<h2 id="dados">Seus dados</h2>
<p>Sem anúncios, sem venda de dados e sem rastreamento para publicidade. A conexão é protegida. Você exclui a sua conta e os seus dados quando quiser, dentro do app, em Conta. Se não conseguir entrar no app, peça pela página <a href="${u('excluir-conta.html')}">Excluir conta</a>. Os detalhes estão na <a href="${u('privacidade.html')}">Política de privacidade</a>.</p>
<h2 id="contato">Contato</h2>
<p>Para falar com a equipe, inclusive sobre o benefício para empresas: [E-MAIL DE CONTATO]. Para ajuda com o app, veja a <a href="${u('ajuda/index.html')}">Ajuda</a> e a página de <a href="${u('suporte.html')}">Suporte</a>.</p>`,
      { variante: 'alt', rotulo: 'dados' },
    ),
  ];
  const secoes = brutas.map((b) => marcadoresEmHtml(b, valores));

  const dominio = dominioDe(valores);
  const razao = valorDe(valores, 'RAZÃO SOCIAL');
  const organizacao = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Clarevo',
    description: DESCRICAO,
    ...(razao ? { legalName: razao } : {}),
    ...(dominio ? { url: `https://${dominio}/`, logo: `https://${dominio}/marca/icone-app.png` } : {}),
  };

  const fonte = brutas.join('\n') + capa;
  return montarPagina({
    arquivo: ARQUIVO,
    titulo: 'Clarevo: mais clareza para decidir',
    tituloCompleto: true,
    descricao: DESCRICAO,
    capa,
    corpo: secoes.join('\n'),
    fonte,
    valores,
    jsonld: [organizacao],
  });
}

module.exports = { paginaInicial, DESCRICAO_INICIO: DESCRICAO };
