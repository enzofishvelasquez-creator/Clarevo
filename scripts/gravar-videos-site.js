#!/usr/bin/env node
/**
 * Vídeos de uso, capturas das Novidades e telas de O app do site (D-114, `docs/22_SITE.md`, seções 17 e 23), gravados da DEMONSTRAÇÃO do
 * app (dados fictícios, nenhuma rede), na versão web de `npm --workspace apps/app run export:demo`, a mesma de
 * `scripts/video-demonstracao.js` e `scripts/gravar-redes.js`.
 *
 * Desde 27/11/2026 (pedido do Enzo), sem o selo "Demonstração": a página leva a marca das capturas (`window.__clarevoCaptura = true`, lida
 * por `apps/app/src/lib/capture.ts`, a mesma de `scripts/capturas-lojas.js`), que esconde o selo e a linha "Fica só nesta demonstração". O
 * gravador recusa a gravação em que o selo (ou, nos vídeos, qualquer texto que comece por "Demonstração") aparece; a legenda do site diz,
 * em toda tela e todo vídeo, "Tela da demonstração, com dados fictícios". Até então, o gravador exigia o selo à vista.
 *
 * Vídeos (os textos que o site mostra, o título e a descrição de cada um, ficam em `scripts/site/videos.js`; aqui ficam os roteiros):
 *   - de celular: anotar-gasto, resumo-do-mes, metas, investir, importar-fatura-print, calendario-do-mes e tema-escuro-claro, em retrato,
 *     720 x 1560 (o app vê 360 x 780 pontos, ampliados 2 vezes), com até 2 MB por arquivo;
 *   - do computador (27/11/2026, `web.html` e o início): computador-resumo, computador-anotar, computador-importar e computador-contas, a
 *     versão web numa janela de 1280 x 800 pontos com o menu ao lado, desenhada a 2x e reduzida a 1600 x 1000, com até 750 KB por arquivo.
 * Cada um de 10 a 25 segundos, sem som (sem trilha), em MP4 (H.264, yuv420p, +faststart) e WebM (VP9) (a qualidade baixa até caber; nunca
 * passa de 25 MB, o limite do Cloudflare Pages), e com a capa (PNG do momento que melhor resume o vídeo). Tudo vai para `site-src/videos/`,
 * com `videos.json` (duração, tamanho e dimensões de cada arquivo), e o gerador do site copia para `site/videos/`.
 *
 * Capturas (`--capturas`): as telas que as matérias de Novidades mostram ao lado das seções e na capa (Resumo, Investir, Desempenho, Nova
 * meta com os atalhos de prazo, a calculadora Multa e juros no modo da fatura do cartão, Quem vê estes dados? e o painel da empresa) e a
 * tela Seu negócio do Espaço Negócio (cenário "negocio"), que O app mostra (D-115), cada
 * uma no tema claro e no escuro (o app segue o tema do aparelho), em `site-src/imagens/telas/<nome>.png` e `<nome>-escuro.png`; e, desde
 * 27/11/2026, as telas de O app e do kit de imprensa (`app-*.png`, só no claro, 1206 x 2622), no lugar das telas cruas com o selo de
 * `docs/lojas/capturas/`. O gerador do site as reduz (`scripts/site/imagens.js`).
 *
 * Como o vídeo sai nítido e no tempo certo (o mesmo método de `gravar-redes.js`): a página é ampliada 2 vezes (`<meta name="viewport">` com
 * `width=360, initial-scale=2` só na cópia que o servidor local entrega) numa janela de 720 x 1560, e o navegador desenha de novo em vez de
 * esticar uma imagem. Em vez do `recordVideo` do Playwright (que repete quadros e anda alguns por cento mais devagar que o relógio), o script
 * usa a captura de tela do próprio Chromium (`Page.startScreencast`), guarda cada quadro com o instante em que o navegador o desenhou e monta
 * o vídeo com a duração exata de cada quadro. A espera da leitura dos prints (que leva vários segundos) é encurtada no vídeo: fica 1,2 s do
 * aviso de leitura, e o resto da espera sai. O vídeo do tema junta duas tomadas da mesma tela (escuro e claro) com uma transição suave
 * (`xfade` do ffmpeg) no lugar da recarga que "Aplicar agora" faz no app.
 *
 * Uso:
 *   node scripts/gravar-videos-site.js                 grava os onze vídeos e as capturas
 *   node scripts/gravar-videos-site.js --so metas,investir   só estes vídeos (ids de scripts/site/videos.js)
 *   node scripts/gravar-videos-site.js --capturas      só as capturas das Novidades (com --telas resumo,investir, só estas)
 *   node scripts/gravar-videos-site.js --videos        só os vídeos
 *   node scripts/gravar-videos-site.js --build         refaz o build de demonstração antes (sem ele, usa apps/app/dist se existir)
 * Depois: `node scripts/gerar-site.js` e `npm run test:site`.
 * Ambiente: VIDEO_SITE_DIST (outra pasta com o build de demonstração, por exemplo uma cópia parada de apps/app/dist enquanto outra frente
 * refaz o app; com ela, --build não vale), VIDEO_SITE_PORT (padrão 8699; ocupada, usa outra livre), FFMPEG e FFPROBE (padrão /usr/bin/ffmpeg e /usr/bin/ffprobe, ou os do
 * PATH), CHROMIUM_PATH (outro Chromium) e PLAYWRIGHT_BROWSERS_PATH (padrão /opt/pw-browsers, se existir).
 */
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { spawnSync } = require('node:child_process');
if (!process.env.PLAYWRIGHT_BROWSERS_PATH && fs.existsSync('/opt/pw-browsers')) process.env.PLAYWRIGHT_BROWSERS_PATH = '/opt/pw-browsers';
const { chromium } = require('playwright');
const png = require('./site/png');
const { VIDEOS: TEXTOS_DOS_VIDEOS, PASTA_VIDEOS, ARQUIVO_MANIFESTO } = require('./site/videos');

const RAIZ = path.join(__dirname, '..');
/**
 * O build de demonstração que o script serve: `apps/app/dist` (de `npm --workspace apps/app run export:demo`) ou, com VIDEO_SITE_DIST, uma
 * cópia dele em outra pasta (para gravar com um build parado enquanto outra frente mexe no app e refaz `apps/app/dist`).
 */
const DIST = process.env.VIDEO_SITE_DIST ? path.resolve(process.env.VIDEO_SITE_DIST) : path.join(RAIZ, 'apps', 'app', 'dist');
const PASTA_TELAS = path.join(RAIZ, 'site-src', 'imagens', 'telas');
const argv = process.argv.slice(2);
const opcao = (nome) => { const i = argv.indexOf(nome); return i >= 0 ? argv[i + 1] : null; };
const SO = (opcao('--so') || '').split(',').map((s) => s.trim()).filter(Boolean);
const SO_CAPTURAS = argv.includes('--capturas');
/** `--telas resumo,investir`: só estas capturas. */
const SO_TELAS = (opcao('--telas') || '').split(',').map((s) => s.trim()).filter(Boolean);
const SO_VIDEOS = argv.includes('--videos') || SO.length > 0;
const FFMPEG = process.env.FFMPEG || (fs.existsSync('/usr/bin/ffmpeg') ? '/usr/bin/ffmpeg' : 'ffmpeg');
const FFPROBE = process.env.FFPROBE || (fs.existsSync('/usr/bin/ffprobe') ? '/usr/bin/ffprobe' : 'ffprobe');

/** O aparelho dos vídeos de celular: 360 x 780 pontos, ampliados 2 vezes = 720 x 1560. */
const LARGURA = 360;
const ALTURA = 780;
const ESCALA = 2;
const W = LARGURA * ESCALA;
const H = ALTURA * ESCALA;
const FPS = 25;
/**
 * Os aparelhos dos vídeos. `celular`: o de sempre (D-114), 360 x 780 pontos ampliados 2 vezes pelo viewport (`zoom`), 720 x 1560 no vídeo,
 * até 2 MB por arquivo. `computador` (27/11/2026, pedido do Enzo para `web.html`, "focar em demonstração por vídeos do app"): a versão web
 * numa janela de 1280 x 800 pontos, com o menu ao lado (o app vira o desenho largo a partir de 1024, `WIDE_MIN_WIDTH`), desenhada a 2x
 * (`deviceScaleFactor`, sem mexer no viewport) e reduzida a 1600 x 1000 no vídeo, até 750 KB por arquivo: o site mostra o vídeo com até
 * 1.100 px de largura, e o peso fica perto do de um vídeo de celular.
 */
const APARELHOS = {
  celular: { largura: LARGURA, altura: ALTURA, escala: ESCALA, zoom: true, toque: true, w: W, h: H, alvo: 2 * 1000 * 1000, crfMp4: [26, 28, 30, 32, 34], crfWebm: [36, 39, 42, 45, 48] },
  computador: { largura: 1280, altura: 800, escala: 2, zoom: false, toque: true, w: 1600, h: 1000, alvo: 750 * 1000, crfMp4: [27, 29, 31, 33, 35, 37], crfWebm: [38, 41, 44, 47, 50, 53] },
};
/** Duração aceita e tamanho: o alvo do aparelho por arquivo (a qualidade baixa até caber) e, em qualquer caso, nunca acima de 25 MB (Cloudflare Pages). */
const DURACAO_MIN = 10;
const DURACAO_MAX = 25;
const LIMITE_PAGES = 25 * 1024 * 1024;
/** As capturas das Novidades: 390 x 844 pontos (o aparelho das telas do teste) na escala 2; o painel da empresa, 960 x 680 na escala 1,5 (o painel ocupa a largura toda e o texto fica legível no site). */
const CELULAR_CAPTURA = { largura: 390, altura: 844, escala: 2 };
const PAINEL_CAPTURA = { largura: 960, altura: 680, escala: 1.5 };
/**
 * As telas de O app e do kit de imprensa (27/11/2026, no lugar das telas cruas de `docs/lojas/capturas/`, que têm o selo): o tamanho da
 * captura da App Store de 6,3 pol., 402 x 874 pontos a 3x = 1206 x 2622, o mesmo de antes, porque o kit oferece o arquivo original.
 */
