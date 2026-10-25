'use strict';
/**
 * Calculadoras (D-066): o índice, agrupado como no app, e uma página por calculadora (as dez de `packages/core/src/calculators`).
 *
 * Uma só fonte de verdade: os títulos, os grupos, os campos, as regras de validação, os resultados e as hipóteses vêm do core. A conta
 * roda no navegador com o MESMO código, transpilado em `site/js/nucleo/` (`scripts/site/nucleo.js`), e o script da página
 * (`site-src/calculadoras/calculadora.js`) só monta os campos. Sem JavaScript, a página mostra o que a calculadora faz, os campos, um
 * exemplo calculado na geração com o próprio core (números fictícios) e o aviso de que a conta precisa de JavaScript.
 *
 * Nada sai do navegador: sem envio, sem armazenamento e sem cookie.
 */
const fs = require('node:fs');
const path = require('node:path');
const { esc } = require('../texto');
const { rel, arquivoDaCalculadora, ARQUIVO_CALCULADORAS } = require('../util');
const { montarPagina, bloco } = require('../modelo');
const { catalogo } = require('../catalogo');
const { URL_APP, SITE_SRC } = require('../config');
const { fechoDe } = require('../nucleo');
const { cartaoDoTema, SECOES_DO_SITE } = require('./aprender');

const SCRIPT_DAS_CALCULADORAS = 'calculadoras/calculadora.js';

/** Os scripts de `site-src/calculadoras/`, com o caminho a partir dessa pasta (`calculadora.js`, `base.js`, `definicoes/<slug>.js`), em ordem. */
function scriptsDasCalculadoras() {
  const pasta = path.join(SITE_SRC, 'calculadoras');
  const achados = [];
  const visitar = (dir, prefixo) => {
    for (const nome of fs.readdirSync(dir).sort()) {
      if (fs.statSync(path.join(dir, nome)).isDirectory()) visitar(path.join(dir, nome), `${prefixo}${nome}/`);
      else if (nome.endsWith('.js')) achados.push(`${prefixo}${nome}`);
    }
  };
  visitar(pasta, '');
  return achados;
}

/** O que um script de `calculadoras/` importa de cara (`import ... from '...'`), em caminhos a partir da raiz do site. */
function importsDe(publicado) {
  const texto = fs.readFileSync(path.join(SITE_SRC, publicado), 'utf8');
  return [...texto.matchAll(/^import\s[^;]*?from\s+'([^']+)';/gm)].map((m) => path.posix.join(path.posix.dirname(publicado), m[1]));
}

/**
 * O que a página de uma calculadora carrega, para o `modulepreload`: o script que inicia a página, o que ele importa de cara, o módulo do
 * núcleo da calculadora e a definição dela (os `import()` dela em `MODULOS`), com tudo o que cada um importa (scripts de `calculadoras/`
 * e módulos de `js/nucleo/`). Lido dos próprios scripts (`site-src/calculadoras/`), para o `modulepreload` nunca divergir do que eles
 * pedem; o teste de navegador confere que nada é pedido fora desta lista. Scripts primeiro, depois o núcleo, cada grupo em ordem alfabética.
 */
function precargaDaCalculadora(slug) {
  const entrada = 'calculadoras/calculadora.js';
  const script = fs.readFileSync(path.join(SITE_SRC, 'calculadoras', 'calculadora.js'), 'utf8');
  const dela = new RegExp(`^\\s*(?:'${slug}'|${slug}):\\s*\\{\\s*nucleo:\\s*\\(\\)\\s*=>\\s*import\\('\\.\\./(js/nucleo/[^']+)'\\),\\s*definicao:\\s*\\(\\)\\s*=>\\s*import\\('\\./([^']+)'\\)`, 'm').exec(script);
  if (!dela) throw new Error(`calculadora.js não declara os import() de "${slug}" em MODULOS (o modulepreload precisa deles)`);
  const scripts = new Set();
  const nucleoRaizes = new Set();
  const fila = [entrada, dela[1], `calculadoras/${dela[2]}`];
  while (fila.length > 0) {
    const arquivo = fila.shift();
    if (arquivo.startsWith('js/nucleo/')) {
      nucleoRaizes.add(arquivo);
      continue;
    }
    if (scripts.has(arquivo)) continue;
    scripts.add(arquivo);
    fila.push(...importsDe(arquivo));
  }
  return [entrada, ...[...scripts].filter((a) => a !== entrada).sort(), ...fechoDe([...nucleoRaizes])];
}

