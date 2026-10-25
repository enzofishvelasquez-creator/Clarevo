/// <reference types="node" />
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * D-068 (25/10/2026): a marca é tratada no feminino em tudo o que a pessoa lê. "A Clarevo", "da Clarevo", "na Clarevo", "à Clarevo", "pela
 * Clarevo"; quando o texto fala do software como objeto, "o app da Clarevo". Este teste varre os textos públicos (app, catálogo de Aprender e
 * guia, site e suas fontes, textos legais, ficha e privacidade das lojas, `app.json`, página de abertura da web) e recusa o artigo, a
 * preposição contraída ou o pronome no masculino diante de "Clarevo". Comentários de código ficam de fora (não vão para o público), assim
 * como o nome dos arquivos e os identificadores.
 */
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

const MASCULINO = /\b(?:o|O|do|Do|no|No|ao|Ao|pelo|Pelo|um|Um|num|Num|este|Este|esse|Esse|aquele|Aquele|seu|Seu|nosso|Nosso)\s+Clarevo\b/g;

function arquivos(dir: string, extensoes: string[], ignorar: RegExp = /node_modules|\/dist\/|\/\.expo\//): string[] {
  const saida: string[] = [];
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (ignorar.test(caminho)) continue;
    if (statSync(caminho).isDirectory()) saida.push(...arquivos(caminho, extensoes, ignorar));
    else if (extensoes.includes(extname(nome))) saida.push(caminho);
  }
  return saida;
}

const ehComentario = (linha: string) => /^\s*(\/\/|\*|\/\*|\{\/\*)/.test(linha);

function achados(caminho: string): string[] {
  const codigo = ['.ts', '.tsx', '.js', '.cjs', '.mjs', '.css'].includes(extname(caminho));
  const linhas = readFileSync(caminho, 'utf8').split('\n');
  const saida: string[] = [];
  linhas.forEach((linha, i) => {
    if (codigo && ehComentario(linha)) return;
    for (const m of linha.matchAll(MASCULINO)) saida.push(`${relative(ROOT, caminho)}:${i + 1}: "${m[0]}"`);
  });
  return saida;
}

describe('a marca no feminino (D-068)', () => {
  const lista: [string, string[]][] = [
    ['packages/core/src', ['.ts']],
    ['apps/app/src', ['.ts', '.tsx']],
    ['site-src', ['.md', '.js', '.css']],
    ['scripts/site', ['.js']],
    ['docs/legal', ['.md']],
    ['docs/lojas', ['.md']],
  ];

  it.each(lista)('%s não trata a Clarevo no masculino', (pasta, extensoes) => {
    const todos = arquivos(join(ROOT, pasta), extensoes).flatMap(achados);
    expect(todos).toEqual([]);
  });

  it('app.json, a página de abertura da web e os scripts que geram o site e as imagens não tratam a Clarevo no masculino', () => {
    const arquivosAvulsos = [
      'apps/app/app.json',
      'apps/app/public/index.html',
      'apps/app/widget.config.js',
      'scripts/gerar-site.js',
      'scripts/gerar-og-site.js',
      'scripts/gerar-grafico-loja.js',
      'scripts/gerar-marca-imprensa.js',
      'scripts/gravar-redes.js',
      'scripts/video-demonstracao.js',
    ];
    expect(arquivosAvulsos.flatMap((a) => achados(join(ROOT, a)))).toEqual([]);
  });

  it('o site gerado (páginas, scripts e dados) também não, e a ficha das lojas usa o título no feminino', () => {
    const gerados = arquivos(join(ROOT, 'site'), ['.html', '.js', '.json', '.xml', '.css', '.txt']).flatMap(achados);
    expect(gerados).toEqual([]);
    const ficha = readFileSync(join(ROOT, 'docs', 'lojas', 'ficha.md'), 'utf8');
    expect(ficha).not.toMatch(/O QUE VOCÊ FAZ NO CLAREVO/);
    expect(ficha).toContain('O QUE VOCÊ FAZ NA CLAREVO');
  });
});
