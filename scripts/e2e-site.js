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
 *   - as notícias de fontes públicas (D-117), com os feeds simulados no `fetch` do worker (as amostras reais de
 *     packages/core/test/fixtures/noticias): ligadas (NOTICIAS=ligado), a lista com data, fonte em negrito, título, resumo, "Ler aqui" e "Ler
 *     na fonte", a página de leitura com a autoria, a licença, "Ver a matéria original" e o texto filtrado, sem imagem de fora; sem
 *     JavaScript, o aviso e os links para as fontes; desligadas (sem a variável), "Em breve"; a fonte fora do ar; nada passa da largura da
 *     tela em 320, 390 e 1280 px;
 *   - os vídeos de uso do app (D-114 e D-115) na página inicial e em O app: cada um no bloco que mostra, do próprio site, sem controles nem
 *     `autoplay`, sem som, com `preload="none"`; o script toca o que aparece na tela e pausa o que sai; sem botão de pausar (D-115c): o
 *     próprio vídeo é o controle (papel de botão, nome acessível, clique e teclado); com movimento reduzido ou economia de dados, nada toca
 *     nem baixa até a pessoa tocar no vídeo; sem JavaScript, a capa; e o servidor responde pedaços (206) com o tipo certo;
 *   - as imagens das matérias de Novidades (D-114): capa e telas com largura, altura e texto alternativo, carregando do próprio site, e a
 *     versão escura no tema escuro;
 *   - "O que o plano inclui" em cartões e os atalhos da Ajuda, do Suporte e da 404 (23/11/2026): os grupos, os cartões com um link só e
 *     sem link sublinhado, a grade em 1280, 820 e 390 px, o cartão inteiro como área de toque, o foco no cartão, nada além da largura da
 *     tela em 360 px e o contraste AA no tema claro, no escuro do aparelho e no "Escuro" escolhido no rodapé;
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
/**
 * As notícias (D-117): cada feed configurado responde com a amostra real dele (packages/core/test/fixtures/noticias). O da Receita Federal
 * responde com a amostra real da busca de notícias da própria Receita (RSS 1.0, com duas notícias do Imposto de Renda), para a lista ter uma
 * notícia do gov.br com resumo e "Ler na fonte": o feed de últimas notícias do dia da amostra não tinha nenhuma dos temas acompanhados.
 */
