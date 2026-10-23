'use strict';
/**
 * O app: um passeio pelos recursos, cada um com a captura da DEMONSTRAÇÃO (dados fictícios). O "para que serve" de cada recurso vem do
 * guia de uso do core (`packages/core/src/guide`), então o site não promete o que o app não faz. Onde está disponível: web hoje;
 * lojas "em breve", sem selos.
 */
const { URL_APP } = require('../config');
const { esc } = require('../texto');
const { rel } = require('../util');
const { montarPagina, marcadoresEmHtml, bloco, celular } = require('../modelo');
const { catalogo } = require('../catalogo');

const ARQUIVO = 'app/index.html';

/**
 * Os recursos do passeio, na ordem. `guia`: ids do guia de uso (o primeiro dá o texto principal); `imagem`: id da captura; `itens`:
 * pontos curtos, escritos conferindo o código e o guia.
 */
const RECURSOS = [
  {
    id: 'resumo',
    titulo: 'Resumo do mês',
    guia: ['resumo'],
    imagem: 'resumo',
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
    itens: [
      'Poucos toques, com o rascunho guardado e um aviso antes de descartar.',
      'Escolha como pagou (dinheiro, débito ou Pix, ou cartão de crédito) e de onde o dinheiro saiu.',
      'Importe extrato ou fatura de um arquivo (OFX ou CSV) e confira linha por linha antes de gravar.',
    ],
  },
  {
    id: 'nota',
    titulo: 'Leitura de nota fiscal',
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
    itens: [
      'Gastos fixos e parcelamentos criam a conta de cada mês. Contas do ano, como IPVA e IPTU, entram dois meses antes de vencer.',
      'O gasto só entra em Pago quando você marca a conta como paga, e dá para desfazer.',
      'Lembretes de vencimento no app para celular, no dia anterior.',
    ],
  },
  {
    id: 'cartoes',
    titulo: 'Cartões e faturas',
    guia: ['cartoes'],
    imagem: 'cartoes',
    itens: [
      'Compras à vista e parceladas, fatura atual, próximas faturas e limite usado.',
      'O app guarda só o apelido e, se você quiser, os 4 últimos dígitos. Nunca o número completo, o código de segurança nem a validade.',
      'Anote as compras ou o pagamento da fatura, nunca os dois, para o mesmo gasto não contar duas vezes.',
    ],
  },
  {
    id: 'evolucao',
    titulo: 'Evolução e análises',
    guia: ['evolucao', 'analises'],
    imagem: 'evolucao',
    itens: [
      'Recebido e Pago mês a mês, com média e mediana.',
      'Dá para tirar um mês da comparação sem mexer em nenhum lançamento.',
      'Categorias em barras ou em bolhas e o orçamento por categoria.',
    ],
  },
  {
    id: 'metas',
    titulo: 'Metas e reserva',
    guia: ['metas', 'plano-de-guardar'],
    imagem: 'metas',
    itens: [
      'Reserva para imprevistos e metas com prazo, com o valor guardado só pelo que você registra.',
      'Aportes e resgates não entram em Pago nem em Recebido: o dinheiro continua seu, só mudou de lugar.',
      'O plano de guardar mostra as etapas e o mês previsto, sem contar rendimento.',
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
    id: 'aprender',
    titulo: 'Aprender e calculadoras',
    guia: ['aprender', 'calculadoras'],
    imagem: 'aprender',
    itens: [
      'Explicações curtas, com exemplo calculado, fonte e data de revisão. O app não registra o que você lê nem o que busca.',
      'Calculadoras e simulador com os números que você digita, sem gravar nada.',
      'No site, os mesmos temas estão em Aprender.',
    ],
  },
];

/** Recursos menores, com captura menor. */
const MAIS = [
  { id: 'lembretes', titulo: 'Lembretes', guia: 'lembretes', imagem: 'lembretes', texto: 'Um aviso no dia anterior ao vencimento de cada conta, no app para celular. Na tela bloqueada, o aviso não mostra valor nem descrição.' },
  { id: 'quem-ve', titulo: 'Quem vê estes dados', guia: 'quem-ve', imagem: 'quem-ve', texto: 'Uma tela no próprio app mostra quem tem acesso aos registros: no Pessoal, só você, entre as pessoas do app.' },
  { id: 'beneficio', titulo: 'Benefício pela empresa', guia: 'beneficio-da-empresa', imagem: 'beneficio', texto: 'Quem recebe o convite da empresa aceita pelo link. O app mostra a empresa, o plano e desde quando vale.' },
];

function paginaApp({ valores, img }) {
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
    const propositos = [principal, ...extras].map((e) => `<p>${esc(e.purpose)}</p>`).join('\n');
    return `<article class="recurso" id="${r.id}" aria-labelledby="t-${r.id}">
<div>
<h3 id="t-${r.id}">${esc(r.titulo)}</h3>
${propositos}
<ul>
${r.itens.map((i) => `<li>${esc(i)}</li>`).join('\n')}
</ul>
<p class="pequeno"><a href="${u(`ajuda/${require('./ajuda').temaDoGuia(r.guia[0])}.html#guia-${r.guia[0]}`)}">Como usar, passo a passo</a></p>
</div>
${celular(img[r.imagem], ARQUIVO)}
</article>`;
  }).join('\n');

  const mais = MAIS.map((m) => {
    const e = guia(m.guia);
    if (!e) throw new Error(`o guia do core não tem a entrada "${m.guia}" (página O app)`);
    return `<article class="cartao">
<h3>${esc(m.titulo)}</h3>
<p>${esc(m.texto)}</p>
${celular(img[m.imagem], ARQUIVO)}
<p class="pequeno"><a href="${u(`ajuda/${require('./ajuda').temaDoGuia(m.guia)}.html#guia-${m.guia}`)}">Como usar</a></p>
</article>`;
  }).join('\n');

  const capa = `<h1>O Clarevo por dentro</h1>
<p class="lead">Um passeio pelos recursos do app, com telas da demonstração. Os dados nas telas são fictícios, e uma conta nova começa vazia.</p>
<div class="acoes">
<a class="botao botao-principal" href="${esc(URL_APP)}" rel="noopener noreferrer">Abrir a versão web</a>
<a class="botao botao-suave" href="${u('ajuda/index.html')}">Ver a Ajuda</a>
</div>
<p class="lojas">Em breve na App Store e no Google Play.</p>`;

  const brutas = [
    bloco(
      `<h2 id="onde">Onde usar</h2>
<div class="grade">
<article class="cartao">
<h3>Na web, hoje</h3>
<p>A versão web do Clarevo já funciona no navegador do celular ou do computador. <a href="${esc(URL_APP)}" rel="noopener noreferrer">Abrir a versão web</a>.</p>
</article>
<article class="cartao">
<h3>No celular, em breve</h3>
<p><span class="etiqueta">Em breve</span> O app para iPhone e Android será publicado na App Store e no Google Play. Alguns recursos, como os lembretes e a leitura do QR Code pela câmera, são do app para celular.</p>
</article>
<article class="cartao">
<h3>Painel da empresa, só na web</h3>
<p>Quem administra o benefício de uma empresa usa um painel que existe só na web. <a href="${u('empresas/index.html')}">Veja Para empresas</a>.</p>
</article>
</div>`,
      { rotulo: 'onde' },
    ),
    bloco(
      `<h2 id="recursos">Os recursos</h2>
<p class="lead-bloco">Cada texto vem do guia de uso do próprio app. A legenda de cada tela lembra que os dados são de demonstração.</p>
<div class="recursos">
${linhas}
</div>`,
      { variante: 'alt', rotulo: 'recursos' },
    ),
    bloco(
      `<h2 id="mais">E mais</h2>
<div class="mini">
${mais}
</div>`,
      { rotulo: 'mais' },
    ),
    bloco(
      `<h2 id="nao-faz">O que o app não faz</h2>
<ul class="nao-e">
<li>Não se conecta ao seu banco: tudo o que aparece foi anotado ou importado por você.</li>
<li>Não movimenta dinheiro, não oferece crédito e não recomenda produtos financeiros.</li>
<li>Não guarda o número completo do cartão, o código de segurança, a validade nem o CPF da nota.</li>
</ul>
<p class="nota">Saiba mais em <a href="${u('seguranca.html')}">Segurança e privacidade</a>.</p>`,
      { variante: 'azul', rotulo: 'nao-faz' },
    ),
  ];
  return montarPagina({
    arquivo: ARQUIVO,
    titulo: 'O app',
    descricao: 'Um passeio pelos recursos do Clarevo: Resumo, anotar gasto, contas a pagar, cartões, metas, Família e Aprender, com telas da demonstração.',
    capa,
    corpo: brutas.map((b) => marcadoresEmHtml(b, valores)).join('\n'),
    fonte: brutas.join('\n') + capa,
    valores,
    classeCapa: 'capa-simples',
  });
}

module.exports = { paginaApp, RECURSOS_DO_APP: RECURSOS };
