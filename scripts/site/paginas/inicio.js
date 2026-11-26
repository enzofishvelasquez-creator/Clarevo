'use strict';
/**
 * Início. Desde 25/11/2026 (D-125, estudo "Clarevo frente ao mercado"), a página diz numa frase o que o app faz, em poucos blocos. Desde
 * 26/11/2026 (D-128, pedido do Enzo), a capa ficou mais leve e a página ganhou dois blocos antes da chamada final:
 *   1. a capa: o título "Cuidar da vida financeira faz parte de cuidar de você." (de novo a frase da marca, sem a assinatura pequena acima;
 *      revisão da D-126), o benefício concreto como primeira frase do subtítulo, as duas chamadas ("Assine aqui" e "Conheça o app", pelo
 *      estado do produto, `estado.js`), a linha curta do teste, a faixa de confiança e o vídeo do Resumo;
 *   2. as três portas: pessoas e famílias, quem trabalha por conta e MEI (`mei.html`) e empresas (`empresas/index.html`);
 *   3. como funciona, em três passos, com o vídeo da fatura por print;
 *   4. "Você decide o que entra": a privacidade e o modelo de negócio;
 *   5. os planos, com os textos do núcleo, a fita "Em breve" em cada cartão antes do lançamento e uma linha só com o teste, o cancelamento e o
 *      "só ver e exportar";
 *   6. "Use no navegador ou no celular" (D-128): a mesma conta na web e no celular, com o link para `web.html`;
 *   7. "Perguntas frequentes" (D-128): seis perguntas recolhidas, com os dados estruturados FAQPage;
 *   8. a chamada final.
 * O que saiu em 25/11/2026 foi para as páginas próprias: "Seus dados" e "A empresa nunca vê suas finanças" estão em Segurança e privacidade
 * e em Para empresas; "Indicadores de hoje" é o painel de `indicadores/index.html`; "Bem-estar financeiro, com apoio prático" virou "Por que
 * a Clarevo existe", em Sobre; "O que o app faz" está em O app.
 */
const { esc } = require('../texto');
const { rel } = require('../util');
const { montarPagina, marcadoresEmHtml, bloco, faixaDeConfianca, dominioDe, icone, telaLarga } = require('../modelo');
const { catalogo } = require('../catalogo');
const { valorDe } = require('../texto');
const { celularComVideo, SCRIPT_DOS_VIDEOS } = require('../videos');
const { PAGINA_DO_PLANO, dadosDoApp, linhaDoAnual, linhaDosPlanos, pessoasNaFamilia } = require('./planos');
const { chamadas, emBreveNoTitulo, estadoEmVigor, fitaEmBreve, linhaDaCapa, noCelular, selosDasLojas, textoDoAcesso } = require('../estado');

const ARQUIVO = 'index.html';
/**
 * O título da página (D-128, Enzo, 26/11/2026, revisão da D-126): de novo a frase da marca (Manual v2.2, seção 19, a mensagem central da ficha
 * das lojas), sem frase pequena acima. O mesmo título das boas-vindas do app (`WELCOME_TEXT.title`, `packages/core/src/welcome.ts`).
 */
const TITULO = 'Cuidar da vida financeira faz parte de cuidar de você.';
const BENEFICIO = 'Contas, cartões e gastos do mês em ordem, com o pessoal, a família e o negócio separados.';
/** A mensagem central (D-068): o título, o `slogan` dos dados estruturados e a ficha das lojas. */
const MENSAGEM_CENTRAL = TITULO;
/** A frase de apoio (D-067): continua na ficha das lojas e nas imagens de compartilhamento, e saiu da capa. */
const FRASE_DE_APOIO = 'Mais clareza para decidir';
/**
 * O subtítulo (D-128): o benefício concreto primeiro (o mesmo subtítulo das boas-vindas do app e a primeira linha das descrições das lojas) e
 * uma frase curta com o que o app mostra.
 */
const SUBTEXTO = `${BENEFICIO} Veja o que entrou, o que saiu e o que ainda vai vencer.`;
/** A descrição completa, nos dados estruturados. */
const DESCRICAO = `${SUBTEXTO} ${TITULO}`;
/** A descrição da página para as buscas e o compartilhamento, em até 160 caracteres, com o termo que as pessoas buscam. */
const DESCRICAO_CURTA = 'Controle de gastos sem planilha: contas, cartões e gastos do mês num app, com o pessoal, a família e o negócio separados. Você decide o que entra.';

