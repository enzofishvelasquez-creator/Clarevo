/**
 * Demonstração gravada para o investidor: um vídeo de 2 a 3 minutos com a DEMONSTRAÇÃO do app (dados fictícios e identificados,
 * "Demonstração · Pessoal" no alto de cada tela), em tela de celular (390 x 844, escala 2), com ritmo calmo e uma legenda curta
 * numa faixa no rodapé (fundo #17223B, texto branco), injetada na página só durante a gravação.
 *
 * Percurso: Resumo, Anotar gasto (salvo só na memória da demonstração), Contas a pagar (com o aviso de dia útil), Cartões e a
 * fatura, Movimentações e Análises (Bolhas, tocando numa categoria), Evolução (cenário "evolucao", 12 meses, abril fora da
 * comparação, média, mediana e "Entender o que mudou"), Metas, Aprender ("Neste mês"), o painel "Empresa Exemplo (demonstração)"
 * e "Quem vê estes dados?".
 *
 * Nenhum dado real e nenhuma rede: o build é o de demonstração (`npm --workspace apps/app run export:demo`, que ignora o
 * Supabase), tudo o que o roteiro anota fica na memória da página (ela é recriada a cada carga) e qualquer requisição para fora de
 * localhost é bloqueada e faz o script falhar. O app não é alterado: o servidor local só serve `apps/app/dist`.
 *
 * Como o vídeo sai nítido: o `recordVideo` do Playwright grava na resolução do viewport (a escala 2 do aparelho não entra no
 * vídeo). Por isso a janela é de 780 x 1688 com escala 1, e a página recebe `width=390` no `<meta name="viewport">` (só na cópia que
 * este servidor entrega): o app enxerga 390 x 844 pontos e o navegador amplia a página 2 vezes, desenhando de novo em vez de
 * esticar uma imagem. A página também informa `devicePixelRatio` 2, como um celular, e a data do relógio acompanha a da
 * demonstração (07/10/2026), para o "Anotado por você em ..." do gasto salvo não contradizer o resto.
 *
 * Etapas: grava três trechos (padrão, "evolucao" e padrão de novo, cada um numa página recriada), corta o começo e o fim de cada
 * um, junta com uma passagem pelo azul da marca e converte para MP4 (H.264, yuv420p, +faststart, trilha de AAC silenciosa), com no
 * máximo 15 MB para caber no WhatsApp. Depois tira 1 quadro de cada passo, do próprio MP4, para conferir.
 *
 * Sincronia: o vídeo do Playwright repete cada quadro ao menos uma vez, e a tela anima a mais de 25 quadros por segundo, então o
 * tempo do arquivo anda alguns por cento mais devagar que o relógio, de modo irregular. Por isso, em cada passo (e na abertura e no
 * fim de cada trecho), a página mostra por meio segundo uma tira de 6 quadradinhos pretos e brancos no canto da faixa (um código
 * de 4 bits). O script procura a tira no vídeo (`marcar` e `acharMarcas`), usa o instante achado para cortar e para tirar o
 * quadro de conferência e, na conversão final, cobre a tira com a cor do fundo; no fim confere que nenhuma sobrou no MP4.
 *
 * Uso:
 *   node scripts/video-demonstracao.js                       gera o build se não houver apps/app/dist, grava e converte
 *   node scripts/video-demonstracao.js --build               refaz o build de demonstração antes
 *   node scripts/video-demonstracao.js --saida <pasta>       pasta do MP4 e dos quadros (padrão: <pasta temporária>/clarevo-demonstracao)
 *   node scripts/video-demonstracao.js --manter-bruto        guarda os três trechos originais (WebM) em <pasta>/bruto, para outros cortes
 * Ambiente: VIDEO_PORT (padrão 8399; se estiver ocupada, usa outra livre), RITMO (1 = calmo; 0.4 acelera as pausas para testar),
 * FFMPEG e FFPROBE (padrão /usr/bin/ffmpeg e /usr/bin/ffprobe, ou os do PATH), CHROMIUM_PATH (outro Chromium) e
 * PLAYWRIGHT_BROWSERS_PATH (padrão /opt/pw-browsers, se existir).
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { spawnSync } = require('node:child_process');
if (!process.env.PLAYWRIGHT_BROWSERS_PATH && fs.existsSync('/opt/pw-browsers')) process.env.PLAYWRIGHT_BROWSERS_PATH = '/opt/pw-browsers';
const { chromium } = require('playwright');

const RAIZ = path.join(__dirname, '..');
const DIST = path.join(RAIZ, 'apps', 'app', 'dist');
const LOGOTIPO = path.join(RAIZ, 'docs', 'marca', 'clarevo-logotipo-reverso.svg');
const argv = process.argv.slice(2);
const opcao = (nome) => { const i = argv.indexOf(nome); return i >= 0 ? argv[i + 1] : null; };
const SAIDA = path.resolve(opcao('--saida') || path.join(os.tmpdir(), 'clarevo-demonstracao'));
const RITMO = Number(process.env.RITMO || 1);
const FFMPEG = process.env.FFMPEG || (fs.existsSync('/usr/bin/ffmpeg') ? '/usr/bin/ffmpeg' : 'ffmpeg');
const FFPROBE = process.env.FFPROBE || (fs.existsSync('/usr/bin/ffprobe') ? '/usr/bin/ffprobe' : 'ffprobe');

const LARGURA = 390;
const ALTURA = 844;
const ESCALA = 2;
const FAIXA = 64; // altura da faixa da legenda, em pontos
const AGORA = '2026-10-07T10:42:00-03:00'; // o "hoje" da demonstração (DEMO_TODAY)
const LIMITE_BYTES = 15 * 1000 * 1000; // o WhatsApp aceita até 16 MB; 15 MB dá folga
const ID_ABERTURA = 0; // sinal de sincronia pouco antes de a cortina abrir
const ID_FIM = 15; // sinal de sincronia pouco antes de a cortina de despedida fechar
const TIPOS = { '.js': 'text/javascript', '.html': 'text/html', '.ttf': 'font/ttf', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.css': 'text/css', '.webmanifest': 'application/manifest+json' };

const executar = (cmd, args, extra = {}) => {
  const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...extra });
  if (r.status !== 0) throw new Error(`${path.basename(cmd)} falhou (${r.status}):\n${(r.stderr || '').split('\n').slice(-12).join('\n')}`);
  return r.stdout;
};
const duracaoDe = (arquivo) => Number(executar(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', arquivo]).trim());

/** Legendas: curtas, em pt-BR, neutras, sem travessão e sem a expressão proibida pelo CLAUDE.md. */
const LEGENDAS = {
  resumo: 'Resumo do mês: recebido, pago e o que falta pagar',
  anotar: 'Anotar gasto: descrição, valor e categoria em poucos toques',
  salvo: 'Salvo só na memória da demonstração: o Resumo muda na hora',
  contas: 'Contas a pagar: o que vence neste mês e nos próximos',
  diaUtil: 'Vencimento em fim de semana: o app avisa o próximo dia útil',
  cartoes: 'Cartões: a compra só entra em Pago quando a fatura é paga',
  fatura: 'A fatura mostra cada parcela e como o total é formado',
  movimentacoes: 'Movimentações: tudo o que entrou e saiu no mês',
  analises: 'Análises: as Bolhas mostram o peso de cada categoria',
  categoria: 'Toque numa categoria para ver os lançamentos do mês',
  evolucao: 'Evolução: o Pago mês a mês, com média e mediana',
  entender: 'Entender o que mudou: abril contra março, sem apontar causa',
  tirar: 'Evolução: tire um mês da comparação sem apagar nada',
  semAbril: 'Sem abril, média e mediana mudam e nenhum lançamento é apagado',
  metas: 'Metas: reserva para imprevistos e plano de guardar',
  aprender: 'Aprender: explicações curtas para o momento do mês',
  nesteMes: 'Neste mês: o 13º salário, com exemplo calculado e fonte',
  empresa: 'Painel da empresa (só na web): vagas e licenças, sem finanças',
  usoApp: 'Uso do app: só contagens de licenças, nenhum dado financeiro',
  quemVe: 'Quem vê estes dados?: só a própria pessoa, não a empresa',
};

