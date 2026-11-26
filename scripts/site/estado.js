'use strict';
/**
 * O estado do produto (D-125, 25/11/2026): um só lugar decide o que as páginas dizem sobre o acesso, para o início, Comece aqui, O app,
 * Planos, a página do MEI, as calculadoras, o kit de imprensa e o menu contarem a mesma história. O interruptor fica em `ESTADO_DO_PRODUTO`
 * (`scripts/site/config.js`) e pode ser trocado numa geração com `--estado <arquivo.json>` (os testes usam). Documentado em
 * `docs/22_SITE.md`, seção 19.
 *
 * Pré-lançamento (`lancado: false`, o padrão): "fase de testes", o acesso de pessoas e famílias abre no lançamento, os planos são os preços
 * do lançamento (sem oferta nos dados estruturados) e as chamadas levam à demonstração e a "Como ter acesso". Nenhum convite a criar conta e
 * nenhum link para a tela inicial do app web, que convida a criar conta (D-064 e `docs/44`, seção 2): o botão do menu é "Entrar (quem
 * testa)", para a tela de entrar.
 * Lançado (`lancado: true`): nenhum texto de fase de testes; "Testar 14 dias grátis" leva à tela de criar conta do app web; os selos das
 * lojas aparecem só com o endereço de cada uma.
 *
 * A assinatura pelo app (`SUBSCRIBE_OPEN` do núcleo) não é um segundo interruptor do site: enquanto ela está fechada, as páginas de planos
 * dizem "A assinatura pelo app abre no lançamento", e o estado recusa `lancado: true` (o site diria "Testar 14 dias grátis" ao lado dessa
 * frase). Para ver o site lançado antes de a assinatura abrir, só o JSON do `--estado` aceita `simularAssinaturaAberta: true`, e a geração
 * avisa e o `--final` recusa (`gerar.js`).
 */
const { ESTADO_DO_PRODUTO, URL_APP, URL_CRIAR_CONTA, URL_DEMO, URL_ENTRAR } = require('./config');
const { esc } = require('./texto');
const { rel } = require('./util');

/** Os endereços aceitos para cada loja: a página do app, nada de link encurtado nem de rastreamento. */
const PREFIXO_DA_LOJA = { appStore: 'https://apps.apple.com/', googlePlay: 'https://play.google.com/' };

