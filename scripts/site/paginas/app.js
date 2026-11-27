'use strict';
/**
 * O app: um passeio pelos recursos, cada um com o vídeo de uso ou a captura da DEMONSTRAÇÃO (dados fictícios). O "para que serve" de cada
 * recurso vem do guia de uso do core (`packages/core/src/guide`), então o site não promete o que o app não faz. Onde está disponível segue
 * o estado do produto (`estado.js`, D-125): antes do lançamento, a web (o link só para a tela de entrar, de quem já tem conta) e as lojas
 * "em breve", sem selos; depois, a web e os selos de cada loja com endereço. Desde 26/11/2026 (D-128), as chamadas da capa são "Assine aqui"
 * e "Use no navegador" (`web.html`), e a demonstração fica só como um link de texto discreto, logo abaixo delas. Desde 18/11/2026 (D-115), cada vídeo fica no
 * lugar da captura do recurso que ele mostra e toca sozinho enquanto aparece (`js/videos.js`), em vez de ficarem todos juntos numa seção.
 *
 * Desde 27/11/2026 (análise geral de 26/11, lista "Depois": a página tinha cerca de 21 telas de celular em 390 px), a página fica em cinco
 * blocos curtos: "Como funciona" (as cinco abas e os três recursos do dia a dia, à vista), "Os recursos" (a lista dos outros numa frase e,
 * recolhidos num `<details>`, os mesmos recursos e os cartões de "E mais", com as telas e os vídeos), "Seus dados", "Onde usar" e a
 * chamada dos planos. Nada saiu: o que não está à vista está recolhido, com o mesmo texto (`docs/22_SITE.md`, seção 22).
 */
const { chamadas, linhaDaCapa, linkDaDemonstracao, linkDaVersaoWeb, lojasPublicadas, selosDasLojas } = require('../estado');
const { esc } = require('../texto');
const { rel } = require('../util');
const { montarPagina, marcadoresEmHtml, bloco, celular, faixaDeConfianca } = require('../modelo');
const { catalogo } = require('../catalogo');
const { celularComVideo, SCRIPT_DOS_VIDEOS } = require('../videos');

const ARQUIVO = 'app/index.html';

/**
 * Os recursos do passeio, na ordem. `guia`: ids do guia de uso (o primeiro dá o texto principal); `imagem`: id da captura; `video`: o vídeo
 * de uso que fica no lugar da captura (D-115); `itens`: pontos curtos, escritos conferindo o código e o guia, sem repetir o que o texto do
 * guia já diz logo acima.
 */