const LOJA_CAPTURA = { largura: 402, altura: 874, escala: 3 };
const AGORA = '2026-10-07T10:42:00-03:00'; // o "hoje" da demonstração (DEMO_TODAY)
const TIPOS = { '.js': 'text/javascript', '.html': 'text/html', '.ttf': 'font/ttf', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.css': 'text/css', '.wasm': 'application/wasm', '.webmanifest': 'application/manifest+json' };

const executar = (cmd, args) => {
  const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`${path.basename(cmd)} falhou (${r.status}):\n${(r.stderr || '').split('\n').slice(-12).join('\n')}`);
  return r.stdout;
};

/**
 * Servidor local: serve `apps/app/dist` como está; com `zoom`, a cópia de index.html entregue ao navegador ganha o viewport ampliado (360
 * pontos ampliados 2 vezes). A porta padrão é 8699 (diferente da 8099 do teste de telas); ocupada, usa uma livre.
 */
async function servir(zoom) {
  const servidor = http.createServer((q, r) => {
    let p = path.join(DIST, decodeURIComponent(q.url.split('?')[0]));
    if (!p.startsWith(DIST) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) p = path.join(DIST, 'index.html');
    if (zoom && path.basename(p) === 'index.html') {
      const html = fs.readFileSync(p, 'utf8').replace(/<meta name="viewport"[^>]*>/, `<meta name="viewport" content="width=${LARGURA}, initial-scale=${ESCALA}, minimum-scale=${ESCALA}, maximum-scale=${ESCALA}" />`);
      r.writeHead(200, { 'content-type': 'text/html' });
      return r.end(html);
    }
    r.writeHead(200, { 'content-type': TIPOS[path.extname(p)] || 'application/octet-stream' });
    fs.createReadStream(p).pipe(r);
  });
  const ouvir = (n) => new Promise((resolve, reject) => { servidor.once('error', reject); servidor.listen(n, () => resolve(servidor.address().port)); });
  const preferida = Number(process.env.VIDEO_SITE_PORT || 8699);
  const porta = await ouvir(preferida).catch(() => ouvir(0));
  return { base: `http://localhost:${porta}`, fechar: () => servidor.close() };
}

/**
 * Roda dentro da página em todo carregamento: o "hoje" da demonstração, a escala do aparelho (só no vídeo), o círculo lima do toque e a
 * rolagem suave. Vive no navegador, por isso não usa nada de fora. `cfg.tema`: a escolha de Conta › Tema guardada antes de o app abrir.
 */
function prepararPagina(cfg) {
  // A marca das capturas (apps/app/src/lib/capture.ts, a mesma de scripts/capturas-lojas.js): a demonstração esconde o selo
  // "Demonstração" e a linha "Fica só nesta demonstração". Desde 27/11/2026 (pedido do Enzo), os vídeos e as telas do site saem sem o selo:
  // a legenda do site ("Tela da demonstração, com dados fictícios") diz de onde vem cada tela.
  window.__clarevoCaptura = true;
  // Quem confere o selo durante a gravação inteira (`__demo.seloVisto`): um texto de selo dentro da tela, em qualquer momento.
  window.__seloVisto = null;
  if (cfg.tema) { try { localStorage.setItem('clarevo.tema.v1', cfg.tema); } catch { /* sem armazenamento: o app segue o aparelho */ } }
  const Real = Date;
  const desloc = Real.parse(cfg.agora) - Real.now();
  function DataDemo(...a) {
    if (!new.target) return new Real(Real.now() + desloc).toString();
    return a.length === 0 ? new Real(Real.now() + desloc) : new Real(...a);
  }
  DataDemo.prototype = Real.prototype;
  Object.setPrototypeOf(DataDemo, Real);
  DataDemo.now = () => Real.now() + desloc;
  window.Date = DataDemo;
  if (cfg.zoom) {
    Object.defineProperty(window, 'devicePixelRatio', { get: () => cfg.escala, configurable: true });
    // O react-native-web mede a janela por visualViewport.largura x escala: sem isto o app se comportaria como num aparelho largo.
    if (window.visualViewport) Object.defineProperty(window.visualViewport, 'scale', { get: () => 1, configurable: true });
  }
  const css = `
    .__demo-toque{position:fixed;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;background:rgba(212,240,91,.5);
      border:2px solid #D4F05B;pointer-events:none;z-index:2147483500;animation:__demo-toque .75s ease-out forwards;}
    @keyframes __demo-toque{0%{transform:scale(.4);opacity:.95}100%{transform:scale(1.35);opacity:0}}`;
  const circulo = (x, y) => {
    const d = document.createElement('div');
    d.className = '__demo-toque';
    d.style.left = `${x}px`;
    d.style.top = `${y}px`;
    document.documentElement.appendChild(d);
    setTimeout(() => d.remove(), 900);
  };
  const montar = () => {
    const raiz = document.documentElement;
    if (!raiz) return false;
    const st = document.createElement('style');
    st.textContent = css;
    raiz.appendChild(st);
    if (cfg.toque) document.addEventListener('pointerdown', (e) => circulo(e.clientX, e.clientY), true);
    // Nos vídeos, nenhum texto que comece por "Demonstração" pode aparecer: a cada 400 ms, procura dentro da tela o selo ("Demonstração" ou
    // "Demonstração · Pessoal"), a linha "Fica só nesta demonstração" e as frases que começam por "Demonstração" (a de Conta, "Demonstração:
    // acesso simulado e dados fictícios..."). A legenda do site já diz que a tela é da demonstração, com dados fictícios.
    const SELO = /^(?:Demonstração\b|Fica só nesta demonstração)/;
    // Só conta o que aparece enquanto o vídeo grava (`__gravando`, ligado ao começar a captura de tela): a preparação, fora do vídeo, pode
    // passar por uma tela com a frase da demonstração.
    setInterval(() => {
      if (!window.__gravando || window.__seloVisto || !document.body) return;
      const andar = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n = andar.nextNode(); n; n = andar.nextNode()) {
        const t = (n.data || '').trim();
        if (!t || !SELO.test(t) || !n.parentElement) continue;
        // O retângulo do texto, recortado pela tela e por toda caixa com rolagem ou recorte em volta dele (o que rolou para baixo do
        // cabeçalho não aparece).
        const r0 = n.parentElement.getBoundingClientRect();
        const r = { top: Math.max(r0.top, 0), bottom: Math.min(r0.bottom, innerHeight), left: Math.max(r0.left, 0), right: Math.min(r0.right, innerWidth) };
        for (let e = n.parentElement.parentElement; e && e !== document.documentElement; e = e.parentElement) {
          const cs = getComputedStyle(e);
          if (cs.overflowX === 'visible' && cs.overflowY === 'visible') continue;
          const c = e.getBoundingClientRect();
          r.top = Math.max(r.top, c.top); r.bottom = Math.min(r.bottom, c.bottom); r.left = Math.max(r.left, c.left); r.right = Math.min(r.right, c.right);
        }
        if (r.bottom - r.top > 1 && r.right - r.left > 1 && getComputedStyle(n.parentElement).visibility !== 'hidden') {
          window.__seloVisto = t;
          return;
        }
      }
    }, 400);
    return true;
  };
  if (!montar()) {
    const mo = new MutationObserver(() => { if (montar()) mo.disconnect(); });
    mo.observe(document, { childList: true });
  }
  const facil = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const rolavel = (el) => {
    for (let e = el ? el.parentElement : null; e; e = e.parentElement) {
      const o = getComputedStyle(e).overflowY;
      if ((o === 'auto' || o === 'scroll') && e.scrollHeight > e.clientHeight + 4) return e;
    }
    return null;
  };
  const principal = () => [...document.querySelectorAll('div')]
    .filter((e) => { const o = getComputedStyle(e).overflowY; const r = e.getBoundingClientRect(); return (o === 'auto' || o === 'scroll') && e.scrollHeight > e.clientHeight + 4 && r.width > 200 && r.height > 200; })
    .sort((a, b) => b.clientHeight * b.clientWidth - a.clientHeight * a.clientWidth)[0] || null;
  const animar = (cont, alvo, ms) => new Promise((resolve) => {
    const ini = cont.scrollTop;
    const max = cont.scrollHeight - cont.clientHeight;
    const fim = Math.max(0, Math.min(max, alvo));
    if (Math.abs(fim - ini) < 2) return resolve();
    if (ms <= 0) { cont.scrollTop = fim; return resolve(); }
    let t0 = null;
    const passo = (t) => {
      if (t0 === null) t0 = t;
      const k = Math.min(1, (t - t0) / ms);
      cont.scrollTop = ini + (fim - ini) * facil(k);
      if (k < 1) requestAnimationFrame(passo); else resolve();
    };
    requestAnimationFrame(passo);
  });
  window.__demo = {
    circulo,
    rolarAte(el, ms, margem) {
      const cont = rolavel(el);
      if (!cont) return Promise.resolve();
      return animar(cont, cont.scrollTop + (el.getBoundingClientRect().top - cont.getBoundingClientRect().top) - margem, ms);
    },
    rolarPara(y, ms) {
      const cont = principal();
      if (!cont) return Promise.resolve();
      return animar(cont, y === 'fim' ? cont.scrollHeight : y, ms);
    },
  };
}

