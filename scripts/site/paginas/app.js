'use strict';
/**
 * O app: um passeio pelos recursos, cada um com o vídeo de uso ou a captura da DEMONSTRAÇÃO (dados fictícios). O "para que serve" de cada
 * recurso vem do guia de uso do core (`packages/core/src/guide`), então o site não promete o que o app não faz. Onde está disponível segue
 * o estado do produto (`estado.js`, D-125): antes do lançamento, a web em fase de testes (o link só para a tela de entrar, de quem já
 * testa) e as lojas "em breve", sem selos; depois, a web e os selos de cada loja com endereço. Desde 18/11/2026 (D-115), cada vídeo fica no
 * lugar da captura do recurso que ele mostra e toca sozinho enquanto aparece (`js/videos.js`), em vez de ficarem todos juntos numa seção.
 */
const { chamadas, linkDaVersaoWeb, lojasPublicadas, selosDasLojas } = require('../estado');
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
    guia: ['evolucao', 'analises'],
    imagem: 'evolucao',
    itens: [
      'Categorias em barras ou em bolhas e o orçamento por categoria.',
    ],
  },
  {
    id: 'metas',
    titulo: 'Metas e reserva',
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
      'Numa tela própria do negócio, quanto entrou, quanto saiu e quanto sobrou no mês e nos últimos 6 meses, numa cor só, e as maiores saídas.',
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
  { id: 'lembretes', titulo: 'Lembretes', guia: 'lembretes', imagem: null, texto: 'Um aviso no dia anterior ao vencimento de cada conta, no app para celular. Na tela bloqueada, o aviso não mostra valor nem descrição.' },
  { id: 'quem-ve', titulo: 'Quem vê estes dados', guia: 'quem-ve', imagem: 'quem-ve', texto: 'Uma tela no próprio app mostra quem tem acesso aos registros: no Pessoal, só você, entre as pessoas do app.' },
  { id: 'beneficio', titulo: 'Benefício pela empresa', guia: 'beneficio-da-empresa', imagem: 'beneficio', texto: 'Quem recebe o convite da empresa aceita pelo link. O app mostra a empresa, o plano e desde quando vale.' },
  { id: 'tema', titulo: 'Tema claro ou escuro', ajuda: 'ajuda/conta.html#p-tema', video: 'tema-escuro-claro', texto: 'Por padrão, a Clarevo segue o tema do aparelho. Em Conta, no card Tema, dá para escolher Claro ou Escuro, e a escolha vale só para aquele aparelho.' },
];

function paginaApp({ valores, img, videos, estado }) {
  const u = (d) => rel(ARQUIVO, d);
  const c = catalogo();
  const guia = (id) => c.GUIA.find((e) => e.id === id);

  const linhas = RECURSOS.map((r) => {
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
  }).join('\n');

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

  // As chamadas e as lojas seguem o estado do produto (D-125, `estado.js`): antes do lançamento, a demonstração e "Como ter acesso", e as
  // lojas "em breve"; depois, "Testar 14 dias grátis" e os selos de cada loja com endereço.
  const capa = `<h1>A Clarevo por dentro</h1>
<p class="lead">Um passeio pelos recursos do app, com telas da demonstração. Os dados nas telas são fictícios, e uma conta nova começa vazia.</p>
${chamadas(ARQUIVO, estado)}
${estado.lancado ? selosDasLojas(estado) : '<p class="lojas">Em breve na App Store e no Google Play.</p>'}
${faixaDeConfianca(ARQUIVO)}`;
  const lojas = lojasPublicadas(estado);
  const noCelular = estado.lancado && lojas.length
    ? `<article class="cartao">
<h3>No celular</h3>
<p>O app para ${lojas.map((l) => (l.id === 'appStore' ? 'iPhone, na App Store' : 'Android, no Google Play')).join(', e para ')}. Alguns recursos, como os lembretes e a leitura do QR Code pela câmera, são do app para celular.</p>
${selosDasLojas(estado)}
</article>`
    : `<article class="cartao">
<h3>No celular, em breve</h3>
<p><span class="etiqueta">Em breve</span> O app para iPhone e Android será publicado na App Store e no Google Play. Alguns recursos, como os lembretes e a leitura do QR Code pela câmera, são do app para celular.</p>
</article>`;

  const brutas = [
    bloco(
      `<h2 id="onde">Onde usar</h2>
<div class="grade">
<article class="cartao">
<h3>${estado.lancado ? 'Na web' : 'Na web, em fase de testes'}</h3>
<p>A versão web da Clarevo funciona no navegador do celular ou do computador. ${linkDaVersaoWeb(estado)}</p>
</article>
${noCelular}
<article class="cartao">
<h3>Painel da empresa, só na web</h3>
<p>Quem administra o benefício de uma empresa usa um painel que existe só na web. <a href="${u('empresas/index.html')}">Veja Para empresas</a>.</p>
</article>
</div>`,
      { rotulo: 'onde' },
    ),
    bloco(
      `<h2 id="recursos">Os recursos</h2>
<p class="lead-bloco">O app tem cinco abas: Resumo, Movimentos, Metas, Investir e Aprender. A explicação de abertura de cada recurso é a do guia de uso do próprio app, e os pontos abaixo dela resumem o que ele faz hoje. A legenda de cada tela lembra que os dados são de demonstração. Os vídeos tocam sem som enquanto aparecem na tela, e tocar num vídeo pausa ou toca de novo.</p>
<div class="recursos">
${linhas}
</div>`,
      { variante: 'alt', rotulo: 'recursos' },
    ),
    bloco(
      `<h2 id="mais">E mais</h2>
${mais}`,
      { rotulo: 'mais' },
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
