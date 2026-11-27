'use strict';
/**
 * Vídeos de uso do app no site (D-114 e D-115, `docs/22_SITE.md`, seção 17): curtos (10 a 25 segundos), sem som, gravados da
 * DEMONSTRAÇÃO (dados fictícios) por `scripts/gravar-videos-site.js`, que grava em `site-src/videos/` o MP4 (H.264), o WebM (VP9), a capa
 * (PNG) e o `videos.json` (duração, dimensões e tamanho de cada arquivo). Aqui ficam o texto de cada vídeo (o título e a descrição em texto
 * para quem usa leitor de tela) e `celularComVideo`, que põe o vídeo dentro da moldura de celular do bloco que ele mostra.
 *
 * D-115 (18/11/2026, pedido do Enzo, "como no seox.com.br"): cada vídeo fica no próprio lugar, ao lado do texto do que ele mostra, no lugar
 * da captura parada, e toca sozinho, sem som e em repetição, só enquanto aparece na tela. Não há controles de player (`controls`): quem
 * começa e pausa é o script do próprio site, `js/videos.js` (`site-src/js/videos.js`), que toca o vídeo quando pelo menos metade dele
 * aparece e pausa quando ele sai da tela. D-115c (19/11/2026, Enzo: "Nenhum outro site usa isso"): sem botão de pausar. O próprio vídeo é o
 * controle (WCAG 2.2.2): tocar nele pausa e toca de novo, e pelo teclado ele recebe foco (com o contorno de sempre) e Enter ou Espaço fazem
 * o mesmo, com o nome "Pausar o vídeo: título" ou "Tocar o vídeo: título". Com movimento reduzido ou economia de dados, nada toca sozinho:
 * fica a capa, e tocar no vídeo o toca a pedido. Sem JavaScript, fica a capa. O vídeo não tem `autoplay` (quem decide é o script) e tem
 * `preload="none"`: nada de vídeo baixa antes de ele aparecer na tela.
 *
 * Os vídeos ficam no próprio site, sem serviço de terceiros (`media-src 'self'` na política de segurança). O nome de cada arquivo publicado
 * leva um resumo do conteúdo (`videos/anotar-gasto.1a2b3c4d5e.mp4`), como as capturas, para o navegador poder guardar por um ano sem mostrar
 * uma versão antiga.
 *
 * A descrição diz o que o vídeo mostra, na ordem: quando o roteiro mudar em `gravar-videos-site.js`, a descrição muda junto. Ela não cita
 * valores em reais: na página inicial, "R$" e um número só aparecem na seção Planos (o teste do site confere), e o vídeo já mostra os valores.
 */
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { RAIZ } = require('./config');
const { esc } = require('./texto');
const { rel } = require('./util');

const PASTA_VIDEOS = path.join(RAIZ, 'site-src', 'videos');
const ARQUIVO_MANIFESTO = path.join(PASTA_VIDEOS, 'videos.json');
/** A legenda de toda tela da demonstração nos vídeos e nas imagens das Novidades (pedido de 17/11/2026). */
const LEGENDA_TELA = 'Tela da demonstração, com dados fictícios';

