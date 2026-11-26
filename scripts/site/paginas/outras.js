'use strict';
/** Sobre, Suporte (a página de contato que as lojas citam), as páginas legais (de `docs/legal`) e a 404. */
const path = require('node:path');
const { PAGINAS_LEGAIS, MAPA_LINKS_SITE, SITE_SRC } = require('../config');
const { esc, emLinha, contexto, markdownParaHtml, separarTitulo, textoPuro } = require('../texto');
const { rel } = require('../util');
const { montarPagina, marcadoresEmHtml, colunaTexto, bloco, listaDeAtalhos } = require('../modelo');
const { TEMAS } = require('./ajuda');
const { lerPerguntas } = require('../conteudo');
const { ligado } = require('../formularios');

/**
 * Sobre (D-125, 25/11/2026): a decisão do Enzo é não mostrar pessoa (nem nome, nem foto). A confiança vem do que a empresa é e faz: por que a
 * Clarevo existe (o texto que estava em "Bem-estar financeiro, com apoio prático", na página inicial, com a voz da empresa), o que guia o
 * produto, como a Clarevo ganha dinheiro (a assinatura e o benefício pago por empresas, e nada de anúncio, venda de dados ou indicação de
 * produto), como pensamos o produto, os dados da empresa e os canais. O prazo de resposta só aparece quando `ESTADO_DO_PRODUTO.prazoDeResposta`
 * (`config.js`) estiver preenchido: nenhum documento da Clarevo tem um prazo combinado (a política diz "Prazo de resposta: [A DEFINIR]").
 * "Sede: [ENDEREÇO]" (e não "com sede em [ENDEREÇO]"): com o endereço publicado, "Rio de Janeiro, RJ", a frase antiga lia "com sede em Rio
 * de Janeiro", e o certo seria "no Rio de Janeiro"; com o rótulo, a frase fica certa com a cidade ou com o endereço completo.
 */
