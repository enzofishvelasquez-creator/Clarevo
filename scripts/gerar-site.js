#!/usr/bin/env node
/**
 * Gera o site público do Clarevo (D-064, `docs/07` seção "Site público (clarevo-site)"): páginas estáticas em `site/`, sem JavaScript,
 * sem cookies, sem analytics e sem nenhum arquivo de fora (fontes, logotipo e favicon são cópias locais). Hospedagem prevista: um
 * projeto novo e gratuito do Cloudflare Pages (`clarevo-site`), sem comando de build e com a pasta `site` como saída.
 * **Nada vai ao ar antes da revisão do advogado.**
 *
 * O que sai em `site/`:
 *   index.html, suporte.html     modelos que ficam NESTE script (um só lugar), com os textos da ficha das lojas (`docs/lojas/ficha.md`)
 *   privacidade.html, termos.html, excluir-conta.html
 *                                convertidos de `docs/legal/politica-de-privacidade.md`, `termos-de-uso.md` e `exclusao-de-conta.md`
 *   estilo.css, _headers         estilo próprio (claro e escuro, contraste conferido por `packages/core/test/site.test.ts`) e cabeçalhos
 *                                de segurança do Cloudflare Pages (nenhum recurso de fora é permitido)
 *   fontes/, marca/, favicon.svg cópias de `apps/app/assets/fonts` (Manrope, subconjunto Latin, licença OFL) e de `docs/marca`
 * `site/dados-da-empresa.json` é a ENTRADA (não é gerada): os valores que trocam os marcadores `[RAZÃO SOCIAL]`, `[CNPJ]`, `[ENDEREÇO]`,
 * `[E-MAIL DE PRIVACIDADE]`, `[E-MAIL DE SUPORTE]`, `[DOMÍNIO]` e `[DATA DE VIGÊNCIA]`. Valor vazio mantém o marcador visível e
 * destacado, e a página ganha no topo a faixa "Versão preliminar, em revisão" (o mesmo vale para `[A DEFINIR: ...]` e para qualquer
 * outro marcador em maiúsculas entre colchetes). Enquanto um texto de `docs/legal/` não existir, a página dele sai como espaço
 * reservado com `[A DEFINIR: ...]` (o script avisa) e os links do rodapé nunca ficam quebrados.
 *
 * Uso:
 *   node scripts/gerar-site.js                 grava o site em `site/`
 *   node scripts/gerar-site.js --final         só grava se não sobrar marcador nem `[A DEFINIR`; senão sai com código 1 e lista o que falta
 *   node scripts/gerar-site.js --pdf <arquivo> também gera, com o Chromium do Playwright, o PDF A4 "Pacote para revisão jurídica" (resumo
 *                                              para o advogado, privacidade, termos, exclusão de conta e pontos do contrato com
 *                                              empresas, nesta ordem, com os marcadores visíveis). O PDF não vai para o repositório.
 *   --legal <pasta>   lê os Markdown de outra pasta (padrão: docs/legal)
 *   --saida <pasta>   grava o site em outra pasta (padrão: site)
 *   --dados <arquivo> lê os valores dos marcadores de outro JSON (padrão: site/dados-da-empresa.json)
 * Navegador do `--pdf`: Chromium do Playwright, ou CHROMIUM_PATH.
 *
 * O conversor de Markdown (`markdownParaHtml`) é mínimo e próprio, exportado para o teste: títulos `#` a `####` com âncoras estáveis,
 * parágrafos, listas com `-` e numeradas (com aninhamento), **negrito**, *itálico*, `código`, links `[t](u)`, tabelas simples com `|`,
 * citação `>`, bloco de código e linha `---`. O texto é sempre escapado.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.join(__dirname, '..');
const SITE = path.join(RAIZ, 'site');
const LEGAL = path.join(RAIZ, 'docs', 'legal');
const MARCA = path.join(RAIZ, 'docs', 'marca');
const FONTES = path.join(RAIZ, 'apps', 'app', 'assets', 'fonts');

const URL_APP = 'https://clarevo.pages.dev';
const HOST_APP = 'clarevo.pages.dev';
/** Fontes do site: o corpo (500), o negrito (700) e os títulos (800). Subconjuntos Latin do app, com a licença OFL. */
const PESOS_FONTE = ['500Medium', '700Bold', '800ExtraBold'];

const MARCADORES = ['RAZÃO SOCIAL', 'CNPJ', 'ENDEREÇO', 'E-MAIL DE PRIVACIDADE', 'E-MAIL DE SUPORTE', 'DOMÍNIO', 'DATA DE VIGÊNCIA'];
const MARCADORES_EMAIL = new Set(['E-MAIL DE PRIVACIDADE', 'E-MAIL DE SUPORTE']);
/** Links de texto para páginas oficiais que os textos jurídicos podem citar. Nunca carregam nada: só `<a>`, com `noopener`. */
const HOSTS_DE_LINK_PERMITIDOS = [HOST_APP, 'www.gov.br', 'www.planalto.gov.br'];

/** As páginas que vêm de `docs/legal/`, na ordem do menu. */
const PAGINAS_LEGAIS = [
  { arquivo: 'privacidade.html', md: 'politica-de-privacidade.md', titulo: 'Política de privacidade', rotulo: 'Privacidade', descricao: 'Como o Clarevo trata os dados pessoais de quem usa o app.' },
  { arquivo: 'termos.html', md: 'termos-de-uso.md', titulo: 'Termos de uso', rotulo: 'Termos', descricao: 'As regras de uso do Clarevo.' },
  { arquivo: 'excluir-conta.html', md: 'exclusao-de-conta.md', titulo: 'Excluir conta e dados', rotulo: 'Excluir conta', descricao: 'Como pedir a exclusão da sua conta e dos seus dados do Clarevo.' },
];
/** Links entre os textos jurídicos: o Markdown aponta para o arquivo, o site para a página. */
const MAPA_LINKS_SITE = Object.fromEntries(PAGINAS_LEGAIS.map((p) => [p.md, p.arquivo]));
/** O pacote do advogado, na ordem pedida. */
const DOCUMENTOS_DO_PACOTE = ['resumo-para-advogado.md', 'politica-de-privacidade.md', 'termos-de-uso.md', 'exclusao-de-conta.md', 'empresas-pontos-do-contrato.md'];

const MENU = [
  { arquivo: 'index.html', rotulo: 'Início' },
  ...PAGINAS_LEGAIS.map((p) => ({ arquivo: p.arquivo, rotulo: p.rotulo })),
  { arquivo: 'suporte.html', rotulo: 'Suporte' },
];
const RODAPE_LEGAL = '[RAZÃO SOCIAL] · CNPJ [CNPJ]';

// ------------------------------------------------------------------------------------------------------------------------------
// Texto: escape, marcadores e Markdown
// ------------------------------------------------------------------------------------------------------------------------------

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const nfc = (s) => String(s).normalize('NFC');

/** Marcador de dado, `[A DEFINIR: ...]` ou qualquer outro texto em MAIÚSCULAS entre colchetes (que não seja o texto de um link). */
const FONTE_MARCADOR =
  '\\[A DEFINIR[^\\]\\n]*\\](?!\\()' +
  `|\\[(?:${MARCADORES.map(escRe).join('|')})\\](?!\\()` +
  '|\\[[A-ZÀ-ÖØ-Þ][A-ZÀ-ÖØ-Þ0-9 /.\\-]{2,}\\](?!\\()';

function classificarMarcador(m) {
  const dentro = m.slice(1, -1);
  if (/^A DEFINIR/.test(dentro)) return { tipo: 'definir' };
  if (MARCADORES.includes(dentro)) return { tipo: 'dado', nome: dentro };
  return { tipo: 'desconhecido' };
}