/** O que a página oferece ao roteiro: localizadores e gestos (os mesmos de `gravar-redes.js`). */
function ferramentas(p, { altura, largura, topo = 90, base = 80 }) {
  const pausa = (ms) => p.waitForTimeout(ms);
  const botao = (name, exact = true) => p.getByRole('button', { name, exact }).filter({ visible: true }).first();
  const aba = (name) => p.getByRole('tab', { name, exact: true }).filter({ visible: true }).first();
  const radio = (name) => p.getByRole('radio', { name, exact: true }).filter({ visible: true }).first();
  const campo = (name) => p.getByLabel(name, { exact: true }).filter({ visible: true }).first();
  const texto = (t, exact = false) => p.getByText(t, { exact }).filter({ visible: true }).first();
  const esperar = (t, timeout = 15000) => texto(t).waitFor({ timeout });
  const rolarAte = async (loc, ms = 1300, margem = 140) => {
    await loc.waitFor({ timeout: 15000 });
    await loc.evaluate((el, a) => window.__demo.rolarAte(el, a.ms, a.margem), { ms, margem });
  };
  const rolarPara = (y, ms = 1300) => p.evaluate((a) => window.__demo.rolarPara(a.y, a.ms), { y, ms });
  /** Toca: se o alvo está fora da área livre (entre o cabeçalho e a barra de baixo, no celular), rola até ele primeiro. */
  const tocar = async (loc, { antes = 300 } = {}) => {
    await loc.waitFor({ timeout: 15000 });
    const dentro = await loc.evaluate((e, a) => { const r = e.getBoundingClientRect(); return r.top >= a.topo && r.bottom <= a.h - a.base; }, { h: altura, topo, base });
    if (!dentro) await rolarAte(loc, 900, 200);
    await pausa(antes);
    await loc.click();
  };
  const digitar = async (loc, t, atraso = 75) => { await loc.click(); await loc.pressSequentially(t, { delay: atraso }); };
  /** O círculo do toque sobre um elemento, sem tocar nele (o vídeo do tema mostra o toque em "Aplicar agora" sem recarregar a página). */
  const mostrarToque = (loc) => loc.evaluate((e) => { const r = e.getBoundingClientRect(); window.__demo.circulo(r.left + r.width / 2, r.top + r.height / 2); });
  /**
   * O selo "Demonstração" do app aparece em algum pedaço da tela neste instante (o texto do selo, "Demonstração" ou "Demonstração · Pessoal",
   * a linha "Fica só nesta demonstração" ou o selo compacto, pelo nome)? Desde 27/11/2026 a resposta tem de ser não: a marca das capturas
   * (`__clarevoCaptura`) esconde o selo. O aviso do painel da empresa ("Demonstração: empresa e pessoas fictícias...") não é o selo.
   */
  const seloVisivel = async () => {
    if ((await p.locator('[aria-label="Demonstração: acesso simulado e dados fictícios"]').filter({ visible: true }).count()) > 0) return true;
    return p.evaluate((d) => [...document.querySelectorAll('div,span')].some((e) => {
      if (e.children.length > 0 || !/^(?:Demonstração(?: · .+)?|Fica só nesta demonstração\.?)$/.test((e.textContent || '').trim())) return false;
      const r = e.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < d.h && r.right > 0 && r.left < d.w;
    }), { h: altura, w: largura });
  };
  return { pausa, botao, aba, radio, campo, texto, esperar, rolarAte, rolarPara, tocar, digitar, mostrarToque, seloVisivel };
}

/** Entra na demonstração e espera o Resumo de outubro. `cenario`: um cenário da demonstração (`?cenario=negocio`, D-113). */
async function entrarNaDemo(p, base, f, cenario = null) {
  await p.goto(`${base}/${cenario ? `?cenario=${cenario}` : ''}`);
  await f.esperar('Cuidar da vida financeira');
  // Só o build de demonstração marca o botão (DEMO_ENTRY_TEST_ID, core/welcome.ts): a versão publicada também tem "Ver a demonstração".
  const entrar = p.locator('[data-testid="entrar-na-demonstracao"]').filter({ visible: true }).first();
  await entrar.waitFor({ timeout: 15000 }).catch(() => { throw new Error('apps/app/dist não é o build de demonstração: o botão "Ver a demonstração" não tem a marca do build de demonstração (na versão publicada, ele abre a demonstração da web). Rode com --build'); });
  await entrar.click();
  await f.esperar('Diferença do mês');
  // O Resumo de outubro do cenário de sempre (o do negócio tem o mesmo Pessoal); o cenário "evolucao" tem outros meses e outros valores.
  if (cenario !== 'evolucao') await f.esperar('R$ 2.100,00');
  await p.waitForTimeout(700);
}

/** Bloqueia qualquer requisição para fora de localhost e guarda o que tentou sair (a gravação falha se houver). */
async function bloquearRede(ctx, fora) {
  await ctx.route('**/*', (rota) => {
    const u = new URL(rota.request().url());
    if (['localhost', '127.0.0.1'].includes(u.hostname) || u.protocol === 'data:' || u.protocol === 'blob:') return rota.continue();
    fora.push(rota.request().url());
    return rota.abort();
  });
}

/** Dimensões de um PNG (IHDR). */
const dimensoesPng = (arquivo) => png.dimensoes(fs.readFileSync(arquivo));

/** Grava um PNG com até 256 cores, sem pontilhado (as telas do app têm poucas cores de verdade), como as capturas do site. */
function gravarPngReduzido(origem, destino, largura = null) {
  let imagem = png.decodificar(fs.readFileSync(origem));
  if (largura && imagem.largura !== largura) imagem = png.reduzir(imagem, largura);
  fs.writeFileSync(destino, png.codificar(imagem, { quantizar: true }));
}

/** Os prints fictícios da fatura aberta (o mesmo desenho do teste de telas, D-108): texto inventado, nenhum dado de pessoa real. */
async function prints(browser) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clarevo-video-prints-'));
  const ctx = await browser.newContext();
  const gerar = async (nome, titulo, linhas) => {
    const html = linhas.map((r) => (typeof r === 'string'
      ? `<div style="font:bold 20px Arial;color:#555;margin:18px 0 6px">${r}</div>`
      : `<div style="display:flex;justify-content:space-between;align-items:flex-start;padding:10px 0;border-bottom:1px solid #ddd"><div><div style="font:22px Arial">${r[0]}</div>${r[2] ? `<div style="font:18px Arial;color:#666">${r[2]}</div>` : ''}</div><div style="font:22px Arial;white-space:nowrap">${r[1]}</div></div>`)).join('');
    const pg = await ctx.newPage();
    await pg.setViewportSize({ width: 420, height: 200 });
    await pg.setContent(`<body style="margin:0;padding:20px;background:#fff;color:#111"><div style="font:bold 24px Arial;margin-bottom:8px">${titulo}</div>${html}</body>`);
    const arq = path.join(dir, nome);
    await pg.screenshot({ path: arq, fullPage: true });
    await pg.close();
    return arq;
  };
  const a = await gerar('fatura-1.png', 'Fatura aberta', ['06 OUT', ['Mercado Exemplo', 'R$ 80,50'], ['Padaria Central', 'R$ 12,30'], '05 OUT', ['Loja de Roupas Exemplo', 'R$ 50,00', 'Parcela 3 de 4']]);
  const b = await gerar('fatura-2.png', 'Fatura aberta', ['05 OUT', ['Loja de Roupas Exemplo', 'R$ 50,00', 'Parcela 3 de 4'], ['Estorno Cinema Centro', '-R$ 10,00'], '04 OUT', ['Farmácia Central', 'R$ 25,00']]);
  await ctx.close();
  return { arquivos: [a, b], dir };
}

// ---------------------------------------------------------------------------------------------------------------------
// Gravação: captura de tela do Chromium, quadro a quadro, com o instante de cada um.
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Grava uma tomada: abre um contexto novo (tema do aparelho `esquema`, escolha de tema `tema`), entra na demonstração, prepara a tela fora
 * da gravação e grava o roteiro. Devolve os quadros (arquivo e instante), o início e o fim da gravação, as marcas e os cortes.
 */
async function gravarTomada(browser, servidor, def, tomada, problemas, extras) {
  const a = APARELHOS[def.aparelho || 'celular'];
  // No celular, a janela tem o tamanho do vídeo e o viewport amplia 2 vezes (`zoom`); no computador, a janela tem o tamanho em pontos e o
  // navegador desenha a 2x (`deviceScaleFactor`).
  const ctx = await browser.newContext({
    viewport: a.zoom ? { width: a.largura * a.escala, height: a.altura * a.escala } : { width: a.largura, height: a.altura },
    deviceScaleFactor: a.zoom ? 1 : a.escala,
    isMobile: a.zoom,
    hasTouch: a.zoom,
    colorScheme: tomada.esquema || 'light',
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
  });
  await ctx.addInitScript(prepararPagina, { agora: AGORA, escala: a.escala, zoom: a.zoom, toque: a.toque, tema: tomada.tema || null });
  const fora = [];
  await bloquearRede(ctx, fora);
  const p = await ctx.newPage();
  const erros = [];
  p.on('pageerror', (e) => erros.push(e.message));
  const f = ferramentas(p, a.zoom ? { altura: a.altura, largura: a.largura } : { altura: a.altura, largura: a.largura, topo: 0, base: 0 });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `clarevo-video-site-${def.id}-`));
  const quadros = [];
  const cdp = await ctx.newCDPSession(p);
  cdp.on('Page.screencastFrame', (q) => {
    const arq = path.join(dir, `q${String(quadros.length).padStart(6, '0')}.jpg`);
    fs.writeFileSync(arq, Buffer.from(q.data, 'base64'));
    quadros.push({ t: q.metadata && q.metadata.timestamp ? q.metadata.timestamp : Date.now() / 1000, arq });
    cdp.send('Page.screencastFrameAck', { sessionId: q.sessionId }).catch(() => {});
  });
  const marcas = {};
  const cortes = [];
  let capa = null;
  const c = {
    p, base: servidor.base, ...f, ...extras,
    /** Marca um instante do vídeo (a transição do vídeo do tema). */
    marcar: (nome) => { marcas[nome] = Date.now() / 1000; },
    /** A capa: o PNG da tela agora (ela precisa estar parada), sem o selo "Demonstração" (desde 27/11/2026). */
    capa: async () => {
      if (await f.seloVisivel()) throw new Error(`${def.id}: o selo "Demonstração" está na tela no momento da capa (a marca __clarevoCaptura não pegou?)`);
      capa = path.join(dir, 'capa.png');
      await p.screenshot({ path: capa });
    },
    /** Encurta uma espera: a partir de agora, depois de `manter` segundos, o vídeo pula até `fim()`. */
    encurtar: (manter = 1.2) => {
      const de = Date.now() / 1000 + manter;
      return { fim: () => { const ate = Date.now() / 1000; if (ate > de) cortes.push({ de, ate }); } };
    },
  };
  await entrarNaDemo(p, servidor.base, f);
  if (tomada.preparar) await tomada.preparar(c);
  await p.evaluate(() => { window.__gravando = true; window.__seloVisto = null; });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 94, maxWidth: a.largura * a.escala, maxHeight: a.altura * a.escala, everyNthFrame: 1 });
  await p.waitForTimeout(500);
  const t0 = Date.now() / 1000;
  try {
    await tomada.roteiro(c);
  } catch (e) {
    const falha = path.join(os.tmpdir(), `clarevo-video-site-falha-${def.id}.png`);
    await p.screenshot({ path: falha }).catch(() => {});
    fs.writeFileSync(falha.replace(/\.png$/, '.txt'), `${e.message}\n\n${await p.locator('body').innerText().catch(() => '')}\n`);
    throw new Error(`${def.id}: ${e.message} (tela da falha em ${falha})`);
  }
  await p.waitForTimeout(200);
  const t1 = Date.now() / 1000;
  await cdp.send('Page.stopScreencast');
  await p.waitForTimeout(300);
  // O selo de demonstração nunca pode aparecer no vídeo (o detector de `prepararPagina`, ligado na gravação inteira).
  const selo = await p.evaluate(() => window.__seloVisto).catch(() => null);
  await ctx.close();
  if (selo) throw new Error(`${def.id}: o selo de demonstração apareceu na gravação ("${selo}")`);
  if (fora.length) problemas.push(`${def.id}: requisições para fora de localhost bloqueadas: ${[...new Set(fora)].slice(0, 3).join(' | ')}`);
  if (erros.length) problemas.push(`${def.id}: erros na página: ${[...new Set(erros)].slice(0, 3).join(' | ')}`);
  if (quadros.length < 20) throw new Error(`${def.id}: só ${quadros.length} quadros capturados`);
  quadros.sort((a, b) => a.t - b.t);
  return { quadros, t0, t1, marcas, cortes, capa, dir };
}

