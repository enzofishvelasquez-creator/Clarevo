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
 * Desde 23/11/2026 (pedido do Enzo: "isso está feio, pouco intuitivo e não apresentável"), "O que o plano inclui" deixou de ser uma lista de
 * links sublinhados seguidos de frases longas: cada grupo é uma seção com o título e uma linha fina ao lado, e cada recurso é um cartão com
 * um ícone, o nome (o link, que cobre o cartão inteiro), uma frase curta, a ressalva que importa (Investir: "Não é recomendação de
 * investimento."; Espaço Negócio: "Incluído na assinatura: ..."; Metas: o guardado é só o que você registra), no Família a etiqueta de onde
 * o recurso vale, e "Ver como funciona" embaixo. Os grupos passaram a ter 3, 3, 3 e 5 recursos (os mesmos 14, com os mesmos destinos),
 * para a grade fechar as linhas: uma coluna no celular, duas no tablet e três no computador.
 *
 * Desde 27/11/2026 (D-127), cada cartão e cada capa mostram também o preço anual, logo abaixo do mensal, com o equivalente por mês dito
 * como equivalente ("ou R$ 269,90 por ano (equivale a R$ 22,49 por mês)"), e a assinatura diz que o anual é uma cobrança só.
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
const { montarPagina, marcadoresEmHtml, bloco, icone, dominioDe } = require('../modelo');
const { catalogo } = require('../catalogo');
const { avisoDaAssinatura, estadoEmVigor, rotuloDosPrecos, sistemas } = require('../estado');

const ARQUIVO = 'planos.html';
/** "R$ 29,90" → "29.90", para os dados estruturados. */
const precoDecimal = (texto) => texto.replace(/[^\d,]/g, '').replace(',', '.');

/**
 * O preço anual de um plano (D-127), logo abaixo do mensal: "ou R$ 269,90 por ano (equivale a R$ 22,49 por mês)". `classe`: a do parágrafo
 * (`preco-anual` nos cartões, `preco-capa-anual` na capa da página do plano). Do núcleo, como o resto dos preços.
 */
function linhaDoAnual(plano, classe = 'preco-anual') {
  const { PLANOS } = catalogo();
  const equivale = PLANOS.equivalente(plano).replace(/^E/, 'e');
  return `<p class="${classe}">ou <span class="preco-valor-anual">${esc(PLANOS.precoAnual(plano))}</span>${esc(PLANOS.porAno)} (${esc(equivale)})</p>`;
}

/**
 * Os dados estruturados de app (SoftwareApplication, D-125), na página inicial e em Planos: o nome, a categoria, onde funciona hoje (pelo
 * estado do produto) e, depois do lançamento, os dois planos com o preço mensal e o anual (D-127), do núcleo. Sem nota nem avaliação (a
 * Clarevo ainda não tem).
 * Antes do lançamento, sem `offers`: os preços são os do lançamento ("Preços no lançamento" na página) e ninguém consegue assinar ainda, e
 * uma oferta sem disponibilidade seria lida como à venda hoje. `availability: PreOrder` também não serve: não há pré-venda.
 */
function dadosDoApp(valores, estado, descricao) {
  const { PLANOS } = catalogo();
  const dominio = dominioDe(valores);
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'Clarevo',
    applicationCategory: 'FinanceApplication',
    operatingSystem: sistemas(estado),
    inLanguage: 'pt-BR',
    description: descricao,
    ...(dominio ? { url: `https://${dominio}/` } : {}),
    ...(estado.lancado
      ? {
          offers: PLANOS.texto.plans.flatMap((p) => [
            {
              '@type': 'Offer',
              name: `Plano ${PLANOS.nome[p.plan]}`,
              price: precoDecimal(PLANOS.preco(p.plan)),
              priceCurrency: 'BRL',
              // Sem "R$" no texto: o preço vai no campo `price`, e "R$" com número só aparece nos cartões dos planos (o teste do site confere).
              description: `${p.who} ${PLANOS.texto.plansNote}`,
            },
            {
              '@type': 'Offer',
              name: `Plano ${PLANOS.nome[p.plan]} anual`,
              price: precoDecimal(PLANOS.precoAnual(p.plan)),
              priceCurrency: 'BRL',
              description: `${p.who} ${PLANOS.cobrancaAnual}. ${PLANOS.texto.plansNote}`,
            },
          ]),
        }
      : {}),
  };
}

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
 * Os recursos do app, em grupos, os mesmos nos dois planos. Cada um: o nome (o texto do link e o título do cartão), o destino (Ajuda ou O
 * app), o ícone (`ICONES` de `modelo.js`), uma frase curta e, quando há, a ressalva que importa (`nota`), escritas conferindo o guia de uso e
 * as decisões citadas no começo do arquivo. No plano Família, quatro cartões dizem onde o recurso vale (`onde`): anotar no Pessoal ou na
 * Família (o seletor do guia, com o papel de quem anota); Investir, o Telegram e o negócio só no Pessoal de cada pessoa (como em Segurança,
 * no guia e em `business.ts`; o negócio compartilhado é do Plus, D-116). Desde 23/11/2026, os grupos têm 3, 3, 3 e 5 recursos, para a grade
 * de cartões fechar as linhas; no último, os dois primeiros (os maiores) ficam lado a lado no computador.
 */
