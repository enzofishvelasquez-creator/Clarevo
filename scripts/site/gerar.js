'use strict';
/**
 * Junta tudo: gera todos os arquivos do site em memória (`Map` de caminho, relativo a `site/`, para texto ou `Buffer`), sem gravar
 * nada. Quem grava é `scripts/gerar-site.js`. Devolve também `avisos`, `pendencias` (por página, os marcadores que ainda faltam) e
 * `problemasFinais` (o que o `--final` recusa além dos marcadores: marca de rascunho ou de proposta, travessão, título fora de
 * ordem, link interno quebrado, post de Novidades com problema, domínio sem valor).
 */
const fs = require('node:fs');
const path = require('node:path');
const { RAIZ, SITE_SRC, MARCA, FONTES, PESOS_FONTE, PAGINAS_LEGAIS } = require('./config');
const { lerDados, avisosDeRedacao, problemasDeTitulos } = require('./texto');
const { dataExiste } = require('./conteudo');
const { dominioDe } = require('./modelo');
const { imagensDoSite } = require('./imagens');
const { linksQuebrados, problemasFinaisDaPagina } = require('./verificacoes');
const { caminhoLimpo, cabecalhosDoTexto } = require('./util');
const { paginaInicial } = require('./paginas/inicio');
const { paginaComece } = require('./paginas/comece');
const { paginaApp } = require('./paginas/app');
const { paginaEmpresas } = require('./paginas/empresas');
const { paginasAprender } = require('./paginas/aprender');
const { paginasCalculadoras, scriptsDasCalculadoras } = require('./paginas/calculadoras');
const { paginaImprensa, arquivosDaImprensa } = require('./paginas/imprensa');
const { paginasDosFormularios } = require('./paginas/formularios');
const { LIMITES, rotasLigadas } = require('./formularios');
const { nucleo } = require('./nucleo');
const { paginasNovidades } = require('./paginas/novidades');
const { paginasAjuda, conferirCobertura } = require('./paginas/ajuda');
const { paginaSeguranca } = require('./paginas/seguranca');
const { paginaSobre, paginaSuporte, paginaLegal, pagina404 } = require('./paginas/outras');

const CABECALHOS = `# Gerado por scripts/gerar-site.js. Cloudflare Pages lê este arquivo e não o publica.
# Nenhum recurso de fora é permitido: o site não carrega fontes, imagens, scripts nem estilos de outros endereços.
# script-src e connect-src 'self' valem só para os scripts do próprio site: a busca da Ajuda (ajuda/busca.js, que lê ajuda/indice.json) e as
# calculadoras (calculadoras/calculadora.js e os módulos de js/nucleo/, que não enviam nada). form-action 'self' vale para os formulários de
# contato e de novidades, que enviam só para o próprio site (/api/contato e /api/newsletter, recebidos por _worker.js).
# Referrer-Policy: same-origin (e não no-referrer): com no-referrer o navegador manda "Origin: null" nos formulários, e o worker recusa o valor null.
# Nenhum outro site recebe o endereço da página (a política só manda o referenciador para o próprio site).
# HSTS desde 29/10/2026, com o domínio clarevo.app.br abrindo por HTTPS: sem includeSubDomains e sem preload (docs/07).
/*
  Content-Security-Policy: default-src 'none'; img-src 'self'; style-src 'self'; font-src 'self'; script-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: same-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  Strict-Transport-Security: max-age=31536000
`;

/**
 * O `_worker.js`: o modelo de `site-src/worker/worker.js` com os limites dos formulários (`scripts/site/formularios.js`), os cabeçalhos
 * de segurança do `_headers` e as rotas ligadas (os interruptores de `valores`) no lugar dos marcadores. O worker só existe no projeto
 * `clarevo-site`; uma rota desligada responde 404 mesmo com as variáveis configuradas.
 */
function workerDoSite(valores) {
  const modelo = fs.readFileSync(path.join(SITE_SRC, 'worker', 'worker.js'), 'utf8');
  const marcadores = ['/*LIMITES*/ {}', '/*CABECALHOS*/ {}', '/*ROTAS*/ {}'];
  for (const marcador of marcadores) if (!modelo.includes(marcador)) throw new Error(`site-src/worker/worker.js perdeu o marcador ${marcador}`);
  return modelo
    .replace('/*LIMITES*/ {}', () => JSON.stringify(LIMITES))
    .replace('/*CABECALHOS*/ {}', () => JSON.stringify(cabecalhosDoTexto(CABECALHOS)))
    .replace('/*ROTAS*/ {}', () => JSON.stringify(rotasLigadas(valores)));
}

/** robots.txt: com marcador pendente (versão preliminar) nada é indexado; pronto, tudo é, e o sitemap só existe com domínio. */
function robots(preliminar, dominio) {
  if (preliminar) return '# Versão preliminar, em revisão: nada deve ser indexado ainda.\nUser-agent: *\nDisallow: /\n';
  return `User-agent: *\nAllow: /\n${dominio ? `\nSitemap: https://${dominio}/sitemap.xml\n` : ''}`;
}

