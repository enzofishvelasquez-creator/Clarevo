/// <reference types="node" />
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { isTopicPublished, resolveTopicSlug, topicBySlug } from '../src';

/**
 * Entradas de Aprender dos Ciclos A2 a D (R13 e R12): cada tela que leva a um tema aponta para um tema publicado, cada
 * ação "No Clarevo" de um tema leva a uma tela que existe, e as telas novas estão registradas no layout. Os arquivos do app
 * são lidos como texto, sem importar telas (que dependem do Expo).
 */
const APP_SRC = fileURLToPath(new URL('../../../apps/app/src/', import.meta.url));
const read = (...parts: string[]) => readFileSync(join(APP_SRC, ...parts), 'utf8');

/** Rota de arquivo: /renda-comprometida/referencia → app/renda-comprometida/referencia.tsx; abas ficam em app/(tabs). */
function routeExists(href: string): boolean {
  const path = href.split('?')[0]!.replace(/^\//, '').replace(/\/$/, '');
  const candidates = [
    join(APP_SRC, 'app', `${path}.tsx`),
    join(APP_SRC, 'app', path, 'index.tsx'),
    join(APP_SRC, 'app', '(tabs)', `${path}.tsx`),
  ];
  return candidates.some((c) => existsSync(c));
}

/** Ações "No Clarevo" escritas em lib/learn.ts: slug, rótulo e endereço. */
function learnActions(): { slug: string; label: string; href: string }[] {
  const text = read('lib', 'learn.ts');
  const block = text.slice(text.indexOf('export const LEARN_ACTIONS'));
  const end = block.indexOf('\n};');
  return [...block.slice(0, end).matchAll(/^\s*'?([a-z0-9-]+)'?:\s*\[\{ label: '([^']+)', href: '([^']+)' \}\],?$/gm)].map((m) => ({
    slug: m[1]!,
    label: m[2]!,
    href: m[3]!,
  }));
}

describe('ações "No Clarevo" dos temas (lib/learn.ts)', () => {
  it('lê as ações de verdade', () => {
    expect(learnActions().length).toBeGreaterThanOrEqual(9);
  });

  it('cada ação é de um tema publicado e leva a uma tela que existe', () => {
    for (const { slug, label, href } of learnActions()) {
      const resolved = resolveTopicSlug(slug);
      expect(resolved, `${slug} existe no catálogo`).not.toBeNull();
      expect(isTopicPublished(resolved!), `${slug} está publicado`).toBe(true);
      expect(routeExists(href), `${label} → ${href}`).toBe(true);
    }
  });

  it('os temas dos Ciclos B, C e D levam à tela certa do app', () => {
    const byTopic = new Map(learnActions().map((a) => [a.slug, a]));
    expect(byTopic.get('renda-comprometida')).toMatchObject({ label: 'Ver minha renda comprometida', href: '/renda-comprometida' });
    expect(byTopic.get('renda-variavel')).toMatchObject({ label: 'Revisar minha renda de referência', href: '/renda-comprometida/referencia' });
    expect(byTopic.get('aporte')).toMatchObject({ label: 'Abrir Metas', href: '/metas' });
    expect(byTopic.get('essenciais')).toMatchObject({ label: 'Calcular minha reserva', href: '/reserva' });
    expect(byTopic.get('simulacao')).toMatchObject({ label: 'Simular um plano', href: '/simular' });
  });
});

describe('telas dos Ciclos B, C e D ligam temas publicados', () => {
  /** Arquivo → temas que ele liga (TermHint, TopicLink ou explanationHref). */
  const LINKS: [string[], string[]][] = [
    [['app', 'renda-comprometida', 'index.tsx'], ['renda-comprometida', 'cet']],
    [['app', 'renda-comprometida', 'referencia.tsx'], ['renda-variavel']],
    [['components', 'reserve-form.tsx'], ['reserva-imprevistos', 'liquidez-risco-retorno']],
    [['components', 'savings-plan-form.tsx'], ['reserva-imprevistos']],
    [['components', 'essentials-block.tsx'], ['essenciais']],
    [['components', 'goal-movement-form.tsx'], ['aporte']],
    [['app', 'meta', '[id]', 'index.tsx'], ['aporte']],
    [['components', 'sim-result.tsx'], ['juros-simples-compostos', 'simulacao']],
    [['app', 'simular.tsx'], ['taxa-mes-ano', 'inflacao-ipca']],
  ];

  it('cada tela liga os temas esperados e todos estão publicados', () => {
    for (const [file, slugs] of LINKS) {
      const text = read(...file);
      for (const slug of slugs) {
        expect(text, `${file.join('/')} liga ${slug}`).toMatch(new RegExp(`(slug=["'{]+${slug}["'}]|explanationHref\\(\\s*['"\`]${slug}['"\`])`));
        expect(topicBySlug(slug)?.slug, `${slug} está publicado`).toBe(slug);
      }
    }
  });

  it('o card Aprender da aba Metas só mostra temas publicados e existentes', () => {
    const text = read('app', '(tabs)', 'metas.tsx');
    const slugs = [...text.matchAll(/\{\s*slug:\s*'([a-z0-9-]+)',\s*title:/g)].map((m) => m[1]!);
    expect(slugs).toEqual(['reserva-imprevistos', 'aporte']);
    for (const slug of slugs) expect(topicBySlug(slug)?.slug, slug).toBe(slug);
    // E a tela confere em tempo de execução, para um tema que volte a ser rascunho sumir do card sem quebrar a aba.
    expect(text).toMatch(/isTopicPublished\(r\.slug\)/);
  });

  it('Aprender abre o simulador pelo atalho "Simular" e a rota existe', () => {
    const text = read('app', '(tabs)', 'aprender.tsx');
    expect(text).toMatch(/\/simular/);
    expect(routeExists('/simular')).toBe(true);
  });
});

describe('telas novas registradas no layout', () => {
  it('cada tela dos Ciclos B, C e D tem Stack.Screen e aceita o endereço direto (ENTRY_PATH)', () => {
    const layout = read('app', '_layout.tsx');
    const screens = [
      'renda-comprometida/index',
      'renda-comprometida/referencia',
      'reserva',
      'meta/nova',
      'meta/[id]/index',
      'meta/[id]/editar',
      'meta/[id]/movimento',
      'guardar/index',
      'guardar/minima',
      'simular',
    ];
    for (const name of screens) expect(layout, name).toContain(`<Stack.Screen name="${name}" />`);
    // ENTRY_PATH é o que deixa a versão web abrir a tela pelo endereço (atalho, link salvo ou página recarregada).
    const source = layout.match(/const ENTRY_PATH =\s*(\/\^[^\n]+\$\/);/)?.[1];
    expect(source, 'ENTRY_PATH escrito no layout').toBeTruthy();
    const entry = new RegExp(source!.slice(1, -1));
    for (const path of [
      '/renda-comprometida',
      '/renda-comprometida/referencia',
      '/reserva',
      '/meta/nova',
      '/meta/abc',
      '/meta/abc/editar',
      '/meta/abc/movimento',
      '/guardar',
      '/guardar/minima',
      '/simular',
      '/metas',
    ]) {
      expect(entry.test(path), path).toBe(true);
    }
  });
});
