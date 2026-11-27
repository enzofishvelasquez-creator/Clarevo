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
 * Desde 26/11/2026 (D-128, pedido do Enzo), antes do lançamento cada cartão de plano leva a fita vermelha "Em breve" na diagonal do canto de
 * cima (`fitaEmBreve`, só CSS, com o "em breve" também no título do cartão para o leitor de tela) e a capa de cada plano, a etiqueta "Em
 * breve" ao lado do preço; saíram a etiqueta "Preços no lançamento" e a frase "A assinatura pelo app abre no lançamento. Até lá, nada é
 * cobrado.". Depois do lançamento, nada disso aparece.
 *
 * Desde a análise geral de 26/11/2026 (D-129), a capa de `planos.html` e a de cada plano têm as chamadas pelo estado do produto
 * (`chamadasDosPlanos`): lançado, "Assine aqui" (criar conta) e "Conheça o app", com a linha do teste; antes do lançamento, desde 27/11/2026
 * (decisão do Enzo, jornada de compra, pergunta 1), "Criar conta grátis" (a tela de criar conta; da página de um plano, com
 * `?plano=individual|familia`) e "Conheça o app", com a linha "A assinatura abre em breve. Por enquanto, o acesso é completo e nada é
 * cobrado." embaixo ("Assine aqui" de todas as páginas chega aqui, e a página não pode ser um beco sem saída: até 27/11/2026 havia só
 * "Conheça o app", que voltava a "Assine aqui"). A nota do anual é a do site (`noteSite`): o cartão e as lojas renovam a cada período, o
 * Pix não.
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
const { chamadasDosPlanos, emBreveNoTitulo, estadoEmVigor, fitaEmBreve, sistemas } = require('../estado');

const ARQUIVO = 'planos.html';
/** "R$ 29,90" → "29.90", para os dados estruturados. */
/**
 * O código da UN/CEFACT de cada período, para o `referenceQuantity` das ofertas (dados estruturados, D-129): MON (mês) e ANN (ano). Período
 * novo no núcleo sem código aqui faz a geração falhar.
 */
const UNIDADE_DO_PERIODO = { mensal: 'MON', anual: 'ANN' };
function unidadeDoPeriodo(periodo) {
  if (!UNIDADE_DO_PERIODO[periodo]) throw new Error(`dados estruturados: o período "${periodo}" não tem código de unidade (paginas/planos.js, UNIDADE_DO_PERIODO)`);
  return UNIDADE_DO_PERIODO[periodo];
}

/**
 * O preço anual de um plano (D-127), logo abaixo do mensal: "ou R$ 269,90 por ano (equivale a R$ 22,49 por mês)". `classe`: a do parágrafo
 * (`preco-anual` nos cartões, `preco-capa-anual` na capa da página do plano). Do núcleo, como o resto dos preços.
 */
function linhaDoAnual(plano, classe = 'preco-anual') {
  const { PLANOS } = catalogo();
  const equivale = PLANOS.equivalente(plano).replace(/^E/, 'e');
  // Desde 27/11/2026 (jornada de compra, item S6), com a diferença para 12 mensalidades, como a tela Assinatura do app: "(equivale a R$ 22,49
  // por mês, R$ 88,90 a menos que 12 mensalidades)". A ordem é a da D-131 (B): o mensal primeiro e em destaque, e o anual logo abaixo.
  return `<p class="${classe}">ou <span class="preco-valor-anual">${esc(PLANOS.precoAnual(plano))}</span>${esc(PLANOS.porAno)} (${esc(equivale)}, ${esc(PLANOS.diferencaDoAnual(plano))})</p>`;
}

/**
 * A partir de quantas pessoas o plano Família custa menos que planos Individuais separados (jornada de compra de 27/11/2026, item S4), no
 * mensal e no anual, com os preços em centavos de `plano-precos.ts`: com os preços de hoje, 3 (R$ 69,90 contra 3 x R$ 29,90 = R$ 89,70).
 * Se nem com o máximo de pessoas da Família a conta fechar, `null`, e a página não diz nada.
 */
function familiaCustaMenosAPartirDe() {
  const { PLANOS } = catalogo();
  const pessoas = (periodo) => Math.floor(PLANOS.centavos('familiar', periodo) / PLANOS.centavos('individual', periodo)) + 1;
  const n = Math.max(...PLANOS.periodos.map(pessoas));
  return n >= 2 && n <= pessoasNaFamilia() ? n : null;
}

