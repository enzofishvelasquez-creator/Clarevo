'use strict';
/**
 * Para quem trabalha por conta e MEI (`mei.html`, D-125, 25/11/2026): a segunda das três portas da página inicial. Mostra só o Espaço Negócio
 * que já está no plano, sem custo a mais (D-113, D-121 e D-122; `docs/52_ESPACO_NEGOCIO.md`, seções 1, 7 e 8): o negócio num espaço
 * separado do Pessoal, as categorias do negócio, "Seu negócio" e o Resumo do ano, a Retirada para o Pessoal e o Trazer dinheiro do
 * Pessoal, o A receber, a nota e quem pagou, o limite do MEI e os lembretes do DAS e da declaração (no app para celular). Os nomes são os
 * do app (`packages/core/src/business.ts`, `business-receivables.ts` e `mei-reminders.ts`).
 *
 * Nada do Clarevo Plus aparece (D-113 item 7, D-116, D-123 e D-124): nem negócio compartilhado, nem sócios, ajudantes, papéis, vários
 * negócios ou o acesso de quem cuida da contabilidade. A Clarevo não calcula imposto, não diz o que declarar e não faz contabilidade (a
 * frase do app). O limite do MEI aparece sem o valor: o número e a data da regra ficam no app, que é quem os mantém.
 */
const { esc } = require('../texto');
const { rel } = require('../util');
const { montarPagina, marcadoresEmHtml, bloco, celular, icone } = require('../modelo');
const { chamadas, linhaDaCapa, selosDasLojas, textoDoAcesso } = require('../estado');

const ARQUIVO = 'mei.html';

/** O que o Espaço Negócio faz hoje, em seis cartões (a grade fecha as linhas: uma, duas ou três colunas). */
const RECURSOS = [
  { icone: 'negocio', titulo: 'O negócio no espaço dele', texto: 'Um espaço só do negócio, com as telas que você já usa no Pessoal: entradas e saídas, contas a pagar, gastos fixos, cartão e importação de extrato. Anotou no lugar errado? Dá para mover.' },
  { icone: 'conta', titulo: 'Categorias de quem vende e presta serviço', texto: 'Vendas, Serviços, Material e mercadoria, Combustível e transporte, Impostos e DAS, Taxas e maquininha e outras, prontas para usar.' },
  { icone: 'investir', titulo: 'Quanto entrou, saiu e sobrou', texto: 'Em Seu negócio, o mês e os últimos 6 meses, as maiores saídas e o Resumo do ano por categoria.' },
  { icone: 'dinheiro', titulo: 'Retirada para o Pessoal', texto: 'Levou dinheiro do negócio para casa? O valor sai de um espaço e entra no outro, sem virar custo do negócio. O caminho de volta é Trazer dinheiro do Pessoal.' },
  { icone: 'receber', titulo: 'A receber', texto: 'O fiado, a venda no cartão que ainda vai cair e outros valores, fora dos totais. Quando o dinheiro chega, toque em Recebi.' },
  { icone: 'ler', titulo: 'Nota e quem pagou', texto: 'Em cada entrada, marque se teve nota fiscal e quem pagou: pessoa física, empresa ou exterior. As marcas aparecem no Resumo do ano e na exportação.' },
];

/** Só para quem marca o tipo do negócio como MEI (D-121 e D-122). */
const PARA_MEI = [
  'Marque o tipo do negócio como MEI e veja as vendas e os serviços anotados no ano ao lado do limite anual do MEI.',
  'No app para celular, lembretes opcionais do DAS do mês e da declaração anual, desligados até você ligar.',
  'O Resumo do ano junta o ano por categoria, e a exportação leva os lançamentos do negócio para uma planilha ou um PDF.',
];

