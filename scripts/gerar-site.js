#!/usr/bin/env node
/**
 * Gera o site público do Clarevo (D-064, D-065 e, na segunda etapa, D-066, `docs/22_SITE.md`): páginas estáticas em `site/`, sem cookies, sem
 * analytics e sem nenhum arquivo de fora (fontes, logotipo, capturas e favicon são cópias locais). O JavaScript é só do próprio site: a busca
 * da Ajuda (`ajuda/busca.js`) e as calculadoras (`calculadoras/calculadora.js` mais o núcleo de `js/nucleo/`). Hospedagem prevista: um projeto novo e gratuito do Cloudflare Pages (`clarevo-site`), sem
 * comando de build e com a pasta `site` como saída. **Nada vai ao ar antes da revisão do advogado.**
 *
 * Os módulos ficam em `scripts/site/` (modelo de página, páginas, conversor de Markdown, imagens, verificações); o conteúdo próprio, em
 * `site-src/` (estilo, posts de Novidades, perguntas da Ajuda, texto de "Como escrevemos" e a imagem de compartilhamento).
 *
 * O que sai em `site/`:
 *   index.html, app/, empresas/, aprender/ (um tema por página, vindo do catálogo do app), novidades/ (posts e, só com domínio, feed.xml), ajuda/
 *   (por tema, com indice.json e busca.js), seguranca.html, sobre.html, suporte.html, 404.html
 *   calculadoras/ (o índice e as dez calculadoras do app), js/nucleo/ (o código do core que as calculadoras rodam no navegador, transpilado
 *   por `scripts/site/nucleo.js`), imprensa.html e imprensa/ (kit de imprensa)
 *   privacidade.html, termos.html, excluir-conta.html   convertidos de `docs/legal/*.md`
 *   estilo.css, _headers, _worker.js e _routes.json (o worker do Cloudflare Pages que recebe /api/contato e /api/newsletter), robots.txt,
 *   sitemap.xml (só com domínio), imagens/, og/, fontes/, marca/, favicon.svg
 *   contato-enviado.html, contato-erro.html, novidades/receber*.html   só com os interruptores `formulario_contato` e `newsletter` em
 *                                              `site/dados-da-empresa.json` ligados (`true`); desligados, o site não tem formulário
 * Com `[DOMÍNIO]` preenchido o site ganha também `canonical`, `og:url`, `sitemap.xml` e o feed `novidades/feed.xml` (um feed precisa de endereços
 * completos, então sem domínio ele não é gerado e as páginas não apontam para ele).
 * `site/dados-da-empresa.json` é a ENTRADA (não é gerada): os valores que trocam os marcadores `[RAZÃO SOCIAL]`, `[CNPJ]`, `[ENDEREÇO]`,
 * `[E-MAIL DE PRIVACIDADE]`, `[E-MAIL DE SUPORTE]`, `[E-MAIL DE CONTATO]`, `[DOMÍNIO]` e `[DATA DE VIGÊNCIA]`. Valor vazio mantém o
 * marcador visível e destacado, e a página ganha no topo a faixa "Versão preliminar, em revisão" (o mesmo vale para `[A DEFINIR: ...]`,
 * `[PROPOSTA: ...]` e qualquer outro marcador em maiúsculas entre colchetes). Enquanto um texto de `docs/legal/` não existir, a página
 * dele sai como espaço reservado com `[A DEFINIR: ...]` (o script avisa) e os links do rodapé nunca ficam quebrados.
 *
 * Aprender e Ajuda vêm do TypeScript do `packages/core` (catálogo e guia de uso do app). O TypeScript roda no Node sem pacote novo:
 * `scripts/site/catalogo.js` transpila cada arquivo na hora de carregar, com o `typescript` que já está instalado.
 *
 * Uso:
 *   node scripts/gerar-site.js                 grava o site em `site/`
 *   node scripts/gerar-site.js --final         só grava se estiver pronto para publicar; senão sai com código 1 e lista o que falta: marcador sem
 *                                              valor, `[A DEFINIR`, `[PROPOSTA`, a frase "Rascunho preparado ... Não é parecer jurídico.", texto de
 *                                              proposta ("Proposta:", "proposta, ainda sem confirmação"), travessão, a expressão proibida pela
 *                                              orientação do projeto, título fora de ordem, link interno quebrado, post de Novidades sem
 *                                              fontes, com data inválida ou futura (em relação a `--referencia`) ou com `{{tema:...}}` que não
 *                                              existe no catálogo, o domínio sem valor (exigido de propósito, mesmo que nenhum texto cite
 *                                              `[DOMÍNIO]`) e as seções 3.6 e 3.7 da política sem o formulário ligado (ou o formulário
 *                                              ligado sem a seção). Sem `--final`, tudo isso continua só como aviso no console
 *   node scripts/gerar-site.js --pdf <arquivo> também gera, com o Chromium do Playwright, o PDF A4 "Pacote para revisão jurídica" (resumo
 *                                              para o advogado, privacidade, termos, exclusão de conta, pontos do contrato com
 *                                              empresas, minuta do contrato e plano de trabalho do piloto, nesta ordem, com os
 *                                              marcadores visíveis). O PDF não vai para o repositório.
 *   --referencia <AAAA-MM-DD>  data de referência dos posts de Novidades: nenhum pode ter data depois dela (padrão: hoje, em Brasília)
 *   --novidades <pasta>  lê os posts de outra pasta (padrão: site-src/novidades)
 *   --legal <pasta>   lê os Markdown de outra pasta (padrão: docs/legal)
 *   --saida <pasta>   grava o site em outra pasta (padrão: site)
 *   --dados <arquivo> lê os valores dos marcadores de outro JSON (padrão: site/dados-da-empresa.json)
 * A imagem de compartilhamento (`site-src/imagens/og-clarevo-1200x630.png`) é feita à parte, por `node scripts/gerar-og-site.js`.
 * Navegador do `--pdf`: Chromium do Playwright, ou CHROMIUM_PATH.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const config = require('./site/config');
const texto = require('./site/texto');
const { gerarSite } = require('./site/gerar');
const { linksQuebrados } = require('./site/verificacoes');
const { montarPacote, gerarPdf } = require('./site/pdf');
const png = require('./site/png');
const { hostsDeFontes } = require('./site/catalogo');

const { RAIZ, SITE, LEGAL } = config;

/** Grava um arquivo só se mudou. Para PNG, a comparação é pelos pixels, porque o zlib de cada versão do Node pode gerar bytes diferentes. */
function gravar(alvo, conteudo) {
  const bytes = typeof conteudo === 'string' ? Buffer.from(conteudo, 'utf8') : conteudo;
  if (fs.existsSync(alvo)) {
    const atual = fs.readFileSync(alvo);
    if (atual.equals(bytes)) return false;
    if (alvo.endsWith('.png') && mesmosPixels(atual, bytes)) return false;
  }
  fs.mkdirSync(path.dirname(alvo), { recursive: true });
  fs.writeFileSync(alvo, bytes);
  return true;
}

