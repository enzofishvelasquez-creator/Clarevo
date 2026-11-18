'use strict';
/**
 * Planos da Clarevo (`planos.html`, pedido do Enzo de 18/11/2026, D-115): os cartões da seção Planos da página inicial levam para cá
 * (`#individual` e `#familia`). O que muda entre os dois planos, os recursos que os dois incluem (cada um com uma frase e o link para a
 * Ajuda ou para O app), como funciona o teste, a assinatura e o pagamento e duas perguntas que não repetem o que vem antes (revisão de
 * 18/11/2026: as outras repetiam "Como funciona" palavra por palavra).
 *
 * Os nomes, os preços, o "por mês" e as frases da assinatura vêm do núcleo (`catalogo().PLANOS`, de `packages/core/src/plano.ts`), para o
 * site e o app dizerem o mesmo; o resto foi conferido no guia de uso do app (`packages/core/src/guide`), nas decisões de `docs/00` (D-083
 * para o plano Família pago pela pessoa titular, D-093 para o Pix mês a mês, D-105 para o calendário, D-113 e `docs/52` para o Espaço
 * Negócio, incluído na assinatura, um negócio por pessoa, sem diferença entre os planos) e na página O app. Nenhum recurso é prometido sem estar
 * no app hoje. Preço ("R$" e número) só aparece nos dois cartões do começo (o teste do site confere).
 */
const { esc } = require('../texto');
const { rel } = require('../util');
const { montarPagina, marcadoresEmHtml, bloco } = require('../modelo');
const { catalogo } = require('../catalogo');

const ARQUIVO = 'planos.html';

/** O link da Ajuda de uma entrada do guia do app (`ajuda/<tema>.html#guia-<id>`); recusa entrada que não existe. */
function ajudaDoGuia(id) {
  const c = catalogo();
  if (!c.GUIA.some((e) => e.id === id)) throw new Error(`o guia do core não tem a entrada "${id}" (página Planos)`);
  return `ajuda/${require('./ajuda').temaDoGuia(id)}.html#guia-${id}`;
}

/**
 * Os recursos que os dois planos incluem, em grupos. Cada um: o nome (o texto do link), o destino (Ajuda ou O app) e uma frase curta,
 * escrita conferindo o guia de uso e as decisões citadas no começo do arquivo.
 */
function gruposDeRecursos() {
  return [
    {
      id: 'dia-a-dia',
      titulo: 'O dia a dia',
      itens: [
        ['Anotar e Resumo', 'app/index.html#resumo', 'Anote gastos e recebimentos em poucos toques; o Resumo mostra o recebido, o pago e o que ainda vai vencer no mês.'],
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
        ['Investir', ajudaDoGuia('investimentos'), 'O que você já investe, pelo valor do extrato: quanto aplicou, quanto vale e quanto rendeu, ao lado do CDI, do IPCA e da poupança. Não é recomendação de investimento.'],
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
        ['Anotar pelo Telegram', ajudaDoGuia('telegram'), 'Anote um gasto ou um recebimento mandando uma mensagem escrita para a Clarevo no Telegram.'],
        ['Espaço Negócio', ajudaDoGuia('negocio'), 'Para quem tem CNPJ ou trabalha por conta: as contas do negócio num espaço separado do Pessoal, com quanto entrou, saiu e sobrou no mês. Incluído na assinatura: um negócio por pessoa, sem custo a mais.'],
        ['Tema claro ou escuro', 'ajuda/conta.html#p-tema', 'O app segue o tema do aparelho, e em Conta dá para escolher Claro ou Escuro.'],
        ['Ocultar valores', ajudaDoGuia('ocultar-valores'), 'Esconde os valores em reais da tela e, no celular, pode pedir biometria ao abrir o app.'],
        ['Exportar meus dados', ajudaDoGuia('exportar'), 'Leve os seus gastos e recebimentos para uma planilha (CSV) ou um resumo em PDF, montado no próprio aparelho.'],
      ],
    },
  ];
}

/**
 * O que muda em cada plano, além do que os dois têm: conferido em D-083 e no guia da Família. O Espaço Negócio não é uma diferença entre os
 * planos (revisão de 18/11/2026): o app não limita o espaço por plano (`create_business` só recusa um segundo negócio por pessoa) e diz
 * "Incluído no plano, um negócio por pessoa"; até o Enzo decidir outra coisa, o site diz "Incluído na assinatura", sem citar um plano só.
 */
const O_QUE_MUDA = {
  individual: [
    'Para uma pessoa, com o seu Pessoal, que só você vê.',
  ],
  familiar: [
    'Uma assinatura só, paga pela pessoa titular. Quem recebe o convite para a Família não paga.',
    'Convite por link, de uso único e válido por 7 dias, com o papel de quem anota e vê ou de quem só vê.',
    'Cada pessoa continua com o próprio Pessoal, que só ela vê, e a Família em comum mostra a cada uma o que o papel permite.',
    'Quem é titular muda o papel de cada pessoa, passa a titularidade ou encerra a Família, e quem quiser sai.',
  ],
};