/**
 * O que cada calculadora faz, em uma frase. As duas que o guia de uso do app descreve (Antes de financiar e Plano para quitar dívidas)
 * usam o texto do guia (`purpose`); as outras, o que o código do core faz, conferido no teste.
 */
const O_QUE_FAZ = {
  'parcelado-ou-a-vista': 'Compara o preço à vista com as parcelas e mostra a taxa de juros que o parcelado embute, ao mês e ao ano.',
  'custo-por-ano': 'Soma quanto uma assinatura ou um gasto que se repete custa por mês e por ano.',
  'custo-da-divida': 'Mostra quanto uma dívida custa: um ciclo do rotativo do cartão (e o que muda se a fatura for parcelada), os meses de cheque especial ou as parcelas de um empréstimo.',
  'quitar-antes': 'Estima quanto dos juros sai da conta se você quitar tudo ou adiantar as últimas parcelas, trazendo as parcelas a valor presente pela taxa do contrato.',
  'multa-e-juros': 'Calcula a multa e os juros de uma conta paga depois do vencimento, com os percentuais que estão no boleto ou no contrato.',
  reserva: 'Calcula o tamanho da reserva para imprevistos, quantos meses o que você já tem guardado cobre e em quanto tempo ela fica completa.',
  'juntar-para-objetivo': 'Mostra quanto guardar por mês para chegar a um valor em um prazo, ou em quanto tempo você chega guardando um valor por mês.',
  'dividir-contas': 'Divide o total das contas da casa entre 2 e 6 pessoas, em partes iguais ou pela renda de cada uma.',
};
/** Slugs cujo texto vem do guia de uso do app (`GUIDE_ENTRIES`, `purpose`). */
const DO_GUIA = ['antes-de-financiar', 'plano-dividas'];

/** Campos que a lista de campos (sem JavaScript) não mostra: o número de dívidas e de pessoas é só a quantidade de itens da lista. */
const FORA_DA_LISTA = { 'plano-dividas': ['dividas'], 'dividir-contas': ['pessoas'] };

/**
 * Um exemplo por calculadora, com números fictícios, calculado na geração pela função do core. `mostrar` é a ordem dos campos que a
 * página lista; `rotulos` troca o rótulo de um campo que se repete por item (dívidas e pessoas); `itens` descreve a lista.
 */