/**
 * A seção Planos (pedido do Enzo, 16/11/2026): os dois planos com os nomes, os preços e as frases da tela Assinatura do app, lidos do
 * núcleo (`catalogo().PLANOS`), para o site e o app dizerem o mesmo. Cada cartão tem um link só, que cobre o cartão inteiro, para a página
 * do plano. Desde 27/11/2026 (D-127), cada cartão mostra também o preço anual, com o equivalente por mês. Desde 26/11/2026 (D-128), antes
 * do lançamento cada cartão leva a fita "Em breve" no canto de cima (`fitaEmBreve`, só desenho, com o mesmo "em breve" no título para o
 * leitor de tela), no lugar da etiqueta "Preços no lançamento" e da frase "A assinatura pelo app abre no lançamento. Até lá, nada é
 * cobrado."; embaixo dos cartões, uma linha só (`linhaDosPlanos`). `u` monta o caminho relativo.
 */
function conteudoPlanos(PLANOS, u, estado = estadoEmVigor()) {
  const fita = fitaEmBreve(estado);
  const cartoes = PLANOS.texto.plans
    .map(
      (p) => `<article class="cartao plano plano-link${fita ? ' com-fita' : ''}">
${fita ? `${fita}\n` : ''}<h3>${esc(PLANOS.nome[p.plan])}${emBreveNoTitulo(estado)}</h3>
<p class="preco"><span class="preco-valor">${esc(PLANOS.preco(p.plan))}</span>${esc(PLANOS.porMes)}</p>
${linhaDoAnual(p.plan)}
<p>${esc(p.who)}</p>
<p class="ver-plano"><a href="${u(PAGINA_DO_PLANO[p.plan])}">Ver o que o plano ${esc(PLANOS.nome[p.plan])} inclui</a></p>
</article>`,
    )
    .join('\n');
  return `<h2 id="planos">${esc(PLANOS.texto.plansTitle)}</h2>
<p class="lead-bloco">${esc(PLANOS.texto.plansNote.split('. ')[0])}. O que muda é para quem é a assinatura.</p>
<div class="grade">
${cartoes}
</div>
${linhaDosPlanos(u)}
<p class="acoes"><a class="botao botao-suave" href="${u('planos.html')}">Comparar os planos</a></p>`;
}

/** Uma porta (D-125): um cartão com ícone, título, uma frase e um link só, que cobre o cartão inteiro. */
const porta = (u, { icone: ic, titulo, texto, href, link }) => `<li class="porta">
<span class="porta-icone">${icone(ic)}</span>
<h3>${esc(titulo)}</h3>
<p>${esc(texto)}</p>
<p class="porta-link"><a href="${u(href)}">${esc(link)}</a>${icone('seta', 18, 2)}</p>
</li>`;

/**
 * "Use no navegador ou no celular" (D-128): a mesma conta e os mesmos dados na web e no celular, sem instalar nada no computador, a tela larga
 * com o menu ao lado e o pagamento na web com cartão ou Pix, pelo serviço de pagamento. O celular segue o estado do produto (`noCelular`).
 * A tela do computador (a demonstração, `docs/telas/630_computador_resumo.png`) só aparece a partir de 56 rem: no celular, a captura larga
 * ficaria pequena demais para ler. O detalhe está em `web.html`.
 */
function blocoNaWeb(u, img, estado) {
  const itens = [
    'A mesma conta na web e no celular, com os mesmos dados: o que você anota num aparece no outro.',
    'No computador, nada para instalar: é só abrir o navegador. A tela larga mostra o menu ao lado e o mês inteiro.',
    noCelular(estado),
    'Na web, a assinatura é paga com cartão ou Pix, pelo serviço de pagamento, com os mesmos preços das lojas.',
  ];
  return `<div class="na-web">
<div>
<h2 id="na-web">Use no navegador ou no celular</h2>
<ul class="como-funciona lista-marcada">
${itens.map((i) => `<li>${esc(i)}</li>`).join('\n')}
</ul>
<p class="acoes"><a class="botao botao-suave" href="${u('web.html')}">Ver como é usar no navegador</a></p>
</div>
${telaLarga(img['computador-resumo'], ARQUIVO, { classe: 'so-tela-larga' })}
</div>`;
}

/**
 * As perguntas frequentes da página inicial (D-128): respostas curtas e verdadeiras, conferidas no app (`plano.ts`, o guia de uso, D-055,
 * D-056, D-083, D-113 e Segurança), sem prometer recurso futuro. Texto fixo e sem marcação, escrito aqui: entra na página e nos dados
 * estruturados (FAQPage) igual.
 */