/** A linha do preço do Família por casa, em texto (só a conta, sem "economize"): "Com 3 pessoas ou mais, ...". Vazia sem a conta. */
function linhaDaFamiliaPorCasa() {
  const n = familiaCustaMenosAPartirDe();
  if (n === null) return '';
  const { PLANOS } = catalogo();
  return `Com ${n} pessoas ou mais, o Família custa menos que planos Individuais separados: ${PLANOS.reais(PLANOS.centavos('familiar', 'mensal'))} por mês, contra ${PLANOS.reais(n * PLANOS.centavos('individual', 'mensal'))} de ${n} planos Individuais.`;
}

/**
 * Os dados estruturados de app (SoftwareApplication, D-125), na página inicial e em Planos: o nome, a categoria, onde funciona hoje (pelo
 * estado do produto) e, depois do lançamento, os dois planos com o preço mensal e o anual (D-127), do núcleo. Sem nota nem avaliação (a
 * Clarevo ainda não tem). Desde 27/11/2026 (análise de 26/11, lista "Depois"), cada oferta se chama "Plano Individual mensal" (e assim por
 * diante) e leva o período da cobrança num `priceSpecification` (`UnitPriceSpecification` com `referenceQuantity` de 1 mês ou 1 ano), com
 * o preço em centavos de `plano-precos.ts` (`PLANOS.centavos`), sem nenhum preço escrito no site.
 * Antes do lançamento, sem `offers`: os planos estão "Em breve" na página e ninguém consegue assinar ainda, e uma oferta sem
 * disponibilidade seria lida como à venda hoje. `availability: PreOrder` também não serve: não há pré-venda.
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
          offers: PLANOS.texto.plans.flatMap((p) =>
            PLANOS.periodos.map((periodo) => {
              const preco = (PLANOS.centavos(p.plan, periodo) / 100).toFixed(2);
              return {
                '@type': 'Offer',
                // "Plano Individual mensal", "Plano Família anual" (D-129, análise de 26/11, lista "Depois").
                name: `Plano ${PLANOS.nome[p.plan]} ${PLANOS.nomeDoPeriodo[periodo]}`,
                price: preco,
                priceCurrency: 'BRL',
                // O período da cobrança (schema.org): o preço vale por 1 mês ou por 1 ano (`referenceQuantity`, com os códigos MON e ANN da
                // UN/CEFACT). `billingDuration` não serve aqui: diria por quanto tempo a cobrança dura, e a assinatura renova até a pessoa cancelar.
                priceSpecification: {
                  '@type': 'UnitPriceSpecification',
                  price: preco,
                  priceCurrency: 'BRL',
                  referenceQuantity: { '@type': 'QuantitativeValue', value: 1, unitCode: unidadeDoPeriodo(periodo) },
                },
                // Sem "R$" no texto: o preço vai no campo `price`, e "R$" com número só aparece nos cartões dos planos (o teste do site confere).
                description: periodo === 'anual' ? `${p.who} ${PLANOS.cobrancaAnual}. ${PLANOS.texto.plansNote}` : `${p.who} ${PLANOS.texto.plansNote}`,
              };
            }),
          ),
        }
      : {}),
  };
}

/**
 * A linha curta embaixo dos cartões dos planos (D-128, no lugar da frase "A assinatura pelo app abre no lançamento" e da etiqueta "Preços no
 * lançamento"): o teste, o cancelamento e o "só ver e exportar", com o link do passo a passo da assinatura. A mesma no início e em Planos.
 */
