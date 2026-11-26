'use strict';
/**
 * Início. Desde 25/11/2026 (D-125, estudo "Clarevo frente ao mercado"), a página diz numa frase o que o app faz e tem seis blocos, no lugar
 * dos dez de antes (cerca de 11.800 px no celular):
 *   1. a capa: o título com o benefício concreto (contas, cartões e gastos do mês, com o pessoal, a família e o negócio separados), a frase de
 *      marca "Cuidar da vida financeira faz parte de cuidar de você." como assinatura pequena acima dele, as duas chamadas que dizem aonde
 *      levam (pelo estado do produto, `estado.js`), a linha do acesso, a faixa de confiança e o vídeo do Resumo;
 *   2. as três portas: pessoas e famílias, quem trabalha por conta e MEI (`mei.html`) e empresas (`empresas/index.html`);
 *   3. como funciona, em três passos, com o vídeo da fatura por print;
 *   4. "Você decide o que entra": a privacidade e o modelo de negócio (a Clarevo ganha com a assinatura, sem anúncios nem venda de dados, e a
 *      empresa nunca vê as finanças de ninguém);
 *   5. os planos, com os textos do núcleo e, antes do lançamento, a etiqueta "Preços no lançamento";
 *   6. a chamada final.
 * O que saiu foi para as páginas próprias, sem apagar nada: "Seus dados" e "A empresa nunca vê suas finanças" estão inteiros em Segurança e
 * privacidade e em Para empresas; "Indicadores de hoje" é o painel de `indicadores/index.html` (no rodapé); "Bem-estar financeiro, com apoio
 * prático" virou "Por que a Clarevo existe", em Sobre; "O que o app faz" está em O app; os atalhos de Aprender, Calculadoras, Novidades e
 * Ajuda estão no menu e no rodapé; o contato está em Sobre e em Suporte.
 */
const { esc } = require('../texto');
const { rel } = require('../util');
const { montarPagina, marcadoresEmHtml, bloco, faixaDeConfianca, dominioDe, icone } = require('../modelo');
const { catalogo } = require('../catalogo');
const { valorDe } = require('../texto');
const { celularComVideo, SCRIPT_DOS_VIDEOS } = require('../videos');
const { PAGINA_DO_PLANO, dadosDoApp, pessoasNaFamilia } = require('./planos');
const { avisoDaAssinatura, chamadas, estadoEmVigor, linhaDaCapa, rotuloDosPrecos, selosDasLojas, textoDoAcesso } = require('../estado');

const ARQUIVO = 'index.html';
/**
 * O título da página (D-125): o benefício concreto, numa frase. As duas alternativas para o Enzo escolher estão em `docs/22_SITE.md`,
 * seção 19.
 */
const TITULO = 'Organize as contas, os cartões e os gastos do mês, com a vida pessoal, a família e o negócio cada um no seu lugar.';
/** A mensagem central de antes (Manual v2.2, seção 19), agora a assinatura da marca, pequena, acima do título. A mesma da ficha das lojas. */
const MENSAGEM_CENTRAL = 'Cuidar da vida financeira faz parte de cuidar de você.';
/** A frase de apoio (D-067): continua na ficha das lojas e nas imagens de compartilhamento, e saiu da capa. */
const FRASE_DE_APOIO = 'Mais clareza para decidir';
const SUBTEXTO = 'Anote por mensagem, pela câmera ou importando o extrato e veja o que entrou, o que saiu e o que ainda vai vencer. Cada espaço com as suas contas, e o seu Pessoal só você vê.';
/** A descrição completa, nos dados estruturados. */
const DESCRICAO = `${TITULO} ${SUBTEXTO} ${MENSAGEM_CENTRAL}`;
/** A descrição da página para as buscas e o compartilhamento, em até 160 caracteres, com o termo que as pessoas buscam. */
const DESCRICAO_CURTA = 'Controle de gastos sem planilha: contas, cartões e gastos do mês num app, com o pessoal, a família e o negócio separados. Você decide o que entra.';

/**
 * A seção Planos (pedido do Enzo, 16/11/2026): os dois planos com os nomes, os preços e as frases da tela Assinatura do app, lidos do
 * núcleo (`catalogo().PLANOS`), para o site e o app dizerem o mesmo. Cada cartão tem um link só, que cobre o cartão inteiro, para a página
 * do plano. Enquanto a assinatura não abre (o SUBSCRIBE_OPEN do app, pelo estado do produto: `avisoDaAssinatura`), a frase da tela
 * Assinatura diz que nada é cobrado até o lançamento; o site lançado exige a assinatura aberta, então a frase nunca aparece nele. Desde
 * 25/11/2026 (D-125), antes do lançamento os preços levam a etiqueta "Preços no lançamento" (`estado.js`), e a seção termina em "Comparar
 * os planos". Só os planos mensais que existem hoje: o anual entra quando existir. `u` monta o caminho relativo.
 */
