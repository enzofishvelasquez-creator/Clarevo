'use strict';
/**
 * Capturas do site: telas da DEMONSTRAÇÃO do app (dados fictícios), vindas de `docs/lojas/capturas/` e de `docs/telas/`, reduzidas
 * para a largura que a página usa e gravadas em `site/imagens/` (PNG, sem pacote: `png.js`). O gerador lê o original e nunca o
 * altera. O resultado de cada imagem fica em um cache da pasta temporária. A chave junta os bytes do original, a largura e o resumo do
 * código que reduz e grava a imagem (`png.js` e este arquivo): qualquer mudança no método invalida o cache sozinha, e rodar o gerador
 * de novo, sem mudança, é rápido. Cada imagem declara largura e altura na página, para a página não pular ao carregar.
 * Desde 12/11/2026, o nome do arquivo leva um resumo do conteúdo (`imagens/resumo.1a2b3c4d5e.png`): uma captura nova ganha outro nome,
 * e o navegador pode guardar cada imagem por um ano (`_headers`) sem mostrar a antiga a quem já visitou o site.
 *
 * Todas as legendas das capturas de O app e da página inicial dizem "Dados fictícios de demonstração" (`LEGENDA_DEMO`).
 *
 * D-114 (17/11/2026): as telas das matérias de Novidades (`TELAS_DAS_NOVIDADES`, gravadas da demonstração por
 * `scripts/gravar-videos-site.js --capturas` em `site-src/imagens/telas/`) têm uma versão no tema claro e outra no escuro (`escura`): a
 * página mostra a do tema de quem visita (`<picture>` com `prefers-color-scheme`), e as duas têm a mesma largura e altura. A legenda delas,
 * e a dos vídeos, é "Tela da demonstração, com dados fictícios" (`LEGENDA_TELA`, de `videos.js`). As capas dos vídeos (`video-<id>`) entram
 * aqui também, reduzidas como as capturas. A matéria sem tela (13º salário) tem uma ilustração da marca feita no repositório
 * (`ILUSTRACOES`, SVG copiado sem mudança, com o resumo do conteúdo no nome).
 */
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { RAIZ } = require('./config');
const png = require('./png');

/** Resumo do código que decide o resultado de cada imagem (o método de `png.js` e a lista de larguras deste arquivo). */
const RESUMO_DO_CODIGO = crypto
  .createHash('sha1')
  .update(fs.readFileSync(path.join(__dirname, 'png.js')))
  .update('|')
  .update(fs.readFileSync(__filename))
  .digest('hex')
  .slice(0, 12);

const LEGENDA_DEMO = 'Dados fictícios de demonstração';
const { LEGENDA_TELA, VIDEOS } = require('./videos');
const LOJA = 'docs/lojas/capturas/apple-iphone-6-3pol-1206x2622';
const TELAS = 'docs/telas';
const NOVIDADES = 'site-src/imagens/telas';
/** Largura dos celulares (a página mostra a imagem com até 280 px de largura) e do painel largo. */
const LARGURA_CELULAR = 480;
const LARGURA_LARGA = 960;

