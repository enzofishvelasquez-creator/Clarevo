'use strict';
/**
 * Leitura do conteúdo próprio do site (`site-src/`): o cabeçalho dos Markdown (título, data, resumo, autoria e fontes), as páginas de
 * texto, as perguntas do suporte da Ajuda e os posts de Novidades.
 *
 * Cabeçalho de um Markdown:
 *   ---
 *   titulo: Texto
 *   data: 2026-10-23
 *   fontes:
 *     - tema: decimo-terceiro            as fontes do tema do catálogo de Aprender
 *     - Rótulo | https://endereço        link de fonte
 *     - Rótulo | pagina.html             página do próprio site (caminho a partir da raiz)
 *     - Texto sem link
 *   ---
 */
const fs = require('node:fs');
const path = require('node:path');
const { nfc } = require('./texto');
const { AUTORIA_PADRAO } = require('./config');

/** Separa o cabeçalho (entre `---`) do corpo. Sem cabeçalho: `meta` vazio. */
function lerCabecalho(texto) {
  const linhas = nfc(texto).replace(/\r\n?/g, '\n').split('\n');
  if (linhas[0] !== '---') return { meta: {}, corpo: linhas.join('\n') };
  const fim = linhas.indexOf('---', 1);
  if (fim < 0) throw new Error('cabeçalho sem o "---" que o fecha');
  const meta = {};
  let chave = null;
  for (const linha of linhas.slice(1, fim)) {
    if (linha.trim() === '') continue;
    const item = /^\s+-\s+(.*)$/.exec(linha);
    if (item && chave) {
      (meta[chave] = Array.isArray(meta[chave]) ? meta[chave] : []).push(item[1].trim());
      continue;
    }
    const par = /^([a-z][a-z0-9-]*):\s*(.*)$/.exec(linha);
    if (!par) throw new Error(`linha de cabeçalho que não entendi: "${linha}"`);
    chave = par[1];
    meta[chave] = par[2].trim() === '' ? [] : par[2].trim();
  }
  return { meta, corpo: linhas.slice(fim + 1).join('\n').replace(/^\n+/, '') };
}

/** Uma fonte do cabeçalho: `tema: slug`, `Rótulo | destino` ou texto simples. */
function lerFonte(texto) {
  const tema = /^tema:\s*([a-z0-9-]+)$/.exec(texto);
  if (tema) return { tipo: 'tema', slug: tema[1] };
  const [rotulo, destino] = texto.split('|').map((p) => p.trim());
  if (destino) return { tipo: 'link', rotulo, destino };
  return { tipo: 'texto', rotulo };
}

const POST = /^(\d{4})-(\d{2})-(\d{2})-([a-z0-9][a-z0-9-]*)\.md$/;

/** Os posts de `site-src/novidades/`, do mais novo para o mais antigo. Valida o cabeçalho e devolve a lista de problemas. */
function lerPosts(pasta) {
  const posts = [];
  const problemas = [];
  if (!fs.existsSync(pasta)) return { posts, problemas: [`${path.basename(pasta)} não existe`] };
  for (const nome of fs.readdirSync(pasta).sort()) {
    const m = POST.exec(nome);
    if (!m) continue;
    const onde = `site-src/novidades/${nome}`;
    let lido;
    try {
      lido = lerCabecalho(fs.readFileSync(path.join(pasta, nome), 'utf8'));
    } catch (e) {
      problemas.push(`${onde}: ${e.message}`);
      continue;
    }
    const { meta, corpo } = lido;
    const dataDoNome = `${m[1]}-${m[2]}-${m[3]}`;
    const falta = (campo) => problemas.push(`${onde}: falta "${campo}" no cabeçalho`);
    for (const campo of ['titulo', 'data', 'resumo', 'autoria']) if (typeof meta[campo] !== 'string' || meta[campo] === '') falta(campo);
    if (!Array.isArray(meta.fontes) || meta.fontes.length === 0) falta('fontes');
    if (typeof meta.data === 'string' && meta.data !== dataDoNome) problemas.push(`${onde}: a data do cabeçalho (${meta.data}) não é a do nome do arquivo (${dataDoNome})`);
    if (typeof meta.resumo === 'string' && meta.resumo.length > 220) problemas.push(`${onde}: o resumo tem ${meta.resumo.length} caracteres (até 220)`);
    posts.push({
      arquivo: `novidades/${nome.replace(/\.md$/, '.html')}`,
      slug: m[4],
      data: dataDoNome,
      titulo: meta.titulo || nome,
      resumo: meta.resumo || '',
      autoria: meta.autoria || AUTORIA_PADRAO,
      fontes: (Array.isArray(meta.fontes) ? meta.fontes : []).map(lerFonte),
      corpo,
      origem: onde,
    });
  }
  posts.sort((a, b) => (a.data === b.data ? a.slug.localeCompare(b.slug) : b.data.localeCompare(a.data)));
  return { posts, problemas };
}

/** As perguntas do suporte (`site-src/ajuda/perguntas.md`): cada `## Pergunta`, os itens `- tema:` e `- id:` e a resposta em Markdown. */
function lerPerguntas(arquivo) {
  if (!fs.existsSync(arquivo)) return [];
  const linhas = nfc(fs.readFileSync(arquivo, 'utf8')).replace(/\r\n?/g, '\n').split('\n');
  const itens = [];
  let atual = null;
  for (const linha of linhas) {
    const titulo = /^##\s+(.*?)\s*$/.exec(linha);
    if (titulo) {
      atual = { pergunta: titulo[1], tema: '', id: '', resposta: [] };
      itens.push(atual);
      continue;
    }
    if (!atual) continue;
    const par = /^-\s+(tema|id):\s*(.+?)\s*$/.exec(linha);
    if (par && atual.resposta.every((l) => l.trim() === '')) atual[par[1]] = par[2];
    else atual.resposta.push(linha);
  }
  for (const i of itens) i.resposta = i.resposta.join('\n').trim();
  return itens;
}

module.exports = { lerCabecalho, lerFonte, lerPosts, lerPerguntas };
