/**
 * Roteiro de verificação do primeiro ciclo, do Ciclo A (gastos fixos e parcelamentos), do Ciclo A3 (contas do ano),
 * de "Primeiros passos" no Resumo, dos atalhos de Movimentações, do Ciclo A6 (achar tudo e calculadoras), do Ciclo A4
 * (seus últimos meses, com o cenário fictício "retorno" da demonstração), do Ciclo A5 (Aprender e dúvidas), do Ciclo A2
 * (Conta na web e ocultar valores), do Ciclo B (renda comprometida e a previsão dos pagamentos), do Ciclo C (metas, reserva
 * e plano de guardar), do Ciclo D (simulador, com os aportes no início de cada mês) e da Navegação (D-039: "Anotar gasto" logo
 * abaixo do cabeçalho, barra inferior nas telas de consulta, Contas a pagar no mês certo, Metas compacta e a busca "No app" de
 * Aprender), de "Antes de financiar" (D-044), do Ciclo G1 (contas de origem do dinheiro, D-043), do Ciclo H1 (buscar em
 * Movimentos, D-045), do Ciclo H2 (assinaturas, D-046, com o cenário fictício "assinaturas" da demonstração) e do Ciclo H3
 * (exportar meus dados em CSV e PDF, D-047), do Ciclo I1 (importar extrato e fatura, D-048) e do Tutorial (D-049: o guia em Aprender, o
 * tour de boas-vindas, o botão "?" nas telas e as capturas do manual) na versão web, em modo demonstração (acesso simulado).
 * Uso: npm run test:web   (gera a versão web, sobe um servidor local e percorre os fluxos)
 * Capturas de tela vão para docs/telas/ (ou para a pasta do 1º argumento). Navegador: Chromium do Playwright, ou CHROMIUM_PATH.
 * Se o roteiro parar no meio, a tela do momento vai para a pasta temporária do sistema (nunca para docs/telas/).
 */
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');

