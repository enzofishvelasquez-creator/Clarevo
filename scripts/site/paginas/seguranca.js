'use strict';
/**
 * Segurança e privacidade: a página de confiança, em linguagem simples, coerente com `docs/legal/politica-de-privacidade.md`
 * (as seções citadas são as da política). O que na política ainda depende da revisão jurídica (`[PROPOSTA]` e `[A DEFINIR]`) não é afirmado
 * aqui: a página manda para a política, que faz o `--final` recusar enquanto sobrar pendência.
 */
const { rel } = require('../util');
const { montarPagina, marcadoresEmHtml, bloco, celular } = require('../modelo');

const ARQUIVO = 'seguranca.html';

function paginaSeguranca({ valores, img }) {
  const u = (d) => rel(ARQUIVO, d);
  const capa = `<h1>Segurança e privacidade</h1>
<p class="lead">O que a Clarevo guarda, o que não guarda e quem vê o quê, em linguagem simples. O texto completo e com valor de regra é a <a href="${u('privacidade.html')}">Política de privacidade</a>.</p>`;

  const brutas = [
    bloco(
      `<h2 id="essencial">O essencial</h2>
<ul class="nao-e">
<li>Guardamos só o que você, ou as pessoas da sua Família, anotam ou escolhem importar.</li>
<li>A Clarevo não se conecta ao seu banco e não pede senha bancária.</li>
<li>Não guardamos número completo de cartão, código de segurança, validade, CPF de nota fiscal nem imagens de notas ou comprovantes.</li>
<li>Se a sua empresa oferecer a Clarevo como benefício, ela nunca vê as suas finanças, nem somadas às de outras pessoas.</li>
<li>Sem anúncios, sem venda de dados e sem rastreamento para publicidade.</li>
<li>Você pode excluir a sua conta dentro do app.</li>
</ul>`,
      { rotulo: 'essencial' },
    ),
    bloco(
      `<h2 id="guardamos">O que guardamos</h2>
<p class="lead-bloco">Tudo o que está na lista é digitado, importado ou confirmado por você ou pelas pessoas da sua Família. A Clarevo não busca esses dados em bancos.</p>
<div class="grade">
<article class="cartao">
<h3>Cadastro e login</h3>
<p>E-mail (que precisa ser confirmado), senha (tratada pelo serviço de autenticação), nome de apresentação, fuso horário e idioma.</p>
</article>
<article class="cartao">
<h3>O que você anota</h3>
<p>Gastos, recebimentos, contas a pagar, gastos fixos, parcelamentos, contas do ano, metas, cartões e o resto do que você registra. Em cartões, só o apelido e, se você quiser, os 4 últimos dígitos.</p>
</article>
<article class="cartao">
<h3>Resumos matemáticos</h3>
<p>Da chave da nota fiscal e de cada linha de extrato ou fatura importada, guardamos só um resumo (SHA-256), que serve para avisar quando a mesma nota ou linha aparece de novo. Do código de um convite também.</p>
</article>
<article class="cartao">
<h3>Família e benefício</h3>
<p>O nome da Família, o seu papel e o que cada pessoa anota nela. No benefício pela empresa, o e-mail que a empresa informou no convite, a situação da licença e as datas.</p>
</article>
<article class="cartao">
<h3>Dados técnicos</h3>
<p>O rastro técnico das operações, para evitar gravar duas vezes a mesma operação e para investigar problemas de segurança. Quando você exclui a conta, o rastro técnico dela é apagado junto.</p>
</article>
</div>`,
      { variante: 'alt', rotulo: 'guardamos' },
    ),
    bloco(
      `<h2 id="nao-guardamos">O que não guardamos</h2>
<div class="ve-nao-ve">
<div class="cartao nunca-ve">
<h3>Nunca fica guardado</h3>
<ul>
<li>número completo de cartão, código de segurança (CVV) e validade;</li>
<li>senha ou qualquer dado de acesso a banco;</li>
<li>CPF da nota fiscal: ele é descartado na leitura, e da chave da nota fica só o resumo;</li>
<li>dados do comprovante de Pix ou de pagamento, como CPF, CNPJ, chave Pix, banco, agência, conta, identificador da transação, código de autenticação e número de cartão;</li>
<li>o saldo de cada conta.</li>
</ul>
</div>
<div class="cartao nunca-ve">
<h3>Não chega à Clarevo</h3>
<ul>
<li>fotos e imagens da câmera: ela só lê o código da nota;</li>
<li>os arquivos que você escolhe ler: PDF de nota, PDF de comprovante, extrato e fatura;</li>
<li>o código de um boleto: se você colar um, o app avisa e não o guarda;</li>
<li>biometria, localização, contatos, fotos da galeria, microfone e identificador de publicidade.</li>
</ul>
</div>
</div>
<p class="nota">A leitura de nota, de comprovante e de extrato acontece no seu aparelho: a Clarevo não tem servidor que receba esses arquivos. O app só preenche o formulário, e nada é gravado sem você tocar em "Salvar".</p>
<p class="nota">No Android, a leitura do QR Code usa um componente do Google (ML Kit) incluído no app. A imagem é lida no aparelho, mas o componente pode enviar ao Google dados técnicos de uso e do aparelho. Os detalhes estão nas seções 5 e 8 da <a href="${u('privacidade.html')}">Política de privacidade</a>.</p>`,
      { rotulo: 'nao-guardamos' },
    ),
    bloco(
      `<h2 id="quem-ve">Quem vê os seus dados</h2>
<div class="grade">
<article class="cartao">
<h3>Você</h3>
<p>Entre as pessoas que usam o app, só você vê, anota, edita e exclui o que está no seu Pessoal. A tela "Quem vê estes dados?" mostra quem tem acesso em cada contexto.</p>
${celular(img['quem-ve'], ARQUIVO)}
</article>
<article class="cartao">
<h3>As pessoas da sua Família</h3>
<p>Na Família, cada pessoa vê o que o papel permite, e vê o primeiro nome de quem anotou, nunca o e-mail nem o nome inteiro. Entrar numa Família não mostra nem copia o seu Pessoal.</p>
</article>
<article class="cartao">
<h3>A sua empresa</h3>
<p>Se ela oferecer o benefício, vê só os e-mails que convidou, a situação de cada licença, as datas e as contagens. Nunca vê valores, categorias, metas, contas, cartões, a Família de ninguém, nem números somados, e também não vê quando você abre o app nem o que você anota. <a href="${u('empresas/index.html')}">Veja Para empresas</a>.</p>
</article>
<article class="cartao">
<h3>A equipe da Clarevo</h3>
<p>A Clarevo não consulta o conteúdo financeiro de ninguém no dia a dia. Tecnicamente, pessoas da equipe com acesso ao banco de dados conseguem chegar aos dados guardados. As regras sobre isso estão na seção "Quem vê os seus dados" da <a href="${u('privacidade.html')}">Política de privacidade</a>.</p>
</article>
</div>
<p class="nota">A Clarevo não vende dados e não compartilha dados para publicidade.</p>`,
      { variante: 'alt', rotulo: 'quem-ve' },
    ),
    bloco(
      `<h2 id="protecao">Como protegemos</h2>
<ul>
<li>Quem pode ver ou gravar cada dado é decidido no banco de dados, a cada leitura e a cada gravação, e não só escondido na tela.</li>
<li>Os registros só são gravados por funções do banco que conferem permissão, autoria e repetição de pedidos.</li>
<li>A senha precisa ter pelo menos 8 caracteres, com letras e números, o e-mail precisa ser confirmado e você pode encerrar a sessão em todos os aparelhos.</li>
<li>Toda a comunicação com o servidor usa conexão protegida (HTTPS).</li>
<li>Você pode pedir biometria para abrir o app e ocultar valores na tela. Esses dois recursos protegem a tela do aparelho; quem pode ver os dados é decidido pelo servidor.</li>
<li>Códigos de convite e chaves de nota são guardados só como resumo matemático.</li>
</ul>
<p class="nota">Nenhum sistema é totalmente seguro. Se houver um incidente de segurança que possa trazer risco ou dano relevante, comunicaremos a Autoridade Nacional de Proteção de Dados e as pessoas afetadas, dizendo o que aconteceu, quais dados foram atingidos e o que você pode fazer.</p>`,
      { rotulo: 'protecao' },
    ),
    bloco(
      `<h2 id="este-site">Este site</h2>
<p>O site não usa cookies próprios, não tem análise de acesso, não tem anúncios e não carrega fontes, imagens, scripts nem estilos de outros endereços. Os links para fontes oficiais em Aprender são só links de texto. A busca da Ajuda roda no seu navegador e não envia o que você digita. Como em qualquer site, a hospedagem recebe o endereço da página que você abre e o seu IP. Os detalhes estão na <a href="${u('privacidade.html')}">Política de privacidade</a>.</p>`,
      { variante: 'azul', rotulo: 'este-site' },
    ),
    bloco(
      `<h2 id="excluir">Excluir a conta</h2>
<p>No app, abra Conta e, no último item, toque em "Excluir minha conta". Você digita EXCLUIR e o seu Pessoal é apagado de verdade, na hora. O que você anotou numa Família de outras pessoas continua como histórico da casa, com a autoria "Pessoa que saiu", sem o seu nome e sem e-mail. Se você tem uma licença de empresa, ela termina na hora. Quem não consegue entrar no app pede pela página <a href="${u('excluir-conta.html')}">Excluir conta</a>.</p>
<p>Leia também a <a href="${u('privacidade.html')}">Política de privacidade</a>, os <a href="${u('termos.html')}">Termos de uso</a> e as respostas da <a href="${u('ajuda/privacidade.html')}">Ajuda sobre privacidade e segurança</a>. Dúvidas sobre os seus dados: [E-MAIL DE PRIVACIDADE].</p>`,
      { variante: 'alt', rotulo: 'excluir' },
    ),
  ];
  return montarPagina({
    arquivo: ARQUIVO,
    titulo: 'Segurança e privacidade',
    descricao: 'O que a Clarevo guarda e não guarda, quem vê os seus dados, como protegemos e como excluir a conta, em linguagem simples.',
    capa,
    corpo: brutas.map((b) => marcadoresEmHtml(b, valores)).join('\n'),
    fonte: brutas.join('\n') + capa,
    valores,
    classeCapa: 'capa-simples',
  });
}

module.exports = { paginaSeguranca };
