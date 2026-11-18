'use strict';
/**
 * Início: a mensagem central (D-068), o que é a Clarevo, o apoio prático do app (bem-estar financeiro, sem promessa de resultado nem de saúde),
 * recursos com vídeo ou captura, para quem é, "A empresa nunca vê suas finanças" e as chamadas. O que a Clarevo não faz fica numa faixa
 * curta na capa, com o texto completo em Segurança e privacidade (D-115). Desde 18/11/2026 (D-115),
 * cada vídeo de uso do app fica no lugar da captura do bloco que ele mostra: o do Resumo na capa e três nos cartões de "O que o app faz".
 */
const { URL_APP } = require('../config');
const { esc } = require('../texto');
const { rel } = require('../util');
const { montarPagina, marcadoresEmHtml, bloco, celular, faixaDeConfianca, dominioDe } = require('../modelo');
const { catalogo } = require('../catalogo');
const { valorDe } = require('../texto');
const { celularComVideo, SCRIPT_DOS_VIDEOS } = require('../videos');
const { ANCORA_DOS_PLANOS } = require('./planos');
const { secaoIndicadoresDeHoje, SCRIPT_DO_PAINEL } = require('./indicadores');

const ARQUIVO = 'index.html';
/** A mensagem central (Manual v2.2, seção 19) e a frase de apoio: as mesmas de `docs/lojas/ficha.md` e das imagens de compartilhamento. */
const MENSAGEM_CENTRAL = 'Cuidar da vida financeira faz parte de cuidar de você.';
const FRASE_DE_APOIO = 'Mais clareza para decidir';
const SUBTEXTO = 'A Clarevo ajuda a organizar o mês e acompanhar decisões financeiras pessoais e familiares, respeitando sua realidade.';
const DESCRICAO = `${MENSAGEM_CENTRAL} ${SUBTEXTO} ${FRASE_DE_APOIO}.`;
/**
 * O aviso de saúde, revisado no pacote do advogado (`docs/legal/resumo-para-advogado.md`, seção j, "Saúde"): o texto não muda. Desde
 * 18/11/2026 (D-115, retorno de quem testa: "O negativo não deveria estar logo no começo da página. Isso é advertência, não propaganda.")
 * ele sai do cartão ao lado de "O que a Clarevo oferece", no começo da página, e fica numa nota discreta no fim da página inicial, perto
 * do bloco da NR-1 em Para empresas e em Sobre.
 */
const AVISO_DE_SAUDE = 'A Clarevo não é atendimento de saúde e não promete resultado financeiro nem efeito sobre saúde mental, sono, produtividade ou tranquilidade. A vida financeira é uma dimensão do bem-estar, entre outras, e o app não tem eficácia clínica comprovada.';

/** A linha curta acima do título, que diz o que a Clarevo é antes da mensagem central (12/11/2026). */
const O_QUE_E = 'App de finanças pessoais e da família';
/** A descrição da página para as buscas e o compartilhamento: a mensagem central e o que é, em até 160 caracteres (a completa, `DESCRICAO`, fica nos dados estruturados). */
const DESCRICAO_CURTA = `${MENSAGEM_CENTRAL} Um app de finanças pessoais e da família para organizar o mês e decidir com mais clareza.`;

/**
 * A seção Planos (pedido do Enzo, 16/11/2026): os dois planos com os nomes, os preços e as frases da tela Assinatura do app, lidos do
 * núcleo (`catalogo().PLANOS`), para o site e o app dizerem o mesmo. Desde 18/11/2026 (D-115), cada cartão leva à página Planos
 * (`planos.html#individual` e `#familia`) por um link só, que cobre o cartão inteiro (sem elemento interativo dentro de outro). Enquanto a assinatura não abre (`PLANOS.aberta`, o SUBSCRIBE_OPEN
 * do app), a seção diz, com a frase da tela Assinatura, que a assinatura abre no lançamento e que nada é cobrado até lá.
 * `u` monta o caminho relativo de um link interno.
 */
