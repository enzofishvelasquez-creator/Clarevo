#!/usr/bin/env node
/**
 * Teste de navegador do site (D-066): o Chromium do Playwright abre o site de verdade, servido por `scripts/site/servir.js` com os cabeçalhos
 * do `_headers` (a política de segurança inclusive), e confere:
 *   - as dez calculadoras: preenche os campos e compara o que aparece na tela com o que o core calcula (a mesma entrada, o mesmo texto);
 *   - nenhuma violação da política de segurança, erro de console ou erro de página; nenhum pedido para fora do próprio site; nenhum cookie e
 *     nada em localStorage, sessionStorage nem na URL;
 *   - cada página de calculadora carrega só o que usa (o módulo dela e o que ele importa, tudo já pedido pelo modulepreload) e as leves nem
 *     tocam nas séries, nos cartões nem nos lançamentos;
 *   - sem JavaScript: cada calculadora mostra o aviso e o exemplo, e o formulário de contato continua enviando por POST comum, com a página
 *     de erro dizendo qual campo conferir;
 *   - os formulários, ligados só para este teste (o site é gerado numa pasta temporária com os interruptores `true`), com o `_worker.js`
 *     de verdade (com SITE_HOST) e um `fetch` simulado no lugar do Resend e do Brevo: envio, validação, campo-isca e consentimento, e o
 *     Origin que o navegador manda de verdade num formulário da própria página.
 * Uso: npm run test:site   (gera o site numa pasta temporária, sobe o servidor local e percorre os fluxos; nada é gravado em `site/`)
 * Navegador: Chromium do Playwright, ou CHROMIUM_PATH.
 */
'use strict';
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');
const { servir } = require('./site/servir');
const { catalogo } = require('./site/catalogo');

const RAIZ = path.join(__dirname, '..');
const HOJE = '2026-10-23';
const resultados = [];
const ok = (nome, condicao, extra = '') => resultados.push([condicao ? 'OK     ' : 'FALHOU', nome, condicao ? '' : extra]);

/** Gera o site numa pasta temporária, com os formulários ligados, e devolve o caminho. */
function gerarSiteLigado() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clarevo-e2e-site-'));
  const dados = JSON.parse(fs.readFileSync(path.join(RAIZ, 'site', 'dados-da-empresa.json'), 'utf8'));
  fs.writeFileSync(path.join(dir, 'dados.json'), JSON.stringify({ ...dados, formulario_contato: true, newsletter: true }));
  const saida = path.join(dir, 'site');
  const r = spawnSync(process.execPath, [path.join(__dirname, 'gerar-site.js'), '--dados', path.join(dir, 'dados.json'), '--referencia', HOJE, '--saida', saida], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`o gerador falhou:\n${r.stderr}`);
  return { dir, saida };
}

/** O que o core calcula para a mesma entrada: as linhas de cada bloco de resultado, como o texto da tela. */
function linhasDe(saida) {
  if (!saida.ok) throw new Error(`a entrada do teste não calcula: ${JSON.stringify(saida.errors)}`);
  return saida.result.resultLines;
}

