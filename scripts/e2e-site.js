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
 *     Origin que o navegador manda de verdade num formulário da própria página;
 *   - os indicadores oficiais (D-106), com um retrato de teste na geração e o Banco Central simulado no `fetch` do worker: sem JavaScript, o
 *     retrato; com JavaScript, uma pergunta só ao próprio site (/api/indicadores), que troca os números e a hora e não se repete; a cópia de
 *     uma hora no servidor; a fonte fora do ar (a página fica com o retrato); nenhum pedido do navegador a outro domínio; a política de
 *     segurança; o aviso de mercado no rodapé; as duas calculadoras novas; e o resumo semanal com uma edição de teste;
 *   - os vídeos de uso do app (D-114 e D-115) na página inicial e em O app: cada um no bloco que mostra, do próprio site, sem controles nem
 *     `autoplay`, sem som, com `preload="none"`; o script toca o que aparece na tela e pausa o que sai; o botão de pausar e tocar (nome
 *     acessível, teclado); com movimento reduzido ou economia de dados, nada toca nem baixa até a pessoa pedir; sem JavaScript, a capa; e o
 *     servidor responde pedaços (206) com o tipo certo;
 *   - as imagens das matérias de Novidades (D-114): capa e telas com largura, altura e texto alternativo, carregando do próprio site, e a
 *     versão escura no tema escuro;
 *   - a varredura de espaçamento e largura em todas as páginas (360, 768, 900 e 1280 px) e, no tema escuro, nas páginas com vídeos e imagens
 *     novas (360 e 1280 px).
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
/** A data de referência dos posts: a do mais novo (a mesma de REFERENCIA_DOS_POSTS no teste do núcleo), para todas as matérias saírem. */
const REFERENCIA_DOS_POSTS = '2026-11-12';
/** As matérias de Novidades, todas com imagem de capa (D-114). */
const POSTS = [
  'novidades/2026-10-23-conheca-a-clarevo',
  'novidades/2026-10-23-13o-salario-quando-cai-e-como-se-organizar',
  'novidades/2026-10-23-como-a-empresa-oferece-a-clarevo-sem-ver-suas-financas',
  'novidades/2026-11-12-o-que-chegou-ao-app-em-novembro',
];
/** As páginas com vídeos ou imagens novas (D-114), que a varredura do tema escuro percorre. */
const PAGINAS_D114 = ['', 'app/', ...POSTS];
/**
 * O retrato de teste dos indicadores (D-106), gravado na geração: números fictícios, diferentes dos que o Banco Central simulado devolve,
 * para o teste ver a troca. 13:00 UTC é 10:00 em Brasília.
 */
const RETRATO = {
  consultadoEm: `${HOJE}T13:00:00.000Z`,
  valores: {
    selic: { valor: 14.25, data: HOJE },
    cdi: { valor: 14.15, data: '2026-10-22', dia: 0.052686 },
    ipca: { valor: 5.1, data: '2026-09-01', mes: 0.5 },
    poupanca: { valor: 0.6601, data: HOJE, fim: '2026-11-23' },
    ptax: { valor: 5.4321, data: '2026-10-22' },
  },
};
/** O que o Banco Central simulado devolve (o formato da API de séries do SGS), pelo código da série no endereço. */
const SGS = {
  'bcdata.sgs.432/': [{ data: '22/10/2026', valor: '15.00' }, { data: '23/10/2026', valor: '15.00' }],
  'bcdata.sgs.12/': [{ data: '22/10/2026', valor: '0.055131' }],
  'bcdata.sgs.433/': Array.from({ length: 12 }, (_, i) => ({ data: `01/${String(((9 + i) % 12) + 1).padStart(2, '0')}/${i < 3 ? 2025 : 2026}`, valor: '0.40' })),
  'bcdata.sgs.195/': [{ data: '23/10/2026', dataFim: '23/11/2026', valor: '0.6719' }],
  'bcdata.sgs.1/': [{ data: '22/10/2026', valor: '5.3870' }],
};
/** Uma edição de teste do resumo semanal (temas permitidos, resumo próprio, link simples). */
const EDICAO = {
  itens: [
    { titulo: 'Copom anuncia a meta da Selic', resumo: 'O comitê do Banco Central anunciou a meta da Selic na reunião da semana.', veiculo: 'Agência de Exemplo', autor: 'Pessoa de Exemplo', data: '2026-10-22', link: 'https://noticias.exemplo.test/copom', tema: 'copom' },
  ],
};
const resultados = [];
const ok = (nome, condicao, extra = '') => resultados.push([condicao ? 'OK     ' : 'FALHOU', nome, condicao ? '' : extra]);

/** Gera o site numa pasta temporária, com os formulários ligados, e devolve o caminho. */
function gerarSiteLigado() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clarevo-e2e-site-'));
  const dados = JSON.parse(fs.readFileSync(path.join(RAIZ, 'site', 'dados-da-empresa.json'), 'utf8'));
  fs.writeFileSync(path.join(dir, 'dados.json'), JSON.stringify({ ...dados, formulario_contato: true, newsletter: true }));
  fs.writeFileSync(path.join(dir, 'retrato.json'), JSON.stringify(RETRATO));
  fs.mkdirSync(path.join(dir, 'noticias'));
  fs.writeFileSync(path.join(dir, 'noticias', `semana-${HOJE}.json`), JSON.stringify(EDICAO));
  const saida = path.join(dir, 'site');
  const r = spawnSync(
    process.execPath,
    [path.join(__dirname, 'gerar-site.js'), '--dados', path.join(dir, 'dados.json'), '--referencia', REFERENCIA_DOS_POSTS, '--retrato', path.join(dir, 'retrato.json'), '--noticias', path.join(dir, 'noticias'), '--saida', saida],
    { encoding: 'utf8' },
  );
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
    // As duas que por enquanto só o site mostra (D-106).
    r(
      'juros-compostos',
      async (p) => {
        await texto(p, 'inicial', '1000');
        await texto(p, 'mensal', '500');
        await texto(p, 'taxaAno', '10');
        await texto(p, 'meses', '120');
      },
      () => {
        const s = CALC.calcJurosCompostos({ inicial: '1000', mensal: '500', taxaAno: '10', meses: '120' });
        return { linhas: [linhasDe(s)], tambem: [...s.result.notes, ...s.result.hypotheses] };
      },
    ),
    r(
      'rendimento-cdi',
      async (p) => {
        await texto(p, 'valor', '10000');
        await texto(p, 'percentual', '110');
        await texto(p, 'cdiAno', '12');
        await texto(p, 'meses', '18');
        await escolha(p, 'imposto', 'regressivo');
      },
      () => {
        const s = CALC.calcRendimentoCdi({ valor: '10000', percentual: '110', cdiAno: '12', meses: '18', imposto: 'regressivo' });
        return { linhas: [linhasDe(s)], tambem: [...s.result.notes, ...s.result.hypotheses] };
      },
    ),
  ];
}

/**
 * A varredura de espaçamento e largura de uma página (pedido do Enzo em 12/11/2026), que roda no navegador: caixas encostadas, rolagem
 * lateral, cartão sozinho na última linha, título colado, texto colado numa caixa, margem somada ao respiro e seções com o respiro em
 * dobro. Serve à varredura de todas as páginas (bloco 8) e à do tema escuro (bloco 8b, D-114).
 */
