'use strict';
/**
 * O catálogo de Aprender, o calendário de época e o guia de uso do app, lidos do TypeScript do `packages/core` (uma fonte de verdade:
 * o site nunca copia esse texto à mão).
 *
 * Como o TypeScript roda no Node sem pacote novo: o `typescript` que já está instalado (devDependency do core) transpila cada arquivo
 * `.ts` na hora em que ele é carregado (`ts.transpileModule`, sem checar tipos, que é o `npm run typecheck`) e o `require` comum do
 * Node resolve os imports sem extensão. O gancho de `.ts` só existe durante o carregamento e depois é desfeito. O carregamento leva
 * alguns segundos e fica guardado em memória pelo processo.
 */
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { RAIZ } = require('./config');

const CORE_SRC = path.join(RAIZ, 'packages', 'core', 'src');
let guardado = null;

/** O compilador do TypeScript que já está instalado (dependência do core); sem ele, o gerador diz o que fazer. */
function carregarTypescript() {
  try {
    return require('typescript');
  } catch {
    throw new Error('o pacote "typescript" não está instalado: rode "npm install" na raiz do repositório (ele já é dependência do packages/core)');
  }
}

function carregarTs(ts, entradas) {
  const anterior = Module._extensions['.ts'];
  Module._extensions['.ts'] = (modulo, arquivo) => {
    const saida = ts.transpileModule(fs.readFileSync(arquivo, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
      fileName: arquivo,
    }).outputText;
    modulo._compile(saida, arquivo);
  };
  try {
    return entradas.map((e) => require(path.join(CORE_SRC, e)));
  } finally {
    if (anterior) Module._extensions['.ts'] = anterior;
    else delete Module._extensions['.ts'];
  }
}

/** Carrega (uma vez) `learn`, `guide`, as calculadoras, as datas, os planos da assinatura, os indicadores e as fontes de notícias do core. */
function catalogo() {
  if (guardado) return guardado;
  const ts = carregarTypescript();
  const [learn, guide, calc, datas, plano, indicadores, mercado, noticias] = carregarTs(ts, [
    'learn/index.ts',
    'guide/index.ts',
    'calculators/index.ts',
    'dates.ts',
    'plano.ts',
    'indicadores/index.ts',
    'indicadores/conteudo.ts',
    'noticias/fontes.ts',
  ]);
  const publicados = learn.publishedTopics().filter((t) => !t.legacy);
  guardado = {
    SECOES: learn.LEARN_SECTIONS,
    TEXTO: learn.LEARN_UI_TEXT,
    CALENDARIO: learn.SEASONAL_CALENDAR,
    GUIA: guide.GUIDE_ENTRIES,
    GRUPOS_DO_GUIA: guide.GUIDE_GROUPS,
    publicados,
    /** Tema publicado (não legado) por slug, ou undefined. */
    tema: (slug) => publicados.find((t) => t.slug === slug),
    minutosDeLeitura: (t) => learn.topicReadingMinutes(t),
    relacionados: (slug) => learn.relatedTopics(slug).filter((t) => !t.legacy),
    calculadora: (slug) => {
      const l = learn.topicCalculator(slug);
      if (!l) return null;
      return { slug: l.slug, params: { ...l.params }, titulo: calc.calcTitle(l.slug, l.params.modo) };
    },
    tituloDoCalculador: calc.calcTitle,
    /**
     * O catálogo das calculadoras (grupos, lista, textos fixos): a mesma fonte do app, mais as que por enquanto só o site mostra
     * (`SITE_CALCULATORS`, D-106), cada uma no grupo dela, depois das do app.
     */
    CALC_GRUPOS: calc.CALC_GROUPS,
    CALCULADORAS: calc.CALC_GROUPS.flatMap((g) => [...calc.CALCULATORS, ...calc.SITE_CALCULATORS].filter((x) => x.group === g.id)),
    calculadoraPorSlug: (slug) => calc.calculatorBySlug(slug) ?? calc.SITE_CALCULATORS.find((x) => x.slug === slug) ?? null,
    /** Só o site mostra (fora da tela do app)? */
    soNoSite: (slug) => calc.isSiteCalcSlug(slug),
    /** Os campos de uma calculadora, do app (`calcFields`) ou só do site (`SITE_CALC_FIELDS`). */
    camposDaCalculadora: (slug, modo) => (calc.isSiteCalcSlug(slug) ? calc.SITE_CALC_FIELDS[slug] : calc.calcFields(slug, modo)),
    /** O aviso fixo de uma calculadora: o do app (`calcDisclaimer`) ou o da calculadora só do site. */
    avisoDaCalculadora: (slug) => (calc.isSiteCalcSlug(slug) ? calc.SITE_CALCULATORS.find((x) => x.slug === slug).disclaimer : calc.calcDisclaimer(slug)),
    /** Todo o módulo das calculadoras do core (funções de cálculo, campos e textos), para os exemplos calculados na geração. */
    CALC: calc,
    CALC_UI: calc.CALC_UI_TEXT,
    nomeDoMes: (mes) => datas.formatMonthName(`2000-${String(mes).padStart(2, '0')}`),
    dataBR: (iso) => datas.formatDateBR(iso),
    guiaPasso: guide.guideWhere,
    /** Os planos da assinatura (D-083): nomes, preços e os textos da tela Assinatura do app, para a seção Planos do início dizer o mesmo. */
    PLANOS: {
      texto: plano.ACCESS_TEXT,
      nome: plano.PLAN_NAME,
      preco: plano.planPriceAmount,
      porMes: plano.SUBSCRIPTION_SCREEN_TEXT.perMonth,
      /** O plano anual (D-125 e D-127): o preço por ano, " por ano", o equivalente por mês e a nota do anual, os mesmos da tela Assinatura. */
      precoAnual: (plan) => plano.planPeriodPriceAmount(plan, 'anual'),
      porAno: plano.periodSuffix('anual'),
      equivalente: plano.PLAN_PERIOD_TEXT.equivalent,
      notaDoAnual: plano.PLAN_PERIOD_TEXT.note,
      cobrancaAnual: plano.PLAN_PERIOD_TEXT.optionHint.anual,
      /** Os dias do teste grátis (TRIAL_DAYS), para a pergunta da página Planos. */
      diasDeTeste: plano.TRIAL_DAYS,
      /** A assinatura aberta no app (SUBSCRIBE_OPEN): fechada, a seção Planos diz que nada é cobrado até o lançamento. */
      aberta: plano.SUBSCRIBE_OPEN === true,
    },
    /** Indicadores oficiais e páginas de mercado (D-106): os códigos, as contas e os textos de cada número, e o texto das páginas. */
    INDICADORES: indicadores,
    MERCADO: mercado,
    /** Notícias de fontes públicas (D-117): as fontes, a regra de licença de cada uma e os textos das páginas. */
    NOTICIAS: noticias,
  };
  return guardado;
}

/**
 * Os endereços (só o host) das fontes de todos os temas publicados e das páginas de mercado (indicadores, glossário e explicações,
 * D-106): os únicos links externos que o site pode ter além dos de base.
 */
function hostsDeFontes() {
  const c = catalogo();
  const hosts = new Set();
  for (const t of c.publicados) for (const s of t.sources) if (s.url) hosts.add(new URL(s.url).host);
  for (const s of c.MERCADO.fontesDasPaginasDeMercado()) if (s.url) hosts.add(new URL(s.url).host);
  return [...hosts].sort();
}

module.exports = { catalogo, hostsDeFontes, carregarTypescript, carregarTs, CORE_SRC };
