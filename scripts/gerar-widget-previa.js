/**
 * Prévias dos widgets do Android (visual de 16/11/2026, docs/21_WIDGET_NATIVO.md, seção 9), sem aparelho nem emulador.
 *
 * O desenho não é refeito à mão: o script roda o próprio `apps/app/src/widget-native/android.tsx` (pelo mesmo Babel do Expo, como os testes
 * do núcleo em `packages/core/test/app-sandbox.ts`), com o conteúdo montado pelo núcleo (`buildWidgetContent`), pega a árvore de blocos que
 * a biblioteca receberia (FlexWidget, TextWidget, SvgWidget) e a converte em HTML com as mesmas medidas (1 dp = 1 px de CSS), as mesmas cores
 * e os mesmos desenhos SVG. A conversão segue o LinearLayout do Android: coluna ou linha, gravidade, peso (`flex`), margens, cantos, texto
 * com as medidas da Roboto (altura de linha 1,172 e o respiro de fonte de cima e de baixo), limite de linhas com reticências e o texto que
 * diminui para caber (`adjustsFontSizeToFit`). O Chromium do Playwright desenha com densidade 2.
 *
 *   apps/app/assets/widget/anotar-gasto-previa.png   prévia do pequeno na lista de widgets do Android (`previewImage`, widget.config.js)
 *   apps/app/assets/widget/ainda-a-pagar-previa.png  prévia do médio, com os valores ocultos (o padrão) e sem dado de ninguém
 *
 * Uso:
 *   node scripts/gerar-widget-previa.js                      grava as duas prévias da lista de widgets
 *   node scripts/gerar-widget-previa.js --galeria <pasta>    grava também, na pasta, cada tamanho, estado e letra (padrão e 1,5 vez
 *                                                            maior) sobre papel de parede claro e escuro, e uma visão geral de cada
 *                                                            tema (para olhar, não vai para o app)
 *
 * Cada desenho também é conferido na página: um "AVISO" sai no terminal se algum bloco passa da borda do widget ou se um texto ficou
 * espremido (sem altura para uma linha).
 *
 * Os valores da galeria são fictícios (Luz, Internet e Aluguel, em novembro de 2026). Fonte: a Roboto do Android, se ROBOTO_WOFF2 apontar
 * para o arquivo (por exemplo `roboto-latin-wght-normal.woff2` do pacote `@fontsource-variable/roboto`); sem ela, a fonte sem serifa da
 * máquina, e as medidas do texto ficam aproximadas. Navegador: Chromium do Playwright, ou CHROMIUM_PATH.
 */
const fs = require('node:fs');
const path = require('node:path');
const babel = require('@babel/core');
const { chromium } = require('playwright');

const RAIZ = path.join(__dirname, '..');
const APP = path.join(RAIZ, 'apps', 'app');
const NUCLEO = path.join(RAIZ, 'packages', 'core', 'src', 'index.ts');
const SAIDA_APP = path.join(APP, 'assets', 'widget');
const ESCALA = 2;

// ---- Carregar o widget do app como os testes do núcleo: Babel do Expo, CommonJS, só o nativo de mentira. ----

function compilar(arquivo) {
  return babel.transformSync(fs.readFileSync(arquivo, 'utf8'), {
    filename: arquivo,
    babelrc: false,
    configFile: false,
    presets: [[require.resolve('babel-preset-expo'), {}]],
    caller: { name: 'metro', bundler: 'metro', platform: 'android', isDev: false, isServer: false, supportsReactCompiler: true, engine: 'hermes' },
    sourceType: 'module',
  }).code;
}

function resolver(spec, de) {
  const base = spec === '@clarevo/core' ? NUCLEO : spec.startsWith('@/') ? path.join(APP, 'src', spec.slice(2)) : path.resolve(path.dirname(de), spec);
  const achado = [base, ...['.ts', '.tsx', '.js'].map((ext) => base + ext), path.join(base, 'index.ts')].find(
    (c) => fs.existsSync(c) && fs.statSync(c).isFile(),
  );
  if (!achado) throw new Error(`Módulo não encontrado: ${spec} (a partir de ${de})`);
  return achado;
}

/** Os blocos da biblioteca: funções com o nome nativo, como as de `react-native-android-widget`. */
const bloco = (nome) => Object.assign((props) => props.children ?? null, { __name__: nome });
const FALSOS = {
  'react-native-android-widget': {
    FlexWidget: bloco('FlexWidget'),
    TextWidget: bloco('TextWidget'),
    SvgWidget: bloco('SvgWidget'),
    requestWidgetUpdate: async () => {},
  },
  '@react-native-async-storage/async-storage': { __esModule: true, default: { getItem: async () => null, setItem: async () => {} } },
  'react-native': { PixelRatio: { getFontScale: () => 1 } },
};