function gruposDeRecursos(plano) {
  const familia = plano === 'familiar';
  const soNaFamilia = (texto) => (familia ? texto : null);
  return [
    {
      id: 'dia-a-dia',
      titulo: 'O dia a dia',
      itens: [
        { nome: 'Anotar e Resumo', destino: 'app/index.html#resumo', icone: 'anotar', texto: 'Gastos e recebimentos em poucos toques. O Resumo mostra o recebido, o pago e o que ainda vai vencer no mês.', onde: soNaFamilia('No seu Pessoal e, com o papel de quem anota, na Família.') },
        { nome: 'Contas a pagar', destino: ajudaDoGuia('contas-a-pagar'), icone: 'conta', texto: 'Os vencimentos, com lembrete no app para celular. Quando você paga, o valor passa a contar em Pago.' },
        { nome: 'Calendário do mês', destino: 'app/index.html#contas', icone: 'calendario', texto: 'Contas, faturas e gastos fixos por dia, com o previsto separado do que já foi pago.' },
      ],
    },
    {
      id: 'cartoes-e-notas',
      titulo: 'Cartões, extratos e notas',
      itens: [
        { nome: 'Cartões e faturas', destino: ajudaDoGuia('cartoes'), icone: 'cartao', texto: 'As compras na fatura de cada cartão e o limite usado. A compra só entra em Pago quando a fatura é paga.' },
        { nome: 'Importar extrato e fatura', destino: ajudaDoGuia('importar-extrato'), icone: 'importar', texto: 'PDF, OFX, planilha ou prints do banco, lidos no aparelho, com a revisão de cada linha antes de importar.' },
        { nome: 'Ler nota, comprovante e boleto', destino: ajudaDoGuia('nota-fiscal'), icone: 'ler', texto: 'Lidos no aparelho, preenchem o gasto ou a conta a pagar. O arquivo não é guardado.' },
      ],
    },
    {
      id: 'guardar-e-aprender',
      titulo: 'Guardar, investir e aprender',
      itens: [
        { nome: 'Metas e reserva', destino: ajudaDoGuia('metas'), icone: 'meta', texto: 'Metas com prazo e a reserva para imprevistos, com o plano de guardar em etapas.', nota: 'O guardado é só o que você registra.' },
        { nome: 'Investir', destino: ajudaDoGuia('investimentos'), icone: 'investir', texto: 'O que você já investe, pelo valor do extrato: quanto aplicou, quanto vale e quanto rendeu, ao lado do CDI, do IPCA e da poupança.', nota: 'Não é recomendação de investimento.', onde: soNaFamilia('Só no seu Pessoal: ninguém da Família vê.') },
        { nome: 'Aprender, simulador e calculadoras', destino: 'app/index.html#aprender', icone: 'aprender', texto: 'Explicações curtas com fonte e data de revisão. O simulador e as calculadoras usam só os números que você digita.' },
      ],
    },
    {
      id: 'do-seu-jeito',
      titulo: 'Do seu jeito',
      itens: [
        { nome: 'Espaço Negócio', destino: ajudaDoGuia('negocio'), icone: 'negocio', texto: 'Para quem tem CNPJ ou trabalha por conta: as contas do negócio separadas do Pessoal, com quanto entrou, saiu e sobrou no mês.', nota: 'Incluído na assinatura: um negócio por pessoa, sem custo a mais.', onde: soNaFamilia('O negócio é só de quem o criou e não entra na Família.') },
        { nome: 'Anotar pelo Telegram', destino: ajudaDoGuia('telegram'), icone: 'mensagem', texto: 'Anote um gasto ou um recebimento com uma mensagem escrita para a Clarevo.', onde: soNaFamilia('Só no seu Pessoal.') },
        { nome: 'Tema claro ou escuro', destino: 'ajuda/conta.html#p-tema', icone: 'tema', texto: 'O app segue o tema do aparelho, e em Conta dá para escolher Claro ou Escuro.' },
        { nome: 'Ocultar valores', destino: ajudaDoGuia('ocultar-valores'), icone: 'ocultar', texto: 'Esconde os valores em reais da tela e, no celular, pode pedir biometria ao abrir o app.' },
        { nome: 'Exportar meus dados', destino: ajudaDoGuia('exportar'), icone: 'exportar', texto: 'Os seus gastos e recebimentos numa planilha (CSV) ou num resumo em PDF, montado no próprio aparelho.' },
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

/**
 * Um recurso em cartão: o ícone, o nome (um `h4` com o link, que cobre o cartão inteiro, como nos cartões dos planos: um link só, com o
 * nome do recurso), a frase, a ressalva, a etiqueta de onde vale e "Ver como funciona" com a seta, que repete o convite do link para quem
 * vê a tela (escondido do leitor de tela, que já ouviu o nome do link). No celular, para a lista não ficar comprida, o convite dá lugar a
 * uma seta ao lado do nome (`.recurso-seta`).
 */
function cartaoDoRecurso(r, u) {
  return `<li class="recurso-cartao">
<div class="recurso-topo"><span class="recurso-icone">${icone(r.icone)}</span><h4><a href="${u(r.destino)}">${esc(r.nome)}</a></h4><span class="recurso-seta">${icone('seta', 20, 2)}</span></div>
<p class="recurso-texto">${esc(r.texto)}</p>
${r.nota ? `<p class="recurso-nota">${esc(r.nota)}</p>\n` : ''}${r.onde ? `<p class="recurso-onde">${esc(r.onde)}</p>\n` : ''}<p class="recurso-acao" aria-hidden="true">Ver como funciona${icone('seta', 18, 2)}</p>
</li>`;
}

/** Os grupos de recursos em HTML, cada um com a grade de cartões; `u` monta o caminho relativo de um link interno. */
function listaDeRecursos(plano, u) {
  return gruposDeRecursos(plano)
    .map(
      (g) => `<section class="recursos-plano" aria-labelledby="g-${g.id}">
<h3 id="g-${g.id}">${esc(g.titulo)}</h3>
<ul class="recursos-grade" role="list">
${g.itens.map((r) => cartaoDoRecurso(r, u)).join('\n')}
</ul>
</section>`,
    )
    .join('\n');
}

/**
 * As duas perguntas da página do plano Família, que não repetem o resto da página: a conta de quem é convidado e o que fica na Família de
 * quem sai (o guia da Família e `FAMILY_TEXT.exMember` de family.ts: "Nina (saiu da Família)"). Vão também nos dados estruturados.
 * Texto fixo e sem marcação, escrito aqui: entra na página sem `esc`, para as aspas continuarem aspas.
 */
const PERGUNTAS_DA_FAMILIA = [
  { id: 'conta', pergunta: 'Quem eu convido precisa ter conta?', resposta: 'Precisa ter uma conta na Clarevo. Quem ainda não tem cria a conta ao abrir o link do convite.' },
  { id: 'sair', pergunta: 'O que acontece com o que eu anotei se eu sair da Família?', resposta: 'O que você anotou na Família continua lá, como histórico da casa, com o seu primeiro nome e "saiu da Família" ao lado. O seu Pessoal continua só seu.' },
];

/** A página de um plano (`individual` ou `familiar`). */
function paginaDoPlano(plano, { valores, estado = estadoEmVigor() }) {
  const arquivo = PAGINA_DO_PLANO[plano];
  const u = (d) => rel(arquivo, d);
  const { PLANOS } = catalogo();
  const t = PLANOS.texto;
  const nome = PLANOS.nome[plano];
  const outro = OUTRO[plano];
  const familia = plano === 'familiar';
  // A frase da assinatura fechada segue o estado do produto (`avisoDaAssinatura`): nunca aparece no site lançado.
  const aviso = avisoDaAssinatura(estado);
  const aindaNao = aviso ? `<p class="nota">${esc(aviso)}</p>\n` : '';
  // No fim da página: o outro plano e o resumo dos dois.
  const caminhos = `<p class="acoes"><a class="botao botao-principal" href="${u(PAGINA_DO_PLANO[outro])}">Ver o plano ${esc(PLANOS.nome[outro])}</a> <a class="botao botao-suave" href="${u(ARQUIVO)}">Comparar os planos</a></p>`;

  // O preço fica na capa, ao lado do nome: "R$" com número só aqui nesta página (o teste do site confere).
  // Antes do lançamento (D-125), o preço leva a etiqueta "Preços no lançamento", como na página inicial e no resumo.
  const rotulo = rotuloDosPrecos(estado);
  const capa = `<p class="migalha"><a href="${u(ARQUIVO)}">Planos</a></p>
<h1>Plano ${esc(nome)}</h1>
<p class="preco-capa"><span class="preco-valor">${esc(PLANOS.preco(plano))}</span>${esc(PLANOS.porMes)}${rotulo ? ` <span class="etiqueta etiqueta-capa">${esc(rotulo)}</span>` : ''}</p>
${linhaDoAnual(plano, 'preco-capa-anual')}
<p class="lead">${esc(t.plans.find((p) => p.plan === plano).who)}</p>`;

  const assinatura = `<h2 id="assinatura">Como funciona a assinatura</h2>
<ul class="como-funciona">
<li>${esc(t.plansNote)}</li>
<li>Depois do teste, sem assinatura, a conta fica só para ver e exportar. ${esc(t.readOnlyWhat)}</li>
<li>${esc(PLANOS.notaDoAnual)}</li>
<li>${esc(t.howToPay)} Com Pix, você paga um mês por vez ou o ano de uma vez.</li>
<li>${esc(t.benefitNote)} <a href="${u('empresas/index.html')}">Veja Para empresas</a>.</li>
</ul>
${aindaNao}<p class="nota">Os detalhes estão nos <a href="${u('termos.html')}">Termos de uso</a> e na <a href="${u(ajudaDoGuia('assinatura'))}">Ajuda</a>.</p>`;

  const brutas = [
    bloco(
      // Desde 23/11/2026, com a marca de lima de cada item (o que o plano dá), como os cartões de "O que o plano inclui" logo abaixo.
      `<h2 id="para-quem">Para quem é</h2>
<ul class="como-funciona lista-marcada">
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
          // Duas perguntas que não repetem o resto da página: a conta de quem é convidado e o que fica na Família de quem sai (o guia da Família
          // e `FAMILY_TEXT.exMember` de family.ts: "Nina (saiu da Família)").
          bloco(
            `<h2 id="perguntas">Perguntas sobre a Família</h2>
<div class="perguntas-planos">
${PERGUNTAS_DA_FAMILIA.map((q) => `<article class="pergunta" aria-labelledby="q-${q.id}">
<h3 id="q-${q.id}">${q.pergunta}</h3>
<p>${q.resposta}</p>
</article>`).join('\n')}
</div>
${caminhos}`,
            { variante: 'alt', rotulo: 'perguntas' },
          ),
        ]
      : [bloco(`${assinatura}\n${caminhos}`, { rotulo: 'assinatura' })]),
  ];
  // As duas perguntas da Família também como dados estruturados (FAQPage, D-125): o mesmo texto da página.
  const faq = familia
    ? [
        {
          '@context': 'https://schema.org',
          '@type': 'FAQPage',
          mainEntity: PERGUNTAS_DA_FAMILIA.map((q) => ({ '@type': 'Question', name: q.pergunta, acceptedAnswer: { '@type': 'Answer', text: q.resposta } })),
        },
      ]
    : [];
  return montarPagina({
    arquivo,
    titulo: `Plano ${nome}: ${familia ? 'controle de gastos da família' : 'controle de gastos para uma pessoa'}`,
    descricao: familia
      ? `O plano Família da Clarevo: até ${pessoasNaFamilia()} pessoas numa assinatura paga pela pessoa titular, convite por link, papéis, o Pessoal de cada uma e todos os recursos.`
      : 'O plano Individual da Clarevo: para uma pessoa, com o Pessoal só dela, todos os recursos do app, o teste grátis e como funciona a assinatura.',
    capa,
    corpo: brutas.map((b) => marcadoresEmHtml(b, valores)).join('\n'),
    fonte: brutas.join('\n') + capa,
    valores,
    classeCapa: 'capa-simples',
    jsonld: faq,
  });
}

/** O que muda entre os planos, numa linha por cartão de `planos.html` (D-083 e o guia da Família). O detalhe fica na página do plano. */
function oQueMuda(plano) {
  return plano === 'individual'
    ? 'Para uma pessoa, com o seu Pessoal, que só você vê.'
    : 'Uma assinatura só, paga pela pessoa titular. Cada pessoa tem o próprio Pessoal, e a Família em comum mostra as contas da casa.';
}

/** `planos.html`: o resumo curto, com os dois cartões (cada um leva à página do plano, por um link só) e o que muda entre eles. */
function paginaPlanos({ valores, estado = estadoEmVigor() }) {
  const u = (d) => rel(ARQUIVO, d);
  const { PLANOS } = catalogo();
  const t = PLANOS.texto;
  const aviso = avisoDaAssinatura(estado);
  const aindaNao = aviso ? `<p class="nota">${esc(aviso)}</p>\n` : '';
  const rotulo = rotuloDosPrecos(estado);

  // Um link só por cartão, que cobre o cartão inteiro (como na página inicial): nada interativo dentro de outro.
  const cartoes = t.plans
    .map(
      (p) => `<article class="cartao plano plano-link">
<h3>${esc(PLANOS.nome[p.plan])}</h3>
<p class="preco"><span class="preco-valor">${esc(PLANOS.preco(p.plan))}</span>${esc(PLANOS.porMes)}</p>
${linhaDoAnual(p.plan)}
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
${rotulo ? `<p class="etiqueta-precos"><span class="etiqueta">${esc(rotulo)}</span></p>\n` : ''}<div class="grade">
${cartoes}
</div>
${aindaNao}<p class="nota">${esc(t.plansNote)} ${esc(PLANOS.notaDoAnual)} A página de cada plano mostra o que ele inclui, com o caminho para cada recurso, e como funciona a assinatura. Os detalhes estão nos <a href="${u('termos.html')}">Termos de uso</a> e na <a href="${u(ajudaDoGuia('assinatura'))}">Ajuda</a>.</p>`,
      { rotulo: 'comparar' },
    ),
  ];
  const descricao = `Planos e preços da Clarevo, o app de controle de gastos: Individual e Família, com os mesmos recursos e ${PLANOS.diasDeTeste} dias grátis, sem cartão.`;
  return montarPagina({
    arquivo: ARQUIVO,
    titulo: 'Planos e preços: Individual e Família',
    descricao,
    jsonld: [dadosDoApp(valores, estado, descricao)],
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

module.exports = { paginasPlanos, paginaPlanos, paginaDoPlano, gruposDeRecursos, dadosDoApp, pessoasNaFamilia, linhaDoAnual, ARQUIVO_PLANOS: ARQUIVO, PAGINA_DO_PLANO };
