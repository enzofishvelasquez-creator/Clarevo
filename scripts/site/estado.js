'use strict';
/**
 * O estado do produto (D-125, 25/11/2026): um só lugar decide o que as páginas dizem sobre o acesso e aonde levam as chamadas, para o início,
 * Comece aqui, O app, Use no navegador (`web.html`), Planos, a página do MEI, as calculadoras, o kit de imprensa e o menu contarem a mesma
 * história. O interruptor fica em `ESTADO_DO_PRODUTO` (`scripts/site/config.js`) e pode ser trocado numa geração com `--estado
 * <arquivo.json>` (os testes usam). Documentado em `docs/22_SITE.md`, seção 19.
 *
 * Desde 26/11/2026 (D-128, pedido do Enzo), nenhum dos dois estados fala de fase de testes, piloto, "quem testa" ou do acesso que "abre no
 * lançamento", e a chamada principal de todas as páginas é "Assine aqui":
 *   - pré-lançamento (`lancado: false`, o padrão): "Assine aqui" leva aos planos (a seção Planos da página inicial, ou `planos.html` das
 *     outras páginas), que mostram a fita "Em breve" em cada cartão; o botão do menu é "Entrar", para a tela de entrar do app web. Nenhum
 *     convite a criar conta e nenhum link para a tela inicial do app web, que convida a criar conta (D-064: ninguém se cadastra antes do
 *     plano pago do banco de dados; a venda continua fechada, `SUBSCRIBE_OPEN`);
 *   - lançado (`lancado: true`): "Assine aqui" (também no menu) leva à tela de criar conta do app web, a fita some e os selos das lojas
 *     aparecem só com o endereço de cada uma.
 * A demonstração (dados fictícios) não é mais chamada: fica só como um link de texto discreto em O app e em Use no navegador
 * (`linkDaDemonstracao`).
 *
 * A assinatura pelo app (`SUBSCRIBE_OPEN` do núcleo) não é um segundo interruptor do site: o estado recusa `lancado: true` enquanto ela está
 * fechada (o site lançado mandaria "Assine aqui" para criar conta com a compra fechada). Para ver o site lançado antes de a assinatura abrir,
 * só o JSON do `--estado` aceita `simularAssinaturaAberta: true`, e a geração avisa e o `--final` recusa (`gerar.js`).
 */
const { ESTADO_DO_PRODUTO, URL_APP, URL_CRIAR_CONTA, URL_DEMO, URL_ENTRAR } = require('./config');
const { esc } = require('./texto');
const { rel } = require('./util');

/**
 * Os endereços aceitos para cada loja: a página do app, nada de link encurtado nem de rastreamento. Na App Store, um endereço de
 * `https://apps.apple.com/` sem parâmetro nem âncora; no Google Play, exatamente a página oficial do app, que sempre leva o identificador
 * do pacote no parâmetro `id` (`https://play.google.com/store/apps/details?id=app.clarevo`, análise geral de 26/11/2026, D-129), e nenhum
 * outro parâmetro nem âncora.
 */