function paginaSobre({ valores, estado = { prazoDeResposta: '' } }) {
  const arquivo = 'sobre.html';
  const u = (d) => rel(arquivo, d);
  const capa = `<p class="assinatura-marca">Cuidar da vida financeira faz parte de cuidar de você.</p>
<h1>Sobre a Clarevo</h1>
<p class="lead">Uma empresa brasileira que faz um app para organizar o dinheiro do mês com clareza, sem julgamento e com respeito aos dados de quem usa.</p>`;
  const prazo = estado.prazoDeResposta ? `<li>Respondemos em ${esc(estado.prazoDeResposta)}.</li>\n` : '';
  const brutas = [
    bloco(
      `<h2 id="por-que">Por que a Clarevo existe</h2>
<div class="duas-colunas">
<p class="lead-bloco">A vida financeira de muita gente é espalhada: vários cartões, as contas da casa, um dinheiro que entra por fora, às vezes um negócio. Contas para lembrar, compras para decidir, planos para organizar: o dinheiro participa da rotina.</p>
<p class="texto-bloco">A Clarevo existe para juntar isso num lugar só, sem misturar o que é de cada um, e para explicar cada número em linguagem simples. O app parte do que você registra e respeita a sua realidade: renda, trabalho, saúde e responsabilidades da família também limitam as escolhas, e dificuldade financeira não é falta de disciplina.</p>
</div>`,
      { rotulo: 'por-que' },
    ),
    bloco(
      `<h2 id="move">O que nos guia</h2>
<div class="grade">
<article class="cartao">
<h3>Clareza</h3>
<p>Cada número do app vem com a explicação de onde sai. O que você recebeu, o que já pagou e o que ainda vai vencer ficam separados, e a diferença do mês nunca é apresentada como saldo.</p>
</article>
<article class="cartao">
<h3>Sem anúncios</h3>
<p>Não há anúncios no app nem neste site, e a Clarevo não ganha nada por mostrar um produto ou uma empresa a você.</p>
</article>
<article class="cartao">
<h3>Sem venda de dados</h3>
<p>Não vendemos nem compartilhamos dados para publicidade. O que você anota é seu, e você exclui a conta quando quiser.</p>
</article>
<article class="cartao">
<h3>Sem recomendar produtos</h3>
<p>Não indicamos banco, cartão, investimento nem crédito. O conteúdo de Aprender é educativo e geral, com fonte e data de revisão.</p>
</article>
</div>`,
      { variante: 'alt', rotulo: 'move' },
    ),
    bloco(
      `<h2 id="como-ganha">Como a Clarevo ganha dinheiro</h2>
<p class="lead-bloco">Com a assinatura de quem usa, nos planos Individual e Família, e com o benefício que empresas oferecem às pessoas da equipe. É só isso.</p>
<ul class="como-funciona lista-marcada">
<li>Nada de anúncio, de venda de dados ou de comissão por indicar banco, cartão, investimento ou crédito.</li>
<li>A empresa que oferece o benefício paga pelas licenças e nunca vê as finanças de ninguém, nem somadas.</li>
<li>Os preços estão na página <a href="${u('planos.html')}">Planos</a>, e as regras da assinatura, nos <a href="${u('termos.html')}">Termos de uso</a>.</li>
</ul>`,
      { rotulo: 'como-ganha' },
    ),
    bloco(
      `<h2 id="como">Como pensamos o produto</h2>
<ul>
<li>Você decide o que entra: o app mostra o que você ou as pessoas da sua Família anotaram, importaram ou mandaram por mensagem. Ele não movimenta dinheiro.</li>
<li>A privacidade vale no banco de dados, e não só na tela: quem pode ver cada dado é decidido a cada leitura.</li>
<li>Uma empresa pode integrar a Clarevo ao programa de bem-estar, como benefício, sem ver as finanças de ninguém. <a href="${u('empresas/index.html')}">Veja como</a>.</li>
<li>Escrevemos de forma simples, com fonte e data, e corrigimos no próprio texto. <a href="${u('novidades/como-escrevemos.html')}">Veja como escrevemos</a>.</li>
</ul>`,
      { variante: 'alt', rotulo: 'como' },
    ),
    bloco(
      `<h2 id="quem">A empresa e os canais</h2>
<p>A Clarevo é a marca de [RAZÃO SOCIAL], CNPJ [CNPJ]. Sede: [ENDEREÇO].</p>
<ul>
<li>Para falar com a equipe, inclusive sobre o benefício para empresas: [E-MAIL DE CONTATO].</li>
<li>Ajuda com o app: [E-MAIL DE SUPORTE], a <a href="${u('ajuda/index.html')}">Ajuda</a> e a página de <a href="${u('suporte.html')}">Suporte</a>.</li>
<li>Dados pessoais: [E-MAIL DE PRIVACIDADE] e a <a href="${u('privacidade.html')}">Política de privacidade</a>.</li>
${prazo}</ul>
<p>Para saber quem vê os seus dados e como protegemos, veja <a href="${u('seguranca.html')}">Segurança e privacidade</a>.</p>`,
      { rotulo: 'quem' },
    ),
  ];
  return montarPagina({
    arquivo,
    titulo: 'Sobre a Clarevo: por que existimos e como a empresa funciona',
    tituloCompleto: true,
    descricao: 'Por que a Clarevo existe, o que guia o produto, como a empresa ganha dinheiro (a assinatura e o benefício pago por empresas) e os dados da empresa.',
    capa,
    corpo: brutas.map((b) => marcadoresEmHtml(b, valores)).join('\n'),
    fonte: brutas.join('\n') + capa,
    valores,
    classeCapa: 'capa-simples',
  });
}

