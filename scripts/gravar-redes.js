#!/usr/bin/env node
/**
 * Gravações e capturas reais do app para as peças de demonstração das redes sociais (D-067, Playbook de Redes v2.1, `docs/24_REDES_SOCIAIS.md`).
 *
 * Grava com a DEMONSTRAÇÃO do app (dados fictícios e identificados, a etiqueta "Demonstração" no alto de cada tela, nenhuma rede), na mesma
 * versão web de `npm --workspace apps/app run export:demo` que `scripts/video-demonstracao.js` usa:
 *   - P02: o orçamento por categoria de outubro (Mercado e Lazer, com o orçado, o usado e o que falta ou passa);
 *   - P05: começar o orçamento de uma categoria (Transporte, R$ 600,00 por mês, salvar e ver o card);
 *   - P08: criar uma meta (modelo "Estudos") e ver o progresso;
 *   - P11: anotar o primeiro gasto (R$ 35,00) e ver onde ele aparece;
 *   - capturas estáticas 1080 x 1350 (4:5) do orçamento, do Resumo, de Contas a pagar e de "Seu mês em 30 segundos".
 *
 * Cada vídeo sai em 1080 x 1920 (9:16), H.264 (yuv420p, +faststart), sem áudio, com uma legenda `.srt` da narração sugerida, a capa (PNG
 * 1080 x 1920) e 3 quadros de conferência, todos tirados do próprio MP4. A narração é montada com os números LIDOS DA TELA no momento da
 * gravação (nada é digitado à mão no texto): se a demonstração mudar, a narração acompanha, e o script falha se a tela não tiver o que a peça
 * mostra. O que o app não mostra (por exemplo "saldo" ou o "nome" de um orçamento) a narração não diz. Texto sem travessão e sem a expressão
 * proibida pelo CLAUDE.md (o script confere cada fala). A arte final (pergunta na tela, "Exemplo fictício", cortes, fonte, trilha) é da equipe,
 * no Edits e no Canva: aqui sai só a gravação limpa, com o toque marcado por um círculo lima.
 *
 * Como o vídeo sai nítido e no tempo certo: a página é ampliada 3 vezes (`<meta name="viewport">` com `width=360, initial-scale=3` só na cópia
 * que o servidor local entrega) numa janela de 1080 x 1920, então o app enxerga 360 x 640 pontos e o navegador desenha de novo em vez de esticar
 * uma imagem. Em vez do `recordVideo` do Playwright (que repete quadros e anda alguns por cento mais devagar que o relógio), o script usa a
 * captura de tela do próprio Chromium (`Page.startScreencast`), guarda cada quadro com o instante em que o navegador o desenhou e monta o MP4
 * com a duração exata de cada quadro. As falas marcam seus instantes no mesmo relógio, então a legenda e os quadros de conferência batem com o
 * arquivo sem ajuste. O "hoje" da demonstração (07/10/2026) vale também para o relógio da página ("Anotado por você em ...").
 *
 * Uso:
 *   node scripts/gravar-redes.js --saida <pasta>        grava tudo (padrão da pasta: <pasta temporária>/clarevo-redes)
 *   node scripts/gravar-redes.js --so p02,p05,capturas  só estas peças (p02, p05, p08, p11, capturas)
 *   node scripts/gravar-redes.js --build                refaz o build de demonstração antes (sem ele, usa apps/app/dist se existir)
 *   node scripts/gravar-redes.js --manter-quadros       guarda os quadros brutos da captura em <pasta>/quadros-brutos
 *   node scripts/gravar-redes.js --apresentacao         só os clipes da apresentação (abaixo), em vez das peças das redes
 * Ambiente: FFMPEG e FFPROBE (padrão /usr/bin/ffmpeg e /usr/bin/ffprobe, ou os do PATH), CHROMIUM_PATH (outro Chromium) e
 * PLAYWRIGHT_BROWSERS_PATH (padrão /opt/pw-browsers, se existir). Os arquivos de mídia NÃO vão para o repositório.
 *
 * Saída em <pasta>: pNN-nome.mp4, pNN-nome.srt, pNN-nome-capa.png, pNN-nome-conferencia-1..3.png, capturas/*.png (1080 x 1350),
 * manifesto.json (versão, data, números lidos da tela e a narração de cada peça) e montagem.png (a capa e um quadro de cada vídeo, mais as capturas).
 *
 * Opção `--apresentacao` (clipes para slides 16:9, que tocam dentro de um quadro de celular ou de tela): grava os cinco clipes de `CLIPES`
 * (clipe-1-resumo, clipe-2-contas-a-pagar, clipe-3-familia, clipe-4-aprender-e-calculadora, clipe-5-painel-da-instituicao), com a mesma
 * demonstração e a mesma captura de tela, mas sem narração nem .srt: cada clipe sai com o .mp4, um quadro parado em PNG do mesmo tamanho
 * (a capa) e uma linha de legenda no manifesto. Os quatro primeiros são 1080 x 1920 (9:16) e o painel da instituição, 1920 x 1080 (16:9, o
 * app visto como na web, a 1280 x 720 pontos ampliados 1,5 vez). Cada um dura de 18 a 35 s e pesa até 12 MB (o script baixa a qualidade até
 * caber e falha se não couber). Os links de convite (Família e empresa) aparecem desfocados: o código nunca fica legível no vídeo. A
 * Família da demonstração com dados fictícios não existe (D-055), então o clipe 3 cria, antes de gravar e fora do vídeo, três contas
 * simuladas na memória da página (a conta titular e duas contas que aceitam o convite) e grava com a conta titular. O servidor local usa a porta 8599
 * (`--porta` muda) para o aparelho; o painel usa uma porta livre. Saída: clipe-N-nome.mp4, clipe-N-nome-quadro.png e manifesto.json
 * (arquivo, quadro, legenda, duração, tamanho, dimensões). `--so clipe-1,clipe-5` grava só estes.
 */
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { spawnSync } = require('node:child_process');
if (!process.env.PLAYWRIGHT_BROWSERS_PATH && fs.existsSync('/opt/pw-browsers')) process.env.PLAYWRIGHT_BROWSERS_PATH = '/opt/pw-browsers';
const { chromium } = require('playwright');

const RAIZ = path.join(__dirname, '..');
const DIST = path.join(RAIZ, 'apps', 'app', 'dist');
const argv = process.argv.slice(2);
const opcao = (nome) => { const i = argv.indexOf(nome); return i >= 0 ? argv[i + 1] : null; };
const SAIDA = path.resolve(opcao('--saida') || path.join(os.tmpdir(), argv.includes('--apresentacao') ? 'clarevo-apresentacao' : 'clarevo-redes'));
const APRESENTACAO = argv.includes('--apresentacao');
const PORTA = Number(opcao('--porta') || 8599);
const SO = (opcao('--so') || (APRESENTACAO ? 'clipe-1,clipe-2,clipe-3,clipe-4,clipe-5' : 'p02,p05,p08,p11,capturas')).split(',').map((s) => s.trim()).filter(Boolean);
const FFMPEG = process.env.FFMPEG || (fs.existsSync('/usr/bin/ffmpeg') ? '/usr/bin/ffmpeg' : 'ffmpeg');
const FFPROBE = process.env.FFPROBE || (fs.existsSync('/usr/bin/ffprobe') ? '/usr/bin/ffprobe' : 'ffprobe');

// O aparelho dos vídeos: 360 x 640 pontos (9:16), ampliado 3 vezes = 1080 x 1920.
const LARGURA = 360;
const ALTURA = 640;
const LARGURA_4X5 = 400; // capturas 4:5: 400 x 500 pontos na escala 2,7 = 1080 x 1350 (um pouco mais de tela que 360 x 450)
const ALTURA_4X5 = 500;
const ESCALA_4X5 = 2.7;
const ESCALA = 3;
const AGORA = '2026-10-07T10:42:00-03:00'; // o "hoje" da demonstração (DEMO_TODAY)
const FPS = 25;
/** Ritmo da narração sugerida: cerca de 16 caracteres por segundo (uns 190 palavras por minuto, calmo para uma voz de vídeo curto). */
const CARACTERES_POR_SEGUNDO = 16;
const TIPOS = { '.js': 'text/javascript', '.html': 'text/html', '.ttf': 'font/ttf', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.css': 'text/css', '.webmanifest': 'application/manifest+json' };
const PROIBIDO = /[\u2013\u2014]|faz\w*\s+sentido/i;

const executar = (cmd, args, extra = {}) => {
  const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, ...extra });
  if (r.status !== 0) throw new Error(`${path.basename(cmd)} falhou (${r.status}):\n${(r.stderr || '').split('\n').slice(-12).join('\n')}`);
  return r.stdout;
};

/** Dimensões de um PNG (IHDR), sem pacote. */
function dimensoesPng(arquivo) {
  const b = fs.readFileSync(arquivo);
  if (b.readUInt32BE(0) !== 0x89504e47) throw new Error(`${arquivo} não é PNG`);
  return { largura: b.readUInt32BE(16), altura: b.readUInt32BE(20) };
}

/**
 * Servidor local: serve `apps/app/dist` como está; com `zoom`, a cópia de index.html entregue ao navegador ganha o viewport ampliado
 * (`true`: 360 pontos ampliados 3 vezes, o aparelho dos vídeos; `{ largura, escala }`: outra largura e outra escala, como os 1280 pontos
 * ampliados 1,5 vez do painel em 1920 x 1080). `porta` 0 escolhe uma livre.
 */
