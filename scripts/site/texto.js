'use strict';
/**
 * Texto do site: escape, marcadores de dados da empresa e o conversor de Markdown mínimo e próprio (exportado para o teste).
 * Títulos `#` a `####` com âncoras estáveis, parágrafos, listas com `-` e numeradas (com aninhamento), **negrito**, *itálico*,
 * `código`, links `[t](u)`, tabelas simples com `|`, citação `>`, bloco de código e linha `---`. O texto é sempre escapado.
 * Links sem endereço completo e sem `#` são relativos à raiz do site quando a conversão sabe qual é a página (`paginaAtual`).
 */
const fs = require('node:fs');
const path = require('node:path');
const { RAIZ, MARCADORES, MARCADORES_EMAIL } = require('./config');
const { INTERRUPTORES } = require('./formularios');

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const nfc = (s) => String(s).normalize('NFC');

/**
 * Marcador de dado, `[A DEFINIR: ...]` (o que não está decidido), `[PROPOSTA: ...]` (o que é só proposta da equipe, ainda sem confirmação
 * jurídica), `[A RETIRAR: ...]` (texto que não pode ir ao ar, como a seção de um formulário desligado) ou qualquer outro texto em MAIÚSCULAS entre colchetes (que não seja o texto de um link).
 */
const FONTE_MARCADOR =
  '\\[(?:A DEFINIR|PROPOSTA|A RETIRAR)[^\\]\\n]*\\](?!\\()' +
  `|\\[(?:${MARCADORES.map(escRe).join('|')})\\](?!\\()` +
  '|\\[[A-ZÀ-ÖØ-Þ][A-ZÀ-ÖØ-Þ0-9 /.\\-]{2,}\\](?!\\()';

function classificarMarcador(m) {
  const dentro = m.slice(1, -1);
  if (/^(A DEFINIR|PROPOSTA|A RETIRAR)/.test(dentro)) return { tipo: 'definir' };
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
  const paginaAtual = opcoes.paginaAtual || '';
  return {
    valores: opcoes.valores || {},
    rebaixarH1: Boolean(opcoes.rebaixarH1),
    prefixoId: prefixo,
    ids: new Set(),
    titulos: [],
    /**
     * Troca o destino de um link: arquivo `.md` conhecido vira a página; `#âncora` ganha o prefixo do documento; com `paginaAtual`,
     * o que não é endereço completo é caminho a partir da raiz do site e vira relativo a essa página.
     */
    reescrever(url) {
      if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return url;
      const [base, ancora] = url.split('#');
      if (!base && ancora !== undefined) return `#${prefixo}${ancora}`;
      const nome = path.posix.basename(base || '');
      if (nome.endsWith('.md') && Object.prototype.hasOwnProperty.call(mapa, nome)) {
        const alvo = mapa[nome];
        return ancora !== undefined && !alvo.startsWith('#') ? `${alvo}#${ancora}` : alvo;
      }
      if (paginaAtual && base && !base.startsWith('../') && !base.startsWith('./')) {
        const relativo = path.posix.relative(path.posix.dirname(paginaAtual), base.replace(/^\//, '')) || path.posix.basename(base);
        return ancora !== undefined ? `${relativo}#${ancora}` : relativo;
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

/**
 * Os valores que o JSON da empresa traz, completos (marcador sem valor fica vazio) e com os avisos de chave desconhecida. Além dos
 * marcadores (texto), há dois interruptores (`formulario_contato` e `newsletter`, booleanos, desligados por padrão) que mostram os
 * formulários do site (D-066).
 */
function lerDados(arquivo) {
  const dados = { ...Object.fromEntries(MARCADORES.map((m) => [m, ''])), ...Object.fromEntries(INTERRUPTORES.map((i) => [i, false])) };
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
    if (INTERRUPTORES.includes(nome)) {
      if (typeof v !== 'boolean') avisos.push(`${path.relative(RAIZ, arquivo)}: o valor de "${k}" deve ser true ou false`);
      else dados[nome] = v;
      continue;
    }
    if (!MARCADORES.includes(nome)) avisos.push(`${path.relative(RAIZ, arquivo)}: a chave "${k}" não é um marcador conhecido (${[...MARCADORES, ...INTERRUPTORES].join(', ')})`);
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

module.exports = {
  esc,
  escRe,
  nfc,
  FONTE_MARCADOR,
  classificarMarcador,
  valorDe,
  expandirMarcador,
  pendenciasDoTexto,
  textoPuro,
  slug,
  emLinha,
  contexto,
  markdownParaHtml,
  titulosDoMarkdown,
  separarTitulo,
  problemasDeTitulos,
  lerDados,
  avisosDeRedacao,
};
