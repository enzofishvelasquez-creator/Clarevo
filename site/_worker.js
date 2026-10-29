// _worker.js do site da Clarevo (D-066), para o Cloudflare Pages em modo avançado. Gerado por scripts/gerar-site.js a partir de
// site-src/worker/worker.js: não edite o arquivo gerado.
//
// Só existe no projeto `clarevo-site` (a pasta `site/` é só dele). O app tem outro projeto e não é afetado.
// Duas rotas recebem formulários e NÃO gravam nada (sem KV, D1, R2 nem log): cada envio vira uma chamada a um serviço de e-mail e acabou.
//   POST /api/contato     envia a mensagem do formulário de "Para empresas" ao e-mail de contato, pelo Resend.
//   POST /api/newsletter  cadastra o e-mail, com consentimento, no Brevo, pela API de dupla confirmação.
// Qualquer outra rota cai nos arquivos estáticos (env.ASSETS.fetch).
//
// Uma rota só existe se o interruptor dela estiver ligado em site/dados-da-empresa.json NA GERAÇÃO (`ROTAS`, abaixo): desligada, responde
// 404 mesmo com todas as variáveis configuradas. Ligada, ainda confere, nesta ordem: o endereço (SITE_HOST), o método, a origem do pedido
// e as variáveis do serviço.
//
// Variáveis (painel da Cloudflare, nunca no repositório): SITE_HOST (o endereço do site, sem https://, como clarevo.com.br; qualquer outro
// endereço, como o clarevo-site.pages.dev, é recusado), RESEND_API_KEY (segredo), CONTATO_DESTINO, CONTATO_REMETENTE, BREVO_API_KEY
// (segredo), BREVO_LISTA_ID, BREVO_MODELO_CONFIRMACAO_ID e, opcional, BREVO_URL_RETORNO.
// Sem SITE_HOST ou sem as variáveis de uma rota, ela responde 503 com mensagem clara: o formulário continua "pronto e desligado".

// Tamanhos, faixas e nome do campo-isca: os mesmos que o gerador usa para desenhar os formulários.
const LIMITES = {"tamanhos":{"nome":100,"email":254,"empresa":120,"mensagem":2000},"faixas":{"ate-50":"Até 50 pessoas","51-200":"De 51 a 200 pessoas","201-1000":"De 201 a 1.000 pessoas","mais-de-1000":"Mais de 1.000 pessoas","nao-sei":"Ainda não sei"},"isca":"website","campos":{"contato":["nome","email","empresa","faixa","mensagem"],"newsletter":["email","consentimento"]}};
// Os cabeçalhos de segurança do _headers, para as respostas que o worker devolve (o _headers não vale para elas).
const CABECALHOS = {"Content-Security-Policy":"default-src 'none'; img-src 'self'; style-src 'self'; font-src 'self'; script-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'","X-Content-Type-Options":"nosniff","X-Frame-Options":"DENY","Referrer-Policy":"same-origin","Permissions-Policy":"camera=(), microphone=(), geolocation=()","Strict-Transport-Security":"max-age=31536000"};
// Quais rotas existem: os interruptores `formulario_contato` e `newsletter` de site/dados-da-empresa.json, lidos pelo gerador.
const ROTAS = {"contato":false,"newsletter":false};

const LIMITE_DO_CORPO = 20 * 1024;
/** Os serviços de e-mail pedem que quem chama diga quem é (o Resend recusa o pedido sem `User-Agent`). */
const AGENTE = 'clarevo-site';
const EMAIL = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]{2,}$/;

/** Cabeçalhos de toda resposta do worker: os de segurança do site, sem cache e sem adivinhar tipo. */
const cabecalhosDaApi = (extra = {}) => ({ ...CABECALHOS, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extra });

const MENSAGENS = {
  metodo: 'Use o formulário da página para enviar.',
  origem: 'O envio só vale a partir das páginas deste site.',
  host: 'Este endereço não recebe envios. Use o endereço oficial do site.',
  desligado: 'Esta rota não existe.',
  indisponivel: 'O envio ainda não está ligado neste site. Use o e-mail de contato da página.',
  grande: 'O envio é grande demais.',
  dados: 'Confira os campos: algum está vazio, grande demais ou fora do formato.',
  consentimento: 'Marque a caixa de consentimento para receber as Novidades.',
  falha: 'Não foi possível enviar agora. Tente de novo mais tarde ou use o e-mail de contato da página.',
  ok: 'Enviado.',
};
const STATUS = { metodo: 405, origem: 403, host: 404, desligado: 404, indisponivel: 503, grande: 413, dados: 400, consentimento: 400, falha: 502, ok: 200 };