const EXEMPLOS = {
  'antes-de-financiar': {
    funcao: 'calcAntesDeFinanciar',
    entrada: { preco: '50.000,00', entrada: '10.000,00', parcelas: '48', taxaMes: '1,99', primeiraEmUmMes: true, renda: '4.500,00' },
    mostrar: ['preco', 'entrada', 'parcelas', 'taxaMes', 'primeiraEmUmMes', 'renda'],
  },
  'parcelado-ou-a-vista': {
    funcao: 'calcParceladoOuAVista',
    entrada: { modo: 'compra', aVista: '1.080,00', parcelas: '12', parcela: '120,00', primeiraNaCompra: false, formaPagamento: 'boleto' },
    mostrar: ['aVista', 'parcelas', 'parcela', 'primeiraNaCompra', 'formaPagamento'],
  },
  'custo-por-ano': { funcao: 'calcCustoPorAno', entrada: { valor: '39,90', frequencia: 'mes' }, mostrar: ['valor', 'frequencia'] },
  'custo-da-divida': {
    funcao: 'calcCustoDaDivida',
    entrada: { tipo: 'emprestimo', valor: '1.000,00', taxaMes: '2,5', parcelas: '12' },
    mostrar: ['tipo', 'valor', 'taxaMes', 'parcelas'],
  },
  'quitar-antes': {
    funcao: 'calcQuitarAntes',
    entrada: { parcela: '850,00', restantes: '24', taxaMes: '1,5', modo: 'tudo' },
    mostrar: ['parcela', 'restantes', 'taxaMes', 'modo'],
  },
  'multa-e-juros': {
    funcao: 'calcMultaEJuros',
    entrada: { valor: '200,00', multaPct: '2', jurosMesPct: '1', dias: '15' },
    mostrar: ['valor', 'multaPct', 'jurosMesPct', 'dias'],
  },
  'plano-dividas': {
    funcao: 'calcPlanoDividas',
    entrada: {
      dividas: [
        { tipo: 'parcelada', apelido: 'Financiamento', parcela: '850,00', restantes: '24', taxaParcelada: '1,5' },
        { tipo: 'saldo', apelido: 'Cartão', saldo: '1.000,00', taxaSaldo: '8', pagamento: '200,00' },
      ],
      extra: '200,00',
    },
    mostrar: ['extra'],
    itens: [
      'Dívida "Financiamento", parcelada: parcela de R$ 850,00, 24 parcelas que faltam e juros de 1,5% ao mês.',
      'Dívida "Cartão", saldo com juros: saldo de R$ 1.000,00, juros de 8% ao mês e pagamento de R$ 200,00 por mês.',
    ],
  },
  reserva: {
    funcao: 'calcReserva',
    entrada: { essenciais: '3.750,00', meses: '6', guardado: '4.500,00', mensal: '500,00' },
    mostrar: ['essenciais', 'meses', 'guardado', 'mensal'],
  },
  'juntar-para-objetivo': {
    funcao: 'calcJuntarParaObjetivo',
    entrada: { alvo: '22.500,00', jaTem: '4.500,00', modo: 'prazo', meses: '18' },
    mostrar: ['alvo', 'jaTem', 'modo', 'meses'],
  },
  'dividir-contas': {
    funcao: 'calcDividirContas',
    entrada: { total: '3.000,00', modo: 'renda', pessoas: [{ renda: '4.000,00' }, { renda: '2.000,00' }] },
    mostrar: ['total', 'modo'],
    itens: ['Pessoa 1: renda de R$ 4.000,00.', 'Pessoa 2: renda de R$ 2.000,00.'],
  },
};

/** O exemplo de uma calculadora: as entradas para mostrar e o resultado calculado pelo core. */
function exemploDa(slug) {
  const ex = EXEMPLOS[slug];
  const c = catalogo();
  const campos = c.CALC.calcFields(slug);
  const saida = c.CALC[ex.funcao](ex.entrada);
  if (!saida.ok) throw new Error(`o exemplo de ${slug} não calcula: ${JSON.stringify(saida.errors)}`);
  const valorDe = (chave) => {
    const spec = campos[chave];
    const bruto = ex.entrada[chave];
    if (spec.kind === 'sim_nao') return spec.options.find((o) => o.value === (bruto ? 'sim' : 'nao')).label;
    if (spec.kind === 'opcao') return spec.options.find((o) => o.value === bruto).label;
    if (spec.kind === 'dinheiro') return `R$ ${bruto}`;
    if (spec.kind === 'taxa') return `${bruto}%`;
    return String(bruto);
  };
  const linhas = [...ex.mostrar.map((k) => ({ rotulo: campos[k].label, valor: valorDe(k) })), ...(ex.itens ?? []).map((t) => ({ texto: t }))];
  return { linhas, resultado: saida.result };
}

/** Os campos de uma calculadora, na ordem da tela, para quem está sem JavaScript. */
function listaDeCampos(slug) {
  const campos = catalogo().CALC.calcFields(slug);
  const fora = FORA_DA_LISTA[slug] ?? [];
  return Object.entries(campos)
    .filter(([chave]) => !fora.includes(chave))
    .map(([, spec]) => {
      const opcoes = spec.options ? ` Opções: ${spec.options.map((o) => o.label).join(', ')}.` : '';
      const dica = spec.hint ? ` ${spec.hint}${/[.!?]$/.test(spec.hint) ? '' : '.'}` : '';
      return `<li><strong>${esc(spec.label)}.</strong>${esc(dica + opcoes)}${spec.optional ? ' Pode ficar em branco.' : ''}</li>`;
    })
    .join('\n');
}