/** O sitemap: toda página que se quer indexada. A 404 e as páginas de resposta dos formulários (`semIndexar`) ficam de fora. */
function sitemap(paginas, dominio) {
  const urls = paginas
    .filter((p) => !p.semIndexar)
    .map((p) => `<url><loc>https://${dominio}${caminhoLimpo(p.arquivo)}</loc></url>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

const ler = (...partes) => fs.readFileSync(path.join(...partes));

/** Um domínio de verdade, sem `https://` nem barra: `clarevo.com.br`, `www.exemplo.com`. */
const DOMINIO_VALIDO = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i;

/** A data de hoje em Brasília, "AAAA-MM-DD": a referência para recusar post com data futura quando ninguém passa `--referencia`. */
function hojeEmBrasilia() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

/**
 * `referencia` ("AAAA-MM-DD"): a data de referência dos posts de Novidades (nenhum pode ter data depois dela). Sem ela, vale a data de
 * hoje em Brasília; os testes e quem quer um resultado fixo passam a data explicitamente (`--referencia` na linha de comando).
 * `novidades`: outra pasta de posts (padrão: `site-src/novidades`), para os testes.
 */
function gerarSite({ raiz = RAIZ, legal = path.join(raiz, 'docs', 'legal'), dados, arquivoDados, referencia, novidades: pastaDeNovidades } = {}) {
  if (referencia !== undefined && referencia !== null && !dataExiste(referencia)) throw new Error(`a data de referência "${referencia}" não é uma data válida (AAAA-MM-DD)`);
  referencia = referencia || hojeEmBrasilia();
  const avisos = [];
  const arquivos = new Map();
  const pendencias = new Map();
  const problemasFinais = [];
  let valores = dados;
  if (!valores) {
    const lido = lerDados(arquivoDados || path.join(raiz, 'site', 'dados-da-empresa.json'));
    valores = lido.dados;
    avisos.push(...lido.avisos);
  }

  const problemasDaAjuda = conferirCobertura();
  if (problemasDaAjuda.length) throw new Error(`a Ajuda não cobre o guia e o catálogo do app:\n  ${problemasDaAjuda.join('\n  ')}`);

  const imagens = imagensDoSite();
  const ctx = { valores, img: imagens.info, referencia, pastaDePosts: pastaDeNovidades };
  const paginas = [];
  const juntar = (pg) => paginas.push(pg);

  juntar(paginaInicial(ctx));
  juntar(paginaComece(ctx));
  juntar(paginaApp(ctx));
  juntar(paginaEmpresas(ctx));
  paginasAprender(ctx).forEach(juntar);
  paginasCalculadoras(ctx).forEach(juntar);
  const novidades = paginasNovidades(ctx);
  novidades.paginas.forEach(juntar);
  // Post sem fontes, com data inválida ou futura, ou com {{tema:...}} que não existe: aviso no console e problema que o --final recusa.
  avisos.push(...novidades.avisos);
  problemasFinais.push(...novidades.avisos);
  const ajuda = paginasAjuda(ctx);
  ajuda.paginas.forEach(juntar);
  juntar(paginaSeguranca(ctx));
  juntar(paginaSobre(ctx));
  juntar(paginaImprensa(ctx));
  // Os formulários (contato e Novidades por e-mail) são prontos e desligados: as páginas deles só existem com o interruptor ligado.
  paginasDosFormularios(ctx).forEach(juntar);
  juntar(paginaSuporte(ctx));
  for (const p of PAGINAS_LEGAIS) {
    const arquivo = path.join(legal, p.md);
    let md = null;
    if (fs.existsSync(arquivo)) {
      md = fs.readFileSync(arquivo, 'utf8');
      avisos.push(...avisosDeRedacao(md, `docs/legal/${p.md}`));
    } else avisos.push(`docs/legal/${p.md} ainda não existe: ${p.arquivo} sai como espaço reservado, com [A DEFINIR]`);
    const pg = paginaLegal(p, md, valores);
    avisos.push(...pg.avisos);
    // As seções 3.6 e 3.7 da política só podem existir com o formulário correspondente ligado (e vice-versa).
    problemasFinais.push(...pg.problemasFinais);
    juntar({ ...pg, arquivo: p.arquivo });
  }
  juntar(pagina404(ctx));

  for (const pg of paginas) {
    if (arquivos.has(pg.arquivo)) throw new Error(`duas páginas geram o mesmo arquivo: ${pg.arquivo}`);
    arquivos.set(pg.arquivo, pg.html);
    pendencias.set(pg.arquivo, pg.pendencias);
    for (const problema of problemasDeTitulos(pg.html)) avisos.push(`${pg.arquivo}: ${problema}`);
    const finais = problemasFinaisDaPagina(pg.arquivo, pg.html);
    problemasFinais.push(...finais);
    // Sem `--final` o gerador só avisa. Travessão, expressão proibida, título e link já viram aviso mais acima; entram aqui as marcas
    // de rascunho e de proposta, que de outro modo só apareceriam destacadas na página.
    avisos.push(...finais.filter((f) => /frase de rascunho|texto de proposta/.test(f)).map((f) => `o --final recusaria: ${f}`));
  }

  const preliminar = [...pendencias.values()].some((l) => l.length > 0);
  const dominio = dominioDe(valores);
  // O --final exige o domínio preenchido de propósito, mesmo que nenhum texto cite [DOMÍNIO]: sem ele, o site sai sem canonical, sem
  // sitemap, sem feed e sem endereço completo no Open Graph.
  if (!dominio) {
    const falta = '[DOMÍNIO] sem valor em site/dados-da-empresa.json: sem ele o site sai sem canonical, sem sitemap, sem feed de Novidades e sem endereço completo no Open Graph';
    problemasFinais.push(falta);
    avisos.push(`o --final recusaria: ${falta}`);
  } else if (!DOMINIO_VALIDO.test(dominio)) {
    const invalido = `[DOMÍNIO] "${valores['DOMÍNIO']}" em site/dados-da-empresa.json não parece um domínio (use algo como clarevo.com.br, sem https:// nem barra)`;
    problemasFinais.push(invalido);
    avisos.push(`o --final recusaria: ${invalido}`);
  }
  const css = fs.readFileSync(path.join(SITE_SRC, 'estilo.css'), 'utf8');
  arquivos.set('estilo.css', css);
  arquivos.set('_headers', CABECALHOS);
  arquivos.set('robots.txt', robots(preliminar, dominio));
  if (dominio) arquivos.set('sitemap.xml', sitemap(paginas, dominio));
  // O feed só existe com domínio: sem ele os endereços seriam relativos e o RSS, inválido.
  if (novidades.feed) arquivos.set('novidades/feed.xml', novidades.feed);
  arquivos.set('ajuda/indice.json', `${JSON.stringify(ajuda.indice)}\n`);
  arquivos.set('ajuda/busca.js', ajuda.script);
  // As calculadoras: os scripts da página (site-src/calculadoras: o que inicia a página, as peças comuns e uma definição por calculadora) e o
  // núcleo, o mesmo código do core transpilado para o navegador.
  for (const nome of scriptsDasCalculadoras()) arquivos.set(`calculadoras/${nome}`, fs.readFileSync(path.join(SITE_SRC, 'calculadoras', nome), 'utf8'));
  for (const [nome, texto] of nucleo()) arquivos.set(nome, texto);
  // O kit de imprensa: SVG de docs/marca (sem mudança), os PNG que scripts/gerar-marca-imprensa.js desenha deles e as capturas originais.
  const imprensa = arquivosDaImprensa();
  avisos.push(...imprensa.avisos);
  for (const [nome, bytes] of imprensa.arquivos) arquivos.set(nome, bytes);
  // O worker do Cloudflare Pages (modo avançado): recebe só /api/contato e /api/newsletter; o resto vai para os arquivos estáticos.
  arquivos.set('_worker.js', workerDoSite(valores));
  arquivos.set('_routes.json', `${JSON.stringify({ version: 1, include: ['/api/*'], exclude: [] })}\n`);
  for (const peso of PESOS_FONTE) arquivos.set(`fontes/Manrope_${peso}.ttf`, ler(FONTES, `Manrope_${peso}.ttf`));
  arquivos.set('fontes/OFL.txt', ler(FONTES, 'OFL.txt'));
  arquivos.set('marca/clarevo-logotipo-reverso.svg', ler(MARCA, 'clarevo-logotipo-reverso.svg'));
  // Na impressão o cabeçalho fica sem fundo azul: entra o logotipo oficial de fundo claro, em vez de inverter as cores do reverso.
  arquivos.set('marca/clarevo-logotipo.svg', ler(MARCA, 'clarevo-logotipo.svg'));
  arquivos.set('marca/icone-app.png', ler(MARCA, 'icone-app-1024.png'));
  arquivos.set('favicon.svg', ler(MARCA, 'clarevo-simbolo.svg'));
  for (const [nome, bytes] of imagens.arquivos) arquivos.set(nome, bytes);
  const og = path.join(SITE_SRC, 'imagens', 'og-clarevo-1200x630.png');
  if (fs.existsSync(og)) arquivos.set('og/clarevo.png', fs.readFileSync(og));
  else avisos.push('site-src/imagens/og-clarevo-1200x630.png não existe: rode "node scripts/gerar-og-site.js"');

  const quebrados = linksQuebrados(arquivos);
  avisos.push(...quebrados);
  problemasFinais.push(...quebrados.map((q) => `link interno quebrado em ${q}`));
  return { arquivos, avisos, pendencias, problemasFinais, valores, posts: novidades.posts };
}

module.exports = { gerarSite, CABECALHOS, hojeEmBrasilia, DOMINIO_VALIDO };