/** O navegador pede HTML num envio comum de formulário: ele ganha um redirecionamento para a página de resposta. */
const pedeHtml = (request) => {
  const aceita = request.headers.get('accept') || '';
  return aceita.includes('text/html') && !aceita.includes('application/json');
};

/**
 * `codigo`: uma chave de MENSAGENS. `destinos`: para onde o navegador vai no sucesso (`ok`) e na falha (`erro`), e os campos do formulário
 * (`campos`). Quando `extra.campos` diz qual campo falhou, o navegador vai para a página de erro daquele campo (`erro-<campo>`, que o
 * gerador cria para cada campo): é como a página diz o que conferir sem JavaScript e sem repetir na página nada do que a pessoa escreveu.
 */
function responder(request, codigo, destinos, extra = {}) {
  const ok = codigo === 'ok';
  if (pedeHtml(request) && codigo !== 'metodo') {
    const campo = Array.isArray(extra.campos) ? extra.campos[0] : undefined;
    const erro = typeof campo === 'string' && destinos.campos.includes(campo) ? `${destinos.erro}-${campo}` : destinos.erro;
    return new Response(null, { status: 303, headers: cabecalhosDaApi({ Location: ok ? destinos.ok : erro }) });
  }
  return new Response(JSON.stringify({ ok, erro: ok ? null : codigo, mensagem: MENSAGENS[codigo], ...extra }), {
    status: STATUS[codigo],
    headers: cabecalhosDaApi({ 'Content-Type': 'application/json; charset=utf-8', ...(codigo === 'metodo' ? { Allow: 'POST' } : {}) }),
  });
}

