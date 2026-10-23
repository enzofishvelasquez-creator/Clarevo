'use strict';
/**
 * Os dois formulários do site (D-066), prontos e desligados: contato para empresas (em "Para empresas") e Novidades por e-mail (em
 * Novidades e em `novidades/receber.html`). Só aparecem com `"formulario_contato": true` e `"newsletter": true` em
 * `site/dados-da-empresa.json`; desligados, o site fica como era (o e-mail de contato aparece, e as páginas de resposta nem existem).
 *
 * Sem JavaScript, o envio é um POST comum para `/api/contato` e `/api/newsletter`, que o `_worker.js` recebe (`site-src/worker/worker.js`).
 * Campo-isca escondido contra robôs, `maxlength` igual ao do worker, validação do navegador (`required`, `type="email"`) e a do worker.
 * Cada formulário traz ao lado um texto curto de privacidade com o link para a política.
 */
const { esc } = require('../texto');
const { rel } = require('../util');
const { montarPagina, marcadoresEmHtml, bloco, colunaTexto } = require('../modelo');
const { TAMANHOS, FAIXAS, ISCA, CAMPOS, ligado } = require('../formularios');

const ARQUIVOS = {
  contatoEnviado: 'contato-enviado.html',
  contatoErro: 'contato-erro.html',
  receber: 'novidades/receber.html',
  receberEnviado: 'novidades/receber-enviado.html',
  receberConfirmado: 'novidades/receber-confirmado.html',
  receberErro: 'novidades/receber-erro.html',
};

/** O que dizer de cada campo na página de erro dele: o nome na tela e o que costuma estar errado (os limites são os do worker e do `maxlength`). */
const mil = (n) => n.toLocaleString('pt-BR');
const ERROS_DO_CONTATO = {
  nome: { rotulo: 'Nome', frase: `O campo "Nome" está vazio ou passa de ${TAMANHOS.nome} caracteres.` },
  email: { rotulo: 'E-mail', frase: `O campo "E-mail" está vazio, passa de ${TAMANHOS.email} caracteres ou não parece um e-mail (como nome@exemplo.com.br).` },
  empresa: { rotulo: 'Empresa', frase: `O campo "Empresa" está vazio ou passa de ${TAMANHOS.empresa} caracteres.` },
  faixa: { rotulo: 'Número aproximado de pessoas', frase: 'Nenhuma faixa de "Número aproximado de pessoas" foi escolhida, ou a escolhida não está na lista.' },
  mensagem: { rotulo: 'Mensagem', frase: `O campo "Mensagem" está vazio ou passa de ${mil(TAMANHOS.mensagem)} caracteres.` },
};
const ERROS_DA_NEWSLETTER = {
  email: { rotulo: 'E-mail', frase: `O campo "E-mail" está vazio, passa de ${TAMANHOS.email} caracteres ou não parece um e-mail (como nome@exemplo.com.br).` },
  consentimento: { rotulo: 'Consentimento', frase: 'A caixa de consentimento não foi marcada. Sem ela, nada é cadastrado.' },
};

/** O arquivo da página de erro de um campo: `contato-erro-email.html`, `novidades/receber-erro-consentimento.html`. O worker manda para ele. */
const arquivoDoErro = (base, campo) => base.replace(/\.html$/, `-${campo}.html`);

/** O campo-isca: escondido por CSS (não por atributo de estilo), fora da ordem do teclado e do leitor de tela. */
const isca = (prefixo) => `<div class="campo-isca" aria-hidden="true"><label for="${prefixo}-${ISCA}">Não preencha este campo</label><input id="${prefixo}-${ISCA}" name="${ISCA}" type="text" tabindex="-1" autocomplete="off"></div>`;