/** Os roteiros: o que digitar em cada calculadora e o que o core diz para a mesma entrada. */
function roteiros(CALC) {
  const r = (slug, preencher, esperado, extra = {}) => ({ slug, preencher, esperado, ...extra });
  const texto = (p, id, valor) => p.fill(`#c-${id}`, valor);
  const escolha = (p, nome, valor) => p.check(`input[name="r-${nome}"][value="${valor}"]`);
  return [
    r(
      'antes-de-financiar',
      async (p) => {
        await texto(p, 'preco', '50000');
        await texto(p, 'entrada', '10000');
        await texto(p, 'parcelas', '48');
        await texto(p, 'taxaMes', '1,99');
        await texto(p, 'renda', '4500');
      },
      () => {
        const s = CALC.calcAntesDeFinanciar({ preco: '50000', entrada: '10000', parcelas: '48', taxaMes: '1,99', primeiraEmUmMes: true, renda: '4500', guardar: '', rendimento: '' }, HOJE);
        return { linhas: [linhasDe(s)], tambem: [...s.result.savingLines, ...s.result.entryLines, ...s.result.hypotheses] };
      },
    ),
    r(
      'parcelado-ou-a-vista',
      async (p) => {
        await texto(p, 'aVista', '1080');
        await texto(p, 'parcelas', '12');
        await texto(p, 'parcela', '120');
        await escolha(p, 'formaPagamento', 'boleto');
      },
      () => ({ linhas: [linhasDe(CALC.calcParceladoOuAVista({ modo: 'compra', aVista: '1080', parcelas: '12', parcela: '120', primeiraNaCompra: false, formaPagamento: 'boleto' }))] }),
    ),
    r(
      'custo-por-ano',
      async (p) => {
        await texto(p, 'valor', '39,90');
        await escolha(p, 'frequencia', 'dia_util');
      },
      () => ({ linhas: [linhasDe(CALC.calcCustoPorAno({ valor: '39,90', frequencia: 'dia_util' }))] }),
    ),
    r(
      'custo-da-divida',
      async (p) => {
        await escolha(p, 'tipo', 'rotativo');
        await texto(p, 'valor', '1000');
        await texto(p, 'taxaMes', '8');
        await texto(p, 'parcelarTaxaMes', '8');
        await texto(p, 'parcelarParcelas', '6');
      },
      () => {
        const s = CALC.calcCustoDaDivida({ tipo: 'rotativo', valor: '1000', taxaMes: '8', meses: '', parcelas: '', parcelarTaxaMes: '8', parcelarParcelas: '6' });
        return { linhas: [linhasDe(s), s.result.parcelamento.result.resultLines] };
      },
    ),
    r(
      'quitar-antes',
      async (p) => {
        await texto(p, 'parcela', '850');
        await texto(p, 'restantes', '24');
        await texto(p, 'taxaMes', '1,5');
        await escolha(p, 'modo', 'ultimas');
        await texto(p, 'quantas', '6');
      },
      () => ({ linhas: [linhasDe(CALC.calcQuitarAntes({ parcela: '850', restantes: '24', taxaMes: '1,5', modo: 'ultimas', quantas: '6' }))] }),
    ),
    r(
      'multa-e-juros',
      async (p) => {
        await texto(p, 'valor', '200');
        await texto(p, 'multaPct', '2');
        await texto(p, 'jurosMesPct', '1');
        await texto(p, 'dias', '15');
      },
      () => ({ linhas: [linhasDe(CALC.calcMultaEJuros({ valor: '200', multaPct: '2', jurosMesPct: '1', dias: '15' }))] }),
    ),
    r(
      'plano-dividas',
      async (p) => {
        await p.click('text=Acrescentar dívida');
        await p.check('input[name="r-tipo-0"][value="parcelada"]');
        await texto(p, 'parcela-0', '850');
        await texto(p, 'restantes-0', '24');
        await texto(p, 'taxaParcelada-0', '1,5');
        await p.click('text=Acrescentar dívida');
        await p.check('input[name="r-tipo-1"][value="saldo"]');
        await texto(p, 'saldo-1', '1000');
        await texto(p, 'taxaSaldo-1', '8');
        await texto(p, 'pagamento-1', '200');
        await texto(p, 'extra', '200');
      },
      () => {
        const s = CALC.calcPlanoDividas(
          {
            dividas: [
              { tipo: 'parcelada', apelido: '', parcela: '850', restantes: '24', taxaParcelada: '1,5' },
              { tipo: 'saldo', apelido: '', saldo: '1000', taxaSaldo: '8', pagamento: '200' },
            ],
            extra: '200',
          },
          HOJE,
        );
        return { linhas: [linhasDe(s)], tambem: s.result.scenarios.flatMap((c) => [c.title, ...c.detailLines, ...c.sequenceLines]) };
      },
    ),
    r(
      'reserva',
      async (p) => {
        await texto(p, 'essenciais', '3750');
        await escolha(p, 'meses-escolha', '6');
        await texto(p, 'guardado', '4500');
        await texto(p, 'mensal', '500');
      },
      () => ({ linhas: [linhasDe(CALC.calcReserva({ essenciais: '3750', meses: '6', guardado: '4500', mensal: '500' }))] }),
    ),
    r(
      'juntar-para-objetivo',
      async (p) => {
        await texto(p, 'alvo', '22500');
        await texto(p, 'jaTem', '4500');
        await escolha(p, 'modo', 'mensal');
        await texto(p, 'mensal', '1000');
      },
      () => ({ linhas: [linhasDe(CALC.calcJuntarParaObjetivo({ alvo: '22500', jaTem: '4500', modo: 'mensal', meses: '', mensal: '1000' }))] }),
    ),
    r(
      'dividir-contas',
      async (p) => {
        await texto(p, 'total', '3000');
        await escolha(p, 'modo', 'renda');
        await texto(p, 'renda-0', '4000');
        await texto(p, 'renda-1', '2000');
      },
      () => ({ linhas: [linhasDe(CALC.calcDividirContas({ total: '3000', modo: 'renda', pessoas: [{ apelido: '', renda: '4000' }, { apelido: '', renda: '2000' }] }))] }),
    ),
  ];
}