const RECURSOS = [
  {
    id: 'resumo',
    titulo: 'Resumo do mês',
    guia: ['resumo'],
    imagem: 'resumo',
    video: 'resumo-do-mes',
    itens: [
      'Recebido e Pago pela data em que o dinheiro entrou ou saiu.',
      'A Diferença do mês é recebido menos pago, e o app lembra que ela não é o saldo da conta.',
      'Ainda a pagar neste mês, separado do que já foi pago, e a renda comprometida do mês.',
    ],
  },
  {
    id: 'anotar',
    titulo: 'Anotar gasto e recebimento',
    guia: ['anotar-gasto'],
    imagem: 'anotar',
    video: 'anotar-gasto',
    itens: [
      'Poucos toques, com o rascunho guardado e um aviso antes de descartar.',
      'Escolha como pagou (dinheiro, débito ou Pix, ou cartão de crédito) e de onde o dinheiro saiu.',
      'Importe extrato ou fatura de um arquivo do banco (PDF, OFX ou planilha) ou de prints da tela do banco e confira linha por linha antes de gravar.',
    ],
  },
  {
    id: 'nota',
    titulo: 'Leitura de nota fiscal e de comprovante',
    lista: 'leitura de nota fiscal e de comprovante',
    guia: ['nota-fiscal'],
    imagem: 'nota',
    itens: [
      'Leia o QR Code da nota com a câmera, o PDF de uma compra on-line ou cole o link ou a chave.',
      'O PDF de comprovante de Pix ou de pagamento também pode ser lido. O arquivo é lido no aparelho e não é guardado.',
      'A câmera só lê o código: nenhuma foto é guardada. Da nota, só um resumo matemático da chave é guardado, nunca o CPF.',
    ],
  },
  {
    id: 'contas',
    titulo: 'Contas a pagar e gastos fixos',
    guia: ['contas-a-pagar', 'gastos-fixos', 'contas-do-ano'],
    imagem: 'contas',
    video: 'calendario-do-mes',
    itens: [
      'O gasto só entra em Pago quando você marca a conta como paga, e dá para desfazer.',
      'Lembretes de vencimento no app para celular, no dia anterior.',
      'No Calendário do mês, as contas, as faturas e os gastos fixos aparecem por dia, com o previsto separado do que já foi pago.',
    ],
  },
  {
    id: 'cartoes',
    titulo: 'Cartões e faturas',
    lista: 'cartões e faturas',
    guia: ['cartoes'],
    imagem: 'cartoes',
    video: 'importar-fatura-print',
    itens: [
      'Compras à vista e parceladas, fatura atual, próximas faturas e limite usado.',
      'O app guarda só o apelido e, se você quiser, os 4 últimos dígitos. Nunca o número completo, o código de segurança nem a validade.',
      'Anote as compras ou o pagamento da fatura, nunca os dois, para o mesmo gasto não contar duas vezes.',
      'Na tela do cartão, Importar fatura lê o arquivo ou os prints da fatura aberta no próprio aparelho, e você confere cada linha antes de importar.',
    ],
  },
  {
    id: 'evolucao',
    titulo: 'Evolução e análises',
    lista: 'evolução e análises',
    guia: ['evolucao', 'analises'],
    imagem: 'evolucao',
    itens: [
      'Categorias em barras ou em bolhas e o orçamento por categoria.',
    ],
  },
  {
    id: 'metas',
    titulo: 'Metas e reserva',
    lista: 'metas e reserva',
    guia: ['metas', 'plano-de-guardar'],
    imagem: 'metas',
    video: 'metas',
    itens: [
      'Reserva para imprevistos e metas com prazo, com o valor guardado só pelo que você registra. Os atalhos de prazo (6 meses, 1 ano, 2 anos ou 5 anos) preenchem a data por você.',
      'O cartão de cada meta com valor planejado por mês mostra o ritmo: se os aportes acompanham o plano e quanto falta. Ao passar de 25%, 50% e 75% da meta, uma frase curta marca o avanço.',
      'Aportes e resgates não entram em Pago nem em Recebido: o dinheiro continua seu, só mudou de lugar.',
      'O plano de guardar mostra as etapas e o mês previsto, sem contar rendimento.',
    ],
  },
  {
    id: 'investir',
    titulo: 'Investir',
    guia: ['investimentos'],
    video: 'investir',
    itens: [
      'Você registra o que aplicou, os aportes, os resgates, os rendimentos e o valor de hoje, como aparecem no seu extrato.',
      'A rentabilidade dos meses fechados aparece ao lado do CDI e do IPCA do mesmo período, com dados públicos do Banco Central.',
      'Não é recomendação de investimento, e os investimentos ficam só no seu Pessoal.',
    ],
  },
  {
    id: 'familia',
    titulo: 'Família',
    guia: ['familia'],
    imagem: 'familia',
    itens: [
      'Convite por link, de uso único e válido por 7 dias, com o papel de quem anota e vê ou de quem só vê.',
      'Cada pessoa vê o que o papel permite, e o Pessoal de cada uma continua só dela.',
      'Quem quiser sai da Família, e quem é titular pode passar a titularidade ou encerrar.',
    ],
  },
  {
    // D-115: o Espaço Negócio (D-113, `docs/52_ESPACO_NEGOCIO.md`), com a tela do cenário "negocio" da demonstração.
    id: 'negocio',
    titulo: 'Espaço Negócio',
    guia: ['negocio'],
    imagem: 'negocio',
    itens: [
      'Categorias próprias do negócio, como "Vendas", "Serviços", "Material e mercadoria", "Taxas e maquininha" e "Impostos e DAS".',
      'Numa tela própria do negócio, quanto entrou, quanto saiu e quanto sobrou no mês e nos últimos 6 meses, e as maiores saídas.',
      'A Retirada para o Pessoal leva dinheiro do negócio para casa: sai do negócio e entra no Pessoal como recebimento, sem contar duas vezes.',
      'Incluído na assinatura: um negócio por pessoa, sem custo a mais. É leve: a Clarevo não faz contabilidade nem cálculo de impostos.',
    ],
  },
  {
    id: 'aprender',
    titulo: 'Aprender e calculadoras',
    guia: ['aprender', 'calculadoras'],
    imagem: 'aprender',
    itens: [
      'Explicações curtas, com fonte, data de revisão e exemplos calculados quando cabem. O app não registra o que você lê nem o que busca.',
      'Calculadoras e simulador com os números que você digita, sem gravar nada.',
      'No site, os mesmos temas estão em Aprender.',
    ],
  },
];

