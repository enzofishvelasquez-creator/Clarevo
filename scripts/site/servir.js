'use strict';
/**
 * Servidor local mínimo para o teste de navegador do site (`scripts/e2e-site.js`) e para as capturas: serve a pasta `site/` como o
 * Cloudflare Pages faz (`/x` abre `x.html`, `/pasta/` abre `pasta/index.html`, 404 com `404.html`), aplica os cabeçalhos do
 * `_headers` (a política de segurança inclusive, para o navegador acusar qualquer violação) e, se houver `_worker.js` (modo avançado),
 * entrega a ele só o que o `_routes.json` manda (`include` menos `exclude`, com `*` no fim ou no meio, como o Pages; sem o arquivo, tudo),
 * com um `env.ASSETS` que devolve os arquivos estáticos. O resto sai direto dos arquivos, sem passar pelo worker. Sem pacote novo: só `node:http`.
 */
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { cabecalhosDoTexto } = require('./util');

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ttf': 'font/ttf',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

/** Os cabeçalhos do bloco `/*` do `_headers`. */
function lerCabecalhos(pasta) {
  const arquivo = path.join(pasta, '_headers');
  return fs.existsSync(arquivo) ? cabecalhosDoTexto(fs.readFileSync(arquivo, 'utf8')) : {};
}

const escRe = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * As rotas do `_routes.json` como uma função: `true` se o caminho vai para o worker. `include` diz o que entra (padrão: tudo), `exclude`
 * tira de novo (e vale mais), e `*` casa com qualquer sequência. Sem o arquivo, o worker recebe tudo, como o Pages no modo avançado.
 */
function lerRotas(pasta) {
  const arquivo = path.join(pasta, '_routes.json');
  if (!fs.existsSync(arquivo)) return () => true;
  const { include = ['/*'], exclude = [] } = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
  const regra = (padrao) => new RegExp(`^${String(padrao).split('*').map(escRe).join('.*')}$`);
  const entra = include.map(regra);
  const sai = exclude.map(regra);
  return (caminho) => entra.some((r) => r.test(caminho)) && !sai.some((r) => r.test(caminho));
}

/** O arquivo de um caminho, como o Cloudflare Pages resolve: o próprio arquivo, `x.html` ou `x/index.html`. */
function resolverArquivo(pasta, caminho) {
  const limpo = decodeURIComponent(caminho).replace(/^\/+/, '');
  const candidatos = limpo === '' || limpo.endsWith('/') ? [`${limpo}index.html`] : [limpo, `${limpo}.html`, `${limpo}/index.html`];
  for (const c of candidatos) {
    const alvo = path.resolve(pasta, c);
    if (alvo.startsWith(path.resolve(pasta) + path.sep) && fs.existsSync(alvo) && fs.statSync(alvo).isFile() && !path.basename(alvo).startsWith('_')) return alvo;
  }
  return null;
}

/**
 * Sobe o servidor. `env`: as variáveis que o `_worker.js` recebe (nada, por padrão: as rotas de envio respondem 503). `hostDoSite`: põe em
 * `env.SITE_HOST` o endereço deste servidor (`127.0.0.1:porta`, que só se sabe depois de subir), para o worker aceitar os pedidos dele.
 * `fetchDoWorker`: o `fetch` que o worker usa para falar com Resend e Brevo (um simulado nos testes; vale no processo todo até `fechar`).
 * Devolve `{ url, fechar, pedidos, doWorker }`: `pedidos` são todos os pedidos (`GET /x`) e `doWorker`, só os que passaram pelo worker.
 */
async function servir(pasta, { porta = 0, env = {}, hostDoSite = false, fetchDoWorker } = {}) {
  const cabecalhos = lerCabecalhos(pasta);
  const noWorker = lerRotas(pasta);
  const variaveis = { ...env };
  const arquivoDoWorker = path.join(pasta, '_worker.js');
  // O worker é um módulo ES sem importações: entra por um endereço `data:`, sem o aviso do Node sobre pasta sem "type".
  const worker = fs.existsSync(arquivoDoWorker) ? (await import(`data:text/javascript;base64,${fs.readFileSync(arquivoDoWorker).toString('base64')}`)).default : null;
  const pedidos = [];
  const doWorker = [];
  const estatico = (caminho, metodo) => {
    const arquivo = resolverArquivo(pasta, caminho);
    const naoAchou = !arquivo;
    const alvo = arquivo ?? path.join(pasta, '404.html');
    const corpo = metodo === 'HEAD' ? null : fs.readFileSync(alvo);
    return new Response(corpo, { status: naoAchou ? 404 : 200, headers: { 'content-type': TIPOS[path.extname(alvo)] || 'application/octet-stream' } });
  };
  // O worker chama o `fetch` global (Resend e Brevo). Nos testes ele é trocado pelo simulado enquanto o servidor estiver de pé, e
  // `fechar` devolve o original.
  const fetchOriginal = globalThis.fetch;
  if (fetchDoWorker) globalThis.fetch = fetchDoWorker;
  const servidor = http.createServer(async (q, r) => {
    try {
      const url = new URL(q.url, `http://${q.headers.host || 'localhost'}`);
      pedidos.push(`${q.method} ${url.pathname}`);
      const corpo = q.method === 'GET' || q.method === 'HEAD' ? undefined : await new Promise((ok) => {
        const partes = [];
        q.on('data', (d) => partes.push(d));
        q.on('end', () => ok(Buffer.concat(partes)));
      });
      const requisicao = new Request(url, { method: q.method, headers: q.headers, body: corpo, duplex: 'half' });
      let resposta;
      if (worker && noWorker(url.pathname)) {
        doWorker.push(`${q.method} ${url.pathname}`);
        resposta = await worker.fetch(requisicao, { ...variaveis, ASSETS: { fetch: (req) => Promise.resolve(estatico(new URL(req.url).pathname, req.method)) } });
      } else resposta = estatico(url.pathname, q.method);
      const saida = { ...Object.fromEntries(resposta.headers), ...cabecalhos };
      r.writeHead(resposta.status, saida);
      r.end(Buffer.from(await resposta.arrayBuffer()));
    } catch (e) {
      r.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
      r.end(String(e && e.stack ? e.stack : e));
    }
  });
  await new Promise((ok) => servidor.listen(porta, '127.0.0.1', ok));
  const { port } = servidor.address();
  if (hostDoSite) variaveis.SITE_HOST = `127.0.0.1:${port}`;
  return {
    url: `http://127.0.0.1:${port}`,
    pedidos,
    doWorker,
    fechar: () => {
      globalThis.fetch = fetchOriginal;
      return new Promise((ok) => servidor.close(ok));
    },
  };
}

module.exports = { servir, lerCabecalhos, lerRotas, resolverArquivo };