/** Os vídeos, na ordem em que aparecem. `id` é o nome dos arquivos em `site-src/videos/` e o roteiro em `gravar-videos-site.js`. */
const VIDEOS = [
  {
    id: 'anotar-gasto',
    titulo: 'Anotar um gasto',
    descricao: 'Na tela Anotar gasto, a pessoa escreve Farmácia, digita o valor, escolhe a categoria Saúde e salva. O app mostra o gasto salvo, com a data, a categoria e de onde saiu o dinheiro, e, de volta ao Resumo, o Pago e a Diferença do mês já contam o gasto.',
  },
  {
    id: 'resumo-do-mes',
    titulo: 'O Resumo do mês',
    descricao: 'O Resumo de outubro mostra a Diferença do mês (recebido menos pago, que não é o saldo da conta), o Recebido e o Pago. Mais abaixo, o que ainda falta pagar no mês e a renda comprometida: tocar nela abre o detalhe, com o percentual e a composição. De volta ao Resumo, aparecem os pagamentos do mês e os atalhos para as análises, o calendário e os investimentos.',
  },
  {
    id: 'metas',
    titulo: 'Metas',
    descricao: 'Na aba Metas aparecem a reserva para imprevistos, o plano de guardar e a meta Viagem de férias. A pessoa toca em Nova meta, escolhe Estudos, digita o valor da meta e toca no atalho de prazo de 1 ano: o app preenche outubro de 2027 e mostra quanto guardar por mês para chegar lá, sem contar rendimentos. Ao criar, a tela da meta mostra o guardado, o que falta e quanto guardar por mês até o prazo.',
  },
  {
    id: 'investir',
    titulo: 'Investir',
    descricao: 'Na aba Investir, o card mostra o valor de hoje dos investimentos registrados, o aportado e o ganho. Ver desempenho abre a comparação: quanto cada investimento rendeu no próprio período, ao lado do CDI, do IPCA e da poupança no mesmo intervalo, com o selo de estimativa, em 12 meses e desde o início. Na demonstração, os índices são valores de exemplo. Não é recomendação de investimento.',
  },
  {
    id: 'importar-fatura-print',
    titulo: 'Importar fatura por print',
    descricao: 'Na tela do cartão, a pessoa toca em Importar fatura e envia dois prints da fatura aberta, lidos no próprio aparelho: a imagem não sai dele. A espera da leitura foi encurtada no vídeo. A Clarevo acha 5 linhas, conta uma vez só a que aparecia nos dois prints e marca cada linha para conferir. A pessoa revisa a lista, com a parcela em andamento, e importa 4 lançamentos.',
  },
  {
    id: 'calendario-do-mes',
    titulo: 'O Calendário do mês',
    descricao: 'O Calendário de outubro mostra o previsto em contas e faturas, separado do que já foi pago, um título por dia com as contas e, no fim, os aportes planejados sem dia marcado. Em novembro, aparece a fatura do cartão no dia do vencimento.',
  },
  {
    id: 'tema-escuro-claro',
    titulo: 'Do tema escuro ao claro',
    descricao: 'Com o aparelho no tema escuro, a tela Conta aparece escura. Mais abaixo, no card Tema, a pessoa escolhe Claro e toca em Aplicar agora. O app passa para o tema claro, com uma transição suave no lugar da recarga da página, e o Resumo aparece claro.',
  },
  // Os vídeos do computador (27/11/2026, pedido do Enzo para `web.html`: "focar em demonstração por vídeos do app"): a versão web numa janela
  // de 1280 x 800, com o menu ao lado, em 1600 x 1000 (`aparelho: 'computador'`, `telaLargaComVideo`).
  {
    id: 'computador-resumo',
    aparelho: 'computador',
    titulo: 'O Resumo no computador',
    descricao: 'No navegador do computador, o menu fica ao lado, com Anotar gasto, Resumo, Movimentos, Metas, Investir e Aprender. O Resumo de outubro mostra a Diferença do mês, o Recebido e o Pago, o que ainda falta pagar, a renda comprometida e os atalhos para as análises e o calendário; mais abaixo, os pagamentos do mês e as metas. Pelo menu, Movimentos abre os lançamentos de outubro numa tabela, e Resumo volta.',
  },
  {
    id: 'computador-anotar',
    aparelho: 'computador',
    titulo: 'Anotar um gasto no computador',
    descricao: 'No navegador do computador, o formulário Anotar gasto, aberto pelo botão do alto do menu, fica à direita, sem sair do Resumo: a pessoa escreve Farmácia, digita o valor, escolhe a categoria Saúde e salva. O app mostra o gasto salvo, com a data, a categoria e de onde saiu o dinheiro, e, de volta ao Resumo, o Pago e a Diferença do mês já contam o gasto.',
  },
  {
    id: 'computador-importar',
    aparelho: 'computador',
    titulo: 'Importar um extrato no computador',
    descricao: 'Em Movimentos, a pessoa clica em Importar extrato ou fatura e escolhe uma planilha de extrato com dados fictícios, lida no próprio navegador: o arquivo não sai do computador. A Clarevo diz quantas linhas leu, e a pessoa escolhe o banco ou a carteira para onde vão os lançamentos. Na revisão, cada linha aparece marcada, com a data, a categoria sugerida e o valor, e a pessoa importa os quatro lançamentos. No fim, a Clarevo sugere um orçamento a partir do arquivo, sem mudar nada sem confirmação.',
  },
  {
    id: 'computador-contas',
    aparelho: 'computador',
    titulo: 'As contas do mês no computador',
    descricao: 'No navegador do computador, o Calendário de outubro mostra o previsto em contas e faturas, separado do que já foi pago, e um título por dia com as contas. Em novembro, aparece a fatura do cartão no dia do vencimento.',
  },
];