(async () => {
  const CALC = catalogo().CALC;
  const { dir, saida } = gerarSiteLigado();
  const chamadas = [];
  const fetchSimulado = async (url, opcoes) => {
    chamadas.push({ url: String(url), cabecalhos: opcoes.headers, corpo: JSON.parse(opcoes.body) });
    return new Response('{}', { status: 200 });
  };
  const servidor = await servir(saida, {
    env: { RESEND_API_KEY: 'chave-so-de-teste', CONTATO_DESTINO: 'contato@exemplo.test', CONTATO_REMETENTE: 'Clarevo <site@exemplo.test>', BREVO_API_KEY: 'chave-so-de-teste', BREVO_LISTA_ID: '7', BREVO_MODELO_CONFIRMACAO_ID: '3' },
    hostDoSite: true,
    fetchDoWorker: fetchSimulado,
  });
  const origem = servidor.url;
  const navegador = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  try {
    const ctx = await navegador.newContext({ viewport: { width: 390, height: 900 }, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
    const problemas = [];
    const pedidosDeFora = [];
    await ctx.addInitScript(() => {
      document.addEventListener('securitypolicyviolation', (e) => console.error(`CSP ${e.violatedDirective} ${e.blockedURI}`));
    });
    const pagina = async () => {
      const p = await ctx.newPage();
      p.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && problemas.push(`${p.url()} ${m.text()}`));
      p.on('pageerror', (e) => problemas.push(`${p.url()} ${e.message}`));
      p.on('request', (q) => !q.url().startsWith(origem) && !q.url().startsWith('data:') && pedidosDeFora.push(q.url()));
      await p.clock.install({ time: new Date(`${HOJE}T12:00:00-03:00`) });
      return p;
    };

    // 1. As dez calculadoras: o que aparece na tela é o que o core calcula, e cada página carrega só o que usa.
    const PESADOS = ['series.js', 'cards.js', 'committed.js', 'simulate.js', 'validation.js', 'dia-util.js'];
    const LEVES = ['parcelado-ou-a-vista', 'custo-por-ano', 'custo-da-divida', 'quitar-antes', 'multa-e-juros', 'reserva', 'juntar-para-objetivo', 'dividir-contas'];
    const pesos = {};
    for (const rot of roteiros(CALC)) {
      const p = await pagina();
      const modulos = [];
      p.on('response', async (r) => {
        if (r.url().endsWith('.js')) modulos.push({ url: r.url(), bytes: (await r.body()).length });
      });
      await p.goto(`${origem}/calculadoras/${rot.slug}.html`);
      await p.waitForSelector('[data-pronta]');
      {
        const preCarga = await p.$$eval('link[rel="modulepreload"]', (ls) => ls.map((l) => l.href));
        const carregados = [...new Set(modulos.map((m) => m.url))].sort();
        ok(`${rot.slug}: tudo o que a página carrega foi pedido pelo modulepreload, e nada que ele pediu ficou sem uso`, JSON.stringify(carregados) === JSON.stringify([...new Set(preCarga)].sort()), `carregados ${carregados.length}, modulepreload ${preCarga.length}: ${carregados.filter((u) => !preCarga.includes(u)).join(', ')} / ${preCarga.filter((u) => !carregados.includes(u)).join(', ')}`);
        ok(`${rot.slug}: carrega o módulo da própria calculadora`, carregados.some((u) => u.endsWith(`/calculators/${rot.slug}.js`)));
        if (LEVES.includes(rot.slug)) ok(`${rot.slug}: calculadora leve, sem séries, cartões, lançamentos nem simulação`, !carregados.some((u) => PESADOS.some((n) => u.endsWith(`/${n}`))), carregados.filter((u) => PESADOS.some((n) => u.endsWith(`/${n}`))).join(', '));
        pesos[rot.slug] = { pedidos: carregados.length, bytes: [...new Map(modulos.map((m) => [m.url, m.bytes]))].reduce((n, [, b]) => n + b, 0) };
      }
      await rot.preencher(p);
      await p.click('h1');
      const esperado = rot.esperado();
      const blocos = await p.$$eval('.calc-resultados .calc-linhas', (els) => els.map((e) => [...e.querySelectorAll('p')].map((x) => x.textContent)));
      esperado.linhas.forEach((linhas, i) => ok(`${rot.slug}: resultado ${i + 1} igual ao do core`, JSON.stringify(blocos[i]) === JSON.stringify(linhas), `tela ${JSON.stringify(blocos[i])} / core ${JSON.stringify(linhas)}`));
      if (esperado.tambem) {
        const tudo = await p.textContent('.calc-resultados');
        const faltam = esperado.tambem.filter((t) => !tudo.includes(t));
        ok(`${rot.slug}: alternativas, detalhes e hipóteses iguais aos do core`, faltam.length === 0, `faltam: ${faltam.slice(0, 2).join(' | ')}`);
      }
      const hipoteses = await p.$$eval('.calc-resultados .calc-hipoteses li', (els) => els.map((e) => e.textContent));
      ok(`${rot.slug}: mostra as hipóteses`, hipoteses.length > 0);
      ok(`${rot.slug}: sem armazenamento, sem cookie e sem nada na URL`, await p.evaluate(() => localStorage.length === 0 && sessionStorage.length === 0 && document.cookie === '' && location.search === '' && location.hash === ''));
      await p.close();
    }

    // 2. "Cota única ou parcelado?" é a mesma calculadora aberta com o parâmetro que o tema de Aprender usa.
    {
      const p = await pagina();
      await p.goto(`${origem}/calculadoras/parcelado-ou-a-vista.html?modo=cota-unica`);
      await p.waitForSelector('[data-pronta]');
      ok('cota única: o título e os campos são os da conta do ano', (await p.textContent('h1')) === 'Cota única ou parcelado?' && (await p.textContent('label[for="c-aVista"]')) === 'Valor da cota única');
      await p.fill('#c-aVista', '2400');
      await p.fill('#c-parcelas', '4');
      await p.fill('#c-parcela', '650');
      await p.click('h1');
      const s = CALC.calcParceladoOuAVista({ modo: 'cota-unica', aVista: '2400', parcelas: '4', parcela: '650', primeiraNaCompra: true, formaPagamento: null });
      ok('cota única: resultado igual ao do core', JSON.stringify(await p.$$eval('.calc-resultados .calc-linhas p', (e) => e.map((x) => x.textContent))) === JSON.stringify(s.result.resultLines));
      await p.close();
      const q = await pagina();
      const dinamicos = [];
      q.on('request', (r) => r.url().endsWith('/calculators/links.js') && dinamicos.push(r.url()));
      await q.goto(`${origem}/calculadoras/custo-da-divida.html?modo=emprestimo`);
      await q.waitForSelector('[data-pronta]');
      ok('dívida: o links.js (séries e cartões do core) só é pedido porque o endereço traz ?modo=', dinamicos.length === 1);
      const sem = await pagina();
      const semModo = [];
      sem.on('request', (r) => r.url().endsWith('/calculators/links.js') && semModo.push(r.url()));
      await sem.goto(`${origem}/calculadoras/custo-da-divida.html`);
      await sem.waitForSelector('[data-pronta]');
      ok('dívida: sem ?modo= o links.js nem é pedido', semModo.length === 0);
      await sem.close();
      ok('dívida: o tipo "Empréstimo" já vem marcado pelo parâmetro do tema', await q.isChecked('input[name="r-tipo"][value="emprestimo"]'));
      await q.close();
    }

    // 3. Erros de validação e foco: os textos são os do core.
    {
      const p = await pagina();
      await p.goto(`${origem}/calculadoras/multa-e-juros.html`);
      await p.waitForSelector('[data-pronta]');
      await p.fill('#c-valor', 'abc');
      await p.press('#c-valor', 'Tab');
      const erro = await p.textContent('#c-valor-erro');
      ok('erro de campo: o texto é o do core, depois de sair do campo', erro === CALC.calcErrorText('multa-e-juros', 'valor', 'invalido'), erro);
      await p.fill('#c-valor', '1.080');
      await p.focus('#c-dias');
      await p.type('#c-dias', '1');
      ok('digitar não tira o foco do campo', (await p.evaluate(() => document.activeElement && document.activeElement.id)) === 'c-dias');
      await p.close();
    }

    // 4. Sem JavaScript.
    {
      const semJs = await navegador.newContext({ javaScriptEnabled: false });
      const p = await semJs.newPage();
      await p.goto(`${origem}/calculadoras/reserva.html`);
      const t = await p.textContent('main');
      ok('sem JavaScript: a calculadora diz que precisa de JavaScript, lista os campos e mostra o exemplo', t.includes('precisa de JavaScript') && t.includes('Gastos essenciais por mês') && t.includes('Um exemplo, com números fictícios'));
      // O formulário de contato continua enviando por POST comum.
      await p.goto(`${origem}/empresas/`);
      await p.fill('#ct-nome', 'Pessoa de Teste');
      await p.fill('#ct-email', 'pessoa@exemplo.test');
      await p.fill('#ct-empresa', 'Empresa Exemplo');
      await p.selectOption('#ct-faixa', '51-200');
      await p.fill('#ct-mensagem', 'Quero conversar sobre um piloto.');
      const antes = chamadas.length;
      // Com o JavaScript desligado o Playwright não acusa o fim do carregamento: espera-se o endereço novo (`commit`) e o título aparecer.
      // O envio é o implícito do formulário (Enter num campo, o mesmo POST do botão): com o JavaScript desligado o `click` do Playwright fica
      // preso na ação neste Chromium (o botão nunca "estabiliza"), e o formulário não depende dele.
      await p.focus('#ct-nome');
      await Promise.all([p.waitForURL('**/contato-enviado', { waitUntil: 'commit' }), p.keyboard.press('Enter')]);
      await p.waitForSelector('h1');
      ok('sem JavaScript: o formulário de contato envia por POST e cai em "Mensagem enviada"', (await p.textContent('h1')) === 'Mensagem enviada' && chamadas.length === antes + 1);
      // A página de erro diz qual campo conferir, sem JavaScript: o servidor manda para a página daquele campo.
      const invalido = await semJs.request.post(`${origem}/api/contato`, {
        form: { nome: 'Pessoa de Teste', email: 'isto-nao-e-um-email', empresa: 'Empresa Exemplo', faixa: '51-200', mensagem: 'Quero conversar sobre um piloto.' },
        headers: { accept: 'text/html,application/xhtml+xml' },
        maxRedirects: 0,
      });
      ok('sem JavaScript: o e-mail inválido (com os outros campos certos) é redirecionado para a página de erro do e-mail', invalido.status() === 303 && invalido.headers().location === '/contato-erro-email', `${invalido.status()} ${invalido.headers().location}`);
      await p.goto(`${origem}/contato-erro-email`);
      const erro = await p.textContent('main');
      ok('sem JavaScript: a página de erro diz qual campo conferir e como voltar', (await p.textContent('h1')) === 'Confira o campo E-mail' && erro.includes('O campo "E-mail" está vazio') && (await p.$('a[href="empresas/index.html#formulario-contato"]')) !== null);
      ok('sem JavaScript: nenhuma chamada ao Resend foi feita para o e-mail inválido', chamadas.length === antes + 1);
      await semJs.close();
    }

    // 5. Os formulários, com o worker de verdade.
    {
      const p = await pagina();
      await p.goto(`${origem}/empresas/`);
      ok('contato: campo-isca fora da tela e fora do teclado', await p.evaluate(() => { const c = document.querySelector('.campo-isca'); const i = c.querySelector('input'); const r = c.getBoundingClientRect(); return i.tabIndex === -1 && (r.right < 0 || r.left > innerWidth) && c.getAttribute('aria-hidden') === 'true'; }));
      ok('contato: o navegador recusa o envio vazio', await p.evaluate(() => !document.querySelector('form.formulario').checkValidity()));
      await p.fill('#ct-nome', 'Pessoa <b>de</b> Teste');
      await p.fill('#ct-email', 'pessoa@exemplo.test');
      await p.fill('#ct-empresa', 'Empresa Exemplo');
      await p.selectOption('#ct-faixa', '201-1000');
      await p.fill('#ct-mensagem', 'Linha 1\nLinha 2 <script>alert(1)</script>');
      const antes = chamadas.length;
      // O que o navegador manda de verdade num formulário da própria página: com Referrer-Policy same-origin o Origin é o do site (com
      // no-referrer viria "null", que o worker recusa) e o Sec-Fetch-Site é same-origin.
      const cabecalhosDoEnvio = new Promise((resolve) => p.on('request', async (q) => q.method() === 'POST' && resolve(await q.allHeaders())));
      await Promise.all([p.waitForURL('**/contato-enviado'), p.click('button[type=submit]')]);
      const enviado = await cabecalhosDoEnvio;
      ok('contato: o navegador manda o Origin do site e Sec-Fetch-Site same-origin (e o worker aceita)', enviado.origin === origem && enviado['sec-fetch-site'] === 'same-origin', JSON.stringify({ origin: enviado.origin, site: enviado['sec-fetch-site'] }));
      const c = chamadas[chamadas.length - 1];
      ok('contato: o envio chega ao Resend com os campos e o texto escapado', chamadas.length === antes + 1 && c.url === 'https://api.resend.com/emails' && c.corpo.html.includes('&lt;script&gt;') && !c.corpo.html.includes('<script>') && c.corpo.to[0] === 'contato@exemplo.test' && c.corpo.reply_to === 'pessoa@exemplo.test');
      ok('contato: a chave vai só no cabeçalho do pedido ao Resend, nunca na página nem no corpo', !JSON.stringify(c.corpo).includes('chave-so-de-teste') && c.cabecalhos.Authorization === 'Bearer chave-so-de-teste' && !(await p.content()).includes('chave-so-de-teste'));
      ok('contato: o pedido ao Resend leva User-Agent: clarevo-site', c.cabecalhos['User-Agent'] === 'clarevo-site');

      // Validação do servidor (o navegador é desligado de propósito) e campo-isca.
      await p.goto(`${origem}/empresas/`);
      await p.evaluate(() => { document.querySelector('form.formulario').noValidate = true; });
      // Só o e-mail está errado (todos os outros campos estão certos): a página de erro é a dele, e nada é enviado.
      await p.fill('#ct-nome', 'Alguém');
      await p.fill('#ct-email', 'isto-nao-e-um-email');
      await p.fill('#ct-empresa', 'Empresa Exemplo');
      await p.selectOption('#ct-faixa', '51-200');
      await p.fill('#ct-mensagem', 'Quero conversar sobre um piloto.');
      await Promise.all([p.waitForURL('**/contato-erro-email'), p.click('button[type=submit]')]);
      ok('contato: e-mail inválido (com os outros campos certos) cai na página de erro do e-mail, sem enviar', (await p.textContent('h1')) === 'Confira o campo E-mail' && chamadas.length === antes + 1);
      // Campos vazios: a página de erro é a do primeiro campo, na ordem do formulário.
      await p.goto(`${origem}/empresas/`);
      await p.evaluate(() => { document.querySelector('form.formulario').noValidate = true; });
      await p.fill('#ct-nome', 'Alguém');
      await Promise.all([p.waitForURL('**/contato-erro-email'), p.click('button[type=submit]')]);
      ok('contato: com vários campos errados, a página de erro é a do primeiro deles', (await p.textContent('h1')) === 'Confira o campo E-mail' && chamadas.length === antes + 1);
      await p.goto(`${origem}/empresas/`);
      await p.evaluate(() => { document.querySelector('form.formulario').noValidate = true; });
      await p.fill('#ct-nome', 'Robô');
      await p.fill('#ct-email', 'robo@exemplo.test');
      await p.fill('#ct-empresa', 'Robôs');
      await p.selectOption('#ct-faixa', 'ate-50');
      await p.fill('#ct-mensagem', 'spam');
      await p.evaluate(() => { document.querySelector('.campo-isca input').value = 'http://spam.example'; });
      await Promise.all([p.waitForURL('**/contato-enviado'), p.click('button[type=submit]')]);
      ok('contato: o campo-isca preenchido é descartado sem enviar nada', chamadas.length === antes + 1);

      // Newsletter.
      await p.goto(`${origem}/novidades/`);
      ok('newsletter: o bloco em Novidades traz a caixa de consentimento obrigatória e desmarcada', await p.evaluate(() => { const c = document.querySelector('#nv-consentimento'); return c.required && !c.checked && c.type === 'checkbox'; }));
      await p.fill('#nv-email', 'leitora@exemplo.test');
      ok('newsletter: sem a caixa marcada o navegador recusa o envio', await p.evaluate(() => !document.querySelector('form.formulario').checkValidity()));
      await p.check('#nv-consentimento');
      const antesN = chamadas.length;
      await Promise.all([p.waitForURL('**/novidades/receber-enviado'), p.click('button[type=submit]')]);
      const n = chamadas[chamadas.length - 1];
      ok('newsletter: o envio chega ao Brevo pela dupla confirmação, só com e-mail, lista, modelo e retorno', chamadas.length === antesN + 1 && n.url === 'https://api.brevo.com/v3/contacts/doubleOptinConfirmation' && JSON.stringify(Object.keys(n.corpo).sort()) === JSON.stringify(['email', 'includeListIds', 'redirectionUrl', 'templateId']) && n.corpo.includeListIds[0] === 7 && n.corpo.templateId === 3 && n.corpo.redirectionUrl === `${origem}/novidades/receber-confirmado`);
      await p.goto(`${origem}/novidades/receber.html`);
      await p.evaluate(() => { document.querySelector('form.formulario').noValidate = true; });
      await p.fill('#nv-email', 'leitora@exemplo.test');
      await Promise.all([p.waitForURL('**/novidades/receber-erro-consentimento'), p.click('button[type=submit]')]);
      ok('newsletter: sem consentimento o servidor recusa, a página de erro é a da caixa e nada é cadastrado', (await p.textContent('h1')) === 'Confira o campo Consentimento' && chamadas.length === antesN + 1);
      const ua = chamadas.find((x) => x.url.includes('brevo'));
      ok('newsletter: o pedido ao Brevo leva User-Agent: clarevo-site', ua && ua.cabecalhos['User-Agent'] === 'clarevo-site');
      await p.close();
    }

    // 6. Páginas estáticas do kit de imprensa e do índice.
    {
      const p = await pagina();
      await p.goto(`${origem}/imprensa`);
      const imagensQuebradas = await p.evaluate(async () => {
        // As imagens abaixo da dobra são preguiçosas (`loading="lazy"`): para conferir todas, vale carregá-las já.
        for (const i of document.images) i.loading = 'eager';
        await Promise.all([...document.images].map((i) => (i.complete ? null : new Promise((r) => { i.onload = r; i.onerror = r; }))));
        return [...document.images].filter((i) => !i.naturalWidth).map((i) => i.src);
      });
      ok('imprensa: todas as imagens carregam', imagensQuebradas.length === 0, imagensQuebradas.join(', '));
      const baixaveis = await p.$$eval('a[download]', (as) => as.map((a) => a.href));
      const falhas = [];
      for (const url of baixaveis) if (!(await ctx.request.get(url)).ok()) falhas.push(url);
      ok(`imprensa: os ${baixaveis.length} arquivos para baixar existem`, baixaveis.length >= 18 && falhas.length === 0, falhas.join(', '));
      await p.close();
    }

    // 7. Comece aqui (D-067): a página do link da bio abre sem violação da política de segurança, com os seis caminhos, a demonstração como
    // link de texto (a navegação para fora é bloqueada e só conferida) e nenhum parâmetro de rastreamento em link nenhum.
    {
      const p = await pagina();
      await p.goto(`${origem}/comece`);
      ok('comece aqui: título, estado do acesso e seis caminhos', (await p.textContent('h1')) === 'Comece aqui' &&
        (await p.textContent('main')).includes('A Clarevo está em fase de testes. A versão para pessoas e empresas abre no piloto; acompanhe as Novidades.') &&
        (await p.$$eval('main a.cartao', (as) => as.map((a) => a.querySelector('.titulo-cartao').textContent))).join('|') === 'O app|Ver a demonstração|Aprender|Calculadoras|Para empresas|Ajuda');
      const demo = await p.$eval('main a.cartao[href^="https://"]', (a) => ({ href: a.href, rel: a.rel }));
      const comParametro = await p.$$eval('a[href]', (as) => as.map((a) => a.getAttribute('href')).filter((h) => /[?&]|utm_|fbclid|igshid/i.test(h)));
      ok('comece aqui: a demonstração é link de texto com noopener, e nenhum link leva parâmetro', demo.href === 'https://demo.clarevo.app.br/' && /noopener/.test(demo.rel) && comParametro.length === 0, JSON.stringify({ demo, comParametro }));
      ok('comece aqui: sem script (só dados estruturados, se houver) e sem formulário', (await p.$$eval('script', (ss) => ss.filter((x) => x.type !== 'application/ld+json').length)) === 0 && (await p.$$('form')).length === 0);
      await p.close();
    }

    if (process.env.PESOS_DAS_CALCULADORAS) console.log(`\nJavaScript carregado por página de calculadora (sem compressão):\n${Object.entries(pesos).map(([s, v]) => `  ${s.padEnd(22)} ${String(v.pedidos).padStart(3)} pedidos ${String(v.bytes).padStart(7)} B`).join('\n')}\n`);
    ok('nenhuma violação da política de segurança, erro de console ou de página', problemas.length === 0, problemas.slice(0, 3).join(' | '));
    ok('nenhum pedido para fora do próprio site', pedidosDeFora.length === 0, pedidosDeFora.slice(0, 3).join(' | '));
    ok('nenhum cookie definido pelo site', (await ctx.cookies()).length === 0, JSON.stringify(await ctx.cookies()));
  } catch (e) {
    ok('o roteiro rodou até o fim', false, e.stack || String(e));
  } finally {
    await navegador.close();
    await servidor.fechar();
    fs.rmSync(dir, { recursive: true, force: true });
  }
  for (const [estado, nome, extra] of resultados) console.log(`${estado} ${nome}${extra ? `\n         ${extra}` : ''}`);
  const falhou = resultados.filter((r) => r[0] === 'FALHOU').length;
  console.log(`\n${resultados.length - falhou} de ${resultados.length} verificações passaram`);
  process.exit(falhou ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