function conteudoPlanos(PLANOS, u, estado = estadoEmVigor()) {
  const cartoes = PLANOS.texto.plans
    .map(
      (p) => `<article class="cartao plano plano-link">
<h3>${esc(PLANOS.nome[p.plan])}</h3>
<p class="preco"><span class="preco-valor">${esc(PLANOS.preco(p.plan))}</span>${esc(PLANOS.porMes)}</p>
<p>${esc(p.who)}</p>
<p class="ver-plano"><a href="${u(PAGINA_DO_PLANO[p.plan])}">Ver o que o plano ${esc(PLANOS.nome[p.plan])} inclui</a></p>
</article>`,
    )
    .join('\n');
  const rotulo = rotuloDosPrecos(estado);
  // Enquanto a assinatura não abre (SUBSCRIBE_OPEN, pelo estado do produto), a mesma frase da tela Assinatura do app: nada é cobrado até o
  // lançamento.
  const aviso = avisoDaAssinatura(estado);
  const aindaNao = aviso ? ` ${esc(aviso)}` : '';
  return `<h2 id="planos">${esc(PLANOS.texto.plansTitle)}</h2>
${rotulo ? `<p class="etiqueta-precos"><span class="etiqueta">${esc(rotulo)}</span></p>\n` : ''}<div class="grade">
${cartoes}
</div>
<p class="nota">${esc(PLANOS.texto.plansNote)} Depois do teste, sem assinatura, a conta fica só para ver e exportar: os seus dados continuam guardados.${aindaNao} Os detalhes estão nos <a href="${u('termos.html')}">Termos de uso</a> e na <a href="${u('ajuda/conta.html')}#guia-assinatura">Ajuda</a>.</p>
<p class="acoes"><a class="botao botao-suave" href="${u('planos.html')}">Comparar os planos</a></p>`;
}

/** Uma porta (D-125): um cartão com ícone, título, uma frase e um link só, que cobre o cartão inteiro. */
const porta = (u, { icone: ic, titulo, texto, href, link }) => `<li class="porta">
<span class="porta-icone">${icone(ic)}</span>
<h3>${esc(titulo)}</h3>
<p>${esc(texto)}</p>
<p class="porta-link"><a href="${u(href)}">${esc(link)}</a>${icone('seta', 18, 2)}</p>
</li>`;