/** `id` vira `imagens/<id>.png`. `alt` descreve a tela sem repetir a legenda. */
const IMAGENS = [
  { id: 'resumo', origem: `${LOJA}/01_resumo.png`, largura: LARGURA_CELULAR, alt: 'Tela Resumo da Clarevo, com a diferença do mês, o recebido, o pago, o que ainda vai vencer e o botão Anotar gasto.' },
  { id: 'anotar', origem: `${LOJA}/02_anotar_gasto.png`, largura: LARGURA_CELULAR, alt: 'Tela Anotar gasto, com descrição, valor, forma de pagamento, categoria e data.' },
  { id: 'contas', origem: `${LOJA}/03_contas_a_pagar.png`, largura: LARGURA_CELULAR, alt: 'Tela Contas a pagar, com as contas do mês, os vencimentos e o total que ainda falta pagar.' },
  { id: 'cartoes', origem: `${LOJA}/04_cartoes.png`, largura: LARGURA_CELULAR, alt: 'Tela de um cartão de crédito, com o limite usado, a fatura atual e as próximas faturas.' },
  { id: 'evolucao', origem: `${LOJA}/05_evolucao.png`, largura: LARGURA_CELULAR, alt: 'Tela Evolução, com o gráfico de Recebido e Pago mês a mês, a média e a mediana.' },
  { id: 'metas', origem: `${LOJA}/07_metas.png`, largura: LARGURA_CELULAR, alt: 'Tela Metas, com a reserva para imprevistos e o quanto já foi guardado.' },
  { id: 'investimentos', origem: `${TELAS}/540_investimentos.png`, largura: LARGURA_CELULAR, alt: 'Tela Investimentos, com o valor de hoje, o que foi aportado, o ganho e a rentabilidade dos meses fechados ao lado do CDI e do IPCA do mesmo período.' },
  { id: 'aprender', origem: `${LOJA}/08_aprender.png`, largura: LARGURA_CELULAR, alt: 'Tela Aprender, com a busca, as calculadoras e os temas de educação financeira.' },
  { id: 'familia', origem: `${TELAS}/402_familia_titular.png`, largura: LARGURA_CELULAR, alt: 'Tela Família, com o nome da Família, as pessoas, o papel de cada uma e o botão Convidar.' },
  // Era a tela Anotar gasto com o botão de escanear, quase igual à captura "anotar": desde 12/11/2026 é o comprovante já lido.
  { id: 'nota', origem: `${LOJA}/09_comprovante_lido.png`, largura: LARGURA_CELULAR, alt: 'Tela Anotar gasto depois de ler um comprovante de Pix: o aviso do que foi lido e a descrição e o valor já preenchidos, para conferir antes de salvar.' },
  { id: 'beneficio', origem: `${TELAS}/433_conta_beneficio_ativo.png`, largura: LARGURA_CELULAR, alt: 'Tela Conta de quem recebeu o benefício, com a empresa, o plano, a data de início e a situação.' },
  { id: 'quem-ve', origem: `${TELAS}/330_quem_ve.png`, largura: LARGURA_CELULAR, alt: 'Tela Quem vê estes dados, que mostra quem tem acesso aos registros.' },
  { id: 'empresa-painel', origem: `${TELAS}/421_empresa_painel_1280px.png`, largura: LARGURA_LARGA, alt: 'Painel da empresa no navegador, com o contrato, as vagas contratadas, as vagas em uso e as datas.' },
  { id: 'empresa-licencas', origem: `${TELAS}/424_empresa_licencas.png`, largura: LARGURA_CELULAR, alt: 'Painel da empresa, lista de licenças com o e-mail convidado, a situação e a data de cada uma.' },
];

/**
 * As telas das matérias de Novidades (D-114): capa e capturas ao lado das seções, cada uma com a versão escura (`escura`). O id é o que o
 * post usa (`capa: post-investir` no cabeçalho e `{{tela:post-desempenho}}` no corpo).
 */
const TELAS_DAS_NOVIDADES = [
  { id: 'post-resumo', origem: `${NOVIDADES}/resumo.png`, escura: `${NOVIDADES}/resumo-escuro.png`, largura: LARGURA_CELULAR, alt: 'Tela Resumo de outubro, com a diferença do mês, o recebido, o pago, o que ainda falta pagar, a renda comprometida e as cinco abas embaixo: Resumo, Movimentos, Metas, Investir e Aprender.' },
  { id: 'post-investir', origem: `${NOVIDADES}/investir.png`, escura: `${NOVIDADES}/investir-escuro.png`, largura: LARGURA_CELULAR, alt: 'Aba Investir, com o card Seus investimentos hoje: o valor de hoje, o aportado, o ganho em reais e a porcentagem sobre o investido, e o link Ver desempenho.' },
  { id: 'post-desempenho', origem: `${NOVIDADES}/desempenho.png`, escura: `${NOVIDADES}/desempenho-escuro.png`, largura: LARGURA_CELULAR, alt: 'Tela Desempenho, com o selo de estimativa, os períodos no mês, em 12 meses e desde o início, e quanto um investimento rendeu ao lado do CDI, do IPCA e da poupança no mesmo intervalo.' },
  { id: 'post-metas', origem: `${NOVIDADES}/metas-prazo.png`, escura: `${NOVIDADES}/metas-prazo-escuro.png`, largura: LARGURA_CELULAR, alt: 'Tela Nova meta, com o atalho de prazo de 1 ano marcado, o prazo outubro de 2027 preenchido e quanto guardar por mês para chegar lá, sem contar rendimentos.' },
  { id: 'post-multa-fatura', origem: `${NOVIDADES}/multa-fatura.png`, escura: `${NOVIDADES}/multa-fatura-escuro.png`, largura: LARGURA_CELULAR, alt: 'Calculadora Multa e juros por atraso no modo da fatura do cartão: o valor que ficou sem pagar, 30 dias depois do vencimento, e o resultado, com os juros do rotativo, os juros de mora, a multa, o IOF estimado e o total da fatura.' },
  { id: 'post-quem-ve', origem: `${NOVIDADES}/quem-ve.png`, escura: `${NOVIDADES}/quem-ve-escuro.png`, largura: LARGURA_CELULAR, alt: 'Tela Quem vê estes dados?, com a pessoa como única que vê os registros do Pessoal e a explicação do que a empresa que oferece o benefício vê e não vê.' },
  { id: 'post-empresa-painel', origem: `${NOVIDADES}/empresa-painel.png`, escura: `${NOVIDADES}/empresa-painel-escuro.png`, largura: LARGURA_LARGA, alt: 'Painel da empresa, com o aviso de demonstração, o nome da empresa e o contrato: plano, vagas, vagas em uso, vagas livres, início, fim e situação. Nenhum dado financeiro.' },
];