/**
 * Recursos menores, com captura menor. Os lembretes não têm captura: são do app para celular, e a demonstração só existe no navegador, onde
 * a tela mostra apenas o aviso de que eles não existem. O tema (D-112) não tem entrada no guia do app: o cartão leva o vídeo do tema (D-115)
 * e a resposta da Ajuda do site (`ajuda`, em `site-src/ajuda/perguntas.md`).
 */
const MAIS = [
  { id: 'lembretes', titulo: 'Lembretes', lista: 'lembretes', guia: 'lembretes', imagem: null, texto: 'Um aviso no dia anterior ao vencimento de cada conta, no app para celular. Na tela bloqueada, o aviso não mostra valor nem descrição.' },
  { id: 'quem-ve', titulo: 'Quem vê estes dados', lista: 'a tela Quem vê estes dados', guia: 'quem-ve', imagem: 'quem-ve', texto: 'Uma tela no próprio app mostra quem tem acesso aos registros: no Pessoal, só você, entre as pessoas do app.' },
  { id: 'beneficio', titulo: 'Benefício pela empresa', lista: 'benefício pela empresa', guia: 'beneficio-da-empresa', imagem: 'beneficio', texto: 'Quem recebe o convite da empresa aceita pelo link. O app mostra a empresa, o plano e desde quando vale.' },
  { id: 'tema', titulo: 'Tema claro ou escuro', lista: 'tema claro ou escuro', ajuda: 'ajuda/conta.html#p-tema', video: 'tema-escuro-claro', texto: 'Por padrão, a Clarevo segue o tema do aparelho. Em Conta, no card Tema, dá para escolher Claro ou Escuro, e a escolha vale só para aquele aparelho.' },
];

/**
 * Os três recursos à vista em "Como funciona" (análise geral de 26/11/2026, lista "Depois": a página tinha cerca de 21 telas de celular): ver
 * o mês, anotar e acompanhar as contas. Os outros, com os "E mais", ficam em "Os recursos", recolhidos num `<details>` ("Ver todos os
 * recursos, com telas e vídeos"), com o mesmo texto, as mesmas telas e os mesmos vídeos de antes.
 */
const A_VISTA = ['resumo', 'anotar', 'contas'];

/**
 * "Seus dados" (a mesma rodada): o essencial de privacidade, à vista, em quatro cartões curtos, com os fatos que a página Segurança e
 * privacidade, a faixa de confiança e os próprios recursos já dizem (o Pessoal só da pessoa, nada de banco, o cartão e a nota sem dado
 * completo, o modelo de negócio, exportar e excluir). Nada novo: o detalhe continua em Segurança e privacidade.
 */
const SEUS_DADOS = [
  ['O seu Pessoal é só seu', 'Ninguém mais no app vê o seu Pessoal, nem as pessoas da sua Família. Na Família, cada pessoa vê o que o papel permite, e a tela Quem vê estes dados mostra quem tem acesso.'],
  ['Você decide o que entra', 'A Clarevo não se conecta ao banco e não pede senha bancária. Só aparece no app o que você anota, importa ou manda por mensagem.'],
  ['Do cartão, só o apelido', 'O app guarda o apelido do cartão e, se você quiser, os 4 últimos dígitos: nunca o número completo, o código de segurança nem a validade. Da nota fiscal, nenhuma foto e nunca o CPF.'],
  ['Sem anúncios e sem venda de dados', 'A Clarevo ganha com a assinatura e com o benefício que empresas oferecem. Você exporta os seus gastos e recebimentos quando quiser e pode excluir a conta no próprio app.'],
];