const DIST = path.join(__dirname, '..', 'apps', 'app', 'dist');
const OUT = process.argv[2] || path.join(__dirname, '..', 'docs', 'telas');
const PORT = Number(process.env.E2E_PORT || 8099);
const TYPES = { '.js': 'text/javascript', '.html': 'text/html', '.ttf': 'font/ttf', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.css': 'text/css', '.webmanifest': 'application/manifest+json' };
const server = http
  .createServer((q, r) => {
    let p = path.join(DIST, decodeURIComponent(q.url.split('?')[0]));
    if (!p.startsWith(DIST) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) p = path.join(DIST, 'index.html');
    r.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' });
    fs.createReadStream(p).pipe(r);
  })
  .listen(PORT);
fs.mkdirSync(OUT, { recursive: true });
const results = [];
const ok = (name, cond, extra='') => { results.push([cond ? 'OK ' : 'FALHOU', name, extra]); };
(async () => {
  const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, reducedMotion: process.env.REDUZIR_MOVIMENTO ? 'reduce' : 'no-preference' });
  // Só para o roteiro: "outro aparelho" da mesma pessoa. Na demonstração, os dados ficam num repositório em memória; este
  // atalho acha a sessão e o QueryClient na árvore atual do React para gravar como outro aparelho faria (ou simular uma
  // falha de rede) e pedir às telas abertas que leiam de novo. Não muda nada no app.
  await ctx.addInitScript(() => {
    // O tour de boas-vindas (D-049) fica desligado em todo carregamento da página: os blocos antigos criam contas novas o tempo todo e
    // não esperam uma janela por cima do Resumo. O bloco "Tutorial (D-049)" liga o tour de propósito (window.__clarevoSemTour = false).
    window.__clarevoSemTour = true;
    const find = () => {
      const root = document.getElementById('root');
      const key = root && Object.keys(root).find((k) => k.startsWith('__reactContainer$'));
      const stack = key ? [root[key].stateNode.current] : [];
      let session = null;
      let client = null;
      while (stack.length > 0 && !(session && client)) {
        const f = stack.pop();
        const props = f.memoizedProps;
        if (props && typeof props === 'object') {
          const v = props.value;
          if (!session && v && typeof v === 'object' && 'repo' in v && 'auth' in v && 'user' in v) session = v;
          if (!client && props.client && typeof props.client.invalidateQueries === 'function') client = props.client;
        }
        if (f.sibling) stack.push(f.sibling);
        if (f.child) stack.push(f.child);
      }
      return { session, client };
    };
    window.__e2e = {
      // A conta de demonstração usa um repositório preparado de forma assíncrona (o da sessão é um intermediário).
      repo: async () => {
        const { session } = find();
        return session.user.email === 'demo@clarevo.app' ? await session.auth.demoRepo : session.repo;
      },
      refresh: () => find().client.invalidateQueries(),
    };
  });
  const p = await ctx.newPage();
  globalThis.__page = p;
  // Outro aparelho: roda fn(repo, contextId, arg) no repositório da pessoa e depois pede às telas abertas que leiam de novo.
  const otherDevice = (fn, arg = null) =>
    p.evaluate(
      async ({ src, arg }) => {
        const repo = await window.__e2e.repo();
        const space = await repo.getSpace();
        const out = await (0, eval)(`(${src})`)(repo, space.personalContextId, arg);
        await window.__e2e.refresh();
        return out;
      },
      { src: fn.toString(), arg },
    );
  // Nomes e descrições como o Chromium entrega aos leitores de tela (árvore de acessibilidade).
  const cdp = await ctx.newCDPSession(p);
  /**
   * Leitores de tela ouvem "2026 a 2027", nunca "2026/2027" (spec 1.7): nomes de botões, caixas, rádios, campos, títulos,
   * grupos e diálogos visíveis, e as descrições (dicas ligadas aos campos). Devolve o que ainda tem a barra.
   */
  const slashNames = async () => {
    const roles = new Set(['button', 'checkbox', 'radio', 'radiogroup', 'heading', 'link', 'textbox', 'dialog', 'alertdialog', 'alert', 'tab', 'progressbar', 'switch']);
    const { nodes } = await cdp.send('Accessibility.getFullAXTree');
    const slash = /\b\d{4}\/\d{4}\b/;
    return nodes
      .filter((n) => !n.ignored && roles.has(n.role?.value) && (slash.test(n.name?.value ?? '') || slash.test(n.description?.value ?? '')))
      .map((n) => `${n.role.value}: ${slash.test(n.name?.value ?? '') ? n.name.value : `(descrição) ${n.description.value}`}`.slice(0, 120));
  };
  const errors = []; p.on('pageerror', e => errors.push(e.message)); p.on('console', m => m.type()==='error' && errors.push(m.text().slice(0,200)));
  // Requisições de escrita (Ciclo A6: as calculadoras nunca gravam nada, nem pela rede).
  const writes = []; p.on('request', (r) => ['POST', 'PATCH', 'PUT', 'DELETE'].includes(r.method()) && writes.push(`${r.method()} ${r.url()}`));
  // Texto da tela, com o espaço não separável ("R$\u00a0900,00" nunca quebra a linha) lido como espaço comum.
  const body = async () => (await p.locator('body').innerText()).replace(/\u00a0/g, ' ');
  const btn = (name) => p.getByRole('button', { name, exact: true }).filter({ visible: true }).first();
  const field = (name) => p.getByLabel(name, { exact: true }).filter({ visible: true }).first();
  // Espera as transições terminarem antes de capturar.
  const shot = async (n, full=false) => { await p.waitForTimeout(450); await p.screenshot({ path: `${OUT}/${n}.png`, fullPage: full }); };
  const waitText = (t, timeout=8000) => p.getByText(t, { exact: false }).filter({ visible: true }).first().waitFor({ timeout });
  // Texto da tela no primeiro instante em que um texto aparece (leitura contínua, sem o intervalo de espera do Playwright):
  // mostra o que a tela exibe junto com uma faixa, antes de qualquer nova leitura de dados terminar.
  const firstBodyWith = async (text, timeout = 8000) => {
    for (const end = Date.now() + timeout; Date.now() < end;) { const t = await body(); if (t.includes(text)) return t; }
    return body();
  };
  // Espera um texto sumir (linhas saem com FadeOut); se não sumir, a conferência seguinte acusa.
  const waitGone = async (t, timeout=3000) => { for (const end = Date.now() + timeout; Date.now() < end && (await body()).includes(t);) await p.waitForTimeout(100); };
  const confirmIn = (name) => p.getByRole('dialog').or(p.getByRole('alert')).getByRole('button', { name }).last().click();
  const dialogText = async () => (await p.getByRole('dialog').or(p.getByRole('alert')).filter({ visible: true }).last().innerText()).replace(/\u00a0/g, ' ');
  const radio = (name) => p.getByRole('radio', { name, exact: true }).filter({ visible: true }).first();
  const visibleCount = (role, name) => p.getByRole(role, { name, exact: typeof name === 'string' }).filter({ visible: true }).count();
  // Seção da tela visível (card com título de nível 2): nomes acessíveis dos botões, na ordem; null se a seção não aparece.
  const sectionRows = (title) =>
    p.evaluate((title) => {
      const h = [...document.querySelectorAll('[role=heading][aria-level="2"]')].find((e) => e.textContent === title && e.getBoundingClientRect().width > 0);
      return h ? [...h.parentElement.querySelectorAll('[role=button]')].map((b) => b.getAttribute('aria-label') || b.textContent) : null;
    }, title);
  // Espera a lista de uma seção atender à condição; se não atender, a conferência seguinte acusa.
  const waitRows = async (title, pred, timeout = 3000) => { for (const end = Date.now() + timeout; Date.now() < end && !pred(await sectionRows(title));) await p.waitForTimeout(100); };
  // Espera uma condição qualquer (por exemplo, uma linha sair com FadeOut); se não acontecer, a conferência seguinte acusa.
  const waitUntil = async (pred, timeout = 3000) => { for (const end = Date.now() + timeout; Date.now() < end && !(await pred());) await p.waitForTimeout(100); };
  // Card com título visível (qualquer nível): nomes acessíveis dos botões do card, na ordem; null se o título não aparece.
  const cardButtons = (title) =>
    p.evaluate((title) => {
      const h = [...document.querySelectorAll('[role=heading]')].find((e) => e.textContent === title && e.getBoundingClientRect().width > 0);
      if (!h) return null;
      let box = h.parentElement;
      while (box && !box.querySelector('[role=button]')) box = box.parentElement;
      return box ? [...box.querySelectorAll('[role=button]')].filter((x) => x.getBoundingClientRect().width > 0).map((x) => x.getAttribute('aria-label') || x.textContent) : [];
    }, title);
  // Título visível com este texto exato (heading de qualquer nível).
  const headingShown = (title) => p.evaluate((title) => [...document.querySelectorAll('[role=heading],h1,h2,h3')].some((e) => e.textContent === title && e.getBoundingClientRect().width > 0), title);
  // Nome acessível do título da tela (h1 visível): aria-label, se houver, ou o próprio texto.
  const h1Name = () => p.evaluate(() => { const h = [...document.querySelectorAll('h1')].find((e) => e.getBoundingClientRect().width > 0); return h ? h.getAttribute('aria-label') || h.textContent : null; });
  // Termos proibidos (spec2 §5, como em copy.test.ts) e travessões longos, conferidos no texto das telas novas.
  // A expressão proibida é montada por partes para não aparecer escrita aqui.
  const FORBIDDEN = new RegExp(
    '\\b(recomendamos|recomendo|invista|aplique|tesouro|cdb|lci|lca|caixinha|cofrinho)\\b|fundo de investimento|rentabilidade garantida|' +
      'rendimento garantido|retorno garantido|enriquec|' + ['faz(er|endo)?', 'sentido'].join('\\s+') + '|[\\u2013\\u2014]',
    'i',
  );
  // Rola até um texto (as telas rolam dentro de uma área própria, e a captura de página inteira mostra só o topo).
  const scrollTo = async (text) => {
    await p.getByText(text, { exact: true }).filter({ visible: true }).first().evaluate((e) => e.scrollIntoView({ block: 'start' }));
    await p.waitForTimeout(200);
  };
  const screenTexts = [];
  const keepText = async () => { screenTexts.push(await body()); };
  // Símbolo C aberto (docs/marca): só ícone do app e abertura, nunca nas telas (D-022).
  const symbolCount = () => p.evaluate(() => [...document.querySelectorAll('path')].filter((e) => e.getBoundingClientRect().width > 0 && (e.getAttribute('d') || '').startsWith('M186 0C232')).length);
  // Logotipo "clarevo." (D-022) no cabeçalho azul das abas: imagem "Clarevo" no alto, nome branco e ponto lima.
  const logoChecks = async (name) => {
    const r = await p.evaluate(() => {
      const logos = [...document.querySelectorAll('[role=img][aria-label="Clarevo"]')].filter((e) => e.getBoundingClientRect().width > 0);
      const logo = logos[0];
      let bg = null;
      for (let e = logo?.parentElement; e && !bg; e = e.parentElement) { const c = getComputedStyle(e).backgroundColor; if (c !== 'rgba(0, 0, 0, 0)') bg = c; }
      return { n: logos.length, top: logo ? Math.round(logo.getBoundingClientRect().top) : -1, fills: logo ? [...logo.querySelectorAll('path, circle')].map((x) => (x.getAttribute('fill') || '').toUpperCase()).join(' ') : '', bg };
    });
    const symbols = await symbolCount();
    ok(name, r.n === 1 && r.top >= 0 && r.top < 120 && r.fills === '#FFFFFF #D4F05B' && r.bg === 'rgb(36, 87, 245)' && symbols === 0, `${JSON.stringify(r)} símbolo=${symbols}`);
  };
  // Sem transbordamento horizontal, valores em reais inteiros e alvos de toque (botões, abas, chips e caixas) com 44 px.
  const layoutChecks = async (prefix) => {
    const overflow = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    const small = await p.evaluate(() => [...document.querySelectorAll('[role=button],[role=tab],[role=radio],[role=checkbox],button')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.height < 43.5; }).map(e => (e.getAttribute('aria-label') || e.textContent || '').slice(0,30)));
    ok(`${prefix} sem transbordamento`, !overflow);
    // Também dentro das áreas com rolagem (a página não rola de lado, mas um chip largo empurraria o conteúdo).
    const outside = await p.evaluate(() => [...document.querySelectorAll('body *')].filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0 && (b.right > window.innerWidth + 0.5 || b.left < -0.5); }).map((e) => `${(e.getAttribute('aria-label') || e.textContent || e.tagName).slice(0, 40)} [${Math.round(e.getBoundingClientRect().left)}-${Math.round(e.getBoundingClientRect().right)} ${getComputedStyle(e).position} de ${window.innerWidth}]`));
    ok(`${prefix}: nada passa da largura da tela`, outside.length === 0, outside.slice(0, 3).join(' | '));
    const cut = await p.evaluate(() => [...document.querySelectorAll('div[dir="auto"], span')].filter((e) => /R\$/.test(e.textContent || '') && e.children.length === 0 && e.getBoundingClientRect().width > 0 && e.scrollWidth > e.clientWidth + 1).map((e) => e.textContent));
    ok(`${prefix}: nenhum valor em reais cortado`, cut.length === 0, cut.join(' | '));
    // "R$" (e "≈") nunca ficam sozinhos no fim da linha: o espaço até o valor não quebra.
    const loose = await p.evaluate(() => [...document.querySelectorAll('div[dir="auto"], span')].filter((e) => e.getBoundingClientRect().width > 0 && [...e.childNodes].some((n) => n.nodeType === 3 && /R\$ (\d|$)|≈ /.test(n.textContent))).map((e) => e.textContent.slice(0, 40)));
    ok(`${prefix}: "R$" junto do valor`, loose.length === 0, loose.slice(0, 3).join(' | '));
    ok(`${prefix}: alvos de toque ≥ 44 px`, small.length === 0, small.join(' | '));
    const avatarOut = await p.evaluate(() => [...document.querySelectorAll('[aria-label^="Conta: perfil"]')].filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && (b.left < -0.5 || b.right > window.innerWidth + 0.5); }).length);
    ok(`${prefix}: avatar da conta inteiro na tela`, avatarOut === 0);
  };
  // Cabeçalho das telas internas: nenhum h1 cortado (altura ou largura) e uma pílula de contexto inteira na tela.
  const headerChecks = async (prefix) => {
    const r = await p.evaluate(() => {
      const shown = (e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0; };
      const cut = [...document.querySelectorAll('h1')].filter(shown).filter((e) => e.scrollHeight > e.clientHeight + 1 || e.scrollWidth > e.clientWidth + 1).map((e) => e.textContent);
      const pills = [...document.querySelectorAll('[aria-label^="Contexto:"]')].filter(shown);
      const outside = pills.filter((e) => { const b = e.getBoundingClientRect(); return b.left < 0 || b.right > window.innerWidth + 0.5; }).map((e) => e.getAttribute('aria-label'));
      return { cut, h1: [...document.querySelectorAll('h1')].filter(shown).length, pills: pills.length, outside };
    });
    ok(`${prefix}: título inteiro e contexto visível`, r.h1 === 1 && r.cut.length === 0 && r.pills === 1 && r.outside.length === 0, `h1=${r.h1} pílulas=${r.pills} ${[...r.cut, ...r.outside].join(' | ')}`);
  };
  // Telas internas novas (Ciclo A): cabeçalho, largura e nenhum símbolo C (D-022).
  const innerChecks = async (prefix) => {
    await headerChecks(prefix);
    await layoutChecks(prefix);
    ok(`${prefix}: sem o símbolo C`, (await symbolCount()) === 0);
  };
  // Ciclo A4: faixa "Seus últimos meses" no Resumo e os títulos visíveis da tela (nível e texto), na ordem.
  const bandShown = () => headingShown('Seus últimos meses');
  const headingList = () => p.evaluate(() => [...document.querySelectorAll('[role=heading]')].filter((e) => e.getBoundingClientRect().width > 0).map((e) => `${e.getAttribute('aria-level')}:${e.textContent}`));
  let t;

  // ==================================================================================================================
  // Tutorial (D-049) · docs/08 §5 item 15, pedido de Enzo em 11/10/2026 ("um tutorial de uso do app, com as funcionalidades, onde
  // encontrar, como utilizar"). Quatro partes, todas sobre o mesmo catálogo do core (packages/core/src/guide): (1) o guia em Aprender ›
  // Como usar o Clarevo, com a lista por grupos e as entradas ("Para que serve", "Onde fica", "Como usar" e "Abrir {tela}"); (2) o tour
  // de cinco cartões na primeira entrada, uma vez por pessoa em cada aparelho, sempre pulável e acessível; (3) o botão "?" no cabeçalho
  // das telas listadas, com a folha "Como usar" e "Ver no guia"; (4) o manual gerado do mesmo catálogo (scripts/gerar-manual.js).
  // O roteiro desliga o tour a cada carregamento da página (window.__clarevoSemTour, ver o início), para os outros blocos não precisarem
  // pulá-lo; aqui ele é ligado de propósito nas contas novas e na demonstração.
  // ==================================================================================================================
  const j1Writes0 = writes.length;
  const j1Texts = [];
  const j1Keep = async () => { const s = await body(); j1Texts.push(s); screenTexts.push(s); return s; };
  const j1Path = () => new URL(p.url()).pathname;
  const j1Widths = async (fn) => {
    for (const [w, h] of [[390, 844], [320, 800]]) { await p.setViewportSize({ width: w, height: h }); await p.waitForTimeout(450); await fn(w); }
    await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(350);
  };
  const j1TourOn = () => p.evaluate(() => { window.__clarevoSemTour = false; });
  const j1TOUR = 'Primeiros passos no Clarevo';
  const j1Dialog = (name) => p.getByRole('dialog', { name, exact: true }).filter({ visible: true });
  const j1Tab = (name) => p.getByRole('tab', { name, exact: true }).filter({ visible: true }).first();
  const j1Demo = async (query = '') => {
    await p.goto(`http://localhost:${PORT}/${query}`); await waitText('Seu dinheiro');
    await btn('Ver demonstração com dados fictícios').click(); await waitText('Diferença do mês');
    await waitText('Ainda a pagar neste mês', 12000).catch(() => {}); await p.waitForTimeout(500);
  };
  // Conta nova com o tour ligado (a página recarrega e o roteiro o desligaria): a marca é desfeita antes de entrar no Resumo.
  const j1NewAccount = async (name, email) => {
    await p.goto(`http://localhost:${PORT}/`); await waitText('Seu dinheiro'); await j1TourOn();
    await btn('Criar conta').click(); await waitText('Nome de apresentação');
    await field('Nome de apresentação').fill(name); await field('E-mail').fill(email); await field('Senha').fill('senha1234');
    await btn('Criar conta').click(); await waitText('Confira seu e-mail');
    await btn('Simular abertura do link').click(); await btn('Já confirmei meu e-mail').click(); await waitText('Sua primeira conta');
    await btn('Começar meu mês').click(); await waitText('Diferença do mês');
  };
  // O que a janela do tour mostra: título (h2), posição, botões e se o foco está dentro dela.
  const j1TourState = () => p.evaluate((label) => {
    const vis = (e) => e.getBoundingClientRect().width > 0;
    const dlg = [...document.querySelectorAll('[role=dialog]')].find((e) => e.getAttribute('aria-label') === label && vis(e));
    if (!dlg) return null;
    const heading = [...dlg.querySelectorAll('[role=heading]')].find(vis);
    const buttons = [...dlg.querySelectorAll('[role=button]')].filter(vis);
    const live = [...dlg.querySelectorAll('[aria-live="polite"]')].map((e) => e.textContent).filter(Boolean);
    return {
      title: heading ? heading.textContent : null, level: heading ? heading.getAttribute('aria-level') : null,
      buttons: buttons.map((b) => b.getAttribute('aria-label') || b.textContent), minH: Math.round(Math.min(...buttons.map((b) => b.getBoundingClientRect().height))),
      text: dlg.innerText.replace(/\u00a0/g, ' '), live, modal: dlg.getAttribute('aria-modal'), focusInside: dlg.contains(document.activeElement),
    };
  }, j1TOUR);
  const j1TourGone = async () => { await j1Dialog(j1TOUR).first().waitFor({ state: 'hidden', timeout: 4000 }).catch(() => {}); return (await j1Dialog(j1TOUR).count()) === 0; };
  const j1Next = async () => { await j1Dialog(j1TOUR).getByRole('button', { name: /^(Próximo|Começar)$/ }).first().click(); await p.waitForTimeout(250); };
  const j1Baseline = ['2:Outubro de 2026', '2:Primeiros passos', '2:Pagamentos do mês'];

  // ---- 1. Conta nova: o tour abre sozinho no Resumo, com cinco cartões, "Pular" e "Próximo" (no fim, "Começar") ----
  await j1NewAccount('Jo Tutorial', 'jo@exemplo.com');
  await j1Dialog(j1TOUR).first().waitFor({ timeout: 8000 });
  let j1s = await j1TourState();
  ok('Tutorial tour: a janela tem o nome "Primeiros passos no Clarevo", é modal, mostra o cartão 1 de 5 ("Resumo do mês") com título de nível 2, "Pular" e "Próximo", sem "Começar"',
    j1s !== null && j1s.modal === 'true' && j1s.title === 'Resumo do mês' && j1s.level === '2' && j1s.text.includes('1 de 5') && j1s.buttons.includes('Pular') && j1s.buttons.includes('Próximo') && !j1s.buttons.includes('Começar') &&
    j1s.text.includes('Veja o que você recebeu, o que pagou e o que ainda vai vencer no mês.'), JSON.stringify(j1s));
  ok('Tutorial tour: o foco já está dentro da janela e os botões têm 44 px ou mais', j1s !== null && j1s.focusInside && j1s.minH >= 44, JSON.stringify(j1s));
  await j1Keep();
  await j1Widths(async (w) => { await layoutChecks(`tutorial tour cartão 1 ${w}px`); await shot(w === 390 ? '340_tour_1_resumo' : '340_tour_1_resumo_320px'); });
  const j1Cards = [
    ['Anotar um gasto', '2 de 5', 'Toque em Anotar gasto para registrar o que você pagou.'],
    ['Contas a pagar e lembretes', '3 de 5', 'Anote as contas que ainda vão vencer e toque em Já paguei na hora de pagar.'],
    ['Metas e calculadoras', '4 de 5', 'Em Metas, acompanhe o que você guarda e veja um plano.'],
    ['Onde achar ajuda', '5 de 5', 'Em Aprender › Como usar o Clarevo, cada função tem o passo a passo.'],
  ];
  for (const [i, [title, pos, text]] of j1Cards.entries()) {
    await j1Next();
    j1s = await j1TourState();
    const last = i === j1Cards.length - 1;
    ok(`Tutorial tour: cartão ${pos} "${title}", com a posição, o texto e ${last ? '"Começar" no lugar de "Próximo"' : '"Pular" e "Próximo"'}`,
      j1s !== null && j1s.title === title && j1s.text.includes(pos) && j1s.text.includes(text) && j1s.buttons.includes('Pular') && (last ? j1s.buttons.includes('Começar') && !j1s.buttons.includes('Próximo') : j1s.buttons.includes('Próximo') && !j1s.buttons.includes('Começar')) && j1s.focusInside,
      JSON.stringify(j1s));
    ok(`Tutorial tour: a troca para o cartão ${pos} é anunciada na região viva ("Cartão ${pos}. ${title}.")`, j1s !== null && j1s.live.includes(`Cartão ${pos}. ${title}.`), JSON.stringify(j1s?.live));
    await j1Keep();
    await j1Widths(async (w) => { await layoutChecks(`tutorial tour cartão ${i + 2} ${w}px`); if (w === 390) await shot(`34${i + 1}_tour_${i + 2}_${['anotar', 'contas', 'metas', 'ajuda'][i]}`); if (last && w === 320) await shot('344_tour_5_ajuda_320px'); });
  }
  await j1Next();
  ok('Tutorial tour: "Começar" fecha a janela', await j1TourGone());
  ok('Tutorial tour: o Resumo não muda (os títulos, "Primeiros passos" e "Anotar gasto" continuam como antes)', JSON.stringify(await headingList()) === JSON.stringify(j1Baseline) && (await visibleCount('button', 'Anotar gasto')) === 1, JSON.stringify(await headingList()));
  await j1Tab('Movimentos: movimentações do mês').click(); await waitText('Registrar recebimento'); await p.waitForTimeout(500);
  await j1Tab('Resumo').click(); await waitText('Diferença do mês'); await p.waitForTimeout(900);
  ok('Tutorial tour: uma vez só (não volta ao trocar de aba e voltar ao Resumo)', await j1TourGone());

  // ---- 2. "Ver o tour de novo" no guia: mostra os cinco cartões outra vez, mesmo já visto ----
  await j1Tab('Aprender e dúvidas').click(); await waitText('Comece por aqui');
  await p.getByRole('button', { name: 'Como usar o Clarevo. Onde fica cada função e como usar, passo a passo.', exact: true }).filter({ visible: true }).first().click(); await waitText('Ver o tour de novo');
  await btn('Ver o tour de novo').click(); await j1Dialog(j1TOUR).first().waitFor({ timeout: 6000 });
  j1s = await j1TourState();
  ok('Tutorial tour: "Ver o tour de novo" abre o cartão 1 de 5 depois de já visto', j1s !== null && j1s.title === 'Resumo do mês' && j1s.text.includes('1 de 5'), JSON.stringify(j1s));
  await j1Dialog(j1TOUR).getByRole('button', { name: 'Pular', exact: true }).click();
  ok('Tutorial tour: "Pular" fecha o tour revisto, e o guia continua aberto', (await j1TourGone()) && j1Path() === '/aprender/guia' && (await h1Name()) === 'Como usar o Clarevo');

  // ---- 3. Outra conta nova: "Pular" no primeiro cartão fecha e o tour não volta; Esc também pula; o foco fica na janela ----
  await j1NewAccount('Kai Tutorial', 'kai@exemplo.com');
  await j1Dialog(j1TOUR).first().waitFor({ timeout: 8000 });
  await j1Dialog(j1TOUR).getByRole('button', { name: 'Pular', exact: true }).click();
  ok('Tutorial tour: "Pular" no cartão 1 fecha a janela e o Resumo fica como antes', (await j1TourGone()) && JSON.stringify(await headingList()) === JSON.stringify(j1Baseline), JSON.stringify(await headingList()));
  await j1Tab('Metas').click(); await waitText('Você consegue guardar algum valor por mês?'); await j1Tab('Resumo').click(); await waitText('Diferença do mês'); await p.waitForTimeout(900);
  ok('Tutorial tour: depois de "Pular", não volta ao passar por outras abas', await j1TourGone());
  await j1NewAccount('Lia Tutorial', 'lia@exemplo.com');
  await j1Dialog(j1TOUR).first().waitFor({ timeout: 8000 });
  const j1Focus = [];
  for (let i = 0; i < 6; i++) { await p.keyboard.press('Tab'); j1Focus.push((await j1TourState())?.focusInside === true); }
  ok('Tutorial tour: o Tab fica preso na janela (seis toques, o foco nunca sai dela)', j1Focus.every(Boolean), JSON.stringify(j1Focus));
  await p.keyboard.press('Escape');
  ok('Tutorial tour: Esc pula o tour', await j1TourGone());
  await j1Tab('Aprender e dúvidas').click(); await waitText('Comece por aqui'); await j1Tab('Resumo').click(); await waitText('Diferença do mês'); await p.waitForTimeout(700);
  ok('Tutorial tour: depois de Esc, não volta', await j1TourGone());

  // ---- 4. Demonstração: o tour também abre (sempre pulável); a demonstração não muda ----
  await p.goto(`http://localhost:${PORT}/`); await waitText('Seu dinheiro'); await j1TourOn();
  await btn('Ver demonstração com dados fictícios').click(); await waitText('Diferença do mês');
  await j1Dialog(j1TOUR).first().waitFor({ timeout: 8000 }).catch(() => {});
  j1s = await j1TourState();
  ok('Tutorial tour: na demonstração o tour também abre, com "Pular"', j1s !== null && j1s.title === 'Resumo do mês' && j1s.buttons.includes('Pular'), JSON.stringify(j1s));
  await j1Dialog(j1TOUR).getByRole('button', { name: 'Pular', exact: true }).click();
  ok('Tutorial tour: a demonstração segue com os títulos de sempre', (await j1TourGone()) && JSON.stringify(await headingList()) === JSON.stringify(['2:Outubro de 2026', '2:Pagamentos do mês']), JSON.stringify(await headingList()));

  // ---- 5. Nunca sobre "Seus últimos meses" (D-030) nem sobre formulários ----
  await p.goto(`http://localhost:${PORT}/?cenario=retorno`); await waitText('Seu dinheiro'); await j1TourOn();
  await btn('Ver demonstração com dados fictícios').click(); await waitText('Diferença do mês');
  await waitText('Sua última anotação foi em 20/05/2026.', 12000).catch(() => {}); await p.waitForTimeout(1500);
  ok('Tutorial tour: com a faixa "Seus últimos meses" no Resumo, o tour não abre', (await headingShown('Seus últimos meses')) && (await j1Dialog(j1TOUR).count()) === 0);
  await btn('Seguir adiante').click(); await waitText('Combinado.'); await p.waitForTimeout(1200);
  ok('Tutorial tour: nem logo depois de a faixa sair (a faixa foi vista neste Resumo)', !(await headingShown('Seus últimos meses')) && (await j1Dialog(j1TOUR).count()) === 0);
  await p.goto(`http://localhost:${PORT}/registro/novo?tipo=despesa`); await waitText('Seu dinheiro'); await j1TourOn();
  await btn('Criar conta').click(); await waitText('Nome de apresentação');
  await field('Nome de apresentação').fill('Noa Tutorial'); await field('E-mail').fill('noa@exemplo.com'); await field('Senha').fill('senha1234');
  await btn('Criar conta').click(); await waitText('Confira seu e-mail');
  await btn('Simular abertura do link').click(); await btn('Já confirmei meu e-mail').click(); await waitText('Sua primeira conta');
  await btn('Começar meu mês').click(); await waitText('Será salvo em', 12000); await p.waitForTimeout(1200);
  ok('Tutorial tour: com o formulário "Anotar gasto" aberto pelo endereço, o tour não abre sobre ele', j1Path() === '/registro/novo' && (await j1Dialog(j1TOUR).count()) === 0, p.url());
  await btn('Cancelar').click(); await waitText('Diferença do mês'); await j1Dialog(j1TOUR).first().waitFor({ timeout: 8000 }).catch(() => {});
  ok('Tutorial tour: ao voltar ao Resumo, o tour aparece (ainda não visto)', (await j1TourState())?.title === 'Resumo do mês');
  await j1Dialog(j1TOUR).getByRole('button', { name: 'Pular', exact: true }).click(); await j1TourGone();

  // ---- 6. Aprender: o card "Como usar o Clarevo" no topo, antes das calculadoras ----
  await j1Demo();
  await j1Tab('Aprender e dúvidas').click(); await waitText('Comece por aqui'); await p.waitForTimeout(400);
  const j1First = await p.evaluate(() => {
    const top = (e) => e.getBoundingClientRect().top;
    const shown = [...document.querySelectorAll('[role=button]')].filter((e) => e.getBoundingClientRect().width > 0 && !/^Conta:/.test(e.getAttribute('aria-label') || ''));
    return shown.filter((e) => !e.closest('[role=tablist]')).sort((a, b) => top(a) - top(b)).slice(0, 2).map((e) => e.getAttribute('aria-label') || e.textContent);
  });
  const j1H2 = await p.evaluate(() => [...document.querySelectorAll('h2, [role=heading][aria-level="2"]')].filter((e) => e.getBoundingClientRect().width > 0).map((e) => e.textContent));
  ok('Tutorial Aprender: o card "Como usar o Clarevo" é o primeiro botão, e o card "Calculadoras" vem logo depois', j1First[0] === 'Como usar o Clarevo. Onde fica cada função e como usar, passo a passo.' &&
    j1First[1] === 'Calculadoras. Parcelado ou à vista, dívidas, reserva e outras contas com os seus números', JSON.stringify(j1First));
  ok('Tutorial Aprender: o card não é título (os títulos de Aprender seguem os mesmos)', JSON.stringify(j1H2) === JSON.stringify(['Comece por aqui', 'Usar o Clarevo', 'Organizar o mês', 'Juros e crédito', 'Dinheiro no tempo', 'Dúvidas frequentes']), JSON.stringify(j1H2));
  await j1Keep();
  await j1Widths(async (w) => { await layoutChecks(`tutorial aprender com o guia ${w}px`); await shot(w === 390 ? '320_aprender_como_usar' : '320_aprender_como_usar_320px'); });

  // ---- 7. A lista do guia: cinco grupos, vinte e oito entradas ----
  await p.getByRole('button', { name: 'Como usar o Clarevo. Onde fica cada função e como usar, passo a passo.', exact: true }).filter({ visible: true }).first().click(); await waitText('Ver o tour de novo');
  const j1Groups = () => p.evaluate(() => [...document.querySelectorAll('[role=heading][aria-level="2"]')].filter((h) => h.getBoundingClientRect().width > 0).map((h) => ({
    title: h.textContent, rows: [...h.parentElement.parentElement.querySelectorAll('[role=button]')].filter((b) => b.getBoundingClientRect().width > 0).map((b) => b.getAttribute('aria-label') || b.textContent) })));
  const j1G = await j1Groups();
  ok('Tutorial guia: /aprender/guia com o título "Como usar o Clarevo", a barra inferior (Aprender marcada) e o botão "Ver o tour de novo"', j1Path() === '/aprender/guia' && (await h1Name()) === 'Como usar o Clarevo' &&
    (await p.getByRole('tab', { name: 'Aprender e dúvidas', selected: true }).filter({ visible: true }).count()) === 1 && (await visibleCount('button', 'Ver o tour de novo')) === 1);
  ok('Tutorial guia: cinco grupos nesta ordem (Dia a dia, Contas e cartões, Planejar, Aprender e ajuda, Conta e privacidade), com 7, 7, 8, 2 e 4 entradas', JSON.stringify(j1G.map((g) => g.title)) === JSON.stringify(['Dia a dia', 'Contas e cartões', 'Planejar', 'Aprender e ajuda', 'Conta e privacidade']) &&
    JSON.stringify(j1G.map((g) => g.rows.length)) === JSON.stringify([7, 7, 8, 2, 4]), JSON.stringify(j1G.map((g) => [g.title, g.rows.length])));
  const j1Rows = j1G.flatMap((g) => g.rows);
  ok('Tutorial guia: cada linha tem o nome acessível "{título}. {para que serve}" (as funções novas: Buscar, Exportar e Importar)', j1Rows.length === 28 &&
    j1Rows.includes('Buscar em Movimentos. Acha um gasto ou recebimento em todos os meses e mostra quanto deu no período.') &&
    j1Rows.includes('Exportar meus dados. Leva seus gastos e recebimentos para uma planilha (CSV) ou para um resumo em PDF, montado neste aparelho.') &&
    j1Rows.some((r) => r.startsWith('Importar extrato ou fatura. Traz gastos, recebimentos e compras no cartão de um arquivo do banco')) &&
    j1Rows.includes('Cartões e faturas. Cadastra seus cartões de crédito para anotar as compras na fatura.'), JSON.stringify(j1Rows.slice(0, 3)));
  await j1Keep();
  await j1Widths(async (w) => { await layoutChecks(`tutorial guia lista ${w}px`); await shot(w === 390 ? '321_guia_lista' : '321_guia_lista_320px'); });

  // ---- 8. Uma entrada: "Para que serve", "Onde fica", "Como usar" e "Abrir Cartões" ----
  const j1Entry = (title) => p.getByRole('button', { name: new RegExp(`^${title.replace(/[?().]/g, '\\$&')}\\. `) }).filter({ visible: true }).first();
  const j1H2s = () => p.evaluate(() => [...document.querySelectorAll('[role=heading][aria-level="2"]')].filter((h) => h.getBoundingClientRect().width > 0).map((h) => h.textContent));
  await j1Entry('Cartões e faturas').click(); await waitText('Para que serve');
  let j1e = await j1Keep();
  ok('Tutorial guia: a entrada "Cartões e faturas" (/aprender/guia/cartoes) com o título, as três seções, o caminho "Movimentos › Organizar › Cartões" e seis passos', j1Path() === '/aprender/guia/cartoes' && (await h1Name()) === 'Cartões e faturas' &&
    JSON.stringify(await j1H2s()) === JSON.stringify(['Para que serve', 'Onde fica', 'Como usar']) && j1e.includes('Movimentos › Organizar › Cartões') && (await p.locator('[aria-label^="Passo "]').filter({ visible: true }).count()) === 6 &&
    j1e.includes('Cadastra seus cartões de crédito para anotar as compras na fatura.') && (await visibleCount('button', 'Abrir Cartões')) === 1, `${j1Path()} ${JSON.stringify(await j1H2s())}`);
  await j1Widths(async (w) => { await layoutChecks(`tutorial guia entrada ${w}px`); await shot(w === 390 ? '322_guia_entrada' : '322_guia_entrada_320px'); });
  await btn('Abrir Cartões').click(); await waitText('Cadastrar cartão');
  ok('Tutorial guia: "Abrir Cartões" abre a tela de Cartões (/cartoes), com o botão "?"', j1Path() === '/cartoes' && (await h1Name()) === 'Cartões' && (await visibleCount('button', 'Como usar esta tela')) === 1);
  await btn('Voltar').click(); await waitText('Para que serve');
  ok('Tutorial guia: voltar da tela aberta devolve a entrada', j1Path() === '/aprender/guia/cartoes');
  await btn('Voltar').click(); await waitText('Ver o tour de novo');

  // As três funções novas (Buscar, Exportar, Importar) e as abas (Metas, Resumo): o caminho e o botão "Abrir {tela}" levam à tela certa.
  const j1Open = [
    ['Buscar em Movimentos', 'Buscar em Movimentos', 'Movimentos › Buscar', 'Abrir Buscar', '/movimentacoes/buscar', 'Buscar'],
    ['Exportar meus dados', 'Exportar meus dados', 'Conta › Exportar meus dados', 'Abrir Exportar meus dados', '/conta/exportar', 'Exportar meus dados'],
    ['Importar extrato ou fatura', 'Importar extrato ou fatura', 'Movimentos › Organizar › Importar extrato ou fatura', 'Abrir Importar extrato ou fatura', '/importar', 'Importar extrato ou fatura'],
    ['Plano de guardar', 'Plano de guardar', 'Metas › Você consegue guardar algum valor por mês?', 'Abrir Metas', '/metas', null],
    ['Resumo do mês', 'Resumo do mês', 'Resumo', 'Abrir Resumo', '/', null],
  ];
  for (const [row, h1, where, open, path, target] of j1Open) {
    await j1Entry(row).click(); await waitText('Para que serve');
    const txt = await body();
    ok(`Tutorial guia: "${h1}" mostra "Onde fica: ${where}" e o botão "${open}"`, (await h1Name()) === h1 && txt.includes(where) && (await visibleCount('button', open)) === 1, `${await h1Name()} ${where}`);
    await btn(open).click(); await p.waitForTimeout(900);
    ok(`Tutorial guia: "${open}" abre ${path}${target ? ` ("${target}")` : ''}`, j1Path() === path && (target === null || (await h1Name()) === target), `${j1Path()} ${await h1Name()}`);
    if (j1Path() === '/importar') await btn('Voltar').click();
    // De volta à lista: a aba Aprender e o card do guia (as abas não deixam a entrada na pilha).
    for (let i = 0; i < 6 && (await p.getByRole('tab', { name: 'Aprender e dúvidas' }).filter({ visible: true }).count()) === 0; i++) { await btn('Voltar').click(); await p.waitForTimeout(400); }
    await j1Tab('Aprender e dúvidas').click(); await waitText('Comece por aqui'); await p.waitForTimeout(300);
    await p.getByRole('button', { name: 'Como usar o Clarevo. Onde fica cada função e como usar, passo a passo.', exact: true }).filter({ visible: true }).first().click(); await waitText('Ver o tour de novo');
  }
  await j1Entry('Importar extrato ou fatura').click(); await waitText('Também em');
  ok('Tutorial guia: "Importar extrato ou fatura" tem "Também em: Conta › Suas contas › Importar extrato"', (await body()).includes('Conta › Suas contas › Importar extrato'));
  await btn('Voltar').click(); await waitText('Ver o tour de novo');

  // As calculadoras, cada uma em uma linha, e a lista abre a calculadora.
  await j1Entry('Calculadoras').click(); await waitText('Uma por uma');
  const j1Calc = await p.evaluate(() => { const h = [...document.querySelectorAll('[role=heading][aria-level="2"]')].find((e) => e.textContent === 'Uma por uma' && e.getBoundingClientRect().width > 0); return h ? [...h.parentElement.querySelectorAll('[role=button]')].filter((b) => b.getBoundingClientRect().width > 0).map((b) => b.getAttribute('aria-label')) : null; });
  ok('Tutorial guia: "Calculadoras" lista as dez calculadoras, cada uma em uma linha, com título e legenda', j1Calc !== null && j1Calc.length === 10 && j1Calc[0] === 'Antes de financiar. Parcela, juros e o que muda se juntar antes' &&
    j1Calc.includes('Em que ordem quitar as dívidas? Duas ordens de pagamento, lado a lado') && j1Calc.includes('Quanto custa por ano? Assinaturas e gastos que se repetem'), JSON.stringify(j1Calc));
  await shot('323_guia_entrada_calculadoras');
  await p.getByRole('button', { name: /^Quanto custa por ano\? / }).filter({ visible: true }).first().click(); await waitText('Hipóteses').catch(() => {}); await p.waitForTimeout(500);
  ok('Tutorial guia: a linha "Quanto custa por ano?" abre a calculadora (/calcular/custo-por-ano)', j1Path() === '/calcular/custo-por-ano', j1Path());
  await btn('Voltar').click(); await waitText('Uma por uma'); await btn('Voltar').click(); await waitText('Ver o tour de novo');

  // ---- 9. Endereços do guia abertos direto (ENTRY_PATH) e entrada que não existe ----
  await p.goto(`http://localhost:${PORT}/aprender/guia/cartoes`); await waitText('Seu dinheiro');
  await btn('Ver demonstração com dados fictícios').click(); await waitText('Para que serve', 12000); await p.waitForTimeout(400);
  ok('Tutorial guia: o endereço /aprender/guia/cartoes aberto direto, depois de entrar, mostra a entrada', j1Path() === '/aprender/guia/cartoes' && (await h1Name()) === 'Cartões e faturas', p.url());
  await p.goto(`http://localhost:${PORT}/aprender/guia/nao-existe`); await waitText('Seu dinheiro');
  await btn('Ver demonstração com dados fictícios').click(); await waitText('Esta função não está no guia.', 12000);
  ok('Tutorial guia: uma entrada que não existe mostra "Esta função não está no guia." com "Ver o guia"', (await visibleCount('button', 'Ver o guia')) === 1);
  await btn('Ver o guia').click(); await waitText('Ver o tour de novo');
  ok('Tutorial guia: "Ver o guia" abre a lista', j1Path() === '/aprender/guia');

  // ---- 10. A busca de Aprender inclui as entradas do guia (grupo "Como usar") ----
  await j1Tab('Aprender e dúvidas').click(); await waitText('Comece por aqui'); await p.waitForTimeout(300);
  const j1Box = () => p.getByLabel('Buscar um tema ou uma função', { exact: true }).filter({ visible: true }).first();
  const j1Store = () => p.evaluate(() => JSON.stringify([Object.entries(localStorage), Object.entries(sessionStorage)]));
  const j1StoreBefore = await j1Store();
  const j1ReqBefore = writes.length;
  await j1Box().fill('cartão'); await waitText('Como usar'); await p.waitForTimeout(700);
  const j1Group = await p.evaluate(() => { const h = [...document.querySelectorAll('[role=heading]')].find((e) => e.textContent === 'Como usar' && e.getBoundingClientRect().width > 0); return h ? { level: h.getAttribute('aria-level') } : null; });
  const j1Live = await p.evaluate(() => [...document.querySelectorAll('[aria-live="polite"]')].map((e) => e.textContent).filter(Boolean));
  ok('Tutorial busca: "cartão" mostra o grupo "Como usar" (título de nível 2) com "Cartões e faturas", ao lado de "No app" e dos temas', j1Group !== null && j1Group.level === '2' && (await visibleCount('heading', 'No app')) === 1 &&
    (await visibleCount('button', /^Como usar Cartões e faturas\. Cadastra seus cartões de crédito/)) === 1 && (await visibleCount('button', /^Cartões\. Cartões de crédito, faturas/)) === 1, JSON.stringify(j1Group));
  ok('Tutorial busca: a contagem anunciada inclui "1 guia para "cartão""', j1Live.some((x) => /\d+ temas? para "cartão"\. \d+ telas? do app para "cartão"\. 1 guia para "cartão"$/.test(x)), JSON.stringify(j1Live));
  await j1Keep();
  await j1Widths(async (w) => { await layoutChecks(`tutorial busca como usar ${w}px`); if (w === 390) await shot('331_aprender_busca_como_usar'); });
  await j1Box().fill('exportar'); await p.waitForTimeout(500);
  ok('Tutorial busca: "exportar" acha "Exportar meus dados" em "Como usar" e em "No app"', (await visibleCount('button', /^Como usar Exportar meus dados\. /)) === 1 && (await visibleCount('button', /^Exportar meus dados\. Planilha \(CSV\)/)) === 1);
  await j1Box().fill('buscar'); await p.waitForTimeout(500);
  ok('Tutorial busca: "buscar" acha "Buscar em Movimentos" em "Como usar"', (await visibleCount('button', /^Como usar Buscar em Movimentos\. /)) === 1);
  await j1Box().fill('importar'); await p.waitForTimeout(500);
  ok('Tutorial busca: "importar" acha "Importar extrato ou fatura" em "Como usar"', (await visibleCount('button', /^Como usar Importar extrato ou fatura\. /)) === 1);
  await j1Box().fill('juros'); await waitText('temas para "juros"'); await p.waitForTimeout(400);
  ok('Tutorial busca: "juros" continua só com temas e telas, sem o grupo "Como usar"', !(await headingShown('Como usar')));
  await j1Box().fill('zzzzzz'); await waitText('Nenhum tema encontrado'); await p.waitForTimeout(300);
  ok('Tutorial busca: sem resultado, só a mensagem de sempre (sem "Como usar" nem "No app")', !(await headingShown('Como usar')) && !(await headingShown('No app')));
  await j1Box().fill('cartão'); await waitText('Como usar'); await p.waitForTimeout(400);
  await p.getByRole('button', { name: /^Como usar Cartões e faturas\. / }).filter({ visible: true }).first().click(); await waitText('Para que serve');
  ok('Tutorial busca: tocar na linha do guia abre a entrada (/aprender/guia/cartoes)', j1Path() === '/aprender/guia/cartoes' && (await h1Name()) === 'Cartões e faturas');
  await btn('Voltar').click(); await waitText('Buscar um tema ou uma função');
  await j1Box().fill('');
  ok('Tutorial busca: a busca e o guia não gravam nada (nenhuma requisição de escrita, nada no aparelho)', (await j1Store()) === j1StoreBefore && writes.length === j1ReqBefore, `${writes.length - j1ReqBefore} gravações`);

  // ---- 11. O botão "?" nas telas listadas: nome acessível, alvo de 44 px, folha "Como usar" e "Ver no guia" ----
  const j1Help = async (name, entryTitle, firstStep, shotName) => {
    const helps = p.getByRole('button', { name: 'Como usar esta tela', exact: true }).filter({ visible: true });
    await helps.first().waitFor({ timeout: 8000 }).catch(() => {});
    const box = await helps.first().boundingBox().catch(() => null);
    ok(`Tutorial "?" em ${name}: um botão "Como usar esta tela" no cabeçalho, com 44 px ou mais`, (await helps.count()) === 1 && box !== null && box.width >= 44 && box.height >= 44 && box.y < 120, JSON.stringify(box));
    await helps.first().click();
    const sheet = j1Dialog(`Como usar: ${entryTitle}`);
    await sheet.first().waitFor({ timeout: 6000 });
    const st = await p.evaluate((label) => {
      const vis = (e) => e.getBoundingClientRect().width > 0;
      const d = [...document.querySelectorAll('[role=dialog]')].find((e) => e.getAttribute('aria-label') === label && vis(e));
      return d ? { text: d.innerText.replace(/\u00a0/g, ' '), buttons: [...d.querySelectorAll('[role=button]')].filter(vis).map((b) => b.getAttribute('aria-label') || b.textContent), steps: d.querySelectorAll('[aria-label^="Passo "]').length, focusInside: d.contains(document.activeElement) } : null;
    }, `Como usar: ${entryTitle}`);
    ok(`Tutorial "?" em ${name}: a folha "Como usar: ${entryTitle}" com os passos, "Ver no guia" e "Fechar", e o foco dentro`, st !== null && st.text.includes(entryTitle) && st.text.includes(firstStep) && st.buttons.includes('Ver no guia') && st.buttons.includes('Fechar') && st.steps >= 3 && st.focusInside, JSON.stringify(st));
    await j1Keep();
    if (shotName) await j1Widths(async (w) => { await layoutChecks(`tutorial folha "?" ${name} ${w}px`); await shot(w === 390 ? shotName : `${shotName}_320px`); });
    await sheet.getByRole('button', { name: 'Fechar', exact: true }).click();
    ok(`Tutorial "?" em ${name}: "Fechar" fecha a folha`, await sheet.first().waitFor({ state: 'hidden', timeout: 4000 }).then(() => true).catch(() => false));
  };
  const j1Org = (title) => p.getByRole('button', { name: new RegExp(`^${title},`) }).filter({ visible: true }).first();
  const j1Cal = async (title) => { await p.getByRole('button', { name: new RegExp(`^${title.replace(/[?]/g, '\\?')}${/[?.!]$/.test(title) ? '' : '\\.'} `) }).filter({ visible: true }).first().click(); await waitUntil(async () => (await h1Name()) === title, 8000); };
  // Sai de um formulário: "Cancelar" e, se o preenchimento mudou, "Descartar alterações".
  const j1Leave = async () => { await btn('Cancelar').click(); await p.waitForTimeout(400); if ((await visibleCount('button', 'Descartar alterações')) > 0) await confirmIn('Descartar alterações'); await p.waitForTimeout(300); };
  await j1Demo();
  await j1Tab('Movimentos: movimentações do mês').click(); await waitText('Registrar recebimento'); await p.waitForTimeout(500);
  // Cartões e Fatura
  await j1Org('Cartões').click(); await waitText('Cadastrar cartão');
  await j1Help('Cartões', 'Cartões e faturas', 'Informe o apelido, os 4 últimos dígitos', '324_ajuda_cartoes');
  await p.getByRole('button', { name: 'Como usar esta tela', exact: true }).filter({ visible: true }).first().click();
  await btn('Ver no guia').click(); await waitText('Para que serve');
  ok('Tutorial "?": "Ver no guia" abre a entrada do guia daquela tela (/aprender/guia/cartoes)', j1Path() === '/aprender/guia/cartoes' && (await h1Name()) === 'Cartões e faturas');
  await btn('Voltar').click(); await waitText('Cadastrar cartão');
  await p.getByRole('button', { name: /^Cartão Exemplo · final 1234\./ }).filter({ visible: true }).first().click(); await waitText('Fatura atual');
  ok('Tutorial "?": o cartão (detalhe) não tem o botão, só Cartões e a fatura', (await visibleCount('button', 'Como usar esta tela')) === 0);
  await p.getByRole('button', { name: /^Fatura de novembro, aberta, R\$ 550,00/ }).filter({ visible: true }).first().click(); await waitText('Informar encargos');
  await j1Help('Fatura', 'Cartões e faturas', 'Toque em "Cadastrar cartão"');
  // Orçamento por categoria
  await j1Tab('Movimentos: movimentações do mês').click(); await waitText('Registrar recebimento');
  await j1Org('Orçamento por categoria').click(); await waitText('Compras no cartão contam no mês da compra');
  await j1Help('Orçamento por categoria', 'Orçamento por categoria', 'Em "Definir orçamento", escolha uma categoria');
  await btn('Voltar').click(); await waitText('Registrar recebimento');
  // Importar extrato
  await j1Org('Importar extrato ou fatura').click(); await waitText('Escolha o arquivo');
  await j1Help('Importar extrato', 'Importar extrato ou fatura', 'Toque em "Escolher o arquivo"');
  await btn('Voltar').click(); await waitText('Registrar recebimento');
  // Buscar
  await p.getByRole('button', { name: /^Buscar\. Abre a busca/ }).filter({ visible: true }).first().click(); await waitText('Nada do que você busca é guardado.');
  await j1Help('Buscar', 'Buscar em Movimentos', 'Em Movimentos, toque no campo "Buscar"');
  await btn('Voltar').click(); await waitText('Registrar recebimento');
  // Contas do ano: o detalhe e o cadastro (e nenhum "?" no gasto fixo comum nem em Contas a pagar)
  await j1Org('Gastos fixos e parcelamentos').click(); await waitText('Por mês, se os valores não mudarem');
  ok('Tutorial "?": a lista de Gastos fixos e parcelamentos não tem o botão', (await visibleCount('button', 'Como usar esta tela')) === 0);
  await p.getByRole('button', { name: /^IPVA, cerca de R\$ 2\.400,00/ }).filter({ visible: true }).first().click(); await waitText('Ano a ano');
  await j1Help('Conta do ano (detalhe)', 'Contas do ano', 'Em "Contas do ano", toque em "Nova conta do ano"', '325_ajuda_conta_do_ano');
  await btn('Voltar').click(); await waitText('Por mês, se os valores não mudarem');
  await btn('Novo gasto fixo ou parcelamento').click(); await waitText('Com que frequência?');
  ok('Tutorial "?": o cadastro de um gasto fixo comum não tem o botão', (await visibleCount('button', 'Como usar esta tela')) === 0);
  await p.getByRole('radio', { name: 'Todo ano' }).filter({ visible: true }).first().click(); await waitText('Como você paga?');
  await j1Help('Conta do ano (cadastro)', 'Contas do ano', 'Em "Contas do ano", toque em "Nova conta do ano"');
  await p.getByRole('radio', { name: 'Todo mês' }).filter({ visible: true }).first().click(); await p.waitForTimeout(300);
  ok('Tutorial "?": voltando para "Todo mês", o botão sai', (await visibleCount('button', 'Como usar esta tela')) === 0);
  await j1Leave();
  await j1Tab('Movimentos: movimentações do mês').click(); await waitText('Registrar recebimento');
  await j1Org('Contas a pagar').click(); await waitText('Contas em aberto com vencimento até o fim do mês');
  ok('Tutorial "?": Contas a pagar não tem o botão', (await visibleCount('button', 'Como usar esta tela')) === 0);
  await btn('Voltar').click(); await waitText('Registrar recebimento');
  // Calculadoras: só as duas com entrada própria
  await j1Org('Calculadoras').click(); await waitText('Decidir uma compra');
  await j1Cal('Antes de financiar');
  await j1Help('Antes de financiar', 'Antes de financiar', 'Informe o "Preço à vista do bem"', '326_ajuda_antes_de_financiar');
  await btn('Voltar').click(); await waitText('Decidir uma compra');
  await j1Cal('Em que ordem quitar as dívidas?');
  await j1Help('Plano para quitar dívidas', 'Plano para quitar dívidas', 'A lista já vem com os seus parcelamentos em aberto');
  await btn('Voltar').click(); await waitText('Decidir uma compra');
  await j1Cal('Quanto custa por ano?');
  ok('Tutorial "?": as outras calculadoras não têm o botão', (await visibleCount('button', 'Como usar esta tela')) === 0);
  // Renda comprometida (pelo Resumo)
  await j1Tab('Resumo').click(); await waitText('Diferença do mês'); await waitText('Renda comprometida em outubro').catch(() => {});
  await p.getByRole('button', { name: /^Renda comprometida em / }).filter({ visible: true }).first().click(); await waitText('Seu limite');
  await j1Help('Renda comprometida', 'Renda comprometida e limite pessoal', 'Toque em "Informar renda de referência"');
  await btn('Voltar').click(); await waitText('Diferença do mês');
  // Contas de origem: Conta › Adicionar conta
  await p.getByRole('button', { name: 'Conta: perfil, segurança e acesso ao plano' }).filter({ visible: true }).first().click(); await waitText('Privacidade neste aparelho');
  await j1Keep(); await scrollTo('Lembretes'); await shot('329_conta_privacidade');
  await btn('Adicionar conta').click(); await waitText('Nome da conta');
  await j1Help('Contas de origem', 'Contas de origem', 'Toque no círculo com as suas iniciais', '327_ajuda_contas_de_origem');
  await btn('Voltar').click(); await waitText('Privacidade neste aparelho'); await btn('Voltar').click(); await waitText('Diferença do mês');

  // ---- 12. "Quem vê estes dados?" (captura do manual), o Resumo sem o tour na demonstração com a marca do roteiro ----
  await p.getByRole('button', { name: 'Quem vê estes dados?' }).filter({ visible: true }).first().click(); await waitText('Entendi');
  await shot('330_quem_ve');
  await j1Keep();
  await btn('Entendi').click(); await waitText('Diferença do mês');

  // ---- 13. Textos e escritas ----
  const j1Vetoed = j1Texts.map((x) => x.match(FORBIDDEN)?.[0]).filter(Boolean);
  const j1Brands = j1Texts.map((x) => x.match(/\b(nubank|ita[uú]|bradesco|santander|inter|c6|caixa|sicredi|sicoob|btg|neon|picpay|mercado pago|itaucard|visa|mastercard|hipercard|amex|serasa)\b/i)?.[0]).filter(Boolean);
  const j1Dashes = j1Texts.map((x) => x.match(/[–—]/)?.[0]).filter(Boolean);
  ok('Tutorial telas do guia, do tour e da ajuda: nenhum termo proibido, travessão, expressão vetada nem nome de banco ou de bandeira nos textos da interface', j1Texts.length >= 20 && j1Vetoed.length === 0 && j1Dashes.length === 0 && j1Brands.length === 0, `${j1Texts.length} telas ${j1Vetoed.join(' | ')} ${j1Brands.join(' | ')} ${j1Dashes.join(' | ')}`);
  ok('Tutorial: nenhuma escrita direta na rede (o tour, o guia e a ajuda não gravam; a demonstração e as contas novas ficam em memória)', writes.slice(j1Writes0).length === 0, writes.slice(j1Writes0).join(' | '));
  ok('sem erros de JavaScript no console', errors.length === 0, errors.slice(0,3).join(' | '));
  await b.close();
  for (const r of results) console.log(r.join('  '));
  const passed = results.filter(r => r[0] === 'OK ').length;
  console.log(`\n${passed}/${results.length} verificações OK`);
  server.close();
  process.exit(passed === results.length ? 0 : 1);
})().catch(async (e) => { try { const shotPath = path.join(os.tmpdir(), 'clarevo-e2e-erro.png'); await globalThis.__page?.screenshot({ path: shotPath }); console.log(`Tela do erro: ${shotPath}`); console.log((await globalThis.__page?.locator('body').innerText())?.slice(0, 600)); } catch {} for (const r of results) console.log(r.join('  ')); console.error('ERRO NO ROTEIRO:', e.message.slice(0,900)); server.close(); process.exit(1); });