/** O manifesto que `gravar-videos-site.js` grava: duração, dimensões e arquivos de cada vídeo. */
function lerManifesto() {
  if (!fs.existsSync(ARQUIVO_MANIFESTO)) throw new Error('site-src/videos/videos.json não existe: rode "node scripts/gravar-videos-site.js --videos"');
  return JSON.parse(fs.readFileSync(ARQUIVO_MANIFESTO, 'utf8'));
}

/** O resumo do conteúdo que vai no nome do arquivo publicado (10 caracteres do SHA-1). */
const resumo = (bytes) => crypto.createHash('sha1').update(bytes).digest('hex').slice(0, 10);

/**
 * Os vídeos do site: `arquivos` (caminho em `site/` para os bytes do MP4 e do WebM) e `info` (por id: o texto, os caminhos, a duração e as
 * dimensões). A capa entra pelas imagens do site (`scripts/site/imagens.js`, id `video-<id>`), reduzida como as capturas.
 */
function videosDoSite() {
  const manifesto = lerManifesto();
  const arquivos = new Map();
  const info = {};
  for (const v of VIDEOS) {
    const m = manifesto.videos && manifesto.videos[v.id];
    if (!m) throw new Error(`o vídeo "${v.id}" não está em site-src/videos/videos.json: rode "node scripts/gravar-videos-site.js --so ${v.id}"`);
    const caminhos = {};
    for (const tipo of ['mp4', 'webm']) {
      const origem = path.join(PASTA_VIDEOS, m[tipo].arquivo);
      if (!fs.existsSync(origem)) throw new Error(`site-src/videos/${m[tipo].arquivo} não existe: rode "node scripts/gravar-videos-site.js --so ${v.id}"`);
      const bytes = fs.readFileSync(origem);
      if (bytes.length !== m[tipo].bytes) throw new Error(`site-src/videos/${m[tipo].arquivo} não é o que videos.json descreve: grave de novo com "node scripts/gravar-videos-site.js --so ${v.id}"`);
      caminhos[tipo] = `videos/${v.id}.${resumo(bytes)}.${tipo}`;
      arquivos.set(caminhos[tipo], bytes);
    }
    info[v.id] = { ...v, aparelho: v.aparelho || 'celular', ...caminhos, largura: m.largura, altura: m.altura, duracao: m.duracao, bytes: { mp4: m.mp4.bytes, webm: m.webm.bytes } };
  }
  return { arquivos, info };
}

/** "18 segundos": a duração arredondada. */
const duracaoPorExtenso = (s) => `${Math.round(s)} segundos`;

/** O script que toca e pausa os vídeos (D-115), publicado em `site/js/videos.js` a partir de `site-src/js/videos.js`. */
const SCRIPT_DOS_VIDEOS = 'js/videos.js';

/**
 * O vídeo `id` dentro da moldura de celular, no lugar de uma captura (`celular()` de `modelo.js`), com a mesma figura e a legenda da
 * demonstração. `videos` e `img` vêm de `videosDoSite().info` e `imagensDoSite().info`; `arquivo` é a página, para os caminhos relativos.
 *
 * O vídeo tem `muted`, `loop`, `playsinline` e `preload="none"`, sem `controls` e sem `autoplay`: quem toca e pausa é `js/videos.js`, que
 * acha a figura pelo `data-video` e lê o título em `data-titulo`. Sem JavaScript, o nome acessível do vídeo ("Vídeo: título") e a
 * descrição em texto ficam num parágrafo `hidden`, ligado ao vídeo por `aria-labelledby` e `aria-describedby`: o leitor de tela ouve os
 * dois uma vez, pelo vídeo, e não de novo na leitura corrida da página. Com o script, o vídeo vira o controle (`role="button"`,
 * `tabindex="0"`) e o nome passa a dizer o que um toque faz ("Pausar o vídeo: título" ou "Tocar o vídeo: título", por `aria-label`, no
 * lugar do `aria-labelledby`); a descrição continua ligada. Dentro do vídeo,
 * para o navegador que não toca nenhum dos dois formatos, um link para o MP4. `capa`: outra imagem de capa (id de `imagensDoSite`);
 * `classe`: uma classe a mais na figura.
 */