function paginaSuporte({ valores, estado = { prazoDeResposta: '' } }) {
  const arquivo = 'suporte.html';
  const u = (d) => rel(arquivo, d);
  const perguntas = lerPerguntas(path.join(SITE_SRC, 'ajuda', 'perguntas.md'));
  // Desde 23/11/2026, em atalhos (caixa, a pergunta, o tema embaixo e a seta), como em "Perguntas mais comuns" da Ajuda.
  const atalhos = listaDeAtalhos(
    perguntas.map((p) => {
      const tema = TEMAS.find((t) => t.id === p.tema);
      return { href: u(`ajuda/${tema.id}.html#p-${p.id}`), texto: p.pergunta, sub: tema.titulo };
    }),
  );
  const brutas = `<section class="secao" aria-labelledby="contato">
<h2 id="contato">Como falar com o suporte</h2>
<ul>
<li>Suporte do app: [E-MAIL DE SUPORTE]</li>
<li>Dúvidas sobre dados pessoais (acesso, correção e exclusão): [E-MAIL DE PRIVACIDADE]</li>
<li>Responsável pela Clarevo: [RAZÃO SOCIAL], CNPJ [CNPJ]</li>
<li>Sede: [ENDEREÇO]</li>
${estado.prazoDeResposta ? `<li>Prazo de resposta: ${esc(estado.prazoDeResposta)}</li>\n` : ''}</ul>
<p>Para facilitar a resposta, conte o e-mail da sua conta, o aparelho (iPhone, Android ou navegador) e o que aconteceu. Não envie sua senha, número de cartão, dados bancários nem fotos de documentos: o suporte nunca pede essas informações.</p>
<p>Sobre como tratamos os seus dados, leia a <a href="${u('privacidade.html')}">Política de privacidade</a>.</p>
</section>

<section class="secao duvida" aria-labelledby="perguntas">
<h2 id="perguntas">Antes de escrever</h2>
<p>A <a href="${u('ajuda/index.html')}">Ajuda</a> tem respostas por tema, com busca. As perguntas mais comuns do suporte:</p>
${atalhos}
</section>`;
  const capa = `<h1>Suporte</h1>
<p class="lead">Como falar com a equipe da Clarevo e onde achar respostas para as dúvidas mais comuns.</p>`;
  return montarPagina({
    arquivo,
    titulo: 'Suporte',
    descricao: 'Como falar com o suporte da Clarevo e onde achar respostas para as perguntas mais frequentes.',
    capa,
    corpo: colunaTexto(marcadoresEmHtml(brutas, valores), 'texto'),
    fonte: brutas,
    valores,
    classeCapa: 'capa-simples',
  });
}

/**
 * As seções 3.6 (Contato pelo site) e 3.7 (Novidades por e-mail) da política descrevem os formulários, e só podem existir com o interruptor
 * do formulário ligado: com ele desligado a política estaria descrevendo um envio de dados que o site não faz. Desligado, a seção continua
 * no texto (o advogado precisa lê-la) mas sai da página marcada com `[A RETIRAR: ...]`, que o `--final` recusa; ligado e sem a seção, o
 * problema é o contrário (o site recolhe dados sem avisar). Devolve o Markdown com as marcas e a lista de problemas para o `--final`.
 */