function carregar(arquivo) {
  const cache = new Map();
  const load = (alvo) => {
    if (cache.has(alvo)) return cache.get(alvo);
    const mod = { exports: {} };
    cache.set(alvo, mod.exports);
    const req = (spec) => {
      if (spec in FALSOS) return FALSOS[spec];
      if (spec === '@clarevo/core' || spec.startsWith('.') || spec.startsWith('@/')) return load(resolver(spec, alvo));
      return require(spec);
    };
    new Function('module', 'exports', 'require', compilar(alvo))(mod, mod.exports, req);
    cache.set(alvo, mod.exports);
    return mod.exports;
  };
  return load(arquivo);
}

/** O que a biblioteca faz com um widget: chama as funções dos componentes até sobrarem só os blocos nativos. */
function arvore(el) {
  let atual = el;
  while (typeof atual.type === 'function' && !atual.type.__name__) atual = atual.type(atual.props);
  const { children, ...props } = atual.props;
  const filhos = (Array.isArray(children) ? children : children ? [children] : []).flat(Infinity).filter(Boolean);
  return { type: atual.type.__name__, props, children: filhos.map(arvore) };
}

// ---- Árvore de blocos -> HTML, com as regras do LinearLayout. ----

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const ALINHA = { 'flex-start': 'flex-start', center: 'center', 'flex-end': 'flex-end' };

function caixa(style) {
  const s = [];
  const lados = (prop, css) => {
    const v = (k) => style[k];
    const t = v(`${prop}Top`) ?? v(`${prop}Vertical`) ?? v(prop) ?? 0;
    const b = v(`${prop}Bottom`) ?? v(`${prop}Vertical`) ?? v(prop) ?? 0;
    const l = v(`${prop}Left`) ?? v(`${prop}Horizontal`) ?? v(prop) ?? 0;
    const r = v(`${prop}Right`) ?? v(`${prop}Horizontal`) ?? v(prop) ?? 0;
    if (t || b || l || r) s.push(`${css}:${t}px ${r}px ${b}px ${l}px`);
  };
  lados('padding', 'padding');
  lados('margin', 'margin');
  if (style.borderRadius) s.push(`border-radius:${style.borderRadius}px`);
  if (style.backgroundColor) s.push(`background:${style.backgroundColor}`);
  return s;
}

/** Tamanho e peso de um filho dentro do LinearLayout do pai (`dir`: 'row' ou 'column'; null na raiz). */
function noPai(style, dir, encolhe) {
  const s = [];
  if (!dir) return ['width:100%', 'height:100%'];
  const principal = dir === 'row' ? 'width' : 'height';
  const cruzado = dir === 'row' ? 'height' : 'width';
  if (style.flex) s.push(`flex:${style.flex} 1 0px`, 'min-width:0', 'min-height:0');
  else if (typeof style[principal] === 'number') s.push(`${principal}:${style[principal]}px`, 'flex:0 0 auto');
  else s.push(encolhe ? 'flex:0 1 auto' : 'flex:0 0 auto', 'min-width:0');
  if (typeof style[cruzado] === 'number') s.push(`${cruzado}:${style[cruzado]}px`);
  else if (style[cruzado] === 'match_parent') s.push('align-self:stretch');
  return s;
}