/** A rota desligada se comporta como uma rota que não existe: 404, sem redirecionar (as páginas de resposta também não existem). */
const naoExiste = () =>
  new Response(JSON.stringify({ ok: false, erro: 'desligado', mensagem: MENSAGENS.desligado }), {
    status: 404,
    headers: cabecalhosDaApi({ 'Content-Type': 'application/json; charset=utf-8' }),
  });

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** Texto de uma linha: sem quebra de linha nem caractere de controle, sem espaço sobrando. */
const umaLinha = (s) => String(s ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
/** Texto de várias linhas: mantém as quebras, tira o resto dos caracteres de controle. */
const variasLinhas = (s) =>
  String(s ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

/**
 * Lê o corpo em partes, parando no teto: o `Content-Length` pode faltar (envio em pedaços) ou mentir, então o que vale é quanto chegou de
 * verdade. Acima do teto o resto nem é lido. Devolve o texto, `{ grande: true }` ou `null` se o corpo for ilegível.
 */
async function lerComTeto(request) {
  if (!request.body) return '';
  const leitor = request.body.getReader();
  const partes = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await leitor.read();
      if (done) break;
      total += value.byteLength;
      if (total > LIMITE_DO_CORPO) {
        leitor.cancel().catch(() => {});
        return { grande: true };
      }
      partes.push(value);
    }
  } catch {
    return null;
  }
  const bytes = new Uint8Array(total);
  let posicao = 0;
  for (const parte of partes) {
    bytes.set(parte, posicao);
    posicao += parte.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

/** Lê o corpo (formulário comum ou JSON) com limite de tamanho. Devolve `null` se for ilegível e `{ grande: true }` se passar do teto. */
async function lerCorpo(request) {
  const declarado = Number(request.headers.get('content-length') || 0);
  if (declarado > LIMITE_DO_CORPO) return { grande: true };
  const tipo = request.headers.get('content-type') || '';
  const bruto = await lerComTeto(request);
  if (bruto === null) return null;
  if (typeof bruto === 'object') return bruto;
  try {
    if (tipo.includes('application/json')) {
      const json = JSON.parse(bruto);
      return json && typeof json === 'object' && !Array.isArray(json) ? { campos: json } : null;
    }
    return { campos: Object.fromEntries(new URLSearchParams(bruto)) };
  } catch {
    return null;
  }
}

/**
 * Só o próprio site pode enviar. Os dois sinais que o navegador manda sozinho e que uma página de outro site não consegue trocar:
 * `Sec-Fetch-Site` (quando vem, tem de ser `same-origin`) e `Origin` (quando vem, tem de ser o endereço deste site, e `null`, que é
 * o que sai de uma página sem origem, como um `iframe` com `sandbox` ou um `data:`, não vale). O site pede `Referrer-Policy: same-origin`
 * justamente para o navegador mandar o `Origin` de verdade nos formulários: com `no-referrer` ele mandaria `null`. Sem nenhum dos dois
 * cabeçalhos (cliente que não é navegador), o pedido passa: quem não é navegador não é alvo de um ataque feito por outra página.
 */
function origemValida(request, url) {
  const site = request.headers.get('sec-fetch-site');
  if (site !== null && site !== 'same-origin') return false;
  const origem = request.headers.get('origin');
  return origem === null || origem === url.origin;
}

/** O endereço do site que o painel configurou (`SITE_HOST`), sem esquema nem barra no fim, em minúsculas. Vazio se não houver. */
const enderecoDoSite = (env) => umaLinha(env.SITE_HOST).toLowerCase().replace(/^https?:\/\//, '').replace(/\/+$/, '');

/**
 * Confere, nesta ordem, se a rota está ligada, se o endereço é o do site (assim `clarevo-site.pages.dev/api/*` não serve de atalho),
 * o método e a origem. Devolve `{ resposta }` quando o envio já deve ser recusado.
 */
function prepararEnvio(rota, request, env, url, destinos) {
  if (ROTAS[rota] !== true) return { resposta: naoExiste() };
  const site = enderecoDoSite(env);
  if (site === '') return { resposta: responder(request, 'indisponivel', destinos) };
  if (url.host !== site) return { resposta: responder(request, 'host', destinos) };
  if (request.method !== 'POST') return { resposta: responder(request, 'metodo', destinos) };
  if (!origemValida(request, url)) return { resposta: responder(request, 'origem', destinos) };
  return {};
}

/** Lê os campos do envio. Com o campo-isca preenchido, o envio é descartado sem enviar nada. */
async function lerCampos(request, destinos) {
  const corpo = await lerCorpo(request);
  if (corpo === null) return { resposta: responder(request, 'dados', destinos) };
  if (corpo.grande) return { resposta: responder(request, 'grande', destinos) };
  const campos = corpo.campos;
  // Robô preenche tudo. A resposta é igual à de um envio de verdade, para ele não aprender nada, e nada é enviado.
  if (umaLinha(campos[LIMITES.isca]) !== '') return { resposta: responder(request, 'ok', destinos), descartado: true };
  return { campos };
}

// --------------------------------------------------------------------------------------------------------------------
// Contato (Resend)

const DESTINOS_CONTATO = { ok: '/contato-enviado', erro: '/contato-erro', campos: LIMITES.campos.contato };

function validarContato(campos) {
  const d = {
    nome: umaLinha(campos.nome),
    email: umaLinha(campos.email).toLowerCase(),
    empresa: umaLinha(campos.empresa),
    faixa: umaLinha(campos.faixa),
    mensagem: variasLinhas(campos.mensagem),
  };
  const erros = [];
  const T = LIMITES.tamanhos;
  if (d.nome === '' || d.nome.length > T.nome) erros.push('nome');
  if (d.email === '' || d.email.length > T.email || !EMAIL.test(d.email)) erros.push('email');
  if (d.empresa === '' || d.empresa.length > T.empresa) erros.push('empresa');
  if (!Object.prototype.hasOwnProperty.call(LIMITES.faixas, d.faixa)) erros.push('faixa');
  if (d.mensagem === '' || d.mensagem.length > T.mensagem) erros.push('mensagem');
  return { d, erros };
}

/** O corpo do pedido ao Resend: só os campos do formulário, com o texto escapado no HTML. Nada de IP, navegador nem cabeçalhos. */
function emailDeContato(d, env) {
  const faixa = LIMITES.faixas[d.faixa];
  const linhas = [
    ['Nome', d.nome],
    ['E-mail', d.email],
    ['Empresa', d.empresa],
    ['Número aproximado de pessoas', faixa],
    ['Mensagem', d.mensagem],
  ];
  return {
    from: env.CONTATO_REMETENTE,
    to: [env.CONTATO_DESTINO],
    reply_to: d.email,
    subject: `Contato pelo site: ${d.empresa}`,
    text: linhas.map(([r, v]) => `${r}: ${v}`).join('\n\n'),
    html: linhas.map(([r, v]) => `<p><strong>${esc(r)}:</strong> ${esc(v).replace(/\n/g, '<br>')}</p>`).join('\n'),
  };
}

async function contato(request, env, url) {
  const previo = prepararEnvio('contato', request, env, url, DESTINOS_CONTATO);
  if (previo.resposta) return previo.resposta;
  if (!env.RESEND_API_KEY || !env.CONTATO_DESTINO || !env.CONTATO_REMETENTE) return responder(request, 'indisponivel', DESTINOS_CONTATO);
  const lido = await lerCampos(request, DESTINOS_CONTATO);
  if (lido.resposta) return lido.resposta;
  const { d, erros } = validarContato(lido.campos);
  if (erros.length > 0) return responder(request, 'dados', DESTINOS_CONTATO, { campos: erros });
  let resposta;
  try {
    resposta = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'User-Agent': AGENTE },
      body: JSON.stringify(emailDeContato(d, env)),
    });
  } catch {
    return responder(request, 'falha', DESTINOS_CONTATO);
  }
  return responder(request, resposta.ok ? 'ok' : 'falha', DESTINOS_CONTATO);
}