const valorDe = (valores, nome) => (valores && typeof valores[nome] === 'string' ? valores[nome].trim() : '');

/** Como um marcador aparece: o valor da empresa, se houver (e-mail vira link), ou o próprio marcador, destacado. */
function expandirMarcador(m, valores) {
  const c = classificarMarcador(m);
  const valor = c.tipo === 'dado' ? valorDe(valores, c.nome) : '';
  if (valor) {
    const plano = esc(valor);
    const html = MARCADORES_EMAIL.has(c.nome) ? `<a href="mailto:${plano}">${plano}</a>` : plano;
    return { html, htmlPlano: plano, texto: valor };
  }
  const marca = `<mark class="pendente">${esc(m)}</mark>`;
  return { html: marca, htmlPlano: marca, texto: m };
}

/** Marcadores que ainda faltam em um texto (inclusive dentro de código): os de valor vazio, `[A DEFINIR...]` e os desconhecidos. */
function pendenciasDoTexto(texto, valores) {
  const achados = [];
  const re = new RegExp(FONTE_MARCADOR, 'g');
  let m;
  while ((m = re.exec(nfc(texto)))) {
    const c = classificarMarcador(m[0]);
    if (c.tipo === 'dado' && valorDe(valores, c.nome)) continue;
    if (!achados.includes(m[0])) achados.push(m[0]);
  }
  return achados;
}