const FIXTURES_NOTICIAS = path.join(RAIZ, 'packages', 'core', 'test', 'fixtures', 'noticias');
const FEEDS_NOTICIAS = {
  'https://agenciabrasil.ebc.com.br/rss/economia/feed.xml': 'agencia-brasil-economia.xml',
  'https://www.bcb.gov.br/api/feed/sitebcb/sitefeeds/noticias': 'bcb-noticias.xml',
  'https://www.bcb.gov.br/api/feed/sitebcb/sitefeeds/notasImprensa': 'bcb-notas.xml',
  'https://www.gov.br/receitafederal/pt-br/assuntos/noticias/ultimas-noticias/atom.xml': 'receita-federal-busca-restituicao.xml',
  'https://www.gov.br/fazenda/pt-br/search_rss?portal_type=collective.nitf.content&sort_on=effective&sort_order=reverse': 'ministerio-da-fazenda.xml',
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
    // O que está num <details> fechado não aparece (27/11/2026: parte de O app e de Para empresas fica recolhida): fica de fora, e a
    // varredura confere essas duas páginas também com tudo aberto.
    if (b.width < 120 || b.height < 56 || cs.visibility === 'hidden' || cs.display === 'none' || !e.checkVisibility()) return false;
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
  const vis = (e) => { const cs = getComputedStyle(e); const b = e.getBoundingClientRect(); return cs.display !== 'none' && cs.visibility !== 'hidden' && b.width > 0 && b.height > 0 && e.checkVisibility(); };
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
  // As fontes de notícias simuladas (D-117): cada feed configurado responde com a amostra dele; cada busca fica em `chamadasFeeds`.
  const chamadasFeeds = [];
  const fetchSimulado = async (url, opcoes) => {
    if (String(url).startsWith('https://api.bcb.gov.br/')) return respostaDoBanco(url, opcoes);
    if (FEEDS_NOTICIAS[String(url)]) {
      chamadasFeeds.push({ url: String(url), cabecalhos: opcoes && opcoes.headers, redirect: opcoes && opcoes.redirect });
      return new Response(fs.readFileSync(path.join(FIXTURES_NOTICIAS, FEEDS_NOTICIAS[String(url)]), 'utf8'), { status: 200, headers: { 'content-type': 'application/rss+xml; charset=utf-8' } });
    }
    chamadas.push({ url: String(url), cabecalhos: opcoes.headers, corpo: JSON.parse(opcoes.body) });
    return new Response('{}', { status: 200 });
  };
  const servidor = await servir(saida, {
    // NOTICIAS=ligado (D-117): as rotas de notícias ligadas neste servidor; o desligado é conferido num servidor à parte (bloco 7e).
    env: { RESEND_API_KEY: 'chave-so-de-teste', CONTATO_DESTINO: 'contato@exemplo.test', CONTATO_REMETENTE: 'Clarevo <site@exemplo.test>', BREVO_API_KEY: 'chave-so-de-teste', BREVO_LISTA_ID: '7', BREVO_MODELO_CONFIRMACAO_ID: '3', NOTICIAS: 'ligado' },
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

    // 7. Comece aqui (D-067): a página do link da bio abre sem violação da política de segurança. Desde 26/11/2026 (D-128), uma página neutra
    // de como começar, sem fase de testes nem demonstração: "Assine aqui" e "Conheça o app", três passos (o plano, o navegador ou o celular e
    // os primeiros passos) e os oito caminhos, e nenhum parâmetro de rastreamento em link nenhum.
    {
      const p = await pagina();
      await p.goto(`${origem}/comece`);
      const corpo = await p.textContent('main');
      ok('comece aqui: título, "Assine aqui" e "Conheça o app", três passos e oito caminhos, sem fase de testes nem demonstração', (await p.textContent('h1')) === 'Comece aqui' &&
        JSON.stringify(await p.$$eval('.capa .acoes a', (as) => as.map((a) => [a.textContent, a.getAttribute('href')]))) === JSON.stringify([['Assine aqui', 'planos.html'], ['Conheça o app', 'app/index.html']]) &&
        (await p.$$eval('#passos + ol > li > h3', (hs) => hs.map((h) => h.textContent))).join('|') === 'Escolha o plano|Use no navegador ou no celular|Dê os primeiros passos' &&
        (await p.$$eval('main a.cartao', (as) => as.map((a) => a.querySelector('.titulo-cartao').textContent))).join('|') === 'O app|Use no navegador|Planos|Para quem trabalha por conta e MEI|Para empresas|Aprender|Calculadoras|Ajuda' &&
        !/fase de testes|piloto|quem testa|lançamento|Ver a demonstração/i.test(corpo) && (await p.$$('a[href*="demo.clarevo"]')).length === 0);
      const comParametro = await p.$$eval('a[href]', (as) => as.map((a) => a.getAttribute('href')).filter((h) => /[?&]|utm_|fbclid|igshid/i.test(h)));
      ok('comece aqui: nenhum link leva parâmetro', comParametro.length === 0, JSON.stringify(comParametro));
      ok('comece aqui: sem script (só dados estruturados, se houver, e o tema do site) e sem formulário', (await p.$$eval('script', (ss) => ss.filter((x) => x.type !== 'application/ld+json' && !x.src.endsWith('/js/tema.js')).length)) === 0 && (await p.$$('form')).length === 0);
      // "Assine aqui", antes do lançamento, leva aos planos, que mostram a fita "Em breve".
      await Promise.all([p.waitForURL(/\/planos(\.html)?$/), p.click('.capa .acoes a.botao-principal')]);
      ok('comece aqui: "Assine aqui" leva aos planos, com a fita "Em breve" nos dois cartões', (await p.$$('.plano .fita-em-breve')).length === 2, p.url());
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
      ok('resumo semanal: o rodapé tem "Notícias", a página que lista as edições', (await g.$('footer a[href="noticias/index.html"]')) !== null);
      await g.goto(`${origem}/noticias/`);
      ok('resumo semanal: a página de notícias lista a edição de teste em "Resumos da semana"', (await g.$(`#resumos ~ ul a[href="semana-${HOJE}.html"]`)) !== null);
      await g.close();
    }

    // 7e. Notícias de fontes públicas (D-117), antes da varredura de espaçamento (que abre todas as páginas): a contagem de buscas é limpa.
    {
      const textoDe = (p, sel) => p.$eval(sel, (e) => (e.innerText || e.textContent).replace(/\s+/g, ' ').trim());
      const visivel = (p, sel) => p.$eval(sel, (e) => !e.hidden && e.getClientRects().length > 0).catch(() => false);
      // Ligadas: a lista, com data, fonte em negrito, título, resumo e "Ler aqui" ou "Ler na fonte".
      const p = await pagina();
      const daApi = [];
      p.on('request', (q) => q.url().startsWith(`${origem}/api/noticias`) && daApi.push(q.url()));
      // As buscas contam desde o começo do roteiro: a primeira pode ter vindo do bloco 7b, que abre a página de notícias (a lista das
      // edições do resumo semanal); depois dela, tudo sai da cópia de uma hora do servidor.
      const antes = 0;
      const respostaDaLista = p.waitForResponse((r) => r.url() === `${origem}/api/noticias`);
      await p.goto(`${origem}/noticias/`);
      const lista = await respostaDaLista;
      await p.waitForSelector('[data-noticias-lista]:not([hidden]) li');
      const itens = await p.$$eval('.noticia-item', (lis) =>
        lis.map((li) => ({
          meta: li.querySelector('.noticia-meta').textContent,
          fonteEmNegrito: li.querySelector('.noticia-meta strong') ? li.querySelector('.noticia-meta strong').textContent : null,
          data: li.querySelector('.noticia-meta time') ? li.querySelector('.noticia-meta time').getAttribute('datetime') : null,
          titulo: li.querySelector('h3').textContent,
          resumo: li.querySelector('.noticia-resumo') ? li.querySelector('.noticia-resumo').textContent : null,
          acao: li.querySelector('.noticia-acao a').firstChild.textContent,
          href: li.querySelector('.noticia-acao a').getAttribute('href'),
          rel: li.querySelector('.noticia-acao a').getAttribute('rel'),
        })),
      );
      ok('notícias, ligadas: a lista com as notícias dos temas acompanhados, a mais nova primeiro, cada uma com data e fonte em negrito', itens.length === 8 && itens.every((i) => /^\d{2}\/\d{2}\/\d{4} · .+$/.test(i.meta) && i.fonteEmNegrito && i.meta.endsWith(i.fonteEmNegrito) && i.data) && itens.map((i) => i.data).every((d, k, a) => k === 0 || a[k - 1] >= d), JSON.stringify(itens.map((i) => [i.meta, i.titulo])));
      const durigan = itens.find((i) => i.titulo === 'Durigan prevê impacto inicial da reforma tributária sobre inflação');
      ok('notícias: "Ler aqui" só na matéria da Agência Brasil com crédito próprio, com o primeiro parágrafo como resumo', durigan && durigan.acao === 'Ler aqui' && /^materia\.html\?id=[0-9a-f]{16}$/.test(durigan.href) && durigan.resumo.startsWith('O ministro da Fazenda, Dario Durigan, afirmou') && itens.filter((i) => i.acao === 'Ler aqui').length === 1, JSON.stringify(durigan));
      const naFonte = itens.filter((i) => i.acao === 'Ler na fonte');
      ok('notícias: "Ler na fonte" leva ao endereço original, com noopener e noreferrer', naFonte.length === 7 && naFonte.every((i) => /^https:\/\/(agenciabrasil\.ebc\.com\.br|www\.bcb\.gov\.br|www\.gov\.br)\//.test(i.href) && i.rel === 'noopener noreferrer'), JSON.stringify(naFonte.map((i) => [i.href, i.rel])));
      const receita = itens.filter((i) => i.fonteEmNegrito === 'Receita Federal');
      ok('notícias: as do gov.br (Receita Federal) com a linha fina do próprio feed como resumo e "Ler na fonte"', receita.length === 2 && receita.every((i) => i.resumo && i.acao === 'Ler na fonte'), JSON.stringify(receita));
      ok('notícias: as do Banco Central (só resumo pela licença) sem resumo tirado do texto', itens.filter((i) => i.fonteEmNegrito === 'Banco Central do Brasil').every((i) => i.resumo === null && i.acao === 'Ler na fonte'));
      ok('notícias: o aviso sem JavaScript e os links para as fontes somem com a lista; a hora da consulta aparece', !(await visivel(p, '[data-estado="sem-js"]')) && !(await visivel(p, '[data-fontes-para-ler]')) && /^Atualizado em \d{2}\/\d{2}\/\d{4} às \d{2}:\d{2}, horário de Brasília\.$/.test(await textoDe(p, '[data-noticias-atualizado]')));
      ok('notícias: o aviso de mercado da CVM no rodapé e a linha de onde vêm as notícias', (await textoDe(p, '.rodape-aviso')) === 'Conteúdo educativo. Não é recomendação nem análise de valores mobiliários.' && (await textoDe(p, '#de-onde + p')).startsWith('O servidor da Clarevo lê os feeds públicos'));
      ok('/api/noticias: o servidor buscou só os cinco feeds configurados, uma vez, só com Accept e User-Agent do site e sem seguir redirecionamento', chamadasFeeds.length - antes === 5 && chamadasFeeds.slice(antes).every((c) => FEEDS_NOTICIAS[c.url] && c.cabecalhos['User-Agent'] === 'clarevo-site' && Object.keys(c.cabecalhos).sort().join() === 'Accept,User-Agent' && c.redirect === 'manual'), JSON.stringify(chamadasFeeds.slice(antes)));
      ok('/api/noticias: JSON, guarda de 15 minutos no navegador e a política de segurança do site', lista.headers()['content-type'] === 'application/json; charset=utf-8' && lista.headers()['cache-control'] === 'public, max-age=900' && /img-src 'self'/.test(lista.headers()['content-security-policy'] || ''));
      ok('notícias: nenhuma imagem de outro site na lista', await p.evaluate((o) => [...document.images].every((i) => i.src.startsWith(o)) && performance.getEntriesByType('resource').every((r) => r.name.startsWith(o)), origem));

      // "Ler aqui": a página de leitura, com o título, a data, a fonte, a autoria, a licença, "Ver a matéria original" e o texto filtrado.
      await p.click(`.noticia-acao a[href="${durigan.href}"]`);
      await p.waitForSelector('[data-materia-texto]:not([hidden]) p');
      const materia = await p.evaluate(() => ({
        url: location.pathname + location.search,
        h1: document.querySelector('h1').textContent,
        titulo: document.title,
        meta: document.querySelector('[data-materia-meta]').textContent,
        fonte: document.querySelector('[data-materia-meta] strong').textContent,
        credito: document.querySelector('[data-materia-credito]').textContent,
        licenca: document.querySelector('[data-materia-licenca]').textContent,
        originais: [...document.querySelectorAll('.materia-original a')].map((a) => ({ texto: a.textContent, href: a.href, rel: a.rel, classe: a.className })),
        h2: [...document.querySelectorAll('[data-materia-texto] h2')].map((h) => h.textContent),
        imagens: document.querySelectorAll('main img, main iframe, main video, main svg').length,
        atributos: [...document.querySelectorAll('[data-materia-texto] *')].flatMap((e) => [...e.attributes].map((a) => `${e.tagName}:${a.name}`)).filter((a) => !/^A:(href|rel)$/.test(a)),
        links: [...document.querySelectorAll('[data-materia-texto] a')].every((a) => /^https?:/.test(a.href) && a.rel === 'noopener noreferrer'),
        nota: !document.querySelector('[data-materia-nota]').hidden,
      }));
      const original = 'https://agenciabrasil.ebc.com.br/economia/noticia/2026-11/durigan-preve-impacto-inicial-da-reforma-tributaria-sobre-inflacao';
      ok('notícias: "Ler aqui" abre a página de leitura com o título, a data, a fonte em negrito e a autoria', /^\/noticias\/materia(\.html)?\?id=[0-9a-f]{16}$/.test(materia.url) && materia.h1 === durigan.titulo && materia.titulo === `${durigan.titulo} · Clarevo` && materia.meta === '17/11/2026 · Agência Brasil' && materia.fonte === 'Agência Brasil' && materia.credito === 'Por Pedro Peduzzi, repórter da Agência Brasil', JSON.stringify(materia));
      ok('notícias: a linha de licença e "Ver a matéria original" (em destaque, no alto e no fim), para o endereço original', materia.licenca.startsWith('Texto da Agência Brasil (EBC), reproduzido sem alterações e com o crédito da autoria.') && materia.originais.length === 2 && materia.originais.every((a) => a.texto === 'Ver a matéria original' && a.href === original && a.rel === 'noopener noreferrer' && a.classe === 'botao botao-principal'), JSON.stringify(materia.originais));
      ok('notícias: o texto filtrado, sem imagem, vídeo ou atributo além do href dos links, e a nota de que o texto é da fonte', materia.h2.includes('Tributação corporativa') && materia.imagens === 0 && materia.atributos.length === 0 && materia.links && materia.nota, JSON.stringify({ h2: materia.h2, imagens: materia.imagens, atributos: materia.atributos.slice(0, 5) }));
      ok('notícias: nenhuma imagem de outro site na página de leitura e nenhum pedido para fora', await p.evaluate((o) => performance.getEntriesByType('resource').every((r) => r.name.startsWith(o)), origem));
      ok('notícias: sem cookie nem armazenamento; a página pergunta uma vez à API', await p.evaluate(() => localStorage.length === 0 && sessionStorage.length === 0 && document.cookie === ''));
      ok('notícias: cada página pergunta uma vez (lista e matéria), e a matéria sai da cópia do servidor, sem buscar os feeds de novo', daApi.length === 2 && daApi[1].endsWith(`/api/noticias/materia?id=${durigan.href.slice(-16)}`) && chamadasFeeds.length - antes === 5, daApi.join(' | '));
      // Nada passa da largura da tela em 320, 390 e 1280 px, na lista e na página de leitura.
      const largas = [];
      for (const largura of [320, 390, 1280]) {
        await p.setViewportSize({ width: largura, height: 900 });
        for (const c of ['noticias/', `noticias/${durigan.href}`]) {
          await p.goto(`${origem}/${c}`);
          await p.waitForSelector(c.includes('materia') ? '[data-materia-texto]:not([hidden])' : '[data-noticias-lista]:not([hidden])');
          if (await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) largas.push(`${c} em ${largura} px`);
        }
      }
      ok('notícias: nada passa da largura da tela em 320, 390 e 1280 px (lista e página de leitura)', largas.length === 0, largas.join(' | '));
      await p.setViewportSize({ width: 390, height: 900 });
      await p.close();

      // As respostas da API que a página trata: matéria só com resumo (404), id inválido (400), POST (405).
      const soResumo = (await (await ctx.request.get(`${origem}/api/noticias`)).json()).noticias.find((n) => !n.textoCompleto);
      ok('/api/noticias/materia: notícia só com resumo dá 404, id inválido 400, e só GET e HEAD', (await ctx.request.get(`${origem}/api/noticias/materia?id=${soResumo.id}`)).status() === 404 && (await ctx.request.get(`${origem}/api/noticias/materia?id=https://exemplo.test/`)).status() === 400 && (await ctx.request.post(`${origem}/api/noticias`, { data: 'x' })).status() === 405 && chamadasFeeds.length - antes === 5);

      /** Uma página num contexto à parte, que aceita no console só o status esperado da própria API (404 ou 503). */
      const paginaQueEspera = async (contexto, status) => {
        const q = await contexto.newPage();
        const erros = [];
        q.on('pageerror', (e) => erros.push(e.message));
        q.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && !new RegExp(`status of ${status}`).test(m.text()) && erros.push(m.text()));
        q.on('request', (r) => !r.url().startsWith('http://127.0.0.1') && erros.push(`pedido para fora: ${r.url()}`));
        return { q, erros };
      };
      // Na página de leitura, matéria que não tem texto aqui: o aviso e os links para as fontes.
      {
        const { q, erros } = await paginaQueEspera(ctx, 404);
        await q.goto(`${origem}/noticias/materia.html?id=${soResumo.id}`);
        await q.waitForSelector('[data-estado="nao-encontrada"]:not([hidden])');
        ok('notícias: matéria sem texto aqui mostra o aviso e os links para as fontes, sem erro', (await visivel(q, '[data-fontes-para-ler]')) && (await q.$$('[data-fontes-para-ler] a[rel="noopener noreferrer"]')).length === 4 && erros.length === 0, erros.join(' | '));
        await q.close();
      }

      // Sem JavaScript: o aviso e os links para as fontes.
      const semJs = await navegador.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 900 } });
      const s0 = await semJs.newPage();
      await s0.goto(`${origem}/noticias/`);
      const fontesSemJs = await s0.$$eval('[data-fontes-para-ler] a', (as) => as.map((a) => [a.textContent, a.href, a.rel]));
      ok('notícias, sem JavaScript: a frase curta e os links para as fontes, sem lista', (await visivel(s0, '[data-estado="sem-js"]')) && JSON.stringify(fontesSemJs.map((f) => f[0])) === JSON.stringify(['Agência Brasil', 'Banco Central do Brasil', 'Receita Federal', 'Ministério da Fazenda']) && fontesSemJs.every((f) => f[2] === 'noopener noreferrer') && !(await visivel(s0, '[data-noticias-lista]')), JSON.stringify(fontesSemJs));
      await s0.goto(`${origem}/noticias/materia.html?id=${durigan.href.slice(-16)}`);
      ok('notícias, sem JavaScript: a página de leitura diz que usa JavaScript e mostra as fontes', (await visivel(s0, '[data-estado="sem-js"]')) && (await visivel(s0, '[data-fontes-para-ler]')));
      await semJs.close();

      // Desligadas (o padrão até o advogado): sem NOTICIAS=ligado, a API responde 404 e a página mostra "Em breve" com as fontes.
      const antesDesligado = chamadasFeeds.length;
      const desligado = await servir(saida, { hostDoSite: true, fetchDoWorker: fetchSimulado });
      try {
        const { q, erros } = await paginaQueEspera(ctx, 404);
        const r404 = q.waitForResponse((r) => r.url().endsWith('/api/noticias'));
        await q.goto(`${desligado.url}/noticias/`);
        const resposta = await r404;
        await q.waitForSelector('[data-estado="em-breve"]:not([hidden])');
        ok('notícias, desligadas: a API responde 404 e a página mostra "Em breve" com os links para as fontes, sem lista e sem erro', resposta.status() === 404 && (await textoDe(q, '[data-estado="em-breve"]')).startsWith('Em breve.') && (await visivel(q, '[data-fontes-para-ler]')) && !(await visivel(q, '[data-noticias-lista]')) && erros.length === 0, erros.join(' | '));
        await q.goto(`${desligado.url}/noticias/materia.html?id=${durigan.href.slice(-16)}`);
        await q.waitForSelector('[data-estado="em-breve"]:not([hidden])');
        ok('notícias, desligadas: a página de leitura também mostra "Em breve"', (await visivel(q, '[data-fontes-para-ler]')) && !(await visivel(q, '[data-materia-texto]')));
        ok('notícias, desligadas: nenhum feed é buscado', chamadasFeeds.length === antesDesligado, `${chamadasFeeds.length - antesDesligado} buscas`);
        await q.close();
      } finally {
        await desligado.fechar();
      }

      // A fonte fora do ar: um servidor novo (sem cópia), ligado, com todos os feeds respondendo 503. A página mostra a falha e as fontes.
      const foraDoAr = await servir(saida, { env: { NOTICIAS: 'ligado' }, hostDoSite: true, fetchDoWorker: async () => new Response('fora do ar', { status: 503 }) });
      try {
        const { q, erros } = await paginaQueEspera(ctx, 503);
        await q.goto(`${foraDoAr.url}/noticias/`);
        await q.waitForSelector('[data-estado="falha"]:not([hidden])');
        ok('notícias, fontes fora do ar: a frase de falha e os links para as fontes, sem erro', (await visivel(q, '[data-fontes-para-ler]')) && erros.length === 0, erros.join(' | '));
        await q.close();
      } finally {
        await foraDoAr.fechar();
      }
    }

    // 7c. Vídeos de uso do app (D-114 e D-115): cada um no bloco que mostra (a capa e "Como funciona" da página inicial, seis recursos e o
    // cartão do tema em O app), do próprio site, sem controles de player nem `autoplay`, sem som e em repetição. O script do site toca o
    // vídeo que aparece na tela (pelo menos metade) e pausa o que sai; nada de vídeo baixa antes de aparecer. Sem botão de pausar (D-115c,
    // 19/11/2026): o próprio vídeo pausa e toca, pelo mouse e pelo teclado, com papel de botão e nome acessível; com movimento reduzido ou
    // economia de dados, nada toca até a pessoa tocar no vídeo; sem JavaScript, fica a capa, com o nome "Vídeo: título".
    {
      const LUGARES = {
        // Desde 25/11/2026 (D-125), a página inicial tem dois vídeos: o Resumo na capa e a fatura por print em "Como funciona".
        '/': [['.capa', 'O Resumo do mês'], ['section[aria-labelledby="como-funciona"]', 'Importar fatura por print']],
        '/app/': [['#resumo', 'O Resumo do mês'], ['#anotar', 'Anotar um gasto'], ['#contas', 'O Calendário do mês'], ['#cartoes', 'Importar fatura por print'], ['#metas', 'Metas'], ['#investir', 'Investir'], ['article.cartao:has(h3:text-is("Tema claro ou escuro"))', 'Do tema escuro ao claro']],
      };
      const p = await pagina();
      const deVideo = [];
      p.on('request', (q) => /\/videos\//.test(q.url()) && deVideo.push(q.url()));
      const lerVideos = () => p.$$eval('figure[data-video] video', (vs) => vs.map((v) => ({
        titulo: v.closest('figure').dataset.titulo, controls: v.controls || v.hasAttribute('controls'), autoplay: v.hasAttribute('autoplay'), loop: v.loop, muted: v.muted, preload: v.getAttribute('preload'),
        paused: v.paused, tempo: v.currentTime, poster: v.poster, largura: v.getAttribute('width'), altura: v.getAttribute('height'),
        fontes: [...v.querySelectorAll('source')].map((f) => [f.src, f.type]), reserva: v.querySelector('a') ? v.querySelector('a').href : '',
        nome: v.getAttribute('aria-label') || '', rotulo: v.getAttribute('aria-labelledby'), papel: v.getAttribute('role'), tabindex: v.getAttribute('tabindex'),
        descricao: document.getElementById(v.getAttribute('aria-describedby'))?.textContent || '',
        legenda: v.closest('figure').querySelector('figcaption')?.textContent || '',
        botoes: v.closest('figure').querySelectorAll('button, [class*="botao"]').length,
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
        ok(`vídeos (${caminho}): nenhum botão dentro das figuras; o próprio vídeo é o controle (papel de botão, tabindex 0, nome "Pausar o vídeo: título" ou "Tocar o vídeo: título"), com a legenda "Tela da demonstração, com dados fictícios" e a descrição em texto para leitor de tela`,
          vs.every((v) => v.botoes === 0 && v.papel === 'button' && v.tabindex === '0' && v.rotulo === null && /^(Pausar|Tocar) o vídeo: /.test(v.nome) && v.nome.endsWith(`: ${v.titulo}`) && v.legenda === 'Tela da demonstração, com dados fictícios' && v.descricao.length > 120),
          JSON.stringify(vs.map((v) => [v.titulo, v.botoes, v.papel, v.tabindex, v.rotulo, v.nome, v.legenda, v.descricao.length])));
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
      // Rolar até "Como funciona": o vídeo dele começa, e o da capa, fora da tela, pausa.
      const cartao = 'section[aria-labelledby="como-funciona"] video';
      await p.locator(cartao).evaluate((v) => v.scrollIntoView({ block: 'center' }));
      await p.waitForFunction(() => document.querySelector('[data-titulo="Importar fatura por print"] video').currentTime > 0.5, null, { timeout: 15000 }).catch(() => {});
      const doCartao = await p.locator(cartao).evaluate((v) => ({ paused: v.paused, tempo: v.currentTime }));
      const capaFora = await tempoDe('.capa video');
      ok('vídeos: ao rolar, o vídeo que aparece toca e o que saiu da tela pausa', !doCartao.paused && doCartao.tempo > 0.5 && capaFora.paused, JSON.stringify({ doCartao, capaFora }));
      // Sem botão (D-115c): clicar no próprio vídeo pausa, o nome passa a "Tocar o vídeo: ...", e a pausa da pessoa vale mesmo depois de
      // rolar para longe e voltar.
      const video = p.locator(cartao);
      const antes = await video.getAttribute('aria-label');
      await video.click();
      await p.waitForTimeout(300);
      const pausado = { paused: await video.evaluate((v) => v.paused), nome: await video.getAttribute('aria-label'), estado: await p.getAttribute('[data-titulo="Importar fatura por print"]', 'data-estado') };
      await p.evaluate(() => window.scrollTo(0, 0));
      await p.waitForTimeout(600);
      await video.evaluate((v) => v.scrollIntoView({ block: 'center' }));
      await p.waitForTimeout(900);
      const continuaPausado = await video.evaluate((v) => v.paused);
      const semBotao = await p.$$eval('figure[data-video]', (fs) => fs.map((f) => f.querySelectorAll('button, .video-botao').length));
      ok('vídeos: nenhum botão de pausar em nenhuma figura de vídeo da página inicial', semBotao.length === 2 && semBotao.every((n) => n === 0), JSON.stringify(semBotao));
      ok('vídeos: clicar no vídeo "Pausar o vídeo: Importar fatura por print" pausa, o nome passa a "Tocar o vídeo: ..." e a pausa continua depois de rolar para longe e voltar',
        antes === 'Pausar o vídeo: Importar fatura por print' && pausado.paused && pausado.nome === 'Tocar o vídeo: Importar fatura por print' && pausado.estado === 'parado' && continuaPausado, JSON.stringify({ antes, pausado, continuaPausado }));
      // Pelo teclado: Tab chega ao vídeo, com o contorno visível do foco, e Espaço toca de novo (sem rolar a página).
      // O foco parte do último elemento focável antes do vídeo, para o Tab ser de verdade (e o navegador mostrar o foco do teclado).
      await video.evaluate((v) => { const anterior = [...document.querySelectorAll('a[href], button, input, [tabindex="0"]')].filter((e) => e.getClientRects().length > 0 && !e.parentElement.closest('video') && e.compareDocumentPosition(v) & Node.DOCUMENT_POSITION_FOLLOWING).pop(); if (anterior) anterior.focus(); });
      await p.keyboard.press('Tab');
      // O foco leva o vídeo para a tela com a rolagem suave do site: espera a rolagem parar antes de medir.
      await p.waitForTimeout(900);
      const foco = await video.evaluate((v) => { const cs = getComputedStyle(v); return { ativo: document.activeElement === v, visivel: v.matches(':focus-visible'), contorno: cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 2 }; });
      const rolagemAntes = await p.evaluate(() => window.scrollY);
      await p.keyboard.press('Space');
      await p.waitForTimeout(800);
      const depoisDoEspaco = { paused: await video.evaluate((v) => v.paused), nome: await video.getAttribute('aria-label'), ativo: await video.evaluate((v) => document.activeElement === v), rolou: Math.abs((await p.evaluate(() => window.scrollY)) - rolagemAntes) > 2 };
      ok('vídeos: pelo teclado, o vídeo recebe foco com contorno visível e Espaço toca de novo, sem rolar a página, com o nome "Pausar o vídeo: Importar fatura por print"',
        foco.ativo && foco.visivel && foco.contorno && !depoisDoEspaco.paused && depoisDoEspaco.nome === 'Pausar o vídeo: Importar fatura por print' && depoisDoEspaco.ativo && !depoisDoEspaco.rolou, JSON.stringify({ foco, depoisDoEspaco }));
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
      // Movimento reduzido (page.emulateMedia) e economia de dados: nada toca sozinho e nada de vídeo baixa; tocar no vídeo o toca a pedido.
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
        const tudoParado = await q.$$eval('figure[data-video] video', (vs) => vs.length === 2 && vs.every((v) => v.paused && v.currentTime === 0));
        const nomeAntes = await q.getAttribute('.capa video', 'aria-label');
        const botoes = await q.$$eval('figure[data-video] button, .video-botao', (bs) => bs.length);
        const baixadosAntes = deVideoCalmo.length;
        await q.click('.capa video');
        await q.waitForFunction(() => document.querySelector('.capa video').currentTime > 0.5, null, { timeout: 15000 }).catch(() => {});
        const pedido = await q.$eval('.capa video', (v) => ({ paused: v.paused, tempo: v.currentTime, nome: v.getAttribute('aria-label') }));
        ok(`vídeos com ${nome}: nada toca sozinho nem baixa até a pessoa clicar no vídeo ("Tocar o vídeo: O Resumo do mês", sem botão), que então toca`, tudoParado && botoes === 0 && baixadosAntes === 0 && deVideoCalmo.length > 0 && nomeAntes === 'Tocar o vídeo: O Resumo do mês' && !pedido.paused && pedido.tempo > 0.5 && pedido.nome === 'Pausar o vídeo: O Resumo do mês' && erros.length === 0, JSON.stringify({ tudoParado, botoes, baixadosAntes, nomeAntes, pedido, erros }));
        await calmo.close();
      }
      // Sem JavaScript: a capa aparece, sem botão nem papel de botão, com o nome "Vídeo: título" pelo aria-labelledby, e nada quebra.
      const semJs = await navegador.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 900 } });
      const r = await semJs.newPage();
      const errosSemJs = [];
      r.on('pageerror', (e) => errosSemJs.push(e.message));
      await r.goto(`${origem}/app/`);
      const semScript = await r.evaluate(() => {
        const vs = [...document.querySelectorAll('figure[data-video] video')];
        return {
          videos: vs.length, botoes: document.querySelectorAll('figure[data-video] button, .video-botao').length, capas: vs.every((v) => v.poster.includes('/imagens/video-')),
          nomes: vs.every((v) => !v.hasAttribute('role') && !v.hasAttribute('tabindex') && !v.hasAttribute('aria-label') && document.getElementById(v.getAttribute('aria-labelledby'))?.textContent === `Vídeo: ${v.closest('figure').dataset.titulo}`),
        };
      });
      ok('vídeos sem JavaScript: as capas aparecem, sem botão, com o nome "Vídeo: título" pelo aria-labelledby e sem erro', semScript.videos === 7 && semScript.botoes === 0 && semScript.capas && semScript.nomes && errosSemJs.length === 0, JSON.stringify({ semScript, errosSemJs }));
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

    // 7c3. Planos (D-115; uma página por plano desde 19/11/2026): cada cartão da página inicial leva à página do plano dele; planos.html é um
    // resumo com os dois cartões, cada um levando à página do plano; cada página de plano mostra só o que é dele, com os recursos (links que
    // abrem), como funciona a assinatura e os caminhos para o outro plano e o resumo; nada passa da largura da tela.
    {
      const p = await pagina();
      await p.goto(`${origem}/`);
      const cartoes = await p.$$eval('section[aria-labelledby="planos"] article.plano-link', (as) => as.map((a) => ({ links: a.querySelectorAll('a, button, input').length, nome: a.querySelector('a').textContent, href: a.querySelector('a').getAttribute('href') })));
      ok('planos: os dois cartões da página inicial com um link só cada, com nome claro, para a página de cada plano', JSON.stringify(cartoes) === JSON.stringify([{ links: 1, nome: 'Ver o que o plano Individual inclui', href: 'planos/individual.html' }, { links: 1, nome: 'Ver o que o plano Família inclui', href: 'planos/familia.html' }]), JSON.stringify(cartoes));
      // D-127: cada cartão mostra também o anual, logo abaixo do mensal, com o equivalente por mês dito como equivalente.
      const anuais = await p.$$eval('section[aria-labelledby="planos"] article.plano-link', (as) => as.map((a) => [a.querySelector('.preco').textContent, a.querySelector('.preco-anual')?.textContent ?? ''].map((t) => t.replace(/\u00a0/g, ' '))));
      ok('planos: cada cartão da página inicial com o mensal e o anual (com o equivalente por mês), do núcleo',
        JSON.stringify(anuais) === JSON.stringify([['R$ 29,90 por mês', 'ou R$ 269,90 por ano (equivale a R$ 22,49 por mês, R$ 88,90 a menos que 12 mensalidades)'], ['R$ 69,90 por mês', 'ou R$ 629,90 por ano (equivale a R$ 52,49 por mês, R$ 208,90 a menos que 12 mensalidades)']]), JSON.stringify(anuais));
      // Clicar no cartão (fora do texto do link) abre a página do plano. O clique é no canto de cima, à direita, em cima da fita "Em breve"
      // (D-128), que é só desenho e não pega o clique.
      const familia = p.locator('section[aria-labelledby="planos"] article.plano-link').nth(1);
      await familia.scrollIntoViewIfNeeded();
      const caixa = await familia.boundingBox();
      await p.mouse.click(caixa.x + caixa.width - 20, caixa.y + 20);
      await p.waitForURL(/\/planos\/familia(\.html)?$/);
      ok('planos: clicar em qualquer ponto do cartão Família da página inicial abre a página do plano Família', (await p.textContent('h1')) === 'Plano Família');
      // O resumo: só os dois cartões e o que muda, sem a lista de recursos; cada cartão leva à página do plano.
      await p.goto(`${origem}/planos`);
      const resumo = await p.evaluate(() => ({
        secoes: [...document.querySelectorAll('main h2')].map((h) => h.id),
        recursos: document.querySelectorAll('.grupos-recursos, .recursos-plano').length,
        cartoes: [...document.querySelectorAll('article.plano-link')].map((a) => ({ titulo: a.querySelector('h3').textContent, links: a.querySelectorAll('a').length, href: a.querySelector('a').getAttribute('href') })),
      }));
      ok('planos: planos.html é um resumo curto, com os dois cartões (um link só cada, para a página do plano) e sem a lista de recursos',
        JSON.stringify(resumo.secoes) === JSON.stringify(['comparar']) && resumo.recursos === 0 && JSON.stringify(resumo.cartoes) === JSON.stringify([{ titulo: 'Individual (em breve)', links: 1, href: 'planos/individual.html' }, { titulo: 'Família (em breve)', links: 1, href: 'planos/familia.html' }]), JSON.stringify(resumo));
      const individual = p.locator('article.plano-link').nth(0);
      const caixaInd = await individual.boundingBox();
      await p.mouse.click(caixaInd.x + caixaInd.width - 20, caixaInd.y + 20);
      await p.waitForURL(/\/planos\/individual(\.html)?$/);
      ok('planos: clicar no cartão Individual do resumo abre a página do plano Individual', (await p.textContent('h1')) === 'Plano Individual');
      // Cada página de plano: só o que é dele, os 14 recursos com links que abrem, a assinatura e os caminhos do fim.
      for (const [caminho, nome, outro, secoesEsperadas] of [['planos/individual', 'Individual', 'Família', ['para-quem', 'inclui', 'assinatura']], ['planos/familia', 'Família', 'Individual', ['para-quem', 'inclui', 'assinatura', 'perguntas']]]) {
        await p.goto(`${origem}/${caminho}`);
        const pg = await p.evaluate(() => {
          const main = document.querySelector('main');
          const texto = main.innerText.replace(/\u00a0/g, ' ');
          return {
            h1: document.querySelector('h1').textContent,
            secoes: [...main.querySelectorAll('h2')].map((h) => h.id),
            precos: (texto.match(/R\$ ?\d/g) || []).length,
            precoNaCapa: (document.querySelector('.capa .preco-capa')?.textContent || '').replace(/\u00a0/g, ' '),
            anualNaCapa: (document.querySelector('.capa .preco-capa-anual')?.textContent || '').replace(/\u00a0/g, ' '),
            titular: /titular/i.test(texto), convite: /Convite por link/.test(texto), umaPessoa: /Para uma pessoa: a assinatura é sua\./.test(texto),
            negocio: /Incluído na assinatura: um negócio por pessoa, sem custo a mais\./.test(texto), compartilha: /compartilh/i.test(texto),
            notOpen: /abre no lançamento|Até lá, nada é cobrado|Assinatura em breve\. Por enquanto/.test(texto), trial: /14 dias grátis, sem cartão/.test(texto),
            links: [...document.querySelectorAll('#inclui ~ .grupos-recursos a')].map((a) => a.href),
            fim: [...document.querySelectorAll('main > section.bloco .acoes a')].map((a) => [a.textContent, a.getAttribute('href')]),
            // D-129: a capa nunca é beco sem saída: antes do lançamento, a linha da assinatura em breve e "Conheça o app".
            capa: [...document.querySelectorAll('.capa .acoes a')].map((a) => [a.textContent, a.getAttribute('href')]),
            avisoNaCapa: document.querySelector('.capa .estado-produto')?.textContent || null,
            telegram: [...document.querySelectorAll('.recurso-cartao')].find((c) => c.querySelector('h4')?.textContent === 'Anotar pelo Telegram')?.querySelector('.recurso-onde')?.textContent || null,
          };
        });
        const quebrados = [];
        for (const l of pg.links) {
          const [endereco, ancora] = l.split('#');
          const r = await ctx.request.get(endereco);
          if (!r.ok() || (ancora && !(await r.text()).includes(`id="${ancora}"`))) quebrados.push(l);
        }
        const familiaPg = nome === 'Família';
        // D-127: na capa, o mensal e, logo abaixo, o anual com o equivalente por mês (três valores, todos na capa).
        // Desde 27/11/2026 (jornada de compra, S6), com a diferença para 12 mensalidades; no Família, também a conta do preço por casa em "Para
        // quem é" (S4): 6 valores em reais no Família, 4 no Individual.
        const anualEsperado = nome === 'Família' ? 'ou R$ 629,90 por ano (equivale a R$ 52,49 por mês, R$ 208,90 a menos que 12 mensalidades)' : 'ou R$ 269,90 por ano (equivale a R$ 22,49 por mês, R$ 88,90 a menos que 12 mensalidades)';
        ok(`planos: a página do plano ${nome} tem o nome, o preço mensal (com "Em breve" antes do lançamento) e o anual só na capa, para quem é, os 14 recursos com links que abrem, a assinatura (14 dias sem cartão, sem a frase de "abre no lançamento", D-128) e o Espaço Negócio incluído, sem negócio compartilhado`,
          pg.h1 === `Plano ${nome}` && JSON.stringify(pg.secoes) === JSON.stringify(secoesEsperadas) && pg.precos === (nome === 'Família' ? 6 : 4) && /^R\$ \d+,\d{2} por mês Em breve$/.test(pg.precoNaCapa) && pg.anualNaCapa === anualEsperado && pg.links.length === 14 && quebrados.length === 0 && pg.negocio && !pg.compartilha && !pg.notOpen && pg.trial,
          JSON.stringify({ ...pg, links: pg.links.length, quebrados }));
        ok(`planos: a página do plano ${nome} mostra só o que é do plano dele`, familiaPg ? pg.titular && pg.convite && !pg.umaPessoa : !pg.titular && !pg.convite && pg.umaPessoa, JSON.stringify({ titular: pg.titular, convite: pg.convite, umaPessoa: pg.umaPessoa }));
        ok(`planos (D-129): antes do lançamento, a capa do plano ${nome} diz à vista "A assinatura abre em breve, na web e nas lojas." e leva a "Conheça o app"; ${familiaPg ? 'o Telegram anota no Pessoal ou na Família em que a pessoa anota' : 'sem etiqueta de onde vale'}`,
          pg.avisoNaCapa === 'A assinatura abre em breve, na web e nas lojas.' && JSON.stringify(pg.capa) === JSON.stringify([['Conheça o app', '../app/index.html']]) &&
            pg.telegram === (familiaPg ? 'No seu Pessoal ou na Família em que você anota.' : null),
          JSON.stringify({ capa: pg.capa, aviso: pg.avisoNaCapa, telegram: pg.telegram }));
        const outroHref = familiaPg ? 'individual.html' : 'familia.html';
        ok(`planos: no fim da página do plano ${nome}, "Ver o plano ${outro}" e "Comparar os planos"`, JSON.stringify(pg.fim) === JSON.stringify([[`Ver o plano ${outro}`, outroHref], ['Comparar os planos', '../planos.html']]), JSON.stringify(pg.fim));
      }
      await p.click('main > section.bloco .acoes a:text-is("Comparar os planos")');
      await p.waitForURL(/\/planos(\.html)?$/);
      ok('planos: "Comparar os planos" volta ao resumo', (await p.textContent('h1')) === 'Planos da Clarevo');
      const largas = [];
      for (const largura of [320, 390, 1280]) {
        await p.setViewportSize({ width: largura, height: 900 });
        for (const c of ['', 'planos', 'planos/individual', 'planos/familia']) {
          await p.goto(`${origem}/${c}`);
          if (await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) largas.push(`${c || 'início'} em ${largura} px`);
        }
      }
      ok('planos: nada passa da largura da tela em 320, 390 e 1280 px (início, o resumo e as duas páginas de plano)', largas.length === 0, largas.join(' | '));
      await p.setViewportSize({ width: 390, height: 900 });
      await p.close();
    }

    // 7c3b. "O que o plano inclui" em cartões (23/11/2026, pedido do Enzo: a lista de links sublinhados seguidos de frases longas estava
    // "feia, pouco intuitiva e não apresentável") e os atalhos que tomaram o lugar das listas de links da Ajuda, do Suporte e da 404. Em cada
    // página de plano: quatro grupos (h3) com 3, 3, 3 e 5 cartões; cada cartão com o ícone, um link só (o nome, num h4), "Ver como funciona"
    // e nenhum link sublinhado; a grade com três colunas em 1280 px (o último grupo com dois e três), duas em 820 px (o primeiro na linha
    // toda) e uma em 390 px; o clique em qualquer ponto do cartão abre o destino do link (no celular, o cartão inteiro é a área de toque); o
    // foco aparece no cartão; nada passa da largura da tela em 360 px; e o texto dos cartões e dos atalhos com contraste AA no tema claro,
    // no escuro do aparelho e no "Escuro" escolhido no rodapé.
    {
      const p = await pagina();
      const GRUPOS = [['O dia a dia', 3], ['Cartões, extratos e notas', 3], ['Guardar, investir e aprender', 3], ['Do seu jeito', 5]];
      const LINHAS = { 1280: [[3], [3], [3], [2, 3]], 820: [[1, 2], [1, 2], [1, 2], [1, 2, 2]], 390: [[1, 1, 1], [1, 1, 1], [1, 1, 1], [1, 1, 1, 1, 1]] };
      const lerCartoes = () => p.evaluate(() => {
        const secao = document.querySelector('section[aria-labelledby="inclui"]');
        const porLinha = (g) => { const linhas = new Map(); for (const c of g.children) { const t = Math.round(c.getBoundingClientRect().top); linhas.set(t, (linhas.get(t) || 0) + 1); } return [...linhas.entries()].sort((a, b) => a[0] - b[0]).map((x) => x[1]); };
        return {
          grupos: [...secao.querySelectorAll('.recursos-plano')].map((g) => [g.querySelector('h3').textContent, g.querySelectorAll('.recurso-cartao').length]),
          cartoes: [...secao.querySelectorAll('.recurso-cartao')].map((c) => ({ links: c.querySelectorAll('a').length, nome: c.querySelector('h4 > a')?.textContent, icone: !!c.querySelector('.recurso-icone > svg[aria-hidden="true"]'), acao: c.querySelector('.recurso-acao')?.textContent })),
          sublinhados: [...secao.querySelectorAll('a')].filter((a) => getComputedStyle(a).textDecorationLine.includes('underline')).map((a) => a.textContent),
          linhas: [...secao.querySelectorAll('.recursos-grade')].map(porLinha),
        };
      });
      const estrutura = [];
      for (const largura of [1280, 820, 390]) {
        await p.setViewportSize({ width: largura, height: 900 });
        for (const caminho of ['planos/individual', 'planos/familia']) {
          await p.goto(`${origem}/${caminho}`);
          const e = await lerCartoes();
          const certo = JSON.stringify(e.grupos) === JSON.stringify(GRUPOS) && e.cartoes.length === 14 && e.cartoes.every((c) => c.links === 1 && c.nome && c.icone && c.acao === 'Ver como funciona') && e.sublinhados.length === 0 && JSON.stringify(e.linhas) === JSON.stringify(LINHAS[largura]);
          if (!certo) estrutura.push(`${caminho} em ${largura} px: ${JSON.stringify({ ...e, cartoes: e.cartoes.filter((c) => c.links !== 1 || !c.nome || !c.icone || c.acao !== 'Ver como funciona') })}`);
        }
      }
      ok('planos em cartões: 4 grupos (3, 3, 3 e 5), 14 cartões com ícone, um link só (o nome) e "Ver como funciona", nenhum link sublinhado, 3 colunas em 1280 px, 2 em 820 px e 1 em 390 px, sem cartão sozinho', estrutura.length === 0, estrutura.join(' | '));

      // No celular, o cartão inteiro é a área de toque: os quatro cantos de cada cartão caem no link dele.
      await p.setViewportSize({ width: 390, height: 900 });
      await p.goto(`${origem}/planos/familia`);
      const foraDoLink = await p.evaluate(() => [...document.querySelectorAll('.recurso-cartao')].flatMap((c) => {
        // Sem a rolagem suave do site, que deixaria a medida para depois da animação.
        c.scrollIntoView({ block: 'center', behavior: 'instant' });
        const r = c.getBoundingClientRect();
        const link = c.querySelector('h4 > a');
        const pontos = [[r.left + 8, r.top + 8], [r.right - 8, r.top + 8], [r.left + 8, r.bottom - 8], [r.right - 8, r.bottom - 8]];
        return pontos.filter(([x, y]) => document.elementFromPoint(x, y)?.closest('a') !== link).map(() => `${link.textContent} (${Math.round(r.height)} px)`);
      }));
      ok('planos em cartões: no celular, os quatro cantos de cada cartão (todos com mais de 44 px de altura) abrem o link do cartão', foraDoLink.length === 0, [...new Set(foraDoLink)].join(' | '));
      // No computador, clicar no canto do cartão (longe do nome) abre o destino.
      await p.setViewportSize({ width: 1280, height: 900 });
      await p.goto(`${origem}/planos/individual`);
      const investir = p.locator('.recurso-cartao', { has: p.locator('h4 > a', { hasText: /^Investir$/ }) });
      await investir.scrollIntoViewIfNeeded();
      const caixa = await investir.boundingBox();
      await p.mouse.click(caixa.x + caixa.width - 12, caixa.y + caixa.height - 12);
      await p.waitForURL(/\/ajuda\/organizar(\.html)?#guia-investimentos$/);
      ok('planos em cartões: clicar no canto do cartão Investir abre "Investir" na Ajuda', true);
      // O foco pelo teclado aparece no cartão inteiro.
      await p.goto(`${origem}/planos/individual`);
      await p.evaluate(() => { const h = document.getElementById('inclui'); h.tabIndex = -1; h.focus(); });
      await p.keyboard.press('Tab');
      const foco = await p.evaluate(() => { const a = document.activeElement; const c = a.closest('.recurso-cartao'); const cs = c && getComputedStyle(c); return { nome: a.textContent, contorno: cs && `${cs.outlineStyle} ${cs.outlineWidth}` }; });
      ok('planos em cartões: com Tab, o foco vai ao primeiro recurso e o contorno de 3 px aparece no cartão', foco.nome === 'Anotar e Resumo' && foco.contorno === 'solid 3px', JSON.stringify(foco));

      // Os atalhos: as perguntas da Ajuda em três colunas no computador (todas as linhas cheias) e numa no celular; no Suporte, até duas;
      // na 404, os caminhos em pílulas. Cada atalho com pelo menos 56 px e cada pílula com 44 px; nenhuma lista sublinhada sobrou.
      const atalhos = [];
      for (const [largura, caminho, colunas] of [[1280, 'ajuda/', 3], [390, 'ajuda/', 1], [1280, 'suporte', 2], [390, 'suporte', 1]]) {
        await p.setViewportSize({ width: largura, height: 900 });
        await p.goto(`${origem}/${caminho}`);
        const a = await p.evaluate(() => {
          const lista = document.querySelector('ul.atalhos');
          const linhas = new Map();
          for (const li of lista.children) { const t = Math.round(li.getBoundingClientRect().top); linhas.set(t, (linhas.get(t) || 0) + 1); }
          const itens = [...lista.querySelectorAll('a.atalho')];
          return { porLinha: Math.max(...linhas.values()), itens: itens.length, baixos: itens.filter((i) => i.getBoundingClientRect().height < 56).length, comTema: itens.every((i) => i.querySelector('small')?.textContent), sublinhadas: [...lista.closest('section').querySelectorAll('li > a')].filter((x) => !x.closest('.atalhos') && getComputedStyle(x).textDecorationLine.includes('underline')).length };
        });
        if (a.porLinha !== colunas || a.itens < 3 || a.baixos || !a.comTema || a.sublinhadas) atalhos.push(`${caminho} em ${largura} px: ${JSON.stringify(a)}`);
      }
      await p.goto(`${origem}/404`);
      const pilulas = await p.evaluate(() => [...document.querySelectorAll('main .nav-temas a')].map((x) => Math.round(x.getBoundingClientRect().height)));
      if (pilulas.length !== 5 || pilulas.some((h) => h < 44)) atalhos.push(`404: ${JSON.stringify(pilulas)}`);
      ok('atalhos: as perguntas mais comuns da Ajuda (3 por linha no computador) e do Suporte (até 2) em caixas de 56 px com o tema, e os caminhos da 404 em pílulas de 44 px, sem lista de links sublinhados', atalhos.length === 0, atalhos.join(' | '));

      // Nada passa da largura da tela em 360 px nas páginas que mudaram.
      await p.setViewportSize({ width: 360, height: 800 });
      const largas360 = [];
      for (const caminho of ['planos/individual', 'planos/familia', 'ajuda/', 'suporte', '404']) {
        await p.goto(`${origem}/${caminho}`);
        if (await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) largas360.push(caminho);
      }
      ok('planos em cartões e atalhos: nada passa da largura da tela em 360 px (as duas páginas de plano, a Ajuda, o Suporte e a 404)', largas360.length === 0, largas360.join(' | '));
      await p.setViewportSize({ width: 390, height: 900 });
      await p.close();

      // Contraste AA (4,5:1 para o texto; 3:1 para o ícone) no tema claro, no escuro do aparelho e no "Escuro" escolhido no rodapé.
      const contrasteDaPagina = () => {
        const rgb = (c) => (c.match(/[\d.]+/g) || []).map(Number);
        const lum = ([r, g, b]) => [r, g, b].map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }).reduce((t, v, i) => t + v * [0.2126, 0.7152, 0.0722][i], 0);
        const fundoDe = (e) => { for (let x = e; x; x = x.parentElement) { const c = rgb(getComputedStyle(x).backgroundColor); if (c.length >= 3 && (c.length < 4 || c[3] > 0)) return c; } return [255, 255, 255]; };
        const razao = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
        const baixos = [];
        const conferir = (seletor, minimo) => { for (const e of document.querySelectorAll(seletor)) { const r = razao(rgb(getComputedStyle(e).color), fundoDe(e)); if (r < minimo) baixos.push(`${seletor} "${e.textContent.trim().slice(0, 24)}" ${r.toFixed(2)}`); } };
        conferir('.recursos-plano h3, .recurso-cartao h4 a, .recurso-texto, .recurso-nota, .recurso-onde, .recurso-acao, .lista-marcada li, .atalho-titulo, .atalho small, main .nav-temas a', 4.5);
        conferir('.recurso-icone, .recurso-seta', 3);
        return { baixos, conferidos: document.querySelectorAll('.recurso-cartao, .atalho, main .nav-temas a').length };
      };
      const contrastes = [];
      for (const [nome, opcoes, escolha] of [['claro', { colorScheme: 'light' }, null], ['escuro do aparelho', { colorScheme: 'dark' }, null], ['"Escuro" escolhido no rodapé', { colorScheme: 'light' }, 'escuro']]) {
        const c = await navegador.newContext({ ...opcoes, viewport: { width: 1280, height: 900 }, locale: 'pt-BR' });
        if (escolha) await c.addInitScript((v) => { try { localStorage.setItem('clarevo.site.tema.v1', v); } catch (e) { /* nada */ } }, escolha);
        const q = await c.newPage();
        for (const caminho of ['planos/individual', 'planos/familia', 'ajuda/', 'suporte', '404']) {
          await q.goto(`${origem}/${caminho}`);
          const r = await q.evaluate(contrasteDaPagina);
          const fundo = await q.evaluate(() => getComputedStyle(document.body).backgroundColor);
          if (!r.conferidos || r.baixos.length || (nome !== 'claro') !== (fundo === 'rgb(19, 30, 62)')) contrastes.push(`${caminho}, ${nome}: ${JSON.stringify({ ...r, fundo })}`);
        }
        await c.close();
      }
      ok('planos em cartões e atalhos: contraste AA do texto (4,5:1) e dos ícones (3:1) no tema claro, no escuro do aparelho e no "Escuro" escolhido no rodapé', contrastes.length === 0, contrastes.join(' | '));
    }

    // 7c4. Celulares no centro dos cartões, "Quem vê os seus dados" em Segurança e a faixa de confiança da capa (D-115). Em 1280 px, a
    // moldura de cada celular fica no centro do cartão que a tem (início, O app, Para empresas) e, em Segurança, no centro da coluna dela,
    // ao lado dos quatro cartões em 2 x 2, com a mesma altura em cada linha. A faixa da capa (início e O app) é um link só para a página
    // Segurança e privacidade (desde 19/11/2026; antes, para o bloco "O que a Clarevo não faz", que ficou recolhido no fim dela), e as
    // seções antigas saíram. Em Segurança, a parte visível começa pelo essencial, quem vê, como protegemos e o que guardamos, e quatro
    // perguntas recolhidas (fechadas) ficam no fim, com o aviso de saúde dentro da primeira. Nada passa da largura da tela em 320, 390 e 1280 px.
    {
      const p = await pagina();
      await p.setViewportSize({ width: 1280, height: 900 });
      const fora = [];
      for (const c of ['', 'app/', 'empresas/', 'seguranca']) {
        await p.goto(`${origem}/${c}`);
        // Desde 27/11/2026, parte dos celulares de O app e de Para empresas fica num <details> recolhido: abertos, para medir de verdade.
        await p.evaluate(() => document.querySelectorAll('main details').forEach((d) => { d.open = true; }));
        // Desde 25/11/2026 (D-125), o celular de "Como funciona" (início) fica na coluna ao lado dos passos, como o de Segurança.
        const r = await p.evaluate(() => [...document.querySelectorAll('.cartao > figure.celular, .com-celular > figure.celular, .passos-com-celular > figure.celular')].map((f) => {
          const m = f.querySelector('.celular-moldura').getBoundingClientRect();
          const pai = f.parentElement;
          let caixa = pai.getBoundingClientRect();
          if (pai.classList.contains('com-celular') || pai.classList.contains('passos-com-celular')) {
            const colunas = getComputedStyle(pai).gridTemplateColumns.split(' ').map(parseFloat);
            const gap = parseFloat(getComputedStyle(pai).columnGap) || 0;
            caixa = { left: caixa.left + colunas[0] + gap, width: colunas[1] };
          }
          return { nome: (pai.querySelector('h3') || pai.querySelector('h2') || { textContent: pai.className }).textContent.trim().slice(0, 30), dif: Math.abs((m.left + m.width / 2) - (caixa.left + caixa.width / 2)) };
        }));
        if (!r.length) fora.push(`${c || 'início'}: nenhum celular em cartão`);
        for (const x of r) if (x.dif > 3) fora.push(`${c || 'início'}: ${x.nome} (${Math.round(x.dif)} px)`);
      }
      ok('celulares: em 1280 px, a moldura de cada celular fica no centro do cartão (O app, Para empresas) e da coluna dela (início, em "Como funciona", e Segurança)', fora.length === 0, fora.join(' | '));
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
          return { links: a ? a.length : 0, href: a && a[0] ? a[0].getAttribute('href') : '', itens: f ? [...f.querySelectorAll('.confianca-item')].map((i) => i.textContent) : [], mais: f && f.querySelector('.confianca-mais') ? f.querySelector('.confianca-mais').textContent : '', nome: a && a[0] ? a[0].textContent.replace(/\s+/g, ' ').trim() : '', antigas: document.querySelectorAll('#nao-e, #nao-faz').length };
        }));
      }
      ok('faixa de confiança: na capa do início e de O app, três frases num link só para a página Segurança e privacidade (sem âncora), com o convite "Segurança e privacidade", nome em frase para leitor de tela, e sem as seções antigas',
        faixas.every((f) => f.links === 1 && /(^|\/)seguranca\.html$/.test(f.href) && JSON.stringify(f.itens) === JSON.stringify(['Você decide o que entra', 'Sem anúncios e sem venda de dados', 'Não movimenta dinheiro nem oferece crédito']) && f.mais === 'Segurança e privacidade' && /crédito\. Mais em Segurança e privacidade\.$/.test(f.nome) && f.antigas === 0), JSON.stringify(faixas));
      await p.click('.capa .confianca a');
      await p.waitForURL(/\/seguranca(\.html)?$/);
      const seg = await p.evaluate(() => ({
        titulo: document.querySelector('h1').textContent,
        topo: window.scrollY,
        secoes: [...document.querySelectorAll('main h2')].map((h) => h.id),
        duvidas: [...document.querySelectorAll('details.duvida')].map((d) => ({ id: d.id, resumo: d.querySelector('summary').textContent, aberta: d.open, caixa: getComputedStyle(d).borderTopLeftRadius !== '0px' || getComputedStyle(d).backgroundColor !== 'rgba(0, 0, 0, 0)' })),
        avisoVisivel: [...document.querySelectorAll('main p')].some((e) => /não é atendimento de saúde e não promete/.test(e.textContent) && e.checkVisibility()),
        ultimo: (() => { const s = document.querySelector('section[aria-labelledby="detalhes"] .miolo'); const l = s.lastElementChild; return l.tagName === 'P' && /^Leia também a Política de privacidade/.test(l.textContent) && l.previousElementSibling.classList.contains('duvidas'); })(),
        links: [...document.querySelectorAll('a[href^="#"]')].map((a) => a.getAttribute('href')).filter((h) => /^#(nao-faz|nao-guardamos|este-site|excluir)$/.test(h)),
      }));
      ok('faixa de confiança: o link abre Segurança e privacidade no topo; a parte visível começa pelo essencial, quem vê, como protegemos e o que guardamos; as quatro perguntas do fim começam fechadas, sem caixa, e só a linha dos links vem depois delas',
        seg.titulo === 'Segurança e privacidade' && seg.topo === 0 && JSON.stringify(seg.secoes) === JSON.stringify(['essencial', 'quem-ve', 'protecao', 'guardamos', 'detalhes']) &&
        JSON.stringify(seg.duvidas.map((d) => [d.id, d.resumo])) === JSON.stringify([['nao-faz', 'O que a Clarevo faz e não faz'], ['nao-guardamos', 'Dados que a Clarevo não guarda'], ['este-site', 'Sobre este site'], ['excluir', 'Como excluir a conta']]) &&
        seg.duvidas.every((d) => !d.aberta && !d.caixa) && !seg.avisoVisivel && seg.ultimo && seg.links.length === 0, JSON.stringify(seg));
      // Abrir "O que a Clarevo faz e não faz" (pelo teclado: foco no resumo e Enter) mostra os cinco itens, a nota e o aviso de saúde.
      const resumo = p.locator('#nao-faz > summary');
      await resumo.focus();
      await p.keyboard.press('Enter');
      const aberto = await p.evaluate(() => { const d = document.querySelector('#nao-faz'); return { aberta: d.open, itens: d.querySelectorAll('li').length, aviso: [...d.querySelectorAll('p')].some((e) => /^A Clarevo não é atendimento de saúde e não promete resultado financeiro/.test(e.textContent) && e.checkVisibility()), outras: [...document.querySelectorAll('details.duvida:not(#nao-faz)')].every((x) => !x.open) }; });
      ok('segurança: Enter no resumo abre "O que a Clarevo faz e não faz", com os cinco itens e o aviso de saúde, e as outras perguntas continuam fechadas', aberto.aberta && aberto.itens === 5 && aberto.aviso && aberto.outras, JSON.stringify(aberto));
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

    // 7c5. Espaço Negócio (D-115, a partir de D-113): a porta "Quem trabalha por conta e MEI" da página inicial, que leva à página do MEI
    // (D-125), com o que o Espaço Negócio faz hoje e nada do Clarevo Plus; o recurso em O app (#negocio), com a tela da demonstração no
    // centro e o link da Ajuda; a frase de docs/52 nas páginas dos planos; e a entrada na Ajuda, achada pela busca.
    {
      const p = await pagina();
      await p.goto(`${origem}/`);
      const portas = await p.$$eval('section[aria-labelledby="para-quem"] li.porta', (ls) => ls.map((l) => ({ titulo: l.querySelector('h3').textContent, links: l.querySelectorAll('a').length, href: l.querySelector('a').getAttribute('href') })));
      ok('as três portas da página inicial: pessoas e famílias, quem trabalha por conta e MEI e empresas, cada uma com um link só',
        JSON.stringify(portas) === JSON.stringify([{ titulo: 'Pessoas e famílias', links: 1, href: 'planos/familia.html' }, { titulo: 'Quem trabalha por conta e MEI', links: 1, href: 'mei.html' }, { titulo: 'Empresas', links: 1, href: 'empresas/index.html' }]), JSON.stringify(portas));
      // Clicar em qualquer ponto da porta (fora do texto do link) abre a página dela.
      const portaMei = p.locator('section[aria-labelledby="para-quem"] li.porta').nth(1);
      await portaMei.scrollIntoViewIfNeeded();
      const caixaMei = await portaMei.boundingBox();
      await p.mouse.click(caixaMei.x + caixaMei.width - 16, caixaMei.y + 16);
      await p.waitForURL(/\/mei(\.html)?$/);
      const mei = await p.evaluate(() => {
        const texto = document.querySelector('main').innerText;
        return {
          h1: document.querySelector('h1').textContent,
          cartoes: [...document.querySelectorAll('#o-que-faz ~ .recursos-grade > li h3')].map((h) => h.textContent),
          links: [...document.querySelectorAll('#o-que-faz ~ .recursos-grade a')].length,
          mei: /limite anual do MEI/.test(texto) && /DAS do mês/.test(texto),
          incluido: /Incluído na assinatura/.test(texto),
          plus: /Plus|sóci|ajudante|compartilh|contador|Contabilidade|vários negócios/.test(texto),
          semImposto: /não calcula imposto/.test(texto),
          tela: (() => { const i = document.querySelector('.capa figure.celular img'); return i ? i.complete && i.naturalWidth > 0 && /^Tela do negócio/.test(i.alt) : false; })(),
          // D-128: nada de demonstração na página do MEI; "Assine aqui" (para os planos, antes do lançamento) e "Conheça o app".
          demo: document.querySelectorAll('a[href*="demo.clarevo"]').length,
          chamadas: [...document.querySelectorAll('.capa .acoes a')].map((a) => [a.textContent, a.getAttribute('href')]),
          ajuda: document.querySelector('a[href="ajuda/negocio.html#guia-negocio"]') !== null,
        };
      });
      ok('página do MEI: o título, os seis cartões do que o Espaço Negócio faz hoje (sem link), o limite e os lembretes do MEI, "Incluído na assinatura", "Assine aqui" e "Conheça o app" (sem demonstração, D-128) e a Ajuda, sem nada do Plus nem cálculo de imposto',
        mei.h1 === 'O dinheiro do negócio separado do da casa.' && JSON.stringify(mei.cartoes) === JSON.stringify(['O negócio no espaço dele', 'Categorias de quem vende e presta serviço', 'Quanto entrou, saiu e sobrou', 'Retirada para o Pessoal', 'A receber', 'Nota e quem pagou']) &&
        mei.links === 0 && mei.mei && mei.incluido && !mei.plus && mei.semImposto && mei.tela && mei.demo === 0 && JSON.stringify(mei.chamadas) === JSON.stringify([['Assine aqui', 'planos.html'], ['Conheça o app', 'app/index.html']]) && mei.ajuda, JSON.stringify(mei));
      // D-128 (pedido do Enzo): os links de texto embaixo dos botões da chamada final ("Como usar o Espaço Negócio, na Ajuda · Ver os
      // planos") com o respiro da escala do site, no celular (16 px) e no computador (20 px), nunca colados nos botões.
      const respiros = [];
      for (const largura of [390, 1280]) {
        await p.setViewportSize({ width: largura, height: 900 });
        respiros.push(await p.evaluate(() => {
          const acoes = document.querySelector('.chamada-final .acoes');
          const abaixo = acoes.nextElementSibling;
          return Math.round(abaixo.getBoundingClientRect().top - acoes.getBoundingClientRect().bottom);
        }));
      }
      await p.setViewportSize({ width: 390, height: 900 });
      ok('página do MEI: os links de texto embaixo dos botões da chamada final têm 16 px de respiro no celular e 20 px no computador', respiros[0] >= 16 && respiros[1] >= 20, JSON.stringify(respiros));
      await p.goto(`${origem}/app/#negocio`);
      const recurso = await p.evaluate(() => {
        const a = document.querySelector('#negocio');
        const img = a.querySelector('figure.celular img');
        return { titulo: a.querySelector('h3').textContent, ajuda: a.querySelector('a[href="../ajuda/negocio.html#guia-negocio"]') !== null, img: img ? { ok: img.complete && img.naturalWidth > 0, alt: img.alt } : null, plano: /Incluído na assinatura: um negócio por pessoa, sem custo a mais\./.test(a.textContent) };
      });
      ok('Espaço Negócio: o recurso em O app, com a tela do negócio, o link da Ajuda e "Incluído na assinatura"', recurso.titulo === 'Espaço Negócio' && recurso.ajuda && recurso.plano && recurso.img && /^Tela do negócio/.test(recurso.img.alt), JSON.stringify(recurso));
      const negocioNosPlanos = [];
      for (const c of ['planos/individual', 'planos/familia']) {
        await p.goto(`${origem}/${c}`);
        negocioNosPlanos.push(!/Negócio/.test(await p.textContent('#para-quem ~ ul')) && /Incluído na assinatura: um negócio por pessoa, sem custo a mais\./.test(await p.textContent('#inclui ~ .grupos-recursos')) && (await p.$('a[href="../ajuda/negocio.html#guia-negocio"]')) !== null);
      }
      ok('Espaço Negócio: na página de cada plano, "Incluído na assinatura: um negócio por pessoa", fora do que só aquele plano tem', negocioNosPlanos.every(Boolean), JSON.stringify(negocioNosPlanos));
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

    // 7c7. Indicadores mais fáceis de achar (D-115). Desde 25/11/2026 (D-125), "Indicadores de hoje" saiu da página inicial e ficou no painel
    // (`indicadores/`, conferido no bloco 7b), com o link no rodapé de todas as páginas; o cartão dos indicadores continua em Aprender e em
    // Novidades.
    {
      const p = await pagina();
      await p.goto(`${origem}/`);
      const inicio = await p.evaluate(() => ({ painel: document.querySelectorAll('.indicadores-inicio, [data-painel]').length, rodape: document.querySelector('.rodape a[href="indicadores/index.html"]')?.textContent || null, script: [...document.scripts].some((x) => /painel\.js/.test(x.src)) }));
      ok('indicadores: fora da página inicial (sem painel nem script), com o link "Indicadores" no rodapé', inicio.painel === 0 && inicio.rodape === 'Indicadores' && !inicio.script, JSON.stringify(inicio));
      const atalhos = [];
      for (const c of ['aprender/', 'novidades/']) {
        await p.goto(`${origem}/${c}`);
        atalhos.push(await p.evaluate(() => { const a = document.querySelector('main a.cartao[href="../indicadores/index.html"]'); return a ? a.querySelector('.titulo-cartao').textContent : null; }));
      }
      ok('indicadores: o cartão "Indicadores oficiais" em Aprender e em Novidades', atalhos.every((t) => t === 'Indicadores oficiais'), JSON.stringify(atalhos));
      await p.close();
    }

    // 7c8. Tema do site (D-115): no rodapé de todas as páginas, "Igual ao aparelho" (o padrão), "Claro" e "Escuro", com nomes acessíveis
    // (desde 26/11/2026, D-128, discreto: três ícones na linha de baixo do rodapé, sem texto à vista, com os nomes para o leitor de tela e na
    // dica do mouse)
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
      // D-128: discreto. Um grupo pequeno de três ícones (44 px de área de toque cada), na linha de baixo do rodapé, ao lado da razão social
      // no computador, sem nenhum texto à vista; os nomes ficam para o leitor de tela e na dica do mouse (title).
      const discreto = [];
      for (const largura of [390, 1280]) {
        await p.setViewportSize({ width: largura, height: 900 });
        discreto.push(await p.evaluate(() => {
          const f = document.querySelector('footer fieldset.tema-site');
          const r = f.getBoundingClientRect();
          const legal = document.querySelector('.rodape-linha > p').getBoundingClientRect();
          const aVista = (e) => { const b = e.getBoundingClientRect(); return b.width > 1 && b.height > 1; };
          return {
            largura: Math.round(r.width), altura: Math.round(r.height), naLinha: f.closest('.rodape-linha') !== null,
            aoLado: Math.abs((r.top + r.height / 2) - (legal.top + legal.height / 2)) < 12 && r.left > legal.right,
            textoAVista: [...f.querySelectorAll('legend, .so-leitor')].some(aVista),
            dicas: [...f.querySelectorAll('label')].map((l) => l.title),
            alvos: [...f.querySelectorAll('.tema-icone')].every((x) => { const b = x.getBoundingClientRect(); return b.width >= 44 && b.height >= 44; }),
          };
        }));
      }
      await p.setViewportSize({ width: 390, height: 900 });
      ok('tema (D-128): discreto, três ícones num grupo pequeno na linha de baixo do rodapé (ao lado da razão social no computador), sem texto à vista, com a dica de cada opção e 44 px de área de toque',
        discreto.every((d) => d.naLinha && d.largura <= 150 && d.altura <= 52 && !d.textoAVista && JSON.stringify(d.dicas) === JSON.stringify(['Igual ao aparelho', 'Claro', 'Escuro']) && d.alvos) && discreto[1].aoLado, JSON.stringify(discreto));
      ok('tema: o grupo "Tema do site" no rodapé, com "Igual ao aparelho" (marcado), "Claro" e "Escuro", e o site no tema do aparelho', grupo.visivel && grupo.legenda === 'Tema do site' && JSON.stringify(grupo.opcoes.map((o) => o.nome)) === JSON.stringify(['Igual ao aparelho', 'Claro', 'Escuro']) && padrao.tema === 'aparelho' && padrao.escolhida === 'aparelho' && padrao.fundo === FUNDO_CLARO && padrao.guardado === null, JSON.stringify({ grupo, padrao }));
      // Nomes acessíveis pelo papel: cada opção é um botão de opção com o nome (escondido da tela desde D-128, lido pelo leitor de tela).
      const nomes = [];
      for (const n of ['Igual ao aparelho', 'Claro', 'Escuro']) nomes.push(await p.getByRole('radio', { name: n, exact: true }).count());
      ok('tema: cada opção tem o papel de opção e o nome acessível, e o grupo se chama "Tema do site"', nomes.every((n) => n === 1) && (await p.getByRole('group', { name: 'Tema do site' }).count()) === 1, JSON.stringify(nomes));
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
        for (const c of ['', 'novidades/rss', 'planos', 'planos/familia']) {
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
    // promete" aparece na primeira tela (390 x 844 e 1280 x 900). Desde 19/11/2026, o aviso de saúde não fica mais no fim da página inicial
    // nem de Sobre: fica dentro da pergunta recolhida de Segurança e na nota de ressalvas de Para empresas.
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
      const onde = {};
      for (const c of ['', 'sobre', 'seguranca', 'empresas/']) {
        await p.goto(`${origem}/${c}`);
        onde[c || 'início'] = await p.evaluate(() => {
          const ps = [...document.querySelectorAll('main p')].filter((e) => /A Clarevo não é atendimento de saúde e não promete resultado financeiro nem efeito sobre saúde mental/.test(e.textContent));
          return { n: ps.length, recolhido: ps.length > 0 && ps.every((e) => e.closest('details.duvida') && !e.closest('details.duvida').open && !e.checkVisibility()), ressalvas: ps.some((e) => e.matches('.nota-ressalvas')), fimAntigo: document.querySelectorAll('.aviso-final').length };
        });
      }
      ok('aviso de saúde: fora do início e de Sobre; em Segurança, dentro de uma pergunta recolhida (escondido até abrir); em Para empresas, na nota de ressalvas',
        onde['início'].n === 0 && onde.sobre.n === 0 && onde['início'].fimAntigo === 0 && onde.sobre.fimAntigo === 0 && onde.seguranca.n === 1 && onde.seguranca.recolhido && onde['empresas/'].n === 1 && onde['empresas/'].ressalvas, JSON.stringify(onde));
      await p.close();
    }

    // 7c10. O estado do produto (D-125, `scripts/site/estado.js`): um só interruptor para todas as páginas. Desde 26/11/2026 (D-128, pedido do
    // Enzo), nenhum dos dois estados fala de fase de testes, piloto, "quem testa", "Preços no lançamento" ou "abre no lançamento", e a chamada
    // principal de todas as capas é "Assine aqui", com no máximo dois botões; a demonstração só aparece como link de texto em O app e em Use
    // no navegador. Antes do lançamento (o padrão), "Assine aqui" leva aos planos (a seção Planos no início, `planos.html` nas outras
    // páginas), que mostram a fita "Em breve" em cada cartão; o menu diz "Entrar" e leva à tela de entrar; nenhuma página convida a criar conta
    // nem leva à tela inicial do app web (D-064). Lançado (um site gerado à parte com --estado), "Assine aqui" e o menu levam à tela de criar
    // conta do app web, a fita some e o selo aparece só para a loja com endereço. Os botões (o menu, no computador e no menu do celular,
    // "Assine aqui" das capas e o link da versão web em O app) são SEGUIDOS nos dois estados, com clique de verdade e o app web respondido por
    // uma página falsa deste teste (`route`): o clique chega aonde o botão diz e nada sai para a rede.
    {
      const URL_APP = 'https://app.clarevo.app.br';
      const CRIAR = `${URL_APP}/criar-conta`;
      const PAGINAS_DO_ESTADO = ['', 'comece', 'app/', 'web', 'mei', 'planos', 'planos/individual', 'planos/familia', 'sobre', 'imprensa', 'calculadoras/reserva'];
      const lerEstado = async (q, base) => {
        const r = {};
        for (const c of PAGINAS_DO_ESTADO) {
          await q.goto(`${base}/${c}`);
          r[c || 'início'] = await q.evaluate(() => {
            const main = document.querySelector('main').innerText.replace(/\u00a0/g, ' ');
            const pagina = document.body.innerText;
            return {
              testes: /fase de testes?|em testes/i.test(pagina), piloto: /piloto/i.test(pagina), quemTesta: /quem (já )?testa/i.test(pagina), precosNoLancamento: /Preços no lançamento/.test(pagina),
              breve: /em breve/i.test(main), abreNoLancamento: /abre no lançamento|acesso abre/i.test(pagina),
              fita: document.querySelectorAll('.fita-em-breve').length,
              demo: [...document.querySelectorAll('a[href*="demo.clarevo"]')].map((a) => [a.textContent, a.className, a.closest('.botao, .acoes') ? 'botão' : a.parentElement.className]),
              criarConta: document.querySelectorAll('a[href*="/criar-conta"]').length, selos: [...document.querySelectorAll('.selo-loja')].map((a) => [a.textContent, a.getAttribute('href')]),
              // Links para a tela inicial do app web (o endereço sem caminho), na página toda: o menu, o texto e o aviso sem JavaScript.
              raizDoApp: [...document.querySelectorAll('a')].filter((a) => a.href === 'https://app.clarevo.app.br/').length,
              capa: [...document.querySelectorAll('.capa .acoes a')].map((a) => [a.textContent, a.getAttribute('href')]),
              botoesPorBloco: [...document.querySelectorAll('.acoes')].map((b) => b.querySelectorAll('a.botao').length),
              menu: [document.querySelector('.menu-cta')?.textContent, document.querySelector('.menu-cta')?.getAttribute('href')],
              // D-129: lançado, "Entrar" como link de texto ao lado de "Assine aqui"; "Segurança" fora do menu.
              entrar: [document.querySelector('.menu-entrar')?.textContent ?? null, document.querySelector('.menu-entrar')?.getAttribute('href') ?? null],
              seguranca: [...document.querySelectorAll('.menu-lista a')].some((a) => a.textContent === 'Segurança'),
              jaTemConta: [...document.querySelectorAll('.ja-tem-conta a')].map((a) => [a.textContent, a.getAttribute('href')]),
              avisoDaAssinatura: [...document.querySelectorAll('.capa .estado-produto, .aviso-assinatura')].map((e) => e.textContent).filter((t) => t === 'A assinatura abre em breve, na web e nas lojas.').length,
              // O plano anual existe desde a D-127 (o preço por ano nos planos); o Plus continua fora do site.
              plus: /Clarevo Plus/i.test(main),
              anual: /R\$ ?[\d.,]+ por ano/.test(main),
            };
          });
        }
        return r;
      };
      /**
       * Segue os botões: num contexto à parte (sem o registro de "pedido para fora" do resto do roteiro), o app web é respondido por uma
       * página falsa e qualquer outro endereço de fora é recusado e anotado. Clica no botão do cabeçalho (1280 px, no início e numa
       * calculadora), no do menu do celular (390 px), no link da versão web em O app e, no site lançado (`assineNoApp`), em "Assine aqui" das
       * capas do início, de O app, de Use no navegador e do MEI, e devolve aonde cada clique chegou, o que foi pedido ao app web e o que foi
       * recusado.
       */
      const seguirBotoes = async (base, textoDoLink, { assineNoApp = false } = {}) => {
        const contexto = await navegador.newContext({ locale: 'pt-BR' });
        const aoApp = [];
        const recusados = [];
        await contexto.route('**/*', (rota) => {
          const url = rota.request().url();
          if (url.startsWith(base)) return rota.continue();
          if (new URL(url).host === 'app.clarevo.app.br') {
            // Só as navegações contam (o navegador pode pedir o ícone da página falsa, que recebe 404).
            if (!rota.request().isNavigationRequest()) return rota.fulfill({ status: 404, body: '' });
            aoApp.push(url);
            return rota.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: '<!doctype html><html lang="pt-BR"><title>App falso do teste</title><p>App falso do teste</p></html>' });
          }
          recusados.push(url);
          return rota.abort();
        });
        const q = await contexto.newPage();
        const chegou = {};
        const noApp = (u) => u.host === 'app.clarevo.app.br';
        try {
          await q.setViewportSize({ width: 1280, height: 900 });
          for (const c of ['', 'calculadoras/reserva']) {
            await q.goto(`${base}/${c}`);
            await Promise.all([q.waitForURL(noApp), q.click('.menu-cta')]);
            chegou[`cabeçalho de ${c || 'início'}`] = [q.url(), await q.title()];
          }
          await q.setViewportSize({ width: 390, height: 900 });
          await q.goto(`${base}/planos`);
          await q.click('details.menu-movel > summary');
          await Promise.all([q.waitForURL(noApp), q.click('details.menu-movel li:last-child a')]);
          chegou['menu do celular'] = [q.url(), await q.title()];
          await q.goto(`${base}/app/`);
          await Promise.all([q.waitForURL(noApp), q.click(`#onde ~ .grade a:text-is("${textoDoLink}")`)]);
          chegou['O app, onde usar'] = [q.url(), await q.title()];
          // D-129: "Já tem conta? Entrar no navegador", embaixo das chamadas de Use no navegador, nos dois estados.
          await q.goto(`${base}/web`);
          await Promise.all([q.waitForURL(noApp), q.click('.capa .ja-tem-conta a')]);
          chegou['Use no navegador, já tem conta'] = [q.url(), await q.title()];
          if (assineNoApp) {
            // Lançado (D-129): "Entrar" ao lado de "Assine aqui" no cabeçalho e no menu do celular.
            await q.setViewportSize({ width: 1280, height: 900 });
            await q.goto(`${base}/`);
            await Promise.all([q.waitForURL(noApp), q.click('.menu-entrar')]);
            chegou['Entrar do cabeçalho'] = [q.url(), await q.title()];
            await q.setViewportSize({ width: 390, height: 900 });
            await q.goto(`${base}/planos`);
            await q.click('details.menu-movel > summary');
            await Promise.all([q.waitForURL(noApp), q.click('details.menu-movel li:nth-last-child(2) a')]);
            chegou['Entrar do menu do celular'] = [q.url(), await q.title()];
          }
          if (assineNoApp) {
            for (const c of ['', 'app/', 'web', 'mei']) {
              await q.goto(`${base}/${c}`);
              await Promise.all([q.waitForURL(noApp), q.click('.capa .acoes a.botao-principal')]);
              chegou[`Assine aqui de ${c || 'início'}`] = [q.url(), await q.title()];
            }
          }
        } finally {
          await contexto.close();
        }
        return { chegou, aoApp, recusados };
      };
      /** A demonstração, nos dois estados: só em O app e em Use no navegador, um link de texto só em cada, nunca botão. */
      const demoCerta = (r) => Object.entries(r).every(([c, x]) => (c === 'app/' || c === 'web' ? JSON.stringify(x.demo) === JSON.stringify([['Ver uma demonstração com dados fictícios', '', 'link-demo']]) : x.demo.length === 0));
      const semFaseDeTestes = (x) => !x.testes && !x.piloto && !x.quemTesta && !x.precosNoLancamento && !x.abreNoLancamento && !x.plus;
      const p = await pagina();
      const pre = await lerEstado(p, origem);
      const v = Object.values(pre);
      ok('estado do produto, antes do lançamento: nenhuma página fala de fase de testes, piloto, "quem testa", "Preços no lançamento" nem "abre no lançamento" (D-128); nenhuma convida a criar conta, leva à tela inicial do app web nem mostra selo de loja; o menu diz "Entrar" e aponta para a tela de entrar; nada do Plus',
        v.every((x) => semFaseDeTestes(x) && x.criarConta === 0 && x.raizDoApp === 0 && x.selos.length === 0 && x.menu[0] === 'Entrar' && x.menu[1] === `${URL_APP}/entrar` && x.entrar[0] === null && !x.seguranca && x.botoesPorBloco.every((n) => n <= 2)), JSON.stringify(pre));
      ok('estado do produto, antes do lançamento (D-129): os planos nunca são beco sem saída: "A assinatura abre em breve, na web e nas lojas." à vista na seção Planos do início, em planos.html e na capa de cada plano, que leva a "Conheça o app"; Use no navegador diz "Já tem conta? Entrar no navegador" embaixo das duas chamadas',
        pre['início'].avisoDaAssinatura === 1 && ['planos', 'planos/individual', 'planos/familia'].every((c) => pre[c].avisoDaAssinatura === 1) &&
          JSON.stringify(pre.planos.capa) === JSON.stringify([['Conheça o app', 'app/index.html']]) &&
          JSON.stringify(pre['planos/familia'].capa) === JSON.stringify([['Conheça o app', '../app/index.html']]) &&
          JSON.stringify(pre.web.jaTemConta) === JSON.stringify([['Entrar no navegador', `${URL_APP}/entrar`], ['Entrar no navegador', `${URL_APP}/entrar`]]),
        JSON.stringify(Object.fromEntries(['início', 'planos', 'planos/individual', 'planos/familia', 'web'].map((c) => [c, [pre[c].avisoDaAssinatura, pre[c].capa, pre[c].jaTemConta]]))));
      ok('estado do produto, antes do lançamento: "Assine aqui" é a chamada principal das capas (para os planos: a seção Planos no início, planos.html nas outras), com "Conheça o app" ou "Use no navegador" ao lado, e a demonstração só como link de texto em O app e em Use no navegador',
        JSON.stringify(pre['início'].capa) === JSON.stringify([['Assine aqui', '#planos'], ['Conheça o app', 'app/index.html']]) &&
        JSON.stringify(pre.comece.capa) === JSON.stringify([['Assine aqui', 'planos.html'], ['Conheça o app', 'app/index.html']]) &&
        JSON.stringify(pre['app/'].capa) === JSON.stringify([['Assine aqui', '../planos.html'], ['Use no navegador', '../web.html']]) &&
        JSON.stringify(pre.web.capa) === JSON.stringify([['Assine aqui', 'planos.html'], ['Conheça o app', 'app/index.html']]) &&
        JSON.stringify(pre.mei.capa) === JSON.stringify([['Assine aqui', 'planos.html'], ['Conheça o app', 'app/index.html']]) && demoCerta(pre), JSON.stringify(Object.fromEntries(Object.entries(pre).map(([c, x]) => [c, [x.capa, x.demo]]))));
      ok('estado do produto, antes do lançamento: a fita "Em breve" nos dois cartões de plano do início e de planos.html, e o preço anual (D-127) no início e nas três páginas de planos',
        pre['início'].fita === 2 && pre.planos.fita === 2 && ['início', 'planos', 'planos/individual', 'planos/familia'].every((c) => pre[c].anual), JSON.stringify(Object.fromEntries(Object.entries(pre).map(([c, x]) => [c, [x.fita, x.anual]]))));
      // "Assine aqui", antes do lançamento, clicado: no início, a seção Planos na tela; nas outras páginas, planos.html, com a fita nos cartões.
      await p.setViewportSize({ width: 390, height: 844 });
      await p.goto(`${origem}/`);
      await p.click('.capa .acoes a.botao-principal');
      await p.waitForFunction(() => location.hash === '#planos' && Math.abs(document.getElementById('planos').getBoundingClientRect().top) < 120, null, { timeout: 5000 }).catch(() => {});
      const naSecao = await p.evaluate(() => ({ hash: location.hash, topo: Math.round(document.getElementById('planos').getBoundingClientRect().top), fitas: document.querySelectorAll('#planos ~ .grade .fita-em-breve').length }));
      const chegadas = [];
      for (const c of ['app/', 'web', 'mei', 'comece']) {
        await p.goto(`${origem}/${c}`);
        await Promise.all([p.waitForURL(/\/planos(\.html)?$/), p.click('.capa .acoes a.botao-principal')]);
        chegadas.push([c, await p.textContent('h1'), (await p.$$('.plano .fita-em-breve')).length]);
      }
      ok('estado do produto, antes do lançamento: "Assine aqui" clicado leva à seção Planos no início e a planos.html em O app, Use no navegador, MEI e Comece aqui, sempre com a fita "Em breve" nos dois cartões',
        naSecao.hash === '#planos' && Math.abs(naSecao.topo) < 120 && naSecao.fitas === 2 && chegadas.every(([, h1, fitas]) => h1 === 'Planos da Clarevo' && fitas === 2), JSON.stringify({ naSecao, chegadas }));
      await p.close();
      // Antes do lançamento, os cliques do menu e de O app levam à tela de entrar (/entrar), e nunca à tela inicial do app web nem à de criar conta.
      const seguidosPre = await seguirBotoes(origem, 'Entrar na versão web');
      const destinosPre = Object.values(seguidosPre.chegou);
      ok('estado do produto, antes do lançamento: o botão "Entrar" do menu (no computador e no celular), o link "Entrar na versão web" de O app e "Entrar no navegador" de Use no navegador (D-129), clicados, chegam à tela de entrar do app web, e nada sai para a rede',
        destinosPre.length === 5 && destinosPre.every(([url, titulo]) => url === `${URL_APP}/entrar` && titulo === 'App falso do teste') &&
          seguidosPre.aoApp.length === 5 && seguidosPre.aoApp.every((u) => u === `${URL_APP}/entrar`) && seguidosPre.recusados.length === 0,
        JSON.stringify(seguidosPre));
      // O site lançado, gerado à parte com --estado, com as duas lojas: desde a D-129, o endereço do Google Play é o oficial, com o pacote em
      // `?id=` (o teste do núcleo confere que, sem o endereço de uma loja, o selo dela não aparece). Com a assinatura do núcleo ainda fechada
      // (SUBSCRIBE_OPEN), o gerador recusa "lancado": true sozinho; o teste simula a assinatura aberta (simularAssinaturaAberta, que só o
      // --estado aceita e que o --final recusa).
      const APP_STORE = 'https://apps.apple.com/br/app/clarevo/id0000000000';
      const GOOGLE_PLAY = 'https://play.google.com/store/apps/details?id=app.clarevo';
      const gerarLancado = (nome, estado) => {
        const arquivo = path.join(dir, `${nome}.json`);
        fs.writeFileSync(arquivo, JSON.stringify(estado));
        return spawnSync(process.execPath, [path.join(__dirname, 'gerar-site.js'), '--dados', path.join(dir, 'dados.json'), '--referencia', REFERENCIA_DOS_POSTS, '--retrato', path.join(dir, 'retrato.json'), '--noticias', path.join(dir, 'noticias'), '--estado', arquivo, '--saida', path.join(dir, nome)], { encoding: 'utf8' });
      };
      if (!catalogo().PLANOS.aberta) {
        const recusado = gerarLancado('site-lancado-recusado', { lancado: true, lojas: { appStore: APP_STORE } });
        ok('estado do produto: com a assinatura fechada no núcleo, o gerador recusa "lancado": true, diz qual constante mudar e não grava nada',
          recusado.status === 1 && /SUBSCRIBE_OPEN = false em packages\/core\/src\/plano-precos\.ts/.test(recusado.stderr) && /"lancado" para true em scripts\/site\/config\.js/.test(recusado.stderr) && !fs.existsSync(path.join(dir, 'site-lancado-recusado')),
          recusado.stderr.slice(-400));
      }
      const saidaLancada = path.join(dir, 'site-lancado');
      const g = gerarLancado('site-lancado', { lancado: true, lojas: { appStore: APP_STORE, googlePlay: GOOGLE_PLAY }, simularAssinaturaAberta: true });
      ok('estado do produto: o gerador aceita --estado e grava o site lançado, com o endereço oficial do Google Play (details?id=, D-129)', g.status === 0, g.stderr.slice(-400));
      const comParametro = gerarLancado('site-lancado-parametro', { lancado: true, lojas: { googlePlay: `${GOOGLE_PLAY}&utm_source=site` }, simularAssinaturaAberta: true });
      ok('estado do produto (D-129): o gerador recusa o Google Play com outro parâmetro (rastreamento) e não grava nada',
        comParametro.status === 1 && /googlePlay é a página do app/.test(comParametro.stderr) && !fs.existsSync(path.join(dir, 'site-lancado-parametro')), comParametro.stderr.slice(-300));
      const lancado = await servir(saidaLancada, { hostDoSite: true });
      const outro = await navegador.newContext({ viewport: { width: 390, height: 900 }, locale: 'pt-BR' });
      try {
        const q = await outro.newPage();
        const erros = [];
        q.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && erros.push(m.text()));
        q.on('pageerror', (e) => erros.push(e.message));
        const pos = await lerEstado(q, lancado.url);
        const w = Object.values(pos);
        ok('estado do produto, lançado: nenhuma página fala de fase de testes, piloto, "quem testa", "em breve", "abre no lançamento" nem "Preços no lançamento" (inclusive o kit de imprensa), e a fita some; o menu diz "Assine aqui" e aponta para a tela de criar conta, com "Entrar" ao lado (D-129), sem "Segurança"',
          w.every((x) => semFaseDeTestes(x) && !x.breve && x.fita === 0 && x.menu[0] === 'Assine aqui' && x.menu[1] === CRIAR && x.entrar[0] === 'Entrar' && x.entrar[1] === `${URL_APP}/entrar` && !x.seguranca && x.avisoDaAssinatura === 0 && x.botoesPorBloco.every((n) => n <= 2)) && demoCerta(pos) && erros.length === 0, JSON.stringify({ pos, erros }));
        ok('estado do produto, lançado (D-129): planos.html e a capa de cada plano com "Assine aqui" (criar conta) e "Conheça o app"; Use no navegador com "Já tem conta? Entrar no navegador" embaixo das duas chamadas',
          JSON.stringify(pos.planos.capa) === JSON.stringify([['Assine aqui', CRIAR], ['Conheça o app', 'app/index.html']]) &&
            // Desde 27/11/2026 (jornada de compra, S3), a capa de cada plano leva o plano ao cadastro.
            JSON.stringify(pos['planos/individual'].capa) === JSON.stringify([['Assine aqui', `${CRIAR}?plano=individual`], ['Conheça o app', '../app/index.html']]) &&
            JSON.stringify(pos['planos/familia'].capa) === JSON.stringify([['Assine aqui', `${CRIAR}?plano=familia`], ['Conheça o app', '../app/index.html']]) &&
            JSON.stringify(pos.web.jaTemConta) === JSON.stringify([['Entrar no navegador', `${URL_APP}/entrar`], ['Entrar no navegador', `${URL_APP}/entrar`]]),
          JSON.stringify({ planos: pos.planos.capa, individual: pos['planos/individual'].capa, web: pos.web.jaTemConta }));
        // Lançado, os cliques do menu e de "Assine aqui" levam à tela de criar conta, e o link de O app, à tela inicial do app web.
        const seguidosPos = await seguirBotoes(lancado.url, 'Abrir a versão web', { assineNoApp: true });
        const destinosPos = Object.entries(seguidosPos.chegou);
        const paraEntrar = ['Use no navegador, já tem conta', 'Entrar do cabeçalho', 'Entrar do menu do celular'];
        ok('estado do produto, lançado: o botão do menu (no computador e no celular) e "Assine aqui" das capas do início, de O app, de Use no navegador e do MEI, clicados, chegam à tela de criar conta; "Abrir a versão web" de O app, à tela inicial do app web; "Entrar" do cabeçalho e do menu do celular e "Entrar no navegador" (D-129), à tela de entrar; nada sai para a rede',
          destinosPos.length === 11 && destinosPos.every(([onde, [url, titulo]]) => titulo === 'App falso do teste' && url === (onde === 'O app, onde usar' ? `${URL_APP}/` : paraEntrar.includes(onde) ? `${URL_APP}/entrar` : CRIAR)) &&
            seguidosPos.recusados.length === 0,
          JSON.stringify(seguidosPos));
        // D-129: os selos das duas lojas (o Google Play com o endereço oficial, `?id=`) numa linha pequena de texto embaixo da capa, e nunca
        // como um terceiro botão: a capa tem no máximo dois.
        const selos = [['Baixar na App Store', APP_STORE], ['Disponível no Google Play', GOOGLE_PLAY]];
        await q.setViewportSize({ width: 1280, height: 900 });
        await q.goto(`${lancado.url}/`);
        const capaLancada = await q.evaluate(() => {
          const linha = document.querySelector('.capa .selos-pequenos');
          const acoes = document.querySelector('.capa .acoes').getBoundingClientRect();
          const botoes = [...document.querySelectorAll('.capa .acoes a.botao')].map((a) => a.getBoundingClientRect().height);
          return { texto: linha?.textContent ?? null, embaixo: linha ? linha.getBoundingClientRect().top >= acoes.bottom : false, alturaDoSelo: Math.round(document.querySelector('.capa .selo-loja').getBoundingClientRect().height), botoes: botoes.length, alturaDoBotao: Math.round(botoes[0] ?? 0), fundo: getComputedStyle(document.querySelector('.capa .selo-loja')).backgroundColor };
        });
        await q.setViewportSize({ width: 390, height: 900 });
        ok('estado do produto, lançado: a capa do início e a do MEI com "Assine aqui" (criar conta) e "Conheça o app" e os selos das duas lojas (D-129: o Google Play com details?id=) numa linha pequena de texto embaixo, sem terceiro botão',
          JSON.stringify(pos['início'].capa) === JSON.stringify([['Assine aqui', CRIAR], ['Conheça o app', 'app/index.html']]) &&
          JSON.stringify(pos.mei.capa) === JSON.stringify([['Assine aqui', CRIAR], ['Conheça o app', 'app/index.html']]) &&
          JSON.stringify(pos['app/'].capa) === JSON.stringify([['Assine aqui', CRIAR], ['Use no navegador', '../web.html']]) &&
          JSON.stringify(pos['início'].selos) === JSON.stringify(selos) && JSON.stringify(pos.comece.selos) === JSON.stringify(selos) &&
          capaLancada.texto === 'No celular: Baixar na App Store · Disponível no Google Play' && capaLancada.embaixo && capaLancada.botoes === 2 && /rgba\(0, 0, 0, 0\)|transparent/.test(capaLancada.fundo),
          JSON.stringify({ inicio: pos['início'].capa, selos: pos['início'].selos, mei: pos.mei.capa, comece: pos.comece.selos, capaLancada }));
        await q.goto(`${lancado.url}/`);
        const fim = await q.textContent('.chamada-final p');
        ok('estado do produto, lançado: a chamada final do início diz que a Clarevo está aberta, na web, na App Store e no Google Play, com o teste grátis', fim.endsWith('A Clarevo está aberta para todas as pessoas na web, na App Store e no Google Play. Toda conta começa com 14 dias grátis, sem cartão.'), fim);
        // D-129: lançado, o cabeçalho ("Entrar" ao lado de "Assine aqui", sem "Segurança") continua numa linha a 1120 e 1440 px.
        const cabecalhos = [];
        for (const largura of [1120, 1440]) {
          await q.setViewportSize({ width: largura, height: 900 });
          await q.goto(`${lancado.url}/`);
          cabecalhos.push(await q.evaluate((l) => {
            const marca = document.querySelector('.marca').getBoundingClientRect();
            const menu = document.querySelector('.menu-lista').getBoundingClientRect();
            const entrar = document.querySelector('.menu-entrar').getBoundingClientRect();
            const cta = document.querySelector('.menu-cta').getBoundingClientRect();
            return { largura: l, topo: Math.round(document.querySelector('.topo-i').getBoundingClientRect().height), folga: Math.round(menu.left - marca.right), mesmaLinha: Math.abs(entrar.top + entrar.height / 2 - (cta.top + cta.height / 2)) < 4 && Math.abs(menu.top + menu.height / 2 - (cta.top + cta.height / 2)) < 6, entrarAntes: entrar.right <= cta.left, largo: document.documentElement.scrollWidth > window.innerWidth + 1 };
          }, largura));
        }
        await q.setViewportSize({ width: 390, height: 900 });
        ok('estado do produto, lançado (D-129): o cabeçalho com "Entrar" ao lado de "Assine aqui" continua numa linha a 1120 e 1440 px, com folga entre o logotipo e o menu, e nada passa da largura',
          cabecalhos.every((c) => c.topo <= 80 && c.folga >= 16 && c.mesmaLinha && c.entrarAntes && !c.largo), JSON.stringify(cabecalhos));
        // 27/11/2026: de 768 a 1119 px, "Entrar" e "Assine aqui" à vista antes de "Menu", numa linha, sem passar da largura (de 320 a 1440 px).
        const meio = [];
        await q.goto(`${lancado.url}/`);
        for (let l = 320; l <= 1440; l += 16) {
          await q.setViewportSize({ width: l, height: 700 });
          meio.push(await q.evaluate((largura) => {
            const vis = (e) => e && e.getClientRects().length > 0;
            const itens = [...document.querySelectorAll('.topo-i .marca, .topo-i .menu-lista, .topo-i .menu-entrar, .topo-i .menu-cta, .topo-i .menu-movel > summary')].filter(vis).map((e) => e.getBoundingClientRect());
            const entrar = document.querySelector('.menu-entrar').getBoundingClientRect();
            const cta = document.querySelector('.menu-cta').getBoundingClientRect();
            return { l: largura, ambos: vis(document.querySelector('.menu-entrar')) && vis(document.querySelector('.menu-cta')), antes: entrar.right <= cta.left, linhas: new Set(itens.map((r) => Math.round(r.top + r.height / 2))).size, fora: Math.max(...itens.map((r) => r.right)) > innerWidth, largo: document.documentElement.scrollWidth > innerWidth + 1 };
          }, l));
        }
        const meioErrado = meio.filter((c) => c.linhas > 1 || c.fora || c.largo || (c.l >= 768 && !(c.ambos && c.antes)) || (c.l < 768 && c.ambos));
        await q.setViewportSize({ width: 390, height: 900 });
        ok('estado do produto, lançado (27/11): de 768 px em diante, "Entrar" e "Assine aqui" à vista no cabeçalho, nessa ordem, numa linha e sem passar da largura de 320 a 1440 px', meioErrado.length === 0, JSON.stringify(meioErrado.slice(0, 5)));
        // A jornada de compra (S3): lançado, "Assine aqui" da capa de cada plano leva o plano ao cadastro; o do cabeçalho, não. E S2: a linha
        // do fim das páginas de conteúdo leva ao cadastro, com o teste grátis.
        const doPlano = {};
        for (const c of ['planos', 'planos/individual', 'planos/familia', 'calculadoras/reserva']) {
          await q.goto(`${lancado.url}/${c}`);
          doPlano[c] = await q.evaluate(() => ({ capa: document.querySelector('.capa .botao-principal')?.getAttribute('href') ?? null, menu: document.querySelector('.menu-cta').getAttribute('href'), ponte: document.querySelector('.ponte') ? [document.querySelector('.ponte a').getAttribute('href'), document.querySelector('.ponte').textContent] : null }));
        }
        ok('estado do produto, lançado (27/11): "Assine aqui" da capa do Individual e do Família leva ?plano=individual e ?plano=familia ao cadastro; o resumo dos planos e o cabeçalho, sem parâmetro; a linha do fim de uma calculadora leva ao cadastro, com o teste grátis',
          doPlano.planos.capa === CRIAR && doPlano['planos/individual'].capa === `${CRIAR}?plano=individual` && doPlano['planos/familia'].capa === `${CRIAR}?plano=familia` &&
          Object.values(doPlano).every((x) => x.menu === CRIAR) && doPlano['calculadoras/reserva'].ponte[0] === CRIAR && /14 dias grátis, sem cartão\.$/.test(doPlano['calculadoras/reserva'].ponte[1]), JSON.stringify(doPlano));
        const largas = [];
        for (const largura of [320, 1280]) {
          await q.setViewportSize({ width: largura, height: 900 });
          for (const c of ['', 'mei', 'comece', 'app/', 'web']) {
            await q.goto(`${lancado.url}/${c}`);
            if (await q.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) largas.push(`${c || 'início'} em ${largura} px`);
          }
        }
        ok('estado do produto, lançado: nada passa da largura da tela em 320 e 1280 px (início, MEI, Comece aqui, O app e Use no navegador)', largas.length === 0, largas.join(' | '));
      } finally {
        await outro.close();
        await lancado.fechar();
      }
    }

    // 7c11. A página inicial (D-125 e D-128): a capa, as três portas, como funciona, "Você decide o que entra", os planos, "Use no navegador ou
    // no celular", as perguntas frequentes e a chamada final, nessa ordem; o título "Cuidar da vida financeira faz parte de cuidar de você.",
    // sem frase pequena acima, com o benefício concreto abrindo o subtítulo; os dados estruturados de organização, de app e das perguntas;
    // o respiro do texto embaixo dos botões; "Na web" e "Para MEI" no menu, que continua numa linha a 1120 px; e a página do MEI no rodapé.
    {
      const p = await pagina();
      await p.goto(`${origem}/`);
      const inicio = await p.evaluate(() => ({
        secoes: [...document.querySelectorAll('main > section.bloco')].map((s) => s.getAttribute('aria-labelledby')),
        h1: document.querySelector('h1').textContent,
        primeiro: document.querySelector('.capa-grade > div').firstElementChild.tagName,
        lead: document.querySelector('.capa .lead').textContent,
        assinatura: document.querySelectorAll('.assinatura-marca').length,
        tipos: [...document.querySelectorAll('script[type="application/ld+json"]')].map((x) => JSON.parse(x.textContent)['@type']),
        menu: [...document.querySelectorAll('.menu-lista a')].map((a) => a.textContent),
        rodapeMei: document.querySelector('.rodape a[href="mei.html"]')?.textContent || null,
        rodapeWeb: document.querySelector('.rodape a[href="web.html"]')?.textContent || null,
        perguntas: [...document.querySelectorAll('#perguntas ~ .duvidas details')].map((d) => [d.querySelector('summary').textContent, d.open]),
      }));
      ok('início: os blocos na ordem (capa, para quem é, como funciona, você decide o que entra, planos, use no navegador ou no celular, perguntas e a chamada final), o título da marca sem frase acima, o benefício no subtítulo, dados de organização, de app e das perguntas, "Na web" e "Para MEI" no menu e as páginas do MEI e da web no rodapé',
        JSON.stringify(inicio.secoes) === JSON.stringify(['para-quem', 'como-funciona', 'voce-decide', 'planos', 'na-web', 'perguntas', 'comecar']) &&
        inicio.h1 === 'Cuidar da vida financeira faz parte de cuidar de você.' && inicio.primeiro === 'H1' && inicio.assinatura === 0 &&
        inicio.lead.startsWith('Contas, cartões e gastos do mês em ordem, com o pessoal, a família e o negócio separados.') &&
        JSON.stringify(inicio.tipos) === JSON.stringify(['Organization', 'SoftwareApplication', 'FAQPage']) &&
        JSON.stringify(inicio.menu) === JSON.stringify(['O app', 'Na web', 'Planos', 'Para MEI', 'Para empresas', 'Aprender', 'Calculadoras', 'Ajuda']) && inicio.rodapeMei === 'Por conta e MEI' && inicio.rodapeWeb === 'Use no navegador' &&
        inicio.perguntas.length === 6 && inicio.perguntas.every(([, aberta]) => !aberta), JSON.stringify(inicio));
      // As perguntas abrem pelo teclado (foco no resumo e Enter), uma por vez.
      await p.locator('#pergunta-banco > summary').focus();
      await p.keyboard.press('Enter');
      const aberta = await p.evaluate(() => ({ banco: document.querySelector('#pergunta-banco').open, texto: document.querySelector('#pergunta-banco .duvida-corpo').innerText, outras: [...document.querySelectorAll('#perguntas ~ .duvidas details:not(#pergunta-banco)')].every((d) => !d.open) }));
      ok('início: Enter no resumo abre "A Clarevo se conecta ao meu banco?", com a resposta verdadeira, e as outras continuam fechadas', aberta.banco && aberta.outras && aberta.texto.startsWith('Não. A Clarevo não se conecta a bancos e não pede senha bancária.') && !/Open Finance|em breve|futur/i.test(aberta.texto), JSON.stringify(aberta));
      // O respiro do texto embaixo dos botões (D-128): a linha curta da capa e, no fim, nada colado nos botões; o cabeçalho numa linha a 1120 px.
      const medidas = [];
      for (const largura of [390, 1120, 1440]) {
        await p.setViewportSize({ width: largura, height: 900 });
        await p.goto(`${origem}/`);
        medidas.push(await p.evaluate((l) => {
          const acoes = document.querySelector('.capa .acoes');
          const linha = acoes.nextElementSibling;
          const marca = document.querySelector('.marca').getBoundingClientRect();
          const menu = document.querySelector(l >= 1120 ? '.menu-lista' : '.menu-movel').getBoundingClientRect();
          return { largura: l, respiro: Math.round(linha.getBoundingClientRect().top - acoes.getBoundingClientRect().bottom), topo: Math.round(document.querySelector('.topo-i').getBoundingClientRect().height), folga: Math.round(menu.left - marca.right), largo: document.documentElement.scrollWidth > window.innerWidth + 1 };
        }, largura));
      }
      await p.setViewportSize({ width: 390, height: 900 });
      ok('início: a linha embaixo dos botões da capa com 16 px de respiro no celular e 20 px no computador; o cabeçalho numa linha (com "Na web" no menu) a 1120 e 1440 px, com folga entre o logotipo e o menu, e nada passa da largura',
        medidas[0].respiro >= 16 && medidas[1].respiro >= 20 && medidas[2].respiro >= 20 && medidas.every((m) => m.topo <= 80 && m.folga >= 16 && !m.largo), JSON.stringify(medidas));
      // "Ver como é usar no navegador" leva a Use no navegador.
      await p.goto(`${origem}/`);
      await Promise.all([p.waitForURL(/\/web(\.html)?$/), p.click('#na-web ~ .acoes a, section[aria-labelledby="na-web"] .acoes a')]);
      ok('início: "Ver como é usar no navegador" abre Use a Clarevo no navegador', (await p.textContent('h1')) === 'Use a Clarevo no navegador', p.url());
      await p.close();
    }

    // 7c12. Use a Clarevo no navegador (web.html, D-128): a página da versão web, com "Assine aqui" e "Conheça o app", a demonstração como link
    // de texto discreto, as duas telas de verdade do computador (carregadas, do próprio site), o pagamento na web com cartão ou Pix pelo
    // serviço de pagamento e os mesmos preços, no menu ("Na web", também no menu do celular) e nada passando da largura da tela.
    {
      const p = await pagina();
      await p.goto(`${origem}/web`);
      const web = await p.evaluate(async () => {
        for (const i of document.images) i.loading = 'eager';
        await Promise.all([...document.images].map((i) => (i.complete ? null : new Promise((r) => { i.onload = r; i.onerror = r; }))));
        const main = document.querySelector('main').innerText;
        const demo = document.querySelector('a[href*="demo.clarevo"]');
        return {
          h1: document.querySelector('h1').textContent,
          secoes: [...document.querySelectorAll('main h2')].map((h) => h.id),
          capa: [...document.querySelectorAll('.capa .acoes a')].map((a) => [a.textContent, a.getAttribute('href')]),
          demo: demo ? { texto: demo.textContent, botao: demo.classList.contains('botao'), rel: demo.rel, fonte: parseFloat(getComputedStyle(demo).fontSize) } : null,
          telas: [...document.querySelectorAll('.telas-web img')].map((i) => ({ ok: i.complete && i.naturalWidth > 0, local: i.src.startsWith(location.origin + '/imagens/computador-'), alt: i.alt.length > 40 })),
          pagar: /cartão/.test(main) && /Pix/.test(main) && /serviço de pagamento/.test(main) && /mesmos na web, na App Store e no Google Play/.test(main),
          proibido: /desconto|mais barat|Open Finance|fase de testes|Clarevo Plus/i.test(main),
          menuAtual: document.querySelector('.menu-lista a[aria-current="page"]')?.textContent,
        };
      });
      ok('web: o título, as seções, "Assine aqui" (para os planos) e "Conheça o app", a demonstração como link de texto menor (não botão, com noopener), as duas telas do computador carregadas, cartão ou Pix pelo serviço de pagamento com os mesmos preços, sem desconto, e "Na web" marcado no menu',
        web.h1 === 'Use a Clarevo no navegador' && JSON.stringify(web.secoes) === JSON.stringify(['no-navegador', 'no-computador', 'como-app', 'pagar', 'comecar']) &&
        JSON.stringify(web.capa) === JSON.stringify([['Assine aqui', 'planos.html'], ['Conheça o app', 'app/index.html']]) &&
        web.demo && web.demo.texto === 'Ver uma demonstração com dados fictícios' && !web.demo.botao && /noopener/.test(web.demo.rel) && web.demo.fonte <= 16 &&
        web.telas.length === 2 && web.telas.every((t) => t.ok && t.local && t.alt) && web.pagar && !web.proibido && web.menuAtual === 'Na web', JSON.stringify(web));
      // No menu do celular, "Na web" leva à página.
      await p.goto(`${origem}/`);
      await p.click('details.menu-movel > summary');
      await Promise.all([p.waitForURL(/\/web(\.html)?$/), p.click('details.menu-movel a:text-is("Na web")')]);
      ok('web: "Na web" no menu do celular abre a página', (await p.textContent('h1')) === 'Use a Clarevo no navegador', p.url());
      const largas = [];
      for (const largura of [320, 390, 1280]) {
        await p.setViewportSize({ width: largura, height: 900 });
        await p.goto(`${origem}/web`);
        if (await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) largas.push(`${largura} px`);
      }
      ok('web: nada passa da largura da tela em 320, 390 e 1280 px', largas.length === 0, largas.join(' | '));
      await p.setViewportSize({ width: 390, height: 900 });
      await p.close();
    }

    // 7c13. Rodada de 27/11/2026 (análise geral de 26/11, lista "Depois", e a jornada de compra de 27/11; docs/22_SITE.md, seção 22): O app e
    // Para empresas mais curtas, com o resto recolhido num <details> que abre pelo teclado (e os vídeos de dentro só baixam e tocam depois de
    // abrir); as calculadoras na ordem formulário, resultado e aviso, com o aviso à vista; as fontes em WOFF2; o botão do cabeçalho à vista de
    // 768 a 1119 px; a linha para o app no fim das páginas de conteúdo; e "Use como app no celular" em Use no navegador.
    {
      const p = await pagina();
      const deVideo = [];
      p.on('request', (q) => /\/videos\//.test(q.url()) && deVideo.push(q.url()));
      // O app: os blocos, o <details> fechado, a altura no celular (eram cerca de 21 telas de 844 px; agora até 12) e o teclado.
      await p.setViewportSize({ width: 390, height: 844 });
      await p.goto(`${origem}/app/`);
      const app = await p.evaluate(() => ({
        secoes: [...document.querySelectorAll('main > section.bloco')].map((x) => x.getAttribute('aria-labelledby')),
        aVista: [...document.querySelectorAll('section[aria-labelledby="como-funciona"] article.recurso')].map((a) => a.id),
        fechado: !document.querySelector('#todos-os-recursos').open,
        dentro: [...document.querySelectorAll('#todos-os-recursos article.recurso')].map((a) => a.id),
        resumo: document.querySelector('#todos-os-recursos > summary').textContent,
        altura: document.documentElement.scrollHeight,
        planos: [...document.querySelectorAll('section[aria-labelledby="planos"] .acoes a')].map((a) => [a.textContent, a.getAttribute('href')]),
      }));
      ok('O app (27/11): Como funciona com Resumo, Anotar e Contas à vista, o resto recolhido e fechado em "Ver todos os recursos", Seus dados, Onde usar e a chamada dos planos, com até 12 telas de 844 px em 390 px',
        JSON.stringify(app.secoes) === JSON.stringify(['como-funciona', 'recursos', 'seus-dados', 'onde', 'planos']) && JSON.stringify(app.aVista) === JSON.stringify(['resumo', 'anotar', 'contas']) &&
        app.fechado && app.dentro.length === 8 && app.resumo === 'Ver todos os recursos' && app.altura <= 12 * 844 &&
        JSON.stringify(app.planos) === JSON.stringify([['Assine aqui', '../planos.html'], ['Use no navegador', '../web.html']]), JSON.stringify(app));
      // Rolar a página inteira com o <details> fechado: nenhum vídeo de dentro dele baixa.
      deVideo.length = 0;
      await p.evaluate(async () => { for (let y = 0; y < document.documentElement.scrollHeight; y += 400) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 80)); } });
      const fechadoBaixou = deVideo.filter((u) => /\/videos\/(importar-fatura-print|metas|investir|tema-escuro-claro)\./.test(u));
      // Pelo teclado: foco no resumo e Enter abre; o vídeo de Metas, rolado para a tela, toca.
      await p.locator('#todos-os-recursos > summary').focus();
      const focoNoResumo = await p.evaluate(() => { const a = document.activeElement; return a.matches('summary:focus-visible') || a.matches('summary:focus'); });
      await p.keyboard.press('Enter');
      const aberto = await p.evaluate(() => document.querySelector('#todos-os-recursos').open);
      await p.locator('#metas video').evaluate((v) => v.scrollIntoView({ block: 'center' }));
      await p.waitForFunction(() => document.querySelector('#metas video').currentTime > 0.3, null, { timeout: 15000 }).catch(() => {});
      const metas = await p.locator('#metas video').evaluate((v) => ({ paused: v.paused, tempo: v.currentTime }));
      ok('O app (27/11): com o <details> fechado nenhum vídeo de dentro baixa; Enter no resumo abre, e o vídeo de Metas toca ao aparecer', fechadoBaixou.length === 0 && focoNoResumo && aberto && !metas.paused && metas.tempo > 0.3, JSON.stringify({ fechadoBaixou, focoNoResumo, aberto, metas }));
      // Para empresas: à vista o que a empresa recebe, o que vê e nunca vê, como funciona e a apresentação; o resto em três perguntas fechadas.
      await p.goto(`${origem}/empresas/`);
      const emp = await p.evaluate(() => ({
        secoes: [...document.querySelectorAll('main > section.bloco')].map((x) => x.getAttribute('aria-labelledby')),
        duvidas: [...document.querySelectorAll('section[aria-labelledby="detalhes"] details.duvida')].map((d) => [d.id, d.querySelector('summary').textContent, d.open]),
        altura: document.documentElement.scrollHeight,
        nuncaVe: document.querySelector('.nunca-ve').checkVisibility(),
      }));
      await p.locator('#painel > summary').focus();
      await p.keyboard.press('Enter');
      const painel = await p.evaluate(() => ({ aberto: document.querySelector('#painel').open, telas: [...document.querySelectorAll('#painel img')].filter((i) => i.checkVisibility()).length, outras: [...document.querySelectorAll('details.duvida:not(#painel)')].every((d) => !d.open) }));
      ok('Para empresas (27/11): à vista o que a empresa recebe, o que vê e nunca vê, como funciona e a apresentação; o painel, o fim do benefício e a NR-1 em perguntas fechadas, que abrem pelo teclado; até 9 telas de 844 px em 390 px',
        JSON.stringify(emp.secoes) === JSON.stringify(['bem-estar', 'o-que-ve', 'como-funciona', 'detalhes', 'apresentacao']) &&
        JSON.stringify(emp.duvidas) === JSON.stringify([['painel', 'O painel, só na web', false], ['fim', 'Quando o benefício acaba', false], ['nr-1', 'Bem-estar financeiro e a NR-1', false]]) &&
        emp.altura <= 9 * 844 && emp.nuncaVe && painel.aberto && painel.telas === 3 && painel.outras, JSON.stringify({ emp, painel }));
      // As calculadoras: o formulário, depois o resultado (com a resposta numa frase no topo) e o aviso logo depois, à vista, sem recolher.
      const ordens = [];
      for (const slug of ['reserva', 'custo-por-ano', 'rendimento-cdi', 'plano-dividas', 'antes-de-financiar']) {
        await p.goto(`${origem}/calculadoras/${slug}`);
        await p.waitForSelector('[data-calculadora][data-pronta="sim"]');
        ordens.push(await p.evaluate((s) => {
          const f = document.querySelector('.calc-formulario').getBoundingClientRect();
          const r = document.querySelector('.calc-resultados').getBoundingClientRect();
          const aviso = document.querySelector('.calc-aviso');
          const a = aviso.getBoundingClientRect();
          return { slug: s, ordem: f.bottom <= r.top + 1 && r.bottom <= a.top + 1, visivel: aviso.checkVisibility(), recolhido: aviso.closest('details') !== null, estimativa: /estimativas/.test(aviso.textContent), titulo: document.querySelector('.calc-resultado h3, .calc-resultado h4')?.textContent };
        }, slug));
      }
      // Com a reserva preenchida, a primeira linha do resultado é a resposta numa frase.
      await p.goto(`${origem}/calculadoras/reserva`);
      await p.waitForSelector('[data-calculadora][data-pronta="sim"]');
      await p.fill('#c-essenciais', '3.750,00');
      await p.click('label.chip:has-text("6 meses")');
      await p.waitForTimeout(300);
      const destaque = await p.evaluate(() => { const r = document.querySelector('.calc-resultado'); const d = r.querySelector('.calc-linhas > p'); return { classe: d.className, texto: d.textContent, avisoDepois: r.getBoundingClientRect().bottom <= document.querySelector('.calc-aviso').getBoundingClientRect().top + 1 }; });
      ok('calculadoras (27/11): o formulário, o resultado e o aviso logo depois, à vista e sem recolher, dizendo que os resultados são estimativas; a primeira linha do resultado é a resposta, em destaque',
        ordens.every((o) => o.ordem && o.visivel && !o.recolhido && o.estimativa && o.titulo === 'Resultado') && destaque.classe === 'calc-destaque' && /^Com estes números, a reserva de 6 meses é de R\$/.test(destaque.texto.replace(/ /g, ' ')) && destaque.avisoDepois, JSON.stringify({ ordens, destaque }));
      // As fontes em WOFF2: o navegador pede só os WOFF2 (do próprio site, font/woff2, guardados por um ano), nenhum TTF, e as três carregam.
      const fontes = [];
      const q = await pagina();
      q.on('response', (r) => /\/fontes\//.test(r.url()) && fontes.push([r.url().replace(origem, ''), r.status(), r.headers()['content-type'], /immutable/.test(r.headers()['cache-control'] || '')]));
      await q.goto(`${origem}/`);
      await q.evaluate(() => document.fonts.ready);
      const carregadas = await q.evaluate(() => [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.weight).sort());
      ok('fontes (27/11): só os três WOFF2 do próprio site, como font/woff2 e guardados por um ano, nenhum TTF, e os três pesos carregados', fontes.length === 3 && fontes.every(([u, st, tipo, guarda]) => /^\/fontes\/Manrope_\w+\.woff2$/.test(u) && st === 200 && tipo === 'font/woff2' && guarda) && JSON.stringify(carregadas) === JSON.stringify(['500', '700', '800']), JSON.stringify({ fontes, carregadas }));
      await q.close();
      // O cabeçalho: de 768 a 1119 px, "Entrar" à vista ao lado de "Menu"; nunca passa da largura nem quebra linha, de 320 a 1440 px; o foco.
      const cabecalho = [];
      await p.goto(`${origem}/`);
      for (let l = 320; l <= 1440; l += 16) {
        await p.setViewportSize({ width: l, height: 700 });
        cabecalho.push(await p.evaluate((largura) => {
          const vis = (e) => e && e.getClientRects().length > 0;
          const itens = [...document.querySelectorAll('.topo-i .marca, .topo-i .menu-lista, .topo-i .menu-cta, .topo-i .menu-movel > summary')].filter(vis).map((e) => e.getBoundingClientRect());
          return { l: largura, cta: vis(document.querySelector('.menu-cta')), movel: vis(document.querySelector('.menu-movel > summary')), linhas: new Set(itens.map((r) => Math.round(r.top + r.height / 2))).size, fora: Math.max(...itens.map((r) => r.right)) > innerWidth, largo: document.documentElement.scrollWidth > innerWidth + 1 };
        }, l));
      }
      const errados = cabecalho.filter((c) => c.linhas > 1 || c.fora || c.largo || (c.l >= 768 && !c.cta) || (c.l < 768 && c.cta) || (c.l < 1120) !== c.movel);
      await p.setViewportSize({ width: 900, height: 700 });
      await p.goto(`${origem}/`);
      await p.keyboard.press('Tab');
      await p.keyboard.press('Tab');
      for (let i = 0; i < 4 && !(await p.evaluate(() => document.activeElement.classList.contains('menu-cta'))); i++) await p.keyboard.press('Tab');
      const foco = await p.evaluate(() => { const a = document.activeElement; const cs = getComputedStyle(a); return { cta: a.classList.contains('menu-cta'), texto: a.textContent, visivel: a.matches(':focus-visible'), contorno: cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 2 }; });
      ok('cabeçalho (27/11): de 768 a 1119 px, "Entrar" à vista ao lado de "Menu" (abaixo de 768 px, só "Menu"; de 1120 px, o menu em linha), numa linha e sem passar da largura de 320 a 1440 px; o Tab chega a "Entrar" com o contorno do foco',
        errados.length === 0 && foco.cta && foco.texto === 'Entrar' && foco.visivel && foco.contorno, JSON.stringify({ errados: errados.slice(0, 5), foco }));
      // A linha para o app no fim das páginas de conteúdo: antes do lançamento, para O app; o clique chega lá.
      const pontes = [];
      for (const c of ['aprender/', 'aprender/cet', 'calculadoras/reserva', 'ajuda/', 'novidades/']) {
        await p.goto(`${origem}/${c}`);
        pontes.push(await p.evaluate(() => { const a = document.querySelector('main > .bloco-ponte .ponte a'); return a ? [a.textContent, new URL(a.href).pathname, a.closest('main').lastElementChild === a.closest('.bloco-ponte')] : null; }));
      }
      await p.goto(`${origem}/calculadoras/reserva`);
      await Promise.all([p.waitForURL(/\/app\/(index\.html)?$/), p.click('.ponte a')]);
      ok('ponte para o app (27/11): no fim de Aprender, de uma calculadora, da Ajuda e das Novidades, "conheça o app da Clarevo", por último no conteúdo, e o clique abre O app',
        pontes.every((x) => x && x[0] === 'conheça o app da Clarevo' && /^\/app\/(index\.html)?$/.test(x[1]) && x[2]) && (await p.textContent('h1')) === 'A Clarevo por dentro', JSON.stringify(pontes));
      // Use no navegador: "Use como app no celular", com os passos do iPhone e do Android.
      await p.setViewportSize({ width: 390, height: 844 });
      await p.goto(`${origem}/web`);
      const comoApp = await p.evaluate(() => [...document.querySelectorAll('section[aria-labelledby="como-app"] article')].map((a) => [a.querySelector('h3').textContent, a.querySelectorAll('ol > li').length, a.checkVisibility()]));
      ok('web (27/11): "Use como app no celular" com os passos do iPhone (Safari) e do Android (Chrome), à vista', JSON.stringify(comoApp) === JSON.stringify([['No iPhone, pelo Safari', 3, true], ['No Android, pelo Chrome', 3, true]]), JSON.stringify(comoApp));
      await p.setViewportSize({ width: 390, height: 900 });
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
          // O app e Para empresas (27/11/2026): de novo com os <details> abertos, para o que está recolhido seguir as mesmas regras.
          if (/^(app|empresas)[\\/]index\.html$/.test(arquivo)) {
            await p.evaluate(() => document.querySelectorAll('main details').forEach((d) => { d.open = true; }));
            const a = await p.evaluate(varrerPagina);
            for (const x of a.achados) encostados.push(`${arquivo} (aberto) em ${largura} px: ${x}`);
            if (a.largo) largos.push(`${arquivo} (aberto) em ${largura} px`);
            for (const k of Object.keys(varredura)) for (const x of a[k]) varredura[k].push(`${arquivo} (aberto) em ${largura} px: ${x}`);
          }
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
