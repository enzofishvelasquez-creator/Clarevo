/// <reference types="node" />
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { RETURN_TOPIC_SLUG, SIMULATE_TOPICS, START_HERE, TOPIC_SLUGS, isTopicPublished, resolveTopicSlug, topicBySlug, type TopicSlug } from '../src';

/**
 * R13 (spec3 §3.6): as telas só apontam para temas do catálogo, e os temas ligados hoje estão publicados.
 * Os arquivos do app são lidos como texto, sem importar o app (que depende do Expo).
 */
const APP_SRC = fileURLToPath(new URL('../../../apps/app/src/', import.meta.url));

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

const files = sourceFiles(APP_SRC).map((path) => ({ rel: path.slice(APP_SRC.length), text: readFileSync(path, 'utf8') }));

/** Slugs escritos à mão em cada forma de link. */
function linkedSlugs(): { rel: string; slug: string; via: string }[] {
  const out: { rel: string; slug: string; via: string }[] = [];
  for (const { rel, text } of files) {
    for (const m of text.matchAll(/explanationHref\(\s*['"`]([^'"`]+)['"`]/g)) out.push({ rel, slug: m[1]!, via: 'explanationHref' });
    for (const m of text.matchAll(/<(?:TermHint|TopicLink)\b[^>]*?\bslug=["'{]+([a-z0-9-]+)["'}]/g)) out.push({ rel, slug: m[1]!, via: 'slug=' });
    for (const m of text.matchAll(/['"`]\/explicacao\/([a-z0-9-]+)(?=['"`?])/g)) out.push({ rel, slug: m[1]!, via: '/explicacao/' });
  }
  return out;
}

describe('ligações das telas com Aprender (R13)', () => {
  it('lê o app de verdade', () => {
    expect(files.length).toBeGreaterThan(30);
    expect(linkedSlugs().length).toBeGreaterThan(5);
  });

  it('todo explanationHref, slug= de TermHint e TopicLink e /explicacao/<slug> escrito no app aponta para tema publicado', () => {
    const bad = linkedSlugs().filter(({ slug }) => {
      const resolved = resolveTopicSlug(slug);
      return resolved === null || !isTopicPublished(resolved);
    });
    expect(bad).toEqual([]);
  });

  it('os temas ligados hoje estão publicados', () => {
    const linkedToday: TopicSlug[] = ['diferenca', 'realizado-previsto', 'fatura', 'gasto-fixo', 'estimativa', 'quitar-antes'];
    for (const slug of linkedToday) expect(topicBySlug(slug)?.slug, slug).toBe(slug);
    // Ciclo A3 (cadastro de conta do ano) e A4 (link "Entenda" de /retomar).
    expect(isTopicPublished('contas-do-ano')).toBe(true);
    expect(RETURN_TOPIC_SLUG).toBe('sem-registro');
    expect(isTopicPublished(RETURN_TOPIC_SLUG as TopicSlug)).toBe(true);
  });

  it('temas dos Ciclos B, C e D que as telas ligam (renda comprometida, renda que muda, aporte, gastos essenciais e simulação) estão publicados', () => {
    for (const slug of ['renda-comprometida', 'renda-variavel', 'aporte', 'essenciais', 'simulacao'] as const) {
      expect(TOPIC_SLUGS, slug).toContain(slug);
      expect(topicBySlug(slug)?.slug, slug).toBe(slug);
    }
    // O simulador do core liga taxa, inflação, resultado e leitura da simulação: todos publicados.
    for (const slug of Object.values(SIMULATE_TOPICS)) expect(isTopicPublished(slug), slug).toBe(true);
    expect(SIMULATE_TOPICS.reading).toBe('simulacao');
  });

  it('START_HERE aponta para slugs do catálogo', () => {
    for (const slug of START_HERE) expect(TOPIC_SLUGS).toContain(slug);
  });

  it('depois da troca de lib/topics.ts por lib/learn.ts, não sobra "/explicacao/" escrito à mão fora de lib/learn.ts', () => {
    // Enquanto lib/topics.ts existir, os links antigos ainda estão sendo trocados por explanationHref (spec5_notes §3).
    if (existsSync(join(APP_SRC, 'lib', 'topics.ts'))) return;
    const handwritten = files.filter(({ rel, text }) => rel !== join('lib', 'learn.ts') && /['"`]\/explicacao\//.test(text)).map((f) => f.rel);
    expect(handwritten).toEqual([]);
  });
});