function perguntasDoInicio() {
  const { PLANOS } = catalogo();
  return [
    { id: 'cancelar', pergunta: 'Posso cancelar quando quiser?', resposta: 'Sim. A assinatura no cartão feita na web se cancela na tela Assinatura do app, e a das lojas, na App Store ou no Google Play. O acesso completo continua até o fim do período já pago, sem nova cobrança. O Pix não renova sozinho: basta não pagar o próximo período.' },
    { id: 'quem-ve', pergunta: 'Quem vê os meus dados?', resposta: 'O seu Pessoal é só seu: ninguém mais no app vê, nem as pessoas da sua Família. Se a sua empresa oferece a Clarevo como benefício, ela vê convites, licenças, datas e contagens, nunca os seus valores, categorias ou metas.' },
    { id: 'banco', pergunta: 'A Clarevo se conecta ao meu banco?', resposta: 'Não. A Clarevo não se conecta a bancos e não pede senha bancária. Você decide o que entra: anota no app, importa o extrato ou a fatura (arquivo ou print) ou manda por mensagem.' },
    { id: 'familia', pergunta: 'Como funciona o plano Família?', resposta: `Até ${pessoasNaFamilia()} pessoas na mesma assinatura, paga pela pessoa titular. A Família tem as contas da casa em comum, e o Pessoal de cada pessoa continua só dela.` },
    { id: 'mei', pergunta: 'Tenho MEI ou trabalho por conta. Serve para mim?', resposta: 'Sim. O Espaço Negócio vem nos dois planos, sem custo a mais: o dinheiro do negócio fica separado do Pessoal, com a retirada para o Pessoal, o A receber e o limite do MEI. A Clarevo não calcula imposto nem faz contabilidade.' },
    { id: 'depois', pergunta: `O que acontece depois dos ${PLANOS.diasDeTeste} dias grátis?`, resposta: 'Sem assinatura, a conta fica só para ver e exportar: os seus dados continuam guardados, você vê e exporta tudo e pode excluir a conta, mas não anota nem muda nada. Nada é cobrado sem você assinar.' },
  ];
}

/** As perguntas recolhidas (`<details>`, sem JavaScript), no desenho das de Segurança. */
function blocoDasPerguntas() {
  return `<h2 id="perguntas">Perguntas frequentes</h2>
<div class="duvidas">
${perguntasDoInicio().map((q) => `<details class="duvida" id="pergunta-${q.id}">
<summary>${esc(q.pergunta)}</summary>
<div class="duvida-corpo"><p>${esc(q.resposta)}</p></div>
</details>`).join('\n')}
</div>`;
}

/** As mesmas perguntas como dados estruturados (FAQPage, D-128). */
function dadosDasPerguntas() {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: perguntasDoInicio().map((q) => ({ '@type': 'Question', name: q.pergunta, acceptedAnswer: { '@type': 'Answer', text: q.resposta } })),
  };
}

function paginaInicial({ valores, img, videos, estado }) {
  const u = (d) => rel(ARQUIVO, d);
  const { PLANOS } = catalogo();

  // D-128: o título sem frase pequena acima, o benefício no subtítulo e as chamadas "Assine aqui" e "Conheça o app".
  const capa = `<div class="capa-grade">
<div>
<h1>${esc(TITULO)}</h1>
<p class="lead">${esc(SUBTEXTO)}</p>
${chamadas(ARQUIVO, estado, { secundaria: 'app' })}
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
    secao(blocoNaWeb(u, img, estado), 'na-web'),
    secao(blocoDasPerguntas(), 'perguntas'),
    secao(
      `<div class="chamada-final">
<h2 id="comecar">Comece pelo seu mês</h2>
<p>${esc(`Escolha o plano, anote os gastos de hoje e veja o mês tomar forma, no navegador ou no celular.${estado.lancado ? ` ${textoDoAcesso(estado)}` : ''}`)}</p>
${chamadas(ARQUIVO, estado, { secundaria: 'web' })}
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
    jsonld: [organizacao, dadosDoApp(valores, estado, DESCRICAO_CURTA), dadosDasPerguntas()],
    scripts: [SCRIPT_DOS_VIDEOS],
    // A capa do vídeo do Resumo é a primeira imagem grande da página: o navegador pede logo no começo (D-115).
    cabecalho: `<link rel="preload" as="image" href="${u(img['video-resumo-do-mes'].caminho)}" fetchpriority="high">`,
  });
}

module.exports = { paginaInicial, conteudoPlanos, perguntasDoInicio, DESCRICAO_INICIO: DESCRICAO, TITULO_DO_INICIO: TITULO, BENEFICIO_DO_INICIO: BENEFICIO, MENSAGEM_CENTRAL, FRASE_DE_APOIO };