/** O que a calculadora faz, em uma frase. */
function oQueFaz(slug) {
  if (DO_GUIA.includes(slug)) return catalogo().GUIA.find((g) => g.id === slug).purpose;
  return O_QUE_FAZ[slug];
}

/** Os temas de Aprender do site que apontam para esta calculadora no catálogo (o mesmo ligamento que o app usa). */
const temasDaCalculadora = (slug) => catalogo().publicados.filter((t) => t.calculator && t.calculator.slug === slug && SECOES_DO_SITE.includes(t.section));

const AVISO_EXTRA = 'Os resultados são estimativas feitas com os números que você digita e não garantem resultado.';

function paginaDaCalculadora(info, { valores }) {
  const c = catalogo();
  const arquivo = arquivoDaCalculadora(info.slug);
  const grupo = c.CALC_GRUPOS.find((g) => g.id === info.group);
  const u = (d) => rel(arquivo, d);
  const ex = exemploDa(info.slug);
  const temas = temasDaCalculadora(info.slug);
  const resultado = ex.resultado;

  const capa = `<p class="migalha"><a href="${u(ARQUIVO_CALCULADORAS)}">Calculadoras</a> · ${esc(grupo.title)}</p>
<h1>${esc(info.title)}</h1>
<p class="lead">${esc(info.subtitle)}. A conta é feita no seu navegador, e nada do que você digita é enviado nem guardado.</p>`;

  const sem = `<noscript>
<div class="calc-sem-js">
<p><strong>Esta calculadora precisa de JavaScript</strong> para fazer a conta no seu navegador, sem enviar nada. Sem ele, veja o exemplo mais abaixo e a lista do que ela pede, ou use a <a href="${esc(URL_APP)}" rel="noopener noreferrer">versão web</a> da Clarevo.</p>
<h3>O que ela pede</h3>
<ul>
${listaDeCampos(info.slug)}
</ul>
</div>
</noscript>`;

  const linhasDoExemplo = ex.linhas.map((l) => (l.texto ? `<li>${esc(l.texto)}</li>` : `<li>${esc(l.rotulo)}${/[?!.]$/.test(l.rotulo) ? '' : ':'} <strong>${esc(l.valor)}</strong></li>`)).join('\n');
  const exemplo = `<section class="exemplo" aria-labelledby="exemplo">
<h3 id="exemplo">Um exemplo, com números fictícios</h3>
<p>Preenchendo:</p>
<ul>
${linhasDoExemplo}
</ul>
<p>A calculadora mostra:</p>
<ul class="calc-exemplo-resultado">
${resultado.resultLines.map((l) => `<li>${esc(l)}</li>`).join('\n')}
</ul>
${resultado.notes.map((n) => `<p class="calc-nota">${esc(n)}</p>`).join('\n')}
${resultado.hypotheses.length ? `<h4>${esc(c.CALC_UI.hypothesesTitle)}</h4>\n<ul>\n${resultado.hypotheses.map((h) => `<li>${esc(h)}</li>`).join('\n')}\n</ul>` : ''}
</section>`;

  const aprender = temas.length
    ? `<h2 id="aprender">Para entender melhor</h2>
<p class="lead-bloco">Os temas de Aprender que explicam o assunto desta conta, cada um com fontes e data de revisão.</p>
<ul class="temas">
${temas.map((t) => cartaoDoTema(arquivo, t)).join('\n')}
</ul>`
    : `<h2 id="aprender">Para entender melhor</h2>
<p>Os temas de <a href="${u('aprender/index.html')}">Aprender</a> explicam juros, taxas e prazos, com fontes e data de revisão.</p>`;

  const corpo = [
    bloco(
      `<h2 id="calcular">Faça a conta</h2>
<div class="aviso-edu calc-aviso"><p>${esc(c.CALC_UI.disclaimer)} ${esc(AVISO_EXTRA)}</p></div>
<div class="calc" data-calculadora="${esc(info.slug)}">
<p class="calc-carregando">Carregando a calculadora. Se ela não aparecer, o seu navegador pode estar bloqueando o JavaScript deste site. Você também pode usar a <a href="${esc(URL_APP)}" rel="noopener noreferrer">versão web</a> da Clarevo.</p>
</div>
${sem}`,
      { rotulo: 'calcular' },
    ),
    bloco(
      `<h2 id="o-que-faz">O que ela faz</h2>
<p class="lead-bloco">${esc(oQueFaz(info.slug))}</p>
${exemplo}
<p class="nota">Tudo é calculado no seu navegador, com o mesmo código do app, e nada é enviado nem guardado. No app, algumas calculadoras também oferecem atalhos para guardar o que você calculou, como anotar um parcelamento ou criar uma meta. <a href="${u(ARQUIVO_CALCULADORAS)}">Ver todas as calculadoras</a>.</p>`,
      { variante: 'alt', rotulo: 'o-que-faz' },
    ),
    bloco(aprender, { rotulo: 'aprender' }),
  ].join('\n');

  const descricao = `${info.title} ${info.subtitle}. Calculadora gratuita: a conta é feita no seu navegador e nada do que você digita é enviado.`;
  const pg = montarPagina({
    arquivo,
    titulo: info.title,
    descricao,
    capa,
    corpo,
    fonte: capa + corpo,
    valores,
    classeCapa: 'capa-simples',
    modulos: [SCRIPT_DAS_CALCULADORAS],
    precarga: precargaDaCalculadora(info.slug),
  });
  return { arquivo, ...pg };
}