/** O que vale para todo negócio, conferido em `docs/52`, seção 1 (quem vê, o que fica no Pessoal) e no plano (D-113 e D-116). */
const LEVE_E_SO_SEU = [
  'Incluído na assinatura, no plano Individual e no Família: um negócio por pessoa, sem custo a mais.',
  'Só quem criou o negócio vê o negócio. A Família não vê o negócio, e o negócio não vê a Família.',
  'Metas e Investir ficam no Pessoal, e o Telegram anota no Pessoal ou na Família.',
  'A Clarevo não faz contabilidade, não calcula imposto e não diz o que declarar: os valores são os que você anota.',
];

const lista = (itens) => `<ul class="como-funciona lista-marcada">\n${itens.map((i) => `<li>${esc(i)}</li>`).join('\n')}\n</ul>`;

function paginaMei({ valores, img, estado }) {
  const u = (d) => rel(ARQUIVO, d);

  const capa = `<div class="capa-grade">
<div>
<p class="sobretitulo">Para quem trabalha por conta e MEI</p>
<h1>O dinheiro do negócio separado do da casa.</h1>
<p class="lead">No Espaço Negócio, você anota o que entra e o que sai do trabalho, vê quanto sobrou no mês e leva para o Pessoal o que é seu, sem misturar as contas. Incluído na assinatura, sem custo a mais.</p>
${chamadas(ARQUIVO, estado, { secundaria: 'app' })}
<p class="estado-produto">${esc(linhaDaCapa(estado))}</p>
${selosDasLojas(estado, { pequenos: true })}
</div>
${celular(img.negocio, ARQUIVO, { carregamento: 'eager' })}
</div>`;

  const cartoes = RECURSOS.map(
    (r) => `<li class="recurso-cartao recurso-fixo">
<div class="recurso-topo"><span class="recurso-icone">${icone(r.icone)}</span><h3>${esc(r.titulo)}</h3></div>
<p class="recurso-texto">${esc(r.texto)}</p>
</li>`,
  ).join('\n');

  const brutas = [
    bloco(
      `<h2 id="o-que-faz">O que o Espaço Negócio faz</h2>
<p class="lead-bloco">Separar o dinheiro do negócio do dinheiro da casa é o primeiro passo para saber se o trabalho está rendendo. O espaço é leve: nasce só com o nome do negócio.</p>
<ul class="recursos-grade" role="list">
${cartoes}
</ul>`,
      { rotulo: 'o-que-faz' },
    ),
    bloco(
      `<div class="colunas-mei">
<div>
<h2 id="para-mei">Para quem é MEI</h2>
${lista(PARA_MEI)}
</div>
<div>
<h2 id="leve">Leve, e só seu</h2>
${lista(LEVE_E_SO_SEU)}
</div>
</div>`,
      { variante: 'alt', rotulo: 'para-mei' },
    ),
    bloco(
      `<div class="chamada-final">
<h2 id="comecar">Comece pelo mês do negócio</h2>
<p>${esc(`Escolha o plano e, em Conta, crie o Espaço Negócio só com o nome. As telas de sempre passam a valer para ele, no navegador ou no celular.${estado.lancado ? ` ${textoDoAcesso(estado)}` : ''}`)}</p>
${chamadas(ARQUIVO, estado, { secundaria: 'web' })}
<p class="pequeno"><a href="${u('ajuda/negocio.html')}#guia-negocio">Como usar o Espaço Negócio, na Ajuda</a> · <a href="${u('planos.html')}">Ver os planos</a></p>
</div>`,
      { rotulo: 'comecar' },
    ),
  ];
  return montarPagina({
    arquivo: ARQUIVO,
    titulo: 'App para MEI e quem trabalha por conta',
    descricao: 'O Espaço Negócio da Clarevo separa o dinheiro do negócio do da casa: categorias do negócio, retirada para o Pessoal, a receber e o limite do MEI.',
    capa,
    corpo: brutas.map((b) => marcadoresEmHtml(b, valores)).join('\n'),
    fonte: brutas.join('\n') + capa,
    valores,
  });
}

module.exports = { paginaMei, ARQUIVO_MEI: ARQUIVO };