// --------------------------------------------------------------------------------------------------------------------
// Novidades por e-mail (Brevo, dupla confirmação)

const DESTINOS_NEWSLETTER = { ok: '/novidades/receber-enviado', erro: '/novidades/receber-erro', campos: LIMITES.campos.newsletter };

/** Número inteiro positivo escrito em texto (os ids do Brevo), ou `null`. */
const inteiro = (v) => (/^\d{1,12}$/.test(String(v ?? '').trim()) && Number(v) > 0 ? Number(v) : null);

/** O que o Brevo diz quando o e-mail já está cadastrado (a conferir no primeiro teste real, `docs/22_SITE.md`, seção 9). */
const JA_CADASTRADO = /already|exist|duplicate/i;

/**
 * O Brevo responde 201 (contato novo) ou 204 (contato que já existia, atualizado), e para um contato que já existe pode também dar 400 com
 * a mensagem de que ele já existe. Os três valem como sucesso para a pessoa: o site não mostra se um e-mail já estava na lista, porque isso
 * deixaria qualquer um descobrir quem está cadastrado. Outro 400 (lista ou modelo errados, e-mail recusado) e qualquer outro status são falha.
 */
async function brevoAceitou(resposta) {
  if (resposta.ok) return true;
  if (resposta.status !== 400) return false;
  try {
    return JA_CADASTRADO.test(await resposta.text());
  } catch {
    return false;
  }
}

async function newsletter(request, env, url) {
  const previo = prepararEnvio('newsletter', request, env, url, DESTINOS_NEWSLETTER);
  if (previo.resposta) return previo.resposta;
  const lista = inteiro(env.BREVO_LISTA_ID);
  const modelo = inteiro(env.BREVO_MODELO_CONFIRMACAO_ID);
  if (!env.BREVO_API_KEY || lista === null || modelo === null) return responder(request, 'indisponivel', DESTINOS_NEWSLETTER);
  const lido = await lerCampos(request, DESTINOS_NEWSLETTER);
  if (lido.resposta) return lido.resposta;
  const email = umaLinha(lido.campos.email).toLowerCase();
  if (email === '' || email.length > LIMITES.tamanhos.email || !EMAIL.test(email)) return responder(request, 'dados', DESTINOS_NEWSLETTER, { campos: ['email'] });
  // O consentimento é uma caixa que a pessoa marca: sem ela, nada é cadastrado.
  const consentiu = ['sim', 'on', 'true'].includes(umaLinha(lido.campos.consentimento).toLowerCase());
  if (!consentiu) return responder(request, 'consentimento', DESTINOS_NEWSLETTER, { campos: ['consentimento'] });
  const retorno = env.BREVO_URL_RETORNO || `${url.origin}/novidades/receber-confirmado`;
  let resposta;
  try {
    resposta = await fetch('https://api.brevo.com/v3/contacts/doubleOptinConfirmation', {
      method: 'POST',
      headers: { 'api-key': env.BREVO_API_KEY, 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': AGENTE },
      body: JSON.stringify({ email, includeListIds: [lista], templateId: modelo, redirectionUrl: retorno }),
    });
  } catch {
    return responder(request, 'falha', DESTINOS_NEWSLETTER);
  }
  return responder(request, (await brevoAceitou(resposta)) ? 'ok' : 'falha', DESTINOS_NEWSLETTER);
}

// --------------------------------------------------------------------------------------------------------------------

/** O arquivo estático de sempre, com os cabeçalhos de segurança do site (sem trocar os que o Pages já pôs). */
async function estatico(request, env) {
  const resposta = await env.ASSETS.fetch(request);
  const cabecalhos = new Headers(resposta.headers);
  for (const [nome, valor] of Object.entries(CABECALHOS)) if (!cabecalhos.has(nome)) cabecalhos.set(nome, valor);
  return new Response(resposta.body, { status: resposta.status, statusText: resposta.statusText, headers: cabecalhos });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/contato') return contato(request, env, url);
    if (url.pathname === '/api/newsletter') return newsletter(request, env, url);
    return estatico(request, env);
  },
};