/**
 * A lista do ffmpeg (demuxer concat) de um trecho da tomada, de `ini` a `fim` (instantes do relógio), sem o tempo dos cortes: cada quadro vale
 * até o seguinte. Devolve o caminho da lista e a duração do trecho.
 */
function listaDoTrecho(tomada, ini, fim, nome) {
  const { quadros, cortes } = tomada;
  const itens = [];
  let duracao = 0;
  quadros.forEach((q, i) => {
    const a = Math.max(q.t, ini);
    const b = Math.min(i + 1 < quadros.length ? quadros[i + 1].t : fim, fim);
    if (b - a <= 1e-4) return;
    let dur = b - a;
    for (const c of cortes) dur -= Math.max(0, Math.min(b, c.ate) - Math.max(a, c.de));
    if (dur <= 1e-4) return;
    // O quadro que está na tela no início do trecho é o último anterior a ele.
    itens.push({ arq: q.arq, dur });
    duracao += dur;
  });
  if (!itens.length) throw new Error(`trecho vazio em ${nome}`);
  const arquivo = path.join(tomada.dir, `${nome}.txt`);
  fs.writeFileSync(arquivo, `${itens.map((q) => `file '${q.arq}'\nduration ${q.dur.toFixed(6)}`).join('\n')}\nfile '${itens[itens.length - 1].arq}'\n`);
  return { arquivo, duracao };
}

// JPEG é BT.601 de faixa cheia; o vídeo sai em BT.709 de faixa limitada, marcado, para o azul da marca não mudar de tom no celular.
// No computador, a mesma conversão reduz os quadros de 2560 x 1600 ao tamanho do vídeo (`w` x `h` do aparelho).
const cores = (a) => `fps=${FPS},scale=w=${a.w}:h=${a.h}:in_range=pc:out_range=tv:in_color_matrix=bt601:out_color_matrix=bt709:flags=lanczos,format=yuv420p,settb=AVTB`;
const MARCAS_DE_COR = ['-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv'];

/**
 * O vídeo-mestre, quase sem perda (H.264, CRF 8), de onde saem o MP4 e o WebM: uma tomada, ou duas juntas por uma transição suave
 * (`transicao`: o fim da primeira e o começo da segunda, paradas na mesma tela, se misturam em `duracao` segundos).
 */
function montarMestre(trechos, transicao, destino, a) {
  const entradas = trechos.flatMap((t) => ['-f', 'concat', '-safe', '0', '-i', t.arquivo]);
  let filtro;
  if (trechos.length === 1) filtro = `[0:v]${cores(a)}[v]`;
  else {
    const offset = (trechos[0].duracao - transicao).toFixed(3);
    filtro = `[0:v]${cores(a)}[a];[1:v]${cores(a)}[b];[a][b]xfade=transition=fade:duration=${transicao}:offset=${offset},format=yuv420p[v]`;
  }
  executar(FFMPEG, ['-y', '-v', 'error', ...entradas, '-filter_complex', filtro, '-map', '[v]', '-r', String(FPS), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '8', ...MARCAS_DE_COR, '-an', destino]);
}

/** MP4 (H.264) e WebM (VP9) a partir do mestre, cada um com até o alvo do aparelho (2 MB no celular): a qualidade baixa até caber. */
function codificar(mestre, destinoBase, titulo, a) {
  const meta = ['-metadata', `title=Clarevo: ${titulo} (tela da demonstração, com dados fictícios)`];
  const tentar = (crfs, args, destino) => {
    let usado = null;
    for (const crf of crfs) {
      usado = crf;
      executar(FFMPEG, ['-y', '-v', 'error', '-i', mestre, ...args(crf), ...meta, destino]);
      if (fs.statSync(destino).size <= a.alvo) break;
    }
    return usado;
  };
  const mp4 = `${destinoBase}.mp4`;
  const webm = `${destinoBase}.webm`;
  const crfMp4 = tentar(a.crfMp4, (crf) => ['-c:v', 'libx264', '-preset', 'veryslow', '-tune', 'animation', '-crf', String(crf), '-profile:v', 'high', '-level', '4.1',
    '-pix_fmt', 'yuv420p', '-g', String(FPS * 3), ...MARCAS_DE_COR, '-an', '-movflags', '+faststart'], mp4);
  const crfWebm = tentar(a.crfWebm, (crf) => ['-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', String(crf), '-deadline', 'good', '-cpu-used', '1', '-row-mt', '1',
    '-pix_fmt', 'yuv420p', '-g', String(FPS * 3), ...MARCAS_DE_COR, '-an'], webm);
  return { mp4, webm, crfMp4, crfWebm };
}

