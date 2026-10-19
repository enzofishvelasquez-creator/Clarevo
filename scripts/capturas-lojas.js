/**
 * Capturas para a ficha das lojas (Ciclo R, D-060 item 1): abre a DEMONSTRAÇÃO do app (dados fictícios e identificados, "Demonstração ·
 * Pessoal" no alto de cada tela) com o Playwright e grava oito telas por tamanho em docs/lojas/capturas/:
 * Resumo, Anotar gasto, Contas a pagar, Cartões, Evolução, Análises em bolhas, Metas e Aprender.
 *
 * Tamanhos (tabela e fontes em docs/16_PUBLICACAO_LOJAS.md, seção "Capturas"; PNG sem canal alfa):
 *   Apple, iPhone com Dynamic Island de 6,3 pol. (o tamanho que a loja exige): 1206 x 2622  = 402 x 874 pontos a 3x
 *   Apple, iPhone com Dynamic Island de 6,9 pol. (o maior, opcional):         1320 x 2868  = 440 x 956 pontos a 3x
 *   Google Play, celular (proporção 9:16; tamanho a conferir na página oficial): 1080 x 1920 = 450 x 800 pontos a 2,4x
 *
 * Nenhum dado real: o build é sempre o de demonstração (`npm --workspace apps/app run export:demo`, que ignora o Supabase), o roteiro
 * só lê e nada é gravado, e qualquer requisição para fora de localhost é bloqueada e faz o script falhar.
 *
 * Uso:
 *   node scripts/capturas-lojas.js                gera o build de demonstração, sobe um servidor local e grava as capturas
 *   node scripts/capturas-lojas.js --sem-build    reaproveita apps/app/dist, se for um build de demonstração (por exemplo, o de `npm run test:web`)
 *   node scripts/capturas-lojas.js --saida <pasta>  outra pasta de saída (padrão: docs/lojas/capturas)
 *   node scripts/capturas-lojas.js --tamanho <texto>  só os tamanhos cujo nome de pasta contém o texto
 * Porta: E2E_PORT (padrão 8098). Navegador: Chromium do Playwright, ou CHROMIUM_PATH.
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { chromium } = require('playwright');

const RAIZ = path.join(__dirname, '..');
const DIST = path.join(RAIZ, 'apps', 'app', 'dist');
const argv = process.argv.slice(2);
const opcao = (nome) => { const i = argv.indexOf(nome); return i >= 0 ? argv[i + 1] : null; };
const SAIDA = path.resolve(opcao('--saida') || path.join(RAIZ, 'docs', 'lojas', 'capturas'));
const SO_TAMANHO = opcao('--tamanho');
const PORTA = Number(process.env.E2E_PORT || 8098);

/** `largura` e `altura` em pontos (pixels CSS); o PNG sai com largura x escala por altura x escala (o Google ganha uma janela mais alta, 9:16, para as telas não ficarem cortadas). */
const TAMANHOS = [
  { pasta: 'apple-iphone-6-3pol-1206x2622', largura: 402, altura: 874, escala: 3 },
  { pasta: 'apple-iphone-6-9pol-1320x2868', largura: 440, altura: 956, escala: 3 },
  { pasta: 'google-play-celular-1080x1920', largura: 450, altura: 800, escala: 2.4 },
];