/** `letra`: a escala de letra do aparelho (Tamanho da fonte); o texto cresce com ela, como o sp do Android. */
function html(no, dir = null, letra = 1) {
  const style = no.props.style ?? {};
  if (no.type === 'FlexWidget') {
    const linha = style.flexDirection === 'row';
    const s = [
      'display:flex',
      `flex-direction:${linha ? 'row' : 'column'}`,
      `justify-content:${ALINHA[style.justifyContent] ?? 'flex-start'}`,
      `align-items:${ALINHA[style.alignItems] ?? 'flex-start'}`,
      'overflow:hidden',
      'box-sizing:border-box',
      ...noPai(style, dir, false),
      ...caixa(style),
    ];
    const toque = no.props.clickAction ? ` data-toque="${esc(no.props.clickActionData?.uri ?? '')}"` : '';
    return `<div style="${s.join(';')}"${toque}>${no.children.map((c) => html(c, linha ? 'row' : 'column', letra)).join('')}</div>`;
  }
  if (no.type === 'SvgWidget') {
    const s = [...noPai(style, dir, false), ...caixa(style), `width:${style.width}px`, `height:${style.height}px`, 'display:flex'];
    return `<div style="${s.join(';')}">${no.props.svg}</div>`;
  }
  if (no.type === 'TextWidget') {
    const auto = Boolean(style.adjustsFontSizeToFit);
    const s = [
      ...noPai(style, dir, true),
      ...caixa(style),
      `font-size:${(style.fontSize ?? 12) * letra}px`,
      `font-weight:${style.fontWeight === 'bold' ? 700 : style.fontWeight ?? 400}`,
      `color:${style.color ?? '#000000'}`,
      // Roboto no Android: linhas de 1,172 em e o respiro da fonte em cima (0,128 em) e embaixo (0,027 em).
      'line-height:1.172',
      'padding-top:0.128em',
      'padding-bottom:0.027em',
      'box-sizing:border-box',
      'overflow:hidden',
      'overflow-wrap:break-word',
      ...(auto
        ? ['white-space:nowrap', 'display:block']
        : ['display:-webkit-box', '-webkit-box-orient:vertical', `-webkit-line-clamp:${no.props.maxLines ?? 99}`]),
    ];
    if (typeof style.width === 'number') s.push(`width:${style.width}px`);
    if (typeof style.height === 'number') s.push(`height:${style.height}px`);
    return `<div style="${s.join(';')}"${auto ? ' data-ajusta="1"' : ''}>${esc(no.props.text)}</div>`;
  }
  throw new Error(`Bloco sem conversão: ${no.type}`);
}

/** O widget numa imagem do tamanho informado, como a biblioteca desenha (o que passa do tamanho fica de fora). */
const quadro = (no, w, h, letra = 1) => `<div class="quadro" style="width:${w}px;height:${h}px;overflow:hidden;flex:0 0 auto">${html(no, null, letra)}</div>`;

// ---- Conteúdo de exemplo, montado pelo núcleo (dados fictícios). ----

function cenarios(core) {
  const hoje = '2026-11-16';
  const mes = '2026-11';
  const conta = (id, description, amountCents, dueOn) => ({
    id,
    contextId: 'ctx',
    description,
    amountCents,
    currency: 'BRL',
    dueOn,
    category: null,
    status: 'aberto',
    payment: null,
    series: null,
    seriesOverride: false,
    amountIsEstimate: false,
    invoice: null,
    createdBy: 'pessoa',
    version: 1,
    createdAt: '2026-11-01T10:00:00Z',
    updatedAt: '2026-11-01T10:00:00Z',
  });
  const contas = [conta('1', 'Luz', 18_640, '2026-11-10'), conta('2', 'Internet', 11_990, '2026-11-19'), conta('3', 'Aluguel', 185_000, '2026-11-25')];
  const resumo = (lista) => core.summarizeToPay(lista, 'ctx', mes, hoje);
  const montar = (over) => core.buildWidgetContent({ today: hoje, signedIn: true, demo: false, showValues: false, toPay: null, ...over });
  return {
    valor: montar({ showValues: true, toPay: resumo(contas) }),
    oculto: montar({ showValues: false, toPay: resumo(contas) }),
    vazio: montar({ toPay: resumo([]) }),
    semDados: montar({ toPay: null }),
    semSessao: montar({ signedIn: false }),
    // Prévia da lista de widgets: valores ocultos (o padrão) e sem vencidas.
    previa: montar({ showValues: false, toPay: resumo(contas.slice(1)) }),
  };
}

// ---- Página e desenho. ----

const PAPEL = {
  claro: { fundo: 'linear-gradient(160deg, #DCE5F7 0%, #F3EEE6 100%)', legenda: '#17223B' },
  escuro: { fundo: 'linear-gradient(160deg, #0B1022 0%, #262A47 100%)', legenda: '#EEF2FB' },
};