/**
 * Código que roda dentro da página em todo carregamento (só no contexto da gravação): data da demonstração, escala do aparelho,
 * faixa da legenda, cortina da marca, marcador de toque e rolagem suave. Vive no navegador, por isso não usa nada de fora.
 */
function prepararPagina(cfg) {
  window.__clarevoSemTour = true; // o tour de boas-vindas (D-049) cobriria o Resumo, como no roteiro web
  // Relógio na data da demonstração (o app usa a própria data fixa; isto cuida do "Anotado por você em ...").
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
  // Escala do aparelho: o app lê devicePixelRatio como num celular (2), e a janela de gravação tem escala 1.
  Object.defineProperty(window, 'devicePixelRatio', { get: () => cfg.escala, configurable: true });
  // O react-native-web mede a janela por visualViewport.largura x escala; com a página ampliada 2 vezes isso daria 780 pontos, e o
  // app se comportaria como num aparelho largo. O desenho continua ampliado, mas o app enxerga 390 x 844.
  if (window.visualViewport) Object.defineProperty(window.visualViewport, 'scale', { get: () => 1, configurable: true });

  const css = `
    #root{position:fixed !important;top:0;left:0;right:0;bottom:${cfg.faixa}px;height:auto !important;}
    #__demo-faixa{position:fixed;left:0;right:0;bottom:0;height:${cfg.faixa}px;box-sizing:border-box;padding:8px 18px;background:#17223B;color:#fff;
      display:flex;align-items:center;justify-content:center;text-align:center;z-index:2147483600;
      font-family:Manrope_700Bold,Manrope_600SemiBold,system-ui,sans-serif;font-size:15.5px;line-height:1.28;letter-spacing:.1px;}
    #__demo-faixa span,#__demo-cortina p{text-wrap:balance;}
    #__demo-faixa span{transition:opacity .22s ease;opacity:1;display:block;max-width:350px;}
    #__demo-cortina{position:fixed;inset:0;z-index:2147483647;background:#2457F5;color:#fff;display:flex;flex-direction:column;align-items:center;
      justify-content:center;gap:22px;opacity:1;transition:opacity .7s ease;pointer-events:none;text-align:center;padding:0 32px;
      font-family:Manrope_700Bold,Manrope_600SemiBold,system-ui,sans-serif;}
    #__demo-cortina img{width:230px;height:auto;display:block;}
    #__demo-cortina p{margin:0;font-size:17px;line-height:1.35;font-weight:700;}
    #__demo-cortina p.url{color:#D4F05B;}
    .__demo-toque{position:fixed;width:46px;height:46px;margin:-23px 0 0 -23px;border-radius:50%;background:rgba(212,240,91,.5);
      border:2px solid #D4F05B;pointer-events:none;z-index:2147483500;animation:__demo-toque .75s ease-out forwards;}
    @keyframes __demo-toque{0%{transform:scale(.4);opacity:.95}100%{transform:scale(1.35);opacity:0}}`;

  let faixaTexto = null;
  let cortina = null;
  const montar = () => {
    const raiz = document.documentElement;
    if (!raiz) return false;
    const st = document.createElement('style');
    st.textContent = css;
    raiz.appendChild(st);
    const faixa = document.createElement('div');
    faixa.id = '__demo-faixa';
    faixa.setAttribute('aria-hidden', 'true');
    faixaTexto = document.createElement('span');
    faixa.appendChild(faixaTexto);
    raiz.appendChild(faixa);
    cortina = document.createElement('div');
    cortina.id = '__demo-cortina';
    raiz.appendChild(cortina);
    window.__demo.cortina(true, cfg.intro);
    document.addEventListener('pointerdown', (e) => {
      const d = document.createElement('div');
      d.className = '__demo-toque';
      d.style.left = `${e.clientX}px`;
      d.style.top = `${e.clientY}px`;
      raiz.appendChild(d);
      setTimeout(() => d.remove(), 900);
    }, true);
    return true;
  };

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
    legenda(texto) {
      if (!faixaTexto) return;
      faixaTexto.style.opacity = '0';
      setTimeout(() => { faixaTexto.textContent = texto; faixaTexto.style.opacity = '1'; }, 230);
    },
    /** Cortina azul da marca: com `logo`, mostra o logotipo oficial e as linhas de texto. */
    cortina(mostrar, o = {}) {
      if (!cortina) return;
      if (mostrar) {
        cortina.innerHTML = '';
        if (o.logo) { const img = document.createElement('img'); img.src = cfg.logo; img.alt = 'clarevo.'; cortina.appendChild(img); }
        for (const [i, linha] of (o.linhas || []).entries()) { const p = document.createElement('p'); if (i > 0 && o.destaque) p.className = 'url'; p.textContent = linha; cortina.appendChild(p); }
      }
      cortina.style.opacity = mostrar ? '1' : '0';
    },
    /**
     * Sinal de sincronia: uma tira de 6 quadradinhos no canto inferior esquerdo (branco, 4 bits em branco ou preto, branco) por
     * `ms`. O vídeo do Playwright repete cada quadro ao menos uma vez, então o tempo dele deriva do relógio quando a tela anima;
     * o sinal diz, no próprio vídeo, em que instante cada coisa aconteceu. O script acha os sinais e os cobre com a cor do fundo.
     * Preto e branco, em células alinhadas à grade de 16 x 8 pixels do vídeo, porque a cor sangra entre blocos na compressão.
     */
    marcar(id, ms) {
      const m = document.createElement('div');
      m.style.cssText = 'position:fixed;left:0;bottom:0;width:48px;height:4px;display:flex;z-index:2147483647;pointer-events:none;';
      const bits = [1, (id >> 3) & 1, (id >> 2) & 1, (id >> 1) & 1, id & 1, 1];
      for (const bit of bits) { const d = document.createElement('div'); d.style.cssText = `width:8px;height:4px;background:${bit ? '#FFFFFF' : '#000000'}`; m.appendChild(d); }
      document.documentElement.appendChild(m);
      setTimeout(() => m.remove(), ms);
    },
    rolarAte(el, ms, margem) {
      const cont = rolavel(el);
      if (!cont) return Promise.resolve();
      const alvo = cont.scrollTop + (el.getBoundingClientRect().top - cont.getBoundingClientRect().top) - margem;
      return animar(cont, alvo, ms);
    },
    rolarPara(y, ms) {
      const cont = principal();
      if (!cont) return Promise.resolve();
      return animar(cont, y === 'fim' ? cont.scrollHeight : y, ms);
    },
  };
  if (!montar()) {
    const mo = new MutationObserver(() => { if (montar()) mo.disconnect(); });
    mo.observe(document, { childList: true });
  }
}

