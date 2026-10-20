/// <reference types="node" />
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DEMO_PILL_MAX_FONT_SCALE, STACK_BELOW_WIDTH, STACK_FROM_FONT_SCALE, clampedLines, isStackedLayout } from '../src';

const APP_SRC = fileURLToPath(new URL('../../../apps/app/src/', import.meta.url));
const appFiles = () => (readdirSync(APP_SRC, { recursive: true }) as string[]).filter((f) => /\.(ts|tsx|js|jsx)$/.test(f));
const read = (rel: string) => readFileSync(join(APP_SRC, rel), 'utf8');
/** O corpo de uma função de nível mais alto do arquivo (do `function nome` até a chave que fecha na coluna 0). */
const body = (rel: string, name: string) => new RegExp(`function ${name}\\b[\\s\\S]*?\\n}\\n`).exec(read(rel))?.[0] ?? '';

describe('letra grande (D-062 item 5)', () => {
  it('a linha empilha em tela estreita (menos de 360 px) ou com letra acima de 1,3; no limite, não', () => {
    expect(STACK_BELOW_WIDTH).toBe(360);
    expect(STACK_FROM_FONT_SCALE).toBe(1.3);
    expect(isStackedLayout(390, 1)).toBe(false);
    expect(isStackedLayout(360, 1)).toBe(false);
    expect(isStackedLayout(359, 1)).toBe(true);
    expect(isStackedLayout(320, 1)).toBe(true);
    expect(isStackedLayout(390, 1.3)).toBe(false);
    expect(isStackedLayout(390, 1.31)).toBe(true);
    expect(isStackedLayout(390, 2)).toBe(true);
  });

  it('as telas chamam isStackedLayout em vez de repetir a regra (o teste acima vale para elas)', () => {
    const copies = appFiles().filter((f) => /\bwidth\s*<\s*360\b[^\n;]*\bfontScale\s*>\s*1\.3\b|\bfontScale\s*>\s*1\.3\b[^\n;]*\bwidth\s*<\s*360\b/.test(read(f)));
    expect(copies, 'troque a conta própria por isStackedLayout(width, fontScale)').toEqual([]);
    const calls = appFiles().reduce((n, f) => n + (read(f).match(/\bisStackedLayout\(\s*width\s*,\s*fontScale\s*\)/g)?.length ?? 0), 0);
    expect(calls).toBeGreaterThanOrEqual(10);
  });

  it('o título de lista tem o limite de linhas com a letra normal e fica sem limite com letra grande', () => {
    expect(clampedLines(2, 1)).toBe(2);
    expect(clampedLines(2, 1.0001)).toBeUndefined();
    expect(clampedLines(2, 1.3)).toBeUndefined();
    expect(clampedLines(2, 2)).toBeUndefined();
    expect(clampedLines(1, 1)).toBe(1);
  });

  it('o selo da demonstração cresce só até 1,3 vez: o componente e a conta do olho do cabeçalho usam o teto', () => {
    expect(DEMO_PILL_MAX_FONT_SCALE).toBe(1.3);
    expect(body('components/ui.tsx', 'DemoPill'), 'DemoPill (ui.tsx) sem o teto').toContain('maxFontSizeMultiplier={DEMO_PILL_MAX_FONT_SCALE}');
    expect(body('components/header.tsx', 'eyeFits'), 'eyeFits (header.tsx) sem o teto').toContain('Math.min(DEMO_PILL_MAX_FONT_SCALE,');
  });
});