/** As capas dos vídeos de uso (D-114), do momento que melhor resume cada vídeo. Não têm texto alternativo: a capa é do vídeo, que tem nome e descrição. */
const CAPAS_DOS_VIDEOS = VIDEOS.map((v) => ({ id: `video-${v.id}`, origem: `site-src/videos/${v.id}-capa.png`, largura: LARGURA_CELULAR, alt: '' }));

/** Ilustrações da marca feitas no repositório (SVG), para a matéria sem tela. Largura e altura são as do desenho (`viewBox`). */
const ILUSTRACOES = [
  { id: 'ilustracao-decimo-terceiro', origem: 'site-src/imagens/ilustracoes/decimo-terceiro.svg', alt: 'Ilustração da Clarevo: uma folha de calendário com 13º em destaque e uma pilha de moedas.' },
];

const memoria = new Map();

function pastaDoCache() {
  const dir = path.join(os.tmpdir(), 'clarevo-site-imagens');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** O resumo do conteúdo que vai no nome do arquivo publicado (10 caracteres do SHA-1 dos bytes gravados). */
function resumoDoConteudo(bytes) {
  return crypto.createHash('sha1').update(bytes).digest('hex').slice(0, 10);
}

/** A chave do cache de uma imagem: o original, a largura e o resumo do código. */
function chaveDoCache(original, largura, resumoDoCodigo = RESUMO_DO_CODIGO) {
  return crypto.createHash('sha1').update(original).update(`|${largura}|${resumoDoCodigo}`).digest('hex').slice(0, 20);
}

function processar(def) {
  const arquivo = path.join(RAIZ, def.origem);
  if (!fs.existsSync(arquivo)) throw new Error(`a captura ${def.origem} não existe (imagem "${def.id}" do site)`);
  const original = fs.readFileSync(arquivo);
  const chave = chaveDoCache(original, def.largura);
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
  for (const def of [...IMAGENS, ...TELAS_DAS_NOVIDADES, ...CAPAS_DOS_VIDEOS]) {
    const bytes = processar(def);
    const { largura, altura } = png.dimensoes(bytes);
    const caminho = `imagens/${def.id}.${resumoDoConteudo(bytes)}.png`;
    arquivos.set(caminho, bytes);
    info[def.id] = { caminho, largura, altura, alt: def.alt };
    if (def.escura) {
      // A versão do tema escuro: a mesma tela, com a mesma largura e altura (a página declara um tamanho só).
      const escura = processar({ ...def, id: `${def.id}-escura`, origem: def.escura });
      const d = png.dimensoes(escura);
      if (d.largura !== largura || d.altura !== altura) throw new Error(`a versão escura de "${def.id}" (${def.escura}) tem ${d.largura} x ${d.altura}, e a clara ${largura} x ${altura}: grave as duas de novo`);
      const caminhoEscuro = `imagens/${def.id}-escura.${resumoDoConteudo(escura)}.png`;
      arquivos.set(caminhoEscuro, escura);
      info[def.id].escura = caminhoEscuro;
    }
  }
  for (const def of ILUSTRACOES) {
    const arquivo = path.join(RAIZ, def.origem);
    if (!fs.existsSync(arquivo)) throw new Error(`a ilustração ${def.origem} não existe (imagem "${def.id}" do site)`);
    const bytes = fs.readFileSync(arquivo);
    const caixa = /viewBox="0 0 (\d+) (\d+)"/.exec(bytes.toString('utf8'));
    if (!caixa) throw new Error(`a ilustração ${def.origem} precisa de viewBox="0 0 largura altura"`);
    const caminho = `imagens/${def.id}.${resumoDoConteudo(bytes)}.svg`;
    arquivos.set(caminho, bytes);
    info[def.id] = { caminho, largura: Number(caixa[1]), altura: Number(caixa[2]), alt: def.alt, ilustracao: true };
  }
  return { arquivos, info };
}

module.exports = { imagensDoSite, IMAGENS, TELAS_DAS_NOVIDADES, CAPAS_DOS_VIDEOS, ILUSTRACOES, LEGENDA_DEMO, LEGENDA_TELA, RESUMO_DO_CODIGO, chaveDoCache, resumoDoConteudo };