/** O formulário de contato (só o `<form>` e o texto de privacidade), para a página `arquivo`. */
function formularioDeContato(arquivo) {
  const p = 'ct';
  return `<div class="formulario-grade">
<form class="formulario" method="post" action="/api/contato">
<div class="campo"><label for="${p}-nome">Nome</label><input id="${p}-nome" name="nome" type="text" maxlength="${TAMANHOS.nome}" required autocomplete="name"></div>
<div class="campo"><label for="${p}-email">E-mail</label><input id="${p}-email" name="email" type="email" maxlength="${TAMANHOS.email}" required autocomplete="email"></div>
<div class="campo"><label for="${p}-empresa">Empresa</label><input id="${p}-empresa" name="empresa" type="text" maxlength="${TAMANHOS.empresa}" required autocomplete="organization"></div>
<div class="campo"><label for="${p}-faixa">Número aproximado de pessoas que poderiam receber o benefício</label><select id="${p}-faixa" name="faixa" required><option value="">Escolha uma faixa</option>${FAIXAS.map((f) => `<option value="${f.valor}">${esc(f.rotulo)}</option>`).join('')}</select></div>
<div class="campo"><label for="${p}-mensagem">Mensagem</label><p class="dica" id="${p}-mensagem-dica">Até ${TAMANHOS.mensagem.toLocaleString('pt-BR')} caracteres. Não envie dados financeiros nem de pessoas que trabalham na empresa.</p><textarea id="${p}-mensagem" name="mensagem" rows="6" maxlength="${TAMANHOS.mensagem}" required aria-describedby="${p}-mensagem-dica"></textarea></div>
${isca(p)}
<div><button class="botao botao-principal" type="submit">Enviar mensagem</button></div>
</form>
<aside class="privacidade-curta" aria-labelledby="priv-contato">
<h3 id="priv-contato">O que acontece com a sua mensagem</h3>
<ul>
<li>Usamos o que você escreve só para responder sobre o Clarevo para empresas.</li>
<li>O site não guarda a mensagem. Ela segue por e-mail para a equipe, por um serviço de envio de e-mail (Resend), e fica na caixa de e-mail do Clarevo. O Resend também guarda uma cópia nos registros dele, por [A DEFINIR: prazo de guarda no Resend]. O pedido passa pela Cloudflare, que hospeda o site.</li>
<li>Os detalhes, inclusive por quanto tempo a mensagem fica na caixa de e-mail, estão na <a href="${rel(arquivo, 'privacidade.html')}">Política de privacidade</a>, na seção sobre o contato pelo site.</li>
</ul>
</aside>
</div>`;
}

/** O formulário das Novidades: e-mail, caixa de consentimento obrigatória e desmarcada e a explicação da confirmação por e-mail. */
function formularioDaNewsletter(arquivo) {
  const p = 'nv';
  return `<div class="formulario-grade">
<form class="formulario" method="post" action="/api/newsletter">
<div class="campo"><label for="${p}-email">E-mail</label><input id="${p}-email" name="email" type="email" maxlength="${TAMANHOS.email}" required autocomplete="email"></div>
<div class="consentimento"><input id="${p}-consentimento" name="consentimento" type="checkbox" value="sim" required><label for="${p}-consentimento">Quero receber as Novidades do Clarevo por e-mail. Posso cancelar quando quiser.</label></div>
${isca(p)}
<div><button class="botao botao-principal" type="submit">Quero receber as Novidades</button></div>
</form>
<aside class="privacidade-curta" aria-labelledby="priv-novidades">
<h3 id="priv-novidades">Em resumo</h3>
<ul>
<li><strong>Confirmação por e-mail.</strong> Depois de enviar, você recebe uma mensagem pedindo para confirmar o cadastro. Só começa a receber as Novidades depois de clicar no link dela.</li>
<li><strong>Cancelar.</strong> Todo e-mail das Novidades traz um link para cancelar quando você quiser.</li>
<li><strong>Seu e-mail.</strong> Usamos só para enviar as Novidades. Ele fica no serviço de envio (Brevo), e não no site. Os detalhes estão na <a href="${rel(arquivo, 'privacidade.html')}">Política de privacidade</a>, na seção sobre as Novidades por e-mail.</li>
</ul>
</aside>
</div>`;
}

/** O bloco do formulário de contato em "Para empresas", ou nada com o contato desligado. */
function blocoDeContato(valores, arquivo) {
  if (!ligado(valores, 'formulario_contato')) return '';
  return `<h3 id="formulario-contato">Mande uma mensagem</h3>
<p>Preencha os campos abaixo. Se preferir, escreva para [E-MAIL DE CONTATO].</p>
${formularioDeContato(arquivo)}`;
}

/** O bloco "Receber por e-mail" de Novidades, ou nada com a newsletter desligada. */
function blocoDaNewsletterEmNovidades(valores, arquivo) {
  if (!ligado(valores, 'newsletter')) return '';
  return bloco(
    `<h2 id="receber">Receber as Novidades por e-mail</h2>
<p class="lead-bloco">O mesmo conteúdo desta página, na sua caixa de entrada, só se você pedir. A inscrição tem confirmação por e-mail.</p>
${formularioDaNewsletter(arquivo)}
<p class="nota"><a href="${rel(arquivo, ARQUIVOS.receber)}">Como funciona a inscrição</a></p>`,
    { variante: 'alt', rotulo: 'receber' },
  );
}