function mesmosPixels(a, b) {
  try {
    const x = png.decodificar(a);
    const y = png.decodificar(b);
    return x.largura === y.largura && x.altura === y.altura && x.rgb.equals(y.rgb);
  } catch {
    return false;
  }
}

/** Arquivos que o gerador não conhece dentro de `site/`, para apagar depois de uma página sair (fora o JSON da empresa). */
function sobras(arquivos, destino) {
  const achados = [];
  const visitar = (dir, prefixo) => {
    for (const nome of fs.readdirSync(dir)) {
      const rel = prefixo + nome;
      if (fs.statSync(path.join(dir, nome)).isDirectory()) visitar(path.join(dir, nome), `${rel}/`);
      else if (rel !== 'dados-da-empresa.json' && !arquivos.has(rel)) achados.push(rel);
    }
  };
  if (fs.existsSync(destino)) visitar(destino, '');
  return achados;
}

function limparPastasVazias(dir, raiz) {
  for (const nome of fs.readdirSync(dir)) {
    const p = path.join(dir, nome);
    if (fs.statSync(p).isDirectory()) limparPastasVazias(p, raiz);
  }
  if (dir !== raiz && fs.readdirSync(dir).length === 0) fs.rmdirSync(dir);
}

function escreverSite(arquivos, destino) {
  let mudou = 0;
  for (const [nome, conteudo] of arquivos) if (gravar(path.join(destino, nome), conteudo)) mudou++;
  let apagados = 0;
  // Só a pasta padrão do site é limpa: uma pasta dada em --saida pode ter outras coisas.
  if (path.resolve(destino) === SITE) {
    for (const s of sobras(arquivos, destino)) {
      fs.rmSync(path.join(destino, s));
      apagados++;
    }
    limparPastasVazias(destino, destino);
  }
  return { mudou, apagados };
}