function pagina(corpo, fundo) {
  const fonte = process.env.ROBOTO_WOFF2
    ? `@font-face{font-family:'Roboto';src:url(data:font/woff2;base64,${fs.readFileSync(process.env.ROBOTO_WOFF2).toString('base64')}) format('woff2');font-weight:100 900;}`
    : '';
  return `<!doctype html><html><head><meta charset="utf-8"><style>${fonte}
    *{margin:0;padding:0}
    html,body{background:${fundo};font-family:'Roboto','Inter','DejaVu Sans',sans-serif;-webkit-font-smoothing:antialiased}
    .cena{display:inline-flex;padding:24px;background:${fundo}}
    .folha{display:inline-flex;flex-direction:column;gap:28px;padding:32px}
    .linha{display:flex;gap:28px;align-items:flex-start;flex-wrap:nowrap}
    .item{display:flex;flex-direction:column;gap:10px}
    .legenda{font:600 13px/1.3 'Roboto','Inter',sans-serif;opacity:.85}
    h1{font:700 18px/1.3 'Roboto','Inter',sans-serif}
  </style></head><body>${corpo}</body></html>`;
}

/** Roda na página, depois de a fonte carregar: o texto que diminui para caber e a conferência de que nada passa da borda do widget. */
function ajustarEConferir() {
  // adjustsFontSizeToFit: diminui a letra, de 1 em 1, até o texto caber na largura e na altura do bloco (como o TextView do Android).
  for (const el of document.querySelectorAll('[data-ajusta]')) {
    let tamanho = parseFloat(getComputedStyle(el).fontSize);
    while (tamanho > 1 && (el.scrollWidth > el.clientWidth + 0.5 || el.scrollHeight > el.clientHeight + 0.5)) el.style.fontSize = --tamanho + 'px';
  }
  const avisos = [];
  for (const quadro of document.querySelectorAll('.quadro')) {
    const q = quadro.getBoundingClientRect();
    for (const el of quadro.querySelectorAll('div')) {
      if (el.querySelector('div')) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      if (r.left < q.left - 0.5 || r.top < q.top - 0.5 || r.right > q.right + 0.5 || r.bottom > q.bottom + 0.5) avisos.push(`passa da borda: "${el.textContent || 'desenho'}"`);
      // Texto cortado por falta de espaço (a reticência do limite de linhas é esperada; um bloco espremido, não).
      if (!el.querySelector('svg') && el.textContent && r.height + 0.5 < parseFloat(getComputedStyle(el).fontSize) * 1.3) avisos.push(`texto espremido: "${el.textContent}"`);
    }
  }
  return avisos;
}

async function fotografar(contexto, html, arquivo, seletor, transparente = false) {
  const page = await contexto.newPage();
  await page.setViewportSize({ width: 1600, height: 1200 });
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  const avisos = await page.evaluate(ajustarEConferir);
  for (const aviso of avisos) console.warn(`AVISO ${path.basename(arquivo)}: ${aviso}`);
  const alvo = await page.$(seletor);
  fs.mkdirSync(path.dirname(arquivo), { recursive: true });
  await alvo.screenshot({ path: arquivo, omitBackground: transparente });
  await page.close();
  console.log(`gravado ${path.relative(process.cwd(), arquivo) || arquivo}`);
}