/** Texto de um título sem marcadores nem sinais de Markdown, para a âncora e para o `<title>`. */
function textoPuro(md) {
  return nfc(md)
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Âncora estável de um título: minúsculas, sem acento, só letras e algarismos, marcadores de fora. */
function slug(texto) {
  const s = textoPuro(texto)
    .replace(new RegExp(FONTE_MARCADOR, 'g'), '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return s || 'secao';
}

const TOKEN = /\uE000(\d+)\uE001/g;

/**
 * Texto em linha (dentro de um parágrafo, título, item ou célula). Ordem: código, marcadores, links, escape, negrito e itálico. O que já
 * virou HTML fica guardado em fichas (`\uE000n\uE001`) para os passos seguintes não mexerem (por exemplo, `_` dentro de um endereço).
 */
function emLinha(texto, ctx) {
  const guardados = [];
  const guardar = (entrada) => {
    guardados.push(typeof entrada === 'string' ? { html: entrada, htmlPlano: entrada } : entrada);
    return `\uE000${guardados.length - 1}\uE001`;
  };
  const restaurar = (t, plano) => {
    let s = t;
    for (let volta = 0; volta < 8 && s.includes('\uE000'); volta++) s = s.replace(TOKEN, (_, i) => (plano ? guardados[i].htmlPlano : guardados[i].html));
    return s;
  };
  const formatar = (t) =>
    esc(t)
      .replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, '<strong>$1</strong>')
      .replace(/(?<![\p{L}\p{N}_])__(?=\S)([\s\S]*?\S)__(?![\p{L}\p{N}_])/gu, '<strong>$1</strong>')
      .replace(/\*(?=[^\s*])([^*]*?[^\s*])\*/g, '<em>$1</em>')
      .replace(/(?<![\p{L}\p{N}_])_(?=[^\s_])([^_]*?[^\s_])_(?![\p{L}\p{N}_])/gu, '<em>$1</em>');

  let t = nfc(texto);
  // 1. código em linha
  t = t.replace(/(`+)([\s\S]*?[^`])\1(?!`)/g, (_, _a, c) => guardar(`<code>${esc(c.trim())}</code>`));
  // 2. marcadores
  t = t.replace(new RegExp(FONTE_MARCADOR, 'g'), (m) => guardar(expandirMarcador(m, ctx.valores)));
  // 3. imagens (viram o texto alternativo: o site não carrega imagem de Markdown), links [texto](endereço) e <endereço>
  t = t.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (_, alt) => guardar(restaurar(formatar(alt), true)));
  t = t.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (_, rotulo, destino) => {
    const bruto = textoDoDestino(destino, guardados);
    if (/^(javascript|data|vbscript):/i.test(bruto)) return guardar(restaurar(formatar(rotulo), true));
    const url = ctx.reescrever(bruto);
    const externo = /^https?:/i.test(url);
    return guardar(`<a href="${esc(url)}"${externo ? ' rel="noopener noreferrer"' : ''}>${restaurar(formatar(rotulo), true)}</a>`);
  });
  t = t.replace(/<((?:https?:\/\/|mailto:)[^\s>]+)>/g, (_, url) => guardar(`<a href="${esc(url)}"${/^https?:/i.test(url) ? ' rel="noopener noreferrer"' : ''}>${esc(url)}</a>`));
  // 4. escape, negrito e itálico no que sobrou
  t = formatar(t);
  return restaurar(t, false);
}

/** O endereço de um link com as fichas trocadas pelo texto puro (o valor do marcador, ou o próprio marcador). */
function textoDoDestino(destino, guardados) {
  return destino.replace(TOKEN, (_, i) => guardados[i].texto ?? '');
}

/** Cria o contexto de conversão: valores dos marcadores, mapa de links e prefixo das âncoras. */
function contexto(opcoes = {}) {
  const prefixo = opcoes.prefixoId || '';
  const mapa = opcoes.mapaLinks || {};
  return {
    valores: opcoes.valores || {},
    rebaixarH1: Boolean(opcoes.rebaixarH1),
    prefixoId: prefixo,
    ids: new Set(),
    titulos: [],
    /** Troca o destino de um link: arquivo `.md` conhecido vira a página; `#âncora` ganha o prefixo do documento. */
    reescrever(url) {
      if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return url;
      const [base, ancora] = url.split('#');
      if (!base && ancora !== undefined) return `#${prefixo}${ancora}`;
      const nome = path.posix.basename(base || '');
      if (nome.endsWith('.md') && Object.prototype.hasOwnProperty.call(mapa, nome)) {
        const alvo = mapa[nome];
        return ancora !== undefined && !alvo.startsWith('#') ? `${alvo}#${ancora}` : alvo;
      }
      return url;
    },
  };
}

const RE_ITEM = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
const RE_TITULO = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const RE_REGUA = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/;
const RE_CERCA = /^\s{0,3}(```|~~~)\s*([\w-]*)\s*$/;
const RE_SEPARADOR_TABELA = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;

const recuo = (s) => /^\s*/.exec(s)[0].replace(/\t/g, '    ').length;

function celulasDaLinha(linha) {
  let s = linha.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
  const celulas = [];
  let atual = '';
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\' && s[i + 1] === '|') {
      atual += '|';
      i++;
    } else if (s[i] === '|') {
      celulas.push(atual.trim());
      atual = '';
    } else atual += s[i];
  }
  celulas.push(atual.trim());
  return celulas;
}

function comecaTabela(linhas, i) {
  return linhas[i] !== undefined && linhas[i].includes('|') && linhas[i + 1] !== undefined && RE_SEPARADOR_TABELA.test(linhas[i + 1]) && linhas[i + 1].includes('-') && (linhas[i + 1].includes('|') || linhas[i].trim().startsWith('|'));
}

function converterTabela(linhas, i, ctx) {
  const cabecalho = celulasDaLinha(linhas[i]);
  const alinhamentos = celulasDaLinha(linhas[i + 1]).map((c) => (/^:-+:$/.test(c) ? 'alinha-c' : /^-+:$/.test(c) ? 'alinha-d' : ''));
  let j = i + 2;
  const corpo = [];
  while (j < linhas.length && linhas[j].trim() !== '' && linhas[j].includes('|')) corpo.push(celulasDaLinha(linhas[j++]));
  const classe = (k) => (alinhamentos[k] ? ` class="${alinhamentos[k]}"` : '');
  const th = cabecalho.map((c, k) => `<th scope="col"${classe(k)}>${emLinha(c, ctx)}</th>`).join('');
  const linhasHtml = corpo
    .map((celulas) => {
      const tds = cabecalho.map((rotulo, k) => `<td data-rotulo="${esc(textoPuro(rotulo))}"${classe(k)}>${emLinha(celulas[k] ?? '', ctx)}</td>`).join('');
      return `<tr>${tds}</tr>`;
    })
    .join('');
  return { html: `<div class="tabela"><table><thead><tr>${th}</tr></thead><tbody>${linhasHtml}</tbody></table></div>`, proximo: j };
}

function converterLista(linhas, ctx) {
  const m0 = RE_ITEM.exec(linhas[0]);
  const base = recuo(linhas[0]);
  const listas = [];
  let lista = null;
  let item = null;
  for (const linha of linhas) {
    const m = RE_ITEM.exec(linha);
    if (m && recuo(linha) <= base) {
      const ordenada = /\d/.test(m[2]);
      if (!lista || lista.ordenada !== ordenada) {
        lista = { ordenada, inicio: ordenada ? parseInt(m[2], 10) : 1, itens: [] };
        listas.push(lista);
      }
      item = { texto: m[3], sub: [] };
      lista.itens.push(item);
    } else if (item) {
      if (item.sub.length > 0 || RE_ITEM.test(linha)) item.sub.push(linha);
      else item.texto += ` ${linha.trim()}`;
    }
  }
  void m0;
  return listas
    .map((l) => {
      const tag = l.ordenada ? 'ol' : 'ul';
      const inicio = l.ordenada && l.inicio !== 1 ? ` start="${l.inicio}"` : '';
      const itens = l.itens.map((it) => `<li>${emLinha(it.texto, ctx)}${it.sub.length ? converterLista(it.sub, ctx) : ''}</li>`).join('');
      return `<${tag}${inicio}>${itens}</${tag}>`;
    })
    .join('');
}

function converterBlocos(linhas, ctx) {
  const saida = [];
  let i = 0;
  // Como no CommonMark, um item de lista só interrompe um parágrafo se for marcador ou numeração que começa em 1 ("2026. Texto" é texto).
  const interrompe = (l) => {
    const m = RE_ITEM.exec(l);
    return Boolean(m) && (!/\d/.test(m[2]) || /^\s*1[.)]/.test(l));
  };
  const comecaBloco = (k) => {
    const l = linhas[k];
    return RE_TITULO.test(l) || RE_REGUA.test(l) || RE_CERCA.test(l) || /^\s{0,3}>/.test(l) || interrompe(l) || comecaTabela(linhas, k);
  };
  while (i < linhas.length) {
    const linha = linhas[i];
    if (linha.trim() === '') {
      i++;
      continue;
    }
    const cerca = RE_CERCA.exec(linha);
    if (cerca) {
      const codigo = [];
      i++;
      while (i < linhas.length && !linhas[i].trim().startsWith(cerca[1])) codigo.push(linhas[i++]);
      i++;
      saida.push(`<pre><code>${esc(codigo.join('\n'))}</code></pre>`);
      continue;
    }
    const titulo = RE_TITULO.exec(linha);
    if (titulo) {
      let nivel = Math.min(titulo[1].length, 4);
      if (nivel === 1 && ctx.rebaixarH1) nivel = 2;
      const base = ctx.prefixoId + slug(titulo[2]);
      let id = base;
      for (let n = 2; ctx.ids.has(id); n++) id = `${base}-${n}`;
      ctx.ids.add(id);
      ctx.titulos.push({ nivel, texto: textoPuro(titulo[2]), id });
      saida.push(`<h${nivel} id="${esc(id)}">${emLinha(titulo[2], ctx)}</h${nivel}>`);
      i++;
      continue;
    }
    if (RE_REGUA.test(linha)) {
      saida.push('<hr>');
      i++;
      continue;
    }
    if (/^\s{0,3}>/.test(linha)) {
      const citacao = [];
      while (i < linhas.length && /^\s{0,3}>/.test(linhas[i])) citacao.push(linhas[i++].replace(/^\s{0,3}>\s?/, ''));
      saida.push(`<blockquote>${converterBlocos(citacao, ctx)}</blockquote>`);
      continue;
    }
    if (comecaTabela(linhas, i)) {
      const t = converterTabela(linhas, i, ctx);
      saida.push(t.html);
      i = t.proximo;
      continue;
    }
    if (RE_ITEM.test(linha)) {
      const itens = [];
      while (i < linhas.length) {
        const l = linhas[i];
        if (l.trim() === '') {
          const seguinte = linhas.slice(i + 1).find((x) => x.trim() !== '');
          if (seguinte !== undefined && (RE_ITEM.test(seguinte) || recuo(seguinte) >= 2) && !RE_REGUA.test(seguinte)) {
            i++;
            continue;
          }
          break;
        }
        if (RE_ITEM.test(l) ? !RE_REGUA.test(l) : recuo(l) >= 2) itens.push(l);
        else break;
        i++;
      }
      saida.push(converterLista(itens, ctx));
      continue;
    }
    const paragrafo = [];
    while (i < linhas.length && linhas[i].trim() !== '' && (paragrafo.length === 0 || !comecaBloco(i))) paragrafo.push(linhas[i++]);
    const html = paragrafo
      .map((l, k) => {
        const quebra = /( {2,}|\\)$/.test(l) && k < paragrafo.length - 1;
        return emLinha(l.replace(/( {2,}|\\)$/, '').trim(), ctx) + (quebra ? '<br>' : k < paragrafo.length - 1 ? ' ' : '');
      })
      .join('');
    saida.push(`<p>${html}</p>`);
  }
  return saida.join('\n');
}

/**
 * Markdown em HTML. Opções: `valores` (os dados da empresa, por nome de marcador), `rebaixarH1` (um `#` vira `h2`, para a página ter um só `h1`),
 * `prefixoId` (prefixo das âncoras, para juntar vários documentos numa página) e `mapaLinks` (nome de arquivo `.md` em destino do link).
 */
function markdownParaHtml(md, opcoes = {}) {
  const ctx = contexto(opcoes);
  return converterBlocos(nfc(md).replace(/\r\n?/g, '\n').split('\n'), ctx);
}

/** Os títulos (nível, texto e âncora) que a conversão produz, na ordem. */
function titulosDoMarkdown(md, opcoes = {}) {
  const ctx = contexto(opcoes);
  converterBlocos(nfc(md).replace(/\r\n?/g, '\n').split('\n'), ctx);
  return ctx.titulos;
}

/** Tira o primeiro `# Título` do Markdown e devolve o título e o resto (que a página mostra depois do `h1` próprio). */
function separarTitulo(md) {
  const linhas = nfc(md).replace(/\r\n?/g, '\n').split('\n');
  let cerca = false;
  for (let i = 0; i < linhas.length; i++) {
    if (RE_CERCA.test(linhas[i])) cerca = !cerca;
    const m = !cerca && /^#\s+(.*?)\s*#*\s*$/.exec(linhas[i]);
    if (m) return { titulo: m[1], corpo: [...linhas.slice(0, i), ...linhas.slice(i + 1)].join('\n') };
  }
  return { titulo: null, corpo: linhas.join('\n') };
}

/** Problemas de títulos em um HTML: nenhum ou mais de um `h1`, ou um título que pula de nível (de `h2` direto para `h4`, por exemplo). */
function problemasDeTitulos(html) {
  const niveis = [...html.matchAll(/<h([1-6])[\s>]/g)].map((m) => Number(m[1]));
  const problemas = [];
  const h1 = niveis.filter((n) => n === 1).length;
  if (h1 !== 1) problemas.push(`${h1} elementos h1 (deve haver um só)`);
  niveis.forEach((n, k) => {
    const anterior = k === 0 ? 0 : niveis[k - 1];
    if (n > anterior + 1) problemas.push(`o título h${n} vem depois de ${anterior === 0 ? 'nada' : `h${anterior}`} (pula de nível)`);
  });
  return problemas;
}

/** Os valores que o JSON da empresa traz, completos (marcador sem valor fica vazio) e com os avisos de chave desconhecida. */
function lerDados(arquivo) {
  const dados = Object.fromEntries(MARCADORES.map((m) => [m, '']));
  const avisos = [];
  if (!fs.existsSync(arquivo)) {
    avisos.push(`${path.relative(RAIZ, arquivo)} não existe: todos os marcadores ficam sem valor`);
    return { dados, avisos };
  }
  let json;
  try {
    json = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
  } catch (e) {
    throw new Error(`${path.relative(RAIZ, arquivo)} não é um JSON válido: ${e.message}`);
  }
  for (const [k, v] of Object.entries(json)) {
    const nome = nfc(k);
    if (nome.startsWith('_')) continue;
    if (!MARCADORES.includes(nome)) avisos.push(`${path.relative(RAIZ, arquivo)}: a chave "${k}" não é um marcador conhecido (${MARCADORES.join(', ')})`);
    else if (typeof v !== 'string') avisos.push(`${path.relative(RAIZ, arquivo)}: o valor de "${k}" deve ser texto`);
    else dados[nome] = v.trim();
  }
  return { dados, avisos };
}

/** Texto de produto sem travessão e sem a expressão proibida (CLAUDE.md): o gerador avisa em qual linha de qual arquivo. */
function avisosDeRedacao(texto, nome) {
  const avisos = [];
  texto.split(/\r?\n/).forEach((linha, k) => {
    if (/[\u2013\u2014]/.test(linha)) avisos.push(`${nome}, linha ${k + 1}: travessão (a redação do produto não usa)`);
    if (/faz\w*\s+sentido/i.test(linha)) avisos.push(`${nome}, linha ${k + 1}: expressão proibida pela orientação do projeto`);
  });
  return avisos;
}

// ------------------------------------------------------------------------------------------------------------------------------
// Estilo
// ------------------------------------------------------------------------------------------------------------------------------

const CSS = `/* Gerado por scripts/gerar-site.js: não edite à mão. Identidade: azul #2457F5, lima #D4F05B, texto #17223B. */
@font-face{font-family:Manrope;font-weight:500;font-style:normal;font-display:swap;src:url(fontes/Manrope_500Medium.ttf) format("truetype")}
@font-face{font-family:Manrope;font-weight:700;font-style:normal;font-display:swap;src:url(fontes/Manrope_700Bold.ttf) format("truetype")}
@font-face{font-family:Manrope;font-weight:800;font-style:normal;font-display:swap;src:url(fontes/Manrope_800ExtraBold.ttf) format("truetype")}

:root{
  --azul:#2457F5;
  --lima:#D4F05B;
  --sobre-lima:#17223B;
  --topo:#2457F5;
  --sobre-topo:#FFFFFF;
  --sobre-topo-suave:#EEF2FF;
  --foco-topo:#D4F05B;
  --texto:#17223B;
  --texto-2:#4B5873;
  --fundo:#F6F8FC;
  --superficie:#FFFFFF;
  --azul-claro:#EAF0FF;
  --lima-claro:#F2FAD0;
  --linha:#E3E8F2;
  --contorno:#7D8AA6;
  --link:#2457F5;
  --foco:#2457F5;
}
@media (prefers-color-scheme: dark){
  :root{
    --topo:#1D47CC;
    --texto:#EEF2FF;
    --texto-2:#B8C3DD;
    --fundo:#0E1526;
    --superficie:#17223B;
    --azul-claro:#1B2A55;
    --lima-claro:#27321A;
    --linha:#2B3857;
    --contorno:#8C99B6;
    --link:#9DB7FF;
    --foco:#9DB7FF;
  }
}

*,*::before,*::after{box-sizing:border-box}
html{-webkit-text-size-adjust:100%;text-size-adjust:100%;color-scheme:light dark}
body{margin:0;background:var(--fundo);color:var(--texto);font-family:Manrope,system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;font-weight:500;font-size:1rem;line-height:1.65;overflow-wrap:break-word}
img,svg{max-width:100%;height:auto}
a{color:var(--link);text-decoration:underline;text-underline-offset:.18em}
a:hover{text-decoration-thickness:2px}
:focus-visible{outline:3px solid var(--foco);outline-offset:3px;border-radius:4px}
.topo :focus-visible,.capa :focus-visible,.rodape :focus-visible{outline-color:var(--foco-topo)}
.rodape :focus-visible{outline-color:var(--foco)}
main:focus{outline:none}
.miolo{width:100%;max-width:72rem;margin:0 auto;padding-left:16px;padding-right:16px}
@media (min-width:48rem){.miolo{padding-left:24px;padding-right:24px}}

.pular{position:absolute;left:16px;top:-5rem;z-index:10;padding:.6rem 1rem;background:var(--lima);color:var(--sobre-lima);font-weight:700;border-radius:0 0 12px 12px;text-decoration:none}
.pular:focus{top:0}

.faixa{background:var(--lima);color:var(--sobre-lima);border-bottom:2px solid var(--sobre-lima);font-size:.9375rem;line-height:1.45}
.faixa p{margin:0;padding:.55rem 0}
.faixa strong{font-weight:800}

.topo{background:var(--topo);color:var(--sobre-topo)}
.topo .miolo{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:.25rem 1.5rem;padding-top:12px;padding-bottom:8px}
.marca{display:inline-flex;align-items:center;min-height:44px;padding:4px 0}
.marca img{display:block;height:28px;width:auto}
.menu ul,.rodape ul{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:0 .25rem}
.menu a{display:inline-flex;align-items:center;min-height:44px;padding:0 .6rem;color:var(--sobre-topo);font-weight:700;font-size:.9375rem;text-decoration:none;border-radius:10px}
.menu a:hover{text-decoration:underline;text-underline-offset:.2em}
.menu a[aria-current="page"]{text-decoration:underline;text-decoration-thickness:3px;text-decoration-color:var(--lima);text-underline-offset:.3em}

.capa{background:var(--topo);color:var(--sobre-topo);padding:1.5rem 0 3rem;border-radius:0 0 28px 28px}
.capa h1{margin:0 0 .75rem;font-weight:800;font-size:clamp(1.9rem,6.2vw,3rem);line-height:1.15;letter-spacing:-.01em;max-width:22ch}
.capa .lead{margin:0 0 1.25rem;max-width:42rem;font-size:1.125rem;color:var(--sobre-topo-suave)}
.capa a{color:var(--sobre-topo)}
.acoes{display:flex;flex-wrap:wrap;gap:.75rem;margin:1.25rem 0 .75rem}
.botao{display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:0 1.25rem;border-radius:999px;font-weight:800;text-decoration:none;border:2px solid transparent}
.capa .botao-principal,.botao-principal{background:var(--lima);color:var(--sobre-lima)}
.capa .botao-suave,.botao-suave{border-color:var(--sobre-topo);color:var(--sobre-topo)}
.botao:hover{text-decoration:underline;text-underline-offset:.2em}
.lojas{margin:.5rem 0 0;color:var(--sobre-topo-suave);font-size:.9375rem}

.conteudo{padding-top:2rem;padding-bottom:3rem}
.secao{margin:0 0 2.5rem}
h2{margin:2.25rem 0 .75rem;font-weight:800;font-size:clamp(1.35rem,4vw,1.75rem);line-height:1.25}
h3{margin:1.5rem 0 .5rem;font-weight:700;font-size:1.1875rem;line-height:1.35}
h4{margin:1.25rem 0 .4rem;font-weight:700;font-size:1.0625rem;line-height:1.4}
.secao>h2:first-child{margin-top:0}
p,ul,ol,blockquote,pre,.tabela{margin:0 0 1rem}
ul,ol{padding-left:1.4rem}
li{margin:.3rem 0}
li>ul,li>ol{margin:.3rem 0 .5rem}
hr{border:0;border-top:1px solid var(--linha);margin:2rem 0}
strong{font-weight:700}
code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:.9em;background:var(--azul-claro);padding:.1em .35em;border-radius:6px}
pre{background:var(--azul-claro);padding:1rem;border-radius:12px;overflow-x:auto}
pre code{background:none;padding:0}
blockquote{border-left:4px solid var(--azul);background:var(--azul-claro);padding:.75rem 1rem;border-radius:0 12px 12px 0}
blockquote>:last-child{margin-bottom:0}

.texto{max-width:46rem}
.grade{display:grid;gap:1rem;grid-template-columns:repeat(auto-fit,minmax(min(16rem,100%),1fr))}
.cartao{background:var(--superficie);border:1px solid var(--linha);border-radius:20px;padding:1.25rem}
.cartao h3{margin-top:0}
.cartao p:last-child,.cartao ul:last-child{margin-bottom:0}
.destaque{background:var(--lima-claro);border:2px solid var(--lima);border-radius:20px;padding:1.5rem}
.destaque h2{margin-top:0}
.destaque p:last-child{margin-bottom:0}
.nao-e{list-style:none;padding:0}
.nao-e li{background:var(--superficie);border:1px solid var(--linha);border-radius:14px;padding:.75rem 1rem}
.nota{color:var(--texto-2)}
.duvida h3{margin-top:1.75rem}

.tabela table{width:100%;border-collapse:collapse;font-size:.9375rem}
.tabela th,.tabela td{padding:.6rem .75rem;border-bottom:1px solid var(--linha);text-align:left;vertical-align:top}
.tabela thead th{background:var(--azul-claro);font-weight:700}
.alinha-d{text-align:right!important}
.alinha-c{text-align:center!important}
@media (max-width:40rem){
  .tabela thead{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
  .tabela table,.tabela tbody,.tabela tr,.tabela td{display:block;width:100%}
  .tabela tr{background:var(--superficie);border:1px solid var(--linha);border-radius:14px;margin:0 0 .75rem;padding:.35rem 0}
  .tabela td{border:0;padding:.35rem .9rem;text-align:left!important}
  .tabela td::before{content:attr(data-rotulo);display:block;font-weight:700;font-size:.875rem;color:var(--texto-2)}
}

mark.pendente{background:var(--lima);color:var(--sobre-lima);padding:0 .25em;border-radius:5px;font-weight:700;text-decoration:underline dotted;text-underline-offset:.2em}

.rodape{background:var(--superficie);border-top:1px solid var(--linha);padding:1.5rem 0 2rem;color:var(--texto-2);font-size:.9375rem}
.rodape a{display:inline-flex;align-items:center;min-height:44px;padding:0 .6rem 0 0;margin-right:.35rem;color:var(--link);font-weight:700}
.rodape p{margin:.5rem 0 0}

@media print{
  .pular,.menu{display:none}
  body{background:#fff;color:#000}
  .topo,.capa{background:#fff;color:#000;border-radius:0}
  .capa h1,.capa .lead,.capa a{color:#000}
  .marca img{filter:invert(1)}
}
`;

// ------------------------------------------------------------------------------------------------------------------------------
// Páginas
// ------------------------------------------------------------------------------------------------------------------------------

function menuHtml(atual) {
  const itens = MENU.map((p) => `<li><a href="${p.arquivo}"${p.arquivo === atual ? ' aria-current="page"' : ''}>${esc(p.rotulo)}</a></li>`).join('');
  return `<nav class="menu" aria-label="Principal"><ul>${itens}</ul></nav>`;
}

/** Troca os marcadores em um trecho de HTML escrito à mão (os modelos do script): o marcador só aparece em texto, nunca em atributo. */
function marcadoresEmHtml(html, valores) {
  return html.replace(new RegExp(FONTE_MARCADOR, 'g'), (m) => expandirMarcador(m, valores).html);
}

/**
 * Uma página completa. `fonte` é o texto original (Markdown ou modelo) onde se procuram os marcadores que faltam; o rodapé entra na conta.
 * `capa`: `{ h1, lead, extra }` (HTML do `h1` já pronto); `corpo`: HTML do conteúdo, dentro do miolo.
 */
function montarPagina({ arquivo, titulo, descricao, capa, corpo, fonte, valores, classeCorpo = 'texto' }) {
  const pendencias = pendenciasDoTexto(`${fonte}\n${RODAPE_LEGAL}`, valores);
  const faixa = pendencias.length
    ? `<div class="faixa" role="note"><div class="miolo"><p><strong>Versão preliminar, em revisão.</strong> Este texto ainda não vale como versão final: os trechos destacados serão preenchidos antes da publicação.</p></div></div>\n`
    : '';
  const robots = pendencias.length ? '<meta name="robots" content="noindex">\n' : '';
  const rodape = marcadoresEmHtml(esc(RODAPE_LEGAL), valores);
  const rodapeMenu = MENU.map((p) => `<li><a href="${p.arquivo}">${esc(p.rotulo)}</a></li>`).join('');
  const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(titulo)}</title>
<meta name="description" content="${esc(descricao)}">
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="#2457F5">
<meta name="referrer" content="no-referrer">
${robots}<link rel="icon" href="favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="marca/icone-app.png">
<link rel="stylesheet" href="estilo.css">
</head>
<body>
<a class="pular" href="#conteudo">Pular para o conteúdo</a>
${faixa}<header class="topo">
<div class="miolo">
<a class="marca" href="index.html"><img src="marca/clarevo-logotipo-reverso.svg" alt="Clarevo, página inicial" width="140" height="28"></a>
${menuHtml(arquivo)}
</div>
</header>
<main id="conteudo" tabindex="-1">
<section class="capa">
<div class="miolo">
${capa}
</div>
</section>
<div class="miolo conteudo">
<div class="${classeCorpo}">
${corpo}
</div>
</div>
</main>
<footer class="rodape">
<div class="miolo">
<nav aria-label="Rodapé"><ul>${rodapeMenu}</ul></nav>
<p>${rodape}</p>
</div>
</footer>
</body>
</html>
`;
  return { html, pendencias };
}

const DESCRICAO_INDEX = 'O Clarevo é um organizador de finanças pessoais e da família. Anote gastos e recebimentos, acompanhe contas a pagar e cartões e aprenda o essencial.';

function paginaInicial(valores) {
  const fonte = `
<section class="secao" aria-labelledby="faz">
<h2 id="faz">O que o Clarevo faz</h2>
<div class="grade">
<article class="cartao">
<h3>O mês em um só lugar</h3>
<p>O Resumo mostra Recebido, Pago, a diferença entre os dois e o que ainda falta pagar, com a explicação de cada número. Anotar um gasto ou um recebimento leva poucos toques.</p>
</article>
<article class="cartao">
<h3>Contas, cartões e gastos fixos</h3>
<p>Contas a pagar com vencimentos e lembretes no aparelho. Cartões de crédito com faturas e limite usado: o app guarda só o apelido e, se você quiser, os 4 últimos dígitos, nunca o número inteiro. Gastos fixos, parcelamentos e contas do ano, como IPVA e IPTU, aparecem sozinhos nos meses certos.</p>
</article>
<article class="cartao">
<h3>Metas e reserva</h3>
<p>Metas e reserva para imprevistos, com um plano de guardar que mostra as etapas e o mês previsto, sem contar rendimento.</p>
</article>
<article class="cartao">
<h3>Aprender e simular</h3>
<p>Explicações curtas sobre juros, taxas e contas do dia a dia, cada uma com fonte e data de revisão. O simulador e as calculadoras usam só os números que você digita.</p>
</article>
</div>
</section>

<section class="secao" aria-labelledby="para-quem">
<h2 id="para-quem">Para quem é</h2>
<div class="grade">
<article class="cartao">
<h3>Para pessoas</h3>
<p>Use o Clarevo para entender para onde o dinheiro do mês foi e o que ainda vai vencer. Tudo o que aparece no app foi anotado ou importado por você, e é você quem decide o que registrar.</p>
<p>Dá para criar uma Família de até 6 pessoas, com convite por link, e sair ou encerrar quando quiser.</p>
</article>
<article class="cartao">
<h3>Para empresas</h3>
<p>A empresa pode oferecer o Clarevo como benefício. O painel das empresas existe só na web e mostra vagas, convites e licenças ativas ou encerradas.</p>
<p>Para conhecer o benefício, escreva para [E-MAIL DE SUPORTE].</p>
</article>
</div>
</section>

<section class="secao destaque" aria-labelledby="empresa-nao-ve">
<h2 id="empresa-nao-ve">A empresa nunca vê suas finanças</h2>
<p>Se a sua empresa oferece o Clarevo, ela só sabe quem recebeu a licença e se ela está ativa ou encerrada. Nunca vê gastos, recebimentos, valores, categorias, metas, contas, cartões nem o que você faz no app, e também não vê números somados.</p>
<p>Se o benefício terminar, sua conta e seu histórico não são apagados.</p>
</section>

<section class="secao" aria-labelledby="nao-e">
<h2 id="nao-e">O que o Clarevo não é</h2>
<ul class="nao-e">
<li>Não é banco e não guarda o seu dinheiro.</li>
<li>Não movimenta dinheiro: não faz pagamentos nem transferências.</li>
<li>Não oferece crédito.</li>
<li>Não recomenda produtos financeiros.</li>
<li>Não se conecta a contas bancárias.</li>
</ul>
<p class="nota">O Clarevo é uma ferramenta de organização e de educação financeira. As simulações são exemplos feitos com os números que você digita e não garantem resultado.</p>
</section>

<section class="secao" aria-labelledby="dados">
<h2 id="dados">Seus dados</h2>
<p>Sem anúncios, sem venda de dados e sem rastreamento. A conexão é protegida. Você exclui a sua conta e os seus dados quando quiser: dentro do app, em Conta, ou pela página <a href="excluir-conta.html">Excluir conta</a>. Os detalhes estão na <a href="privacidade.html">Política de privacidade</a>.</p>
</section>

<section class="secao" aria-labelledby="contato">
<h2 id="contato">Contato</h2>
<p>Dúvidas, pedidos e contato de empresas: [E-MAIL DE SUPORTE]. Veja também a página de <a href="suporte.html">Suporte</a>.</p>
</section>`;
  const capa = `<h1>Organize seu mês e aprenda</h1>
<p class="lead">O Clarevo é um organizador de finanças pessoais e da família. Você anota o que recebe e o que paga, e o app mostra quanto entrou, quanto saiu e quanto ainda vai vencer, cada coisa separada da outra. Pode ser oferecido pela empresa como benefício.</p>
<div class="acoes">
<a class="botao botao-principal" href="${URL_APP}" rel="noopener noreferrer">Abrir a versão web</a>
<a class="botao botao-suave" href="suporte.html">Falar com o suporte</a>
</div>
<p class="lojas">Em breve na App Store e no Google Play.</p>`;
  return montarPagina({
    arquivo: 'index.html',
    titulo: 'Clarevo: organize seu mês e aprenda',
    descricao: DESCRICAO_INDEX,
    capa,
    corpo: marcadoresEmHtml(fonte, valores),
    fonte: fonte + capa,
    valores,
    classeCorpo: 'inicio',
  });
}

function paginaSuporte(valores) {
  const duvidas = [
    ['Esqueci minha senha. O que faço?', 'Na tela de entrada, toque em "Esqueci minha senha", informe o e-mail da conta e abra o link que chegar por e-mail para definir uma nova senha. A resposta do app é a mesma exista ou não uma conta com aquele endereço. Se o e-mail não chegar, olhe a caixa de spam e tente de novo depois de alguns instantes.'],
    ['Como excluo minha conta e meus dados?', 'No app, abra Conta e, no último item, toque em "Excluir minha conta". Para confirmar, digite EXCLUIR. A exclusão é definitiva: você perde o acesso na hora e não dá para desfazer. Quem é titular de uma Família com outras pessoas precisa antes passar a titularidade ou remover as pessoas. Também dá para pedir pela página <a href="excluir-conta.html">Excluir conta</a>.'],
    ['Como funciona a Família?', 'A Família reúne até 6 pessoas. Quem cria é a pessoa titular e convida as outras por um link de uso único, válido por 7 dias, com o papel de quem anota e vê ou de quem só vê. O Pessoal de cada pessoa continua separado e nunca é copiado para a Família. Quem quiser pode sair, e a pessoa titular pode encerrar a Família.'],
    ['Recebi o Clarevo da minha empresa. Como ativo o benefício?', 'A empresa envia um link de convite, de uso único. Abra o link, entre ou crie a sua conta e siga as instruções na tela. Se o benefício terminar, você mantém o acesso completo por 30 dias e depois passa para o plano gratuito, com leitura do histórico. Nada é apagado.'],
    ['O que a minha empresa vê?', 'Só quem recebeu a licença e se ela está ativa ou encerrada, com as datas. A empresa nunca vê gastos, recebimentos, valores, categorias, metas, contas, cartões, Família nem números somados, e também não vê o que você faz no app.'],
    ['Onde ficam os meus dados?', 'Em um serviço de banco de dados e de autenticação, em servidores na região de São Paulo, com conexão protegida e regras de acesso que valem no próprio banco. O app não guarda o número completo do cartão, o código de segurança, a validade nem fotos de notas fiscais. Os detalhes estão na <a href="privacidade.html">Política de privacidade</a>.'],
    ['O Clarevo se conecta ao meu banco?', 'Não. Tudo o que aparece no app foi anotado por você ou importado de um arquivo de extrato ou de fatura (OFX ou CSV) que você escolhe e confere linha por linha antes de gravar.'],
    ['Posso levar meus dados comigo?', 'Pode. No app, é possível exportar os seus dados em CSV ou em PDF.'],
  ];
  const faq = duvidas.map(([p, r]) => `<h3>${esc(p)}</h3>\n<p>${r}</p>`).join('\n');
  const fonte = `
<section class="secao" aria-labelledby="contato">
<h2 id="contato">Como falar com o suporte</h2>
<ul>
<li>Suporte do app: [E-MAIL DE SUPORTE]</li>
<li>Dúvidas sobre dados pessoais (acesso, correção e exclusão): [E-MAIL DE PRIVACIDADE]</li>
<li>Responsável pelo Clarevo: [RAZÃO SOCIAL], CNPJ [CNPJ]</li>
<li>Endereço: [ENDEREÇO]</li>
</ul>
<p>Para facilitar a resposta, conte o e-mail da sua conta, o aparelho (iPhone, Android ou navegador) e o que aconteceu. Não envie sua senha, número de cartão, dados bancários nem fotos de documentos: o suporte nunca pede essas informações.</p>
<p>Sobre como tratamos os seus dados, leia a <a href="privacidade.html">Política de privacidade</a>.</p>
</section>

<section class="secao duvida" aria-labelledby="perguntas">
<h2 id="perguntas">Perguntas frequentes</h2>
${faq}
</section>`;
  const capa = `<h1>Suporte</h1>
<p class="lead">Como falar com a equipe do Clarevo e respostas para as dúvidas mais comuns.</p>`;
  return montarPagina({
    arquivo: 'suporte.html',
    titulo: 'Suporte · Clarevo',
    descricao: 'Como falar com o suporte do Clarevo e respostas para as perguntas mais frequentes.',
    capa,
    corpo: marcadoresEmHtml(fonte, valores),
    fonte,
    valores,
  });
}

/** Uma página legal a partir do Markdown, ou o espaço reservado (com `[A DEFINIR: ...]`) enquanto o texto não existir. */
function paginaLegal(pagina, md, valores) {
  const avisos = [];
  let fonte = md;
  if (md === null) {
    fonte = `# ${pagina.titulo}\n\nEste texto está em revisão e será publicado nesta página. [A DEFINIR: texto desta página, que vem de docs/legal/${pagina.md}]\n`;
  }
  const { titulo, corpo } = separarTitulo(fonte);
  if (titulo === null) avisos.push(`docs/legal/${pagina.md}: não tem título "# ..." (usei "${pagina.titulo}")`);
  const h1 = titulo ?? pagina.titulo;
  const capa = `<h1>${emLinha(h1, contexto({ valores }))}</h1>`;
  const html = markdownParaHtml(corpo, { valores, rebaixarH1: true, mapaLinks: MAPA_LINKS_SITE });
  const pg = montarPagina({
    arquivo: pagina.arquivo,
    titulo: `${textoPuro(h1)} · Clarevo`,
    descricao: pagina.descricao,
    capa,
    corpo: html,
    fonte,
    valores,
  });
  return { ...pg, avisos };
}

