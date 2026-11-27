/**
 * Capturas para a ficha das lojas (Ciclo R, D-060 item 1; refeitas no estudo de 25/11/2026, D-125, sinal 16): abre a DEMONSTRAÇÃO do app
 * (dados fictícios) com o Playwright e grava, em docs/lojas/capturas/<tamanho>/, dois conjuntos:
 *
 * 1. As capturas das lojas (`loja-1-resumo.png` a `loja-6-privacidade.png`): seis telas que contam a história (o Resumo, anotar por
 *    mensagem, contas a pagar e faturas, a Família, o espaço Negócio e a privacidade, que desde a análise geral de 26/11/2026 é o convite
 *    para a Família visto por quem é convidado, com "Aceitar não mostra nem copia o seu Pessoal": a tela "Quem vê estes dados?" de antes
 *    tinha letra pequena demais no tamanho da loja), cada uma com uma frase curta de benefício acima da
 *    tela do aparelho e a nota "Dados fictícios". São estas que vão para a App Store e o Google Play (a Apple aceita até dez; o Google, até
 *    oito; a ordem de envio está em docs/16, seção 7). Nelas, o selo "Demonstração" do app sai, só nas capturas: a marca `__clarevoCaptura`
 *    na página (apps/app/src/lib/capture.ts) esconde o selo e a linha "Fica só nesta demonstração", porque a nota "Dados fictícios" já vai
 *    no desenho. A demonstração aberta no navegador continua com o selo em toda tela.
 * 2. As telas cruas da demonstração (`01_resumo.png` a `10_telegram.png`), com o selo "Demonstração", como antes: são as que o site e o kit
 *    de imprensa usam (scripts/site/imagens.js), com a legenda de demonstração ao lado. Não são enviadas às lojas.
 * 3. O Resumo sem o selo (`resumo-sem-selo.png`, análise geral de 26/11/2026, D-129), com a mesma marca `__clarevoCaptura` das capturas das
 *    lojas, nos dois tamanhos que as imagens usam: a imagem de compartilhamento do site e o gráfico de recursos do Google Play
 *    (scripts/gerar-og-site.js e scripts/gerar-grafico-loja.js) montam a tela num aparelho desenhado, com a legenda "Dados fictícios". Não
 *    é enviado às lojas.
 *
 * As frases seguem as regras de redação (pt-BR, linguagem neutra, sem travessão, sem "faz sentido", sem nome de marca, sem recomendação de
 * produto financeiro, sem pressão nem ranking) e nenhuma fala do Plus, que continua fechado; o script confere antes de gravar.
 *
 * Tamanhos (tabela e fontes em docs/16_PUBLICACAO_LOJAS.md, seção "Capturas"; PNG sem canal alfa):
 *   Apple, iPhone com Dynamic Island de 6,3 pol. (o tamanho que a loja exige): 1206 x 2622  = 402 x 874 pontos a 3x
 *   Apple, iPhone com Dynamic Island de 6,9 pol. (o maior, opcional):         1320 x 2868  = 440 x 956 pontos a 3x
 *   Google Play, celular (proporção 9:16; tamanho a conferir na página oficial): 1080 x 1920 = 450 x 800 pontos a 2,4x
 *
 * Nenhum dado real: o build é sempre o de demonstração (`npm --workspace apps/app run export:demo`, que ignora o Supabase), as contas da
 * Família ficam só na memória da página, com nomes fictícios, e qualquer requisição para fora de localhost é bloqueada e faz o script falhar.
 *
 * Uso:
 *   node scripts/capturas-lojas.js                gera o build de demonstração, sobe um servidor local e grava as capturas
 *   node scripts/capturas-lojas.js --sem-build    reaproveita apps/app/dist, se for um build de demonstração (por exemplo, o de `npm run test:web`)
 *   node scripts/capturas-lojas.js --saida <pasta>  outra pasta de saída (padrão: docs/lojas/capturas)
 *   node scripts/capturas-lojas.js --tamanho <texto>  só os tamanhos cujo nome de pasta contém o texto
 *   node scripts/capturas-lojas.js --so-lojas       só as seis capturas das lojas (sem as telas cruas)
 *   node scripts/capturas-lojas.js --so-captura <texto>  só as capturas das lojas cujo nome contém o texto (por exemplo, loja-6), sem as
 *                                                    telas cruas nem o Resumo sem o selo
 *   node scripts/capturas-lojas.js --so-resumo-sem-selo  só o Resumo sem o selo, para as duas imagens (sem refazer as outras capturas)
 * Porta: E2E_PORT (padrão 8098). Navegador: Chromium do Playwright, ou CHROMIUM_PATH.
 */
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { chromium } = require('playwright');

