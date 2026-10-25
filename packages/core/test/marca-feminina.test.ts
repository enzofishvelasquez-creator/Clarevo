/// <reference types="node" />
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { topicBySlug } from '../src';

/**
 * D-068 (25/10/2026): a marca é tratada no feminino em tudo o que a pessoa lê. "A Clarevo", "da Clarevo", "na Clarevo", "à Clarevo", "pela
 * Clarevo"; quando o texto fala do software como objeto, "o app da Clarevo". Este teste varre os textos públicos (app, catálogo de Aprender e
 * guia, site e suas fontes, textos legais, ficha e privacidade das lojas, `app.json`, página de abertura da web) e recusa o artigo, a
 * preposição contraída ou o pronome no masculino diante de "Clarevo". Comentários de código ficam de fora (não vão para o público), assim
 * como o nome dos arquivos e os identificadores.
 */
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

/**
 * Início de palavra que conhece acento: `\b` do JavaScript trata "ã" como fora da palavra, e "não Clarevo" ou "são Clarevo" pareceriam
 * "o Clarevo". A busca olha para trás por qualquer letra ou número Unicode.
 */
const INICIO = '(?<![\\p{L}\\p{N}_])';
const MASCULINO = new RegExp(
  `${INICIO}(?:o|O|do|Do|no|No|ao|Ao|pelo|Pelo|um|Um|num|Num|este|Este|esse|Esse|aquele|Aquele|seu|Seu|nosso|Nosso)\\s+Clarevo(?![\\p{L}\\p{N}_])`,
  'gu',
);

/**
 * Concordância comum depois de "a Clarevo é ...": o adjetivo ou particípio no masculino ("a Clarevo é gratuito", "apoiado por um app").
 * Só aceita, entre o verbo e a palavra, advérbios e intensificadores; "a Clarevo é um aplicativo gratuito" concorda com "aplicativo" e fica de fora.
 */
const ADVERBIOS = 'não|nunca|sempre|bem|muito|mais|menos|totalmente|completamente|só|apenas|ainda|também|já|realmente|100%';
const ADJETIVOS_MASCULINOS =
  'apoiado|gratuito|pensado|feito|criado|desenvolvido|projetado|mantido|oferecido|pago|seguro|conectado|ligado|certificado|autorizado|' +
  'regulado|vinculado|patrocinado|financiado|recomendado|aprovado|indicado|protegido|limitado|ilimitado|obrigado|cobrado|ofertado|gerido|' +
  'administrado|operado|controlado|lançado|publicado|construído|organizado|preparado|planejado|voltado|dedicado|focado|baseado|pronto|livre';
const DISCORDANCIA = new RegExp(
  `${INICIO}(?:a|A)\\s+Clarevo\\s+(?:(?:${ADVERBIOS})\\s+)*(?:é|era|foi|está|estava|fica|ficou|será|seria|continua|segue|permanece|nasceu|vem|segue sendo)\\s+(?:(?:${ADVERBIOS})\\s+)*(?:${ADJETIVOS_MASCULINOS})(?![\\p{L}\\p{N}_])`,
  'gu',
);

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
    for (const re of [MASCULINO, DISCORDANCIA]) for (const m of linha.matchAll(re)) saida.push(`${relative(ROOT, caminho)}:${i + 1}: "${m[0]}"`);
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
      'docs/manual/index.html',
    ];
    expect(arquivosAvulsos.flatMap((a) => achados(join(ROOT, a)))).toEqual([]);
  });

  it('o manual de uso para compartilhar (docs/manual/index.html, gerado do guia por `npm run manual`) está em dia e no feminino', () => {
    const manual = readFileSync(join(ROOT, 'docs', 'manual', 'index.html'), 'utf8');
    expect(manual).toMatch(/da Clarevo, com dados fictícios/);
    expect(manual.match(/Clarevo/g)!.length).toBeGreaterThan(20);
    expect(achados(join(ROOT, 'docs', 'manual', 'index.html'))).toEqual([]);
  });

  it('o apelido antigo da pergunta "O que a Clarevo não faz?" abre o tema novo (topicBySlug)', () => {
    const tema = topicBySlug('o-que-o-clarevo-nao-faz');
    expect(tema?.slug).toBe('o-que-a-clarevo-nao-faz');
    expect(topicBySlug('o-que-a-clarevo-nao-faz')?.slug).toBe('o-que-a-clarevo-nao-faz');
  });

  it('o detector acerta: pega o masculino e a discordância comum, e não acusa palavra acentuada nem concordância certa', () => {
    const acha = (texto: string) => [...texto.matchAll(MASCULINO), ...texto.matchAll(DISCORDANCIA)].map((m) => m[0]);
    // Pega.
    expect(acha('Abra o Clarevo.')).toEqual(['o Clarevo']);
    expect(acha('Você usa no Clarevo e pelo Clarevo.')).toEqual(['no Clarevo', 'pelo Clarevo']);
    expect(acha('Um Clarevo simples.')).toEqual(['Um Clarevo']);
    for (const adj of ['apoiado', 'gratuito', 'pensado', 'feito', 'criado']) expect(acha(`A Clarevo é ${adj} por gente.`), adj).toHaveLength(1);
    expect(acha('A Clarevo não é gratuito.')).toHaveLength(1);
    expect(acha('A Clarevo foi criado em 2026.')).toHaveLength(1);
    expect(acha('A Clarevo está sempre pronto.')).toHaveLength(1);
    // Não pega: palavra acentuada antes de "Clarevo" ("\\b" não conhece acento), o feminino certo, o substantivo masculino que vem depois.
    expect(acha('Não Clarevo é erro de digitação, mas "não" não é o artigo.')).toEqual([]);
    expect(acha('Está no mês do São Clarevo? Tão Clarevo.')).toEqual([]);
    expect(acha('Só o Clarevox existe.')).toEqual([]);
    expect(acha('A Clarevo é gratuita, apoiada por um app e feita no Brasil.')).toEqual([]);
    expect(acha('A Clarevo é um aplicativo gratuito e um produto pensado para o mês.')).toEqual([]);
    expect(acha('O app da Clarevo é gratuito.')).toEqual([]);
    expect(acha('A Clarevo não é banco, nem corretora, nem um produto financeiro.')).toEqual([]);
  });

  it('o site gerado (páginas, scripts e dados) também não, e a ficha das lojas usa o título no feminino', () => {
    const gerados = arquivos(join(ROOT, 'site'), ['.html', '.js', '.json', '.xml', '.css', '.txt']).flatMap(achados);
    expect(gerados).toEqual([]);
    const ficha = readFileSync(join(ROOT, 'docs', 'lojas', 'ficha.md'), 'utf8');
    expect(ficha).not.toMatch(/O QUE VOCÊ FAZ NO CLAREVO/);
    expect(ficha).toContain('O QUE VOCÊ FAZ NA CLAREVO');
  });
});
