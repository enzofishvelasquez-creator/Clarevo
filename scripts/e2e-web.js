/**
 * Roteiro de verificação do primeiro ciclo, do Ciclo A (gastos fixos e parcelamentos), do Ciclo A3 (contas do ano),
 * de "Primeiros passos" no Resumo, dos atalhos de Movimentações, do Ciclo A6 (achar tudo e calculadoras), do Ciclo A4
 * (seus últimos meses, com o cenário fictício "retorno" da demonstração), do Ciclo A5 (Aprender e dúvidas), do Ciclo A2
 * (Conta na web e ocultar valores), do Ciclo B (renda comprometida e a previsão dos pagamentos), do Ciclo C (metas, reserva
 * e plano de guardar), do Ciclo D (simulador, com os aportes no início de cada mês) e da Navegação (D-039: "Anotar gasto" logo
 * abaixo do cabeçalho, barra inferior nas telas de consulta, Contas a pagar no mês certo, Metas compacta e a busca "No app" de
 * Aprender) e de "Antes de financiar" (D-044) na versão web, em modo demonstração (acesso simulado).
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

  // Primeiros passos (conta nova): card no Resumo, depois de "Anotar gasto" (D-039). Só leva às telas de
  // cadastro; nenhum dado de exemplo. Cada passo é um botão com o nome inteiro (", concluído" quando pronto).
  const PP = {
    fixos: 'Cadastre seus gastos fixos. Aluguel, escola, luz, internet e parcelas, uma vez só.',
    recebido: 'Registre o que você recebeu este mês. Salário ou outra renda.',
    pago: 'Anote um gasto já pago. Mercado, farmácia ou transporte.',
    guardar: 'Planejar quanto guardar. Diga se consegue guardar um valor por mês e veja um plano.',
  };
  const ppDone = (k) => PP[k].replace('. ', ', concluído. ');
  const ppRows = () => cardButtons('Primeiros passos');
  const ppIs = (rows) => async () => JSON.stringify(await ppRows()) === JSON.stringify([...rows, 'Agora não']);
  await waitText('Primeiros passos');
  t = await body();
  ok('primeiros passos: conta nova vê os quatro passos (o quarto é "Planejar quanto guardar"), nenhum concluído, e "Agora não"', await ppIs([PP.fixos, PP.recebido, PP.pago, PP.guardar])() &&
    t.includes('Quatro passos para o Clarevo mostrar o seu mês de verdade.') && t.includes('R$ 0,00'), JSON.stringify(await ppRows()));
  const ppOrder = await p.evaluate(() => {
    const top = (e) => (e ? e.getBoundingClientRect().top : null);
    const h = [...document.querySelectorAll('[role=heading]')].find((e) => e.textContent === 'Primeiros passos' && e.getBoundingClientRect().width > 0);
    const a = [...document.querySelectorAll('[role=button]')].find((e) => e.textContent === 'Anotar gasto' && e.getBoundingClientRect().width > 0);
    const steps = [...document.querySelectorAll('[role=button]')].filter((e) => /^(Cadastre|Registre|Anote um|Planejar)/.test(e.getAttribute('aria-label') || '') && e.getBoundingClientRect().width > 0);
    return { card: top(h), anotar: top(a), level: h?.getAttribute('aria-level'), minStep: Math.round(Math.min(...steps.map((s) => s.getBoundingClientRect().height))) };
  });
  ok('primeiros passos: título de nível 2, depois de "Anotar gasto" (D-039: o botão fica logo abaixo do cabeçalho), passos com 56 px', ppOrder.card !== null && ppOrder.anotar !== null && ppOrder.anotar < ppOrder.card && ppOrder.level === '2' && ppOrder.minStep >= 56, JSON.stringify(ppOrder));
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
  await waitUntil(ppIs([ppDone('fixos'), PP.recebido, PP.pago, PP.guardar]), 8000);
  ok('primeiros passos: gasto fixo cadastrado marca o passo 1 como concluído', await ppIs([ppDone('fixos'), PP.recebido, PP.pago, PP.guardar])(), JSON.stringify(await ppRows()));
  // Passo 2 abre "Registrar recebimento".
  await btn(PP.recebido).click(); await waitText('Data do recebimento');
  ok('primeiros passos: o passo 2 abre o registro de recebimento', (await visibleCount('button', 'Salvar recebimento')) === 1);
  await field('Descrição').fill('Salário'); await field('Valor em reais').fill('3000');
  await btn('Salvar recebimento').click(); await waitText('Recebimento salvo');
  await btn('Ver resumo do mês').click(); await waitText('Diferença do mês');
  await waitUntil(ppIs([ppDone('fixos'), ppDone('recebido'), PP.pago, PP.guardar]), 8000);
  ok('primeiros passos: recebimento do mês marca o passo 2; os passos 3 e 4 continuam abertos', await ppIs([ppDone('fixos'), ppDone('recebido'), PP.pago, PP.guardar])(), JSON.stringify(await ppRows()));
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
  // Ciclo A2 (D-025): na web não há lembretes nem biometria (só no app para celular); "Ocultar valores ao abrir" existe
  // também na web e é só deste aparelho.
  t = await body();
  const contaSwitches = await p.getByRole('switch').filter({ visible: true }).evaluateAll((els) => els.map((e) => [e.getAttribute('aria-label'), e.getAttribute('aria-checked')]));
  ok('Conta na web: "Lembretes estão disponíveis no app para celular.", sem interruptor de lembretes nem de biometria', t.includes('Lembretes') && t.includes('Lembretes estão disponíveis no app para celular.') &&
    !t.includes('Pedir biometria ao abrir') && !t.includes('Avisar') && JSON.stringify(contaSwitches) === JSON.stringify([['Ocultar valores ao abrir', 'false']]), JSON.stringify(contaSwitches));
  ok('Conta: "Privacidade neste aparelho" com "Ocultar valores ao abrir" desligado por padrão e a legenda', t.includes('Privacidade neste aparelho') && t.includes('Ao abrir o app, os valores aparecem como R$ ••••. Vale só para este aparelho.'));
  await keepText();
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
  ok('segunda conta nova também começa com os quatro passos em aberto', await ppIs([PP.fixos, PP.recebido, PP.pago, PP.guardar])(), JSON.stringify(await ppRows()));
  await btn(PP.pago).click(); await waitText('Será salvo em');
  ok('primeiros passos: o passo 3 abre "Anotar gasto"', (await visibleCount('button', 'Salvar gasto')) === 1);
  await field('Descrição').fill('Mercado'); await field('Valor em reais').fill('120');
  await btn('Salvar gasto').click(); await waitText('Gasto salvo');
  await btn('Ver resumo do mês').click(); await waitText('Diferença do mês');
  await waitUntil(ppIs([PP.fixos, PP.recebido, ppDone('pago'), PP.guardar]), 8000);
  ok('primeiros passos: gasto pago no mês marca o passo 3', await ppIs([PP.fixos, PP.recebido, ppDone('pago'), PP.guardar])(), JSON.stringify(await ppRows()));
  await btn(PP.recebido).click(); await waitText('Data do recebimento');
  await field('Descrição').fill('Salário'); await field('Valor em reais').fill('2800');
  await btn('Salvar recebimento').click(); await waitText('Recebimento salvo');
  await btn('Ver resumo do mês').click(); await waitText('Diferença do mês');
  await waitUntil(ppIs([PP.fixos, ppDone('recebido'), ppDone('pago'), PP.guardar]), 8000);
  await btn(PP.fixos).click(); await waitText('Salvando em Pessoal');
  await field('Descrição').fill('Internet'); await field('Valor por mês').fill('100'); await field('Dia do vencimento').fill('20');
  await btn('Salvar gasto fixo').click(); await waitText('Gasto fixo salvo');
  await tabsBack();
  // Ciclo C (D-036): o 4º passo, "Planejar quanto guardar", abre a aba Metas no card da pergunta. Com os três primeiros
  // prontos, o card continua até a pessoa responder "consigo" ou "agora não".
  await waitUntil(ppIs([ppDone('fixos'), ppDone('recebido'), ppDone('pago'), PP.guardar]), 8000);
  ok('primeiros passos: com os três primeiros prontos, o card fica até o 4º passo ("Planejar quanto guardar")', await ppIs([ppDone('fixos'), ppDone('recebido'), ppDone('pago'), PP.guardar])(), JSON.stringify(await ppRows()));
  await btn(PP.guardar).click(); await waitText('Você consegue guardar algum valor por mês?'); await p.waitForTimeout(500);
  const askButtons = await cardButtons('Você consegue guardar algum valor por mês?');
  ok('primeiros passos: o passo 4 abre a aba Metas no card da pergunta, com "Sim, consigo", "Agora não" e "Responder depois"', new URL(p.url()).pathname === '/metas' &&
    JSON.stringify(askButtons) === JSON.stringify(['Sim, consigo', 'Agora não', 'Responder depois']), `${p.url()} ${JSON.stringify(askButtons)}`);
  await logoChecks('Metas (conta nova): logotipo "clarevo." no cabeçalho azul, sem o símbolo C');
  await shot('97_metas_pergunta_conta_nova');
  // "Agora não": texto acolhedor e reserva mínima com valores a partir de R$ 100,00, nenhum pré-marcado. Nada é criado
  // até a pessoa escolher e tocar em "Criar reserva mínima".
  await btn('Agora não').click(); await waitText('Tudo bem. Muita gente começa com valores pequenos'); await p.waitForTimeout(400);
  t = await body();
  const minChips = await p.getByRole('radio').filter({ visible: true }).evaluateAll((els) => els.map((e) => [(e.getAttribute('aria-label') || e.textContent).replace(/\u00a0/g, ' '), e.getAttribute('aria-checked')]));
  ok('"Agora não": texto acolhedor e a pergunta da reserva mínima', new URL(p.url()).pathname === '/guardar/minima' && t.includes('Tudo bem. Muita gente começa com valores pequenos, e qualquer valor guardado ajuda num imprevisto.') && t.includes('Quer começar uma reserva mínima?'), p.url());
  ok('reserva mínima: chips R$ 100,00, 300,00, 500,00, 1.000,00 e "Outro valor" (e "1 mês dos seus gastos essenciais" com o que já dá para calcular: aqui, o gasto fixo de R$ 100,00), nenhum pré-marcado',
    JSON.stringify(minChips.slice(0, 4).map((c) => c[0])) === JSON.stringify(['R$ 100,00', 'R$ 300,00', 'R$ 500,00', 'R$ 1.000,00']) && minChips.some((c) => c[0] === 'Outro valor') &&
    minChips.every((c) => c[1] === 'false') && minChips.filter((c) => /gastos essenciais/.test(c[0])).length <= 1, JSON.stringify(minChips));
  ok('reserva mínima: passos pequenos (R$ 10,00 por semana = R$ 43,33 por mês) e os dois links, sem dizer o que cortar', t.includes('Guardar R$ 10,00 por semana · R$ 43,33 por mês') && t.includes('Guardar quando entrar um valor extra') &&
    (await visibleCount('button', 'Ver para onde foi o dinheiro')) === 1 && (await visibleCount('button', 'Ver renda comprometida')) === 1 && (await visibleCount('button', 'Me pergunte de novo no próximo mês')) === 1 && !FORBIDDEN.test(t));
  await keepText();
  await layoutChecks('reserva mínima 390px');
  await shot('98_reserva_minima');
  await p.setViewportSize({ width: 320, height: 800 }); await p.waitForTimeout(400);
  await layoutChecks('reserva mínima 320px');
  await shot('98_reserva_minima_320px');
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(300);
  await btn('Criar reserva mínima').click(); await p.waitForTimeout(300);
  ok('reserva mínima: sem escolha, "Criar reserva mínima" pede para escolher', (await body()).includes('Escolha'), (await body()).split('\n').filter((l) => /Escolha/.test(l)).join(' | '));
  await radio('Outro valor').click(); await field('Valor da reserva mínima').fill('50'); await btn('Criar reserva mínima').click(); await p.waitForTimeout(300);
  ok('reserva mínima: "Outro valor" abaixo de R$ 100,00 é recusado', (await body()).includes('Informe um valor a partir de R$ 100,00, como 300,00.'));
  const goalsBefore = await otherDevice(async (repo, ctx) => (await repo.listGoals(ctx)).length);
  ok('reserva mínima: nada criado antes de escolher e criar', goalsBefore === 0, String(goalsBefore));
  await radio('R$ 100,00').click(); await btn('Criar reserva mínima').click(); await waitText('Reserva mínima criada.'); await p.waitForTimeout(600);
  t = await body();
  ok('reserva mínima criada: Metas mostra "Reserva para imprevistos" com R$ 0,00 de R$ 100,00 (0%) e o convite à pergunta some', new URL(p.url()).pathname === '/metas' && t.includes('Reserva mínima criada.') &&
    t.includes('R$ 0,00 de R$ 100,00') && !t.includes('Você consegue guardar algum valor por mês?'), t.slice(0, 300));
  await shot('99_metas_reserva_minima');
  // Editar a reserva mínima (R$ 100,00, 1 mês): os R$ 100,00 não viram "gastos essenciais salvos" no formulário e escolher 3 meses
  // salva (antes, a origem "reserva_minima" ficava e a gravação era recusada com 3 meses). Depois, a reserva volta a ser a
  // mínima para o restante do roteiro.
  await btn('Ver detalhes').click(); await waitText('Mais ações'); await p.waitForTimeout(300);
  await btn('Mais ações').click(); await p.getByRole('alert').getByRole('button', { name: 'Editar meta' }).last().click(); await waitText('Quantos meses você quer cobrir?'); await p.waitForTimeout(400);
  ok('reserva mínima: Editar abre /reserva', new URL(p.url()).pathname === '/reserva', p.url());
  ok('reserva mínima: Editar não trata os R$ 100,00 da reserva mínima como gastos essenciais salvos', !(await body()).includes('Valor salvo na sua reserva.'));
  if ((await visibleCount('textbox', 'Gastos essenciais por mês')) === 0) await btn('Ajustar valor').click();
  await field('Gastos essenciais por mês').fill('2000'); await p.waitForTimeout(300);
  await radio('3 meses').click(); await p.waitForTimeout(300);
  await btn('Salvar reserva').click(); await waitText('Reserva salva.'); await p.waitForTimeout(600);
  const editedGoal = await otherDevice(async (repo, ctx) => { const g = (await repo.listGoals(ctx)).find((x) => x.goalType === 'emergencia'); return g ? { source: g.essentialBaseSource, months: g.essentialMonths, base: g.essentialBaseCents, target: g.targetCents } : null; });
  ok('reserva mínima + Editar + 3 meses: salva (3 meses, base R$ 2.000,00 informada, alvo R$ 6.000,00)',
    editedGoal !== null && editedGoal.months === 3 && editedGoal.source === 'informado' && editedGoal.base === 200000 && editedGoal.target === 600000, JSON.stringify(editedGoal));
  await otherDevice(async (repo, ctx) => {
    const g = (await repo.listGoals(ctx)).find((x) => x.goalType === 'emergencia');
    await repo.updateGoal(`e2e-volta-minima-${Date.now()}`, g.id, g.version, { goalType: 'emergencia', name: g.name, targetCents: 10000, targetMonth: g.targetMonth, plannedMonthlyCents: g.plannedMonthlyCents, essentialBaseCents: 10000, essentialMonths: 1, essentialBaseSource: 'reserva_minima' });
  });
  await p.waitForTimeout(500);
  const backToMin = await otherDevice(async (repo, ctx) => { const g = (await repo.listGoals(ctx)).find((x) => x.goalType === 'emergencia'); return g ? [g.essentialBaseSource, g.essentialMonths, g.targetCents] : null; });
  ok('reserva mínima restaurada para o roteiro (R$ 100,00, 1 mês, reserva_minima)', JSON.stringify(backToMin) === JSON.stringify(['reserva_minima', 1, 10000]), JSON.stringify(backToMin));
  for (let i = 0; i < 4 && new URL(p.url()).pathname !== '/metas'; i++) { await btn('Voltar').click(); await p.waitForTimeout(400); }
  await waitText('Planejar quanto guardar'); await p.waitForTimeout(300);
  // Reserva mínima e depois "consigo": a base da reserva mínima (R$ 100,00) não vira "gastos essenciais" do plano, e o plano em
  // etapas troca a reserva de 1 mês por outra etapa sem recusa (a origem deixa de ser "reserva_minima").
  ok('reserva mínima: Metas oferece "Planejar quanto guardar" (o plano ainda não foi respondido)', (await visibleCount('button', 'Planejar quanto guardar')) === 1);
  await btn('Planejar quanto guardar').click(); await waitText('Quanto você consegue guardar por mês?'); await p.waitForTimeout(400);
  await field('Quanto você consegue guardar por mês?').fill('300'); await p.waitForTimeout(500);
  const minEssential = (await visibleCount('textbox', 'Gastos essenciais por mês')) === 1 ? await field('Gastos essenciais por mês').inputValue() : null;
  ok('reserva mínima + "consigo": os R$ 100,00 da reserva mínima não aparecem como gastos essenciais informados', minEssential !== '100,00', String(minEssential));
  if (minEssential !== null) await field('Gastos essenciais por mês').fill('2000');
  await p.waitForTimeout(400);
  // Reserva mínima (1 mês): nenhuma etapa vem marcada e "Usar este plano" só aparece depois de a pessoa escolher (o alvo nunca diminui sozinho).
  const stageChecked = await p.getByRole('radio').filter({ visible: true }).evaluateAll((els) => els.filter((e) => /^Etapa de /.test(e.getAttribute('aria-label') || '')).map((e) => e.getAttribute('aria-checked')));
  ok('plano com reserva mínima: as três etapas aparecem e nenhuma vem marcada', stageChecked.length === 3 && stageChecked.every((c) => c === 'false'), JSON.stringify(stageChecked));
  ok('plano com reserva mínima: sem escolher a etapa, não há "Usar este plano"', (await visibleCount('button', 'Usar este plano')) === 0);
  await radio('Etapa de 3 meses dos gastos essenciais').click(); await p.waitForTimeout(300);
  if ((await visibleCount('button', 'Usar este plano')) > 0) await btn('Usar este plano').click(); else await btn('Salvar valor por mês').click();
  await waitUntil(async () => new URL(p.url()).pathname === '/metas', 8000); await p.waitForTimeout(700);
  const minGoal = await otherDevice(async (repo, ctx) => { const g = (await repo.listGoals(ctx)).find((x) => x.goalType === 'emergencia'); return g ? { source: g.essentialBaseSource, months: g.essentialMonths, base: g.essentialBaseCents } : null; });
  t = await body();
  ok('reserva mínima + "consigo": o plano troca a reserva para 3 meses com a base informada (nunca "reserva_minima" com 3 meses)', minGoal !== null && minGoal.months === 3 && minGoal.source !== 'reserva_minima' && minGoal.base > 0 && t.includes('Você planeja guardar R$ 300,00 por mês.'), JSON.stringify(minGoal));
  await p.getByRole('tab', { name: 'Resumo' }).filter({ visible: true }).first().click(); await waitText('Diferença do mês');
  await waitUntil(async () => !(await headingShown('Primeiros passos')), 8000);
  ok('primeiros passos: com os quatro passos prontos ("Agora não" conta como resposta), o card sai', !(await headingShown('Primeiros passos')) && (await visibleCount('button', 'Anotar gasto')) === 1);
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
  ok('primeiros passos: fora da conta de demonstração com dados', !(await headingShown('Primeiros passos')) && (await visibleCount('button', 'Agora não')) === 0 && !t.includes('Quatro passos para o Clarevo'));
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
    // D-037: a demonstração tem o "Cartão Exemplo"; a legenda traz a fatura atual (fecha dia 3, vence dia 10).
    cartoes: 'Cartões, Cartão Exemplo, fatura de novembro R$ 550,00',
    calc: 'Calculadoras, Parcelado ou à vista, dívidas, reserva e outras contas',
  };
  await waitText('5 cadastrados, com as contas do ano').catch(() => {});
  t = await body();
  const scOrder = await p.evaluate(() => {
    const top = (sel, text) => [...document.querySelectorAll(sel)].find((e) => e.textContent === text && e.getBoundingClientRect().width > 0)?.getBoundingClientRect().top ?? null;
    return { anotar: top('[role=button]', 'Anotar gasto'), organizar: top('[role=heading]', 'Organizar'), totais: top('div[dir="auto"]', 'Pago em outubro') };
  });
  ok('movimentações: "Organizar" com os quatro atalhos (Cartões entre os gastos fixos e as calculadoras) e as legendas de outubro, entre os botões e os totais do mês', JSON.stringify(await sectionRows('Organizar')) === JSON.stringify([SC.pagar, SC.fixos, SC.cartoes, SC.calc]) &&
    ['R$ 650,00 em aberto neste mês', '5 cadastrados, com as contas do ano', 'Cartão Exemplo · fatura de novembro R$ 550,00', 'Parcelado ou à vista, dívidas, reserva e outras contas'].every((x) => t.includes(x)) &&
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
  // D-037: as dez faturas do "Cartão Exemplo" (novembro a agosto de 2027) são contas a pagar de "Próximos meses"; a de novembro vem
  // depois do Seguro (também dia 10) e antes da Luz (dia 12); as outras nove vêm no fim, por vencimento.
  const FAT = (due, cents) => `Fatura Cartão Exemplo, vence em ${due}, cerca de R$ ${cents}, valor estimado`;
  const laterBase = ['Aluguel, vence em 05/11/2026, R$ 2.500,00, gasto fixo', 'Financiamento do carro, vence em 10/11/2026, R$ 850,00, parcela 13 de 48', 'Seguro do carro, vence em 10/11/2026, R$ 300,00', FAT('10/11/2026', '550,00'),
    'Luz, vence em 12/11/2026, cerca de R$ 180,00, valor estimado, gasto fixo', FAT('10/12/2026', '350,00'), FAT('10/01/2027', '350,00'), ...['10/02/2027', '10/03/2027', '10/04/2027', '10/05/2027', '10/06/2027', '10/07/2027', '10/08/2027'].map((d) => FAT(d, '150,00'))];
  // Espera a lista completa (e não só a seção): as faturas do cartão chegam na mesma leitura, mas a tela pode estar num instante intermediário.
  const laterBaseJson = JSON.stringify(laterBase);
  await waitUntil(async () => JSON.stringify(await sectionRows('Próximos meses')) === laterBaseJson, 10000);
  const laterNow = await sectionRows('Próximos meses');
  t = await body();
  ok('lista: próximos meses com Aluguel, parcela 13 de 48, Seguro, Luz estimada e as dez faturas do Cartão Exemplo', JSON.stringify(laterNow) === JSON.stringify(laterBase) && ['Vence em 05/11/2026 · Todo mês', 'Vence em 10/11/2026 · Parcela 13 de 48', 'Vence em 12/11/2026 · Todo mês · estimado', '≈ R$ 180,00'].every((x) => t.includes(x)), (laterNow ?? []).join(' | '));
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
  await openRow(/^Internet, vence em 15\/10\/2026/); await waitText('Já paguei');
  await btn('Já paguei').click(); await waitText('Confirmar pagamento');
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
  await openRow(/^Internet, vence em 15\/10\/2026/); await waitText('Já paguei');
  await btn('Já paguei').click(); await waitText('Confirmar pagamento');
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
  await openRow(/^Seguro do carro, vence em 10\/11\/2026/); await waitText('Já paguei');
  await btn('Já paguei').click(); await waitText('Confirmar pagamento');
  await btn('Confirmar pagamento').click(); await waitText('Pagamento registrado');
  ok('seguro pago em outubro: resumo afetado é Pago de outubro', (await body()).includes('Pago de outubro de 2026'));
  await btn('Voltar').click(); await waitText('Já contam em Pago, no mês da data do pagamento.');
  // "Próximos meses" continua com os gastos fixos de novembro: o Seguro sai dessa seção e entra em "Pagas".
  const isSeguro = (r) => r.startsWith('Seguro do carro');
  // Espera a tela inteira chegar ao estado final (a lista completa de "Próximos meses" sem o Seguro, o Seguro em "Pagas" e o total
  // de sempre), não só o Seguro sair: as contas de fatura de cartão e as demais voltam da mesma leitura, mas a tela pode mostrar um
  // instante intermediário enquanto as leituras do mês recarregam. Se o estado final não chegar, a conferência seguinte acusa.
  const laterExpected = JSON.stringify(laterBase.filter((r) => !isSeguro(r)));
  await waitUntil(async () => {
    const later = await sectionRows('Próximos meses');
    const paid = await sectionRows('Pagas');
    return later !== null && JSON.stringify(later) === laterExpected && (paid ?? []).some((r) => /^Seguro do carro, paga em 07\/10\/2026/.test(r)) && (await body()).includes('R$ 650,00');
  }, 10000);
  t = await body();
  const paidNow = (await sectionRows('Pagas')) ?? [];
  const laterPaid = await sectionRows('Próximos meses');
  ok('conta de novembro paga em outubro aparece em Pagas de outubro e sai de Próximos meses',
    (await p.getByRole('button', { name: /^Seguro do carro, paga em 07\/10\/2026, R\$ 300,00, conta em Pago de outubro de 2026/ }).filter({ visible: true }).count()) === 1 &&
      paidNow.some((r) => /^Seguro do carro, paga em 07\/10\/2026/.test(r)) && laterPaid !== null && !laterPaid.some(isSeguro) &&
      JSON.stringify(laterPaid) === laterExpected && t.includes('R$ 650,00'),
    `Próximos meses: ${(laterPaid ?? []).join(' | ')} || Pagas: ${paidNow.join(' | ')}`);
  await btn('Voltar').click(); await waitText('Diferença do mês');
  await expectTotals('pagar Seguro em outubro → 4.200 / 1.800, a pagar 650', 'R$ 6.000,00', 'R$ 4.200,00', 'R$ 1.800,00', 'R$ 650,00');
  await openToPay();
  await openRow(/^Seguro do carro, paga em 07\/10\/2026/); await waitText('Desfazer pagamento');
  await btn('Desfazer pagamento').click(); await waitText('Desfazer pagamento?');
  await confirmIn('Desfazer pagamento'); await waitText('Pagamento desfeito');
  await btn('Ver resumo do mês').click(); await waitText('Diferença do mês');
  await expectTotals('desfazer Seguro → base', 'R$ 6.000,00', 'R$ 3.900,00', 'R$ 2.100,00');
  await openToPay(); await waitText('Próximos meses');
  await waitUntil(async () => JSON.stringify(await sectionRows('Próximos meses')) === laterBaseJson && !((await sectionRows('Pagas')) ?? []).some(isSeguro), 10000);
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
      ['Contas que vêm uma vez por ano, como IPVA, IPTU, matrícula e seguro. Você cadastra uma vez; todo ano o Clarevo cria a conta do mês certo, dois meses antes de vencer.', '≈ R$ 2.400,00 · todo ano em 20/01 · valor muda', '10 parcelas de ≈ R$ 180,00 · fevereiro a novembro, dia 10 · valor muda'].every((x) => t.includes(x)),
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
  await openRow(/^Escola, vence em 10\/11\/2026, R\$ 900,00, gasto fixo/); await waitText('Já paguei');
  await waitText('Parte de: Escola · todo mês, dia 10').catch(() => {});
  ok('conta do gasto fixo: "Parte de" e "Ver gasto fixo"', (await body()).includes('Parte de: Escola · todo mês, dia 10') && (await visibleCount('button', 'Ver gasto fixo')) === 1);
  await btn('Já paguei').click(); await waitText('Confirmar pagamento');
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
  // Só as faturas do cartão continuam estimadas (a fatura aberta pode mudar com novas compras); a Luz deixa de ser.
  ok('"estimado" some da Luz em Contas a pagar', ((await sectionRows('Próximos meses')) ?? []).includes('Luz, vence em 12/11/2026, R$ 180,00, gasto fixo') &&
    ((await sectionRows('Próximos meses')) ?? []).filter((r) => r.includes('estimado')).every((r) => r.startsWith('Fatura Cartão Exemplo')));
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
  ok('cancelar não tira nada', (await visibleCount('button', 'Já paguei')) === 1 && (await body()).includes('R$ 114,00'));
  await btn('Voltar').click(); await waitText('Esconder as parcelas');

  // "Paguei o ano todo de uma vez": a parcela 1 paga com R$ 433,20 e as outras 3 tiradas. Desfazer não traz as 3 de volta.
  await openRow(partRow(1)); await waitText('Já paguei');
  await btn('Já paguei').click(); await waitText('Confirmar pagamento');
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
    (await visibleCount('button', 'Já paguei')) === 0, t.slice(0, 300));
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
  await openRow(/^Taxa escolar, vence em 20\/10\/2026/); await waitText('Já paguei');
  await btn('Já paguei').click(); await waitText('Confirmar pagamento');
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
  await btn('Já paguei').click(); await waitText('Confirmar pagamento');
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
    ['Decidir uma compra', [['Antes de financiar', 'Parcela, juros e o que muda se juntar antes'], ['Parcelado ou à vista?', 'Descubra os juros embutidos no parcelado'], ['Quanto custa por ano?', 'Assinaturas e gastos que se repetem']]],
    ['Dívidas e atrasos', [['Quanto custa uma dívida?', 'Rotativo, cheque especial ou empréstimo'], ['Quitar antes ou adiantar parcelas', 'Uma estimativa de quanto dos juros sai da conta'], ['Multa e juros por atraso', 'Com os valores do boleto'], ['Em que ordem quitar as dívidas?', 'Duas ordens de pagamento, lado a lado']]],
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

  // 1 e 2. Movimentos › Organizar › Calculadoras: 3 grupos, as 10 calculadoras (Ciclo F1: a 9ª é "Em que ordem quitar as dívidas?"; D-044: "Antes de financiar" abre o primeiro grupo), a abertura e o aviso.
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
  ok('calculadoras: 3 grupos e as 10 calculadoras, na ordem, com título e subtítulo no nome', JSON.stringify(calcSections) === JSON.stringify(calcExpected), JSON.stringify(calcSections));
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
  // Ciclo C: com o resultado válido, a calculadora oferece levar os números para a reserva (na demonstração, que já tem
  // uma reserva, "Salvar na minha reserva"; numa conta sem reserva, "Criar reserva"). Nada é gravado ao digitar.
  await waitUntil(async () => (await visibleCount('button', 'Salvar na minha reserva')) === 1, 4000);
  ok('reserva: com o resultado, o botão "Salvar na minha reserva" (a demonstração já tem reserva) e nenhum "Anotar..."', (await visibleCount('button', 'Salvar na minha reserva')) === 1 && (await visibleCount('button', /^(Criar reserva|Anotar)/)) === 0);
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
  ok('objetivo: com o resultado, o link "Simular com rendimento" (Ciclo D)', (await visibleCount('button', 'Simular com rendimento')) === 1);
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

  // Metas (Ciclo C), Aprender. A demonstração tem a reserva para imprevistos (15%) e a meta "Viagem de férias" (20%), e já
  // tem a resposta "consigo" com R$ 500,00 ao plano de guardar. Outubro continua na base nesta aba (as contas e os gastos
  // de antes não mexem nas metas).
  await p.getByRole('tab', { name: 'Metas' }).filter({ visible: true }).first().click(); await waitText('Seu plano de guardar'); await waitText('Planejado: R$ 500,00 por mês'); await p.waitForTimeout(400);
  await logoChecks('Metas: logotipo "clarevo." no cabeçalho azul, sem o símbolo C');
  const metasTitle = await p.evaluate(() => {
    const logo = [...document.querySelectorAll('[role=img][aria-label="Clarevo"]')].find((e) => e.getBoundingClientRect().width > 0);
    const h1 = [...document.querySelectorAll('h1')].find((e) => e.textContent === 'Metas' && e.getBoundingClientRect().width > 0);
    return logo && h1 ? h1.getBoundingClientRect().top - logo.getBoundingClientRect().bottom : null;
  });
  ok('Metas: o título da aba fica abaixo do logotipo', metasTitle !== null && metasTitle >= 0, `distância=${metasTitle}`);
  await shot('16_metas');
  t = await body();
  const metasBars = await p.getByRole('progressbar').filter({ visible: true }).evaluateAll((els) => els.map((e) => [e.getAttribute('aria-label'), e.getAttribute('aria-valuenow'), e.getAttribute('aria-valuetext')]));
  ok('Metas da demonstração: reserva 15% (R$ 3.500,00 de R$ 22.500,00, "Cobre 0,9 mês", planejado R$ 500,00 por mês) e a barra com valor e texto acessíveis', t.includes('R$ 3.500,00 de R$ 22.500,00') && t.includes('15%') &&
    t.includes('Cobre 0,9 mês dos seus gastos essenciais') && t.includes('Planejado: R$ 500,00 por mês') &&
    JSON.stringify(metasBars) === JSON.stringify([['Reserva para imprevistos: 15% da meta, R$ 3.500,00 de R$ 22.500,00.', '15', 'R$ 3.500,00 de R$ 22.500,00, 15%']]), JSON.stringify(metasBars));
  ok('Metas da demonstração: "Viagem de férias" 20% (R$ 1.200,00 de R$ 6.000,00), até julho de 2027 com R$ 480,00 por mês', (await visibleCount('button', /^Viagem de férias: 20% da meta, R\$ 1\.200,00 de R\$ 6\.000,00\. Até julho de 2027 · R\$ 480,00 por mês para chegar lá\./)) === 1 &&
    t.includes('R$ 1.200,00 de R$ 6.000,00') && t.includes('20%') && t.includes('Até julho de 2027 · R$ 480,00 por mês para chegar lá'));
  ok('Metas da demonstração: plano de guardar com R$ 500,00 por mês e "Seu mês" com a renda comprometida e o guardado em outubro',
    t.includes('Você planeja guardar R$ 500,00 por mês.') && t.includes('a terceira etapa (R$ 22.500,00, 6 meses dos seus gastos essenciais) chega em dezembro de 2029.') && t.includes('Guardado em outubro: R$ 500,00') &&
    /\d+,\d% da renda de referência já tem destino\./.test(t) && (await visibleCount('button', 'Ver renda comprometida')) === 1 && (await visibleCount('button', 'Ver o plano')) === 1 && (await visibleCount('button', 'Mudar valor')) === 1);
  ok('Metas: a pergunta "Você consegue guardar algum valor por mês?" não aparece depois da resposta "consigo"', !t.includes('Você consegue guardar algum valor por mês?') && (await visibleCount('button', 'Responder depois')) === 0);
  ok('Metas: títulos na ordem (Reserva para imprevistos com o plano dentro, Suas metas, Seu mês, Fazer as contas, Aprender; D-039)', JSON.stringify((await headingList()).filter((h) => h.startsWith('2:'))) ===
    JSON.stringify(['2:Reserva para imprevistos', '2:Suas metas', '2:Seu mês', '2:Fazer as contas', '2:Aprender']) && (await headingList()).includes('3:Seu plano de guardar'), JSON.stringify(await headingList()));
  await keepText();
  // A aba mantém o acesso às calculadoras e ao simulador (linhas do mesmo card).
  const calcRows = [
    'Simular um plano. Quanto guardar por mês, em quanto tempo e quanto você pode ter, com hipóteses suas.',
    'Calculadoras. Parcelado ou à vista, dívidas, reserva e outras contas',
  ];
  ok('Metas: "Simular um plano" e "Calculadoras" em linhas próprias, e o card "Enquanto isso, faça as contas" saiu', (await Promise.all(calcRows.map((n) => visibleCount('button', n)))).every((n) => n === 1) && !t.includes('Enquanto isso, faça as contas'));
  await layoutChecks('metas 390px');
  await scrollTo('Calculadoras');
  await shot('70_metas_calculadoras');
  await p.setViewportSize({ width: 320, height: 800 }); await p.waitForTimeout(400);
  await layoutChecks('metas 320px');
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(300);
  const fromGoals = async (row, title) => {
    await p.getByRole('button', { name: new RegExp(`^${row}\\.`) }).filter({ visible: true }).first().click();
    await waitUntil(async () => (await h1Name()) === title, 8000);
  };
  await fromGoals('Calculadoras', 'Calculadoras');
  const calcNames = calcExpected.flatMap(([, items]) => items);
  ok('Metas › Calculadoras: a lista com as 10 (D-044)', calcNames.length === 10 && (await Promise.all(calcNames.map((n) => visibleCount('button', n)))).every((n) => n === 1));
  await openCalc('Reserva para imprevistos');
  await typeIn('Gastos essenciais por mês', '1.000,00'); await radio('3 meses').click();
  ok('Metas › Calculadoras › Reserva para imprevistos: funciona (3 meses de 1.000,00 → R$ 3.000,00)', await shows('Com estes números, a reserva de 3 meses é de R$ 3.000,00.'));
  await backToCalcList();
  await openCalc('Juntar para um objetivo');
  await typeIn('Quanto quer juntar', '1.200,00'); await typeIn('Em quantos meses', '12');
  ok('Metas › Calculadoras › Juntar para um objetivo: funciona (1.200,00 em 12 meses → R$ 100,00 por mês)', await shows('R$ 100,00 por mês'));
  await backToCalcList();
  await btn('Voltar').click(); await waitText('Seu plano de guardar');
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
  const learnSearch = () => p.getByLabel('Buscar um tema ou uma função', { exact: true }).filter({ visible: true }).first();
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
  ok('busca: a contagem é anunciada uma vez na região viva', learnLive.some((x) => /^\d+ temas para "juros"(\. \d+ telas? do app para "juros")?$/.test(x)), JSON.stringify(learnLive));
  // A região viva fica numa caixa de 1 px recortada, nunca com opacidade 0 (o TalkBack ignora o que é transparente).
  const liveBox = await p.evaluate(() => {
    const e = [...document.querySelectorAll('[aria-live="polite"]')].find((x) => /^\d+ temas para "juros"(\. \d+ telas? do app para "juros")?$/.test(x.textContent));
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
  const allowedSource = (url, slug) => { try { const h = new URL(url).hostname; return new URL(url).protocol === 'https:' && (['gov.br', 'leg.br', 'jus.br', 'def.br'].some((d) => h === d || h.endsWith(`.${d}`)) || (slug === 'fgc' && (h === 'fgc.org.br' || h.endsWith('.fgc.org.br'))) || (slug === 'renda-comprometida' && (h === 'serasa.com.br' || h.endsWith('.serasa.com.br')))); } catch { return false; } };
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
  const allowedSourceUrl = (url, slug) => { try { const u = new URL(url); const h = u.hostname; return u.protocol === 'https:' && (['gov.br', 'leg.br', 'jus.br', 'def.br'].some((d) => h === d || h.endsWith(`.${d}`)) || (slug === 'fgc' && (h === 'fgc.org.br' || h.endsWith('.fgc.org.br'))) || (slug === 'renda-comprometida' && (h === 'serasa.com.br' || h.endsWith('.serasa.com.br')))); } catch { return false; } };
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
    // A referência de 30% da renda com parcelas de dívidas é de uma fonte privada identificada (P-024): a Serasa só pode aparecer em "renda-comprometida".
    const learnChecked = slug === 'renda-comprometida' ? shownText.replace(/Serasa/g, '') : shownText;
    const bad = shownText.match(FORBIDDEN)?.[0] ?? shownText.match(VETOED)?.[0] ?? learnChecked.match(LEARN_FORBIDDEN)?.[0] ?? (['sem-registro', 'voltei-depois'].includes(slug) ? shownText.match(RETURN_WORDS)?.[0] : null);
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
  ok('Aprender: 40 temas publicados abrem pela aba (33 nas seções e 7 dúvidas), cada um com o título como cabeçalho de nível 1', learnSeen.size === 40 && learnLabels.length === 33 && faqNames.length === 7 &&
    learnIssues.titulo.length === 0, `${learnSeen.size} temas, ${learnLabels.length} linhas, ${faqNames.length} dúvidas ${learnIssues.titulo.slice(0, 3).join(' | ')}`);
  ok('temas: nenhum termo vetado nem travessão longo nos textos exibidos', learnIssues.termos.length === 0, learnIssues.termos.slice(0, 3).join(' | '));
  ok('temas: fontes com papel de link, data de consulta e domínio permitido (oficial; FGC só no tema do FGC; Serasa só em renda-comprometida)', externalTopics.length >= 20 && learnIssues.fontes.length === 0,
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
    await openRow(/^Internet, vence em 15\/10\/2026/); await waitText('Já paguei'); await p.waitForTimeout(300);
    await headerChecks(`detalhe da conta ${w}px`);
    await layoutChecks(`detalhe da conta ${w}px`);
    if (w === 320) await shot('24_detalhe_conta_320px');
    await btn('Já paguei').click(); await waitText('Confirmar pagamento'); await p.waitForTimeout(300);
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
  // ==================================================================================================================
  // Ciclo B · Renda comprometida (D-026, spec2 §2.3). Cada bloco parte de uma demonstração nova (hoje 07/10/2026; renda
  // de referência de R$ 6.000,00 desde setembro). A linha do Resumo fica DENTRO do card "Ainda a pagar"; a tela mostra
  // a composição, "Fora dos compromissos" (sem "sobra", "disponível" nem "saldo"), os próximos meses e, nas dívidas, a
  // referência de mercado com a fonte. Falha de carga mostra erro, nunca 0%.
  const freshDemo = async () => {
    await p.goto(`http://localhost:${PORT}/`); await waitText('Seu dinheiro');
    await btn('Ver demonstração com dados fictícios').click(); await waitText('Diferença do mês'); await waitText('R$ 2.100,00'); await p.waitForTimeout(400);
  };
  const rcRow = () => p.getByRole('button', { name: /^Renda comprometida em / }).filter({ visible: true }).first();
  const rcLabel = (pct, spent, ref, month = 'outubro') => `Renda comprometida em ${month}: ${pct} da renda de referência. ${spent} de ${ref}. Abre os detalhes.`;
  // Texto que a tela de renda comprometida nunca mostra (sem alerta, julgamento nem "saldo").
  const NO_BALANCE = /\b(sobra|sobrou|sobras|dispon[ií]vel|saldo livre|alerta|cuidado|perigo|estour\w+|gastou demais|endividad\w+)\b/i;
  const rcMonth = async (name) => { await radio(`Renda comprometida de ${name}`).click(); await waitText(`da sua renda de referência em ${name}`); await p.waitForTimeout(300); };

  await freshDemo();
  await waitText('Renda comprometida em outubro');
  t = await body();
  ok('B Resumo: linha "Renda comprometida em outubro" com 52,5% e o nome acessível completo', (await visibleCount('button', rcLabel('52,5%', 'R$ 3.150,00', 'R$ 6.000,00'))) === 1 && t.includes('52,5%'));
  const rcInCard = await p.evaluate(() => {
    const vis = (e) => e.getBoundingClientRect().width > 0;
    const buttons = [...document.querySelectorAll('[role=button]')].filter(vis);
    const row = buttons.find((e) => (e.getAttribute('aria-label') || '').startsWith('Renda comprometida em'));
    const toPay = buttons.find((e) => (e.getAttribute('aria-label') || '').startsWith('Ainda a pagar neste mês'));
    if (!row || !toPay) return null;
    let box = row.parentElement;
    while (box && !box.contains(toPay)) box = box.parentElement;
    return {
      heads: [...document.querySelectorAll('[role=heading]')].filter(vis).filter((h) => box.contains(h)).map((h) => h.textContent),
      anotarGasto: buttons.some((e) => box.contains(e) && e.textContent === 'Anotar gasto'),
      anotarConta: buttons.some((e) => box.contains(e) && e.textContent === 'Anotar conta a pagar'),
    };
  });
  ok('B Resumo: a linha está dentro do card "Ainda a pagar" (sem card novo, sem título novo)', rcInCard !== null && rcInCard.heads.length === 0 && !rcInCard.anotarGasto && rcInCard.anotarConta, JSON.stringify(rcInCard));
  const rcOrder = ['Anotar gasto', 'Ainda a pagar neste mês', 'Renda comprometida em outubro', 'Anotar conta a pagar', 'Pagamentos do mês', 'Fatura sem contar duas vezes', 'Quem vê estes dados?'].map((x) => t.indexOf(x));
  ok('B Resumo: a ordem dos blocos não mudou (Anotar gasto, Ainda a pagar com a linha, Anotar conta a pagar, Pagamentos do mês, Fatura sem contar duas vezes, Quem vê estes dados?)', rcOrder.every((v, i) => v >= 0 && (i === 0 || v > rcOrder[i - 1])), JSON.stringify(rcOrder));
  ok('B Resumo: títulos de sempre (Outubro de 2026 e Pagamentos do mês)', JSON.stringify(await headingList()) === JSON.stringify(['2:Outubro de 2026', '2:Pagamentos do mês']), JSON.stringify(await headingList()));
  await layoutChecks('Resumo com renda comprometida 390px');
  await shot('100_resumo_renda_comprometida');
  await p.setViewportSize({ width: 320, height: 800 }); await p.waitForTimeout(400);
  await layoutChecks('Resumo com renda comprometida 320px');
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(300);

  // A tela de outubro: percentual, composição, fora dos compromissos, recebido, contas do mês, próximos meses e o critério.
  await rcRow().click(); await waitText('da sua renda de referência em outubro de 2026'); await waitText('Dezembro de 2026 ·'); await p.waitForTimeout(400);
  t = await body();
  ok('B tela: título "Renda comprometida" e o destaque 52,5% (R$ 3.150,00 em contas de R$ 6.000,00)', (await h1Name()) === 'Renda comprometida' && t.includes('52,5%') && t.includes('R$ 3.150,00 em contas de R$ 6.000,00'), String(await h1Name()));
  ok('B tela: legenda Já pago R$ 2.500,00 e Em aberto R$ 650,00', t.includes('Já pago · R$ 2.500,00') && t.includes('Em aberto · R$ 650,00'));
  ok('B tela: composição (gastos fixos 41,7%, parcelamentos 0,0%, outras contas 10,8%)', t.includes('Gastos fixos · R$ 2.500,00 · 41,7%') && t.includes('Parcelamentos · R$ 0,00 · 0,0%') && t.includes('Outras contas a pagar · R$ 650,00 · 10,8%'));
  ok('B tela: "Fora dos compromissos" R$ 2.850,00 com "Não é saldo: ainda precisa cobrir gastos do dia a dia."', t.includes('Fora dos compromissos: R$ 2.850,00') && t.includes('Não é saldo: ainda precisa cobrir gastos do dia a dia'));
  ok('B tela: renda de referência (R$ 6.000,00 por mês, desde setembro de 2026) e recebido em outubro', t.includes('R$ 6.000,00 por mês, desde setembro de 2026') && t.includes('Recebido em outubro: R$ 6.000,00'));
  ok('B tela: contas do mês (Aluguel, Internet, Condomínio)', t.includes('Contas do mês') && t.includes('Aluguel') && t.includes('Internet') && t.includes('Condomínio'));
  ok('B tela: próximos meses (novembro R$ 4.380,00 73,0% e dezembro R$ 3.880,00 64,7%, já com as faturas do cartão, "Previsto") e o marco de outubro de 2029', t.includes('Novembro de 2026 · R$ 4.380,00 · 73,0%') && t.includes('Dezembro de 2026 · R$ 3.880,00 · 64,7%') &&
    t.includes('Previsto: contas já criadas e repetições programadas. Valores estimados podem mudar.') && t.includes('Outubro de 2029: última parcela de Financiamento do carro (R$ 850,00).'));
  ok('B tela: "Como calculamos", "Como ler este número" e os links', t.includes('Somamos as contas a pagar com vencimento em outubro') && t.includes('Como ler este número') && t.includes('Gastos fixos e parcelamentos') && t.includes('Contas a pagar') && t.includes('Quem vê estes dados?'));
  ok('B tela: nenhum termo de alerta, "sobra", "disponível" nem travessão longo', !NO_BALANCE.test(t) && !FORBIDDEN.test(t), (t.match(NO_BALANCE) ?? t.match(FORBIDDEN) ?? [''])[0]);
  const rcMeter = await p.locator('[role=img]').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')).filter(Boolean));
  ok('B tela: o medidor tem um rótulo acessível com percentual, já pago e em aberto', rcMeter.includes('52,5% da renda de referência: já pago R$ 2.500,00, em aberto R$ 650,00.'), JSON.stringify(rcMeter.slice(0, 3)));
  await keepText();
  await innerChecks('renda comprometida 390px');
  await shot('101_renda_comprometida_outubro', true);
  await p.setViewportSize({ width: 320, height: 800 }); await p.waitForTimeout(400);
  await innerChecks('renda comprometida 320px');
  await shot('101_renda_comprometida_320px', true);
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(300);

  // Novembro: 63,8%, dívidas (14,2%) com a referência de mercado e a fonte, "Ocultar referência" e os estimados.
  await rcMonth('novembro de 2026');
  t = await body();
  ok('B novembro: 73,0% (R$ 4.380,00 em contas de R$ 6.000,00, com R$ 550,00 de fatura de cartão) e fora dos compromissos R$ 1.620,00', t.includes('73,0%') && t.includes('R$ 4.380,00 em contas de R$ 6.000,00') && t.includes('Fora dos compromissos: R$ 1.620,00') && t.includes('Não é saldo'));
  ok('B novembro: dívidas R$ 850,00 (14,2%) com a referência da Serasa (até 30%), "não é uma regra para você" e a fonte com data', t.includes('Dívidas: R$ 850,00 · 14,2% da renda de referência.') &&
    t.includes('Referência usada pela Serasa: até 30% da renda líquida com parcelas de dívidas. É uma referência geral, não uma regra para você.') && t.includes('Fonte: Serasa, página sobre comprometimento de renda, consultada em 09/10/2026.'));
  ok('B novembro: "Inclui R$ 730,00 em valores estimados." (a Luz de R$ 180,00 e a fatura aberta de R$ 550,00)', t.includes('Inclui R$ 730,00 em valores estimados.'));
  ok('B novembro: a fonte da Serasa é um link (papel link)', (await p.getByRole('link', { name: /Serasa/ }).filter({ visible: true }).count()) >= 1);
  await keepText();
  await shot('102_renda_comprometida_novembro', true);
  await btn('Ocultar referência').click(); await p.waitForTimeout(200);
  ok('B novembro: "Ocultar referência" tira o texto da Serasa e oferece "Mostrar referência"', !(await body()).includes('Referência usada pela Serasa') && (await visibleCount('button', 'Mostrar referência')) === 1);
  await btn('Mostrar referência').click(); await p.waitForTimeout(200);
  ok('B novembro: "Mostrar referência" traz o texto de volta', (await body()).includes('Referência usada pela Serasa'));
  await rcMonth('outubro de 2026');

  // Referência: formulário com a sugestão (média de setembro), formata ao sair, salvar R$ 5.000,00 vira 63,0% e fora R$ 1.850,00.
  await p.getByRole('button', { name: 'Alterar', exact: true }).filter({ visible: true }).first().click(); await waitText('Valor por mês');
  const refInput = field('Valor por mês');
  t = await body();
  ok('B referência: textos do formulário (valor por mês, vale a partir de, renda fixa ou varia)', (await h1Name()) === 'Renda de referência' && t.includes('Quanto costuma cair na sua conta por mês, já com descontos.') && t.includes('Vale a partir de') &&
    t.includes('Minha renda é fixa') && t.includes('Minha renda varia') && (await visibleCount('button', 'Salvar renda de referência')) === 1, String(await h1Name()));
  ok('B referência: o campo vem preenchido com a referência em vigor (R$ 6.000,00)', (await refInput.inputValue()) === '6.000,00', await refInput.inputValue());
  await waitText('a média foi');
  t = await body();
  ok('B referência: a sugestão (média de setembro, sem reembolsos) com "Usar R$ 6.000,00"', t.includes('Nos meses com recebimentos anotados, a média foi R$ 6.000,00 (setembro). Reembolsos ficam fora.') && (await visibleCount('button', 'Usar R$ 6.000,00')) === 1);
  await keepText();
  await innerChecks('renda de referência 390px');
  await shot('103_renda_referencia');
  await refInput.fill('5000'); await refInput.blur();
  ok('B referência: o valor é formatado ao sair do campo (5.000,00)', (await refInput.inputValue()) === '5.000,00', await refInput.inputValue());
  await btn('Salvar renda de referência').click(); await waitText('Renda de referência salva. Ela vale a partir de outubro.'); await waitText('63,0%');
  t = await body();
  ok('B salvar R$ 5.000,00 a partir de outubro: 63,0% e fora dos compromissos R$ 1.850,00', t.includes('63,0%') && t.includes('R$ 3.150,00 em contas de R$ 5.000,00') && t.includes('Fora dos compromissos: R$ 1.850,00'));
  // Excluir a referência de outubro: pede confirmação e a de setembro volta a valer.
  await p.getByRole('button', { name: 'Alterar', exact: true }).filter({ visible: true }).first().click(); await waitText('Valor por mês');
  await btn('Excluir esta referência').click(); await waitText('Excluir a renda de referência de outubro?');
  ok('B excluir a referência: o diálogo diz que a anterior volta a valer', (await dialogText()).includes('A referência anterior volta a valer. Sem nenhuma, mostramos só os valores em reais.'));
  await shot('104_excluir_referencia');
  await confirmIn('Excluir referência'); await waitText('Renda de referência excluída.'); await waitText('52,5%');
  ok('B excluir a referência de outubro: volta a 52,5% (a de setembro)', (await body()).includes('52,5%') && (await body()).includes('R$ 6.000,00 por mês, desde setembro de 2026'));
  await btn('Voltar').click(); await waitText('Diferença do mês');

  // Previsão dos pagamentos do mês: só em Contas a pagar, só no mês de hoje, sem "Diferença".
  await openToPay(); await waitText('Se pagar tudo o que está em aberto'); await p.waitForTimeout(300);
  t = await body();
  ok('B contas a pagar: "Se pagar tudo o que está em aberto, os pagamentos de outubro chegam a R$ 4.550,00." (3.900,00 pagos + 650,00 em aberto)', t.includes('Se pagar tudo o que está em aberto, os pagamentos de outubro chegam a R$ 4.550,00.'));
  ok('B contas a pagar: a previsão não fala em "Diferença", "disponível" nem "sobra"', !/Se pagar tudo[^\n]*(Diferença|dispon|sobra)/i.test(t) && !NO_BALANCE.test(t.split('Se pagar tudo')[1]?.split('\n')[0] ?? ''));
  await keepText();
  await layoutChecks('contas a pagar com a previsão 390px');
  await shot('105_a_pagar_previsao');
  await btn('Voltar').click(); await waitText('Diferença do mês');
  ok('B Resumo: nunca mostra a previsão dos pagamentos do mês', !(await body()).includes('Se pagar tudo o que está em aberto'));
  // Em outro mês, nada de previsão: setembro (mês passado) e, pelo mês seguinte, novembro.
  await p.getByRole('button', { name: /Mês anterior/ }).filter({ visible: true }).first().click(); await waitText('Setembro de 2026'); await waitText('Renda comprometida em setembro'); await p.waitForTimeout(400);
  t = await body();
  ok('B Resumo em setembro (sem contas): "Renda comprometida em setembro" com 0,0% e "Nenhuma conta a pagar com vencimento em setembro."', t.includes('Renda comprometida em setembro') && t.includes('0,0%') && t.includes('Nenhuma conta a pagar com vencimento em setembro.') ||
    (await visibleCount('button', /^Renda comprometida em setembro: 0,0%/)) === 1, t.slice(0, 200));
  await shot('106_resumo_setembro_renda');
  await rcRow().click(); await waitText('da sua renda de referência em setembro de 2026'); await p.waitForTimeout(300);
  t = await body();
  ok('B tela de setembro: sem contas ("Nenhuma conta a pagar com vencimento em setembro."), sem a lista "Contas do mês", e os chips de setembro e outubro', t.includes('Nenhuma conta a pagar com vencimento em setembro.') && !t.includes('Contas do mês') &&
    (await radio('Renda comprometida de setembro de 2026').getAttribute('aria-checked')) === 'true' && (await radio('Renda comprometida de outubro de 2026').count()) === 1);
  await btn('Voltar').click(); await waitText('Diferença do mês');
  await p.getByRole('button', { name: /^Previsto para setembro de 2026/ }).filter({ visible: true }).first().click(); await waitUntil(async () => (await h1Name()) === 'Contas a pagar', 8000); await p.waitForTimeout(600);
  ok('B contas a pagar de setembro: sem a previsão (só no mês de hoje)', !(await body()).includes('Se pagar tudo o que está em aberto'));
  await btn('Voltar').click(); await waitText('Diferença do mês');
  await p.getByRole('button', { name: /Próximo mês/ }).filter({ visible: true }).first().click(); await waitText('Outubro de 2026'); await p.waitForTimeout(400);

  // Pagar a Internet com R$ 159,90: 52,7%; desfazer volta a 52,5%. Nada de "Pago" muda a conta de comprometido além do valor pago.
  await openToPay(); await openRow(/^Internet, vence em 15\/10\/2026/); await waitText('Já paguei');
  await btn('Já paguei').click(); await waitText('Confirmar pagamento');
  await field('Valor pago').fill('159,90'); await btn('Confirmar pagamento').click(); await waitText('Pagamento registrado');
  await btn('Ver resumo do mês').click(); await waitText('Diferença do mês');
  await waitUntil(async () => (await visibleCount('button', /^Renda comprometida em outubro: 52,7%/)) === 1, 6000);
  ok('B pagar a Internet com R$ 159,90: a linha do Resumo vai a 52,7% (R$ 3.159,90 de R$ 6.000,00)', (await visibleCount('button', rcLabel('52,7%', 'R$ 3.159,90', 'R$ 6.000,00'))) === 1);
  await rcRow().click(); await waitText('da sua renda de referência em outubro de 2026'); await p.waitForTimeout(300);
  t = await body();
  ok('B pagar a Internet: a tela mostra R$ 3.159,90, já pago R$ 2.659,90 e fora dos compromissos R$ 2.840,10', t.includes('52,7%') && t.includes('R$ 3.159,90 em contas de R$ 6.000,00') && t.includes('Já pago · R$ 2.659,90') && t.includes('Fora dos compromissos: R$ 2.840,10'));
  await btn('Voltar').click(); await waitText('Diferença do mês');
  await openToPay(); await openRow(/^Internet, paga em 07\/10\/2026/); await waitText('Desfazer pagamento');
  await btn('Desfazer pagamento').click(); await waitText('Desfazer pagamento?'); await confirmIn('Desfazer pagamento'); await waitText('Pagamento desfeito');
  await goResumo();
  await waitUntil(async () => (await visibleCount('button', /^Renda comprometida em outubro: 52,5%/)) === 1, 6000);
  ok('B desfazer o pagamento: volta a 52,5% (R$ 3.150,00)', (await visibleCount('button', rcLabel('52,5%', 'R$ 3.150,00', 'R$ 6.000,00'))) === 1);
  // Conta avulsa de R$ 300,00 que vence em 28/10: 57,5%.
  await btn('Anotar conta a pagar').click(); await waitText('Salvando em Pessoal');
  await field('Descrição').fill('Conserto da geladeira'); await field('Valor em reais').fill('300'); await field('Data de vencimento').fill('28/10/2026');
  await btn('Salvar conta a pagar').click(); await waitText('Conta a pagar salva');
  await goResumo();
  await waitUntil(async () => (await visibleCount('button', /^Renda comprometida em outubro: 57,5%/)) === 1, 6000);
  ok('B anotar a conta avulsa "Conserto da geladeira" (R$ 300,00, 28/10): 57,5% (R$ 3.450,00)', (await visibleCount('button', rcLabel('57,5%', 'R$ 3.450,00', 'R$ 6.000,00'))) === 1);
  // Referência de R$ 5.000,00 a partir de outubro: 69,0%; excluir volta a 57,5%; excluir a de setembro tira o percentual.
  await rcRow().click(); await waitText('da sua renda de referência em outubro de 2026');
  await p.getByRole('button', { name: 'Alterar', exact: true }).filter({ visible: true }).first().click(); await waitText('Valor por mês');
  await field('Valor por mês').fill('5000'); await btn('Salvar renda de referência').click(); await waitText('Renda de referência salva. Ela vale a partir de outubro.'); await waitText('69,0%');
  t = await body();
  ok('B referência de R$ 5.000,00 a partir de outubro: 69,0% e fora dos compromissos R$ 1.550,00', t.includes('69,0%') && t.includes('Fora dos compromissos: R$ 1.550,00'));
  await p.getByRole('button', { name: 'Alterar', exact: true }).filter({ visible: true }).first().click(); await waitText('Valor por mês');
  await btn('Excluir esta referência').click(); await waitText('Excluir a renda de referência de outubro?'); await confirmIn('Excluir referência'); await waitText('Renda de referência excluída.'); await waitText('57,5%');
  ok('B excluir a referência de outubro: volta a 57,5% (a de setembro)', (await body()).includes('57,5%'));
  await p.getByRole('button', { name: 'Alterar', exact: true }).filter({ visible: true }).first().click(); await waitText('Valor por mês');
  await radio('Vale a partir de setembro de 2026').click();
  t = await body();
  ok('B referência de setembro: o botão "Excluir esta referência" só aparece com referência no mês escolhido', (await visibleCount('button', 'Excluir esta referência')) === 1);
  await btn('Excluir esta referência').click(); await waitText('Excluir a renda de referência de setembro?'); await confirmIn('Excluir referência'); await waitText('Renda de referência excluída.');
  await waitText('Para ver quanto isso representa da sua renda, informe sua renda de referência.');
  t = await body();
  ok('B sem nenhuma referência: só valores em reais (R$ 3.450,00), sem percentual nem "Fora dos compromissos", com o convite "Informar renda de referência"', t.includes('Contas de outubro') && t.includes('R$ 3.450,00') && (await visibleCount('button', 'Informar renda de referência')) === 1 &&
    !/\d,\d%/.test(t.split('Próximos meses')[0]) && !t.includes('Fora dos compromissos'));
  ok('B sem nenhuma referência: composição só em reais', t.includes('Gastos fixos · R$ 2.500,00') && !/Gastos fixos · R\$ 2\.500,00 · \d/.test(t));
  await shot('107_renda_sem_referencia', true);
  await btn('Voltar').click(); await waitText('Diferença do mês');
  t = await body();
  ok('B Resumo sem referência: o convite "Veja quanto da sua renda já está comprometido" no lugar da linha', t.includes('Veja quanto da sua renda já está comprometido') && !t.includes('Renda comprometida em outubro'));
  await shot('108_resumo_sem_referencia');

  // Falha de carga: erro com "Tentar novamente", nunca 0%.
  await p.evaluate(async () => {
    const repo = await window.__e2e.repo();
    repo.__orig = repo.listIncomeReferences;
    repo.listIncomeReferences = () => Promise.reject(new Error('falha simulada'));
    await window.__e2e.refresh();
  });
  await waitText('Não foi possível calcular a renda comprometida.');
  t = await body();
  ok('B falha de carga: erro com "Tentar novamente" no Resumo, sem 0,0% nem o convite', t.includes('Não foi possível calcular a renda comprometida.') && !t.includes('0,0%') && !t.includes('Veja quanto da sua renda'));
  await shot('109_renda_falha');
  await p.evaluate(async () => { const repo = await window.__e2e.repo(); repo.listIncomeReferences = repo.__orig; await window.__e2e.refresh(); });
  await waitText('Veja quanto da sua renda já está comprometido');
  ok('B falha de carga: depois que a leitura volta, o Resumo se recompõe', (await body()).includes('Veja quanto da sua renda já está comprometido'));

  // ==================================================================================================================
  // Ciclo A2 · Ocultar valores (D-025, docs/08 §5 item 8). "Ocultar valores ao abrir" fica em Conta (e vale já, nesta
  // sessão); com valores ocultos, todo valor em reais de dados guardados vira "R$ ••••" e o leitor de tela diz "valor
  // oculto", no texto e nos nomes acessíveis. O que a pessoa digita nem os limites fixos (R$ 1,00, R$ 100,00, R$ 9.999.999,99)
  // entram. Só no aparelho: na demonstração nada é gravado. Na web não há lembretes nem biometria (conferido em Conta).
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

  await freshDemo();
  t = await body();
  ok('A2 antes de ocultar: o Resumo mostra os valores (R$ 6.000,00, R$ 3.900,00, R$ 2.100,00)', t.includes('R$ 6.000,00') && t.includes('R$ 3.900,00') && t.includes('R$ 2.100,00') && !t.includes('R$ ••••'));
  await openConta();
  ok('A2 Conta: "Ocultar valores ao abrir" desligado, sem biometria na web', (await hideSwitch().getAttribute('aria-checked')) === 'false' && (await visibleCount('switch', 'Pedir biometria ao abrir')) === 0);
  await hideSwitch().click(); await p.waitForTimeout(300);
  ok('A2 Conta: ligar "Ocultar valores ao abrir" marca o interruptor', (await hideSwitch().getAttribute('aria-checked')) === 'true');
  ok('A2 Conta com valores ocultos: nenhum valor em reais à vista', (await moneyLeaks()).length === 0, (await moneyLeaks()).slice(0, 3).join(' | '));
  await btn('Voltar').click(); await waitText('Diferença do mês');
  await hiddenShows('Resumo');
  t = await body();
  ok('A2 Resumo oculto: percentuais e datas continuam (52,5%, "até 07/10")', t.includes('52,5%') && t.includes('até 07/10'));
  const hiddenNames = await p.evaluate(() => [...document.querySelectorAll('[role=button]')].filter((e) => e.getBoundingClientRect().width > 0).map((e) => e.getAttribute('aria-label') || '').filter((l) => /valor oculto/.test(l)));
  ok('A2 Resumo oculto: os botões de totais e a linha de renda comprometida dizem "valor oculto"', hiddenNames.some((l) => /^Ainda a pagar neste mês, valor oculto/.test(l)) && hiddenNames.some((l) => /^Renda comprometida em outubro: 52,5% da renda de referência\. valor oculto/.test(l)), JSON.stringify(hiddenNames.slice(0, 5)));
  await shot('110_resumo_valores_ocultos');
  await keepText();
  // Movimentos (a lista), Contas a pagar e Renda comprometida.
  await p.getByRole('tab', { name: 'Movimentações' }).filter({ visible: true }).first().click(); await waitText('Registrar recebimento'); await waitText('Aluguel');
  await hiddenShows('Movimentos');
  await p.getByRole('tab', { name: 'Resumo' }).filter({ visible: true }).first().click(); await waitText('Diferença do mês');
  await p.getByRole('button', { name: /^Ainda a pagar neste mês, valor oculto/ }).filter({ visible: true }).first().click(); await waitText('Contas em aberto com vencimento até o fim do mês'); await waitText('Se pagar tudo o que está em aberto');
  await hiddenShows('Contas a pagar');
  ok('A2 Contas a pagar oculto: a previsão do mês também fica oculta', (await body()).includes('os pagamentos de outubro chegam a R$ ••••.'));
  await shot('111_a_pagar_valores_ocultos');
  await btn('Voltar').click(); await waitText('Diferença do mês');
  await rcRow().click(); await waitText('da sua renda de referência em outubro de 2026'); await waitText('Dezembro de 2026 ·');
  await hiddenShows('Renda comprometida');
  t = await body();
  ok('A2 Renda comprometida oculta: o percentual (52,5%) e a composição em % continuam; o medidor também fala "valor oculto"', t.includes('52,5%') && t.includes('41,7%') &&
    (await p.locator('[role=img]').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')).filter(Boolean))).some((l) => /^52,5% da renda de referência: já pago valor oculto, em aberto valor oculto\.$/.test(l)));
  await shot('112_renda_valores_ocultos');
  await btn('Voltar').click(); await waitText('Diferença do mês');
  await p.getByRole('tab', { name: 'Metas' }).filter({ visible: true }).first().click(); await waitText('Seu plano de guardar'); await waitText('Planejado: R$ ••••');
  await hiddenShows('Metas');
  const metasHiddenBars = await p.getByRole('progressbar').filter({ visible: true }).evaluateAll((els) => els.map((e) => [e.getAttribute('aria-label'), e.getAttribute('aria-valuenow'), e.getAttribute('aria-valuetext')]));
  ok('A2 Metas ocultas: a barra da reserva mantém o percentual (15%) e diz "valor oculto"', metasHiddenBars.length === 1 && metasHiddenBars[0][1] === '15' && /valor oculto/.test(metasHiddenBars[0][0]) && !/R\$/.test(metasHiddenBars[0][0] + metasHiddenBars[0][2]), JSON.stringify(metasHiddenBars));
  await shot('113_metas_valores_ocultos');
  // O olho do cabeçalho: nas telas largas ele cabe ao lado do avatar; mostra e oculta na hora, só nesta sessão.
  await p.setViewportSize({ width: 600, height: 900 }); await p.waitForTimeout(500);
  await p.getByRole('tab', { name: 'Resumo' }).filter({ visible: true }).first().click(); await waitText('Diferença do mês'); await p.waitForTimeout(300);
  ok('A2 a 600 px: o olho "Mostrar valores" aparece no cabeçalho (valores ocultos)', (await visibleCount('button', 'Mostrar valores')) === 1 && (await visibleCount('button', 'Ocultar valores')) === 0);
  await btn('Mostrar valores').click(); await p.waitForTimeout(400);
  t = await body();
  ok('A2 o olho "Mostrar valores" traz os valores de volta (R$ 6.000,00, R$ 650,00) e vira "Ocultar valores"', t.includes('R$ 6.000,00') && t.includes('R$ 650,00') && !t.includes('R$ ••••') && (await visibleCount('button', 'Ocultar valores')) === 1);
  await btn('Ocultar valores').click(); await p.waitForTimeout(400);
  await hiddenShows('Resumo (olho, 600 px)');
  await btn('Mostrar valores').click(); await p.waitForTimeout(300);
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(400);
  // De volta: o interruptor de Conta continua ligado (a preferência) e desligar mostra os valores.
  await openConta();
  await hideSwitch().click(); await p.waitForTimeout(300);
  ok('A2 Conta: desligar "Ocultar valores ao abrir" mostra os valores de novo', (await hideSwitch().getAttribute('aria-checked')) === 'false');
  await btn('Voltar').click(); await waitText('Diferença do mês'); await p.waitForTimeout(300);
  t = await body();
  ok('A2 de volta: o Resumo mostra R$ 6.000,00, R$ 3.900,00 e R$ 2.100,00, sem "R$ ••••"', t.includes('R$ 6.000,00') && t.includes('R$ 3.900,00') && t.includes('R$ 2.100,00') && !t.includes('R$ ••••') && (await moneyLeaks()).length > 0);

  // ==================================================================================================================
  // Ciclo C · Metas e reserva para imprevistos (D-027) e o plano de guardar (D-036). A demonstração tem a reserva (15%,
  // R$ 3.500,00 de R$ 22.500,00) e "Viagem de férias" (20%, R$ 480,00 por mês), com a resposta "consigo" de R$ 500,00.
  // Aportes, resgates e valorizações só mostram o que a pessoa registrou: nunca entram em Recebido nem em Pago.
  const metasTab = async () => { await p.getByRole('tab', { name: 'Metas' }).filter({ visible: true }).first().click(); await waitText('Seu plano de guardar'); await p.waitForTimeout(400); };
  const goalBars = () => p.getByRole('progressbar').filter({ visible: true }).evaluateAll((els) => els.map((e) => [e.getAttribute('aria-label'), e.getAttribute('aria-valuenow')]));
  // Com a barra inferior nas telas de consulta (D-039), a aba Metas está à mão também no detalhe da meta: um toque na aba.
  const goBackToMetas = async () => {
    for (let i = 0; i < 4 && (await visibleCount('tab', 'Metas')) === 0; i++) { await btn('Voltar').click(); await p.waitForTimeout(400); }
    await p.getByRole('tab', { name: 'Metas' }).filter({ visible: true }).first().click(); await waitText('Seu plano de guardar'); await p.waitForTimeout(400);
  };
  await freshDemo();
  await metasTab();
  ok('C Metas: reserva 15% e "Viagem de férias" 20% com as barras acessíveis', JSON.stringify(await goalBars()) === JSON.stringify([['Reserva para imprevistos: 15% da meta, R$ 3.500,00 de R$ 22.500,00.', '15']]) &&
    (await visibleCount('button', /^Viagem de férias: 20% da meta/)) === 1);
  // Aporte de R$ 200,00 na reserva: o formulário avisa que guardar não é gasto; nada muda até o servidor confirmar.
  await btn('Registrar aporte').click(); await waitText('Registre o dinheiro que você já separou'); await p.waitForTimeout(300);
  t = await body();
  ok('C aporte: "Salvando em Pessoal", "Guardar não é gasto" e "Aportes e resgates não entram em Pago nem em Recebido"', (await h1Name()) === 'Registrar aporte' && t.includes('Salvando em Pessoal') && t.includes('Guardar não é gasto: não anote este valor em Anotar gasto.') &&
    t.includes('Aportes e resgates não entram em Pago nem em Recebido: o dinheiro continua seu, só mudou de lugar.') && (await field('Data').inputValue()) === '07/10/2026');
  await keepText();
  await innerChecks('aporte 390px');
  await shot('114_aporte');
  await btn('Registrar aporte').click(); await p.waitForTimeout(300);
  ok('C aporte: sem valor, a mensagem de campo e nada gravado', (await body()).includes('Informe um valor') && (await otherDevice(async (repo, ctx) => (await repo.listGoals(ctx)).length)) === 2);
  await field('Valor').fill('200'); await btn('Registrar aporte').click(); await waitText('Aporte registrado.'); await p.waitForTimeout(700);
  t = await body();
  ok('C aporte de R$ 200,00: reserva R$ 3.700,00 (16%) e "Guardado em outubro: R$ 700,00"', t.includes('R$ 3.700,00 de R$ 22.500,00') && t.includes('16%') && t.includes('Guardado em outubro: R$ 700,00') &&
    JSON.stringify(await goalBars()) === JSON.stringify([['Reserva para imprevistos: 16% da meta, R$ 3.700,00 de R$ 22.500,00.', '16']]), JSON.stringify(await goalBars()));
  await shot('115_metas_depois_do_aporte');
  // O aporte não muda o Resumo: Recebido, Pago, Diferença e Ainda a pagar continuam iguais.
  await p.getByRole('tab', { name: 'Resumo' }).filter({ visible: true }).first().click(); await waitText('Diferença do mês');
  await expectTotals('C o aporte não muda o Resumo: 6.000 / 3.900 / 2.100 e 650', 'R$ 6.000,00', 'R$ 3.900,00', 'R$ 2.100,00', 'R$ 650,00');
  ok('C o aporte não vira gasto nem recebimento: o Resumo continua com o mesmo percentual (52,5%)', (await visibleCount('button', /^Renda comprometida em outubro: 52,5%/)) === 1);
  // A tela de renda comprometida: as linhas de Metas ficam fora do percentual.
  await rcRow().click(); await waitText('da sua renda de referência em outubro de 2026'); await waitText('Metas não entram no percentual'); await p.waitForTimeout(300);
  t = await body();
  ok('C renda comprometida: linhas de Metas (guardado R$ 700,00, planejado R$ 980,00 por mês, fora depois do planejado R$ 1.870,00) fora do percentual (52,5%)',
    t.includes('Guardado em metas em outubro: R$ 700,00') && t.includes('Planejado para metas: R$ 980,00 por mês') && t.includes('Fora dos compromissos depois do planejado: R$ 1.870,00') &&
    t.includes('Metas não entram no percentual: guardar não é conta a pagar.') && t.includes('52,5%') && t.includes('Fora dos compromissos: R$ 2.850,00'));
  await keepText();
  await btn('Voltar').click(); await waitText('Diferença do mês');
  // Detalhe da reserva, resgate retroativo recusado com a data e valor atualizado.
  await metasTab(); await btn('Ver detalhes').click(); await waitText('Registrar resgate'); await p.waitForTimeout(400);
  t = await body();
  ok('C detalhe da reserva: R$ 3.700,00, "Faltam R$ 18.800,00", cobre 0,9 mês, composição (inicial R$ 3.000,00, aportes R$ 700,00, resgates R$ 0,00) e o aviso de que não entra em Pago nem em Recebido',
    t.includes('R$ 3.700,00') && t.includes('de R$ 22.500,00 · 16%') && t.includes('Faltam R$ 18.800,00') && t.includes('Já guardado ao criar: R$ 3.000,00') && t.includes('Aportes: R$ 700,00') && t.includes('Resgates: R$ 0,00') &&
    t.includes('Aportes e resgates não entram em Pago nem em Recebido: o dinheiro continua seu, só mudou de lugar.') && t.includes('07/10 · Aporte · + R$ 200,00'));
  await shot('116_detalhe_reserva');
  await btn('Registrar resgate').click(); await waitText('Resgate não é renda'); await p.waitForTimeout(300);
  ok('C resgate: "Resgate não é renda: ele diminui o valor guardado e não entra em Recebido."', (await body()).includes('Resgate não é renda: ele diminui o valor guardado e não entra em Recebido. Se usou o dinheiro, anote o gasto normalmente.'));
  await field('Valor').fill('3100'); await field('Data').fill('03/10/2026'); await btn('Registrar resgate').click(); await p.waitForTimeout(500);
  t = await body();
  ok('C resgate retroativo recusado: "o valor guardado ficaria negativo em 03/10/2026" (mesmo com R$ 3.700,00 guardados hoje), nada gravado', t.includes('Com este resgate, o valor guardado ficaria negativo em 03/10/2026. Confira o valor e a data.') && (await h1Name()) === 'Registrar resgate');
  await shot('117_resgate_recusado');
  await field('Data').fill('07/10/2026'); await field('Valor').fill('100'); await btn('Registrar resgate').click(); await waitText('Resgate registrado.'); await p.waitForTimeout(600);
  t = await body();
  ok('C resgate de R$ 100,00 hoje: guardado R$ 3.600,00 e "Resgates: R$ 100,00"', t.includes('R$ 3.600,00') && t.includes('Resgates: R$ 100,00'));
  await btn('Atualizar valor guardado').click(); await waitText('Quanto há guardado hoje'); await p.waitForTimeout(300);
  await field('Quanto há guardado hoje para esta meta, segundo o seu banco ou aplicação?').fill('3737,20'); await p.waitForTimeout(400);
  t = await body();
  ok('C atualizar valor guardado: a diferença (R$ 137,20) vira "Registrar valorização" e nunca vira aporte', (await visibleCount('button', /^Registrar valorização de/)) === 1 && t.includes('R$ 137,20'));
  await keepText();
  await shot('118_atualizar_valor');
  await btn('Registrar valorização de R$ 137,20').click(); await waitText('Valorização registrada.'); await p.waitForTimeout(600);
  t = await body();
  ok('C valorização registrada: guardado R$ 3.737,20 e "Rendimentos e valorizações: R$ 137,20", aportes e resgates intactos', t.includes('R$ 3.737,20') && t.includes('Rendimentos e valorizações: R$ 137,20') && t.includes('Aportes: R$ 700,00') && t.includes('Resgates: R$ 100,00'));
  // Valores ocultos: o botão de "Atualizar valor guardado" não mostra a diferença e o leitor de tela diz "valor oculto".
  await goBackToMetas();
  await openConta(); await hideSwitch().click(); await p.waitForTimeout(300);
  await btn('Voltar').click(); await waitText('Seu plano de guardar'); await p.waitForTimeout(300);
  await btn('Ver detalhes').click(); await waitText('Registrar resgate'); await p.waitForTimeout(400);
  await btn('Atualizar valor guardado').click(); await waitText('Quanto há guardado hoje'); await p.waitForTimeout(300);
  await field('Quanto há guardado hoje para esta meta, segundo o seu banco ou aplicação?').fill('3800'); await p.waitForTimeout(400);
  t = await body();
  ok('C valores ocultos: "Registrar valorização de R$ ••••" na tela e "valor oculto" no nome acessível, sem a diferença (R$ 62,80)', (await visibleCount('button', 'Registrar valorização de valor oculto')) === 1 && t.includes('Registrar valorização de R$ ••••') && !t.includes('R$ 62,80'), t.split('\n').filter((l) => /valorização/.test(l)).join(' | '));
  await btn('Cancelar').click(); await p.waitForTimeout(400); if (await visibleCount('button', 'Descartar alterações')) await btn('Descartar alterações').click();
  await p.waitForTimeout(300);
  await goBackToMetas();
  await openConta(); await hideSwitch().click(); await p.waitForTimeout(300);
  ok('C valores ocultos desligados de novo em Conta', (await hideSwitch().getAttribute('aria-checked')) === 'false');
  await btn('Voltar').click(); await waitText('Seu plano de guardar'); await p.waitForTimeout(300);
  await goBackToMetas();
  await p.getByRole('tab', { name: 'Resumo' }).filter({ visible: true }).first().click(); await waitText('Diferença do mês');
  await expectTotals('C aporte, resgate e valorização não mudam o Resumo: 6.000 / 3.900 / 2.100 e 650', 'R$ 6.000,00', 'R$ 3.900,00', 'R$ 2.100,00', 'R$ 650,00');

  // Plano de guardar: "Ver o plano" com as etapas; mudar para R$ 300,00 por mês e usar a etapa de 3 meses.
  await metasTab(); await btn('Ver o plano').click(); await waitText('Etapas do plano'); await p.waitForTimeout(500);
  t = await body();
  ok('C plano de guardar: R$ 500,00 por mês, etapas de 1, 3 e 6 meses e "Viagem de férias", "Sem contar rendimentos" e a fonte da CVM', (await h1Name()) === 'Seu plano de guardar' && (await field('Quanto você consegue guardar por mês?').inputValue()) === '500,00' &&
    t.includes('Fora dos compromissos em outubro: R$ 2.850,00. Não é saldo: ainda precisa cobrir gastos do dia a dia.') && t.includes('1 mês dos seus gastos essenciais') && t.includes('3 meses dos seus gastos essenciais') && t.includes('6 meses dos seus gastos essenciais') &&
    t.includes('Viagem de férias') && t.includes('Sem contar rendimentos.') && t.includes('Fonte: CVM, Portal do Investidor'));
  await keepText();
  await innerChecks('plano de guardar 390px');
  await shot('119_plano_de_guardar');
  await p.setViewportSize({ width: 320, height: 800 }); await p.waitForTimeout(400);
  await innerChecks('plano de guardar 320px');
  await shot('119_plano_de_guardar_320px', true);
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(300);
  await field('Quanto você consegue guardar por mês?').fill('300'); await p.waitForTimeout(400);
  await radio('Etapa de 3 meses dos gastos essenciais').click(); await p.waitForTimeout(300);
  t = await body();
  ok('C plano com R$ 300,00 por mês: "a segunda etapa (R$ 11.250,00, 3 meses dos seus gastos essenciais) chega em dezembro de 2028." e o que a reserva passa a ter', t.includes('Com R$ 300,00 por mês, a segunda etapa (R$ 11.250,00, 3 meses dos seus gastos essenciais) chega em dezembro de 2028.') &&
    t.includes('A Reserva para imprevistos passa a ter alvo de R$ 11.250,00 (3 meses dos seus gastos essenciais), com R$ 300,00 por mês planejados.') && t.includes('Depois, o mesmo valor pode ir para as suas metas.') && !NO_BALANCE.test(t));
  await btn('Usar este plano').click(); await waitText('Plano salvo na sua reserva.'); await p.waitForTimeout(700);
  t = await body();
  ok('C usar o plano: Metas mostra "Você planeja guardar R$ 300,00 por mês." e a reserva com alvo de R$ 11.250,00 e R$ 300,00 por mês', new URL(p.url()).pathname === '/metas' && t.includes('Você planeja guardar R$ 300,00 por mês.') && t.includes('Planejado: R$ 300,00 por mês') && t.includes('de R$ 11.250,00'));
  await shot('120_metas_plano_usado');
  // "Mudar valor": um novo valor mantém o plano.
  await btn('Mudar valor').click(); await waitText('Quanto você consegue guardar por mês?'); await p.waitForTimeout(300);
  ok('C "Mudar valor" abre o plano com o valor atual (R$ 300,00)', (await field('Quanto você consegue guardar por mês?').inputValue()) === '300,00');
  await btn('Cancelar').click(); await p.waitForTimeout(400); if (await visibleCount('button', 'Descartar alterações')) await btn('Descartar alterações').click();
  await waitText('Seu plano de guardar');

  // Renda de referência mudou depois de "consigo": a pergunta volta, e "Manter o valor" grava de novo o mesmo valor.
  await otherDevice(async (repo, ctx) => {
    const refs = await repo.listIncomeReferences(ctx);
    const last = refs[refs.length - 1];
    await repo.setIncomeReference(`e2e-${Math.random()}`, ctx, last.fromMonth, last.version, last.amountCents + 50000, last.varies);
  });
  await waitText('Sua renda de referência mudou. Quer rever quanto guardar por mês?', 6000);
  t = await body();
  ok('C a renda de referência mudou: a pergunta "Sua renda de referência mudou. Quer rever quanto guardar por mês?" volta com "Manter o valor" e "Mudar valor" (sem "Responder depois")',
    (await visibleCount('button', 'Manter o valor')) === 1 && (await visibleCount('button', 'Mudar valor')) === 1 && (await visibleCount('button', 'Responder depois')) === 0, t.slice(0, 300));
  await shot('121_renda_de_referencia_mudou');
  await btn('Manter o valor').click(); await waitText('Valor por mês mantido.'); await p.waitForTimeout(500);
  // A resposta nova vale a partir de agora (um relógio só): a pergunta some depois de "Manter o valor".
  const savingsNow = await otherDevice(async (repo, ctx) => { const c = await repo.getSavingsCheck(ctx); return c === null ? null : { answer: c.answer, monthlyCents: c.monthlyCents, version: c.version }; });
  t = await body();
  ok('C "Manter o valor": grava de novo "consigo" com o mesmo valor (R$ 300,00) e o plano continua', savingsNow !== null && savingsNow.answer === 'consigo' && savingsNow.monthlyCents === 30000 && savingsNow.version >= 3 && t.includes('Você planeja guardar R$ 300,00 por mês.'), JSON.stringify(savingsNow));
  ok('C "Manter o valor": a pergunta "Sua renda de referência mudou" some e os botões também', !t.includes('Sua renda de referência mudou. Quer rever quanto guardar por mês?') && (await visibleCount('button', 'Manter o valor')) === 0, t.slice(0, 300));
  // Nova mudança da renda: "Mudar valor" com o mesmo valor (R$ 300,00) também grava e a pergunta some.
  await otherDevice(async (repo, ctx) => {
    const refs = await repo.listIncomeReferences(ctx);
    const last = refs[refs.length - 1];
    await repo.setIncomeReference(`e2e-${Math.random()}`, ctx, last.fromMonth, last.version, last.amountCents - 50000, last.varies);
  });
  await waitText('Sua renda de referência mudou. Quer rever quanto guardar por mês?', 6000);
  await btn('Mudar valor').click(); await waitText('Quanto você consegue guardar por mês?'); await p.waitForTimeout(400);
  const versionBeforeChange = savingsNow === null ? 0 : savingsNow.version;
  if ((await visibleCount('button', 'Usar este plano')) > 0) await btn('Usar este plano').click(); else await btn('Salvar valor por mês').click();
  await waitUntil(async () => new URL(p.url()).pathname === '/metas', 8000); await p.waitForTimeout(700);
  const savingsChanged = await otherDevice(async (repo, ctx) => { const c = await repo.getSavingsCheck(ctx); return c === null ? null : { answer: c.answer, monthlyCents: c.monthlyCents, version: c.version }; });
  t = await body();
  ok('C "Mudar valor" com o mesmo valor depois da renda mudar: grava uma versão nova e a pergunta some', savingsChanged !== null && savingsChanged.monthlyCents === 30000 && savingsChanged.version > versionBeforeChange &&
    !t.includes('Sua renda de referência mudou. Quer rever quanto guardar por mês?') && (await visibleCount('button', 'Mudar valor')) === 1, JSON.stringify(savingsChanged));

  // Nova meta, editar, concluir, arquivar e excluir (uma meta de R$ 100,00 já alcançada).
  await btn('Nova meta').click(); await waitText('Modelo de nome'); await p.waitForTimeout(300);
  await btn('Criar meta').click(); await p.waitForTimeout(300);
  ok('C nova meta: sem nome nem valor, as duas mensagens de campo', (await body()).includes('Dê um nome de 1 a 40 caracteres.') && /Informe (um|o) valor/.test(await body()), (await body()).split('\n').filter((l) => /nome|valor/i.test(l)).slice(0, 6).join(' | '));
  await radio('Estudos').click(); await field('Valor da meta').fill('100'); await field('Quanto você já tem guardado para isso? (opcional)').fill('100'); await p.waitForTimeout(300);
  ok('C nova meta: a prévia diz que a meta já está alcançada', (await body()).includes('Com o que você já tem guardado, a meta já está alcançada.'));
  await btn('Criar meta').click(); await waitText('Meta criada.'); await p.waitForTimeout(500);
  t = await body();
  ok('C meta já alcançada: "Meta alcançada" com 100%, nunca 100% antes de alcançar, e o botão "Concluir meta"', t.includes('100%') && (await visibleCount('button', 'Concluir meta')) === 1);
  await shot('122_meta_alcancada');
  await btn('Concluir meta').click(); await waitText('Meta concluída.');
  await btn('Mais ações').click(); await p.getByRole('alert').getByRole('button', { name: 'Excluir meta' }).last().click(); await p.waitForTimeout(300);
  ok('C excluir meta: o diálogo avisa que os movimentos também saem', /movimentos/i.test(await dialogText()), (await dialogText()).slice(0, 200));
  await p.getByRole('alert').getByRole('button', { name: 'Excluir meta' }).last().click(); await waitText('Meta excluída.'); await p.waitForTimeout(500);
  ok('C meta excluída: some de Metas', !(await body()).includes('Estudos') && (await otherDevice(async (repo, ctx) => (await repo.listGoals(ctx)).length)) === 2);

  // Conta nova: "Sim, consigo" cria a reserva pelo plano.
  const newAcct = async (name, email) => {
    await p.goto(`http://localhost:${PORT}/`); await waitText('Seu dinheiro');
    await btn('Criar conta').click(); await waitText('Nome de apresentação');
    await field('Nome de apresentação').fill(name); await field('E-mail').fill(email); await field('Senha').fill('senha1234');
    await btn('Criar conta').click(); await waitText('Confira seu e-mail');
    await btn('Simular abertura do link').click(); await btn('Já confirmei meu e-mail').click(); await waitText('Sua primeira conta');
    await btn('Começar meu mês').click(); await waitText('Diferença do mês');
  };
  await newAcct('Cris Teste', 'cris@exemplo.com');
  await p.getByRole('tab', { name: 'Metas' }).filter({ visible: true }).first().click(); await waitText('Você consegue guardar algum valor por mês?'); await p.waitForTimeout(400);
  t = await body();
  ok('C conta nova: Metas começa com a pergunta, sem metas, sem reserva e sem números de exemplo', t.includes('Só você vê esta resposta.') && t.includes('Nenhuma meta ainda') && t.includes('Calcular minha reserva') && t.includes('Guardado em outubro: R$ 0,00'));
  ok('C conta nova: nenhuma meta nem reserva de exemplo', (await otherDevice(async (repo, ctx) => (await repo.listGoals(ctx)).length)) === 0 && !t.includes('Viagem de férias'));
  await btn('Sim, consigo').click(); await waitText('Quanto você consegue guardar por mês?'); await p.waitForTimeout(500);
  t = await body();
  ok('C "Sim, consigo": campo de valor com a dica (R$ 1,00 a R$ 9.999.999,99), privacidade e o pedido dos gastos essenciais (conta nova, nada calculável)', (await h1Name()) === 'Seu plano de guardar' && t.includes('De R$ 1,00 a R$ 9.999.999,99.') && t.includes('Sua resposta e as datas de volta ficam só com você.') &&
    t.includes('Informe quanto você gasta por mês com moradia, mercado, transporte, saúde e educação.'));
  await field('Quanto você consegue guardar por mês?').fill('400'); await field('Gastos essenciais por mês').fill('2000'); await p.waitForTimeout(500);
  t = await body();
  ok('C "Sim, consigo" com R$ 400,00 e essenciais de R$ 2.000,00: a primeira etapa (R$ 2.000,00, 1 mês dos seus gastos essenciais) com o mês previsto',
    /Com R\$ 400,00 por mês, a (primeira|segunda|terceira) etapa \(R\$ (2\.000,00, 1 mês|6\.000,00, 3 meses|12\.000,00, 6 meses) dos seus gastos essenciais\) chega em \S+ de 20\d\d\./.test(t) && t.includes('Etapas do plano'));
  await shot('123_guardar_conta_nova');
  await btn('Cancelar').click(); await waitText('Descartar'); await p.waitForTimeout(300);
  ok('C sair do plano com o que foi digitado pede confirmação ("Continuar editando")', (await visibleCount('button', 'Continuar editando')) === 1);
  await confirmIn('Continuar editando'); await p.waitForTimeout(300);
  await radio('Etapa de 3 meses dos gastos essenciais').click();
  await btn('Usar este plano').click(); await waitText('Plano salvo na sua reserva.'); await p.waitForTimeout(700);
  t = await body();
  ok('C "Usar este plano": a reserva nasce com alvo de R$ 6.000,00 (3 × R$ 2.000,00), R$ 0,00 guardado, R$ 400,00 por mês, e o card vira o plano', t.includes('R$ 0,00 de R$ 6.000,00') && t.includes('Planejado: R$ 400,00 por mês') && t.includes('Você planeja guardar R$ 400,00 por mês.') && !t.includes('Você consegue guardar algum valor por mês?'), t.slice(0, 400));
  await shot('124_metas_reserva_pelo_plano');
  await p.getByRole('tab', { name: 'Resumo' }).filter({ visible: true }).first().click(); await waitText('Diferença do mês'); await p.waitForTimeout(500);
  t = await body();
  ok('C "Sim, consigo" conta como o 4º passo: o Resumo da conta nova mostra "Planejar quanto guardar" concluído', t.includes('Planejar quanto guardar') && (await visibleCount('button', /^Planejar quanto guardar, concluído\./)) === 1, t.slice(0, 300));

  // Conta nova: a calculadora da reserva leva os números para "Criar reserva".
  await newAcct('Davi Teste', 'davi@exemplo.com');
  await p.getByRole('tab', { name: 'Metas' }).filter({ visible: true }).first().click(); await waitText('Você consegue guardar algum valor por mês?');
  await p.getByRole('button', { name: /^Calculadoras\./ }).filter({ visible: true }).first().click(); await waitUntil(async () => (await h1Name()) === 'Calculadoras', 8000);
  await openCalc('Reserva para imprevistos');
  await typeIn('Gastos essenciais por mês', '3.750,00'); await radio('6 meses').click(); await typeIn('Quanto já tem guardado', '3.500,00'); await typeIn('Quanto guarda por mês', '500,00');
  ok('C calculadora da reserva (conta sem reserva): 22.500,00 e o botão "Criar reserva"', (await shows('Com estes números, a reserva de 6 meses é de R$ 22.500,00.')) && (await visibleCount('button', 'Criar reserva')) === 1 && (await visibleCount('button', 'Salvar na minha reserva')) === 0);
  await calcShot('125_calc_reserva_criar');
  await btn('Criar reserva').click(); await waitText('Seus gastos essenciais por mês'); await p.waitForTimeout(500);
  t = await body();
  ok('C "Criar reserva" abre /reserva com os números da calculadora (3.750,00, 6 meses, 3.500,00 guardados e 500,00 por mês) e o valor da reserva', new URL(p.url()).pathname === '/reserva' && t.includes('Seus gastos essenciais por mês') && t.includes('R$ 3.750,00') &&
    (await radio('6 meses').getAttribute('aria-checked')) === 'true' && t.includes('Valor da reserva: R$ 22.500,00 (6 × R$ 3.750,00)') && t.includes('A reserva para imprevistos é para emergências. Para aproveitar oportunidades, crie uma meta separada.') &&
    t.includes('O Clarevo não guarda nem aplica dinheiro e não indica produtos, bancos ou aplicações.'), new URL(p.url()).pathname);
  await keepText();
  await innerChecks('reserva 390px');
  await shot('126_reserva');
  await p.setViewportSize({ width: 320, height: 800 }); await p.waitForTimeout(400);
  await innerChecks('reserva 320px');
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(300);
  ok('C /reserva: ainda não criou nada (nada é gravado ao abrir)', (await otherDevice(async (repo, ctx) => (await repo.listGoals(ctx)).length)) === 0);
  await btn('Criar reserva').click(); await waitText('Reserva criada.'); await p.waitForTimeout(700);
  t = await body();
  ok('C reserva criada pela calculadora: R$ 3.500,00 de R$ 22.500,00 (15%), cobre 0,9 mês dos gastos essenciais e planejado R$ 500,00 por mês', t.includes('R$ 3.500,00 de R$ 22.500,00') && t.includes('15%') && t.includes('Cobre 0,9 mês dos seus gastos essenciais') && t.includes('Planejado: R$ 500,00 por mês'), t.slice(0, 400));
  await scrollTo('Reserva para imprevistos');
  await shot('127_metas_reserva_criada');
  // Dica de poupança no formulário de gasto: guardar não é gasto, com o atalho para Metas.
  await p.getByRole('tab', { name: 'Resumo' }).filter({ visible: true }).first().click(); await waitText('Diferença do mês');
  await btn('Anotar gasto').click(); await waitText('Será salvo em'); await field('Descrição').fill('Aporte reserva'); await p.waitForTimeout(400);
  t = await body();
  ok('C Anotar gasto: ao digitar "Aporte reserva", a dica "Dinheiro guardado não é gasto" com o atalho para Metas', t.includes('Dinheiro guardado não é gasto') && (await visibleCount('button', /Ir para Metas|Registrar aporte/)) >= 1, t.split('\n').filter((l) => /guardado|Metas/.test(l)).join(' | '));
  await keepText();
  await shot('128_dica_poupanca_gasto');
  await btn('Cancelar').click(); await p.waitForTimeout(400); if (await visibleCount('button', 'Descartar alterações')) await btn('Descartar alterações').click();
  await waitText('Diferença do mês');

  // ==================================================================================================================
  // Ciclo D · Simulador (D-028): só simulação, sem produto, banco nem taxa sugerida. A taxa é sempre digitada (campo vazio
  // por padrão, sem exemplo), os aportes são no INÍCIO de cada mês (decisão de Enzo, 09/10/2026, como na Calculadora do
  // Cidadão do Banco Central) e o resultado vem com o "sem rendimento" ao lado. Nada é gravado ao digitar nem ao simular;
  // só "Criar meta com estes valores" abre o formulário de meta, que continua precisando de "Criar meta".
  const SIM_DISCLAIMER = 'Simulação com as hipóteses que você informou. Não é promessa de rendimento nem recomendação de investimento.';
  const SIM_INTRO = 'Faça contas com hipóteses suas. Nada aqui é gravado até você escolher criar uma meta.';
  const inView = (text) => p.evaluate((x) => {
    const els = [...document.querySelectorAll('div,span')].filter((e) => e.children.length === 0 && (e.textContent || '').includes(x));
    return els.some((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.top >= 0 && r.bottom <= window.innerHeight; });
  }, text);
  const simRate = () => field('Taxa de rendimento ao ano (%)');
  const simulate = async () => { await btn('Simular').click(); await p.waitForTimeout(250); };
  const formValues = () => p.locator('input').evaluateAll((els) => els.filter((e) => e.getBoundingClientRect().width > 0).map((e) => `${e.getAttribute('aria-label')}=${e.value}`));
  const goalCount = () => otherDevice(async (repo, ctx) => (await repo.listGoals(ctx)).length);

  await freshDemo();
  const simSnapBefore = await repoSnapshot();
  const simStorageBefore = await storageNow();
  const simWritesBefore = writes.length;
  const simGoalsBefore = await goalCount();
  await metasTab();
  ok('D Metas: a linha "Simular um plano" com a legenda', (await visibleCount('button', 'Simular um plano. Quanto guardar por mês, em quanto tempo e quanto você pode ter, com hipóteses suas.')) === 1);
  await p.getByRole('button', { name: /^Simular um plano\./ }).filter({ visible: true }).first().click(); await waitText('Faça contas com hipóteses suas'); await p.waitForTimeout(500);
  // Abertura a 360 x 640: o aviso fixo e a introdução ficam à vista sem rolar; as hipóteses estão na tela, com a taxa "a que você informar".
  await p.setViewportSize({ width: 360, height: 640 }); await p.waitForTimeout(500);
  ok('D abertura a 360 px: o aviso "Simulação com as hipóteses que você informou. Não é promessa de rendimento nem recomendação de investimento." e a introdução à vista, sem rolar', (await inView(SIM_DISCLAIMER)) === true && (await inView(SIM_INTRO)) === true);
  await shot('129_simular_abertura_360px');
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(400);
  t = await body();
  ok('D abertura: título "Simular um plano", sem pílula de contexto, e nenhum campo antes de escolher o modo', (await h1Name()) === 'Simular um plano' && (await visibleCount('radio', 'Quanto guardar por mês')) === 1 && !t.includes('Quanto quer juntar'));
  ok('D abertura: as hipóteses já visíveis, com aportes no início de cada mês e a taxa "a que você informar"', t.includes('Hipóteses') && t.includes('Aportes no início de cada mês, como na Calculadora do Cidadão do Banco Central.') &&
    t.includes('Taxa de rendimento: a que você informar, constante no período.') && t.includes('Escolha o que quer saber, preencha os campos e toque em Simular.') && !t.includes('Criar meta com estes valores'));
  await simulate();
  ok('D "Simular" sem escolher o modo: só "Escolha o que você quer saber."', (await body()).includes('Escolha o que você quer saber.') && !(await body()).includes('Digite a taxa'));
  await radio('Quanto guardar por mês').click(); await waitText('Quanto quer juntar'); await p.waitForTimeout(300);
  t = await body();
  ok('D modo "Quanto guardar por mês": campos de alvo, já tem, meses e taxa; sem o campo do aporte', t.includes('Quanto quer juntar') && t.includes('Quanto já tem (opcional)') && t.includes('Em quantos meses') && t.includes('Taxa de rendimento ao ano (%)') && !t.includes('Quanto vai guardar por mês'));
  ok('D a taxa vem vazia, sem exemplo, e a dica diz que o Clarevo não sugere taxas, produtos nem instituições', (await simRate().inputValue()) === '' && ((await simRate().getAttribute('placeholder')) || '') === '' &&
    t.includes('Você informa a taxa que quer testar. O Clarevo não sugere taxas, produtos nem instituições.'));
  await simulate(); await waitText('Digite quanto quer juntar');
  t = await body();
  ok('D campos vazios: os três erros ("Digite quanto quer juntar, como 22.500,00.", meses e a taxa) e nenhum resultado com rendimento', t.includes('Digite quanto quer juntar, como 22.500,00.') && t.includes('Digite em quantos meses, de 1 a 600.') &&
    t.includes('Digite a taxa ao ano que quer testar, de 0% a 30%.') && !t.includes('por mês na hipótese informada'));
  ok('D o foco vai ao primeiro campo com erro', (await p.evaluate(() => document.activeElement && (document.activeElement.getAttribute('aria-label') || ''))) === 'Quanto quer juntar');
  await shot('130_simular_erros');
  await field('Quanto quer juntar').fill('22500'); await field('Quanto já tem (opcional)').fill('4500'); await field('Em quantos meses').fill('14');
  // Sem taxa (campo vazio), só o aviso da taxa: nunca um resultado com rendimento, nem o "sem rendimento" apresentado como resultado.
  await simulate();
  t = await body();
  ok('D taxa vazia: só o erro da taxa; nada de resultado com rendimento (nem R$ 1.175,15)', t.includes('Digite a taxa ao ano que quer testar, de 0% a 30%.') && !t.includes('por mês na hipótese informada') && !t.includes('R$ 1.175,15'));
  await simRate().fill('30,01'); await simulate(); await waitText('Use uma taxa de 0% a 30% ao ano, com até 2 casas.');
  ok('D taxa 30,01 recusada', true);
  await simRate().fill('10'); await field('Quanto quer juntar').blur();
  ok('D os valores em reais são formatados ao sair do campo (22.500,00 e 4.500,00)', (await field('Quanto quer juntar').inputValue()) === '22.500,00' && (await field('Quanto já tem (opcional)').inputValue()) === '4.500,00');
  ok('D digitar a taxa atualiza a hipótese ao vivo: "Taxa de 10% ao ano (0,80% ao mês, taxa equivalente), constante no período."', (await body()).includes('Taxa de 10% ao ano (0,80% ao mês, taxa equivalente), constante no período.'));
  await simulate(); await waitText('por mês na hipótese informada'); await p.waitForTimeout(400);
  t = await body();
  ok('D quanto guardar: "Para juntar R$ 22.500,00 em 14 meses, começando com R$ 4.500,00:" R$ 1.175,15 por mês na hipótese informada', t.includes('Para juntar R$ 22.500,00 em 14 meses, começando com R$ 4.500,00:') && t.includes('R$ 1.175,15 por mês na hipótese informada'));
  ok('D quanto guardar: o "sem rendimento" ao lado (R$ 1.285,72 por mês) igual ao da calculadora', t.includes('Sem rendimento, seriam R$ 1.285,72 por mês.'));
  ok('D resultado: ano a ano (Aportado e Rendimento na hipótese), "Ver tabela ano a ano" e "Criar meta com estes valores" com a dica de que a taxa não é gravada', t.includes('Ano a ano') && t.includes('Aportado') && t.includes('Rendimento na hipótese') && t.includes('Ver tabela ano a ano') && t.includes('Criar meta com estes valores') && t.includes('A taxa não é gravada'));
  ok('D resultado: não há "Simular" nem aviso depois do resultado que prometa rendimento', !/garant|promet[ei]\w* (que|rendimento)/i.test(t.replace(SIM_DISCLAIMER, '')) && !FORBIDDEN.test(t));
  await keepText();
  const simTitles = (await headingList());
  ok('D títulos: "Simular um plano" (1), "Resultado" (2) e "Hipóteses" (3)', simTitles.includes('1:Simular um plano') && simTitles.includes('2:Resultado') && simTitles.includes('3:Hipóteses'), JSON.stringify(simTitles));
  ok('D a região viva do resultado tem o texto do resultado', (await liveText()).includes('R$ 1.175,15 por mês na hipótese informada'));
  ok('D o aviso "Não é promessa de rendimento nem recomendação de investimento" fica dentro do cartão do resultado (região viva) e à vista', (await liveText()).includes(SIM_DISCLAIMER) && (await body()).split(SIM_DISCLAIMER).length - 1 >= 2);
  await calcHeader('simulador 390px', 'Simular um plano');
  await layoutChecks('simulador 390px');
  ok('simulador: sem o símbolo C', (await symbolCount()) === 0);
  await calcShot('131_simular_resultado');
  await btn('Ver tabela ano a ano').click(); await waitText('Ocultar tabela ano a ano'); await p.waitForTimeout(300);
  t = await body();
  ok('D tabela ano a ano: 2 anos, o segundo parcial (até o mês 14), com o total na hipótese', t.includes('Ano 1') && t.includes('Ano 2 (até o mês 14)') && t.includes('Total na hipótese'));
  ok('D a tabela abre com aria-expanded e as linhas não são paradas de tabulação', (await p.getByRole('button', { name: 'Ocultar tabela ano a ano' }).filter({ visible: true }).first().getAttribute('aria-expanded')) === 'true' &&
    (await p.evaluate(() => [...document.querySelectorAll('[tabindex="0"]')].filter((e) => /^Ano \d+:/.test(e.getAttribute('aria-label') || '')).length)) === 0);
  await keepText();
  await shot('132_simular_tabela');
  await p.setViewportSize({ width: 320, height: 800 }); await p.waitForTimeout(400);
  await calcHeader('simulador 320px', 'Simular um plano');
  await layoutChecks('simulador 320px');
  await shot('132_simular_tabela_320px', true);
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(300);
  await btn('Ocultar tabela ano a ano').click();
  // Mudar qualquer campo tira o resultado (nunca números velhos ao lado de campos novos).
  await field('Em quantos meses').fill('15'); await p.waitForTimeout(250);
  ok('D mudar um campo tira o resultado e deixa o texto de espera', !(await body()).includes('por mês na hipótese informada') && (await body()).includes('Escolha o que quer saber'));
  await field('Em quantos meses').fill('14'); await simulate(); await waitText('por mês na hipótese informada');
  // Criar meta: abre o formulário de meta preenchido, sem a taxa no endereço e sem gravar nada.
  const goalsBeforeCreate = await goalCount();
  await btn('Criar meta com estes valores').click(); await waitText('Modelo de nome'); await p.waitForTimeout(500);
  const metaVals = await formValues();
  ok('D "Criar meta com estes valores": /meta/nova com valor 22.500,00, prazo 11/2027, já guardado 4.500,00 e plano de 1.175,15; nome em branco', new URL(p.url()).pathname === '/meta/nova' &&
    metaVals.some((v) => v === 'Valor da meta=22.500,00') && metaVals.some((v) => v.endsWith('=11/2027')) && metaVals.some((v) => v.endsWith('=4.500,00')) && metaVals.some((v) => v.endsWith('=1.175,15')) && metaVals.some((v) => /^Nome da meta=$/.test(v)), JSON.stringify(metaVals));
  ok('D a taxa nunca vai para o endereço nem para a meta', !/taxa|rate|inflac|inflation/i.test(p.url()), p.url());
  await shot('133_simular_criar_meta');
  ok('D abrir o formulário de meta não grava nada (metas continuam em 2)', (await goalCount()) === goalsBeforeCreate && goalsBeforeCreate === 2);
  await btn('Voltar').click(); await p.waitForTimeout(500);
  if (await visibleCount('button', /Descartar|Sair/)) await p.getByRole('button', { name: /Descartar|Sair/ }).filter({ visible: true }).first().click().catch(() => {});
  await p.waitForTimeout(400);
  ok('D voltar leva ao simulador com tudo preenchido', (await body()).includes('Simular um plano') && (await field('Quanto quer juntar').inputValue()) === '22.500,00');

  // Em quanto tempo: R$ 1.000,00 por mês chega em 17 meses com 10% ao ano; sem rendimento, 18.
  await radio('Em quanto tempo').click(); await field('Quanto vai guardar por mês').fill('1000'); await simRate().fill('10'); await simulate(); await waitText('meses sem rendimento');
  t = await body();
  ok('D em quanto tempo: "Com R$ 1.000,00 por mês: 17 meses na hipótese informada; 18 meses sem rendimento."', t.includes('Para juntar R$ 22.500,00, começando com R$ 4.500,00:') && t.includes('Com R$ 1.000,00 por mês: 17 meses na hipótese informada; 18 meses sem rendimento.'));
  await shot('134_simular_em_quanto_tempo');
  await simRate().fill('0'); await simulate();
  ok('D taxa 0: 18 meses nos dois e "Taxa de 0% ao ano: sem rendimento."', /18 meses na hipótese informada; 18 meses sem rendimento\./.test(await body()) && (await body()).includes('Taxa de 0% ao ano: sem rendimento.'));
  await field('Quanto quer juntar').fill('9999999,99'); await field('Quanto vai guardar por mês').fill('0,01'); await simRate().fill('10'); await simulate();
  t = await body();
  ok('D meta que não chega em 50 anos: o texto, sem gráfico e sem "Criar meta com estes valores"', t.includes('a meta não é alcançada em 50 anos na hipótese informada') && !t.includes('Ano a ano') && !t.includes('Criar meta com estes valores'));
  await field('Quanto quer juntar').fill('4500'); await field('Quanto vai guardar por mês').fill('1000'); await simulate();
  t = await body();
  ok('D já tem o valor: o texto, sem gráfico e sem "Criar meta com estes valores"', t.includes('você já tem o valor que quer juntar') && !t.includes('Ano a ano') && !t.includes('Criar meta com estes valores'));

  // Quanto posso ter: R$ 1.000,00 por mês, 14 meses e R$ 4.500,00 iniciais viram R$ 19.896,17 (aportes no início de cada mês).
  await radio('Quanto posso ter').click(); await field('Quanto já tem (opcional)').fill('4500'); await field('Em quantos meses').fill('14'); await field('Quanto vai guardar por mês').fill('1000'); await simRate().fill('10'); await simulate();
  await waitText('Na hipótese informada'); await p.waitForTimeout(300);
  t = await body();
  ok('D quanto posso ter: R$ 19.896,17 em 14 meses (aportado R$ 18.500,00, rendimento R$ 1.396,17) e, sem rendimento, R$ 18.500,00', t.includes('Na hipótese informada: R$ 19.896,17 em 14 meses') && t.includes('Total aportado: R$ 18.500,00') && t.includes('Rendimento na hipótese: R$ 1.396,17') && t.includes('Sem rendimento, seriam R$ 18.500,00.'));
  // 120 meses, R$ 500,00 por mês, 10% ao ano e inflação de 4,5%: R$ 100.728,79 (hoje, R$ 64.862,05).
  await field('Quanto já tem (opcional)').fill(''); await field('Em quantos meses').fill('120'); await field('Quanto vai guardar por mês').fill('500');
  ok('D inflação desligada: sem o campo "Inflação ao ano (%)"', (await p.getByLabel('Inflação ao ano (%)', { exact: true }).count()) === 0);
  await p.getByRole('checkbox', { name: /Descontar inflação/ }).click(); await p.waitForTimeout(200);
  ok('D inflação ligada: o campo vem vazio (nunca sugerido)', (await field('Inflação ao ano (%)').inputValue()) === '');
  await simulate();
  ok('D inflação ligada e vazia: erro "Digite a inflação ao ano que quer testar, de 0% a 30%."', (await body()).includes('Digite a inflação ao ano que quer testar, de 0% a 30%.'));
  await field('Inflação ao ano (%)').fill('4,5'); await simulate(); await waitText('Em dinheiro de hoje'); await p.waitForTimeout(300);
  t = await body();
  ok('D quanto posso ter, 120 meses: R$ 100.728,79 na hipótese, R$ 60.000,00 aportados, R$ 40.728,79 de rendimento e R$ 64.862,05 em dinheiro de hoje (inflação de 4,5% ao ano)', t.includes('Na hipótese informada: R$ 100.728,79 em 120 meses') && t.includes('Total aportado: R$ 60.000,00') &&
    t.includes('Rendimento na hipótese: R$ 40.728,79') && t.includes('Em dinheiro de hoje, com inflação de 4,5% ao ano: R$ 64.862,05') && t.includes('Sem rendimento, seriam R$ 60.000,00.') &&
    t.includes('Inflação de 4,5% ao ano (0,37% ao mês, taxa equivalente), constante no período, só para o valor em dinheiro de hoje.'));
  const simChart = await p.locator('[role="img"]').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')).filter((l) => l && l.startsWith('Gráfico')));
  ok('D o gráfico por ano tem um único rótulo acessível (R$ 60.000,00 aportados, total de R$ 100.728,79)', simChart.length === 1 && simChart[0].includes('R$ 60.000,00 aportados') && simChart[0].includes('total de R$ 100.728,79'), JSON.stringify(simChart));
  await keepText();
  await calcShot('135_simular_quanto_posso_ter');
  await btn('Ver tabela ano a ano').click(); await waitText('Ocultar tabela ano a ano');
  t = await body();
  ok('D tabela de 10 anos com a coluna de dinheiro de hoje', t.includes('Ano 10') && !t.includes('Ano 11') && t.includes('Em dinheiro de hoje'));
  await field('Quanto vai guardar por mês').fill('9999999,99'); await field('Em quantos meses').fill('600'); await simRate().fill('30'); await simulate();
  ok('D resultado alto demais: "Com estes números, o resultado passa do que o simulador mostra."', (await body()).includes('Com estes números, o resultado passa do que o simulador mostra.'));
  await field('Em quantos meses').fill('601'); await simRate().fill('abc'); await simulate();
  t = await body();
  ok('D prazo 601 e taxa "abc": "Use um prazo de 1 a 600 meses." e "Use uma taxa de 0% a 30% ao ano, com até 2 casas."', t.includes('Use um prazo de 1 a 600 meses.') && t.includes('Use uma taxa de 0% a 30% ao ano, com até 2 casas.'));
  await simRate().fill('10'); await field('Em quantos meses').fill('120'); await field('Quanto vai guardar por mês').fill('500'); await simulate();
  const simHints = await p.getByRole('button', { name: /^O que é isso\?/ }).filter({ visible: true }).evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
  ok('D "O que é isso?": taxa ao ano e ao mês, inflação, juros compostos e como ler uma simulação', ['Taxa ao ano e ao mês', 'Inflação', 'Juros compostos', 'Como ler uma simulação'].every((x) => simHints.some((h) => h && h.includes(x))), JSON.stringify(simHints));

  // Nada gravado ao digitar nem ao simular: o repositório, o aparelho e a rede ficam iguais.
  const simSnapAfter = await repoSnapshot();
  ok('D nada gravado: repositório igual ao de antes do simulador, nada novo no aparelho, nenhuma requisição de escrita e as metas continuam em 2',
    simSnapAfter === simSnapBefore && (await storageNow()) === simStorageBefore && writes.length === simWritesBefore && (await goalCount()) === 2, [snapshotDiff(simSnapBefore, simSnapAfter), ...writes.slice(simWritesBefore, simWritesBefore + 3)].filter(Boolean).join(' | '));

  // As entradas: detalhe da meta, calculadora, Aprender, o tema "Como ler uma simulação" e o endereço direto.
  await freshDemo();
  await metasTab();
  await p.getByRole('button', { name: /^Viagem de férias/ }).filter({ visible: true }).first().click(); await waitText('Mais ações'); await p.waitForTimeout(300);
  ok('D detalhe da meta: o link "Simular com rendimento"', (await visibleCount('button', 'Simular com rendimento')) === 1);
  await btn('Simular com rendimento').click(); await waitText('Faça contas com hipóteses suas'); await p.waitForTimeout(300);
  const fromGoal = await formValues();
  ok('D do detalhe da meta: alvo R$ 6.000,00, já tem R$ 1.200,00, 10 meses e taxa vazia, no modo "Quanto guardar por mês"', fromGoal.includes('Quanto quer juntar=6.000,00') && fromGoal.includes('Quanto já tem (opcional)=1.200,00') && fromGoal.includes('Em quantos meses=10') &&
    fromGoal.includes('Taxa de rendimento ao ano (%)=') && (await radio('Quanto guardar por mês').getAttribute('aria-checked')) === 'true' && !/taxa|rate/i.test(p.url()), JSON.stringify(fromGoal));
  await simRate().fill('0'); await simulate(); await waitText('por mês na hipótese informada');
  ok('D taxa 0 repete o plano da meta: R$ 480,00 por mês', (await body()).includes('R$ 480,00 por mês na hipótese informada') && (await body()).includes('Sem rendimento, seriam R$ 480,00 por mês.'));
  await shot('136_simular_da_meta');
  await btn('Voltar').click(); await waitText('Mais ações'); await btn('Voltar').click(); await waitText('Seu plano de guardar');
  // Calculadora "Juntar para um objetivo": o link com os valores preenchidos (e sem link quando o objetivo já foi alcançado).
  await p.getByRole('button', { name: /^Calculadoras\./ }).filter({ visible: true }).first().click(); await waitUntil(async () => (await h1Name()) === 'Calculadoras', 8000);
  await openCalc('Juntar para um objetivo');
  ok('D calculadora sem resultado: sem o link "Simular com rendimento"', (await visibleCount('button', 'Simular com rendimento')) === 0);
  await typeIn('Quanto quer juntar', '22.500,00'); await typeIn('Quanto já tem', '4.500,00'); await radio('Em quanto tempo').click(); await typeIn('Quanto vai guardar por mês', '1.000,00');
  await waitUntil(async () => (await visibleCount('button', 'Simular com rendimento')) === 1, 4000);
  ok('D calculadora com resultado: o link "Simular com rendimento" (com 48 px de altura)', (await visibleCount('button', 'Simular com rendimento')) === 1 && (await btn('Simular com rendimento').boundingBox()).height >= 47.5);
  await btn('Simular com rendimento').click(); await waitText('Faça contas com hipóteses suas'); await p.waitForTimeout(300);
  const fromCalc = await formValues();
  ok('D da calculadora: alvo 22.500,00, já tem 4.500,00, aporte 1.000,00, taxa vazia e o modo "Em quanto tempo"', fromCalc.includes('Quanto quer juntar=22.500,00') && fromCalc.includes('Quanto já tem (opcional)=4.500,00') && fromCalc.includes('Quanto vai guardar por mês=1.000,00') &&
    fromCalc.includes('Taxa de rendimento ao ano (%)=') && (await radio('Em quanto tempo').getAttribute('aria-checked')) === 'true', JSON.stringify(fromCalc));
  await btn('Voltar').click(); await waitText('Quanto quer juntar');
  await typeIn('Quanto já tem', '22.500,00'); await p.waitForTimeout(300);
  ok('D calculadora com objetivo já alcançado: sem o link', (await visibleCount('button', 'Simular com rendimento')) === 0);
  // Aprender: o atalho "Simular" no começo de "Dinheiro no tempo" e o tema com a ação "Simular um plano".
  await freshDemo();
  await p.getByRole('tab', { name: 'Aprender' }).filter({ visible: true }).first().click(); await waitText('Diferença do mês e saldo da conta'); await p.waitForTimeout(300);
  const timeSection = await p.evaluate(() => {
    const h = [...document.querySelectorAll('[role=heading]')].find((e) => e.textContent.trim() === 'Dinheiro no tempo' && e.getBoundingClientRect().width > 0);
    let el = h;
    while (el && el.querySelectorAll('[role=button]').length < 2) el = el.parentElement;
    return el ? [...el.querySelectorAll('[role=button]')].map((x) => x.getAttribute('aria-label')).slice(0, 3) : [];
  });
  ok('D Aprender: o atalho "Simular" abre "Dinheiro no tempo", antes dos temas', timeSection.length === 3 && /^Simular\. Quanto guardar por mês/.test(timeSection[0]) && !/^Simular/.test(timeSection[1]), JSON.stringify(timeSection));
  await p.getByRole('button', { name: /^Simular\. Quanto guardar/ }).filter({ visible: true }).first().click(); await waitText('Faça contas com hipóteses suas'); await p.waitForTimeout(300);
  ok('D do atalho de Aprender: o simulador vazio (origem=aprender no endereço)', (await formValues()).every((x) => x.endsWith('=')) && p.url().includes('origem=aprender'), p.url());
  await btn('Voltar').click(); await waitText('Diferença do mês e saldo da conta');
  await p.getByRole('button', { name: /^Como ler uma simulação/ }).filter({ visible: true }).first().click(); await p.waitForTimeout(600);
  ok('D o tema "Como ler uma simulação" tem a ação "Simular um plano"', (await visibleCount('button', /Simular um plano/)) >= 1, p.url());
  await p.getByRole('button', { name: /Simular um plano/ }).filter({ visible: true }).first().click(); await waitText('Faça contas com hipóteses suas');
  ok('D a ação do tema abre /simular', new URL(p.url()).pathname === '/simular', p.url());
  // Endereço direto (versão web instalada): valores do link; a taxa vinda do endereço nunca é lida; lixo é ignorado.
  await p.goto(`http://localhost:${PORT}/simular?modo=em-quanto-tempo&alvo=2250000&inicial=450000&mensal=100000&taxa=10`); await waitText('Seu dinheiro');
  await btn('Ver demonstração com dados fictícios').click(); await waitText('Faça contas com hipóteses suas'); await p.waitForTimeout(300);
  const direct = await formValues();
  ok('D endereço direto: os valores do link (22.500,00 e 1.000,00) e a taxa do endereço não é lida', direct.includes('Quanto quer juntar=22.500,00') && direct.includes('Quanto vai guardar por mês=1.000,00') && direct.includes('Taxa de rendimento ao ano (%)='), JSON.stringify(direct));
  await p.goto(`http://localhost:${PORT}/simular?modo=xyz&alvo=abc&meses=9999&inicial=-1`); await waitText('Seu dinheiro');
  await btn('Ver demonstração com dados fictícios').click(); await waitText('Faça contas com hipóteses suas'); await p.waitForTimeout(300);
  ok('D endereço com valores inválidos: ignorados (campos vazios)', (await formValues()).length === 0, JSON.stringify(await formValues()));

  const urlPath = () => new URL(p.url()).pathname;
  {
  // ==================================================================================================================
  // Ciclo E · Cartões de crédito (D-037). A demonstração tem o "Cartão Exemplo" (final 1234, fecha dia 3, vence dia 10, limite
  // R$ 5.000,00) com Tênis de corrida (R$ 600,00 em 3x), Notebook (R$ 1.500,00 em 10x) e Restaurante (R$ 200,00), todos de
  // 05 e 06/10/2026: a primeira fatura vence em novembro (R$ 550,00) e o limite usado é R$ 2.300,00. Compra no cartão NUNCA
  // entra em Pago: só o pagamento da fatura entra, na data do pagamento (D-021). Os totais de outubro continuam 6.000 / 3.900 /
  // 2.100 e 650. Nenhum número de cartão, código de segurança nem validade existe em tela alguma. Hoje é 07/10/2026.
  const goTab = async (name) => {
    const tab = () => p.getByRole('tab', { name }).filter({ visible: true });
    // A barra de abas pode demorar um instante (depois de criar a conta, por exemplo): espera antes de voltar telas.
    for (let i = 0; i < 8; i++) { await tab().first().waitFor({ timeout: 1500 }).catch(() => {}); if ((await tab().count()) > 0) break; await btn('Voltar').click(); await p.waitForTimeout(400); }
    await tab().first().click(); await p.waitForTimeout(500);
  };
  const cardTile = () => p.getByRole('button', { name: /^Cartão Exemplo · final 1234\./ }).filter({ visible: true }).first();
  const openCardsList = async () => {
    await goTab('Movimentações'); await waitText('Registrar recebimento');
    await p.getByRole('button', { name: /^Cartões, / }).filter({ visible: true }).first().click(); await waitText('Cadastrar cartão'); await p.waitForTimeout(500);
  };
  const openCardPage = async () => { await openCardsList(); await cardTile().click(); await waitText('Fatura atual'); await p.waitForTimeout(400); };
  const openInvoice = async (month = 'novembro') => {
    await p.getByRole('button', { name: new RegExp(`^Fatura de ${month}, `) }).filter({ visible: true }).first().click(); await waitText('Lançamentos'); await p.waitForTimeout(500);
  };
  const waitInvoice = async (hero) => { await waitText('Lançamentos'); await waitText(hero); await p.waitForTimeout(500); };
  const cardIdOf = (name) => otherDevice(async (repo, ctx, n) => (await repo.listCards(ctx)).find((c) => c.name === n)?.id ?? null, name);
  const countEntries = (cardId) => otherDevice(async (repo, ctx, id) => (await repo.listCardEntries(id)).length, cardId);
  // Total do cabeçalho azul da fatura: o valor logo depois do título, da situação e do apelido do cartão.
  const heroTotal = async () => (await body()).match(/Fatura de [^\n]+\n[^\n]+\n[^\n]+\n(R\$ [\d.]+,\d{2})/)?.[1] ?? null;

  await freshDemo();
  await goTab('Movimentações');
  await p.getByRole('button', { name: SC.cartoes, exact: true }).filter({ visible: true }).first().click(); await waitText('Cadastrar cartão'); await p.waitForTimeout(500);
  t = await body();
  ok('E Cartões: título, apelido, "final 1234", fatura de novembro aberta de R$ 550,00, fecha em 03/11, vence em 10/11 e o limite usado R$ 2.300,00 de R$ 5.000,00',
    (await h1Name()) === 'Cartões' && ['Cartão Exemplo', 'final 1234', 'Fatura de novembro', 'R$ 550,00', 'Aberta · valor estimado', 'Fecha em 03/11 · Vence em 10/11', 'Limite usado: R$ 2.300,00 de R$ 5.000,00',
      'O limite usado soma as parcelas das faturas que ainda não foram pagas.'].every((x) => t.includes(x)), t.slice(0, 500));
  ok('E Cartões: o cartão é um botão só, com o nome acessível completo (apelido, final, fatura, fechamento, vencimento e limite)',
    (await visibleCount('button', /^Cartão Exemplo · final 1234\. Fatura de novembro · R\$ 550,00 · Aberta\. Fecha em 03\/11\. Vence em 10\/11\. Limite usado: R\$ 2\.300,00 de R\$ 5\.000,00\.$/)) === 1 && (await visibleCount('button', 'Cadastrar cartão')) === 1);
  ok('E Cartões: sem cor de alerta nem julgamento (sem "disponível", "estourou", "saldo")', !NO_BALANCE.test(t) && !/estourou|dispon[ií]vel|saldo/i.test(t));
  await keepText();
  await innerChecks('cartões 390px');
  await shot('130_cartoes');
  await p.setViewportSize({ width: 320, height: 800 }); await p.waitForTimeout(400);
  await innerChecks('cartões 320px');
  await shot('130_cartoes_320px', true);
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(300);

  // O cartão: faturas por mês (atual e próximas com as parcelas futuras), sem excluir enquanto há lançamentos.
  await cardTile().click(); await waitText('Fatura atual'); await p.waitForTimeout(500);
  t = await body();
  const nextRows = (await sectionRows('Próximas faturas')) ?? [];
  ok('E cartão: apelido, final, "Fecha no dia 3 · vence no dia 10", limite usado e a fatura atual (novembro, R$ 550,00)', (await h1Name()) === 'Cartão' && t.includes('Cartão Exemplo') && t.includes('final 1234') &&
    t.includes('Fecha no dia 3 · vence no dia 10') && t.includes('Limite usado: R$ 2.300,00 de R$ 5.000,00') && JSON.stringify(await sectionRows('Fatura atual')) === JSON.stringify(['Fatura de novembro, aberta, R$ 550,00. Fecha em 03/11. Vence em 10/11.']),
    JSON.stringify(await sectionRows('Fatura atual')));
  ok('E cartão: próximas faturas de dezembro (R$ 350,00) a agosto de 2027 (R$ 150,00), com as parcelas futuras, e nenhuma fatura anterior', nextRows.length === 9 && nextRows[0] === 'Fatura de dezembro, aberta, R$ 350,00. Fecha em 03/12. Vence em 10/12.' &&
    nextRows[1].startsWith('Fatura de janeiro de 2027, aberta, R$ 350,00') && nextRows[8].startsWith('Fatura de agosto de 2027, aberta, R$ 150,00') && !t.includes('Faturas anteriores') &&
    t.includes('As parcelas das compras já anotadas entram nas faturas seguintes.') && t.includes('Ainda não começou'), JSON.stringify(nextRows));
  ok('E cartão: com lançamentos, não oferece "Excluir cartão" e diz para arquivar; oferece editar, arquivar e anotar compra', (await visibleCount('button', 'Excluir cartão')) === 0 &&
    t.includes('Um cartão com lançamentos não pode ser excluído. Arquive em vez de excluir.') && (await visibleCount('button', 'Editar cartão')) === 1 && (await visibleCount('button', 'Arquivar cartão')) === 1 && (await visibleCount('button', 'Anotar compra neste cartão')) === 1);
  ok('E cartão: nenhum número de cartão, código de segurança nem validade em tela', !/\b\d{4} \d{4} \d{4}\b|\bcvv\b|validade/i.test(t));
  await keepText();
  await innerChecks('cartão 390px');
  await shot('131_cartao');
  await p.setViewportSize({ width: 320, height: 800 }); await p.waitForTimeout(400);
  await innerChecks('cartão 320px');
  await shot('131_cartao_320px', true);
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(300);

  // A fatura de novembro: lançamentos, total e as ações.
  await openInvoice('novembro');
  t = await body();
  ok('E fatura de novembro: "Aberta", R$ 550,00 estimado, fecha em 03/11, vence em 10/11 e o período de 04/10 a 03/11', (await h1Name()) === 'Fatura' && ['Fatura de novembro', 'Aberta', 'Cartão Exemplo', 'R$ 550,00', 'Valor estimado: pode mudar com novas compras.',
    'Fecha em 03/11 · Vence em 10/11', 'Período: 04/10 a 03/11'].every((x) => t.includes(x)), t.slice(0, 400));
  ok('E fatura: lançamentos (Tênis "parcela 1 de 3", Notebook "parcela 1 de 10" e o Restaurante) e o total formado só por parcelas (R$ 550,00)',
    (await visibleCount('button', 'Tênis de corrida · parcela 1 de 3 · R$ 200,00')) === 1 && (await visibleCount('button', 'Notebook · parcela 1 de 10 · R$ 150,00')) === 1 && (await visibleCount('button', 'Restaurante · R$ 200,00')) === 1 &&
    t.includes('parcela 1 de 3 · compra em 05/10 · Lazer') && /Parcelas de compras\s+R\$ 550,00/.test(t) && /Total da fatura\s+R\$ 550,00/.test(t) && t.includes('Total = parcelas + encargos + saldo anterior - estornos'));
  ok('E fatura aberta: sem "Pagar fatura" (só depois do fechamento), com "Informar encargos", "Registrar estorno" e a próxima fatura (dezembro); sem "Desfazer pagamento"', (await visibleCount('button', 'Pagar fatura')) === 0 && (await visibleCount('button', 'Informar encargos')) === 1 &&
    (await visibleCount('button', 'Registrar estorno')) === 1 && (await visibleCount('button', 'Desfazer pagamento')) === 0 && (await visibleCount('button', 'Próxima fatura: dezembro')) === 1 && (await visibleCount('button', /^Fatura anterior/)) === 0);
  await keepText();
  await innerChecks('fatura 390px');
  await shot('132_fatura');
  await p.setViewportSize({ width: 320, height: 800 }); await p.waitForTimeout(400);
  await innerChecks('fatura 320px');
  await shot('132_fatura_320px', true);
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(300);

  // Anotar gasto: "Como você pagou?" logo depois do Valor. Dinheiro, débito ou Pix é o jeito de sempre (já marcado).
  await goTab('Resumo'); await waitText('Diferença do mês');
  await btn('Anotar gasto').click(); await waitText('Será salvo em'); await p.waitForTimeout(500);
  const payTops = await p.evaluate(() => {
    const top = (text) => [...document.querySelectorAll('div[dir="auto"]')].find((e) => e.textContent === text && e.getBoundingClientRect().width > 0)?.getBoundingClientRect().top ?? null;
    return { valor: top('Valor em reais'), como: top('Como você pagou?'), data: top('Data do pagamento') };
  });
  ok('E Anotar gasto: "Como você pagou?" vem logo depois do Valor (e antes da data), com "Dinheiro, débito ou Pix" marcado e "Cartão de crédito" desmarcado',
    payTops.valor !== null && payTops.como !== null && payTops.data !== null && payTops.valor < payTops.como && payTops.como < payTops.data &&
    (await radio('Dinheiro, débito ou Pix').getAttribute('aria-checked')) === 'true' && (await radio('Cartão de crédito').getAttribute('aria-checked')) === 'false' && (await visibleCount('textbox', 'Em quantas vezes?')) === 0 && (await visibleCount('button', 'Salvar gasto')) === 1, JSON.stringify(payTops));
  await radio('Cartão de crédito').click(); await p.waitForTimeout(400);
  t = await body();
  ok('E Anotar gasto com cartão: escolhe o único cartão, pede "Em quantas vezes?" (1 a 48), troca para "Data da compra" e o botão vira "Anotar compra no cartão"',
    t.includes('Compra no cartão · Cartão Exemplo · final 1234') && (await field('Em quantas vezes?').inputValue()) === '1' && t.includes('De 1 a 48 parcelas.') && t.includes('Data da compra') && !t.includes('Data do pagamento') &&
    (await visibleCount('button', 'Anotar compra no cartão')) === 1 && (await visibleCount('button', 'Salvar gasto')) === 0 && (await visibleCount('radiogroup', 'Conta')) === 0);
  await field('Descrição').fill('Fone de ouvido'); await field('Valor em reais').fill('300'); await field('Em quantas vezes?').fill('49'); await p.waitForTimeout(300);
  const exemploId = await cardIdOf('Cartão Exemplo');
  const entriesBefore = await countEntries(exemploId);
  await btn('Anotar compra no cartão').click(); await p.waitForTimeout(400);
  ok('E compra no cartão com 49 parcelas: "Informe de 1 a 48 parcelas", nada gravado e o formulário continua', (await body()).includes('Informe de 1 a 48 parcelas, com pelo menos R$ 0,01 em cada.') && (await countEntries(exemploId)) === entriesBefore && urlPath() === '/registro/novo', urlPath());
  await field('Em quantas vezes?').fill('3'); await p.waitForTimeout(500);
  t = await body();
  ok('E aviso da compra: "Esta compra entra na fatura de novembro do Cartão Exemplo e conta em Pago quando a fatura for paga." e "3 parcelas, a primeira de R$ 100,00"',
    t.includes('Esta compra entra na fatura de novembro do Cartão Exemplo e conta em Pago quando a fatura for paga.') && t.includes('3 parcelas, a primeira de R$ 100,00. As outras 2 entram nas faturas seguintes.') &&
    t.includes('Compra no cartão não entra em Pago agora: ela entra quando a fatura for paga.'), t.split('\n').filter((l) => /fatura/.test(l)).join(' | '));
  await keepText();
  await innerChecks('anotar compra no cartão 390px');
  await shot('133_anotar_compra_no_cartao');
  await p.setViewportSize({ width: 320, height: 800 }); await p.waitForTimeout(400);
  await layoutChecks('anotar compra no cartão 320px');
  await shot('133_anotar_compra_no_cartao_320px', true);
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(300);
  await btn('Anotar compra no cartão').click(); await waitText('Compra anotada na fatura de novembro.'); await waitText('Lançamentos'); await p.waitForTimeout(600);
  t = await body();
  ok('E compra salva: abre a fatura de novembro (R$ 650,00) com o aviso de que vai para a fatura e só entra em Pago quando ela for paga, e a parcela 1 de 3 do Fone de ouvido',
    /^\/cartoes\/[^/]+\/fatura\/2026-11$/.test(urlPath()) && t.includes('Compra anotada na fatura de novembro. Compra no cartão não entra em Pago agora: ela entra quando a fatura for paga.') && (await heroTotal()) === 'R$ 650,00' &&
    (await visibleCount('button', 'Fone de ouvido · parcela 1 de 3 · R$ 100,00')) === 1 && (await countEntries(exemploId)) === entriesBefore + 1, `${urlPath()} ${await heroTotal()}`);
  await shot('134_compra_na_fatura');
  await goTab('Resumo'); await waitText('Diferença do mês');
  await expectTotals('E compra no cartão não entra em Pago: o Resumo continua 6.000 / 3.900 / 2.100 e 650', 'R$ 6.000,00', 'R$ 3.900,00', 'R$ 2.100,00', 'R$ 650,00');
  // A última forma de pagamento fica lembrada só neste aparelho: o próximo Anotar gasto já abre no cartão.
  await btn('Anotar gasto').click(); await waitText('Será salvo em'); await p.waitForTimeout(600);
  ok('E Anotar gasto lembra a última forma de pagamento (cartão) neste aparelho: "Cartão de crédito" já marcado e a pergunta das parcelas à vista', (await radio('Cartão de crédito').getAttribute('aria-checked')) === 'true' && (await visibleCount('textbox', 'Em quantas vezes?')) === 1);
  await radio('Dinheiro, débito ou Pix').click(); await p.waitForTimeout(300);
  ok('E de volta a "Dinheiro, débito ou Pix": o gasto de sempre (data do pagamento, conta, "Salvar gasto") e o botão do cartão some', (await visibleCount('button', 'Salvar gasto')) === 1 && (await visibleCount('textbox', 'Em quantas vezes?')) === 0 && (await body()).includes('Data do pagamento'));
  await btn('Cancelar').click(); await p.waitForTimeout(300); if (await visibleCount('button', 'Descartar alterações')) await btn('Descartar alterações').click();
  await waitText('Diferença do mês');

  // Dezembro com as parcelas futuras (R$ 450,00: Tênis, Notebook e Fone). Fatura aberta ou futura não se paga: só depois do fechamento.
  await openCardPage(); await openInvoice('novembro');
  await btn('Próxima fatura: dezembro').click(); await waitInvoice('Fatura de dezembro'); t = await body();
  ok('E fatura de dezembro: R$ 450,00 (parcela 2 do Tênis, do Notebook e do Fone) com o caminho para a fatura anterior', (await heroTotal()) === 'R$ 450,00' && (await visibleCount('button', 'Tênis de corrida · parcela 2 de 3 · R$ 200,00')) === 1 &&
    (await visibleCount('button', 'Fone de ouvido · parcela 2 de 3 · R$ 100,00')) === 1 && (await visibleCount('button', 'Fatura anterior: novembro')) === 1, `${await heroTotal()}`);
  ok('E fatura de dezembro (ainda não começou): sem "Pagar fatura" e com a frase de quando poderá ser paga (depois do fechamento, em 03/12/2026); "Informar encargos" segue',
    (await visibleCount('button', 'Pagar fatura')) === 0 && t.includes('Esta fatura ainda está aberta. Registre o pagamento depois do fechamento, em 03/12/2026. Se você já pagou antes, use a data em que pagou.') && (await visibleCount('button', 'Informar encargos')) === 1);
  await btn('Fatura anterior: novembro').click(); await waitInvoice('Fatura de novembro');
  t = await body();
  ok('E fatura de novembro aberta: sem "Pagar fatura", com a frase de quando poderá ser paga (em 03/11/2026) e "Informar encargos" e "Registrar estorno" ainda disponíveis',
    (await visibleCount('button', 'Pagar fatura')) === 0 && t.includes('Esta fatura ainda está aberta. Registre o pagamento depois do fechamento, em 03/11/2026. Se você já pagou antes, use a data em que pagou.') &&
    (await visibleCount('button', 'Informar encargos')) === 1 && (await visibleCount('button', 'Registrar estorno')) === 1, t.slice(0, 500));
  await keepText();
  await shot('135a_fatura_aberta_sem_pagar');
  // O banco segue a mesma regra, de outro aparelho: fatura_aberta, e nada é gravado (Pago de outubro continua 3.900).
  const openRefusal = await otherDevice(async (repo, ctx, id) => {
    const bill = (await repo.listInvoiceCommitments(id)).find((i) => i.invoice.month === '2026-11');
    try { await repo.payInvoice(`e2e-aberta-${Math.random()}`, id, '2026-11', bill.version, 100, '2026-10-07'); return 'gravou'; } catch (e) { return e.code ?? String(e); }
  }, exemploId);
  ok('E o banco recusa o pagamento da fatura aberta (fatura_aberta) e nada é gravado', openRefusal === 'fatura_aberta' && (await otherDevice(async (repo, ctx, id) => (await repo.listCardEntries(id)).length, exemploId)) === entriesBefore + 1);
  // Uma fatura FECHADA para pagar: compras de 20/09/2026 (a fatura de outubro fechou em 03/10 e vence em 10/10), criadas por "outro aparelho".
  await otherDevice(async (repo, ctx, id) => {
    const k = () => `e2e-set-${Math.random()}`;
    await repo.addCardPurchase(k(), id, { description: 'Mercado de setembro', category: 'Mercado', purchasedOn: '2026-09-20', totalCents: 30000, installments: 1 });
    await repo.addCardPurchase(k(), id, { description: 'Cinema', category: 'Lazer', purchasedOn: '2026-09-20', totalCents: 10000, installments: 1 });
  }, exemploId);
  const fixtureEntries = 2;
  await goTab('Resumo'); await waitText('Diferença do mês');
  await expectTotals('E a fatura de outubro, fechada (R$ 400,00, vence em 10/10), entra em "Ainda a pagar": 6.000 / 3.900 / 2.100 e 1.050', 'R$ 6.000,00', 'R$ 3.900,00', 'R$ 2.100,00', 'R$ 1.050,00');
  await openCardPage(); t = await body();
  ok('E cartão com a fatura fechada: "Faturas anteriores" traz a de outubro (fechada, R$ 400,00) e a fatura atual segue sendo a de novembro',
    JSON.stringify(await sectionRows('Faturas anteriores')) === JSON.stringify(['Fatura de outubro, fechada, R$ 400,00. Fechou em 03/10. Vence em 10/10.']) && JSON.stringify(await sectionRows('Fatura atual')) === JSON.stringify(['Fatura de novembro, aberta, R$ 650,00. Fecha em 03/11. Vence em 10/11.']),
    JSON.stringify([await sectionRows('Faturas anteriores'), await sectionRows('Fatura atual')]));
  await openInvoice('outubro'); t = await body();
  ok('E fatura de outubro fechada: "Fechada", R$ 400,00, "Fechou em 03/10 · Vence em 10/10", "Pagar fatura" e "Informar encargos", sem a frase da fatura aberta', (await h1Name()) === 'Fatura' && t.includes('Fatura de outubro') && t.includes('Fechada') && (await heroTotal()) === 'R$ 400,00' &&
    t.includes('Fechou em 03/10 · Vence em 10/10') && (await visibleCount('button', 'Pagar fatura')) === 1 && (await visibleCount('button', 'Informar encargos')) === 1 && !t.includes('Esta fatura ainda está aberta') &&
    (await visibleCount('button', 'Mercado de setembro · R$ 300,00')) === 1 && (await visibleCount('button', 'Cinema · R$ 100,00')) === 1, t.slice(0, 400));
  await btn('Pagar fatura').click(); await waitText('Confirmar pagamento'); await p.waitForTimeout(500);
  t = await body();
  ok('E Pagar fatura: total R$ 400,00, "Pagar o total" marcado, data de hoje com a janela "De 07/10/2025 até hoje." (começa 1 ano atrás) e "Outro valor" ainda sem campo',
    (await h1Name()) === 'Pagar fatura' && t.includes('Total da fatura') && t.includes('R$ 400,00') && (await radio('Pagar o total').getAttribute('aria-checked')) === 'true' && (await field('Data do pagamento').inputValue()) === '07/10/2026' &&
    t.includes('De 07/10/2025 até hoje.') && (await visibleCount('textbox', 'Valor pago')) === 0 && t.includes('O pagamento de R$ 400,00 entra em Pago de outubro.') && (await visibleCount('button', 'Confirmar pagamento')) === 1, t.slice(0, 500));
  await keepText();
  await innerChecks('pagar fatura 390px');
  await shot('135_pagar_fatura');
  await p.setViewportSize({ width: 320, height: 800 }); await p.waitForTimeout(400);
  await innerChecks('pagar fatura 320px');
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(300);
  await field('Data do pagamento').fill('06/10/2025'); await btn('Confirmar pagamento').click(); await p.waitForTimeout(400);
  ok('E pagar fatura com data antes da janela (06/10/2025): "Confira a data informada" e nada gravado', (await body()).includes('Confira a data informada.') && urlPath().endsWith('/pagar'));
  await field('Data do pagamento').fill('08/10/2026'); await btn('Confirmar pagamento').click(); await p.waitForTimeout(400);
  ok('E pagar fatura com data de amanhã: "Use uma data até hoje" e nada gravado', (await body()).includes('Use uma data até hoje.') && urlPath().endsWith('/pagar'));
  await field('Data do pagamento').fill('07/10/2026'); await radio('Outro valor').click(); await field('Valor pago').fill('700'); await btn('Confirmar pagamento').click(); await p.waitForTimeout(400);
  ok('E pagar fatura com valor acima do total: "O valor pago não pode passar do total da fatura." e nada gravado', (await body()).includes('O valor pago não pode passar do total da fatura.') && urlPath().endsWith('/pagar'));
  await field('Valor pago').fill('250'); await p.waitForTimeout(500);
  t = await body();
  ok('E pagamento parcial de R$ 250,00: a prévia diz "Ficaram R$ 150,00 para a fatura de novembro. Juros e encargos do banco entram quando você informar a fatura de novembro." e oferece "Quanto custa pagar só uma parte?"',
    t.includes('Ficaram R$ 150,00 para a fatura de novembro. Juros e encargos do banco entram quando você informar a fatura de novembro.') && (await visibleCount('button', 'Quanto custa pagar só uma parte?')) === 1 &&
    t.includes('O pagamento de R$ 250,00 entra em Pago de outubro.'));
  await keepText();
  await shot('136_pagar_parcial');
  await btn('Confirmar pagamento').click(); await waitText('Pagamento registrado.'); await waitInvoice('Paga em parte'); t = await body();
  ok('E fatura paga em parte: "Pago R$ 250,00 em 07/10/2026", o aviso do pagamento, o que ficou (R$ 150,00) com o caminho da calculadora e "Desfazer pagamento"; sem pagar de novo nem mudar valor, data ou parcelas',
    t.includes('Pagamento registrado. R$ 250,00 em Pago de outubro.') && t.includes('Pago R$ 250,00 em 07/10/2026') && t.includes('Ficaram R$ 150,00 para a fatura de novembro.') && (await visibleCount('button', 'Quanto custa pagar só uma parte?')) === 1 &&
    (await visibleCount('button', 'Desfazer pagamento')) === 1 && (await visibleCount('button', 'Pagar fatura')) === 0 && (await visibleCount('button', 'Informar encargos')) === 0 && (await visibleCount('button', 'Registrar estorno')) === 0 &&
    (await visibleCount('button', 'Mercado de setembro · R$ 300,00')) === 1 && (await visibleCount('button', 'Cinema · R$ 100,00')) === 1 && t.includes('Fatura paga: só a descrição e a categoria das compras mudam. Para mudar o resto, desfaça o pagamento.'), t.slice(0, 500));
  // Compra com parcela em fatura paga: o menu só oferece editar a descrição e a categoria (sem excluir), e o formulário só tem esses campos.
  await btn('Cinema · R$ 100,00').click(); await waitText('Editar descrição e categoria'); t = await dialogText();
  ok('E compra numa fatura paga: o menu oferece "Editar descrição e categoria" e não oferece "Excluir lançamento"', (await p.getByRole('alert').getByRole('button', { name: 'Editar descrição e categoria' }).count()) === 1 && (await p.getByRole('alert').getByRole('button', { name: 'Excluir lançamento' }).count()) === 0, t);
  await p.getByRole('alert').getByRole('button', { name: 'Editar descrição e categoria' }).last().click(); await waitText('Esta compra tem parcelas em uma fatura já paga.'); await p.waitForTimeout(400); t = await body();
  ok('E editar compra de fatura paga: a nota explica, a descrição e a categoria estão preenchidas e valor, data e parcelas não são campos', (await h1Name()) === 'Editar compra' && t.includes('Aqui você muda só a descrição e a categoria. Para mudar valor, data ou parcelas, desfaça o pagamento da fatura.') &&
    (await field('Descrição').inputValue()) === 'Cinema' && (await visibleCount('textbox', 'Valor total da compra')) === 0 && (await visibleCount('textbox', 'Em quantas vezes?')) === 0 && (await radio('Lazer').getAttribute('aria-checked')) === 'true', t.slice(0, 400));
  await keepText();
  await shot('137a_editar_compra_fatura_paga');
  await field('Descrição').fill('Cinema com a turma'); await btn('Salvar compra').click(); await waitText('Compra alterada.'); await waitInvoice('Paga em parte'); t = await body();
  ok('E descrição alterada numa fatura paga: "Compra alterada." (sem dizer que recalculou as parcelas), a linha nova e o total e o pagamento iguais', (await visibleCount('button', 'Cinema com a turma · R$ 100,00')) === 1 && t.includes('Pago R$ 250,00 em 07/10/2026') && (await heroTotal()) === 'R$ 400,00' && !t.includes('parcelas foram recalculadas'), t.slice(0, 400));
  await keepText();
  await shot('137_fatura_paga_em_parte');
  await goTab('Resumo'); await waitText('Diferença do mês');
  await expectTotals('E pagar R$ 250,00 da fatura fechada: Pago 4.150 e diferença 1.850 (só o pagamento entra); recebido 6.000 e a pagar 650', 'R$ 6.000,00', 'R$ 4.150,00', 'R$ 1.850,00', 'R$ 650,00');
  // Anotar gasto com uma data de fatura já paga: a prévia já diz que a compra será recusada (e o banco confirma).
  await btn('Anotar gasto').click(); await waitText('Será salvo em'); await p.waitForTimeout(500); await radio('Cartão de crédito').click(); await p.waitForTimeout(300);
  await field('Descrição').fill('Esquecida de setembro'); await field('Valor em reais').fill('20'); await field('Data da compra').fill('20/09/2026'); await p.waitForTimeout(500); t = await body();
  ok('E Anotar gasto com data na fatura de outubro (paga em parte): a prévia mostra o motivo da recusa, e não "entra na fatura de outubro"', t.includes('Esta compra é de uma fatura já paga. Se o banco cobrou depois, registre como encargo ou ajuste na fatura atual, em Informar encargos.') &&
    !t.includes('Esta compra entra na fatura de outubro'), t.split('\n').filter((l) => /fatura/.test(l)).join(' | '));
  await btn('Anotar compra no cartão').click(); await p.waitForTimeout(600);
  ok('E o banco confirma: a compra de uma fatura paga é recusada (fatura_paga), nada é gravado e o formulário continua', urlPath() === '/registro/novo' && (await body()).includes('Esta compra é de uma fatura já paga.') && (await countEntries(exemploId)) === entriesBefore + 1 + fixtureEntries + 1, urlPath());
  await btn('Cancelar').click(); await p.waitForTimeout(300); if (await visibleCount('button', 'Descartar alterações')) await btn('Descartar alterações').click();
  await waitText('Diferença do mês');
  // Novembro recebe o saldo anterior (R$ 150,00), sem juros: R$ 650,00 + R$ 150,00.
  await openCardPage(); await p.getByRole('button', { name: /^Fatura de novembro, / }).filter({ visible: true }).first().click(); await waitInvoice('Fatura de novembro'); t = await body();
  ok('E fatura de novembro com o saldo anterior: R$ 800,00 (R$ 650,00 de parcelas + R$ 150,00 de saldo anterior, sem juros calculados pelo app)', (await heroTotal()) === 'R$ 800,00' && /Saldo anterior\s+R\$ 150,00/.test(t) && t.includes('Criado pelo pagamento parcial da fatura anterior.') &&
    (await visibleCount('button', 'Saldo anterior · R$ 150,00')) === 0 && !/juros\s+R\$/i.test(t), `${await heroTotal()}`);
  await shot('138_fatura_novembro_saldo_anterior');
  await btn('Fatura anterior: outubro').click(); await waitInvoice('Paga em parte');
  await p.getByRole('button', { name: 'Quanto custa pagar só uma parte?' }).filter({ visible: true }).first().click(); await waitText('Tipo de dívida'); await p.waitForTimeout(500);
  ok('E "Quanto custa pagar só uma parte?" abre a calculadora de dívida em modo rotativo com R$ 150,00 (e a taxa vazia)', urlPath() === '/calcular/custo-da-divida' && p.url().includes('modo=rotativo') && p.url().includes('valor=15000') &&
    (await radio('Rotativo do cartão').getAttribute('aria-checked')) === 'true' && (await field('Valor da dívida').inputValue()) === '150,00' && (await field('Taxa de juros ao mês (%)').inputValue()) === '', p.url());
  await btn('Voltar').click(); await waitInvoice('Paga em parte');
  // O gasto do pagamento: "Fatura Cartão Exemplo (outubro)", origem "Pagamento de fatura", sem editar nem excluir.
  await goTab('Movimentações'); await waitText('Registrar recebimento'); t = await body();
  ok('E Movimentos: o pagamento aparece como "Fatura Cartão Exemplo (outubro)", "Pago · 07/10/2026 · Pagamento de fatura", R$ 250,00 (as compras no cartão não aparecem)', t.includes('Fatura Cartão Exemplo (outubro)') && t.includes('Pago · 07/10/2026 · Pagamento de fatura') && !t.includes('Fone de ouvido') && !t.includes('Mercado de setembro'));
  await p.getByRole('button', { name: /^Fatura Cartão Exemplo \(outubro\), Pago/ }).filter({ visible: true }).first().click(); await waitText('Abrir fatura'); await p.waitForTimeout(400); t = await body();
  ok('E detalhe do pagamento de fatura: origem "Pagamento de fatura", "Abrir fatura" e nada de editar, excluir nem tornar gasto fixo (só se muda pela fatura)', t.includes('Pagamento de fatura') && (await visibleCount('button', 'Abrir fatura')) === 1 && (await visibleCount('button', 'Editar registro')) === 0 &&
    (await visibleCount('button', 'Excluir registro')) === 0 && (await visibleCount('button', 'Tornar gasto fixo')) === 0 && t.includes('Este gasto é o pagamento de uma fatura. Para mudar ou desfazer o pagamento, abra a fatura.'));
  await keepText();
  await shot('139_registro_pagamento_de_fatura');
  await btn('Abrir fatura').click(); await waitInvoice('Paga em parte');
  // Desfazer: o gasto sai de Pago e o saldo anterior de novembro também.
  await btn('Desfazer pagamento').click(); await waitText('Desfazer o pagamento desta fatura?'); t = await dialogText();
  ok('E desfazer o pagamento: o diálogo explica (o gasto é apagado, a fatura volta a ficar em aberto e o saldo anterior sai)', t.includes('O gasto do pagamento é apagado e a fatura volta a ficar em aberto. O saldo anterior criado na fatura seguinte também sai.'));
  await confirmIn('Desfazer pagamento'); await waitText('Pagamento desfeito.'); await waitInvoice('Fechada'); t = await body();
  ok('E pagamento desfeito: "Fechada" de novo, R$ 400,00, "Pagar fatura" e "Informar encargos" de volta', (await heroTotal()) === 'R$ 400,00' && (await visibleCount('button', 'Pagar fatura')) === 1 && (await visibleCount('button', 'Desfazer pagamento')) === 0 && !t.includes('Ficaram R$ 150,00'));
  await goTab('Resumo'); await waitText('Diferença do mês');
  await expectTotals('E desfazer o pagamento da fatura: o Resumo volta a 6.000 / 3.900 / 2.100 e 1.050 (com a fatura de outubro em aberto)', 'R$ 6.000,00', 'R$ 3.900,00', 'R$ 2.100,00', 'R$ 1.050,00');
  await openCardPage(); await p.getByRole('button', { name: /^Fatura de novembro, / }).filter({ visible: true }).first().click(); await waitInvoice('Fatura de novembro');
  ok('E depois de desfazer: novembro volta a R$ 650,00, sem saldo anterior', (await heroTotal()) === 'R$ 650,00' && !(await body()).includes('Saldo anterior'));

  // Encargos e estorno (o app não calcula juros: a pessoa informa o que o banco cobrou). Valem em qualquer fatura, aberta ou fechada.
  await waitInvoice('Aberta');
  await btn('Informar encargos').click(); await waitText('Tipo do encargo'); await p.waitForTimeout(400); t = await body();
  ok('E Informar encargos: tipos (juros, multa, IOF, anuidade, tarifa), a explicação de que o app não calcula juros e o valor', (await h1Name()) === 'Informar encargos' && ['Juros', 'Multa', 'IOF', 'Anuidade', 'Tarifa'].length === 5 &&
    t.includes('Juros, multa, IOF, anuidade ou tarifa que o banco cobrou nesta fatura. O Clarevo não calcula juros sozinho.') && t.includes('Fatura de novembro · Cartão Exemplo') && (await visibleCount('radio', /^(Juros|Multa|IOF|Anuidade|Tarifa)$/)) === 5);
  await keepText();
  await innerChecks('informar encargos 390px');
  await shot('140_informar_encargos');
  await btn('Salvar encargo').click(); await p.waitForTimeout(400);
  ok('E encargo sem tipo: "Escolha o tipo do encargo." e nada gravado', (await body()).includes('Escolha o tipo do encargo.') && (await countEntries(exemploId)) === entriesBefore + 1 + fixtureEntries);
  await radio('Anuidade').click(); await field('Valor do encargo').fill('30'); await btn('Salvar encargo').click(); await waitText('Encargo anotado na fatura.'); await waitInvoice('R$ 680,00'); t = await body();
  ok('E encargo de anuidade de R$ 30,00: a fatura vai a R$ 680,00, com a linha "Anuidade" e "Encargos R$ 30,00" no total', (await heroTotal()) === 'R$ 680,00' && (await visibleCount('button', 'Anuidade · R$ 30,00')) === 1 && /Encargos\s+R\$ 30,00/.test(t));
  await btn('Informar encargos').click(); await waitText('Tipo do encargo'); await radio('Juros').click(); await field('Valor do encargo').fill('12,50'); await btn('Salvar encargo').click(); await waitText('Encargo anotado na fatura.'); await waitInvoice('R$ 692,50');
  await btn('Juros · R$ 12,50').click(); await waitText('Editar lançamento'); t = await dialogText();
  ok('E tocar num encargo: "Editar lançamento" e "Excluir lançamento"', t.includes('Juros · R$ 12,50') && (await p.getByRole('alert').getByRole('button', { name: 'Editar lançamento' }).count()) === 1 && (await p.getByRole('alert').getByRole('button', { name: 'Excluir lançamento' }).count()) === 1);
  await p.getByRole('alert').getByRole('button', { name: 'Editar lançamento' }).last().click(); await waitText('Tipo do encargo'); await p.waitForTimeout(400);
  ok('E editar encargo: o formulário traz Juros e R$ 12,50', (await h1Name()) === 'Editar encargo' && (await radio('Juros').getAttribute('aria-checked')) === 'true' && (await field('Valor do encargo').inputValue()) === '12,50');
  await field('Valor do encargo').fill('15'); await btn('Salvar encargo').click(); await waitText('Encargo atualizado.'); await waitInvoice('R$ 695,00');
  ok('E encargo editado para R$ 15,00: a fatura vai a R$ 695,00', (await heroTotal()) === 'R$ 695,00' && (await visibleCount('button', 'Juros · R$ 15,00')) === 1);
  await btn('Juros · R$ 15,00').click(); await waitText('Excluir lançamento'); await p.getByRole('alert').getByRole('button', { name: 'Excluir lançamento' }).last().click(); await waitText('Excluir este lançamento?');
  await p.getByRole('alert').getByRole('button', { name: 'Excluir lançamento' }).last().click(); await waitText('Lançamento excluído.'); await waitInvoice('R$ 680,00');
  ok('E encargo excluído: a fatura volta a R$ 680,00', (await heroTotal()) === 'R$ 680,00' && (await visibleCount('button', /^Juros/)) === 0);
  await btn('Registrar estorno').click(); await waitText('Descrição do estorno'); await p.waitForTimeout(400); t = await body();
  ok('E Registrar estorno: descrição, valor e a categoria que ele abate', (await h1Name()) === 'Registrar estorno' && t.includes('Estorno ou devolução de uma compra. O valor abate a categoria escolhida.') && t.includes('Categoria que o estorno abate') && (await visibleCount('radio', 'Lazer')) === 1);
  await keepText();
  await shot('141_registrar_estorno');
  await btn('Salvar estorno').click(); await p.waitForTimeout(400);
  ok('E estorno sem valor: a mensagem do valor junto do campo e nada gravado', /Informe (um|o) valor/.test(await body()) && (await countEntries(exemploId)) === entriesBefore + 2 + fixtureEntries);
  await field('Valor do estorno').fill('50'); await btn('Salvar estorno').click(); await p.waitForTimeout(400);
  ok('E estorno sem descrição: "Dê um nome para este lançamento." e nada gravado', (await body()).includes('Dê um nome para este lançamento.') && (await countEntries(exemploId)) === entriesBefore + 2 + fixtureEntries);
  await field('Descrição do estorno').fill('Devolução do tênis'); await radio('Lazer').click(); await btn('Salvar estorno').click(); await waitText('Estorno registrado na fatura.'); await waitInvoice('R$ 630,00'); t = await body();
  ok('E estorno de R$ 50,00 em Lazer: a fatura vai a R$ 630,00 (650 + 30 - 50), com a linha "Devolução do tênis · − R$ 50,00" e "Estornos − R$ 50,00"', (await heroTotal()) === 'R$ 630,00' &&
    (await visibleCount('button', 'Devolução do tênis · − R$ 50,00')) === 1 && /Estornos\s+− R\$ 50,00/.test(t) && /Total da fatura\s+R\$ 630,00/.test(t));
  await keepText();
  await shot('142_fatura_com_encargo_e_estorno');
  // Pagar o total de uma fatura fechada: o pagamento entra em Pago, dividido por categoria (com "Encargos do cartão"). Na fatura de outubro:
  // anuidade de R$ 30,00 e estorno de R$ 50,00 em Lazer, informados a partir da fatura do banco (R$ 400,00 + 30 - 50 = R$ 380,00).
  await openCardPage(); await openInvoice('outubro');
  await btn('Informar encargos').click(); await waitText('Tipo do encargo'); await radio('Anuidade').click(); await field('Valor do encargo').fill('30'); await btn('Salvar encargo').click(); await waitText('Encargo anotado na fatura.'); await waitInvoice('R$ 430,00');
  await btn('Registrar estorno').click(); await waitText('Descrição do estorno'); await field('Descrição do estorno').fill('Devolução do ingresso'); await field('Valor do estorno').fill('50'); await radio('Lazer').click(); await btn('Salvar estorno').click(); await waitText('Estorno registrado na fatura.'); await waitInvoice('R$ 380,00'); t = await body();
  ok('E fatura de outubro com a anuidade (R$ 30,00) e o estorno (R$ 50,00): R$ 380,00 (400 + 30 - 50)', (await heroTotal()) === 'R$ 380,00' && (await visibleCount('button', 'Anuidade · R$ 30,00')) === 1 && (await visibleCount('button', 'Devolução do ingresso · − R$ 50,00')) === 1 && /Total da fatura\s+R\$ 380,00/.test(t));
  await btn('Pagar fatura').click(); await waitText('Confirmar pagamento'); await btn('Confirmar pagamento').click(); await waitText('Fatura paga. R$ 380,00 em Pago de outubro.'); await waitInvoice('Paga');
  t = await body();
  ok('E pagamento total da fatura fechada: "Paga", "Pago R$ 380,00 em 07/10/2026", encargo e estorno travados (só as compras aceitam descrição e categoria), "Desfazer pagamento" e nenhum saldo anterior', t.includes('Pago R$ 380,00 em 07/10/2026') && (await visibleCount('button', 'Anuidade · R$ 30,00')) === 0 && t.includes('Anuidade') &&
    (await visibleCount('button', 'Desfazer pagamento')) === 1 && !t.includes('Ficaram'));
  await goTab('Resumo'); await waitText('Diferença do mês');
  await expectTotals('E fatura de R$ 380,00 paga em 07/10: Pago 4.280 e diferença 1.720; recebido 6.000 e a pagar 650', 'R$ 6.000,00', 'R$ 4.280,00', 'R$ 1.720,00', 'R$ 650,00');
  await p.getByRole('button', { name: /^Pago, R\$/ }).filter({ visible: true }).first().click(); await waitText('Gastos pagos com data de pagamento neste mês.'); await p.waitForTimeout(400);
  t = await body();
  ok('E composição de Pago, "Por registro": o pagamento "Fatura Cartão Exemplo (outubro)" com a origem "Pagamento de fatura" (R$ 380,00)', t.includes('Fatura Cartão Exemplo (outubro)') && t.includes('Pago · 07/10/2026 · Pagamento de fatura') && t.includes('R$ 4.280,00'));
  await radio('Por categoria').click(); await p.waitForTimeout(800); t = await body();
  ok('E Por categoria: o pagamento da fatura é dividido pelas categorias das compras (Mercado R$ 300,00 e Lazer R$ 50,00, já com o estorno) e a anuidade em "Encargos do cartão" (R$ 30,00), somando Pago (R$ 4.280,00)',
    ['Moradia', 'R$ 2.500,00', 'Mercado', 'R$ 1.700,00', 'Lazer', 'R$ 50,00', 'Encargos do cartão', 'R$ 30,00', 'R$ 4.280,00'].every((x) => t.includes(x)) &&
    t.includes('O pagamento de uma fatura entra dividido pelas categorias das compras dela. Juros, multa e outras cobranças do banco ficam em Encargos do cartão.'), t.slice(0, 700));
  await keepText();
  await innerChecks('por categoria com fatura 390px');
  await shot('143_por_categoria_com_fatura');
  const cats = await p.getByRole('listitem').filter({ visible: true }).evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') ?? '').filter(Boolean));
  ok('E Por categoria: cada barra tem um nome acessível com valor e percentual ("Encargos do cartão, R$ 30,00, 0,7% do pago")', cats.length === 4 && cats.some((l) => /^Encargos do cartão, R\$ 30,00, \d+,\d% do pago/.test(l)) && cats.some((l) => /^Lazer, R\$ 50,00/.test(l)), JSON.stringify(cats));

  // Renda comprometida: grupo "Faturas de cartão" fora de "Dívidas" (a linha de dívidas continua só com o financiamento).
  await freshDemo();
  await rcRow().click(); await waitText('da sua renda de referência em outubro de 2026'); await p.waitForTimeout(400); t = await body();
  ok('E renda comprometida de outubro: continua 52,5% e não mostra "Faturas de cartão" (nenhuma fatura vence em outubro)', t.includes('52,5%') && !t.includes('Faturas de cartão'));
  await rcMonth('novembro de 2026'); t = await body();
  ok('E renda comprometida de novembro: 73,0%, o grupo "Faturas de cartão · R$ 550,00 · 9,2%" na composição, fora de "Dívidas" (R$ 850,00 · 14,2%), e a nota das faturas',
    t.includes('73,0%') && t.includes('Faturas de cartão · R$ 550,00 · 9,2%') && t.includes('Dívidas: R$ 850,00 · 14,2% da renda de referência.') && t.includes('Compras no cartão entram pela fatura, no mês do vencimento dela. A linha de dívidas continua só com financiamento e compra parcelada.') &&
    t.includes('Outras contas a pagar · R$ 300,00'), t.split('\n').filter((l) => /Faturas|Dívidas|Outras/.test(l)).join(' | '));
  const rcOrder = await p.evaluate(() => {
    const top = (text) => [...document.querySelectorAll('div[dir="auto"]')].find((e) => e.textContent.startsWith(text) && e.getBoundingClientRect().width > 0)?.getBoundingClientRect().top ?? null;
    return { parcel: top('Parcelamentos'), faturas: top('Faturas de cartão ·'), outras: top('Outras contas a pagar'), dividas: top('Dívidas:') };
  });
  ok('E renda comprometida: "Faturas de cartão" entra entre "Parcelamentos" e "Outras contas a pagar", e as dívidas ficam abaixo, separadas', rcOrder.parcel !== null && rcOrder.faturas !== null && rcOrder.outras !== null && rcOrder.dividas !== null &&
    rcOrder.parcel < rcOrder.faturas && rcOrder.faturas < rcOrder.outras && rcOrder.outras < rcOrder.dividas, JSON.stringify(rcOrder));
  await keepText();
  await innerChecks('renda comprometida com faturas 390px');
  await shot('144_renda_comprometida_faturas');
  await p.setViewportSize({ width: 320, height: 800 }); await p.waitForTimeout(400);
  await innerChecks('renda comprometida com faturas 320px');
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(300);
  await scrollTo('Contas do mês');
  await p.getByRole('button', { name: /^Fatura Cartão Exemplo, vence em 10\/11\/2026/ }).filter({ visible: true }).first().click(); await waitInvoice('Fatura de novembro');
  ok('E conta de fatura em "Contas do mês" da renda comprometida abre a fatura (nunca o detalhe da conta a pagar)', /^\/cartoes\/[^/]+\/fatura\/2026-11$/.test(urlPath()) && (await h1Name()) === 'Fatura', urlPath());

  // Contas a pagar: a fatura abre a fatura, sem "Já paguei", editar nem excluir. Faturas de outubro de outros cartões
  // (uma a vencer e duas vencidas), criadas por "outro aparelho", mostram as ações certas.
  await freshDemo();
  await otherDevice(async (repo, ctx) => {
    const k = () => `e2e-${Math.random()}`;
    const mk = async (name, dueDay, description, category, cents) => {
      const card = (await repo.createCard(k(), ctx, { name, lastDigits: null, closingDay: 1, dueDay, limitCents: null })).card;
      await repo.addCardPurchase(k(), card.id, { description, category, purchasedOn: '2026-09-20', totalCents: cents, installments: 1 });
    };
    await mk('Cartão azul', 5, 'Mochila', 'Lazer', 12000);
    await mk('Cartão roxo', 6, 'Livros', 'Educação', 6000);
    await mk('Cartão verde', 9, 'Presente', 'Lazer', 8000);
  });
  await p.getByRole('button', { name: /^Ainda a pagar neste mês, R\$/ }).filter({ visible: true }).first().click(); await waitText('Contas em aberto com vencimento até o fim do mês'); await waitText('Fatura Cartão verde'); await p.waitForTimeout(500);
  t = await body();
  const dueRows = (await sectionRows('Vencidas')) ?? [];
  const soonRows = (await sectionRows('A vencer em outubro de 2026')) ?? [];
  ok('E Contas a pagar: as faturas de outubro aparecem como contas (duas vencidas e uma a vencer), a de novembro em "Próximos meses"', dueRows.some((r) => r.startsWith('Fatura Cartão azul, venceu em 05/10/2026')) && dueRows.some((r) => r.startsWith('Fatura Cartão roxo, venceu em 06/10/2026')) &&
    soonRows.some((r) => r.startsWith('Fatura Cartão verde, vence em ') && r.includes('09/10') && r.endsWith('R$ 80,00')) && ((await sectionRows('Próximos meses')) ?? []).some((r) => r.startsWith('Fatura Cartão Exemplo, vence em 10/11/2026')), JSON.stringify([dueRows, soonRows]));
  ok('E Contas a pagar: conta de fatura nunca mostra "Já paguei" (só as outras contas a vencer mostram)', (await visibleCount('button', /^Já paguei.*Fatura/)) === 0 && (await visibleCount('button', /^Já paguei/)) >= 2);
  await p.getByRole('button', { name: /^Fatura Cartão verde, vence em / }).filter({ visible: true }).first().click(); await waitInvoice('Fatura de outubro'); t = await body();
  ok('E tocar na fatura de uma conta a pagar abre a fatura (fechada, vence em 09/10), com "Pagar fatura", e sem "Já paguei" nem "Editar conta" nem "Excluir conta"', /^\/cartoes\/[^/]+\/fatura\/2026-10$/.test(urlPath()) && t.includes('Fechada') && t.includes('R$ 80,00') && t.includes('Fechou em 01/10 · Vence em 09/10') &&
    (await visibleCount('button', 'Pagar fatura')) === 1 && (await visibleCount('button', 'Já paguei')) === 0 && (await visibleCount('button', /^Excluir/)) === 0 && t.includes('Fatura fechada: o valor só muda se você informar encargos, estornos ou novos lançamentos.'), `${urlPath()} ${t.slice(0, 300)}`);
  await keepText();
  await shot('145_fatura_fechada');
  await btn('Voltar').click(); await waitText('Contas em aberto com vencimento até o fim do mês');
  await p.getByRole('button', { name: 'Revisar vencidas' }).filter({ visible: true }).first().click(); await waitText('Marque o que você já pagou e tire o que não houve.'); await p.waitForTimeout(500); t = await body();
  ok('E Contas vencidas: as faturas têm "Abrir fatura" no lugar de "Já paguei" e "Não houve", sem caixa de seleção e fora do pagamento em lote',
    (await visibleCount('button', 'Abrir fatura: Fatura Cartão azul de outubro')) === 1 && (await visibleCount('button', 'Abrir fatura: Fatura Cartão roxo de outubro')) === 1 && (await visibleCount('button', /^Já paguei Fatura/)) === 0 && (await visibleCount('button', /^Não houve Fatura/)) === 0 &&
    (await visibleCount('checkbox', /Fatura Cartão/)) === 0 && t.includes('Fatura Cartão azul') && t.includes('Venceu em 05/10/2026'), t.slice(0, 500));
  await keepText();
  await shot('146_vencidas_com_faturas');
  await btn('Abrir fatura: Fatura Cartão azul de outubro').click(); await waitInvoice('Fatura de outubro'); t = await body();
  ok('E "Abrir fatura" nas vencidas leva à fatura do Cartão azul (R$ 120,00, venceu em 05/10)', /^\/cartoes\/[^/]+\/fatura\/2026-10$/.test(urlPath()) && t.includes('Cartão azul') && t.includes('R$ 120,00') && t.includes('Fechou em 01/10 · Venceu em 05/10'), `${urlPath()} ${t.slice(0, 200)}`);
  // Endereço de conta de fatura (/a-pagar/<id>), como o de um lembrete, e endereço direto da fatura: depois de entrar, abrem a fatura
  // (a demonstração é recriada com os mesmos identificadores).
  await freshDemo();
  const invoiceCommitmentId = await otherDevice(async (repo, ctx) => { const c = (await repo.listCards(ctx)).find((x) => x.name === 'Cartão Exemplo'); return (await repo.listInvoiceCommitments(c.id)).find((i) => i.invoice.month === '2026-11').id; });
  const exemploIdDeep = await cardIdOf('Cartão Exemplo');
  await p.goto(`http://localhost:${PORT}/a-pagar/${invoiceCommitmentId}`); await waitText('Seu dinheiro');
  await btn('Ver demonstração com dados fictícios').click(); await waitText('Lançamentos', 12000).catch(() => {}); await p.waitForTimeout(600);
  ok('E o endereço da conta de fatura (/a-pagar/<id>) abre a fatura (e não o detalhe da conta), sem "Já paguei"', urlPath() === `/cartoes/${exemploIdDeep}/fatura/2026-11` && (await h1Name()) === 'Fatura' && (await visibleCount('button', 'Já paguei')) === 0, urlPath());
  await p.goto(`http://localhost:${PORT}/cartoes/${exemploIdDeep}/fatura/2026-12`); await waitText('Seu dinheiro');
  await btn('Ver demonstração com dados fictícios').click(); await waitText('Lançamentos', 12000).catch(() => {}); await p.waitForTimeout(600);
  ok('E o endereço direto da fatura (/cartoes/<id>/fatura/2026-12) abre a fatura de dezembro', urlPath() === `/cartoes/${exemploIdDeep}/fatura/2026-12` && (await body()).includes('Fatura de dezembro'), urlPath());

  // Valores ocultos ("Ocultar valores"): nenhum valor das telas novas fica à vista, nem nos nomes acessíveis.
  await freshDemo();
  await openConta(); await hideSwitch().click(); await p.waitForTimeout(300); await btn('Voltar').click(); await waitText('Diferença do mês');
  await goTab('Movimentações'); await waitText('Registrar recebimento'); await p.waitForTimeout(400);
  await hiddenShows('Movimentos com Cartões');
  ok('E valores ocultos: a linha "Cartões" diz "R$ ••••" na tela e "valor oculto" no nome acessível', (await visibleCount('button', 'Cartões, Cartão Exemplo, fatura de novembro valor oculto')) === 1 && (await body()).includes('Cartão Exemplo · fatura de novembro R$ ••••'), (await sectionRows('Organizar') ?? []).join(' | '));
  await p.getByRole('button', { name: /^Cartões, / }).filter({ visible: true }).first().click(); await waitText('Cadastrar cartão'); await p.waitForTimeout(500);
  await hiddenShows('lista de cartões');
  ok('E valores ocultos: o cartão fala "valor oculto" (fatura e limite) e a barra do limite continua só desenho', (await visibleCount('button', /^Cartão Exemplo · final 1234\. Fatura de novembro · valor oculto · Aberta\. Fecha em 03\/11\. Vence em 10\/11\. Limite usado: valor oculto\.$/)) === 1 && (await body()).includes('Limite usado: R$ •••• de R$ ••••'));
  await keepText();
  await shot('147_cartoes_valores_ocultos');
  await cardTile().click(); await waitText('Fatura atual'); await p.waitForTimeout(500);
  await hiddenShows('cartão');
  await openInvoice('novembro'); await hiddenShows('fatura');
  ok('E valores ocultos na fatura: o total, as linhas e a composição ("Tênis de corrida · parcela 1 de 3 · valor oculto"), mas as parcelas e datas continuam', (await visibleCount('button', 'Tênis de corrida · parcela 1 de 3 · valor oculto')) === 1 && (await body()).includes('parcela 1 de 3 · compra em 05/10 · Lazer') && (await body()).includes('Fecha em 03/11 · Vence em 10/11'));
  await shot('148_fatura_valores_ocultos');
  // A fatura aberta não se paga: a de outubro (compra de 20/09/2026, fechada em 03/10) é a que recebe o pagamento.
  await otherDevice(async (repo, ctx, id) => {
    await repo.addCardPurchase(`e2e-set-${Math.random()}`, id, { description: 'Mercado de setembro', category: 'Mercado', purchasedOn: '2026-09-20', totalCents: 40000, installments: 1 });
  }, await cardIdOf('Cartão Exemplo'));
  await openCardPage(); await openInvoice('outubro');
  await btn('Pagar fatura').click(); await waitText('Confirmar pagamento'); await radio('Outro valor').click(); await field('Valor pago').fill('250'); await p.waitForTimeout(500);
  await hiddenShows('pagar fatura');
  ok('E valores ocultos ao pagar em parte: o aviso do que fica e o resumo do pagamento aparecem como "R$ ••••"', (await body()).includes('Ficaram R$ •••• para a fatura de novembro.') && (await body()).includes('O pagamento de R$ •••• entra em Pago de outubro.'));
  await btn('Confirmar pagamento').click(); await waitText('Pagamento registrado.'); await waitInvoice('Paga em parte');
  await hiddenShows('fatura paga em parte');
  ok('E valores ocultos depois de pagar: "Pagamento registrado. R$ •••• em Pago de outubro." e "Pago R$ •••• em 07/10/2026"', (await body()).includes('Pagamento registrado. R$ •••• em Pago de outubro.') && (await body()).includes('Pago R$ •••• em 07/10/2026'));
  await goTab('Resumo'); await waitText('Diferença do mês');
  await btn('Anotar gasto').click(); await waitText('Será salvo em'); await radio('Cartão de crédito').click(); await field('Descrição').fill('Livro'); await field('Valor em reais').fill('90'); await field('Em quantas vezes?').fill('3'); await p.waitForTimeout(500);
  await hiddenShows('Anotar compra no cartão');
  ok('E valores ocultos no aviso da compra parcelada: "3 parcelas, a primeira de R$ ••••"', (await body()).includes('3 parcelas, a primeira de R$ ••••.'));
  await btn('Cancelar').click(); await p.waitForTimeout(300); if (await visibleCount('button', 'Descartar alterações')) await btn('Descartar alterações').click();
  await waitText('Diferença do mês');
  await openConta(); await hideSwitch().click(); await p.waitForTimeout(300); await btn('Voltar').click(); await waitText('Diferença do mês');

  // Conta nova: nenhum cartão de exemplo. "Cadastrar cartão" pelo Anotar gasto, a validação do formulário, editar, arquivar e excluir.
  await newAcct('Eva Teste', 'eva@exemplo.com');
  await goTab('Movimentações'); await waitText('Registrar recebimento'); t = await body();
  ok('E conta nova: a linha "Cartões" convida a anotar compras na fatura e nenhum cartão de exemplo existe', (await visibleCount('button', 'Cartões, Nenhum cadastrado. Anote compras na fatura')) === 1 && !t.includes('Cartão Exemplo') && (await otherDevice(async (repo, ctx) => (await repo.listCards(ctx)).length)) === 0);
  await goTab('Resumo'); await waitText('Diferença do mês');
  await btn('Anotar gasto').click(); await waitText('Será salvo em'); await radio('Cartão de crédito').click(); await p.waitForTimeout(400); t = await body();
  ok('E Anotar gasto sem cartão cadastrado: "Você ainda não cadastrou um cartão." com "Cadastrar cartão", sem pergunta de parcelas e sem salvar compra', t.includes('Você ainda não cadastrou um cartão.') && (await visibleCount('button', 'Cadastrar cartão')) === 1 && (await visibleCount('textbox', 'Em quantas vezes?')) === 0);
  await field('Descrição').fill('Mercado do mês'); await field('Valor em reais').fill('90');
  await btn('Cadastrar cartão').click(); await waitText('Apelido do cartão'); await p.waitForTimeout(500); t = await body();
  ok('E Novo cartão (vindo de Anotar gasto): apelido, últimos 4 dígitos (opcional), dias, limite, a regra de privacidade e o aviso de que volta para anotar a compra', (await h1Name()) === 'Novo cartão' &&
    ['Apelido do cartão', 'Por exemplo: Nubank ou Cartão do mercado', 'Últimos 4 dígitos (opcional)', 'Só os 4 últimos dígitos. Nunca o número completo, o código de segurança nem a validade.', 'Dia do fechamento', 'Compras depois desse dia entram na fatura seguinte.',
      'Dia do vencimento', 'Se o mês for mais curto, usamos o último dia dele.', 'Limite (opcional)', 'Guardamos só o apelido e os 4 últimos dígitos. Nunca digite o número completo, o código de segurança nem a validade.', 'Depois de cadastrar, você volta para anotar a compra.'].every((x) => t.includes(x)), t.slice(0, 300));
  await keepText();
  await innerChecks('novo cartão 390px');
  await shot('149_novo_cartao');
  await p.setViewportSize({ width: 320, height: 800 }); await p.waitForTimeout(400);
  await innerChecks('novo cartão 320px');
  await shot('149_novo_cartao_320px', true);
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(300);
  await btn('Salvar cartão').click(); await p.waitForTimeout(400); t = await body();
  ok('E cartão sem nada: as mensagens de apelido e dos dois dias, junto dos campos, e nada gravado', t.includes('Dê um apelido de 1 a 30 caracteres, como Nubank.') && t.includes('Informe o dia do fechamento, de 1 a 31.') && t.includes('Informe o dia do vencimento, de 1 a 31.') &&
    (await otherDevice(async (repo, ctx) => (await repo.listCards(ctx)).length)) === 0);
  await field('Apelido do cartão').fill('4111 1111 1111 1111'); await field('Dia do fechamento').fill('3'); await field('Dia do vencimento').fill('10'); await btn('Salvar cartão').click(); await p.waitForTimeout(400);
  ok('E apelido que parece número de cartão: recusado com "Não use o número do cartão no apelido. Use os 4 últimos dígitos no campo próprio." e nada gravado', (await body()).includes('Não use o número do cartão no apelido. Use os 4 últimos dígitos no campo próprio.') &&
    (await otherDevice(async (repo, ctx) => (await repo.listCards(ctx)).length)) === 0);
  await field('Apelido do cartão').fill('Nubank'); await field('Últimos 4 dígitos (opcional)').fill('4111111111111111'); await p.waitForTimeout(200);
  ok('E campo de final: só 4 dígitos (o número completo digitado é cortado e nunca fica no formulário)', (await field('Últimos 4 dígitos (opcional)').inputValue()) === '4111');
  await field('Últimos 4 dígitos (opcional)').fill('5678'); await field('Limite (opcional)').fill('5000');
  await btn('Salvar cartão').click(); await waitText('Compra no cartão · Nubank · final 5678'); await waitText('Esta compra entra na fatura de novembro do Nubank', 12000).catch(() => {}); await p.waitForTimeout(300);
  t = await body();
  ok('E cartão salvo pelo Anotar gasto: volta ao formulário com o Nubank escolhido, a descrição e o valor mantidos, e o aviso da fatura (novembro: hoje é depois do fechamento do dia 3)', (await h1Name()) === 'Anotar gasto' && t.includes('Compra no cartão · Nubank · final 5678') && (await field('Descrição').inputValue()) === 'Mercado do mês' &&
    t.includes('Esta compra entra na fatura de novembro do Nubank e conta em Pago quando a fatura for paga.') && (await otherDevice(async (repo, ctx) => (await repo.listCards(ctx)).length)) === 1, t.slice(0, 400));
  await btn('Anotar compra no cartão').click(); await waitText('Compra anotada na fatura de novembro.'); await waitInvoice('Fatura de novembro'); t = await body();
  ok('E primeira compra no cartão novo: a fatura de novembro do Nubank (R$ 90,00) e o Resumo da conta nova continua sem Pago', (await heroTotal()) === 'R$ 90,00' && t.includes('Nubank') && (await visibleCount('button', 'Mercado do mês · R$ 90,00')) === 1);
  await goTab('Resumo'); await waitText('Diferença do mês'); t = await body();
  ok('E conta nova: a compra no cartão não entra em Pago (continua R$ 0,00)', t.includes('R$ 0,00') && !t.includes('R$ 90,00'));
  await openCardsList(); await p.getByRole('button', { name: /^Nubank · final 5678\./ }).filter({ visible: true }).first().click(); await waitText('Fatura atual'); await p.waitForTimeout(400); t = await body();
  ok('E cartão novo com uma compra: o limite usado soma as parcelas não pagas (R$ 90,00 de R$ 5.000,00) e não oferece excluir', t.includes('Limite usado: R$ 90,00 de R$ 5.000,00') && (await visibleCount('button', 'Excluir cartão')) === 0 && t.includes('Fecha no dia 3 · vence no dia 10'));
  await btn('Editar cartão').click(); await waitText('Apelido do cartão'); await p.waitForTimeout(400);
  ok('E Editar cartão: traz o apelido, o final, os dias e o limite (R$ 5.000,00)', (await h1Name()) === 'Editar cartão' && (await field('Apelido do cartão').inputValue()) === 'Nubank' && (await field('Últimos 4 dígitos (opcional)').inputValue()) === '5678' &&
    (await field('Dia do fechamento').inputValue()) === '3' && (await field('Dia do vencimento').inputValue()) === '10' && (await field('Limite (opcional)').inputValue()) === '5.000,00');
  await field('Apelido do cartão').fill('Nubank roxo'); await field('Dia do fechamento').fill('20'); await btn('Salvar cartão').click(); await waitText('Cartão salvo.'); await p.waitForTimeout(500); t = await body();
  ok('E cartão editado: "Cartão salvo.", o novo apelido e os dias (fecha 20, vence 10) valem; a compra já feita continua na fatura em que foi gravada', t.includes('Nubank roxo') && t.includes('Fecha no dia 20 · vence no dia 10') && (await otherDevice(async (repo, ctx) => (await repo.listCards(ctx))[0].name)) === 'Nubank roxo');
  await btn('Arquivar cartão').click(); await waitText('Arquivar este cartão?'); t = await dialogText();
  ok('E arquivar: o diálogo explica que o histórico fica e que dá para reativar', t.includes('Ele sai da escolha de compras novas. As faturas e o histórico continuam aqui, e você pode reativar quando quiser.'));
  await confirmIn('Arquivar cartão'); await waitText('Cartão arquivado.'); await p.waitForTimeout(500); t = await body();
  ok('E cartão arquivado: o selo "Arquivado", a faixa de aviso e "Reativar cartão" no lugar de arquivar; sem "Anotar compra neste cartão"', t.includes('Arquivado') && t.includes('Este cartão está arquivado. As faturas e o histórico continuam aqui.') && (await visibleCount('button', 'Reativar cartão')) === 1 &&
    (await visibleCount('button', 'Arquivar cartão')) === 0 && (await visibleCount('button', 'Anotar compra neste cartão')) === 0);
  await goTab('Resumo'); await waitText('Diferença do mês'); await btn('Anotar gasto').click(); await waitText('Será salvo em'); await radio('Cartão de crédito').click(); await p.waitForTimeout(400);
  ok('E cartão arquivado não é oferecido em Anotar gasto: volta o convite "Você ainda não cadastrou um cartão."', (await body()).includes('Você ainda não cadastrou um cartão.'));
  await btn('Cancelar').click(); await p.waitForTimeout(300); if (await visibleCount('button', 'Descartar alterações')) await btn('Descartar alterações').click();
  await waitText('Diferença do mês');
  await openCardsList(); t = await body();
  ok('E lista de cartões: o arquivado aparece em "Cartões arquivados"', t.includes('Cartões arquivados') && t.includes('Nubank roxo') && t.includes('Arquivado'));
  await p.getByRole('button', { name: /^Nubank roxo · final 5678\./ }).filter({ visible: true }).first().click(); await waitText('Reativar cartão');
  await btn('Reativar cartão').click(); await waitText('Cartão reativado.'); await p.waitForTimeout(400);
  ok('E reativar cartão: "Cartão reativado." e "Arquivar cartão" de volta', (await visibleCount('button', 'Arquivar cartão')) === 1 && (await visibleCount('button', 'Reativar cartão')) === 0);
  // Cartão sem lançamentos pode ser excluído.
  await goTab('Movimentações'); await waitText('Registrar recebimento');
  await p.getByRole('button', { name: /^Cartões, / }).filter({ visible: true }).first().click(); await waitText('Cadastrar cartão');
  await btn('Cadastrar cartão').click(); await waitText('Apelido do cartão'); await field('Apelido do cartão').fill('Cartão do mercado'); await field('Dia do fechamento').fill('15'); await field('Dia do vencimento').fill('25');
  await btn('Salvar cartão').click(); await waitText('Cartão salvo.'); await p.waitForTimeout(500); t = await body();
  ok('E cartão sem compras: "Nenhuma compra neste cartão ainda.", "Limite usado: R$ 0,00" (sem limite informado) e "Excluir cartão" disponível', t.includes('Nenhuma compra neste cartão ainda.') && t.includes('Limite usado: R$ 0,00') && !t.includes('de R$') && (await visibleCount('button', 'Excluir cartão')) === 1);
  await btn('Excluir cartão').click(); await waitText('Excluir este cartão?');
  await p.getByRole('alert').getByRole('button', { name: 'Excluir cartão' }).last().click(); await waitText('Cartão excluído.'); await p.waitForTimeout(500); t = await body();
  ok('E cartão excluído: "Cartão excluído." e sai da lista (o Nubank roxo continua)', !t.includes('Cartão do mercado') && t.includes('Nubank roxo') && (await otherDevice(async (repo, ctx) => (await repo.listCards(ctx)).length)) === 1);
  }

  {
  // ==================================================================================================================
  // Ciclo E · Notas (D-038, passo 3). "Escanear nota fiscal" é o primeiro elemento de Anotar gasto novo; a leitura só preenche
  // o formulário (nada é gravado sem "Salvar gasto"); o registro leva só o resumo da chave. Sem câmera no roteiro: valem "Colar o link
  // ou a chave", a nota de exemplo (fictícia, identificada, de teste) e o PDF por um arquivo sintético. A leitura da página da Sefaz-RJ
  // só existe no celular (na web, só o link oficial) e o contêiner não alcança a Sefaz: o parser tem testes no core com HTML sintético.
  // Hoje é 07/10/2026; a demonstração começa com Recebido 6.000 / Pago 3.900 / Diferença 2.100 / Ainda a pagar 650.
  const goTabN = async (name) => {
    const tab = () => p.getByRole('tab', { name }).filter({ visible: true });
    for (let i = 0; i < 8; i++) { await tab().first().waitFor({ timeout: 1500 }).catch(() => {}); if ((await tab().count()) > 0) break; await btn('Voltar').click(); await p.waitForTimeout(400); }
    await tab().first().click(); await p.waitForTimeout(500);
  };
  const waitInvoiceN = async (hero) => { await waitText('Lançamentos'); await waitText(hero); await p.waitForTimeout(500); };
  const stepTitleN = () => p.evaluate(() => [...document.querySelectorAll('[role=heading][aria-level="2"]')].filter((e) => e.getBoundingClientRect().width > 0).map((e) => e.getAttribute('aria-label'))[0] ?? null);
  const urlPathN = () => new URL(p.url()).pathname;
  const activeLabel = () => p.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? null);
  const activeTag = () => p.evaluate(() => document.activeElement?.tagName ?? null);
  const dialogButtons = () => p.getByRole('alert').filter({ visible: true }).last().getByRole('button').evaluateAll((es) => es.map((e) => e.getAttribute('aria-label') || e.textContent));
  const heroTotalN = async () => (await body()).match(/Fatura de [^\n]+\n[^\n]+\n[^\n]+\n(R\$ [\d.]+,\d{2})/)?.[1] ?? null;
  const recordsOf = (month = '2026-10') => otherDevice(async (repo, ctx, m) => (await repo.listRecords(ctx, m)).map((r) => ({ id: r.id, d: r.description, c: r.amountCents, cat: r.category, on: r.occurredOn, key: r.receiptKey })), month);
  // Chave de acesso e QR de NFC-e do RJ sintéticos (CNPJ 11.222.333/0001-81, o exemplo público). Dígito verificador por módulo 11.
  const accessKey = (aamm, model, number, cnpj = '11222333000181') => {
    const body43 = `33${aamm}${cnpj}${model}001${String(number).padStart(9, '0')}187654321`;
    let sum = 0; for (let i = 0; i < 43; i++) sum += (body43.charCodeAt(42 - i) - 48) * (2 + (i % 8));
    const r = sum % 11;
    return body43 + String(r < 2 ? 0 : 11 - r);
  };
  const RJ = 'https://consultadfe.fazenda.rj.gov.br/consultaNFCe/QRCode?p=';
  const HASH = 'ABCDEF0123456789ABCDEF0123456789ABCDEF01';
  const qrOnline = (key) => `${RJ}${key}|2|1|1|${HASH}`;
  const qrContingency = (key, day, value) => `${RJ}${key}|2|1|${day}|${value}|0123456789ABCDEF0123456789ABCDEF01234567|1|${HASH}`;
  const NOTE_AUG = accessKey('2608', '65', 777);
  const NFE = accessKey('2610', '55', 4321);
  const OTHER_CNPJ = '45723174000110';
  const NFE_PDF_KEY = accessKey('2610', '55', 8899, OTHER_CNPJ);
  const notesTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'clarevo-notas-'));
  // PDF mínimo de texto (Helvetica, uma linha por Tj): só para o roteiro; o DANFE sintético traz destinatário fictício que não pode aparecer.
  const makePdf = (lines) => {
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
  const spacedKey = (k) => k.replace(/(.{4})/g, '$1 ').trim();
  const danfeLines = (key, issued, total) => [
    'RECEBEMOS DE LOJA EXEMPLO LTDA OS PRODUTOS E/OU SERVIÇOS CONSTANTES DA NOTA FISCAL ELETRÔNICA INDICADA AO LADO',
    'DANFE', 'Documento Auxiliar da Nota Fiscal Eletrônica',
    'CHAVE DE ACESSO', spacedKey(key),
    'DATA DA EMISSÃO', issued,
    'DESTINATÁRIO / REMETENTE', 'NOME / RAZÃO SOCIAL', 'FULANA DE TAL EXEMPLO', 'CNPJ / CPF', '123.456.789-09', 'ENDEREÇO', 'RUA DO DESTINATARIO FICTICIA, 1',
    'CÁLCULO DO IMPOSTO', 'VALOR TOTAL DA NOTA', total,
  ];
  const pdfOk = path.join(notesTmp, 'danfe-exemplo.pdf');
  const pdfNoKey = path.join(notesTmp, 'sem-chave.pdf');
  const notPdf = path.join(notesTmp, 'texto.pdf');
  fs.writeFileSync(pdfOk, makePdf(danfeLines(NFE_PDF_KEY, '05/10/2026', '150,00')));
  fs.writeFileSync(pdfNoKey, makePdf(['PEDIDO DE COMPRA', 'Obrigado pela compra', 'Valor total 150,00']));
  fs.writeFileSync(notPdf, 'isto não é um PDF, só texto');
  // Rede: nenhuma consulta à Sefaz sai do app na web (o link só abre quando a pessoa toca), e a nota de exemplo nunca chama a rede.
  const netNotes = []; p.on('request', (r) => /fazenda\.rj\.gov\.br|nota-de-exemplo\.invalid/.test(r.url()) && netNotes.push(`${r.method()} ${r.url()}`));
  await ctx.route('**://consultadfe.fazenda.rj.gov.br/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<html><body>Página da Sefaz simulada pelo roteiro.</body></html>' }));
  const toBlock = async () => { await p.getByText('Nota lida:', { exact: false }).filter({ visible: true }).first().evaluate((e) => e.scrollIntoView({ block: 'start' })); await p.waitForTimeout(300); };
  const scanLine = () => p.getByRole('button', { name: /^Escanear nota fiscal\./ }).filter({ visible: true }).first();
  const openScan = async () => { await scanLine().click(); await waitText('Como você quer ler a nota?'); };
  const openPaste = async () => { await openScan(); await btn('Colar o link ou a chave').click(); await waitText('Colar o link ou a chave da nota'); await p.waitForTimeout(300); };
  const pasteNote = async (text) => { await openPaste(); await field('Colar o link ou a chave da nota').fill(text); await btn('Ler a nota').click(); await waitText('Nota lida:'); await p.waitForTimeout(700); };
  const newExpense = async () => { await goTabN('Resumo'); await waitText('Diferença do mês'); await btn('Anotar gasto').click(); await waitText('Será salvo em'); await p.waitForTimeout(500); };
  const leaveForm = async () => { await btn('Cancelar').click(); await p.waitForTimeout(300); if (await visibleCount('button', 'Descartar alterações')) await btn('Descartar alterações').click(); await waitText('Diferença do mês'); };

  await freshDemo();
  await btn('Anotar gasto').click(); await waitText('Será salvo em'); await p.waitForTimeout(500);
  const tops = await p.evaluate(() => {
    const line = [...document.querySelectorAll('[role=button]')].find((e) => (e.getAttribute('aria-label') || '').startsWith('Escanear nota fiscal') && e.getBoundingClientRect().width > 0);
    const text = (s) => [...document.querySelectorAll('div[dir="auto"]')].find((e) => e.textContent.startsWith(s) && e.getBoundingClientRect().width > 0);
    const situation = text('Gasto já pago');
    return { line: line ? line.getBoundingClientRect().top : null, height: line ? Math.round(line.getBoundingClientRect().height) : null, situation: situation ? situation.getBoundingClientRect().top : null, label: line?.getAttribute('aria-label') };
  });
  ok('N Anotar gasto: "Escanear nota fiscal" é o primeiro elemento do formulário (acima da legenda "Gasto já pago"), com a linha de 56 px e a dica "Cupom do mercado ou PDF de compra on-line"',
    tops.line !== null && tops.situation !== null && tops.line < tops.situation && tops.height >= 56 && tops.label === 'Escanear nota fiscal. Cupom do mercado ou PDF de compra on-line.' && (await body()).includes('Cupom do mercado ou PDF de compra on-line'), JSON.stringify(tops));
  await keepText();
  await innerChecks('anotar gasto com a linha de escanear 390px');
  await shot('150_anotar_gasto_escanear');
  await p.setViewportSize({ width: 320, height: 800 }); await p.waitForTimeout(400);
  await innerChecks('anotar gasto com a linha de escanear 320px');
  await shot('150_anotar_gasto_escanear_320px', true);
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(300);

  // A folha do primeiro toque: câmera só quando há câmera (o navegador do roteiro não tem), PDF e colar sempre; "Cancelar" não faz nada.
  await openScan(); t = await dialogText(); const sheetButtons = await dialogButtons();
  ok('N folha do primeiro toque: título, a frase de privacidade (só um resumo da chave, sem CPF nem link), "Escolher o PDF da nota" antes de "Colar o link ou a chave" (sem câmera no navegador do roteiro, o PDF vem primeiro) e "Cancelar"; "Usar a câmera" só aparece com câmera',
    t.includes('Como você quer ler a nota?') && t.includes('Guardamos só um resumo da chave de acesso da nota, para avisar se ela for lida de novo. Não guardamos CPF, a chave nem o link.') && JSON.stringify(sheetButtons.filter((x) => x !== 'Usar a câmera')) === JSON.stringify(['Escolher o PDF da nota', 'Colar o link ou a chave', 'Cancelar']) && (sheetButtons.length === 3 || sheetButtons[0] === 'Usar a câmera'), JSON.stringify(sheetButtons));
  await keepText();
  await shot('151_folha_escanear');
  await p.setViewportSize({ width: 320, height: 800 }); await p.waitForTimeout(400);
  await layoutChecks('folha de escanear 320px');
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(300);
  await confirmIn('Cancelar'); await p.waitForTimeout(300);
  ok('N "Cancelar" na folha fecha sem ler nada: a linha continua e o formulário está intacto', (await visibleCount('button', /^Escanear nota fiscal\./)) === 1 && !(await body()).includes('Nota lida'));

  // Colar: códigos que não servem. O campo explica sem culpar.
  await openPaste(); t = await body();
  ok('N "Colar o link ou a chave": título, campo com dica, "Ler a nota"; na demonstração, "Usar nota de exemplo" com o aviso de que é fictícia', ['Colar o link ou a chave', 'Cole o link do QR da nota ou os 44 caracteres da chave de acesso.', 'Nota de exemplo fictícia, só para conhecer o recurso.'].every((x) => t.includes(x)) &&
    (await visibleCount('button', 'Ler a nota')) === 1 && (await visibleCount('button', 'Usar nota de exemplo')) === 1);
  await shot('152_colar_nota');
  await p.setViewportSize({ width: 320, height: 800 }); await p.waitForTimeout(400);
  await layoutChecks('colar a nota 320px');
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(300);
  await field('Colar o link ou a chave da nota').fill('abc'); await btn('Ler a nota').click(); await p.waitForTimeout(300); t = await body();
  ok('N texto que não é de nota: "Não reconhecemos este código como de uma nota fiscal..." junto do campo, nada preenchido', t.includes('Não reconhecemos este código como de uma nota fiscal.') && !t.includes('Nota lida'));
  await field('Colar o link ou a chave da nota').fill('3326 1011 2223 3300 0181 6500 1000 0123 4518 7654 3219'); await btn('Ler a nota').click(); await p.waitForTimeout(300);
  ok('N chave com dígito errado: "A chave não confere. Confira os números ou escaneie de novo."', (await body()).includes('A chave não confere. Confira os números ou escaneie de novo.'));
  // Boleto (Bradesco, 237, linha digitável e código de barras): outro tipo de código, não é chave de nota.
  await field('Colar o link ou a chave da nota').fill('23791.23454 67890.123457 67890.123457 6 98760000012345'); await btn('Ler a nota').click(); await p.waitForTimeout(300); t = await body();
  ok('N código de boleto colado: "Este é o código de um boleto. Para anotar uma conta que ainda vai vencer, use Anotar conta a pagar." com o botão que abre essa tela, e nada é lido nem guardado',
    t.includes('Este é o código de um boleto. Para anotar uma conta que ainda vai vencer, use Anotar conta a pagar.') && (await visibleCount('button', 'Anotar conta a pagar')) >= 1 && !t.includes('Nota lida'));
  await field('Colar o link ou a chave da nota').fill('23796987600000123451234567890123456789012345'); await btn('Ler a nota').click(); await p.waitForTimeout(300);
  ok('N código de barras de boleto (44 dígitos que começam como o CE) também é reconhecido como boleto', (await body()).includes('Este é o código de um boleto.'));
  await btn('Anotar conta a pagar').last().click(); await waitText('Anotar conta a pagar'); await p.waitForTimeout(500);
  ok('N "Anotar conta a pagar" do aviso do boleto abre a tela de conta a pagar', urlPathN() === '/a-pagar/nova', urlPathN());
  await btn('Cancelar').click(); await p.waitForTimeout(300); if (await visibleCount('button', 'Descartar alterações')) await btn('Descartar alterações').click();
  await p.waitForTimeout(300);
  await waitText('Será salvo em');

  // Nota de exemplo (demonstração): rascunho, bloco "Nota lida", foco no valor, mensagens do que falta e nenhuma chamada de rede.
  await openPaste(); await btn('Usar nota de exemplo').click(); await waitText('Nota lida:'); await p.waitForTimeout(800);
  t = await body();
  ok('N nota de exemplo: bloco "Nota lida: CNPJ 11.222.333/0001-81 · RJ · outubro de 2026" no lugar da linha, a nota de teste e nada de "Preenchemos o que a nota informa" (falta o valor), sem "Ver a nota no site da Sefaz"',
    t.includes('Nota lida: CNPJ 11.222.333/0001-81 · RJ · outubro de 2026') && !t.includes('Preenchemos o que a nota informa.') && t.includes('Esta é uma nota de teste, sem valor fiscal.') &&
    (await visibleCount('button', /^Escanear nota fiscal\./)) === 0 && (await visibleCount('button', 'Ver a nota no site da Sefaz')) === 0, t.slice(0, 500));
  ok('N o que a nota não traz é dito com clareza: "O valor não vem no código desta nota. Digite o total impresso no cupom.", o dia de hoje usado e o CNPJ sem o nome',
    t.includes('O valor não vem no código desta nota. Digite o total impresso no cupom.') && t.includes('O dia da compra não vem no código desta nota. Usamos o de hoje. Mude se foi outro dia.') && t.includes('O código traz o CNPJ da loja, não o nome. Digite o nome na descrição.'));
  ok('N foco no primeiro campo que falta (Valor em reais), data de hoje e descrição vazia (nunca "Compra (CNPJ ...)")',
    (await activeLabel()) === 'Valor em reais' && (await field('Data do pagamento').inputValue()) === '07/10/2026' && (await field('Descrição').inputValue()) === '' && !(await body()).includes('Compra (CNPJ') &&
    (await field('Descrição').getAttribute('placeholder')) === 'Ex.: Mercado');
  ok('N o bloco é uma região viva que anuncia "Nota lida" (leitores de tela), com "Ler outra nota" e "Desfazer leitura", e nenhum número longo (a chave) na tela',
    (await p.getByRole('alert').filter({ hasText: 'Nota lida:' }).count()) >= 1 && (await visibleCount('button', 'Ler outra nota')) === 1 && (await visibleCount('button', 'Desfazer leitura')) === 1 && !/\d{20,}/.test(t.replace(/[\s.]/g, '')));
  ok('N a nota de exemplo não chama a rede (nem a Sefaz, nem o domínio reservado dela)', netNotes.length === 0, netNotes.join(' | '));
  await keepText();
  await innerChecks('nota lida 390px');
  await toBlock(); await shot('153_nota_lida');
  await p.setViewportSize({ width: 320, height: 800 }); await p.waitForTimeout(400);
  await innerChecks('nota lida 320px');
  await toBlock(); await shot('153_nota_lida_320px');
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(300);

  // Desfazer leitura: o formulário volta ao que era.
  await field('Valor em reais').fill('12'); await p.waitForTimeout(200);
  await btn('Desfazer leitura').click(); await p.waitForTimeout(400);
  ok('N "Desfazer leitura": o bloco sai, a linha "Escanear nota fiscal" volta e o valor digitado pela pessoa é mantido', (await visibleCount('button', /^Escanear nota fiscal\./)) === 1 && !(await body()).includes('Nota lida:') && (await field('Valor em reais').inputValue()) === '12,00');
  await field('Valor em reais').fill('');

  // Tocar numa categoria com a descrição vazia, depois de ler uma nota sem o nome da loja, preenche a descrição com o nome dela.
  await openPaste(); await btn('Usar nota de exemplo').click(); await waitText('Nota lida:'); await p.waitForTimeout(800);
  await field('Valor em reais').fill('87,40'); await radio('Mercado').click(); await p.waitForTimeout(300);
  ok('N categoria tocada com a descrição vazia preenche a descrição com o nome dela ("Mercado")', (await field('Descrição').inputValue()) === 'Mercado');
  const before = await recordsOf();
  await btn('Salvar gasto').click(); await waitText('Gasto salvo'); await p.waitForTimeout(600); t = await body();
  const saved = (await recordsOf()).filter((r) => r.d === 'Mercado' && r.c === 8740);
  ok('N salvar a nota lida: gasto de R$ 87,40 em 07/10/2026, categoria Mercado, com a linha "Nota fiscal · Anotada com a leitura da nota"; o link da Sefaz não existe (nota de teste) e o detalhe explica que só o resumo da chave fica',
    /^\/registro\/[^/]+$/.test(urlPathN()) && saved.length === 1 && saved[0].c === 8740 && saved[0].on === '2026-10-07' && saved[0].cat === 'Mercado' && t.includes('Nota fiscal') && t.includes('Anotada com a leitura da nota') &&
    t.includes('Guardamos só um resumo da chave da nota, não o link.') && (await visibleCount('button', 'Ver a nota no site da Sefaz')) === 0 && (await recordsOf()).length === before.length + 1, JSON.stringify(saved));
  ok('N o registro leva só o resumo SHA-256 da chave (64 hexadecimais), nunca a chave de 44 dígitos', saved.length === 1 && /^[0-9a-f]{64}$/.test(saved[0].key ?? '') && !String(saved[0].key).includes('33261011'));
  const savedId = saved[0].id;
  await keepText();
  await shot('154_nota_salva');
  await btn('Editar registro').click(); await waitText('Será salvo em'); await p.waitForTimeout(400);
  ok('N editar o gasto de uma nota: sem a linha "Escanear nota fiscal" (só em gasto novo)', (await visibleCount('button', /^Escanear nota fiscal\./)) === 0 && (await visibleCount('button', 'Salvar gasto')) === 1);
  await btn('Cancelar').click(); await p.waitForTimeout(300); if (await visibleCount('button', 'Descartar alterações')) await btn('Descartar alterações').click();
  await goTabN('Resumo'); await waitText('Diferença do mês');
  await expectTotals('N a nota salva entra em Pago como qualquer gasto: 6.000 / 3.987,40 / 2.012,60 e 650', 'R$ 6.000,00', 'R$ 3.987,40', 'R$ 2.012,60');

  // Ler a mesma nota de novo: aviso de nota já anotada com o caminho para o registro; a gravação repetida é recusada.
  await btn('Anotar gasto').click(); await waitText('Será salvo em'); await p.waitForTimeout(400);
  await openPaste(); await btn('Usar nota de exemplo').click(); await waitText('Nota lida:'); await waitText('Esta nota já foi anotada em', 8000); await p.waitForTimeout(500); t = await body();
  ok('N mesma nota lida de novo: "Esta nota já foi anotada em 07/10/2026: Mercado, R$ 87,40." com "Abrir registro"', t.includes('Esta nota já foi anotada em 07/10/2026: Mercado, R$ 87,40.') && (await visibleCount('button', 'Abrir registro')) === 1);
  await keepText();
  await toBlock(); await shot('155_nota_ja_anotada');
  await field('Valor em reais').fill('87,40'); await field('Descrição').fill('Mercado de novo'); await btn('Salvar gasto').click(); await p.waitForTimeout(800);
  ok('N salvar a nota repetida é recusado ("Esta nota já está anotada...") e nada é gravado a mais', (await body()).includes('Esta nota já está anotada. Abra o registro para conferir ou leia outra nota.') && (await recordsOf()).length === before.length + 1 && urlPathN() === '/registro/novo', urlPathN());
  await btn('Abrir registro').click(); await waitText('Anotada com a leitura da nota'); await p.waitForTimeout(400);
  ok('N "Abrir registro" abre o gasto já anotado', urlPathN() === `/registro/${savedId}`, urlPathN());
  await btn('Voltar').click(); await waitText('Será salvo em'); await leaveForm();

  // QR oficial do RJ com valor e dia (contingência): preenche tudo, o teclado fica fechado, a memória da loja repete a descrição e a categoria
  // e "Ver a nota no site da Sefaz" abre o endereço oficial (na web, só o link: a página não é lida).
  await btn('Anotar gasto').click(); await waitText('Será salvo em'); await p.waitForTimeout(400);
  const noteB = accessKey('2610', '65', 12346);
  await pasteNote(qrContingency(noteB, '06', '45.90')); t = await body();
  ok('N QR com valor e dia: "Nota lida: CNPJ 11.222.333/0001-81 · RJ · R$ 45,90 · 06/10/2026", valor 45,90 e data 06/10/2026, sem mensagem de falta e com o teclado fechado',
    t.includes('Nota lida: CNPJ 11.222.333/0001-81 · RJ · R$ 45,90 · 06/10/2026') && t.includes('Preenchemos o que a nota informa. Confira e toque em Salvar.') && (await field('Valor em reais').inputValue()) === '45,90' && (await field('Data do pagamento').inputValue()) === '06/10/2026' && !t.includes('não vem no código') &&
    (await activeTag()) !== 'INPUT' && (await activeTag()) !== 'TEXTAREA', `${await activeTag()} ${t.slice(0, 300)}`);
  ok('N mesma loja (mesmo CNPJ) já anotada neste aparelho: descrição e categoria da última vez, com a legenda "Como da última vez nesta loja"',
    (await field('Descrição').inputValue()) === 'Mercado' && (await radio('Mercado').getAttribute('aria-checked')) === 'true' && t.includes('Como da última vez nesta loja'));
  ok('N com o endereço oficial do RJ: "Ver a nota no site da Sefaz" no bloco e, na web, o aviso de que o Clarevo não lê a página (só o link)', (await visibleCount('button', 'Ver a nota no site da Sefaz')) === 1 &&
    t.includes('Neste navegador, a página da Sefaz não pode ser lida pelo Clarevo. Abra a nota no site da Sefaz e digite o total.') && !t.includes('Lendo a página da Sefaz'));
  const [tab] = await Promise.all([ctx.waitForEvent('page'), btn('Ver a nota no site da Sefaz').click()]);
  await tab.waitForURL(/consultadfe\.fazenda\.rj\.gov\.br/, { timeout: 8000 }).catch(() => {});
  const tabUrl = tab.url(); await tab.close();
  ok('N "Ver a nota no site da Sefaz" abre o endereço oficial do QR em outra aba (o app não busca a página na web)', tabUrl.startsWith('https://consultadfe.fazenda.rj.gov.br/consultaNFCe/QRCode?p=') && netNotes.every((x) => x.startsWith('GET')) && !netNotes.some((x) => x.includes('nota-de-exemplo')), `${tabUrl} ${netNotes.join(' | ')}`);
  await keepText();
  await toBlock(); await shot('156_nota_com_link');
  await btn('Salvar gasto').click(); await waitText('Gasto salvo'); await p.waitForTimeout(600); t = await body();
  ok('N gasto salvo logo depois da leitura: o detalhe tem "Ver a nota no site da Sefaz" (o endereço só vive na sessão; o registro guarda só o resumo da chave)', (await visibleCount('button', 'Ver a nota no site da Sefaz')) === 1 && t.includes('Anotada com a leitura da nota') && !t.includes('Guardamos só um resumo da chave da nota, não o link.'));
  await keepText();
  await shot('157_nota_salva_com_link');

  // NF-e (modelo 55): a chave sozinha, com o convite para anotar como parcelamento (carnê ou crediário).
  await goTabN('Resumo'); await waitText('Diferença do mês'); await btn('Anotar gasto').click(); await waitText('Será salvo em'); await p.waitForTimeout(400);
  await pasteNote(NFE); t = await body();
  ok('N chave de NF-e (modelo 55) colada: bloco da nota, valor em falta e "Comprou no carnê ou crediário? Anotar como parcelamento" (nunca para NFC-e)', t.includes('Nota lida:') && t.includes('O valor não vem no código desta nota.') && (await visibleCount('button', 'Comprou no carnê ou crediário? Anotar como parcelamento')) === 1 &&
    (await visibleCount('button', 'Ver a nota no site da Sefaz')) === 0);
  await btn('Comprou no carnê ou crediário? Anotar como parcelamento').click(); await p.waitForTimeout(800);
  ok('N "Anotar como parcelamento" abre o cadastro de parcelamento com a descrição da loja', urlPathN() === '/gastos-fixos/novo' && (await field('Descrição').inputValue()) === 'Mercado', `${urlPathN()} ${await field('Descrição').inputValue().catch(() => '')}`);
  await shot('158_nota_como_parcelamento');
  await btn('Cancelar').click().catch(() => {}); await p.waitForTimeout(300); if (await visibleCount('button', 'Descartar alterações')) await btn('Descartar alterações').click();
  await p.waitForTimeout(300);
  ok('N voltar do parcelamento mantém o formulário com a nota lida', urlPathN() === '/registro/novo' && (await body()).includes('Nota lida:'), urlPathN());
  await leaveForm();

  // Nota de outro mês, só a chave: o dia precisa ser escolhido dentro do mês da nota (aviso leve se a data sai dele).
  await btn('Anotar gasto').click(); await waitText('Será salvo em'); await p.waitForTimeout(400);
  await pasteNote(NOTE_AUG); t = await body();
  ok('N chave de agosto: o dia fica em branco ("Escolha o dia em agosto de 2026"), o valor falta e o foco vai para o Valor',
    t.includes('Nota lida: CNPJ 11.222.333/0001-81 · RJ · agosto de 2026') && t.includes('O dia da compra não vem no código desta nota. Escolha o dia em agosto de 2026.') && (await field('Data do pagamento').inputValue()) === '' && (await activeLabel()) === 'Valor em reais');
  await field('Data do pagamento').fill('07102026'); await p.waitForTimeout(300);
  ok('N data fora do mês da nota: aviso leve ("A nota é de agosto de 2026. A data escolhida é de outro mês."), sem bloquear', (await body()).includes('A nota é de agosto de 2026. A data escolhida é de outro mês.'));
  await field('Data do pagamento').fill('15082026'); await p.waitForTimeout(300);
  ok('N data dentro do mês da nota: o aviso some', !(await body()).includes('A data escolhida é de outro mês.') && (await field('Data do pagamento').inputValue()) === '15/08/2026');
  await leaveForm();

  // Leitura da página da Sefaz-RJ: no celular o app a busca no aparelho; aqui, um gancho do roteiro (globalThis.__clarevoSefazFetch) entrega uma
  // página SINTÉTICA no lugar do fetch, para exercitar o caminho completo (a Sefaz real não é alcançável e o navegador bloquearia por CORS).
  const SEFAZ_KEY = accessKey('2610', '65', 5150, OTHER_CNPJ);
  const sefazHtml = (key) => `<html><head><script>var x='Valor a pagar R$ 1,00';</script></head><body><div id="u20" class="txtTopo">MERCADO EXEMPLO LTDA</div><div class="text">CNPJ: 45.723.174/0001-10</div><table id="tabResult"><tr id="Item + 1"><td>PRODUTO EXEMPLO</td></tr></table><div id="totalNota"><div><label>Qtd. total de itens:</label><span>1</span></div><div><label>Valor a pagar R$:</label><span>63,70</span></div></div><div id="infos"><ul><li><strong>Emissão: </strong>06/10/2026 10:15:00 - Via Consumidor</li></ul><h4>Consumidor</h4><ul><li>CPF: 123.456.789-09 Nome: FULANA DE TAL EXEMPLO</li></ul><h4>Chave de acesso</h4><span>${spacedKey(key)}</span></div></body></html>`;
  await btn('Anotar gasto').click(); await waitText('Será salvo em'); await p.waitForTimeout(400);
  await p.evaluate((html) => { window.__sefazCalls = []; window.__sefazMode = 'ok'; window.__sefazHtml = html; window.__clarevoSefazFetch = async (url) => { window.__sefazCalls.push(url); if (window.__sefazMode === 'erro') return { ok: false, status: 503, url, text: async () => '' }; if (window.__sefazMode === 'semurl') return { ok: true, status: 200, text: async () => window.__sefazHtml }; return { ok: true, status: 200, url, text: async () => window.__sefazHtml }; }; }, sefazHtml(SEFAZ_KEY));
  await openPaste(); await field('Colar o link ou a chave da nota').fill(qrOnline(SEFAZ_KEY)); await btn('Ler a nota').click(); await waitText('Nota lida:'); await waitText('Loja, valor e data lidos da página da Sefaz.', 8000); await p.waitForTimeout(600); t = await body();
  const sefazCalls = await p.evaluate(() => window.__sefazCalls);
  ok('N página da Sefaz lida: "Nota lida: Mercado Exemplo Ltda · RJ · R$ 63,70 · 06/10/2026", valor 63,70, data 06/10/2026 e a descrição com o nome da loja ("Nome da loja lido da nota"), com "Loja, valor e data lidos da página da Sefaz"',
    t.includes('Nota lida: Mercado Exemplo Ltda · RJ · R$ 63,70 · 06/10/2026') && (await field('Valor em reais').inputValue()) === '63,70' && (await field('Data do pagamento').inputValue()) === '06/10/2026' && (await field('Descrição').inputValue()) === 'Mercado Exemplo Ltda' &&
    t.includes('Nome da loja lido da nota') && t.includes('Loja, valor e data lidos da página da Sefaz. Confira antes de salvar.') && !t.includes('não vem no código') && t.includes('Preenchemos o que a nota informa.'), t.slice(0, 500));
  ok('N a leitura da página busca só o endereço oficial do QR (uma vez) e o app não mostra CPF nem nome do consumidor (a página os trazia)', sefazCalls.length === 1 && sefazCalls[0] === qrOnline(SEFAZ_KEY) && !/FULANA|123\.456\.789/.test(t) && !t.includes('Neste navegador, a página da Sefaz não pode ser lida'), JSON.stringify(sefazCalls));
  await keepText();
  await toBlock(); await shot('163_pagina_da_sefaz_lida');
  // Ler outra nota substitui o que a leitura anterior preencheu; página que não abre cai no preenchimento manual, sem perder nada.
  await p.evaluate(() => { window.__sefazMode = 'erro'; });
  const SEFAZ_KEY2 = accessKey('2610', '65', 5151, OTHER_CNPJ);
  await btn('Ler outra nota').click(); await waitText('Como você quer ler a nota?'); await btn('Colar o link ou a chave').click(); await waitText('Colar o link ou a chave da nota'); await p.waitForTimeout(300);
  await field('Colar o link ou a chave da nota').fill(qrOnline(SEFAZ_KEY2)); await btn('Ler a nota').click(); await waitText('Não deu para ler a página da Sefaz.', 8000); await p.waitForTimeout(600); t = await body();
  ok('N página da Sefaz que não abre: "Não deu para ler a página da Sefaz. Confira o valor no cupom.", o valor volta a faltar (a nota nova substitui a anterior) e o formulário segue manual',
    t.includes('Não deu para ler a página da Sefaz. Confira o valor no cupom.') && t.includes('O valor não vem no código desta nota. Digite o total impresso no cupom.') && (await field('Valor em reais').inputValue()) === '' && (await field('Descrição').inputValue()) === '' &&
    (await visibleCount('button', 'Ver a nota no site da Sefaz')) === 1 && t.includes('Nota lida: CNPJ 45.723.174/0001-10 · RJ'), t.slice(0, 500));
  await p.evaluate((html) => { window.__sefazMode = 'ok'; window.__sefazHtml = html; }, sefazHtml(accessKey('2610', '65', 9999, OTHER_CNPJ)));
  await btn('Ler outra nota').click(); await waitText('Como você quer ler a nota?'); await btn('Colar o link ou a chave').click(); await waitText('Colar o link ou a chave da nota'); await p.waitForTimeout(300);
  await field('Colar o link ou a chave da nota').fill(qrOnline(SEFAZ_KEY)); await btn('Ler a nota').click(); await waitText('A página da Sefaz é de outra nota.', 8000); await p.waitForTimeout(500);
  ok('N página da Sefaz de outra nota (chave diferente): "A página da Sefaz é de outra nota. Confira o valor no cupom." e nada é aproveitado', (await body()).includes('A página da Sefaz é de outra nota. Confira o valor no cupom.') && (await field('Valor em reais').inputValue()) === '');
  // A página só vale se mostra a chave lida ou o CNPJ do emitente; e a resposta precisa dizer de qual endereço veio.
  const readAgain = async () => { await btn('Ler outra nota').click(); await waitText('Como você quer ler a nota?'); await btn('Colar o link ou a chave').click(); await waitText('Colar o link ou a chave da nota'); await p.waitForTimeout(300); await field('Colar o link ou a chave da nota').fill(qrOnline(SEFAZ_KEY)); await btn('Ler a nota').click(); await p.waitForTimeout(800); };
  await p.evaluate(() => { window.__sefazMode = 'ok'; window.__sefazHtml = '<div class="txtTopo">LOJA FALSA</div><div>Valor a pagar R$: 9.999,99</div><div>Emissão: 06/10/2026</div>'; });
  await readAgain(); await waitText('Não deu para ler a página da Sefaz.', 8000);
  ok('N página que não mostra a chave nem o CNPJ do emitente: nada é aproveitado ("Não deu para ler a página da Sefaz."), valor e nome não vêm da página', (await field('Valor em reais').inputValue()) === '' && !(await body()).includes('LOJA FALSA') && !(await body()).includes('9.999,99'));
  await p.evaluate((html) => { window.__sefazMode = 'semurl'; window.__sefazHtml = html; }, sefazHtml(SEFAZ_KEY));
  await readAgain(); await waitText('Não deu para ler a página da Sefaz.', 8000);
  ok('N resposta sem o endereço de onde veio (poderia ser de outro domínio): recusada, nada é aproveitado', (await field('Valor em reais').inputValue()) === '' && !(await body()).includes('Mercado Exemplo Ltda'));
  await p.evaluate(() => { delete window.__clarevoSefazFetch; });
  await leaveForm();

  // PDF do DANFE (compras on-line): escolhido pelo seletor de arquivos, lido no aparelho; destinatário nunca aparece.
  await btn('Anotar gasto').click(); await waitText('Será salvo em'); await p.waitForTimeout(400);
  await openScan();
  const [chooser] = await Promise.all([p.waitForEvent('filechooser'), btn('Escolher o PDF da nota').click()]);
  await chooser.setFiles(notPdf); await waitText('Este arquivo não é um PDF.'); await p.waitForTimeout(300);
  ok('N arquivo que não é PDF: "Este arquivo não é um PDF." e nada preenchido', (await body()).includes('Este arquivo não é um PDF.') && !(await body()).includes('Nota lida:'));
  await openScan();
  const [chooser2] = await Promise.all([p.waitForEvent('filechooser'), btn('Escolher o PDF da nota').click()]);
  await chooser2.setFiles(pdfNoKey); await waitText('Não encontramos a chave de acesso neste PDF.', 15000); await p.waitForTimeout(300);
  ok('N PDF sem a chave de acesso: "Não encontramos a chave de acesso neste PDF. Confira se é o PDF da nota fiscal (o DANFE)."', (await body()).includes('Não encontramos a chave de acesso neste PDF. Confira se é o PDF da nota fiscal (o DANFE).') && !(await body()).includes('Nota lida:'));
  await openScan();
  const [chooser3] = await Promise.all([p.waitForEvent('filechooser'), btn('Escolher o PDF da nota').click()]);
  await chooser3.setFiles(pdfOk); await waitText('Nota lida:', 20000); await p.waitForTimeout(800); t = await body();
  ok('N PDF do DANFE: "Nota lida: Loja Exemplo Ltda · RJ · R$ 150,00 · 05/10/2026", valor 150,00, data 05/10/2026 e descrição com o nome da loja; teclado fechado (nada falta)',
    t.includes('Nota lida: Loja Exemplo Ltda · RJ · R$ 150,00 · 05/10/2026') && (await field('Valor em reais').inputValue()) === '150,00' && (await field('Data do pagamento').inputValue()) === '05/10/2026' && (await field('Descrição').inputValue()) === 'Loja Exemplo Ltda' &&
    t.includes('Nome da loja lido da nota') && (await activeTag()) !== 'INPUT', t.slice(0, 400));
  ok('N PDF do DANFE: nada do destinatário na tela (nome, CPF, endereço), nem a chave inteira, e a NF-e oferece o parcelamento',
    !/FULANA|123\.456\.789|DESTINATARIO|RUA DO/i.test(t) && !/\d{20,}/.test(t.replace(/[\s.]/g, '')) && (await visibleCount('button', 'Comprou no carnê ou crediário? Anotar como parcelamento')) === 1);
  await keepText();
  await innerChecks('nota do PDF 390px');
  await toBlock(); await shot('159_nota_pdf');
  await p.setViewportSize({ width: 320, height: 800 }); await p.waitForTimeout(400);
  await innerChecks('nota do PDF 320px');
  await toBlock(); await shot('159_nota_pdf_320px');
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(300);
  // O PDF também vira compra no cartão: "Cartão de crédito" + a mesma nota.
  await radio('Cartão de crédito').click(); await p.waitForTimeout(500);
  const exemploId = await otherDevice(async (repo, ctx) => (await repo.listCards(ctx)).find((c) => c.name === 'Cartão Exemplo').id);
  const entriesBeforeNote = await otherDevice(async (repo, ctx, id) => (await repo.listCardEntries(id)).length, exemploId);
  await btn('Anotar compra no cartão').click(); await waitText('Lançamentos', 12000); await p.waitForTimeout(600); t = await body();
  const noteEntries = await otherDevice(async (repo, ctx, id) => (await repo.listCardEntries(id)).map((e) => ({ id: e.id, d: e.description, c: e.amountCents, key: e.receiptKey, kind: e.kind })), exemploId);
  const fromNote = noteEntries.find((e) => e.d === 'Loja Exemplo Ltda');
  ok('N a nota do PDF vira compra no cartão: abre a fatura de novembro com a compra de R$ 150,00 e o resumo da chave no lançamento (nunca a chave)', /^\/cartoes\/[^/]+\/fatura\/2026-11$/.test(urlPathN()) && !!fromNote && fromNote.c === 15000 && /^[0-9a-f]{64}$/.test(fromNote.key ?? '') &&
    noteEntries.length === entriesBeforeNote + 1 && (await visibleCount('button', 'Loja Exemplo Ltda · R$ 150,00')) === 1, `${urlPathN()} ${JSON.stringify(fromNote)}`);
  await goTabN('Resumo'); await waitText('Diferença do mês');
  await expectTotals('N compra no cartão vinda de nota não entra em Pago (continua 6.000 / 3.987,40 + 45,90 = 4.033,30)', 'R$ 6.000,00', 'R$ 4.033,30', 'R$ 1.966,70');
  await btn('Anotar gasto').click(); await waitText('Será salvo em'); await p.waitForTimeout(400);
  await openScan();
  const [chooser4] = await Promise.all([p.waitForEvent('filechooser'), btn('Escolher o PDF da nota').click()]);
  await chooser4.setFiles(pdfOk); await waitText('Nota lida:', 20000); await waitText('Esta nota já foi anotada em', 8000); await p.waitForTimeout(500); t = await body();
  ok('N a mesma nota (agora numa compra no cartão): "Esta nota já foi anotada em 05/10/2026 no cartão Cartão Exemplo: Loja Exemplo Ltda, R$ 150,00." com "Abrir registro"', t.includes('Esta nota já foi anotada em 05/10/2026 no cartão Cartão Exemplo: Loja Exemplo Ltda, R$ 150,00.') && (await visibleCount('button', 'Abrir registro')) === 1);
  await btn('Abrir registro').click(); await waitText('Lançamentos', 12000); await p.waitForTimeout(500);
  ok('N "Abrir registro" da compra no cartão abre a fatura em que ela está', /^\/cartoes\/[^/]+\/fatura\/2026-11$/.test(urlPathN()), urlPathN());

  // B1 · Editar uma compra no cartão pela linha da fatura (descrição, valor, data, categoria e parcelas).
  await btn('Loja Exemplo Ltda · R$ 150,00').click(); await p.waitForTimeout(400); const lineChoices = await dialogButtons();
  ok('N linha da compra na fatura: o menu oferece "Editar compra" e "Excluir lançamento" (encargo e estorno seguem com "Editar lançamento")', lineChoices.includes('Editar compra') && lineChoices.includes('Excluir lançamento'), JSON.stringify(lineChoices));
  await btn('Editar compra').click(); await waitText('Valor total da compra'); await p.waitForTimeout(500); t = await body();
  ok('N Editar compra: título, fatura e cartão, descrição, valor total, data da compra, parcelas e categoria preenchidos; a compra da nota explica de onde veio', (await h1Name()) === 'Editar compra' && (await field('Descrição').inputValue()) === 'Loja Exemplo Ltda' &&
    (await field('Valor total da compra').inputValue()) === '150,00' && (await field('Data da compra').inputValue()) === '05/10/2026' && (await field('Em quantas vezes?').inputValue()) === '1' && t.includes('Compra anotada com a leitura de uma nota fiscal.') &&
    t.includes('Fatura de novembro · Cartão Exemplo'));
  await keepText();
  await innerChecks('editar compra 390px');
  await shot('160_editar_compra');
  await p.setViewportSize({ width: 320, height: 800 }); await p.waitForTimeout(400);
  await innerChecks('editar compra 320px');
  await shot('160_editar_compra_320px', true);
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(300);
  await field('Valor total da compra').fill('0'); await btn('Salvar compra').click(); await p.waitForTimeout(400);
  ok('N compra com valor zero: a mensagem do valor junto do campo e nada é gravado', (await body()).includes('Informe um valor maior que zero, como 80,00.'), (await body()).slice(0, 300));
  await field('Valor total da compra').fill('300'); await field('Em quantas vezes?').fill('2'); await field('Descrição').fill('Loja Exemplo (2x)'); await radio('Lazer').click(); await p.waitForTimeout(400);
  ok('N editar parcelas: o aviso mostra "2 parcelas, a primeira de R$ 150,00"', (await body()).includes('2 parcelas, a primeira de R$ 150,00. As outras 1 entram nas faturas seguintes.'));
  await btn('Salvar compra').click(); await waitText('Compra alterada. As parcelas foram recalculadas.'); await waitText('Lançamentos'); await p.waitForTimeout(600);
  const edited = (await otherDevice(async (repo, ctx, id) => (await repo.listCardEntries(id)).map((e) => ({ d: e.description, c: e.amountCents, n: e.installments, cat: e.category, key: e.receiptKey })), exemploId)).find((e) => e.d === 'Loja Exemplo (2x)');
  ok('N compra editada: R$ 300,00 em 2 parcelas, categoria Lazer, a nota (resumo da chave) mantida; a fatura de novembro soma R$ 150,00 e volta com o aviso',
    !!edited && edited.c === 30000 && edited.n === 2 && edited.cat === 'Lazer' && /^[0-9a-f]{64}$/.test(edited.key ?? '') && (await visibleCount('button', 'Loja Exemplo (2x) · parcela 1 de 2 · R$ 150,00')) === 1 && /^\/cartoes\/[^/]+\/fatura\/2026-11$/.test(urlPathN()), JSON.stringify(edited));
  await shot('161_compra_editada');
  await btn('Próxima fatura: dezembro').click(); await waitInvoiceN('Fatura de dezembro');
  ok('N a segunda parcela cai na fatura de dezembro (R$ 350,00 + R$ 150,00 = R$ 500,00)', (await heroTotalN()) === 'R$ 500,00' && (await visibleCount('button', 'Loja Exemplo (2x) · parcela 2 de 2 · R$ 150,00')) === 1, `${await heroTotalN()}`);

  // B2 · Seus últimos meses: a conta de fatura abre a fatura (como em Contas a pagar), sem "Já paguei" nem "Não houve".
  await p.goto(`http://localhost:${PORT}/?cenario=retorno`); await waitText('Seu dinheiro');
  await btn('Ver demonstração com dados fictícios').click(); await waitText('Diferença do mês'); await waitText('Sua última anotação foi em 20/05/2026.', 12000).catch(() => {});
  await otherDevice(async (repo, ctx) => {
    const k = () => `e2e-${Math.random()}`;
    const card = (await repo.createCard(k(), ctx, { name: 'Cartão azul', lastDigits: null, closingDay: 1, dueDay: 5, limitCents: null })).card;
    await repo.addCardPurchase(k(), card.id, { description: 'Mochila', category: 'Lazer', purchasedOn: '2026-09-20', totalCents: 12000, installments: 1 });
  });
  await btn('Ver resumo').click(); await waitText('Mês sem anotação não quer dizer mês sem gastos.'); await btn('Atualizar agora').click(); await waitText('Mês 1 de');
  for (let i = 0; i < 8 && !/este mês/.test((await stepTitleN()) ?? ''); i++) {
    if (await visibleCount('button', 'Próximo mês')) await btn('Próximo mês').click(); else await btn('Pular este mês').click();
    await p.waitForTimeout(500);
  }
  await waitText('Abrir fatura: Fatura Cartão azul de outubro', 8000).catch(() => {}); t = await body();
  ok('N Seus últimos meses (este mês): a fatura de cartão vencida tem "Abrir fatura" no lugar de "Já paguei" e "Não houve", e fica fora do lote',
    (await visibleCount('button', 'Abrir fatura: Fatura Cartão azul de outubro')) === 1 && (await visibleCount('button', /^Já paguei: Fatura/)) === 0 && (await visibleCount('button', /^Não houve: Fatura/)) === 0 && (await visibleCount('checkbox', /Fatura Cartão/)) === 0 &&
    t.includes('Fatura Cartão azul'), t.slice(0, 600));
  await keepText();
  await shot('162_ultimos_meses_com_fatura');
  await btn('Abrir fatura: Fatura Cartão azul de outubro').click(); await waitText('Lançamentos', 12000); await p.waitForTimeout(500);
  ok('N "Abrir fatura" em Seus últimos meses leva à fatura do Cartão azul (R$ 120,00, venceu em 05/10)', /^\/cartoes\/[^/]+\/fatura\/2026-10$/.test(urlPathN()) && (await body()).includes('Cartão azul') && (await body()).includes('R$ 120,00'), `${urlPathN()}`);

  // Conta nova: nunca recebe nota de exemplo nem dado algum; o campo de colar não oferece "Usar nota de exemplo".
  await newAcct('Eva Notas', 'eva.notas@exemplo.com');
  await btn('Anotar gasto').click(); await waitText('Será salvo em'); await p.waitForTimeout(400);
  ok('N conta nova: a linha "Escanear nota fiscal" existe e nenhuma nota foi lida nem guardada antes de a pessoa tocar', (await visibleCount('button', /^Escanear nota fiscal\./)) === 1 && !(await body()).includes('Nota lida') && (await recordsOf()).length === 0);
  await openPaste(); t = await body();
  ok('N conta nova: o campo de colar não oferece "Usar nota de exemplo" (só a demonstração)', (await visibleCount('button', 'Usar nota de exemplo')) === 0 && !t.includes('Nota de exemplo fictícia'));
  await field('Colar o link ou a chave da nota').fill(qrOnline(accessKey('2610', '65', 4545))); await btn('Ler a nota').click(); await waitText('Nota lida:'); await p.waitForTimeout(700);
  ok('N conta nova: ler a nota preenche o formulário e não grava nada até "Salvar gasto" (nenhum registro criado)', (await recordsOf()).length === 0 && (await activeLabel()) === 'Valor em reais' && (await visibleCount('button', 'Ver a nota no site da Sefaz')) === 1);
  await leaveForm();
  }

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

  // 2. Faixa no Resumo: sem valores, depois de "Anotar gasto" (D-039), com a pílula "Demonstração".
  await enterReturnDemo();
  await waitText('4 meses com algo sem registro').catch(() => {});
  let band = await bandText();
  ok('retorno: faixa "Seus últimos meses" com a última anotação, 4 meses e 13 contas, e a nota', band !== null && band.includes(BAND_BODY) &&
    band.includes('Atualizar é opcional. Nada é preenchido sem a sua confirmação.') && (await visibleCount('button', 'Ver resumo')) === 1 && (await visibleCount('button', 'Seguir adiante')) === 1, band ?? '');
  ok('retorno: nenhum valor em reais na faixa', band !== null && !band.includes('R$'), band ?? '');
  const bo = await bandOrder();
  ok('retorno: a faixa fica no lugar dos avisos temporários, depois de "Anotar gasto" (D-039), título de nível 2', bo.faixa !== null && bo.anotar !== null && bo.anotar < bo.faixa &&
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

  // ==================================================================================================================
  // Navegação (D-039): "Anotar gasto" logo abaixo do cabeçalho; "Ver contas ›" e "›" em Recebido e Pago; barra inferior nas
  // telas de consulta (e só nos formulários sem ela); Contas a pagar no mês certo, com seletor local; vencida em poucos
  // toques; lembretes em Contas a pagar; Metas compacta; busca de Aprender com o grupo "No app". Cada item é conferido em 390
  // e em 320 px de largura. Capturas novas: 160 em diante. Os totais de outubro da demonstração seguem 6.000 / 3.900 / 2.100 / 650.
  // ==================================================================================================================
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
  const MOV_TAB = 'Movimentos: movimentações do mês';
  const tabLabel = (name) => (name === 'Movimentações' ? MOV_TAB : name);
  const tabByName = (name) => p.getByRole('tab', { name: tabLabel(name), exact: true }).filter({ visible: true }).first();
  // Estado da barra inferior: as quatro abas visíveis, onde terminam e qual está marcada.
  const barState = () => p.evaluate(() => {
    const names = ['Resumo', 'Movimentos: movimentações do mês', 'Metas', 'Aprender e dúvidas'];
    const tabs = [...document.querySelectorAll('[role=tab]')].filter((e) => names.includes(e.getAttribute('aria-label')) && e.getBoundingClientRect().width > 0);
    const rects = tabs.map((e) => e.getBoundingClientRect());
    return {
      n: tabs.length,
      selected: tabs.filter((e) => e.getAttribute('aria-selected') === 'true').map((e) => e.getAttribute('aria-label')),
      bottom: rects.length ? Math.round(Math.max(...rects.map((r) => r.bottom))) : 0,
      top: rects.length ? Math.round(Math.min(...rects.map((r) => r.top))) : 0,
      minH: rects.length ? Math.round(Math.min(...rects.map((r) => r.height))) : 0,
      out: rects.filter((r) => r.left < -0.5 || r.right > window.innerWidth + 0.5).length,
      h: window.innerHeight,
      overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
    };
  });
  // Telas pequenas medidas na altura de um celular simples: 360 × 640 e 320 × 640.
  const SMALL_SCREENS = [[360, 640], [320, 640]];
  const atSmall = async (fn) => {
    for (const [w, h] of SMALL_SCREENS) { await p.setViewportSize({ width: w, height: h }); await p.waitForTimeout(450); await fn(w, h); }
    await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(350);
  };
  const barOk = (s) => s.n === 4 && s.bottom <= s.h + 1 && s.bottom >= s.h - 40 && s.out === 0 && s.minH >= 44 && !s.overflow;
  const checkBar = (label, selected = null) => atWidths(async (w) => {
    const s = await barState();
    ok(`${label} (${w}px): barra inferior à vista, com as 4 abas${selected ? ` e "${selected}" marcada` : ''}`, barOk(s) && (selected === null || (s.selected.length === 1 && s.selected[0] === tabLabel(selected))), JSON.stringify(s));
  });
  const checkNoBar = (label) => atWidths(async (w) => { ok(`${label} (${w}px): formulário sem barra inferior`, (await barState()).n === 0); });
  // Posições (topo e base) de elementos visíveis por papel e texto exato ou por nome acessível.
  const nodeBox = (role, text) => p.evaluate(({ role, text }) => {
    const sel = role === 'heading' ? '[role=heading]' : '[role=button]';
    const e = [...document.querySelectorAll(sel)].find((x) => (x.textContent === text || x.getAttribute('aria-label') === text) && x.getBoundingClientRect().width > 0);
    if (!e) return null;
    const b = e.getBoundingClientRect();
    return { top: Math.round(b.top), bottom: Math.round(b.bottom), h: window.innerHeight };
  }, { role, text });
  const axDescription = async (namePrefix) => {
    const { nodes } = await cdp.send('Accessibility.getFullAXTree');
    const n = nodes.find((x) => !x.ignored && x.role?.value === 'button' && (x.name?.value ?? '').startsWith(namePrefix));
    return n ? { name: n.name.value, description: n.description?.value ?? '' } : null;
  };
  const navBackTo = async (tabName) => { await tabByName(tabName).click(); await p.waitForTimeout(500); };

  // ---- 1. Resumo: "Anotar gasto" logo abaixo do cabeçalho; "Ver contas ›"; "›" em Recebido e Pago ----
  await demoHome();
  t = await body();
  ok('nav Resumo: totais de outubro da demonstração seguem Recebido 6.000, Pago 3.900, Diferença 2.100 e Ainda a pagar 650',
    (await p.getByRole('button', { name: /^Recebido, R\$ 6\.000,00/ }).filter({ visible: true }).count()) === 1 && (await p.getByRole('button', { name: /^Pago, R\$ 3\.900,00/ }).filter({ visible: true }).count()) === 1 &&
    (await p.getByRole('button', { name: /^Diferença do mês, R\$ 2\.100,00/ }).filter({ visible: true }).count()) === 1 && (await p.getByRole('button', { name: /^Ainda a pagar neste mês, R\$ 650,00/ }).filter({ visible: true }).count()) === 1);
  const resumoLayout = (w) => p.evaluate(() => {
    const top = (sel, pred) => { const e = [...document.querySelectorAll(sel)].find((x) => pred(x) && x.getBoundingClientRect().width > 0); return e ? e.getBoundingClientRect() : null; };
    const anotar = top('[role=button]', (x) => x.textContent === 'Anotar gasto');
    const pago = top('[role=button]', (x) => (x.getAttribute('aria-label') || '').startsWith('Pago, '));
    const toPay = top('[role=button]', (x) => (x.getAttribute('aria-label') || '').startsWith('Ainda a pagar neste mês,'));
    const ver = top('[role=button]', (x) => x.getAttribute('aria-label') === 'Ver contas a pagar');
    return { anotarTop: anotar && Math.round(anotar.top), anotarBottom: anotar && Math.round(anotar.bottom), pagoBottom: pago && Math.round(pago.bottom), toPayTop: toPay && Math.round(toPay.top), verContasH: ver && Math.round(ver.height), verContasW: ver && Math.round(ver.width), h: window.innerHeight };
  });
  await atWidths(async (w) => {
    const r = await resumoLayout(w);
    ok(`nav Resumo (${w}px): "Anotar gasto" logo abaixo do cabeçalho azul (menos de 90 px depois de Recebido e Pago), antes de "Ainda a pagar" e à vista sem rolar`,
      r.anotarTop !== null && r.pagoBottom !== null && r.anotarTop - r.pagoBottom < 90 && r.anotarTop < r.toPayTop && r.anotarBottom <= r.h, JSON.stringify(r));
    ok(`nav Resumo (${w}px): "Ver contas ›" no card "Ainda a pagar" e "›" ao lado de Recebido e Pago`, (await visibleCount('button', 'Ver contas a pagar')) === 1 && (await body()).includes('Ver contas') &&
      (await p.locator('[aria-label^="Recebido, "] svg, [aria-label^="Pago, "] svg').evaluateAll((els) => els.filter((e) => e.getBoundingClientRect().width > 0).length)) >= 2, JSON.stringify(await resumoLayout(w)));
    // "Ver contas ›" cabe numa linha só, também em 320 px (o link não quebra: altura de uma linha e largura do rótulo com a seta).
    ok(`nav Resumo (${w}px): "Ver contas ›" numa linha só, sem quebrar`, r.verContasH !== null && r.verContasH <= 48 && r.verContasW >= 90, JSON.stringify(r));
    await layoutChecks(`nav Resumo ${w}px`);
    if (w === 390) await shot('170_resumo_navegacao');
    if (w === 320) await shot('170_resumo_navegacao_320px');
  });
  // As dicas ("Abre os recebimentos do mês") são do leitor de tela do celular (accessibilityHint); a web mantém só o nome.
  const recName = await axDescription('Recebido, ');
  const pagoName = await axDescription('Pago, ');
  ok('nav Resumo: Recebido e Pago mantêm o nome acessível ("Recebido, R$ ..." e "Pago, R$ ...")', recName !== null && pagoName !== null && recName.name === 'Recebido, R$ 6.000,00' && pagoName.name === 'Pago, R$ 3.900,00', JSON.stringify([recName, pagoName]));
  await p.getByRole('button', { name: /^Recebido, / }).filter({ visible: true }).first().click(); await waitText('Recebido');
  ok('nav Resumo: "›" ao lado de Recebido abre a lista de recebimentos', urlPath() === '/composicao' && new URL(p.url()).searchParams.get('tipo') === 'recebido', p.url());
  await btn('Voltar').click(); await waitText('Diferença do mês');
  await p.getByRole('button', { name: /^Pago, / }).filter({ visible: true }).first().click(); await waitText('Por categoria');
  ok('nav Resumo: "›" ao lado de Pago abre os pagamentos (com "Por categoria")', urlPath() === '/composicao' && new URL(p.url()).searchParams.get('tipo') === 'pago' && (await visibleCount('radio', 'Por categoria')) === 1, p.url());
  await btn('Voltar').click(); await waitText('Diferença do mês');
  await btn('Ver contas a pagar').click(); await waitText('Ainda a pagar neste mês');
  ok('nav Resumo: "Ver contas ›" abre as contas a pagar do mês do card, com o endereço limpo no mês atual (sem ?mes=)', urlPath() === '/a-pagar' && !p.url().includes('mes=') && (await body()).includes('Pessoal · Outubro de 2026'), p.url());
  await btn('Voltar').click(); await waitText('Diferença do mês');

  // O aviso da volta depois de semanas e o card de Primeiros passos vêm depois de "Anotar gasto", em 390 e 320 px.
  await enterReturnDemo();
  await atWidths(async (w) => {
    const bo = await bandOrder();
    const r = await resumoLayout(w);
    ok(`nav Resumo (${w}px): na volta depois de semanas, "Anotar gasto" logo abaixo do cabeçalho e à vista; a faixa "Seus últimos meses" vem depois`, bo.faixa !== null && r.anotarTop !== null && r.anotarTop < bo.faixa && r.anotarBottom <= r.h && r.anotarTop - r.pagoBottom < 90, JSON.stringify({ bo, r }));
    if (w === 390) await shot('171_resumo_volta_navegacao');
  });
  await newAcct('Davi Teste', 'davi@exemplo.com');
  await waitText('Primeiros passos');
  await atWidths(async (w) => {
    const r = await resumoLayout(w);
    const card = await nodeBox('heading', 'Primeiros passos');
    ok(`nav Resumo (${w}px): conta nova com "Anotar gasto" logo abaixo do cabeçalho, à vista, e Primeiros passos depois dele`, r.anotarTop !== null && card !== null && r.anotarTop < card.top && r.anotarBottom <= r.h && r.anotarTop - r.pagoBottom < 90, JSON.stringify({ r, card }));
    if (w === 390) await shot('171_resumo_conta_nova_navegacao');
  });

  // ---- 2. Barra inferior nas telas de consulta; só os formulários ficam sem ela ----
  await demoHome();
  // Na abertura de uma tela de consulta a barra surge sobreposta ao fim da tela: as barras das abas e da consulta ocupam o mesmo
  // lugar (nada de barra dupla nem salto), e o conteúdo da tela não encolhe. Conferido no meio da transição.
  const barTopsNow = () => p.evaluate(() => [...document.querySelectorAll('[role=tab]')].filter((e) => ['Resumo', 'Movimentos: movimentações do mês', 'Metas', 'Aprender e dúvidas'].includes(e.getAttribute('aria-label')) && e.getBoundingClientRect().width > 0).map((e) => Math.round(e.getBoundingClientRect().top)));
  const beforeBars = await barTopsNow();
  await btn('Ver contas a pagar').click();
  const midBars = await barTopsNow();
  await waitText('Ainda a pagar neste mês'); await p.waitForTimeout(400);
  const afterBars = await barTopsNow();
  ok('nav barra: ao abrir uma tela de consulta, a barra fica no mesmo lugar (sem barra dupla nem salto), no meio e no fim da transição', beforeBars.length >= 4 && new Set([...beforeBars, ...midBars, ...afterBars]).size === 1, JSON.stringify({ beforeBars, midBars, afterBars }));
  await btn('Voltar').click(); await waitText('Diferença do mês'); await p.waitForTimeout(300);
  const movTab = await p.evaluate(() => { const e = [...document.querySelectorAll('[role=tab]')].find((x) => x.getBoundingClientRect().width > 0 && (x.textContent || '').trim() === 'Movimentos'); return e ? e.getAttribute('aria-label') : null; });
  ok('nav barra: o nome acessível da aba "Movimentos" contém o rótulo visível ("Movimentos: movimentações do mês")', movTab === 'Movimentos: movimentações do mês', String(movTab));
  await tabByName('Movimentações').click(); await waitText('Registrar recebimento');
  await p.getByRole('button', { name: /^Calculadoras, / }).filter({ visible: true }).first().click(); await waitText('Decidir uma compra'); await p.waitForTimeout(400);
  await checkBar('nav barra: Calculadoras (o caso que sumia)', 'Movimentações');
  await shot('172_calculadoras_com_barra');
  await p.getByRole('button', { name: /^Reserva para imprevistos\./ }).filter({ visible: true }).first().click(); await waitText('Gastos essenciais por mês'); await p.waitForTimeout(300);
  await checkBar('nav barra: uma calculadora aberta', 'Movimentações');
  await navBackTo('Metas');
  ok('nav barra: tocar numa aba da barra volta à aba, sem telas empilhadas por baixo', urlPath() === '/metas' && (await visibleCount('button', 'Voltar')) === 0 && (await h1Name()) === 'Metas', p.url());
  // Contas a pagar, detalhe e o formulário "Já paguei".
  await tabByName('Movimentações').click(); await waitText('Registrar recebimento');
  await p.getByRole('button', { name: /^Contas a pagar, / }).filter({ visible: true }).first().click(); await waitText('Ainda a pagar neste mês'); await p.waitForTimeout(400);
  await checkBar('nav barra: Contas a pagar', 'Movimentações');
  await openRow(/^Internet, vence em 15\/10\/2026/); await waitText('Já paguei'); await p.waitForTimeout(300);
  await checkBar('nav barra: detalhe de uma conta a pagar', 'Movimentações');
  await btn('Já paguei').click(); await waitText('Confirmar pagamento'); await p.waitForTimeout(300);
  await checkNoBar('nav barra: pagar uma conta');
  await btn('Voltar').click(); await waitText('Já paguei'); await btn('Voltar').click(); await waitText('Ainda a pagar neste mês');
  await btn('Anotar conta a pagar').click(); await waitText('Com que frequência?'); await p.waitForTimeout(300);
  await checkNoBar('nav barra: anotar conta a pagar');
  await btn('Voltar').click(); await waitText('Ainda a pagar neste mês');
  await p.getByRole('button', { name: /^Gastos fixos e parcelamentos/ }).filter({ visible: true }).first().click(); await waitText('Por mês, se os valores não mudarem'); await p.waitForTimeout(400);
  await checkBar('nav barra: Gastos fixos e parcelamentos', 'Movimentações');
  await openRow(/^Aluguel, /); await waitText('Aluguel'); await p.waitForTimeout(400);
  await checkBar('nav barra: detalhe de um gasto fixo', 'Movimentações');
  await navBackTo('Movimentações');
  // Cartões, cartão, fatura e o pagamento da fatura.
  await p.getByRole('button', { name: /^Cartões, / }).filter({ visible: true }).first().click(); await waitText('Cadastrar cartão'); await p.waitForTimeout(400);
  await checkBar('nav barra: Cartões', 'Movimentações');
  await p.getByRole('button', { name: /^Cartão Exemplo · final 1234\./ }).filter({ visible: true }).first().click(); await waitText('Fatura atual'); await p.waitForTimeout(400);
  await checkBar('nav barra: um cartão', 'Movimentações');
  await p.getByRole('button', { name: /^Fatura de novembro, / }).filter({ visible: true }).first().click(); await waitText('Lançamentos'); await p.waitForTimeout(400);
  await checkBar('nav barra: uma fatura', 'Movimentações');
  await btn('Informar encargos').click(); await waitText('Tipo do encargo'); await p.waitForTimeout(400);
  await checkNoBar('nav barra: informar encargos (a fatura aberta não tem Pagar fatura)');
  await btn('Voltar').click(); await p.waitForTimeout(400);
  await navBackTo('Movimentações');
  // Registro: detalhe com barra; novo e editar sem barra.
  await tabByName('Resumo').click(); await waitText('Diferença do mês');
  await btn('Anotar gasto').click(); await waitText('Será salvo em'); await p.waitForTimeout(300);
  await checkNoBar('nav barra: anotar gasto');
  await btn('Voltar').click(); await waitText('Diferença do mês');
  await p.getByRole('button', { name: /^Mercado, / }).filter({ visible: true }).first().click(); await waitText('Editar registro'); await p.waitForTimeout(400);
  await checkBar('nav barra: detalhe de um gasto', 'Resumo');
  await btn('Editar registro').click(); await waitText('Salvar alterações').catch(() => {}); await p.waitForTimeout(300);
  await checkNoBar('nav barra: editar registro');
  await btn('Voltar').click(); await p.waitForTimeout(300); await navBackTo('Resumo');
  // Renda comprometida, Metas, meta, simulador e explicação.
  await p.getByRole('button', { name: /renda de referência|Renda comprometida/ }).filter({ visible: true }).first().click(); await waitText('Metas não entram no percentual').catch(() => {}); await p.waitForTimeout(400);
  await checkBar('nav barra: renda comprometida', 'Resumo');
  await navBackTo('Metas'); await waitText('Reserva para imprevistos');
  await btn('Ver detalhes').click(); await waitText('Registrar aporte'); await p.waitForTimeout(400);
  await checkBar('nav barra: detalhe da reserva', 'Metas');
  await btn('Registrar aporte').click(); await p.waitForTimeout(500);
  await checkNoBar('nav barra: registrar aporte');
  await btn('Voltar').click(); await p.waitForTimeout(300); await navBackTo('Metas');
  await p.getByRole('button', { name: /^Simular um plano\./ }).filter({ visible: true }).first().click(); await waitText('O que você quer saber?'); await p.waitForTimeout(400);
  await checkBar('nav barra: simulador', 'Metas');
  await shot('173_simulador_com_barra');
  await navBackTo('Metas');
  await btn('Nova meta').click(); await waitText('Nome da meta').catch(() => {}); await p.waitForTimeout(400);
  await checkNoBar('nav barra: nova meta');
  await btn('Voltar').click(); await p.waitForTimeout(300); await navBackTo('Aprender e dúvidas');
  await waitText('Comece por aqui');
  await p.getByRole('button', { name: /Leitura de \d+ minutos?\./ }).filter({ visible: true }).first().click(); await waitText('Fontes'); await p.waitForTimeout(500);
  ok('nav barra: a explicação de um tema abre em /explicacao', urlPath().startsWith('/explicacao/'), p.url());
  await checkBar('nav barra: explicação de um tema', 'Aprender e dúvidas');

  // ---- 3. Contas a pagar: mês certo com seletor local, vencida em poucos toques, lembretes ----
  await demoHome();
  await p.getByRole('button', { name: /Mês anterior/ }).filter({ visible: true }).first().click(); await waitText('Setembro de 2026'); await p.waitForTimeout(600);
  await atWidths(async (w) => { const r = await resumoLayout(w); ok(`nav Resumo em setembro (${w}px): "Ver contas ›" continua numa linha só, mesmo com o rótulo "Previsto para setembro de 2026"`, r.verContasH !== null && r.verContasH <= 48, JSON.stringify(r)); });
  await p.getByRole('button', { name: /^Previsto para setembro de 2026, R\$/ }).filter({ visible: true }).first().click(); await waitText('Previsto para setembro'); await p.waitForTimeout(400);
  ok('nav Contas a pagar: o card do Resumo em setembro abre setembro (?mes=2026-09), com o seletor de mês', urlPath() === '/a-pagar' && p.url().includes('mes=2026-09') && (await body()).includes('Pessoal · Setembro de 2026') && (await visibleCount('button', 'Voltar para outubro de 2026')) === 1 &&
    (await visibleCount('button', 'Mês anterior: agosto de 2026')) === 1 && (await visibleCount('button', 'Próximo mês: outubro de 2026')) === 1, p.url());
  await atWidths(async (w) => {
    await layoutChecks(`nav Contas a pagar em setembro ${w}px`);
    if (w === 390) await shot('174_contas_a_pagar_setembro');
    if (w === 320) await shot('174_contas_a_pagar_setembro_320px');
  });
  await btn('Voltar para outubro de 2026').click(); await waitText('Ainda a pagar neste mês'); await p.waitForTimeout(400);
  ok('nav Contas a pagar: "Voltar para outubro de 2026" troca só a tela local e some no mês atual', (await body()).includes('Pessoal · Outubro de 2026') && (await visibleCount('button', 'Voltar para outubro de 2026')) === 0);
  await btn('Voltar').click(); await waitText('Diferença do mês');
  ok('nav Contas a pagar: trocar de mês ali não muda o mês do Resumo (continua em setembro)', await headingShown('Setembro de 2026'));
  // Renda comprometida (aberta do Resumo em setembro) > "Contas a pagar" leva o mês da tela, setembro.
  await p.getByRole('button', { name: /^Renda comprometida/ }).filter({ visible: true }).first().click(); await waitText('Contas do mês').catch(() => {}); await p.waitForTimeout(400);
  await p.getByRole('button', { name: 'Contas a pagar', exact: true }).filter({ visible: true }).first().click(); await waitText('Previsto para setembro'); await p.waitForTimeout(300);
  ok('nav Contas a pagar: Renda comprometida > "Contas a pagar" leva o mês da tela (setembro, ?mes=2026-09)', urlPath() === '/a-pagar' && p.url().includes('mes=2026-09') && (await body()).includes('Pessoal · Setembro de 2026'), p.url());
  await goResumo();
  await p.getByRole('button', { name: /Próximo mês/ }).filter({ visible: true }).first().click(); await waitText('Outubro de 2026'); await p.waitForTimeout(400);
  // Seletor local: setembro, outubro, novembro; o Resumo não muda.
  await openToPay();
  await btn('Mês anterior: setembro de 2026').click(); await waitText('Previsto para setembro');
  await btn('Próximo mês: outubro de 2026').click(); await waitText('Ainda a pagar neste mês');
  await btn('Próximo mês: novembro de 2026').click(); await waitText('Previsto para novembro'); await p.waitForTimeout(300);
  t = await body();
  ok('nav Contas a pagar: o seletor percorre os meses (setembro, outubro, novembro) e mostra "Previsto para novembro"', t.includes('Pessoal · Novembro de 2026') && t.includes('Previsto para novembro de 2026'));
  await btn('Voltar para outubro de 2026').click(); await waitText('Ainda a pagar neste mês'); await p.waitForTimeout(300);
  // O primeiro "Já paguei" fica à vista, acima da barra inferior, também em 360 × 640 e 320 × 640 (sem rolar).
  const firstPayBox = () => p.evaluate(() => {
    const b = [...document.querySelectorAll('[role=button]')].find((e) => (e.getAttribute('aria-label') || '').startsWith('Já paguei ') && e.getBoundingClientRect().width > 0);
    const r = b ? b.getBoundingClientRect() : null;
    const tabs = [...document.querySelectorAll('[role=tab]')].filter((e) => e.getBoundingClientRect().width > 0);
    return { top: r && Math.round(r.top), bottom: r && Math.round(r.bottom), barTop: tabs.length ? Math.round(Math.min(...tabs.map((e) => e.getBoundingClientRect().top))) : null, h: window.innerHeight };
  });
  await atWidths(async (w) => {
    const f = await firstPayBox();
    ok(`nav Contas a pagar (${w}px): o primeiro "Já paguei" da lista fica à vista, acima da barra, com o seletor de mês no lugar da linha "Pessoal"`, f.bottom !== null && f.barTop !== null && f.bottom <= f.barTop, JSON.stringify(f));
    await layoutChecks(`nav Contas a pagar ${w}px`);
    if (w === 390) await shot('175_contas_a_pagar_outubro');
  });
  await atSmall(async (w, h) => {
    await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(200);
    const f = await firstPayBox();
    ok(`nav Contas a pagar (${w}×${h}): o primeiro "Já paguei" aparece inteiro acima da barra inferior, sem rolar`, f.bottom !== null && f.barTop !== null && f.bottom <= f.barTop && f.top >= 0, JSON.stringify(f));
    ok(`nav Contas a pagar (${w}×${h}): o parágrafo do critério e a previsão ficam depois das listas, não no topo`, f.bottom !== null && (await body()).includes('Contas em aberto com vencimento até o fim do mês') && (await body()).includes('Se pagar tudo o que está em aberto'));
    if (w === 360) await shot('175_contas_a_pagar_360x640');
  });

  // Duas contas vencidas (Gás de 28/09 e Água de 05/10), anotadas em "outro aparelho"; a demonstração não tem vencidas.
  await otherDevice(async (repo, ctx) => {
    await repo.createCommitment('e2e-nav-gas', ctx, { description: 'Gás', amountCents: 4000, dueOn: '2026-09-28', category: null });
    await repo.createCommitment('e2e-nav-agua', ctx, { description: 'Água', amountCents: 9000, dueOn: '2026-10-05', category: null });
  });
  await waitText('Gás, venceu em 28/09/2026').catch(() => {}); await p.waitForTimeout(500);
  // Vencida: com 2 vencidas a revisão já existia; paga uma pelo detalhe ("Já paguei") e a outra pela revisão,
  // que agora aparece também com 1 só vencida.
  t = await body();
  ok('nav vencida: duas vencidas (Gás e Água) e "Revisar vencidas" na seção', (await sectionRows('Vencidas'))?.[0] === 'Revisar vencidas' && (await sectionRows('Vencidas')).length === 4, JSON.stringify(await sectionRows('Vencidas')));
  await openRow(/^Gás, venceu em 28\/09\/2026/); await waitText('Já paguei'); await p.waitForTimeout(300);
  ok('nav vencida: o detalhe da conta tem "Já paguei" (e não "Marcar como paga")', (await visibleCount('button', 'Já paguei')) === 1 && (await visibleCount('button', 'Marcar como paga')) === 0);
  await btn('Já paguei').click(); await waitText('Confirmar pagamento'); await p.waitForTimeout(300);
  ok('nav vencida: "Já paguei" no detalhe abre o pagamento, com o mesmo nome da lista', (await body()).includes('Confirmar pagamento'));
  await btn('Confirmar pagamento').click(); await waitText('Pagamento registrado').catch(() => {}); await p.waitForTimeout(600);
  await goResumo(); await openToPay(); await p.waitForTimeout(500);
  const venc1 = await sectionRows('Vencidas');
  ok('nav vencida: com 1 só vencida (Água), "Revisar vencidas" aparece na seção', venc1 !== null && venc1[0] === 'Revisar vencidas' && venc1.length === 3 && /^Água, venceu em 05\/10\/2026/.test(venc1[1]), JSON.stringify(venc1));
  await atWidths(async (w) => { await layoutChecks(`nav vencida com 1 conta ${w}px`); });
  let taps = 0;
  const tap = async (click) => { taps += 1; await click(); };
  await goResumo();
  await tap(() => btn('Ver contas a pagar').click()); await waitText('Ainda a pagar neste mês');
  await tap(() => btn('Revisar vencidas').click()); await waitText('Marque o que você já pagou e tire o que não houve.');
  await tap(() => p.getByRole('button', { name: /^Já paguei Água/ }).filter({ visible: true }).first().click()); await waitText('Marcar Água');
  await tap(() => confirmIn('Confirmar')); await waitText('marcada como paga').catch(() => {}); await p.waitForTimeout(500);
  t = await body();
  ok('nav vencida: uma vencida paga pela revisão em 3 toques até a confirmação (Ver contas, Revisar vencidas, Já paguei) e 1 para confirmar', taps === 4 && t.includes('Água') && (t.includes('marcada como paga') || t.includes('Nenhuma conta vencida')), `${taps} toques: ${t.slice(0, 200)}`);
  await shot('176_vencida_revisao_uma_conta');
  await goResumo();
  ok('nav vencida: Ainda a pagar volta a R$ 650,00 depois de pagar Gás e Água (R$ 780,00 com elas)', (await p.getByRole('button', { name: /^Ainda a pagar neste mês, R\$ 650,00/ }).filter({ visible: true }).count()) === 1);

  // Lembretes: a linha "Lembretes de vencimento" só aparece no app de celular, fora da demonstração e com os lembretes
  // desligados (na web e na demonstração ela não existe); os lembretes seguem em Conta.
  await openToPay(); await p.waitForTimeout(300);
  await atWidths(async (w) => {
    await scrollTo('Já anotou o pagamento como gasto? Exclua a conta a pagar para ela não continuar em Ainda a pagar.').catch(() => {});
    ok(`nav lembretes (${w}px): na web (e na demonstração) Contas a pagar não mostra a linha "Lembretes de vencimento", que só leva ao aviso quando ele pode ser ligado`, (await visibleCount('button', /^Lembretes de vencimento/)) === 0 && !(await body()).includes('Ligar em Conta.'));
    await layoutChecks(`nav lembretes ${w}px`);
  });
  await goResumo(); await openConta();
  ok('nav lembretes: em Conta ficam os lembretes (na web, o texto de que são do app para celular)', urlPath() === '/conta' && (await body()).includes('Lembretes estão disponíveis no app para celular.'), p.url());
  await keepText();
  await checkBar('nav barra: Conta', 'Resumo');
  await navBackTo('Resumo');

  // ---- 4. Metas compacta: pergunta compacta, plano dentro do card da reserva, "Fazer as contas" ----
  await newAcct('Eva Teste', 'eva@exemplo.com');
  await tabByName('Metas').click(); await waitText('Você consegue guardar algum valor por mês?'); await p.waitForTimeout(500);
  const askLayout = () => p.evaluate(() => {
    const box = (sel, pred) => { const e = [...document.querySelectorAll(sel)].find((x) => pred(x) && x.getBoundingClientRect().width > 0); return e ? e.getBoundingClientRect() : null; };
    const title = box('[role=heading]', (x) => x.textContent === 'Você consegue guardar algum valor por mês?');
    const yes = box('[role=button]', (x) => x.textContent === 'Sim, consigo');
    const no = box('[role=button]', (x) => x.textContent === 'Agora não');
    const later = box('[role=button]', (x) => x.textContent === 'Responder depois');
    const calc = box('[role=button]', (x) => x.textContent === 'Calcular minha reserva');
    const reserve = box('[role=heading]', (x) => x.textContent === 'Reserva para imprevistos');
    const tabs = [...document.querySelectorAll('[role=tab]')].filter((x) => x.getBoundingClientRect().width > 0 && ['Resumo', 'Metas'].includes(x.getAttribute('aria-label')));
    const barTop = tabs.length ? Math.min(...tabs.map((x) => x.getBoundingClientRect().top)) : window.innerHeight;
    return {
      askHeight: title && later ? Math.round(later.bottom - title.top) : null,
      sameRow: yes && no ? Math.abs(yes.top - no.top) < 2 && no.left > yes.right - 1 : null,
      laterBelow: later && yes ? later.top > yes.bottom - 1 : null,
      calcBottom: calc ? Math.round(calc.bottom) : null,
      reserveTop: reserve ? Math.round(reserve.top) : null,
      laterBottom: later ? Math.round(later.bottom) : null,
      barTop: Math.round(barTop),
      h: window.innerHeight,
    };
  });
  for (const [w, h] of [[360, 640], [320, 640], [390, 844], [320, 800]]) {
    await p.setViewportSize({ width: w, height: h }); await p.waitForTimeout(500);
    await p.evaluate(() => window.scrollTo(0, 0));
    const r = await askLayout();
    // Sem reserva, o texto do card tem uma ou duas linhas e "Calcular minha reserva" vem logo depois: o botão fica à vista, acima
    // da barra, inclusive em 360 × 640 e 320 × 640 (sem rolar).
    ok(`nav Metas conta nova (${w}×${h}): pergunta compacta (até 230 px), "Sim, consigo" e "Agora não" lado a lado, "Responder depois" abaixo e "Calcular minha reserva" à vista acima da barra`,
      r.askHeight !== null && r.askHeight <= 230 && r.sameRow === true && r.laterBelow === true && r.calcBottom !== null && r.calcBottom <= r.barTop, JSON.stringify(r));
    await layoutChecks(`nav Metas conta nova ${w}px`);
    if (w === 390) await shot('177_metas_compacta');
    if (w === 320 && h === 800) await shot('177_metas_compacta_320px');
    if (w === 360) await shot('177_metas_compacta_360x640');
  }
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(300);
  await keepText();
  await demoHome();
  await tabByName('Metas').click(); await waitText('Reserva para imprevistos'); await waitText('Seu plano de guardar'); await p.waitForTimeout(500);
  await atWidths(async (w) => {
    const pos = await p.evaluate(() => {
      const top = (sel, text) => [...document.querySelectorAll(sel)].find((e) => (e.textContent === text || e.getAttribute('aria-label') === text) && e.getBoundingClientRect().width > 0)?.getBoundingClientRect().top ?? null;
      const doTheMath = [...document.querySelectorAll('[role=heading]')].find((e) => e.textContent === 'Fazer as contas' && e.getBoundingClientRect().width > 0);
      const rows = doTheMath ? [...doTheMath.parentElement.querySelectorAll('[role=button]')].filter((e) => e.getBoundingClientRect().width > 0).map((e) => (e.getAttribute('aria-label') || '').split('.')[0]) : null;
      return {
        question: top('[role=heading]', 'Você consegue guardar algum valor por mês?'),
        reserve: top('[role=heading]', 'Reserva para imprevistos'), plan: top('[role=heading]', 'Seu plano de guardar'), deposit: top('[role=button]', 'Registrar aporte'),
        goals: top('[role=heading]', 'Suas metas'), month: top('[role=heading]', 'Seu mês'), math: top('[role=heading]', 'Fazer as contas'), learn: top('[role=heading]', 'Aprender'), rows,
        seePlan: top('[role=button]', 'Ver o plano'), change: top('[role=button]', 'Mudar valor'),
      };
    });
    const o = [pos.reserve, pos.plan, pos.deposit, pos.goals, pos.month, pos.math, pos.learn];
    ok(`nav Metas (${w}px): com a resposta "consigo", o plano fica dentro do card da reserva (sem segundo card) e a ordem é Reserva, Suas metas, Seu mês, Fazer as contas, Aprender`,
      pos.question === null && o.every((x) => x !== null) && o.every((x, i) => i === 0 || x > o[i - 1]) && pos.seePlan > pos.plan && pos.seePlan < pos.deposit && pos.change > pos.plan && pos.change < pos.deposit, JSON.stringify(pos));
    ok(`nav Metas (${w}px): "Fazer as contas" tem Simular um plano, a ordem de quitar as dívidas (Ciclo F1) e Calculadoras`, JSON.stringify(pos.rows) === JSON.stringify(['Simular um plano', 'Em que ordem quitar as dívidas? Duas ordens de pagamento, lado a lado', 'Calculadoras']), JSON.stringify(pos.rows));
    await layoutChecks(`nav Metas demonstração ${w}px`);
    if (w === 390) await shot('178_metas_plano_na_reserva');
    if (w === 320) await shot('178_metas_plano_na_reserva_320px');
  });
  await p.getByRole('button', { name: /^Calculadoras\./ }).filter({ visible: true }).first().click(); await waitText('Decidir uma compra'); await p.waitForTimeout(300);
  ok('nav Metas: "Fazer as contas" › Calculadoras abre a lista, com a barra à vista e Metas marcada', (await h1Name()) === 'Calculadoras' && barOk(await barState()) && (await barState()).selected[0] === 'Metas');
  await navBackTo('Metas');
  await keepText();

  // ---- 5. Aprender: grupo "No app" na busca ----
  await tabByName('Aprender e dúvidas').click(); await waitText('Comece por aqui'); await p.waitForTimeout(400);
  const learnBox = () => p.getByLabel('Buscar um tema ou uma função', { exact: true }).filter({ visible: true }).first();
  const storage = () => p.evaluate(() => JSON.stringify([Object.entries(localStorage), Object.entries(sessionStorage)]));
  const navStorageBefore = await storage();
  const navWritesBefore = writes.length;
  ok('nav Aprender: a busca tem o rótulo "Buscar um tema ou uma função" e a dica "Ex.: juros, boleto, IPVA"', (await learnBox().getAttribute('placeholder')) === 'Ex.: juros, boleto, IPVA');
  const appSearch = [
    ['nota fiscal', 'Escanear nota fiscal', () => urlPath() === '/registro/novo' && new URL(p.url()).searchParams.get('tipo') === 'despesa'],
    ['boleto', 'Contas a pagar', () => urlPath() === '/a-pagar'],
    ['lembrete', 'Lembretes de vencimento', () => urlPath() === '/conta'],
    ['categoria', 'Pago por categoria', () => urlPath() === '/composicao' && new URL(p.url()).searchParams.get('tipo') === 'pago'],
    ['simular', 'Simular um plano', () => urlPath() === '/simular'],
    ['cartão', 'Cartões', () => urlPath() === '/cartoes'],
  ];
  for (const [query, title, opened] of appSearch) {
    await learnBox().fill(query); await waitText('No app'); await p.waitForTimeout(500);
    const group = await p.evaluate(() => {
      const h = [...document.querySelectorAll('[role=heading]')].find((e) => e.textContent === 'No app' && e.getBoundingClientRect().width > 0);
      return h ? { level: h.getAttribute('aria-level'), top: Math.round(h.getBoundingClientRect().top) } : null;
    });
    ok(`nav Aprender: "${query}" mostra o grupo "No app" (título de nível 2) com "${title}"`, group !== null && group.level === '2' && (await p.getByRole('button', { name: new RegExp(`^${title.replace(/[?]/g, '\\?')}\\.`) }).filter({ visible: true }).count()) >= 1, JSON.stringify(group));
    if (query === 'nota fiscal') await shot('179_aprender_no_app');
    if (query === 'boleto') await atWidths(async (w) => { await layoutChecks(`nav Aprender No app ${w}px`); if (w === 320) await shot('179_aprender_no_app_320px'); });
    await keepText();
    await p.getByRole('button', { name: new RegExp(`^${title.replace(/[?]/g, '\\?')}\\.`) }).filter({ visible: true }).first().click(); await p.waitForTimeout(700);
    ok(`nav Aprender: tocar em "${title}" abre a tela do app (${urlPath()})`, opened(), p.url());
    if (query === 'categoria') ok('nav Aprender: "Pago por categoria" abre já em "Por categoria"', (await p.getByRole('radio', { name: 'Por categoria', exact: true }).filter({ visible: true }).first().getAttribute('aria-checked')) === 'true');
    if (query === 'nota fiscal') await btn('Voltar').click();
    else await navBackTo('Aprender e dúvidas');
    await waitText('Buscar um tema ou uma função'); await p.waitForTimeout(300);
  }
  await learnBox().fill('zzzzzz'); await waitText('Nenhum tema encontrado'); await p.waitForTimeout(300);
  ok('nav Aprender: sem tema nem tela do app, a mensagem de sempre e sem o grupo "No app"', !(await headingShown('No app')) && (await body()).includes('Nenhum tema encontrado'));
  await learnBox().fill('juros'); await waitText('temas para "juros"'); await p.waitForTimeout(300);
  ok('nav Aprender: os temas continuam nos resultados (juros) com a contagem de sempre', (await body()).includes('temas para "juros"'));
  await learnBox().fill('');
  ok('nav Aprender: a busca não registra nada (nenhuma requisição nem gravação, nada no aparelho)', (await storage()) === navStorageBefore && writes.length === navWritesBefore, `${writes.length - navWritesBefore} gravações`);
  await p.getByRole('tab', { name: 'Resumo' }).filter({ visible: true }).first().click(); await p.waitForTimeout(500);

  // ==================================================================================================================
  // Ciclo F1 · Plano para quitar dívidas (D-040, docs/08 §5 item 10). Calculadora educativa em /calcular/plano-dividas: nada é
  // gravado (nem no aparelho), a taxa é sempre digitada, duas ordens lado a lado e a referência "Sem valor a mais". Cada item é
  // conferido em 390 e em 320 px de largura. Capturas novas: 190 em diante. Na demonstração, hoje é 07/10/2026 (o primeiro
  // pagamento da conta é no fim de novembro) e o Financiamento do carro (parcela 13 de 48, R$ 850,00) vem preenchido.
  // ==================================================================================================================
  const F1_NAME = 'Financiamento do carro';
  const F1_VETOED = /\b(melhor(es)?|pior(es)?|dever[ií]\w*|renegoci\w*|portabilidade|consignad\w*|saldo devedor|empr[eé]stimo para quitar)\b/i;
  const f1Storage = () => p.evaluate(() => JSON.stringify([Object.entries(localStorage), Object.entries(sessionStorage)]));
  const f1Fill = async (label, value) => { const f = field(label); await f.fill(value); await f.blur(); await p.waitForTimeout(200); };
  const f1Open = async () => {
    await tabByName('Metas').click(); await waitText('Fazer as contas'); await p.waitForTimeout(400);
    await p.getByRole('button', { name: /^Em que ordem quitar as dívidas\? / }).filter({ visible: true }).first().click();
    await waitText('Suas dívidas'); await p.waitForTimeout(600);
  };
  const f1Series = () => otherDevice(async (repo, ctx) => JSON.stringify((await repo.listSeries(ctx)).map((s) => [s.id, s.version, s.openCount, s.paidCount])));
  const f1Value = (label) => field(label).inputValue();

  await demoHome();
  const f1Writes = writes.length;
  const f1Store = await f1Storage();
  const f1SeriesBefore = await f1Series();

  // ---- 1. Metas › "Fazer as contas" ganha a linha, e a calculadora abre com o Financiamento do carro preenchido ----
  await tabByName('Metas').click(); await waitText('Fazer as contas'); await p.waitForTimeout(500);
  let f1Rows = await sectionRows('Fazer as contas');
  ok('F1 Metas: "Fazer as contas" tem Simular um plano, "Em que ordem quitar as dívidas?" e Calculadoras, nessa ordem',
    f1Rows !== null && f1Rows.length === 3 && /^Simular um plano\./.test(f1Rows[0]) && f1Rows[1] === 'Em que ordem quitar as dívidas? Duas ordens de pagamento, lado a lado' && /^Calculadoras\./.test(f1Rows[2]), JSON.stringify(f1Rows));
  // O texto da lista vazia não pode piscar enquanto a conta e os parcelamentos são lidos: um observador registra se ele aparece.
  await p.evaluate(() => {
    window.__f1Flash = false;
    new MutationObserver(() => { if (document.body.innerText.includes('Acrescente as dívidas que você quer comparar.')) window.__f1Flash = true; }).observe(document.body, { subtree: true, childList: true, characterData: true });
  });
  await f1Open();
  ok('F1 demonstração: o texto da lista vazia nunca aparece ao abrir (só a leitura e depois a dívida)', (await p.evaluate(() => window.__f1Flash)) === false);
  ok('F1 a tela abre em /calcular/plano-dividas com o título "Em que ordem quitar as dívidas?", o aviso das calculadoras no topo e a barra inferior com Metas marcada',
    urlPath() === '/calcular/plano-dividas' && (await h1Name()) === 'Em que ordem quitar as dívidas?' && (await body()).includes('Simulação com os valores e as taxas que você informou. Não é recomendação de produto financeiro nem oferta de crédito.') && barOk(await barState()) && (await barState()).selected[0] === 'Metas', p.url());
  await checkBar('F1 plano', 'Metas');
  t = await body();
  ok('F1 demonstração: o Financiamento do carro vem preenchido (parcela R$ 850,00, 36 parcelas, taxa em branco) e o valor a mais fica vazio',
    t.includes(F1_NAME) && t.includes('Preenchido com os seus parcelamentos em aberto.') && (await f1Value(`Valor da parcela, ${F1_NAME}`)) === '850,00' && (await f1Value(`Parcelas que faltam, ${F1_NAME}`)) === '36' &&
    (await f1Value(`Taxa de juros ao mês do contrato (%), ${F1_NAME}`)) === '' && (await f1Value('Quanto a mais você consegue pôr por mês nas dívidas?')) === '', t.slice(0, 400));
  ok('F1 demonstração: sem a taxa, conta só as parcelas e diz isso; "Sem valor a mais" termina em 36 meses (outubro de 2029) e pede o valor a mais; a dica do plano de guardar não preenche o campo',
    t.includes('Sem valor a mais: tudo termina em 36 meses (3 anos), em outubro de 2029.') && t.includes('Informe quanto a mais você consegue pôr por mês para ver o efeito.') &&
    t.includes(`${F1_NAME}: sem juros informados, conta só as parcelas.`) && t.includes('No seu plano de guardar você informou R$ 500,00 por mês.') && t.includes('Total pago: R$ 30.600,00') && t.includes('Juros estimados: R$ 0,00'));
  ok('F1 só uma dívida: não há ordem a comparar (nenhuma das duas ordens aparece)', !t.includes('Maior taxa primeiro') && !t.includes('Menor dívida primeiro'));
  ok('F1 o texto fixo da estimativa e as hipóteses visíveis',
    t.includes('Estimativa. O valor oficial de cada dívida é o que a instituição informar; peça o valor atualizado.') && t.includes('Taxas fixas, sem novas compras nem atrasos.') && t.includes('Sem IOF nem tarifas.') && t.includes('Pagamentos no fim de cada mês, a partir do mês seguinte.'));
  ok('F1 com parcelamentos lidos, as hipóteses dizem que as parcelas já vencidas e em aberto ficam fora',
    t.includes('Dos seus parcelamentos, entram só as parcelas que vencem de hoje em diante; as já vencidas e em aberto ficam fora desta conta.'));
  ok('F1 sem botão "Calcular": o resultado aparece enquanto a pessoa digita', (await visibleCount('button', /^Calcular/)) === 0);
  await atWidths(async (w) => {
    await layoutChecks(`F1 plano demonstração ${w}px`);
    const small = await p.evaluate(() => [...document.querySelectorAll('[role=button],[role=radio]')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.height < 47.5; }).map((e) => (e.getAttribute('aria-label') || e.textContent || '').slice(0, 40)));
    ok(`F1 plano (${w}px): botões, chips e links da tela com alvo de 48 px`, small.filter((x) => !/^(Voltar|Resumo|Movimentos|Metas|Aprender)/.test(x)).length === 0, small.join(' | '));
    if (w === 390) await shot('190_plano_dividas_demonstracao');
    if (w === 320) await shot('190_plano_dividas_demonstracao_320px');
  });
  await keepText();

  // ---- 2. Taxa e valor a mais: o resultado muda enquanto digita; a uma dívida, "Sem valor a mais" e "Com o valor a mais" ----
  await f1Fill(`Taxa de juros ao mês do contrato (%), ${F1_NAME}`, '1,5');
  t = await body();
  ok('F1 com a taxa de 1,5%: saldo inicial pelo valor presente (R$ 23.511,58), total pago R$ 30.600,00 (as 36 parcelas, sem pagamento final maior) e juros estimados R$ 7.088,42; some "sem juros informados"',
    t.includes('Total pago: R$ 30.600,00') && t.includes('Juros estimados: R$ 7.088,42') && t.includes('O saldo inicial de uma dívida parcelada é o valor presente das parcelas que faltam, pela taxa informada.') && !t.includes('sem juros informados'), t.slice(-900));
  await f1Fill('Quanto a mais você consegue pôr por mês nas dívidas?', '100,00');
  t = await body();
  ok('F1 com R$ 100,00 a mais: "Com o valor a mais" termina em 32 meses (junho de 2029), R$ 992,59 a menos de juros e 4 meses antes',
    t.includes('Com o valor a mais: tudo termina em 32 meses (2 anos e 8 meses), em junho de 2029.') && t.includes('Com o valor a mais: R$ 992,59 a menos de juros.') && t.includes('Com o valor a mais: tudo termina 4 meses antes.') &&
    !t.includes('Informe quanto a mais você consegue pôr por mês para ver o efeito.'), t.slice(-1200));
  await atWidths(async (w) => {
    await scrollTo('Resultado');
    if (w === 390) await shot('191_plano_dividas_com_valor_a_mais');
    if (w === 320) await shot('191_plano_dividas_com_valor_a_mais_320px');
  });
  await keepText();

  // ---- 3. Duas dívidas: as duas ordens lado a lado, sem dizer qual é a certa ----
  await scrollTo('Acrescentar dívida');
  await btn('Acrescentar dívida').click(); await p.waitForTimeout(400);
  t = await body();
  ok('F1 uma dívida acrescentada: "Dívida 2" sem tipo, "Preencha os campos para ver o resultado." e o pedido do tipo (só falta ele)',
    t.includes('Dívida 2') && t.includes('Preencha os campos para ver o resultado.') && t.includes('Escolha o tipo da dívida.'), t.slice(-700));
  ok('F1 o pedido do tipo é do grupo de escolha: grupo "Tipo de dívida, Dívida 2" e o erro anunciado como alerta dentro dele',
    (await p.evaluate(() => {
      const g = [...document.querySelectorAll('[role=radiogroup]')].find((e) => e.getAttribute('aria-label') === 'Tipo de dívida, Dívida 2' && e.getBoundingClientRect().width > 0);
      const alert = g && g.parentElement ? [...g.parentElement.querySelectorAll('[role=alert]')].find((e) => e.textContent === 'Escolha o tipo da dívida.') : null;
      return Boolean(g && alert);
    })));
  await radio('Saldo com juros, Dívida 2').click(); await p.waitForTimeout(300);
  await f1Fill('Apelido da dívida 2', 'Cartão azul');
  ok('F1 o apelido vira o nome da dívida (título e nomes acessíveis dos campos)', (await headingShown('Cartão azul')) && (await visibleCount('textbox', 'Saldo hoje, Cartão azul')) === 1);
  await f1Fill('Saldo hoje, Cartão azul', '1.500,00');
  await f1Fill('Taxa de juros ao mês (%), Cartão azul', '1');
  await f1Fill('Quanto você paga por mês, Cartão azul', '300,00');
  t = await body();
  ok('F1 duas dívidas: "Sem valor a mais" (36 meses, juros R$ 7.135,09), "Maior taxa primeiro" e "Menor dívida primeiro" (24 meses, outubro de 2028) lado a lado',
    t.includes('Sem valor a mais: tudo termina em 36 meses (3 anos), em outubro de 2029.') && t.includes('Juros estimados: R$ 7.135,09') &&
    t.includes('Maior taxa primeiro: tudo termina em 24 meses (2 anos), em outubro de 2028.') && t.includes('Menor dívida primeiro: tudo termina em 24 meses (2 anos), em outubro de 2028.') &&
    t.includes('Juros estimados: R$ 4.918,45') && t.includes('Juros estimados: R$ 4.925,13'), t.slice(-1800));
  ok('F1 as diferenças em linguagem neutra: R$ 6,68 a menos de juros (Maior taxa primeiro), a primeira dívida termina 2 meses antes (Menor dívida primeiro) e o fim no mesmo mês',
    t.includes('Maior taxa primeiro: R$ 6,68 a menos de juros.') && t.includes('Menor dívida primeiro: a primeira dívida termina 2 meses antes.') && t.includes('Tudo termina no mesmo mês nas duas ordens.'));
  ok('F1 a sequência de cada ordem, com o mês em que cada dívida termina',
    t.includes('1. Cartão azul: termina em 6 meses (abril de 2027).') && t.includes(`2. ${F1_NAME}: termina em 24 meses (outubro de 2028).`) && t.includes('1. Cartão azul: termina em 4 meses (fevereiro de 2027).') &&
    t.includes(`1. Cartão azul: termina em 6 meses (abril de 2027).`) && t.includes('Em que ordem cada dívida termina'));
  ok('F1 nenhuma ordem é chamada de "melhor" ou "pior" e não há palavra vetada', !F1_VETOED.test(t), (t.match(F1_VETOED) ?? [])[0]);
  ok('F1 títulos: "Suas dívidas" e "Resultado" em nível 2',
    (await p.evaluate(() => [...document.querySelectorAll('[role=heading]')].filter((e) => e.getBoundingClientRect().width > 0 && ['Suas dívidas', 'Resultado'].includes(e.textContent)).map((e) => `${e.textContent}:${e.getAttribute('aria-level')}`).join('|'))) === 'Suas dívidas:2|Resultado:2');
  await atWidths(async (w) => {
    await scrollTo('Resultado');
    await layoutChecks(`F1 plano duas dívidas ${w}px`);
    if (w === 390) await shot('192_plano_dividas_duas_ordens');
    if (w === 320) await shot('192_plano_dividas_duas_ordens_320px');
  });
  await keepText();

  // Sem valor a mais (campo vazio ou zero) e 2 ou mais dívidas: a legenda de "Sem valor a mais" explica por que as ordens terminam antes.
  const F1_CAPTION = 'Cada dívida só com os pagamentos de sempre, sem passar nada adiante.';
  ok('F1 com R$ 100,00 a mais, "Sem valor a mais" não leva a legenda', !(await body()).includes(F1_CAPTION));
  await f1Fill('Quanto a mais você consegue pôr por mês nas dívidas?', '');
  ok('F1 valor a mais vazio e duas dívidas: a legenda "sem passar nada adiante" aparece junto do título de "Sem valor a mais" (uma só vez)',
    (await body()).split(F1_CAPTION).length === 2 && (await body()).includes('Maior taxa primeiro: tudo termina em'));
  await f1Fill('Quanto a mais você consegue pôr por mês nas dívidas?', '0');
  ok('F1 valor a mais zero e duas dívidas: a legenda continua', (await body()).split(F1_CAPTION).length === 2);
  await atWidths(async (w) => { await scrollTo('Detalhes de cada ordem'); await layoutChecks(`F1 plano legenda ${w}px`); });
  await f1Fill('Quanto a mais você consegue pôr por mês nas dívidas?', '100,00');
  ok('F1 de volta aos R$ 100,00 a mais: a legenda some', !(await body()).includes(F1_CAPTION));
  await keepText();

  // ---- 4. Apelido que parece número de cartão e pagamento que não cobre os juros ----
  await f1Fill('Apelido da dívida 2', '4111 1111 1111 1111');
  t = await body();
  ok('F1 apelido que parece número de cartão: recusado com a explicação, e o resultado espera a correção',
    t.includes('Não use o número do cartão no apelido. Use um nome, como Cartão azul.') && t.includes('Preencha os campos para ver o resultado.') && !t.includes('Maior taxa primeiro: tudo termina'), t.slice(-500));
  await f1Fill('Apelido da dívida 2', 'a'.repeat(31));
  ok('F1 apelido com 31 caracteres: "Use no máximo 30 caracteres."', (await body()).includes('Use no máximo 30 caracteres.'));
  await f1Fill('Apelido da dívida 2', 'Cartão azul');
  ok('F1 corrigido o apelido, o resultado volta', (await body()).includes('Maior taxa primeiro: tudo termina em 24 meses'));
  await f1Fill('Quanto você paga por mês, Cartão azul', '10,00');
  t = await body();
  ok('F1 pagamento de R$ 10,00 para juros de R$ 15,00: "Com este pagamento, o saldo não diminui." e a dívida fica fora da comparação (só as duas linhas de uma dívida)',
    t.includes('Com este pagamento, o saldo não diminui.') && t.includes('Cartão azul fica fora da comparação até o pagamento ser maior que os juros do primeiro mês (R$ 15,00).') &&
    !t.includes('Maior taxa primeiro: tudo termina') && t.includes('Com o valor a mais: tudo termina em 32 meses'), t.slice(-1200));
  await atWidths(async (w) => {
    await scrollTo('Quanto você paga por mês');
    if (w === 390) await shot('193_plano_dividas_saldo_nao_diminui');
    if (w === 320) await shot('193_plano_dividas_saldo_nao_diminui_320px');
  });
  await keepText();
  // O aviso é da própria dívida: continua à vista mesmo com outro campo incompleto (aqui, as parcelas que faltam do financiamento).
  await f1Fill(`Parcelas que faltam, ${F1_NAME}`, '');
  t = await body();
  ok('F1 outro campo incompleto: o resultado espera ("Preencha os campos...") e o aviso "Com este pagamento, o saldo não diminui." da dívida continua à vista',
    t.includes('Preencha os campos para ver o resultado.') && t.includes('Com este pagamento, o saldo não diminui.') && !t.includes('fica fora da comparação'), t.slice(-700));
  await f1Fill(`Parcelas que faltam, ${F1_NAME}`, '36');
  await f1Fill('Quanto você paga por mês, Cartão azul', '300,00');
  ok('F1 pagamento corrigido: o aviso some e as duas ordens voltam', !(await body()).includes('Com este pagamento, o saldo não diminui.') && (await body()).includes('Maior taxa primeiro: tudo termina em 24 meses'));

  // ---- 5. Tirar da conta, limite de 10 e lista vazia ----
  await btn(`Tirar da conta: ${F1_NAME}`).click(); await p.waitForTimeout(400);
  t = await body();
  ok('F1 "Tirar da conta" tira a dívida só desta tela: sobra o Cartão azul e o resultado se refaz com uma dívida', !t.includes(F1_NAME) && t.includes('Cartão azul') && !t.includes('Maior taxa primeiro: tudo termina') && t.includes('Com o valor a mais: tudo termina em'), t.slice(-600));
  await btn('Tirar da conta: Cartão azul').click(); await p.waitForTimeout(400);
  t = await body();
  ok('F1 com 0 dívidas: "Acrescente as dívidas que você quer comparar." e o resultado pede o preenchimento', t.includes('Acrescente as dívidas que você quer comparar.') && t.includes('Preencha os campos para ver o resultado.') && (await visibleCount('button', /^Tirar da conta/)) === 0);
  for (let i = 0; i < 10; i++) { await btn('Acrescentar dívida').click(); await p.waitForTimeout(120); }
  await p.waitForTimeout(300);
  t = await body();
  ok('F1 no máximo 10 dívidas: depois da 10ª, o botão some e o texto explica', (await visibleCount('button', 'Acrescentar dívida')) === 0 && t.includes('Você chegou a 10 dívidas. Tire alguma da conta para acrescentar outra.') && (await visibleCount('button', /^Tirar da conta/)) === 10);
  await atWidths(async (w) => { await layoutChecks(`F1 plano 10 dívidas ${w}px`); });
  ok('F1 nada foi gravado: nenhum parcelamento mudou (mesmas versões e contas), nenhuma requisição de escrita e nada no aparelho', (await f1Series()) === f1SeriesBefore && writes.length === f1Writes && (await f1Storage()) === f1Store, `${writes.length - f1Writes} escritas`);

  // ---- 6. Os links: Renda comprometida, Calculadoras e a busca "No app" ----
  await demoHome();
  await rcRow().click(); await waitText('da sua renda de referência em outubro de 2026'); await p.waitForTimeout(500);
  await scrollTo('Composição');
  ok('F1 Renda comprometida de outubro (sem parcela de financiamento no mês): sem a linha de dívidas, sem o link', (await visibleCount('button', 'Em que ordem quitar? Fazer as contas')) === 0);
  // O financiamento da demonstração vence em 10/11: a linha de dívidas (e o link) aparecem em novembro.
  await radio('Renda comprometida de novembro de 2026').click(); await waitText('da sua renda de referência em novembro de 2026'); await p.waitForTimeout(500);
  await scrollTo('Composição');
  ok('F1 Renda comprometida de novembro: no grupo de dívidas, o link "Em que ordem quitar? Fazer as contas"', (await visibleCount('button', 'Em que ordem quitar? Fazer as contas')) === 1);
  await atWidths(async (w) => { await layoutChecks(`F1 renda comprometida ${w}px`); });
  await btn('Em que ordem quitar? Fazer as contas').click(); await waitText('Suas dívidas'); await p.waitForTimeout(500);
  ok('F1 Renda comprometida › link abre a calculadora com o Financiamento do carro, sem nada gravado', urlPath() === '/calcular/plano-dividas' && (await body()).includes(F1_NAME) && (await body()).includes('Sem valor a mais: tudo termina em 36 meses'), p.url());
  await goResumo();
  await tabByName('Metas').click(); await waitText('Fazer as contas'); await p.waitForTimeout(300);
  await p.getByRole('button', { name: /^Calculadoras\./ }).filter({ visible: true }).first().click(); await waitText('Decidir uma compra'); await p.waitForTimeout(400);
  const f1Debts = await sectionRows('Dívidas e atrasos');
  ok('F1 Calculadoras: "Dívidas e atrasos" tem a nova linha depois de "Multa e juros por atraso"',
    f1Debts !== null && f1Debts.length === 4 && /^Multa e juros por atraso\./.test(f1Debts[2]) && f1Debts[3] === 'Em que ordem quitar as dívidas? Duas ordens de pagamento, lado a lado', JSON.stringify(f1Debts));
  await atWidths(async (w) => { await layoutChecks(`F1 calculadoras ${w}px`); if (w === 390) await shot('196_calculadoras_com_plano_dividas'); });
  await p.getByRole('button', { name: /^Em que ordem quitar as dívidas\? / }).filter({ visible: true }).first().click(); await waitText('Suas dívidas'); await p.waitForTimeout(400);
  ok('F1 Calculadoras › a linha abre /calcular/plano-dividas', urlPath() === '/calcular/plano-dividas');
  await tabByName('Aprender e dúvidas').click(); await waitText('Comece por aqui'); await p.waitForTimeout(400);
  const f1Box = () => p.getByLabel('Buscar um tema ou uma função', { exact: true }).filter({ visible: true }).first();
  for (const query of ['bola de neve', 'avalanche', 'quitar', 'dívida']) {
    await f1Box().fill(query); await waitText('No app'); await p.waitForTimeout(500);
    const f1Group = await p.evaluate(() => { const h = [...document.querySelectorAll('[role=heading]')].find((e) => e.textContent === 'No app' && e.getBoundingClientRect().width > 0); return h ? h.getAttribute('aria-level') : null; });
    ok(`F1 busca "${query}": o grupo "No app" (nível 2) tem "Em que ordem quitar as dívidas?"`, f1Group === '2' && (await p.getByRole('button', { name: /^Em que ordem quitar as dívidas\? Compare duas ordens de pagamento para sair das dívidas/ }).filter({ visible: true }).count()) === 1);
    if (query === 'bola de neve') await atWidths(async (w) => { await layoutChecks(`F1 busca No app ${w}px`); if (w === 390) await shot('197_aprender_no_app_dividas'); });
  }
  await f1Box().fill('bola de neve'); await waitText('No app'); await p.waitForTimeout(400);
  await p.getByRole('button', { name: /^Em que ordem quitar as dívidas\? Compare/ }).filter({ visible: true }).first().click(); await waitText('Suas dívidas'); await p.waitForTimeout(400);
  ok('F1 busca › tocar abre /calcular/plano-dividas com a barra à vista', urlPath() === '/calcular/plano-dividas' && barOk(await barState()), p.url());
  ok('F1 nada gravado nas navegações (links e busca): nenhuma requisição de escrita', writes.length === f1Writes, `${writes.length - f1Writes} escritas`);

  // ---- 7. Valores ocultos (D-025): a parcela que veio preenchida e os valores do resultado ficam mascarados ----
  await demoHome();
  await openConta();
  await hideSwitch().click(); await p.waitForTimeout(300);
  await btn('Voltar').click(); await waitText('Diferença do mês');
  await f1Open();
  await f1Fill(`Taxa de juros ao mês do contrato (%), ${F1_NAME}`, '1,5');
  await f1Fill('Quanto a mais você consegue pôr por mês nas dívidas?', '100,00');
  t = await body();
  const f1Parcela = field(`Valor da parcela, ${F1_NAME}, valor oculto`);
  ok('F1 valores ocultos: a parcela preenchida mostra "R$ ••••" e não se edita; o que a pessoa digitou (taxa 1,5 e valor a mais 100,00) continua à vista',
    (await f1Parcela.inputValue()) === '••••', await f1Parcela.inputValue());
  ok('F1 valores ocultos: o campo da parcela tem "valor oculto" no nome acessível e o link "Mostrar valores" ao lado',
    (await visibleCount('textbox', `Valor da parcela, ${F1_NAME}, valor oculto`)) === 1 && (await visibleCount('button', `Mostrar valores para editar a parcela, ${F1_NAME}`)) === 1 && t.includes('Mostrar valores'));
  ok('F1 valores ocultos: o campo da parcela não se edita e a dica diz como editar', !(await f1Parcela.isEditable()) && t.includes('Valor oculto. Mostre os valores para editar.') && (await f1Value(`Taxa de juros ao mês do contrato (%), ${F1_NAME}`)) === '1,5' && (await f1Value('Quanto a mais você consegue pôr por mês nas dívidas?')) === '100,00');
  const f1Leaks = await moneyLeaks();
  ok('F1 valores ocultos: nenhum valor em reais à vista (texto e nomes acessíveis), com "R$ ••••" no resultado e "valor oculto" nos nomes', f1Leaks.length === 0 && t.includes('Com o valor a mais: R$ •••• a menos de juros.') && t.includes('Total pago: R$ ••••') && t.includes('No seu plano de guardar você informou R$ •••• por mês.') && (await spokenHidden()) > 0, `${f1Leaks.slice(0, 3).join(' | ')} ${t.includes('R$ ••••')}`);
  ok('F1 valores ocultos: os meses e as ordens continuam (32 meses, junho de 2029)', t.includes('Com o valor a mais: tudo termina em 32 meses (2 anos e 8 meses), em junho de 2029.') && t.includes(`1. ${F1_NAME}: termina em 32 meses (junho de 2029).`));
  await atWidths(async (w) => {
    await layoutChecks(`F1 plano valores ocultos ${w}px`);
    await scrollTo(F1_NAME).catch(() => {});
    if (w === 390) await shot('194_plano_dividas_valores_ocultos');
    if (w === 320) await shot('194_plano_dividas_valores_ocultos_320px');
  });
  await keepText();
  await btn(`Mostrar valores para editar a parcela, ${F1_NAME}`).click(); await p.waitForTimeout(400);
  ok('F1 "Mostrar valores" na própria tela: a parcela volta a R$ 850,00 e pode ser editada, o link some e os valores do resultado voltam',
    (await field(`Valor da parcela, ${F1_NAME}`).inputValue()) === '850,00' && (await field(`Valor da parcela, ${F1_NAME}`).isEditable()) && (await visibleCount('button', /^Mostrar valores para editar/)) === 0 &&
    (await body()).includes('Total pago: R$ ') && !(await body()).includes('R$ ••••'));
  await goResumo();
  await openConta();
  ok('F1 "Mostrar valores" vale só nesta sessão: a preferência "Ocultar valores ao abrir" de Conta continua ligada, e os valores seguem à mostra',
    (await hideSwitch().getAttribute('aria-checked')) === 'true');
  await hideSwitch().click(); await p.waitForTimeout(300);
  await btn('Voltar').click(); await waitText('Diferença do mês');
  await f1Open();
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(300);

  // ---- 8. Conta nova: lista vazia, nunca um exemplo ----
  await newAcct('Fábio Teste', 'fabio@exemplo.com');
  await f1Open();
  t = await body();
  ok('F1 conta nova: nenhuma dívida de exemplo ("Acrescente as dívidas que você quer comparar."), nenhum parcelamento lido e o resultado pede o preenchimento',
    t.includes('Acrescente as dívidas que você quer comparar.') && !t.includes(F1_NAME) && !t.includes('Preenchido com os seus parcelamentos') && !t.includes('No seu plano de guardar') && t.includes('Preencha os campos para ver o resultado.') && (await visibleCount('button', /^Tirar da conta/)) === 0, t.slice(0, 500));
  const f1Writes2 = writes.length;
  const f1Store2 = await f1Storage();
  ok('F1 conta nova: nenhum parcelamento e nada gravado ao abrir', (await otherDevice(async (repo, ctx) => (await repo.listSeries(ctx)).length)) === 0);
  await atWidths(async (w) => {
    await layoutChecks(`F1 plano conta nova ${w}px`);
    if (w === 390) await shot('195_plano_dividas_conta_nova');
    if (w === 320) await shot('195_plano_dividas_conta_nova_320px');
  });
  await btn('Acrescentar dívida').click(); await p.waitForTimeout(300);
  await radio('Parcelada, Dívida 1').click(); await p.waitForTimeout(200);
  await f1Fill('Valor da parcela, Dívida 1', '200,00');
  await f1Fill('Parcelas que faltam, Dívida 1', '10');
  t = await body();
  ok('F1 conta nova: uma dívida parcelada à mão (10 × R$ 200,00, sem taxa) termina em 10 meses', t.includes('Sem valor a mais: tudo termina em 10 meses') && t.includes('Dívida 1: sem juros informados, conta só as parcelas.'), t.slice(-600));
  ok('F1 conta nova: nada gravado ao digitar (nenhuma escrita, nada no aparelho)', writes.length === f1Writes2 && (await f1Storage()) === f1Store2, `${writes.length - f1Writes2} escritas`);
  await keepText();
  await goResumo().catch(() => {});

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
  const d42OpenScan = async () => { if (await d42ScanLine().count()) await d42ScanLine().click(); else await btn('Ler outra nota').click(); await waitText('Como você quer ler a nota?'); };
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
  ok('D42 com dois cartões: "Cartão de crédito" escolhido e "Escolha o cartão" com os dois, o usado por último neste aparelho já escolhido (a memória de D-037)', (await d42Checked('Cartão de crédito')) === 'true' && d42Chosen.length === 2 &&
    d42Chosen.filter((x) => x.endsWith('=true')).length === 1 && d42Chosen[0].startsWith('Cartão Exemplo') && d42Chosen[0].endsWith('=true'), d42Chosen.join(' | '));
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
  await shot('216_cartoes_faturas_do_mes');
  await p.setViewportSize({ width: 320, height: 800 }); await p.waitForTimeout(400);
  await innerChecks('D42 cartões faturas do mês 320px');
  await shot('216_cartoes_faturas_do_mes_320px', true);
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
  await shot('217_cartoes_faturas_do_mes_valores_ocultos');
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
  await shot('218_nota_credito_sem_cartao');
  await p.setViewportSize({ width: 320, height: 800 }); await p.waitForTimeout(400);
  await innerChecks('D42 nota de crédito sem cartão 320px');
  await scrollTo('Como você pagou?');
  await shot('218_nota_credito_sem_cartao_320px');
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(300);
  await btn('Cadastrar cartão').click(); await waitText('Guardamos só o apelido e os 4 últimos dígitos.'); await p.waitForTimeout(400);
  ok('D42 "Cadastrar cartão" abre o cadastro do cartão', d42Path() === '/cartoes/novo', d42Path());
  await btn('Cancelar').click(); await p.waitForTimeout(500); if (await visibleCount('button', 'Descartar alterações')) await btn('Descartar alterações').click();
  await p.waitForTimeout(400);
  ok('D42 voltar do cadastro mantém a nota lida e a escolha do cartão de crédito', d42Path() === '/registro/novo' && (await body()).includes('Nota lida:') && (await d42Checked('Cartão de crédito')) === 'true', d42Path());
  await d42Leave();
  // Dois cartões e nenhuma compra anterior neste aparelho: a nota escolhe "Cartão de crédito", e a pessoa escolhe o cartão.
  await otherDevice(async (repo, ctx) => {
    const k = () => `e2e-${Math.random()}`;
    await repo.createCard(k(), ctx, { name: 'Cartão da Gabi', lastDigits: null, closingDay: 3, dueDay: 10, limitCents: null });
    await repo.createCard(k(), ctx, { name: 'Cartão azul', lastDigits: null, closingDay: 20, dueDay: 25, limitCents: null });
  });
  await d42AnnotarGasto();
  await d42Read(d42Keys.credito); t = await body();
  const d42Gabi = await p.getByRole('radiogroup', { name: 'Escolha o cartão' }).filter({ visible: true }).first().getByRole('radio').evaluateAll((es) => es.map((e) => `${e.textContent}=${e.getAttribute('aria-checked')}`));
  ok('D42 conta nova com dois cartões: "Cartão de crédito" escolhido, "Escolha o cartão" com os dois e nenhum escolhido (a pessoa decide)', (await d42Checked('Cartão de crédito')) === 'true' && d42Gabi.length === 2 && d42Gabi.every((x) => x.endsWith('=false')) &&
    !t.includes('Cadastre o cartão'), d42Gabi.join(' | '));
  await keepText();
  await scrollTo('Como você pagou?');
  await shot('219_nota_credito_dois_cartoes_sem_escolha');
  await d42Leave();
  // Cartão com fatura em outubro, mas sem renda de referência: o convite no lugar do percentual.
  await otherDevice(async (repo, ctx) => {
    const k = () => `e2e-${Math.random()}`;
    const card = (await repo.listCards(ctx)).find((c) => c.name === 'Cartão da Gabi');
    await repo.addCardPurchase(k(), card.id, { description: 'Material', category: 'Educação', purchasedOn: '2026-09-15', totalCents: 12000, installments: 1 });
    // O Cartão azul fecha dia 20: a compra de 25/09 está na fatura que vence em 25/10, ainda aberta.
    const azul = (await repo.listCards(ctx)).find((c) => c.name === 'Cartão azul');
    await repo.addCardPurchase(k(), azul.id, { description: 'Presente', category: 'Lazer', purchasedOn: '2026-09-25', totalCents: 8000, installments: 1 });
  });
  await d42GoTab('Movimentações'); await waitText('Registrar recebimento');
  await p.getByRole('button', { name: /^Cartões, / }).filter({ visible: true }).first().click(); await waitText('Faturas de outubro'); await p.waitForTimeout(600); t = await body();
  ok('D42 Cartões sem renda de referência: R$ 200,00 (dois cartões, um deles com fatura ainda aberta, dita) e "Informe sua renda para ver quanto isso representa." com o link para a renda de referência, sem percentual',
    t.includes('R$ 200,00') && t.includes('Inclui fatura ainda aberta: o valor pode mudar com novas compras.') && t.includes('Informe sua renda para ver quanto isso representa.') && (await visibleCount('button', 'Informar minha renda de referência')) === 1 && !t.includes('da sua renda de referência'), t.slice(0, 400));
  await keepText();
  await shot('220_cartoes_sem_renda_de_referencia');
  await p.setViewportSize({ width: 320, height: 800 }); await p.waitForTimeout(400);
  await innerChecks('D42 cartões sem renda 320px');
  await shot('220_cartoes_sem_renda_de_referencia_320px', true);
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
  await shot('221_contas_do_ano_lista');
  await p.setViewportSize({ width: 320, height: 800 }); await p.waitForTimeout(400);
  await innerChecks('D42 contas do ano, lista 320px');
  await scrollTo('Contas do ano');
  await shot('221_contas_do_ano_lista_320px');
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(300);

  await btn('Nova conta do ano').click(); await waitText('Como você paga?'); await p.waitForTimeout(500); t = await body();
  ok('D42 cadastro de conta do ano: a explicação curta no topo (uma vez por ano, cadastra uma vez, o Clarevo lembra e cria as contas do mês certo) e "O que é isso?"',
    t.includes('Contas do ano são as que vêm uma vez por ano, como IPVA, IPTU, matrícula e seguro. Você cadastra uma vez; todo ano o Clarevo lembra e cria as contas do mês certo.') && (await visibleCount('button', 'O que é isso?')) === 1 &&
    t.indexOf('Contas do ano são as que vêm') < t.indexOf('Descrição'), t.slice(0, 400));
  await keepText();
  await scrollTo('Com que frequência?');
  await shot('222_conta_do_ano_cadastro_topo');
  await p.setViewportSize({ width: 320, height: 800 }); await p.waitForTimeout(400);
  await scrollTo('Com que frequência?');
  await shot('222_conta_do_ano_cadastro_topo_320px');
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(300);
  ok('D42 cadastro de conta do ano: cota única e parcelado explicados com exemplo numérico (IPVA de R$ 2.400,00; IPTU de R$ 1.800,00 em 10 parcelas de R$ 180,00, de fevereiro a novembro)',
    t.includes('Cota única: o valor do ano sai de uma vez. Ex.: IPVA de R$ 2.400,00, que vence em janeiro.') && t.includes('Em parcelas: o valor do ano é dividido em vezes. Ex.: IPTU de R$ 1.800,00 em 10 parcelas de R$ 180,00, de fevereiro a novembro.'));
  ok('D42 cadastro de conta do ano: exemplos no mês, no dia e no valor (cota única)', t.includes('Em que mês a conta vence. Ex.: IPVA em janeiro.') && t.includes('De 1 a 31. Ex.: dia 20 para uma conta que vence em 20/01.') && t.includes('Ex.: IPVA de R$ 2.400,00.'));
  ok('D42 cadastro de conta do ano: o que acontece nos anos seguintes (valor que muda: estimativa e "Informar o valor"; valor igual: nada a fazer)',
    t.includes('Se muda, o Clarevo usa o valor que você cadastrou como estimativa. Quando o carnê ou o boleto do ano chegar, abra a conta do ano e informe o valor em Ano a ano.') && t.includes('E nos próximos anos?') &&
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
  await shot('223_conta_do_ano_cadastro_como_paga');
  await p.setViewportSize({ width: 320, height: 800 }); await p.waitForTimeout(400);
  await innerChecks('D42 cadastro de conta do ano 320px');
  await scrollTo('Como você paga?');
  await shot('223_conta_do_ano_cadastro_como_paga_320px');
  await scrollTo('E nos próximos anos?');
  await shot('224_conta_do_ano_cadastro_proximos_anos_320px');
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(300);
  await scrollTo('E nos próximos anos?');
  await shot('224_conta_do_ano_cadastro_proximos_anos');
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
  await shot('225_conta_do_ano_detalhe');
  await p.setViewportSize({ width: 320, height: 800 }); await p.waitForTimeout(400);
  await innerChecks('D42 detalhe da conta do ano 320px');
  await scrollTo('Ano a ano');
  await shot('225_conta_do_ano_detalhe_320px');
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(300);
  await btn('Informar o valor de 2026').click(); await waitText('Use o valor do carnê ou do boleto de 2026.'); await p.waitForTimeout(400); t = await body();
  ok('D42 "Informar o valor de 2026": diz que vale só para 2026 e que os outros anos continuam com a referência', t.includes('Isso vale só para 2026. Os outros anos continuam com a referência atual.'));
  await keepText();
  await shot('226_conta_do_ano_informar_valor');
  await p.setViewportSize({ width: 320, height: 800 }); await p.waitForTimeout(400);
  await innerChecks('D42 informar o valor do ano 320px');
  await shot('226_conta_do_ano_informar_valor_320px');
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(300);
  await btn('Cancelar').click(); await p.waitForTimeout(400); if (await visibleCount('button', 'Descartar alterações')) await btn('Descartar alterações').click();
  await waitText('Ano a ano');
  // Editar a conta do ano: o texto lembra que, para um ano só, vale "Informar o valor".
  await btn('Mudar valor ou dia a partir de uma conta').click(); await waitText('Aplicar a partir de'); await p.waitForTimeout(400);
  ok('D42 editar a conta do ano: lembra que para o valor de um ano só se usa "Informar o valor", em Ano a ano', (await body()).includes('Para mudar o valor de um ano só, use Informar o valor, em Ano a ano. Aqui a mudança vale também para os anos seguintes.'));
  await keepText();
  await btn('Cancelar').click(); await p.waitForTimeout(400); if (await visibleCount('button', 'Descartar alterações')) await btn('Descartar alterações').click();
  await goResumo().catch(() => {});

  // ==================================================================================================================
  // Antes de financiar (D-044; pedido de Adriana Velasquez, encaminhado por Enzo em 10/10/2026). Calculadora educativa em
  // /calcular/antes-de-financiar, no padrão de D-035: nada é gravado (nem no aparelho), a taxa do financiamento e o rendimento
  // são sempre digitados, sem produto e sem dizer qual caminho escolher. Na demonstração, hoje é 07/10/2026, a renda de
  // referência é R$ 6.000,00 e o comprometido de outubro é R$ 3.150,00 (52,5%). Cada tela é conferida em 390 e em 320 px.
  // Capturas novas: 230 em diante (210 a 227 já existem; a especificação pedia 220).
  // Conta: preço R$ 40.000,00, entrada R$ 8.000,00 (financia R$ 32.000,00), 48 parcelas a 1,99% ao mês, a primeira em 1 mês:
  // parcela R$ 1.041,14, total R$ 57.974,72 e juros R$ 17.974,72 (conferidos à parte, em Python, com frações exatas).
  // ==================================================================================================================
  const D44_VETOED = /\b(melhor(es)?|pior(es)?|dever[ií]\w*|renegoci\w*|portabilidade|consignad\w*|cons[óo]rcio|vale a pena|saldo devedor|recomendamos|invista\w*|aplique em)\b/i;
  const d44Fill = async (label, value) => { const f = field(label); await f.fill(value); await f.blur(); await p.waitForTimeout(200); };
  const d44Open = async () => {
    await tabByName('Metas').click(); await waitText('Fazer as contas'); await p.waitForTimeout(400);
    await p.getByRole('button', { name: /^Calculadoras\./ }).filter({ visible: true }).first().click(); await waitText('Decidir uma compra'); await p.waitForTimeout(400);
    await p.getByRole('button', { name: /^Antes de financiar\. / }).filter({ visible: true }).first().click(); await waitText('Preço à vista do bem'); await p.waitForTimeout(700);
  };
  const d44Series = () => otherDevice(async (repo, ctx) => JSON.stringify((await repo.listSeries(ctx)).map((s) => [s.id, s.version, s.openCount, s.paidCount])));
  const d44Goals = () => otherDevice(async (repo, ctx) => JSON.stringify((await repo.listGoals(ctx)).map((g) => [g.id, g.version])));
  const d44Small = () => p.evaluate(() => [...document.querySelectorAll('[role=button],[role=radio]')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.height < 47.5; }).map((e) => (e.getAttribute('aria-label') || e.textContent || '').slice(0, 40)));
  const d44Texts = [];
  const d44Keep = async () => { d44Texts.push(await body()); await keepText(); };
  const d44Fill1 = async () => {
    await d44Fill('Preço à vista do bem', '40000'); await d44Fill('Entrada', '8000'); await d44Fill('Número de parcelas', '48'); await d44Fill('Taxa de juros ao mês (%)', '1,99');
  };

  await demoHome();
  const d44Writes = writes.length;
  const d44Store = await storage();
  const d44SeriesBefore = await d44Series();
  const d44GoalsBefore = await d44Goals();

  // ---- 1. Calculadoras: a nova linha abre o grupo "Decidir uma compra" ----
  await tabByName('Metas').click(); await waitText('Fazer as contas'); await p.waitForTimeout(400);
  await p.getByRole('button', { name: /^Calculadoras\./ }).filter({ visible: true }).first().click(); await waitText('Decidir uma compra'); await p.waitForTimeout(400);
  const d44Group = await sectionRows('Decidir uma compra');
  ok('D44 Calculadoras: "Decidir uma compra" começa com "Antes de financiar", seguida de "Parcelado ou à vista?" e "Quanto custa por ano?"',
    d44Group !== null && d44Group.length === 3 && d44Group[0] === 'Antes de financiar. Parcela, juros e o que muda se juntar antes' && /^Parcelado ou à vista\? /.test(d44Group[1]) && /^Quanto custa por ano\?\. |^Quanto custa por ano\? /.test(d44Group[2]), JSON.stringify(d44Group));
  await atWidths(async (w) => { await layoutChecks(`D44 calculadoras ${w}px`); if (w === 390) await shot('236_calculadoras_com_antes_de_financiar'); });
  await p.getByRole('button', { name: /^Antes de financiar\. / }).filter({ visible: true }).first().click(); await waitText('Preço à vista do bem'); await p.waitForTimeout(700);

  // ---- 2. A tela abre vazia, com a renda de referência já no campo de renda e a taxa em branco ----
  t = await body();
  ok('D44 a tela abre em /calcular/antes-de-financiar com o título "Antes de financiar", o aviso das calculadoras no topo e a barra inferior com Metas marcada',
    urlPath() === '/calcular/antes-de-financiar' && (await h1Name()) === 'Antes de financiar' && t.includes('Simulação com os valores e as taxas que você informou. Não é recomendação de produto financeiro nem oferta de crédito.') && barOk(await barState()) && (await barState()).selected[0] === 'Metas');
  await checkBar('D44 antes de financiar', 'Metas');
  ok('D44 campos: preço, entrada (opcional), parcelas, taxa ao mês, "A primeira parcela vence em 1 mês?" (Sim marcado), renda e a alternativa de juntar antes',
    ['Preço à vista do bem', 'Entrada', 'Número de parcelas', 'Taxa de juros ao mês (%)', 'Sua renda líquida por mês', 'Quanto você conseguiria guardar por mês', 'Rendimento ao ano (%)'].every((x) => t.includes(x)) &&
    t.includes('A primeira parcela vence em 1 mês?') && t.includes('Não: a primeira parcela é paga na compra.') && (await radio('Sim').getAttribute('aria-checked')) === 'true' && (await radio('Não').getAttribute('aria-checked')) === 'false' &&
    t.includes('Alternativa: juntar antes') && (await radio('Dar mais entrada').getAttribute('aria-checked')) === 'true' && (await radio('Comprar à vista').getAttribute('aria-checked')) === 'false');
  ok('D44 a taxa e o rendimento nunca vêm preenchidos: taxa em branco, com "Está na proposta do banco ou da loja. Use o CET ao mês, se tiver."; rendimento em branco ("Em branco: sem rendimento.")',
    (await field('Taxa de juros ao mês (%)').inputValue()) === '' && (await field('Rendimento ao ano (%)').inputValue()) === '' && t.includes('Está na proposta do banco ou da loja. Use o CET ao mês, se tiver.') && t.includes('Em branco: sem rendimento.'));
  ok('D44 a renda de referência (R$ 6.000,00) entra sozinha no campo de renda, com a dica de que mudar aqui não altera a referência',
    (await field('Sua renda líquida por mês').inputValue()) === '6.000,00' && t.includes('Veio da sua renda de referência. Mudar aqui não altera a referência.'), await field('Sua renda líquida por mês').inputValue());
  ok('D44 antes de preencher: "Preencha os campos para ver o resultado.", sem botão "Calcular" e sem os blocos do resultado', t.includes('Preencha os campos para ver o resultado.') && (await visibleCount('button', /^Calcular/)) === 0 &&
    !t.includes('Com uma entrada maior') && (await visibleCount('button', 'Anotar como parcelamento')) === 0 && (await visibleCount('button', 'Criar meta com este valor')) === 0);
  await atWidths(async (w) => {
    await layoutChecks(`D44 antes de financiar vazio ${w}px`);
    const small = await d44Small();
    ok(`D44 vazio (${w}px): botões, chips e links da tela com alvo de 48 px`, small.filter((x) => !/^(Voltar|Resumo|Movimentos|Metas|Aprender)/.test(x)).length === 0, small.join(' | '));
    if (w === 390) await shot('230_antes_de_financiar_vazio');
    if (w === 320) await shot('230_antes_de_financiar_vazio_320px');
  });
  await d44Keep();

  // ---- 3. O resultado: financiar, tempo, juros, peso na renda e o comprometido de 52,5% para 69,9% ----
  await d44Fill1();
  t = await body();
  ok('D44 os campos de reais ganham a forma de moeda ao sair (40.000,00 e 8.000,00)', (await field('Preço à vista do bem').inputValue()) === '40.000,00' && (await field('Entrada').inputValue()) === '8.000,00');
  ok('D44 financiar: 48 parcelas de R$ 1.041,14, por 48 meses (4 anos) até outubro de 2030, total R$ 57.974,72 (entrada de R$ 8.000,00 mais 48 × R$ 1.041,14) e juros de R$ 17.974,72',
    t.includes('Com estes números, são 48 parcelas de R$ 1.041,14.') && t.includes('Você paga por 48 meses (4 anos), até outubro de 2030.') &&
    t.includes('Total pago: R$ 57.974,72 (entrada de R$ 8.000,00 mais 48 × R$ 1.041,14).') && t.includes('Juros: R$ 17.974,72.'), t.slice(-1800));
  ok('D44 peso na renda: a parcela seria 17,4% da renda e o comprometido de outubro iria de 52,5% para 69,9% enquanto durar o financiamento',
    t.includes('A parcela seria 17,4% da sua renda.') && t.includes('Seu comprometido iria de 52,5% para 69,9% enquanto durar o financiamento.'));
  ok('D44 a referência de 30% aparece só como referência, com a fonte e a data (como na tela da renda), e o aviso fixo da estimativa',
    t.includes('Referência usada pela Serasa: até 30% da renda líquida com parcelas de dívidas. É uma referência geral, não uma regra para você.') &&
    t.includes('Fonte: Serasa, página sobre comprometimento de renda, consultada em 09/10/2026.') && t.includes('Estimativa. As condições oficiais são as da proposta; peça o CET.'));
  ok('D44 hipóteses visíveis: tabela Price com a primeira parcela em 1 mês, só a taxa informada, comprometido do mês atual e "O preço do bem pode mudar enquanto você junta."',
    t.includes('Hipóteses') && t.includes('Parcelas iguais (tabela Price), a primeira 1 mês depois da compra.') && t.includes('Só a taxa de juros informada, sem tarifas, seguros e IOF.') &&
    t.includes('O comprometido é o do mês atual, com as contas a pagar já criadas; os meses seguintes podem ser diferentes.') && t.includes('O preço do bem pode mudar enquanto você junta.'));
  ok('D44 juntar antes (dar mais entrada, sem rendimento): guardando R$ 1.041,14 por mês, junta R$ 32.000,00 em 31 meses (2 anos e 7 meses), com a comparação neutra',
    t.includes('Guardando R$ 1.041,14 por mês, sem rendimento, você junta R$ 32.000,00 em 31 meses (2 anos e 7 meses).') &&
    t.includes('Financiando: você usa o bem agora e paga R$ 17.974,72 de juros ao longo de 48 meses.') && t.includes('Juntando: leva 31 meses para juntar o valor que seria financiado e não paga juros do financiamento.'));
  ok('D44 entrada maior: mais 10% (R$ 4.000,00) e 20% (R$ 8.000,00) do preço, com a parcela, os juros e a diferença, e o atalho "Fazer a conta com outra entrada"',
    t.includes('Com uma entrada maior') && t.includes('Mais 10% do preço de entrada (R$ 4.000,00): parcela de R$ 910,99 e juros de R$ 15.727,52 (R$ 2.247,20 a menos).') &&
    t.includes('Mais 20% do preço de entrada (R$ 8.000,00): parcela de R$ 780,85 e juros de R$ 13.480,80 (R$ 4.493,92 a menos).') && (await visibleCount('button', 'Fazer a conta com outra entrada')) === 1);
  ok('D44 depois do resultado: "Anotar como parcelamento" e "Criar meta com este valor" (com a dica de que a taxa de rendimento não é gravada)',
    (await visibleCount('button', 'Anotar como parcelamento')) === 1 && (await visibleCount('button', 'Criar meta com este valor')) === 1 && t.includes('A meta recebe o valor, o prazo e o valor por mês. A taxa de rendimento não é gravada.'));
  ok('D44 os títulos: "Resultado", "Hipóteses", "Juntar antes" e "Com uma entrada maior" são títulos da tela', (await headingList()).filter((h) => /^[23]:(Resultado|Hipóteses|Juntar antes|Com uma entrada maior|Alternativa: juntar antes)$/.test(h)).length === 5, JSON.stringify(await headingList()));
  ok('D44 a região viva do resultado tem a parcela, o prazo, os juros e o peso na renda; a de "Juntar antes" tem o tempo e a comparação',
    (await liveText()).includes('Com estes números, são 48 parcelas de R$ 1.041,14.') && (await liveText()).includes('A parcela seria 17,4% da sua renda.') && (await liveText()).includes('Guardando R$ 1.041,14 por mês'), (await liveText()).slice(0, 300));
  ok('D44 nenhum texto de julgamento, de recomendação ou da lista vetada no resultado', !D44_VETOED.test(t) && !FORBIDDEN.test(t) && !JUDGMENT.test(t), (t.match(D44_VETOED) ?? t.match(FORBIDDEN) ?? t.match(JUDGMENT) ?? [''])[0]);
  ok('D44 sem botão "Calcular": o resultado aparece enquanto a pessoa digita', (await visibleCount('button', /^Calcular/)) === 0);
  await atWidths(async (w) => {
    await layoutChecks(`D44 resultado ${w}px`);
    const small = await d44Small();
    ok(`D44 resultado (${w}px): botões, chips e links da tela com alvo de 48 px`, small.filter((x) => !/^(Voltar|Resumo|Movimentos|Metas|Aprender)/.test(x)).length === 0, small.join(' | '));
    await scrollTo('Resultado');
    if (w === 390) await shot('231_antes_de_financiar_resultado');
    if (w === 320) await shot('231_antes_de_financiar_resultado_320px');
    await scrollTo('Juntar antes');
    if (w === 390) await shot('232_antes_de_financiar_juntar_antes');
    if (w === 320) await shot('232_antes_de_financiar_juntar_antes_320px');
  });
  await d44Keep();

  // ---- 4. A conta muda com a renda, com a primeira parcela na compra e com o que se junta ----
  await d44Fill('Sua renda líquida por mês', '5000');
  t = await body();
  ok('D44 renda digitada aqui (R$ 5.000,00, sem gravar): 20,8% da renda, e o comprometido vai de 63,0% para 83,8%', t.includes('A parcela seria 20,8% da sua renda.') && t.includes('Seu comprometido iria de 63,0% para 83,8% enquanto durar o financiamento.') &&
    t.includes('Percentuais sobre a renda líquida por mês que você informou aqui.') && !t.includes('Veio da sua renda de referência.'));
  await d44Fill('Sua renda líquida por mês', '');
  t = await body();
  ok('D44 sem renda: só valores em reais ("Seu comprometido do mês iria de R$ 3.150,00 para R$ 4.191,14"), sem percentuais e sem a referência de 30%',
    t.includes('Seu comprometido do mês iria de R$ 3.150,00 para R$ 4.191,14 enquanto durar o financiamento.') && !t.includes('A parcela seria') && !t.includes('Referência usada pela Serasa') && !t.includes('Veio da sua renda de referência.') && t.includes('Estimativa. As condições oficiais são as da proposta; peça o CET.'));
  await d44Fill('Sua renda líquida por mês', '6000');
  await radio('Não').click(); await p.waitForTimeout(300);
  t = await body();
  ok('D44 primeira parcela paga na compra: parcela de R$ 1.020,82, total R$ 56.999,36 (R$ 16.999,36 de juros), "a primeira na compra" e a hipótese correspondente',
    t.includes('Com estes números, são 48 parcelas de R$ 1.020,82.') && t.includes('Você paga por 48 meses (4 anos), a primeira na compra, até setembro de 2030.') && t.includes('Total pago: R$ 56.999,36 (entrada de R$ 8.000,00 mais 48 × R$ 1.020,82).') && t.includes('Juros: R$ 16.999,36.') &&
    t.includes('Parcelas iguais (tabela Price), a primeira paga na compra e as outras a cada mês.'));
  await radio('Sim').click(); await p.waitForTimeout(300);
  await radio('Comprar à vista').click(); await d44Fill('Quanto você conseguiria guardar por mês', '1500'); await d44Fill('Rendimento ao ano (%)', '8');
  t = await body();
  ok('D44 comprar à vista, R$ 1.500,00 por mês e 8% ao ano: junta R$ 40.000,00 em 25 meses (2 anos e 1 mês); a hipótese diz o rendimento, os depósitos no início do mês e que o preço pode mudar',
    t.includes('Guardando R$ 1.500,00 por mês, com rendimento de 8% ao ano, você junta R$ 40.000,00 em 25 meses (2 anos e 1 mês).') &&
    t.includes('Juntando: leva 25 meses para comprar à vista e não paga juros do financiamento.') &&
    t.includes('Rendimento de 8% ao ano (0,64% ao mês, taxa equivalente), informado por você, constante no período e sem imposto ou taxas.') &&
    t.includes('Depósitos no início de cada mês, como na Calculadora do Cidadão do Banco Central; prazo em meses inteiros, para cima.') && t.includes('Juntar para comprar à vista: o valor a juntar é o preço inteiro, R$ 40.000,00.') && t.includes('O preço do bem pode mudar enquanto você junta.'));
  await d44Fill('Rendimento ao ano (%)', '31');
  t = await body();
  ok('D44 rendimento acima de 30%: erro no campo ("Use um rendimento de 0% a 30% ao ano, com até 2 casas.") e o texto de espera no resultado', t.includes('Use um rendimento de 0% a 30% ao ano, com até 2 casas.') && t.includes('Preencha os campos para ver o resultado.'));
  await d44Fill('Rendimento ao ano (%)', '');
  await radio('Dar mais entrada').click(); await d44Fill('Quanto você conseguiria guardar por mês', '');
  t = await body();
  ok('D44 rendimento e valor por mês em branco: volta a "sem rendimento" e ao valor da parcela (31 meses)', t.includes('Guardando R$ 1.041,14 por mês, sem rendimento, você junta R$ 32.000,00 em 31 meses (2 anos e 7 meses).'));
  await d44Fill('Entrada', '40000');
  t = await body();
  ok('D44 entrada igual ao preço: "Com a entrada igual ao preço à vista, não há o que financiar.", sem juros, sem blocos de comparação e sem os botões',
    t.includes('Com a entrada igual ao preço à vista, não há o que financiar.') && t.includes('Você paga R$ 40.000,00 na compra, sem juros.') && !t.includes('Com uma entrada maior') && !t.includes('Guardando R$') &&
    (await visibleCount('button', 'Anotar como parcelamento')) === 0 && (await visibleCount('button', 'Criar meta com este valor')) === 0);
  await d44Fill('Entrada', '40000,01');
  t = await body();
  ok('D44 entrada acima do preço: "A entrada não pode passar do preço à vista." (depois de sair do campo)', t.includes('A entrada não pode passar do preço à vista.') && t.includes('Preencha os campos para ver o resultado.'));
  await d44Fill('Entrada', '8000');
  await d44Fill('Número de parcelas', '481');
  t = await body();
  ok('D44 parcelas acima de 480: "Use de 1 a 480 parcelas."', t.includes('Use de 1 a 480 parcelas.'));
  await d44Fill('Número de parcelas', '48');
  await d44Fill('Taxa de juros ao mês (%)', '100');
  t = await body();
  ok('D44 taxa acima de 99,99%: "Use uma taxa de 0% a 99,99% ao mês."', t.includes('Use uma taxa de 0% a 99,99% ao mês.'));
  await d44Fill('Taxa de juros ao mês (%)', '1,99');
  ok('D44 voltando aos números do exemplo, o resultado volta (R$ 1.041,14)', await shows('Com estes números, são 48 parcelas de R$ 1.041,14.'));

  // ---- 5. "Fazer a conta com outra entrada": leva o foco à entrada, sem mudar nada ----
  await btn('Fazer a conta com outra entrada').click(); await p.waitForTimeout(400);
  ok('D44 "Fazer a conta com outra entrada" leva o foco ao campo Entrada, que continua com R$ 8.000,00', (await p.evaluate(() => document.activeElement?.getAttribute('aria-label'))) === 'Entrada' && (await field('Entrada').inputValue()) === '8.000,00');
  await d44Fill('Entrada', '12000');
  t = await body();
  ok('D44 com a entrada de R$ 12.000,00 a conta refaz tudo (financia R$ 28.000,00) e as linhas de entrada maior somam 10% e 20% do preço à entrada nova',
    t.includes('Mais 10% do preço de entrada (R$ 4.000,00)') && t.includes('Mais 20% do preço de entrada (R$ 8.000,00)') && t.includes('junta R$ 28.000,00 em') && t.includes('entrada de R$ 12.000,00 mais 48 ×'));
  await d44Fill('Entrada', '8000');

  // ---- 6. "Anotar como parcelamento" e "Criar meta com este valor": abrem o cadastro e a meta preenchidos, sem gravar nada ----
  await btn('Anotar como parcelamento').click(); await waitText('Total de parcelas'); await p.waitForTimeout(500);
  ok('D44 "Anotar como parcelamento" abre o cadastro com Parcelado, a natureza "Financiamento ou empréstimo", a parcela de 1.041,14 e as 48 parcelas',
    (await h1Name()) === 'Novo parcelamento' && (await radio('Parcelado').getAttribute('aria-checked')) === 'true' && (await field('Valor da parcela').inputValue()) === '1.041,14' && (await field('Total de parcelas').inputValue()) === '48' &&
    (await p.getByRole('radio', { name: /^Financiamento ou empréstimo/ }).filter({ visible: true }).first().getAttribute('aria-checked')) === 'true', `${await field('Total de parcelas').inputValue()}`);
  ok('D44 abrir o cadastro não grava nada (nenhum parcelamento novo)', (await d44Series()) === d44SeriesBefore);
  await btn('Cancelar').click(); await p.waitForTimeout(400);
  if (await visibleCount('button', 'Descartar alterações')) await btn('Descartar alterações').click();
  await waitUntil(async () => (await h1Name()) === 'Antes de financiar', 8000);
  ok('D44 voltar do cadastro sem salvar devolve a calculadora com o resultado', await shows('Com estes números, são 48 parcelas de R$ 1.041,14.'));
  await btn('Criar meta com este valor').click(); await waitText('Modelo de nome'); await p.waitForTimeout(500);
  const d44Meta = await formValues();
  ok('D44 "Criar meta com este valor" abre /meta/nova (objetivo) com valor 32.000,00, prazo 04/2029 (31 meses a partir de outubro de 2026) e plano de 1.041,14; nome em branco; nada de taxa no endereço',
    urlPath() === '/meta/nova' && d44Meta.some((v) => v === 'Valor da meta=32.000,00') && d44Meta.some((v) => v.endsWith('=04/2029')) && d44Meta.some((v) => v.endsWith('=1.041,14')) && d44Meta.some((v) => /^Nome da meta=$/.test(v)) && !/taxa|rendimento|1,99/i.test(p.url()), `${JSON.stringify(d44Meta)} ${p.url()}`);
  await shot('233_antes_de_financiar_criar_meta');
  ok('D44 abrir o formulário de meta não grava nada', (await d44Goals()) === d44GoalsBefore);
  await btn('Voltar').click(); await p.waitForTimeout(500);
  if (await visibleCount('button', /Descartar|Sair/)) await p.getByRole('button', { name: /Descartar|Sair/ }).filter({ visible: true }).first().click().catch(() => {});
  await waitUntil(async () => (await h1Name()) === 'Antes de financiar', 8000);
  ok('D44 voltar da meta devolve a calculadora com o que foi digitado', (await field('Taxa de juros ao mês (%)').inputValue()) === '1,99' && (await field('Número de parcelas').inputValue()) === '48');
  ok('D44 nada gravado até aqui: nenhuma requisição de escrita, nada no aparelho, nenhum parcelamento nem meta nova', writes.length === d44Writes && (await storage()) === d44Store && (await d44Series()) === d44SeriesBefore && (await d44Goals()) === d44GoalsBefore, `${writes.length - d44Writes} escritas`);

  // ---- 7. Os caminhos até a calculadora: Simular, Renda comprometida e a busca "No app" ----
  await demoHome();
  await tabByName('Metas').click(); await waitText('Fazer as contas'); await p.waitForTimeout(400);
  await p.getByRole('button', { name: /^Simular um plano\./ }).filter({ visible: true }).first().click(); await waitText('Simular um plano'); await p.waitForTimeout(500);
  ok('D44 Simular: o link "Antes de financiar? Fazer as contas" fica depois do resultado', (await visibleCount('button', 'Antes de financiar? Fazer as contas')) === 1);
  await atWidths(async (w) => { await scrollTo('Antes de financiar? Fazer as contas'); await layoutChecks(`D44 simular ${w}px`); if (w === 390) await shot('234_simular_com_link_antes_de_financiar'); });
  await btn('Antes de financiar? Fazer as contas').click(); await waitText('Preço à vista do bem'); await p.waitForTimeout(500);
  ok('D44 Simular › link abre /calcular/antes-de-financiar com a renda de referência já no campo', urlPath() === '/calcular/antes-de-financiar' && (await field('Sua renda líquida por mês').inputValue()) === '6.000,00', p.url());
  await demoHome();
  await rcRow().click(); await waitText('da sua renda de referência em outubro de 2026'); await p.waitForTimeout(500);
  ok('D44 Renda comprometida: o link "Antes de financiar? Fazer as contas" entre os links do fim da tela', (await visibleCount('button', 'Antes de financiar? Fazer as contas')) === 1);
  await atWidths(async (w) => { await scrollTo('Quem vê estes dados?'); await layoutChecks(`D44 renda comprometida ${w}px`); if (w === 390) await shot('235_renda_comprometida_com_link_antes_de_financiar'); });
  await btn('Antes de financiar? Fazer as contas').click(); await waitText('Preço à vista do bem'); await p.waitForTimeout(500);
  ok('D44 Renda comprometida › link abre a calculadora, sem nada gravado', urlPath() === '/calcular/antes-de-financiar' && (await field('Sua renda líquida por mês').inputValue()) === '6.000,00');
  await demoHome();
  await tabByName('Aprender e dúvidas').click(); await waitText('Comece por aqui'); await p.waitForTimeout(400);
  const d44Box = () => p.getByLabel('Buscar um tema ou uma função', { exact: true }).filter({ visible: true }).first();
  for (const query of ['financiar', 'financiamento', 'poder de compra', 'entrada', 'à vista']) {
    await d44Box().fill(query); await waitText('No app'); await p.waitForTimeout(500);
    const d44Group2 = await p.evaluate(() => { const h = [...document.querySelectorAll('[role=heading]')].find((e) => e.textContent === 'No app' && e.getBoundingClientRect().width > 0); return h ? h.getAttribute('aria-level') : null; });
    ok(`D44 busca "${query}": o grupo "No app" (nível 2) tem "Antes de financiar"`, d44Group2 === '2' && (await p.getByRole('button', { name: /^Antes de financiar\. Veja a parcela, os juros e quanto pesa na renda antes de comprar a prazo/ }).filter({ visible: true }).count()) === 1);
    if (query === 'financiar') await atWidths(async (w) => { await layoutChecks(`D44 busca No app ${w}px`); if (w === 390) await shot('237_aprender_no_app_financiar'); });
  }
  await d44Box().fill('consórcio'); await p.waitForTimeout(500);
  ok('D44 busca "consórcio": a calculadora não aparece (consórcio não é parte desta função)', (await p.getByRole('button', { name: /^Antes de financiar\. / }).filter({ visible: true }).count()) === 0);
  await d44Box().fill('financiar'); await waitText('No app'); await p.waitForTimeout(400);
  await p.getByRole('button', { name: /^Antes de financiar\. Veja a parcela/ }).filter({ visible: true }).first().click(); await waitText('Preço à vista do bem'); await p.waitForTimeout(500);
  ok('D44 busca › tocar abre /calcular/antes-de-financiar com a barra à vista', urlPath() === '/calcular/antes-de-financiar' && barOk(await barState()), p.url());
  ok('D44 nada gravado nas navegações (links e busca): nenhuma requisição de escrita', writes.length === d44Writes, `${writes.length - d44Writes} escritas`);

  // ---- 8. Valores ocultos (D-025): a renda que veio da referência e os valores do resultado ficam mascarados ----
  await demoHome();
  await openConta();
  await hideSwitch().click(); await p.waitForTimeout(300);
  await btn('Voltar').click(); await waitText('Diferença do mês');
  await d44Open();
  await d44Fill1();
  t = await body();
  const d44Renda = field('Sua renda líquida por mês, valor oculto');
  ok('D44 valores ocultos: a renda da referência mostra "••••", não se edita e leva "valor oculto" no nome acessível; o que a pessoa digitou (taxa 1,99) continua à vista',
    (await d44Renda.inputValue()) === '••••' && !(await d44Renda.isEditable()) && (await field('Taxa de juros ao mês (%)').inputValue()) === '1,99' && t.includes('Valor oculto. Mostre os valores para editar.'));
  const d44Leaks = await moneyLeaks();
  ok('D44 valores ocultos: nenhum valor em reais à vista (texto e nomes acessíveis); "R$ ••••" no resultado, nas linhas de juntar antes e de entrada maior; os percentuais e os meses continuam',
    d44Leaks.length === 0 && t.includes('Com estes números, são 48 parcelas de R$ ••••.') && t.includes('A parcela seria 17,4% da sua renda.') && t.includes('Seu comprometido iria de 52,5% para 69,9% enquanto durar o financiamento.') &&
    t.includes('Você paga por 48 meses (4 anos), até outubro de 2030.') && t.includes('em 31 meses (2 anos e 7 meses).') && (await spokenHidden()) > 0, `${d44Leaks.slice(0, 3).join(' | ')}`);
  await atWidths(async (w) => {
    await layoutChecks(`D44 valores ocultos ${w}px`);
    await scrollTo('Sua renda líquida por mês');
    if (w === 390) await shot('238_antes_de_financiar_valores_ocultos_renda');
    if (w === 320) await shot('238_antes_de_financiar_valores_ocultos_renda_320px');
    await scrollTo('Resultado');
    if (w === 390) await shot('238_antes_de_financiar_valores_ocultos');
    if (w === 320) await shot('238_antes_de_financiar_valores_ocultos_320px');
  });
  await d44Keep();
  await btn('Mostrar valores para editar a renda').click(); await p.waitForTimeout(400);
  ok('D44 "Mostrar valores" na própria tela: a renda volta a R$ 6.000,00, pode ser editada e o link some; os valores do resultado voltam',
    (await field('Sua renda líquida por mês').inputValue()) === '6.000,00' && (await field('Sua renda líquida por mês').isEditable()) && (await visibleCount('button', 'Mostrar valores para editar a renda')) === 0 && (await body()).includes('são 48 parcelas de R$ 1.041,14.'));
  await goResumo();
  await openConta();
  ok('D44 "Mostrar valores" vale só nesta sessão: a preferência "Ocultar valores ao abrir" continua ligada', (await hideSwitch().getAttribute('aria-checked')) === 'true');
  await hideSwitch().click(); await p.waitForTimeout(300);
  await btn('Voltar').click(); await waitText('Diferença do mês');

  // ---- 9. Conta nova: nada de exemplo, sem renda no campo e sem comprometido a comparar ----
  await newAcct('Dora Teste', 'dora@exemplo.com');
  const d44Writes2 = writes.length;
  const d44Store2 = await storage();
  await d44Open();
  t = await body();
  ok('D44 conta nova: o campo de renda abre em branco (sem renda de referência), a taxa em branco e o resultado pede o preenchimento; nenhum exemplo',
    (await field('Sua renda líquida por mês').inputValue()) === '' && (await field('Taxa de juros ao mês (%)').inputValue()) === '' && !t.includes('Veio da sua renda de referência.') && t.includes('Preencha os campos para ver o resultado.') && !t.includes('R$ 1.041,14'));
  await atWidths(async (w) => {
    await layoutChecks(`D44 conta nova ${w}px`);
    if (w === 390) await shot('239_antes_de_financiar_conta_nova');
    if (w === 320) await shot('239_antes_de_financiar_conta_nova_320px');
    await scrollTo('Sua renda líquida por mês');
    if (w === 390) await shot('239_antes_de_financiar_conta_nova_renda');
    if (w === 320) await shot('239_antes_de_financiar_conta_nova_renda_320px');
  });
  await d44Fill1();
  t = await body();
  ok('D44 conta nova: parcela, prazo e juros calculados; sem renda e sem nada comprometido, nenhuma linha de peso na renda (nem "de R$ 0,00 para")',
    t.includes('Com estes números, são 48 parcelas de R$ 1.041,14.') && t.includes('Juros: R$ 17.974,72.') && !t.includes('A parcela seria') && !t.includes('Seu comprometido') && !t.includes('Referência usada pela Serasa'), t.slice(-900));
  await d44Fill('Sua renda líquida por mês', '4500');
  t = await body();
  ok('D44 conta nova com a renda digitada (R$ 4.500,00): a parcela seria 23,1% e o comprometido iria de 0,0% para 23,1%', t.includes('A parcela seria 23,1% da sua renda.') && t.includes('Seu comprometido iria de 0,0% para 23,1% enquanto durar o financiamento.'), t.slice(-900));
  ok('D44 conta nova: nada gravado ao digitar (nenhuma escrita, nada no aparelho, nenhum parcelamento)', writes.length === d44Writes2 && (await storage()) === d44Store2 && (await otherDevice(async (repo, ctx) => (await repo.listSeries(ctx)).length)) === 0, `${writes.length - d44Writes2} escritas`);
  await d44Keep();
  const d44Vetoed = d44Texts.map((s) => (s.match(D44_VETOED) ?? s.match(JUDGMENT) ?? [])[0]).filter(Boolean);
  ok('D44 as telas da calculadora não usam nenhuma palavra vetada, de julgamento ou de recomendação (melhor, pior, deveria, vale a pena, invista, aplique em...)', d44Texts.length >= 3 && d44Vetoed.length === 0, d44Vetoed.join(' | '));
  await goResumo().catch(() => {});

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