/** Uma página de resposta: um título, um texto e links. Não é indexada. */
function paginaDeResposta({ arquivo, titulo, lead, corpoHtml, descricao, valores }) {
  const capa = `<h1>${esc(titulo)}</h1>
<p class="lead">${esc(lead)}</p>`;
  const corpo = colunaTexto(marcadoresEmHtml(corpoHtml, valores), 'texto');
  const pg = montarPagina({ arquivo, titulo, descricao, capa, corpo, fonte: corpoHtml + capa, valores, classeCapa: 'capa-simples', semIndexar: true });
  return { arquivo, ...pg };
}

/**
 * A página de erro de um campo, para quando o servidor recusa o envio por causa dele (o navegador já confere, mas quem está sem
 * JavaScript ou com o navegador desatento chega aqui). É uma página só para cada campo, sem parâmetro e sem repetir nada do que a pessoa
 * escreveu: o worker manda para `<erro>-<campo>`. `erros` diz o texto de cada campo; falta de texto para um campo de `CAMPOS` é erro do gerador.
 */
function paginaDeErroDeCampo({ base, campo, erros, voltar, rotuloVoltar, alternativa, valores }) {
  const e = erros[campo];
  if (!e) throw new Error(`falta o texto da página de erro do campo "${campo}" (${base})`);
  const arquivo = arquivoDoErro(base, campo);
  return paginaDeResposta({
    arquivo,
    titulo: `Confira o campo ${e.rotulo}`,
    lead: `${e.frase} Nada foi guardado, e você pode tentar de novo.`,
    corpoHtml: `<p><a href="${rel(arquivo, voltar)}">${esc(rotuloVoltar)}</a> ${esc(alternativa)}.</p>`,
    descricao: `O envio não foi feito: confira o campo ${e.rotulo}.`,
    valores,
  });
}