const RAIZ = path.join(__dirname, '..');
const DIST = path.join(RAIZ, 'apps', 'app', 'dist');
const FONTES = path.join(RAIZ, 'apps', 'app', 'assets', 'fonts');
const argv = process.argv.slice(2);
const opcao = (nome) => { const i = argv.indexOf(nome); return i >= 0 ? argv[i + 1] : null; };
const SAIDA = path.resolve(opcao('--saida') || path.join(RAIZ, 'docs', 'lojas', 'capturas'));
const SO_TAMANHO = opcao('--tamanho');
const SO_CAPTURA = opcao('--so-captura');
const SO_LOJAS = argv.includes('--so-lojas') || Boolean(SO_CAPTURA);
const SO_RESUMO = argv.includes('--so-resumo-sem-selo');
/** As pastas do Resumo sem o selo: as das capturas que a imagem do site (Apple, 6,3 pol.) e o gráfico do Google Play usam. */
const PASTAS_DO_RESUMO_SEM_SELO = ['apple-iphone-6-3pol-1206x2622', 'google-play-celular-1080x1920'];
const PORTA = Number(process.env.E2E_PORT || 8098);

/** `largura` e `altura` em pontos (pixels CSS); o PNG sai com largura x escala por altura x escala (o Google ganha uma janela mais alta, 9:16, para as telas não ficarem cortadas). */
const TAMANHOS = [
  { pasta: 'apple-iphone-6-3pol-1206x2622', largura: 402, altura: 874, escala: 3 },
  { pasta: 'apple-iphone-6-9pol-1320x2868', largura: 440, altura: 956, escala: 3 },
  { pasta: 'google-play-celular-1080x1920', largura: 450, altura: 800, escala: 2.4 },
];

/** A tela do aparelho nas capturas das lojas: um celular comum (390 x 844 pontos), gravado a 3x e reduzido dentro do desenho. */
const APARELHO = { largura: 390, altura: 844, escala: 3 };