function varrerPagina() {
  const caixas = [...document.querySelectorAll('main *, footer *')].filter((e) => {
    const cs = getComputedStyle(e); const b = e.getBoundingClientRect();
    if (b.width < 120 || b.height < 56 || cs.visibility === 'hidden' || cs.display === 'none') return false;
    if ((parseFloat(cs.borderTopLeftRadius) || 0) < 8) return false;
    const borda = parseFloat(cs.borderTopWidth) > 0 && cs.borderTopStyle !== 'none';
    const fundo = cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs.backgroundColor !== 'transparent';
    return borda || fundo || cs.boxShadow !== 'none';
  });
  const nome = (e) => `${e.tagName.toLowerCase()}${e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/).join('.') : ''} "${(e.textContent || '').trim().slice(0, 30)}"`;
  const achados = [];
  for (let i = 0; i < caixas.length; i++) for (let j = i + 1; j < caixas.length; j++) {
    const a = caixas[i], b = caixas[j];
    if (a.contains(b) || b.contains(a)) continue;
    const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
    const gx = Math.max(rb.left - ra.right, ra.left - rb.right), gy = Math.max(rb.top - ra.bottom, ra.top - rb.bottom);
    if (gx < 8 && gy < 8) achados.push(`${nome(a)} e ${nome(b)} (${Math.round(Math.max(gx, gy))} px)`);
  }
  // Varredura de 12/11/2026. Uma "caixa" é o mesmo que acima (fundo, borda ou sombra, com cantos arredondados), sem os campos.
  const vis = (e) => { const cs = getComputedStyle(e); const b = e.getBoundingClientRect(); return cs.display !== 'none' && cs.visibility !== 'hidden' && b.width > 0 && b.height > 0; };
  const caixa = (e) => caixas.includes(e) && !/^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(e.tagName);
  const noFluxo = (e) => vis(e) && getComputedStyle(e).position !== 'absolute';
  const antes = (e) => { let x = e.previousElementSibling; while (x && !noFluxo(x)) x = x.previousElementSibling; return x; };
  const depois = (e) => { let x = e.nextElementSibling; while (x && !noFluxo(x)) x = x.nextElementSibling; return x; };
  const cartao = (f) => caixa(f) || (f.children.length === 1 && caixa(f.children[0]));
  const gradeDeCartoes = (g) => getComputedStyle(g).display === 'grid' && g.children.length > 1 && [...g.children].filter(vis).every(cartao);
  const sozinhos = [], titulos = [], colados = [], margens = [], dobrados = [];
  for (const g of document.querySelectorAll('main *')) {
    if (!vis(g) || !gradeDeCartoes(g)) continue;
    const filhos = [...g.children].filter(vis);
    if (filhos.length < 3) continue;
    const linhas = new Map();
    for (const f of filhos) { const t = Math.round(f.getBoundingClientRect().top); linhas.set(t, [...(linhas.get(t) || []), f]); }
    const ultima = [...linhas.entries()].sort((a, b) => a[0] - b[0]).pop()[1];
    if (linhas.size > 1 && ultima.length === 1 && ultima[0].getBoundingClientRect().width < g.getBoundingClientRect().width * 0.9) sozinhos.push(`${nome(g)} (${filhos.length} cartões)`);
  }
  // O rodapé não tem cartões, mas uma coluna de links sozinha na última linha é o mesmo erro (revisão de 12/11/2026).
  for (const g of document.querySelectorAll('.rodape-grade')) {
    const filhos = [...g.children].filter(vis);
    const linhas = new Map();
    for (const f of filhos) { const t = Math.round(f.getBoundingClientRect().top); linhas.set(t, [...(linhas.get(t) || []), f]); }
    const ultima = [...linhas.entries()].sort((a, b) => a[0] - b[0]).pop()?.[1] || [];
    if (linhas.size > 1 && ultima.length === 1 && ultima[0].getBoundingClientRect().width < g.getBoundingClientRect().width * 0.9) sozinhos.push(`rodapé (${filhos.length} colunas)`);
  }
  for (const h of document.querySelectorAll('main h2')) {
    const a = vis(h) && antes(h), d = vis(h) && depois(h);
    if (!a || !d) continue;
    const r = h.getBoundingClientRect();
    const acima = r.top - a.getBoundingClientRect().bottom, abaixo = d.getBoundingClientRect().top - r.bottom;
    if (acima < 24 || acima < abaixo * 1.5) titulos.push(`${nome(h)} (${Math.round(acima)} px acima, ${Math.round(abaixo)} px até o conteúdo)`);
  }
  for (const e of document.querySelectorAll('main *')) {
    if (!caixa(e) && !(vis(e) && gradeDeCartoes(e))) continue;
    for (const [x, lado] of [[depois(e), 'depois'], [antes(e), 'antes']]) {
      if (!x || caixa(x) || gradeDeCartoes(x) || (lado === 'antes' && /^H[1-6]$/.test(x.tagName))) continue;
      const a = e.getBoundingClientRect(), b = x.getBoundingClientRect();
      const gy = lado === 'depois' ? b.top - a.bottom : a.top - b.bottom;
      if (gy < 8 && Math.max(b.left - a.right, a.left - b.right) < 8) colados.push(`${nome(e)} e ${nome(x)} (${Math.round(gy)} px)`);
    }
  }
  for (const c of caixas) {
    const cs = getComputedStyle(c);
    if (!caixa(c) || c.tagName === 'A' || cs.display.startsWith('inline') || parseFloat(cs.paddingTop) < 4) continue;
    const filhos = [...c.children].filter(noFluxo);
    if (!filhos.length) continue;
    const mt = parseFloat(getComputedStyle(filhos[0]).marginTop), mb = parseFloat(getComputedStyle(filhos[filhos.length - 1]).marginBottom);
    if (mt > 2 || mb > 2) margens.push(`${nome(c)} (${mt} px em cima, ${mb} px embaixo)`);
  }
  for (const s of document.querySelectorAll('main > section:not(.capa)')) {
    const p = depois(s);
    if (!p || p.tagName !== 'SECTION') continue;
    const a = getComputedStyle(s), b = getComputedStyle(p);
    if (a.backgroundColor === b.backgroundColor && !(parseFloat(a.borderBottomWidth) > 0) && !(parseFloat(b.borderTopWidth) > 0) && parseFloat(a.paddingBottom) > 0 && parseFloat(b.paddingTop) > 0) dobrados.push(`${nome(s)} e ${nome(p)}`);
  }
  const tres = (l) => l.slice(0, 3);
  return { achados: achados.slice(0, 3), largo: document.documentElement.scrollWidth > window.innerWidth + 1, sozinhos: tres(sozinhos), titulos: tres(titulos), colados: tres(colados), margens: tres(margens), dobrados: tres(dobrados) };
}