function celularComVideo(id, { videos, img }, arquivo, { capa: idDaCapa = null, classe = '' } = {}) {
  const { v, video } = elementoDoVideo(id, { videos, img }, arquivo, { idDaCapa, aparelho: 'celular' });
  return `<figure class="celular celular-video${classe ? ` ${classe}` : ''}" data-video data-titulo="${esc(v.titulo)}"><div class="celular-moldura">${video}</div>
${textoDoVideo(id, videos)}
<figcaption>${LEGENDA_TELA}</figcaption></figure>`;
}

/**
 * O vídeo `id` do computador (`aparelho: 'computador'`) na moldura larga, no lugar de uma captura larga (`telaLarga()` de `modelo.js`), com
 * a mesma figura, o mesmo texto para o leitor de tela e a mesma legenda dos vídeos de celular, e o mesmo comportamento (`js/videos.js`
 * acha a figura pelo `data-video`). 27/11/2026: `web.html` mostra a versão web por vídeos, no lugar das capturas paradas.
 */
function telaLargaComVideo(id, { videos, img }, arquivo, { classe = '' } = {}) {
  const { v, video } = elementoDoVideo(id, { videos, img }, arquivo, { aparelho: 'computador' });
  return `<figure class="larga larga-video${classe ? ` ${classe}` : ''}" data-video data-titulo="${esc(v.titulo)}"><div class="larga-moldura">${video}</div>
${textoDoVideo(id, videos)}
<figcaption>${LEGENDA_TELA}</figcaption></figure>`;
}

/** O elemento `<video>` (com a capa, os dois formatos e o link do MP4), igual nas duas molduras. Recusa o vídeo do outro aparelho. */
function elementoDoVideo(id, { videos, img }, arquivo, { idDaCapa = null, aparelho }) {
  const v = VIDEOS.find((x) => x.id === id);
  const i = videos[id];
  const capa = img[idDaCapa || `video-${id}`];
  if (!v || !i || !capa) throw new Error(`o vídeo "${id}" ou a capa dele não foi carregado`);
  if ((v.aparelho || 'celular') !== aparelho) throw new Error(`o vídeo "${id}" é do ${v.aparelho || 'celular'}: use ${v.aparelho === 'computador' ? 'telaLargaComVideo' : 'celularComVideo'}`);
  const base = `video-${id}`;
  const video = `<video muted loop playsinline preload="none" width="${i.largura}" height="${i.altura}" poster="${rel(arquivo, capa.caminho)}" aria-labelledby="${base}-nome" aria-describedby="${base}-descricao">
<source src="${rel(arquivo, i.webm)}" type="video/webm">
<source src="${rel(arquivo, i.mp4)}" type="video/mp4">
<a href="${rel(arquivo, i.mp4)}">Baixar o vídeo ${esc(v.titulo)} (MP4)</a>
</video>`;
  return { v, video };
}

/** O nome e a descrição do vídeo em texto, escondidos e ligados ao vídeo por `aria-labelledby` e `aria-describedby`. */
function textoDoVideo(id, videos) {
  const v = VIDEOS.find((x) => x.id === id);
  const base = `video-${id}`;
  return `<p class="video-texto" hidden><span id="${base}-nome">Vídeo: ${esc(v.titulo)}</span>, ${duracaoPorExtenso(videos[id].duracao)}, sem som. <span id="${base}-descricao">${esc(v.descricao)}</span></p>`;
}

module.exports = { VIDEOS, PASTA_VIDEOS, ARQUIVO_MANIFESTO, LEGENDA_TELA, SCRIPT_DOS_VIDEOS, videosDoSite, celularComVideo, telaLargaComVideo, lerManifesto };
