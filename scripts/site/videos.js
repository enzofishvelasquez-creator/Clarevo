'use strict';
/**
 * Vídeos de uso do app no site (D-114, `docs/22_SITE.md`, seção 17): curtos (10 a 25 segundos), sem som, gravados da DEMONSTRAÇÃO (dados
 * fictícios) por `scripts/gravar-videos-site.js`, que grava em `site-src/videos/` o MP4 (H.264), o WebM (VP9), a capa (PNG) e o
 * `videos.json` (duração, dimensões e tamanho de cada arquivo). Aqui ficam o texto que o site mostra (título, frase curta e a descrição em
 * texto para quem usa leitor de tela) e a seção "Veja o app em uso", que entra na página inicial e em O app.
 *
 * Os vídeos ficam no próprio site, sem serviço de terceiros (`media-src 'self'` na política de segurança), com controles, `preload="none"`
 * (nada baixa antes do toque) e nunca tocam sozinhos (sem `autoplay`: ninguém vê movimento sem pedir, inclusive quem pede movimento
 * reduzido). O nome de cada arquivo publicado leva um resumo do conteúdo (`videos/anotar-gasto.1a2b3c4d5e.mp4`), como as capturas, para o
 * navegador poder guardar por um ano sem mostrar uma versão antiga.
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
    frase: 'Descrição, valor e categoria: o gasto entra no Resumo na hora.',
    descricao: 'No Resumo de outubro, a pessoa toca em Anotar gasto, escreve Farmácia, digita o valor, escolhe a categoria Saúde e salva. O app mostra o gasto salvo, com a data, a categoria e de onde saiu o dinheiro, e, de volta ao Resumo, o Pago e a Diferença do mês já contam o gasto.',
  },
  {
    id: 'resumo-do-mes',
    titulo: 'O Resumo do mês',
    frase: 'Recebido, pago e o que ainda falta pagar, com a explicação de cada número.',
    descricao: 'O Resumo de outubro mostra a Diferença do mês (recebido menos pago, que não é o saldo da conta), o Recebido e o Pago. Mais abaixo, o que ainda falta pagar no mês e a renda comprometida: tocar nela abre o detalhe, com o percentual e a composição. De volta ao Resumo, aparecem os pagamentos do mês e os atalhos para as análises, o calendário e os investimentos.',
  },
  {
    id: 'metas',
    titulo: 'Metas',
    frase: 'Uma meta nova em poucos toques, com o prazo escolhido por atalho.',
    descricao: 'Na aba Metas aparecem a reserva para imprevistos, o plano de guardar e a meta Viagem de férias. A pessoa toca em Nova meta, escolhe Estudos, digita o valor da meta e toca no atalho de prazo de 1 ano: o app preenche outubro de 2027 e mostra quanto guardar por mês para chegar lá, sem contar rendimentos. Ao criar, a tela da meta mostra o guardado, o que falta e quanto guardar por mês até o prazo.',
  },
  {
    id: 'investir',
    titulo: 'Investir',
    frase: 'O valor de hoje, o que você aportou e quanto rendeu ao lado do CDI e do IPCA.',
    descricao: 'Na aba Investir, o card mostra o valor de hoje dos investimentos registrados, o aportado e o ganho. Ver desempenho abre a comparação: quanto cada investimento rendeu no próprio período, ao lado do CDI, do IPCA e da poupança no mesmo intervalo, com o selo de estimativa, em 12 meses e desde o início. Na demonstração, os índices são valores de exemplo. Não é recomendação de investimento.',
  },
  {
    id: 'importar-fatura-print',
    titulo: 'Importar fatura por print',
    frase: 'Prints da fatura aberta viram lançamentos para conferir antes de importar.',
    descricao: 'Na tela do cartão, a pessoa toca em Importar fatura e envia dois prints da fatura aberta, lidos no próprio aparelho: a imagem não sai dele. A espera da leitura foi encurtada no vídeo. A Clarevo acha 5 linhas, conta uma vez só a que aparecia nos dois prints e marca cada linha para conferir. A pessoa revisa a lista, com a parcela em andamento, e importa 4 lançamentos.',
  },
  {
    id: 'calendario-do-mes',
    titulo: 'O Calendário do mês',
    frase: 'Contas, faturas e datas do mês num lugar só, com o previsto separado do pago.',
    descricao: 'Pelo atalho do Resumo, o Calendário de outubro mostra o previsto em contas e faturas, separado do que já foi pago, um título por dia com as contas e, no fim, os aportes planejados sem dia marcado. Em novembro, aparece a fatura do cartão no dia do vencimento.',
  },
  {
    id: 'tema-escuro-claro',
    titulo: 'Do tema escuro ao claro',
    frase: 'Em Conta, escolha o tema claro, o escuro ou o mesmo do aparelho.',
    descricao: 'Com o aparelho no tema escuro, o app aparece escuro. Em Conta, no card Tema, a pessoa escolhe Claro e toca em Aplicar agora. O app passa para o tema claro, com uma transição suave no lugar da recarga da página, e o Resumo aparece claro.',
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
    info[v.id] = { ...v, ...caminhos, largura: m.largura, altura: m.altura, duracao: m.duracao, bytes: { mp4: m.mp4.bytes, webm: m.webm.bytes } };
  }
  return { arquivos, info };
}

/** "18 segundos": a duração arredondada. */
const duracaoPorExtenso = (s) => `${Math.round(s)} segundos`;

