'use strict';
/**
 * Planos da Clarevo. Desde 19/11/2026 (pedido do Enzo: clicar num plano mostra o que aquele plano inclui, e não os dois), uma página por
 * plano, `planos/individual.html` e `planos/familia.html`, e `planos.html` virou um resumo curto: os dois cartões, cada um levando à página
 * do plano, com uma linha sobre o que muda. Os cartões da seção Planos da página inicial levam direto à página de cada plano. (As páginas
 * dos planos ficam numa pasta, como as de `indicadores/`; `planos.html` continua no mesmo endereço, como `imprensa.html` ao lado de
 * `imprensa/`.)
 *
 * Cada página de plano tem o nome, o preço e o "por mês", para quem é (o que só aquele plano tem: no Individual, uma pessoa, com o Pessoal
 * só dela; no Família, até 6 pessoas, convite por link, papéis, o Pessoal de cada pessoa e o que quem é titular administra), "O que o plano
 * inclui" (todos os recursos do app, cada um com uma frase e o link para a Ajuda ou para O app: os dois planos têm os mesmos recursos, e a
 * página do Família diz que cada pessoa tem todos eles e onde cada um vale), como funciona a assinatura, no Família duas perguntas que não
 * repetem o resto e, no fim, "Ver o plano ..." (o outro) e "Comparar os planos".
 *
 * Os nomes, os preços, o "por mês" e as frases da assinatura vêm do núcleo (`catalogo().PLANOS`, de `packages/core/src/plano.ts`), para o
 * site e o app dizerem o mesmo; o resto foi conferido no guia de uso do app (`packages/core/src/guide`), nas decisões de `docs/00` (D-083
 * para o plano Família pago pela pessoa titular, D-093 para o Pix mês a mês, D-105 para o calendário, D-113 e `docs/52` para o Espaço
 * Negócio, incluído na assinatura, um negócio por pessoa, sem diferença entre os planos, e D-116: o negócio compartilhado com a Família é do
 * Clarevo Plus, depois do lançamento, e o site não o promete) e na página O app. Nenhum recurso é prometido sem estar no app hoje. Preço
 * ("R$" e número) só nos dois cartões de `planos.html` e na capa de cada página de plano (o teste do site confere).
 */
const { esc } = require('../texto');
const { rel } = require('../util');
const { montarPagina, marcadoresEmHtml, bloco } = require('../modelo');
const { catalogo } = require('../catalogo');

const ARQUIVO = 'planos.html';
/** A página de cada plano, pelo `plan` do núcleo (`individual` e `familiar`). */
const PAGINA_DO_PLANO = { individual: 'planos/individual.html', familiar: 'planos/familia.html' };
/** O outro plano, para o link do fim de cada página. */
const OUTRO = { individual: 'familiar', familiar: 'individual' };

/** O link da Ajuda de uma entrada do guia do app (`ajuda/<tema>.html#guia-<id>`); recusa entrada que não existe. */
function ajudaDoGuia(id) {
  const c = catalogo();
  if (!c.GUIA.some((e) => e.id === id)) throw new Error(`o guia do core não tem a entrada "${id}" (páginas dos planos)`);
  return `ajuda/${require('./ajuda').temaDoGuia(id)}.html#guia-${id}`;
}

/** Quantas pessoas cabem numa Família, contando quem é titular (o FAMILY_MAX_PEOPLE do núcleo, no texto do plano Família). */
function pessoasNaFamilia() {
  const quem = catalogo().PLANOS.texto.plans.find((p) => p.plan === 'familiar').who;
  const m = /até (\d+) pessoas/.exec(quem);
  if (!m) throw new Error(`o texto do plano Família no núcleo não diz mais "até N pessoas": ${quem}`);
  return Number(m[1]);
}

/**
 * Os recursos do app, em grupos, os mesmos nos dois planos. Cada um: o nome (o texto do link), o destino (Ajuda ou O app) e uma frase
 * curta, escrita conferindo o guia de uso e as decisões citadas no começo do arquivo. No plano Família, quatro frases dizem onde o recurso
 * vale: anotar no Pessoal ou na Família (o seletor do guia, com o papel de quem anota); Investir, o Telegram e o negócio só no Pessoal de
 * cada pessoa (como em Segurança, no guia e em `business.ts`; o negócio compartilhado é do Plus, D-116).
 */
