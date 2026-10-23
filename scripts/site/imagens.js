'use strict';
/**
 * Capturas do site: telas da DEMONSTRAÇÃO do app (dados fictícios), vindas de `docs/lojas/capturas/` e de `docs/telas/`, reduzidas
 * para a largura que a página usa e gravadas em `site/imagens/` (PNG, sem pacote: `png.js`). O gerador lê o original e nunca o
 * altera. O resultado de cada imagem fica em um cache da pasta temporária (chave: bytes do original, largura e versão do método),
 * então rodar o gerador de novo é rápido. Cada imagem declara largura e altura na página, para a página não pular ao carregar.
 *
 * Todas as legendas dizem "Dados fictícios de demonstração" (`LEGENDA_DEMO`).
 */
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { RAIZ } = require('./config');
const png = require('./png');

const VERSAO_DO_METODO = 3;
const LEGENDA_DEMO = 'Dados fictícios de demonstração';
const LOJA = 'docs/lojas/capturas/apple-iphone-6-3pol-1206x2622';
const TELAS = 'docs/telas';
/** Largura dos celulares (a página mostra a imagem com até 280 px de largura) e do painel largo. */
const LARGURA_CELULAR = 480;
const LARGURA_LARGA = 960;

/** `id` vira `imagens/<id>.png`. `alt` descreve a tela sem repetir a legenda. */
const IMAGENS = [
  { id: 'resumo', origem: `${LOJA}/01_resumo.png`, largura: LARGURA_CELULAR, alt: 'Tela Resumo do Clarevo, com a diferença do mês, o recebido, o pago, o que ainda vai vencer e o botão Anotar gasto.' },
  { id: 'anotar', origem: `${LOJA}/02_anotar_gasto.png`, largura: LARGURA_CELULAR, alt: 'Tela Anotar gasto, com descrição, valor, forma de pagamento, categoria e data.' },
  { id: 'contas', origem: `${LOJA}/03_contas_a_pagar.png`, largura: LARGURA_CELULAR, alt: 'Tela Contas a pagar, com as contas do mês, os vencimentos e o total que ainda falta pagar.' },
  { id: 'cartoes', origem: `${LOJA}/04_cartoes.png`, largura: LARGURA_CELULAR, alt: 'Tela de um cartão de crédito, com o limite usado, a fatura atual e as próximas faturas.' },
  { id: 'evolucao', origem: `${LOJA}/05_evolucao.png`, largura: LARGURA_CELULAR, alt: 'Tela Evolução, com o gráfico de Recebido e Pago mês a mês, a média e a mediana.' },
  { id: 'metas', origem: `${LOJA}/07_metas.png`, largura: LARGURA_CELULAR, alt: 'Tela Metas, com a reserva para imprevistos e o quanto já foi guardado.' },
  { id: 'aprender', origem: `${LOJA}/08_aprender.png`, largura: LARGURA_CELULAR, alt: 'Tela Aprender, com a busca, as calculadoras e os temas de educação financeira.' },
  { id: 'familia', origem: `${TELAS}/402_familia_titular.png`, largura: LARGURA_CELULAR, alt: 'Tela Família, com o nome da Família, as pessoas, o papel de cada uma e o botão Convidar.' },
  { id: 'nota', origem: `${TELAS}/150_anotar_gasto_escanear.png`, largura: LARGURA_CELULAR, alt: 'Tela Anotar gasto com o botão Escanear nota fiscal no alto do formulário.' },
  { id: 'lembretes', origem: `${TELAS}/329_conta_privacidade.png`, largura: LARGURA_CELULAR, alt: 'Tela Conta, com as seções Lembretes, Privacidade neste aparelho, Exportar meus dados e Acesso ao plano.' },
  { id: 'beneficio', origem: `${TELAS}/433_conta_beneficio_ativo.png`, largura: LARGURA_CELULAR, alt: 'Tela Conta de quem recebeu o benefício, com a empresa, o plano, a data de início e a situação.' },
  { id: 'quem-ve', origem: `${TELAS}/330_quem_ve.png`, largura: LARGURA_CELULAR, alt: 'Tela Quem vê estes dados, que mostra quem tem acesso aos registros.' },
  { id: 'empresa-painel', origem: `${TELAS}/421_empresa_painel_1280px.png`, largura: LARGURA_LARGA, alt: 'Painel da empresa no navegador, com o contrato, as vagas contratadas, as vagas em uso e as datas.' },
  { id: 'empresa-licencas', origem: `${TELAS}/424_empresa_licencas.png`, largura: LARGURA_CELULAR, alt: 'Painel da empresa, lista de licenças com o e-mail convidado, a situação e a data de cada uma.' },
];

const memoria = new Map();

function pastaDoCache() {
  const dir = path.join(os.tmpdir(), 'clarevo-site-imagens');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function processar(def) {
  const arquivo = path.join(RAIZ, def.origem);
  if (!fs.existsSync(arquivo)) throw new Error(`a captura ${def.origem} não existe (imagem "${def.id}" do site)`);
  const original = fs.readFileSync(arquivo);
  const chave = crypto.createHash('sha1').update(original).update(`|${def.largura}|${VERSAO_DO_METODO}`).digest('hex').slice(0, 20);
  if (memoria.has(chave)) return memoria.get(chave);
  const no_cache = path.join(pastaDoCache(), `${def.id}-${chave}.png`);
  let saida;
  if (fs.existsSync(no_cache)) saida = fs.readFileSync(no_cache);
  else {
    saida = png.codificar(png.reduzir(png.decodificar(original), def.largura), { quantizar: true });
    fs.writeFileSync(no_cache, saida);
  }
  memoria.set(chave, saida);
  return saida;
}

/**
 * Todas as imagens do site: `arquivos` (caminho em `site/` para o PNG) e `info` (por id: caminho, largura, altura e texto alternativo).
 */
function imagensDoSite() {
  const arquivos = new Map();
  const info = {};
  for (const def of IMAGENS) {
    const bytes = processar(def);
    const { largura, altura } = png.dimensoes(bytes);
    const caminho = `imagens/${def.id}.png`;
    arquivos.set(caminho, bytes);
    info[def.id] = { caminho, largura, altura, alt: def.alt };
  }
  return { arquivos, info };
}

module.exports = { imagensDoSite, IMAGENS, LEGENDA_DEMO, VERSAO_DO_METODO };