const SECOES_DOS_FORMULARIOS = [
  // Pelo título, não pelo número: desde 05/11/2026 (A14), as duas seções ficam fora do texto publicado e os números 3.6 e 3.7 são de outras.
  { interruptor: 'formulario_contato', titulo: /^###\s+3\.\d+\s+Contato pelo site\b.*$/m, nome: '3.6 (Contato pelo site)', formulario: 'o formulário de contato' },
  { interruptor: 'newsletter', titulo: /^###\s+3\.\d+\s+Novidades por e-mail\b.*$/m, nome: '3.7 (Novidades por e-mail)', formulario: 'o cadastro das Novidades por e-mail' },
];

function secoesDosFormularios(md, valores) {
  let saida = md;
  const problemas = [];
  for (const s of SECOES_DOS_FORMULARIOS) {
    const achou = s.titulo.exec(saida);
    const ligada = ligado(valores, s.interruptor);
    if (achou && !ligada) {
      const fim = achou.index + achou[0].length;
      saida = `${saida.slice(0, fim)}\n\n[A RETIRAR: seção ${s.nome} da política, porque ${s.formulario} está desligado (${s.interruptor} em site/dados-da-empresa.json)]${saida.slice(fim)}`;
      problemas.push(`privacidade.html: a seção ${s.nome} da política descreve ${s.formulario}, que está desligado (${s.interruptor}): retire a seção ou ligue o interruptor`);
    } else if (!achou && ligada) {
      problemas.push(`privacidade.html: ${s.formulario} está ligado (${s.interruptor}) e a política não tem a seção ${s.nome}`);
    }
  }
  return { md: saida, problemas };
}

/** Uma página legal a partir do Markdown, ou o espaço reservado (com `[A DEFINIR: ...]`) enquanto o texto não existir. */
function paginaLegal(pagina, md, valores) {
  const avisos = [];
  const problemasFinais = [];
  let fonte = md;
  if (md === null) {
    fonte = `# ${pagina.titulo}\n\nEste texto está em revisão e será publicado nesta página. [A DEFINIR: texto desta página, que vem de docs/legal/${pagina.md}]\n`;
  } else if (pagina.md === 'politica-de-privacidade.md') {
    const conferido = secoesDosFormularios(md, valores);
    fonte = conferido.md;
    problemasFinais.push(...conferido.problemas);
    avisos.push(...conferido.problemas.map((p) => `o --final recusaria: ${p}`));
  }
  const { titulo, corpo } = separarTitulo(fonte);
  if (titulo === null) avisos.push(`docs/legal/${pagina.md}: não tem título "# ..." (usei "${pagina.titulo}")`);
  const h1 = titulo ?? pagina.titulo;
  const capa = `<h1>${emLinha(h1, contexto({ valores }))}</h1>`;
  const html = markdownParaHtml(corpo, { valores, rebaixarH1: true, mapaLinks: MAPA_LINKS_SITE, paginaAtual: pagina.arquivo });
  const pg = montarPagina({
    arquivo: pagina.arquivo,
    titulo: textoPuro(h1),
    descricao: pagina.descricao,
    capa,
    corpo: colunaTexto(html, 'texto'),
    fonte,
    valores,
    classeCapa: 'capa-simples',
  });
  return { ...pg, avisos, problemasFinais };
}

/**
 * Licenças de código aberto (D5 de docs/legal/pendencias-do-lancamento.md): a lista dos pacotes que vão no app, com a versão e a licença
 * de cada um, gerada do package-lock.json por `node scripts/gerar-licencas.js` (site-src/licencas.json). Os termos e o app apontam para ela.
 */
function paginaLicencas({ valores }) {
  const arquivo = 'licencas.html';
  const lista = JSON.parse(require('node:fs').readFileSync(path.join(SITE_SRC, 'licencas.json'), 'utf8'));
  const capa = `<h1>Licenças de código aberto</h1>
<p class="lead">O app da Clarevo é construído com programas de código aberto. Esta é a lista dos pacotes usados para construir e rodar o app, com a versão e a licença de cada um.</p>`;
  const linhas = lista.map((i) => `<tr><td>${esc(i.nome)}</td><td>${esc(i.versao)}</td><td>${esc(i.licenca)}</td></tr>`).join('\n');
  const corpo = bloco(
    `<h2 id="pacotes">Pacotes (${lista.length})</h2>
<p>O texto de cada licença acompanha o pacote, no repositório público dele. Agradecemos a quem mantém cada um desses projetos.</p>
<div class="tabela"><table>
<thead><tr><th scope="col">Pacote</th><th scope="col">Versão</th><th scope="col">Licença</th></tr></thead>
<tbody>
${linhas}
</tbody>
</table></div>`,
    { rotulo: 'pacotes' },
  );
  return montarPagina({
    arquivo,
    titulo: 'Licenças de código aberto',
    descricao: 'Os pacotes de código aberto usados no app da Clarevo, com a versão e a licença de cada um.',
    capa,
    corpo,
    fonte: capa,
    valores,
    classeCapa: 'capa-simples',
  });
}

function pagina404({ valores }) {
  const arquivo = '404.html';
  const u = (d) => rel(arquivo, d);
  const capa = `<h1>Página não encontrada</h1>
<p class="lead">O endereço que você abriu não existe ou mudou de lugar.</p>
<div class="acoes">
<a class="botao botao-principal" href="${u('index.html')}">Ir para o início</a>
<a class="botao botao-suave" href="${u('ajuda/index.html')}">Abrir a Ajuda</a>
</div>`;
  const corpo = bloco(
    // Desde 23/11/2026, os caminhos em pílulas com 44 px de altura (as mesmas dos temas da Ajuda), no lugar da lista sublinhada.
    `<h2 id="talvez">Talvez você procure</h2>
<ul class="nav-temas">
<li><a href="${u('app/index.html')}">O app</a></li>
<li><a href="${u('aprender/index.html')}">Aprender</a></li>
<li><a href="${u('calculadoras/index.html')}">Calculadoras</a></li>
<li><a href="${u('novidades/index.html')}">Novidades</a></li>
<li><a href="${u('suporte.html')}">Suporte</a></li>
</ul>`,
    { rotulo: 'talvez' },
  );
  return montarPagina({ arquivo, titulo: 'Página não encontrada', descricao: 'Esta página não existe no site da Clarevo.', capa, corpo, fonte: capa, valores, classeCapa: 'capa-simples', semIndexar: true });
}

module.exports = { paginaSobre, paginaSuporte, paginaLegal, paginaLicencas, pagina404, secoesDosFormularios, PAGINAS_LEGAIS };