function gruposDeRecursos(plano) {
  const familia = plano === 'familiar';
  return [
    {
      id: 'dia-a-dia',
      titulo: 'O dia a dia',
      itens: [
        ['Anotar e Resumo', 'app/index.html#resumo', familia
          ? 'Anote gastos e recebimentos em poucos toques, no seu Pessoal ou, com o papel de quem anota, na Família; o Resumo mostra o recebido, o pago e o que ainda vai vencer no mês, em cada espaço.'
          : 'Anote gastos e recebimentos em poucos toques; o Resumo mostra o recebido, o pago e o que ainda vai vencer no mês.'],
        ['Contas a pagar', ajudaDoGuia('contas-a-pagar'), 'As contas que ainda vão vencer, com lembrete no app para celular; quando você paga, o valor passa a contar em Pago.'],
        ['Cartões e faturas', ajudaDoGuia('cartoes'), 'As compras na fatura de cada cartão, com o limite usado; a compra só entra em Pago quando a fatura é paga.'],
        ['Calendário do mês', 'app/index.html#contas', 'Contas, faturas e gastos fixos do mês por dia, com o previsto separado do que já foi pago.'],
      ],
    },
    {
      id: 'ler-e-importar',
      titulo: 'Ler e importar, no próprio aparelho',
      itens: [
        ['Importar extrato e fatura', ajudaDoGuia('importar-extrato'), 'Do arquivo do banco (PDF, OFX ou planilha) ou de prints da tela do banco, lidos no aparelho, com a revisão de cada linha antes de importar.'],
        ['Ler nota, comprovante e boleto', ajudaDoGuia('nota-fiscal'), 'A nota fiscal, o comprovante de Pix ou de pagamento e o boleto preenchem o gasto ou a conta a pagar, e o arquivo não é guardado.'],
      ],
    },
    {
      id: 'guardar-e-investir',
      titulo: 'Guardar e investir',
      itens: [
        ['Metas e reserva', ajudaDoGuia('metas'), 'Metas com prazo e a reserva para imprevistos, com o guardado só pelo que você registra e o plano de guardar em etapas.'],
        ['Investir', ajudaDoGuia('investimentos'), familia
          ? 'O que você já investe, só no seu Pessoal, pelo valor do extrato: quanto aplicou, quanto vale e quanto rendeu, ao lado do CDI, do IPCA e da poupança. Ninguém da Família vê. Não é recomendação de investimento.'
          : 'O que você já investe, pelo valor do extrato: quanto aplicou, quanto vale e quanto rendeu, ao lado do CDI, do IPCA e da poupança. Não é recomendação de investimento.'],
      ],
    },
    {
      id: 'aprender',
      titulo: 'Aprender e calcular',
      itens: [
        ['Aprender, simulador e calculadoras', 'app/index.html#aprender', 'Explicações curtas com fonte e data de revisão, o simulador e as calculadoras, que usam só os números que você digita.'],
      ],
    },
    {
      id: 'do-seu-jeito',
      titulo: 'Do seu jeito',
      itens: [
        ['Anotar pelo Telegram', ajudaDoGuia('telegram'), familia
          ? 'Anote um gasto ou um recebimento no seu Pessoal mandando uma mensagem escrita para a Clarevo no Telegram.'
          : 'Anote um gasto ou um recebimento mandando uma mensagem escrita para a Clarevo no Telegram.'],
        ['Espaço Negócio', ajudaDoGuia('negocio'), familia
          ? 'Para quem tem CNPJ ou trabalha por conta: as contas do negócio num espaço separado do Pessoal, com quanto entrou, saiu e sobrou no mês. Incluído na assinatura: um negócio por pessoa, sem custo a mais. O negócio é só de quem o criou e não entra na Família.'
          : 'Para quem tem CNPJ ou trabalha por conta: as contas do negócio num espaço separado do Pessoal, com quanto entrou, saiu e sobrou no mês. Incluído na assinatura: um negócio por pessoa, sem custo a mais.'],
        ['Tema claro ou escuro', 'ajuda/conta.html#p-tema', 'O app segue o tema do aparelho, e em Conta dá para escolher Claro ou Escuro.'],
        ['Ocultar valores', ajudaDoGuia('ocultar-valores'), 'Esconde os valores em reais da tela e, no celular, pode pedir biometria ao abrir o app.'],
        ['Exportar meus dados', ajudaDoGuia('exportar'), 'Leve os seus gastos e recebimentos para uma planilha (CSV) ou um resumo em PDF, montado no próprio aparelho.'],
      ],
    },
  ];
}

/**
 * O que só cada plano tem, conferido em D-083, no guia da Família e em `family.ts` (FAMILY_MAX_PEOPLE conta quem é titular). O Espaço
 * Negócio não é uma diferença entre os planos (revisão de 18/11/2026): o app não limita o espaço por plano (`create_business` só recusa um
 * segundo negócio por pessoa), e o site diz "Incluído na assinatura" nos dois, sem prometer negócio compartilhado com a Família (D-116).
 */