async function principal(argv) {
  const opcao = (nome) => {
    const i = argv.indexOf(nome);
    if (i < 0) return null;
    if (argv[i + 1] === undefined || argv[i + 1].startsWith('--')) throw new Error(`${nome} precisa de um valor`);
    return argv[i + 1];
  };
  const final = argv.includes('--final');
  const legal = path.resolve(opcao('--legal') || LEGAL);
  const destino = path.resolve(opcao('--saida') || SITE);
  const pdf = opcao('--pdf');
  const arquivoDados = opcao('--dados');
  const referencia = opcao('--referencia');
  const novidades = opcao('--novidades');

  const resultado = gerarSite({ legal, arquivoDados: arquivoDados ? path.resolve(arquivoDados) : undefined, referencia: referencia || undefined, novidades: novidades ? path.resolve(novidades) : undefined });
  for (const aviso of resultado.avisos) console.warn(`aviso: ${aviso}`);

  const faltas = [];
  for (const [pagina, lista] of resultado.pendencias) for (const m of lista) faltas.push(`${pagina}: ${m}`);
  const problemas = resultado.problemasFinais;
  if (final && (faltas.length > 0 || problemas.length > 0)) {
    console.error('--final: o site não está pronto para publicar.');
    if (faltas.length > 0) {
      const porMarcador = new Map();
      for (const lista of resultado.pendencias.values()) for (const m of lista) porMarcador.set(m, (porMarcador.get(m) || 0) + 1);
      console.error(`Falta preencher (${faltas.length}, em ${porMarcador.size} marcador(es)):`);
      for (const [m, n] of porMarcador) console.error(`  ${m}: ${n} página(s)`);
      console.error('Por página:');
      for (const f of faltas) console.error(`  ${f}`);
    }
    if (problemas.length > 0) {
      console.error(`Ainda no texto (${problemas.length}):`);
      for (const q of problemas) console.error(`  ${q}`);
    }
    console.error('Preencha site/dados-da-empresa.json (inclusive o domínio), resolva os trechos [A DEFINIR] e [PROPOSTA], retire o que estiver marcado [A RETIRAR] (seção de um formulário desligado), tire as frases de rascunho de docs/legal e corrija os posts de Novidades, e rode de novo.');
    process.exitCode = 1;
    return;
  }

  const { mudou, apagados } = escreverSite(resultado.arquivos, destino);
  const paginas = [...resultado.arquivos.keys()].filter((k) => k.endsWith('.html')).length;
  const bytes = [...resultado.arquivos.values()].reduce((n, c) => n + Buffer.byteLength(c), 0);
  console.log(`site gravado em ${path.relative(RAIZ, destino) || destino}: ${resultado.arquivos.size} arquivos (${paginas} páginas, ${(bytes / 1024 / 1024).toFixed(2)} MB), ${mudou} mudaram${apagados ? `, ${apagados} sobra(s) apagada(s)` : ''}`);
  if (faltas.length > 0) console.log(`versão preliminar: ${faltas.length} marcador(es) ainda sem valor (a faixa "Versão preliminar, em revisão" aparece nas páginas)`);
  else if (problemas.length > 0) console.log(`nenhum marcador pendente, mas o --final ainda recusaria ${problemas.length} ponto(s) (veja os avisos acima)`);
  else console.log('nenhum marcador pendente: pronto para o --final');

  if (pdf) {
    const r = await gerarPdf({ legal, valores: resultado.valores, destino: pdf });
    for (const aviso of r.avisos) console.warn(`aviso: ${aviso}`);
    console.log(`PDF gravado em ${pdf} com ${r.documentos.length} documento(s): ${r.documentos.join(', ')}`);
  }
}

module.exports = {
  MARCADORES: config.MARCADORES,
  PAGINAS_LEGAIS: config.PAGINAS_LEGAIS,
  DOCUMENTOS_DO_PACOTE: config.DOCUMENTOS_DO_PACOTE,
  /** Hosts de links de texto permitidos: o app, as páginas oficiais dos textos jurídicos e as fontes citadas no catálogo de Aprender. */
  get HOSTS_DE_LINK_PERMITIDOS() {
    return [...config.HOSTS_BASE, ...hostsDeFontes()];
  },
  markdownParaHtml: texto.markdownParaHtml,
  titulosDoMarkdown: texto.titulosDoMarkdown,
  separarTitulo: texto.separarTitulo,
  problemasDeTitulos: texto.problemasDeTitulos,
  pendenciasDoTexto: texto.pendenciasDoTexto,
  slug: texto.slug,
  lerDados: texto.lerDados,
  gerarSite,
  linksQuebrados,
  montarPacote,
};

if (require.main === module) {
  principal(process.argv.slice(2)).catch((e) => {
    console.error(e.message || e);
    process.exit(1);
  });
}