function paginaInicial({ valores, img, videos, estado }) {
  const u = (d) => rel(ARQUIVO, d);
  const { PLANOS } = catalogo();

  const capa = `<div class="capa-grade">
<div>
<p class="assinatura-marca">${esc(MENSAGEM_CENTRAL)}</p>
<h1>${esc(TITULO)}</h1>
<p class="lead">${esc(SUBTEXTO)}</p>
${chamadas(ARQUIVO, estado)}
<p class="estado-produto">${esc(linhaDaCapa(estado))}</p>
${selosDasLojas(estado)}
${faixaDeConfianca(ARQUIVO)}
</div>
${celularComVideo('resumo-do-mes', { videos, img }, ARQUIVO)}
</div>`;

  // O fundo alterna pela posição de cada seção.
  let posicao = 0;
  const secao = (conteudo, rotulo) => bloco(conteudo, { variante: posicao++ % 2 ? 'alt' : '', rotulo });

  const portas = [
    { icone: 'pessoas', titulo: 'Pessoas e famílias', texto: `O seu Pessoal e, se quiser, uma Família de até ${pessoasNaFamilia()} pessoas, com as contas da casa em comum e o Pessoal de cada pessoa só dela.`, href: PAGINA_DO_PLANO.familiar, link: 'Ver o plano Família' },
    { icone: 'negocio', titulo: 'Quem trabalha por conta e MEI', texto: 'O dinheiro do negócio separado do da casa, com o fiado, a retirada para o Pessoal e o limite do MEI. Incluído na assinatura.', href: 'mei.html', link: 'Ver o Espaço Negócio' },
    { icone: 'empresa', titulo: 'Empresas', texto: 'A Clarevo como benefício para a equipe. A empresa acompanha convites e licenças e nunca vê as finanças de ninguém.', href: 'empresas/index.html', link: 'Ver Para empresas' },
  ];

  const passos = [
    { titulo: 'Anote do jeito mais fácil', texto: 'Uma mensagem no Telegram, a câmera na nota ou no boleto, o extrato e a fatura importados, ou poucos toques no app.' },
    { titulo: 'Veja o mês', texto: 'O Resumo mostra o que entrou, o que saiu e o que ainda vai vencer, com contas a pagar, cartões e metas no mesmo lugar.' },
    { titulo: 'Família e Negócio no mesmo app', texto: `No plano Família, até ${pessoasNaFamilia()} pessoas dividem as contas da casa. O Espaço Negócio vem nos dois planos. Cada espaço fica separado do outro.` },
  ];

  const brutas = [
    secao(
      `<h2 id="para-quem">Para quem é</h2>
<p class="lead-bloco">Uma promessa para três jeitos de viver o dinheiro: o mês organizado, cada coisa no seu lugar.</p>
<ul class="portas" role="list">
${portas.map((p) => porta(u, p)).join('\n')}
</ul>`,
      'para-quem',
    ),
    secao(
      `<h2 id="como-funciona">Como funciona</h2>
<div class="passos-com-celular">
<ol class="passos passos-lista">
${passos.map((p) => `<li><h3>${esc(p.titulo)}</h3><p>${esc(p.texto)}</p></li>`).join('\n')}
</ol>
${celularComVideo('importar-fatura-print', { videos, img }, ARQUIVO)}
</div>
<p class="acoes"><a class="botao botao-suave" href="${u('app/index.html')}">Ver o app por dentro</a></p>`,
      'como-funciona',
    ),
    secao(
      `<h2 id="voce-decide">Você decide o que entra</h2>
<p class="lead-bloco">Só aparece no app o que você anota, importa ou manda por mensagem. A Clarevo não movimenta dinheiro e não guarda os dados completos do cartão.</p>
<div class="grade grade-3">
<article class="cartao">
<h3>A Clarevo ganha com a assinatura</h3>
<p>Sem anúncios, sem venda de dados e sem indicar produto financeiro. Quem sustenta a Clarevo é a assinatura de quem usa e o benefício que empresas oferecem.</p>
</article>
<article class="cartao">
<h3>O seu Pessoal é só seu</h3>
<p>Na Família, cada pessoa vê o que o papel permite, e o negócio fica só com quem o criou. A tela "Quem vê estes dados?" mostra quem tem acesso.</p>
</article>
<article class="cartao">
<h3>A empresa nunca vê as suas finanças</h3>
<p>Se a sua empresa oferece a Clarevo, ela vê convites, licenças, datas e contagens. Nunca valores, categorias, metas nem números somados.</p>
</article>
</div>
<p class="nota"><a href="${u('seguranca.html')}">Segurança e privacidade</a> · <a href="${u('privacidade.html')}">Política de privacidade</a> · <a href="${u('sobre.html')}">Sobre a Clarevo</a></p>`,
      'voce-decide',
    ),
    secao(conteudoPlanos(PLANOS, u, estado), 'planos'),
    secao(
      `<div class="chamada-final">
<h2 id="comecar">${estado.lancado ? 'Comece pelo seu mês' : 'Veja a Clarevo funcionando'}</h2>
<p>${estado.lancado ? esc(`Crie a conta, anote os gastos de hoje e veja o mês tomar forma. ${textoDoAcesso(estado)}`) : `A demonstração abre o app com dados fictícios, no navegador, sem criar conta. O acesso para pessoas e famílias abre no lançamento; até lá, acompanhe as <a href="${u('novidades/index.html')}">Novidades</a>.`}</p>
${chamadas(ARQUIVO, estado)}
</div>`,
      'comecar',
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
    slogan: MENSAGEM_CENTRAL,
    ...(razao ? { legalName: razao } : {}),
    ...(dominio ? { url: `https://${dominio}/`, logo: `https://${dominio}/marca/icone-app.png` } : {}),
  };

  const fonte = brutas.join('\n') + capa;
  return montarPagina({
    arquivo: ARQUIVO,
    titulo: 'Clarevo: controle de gastos, contas e cartões do mês',
    tituloCompleto: true,
    descricao: DESCRICAO_CURTA,
    capa,
    corpo: secoes.join('\n'),
    fonte,
    valores,
    jsonld: [organizacao, dadosDoApp(valores, estado, DESCRICAO_CURTA)],
    scripts: [SCRIPT_DOS_VIDEOS],
    // A capa do vídeo do Resumo é a primeira imagem grande da página: o navegador pede logo no começo (D-115).
    cabecalho: `<link rel="preload" as="image" href="${u(img['video-resumo-do-mes'].caminho)}" fetchpriority="high">`,
  });
}

module.exports = { paginaInicial, conteudoPlanos, DESCRICAO_INICIO: DESCRICAO, TITULO_DO_INICIO: TITULO, MENSAGEM_CENTRAL, FRASE_DE_APOIO };