(async () => {
  const CALC = catalogo().CALC;
  const { dir, saida } = gerarSiteLigado();
  const chamadas = [];
  // O Banco Central simulado (D-106): o worker consulta as séries do SGS por GET, sem corpo; cada consulta fica em `chamadasBcb`.
  const chamadasBcb = [];
  const respostaDoBanco = (url, opcoes) => {
    chamadasBcb.push({ url: String(url), cabecalhos: opcoes && opcoes.headers });
    const chave = Object.keys(SGS).find((k) => String(url).includes(k));
    return new Response(JSON.stringify(chave ? SGS[chave] : []), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const fetchSimulado = async (url, opcoes) => {
    if (String(url).startsWith('https://api.bcb.gov.br/')) return respostaDoBanco(url, opcoes);
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

    // 1. As doze calculadoras (as dez do app e as duas que só o site mostra, D-106): o que aparece na tela é o que o core calcula, e cada
    // página carrega só o que usa.
    const PESADOS = ['series.js', 'cards.js', 'committed.js', 'simulate.js', 'validation.js', 'dia-util.js'];
    const LEVES = ['parcelado-ou-a-vista', 'custo-por-ano', 'custo-da-divida', 'quitar-antes', 'multa-e-juros', 'reserva', 'juntar-para-objetivo', 'dividir-contas', 'rendimento-cdi'];
    const pesos = {};
    for (const rot of roteiros(CALC)) {
      const p = await pagina();
      const modulos = [];
      p.on('response', async (r) => {
        // O script do tema do site (D-115), em todas as páginas, é um script comum do <head>, não um módulo da calculadora.
        if (r.url().endsWith('.js') && !r.url().endsWith('/js/tema.js')) modulos.push({ url: r.url(), bytes: (await r.body()).length });
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
      ok('comece aqui: sem script (só dados estruturados, se houver, e o tema do site) e sem formulário', (await p.$$eval('script', (ss) => ss.filter((x) => x.type !== 'application/ld+json' && !x.src.endsWith('/js/tema.js')).length)) === 0 && (await p.$$('form')).length === 0);
      await p.close();
    }

    // 7b. Indicadores oficiais (D-106). Vem antes da varredura de espaçamento (que abre todas as páginas e chamaria /api/indicadores muitas
    // vezes): aqui a contagem de pedidos é limpa.
    {
      // O texto como a pessoa lê (innerText respeita os blocos), com o espaço fixo entre "R$" e o valor virando espaço comum.
      const textoDe = (p, sel) => p.$eval(sel, (e) => (e.innerText || e.textContent).replace(/\s+/g, ' ').trim());
      const numerosDe = (p) => p.$$eval('[data-indicador] [data-campo="numero"]', (es) => es.map((e) => e.textContent.replace(/\s+/g, ' ')));
      // Sem JavaScript: o retrato da geração, com a data, a hora e a fonte, e o aviso de mercado no rodapé.
      const semJs = await navegador.newContext({ javaScriptEnabled: false });
      const s0 = await semJs.newPage();
      await s0.goto(`${origem}/indicadores/`);
      const estado = await textoDe(s0, '.indicadores-estado');
      ok('indicadores, sem JavaScript: o retrato da geração, com a hora e "Fonte: Banco Central do Brasil"', estado === 'Retrato de 23/10/2026 às 10:00, horário de Brasília. Fonte: Banco Central do Brasil.', estado);
      const numeros = await numerosDe(s0);
      ok('indicadores, sem JavaScript: os cinco números do retrato', JSON.stringify(numeros) === JSON.stringify(['14,25%', '14,15%', '5,10%', '0,6601%', 'R$ 5,4321']), JSON.stringify(numeros));
      ok('indicadores: o dólar aparece como "Dólar PTAX (Banco Central)", com a data do fechamento', (await textoDe(s0, '[data-indicador="ptax"]')).startsWith('Dólar PTAX (Banco Central) R$ 5,4321 por dólar, na venda Fechamento de 22/10/2026'), await textoDe(s0, '[data-indicador="ptax"]'));
      ok('indicadores: o aviso de mercado no rodapé', (await textoDe(s0, '.rodape-aviso')) === 'Conteúdo educativo. Não é recomendação nem análise de valores mobiliários.');
      await s0.goto(`${origem}/indicadores/selic-hoje`);
      ok('Selic hoje, sem JavaScript: o número do retrato e a data', (await textoDe(s0, '.indicador-capa-numero')) === '14,25% ao ano' && (await textoDe(s0, '.indicador-capa')).includes('Meta em vigor em 23/10/2026'));
      await semJs.close();

      // Com JavaScript: uma pergunta ao próprio site, que consulta o Banco Central (simulado) no servidor e troca os números e a hora.
      const p = await pagina();
      const daApi = [];
      p.on('request', (q) => q.url().startsWith(`${origem}/api/`) && daApi.push(q.url()));
      const respostaDaApi = p.waitForResponse((r) => r.url() === `${origem}/api/indicadores`);
      const antes = chamadasBcb.length;
      await p.goto(`${origem}/indicadores/`);
      const resposta = await respostaDaApi;
      await p.waitForSelector('[data-painel][data-atualizado="sim"]');
      const atualizados = await numerosDe(p);
      ok('indicadores, com JavaScript: os números trocam pelos que o servidor buscou no Banco Central', JSON.stringify(atualizados) === JSON.stringify(['15,00%', '14,90%', '4,91%', '0,6719%', 'R$ 5,3870']), JSON.stringify(atualizados));
      ok('indicadores, com JavaScript: "Atualizado em", com a hora da consulta, e a fonte', /^Atualizado em \d{2}\/\d{2}\/\d{4} às \d{2}:\d{2}, horário de Brasília\. Fonte: Banco Central do Brasil\.$/.test(await textoDe(p, '.indicadores-estado')), await textoDe(p, '.indicadores-estado'));
      ok('indicadores: o IPCA traz a linha do último mês', (await textoDe(p, '[data-indicador="ipca"] [data-campo="extra"]')) === 'Setembro de 2026: 0,40% no mês', await textoDe(p, '[data-indicador="ipca"] [data-campo="extra"]'));
      ok('/api/indicadores: o servidor consultou as cinco séries do SGS, só com Accept e User-Agent do site', chamadasBcb.length - antes === 5 && chamadasBcb.slice(antes).every((c) => /^https:\/\/api\.bcb\.gov\.br\/dados\/serie\/bcdata\.sgs\.(432|12|433|195|1)\/dados\?formato=json/.test(c.url) && JSON.stringify(c.cabecalhos) === JSON.stringify({ Accept: 'application/json', 'User-Agent': 'clarevo-site' })), JSON.stringify(chamadasBcb.slice(antes)));
      ok('/api/indicadores: JSON, guarda de 15 minutos no navegador e a política de segurança do site', resposta.headers()['content-type'] === 'application/json; charset=utf-8' && resposta.headers()['cache-control'] === 'public, max-age=900' && /connect-src 'self'/.test(resposta.headers()['content-security-policy'] || ''));
      // Não fica perguntando: duas horas depois (o relógio da página adiantado), continua um pedido só.
      await p.clock.fastForward('02:00:00');
      await p.waitForTimeout(300);
      ok('indicadores: a página pergunta uma vez só, ao abrir, e não repete com o tempo', daApi.length === 1, daApi.join(' | '));
      const cabecalhosDaPagina = (await p.request.get(`${origem}/indicadores/`)).headers();
      ok('indicadores: a página é servida com a política de segurança só do próprio site (script e conexão)', /script-src 'self'/.test(cabecalhosDaPagina['content-security-policy'] || '') && /connect-src 'self'/.test(cabecalhosDaPagina['content-security-policy'] || '') && !/https?:/.test(cabecalhosDaPagina['content-security-policy'] || ''));
      ok('indicadores: sem cookie, armazenamento ou parâmetro na URL', await p.evaluate(() => localStorage.length === 0 && sessionStorage.length === 0 && document.cookie === '' && location.search === ''));
      // A cópia de uma hora: outro pedido (fora do navegador, sem a guarda dele) não consulta o Banco Central de novo.
      const depois = chamadasBcb.length;
      const deNovo = await ctx.request.get(`${origem}/api/indicadores`);
      ok('/api/indicadores: o segundo pedido sai da cópia, sem consultar o Banco Central', deNovo.status() === 200 && chamadasBcb.length === depois, `${deNovo.status()} ${chamadasBcb.length - depois}`);
      ok('/api/indicadores: só GET e HEAD', (await ctx.request.post(`${origem}/api/indicadores`, { data: 'x' })).status() === 405);
      // A página de um indicador também troca o número.
      await p.goto(`${origem}/indicadores/dolar-ptax-hoje`);
      await p.waitForSelector('[data-painel][data-atualizado="sim"]');
      ok('Dólar PTAX hoje: o número troca e o título continua "Dólar PTAX hoje", sem cotação ao vivo', (await textoDe(p, '.indicador-capa-numero')) === 'R$ 5,3870 por dólar, na venda' && (await textoDe(p, 'h1')) === 'Dólar PTAX hoje' && (await textoDe(p, 'main')).includes('Não é cotação ao vivo.'));
      await p.close();

      // A fonte fora do ar: um servidor novo (worker sem cópia), com o Banco Central respondendo 503. A página fica com o retrato.
      const foraDoAr = await servir(saida, { hostDoSite: true, fetchDoWorker: async () => new Response('fora do ar', { status: 503 }) });
      try {
        const q = await ctx.newPage();
        const erros = [];
        q.on('pageerror', (e) => erros.push(e.message));
        // O navegador anota no console o 503 da própria API (é o esperado aqui); qualquer outra mensagem é problema.
        q.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && !/status of 503/.test(m.text()) && erros.push(m.text()));
        const de503 = q.waitForResponse((r) => r.url().endsWith('/api/indicadores'));
        await q.goto(`${foraDoAr.url}/indicadores/`);
        const r503 = await de503;
        await q.waitForTimeout(300);
        const ficou = await numerosDe(q);
        ok('indicadores, fonte fora do ar: a API responde 503 e a página fica com o retrato da geração, sem erro', r503.status() === 503 && JSON.stringify(ficou) === JSON.stringify(['14,25%', '14,15%', '5,10%', '0,6601%', 'R$ 5,4321']) && (await q.$('[data-atualizado]')) === null && erros.length === 0, `${r503.status()} ${JSON.stringify(ficou)} ${erros.join(' | ')}`);
        ok('indicadores, fonte fora do ar: a linha da hora continua dizendo de quando é o retrato', (await textoDe(q, '.indicadores-estado')).startsWith('Retrato de 23/10/2026 às 10:00'));
        await q.close();
      } finally {
        await foraDoAr.fechar();
      }

      // Glossário, explicações e resumo semanal: o aviso no rodapé, links simples para fora (sem imagem nem script de outro site).
      const g = await pagina();
      await g.goto(`${origem}/indicadores/glossario`);
      const termos = await g.$$eval('.termo h2', (es) => es.map((e) => e.textContent));
      ok('glossário: os termos pedidos, com link para Aprender', ['CDI', 'Come-cotas', 'FGC', 'IOF', 'IPCA', 'IR regressivo', 'Liquidez', 'Marcação a mercado', 'PTAX', 'Selic'].every((t) => termos.includes(t)) && (await g.$('a[href="../aprender/fgc.html"]')) !== null, termos.join(', '));
      await g.goto(`${origem}/noticias/semana-${HOJE}`);
      const noticia = await g.evaluate(() => ({ imagens: document.querySelectorAll('main img').length, scripts: [...document.scripts].filter((x) => x.type !== 'application/ld+json' && !x.src.endsWith('/js/tema.js')).length, link: [...document.querySelectorAll('main a[href^="https://"]')].map((a) => ({ href: a.href, rel: a.rel })) }));
      ok('resumo semanal: a edição de teste abre, com link simples para a matéria (noopener), sem imagem nem script', noticia.imagens === 0 && noticia.scripts === 0 && noticia.link.length === 1 && noticia.link[0].href === 'https://noticias.exemplo.test/copom' && /noopener/.test(noticia.link[0].rel), JSON.stringify(noticia));
      ok('resumo semanal: o aviso de mercado no rodapé e o link no rodapé de todas as páginas', (await textoDe(g, '.rodape-aviso')) === 'Conteúdo educativo. Não é recomendação nem análise de valores mobiliários.' && (await g.$('footer a[href="index.html"]')) !== null);
      await g.goto(`${origem}/sobre`);
      ok('resumo semanal: com uma edição, o rodapé ganha "Resumo semanal"', (await g.$('footer a[href="noticias/index.html"]')) !== null);
      await g.close();
    }

    // 7c. Vídeos de uso do app (D-114 e D-115): cada um no bloco que mostra (a capa e três cartões da página inicial, seis recursos e o
    // cartão do tema em O app), do próprio site, sem controles de player nem `autoplay`, sem som e em repetição. O script do site toca o
    // vídeo que aparece na tela (pelo menos metade) e pausa o que sai; nada de vídeo baixa antes de aparecer; o botão redondo pausa e toca,
    // pelo mouse e pelo teclado, com nome acessível; com movimento reduzido ou economia de dados, nada toca até a pessoa pedir; sem
    // JavaScript, fica a capa.
    {
      const LUGARES = {
        '/': [['.capa', 'O Resumo do mês'], ['article.cartao:has(h3:text-is("Anotar e ver o mês"))', 'Anotar um gasto'], ['article.cartao:has(h3:text-is("Contas, cartões e gastos fixos"))', 'Importar fatura por print'], ['article.cartao:has(h3:text-is("Metas e reserva"))', 'Metas']],
        '/app/': [['#resumo', 'O Resumo do mês'], ['#anotar', 'Anotar um gasto'], ['#contas', 'O Calendário do mês'], ['#cartoes', 'Importar fatura por print'], ['#metas', 'Metas'], ['#investir', 'Investir'], ['article.cartao:has(h3:text-is("Tema claro ou escuro"))', 'Do tema escuro ao claro']],
      };
      const p = await pagina();
      const deVideo = [];
      p.on('request', (q) => /\/videos\//.test(q.url()) && deVideo.push(q.url()));
      const lerVideos = () => p.$$eval('figure[data-video] video', (vs) => vs.map((v) => ({
        titulo: v.closest('figure').dataset.titulo, controls: v.controls || v.hasAttribute('controls'), autoplay: v.hasAttribute('autoplay'), loop: v.loop, muted: v.muted, preload: v.getAttribute('preload'),
        paused: v.paused, tempo: v.currentTime, poster: v.poster, largura: v.getAttribute('width'), altura: v.getAttribute('height'),
        fontes: [...v.querySelectorAll('source')].map((f) => [f.src, f.type]), reserva: v.querySelector('a') ? v.querySelector('a').href : '',
        nome: document.getElementById(v.getAttribute('aria-labelledby'))?.textContent || '',
        descricao: document.getElementById(v.getAttribute('aria-describedby'))?.textContent || '',
        legenda: v.closest('figure').querySelector('figcaption')?.firstChild?.textContent || '',
        botao: v.closest('figure').querySelector('button.video-botao')?.getAttribute('aria-label') || '',
      })));
      for (const caminho of ['/', '/app/']) {
        deVideo.length = 0;
        await p.goto(`${origem}${caminho}`);
        await p.waitForTimeout(1500);
        const vs = await lerVideos();
        ok(`vídeos (${caminho}): ${LUGARES[caminho].length} vídeos, nenhuma seção "Veja o app em uso"`, vs.length === LUGARES[caminho].length && (await p.$('#em-uso')) === null, `${vs.length}`);
        const lugares = [];
        for (const [bloco, titulo] of LUGARES[caminho]) lugares.push([bloco, await p.locator(bloco).first().locator(`figure[data-video][data-titulo="${titulo}"]`).count()]);
        ok(`vídeos (${caminho}): cada vídeo no bloco que ele mostra`, lugares.every(([, n]) => n === 1), JSON.stringify(lugares));
        ok(`vídeos (${caminho}): nenhum com controles de player nem autoplay; todos sem som, em repetição e com preload="none"`, vs.every((v) => !v.controls && !v.autoplay && v.muted && v.loop && v.preload === 'none'), JSON.stringify(vs.map((v) => [v.titulo, v.controls, v.autoplay, v.muted, v.loop, v.preload])));
        ok(`vídeos (${caminho}): capa, WebM e MP4 do próprio site, com largura, altura e o link para o MP4 dentro do vídeo`, vs.every((v) => v.poster.startsWith(`${origem}/imagens/video-`) && v.largura === '720' && v.altura === '1560' &&
          v.fontes.length === 2 && v.fontes[0][1] === 'video/webm' && v.fontes[1][1] === 'video/mp4' && v.fontes.every(([u]) => u.startsWith(`${origem}/videos/`)) && v.reserva === v.fontes[1][0]), JSON.stringify(vs[0]));
        ok(`vídeos (${caminho}): cada um com nome, a legenda "Tela da demonstração, com dados fictícios", a descrição em texto para leitor de tela e o botão de pausar e tocar`,
          vs.every((v) => v.nome === `Vídeo: ${v.titulo}` && v.legenda === 'Tela da demonstração, com dados fictícios' && v.descricao.length > 120 && /^(Pausar|Tocar) o vídeo: /.test(v.botao) && v.botao.endsWith(v.titulo)), JSON.stringify(vs.map((v) => [v.nome, v.legenda, v.descricao.length, v.botao])));
        const capas = await Promise.all(vs.map((v) => ctx.request.get(v.poster)));
        ok(`vídeos (${caminho}): as capas carregam (PNG, guardadas por um ano)`, capas.every((r) => r.ok() && r.headers()['content-type'] === 'image/png' && /immutable/.test(r.headers()['cache-control'] || '')));
        ok(`vídeos (${caminho}): só baixa vídeo do que aparece na tela`, deVideo.every((u) => u.startsWith(`${origem}/videos/`)) && (caminho !== '/' || deVideo.every((u) => /\/videos\/resumo-do-mes\./.test(u))), deVideo.join(' | '));
      }
      // Na página inicial, em 1280 px, o vídeo da capa aparece inteiro ao abrir: ele toca sozinho (o WebM do próprio site), e os de baixo
      // ficam parados no começo. (Em 390 px ele começa mais abaixo da dobra e toca quando metade dele aparece.)
      await p.setViewportSize({ width: 1280, height: 900 });
      await p.goto(`${origem}/`);
      const tempoDe = (sel) => p.$eval(sel, (v) => ({ paused: v.paused, tempo: v.currentTime, src: v.currentSrc, erro: v.error && v.error.code }));
      await p.waitForFunction(() => document.querySelector('.capa video').currentTime > 0.5, null, { timeout: 15000 }).catch(() => {});
      const capa = await tempoDe('.capa video');
      const parados = await p.$$eval('main > section:not(.capa) figure[data-video] video', (vs) => vs.every((v) => v.paused && v.currentTime === 0));
      ok('vídeos: o da capa toca sozinho ao abrir a página (WebM do próprio site), sem erro, e os de baixo continuam parados', !capa.paused && capa.tempo > 0.5 && !capa.erro && capa.src.startsWith(`${origem}/videos/resumo-do-mes.`) && capa.src.endsWith('.webm') && parados, JSON.stringify(capa));
      // Rolar até um cartão: o vídeo dele começa, e o da capa, fora da tela, pausa.
      const cartao = 'article.cartao:has(h3:text-is("Metas e reserva")) video';
      await p.locator(cartao).evaluate((v) => v.scrollIntoView({ block: 'center' }));
      await p.waitForFunction(() => document.querySelector('[data-titulo="Metas"] video').currentTime > 0.5, null, { timeout: 15000 }).catch(() => {});
      const doCartao = await p.locator(cartao).evaluate((v) => ({ paused: v.paused, tempo: v.currentTime }));
      const capaFora = await tempoDe('.capa video');
      ok('vídeos: ao rolar, o vídeo que aparece toca e o que saiu da tela pausa', !doCartao.paused && doCartao.tempo > 0.5 && capaFora.paused, JSON.stringify({ doCartao, capaFora }));
      // O botão de pausar: nome acessível, 44 px, troca o nome; a pausa da pessoa vale mesmo depois de rolar para longe e voltar.
      const botao = p.locator('[data-titulo="Metas"] button.video-botao');
      const antes = { nome: await botao.getAttribute('aria-label'), caixa: await botao.boundingBox() };
      await botao.click();
      await p.waitForTimeout(300);
      const pausado = { paused: await p.locator(cartao).evaluate((v) => v.paused), nome: await botao.getAttribute('aria-label') };
      await p.evaluate(() => window.scrollTo(0, 0));
      await p.waitForTimeout(600);
      await p.locator(cartao).evaluate((v) => v.scrollIntoView({ block: 'center' }));
      await p.waitForTimeout(900);
      const continuaPausado = await p.locator(cartao).evaluate((v) => v.paused);
      const foraDaTela = await p.$$eval('figure[data-video]', (fs) => fs.map((f) => {
        const m = f.querySelector('.celular-moldura').getBoundingClientRect();
        const b = f.querySelector('button.video-botao').getBoundingClientRect();
        const legenda = f.querySelector('figcaption');
        return { titulo: f.dataset.titulo, fora: b.top >= m.bottom, naLegenda: legenda.contains(f.querySelector('button.video-botao')), texto: f.querySelector('button.video-botao').textContent };
      }));
      ok('vídeos: o botão "Pausar" ou "Tocar" fica embaixo da legenda, fora da tela do celular, nunca por cima do app', foraDaTela.length === 4 && foraDaTela.every((x) => x.fora && x.naLegenda && /^(Pausar|Tocar)$/.test(x.texto)), JSON.stringify(foraDaTela));
      ok('vídeos: o botão "Pausar o vídeo: Metas" (44 px) pausa, passa a "Tocar o vídeo: Metas" e a pausa continua depois de rolar para longe e voltar',
        antes.nome === 'Pausar o vídeo: Metas' && antes.caixa && antes.caixa.width >= 44 && antes.caixa.height >= 44 && pausado.paused && pausado.nome === 'Tocar o vídeo: Metas' && continuaPausado, JSON.stringify({ antes, pausado, continuaPausado }));
      // Pelo teclado: Tab chega ao botão, com foco visível, e Espaço toca de novo.
      await botao.focus();
      const foco = await botao.evaluate((b) => { const cs = getComputedStyle(b); return { visivel: b.matches(':focus-visible') || document.activeElement === b, contorno: cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 2 }; });
      await botao.press('Space');
      await p.waitForTimeout(800);
      const depoisDoEspaco = { paused: await p.locator(cartao).evaluate((v) => v.paused), nome: await botao.getAttribute('aria-label'), ativo: await p.evaluate(() => document.activeElement && document.activeElement.className) };
      ok('vídeos: pelo teclado, o botão recebe foco e Espaço toca o vídeo de novo, com o nome "Pausar o vídeo: Metas"', foco.visivel && !depoisDoEspaco.paused && depoisDoEspaco.nome === 'Pausar o vídeo: Metas', JSON.stringify({ foco, depoisDoEspaco }));
      await p.setViewportSize({ width: 390, height: 900 });
      await p.close();
      // O MP4 (para os navegadores que não tocam WebM): tipo certo, pedaço com 206 e a política de segurança com media-src 'self'.
      const htmlDoApp = await (await ctx.request.get(`${origem}/app/`)).text();
      const endereco = /<source src="\.\.\/(videos\/anotar-gasto\.[0-9a-f]{10}\.mp4)"/.exec(htmlDoApp)?.[1];
      const inteiro = await ctx.request.get(`${origem}/${endereco}`);
      const pedaco = await ctx.request.get(`${origem}/${endereco}`, { headers: { Range: 'bytes=0-99' } });
      ok('vídeos: o MP4 sai como video/mp4, guardado por um ano, com a política de segurança que aceita vídeo só do próprio site', inteiro.ok() && inteiro.headers()['content-type'] === 'video/mp4' &&
        /immutable/.test(inteiro.headers()['cache-control'] || '') && /media-src 'self'/.test(inteiro.headers()['content-security-policy'] || ''), JSON.stringify(inteiro.headers()));
      ok('vídeos: o servidor responde um pedaço do arquivo (206), como o navegador pede', pedaco.status() === 206 && (await pedaco.body()).length === 100 && (await pedaco.body()).subarray(4, 8).toString('latin1') === 'ftyp' && /^bytes 0-99\/\d+$/.test(pedaco.headers()['content-range'] || ''), `${pedaco.status()} ${pedaco.headers()['content-range']}`);
      // Movimento reduzido (page.emulateMedia) e economia de dados: nada toca sozinho e nada de vídeo baixa; o botão toca a pedido.
      for (const [nome, preparar] of [
        ['movimento reduzido', async (q) => q.emulateMedia({ reducedMotion: 'reduce' })],
        ['economia de dados', async (q) => q.addInitScript(() => Object.defineProperty(Navigator.prototype, 'connection', { configurable: true, get: () => ({ saveData: true, addEventListener() {} }) }))],
      ]) {
        const calmo = await navegador.newContext({ viewport: { width: 390, height: 900 } });
        const q = await calmo.newPage();
        const erros = [];
        q.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && erros.push(m.text()));
        q.on('pageerror', (e) => erros.push(e.message));
        await preparar(q);
        const deVideoCalmo = [];
        q.on('request', (r) => /\/videos\//.test(r.url()) && deVideoCalmo.push(r.url()));
        await q.goto(`${origem}/`);
        await q.waitForTimeout(2000);
        const tudoParado = await q.$$eval('figure[data-video] video', (vs) => vs.length === 4 && vs.every((v) => v.paused && v.currentTime === 0));
        const nomeAntes = await q.getAttribute('.capa button.video-botao', 'aria-label');
        const baixadosAntes = deVideoCalmo.length;
        await q.click('.capa button.video-botao');
        await q.waitForFunction(() => document.querySelector('.capa video').currentTime > 0.5, null, { timeout: 15000 }).catch(() => {});
        const pedido = await q.$eval('.capa video', (v) => ({ paused: v.paused, tempo: v.currentTime }));
        ok(`vídeos com ${nome}: nada toca sozinho nem baixa até a pessoa tocar no botão "Tocar o vídeo", que toca o vídeo`, tudoParado && baixadosAntes === 0 && deVideoCalmo.length > 0 && nomeAntes === 'Tocar o vídeo: O Resumo do mês' && !pedido.paused && pedido.tempo > 0.5 && erros.length === 0, JSON.stringify({ tudoParado, baixadosAntes, nomeAntes, pedido, erros }));
        await calmo.close();
      }
      // Sem JavaScript: a capa aparece, sem botão, e nada quebra.
      const semJs = await navegador.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 900 } });
      const r = await semJs.newPage();
      const errosSemJs = [];
      r.on('pageerror', (e) => errosSemJs.push(e.message));
      await r.goto(`${origem}/app/`);
      const semScript = await r.evaluate(() => ({ videos: document.querySelectorAll('figure[data-video] video').length, botoes: document.querySelectorAll('.video-botao').length, capas: [...document.querySelectorAll('figure[data-video] video')].every((v) => v.poster.includes('/imagens/video-')) }));
      ok('vídeos sem JavaScript: as capas aparecem, sem botão e sem erro', semScript.videos === 7 && semScript.botoes === 0 && semScript.capas && errosSemJs.length === 0, JSON.stringify({ semScript, errosSemJs }));
      await semJs.close();
      // Nada passa da largura da tela em 320, 390 e 1280 px, na página inicial, em O app e numa matéria.
      const q = await pagina();
      const largas = [];
      for (const largura of [320, 390, 1280]) {
        await q.setViewportSize({ width: largura, height: 900 });
        for (const c of ['', 'app/', POSTS[3]]) {
          await q.goto(`${origem}/${c}`);
          if (await q.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) largas.push(`${c || 'início'} em ${largura} px`);
        }
      }
      ok('vídeos e Fontes: nada passa da largura da tela em 320, 390 e 1280 px (início, O app e uma matéria)', largas.length === 0, largas.join(' | '));
      await q.setViewportSize({ width: 390, height: 900 });
      await q.close();
    }

    // 7c2. As fontes das matérias (D-115): "Na Clarevo" e, quando há fonte de fora, "Fontes oficiais", em listas sem numeração e sem lista
    // dentro de lista; cada link com texto; títulos em ordem (h2 Fontes, h3 de cada grupo); a linha da publicação e "Voltar para Novidades".
    {
      const p = await pagina();
      const achados = [];
      for (const post of POSTS) {
        await p.goto(`${origem}/${post}`);
        const f = await p.evaluate(() => {
          const s = document.querySelector('.post-fontes');
          return {
            titulos: [...s.querySelectorAll('h2, h3')].map((h) => `${h.tagName}:${h.textContent}`),
            aninhadas: s.querySelectorAll('li ul, li ol, ol').length,
            semTexto: [...s.querySelectorAll('a')].filter((a) => a.textContent.trim().length < 3).length,
            externasSemOrganizacao: [...s.querySelectorAll('#fontes-externas + ul > li')].filter((li) => !li.querySelector('strong') || !li.querySelector('a[href^="https://"]') || !/consultada em \d{2}\/\d{2}\/\d{4}$/.test(li.textContent.trim())).length,
            temas: [...s.querySelectorAll('#fontes-clarevo + ul > li')].filter((li) => /Aprender:/.test(li.textContent)).map((li) => /revisado em \d{2}\/\d{2}\/\d{4}$/.test(li.textContent.trim())),
            revisao: Boolean(s.querySelector('.revisao')) && /corrigimos neste mesmo texto/.test(s.querySelector('.revisao').textContent),
            voltar: Boolean(document.querySelector('.voltar a[href="index.html"]')),
          };
        });
        const comExternas = /13o-salario|novembro/.test(post);
        const esperado = ['H2:Fontes', 'H3:Na Clarevo', ...(comExternas ? ['H3:Fontes oficiais'] : [])];
        if (JSON.stringify(f.titulos) !== JSON.stringify(esperado)) achados.push(`${post}: títulos ${JSON.stringify(f.titulos)}`);
        if (f.aninhadas || f.semTexto || f.externasSemOrganizacao || !f.temas.every(Boolean) || !f.revisao || !f.voltar) achados.push(`${post}: ${JSON.stringify(f)}`);
      }
      ok(`novidades: em ${POSTS.length} matérias, as Fontes em "Na Clarevo" e "Fontes oficiais", sem numeração nem lista dentro de lista, com a organização, o título e a data de cada fonte`, achados.length === 0, achados.join(' | '));
      await p.close();
    }

    // 7c3. Planos (D-115): cada cartão da página inicial leva à página Planos, no plano dele; a página tem os dois planos, os recursos com
    // links que abrem, como funciona e as perguntas; nada passa da largura da tela.
    {
      const p = await pagina();
      await p.goto(`${origem}/`);
      const cartoes = await p.$$eval('section[aria-labelledby="planos"] article.plano-link', (as) => as.map((a) => ({ links: a.querySelectorAll('a, button, input').length, nome: a.querySelector('a').textContent, href: a.querySelector('a').getAttribute('href') })));
      ok('planos: os dois cartões da página inicial com um link só cada, com nome claro, para planos.html#individual e #familia', JSON.stringify(cartoes) === JSON.stringify([{ links: 1, nome: 'Ver o que o plano Individual inclui', href: 'planos.html#individual' }, { links: 1, nome: 'Ver o que o plano Família inclui', href: 'planos.html#familia' }]), JSON.stringify(cartoes));
      // Clicar no cartão (fora do texto do link) abre o plano na página Planos.
      const familia = p.locator('section[aria-labelledby="planos"] article.plano-link').nth(1);
      await familia.scrollIntoViewIfNeeded();
      const caixa = await familia.boundingBox();
      await p.mouse.click(caixa.x + caixa.width - 20, caixa.y + 20);
      await p.waitForURL(/\/planos(\.html)?#familia$/);
      const alvo = await p.evaluate(() => { const a = document.querySelector('#familia'); const r = a.getBoundingClientRect(); return { titulo: a.querySelector('h3').textContent, visivel: r.top >= 0 && r.top < window.innerHeight, alvo: a.matches(':target') }; });
      ok('planos: clicar em qualquer ponto do cartão Família abre a página Planos no plano Família', alvo.titulo === 'Família' && alvo.visivel && alvo.alvo, JSON.stringify(alvo));
      const secoes = await p.$$eval('main h2', (hs) => hs.map((h) => h.id));
      const links = await p.$$eval('#recursos ~ .grupos-recursos a, #recursos + p + .grupos-recursos a', (as) => as.map((a) => a.href));
      const quebrados = [];
      for (const l of links) {
        const [endereco, ancora] = l.split('#');
        const r = await ctx.request.get(endereco);
        if (!r.ok() || (ancora && !(await r.text()).includes(`id="${ancora}"`))) quebrados.push(l);
      }
      ok('planos: a página tem os dois planos, os recursos, como funciona e as perguntas, e os 14 links dos recursos abrem no lugar certo', JSON.stringify(secoes) === JSON.stringify(['comparar', 'recursos', 'como-funciona', 'perguntas']) && links.length === 14 && quebrados.length === 0, `${secoes} ${links.length} ${quebrados.join(' | ')}`);
      const largas = [];
      for (const largura of [320, 390, 1280]) {
        await p.setViewportSize({ width: largura, height: 900 });
        for (const c of ['', 'planos']) {
          await p.goto(`${origem}/${c}`);
          if (await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) largas.push(`${c || 'início'} em ${largura} px`);
        }
      }
      ok('planos: nada passa da largura da tela em 320, 390 e 1280 px (início e Planos)', largas.length === 0, largas.join(' | '));
      await p.close();
    }

    // 7c4. Celulares no centro dos cartões, "Quem vê os seus dados" em Segurança e a faixa de confiança da capa (D-115). Em 1280 px, a
    // moldura de cada celular fica no centro do cartão que a tem (início, O app, Para empresas) e, em Segurança, no centro da coluna dela,
    // ao lado dos quatro cartões em 2 x 2, com a mesma altura em cada linha. A faixa da capa (início e O app) é um link só para o bloco "O
    // que a Clarevo não faz" de Segurança, e as seções antigas saíram. Nada passa da largura da tela em 320, 390 e 1280 px.
    {
      const p = await pagina();
      await p.setViewportSize({ width: 1280, height: 900 });
      const fora = [];
      for (const c of ['', 'app/', 'empresas/', 'seguranca']) {
        await p.goto(`${origem}/${c}`);
        const r = await p.evaluate(() => [...document.querySelectorAll('.cartao > figure.celular, .com-celular > figure.celular')].map((f) => {
          const m = f.querySelector('.celular-moldura').getBoundingClientRect();
          const pai = f.parentElement;
          let caixa = pai.getBoundingClientRect();
          if (pai.classList.contains('com-celular')) {
            const colunas = getComputedStyle(pai).gridTemplateColumns.split(' ').map(parseFloat);
            const gap = parseFloat(getComputedStyle(pai).columnGap) || 0;
            caixa = { left: caixa.left + colunas[0] + gap, width: colunas[1] };
          }
          return { nome: (pai.querySelector('h3') || pai.querySelector('h2') || { textContent: pai.className }).textContent.trim().slice(0, 30), dif: Math.abs((m.left + m.width / 2) - (caixa.left + caixa.width / 2)) };
        }));
        if (!r.length) fora.push(`${c || 'início'}: nenhum celular em cartão`);
        for (const x of r) if (x.dif > 3) fora.push(`${c || 'início'}: ${x.nome} (${Math.round(x.dif)} px)`);
      }
      ok('celulares: em 1280 px, a moldura de cada celular fica no centro do cartão (início, O app, Para empresas) e da coluna dela (Segurança)', fora.length === 0, fora.join(' | '));
      await p.goto(`${origem}/seguranca`);
      const quemVe = await p.evaluate(() => {
        const g = document.querySelector('#quem-ve ~ .com-celular .grade');
        const cartoes = [...g.children].map((c) => c.getBoundingClientRect());
        const f = document.querySelector('#quem-ve ~ .com-celular > figure.celular').getBoundingClientRect();
        const linhas = {};
        for (const c of cartoes) (linhas[Math.round(c.top)] = linhas[Math.round(c.top)] || []).push(Math.round(c.height));
        const gr = g.getBoundingClientRect();
        return { n: cartoes.length, linhas: Object.values(linhas), dentro: g.querySelectorAll('figure, img').length, lado: f.left > gr.right, meio: Math.abs((f.top + f.height / 2) - (gr.top + gr.height / 2)) };
      });
      ok('segurança: "Quem vê os seus dados" com os quatro cartões em 2 x 2, da mesma altura em cada linha, sem imagem dentro, e o celular ao lado, no meio da altura', quemVe.n === 4 && quemVe.linhas.length === 2 && quemVe.linhas.every((l) => l.length === 2 && l[0] === l[1]) && quemVe.dentro === 0 && quemVe.lado && quemVe.meio < 40, JSON.stringify(quemVe));
      const faixas = [];
      for (const c of ['', 'app/']) {
        await p.goto(`${origem}/${c}`);
        faixas.push(await p.evaluate(() => {
          const f = document.querySelector('.capa .confianca');
          const a = f && f.querySelectorAll('a');
          return { links: a ? a.length : 0, href: a && a[0] ? a[0].getAttribute('href') : '', itens: f ? [...f.querySelectorAll('.confianca-item')].map((i) => i.textContent) : [], nome: a && a[0] ? a[0].textContent.replace(/\s+/g, ' ').trim() : '', antigas: document.querySelectorAll('#nao-e, #nao-faz').length };
        }));
      }
      ok('faixa de confiança: na capa do início e de O app, três frases num link só para Segurança (#nao-faz), com nome em frase para leitor de tela, e sem as seções antigas',
        faixas.every((f) => f.links === 1 && /seguranca\.html#nao-faz$/.test(f.href) && JSON.stringify(f.itens) === JSON.stringify(['Sem conexão com o seu banco', 'Não movimenta dinheiro nem oferece crédito', 'Não guarda os dados completos do cartão']) && /cartão\. Ver o que a Clarevo não faz, em Segurança e privacidade\.$/.test(f.nome) && f.antigas === 0), JSON.stringify(faixas));
      await p.click('.capa .confianca a');
      await p.waitForURL(/\/seguranca(\.html)?#nao-faz$/);
      ok('faixa de confiança: o link abre o bloco "O que a Clarevo não faz" de Segurança', (await p.textContent('#nao-faz')) === 'O que a Clarevo não faz' && (await p.$$eval('#nao-faz ~ .lista-nao-faz li', (l) => l.length)) === 5);
      const largas = [];
      for (const largura of [320, 390, 1280]) {
        await p.setViewportSize({ width: largura, height: 900 });
        for (const c of ['', 'app/', 'empresas/', 'seguranca']) {
          await p.goto(`${origem}/${c}`);
          const r = await p.evaluate(() => ({ largo: document.documentElement.scrollWidth > window.innerWidth + 1, faixa: [...document.querySelectorAll('.confianca-item')].some((i) => i.getBoundingClientRect().right > window.innerWidth) }));
          if (r.largo || r.faixa) largas.push(`${c || 'início'} em ${largura} px ${JSON.stringify(r)}`);
        }
      }
      ok('celulares, Segurança e faixa: nada passa da largura da tela em 320, 390 e 1280 px', largas.length === 0, largas.join(' | '));
      await p.setViewportSize({ width: 390, height: 900 });
      await p.close();
    }

    // 7c5. Espaço Negócio (D-115, a partir de D-113): o recurso em O app (#negocio), com a tela da demonstração no centro e o link da Ajuda;
    // o cartão de "Para quem é" na página inicial, que leva a ele; a frase de docs/52 em Planos; e a entrada na Ajuda, achada pela busca.
    {
      const p = await pagina();
      await p.goto(`${origem}/`);
      await p.click('section[aria-labelledby="para-quem"] a[href="app/index.html#negocio"]');
      await p.waitForURL(/\/app\/(index\.html)?#negocio$/);
      const recurso = await p.evaluate(() => {
        const a = document.querySelector('#negocio');
        const img = a.querySelector('figure.celular img');
        return { titulo: a.querySelector('h3').textContent, ajuda: a.querySelector('a[href="../ajuda/negocio.html#guia-negocio"]') !== null, img: img ? { ok: img.complete && img.naturalWidth > 0, alt: img.alt } : null, plano: /Incluído na assinatura: um negócio por pessoa, sem custo a mais\./.test(a.textContent) };
      });
      ok('Espaço Negócio: o cartão "Para quem tem um negócio" do início leva ao recurso em O app, com a tela Seu negócio, o link da Ajuda e "Incluído na assinatura"', recurso.titulo === 'Espaço Negócio' && recurso.ajuda && recurso.plano && recurso.img && /^Tela Seu negócio/.test(recurso.img.alt), JSON.stringify(recurso));
      await p.goto(`${origem}/planos`);
      ok('Espaço Negócio: em Planos, "Incluído na assinatura: um negócio por pessoa", fora das diferenças entre os planos', !/Negócio/.test(await p.textContent('#individual')) && /Incluído na assinatura: um negócio por pessoa, sem custo a mais\./.test(await p.textContent('#recursos ~ .grupos-recursos')) && (await p.$('a[href="ajuda/negocio.html#guia-negocio"]')) !== null);
      await p.goto(`${origem}/ajuda/`);
      const naAjuda = (await p.$('a[href="negocio.html"]')) !== null;
      await p.fill('input[type="search"]', 'negócio');
      await p.waitForFunction(() => [...document.querySelectorAll('.resultados a')].some((a) => /negocio\.html#guia-negocio/.test(a.getAttribute('href'))), null, { timeout: 5000 }).catch(() => {});
      const naBusca = await p.$$eval('.resultados a', (as) => as.some((a) => /negocio\.html#guia-negocio/.test(a.getAttribute('href'))));
      ok('Espaço Negócio: a Ajuda tem o tema no índice e a busca acha a entrada do guia', naAjuda && naBusca, `${naAjuda} ${naBusca}`);
      await p.close();
    }

    // 7c6. O feed RSS (D-115): o botão "Feed RSS" das Novidades abre a página que explica o RSS, com o endereço completo do feed num campo
    // só de leitura e "Copiar o endereço" (que copia de verdade), e "Abrir o arquivo do feed"; o feed é XML bem formado, com um item por
    // matéria, e o link de cada item abre a matéria no endereço sem ".html", como no Cloudflare Pages. Sem JavaScript, o botão não aparece.
    {
      const copiando = await navegador.newContext({ viewport: { width: 390, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] });
      const p = await copiando.newPage();
      const erros = [];
      p.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && erros.push(m.text()));
      p.on('pageerror', (e) => erros.push(e.message));
      await p.goto(`${origem}/novidades/`);
      await p.click('a.botao:text-is("Feed RSS")');
      await p.waitForURL(/\/novidades\/rss(\.html)?$/);
      const pagina = await p.evaluate(() => {
        const campo = document.getElementById('rss-endereco');
        const botao = document.querySelector('button[data-copiar]');
        return { titulo: document.querySelector('h1').textContent, valor: campo.value, soLeitura: campo.readOnly, rotulo: document.querySelector('label[for="rss-endereco"]').textContent, botao: botao && !botao.hidden ? botao.textContent : null, abrir: document.querySelector('main a[href="feed.xml"]') && !document.querySelector('main a.botao[href="feed.xml"]') ? document.querySelector('main a[href="feed.xml"]').textContent : null, alternativo: document.querySelector('link[rel="alternate"][type="application/rss+xml"]') !== null };
      });
      ok('rss: o botão "Feed RSS" abre "Acompanhar as Novidades por RSS", com o endereço completo do feed só de leitura, "Copiar o endereço" e o link de texto para o arquivo do feed',
        pagina.titulo === 'Acompanhar as Novidades por RSS' && /^https:\/\/[a-z0-9.-]+\/novidades\/feed\.xml$/.test(pagina.valor) && pagina.soLeitura && pagina.rotulo === 'Endereço do feed das Novidades' && pagina.botao === 'Copiar o endereço' && pagina.abrir === 'abrir o arquivo do feed' && pagina.alternativo, JSON.stringify(pagina));
      await p.focus('button[data-copiar]');
      await p.keyboard.press('Enter');
      await p.waitForFunction(() => document.getElementById('rss-estado').textContent.length > 0, null, { timeout: 5000 }).catch(() => {});
      const copiado = { estado: await p.textContent('#rss-estado'), area: await p.evaluate(() => navigator.clipboard.readText()) };
      ok('rss: "Copiar o endereço" (pelo teclado) copia o endereço do feed e avisa "Endereço copiado."', copiado.estado === 'Endereço copiado.' && copiado.area === pagina.valor && erros.length === 0, JSON.stringify({ copiado, erros }));
      const xml = await (await copiando.request.get(`${origem}/novidades/feed.xml`)).text();
      const lido = await p.evaluate((texto) => {
        const doc = new DOMParser().parseFromString(texto, 'application/xml');
        return { erro: doc.getElementsByTagName('parsererror').length, itens: [...doc.querySelectorAll('item')].map((i) => ({ titulo: i.querySelector('title').textContent, link: i.querySelector('link').textContent })) };
      }, xml);
      const abrem = [];
      for (const i of lido.itens) {
        const caminho = new URL(i.link).pathname;
        const r = await copiando.request.get(`${origem}${caminho}`);
        abrem.push(r.ok() && !/\.html$/.test(caminho) && (await r.text()).includes(`<h1>${i.titulo.replace(/&/g, '&amp;')}</h1>`));
      }
      ok(`rss: o feed é XML bem formado, com as ${POSTS.length} matérias, e o link de cada item abre a matéria no endereço sem ".html"`, lido.erro === 0 && lido.itens.length === POSTS.length && abrem.every(Boolean), JSON.stringify({ erro: lido.erro, n: lido.itens.length, abrem }));
      await copiando.close();
      const semJs = await navegador.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 900 } });
      const q = await semJs.newPage();
      await q.goto(`${origem}/novidades/rss`);
      ok('rss sem JavaScript: o campo com o endereço continua, e o botão de copiar não aparece', await q.evaluate(() => document.getElementById('rss-endereco').value.endsWith('/novidades/feed.xml') && !document.querySelector('button[data-copiar]').checkVisibility()));
      await semJs.close();
    }

    // 7c7. Indicadores mais fáceis de achar (D-115): "Indicadores de hoje" na página inicial, com o retrato e a troca pelo painel.js (uma
    // pergunta ao próprio site), o caminho para o painel e o glossário, e o cartão dos indicadores em Aprender e em Novidades.
    {
      const p = await pagina();
      await p.goto(`${origem}/`);
      await p.waitForFunction(() => document.querySelector('.indicadores-inicio').getAttribute('data-atualizado') === 'sim', null, { timeout: 8000 }).catch(() => {});
      const inicio = await p.evaluate(() => {
        const s = document.querySelector('.indicadores-inicio');
        return { atualizado: s.getAttribute('data-atualizado'), cartoes: [...s.querySelectorAll('[data-indicador]')].map((c) => c.getAttribute('data-indicador')), selic: s.querySelector('[data-indicador="selic"] [data-campo="numero"]').textContent, fonte: /Fonte: Banco Central do Brasil\./.test(s.textContent), aviso: /Conteúdo educativo\. Não é recomendação nem análise de valores mobiliários\./.test(s.parentElement.textContent), botao: document.querySelector('a.botao[href="indicadores/index.html"]') ? document.querySelector('a.botao[href="indicadores/index.html"]').textContent : null };
      });
      ok('indicadores no início: os cinco números, trocados pelo painel.js (Selic 15,00%), com a fonte, o aviso e "Ver os indicadores e o glossário"', inicio.atualizado === 'sim' && JSON.stringify(inicio.cartoes) === JSON.stringify(['selic', 'cdi', 'ipca', 'poupanca', 'ptax']) && inicio.selic === '15,00%' && inicio.fonte && inicio.aviso && inicio.botao === 'Ver os indicadores e o glossário', JSON.stringify(inicio));
      const atalhos = [];
      for (const c of ['aprender/', 'novidades/']) {
        await p.goto(`${origem}/${c}`);
        atalhos.push(await p.evaluate(() => { const a = document.querySelector('main a.cartao[href="../indicadores/index.html"]'); return a ? a.querySelector('.titulo-cartao').textContent : null; }));
      }
      ok('indicadores: o cartão "Indicadores oficiais" em Aprender e em Novidades', atalhos.every((t) => t === 'Indicadores oficiais'), JSON.stringify(atalhos));
      await p.close();
    }

    // 7c8. Tema do site (D-115): no rodapé de todas as páginas, "Igual ao aparelho" (o padrão), "Claro" e "Escuro", com nomes acessíveis
    // e pelo teclado. A escolha muda o tema na hora, vale depois de recarregar e marca o <html> antes de a página aparecer (já no
    // DOMContentLoaded); "Igual ao aparelho" segue o aparelho nos dois sentidos; com o armazenamento bloqueado, nada quebra; só a chave do
    // tema fica no navegador; nada passa da largura da tela e o cabeçalho continua numa linha em 320, 390, 768, 1024, 1120 e 1280 px.
    {
      const FUNDO_CLARO = 'rgb(247, 249, 253)';
      const FUNDO_ESCURO = 'rgb(19, 30, 62)';
      const temaCtx = await navegador.newContext({ viewport: { width: 390, height: 900 }, colorScheme: 'light' });
      await temaCtx.addInitScript(() => document.addEventListener('DOMContentLoaded', () => { window.__temaNoInicio = document.documentElement.dataset.tema || null; }));
      const p = await temaCtx.newPage();
      const erros = [];
      p.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && erros.push(m.text()));
      p.on('pageerror', (e) => erros.push(e.message));
      const estado = () => p.evaluate(() => ({ tema: document.documentElement.dataset.tema, inicio: window.__temaNoInicio, fundo: getComputedStyle(document.body).backgroundColor, escolhida: (document.querySelector('input[name="tema-site"]:checked') || {}).value, guardado: (() => { try { return localStorage.getItem('clarevo.site.tema.v1'); } catch (e) { return 'erro'; } })(), chaves: (() => { try { return Object.keys(localStorage); } catch (e) { return ['erro']; } })() }));
      await p.goto(`${origem}/`);
      const grupo = await p.evaluate(() => {
        const f = document.querySelector('footer fieldset.tema-site');
        return { visivel: f && !f.hidden, legenda: f && f.querySelector('legend').textContent, opcoes: f ? [...f.querySelectorAll('input[type="radio"][name="tema-site"]')].map((i) => ({ valor: i.value, nome: i.closest('label').textContent.trim() })) : [] };
      });
      const padrao = await estado();
      ok('tema: o grupo "Tema do site" no rodapé, com "Igual ao aparelho" (marcado), "Claro" e "Escuro", e o site no tema do aparelho', grupo.visivel && grupo.legenda === 'Tema do site' && JSON.stringify(grupo.opcoes.map((o) => o.nome)) === JSON.stringify(['Igual ao aparelho', 'Claro', 'Escuro']) && padrao.tema === 'aparelho' && padrao.escolhida === 'aparelho' && padrao.fundo === FUNDO_CLARO && padrao.guardado === null, JSON.stringify({ grupo, padrao }));
      // Nomes acessíveis pelo papel: cada opção é um botão de opção com o nome visível.
      const nomes = [];
      for (const n of ['Igual ao aparelho', 'Claro', 'Escuro']) nomes.push(await p.getByRole('radio', { name: n, exact: true }).count());
      ok('tema: cada opção tem o papel de opção e o nome acessível visível', nomes.every((n) => n === 1), JSON.stringify(nomes));
      await p.getByRole('radio', { name: 'Escuro', exact: true }).check();
      const escuro = await estado();
      await p.reload();
      const escuroDepois = await estado();
      ok('tema: "Escuro" muda o site na hora (aparelho claro), fica guardado e vale depois de recarregar, já marcado no DOMContentLoaded', escuro.tema === 'escuro' && escuro.fundo === FUNDO_ESCURO && escuro.guardado === 'escuro' && escuroDepois.tema === 'escuro' && escuroDepois.inicio === 'escuro' && escuroDepois.fundo === FUNDO_ESCURO && escuroDepois.escolhida === 'escuro', JSON.stringify({ escuro, escuroDepois }));
      // Pelo teclado: o foco na opção marcada e as setas trocam a escolha (Escuro -> Igual ao aparelho volta ao começo do grupo).
      await p.getByRole('radio', { name: 'Escuro', exact: true }).focus();
      const focoVisivel = await p.evaluate(() => { const s = document.activeElement.nextElementSibling; return s && getComputedStyle(s).outlineStyle !== 'none'; });
      await p.keyboard.press('ArrowLeft');
      const claro = await estado();
      await p.reload();
      const claroDepois = await estado();
      ok('tema: pelo teclado (seta), "Claro" fica escolhido, com foco visível, e vale depois de recarregar', focoVisivel && claro.tema === 'claro' && claro.fundo === FUNDO_CLARO && claroDepois.inicio === 'claro' && claroDepois.escolhida === 'claro', JSON.stringify({ focoVisivel, claro, claroDepois }));
      // "Claro" vale mesmo com o aparelho escuro.
      await p.emulateMedia({ colorScheme: 'dark' });
      const claroNoEscuro = await estado();
      // As telas das matérias seguem a escolha, e não o aparelho.
      await p.goto(`${origem}/${POSTS[3]}`);
      const telas = await p.evaluate(async () => { for (const i of document.images) i.loading = 'eager'; await Promise.all([...document.images].map((i) => (i.complete ? null : new Promise((r) => { i.onload = r; i.onerror = r; })))); return [...document.querySelectorAll('main picture img')].map((i) => /-escura\./.test(i.currentSrc)); });
      ok('tema: "Claro" com o aparelho escuro deixa o site e as telas das matérias no claro', claroNoEscuro.fundo === FUNDO_CLARO && telas.length > 0 && telas.every((t) => !t), JSON.stringify({ claroNoEscuro, telas }));
      // "Igual ao aparelho" segue o aparelho nos dois sentidos e apaga a chave.
      await p.getByRole('radio', { name: 'Igual ao aparelho', exact: true }).check();
      const aparelhoEscuro = await estado();
      await p.emulateMedia({ colorScheme: 'light' });
      const aparelhoClaro = await estado();
      ok('tema: "Igual ao aparelho" segue o aparelho (escuro e depois claro) e não guarda nada', aparelhoEscuro.tema === 'aparelho' && aparelhoEscuro.fundo === FUNDO_ESCURO && aparelhoClaro.fundo === FUNDO_CLARO && aparelhoClaro.guardado === null && aparelhoClaro.chaves.length === 0, JSON.stringify({ aparelhoEscuro, aparelhoClaro }));
      ok('tema: o navegador guarda só a chave do tema (clarevo.site.tema.v1), sem erro no console', escuro.chaves.length === 1 && escuro.chaves[0] === 'clarevo.site.tema.v1' && erros.length === 0, JSON.stringify({ chaves: escuro.chaves, erros }));
      // Cabeçalho numa linha e nada passa da largura da tela.
      const largas = [];
      for (const largura of [320, 390, 768, 1024, 1120, 1280]) {
        await p.setViewportSize({ width: largura, height: 900 });
        for (const c of ['', 'novidades/rss', 'planos']) {
          await p.goto(`${origem}/${c}`);
          const r = await p.evaluate(() => ({ largo: document.documentElement.scrollWidth > window.innerWidth + 1, topo: Math.round(document.querySelector('.topo-i').getBoundingClientRect().height), tema: (() => { const f = document.querySelector('fieldset.tema-site .tema-opcoes'); const tops = [...f.children].map((c) => Math.round(c.getBoundingClientRect().top)); return new Set(tops).size; })() }));
          if (r.largo || r.topo > 80 || r.tema !== 1) largas.push(`${c || 'início'} em ${largura} px ${JSON.stringify(r)}`);
        }
      }
      ok('tema: em 320, 390, 768, 1024, 1120 e 1280 px, nada passa da largura da tela, o cabeçalho fica numa linha e as três opções numa linha só', largas.length === 0, largas.join(' | '));
      await temaCtx.close();
      // Armazenamento bloqueado: o site segue o aparelho, o grupo não aparece (a escolha não passaria para a página seguinte) e nada dá erro.
      const bloqueado = await navegador.newContext({ viewport: { width: 390, height: 900 }, colorScheme: 'dark' });
      await bloqueado.addInitScript(() => Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new DOMException('bloqueado', 'SecurityError'); } }));
      const q = await bloqueado.newPage();
      const errosQ = [];
      q.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && errosQ.push(m.text()));
      q.on('pageerror', (e) => errosQ.push(e.message));
      await q.goto(`${origem}/`);
      const antes = await q.evaluate(() => ({ tema: document.documentElement.dataset.tema, fundo: getComputedStyle(document.body).backgroundColor, grupo: document.querySelector('fieldset.tema-site').hidden }));
      ok('tema com o armazenamento bloqueado: segue o aparelho, o grupo não aparece e nada dá erro', antes.tema === 'aparelho' && antes.fundo === FUNDO_ESCURO && antes.grupo === true && errosQ.length === 0, JSON.stringify({ antes, errosQ }));
      // O <meta name="color-scheme"> segue a escolha (o fundo antes do estilo).
      const meta = await navegador.newContext({ viewport: { width: 390, height: 900 }, colorScheme: 'dark' });
      await meta.addInitScript(() => { try { localStorage.setItem('clarevo.site.tema.v1', 'claro'); } catch (e) { /* nada */ } });
      const m = await meta.newPage();
      await m.goto(`${origem}/`);
      ok('tema: com "Claro" escolhido e o aparelho escuro, o <meta name="color-scheme"> diz "light"', (await m.getAttribute('meta[name="color-scheme"]', 'content')) === 'light' && (await m.evaluate(() => getComputedStyle(document.body).backgroundColor)) === FUNDO_CLARO);
      await meta.close();
      await bloqueado.close();
      // Sem JavaScript: sem o grupo, e o site segue o aparelho.
      const semJs = await navegador.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 900 }, colorScheme: 'dark' });
      const r = await semJs.newPage();
      await r.goto(`${origem}/`);
      ok('tema sem JavaScript: o grupo não aparece e o site segue o tema do aparelho', await r.evaluate(() => document.querySelector('fieldset.tema-site').hidden && !document.documentElement.hasAttribute('data-tema') && getComputedStyle(document.body).backgroundColor === 'rgb(19, 30, 62)'));
      await semJs.close();
    }

    // 7c9. Nada de advertência na primeira tela (D-115): no início, em O app, em Planos, em Para empresas e em Sobre, nada que diga "não
    // promete" aparece na primeira tela (390 x 844 e 1280 x 900); o aviso de saúde fica na nota do fim da página inicial e de Sobre.
    {
      const p = await pagina();
      const achados = [];
      for (const [largura, altura] of [[390, 844], [1280, 900]]) {
        await p.setViewportSize({ width: largura, height: altura });
        for (const c of ['', 'app/', 'planos', 'empresas/', 'sobre']) {
          await p.goto(`${origem}/${c}`);
          const visiveis = await p.evaluate(() => [...document.querySelectorAll('main p, main h2, main h3, main li')].filter((e) => { const r = e.getBoundingClientRect(); return r.top < window.innerHeight && r.bottom > 0 && /não promete|não está incluído|não fazem parte/i.test(e.textContent); }).map((e) => e.textContent.slice(0, 60)));
          if (visiveis.length) achados.push(`${c || 'início'} em ${largura} px: ${visiveis.join(' / ')}`);
        }
      }
      ok('primeira tela: nenhuma advertência na primeira tela do início, de O app, de Planos, de Para empresas e de Sobre', achados.length === 0, achados.join(' | '));
      await p.setViewportSize({ width: 390, height: 900 });
      const fim = [];
      for (const c of ['', 'sobre']) {
        await p.goto(`${origem}/${c}`);
        fim.push(await p.evaluate(() => { const a = document.querySelector('main .aviso-final'); return Boolean(a) && /não é atendimento de saúde/.test(a.textContent) && a.getBoundingClientRect().top > document.documentElement.scrollHeight * 0.6; }));
      }
      ok('primeira tela: o aviso de saúde fica numa nota no fim do início e de Sobre', fim.every(Boolean), JSON.stringify(fim));
      await p.close();
    }

    // 7d. Imagens das matérias de Novidades (D-114): capa e telas ao lado das seções, do próprio site, com largura, altura e texto
    // alternativo; a tela larga (o painel da empresa) embaixo do texto; no tema claro, a versão clara das telas.
    {
      const p = await pagina();
      const lerImagens = () => p.evaluate(async () => {
        for (const i of document.images) i.loading = 'eager';
        await Promise.all([...document.images].map((i) => (i.complete ? null : new Promise((r) => { i.onload = r; i.onerror = r; }))));
        return [...document.querySelectorAll('main img')].map((i) => ({
          src: i.currentSrc || i.src, alt: i.getAttribute('alt'), largura: i.getAttribute('width'), altura: i.getAttribute('height'), natural: i.naturalWidth,
          capa: Boolean(i.closest('.capa-post')), tela: Boolean(i.closest('.post-tela')), escura: Boolean(i.closest('picture')), legenda: i.closest('figure')?.querySelector('figcaption')?.textContent || null,
        }));
      });
      for (const post of POSTS) {
        await p.goto(`${origem}/${post}`);
        const imgs = await lerImagens();
        const capa = imgs.filter((i) => i.capa);
        ok(`novidades com imagens: ${post.slice(10)} tem a imagem de capa no topo`, capa.length === 1 && capa[0].natural > 0, JSON.stringify(capa));
        ok(`novidades com imagens: ${post.slice(10)}: toda imagem com largura, altura, texto alternativo e carregada do próprio site`,
          imgs.length > 0 && imgs.every((i) => /^\d+$/.test(i.largura || '') && /^\d+$/.test(i.altura || '') && (i.alt || '').length > 20 && i.natural > 0 && i.src.startsWith(`${origem}/imagens/`)), JSON.stringify(imgs.filter((i) => !(i.natural > 0)).slice(0, 2)));
        ok(`novidades com imagens: ${post.slice(10)}: as telas com a legenda "Tela da demonstração, com dados fictícios", na versão clara`,
          imgs.filter((i) => i.escura).every((i) => i.legenda === 'Tela da demonstração, com dados fictícios' && !/-escura\./.test(i.src)), JSON.stringify(imgs.map((i) => [i.src.slice(-40), i.legenda])));
      }
      await p.goto(`${origem}/${POSTS[3]}`);
      const telas = (await lerImagens()).filter((i) => i.tela).map((i) => i.src.replace(/^.*\/imagens\/(post-[a-z-]+)\..*$/, '$1'));
      ok('novidades com imagens: em "O que chegou ao app em novembro", as telas de Investir (Desempenho), Metas, Multa e juros (fatura) e Resumo, cada uma ao lado da seção dela', JSON.stringify(telas) === JSON.stringify(['post-desempenho', 'post-metas', 'post-multa-fatura', 'post-resumo']), JSON.stringify(telas));
      await p.setViewportSize({ width: 1280, height: 900 });
      const lado = await p.evaluate(() => [...document.querySelectorAll('.post-secao')].map((s) => {
        const t = s.querySelector('.post-secao-texto h2').getBoundingClientRect(); const f = s.querySelector('.post-tela').getBoundingClientRect();
        return f.left > t.left + 400 && Math.abs(f.top - t.top) < 24;
      }));
      ok('novidades com imagens: em 1280 px, cada tela fica à direita do texto da seção, na altura do título', lado.length === 4 && lado.every(Boolean), JSON.stringify(lado));
      await p.goto(`${origem}/${POSTS[2]}`);
      const larga = await p.evaluate(() => { const f = document.querySelector('.larga.post-tela'); const t = document.querySelector('.post-corpo p'); return f && t ? Math.round(f.getBoundingClientRect().width) <= Math.round(t.getBoundingClientRect().width) + 1 && f.getBoundingClientRect().width > 600 : false; });
      ok('novidades com imagens: o painel da empresa, largo, fica embaixo do texto, na largura dele', larga);
      await p.setViewportSize({ width: 390, height: 900 });
      await p.close();
    }

    // 8. Espaçamento em todas as páginas (pedido do Enzo em 12/11/2026: "esse é um erro de espaçamento básico, precisamos evitar eles, em
    // toda a Clarevo"): em 360, 768, 900 e 1280 px, nenhum cartão, moldura ou bloco com fundo ou borda encosta em outro ou fica por cima
    // dele (menos de 8 px entre os dois, nos dois sentidos), e nada passa da largura da tela. Da varredura do mesmo dia: nenhum cartão
    // sozinho na última linha de uma grade; nenhum título de seção mais perto do que vem antes do que do próprio conteúdo; nenhum texto
    // colado numa caixa ou numa grade de cartões; nenhuma caixa com o primeiro ou o último item somando margem ao respiro dela (o de baixo
    // ficava o dobro do de cima); e duas seções seguidas com o mesmo fundo, sem linha entre elas, não somam os dois respiros.
    {
      const paginas = [];
      const andar = (d) => { for (const n of fs.readdirSync(d, { withFileTypes: true })) { const c = path.join(d, n.name); if (n.isDirectory()) andar(c); else if (n.name.endsWith('.html')) paginas.push(path.relative(saida, c)); } };
      andar(saida);
      const p = await pagina();
      const encostados = [];
      const largos = [];
      const varredura = { sozinhos: [], titulos: [], colados: [], margens: [], dobrados: [] };
      for (const largura of [360, 768, 900, 1280]) {
        await p.setViewportSize({ width: largura, height: 900 });
        for (const arquivo of paginas) {
          const url = `${origem}/${arquivo.replace(/\\/g, '/').replace(/index\.html$/, '').replace(/\.html$/, '')}`;
          await p.goto(url);
          const r = await p.evaluate(varrerPagina);
          for (const x of r.achados) encostados.push(`${arquivo} em ${largura} px: ${x}`);
          if (r.largo) largos.push(`${arquivo} em ${largura} px`);
          for (const k of Object.keys(varredura)) for (const x of r[k]) varredura[k].push(`${arquivo} em ${largura} px: ${x}`);
        }
      }
      ok(`espaçamento: em ${paginas.length} páginas e 4 larguras, nenhum cartão ou bloco encostado em outro ou por cima dele`, encostados.length === 0, `${encostados.length} casos: ${encostados.slice(0, 12).join(' | ')}`);
      ok(`espaçamento: em ${paginas.length} páginas e 4 larguras, nada passa da largura da tela`, largos.length === 0, largos.slice(0, 6).join(' | '));
      const regra = (k, texto) => ok(`espaçamento: em ${paginas.length} páginas e 4 larguras, ${texto}`, varredura[k].length === 0, `${varredura[k].length} casos: ${varredura[k].slice(0, 8).join(' | ')}`);
      regra('sozinhos', 'nenhum cartão sozinho na última linha de uma grade');
      regra('titulos', 'nenhum título de seção colado no que vem antes (pelo menos 24 px e 1,5 vez o espaço até o próprio conteúdo)');
      regra('colados', 'nenhum texto colado numa caixa ou numa grade de cartões (menos de 8 px)');
      regra('margens', 'nenhuma caixa com o primeiro ou o último item somando margem ao respiro dela');
      regra('dobrados', 'duas seções seguidas com o mesmo fundo, sem linha entre elas, não somam os dois respiros');
      await p.close();
    }

    // 8b. Tema escuro nas páginas com vídeos e imagens novas (D-114), em 360 e 1280 px: as mesmas regras da varredura, as telas das
    // matérias na versão escura e nenhuma imagem sem carregar.
    {
      const escuro = await navegador.newContext({ colorScheme: 'dark', viewport: { width: 360, height: 900 }, locale: 'pt-BR' });
      const p = await escuro.newPage();
      p.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && problemas.push(`${p.url()} ${m.text()}`));
      p.on('request', (q) => !q.url().startsWith(origem) && !q.url().startsWith('data:') && pedidosDeFora.push(q.url()));
      const achados = [];
      const claras = [];
      for (const largura of [360, 1280]) {
        await p.setViewportSize({ width: largura, height: 900 });
        for (const caminho of PAGINAS_D114) {
          await p.goto(`${origem}/${caminho}`);
          const imgs = await p.evaluate(async () => {
            for (const i of document.images) i.loading = 'eager';
            await Promise.all([...document.images].map((i) => (i.complete ? null : new Promise((r) => { i.onload = r; i.onerror = r; }))));
            return [...document.querySelectorAll('main picture img')].map((i) => ({ src: i.currentSrc, natural: i.naturalWidth }));
          });
          for (const i of imgs) if (!/-escura\.[0-9a-f]{10}\.png$/.test(i.src) || !(i.natural > 0)) claras.push(`${caminho || 'início'} em ${largura} px: ${i.src}`);
          const r = await p.evaluate(varrerPagina);
          const fundo = await p.evaluate(() => getComputedStyle(document.body).backgroundColor);
          if (fundo !== 'rgb(19, 30, 62)') achados.push(`${caminho || 'início'} em ${largura} px: o fundo não é o do tema escuro (${fundo})`);
          if (r.largo) achados.push(`${caminho || 'início'} em ${largura} px: passa da largura da tela`);
          for (const k of ['achados', 'sozinhos', 'titulos', 'colados', 'margens', 'dobrados']) for (const x of r[k]) achados.push(`${caminho || 'início'} em ${largura} px (${k}): ${x}`);
        }
      }
      ok(`tema escuro: em ${PAGINAS_D114.length} páginas com vídeos e imagens novas, em 360 e 1280 px, o fundo escuro, nada passa da largura da tela e as regras de espaçamento valem`, achados.length === 0, achados.slice(0, 8).join(' | '));
      ok('tema escuro: as telas das matérias aparecem na versão escura, carregadas do próprio site', claras.length === 0, claras.slice(0, 4).join(' | '));
      await escuro.close();
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