function oQueSoEsteTem(plano) {
  if (plano === 'individual') return ['Para uma pessoa: a assinatura é sua.', 'O seu Pessoal, que só você vê.', 'Todos os recursos do app, listados abaixo.'];
  return [
    `Até ${pessoasNaFamilia()} pessoas na mesma Família, contando a pessoa titular.`,
    'Uma assinatura só, paga pela pessoa titular. Quem recebe o convite para a Família não paga.',
    'Convite por link, de uso único e válido por 7 dias, com o papel de quem anota e vê ou de quem só vê.',
    'Cada pessoa continua com o próprio Pessoal, que só ela vê, e a Família em comum mostra a cada uma o que o papel permite.',
    'Quem é titular muda o papel de cada pessoa, passa a titularidade ou encerra a Família, e quem quiser sai.',
  ];
}

/** Os grupos de recursos em HTML; `u` monta o caminho relativo de um link interno. */
function listaDeRecursos(plano, u) {
  return gruposDeRecursos(plano)
    .map(
      (g) => `<section class="recursos-plano" aria-labelledby="g-${g.id}">
<h3 id="g-${g.id}">${esc(g.titulo)}</h3>
<ul>
${g.itens.map(([nome, destino, frase]) => `<li><a href="${u(destino)}">${esc(nome)}</a>: ${esc(frase)}</li>`).join('\n')}
</ul>
</section>`,
    )
    .join('\n');
}

/** A página de um plano (`individual` ou `familiar`). */
function paginaDoPlano(plano, { valores }) {
  const arquivo = PAGINA_DO_PLANO[plano];
  const u = (d) => rel(arquivo, d);
  const { PLANOS } = catalogo();
  const t = PLANOS.texto;
  const nome = PLANOS.nome[plano];
  const outro = OUTRO[plano];
  const familia = plano === 'familiar';
  const aindaNao = PLANOS.aberta ? '' : `<p class="nota">${esc(t.notOpenYet)}</p>\n`;
  // No fim da página: o outro plano e o resumo dos dois.
  const caminhos = `<p class="acoes"><a class="botao botao-principal" href="${u(PAGINA_DO_PLANO[outro])}">Ver o plano ${esc(PLANOS.nome[outro])}</a> <a class="botao botao-suave" href="${u(ARQUIVO)}">Comparar os planos</a></p>`;

  // O preço fica na capa, ao lado do nome: "R$" com número só aqui nesta página (o teste do site confere).
  const capa = `<p class="migalha"><a href="${u(ARQUIVO)}">Planos</a></p>
<h1>Plano ${esc(nome)}</h1>
<p class="preco-capa"><span class="preco-valor">${esc(PLANOS.preco(plano))}</span>${esc(PLANOS.porMes)}</p>
<p class="lead">${esc(t.plans.find((p) => p.plan === plano).who)}</p>`;

  const assinatura = `<h2 id="assinatura">Como funciona a assinatura</h2>
<ul class="como-funciona">
<li>${esc(t.plansNote)}</li>
<li>Depois do teste, sem assinatura, a conta fica só para ver e exportar. ${esc(t.readOnlyWhat)}</li>
<li>${esc(t.howToPay)} Com Pix, você paga um mês por vez.</li>
<li>${esc(t.benefitNote)} <a href="${u('empresas/index.html')}">Veja Para empresas</a>.</li>
</ul>
${aindaNao}<p class="nota">Os detalhes estão nos <a href="${u('termos.html')}">Termos de uso</a> e na <a href="${u(ajudaDoGuia('assinatura'))}">Ajuda</a>.</p>`;

  const brutas = [
    bloco(
      `<h2 id="para-quem">Para quem é</h2>
<ul class="como-funciona">
${oQueSoEsteTem(plano).map((i) => `<li>${esc(i)}</li>`).join('\n')}
</ul>
<p class="pequeno"><a href="${u(ajudaDoGuia(familia ? 'familia' : 'assinatura'))}">${familia ? 'Como funciona a Família, na Ajuda' : 'Como funciona a assinatura, na Ajuda'}</a></p>`,
      { rotulo: 'para-quem' },
    ),
    bloco(
      `<h2 id="inclui">O que o plano inclui</h2>
<p class="lead-bloco">${familia ? 'Cada pessoa da Família tem todos os recursos do app. No seletor do topo, cada tela mostra o seu Pessoal ou a Família, com as contas da casa em conjunto.' : 'Todos os recursos do app, para você.'} Cada recurso leva ao passo a passo na Ajuda ou às telas em O app.</p>
<div class="grupos-recursos">
${listaDeRecursos(plano, u)}
</div>`,
      { variante: 'alt', rotulo: 'inclui' },
    ),
    ...(familia
      ? [
          bloco(assinatura, { rotulo: 'assinatura' }),
          // Duas perguntas que não repetem o resto da página: a conta de quem é convidado e o que fica na Família de quem sai (guia da Família).
          bloco(
            `<h2 id="perguntas">Perguntas sobre a Família</h2>
<div class="perguntas-planos">
<article class="pergunta" aria-labelledby="q-conta">
<h3 id="q-conta">Quem eu convido precisa ter conta?</h3>
<p>Precisa ter uma conta na Clarevo. Quem ainda não tem cria a conta ao abrir o link do convite.</p>
</article>
<article class="pergunta" aria-labelledby="q-sair">
<h3 id="q-sair">O que acontece com o que eu anotei se eu sair da Família?</h3>
<p>O que você anotou na Família continua lá, como histórico da casa, com o seu primeiro nome e a marca "ex-membro". O seu Pessoal continua só seu.</p>
</article>
</div>
${caminhos}`,
            { variante: 'alt', rotulo: 'perguntas' },
          ),
        ]
      : [bloco(`${assinatura}\n${caminhos}`, { rotulo: 'assinatura' })]),
  ];
  return montarPagina({
    arquivo,
    titulo: `Plano ${nome}`,
    descricao: familia
      ? `O plano Família da Clarevo: até ${pessoasNaFamilia()} pessoas numa assinatura paga pela pessoa titular, convite por link, papéis, o Pessoal de cada uma e todos os recursos.`
      : 'O plano Individual da Clarevo: para uma pessoa, com o Pessoal só dela, todos os recursos do app, o teste grátis e como funciona a assinatura.',
    capa,
    corpo: brutas.map((b) => marcadoresEmHtml(b, valores)).join('\n'),
    fonte: brutas.join('\n') + capa,
    valores,
    classeCapa: 'capa-simples',
  });
}

