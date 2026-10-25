'use strict';
/**
 * Início: a mensagem central (D-068), o que é a Clarevo, o apoio prático do app (bem-estar financeiro, sem promessa de resultado nem de saúde),
 * recursos com captura, para quem é, "A empresa nunca vê suas finanças", o que ela não é e as chamadas.
 */
const { URL_APP } = require('../config');
const { esc } = require('../texto');
const { rel } = require('../util');
const { montarPagina, marcadoresEmHtml, bloco, celular, dominioDe } = require('../modelo');
const { catalogo } = require('../catalogo');
const { valorDe } = require('../texto');

const ARQUIVO = 'index.html';
/** A mensagem central (Manual v2.2, seção 19) e a frase de apoio: as mesmas de `docs/lojas/ficha.md` e das imagens de compartilhamento. */
const MENSAGEM_CENTRAL = 'Cuidar da vida financeira faz parte de cuidar de você.';
const FRASE_DE_APOIO = 'Mais clareza para decidir';
const SUBTEXTO = 'A Clarevo ajuda a organizar o mês e acompanhar decisões financeiras pessoais e familiares, respeitando sua realidade.';
const DESCRICAO = `${MENSAGEM_CENTRAL} ${SUBTEXTO} ${FRASE_DE_APOIO}.`;

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
<h1>${esc(MENSAGEM_CENTRAL)}</h1>
<p class="lead">${esc(SUBTEXTO)}</p>
<p class="frase-apoio">${esc(FRASE_DE_APOIO)}.</p>
<div class="acoes">
<a class="botao botao-principal" href="${u('app/index.html')}">Conheça a Clarevo</a>
<a class="botao botao-suave" href="${esc(URL_APP)}" rel="noopener noreferrer">Abrir a versão web</a>
</div>
<p class="lojas">Em breve na App Store e no Google Play.</p>
</div>
${celular(img.resumo, ARQUIVO, { carregamento: 'eager' })}
</div>`;

  const brutas = [
    bloco(
      `<h2 id="bem-estar">Bem-estar financeiro, com apoio prático</h2>
<p class="lead-bloco">Contas para lembrar, compras para decidir, planos para organizar: o dinheiro participa da rotina. A Clarevo trata a vida financeira como parte do cuidado com o bem-estar e oferece um app para organizar o mês, sem julgamento.</p>
<div class="grade">
<article class="cartao">
<h3>O que a Clarevo oferece</h3>
<p>Um app para anotar o que entra e o que sai, ver o que ainda vai vencer, acompanhar metas e aprender o essencial sobre contas e juros, com fonte e data de revisão. Ele parte do que você registra e respeita a sua realidade: renda, trabalho, saúde e responsabilidades da família também limitam as escolhas, e dificuldade financeira não é falta de disciplina.</p>
</article>
<article class="cartao">
<h3>O que a Clarevo não promete</h3>
<p>A Clarevo não é atendimento de saúde e não promete resultado financeiro nem efeito sobre saúde mental, sono, produtividade ou tranquilidade. A vida financeira é uma dimensão do bem-estar, entre outras, e o app não tem eficácia clínica comprovada.</p>
</article>
</div>`,
      { rotulo: 'bem-estar' },
    ),
    bloco(
      `<h2 id="telas">O que o app faz</h2>
<p class="lead-bloco">Apoio prático para organizar o mês. Telas da demonstração da Clarevo: os dados são fictícios, e uma conta nova começa vazia.</p>
<div class="mini">
${mini}
</div>
<p class="acoes"><a class="botao botao-principal" href="${u('app/index.html')}">Ver o app por dentro</a></p>`,
      { variante: 'alt', rotulo: 'telas' },
    ),
    bloco(
      `<h2 id="para-quem">Para quem é</h2>
