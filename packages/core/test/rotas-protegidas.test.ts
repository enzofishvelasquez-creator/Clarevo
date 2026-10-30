/// <reference types="node" />
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Toda tela do app está declarada em apps/app/src/app/_layout.tsx, dentro de um Stack.Protected. Tela que não está lá fica fora da
 * guarda de sessão: aberta pelo endereço sem ter entrado, ela pede o repositório sem sessão e a página fica em branco ("Sem sessão"),
 * em vez de ir para a entrada (aconteceu com /conta/whatsapp e com três telas antigas, 30/10/2026).
 */
const APP = join(__dirname, '../../../apps/app/src/app');

function screens(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return screens(path);
    return name.endsWith('.tsx') ? [relative(APP, path).replace(/\.tsx$/, '')] : [];
  });
}

describe('rotas: toda tela fica dentro da guarda de sessão', () => {
  const layout = readFileSync(join(APP, '_layout.tsx'), 'utf8');
  const lines = layout.split('\n');
  // Linhas dentro de algum <Stack.Protected ...> ... </Stack.Protected>.
  const guarded = new Set<number>();
  let open = false;
  lines.forEach((l, i) => {
    if (l.includes('<Stack.Protected')) open = true;
    if (open) guarded.add(i);
    if (l.includes('</Stack.Protected>')) open = false;
  });
  // As abas ficam em "(tabs)"; o layout, a tela de endereço inexistente e o mapa do site não são telas da pilha.
  const all = screens(APP).filter((s) => !s.startsWith('(tabs)/') && !['_layout', '+not-found', '_sitemap'].includes(s));

  it('cada arquivo de tela tem a sua linha <Stack.Screen name="..." />, dentro de um Stack.Protected', () => {
    expect(all.length).toBeGreaterThan(60);
    const missing = all.filter((s) => !layout.includes(`<Stack.Screen name="${s}" />`));
    expect(missing).toEqual([]);
    const outside = all.filter((s) => !guarded.has(lines.findIndex((l) => l.includes(`<Stack.Screen name="${s}" />`))));
    // Fora da guarda de propósito: abrem sem sessão (links de convite e de benefício, a espera da sessão, a volta do e-mail
    // confirmado e o aviso de conta excluída) e não pedem o repositório antes de haver sessão.
    expect(outside).toEqual(['beneficio/[codigo]', 'carregando', 'confirmado', 'conta-excluida', 'convite/[codigo]']);
    expect(guarded.has(lines.findIndex((l) => l.includes('<Stack.Screen name="(tabs)" />')))).toBe(true);
  });

  it('a tela aberta pelo endereço sem sessão volta depois da entrada (ENTRY_PATH), com as exceções escritas aqui', () => {
    const source = layout.match(/const ENTRY_PATH =\s*\/(\^[^\n]+\$)\/;/)?.[1];
    expect(source, 'ENTRY_PATH escrito no layout').toBeTruthy();
    const entry = new RegExp(source!);
    const sample = (s: string) => `/${s.replace(/\/?index$/, '').replace('[mes]', '2026-10').replace(/\[[a-z]+\]/g, 'abc')}`;
    const notResumed = all.filter((s) => !entry.test(sample(s)));
    // Telas de entrada e de sessão, links de convite e benefício, e duas telas que de propósito só abrem pelo app: Importar (escolher o
    // arquivo no aparelho) e Excluir minha conta.
    expect(notResumed.sort()).toEqual(
      ['beneficio/[codigo]', 'boas-vindas', 'carregando', 'confirmado', 'confirmar-email', 'conta-excluida', 'conta/excluir', 'convite/[codigo]',
        'criar-conta', 'entrar', 'importar/index', 'nova-senha', 'primeira-conta', 'recuperar-acesso'].sort(),
    );
  });
});