/** Todos os endereços relativos (`href` e `src`) de uma página, e se cada arquivo e cada âncora existem entre as páginas geradas. */
function linksQuebrados(arquivos) {
  const problemas = [];
  const paginas = [...arquivos.keys()].filter((k) => k.endsWith('.html'));
  const idsDe = (html) => new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  for (const nome of paginas) {
    const html = String(arquivos.get(nome));
    for (const m of html.matchAll(/\s(?:href|src)="([^"]*)"/g)) {
      const url = m[1].replace(/&amp;/g, '&');
      if (/^[a-z][a-z0-9+.-]*:/i.test(url)) continue;
      const [alvo, ancora] = url.split('#');
      const destino = alvo === '' ? nome : path.posix.normalize(path.posix.join(path.posix.dirname(nome), alvo));
      if (!arquivos.has(destino)) {
        problemas.push(`${nome}: "${url}" aponta para um arquivo que não existe`);
        continue;
      }
      if (ancora && destino.endsWith('.html') && !idsDe(String(arquivos.get(destino))).has(ancora)) problemas.push(`${nome}: "${url}" aponta para uma âncora que não existe`);
    }
  }
  return problemas;
}

const CABECALHOS = `# Gerado por scripts/gerar-site.js. Cloudflare Pages lê este arquivo e não o publica.
# Nenhum recurso de fora é permitido: o site não carrega fontes, imagens, scripts nem estilos de outros endereços.
/*
  Content-Security-Policy: default-src 'none'; img-src 'self'; style-src 'self'; font-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: no-referrer
  Permissions-Policy: camera=(), microphone=(), geolocation=(), interest-cohort=()
`;