async function servir(zoom, porta = 0) {
  const vp = zoom === true ? { largura: LARGURA, escala: ESCALA } : zoom;
  const servidor = http.createServer((q, r) => {
    let p = path.join(DIST, decodeURIComponent(q.url.split('?')[0]));
    if (!p.startsWith(DIST) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) p = path.join(DIST, 'index.html');
    if (vp && path.basename(p) === 'index.html') {
      const html = fs.readFileSync(p, 'utf8').replace(/<meta name="viewport"[^>]*>/, `<meta name="viewport" content="width=${vp.largura}, initial-scale=${vp.escala}, minimum-scale=${vp.escala}, maximum-scale=${vp.escala}" />`);
      r.writeHead(200, { 'content-type': 'text/html' });
      return r.end(html);
    }
    r.writeHead(200, { 'content-type': TIPOS[path.extname(p)] || 'application/octet-stream' });
    fs.createReadStream(p).pipe(r);
  });
  const ouvir = (n) => new Promise((resolve, reject) => { servidor.once('error', reject); servidor.listen(n, () => resolve(servidor.address().port)); });
  const portaFinal = await ouvir(porta);
  return { base: `http://localhost:${portaFinal}`, fechar: () => servidor.close() };
}

/**
 * Roda dentro da página em todo carregamento: o "hoje" da demonstração, a escala do aparelho, o círculo lima do toque e a rolagem suave.
 * Vive no navegador, por isso não usa nada de fora. `cfg.zoom`: a janela é ampliada 3 vezes (vídeo); sem ele, a escala é nativa (capturas).
 */
