'use strict';
/**
 * Para empresas: o benefício, como funciona, o que a empresa vê de fato e o que nunca vê (conferido no código, `packages/core/src/company.ts`,
 * e nos textos de `docs/legal`), o painel só na web, o que acontece quando o benefício acaba e como falar para um piloto. Sem preço
 * (P-005), sem clientes e sem número inventado.
 */
const { rel } = require('../util');
const { montarPagina, marcadoresEmHtml, bloco, celular, telaLarga } = require('../modelo');

const ARQUIVO = 'empresas/index.html';

function paginaEmpresas({ valores, img }) {
  const u = (d) => rel(ARQUIVO, d);

  const capa = `<h1>O Clarevo como benefício, sem a empresa ver as finanças de ninguém</h1>
<p class="lead">A empresa oferece o Clarevo a quem trabalha com ela e acompanha só as vagas, os convites e as licenças. Cada pessoa mantém a privacidade das próprias finanças.</p>
<div class="acoes">
<a class="botao botao-principal" href="#piloto">Falar sobre um piloto</a>
<a class="botao botao-suave" href="#o-que-ve">O que a empresa vê</a>
</div>`;

  const brutas = [
    bloco(
      `<h2 id="como-funciona">Como funciona</h2>
<p class="lead-bloco">Em cinco passos, do contrato ao acompanhamento.</p>
<ol class="passos">
<li><h3>Contrato</h3><p>A equipe do Clarevo cadastra a empresa, o contrato (plano, vagas, início e fim) e a primeira pessoa administradora. Não há cadastro aberto.</p></li>
<li><h3>Vagas</h3><p>Cada pessoa que recebe o benefício ocupa uma vaga, também no plano familiar. Convites pendentes e licenças ativas ocupam vagas, e nunca passam do número contratado.</p></li>
<li><h3>Convite por link</h3><p>Quem administra cola os e-mails, de 1 a 500 por vez, e o painel gera um link de uso único para cada e-mail. A empresa envia o link pelo canal interno dela: o Clarevo não envia e-mail de convite.</p></li>
<li><h3>A pessoa aceita</h3><p>Para aceitar, a pessoa precisa ter conta no Clarevo com o mesmo e-mail do convite, já confirmado. Quem ativa a licença é a pessoa, ao aceitar. A empresa não escolhe quem aceita.</p></li>
<li><h3>Acompanhamento</h3><p>No painel, a empresa vê as vagas, os convites e as licenças. Pode reenviar ou cancelar um convite pendente (o link anterior deixa de valer) e encerrar uma licença.</p></li>
</ol>`,
      { rotulo: 'como-funciona' },
    ),
    bloco(
      `<h2 id="o-que-ve">O que a empresa vê e o que nunca vê</h2>
<p class="lead-bloco">A regra vale no banco de dados, a cada leitura, e não só na tela: o painel não lê nenhuma tabela de finanças.</p>
<div class="ve-nao-ve">
<div class="cartao ve">
<h3>A empresa vê</h3>
<ul>
<li>os e-mails que ela mesma convidou;</li>
<li>a situação de cada convite ou licença: convite enviado, convite cancelado, ativa ou encerrada;</li>
<li>as datas dessas situações;</li>
<li>as contagens: vagas contratadas, convites pendentes, licenças ativas e encerradas;</li>
<li>os dados do contrato: plano, vagas, início e fim.</li>
</ul>
</div>
<div class="cartao nunca-ve">
<h3>A empresa nunca vê</h3>
<ul>
<li>gastos, recebimentos e valores;</li>
<li>categorias, metas, contas a pagar e cartões;</li>
<li>a Família da pessoa;</li>
<li>números somados de finanças, nem os de várias pessoas juntas;</li>
<li>quando ou como a pessoa usa o app: o painel não mostra quem entrou no app.</li>
</ul>
</div>
</div>
<p class="nota">O e-mail de cada licença é o que a empresa informou no convite. Veja também a <a href="${u('privacidade.html')}">Política de privacidade</a> e a página <a href="${u('seguranca.html')}">Segurança e privacidade</a>.</p>`,
      { variante: 'alt', rotulo: 'o-que-ve' },
    ),
    bloco(
      `<h2 id="painel">O painel, só na web</h2>
<p class="lead-bloco">Quem administra o benefício usa o painel no navegador. O app de celular não muda para as pessoas.</p>
${telaLarga(img['empresa-painel'], ARQUIVO)}
<div class="grade">
<article class="cartao">
<h3>Contrato e vagas</h3>
<p>Plano, vagas, vagas em uso, vagas livres, datas de início e de fim e a situação do contrato.</p>
</article>
<article class="cartao">
<h3>Convites e licenças</h3>
<p>Convidar por lista de e-mails, copiar ou baixar os links de uma vez, filtrar as licenças pela situação, reenviar ou cancelar um convite e encerrar uma licença.</p>
</article>
<article class="cartao">
<h3>Relatório de adesão</h3>
<p>Planilha (CSV) e PDF com a empresa, o contrato, a data e as quatro contagens. A lista de licenças (e-mail, situação e data) só entra se quem administra marcar.</p>
</article>
</div>
<div class="grade">
<article class="cartao">
<h3>A lista de licenças</h3>
<p>O que a empresa lê de cada licença: o e-mail convidado, a situação e a data. Nada de valores nem de uso do app.</p>
${celular(img['empresa-licencas'], ARQUIVO)}
</article>
<article class="cartao">
<h3>Para quem recebe o benefício</h3>
<p>No app, a pessoa vê a empresa, o plano, desde quando vale e a situação. A empresa administra só o acesso ao plano, nunca os registros.</p>
${celular(img.beneficio, ARQUIVO)}
</article>
</div>`,
      { rotulo: 'painel' },
    ),
    bloco(
      `<h2 id="fim">Quando o benefício acaba</h2>
<p class="lead-bloco">Nada é apagado por causa do fim do benefício.</p>
<ul>
<li>Se a licença for encerrada ou o contrato chegar ao fim, a pessoa mantém a conta, o histórico e a Família.</li>
<li>O acesso pleno continua por 30 dias. Depois, a pessoa passa para o plano gratuito, com leitura do histórico.</li>
<li>Para voltar a ter o benefício, será preciso convidar de novo.</li>
<li>Se a pessoa excluir a própria conta, a licença termina na hora e a empresa vê só que ela terminou.</li>
</ul>`,
      { variante: 'azul', rotulo: 'fim' },
    ),
    bloco(
      `<h2 id="piloto">Falar sobre um piloto</h2>
<p>Para conversar sobre um piloto, escreva para [E-MAIL DE CONTATO]. Ajuda contar o nome da empresa, quantas pessoas poderiam receber o benefício e quem seria a pessoa administradora, que precisa ter conta no Clarevo com o e-mail confirmado.</p>
<p>Ainda não há tabela de preços. Em um piloto, combinamos o número de vagas e o prazo.</p>
<p class="nota">Não envie dados financeiros nem de pessoas que trabalham na empresa: para convidar, o painel pede só o e-mail de cada pessoa. Dúvidas de quem recebe o convite estão na <a href="${u('ajuda/beneficio.html')}">Ajuda</a>.</p>`,
      { rotulo: 'piloto' },
    ),
  ];
  return montarPagina({
    arquivo: ARQUIVO,
    titulo: 'Para empresas',
    descricao: 'Ofereça o Clarevo como benefício. A empresa vê só e-mails convidados, situação e datas das licenças e contagens de vagas, e nunca as finanças das pessoas.',
    capa,
    corpo: brutas.map((b) => marcadoresEmHtml(b, valores)).join('\n'),
    fonte: brutas.join('\n') + capa,
    valores,
    classeCapa: 'capa-simples',
  });
}

module.exports = { paginaEmpresas };
