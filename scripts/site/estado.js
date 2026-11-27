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
 *     outras páginas), que mostram a fita "Em breve" em cada cartão; o botão do menu é "Entrar", para a tela de entrar do app web. O
 *     cadastro está aberto em produção antes do lançamento (D-129 A, decisão do Enzo de 26/11/2026), e desde 27/11/2026 (decisão do Enzo,
 *     jornada de compra de 27/11/2026, pergunta 1) o site CONVIDA a criar a conta antes do lançamento: "Criar conta grátis", para a tela de
 *     criar conta do app web (`/criar-conta`, com `?plano=individual|familia` quando a página é de um plano), sempre com a linha honesta "A
 *     assinatura abre em breve. Por enquanto, o acesso é completo e nada é cobrado." (`linhaDoConvite`, a mesma frase do app,
 *     `ACCESS_TEXT.notOpenYet`; com a compra já aberta e o site ainda antes do lançamento, "14 dias grátis, sem cartão."). O convite fica na seção Planos do início, em `planos.html` e na página de cada plano, em Comece aqui, em Use
 *     no navegador e na linha do fim das páginas de conteúdo (`ponteParaOProduto`); o menu continua só com "Entrar". A regra: antes do
 *     lançamento, o site pode levar a `/criar-conta`, mas nunca a uma compra (a venda continua fechada, `SUBSCRIBE_OPEN`) nem com uma
 *     promessa de preço além do "Em breve" dos planos. Como antes, nenhum link para a tela inicial do app web: o convite leva direto à
 *     tela de criar conta;
 *   - lançado (`lancado: true`): "Assine aqui" (também no menu) leva à tela de criar conta do app web, a fita some e os selos das lojas
 *     aparecem só com o endereço de cada uma; o convite "Criar conta grátis" sai (o próprio "Assine aqui" leva ao cadastro).
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
  if (typeof estado.indexar !== 'boolean') throw new Error('estado do produto: "indexar" precisa ser true ou false (scripts/site/config.js)');
  if (typeof estado.noticiasLigadas !== 'boolean') throw new Error('estado do produto: "noticiasLigadas" precisa ser true ou false (scripts/site/config.js)');
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
 * O nome de cada plano no endereço do cadastro (jornada de compra de 27/11/2026, item S3): o app lê `plano` e `periodo` e abre a tela
 * Assinatura já com a escolha, sem marcar nada sozinho. Só estes nomes e valores: `plano=individual|familia` e `periodo=mensal|anual`.
 */
const PLANO_NO_CADASTRO = { individual: 'individual', familiar: 'familia' };
const PERIODOS_NO_CADASTRO = ['mensal', 'anual'];

/**
 * A tela de criar conta do app web (`URL_CRIAR_CONTA`), com o plano e o período escolhidos quando a página é de um plano (os do núcleo:
 * `individual` ou `familiar`; `mensal` ou `anual`): `.../criar-conta?plano=familia&periodo=anual`. Sem plano nem período, o endereço de
 * sempre, sem parâmetro (o cabeçalho e as capas). Recusa plano ou período que não existem, e período sem plano.
 */
function urlDoCadastro({ plano = null, periodo = null } = {}) {
  if (plano !== null && !(plano in PLANO_NO_CADASTRO)) throw new Error(`o cadastro não conhece o plano "${plano}" (use individual ou familiar, do núcleo)`);
  if (periodo !== null && !PERIODOS_NO_CADASTRO.includes(periodo)) throw new Error(`o cadastro não conhece o período "${periodo}" (use mensal ou anual)`);
  if (periodo !== null && plano === null) throw new Error('o período vai no endereço do cadastro só com o plano');
  const parametros = [...(plano ? [`plano=${PLANO_NO_CADASTRO[plano]}`] : []), ...(periodo ? [`periodo=${periodo}`] : [])];
  return parametros.length ? `${URL_CRIAR_CONTA}?${parametros.join('&')}` : URL_CRIAR_CONTA;
}

/**
 * A chamada principal de todas as páginas (D-128): "Assine aqui". Antes do lançamento, leva aos planos (a seção Planos da página inicial ou
 * `planos.html`), que mostram "Em breve"; depois, à tela de criar conta do app web, com o plano (e o período) quando a página é de um plano
 * (`plano`, `periodo`, item S3 da jornada de compra de 27/11/2026). `arquivo`: a página, para o caminho relativo.
 */