/** O que muda entre os planos, numa linha por cartão de `planos.html` (D-083 e o guia da Família). O detalhe fica na página do plano. */
function oQueMuda(plano) {
  return plano === 'individual'
    ? 'Para uma pessoa, com o seu Pessoal, que só você vê.'
    : 'Uma assinatura só, paga pela pessoa titular. Cada pessoa tem o próprio Pessoal, e a Família em comum mostra as contas da casa.';
}

/** `planos.html`: o resumo curto, com os dois cartões (cada um leva à página do plano, por um link só) e o que muda entre eles. */
function paginaPlanos({ valores }) {
  const u = (d) => rel(ARQUIVO, d);
  const { PLANOS } = catalogo();
  const t = PLANOS.texto;
  const aindaNao = PLANOS.aberta ? '' : `<p class="nota">${esc(t.notOpenYet)}</p>\n`;

  // Um link só por cartão, que cobre o cartão inteiro (como na página inicial): nada interativo dentro de outro.
  const cartoes = t.plans
    .map(
      (p) => `<article class="cartao plano plano-link">
<h3>${esc(PLANOS.nome[p.plan])}</h3>
<p class="preco"><span class="preco-valor">${esc(PLANOS.preco(p.plan))}</span>${esc(PLANOS.porMes)}</p>
<p>${esc(p.who)}</p>
<p>${esc(oQueMuda(p.plan))}</p>
<p class="ver-plano"><a href="${u(PAGINA_DO_PLANO[p.plan])}">Ver o plano ${esc(PLANOS.nome[p.plan])}</a></p>
</article>`,
    )
    .join('\n');

  const capa = `<h1>Planos da Clarevo</h1>
<p class="lead">Dois planos, com os mesmos recursos do app. O que muda é para quem é a assinatura.</p>`;

  const brutas = [
    bloco(
      `<h2 id="comparar">Os dois planos</h2>
<div class="grade">
${cartoes}
</div>
${aindaNao}<p class="nota">${esc(t.plansNote)} Na página de cada plano estão o que ele inclui, com o caminho para cada recurso, e como funciona a assinatura. Os detalhes estão nos <a href="${u('termos.html')}">Termos de uso</a> e na <a href="${u(ajudaDoGuia('assinatura'))}">Ajuda</a>.</p>`,
      { rotulo: 'comparar' },
    ),
  ];
  return montarPagina({
    arquivo: ARQUIVO,
    titulo: 'Planos da Clarevo',
    descricao: 'Os planos Individual e Família da Clarevo: os mesmos recursos do app, o que muda entre eles e a página de cada plano, com o que ele inclui.',
    capa,
    corpo: brutas.map((b) => marcadoresEmHtml(b, valores)).join('\n'),
    fonte: brutas.join('\n') + capa,
    valores,
    classeCapa: 'capa-simples',
  });
}

/** As três páginas: o resumo e uma por plano. */
function paginasPlanos(ctx) {
  return [paginaPlanos(ctx), paginaDoPlano('individual', ctx), paginaDoPlano('familiar', ctx)];
}

module.exports = { paginasPlanos, paginaPlanos, paginaDoPlano, gruposDeRecursos, ARQUIVO_PLANOS: ARQUIVO, PAGINA_DO_PLANO };