function conteudoPlanos(PLANOS, u) {
  const cartoes = PLANOS.texto.plans
    .map(
      (p) => `<article class="cartao plano plano-link">
<h3>${esc(PLANOS.nome[p.plan])}</h3>
<p class="preco"><span class="preco-valor">${esc(PLANOS.preco(p.plan))}</span>${esc(PLANOS.porMes)}</p>
<p>${esc(p.who)}</p>
<p class="ver-plano"><a href="${u(`planos.html#${ANCORA_DOS_PLANOS[p.plan]}`)}">Ver o que o plano ${esc(PLANOS.nome[p.plan])} inclui</a></p>
</article>`,
    )
    .join('\n');
  // Enquanto a assinatura não abre (SUBSCRIBE_OPEN), a mesma frase da tela Assinatura do app: nada é cobrado até o lançamento.
  const aindaNao = PLANOS.aberta ? '' : `<p class="nota">${esc(PLANOS.texto.notOpenYet)}</p>\n`;
  return `<h2 id="planos">${esc(PLANOS.texto.plansTitle)}</h2>
<div class="grade">
${cartoes}
</div>
${aindaNao}<p class="nota">${esc(PLANOS.texto.plansNote)} Depois do teste, sem assinatura, a conta fica só para ver e exportar: os seus dados continuam guardados. Os detalhes estão nos <a href="${u('termos.html')}">Termos de uso</a> e na <a href="${u('ajuda/conta.html')}#guia-assinatura">Ajuda</a>.</p>`;
}

function paginaInicial({ valores, img, videos, retrato }) {
  const u = (d) => rel(ARQUIVO, d);
  const temas = catalogo().publicados.filter((t) => ['organizar', 'juros', 'tempo'].includes(t.section)).length;
  const calculadoras = catalogo().CALCULADORAS.length;

  // `video`: o vídeo de uso que fica no lugar da captura (D-115); sem ele, a captura `id`.
  const recursos = [
    { id: 'anotar', video: 'anotar-gasto', titulo: 'Anotar e ver o mês', texto: 'Anote um gasto ou um recebimento em poucos toques. O Resumo mostra Recebido, Pago, a diferença entre os dois e o que ainda falta pagar, com a explicação de cada número.' },
    { id: 'contas', video: 'importar-fatura-print', titulo: 'Contas, cartões e gastos fixos', texto: 'Contas a pagar com vencimentos e lembretes no aparelho. Cartões de crédito com faturas e limite usado: o app guarda só o apelido e, se você quiser, os 4 últimos dígitos, nunca o número inteiro. A fatura também entra por print, lido no próprio aparelho. Gastos fixos, parcelamentos e contas do ano, como IPVA e IPTU, aparecem sozinhos nos meses certos.' },
    { id: 'metas', video: 'metas', titulo: 'Metas e reserva', texto: 'Metas e reserva para imprevistos, com atalhos de prazo, o ritmo do plano no cartão de cada meta e os marcos de 25%, 50% e 75%. O plano de guardar mostra as etapas e o mês previsto, sem contar rendimento.' },
    { id: 'aprender', titulo: 'Aprender e simular', texto: 'Explicações curtas sobre juros, taxas e contas do dia a dia, cada uma com fonte e data de revisão. O simulador e as calculadoras usam só os números que você digita, e as calculadoras também funcionam aqui no site.' },
  ];
  const mini = recursos
    .map(
      (r) => `<article class="cartao">
<h3>${esc(r.titulo)}</h3>
<p>${esc(r.texto)}</p>
${r.video ? celularComVideo(r.video, { videos, img }, ARQUIVO) : celular(img[r.id], ARQUIVO)}
</article>`,
    )
    .join('\n');

  const { PLANOS } = catalogo();

  const capa = `<div class="capa-grade">
<div>
<p class="sobretitulo">${esc(O_QUE_E)}</p>
<h1>${esc(MENSAGEM_CENTRAL)}</h1>
<p class="lead">${esc(SUBTEXTO)}</p>
<p class="frase-apoio">${esc(FRASE_DE_APOIO)}.</p>
<div class="acoes">
<a class="botao botao-principal" href="${u('app/index.html')}">Conheça a Clarevo</a>
<a class="botao botao-suave" href="${esc(URL_APP)}" rel="noopener noreferrer">Abrir a versão web</a>
</div>
<p class="lojas">Em breve na App Store e no Google Play.</p>
${faixaDeConfianca(ARQUIVO)}
</div>
${celularComVideo('resumo-do-mes', { videos, img }, ARQUIVO)}
</div>`;

  // O fundo alterna pela posição de cada seção.
  let posicao = 0;
  const secao = (conteudo, rotulo) => bloco(conteudo, { variante: posicao++ % 2 ? 'alt' : '', rotulo });

  const brutas = [
    secao(
      `<h2 id="bem-estar">Bem-estar financeiro, com apoio prático</h2>
<p class="lead-bloco">Contas para lembrar, compras para decidir, planos para organizar: o dinheiro participa da rotina. A Clarevo trata a vida financeira como parte do cuidado com o bem-estar e oferece um app para organizar o mês, sem julgamento.</p>
<p class="texto-bloco">Um app para anotar o que entra e o que sai, ver o que ainda vai vencer, acompanhar metas e o que você já investe e aprender o essencial sobre contas e juros, com fonte e data de revisão. Ele parte do que você registra e respeita a sua realidade: renda, trabalho, saúde e responsabilidades da família também limitam as escolhas, e dificuldade financeira não é falta de disciplina.</p>`,
      'bem-estar',
    ),
    secao(
      `<h2 id="telas">O que o app faz</h2>
<p class="lead-bloco">Apoio prático para organizar o mês. Vídeos curtos, sem som, e telas da demonstração da Clarevo: os dados são fictícios, e uma conta nova começa vazia.</p>
<div class="mini mini-par">
${mini}
</div>
<p class="acoes"><a class="botao botao-principal" href="${u('app/index.html')}">Ver o app por dentro</a></p>`,
      'telas',
    ),
    // Os indicadores oficiais (D-106) também na página inicial (D-115), com o mesmo retrato e o mesmo script do painel.
    secao(secaoIndicadoresDeHoje(ARQUIVO, retrato), 'indicadores'),
    secao(
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
<article class="cartao">
<h3>Para quem tem um negócio</h3>
<p>Quem tem CNPJ ou trabalha por conta separa as contas do negócio das pessoais no Espaço Negócio e vê quanto entrou, quanto saiu e quanto sobrou no mês. O plano Individual inclui um negócio por pessoa.</p>
<p><a href="${u('app/index.html')}#negocio">Veja o Espaço Negócio</a>.</p>
</article>
</div>`,
      'para-quem',
    ),
    secao(conteudoPlanos(PLANOS, u), 'planos'),
    secao(
      `<div class="destaque">
<h2 id="empresa-nao-ve">A empresa nunca vê suas finanças</h2>
<p>Se a sua empresa oferece a Clarevo, ela vê os e-mails que convidou, a situação de cada convite ou licença (convite enviado, convite cancelado, ativa ou encerrada), as datas (como a do aceite do convite e a do encerramento) e as contagens de vagas e licenças. Nunca vê gastos, recebimentos, valores, categorias, metas, contas, cartões, a sua Família nem números somados. Também não vê quando você abre o app nem o que você anota.</p>
<p>Se o benefício terminar, sua conta e seu histórico não são apagados.</p>
<p><a href="${u('empresas/index.html')}">Para empresas</a> · <a href="${u('seguranca.html')}">Segurança e privacidade</a></p>
</div>`,
      'empresa-nao-ve',
    ),
    secao(
      `<h2 id="mais">Aprender, calcular, ficar por dentro e tirar dúvidas</h2>
<div class="grade grade-3">
<a class="cartao" href="${u('aprender/index.html')}"><span class="titulo-cartao">Aprender</span><p>${temas} temas de educação financeira, cada um com fontes, data de revisão e, quando cabe, um exemplo calculado.</p></a>
<a class="cartao" href="${u('aprender/agenda.html')}"><span class="titulo-cartao">Agenda financeira</span><p>Mês a mês, os temas que costumam importar, como 13º salário, férias, volta às aulas e Imposto de Renda.</p></a>
<a class="cartao" href="${u('calculadoras/index.html')}"><span class="titulo-cartao">Calculadoras</span><p>${calculadoras} calculadoras para contas rápidas, como parcelado ou à vista, dívidas e reserva, feitas no navegador com os números que você digita. Nada é enviado.</p></a>
<a class="cartao" href="${u('novidades/index.html')}"><span class="titulo-cartao">Novidades</span><p>Textos curtos da Equipe Clarevo, com fonte e data, e as regras de como escrevemos.</p></a>
<a class="cartao" href="${u('ajuda/index.html')}"><span class="titulo-cartao">Ajuda</span><p>Respostas por tema e busca no próprio navegador, sem enviar o que você digita.</p></a>
<a class="cartao" href="${u('seguranca.html')}"><span class="titulo-cartao">Segurança e privacidade</span><p>O que guardamos, o que não guardamos e quem vê o quê, em linguagem simples.</p></a>
</div>`,
      'mais',
    ),
    secao(
      `<h2 id="dados">Seus dados</h2>
<p>Sem anúncios, sem venda de dados e sem rastreamento para publicidade. A conexão é protegida. Você exclui a sua conta e os seus dados quando quiser, dentro do app, em Conta. Se não conseguir entrar no app, peça pela página <a href="${u('excluir-conta.html')}">Excluir conta</a>. Os detalhes estão na <a href="${u('privacidade.html')}">Política de privacidade</a>.</p>
<h2 id="contato">Contato</h2>
<p>Para falar com a equipe, inclusive sobre o benefício para empresas: [E-MAIL DE CONTATO]. Para ajuda com o app, veja a <a href="${u('ajuda/index.html')}">Ajuda</a> e a página de <a href="${u('suporte.html')}">Suporte</a>.</p>
<p class="aviso-final">${AVISO_DE_SAUDE}</p>`,
      'dados',
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
    descricao: DESCRICAO_CURTA,
    capa,
    corpo: secoes.join('\n'),
    fonte,
    valores,
    jsonld: [organizacao],
    scripts: [SCRIPT_DOS_VIDEOS, SCRIPT_DO_PAINEL],
    // A capa do vídeo do Resumo é a primeira imagem grande da página: o navegador pede logo no começo (D-115).
    cabecalho: `<link rel="preload" as="image" href="${u(img['video-resumo-do-mes'].caminho)}" fetchpriority="high">`,
  });
}

module.exports = { paginaInicial, conteudoPlanos, DESCRICAO_INICIO: DESCRICAO, MENSAGEM_CENTRAL, FRASE_DE_APOIO, AVISO_DE_SAUDE };