function paginaIndice({ valores }) {
  const c = catalogo();
  const arquivo = ARQUIVO_CALCULADORAS;
  const u = (d) => rel(arquivo, d);
  const grupos = c.CALC_GRUPOS.map((g, i) => {
    const itens = c.CALCULADORAS.filter((x) => x.group === g.id);
    return bloco(
      `<h2 id="${g.id}">${esc(g.title)}</h2>
<ul class="temas">
${itens
  .map(
    (x) =>
      `<li><a class="cartao" href="${u(arquivoDaCalculadora(x.slug))}"><span class="titulo-cartao">${esc(x.title)}</span><span class="tema-sub">${esc(x.subtitle)}</span></a></li>`,
  )
  .join('\n')}
</ul>`,
      { variante: i % 2 === 1 ? 'alt' : '', rotulo: g.id },
    );
  });
  const rodape = bloco(
    `<div class="aviso-edu"><p>${esc(c.CALC_UI.disclaimer)} ${esc(AVISO_EXTRA)}</p></div>
<p class="nota">No app, algumas calculadoras também oferecem atalhos para guardar o que você calculou, como anotar um parcelamento ou criar uma meta. Aqui no site, nada é guardado. Para entender os conceitos por trás de cada conta, veja <a href="${u('aprender/index.html')}">Aprender</a>.</p>`,
    { rotulo: null },
  );
  const capa = `<h1>${esc(c.CALC_UI.screenTitle)}</h1>
<p class="lead">${esc(c.CALC_UI.intro.replace('Nada é gravado.', 'Tudo acontece no seu navegador: nada é enviado, gravado nem guardado.'))}</p>
<div class="acoes">
<a class="botao botao-principal" href="#${c.CALC_GRUPOS[0].id}">Ver as calculadoras</a>
<a class="botao botao-suave" href="${u('aprender/index.html')}">Aprender</a>
</div>`;
  const pg = montarPagina({
    arquivo,
    titulo: c.CALC_UI.screenTitle,
    descricao: 'Dez calculadoras de dinheiro do dia a dia: parcelado ou à vista, dívidas, multa e juros, reserva e divisão das contas da casa. A conta é feita no navegador, sem enviar nada.',
    capa,
    corpo: [...grupos, rodape].join('\n'),
    fonte: capa,
    valores,
    classeCapa: 'capa-simples',
  });
  return { arquivo, ...pg };
}

/** Todas as páginas de Calculadoras: o índice e uma por calculadora, na ordem do app. */
function paginasCalculadoras(ctx) {
  return [paginaIndice(ctx), ...catalogo().CALCULADORAS.map((info) => paginaDaCalculadora(info, ctx))];
}

module.exports = { paginasCalculadoras, exemploDa, precargaDaCalculadora, scriptsDasCalculadoras, EXEMPLOS, SCRIPT_DAS_CALCULADORAS, O_QUE_FAZ, DO_GUIA };