/**
 * Acha, no vídeo do Playwright, os sinais de sincronia (ver `marcar`): lê o brilho médio de cada um dos 6 quadradinhos do canto
 * inferior esquerdo de cada quadro e junta os quadros seguidos com o mesmo código. Devolve [{ id, inicio, fim, quadros }] em segundos do arquivo.
 */
function acharMarcas(arquivo, altura) {
  const r = spawnSync(FFMPEG, ['-v', 'error', '-i', arquivo, '-vf', `fps=25,crop=96:8:0:${altura - 8},scale=6:1:flags=area,format=gray`, '-f', 'rawvideo', '-'], { maxBuffer: 1 << 28 });
  if (r.status !== 0) throw new Error(`ffmpeg não leu os sinais de ${arquivo}: ${String(r.stderr).slice(-300)}`);
  const buf = r.stdout;
  const n = Math.floor(buf.length / 6);
  const ids = [];
  for (let i = 0; i < n; i++) {
    const claro = [0, 1, 2, 3, 4, 5].map((k) => (buf[i * 6 + k] > 165 ? 1 : 0));
    ids.push(claro[0] && claro[5] ? claro[1] * 8 + claro[2] * 4 + claro[3] * 2 + claro[4] : -1);
  }
  const marcas = [];
  for (let i = 0; i < n;) {
    if (ids[i] < 0) { i++; continue; }
    let j = i;
    while (j < n && ids[j] === ids[i]) j++;
    marcas.push({ id: ids[i], inicio: i / 25, fim: j / 25, quadros: j - i });
    i = j;
  }
  return marcas;
}