const PREFIXO_DA_LOJA = { appStore: 'https://apps.apple.com/', googlePlay: 'https://play.google.com/store/apps/details?id=' };
const ENDERECO_DA_LOJA = {
  // A página de um app na App Store: o país (só "br"), o nome do app em letras minúsculas e o número, sem parâmetro nem âncora (D-129).
  appStore: /^https:\/\/apps\.apple\.com\/(?:br\/)?app\/(?:[a-z0-9-]+\/)?id[0-9]+$/,
  // O pacote do app no Google Play: partes separadas por ponto (pelo menos duas), cada uma começando por letra (D-129).
  googlePlay: /^https:\/\/play\.google\.com\/store\/apps\/details\?id=[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+$/,
};

/** A assinatura pelo app está aberta no núcleo (`SUBSCRIBE_OPEN` de `packages/core/src/plano-precos.ts`, lido por `catalogo().PLANOS.aberta`)? */
function assinaturaAbertaNoNucleo() {
  return require('./catalogo').catalogo().PLANOS.aberta === true;
}

/**
 * O estado em vigor: o de `config.js`, com as chaves de `sobrescrever` por cima (as lojas, uma a uma), mais `assinaturaAberta` (do núcleo
 * ou, só em `sobrescrever`, de `simularAssinaturaAberta`) e `assinaturaSimulada` (a simulação difere do núcleo). Recusa endereço de loja de
 * outro site, `lancado` que não seja verdadeiro ou falso e `lancado: true` com a assinatura fechada.
 */
function estadoDoProduto(sobrescrever = {}) {
  for (const chave of ['assinaturaAberta', 'simularAssinaturaAberta', 'assinaturaSimulada']) {
    if (chave in ESTADO_DO_PRODUTO) throw new Error(`estado do produto: "${chave}" não vai em scripts/site/config.js; a assinatura aberta vem só do SUBSCRIBE_OPEN de packages/core/src/plano-precos.ts`);
  }
  for (const chave of ['assinaturaAberta', 'assinaturaSimulada']) {
    if (chave in sobrescrever) throw new Error(`estado do produto: "${chave}" vem do núcleo (SUBSCRIBE_OPEN); para testar o site lançado antes de a assinatura abrir, use "simularAssinaturaAberta": true no JSON do --estado`);
  }
  const { simularAssinaturaAberta, ...resto } = sobrescrever;
  const lojas = { ...ESTADO_DO_PRODUTO.lojas, ...(resto.lojas || {}) };
  const estado = { ...ESTADO_DO_PRODUTO, ...resto, lojas };
  if (typeof estado.lancado !== 'boolean') throw new Error('estado do produto: "lancado" precisa ser true ou false (scripts/site/config.js)');
  for (const [loja, url] of Object.entries(lojas)) {
    if (!(loja in PREFIXO_DA_LOJA)) throw new Error(`estado do produto: a loja "${loja}" não existe (use appStore e googlePlay)`);
    if (typeof url !== 'string') throw new Error(`estado do produto: o endereço de ${loja} é um texto (vazio até a publicação)`);
    if (url && !url.startsWith(PREFIXO_DA_LOJA[loja])) throw new Error(`estado do produto: o endereço de ${loja} precisa começar com ${PREFIXO_DA_LOJA[loja]}`);
    if (url && !ENDERECO_DA_LOJA[loja].test(url)) {
      throw new Error(
        loja === 'googlePlay'
          ? 'estado do produto: o endereço de googlePlay é a página do app, https://play.google.com/store/apps/details?id=<pacote> (o pacote com partes separadas por ponto, cada uma começando por letra), sem outro parâmetro nem âncora (nada de rastreamento)'
          : 'estado do produto: o endereço de appStore é a página do app, https://apps.apple.com/br/app/<nome>/id<número>, sem parâmetro nem âncora (nada de rastreamento)',
      );
    }
  }
  if (typeof estado.prazoDeResposta !== 'string') throw new Error('estado do produto: "prazoDeResposta" é um texto (vazio, nenhuma página promete prazo)');
  if (simularAssinaturaAberta !== undefined && typeof simularAssinaturaAberta !== 'boolean') throw new Error('estado do produto: "simularAssinaturaAberta" precisa ser true ou false');
  const doNucleo = assinaturaAbertaNoNucleo();
  estado.assinaturaAberta = simularAssinaturaAberta ?? doNucleo;
  estado.assinaturaSimulada = estado.assinaturaAberta !== doNucleo;
  if (estado.lancado && !estado.assinaturaAberta) {
    throw new Error(
      'estado do produto: "lancado: true" com a assinatura pelo app ainda fechada (SUBSCRIBE_OPEN = false em packages/core/src/plano-precos.ts). ' +
        'O site lançado mandaria "Assine aqui" para a tela de criar conta com a compra ainda fechada. Abra a assinatura no núcleo ' +
        '(SUBSCRIBE_OPEN = true, com a compra pelas lojas e pela web funcionando) e só depois mude "lancado" para true em scripts/site/config.js.',
    );
  }
  return estado;
}

/**
 * O estado da geração em curso. `gerarSite` marca o estado no começo e desmarca no fim (é síncrono), para o modelo de página (o menu de
 * todas as páginas) e as páginas lerem o mesmo estado sem que cada chamada de `montarPagina` precise recebê-lo. Fora de uma geração, vale
 * o de `config.js`.
 */
let emVigor = null;
function usarEstado(estado) {
  emVigor = estado;
}
function estadoEmVigor() {
  return emVigor ?? estadoDoProduto();
}

/** As lojas com endereço, na ordem dos selos. Antes do lançamento, nenhuma: um selo sem o app publicado levaria a lugar nenhum. */
function lojasPublicadas(estado) {
  if (!estado.lancado) return [];
  return [
    { id: 'appStore', url: estado.lojas.appStore, texto: 'Baixar na App Store' },
    { id: 'googlePlay', url: estado.lojas.googlePlay, texto: 'Disponível no Google Play' },
  ].filter((l) => l.url);
}

/** Os dias do teste grátis (TRIAL_DAYS do núcleo), para os textos não divergirem do app. */
function diasDeTeste() {
  return require('./catalogo').catalogo().PLANOS.diasDeTeste;
}

/** Onde a Clarevo está aberta depois do lançamento: "na web", mais cada loja com endereço ("na web, na App Store e no Google Play"). */
function ondeEstaAberta(estado) {
  const onde = ['na web', ...lojasPublicadas(estado).map((l) => (l.id === 'appStore' ? 'na App Store' : 'no Google Play'))];
  return onde.length === 1 ? onde[0] : `${onde.slice(0, -1).join(', ')} e ${onde[onde.length - 1]}`;
}

/**
 * O acesso, numa frase, só no site lançado (o fim do início e do MEI): onde a Clarevo está aberta e o teste grátis. Antes do lançamento, nada
 * (D-128: nenhuma frase de fase de testes nem de "abre no lançamento"; os planos dizem "Em breve").
 */
function textoDoAcesso(estado) {
  if (!estado.lancado) return '';
  return `A Clarevo está aberta para todas as pessoas ${ondeEstaAberta(estado)}. Toda conta começa com ${diasDeTeste()} dias grátis, sem cartão.`;
}

/**
 * "Onde usar", nos fatos do kit de imprensa: antes do lançamento, a web e as lojas em breve; depois, onde a Clarevo está aberta (a web e cada
 * loja com endereço). Depois do lançamento, a loja sem endereço simplesmente não aparece.
 */
function ondeUsar(estado) {
  if (!estado.lancado) return 'na web, no navegador do computador ou do celular. O app para iPhone e Android chega em breve à App Store e ao Google Play.';
  return `${ondeEstaAberta(estado)}.`;
}

/**
 * O celular, numa frase (o bloco "Use no navegador ou no celular" do início, Use no navegador e Comece aqui): antes do lançamento, o navegador
 * e o app das lojas em breve; depois, o navegador e o app de cada loja com endereço.
 */
function noCelular(estado) {
  const lojas = lojasPublicadas(estado);
  if (!estado.lancado) return 'No celular, use o navegador. O app para iPhone e Android chega em breve à App Store e ao Google Play.';
  if (!lojas.length) return 'No celular, use o navegador do aparelho.';
  return `No celular, use o navegador ou o app para ${lojas.map((l) => (l.id === 'appStore' ? 'iPhone, na App Store' : 'Android, no Google Play')).join(', ou para ')}.`;
}

/**
 * A linha curta embaixo das chamadas da capa (início, Comece aqui, MEI e Use no navegador). Antes do lançamento, a assinatura em breve, com
 * as condições do teste; depois, só as condições.
 */
function linhaDaCapa(estado) {
  const dias = diasDeTeste();
  return estado.lancado ? `${dias} dias grátis, sem cartão. Cancele quando quiser.` : `Assinatura em breve, com ${dias} dias grátis, sem cartão. Cancele quando quiser.`;
}

/**
 * A fita "Em breve" de cada cartão de plano (D-128), antes do lançamento: um selo vermelho na diagonal do canto de cima, só desenho
 * (`aria-hidden`), com o mesmo "Em breve" no título do cartão para o leitor de tela (`emBreveNoTitulo`). Depois do lançamento, nada.
 */
function fitaEmBreve(estado) {
  return estado.lancado ? '' : '<span class="fita-em-breve" aria-hidden="true">Em breve</span>';
}
function emBreveNoTitulo(estado) {
  return estado.lancado ? '' : '<span class="so-leitor"> (em breve)</span>';
}

/**
 * A chamada principal de todas as páginas (D-128): "Assine aqui". Antes do lançamento, leva aos planos (a seção Planos da página inicial ou
 * `planos.html`), que mostram "Em breve"; depois, à tela de criar conta do app web. `arquivo`: a página, para o caminho relativo.
 */
function assineAqui(arquivo, estado) {
  if (estado.lancado) return { href: URL_CRIAR_CONTA, texto: 'Assine aqui', externo: true };
  return { href: arquivo === 'index.html' ? '#planos' : rel(arquivo, 'planos.html'), texto: 'Assine aqui', externo: false };
}

/** As chamadas secundárias (D-128): a página O app ou a página da versão web. A demonstração não é chamada. */
const SECUNDARIAS = {
  app: { pagina: 'app/index.html', texto: 'Conheça o app' },
  web: { pagina: 'web.html', texto: 'Use no navegador' },
};

/**
 * As chamadas de uma capa ou de uma chamada final, no máximo dois botões (D-128): "Assine aqui" e, se pedida, a secundária (`secundaria`:
 * `app`, "Conheça o app", ou `web`, "Use no navegador"). `arquivo`: a página, para o caminho relativo.
 */
function chamadas(arquivo, estado, { secundaria = null } = {}) {
  const principal = assineAqui(arquivo, estado);
  const botoes = [`<a class="botao botao-principal" href="${esc(principal.href)}"${principal.externo ? ' rel="noopener noreferrer"' : ''}>${esc(principal.texto)}</a>`];
  if (secundaria) {
    const s = SECUNDARIAS[secundaria];
    if (!s) throw new Error(`a chamada secundária "${secundaria}" não existe (use app ou web)`);
    if (s.pagina !== arquivo) botoes.push(`<a class="botao botao-suave" href="${rel(arquivo, s.pagina)}">${esc(s.texto)}</a>`);
  }
  return `<div class="acoes">\n${botoes.join('\n')}\n</div>`;
}

/**
 * A linha dos planos antes do lançamento (análise geral de 26/11/2026, D-129): "Assine aqui" leva aos planos (a seção Planos do início ou
 * `planos.html`), e os planos dizem, à vista, por que ainda não há botão de assinar. Depois do lançamento, nada.
 */
function assinaturaEmBreve(estado) {
  return estado.lancado ? '' : 'A assinatura abre em breve, na web e nas lojas.';
}

/**
 * As chamadas da capa dos planos (`planos.html` e a página de cada plano, D-129): lançado, as de sempre ("Assine aqui", para criar conta, e
 * "Conheça o app"), com a linha do teste; antes do lançamento, a linha de que a assinatura abre em breve e um caminho a seguir, "Conheça o
 * app" (os planos são onde "Assine aqui" chega: não podem ser um beco sem saída).
 */
function chamadasDosPlanos(arquivo, estado) {
  if (estado.lancado) return `${chamadas(arquivo, estado, { secundaria: 'app' })}\n<p class="estado-produto">${esc(linhaDaCapa(estado))}</p>`;
  return `<p class="estado-produto">${esc(assinaturaEmBreve(estado))}</p>\n<div class="acoes">\n<a class="botao botao-suave" href="${rel(arquivo, SECUNDARIAS.app.pagina)}">${esc(SECUNDARIAS.app.texto)}</a>\n</div>`;
}

/**
 * "Já tem conta? Entrar no navegador" (D-129), embaixo das chamadas de Use no navegador, nos dois estados: a tela de entrar do app web, de
 * quem já tem conta (antes do lançamento, também no menu; lançado, o menu tem "Entrar" ao lado de "Assine aqui").
 */
function jaTemConta() {
  return `<p class="ja-tem-conta">Já tem conta? <a href="${esc(URL_ENTRAR)}" rel="noopener noreferrer">Entrar no navegador</a></p>`;
}

/**
 * A demonstração (dados fictícios), só como link de texto discreto (D-128), e só em O app e em Use no navegador. Igual nos dois estados: a
 * demonstração abre sem conta e não grava nada fora do aparelho.
 */
function linkDaDemonstracao() {
  return `<p class="link-demo"><a href="${esc(URL_DEMO)}" rel="noopener noreferrer">Ver uma demonstração com dados fictícios</a></p>`;
}

/**
 * A chamada do cabeçalho: antes do lançamento, "Entrar", que leva à tela de entrar do app web (até 26/11/2026, "Entrar (quem testa)"; D-128);
 * depois, "Assine aqui", para a tela de criar conta, como a chamada principal das páginas, e, ao lado, "Entrar" como link de texto (análise
 * geral de 26/11/2026, D-129: lançado, não havia como entrar pelo site). Nunca a tela inicial do app web antes do lançamento: ela começa com
 * "14 dias grátis, sem cartão" e "Criar conta" (D-064).
 */
function chamadaDoMenu(estado) {
  return estado.lancado ? { href: URL_CRIAR_CONTA, texto: 'Assine aqui' } : { href: URL_ENTRAR, texto: 'Entrar' };
}
/** O link de texto "Entrar" ao lado de "Assine aqui", no cabeçalho do site lançado (D-129); antes do lançamento, nada (o botão já é "Entrar"). */
function entrarNoMenu(estado) {
  return estado.lancado ? { href: URL_ENTRAR, texto: 'Entrar' } : null;
}

/**
 * O link para a versão web no meio de um texto (O app, "Onde usar"), em HTML: depois do lançamento, "Abrir a versão web" (a tela inicial do
 * app web, com criar conta e entrar); antes, só a tela de entrar, para quem já tem conta.
 */
function linkDaVersaoWeb(estado) {
  const link = (href, texto) => `<a href="${esc(href)}" rel="noopener noreferrer">${esc(texto)}</a>`;
  return estado.lancado ? `${link(URL_APP, 'Abrir a versão web')}.` : `Já tem conta? ${link(URL_ENTRAR, 'Entrar na versão web')}.`;
}

/**
 * O app que qualquer pessoa pode abrir agora, para a nota das calculadoras ("ou use a versão web da Clarevo"): só depois do lançamento.
 * Antes, nenhum (D-128: a demonstração não é mais oferecida fora de O app e de Use no navegador, e a tela inicial do app web convida a
 * criar conta, D-064).
 */
function appParaUsar(estado) {
  return estado.lancado ? { href: URL_APP, texto: 'versão web' } : null;
}

/**
 * Os selos das lojas (só depois do lançamento e só com o endereço de cada uma): links de texto em pílula, com o nome oficial em
 * português ("Baixar na App Store", "Disponível no Google Play"), sem imagem de terceiros (a política de segurança só aceita arquivos do
 * próprio site). Sem endereço nenhum, nada aparece. `pequenos` (as capas, D-129): numa linha pequena de texto, "No celular:" e os links, e
 * não pílulas, para a capa ter no máximo dois botões ("Assine aqui" e a secundária).
 */
function selosDasLojas(estado, { pequenos = false } = {}) {
  const lojas = lojasPublicadas(estado);
  if (!lojas.length) return '';
  const links = lojas.map((l) => `<a class="selo-loja" href="${esc(l.url)}" rel="noopener noreferrer">${esc(l.texto)}</a>`);
  if (pequenos) return `<p class="selos-lojas selos-pequenos">No celular: ${links.join('<span aria-hidden="true"> · </span>')}</p>`;
  return `<p class="selos-lojas">${links.join('\n')}</p>`;
}

/** Os sistemas em que a Clarevo funciona hoje, para os dados estruturados (SoftwareApplication). */
function sistemas(estado) {
  const lojas = lojasPublicadas(estado);
  return ['Web', ...(lojas.some((l) => l.id === 'appStore') ? ['iOS'] : []), ...(lojas.some((l) => l.id === 'googlePlay') ? ['Android'] : [])].join(', ');
}

module.exports = {
  estadoDoProduto,
  usarEstado,
  estadoEmVigor,
  lojasPublicadas,
  textoDoAcesso,
  ondeUsar,
  noCelular,
  linhaDaCapa,
  fitaEmBreve,
  emBreveNoTitulo,
  assineAqui,
  chamadas,
  assinaturaEmBreve,
  chamadasDosPlanos,
  jaTemConta,
  linkDaDemonstracao,
  chamadaDoMenu,
  entrarNoMenu,
  linkDaVersaoWeb,
  appParaUsar,
  selosDasLojas,
  sistemas,
};