/**
 * Gera todos os arquivos do site em memória: `Map` de caminho (relativo a `site/`) em texto ou `Buffer`.
 * `legal`: pasta dos Markdown. `dados`: valores dos marcadores, ou `arquivoDados`: o JSON de onde lê (padrão: `site/dados-da-empresa.json`).
 * Devolve também `avisos` e `pendencias` (por página, os marcadores que ainda faltam).
 */
function gerarSite({ raiz = RAIZ, legal = path.join(raiz, 'docs', 'legal'), dados, arquivoDados } = {}) {
  const avisos = [];
  const arquivos = new Map();
  const pendencias = new Map();
  let valores = dados;
  if (!valores) {
    const lido = lerDados(arquivoDados || path.join(raiz, 'site', 'dados-da-empresa.json'));
    valores = lido.dados;
    avisos.push(...lido.avisos);
  }

  const paginas = [paginaInicial(valores), paginaSuporte(valores)];
  const nomes = ['index.html', 'suporte.html'];
  for (const p of PAGINAS_LEGAIS) {
    const arquivo = path.join(legal, p.md);
    let md = null;
    if (fs.existsSync(arquivo)) {
      md = fs.readFileSync(arquivo, 'utf8');
      avisos.push(...avisosDeRedacao(md, `docs/legal/${p.md}`));
    } else avisos.push(`docs/legal/${p.md} ainda não existe: ${p.arquivo} sai como espaço reservado, com [A DEFINIR]`);
    const pg = paginaLegal(p, md, valores);
    avisos.push(...pg.avisos);
    paginas.push(pg);
    nomes.push(p.arquivo);
  }
  paginas.forEach((pg, k) => {
    arquivos.set(nomes[k], pg.html);
    pendencias.set(nomes[k], pg.pendencias);
    for (const problema of problemasDeTitulos(pg.html)) avisos.push(`${nomes[k]}: ${problema}`);
  });
  arquivos.set('estilo.css', CSS);
  arquivos.set('_headers', CABECALHOS);
  for (const peso of PESOS_FONTE) arquivos.set(`fontes/Manrope_${peso}.ttf`, fs.readFileSync(path.join(raiz, 'apps', 'app', 'assets', 'fonts', `Manrope_${peso}.ttf`)));
  arquivos.set('fontes/OFL.txt', fs.readFileSync(path.join(raiz, 'apps', 'app', 'assets', 'fonts', 'OFL.txt')));
  arquivos.set('marca/clarevo-logotipo-reverso.svg', fs.readFileSync(path.join(raiz, 'docs', 'marca', 'clarevo-logotipo-reverso.svg')));
  arquivos.set('marca/icone-app.png', fs.readFileSync(path.join(raiz, 'docs', 'marca', 'icone-app-1024.png')));
  arquivos.set('favicon.svg', fs.readFileSync(path.join(raiz, 'docs', 'marca', 'clarevo-simbolo.svg')));
  avisos.push(...linksQuebrados(arquivos));
  return { arquivos, avisos, pendencias, valores };
}