/**
 * Instante, no arquivo, de cada sinal que a página mostrou. O que o vídeo captou vale; o que a captura do Playwright perdeu (ele
 * pode pular quadros quando a tela está ocupada) é estimado entre os vizinhos achados, pela proporção entre o relógio e o arquivo.
 * `esperados`: [{ id, quando }] com `quando` em milissegundos do relógio. Devolve a mesma lista com `em` (segundos do arquivo).
 */
function instantesDosSinais(nome, esperados, achados) {
  const lista = esperados.map((e) => {
    const a = achados.find((x) => x.id === e.id && x.quadros >= 2);
    return a ? { ...e, em: a.inicio, medido: true } : { ...e, medido: false };
  });
  const ancoras = lista.filter((e) => e.medido);
  if (ancoras.length < 2) throw new Error(`${nome}: só ${ancoras.length} sinal(is) de sincronia apareceram no vídeo`);
  for (const e of lista.filter((x) => !x.medido)) {
    const antes = ancoras.filter((x) => x.quando < e.quando).pop();
    const depois = ancoras.find((x) => x.quando > e.quando);
    if (antes && depois) e.em = antes.em + ((e.quando - antes.quando) / 1000) * ((depois.em - antes.em) / ((depois.quando - antes.quando) / 1000));
    else if (antes) e.em = antes.em + ((e.quando - antes.quando) / 1000) * 1.06;
    else e.em = depois.em - ((depois.quando - e.quando) / 1000) * 1.06;
    console.warn(`aviso: ${nome}: o sinal ${e.id} não apareceu no vídeo; instante estimado em ${e.em.toFixed(1)} s`);
  }
  return lista;
}