/**
 * A seção "Veja o app em uso": um título, uma frase e os vídeos numa faixa que rola para o lado. Cada vídeo tem a capa, os controles do
 * navegador, `preload="none"` e nenhum `autoplay`, o título (nome acessível do vídeo), a frase curta, a legenda da demonstração com a
 * duração e a descrição em texto (num `<details>`, e ligada ao vídeo por `aria-describedby` para quem usa leitor de tela).
 * `videos` e `img` vêm de `videosDoSite().info` e `imagensDoSite().info`; `arquivo` é a página, para os caminhos relativos.
 */
function secaoDeVideos({ videos, img }, arquivo, { idDoTitulo = 'em-uso' } = {}) {
  const itens = VIDEOS.map((v) => {
    const i = videos[v.id];
    const capa = img[`video-${v.id}`];
    if (!i || !capa) throw new Error(`o vídeo "${v.id}" ou a capa dele não foi carregado`);
    const id = `video-${v.id}`;
    return `<li class="video">
<figure>
<div class="video-moldura"><video controls preload="none" playsinline width="${i.largura}" height="${i.altura}" poster="${rel(arquivo, capa.caminho)}" aria-labelledby="${id}-titulo" aria-describedby="${id}-descricao">
<source src="${rel(arquivo, i.webm)}" type="video/webm">
<source src="${rel(arquivo, i.mp4)}" type="video/mp4">
<a href="${rel(arquivo, i.mp4)}">Baixar o vídeo ${esc(v.titulo)} (MP4)</a>
</video></div>
<figcaption>
<h3 id="${id}-titulo">${esc(v.titulo)}</h3>
<p>${esc(v.frase)}</p>
<p class="legenda">${LEGENDA_TELA}. ${duracaoPorExtenso(i.duracao)}, sem som.</p>
<details class="video-descricao"><summary>Descrição do vídeo</summary><p id="${id}-descricao">${esc(v.descricao)}</p></details>
</figcaption>
</figure>
</li>`;
  }).join('\n');
  return `<h2 id="${idDoTitulo}">Veja o app em uso</h2>
<p class="lead-bloco">Vídeos curtos e sem som, gravados na demonstração da Clarevo. Nenhum começa sozinho: toque no vídeo para assistir.</p>
<ul class="videos" aria-label="Vídeos do app em uso">
${itens}
</ul>`;
}

module.exports = { VIDEOS, PASTA_VIDEOS, ARQUIVO_MANIFESTO, LEGENDA_TELA, videosDoSite, secaoDeVideos, lerManifesto };