// ------------------------------------------------------------------------------------------------------------------------------
// PDF para a revisão jurídica
// ------------------------------------------------------------------------------------------------------------------------------

const CSS_PDF = `
@page{size:A4}
*{box-sizing:border-box}
body{margin:0;font-family:Manrope,Arial,sans-serif;font-weight:500;font-size:10.5pt;line-height:1.55;color:#17223B;overflow-wrap:break-word}
h1{font-weight:800;font-size:20pt;line-height:1.2;margin:0 0 .6em;color:#17223B}
h2{font-weight:800;font-size:14pt;line-height:1.3;margin:1.5em 0 .5em;break-after:avoid}
h3{font-weight:700;font-size:12pt;margin:1.2em 0 .4em;break-after:avoid}
h4{font-weight:700;font-size:11pt;margin:1em 0 .3em;break-after:avoid}
p,ul,ol,blockquote,pre{margin:0 0 .8em}
ul,ol{padding-left:1.3em}
li{margin:.2em 0}
a{color:#2457F5}
code{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:.9em;background:#EAF0FF;padding:.05em .3em;border-radius:3px}
pre{background:#EAF0FF;padding:.7em;border-radius:6px;white-space:pre-wrap}
blockquote{border-left:3pt solid #2457F5;background:#EAF0FF;padding:.5em .8em}
hr{border:0;border-top:1px solid #E3E8F2;margin:1.5em 0}
table{width:100%;border-collapse:collapse;font-size:9.5pt;margin:0 0 .8em}
th,td{border:1px solid #C9D2E6;padding:.35em .5em;text-align:left;vertical-align:top}
th{background:#EAF0FF}
tr{break-inside:avoid}
.tabela{margin:0}
.alinha-d{text-align:right}.alinha-c{text-align:center}
mark.pendente{background:#D4F05B;color:#17223B;padding:0 .2em;border-radius:3px;font-weight:700}
.doc{break-before:page}
.capa-pdf{break-before:auto;min-height:248mm}
.capa-pdf .faixa-azul{background:#2457F5;padding:16mm 12mm;border-radius:10px;margin-bottom:14mm}
.capa-pdf .faixa-azul img{display:block;height:18mm;width:auto}
.capa-pdf h1{font-size:30pt;margin-bottom:.4em}
.capa-pdf .aviso{display:inline-block;background:#D4F05B;padding:.5em .8em;border-radius:6px;font-weight:800;margin:.8em 0 1.4em}
.capa-pdf .data{color:#4B5873;margin:0}
.capa-pdf ol{margin-top:.4em}
`;