const TIPOS = { '.js': 'text/javascript', '.html': 'text/html', '.ttf': 'font/ttf', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.css': 'text/css', '.webmanifest': 'application/manifest+json' };

/** PDF mínimo de texto (Helvetica, uma linha por Tj), como o do roteiro de telas: um comprovante de Pix com dados fictícios. */
function pdfDeTexto(linhas) {
  const esc = (s) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
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

/** O comprovante fictício da captura (nomes e números inventados; nenhum dado de pessoa real). */
const COMPROVANTE = [
  'Pix enviado', '05 OUT 2026 - 12:41:08', 'Valor', 'R$ 58,90', 'Tipo de transferência', 'Pix',
  'Destino', 'Nome', 'PADARIA EXEMPLO', 'Instituição', 'Banco Exemplo S.A.',
  'Origem', 'Nome', 'PESSOA EXEMPLO', 'Instituição', 'Banco Exemplo S.A.', 'Descrição', 'Café da manhã',
];

/** Regras de redação das frases das capturas (CLAUDE.md e docs/44): o que nunca pode aparecer, inclusive nome de marca e o Plus. */
const FRASE_PROIBIDA = new RegExp(
  [
    '[\\u2013\\u2014]', ['faz(er|endo)?', 'sentido'].join('\\s+'), 'bem-vind[oa]', 'usu[aá]ri[oa]', 'recomend', 'invista', 'aplique', 'melhor', 'garant',
    'grátis', 'plus\\b', 'equipe', 'contabilidade', 'telegram', 'whatsapp', 'nubank', 'ita[uú]', 'bradesco', 'santander', 'caixa', 'banco do brasil',
    'apple', 'google', 'android', 'iphone', 'pix\\b', '!',
  ].join('|'),
  'i',
);

function dimensoesPng(arquivo) {
  const b = fs.readFileSync(arquivo);
  if (b.toString('ascii', 1, 4) !== 'PNG') throw new Error(`${arquivo} não é um PNG`);
  return { largura: b.readUInt32BE(16), altura: b.readUInt32BE(20), tipoDeCor: b[25] };
}

/** O desenho de uma captura das lojas: a frase no alto, a nota "Dados fictícios" e a tela inteira do aparelho embaixo (a moldura de baixo sai pela borda). */
function moldura({ frase, tela, largura, altura }) {
  const fonte = Math.round(largura * 0.067);
  // A altura que a frase (até duas linhas) e a nota ocupam no alto; a tela do aparelho usa o resto (a moldura tem 3,2% da largura de cada lado).
  const reserva = Math.round(altura * 0.065 + fonte * 1.2 * 2 + fonte * 0.5 + fonte * 0.46 * 1.4 + 20);
  const aparelho = Math.round(Math.min(largura * 0.8, (altura - reserva) / (0.936 * (APARELHO.altura / APARELHO.largura) + 0.032)));
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><style>
@font-face { font-family: Manrope; src: url(fontes/Manrope_800ExtraBold.ttf); font-weight: 800; }
@font-face { font-family: Manrope; src: url(fontes/Manrope_600SemiBold.ttf); font-weight: 600; }
html, body { margin: 0; width: ${largura}px; height: ${altura}px; }
body { position: relative; overflow: hidden; font-family: Manrope, sans-serif; color: #17223B; background: linear-gradient(180deg, #E9EEFF 0%, #F6F8FD 62%, #FFFFFF 100%); }
.topo { position: absolute; left: ${Math.round(largura * 0.08)}px; right: ${Math.round(largura * 0.08)}px; top: ${Math.round(altura * 0.065)}px; text-align: center; }
h1 { margin: 0; font-weight: 800; font-size: ${fonte}px; line-height: 1.2; letter-spacing: -0.02em; text-wrap: balance; }
.nota { margin-top: ${Math.round(fonte * 0.5)}px; display: inline-flex; align-items: center; gap: 6px; font-weight: 600; font-size: ${Math.round(fonte * 0.46)}px; color: #4A5468; }
.nota::before { content: ''; width: 8px; height: 8px; border-radius: 50%; background: #D4F05B; box-shadow: 0 0 0 1.5px #9DB51F; }
.aparelho { box-sizing: border-box; position: absolute; left: 50%; bottom: ${-Math.round(aparelho * 0.032)}px; transform: translateX(-50%); width: ${aparelho}px; padding: ${Math.round(aparelho * 0.032)}px;
  border-radius: ${Math.round(aparelho * 0.15)}px; background: #17223B; box-shadow: 0 24px 60px rgba(23, 34, 59, 0.28); }
.aparelho img { display: block; width: 100%; border-radius: ${Math.round(aparelho * 0.12)}px; }
</style></head><body>
<div class="topo"><h1>${frase}</h1><div class="nota">Dados fictícios</div></div>
<div class="aparelho"><img src="${tela}" alt=""></div>
</body></html>`;
}

(async () => {
  if (!argv.includes('--sem-build')) {
    // O build de demonstração limpa o cache do Metro e zera as variáveis do Supabase: nenhuma conta real entra na captura.
    const r = spawnSync('npm', ['--workspace', 'apps/app', 'run', 'export:demo'], { cwd: RAIZ, stdio: 'inherit', shell: process.platform === 'win32' });
    if (r.status !== 0) throw new Error('o build de demonstração falhou');
  }
  if (!fs.existsSync(path.join(DIST, 'index.html'))) throw new Error('apps/app/dist não existe: rode sem --sem-build');

  // A pasta temporária guarda o comprovante fictício, as telas do aparelho e o desenho de cada captura (servidos em /__captura/).
  const pastaTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'clarevo-capturas-'));
  fs.mkdirSync(path.join(pastaTemp, 'fontes'));
  for (const f of ['Manrope_800ExtraBold.ttf', 'Manrope_600SemiBold.ttf']) fs.copyFileSync(path.join(FONTES, f), path.join(pastaTemp, 'fontes', f));
  const servidor = http
    .createServer((q, r) => {
      const url = decodeURIComponent(q.url.split('?')[0]);
      let p = url.startsWith('/__captura/') ? path.join(pastaTemp, url.slice('/__captura/'.length)) : path.join(DIST, url);
      const dentro = p.startsWith(pastaTemp) || p.startsWith(DIST);
      if (!dentro || !fs.existsSync(p) || fs.statSync(p).isDirectory()) p = path.join(DIST, 'index.html');
      r.writeHead(200, { 'content-type': TIPOS[path.extname(p)] || 'application/octet-stream' });
      fs.createReadStream(p).pipe(r);
    })
    .listen(PORTA);
  const base = `http://localhost:${PORTA}`;

  const comprovante = path.join(pastaTemp, 'pix-enviado.pdf');
  fs.writeFileSync(comprovante, pdfDeTexto(COMPROVANTE));
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const falhas = [];
  const gravadas = [];

  /** Abre a demonstração num contexto novo. `captura`: a marca que tira o selo "Demonstração" (só nas capturas das lojas). */
  const abrirContexto = async ({ largura, altura, escala }, captura) => {
    const ctx = await browser.newContext({ viewport: { width: largura, height: altura }, deviceScaleFactor: escala, isMobile: true, hasTouch: true, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
    if (captura) await ctx.addInitScript(() => { window.__clarevoCaptura = true; });
    const p = await ctx.newPage();
    const fora = [];
    await p.route('**/*', (rota) => {
      const u = new URL(rota.request().url());
      if (['localhost', '127.0.0.1'].includes(u.hostname) || u.protocol === 'data:' || u.protocol === 'blob:') return rota.continue();
      fora.push(rota.request().url());
      return rota.abort();
    });
    const erros = [];
    p.on('pageerror', (e) => erros.push(e.message));
    const f = {
      p,
      fora,
      erros,
      botao: (name, exact = true) => p.getByRole('button', { name, exact }).filter({ visible: true }).first(),
      aba: (name) => p.getByRole('tab', { name, exact: true }).filter({ visible: true }).first(),
      campo: (name) => p.getByLabel(name, { exact: true }).filter({ visible: true }).first(),
      esperar: (texto, timeout = 12000) => p.getByText(texto, { exact: false }).filter({ visible: true }).first().waitFor({ timeout }),
      corpo: async () => (await p.locator('body').innerText()).replace(/ /g, ' '),
    };
    // A demonstração é recriada a cada carga da página: cada captura parte do mesmo Resumo (07/10/2026). Com `endereco`, a tela pedida
    // abre depois de entrar (o app guarda o endereço da primeira carga).
    f.entrar = async (cenario, endereco = '/') => {
      await p.goto(base + endereco + (cenario ? `?cenario=${cenario}` : ''));
      await f.esperar('Cuidar da vida financeira');
      // Só o build de demonstração marca o botão (DEMO_ENTRY_TEST_ID, core/welcome.ts): a versão publicada também tem "Ver a demonstração".
      const demo = p.locator('[data-testid="entrar-na-demonstracao"]').filter({ visible: true }).first();
      await demo.waitFor({ timeout: 15000 }).catch(() => { throw new Error('apps/app/dist não é o build de demonstração: o botão "Ver a demonstração" não tem a marca do build de demonstração (na versão publicada, ele abre a demonstração da web). Rode npm --workspace apps/app run export:demo'); });
      await demo.click();
      if (endereco === '/') {
        await f.esperar('Diferença do mês');
        if (!cenario) await f.esperar('R$ 2.100,00');
        await f.esperar('Ainda a pagar neste mês').catch(() => {});
      } else {
        await p.waitForURL((u) => u.pathname === endereco, { timeout: 15000 });
      }
      await p.waitForTimeout(600);
    };
    f.movimentos = async () => {
      await p.getByRole('tab', { name: /^Movimentos/ }).filter({ visible: true }).first().click();
      await f.esperar('Registrar recebimento');
      await p.waitForTimeout(400);
    };
    /** Conta nova, vazia, criada na memória da página (o acesso simulado da demonstração), com um nome fictício. */
    f.criarConta = async (nome, email) => {
      await f.botao('Criar conta').click(); await f.esperar('Nome de apresentação');
      await f.campo('Nome de apresentação').fill(nome); await f.campo('E-mail').fill(email); await f.campo('Senha').fill('senha1234');
      await f.botao('Criar conta').click(); await f.esperar('Confira seu e-mail');
      await f.botao('Simular abertura do link').click(); await f.botao('Já confirmei meu e-mail').click(); await f.esperar('Sua primeira conta');
      await f.botao('Começar meu mês').click(); await f.esperar('Diferença do mês'); await p.waitForTimeout(500);
    };
    /** De uma tela aberta por cima (Família, Convidar), volta ao Resumo pelo "Voltar" e pela aba. */
    f.resumo = async () => {
      const aba = () => p.getByRole('tab', { name: 'Resumo', exact: true }).filter({ visible: true });
      for (let i = 0; i < 8 && (await aba().count()) === 0; i++) { await f.botao('Voltar').click(); await p.waitForTimeout(400); }
      await aba().first().click(); await f.esperar('Diferença do mês'); await p.waitForTimeout(400);
    };
    f.conta = async () => {
      const avatar = p.getByRole('button', { name: 'Conta: perfil, assinatura, lembretes, privacidade e segurança' }).filter({ visible: true });
      if ((await avatar.count()) === 0) await f.resumo();
      await avatar.first().click();
      await f.esperar('Privacidade neste aparelho');
    };
    f.sair = async () => { await f.conta(); await f.botao('Sair da conta').click(); await f.esperar('Cuidar da vida financeira'); };
    /**
     * A Família (D-055) na memória da página, como quem usa: Maria cria "Casa Alves" e gera o convite (Anota e vê), sai, e Davi cria a conta
     * e abre o link (nomes fictícios). Para na tela do convite, antes de aceitar, com Davi na conta.
     */
    f.conviteDaFamilia = async () => {
      await p.goto(base + '/'); await f.esperar('Cuidar da vida financeira');
      await f.criarConta('Maria Alves', 'maria.alves@exemplo.com');
      await f.conta();
      await p.getByRole('button', { name: 'Criar Família', exact: true }).filter({ visible: true }).first().click(); await f.esperar('Anotar a casa em conjunto');
      await f.botao('Criar Família').click(); await f.esperar('Nome da Família');
      await f.campo('Nome da Família').fill('Casa Alves');
      await f.botao('Criar Família').click(); await f.esperar('Seu papel: Titular');
      // O compartilhamento do aparelho não existe no Chromium de captura: o link aparece na tela.
      await p.evaluate(() => { navigator.share = async () => {}; });
      await f.botao('Convidar').click(); await f.esperar('O que a pessoa poderá fazer');
      await f.botao('Gerar link').click(); await f.esperar('Link do convite'); await p.waitForTimeout(400);
      const link = ((await f.corpo()).match(/https?:\/\/[^\s]+\/convite\/[0-9a-f]{32}/) || [])[0];
      if (!link) throw new Error('o link do convite da Família não apareceu');
      await f.sair();
      await f.criarConta('Davi Alves', 'davi.alves@exemplo.com');
      await f.conta();
      await p.getByRole('button', { name: /^(Criar Família|Abrir Família)/ }).filter({ visible: true }).first().click(); await p.waitForTimeout(500);
      await f.campo('Link do convite').fill(link); await f.botao('Ver convite').click(); await f.esperar('Aceitar convite');
    };
    return { ctx, f };
  };

  /** Confere a captura gravada: tamanho e PNG sem canal alfa (as lojas recusam transparência). */
  const conferirPng = (arquivo, t) => {
    const d = dimensoesPng(arquivo);
    const [lw, lh] = [Math.round(t.largura * t.escala), Math.round(t.altura * t.escala)];
    if (d.largura !== lw || d.altura !== lh) throw new Error(`tamanho ${d.largura}x${d.altura}, esperado ${lw}x${lh}`);
    if (d.tipoDeCor !== 2) throw new Error(`o PNG tem canal alfa (tipo de cor ${d.tipoDeCor}), e as lojas não aceitam`);
    return d;
  };

  // As capturas saem da web, mas vão para as lojas: a Apple e o Google recusam app que aponte para pagamento fora da loja (a tela
  // Assinatura da web cita o cartão e o Pix). Nada do Plus (fechado) pode aparecer.
  const conferirTexto = (texto) => {
    if (/na web, por cartão|assinatura na web|assinar na web/i.test(texto)) throw new Error('a tela cita pagamento fora da loja');
    if (/Pessoas do negócio|Convidar alguém|Tenho um convite para um negócio|Clarevo Plus/.test(texto)) throw new Error('a tela mostra o Plus, que está fechado');
  };

  // ---------------------------------------------------------------------------------------------------------------------------------------
  // 1. As capturas das lojas: as telas do aparelho (uma vez, a 390 x 844 pontos e 3x) e o desenho em cada tamanho.
  // ---------------------------------------------------------------------------------------------------------------------------------------
  const LOJA = [
    {
      id: 'loja-1-resumo',
      frase: 'Veja o que entrou, o que saiu e o que ainda vence',
      abrir: async (f) => { await f.entrar(); },
      confere: ['Diferença do mês', 'R$ 6.000,00', 'R$ 3.900,00', 'R$ 2.100,00', 'Ainda a pagar neste mês'],
    },
    {
      // Anotar por mensagem (D-080, D-081): o que dá para mandar ao bot da Clarevo; na demonstração, a tela abre pelo endereço e só explica.
      id: 'loja-2-mensagem',
      frase: 'Anote um gasto com uma mensagem',
      abrir: async (f) => {
        await f.entrar(null, '/conta/telegram');
        await f.esperar('O que dá para mandar');
        // O card dos exemplos no alto da área que rola, com um respiro (o aviso da demonstração fica acima, fora da tela).
        await f.p.getByText('O que dá para mandar', { exact: false }).filter({ visible: true }).first().evaluate((e) => {
          e.scrollIntoView({ block: 'start' });
          for (let x = e.parentElement; x; x = x.parentElement) if (x.scrollHeight > x.clientHeight + 1 && getComputedStyle(x).overflowY !== 'visible') { x.scrollBy(0, -56); break; }
        });
        await f.p.waitForTimeout(500);
      },
      confere: ['mercado 52,30', 'farmácia 41 cartão', 'O que dá para mandar'],
    },
    {
      id: 'loja-3-contas',
      frase: 'Contas a pagar e faturas do cartão no mesmo lugar',
      abrir: async (f) => {
        await f.entrar();
        await f.p.getByRole('button', { name: /^Ainda a pagar neste mês, R\$/ }).filter({ visible: true }).first().click();
        await f.esperar('Contas em aberto com vencimento até o fim do mês');
        await f.p.waitForTimeout(500);
      },
      confere: ['Contas em aberto com vencimento até o fim do mês', 'Já paguei'],
    },
    {
      // A Família (D-055) na memória da página: Maria cria "Casa Alves" e convida Davi (nomes fictícios); a tela é a de quem é titular.
      id: 'loja-4-familia',
      frase: 'As contas da casa, anotadas em família',
      abrir: async (f) => {
        const { p } = f;
        await f.conviteDaFamilia();
        await f.botao('Aceitar convite').click(); await f.esperar('Você entrou na Família Casa Alves.');
        await f.sair();
        await f.botao('Entrar').click(); await f.esperar('Esqueci minha senha');
        await f.campo('E-mail').fill('maria.alves@exemplo.com'); await f.campo('Senha').fill('senha1234');
        await f.botao('Entrar').click(); await f.esperar('Diferença do mês'); await p.waitForTimeout(500);
        await f.conta();
        await p.getByRole('button', { name: /^(Criar Família|Abrir Família)/ }).filter({ visible: true }).first().click(); await f.esperar('Seu papel: Titular');
        await p.waitForTimeout(600);
      },
      confere: ['Casa Alves', 'Seu papel: Titular', 'Davi', 'Anota e vê'],
    },
    {
      // O espaço Negócio (D-113) do cenário "negocio": "Seu negócio", com o que entrou, saiu e sobrou no mês. O Plus continua fechado.
      id: 'loja-5-negocio',
      frase: 'O negócio separado das contas pessoais',
      abrir: async (f) => {
        await f.entrar('negocio');
        await f.p.getByRole('tab', { name: /^Ver dados do negócio / }).filter({ visible: true }).first().click(); await f.p.waitForTimeout(600);
        await f.botao('Ver seu negócio').click(); await f.esperar('Últimos meses');
        await f.p.waitForTimeout(600);
      },
      confere: ['Seu negócio', 'Sacolé da Maria', 'Últimos meses'],
    },
    {
      // A privacidade (análise geral de 26/11/2026): o convite para a Família visto por Davi, antes de aceitar, com o que ele poderá fazer na
      // Família ("Anota e vê") e "Aceitar não mostra nem copia o seu Pessoal". Até 26/11/2026 era "Quem vê estes dados?" (frase "Seus
      // registros pessoais são só seus"), com nove itens em letra pequena, ilegível no tamanho da loja.
      id: 'loja-6-privacidade',
      frase: 'Seus registros pessoais continuam só seus',
      abrir: async (f) => {
        await f.conviteDaFamilia();
        await f.p.waitForTimeout(600);
      },
      confere: ['Convite para a Família', 'Casa Alves', 'Anota e vê', 'Aceitar não mostra nem copia o seu Pessoal', 'Aceitar convite'],
    },
  ];
  for (const tela of LOJA) {
    if (FRASE_PROIBIDA.test(tela.frase) || tela.frase.length > 52) throw new Error(`a frase de ${tela.id} não segue as regras de redação: "${tela.frase}"`);
  }

  try {
    const telas = new Map();
    const lojaPedidas = LOJA.filter((tela) => !SO_CAPTURA || tela.id.includes(SO_CAPTURA));
    if (SO_CAPTURA && lojaPedidas.length === 0) throw new Error(`nenhuma captura das lojas com "${SO_CAPTURA}" no nome`);
    for (const tela of SO_RESUMO ? [] : lojaPedidas) {
      const { ctx, f } = await abrirContexto(APARELHO, true);
      try {
        await tela.abrir(f);
        const texto = await f.corpo();
        for (const x of tela.confere) if (!texto.includes(x)) throw new Error(`faltou "${x}" na tela`);
        conferirTexto(texto);
        // Sem o selo da demonstração (a nota "Dados fictícios" vai no desenho), e nenhuma linha de "fica só nesta demonstração".
        const selo = await f.p.locator('[aria-label="Demonstração: acesso simulado e dados fictícios"]').count();
        if (selo > 0 || /Demonstração ·|Fica só nesta demonstração/.test(texto)) throw new Error('a tela ainda mostra o selo "Demonstração"');
        const arquivo = path.join(pastaTemp, `${tela.id}.png`);
        await f.p.screenshot({ path: arquivo });
        telas.set(tela.id, arquivo);
        if (f.fora.length) throw new Error(`requisições para fora de localhost bloqueadas: ${[...new Set(f.fora)].slice(0, 3).join(' | ')}`);
        if (f.erros.length) throw new Error(`erros na página: ${[...new Set(f.erros)].slice(0, 3).join(' | ')}`);
      } catch (e) {
        falhas.push(`${tela.id}: ${e.message}`);
        console.error(`FALHOU   ${tela.id}: ${e.message}`);
      } finally {
        await ctx.close();
      }
    }
    for (const t of SO_RESUMO ? [] : TAMANHOS.filter((x) => !SO_TAMANHO || x.pasta.includes(SO_TAMANHO))) {
      const pasta = path.join(SAIDA, t.pasta);
      fs.mkdirSync(pasta, { recursive: true });
      const ctx = await browser.newContext({ viewport: { width: t.largura, height: t.altura }, deviceScaleFactor: t.escala });
      const p = await ctx.newPage();
      for (const tela of lojaPedidas) {
        if (!telas.has(tela.id)) continue;
        try {
          const html = path.join(pastaTemp, `${tela.id}-${t.pasta}.html`);
          fs.writeFileSync(html, moldura({ frase: tela.frase, tela: path.basename(telas.get(tela.id)), largura: t.largura, altura: t.altura }));
          await p.goto(`${base}/__captura/${path.basename(html)}`);
          await p.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map((i) => (i.complete ? null : new Promise((r) => { i.onload = r; i.onerror = r; })))); });
          // A frase cabe em até duas linhas, e a tela do aparelho fica abaixo dela.
          const medida = await p.evaluate(() => {
            const titulo = document.querySelector('h1');
            const h = titulo.getBoundingClientRect();
            const nota = document.querySelector('.nota').getBoundingClientRect();
            const ap = document.querySelector('.aparelho').getBoundingClientRect();
            const img = document.querySelector('.aparelho img');
            return { linhas: Math.round(h.height / parseFloat(getComputedStyle(titulo).lineHeight)), nota: nota.bottom, aparelho: ap.top, fonte: document.fonts.check('800 20px Manrope'), imagem: img.naturalWidth };
          });
          if (medida.linhas > 2) throw new Error(`a frase ocupa ${medida.linhas} linhas`);
          if (medida.nota + 12 > medida.aparelho) throw new Error(`a frase encosta na tela do aparelho (nota até ${Math.round(medida.nota)}, aparelho em ${Math.round(medida.aparelho)})`);
          if (!medida.fonte) throw new Error('a fonte Manrope não carregou');
          if (medida.imagem !== APARELHO.largura * APARELHO.escala) throw new Error(`a tela do aparelho não carregou (${medida.imagem} px)`);
          const arquivo = path.join(pasta, `${tela.id}.png`);
          await p.screenshot({ path: arquivo });
          const d = conferirPng(arquivo, t);
          gravadas.push(path.relative(RAIZ, arquivo));
          console.log(`gravada  ${path.relative(RAIZ, arquivo)}  ${d.largura}x${d.altura}`);
        } catch (e) {
          falhas.push(`${t.pasta}/${tela.id}: ${e.message}`);
          console.error(`FALHOU   ${t.pasta}/${tela.id}: ${e.message}`);
        }
      }
      await ctx.close();
    }

    // -------------------------------------------------------------------------------------------------------------------------------------
    // 2. As telas cruas da demonstração, com o selo, para o site, o kit de imprensa e as imagens que montam a tela num aparelho desenhado.
    // -------------------------------------------------------------------------------------------------------------------------------------
    for (const t of SO_LOJAS || SO_RESUMO ? [] : TAMANHOS.filter((x) => !SO_TAMANHO || x.pasta.includes(SO_TAMANHO))) {
      const { ctx, f } = await abrirContexto(t, false);
      const { p } = f;
      const TELAS = [
        { id: '01_resumo', abrir: async () => {}, confere: ['Diferença do mês', 'R$ 6.000,00', 'R$ 3.900,00', 'R$ 2.100,00'] },
        {
          id: '02_anotar_gasto',
          abrir: async () => {
            await f.botao('Anotar gasto').click();
            await f.esperar('Será salvo em');
            await f.campo('Descrição').fill('Feira de sábado');
            await f.campo('Valor em reais').fill('86,40');
            await p.waitForTimeout(300);
          },
          confere: ['Será salvo em'],
          confereCampos: [['Descrição', 'Feira de sábado'], ['Valor em reais', '86,40']],
        },
        {
          id: '03_contas_a_pagar',
          abrir: async () => {
            await p.getByRole('button', { name: /^Ainda a pagar neste mês, R\$/ }).filter({ visible: true }).first().click();
            await f.esperar('Contas em aberto com vencimento até o fim do mês');
            await p.waitForTimeout(500);
          },
          confere: ['Contas em aberto com vencimento até o fim do mês'],
        },
        {
          id: '04_cartoes',
          abrir: async () => {
            await f.movimentos();
            await p.getByRole('button', { name: /^Cartões, / }).filter({ visible: true }).first().click();
            await f.esperar('Adicionar outro cartão');
            await p.getByRole('button', { name: /^Cartão Exemplo · final 1234\./ }).filter({ visible: true }).first().click();
            await f.esperar('Fatura atual');
            await p.waitForTimeout(500);
          },
          confere: ['Cartão Exemplo', 'Fatura atual'],
        },
        {
          id: '05_evolucao',
          // Cenário fictício "evolucao" da demonstração (janeiro a junho de 2026, com um gasto grande em abril): o gráfico fica com meses para comparar.
          cenario: 'evolucao',
          abrir: async () => {
            await f.movimentos();
            // A Evolução abre pelas Análises (revisão das telas, 16/11/2026): "Ver análises do mês" › aba Evolução › "Abrir Evolução".
            await p.getByRole('button', { name: /^Ver análises do mês\./ }).filter({ visible: true }).first().click();
            await f.esperar('Consulte o mês escolhido');
            await p.getByRole('tab', { name: 'Evolução', exact: true }).filter({ visible: true }).first().click();
            await f.esperar('Abrir Evolução');
            await f.botao('Abrir Evolução').click();
            await f.esperar('Valores registrados, pela data do pagamento');
            // Seis meses de outubro para trás mostrariam só maio e junho nesse cenário: os 12 meses mostram janeiro a junho.
            const doze = p.getByRole('radio', { name: '12 meses' }).or(f.botao('12 meses')).filter({ visible: true }).first();
            await doze.click();
            await p.waitForTimeout(900);
            // Na tela estreita, a opção mostra só "12" (o nome acessível continua "12 meses").
            if ((await doze.getAttribute('aria-checked')) !== 'true') throw new Error('a janela de 12 meses não ficou escolhida');
          },
          confere: ['Valores registrados, pela data do pagamento'],
        },
        {
          id: '06_analises_bolhas',
          abrir: async () => {
            await f.movimentos();
            await f.botao('Ver análises do mês. Categorias, evolução, orçamento e o mês em 30 segundos.').click();
            await f.esperar('Consulte o mês escolhido');
            await p.getByRole('radio', { name: 'Bolhas', exact: true }).filter({ visible: true }).first().click();
            await p.getByRole('group', { name: 'Pago por categoria, em bolhas' }).filter({ visible: true }).first().waitFor({ timeout: 8000 });
            await p.waitForTimeout(900);
          },
          confere: ['Consulte o mês escolhido', 'Mercado', 'Moradia'],
        },
        {
          id: '07_metas',
          abrir: async () => {
            await f.aba('Metas').click();
            await f.esperar('Reserva para imprevistos');
            await f.esperar('Seu plano de guardar');
            await p.waitForTimeout(600);
          },
          confere: ['Reserva para imprevistos', 'Suas metas'],
        },
        {
          id: '08_aprender',
          abrir: async () => {
            await f.aba('Aprender e dúvidas').click();
            await f.esperar('Comece por aqui');
            await p.waitForTimeout(600);
          },
          confere: ['Comece por aqui'],
        },
        {
          // Entrar com os dados sem digitar (D-078, D-088): o comprovante de Pix em PDF, lido no próprio navegador, preenche o gasto.
          id: '09_comprovante_lido',
          abrir: async () => {
            await f.botao('Anotar gasto').click();
            await f.esperar('Será salvo em');
            await p.getByRole('button', { name: /^Escanear nota fiscal/ }).filter({ visible: true }).first().click();
            const [escolha] = await Promise.all([p.waitForEvent('filechooser'), f.botao('Ler comprovante ou boleto').click()]);
            await escolha.setFiles(comprovante);
            await f.esperar('Comprovante lido:', 20000);
            await p.getByText('Comprovante lido:', { exact: false }).filter({ visible: true }).first().evaluate((e) => e.scrollIntoView({ block: 'start' }));
            await p.waitForTimeout(600);
          },
          confere: ['Comprovante lido: Pix enviado', 'R$ 58,90', 'preencheu o que o comprovante informa'],
        },
        {
          // Anotar por mensagem (D-080, D-081): o que dá para mandar ao bot da Clarevo no Telegram.
          id: '10_telegram',
          endereco: '/conta/telegram',
          abrir: async () => { await f.esperar('O que dá para mandar'); await p.waitForTimeout(600); },
          confere: ['mercado 52,30', 'farmácia 41 cartão', 'O que dá para mandar'],
        },
      ];
      const pasta = path.join(SAIDA, t.pasta);
      fs.mkdirSync(pasta, { recursive: true });
      for (const tela of TELAS) {
        try {
          await f.entrar(tela.cenario, tela.endereco || '/');
          await tela.abrir();
          const texto = await f.corpo();
          for (const x of tela.confere) if (!texto.includes(x)) throw new Error(`faltou "${x}" na tela`);
          for (const [nome, valor] of tela.confereCampos || []) if ((await f.campo(nome).inputValue()) !== valor) throw new Error(`o campo "${nome}" não tem "${valor}"`);
          // Toda tela crua mostra a identificação da demonstração, e nenhuma mostra a pílula de uma conta real.
          if (!texto.includes('Demonstração') && !texto.includes('demonstração')) throw new Error('a tela não identifica a demonstração');
          conferirTexto(texto);
          const arquivo = path.join(pasta, `${tela.id}.png`);
          await p.screenshot({ path: arquivo });
          const d = conferirPng(arquivo, t);
          gravadas.push(path.relative(RAIZ, arquivo));
          console.log(`gravada  ${path.relative(RAIZ, arquivo)}  ${d.largura}x${d.altura}`);
        } catch (e) {
          falhas.push(`${t.pasta}/${tela.id}: ${e.message}`);
          console.error(`FALHOU   ${t.pasta}/${tela.id}: ${e.message}`);
        }
      }
      if (f.fora.length) falhas.push(`${t.pasta}: requisições para fora de localhost bloqueadas: ${[...new Set(f.fora)].slice(0, 3).join(' | ')}`);
      if (f.erros.length) falhas.push(`${t.pasta}: erros na página: ${[...new Set(f.erros)].slice(0, 3).join(' | ')}`);
      await ctx.close();
    }

    // -------------------------------------------------------------------------------------------------------------------------------------
    // 3. O Resumo sem o selo (D-129), para a imagem de compartilhamento do site e o gráfico do Google Play, com a marca das capturas das lojas.
    // -------------------------------------------------------------------------------------------------------------------------------------
    for (const t of SO_LOJAS ? [] : TAMANHOS.filter((x) => PASTAS_DO_RESUMO_SEM_SELO.includes(x.pasta) && (!SO_TAMANHO || x.pasta.includes(SO_TAMANHO)))) {
      const { ctx, f } = await abrirContexto(t, true);
      try {
        await f.entrar();
        const texto = await f.corpo();
        for (const x of ['Diferença do mês', 'R$ 6.000,00', 'R$ 3.900,00', 'R$ 2.100,00']) if (!texto.includes(x)) throw new Error(`faltou "${x}" na tela`);
        conferirTexto(texto);
        const selo = await f.p.locator('[aria-label="Demonstração: acesso simulado e dados fictícios"]').count();
        if (selo > 0 || /Demonstração ·|Fica só nesta demonstração/.test(texto)) throw new Error('a tela ainda mostra o selo "Demonstração"');
        const pasta = path.join(SAIDA, t.pasta);
        fs.mkdirSync(pasta, { recursive: true });
        const arquivo = path.join(pasta, 'resumo-sem-selo.png');
        await f.p.screenshot({ path: arquivo });
        const d = conferirPng(arquivo, t);
        gravadas.push(path.relative(RAIZ, arquivo));
        console.log(`gravada  ${path.relative(RAIZ, arquivo)}  ${d.largura}x${d.altura}`);
        if (f.fora.length) throw new Error(`requisições para fora de localhost bloqueadas: ${[...new Set(f.fora)].slice(0, 3).join(' | ')}`);
        if (f.erros.length) throw new Error(`erros na página: ${[...new Set(f.erros)].slice(0, 3).join(' | ')}`);
      } catch (e) {
        falhas.push(`${t.pasta}/resumo-sem-selo: ${e.message}`);
        console.error(`FALHOU   ${t.pasta}/resumo-sem-selo: ${e.message}`);
      } finally {
        await ctx.close();
      }
    }
  } finally {
    await browser.close();
    servidor.close();
  }
  console.log(`${gravadas.length} capturas gravadas em ${path.relative(RAIZ, SAIDA)}`);
  if (falhas.length) {
    console.error(`${falhas.length} problema(s):\n- ${falhas.join('\n- ')}`);
    process.exit(1);
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