/** A assinatura pelo app está aberta no núcleo (`SUBSCRIBE_OPEN` de `packages/core/src/plano.ts`, lido por `catalogo().PLANOS.aberta`)? */
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
    if (chave in ESTADO_DO_PRODUTO) throw new Error(`estado do produto: "${chave}" não vai em scripts/site/config.js; a assinatura aberta vem só do SUBSCRIBE_OPEN de packages/core/src/plano.ts`);
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
    if (url && !url.startsWith(PREFIXO_DA_LOJA[loja])) throw new Error(`estado do produto: o endereço de ${loja} precisa começar com ${PREFIXO_DA_LOJA[loja]}`);
    if (/[?#]/.test(url)) throw new Error(`estado do produto: o endereço de ${loja} vai sem parâmetro nem âncora (nada de rastreamento)`);
  }
  if (typeof estado.prazoDeResposta !== 'string') throw new Error('estado do produto: "prazoDeResposta" é um texto (vazio, nenhuma página promete prazo)');
  if (simularAssinaturaAberta !== undefined && typeof simularAssinaturaAberta !== 'boolean') throw new Error('estado do produto: "simularAssinaturaAberta" precisa ser true ou false');
  const doNucleo = assinaturaAbertaNoNucleo();
  estado.assinaturaAberta = simularAssinaturaAberta ?? doNucleo;
  estado.assinaturaSimulada = estado.assinaturaAberta !== doNucleo;
  if (estado.lancado && !estado.assinaturaAberta) {
    throw new Error(
      'estado do produto: "lancado: true" com a assinatura pelo app ainda fechada (SUBSCRIBE_OPEN = false em packages/core/src/plano.ts). ' +
        'O site lançado diria "Testar 14 dias grátis" ao lado de "A assinatura pelo app abre no lançamento". Abra a assinatura no núcleo ' +
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
 * O estado do acesso, numa frase completa (Comece aqui e o fim da página inicial). Antes do lançamento, o texto que as peças das redes
 * podem repetir (a bio e a peça P03, `docs/44`): mudou em 25/11/2026 de "abre no piloto" para "abre no lançamento", a mesma palavra da
 * seção Planos ("A assinatura pelo app abre no lançamento").
 */
function textoDoAcesso(estado) {
  if (!estado.lancado) return 'A Clarevo está em fase de testes. Para pessoas e famílias, o acesso abre no lançamento, na web, na App Store e no Google Play. Até lá, veja a demonstração e acompanhe as Novidades. Empresas já podem pedir uma apresentação.';
  return `A Clarevo está aberta para todas as pessoas ${ondeEstaAberta(estado)}. Toda conta começa com ${diasDeTeste()} dias grátis, sem cartão.`;
}

/**
 * "Onde usar", nos fatos do kit de imprensa: antes do lançamento, a fase de testes e onde o acesso vai abrir; depois, onde a Clarevo está
 * aberta (a web e cada loja com endereço). Sem "em breve": depois do lançamento, a loja sem endereço simplesmente não aparece.
 */
function ondeUsar(estado) {
  if (!estado.lancado) return 'a Clarevo está em fase de testes. Para pessoas e famílias, o acesso abre no lançamento, na web, na App Store e no Google Play.';
  return `${ondeEstaAberta(estado)}.`;
}

/** A linha curta embaixo das chamadas da capa (início e página do MEI). */
function linhaDaCapa(estado) {
  const dias = diasDeTeste();
  // Depois do lançamento, o botão já diz "Testar 14 dias grátis": a linha não repete os dias.
  return estado.lancado ? 'Sem cartão. Cancele quando quiser.' : `Em fase de testes: o acesso abre no lançamento, com ${dias} dias grátis, sem cartão.`;
}

/** A etiqueta acima dos preços, antes do lançamento: os planos são os preços do lançamento. */
function rotuloDosPrecos(estado) {
  return estado.lancado ? '' : 'Preços no lançamento';
}

/**
 * A frase da tela Assinatura do app enquanto a assinatura está fechada ("A assinatura pelo app abre no lançamento. Até lá, nada é
 * cobrado.", `ACCESS_TEXT.notOpenYet`), nas páginas de planos e na seção Planos do início; vazia com a assinatura aberta. Segue o mesmo
 * estado: como `lancado: true` exige a assinatura aberta (`estadoDoProduto`), ela nunca aparece no site lançado.
 */
function avisoDaAssinatura(estado) {
  return estado.assinaturaAberta ? '' : require('./catalogo').catalogo().PLANOS.texto.notOpenYet;
}

/**
 * As duas chamadas da capa, que dizem aonde levam (NN/g, "Get Started"): depois do lançamento, "Testar 14 dias grátis" (a tela de criar
 * conta do app web) e "Ver a demonstração"; antes, "Ver a demonstração" e "Como ter acesso" (o estado do acesso, em Comece aqui).
 * `arquivo`: a página, para o caminho relativo.
 */
function chamadas(arquivo, estado, { cenario = null } = {}) {
  const externo = (href, classe, texto) => `<a class="botao ${classe}" href="${esc(href)}" rel="noopener noreferrer">${esc(texto)}</a>`;
  // `cenario`: um cenário fictício da demonstração (`?cenario=negocio`, o "Sacolé da Maria", na página do MEI). Não é rastreamento: a
  // demonstração só escolhe os dados fictícios que mostra (`apps/app/src/lib/demo-auth.ts`).
  const enderecoDaDemo = cenario ? `${URL_DEMO}/?cenario=${encodeURIComponent(cenario)}` : URL_DEMO;
  const demo = (classe) => externo(enderecoDaDemo, classe, 'Ver a demonstração');
  if (estado.lancado) return `<div class="acoes">\n${externo(URL_CRIAR_CONTA, 'botao-principal', `Testar ${diasDeTeste()} dias grátis`)}\n${demo('botao-suave')}\n</div>`;
  return `<div class="acoes">\n${demo('botao-principal')}\n<a class="botao botao-suave" href="${rel(arquivo, 'comece.html')}#acesso">Como ter acesso</a>\n</div>`;
}

/**
 * A chamada do cabeçalho: depois do lançamento, "Testar grátis" (a tela de criar conta); antes, "Entrar (quem testa)", que leva à tela de
 * entrar do app web e diz para quem é. Até 25/11/2026 era "Abrir a versão web", para a tela inicial do app, que começa com "14 dias grátis,
 * sem cartão" e "Criar conta" enquanto o site diz que o acesso abre no lançamento (D-064).
 */
function chamadaDoMenu(estado) {
  return estado.lancado ? { href: URL_CRIAR_CONTA, texto: 'Testar grátis' } : { href: URL_ENTRAR, texto: 'Entrar (quem testa)' };
}

/**
 * O link para a versão web no meio de um texto (O app, "Onde usar"), em HTML: depois do lançamento, "Abrir a versão web" (a tela inicial do
 * app web, com criar conta e entrar); antes, só a tela de entrar, para quem já testa.
 */
function linkDaVersaoWeb(estado) {
  const link = (href, texto) => `<a href="${esc(href)}" rel="noopener noreferrer">${esc(texto)}</a>`;
  return estado.lancado ? `${link(URL_APP, 'Abrir a versão web')}.` : `Para quem já testa a Clarevo: ${link(URL_ENTRAR, 'Entrar na versão web')}.`;
}

/**
 * O app que qualquer pessoa pode abrir agora, para a nota das calculadoras ("ou use a ... da Clarevo"): depois do lançamento, a versão web;
 * antes, a demonstração, que abre sem conta (a tela inicial do app web convida a criar conta, D-064).
 */
function appParaUsar(estado) {
  return estado.lancado ? { href: URL_APP, texto: 'versão web' } : { href: URL_DEMO, texto: 'demonstração' };
}

/**
 * Os selos das lojas (só depois do lançamento e só com o endereço de cada uma): links de texto em pílula, com o nome oficial em
 * português ("Baixar na App Store", "Disponível no Google Play"), sem imagem de terceiros (a política de segurança só aceita arquivos do
 * próprio site). Sem endereço nenhum, nada aparece.
 */
function selosDasLojas(estado) {
  const lojas = lojasPublicadas(estado);
  if (!lojas.length) return '';
  return `<p class="selos-lojas">${lojas.map((l) => `<a class="selo-loja" href="${esc(l.url)}" rel="noopener noreferrer">${esc(l.texto)}</a>`).join('\n')}</p>`;
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
  linhaDaCapa,
  rotuloDosPrecos,
  avisoDaAssinatura,
  chamadas,
  chamadaDoMenu,
  linkDaVersaoWeb,
  appParaUsar,
  selosDasLojas,
  sistemas,
};