/** As páginas dos formulários, só para o que está ligado. */
function paginasDosFormularios({ valores }) {
  const paginas = [];
  if (ligado(valores, 'formulario_contato')) {
    const u = (a, d) => rel(a, d);
    paginas.push(
      paginaDeResposta({
        arquivo: ARQUIVOS.contatoEnviado,
        titulo: 'Mensagem enviada',
        lead: 'A sua mensagem foi enviada para a equipe do Clarevo, que responde pelo e-mail que você informou.',
        corpoHtml: `<p>O site não guarda a mensagem: ela seguiu por e-mail para a equipe. Se quiser complementar, escreva para [E-MAIL DE CONTATO].</p>
<p><a href="${u(ARQUIVOS.contatoEnviado, 'empresas/index.html')}">Voltar para Para empresas</a> · <a href="${u(ARQUIVOS.contatoEnviado, 'index.html')}">Ir para o início</a></p>`,
        descricao: 'A sua mensagem para a equipe do Clarevo foi enviada.',
        valores,
      }),
      paginaDeResposta({
        arquivo: ARQUIVOS.contatoErro,
        titulo: 'Não foi possível enviar',
        lead: 'A sua mensagem não saiu. Nada foi guardado, e você pode tentar de novo.',
        corpoHtml: `<p>Um campo pode estar vazio, grande demais ou fora do formato, ou o envio pode estar fora do ar por um momento. Confira o formulário e envie de novo, ou escreva direto para [E-MAIL DE CONTATO].</p>
<p><a href="${u(ARQUIVOS.contatoErro, 'empresas/index.html#formulario-contato')}">Voltar para o formulário</a></p>`,
        descricao: 'Não foi possível enviar a mensagem pelo formulário de contato do Clarevo.',
        valores,
      }),
      ...CAMPOS.contato.map((campo) => paginaDeErroDeCampo({ base: ARQUIVOS.contatoErro, campo, erros: ERROS_DO_CONTATO, voltar: 'empresas/index.html#formulario-contato', rotuloVoltar: 'Voltar para o formulário', alternativa: 'ou escreva direto para [E-MAIL DE CONTATO]', valores })),
    );
  }
  if (ligado(valores, 'newsletter')) {
    const u = (a, d) => rel(a, d);
    const a = ARQUIVOS.receber;
    const capa = `<p class="migalha"><a href="${u(a, 'novidades/index.html')}">Novidades</a></p>
<h1>Receber as Novidades por e-mail</h1>
<p class="lead">Os textos de Novidades do Clarevo, com data e fonte, na sua caixa de entrada. Só se você pedir, e com confirmação por e-mail.</p>`;
    const corpo = bloco(
      `<h2 id="inscricao">Inscrição</h2>
${formularioDaNewsletter(a)}`,
      { rotulo: 'inscricao' },
    ) +
      '\n' +
      bloco(
        `<h2 id="como-funciona">Como funciona a confirmação</h2>
<ol class="passos">
<li><h3>Você se inscreve</h3><p>Informe o e-mail e marque a caixa de consentimento. Sem a caixa marcada, nada é cadastrado.</p></li>
<li><h3>Você confirma</h3><p>Enviamos uma mensagem pedindo para confirmar o cadastro. Só entra na lista quem clica no link dela (dupla confirmação).</p></li>
<li><h3>Você recebe</h3><p>As Novidades chegam por e-mail, com o mesmo texto do site. Sem anúncios e sem recomendar produtos financeiros.</p></li>
<li><h3>Você cancela quando quiser</h3><p>Todo e-mail traz um link para cancelar. O cancelamento é feito pelo serviço de envio.</p></li>
</ol>
<p class="nota">Prefere não dar o e-mail? As <a href="${u(a, 'novidades/index.html')}">Novidades</a> ficam todas no site.</p>`,
        { variante: 'alt', rotulo: 'como-funciona' },
      );
    paginas.push({
      arquivo: a,
      ...montarPagina({
        arquivo: a,
        titulo: 'Receber as Novidades por e-mail',
        descricao: 'Receba as Novidades do Clarevo por e-mail, só se você quiser: confirmação por e-mail e cancelamento a qualquer momento.',
        capa,
        corpo,
        fonte: capa + corpo,
        valores,
        classeCapa: 'capa-simples',
      }),
    });
    paginas.push(
      paginaDeResposta({
        arquivo: ARQUIVOS.receberEnviado,
        titulo: 'Falta só confirmar',
        lead: 'Enviamos um e-mail para confirmar o seu cadastro. Abra a mensagem e clique no link.',
        corpoHtml: `<p>Até você confirmar, não enviamos as Novidades. Se a mensagem não chegar em alguns minutos, olhe a caixa de spam.</p>
<p><a href="${u(ARQUIVOS.receberEnviado, 'novidades/index.html')}">Voltar para Novidades</a></p>`,
        descricao: 'Falta confirmar o cadastro nas Novidades do Clarevo pelo e-mail que enviamos.',
        valores,
      }),
      paginaDeResposta({
        arquivo: ARQUIVOS.receberConfirmado,
        titulo: 'Cadastro confirmado',
        lead: 'Você vai receber as Novidades do Clarevo por e-mail.',
        corpoHtml: `<p>Para cancelar, use o link de cancelamento que vem em cada e-mail.</p>
<p><a href="${u(ARQUIVOS.receberConfirmado, 'novidades/index.html')}">Ver as Novidades no site</a></p>`,
        descricao: 'O seu cadastro nas Novidades do Clarevo foi confirmado.',
        valores,
      }),
      paginaDeResposta({
        arquivo: ARQUIVOS.receberErro,
        titulo: 'Não foi possível cadastrar',
        lead: 'O cadastro não foi feito. Nada foi guardado, e você pode tentar de novo.',
        corpoHtml: `<p>Confira se o e-mail está certo e se a caixa de consentimento está marcada. O envio também pode estar fora do ar por um momento.</p>
<p><a href="${u(ARQUIVOS.receberErro, ARQUIVOS.receber)}">Voltar para a inscrição</a></p>`,
        descricao: 'Não foi possível cadastrar o e-mail nas Novidades do Clarevo.',
        valores,
      }),
      ...CAMPOS.newsletter.map((campo) => paginaDeErroDeCampo({ base: ARQUIVOS.receberErro, campo, erros: ERROS_DA_NEWSLETTER, voltar: ARQUIVOS.receber, rotuloVoltar: 'Voltar para a inscrição', alternativa: 'ou leia as Novidades direto no site, sem se cadastrar', valores })),
    );
  }
  return paginas;
}

module.exports = { paginasDosFormularios, blocoDeContato, blocoDaNewsletterEmNovidades, formularioDeContato, formularioDaNewsletter, arquivoDoErro, ARQUIVOS };