function assineAqui(arquivo, estado, { plano = null, periodo = null } = {}) {
  if (estado.lancado) return { href: urlDoCadastro({ plano, periodo }), texto: 'Assine aqui', externo: true };
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
function chamadas(arquivo, estado, { secundaria = null, plano = null, periodo = null } = {}) {
  const principal = assineAqui(arquivo, estado, { plano, periodo });
  const botoes = [`<a class="botao botao-principal" href="${esc(principal.href)}"${principal.externo ? ' rel="noopener noreferrer"' : ''}>${esc(principal.texto)}</a>`];
  if (secundaria) {
    const s = SECUNDARIAS[secundaria];
    if (!s) throw new Error(`a chamada secundária "${secundaria}" não existe (use app ou web)`);
    if (s.pagina !== arquivo) botoes.push(`<a class="botao botao-suave" href="${rel(arquivo, s.pagina)}">${esc(s.texto)}</a>`);
  }
  return `<div class="acoes">\n${botoes.join('\n')}\n</div>`;
}

/**
 * O convite ao cadastro antes do lançamento (decisão do Enzo de 27/11/2026, jornada de compra de 27/11/2026, pergunta 1, depois da D-129 A,
 * que deixou o cadastro aberto): o texto do botão e a linha honesta que vai sempre ao lado dele. Com a compra fechada, a segunda frase da
 * linha é a do app (`ACCESS_TEXT.notOpenYet`, "Assinatura em breve. Por enquanto, o acesso é completo e nada é cobrado.", sem o começo), a
 * mesma que a tela de criar conta mostra (`signupTrialLine`): o site nunca promete mais do que o app diz. Sem preço e sem prazo.
 * Com a compra já aberta (`SUBSCRIBE_OPEN`) e o site ainda antes do lançamento (o plano é abrir a compra antes de mudar `lancado`; revisão
 * independente da D-131), aquela frase seria falsa: a linha passa a ser o teste grátis, nas palavras das boas-vindas do app ("14 dias
 * grátis, sem cartão.", `WELCOME_TEXT.trial`).
 */
const TEXTO_DO_CONVITE = 'Criar conta grátis';
function linhaDoConvite(estado = estadoEmVigor()) {
  if (estado.assinaturaAberta) return `${require('./catalogo').catalogo().PLANOS.teste}.`;
  const doApp = require('./catalogo').catalogo().PLANOS.texto.notOpenYet;
  const porEnquanto = doApp.replace(/^Assinatura em breve\. /, '');
  if (porEnquanto === doApp || !/^Por enquanto, /.test(porEnquanto)) {
    throw new Error(`a frase da compra fechada do app (ACCESS_TEXT.notOpenYet) mudou: "${doApp}". Confira a linha do convite ao cadastro em scripts/site/estado.js`);
  }
  return `A assinatura abre em breve. ${porEnquanto}`;
}

/**
 * A linha dos planos antes do lançamento: "Assine aqui" leva aos planos (a seção Planos do início ou `planos.html`), e os planos dizem, à
 * vista, que a assinatura abre em breve e que, por enquanto, o acesso é completo e nada é cobrado (`linhaDoConvite`; até 27/11/2026, "A
 * assinatura abre em breve, na web e nas lojas.", sem ação nenhuma ao lado). Depois do lançamento, nada.
 */
function assinaturaEmBreve(estado) {
  return estado.lancado ? '' : linhaDoConvite(estado);
}

/**
 * O botão "Criar conta grátis" (só antes do lançamento): a tela de criar conta do app web, com `?plano=individual|familia` quando a página é
 * de um plano (`plano`, o do núcleo), para o app abrir a tela Assinatura com essa escolha quando a assinatura abrir. Nunca a uma compra.
 * Lançado, recusa: quem convida é o próprio "Assine aqui".
 */
function botaoDoConvite(estado, { plano = null } = {}) {
  if (estado.lancado) throw new Error('o convite "Criar conta grátis" é só antes do lançamento: lançado, "Assine aqui" já leva ao cadastro');
  return `<a class="botao botao-principal" href="${esc(urlDoCadastro({ plano }))}" rel="noopener noreferrer">${esc(TEXTO_DO_CONVITE)}</a>`;
}

/**
 * O convite ao cadastro num bloco, antes do lançamento (a seção Planos do início, logo abaixo do título, aonde "Assine aqui" da capa leva):
 * a linha honesta e o botão "Criar conta grátis". Lançado, nada (os cartões levam à página de cada plano, que tem "Assine aqui").
 */
function conviteAoCadastro(estado, { plano = null } = {}) {
  if (estado.lancado) return '';
  return `<div class="convite-conta">\n<p class="aviso-assinatura">${esc(linhaDoConvite(estado))}</p>\n<p class="acoes acoes-convite">${botaoDoConvite(estado, { plano })}</p>\n</div>`;
}

/**
 * As chamadas da capa dos planos (`planos.html` e a página de cada plano, D-129): lançado, as de sempre ("Assine aqui", para criar conta, e
 * "Conheça o app"), com a linha do teste; antes do lançamento (desde 27/11/2026), "Criar conta grátis" (com o plano da página) e "Conheça o
 * app", com a linha honesta embaixo, no lugar da linha da capa. Os planos são onde "Assine aqui" chega antes do lançamento: até 27/11/2026,
 * só com "Conheça o app", que voltava a "Assine aqui" (o laço da jornada de compra, seção 2.1).
 */
function chamadasDosPlanos(arquivo, estado, { plano = null, periodo = null } = {}) {
  if (estado.lancado) return `${chamadas(arquivo, estado, { secundaria: 'app', plano, periodo })}\n<p class="estado-produto">${esc(linhaDaCapa(estado))}</p>`;
  return `${chamadasDoConvite(arquivo, estado, { plano })}\n<p class="estado-produto">${esc(linhaDoConvite(estado))}</p>`;
}

/**
 * Os dois botões do convite, antes do lançamento: "Criar conta grátis" e "Conheça o app" (`secundaria`, como em `chamadas`: `app` ou `web`;
 * a da própria página não aparece). Para as capas dos planos e a chamada final de Use no navegador. Lançado, recusa (use `chamadas`).
 */
function chamadasDoConvite(arquivo, estado, { secundaria = 'app', plano = null } = {}) {
  const botoes = [botaoDoConvite(estado, { plano })];
  const s = SECUNDARIAS[secundaria];
  if (!s) throw new Error(`a chamada secundária "${secundaria}" não existe (use app ou web)`);
  if (s.pagina !== arquivo) botoes.push(`<a class="botao botao-suave" href="${rel(arquivo, s.pagina)}">${esc(s.texto)}</a>`);
  return `<div class="acoes">\n${botoes.join('\n')}\n</div>`;
}

/**
 * A ponte do conteúdo para o produto (jornada de compra de 27/11/2026, item S2): uma linha calma no fim de Aprender, das calculadoras, da
 * Ajuda e das Novidades, que antes terminavam sem nenhum caminho para o app. Nos dois estados, "crie a sua conta na Clarevo", para a tela de
 * criar conta: lançado, com o teste grátis; antes do lançamento (desde 27/11/2026, era "conheça o app da Clarevo"), com a linha honesta do
 * convite (`linhaDoConvite`). Sem pressa nem promessa. Entra pelo modelo de página (`montarPagina`, opção `ponte`).
 */
function ponteParaOProduto(arquivo, estado) {
  const inicio = 'Para organizar as contas, os cartões e os gastos do mês com os seus números, no navegador ou no celular,';
  const depois = estado.lancado ? `Toda conta começa com ${diasDeTeste()} dias grátis, sem cartão.` : linhaDoConvite(estado);
  return `<p class="ponte">${esc(inicio)} <a href="${esc(urlDoCadastro())}" rel="noopener noreferrer">crie a sua conta na Clarevo</a>. ${esc(depois)}</p>`;
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
 * "14 dias grátis, sem cartão". Antes do lançamento, o menu fica só com "Entrar" (decisão anterior do Enzo, mantida em 27/11/2026): o
 * convite "Criar conta grátis" fica nos planos, em Comece aqui, em Use no navegador e no fim das páginas de conteúdo, nunca no cabeçalho.
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
 * Antes, nenhum (D-128: a demonstração não é mais oferecida fora de O app e de Use no navegador; a tela inicial do app web fala do teste
 * grátis, e antes do lançamento o site só leva à tela de criar conta, com a linha do convite, e à de entrar). As calculadoras já terminam
 * com a linha para o app (`ponteParaOProduto`), que antes do lançamento convida a criar a conta.
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
  linhaDoConvite,
  botaoDoConvite,
  conviteAoCadastro,
  chamadasDoConvite,
  chamadasDosPlanos,
  TEXTO_DO_CONVITE,
  urlDoCadastro,
  ponteParaOProduto,
  jaTemConta,
  linkDaDemonstracao,
  chamadaDoMenu,
  entrarNoMenu,
  linkDaVersaoWeb,
  appParaUsar,
  selosDasLojas,
  sistemas,
};