function prepararPagina(cfg) {
  window.__clarevoSemTour = true; // o tour de boas-vindas (D-049) cobriria o Resumo
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
    .__demo-toque{position:fixed;width:46px;height:46px;margin:-23px 0 0 -23px;border-radius:50%;background:rgba(212,240,91,.5);
      border:2px solid #D4F05B;pointer-events:none;z-index:2147483500;animation:__demo-toque .75s ease-out forwards;}
    @keyframes __demo-toque{0%{transform:scale(.4);opacity:.95}100%{transform:scale(1.35);opacity:0}}`;
  const montar = () => {
    const raiz = document.documentElement;
    if (!raiz) return false;
    const st = document.createElement('style');
    st.textContent = css;
    raiz.appendChild(st);
    if (cfg.ocultarCodigos) {
      // O link de convite (Família: /convite/<código>; empresa: /beneficio/<código>) fica desfocado: o código nunca é legível no vídeo.
      // O desfoque entra na mesma microtarefa da mudança da tela, antes de o quadro ser desenhado.
      const codigo = /\/(convite|beneficio)\/[0-9A-Za-z_-]{12,}/;
      const desfocar = (no) => {
        if (!no || no.nodeType !== 1) return;
        for (const e of [no, ...no.querySelectorAll('div,span')]) {
          if (e.children.length === 0 && codigo.test(e.textContent || '') && e.style.filter !== 'blur(9px)') e.style.filter = 'blur(9px)';
        }
      };
      new MutationObserver((lista) => {
        for (const m of lista) {
          if (m.type === 'childList') m.addedNodes.forEach(desfocar);
          else if (m.type === 'characterData') desfocar(m.target.parentElement);
        }
      }).observe(document, { childList: true, subtree: true, characterData: true });
    }
    if (cfg.toque) {
      document.addEventListener('pointerdown', (e) => {
        const d = document.createElement('div');
        d.className = '__demo-toque';
        d.style.left = `${e.clientX}px`;
        d.style.top = `${e.clientY}px`;
        raiz.appendChild(d);
        setTimeout(() => d.remove(), 900);
      }, true);
    }
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

/** O que a página oferece ao roteiro: localizadores e gestos (iguais aos de `scripts/video-demonstracao.js`). */
function ferramentas(p, { altura, largura = LARGURA, ritmo = 1 }) {
  const pausa = (ms) => p.waitForTimeout(Math.round(ms * ritmo));
  const botao = (name, exact = true) => p.getByRole('button', { name, exact }).filter({ visible: true }).first();
  const aba = (name) => p.getByRole('tab', { name, exact: true }).filter({ visible: true }).first();
  const radio = (name) => p.getByRole('radio', { name, exact: true }).filter({ visible: true }).first();
  const campo = (name) => p.getByLabel(name, { exact: true }).filter({ visible: true }).first();
  const texto = (t, exact = false) => p.getByText(t, { exact }).filter({ visible: true }).first();
  const esperar = (t, timeout = 12000) => texto(t).waitFor({ timeout });
  const rolarAte = async (loc, ms = 1500, margem = 140) => {
    await loc.waitFor({ timeout: 12000 });
    await loc.evaluate((el, a) => window.__demo.rolarAte(el, a.ms, a.margem), { ms, margem });
  };
  const rolarPara = (y, ms = 1400) => p.evaluate((a) => window.__demo.rolarPara(a.y, a.ms), { y, ms });
  /** Toca: se o alvo está fora da área livre (entre o cabeçalho e a barra de baixo), rola até ele primeiro, devagar. */
  const tocar = async (loc, { antes = 350 } = {}) => {
    await loc.waitFor({ timeout: 12000 });
    const dentro = await loc.evaluate((e, h) => { const r = e.getBoundingClientRect(); return r.top >= 90 && r.bottom <= h - 70; }, altura);
    if (!dentro) await rolarAte(loc, 1100, 180);
    await pausa(antes);
    await loc.click();
  };
  const digitar = async (loc, t, atraso = 90) => { await loc.click(); await loc.pressSequentially(t, { delay: atraso }); };
  /** A etiqueta "Demonstração" do app está inteira dentro da tela neste instante? (cabeçalho fixo, ou o das abas no alto). */
  const etiquetaVisivel = () => p.evaluate((d) => [...document.querySelectorAll('div,span')].some((e) => {
    if (e.children.length > 0 || !/^Demonstração/.test((e.textContent || '').trim())) return false;
    const r = e.getBoundingClientRect();
    return r.width > 0 && r.top >= 0 && r.bottom <= d.h && r.left >= 0 && r.right <= d.w;
  }), { h: altura, w: largura });
  return { pausa, botao, aba, radio, campo, texto, esperar, rolarAte, rolarPara, tocar, digitar, etiquetaVisivel };
}

/** Entra na demonstração (a mesma que `video-demonstracao.js` usa) e espera o Resumo de outubro. */
async function entrarNaDemo(p, base, f) {
  await p.goto(`${base}/`);
  await f.esperar('Cuidar da vida financeira');
  const entrar = f.botao('Ver demonstração com dados fictícios');
  await entrar.waitFor({ timeout: 15000 }).catch(() => { throw new Error('o botão "Ver demonstração com dados fictícios" não apareceu: apps/app/dist não é um build de demonstração (rode com --build)'); });
  await entrar.click();
  await f.esperar('Diferença do mês');
  await f.esperar('R$ 2.100,00');
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

// ---------------------------------------------------------------------------------------------------------------------
// Leitura da tela: os números da narração vêm daqui.
// ---------------------------------------------------------------------------------------------------------------------
const REAIS = 'R\\$ [\\d.]+,\\d{2}';

/** O card de uma categoria em "Orçamento por categoria": "Mercado, R$ 1.400,00 de R$ 1.800,00, 77,8% do orçamento. Faltam R$ 400,00. Alterar ...". */
async function lerCategoria(f, categoria) {
  const rotulo = await f.botao(new RegExp(`^${categoria}, R\\$`)).getAttribute('aria-label', { timeout: 12000 });
  const m = new RegExp(`^${categoria}, (${REAIS}) de (${REAIS}), ([\\d,]+%) do orçamento\\. (.+?)\\. Alterar orçamento de ${categoria}\\.$`).exec(rotulo || '');
  if (!m) throw new Error(`não entendi o card de ${categoria} no orçamento: "${rotulo}"`);
  return { usado: m[1], orcado: m[2], percentual: m[3], situacao: m[4] };
}

/** "Orçado R$ 4.600,00 · Usado R$ 4.300,00" */
async function lerTotalDoOrcamento(f) {
  const t = await f.texto('Orçado R$').innerText({ timeout: 12000 });
  const m = new RegExp(`Orçado (${REAIS}) · Usado (${REAIS})`).exec(t.replace(/\s+/g, ' '));
  if (!m) throw new Error(`não entendi o total do orçamento: "${t}"`);
  return { orcado: m[1], usado: m[2] };
}

/** Um valor do Resumo: o texto que vem logo depois do rótulo ("Pago" → "R$ 3.900,00"). */
async function lerValorDoResumo(p, rotulo) {
  const t = (await p.locator('body').innerText()).split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const i = t.indexOf(rotulo);
  const v = t.slice(i + 1, i + 4).find((l) => new RegExp(`^${REAIS}$`).test(l));
  if (i < 0 || !v) throw new Error(`não achei "${rotulo}" com valor no Resumo: ${JSON.stringify(t.slice(0, 14))}`);
  return v;
}

// ---------------------------------------------------------------------------------------------------------------------
// Legenda (.srt) e quadros
// ---------------------------------------------------------------------------------------------------------------------
const tempoSrt = (s) => {
  const ms = Math.max(0, Math.round(s * 1000));
  const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), seg = Math.floor((ms % 60000) / 1000), r = ms % 1000;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(seg).padStart(2, '0')},${String(r).padStart(3, '0')}`;
};

/** Quebra o texto em linhas de até `max` caracteres, só entre palavras. */
function linhasDe(texto, max = 42) {
  const linhas = [];
  let atual = '';
  // "R$" e o valor andam juntos: nunca ficam em linhas diferentes.
  for (const palavra of texto.replace(/R\$ /g, 'R$\u0001').split(/\s+/).map((x) => x.replace(/\u0001/g, ' '))) {
    if (atual && `${atual} ${palavra}`.length > max) { linhas.push(atual); atual = palavra; } else atual = atual ? `${atual} ${palavra}` : palavra;
  }
  if (atual) linhas.push(atual);
  return linhas;
}

/** Divide uma fala em partes que cabem em duas linhas (até 84 caracteres), juntando frases inteiras quando dá. */
function partesDaFala(fala, max = 84) {
  const frases = fala.split(/(?<=[.!?])\s+(?=[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ])/).map((x) => x.trim()).filter(Boolean);
  const partes = [];
  let atual = '';
  for (const frase of frases) {
    if (atual && `${atual} ${frase}`.length > max) { partes.push(atual); atual = frase; } else atual = atual ? `${atual} ${frase}` : frase;
  }
  if (atual) partes.push(atual);
  // Uma frase sozinha maior que o limite: parte depois de uma vírgula (de preferência) ou num espaço, o mais perto do meio.
  return partes.flatMap((t) => {
    if (t.length <= max) return [t];
    const meio = Math.floor(t.length / 2);
    const perto = (lista) => lista.sort((a, b) => Math.abs(a - meio) - Math.abs(b - meio))[0];
    const virgulas = [...t.matchAll(/, /g)].map((m) => m.index + 1).filter((i) => i > t.length * 0.25 && i < t.length * 0.75);
    const espacos = [...t.matchAll(/ /g)].map((m) => m.index);
    const corte = virgulas.length ? perto(virgulas) : perto(espacos);
    return [t.slice(0, corte).trim(), t.slice(corte).trim()];
  });
}

/** As legendas: cada fala vai do seu instante até o da fala seguinte (ou até o fim), repartida entre as partes pelo tamanho do texto. */
function montarSrt(falas, fim) {
  const cues = [];
  falas.forEach((b, i) => {
    const ate = (i + 1 < falas.length ? falas[i + 1].em : fim) - 0.12;
    const partes = partesDaFala(b.fala);
    const total = partes.reduce((s, t) => s + t.length, 0);
    let ini = b.em;
    for (const t of partes) {
      const dur = (ate - b.em) * (t.length / total);
      cues.push({ ini, fim: ini + dur - 0.04, texto: t });
      ini += dur;
    }
  });
  const srt = cues.map((c, i) => `${i + 1}\n${tempoSrt(c.ini)} --> ${tempoSrt(c.fim)}\n${linhasDe(c.texto).join('\n')}\n`).join('\n');
  const lentas = cues.filter((c) => c.texto.length / (c.fim - c.ini) > 20).map((c) => `${tempoSrt(c.ini)} (${(c.texto.length / (c.fim - c.ini)).toFixed(1)} caracteres por segundo)`);
  return { srt, cues, lentas };
}

// ---------------------------------------------------------------------------------------------------------------------
// Vídeo: captura de tela do Chromium, quadro a quadro, com o instante de cada um.
// ---------------------------------------------------------------------------------------------------------------------
async function gravarVideo(browser, servidor, def, saida, manifesto, problemas) {
  // A tela do vídeo: o aparelho (360 x 640 pontos ampliados 3 vezes) ou, nos clipes da apresentação, a que a definição pede.
  const tela = def.tela || { largura: LARGURA, altura: ALTURA, escala: ESCALA };
  const W = tela.largura * tela.escala;
  const H = tela.altura * tela.escala;
  const ctx = await browser.newContext({
    viewport: { width: W, height: H },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: !tela.desktop,
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
  });
  await ctx.addInitScript(prepararPagina, { agora: AGORA, escala: tela.escala, zoom: true, toque: true, ocultarCodigos: Boolean(def.apresentacao) });
  const fora = [];
  await bloquearRede(ctx, fora);
  const p = await ctx.newPage();
  const erros = [];
  p.on('pageerror', (e) => erros.push(e.message));
  const f = ferramentas(p, { altura: tela.altura, largura: tela.largura });

  const dirQuadros = fs.mkdtempSync(path.join(os.tmpdir(), `clarevo-redes-${def.id}-`));
  const quadros = [];
  const cdp = await ctx.newCDPSession(p);
  cdp.on('Page.screencastFrame', (q) => {
    const arq = path.join(dirQuadros, `q${String(quadros.length).padStart(6, '0')}.jpg`);
    fs.writeFileSync(arq, Buffer.from(q.data, 'base64'));
    quadros.push({ t: q.metadata && q.metadata.timestamp ? q.metadata.timestamp : Date.now() / 1000, arq });
    cdp.send('Page.screencastFrameAck', { sessionId: q.sessionId }).catch(() => {});
  });

  const falas = [];
  const pontos = []; // instantes para a capa e os quadros de conferência
  /**
   * Marca o instante de uma fala (a narração começa agora) e devolve `fim()`, que espera o que falta para ela ser dita (cerca de 16 caracteres por
   * segundo, no ritmo de uma narração calma, ou `min` segundos): a próxima fala só começa depois, então a legenda nunca fica mais rápida que a voz.
   */
  const fala = async (texto, { min = 0 } = {}) => {
    if (PROIBIDO.test(texto)) throw new Error(`${def.id}: a fala tem travessão ou a expressão proibida: ${texto}`);
    const ini = Date.now();
    falas.push({ em: ini / 1000, fala: texto });
    const duracao = Math.max(min * 1000, (texto.length / CARACTERES_POR_SEGUNDO) * 1000) + 250;
    return { fim: async () => { const resta = ini + duracao - Date.now(); if (resta > 0) await p.waitForTimeout(resta); } };
  };
  /** Marca um quadro para a capa ou para a conferência, `depois` segundos adiante, e confere que a etiqueta "Demonstração" está na tela agora. */
  const quadro = async (tipo, depois = 0.8) => {
    if (!(await f.etiquetaVisivel())) throw new Error(`${def.id}: a etiqueta "Demonstração" não está na tela no quadro de ${tipo}`);
    pontos.push({ tipo, em: Date.now() / 1000 + depois });
  };
  const c = { p, base: servidor.base, ...f, fala, quadro, lerCategoria: (cat) => lerCategoria(f, cat), lerTotalDoOrcamento: () => lerTotalDoOrcamento(f), lerValorDoResumo: (r) => lerValorDoResumo(p, r), numeros: {} };

  if (def.entrar) await def.entrar(c); else await entrarNaDemo(p, servidor.base, f);
  await def.preparar(c);
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 94, maxWidth: W, maxHeight: H, everyNthFrame: 1 });
  await p.waitForTimeout(400);
  const t0 = Date.now() / 1000;
  try {
    await def.roteiro(c);
  } catch (e) {
    // Se a tela não tem o que o roteiro espera, guarda o que a página mostrava, para saber o motivo.
    await p.screenshot({ path: path.join(saida, `falha-${def.id}.png`) }).catch(() => {});
    fs.writeFileSync(path.join(saida, `falha-${def.id}.txt`), `${e.message}\n\n${await p.locator('body').innerText().catch(() => '')}\n`);
    fs.rmSync(dirQuadros, { recursive: true, force: true });
    throw e;
  }
  await p.waitForTimeout(1500);
  const t1 = Date.now() / 1000;
  await cdp.send('Page.stopScreencast');
  await p.waitForTimeout(300);
  await ctx.close();
  if (fora.length) problemas.push(`${def.id}: requisições para fora de localhost bloqueadas: ${[...new Set(fora)].slice(0, 3).join(' | ')}`);
  if (erros.length) problemas.push(`${def.id}: erros na página: ${[...new Set(erros)].slice(0, 3).join(' | ')}`);
  if (quadros.length < 20) throw new Error(`${def.id}: só ${quadros.length} quadros capturados`);

  // Intervalos: cada quadro vale até o seguinte; o primeiro começa em t0 (o quadro mostrado nesse instante é o último anterior a ele).
  quadros.sort((a, b) => a.t - b.t);
  const lista = [];
  quadros.forEach((q, i) => {
    const ini = Math.max(q.t, t0);
    const fim = Math.min(i + 1 < quadros.length ? quadros[i + 1].t : t1, t1);
    if (fim - ini > 1e-4) lista.push({ arq: q.arq, dur: fim - ini });
  });
  const arqLista = path.join(dirQuadros, 'lista.txt');
  fs.writeFileSync(arqLista, `${lista.map((q) => `file '${q.arq}'\nduration ${q.dur.toFixed(6)}`).join('\n')}\nfile '${lista[lista.length - 1].arq}'\n`);
  const mp4 = path.join(saida, `${def.slug}.mp4`);
  // JPEG é BT.601 de faixa cheia; o vídeo sai em BT.709 de faixa limitada, marcado, para o azul da marca não mudar de tom no celular.
  // Nas peças das redes o CRF é 18; nos clipes da apresentação, que têm limite de tamanho, ele sobe de 18 até o arquivo caber.
  const limiteBytes = def.limiteMB ? def.limiteMB * 1e6 : Infinity;
  let crfUsado = 18;
  for (const crf of def.limiteMB ? [18, 20, 22, 24, 27, 30] : [18]) {
    crfUsado = crf;
    executar(FFMPEG, ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', arqLista,
      '-vf', `fps=${FPS},scale=in_range=pc:out_range=tv:in_color_matrix=bt601:out_color_matrix=bt709:flags=lanczos,format=yuv420p`,
      '-c:v', 'libx264', '-preset', 'slow', '-crf', String(crf), '-profile:v', 'high', '-level', '4.1', '-r', String(FPS),
      '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
      '-an', '-metadata', `title=Clarevo: ${def.titulo} (demonstração com dados fictícios)`, '-movflags', '+faststart', mp4]);
    if (fs.statSync(mp4).size <= limiteBytes) break;
  }
  if (fs.statSync(mp4).size > limiteBytes) throw new Error(`${def.id}: o MP4 ficou com ${(fs.statSync(mp4).size / 1e6).toFixed(1)} MB, acima do limite de ${def.limiteMB} MB, mesmo com CRF 30`);

  // Legenda, capa e quadros de conferência, tirados do próprio MP4.
  const duracao = t1 - t0;
  if (!def.apresentacao) {
    const { srt, lentas } = montarSrt(falas.map((b) => ({ ...b, em: b.em - t0 })), duracao - 0.2);
    fs.writeFileSync(path.join(saida, `${def.slug}.srt`), srt);
    if (lentas.length) console.warn(`aviso: ${def.id}: legenda rápida demais para ler em: ${lentas.join('; ')}`);
  }
  const tirar = (quando, destino) => {
    executar(FFMPEG, ['-y', '-v', 'error', '-ss', Math.max(0, Math.min(duracao - 0.1, quando - t0)).toFixed(3), '-i', mp4, '-frames:v', '1', destino]);
    const d = dimensoesPng(destino);
    if (d.largura !== W || d.altura !== H) throw new Error(`${destino} saiu ${d.largura} x ${d.altura}`);
  };
  const capa = pontos.find((x) => x.tipo === 'capa');
  const conferencia = pontos.filter((x) => x.tipo === 'conferencia');
  if (def.apresentacao) {
    // Clipe da apresentação: só a capa (o quadro parado do mesmo tamanho). Sem o quadro, não há o que entregar.
    if (!capa) throw new Error(`${def.id}: preciso do quadro de capa`);
  } else if (!capa || conferencia.length !== 3) throw new Error(`${def.id}: preciso de 1 capa e 3 quadros de conferência (achei ${capa ? 1 : 0} e ${conferencia.length})`);
  const arqCapa = path.join(saida, def.apresentacao ? `${def.slug}-quadro.png` : `${def.slug}-capa.png`);
  tirar(capa.em, arqCapa);
  const arqConf = (def.apresentacao ? [] : conferencia).map((x, i) => {
    const a = path.join(saida, `${def.slug}-conferencia-${i + 1}.png`);
    tirar(x.em, a);
    return { arquivo: path.basename(a), em: Number((x.em - t0).toFixed(1)) };
  });

  // Conferência do arquivo.
  const sonda = JSON.parse(executar(FFPROBE, ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', mp4]));
  const v = sonda.streams.find((s) => s.codec_type === 'video');
  const audio = sonda.streams.some((s) => s.codec_type === 'audio');
  const cabeca = fs.readFileSync(mp4).subarray(0, 4096);
  const faststart = cabeca.indexOf('moov') > 0 && (cabeca.indexOf('mdat') < 0 || cabeca.indexOf('moov') < cabeca.indexOf('mdat'));
  if (v.codec_name !== 'h264' || v.pix_fmt !== 'yuv420p' || v.width !== W || v.height !== H || audio || !faststart) {
    throw new Error(`${def.id}: o MP4 não está no formato pedido: ${JSON.stringify({ codec: v.codec_name, pix: v.pix_fmt, w: v.width, h: v.height, audio, faststart })}`);
  }
  if (def.apresentacao) {
    const seg = Number(sonda.format.duration);
    if (seg < 18 || seg > 35 || (def.duracaoMax && seg > def.duracaoMax) || (def.duracaoMin && seg < def.duracaoMin)) fs.rmSync(dirQuadros, { recursive: true, force: true });
    if (seg < 18 || seg > 35 || (def.duracaoMax && seg > def.duracaoMax) || (def.duracaoMin && seg < def.duracaoMin)) throw new Error(`${def.id}: o clipe tem ${seg.toFixed(1)} s, fora da faixa pedida (${def.duracaoMin || 18} a ${def.duracaoMax || 35} s)`);
    manifesto.clipes.push({
      id: def.id,
      arquivo: `${def.slug}.mp4`,
      quadro: path.basename(arqCapa),
      legenda: def.legenda,
      duracaoSegundos: Number(seg.toFixed(1)),
      tamanhoMB: Number((Number(sonda.format.size) / 1e6).toFixed(2)),
      tamanhoBytes: Number(sonda.format.size),
      dimensoes: `${v.width}x${v.height}`,
      formato: `${v.codec_name} ${v.profile} ${v.pix_fmt} ${v.r_frame_rate} fps, sem áudio, +faststart, crf ${crfUsado}`,
      mostra: def.mostra,
      faltou: def.faltou || null,
      numerosLidosDaTela: c.numeros,
    });
    console.log(`${def.id}: ${def.slug}.mp4 (${seg.toFixed(1)} s, ${(Number(sonda.format.size) / 1e6).toFixed(2)} MB, ${v.width}x${v.height}, crf ${crfUsado}, ${quadros.length} quadros capturados)`);
    if (argv.includes('--manter-quadros')) {
      const destino = path.join(saida, 'quadros-brutos', def.id);
      fs.mkdirSync(destino, { recursive: true });
      for (const q of quadros) fs.copyFileSync(q.arq, path.join(destino, path.basename(q.arq)));
    }
    fs.rmSync(dirQuadros, { recursive: true, force: true });
    return;
  }
  manifesto.videos.push({
    id: def.id,
    arquivo: `${def.slug}.mp4`,
    legenda: `${def.slug}.srt`,
    capa: path.basename(arqCapa),
    conferencia: arqConf,
    duracaoSegundos: Number(Number(sonda.format.duration).toFixed(1)),
    tamanhoMB: Number((Number(sonda.format.size) / 1e6).toFixed(2)),
    formato: `${v.codec_name} ${v.profile} ${v.width}x${v.height} ${v.pix_fmt} ${v.r_frame_rate} fps, sem áudio, +faststart`,
    numerosLidosDaTela: c.numeros,
    narracao: falas.map((b) => ({ emSegundos: Number((b.em - t0).toFixed(1)), fala: b.fala })),
  });
  console.log(`${def.id}: ${def.slug}.mp4 (${Number(sonda.format.duration).toFixed(1)} s, ${(Number(sonda.format.size) / 1e6).toFixed(2)} MB, ${quadros.length} quadros capturados)`);
  if (argv.includes('--manter-quadros')) {
    const destino = path.join(saida, 'quadros-brutos', def.id);
    fs.mkdirSync(destino, { recursive: true });
    for (const q of quadros) fs.copyFileSync(q.arq, path.join(destino, path.basename(q.arq)));
  }
  fs.rmSync(dirQuadros, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------------------------------------------------
// Os roteiros das quatro peças.
// ---------------------------------------------------------------------------------------------------------------------
const VIDEOS = [
  {
    id: 'p02',
    slug: 'p02-orcamento-orcado-e-usado',
    titulo: 'orçamento por categoria, o orçado e o usado',
    /** Movimentos, com o orçamento ainda fechado. */
    preparar: async (c) => {
      await c.tocar(c.aba('Movimentos: movimentações do mês'), { antes: 0 });
      await c.esperar('Registrar recebimento');
      await c.rolarPara(0, 0);
      await c.pausa(500);
    },
    roteiro: async (c) => {
      const { botao, texto, esperar, pausa, rolarAte, rolarPara, tocar } = c;
      // A pergunta, com a tela de Movimentos descendo até "Organizar".
      let s = await c.fala('Você sabe a diferença entre o que planejou e o que gastou?', { min: 4 });
      await c.quadro('conferencia', 0.5);
      await pausa(1400);
      const linha = botao(/^Orçamento por categoria/);
      await rolarAte(linha, 1600, 250);
      await s.fim();
      // Abre o orçamento de outubro e desce até Mercado.
      await tocar(linha, { antes: 300 });
      await esperar('Orçado R$');
      const total = await c.lerTotalDoOrcamento();
      const mercado = await c.lerCategoria('Mercado');
      const lazer = await c.lerCategoria('Lazer');
      c.numeros = { total, mercado, lazer };
      s = await c.fala(`Neste exemplo fictício, o orçamento de Mercado é de ${mercado.orcado} por mês.`);
      await pausa(1500);
      await rolarAte(botao(/^Mercado, R\$/), 1600, 215);
      await s.fim();
      // O card de Mercado: o usado, o percentual e o que falta.
      s = await c.fala(`Foram usados ${mercado.usado}, ou ${mercado.percentual}. ${mercado.situacao}.`);
      await pausa(1300);
      await c.quadro('capa', 0);
      await s.fim();
      // Lazer passou.
      s = await c.fala(`Em Lazer, o usado passou: ${lazer.usado} de ${lazer.orcado}, ${lazer.situacao.replace(/ do orçamento$/, '')}.`);
      await rolarAte(botao(/^Lazer, R\$/), 1500, 215);
      await pausa(600);
      await c.quadro('conferencia', 0);
      await s.fim();
      // A regra que a tela mostra, e o que a diferença não é.
      s = await c.fala('Leia essa diferença junto com as despesas que ainda virão. Ela não é saldo nem autorização para gastar.');
      await rolarAte(texto('O orçamento conta o usado no mês.'), 1700, 190);
      await s.fim();
      // De volta ao topo, com o total do mês.
      s = await c.fala('A Clarevo mostra essa comparação em Orçamento por categoria. Para conhecer o acesso, veja o fixado Como acessar.');
      await rolarPara(0, 1700);
      await pausa(1500);
      await c.quadro('conferencia', 0);
      await s.fim();
      await esperar('Orçado R$');
    },
  },
  {
    id: 'p05',
    slug: 'p05-orcamento-comecar-uma-categoria',
    titulo: 'começar o orçamento de uma categoria',
    preparar: async (c) => {
      await c.tocar(c.aba('Movimentos: movimentações do mês'), { antes: 0 });
      await c.esperar('Registrar recebimento');
      await c.tocar(c.botao(/^Orçamento por categoria/), { antes: 0 });
      await c.esperar('Orçado R$');
      await c.rolarPara(0, 0);
      await c.pausa(500);
    },
    roteiro: async (c) => {
      const { p, botao, campo, texto, esperar, pausa, rolarAte, rolarPara, tocar, digitar } = c;
      const antes = await c.lerTotalDoOrcamento();
      // A pergunta e a lista "Definir orçamento".
      let s = await c.fala('Quanto você pretende gastar nesta categoria?', { min: 4 });
      await c.quadro('conferencia', 0.5);
      await pausa(1200);
      await rolarAte(texto('Definir orçamento', true), 1700, 150);
      await s.fim();
      // Escolhe Transporte (a pessoa escolhe a categoria; o app não pede um nome).
      const categoria = 'Transporte';
      const valor = '600,00';
      s = await c.fala(`No exemplo fictício, vamos orçar R$ ${valor} por mês para ${categoria}.`);
      await pausa(1500);
      await tocar(botao(`Definir orçamento de ${categoria}`), { antes: 300 });
      await esperar('Valor por mês');
      await s.fim();
      // O valor por mês e o mês de início.
      s = await c.fala('Escolhemos a categoria e preenchemos o valor por mês. Ele vale a partir do mês escolhido.');
      await digitar(campo('Valor por mês'), valor.replace(/,00$/, ''), 130);
      await pausa(900);
      await p.getByText('Outubro de 2026').filter({ visible: true }).first().waitFor();
      await c.quadro('conferencia', 0.3);
      await s.fim();
      // Salvar.
      s = await c.fala('Ao salvar, o app avisa que o orçamento vale a partir de outubro.');
      await tocar(botao('Salvar orçamento'), { antes: 400 });
      await esperar(`Orçamento de ${categoria} salvo. Vale a partir de outubro.`);
      await s.fim();
      // O card novo e o total.
      const depois = await c.lerTotalDoOrcamento();
      const card = await c.lerCategoria(categoria);
      c.numeros = { totalAntes: antes, totalDepois: depois, categoria, valorDigitado: `R$ ${valor}`, card };
      s = await c.fala(`A categoria entra com ${card.usado} usados de ${card.orcado}, e o total orçado passa de ${antes.orcado} para ${depois.orcado}.`);
      await rolarAte(botao(new RegExp(`^${categoria}, R\\$`)), 1500, 215);
      await pausa(900);
      await c.quadro('capa', 0);
      await s.fim();
      s = await c.fala('Depois, é preciso conferir os registros da categoria. Para saber como acessar a Clarevo, consulte o link da bio.');
      await rolarPara(0, 1500);
      await pausa(1500);
      await c.quadro('conferencia', 0);
      await s.fim();
    },
  },
  {
    id: 'p08',
    slug: 'p08-meta-criar-e-ver-o-progresso',
    titulo: 'criar uma meta e ver o progresso',
    preparar: async (c) => {
      await c.tocar(c.aba('Metas'), { antes: 0 });
      await c.esperar('Reserva para imprevistos');
      await c.esperar('Seu plano de guardar');
      await c.rolarPara(0, 0);
      await c.pausa(500);
    },
    roteiro: async (c) => {
      const { p, botao, radio, campo, texto, esperar, pausa, rolarAte, rolarPara, tocar, digitar } = c;
      // A pergunta, com as metas da demonstração e o botão "Nova meta".
      let s = await c.fala('Qual é o próximo passo da sua meta?', { min: 4 });
      await c.quadro('conferencia', 0.5);
      await pausa(1200);
      await rolarAte(botao('Nova meta'), 1700, 300);
      await s.fim();
      // Abre o formulário.
      s = await c.fala('Neste exemplo fictício, vamos criar uma meta e registrar o que a tela pede.');
      await pausa(900);
      await tocar(botao('Nova meta'), { antes: 300 });
      await esperar('Modelo de nome');
      await s.fim();
      // Modelo de nome, valor, prazo, já guardado e plano por mês.
      const nome = 'Estudos';
      s = await c.fala('Escolhemos um modelo de nome, o valor, o prazo, quanto já está guardado e quanto pretende guardar por mês.');
      await tocar(radio(nome).or(botao(nome)).first(), { antes: 300 });
      await pausa(400);
      await digitar(campo('Valor da meta'), '3000', 100);
      await pausa(400);
      await digitar(campo('Até quando? (opcional)'), '062027', 100);
      await pausa(400);
      await digitar(campo('Quanto você já tem guardado para isso? (opcional)'), '600', 100);
      await pausa(400);
      await digitar(campo('Quanto pretende guardar por mês? (opcional)'), '300', 100);
      await p.getByText(/^Para chegar até junho de 2027/).filter({ visible: true }).first().waitFor();
      await rolarPara('fim', 900);
      await pausa(500);
      await c.quadro('conferencia', 0);
      await s.fim();
      // Criar, e o progresso.
      await tocar(botao('Criar meta'), { antes: 300 });
      await esperar('Meta criada.');
      await pausa(300);
      const t = (await p.locator('body').innerText()).replace(/\s+/g, ' ');
      const progresso = /(R\$ [\d.]+,\d{2}) de (R\$ [\d.]+,\d{2}) · (\d+%) Faltam (R\$ [\d.]+,\d{2})/.exec(t);
      const plano = /Até ([a-zç]+ de \d{4}): (R\$ [\d.]+,\d{2}) por mês, sem contar rendimentos\. Você planejou guardar (R\$ [\d.]+,\d{2}) por mês\. Contando a partir de ([a-zç]+ de \d{4}), sem rendimentos, chega lá em ([a-zç]+ de \d{4})/.exec(t);
      if (!progresso || !plano) throw new Error(`não entendi o progresso da meta: ${t.slice(0, 400)}`);
      c.numeros = { meta: nome, valorDaMeta: progresso[2], jaGuardado: progresso[1], percentual: progresso[3], faltam: progresso[4], porMesPlanejado: plano[3], chegaEm: plano[5], porMesAteOPrazo: plano[2], prazo: plano[1] };
      s = await c.fala(`Depois de salvar, o app mostra ${progresso[1]} guardados de ${progresso[2]}, ${progresso[3]}, e faltam ${progresso[4]}.`);
      await pausa(1200);
      await c.quadro('capa', 0);
      await s.fim();
      s = await c.fala(`Com ${plano[3]} por mês, a meta chega em ${plano[5]}, sem rendimentos. A Clarevo não guarda nem movimenta dinheiro.`);
      await rolarAte(texto('Já guardado ao criar:'), 1700, 200);
      await pausa(900);
      await c.quadro('conferencia', 0);
      await s.fim();
      // Fecho.
      s = await c.fala('Veja no perfil como acessar a Clarevo.', { min: 3.5 });
      await rolarPara(0, 1400);
      await s.fim();
    },
  },
  {
    id: 'p11',
    slug: 'p11-primeiro-gasto-anotar',
    titulo: 'anotar o primeiro gasto',
    preparar: async (c) => {
      await c.rolarPara(0, 0);
      await c.pausa(500);
    },
    roteiro: async (c) => {
      const { p, botao, campo, radio, aba, esperar, pausa, rolarPara, tocar, digitar } = c;
      const pagoAntes = await c.lerValorDoResumo('Pago');
      const diferencaAntes = await c.lerValorDoResumo('Diferença do mês');
      // O Resumo e o botão "Anotar gasto".
      let s = await c.fala('Seu primeiro registro na Clarevo.', { min: 3.8 });
      await c.quadro('conferencia', 0.8);
      await pausa(1800);
      await tocar(botao('Anotar gasto'), { antes: 400 });
      await esperar('Será salvo em');
      await s.fim();
      // O formulário.
      s = await c.fala('Comece com uma despesa que você já conhece. No exemplo fictício, vamos registrar R$ 35,00.');
      await pausa(4600);
      await s.fim();
      // Descrição, valor e categoria.
      const descricao = 'Farmácia';
      s = await c.fala('Confira os campos que esta versão pede: descrição, valor e categoria.');
      await digitar(campo('Descrição'), descricao, 90);
      await pausa(400);
      await digitar(campo('Valor em reais'), '35', 140);
      await pausa(500);
      await tocar(radio('Saúde'), { antes: 400 });
      await pausa(500);
      await rolarPara(0, 900);
      await pausa(700);
      await c.quadro('conferencia', 0);
      await s.fim();
      // Salvar e a tela do gasto.
      s = await c.fala('Salve e veja se o registro aparece corretamente.');
      await tocar(botao('Salvar gasto'), { antes: 400 });
      await esperar('Gasto salvo');
      await p.getByText('R$ 35,00').filter({ visible: true }).first().waitFor();
      await pausa(600);
      await c.quadro('conferencia', 0);
      await s.fim();
      // O Resumo, com o Pago e a Diferença do mês.
      await tocar(aba('Resumo'), { antes: 300 });
      await esperar('R$ 3.935,00');
      const pagoDepois = await c.lerValorDoResumo('Pago');
      const diferencaDepois = await c.lerValorDoResumo('Diferença do mês');
      c.numeros = { descricao, valor: 'R$ 35,00', categoria: 'Saúde', pagoAntes, pagoDepois, diferencaAntes, diferencaDepois };
      s = await c.fala(`No Resumo, o Pago vai de ${pagoAntes} para ${pagoDepois}, e a Diferença do mês, de ${diferencaAntes} para ${diferencaDepois}.`);
      await pausa(1200);
      await c.quadro('capa', 0);
      await s.fim();
      s = await c.fala('O gasto também aparece em Pagamentos do mês. É o primeiro passo para acompanhar. A orientação de acesso está no perfil.');
      await rolarPara(520, 1700);
      await pausa(3000);
      await rolarPara(0, 1400);
      await s.fim();
    },
  },
];

// ---------------------------------------------------------------------------------------------------------------------
// Os cinco clipes da apresentação (`--apresentacao`): funcionalidades reais da demonstração, sem narração, para slides 16:9.
// ---------------------------------------------------------------------------------------------------------------------
/** O painel da instituição é visto como na web: 1280 x 720 pontos ampliados 1,5 vez = 1920 x 1080 (16:9). */
const TELA_PAINEL = { largura: 1280, altura: 720, escala: 1.5, desktop: true };
const SENHA_FICTICIA = 'senha1234';

/** Roteiros auxiliares da Família: contas simuladas na memória da página (a demonstração com dados fictícios não tem Família, D-055). */
function auxiliaresDaFamilia(c) {
  const { p, texto, esperar } = c;
  const bt = (n) => p.getByRole('button', { name: n, exact: true }).filter({ visible: true }).first();
  const campoDe = (n) => p.getByLabel(n, { exact: true }).filter({ visible: true }).first();
  const corpo = () => p.locator('body').innerText();
  const aConta = async () => {
    for (let i = 0; i < 6 && (await p.getByRole('tab', { name: 'Resumo' }).filter({ visible: true }).count()) === 0; i++) { await bt('Voltar').click(); await p.waitForTimeout(400); }
    await p.getByRole('tab', { name: 'Resumo' }).filter({ visible: true }).first().click();
    await esperar('Diferença do mês');
    await p.getByRole('button', { name: 'Conta: perfil, segurança e acesso ao plano' }).filter({ visible: true }).first().click();
    await esperar('Privacidade neste aparelho');
  };
  const aFamilia = async () => {
    await aConta();
    await p.getByRole('button', { name: /^(Criar Família|Abrir Família)/ }).filter({ visible: true }).first().click();
    await p.waitForTimeout(600);
  };
  const criarConta = async (nome, email) => {
    await bt('Criar conta').click(); await esperar('Nome de apresentação');
    await campoDe('Nome de apresentação').fill(nome); await campoDe('E-mail').fill(email); await campoDe('Senha').fill(SENHA_FICTICIA);
    await bt('Criar conta').click(); await esperar('Confira seu e-mail');
    await bt('Simular abertura do link').click(); await bt('Já confirmei meu e-mail').click(); await esperar('Sua primeira conta');
    await bt('Começar meu mês').click(); await esperar('Diferença do mês'); await p.waitForTimeout(500);
  };
  const entrar = async (email) => {
    await bt('Entrar').click(); await esperar('Esqueci minha senha');
    await campoDe('E-mail').fill(email); await campoDe('Senha').fill(SENHA_FICTICIA);
    await bt('Entrar').click(); await esperar('Diferença do mês'); await p.waitForTimeout(500);
  };
  const sair = async () => { await aConta(); await bt('Sair deste aparelho').click(); await esperar('Cuidar da vida financeira'); };
  /** A conta titular gera um convite com o papel dado e devolve o link (só para as outras contas aceitarem; o link nunca é mostrado legível no vídeo). */
  const convidar = async (papel) => {
    await bt('Convidar').click(); await esperar('O que a pessoa poderá fazer');
    await p.getByRole('radio', { name: papel, exact: true }).filter({ visible: true }).first().click();
    await bt('Gerar link').click(); await esperar('Link do convite'); await p.waitForTimeout(400);
    const m = (await corpo()).match(/https?:\/\/[^\s]+\/convite\/[0-9a-f]{32}/);
    if (!m) throw new Error('não achei o link do convite na tela');
    await bt('Concluir').click(); await esperar('Seu papel: Titular');
    return m[0];
  };
  const aceitar = async (link) => {
    await aFamilia();
    await campoDe('Link do convite').fill(link); await bt('Ver convite').click(); await esperar('Aceitar convite');
    await bt('Aceitar convite').click(); await esperar('Você entrou na Família'); await p.waitForTimeout(400);
  };
  return { aConta, aFamilia, criarConta, entrar, sair, convidar, aceitar, texto };
}

const CLIPES = [
  {
    id: 'clipe-1',
    slug: 'clipe-1-resumo',
    titulo: 'Resumo do mês',
    apresentacao: true,
    limiteMB: 12,
    duracaoMin: 20,
    duracaoMax: 25,
    legenda: 'Resumo de outubro: o que entrou, o que saiu, a diferença do mês (que não é saldo), o que ainda falta pagar e a renda comprometida.',
    mostra: 'Resumo da demonstração: Diferença do mês, Recebido, Pago, "Ainda a pagar neste mês" e a renda comprometida, aberta em detalhe.',
    preparar: async (c) => { await c.rolarPara(0, 0); await c.pausa(500); },
    roteiro: async (c) => {
      const { botao, esperar, pausa, rolarAte, rolarPara, tocar, texto } = c;
      await pausa(900);
      await c.quadro('capa', 0.2);
      await pausa(5200); // Diferença do mês (não é saldo), Recebido e Pago
      await rolarPara(150, 1600);
      await pausa(4600); // Ainda a pagar e a Renda comprometida
      await tocar(botao(/^Renda comprometida em outubro/), { antes: 500 });
      await esperar('Seu limite');
      c.numeros = { rendaComprometida: await texto('52,5%', true).innerText() };
      await pausa(3600); // o percentual e o que entra na conta
      await rolarAte(texto('Composição', true), 1500, 130);
      await pausa(3600);
    },
  },
  {
    id: 'clipe-2',
    slug: 'clipe-2-contas-a-pagar',
    titulo: 'contas a pagar e gastos fixos',
    apresentacao: true,
    limiteMB: 12,
    legenda: 'Contas a pagar: a lista do mês, uma conta marcada como paga com "Já paguei" e o novo total de "Ainda a pagar", além dos gastos fixos e parcelamentos.',
    mostra: 'Ainda a pagar neste mês, a lista "A vencer em outubro", "Já paguei" na conta Internet (formulário e confirmação), a lista depois do pagamento (Ainda a pagar de R$ 650,00 para R$ 500,00, Internet em "Pagas") e Gastos fixos e parcelamentos.',
    faltou: 'Lembretes de vencimento (aviso no dia anterior) existem só no app de celular: na demonstração web a tela de Conta diz "Lembretes estão disponíveis no app para celular", então não há o que gravar.',
    preparar: async (c) => { await c.rolarPara(0, 0); await c.pausa(600); },
    roteiro: async (c) => {
      const { p, botao, esperar, pausa, rolarAte, rolarPara, tocar, texto } = c;
      await pausa(1000);
      const antes = await c.lerValorDoResumo('Ainda a pagar neste mês');
      await rolarPara(150, 1300);
      await pausa(900);
      await tocar(p.getByRole('button', { name: /^Ainda a pagar neste mês, R\$/ }).filter({ visible: true }).first(), { antes: 400 });
      await esperar('A vencer em outubro de 2026');
      await pausa(900);
      await c.quadro('capa', 0.2);
      await pausa(2900); // a lista do mês: Internet e Condomínio, cada uma com "Já paguei"
      await tocar(botao(/^Já paguei Internet, vence 15\/10/), { antes: 500 });
      await esperar('Confirmar pagamento');
      await pausa(2800); // o formulário: valor, data do pagamento e de onde saiu
      await tocar(botao('Confirmar pagamento'), { antes: 500 });
      await esperar('Internet marcada como paga.');
      await esperar('R$ 500,00');
      c.numeros = { ainda_a_pagar_antes: antes, conta_paga: 'Internet, R$ 150,00', ainda_a_pagar_depois: 'R$ 500,00' };
      await pausa(3300); // Ainda a pagar caiu e a Internet saiu da lista a vencer
      await rolarAte(texto('Pagas', true), 1400, 190);
      await pausa(2600); // a Internet entre as pagas
      await tocar(botao(/^Gastos fixos e parcelamentos/), { antes: 500 });
      await esperar('Parcelamentos');
      await pausa(2200);
      await rolarAte(texto('Parcelamentos', true), 1500, 120);
      await pausa(2800); // Financiamento do carro: parcela 13 de 48
      await rolarAte(texto('Contas do ano', true), 1500, 120);
      await pausa(2400);
    },
  },
  {
    id: 'clipe-3',
    slug: 'clipe-3-familia',
    titulo: 'Família: pessoas, papéis e convite por link',
    apresentacao: true,
    limiteMB: 12,
    legenda: 'Família: as pessoas e o papel de cada uma (titular, anota e vê, só vê) e o convite por link, que o app mostra uma única vez.',
    mostra: 'Conta, Família com três pessoas (titular, "Anota e vê" e "Só vê"), "Gerenciar", Convidar com o papel "Só vê" e o link do convite desfocado.',
    faltou: 'A demonstração com dados fictícios não tem Família (D-055). A Família gravada vem de três contas simuladas na memória da página (a conta titular e duas contas que aceitam o convite), criadas antes da gravação e fora do vídeo. O link do convite aparece desfocado.',
    // A página começa na tela de entrada: as contas simuladas são criadas aqui, fora da gravação.
    entrar: async (c) => {
      await c.p.goto(`${c.base}/`);
      await c.esperar('Cuidar da vida financeira');
    },
    preparar: async (c) => {
      const f = auxiliaresDaFamilia(c);
      const { p, esperar } = c;
      const bt = (n) => p.getByRole('button', { name: n, exact: true }).filter({ visible: true }).first();
      await f.criarConta('Vera Lima', 'vera.apresentacao@exemplo.com');
      await f.aConta();
      await bt('Criar Família').click(); await esperar('Anotar a casa em conjunto');
      await bt('Criar Família').click(); await esperar('Nome da Família');
      await c.campo('Nome da Família').fill('Família Exemplo');
      await bt('Criar Família').click(); await esperar('Seu papel: Titular');
      const linkMembro = await f.convidar('Anota e vê');
      const linkLeitor = await f.convidar('Só vê');
      await f.sair();
      await f.criarConta('Mauro Dias', 'mauro.apresentacao@exemplo.com');
      await f.aceitar(linkMembro);
      await f.sair();
      await f.criarConta('Lia Souza', 'lia.apresentacao@exemplo.com');
      await f.aceitar(linkLeitor);
      await f.sair();
      await f.entrar('vera.apresentacao@exemplo.com');
      // Com a Família criada o Resumo ganha o seletor "Pessoal | Família": a conta titular o deixa na Família, e "Quem vê estes dados?" mostra as pessoas.
      await p.getByRole('tab', { name: 'Ver dados de Família', exact: true }).filter({ visible: true }).first().click();
      await c.pausa(700);
      await f.aConta();
      await c.rolarPara(0, 0);
      await c.pausa(700);
    },
    roteiro: async (c) => {
      const { p, botao, esperar, pausa, rolarAte, tocar, texto } = c;
      await pausa(900);
      await c.quadro('conferencia', 0); // a Conta, com o aviso de demonstração à vista
      await pausa(900);
      await tocar(p.getByRole('button', { name: /^Abrir Família/ }).filter({ visible: true }).first(), { antes: 500 });
      await esperar('Seu papel: Titular');
      await pausa(3700); // Família Exemplo, "Seu papel: Titular" e as pessoas com o papel de cada uma
      await tocar(p.getByRole('button', { name: /^Gerenciar Mauro, Anota e vê/ }).filter({ visible: true }).first(), { antes: 500 });
      await esperar('Mudar para "Só vê"');
      await pausa(2400); // o que o titular pode fazer com cada pessoa
      await tocar(botao('Cancelar'), { antes: 400 });
      await pausa(600);
      await rolarAte(texto('Convites', true), 1400, 120);
      await pausa(900);
      await tocar(botao('Convidar'), { antes: 500 });
      await esperar('O que a pessoa poderá fazer');
      await pausa(1100);
      await tocar(p.getByRole('radio', { name: 'Só vê', exact: true }).filter({ visible: true }).first(), { antes: 400 });
      await pausa(1500); // "Só vê. Não anota nem altera nada."
      await tocar(botao('Gerar link'), { antes: 500 });
      await esperar('Link do convite');
      await pausa(3200); // o link (desfocado), a validade e "Ele aparece só agora"
      await tocar(botao('Concluir'), { antes: 400 });
      await esperar('Seu papel: Titular');
      await rolarAte(texto('Convites', true), 1300, 120);
      await pausa(2200); // o convite pendente na lista e as vagas
      await tocar(botao('Quem vê estes dados?'), { antes: 500 });
      await esperar('Estas pessoas veem os registros da Família');
      await pausa(1000);
      await c.quadro('capa', 0.2);
      await pausa(3400); // as pessoas, o papel de cada uma e o que cada papel pode fazer
    },
  },
  {
    id: 'clipe-4',
    slug: 'clipe-4-aprender-e-calculadora',
    titulo: 'Aprender e calculadora',
    apresentacao: true,
    limiteMB: 12,
    legenda: 'Aprender: o tema "Rotativo do cartão e parcelamento da fatura", com exemplo e fontes, e a calculadora "Quanto custa uma dívida?" com os números do exemplo.',
    mostra: 'Aba Aprender, tema do rotativo (exemplo calculado e fontes), "Fazer a conta com os seus números" e a calculadora "Quanto custa uma dívida?" preenchida com R$ 700,00 e 14% ao mês, e a pergunta "E se parcelar a fatura?".',
    preparar: async (c) => { await c.rolarPara(0, 0); await c.pausa(500); },
    roteiro: async (c) => {
      const { p, botao, aba, campo, esperar, pausa, rolarAte, rolarPara, tocar, texto, digitar } = c;
      await pausa(800);
      await tocar(aba('Aprender e dúvidas'), { antes: 300 });
      await esperar('Comece por aqui');
      await pausa(800);
      // O quadro de capa fica aqui: a aba Aprender traz o selo "Demonstração" no alto. As telas de tema e de calculadora não têm selo no app.
      await c.quadro('capa', 0.3);
      await pausa(1300); // a aba Aprender: busca, Como usar, Calculadoras, Neste mês
      await tocar(botao('Ir para Juros e crédito'), { antes: 400 });
      await pausa(800);
      await tocar(botao(/^Rotativo do cartão e parcelamento da fatura\./), { antes: 500 });
      await esperar('Ver a conta');
      await pausa(2200); // o resumo do tema
      await tocar(botao('Ver a conta', true), { antes: 400 });
      await pausa(600);
      await rolarAte(texto('Parcela: 798,00', false), 1300, 200);
      await pausa(2000); // o exemplo calculado, passo a passo
      await rolarAte(texto('Fontes', true), 1400, 130);
      await pausa(1700); // as fontes, com a data da consulta
      await rolarAte(botao('Fazer a conta com os seus números'), 1200, 260);
      await pausa(400);
      await tocar(botao('Fazer a conta com os seus números'), { antes: 400 });
      await esperar('Valor da dívida');
      await pausa(700);
      // Os números do exemplo do tema: R$ 700,00 no rotativo, 14% ao mês; depois o parcelamento a 8% ao mês em 24 vezes.
      await digitar(campo('Valor da dívida'), '700', 100);
      await digitar(campo('Taxa de juros ao mês (%)'), '14', 100);
      await esperar('Isso equivale a');
      await rolarAte(texto('Com estes números', false), 1200, 140);
      await pausa(2700); // R$ 98,00 de juros, R$ 798,00 e 381,79% ao ano
      await rolarAte(texto('E se parcelar a fatura?', true), 1300, 120);
      await digitar(campo('Taxa do parcelamento ao mês (%)'), '8', 100);
      await digitar(campo('Em quantas parcelas'), '24', 100);
      await p.getByText(/1\.818,96/).filter({ visible: true }).first().waitFor({ timeout: 8000 });
      await rolarPara('fim', 1200);
      await pausa(2400);
    },
  },
  {
    id: 'clipe-5',
    slug: 'clipe-5-painel-da-instituicao',
    titulo: 'painel da instituição e quem vê estes dados',
    apresentacao: true,
    limiteMB: 12,
    tela: TELA_PAINEL,
    legenda: 'Painel da empresa (web): contrato e vagas, convite de pessoas e licenças, sem acesso a finanças; e a tela "Quem vê estes dados?" do app.',
    mostra: 'Painel da "Empresa Exemplo (demonstração)": contrato e vagas, convite por e-mail (links desfocados), licenças ativas, "Uso do app" só com contagens, e a tela "Quem vê estes dados?".',
    preparar: async (c) => {
      const { p, botao, esperar } = c;
      await p.getByRole('button', { name: 'Conta: perfil, segurança e acesso ao plano' }).filter({ visible: true }).first().click();
      await esperar('Abrir painel da empresa');
      await botao('Abrir painel da empresa').click();
      await esperar('Empresa Exemplo (demonstração)');
      await c.rolarPara(0, 0);
      await c.pausa(700);
    },
    roteiro: async (c) => {
      const { p, botao, aba, campo, esperar, pausa, rolarAte, rolarPara, tocar, texto } = c;
      await pausa(800);
      await c.quadro('capa', 0.2);
      await pausa(3000); // Empresa Exemplo, plano, vagas e situação do contrato
      await rolarAte(texto('Convidar pessoas', true), 1200, 70);
      await pausa(500);
      const emails = campo('E-mails');
      await emails.click();
      await emails.pressSequentially('pessoa.nova1@empresa-exemplo.example\npessoa.nova2@empresa-exemplo.example', { delay: 22 });
      await texto('2 e-mails válidos para convidar', false).waitFor({ timeout: 8000 });
      await pausa(1100); // a conferência da lista
      await tocar(botao(/^Convidar 2 pessoas/), { antes: 400 });
      await esperar('2 convites criados.');
      await pausa(900);
      await rolarAte(texto('Links para enviar', true), 1200, 70);
      await pausa(1500); // os links, desfocados: o código nunca fica legível
      await rolarAte(texto('Licenças', true), 1300, 70);
      await pausa(500);
      await tocar(p.getByRole('radio', { name: /^Ativas/ }).or(p.getByRole('button', { name: /^Ativas/ })).filter({ visible: true }).first(), { antes: 400 });
      await pausa(1900); // as licenças ativas (e-mails fictícios)
      await rolarAte(texto('Uso do app', true), 1400, 70);
      await pausa(3000); // só contagens; a empresa não vê finanças
      await tocar(aba('Resumo'), { antes: 400 });
      await esperar('Diferença do mês');
      await rolarPara('fim', 1000);
      await pausa(300);
      await tocar(botao('Quem vê estes dados?'), { antes: 300 });
      await esperar('Única pessoa do app que vê, anota, edita e exclui');
      await pausa(800);
      await c.quadro('conferencia', 0);
      await pausa(2200); // a pessoa vê tudo; a empresa só administra o acesso
      await rolarPara(150, 1800);
      await pausa(2200); // o que a empresa vê (e-mails e situação) e o que não vê (finanças)
    },
  },
];

// ---------------------------------------------------------------------------------------------------------------------
// Capturas estáticas 1080 x 1350 (4:5): a tela como o app a mostra, sem montagem de arte.
// ---------------------------------------------------------------------------------------------------------------------
async function gravarCapturas(browser, servidor, saida, manifesto, problemas) {
  const pasta = path.join(saida, 'capturas');
  fs.mkdirSync(pasta, { recursive: true });
  const ctx = await browser.newContext({
    viewport: { width: LARGURA_4X5, height: ALTURA_4X5 },
    deviceScaleFactor: ESCALA_4X5,
    isMobile: true,
    hasTouch: true,
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
  });
  await ctx.addInitScript(prepararPagina, { agora: AGORA, escala: ESCALA_4X5, zoom: false, toque: false });
  const fora = [];
  await bloquearRede(ctx, fora);
  const p = await ctx.newPage();
  const erros = [];
  p.on('pageerror', (e) => erros.push(e.message));
  const f = ferramentas(p, { altura: ALTURA_4X5, largura: LARGURA_4X5 });
  await entrarNaDemo(p, servidor.base, f);

  const feitas = [];
  /** `exigir`: textos que precisam estar visíveis (a captura mostra o que a peça cita). */
  const captura = async (nome, descricao, peca, exigir) => {
    if (!(await f.etiquetaVisivel())) throw new Error(`captura ${nome}: a etiqueta "Demonstração" não está na tela`);
    for (const t of exigir) if ((await p.getByText(t).filter({ visible: true }).count()) === 0) throw new Error(`captura ${nome}: não achei "${t}" na tela`);
    const arq = path.join(pasta, `${nome}.png`);
    await p.waitForTimeout(500);
    await p.screenshot({ path: arq });
    const d = dimensoesPng(arq);
    if (d.largura !== 1080 || d.altura !== 1350) throw new Error(`${arq} saiu ${d.largura} x ${d.altura}`);
    feitas.push({ arquivo: `capturas/${nome}.png`, tela: descricao, pecas: peca, pixels: '1080 x 1350' });
  };

  // Orçamento por categoria (P01, P02, P05). A margem de 14 pontos deixa o card logo abaixo do cabeçalho.
  await f.tocar(f.aba('Movimentos: movimentações do mês'), { antes: 0 });
  await f.esperar('Registrar recebimento');
  await f.tocar(f.botao(/^Orçamento por categoria/), { antes: 0 });
  await f.esperar('Orçado R$');
  await p.waitForTimeout(600);
  await f.rolarAte(f.texto('Orçado R$'), 0, 14);
  await captura('orcamento-1-total-do-mes', 'Orçamento por categoria de outubro: o total orçado e usado, Moradia e Mercado', 'P01, P02', ['Orçado R$ 4.600,00 · Usado R$ 4.300,00', 'Faltam R$ 400,00']);
  await f.rolarAte(f.botao(/^Mercado, R\$/), 0, 14);
  await captura('orcamento-2-mercado-e-lazer', 'Orçamento por categoria: Mercado, com o que falta, e Lazer, acima do orçamento', 'P01, P02', ['Faltam R$ 400,00', 'R$ 100,00 acima']);
  await f.rolarAte(f.texto('Definir orçamento', true), 0, 14);
  await captura('orcamento-3-definir-categoria', 'Orçamento por categoria: a lista "Definir orçamento" (Transporte, Saúde e Educação)', 'P05', ['Definir orçamento', 'Transporte', 'Saúde', 'Educação']);

  // Resumo (P04, P10): "Diferença do mês" com "não é saldo".
  await f.tocar(f.aba('Resumo'), { antes: 0 });
  await f.esperar('R$ 2.100,00');
  await f.rolarPara(0, 0);
  await captura('resumo-diferenca-do-mes', 'Resumo de outubro: Diferença do mês, Recebido e Pago, com "não é saldo"', 'P04, P10', ['Diferença do mês', 'Recebido menos pago até 07/10 · não é saldo']);

  // Contas a pagar (P04): o que ainda falta pagar no mês, e a lista das contas.
  await f.tocar(p.getByRole('button', { name: /^Ainda a pagar neste mês, R\$/ }).filter({ visible: true }).first(), { antes: 0 });
  await f.esperar('Contas em aberto com vencimento até o fim do mês');
  await p.waitForTimeout(600);
  await captura('contas-a-pagar-1-ainda-a-pagar', 'Contas a pagar de outubro: o que ainda falta pagar no mês', 'P04', ['Contas em aberto com vencimento até o fim do mês', 'R$ 650,00']);
  await f.rolarAte(f.texto('A vencer em outubro'), 0, 14);
  await captura('contas-a-pagar-2-a-vencer', 'Contas a pagar de outubro: as contas que ainda vencem no mês', 'P04', ['A vencer em outubro']);

  // Seu mês em 30 segundos (P10): a revisão do mês, em cartões curtos.
  await f.tocar(f.aba('Movimentos: movimentações do mês'), { antes: 0 });
  await f.esperar('Registrar recebimento');
  await f.tocar(f.botao(/^Seu mês em 30 segundos/), { antes: 0 });
  await f.esperar('Entrou e saiu');
  await p.waitForTimeout(600);
  await captura('seu-mes-1-entrou-e-saiu', 'Seu mês em 30 segundos: o primeiro cartão, "Entrou e saiu"', 'P10', ['Entrou e saiu', 'Diferença do mês']);
  await f.tocar(f.botao('Próximo'), { antes: 0 });
  await p.waitForTimeout(900);
  await f.rolarPara(0, 0);
  await captura('seu-mes-2-segundo-cartao', 'Seu mês em 30 segundos: o segundo cartão', 'P10', ['2 de 5']);

  await ctx.close();
  if (fora.length) problemas.push(`capturas: requisições para fora de localhost bloqueadas: ${[...new Set(fora)].slice(0, 3).join(' | ')}`);
  if (erros.length) problemas.push(`capturas: erros na página: ${[...new Set(erros)].slice(0, 3).join(' | ')}`);
  manifesto.capturas.push(...feitas);
  console.log(`capturas: ${feitas.length} PNG de 1080 x 1350 em ${pasta}`);
}

// ---------------------------------------------------------------------------------------------------------------------
// Montagem de conferência: a capa e um quadro de cada vídeo e as capturas 4:5.
// ---------------------------------------------------------------------------------------------------------------------
async function montagem(browser, saida, manifesto) {
  const uri = (arq) => `data:image/png;base64,${fs.readFileSync(path.join(saida, arq)).toString('base64')}`;
  const celulas = [];
  for (const v of manifesto.videos) {
    celulas.push({ rotulo: `${v.id.toUpperCase()} capa`, arq: v.capa, vertical: true });
    celulas.push({ rotulo: `${v.id.toUpperCase()} quadro de conferência (${v.conferencia[1].em} s)`, arq: v.conferencia[1].arquivo, vertical: true });
  }
  const capturas = manifesto.capturas.map((c) => ({ rotulo: c.arquivo.replace('capturas/', '').replace('.png', ''), arq: c.arquivo, vertical: false }));
  const html = `<!doctype html><meta charset="utf-8"><style>
    body{margin:0;padding:24px;background:#F7F9FD;color:#17223B;font:600 18px Manrope,system-ui,sans-serif;width:2400px}
    h1{font-size:28px;margin:0 0 16px}h2{font-size:22px;margin:28px 0 12px}
    .linha{display:flex;gap:20px;flex-wrap:wrap;align-items:flex-start}
    figure{margin:0;display:flex;flex-direction:column;gap:6px}
    img{display:block;border:1px solid #C9D2E6;border-radius:8px}
    .v img{width:270px;height:480px}.h img{width:288px;height:360px}
    figcaption{font-size:14px;max-width:280px}
  </style><h1>Clarevo, peças de demonstração (${manifesto.versao.commit}, ${manifesto.gravadoEm}): gravações 9:16 e capturas 4:5, dados fictícios</h1>
  <h2>Vídeos: capa e um quadro de conferência de cada</h2><div class="linha v">${celulas.map((c) => `<figure><img src="${uri(c.arq)}"><figcaption>${c.rotulo}</figcaption></figure>`).join('')}</div>
  <h2>Capturas estáticas 1080 x 1350</h2><div class="linha h">${capturas.map((c) => `<figure><img src="${uri(c.arq)}"><figcaption>${c.rotulo}</figcaption></figure>`).join('')}</div>`;
  const ctx = await browser.newContext({ viewport: { width: 2450, height: 900 }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  await p.setContent(html);
  await p.waitForTimeout(500);
  await p.screenshot({ path: path.join(saida, 'montagem.png'), fullPage: true });
  await ctx.close();
}

// ---------------------------------------------------------------------------------------------------------------------
(async () => {
  fs.mkdirSync(SAIDA, { recursive: true });
  if (argv.includes('--build') || !fs.existsSync(path.join(DIST, 'index.html'))) {
    console.log('Gerando a versão web de demonstração (npm --workspace apps/app run export:demo)...');
    const r = spawnSync('npm', ['--workspace', 'apps/app', 'run', 'export:demo'], { cwd: RAIZ, stdio: 'inherit', shell: process.platform === 'win32' });
    if (r.status !== 0) throw new Error('o build de demonstração falhou');
  } else console.log(`Reaproveitando ${path.relative(RAIZ, DIST)} (use --build para refazer).`);

  const git = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: RAIZ, encoding: 'utf8' });
  const sujo = spawnSync('git', ['status', '--porcelain', '--', 'apps/app/src', 'apps/app/app.json', 'packages/core/src'], { cwd: RAIZ, encoding: 'utf8' });
  let versaoDoApp = null;
  try { versaoDoApp = JSON.parse(fs.readFileSync(path.join(RAIZ, 'apps', 'app', 'app.json'), 'utf8')).expo.version; } catch { /* sem app.json legível */ }
  const manifesto = {
    gravadoEm: new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }), // a data em Brasília
    gravadoEmUtc: new Date().toISOString(),
    versao: { commit: git.status === 0 ? git.stdout.trim() : 'desconhecido', appVersion: versaoDoApp, appSemMudancasNaoCommitadas: sujo.status === 0 ? sujo.stdout.trim() === '' : null },
    demonstracao: 'conta de demonstração do app (dados fictícios, 07/10/2026), build de `export:demo`',
    ...(APRESENTACAO ? { apresentacao: true, clipes: [] } : { videos: [], capturas: [] }),
  };
  const problemas = [];
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  if (APRESENTACAO) {
    // O aparelho (360 x 640 pontos ampliados 3 vezes) na porta pedida; o painel (1280 x 720 pontos ampliados 1,5 vez), em uma porta livre.
    const aparelho = await servir(true, PORTA);
    const painel = await servir({ largura: TELA_PAINEL.largura, escala: TELA_PAINEL.escala }, 0);
    try {
      for (const def of CLIPES) {
        if (PROIBIDO.test(def.legenda)) throw new Error(`${def.id}: a legenda tem travessão ou a expressão proibida: ${def.legenda}`);
        if (SO.includes(def.id)) await gravarVideo(browser, def.tela && def.tela.desktop ? painel : aparelho, def, SAIDA, manifesto, problemas);
      }
    } finally {
      await browser.close();
      aparelho.fechar();
      painel.fechar();
    }
  } else {
    const comZoom = await servir(true);
    const semZoom = await servir(false);
    try {
      for (const def of VIDEOS) if (SO.includes(def.id)) await gravarVideo(browser, comZoom, def, SAIDA, manifesto, problemas);
      if (SO.includes('capturas')) await gravarCapturas(browser, semZoom, SAIDA, manifesto, problemas);
      if (manifesto.videos.length && manifesto.capturas.length) await montagem(browser, SAIDA, manifesto);
    } finally {
      await browser.close();
      comZoom.fechar();
      semZoom.fechar();
    }
  }
  fs.writeFileSync(path.join(SAIDA, 'manifesto.json'), `${JSON.stringify(manifesto, null, 2)}\n`);
  if (problemas.length) throw new Error(`problemas na gravação:\n- ${problemas.join('\n- ')}`);
  console.log(`Pronto: ${SAIDA}`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