function linhaDosPlanos(u) {
  const { PLANOS } = catalogo();
  return `<p class="nota nota-planos">${esc(`${PLANOS.diasDeTeste} dias grátis, sem cartão. Cancele quando quiser. Depois do teste, sem assinatura, só ver e exportar.`)} <a href="${u('ajuda/conta.html')}#guia-assinatura">Como funciona a assinatura</a></p>`;
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
 * Família (o seletor do guia, com o papel de quem anota); o Telegram no Pessoal ou na Família em que a pessoa anota (o código de ligar
 * escolhe o espaço, e o banco recusa o negócio como espaço do código, `clarevo_chat_create_code`, D-113a; corrigido na D-129, que dizia "Só
 * no seu Pessoal") e, desde 27/11/2026, no negócio de quem o criou, com a palavra "negócio" no começo da mensagem (a frente do app desta
 * rodada: a mensagem que começa com "negócio" vai para o negócio da própria pessoa);
 * Investir e o negócio só no Pessoal de cada pessoa (como em Segurança, no guia e em `business.ts`; o negócio compartilhado é do Plus, D-116). Desde 23/11/2026, os grupos têm 3, 3, 3 e 5 recursos, para a grade
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
        { nome: 'Anotar e Resumo', destino: 'app/index.html#resumo', icone: 'anotar', texto: 'Gastos e recebimentos em poucos toques. O Resumo mostra o recebido, o pago e o que ainda vence no mês.', onde: soNaFamilia('No seu Pessoal e, com o papel de quem anota, na Família.') },
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
        // Desde 27/11/2026, o passo a passo da Ajuda: em O app, o recurso Aprender ficou recolhido em "Os recursos" (`docs/22_SITE.md`, seção 22.1).
        { nome: 'Aprender, simulador e calculadoras', destino: ajudaDoGuia('aprender'), icone: 'aprender', texto: 'Explicações curtas com fonte e data de revisão. O simulador e as calculadoras usam só os números que você digita.' },
      ],
    },
    {
      id: 'do-seu-jeito',
      titulo: 'Do seu jeito',
      itens: [
        { nome: 'Espaço Negócio', destino: ajudaDoGuia('negocio'), icone: 'negocio', texto: 'Para quem tem CNPJ ou trabalha por conta: as contas do negócio separadas do Pessoal, com quanto entrou, saiu e sobrou no mês.', nota: 'Incluído na assinatura: um negócio por pessoa, sem custo a mais.', onde: soNaFamilia('O negócio é só de quem o criou e não entra na Família.') },
        { nome: 'Anotar pelo Telegram', destino: ajudaDoGuia('telegram'), icone: 'mensagem', texto: 'Anote um gasto ou um recebimento com uma mensagem escrita para a Clarevo.', onde: soNaFamilia('No seu Pessoal ou na Família em que você anota e, com a palavra negócio no começo da mensagem, no seu negócio.') },
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
  // Desde 27/11/2026 (jornada de compra, item S4), primeiro o que a casa ganha (as contas da casa em comum, o Pessoal de cada pessoa só dela)
  // e a conta do preço por casa; a logística do convite e da titularidade desce.
  return [
    'Cada pessoa continua com o próprio Pessoal, que só ela vê, e a Família em comum mostra a cada uma o que o papel permite.',
    `Até ${pessoasNaFamilia()} pessoas na mesma Família, contando a pessoa titular.`,
    'Uma assinatura só, paga pela pessoa titular. Quem recebe o convite para a Família não paga.',
    ...(linhaDaFamiliaPorCasa() ? [linhaDaFamiliaPorCasa()] : []),
    'Convite por link, de uso único e válido por 7 dias, com o papel de quem anota e vê ou de quem só vê.',
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

/**
 * O que a casa ganha, em uma frase, no começo de "Para quem é" do plano Família (jornada de compra de 27/11/2026, item S4: a página abria pela
 * logística do convite). Os mesmos fatos da página inicial e do guia da Família: as contas da casa em comum e o Pessoal de cada pessoa só dela.
 */
const LEAD_DA_FAMILIA = 'A casa toda em ordem, numa assinatura só: as contas da casa ficam em comum, na Família, e o Pessoal de cada pessoa continua só dela.';

/** A página de um plano (`individual` ou `familiar`). */
function paginaDoPlano(plano, { valores, estado = estadoEmVigor() }) {
  const arquivo = PAGINA_DO_PLANO[plano];
  const u = (d) => rel(arquivo, d);
  const { PLANOS } = catalogo();
  const t = PLANOS.texto;
  const nome = PLANOS.nome[plano];
  const outro = OUTRO[plano];
  const familia = plano === 'familiar';
  // No fim da página: o outro plano e o resumo dos dois.
  const caminhos = `<p class="acoes"><a class="botao botao-principal" href="${u(PAGINA_DO_PLANO[outro])}">Ver o plano ${esc(PLANOS.nome[outro])}</a> <a class="botao botao-suave" href="${u(ARQUIVO)}">Comparar os planos</a></p>`;

  // O preço fica na capa, ao lado do nome: "R$" com número só aqui nesta página (o teste do site confere).
  // Antes do lançamento (D-128), o preço leva a etiqueta "Em breve", como a fita dos cartões na página inicial e no resumo. Desde a D-129, as
  // chamadas pelo estado do produto (`chamadasDosPlanos`).
  const capa = `<p class="migalha"><a href="${u(ARQUIVO)}">Planos</a></p>
<h1>Plano ${esc(nome)}</h1>
<p class="preco-capa"><span class="preco-valor">${esc(PLANOS.preco(plano))}</span>${esc(PLANOS.porMes)}${estado.lancado ? '' : ' <span class="etiqueta etiqueta-capa">Em breve</span>'}</p>
${linhaDoAnual(plano, 'preco-capa-anual')}
<p class="lead">${esc(t.plans.find((p) => p.plan === plano).who)}</p>
${chamadasDosPlanos(arquivo, estado, { plano })}`;

  const assinatura = `<h2 id="assinatura">Como funciona a assinatura</h2>
<ul class="como-funciona">
<li>${esc(t.plansNote)}</li>
<li>Depois do teste, sem assinatura, a conta fica só para ver e exportar. ${esc(t.readOnlyWhat)}</li>
<li>${esc(PLANOS.notaDoAnual)}</li>
<li>${esc(t.howToPay)} Com Pix, você paga um mês por vez ou o ano de uma vez.</li>
<li>${esc(t.benefitNote)} <a href="${u('empresas/index.html')}">Veja como funciona o benefício pela empresa</a>.</li>
</ul>
<p class="nota">Os detalhes estão nos <a href="${u('termos.html')}">Termos de uso</a> e na <a href="${u(ajudaDoGuia('assinatura'))}">Ajuda</a>.</p>`;

  const brutas = [
    bloco(
      // Desde 23/11/2026, com a marca de lima de cada item (o que o plano dá), como os cartões de "O que o plano inclui" logo abaixo.
      `<h2 id="para-quem">Para quem é</h2>
${familia ? `<p class="lead-bloco">${esc(LEAD_DA_FAMILIA)}</p>\n` : ''}<ul class="como-funciona lista-marcada">
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
  const fita = fitaEmBreve(estado);

  // Um link só por cartão, que cobre o cartão inteiro (como na página inicial): nada interativo dentro de outro. Antes do lançamento, a fita
  // "Em breve" no canto de cima (D-128).
  const cartoes = t.plans
    .map(
      (p) => `<article class="cartao plano plano-link${fita ? ' com-fita' : ''}">
${fita ? `${fita}\n` : ''}<h3>${esc(PLANOS.nome[p.plan])}${emBreveNoTitulo(estado)}</h3>
<p class="preco"><span class="preco-valor">${esc(PLANOS.preco(p.plan))}</span>${esc(PLANOS.porMes)}</p>
${linhaDoAnual(p.plan)}
<p>${esc(p.who)}</p>
<p>${esc(oQueMuda(p.plan))}</p>
<p class="ver-plano"><a href="${u(PAGINA_DO_PLANO[p.plan])}">Ver o plano ${esc(PLANOS.nome[p.plan])}</a></p>
</article>`,
    )
    .join('\n');

  // D-129: as chamadas pelo estado do produto (lançado, "Assine aqui" e "Conheça o app"; antes, a assinatura em breve e "Conheça o app").
  const capa = `<h1>Planos da Clarevo</h1>
<p class="lead">Dois planos, com os mesmos recursos do app. O que muda é para quem é a assinatura.</p>
${chamadasDosPlanos(ARQUIVO, estado)}`;

  const brutas = [
    bloco(
      `<h2 id="comparar">Os dois planos</h2>
<div class="grade">
${cartoes}
</div>
${linhaDosPlanos(u)}
<p class="nota">${esc(PLANOS.notaDoAnual)} Os detalhes estão nos <a href="${u('termos.html')}">Termos de uso</a>.</p>`,
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

module.exports = { paginasPlanos, paginaPlanos, paginaDoPlano, gruposDeRecursos, dadosDoApp, pessoasNaFamilia, linhaDoAnual, linhaDosPlanos, familiaCustaMenosAPartirDe, linhaDaFamiliaPorCasa, LEAD_DA_FAMILIA, ARQUIVO_PLANOS: ARQUIVO, PAGINA_DO_PLANO };
