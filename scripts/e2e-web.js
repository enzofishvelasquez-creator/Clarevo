/**
 * Roteiro de verificação do primeiro ciclo e do Ciclo A (gastos fixos e parcelamentos) na versão web,
 * em modo demonstração (acesso simulado).
 * Uso: npm run test:web   (gera a versão web, sobe um servidor local e percorre os fluxos)
 * Capturas de tela vão para docs/telas/. Navegador: Chromium do Playwright, ou CHROMIUM_PATH.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const DIST = path.join(__dirname, '..', 'apps', 'app', 'dist');
const OUT = process.argv[2] || path.join(__dirname, '..', 'docs', 'telas');
const PORT = 8099;
const TYPES = { '.js': 'text/javascript', '.html': 'text/html', '.ttf': 'font/ttf', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.css': 'text/css' };
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
  const p = await ctx.newPage();
  globalThis.__page = p;
  const errors = []; p.on('pageerror', e => errors.push(e.message)); p.on('console', m => m.type()==='error' && errors.push(m.text().slice(0,200)));
  // Texto da tela, com o espaço não separável ("R$\u00a0900,00" nunca quebra a linha) lido como espaço comum.
  const body = async () => (await p.locator('body').innerText()).replace(/\u00a0/g, ' ');
  const btn = (name) => p.getByRole('button', { name, exact: true }).filter({ visible: true }).first();
  const field = (name) => p.getByLabel(name, { exact: true }).filter({ visible: true }).first();
  // Espera as transições terminarem antes de capturar.
  const shot = async (n, full=false) => { await p.waitForTimeout(450); await p.screenshot({ path: `${OUT}/${n}.png`, fullPage: full }); };
  const waitText = (t, timeout=8000) => p.getByText(t, { exact: false }).filter({ visible: true }).first().waitFor({ timeout });
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
    const outside = await p.evaluate(() => [...document.querySelectorAll('body *')].filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0 && (b.right > window.innerWidth + 0.5 || b.left < -0.5); }).map((e) => (e.getAttribute('aria-label') || e.textContent || e.tagName).slice(0, 40)));
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

  // 1. Cadastro de uma conta nova (acesso simulado)
  await p.goto('http://localhost:8099/'); await waitText('Seu dinheiro');
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
  await p.getByRole('button', { name: 'Conta: perfil, segurança e acesso ao plano' }).filter({ visible: true }).first().click(); await waitText('Acesso ao plano');
  await btn('Sair deste aparelho').click(); await waitText('Seu dinheiro');

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
  await waitText('3 cadastrados').catch(() => {});
  ok('lista: link "Gastos fixos e parcelamentos" com a contagem', (await visibleCount('button', 'Gastos fixos e parcelamentos, 3 cadastrados')) === 1);
  await shot('19_contas_a_pagar');

  await btn('Anotar conta a pagar').click(); await waitText('Salvando em Pessoal');
  ok('anotar conta a pagar: "Com que frequência?" começa em "Só uma vez"', (await visibleCount('radiogroup', 'Com que frequência?')) === 1 && (await radio('Só uma vez').getAttribute('aria-checked')) === 'true' && (await radio('Todo mês').getAttribute('aria-checked')) === 'false' && (await radio('Parcelado').getAttribute('aria-checked')) === 'false');
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
  ok('vencidas: duas contas e o atalho "Revisar vencidas"', JSON.stringify(await sectionRows('Vencidas')) === JSON.stringify(['Revisar vencidas', 'Gás, venceu em 28/09/2026, R$ 40,00', 'Água, venceu em 05/10/2026, R$ 90,00']));
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
  await shot('22_conta_paga');

  await btn('Ver resumo do mês').click(); await waitText('Diferença do mês');
  await p.getByText('+ R$ 155,00').filter({ visible: true }).first().waitFor({ timeout: 2500 }).catch(() => {});
  ok('resumo mostra o efeito do pagamento em Pago', (await body()).includes('+ R$ 155,00'));
  await singleResumo('ver resumo do mês (conta a pagar) volta ao Resumo da pilha, sem outra cópia');
  await expectTotals('pagar Internet 155 → 4.055 / 1.945', 'R$ 6.000,00', 'R$ 4.055,00', 'R$ 1.945,00', 'R$ 630,00');
  await p.getByRole('tab', { name: 'Movimentações' }).filter({ visible: true }).first().click(); await waitText('Registrar recebimento');
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
  await openToPay(); await waitText('3 cadastrados');
  await btn('Gastos fixos e parcelamentos, 3 cadastrados').click(); await waitText('Por mês, se os valores não mudarem');
  t = await body();
  ok('gastos fixos: soma por mês com a parte estimada', t.includes('Por mês, se os valores não mudarem: R$ 3.530,00 (inclui R$ 180,00 estimados).'));
  ok('gastos fixos: seções e linhas com rótulos em texto',
    JSON.stringify(await sectionRows('Gastos fixos')) === JSON.stringify(['Aluguel, R$ 2.500,00, todo dia 5, gasto fixo', 'Luz, cerca de R$ 180,00, todo dia 12, valor muda, gasto fixo']) &&
      JSON.stringify(await sectionRows('Parcelamentos')) === JSON.stringify(['Financiamento do carro, Parcela 13 de 48, R$ 850,00, termina em outubro de 2029, parcelamento']) &&
      ['R$ 2.500,00 · todo dia 5', '≈ R$ 180,00 · todo dia 12 · valor muda', 'Parcela 13 de 48 · R$ 850,00 · termina em outubro de 2029'].every((x) => t.includes(x)));
  await shot('25_gastos_fixos');

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
  ok('chips com papel de rádio em grupo com nome', (await visibleCount('radiogroup', 'Com que frequência?')) === 1 && (await radio('Todo mês').getAttribute('aria-checked')) === 'true' && (await radio('Parcelado').getAttribute('aria-checked')) === 'false');
  await radio('Todo mês').focus(); await p.keyboard.press('Tab');
  const ring = await p.evaluate(() => { const e = document.activeElement; const s = getComputedStyle(e); return [e.getAttribute('role'), e.textContent, s.outlineWidth, s.outlineStyle].join(' '); });
  ok('Tab leva ao chip seguinte, com foco visível de 3 px', ring === 'radio Parcelado 3px solid', ring);
  await p.keyboard.press('Enter'); await waitText('Novo parcelamento');
  ok('Enter escolhe o chip: formulário de parcelamento', (await radio('Parcelado').getAttribute('aria-checked')) === 'true' && (await radio('Todo mês').getAttribute('aria-checked')) === 'false' && (await field('Total de parcelas').count()) === 1);
  await p.keyboard.press('Shift+Tab'); await p.keyboard.press(' '); await waitText('Novo gasto fixo').catch(() => {});
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
  ok('Escola paga: sem "Adicionar a conta do próximo mês" nem "Repetir todo mês"', (await visibleCount('button', 'Adicionar a conta do próximo mês')) === 0 && (await visibleCount('button', 'Repetir todo mês')) === 0 && (await body()).includes('Pago de outubro de 2026'));
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
  await confirmIn('Aplicar'); await waitText('Gasto fixo atualizado a partir de novembro.');
  // A conta aberta é lida de novo depois da gravação: espera a leitura nova.
  await waitText('R$ 2.650,00').catch(() => {});
  ok('Aluguel de novembro passa a R$ 2.650,00', (await body()).includes('R$ 2.650,00'));
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
  await waitText('4 cadastrados');
  await btn('Gastos fixos e parcelamentos, 4 cadastrados').click(); await waitText('Por mês, se os valores não mudarem');
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
  await p.getByRole('tab', { name: 'Aprender' }).filter({ visible: true }).first().click(); await waitText('Diferença do mês e saldo da conta');
  await shot('17_aprender');

  // Larguras 320 e 736: sem transbordamento horizontal, botões com 44 px
  for (const w of [320, 736]) {
    await p.setViewportSize({ width: w, height: 800 });
    await goResumo(); await p.waitForTimeout(400);
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
    await btn('Voltar').click(); await waitText('Contas em aberto com vencimento até o fim do mês');
    await btn('Voltar').click(); await waitText('Diferença do mês');
  }
  ok('sem erros de JavaScript no console', errors.length === 0, errors.slice(0,3).join(' | '));
  await b.close();
  for (const r of results) console.log(r.join('  '));
  const passed = results.filter(r => r[0] === 'OK ').length;
  console.log(`\n${passed}/${results.length} verificações OK`);
  server.close();
  process.exit(passed === results.length ? 0 : 1);
})().catch(async (e) => { try { await globalThis.__page?.screenshot({ path: path.join(OUT, 'erro.png') }); console.log((await globalThis.__page?.locator('body').innerText())?.slice(0, 600)); } catch {} for (const r of results) console.log(r.join('  ')); console.error('ERRO NO ROTEIRO:', e.message.split('\n')[0]); server.close(); process.exit(1); });
