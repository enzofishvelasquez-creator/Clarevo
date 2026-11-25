'use strict';
/**
 * O estado do produto (D-125, 25/11/2026): um só lugar decide o que as páginas dizem sobre o acesso, para o início, Comece aqui, O app,
 * Planos, a página do MEI e o menu contarem a mesma história. O interruptor fica em `ESTADO_DO_PRODUTO` (`scripts/site/config.js`) e pode
 * ser trocado numa geração com `--estado <arquivo.json>` (os testes usam). Documentado em `docs/22_SITE.md`, seção 19.
 *
 * Pré-lançamento (`lancado: false`, o padrão): "fase de testes", o acesso de pessoas e famílias abre no lançamento, os planos são os preços
 * do lançamento e as chamadas levam à demonstração e a "Como ter acesso". Nenhum convite a criar conta (D-064 e `docs/44`, seção 2).
 * Lançado (`lancado: true`): nenhum texto de fase de testes; "Testar 14 dias grátis" leva à tela de criar conta do app web; os selos das
 * lojas aparecem só com o endereço de cada uma.
 */
const { ESTADO_DO_PRODUTO, URL_APP, URL_CRIAR_CONTA, URL_DEMO } = require('./config');
const { esc } = require('./texto');
const { rel } = require('./util');

/** Os endereços aceitos para cada loja: a página do app, nada de link encurtado nem de rastreamento. */
const PREFIXO_DA_LOJA = { appStore: 'https://apps.apple.com/', googlePlay: 'https://play.google.com/' };

/**
 * O estado em vigor: o de `config.js`, com as chaves de `sobrescrever` por cima (as lojas, uma a uma). Recusa endereço de loja de outro
 * site e `lancado` que não seja verdadeiro ou falso.
 */
function estadoDoProduto(sobrescrever = {}) {
  const lojas = { ...ESTADO_DO_PRODUTO.lojas, ...(sobrescrever.lojas || {}) };
  const estado = { ...ESTADO_DO_PRODUTO, ...sobrescrever, lojas };
  if (typeof estado.lancado !== 'boolean') throw new Error('estado do produto: "lancado" precisa ser true ou false (scripts/site/config.js)');
  for (const [loja, url] of Object.entries(lojas)) {
    if (!(loja in PREFIXO_DA_LOJA)) throw new Error(`estado do produto: a loja "${loja}" não existe (use appStore e googlePlay)`);
    if (url && !url.startsWith(PREFIXO_DA_LOJA[loja])) throw new Error(`estado do produto: o endereço de ${loja} precisa começar com ${PREFIXO_DA_LOJA[loja]}`);
    if (/[?#]/.test(url)) throw new Error(`estado do produto: o endereço de ${loja} vai sem parâmetro nem âncora (nada de rastreamento)`);
  }
  if (typeof estado.prazoDeResposta !== 'string') throw new Error('estado do produto: "prazoDeResposta" é um texto (vazio, nenhuma página promete prazo)');
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

/**
 * O estado do acesso, numa frase completa (Comece aqui e o fim da página inicial). Antes do lançamento, o texto que as peças das redes
 * podem repetir (a bio e a peça P03, `docs/44`): mudou em 25/11/2026 de "abre no piloto" para "abre no lançamento", a mesma palavra da
 * seção Planos ("A assinatura pelo app abre no lançamento").
 */
function textoDoAcesso(estado) {
  if (!estado.lancado) return 'A Clarevo está em fase de testes. Para pessoas e famílias, o acesso abre no lançamento, na web, na App Store e no Google Play. Até lá, veja a demonstração e acompanhe as Novidades. Empresas já podem pedir uma apresentação.';
  const lojas = lojasPublicadas(estado).map((l) => (l.id === 'appStore' ? 'na App Store' : 'no Google Play'));
  const onde = ['na web', ...lojas];
  const lista = onde.length === 1 ? onde[0] : `${onde.slice(0, -1).join(', ')} e ${onde[onde.length - 1]}`;
  return `A Clarevo está aberta para todas as pessoas ${lista}. Toda conta começa com ${diasDeTeste()} dias grátis, sem cartão.`;
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

/** A chamada do cabeçalho: depois do lançamento, "Testar grátis"; antes, "Abrir a versão web", para quem já usa a versão de testes. */
function chamadaDoMenu(estado) {
  return estado.lancado ? { href: URL_CRIAR_CONTA, texto: 'Testar grátis' } : { href: URL_APP, texto: 'Abrir a versão web' };
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

module.exports = { estadoDoProduto, usarEstado, estadoEmVigor, lojasPublicadas, textoDoAcesso, linhaDaCapa, rotuloDosPrecos, chamadas, chamadaDoMenu, selosDasLojas, sistemas };
