'use strict';
/**
 * Para empresas (D-068): a proposta de bem-estar financeiro integrada ao programa de bem-estar da empresa, o que ela inclui e não inclui, o
 * bloco curto sobre a NR-1 (Manual v2.2, seção 12, e Playbook v2.2, "Proposta empresarial e comunicação sobre NR 1"), como funciona, o que a
 * empresa vê de fato e o que nunca vê (conferido no código, `packages/core/src/company.ts`, e nos textos de `docs/legal`), o painel só na web,
 * o que acontece quando o benefício acaba e como solicitar uma apresentação. Sem preço (P-005), sem clientes e sem número inventado. Nada de
 * psicologia, mentoria, palestras, laudos, PGR ou relatórios de risco como incluídos. O bloco da NR-1 espera a pergunta 35 do resumo para o
 * advogado (`docs/legal/resumo-para-advogado.md`, seção j): é a revisão jurídica que libera a publicação do site, como a dos textos legais.
 */
const { esc } = require('../texto');
const { rel } = require('../util');
const { URL_NR1 } = require('../config');
const { montarPagina, marcadoresEmHtml, bloco, celular, telaLarga } = require('../modelo');
const { blocoDeContato } = require('./formularios');

const ARQUIVO = 'empresas/index.html';

function paginaEmpresas({ valores, img }) {
  const u = (d) => rel(ARQUIVO, d);

  const capa = `<h1>Bem-estar financeiro também faz parte do cuidado com sua equipe.</h1>
<p class="lead">Conheça a proposta da Clarevo para apoiar a organização financeira das pessoas da equipe e integrar esse cuidado ao programa de bem-estar da empresa.</p>
<div class="acoes">
<a class="botao botao-principal" href="#apresentacao">Solicitar apresentação</a>
<a class="botao botao-suave" href="#o-que-ve">O que a empresa vê</a>
</div>`;

  const brutas = [
    bloco(
      `<h2 id="bem-estar">O cuidado financeiro dentro do programa de bem-estar</h2>
<p class="lead-bloco">A empresa oferece a Clarevo a quem trabalha com ela e acompanha só as vagas, os convites e as licenças. Cada pessoa usa o app para organizar o mês e acompanhar decisões financeiras pessoais e familiares, e mantém a privacidade das próprias finanças.</p>
<div class="grade">
<article class="cartao">
<h3>O que a proposta inclui hoje</h3>
<p>Uma licença da Clarevo para cada pessoa convidada, o painel de convites e licenças e o relatório de adesão, só com contagens. Escopo, implantação, privacidade e condições comerciais são combinados na apresentação.</p>
</article>
<article class="cartao">
<h3>O que não está incluído</h3>
<p>Atendimento psicológico, mentoria, palestras, laudos, PGR e relatórios de risco não fazem parte do que a Clarevo oferece hoje. Se um deles entrar em uma proposta, só será anunciado com escopo e contratação confirmados.</p>
</article>
</div>
<p class="nota">A Clarevo não promete redução de absenteísmo, de estresse nem de adoecimento, e não oferece à empresa acesso a transações, dívidas ou relatos individuais.</p>`,
      { rotulo: 'bem-estar' },
    ),
    bloco(
      `<h2 id="nr-1">Bem-estar financeiro e a NR-1</h2>
<p class="lead-bloco">A NR-1 trata dos fatores de risco psicossociais relacionados ao trabalho, dentro do gerenciamento de riscos ocupacionais. Veja como a proposta se relaciona com a norma.</p>
<ul>
<li>A NR-1 não exige a contratação de um aplicativo financeiro.</li>
<li>A proposta da Clarevo pode ser considerada como ação complementar, conforme a avaliação técnica da empresa.</li>
<li>Contratar a Clarevo, sozinha, não comprova atendimento à norma.</li>
<li>A Clarevo não substitui as ações sobre a organização do trabalho, como sobrecarga e assédio, nem o gerenciamento de riscos da empresa.</li>
<li>O endividamento pessoal não deve ser classificado automaticamente como risco ocupacional: a avaliação considera as condições e a organização do trabalho e não equivale a uma avaliação clínica individual.</li>
</ul>
<p class="nota">A Clarevo não se apresenta como aplicativo certificado, não promete adequação da empresa à norma e não oferece laudos, PGR nem painéis de risco. Prazos, fiscalização e sanções mudam: confira a página oficial antes de decidir. Fonte: <a href="${esc(URL_NR1)}" rel="noopener noreferrer">Ministério do Trabalho e Emprego, NR-1</a> (capítulo 1.5, na redação da Portaria MTE nº 1.419/2024), consultada em 24/10/2026.</p>`,
      { variante: 'alt', rotulo: 'nr-1' },
    ),
    bloco(
      `<h2 id="como-funciona">Como funciona</h2>
<p class="lead-bloco">Em cinco passos, do contrato ao acompanhamento.</p>
<ol class="passos">
<li><h3>Contrato</h3><p>A equipe da Clarevo cadastra a empresa, o contrato (plano, vagas, início e fim) e a primeira pessoa administradora. Não há cadastro aberto.</p></li>
<li><h3>Vagas</h3><p>Cada pessoa que recebe o benefício ocupa uma vaga, também no plano familiar. Convites pendentes e licenças ativas ocupam vagas, e nunca passam do número contratado.</p></li>
<li><h3>Convite por link</h3><p>Quem administra cola os e-mails, de 1 a 500 por vez, e o painel gera um link de uso único para cada e-mail. A empresa envia o link pelo canal interno dela: a Clarevo não envia e-mail de convite.</p></li>
<li><h3>A pessoa aceita</h3><p>Para aceitar, a pessoa precisa ter conta na Clarevo com o mesmo e-mail do convite, já confirmado. Quem ativa a licença é a pessoa, ao aceitar. A empresa não escolhe quem aceita.</p></li>
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
<li>as datas dessas situações: a do convite, a de quando a pessoa aceitou ("Ativa desde") e a do encerramento;</li>
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
<li>quando a pessoa abre o app e o que ela anota nele: o painel mostra só a data em que ela aceitou o convite e a do encerramento.</li>
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
<p>O que a empresa lê de cada licença: o e-mail convidado, a situação e as datas (do convite, de quando a pessoa aceitou e do encerramento). Nada de valores nem do que a pessoa anota.</p>
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
<li>O acesso pleno continua por 30 dias, contados do encerramento da licença ou do fim do contrato. O app mostra para a pessoa até quando vai.</li>
<li>O que vale depois desses 30 dias ainda não está definido.</li>
<li>Para voltar a ter o benefício, será preciso convidar de novo.</li>
<li>Se a pessoa excluir a própria conta, a licença termina na hora e a empresa a vê como encerrada, com a data.</li>
</ul>`,
      { variante: 'azul', rotulo: 'fim' },
    ),
    bloco(
      `<h2 id="apresentacao">Solicitar apresentação</h2>
<p>Para solicitar uma apresentação da proposta, escreva para [E-MAIL DE CONTATO]. Ajuda contar o nome da empresa, quantas pessoas poderiam receber o benefício, como é o programa de bem-estar hoje e quem seria a pessoa administradora, que precisa ter conta na Clarevo com o e-mail confirmado.</p>
<p>Na apresentação, combinamos o escopo, a implantação, a privacidade e as condições comerciais. Ainda não há tabela de preços. Em um piloto, combinamos o número de vagas e o prazo.</p>
${blocoDeContato(valores, ARQUIVO)}
<p class="nota">Não envie dados financeiros nem de pessoas que trabalham na empresa: para convidar, o painel pede só o e-mail de cada pessoa. Dúvidas de quem recebe o convite estão na <a href="${u('ajuda/beneficio.html')}">Ajuda</a>.</p>`,
      { rotulo: 'apresentacao' },
    ),
  ];
  return montarPagina({
    arquivo: ARQUIVO,
    titulo: 'Para empresas',
    descricao: 'Bem-estar financeiro também faz parte do cuidado com sua equipe. A proposta da Clarevo integra o cuidado financeiro ao programa de bem-estar, e a empresa nunca vê as finanças das pessoas.',
    capa,
    corpo: brutas.map((b) => marcadoresEmHtml(b, valores)).join('\n'),
    fonte: brutas.join('\n') + capa,
    valores,
    classeCapa: 'capa-simples',
  });
}

module.exports = { paginaEmpresas };