/** Confere um arquivo: codec, tamanho da imagem, sem áudio, duração, peso e, no MP4, o índice no começo (+faststart). */
function conferir(arquivo, codec, id, a) {
  const sonda = JSON.parse(executar(FFPROBE, ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', arquivo]));
  const v = sonda.streams.find((s) => s.codec_type === 'video');
  const audio = sonda.streams.some((s) => s.codec_type === 'audio');
  const bytes = fs.statSync(arquivo).size;
  const duracao = Number(sonda.format.duration);
  const problemas = [];
  if (!v || v.codec_name !== codec) problemas.push(`codec ${v && v.codec_name} (esperado ${codec})`);
  if (v && (v.width !== a.w || v.height !== a.h)) problemas.push(`${v.width} x ${v.height} (esperado ${a.w} x ${a.h})`);
  if (v && v.pix_fmt !== 'yuv420p') problemas.push(`pixel ${v.pix_fmt}`);
  if (audio) problemas.push('tem trilha de áudio');
  if (!(duracao >= DURACAO_MIN && duracao <= DURACAO_MAX)) problemas.push(`${duracao.toFixed(1)} s (de ${DURACAO_MIN} a ${DURACAO_MAX} s)`);
  if (bytes > LIMITE_PAGES) problemas.push(`${(bytes / 1e6).toFixed(1)} MB, acima do limite de 25 MB do Cloudflare Pages`);
  if (bytes > 3 * 1000 * 1000) problemas.push(`${(bytes / 1e6).toFixed(2)} MB, pesado demais para o site (mire em 1 a 2 MB)`);
  if (codec === 'h264') {
    const cabeca = fs.readFileSync(arquivo).subarray(0, 8192);
    if (!(cabeca.indexOf('moov') > 0 && (cabeca.indexOf('mdat') < 0 || cabeca.indexOf('moov') < cabeca.indexOf('mdat')))) problemas.push('sem +faststart');
  }
  if (problemas.length) throw new Error(`${id}: ${path.basename(arquivo)} fora do formato pedido: ${problemas.join('; ')}`);
  return { bytes, duracao: Number(duracao.toFixed(2)) };
}

async function gravarVideo(browser, servidor, def, manifesto, problemas, extras) {
  const tomadas = [];
  for (const t of def.tomadas) tomadas.push(await gravarTomada(browser, servidor, def, t, problemas, extras));
  let trechos;
  if (tomadas.length === 1) {
    const [a] = tomadas;
    trechos = [listaDoTrecho(a, a.t0, a.t1, 'trecho-1')];
  } else {
    // Duas tomadas da mesma tela: a primeira até a marca + a transição (parada), a segunda desde a marca (parada também).
    const [a, b] = tomadas;
    if (!a.marcas.transicao || !b.marcas.transicao) throw new Error(`${def.id}: as duas tomadas precisam marcar "transicao"`);
    trechos = [listaDoTrecho(a, a.t0, a.marcas.transicao + def.transicao + 0.04, 'trecho-1'), listaDoTrecho(b, b.marcas.transicao, b.t1, 'trecho-2')];
  }
  const capa = tomadas.map((t) => t.capa).find(Boolean);
  if (!capa) throw new Error(`${def.id}: o roteiro não marcou a capa`);
  const a = APARELHOS[def.aparelho || 'celular'];
  const mestre = path.join(tomadas[0].dir, 'mestre.mkv');
  montarMestre(trechos, def.transicao || 0, mestre, a);
  const texto = TEXTOS_DOS_VIDEOS.find((v) => v.id === def.id);
  if ((texto.aparelho || 'celular') !== (def.aparelho || 'celular')) throw new Error(`${def.id}: o aparelho do roteiro (${def.aparelho || 'celular'}) não é o de scripts/site/videos.js (${texto.aparelho || 'celular'})`);
  const base = path.join(PASTA_VIDEOS, def.id);
  const { mp4, webm, crfMp4, crfWebm } = codificar(mestre, base, texto.titulo, a);
  const infoMp4 = conferir(mp4, 'h264', def.id, a);
  const infoWebm = conferir(webm, 'vp9', def.id, a);
  const arqCapa = `${base}-capa.png`;
  // A capa no tamanho do vídeo (no computador, o PNG de 2560 x 1600 é reduzido a 1600 x 1000).
  gravarPngReduzido(capa, arqCapa, a.w);
  const d = dimensoesPng(arqCapa);
  if (d.largura !== a.w || d.altura !== a.h) throw new Error(`${def.id}: a capa saiu ${d.largura} x ${d.altura}`);
  for (const t of tomadas) fs.rmSync(t.dir, { recursive: true, force: true });
  manifesto.videos[def.id] = {
    largura: a.w,
    altura: a.h,
    duracao: infoMp4.duracao,
    mp4: { arquivo: path.basename(mp4), bytes: infoMp4.bytes, crf: crfMp4 },
    webm: { arquivo: path.basename(webm), bytes: infoWebm.bytes, crf: crfWebm },
    capa: path.basename(arqCapa),
  };
  console.log(`${def.id}: ${infoMp4.duracao.toFixed(1)} s, MP4 ${(infoMp4.bytes / 1e6).toFixed(2)} MB (CRF ${crfMp4}), WebM ${(infoWebm.bytes / 1e6).toFixed(2)} MB (CRF ${crfWebm})`);
}

// ---------------------------------------------------------------------------------------------------------------------
// Os roteiros dos vídeos. O que cada um mostra está descrito em scripts/site/videos.js (o título e a descrição que o site mostra).
// ---------------------------------------------------------------------------------------------------------------------
const naCapa = async (c) => { await c.rolarPara(0, 0); await c.pausa(400); };

const ROTEIROS = {
  'anotar-gasto': {
    tomadas: [{
      // Começa na própria tela (D-115, revisão): o formulário Anotar gasto, sem o caminho a partir do Resumo; a capa é o primeiro quadro.
      preparar: async (c) => {
        await naCapa(c);
        await c.tocar(c.botao('Anotar gasto'), { antes: 0 });
        await c.esperar('Será salvo em');
        await c.pausa(500);
      },
      roteiro: async (c) => {
        const { botao, campo, radio, aba, esperar, pausa, rolarPara, tocar, digitar, p } = c;
        await pausa(300);
        await c.capa(); // o formulário Anotar gasto, vazio
        await pausa(900);
        await digitar(campo('Descrição'), 'Farmácia', 80);
        await pausa(300);
        await digitar(campo('Valor em reais'), '35', 120);
        await pausa(400);
        await tocar(radio('Saúde'), { antes: 300 });
        await pausa(700);
        await rolarPara(0, 700);
        await pausa(400);
        await tocar(botao('Salvar gasto'), { antes: 300 });
        await esperar('Gasto salvo');
        await p.getByText('R$ 35,00').filter({ visible: true }).first().waitFor();
        await pausa(2000); // o gasto salvo: Farmácia, R$ 35,00, Saúde
        await tocar(aba('Resumo'), { antes: 300 });
        await esperar('R$ 3.935,00');
        await pausa(3200); // o Pago e a Diferença do mês já com o gasto
      },
    }],
  },
  'resumo-do-mes': {
    tomadas: [{
      preparar: naCapa,
      roteiro: async (c) => {
        const { botao, esperar, pausa, rolarAte, rolarPara, tocar, texto } = c;
        await pausa(600);
        await c.capa();
        await pausa(2600); // Diferença do mês (não é saldo), Recebido e Pago
        await rolarPara(170, 1400);
        await pausa(2200); // Ainda a pagar e a renda comprometida
        await tocar(botao(/^Renda comprometida em outubro/, false), { antes: 400 });
        await esperar('Seu limite');
        await pausa(2600); // o percentual e o que entra na conta
        await rolarAte(texto('Composição', true), 1300, 130);
        await pausa(2200);
        await tocar(botao('Voltar'), { antes: 300 });
        await esperar('Diferença do mês');
        await pausa(500);
        await rolarAte(texto('Pagamentos do mês', true), 1500, 120);
        await pausa(2600); // os pagamentos do mês e os atalhos
      },
    }],
  },
  metas: {
    tomadas: [{
      preparar: async (c) => {
        await c.tocar(c.aba('Metas'), { antes: 0 });
        await c.esperar('Reserva para imprevistos');
        await c.esperar('Seu plano de guardar');
        await naCapa(c);
      },
      roteiro: async (c) => {
        const { p, botao, radio, campo, esperar, pausa, rolarAte, rolarPara, tocar, digitar } = c;
        await pausa(300);
        await c.capa(); // a aba Metas, com a reserva para imprevistos e o plano de guardar
        await pausa(1500); // a reserva para imprevistos e o plano de guardar
        await rolarAte(botao('Nova meta'), 1500, 330);
        await pausa(1500); // a meta Viagem de férias
        await tocar(botao('Nova meta'), { antes: 300 });
        await esperar('O que você quer conquistar?');
        await pausa(700);
        await tocar(radio('Estudos').or(botao('Estudos')).first(), { antes: 300 });
        await pausa(400);
        await digitar(campo('Valor da meta'), '3000', 90);
        await pausa(400);
        await rolarAte(p.getByRole('radiogroup', { name: 'Atalhos de prazo' }).filter({ visible: true }).first(), 900, 260);
        await tocar(radio('1 ano: até 10/2027'), { antes: 300 });
        await p.getByText(/^Para chegar até outubro de 2027/).filter({ visible: true }).first().waitFor();
        await pausa(1500); // o atalho de 1 ano marcado, o prazo preenchido e quanto guardar por mês
        await rolarPara('fim', 800);
        await pausa(300);
        await tocar(botao('Criar meta'), { antes: 300 });
        await esperar('Meta criada.');
        await pausa(3100); // a meta criada: o guardado, o que falta e quanto guardar por mês até o prazo
      },
    }],
  },
  investir: {
    tomadas: [{
      // Começa na própria tela (D-115, revisão): a aba Investir.
      preparar: async (c) => {
        await c.tocar(c.aba('Investir'), { antes: 0 });
        await c.esperar('Seus investimentos hoje');
        await naCapa(c);
      },
      roteiro: async (c) => {
        const { p, radio, esperar, pausa, rolarAte, tocar, texto } = c;
        await pausa(300);
        await c.capa();
        await pausa(2400); // o valor de hoje, o aportado e o ganho
        await tocar(p.getByRole('button', { name: /\. Ver desempenho$/ }).filter({ visible: true }).first(), { antes: 300 });
        await esperar('Comparar com CDI, IPCA e poupança');
        await pausa(1600);
        await rolarAte(texto('Aplicação do banco', true), 1300, 150);
        await pausa(2600); // quanto rendeu ao lado do CDI, do IPCA e da poupança
        await tocar(radio('Desde o início'), { antes: 300 });
        await pausa(1800);
        await rolarAte(texto('Previdência', true), 1300, 150);
        await pausa(2400);
      },
    }],
  },
  'importar-fatura-print': {
    tomadas: [{
      preparar: async (c) => {
        await c.tocar(c.aba(/^Movimentos/), { antes: 0 });
        await c.esperar('Organizar');
        await c.tocar(c.p.getByRole('button', { name: /^Cartões, / }).filter({ visible: true }).first(), { antes: 0 });
        await c.tocar(c.p.getByRole('button', { name: /^Cartão Exemplo · final 1234\./ }).filter({ visible: true }).first(), { antes: 0 });
        await c.esperar('Fatura atual');
        await naCapa(c);
      },
      roteiro: async (c) => {
        const { p, botao, esperar, pausa, rolarAte, rolarPara, tocar, texto } = c;
        await pausa(300);
        await c.capa(); // a tela do cartão, com a fatura atual
        await pausa(1000); // o cartão e a fatura atual
        await tocar(botao('Importar fatura'), { antes: 300 });
        await esperar('Escolha o arquivo');
        await pausa(600);
        await rolarAte(texto('Ou envie prints da tela do banco', true), 1100, 150);
        await pausa(1600); // os prints são lidos no aparelho
        const [escolha] = await Promise.all([p.waitForEvent('filechooser'), tocar(botao('Escolher prints'), { antes: 300 })]);
        await escolha.setFiles(c.prints);
        const espera = c.encurtar(1.2);
        await esperar('2 prints lidos', 120000);
        espera.fim();
        await pausa(1800); // 5 linhas lidas, a repetida contada uma vez
        await tocar(botao('Revisar as linhas'), { antes: 300 });
        await esperar('Marque o que vira lançamento');
        await pausa(2500); // "Lido de imagem: confira" em cada linha
        await rolarAte(texto('Parcela em andamento', true), 1400, 200);
        await pausa(1600);
        await tocar(botao('Importar 4 lançamentos'), { antes: 300 });
        await esperar('Importação concluída');
        await p.getByText('4 lançamentos importados.').filter({ visible: true }).first().waitFor({ timeout: 10000 });
        await rolarPara(0, 0);
        await pausa(2200);
      },
    }],
  },
  'calendario-do-mes': {
    tomadas: [{
      // Começa na própria tela (D-115, revisão): o Calendário de outubro, aberto pelo atalho do Resumo antes de gravar.
      preparar: async (c) => {
        const atalho = c.botao('Calendário do mês, Contas, faturas e datas de outubro de 2026');
        await c.rolarAte(atalho, 0, 330);
        await c.tocar(atalho, { antes: 0 });
        await c.esperar('Previsto em contas e faturas');
        await naCapa(c);
      },
      roteiro: async (c) => {
        const { botao, esperar, pausa, rolarAte, rolarPara, tocar, texto, p } = c;
        await pausa(300);
        await c.capa();
        await pausa(1800); // o previsto do mês, separado do que já foi pago
        await rolarAte(texto('Quinta, 15 de outubro', true), 1500, 150);
        await pausa(2000); // um título por dia, com as contas
        await rolarAte(texto('No mês, sem dia marcado', true), 1300, 150);
        await pausa(1600); // os aportes planejados
        await rolarPara(0, 900);
        await tocar(botao('Próximo mês: novembro de 2026'), { antes: 300 });
        await esperar('Pessoal · Novembro de 2026');
        await pausa(1000);
        await rolarAte(p.getByRole('button', { name: /^Fatura Cartão Exemplo, R\$ 550,00/ }).filter({ visible: true }).first(), 1400, 200);
        await pausa(2400); // a fatura do cartão e a conta de luz estimada
      },
    }],
  },
  'tema-escuro-claro': {
    // Duas tomadas da mesma tela, com o aparelho no tema escuro: na primeira o app segue o aparelho (escuro) e a pessoa escolhe "Claro" em
    // Conta › Tema; "Aplicar agora" recarrega a página no app (na demonstração, volta às boas-vindas), então o vídeo mostra o toque e passa,
    // numa transição suave, para a segunda tomada: o app já claro, com "Claro" marcado, como fica depois de aplicar.
    transicao: 1.1,
    tomadas: [
      {
        esquema: 'dark',
        // Começa na própria tela (D-115, revisão): Conta, no tema escuro; depois, o card Tema. Desde 27/11/2026, sem o selo e já abaixo do
        // cartão do perfil (que, na demonstração, diz "Demonstração: acesso simulado e dados fictícios..."): a legenda do site diz o mesmo.
        preparar: async (c) => {
          await c.tocar(c.botao('Conta: perfil, assinatura, lembretes, privacidade e segurança'), { antes: 0 });
          await c.esperar('Privacidade neste aparelho');
          await naCapa(c);
          // O título "Sugestão ou problema" logo abaixo do cabeçalho: o cartão do perfil e o link "O que é a demonstração?" ficam acima.
          await c.rolarAte(c.texto('Sugestão ou problema', true), 0, 56);
          await c.pausa(400);
        },
        roteiro: async (c) => {
          const { p, botao, radio, pausa, rolarAte, tocar } = c;
          await pausa(300);
          await c.capa(); // Conta, no tema escuro
          await pausa(1000);
          await rolarAte(p.getByRole('heading', { name: 'Tema', exact: true }).filter({ visible: true }).first(), 1300, 170);
          await pausa(1100); // o card Tema: "Igual ao aparelho", "Claro" e "Escuro"
          await tocar(radio('Claro'), { antes: 300 });
          await botao('Aplicar agora').waitFor({ timeout: 8000 });
          await pausa(1300);
          await c.mostrarToque(botao('Aplicar agora'));
          await pausa(380);
          c.marcar('transicao');
          await pausa(1400);
        },
      },
      {
        esquema: 'dark',
        tema: 'light',
        preparar: async (c) => {
          await c.tocar(c.botao('Conta: perfil, assinatura, lembretes, privacidade e segurança'), { antes: 0 });
          await c.esperar('Privacidade neste aparelho');
          await c.pausa(400);
          await c.rolarAte(c.p.getByRole('heading', { name: 'Tema', exact: true }).filter({ visible: true }).first(), 0, 170);
          await c.pausa(500);
        },
        roteiro: async (c) => {
          const { botao, esperar, pausa, rolarPara, tocar } = c;
          await pausa(150);
          c.marcar('transicao');
          await pausa(2100); // o app claro, com "Claro" marcado
          await tocar(botao('Voltar'), { antes: 300 });
          await esperar('Diferença do mês');
          await pausa(1600); // o Resumo no tema claro
          await rolarPara(260, 1500);
          await pausa(1600);
        },
      },
    ],
  },
};

// ---------------------------------------------------------------------------------------------------------------------
// Os vídeos do computador (27/11/2026, `web.html` e o bloco "Use no navegador ou no celular" do início): a versão web a 1280 x 800
// pontos, com o menu ao lado. O mesmo método dos vídeos de celular, com o aparelho `computador`.
// ---------------------------------------------------------------------------------------------------------------------
/** O link do menu ao lado (Resumo, Movimentos, Metas, Investir, Aprender), pelo nome. */
const menuAoLado = (c, nome) => c.p.getByRole('link', { name: nome, exact: true }).filter({ visible: true }).first();

Object.assign(ROTEIROS, {
  'computador-resumo': {
    aparelho: 'computador',
    tomadas: [{
      preparar: naCapa,
      roteiro: async (c) => {
        const { esperar, pausa, rolarPara, tocar } = c;
        await pausa(500);
        await c.capa(); // o Resumo de outubro, com o menu ao lado
        await pausa(2600); // a Diferença do mês, o Recebido e o Pago
        await rolarPara(330, 1600);
        await pausa(2400); // os pagamentos do mês, as metas e o orçamento
        await rolarPara(0, 1100);
        await pausa(600);
        await tocar(menuAoLado(c, 'Movimentos do mês'), { antes: 400 });
        await esperar('Organizar');
        await pausa(2800); // os lançamentos de outubro numa tabela
        await tocar(menuAoLado(c, 'Resumo'), { antes: 400 });
        await esperar('Diferença do mês');
        await pausa(1600);
      },
    }],
  },
  'computador-anotar': {
    aparelho: 'computador',
    tomadas: [{
      // Começa na própria tela: o formulário Anotar gasto aberto ao lado do Resumo (a capa fica diferente da do vídeo do Resumo).
      preparar: async (c) => {
        await naCapa(c);
        await c.tocar(c.botao('Anotar gasto'), { antes: 0 });
        await c.esperar('Será salvo em');
        await c.pausa(600);
      },
      roteiro: async (c) => {
        const { botao, campo, radio, esperar, pausa, tocar, digitar, p } = c;
        await pausa(400);
        await c.capa(); // o formulário Anotar gasto, vazio, ao lado do Resumo
        await pausa(1100);
        await digitar(campo('Descrição'), 'Farmácia', 80);
        await pausa(300);
        await digitar(campo('Valor em reais'), '35', 120);
        await pausa(400);
        await tocar(radio('Saúde'), { antes: 300 });
        await pausa(800);
        await tocar(botao('Salvar gasto'), { antes: 300 });
        await esperar('Gasto salvo');
        await p.getByText('R$ 35,00').filter({ visible: true }).first().waitFor();
        await pausa(2000); // o gasto salvo: Farmácia, R$ 35,00, Saúde
        await tocar(botao('Ver resumo do mês'), { antes: 300 });
        await esperar('R$ 3.935,00');
        await pausa(2600); // o Pago e a Diferença do mês já com o gasto
      },
    }],
  },
  'computador-importar': {
    aparelho: 'computador',
    tomadas: [{
      // Começa em Movimentos, com a lista de outubro e "Importar extrato ou fatura" em Organizar.
      preparar: async (c) => {
        await c.tocar(menuAoLado(c, 'Movimentos do mês'), { antes: 0 });
        await c.esperar('Organizar');
        await naCapa(c);
      },
      roteiro: async (c) => {
        const { p, botao, esperar, pausa, rolarAte, rolarPara, tocar, texto } = c;
        await pausa(400);
        await c.capa(); // Movimentos de outubro
        await pausa(1400);
        await tocar(p.getByRole('button', { name: /^Importar extrato ou fatura/ }).filter({ visible: true }).first(), { antes: 300 });
        await esperar('Escolha o arquivo');
        await pausa(1200); // o arquivo é lido no aparelho
        const [escolha] = await Promise.all([p.waitForEvent('filechooser'), tocar(botao('Escolher o arquivo'), { antes: 300 })]);
        await escolha.setFiles(c.extrato);
        await esperar('Arquivo lido: extrato-exemplo.csv', 15000);
        await pausa(1200); // as linhas lidas
        // A planilha não diz de onde é: a pessoa escolhe o banco ou carteira e a conta.
        await tocar(c.radio('Banco ou carteira'), { antes: 300 });
        await c.radio('Conta principal').waitFor({ timeout: 8000 });
        await pausa(500);
        if ((await c.radio('Conta principal').getAttribute('aria-checked')) !== 'true') await tocar(c.radio('Conta principal'), { antes: 200 });
        await pausa(700);
        await tocar(botao('Revisar as linhas'), { antes: 300 });
        await esperar('Marque o que vira lançamento', 12000);
        await pausa(2200); // cada linha com a data, a categoria sugerida e o valor
        await rolarAte(texto('Cinema Centro', false), 1100, 260);
        await pausa(900);
        await tocar(p.getByRole('button', { name: /^Importar \d+ lançamentos?$/ }).filter({ visible: true }).first(), { antes: 300 });
        await esperar('Importação concluída', 12000);
        await rolarPara(0, 0);
        await pausa(2400); // os lançamentos importados
      },
    }],
  },
  'computador-contas': {
    aparelho: 'computador',
    tomadas: [{
      // Começa no Calendário de outubro, aberto pelo atalho do Resumo antes de gravar.
      preparar: async (c) => {
        await c.tocar(c.botao('Calendário do mês, Contas, faturas e datas de outubro de 2026'), { antes: 0 });
        await c.esperar('Previsto em contas e faturas');
        await naCapa(c);
      },
      roteiro: async (c) => {
        const { botao, esperar, pausa, rolarAte, rolarPara, tocar, texto, p } = c;
        await pausa(400);
        await c.capa(); // o Calendário de outubro
        await pausa(2200); // o previsto do mês, separado do que já foi pago
        await rolarAte(texto('Quinta, 15 de outubro', true), 1500, 120);
        await pausa(2000); // um título por dia, com as contas
        await rolarPara(0, 900);
        await tocar(botao('Próximo mês: novembro de 2026'), { antes: 300 });
        await esperar('Pessoal · Novembro de 2026');
        await pausa(1000);
        await rolarAte(p.getByRole('button', { name: /^Fatura Cartão Exemplo, R\$ 550,00/ }).filter({ visible: true }).first(), 1400, 200);
        await pausa(2600); // a fatura do cartão no dia do vencimento
      },
    }],
  },
});

/**
 * O extrato fictício do vídeo de importar no computador: uma planilha CSV como a dos bancos, com nomes inventados (nenhum dado de pessoa
 * real), lida no próprio navegador. Grava numa pasta temporária e devolve o caminho.
 */
function extratoDeExemplo(dir) {
  const arquivo = path.join(dir, 'extrato-exemplo.csv');
  fs.writeFileSync(arquivo, Buffer.from([
    'Data;Lançamento;Valor;Saldo',
    '02/10/2026;PADARIA EXEMPLO;-18,40;1.981,60',
    '03/10/2026;MERCADO DO BAIRRO;-126,90;1.854,70',
    '04/10/2026;FARMÁCIA CENTRAL;-42,00;1.812,70',
    '06/10/2026;CINEMA CENTRO;-56,00;1.756,70',
    '',
  ].join('\r\n'), 'latin1'));
  return arquivo;
}

/** PDF mínimo de texto (Helvetica, uma linha por Tj), como o de `scripts/capturas-lojas.js`: um comprovante de Pix com dados fictícios. */
function pdfDeTexto(linhas) {
  const esc = (t) => t.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  const conteudo = `BT /F1 10 Tf 40 800 Td 14 TL\n${linhas.map((l) => `(${esc(l)}) Tj T*`).join('\n')}\nET`;
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(conteudo, 'latin1')} >>\nstream\n${conteudo}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
  ];
  let out = '%PDF-1.4\n';
  const offsets = [];
  objs.forEach((o, i) => { offsets.push(Buffer.byteLength(out, 'latin1')); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = Buffer.byteLength(out, 'latin1');
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}
/** O comprovante de Pix fictício da tela "Comprovante lido" (o mesmo de `scripts/capturas-lojas.js`). */
const COMPROVANTE = [
  'Pix enviado', '05 OUT 2026 - 12:41:08', 'Valor', 'R$ 58,90', 'Tipo de transferência', 'Pix',
  'Destino', 'Nome', 'PADARIA EXEMPLO', 'Instituição', 'Banco Exemplo S.A.',
  'Origem', 'Nome', 'PESSOA EXEMPLO', 'Instituição', 'Banco Exemplo S.A.', 'Descrição', 'Café da manhã',
];

// ---------------------------------------------------------------------------------------------------------------------
// Capturas das Novidades, no tema claro e no escuro, e as telas de O app e do kit de imprensa (só no claro).
// ---------------------------------------------------------------------------------------------------------------------
const CAPTURAS = [
  { nome: 'resumo', tela: CELULAR_CAPTURA, exigir: ['Diferença do mês'], ir: async () => {} },
  { nome: 'investir', tela: CELULAR_CAPTURA, exigir: ['Seus investimentos hoje', 'Ganho: R$ 455,00'], ir: async (c) => { await c.aba('Investir').click(); await c.esperar('Seus investimentos hoje'); } },
  {
    nome: 'desempenho', tela: CELULAR_CAPTURA, exigir: ['Comparar com CDI, IPCA e poupança'],
    ir: async (c) => {
      await c.aba('Investir').click(); await c.esperar('Seus investimentos hoje');
      await c.p.getByRole('button', { name: /\. Ver desempenho$/ }).filter({ visible: true }).first().click(); await c.esperar('Comparar com CDI, IPCA e poupança');
      await c.pausa(400);
      await c.rolarAte(c.texto('Comparar com CDI, IPCA e poupança', true), 0, 110);
    },
  },
  {
    nome: 'metas-prazo', tela: CELULAR_CAPTURA, exigir: ['Até quando? (opcional)', 'Para chegar até outubro de 2027'],
    ir: async (c) => {
      await c.aba('Metas').click(); await c.esperar('Reserva para imprevistos');
      await c.botao('Nova meta').click(); await c.esperar('O que você quer conquistar?');
      await c.radio('Estudos').or(c.botao('Estudos')).first().click();
      await c.campo('Valor da meta').fill('3000');
      await c.radio('1 ano: até 10/2027').click();
      await c.p.getByText(/^Para chegar até outubro de 2027/).filter({ visible: true }).first().waitFor();
      await c.pausa(300);
      await c.rolarAte(c.texto('Até quando? (opcional)', true), 0, 250);
    },
  },
  {
    // As calculadoras não gravam nada (como os temas de Aprender): a legenda do site diz de onde vem a tela.
    nome: 'multa-fatura', tela: CELULAR_CAPTURA, exigir: ['a fatura fica em R$ 1.186,26'],
    ir: async (c) => {
      await c.aba(/^Movimentos/).click(); await c.esperar('Organizar');
      await c.botao('Calculadoras, Parcelado ou à vista, dívidas, reserva e outras contas').click(); await c.esperar('Decidir uma compra');
      await c.p.getByRole('button', { name: /^Multa e juros por atraso\. / }).filter({ visible: true }).first().click(); await c.esperar('Valor da conta');
      await c.radio('Fatura do cartão').click(); await c.pausa(300);
      const preencher = async (rotulo, valor) => { const campo = c.campo(rotulo); await campo.fill(valor); await campo.press('Tab'); };
      await preencher('Valor que ficou sem pagar', '1.000,00');
      await preencher('Juros do rotativo ao mês (%)', '15');
      await preencher('Juros de mora ao mês (%)', '1');
      await preencher('Multa (%)', '2');
      await preencher('Dias depois do vencimento', '30');
      await c.esperar('a fatura fica em R$ 1.186,26');
      await c.pausa(400);
      await c.rolarAte(c.p.getByText(/^Com estes números, 30 dias depois do vencimento/).filter({ visible: true }).first(), 0, 230);
    },
  },
  {
    nome: 'quem-ve', tela: CELULAR_CAPTURA, exigir: ['Quem vê estes dados?'],
    ir: async (c) => {
      await c.rolarPara('fim', 0); await c.pausa(300);
      await c.botao('Quem vê estes dados?').click(); await c.esperar('Única pessoa do app que vê, anota, edita e exclui');
    },
  },
  {
    // O Espaço Negócio (D-113, cenário "negocio", "Sacolé da Maria"), para O app (D-115). O botão aceita o nome de hoje e o novo ("Seu
    // negócio"), que o app recebe numa frente separada: depois dela, basta gravar de novo esta captura (--capturas --telas negocio).
    nome: 'negocio', tela: CELULAR_CAPTURA, cenario: 'negocio', soClaro: true, exigir: ['Últimos meses', 'Sacolé da Maria'],
    ir: async (c) => {
      await c.p.getByRole('tab', { name: 'Ver dados do negócio Sacolé da Maria', exact: true }).filter({ visible: true }).first().click(); await c.pausa(700);
      await c.p.getByRole('button', { name: /^Ver (como está o negócio|seu negócio)$/i }).filter({ visible: true }).first().click(); await c.esperar('Últimos meses');
      await c.pausa(500);
    },
  },
  {
    // O painel abre pela Conta, que só existe no layout de celular: a captura começa em 390 pontos e alarga para 960 com o painel aberto.
    nome: 'empresa-painel', tela: PAINEL_CAPTURA, telaInicial: { largura: 390, altura: 844 }, avisoDaEmpresa: true, exigir: ['Empresa Exemplo (demonstração)'],
    ir: async (c) => {
      await c.botao('Conta: perfil, assinatura, lembretes, privacidade e segurança').click(); await c.esperar('Abrir painel da empresa');
      await c.botao('Abrir painel da empresa').click(); await c.esperar('Empresa Exemplo (demonstração)');
    },
  },
];

/**
 * As telas de O app e do kit de imprensa (27/11/2026): as mesmas das telas cruas de `docs/lojas/capturas/apple-iphone-6-3pol-1206x2622/`
 * (`01_resumo.png` a `09_comprovante_lido.png`, com os mesmos caminhos de `scripts/capturas-lojas.js`), agora sem o selo "Demonstração", no
 * tamanho da captura da App Store de 6,3 pol. (1206 x 2622), só no tema claro (como as outras telas de O app). O site reduz cada uma para a
 * página, e o kit de imprensa oferece o arquivo original para baixar.
 */
const irParaMovimentos = async (c) => {
  await c.p.getByRole('tab', { name: /^Movimentos/ }).filter({ visible: true }).first().click();
  await c.esperar('Registrar recebimento');
  await c.pausa(400);
};
const TELAS_DE_O_APP = [
  { nome: 'app-resumo', tela: LOJA_CAPTURA, soClaro: true, exigir: ['Diferença do mês', 'R$ 6.000,00', 'R$ 3.900,00', 'R$ 2.100,00'], ir: async (c) => { await c.esperar('Ainda a pagar neste mês'); } },
  {
    nome: 'app-anotar-gasto', tela: LOJA_CAPTURA, soClaro: true, exigir: ['Será salvo em'],
    ir: async (c) => {
      await c.botao('Anotar gasto').click(); await c.esperar('Será salvo em');
      await c.campo('Descrição').fill('Feira de sábado');
      await c.campo('Valor em reais').fill('86,40');
      await c.pausa(300);
    },
  },
  {
    nome: 'app-contas-a-pagar', tela: LOJA_CAPTURA, soClaro: true, exigir: ['Contas em aberto com vencimento até o fim do mês'],
    ir: async (c) => {
      await c.p.getByRole('button', { name: /^Ainda a pagar neste mês, R\$/ }).filter({ visible: true }).first().click();
      await c.esperar('Contas em aberto com vencimento até o fim do mês');
      await c.pausa(500);
    },
  },
  {
    nome: 'app-cartoes', tela: LOJA_CAPTURA, soClaro: true, exigir: ['Cartão Exemplo', 'Fatura atual'],
    ir: async (c) => {
      await irParaMovimentos(c);
      await c.p.getByRole('button', { name: /^Cartões, / }).filter({ visible: true }).first().click(); await c.esperar('Adicionar outro cartão');
      await c.p.getByRole('button', { name: /^Cartão Exemplo · final 1234\./ }).filter({ visible: true }).first().click(); await c.esperar('Fatura atual');
      await c.pausa(500);
    },
  },
  {
    // O cenário fictício "evolucao" da demonstração (janeiro a junho de 2026, com um gasto grande em abril), na janela de 12 meses.
    nome: 'app-evolucao', tela: LOJA_CAPTURA, soClaro: true, cenario: 'evolucao', exigir: ['Valores registrados, pela data do pagamento'],
    ir: async (c) => {
      await irParaMovimentos(c);
      await c.p.getByRole('button', { name: /^Ver análises do mês\./ }).filter({ visible: true }).first().click(); await c.esperar('Consulte o mês escolhido');
      await c.p.getByRole('tab', { name: 'Evolução', exact: true }).filter({ visible: true }).first().click(); await c.esperar('Abrir Evolução');
      await c.botao('Abrir Evolução').click(); await c.esperar('Valores registrados, pela data do pagamento');
      const doze = c.p.getByRole('radio', { name: '12 meses' }).or(c.botao('12 meses')).filter({ visible: true }).first();
      await doze.click();
      await c.pausa(900);
      if ((await doze.getAttribute('aria-checked')) !== 'true') throw new Error('a janela de 12 meses não ficou escolhida');
    },
  },
  { nome: 'app-metas', tela: LOJA_CAPTURA, soClaro: true, exigir: ['Reserva para imprevistos', 'Suas metas'], ir: async (c) => { await c.aba('Metas').click(); await c.esperar('Reserva para imprevistos'); await c.esperar('Seu plano de guardar'); await c.pausa(600); } },
  { nome: 'app-aprender', tela: LOJA_CAPTURA, soClaro: true, exigir: ['Comece por aqui'], ir: async (c) => { await c.aba('Aprender e dúvidas').click(); await c.esperar('Comece por aqui'); await c.pausa(600); } },
  {
    // O comprovante de Pix em PDF (fictício), lido no próprio navegador, preenche o gasto (D-078, D-088).
    nome: 'app-comprovante-lido', tela: LOJA_CAPTURA, soClaro: true, exigir: ['Comprovante lido: Pix enviado', 'R$ 58,90', 'preencheu o que o comprovante informa'],
    ir: async (c) => {
      await c.botao('Anotar gasto').click(); await c.esperar('Será salvo em');
      await c.p.getByRole('button', { name: /^Escanear nota fiscal/ }).filter({ visible: true }).first().click();
      const [escolha] = await Promise.all([c.p.waitForEvent('filechooser'), c.botao('Ler comprovante ou boleto').click()]);
      await escolha.setFiles(c.comprovante);
      await c.esperar('Comprovante lido:', 20000);
      await c.p.getByText('Comprovante lido:', { exact: false }).filter({ visible: true }).first().evaluate((e) => e.scrollIntoView({ block: 'start' }));
      await c.pausa(600);
    },
  },
];
CAPTURAS.push(...TELAS_DE_O_APP);

async function gravarCapturas(browser, servidor, problemas) {
  const dirTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'clarevo-capturas-site-'));
  const comprovante = path.join(dirTemp, 'pix-enviado.pdf');
  fs.writeFileSync(comprovante, pdfDeTexto(COMPROVANTE));
  fs.mkdirSync(PASTA_TELAS, { recursive: true });
  const feitas = [];
  for (const cap of CAPTURAS.filter((x) => !SO_TELAS.length || SO_TELAS.includes(x.nome))) {
    for (const esquema of cap.soClaro ? ['light'] : ['light', 'dark']) {
      const { largura, altura, escala } = cap.tela;
      const inicial = cap.telaInicial || cap.tela;
      const ctx = await browser.newContext({ viewport: { width: inicial.largura, height: inicial.altura }, deviceScaleFactor: escala, isMobile: largura < 800, hasTouch: largura < 800, colorScheme: esquema, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
      await ctx.addInitScript(prepararPagina, { agora: AGORA, escala, zoom: false, toque: false });
      const fora = [];
      await bloquearRede(ctx, fora);
      const p = await ctx.newPage();
      const erros = [];
      p.on('pageerror', (e) => erros.push(e.message));
      const f = ferramentas(p, { altura, largura });
      await entrarNaDemo(p, servidor.base, f, cap.cenario);
      await cap.ir({ p, ...f, comprovante });
      if (cap.telaInicial) await p.setViewportSize({ width: largura, height: altura });
      await p.waitForTimeout(700);
      // Desde 27/11/2026, nenhuma tela do site tem o selo "Demonstração" (a marca `__clarevoCaptura`); a legenda do site diz de onde vem.
      if (await f.seloVisivel()) throw new Error(`captura ${cap.nome}: o selo "Demonstração" está na tela (a marca __clarevoCaptura não pegou?)`);
      // Nenhum outro texto que comece por "Demonstração" (a frase de Conta, por exemplo), fora o aviso do painel da empresa fictícia, que diz
      // que a empresa e as pessoas são fictícias (`avisoDaEmpresa`).
      const textosDeDemo = await p.evaluate((alt) => {
        const achados = [];
        const andar = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        for (let n = andar.nextNode(); n; n = andar.nextNode()) {
          const t = (n.data || '').trim();
          if (!/^Demonstração\b/.test(t) || !n.parentElement) continue;
          const r = n.parentElement.getBoundingClientRect();
          if (r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < alt) achados.push(t.slice(0, 60));
        }
        return achados;
      }, altura);
      const permitidos = cap.avisoDaEmpresa ? textosDeDemo.filter((t) => !/^Demonstração: empresa e pessoas fictícias/.test(t)) : textosDeDemo;
      if (permitidos.length) throw new Error(`captura ${cap.nome}: texto de demonstração na tela: ${permitidos.join(' | ')}`);
      for (const t of cap.exigir) if ((await p.getByText(t).filter({ visible: true }).count()) === 0) throw new Error(`captura ${cap.nome}: não achei "${t}" na tela`);
      const bruto = path.join(os.tmpdir(), `clarevo-captura-${cap.nome}-${esquema}.png`);
      await p.screenshot({ path: bruto });
      const destino = path.join(PASTA_TELAS, `${cap.nome}${esquema === 'dark' ? '-escuro' : ''}.png`);
      gravarPngReduzido(bruto, destino);
      fs.rmSync(bruto, { force: true });
      await ctx.close();
      if (fora.length) problemas.push(`captura ${cap.nome}: requisições para fora de localhost bloqueadas: ${[...new Set(fora)].slice(0, 3).join(' | ')}`);
      if (erros.length) problemas.push(`captura ${cap.nome}: erros na página: ${[...new Set(erros)].slice(0, 3).join(' | ')}`);
      const d = dimensoesPng(destino);
      feitas.push(`${path.relative(RAIZ, destino)} (${d.largura} x ${d.altura}, ${Math.round(fs.statSync(destino).size / 1024)} KB)`);
    }
  }
  fs.rmSync(dirTemp, { recursive: true, force: true });
  console.log(`capturas das Novidades e de O app:\n  ${feitas.join('\n  ')}`);
}

(async () => {
  if (!process.env.VIDEO_SITE_DIST && (argv.includes('--build') || !fs.existsSync(path.join(DIST, 'index.html')))) {
    console.log('gerando o build de demonstração (npm --workspace apps/app run export:demo)...');
    const r = spawnSync('npm', ['--workspace', 'apps/app', 'run', 'export:demo'], { cwd: RAIZ, stdio: 'inherit' });
    if (r.status !== 0) throw new Error('o build de demonstração falhou');
  }
  // Cada vídeo de scripts/site/videos.js tem roteiro, e cada roteiro tem o texto do site.
  const ids = TEXTOS_DOS_VIDEOS.map((v) => v.id);
  const semRoteiro = ids.filter((id) => !ROTEIROS[id]);
  const semTexto = Object.keys(ROTEIROS).filter((id) => !ids.includes(id));
  if (semRoteiro.length || semTexto.length) throw new Error(`vídeos sem roteiro: ${semRoteiro.join(', ') || 'nenhum'}; roteiros sem texto em scripts/site/videos.js: ${semTexto.join(', ') || 'nenhum'}`);
  const desconhecidos = SO.filter((id) => !ids.includes(id));
  if (desconhecidos.length) throw new Error(`--so com id que não existe: ${desconhecidos.join(', ')} (existem: ${ids.join(', ')})`);

  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const problemas = [];
  try {
    if (!SO_CAPTURAS) {
      fs.mkdirSync(PASTA_VIDEOS, { recursive: true });
      const manifesto = fs.existsSync(ARQUIVO_MANIFESTO) ? JSON.parse(fs.readFileSync(ARQUIVO_MANIFESTO, 'utf8')) : { videos: {} };
      const servidor = await servir(true);
      const arquivosDePrint = await prints(browser);
      const extrato = extratoDeExemplo(arquivosDePrint.dir);
      try {
        // O manifesto é gravado depois de cada vídeo (na ordem de scripts/site/videos.js): se um roteiro falhar no meio, os vídeos já feitos
        // continuam batendo com o videos.json.
        const gravarManifesto = () => {
          const ordenado = { videos: Object.fromEntries(ids.filter((id) => manifesto.videos[id]).map((id) => [id, manifesto.videos[id]])) };
          fs.writeFileSync(ARQUIVO_MANIFESTO, `${JSON.stringify(ordenado, null, 2)}\n`);
        };
        for (const id of SO.length ? SO : ids) {
          await gravarVideo(browser, servidor, { id, ...ROTEIROS[id] }, manifesto, problemas, { prints: arquivosDePrint.arquivos, extrato });
          gravarManifesto();
        }
      } finally {
        servidor.fechar();
        fs.rmSync(arquivosDePrint.dir, { recursive: true, force: true });
      }
      // A ordem do manifesto é a de scripts/site/videos.js, para o arquivo não mudar à toa.
      const ordenado = { videos: Object.fromEntries(ids.filter((id) => manifesto.videos[id]).map((id) => [id, manifesto.videos[id]])) };
      fs.writeFileSync(ARQUIVO_MANIFESTO, `${JSON.stringify(ordenado, null, 2)}\n`);
    }
    if (!SO_VIDEOS) {
      const servidor = await servir(false);
      try {
        await gravarCapturas(browser, servidor, problemas);
      } finally {
        servidor.fechar();
      }
    }
  } finally {
    await browser.close();
  }
  if (problemas.length) {
    console.error(`\nproblemas:\n  ${problemas.join('\n  ')}`);
    process.exit(1);
  }
  console.log('\npronto. Agora: node scripts/gerar-site.js');
})().catch((e) => {
  console.error(e.stack || e.message);
  process.exit(1);
});