function dataPorExtenso(d = new Date()) {
  return d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo' });
}

/** O HTML do pacote: capa, sumário e os documentos na ordem, cada um começando em página nova. Devolve também o que faltou. */
function montarPacote({ legal, valores, data = new Date() }) {
  const avisos = [];
  const docs = [];
  for (const nome of DOCUMENTOS_DO_PACOTE) {
    const arquivo = path.join(legal, nome);
    if (!fs.existsSync(arquivo)) {
      avisos.push(`docs/legal/${nome} não existe e ficou de fora do PDF`);
      continue;
    }
    const md = fs.readFileSync(arquivo, 'utf8');
    const { titulo } = separarTitulo(md);
    const id = `doc-${nome.replace(/\.md$/, '')}`;
    const mapaLinks = Object.fromEntries(DOCUMENTOS_DO_PACOTE.map((n) => [n, `#doc-${n.replace(/\.md$/, '')}`]));
    const html = markdownParaHtml(md, { valores, prefixoId: `${id}-`, mapaLinks });
    docs.push({ nome, id, titulo: titulo ? textoPuro(titulo) : nome, html });
  }
  const logo = fs.readFileSync(path.join(MARCA, 'clarevo-logotipo-reverso.svg')).toString('base64');
  const fonte = (peso) => fs.readFileSync(path.join(FONTES, `Manrope_${peso}.ttf`)).toString('base64');
  const faces = PESOS_FONTE.map((p) => `@font-face{font-family:Manrope;font-weight:${p.slice(0, 3)};src:url(data:font/ttf;base64,${fonte(p)}) format("truetype")}`).join('\n');
  const sumario = docs.map((d) => `<li><a href="#${d.id}">${esc(d.titulo)}</a></li>`).join('');
  const capa = `<section class="doc capa-pdf">
<div class="faixa-azul"><img src="data:image/svg+xml;base64,${logo}" alt="Clarevo"></div>
<div class="miolo">
<h1>Pacote para revisão jurídica</h1>
<p class="aviso">Rascunho para revisão jurídica. Não é parecer jurídico.</p>
<p class="data">Gerado em ${esc(dataPorExtenso(data))}</p>
<p style="margin-top:1.4em">Os marcadores entre colchetes ficam visíveis e destacados: são os dados que a empresa ainda precisa informar.</p>
<p style="margin-top:1.4em"><strong>Neste pacote</strong></p>
<ol>${sumario}</ol>
</div>
</section>`;
  const corpo = docs.map((d) => `<section class="doc" id="${d.id}">\n${d.html}\n</section>`).join('\n');
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Pacote para revisão jurídica · Clarevo</title><style>${faces}\n${CSS_PDF}</style></head><body>${capa}\n${corpo}</body></html>`;
  return { html, docs, avisos };
}

async function gerarPdf({ legal, valores, destino }) {
  const { html, docs, avisos } = montarPacote({ legal, valores });
  if (docs.length === 0) throw new Error(`nenhum dos documentos do pacote existe em ${path.relative(RAIZ, legal) || legal}: rode de novo quando os Markdown estiverem lá`);
  const { chromium } = require('playwright');
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  try {
    const pagina = await browser.newPage();
    await pagina.setContent(html, { waitUntil: 'load' });
    await pagina.evaluate(() => document.fonts.ready);
    fs.mkdirSync(path.dirname(path.resolve(destino)), { recursive: true });
    const rodape = `<div style="width:100%;font-family:Arial,sans-serif;font-size:9px;color:#4B5873;text-align:center">Pacote para revisão jurídica · Rascunho, não é parecer jurídico · Página <span class="pageNumber"></span> de <span class="totalPages"></span></div>`;
    await pagina.pdf({
      path: path.resolve(destino),
      format: 'A4',
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate: rodape,
      margin: { top: '18mm', bottom: '18mm', left: '18mm', right: '18mm' },
    });
  } finally {
    await browser.close();
  }
  return { documentos: docs.map((d) => d.nome), avisos };
}

// ------------------------------------------------------------------------------------------------------------------------------
// Linha de comando
// ------------------------------------------------------------------------------------------------------------------------------

function escreverSite(arquivos, destino) {
  for (const [nome, conteudo] of arquivos) {
    const alvo = path.join(destino, nome);
    fs.mkdirSync(path.dirname(alvo), { recursive: true });
    fs.writeFileSync(alvo, conteudo);
  }
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

  const resultado = gerarSite({ legal, arquivoDados: arquivoDados ? path.resolve(arquivoDados) : undefined });
  for (const aviso of resultado.avisos) console.warn(`aviso: ${aviso}`);

  const faltas = [];
  for (const [pagina, lista] of resultado.pendencias) for (const m of lista) faltas.push(`${pagina}: ${m}`);
  if (final && faltas.length > 0) {
    console.error(`--final: o site não está pronto para publicar. Falta preencher (${faltas.length}):`);
    for (const f of faltas) console.error(`  ${f}`);
    console.error('Preencha site/dados-da-empresa.json e os trechos [A DEFINIR] de docs/legal, e rode de novo.');
    process.exitCode = 1;
    return;
  }

  escreverSite(resultado.arquivos, destino);
  console.log(`site gravado em ${path.relative(RAIZ, destino) || destino}: ${resultado.arquivos.size} arquivos`);
  if (faltas.length > 0) console.log(`versão preliminar: ${faltas.length} marcador(es) ainda sem valor (a faixa "Versão preliminar, em revisão" aparece nas páginas)`);
  else console.log('nenhum marcador pendente: pronto para o --final');

  if (pdf) {
    const r = await gerarPdf({ legal, valores: resultado.valores, destino: pdf });
    for (const aviso of r.avisos) console.warn(`aviso: ${aviso}`);
    console.log(`PDF gravado em ${pdf} com ${r.documentos.length} documento(s): ${r.documentos.join(', ')}`);
  }
}

module.exports = {
  MARCADORES,
  HOSTS_DE_LINK_PERMITIDOS,
  PAGINAS_LEGAIS,
  DOCUMENTOS_DO_PACOTE,
  markdownParaHtml,
  titulosDoMarkdown,
  separarTitulo,
  problemasDeTitulos,
  pendenciasDoTexto,
  slug,
  lerDados,
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