function paginaApp({ valores, img, videos, estado }) {
  const { BENEFICIO_DO_INICIO } = require('./inicio');
  const u = (d) => rel(ARQUIVO, d);
  const c = catalogo();
  const guia = (id) => c.GUIA.find((e) => e.id === id);

  const artigo = (r) => {
    const principal = guia(r.guia[0]);
    if (!principal) throw new Error(`o guia do core não tem a entrada "${r.guia[0]}" (página O app)`);
    const extras = r.guia.slice(1).map((id) => {
      const e = guia(id);
      if (!e) throw new Error(`o guia do core não tem a entrada "${id}" (página O app)`);
      return e;
    });
    // O texto do guia de cada entrada a mais leva o nome dela ("Contas do ano. Para contas que vencem..."): sem o título que o app mostra
    // acima, a frase do guia ficava solta (12/11/2026).
    const propositos = [`<p>${esc(principal.purpose)}</p>`, ...extras.map((e) => `<p><strong>${esc(e.title)}.</strong> ${esc(e.purpose)}</p>`)].join('\n');
    return `<article class="recurso" id="${r.id}" aria-labelledby="t-${r.id}">
<div>
<h3 id="t-${r.id}">${esc(r.titulo)}</h3>
${propositos}
${r.itens.length ? `<ul>\n${r.itens.map((i) => `<li>${esc(i)}</li>`).join('\n')}\n</ul>` : ''}
<p class="pequeno"><a href="${u(`ajuda/${require('./ajuda').temaDoGuia(r.guia[0])}.html#guia-${r.guia[0]}`)}">Como usar, passo a passo</a></p>
</div>
${r.video ? celularComVideo(r.video, { videos, img }, ARQUIVO) : celular(img[r.imagem], ARQUIVO)}
</article>`;
  };
  for (const id of A_VISTA) if (!RECURSOS.some((r) => r.id === id)) throw new Error(`O app: o recurso "${id}" de A_VISTA não existe`);
  const aVista = RECURSOS.filter((r) => A_VISTA.includes(r.id)).map(artigo).join('\n');
  const recolhidos = RECURSOS.filter((r) => !A_VISTA.includes(r.id));

  const cartaoMais = (m) => {
    let comoUsar = m.ajuda;
    if (m.guia) {
      if (!guia(m.guia)) throw new Error(`o guia do core não tem a entrada "${m.guia}" (página O app)`);
      comoUsar = `ajuda/${require('./ajuda').temaDoGuia(m.guia)}.html#guia-${m.guia}`;
    }
    const figura = m.video ? celularComVideo(m.video, { videos, img }, ARQUIVO) : m.imagem ? celular(img[m.imagem], ARQUIVO) : '';
    return `<article class="cartao${figura ? '' : ' sem-captura'}">
<h3>${esc(m.titulo)}</h3>
<p>${esc(m.texto)}</p>
${figura}
<p class="pequeno"><a href="${u(comoUsar)}">Como usar</a></p>
</article>`;
  };
  // Os recursos sem tela (os Lembretes, que só existem no app para celular) ficam num cartão só de texto, na largura toda, em cima dos
  // cartões com celular, que ficam numa linha só, todos com tela (revisão de 18/11/2026: um cartão sem tela numa linha de quatro).
  const semTela = MAIS.filter((m) => !m.video && !m.imagem).map(cartaoMais).join('\n');
  const comTela = MAIS.filter((m) => m.video || m.imagem).map(cartaoMais).join('\n');
  const mais = `${semTela ? `<div class="grade grade-texto">\n${semTela}\n</div>\n` : ''}<div class="mini">\n${comTela}\n</div>`;

  // A lista, numa frase, do que está recolhido em "Os recursos": quem não abre continua sabendo o que o app tem.
  const nomes = [...recolhidos.map((r) => r.lista ?? r.titulo), ...MAIS.map((m) => m.lista ?? m.titulo)];
  const listaDosRecolhidos = `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`;

  // As chamadas e as lojas seguem o estado do produto (`estado.js`): "Assine aqui" (antes do lançamento, para os planos, que dizem "Em
  // breve"; depois, para criar conta) e "Use no navegador" (D-128); a demonstração, só como link de texto; as lojas "em breve" antes do
  // lançamento e, depois, os selos de cada loja com endereço. Desde a análise de 26/11/2026, o lead diz o que o app faz (antes, "Um passeio
  // pelos recursos do app", um texto sobre a própria página).
  const capa = `<h1>A Clarevo por dentro</h1>
<p class="lead">${esc(BENEFICIO_DO_INICIO)} As telas e os vídeos usam dados fictícios, e uma conta nova começa vazia.</p>
${chamadas(ARQUIVO, estado, { secundaria: 'web' })}
${linkDaDemonstracao()}
${estado.lancado ? selosDasLojas(estado, { pequenos: true }) : '<p class="lojas">Em breve na App Store e no Google Play.</p>'}
${faixaDeConfianca(ARQUIVO)}`;
  const lojas = lojasPublicadas(estado);
  const noCelular = estado.lancado && lojas.length
    ? `<article class="cartao">
<h3>No celular</h3>
<p>O app para ${lojas.map((l) => (l.id === 'appStore' ? 'iPhone, na App Store' : 'Android, no Google Play')).join(', e para ')}. Alguns recursos, como os lembretes e a leitura do QR Code pela câmera, são do app para celular.</p>
${selosDasLojas(estado)}
</article>`
    : `<article class="cartao">
<h3>No celular</h3>
<p><span class="etiqueta">Em breve</span> O app para iPhone e Android será publicado na App Store e no Google Play. Alguns recursos, como os lembretes e a leitura do QR Code pela câmera, são do app para celular.</p>
</article>`;

  const { PLANOS } = c;
  const brutas = [
    bloco(
      `<h2 id="como-funciona">Como funciona</h2>
<p class="lead-bloco">O app tem cinco abas: Resumo, Movimentos, Metas, Investir e Aprender. No dia a dia, você vê o mês, anota o que gastou ou recebeu e acompanha as contas a pagar.</p>
<div class="recursos">
${aVista}
</div>`,
      { rotulo: 'como-funciona' },
    ),
    bloco(
      `<h2 id="recursos">Os recursos</h2>
<p class="lead-bloco">Também no app: ${esc(listaDosRecolhidos)}.</p>
<details class="ver-mais" id="todos-os-recursos">
<summary>Ver todos os recursos</summary>
<div class="ver-mais-corpo">
<div class="recursos">
${recolhidos.map(artigo).join('\n')}
</div>
${mais}
</div>
</details>`,
      { variante: 'alt', rotulo: 'recursos' },
    ),
    bloco(
      `<h2 id="seus-dados">Seus dados</h2>
<div class="grade">
${SEUS_DADOS.map(([titulo, texto]) => `<article class="cartao">\n<h3>${esc(titulo)}</h3>\n<p>${esc(texto)}</p>\n</article>`).join('\n')}
</div>
<p class="nota"><a href="${u('seguranca.html')}">Segurança e privacidade</a> · <a href="${u('privacidade.html')}">Política de privacidade</a></p>`,
      { rotulo: 'seus-dados' },
    ),
    bloco(
      `<h2 id="onde">Onde usar</h2>
<div class="grade">
<article class="cartao">
<h3>Na web</h3>
<p>A versão web da Clarevo funciona no navegador do computador ou do celular, sem instalar nada, com a mesma conta do app para celular. <a href="${u('web.html')}">Use a Clarevo no navegador</a>. ${linkDaVersaoWeb(estado)}</p>
</article>
${noCelular}
<article class="cartao">
<h3>Painel da empresa, só na web</h3>
<p>Quem administra o benefício de uma empresa usa um painel que existe só na web. <a href="${u('empresas/index.html')}">Veja como funciona para empresas</a>.</p>
</article>
</div>`,
      { variante: 'alt', rotulo: 'onde' },
    ),
    // A chamada dos planos, no fim: os dois planos com tudo e "Assine aqui" (antes do lançamento, para os planos, que dizem "Em breve";
    // depois, para criar conta, com a linha do teste), como no fim da página inicial. Antes do lançamento, sem mais um "em breve": a capa e
    // o cartão "No celular" já dizem.
    bloco(
      `<div class="chamada-final">
<h2 id="planos">Individual ou Família</h2>
<p>${esc(`${PLANOS.texto.plansNote.split('. ')[0]}. O que muda é para quem é a assinatura.${estado.lancado ? ` ${linhaDaCapa(estado)}` : ''}`)}</p>
${chamadas(ARQUIVO, estado, { secundaria: 'web' })}
</div>`,
      { rotulo: 'planos' },
    ),
  ];
  return montarPagina({
    arquivo: ARQUIVO,
    titulo: 'O app por dentro: contas, cartões e controle de gastos',
    descricao: 'Um passeio pelas cinco abas da Clarevo: Resumo, Movimentos, Metas, Investir e Aprender, com contas a pagar, cartões e Família, em telas da demonstração.',
    capa,
    corpo: brutas.map((b) => marcadoresEmHtml(b, valores)).join('\n'),
    fonte: brutas.join('\n') + capa,
    valores,
    classeCapa: 'capa-simples',
    scripts: [SCRIPT_DOS_VIDEOS],
  });
}

module.exports = { paginaApp, RECURSOS_DO_APP: RECURSOS };