const TIPOS = { '.js': 'text/javascript', '.html': 'text/html', '.ttf': 'font/ttf', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.css': 'text/css', '.webmanifest': 'application/manifest+json' };

function dimensoesPng(arquivo) {
  const b = fs.readFileSync(arquivo);
  if (b.toString('ascii', 1, 4) !== 'PNG') throw new Error(`${arquivo} não é um PNG`);
  return { largura: b.readUInt32BE(16), altura: b.readUInt32BE(20), tipoDeCor: b[25] };
}

(async () => {
  if (!argv.includes('--sem-build')) {
    // O build de demonstração limpa o cache do Metro e zera as variáveis do Supabase: nenhuma conta real entra na captura.
    const r = spawnSync('npm', ['--workspace', 'apps/app', 'run', 'export:demo'], { cwd: RAIZ, stdio: 'inherit', shell: process.platform === 'win32' });
    if (r.status !== 0) throw new Error('o build de demonstração falhou');
  }
  if (!fs.existsSync(path.join(DIST, 'index.html'))) throw new Error('apps/app/dist não existe: rode sem --sem-build');

  const servidor = http
    .createServer((q, r) => {
      let p = path.join(DIST, decodeURIComponent(q.url.split('?')[0]));
      if (!p.startsWith(DIST) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) p = path.join(DIST, 'index.html');
      r.writeHead(200, { 'content-type': TIPOS[path.extname(p)] || 'application/octet-stream' });
      fs.createReadStream(p).pipe(r);
    })
    .listen(PORTA);
  const base = `http://localhost:${PORTA}`;

  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const falhas = [];
  const gravadas = [];
  try {
    for (const t of TAMANHOS.filter((x) => !SO_TAMANHO || x.pasta.includes(SO_TAMANHO))) {
      const ctx = await browser.newContext({ viewport: { width: t.largura, height: t.altura }, deviceScaleFactor: t.escala, isMobile: true, hasTouch: true, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
      // O tour de boas-vindas (D-049) cobriria o Resumo: o mesmo atalho do roteiro web.
      await ctx.addInitScript(() => { window.__clarevoSemTour = true; });
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

      const botao = (name, exact = true) => p.getByRole('button', { name, exact }).filter({ visible: true }).first();
      const aba = (name) => p.getByRole('tab', { name, exact: true }).filter({ visible: true }).first();
      const campo = (name) => p.getByLabel(name, { exact: true }).filter({ visible: true }).first();
      const esperar = (texto, timeout = 12000) => p.getByText(texto, { exact: false }).filter({ visible: true }).first().waitFor({ timeout });
      const corpo = async () => (await p.locator('body').innerText()).replace(/ /g, ' ');
      // A demonstração é recriada a cada carga da página: cada captura parte do mesmo Resumo (07/10/2026).
      const entrar = async (cenario) => {
        await p.goto(base + (cenario ? `/?cenario=${cenario}` : '/'));
        await esperar('Seu dinheiro');
        await botao('Ver demonstração com dados fictícios').click();
        await esperar('Diferença do mês');
        if (!cenario) await esperar('R$ 2.100,00');
        await esperar('Ainda a pagar neste mês').catch(() => {});
        await p.waitForTimeout(600);
      };
      const movimentos = async () => { await aba('Movimentos: movimentações do mês').click(); await esperar('Registrar recebimento'); await p.waitForTimeout(400); };

      const TELAS = [
        {
          id: '01_resumo',
          abrir: async () => {},
          confere: ['Diferença do mês', 'R$ 6.000,00', 'R$ 3.900,00', 'R$ 2.100,00'],
        },
        {
          id: '02_anotar_gasto',
          abrir: async () => {
            await botao('Anotar gasto').click();
            await esperar('Será salvo em');
            await campo('Descrição').fill('Feira de sábado');
            await campo('Valor em reais').fill('86,40');
            await p.waitForTimeout(300);
          },
          confere: ['Será salvo em'],
          confereCampos: [['Descrição', 'Feira de sábado'], ['Valor em reais', '86,40']],
        },
        {
          id: '03_contas_a_pagar',
          abrir: async () => {
            await p.getByRole('button', { name: /^Ainda a pagar neste mês, R\$/ }).filter({ visible: true }).first().click();
            await esperar('Contas em aberto com vencimento até o fim do mês');
            await p.waitForTimeout(500);
          },
          confere: ['Contas em aberto com vencimento até o fim do mês'],
        },
        {
          id: '04_cartoes',
          abrir: async () => {
            await movimentos();
            await p.getByRole('button', { name: /^Cartões, / }).filter({ visible: true }).first().click();
            await esperar('Cadastrar cartão');
            await p.getByRole('button', { name: /^Cartão Exemplo · final 1234\./ }).filter({ visible: true }).first().click();
            await esperar('Fatura atual');
            await p.waitForTimeout(500);
          },
          confere: ['Cartão Exemplo', 'Fatura atual'],
        },
        {
          id: '05_evolucao',
          // Cenário fictício "evolucao" da demonstração (janeiro a junho de 2026, com um gasto grande em abril): o gráfico fica com meses para comparar.
          cenario: 'evolucao',
          abrir: async () => {
            await movimentos();
            await botao('Evolução. Recebido e pago mês a mês, com média e mediana.').click();
            await esperar('Valores registrados, pela data do pagamento');
            // Seis meses de outubro para trás mostrariam só maio e junho nesse cenário: os 12 meses mostram janeiro a junho.
            await p.getByRole('radio', { name: '12 meses' }).or(botao('12 meses')).filter({ visible: true }).first().click();
            await p.waitForTimeout(900);
          },
          confere: ['Valores registrados, pela data do pagamento', '12 meses'],
        },
        {
          id: '06_analises_bolhas',
          abrir: async () => {
            await movimentos();
            await botao('Análises. Categorias, Evolução, Próximos meses e Orçamento.').click();
            await esperar('Consulte o mês escolhido');
            await p.getByRole('radio', { name: 'Bolhas', exact: true }).filter({ visible: true }).first().click();
            await p.getByRole('group', { name: 'Pago por categoria, em bolhas' }).filter({ visible: true }).first().waitFor({ timeout: 8000 });
            await p.waitForTimeout(900);
          },
          confere: ['Consulte o mês escolhido', 'Mercado', 'Moradia'],
        },
        {
          id: '07_metas',
          abrir: async () => {
            await aba('Metas').click();
            await esperar('Reserva para imprevistos');
            await esperar('Seu plano de guardar');
            await p.waitForTimeout(600);
          },
          confere: ['Reserva para imprevistos', 'Suas metas'],
        },
        {
          id: '08_aprender',
          abrir: async () => {
            await aba('Aprender e dúvidas').click();
            await esperar('Comece por aqui');
            await p.waitForTimeout(600);
          },
          confere: ['Comece por aqui'],
        },
      ];

      const pasta = path.join(SAIDA, t.pasta);
      fs.mkdirSync(pasta, { recursive: true });
      for (const tela of TELAS) {
        try {
          await entrar(tela.cenario);
          await tela.abrir();
          const texto = await corpo();
          for (const x of tela.confere) if (!texto.includes(x)) throw new Error(`faltou "${x}" na tela`);
          for (const [nome, valor] of tela.confereCampos || []) if ((await campo(nome).inputValue()) !== valor) throw new Error(`o campo "${nome}" não tem "${valor}"`);
          // Toda captura mostra a identificação da demonstração, e nenhuma mostra a pílula de uma conta real.
          if (!texto.includes('Demonstração') && !texto.includes('demonstração')) throw new Error('a tela não identifica a demonstração');
          const arquivo = path.join(pasta, `${tela.id}.png`);
          await p.screenshot({ path: arquivo });
          const d = dimensoesPng(arquivo);
          const [lw, lh] = [Math.round(t.largura * t.escala), Math.round(t.altura * t.escala)];
          if (d.largura !== lw || d.altura !== lh) throw new Error(`tamanho ${d.largura}x${d.altura}, esperado ${lw}x${lh}`);
          if (d.tipoDeCor !== 2) throw new Error(`o PNG tem canal alfa (tipo de cor ${d.tipoDeCor}), e as lojas não aceitam`);
          gravadas.push(path.relative(RAIZ, arquivo));
          console.log(`gravada  ${path.relative(RAIZ, arquivo)}  ${d.largura}x${d.altura}`);
        } catch (e) {
          falhas.push(`${t.pasta}/${tela.id}: ${e.message}`);
          console.error(`FALHOU   ${t.pasta}/${tela.id}: ${e.message}`);
        }
      }
      if (fora.length) falhas.push(`${t.pasta}: requisições para fora de localhost bloqueadas: ${[...new Set(fora)].slice(0, 3).join(' | ')}`);
      if (erros.length) falhas.push(`${t.pasta}: erros na página: ${[...new Set(erros)].slice(0, 3).join(' | ')}`);
      await ctx.close();
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
