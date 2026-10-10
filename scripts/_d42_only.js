/**
 * Roteiro de verificação do primeiro ciclo, do Ciclo A (gastos fixos e parcelamentos), do Ciclo A3 (contas do ano),
 * de "Primeiros passos" no Resumo, dos atalhos de Movimentações, do Ciclo A6 (achar tudo e calculadoras), do Ciclo A4
 * (seus últimos meses, com o cenário fictício "retorno" da demonstração), do Ciclo A5 (Aprender e dúvidas), do Ciclo A2
 * (Conta na web e ocultar valores), do Ciclo B (renda comprometida e a previsão dos pagamentos), do Ciclo C (metas, reserva
 * e plano de guardar), do Ciclo D (simulador, com os aportes no início de cada mês) e da Navegação (D-039: "Anotar gasto" logo
 * abaixo do cabeçalho, barra inferior nas telas de consulta, Contas a pagar no mês certo, Metas compacta e a busca "No app" de
 * Aprender) na versão web, em modo demonstração (acesso simulado).
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
  let t;
  const goResumo = async () => {
    const tab = () => p.getByRole('tab', { name: 'Resumo' }).filter({ visible: true });
    for (let i = 0; i < 5 && (await tab().count()) === 0; i++) { await btn('Voltar').click(); await p.waitForTimeout(400); }
    await tab().first().click(); await waitText('Diferença do mês');
  };
  const openToPay = async () => { await p.getByRole('button', { name: /^Ainda a pagar neste mês, R\$/ }).filter({ visible: true }).first().click(); await waitText('Contas em aberto com vencimento até o fim do mês'); };
  const openRow = (name) => p.getByRole('button', { name }).filter({ visible: true }).first().click();
  const openSeriesList = async () => { await p.getByRole('button', { name: /^Gastos fixos e parcelamentos, / }).filter({ visible: true }).first().click(); await waitText('Por ano, se os valores não mudarem'); };
  const ALLOWED_FIXED = /^R\$ (1,00|100,00|9\.999\.999,99)$/;
  // Valores em reais ainda legíveis: no texto visível e em todos os nomes e valores acessíveis dos elementos visíveis.
  const moneyLeaks = () => p.evaluate((allowed) => {
    const re = /[−-]?R\$\s?\d{1,3}(?:\.\d{3})*,\d{2}/g;
    const allow = new RegExp(allowed);
    const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const found = [];
    const scan = (where, text) => { for (const m of (text || '').replace(/ /g, ' ').match(re) ?? []) if (!allow.test(m.replace(/^[−-]/, ''))) found.push(`${where}: ${m}`); };
    scan('texto', document.body.innerText);
    for (const e of document.querySelectorAll('[aria-label],[aria-valuetext],[aria-description],[title],input')) {
      if (!vis(e)) continue;
      for (const a of ['aria-label', 'aria-valuetext', 'aria-description', 'title']) scan(`${a} de ${e.tagName}`, e.getAttribute(a));
    }
    return found;
  }, ALLOWED_FIXED.source);
  const spokenHidden = () => p.evaluate(() => [...document.querySelectorAll('[aria-label],[aria-valuetext]')].filter((e) => e.getBoundingClientRect().width > 0 && /valor oculto/.test((e.getAttribute('aria-label') || '') + (e.getAttribute('aria-valuetext') || ''))).length);
  const hiddenShows = async (name) => {
    await p.waitForTimeout(300);
    const leaks = await moneyLeaks();
    const text = await body();
    ok(`A2 valores ocultos, ${name}: nenhum valor em reais à vista (texto e nomes acessíveis)`, leaks.length === 0, leaks.slice(0, 4).join(' | '));
    ok(`A2 valores ocultos, ${name}: "R$ ••••" na tela e "valor oculto" nos nomes acessíveis`, text.includes('R$ ••••') && (await spokenHidden()) > 0, `${text.includes('R$ ••••')} ${await spokenHidden()}`);
  };
  const openConta = async () => { await p.getByRole('button', { name: 'Conta: perfil, segurança e acesso ao plano' }).filter({ visible: true }).first().click(); await waitText('Privacidade neste aparelho'); };
  const hideSwitch = () => p.getByRole('switch', { name: 'Ocultar valores ao abrir' }).filter({ visible: true }).first();
  const newAcct = async (name, email) => {
    await p.goto(`http://localhost:${PORT}/`); await waitText('Seu dinheiro');
    await btn('Criar conta').click(); await waitText('Nome de apresentação');
    await field('Nome de apresentação').fill(name); await field('E-mail').fill(email); await field('Senha').fill('senha1234');
    await btn('Criar conta').click(); await waitText('Confira seu e-mail');
    await btn('Simular abertura do link').click(); await btn('Já confirmei meu e-mail').click(); await waitText('Sua primeira conta');
    await btn('Começar meu mês').click(); await waitText('Diferença do mês');
  };
  const NAV_WIDTHS = [[390, 844], [320, 800]];
  // Roda a conferência em 390 e 320 px (volta para 390 no fim).
  const atWidths = async (fn) => {
    for (const [w, h] of NAV_WIDTHS) { await p.setViewportSize({ width: w, height: h }); await p.waitForTimeout(450); await fn(w); }
    await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(350);
  };
  const demoHome = async () => {
    await p.goto(`http://localhost:${PORT}/`); await waitText('Seu dinheiro');
    await btn('Ver demonstração com dados fictícios').click(); await waitText('Diferença do mês');
    await waitText('Ainda a pagar neste mês', 12000).catch(() => {}); await p.waitForTimeout(500);
  };
  // O nome acessível da aba "Movimentos" contém o rótulo visível (WCAG 2.5.3): "Movimentos: movimentações do mês".
  // ==================================================================================================================
  // Ajustes de 10/10 (D-042), revisão de Enzo. G2: nota fiscal com valor, loja, data e forma de pagamento (a página da Sefaz-RJ
  // vem de um gancho do roteiro, sintética) e a dica de que o celular lê a página; G3: faturas do mês nos cartões e quanto isso é
  // da renda de referência; G4: contas do ano explicadas. Cada tela é conferida em 390 e em 320 px. Capturas novas: 210 em diante.
  // Na demonstração, hoje é 07/10/2026; o Cartão Exemplo (fecha dia 3, vence dia 10) só tem faturas a partir de novembro, e a
  // renda de referência é R$ 6.000,00.
  // ==================================================================================================================
  const d42Path = () => new URL(p.url()).pathname;
  const d42GoTab = async (name) => {
    const tab = () => p.getByRole('tab', { name }).filter({ visible: true });
    for (let i = 0; i < 8; i++) { await tab().first().waitFor({ timeout: 1500 }).catch(() => {}); if ((await tab().count()) > 0) break; await btn('Voltar').click(); await p.waitForTimeout(400); }
    await tab().first().click(); await p.waitForTimeout(500);
  };
  const d42OpenCards = async () => {
    await d42GoTab('Movimentações'); await waitText('Registrar recebimento');
    await p.getByRole('button', { name: /^Cartões, / }).filter({ visible: true }).first().click(); await waitText('Cadastrar cartão'); await p.waitForTimeout(500);
  };
  const d42CardIdOf = (name) => otherDevice(async (repo, ctx, n) => (await repo.listCards(ctx)).find((c) => c.name === n)?.id ?? null, name);
  const d42Count = (cardId) => otherDevice(async (repo, ctx, id) => (await repo.listCardEntries(id)).length, cardId);
  // Chave de acesso e QR de NFC-e do RJ sintéticos (dígito verificador por módulo 11), como nas notas do Ciclo E.
  const d42AccessKey = (aamm, model, number, cnpj = '11222333000181') => {
    const body43 = `33${aamm}${cnpj}${model}001${String(number).padStart(9, '0')}187654321`;
    let sum = 0; for (let i = 0; i < 43; i++) sum += (body43.charCodeAt(42 - i) - 48) * (2 + (i % 8));
    const r = sum % 11;
    return body43 + String(r < 2 ? 0 : 11 - r);
  };
  const D42_RJ = 'https://consultadfe.fazenda.rj.gov.br/consultaNFCe/QRCode?p=';
  const D42_HASH = 'ABCDEF0123456789ABCDEF0123456789ABCDEF01';
  const d42Qr = (key) => `${D42_RJ}${key}|2|1|1|${D42_HASH}`;
  const d42QrCont = (key, day, value) => `${D42_RJ}${key}|2|1|${day}|${value}|0123456789ABCDEF0123456789ABCDEF01234567|1|${D42_HASH}`;
  const d42Spaced = (k) => k.replace(/(.{4})/g, '$1 ').trim();
  const D42_NFE = d42AccessKey('2610', '55', 4321);
  const d42ScanLine = () => p.getByRole('button', { name: /^Escanear nota fiscal\./ }).filter({ visible: true }).first();
  const d42OpenScan = async () => { await d42ScanLine().click(); await waitText('Como você quer ler a nota?'); };
  const d42OpenPaste = async () => { await d42OpenScan(); await btn('Colar o link ou a chave').click(); await waitText('Colar o link ou a chave da nota'); await p.waitForTimeout(300); };
  const d42Paste = async (text) => { await d42OpenPaste(); await field('Colar o link ou a chave da nota').fill(text); await btn('Ler a nota').click(); await waitText('Nota lida:'); await p.waitForTimeout(700); };
  const d42ToBlock = async () => { await p.getByText('Nota lida:', { exact: false }).filter({ visible: true }).first().evaluate((e) => e.scrollIntoView({ block: 'start' })); await p.waitForTimeout(300); };
  const d42Leave = async () => { await btn('Cancelar').click(); await p.waitForTimeout(300); if (await visibleCount('button', 'Descartar alterações')) await btn('Descartar alterações').click(); await waitText('Diferença do mês'); };
  // PDF mínimo de texto (Helvetica, uma linha por Tj) para o seletor de arquivos; o DANFE sintético traz destinatário fictício.
  const d42Tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'clarevo-d42-'));
  const d42MakePdf = (lines) => {
    const esc = (s) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
    const content = `BT /F1 10 Tf 40 800 Td 14 TL\n${lines.map((l) => `(${esc(l)}) Tj T*`).join('\n')}\nET`;
    const objs = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
      `<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`,
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    ];
    let out = '%PDF-1.4\n'; const offsets = [];
    objs.forEach((o, i) => { offsets.push(Buffer.byteLength(out, 'latin1')); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
    const xref = Buffer.byteLength(out, 'latin1');
    out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    return Buffer.from(out, 'latin1');
  };
  const d42DanfeLines = (key, issued, total) => [
    'RECEBEMOS DE LOJA EXEMPLO LTDA OS PRODUTOS E/OU SERVIÇOS CONSTANTES DA NOTA FISCAL ELETRÔNICA INDICADA AO LADO',
    'DANFE', 'Documento Auxiliar da Nota Fiscal Eletrônica',
    'CHAVE DE ACESSO', d42Spaced(key),
    'DATA DA EMISSÃO', issued,
    'DESTINATÁRIO / REMETENTE', 'NOME / RAZÃO SOCIAL', 'FULANA DE TAL EXEMPLO', 'CNPJ / CPF', '123.456.789-09', 'ENDEREÇO', 'RUA DO DESTINATARIO FICTICIA, 1',
    'CÁLCULO DO IMPOSTO', 'VALOR TOTAL DA NOTA', total,
  ];
  const D42_CNPJ = '12345678000195';
  const D42_CNPJ_TEXT = '12.345.678/0001-95';
  const d42Key = (n, model = '65') => d42AccessKey('2610', model, n, D42_CNPJ);
  const D42_NO_ALERT = /\b(aten[cç][aã]o|cuidado|alerta|perigo|urgente|estourou|dispon[ií]vel|saldo livre|sobra|sobrou|endividad\w+)\b/i;
  // Página SINTÉTICA no leiaute padrão da consulta de NFC-e, com a tabela "Forma de pagamento" / "Valor pago" e o troco.
  const d42Html = (key, { total = '87,40', pays = [], change = null } = {}) =>
    `<html><head><script>var x='Valor a pagar R$ 1,00';</script></head><body><div id="u20" class="txtTopo">MERCADO EXEMPLO LTDA</div><div class="text">CNPJ: ${D42_CNPJ_TEXT}</div><table id="tabResult"><tr id="Item + 1"><td>PRODUTO EXEMPLO</td></tr></table><div id="totalNota"><div id="linhaTotal"><label>Qtd. total de itens:</label><span class="totalNumb">1</span></div><div id="linhaTotal"><label>Valor a pagar R$:</label><span class="totalNumb txtMax">${total}</span></div>${pays.length ? `<div id="linhaTotal"><label>Forma de pagamento:</label><span class="totalNumb">Valor pago R$</span></div>${pays.map(([label, value]) => `<div id="linhaTotal"><label>${label}</label><span class="totalNumb">${value}</span></div>`).join('')}` : ''}${change ? `<div id="linhaTotal"><label>Troco R$</label><span class="totalNumb">${change}</span></div>` : ''}</div><div id="infos"><h4>Informações gerais da Nota</h4><ul><li><strong>Emissão: </strong>06/10/2026 10:15:00 - Via Consumidor</li></ul><h4>Consumidor</h4><ul><li>CPF: 123.456.789-09 Nome: FULANA DE TAL EXEMPLO</li></ul><h4>Chave de acesso</h4><span>${d42Spaced(key)}</span></div></body></html>`;
  const d42SetPages = (pages) =>
    p.evaluate((pages) => {
      window.__d42 = pages;
      window.__clarevoSefazFetch = async (url) => {
        const k = Object.keys(window.__d42).find((x) => url.includes(x));
        if (!k) return { ok: false, status: 404, url, text: async () => '' };
        return { ok: true, status: 200, url, text: async () => window.__d42[k] };
      };
    }, pages);
  const d42Read = async (key, wait = 'Loja, valor e data lidos da página da Sefaz.') => {
    await d42OpenPaste(); await field('Colar o link ou a chave da nota').fill(d42Qr(key)); await btn('Ler a nota').click();
    await waitText('Nota lida:'); if (wait) await waitText(wait, 8000); await p.waitForTimeout(600);
  };
  const d42Checked = (name) => radio(name).getAttribute('aria-checked');
  const d42AnnotarGasto = async () => { await btn('Anotar gasto').click(); await waitText('Será salvo em'); await p.waitForTimeout(500); };

  // ---- G2.1 · Pix, dinheiro, débito e vale: "Nota lida" com valor, loja, data e forma; "Como você pagou?" pré-selecionado ----
  await demoHome();
  const d42Keys = { pix: d42Key(7001), dinheiro: d42Key(7002), credito: d42Key(7003), debito: d42Key(7004), vale: d42Key(7005), varias: d42Key(7006), outros: d42Key(7007), semForma: d42Key(7008), danfe: d42Key(7009, '55') };
  await d42SetPages({
    [d42Keys.pix]: d42Html(d42Keys.pix, { pays: [['Pix', '87,40']] }),
    [d42Keys.dinheiro]: d42Html(d42Keys.dinheiro, { total: '87,40', pays: [['Dinheiro', '100,00']], change: '12,60' }),
    [d42Keys.credito]: d42Html(d42Keys.credito, { pays: [['Cartão de Crédito', '87,40']], change: '0,00' }),
    [d42Keys.debito]: d42Html(d42Keys.debito, { pays: [['Cartão de Débito', '87,40']] }),
    [d42Keys.vale]: d42Html(d42Keys.vale, { pays: [['Vale Alimentação', '87,40']] }),
    [d42Keys.varias]: d42Html(d42Keys.varias, { total: '120,00', pays: [['Dinheiro', '20,00'], ['Cartão de Crédito', '100,00']], change: '0,00' }),
    [d42Keys.outros]: d42Html(d42Keys.outros, { pays: [['Outros', '87,40']] }),
    [d42Keys.semForma]: d42Html(d42Keys.semForma, { pays: [] }),
  });
  await d42AnnotarGasto();
  await d42Read(d42Keys.pix); t = await body();
  ok('D42 nota paga no Pix: "Nota lida: Mercado Exemplo Ltda · RJ · R$ 87,40 · 06/10/2026 · Pix" (loja, valor, data e forma), valor e data nos campos',
    t.includes('Nota lida: Mercado Exemplo Ltda · RJ · R$ 87,40 · 06/10/2026 · Pix') && (await field('Valor em reais').inputValue()) === '87,40' && (await field('Data do pagamento').inputValue()) === '06/10/2026', t.slice(0, 400));
  ok('D42 nota paga no Pix: "Dinheiro, débito ou Pix" vem escolhido, com a legenda de onde veio a escolha', (await d42Checked('Dinheiro, débito ou Pix')) === 'true' && (await d42Checked('Cartão de crédito')) === 'false' &&
    t.includes('A nota informa: Pix. Mude se você pagou de outro jeito.'));
  ok('D42 a página da Sefaz foi lida sem trazer valor pago, troco, CPF nem nome do consumidor para a tela', !/FULANA|123\.456\.789|Valor pago|Troco/.test(t) && !t.includes('100,00'));
  await keepText();
  await d42ToBlock(); await shot('210_nota_pix');
  await p.setViewportSize({ width: 320, height: 800 }); await p.waitForTimeout(400);
  await innerChecks('D42 nota com forma de pagamento 320px');
  await d42ToBlock(); await shot('210_nota_pix_320px');
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(300);
  await innerChecks('D42 nota com forma de pagamento 390px');

  // Dinheiro com troco, débito e vale: todos viram "Dinheiro, débito ou Pix"; o troco não é forma de pagamento.
  await d42Read(d42Keys.dinheiro); t = await body();
  ok('D42 dinheiro com troco: "· Dinheiro" no fim da linha, valor a pagar R$ 87,40 (não o valor pago) e "Dinheiro, débito ou Pix" escolhido',
    t.includes('Nota lida: Mercado Exemplo Ltda · RJ · R$ 87,40 · 06/10/2026 · Dinheiro') && (await field('Valor em reais').inputValue()) === '87,40' && (await d42Checked('Dinheiro, débito ou Pix')) === 'true' && t.includes('A nota informa: Dinheiro.'));
  await d42Read(d42Keys.debito); t = await body();
  ok('D42 cartão de débito: "· Cartão de débito" e "Dinheiro, débito ou Pix" escolhido (o débito não vai para a fatura)', t.includes('· Cartão de débito') && (await d42Checked('Dinheiro, débito ou Pix')) === 'true' && (await d42Checked('Cartão de crédito')) === 'false');
  await d42Read(d42Keys.vale); t = await body();
  ok('D42 vale-alimentação: "· Vale" e "Dinheiro, débito ou Pix" escolhido', t.includes('· Vale') && (await d42Checked('Dinheiro, débito ou Pix')) === 'true');

  // "Outros" e página sem forma: a nota não escolhe pela pessoa.
  await radio('Cartão de crédito').click(); await p.waitForTimeout(300);
  await d42Read(d42Keys.outros); t = await body();
  ok('D42 "Outros": aparece como "Outra forma de pagamento" e a escolha da pessoa (cartão de crédito) não muda', t.includes('· Outra forma de pagamento') && (await d42Checked('Cartão de crédito')) === 'true' && !t.includes('A nota informa:'));
  await d42Read(d42Keys.semForma); t = await body();
  ok('D42 página sem forma de pagamento: a linha traz loja, valor e data, nada sobre pagamento, e a escolha da pessoa continua', t.includes('Nota lida: Mercado Exemplo Ltda · RJ · R$ 87,40 · 06/10/2026') && !/· (Pix|Dinheiro|Cartão de|Vale|Outra forma|Pagamento em)/.test(t.split('Nota lida:')[1].split('\n')[0]) && (await d42Checked('Cartão de crédito')) === 'true');

  // ---- G2.2 · Mais de uma forma: não pré-seleciona ----
  await d42Read(d42Keys.varias); t = await body();
  ok('D42 mais de uma forma (dinheiro e cartão): "Pagamento em mais de uma forma" no fim da linha e a escolha da pessoa não muda (continua cartão de crédito)',
    t.includes('Nota lida: Mercado Exemplo Ltda · RJ · R$ 120,00 · 06/10/2026 · Pagamento em mais de uma forma') && (await d42Checked('Cartão de crédito')) === 'true' && !t.includes('A nota informa:'));
  await radio('Dinheiro, débito ou Pix').click(); await p.waitForTimeout(300);
  await d42Read(d42Keys.varias, null); t = await body();
  ok('D42 mais de uma forma lida de novo: "Dinheiro, débito ou Pix" continua como a pessoa deixou', (await d42Checked('Dinheiro, débito ou Pix')) === 'true');
  await keepText();
  await d42ToBlock(); await shot('211_nota_varias_formas');

  // ---- G2.3 · Cartão de crédito com um cartão só: escolhe "Cartão de crédito" e o cartão; "Desfazer leitura" volta ----
  await d42Read(d42Keys.credito); t = await body();
  ok('D42 cartão de crédito: "Nota lida: ... · Cartão de crédito", "Cartão de crédito" escolhido e, com um cartão só, o Cartão Exemplo já escolhido',
    t.includes('Nota lida: Mercado Exemplo Ltda · RJ · R$ 87,40 · 06/10/2026 · Cartão de crédito') && (await d42Checked('Cartão de crédito')) === 'true' && t.includes('Compra no cartão · Cartão Exemplo') &&
    (await visibleCount('button', 'Anotar compra no cartão')) === 1 && (await visibleCount('radiogroup', 'Escolha o cartão')) === 0 && t.includes('A nota informa: Cartão de crédito.'), t.slice(0, 600));
  await keepText();
  await d42Read(d42Keys.credito, null);
  await scrollTo('Como você pagou?');
  await shot('212_nota_credito_um_cartao');
  await btn('Desfazer leitura').click(); await p.waitForTimeout(400);
  ok('D42 "Desfazer leitura" devolve "Como você pagou?" ao que havia antes da nota', !(await body()).includes('Nota lida:') && (await d42Checked('Dinheiro, débito ou Pix')) === 'true' && (await d42Checked('Cartão de crédito')) === 'false');
  // Ler a nota de cartão e depois uma nota paga no Pix: a nota nova substitui a escolha da nota anterior.
  await d42Read(d42Keys.credito); await d42Read(d42Keys.pix);
  ok('D42 uma nota paga no Pix depois de uma no cartão: a nota nova substitui a escolha ("Dinheiro, débito ou Pix")', (await d42Checked('Dinheiro, débito ou Pix')) === 'true' && (await d42Checked('Cartão de crédito')) === 'false');
  // O que a pessoa escolhe depois da nota fica: ler a página de novo não troca.
  await radio('Cartão de crédito').click(); await p.waitForTimeout(300);
  ok('D42 depois de a pessoa escolher, a legenda "A nota informa" some', !(await body()).includes('A nota informa:'));
  await d42Leave();

  // Salvar a compra no cartão: abre a fatura de novembro (compra de 06/10, depois do fechamento do dia 3) com o resumo da chave.
  await d42AnnotarGasto();
  await d42Read(d42Keys.credito);
  const d42CardId = await d42CardIdOf('Cartão Exemplo');
  const d42Before = await d42Count(d42CardId);
  await btn('Anotar compra no cartão').click(); await waitText('Lançamentos', 12000); await p.waitForTimeout(600);
  const d42Entries = await otherDevice(async (repo, ctx, id) => (await repo.listCardEntries(id)).map((e) => ({ d: e.description, c: e.amountCents, key: e.receiptKey })), d42CardId);
  const d42Saved = d42Entries.find((e) => e.d === 'Mercado Exemplo Ltda');
  ok('D42 a nota de cartão de crédito vira compra no cartão de R$ 87,40, com o resumo da chave (nunca a chave) e abre a fatura de novembro',
    /^\/cartoes\/[^/]+\/fatura\/2026-11$/.test(d42Path()) && !!d42Saved && d42Saved.c === 8740 && /^[0-9a-f]{64}$/.test(d42Saved.key ?? '') && d42Entries.length === d42Before + 1, `${d42Path()} ${JSON.stringify(d42Saved)}`);
  await d42GoTab('Resumo'); await waitText('Diferença do mês');

  // ---- G2.4 · Mais de um cartão: "Cartão de crédito" escolhido, e a pessoa escolhe o cartão ----
  await otherDevice(async (repo, ctx) => { await repo.createCard(`e2e-${Math.random()}`, ctx, { name: 'Cartão Roxo', lastDigits: null, closingDay: 15, dueDay: 22, limitCents: null }); });
  await d42AnnotarGasto();
  await d42Read(d42Keys.credito); t = await body();
  const d42Chosen = await p.getByRole('radiogroup', { name: 'Escolha o cartão' }).filter({ visible: true }).first().getByRole('radio').evaluateAll((es) => es.map((e) => `${e.textContent}=${e.getAttribute('aria-checked')}`));
  ok('D42 com dois cartões: "Cartão de crédito" escolhido, "Escolha o cartão" com os dois e nenhum escolhido (a pessoa decide)', (await d42Checked('Cartão de crédito')) === 'true' && d42Chosen.length === 2 && d42Chosen.every((x) => x.endsWith('=false')), d42Chosen.join(' | '));
  await keepText();
  await scrollTo('Como você pagou?');
  await shot('213_nota_credito_varios_cartoes');
  await d42Leave();

  // ---- G2.5 · DANFE em PDF com "FORMA DE PAGAMENTO" ----
  const d42Pdf = path.join(d42Tmp, 'danfe-pix.pdf');
  fs.writeFileSync(d42Pdf, d42MakePdf([...d42DanfeLines(d42Keys.danfe, '05/10/2026', '150,00'), 'FORMA DE PAGAMENTO', 'Pagamento Instantâneo (PIX)', '150,00', 'TRANSPORTADOR / VOLUMES TRANSPORTADOS']));
  await d42AnnotarGasto();
  await radio('Cartão de crédito').click(); await p.waitForTimeout(300);
  await d42OpenScan();
  const [d42Chooser] = await Promise.all([p.waitForEvent('filechooser'), btn('Escolher o PDF da nota').click()]);
  await d42Chooser.setFiles(d42Pdf); await waitText('Nota lida:', 20000); await p.waitForTimeout(800); t = await body();
  ok('D42 DANFE com "FORMA DE PAGAMENTO" (Pix): "Nota lida: Loja Exemplo Ltda · RJ · R$ 150,00 · 05/10/2026 · Pix" e "Dinheiro, débito ou Pix" escolhido no lugar do cartão',
    t.includes('Nota lida: Loja Exemplo Ltda · RJ · R$ 150,00 · 05/10/2026 · Pix') && (await d42Checked('Dinheiro, débito ou Pix')) === 'true', t.slice(0, 400));
  await d42Leave();

  // ---- G2.6 · Dica na web: o celular lê o valor e a data na página da Sefaz ----
  await p.evaluate(() => { delete window.__clarevoSefazFetch; });
  await d42AnnotarGasto();
  await d42Read(d42Keys.pix, null); t = await body();
  ok('D42 na web, nota do RJ com QR online (sem valor nem data): "No celular, o Clarevo lê o valor e a data na página da Sefaz." junto do aviso do navegador',
    t.includes('No celular, o Clarevo lê o valor e a data na página da Sefaz.') && t.includes('Neste navegador, a página da Sefaz não pode ser lida pelo Clarevo.') && t.includes('O valor não vem no código desta nota.'));
  await keepText();
  await d42ToBlock(); await shot('214_nota_web_dica_do_celular');
  await p.setViewportSize({ width: 320, height: 800 }); await p.waitForTimeout(400);
  await innerChecks('D42 dica do celular 320px');
  await d42ToBlock(); await shot('214_nota_web_dica_do_celular_320px');
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(300);
  await d42Read(d42Key(7010), null);
  await d42OpenPaste(); await field('Colar o link ou a chave da nota').fill(d42QrCont(d42Key(7011), '06', '45.90')); await btn('Ler a nota').click(); await waitText('Nota lida:'); await p.waitForTimeout(600); t = await body();
  ok('D42 QR em contingência (valor e dia no código): sem a dica do celular, e a linha traz o valor', !t.includes('No celular, o Clarevo lê o valor e a data') && t.includes('Nota lida: CNPJ 12.345.678/0001-95 · RJ · R$ 45,90 · 06/10/2026'));
  await d42Paste(D42_NFE);
  ok('D42 só a chave (NF-e): sem a dica do celular', !(await body()).includes('No celular, o Clarevo lê o valor e a data'));
  await d42Leave();

  // ---- G2.7 · Valores ocultos: o valor da linha "Nota lida" também vira "R$ ••••" ----
  await openConta(); await hideSwitch().click(); await p.waitForTimeout(300);
  await btn('Voltar').click(); await waitText('Diferença do mês');
  await d42AnnotarGasto();
  await d42OpenPaste(); await field('Colar o link ou a chave da nota').fill(d42QrCont(d42Key(7012), '06', '45.90')); await btn('Ler a nota').click(); await waitText('Nota lida:'); await p.waitForTimeout(600); t = await body();
  ok('D42 valores ocultos: "Nota lida: CNPJ 12.345.678/0001-95 · RJ · R$ •••• · 06/10/2026" e nenhum valor em reais à vista', t.includes('Nota lida: CNPJ 12.345.678/0001-95 · RJ · R$ •••• · 06/10/2026') && (await moneyLeaks()).length === 0, (await moneyLeaks()).slice(0, 3).join(' | '));
  await d42Leave();
  await openConta(); await hideSwitch().click(); await p.waitForTimeout(300);
  await btn('Voltar').click(); await waitText('Diferença do mês');

  // ---- G3 · Cartões: faturas do mês e quanto isso é da renda de referência ----
  await demoHome();
  await d42OpenCards(); t = await body();
  ok('D42 Cartões, demonstração: "Faturas de outubro", nenhuma fatura vence em outubro (as do Cartão Exemplo começam em novembro) e as próximas faturas, previstas',
    t.includes('Faturas de outubro') && t.includes('Nenhuma fatura vence em outubro.') && t.includes('Próximas faturas (previsto): novembro R$ 550,00, dezembro R$ 350,00, janeiro R$ 350,00') && !t.includes('da sua renda de referência'), t.slice(0, 500));
  ok('D42 Cartões: o card vem no topo, antes do texto de apresentação e do cartão', t.indexOf('Faturas de outubro') < t.indexOf('Cadastre seus cartões') && t.indexOf('Faturas de outubro') < t.indexOf('Cartão Exemplo'));
  ok('D42 Cartões: explica que já entra na renda comprometida e tem o link "Ver na renda comprometida"', t.includes('Já entra na sua renda comprometida, no grupo Faturas de cartão.') && (await visibleCount('button', /^Ver na renda comprometida/)) === 1);
  ok('D42 Cartões: neutro, sem cor de alerta nem julgamento', !D42_NO_ALERT.test(t));
  await keepText();
  await shot('215_cartoes_faturas_do_mes_sem_fatura');

  // Faturas de outubro de verdade: Mercado (R$ 300,00) e Sofá (R$ 200,00 em 2x) de setembro, na fatura que vence em 10/10.
  await otherDevice(async (repo, ctx) => {
    const k = () => `e2e-${Math.random()}`;
    const card = (await repo.listCards(ctx)).find((c) => c.name === 'Cartão Exemplo');
    await repo.addCardPurchase(k(), card.id, { description: 'Mercado do mês', category: 'Mercado', purchasedOn: '2026-09-15', totalCents: 30000, installments: 1 });
    await repo.addCardPurchase(k(), card.id, { description: 'Sofá', category: 'Moradia', purchasedOn: '2026-09-20', totalCents: 20000, installments: 2 });
  });
  await waitText('6,7% da sua renda de referência', 8000); await p.waitForTimeout(400); t = await body();
  ok('D42 Cartões com a fatura de outubro: R$ 400,00 (300,00 + a parcela 1 de 2 do sofá), "6,7% da sua renda de referência" e as próximas faturas (novembro R$ 650,00)',
    t.includes('Faturas de outubro') && t.includes('R$ 400,00') && t.includes('6,7% da sua renda de referência') && t.includes('Próximas faturas (previsto): novembro R$ 650,00, dezembro R$ 350,00, janeiro R$ 350,00') &&
    t.includes('Fatura paga entra pelo valor pago; as demais, pelo total previsto.') && !t.includes('Nenhuma fatura vence'), t.slice(0, 500));
  ok('D42 Cartões: sem renda de referência o card não aparece com "Informe sua renda" aqui (a demonstração tem renda de R$ 6.000,00)', !t.includes('Informe sua renda para ver quanto isso representa.'));
  ok('D42 Cartões: neutro, sem cor de alerta nem julgamento (com percentual)', !D42_NO_ALERT.test(t));
  await keepText();
  await shot('215_cartoes_faturas_do_mes');
  await p.setViewportSize({ width: 320, height: 800 }); await p.waitForTimeout(400);
  await innerChecks('D42 cartões faturas do mês 320px');
  await shot('215_cartoes_faturas_do_mes_320px', true);
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(300);
  await innerChecks('D42 cartões faturas do mês 390px');
  // Mesmo número da renda comprometida: o grupo "Faturas de cartão" de outubro.
  await p.getByRole('button', { name: /^Ver na renda comprometida/ }).filter({ visible: true }).first().click(); await waitText('Renda comprometida'); await p.waitForTimeout(800); t = await body();
  ok('D42 "Ver na renda comprometida" abre outubro e o grupo "Faturas de cartão · R$ 400,00 · 6,7%" é o mesmo número e o mesmo percentual do card dos cartões',
    d42Path() === '/renda-comprometida' && t.includes('Faturas de cartão · R$ 400,00 · 6,7%'), `${d42Path()} ${t.slice(0, 300)}`);
  await btn('Voltar').click(); await waitText('Faturas de outubro'); await p.waitForTimeout(400);

  // Pagamento em parte (R$ 250,00 de R$ 400,00): a fatura entra pelo valor pago, como na renda comprometida.
  await otherDevice(async (repo, ctx) => {
    const card = (await repo.listCards(ctx)).find((c) => c.name === 'Cartão Exemplo');
    const bill = (await repo.listInvoiceCommitments(card.id)).find((c) => c.invoice.month === '2026-10');
    await repo.payInvoice(`e2e-${Math.random()}`, card.id, '2026-10', bill.version, 25000, '2026-10-07');
  });
  await waitText('4,2% da sua renda de referência', 8000); await p.waitForTimeout(400); t = await body();
  ok('D42 Cartões com fatura paga em parte: R$ 250,00 (o valor pago), "4,2% da sua renda de referência", e o que ficou vai para novembro (R$ 800,00)',
    t.includes('Faturas de outubro') && t.includes('R$ 250,00') && t.includes('4,2% da sua renda de referência') && t.includes('novembro R$ 800,00'), t.slice(0, 500));
  await p.getByRole('button', { name: /^Ver na renda comprometida/ }).filter({ visible: true }).first().click(); await waitText('Renda comprometida'); await p.waitForTimeout(800); t = await body();
  ok('D42 renda comprometida de outubro com a fatura paga em parte: "Faturas de cartão · R$ 250,00 · 4,2%", igual ao card dos cartões', t.includes('Faturas de cartão · R$ 250,00 · 4,2%'), t.slice(0, 300));
  await btn('Voltar').click(); await waitText('Faturas de outubro'); await p.waitForTimeout(400);

  // Valores ocultos: o total e as próximas faturas viram "R$ ••••"; o percentual continua à vista (como na renda comprometida).
  await d42GoTab('Resumo'); await waitText('Diferença do mês');
  await openConta(); await hideSwitch().click(); await p.waitForTimeout(300);
  await btn('Voltar').click(); await waitText('Diferença do mês');
  await d42OpenCards(); await waitText('Faturas de outubro'); await p.waitForTimeout(500); t = await body();
  const d42Leaks = await moneyLeaks();
  ok('D42 Cartões com valores ocultos: total e próximas faturas em "R$ ••••", o percentual à vista e nenhum valor em reais legível', t.includes('R$ ••••') && t.includes('4,2% da sua renda de referência') && t.includes('Próximas faturas (previsto): novembro R$ ••••') &&
    !/R\$ \d/.test(t.split('Cartão Exemplo')[0]) && d42Leaks.length === 0, d42Leaks.slice(0, 3).join(' | ') + ' ' + t.slice(0, 300));
  await shot('216_cartoes_faturas_do_mes_valores_ocultos');
  await d42GoTab('Resumo'); await waitText('Diferença do mês');
  await openConta(); await hideSwitch().click(); await p.waitForTimeout(300);
  await btn('Voltar').click(); await waitText('Diferença do mês');

  // ---- G2.8 e G3.2 · Conta nova: crédito sem cartão (aviso e "Cadastrar cartão") e cartão sem renda de referência ----
  await newAcct('Gabi Teste', 'gabi@exemplo.com');
  await d42SetPages({ [d42Keys.credito]: d42Html(d42Keys.credito, { pays: [['Cartão de Crédito', '87,40']] }) });
  await d42AnnotarGasto();
  await d42Read(d42Keys.credito); t = await body();
  ok('D42 conta nova, nota de cartão de crédito sem nenhum cartão: "A nota diz cartão de crédito. Cadastre o cartão para anotar a compra na fatura." com "Cadastrar cartão"',
    t.includes('A nota diz cartão de crédito. Cadastre o cartão para anotar a compra na fatura.') && (await d42Checked('Cartão de crédito')) === 'true' && (await visibleCount('button', 'Cadastrar cartão')) === 1 && !t.includes('Você ainda não cadastrou um cartão.'), t.slice(0, 500));
  await keepText();
  await scrollTo('Como você pagou?');
  await shot('217_nota_credito_sem_cartao');
  await p.setViewportSize({ width: 320, height: 800 }); await p.waitForTimeout(400);
  await innerChecks('D42 nota de crédito sem cartão 320px');
  await scrollTo('Como você pagou?');
  await shot('217_nota_credito_sem_cartao_320px');
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(300);
  await btn('Cadastrar cartão').click(); await waitText('Guardamos só o apelido e os 4 últimos dígitos.'); await p.waitForTimeout(400);
  ok('D42 "Cadastrar cartão" abre o cadastro do cartão', d42Path() === '/cartoes/novo', d42Path());
  await btn('Cancelar').click(); await p.waitForTimeout(500); if (await visibleCount('button', 'Descartar alterações')) await btn('Descartar alterações').click();
  await p.waitForTimeout(400);
  ok('D42 voltar do cadastro mantém a nota lida e a escolha do cartão de crédito', d42Path() === '/registro/novo' && (await body()).includes('Nota lida:') && (await d42Checked('Cartão de crédito')) === 'true', d42Path());
  await d42Leave();
  // Cartão com fatura em outubro, mas sem renda de referência: o convite no lugar do percentual.
  await otherDevice(async (repo, ctx) => {
    const k = () => `e2e-${Math.random()}`;
    const card = (await repo.createCard(k(), ctx, { name: 'Cartão da Gabi', lastDigits: null, closingDay: 3, dueDay: 10, limitCents: null })).card;
    await repo.addCardPurchase(k(), card.id, { description: 'Material', category: 'Educação', purchasedOn: '2026-09-15', totalCents: 12000, installments: 1 });
  });
  await d42GoTab('Movimentações'); await waitText('Registrar recebimento');
  await p.getByRole('button', { name: /^Cartões, / }).filter({ visible: true }).first().click(); await waitText('Faturas de outubro'); await p.waitForTimeout(600); t = await body();
  ok('D42 Cartões sem renda de referência: R$ 120,00 e "Informe sua renda para ver quanto isso representa." com o link para a renda de referência, sem percentual',
    t.includes('R$ 120,00') && t.includes('Informe sua renda para ver quanto isso representa.') && (await visibleCount('button', 'Informar minha renda de referência')) === 1 && !t.includes('da sua renda de referência'), t.slice(0, 400));
  await keepText();
  await shot('218_cartoes_sem_renda_de_referencia');
  await p.setViewportSize({ width: 320, height: 800 }); await p.waitForTimeout(400);
  await innerChecks('D42 cartões sem renda 320px');
  await shot('218_cartoes_sem_renda_de_referencia_320px', true);
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(300);
  await btn('Informar minha renda de referência').click(); await p.waitForTimeout(800);
  ok('D42 "Informar minha renda de referência" abre a renda de referência de outubro', d42Path() === '/renda-comprometida/referencia', d42Path());
  await btn('Cancelar').click().catch(() => {}); await p.waitForTimeout(500);

  // ---- G4 · Contas do ano explicadas ----
  await demoHome();
  await d42GoTab('Movimentações'); await waitText('Registrar recebimento'); await openSeriesList(); t = await body();
  ok('D42 lista de Gastos fixos: o card "Contas do ano" explica o que são e quando entram em Contas a pagar',
    t.includes('Contas que vêm uma vez por ano, como IPVA, IPTU, matrícula e seguro. Você cadastra uma vez; todo ano o Clarevo cria a conta do mês certo, dois meses antes de vencer.'));
  await keepText();
  await scrollTo('Contas do ano');
  await shot('219_contas_do_ano_lista');
  await p.setViewportSize({ width: 320, height: 800 }); await p.waitForTimeout(400);
  await innerChecks('D42 contas do ano, lista 320px');
  await scrollTo('Contas do ano');
  await shot('219_contas_do_ano_lista_320px');
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(300);

  await btn('Nova conta do ano').click(); await waitText('Como você paga?'); await p.waitForTimeout(500); t = await body();
  ok('D42 cadastro de conta do ano: a explicação curta no topo (uma vez por ano, cadastra uma vez, o Clarevo lembra e cria as contas do mês certo) e "O que é isso?"',
    t.includes('Contas do ano são as que vêm uma vez por ano, como IPVA, IPTU, matrícula e seguro. Você cadastra uma vez; todo ano o Clarevo lembra e cria as contas do mês certo.') && (await visibleCount('button', 'O que é isso?')) === 1 &&
    t.indexOf('Contas do ano são as que vêm') < t.indexOf('Descrição'), t.slice(0, 400));
  ok('D42 cadastro de conta do ano: cota única e parcelado explicados com exemplo numérico (IPVA de R$ 2.400,00; IPTU de R$ 1.800,00 em 10 parcelas de R$ 180,00, de fevereiro a novembro)',
    t.includes('Cota única: o valor do ano sai de uma vez. Ex.: IPVA de R$ 2.400,00, que vence em janeiro.') && t.includes('Em parcelas: o valor do ano é dividido em vezes. Ex.: IPTU de R$ 1.800,00 em 10 parcelas de R$ 180,00, de fevereiro a novembro.'));
  ok('D42 cadastro de conta do ano: exemplos no mês, no dia e no valor (cota única)', t.includes('Em que mês a conta vence. Ex.: IPVA em janeiro.') && t.includes('De 1 a 31. Ex.: dia 20 para uma conta que vence em 20/01.') && t.includes('Ex.: IPVA de R$ 2.400,00.'));
  ok('D42 cadastro de conta do ano: o que acontece nos anos seguintes (valor que muda: estimativa e "Informar o valor"; valor igual: nada a fazer)',
    t.includes('Se muda, o Clarevo usa o valor do ano passado como estimativa. Quando o carnê ou o boleto do ano chegar, abra a conta do ano e informe o valor em Ano a ano.') && t.includes('E nos próximos anos?') &&
    t.includes('Todo ano, o Clarevo cria as contas do ano dois meses antes do primeiro vencimento. Se o valor mudou, abra a conta do ano e use Informar o valor em Ano a ano: só aquele ano muda. Se o valor é sempre o mesmo, não precisa fazer nada.'));
  await radio('Não, é sempre o mesmo').click(); await p.waitForTimeout(300);
  ok('D42 "Não, é sempre o mesmo": a dica passa a dizer que o Clarevo repete o valor todo ano', (await body()).includes('Se é sempre o mesmo, o Clarevo repete o valor todo ano e você não precisa fazer nada.'));
  await radio('Em parcelas no ano').click(); await p.waitForTimeout(300); t = await body();
  ok('D42 cadastro em parcelas: os exemplos mudam para o mês da primeira parcela e o valor da parcela', t.includes('Em que mês vence a primeira parcela. Ex.: IPTU começa em fevereiro.') && t.includes('Ex.: a parcela de R$ 180,00 do IPTU.'));
  await radio('Sim, muda todo ano (como IPVA e IPTU)').click(); await p.waitForTimeout(300);
  ok('D42 cadastro em parcelas, valor que muda: a dica antiga continua e ganha o exemplo da parcela', (await body()).includes('Use o valor do último ano. Ele aparece como estimado até você informar o valor do ano. Ex.: a parcela de R$ 180,00 do IPTU.'));
  await radio('Dezembro').click(); await field('Dia do vencimento').fill('10'); await field('Quantas parcelas por ano?').fill('4'); await p.waitForTimeout(400);
  ok('D42 cadastro em parcelas: "Primeiro ano" ganha a explicação de que o Clarevo cuida dos anos seguintes', (await body()).includes('O ano da primeira conta que o Clarevo vai criar. Dos anos seguintes ele cuida sozinho.'));
  await keepText();
  await scrollTo('Como você paga?');
  await shot('220_conta_do_ano_cadastro_como_paga');
  await p.setViewportSize({ width: 320, height: 800 }); await p.waitForTimeout(400);
  await innerChecks('D42 cadastro de conta do ano 320px');
  await scrollTo('Como você paga?');
  await shot('220_conta_do_ano_cadastro_como_paga_320px');
  await scrollTo('E nos próximos anos?');
  await shot('221_conta_do_ano_cadastro_proximos_anos_320px');
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(300);
  await scrollTo('E nos próximos anos?');
  await shot('221_conta_do_ano_cadastro_proximos_anos');
  // "O que é isso?" abre o tema de Aprender que já existe (sem tema novo) e volta à tarefa.
  await p.evaluate(() => window.scrollTo(0, 0));
  await field('Descrição').fill('Matrícula');
  await btn('O que é isso?').click(); await waitText('Contas que chegam uma vez por ano'); await p.waitForTimeout(600); t = await body();
  ok('D42 "O que é isso?" abre o tema de Aprender "Contas que chegam uma vez por ano" (já existente, com fonte) e oferece voltar à tarefa', d42Path() === '/explicacao/contas-do-ano' && t.includes('Fontes') && (await visibleCount('button', /^Voltar à tarefa/)) >= 1, `${d42Path()} ${t.slice(0, 200)}`);
  await btn('Voltar à tarefa').click(); await waitText('Como você paga?'); await p.waitForTimeout(500);
  ok('D42 voltar do tema mantém o que a pessoa digitou no cadastro', (await field('Descrição').inputValue()) === 'Matrícula' && (await radio('Em parcelas no ano').getAttribute('aria-checked')) === 'true');
  await btn('Cancelar').click(); await p.waitForTimeout(400); if (await visibleCount('button', 'Descartar alterações')) await btn('Descartar alterações').click();
  await waitText('Por ano, se os valores não mudarem');

  // Detalhe: a explicação do que cada coisa faz, "Como ler" em Ano a ano e o caminho para "Informar o valor".
  await otherDevice(async (repo, ctx) => {
    await repo.createSeries(`e2e-${Math.random()}`, ctx, { kind: 'anual', nature: 'conta', description: 'Matrícula', category: 'Educação', amountCents: 120000, amountMode: 'variavel', dueDay: 10, firstDueMonth: '2026-12', firstNumber: 1, installmentTotal: null, partsPerYear: 1, lastMonth: null });
  });
  await waitText('Matrícula'); await p.waitForTimeout(500);
  await openRow(/^Matrícula, /); await waitText('Ano a ano'); await p.waitForTimeout(500); t = await body();
  ok('D42 detalhe da conta do ano: a regra dos dois meses antes continua, e agora diz como informar o valor de um ano, com "O que é isso?"',
    t.includes('Cada ano entra em Contas a pagar dois meses antes do primeiro vencimento e só entra em Ainda a pagar no mês em que vence.') &&
    t.includes('Quando o valor de um ano mudar, use Informar o valor daquele ano, em Ano a ano. Só ele muda; os outros continuam com a referência.') && (await visibleCount('button', 'O que é isso?')) === 1);
  ok('D42 "Ano a ano": legenda com previsto, informar o valor e tirada', t.includes('Cada linha é um ano da conta. Previsto: o Clarevo ainda vai criar a conta, dois meses antes de vencer.') &&
    t.includes('Quando o carnê ou o boleto de um ano chegar com outro valor, toque em Informar o valor desse ano. Só ele muda.') && t.includes('Tirada: você marcou que aquela conta não houve.'));
  ok('D42 "Ano a ano": o botão do ano em aberto é "Informar o valor de 2026"', (await visibleCount('button', 'Informar o valor de 2026')) === 1);
  await keepText();
  await scrollTo('Ano a ano');
  await shot('222_conta_do_ano_detalhe');
  await p.setViewportSize({ width: 320, height: 800 }); await p.waitForTimeout(400);
  await innerChecks('D42 detalhe da conta do ano 320px');
  await scrollTo('Ano a ano');
  await shot('222_conta_do_ano_detalhe_320px');
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(300);
  await btn('Informar o valor de 2026').click(); await waitText('Use o valor do carnê ou do boleto de 2026.'); await p.waitForTimeout(400); t = await body();
  ok('D42 "Informar o valor de 2026": diz que vale só para 2026 e que os outros anos continuam com a referência', t.includes('Isso vale só para 2026. Os outros anos continuam com a referência atual.'));
  await keepText();
  await shot('223_conta_do_ano_informar_valor');
  await p.setViewportSize({ width: 320, height: 800 }); await p.waitForTimeout(400);
  await innerChecks('D42 informar o valor do ano 320px');
  await shot('223_conta_do_ano_informar_valor_320px');
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(300);
  await btn('Cancelar').click(); await p.waitForTimeout(400); if (await visibleCount('button', 'Descartar alterações')) await btn('Descartar alterações').click();
  await waitText('Ano a ano');
  // Editar a conta do ano: o texto lembra que, para um ano só, vale "Informar o valor".
  await btn('Mudar valor ou dia a partir de uma conta').click(); await waitText('Aplicar a partir de'); await p.waitForTimeout(400);
  ok('D42 editar a conta do ano: lembra que para o valor de um ano só se usa "Informar o valor", em Ano a ano', (await body()).includes('Para mudar o valor de um ano só, use Informar o valor, em Ano a ano. Aqui a mudança vale também para os anos seguintes.'));
  await keepText();
  await btn('Cancelar').click(); await p.waitForTimeout(400); if (await visibleCount('button', 'Descartar alterações')) await btn('Descartar alterações').click();
  await goResumo().catch(() => {});

  const forbidden = screenTexts.map((s) => s.match(FORBIDDEN)?.[0]).filter(Boolean);
  ok('contas do ano e calculadoras: nenhum termo proibido nem travessão longo nas telas novas', screenTexts.length > 0 && forbidden.length === 0, `${screenTexts.length} telas ${forbidden.join(' | ')}`);
  ok('sem erros de JavaScript no console', errors.length === 0, errors.slice(0,3).join(' | '));
  await b.close();
  for (const r of results) console.log(r.join('  '));
  const passed = results.filter(r => r[0] === 'OK ').length;
  console.log(`\n${passed}/${results.length} verificações OK`);
  server.close();
  process.exit(passed === results.length ? 0 : 1);
})().catch(async (e) => { try { const shotPath = path.join(os.tmpdir(), 'clarevo-e2e-erro.png'); await globalThis.__page?.screenshot({ path: shotPath }); console.log(`Tela do erro: ${shotPath}`); console.log((await globalThis.__page?.locator('body').innerText())?.slice(0, 600)); } catch {} for (const r of results) console.log(r.join('  ')); console.error('ERRO NO ROTEIRO:', e.message.slice(0,700)); server.close(); process.exit(1); });