async function main() {
  const argGaleria = process.argv.indexOf('--galeria');
  const galeria = argGaleria > 0 ? path.resolve(process.argv[argGaleria + 1] ?? '') : null;
  if (argGaleria > 0 && !process.argv[argGaleria + 1]) throw new Error('Uso: --galeria <pasta>');

  const core = carregar(NUCLEO);
  const widget = carregar(path.join(APP, 'src', 'widget-native', 'android.tsx'));
  const c = cenarios(core);
  const pequeno = (conteudo, w, h, letra = 1) =>
    quadro(arvore(widget.SmallWidget({ small: conteudo.small, size: { width: w, height: h }, fontScale: letra })), w, h, letra);
  const medio = (conteudo, w, h, scheme, letra = 1) =>
    quadro(arvore(widget.MediumWidget({ content: conteudo, size: { width: w, height: h }, scheme, fontScale: letra })), w, h, letra);

  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const contexto = await browser.newContext({ deviceScaleFactor: ESCALA });

  // Prévias da lista de widgets: fundo transparente, nos tamanhos padrão de 2 x 2 e 4 x 2, tema claro.
  const { small: s, medium: m } = widget.DEFAULT_SIZE;
  await fotografar(contexto, pagina(`<div class="cena" style="background:transparent;padding:0">${pequeno(c.previa, s.width, s.height)}</div>`, 'transparent'), path.join(SAIDA_APP, 'anotar-gasto-previa.png'), '.quadro', true);
  await fotografar(contexto, pagina(`<div class="cena" style="background:transparent;padding:0">${medio(c.previa, m.width, m.height, 'light')}</div>`, 'transparent'), path.join(SAIDA_APP, 'ainda-a-pagar-previa.png'), '.quadro', true);

  if (galeria) {
    const W = 344;
    const casos = [
      { nome: 'pequeno-2x2', legenda: 'Anotar gasto · 2 x 2 (170 x 170 dp)', html: () => pequeno(c.valor, 170, 170) },
      { nome: 'pequeno-2x3', legenda: 'Anotar gasto · célula alta, cerca de 2 x 3 (170 x 256 dp)', html: () => pequeno(c.valor, 170, 256) },
      { nome: 'pequeno-minimo', legenda: 'Anotar gasto · mínimo (110 x 110 dp)', html: () => pequeno(c.valor, 110, 110) },
      { nome: 'medio-valor', legenda: 'Ainda a pagar · com valor (344 x 184 dp)', html: (t) => medio(c.valor, W, 184, t) },
      { nome: 'medio-oculto', legenda: 'Ainda a pagar · valor oculto, o padrão', html: (t) => medio(c.oculto, W, 184, t) },
      { nome: 'medio-vazio', legenda: 'Ainda a pagar · mês sem nada em aberto', html: (t) => medio(c.vazio, W, 184, t) },
      { nome: 'medio-sem-dados', legenda: 'Ainda a pagar · outro dia, sem abrir o app', html: (t) => medio(c.semDados, W, 184, t) },
      { nome: 'medio-sem-sessao', legenda: 'Ainda a pagar · sem sessão', html: (t) => medio(c.semSessao, W, 184, t) },
      { nome: 'medio-baixo', legenda: 'Ainda a pagar · célula baixa (344 x 120 dp)', html: (t) => medio(c.valor, W, 120, t) },
      { nome: 'medio-baixo-oculto', legenda: 'Ainda a pagar · célula baixa, valor oculto', html: (t) => medio(c.oculto, W, 120, t) },
      { nome: 'medio-alto', legenda: 'Ainda a pagar · célula alta (344 x 240 dp)', html: (t) => medio(c.valor, W, 240, t) },
      { nome: 'medio-minimo-vazio', legenda: 'Ainda a pagar · mínimo (250 x 110 dp), mês vazio', html: (t) => medio(c.vazio, 250, 110, t) },
      { nome: 'pequeno-letra-grande', legenda: 'Anotar gasto · 2 x 2 com letra 1,5 vez maior', html: () => pequeno(c.valor, 170, 170, 1.5) },
      { nome: 'medio-letra-grande', legenda: 'Ainda a pagar · 344 x 184 dp com letra 1,5 vez maior', html: (t) => medio(c.valor, W, 184, t, 1.5) },
      { nome: 'medio-alto-letra-grande', legenda: 'Ainda a pagar · 344 x 240 dp com letra 1,5 vez maior', html: (t) => medio(c.oculto, W, 240, t, 1.5) },
    ];
    for (const [tema, papel] of Object.entries(PAPEL)) {
      const scheme = tema === 'escuro' ? 'dark' : 'light';
      for (const caso of casos) {
        await fotografar(contexto, pagina(`<div class="cena">${caso.html(scheme)}</div>`, papel.fundo), path.join(galeria, `${caso.nome}-${tema}.png`), '.cena');
      }
      const item = (caso) => `<div class="item">${caso.html(scheme)}<div class="legenda" style="color:${papel.legenda}">${esc(caso.legenda)}</div></div>`;
      const pegar = (...nomes) => nomes.map((n) => casos.find((k) => k.nome === n));
      const folha = `<div class="folha"><h1 style="color:${papel.legenda}">Widgets da Clarevo no Android · tema ${tema}</h1>
        <div class="linha">${pegar('pequeno-2x2', 'pequeno-2x3', 'pequeno-minimo').map(item).join('')}</div>
        <div class="linha">${pegar('medio-valor', 'medio-oculto', 'medio-vazio').map(item).join('')}</div>
        <div class="linha">${pegar('medio-sem-dados', 'medio-sem-sessao', 'medio-minimo-vazio').map(item).join('')}</div>
        <div class="linha">${pegar('medio-baixo', 'medio-baixo-oculto', 'medio-alto').map(item).join('')}</div>
        <div class="linha">${pegar('pequeno-letra-grande', 'medio-letra-grande', 'medio-alto-letra-grande').map(item).join('')}</div></div>`;
      await fotografar(contexto, pagina(folha, papel.fundo), path.join(galeria, `visao-geral-${tema}.png`), '.folha');
    }
  }
  await browser.close();
}

main().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