(async () => {
  fs.mkdirSync(SAIDA, { recursive: true });
  const bruto = fs.mkdtempSync(path.join(os.tmpdir(), 'clarevo-video-'));
  console.log(`Trechos originais em ${bruto} (apagados no fim, se tudo der certo)`);

  // Build de demonstração: reaproveita o dist se já existir (--build refaz).
  if (argv.includes('--build') || !fs.existsSync(path.join(DIST, 'index.html'))) {
    console.log('Gerando a versão web de demonstração (npm --workspace apps/app run export:demo)...');
    const r = spawnSync('npm', ['--workspace', 'apps/app', 'run', 'export:demo'], { cwd: RAIZ, stdio: 'inherit', shell: process.platform === 'win32' });
    if (r.status !== 0) throw new Error('o build de demonstração falhou');
  } else {
    console.log(`Reaproveitando ${path.relative(RAIZ, DIST)} (use --build para refazer).`);
  }

  // Servidor local: serve o dist como está; só a cópia de index.html entregue ao navegador ganha o viewport de 390 pontos.
  const servidor = http.createServer((q, r) => {
    let p = path.join(DIST, decodeURIComponent(q.url.split('?')[0]));
    if (!p.startsWith(DIST) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) p = path.join(DIST, 'index.html');
    if (path.basename(p) === 'index.html') {
      const html = fs.readFileSync(p, 'utf8').replace(/<meta name="viewport"[^>]*>/, `<meta name="viewport" content="width=${LARGURA}, initial-scale=${ESCALA}, minimum-scale=${ESCALA}, maximum-scale=${ESCALA}" />`);
      r.writeHead(200, { 'content-type': 'text/html' });
      return r.end(html);
    }
    r.writeHead(200, { 'content-type': TIPOS[path.extname(p)] || 'application/octet-stream' });
    fs.createReadStream(p).pipe(r);
  });
  const porta = await new Promise((resolve, reject) => {
    const tentar = (n) => {
      servidor.once('error', (e) => (e.code === 'EADDRINUSE' && n !== 0 ? tentar(0) : reject(e)));
      servidor.listen(n, () => resolve(servidor.address().port));
    };
    tentar(Number(process.env.VIDEO_PORT || 8399));
  });
  const base = `http://localhost:${porta}`;
  console.log(`Servidor local em ${base}`);

  const logo = `data:image/svg+xml;base64,${fs.readFileSync(LOGOTIPO).toString('base64')}`;
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const problemas = [];
  const trechos = [];

  /** Grava um trecho numa página recriada. `preparar` roda atrás da cortina; `roteiro` roda com a cortina aberta. */
  async function gravar({ nome, cenario, intro, lead, preparar, roteiro, despedida }) {
    const ctx = await browser.newContext({
      viewport: { width: LARGURA * ESCALA, height: ALTURA * ESCALA },
      deviceScaleFactor: 1,
      isMobile: true,
      hasTouch: true,
      locale: 'pt-BR',
      timezoneId: 'America/Sao_Paulo',
      recordVideo: { dir: bruto, size: { width: LARGURA * ESCALA, height: ALTURA * ESCALA } },
    });
    await ctx.addInitScript(prepararPagina, { agora: AGORA, escala: ESCALA, faixa: FAIXA, intro, logo });
    const fora = [];
    await ctx.route('**/*', (rota) => {
      const u = new URL(rota.request().url());
      if (['localhost', '127.0.0.1'].includes(u.hostname) || u.protocol === 'data:' || u.protocol === 'blob:') return rota.continue();
      fora.push(rota.request().url());
      return rota.abort();
    });
    const p = await ctx.newPage();
    const t0 = Date.now();
    const erros = [];
    p.on('pageerror', (e) => erros.push(e.message));

    const pausa = (ms) => p.waitForTimeout(Math.round(ms * RITMO));
    const botao = (name, exact = true) => p.getByRole('button', { name, exact }).filter({ visible: true }).first();
    const aba = (name) => p.getByRole('tab', { name, exact: true }).filter({ visible: true }).first();
    const radio = (name) => p.getByRole('radio', { name, exact: true }).filter({ visible: true }).first();
    const campo = (name) => p.getByLabel(name, { exact: true }).filter({ visible: true }).first();
    const texto = (t, exact = false) => p.getByText(t, { exact }).filter({ visible: true }).first();
    const esperar = (t, timeout = 12000) => texto(t).waitFor({ timeout });
    const legenda = (t) => p.evaluate((x) => window.__demo.legenda(x), t);
    const rolarAte = async (loc, ms = 1500, margem = 140) => {
      await loc.waitFor({ timeout: 12000 });
      await loc.evaluate((el, a) => window.__demo.rolarAte(el, a.ms, a.margem), { ms: Math.round(ms * Math.max(RITMO, 0.5)), margem });
    };
    const rolarPara = (y, ms = 1400) => p.evaluate((a) => window.__demo.rolarPara(a.y, a.ms), { y, ms: Math.round(ms * Math.max(RITMO, 0.5)) });
    /** Toca: se o alvo está fora da área visível, rola até ele primeiro, devagar. */
    const tocar = async (loc) => {
      await loc.waitFor({ timeout: 12000 });
      const dentro = await loc.evaluate((e) => { const r = e.getBoundingClientRect(); return r.top >= 70 && r.bottom <= 690; });
      if (!dentro) await rolarAte(loc, 1300, 170);
      await pausa(350);
      await loc.click();
    };
    const digitar = async (loc, t, atraso) => { await loc.click(); await loc.pressSequentially(t, { delay: atraso }); };
    const sinais = [];
    const marcar = (id, ms) => { sinais.push({ id, quando: Date.now() }); return p.evaluate((a) => window.__demo.marcar(a.id, a.ms), { id, ms }); };
    // Cada passo tem o seu sinal (1 a 10), seguido de uma parada de 1,5 s: o quadro de conferência sai dali, sem o sinal.
    const quadros = [];
    const quadro = async (nomeDoQuadro) => {
      quadros.push({ nome: nomeDoQuadro, id: quadros.length + 1 });
      await marcar(quadros.length, 700);
      await p.waitForTimeout(1500);
    };
    const entrar = async () => {
      await p.goto(base + (cenario ? `/?cenario=${cenario}` : '/'));
      await esperar('Seu dinheiro');
      const entrarNaDemo = botao('Ver demonstração com dados fictícios');
      await entrarNaDemo.waitFor({ timeout: 15000 }).catch(() => { throw new Error('o botão "Ver demonstração com dados fictícios" não apareceu: apps/app/dist não é um build de demonstração (rode com --build)'); });
      await entrarNaDemo.click();
      await esperar('Diferença do mês');
      if (!cenario) await esperar('R$ 2.100,00');
      await esperar('Ainda a pagar neste mês').catch(() => {});
      await p.waitForTimeout(700);
    };
    const c = { p, pausa, botao, aba, radio, campo, texto, esperar, legenda, rolarAte, rolarPara, tocar, digitar, quadro, entrar, base };

    await preparar(c);
    // A cortina precisa ter aparecido por um tempo antes do corte, para a diferença entre o relógio e o vídeo não aparecer.
    const falta = (lead + 1.3) * 1000 - (Date.now() - t0);
    if (falta > 0) await p.waitForTimeout(falta);
    await marcar(ID_ABERTURA, 700);
    await p.waitForTimeout(900);
    const aberturaMs = Date.now();
    await p.evaluate(() => window.__demo.cortina(false));
    await p.waitForTimeout(750);
    await roteiro(c);
    await marcar(ID_FIM, 700);
    await p.waitForTimeout(800);
    await p.evaluate((d) => window.__demo.cortina(true, d), despedida);
    await p.waitForTimeout(despedida.logo ? 3000 : 1000);
    const fimMs = Date.now();

    const video = p.video();
    await ctx.close();
    const arquivo = await video.path();
    const fechouMs = Date.now();
    if (fora.length) problemas.push(`${nome}: requisições para fora de localhost bloqueadas: ${[...new Set(fora)].slice(0, 3).join(' | ')}`);
    if (erros.length) problemas.push(`${nome}: erros na página: ${[...new Set(erros)].slice(0, 3).join(' | ')}`);
    trechos.push({ nome, arquivo, lead, aberturaMs, fimMs, t0, fechouMs, quadros, despedida, sinais });
    console.log(`trecho gravado: ${nome} (${((fimMs - aberturaMs) / 1000).toFixed(1)} s de roteiro)`);
  }

  const INTRO = { logo: true, linhas: ['Demonstração com dados fictícios', 'Nada é gravado fora do aparelho'] };
  const ENTRE = { logo: false, linhas: [] };
  const FIM = { logo: true, linhas: ['Demonstração com dados fictícios', 'clarevo-demo.pages.dev'], destaque: true };

  try {
    // ---------------------------------------------------------------------------------------------------------------
    // Trecho 1 (demonstração padrão): passos 1 a 5.
    // ---------------------------------------------------------------------------------------------------------------
    await gravar({
      nome: 'trecho 1', cenario: null, intro: INTRO, lead: 2.4, despedida: ENTRE,
      preparar: async (c) => { await c.entrar(); },
      roteiro: async (c) => {
        const { p, pausa, botao, aba, radio, campo, texto, esperar, legenda, rolarAte, rolarPara, tocar, digitar, quadro } = c;

        // 1. Resumo
        await legenda(LEGENDAS.resumo);
        await pausa(2800);
        await quadro('passo-01-resumo');
        await rolarAte(texto('Pagamentos do mês', true), 2000, 150);
        await pausa(1800);
        await rolarPara(0, 1500);
        await pausa(400);

        // 2. Anotar gasto (salva só na memória da demonstração)
        await legenda(LEGENDAS.anotar);
        await tocar(botao('Anotar gasto'));
        await esperar('Será salvo em');
        await pausa(800);
        await digitar(campo('Descrição'), 'Feira de sábado', 70);
        await pausa(300);
        await digitar(campo('Valor em reais'), '86,40', 120);
        await pausa(400);
        await tocar(radio('Mercado'));
        await pausa(500);
        await quadro('passo-02-anotar-gasto');
        await legenda(LEGENDAS.salvo);
        await tocar(botao('Salvar gasto'));
        await esperar('Gasto salvo');
        await pausa(2000);
        await tocar(aba('Resumo'));
        await esperar('R$ 3.986,40');
        await pausa(2600);

        // 3. Contas a pagar, com o aviso de dia útil
        await legenda(LEGENDAS.contas);
        await tocar(p.getByRole('button', { name: /^Ainda a pagar neste mês, R\$/ }).filter({ visible: true }).first());
        await esperar('Contas em aberto com vencimento até o fim do mês');
        await pausa(2400);
        await rolarAte(texto('Próximos meses', true), 1500, 110);
        await pausa(700);
        const diaUtil = p.getByRole('button', { name: /^Fatura Cartão Exemplo, vence segunda, 11\/01 \(próximo dia útil\)/ }).filter({ visible: true }).first();
        await rolarAte(diaUtil, 1400, 200);
        await legenda(LEGENDAS.diaUtil);
        await pausa(500);
        await quadro('passo-03-contas-a-pagar');
        await pausa(1800);

        // 4. Cartões e a fatura
        await legenda(LEGENDAS.cartoes);
        await tocar(aba('Movimentos: movimentações do mês'));
        await esperar('Registrar recebimento');
        await pausa(800);
        await tocar(p.getByRole('button', { name: /^Cartões, / }).filter({ visible: true }).first());
        await esperar('Cadastrar cartão');
        await pausa(2200);
        await tocar(p.getByRole('button', { name: /^Cartão Exemplo · final 1234\./ }).filter({ visible: true }).first());
        await esperar('Fatura atual');
        await pausa(1400);
        await tocar(p.getByRole('button', { name: /^Fatura de novembro, aberta/ }).filter({ visible: true }).first());
        await esperar('Como o total é formado');
        await legenda(LEGENDAS.fatura);
        await pausa(1200);
        await rolarAte(texto('Lançamentos', true), 1400, 130);
        await pausa(500);
        await quadro('passo-04-cartoes-e-fatura');
        await pausa(1200);

        // 5. Movimentações e Análises, com as Bolhas
        await legenda(LEGENDAS.movimentacoes);
        await tocar(aba('Movimentos: movimentações do mês'));
        await esperar('Registrar recebimento');
        await rolarPara(0, 800);
        await pausa(2200);
        await tocar(botao('Análises. Categorias, Evolução, Próximos meses e Orçamento.'));
        await esperar('Consulte o mês escolhido');
        await legenda(LEGENDAS.analises);
        await pausa(1200);
        await tocar(radio('Bolhas'));
        await p.getByRole('group', { name: 'Pago por categoria, em bolhas' }).filter({ visible: true }).first().waitFor({ timeout: 8000 });
        await pausa(2200);
        await legenda(LEGENDAS.categoria);
        await pausa(600);
        await tocar(p.getByRole('button', { name: /^Moradia, / }).filter({ visible: true }).first());
        await esperar('Categoria selecionada');
        await pausa(1200);
        await rolarAte(texto('Categoria selecionada', true), 1400, 110);
        await pausa(500);
        await quadro('passo-05-analises-bolhas');
        await pausa(1400);
      },
    });

    // ---------------------------------------------------------------------------------------------------------------
    // Trecho 2 (cenário fictício "evolucao"): passo 6.
    // ---------------------------------------------------------------------------------------------------------------
    await gravar({
      nome: 'trecho 2', cenario: 'evolucao', intro: ENTRE, lead: 0.5, despedida: ENTRE,
      preparar: async (c) => {
        await c.entrar();
        await c.aba('Movimentos: movimentações do mês').click();
        await c.esperar('Registrar recebimento');
        await c.legenda(LEGENDAS.evolucao);
      },
      roteiro: async (c) => {
        const { p, pausa, botao, texto, esperar, legenda, rolarAte, rolarPara, tocar, quadro } = c;
        // 6. Evolução: com os 12 meses e abril na comparação, depois sem abril; média e mediana antes e depois.
        await pausa(800);
        await tocar(botao('Evolução. Recebido e pago mês a mês, com média e mediana.'));
        await esperar('Valores registrados, pela data do pagamento');
        await pausa(1200);
        await tocar(p.getByRole('radio', { name: '12 meses' }).or(botao('12 meses')).filter({ visible: true }).first());
        await pausa(2200);
        await tocar(p.getByRole('button', { name: /^Abril de 2026/ }).filter({ visible: true }).first());
        await pausa(700);
        const media = texto('Média dos meses na comparação', true);
        await rolarAte(media, 1500, 120);
        await esperar('R$ 4.125,00');
        await pausa(1600);
        await legenda(LEGENDAS.entender);
        const entender = botao('Entender o que mudou');
        await rolarAte(entender, 1500, 130);
        await pausa(400);
        await tocar(entender);
        await p.getByRole('group', { name: 'Entender o que mudou', exact: true }).filter({ visible: true }).first().waitFor({ timeout: 8000 });
        await pausa(2200);
        await rolarAte(texto('Lançamentos relacionados', true), 1300, 110);
        await pausa(1600);
        const interruptor = p.getByRole('switch', { name: 'Mostrar este mês na comparação', exact: true }).filter({ visible: true }).first();
        await rolarAte(interruptor, 1400, 260);
        await legenda(LEGENDAS.tirar);
        await pausa(1000);
        await tocar(interruptor);
        await pausa(1100);
        await rolarPara(0, 1300);
        await pausa(1600);
        await rolarAte(media, 1500, 120);
        await legenda(LEGENDAS.semAbril);
        await esperar('R$ 3.390,00');
        await pausa(800);
        await quadro('passo-06-evolucao');
        await pausa(1400);
      },
    });

    // ---------------------------------------------------------------------------------------------------------------
    // Trecho 3 (demonstração padrão de novo): passos 7 a 10.
    // ---------------------------------------------------------------------------------------------------------------
    await gravar({
      nome: 'trecho 3', cenario: null, intro: ENTRE, lead: 0.5, despedida: FIM,
      preparar: async (c) => { await c.entrar(); await c.legenda(LEGENDAS.metas); },
      roteiro: async (c) => {
        const { p, pausa, botao, aba, texto, esperar, legenda, rolarAte, rolarPara, tocar, quadro } = c;

        // 7. Metas
        await pausa(600);
        await tocar(aba('Metas'));
        await esperar('Reserva para imprevistos');
        await esperar('Seu plano de guardar');
        await pausa(1600);
        await quadro('passo-07-metas');
        await rolarAte(texto('Suas metas', true), 1700, 130);
        await pausa(1500);

        // 8. Aprender, com "Neste mês"
        await legenda(LEGENDAS.aprender);
        await tocar(aba('Aprender e dúvidas'));
        await esperar('Comece por aqui');
        await pausa(1400);
        await rolarAte(texto('Neste mês', true), 1400, 120);
        await legenda(LEGENDAS.nesteMes);
        await pausa(700);
        await quadro('passo-08-aprender');
        await tocar(p.getByRole('button', { name: /^13º salário\. Duas parcelas/ }).filter({ visible: true }).first());
        await esperar('Ver a conta');
        await pausa(1600);
        await rolarAte(texto('Exemplo', true), 1500, 110);
        await pausa(2000);
        await rolarAte(texto('Fontes', true), 1700, 120);
        await pausa(1200);

        // 9. Painel da empresa (só na web)
        await legenda(LEGENDAS.empresa);
        await tocar(aba('Resumo'));
        await esperar('Diferença do mês');
        await pausa(500);
        await tocar(botao('Conta: perfil, segurança e acesso ao plano'));
        await esperar('Abrir painel da empresa');
        await pausa(900);
        await tocar(botao('Abrir painel da empresa'));
        await esperar('Empresa Exemplo (demonstração)');
        await pausa(2400);
        await rolarAte(texto('Uso do app', true), 2200, 110);
        await legenda(LEGENDAS.usoApp);
        await pausa(900);
        await quadro('passo-09-painel-da-empresa');
        await pausa(800);

        // 10. Quem vê estes dados?
        await legenda(LEGENDAS.quemVe);
        await tocar(aba('Resumo'));
        await esperar('Diferença do mês');
        await pausa(500);
        await rolarPara('fim', 1600);
        await pausa(500);
        await tocar(botao('Quem vê estes dados?'));
        await esperar('Única pessoa que vê, anota, edita e exclui');
        await pausa(2000);
        await rolarAte(texto('A empresa que oferece o benefício vê os e-mails', false), 1500, 110);
        await pausa(1000);
        await quadro('passo-10-quem-ve-estes-dados');
        await pausa(1400);
      },
    });
  } finally {
    await browser.close();
    servidor.close();
  }
  if (problemas.length) throw new Error(`problemas na gravação:\n- ${problemas.join('\n- ')}`);

  // -------------------------------------------------------------------------------------------------------------------
  // Corte, junção e conversão.
  // -------------------------------------------------------------------------------------------------------------------
  const H = ALTURA * ESCALA;
  const W = LARGURA * ESCALA;
  const cortes = trechos.map((t) => {
    const doVideo = duracaoDe(t.arquivo);
    const marcas = acharMarcas(t.arquivo, H);
    const sinais = instantesDosSinais(t.nome, t.sinais, marcas);
    const em = (id) => sinais.find((x) => x.id === id).em;
    const abertura = em(ID_ABERTURA) + 0.9; // o sinal fica 0,9 s antes de a cortina abrir
    const fimDoRoteiro = em(ID_FIM) + 0.8 + (t.despedida.logo ? 3.0 : 1.0);
    const inicioVideo = Math.max(0, abertura - t.lead);
    const duracao = Math.min(fimDoRoteiro, doVideo) - inicioVideo;
    console.log(`${t.nome}: relógio ${((t.fechouMs - t.t0) / 1000).toFixed(1)} s, vídeo ${doVideo.toFixed(1)} s (o vídeo do Playwright anda mais devagar que o relógio quando a tela anima), trecho útil de ${duracao.toFixed(1)} s`);
    // Cobre toda tira vista no vídeo (até a de 1 quadro só) com a cor do que está embaixo: azul da cortina na abertura, #17223B da faixa nos demais.
    const cobrir = marcas.map((m) => `drawbox=x=0:y=ih-16:w=112:h=16:color=${m.id === ID_ABERTURA ? '0x2457F5' : '0x17223B'}:t=fill:enable='between(t,${(m.inicio - inicioVideo - 0.1).toFixed(3)},${(m.fim - inicioVideo + 0.1).toFixed(3)})'`);
    return { ...t, inicioVideo, duracao, cobrir, quadrosAchados: t.quadros.map((q) => ({ ...q, em: em(q.id) })) };
  });
  let acumulado = 0;
  for (const t of cortes) { t.noFinal = acumulado; acumulado += t.duracao; }

  const destino = path.join(SAIDA, 'clarevo-demonstracao.mp4');
  const entradas = cortes.flatMap((t) => ['-ss', t.inicioVideo.toFixed(3), '-t', t.duracao.toFixed(3), '-i', t.arquivo]);
  const filtro = cortes.map((t, i) => `[${i}:v]fps=25,${t.cobrir.length ? `${t.cobrir.join(',')},` : ''}scale=${W}:${H}:flags=lanczos,setsar=1,format=yuv420p[v${i}]`).join(';')
    + `;${cortes.map((_, i) => `[v${i}]`).join('')}concat=n=${cortes.length}:v=1:a=0[v]`;
  let bytes = 0;
  for (const crf of [27, 28, 29, 30, 32]) {
    executar(FFMPEG, ['-y', '-v', 'error', ...entradas, '-f', 'lavfi', '-i', 'anullsrc=channel_layout=mono:sample_rate=44100',
      '-filter_complex', filtro, '-map', '[v]', '-map', `${cortes.length}:a`,
      '-c:v', 'libx264', '-preset', 'slow', '-crf', String(crf), '-profile:v', 'high', '-level', '4.0', '-pix_fmt', 'yuv420p', '-r', '25',
      '-c:a', 'aac', '-b:a', '32k', '-shortest', '-metadata', 'title=Clarevo: demonstração com dados fictícios', '-movflags', '+faststart', destino]);
    bytes = fs.statSync(destino).size;
    console.log(`MP4 com crf ${crf}: ${(bytes / 1e6).toFixed(2)} MB`);
    if (bytes <= LIMITE_BYTES) break;
  }
  if (bytes > LIMITE_BYTES) throw new Error(`o MP4 passou de ${LIMITE_BYTES / 1e6} MB mesmo com a compressão mais forte`);

  const sobras = acharMarcas(destino, H);
  if (sobras.length) throw new Error(`sobraram ${sobras.length} sinais de sincronia visíveis no MP4`);

  // Um quadro de cada passo, tirado do próprio MP4 (o que aparece no vídeo é o que se confere), 1,05 s depois do sinal de
  // sincronia do passo, quando ele já saiu e a tela está parada.
  const quadrosGravados = [];
  for (const t of cortes) {
    for (const q of t.quadrosAchados) {
      const instante = t.noFinal + (q.em + 1.05 - t.inicioVideo);
      const arquivo = path.join(SAIDA, `${q.nome}.png`);
      executar(FFMPEG, ['-y', '-v', 'error', '-ss', instante.toFixed(3), '-i', destino, '-frames:v', '1', arquivo]);
      quadrosGravados.push({ arquivo, instante });
    }
  }

  // Conferência do arquivo.
  const sonda = JSON.parse(executar(FFPROBE, ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', destino]));
  const v = sonda.streams.find((s) => s.codec_type === 'video');
  const a = sonda.streams.find((s) => s.codec_type === 'audio');
  const duracao = Number(sonda.format.duration);
  const resumo = { arquivo: destino, tamanhoMB: Number((Number(sonda.format.size) / 1e6).toFixed(2)), duracaoSegundos: Number(duracao.toFixed(1)), video: `${v.codec_name} ${v.profile} ${v.width}x${v.height} ${v.pix_fmt}`, audio: a ? `${a.codec_name}` : 'sem áudio', quadros: quadrosGravados.length };
  console.log(JSON.stringify(resumo, null, 2));
  quadrosGravados.forEach((q) => console.log(`quadro ${path.basename(q.arquivo)} em ${q.instante.toFixed(1)} s`));
  const faststart = (() => { const b = fs.readFileSync(destino).subarray(0, 4096); const moov = b.indexOf('moov'); const mdat = b.indexOf('mdat'); return moov > 0 && (mdat < 0 || moov < mdat); })();
  if (!faststart) throw new Error('o MP4 não ficou com o moov no começo (+faststart)');
  if (v.codec_name !== 'h264' || v.pix_fmt !== 'yuv420p') throw new Error('o vídeo não está em H.264 yuv420p');
  if (duracao < 120 || duracao > 180) console.warn(`ATENÇÃO: duração de ${duracao.toFixed(1)} s, fora do alvo de 2 a 3 minutos.`);
  if (argv.includes('--manter-bruto')) {
    const destinoBruto = path.join(SAIDA, 'bruto');
    fs.mkdirSync(destinoBruto, { recursive: true });
    cortes.forEach((t, i) => fs.copyFileSync(t.arquivo, path.join(destinoBruto, `trecho-${i + 1}.webm`)));
    console.log(`trechos originais em ${destinoBruto}`);
  }
  fs.rmSync(bruto, { recursive: true, force: true });
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