<div class="grade">
<article class="cartao">
<h3>Para pessoas</h3>
<p>Use o app da Clarevo para entender para onde o dinheiro do mês foi e o que ainda vai vencer. Tudo o que aparece no app foi anotado ou importado por você ou pelas pessoas da sua Família. No seu Pessoal, só você anota e decide o que registrar.</p>
<p>Dá para criar uma Família de até 6 pessoas, com convite por link, e sair ou encerrar quando quiser.</p>
</article>
<article class="cartao">
<h3>Para empresas</h3>
<p>A empresa pode integrar o cuidado financeiro ao programa de bem-estar e oferecer a Clarevo como benefício. O painel das empresas existe só na web e mostra os e-mails convidados, a situação de cada convite ou licença, as datas e as contagens de vagas. Nunca mostra finanças.</p>
<p><a href="${u('empresas/index.html')}">Veja como funciona para empresas</a>.</p>
</article>
</div>`,
      { rotulo: 'para-quem' },
    ),
    bloco(
      `<div class="destaque">
<h2 id="empresa-nao-ve">A empresa nunca vê suas finanças</h2>
<p>Se a sua empresa oferece a Clarevo, ela vê os e-mails que convidou, a situação de cada convite ou licença (convite enviado, convite cancelado, ativa ou encerrada), as datas (como a em que você aceitou o convite e a de encerramento) e as contagens de vagas e licenças. Nunca vê gastos, recebimentos, valores, categorias, metas, contas, cartões, a sua Família nem números somados. Também não vê quando você abre o app nem o que você anota.</p>
<p>Se o benefício terminar, sua conta e seu histórico não são apagados.</p>
<p><a href="${u('empresas/index.html')}">Para empresas</a> · <a href="${u('seguranca.html')}">Segurança e privacidade</a></p>
</div>`,
      { variante: 'alt', rotulo: 'empresa-nao-ve' },
    ),
    bloco(
      `<h2 id="nao-e">O que a Clarevo não é</h2>
<ul class="nao-e">
<li>Não é banco e não guarda o seu dinheiro.</li>
<li>Não movimenta dinheiro: não faz pagamentos nem transferências.</li>
<li>Não oferece crédito.</li>
<li>Não recomenda produtos financeiros.</li>
<li>Não se conecta a contas bancárias.</li>
<li>Não é atendimento de saúde e não substitui o acompanhamento de profissionais.</li>
</ul>
<p class="nota">A Clarevo é uma ferramenta de organização e de educação financeira. Ela não promete resultado financeiro nem de saúde, e as simulações são exemplos feitos com os números que você digita.</p>`,
      { rotulo: 'nao-e' },
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
      { variante: 'alt', rotulo: 'mais' },
    ),
    bloco(
      `<h2 id="dados">Seus dados</h2>
<p>Sem anúncios, sem venda de dados e sem rastreamento para publicidade. A conexão é protegida. Você exclui a sua conta e os seus dados quando quiser, dentro do app, em Conta. Se não conseguir entrar no app, peça pela página <a href="${u('excluir-conta.html')}">Excluir conta</a>. Os detalhes estão na <a href="${u('privacidade.html')}">Política de privacidade</a>.</p>
<h2 id="contato">Contato</h2>
<p>Para falar com a equipe, inclusive sobre o benefício para empresas: [E-MAIL DE CONTATO]. Para ajuda com o app, veja a <a href="${u('ajuda/index.html')}">Ajuda</a> e a página de <a href="${u('suporte.html')}">Suporte</a>.</p>`,
      { rotulo: 'dados' },
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
    titulo: 'Clarevo: bem-estar financeiro e mais clareza para decidir',
    tituloCompleto: true,
    descricao: DESCRICAO,
    capa,
    corpo: secoes.join('\n'),
    fonte,
    valores,
    jsonld: [organizacao],
  });
}

module.exports = { paginaInicial, DESCRICAO_INICIO: DESCRICAO, MENSAGEM_CENTRAL, FRASE_DE_APOIO };
