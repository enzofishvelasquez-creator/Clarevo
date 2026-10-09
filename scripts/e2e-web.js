/**
 * Roteiro de verificação do primeiro ciclo, do Ciclo A (gastos fixos e parcelamentos), do Ciclo A3 (contas do ano),
 * de "Primeiros passos" no Resumo, dos atalhos de Movimentações, do Ciclo A6 (achar tudo e calculadoras), do Ciclo A4
 * (seus últimos meses, com o cenário fictício "retorno" da demonstração) e do Ciclo A5 (Aprender e dúvidas) na versão
 * web, em modo demonstração (acesso simulado).
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
  const headingList = () => p.evaluate(() => [...document.querySelectorAll('[role=heading]')].filter((e) => e.getBoundingClientRect().width > 0).map((e) => `${e.getAttribute('aria-level')}:${e.textContent}`));

  // 1. Cadastro de uma conta nova (acesso simulado)
  await p.goto(`http://localhost:${PORT}/`); await waitText('Seu dinheiro');
  await shot('01_boas_vindas');
  await btn('Criar conta').click(); await waitText('Nome de apresentação');
  await field('Nome de apresentação').fill('Ana Teste');
  await field('E-mail').fill('ana@exemplo');
  await field('Senha').fill('abc');
  await btn('Criar conta').click(); await p.waitForTimeout(300);
  let t = await body();
  ok('cadastro: valida e-mail e senha junto ao campo', t.includes('Confira o e-mail informado.') && t.includes('Use pelo menos 8 caracteres, com letras e números.'));
  await field('E-mail').fill('ana@exemplo.com'); await field('Senha').fill('senha1234');
  await btn('Criar conta').click(); await waitText('Confira seu e-mail');
  await shot('02_confirme_email');
  await btn('Já confirmei meu e-mail').click(); await waitText('Ainda não identificamos a confirmação');
  ok('confirmação pendente não libera acesso', (await body()).includes('Ainda não identificamos a confirmação'));
  await btn('Simular abertura do link').click();
  await btn('Já confirmei meu e-mail').click(); await waitText('Sua primeira conta');
  await shot('03_primeira_conta');
  ok('primeira conta sugere "Conta principal"', (await field('Nome da conta').inputValue()) === 'Conta principal');
  await btn('Começar meu mês').click(); await waitText('Diferença do mês');
  // O card de contas a pagar espera a geração do dia dos gastos fixos (que, numa conta nova, não cria nada).
  for (const x of ['Nenhuma conta a pagar em aberto.', 'Nenhum pagamento em outubro de 2026']) await waitText(x).catch(() => {});
  t = await body();
  ok('conta nova começa vazia (sem dados fictícios)', t.includes('R$ 0,00') && t.includes('Nenhuma conta a pagar em aberto.') && t.includes('Nenhum pagamento em outubro de 2026'));
  ok('conta nova oferece anotar conta a pagar', (await p.getByRole('button', { name: 'Anotar conta a pagar', exact: true }).filter({ visible: true }).count()) === 1);
  await shot('04_resumo_conta_nova');
  await p.getByRole('button', { name: /^Ainda a pagar neste mês, R\$ 0,00/ }).filter({ visible: true }).first().click(); await waitText('Nenhuma conta a pagar em aberto');
  ok('conta nova: lista de contas a pagar vazia com o botão de anotar', (await body()).includes('Anote contas que ainda vão vencer') && (await p.getByRole('button', { name: 'Anotar conta a pagar', exact: true }).filter({ visible: true }).count()) === 1);
  await btn('Voltar').click(); await waitText('Diferença do mês');

  // Primeiros passos (conta nova): card no Resumo, depois dos avisos e antes de "Anotar gasto". Só leva às telas de
  // cadastro; nenhum dado de exemplo. Cada passo é um botão com o nome inteiro (", concluído" quando pronto).
  const PP = {
    fixos: 'Cadastre seus gastos fixos. Aluguel, escola, luz, internet e parcelas, uma vez só.',
    recebido: 'Registre o que você recebeu este mês. Salário ou outra renda.',
    pago: 'Anote um gasto já pago. Mercado, farmácia ou transporte.',
  };
  const ppDone = (k) => PP[k].replace('. ', ', concluído. ');
  const ppRows = () => cardButtons('Primeiros passos');
  const ppIs = (rows) => async () => JSON.stringify(await ppRows()) === JSON.stringify([...rows, 'Agora não']);
  await waitText('Primeiros passos');
  t = await body();
  ok('primeiros passos: conta nova vê os três passos, nenhum concluído, e "Agora não"', await ppIs([PP.fixos, PP.recebido, PP.pago])() &&
    t.includes('Três passos para o Clarevo mostrar o seu mês de verdade.') && t.includes('R$ 0,00'), JSON.stringify(await ppRows()));
  const ppOrder = await p.evaluate(() => {
    const top = (e) => (e ? e.getBoundingClientRect().top : null);
    const h = [...document.querySelectorAll('[role=heading]')].find((e) => e.textContent === 'Primeiros passos' && e.getBoundingClientRect().width > 0);
    const a = [...document.querySelectorAll('[role=button]')].find((e) => e.textContent === 'Anotar gasto' && e.getBoundingClientRect().width > 0);
    const steps = [...document.querySelectorAll('[role=button]')].filter((e) => /^(Cadastre|Registre|Anote um)/.test(e.getAttribute('aria-label') || '') && e.getBoundingClientRect().width > 0);
    return { card: top(h), anotar: top(a), level: h?.getAttribute('aria-level'), minStep: Math.round(Math.min(...steps.map((s) => s.getBoundingClientRect().height))) };
  });
  ok('primeiros passos: título de nível 2, antes de "Anotar gasto", passos com 56 px', ppOrder.card !== null && ppOrder.anotar !== null && ppOrder.card < ppOrder.anotar && ppOrder.level === '2' && ppOrder.minStep >= 56, JSON.stringify(ppOrder));
  // Ciclo A4: conta nova (sem nenhuma anotação) nunca vê "Seus últimos meses"; os títulos do Resumo seguem na ordem.
  ok('conta nova: sem a faixa "Seus últimos meses" e com os títulos do Resumo na ordem de sempre', !(await bandShown()) &&
    JSON.stringify(await headingList()) === JSON.stringify(['2:Outubro de 2026', '2:Primeiros passos', '2:Pagamentos do mês']), JSON.stringify(await headingList()));
  await layoutChecks('primeiros passos 390px');
  await scrollTo('Primeiros passos');
  await shot('50_primeiros_passos');
  await p.setViewportSize({ width: 320, height: 800 }); await p.waitForTimeout(400);
  await layoutChecks('primeiros passos 320px');
  await scrollTo('Primeiros passos');
  await shot('50_primeiros_passos_320px');
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(300);
  // Só no mês corrente e no contexto Pessoal.
  await p.getByRole('button', { name: /Mês anterior/ }).filter({ visible: true }).first().click(); await waitText('Setembro de 2026'); await p.waitForTimeout(600);
  ok('primeiros passos: fora do mês anterior', !(await headingShown('Primeiros passos')));
  await p.getByRole('button', { name: /Próximo mês/ }).filter({ visible: true }).first().click(); await waitText('Outubro de 2026'); await waitText('Primeiros passos');
  await p.getByRole('tab', { name: 'Ver dados de Família' }).filter({ visible: true }).first().click(); await waitText('Nenhuma família vinculada'); await p.waitForTimeout(400);
  ok('primeiros passos: fora de Família', !(await headingShown('Primeiros passos')));
  await p.getByRole('tab', { name: 'Ver dados de Pessoal' }).filter({ visible: true }).first().click(); await waitText('Diferença do mês'); await waitText('Primeiros passos');
  // Passo 1 abre o cadastro de gasto fixo; o passo fica concluído quando existe um gasto fixo.
  await btn(PP.fixos).click(); await waitText('Salvando em Pessoal');
  ok('primeiros passos: o passo 1 abre "Novo gasto fixo", vazio, em "Todo mês"', (await h1Name()) === 'Novo gasto fixo' && (await radio('Todo mês').getAttribute('aria-checked')) === 'true' && (await field('Descrição').inputValue()) === '');
  await field('Descrição').fill('Aluguel'); await field('Valor por mês').fill('1500'); await field('Dia do vencimento').fill('10');
  await btn('Salvar gasto fixo').click(); await waitText('Gasto fixo salvo');
  // Do detalhe do gasto fixo de volta ao Resumo (as telas empilhadas escondem a barra de abas).
  const tabsBack = async () => {
    const tab = () => p.getByRole('tab', { name: 'Resumo' }).filter({ visible: true });
    for (let i = 0; i < 8 && (await tab().count()) === 0; i++) { await btn('Voltar').click(); await p.waitForTimeout(400); }
    await tab().first().click(); await waitText('Diferença do mês');
  };
  await tabsBack();
  await waitUntil(ppIs([ppDone('fixos'), PP.recebido, PP.pago]), 8000);
  ok('primeiros passos: gasto fixo cadastrado marca o passo 1 como concluído', await ppIs([ppDone('fixos'), PP.recebido, PP.pago])(), JSON.stringify(await ppRows()));
  // Passo 2 abre "Registrar recebimento".
  await btn(PP.recebido).click(); await waitText('Data do recebimento');
  ok('primeiros passos: o passo 2 abre o registro de recebimento', (await visibleCount('button', 'Salvar recebimento')) === 1);
  await field('Descrição').fill('Salário'); await field('Valor em reais').fill('3000');
  await btn('Salvar recebimento').click(); await waitText('Recebimento salvo');
  await btn('Ver resumo do mês').click(); await waitText('Diferença do mês');
  await waitUntil(ppIs([ppDone('fixos'), ppDone('recebido'), PP.pago]), 8000);
  ok('primeiros passos: recebimento do mês marca o passo 2; o passo 3 continua aberto', await ppIs([ppDone('fixos'), ppDone('recebido'), PP.pago])(), JSON.stringify(await ppRows()));
  await scrollTo('Primeiros passos');
  await shot('50_primeiros_passos_concluidos');
  // "Agora não": o card sai e o Resumo continua com "Anotar gasto".
  await btn('Agora não').click();
  // O card esmaece em 240 ms (sem animação com "Reduzir movimento") e sai inteiro, com o botão.
  await waitUntil(async () => !(await headingShown('Primeiros passos')) && (await visibleCount('button', 'Agora não')) === 0);
  const afterDismiss = { card: await headingShown('Primeiros passos'), anotar: await visibleCount('button', 'Anotar gasto'), agoraNao: await visibleCount('button', 'Agora não') };
  ok('"Agora não" tira o card e o Resumo continua com "Anotar gasto"', !afterDismiss.card && afterDismiss.anotar === 1 && afterDismiss.agoraNao === 0, JSON.stringify(afterDismiss));
  await p.getByRole('tab', { name: 'Movimentações' }).filter({ visible: true }).first().click(); await waitText('Registrar recebimento');
  await p.getByRole('tab', { name: 'Resumo' }).filter({ visible: true }).first().click(); await waitText('Diferença do mês'); await p.waitForTimeout(600);
  ok('"Agora não": o card não volta ao trocar de aba', !(await headingShown('Primeiros passos')) && (await visibleCount('button', 'Agora não')) === 0);

  // Sair limpa a sessão
  await p.getByRole('button', { name: 'Conta: perfil, segurança e acesso ao plano' }).filter({ visible: true }).first().click(); await waitText('Acesso ao plano');
  await shot('05_conta');
  await shot('05b_conta_seguranca', true);
  await btn('Sair deste aparelho').click(); await waitText('Seu dinheiro');
  ok('sair volta para boas-vindas', (await body()).includes('Seu dinheiro'));

  // Entrar com senha errada e certa
  await btn('Entrar').click(); await waitText('Esqueci minha senha');
  await field('E-mail').fill('ana@exemplo.com'); await field('Senha').fill('errada123');
  await btn('Entrar').click(); await waitText('Não foi possível entrar. Confira e-mail e senha.');
  ok('login inválido com mensagem neutra', true);
  ok('erro de login preserva o e-mail', (await field('E-mail').inputValue()) === 'ana@exemplo.com');

  // Recuperação de acesso
  await btn('Esqueci minha senha').click(); await waitText('Recuperar acesso');
  await btn('Enviar link').click(); await waitText('Se houver uma conta com esse endereço');
  ok('recuperação com resposta neutra e reenvio com intervalo', (await body()).includes('Enviar novamente em'));
  await btn('Demonstração: simular abertura do link').click(); await waitText('Salvar nova senha');
  await field('Nova senha').fill('nova12345'); await btn('Salvar nova senha').click();
  await waitText('Senha atualizada. Entre com a nova senha.');
  await btn('Entrar').click(); await waitText('Esqueci minha senha');
  ok('e-mail preenchido depois da nova senha', (await field('E-mail').inputValue()) === 'ana@exemplo.com');
  await field('Senha').fill('nova12345'); await btn('Entrar').click(); await waitText('Diferença do mês');
  ok('nova senha funciona e volta ao resumo', true);
  await waitText('Ainda a pagar neste mês'); await p.waitForTimeout(800);
  ok('"Agora não": depois de sair e entrar de novo, o card continua fora', !(await headingShown('Primeiros passos')) && (await visibleCount('button', 'Anotar gasto')) === 1);
  await p.getByRole('button', { name: 'Conta: perfil, segurança e acesso ao plano' }).filter({ visible: true }).first().click(); await waitText('Acesso ao plano');
  await btn('Sair deste aparelho').click(); await waitText('Seu dinheiro');

  // Primeiros passos numa segunda conta nova: anotar um gasto marca o passo 3; com os três prontos, o card sai de vez.
  await btn('Criar conta').click(); await waitText('Nome de apresentação');
  await field('Nome de apresentação').fill('Bia Teste'); await field('E-mail').fill('bia@exemplo.com'); await field('Senha').fill('senha1234');
  await btn('Criar conta').click(); await waitText('Confira seu e-mail');
  await btn('Simular abertura do link').click();
  await btn('Já confirmei meu e-mail').click(); await waitText('Sua primeira conta');
  await btn('Começar meu mês').click(); await waitText('Diferença do mês'); await waitText('Primeiros passos');
  ok('segunda conta nova também começa com os três passos em aberto', await ppIs([PP.fixos, PP.recebido, PP.pago])(), JSON.stringify(await ppRows()));
  await btn(PP.pago).click(); await waitText('Será salvo em');
  ok('primeiros passos: o passo 3 abre "Anotar gasto"', (await visibleCount('button', 'Salvar gasto')) === 1);
  await field('Descrição').fill('Mercado'); await field('Valor em reais').fill('120');
  await btn('Salvar gasto').click(); await waitText('Gasto salvo');
  await btn('Ver resumo do mês').click(); await waitText('Diferença do mês');
  await waitUntil(ppIs([PP.fixos, PP.recebido, ppDone('pago')]), 8000);
  ok('primeiros passos: gasto pago no mês marca o passo 3', await ppIs([PP.fixos, PP.recebido, ppDone('pago')])(), JSON.stringify(await ppRows()));
  await btn(PP.recebido).click(); await waitText('Data do recebimento');
  await field('Descrição').fill('Salário'); await field('Valor em reais').fill('2800');
  await btn('Salvar recebimento').click(); await waitText('Recebimento salvo');
  await btn('Ver resumo do mês').click(); await waitText('Diferença do mês');
  await waitUntil(ppIs([PP.fixos, ppDone('recebido'), ppDone('pago')]), 8000);
  await btn(PP.fixos).click(); await waitText('Salvando em Pessoal');
  await field('Descrição').fill('Internet'); await field('Valor por mês').fill('100'); await field('Dia do vencimento').fill('20');
  await btn('Salvar gasto fixo').click(); await waitText('Gasto fixo salvo');
  await tabsBack();
  await waitUntil(async () => !(await headingShown('Primeiros passos')), 8000);
  ok('primeiros passos: com os três passos prontos, o card sai', !(await headingShown('Primeiros passos')) && (await visibleCount('button', 'Anotar gasto')) === 1);
  await p.getByRole('button', { name: 'Conta: perfil, segurança e acesso ao plano' }).filter({ visible: true }).first().click(); await waitText('Acesso ao plano');
  await btn('Sair deste aparelho').click(); await waitText('Seu dinheiro');
  await btn('Entrar').click(); await waitText('Esqueci minha senha');
  await field('E-mail').fill('bia@exemplo.com'); await field('Senha').fill('senha1234'); await btn('Entrar').click(); await waitText('Diferença do mês');
  await waitText('Ainda a pagar neste mês'); await p.waitForTimeout(800);
  ok('primeiros passos concluídos: o card não volta depois de entrar de novo', !(await headingShown('Primeiros passos')));
  await p.getByRole('button', { name: 'Conta: perfil, segurança e acesso ao plano' }).filter({ visible: true }).first().click(); await waitText('Acesso ao plano');
  await btn('Sair deste aparelho').click(); await waitText('Seu dinheiro');
  // Na demonstração, as contas criadas existem só na memória da página: recarregar volta às boas-vindas e nada de
  // "Primeiros passos" fica gravado no aparelho (uma conta nova nunca herda o "Agora não" de outra com o mesmo identificador).
  await p.reload(); await waitText('Seu dinheiro');
  const ppStored = await p.evaluate(() => { try { return Object.keys(localStorage).filter((k) => k.startsWith('clarevo.primeiros-passos')); } catch { return ['erro']; } });
  ok('demonstração: recarregar volta às boas-vindas, sem "Primeiros passos" gravado no aparelho', ppStored.length === 0 && (await visibleCount('button', 'Ver demonstração com dados fictícios')) === 1, ppStored.join(' | '));

  // 2. Conta de demonstração e sequência de aceite
  await btn('Ver demonstração com dados fictícios').click(); await waitText('Diferença do mês'); await waitText('R$ 2.100,00');
  await p.waitForTimeout(500);
  t = await body();
  const totals = async () => { const s = await body(); return ['R$ 6','R$ 3'].length && s; };
  ok('base: 6.000 / 3.900 / 2.100 e 650 previstos', t.includes('R$ 6.000,00') && t.includes('R$ 3.900,00') && t.includes('R$ 2.100,00') && t.includes('R$ 650,00'));
  ok('base: card de contas a pagar com a próxima', t.includes('2 contas · próxima: Internet, 15/10'));
  ok('base: sem valores estimados em outubro (a Luz estimada vence em novembro)', !t.includes('em valores estimados'));
  await logoChecks('Resumo: logotipo "clarevo." no cabeçalho azul, sem o símbolo C');
  await shot('06_resumo_demo');
  ok('primeiros passos: fora da conta de demonstração com dados', !(await headingShown('Primeiros passos')) && (await visibleCount('button', 'Agora não')) === 0 && !t.includes('Três passos para o Clarevo'));
  // Ciclo A4: a demonstração padrão foi toda anotada em 07/10/2026 e não mostra a faixa; a ordem do Resumo não muda.
  ok('demonstração padrão: sem a faixa "Seus últimos meses" e com os títulos do Resumo na ordem de sempre', !(await bandShown()) && !t.includes('Sua última anotação') &&
    JSON.stringify(await headingList()) === JSON.stringify(['2:Outubro de 2026', '2:Pagamentos do mês']), JSON.stringify(await headingList()));

  const expectTotals = async (name, rec, pago, dif, aPagar = 'R$ 650,00') => {
    // Só a cópia visível: as outras abas e as telas da pilha continuam montadas, escondidas.
    await p.getByText(dif, { exact: true }).filter({ visible: true }).first().waitFor({ timeout: 8000 }).catch(() => {});
    await p.getByText(aPagar, { exact: true }).filter({ visible: true }).first().waitFor({ timeout: 8000 }).catch(() => {});
    const s = await body();
    ok(name, s.includes(rec) && s.includes(pago) && s.includes(dif) && s.includes(aPagar), `${rec} ${pago} ${dif} ${aPagar}`);
  };
  // "Ver resumo do mês" volta ao Resumo que já está na pilha (dismissTo): um único Resumo montado, nada para voltar,
  // mostrado do topo (o acesso à Conta, no alto do cabeçalho, fica dentro da tela).
  const singleResumo = async (name) => {
    const top = await p.getByRole('button', { name: 'Conta: perfil, segurança e acesso ao plano' }).filter({ visible: true }).first().boundingBox();
    ok(name, (await p.getByText('Diferença do mês', { exact: true }).count()) === 1 && (await p.getByRole('button', { name: 'Voltar', exact: true }).filter({ visible: true }).count()) === 0 && top !== null && top.y >= 0, `topo y=${top?.y}`);
  };
  // Telas empilhadas (detalhe, lista) escondem a barra de abas: volta até ela aparecer.
  // dismissTo não muda isso: depois de anotar ou pagar, a pessoa continua no detalhe, acima da lista.
  const goResumo = async () => {
    const tab = () => p.getByRole('tab', { name: 'Resumo' }).filter({ visible: true });
    for (let i = 0; i < 5 && (await tab().count()) === 0; i++) { await btn('Voltar').click(); await p.waitForTimeout(400); }
    await tab().first().click(); await waitText('Diferença do mês');
  };
  const openToPay = async () => { await p.getByRole('button', { name: /^Ainda a pagar neste mês, R\$/ }).filter({ visible: true }).first().click(); await waitText('Contas em aberto com vencimento até o fim do mês'); };
  const openRow = (name) => p.getByRole('button', { name }).filter({ visible: true }).first().click();

  // Validação
  await btn('Anotar gasto').click(); await waitText('Será salvo em');
  await btn('Salvar gasto').click(); await p.waitForTimeout(300);
  t = await body();
  ok('campos vazios: mensagens exatas', t.includes('Dê um nome para este registro.') && t.includes('Informe um valor maior que zero, como 80,00.'));
  await shot('07_anotar_erros');
  await field('Descrição').fill('Café'); await field('Valor em reais').fill('80,00'); await field('Data do pagamento').fill('31/09/2026');
  await btn('Salvar gasto').click(); await p.waitForTimeout(300);
  ok('data impossível 31/09: erro e campos preservados', (await body()).includes('Confira a data informada.') && (await field('Descrição').inputValue()) === 'Café' && (await field('Valor em reais').inputValue()) === '80,00');
  await field('Data do pagamento').fill('08/10/2026'); await btn('Salvar gasto').click(); await p.waitForTimeout(300);
  ok('data futura recusada', (await body()).includes('Use uma data até hoje.'));
  await field('Data do pagamento').fill(''); await field('Data do pagamento').pressSequentially('06102026');
  ok('data digitada só com números ganha as barras', (await field('Data do pagamento').inputValue()) === '06/10/2026');
  await p.getByRole('radio', { name: 'Hoje' }).filter({ visible: true }).first().click();
  ok('atalho Hoje preenche a data', (await field('Data do pagamento').inputValue()) === '07/10/2026');

  // Explicação preserva o rascunho
  await field('Data do pagamento').fill('07/10/2026');
  await p.getByRole('button', { name: 'Como este registro entra no mês?' }).filter({ visible: true }).first().click(); await waitText('Hipóteses do exemplo');
  await btn('Voltar à tarefa').click(); await waitText('Será salvo em');
  ok('voltar da explicação mantém o rascunho', (await field('Descrição').inputValue()) === 'Café' && (await field('Valor em reais').inputValue()) === '80,00');
  await shot('08_anotar_preenchido');

  // Descartar: cancelar mantém campos
  await btn('Voltar').click(); await waitText('Descartar o preenchimento?');
  ok('sair com alterações pede confirmação no contexto certo', (await body()).includes('Você tem alterações que ainda não foram salvas em Pessoal'));
  await shot('09_descartar');
  await btn('Continuar editando').click(); await p.waitForTimeout(300);
  ok('continuar editando mantém os campos', (await field('Valor em reais').inputValue()) === '80,00');

  // Criar gasto 80
  await btn('Salvar gasto').click(); await waitText('Gasto salvo');
  t = await body();
  ok('detalhe após salvar: contexto, conta, data, período', t.includes('Conta principal') && t.includes('07/10/2026') && t.includes('Outubro de 2026') && t.includes('Pessoal'));
  await shot('10_detalhe_gasto_salvo');
  await btn('Ver resumo do mês').click(); await waitText('Diferença do mês');
  await p.getByText('+ R$ 80,00').filter({ visible: true }).first().waitFor({ timeout: 2500 }).catch(() => {});
  ok('resumo mostra o efeito do gasto salvo', (await body()).includes('+ R$ 80,00'));
  await singleResumo('ver resumo do mês (gasto) volta ao Resumo da pilha, sem outra cópia');
  await expectTotals('criar gasto 80 → 3.980 / 2.020', 'R$ 6.000,00', 'R$ 3.980,00', 'R$ 2.020,00');
  await shot('11_resumo_apos_gasto');

  // Editar para 95
  await p.getByRole('button', { name: /Café, Pago · 07\/10\/2026/ }).click(); await waitText('Editar registro');
  await btn('Editar registro').click(); await waitText('Editar gasto');
  await field('Valor em reais').fill('95,00'); await btn('Salvar gasto').click(); await waitText('Alterações salvas');
  ok('edição mantém o mesmo registro', (await body()).includes('R$ 95,00'));
  await btn('Ver resumo do mês').click(); await waitText('Diferença do mês');
  await expectTotals('editar para 95 → 3.995 / 2.005', 'R$ 6.000,00', 'R$ 3.995,00', 'R$ 2.005,00');

  // Excluir: cancelar e depois confirmar
  await p.getByRole('button', { name: /Café, Pago · 07\/10\/2026/ }).click(); await waitText('Editar registro');
  await btn('Excluir registro').click(); await waitText('Excluir registro?');
  ok('confirmação de exclusão mostra descrição, valor e contexto', (await body()).includes('Café · R$ 95,00 · Pessoal'));
  await shot('12_confirmar_exclusao');
  await btn('Cancelar').click(); await p.waitForTimeout(300);
  await btn('Excluir registro').click(); await waitText('Excluir registro?');
  await p.getByRole('dialog').or(p.getByRole('alert')).getByRole('button', { name: 'Excluir registro' }).last().click(); await waitText('Registro excluído');
  ok('excluir volta para a tela de origem com aviso', (await body()).includes('Diferença do mês'));
  await goResumo();
  await expectTotals('excluir gasto → 3.900 / 2.100', 'R$ 6.000,00', 'R$ 3.900,00', 'R$ 2.100,00');

  // Recebimento 200 → 250 → excluir
  await p.getByRole('tab', { name: 'Movimentações' }).filter({ visible: true }).first().click(); await waitText('Registrar recebimento');
  await shot('13_movimentacoes');
  ok('movimentações agrupadas por dia com totais do mês', /ONTEM|Ontem/.test(await body()) && (await body()).includes('Pago em outubro'));
  await p.getByRole('radio', { name: 'Recebidos' }).filter({ visible: true }).first().click(); await p.waitForTimeout(300);
  ok('filtro Recebidos mostra só recebimentos', !(await body()).includes('Pago · '));
  await p.getByRole('radio', { name: 'Todos' }).filter({ visible: true }).first().click(); await p.waitForTimeout(300);
  // Atalhos de Movimentações: "Organizar", com Contas a pagar, Gastos fixos e parcelamentos e Calculadoras (Ciclo A6).
  // As duas primeiras legendas vêm dos dados (a mesma origem do card "Ainda a pagar"); o nome acessível junta título e legenda.
  const SC = {
    pagar: 'Contas a pagar, R$ 650,00 em aberto neste mês',
    fixos: 'Gastos fixos e parcelamentos, 5 cadastrados, com as contas do ano',
    calc: 'Calculadoras, Parcelado ou à vista, dívidas, reserva e outras contas',
  };
  await waitText('5 cadastrados, com as contas do ano').catch(() => {});
  t = await body();
  const scOrder = await p.evaluate(() => {
    const top = (sel, text) => [...document.querySelectorAll(sel)].find((e) => e.textContent === text && e.getBoundingClientRect().width > 0)?.getBoundingClientRect().top ?? null;
    return { anotar: top('[role=button]', 'Anotar gasto'), organizar: top('[role=heading]', 'Organizar'), totais: top('div[dir="auto"]', 'Pago em outubro') };
  });
  ok('movimentações: "Organizar" com os três atalhos e as legendas de outubro, entre os botões e os totais do mês', JSON.stringify(await sectionRows('Organizar')) === JSON.stringify([SC.pagar, SC.fixos, SC.calc]) &&
    ['R$ 650,00 em aberto neste mês', '5 cadastrados, com as contas do ano', 'Parcelado ou à vista, dívidas, reserva e outras contas'].every((x) => t.includes(x)) &&
    scOrder.anotar !== null && scOrder.organizar !== null && scOrder.totais !== null && scOrder.anotar < scOrder.organizar && scOrder.organizar < scOrder.totais, `${JSON.stringify(await sectionRows('Organizar'))} ${JSON.stringify(scOrder)}`);
  await layoutChecks('movimentações com atalhos 390px');
  await scrollTo('Organizar');
  await shot('51_movimentacoes_atalhos');
  await p.setViewportSize({ width: 320, height: 800 }); await p.waitForTimeout(400);
  await layoutChecks('movimentações com atalhos 320px');
  await scrollTo('Organizar');
  await shot('51_movimentacoes_atalhos_320px');
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(300);
  await btn(SC.pagar).click(); await waitText('Contas em aberto com vencimento até o fim do mês');
  ok('atalho "Contas a pagar" abre Contas a pagar', (await h1Name()) === 'Contas a pagar' && (await body()).includes('Seguro do carro'));
  await btn('Voltar').click(); await waitText('Registrar recebimento');
  await btn(SC.fixos).click(); await waitText('Por mês, se os valores não mudarem');
  ok('atalho "Gastos fixos e parcelamentos" abre a lista, com as contas do ano', (await h1Name()) === 'Gastos fixos e parcelamentos' && (await body()).includes('Contas do ano'));
  await btn('Voltar').click(); await waitText('Registrar recebimento');
  await btn(SC.calc).click(); await waitText('Decidir uma compra');
  ok('atalho "Calculadoras" abre /calcular', new URL(p.url()).pathname === '/calcular' && (await h1Name()) === 'Calculadoras', p.url());
  await btn('Voltar').click(); await waitText('Registrar recebimento');
  ok('voltar dos atalhos devolve Movimentações', (await p.getByRole('tab', { name: 'Movimentações', selected: true }).filter({ visible: true }).count()) === 1);
  await btn('Registrar recebimento').click(); await waitText('Data do recebimento');
  await field('Descrição').fill('<b>Freela</b>'); await field('Valor em reais').fill('200');
  await btn('Salvar recebimento').click(); await waitText('Recebimento salvo');
  ok('descrição com < e > aparece como texto', (await body()).includes('<b>Freela</b>'));
  await btn('Ver resumo do mês').click(); await waitText('Diferença do mês');
  await expectTotals('criar recebimento 200 → 6.200 / 2.300', 'R$ 6.200,00', 'R$ 3.900,00', 'R$ 2.300,00');
  await p.getByRole('button', { name: /^Recebido, R\$/ }).filter({ visible: true }).first().click(); await waitText('Recebimentos realizados');
  await shot('14_composicao_recebido');
  await p.getByRole('button', { name: /<b>Freela<\/b>, Recebido/ }).click(); await waitText('Editar registro');
  await btn('Editar registro').click(); await waitText('Editar recebimento');
  await field('Valor em reais').fill('250,00'); await btn('Salvar recebimento').click(); await waitText('Alterações salvas');
  await btn('Ver resumo do mês').click(); await waitText('Diferença do mês');
  await expectTotals('editar recebimento 250 → 6.250 / 2.350', 'R$ 6.250,00', 'R$ 3.900,00', 'R$ 2.350,00');
  await p.getByRole('tab', { name: 'Movimentações' }).filter({ visible: true }).first().click(); await waitText('Registrar recebimento');
  await p.getByRole('button', { name: /<b>Freela<\/b>, Recebido/ }).click(); await waitText('Editar registro');
  await btn('Excluir registro').click(); await waitText('Excluir registro?');
  await p.getByRole('dialog').or(p.getByRole('alert')).getByRole('button', { name: 'Excluir registro' }).last().click(); await waitText('Registro excluído');
  await goResumo();
  await expectTotals('excluir recebimento → 6.000 / 2.100', 'R$ 6.000,00', 'R$ 3.900,00', 'R$ 2.100,00');

  // Contas a pagar (D-020, D-021): começa e termina na base completa
  await p.getByRole('button', { name: /^Ainda a pagar neste mês, R\$ 650,00/ }).filter({ visible: true }).first().click(); await waitText('Contas em aberto com vencimento até o fim do mês');
  t = await body();
  ok('lista: a vencer no mês e próximos meses fora do total', ['A vencer em outubro de 2026', 'Vence em 15/10/2026', 'Vence em 20/10/2026', 'Próximos meses', 'Seguro do carro', 'Não entram no total deste mês.'].every((x) => t.includes(x)));
  // Ciclo A: Aluguel, Luz e o financiamento são gastos fixos; Internet, Condomínio e Seguro continuam avulsas.
  const laterBase = ['Aluguel, vence em 05/11/2026, R$ 2.500,00, gasto fixo', 'Financiamento do carro, vence em 10/11/2026, R$ 850,00, parcela 13 de 48', 'Seguro do carro, vence em 10/11/2026, R$ 300,00', 'Luz, vence em 12/11/2026, cerca de R$ 180,00, valor estimado, gasto fixo'];
  const laterNow = await sectionRows('Próximos meses');
  ok('lista: próximos meses com Aluguel, parcela 13 de 48, Seguro e Luz estimada', JSON.stringify(laterNow) === JSON.stringify(laterBase) && ['Vence em 05/11/2026 · Todo mês', 'Vence em 10/11/2026 · Parcela 13 de 48', 'Vence em 12/11/2026 · Todo mês · estimado', '≈ R$ 180,00'].every((x) => t.includes(x)), (laterNow ?? []).join(' | '));
  ok('lista: aluguel de outubro pago pelo gasto fixo, em Pagas', JSON.stringify(await sectionRows('Pagas')) === JSON.stringify(['Aluguel, paga em 05/10/2026, R$ 2.500,00, gasto fixo']) && t.includes('Paga em 05/10/2026 · Todo mês'));
  ok('lista: sem valores estimados no total de outubro', !t.includes('em valores estimados'));
  // Ciclo A3: IPVA (20/01/2027) e IPTU (fevereiro a novembro de 2027) só entram dois meses antes do primeiro vencimento.
  ok('contas do ano: IPVA e IPTU ainda fora de Contas a pagar em outubro', !t.includes('IPVA') && !t.includes('IPTU') && !t.includes('Contas do ano aparecem aqui'));
  // Aluguel, Luz, Financiamento do carro e as contas do ano IPVA e IPTU.
  await waitText('5 cadastrados').catch(() => {});
  ok('lista: link "Gastos fixos e parcelamentos" com a contagem', (await visibleCount('button', 'Gastos fixos e parcelamentos, 5 cadastrados')) === 1);
  await shot('19_contas_a_pagar');

  await btn('Anotar conta a pagar').click(); await waitText('Salvando em Pessoal');
  ok('anotar conta a pagar: "Com que frequência?" começa em "Só uma vez"', (await visibleCount('radiogroup', 'Com que frequência?')) === 1 && (await radio('Só uma vez').getAttribute('aria-checked')) === 'true' && (await radio('Todo mês').getAttribute('aria-checked')) === 'false' && (await radio('Todo ano').getAttribute('aria-checked')) === 'false' && (await radio('Parcelado').getAttribute('aria-checked')) === 'false');
  const kindChips = await p.getByRole('radiogroup', { name: 'Com que frequência?' }).filter({ visible: true }).first().getByRole('radio').evaluateAll((es) => es.map((e) => e.textContent));
  ok('anotar conta a pagar: chips "Só uma vez", "Todo mês", "Todo ano" e "Parcelado", nessa ordem', JSON.stringify(kindChips) === JSON.stringify(['Só uma vez', 'Todo mês', 'Todo ano', 'Parcelado']), kindChips.join(' | '));
  // "Todo mês" leva o que foi digitado para o cadastro do gasto fixo, que pede confirmação antes de descartá-lo.
  await field('Descrição').fill('Academia'); await field('Valor em reais').fill('120');
  await radio('Todo mês').click(); await waitText('Novo gasto fixo');
  ok('"Todo mês" leva o que foi digitado para o gasto fixo', (await field('Descrição').inputValue()) === 'Academia' && (await field('Valor por mês').inputValue()) === '120,00');
  await btn('Cancelar').click(); await waitText('Descartar o preenchimento?');
  ok('cancelar o gasto fixo com o que foi digitado pede "Descartar o preenchimento?"', (await dialogText()).includes('Você tem alterações que ainda não foram salvas em Pessoal.'));
  await btn('Descartar alterações').click(); await waitText('Contas em aberto com vencimento até o fim do mês');
  ok('descartar volta para Contas a pagar sem salvar', !(await body()).includes('Academia'));
  await btn('Anotar conta a pagar').click(); await waitText('Salvando em Pessoal');
  await btn('Salvar conta a pagar').click(); await p.waitForTimeout(300);
  t = await body();
  ok('conta a pagar vazia: mensagens exatas', t.includes('Dê um nome para esta conta a pagar.') && t.includes('Informe um valor maior que zero, como 80,00.'));
  await shot('20_anotar_conta_erros');
  await field('Descrição').fill('Fatura do cartão'); await p.waitForTimeout(200);
  ok('aviso de fatura na conta a pagar', (await body()).includes('Se as compras do cartão já foram anotadas como gastos'));
  await field('Descrição').fill('Água'); await field('Valor em reais').fill('90'); await field('Data de vencimento').fill('31/09/2026');
  await btn('Salvar conta a pagar').click(); await p.waitForTimeout(300);
  ok('vencimento 31/09: erro e descrição preservada', (await body()).includes('Confira a data informada.') && (await field('Descrição').inputValue()) === 'Água');
  await field('Data de vencimento').fill('08/10/2028'); await btn('Salvar conta a pagar').click(); await p.waitForTimeout(300);
  ok('vencimento fora da janela recusado', (await body()).includes('Use um vencimento entre 1 ano atrás e 2 anos à frente.'));
  await field('Data de vencimento').fill('05/10/2026'); await p.waitForTimeout(200);
  ok('aviso de conta a pagar já vencida', (await body()).includes('Esta conta a pagar já venceu.'));
  await btn('Salvar conta a pagar').click(); await waitText('Conta a pagar salva');
  t = await body();
  ok('detalhe da conta salva: vencida', t.includes('Vencida') && t.includes('Venceu em 05/10/2026'));

  await goResumo();
  await expectTotals('anotar Água → a pagar 740', 'R$ 6.000,00', 'R$ 3.900,00', 'R$ 2.100,00', 'R$ 740,00');
  t = await body();
  ok('card: 3 contas e 1 vencida', t.includes('3 contas · próxima: Internet, 15/10') && t.includes('1 conta vencida'));

  await btn('Anotar conta a pagar').click(); await waitText('Salvando em Pessoal');
  await field('Descrição').fill('Gás'); await field('Valor em reais').fill('40'); await field('Data de vencimento').fill('28/09/2026');
  await btn('Salvar conta a pagar').click(); await waitText('Conta a pagar salva');
  await goResumo();
  await expectTotals('anotar Gás → a pagar 780', 'R$ 6.000,00', 'R$ 3.900,00', 'R$ 2.100,00', 'R$ 780,00');
  t = await body();
  ok('card: inclui a vencida de setembro', t.includes('Inclui R$ 40,00 de contas vencidas antes de outubro.') && t.includes('2 contas vencidas'));
  await p.getByRole('button', { name: /Mês anterior/ }).filter({ visible: true }).first().click(); await waitText('Setembro de 2026'); await waitText('Previsto para setembro de 2026');
  for (const v of ['R$ 40,00', 'R$ 3.750,00']) await p.getByText(v, { exact: true }).filter({ visible: true }).first().waitFor({ timeout: 8000 }).catch(() => {});
  t = await body();
  ok('setembro: previsto 40 e pago 3.750', t.includes('Previsto para setembro de 2026') && t.includes('R$ 40,00') && t.includes('R$ 3.750,00'));
  await p.getByRole('button', { name: /Próximo mês/ }).filter({ visible: true }).first().click(); await waitText('Outubro de 2026'); await waitText('Ainda a pagar neste mês');

  await openToPay();
  // Revisar contas vencidas (Ciclo A): com duas ou mais vencidas, a seção mostra o atalho. Só conferência; nada é marcado aqui.
  // Ciclo A5 (spec3 §3.7): no fim da seção, "Quanto custa pagar depois do vencimento?" leva ao tema de Aprender.
  ok('vencidas: duas contas, o atalho "Revisar vencidas" e, no fim, "Quanto custa pagar depois do vencimento?"', JSON.stringify(await sectionRows('Vencidas')) === JSON.stringify(['Revisar vencidas', 'Gás, venceu em 28/09/2026, R$ 40,00', 'Água, venceu em 05/10/2026, R$ 90,00', 'Quanto custa pagar depois do vencimento?']),
    JSON.stringify(await sectionRows('Vencidas')));
  await btn('Quanto custa pagar depois do vencimento?').click(); await waitText('R$ 204,67');
  ok('Vencidas: "Quanto custa pagar depois do vencimento?" abre "Multa e juros por atraso", com o exemplo de R$ 204,67', new URL(p.url()).pathname === '/explicacao/multa-juros-atraso' &&
    (await p.locator('h1').filter({ hasText: /^Multa e juros por atraso$/ }).count()) === 1 && (await visibleCount('button', 'Voltar à tarefa')) === 1, p.url());
  await scrollTo('Exemplo');
  await shot('92_vencidas_multa_e_juros');
  await btn('Voltar à tarefa').click(); await waitText('Contas em aberto com vencimento até o fim do mês');
  ok('"Voltar à tarefa" volta para Contas a pagar', new URL(p.url()).pathname === '/a-pagar', p.url());
  await btn('Revisar vencidas').click(); await waitText('Marque o que você já pagou e tire o que não houve.');
  await waitText('Venceu em 05/10/2026 · R$ 90,00');
  ok('revisar vencidas: cada linha com "Já paguei" e "Não houve"', (await body()).includes('Contas vencidas') &&
    (await Promise.all(['Já paguei Gás de setembro', 'Não houve Gás de setembro', 'Já paguei Água de outubro', 'Não houve Água de outubro'].map((n) => visibleCount('button', n)))).every((n) => n === 1));
  ok('revisar vencidas: caixas nas contas de valor fixo, nenhuma marcada', JSON.stringify(await p.getByRole('checkbox').filter({ visible: true }).evaluateAll((es) => es.map((e) => e.getAttribute('aria-checked')))) === '["false","false"]' &&
    (await visibleCount('button', 'Marcar as selecionadas como pagas no vencimento')) === 1);
  await p.getByRole('checkbox').filter({ visible: true }).first().click();
  ok('revisar vencidas: marcar uma caixa muda o botão do lote', (await visibleCount('button', 'Marcar a 1 selecionada como paga no vencimento')) === 1);
  await btn('Não houve Água de outubro').click(); await waitText('Tirar a conta de outubro?');
  ok('revisar vencidas: "Não houve" pede confirmação', (await dialogText()).includes('Tirar conta'));
  await btn('Cancelar').click(); await p.waitForTimeout(300);
  await shot('34_revisar_vencidas');
  await innerChecks('revisar vencidas 390px');
  await p.setViewportSize({ width: 320, height: 800 }); await p.waitForTimeout(400);
  await innerChecks('revisar vencidas 320px');
  await shot('34_revisar_vencidas_320px', true);
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(300);
  await btn('Voltar').click(); await waitText('Contas em aberto com vencimento até o fim do mês');
  await openRow(/^Internet, vence em 15\/10\/2026/); await waitText('Marcar como paga');
  await btn('Marcar como paga').click(); await waitText('Confirmar pagamento');
  ok('pagamento sugere previsto, hoje e a conta', (await field('Valor pago').inputValue()) === '150,00' && (await field('Data do pagamento').inputValue()) === '07/10/2026' && (await body()).includes('Conta principal'));
  await field('Data do pagamento').fill('08/10/2026'); await btn('Confirmar pagamento').click(); await p.waitForTimeout(300);
  ok('pagamento com data futura recusado', (await body()).includes('Use uma data até hoje. A conta só é marcada como paga depois do pagamento.'));
  await field('Data do pagamento').fill('07/10/2026'); await field('Valor pago').fill('155,00'); await p.waitForTimeout(200);
  t = await body();
  ok('pagamento anuncia o mês e a diferença do previsto', t.includes('Um gasto de R$ 155,00 será registrado em Pago de outubro de 2026') && t.includes('O valor pago é diferente do previsto (R$ 150,00).'));
  // A captura mostra os avisos, que ficam abaixo dos campos.
  await p.getByText('O valor pago é diferente do previsto', { exact: false }).filter({ visible: true }).first().scrollIntoViewIfNeeded();
  await shot('21_marcar_como_paga');
  await btn('Confirmar pagamento').click(); await waitText('Pagamento registrado');
  t = await body();
  ok('detalhe da conta paga: pago e previsto', t.includes('Paga') && t.includes('R$ 155,00') && t.includes('Valor previsto') && t.includes('R$ 150,00'));
  ok('conta avulsa paga: "Repetir todo mês" e "Repetir todo ano"', (await visibleCount('button', 'Repetir todo mês')) === 1 && (await visibleCount('button', 'Repetir todo ano')) === 1);
  await shot('22_conta_paga');

  await btn('Ver resumo do mês').click(); await waitText('Diferença do mês');
  await p.getByText('+ R$ 155,00').filter({ visible: true }).first().waitFor({ timeout: 2500 }).catch(() => {});
  ok('resumo mostra o efeito do pagamento em Pago', (await body()).includes('+ R$ 155,00'));
  await singleResumo('ver resumo do mês (conta a pagar) volta ao Resumo da pilha, sem outra cópia');
  await expectTotals('pagar Internet 155 → 4.055 / 1.945', 'R$ 6.000,00', 'R$ 4.055,00', 'R$ 1.945,00', 'R$ 630,00');
  await p.getByRole('tab', { name: 'Movimentações' }).filter({ visible: true }).first().click(); await waitText('Registrar recebimento');
  // A lista de Movimentações já estava aberta: espera a nova leitura trazer o gasto do pagamento.
  await p.getByRole('button', { name: /^Internet, Pago · 07\/10\/2026 · conta a pagar/ }).filter({ visible: true }).first().waitFor({ timeout: 8000 }).catch(() => {});
  ok('movimentações: gasto gerado pela conta a pagar', (await p.getByRole('button', { name: /^Internet, Pago · 07\/10\/2026 · conta a pagar/ }).filter({ visible: true }).count()) > 0);
  // A partir da aba Movimentações, "Ver resumo do mês" também seleciona a aba Resumo.
  await openRow(/^Internet, Pago · 07\/10\/2026 · conta a pagar/); await waitText('Ver conta a pagar');
  await btn('Ver resumo do mês').click(); await waitText('Diferença do mês');
  ok('ver resumo do mês a partir de Movimentações abre a aba Resumo', (await p.getByRole('tab', { name: 'Resumo', selected: true }).filter({ visible: true }).count()) === 1);
  await singleResumo('ver resumo do mês a partir de Movimentações não deixa cópia na pilha');

  await goResumo(); await openToPay();
  await openRow(/^Internet, paga em 07\/10\/2026/); await waitText('Desfazer pagamento');
  await btn('Desfazer pagamento').click(); await waitText('Desfazer pagamento?');
  t = await body();
  ok('desfazer pagamento mostra conta, valor, data e contexto', t.includes('Internet · R$ 155,00 pago em 07/10/2026 · Pessoal') && t.includes('A conta a pagar volta para Ainda a pagar.'));
  await shot('23_desfazer_pagamento');
  await confirmIn('Desfazer pagamento'); await waitText('Pagamento desfeito');
  await goResumo();
  await expectTotals('desfazer → a pagar 780', 'R$ 6.000,00', 'R$ 3.900,00', 'R$ 2.100,00', 'R$ 780,00');

  await openToPay();
  await openRow(/^Internet, vence em 15\/10\/2026/); await waitText('Marcar como paga');
  await btn('Marcar como paga').click(); await waitText('Confirmar pagamento');
  await btn('Confirmar pagamento').click(); await waitText('Pagamento registrado');
  await btn('Adicionar a conta do próximo mês').click(); await waitText('Salvando em Pessoal');
  ok('conta do próximo mês preenchida', (await field('Descrição').inputValue()) === 'Internet' && (await field('Valor em reais').inputValue()) === '150,00' && (await field('Data de vencimento').inputValue()) === '15/11/2026');
  await btn('Salvar conta a pagar').click(); await waitText('Conta a pagar salva');
  ok('conta do próximo mês salva', (await body()).includes('Vence em 15/11/2026'));
  await btn('Voltar').click(); await waitText('A conta a pagar de novembro de 2026 já foi anotada.').catch(() => {});
  ok('conta paga avisa que a de novembro já foi anotada', (await body()).includes('A conta a pagar de novembro de 2026 já foi anotada.') && (await p.getByRole('button', { name: 'Adicionar a conta do próximo mês', exact: true }).filter({ visible: true }).count()) === 0);
  await btn('Ver resumo do mês').click(); await waitText('Diferença do mês');
  await expectTotals('pagar Internet 150 → 4.050 / 1.950', 'R$ 6.000,00', 'R$ 4.050,00', 'R$ 1.950,00', 'R$ 630,00');

  await p.getByRole('tab', { name: 'Movimentações' }).filter({ visible: true }).first().click(); await waitText('Registrar recebimento');
  await openRow(/^Internet, Pago · 07\/10\/2026 · conta a pagar/); await waitText('Excluir registro');
  await btn('Excluir registro').click(); await waitText('Excluir registro?');
  ok('excluir o gasto avisa que a conta a pagar reabre', (await body()).includes('A conta a pagar ligada a este gasto volta para Ainda a pagar.'));
  await confirmIn('Excluir registro'); await waitText('Registro excluído');
  await goResumo();
  await expectTotals('excluir gasto da conta → a pagar 780', 'R$ 6.000,00', 'R$ 3.900,00', 'R$ 2.100,00', 'R$ 780,00');

  await openToPay();
  for (const row of [/^Água, venceu em 05\/10\/2026/, /^Gás, venceu em 28\/09\/2026/, /^Internet, vence em 15\/11\/2026/]) {
    await openRow(row); await waitText('Excluir conta a pagar');
    await btn('Excluir conta a pagar').click(); await waitText('Excluir conta a pagar?');
    if (row.source.includes('Água')) ok('excluir conta a pagar mostra conta, valor, vencimento e contexto', (await body()).includes('Água · R$ 90,00 · vence em 05/10/2026 · Pessoal'));
    await confirmIn('Excluir conta a pagar'); await waitText('Conta a pagar excluída'); await waitText('Contas em aberto com vencimento até o fim do mês');
  }
  await waitGone('Água'); await waitGone('Gás');
  t = await body();
  ok('lista volta à base, sem Água nem Gás', t.includes('R$ 650,00') && t.includes('Seguro do carro') && !t.includes('Água') && !t.includes('Gás'));
  await btn('Voltar').click(); await waitText('Diferença do mês');
  await expectTotals('excluir Água, Gás e Internet de novembro → base', 'R$ 6.000,00', 'R$ 3.900,00', 'R$ 2.100,00');

  // Conta de novembro paga em outubro: o gasto conta em Pago de outubro e a conta aparece em "Pagas" de outubro.
  // Ainda a pagar não muda (ela estava em Próximos meses). Desfazer volta à base.
  await openToPay();
  await openRow(/^Seguro do carro, vence em 10\/11\/2026/); await waitText('Marcar como paga');
  await btn('Marcar como paga').click(); await waitText('Confirmar pagamento');
  await btn('Confirmar pagamento').click(); await waitText('Pagamento registrado');
  ok('seguro pago em outubro: resumo afetado é Pago de outubro', (await body()).includes('Pago de outubro de 2026'));
  await btn('Voltar').click(); await waitText('Já contam em Pago, no mês da data do pagamento.');
  // "Próximos meses" continua com os gastos fixos de novembro: o Seguro sai dessa seção e entra em "Pagas".
  const isSeguro = (r) => r.startsWith('Seguro do carro');
  await waitRows('Próximos meses', (rows) => rows !== null && !rows.some(isSeguro));
  t = await body();
  const paidNow = (await sectionRows('Pagas')) ?? [];
  const laterPaid = await sectionRows('Próximos meses');
  ok('conta de novembro paga em outubro aparece em Pagas de outubro e sai de Próximos meses',
    (await p.getByRole('button', { name: /^Seguro do carro, paga em 07\/10\/2026, R\$ 300,00, conta em Pago de outubro de 2026/ }).filter({ visible: true }).count()) === 1 &&
      paidNow.some((r) => /^Seguro do carro, paga em 07\/10\/2026/.test(r)) && laterPaid !== null && !laterPaid.some(isSeguro) &&
      JSON.stringify(laterPaid) === JSON.stringify(laterBase.filter((r) => !isSeguro(r))) && t.includes('R$ 650,00'), (laterPaid ?? []).join(' | '));
  await btn('Voltar').click(); await waitText('Diferença do mês');
  await expectTotals('pagar Seguro em outubro → 4.200 / 1.800, a pagar 650', 'R$ 6.000,00', 'R$ 4.200,00', 'R$ 1.800,00', 'R$ 650,00');
  await openToPay();
  await openRow(/^Seguro do carro, paga em 07\/10\/2026/); await waitText('Desfazer pagamento');
  await btn('Desfazer pagamento').click(); await waitText('Desfazer pagamento?');
  await confirmIn('Desfazer pagamento'); await waitText('Pagamento desfeito');
  await btn('Ver resumo do mês').click(); await waitText('Diferença do mês');
  await expectTotals('desfazer Seguro → base', 'R$ 6.000,00', 'R$ 3.900,00', 'R$ 2.100,00');
  await openToPay(); await waitText('Próximos meses');
  await waitRows('Pagas', (rows) => rows !== null && !rows.some(isSeguro));
  ok('seguro volta para Próximos meses e sai de Pagas', (await p.getByRole('button', { name: /^Seguro do carro, vence em 10\/11\/2026/ }).filter({ visible: true }).count()) === 1 &&
    JSON.stringify(await sectionRows('Próximos meses')) === JSON.stringify(laterBase) && !((await sectionRows('Pagas')) ?? []).some(isSeguro));
  await btn('Voltar').click(); await waitText('Diferença do mês');

  // Ciclo A · gastos fixos e parcelamentos (D-023, D-024). Começa e termina com outubro na base: 6.000 / 3.900 / 2.100 e 650.
  await openToPay(); await waitText('5 cadastrados');
  await btn('Gastos fixos e parcelamentos, 5 cadastrados').click(); await waitText('Por mês, se os valores não mudarem');
  t = await body();
  ok('gastos fixos: soma por mês com a parte estimada', t.includes('Por mês, se os valores não mudarem: R$ 3.530,00 (inclui R$ 180,00 estimados).'));
  ok('gastos fixos: seções e linhas com rótulos em texto',
    JSON.stringify(await sectionRows('Gastos fixos')) === JSON.stringify(['Aluguel, R$ 2.500,00, todo dia 5, gasto fixo', 'Luz, cerca de R$ 180,00, todo dia 12, valor muda, gasto fixo']) &&
      JSON.stringify(await sectionRows('Parcelamentos')) === JSON.stringify(['Financiamento do carro, Parcela 13 de 48, R$ 850,00, termina em outubro de 2029, parcelamento']) &&
      ['R$ 2.500,00 · todo dia 5', '≈ R$ 180,00 · todo dia 12 · valor muda', 'Parcela 13 de 48 · R$ 850,00 · termina em outubro de 2029'].every((x) => t.includes(x)));
  await shot('25_gastos_fixos');
  // Ciclo A3: a demonstração já tem IPVA e IPTU em "Contas do ano" (seção entre Parcelamentos e Encerrados).
  // "Por mês" continua R$ 3.530,00 (as contas do ano ficam fora) e "Por ano" soma R$ 4.200,00, todos estimados.
  const headings = await p.evaluate(() => [...document.querySelectorAll('[role=heading][aria-level="2"]')].filter((e) => e.getBoundingClientRect().width > 0).map((e) => e.textContent));
  ok('contas do ano: seção depois de Gastos fixos e Parcelamentos', JSON.stringify(headings) === JSON.stringify(['Gastos fixos', 'Parcelamentos', 'Contas do ano']), headings.join(' | '));
  // Ciclo A5 (spec3 §3.7): o card termina com "Como se preparar para as contas do ano?", depois de "Nova conta do ano".
  ok('contas do ano: IPVA e IPTU com rótulos em texto, "Nova conta do ano" e o link de Aprender',
    JSON.stringify(await sectionRows('Contas do ano')) === JSON.stringify(['IPVA, cerca de R$ 2.400,00, todo ano em 20/01, valor muda, conta do ano', 'IPTU, 10 parcelas de cerca de R$ 180,00, fevereiro a novembro, dia 10, valor muda, conta do ano', 'Nova conta do ano', 'Como se preparar para as contas do ano?']) &&
      ['IPVA, IPTU, matrícula, material escolar e seguro anual. Entram em Contas a pagar dois meses antes de vencer.', '≈ R$ 2.400,00 · todo ano em 20/01 · valor muda', '10 parcelas de ≈ R$ 180,00 · fevereiro a novembro, dia 10 · valor muda'].every((x) => t.includes(x)),
    ((await sectionRows('Contas do ano')) ?? []).join(' | '));
  ok('contas do ano: "Por ano" com a parte estimada e "Por mês" continua R$ 3.530,00, sem elas',
    t.includes('Por ano, se os valores não mudarem: R$ 4.200,00 (inclui R$ 4.200,00 estimados).') && t.includes('Por mês, se os valores não mudarem: R$ 3.530,00 (inclui R$ 180,00 estimados). Contas do ano ficam fora desta soma.'));
  await keepText();
  await scrollTo('Contas do ano');
  await shot('36_contas_do_ano');
  await openRow(/^IPVA, cerca de R\$ 2\.400,00/); await waitText('Ano a ano');
  await waitText('entra em Contas a pagar em novembro de 2026').catch(() => {});
  t = await body();
  ok('IPVA: "Todo ano em 20/01 · desde 2027" e o ano de 2027 previsto, que entra em novembro de 2026',
    ['Todo ano em 20/01 · desde 2027', 'Valor muda: referência de R$ 2.400,00 (estimado)', 'Cada ano entra em Contas a pagar dois meses antes do primeiro vencimento e só entra em Ainda a pagar no mês em que vence.',
      '2027 · previsto · cerca de R$ 2.400,00 · entra em Contas a pagar em novembro de 2026', 'R$ 2.400,00 (estimado) a partir de 2027'].every((x) => t.includes(x)) &&
      (await visibleCount('button', /^Informar o valor de|^Não houve em|^Tirar as parcelas/)) === 0, t.slice(0, 200));
  ok('IPVA: ações da conta do ano', (await Promise.all(['Mudar valor ou dia a partir de uma conta', 'Mudar a forma de pagamento', 'Encerrar conta do ano', 'Excluir conta do ano'].map((n) => visibleCount('button', n)))).every((n) => n === 1));
  await btn('Mudar a forma de pagamento').click(); await waitText('Mudar a forma de pagamento?');
  ok('"Mudar a forma de pagamento": encerrar e cadastrar outra, com o histórico mantido', (await dialogText()).includes('Para passar de cota única para parcelas, mudar o número de parcelas ou o mês, encerre esta conta do ano no último ano com a forma atual e cadastre uma nova. O histórico continua aqui.') &&
    (await dialogText()).includes('Encerrar e cadastrar nova'));
  await confirmIn('Voltar'); await waitGone('Mudar a forma de pagamento?');
  await keepText();
  await scrollTo('Ano a ano');
  await shot('37_conta_do_ano_prevista');
  await btn('Voltar').click(); await waitText('Por mês, se os valores não mudarem');
  await btn('Quem vê estes dados?').click(); await waitText('Gastos fixos e parcelamentos também são só seus.');
  ok('"Quem vê estes dados?": gastos fixos e parcelamentos também são só seus', (await body()).includes('Gastos fixos e parcelamentos também são só seus. A empresa que oferece o benefício não vê nada disso, nem em números somados aos de outras pessoas.'));
  ok('"Quem vê estes dados?": contas do ano seguem a mesma regra', (await body()).includes('Contas do ano, como IPVA, IPTU e matrícula, seguem a mesma regra.'));
  await btn('Entendi').click(); await waitText('Por mês, se os valores não mudarem');

  await openRow(/^Financiamento do carro, Parcela 13 de 48/); await waitText('Pagas antes do Clarevo');
  t = await body();
  ok('parcelamento: progresso, última parcela e soma que não é o valor para quitar',
    ['Parcelamento · financiamento · parcelas 13 a 48', 'R$ 850,00 por parcela', 'Pagas antes do Clarevo: 12 (informado por você) · Pagas no Clarevo: 0 · Faltam 36', 'Última parcela em 10/10/2029',
      'Soma das 36 parcelas que faltam: R$ 30.600,00. Não é o valor para quitar.', 'Quitar antes do prazo dá direito a desconto proporcional dos juros.'].every((x) => t.includes(x)) && !/saldo devedor/i.test(t));
  ok('parcelamento: barra de progresso com um único rótulo', (await visibleCount('progressbar', '12 de 48 pagas')) === 1);
  ok('parcelamento: a parcela 13 é conta a pagar e as seguintes são previstas', (await visibleCount('button', /^Financiamento do carro, vence em 10\/11\/2026, R\$ 850,00, parcela 13 de 48/)) === 1 && t.includes('Prevista · vence em 10/12/2026'));
  await shot('26_parcelamento', true);
  await btn('Voltar').click(); await waitText('Por mês, se os valores não mudarem');

  // Novo gasto fixo "Escola": validação, teclado nos chips, prévia e faixa de sucesso.
  await btn('Novo gasto fixo ou parcelamento').click(); await waitText('Salvando em Pessoal');
  await btn('Salvar gasto fixo').click(); await p.waitForTimeout(300);
  t = await body();
  ok('gasto fixo vazio: mensagens exatas e foco no primeiro erro', ['Dê um nome para este gasto fixo ou parcelamento.', 'Informe um valor maior que zero, como 80,00.', 'Informe um dia de 1 a 31.'].every((x) => t.includes(x)) &&
    (await field('Descrição').evaluate((e) => e === document.activeElement)));
  ok('chips com papel de rádio em grupo com nome', (await visibleCount('radiogroup', 'Com que frequência?')) === 1 && (await radio('Todo mês').getAttribute('aria-checked')) === 'true' && (await radio('Todo ano').getAttribute('aria-checked')) === 'false' && (await radio('Parcelado').getAttribute('aria-checked')) === 'false');
  // Chips na ordem "Todo mês", "Todo ano" e "Parcelado" (a mesma de Anotar conta a pagar).
  const focusRing = () => p.evaluate(() => { const e = document.activeElement; const s = getComputedStyle(e); return [e.getAttribute('role'), e.textContent, s.outlineWidth, s.outlineStyle].join(' '); });
  await radio('Todo mês').focus(); await p.keyboard.press('Tab');
  const ring = await focusRing();
  ok('Tab leva ao chip seguinte, com foco visível de 3 px', ring === 'radio Todo ano 3px solid', ring);
  await p.keyboard.press('Tab');
  const ring2 = await focusRing();
  ok('Tab de novo leva a "Parcelado", com foco visível de 3 px', ring2 === 'radio Parcelado 3px solid', ring2);
  await p.keyboard.press('Enter'); await waitText('Novo parcelamento');
  ok('Enter escolhe o chip: formulário de parcelamento', (await radio('Parcelado').getAttribute('aria-checked')) === 'true' && (await radio('Todo mês').getAttribute('aria-checked')) === 'false' && (await field('Total de parcelas').count()) === 1);
  await p.keyboard.press('Shift+Tab'); await p.keyboard.press('Shift+Tab'); await p.keyboard.press(' '); await waitText('Novo gasto fixo').catch(() => {});
  ok('Espaço escolhe o chip: volta para todo mês, com o foco no chip', (await radio('Todo mês').getAttribute('aria-checked')) === 'true' && (await p.evaluate(() => document.activeElement?.textContent)) === 'Todo mês');
  await field('Descrição').fill('Escola'); await field('Valor por mês').fill('900'); await field('Dia do vencimento').fill('10');
  ok('primeira conta: chips com o vencimento e o primeiro a partir de hoje escolhido', (await radio('Outubro (vence em 10/10)').getAttribute('aria-checked')) === 'true' && (await radio('Novembro (vence em 10/11)').getAttribute('aria-checked')) === 'false');
  await radio('Novembro (vence em 10/11)').click();
  await radio('Termina em…').click(); await field('Último mês (MM/AAAA)').pressSequentially('122026');
  await waitText('2 contas');
  ok('prévia: Escola com 2 contas, de novembro a dezembro', (await body()).includes('Escola · R$ 900,00 · todo dia 10 · de novembro a dezembro de 2026 (2 contas). A conta de novembro já entra em Contas a pagar; as próximas aparecem um mês antes de vencer.'));
  await p.getByText('Como vai ficar', { exact: true }).filter({ visible: true }).first().scrollIntoViewIfNeeded();
  await shot('27_gasto_fixo_previa');
  await btn('Salvar gasto fixo').click(); await waitText('Gasto fixo salvo');
  await waitText('Prevista · vence em 10/12/2026').catch(() => {});
  t = await body();
  ok('gasto fixo salvo: faixa de sucesso e detalhe', t.includes('Gasto fixo salvo. A conta de novembro já está em Contas a pagar.') &&
    ['Todo mês, dia 10 · de novembro a dezembro de 2026', 'R$ 900,00 por mês', 'R$ 900,00 de novembro a dezembro de 2026', 'Prevista · vence em 10/12/2026'].every((x) => t.includes(x)) &&
    (await visibleCount('button', /^Escola, vence em 10\/11\/2026, R\$ 900,00, gasto fixo/)) === 1);
  await shot('28_gasto_fixo_salvo', true);
  await goResumo();
  await expectTotals('criar Escola (novembro a dezembro) → outubro sem mudança', 'R$ 6.000,00', 'R$ 3.900,00', 'R$ 2.100,00');
  ok('criar Escola: card de outubro sem mudança', (await body()).includes('2 contas · próxima: Internet, 15/10'));

  // Pagar hoje a Escola de novembro: o gasto conta em Pago de outubro; desfazer volta à base.
  await openToPay();
  await openRow(/^Escola, vence em 10\/11\/2026, R\$ 900,00, gasto fixo/); await waitText('Marcar como paga');
  await waitText('Parte de: Escola · todo mês, dia 10').catch(() => {});
  ok('conta do gasto fixo: "Parte de" e "Ver gasto fixo"', (await body()).includes('Parte de: Escola · todo mês, dia 10') && (await visibleCount('button', 'Ver gasto fixo')) === 1);
  await btn('Marcar como paga').click(); await waitText('Confirmar pagamento');
  ok('pagar a Escola: valor previsto e hoje', (await field('Valor pago').inputValue()) === '900,00' && (await field('Data do pagamento').inputValue()) === '07/10/2026');
  await btn('Confirmar pagamento').click(); await waitText('Pagamento registrado');
  ok('Escola paga: sem "Adicionar a conta do próximo mês" nem "Repetir todo mês"', (await visibleCount('button', 'Adicionar a conta do próximo mês')) === 0 && (await visibleCount('button', 'Repetir todo mês')) === 0 && (await visibleCount('button', 'Repetir todo ano')) === 0 && (await body()).includes('Pago de outubro de 2026'));
  await btn('Ver resumo do mês').click(); await waitText('Diferença do mês');
  await expectTotals('pagar a Escola de novembro hoje → Pago de outubro 4.800, a pagar 650', 'R$ 6.000,00', 'R$ 4.800,00', 'R$ 1.200,00', 'R$ 650,00');
  await openToPay();
  await openRow(/^Escola, paga em 07\/10\/2026, R\$ 900,00, conta em Pago de outubro de 2026, gasto fixo/); await waitText('Desfazer pagamento');
  await btn('Desfazer pagamento').click(); await waitText('Desfazer pagamento?');
  await confirmIn('Desfazer pagamento'); await waitText('Pagamento desfeito');
  await btn('Ver resumo do mês').click(); await waitText('Diferença do mês');
  await expectTotals('desfazer o pagamento da Escola → base', 'R$ 6.000,00', 'R$ 3.900,00', 'R$ 2.100,00', 'R$ 650,00');

  // "Novembro e os próximos meses" no Aluguel: novembro passa a 2.650; outubro, pago, não muda.
  await openToPay();
  await openRow(/^Aluguel, vence em 05\/11\/2026/); await waitText('Parte de: Aluguel · todo mês, dia 5');
  ok('conta de gasto fixo: "Excluir só a conta de novembro" e sem "Adicionar a conta do próximo mês"', (await visibleCount('button', 'Excluir só a conta de novembro')) === 1 && (await visibleCount('button', 'Adicionar a conta do próximo mês')) === 0);
  await btn('Editar conta a pagar').click(); await waitText('O que você quer alterar?');
  ok('editar conta de gasto fixo pergunta o alcance', (await Promise.all(['Só a conta de novembro', 'Novembro e os próximos meses', 'Cancelar'].map((n) => visibleCount('button', n)))).every((n) => n === 1));
  await btn('Novembro e os próximos meses').click(); await waitText('Aplicar a partir de'); await waitText('Valor por mês');
  ok('esta e as próximas: começa na conta escolhida, com o valor atual', (await radio('Novembro (vence em 05/11)').getAttribute('aria-checked')) === 'true' && (await field('Valor por mês').inputValue()) === '2.500,00');
  await field('Valor por mês').fill('2650');
  await btn('Salvar alterações').click(); await waitText('Aplicar a partir de novembro?');
  ok('esta e as próximas: confirma o que muda e o que não muda', (await dialogText()).includes('Vão mudar: novembro (05/11). Não mudam: outubro (paga). As contas criadas depois já seguem o novo valor.'));
  await shot('29_esta_e_as_proximas');
  await confirmIn('Aplicar');
  // A conta aberta já mostra o valor confirmado pela gravação junto da faixa, sem esperar outra leitura.
  t = await firstBodyWith('Gasto fixo atualizado a partir de novembro.');
  ok('Aluguel de novembro passa a R$ 2.650,00 junto da faixa de sucesso', t.includes('Gasto fixo atualizado a partir de novembro.') && t.includes('R$ 2.650,00') && !t.includes('R$ 2.500,00'));
  await btn('Voltar').click(); await waitText('Contas em aberto com vencimento até o fim do mês');
  await waitRows('Próximos meses', (rows) => (rows ?? []).includes('Aluguel, vence em 05/11/2026, R$ 2.650,00, gasto fixo'));
  ok('Aluguel: novembro com o novo valor e outubro (pago) sem mudança', ((await sectionRows('Próximos meses')) ?? []).includes('Aluguel, vence em 05/11/2026, R$ 2.650,00, gasto fixo') &&
    ((await sectionRows('Pagas')) ?? []).includes('Aluguel, paga em 05/10/2026, R$ 2.500,00, gasto fixo'));

  // Luz de novembro: informar o valor tira "estimado"; depois, excluir só esta conta.
  await openRow(/^Luz, vence em 12\/11\/2026, cerca de R\$ 180,00, valor estimado/); await waitText('Informar o valor da conta');
  await waitText('Parte de: Luz · todo mês, dia 12').catch(() => {});
  t = await body();
  ok('conta estimada: aviso e "Informar o valor da conta"', t.includes('Valor estimado pela referência do gasto fixo. Quando a conta chegar, informe o valor.') && t.includes('Parte de: Luz · todo mês, dia 12'));
  await shot('30_conta_estimada');
  await btn('Informar o valor da conta').click(); await waitText('A estimativa era R$ 180,00.');
  ok('informar o valor: campo vazio e com foco', (await field('Valor em reais').inputValue()) === '' && (await field('Valor em reais').evaluate((e) => e === document.activeElement)));
  await field('Valor em reais').fill('180,00'); await btn('Salvar conta a pagar').click(); await waitText('Valor da conta informado');
  await waitText('Alterada só neste mês.').catch(() => {});
  t = await body();
  ok('valor igual ao estimado: deixa de ser estimada e fica alterada só neste mês', t.includes('Alterada só neste mês.') && !t.includes('Valor estimado') && (await visibleCount('button', 'Informar o valor da conta')) === 0);
  await btn('Voltar').click(); await waitText('Contas em aberto com vencimento até o fim do mês');
  await waitRows('Próximos meses', (rows) => (rows ?? []).includes('Luz, vence em 12/11/2026, R$ 180,00, gasto fixo'));
  ok('"estimado" some da Luz em Contas a pagar', ((await sectionRows('Próximos meses')) ?? []).includes('Luz, vence em 12/11/2026, R$ 180,00, gasto fixo') && !(await body()).includes('estimado'));
  await openRow(/^Luz, vence em 12\/11\/2026/); await waitText('Excluir só a conta de novembro');
  await btn('Excluir só a conta de novembro').click(); await waitText('Excluir a conta de novembro?');
  ok('excluir só esta: o gasto fixo continua e a conta não volta', (await dialogText()).includes('O gasto fixo continua nos outros meses, e esta conta não volta a ser criada.'));
  await shot('31_excluir_so_esta');
  await confirmIn('Excluir só esta'); await waitText('Conta de novembro excluída. O gasto fixo continua nos outros meses.');
  await waitRows('Próximos meses', (rows) => rows !== null && !rows.some((r) => r.startsWith('Luz')));
  ok('Luz de novembro sai de Contas a pagar', !((await sectionRows('Próximos meses')) ?? ['Luz']).some((r) => r.startsWith('Luz')));

  // Encerrar a Escola em novembro e retomar sem data para terminar.
  await waitText('6 cadastrados');
  await btn('Gastos fixos e parcelamentos, 6 cadastrados').click(); await waitText('Por mês, se os valores não mudarem');
  await openRow(/^Escola, R\$ 900,00, todo dia 10, termina em dezembro de 2026, gasto fixo/); await waitText('Encerrar gasto fixo');
  await btn('Encerrar gasto fixo').click(); await waitText('Qual é a última conta?');
  await radio('Novembro').click(); await waitText('Nenhuma conta em aberto vai sair da lista.');
  ok('encerrar: chips de meses com papel de rádio e o efeito antes de confirmar', (await radio('Novembro').getAttribute('aria-checked')) === 'true' && (await visibleCount('radiogroup', 'Qual é a última conta?')) === 1);
  await shot('32_encerrar');
  await btn('Encerrar').click(); await waitText('Gasto fixo encerrado.');
  await waitText('Todo mês, dia 10 · em novembro de 2026').catch(() => {});
  t = await body();
  ok('Escola encerrada em novembro: a conta de novembro fica e dezembro deixa de ser prevista', t.includes('Todo mês, dia 10 · em novembro de 2026') && !t.includes('Prevista · vence em 10/12/2026') &&
    (await visibleCount('button', /^Escola, vence em 10\/11\/2026/)) === 1);
  await btn('Encerrar gasto fixo').click(); await waitText('Qual é a última conta?');
  await radio('Sem data para terminar').click(); await waitText('As próximas contas aparecem em Contas a pagar um mês antes de vencer.');
  await btn('Voltar a repetir').click(); await waitText('Gasto fixo retomado.');
  await waitText('Prevista · vence em 10/12/2026').catch(() => {});
  t = await body();
  ok('Escola retomada sem data para terminar: as previstas voltam', ['Todo mês, dia 10 · desde novembro de 2026', 'Prevista · vence em 10/12/2026', 'Prevista · vence em 10/01/2027'].every((x) => t.includes(x)));

  // A geração do dia rodou de novo depois dessas gravações: a Luz de novembro, excluída só neste mês, não volta.
  await btn('Voltar').click(); await waitText('Por mês, se os valores não mudarem');
  await openRow(/^Luz, cerca de R\$ 180,00, todo dia 12/); await waitText('Próximas contas');
  await waitText('Prevista · vence em 12/12/2026').catch(() => {});
  t = await body();
  ok('Luz: a conta de novembro excluída não volta e a próxima prevista é dezembro', !t.includes('12/11/2026') && t.includes('Prevista · vence em 12/12/2026') && !t.includes('sem conta registrada'));
  await btn('Voltar').click(); await waitText('Por mês, se os valores não mudarem');
  await btn('Voltar').click(); await waitText('Contas em aberto com vencimento até o fim do mês');
  ok('Contas a pagar: a Luz de novembro continua fora depois da nova geração', !((await sectionRows('Próximos meses')) ?? ['Luz']).some((r) => r.startsWith('Luz')));

  // "Tornar gasto fixo" no Aluguel de setembro e os avisos contra contar duas vezes.
  await goResumo();
  await p.getByRole('button', { name: /Mês anterior/ }).filter({ visible: true }).first().click(); await waitText('Setembro de 2026');
  await openRow(/^Aluguel, Pago · 05\/09\/2026/); await waitText('Tornar gasto fixo');
  await btn('Tornar gasto fixo').click(); await waitText('Baseado no gasto de 05/09/2026');
  await waitText('Você já tem o gasto fixo Aluguel.').catch(() => {});
  await waitText('Você já anotou o gasto Aluguel').catch(() => {});
  t = await body();
  ok('tornar gasto fixo: preenchido pelo gasto de setembro, começando em outubro', (await field('Descrição').inputValue()) === 'Aluguel' && (await field('Valor por mês').inputValue()) === '2.500,00' &&
    (await field('Dia do vencimento').inputValue()) === '5' && (await radio('Outubro (venceu em 05/10)').getAttribute('aria-checked')) === 'true' &&
    t.includes('Baseado no gasto de 05/09/2026. Esse gasto continua como está; o gasto fixo começa no próximo vencimento.'));
  ok('tornar gasto fixo: aviso de gasto fixo parecido', t.includes('Você já tem o gasto fixo Aluguel. Quer cadastrar outro mesmo assim?'));
  ok('aviso de gasto já anotado no primeiro mês, com "Começar em novembro"', t.includes('Você já anotou o gasto Aluguel em 05/10 (R$ 2.500,00). Para não contar duas vezes, o gasto fixo pode começar em novembro.') &&
    (await visibleCount('button', 'Começar em novembro')) === 1);
  // A captura mostra os avisos, que ficam abaixo dos campos.
  await p.getByText('Você já anotou o gasto Aluguel', { exact: false }).filter({ visible: true }).first().scrollIntoViewIfNeeded();
  await shot('33_tornar_gasto_fixo');
  await btn('Começar em novembro').click(); await waitGone('Você já anotou o gasto Aluguel');
  ok('"Começar em novembro" muda a primeira conta e tira o aviso', (await radio('Novembro (vence em 05/11)').getAttribute('aria-checked')) === 'true' && !(await body()).includes('Você já anotou o gasto Aluguel'));
  // Parcelamento: o gasto de outubro já é a parcela informada, então "Começar em novembro" passa também à parcela seguinte.
  await radio('Parcelado').click(); await waitText('Total de parcelas');
  await radio('Compra parcelada (boleto ou crediário)').click();
  await field('Total de parcelas').fill('48'); await field('Número da próxima parcela a pagar').fill('12');
  await radio('Outubro (venceu em 05/10)').click(); await waitText('o parcelamento pode começar com a parcela 13, em novembro');
  ok('parcelamento: aviso de gasto já anotado com a parcela seguinte', (await body()).includes('Você já anotou o gasto Aluguel em 05/10 (R$ 2.500,00). Para não contar duas vezes, o parcelamento pode começar com a parcela 13, em novembro.') &&
    (await visibleCount('button', 'Começar em novembro (parcela 13)')) === 1 && (await visibleCount('button', 'Começar em novembro')) === 0);
  await btn('Começar em novembro (parcela 13)').click(); await waitGone('o parcelamento pode começar com a parcela 13');
  ok('"Começar em novembro (parcela 13)" muda o mês e a parcela juntos', (await radio('Novembro (vence em 05/11)').getAttribute('aria-checked')) === 'true' && (await field('Número da próxima parcela a pagar').inputValue()) === '13' &&
    (await body()).includes('Parcelas 13 a 48 de R$ 2.500,00, todo dia 5, de 05/11/2026 a 05/10/2029. Soma das 36 parcelas: R$ 90.000,00.') && !(await body()).includes('Você já anotou o gasto Aluguel'));
  // A parcela informada já é a última: sem mês seguinte para começar, o aviso fica sem o botão.
  await field('Número da próxima parcela a pagar').fill('48'); await radio('Outubro (venceu em 05/10)').click(); await waitText('Se esse gasto foi a parcela 48, a última');
  ok('parcelamento na última parcela: aviso sem "Começar em…"', (await body()).includes('Se esse gasto foi a parcela 48, a última, não há mais parcelas a cadastrar.') && (await visibleCount('button', /^Começar em/)) === 0);
  await radio('Todo mês').click(); await waitText('Primeira conta');
  await radio('Novembro (vence em 05/11)').click(); await waitGone('Você já anotou o gasto Aluguel');
  await field('Descrição').fill('Parcelas do cartão'); await waitText('Parcelas de compras no cartão já entram na fatura.');
  ok('aviso de cartão no gasto fixo', (await body()).includes('Parcelas de compras no cartão já entram na fatura. Para não contar duas vezes, anote aqui só parcelamentos em boleto, débito ou financiamento.'));
  await field('Descrição').fill('Internet'); await field('Valor por mês').fill('150'); await field('Dia do vencimento').fill('15');
  await radio('Outubro (vence em 15/10)').click(); await waitText('Começar a repetição em novembro?');
  ok('aviso de conta avulsa no mesmo mês, com "Começar em novembro" e "Manter outubro"', (await body()).includes('Você já tem a conta a pagar Internet com vencimento em 15/10. Começar a repetição em novembro?') &&
    (await visibleCount('button', 'Começar em novembro')) === 1 && (await visibleCount('button', 'Manter outubro')) === 1);
  await btn('Manter outubro').click(); await waitGone('Começar a repetição em novembro?');
  ok('"Manter outubro" fecha o aviso e mantém outubro', !(await body()).includes('Começar a repetição em novembro?') && (await radio('Outubro (vence em 15/10)').getAttribute('aria-checked')) === 'true');
  await btn('Cancelar').click(); await waitText('Descartar o preenchimento?');
  await btn('Descartar alterações').click(); await waitText('Tornar gasto fixo');
  await btn('Voltar').click(); await waitText('Setembro de 2026');
  await p.getByRole('button', { name: /Próximo mês/ }).filter({ visible: true }).first().click(); await waitText('Outubro de 2026');
  await expectTotals('Ciclo A termina com outubro na base', 'R$ 6.000,00', 'R$ 3.900,00', 'R$ 2.100,00', 'R$ 650,00');

  // Ciclo A3 · contas do ano (D-029). Começa e termina com outubro na base: 6.000 / 3.900 / 2.100 e 650.
  // Telas novas: conferidas a 390 e a 320 px (cabeçalho, largura, valores inteiros, alvos de toque) e contra termos proibidos.
  // Nomes e dicas lidos por leitores de tela: "2026 a 2027", nunca "2026/2027" (spec 1.7).
  const yearNames = async (prefix) => {
    const left = await slashNames();
    ok(`${prefix}: leitor de tela ouve "2026 a 2027", nunca "2026/2027"`, left.length === 0, left.slice(0, 3).join(' | '));
  };
  const widthChecks = async (prefix, shotName, { full = false, to = null } = {}) => {
    await innerChecks(`${prefix} 390px`);
    await yearNames(prefix);
    await keepText();
    await p.setViewportSize({ width: 320, height: 800 }); await p.waitForTimeout(400);
    await innerChecks(`${prefix} 320px`);
    if (to) await scrollTo(to);
    if (shotName) await shot(shotName, full);
    await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(300);
  };
  // Grade de meses: 12 chips inteiros, nenhum rótulo cortado nem fora da tela, alvos de 44 px.
  const monthGrid = (label) =>
    p.evaluate((label) => {
      const g = [...document.querySelectorAll('[role=radiogroup]')].find((e) => e.getAttribute('aria-label') === label && e.getBoundingClientRect().width > 0);
      if (!g) return null;
      const rs = [...g.querySelectorAll('[role=radio]')];
      const boxes = rs.map((r) => r.getBoundingClientRect());
      return {
        n: rs.length,
        cut: rs.filter((r) => [...r.querySelectorAll('div[dir="auto"]')].some((x) => x.scrollWidth > x.clientWidth + 1)).map((r) => r.textContent),
        minW: Math.round(Math.min(...boxes.map((b) => b.width))),
        minH: Math.round(Math.min(...boxes.map((b) => b.height))),
        rows: new Set(boxes.map((b) => Math.round(b.top))).size,
        outside: boxes.filter((b) => b.left < -0.5 || b.right > window.innerWidth + 0.5).length,
      };
    }, label);
  const gridOk = (g, maxRows) => g !== null && g.n === 12 && g.cut.length === 0 && g.outside === 0 && g.minW >= 44 && g.minH >= 44 && g.rows <= maxRows;
  const openSeriesList = async () => { await p.getByRole('button', { name: /^Gastos fixos e parcelamentos, / }).filter({ visible: true }).first().click(); await waitText('Por ano, se os valores não mudarem'); };

  // "Todo ano" em Anotar conta a pagar leva descrição e valor para "Nova conta do ano".
  await openToPay();
  await btn('Anotar conta a pagar').click(); await waitText('Salvando em Pessoal');
  await field('Descrição').fill('Matrícula'); await field('Valor em reais').fill('1200');
  await radio('Todo ano').click(); await waitText('Como você paga?');
  ok('"Todo ano" leva a "Nova conta do ano" sem perder descrição nem valor', (await p.locator('h1').filter({ visible: true }).first().textContent()) === 'Nova conta do ano' &&
    (await field('Descrição').inputValue()) === 'Matrícula' && (await field('Valor de referência').inputValue()) === '1.200,00' && (await radio('Todo ano').getAttribute('aria-checked')) === 'true');
  t = await body();
  ok('conta do ano: cota única e "Sim, muda todo ano" como padrão, com a dica do valor de referência',
    (await radio('Uma vez no ano (cota única)').getAttribute('aria-checked')) === 'true' && (await radio('Sim, muda todo ano (como IPVA e IPTU)').getAttribute('aria-checked')) === 'true' &&
      ['Use o valor do último ano. Ele aparece como estimado até você informar o valor do ano.', 'Ex.: IPVA, IPTU, Matrícula, Material escolar, Seguro do carro. Não é preciso citar pessoas.',
        'Escolha o mês e o dia para escolher o primeiro ano.'].every((x) => t.includes(x)));
  const monthChips = await p.getByRole('radiogroup', { name: 'Mês do vencimento' }).filter({ visible: true }).first().getByRole('radio').evaluateAll((es) => es.map((e) => `${e.getAttribute('aria-label')}=${e.textContent}`));
  ok('mês do vencimento: 12 chips como rádio, "Jan" na tela e "Janeiro" no leitor de tela', monthChips.length === 12 && monthChips[0] === 'Janeiro=Jan' && monthChips[11] === 'Dezembro=Dez', monthChips.join(' '));
  await radio('Dezembro').click(); await field('Dia do vencimento').fill('10');
  await waitText('2026 (vence em 10/12/2026)');
  ok('primeiro ano: chips com o vencimento, o primeiro a partir de hoje escolhido', (await visibleCount('radiogroup', 'Primeiro ano')) === 1 &&
    (await radio('2026 (vence em 10/12/2026)').getAttribute('aria-checked')) === 'true' && (await radio('2027 (vence em 10/12/2027)').getAttribute('aria-checked')) === 'false');
  await radio('Não, é sempre o mesmo').click(); await radio('Educação').click();
  ok('valor fixo: o campo passa a "Valor da conta", com o valor digitado', (await field('Valor da conta').inputValue()) === '1.200,00');
  await radio('2027 (vence em 10/12/2027)').click(); await waitText('a partir de 2027');
  ok('prévia acompanha o primeiro ano: a conta de 2027 entra em outubro de 2027', (await body()).includes('Matrícula · R$ 1.200,00 · todo ano em 10/12 · a partir de 2027. A conta de 2027 entra em Contas a pagar em outubro de 2027, dois meses antes de vencer, e só entra em Ainda a pagar em dezembro.'));
  await radio('2026 (vence em 10/12/2026)').click(); await waitText('A conta de 2026 já entra em Contas a pagar');
  ok('prévia da Matrícula: a conta de 2026 já entra, em Próximos meses', (await body()).includes('Matrícula · R$ 1.200,00 · todo ano em 10/12 · a partir de 2026. A conta de 2026 já entra em Contas a pagar, em Próximos meses.'));
  const grid390 = await monthGrid('Mês do vencimento');
  ok('390 px: grade de meses com 4 por linha, inteira', gridOk(grid390, 3), JSON.stringify(grid390));
  await scrollTo('Como você paga?');
  await shot('38_nova_conta_do_ano');
  await scrollTo('Como vai ficar');
  await shot('39_conta_do_ano_previa');
  await widthChecks('nova conta do ano');
  await btn('Salvar conta do ano').click(); await waitText('Conta do ano salva');
  await waitText('entra em Contas a pagar em outubro de 2027').catch(() => {});
  t = await body();
  ok('Matrícula salva: faixa de sucesso e "Ano a ano" com 2026 em aberto e 2027 previsto', t.includes('Conta do ano salva. A conta de 2026 já está em Contas a pagar.') &&
    ['Todo ano em 10/12 · desde 2026', 'R$ 1.200,00 por ano', '2026 · em aberto · R$ 1.200,00', '2027 · previsto · R$ 1.200,00 · entra em Contas a pagar em outubro de 2027'].every((x) => t.includes(x)) &&
    (await visibleCount('button', /^Matrícula, vence em 10\/12\/2026, R\$ 1\.200,00, conta do ano de 2026$/)) === 1 && (await visibleCount('button', 'Não houve em 2026')) === 1 &&
    (await visibleCount('button', 'Informar o valor de 2026')) === 0, t.slice(0, 300));
  await widthChecks('conta do ano salva', '40_conta_do_ano_salva_320px', { to: 'Ano a ano' });
  await goResumo();
  await expectTotals('criar Matrícula (10/12/2026) → outubro sem mudança', 'R$ 6.000,00', 'R$ 3.900,00', 'R$ 2.100,00', 'R$ 650,00');
  ok('criar Matrícula: card de outubro sem mudança', (await body()).includes('2 contas · próxima: Internet, 15/10'));
  await openToPay();
  await waitRows('Próximos meses', (rows) => (rows ?? []).some((r) => r.startsWith('Matrícula')));
  t = await body();
  ok('Contas a pagar: Matrícula em Próximos meses, com "Conta do ano de 2026", e a nota da seção',
    ((await sectionRows('Próximos meses')) ?? []).includes('Matrícula, vence em 10/12/2026, R$ 1.200,00, conta do ano de 2026') &&
      t.includes('Vence em 10/12/2026 · Conta do ano de 2026') && t.includes('Não entram no total deste mês. Contas do ano aparecem aqui dois meses antes de vencer.'));

  // Seguro residencial: 4 parcelas por ano de novembro a fevereiro, valor que muda. O ano "2026/2027" entra inteiro agora.
  await openSeriesList();
  await btn('Nova conta do ano').click(); await waitText('Como você paga?');
  await field('Descrição').fill('Seguro residencial');
  await radio('Em parcelas no ano').click(); await field('Quantas parcelas por ano?').fill('4');
  ok('"Em parcelas no ano": "Quantas parcelas por ano?" e "Mês da primeira parcela"', (await visibleCount('radiogroup', 'Mês da primeira parcela')) === 1 &&
    (await body()).includes('As parcelas vencem em meses seguidos, como um IPTU de fevereiro a novembro. Parcelas no cartão já entram na fatura: anote aqui só carnê, boleto ou débito.'));
  await radio('Novembro').click(); await field('Dia do vencimento').fill('15'); await field('Valor de referência').fill('120');
  await radio('Moradia').click();
  await waitText('2026/2027 (primeira vence em 15/11/2026)');
  ok('primeiro ano que atravessa a virada: "2026/2027" na tela e "2026 a 2027" no leitor de tela',
    (await radio('2026 a 2027 (primeira vence em 15/11/2026)').getAttribute('aria-checked')) === 'true' && (await visibleCount('radio', '2027 a 2028 (primeira vence em 15/11/2027)')) === 1);
  await waitText('Cerca de R$ 480,00 por ano.').catch(() => {});
  ok('prévia do Seguro residencial: as 4 parcelas de 2026/2027 já entram', (await body()).includes('Seguro residencial · 4 parcelas de cerca de R$ 120,00 (estimado) · todo dia 15, de novembro a fevereiro · a partir de 2026/2027. Cerca de R$ 480,00 por ano. As 4 parcelas de 2026/2027 já entram em Contas a pagar; cada uma só entra em Ainda a pagar no mês em que vence.'));
  await innerChecks('nova conta do ano em parcelas 390px');
  await p.setViewportSize({ width: 320, height: 800 }); await p.waitForTimeout(400);
  const grid320 = await monthGrid('Mês da primeira parcela');
  ok('320 px: grade de meses inteira, sem rótulo cortado', gridOk(grid320, 4), JSON.stringify(grid320));
  await innerChecks('nova conta do ano em parcelas 320px');
  await keepText();
  await scrollTo('Mês da primeira parcela');
  await shot('41_nova_conta_do_ano_320px');
  await scrollTo('Primeiro ano');
  await shot('41_nova_conta_do_ano_primeiro_ano_320px');
  await scrollTo('Como vai ficar');
  await shot('41_nova_conta_do_ano_previa_320px');
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(300);
  await btn('Salvar conta do ano').click(); await waitText('Conta do ano salva');
  await waitText('2026/2027 · 4 parcelas · 4 em aberto').catch(() => {});
  t = await body();
  ok('Seguro residencial salvo: faixa, legenda, valor por ano e "Ano a ano"', t.includes('Conta do ano salva. As 4 parcelas de 2026/2027 já estão em Contas a pagar.') &&
    ['Todo ano, 4 parcelas de novembro a fevereiro, dia 15 · desde 2026/2027', 'Valor muda: referência de R$ 120,00 por parcela (estimado) · cerca de R$ 480,00 por ano',
      '2026/2027 · 4 parcelas · 4 em aberto · cerca de R$ 480,00', '2027/2028 · previsto · cerca de R$ 480,00 · entra em Contas a pagar em setembro de 2027'].every((x) => t.includes(x)) &&
    (await visibleCount('button', 'Ver as 4 parcelas')) === 1 && (await visibleCount('button', 'Tirar as parcelas de 2026 a 2027 em aberto')) === 1, t.slice(0, 300));
  await goResumo();
  await expectTotals('criar Seguro residencial (15/11/2026 a 15/02/2027) → outubro sem mudança', 'R$ 6.000,00', 'R$ 3.900,00', 'R$ 2.100,00', 'R$ 650,00');
  await openToPay();
  const seguroGroup = 'Seguro residencial de 2026 a 2027, 4 parcelas de cerca de R$ 120,00, valor estimado, de 15/11/2026 a 15/02/2027, conta do ano. Toque para ver as parcelas.';
  await waitRows('Próximos meses', (rows) => (rows ?? []).includes(seguroGroup));
  const later = (await sectionRows('Próximos meses')) ?? [];
  t = await body();
  ok('Próximos meses: as 4 parcelas num único grupo do ano, com nome acessível único ("cerca de")',
    later.filter((r) => r.startsWith('Seguro residencial')).length === 1 && later.includes(seguroGroup) &&
      ['Seguro residencial de 2026/2027', '4 parcelas, de 15/11/2026 a 15/02/2027 · estimado', '≈ R$ 480,00'].every((x) => t.includes(x)), later.join(' | '));
  await widthChecks('contas a pagar com grupo do ano', '42_proximos_meses_conta_do_ano_320px', { to: 'Próximos meses' });
  await scrollTo('Próximos meses');
  await shot('42_proximos_meses_conta_do_ano');

  // Informar o valor de 2026/2027 (R$ 114,00 por parcela): as parcelas deixam de ser estimadas; total do ano R$ 456,00.
  await openRow(seguroGroup); await waitText('Ano a ano'); await waitText('Ver as 4 parcelas');
  await btn('Informar o valor de 2026 a 2027').click(); await waitText('Use o valor do carnê ou do boleto de 2026/2027.');
  ok('informar: título com o ano, campo de cada parcela com foco e a dica', (await p.locator('h1').filter({ visible: true }).first().textContent()) === 'Informar o valor de 2026/2027' &&
    (await h1Name()) === 'Informar o valor de 2026 a 2027' && (await field('Valor de cada parcela de 2026 a 2027').evaluate((e) => e === document.activeElement)) &&
    (await body()).includes('Se as parcelas têm valores diferentes, informe o valor mais comum e ajuste as outras em cada conta.'));
  await field('Valor de cada parcela de 2026 a 2027').fill('114,00');
  await waitText('Total de 2026/2027: R$ 456,00.');
  ok('informar: prévia com o que muda, o total do ano e o que não muda', (await body()).includes('Vão mudar: as 4 parcelas de 2026/2027 em aberto com valor estimado. Total de 2026/2027: R$ 456,00. Não mudam: parcelas pagas e parcelas com valor já informado.'));
  await shot('43_informar_valor_do_ano');
  await widthChecks('informar o valor do ano', '43_informar_valor_do_ano_320px');
  await btn('Informar valor').click(); await waitText('Valor de 2026/2027 informado');
  await waitText('2026/2027 · 4 parcelas · 4 em aberto · R$ 456,00').catch(() => {});
  t = await body();
  ok('valor informado: faixa e o total de 2026/2027 em R$ 456,00, sem "cerca de"', t.includes('Valor de 2026/2027 informado. As parcelas deixaram de ser estimadas.') &&
    t.includes('2026/2027 · 4 parcelas · 4 em aberto · R$ 456,00') && (await visibleCount('button', 'Informar o valor de 2026 a 2027')) === 0, t.slice(0, 300));
  await btn('Ver as 4 parcelas').click(); await waitText('Esconder as parcelas');
  const partRow = (n, rest = 'R\\$ 114,00') => new RegExp(`^Seguro residencial, vence em [0-9/]+, ${rest}, parcela ${n} de 4 de 2026 a 2027, conta do ano$`);
  ok('"Ver as 4 parcelas": linhas tocáveis com a parcela e o ano, sem estimado', (await Promise.all([1, 2, 3, 4].map((n) => visibleCount('button', partRow(n))))).every((n) => n === 1) &&
    (await p.getByRole('button', { name: 'Esconder as parcelas', exact: true }).filter({ visible: true }).first().getAttribute('aria-expanded')) === 'true');
  await scrollTo('Ano a ano');
  await shot('44_conta_do_ano_parcelas');
  await widthChecks('conta do ano com as parcelas', '44_conta_do_ano_parcelas_320px', { to: 'Ano a ano' });
  await goResumo(); await openToPay();
  await waitRows('Próximos meses', (rows) => (rows ?? []).some((r) => r.startsWith('Seguro residencial de 2026 a 2027, 4 parcelas de R$ 114,00')));
  t = await body();
  ok('"estimado" sai do grupo: 4 parcelas de R$ 114,00, total R$ 456,00', ((await sectionRows('Próximos meses')) ?? []).includes('Seguro residencial de 2026 a 2027, 4 parcelas de R$ 114,00, de 15/11/2026 a 15/02/2027, conta do ano. Toque para ver as parcelas.') &&
    t.includes('4 parcelas, de 15/11/2026 a 15/02/2027') && !t.includes('4 parcelas, de 15/11/2026 a 15/02/2027 · estimado') && t.includes('R$ 456,00'));

  // Excluir uma parcela oferece tirar todas as do ano em aberto (só conferência: Cancelar).
  await openRow(/^Seguro residencial de 2026 a 2027/); await waitText('Ver as 4 parcelas');
  await btn('Ver as 4 parcelas').click(); await waitText('Esconder as parcelas');
  await openRow(partRow(2)); await waitText('Parte de: Seguro residencial');
  t = await body();
  ok('parcela da conta do ano: "Parte de", "Ver conta do ano", valor informado e "Excluir parcela"', t.includes('Parte de: Seguro residencial · parcela 2 de 4 de 2026/2027') &&
    t.includes('Valor informado ou alterado só nesta conta.') && (await visibleCount('button', 'Ver conta do ano')) === 1 && (await visibleCount('button', 'Excluir parcela')) === 1);
  await btn('Editar conta a pagar').click(); await waitText('O que você quer alterar?');
  ok('editar parcela: "Só a parcela 2 de 2026/2027" ou "A parcela 2 de 2026/2027 e as próximas" (lidos "2026 a 2027")', (await Promise.all(['Só a parcela 2 de 2026 a 2027', 'A parcela 2 de 2026 a 2027 e as próximas'].map((n) => visibleCount('button', n)))).every((n) => n === 1));
  await btn('Cancelar').click(); await p.waitForTimeout(300);
  await btn('Excluir parcela').click(); await waitText('O que você quer excluir?');
  ok('excluir parcela: "Excluir só esta parcela" ou "Tirar todas as parcelas de 2026/2027 em aberto" (lido "2026 a 2027")', (await Promise.all(['Excluir só esta parcela', 'Tirar todas as parcelas de 2026 a 2027 em aberto'].map((n) => visibleCount('button', n)))).every((n) => n === 1));
  await btn('Tirar todas as parcelas de 2026 a 2027 em aberto').click(); await waitText('Tirar as 4 parcelas de 2026/2027 em aberto?');
  ok('tirar as parcelas do ano: diz que saem, não voltam e que a conta do ano continua', (await dialogText()).includes('Elas saem de Contas a pagar e não voltam a ser criadas. A conta do ano continua em 2027/2028.'));
  ok('tirar as parcelas do ano: título do diálogo lido "2026 a 2027"', (await visibleCount('heading', 'Tirar as 4 parcelas de 2026 a 2027 em aberto?')) === 1);
  await yearNames('diálogo de tirar as parcelas do ano');
  await keepText();
  await shot('45_tirar_parcelas_do_ano');
  await btn('Cancelar').click(); await p.waitForTimeout(300);
  ok('cancelar não tira nada', (await visibleCount('button', 'Marcar como paga')) === 1 && (await body()).includes('R$ 114,00'));
  await btn('Voltar').click(); await waitText('Esconder as parcelas');

  // "Paguei o ano todo de uma vez": a parcela 1 paga com R$ 433,20 e as outras 3 tiradas. Desfazer não traz as 3 de volta.
  await openRow(partRow(1)); await waitText('Marcar como paga');
  await btn('Marcar como paga').click(); await waitText('Confirmar pagamento');
  const wholeBox = p.getByRole('checkbox', { name: /^Paguei o ano todo de uma vez \(cota única\)/ }).filter({ visible: true }).first();
  await wholeBox.waitFor({ timeout: 8000 }).catch(() => {});
  ok('pagamento da parcela: caixa "Paguei o ano todo de uma vez", desmarcada, com o aviso', (await wholeBox.count()) === 1 && (await wholeBox.getAttribute('aria-checked')) === 'false' &&
    (await body()).includes('Informe o valor total pago. As outras 3 parcelas de 2026/2027 em aberto saem de Contas a pagar e não voltam, mesmo se você desfizer este pagamento.') &&
    (await field('Valor pago').inputValue()) === '114,00');
  await wholeBox.click(); await waitText('Soma das 4 parcelas de 2026/2027 em aberto');
  ok('caixa marcada: "Valor total pago" e a soma das parcelas em aberto como referência', (await wholeBox.getAttribute('aria-checked')) === 'true' && (await field('Valor total pago').count()) === 1 &&
    (await body()).includes('Soma das 4 parcelas de 2026/2027 em aberto: R$ 456,00. Informe o valor que saiu da conta, com desconto, se houver.'));
  await field('Valor total pago').fill('433,20'); await waitText('Um gasto de R$ 433,20');
  ok('pagar o ano todo: o gasto em Pago de outubro e as outras 3 parcelas saem depois', (await body()).includes('Um gasto de R$ 433,20 será registrado em Pago de outubro de 2026') &&
    (await body()).includes('Depois, as outras 3 parcelas de 2026/2027 em aberto saem de Contas a pagar.'));
  await scrollTo('Paguei o ano todo de uma vez (cota única)');
  await shot('46_paguei_o_ano_todo');
  await widthChecks('paguei o ano todo', '46_paguei_o_ano_todo_320px', { to: 'Paguei o ano todo de uma vez (cota única)' });
  await p.getByText('Depois, as outras 3 parcelas', { exact: false }).filter({ visible: true }).first().scrollIntoViewIfNeeded();
  await shot('46_paguei_o_ano_todo_previa');
  await btn('Confirmar pagamento').click(); await waitText('Pagamento registrado');
  t = await firstBodyWith('saíram de Contas a pagar');
  ok('pagamento do ano todo: faixa diz que as outras 3 parcelas saíram', t.includes('Pagamento registrado. As outras 3 parcelas de 2026/2027 saíram de Contas a pagar.'));
  await btn('Ver resumo do mês').click(); await waitText('Diferença do mês');
  await expectTotals('pagar o ano todo do Seguro residencial (R$ 433,20) → 4.333,20 / 1.666,80, a pagar 650', 'R$ 6.000,00', 'R$ 4.333,20', 'R$ 1.666,80', 'R$ 650,00');
  await openToPay();
  await waitRows('Próximos meses', (rows) => rows !== null && !rows.some((r) => r.startsWith('Seguro residencial')));
  ok('o grupo sai de Próximos meses e a parcela 1 aparece em Pagas', !((await sectionRows('Próximos meses')) ?? ['Seguro residencial']).some((r) => r.startsWith('Seguro residencial')) &&
    ((await sectionRows('Pagas')) ?? []).some((r) => /^Seguro residencial, paga em 07\/10\/2026, R\$ 433,20, conta em Pago de outubro de 2026/.test(r)));
  await openRow(/^Seguro residencial, paga em 07\/10\/2026/); await waitText('Desfazer pagamento');
  await btn('Desfazer pagamento').click(); await waitText('Desfazer pagamento?');
  await confirmIn('Desfazer pagamento'); await waitText('Pagamento desfeito');
  await btn('Ver resumo do mês').click(); await waitText('Diferença do mês');
  await expectTotals('desfazer o pagamento do ano todo → Pago 3.900, a pagar 650', 'R$ 6.000,00', 'R$ 3.900,00', 'R$ 2.100,00', 'R$ 650,00');
  await openToPay();
  await waitRows('Próximos meses', (rows) => (rows ?? []).some((r) => r.startsWith('Seguro residencial, vence em 15/11/2026')));
  const seguroRows = ((await sectionRows('Próximos meses')) ?? []).filter((r) => r.startsWith('Seguro residencial'));
  ok('desfazer: a parcela 1 volta sozinha, sem grupo, e as parcelas 2 a 4 continuam fora',
    JSON.stringify(seguroRows) === JSON.stringify(['Seguro residencial, vence em 15/11/2026, R$ 114,00, parcela 1 de 4 de 2026 a 2027, conta do ano']), seguroRows.join(' | '));

  // "Não houve em 2026" na Matrícula (cota única): a conta sai e não volta.
  await openSeriesList();
  await openRow(/^Matrícula, R\$ 1\.200,00, todo ano em 10\/12, conta do ano$/); await waitText('Ano a ano');
  await btn('Não houve em 2026').click(); await waitText('Tirar a conta de 2026?');
  ok('"Não houve em 2026": a conta sai, não volta, e a conta do ano continua em 2027', (await dialogText()).includes('Ela sai de Contas a pagar e não volta a ser criada. A conta do ano continua em 2027.'));
  await shot('47_nao_houve_no_ano');
  await confirmIn('Tirar conta'); await waitText('A conta de 2026 saiu de Contas a pagar.');
  await waitUntil(async () => (await visibleCount('button', /^Matrícula, vence em 10\/12\/2026/)) === 0);
  t = await body();
  ok('Matrícula de 2026 tirada: "2026 · não houve" e 2027 previsto', (await visibleCount('button', /^Matrícula, vence em 10\/12\/2026/)) === 0 && t.includes('2026 · não houve') &&
    t.includes('2027 · previsto · R$ 1.200,00 · entra em Contas a pagar em outubro de 2027'));

  // "Tirar as parcelas de 2026/2027 em aberto" no detail do Seguro residencial: a parcela 1, que voltou ao desfazer.
  await btn('Voltar').click(); await waitText('Por ano, se os valores não mudarem');
  await openRow(/^Seguro residencial, 4 parcelas de cerca de R\$ 120,00/); await waitText('Ano a ano');
  await waitText('2026/2027 · 4 parcelas · 1 em aberto · 3 tiradas · R$ 114,00').catch(() => {});
  ok('Ano a ano depois de desfazer: 1 em aberto e 3 tiradas', (await body()).includes('2026/2027 · 4 parcelas · 1 em aberto · 3 tiradas · R$ 114,00'));
  await btn('Tirar as parcelas de 2026 a 2027 em aberto').click(); await waitText('Tirar a parcela 1 de 2026/2027?');
  ok('tirar a última em aberto: "Tirar a parcela 1 de 2026/2027?"', (await dialogText()).includes('Ela sai de Contas a pagar e não volta a ser criada. A conta do ano continua em 2027/2028.'));
  await confirmIn('Tirar parcelas'); await waitText('A parcela 1 de 2026/2027 saiu de Contas a pagar.');
  await waitText('2026/2027 · 4 parcelas · 4 tiradas').catch(() => {});
  ok('Seguro residencial: as 4 parcelas de 2026/2027 tiradas, a conta do ano continua', (await body()).includes('2026/2027 · 4 parcelas · 4 tiradas') &&
    (await visibleCount('button', 'Tirar as parcelas de 2026 a 2027 em aberto')) === 0 && (await visibleCount('button', 'Encerrar conta do ano')) === 1);

  // Ano já começado e parcelas vencidas: Material escolar, 2 parcelas (05/09 e 05/10/2026), agrupadas em Contas vencidas.
  await btn('Voltar').click(); await waitText('Por ano, se os valores não mudarem');
  await btn('Nova conta do ano').click(); await waitText('Como você paga?');
  await field('Descrição').fill('Material escolar');
  await radio('Em parcelas no ano').click(); await field('Quantas parcelas por ano?').fill('2');
  await radio('Setembro').click(); await field('Dia do vencimento').fill('5');
  await radio('Não, é sempre o mesmo').click(); await field('Valor de cada parcela').fill('150'); await radio('Educação').click();
  await waitText('Próxima parcela a pagar em 2026');
  ok('ano já começado: "Próxima parcela a pagar em 2026", com o próximo vencimento a partir de hoje escolhido',
    (await radio('2027 (primeira vence em 05/09/2027)').getAttribute('aria-checked')) === 'true' && (await radio('2026 (primeira venceu em 05/09/2026)').getAttribute('aria-checked')) === 'false' &&
      (await radio('Parcela 2 (venceu em 05/10)').getAttribute('aria-checked')) === 'false' && (await body()).includes('As parcelas anteriores deste ano não viram gastos.'));
  await radio('2026 (primeira venceu em 05/09/2026)').click(); await waitText('Esta conta já venceu.');
  ok('primeira parcela vencida: aviso e prévia com as 2 parcelas de 2026', (await body()).includes('Material escolar · 2 parcelas de R$ 150,00 · todo dia 5, de setembro a outubro · a partir de 2026. R$ 300,00 por ano. As 2 parcelas de 2026 já entram em Contas a pagar; cada uma só entra em Ainda a pagar no mês em que vence.'));
  await btn('Salvar conta do ano').click(); await waitText('Conta do ano salva');
  ok('Material escolar salvo', (await body()).includes('Conta do ano salva. As 2 parcelas de 2026 já estão em Contas a pagar.'));
  await goResumo();
  await expectTotals('criar Material escolar (2 parcelas vencidas) → a pagar 950', 'R$ 6.000,00', 'R$ 3.900,00', 'R$ 2.100,00', 'R$ 950,00');
  await openToPay();
  await btn('Revisar vencidas').click(); await waitText('Marque o que você já pagou e tire o que não houve.');
  await waitText('Material escolar de 2026 · 2 parcelas vencidas');
  t = await body();
  ok('vencidas: as 2 parcelas sob o cabeçalho do ano, com "Selecionar as 2" e "Não houve em 2026"',
    (await visibleCount('heading', 'Material escolar de 2026 · 2 parcelas vencidas')) === 1 && (await visibleCount('button', 'Selecionar as 2 parcelas de Material escolar de 2026')) === 1 &&
      (await visibleCount('button', 'Não houve Material escolar em 2026')) === 1 && t.includes('Venceu em 05/09/2026 · Parcela 1 de 2 de 2026 · R$ 150,00') && t.includes('Venceu em 05/10/2026 · Parcela 2 de 2 de 2026 · R$ 150,00'));
  await shot('48_vencidas_conta_do_ano');
  await widthChecks('vencidas com grupo do ano', '48_vencidas_conta_do_ano_320px');
  await btn('Não houve Material escolar em 2026').click(); await waitText('Tirar as 2 parcelas de 2026?');
  t = await dialogText();
  ok('"Não houve em 2026" nas vencidas: as 2 parcelas, o total e o que continua', t.includes('Material escolar de 2026 · 2 parcelas · R$ 300,00') && t.includes('Elas saem de Contas a pagar e não voltam a ser criadas. A conta do ano continua em 2027.'));
  await confirmIn('Tirar parcelas'); await waitText('2 parcelas de 2026 saíram de Contas a pagar.');
  await waitText('Nenhuma conta vencida').catch(() => {});
  ok('as 2 parcelas saem de Contas vencidas', (await body()).includes('Nenhuma conta vencida') && !(await body()).includes('Material escolar'));
  await goResumo();
  await expectTotals('tirar as 2 parcelas vencidas → a pagar volta a 650', 'R$ 6.000,00', 'R$ 3.900,00', 'R$ 2.100,00', 'R$ 650,00');

  // Sair e entrar de novo na demonstração: as listas são lidas de novo e a geração do dia roda outra vez.
  // Nada do que foi tirado volta (Matrícula de 2026, parcelas do Seguro residencial e do Material escolar).
  await p.getByRole('button', { name: 'Conta: perfil, segurança e acesso ao plano' }).filter({ visible: true }).first().click(); await waitText('Acesso ao plano');
  // Ciclo A5: "O que é isso?" ao lado de "Saldo inicial" abre o resumo no lugar; a explicação completa abre por cima e
  // "Voltar à tarefa" volta para a Conta.
  const saldoHint = p.getByRole('button', { name: 'O que é isso? Saldo inicial', exact: true }).filter({ visible: true }).first();
  await saldoHint.waitFor({ timeout: 8000 }).catch(() => {});
  ok('/conta: "O que é isso?" de "Saldo inicial", fechado, com alvo de 44 px', (await saldoHint.getAttribute('aria-expanded')) === 'false' && ((await saldoHint.boundingBox())?.height ?? 0) >= 43.5 &&
    (await body()).includes('Saldo inicial: não informado.'));
  await saldoHint.click(); await waitText('Ler explicação completa');
  ok('/conta: o resumo abre no lugar, sem sair da tela', (await saldoHint.getAttribute('aria-expanded')) === 'true' && new URL(p.url()).pathname === '/conta');
  await saldoHint.evaluate((e) => e.scrollIntoView({ block: 'center' }));
  await shot('90_o_que_e_isso_saldo_inicial');
  await p.setViewportSize({ width: 320, height: 800 }); await p.waitForTimeout(400);
  await layoutChecks('conta com "O que é isso?" aberto 320px');
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(300);
  await btn('Ler explicação completa').click(); await waitText('Voltar à tarefa');
  ok('"Ler explicação completa" abre "Diferença do mês e saldo da conta"', new URL(p.url()).pathname === '/explicacao/saldo' &&
    (await p.locator('h1').filter({ hasText: /^Diferença do mês e saldo da conta$/ }).count()) === 1, p.url());
  await btn('Voltar à tarefa').click(); await waitText('Acesso ao plano');
  ok('"Voltar à tarefa" volta para a Conta, com o resumo ainda aberto', new URL(p.url()).pathname === '/conta' && (await saldoHint.getAttribute('aria-expanded')) === 'true', p.url());
  await btn('Sair deste aparelho').click(); await waitText('Seu dinheiro');
  await btn('Ver demonstração com dados fictícios').click(); await waitText('Diferença do mês');
  await expectTotals('depois de entrar de novo: outubro na base', 'R$ 6.000,00', 'R$ 3.900,00', 'R$ 2.100,00', 'R$ 650,00');
  await openToPay(); await waitText('Próximos meses');
  t = await body();
  ok('depois de uma nova geração, nada do que foi tirado ou pago de uma vez volta', ['Matrícula', 'Seguro residencial', 'Material escolar'].every((x) => !t.includes(x)) && t.includes('Seguro do carro'));
  await openSeriesList();
  t = await body();
  // O card tem as 5 contas do ano, "Nova conta do ano" e, desde o Ciclo A5, o link "Como se preparar para as contas do ano?".
  ok('"Por ano" com as 5 contas do ano (IPVA, IPTU, Matrícula, Seguro residencial e Material escolar)', t.includes('Por ano, se os valores não mudarem: R$ 6.180,00 (inclui R$ 4.680,00 estimados).') &&
    ((await sectionRows('Contas do ano')) ?? []).length === 7);
  await btn('Voltar').click(); await waitText('Contas em aberto com vencimento até o fim do mês');
  await btn('Voltar').click(); await waitText('Diferença do mês');

  // Correções da revisão do Ciclo A3. Começa e termina com outubro na base: 6.000 / 3.900 / 2.100 e 650.
  // Volta pela pilha até um texto aparecer (telas trocadas com replace deixam um número variável de telas).
  const backTo = async (text) => {
    for (let i = 0; i < 5 && !(await p.getByText(text, { exact: false }).filter({ visible: true }).count()); i++) { await btn('Voltar').click(); await p.waitForTimeout(400); }
    await waitText(text);
  };
  const yearRadios = (group) => p.getByRole('radiogroup', { name: group }).filter({ visible: true }).first().getByRole('radio').evaluateAll((es) => es.map((e) => `${e.getAttribute('aria-label') || e.textContent}${e.getAttribute('aria-checked') === 'true' ? ' *' : ''}`));

  // "Mudar a forma de pagamento" (IPVA, cota única em 20/01, desde 2027): só últimos anos em que a nova pode começar logo
  // depois, e a nova começa no ano seguinte ao último, sem voltar para o ano padrão (nada vence duas vezes).
  await openToPay(); await openSeriesList();
  await openRow(/^IPVA, cerca de R\$ 2\.400,00/); await waitText('Ano a ano');
  await btn('Mudar a forma de pagamento').click(); await waitText('Mudar a forma de pagamento?');
  await confirmIn('Encerrar e cadastrar nova'); await waitText('Qual é o último ano?');
  const lastYearChips = await yearRadios('Qual é o último ano?');
  ok('mudar a forma de pagamento: último ano só onde a nova cabe logo depois (2027), mais "Outro ano"', JSON.stringify(lastYearChips) === JSON.stringify(['2027', 'Outro ano']) &&
    (await body()).includes('Escolha o último ano com a forma de pagamento atual. Depois, você cadastra a nova a partir do ano seguinte.'), lastYearChips.join(' | '));
  await radio('Outro ano').click(); await field('Último ano (AAAA)').fill('2028');
  await waitText('a nova forma de pagamento só poderia ser cadastrada');
  ok('"Outro ano" 2028: o motivo aparece antes de encerrar', (await body()).includes('Com 2028 como último ano, a nova forma de pagamento só poderia ser cadastrada a partir de fevereiro de 2027. Escolha um ano anterior.'));
  await btn('Encerrar').click(); await p.waitForTimeout(500);
  ok('"Outro ano" 2028 não encerra a conta do ano', (await h1Name()) === 'Encerrar conta do ano' && !(await body()).includes('Conta do ano encerrada em'));
  await radio('2027').click(); await waitGone('a nova forma de pagamento só poderia');
  await btn('Encerrar').click(); await waitText('Conta do ano encerrada em 2027.');
  await waitText('2028 (vence em 20/01/2028)');
  t = await body();
  const newStarts = await yearRadios('Primeiro ano');
  ok('nova forma depois de encerrar em 2027: preenchida, com 2028 escolhido e sem 2027 (sem ano repetido)', (await h1Name()) === 'Nova conta do ano' &&
    t.includes('Conta do ano encerrada em 2027. Agora cadastre a nova forma de pagamento, a partir do ano seguinte.') && (await field('Descrição').inputValue()) === 'IPVA' &&
    (await field('Valor de referência').inputValue()) === '2.400,00' && (await radio('Janeiro').getAttribute('aria-checked')) === 'true' && (await field('Dia do vencimento').inputValue()) === '20' &&
    JSON.stringify(newStarts) === JSON.stringify(['2028 (vence em 20/01/2028) *']), newStarts.join(' | '));
  await radio('Em parcelas no ano').click(); await field('Quantas parcelas por ano?').fill('3');
  await waitText('2028 (primeira vence em 20/01/2028)');
  ok('trocar para 3 parcelas mantém 2028', (await radio('2028 (primeira vence em 20/01/2028)').getAttribute('aria-checked')) === 'true', (await yearRadios('Primeiro ano')).join(' | '));
  await radio('Dezembro').click(); await waitText('só pode ser cadastrado a partir de');
  const decStarts = await yearRadios('Primeiro ano');
  ok('dezembro: 2028/2029 ainda não cabe; o motivo aparece e nenhum outro ano é escolhido sozinho', (await body()).includes('O primeiro ano 2028/2029 só pode ser cadastrado a partir de janeiro de 2027.') &&
    decStarts.length > 0 && decStarts.every((r) => !r.endsWith(' *')), decStarts.join(' | '));
  await yearNames('nova forma com o motivo do primeiro ano');
  await btn('Salvar conta do ano').click(); await p.waitForTimeout(500);
  ok('sem primeiro ano, salvar não grava', (await h1Name()) === 'Nova conta do ano' && !(await body()).includes('Conta do ano salva'));
  await radio('Janeiro').click(); await radio('Uma vez no ano (cota única)').click(); await waitText('2028 (vence em 20/01/2028)');
  ok('de volta a janeiro e cota única: 2028 escolhido de novo', (await radio('2028 (vence em 20/01/2028)').getAttribute('aria-checked')) === 'true' && !(await body()).includes('só pode ser cadastrado a partir de'));
  await btn('Salvar conta do ano').click(); await waitText('Conta do ano salva');
  await waitText('desde 2028').catch(() => {});
  t = await body();
  ok('nova forma salva desde 2028', t.includes('Todo ano em 20/01 · desde 2028') && t.includes('2028 · previsto'), t.slice(0, 300));
  await backTo('Por ano, se os valores não mudarem');
  const ipvaRows = ((await sectionRows('Contas do ano')) ?? []).filter((r) => r.startsWith('IPVA'));
  ok('Contas do ano: o IPVA encerrado em 2027 e o novo desde 2028', ipvaRows.length === 2, ipvaRows.join(' | '));
  await keepText();

  // Ano que atravessa dezembro (Curso de idiomas, 6 parcelas de setembro a fevereiro, ano 2026/2027 já começado):
  // a dica do último ano, os nomes lidos "2026 a 2027", "Não houve" com parcelas que ainda não venceram e tirar com
  // resultado incerto.
  await btn('Nova conta do ano').click(); await waitText('Como você paga?');
  await field('Descrição').fill('Curso de idiomas');
  await radio('Em parcelas no ano').click(); await field('Quantas parcelas por ano?').fill('6');
  await radio('Setembro').click(); await field('Dia do vencimento').fill('5');
  await radio('Não, é sempre o mesmo').click(); await field('Valor de cada parcela').fill('100'); await radio('Educação').click();
  await waitText('2026/2027 (primeira venceu em 05/09/2026)');
  await radio('2026 a 2027 (primeira venceu em 05/09/2026)').click(); await waitText('Esta conta já venceu.');
  await radio('Termina em…').click(); await waitText('Último ano (AAAA)');
  ok('último ano de um período que atravessa dezembro: a dica diz qual ano digitar', (await body()).includes('Digite o ano em que começa o último período, como 2026 para 2026/2027.'));
  await scrollTo('Até quando?');
  await shot('52_ultimo_ano_dica');
  await yearNames('último ano que atravessa dezembro');
  await radio('Sem data para terminar').click(); await waitGone('Digite o ano em que começa o último período');
  await yearNames('nova conta do ano que atravessa dezembro');
  await keepText();
  await btn('Salvar conta do ano').click(); await waitText('Conta do ano salva');
  t = await firstBodyWith('já estão em Contas a pagar');
  ok('Curso de idiomas salvo com as 6 parcelas de 2026/2027', t.includes('Conta do ano salva. As 6 parcelas de 2026/2027 já estão em Contas a pagar.'));
  await yearNames('conta do ano que atravessa dezembro salva');
  await goResumo();
  await expectTotals('criar Curso de idiomas (2 parcelas vencidas) → a pagar 850', 'R$ 6.000,00', 'R$ 3.900,00', 'R$ 2.100,00', 'R$ 850,00');

  // Contas vencidas: o grupo lido "2026 a 2027", "Selecionadas" no nome falado e "Não houve" com o que sai de fato.
  await openToPay();
  await btn('Revisar vencidas').click(); await waitText('Marque o que você já pagou e tire o que não houve.');
  await waitText('Curso de idiomas de 2026/2027 · 2 parcelas vencidas');
  ok('vencidas: grupo de 2026/2027 com título e botões lidos "2026 a 2027"', (await visibleCount('heading', 'Curso de idiomas de 2026 a 2027 · 2 parcelas vencidas')) === 1 &&
    (await visibleCount('button', 'Selecionar as 2 parcelas de Curso de idiomas de 2026 a 2027')) === 1 && (await visibleCount('button', 'Não houve Curso de idiomas em 2026 a 2027')) === 1);
  await btn('Selecionar as 2 parcelas de Curso de idiomas de 2026 a 2027').click();
  await waitUntil(async () => (await visibleCount('button', 'Selecionadas: as 2 parcelas de Curso de idiomas de 2026 a 2027')) === 1);
  ok('vencidas: depois de selecionar, o nome falado começa por "Selecionadas", como o texto visível', (await visibleCount('button', 'Selecionadas: as 2 parcelas de Curso de idiomas de 2026 a 2027')) === 1 &&
    (await visibleCount('button', 'Marcar as 2 selecionadas como pagas no vencimento')) === 1);
  await yearNames('vencidas com grupo de 2026/2027');
  await btn('Não houve Curso de idiomas em 2026 a 2027').click(); await waitText('Tirar as 6 parcelas de 2026/2027 em aberto?');
  t = await dialogText();
  ok('"Não houve" nas vencidas: as 6 parcelas que saem de fato, o total e as que ainda não venceram', t.includes('Tirar as 6 parcelas de 2026/2027 em aberto?') &&
    t.includes('Curso de idiomas de 2026/2027 · 6 parcelas · R$ 600,00') && t.includes('Inclui 4 parcelas que ainda não venceram.') &&
    t.includes('Elas saem de Contas a pagar e não voltam a ser criadas. A conta do ano continua em 2027/2028.'), t);
  await yearNames('"Não houve" com parcelas que ainda não venceram');
  await keepText();
  await shot('53_nao_houve_inclui_a_vencer');
  await btn('Cancelar').click(); await p.waitForTimeout(300);
  ok('cancelar não tira nada', (await body()).includes('Curso de idiomas de 2026/2027 · 2 parcelas vencidas'));
  await btn('Voltar').click(); await waitText('Contas em aberto com vencimento até o fim do mês');

  // "Tirar todas as parcelas de 2026/2027 em aberto" com a resposta perdida (gravado, rede caiu): a tela confere na hora,
  // fecha com a faixa de sucesso e a parcela não fica na tela.
  await openRow(/^Curso de idiomas de 2026 a 2027, 4 parcelas/); await waitText('Ano a ano'); await waitText('Ver as 6 parcelas');
  await btn('Ver as 6 parcelas').click(); await waitText('Esconder as parcelas');
  await openRow(/^Curso de idiomas, vence em 05\/11\/2026/); await waitText('Parte de: Curso de idiomas');
  await btn('Excluir parcela').click(); await waitText('O que você quer excluir?');
  await btn('Tirar todas as parcelas de 2026 a 2027 em aberto').click(); await waitText('Tirar as 6 parcelas de 2026/2027 em aberto?');
  await p.evaluate(async () => { (await window.__e2e.repo()).failNextWrite = 'depois'; });
  await confirmIn('Tirar parcelas');
  t = await firstBodyWith('saíram de Contas a pagar');
  ok('resultado incerto ao tirar as parcelas do ano: conferido na hora, a tela fecha com a faixa de sucesso', t.includes('6 parcelas de 2026/2027 saíram de Contas a pagar.') && !t.includes('Não foi possível tirar') &&
    (await visibleCount('button', 'Marcar como paga')) === 0, t.slice(0, 300));
  await waitText('6 tiradas').catch(() => {});
  ok('a parcela tirada não fica na tela: o ano mostra as 6 tiradas', (await body()).includes('2026/2027 · 6 parcelas · 6 tiradas') && (await visibleCount('button', /^Curso de idiomas, vence em/)) === 0);
  await goResumo();
  await expectTotals('tirar as 6 parcelas do Curso de idiomas → a pagar volta a 650', 'R$ 6.000,00', 'R$ 3.900,00', 'R$ 2.100,00', 'R$ 650,00');

  // Taxa escolar (2 parcelas, 20/10 e 20/11/2026, valor fixo de R$ 80,00): sugestão de referência com confirmação e
  // "Paguei o ano todo" desmarcada sozinha quando a outra parcela deixa de estar em aberto em outro aparelho.
  await openToPay(); await openSeriesList();
  await btn('Nova conta do ano').click(); await waitText('Como você paga?');
  await field('Descrição').fill('Taxa escolar');
  await radio('Em parcelas no ano').click(); await field('Quantas parcelas por ano?').fill('2');
  await radio('Outubro').click(); await field('Dia do vencimento').fill('20');
  await radio('Não, é sempre o mesmo').click(); await field('Valor de cada parcela').fill('80'); await radio('Educação').click();
  await waitText('2026 (primeira vence em 20/10/2026)');
  ok('Taxa escolar: 2026 escolhido (primeiro vencimento a partir de hoje)', (await radio('2026 (primeira vence em 20/10/2026)').getAttribute('aria-checked')) === 'true');
  await btn('Salvar conta do ano').click(); await waitText('Conta do ano salva');
  await waitText('Ver as 2 parcelas');
  await btn('Ver as 2 parcelas').click(); await waitText('Esconder as parcelas');
  await openRow(/^Taxa escolar, vence em 20\/10\/2026/); await waitText('Marcar como paga');
  await btn('Marcar como paga').click(); await waitText('Confirmar pagamento');
  await field('Valor pago').fill('90,00');
  await btn('Confirmar pagamento').click(); await waitText('Pagamento registrado');
  await btn('Ver conta do ano').click(); await waitText('Ano a ano');
  await waitText('Usar esse valor como referência').catch(() => {});
  t = await body();
  ok('sugestão depois de pagar R$ 90,00: usar como referência a partir de 2027', t.includes('Em 2026 você pagou R$ 90,00 na parcela 1. Usar esse valor como referência de cada parcela a partir de 2027?') &&
    (await visibleCount('button', 'Usar R$ 90,00 por parcela a partir de 2027')) === 1, t.slice(0, 400));
  await btn('Usar R$ 90,00 por parcela a partir de 2027').click(); await waitText('Usar R$ 90,00 por parcela a partir de 2027?');
  t = await dialogText();
  ok('usar a sugestão pede confirmação, com o que muda e o que não muda', t.includes('Não muda: parcela 2 de 2026 (antes da parcela escolhida). As contas criadas depois já seguem o novo valor.') &&
    (await p.getByRole('dialog').or(p.getByRole('alert')).getByRole('button', { name: 'Usar como referência' }).count()) === 1 &&
    (await p.getByRole('dialog').or(p.getByRole('alert')).getByRole('button', { name: 'Voltar' }).count()) === 1, t);
  await keepText();
  await shot('54_usar_referencia_confirmar');
  await confirmIn('Voltar'); await waitGone('Usar R$ 90,00 por parcela a partir de 2027?');
  // "Histórico de valores" fica antes de "Ano a ano" (a sugestão vem depois, com o mesmo valor).
  const history = (text) => text.split('Histórico de valores')[1]?.split('Ano a ano')[0] ?? '';
  const newRef = { test: (text) => history(text).includes('R$ 90,00 por parcela a partir de 2027') };
  t = await body();
  ok('"Voltar" não grava: a sugestão continua e a referência segue R$ 80,00', (await visibleCount('button', 'Usar R$ 90,00 por parcela a partir de 2027')) === 1 && !t.includes('Referência atualizada') &&
    history(t).includes('R$ 80,00 por parcela a partir de 2026') && !newRef.test(t), history(t));
  await btn('Usar R$ 90,00 por parcela a partir de 2027').click(); await waitText('Usar R$ 90,00 por parcela a partir de 2027?');
  await confirmIn('Usar como referência');
  t = await firstBodyWith('Referência atualizada');
  ok('"Usar como referência" grava e a sugestão sai', t.includes('Referência atualizada: R$ 90,00 por parcela a partir de 2027.'), t.slice(0, 300));
  await waitUntil(async () => (await visibleCount('button', 'Usar R$ 90,00 por parcela a partir de 2027')) === 0);
  await waitUntil(async () => newRef.test(await body()));
  ok('depois de usar, a sugestão não aparece de novo e o histórico mostra R$ 90,00 a partir de 2027', (await visibleCount('button', 'Usar R$ 90,00 por parcela a partir de 2027')) === 0 && newRef.test(await body()));
  // Desfazer o pagamento e pagar de novo com "Paguei o ano todo" marcada; outro aparelho exclui a parcela 2.
  await waitText('Ver as 2 parcelas').catch(() => {});
  if (await visibleCount('button', 'Ver as 2 parcelas')) await btn('Ver as 2 parcelas').click();
  await waitText('Esconder as parcelas');
  await openRow(/^Taxa escolar, paga em 07\/10\/2026/); await waitText('Desfazer pagamento');
  await btn('Desfazer pagamento').click(); await waitText('Desfazer pagamento?');
  await confirmIn('Desfazer pagamento'); await waitText('Pagamento desfeito');
  await btn('Marcar como paga').click(); await waitText('Confirmar pagamento');
  const taxBox = p.getByRole('checkbox', { name: /^Paguei o ano todo de uma vez \(cota única\)/ }).filter({ visible: true }).first();
  await taxBox.waitFor({ timeout: 8000 }).catch(() => {});
  await taxBox.click(); await waitText('Soma das 2 parcelas de 2026 em aberto');
  ok('"Paguei o ano todo" marcada, com a soma das 2 parcelas', (await taxBox.getAttribute('aria-checked')) === 'true' && (await field('Valor total pago').count()) === 1);
  const removed = await otherDevice(async (repo, contextId) => {
    const list = await repo.listCommitments(contextId, '2026-10');
    const other = list.find((c) => c.description === 'Taxa escolar' && c.status === 'aberto' && c.series && c.series.number === 2);
    if (!other) return null;
    await repo.deleteCommitment(`e2e-outro-aparelho-${Date.now()}`, other.id, other.version);
    return other.id;
  });
  await waitText('não estão mais em aberto').catch(() => {});
  t = await body();
  ok('a outra parcela sai em outro aparelho: a caixa é desmarcada sozinha, com um aviso, e o valor volta a "Valor pago"', removed !== null &&
    t.includes('As outras parcelas de 2026 não estão mais em aberto, então a opção Paguei o ano todo foi desmarcada. Confira o valor pago.') &&
    (await taxBox.count()) === 0 && (await field('Valor pago').count()) === 1 && (await field('Valor total pago').count()) === 0, t.slice(0, 300));
  await keepText();
  await shot('55_paguei_o_ano_todo_desmarcada');
  await btn('Confirmar pagamento').click(); await waitText('Pagamento registrado');
  t = await body();
  ok('o pagamento segue sem a caixa (nada bloqueado)', t.includes('Pagamento registrado') && !t.includes('Não foi possível carregar'));
  await btn('Desfazer pagamento').click(); await waitText('Desfazer pagamento?');
  await confirmIn('Desfazer pagamento'); await waitText('Pagamento desfeito');
  await btn('Ver conta do ano').click(); await waitText('Ano a ano');
  await btn('Tirar as parcelas de 2026 em aberto').click(); await waitText('Tirar a parcela 1 de 2026?');
  await confirmIn('Tirar parcelas'); await waitText('A parcela 1 de 2026 saiu de Contas a pagar.');
  await tabsBack();
  await expectTotals('revisão do Ciclo A3 termina com outubro na base', 'R$ 6.000,00', 'R$ 3.900,00', 'R$ 2.100,00', 'R$ 650,00');
  // Fim do Ciclo A3.

  // Ciclo A6 · Achar tudo e calculadoras (D-034, D-035). Começa e termina com outubro na base: 6.000 / 3.900 / 2.100 e 650.
  // Calculadoras: o resultado aparece enquanto a pessoa digita, sem botão "Calcular", e nada é gravado (nem no repositório
  // da pessoa, nem no aparelho). Telas conferidas a 390 e a 320 px (título, largura, valores inteiros, alvos de toque).
  const DISCLAIMER = 'Simulação com os valores e as taxas que você informou. Não é recomendação de produto financeiro nem oferta de crédito.';
  const INTRO = 'Contas rápidas com os valores que você informa. Nada é gravado.';
  const CALC_LIST = [
    ['Decidir uma compra', [['Parcelado ou à vista?', 'Descubra os juros embutidos no parcelado'], ['Quanto custa por ano?', 'Assinaturas e gastos que se repetem']]],
    ['Dívidas e atrasos', [['Quanto custa uma dívida?', 'Rotativo, cheque especial ou empréstimo'], ['Quitar antes ou adiantar parcelas', 'Uma estimativa de quanto dos juros sai da conta'], ['Multa e juros por atraso', 'Com os valores do boleto']]],
    ['Guardar e dividir', [['Reserva para imprevistos', 'Quantos meses seus gastos essenciais cobrem'], ['Juntar para um objetivo', 'Quanto guardar por mês ou em quanto tempo'], ['Dividir as contas da casa', 'Partes iguais ou pela renda de cada pessoa']]],
  ];
  // Palavras de julgamento que nunca aparecem num resultado (spec4 §1.2, como em copy.test.ts).
  const JUDGMENT = /vale a pena|\bruim\b|\bcuidado\b|desperd[ií]cio|\bcorte\b|\batras(o|ad[oa])\b|estourou|\binvista\b|caixinha|saldo devedor/i;
  const resultTexts = [];
  // Linhas do resultado (região viva educada: só elas são relidas a cada mudança).
  const liveText = () => p.evaluate(() => [...document.querySelectorAll('[aria-live="polite"]')].filter((e) => e.getBoundingClientRect().width > 0).map((e) => e.innerText).join('\n').replace(/ /g, ' '));
  // Cartão inteiro do resultado (título, linhas, avisos e hipóteses), guardado para a conferência de termos no fim.
  const resultCardText = () => p.evaluate(() => [...document.querySelectorAll('[aria-live="polite"]')].filter((e) => e.getBoundingClientRect().width > 0).map((e) => e.parentElement.innerText).join('\n').replace(/ /g, ' '));
  const keepResult = async () => { resultTexts.push(await resultCardText()); await keepText(); };
  // Digita e sai do campo (os erros só aparecem depois de sair do campo).
  const typeIn = async (label, text) => { const f = field(label); await f.fill(text); await f.press('Tab'); };
  // O resultado acompanha a digitação: espera até 3 s todos os textos aparecerem.
  const shows = async (...texts) => {
    for (const end = Date.now() + 3000; ;) {
      const s = await body();
      if (texts.every((x) => s.includes(x))) return true;
      if (Date.now() > end) return false;
      await p.waitForTimeout(100);
    }
  };
  const openCalc = async (title) => {
    // Nome acessível "Título. legenda", sem o ponto depois de um título que termina em "?" (calcRowA11yLabel).
    await p.getByRole('button', { name: new RegExp(`^${title.replace(/[?]/g, '\\?')}${/[?.!]$/.test(title) ? '' : '\\.'} `) }).filter({ visible: true }).first().click();
    await waitUntil(async () => (await h1Name()) === title, 8000);
  };
  const backToCalcList = async () => { await btn('Voltar').click(); await waitUntil(async () => (await h1Name()) === 'Calculadoras', 8000); };
  // Aviso fixo no topo, visível sem rolar.
  const onScreen = (text) => p.evaluate((text) => {
    const e = [...document.querySelectorAll('div[dir="auto"]')].find((x) => x.textContent === text && x.getBoundingClientRect().width > 0);
    if (!e) return null;
    const r = e.getBoundingClientRect();
    return r.top >= 0 && r.bottom <= window.innerHeight;
  }, text);
  // Calculadoras: um título inteiro, sem pílula de contexto (nada é gravado em Pessoal nem em Família).
  const calcHeader = async (prefix, title) => {
    const r = await p.evaluate(() => {
      const shown = (e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0; };
      const h1s = [...document.querySelectorAll('h1')].filter(shown);
      return { h1: h1s.map((e) => e.getAttribute('aria-label') || e.textContent), cut: h1s.filter((e) => e.scrollHeight > e.clientHeight + 1 || e.scrollWidth > e.clientWidth + 1).length,
        pills: [...document.querySelectorAll('[aria-label^="Contexto:"]')].filter(shown).length };
    });
    ok(`${prefix}: título "${title}" inteiro, sem pílula de contexto`, r.h1.length === 1 && r.h1[0] === title && r.cut === 0 && r.pills === 0, JSON.stringify(r));
  };
  const calcWidths = async (prefix, title, shot320 = null) => {
    await calcHeader(`${prefix} 390px`, title);
    await layoutChecks(`${prefix} 390px`);
    ok(`${prefix}: sem o símbolo C`, (await symbolCount()) === 0);
    await keepResult();
    await p.setViewportSize({ width: 320, height: 800 }); await p.waitForTimeout(400);
    await calcHeader(`${prefix} 320px`, title);
    await layoutChecks(`${prefix} 320px`);
    if (shot320) await calcShot(shot320);
    await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(300);
  };
  // Captura da calculadora: tira o foco deixado pelo Tab (anel de foco ou texto selecionado) e mostra o cartão do resultado
  // (o último, quando há dois, como no parcelamento da fatura).
  const calcShot = async (name, last = false) => {
    await p.evaluate(() => document.activeElement?.blur?.());
    const r = p.getByText('Resultado', { exact: true }).filter({ visible: true });
    await (last ? r.last() : r.first()).evaluate((e) => e.scrollIntoView({ block: 'start' }));
    await p.waitForTimeout(200);
    await shot(name);
  };
  const storageNow = () => p.evaluate(() => { try { return JSON.stringify(Object.keys(localStorage).sort().map((k) => [k, localStorage.getItem(k)])); } catch { return 'erro'; } });
  // Retrato do repositório da pessoa: registros e contas a pagar de outubro e de dezembro de 2026 e os gastos fixos,
  // parcelamentos e contas do ano. Na demonstração, as gravações ficam no repositório em memória da página e nunca passam
  // pela rede; por isso "nada gravado" se confere comparando dois retratos, e não só pelas requisições.
  const repoSnapshot = () => p.evaluate(async () => {
    const repo = await window.__e2e.repo();
    const ctx = (await repo.getSpace()).personalContextId;
    const out = {};
    for (const m of ['2026-10', '2026-12']) { out[`registros ${m}`] = await repo.listRecords(ctx, m); out[`contas ${m}`] = await repo.listCommitments(ctx, m); }
    out.series = await repo.listSeries(ctx);
    return JSON.stringify(out);
  });
  // Diferença curta entre dois retratos (para a mensagem da conferência).
  const snapshotDiff = (a, b) => {
    if (a === b) return '';
    const x = JSON.parse(a); const y = JSON.parse(b);
    return Object.keys(x).filter((k) => JSON.stringify(x[k]) !== JSON.stringify(y[k])).map((k) => `${k}: ${x[k].length} → ${y[k].length}`).join(' | ');
  };

  // 1 e 2. Movimentos › Organizar › Calculadoras: 3 grupos, as 8 calculadoras, a abertura e o aviso.
  await p.getByRole('tab', { name: 'Movimentações' }).filter({ visible: true }).first().click(); await waitText('Registrar recebimento');
  await btn(SC.calc).click(); await waitText('Decidir uma compra');
  const writesBefore = writes.length;
  const storageBefore = await storageNow();
  const repoBeforeCalc = await repoSnapshot();
  const calcSections = await p.evaluate(() => [...document.querySelectorAll('[role=heading][aria-level="2"]')].filter((e) => e.getBoundingClientRect().width > 0).map((h) => {
    let box = h.parentElement;
    while (box && !box.querySelector('[role=button]')) box = box.parentElement;
    return [h.textContent, box ? [...box.querySelectorAll('[role=button]')].map((x) => x.getAttribute('aria-label')) : []];
  }));
  // Título e legenda no nome; sem ponto depois de um título que já termina em "?" (calcRowA11yLabel no core).
  const calcExpected = CALC_LIST.map(([g, items]) => [g, items.map(([a, b]) => `${a}${/[?.!]$/.test(a) ? '' : '.'} ${b}`)]);
  ok('calculadoras: 3 grupos e as 8 calculadoras, na ordem, com título e subtítulo no nome', JSON.stringify(calcSections) === JSON.stringify(calcExpected), JSON.stringify(calcSections));
  t = await body();
  ok('calculadoras: abertura e aviso fixo, sem pílula de contexto', t.includes(INTRO) && t.includes(DISCLAIMER) && (await p.locator('[aria-label^="Contexto:"]').filter({ visible: true }).count()) === 0);
  await calcHeader('calculadoras 390px', 'Calculadoras');
  await layoutChecks('calculadoras 390px');
  await keepText();
  await shot('56_calculadoras');
  await p.setViewportSize({ width: 360, height: 640 }); await p.waitForTimeout(400);
  ok('calculadoras 360 × 640: abertura e aviso visíveis sem rolar', (await onScreen(INTRO)) === true && (await onScreen(DISCLAIMER)) === true);
  await p.setViewportSize({ width: 320, height: 800 }); await p.waitForTimeout(400);
  await calcHeader('calculadoras 320px', 'Calculadoras');
  await layoutChecks('calculadoras 320px');
  await shot('56_calculadoras_320px', true);
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(300);

  // 3. Parcelado ou à vista?: 1.080,00 à vista ou 10 × 120,00.
  await openCalc('Parcelado ou à vista?');
  ok('parcelado: aviso fixo no topo, sem rolar, e espera sem botão "Calcular"', (await onScreen(DISCLAIMER)) === true && (await shows('Preencha os campos para ver o resultado.')) &&
    (await visibleCount('button', /^Calcular/)) === 0);
  await typeIn('Preço à vista', '1080');
  ok('parcelado: valor formatado ao sair do campo', (await field('Preço à vista').inputValue()) === '1.080,00');
  await field('Número de parcelas').fill('1');
  const earlyError = await shows('Use de 2 a 480 parcelas.');
  await field('Número de parcelas').press('Tab');
  ok('parcelado: o erro de faixa aparece só depois de sair do campo', !earlyError && (await shows('Use de 2 a 480 parcelas.')));
  await typeIn('Número de parcelas', '10'); await typeIn('Valor de cada parcela', '120,00');
  ok('parcelado: R$ 120,00 a mais, 1,96% ao mês e 26,27% ao ano, enquanto digita', await shows('Com estes números, o parcelado custa R$ 120,00 a mais.', 'Isso equivale a juros de 1,96% ao mês (26,27% ao ano).'));
  ok('parcelado: resultado na região viva educada (leitor de tela)', (await liveText()).includes('1,96% ao mês'));
  ok('parcelado: "Anotar como parcelamento" sem forma de pagamento escolhida', (await visibleCount('button', 'Anotar como parcelamento')) === 1);
  await calcShot('57_calc_parcelado');
  await radio('Sim').click();
  ok('parcelado: primeira parcela na compra → 2,42% ao mês e 33,28% ao ano', await shows('2,42% ao mês (33,28% ao ano)'));
  await radio('Cartão de crédito').click();
  await waitUntil(async () => (await visibleCount('button', 'Anotar como parcelamento')) === 0);
  ok('parcelado: "Cartão de crédito" esconde "Anotar como parcelamento" e mostra o aviso de fatura', (await visibleCount('button', 'Anotar como parcelamento')) === 0 &&
    (await shows('Parcelas de compras no cartão já entram na fatura')));
  await calcWidths('parcelado', 'Parcelado ou à vista?', '57_calc_parcelado_320px');
  await radio('Boleto ou carnê').click(); await radio('Não').click();
  await btn('Anotar como parcelamento').click(); await waitText('Total de parcelas');
  ok('"Anotar como parcelamento" abre o cadastro com Parcelado, o valor, as 10 parcelas e "Compra parcelada"', (await h1Name()) === 'Novo parcelamento' &&
    (await radio('Parcelado').getAttribute('aria-checked')) === 'true' && (await field('Valor da parcela').inputValue()) === '120,00' && (await field('Total de parcelas').inputValue()) === '10' &&
    (await radio('Compra parcelada (boleto ou crediário)').getAttribute('aria-checked')) === 'true', `${await field('Total de parcelas').inputValue()}`);
  await btn('Cancelar').click(); await p.waitForTimeout(400);
  if (await visibleCount('button', 'Descartar alterações')) await btn('Descartar alterações').click();
  await waitUntil(async () => (await h1Name()) === 'Parcelado ou à vista?', 8000);
  ok('voltar do cadastro sem salvar devolve a calculadora com o resultado', await shows('Com estes números, o parcelado custa R$ 120,00 a mais.'));
  await backToCalcList();

  // 4. Quanto custa uma dívida?: empréstimo, rotativo e parcelamento da fatura com o limite da Lei 14.690/2023.
  await openCalc('Quanto custa uma dívida?');
  await radio('Empréstimo ou outra dívida').click();
  await typeIn('Valor da dívida', '5.000,00'); await typeIn('Taxa de juros ao mês (%)', '2'); await typeIn('Número de parcelas', '12');
  ok('dívida: empréstimo de 5.000,00 a 2% em 12 → R$ 472,80 por parcela e R$ 5.673,60, com o lembrete do CET', await shows('Com estes números, são 12 parcelas de R$ 472,80.', 'Total: R$ 5.673,60', 'Confira o CET no contrato.'));
  await keepResult();
  await radio('Rotativo do cartão').click();
  await typeIn('Valor da dívida', '700,00'); await typeIn('Taxa de juros ao mês (%)', '14');
  ok('dívida: rotativo de 700,00 a 14% → R$ 98,00 de juros em 1 mês', await shows('Com estes números, os juros do rotativo somam R$ 98,00 em 1 mês.', 'O valor vai para R$ 798,00 na fatura seguinte.'));
  await typeIn('Taxa do parcelamento ao mês (%)', '8'); await typeIn('Em quantas parcelas', '24');
  ok('dívida: parcelar em 24 a 8% → total limitado a R$ 1.400,00, dizendo que o limite foi aplicado', await shows('R$ 1.818,96', 'Pelo limite da Lei 14.690/2023, juros e encargos não passam do valor original: o total fica em no máximo R$ 1.400,00.'));
  await calcShot('58_calc_divida', true);
  await calcWidths('dívida', 'Quanto custa uma dívida?');
  await backToCalcList();

  // 5. Quitar antes: 36 parcelas de 850,00 a 1,5% ao mês.
  await openCalc('Quitar antes ou adiantar parcelas');
  await typeIn('Valor da parcela', '850,00'); await typeIn('Parcelas que faltam', '36'); await typeIn('Taxa de juros ao mês do contrato (%)', '1,5');
  t = await body();
  ok('quitar antes: R$ 23.511,58 para quitar hoje e R$ 7.088,42 de desconto estimado', await shows('Valor estimado para quitar hoje: R$ 23.511,58', 'Desconto estimado sobre a soma das parcelas: R$ 7.088,42'));
  t = await body();
  ok('quitar antes: texto de estimativa e nunca "saldo devedor"', t.includes('Estimativa. O valor oficial é o que a instituição informar; peça o valor atualizado.') && !/saldo devedor/i.test(t));
  await calcShot('59_calc_quitar_antes');
  await calcWidths('quitar antes', 'Quitar antes ou adiantar parcelas');
  await backToCalcList();

  // 6. Multa e juros: 200,00 com 2% de multa e 1% ao mês, 10 dias depois do vencimento.
  await openCalc('Multa e juros por atraso');
  await typeIn('Valor da conta', '200,00'); await typeIn('Multa (%)', '2'); await typeIn('Juros ao mês (%)', '1'); await typeIn('Dias depois do vencimento', '10');
  ok('multa e juros: R$ 204,67, "depois do vencimento" e o boleto atualizado', await shows('Com estes números, 10 dias depois do vencimento a conta fica em R$ 204,67.', 'O valor exato é o do boleto atualizado.'));
  ok('multa e juros: o resultado não fala em atraso', !/atras/i.test(await resultCardText()));
  await calcShot('60_calc_multa_e_juros');
  await calcWidths('multa e juros', 'Multa e juros por atraso');
  await backToCalcList();

  // 7. Reserva: 3.750,00 por mês e 6 meses; 4.500,00 guardados; 500,00 por mês.
  await openCalc('Reserva para imprevistos');
  await typeIn('Gastos essenciais por mês', '3.750,00');
  await radio('6 meses').click();
  ok('reserva: 6 meses de 3.750,00 → R$ 22.500,00', await shows('Com estes números, a reserva de 6 meses é de R$ 22.500,00.'));
  await typeIn('Quanto já tem guardado', '4.500,00');
  ok('reserva: 4.500,00 guardados cobrem 1,2 mês', await shows('O que você já guardou cobre 1,2 mês de gastos essenciais.'));
  await typeIn('Quanto guarda por mês', '500,00');
  ok('reserva: guardando 500,00 por mês, 36 meses', await shows('Guardando R$ 500,00 por mês, a reserva fica completa em 36 meses (3 anos).'));
  ok('reserva: referência com fonte, sem link nem número enquanto a página não for conferida', (await shows('Portal do Investidor, da CVM')) &&
    (await p.getByRole('link', { name: /Portal do Investidor/ }).count()) + (await p.getByRole('button', { name: /Portal do Investidor/ }).count()) === 0);
  ok('reserva: nenhum botão de ação neste ciclo', (await visibleCount('button', /^(Criar reserva|Anotar)/)) === 0);
  await calcShot('61_calc_reserva');
  await calcWidths('reserva', 'Reserva para imprevistos');
  await backToCalcList();

  // 8. Juntar para um objetivo: 22.500,00 com 4.500,00 em 14 meses; ou 1.000,00 por mês.
  await openCalc('Juntar para um objetivo');
  await typeIn('Quanto quer juntar', '22.500,00'); await typeIn('Quanto já tem', '4.500,00'); await typeIn('Em quantos meses', '14');
  ok('objetivo: R$ 1.285,72 por mês em 14 meses, sem rendimento (dito na hipótese)', await shows('Com estes números, são R$ 1.285,72 por mês, por 14 meses (1 ano e 2 meses).', 'Sem rendimento: o valor guardado não cresce com juros.'));
  await radio('Em quanto tempo').click();
  await typeIn('Quanto vai guardar por mês', '1.000,00');
  ok('objetivo: guardando 1.000,00 por mês, 18 meses', await shows('Com estes números, guardando R$ 1.000,00 por mês, você chega lá em 18 meses (1 ano e 6 meses).'));
  await calcShot('62_calc_juntar_para_objetivo');
  await calcWidths('objetivo', 'Juntar para um objetivo');
  await backToCalcList();

  // 9. Dividir as contas: 3.000,00 pela renda (4.000,00 e 6.000,00); 100,00 em 3 partes iguais.
  await openCalc('Dividir as contas da casa');
  await typeIn('Total das contas', '3.000,00');
  await radio('Pela renda de cada pessoa').click();
  await typeIn('Renda de Pessoa 1', '4.000,00'); await typeIn('Renda de Pessoa 2', '6.000,00');
  ok('dividir: pela renda → R$ 1.200,00 (40%) e R$ 1.800,00 (60%)', await shows('Pessoa 1: R$ 1.200,00 (40%)', 'Pessoa 2: R$ 1.800,00 (60%)'));
  await calcShot('63_calc_dividir_contas');
  await keepResult();
  await radio('Em partes iguais').click();
  await typeIn('Total das contas', '100,00');
  await btn('Adicionar pessoa').click();
  ok('dividir: 100,00 em 3 partes iguais → R$ 33,34, R$ 33,33 e R$ 33,33 (o maior resto fecha a soma)', await shows('Pessoa 1: R$ 33,34 (33,3%)', 'Pessoa 2: R$ 33,33 (33,3%)', 'Pessoa 3: R$ 33,33 (33,3%)'));
  await calcWidths('dividir', 'Dividir as contas da casa', '63_calc_dividir_contas_320px');
  await backToCalcList();

  // 10. Quanto custa por ano?: 25,00 por semana.
  await openCalc('Quanto custa por ano?');
  await typeIn('Valor', '25,00');
  await radio('Por semana').click();
  ok('custo por ano: 25,00 por semana → R$ 108,33 por mês e R$ 1.300,00 por ano, com "52 semanas por ano"', await shows('R$ 108,33', 'R$ 1.300,00', '52 semanas por ano.'));
  await calcShot('64_calc_custo_por_ano');
  await calcWidths('custo por ano', 'Quanto custa por ano?');
  await btn('Anotar como gasto fixo').click(); await waitText('Valor por mês');
  ok('"Anotar como gasto fixo" abre o cadastro em "Todo mês" com o valor por mês', (await radio('Todo mês').getAttribute('aria-checked')) === 'true' && (await field('Valor por mês').inputValue()) === '108,33');
  await btn('Cancelar').click(); await p.waitForTimeout(400);
  if (await visibleCount('button', 'Descartar alterações')) await btn('Descartar alterações').click();
  await waitUntil(async () => (await h1Name()) === 'Quanto custa por ano?', 8000);
  await backToCalcList();

  // 11. Nada gravado: o repositório da pessoa (registros, contas a pagar e gastos fixos) igual ao de antes da primeira
  // calculadora, mesmo depois de abrir e cancelar os cadastros de "Anotar como...", nada novo no armazenamento do aparelho
  // e nenhuma requisição de escrita (POST, PATCH, PUT ou DELETE).
  const repoAfterCalc = await repoSnapshot();
  ok('calculadoras: nada gravado (repositório igual ao de antes da primeira calculadora, nada novo no aparelho, nenhuma requisição de escrita)',
    repoAfterCalc === repoBeforeCalc && (await storageNow()) === storageBefore && writes.length === writesBefore,
    [snapshotDiff(repoBeforeCalc, repoAfterCalc), ...writes.slice(writesBefore, writesBefore + 3)].filter(Boolean).join(' | '));
  const judged = resultTexts.map((s) => s.match(JUDGMENT)?.[0] ?? s.match(FORBIDDEN)?.[0]).filter(Boolean);
  ok('calculadoras: nenhum termo de julgamento, proibido ou travessão longo nos resultados', resultTexts.length >= 8 && resultTexts.every((s) => s.length > 0) && judged.length === 0, `${resultTexts.length} resultados ${judged.join(' | ')}`);
  await btn('Voltar').click(); await waitText('Registrar recebimento');

  // 12. Links na hora da decisão. Família sem vínculo (em Movimentos; o Resumo não muda).
  // Os links só abrem calculadoras: o repositório fica igual até o "outro aparelho" anotar a conta vencida.
  const repoBeforeLinks = await repoSnapshot();
  const writesBeforeLinks = writes.length;
  await p.getByRole('tab', { name: 'Ver dados de Família' }).filter({ visible: true }).first().click(); await waitText('Nenhuma família vinculada');
  await btn('Enquanto isso, dividir as contas da casa').click();
  await waitUntil(async () => (await h1Name()) === 'Dividir as contas da casa', 8000);
  ok('Família sem vínculo: "Enquanto isso, dividir as contas da casa" abre "Dividir as contas da casa"', (await h1Name()) === 'Dividir as contas da casa' && (await field('Total das contas').count()) === 1);
  await btn('Voltar').click(); await waitText('Nenhuma família vinculada');
  await p.getByRole('tab', { name: 'Resumo' }).filter({ visible: true }).first().click(); await waitText('Nenhuma família vinculada'); await p.waitForTimeout(300);
  ok('Família no Resumo: sem o link (o Resumo não muda)', (await visibleCount('button', 'Enquanto isso, dividir as contas da casa')) === 0);
  await p.getByRole('tab', { name: 'Ver dados de Pessoal' }).filter({ visible: true }).first().click(); await waitText('Diferença do mês');

  // Lista de gastos fixos: "Dividir estas contas" com o "Por mês" da tela.
  await openToPay(); await openSeriesList();
  const perMonth = ((await body()).match(/Por mês, se os valores não mudarem: R\$ ([\d.]+,\d\d)/) ?? [])[1];
  await btn('Dividir estas contas').click(); await waitText('Total das contas');
  ok('gastos fixos: "Dividir estas contas" abre a calculadora com o "Por mês" da lista', perMonth !== undefined && (await h1Name()) === 'Dividir as contas da casa' && (await field('Total das contas').inputValue()) === perMonth,
    `${perMonth} / ${await field('Total das contas').inputValue()}`);
  await btn('Voltar').click(); await waitText('Por ano, se os valores não mudarem');
  // Conta do ano (IPTU, 10 parcelas de 180,00): "Cota única ou parcelado? Fazer a conta".
  await openRow(/^IPTU, 10 parcelas/); await waitText('Ano a ano');
  await btn('Cota única ou parcelado? Fazer a conta').click(); await waitText('Valor da cota única');
  ok('IPTU: abre "Cota única ou parcelado?" com 10 parcelas de 180,00 e "vence junto" marcado', (await h1Name()) === 'Cota única ou parcelado?' &&
    (await field('Número de parcelas').inputValue()) === '10' && (await field('Valor de cada parcela').inputValue()) === '180,00' && (await radio('Sim').getAttribute('aria-checked')) === 'true' &&
    (await visibleCount('radiogroup', 'Como vai pagar as parcelas?')) === 0);
  await typeIn('Valor da cota única', '1.700,00');
  ok('cota única: a frase compara com a cota única', await shows('parcelar custa R$ 100,00 a mais que a cota única'));
  await calcShot('65_calc_cota_unica');
  await keepResult();
  await btn('Voltar').click(); await waitText('Ano a ano');
  await btn('Voltar').click(); await waitText('Por ano, se os valores não mudarem');
  // IPVA (cota única de 2.400,00).
  await openRow(/^IPVA, cerca de R\$ 2\.400,00/); await waitText('Ano a ano');
  await btn('Cota única ou parcelado? Fazer a conta').click(); await waitText('Valor da cota única');
  ok('IPVA: abre "Cota única ou parcelado?" com a cota única de 2.400,00', (await h1Name()) === 'Cota única ou parcelado?' && (await field('Valor da cota única').inputValue()) === '2.400,00');
  await btn('Voltar').click(); await waitText('Ano a ano');
  await btn('Voltar').click(); await waitText('Por ano, se os valores não mudarem');
  // Financiamento: parcela, parcelas que faltam e os vencimentos que a série já calcula.
  await openRow(/^Financiamento do carro, Parcela 13 de 48/); await waitText('Pagas antes do Clarevo');
  await btn('Quanto economizo se quitar antes?').click(); await waitText('Parcelas que faltam');
  await typeIn('Taxa de juros ao mês do contrato (%)', '1,5');
  ok('financiamento: "Quitar antes" com 850,00 e 36 parcelas, contadas pelos vencimentos (R$ 23.389,42)', (await h1Name()) === 'Quitar antes ou adiantar parcelas' &&
    (await field('Valor da parcela').inputValue()) === '850,00' && (await field('Parcelas que faltam').inputValue()) === '36' &&
    (await shows('Valor estimado para quitar hoje: R$ 23.389,42', 'Prazos contados pelos vencimentos das parcelas, com 30 dias por mês.')));
  await calcShot('66_calc_quitar_financiamento');
  await keepResult();
  await btn('Voltar').click(); await waitText('Pagas antes do Clarevo');
  await btn('Voltar').click(); await waitText('Por ano, se os valores não mudarem');
  // Gasto fixo mensal (Aluguel): "Quanto custa por ano?" com o valor e "Por mês", sem "Anotar como gasto fixo".
  await openRow(/^Aluguel, R\$ [\d.]+,\d\d, todo dia 5/); await waitText('Próximas contas');
  await btn('Quanto custa por ano?').click(); await waitText('Com que frequência?');
  // O valor de outubro (R$ 2.500,00; o aumento do Ciclo A vale a partir de novembro): por ano, 12 vezes.
  ok('Aluguel: "Quanto custa por ano?" com o valor atual e "Por mês" → R$ 30.000,00 por ano, sem "Anotar como gasto fixo"', (await radio('Por mês').getAttribute('aria-checked')) === 'true' &&
    (await field('Valor').inputValue()) === '2.500,00' && (await shows('R$ 30.000,00')) && (await visibleCount('button', 'Anotar como gasto fixo')) === 0, await field('Valor').inputValue());
  await btn('Voltar').click(); await waitText('Próximas contas');
  await btn('Voltar').click(); await waitText('Por ano, se os valores não mudarem');
  await btn('Voltar').click(); await waitText('Contas em aberto com vencimento até o fim do mês');
  const repoAfterLinks = await repoSnapshot();
  ok('links de contexto: nada gravado (repositório igual ao de antes do primeiro link, nenhuma requisição de escrita)', repoAfterLinks === repoBeforeLinks && writes.length === writesBeforeLinks,
    [snapshotDiff(repoBeforeLinks, repoAfterLinks), ...writes.slice(writesBeforeLinks, writesBeforeLinks + 3)].filter(Boolean).join(' | '));
  // Conta vencida (anotada em outro aparelho, 200,00 em 01/10): "Calcular multa e juros" com o valor e os 6 dias.
  await otherDevice((repo, contextId) => repo.createCommitment(`e2e-a6-vencida-${Date.now()}`, contextId, { description: 'Conta de água', amountCents: 20000, dueOn: '2026-10-01', category: null }));
  await waitText('Conta de água');
  await openRow(/^Conta de água, venceu em 01\/10\/2026/); await waitText('Calcular multa e juros');
  await btn('Calcular multa e juros').click(); await waitText('Dias depois do vencimento');
  ok('conta vencida: "Calcular multa e juros" abre com 200,00 e 6 dias depois do vencimento', (await h1Name()) === 'Multa e juros por atraso' &&
    (await field('Valor da conta').inputValue()) === '200,00' && (await field('Dias depois do vencimento').inputValue()) === '6');
  await btn('Voltar').click(); await waitText('Calcular multa e juros');
  await btn('Excluir conta a pagar').click(); await waitText('Excluir conta a pagar?');
  await confirmIn('Excluir conta a pagar'); await waitText('Conta a pagar excluída'); await waitText('Contas em aberto com vencimento até o fim do mês');
  await waitGone('Conta de água');
  await btn('Voltar').click(); await waitText('Diferença do mês');
  await expectTotals('links de contexto: outubro na base', 'R$ 6.000,00', 'R$ 3.900,00', 'R$ 2.100,00', 'R$ 650,00');

  // 13. Contas a pagar: "Já paguei" nas contas a vencer de valor fixo; "Informar valor e pagar" nas estimadas.
  // Outro aparelho cadastra um gasto fixo de valor estimado com conta em 28/10.
  await otherDevice((repo, contextId) => repo.createSeries(`e2e-a6-estimada-${Date.now()}`, contextId, { kind: 'mensal', nature: 'conta', description: 'Gás de cozinha', category: 'Moradia', amountCents: 8000, amountMode: 'variavel', dueDay: 28, firstDueMonth: '2026-10', firstNumber: 1, installmentTotal: null, partsPerYear: null, lastMonth: null }));
  await expectTotals('gás de cozinha estimado em 28/10 → a pagar 730', 'R$ 6.000,00', 'R$ 3.900,00', 'R$ 2.100,00', 'R$ 730,00');
  await openToPay(); await waitText('Gás de cozinha');
  const quickNames = ['Já paguei Internet, vence 15/10', 'Já paguei Condomínio, vence 20/10', 'Informar valor e pagar Gás de cozinha, vence 28/10'];
  ok('a vencer: "Já paguei" nas de valor fixo e "Informar valor e pagar" na estimada, com nome acessível completo', (await Promise.all(quickNames.map((n) => visibleCount('button', n)))).every((n) => n === 1) &&
    (await visibleCount('button', /^Já paguei Gás/)) === 0 && (await visibleCount('button', /^Já paguei (Aluguel|Seguro|Luz|Financiamento)/)) === 0);
  await layoutChecks('contas a pagar com "Já paguei" 390px');
  await scrollTo('A vencer em outubro de 2026');
  await shot('67_a_pagar_ja_paguei');
  await p.setViewportSize({ width: 320, height: 800 }); await p.waitForTimeout(400);
  await layoutChecks('contas a pagar com "Já paguei" 320px');
  await scrollTo('A vencer em outubro de 2026');
  await shot('67_a_pagar_ja_paguei_320px');
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(300);
  await btn('Já paguei Internet, vence 15/10').click(); await waitText('Marcar Internet como paga hoje?');
  t = await dialogText();
  ok('"Já paguei": diálogo com a conta, o valor e a data de hoje, e os três botões', t.includes('R$ 150,00 em 07/10/2026') &&
    (await Promise.all(['Confirmar pagamento', 'Mudar valor ou data', 'Cancelar'].map((n) => p.getByRole('dialog').or(p.getByRole('alert')).getByRole('button', { name: n, exact: true }).count()))).every((n) => n === 1), t);
  await shot('67_ja_paguei_dialogo');
  await btn('Cancelar').click(); await waitGone('Marcar Internet como paga hoje?');
  ok('"Cancelar" não grava nada', (await visibleCount('button', 'Já paguei Internet, vence 15/10')) === 1);
  await btn('Já paguei Internet, vence 15/10').click(); await waitText('Marcar Internet como paga hoje?');
  await confirmIn('Mudar valor ou data'); await waitText('Valor pago');
  ok('"Mudar valor ou data" abre o pagamento completo com o valor previsto', (await field('Valor pago').inputValue()) === '150,00' && (await field('Data do pagamento').inputValue()) === '07/10/2026');
  await btn('Cancelar').click(); await waitText('Contas em aberto com vencimento até o fim do mês');
  await btn('Já paguei Internet, vence 15/10').click(); await waitText('Marcar Internet como paga hoje?');
  await confirmIn('Confirmar pagamento'); await waitText('Internet marcada como paga.');
  await waitUntil(async () => (await visibleCount('button', 'Já paguei Internet, vence 15/10')) === 0);
  ok('"Confirmar pagamento": a Internet sai de "A vencer" e entra em "Pagas"', !((await sectionRows('A vencer em outubro de 2026')) ?? ['Internet']).some((r) => r.startsWith('Internet')) &&
    ((await sectionRows('Pagas')) ?? []).some((r) => /^Internet, paga em 07\/10\/2026, R\$ 150,00/.test(r)));
  await btn('Voltar').click(); await waitText('Diferença do mês');
  await expectTotals('"Já paguei" na Internet → Pago sobe R$ 150,00 (4.050), a pagar 580', 'R$ 6.000,00', 'R$ 4.050,00', 'R$ 1.950,00', 'R$ 580,00');
  // Resultado incerto (gravado, resposta perdida): a tela confere na hora e não paga duas vezes.
  await openToPay();
  await p.evaluate(async () => { (await window.__e2e.repo()).failNextWrite = 'depois'; });
  await btn('Já paguei Condomínio, vence 20/10').click(); await waitText('Marcar Condomínio como paga hoje?');
  await confirmIn('Confirmar pagamento'); await waitText('Condomínio marcada como paga.');
  const condoPaid = await otherDevice(async (repo, contextId) => (await repo.listRecords(contextId, '2026-10')).filter((r) => r.description === 'Condomínio' && r.commitmentId).length);
  ok('"Já paguei" com resultado incerto: conferido na hora, sucesso e um único gasto', condoPaid === 1, String(condoPaid));
  // Estimada: "Informar valor e pagar" abre o pagamento com o valor vazio.
  await btn('Informar valor e pagar Gás de cozinha, vence 28/10').click(); await waitText('Valor pago');
  ok('"Informar valor e pagar": pagamento com o valor vazio', (await field('Valor pago').inputValue()) === '' && (await visibleCount('button', 'Confirmar pagamento')) === 1);
  await btn('Cancelar').click(); await waitText('Contas em aberto com vencimento até o fim do mês');
  // Volta à base: desfaz os dois pagamentos e exclui o gasto fixo estimado.
  for (const name of ['Internet', 'Condomínio']) {
    await openRow(new RegExp(`^${name}, paga em 07/10/2026`)); await waitText('Desfazer pagamento');
    await btn('Desfazer pagamento').click(); await waitText('Desfazer pagamento?');
    await confirmIn('Desfazer pagamento'); await waitText('Pagamento desfeito');
    await btn('Voltar').click(); await waitText('Contas em aberto com vencimento até o fim do mês');
  }
  await openSeriesList();
  await openRow(/^Gás de cozinha/); await waitText('Excluir gasto fixo');
  await btn('Excluir gasto fixo').click(); await waitText('Excluir o gasto fixo');
  await confirmIn('Excluir gasto fixo'); await waitText('Gasto fixo excluído.');
  await goResumo();
  await expectTotals('desfazer os pagamentos e excluir o gás → base', 'R$ 6.000,00', 'R$ 3.900,00', 'R$ 2.100,00', 'R$ 650,00');

  // 14. Composição › "Por categoria" (só em Pago): barras que somam o Pago e 100%.
  await p.getByRole('button', { name: /^Pago, R\$ 3\.900,00/ }).filter({ visible: true }).first().click(); await waitText('Gastos pagos com data de pagamento neste mês.');
  ok('Pago: segmento "Por registro | Por categoria" como grupo de rádios, começando em "Por registro"', (await visibleCount('radiogroup', 'Mostrar Pago')) === 1 &&
    (await radio('Por registro').getAttribute('aria-checked')) === 'true' && (await radio('Por categoria').getAttribute('aria-checked')) === 'false');
  await radio('Por categoria').click();
  await waitUntil(async () => (await p.locator('[role=listitem][aria-label$=" do pago"]').count()) > 0);
  const bars = await p.locator('[role=listitem][aria-label$=" do pago"]').filter({ visible: true }).evaluateAll((es) => es.map((e) => e.getAttribute('aria-label').replace(/ /g, ' ')));
  const barCents = bars.map((l) => Number((l.match(/R\$ ([\d.]+,\d\d)/) ?? ['', '0'])[1].replace(/\D/g, '')));
  const barTenths = bars.map((l) => Math.round(Number((l.match(/, ([\d,]+)% do pago$/) ?? ['', 'NaN'])[1].replace(',', '.')) * 10));
  ok('"Por categoria": barras com valor e percentual que somam o Pago (R$ 3.900,00) e 100%', bars.length >= 2 && barCents.reduce((a, b) => a + b, 0) === 390000 && barTenths.reduce((a, b) => a + b, 0) === 1000 &&
    bars.every((l) => /^.+, R\$ [\d.]+,\d\d, [\d,]+% do pago$/.test(l)) && barCents.every((c, i) => i === 0 || c <= barCents[i - 1]), bars.join(' | '));
  await layoutChecks('por categoria 390px');
  await keepText();
  await shot('68_por_categoria');
  await p.setViewportSize({ width: 320, height: 800 }); await p.waitForTimeout(400);
  await layoutChecks('por categoria 320px');
  await shot('68_por_categoria_320px', true);
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(300);
  await btn('Voltar').click(); await waitText('Diferença do mês');
  await p.getByRole('button', { name: /^Recebido, R\$/ }).filter({ visible: true }).first().click(); await waitText('Recebimentos realizados');
  ok('Recebido: sem o segmento "Por categoria"', (await visibleCount('radiogroup', 'Mostrar Pago')) === 0 && (await visibleCount('radio', 'Por categoria')) === 0);
  await btn('Voltar').click(); await waitText('Diferença do mês');

  // 15. "Somar valores" em Anotar gasto: 35,90 + 12,50 → "Total: R$ 48,40" → "Usar o total" preenche 48,40.
  await btn('Anotar gasto').click(); await waitText('Será salvo em');
  await btn('Somar valores').click(); await field('Valor 1 da soma').waitFor({ timeout: 8000 });
  ok('"Somar valores" abre com dois campos e o botão com estado expandido', (await field('Valor 2 da soma').count()) === 1 &&
    (await p.getByRole('button', { name: 'Somar valores', exact: true }).filter({ visible: true }).first().getAttribute('aria-expanded')) === 'true');
  await field('Valor 1 da soma').fill('35,90'); await field('Valor 2 da soma').fill('12,50');
  await waitText('Total: R$ 48,40');
  ok('somar: 35,90 + 12,50 → "Total: R$ 48,40"', (await body()).includes('Total: R$ 48,40'));
  await layoutChecks('somar valores 390px');
  await scrollTo('Somar valores');
  await shot('69_somar_valores');
  await p.setViewportSize({ width: 320, height: 800 }); await p.waitForTimeout(400);
  await layoutChecks('somar valores 320px');
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(300);
  await btn('Usar o total').click(); await waitGone('Total: R$ 48,40');
  ok('"Usar o total" preenche 48,40, fecha a soma e devolve o foco ao Valor', (await field('Valor em reais').inputValue()) === '48,40' && (await field('Valor 1 da soma').count()) === 0 &&
    (await field('Valor em reais').evaluate((e) => e === document.activeElement)));
  await btn('Cancelar').click(); await waitText('Descartar o preenchimento?');
  await btn('Descartar alterações').click(); await waitText('Diferença do mês');
  await expectTotals('Ciclo A6 termina com outubro na base', 'R$ 6.000,00', 'R$ 3.900,00', 'R$ 2.100,00', 'R$ 650,00');
  // Fim do Ciclo A6 (Metas, Aprender, manifesto e endereços de entrada ficam mais abaixo).

  // Setembro → outubro
  await btn('Anotar gasto').click(); await waitText('Será salvo em');
  await field('Descrição').fill('Farmácia'); await field('Valor em reais').fill('80'); await field('Data do pagamento').fill('30/09/2026');
  await btn('Salvar gasto').click(); await waitText('Gasto salvo');
  ok('gasto de 30/09 afeta setembro', (await body()).includes('Setembro de 2026'));
  await btn('Ver resumo do mês').click(); await waitText('Diferença do mês'); await waitText('Setembro de 2026');
  // Setembro já foi aberto no bloco de contas a pagar: espera a nova leitura substituir a anterior.
  await p.getByText('R$ 2.170,00', { exact: true }).filter({ visible: true }).first().waitFor({ timeout: 8000 }).catch(() => {});
  t = await body();
  ok('setembro: 6.000 / 3.830 / 2.170', t.includes('R$ 3.830,00') && t.includes('R$ 2.170,00'));
  await p.getByRole('button', { name: /Próximo mês/ }).filter({ visible: true }).first().click(); await waitText('Outubro de 2026'); await p.waitForTimeout(500);
  t = await body();
  ok('outubro não inclui o gasto de 30/09', t.includes('R$ 3.900,00') && t.includes('R$ 2.100,00'));
  await p.getByRole('button', { name: /Mês anterior/ }).filter({ visible: true }).first().click(); await waitText('Setembro de 2026');
  await p.getByRole('button', { name: /Farmácia, Pago · 30\/09\/2026/ }).click(); await waitText('Editar registro');
  await btn('Editar registro').click(); await waitText('Editar gasto');
  await field('Data do pagamento').fill('01/10/2026'); await p.waitForTimeout(200);
  ok('aviso de mudança de mês', (await body()).includes('O registro sai de setembro de 2026 e passa a contar em outubro de 2026.'));
  await btn('Salvar gasto').click(); await waitText('Alterações salvas');
  await btn('Ver resumo do mês').click(); await waitText('Outubro de 2026'); await p.waitForTimeout(500);
  t = await body();
  ok('mover para outubro: outubro 3.980 / 2.020', t.includes('R$ 3.980,00') && t.includes('R$ 2.020,00'));
  await p.getByRole('button', { name: /Mês anterior/ }).filter({ visible: true }).first().click(); await waitText('Setembro de 2026'); await p.waitForTimeout(500);
  t = await body();
  ok('mover para outubro: setembro volta a 3.750 / 2.250', t.includes('R$ 3.750,00') && t.includes('R$ 2.250,00'));
  await p.getByRole('button', { name: /Próximo mês/ }).filter({ visible: true }).first().click(); await waitText('Outubro de 2026');

  // Família: estado explicativo
  await p.getByRole('tab', { name: 'Ver dados de Família' }).filter({ visible: true }).first().click(); await waitText('Nenhuma família vinculada');
  t = await body();
  ok('família sem membros simulados nem botão de anotar', t.includes('Nenhuma família vinculada') && !t.includes('Anotar gasto') && !t.includes('Anotar conta a pagar'));
  await shot('15_familia');
  await p.getByRole('tab', { name: 'Ver dados de Pessoal' }).filter({ visible: true }).first().click(); await waitText('Diferença do mês');

  // Contexto fixo durante o preenchimento; descartar não salva nada
  await btn('Anotar gasto').click(); await waitText('Será salvo em');
  ok('contexto visível e fixo no formulário', (await body()).includes('Salvando em Pessoal') && (await p.getByRole('tab', { name: 'Ver dados de Família' }).filter({ visible: true }).count()) === 0);
  await field('Descrição').fill('Rascunho');
  await btn('Cancelar').click(); await waitText('Descartar o preenchimento?');
  await btn('Descartar alterações').click(); await waitText('Diferença do mês');
  ok('descartar não salva o rascunho', !(await body()).includes('Rascunho'));

  // Metas, Aprender
  await p.getByRole('tab', { name: 'Metas' }).filter({ visible: true }).first().click(); await waitText('Metas chegam em uma próxima versão');
  await logoChecks('Metas: logotipo "clarevo." no cabeçalho azul, sem o símbolo C');
  const metasTitle = await p.evaluate(() => {
    const logo = [...document.querySelectorAll('[role=img][aria-label="Clarevo"]')].find((e) => e.getBoundingClientRect().width > 0);
    const h1 = [...document.querySelectorAll('h1')].find((e) => e.textContent === 'Metas' && e.getBoundingClientRect().width > 0);
    return logo && h1 ? h1.getBoundingClientRect().top - logo.getBoundingClientRect().bottom : null;
  });
  ok('Metas: o título da aba fica abaixo do logotipo', metasTitle !== null && metasTitle >= 0, `distância=${metasTitle}`);
  await shot('16_metas');
  // Ciclo A6: "Enquanto isso, faça as contas", com as 3 linhas que abrem telas que funcionam.
  ok('Metas: card "Enquanto isso, faça as contas" com Reserva, Juntar e Todas as calculadoras', JSON.stringify(await cardButtons('Enquanto isso, faça as contas')) === JSON.stringify([
    'Reserva para imprevistos. Quantos meses seus gastos essenciais cobrem', 'Juntar para um objetivo. Quanto guardar por mês ou em quanto tempo', 'Todas as calculadoras']), JSON.stringify(await cardButtons('Enquanto isso, faça as contas')));
  await layoutChecks('metas com as calculadoras 390px');
  await scrollTo('Enquanto isso, faça as contas');
  await shot('70_metas_calculadoras');
  await p.setViewportSize({ width: 320, height: 800 }); await p.waitForTimeout(400);
  await layoutChecks('metas com as calculadoras 320px');
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(300);
  const fromGoals = async (row, title) => {
    await p.getByRole('button', { name: new RegExp(`^${row}`) }).filter({ visible: true }).first().click();
    await waitUntil(async () => (await h1Name()) === title, 8000);
  };
  await fromGoals('Reserva para imprevistos', 'Reserva para imprevistos');
  await typeIn('Gastos essenciais por mês', '1.000,00'); await radio('3 meses').click();
  ok('Metas › Reserva para imprevistos: a calculadora funciona (3 meses de 1.000,00 → R$ 3.000,00)', await shows('Com estes números, a reserva de 3 meses é de R$ 3.000,00.'));
  await btn('Voltar').click(); await waitText('Enquanto isso, faça as contas');
  await fromGoals('Juntar para um objetivo', 'Juntar para um objetivo');
  await typeIn('Quanto quer juntar', '1.200,00'); await typeIn('Em quantos meses', '12');
  ok('Metas › Juntar para um objetivo: a calculadora funciona (1.200,00 em 12 meses → R$ 100,00 por mês)', await shows('R$ 100,00 por mês'));
  await btn('Voltar').click(); await waitText('Enquanto isso, faça as contas');
  await fromGoals('Todas as calculadoras', 'Calculadoras');
  const calcNames = calcExpected.flatMap(([, items]) => items);
  ok('Metas › Todas as calculadoras: a lista com as 8', calcNames.length === 8 && (await Promise.all(calcNames.map((n) => visibleCount('button', n)))).every((n) => n === 1));
  await btn('Voltar').click(); await waitText('Enquanto isso, faça as contas');
  await p.getByRole('tab', { name: 'Aprender' }).filter({ visible: true }).first().click(); await waitText('Diferença do mês e saldo da conta');
  await shot('17_aprender');
  // Ciclo A6: card "Calculadoras" no topo de Aprender, antes dos temas.
  const learnFirst = await p.evaluate(() => {
    const top = (e) => e.getBoundingClientRect().top;
    const shown = [...document.querySelectorAll('[role=button]')].filter((e) => e.getBoundingClientRect().width > 0 && !/^Conta:/.test(e.getAttribute('aria-label') || ''));
    const main = shown.filter((e) => !e.closest('[role=tablist]')).sort((a, b) => top(a) - top(b));
    return main[0] ? main[0].getAttribute('aria-label') || main[0].textContent : null;
  });
  ok('Aprender: card "Calculadoras" no topo', learnFirst === 'Calculadoras. Parcelado ou à vista, dívidas, reserva e outras contas com os seus números', learnFirst);
  await layoutChecks('aprender com as calculadoras 390px');
  await p.setViewportSize({ width: 320, height: 800 }); await p.waitForTimeout(400);
  await layoutChecks('aprender com as calculadoras 320px');
  await shot('71_aprender_calculadoras_320px');
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(300);
  await btn('Calculadoras. Parcelado ou à vista, dívidas, reserva e outras contas com os seus números').click(); await waitText('Decidir uma compra');
  ok('Aprender › Calculadoras abre /calcular', new URL(p.url()).pathname === '/calcular' && (await h1Name()) === 'Calculadoras');
  await btn('Voltar').click(); await waitText('Diferença do mês e saldo da conta');

  // Ciclo A5 · Aprender e dúvidas (D-031, D-032). Conteúdo educativo no aparelho: nada vai para a rede nem fica gravado.
  // Topo da aba (spec5_notes §2): título, introdução, busca, card "Calculadoras", "Comece por aqui", atalhos e as seções.
  const LEARN_SECTIONS = ['Usar o Clarevo', 'Organizar o mês', 'Juros e crédito', 'Dinheiro no tempo', 'Dúvidas frequentes'];
  const learnH2 = () => p.evaluate(() => [...document.querySelectorAll('h2, [role=heading][aria-level="2"]')].filter((e) => e.getBoundingClientRect().width > 0).map((e) => e.textContent));
  // Linhas de tema visíveis (nome acessível "{título}. {subtítulo}. Leitura de N minuto(s)."), de cima para baixo.
  const topicRows = () => p.evaluate(() => [...document.querySelectorAll('[role=button]')].filter((e) => e.getBoundingClientRect().width > 0 && / Leitura de \d+ minutos?\.$/.test(e.getAttribute('aria-label') || ''))
    .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top).map((e) => e.getAttribute('aria-label')));
  const learnSearch = () => p.getByLabel('Buscar um tema', { exact: true }).filter({ visible: true }).first();
  const learnBackToTab = async () => { await btn('Voltar para Aprender').click(); await waitText('Comece por aqui'); };
  await logoChecks('Aprender: logotipo "clarevo." no cabeçalho azul, sem o símbolo C');
  t = await body();
  const learnOrder = ['Buscar um tema', 'Calculadoras', 'Comece por aqui', 'Ir para', ...LEARN_SECTIONS].map((x) => t.indexOf(x));
  ok('Aprender: título "Aprender e dúvidas", aba "Aprender" com o nome "Aprender e dúvidas" e a introdução', (await h1Name()) === 'Aprender e dúvidas' &&
    (await p.getByRole('tab', { name: 'Aprender e dúvidas', exact: true }).filter({ visible: true }).count()) === 1 &&
    (await p.getByRole('tab', { name: 'Aprender e dúvidas', exact: true }).filter({ visible: true }).first().innerText()).trim() === 'Aprender' &&
    t.includes('Explicações curtas sobre contas, juros e o próprio Clarevo, com exemplos fictícios e fontes.'), await h1Name());
  ok('Aprender: busca, card "Calculadoras", "Comece por aqui", "Ir para" e as cinco seções, nessa ordem', learnOrder.every((v, i, a) => v >= 0 && (i === 0 || v > a[i - 1])) &&
    JSON.stringify(await learnH2()) === JSON.stringify(['Comece por aqui', ...LEARN_SECTIONS]), `${learnOrder.join(',')} ${JSON.stringify(await learnH2())}`);
  ok('Aprender: "Comece por aqui" com Diferença do mês, Juros simples e compostos e Gasto fixo', JSON.stringify((await cardButtons('Comece por aqui')).slice(0, 3).map((x) => x.split('. ')[0])) ===
    JSON.stringify(['Diferença do mês', 'Juros simples e juros compostos', 'Gasto fixo, conta a pagar e gasto anotado']), JSON.stringify(await cardButtons('Comece por aqui')));
  ok('Aprender: linha de tema com título, subtítulo e tempo de leitura no nome; rascunhos fora da lista', (await visibleCount('button', 'Diferença do mês. Como um registro entra no mês. Leitura de 1 minuto.')) >= 1 &&
    !t.includes('Orçamento e a referência 50-30-20') && !t.includes('Como apagar meus dados?') && t.includes('Conteúdo educativo e geral, com exemplos fictícios. O Clarevo não oferece crédito nem indica investimentos.'));
  ok('Aprender: sem o desenho do símbolo C', (await symbolCount()) === 0);
  await keepText();
  await layoutChecks('aprender e dúvidas 390px');
  await shot('86_aprender');
  await p.getByRole('heading', { name: 'Usar o Clarevo', exact: true }).filter({ visible: true }).first().evaluate((e) => e.scrollIntoView({ block: 'start' }));
  await shot('86_aprender_secoes');
  await p.setViewportSize({ width: 320, height: 800 }); await p.waitForTimeout(400);
  await layoutChecks('aprender e dúvidas 320px');
  await shot('86_aprender_320px');
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(300);
  // Atalho de seção: rola até a seção (não filtra) e leva o foco ao título dela.
  await btn('Ir para Dinheiro no tempo').click(); await p.waitForTimeout(900);
  const timeTop = await p.evaluate(() => [...document.querySelectorAll('h2, [role=heading][aria-level="2"]')].find((e) => e.textContent === 'Dinheiro no tempo' && e.getBoundingClientRect().width > 0)?.getBoundingClientRect().top ?? null);
  ok('"Ir para Dinheiro no tempo": a seção sobe para o topo e o foco vai para o título dela', timeTop !== null && timeTop >= 0 && timeTop < 200 &&
    (await p.evaluate(() => (document.activeElement?.textContent || '').startsWith('Dinheiro no tempo'))) && (await body()).includes('Usar o Clarevo'), String(timeTop));

  // Busca no aparelho: "juros" e "JÚROS" põem "Juros simples e juros compostos" primeiro; nenhuma requisição de rede.
  const learnRequests = [];
  const onLearnRequest = (r) => { if (!r.url().startsWith('data:')) learnRequests.push(r.url()); };
  p.on('request', onLearnRequest);
  await learnSearch().scrollIntoViewIfNeeded();
  await learnSearch().pressSequentially('juros', { delay: 30 }); await waitText('temas para "juros"');
  const jurosRows = await topicRows();
  ok('busca "juros": "Juros simples e juros compostos" primeiro, com "temas para" e sem o card "Calculadoras" nem as seções', (jurosRows[0] ?? '').startsWith('Juros simples e juros compostos.') &&
    jurosRows.some((r) => r.startsWith('Multa e juros por atraso.')) && jurosRows.some((r) => r.startsWith('Taxa ao mês e taxa ao ano.')) &&
    (await visibleCount('button', /^Calculadoras\./)) === 0 && !(await body()).includes('Comece por aqui'), jurosRows.slice(0, 3).join(' | '));
  await p.waitForTimeout(600);
  const learnLive = await p.evaluate(() => [...document.querySelectorAll('[aria-live="polite"]')].map((e) => e.textContent).filter(Boolean));
  ok('busca: a contagem é anunciada uma vez na região viva', learnLive.some((x) => /^\d+ temas para "juros"$/.test(x)), JSON.stringify(learnLive));
  // A região viva fica numa caixa de 1 px recortada, nunca com opacidade 0 (o TalkBack ignora o que é transparente).
  const liveBox = await p.evaluate(() => {
    const e = [...document.querySelectorAll('[aria-live="polite"]')].find((x) => /^\d+ temas para "juros"$/.test(x.textContent));
    if (!e) return null;
    const box = e.parentElement; const r = box.getBoundingClientRect(); const cs = getComputedStyle(box);
    return { w: r.width, h: r.height, overflow: cs.overflow, opacity: cs.opacity, own: getComputedStyle(e).opacity };
  });
  ok('busca: a região viva fica numa caixa de 1 px recortada e sem opacidade 0', liveBox !== null && liveBox.w === 1 && liveBox.h === 1 && liveBox.overflow === 'hidden' && liveBox.opacity === '1' && liveBox.own === '1', JSON.stringify(liveBox));
  await keepText();
  await layoutChecks('busca em aprender 390px');
  await shot('87_aprender_busca');
  await learnSearch().fill('JÚROS'); await p.waitForTimeout(200);
  ok('busca "JÚROS": o mesmo primeiro resultado', ((await topicRows())[0] ?? '').startsWith('Juros simples e juros compostos.'));
  await learnSearch().fill('zzzz'); await waitText('Nenhum tema encontrado');
  ok('busca "zzzz": "Nenhum tema encontrado" e a sugestão', (await body()).includes('Tente outra palavra, como juros, fatura ou parcela.') && (await visibleCount('button', 'Ver todos os temas')) === 1);
  await shot('87_aprender_busca_vazia');
  await btn('Ver todos os temas').click(); await waitText('Comece por aqui');
  ok('"Ver todos os temas" limpa a busca e volta a lista completa', (await learnSearch().inputValue()) === '' && (await visibleCount('button', /^Calculadoras\./)) === 1);
  await learnSearch().fill('cartao'); await p.waitForTimeout(200);
  await btn('Limpar busca').click(); await waitText('Comece por aqui');
  ok('"Limpar busca" limpa o campo e devolve o foco a ele', (await learnSearch().inputValue()) === '' && (await learnSearch().evaluate((e) => e === document.activeElement)));
  p.off('request', onLearnRequest);
  const learnStored = await p.evaluate(() => { try { return JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }); } catch { return ''; } });
  ok('busca: nenhuma requisição de rede e nada gravado no aparelho', learnRequests.length === 0 && !/juros|zzzz|cartao/i.test(learnStored), learnRequests.slice(0, 3).join(' | '));

  // Tema "Taxa ao mês e taxa ao ano": exemplo, "Ver a conta", hipóteses, fontes com data, revisão e aviso.
  await btn(/^Taxa ao mês e taxa ao ano\./).click(); await waitText('Voltar para Aprender');
  await shot('88_tema_taxa_mes_ano');
  t = await body();
  const verConta = p.getByRole('button', { name: 'Ver a conta', exact: true }).filter({ visible: true }).first();
  ok('tema: "26,82%", "Hipóteses do exemplo", "Ver a conta", "Fontes", consulta e "Revisado em"', ['26,82%', 'Hipóteses do exemplo', 'Fontes', 'Consultada em 09/10/2026', 'Revisado em 09/10/2026', 'Juros e crédito · 1 min de leitura',
    'Conteúdo educativo e geral. Não é recomendação de produto financeiro nem oferta de crédito.'].every((x) => t.includes(x)) && (await verConta.getAttribute('aria-expanded')) === 'false' &&
    (await p.locator('h1').filter({ hasText: /^Taxa ao mês e taxa ao ano$/ }).count()) === 1 && new URL(p.url()).pathname === '/explicacao/taxa-mes-ano', t.slice(0, 200));
  await verConta.click(); await p.waitForTimeout(300);
  ok('"Ver a conta" abre os passos no lugar', (await verConta.getAttribute('aria-expanded')) === 'true' && (await body()).length > t.length);
  ok('tema: fontes com papel de link e "Fazer a conta com os seus números"', (await p.getByRole('link').filter({ visible: true }).count()) >= 1 && (await visibleCount('button', 'Fazer a conta com os seus números')) === 1);
  ok('tema: sem o desenho do símbolo C', (await symbolCount()) === 0);
  await keepText();
  await layoutChecks('tema taxa ao mês 390px');
  await scrollTo('Exemplo');
  await shot('88_tema_taxa_mes_ano_conta');
  await scrollTo('Fontes');
  await shot('88_tema_taxa_mes_ano_fontes');
  await p.setViewportSize({ width: 320, height: 800 }); await p.waitForTimeout(400);
  await layoutChecks('tema taxa ao mês 320px');
  await p.locator('h1').filter({ hasText: /^Taxa ao mês e taxa ao ano$/ }).first().evaluate((e) => e.scrollIntoView({ block: 'start' }));
  await shot('88_tema_taxa_mes_ano_320px');
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(300);
  // Uma fonte abre o site numa janela nova; o app continua na explicação.
  const sourceNav = [];
  const onSourceNav = (r) => { if (r.isNavigationRequest() && !r.url().startsWith(`http://localhost:${PORT}`)) sourceNav.push(r.url()); };
  ctx.on('request', onSourceNav);
  const [popup] = await Promise.all([ctx.waitForEvent('page', { timeout: 8000 }).catch(() => null), p.getByRole('link').filter({ visible: true }).first().click()]);
  await waitUntil(async () => sourceNav.length > 0 || (popup !== null && popup.url().startsWith('http')), 5000);
  const sourceUrl = sourceNav[0] ?? (popup ? popup.url() : '');
  const allowedSource = (url, slug) => { try { const h = new URL(url).hostname; return new URL(url).protocol === 'https:' && (['gov.br', 'leg.br', 'jus.br', 'def.br'].some((d) => h === d || h.endsWith(`.${d}`)) || (slug === 'fgc' && (h === 'fgc.org.br' || h.endsWith('.fgc.org.br')))); } catch { return false; } };
  ok('fonte: abre outra janela com domínio oficial e o app continua na explicação', popup !== null && allowedSource(sourceUrl, 'taxa-mes-ano') && new URL(p.url()).pathname === '/explicacao/taxa-mes-ano', sourceUrl);
  ctx.off('request', onSourceNav);
  if (popup) await popup.close().catch(() => {});
  // Relacionado troca a explicação no lugar; "Voltar para Aprender" volta direto para a aba.
  await btn(/^Juros simples e juros compostos\./).click();
  await waitUntil(async () => new URL(p.url()).pathname === '/explicacao/juros-simples-compostos');
  ok('relacionado "Juros simples e juros compostos" abre', (await p.locator('h1').filter({ hasText: /^Juros simples e juros compostos$/ }).count()) === 1, p.url());
  await learnBackToTab();
  ok('"Voltar para Aprender" volta para a aba', new URL(p.url()).pathname === '/aprender', p.url());

  // Tema "Contas que mudam de valor": o exemplo e a conta escritos no catálogo chegam à tela, com "Ver a conta".
  await btn(/^Contas que mudam de valor\./).click(); await waitText('Voltar para Aprender');
  t = await body();
  const verContaE = p.getByRole('button', { name: 'Ver a conta', exact: true }).filter({ visible: true });
  ok('tema "Contas que mudam de valor": exemplo com média de R$ 172,40, "Hipóteses do exemplo" e um só "Ver a conta" fechado', new URL(p.url()).pathname === '/explicacao/estimativa' &&
    (await p.locator('h1').filter({ hasText: /^Contas que mudam de valor$/ }).count()) === 1 && t.includes('a média é R$ 172,40') && t.includes('Hipóteses do exemplo') &&
    (await verContaE.count()) === 1 && (await verContaE.first().getAttribute('aria-expanded')) === 'false', t.slice(0, 400));
  await verContaE.first().click(); await p.waitForTimeout(300);
  ok('tema "Contas que mudam de valor": "Ver a conta" mostra (165,30 + 180,00 + 171,90) ÷ 3 = 172,40', (await verContaE.first().getAttribute('aria-expanded')) === 'true' &&
    (await body()).includes('(165,30 + 180,00 + 171,90) ÷ 3 = 172,40.'), (await body()).slice(0, 600));
  await keepText();
  await layoutChecks('tema contas que mudam de valor 390px');
  await shot('96_tema_contas_que_mudam_de_valor');
  await learnBackToTab();

  // Dúvidas frequentes: a pergunta abre no lugar (aria-expanded), com o resumo e "Ler resposta completa".
  const faq = p.getByRole('button', { name: 'A empresa que oferece o benefício vê meus gastos?', exact: true }).filter({ visible: true }).first();
  await faq.scrollIntoViewIfNeeded();
  ok('pergunta fechada: aria-expanded=false', (await faq.getAttribute('aria-expanded')) === 'false');
  await faq.click();
  const faqOpacity = await p.evaluate(() => {
    const e = [...document.querySelectorAll('div[dir="auto"]')].find((x) => x.textContent.startsWith('Não. A empresa administra') && x.getBoundingClientRect().width > 0);
    let o = e ? 1 : 0;
    for (let n = e; n; n = n.parentElement) o *= Number(getComputedStyle(n).opacity);
    return o;
  });
  await waitText('A empresa administra seu acesso ao plano');
  ok('pergunta aberta: aria-expanded=true, o resumo e "Ler resposta completa"', (await faq.getAttribute('aria-expanded')) === 'true' && (await visibleCount('button', 'Ler resposta completa')) === 1);
  if (process.env.REDUZIR_MOVIMENTO) ok('reduzir movimento: a resposta aparece já com opacidade 1', faqOpacity === 1, String(faqOpacity));
  await faq.evaluate((e) => e.scrollIntoView({ block: 'start' }));
  await shot('89_duvida_aberta');
  await btn('Ler resposta completa').click(); await waitText('Voltar para Aprender');
  ok('"Ler resposta completa" abre a resposta', new URL(p.url()).pathname === '/explicacao/empresa-ve' && (await p.locator('h1').filter({ hasText: /^A empresa que oferece o benefício vê meus gastos\?$/ }).count()) === 1, p.url());
  await learnBackToTab();
  await faq.click(); await waitGone('A empresa administra seu acesso ao plano');

  // Todos os temas publicados, abertos pela aba (linhas das seções e "Ler resposta completa" das dúvidas), a 320 px:
  // título como cabeçalho de nível 1, nenhum termo vetado nos textos exibidos (spec3 R10; as fontes ficam fora), fontes
  // com papel de link, data de consulta e domínio permitido, sem rolagem lateral, alvos de 44 px e sem o símbolo C.
  const LEARN_FORBIDDEN = new RegExp(['poupan[cç]a', 'previd[eê]ncia', 'deb[eê]nture', 'fundos? (de|imobili)', 'cripto\\w*', 'bitcoin', 'consignado', 'portabilidade', 'endividad\\w*', 'estour\\w*',
    '\\bruim\\b', 'vil[aã]o', 'culpa', 'usu[aá]ri[oa]s?', 'bem-vind[oa]s?', 'preocupad[oa]s?', 'nubank', 'ita[uú]', 'bradesco', 'santander', 'banco do brasil', 'caixa econ[oô]mica', 'picpay',
    'mercado pago', '\\bxp\\b', 'btg', '\\bc6\\b', '\\binter\\b', 'serasa', 'boa vista', '\\bquod\\b', '\\bspc\\b'].join('|'), 'i');
  const VETOED = new RegExp(`\\bf(az|azer|azendo|a[cç]a|ar[aá]|ez|aria)\\s+${'sentido'}`, 'i');
  const RETURN_WORDS = /\b(sumiu|sumid\w*|abandon\w*|atrasad\w*|esquec\w*|deveria|culpa|bagun\w*|pend[eê]nci\w*)\b|aus[eê]nci|sem usar|\d+ dias?\b/i;
  const pageProblems = () => p.evaluate(() => {
    const shown = (e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0; };
    const out = [];
    if (document.documentElement.scrollWidth > window.innerWidth + 1) out.push('rolagem lateral');
    for (const e of document.querySelectorAll('body *')) { const b = e.getBoundingClientRect(); if (b.width > 0 && b.height > 0 && (b.right > window.innerWidth + 0.5 || b.left < -0.5)) { out.push(`fora: ${(e.getAttribute('aria-label') || e.textContent || e.tagName).slice(0, 30)}`); break; } }
    for (const e of document.querySelectorAll('[role=button],[role=link],[role=tab],[role=checkbox],button')) if (shown(e) && e.getBoundingClientRect().height < 43.5) out.push(`alvo: ${(e.getAttribute('aria-label') || e.textContent || '').slice(0, 30)}`);
    for (const e of document.querySelectorAll('div[dir="auto"], span')) if (shown(e) && e.children.length === 0 && /R\$/.test(e.textContent || '') && e.scrollWidth > e.clientWidth + 1) out.push(`cortado: ${e.textContent}`);
    return out;
  });
  const allowedSourceUrl = (url, slug) => { try { const u = new URL(url); const h = u.hostname; return u.protocol === 'https:' && (['gov.br', 'leg.br', 'jus.br', 'def.br'].some((d) => h === d || h.endsWith(`.${d}`)) || (slug === 'fgc' && (h === 'fgc.org.br' || h.endsWith('.fgc.org.br')))); } catch { return false; } };
  // Os sites das fontes não abrem aqui: window.open só anota o endereço pedido (a abertura real foi conferida acima).
  await p.evaluate(() => { window.__opened = []; window.__realOpen = window.open; window.open = (u) => { window.__opened.push(String(u)); return null; }; });
  await p.setViewportSize({ width: 320, height: 800 }); await p.waitForTimeout(400);
  const learnSeen = new Map();
  const learnIssues = { titulo: [], termos: [], fontes: [], layout: [] };
  const checkTopicPage = async (expectTitle) => {
    await waitText('Voltar para Aprender');
    const slug = decodeURIComponent(new URL(p.url()).pathname.split('/')[2] ?? '');
    const h1s = await p.evaluate(() => [...document.querySelectorAll('h1')].filter((e) => e.getBoundingClientRect().width > 0).map((e) => e.textContent));
    // O cabeçalho da pilha também é de nível 1 ("Aprender"); o título do tema vem depois dele.
    if (!(h1s.length === 2 && h1s[0] === 'Aprender' && expectTitle(h1s[1]))) learnIssues.titulo.push(`${slug}: ${JSON.stringify(h1s)}`);
    const text = await body();
    const shownText = text.split('\nFontes\n')[0] + '\n' + (text.split('Revisado em')[1] ?? '');
    const bad = shownText.match(FORBIDDEN)?.[0] ?? shownText.match(VETOED)?.[0] ?? shownText.match(LEARN_FORBIDDEN)?.[0] ?? (['sem-registro', 'voltei-depois'].includes(slug) ? shownText.match(RETURN_WORDS)?.[0] : null);
    if (bad || !text.includes('Revisado em')) learnIssues.termos.push(`${slug}: ${bad ?? 'sem "Revisado em"'}`);
    const links = p.getByRole('link').filter({ visible: true });
    const n = await links.count();
    for (let i = 0; i < n; i++) {
      const name = await links.nth(i).getAttribute('aria-label');
      await links.nth(i).click();
      const url = await p.evaluate(() => window.__opened[window.__opened.length - 1] ?? '');
      if (!allowedSourceUrl(url, slug) || !(name ?? '').includes('Consultada em')) learnIssues.fontes.push(`${slug}: ${url} (${name})`);
    }
    const lp = await pageProblems();
    if ((await symbolCount()) !== 0) lp.push('símbolo C');
    if (lp.length) learnIssues.layout.push(`${slug}: ${lp.slice(0, 3).join(', ')}`);
    learnSeen.set(slug, n);
    await learnBackToTab();
  };
  const learnLabels = [...new Set(await topicRows())];
  for (const label of learnLabels) {
    await p.getByRole('button', { name: label, exact: true }).filter({ visible: true }).first().click();
    await checkTopicPage((h) => label.startsWith(`${h}${/[?.!]$/.test(h) ? '' : '.'} `));
  }
  const faqNames = await p.evaluate(() => [...document.querySelectorAll('[role=button][aria-expanded]')].filter((e) => e.getBoundingClientRect().width > 0).map((e) => e.getAttribute('aria-label')));
  for (const q of faqNames) {
    const qb = p.getByRole('button', { name: q, exact: true }).filter({ visible: true }).first();
    await qb.click(); await btn('Ler resposta completa').click();
    await checkTopicPage((h) => h === q);
    await qb.click(); await waitGone('Ler resposta completa');
  }
  await p.evaluate(() => { window.open = window.__realOpen; });
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(300);
  const externalTopics = [...learnSeen].filter(([, n]) => n > 0).map(([s]) => s);
  ok('Aprender: 35 temas publicados abrem pela aba (28 nas seções e 7 dúvidas), cada um com o título como cabeçalho de nível 1', learnSeen.size === 35 && learnLabels.length === 28 && faqNames.length === 7 &&
    learnIssues.titulo.length === 0, `${learnSeen.size} temas, ${learnLabels.length} linhas, ${faqNames.length} dúvidas ${learnIssues.titulo.slice(0, 3).join(' | ')}`);
  ok('temas: nenhum termo vetado nem travessão longo nos textos exibidos', learnIssues.termos.length === 0, learnIssues.termos.slice(0, 3).join(' | '));
  ok('temas: fontes com papel de link, data de consulta e domínio permitido (oficial; FGC só no tema do FGC)', externalTopics.length >= 20 && learnIssues.fontes.length === 0,
    `${externalTopics.length} temas com fontes externas ${learnIssues.fontes.slice(0, 3).join(' | ')}`);
  ok('temas a 320 px: sem rolagem lateral, nada cortado, alvos de 44 px e sem o símbolo C', learnIssues.layout.length === 0, learnIssues.layout.slice(0, 3).join(' | '));

  // Larguras 320 e 736: sem transbordamento horizontal, botões com 44 px
  for (const w of [320, 736]) {
    await p.setViewportSize({ width: w, height: 800 });
    await goResumo(); await p.waitForTimeout(400);
    // O destaque "+ R$ 80,00" de Recebido ou Pago dura 3,2 s e pode estar esmaecendo bem na troca de largura.
    // Mede depois que ele some.
    await waitUntil(async () => (await p.locator('[aria-label^="Mais R$"], [aria-label^="Menos R$"]').filter({ visible: true }).count()) === 0, 5000);
    await layoutChecks(`largura ${w}px`);
    await shot(`18_resumo_${w}px`, true);
    await p.getByRole('button', { name: /^Ainda a pagar neste mês/ }).filter({ visible: true }).first().click(); await waitText('Contas a pagar'); await waitText('Seguro do carro'); await p.waitForTimeout(400);
    await layoutChecks(`contas a pagar ${w}px`);
    await shot(`24_contas_${w}px`, true);
    await headerChecks(`contas a pagar ${w}px`);
    // Telas novas: título inteiro (nenhum h1 cortado) e o contexto visível no cabeçalho.
    await openRow(/^Internet, vence em 15\/10\/2026/); await waitText('Marcar como paga'); await p.waitForTimeout(300);
    await headerChecks(`detalhe da conta ${w}px`);
    await layoutChecks(`detalhe da conta ${w}px`);
    if (w === 320) await shot('24_detalhe_conta_320px');
    await btn('Marcar como paga').click(); await waitText('Confirmar pagamento'); await p.waitForTimeout(300);
    await headerChecks(`marcar como paga ${w}px`);
    await layoutChecks(`marcar como paga ${w}px`);
    if (w === 320) await shot('24_marcar_como_paga_320px');
    await btn('Cancelar').click(); await waitText('Excluir conta a pagar');
    await btn('Voltar').click(); await waitText('Contas em aberto com vencimento até o fim do mês');
    await btn('Anotar conta a pagar').click(); await waitText('Salvar conta a pagar'); await p.waitForTimeout(300);
    await headerChecks(`anotar conta a pagar ${w}px`);
    await layoutChecks(`anotar conta a pagar ${w}px`);
    if (w === 320) await shot('24_anotar_conta_320px');
    await btn('Cancelar').click(); await waitText('Contas em aberto com vencimento até o fim do mês');
    // Telas do Ciclo A: conta de gasto fixo, lista, detalhe do parcelamento, encerrar, editar a partir de uma conta e cadastro.
    await openRow(/^Aluguel, vence em 05\/11\/2026/); await waitText('Parte de: Aluguel'); await p.waitForTimeout(300);
    await innerChecks(`conta de gasto fixo ${w}px`);
    if (w === 320) await shot('35_conta_gasto_fixo_320px', true);
    await btn('Voltar').click(); await waitText('Contas em aberto com vencimento até o fim do mês');
    await p.getByRole('button', { name: /^Gastos fixos e parcelamentos, / }).filter({ visible: true }).first().click(); await waitText('Por mês, se os valores não mudarem'); await p.waitForTimeout(300);
    await innerChecks(`gastos fixos ${w}px`);
    if (w === 320) await shot('35_gastos_fixos_320px', true);
    await openRow(/^Financiamento do carro, Parcela 13 de 48/); await waitText('Pagas antes do Clarevo'); await p.waitForTimeout(300);
    await innerChecks(`parcelamento ${w}px`);
    if (w === 320) await shot('35_parcelamento_320px', true);
    await btn('Encerrar parcelamento').click(); await waitText('Qual é a última conta?');
    await radio('Novembro (parcela 13)').click(); await waitText('Quitei o restante nesta parcela');
    await p.getByRole('checkbox', { name: /^Quitei o restante nesta parcela/ }).filter({ visible: true }).first().click(); await waitText('Valor total pago'); await p.waitForTimeout(300);
    await innerChecks(`encerrar parcelamento ${w}px`);
    if (w === 320) await shot('35_encerrar_parcelamento_320px', true);
    await btn('Cancelar').click(); await waitText('Descartar o preenchimento?');
    await btn('Descartar alterações').click(); await waitText('Pagas antes do Clarevo');
    await btn('Mudar valor ou dia a partir de uma conta').click(); await waitText('Aplicar a partir de'); await waitText('Valor da parcela'); await p.waitForTimeout(300);
    await innerChecks(`editar parcelamento ${w}px`);
    if (w === 320) await shot('35_editar_parcelamento_320px', true);
    await btn('Cancelar').click(); await waitText('Pagas antes do Clarevo');
    await btn('Voltar').click(); await waitText('Por mês, se os valores não mudarem');
    await btn('Novo gasto fixo ou parcelamento').click(); await waitText('Salvando em Pessoal');
    await radio('Parcelado').click(); await waitText('Total de parcelas');
    await field('Descrição').fill('Geladeira'); await radio('Compra parcelada (boleto ou crediário)').click();
    await field('Valor da parcela').fill('850'); await field('Dia do vencimento').fill('10');
    await field('Total de parcelas').fill('48'); await field('Número da próxima parcela a pagar').fill('13');
    await radio('Novembro (vence em 10/11)').click(); await waitText('Soma das 36 parcelas'); await p.waitForTimeout(300);
    if (w === 320) ok('prévia do parcelamento: parcelas que faltam, período e soma que não é o valor para quitar', (await body()).includes('Parcelas 13 a 48 de R$ 850,00, todo dia 10, de 10/11/2026 a 10/10/2029. Soma das 36 parcelas: R$ 30.600,00. Não é o valor para quitar.'));
    await innerChecks(`novo parcelamento ${w}px`);
    if (w === 320) {
      // Tipos com rótulos longos quebram dentro do chip; a prévia mostra a soma sem cortar o valor.
      await p.getByText('Tipo do parcelamento', { exact: true }).filter({ visible: true }).first().scrollIntoViewIfNeeded();
      await shot('35_novo_parcelamento_320px');
      await p.getByText('Como vai ficar', { exact: true }).filter({ visible: true }).first().scrollIntoViewIfNeeded();
      await shot('35_novo_parcelamento_previa_320px');
    }
    await btn('Cancelar').click(); await waitText('Descartar o preenchimento?');
    await btn('Descartar alterações').click(); await waitText('Por mês, se os valores não mudarem');
    // Telas do Ciclo A3: conta do ano (IPTU, com o ano previsto) e "Nova conta do ano" com a grade de meses e a prévia.
    await openRow(/^IPTU, 10 parcelas/); await waitText('Ano a ano'); await waitText('entra em Contas a pagar em dezembro de 2026'); await p.waitForTimeout(300);
    await innerChecks(`conta do ano ${w}px`);
    await keepText();
    if (w === 320) {
      await scrollTo('Ano a ano');
      await shot('49_conta_do_ano_iptu_320px');
    }
    await btn('Voltar').click(); await waitText('Por mês, se os valores não mudarem');
    await btn('Nova conta do ano').click(); await waitText('Como você paga?');
    await field('Descrição').fill('IPVA da moto'); await radio('Em parcelas no ano').click(); await field('Quantas parcelas por ano?').fill('3');
    await radio('Janeiro').click(); await field('Dia do vencimento').fill('31'); await field('Valor de referência').fill('12345,67');
    await waitText('Como vai ficar'); await p.waitForTimeout(300);
    const grid = await monthGrid('Mês da primeira parcela');
    ok(`nova conta do ano ${w}px: grade de meses inteira`, gridOk(grid, w === 320 ? 4 : 3), JSON.stringify(grid));
    await innerChecks(`nova conta do ano ${w}px`);
    await keepText();
    if (w === 320) {
      await scrollTo('Como vai ficar');
      await shot('49_nova_conta_do_ano_previa_320px');
    }
    await btn('Cancelar').click(); await waitText('Descartar o preenchimento?');
    await btn('Descartar alterações').click(); await waitText('Por mês, se os valores não mudarem');
    await btn('Voltar').click(); await waitText('Contas em aberto com vencimento até o fim do mês');
    await btn('Voltar').click(); await waitText('Diferença do mês');
  }
  // Ciclo A6 · atalhos do ícone na web (manifesto) e endereço pedido sem sessão: a entrada e, depois de entrar, a tela
  // pedida. Cada endereço recarrega a página (a demonstração volta ao começo), por isso fica no fim.
  const manifest = await p.evaluate(async () => {
    const link = document.querySelector('link[rel="manifest"]');
    if (!link) return null;
    const m = await (await fetch(link.getAttribute('href'))).json();
    const srcs = [...new Set((m.shortcuts ?? []).flatMap((x) => (x.icons ?? []).map((i) => i.src)))];
    const icons = await Promise.all(srcs.map(async (src) => { const r = await fetch(src); return r.ok && (r.headers.get('content-type') || '').startsWith('image/png'); }));
    return { shortcuts: (m.shortcuts ?? []).map((x) => [x.name, x.url, (x.icons ?? []).length]), icons };
  });
  ok('manifesto: 4 atalhos (Anotar gasto, Registrar recebimento, Contas a pagar, Calculadoras) com ícones que existem', manifest !== null && JSON.stringify(manifest.shortcuts) === JSON.stringify([
    ['Anotar gasto', '/registro/novo?tipo=despesa', 1], ['Registrar recebimento', '/registro/novo?tipo=receita', 1], ['Contas a pagar', '/a-pagar', 1], ['Calculadoras', '/calcular', 1]]) &&
    manifest.icons.length > 0 && manifest.icons.every(Boolean), JSON.stringify(manifest));
  const viaEntry = async (url, ready) => {
    await p.goto(`http://localhost:${PORT}${url}`); await waitText('Seu dinheiro');
    const atEntry = new URL(p.url()).pathname;
    await btn('Ver demonstração com dados fictícios').click(); await waitText(ready, 12000).catch(() => {});
    return atEntry;
  };
  let entry = await viaEntry('/calcular', 'Decidir uma compra');
  ok('atalho "Calculadoras" sem sessão: entrada e, depois de entrar, /calcular', entry === '/boas-vindas' && new URL(p.url()).pathname === '/calcular' && (await h1Name()) === 'Calculadoras', `${entry} → ${p.url()}`);
  entry = await viaEntry('/registro/novo?tipo=receita', 'Data do recebimento');
  ok('atalho "Registrar recebimento" sem sessão: depois de entrar, o registro de recebimento', entry === '/boas-vindas' && (await visibleCount('button', 'Salvar recebimento')) === 1, `${entry} → ${p.url()}`);
  // Atalho "Anotar gasto" retomado depois de entrar: o Resumo fica embaixo do cadastro, e "Voltar", "Cancelar" e
  // "Descartar alterações" (rascunho alterado) levam a ele, também na versão instalada, sem o botão de voltar do navegador.
  const backToResumo = async () => {
    await waitText('Diferença do mês').catch(() => {});
    // A tela do cadastro sai deslizando: espera o "Voltar" dela sumir.
    await waitUntil(async () => new URL(p.url()).pathname === '/' && (await visibleCount('button', 'Voltar')) === 0, 5000);
    return { path: new URL(p.url()).pathname, resumo: await p.getByText('Diferença do mês', { exact: true }).filter({ visible: true }).count(), voltar: await visibleCount('button', 'Voltar') };
  };
  const atResumo = (r) => r.path === '/' && r.resumo === 1 && r.voltar === 0;
  entry = await viaEntry('/registro/novo?tipo=despesa', 'Data do pagamento');
  ok('atalho "Anotar gasto" sem sessão: depois de entrar, o registro de gasto', entry === '/boas-vindas' && (await visibleCount('button', 'Salvar gasto')) === 1, `${entry} → ${p.url()}`);
  await btn('Voltar').click();
  let back = await backToResumo();
  ok('atalho "Anotar gasto": "Voltar" leva ao Resumo', atResumo(back), JSON.stringify(back));
  await viaEntry('/registro/novo?tipo=despesa', 'Data do pagamento');
  await btn('Cancelar').click();
  back = await backToResumo();
  ok('atalho "Anotar gasto": "Cancelar" leva ao Resumo', atResumo(back), JSON.stringify(back));
  await viaEntry('/registro/novo?tipo=despesa', 'Data do pagamento');
  await field('Descrição').fill('Padaria');
  await btn('Cancelar').click(); await waitText('Descartar o preenchimento?');
  await btn('Descartar alterações').click();
  back = await backToResumo();
  ok('atalho "Anotar gasto": rascunho alterado, "Cancelar" e "Descartar alterações" levam ao Resumo', atResumo(back), JSON.stringify(back));
  entry = await viaEntry('/a-pagar', 'Contas em aberto com vencimento até o fim do mês');
  ok('atalho "Contas a pagar" sem sessão: depois de entrar, Contas a pagar', entry === '/boas-vindas' && (await h1Name()) === 'Contas a pagar', `${entry} → ${p.url()}`);
  entry = await viaEntry('/calcular/multa-e-juros?valor=12345&dias=7', 'Dias depois do vencimento');
  ok('link de calculadora sem sessão: depois de entrar, a calculadora preenchida', (await h1Name()) === 'Multa e juros por atraso' &&
    (await field('Valor da conta').inputValue()) === '123,45' && (await field('Dias depois do vencimento').inputValue()) === '7', p.url());
  entry = await viaEntry('/calcular/nao-existe', 'Esta calculadora não está disponível.');
  ok('calculadora desconhecida: "Esta calculadora não está disponível." com "Ver todas as calculadoras"', (await body()).includes('Esta calculadora não está disponível.') && (await visibleCount('button', 'Ver todas as calculadoras')) === 1);
  await btn('Ver todas as calculadoras').click(); await waitText('Decidir uma compra');
  ok('"Ver todas as calculadoras" abre a lista', new URL(p.url()).pathname === '/calcular' && (await h1Name()) === 'Calculadoras');

  // Ciclo A5: endereço de tema desconhecido ou em rascunho mostra "Este conteúdo não está disponível."; um apelido
  // (slug antigo) abre o tema novo. De volta à largura padrão (o bloco de larguras termina em 736 px).
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(300);
  for (const slug of ['nao-existe', 'orcamento-50-30-20', 'apagar-dados']) {
    await viaEntry(`/explicacao/${slug}`, 'Este conteúdo não está disponível.');
    t = await body();
    ok(`/explicacao/${slug}: "Este conteúdo não está disponível." com "Ver temas de Aprender"`, t.includes('Este conteúdo não está disponível.') && (await visibleCount('button', 'Ver temas de Aprender')) === 1 &&
      !t.includes('Orçamento e a referência 50-30-20') && !t.includes('Como apagar meus dados?'), t.slice(0, 200));
  }
  await shot('91_tema_indisponivel');
  await btn('Ver temas de Aprender').click(); await waitText('Comece por aqui');
  ok('"Ver temas de Aprender" abre a aba Aprender', new URL(p.url()).pathname === '/aprender' && (await h1Name()) === 'Aprender e dúvidas', p.url());
  await viaEntry('/explicacao/reservas', 'Voltar à tarefa');
  ok('/explicacao/reservas (apelido) abre "Reserva para imprevistos"', (await p.locator('h1').filter({ hasText: /^Reserva para imprevistos$/ }).count()) === 1, p.url());
  // Ciclo A4 · Seus últimos meses (D-030), no cenário FICTÍCIO "retorno" da demonstração (?cenario=retorno): a
  // montagem da sequência R anotada em 20/05/2026 (Aluguel, Luz estimada e Financiamento do carro desde maio, contas de
  // maio pagas, Salário e Mercado) e aberta em 07/10/2026. Cada entrada recarrega a página e recomeça o cenário.
  const enterReturnDemo = async () => {
    await p.goto(`http://localhost:${PORT}/?cenario=retorno`); await waitText('Seu dinheiro');
    await btn('Ver demonstração com dados fictícios').click(); await waitText('Diferença do mês');
    await waitText('Sua última anotação foi em 20/05/2026.', 12000).catch(() => {});
  };
  // Bloco da faixa "Seus últimos meses" (do título aos botões); null se a faixa não aparece.
  const bandText = () => p.evaluate(() => {
    const h = [...document.querySelectorAll('[role=heading]')].find((e) => e.textContent === 'Seus últimos meses' && e.getBoundingClientRect().width > 0);
    let box = h?.parentElement;
    while (box && !box.querySelector('[role=button]')) box = box.parentElement;
    return box ? box.innerText.replace(/ /g, ' ') : null;
  });
  // Cartão de um mês em /retomar: do título do mês até o título seguinte.
  const monthCardText = (title) => p.evaluate((title) => {
    const h = [...document.querySelectorAll('[role=heading][aria-level="2"]')].find((e) => e.textContent === title && e.getBoundingClientRect().width > 0);
    return h ? h.parentElement.innerText.replace(/ /g, ' ') : null;
  }, title);
  // Passo de "Atualizar meses": título com o mês e "Mês i de n" (o elemento que recebe o foco ao trocar de passo).
  const stepTitle = () => p.evaluate(() => [...document.querySelectorAll('[role=heading][aria-level="2"]')].filter((e) => e.getBoundingClientRect().width > 0).map((e) => e.getAttribute('aria-label'))[0] ?? null);
  const focusedName = () => p.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? null);
  // Nada em vermelho nas telas da revisão (vencidas sem cor de erro; a situação vai em texto).
  const redTexts = () => p.evaluate(() => [...document.querySelectorAll('div[dir="auto"], span')].filter((e) => e.getBoundingClientRect().width > 0 && e.children.length === 0 && (e.textContent || '').trim() !== '' && getComputedStyle(e).color === 'rgb(180, 35, 24)').map((e) => e.textContent.slice(0, 40)));
  // Texto das telas da revisão, para as listas de cobrança e de contagem de dias sem anotar (spec3 §2.6, teste 8).
  const returnTexts = [];
  const keepReturnText = async () => { const s = await body(); returnTexts.push(s); screenTexts.push(s); };
  const bandOrder = () => p.evaluate(() => {
    const top = (sel, text) => [...document.querySelectorAll(sel)].find((e) => e.textContent === text && e.getBoundingClientRect().width > 0)?.getBoundingClientRect().top ?? null;
    return { faixa: top('[role=heading]', 'Seus últimos meses'), anotar: top('[role=button]', 'Anotar gasto'), pagamentos: top('[role=heading]', 'Pagamentos do mês') };
  });
  const BAND_BODY = 'Sua última anotação foi em 20/05/2026. Desde então: 4 meses com algo sem registro e 13 contas para conferir.';
  const toPayIs = (value) => async () => (await p.getByRole('button', { name: new RegExp(`^Ainda a pagar neste mês, R\\$ ${value.replace(/\./g, '\\.')}`) }).filter({ visible: true }).count()) === 1;
  const monthBack = async (title) => { await p.getByRole('button', { name: /Mês anterior/ }).filter({ visible: true }).first().click(); await waitText(title); };
  const monthForward = async (title) => { await p.getByRole('button', { name: /Próximo mês/ }).filter({ visible: true }).first().click(); await waitText(title); };

  // 2. Faixa no Resumo: sem valores, antes de "Anotar gasto", com a pílula "Demonstração".
  await enterReturnDemo();
  await waitText('4 meses com algo sem registro').catch(() => {});
  let band = await bandText();
  ok('retorno: faixa "Seus últimos meses" com a última anotação, 4 meses e 13 contas, e a nota', band !== null && band.includes(BAND_BODY) &&
    band.includes('Atualizar é opcional. Nada é preenchido sem a sua confirmação.') && (await visibleCount('button', 'Ver resumo')) === 1 && (await visibleCount('button', 'Seguir adiante')) === 1, band ?? '');
  ok('retorno: nenhum valor em reais na faixa', band !== null && !band.includes('R$'), band ?? '');
  const bo = await bandOrder();
  ok('retorno: a faixa fica no lugar dos avisos temporários, antes de "Anotar gasto", título de nível 2', bo.faixa !== null && bo.anotar !== null && bo.faixa < bo.anotar &&
    JSON.stringify(await headingList()) === JSON.stringify(['2:Outubro de 2026', '2:Seus últimos meses', '2:Pagamentos do mês']), `${JSON.stringify(bo)} ${JSON.stringify(await headingList())}`);
  ok('retorno: cenário fictício identificado com a pílula "Demonstração"', (await p.locator('[aria-label="Demonstração: acesso simulado e dados fictícios"]').filter({ visible: true }).count()) === 1);
  ok('retorno: Ainda a pagar R$ 10.590,00 com "Inclui R$ 540,00 em valores estimados."', (await toPayIs('10.590,00')()) && (await body()).includes('Inclui R$ 540,00 em valores estimados.'));
  await keepReturnText();
  await layoutChecks('faixa seus últimos meses 390px');
  await shot('72_seus_ultimos_meses');
  await p.setViewportSize({ width: 320, height: 800 }); await p.waitForTimeout(400);
  await layoutChecks('faixa seus últimos meses 320px');
  await shot('72_seus_ultimos_meses_320px');
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(300);
  // Só no mês atual: em setembro, sem a faixa.
  await monthBack('Setembro de 2026'); await p.waitForTimeout(500);
  ok('retorno: a faixa só aparece no mês atual', !(await bandShown()));
  await monthForward('Outubro de 2026'); await waitText('Seus últimos meses');
  // Contas a pagar: com a faixa ativa, o aviso das contas criadas já vencidas leva ao resumo dos últimos meses.
  await openToPay(); await waitText('O Clarevo criou');
  const createdBox = await p.evaluate(() => {
    const e = [...document.querySelectorAll('div[dir="auto"]')].find((x) => x.textContent.startsWith('O Clarevo criou') && x.getBoundingClientRect().width > 0);
    let box = e?.parentElement;
    while (box && !box.querySelector('[role=button]')) box = box.parentElement;
    return box ? { text: e.textContent, buttons: [...box.querySelectorAll('[role=button]')].map((x) => x.getAttribute('aria-label') || x.textContent) } : null;
  });
  ok('retorno: em Contas a pagar, o aviso das contas criadas vencidas troca "Revisar vencidas" por "Ver resumo dos últimos meses"', createdBox !== null &&
    createdBox.text === 'O Clarevo criou 4 contas de gastos fixos que já venceram. Confira se você já pagou.' && JSON.stringify(createdBox.buttons) === JSON.stringify(['Ver resumo dos últimos meses']), JSON.stringify(createdBox));
  await btn('Ver resumo dos últimos meses').click(); await waitText('Mês sem anotação não quer dizer mês sem gastos.');
  ok('"Ver resumo dos últimos meses" abre /retomar', new URL(p.url()).pathname === '/retomar' && (await h1Name()) === 'Seus últimos meses', p.url());
  await btn('Voltar').click(); await waitText('Contas em aberto com vencimento até o fim do mês');
  await btn('Voltar').click(); await waitText('Seus últimos meses');

  // 3. "Ver resumo": maio a setembro e "Outubro de 2026 (este mês)"; julho com as três contas sem conta registrada.
  await btn('Ver resumo').click(); await waitText('Mês sem anotação não quer dizer mês sem gastos.');
  t = await body();
  const retCards = await p.evaluate(() => [...document.querySelectorAll('[role=heading][aria-level="2"]')].filter((e) => e.getBoundingClientRect().width > 0).map((e) => e.textContent));
  ok('/retomar: abertura com a última anotação e o período, e a nota', t.includes('Sua última anotação foi em 20/05/2026. Abaixo, o que está registrado de maio a setembro de 2026 e as contas vencidas deste mês.') &&
    t.includes('Mês sem anotação não quer dizer mês sem gastos. Aqui aparece só o que está registrado no Clarevo.'), t.slice(0, 300));
  ok('/retomar: cartões de maio a setembro e "Outubro de 2026 (este mês)"', JSON.stringify(retCards) === JSON.stringify(['Maio de 2026', 'Junho de 2026', 'Julho de 2026', 'Agosto de 2026', 'Setembro de 2026']) &&
    t.includes('Outubro de 2026 (este mês) · 1 conta vencida em aberto: Aluguel, R$ 2.500,00, venceu em 05/10.'), retCards.join(' | '));
  ok('/retomar: maio compacto, com o que foi anotado', (await monthCardText('Maio de 2026'))?.includes('Recebido: R$ 6.000,00 · 1 recebimento · Pago: R$ 4.765,30 · 4 gastos'), await monthCardText('Maio de 2026'));
  const julyCard = await monthCardText('Julho de 2026');
  ok('/retomar: julho com Aluguel, Luz e a parcela 10 de 48 sem conta registrada', julyCard !== null && julyCard.includes('Recebido: nenhum recebimento anotado') && julyCard.includes('Pago: nenhum gasto anotado') &&
    julyCard.includes('Sem conta registrada: Aluguel · Financiamento do carro (parcela 10 de 48) · Luz'), julyCard ?? '');
  ok('/retomar: junho com as 3 contas em aberto e a parte estimada', (await monthCardText('Junho de 2026'))?.includes('Contas em aberto: 3 · R$ 3.530,00 · inclui R$ 180,00 estimados'), await monthCardText('Junho de 2026'));
  ok('/retomar: "Atualizar agora", "Seguir adiante" e o que "Seguir adiante" não faz', (await visibleCount('button', 'Atualizar agora')) === 1 && (await visibleCount('button', 'Seguir adiante')) === 1 &&
    t.includes('Seguir adiante não apaga nem cria nada. Os meses continuam sem registro, e as contas em aberto continuam em Contas a pagar.'));
  ok('/retomar: nada em vermelho', (await redTexts()).length === 0, (await redTexts()).join(' | '));
  await keepReturnText();
  await innerChecks('seus últimos meses 390px');
  await shot('73_retomar', true);
  await p.setViewportSize({ width: 320, height: 800 }); await p.waitForTimeout(400);
  await innerChecks('seus últimos meses 320px');
  await shot('73_retomar_320px', true);
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(300);
  // "Entenda" abre o tema "Mês sem registro" de Aprender; "Voltar à tarefa" volta à revisão.
  await btn('Entenda o mês sem registro').click(); await waitText('Voltar à tarefa');
  ok('/retomar: "Entenda" abre o tema "Mês sem registro"', new URL(p.url()).pathname === '/explicacao/sem-registro' && (await p.locator('h1').filter({ hasText: 'Mês sem registro' }).count()) === 1, p.url());
  await btn('Voltar à tarefa').click(); await waitText('Mês sem anotação não quer dizer mês sem gastos.');

  // 4. "Atualizar agora", junho: lote de Aluguel e carro, Luz com o valor vazio (171,90) e Salário no modo "Dia".
  await btn('Atualizar agora').click(); await waitText('Mês 1 de 5');
  ok('atualizar: junho é o passo 1 de 5 (só os meses com algo a conferir, e este mês)', (await stepTitle()) === 'Junho de 2026, Mês 1 de 5', await stepTitle());
  t = await body();
  ok('atualizar: junho com as 3 contas em aberto e "Recebimentos: nenhum anotado"', ['Gastos fixos, parcelamentos e contas do ano', 'R$ 2.500,00 · venceu em 05/06/2026 · em aberto', 'Parcela 9 de 48 · R$ 850,00 · venceu em 10/06/2026 · em aberto',
    'cerca de R$ 180,00 (estimado) · venceu em 12/06/2026 · em aberto', 'Recebimentos: nenhum anotado', 'Gastos: nenhum anotado'].every((x) => t.includes(x)), t.slice(0, 400));
  const juneBoxes = await p.getByRole('checkbox').filter({ visible: true }).evaluateAll((es) => es.map((e) => `${e.getAttribute('aria-label')}=${e.getAttribute('aria-checked')}`));
  ok('atualizar: caixas só nas contas de valor fixo, desmarcadas (a Luz estimada fica fora do lote)', JSON.stringify(juneBoxes) === JSON.stringify(['Selecionar Aluguel de junho, R$ 2.500,00=false', 'Selecionar Financiamento do carro de junho, R$ 850,00=false']), juneBoxes.join(' | '));
  ok('atualizar: parcela sem "Não houve"; gasto fixo com "Já paguei" e "Não houve"', (await visibleCount('button', 'Não houve: Financiamento do carro de junho')) === 0 &&
    (await visibleCount('button', 'Já paguei: Financiamento do carro de junho')) === 1 && (await visibleCount('button', 'Não houve: Aluguel de junho')) === 1 && (await visibleCount('button', 'Pular este mês')) === 1);
  // Teclado: Shift+Tab do "Já paguei" leva à caixa, com foco visível de 3 px; Espaço marca; Tab volta ao botão.
  await btn('Já paguei: Aluguel de junho').focus(); await p.keyboard.press('Shift+Tab');
  const boxRing = await focusRing();
  await p.keyboard.press(' '); await p.waitForTimeout(200);
  const boxChecked = await p.getByRole('checkbox', { name: 'Selecionar Aluguel de junho, R$ 2.500,00' }).getAttribute('aria-checked');
  await p.keyboard.press('Tab');
  const paidRing = await focusRing();
  ok('teclado: caixa e botão da linha com foco visível de 3 px; Espaço marca a caixa', boxRing === 'checkbox  3px solid' && boxChecked === 'true' && paidRing === 'button Já paguei 3px solid', `${boxRing} / ${boxChecked} / ${paidRing}`);
  await p.getByRole('checkbox', { name: 'Selecionar Financiamento do carro de junho, R$ 850,00' }).click();
  await waitText('Marcar as 2 selecionadas como pagas no vencimento');
  await keepReturnText();
  await innerChecks('atualizar junho 390px');
  ok('atualizar: nada em vermelho', (await redTexts()).length === 0, (await redTexts()).join(' | '));
  await shot('74_atualizar_junho');
  await p.setViewportSize({ width: 320, height: 800 }); await p.waitForTimeout(400);
  await innerChecks('atualizar junho 320px');
  await shot('74_atualizar_junho_320px', true);
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(300);
  await btn('Marcar as 2 selecionadas como pagas no vencimento').click(); await waitText('Marcar 2 contas como pagas?');
  t = await dialogText();
  ok('lote: diálogo com cada conta, o valor, o vencimento e a conta de saída', t.includes('Aluguel: R$ 2.500,00 em 05/06/2026. Financiamento do carro (parcela 9 de 48): R$ 850,00 em 10/06/2026. Saem da conta Conta principal.'), t);
  await shot('75_lote_dialogo');
  await confirmIn('Marcar como pagas'); await waitText('Paga em 10/06/2026 · R$ 850,00');
  t = await body();
  ok('lote: as 2 contas pagas no vencimento, com "Desfazer", e o rodapé passa a "Próximo mês"', t.includes('Paga em 05/06/2026 · R$ 2.500,00') && t.includes('2 contas marcadas como pagas') &&
    (await visibleCount('button', 'Desfazer: Aluguel de junho')) === 1 && (await visibleCount('button', 'Próximo mês')) === 1 && (await visibleCount('button', 'Pular este mês')) === 0, t.slice(0, 500));
  // Luz (valor que muda, em aberto): "Já paguei" abre o pagamento com o valor vazio e a data do vencimento.
  await btn('Já paguei: Luz de junho').click(); await waitText('Digite o valor da conta. A estimativa era R$ 180,00.');
  ok('Luz estimada: pagamento com o valor vazio, a dica da estimativa e a data do vencimento', (await field('Valor pago').inputValue()) === '' && (await field('Data do pagamento').inputValue()) === '12/06/2026');
  await field('Valor pago').fill('171,90'); await btn('Confirmar pagamento').click();
  await waitText('Mês 1 de 5'); await waitText('Paga em 12/06/2026 · R$ 171,90');
  ok('Luz de junho paga com R$ 171,90, de volta ao passo', (await body()).includes('Paga em 12/06/2026 · R$ 171,90'));
  // Recebimentos no modo "Dia": o mês já vem escolhido; só o dia.
  await btn('Anotar recebimentos').click(); await waitText('Dia do recebimento em junho de 2026.');
  ok('modo "Dia": campo com o nome "Dia de junho de 2026" (sem "barra zero seis"), a dica e "Usar outra data"', (await p.getByLabel('Dia de junho de 2026', { exact: true }).filter({ visible: true }).count()) === 1 &&
    (await p.getByLabel(/^Dia, /).filter({ visible: true }).count()) === 0 &&
    (await visibleCount('button', 'Usar outra data')) === 1 && (await visibleCount('button', 'Salvar e anotar outro')) === 1 && (await visibleCount('button', 'Salvar')) === 1);
  // Alvo de toque: o campo tem pelo menos 44 px de largura e a caixa inteira (inclusive o sufixo "/06/2026") foca o campo.
  const diaBox = await field('Dia de junho de 2026').evaluate((e) => { const i = e.getBoundingClientRect(); const c = e.parentElement.getBoundingClientRect(); return { inputW: i.width, boxW: c.width, boxH: c.height, x: c.x, y: c.y }; });
  await p.evaluate(() => document.activeElement?.blur());
  await p.mouse.click(diaBox.x + diaBox.boxW - 8, diaBox.y + diaBox.boxH / 2);
  const diaFocus = await p.evaluate(() => document.activeElement?.getAttribute('aria-label'));
  ok('modo "Dia": campo com pelo menos 44 px e a caixa inteira (até o fim da linha) foca o campo', diaBox.inputW >= 44 && diaBox.boxH >= 44 && diaFocus === 'Dia de junho de 2026', JSON.stringify({ ...diaBox, diaFocus }));
  await field('Descrição').fill('Salário'); await field('Valor em reais').fill('6000,00'); await field('Dia de junho de 2026').fill('31');
  await btn('Salvar').click(); await waitText('Junho tem 30 dias.');
  ok('modo "Dia": 31 em junho dá "Junho tem 30 dias." e nada é salvo', (await field('Descrição').inputValue()) === 'Salário');
  await field('Dia de junho de 2026').fill('1');
  await btn('Salvar e anotar outro').click(); await waitText('Anotado: Salário, R$ 6.000,00 em 01/06/2026.');
  ok('"Salvar e anotar outro": anotado, com descrição e valor limpos e o dia mantido', (await field('Descrição').inputValue()) === '' && (await field('Valor em reais').inputValue()) === '' && (await field('Dia de junho de 2026').inputValue()) === '1');
  await keepReturnText();
  await innerChecks('modo dia 390px');
  await shot('76_modo_dia');
  await p.setViewportSize({ width: 320, height: 800 }); await p.waitForTimeout(400);
  await innerChecks('modo dia 320px');
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(300);
  await btn('Voltar').click(); await waitText('Mês 1 de 5'); await waitText('Recebimentos: R$ 6.000,00 · 1');
  ok('o recebimento anotado aparece no passo de junho', (await body()).includes('Recebimentos: R$ 6.000,00 · 1'));
  // "Voltar" sai sem gravar a decisão: o resumo mostra junho com o que foi anotado, e a revisão continua.
  await btn('Voltar').click(); await waitText('Mês sem anotação não quer dizer mês sem gastos.');
  await waitUntil(async () => (await monthCardText('Junho de 2026'))?.includes('Recebido: R$ 6.000,00 · 1 recebimento'));
  ok('/retomar: junho mostra "Recebido: R$ 6.000,00 · 1 recebimento" e os 3 gastos', (await monthCardText('Junho de 2026'))?.includes('Recebido: R$ 6.000,00 · 1 recebimento · Pago: R$ 3.521,90 · 3 gastos'), await monthCardText('Junho de 2026'));

  // 5. Julho: lote que registra e paga Aluguel e a parcela 10; Luz 179,90 em "Registrar pagamento"; sem aviso de gasto solto.
  await btn('Atualizar agora').click(); await waitText('Mês 1 de 4');
  ok('atualizar de novo: junho resolvido sai dos passos e julho é o passo 1 de 4', (await stepTitle()) === 'Julho de 2026, Mês 1 de 4', await stepTitle());
  t = await body();
  ok('julho: as 3 contas sem conta registrada, com "Ainda não paguei"', ['R$ 2.500,00 · vencimento em 05/07/2026 · sem conta registrada', 'Parcela 10 de 48 · R$ 850,00 · vencimento em 10/07/2026 · sem conta registrada',
    'cerca de R$ 180,00 (estimado) · vencimento em 12/07/2026 · sem conta registrada'].every((x) => t.includes(x)) && (await visibleCount('button', 'Ainda não paguei: Luz de julho')) === 1 &&
    (await visibleCount('button', 'Não houve: Financiamento do carro de julho')) === 0, t.slice(0, 500));
  ok('julho: sem aviso de gasto já anotado', !t.includes('Você já anotou o gasto'));
  for (const name of ['Selecionar Aluguel de julho, R$ 2.500,00', 'Selecionar Financiamento do carro de julho, R$ 850,00']) await p.getByRole('checkbox', { name }).click();
  await btn('Marcar as 2 selecionadas como pagas no vencimento').click(); await waitText('Marcar 2 contas como pagas?');
  ok('lote de julho: registra e paga no vencimento', (await dialogText()).includes('Aluguel: R$ 2.500,00 em 05/07/2026. Financiamento do carro (parcela 10 de 48): R$ 850,00 em 10/07/2026.'));
  await confirmIn('Marcar como pagas'); await waitText('Paga em 10/07/2026 · R$ 850,00');
  ok('lote de julho: as 2 contas registradas e pagas', (await body()).includes('Paga em 05/07/2026 · R$ 2.500,00'));
  await btn('Já paguei: Luz de julho').click(); await waitText('Registrar pagamento');
  await waitText('A conta de julho será registrada e marcada como paga.');
  t = await body();
  ok('"Registrar pagamento": Luz de julho, valor vazio com a dica, data no vencimento', t.includes('Luz de julho') && t.includes('Digite o valor da conta. A estimativa era R$ 180,00.') &&
    (await field('Valor pago').inputValue()) === '' && (await field('Data do pagamento').inputValue()) === '12/07/2026' && (await visibleCount('button', 'Salvar pagamento')) === 1);
  await field('Valor pago').fill('179,90');
  await keepReturnText();
  await innerChecks('registrar pagamento 390px');
  await shot('77_registrar_pagamento');
  await p.setViewportSize({ width: 320, height: 800 }); await p.waitForTimeout(400);
  await innerChecks('registrar pagamento 320px');
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(300);
  await btn('Salvar pagamento').click(); await waitText('Mês 1 de 4'); await waitText('Paga em 12/07/2026 · R$ 179,90');
  ok('Luz de julho registrada e paga com R$ 179,90', (await body()).includes('Paga em 12/07/2026 · R$ 179,90'));
  await btn('Anotar recebimentos').click(); await waitText('Dia do recebimento em julho de 2026.');
  await field('Descrição').fill('Salário'); await field('Valor em reais').fill('6000,00'); await field('Dia de julho de 2026').fill('1');
  await btn('Salvar').click(); await waitText('Mês 1 de 4'); await waitText('Anotado: Salário, R$ 6.000,00 em 01/07/2026.');
  await waitText('Recebimentos: R$ 6.000,00 · 1').catch(() => {});
  ok('"Salvar" no modo "Dia" volta ao passo, com "Anotado" e o recebimento no mês', (await body()).includes('Recebimentos: R$ 6.000,00 · 1'));
  // Pelo teclado: Enter em "Próximo mês" troca o passo e o foco vai para o título do mês.
  await btn('Próximo mês').focus(); await p.keyboard.press('Enter'); await waitText('Mês 2 de 4');

  // 6. Agosto: lote de Aluguel e da parcela 11; "Ainda não paguei" na Luz; recebimentos pulados.
  await waitUntil(async () => (await focusedName()) === 'Agosto de 2026, Mês 2 de 4');
  ok('agosto: passo 2 de 4, com o foco no título do mês', (await stepTitle()) === 'Agosto de 2026, Mês 2 de 4' && (await focusedName()) === 'Agosto de 2026, Mês 2 de 4', `${await stepTitle()} / foco: ${await focusedName()}`);
  for (const name of ['Selecionar Aluguel de agosto, R$ 2.500,00', 'Selecionar Financiamento do carro de agosto, R$ 850,00']) await p.getByRole('checkbox', { name }).click();
  await btn('Marcar as 2 selecionadas como pagas no vencimento').click(); await waitText('Marcar 2 contas como pagas?');
  await confirmIn('Marcar como pagas'); await waitText('Paga em 10/08/2026 · R$ 850,00');
  await btn('Ainda não paguei: Luz de agosto').click(); await waitText('Registrada em aberto. Ela aparece em Contas a pagar como vencida.');
  ok('"Ainda não paguei": a Luz de agosto fica registrada em aberto, sem diálogo', (await body()).includes('Registrada em aberto. Ela aparece em Contas a pagar como vencida.'));
  await keepReturnText();
  await shot('78_atualizar_agosto');
  await btn('Próximo mês').click(); await waitText('Mês 3 de 4');

  // 7. Setembro (lote, Luz 194,20 e Salário) e este mês (Aluguel de outubro); "Concluir".
  for (const name of ['Selecionar Aluguel de setembro, R$ 2.500,00', 'Selecionar Financiamento do carro de setembro, R$ 850,00']) await p.getByRole('checkbox', { name }).click();
  await btn('Marcar as 2 selecionadas como pagas no vencimento').click(); await waitText('Marcar 2 contas como pagas?');
  await confirmIn('Marcar como pagas'); await waitText('Paga em 10/09/2026 · R$ 850,00');
  await btn('Já paguei: Luz de setembro').click(); await waitText('Digite o valor da conta. A estimativa era R$ 180,00.');
  await field('Valor pago').fill('194,20'); await btn('Confirmar pagamento').click();
  await waitText('Mês 3 de 4'); await waitText('Paga em 12/09/2026 · R$ 194,20');
  await btn('Anotar recebimentos').click(); await waitText('Dia do recebimento em setembro de 2026.');
  await field('Descrição').fill('Salário'); await field('Valor em reais').fill('6000,00'); await field('Dia de setembro de 2026').fill('1');
  await btn('Salvar').click(); await waitText('Mês 3 de 4'); await waitText('Recebimentos: R$ 6.000,00 · 1');
  await btn('Próximo mês').click(); await waitText('Mês 4 de 4');
  t = await body();
  ok('este mês: só a conta vencida antes de hoje (Aluguel de 05/10), sem recebimentos, e "Concluir"', (await stepTitle()) === 'Outubro de 2026 (este mês), Mês 4 de 4' &&
    t.includes('R$ 2.500,00 · venceu em 05/10/2026 · em aberto') && !t.includes('Recebimentos e gastos') && !t.includes('Luz') && (await visibleCount('button', 'Concluir')) === 1 && (await visibleCount('button', 'Concluir agora')) === 0, t.slice(0, 400));
  ok('trocar de passo tira o aviso do passo anterior ("Anotado: Salário" de setembro)', !t.includes('Anotado: Salário'));
  await btn('Já paguei: Aluguel de outubro').click(); await waitText('Marcar como paga?');
  ok('"Já paguei" de valor fixo: confirmação com o valor, o vencimento e a conta', (await dialogText()).includes('Aluguel de outubro: R$ 2.500,00 em 05/10/2026, da conta Conta principal.') &&
    (await p.getByRole('dialog').or(p.getByRole('alert')).getByRole('button', { name: 'Mudar valor ou data', exact: true }).count()) === 1);
  await confirmIn('Confirmar'); await waitText('Paga em 05/10/2026 · R$ 2.500,00');
  await keepReturnText();
  await shot('79_atualizar_este_mes');
  await btn('Concluir').click(); await waitText('Meses atualizados. O que você pulou continua sem registro.');

  // 8. Depois de concluir: a faixa sai; outubro, agosto e o carro mostram o que foi registrado.
  await waitUntil(async () => !(await bandShown()));
  ok('concluir: aviso de sucesso e a faixa sai', (await body()).includes('Meses atualizados. O que você pulou continua sem registro.') && !(await bandShown()) && new URL(p.url()).pathname === '/');
  await waitUntil(toPayIs('1.210,00'), 8000);
  ok('concluir: Ainda a pagar R$ 1.210,00 (R$ 1.030,00 de outubro e R$ 180,00 da Luz de agosto), com "Inclui R$ 360,00 em valores estimados."', (await toPayIs('1.210,00')()) && (await body()).includes('Inclui R$ 360,00 em valores estimados.'));
  await expectTotals('outubro depois da revisão: Pago R$ 2.500,00 (Aluguel de 05/10)', 'R$ 0,00', 'R$ 2.500,00', '-R$ 2.500,00', 'R$ 1.210,00');
  await keepReturnText();
  await shot('80_resumo_meses_atualizados');
  await monthBack('Setembro de 2026');
  await expectTotals('setembro: 6.000,00 / 3.544,20 / 2.455,80', 'R$ 6.000,00', 'R$ 3.544,20', 'R$ 2.455,80', 'R$ 0,00');
  await monthBack('Agosto de 2026'); await waitText('Nenhum recebimento anotado em agosto.');
  await expectTotals('agosto: 0 / 3.350,00, com "Nenhum recebimento anotado em agosto."', 'R$ 0,00', 'R$ 3.350,00', '-R$ 3.350,00', 'R$ 180,00');
  ok('agosto: "Nenhum recebimento anotado em agosto." no cabeçalho, sem o destaque "+ R$" de setembro', (await body()).includes('Nenhum recebimento anotado em agosto.') &&
    (await p.locator('[aria-label^="Mais R$"], [aria-label^="Menos R$"]').filter({ visible: true }).count()) === 0);
  await shot('81_resumo_agosto_sem_recebimento');
  await monthBack('Julho de 2026');
  await expectTotals('julho: 6.000,00 / 3.529,90 / 2.470,10', 'R$ 6.000,00', 'R$ 3.529,90', 'R$ 2.470,10', 'R$ 0,00');
  await monthBack('Junho de 2026');
  await expectTotals('junho: 6.000,00 / 3.521,90 / 2.478,10', 'R$ 6.000,00', 'R$ 3.521,90', 'R$ 2.478,10', 'R$ 0,00');
  ok('junho e julho, com recebimento e gastos: sem a linha "Nada anotado"', !(await body()).includes('anotado em junho'));
  for (const m of ['Julho de 2026', 'Agosto de 2026', 'Setembro de 2026', 'Outubro de 2026']) await monthForward(m);
  await p.getByRole('tab', { name: 'Movimentações' }).filter({ visible: true }).first().click(); await waitText('Registrar recebimento');
  await p.getByRole('button', { name: /^Gastos fixos e parcelamentos, / }).filter({ visible: true }).first().click(); await waitText('Por mês, se os valores não mudarem');
  await openRow(/^Financiamento do carro, Parcela 13 de 48/); await waitText('Pagas antes do Clarevo');
  t = await body();
  ok('carro depois da revisão: "Pagas no Clarevo: 5" e "Faltam 36", sem meses sem conta registrada', t.includes('Pagas antes do Clarevo: 7 (informado por você) · Pagas no Clarevo: 5 · Faltam 36') &&
    !t.includes('sem conta registrada') && t.includes('Última parcela em 10/09/2029'), (t.match(/Pagas antes[^\n]*/) ?? [''])[0]);
  await btn('Voltar').click(); await waitText('Por mês, se os valores não mudarem');
  await btn('Voltar').click(); await waitText('Registrar recebimento');
  await p.getByRole('tab', { name: 'Resumo' }).filter({ visible: true }).first().click(); await waitText('Diferença do mês');

  // 9. De novo no cenário, "Seguir adiante" na faixa: só grava a decisão; nada é criado, pago ou excluído.
  await enterReturnDemo();
  await btn('Seguir adiante').click();
  await waitText('Combinado. Os meses ficam como estão, e você pode anotar datas passadas quando quiser.');
  await waitUntil(async () => !(await bandShown()));
  ok('"Seguir adiante": aviso de sucesso e a faixa sai', !(await bandShown()) && (await body()).includes('Combinado. Os meses ficam como estão, e você pode anotar datas passadas quando quiser.'));
  ok('"Seguir adiante": Ainda a pagar continua R$ 10.590,00', await toPayIs('10.590,00')());
  ok('"Seguir adiante": o card de Primeiros passos não aparece na demonstração com dados', !(await headingShown('Primeiros passos')));
  await keepReturnText();
  await shot('82_seguir_adiante');
  await openToPay(); await waitText('O Clarevo criou');
  ok('depois de seguir adiante, o aviso das contas criadas volta a "Revisar vencidas"', (await visibleCount('button', 'Ver resumo dos últimos meses')) === 0 && (await visibleCount('button', 'Revisar vencidas')) === 2);
  await btn('Voltar').click(); await waitText('Diferença do mês');
  await monthBack('Setembro de 2026'); await monthBack('Agosto de 2026'); await monthBack('Julho de 2026'); await monthBack('Junho de 2026');
  await waitText('Nada anotado em junho.');
  ok('junho sem nenhuma anotação: "Nada anotado em junho."', (await body()).includes('Nada anotado em junho.'));
  await shot('83_resumo_nada_anotado');
  for (const m of ['Julho de 2026', 'Agosto de 2026', 'Setembro de 2026', 'Outubro de 2026']) await monthForward(m);
  await p.getByRole('tab', { name: 'Movimentações' }).filter({ visible: true }).first().click(); await waitText('Registrar recebimento');
  await p.getByRole('button', { name: /^Gastos fixos e parcelamentos, / }).filter({ visible: true }).first().click(); await waitText('Por mês, se os valores não mudarem');
  await openRow(/^Financiamento do carro, Parcela/); await waitText('Meses sem conta registrada');
  t = await body();
  ok('carro depois de seguir adiante: julho e agosto sem conta registrada, "Registrar esta parcela" e "Sem conta registrada: 2"', t.includes('Julho de 2026: sem conta registrada.') && t.includes('Agosto de 2026: sem conta registrada.') &&
    t.includes('Pagas no Clarevo: 1 · Sem conta registrada: 2 · Faltam 38') && (await visibleCount('button', 'Registrar esta parcela: Financiamento do carro de julho')) === 1, (t.match(/Pagas antes[^\n]*/) ?? [''])[0]);
  await keepText();
  await innerChecks('detalhe do parcelamento com meses sem conta 390px');
  await scrollTo('Meses sem conta registrada');
  await shot('84_parcelamento_sem_conta_registrada');
  await btn('Por que este mês não tem conta?').click(); await waitText('Voltar à tarefa');
  ok('"Por que este mês não tem conta?" abre "Mês sem registro"', new URL(p.url()).pathname === '/explicacao/sem-registro');
  await btn('Voltar à tarefa').click(); await waitText('Meses sem conta registrada');
  await btn('Registrar esta parcela: Financiamento do carro de julho').click(); await waitText('Financiamento do carro de julho');
  ok('"Registrar esta parcela" abre a linha da revisão numa folha, com "Já paguei" e "Ainda não paguei"', (await visibleCount('button', 'Já paguei: Financiamento do carro de julho')) === 1 &&
    (await visibleCount('button', 'Ainda não paguei: Financiamento do carro de julho')) === 1 && (await visibleCount('button', 'Não houve: Financiamento do carro de julho')) === 0);
  await shot('85_registrar_esta_parcela');
  await confirmIn('Voltar'); await waitGone('Ainda não paguei');
  // 10. Correções da revisão dos últimos meses (A4), cada uma num cenário "retorno" novo.
  // a) Modo "Dia" com "Usar outra data": salvar volta à revisão, anota a ação no passo e não abre o detalhe do registro.
  await enterReturnDemo();
  await btn('Ver resumo').click(); await waitText('Mês sem anotação não quer dizer mês sem gastos.');
  await btn('Atualizar agora').click(); await waitText('Mês 1 de 5');
  ok('modo "Dia", outra data: antes de anotar, o rodapé do passo é "Pular este mês"', (await visibleCount('button', 'Pular este mês')) === 1 && (await visibleCount('button', 'Próximo mês')) === 0);
  await btn('Anotar recebimentos').click(); await waitText('Dia do recebimento em junho de 2026.');
  await field('Descrição').fill('Salário'); await field('Valor em reais').fill('6000,00');
  await btn('Usar outra data').click();
  await field('Data do recebimento').fill('15/06/2026');
  await keepReturnText();
  await btn('Salvar recebimento').click(); await waitText('Anotado: Salário, R$ 6.000,00 em 15/06/2026.');
  await waitUntil(async () => (await visibleCount('button', 'Próximo mês')) === 1);
  await waitText('Recebimentos: R$ 6.000,00 · 1').catch(() => {});
  t = await body();
  ok('modo "Dia", outra data: salvar volta ao passo de junho, com "Anotado" e o recebimento (não abre o detalhe do registro)', new URL(p.url()).pathname === '/retomar/atualizar' &&
    (await stepTitle()) === 'Junho de 2026, Mês 1 de 5' && t.includes('Anotado: Salário, R$ 6.000,00 em 15/06/2026.') && t.includes('Recebimentos: R$ 6.000,00 · 1'), `${p.url()} ${t.slice(0, 200)}`);
  ok('modo "Dia", outra data: a ação conta no passo (o rodapé passa de "Pular este mês" a "Próximo mês")', (await visibleCount('button', 'Próximo mês')) === 1 && (await visibleCount('button', 'Pular este mês')) === 0);
  // "Não houve" numa conta de valor estimado: a linha do diálogo diz "cerca de" e "(estimado)", nunca o valor como se fosse exato.
  await btn('Próximo mês').click(); await waitText('Mês 2 de 5');
  await btn('Não houve: Luz de julho').click(); await waitText('Não houve esta conta em julho?');
  t = await dialogText();
  ok('"Não houve" na Luz estimada: o diálogo mostra "Luz · cerca de R$ 180,00 (estimado)"', t.includes('Luz · cerca de R$ 180,00 (estimado)') && !t.includes('Luz · R$ 180,00'), t);
  await keepReturnText();
  await confirmIn('Confirmar'); await waitText('Registrada como não houve: Luz de julho.');
  ok('"Não houve" confirmado: resultado no rodapé do passo', (await body()).includes('Registrada como não houve: Luz de julho.'));

  // b) /retomar sem revisão ativa (decidida em outro aparelho): nunca afirma que os meses estão registrados.
  await enterReturnDemo();
  await btn('Ver resumo').click(); await waitText('Mês sem anotação não quer dizer mês sem gastos.');
  const decidedElsewhere = await otherDevice(async (repo, ctx) => {
    const st = await repo.getReturnReviewState(ctx);
    try { await repo.decideReturnReview(crypto.randomUUID(), ctx, st.mark ? st.mark.version : 0, '2026-09', 'seguiu'); return 'ok'; } catch (e) { return String(e.code || e.message); }
  });
  await waitText('Nada para conferir');
  t = await body();
  ok('/retomar sem revisão ativa: "Não há revisão dos últimos meses agora." e "Voltar ao Resumo", sem dizer que os meses já estão registrados', decidedElsewhere === 'ok' &&
    t.includes('Não há revisão dos últimos meses agora.') && !t.includes('já estão registrados') && (await visibleCount('button', 'Voltar ao Resumo')) === 1 &&
    (await visibleCount('button', 'Atualizar agora')) === 0, `${decidedElsewhere} ${t.slice(0, 300)}`);
  await keepReturnText();
  await innerChecks('seus últimos meses sem revisão ativa 390px');
  await shot('93_retomar_sem_revisao');
  await btn('Voltar ao Resumo').click(); await waitText('Diferença do mês');
  ok('"Voltar ao Resumo" volta ao Resumo, sem a faixa', new URL(p.url()).pathname === '/' && !(await bandShown()), p.url());

  // c) Pagar uma conta que outro aparelho já registrou: paga a conta existente em vez de repetir o erro, e a linha é recarregada.
  const toStep = async (skips) => {
    await btn('Ver resumo').click(); await waitText('Mês sem anotação não quer dizer mês sem gastos.');
    await btn('Atualizar agora').click(); await waitText('Mês 1 de 5');
    for (let i = 0; i < skips; i++) { await btn('Pular este mês').click(); await waitText(`Mês ${i + 2} de 5`); }
  };
  const createLuz = (number) => otherDevice(async (repo, ctx, number) => {
    const luz = (await repo.listSeries(ctx)).find((s) => s.terms[0].description === 'Luz');
    const w = await repo.createSeriesOccurrence(crypto.randomUUID(), luz.id, luz.version, number, 'aberta');
    return { cid: w.commitment.id, due: w.commitment.dueOn };
  }, number);
  await enterReturnDemo(); await toStep(1);
  ok('julho: Luz sem conta registrada', (await body()).includes('cerca de R$ 180,00 (estimado) · vencimento em 12/07/2026 · sem conta registrada'));
  await btn('Já paguei: Luz de julho').click(); await waitText('Registrar pagamento');
  const luzJulho = await createLuz(3);
  await btn('Cancelar').click(); await waitText('Mês 2 de 5');
  await waitUntil(async () => (await body()).includes('cerca de R$ 180,00 (estimado) · venceu em 12/07/2026 · em aberto'), 6000);
  t = await body();
  ok('conta criada em outro aparelho, "Cancelar" no pagamento: a linha da Luz é recarregada como conta em aberto', luzJulho.due === '2026-07-12' &&
    t.includes('cerca de R$ 180,00 (estimado) · venceu em 12/07/2026 · em aberto') && !t.includes('vencimento em 12/07/2026 · sem conta registrada'), t.slice(0, 500));
  await btn('Pular este mês').click(); await waitText('Mês 3 de 5');
  await btn('Já paguei: Luz de agosto').click(); await waitText('Registrar pagamento');
  await createLuz(4);
  await field('Valor pago').fill('175,00'); await btn('Salvar pagamento').click();
  await waitText('Mês 3 de 5'); await waitText('Paga em 12/08/2026 · R$ 175,00');
  await keepReturnText();
  t = await body();
  ok('conta criada em outro aparelho, "Salvar pagamento": paga a conta que já existe, sem repetir "Esta conta já foi registrada"', t.includes('Paga em 12/08/2026 · R$ 175,00') &&
    t.includes('Pagamento registrado: Luz de agosto.') && !t.includes('Esta conta já foi registrada') && new URL(p.url()).pathname === '/retomar/atualizar', t.slice(0, 400));

  // d) Conta do ano nos 11 meses fechados: o detalhe oferece "Registrar parcelas" (a série sem conta registrada desde junho).
  const makeAnnual = (withLooseJuly) => otherDevice(async (repo, ctx, withLooseJuly) => {
    const o = repo.opts ?? repo.inner?.opts;
    const back = o.today;
    o.today = () => '2026-03-20';
    const input = { kind: 'anual', nature: 'conta', description: 'Taxa do condomínio', category: 'Moradia', amountCents: 18000, amountMode: 'variavel', dueDay: 10, firstDueMonth: '2026-06', firstNumber: 1, installmentTotal: null, partsPerYear: 10, lastMonth: null };
    let id;
    try { id = (await repo.createSeries(crypto.randomUUID(), ctx, input)).series.id; } finally { o.today = back; await repo.syncSeriesOccurrences(ctx); }
    if (withLooseJuly) {
      const space = await repo.getSpace();
      await repo.createRecord(crypto.randomUUID(), ctx, 'despesa', { accountId: space.accounts[0].id, amountCents: 17500, occurredOn: '2026-07-11', description: 'Taxa do condomínio', category: 'Moradia' });
    }
    return { id };
  }, withLooseJuly);
  await enterReturnDemo();
  const annual = await makeAnnual(false);
  await openToPay(); await waitText('O Clarevo criou').catch(() => {});
  await p.getByRole('button', { name: /^Gastos fixos e parcelamentos, \d+ cadastrados/ }).filter({ visible: true }).first().click(); await waitText('Por mês, se os valores não mudarem');
  await openRow(/^Taxa do condomínio/); await waitText('Ano a ano'); await waitText('2026/2027: parcelas 1 a 3 sem conta registrada.');
  t = await body();
  ok('conta do ano: "2026/2027: parcelas 1 a 3 sem conta registrada." com "Registrar parcelas" e "Por que este mês não tem conta?", sem o conselho de anotar gasto', !t.includes('Se você pagou') &&
    (await visibleCount('button', 'Registrar parcelas de 2026 a 2027')) === 1 && (await visibleCount('button', 'Por que este mês não tem conta?')) === 1 && (await visibleCount('button', 'Anotar gasto')) === 0, t.slice(0, 600));
  ok('conta do ano: nomes acessíveis sem "2026/2027" (leitores de tela ouvem "2026 a 2027")', (await slashNames()).length === 0, (await slashNames()).join(' | '));
  await keepText();
  await innerChecks('conta do ano com parcelas sem conta 390px');
  await shot('94_conta_do_ano_registrar_parcelas');
  await btn('Registrar parcelas de 2026 a 2027').click(); await waitText('Parcela 3 de 10 de 2026/2027');
  const sheetBtns = await p.evaluate(() => [...document.querySelectorAll('[role=button]')].filter((e) => e.getBoundingClientRect().width > 0).map((e) => e.getAttribute('aria-label') || e.textContent).filter((x) => /^(Já paguei|Não houve|Ainda não paguei): /.test(x)));
  ok('"Registrar parcelas": a folha tem as 3 parcelas (junho, julho e agosto), cada uma com "Já paguei", "Não houve" e "Ainda não paguei"', sheetBtns.length === 9 &&
    ['junho', 'julho', 'agosto'].every((m) => ['Já paguei', 'Não houve', 'Ainda não paguei'].every((a) => sheetBtns.includes(`${a}: Taxa do condomínio de ${m}`))), sheetBtns.join(' | '));
  ok('"Registrar parcelas": nomes acessíveis da folha sem "2026/2027"', (await slashNames()).length === 0, (await slashNames()).join(' | '));
  await shot('95_folha_registrar_parcelas');
  await btn('Ainda não paguei: Taxa do condomínio de junho').click(); await waitText('Registrada em aberto: Taxa do condomínio de junho.');
  await waitText('2026/2027: parcelas 2 e 3 sem conta registrada.');
  ok('"Ainda não paguei" na folha: a folha fecha, a parcela 1 fica em aberto e o detalhe segue com as parcelas 2 e 3', (await visibleCount('button', 'Já paguei: Taxa do condomínio de julho')) === 0 &&
    (await body()).includes('2026/2027 · 10 parcelas · 8 em aberto · 2 sem conta registrada'), (await body()).slice(0, 400));
  // Pagar a parcela de julho enquanto outro aparelho a registra: paga a que já existe e volta ao detalhe.
  await btn('Registrar parcelas de 2026 a 2027').click(); await waitText('Parcela 2 de 10 de 2026/2027');
  await btn('Já paguei: Taxa do condomínio de julho').click(); await waitText('Registrar pagamento');
  await otherDevice(async (repo, ctx, id) => {
    const s = await repo.getSeries(id);
    await repo.createSeriesOccurrence(crypto.randomUUID(), id, s.version, 2, 'aberta');
  }, annual.id);
  await field('Valor pago').fill('175,00'); await btn('Salvar pagamento').click();
  await waitText('Pagamento registrado: Taxa do condomínio de julho.');
  await waitText('2026/2027: parcela 3 sem conta registrada.');
  t = await body();
  ok('conta do ano, parcela já registrada em outro aparelho: paga a conta existente e volta ao detalhe, com 1 paga e a parcela 3 sem conta', new URL(p.url()).pathname === `/gastos-fixos/${annual.id}` &&
    t.includes('2026/2027 · 10 parcelas · 1 paga · 8 em aberto · 1 sem conta registrada') && !t.includes('Esta conta já foi registrada'), `${p.url()} ${t.slice(0, 500)}`);
  await keepText();

  // e) Aviso de gasto solto também nas linhas de meses posteriores dentro do grupo de uma conta do ano.
  await enterReturnDemo();
  await makeAnnual(true);
  await btn('Ver resumo').click(); await waitText('Mês sem anotação não quer dizer mês sem gastos.');
  await btn('Atualizar agora').click(); await waitText('Mês 1 de 5');
  await waitText('Você já anotou o gasto Taxa do condomínio em 11/07/2026 (R$ 175,00).').catch(() => {});
  t = await body();
  ok('grupo da conta do ano sob junho: a linha de julho avisa do gasto solto anotado em 11/07/2026', t.includes('Parcela 2 de 10 de 2026/2027') &&
    t.includes('Você já anotou o gasto Taxa do condomínio em 11/07/2026 (R$ 175,00).'), t.slice(0, 700));
  await keepReturnText();

  // f) "Registrar esta parcela" no detalhe do parcelamento, depois de "Seguir adiante": a folha de uma linha paga e fecha.
  await enterReturnDemo();
  await btn('Seguir adiante').click(); await waitText('Combinado. Os meses ficam como estão');
  await p.getByRole('tab', { name: 'Movimentações' }).filter({ visible: true }).first().click(); await waitText('Registrar recebimento');
  await p.getByRole('button', { name: /^Gastos fixos e parcelamentos, / }).filter({ visible: true }).first().click(); await waitText('Por mês, se os valores não mudarem');
  await openRow(/^Financiamento do carro, Parcela/); await waitText('Meses sem conta registrada');
  await btn('Registrar esta parcela: Financiamento do carro de julho').click(); await waitText('Já paguei: Financiamento do carro de julho', 4000).catch(() => {});
  await btn('Já paguei: Financiamento do carro de julho').click(); await waitText('Marcar como paga?');
  await confirmIn('Confirmar'); await waitText('Pagamento registrado: Financiamento do carro de julho.');
  await waitText('Pagas no Clarevo: 2 · Sem conta registrada: 1');
  ok('"Registrar esta parcela" > "Já paguei": a folha fecha, com o aviso de pagamento e o detalhe atualizado (2 pagas, 1 sem conta)', (await visibleCount('button', 'Ainda não paguei: Financiamento do carro de julho')) === 0 &&
    (await body()).includes('Pagas no Clarevo: 2 · Sem conta registrada: 1'));

  // g) "Já paguei" numa conta que outro aparelho registrou E pagou: ninguém paga de novo. A revisão mostra a conta como
  // paga, com o aviso "Esta conta já foi paga em outro aparelho." (uma só vez na tela, sem o texto de pagamento feito aqui).
  const luzJulhoPagamentos = () => otherDevice(async (repo, ctx) => (await repo.listRecords(ctx, '2026-07')).filter((r) => r.commitmentId && /^Luz/.test(r.description)).map((r) => r.amountCents));
  const PAID_ELSEWHERE = 'Esta conta já foi paga em outro aparelho.';
  await enterReturnDemo(); await toStep(1);
  await btn('Já paguei: Luz de julho').click(); await waitText('Registrar pagamento');
  await otherDevice(async (repo, ctx) => {
    const luz = (await repo.listSeries(ctx)).find((s) => s.terms[0].description === 'Luz');
    const w = await repo.createSeriesOccurrence(crypto.randomUUID(), luz.id, luz.version, 3, 'aberta');
    const space = await repo.getSpace();
    await repo.payCommitment(crypto.randomUUID(), w.commitment.id, w.commitment.version, { accountId: space.accounts[0].id, amountCents: 16500, paidOn: '2026-07-14', category: null });
  });
  await field('Valor pago').fill('175,00'); await btn('Salvar pagamento').click();
  await waitText(PAID_ELSEWHERE); await waitText('Mês 2 de 5');
  await keepReturnText();
  t = await body();
  const pagosG = await luzJulhoPagamentos();
  ok('conta registrada e paga em outro aparelho, "Salvar pagamento": volta à revisão com o aviso "Esta conta já foi paga em outro aparelho." uma só vez, sem texto de pagamento feito aqui',
    new URL(p.url()).pathname === '/retomar/atualizar' && (await p.getByText(PAID_ELSEWHERE, { exact: true }).filter({ visible: true }).count()) === 1 &&
    !t.includes('Pagamento registrado: Luz de julho.') && !t.includes('Esta conta já foi registrada'), `${p.url()} ${t.slice(0, 400)}`);
  ok('conta paga em outro aparelho: a linha da Luz de julho aparece como paga com o valor de lá (R$ 165,00), e há um único pagamento (nada de R$ 175,00)',
    t.includes('Paga em 14/07/2026 · R$ 165,00') && pagosG.length === 1 && pagosG[0] === 16500, `${JSON.stringify(pagosG)} ${t.slice(0, 400)}`);

  // h) /retomar/atualizar sem revisão ativa (demonstração padrão): a mesma linha neutra de /retomar, nunca "já estão registrados".
  await viaEntry('/retomar/atualizar', 'Nada para conferir');
  t = await body();
  await keepReturnText();
  ok('/retomar/atualizar sem revisão ativa: "Nada para conferir" com "Não há revisão dos últimos meses agora.", sem dizer que os meses já estão registrados',
    new URL(p.url()).pathname === '/retomar/atualizar' && t.includes('Nada para conferir') && t.includes('Não há revisão dos últimos meses agora.') && !t.includes('já estão registrados') &&
    (await visibleCount('button', 'Voltar ao Resumo')) === 1 && (await visibleCount('button', 'Pular este mês')) === 0, `${p.url()} ${t.slice(0, 300)}`);
  await btn('Voltar ao Resumo').click(); await waitText('Diferença do mês');
  ok('/retomar/atualizar sem revisão: "Voltar ao Resumo" volta ao Resumo', new URL(p.url()).pathname === '/', p.url());

  // i) Falha parcial: a conta foi registrada aqui e outro aparelho a alterou antes do pagamento (a cópia lida ficou velha).
  // "Salvar de novo" lê a conta atual e paga uma única vez, em vez de repetir a recusa de versão.
  const staleOnNextPay = () => p.evaluate(async () => {
    const repo = await window.__e2e.repo();
    repo.payCommitment = function (key, id, version, input) {
      delete repo.payCommitment;
      repo.simulateRemoteCommitmentEdit(id, {});
      return repo.payCommitment(key, id, version, input);
    };
  });
  const PARTIAL = 'A conta de julho foi registrada, mas o pagamento não foi salvo. Tente salvar de novo.';
  await enterReturnDemo(); await toStep(1);
  await btn('Já paguei: Luz de julho').click(); await waitText('Registrar pagamento');
  await staleOnNextPay();
  await field('Valor pago').fill('165,00'); await btn('Salvar pagamento').click();
  await waitText(PARTIAL);
  ok('falha parcial (conta registrada, alterada em outro aparelho): o aviso de pagamento não salvo e "Salvar de novo", na mesma tela', new URL(p.url()).pathname === '/retomar/pagar' &&
    (await visibleCount('button', 'Salvar de novo')) === 1 && (await visibleCount('button', 'Salvar pagamento')) === 0, p.url());
  await btn('Salvar de novo').click(); await waitText('Mês 2 de 5'); await waitText('Paga em 12/07/2026 · R$ 165,00');
  await keepReturnText();
  t = await body();
  const pagosI = await luzJulhoPagamentos();
  ok('"Salvar de novo" depois da conta alterada em outro aparelho: lê a conta atual e paga uma única vez, com o aviso de pagamento registrado',
    new URL(p.url()).pathname === '/retomar/atualizar' && t.includes('Pagamento registrado: Luz de julho.') && !t.includes(PAID_ELSEWHERE) && pagosI.length === 1 && pagosI[0] === 16500, `${JSON.stringify(pagosI)} ${t.slice(0, 400)}`);

  // j) Falha parcial e a pessoa sai: a linha volta em aberto, com "Já paguei" (não como "Registrada em aberto"), e o passo conta como ação.
  await enterReturnDemo(); await toStep(1);
  await btn('Já paguei: Luz de julho').click(); await waitText('Registrar pagamento');
  await staleOnNextPay();
  await field('Valor pago').fill('165,00'); await btn('Salvar pagamento').click();
  await waitText(PARTIAL);
  await btn('Cancelar').click(); await waitText('Descartar o preenchimento?');
  await btn('Descartar alterações').click(); await waitText('Mês 2 de 5');
  await waitUntil(async () => (await body()).includes('cerca de R$ 180,00 (estimado) · venceu em 12/07/2026 · em aberto'), 6000);
  await keepReturnText();
  t = await body();
  ok('falha parcial e "Cancelar": a Luz de julho volta como conta em aberto com "Já paguei", sem o resultado "Registrada em aberto", e o passo conta como ação ("Próximo mês")',
    new URL(p.url()).pathname === '/retomar/atualizar' && t.includes('cerca de R$ 180,00 (estimado) · venceu em 12/07/2026 · em aberto') && !t.includes('Registrada em aberto') &&
    (await visibleCount('button', 'Já paguei: Luz de julho')) === 1 && (await visibleCount('button', 'Próximo mês')) === 1 && (await visibleCount('button', 'Pular este mês')) === 0, t.slice(0, 500));

  const returnBad = returnTexts.map((s) => s.replace('Junho tem 30 dias.', '').match(/\b(sumiu|sumid\w*|abandon\w*|atrasad\w*|esquec\w*|deveria|culpa|bagun\w*|pend[eê]nci\w*)\b|aus[eê]nci|sem usar|\d+ dias?\b|\bvoc[eê] (n[aã]o )?(anotou|usou) (nada|o app)/i)?.[0]).filter(Boolean);
  ok('telas da revisão: sem cobrança nem contagem de dias sem anotar', returnTexts.length >= 9 && returnBad.length === 0, `${returnTexts.length} telas ${returnBad.join(' | ')}`);
  const forbidden = screenTexts.map((s) => s.match(FORBIDDEN)?.[0]).filter(Boolean);
  ok('contas do ano e calculadoras: nenhum termo proibido nem travessão longo nas telas novas', screenTexts.length > 0 && forbidden.length === 0, `${screenTexts.length} telas ${forbidden.join(' | ')}`);
  ok('sem erros de JavaScript no console', errors.length === 0, errors.slice(0,3).join(' | '));
  await b.close();
  for (const r of results) console.log(r.join('  '));
  const passed = results.filter(r => r[0] === 'OK ').length;
  console.log(`\n${passed}/${results.length} verificações OK`);
  server.close();
  process.exit(passed === results.length ? 0 : 1);
})().catch(async (e) => { try { const shotPath = path.join(os.tmpdir(), 'clarevo-e2e-erro.png'); await globalThis.__page?.screenshot({ path: shotPath }); console.log(`Tela do erro: ${shotPath}`); console.log((await globalThis.__page?.locator('body').innerText())?.slice(0, 600)); } catch {} for (const r of results) console.log(r.join('  ')); console.error('ERRO NO ROTEIRO:', e.message.split('\n')[0]); server.close(); process.exit(1); });