/** A âncora de cada plano: a mesma que os cartões da página inicial usam. */
const ANCORA = { individual: 'individual', familiar: 'familia' };

function paginaPlanos({ valores }) {
  const u = (d) => rel(ARQUIVO, d);
  const { PLANOS } = catalogo();
  const t = PLANOS.texto;
  const aindaNao = PLANOS.aberta ? '' : `<p class="nota">${esc(t.notOpenYet)}</p>\n`;

  const cartoes = t.plans
    .map(
      (p) => `<article class="cartao plano plano-detalhe" id="${ANCORA[p.plan]}" aria-labelledby="t-${ANCORA[p.plan]}">
<h3 id="t-${ANCORA[p.plan]}">${esc(PLANOS.nome[p.plan])}</h3>
<p class="preco"><span class="preco-valor">${esc(PLANOS.preco(p.plan))}</span>${esc(PLANOS.porMes)}</p>
<p>${esc(p.who)}</p>
<ul>
${O_QUE_MUDA[p.plan].map((i) => `<li>${esc(i)}</li>`).join('\n')}
</ul>
<p class="pequeno"><a href="${u(p.plan === 'familiar' ? ajudaDoGuia('familia') : ajudaDoGuia('assinatura'))}">${p.plan === 'familiar' ? 'Como funciona a Família' : 'Como funciona a assinatura'}</a></p>
</article>`,
    )
    .join('\n');

  const grupos = gruposDeRecursos()
    .map(
      (g) => `<section class="recursos-plano" aria-labelledby="g-${g.id}">
<h3 id="g-${g.id}">${esc(g.titulo)}</h3>
<ul>
${g.itens.map(([nome, destino, frase]) => `<li><a href="${u(destino)}">${esc(nome)}</a>: ${esc(frase)}</li>`).join('\n')}
</ul>
</section>`,
    )
    .join('\n');

  const capa = `<h1>Planos da Clarevo</h1>
<p class="lead">O que muda entre o Individual e o Família, o que os dois incluem e como funciona a assinatura.</p>`;

  const brutas = [
    bloco(
      `<h2 id="comparar">Os dois planos</h2>
<p class="lead-bloco">O que muda entre eles é para quem é a assinatura. Os recursos do app são os mesmos nos dois.</p>
<div class="grade">
${cartoes}
</div>
${aindaNao}`.trimEnd(),
      { rotulo: 'comparar' },
    ),
    bloco(
      `<h2 id="recursos">O que os dois planos incluem</h2>
<p class="lead-bloco">Tudo o que o app oferece hoje, com o caminho para o passo a passo na Ajuda ou para as telas em O app.</p>
<div class="grupos-recursos">
${grupos}
</div>`,
      { variante: 'alt', rotulo: 'recursos' },
    ),
    bloco(
      `<h2 id="como-funciona">Como funciona</h2>
<ul class="como-funciona">
<li>${esc(t.plansNote)}</li>
<li>Depois do teste, sem assinatura, a conta fica só para ver e exportar. ${esc(t.readOnlyWhat)}</li>
<li>${esc(t.howToPay)} Com Pix, você paga um mês por vez.</li>
<li>${esc(t.benefitNote)} <a href="${u('empresas/index.html')}">Veja Para empresas</a>.</li>
</ul>
<p class="nota">Os detalhes estão nos <a href="${u('termos.html')}">Termos de uso</a> e na <a href="${u(ajudaDoGuia('assinatura'))}">Ajuda</a>.</p>`,
      { rotulo: 'como-funciona' },
    ),
    bloco(
      `<h2 id="perguntas">Perguntas frequentes</h2>
<div class="perguntas-planos">
<article class="pergunta" aria-labelledby="q-cartao">
<h3 id="q-cartao">Preciso de cartão para testar?</h3>
<p>Não. O teste de ${PLANOS.diasDeTeste} dias começa sem pedir cartão.</p>
</article>
<article class="pergunta" aria-labelledby="q-familia">
<h3 id="q-familia">Quem está na Família também paga?</h3>
<p>Não. No plano Família, a pessoa titular paga a assinatura, e as pessoas convidadas para a Família usam a Clarevo sem pagar.</p>
</article>
</div>`,
      { variante: 'alt', rotulo: 'perguntas' },
    ),
  ];
  return montarPagina({
    arquivo: ARQUIVO,
    titulo: 'Planos da Clarevo',
    descricao: 'Os planos Individual e Família da Clarevo: o que muda entre eles, os recursos que os dois incluem, o teste de 14 dias e como funciona a assinatura.',
    capa,
    corpo: brutas.map((b) => marcadoresEmHtml(b, valores)).join('\n'),
    fonte: brutas.join('\n') + capa,
    valores,
    classeCapa: 'capa-simples',
  });
}

module.exports = { paginaPlanos, ARQUIVO_PLANOS: ARQUIVO, ANCORA_DOS_PLANOS: ANCORA };
