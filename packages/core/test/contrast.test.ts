/// <reference types="node" />
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  CONTRAST_LARGE,
  CONTRAST_TEXT,
  THEME_CONTRAST_PAIRS,
  blendOver,
  checkThemeContrast,
  contrastOfPair,
  contrastRatio,
  contrastTarget,
  hexToRgb,
  isLargeText,
  relativeLuminance,
} from '../src';

const APP_SRC = fileURLToPath(new URL('../../../apps/app/src/', import.meta.url));

/** As cores do tema, lidas do arquivo do app (sem importar o Expo): `nome: '#RRGGBB'` dentro de `export const colors`. */
function themeColors(): Record<string, string> {
  const text = readFileSync(join(APP_SRC, 'theme', 'tokens.ts'), 'utf8');
  const block = /export const colors = \{([\s\S]*?)\} as const;/.exec(text)?.[1] ?? '';
  const out: Record<string, string> = {};
  for (const m of block.matchAll(/^\s*(\w+):\s*'(#[0-9A-Fa-f]{6})'/gm)) out[m[1]!] = m[2]!.toUpperCase();
  return out;
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

describe('contraste: a conta do WCAG', () => {
  it('preto sobre branco é 21:1, igual sobre igual é 1:1, e a ordem das cores não importa', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5);
    expect(contrastRatio('#2457F5', '#FFFFFF')).toBeCloseTo(contrastRatio('#FFFFFF', '#2457F5'), 10);
  });

  it('valores de referência do WCAG: #767676 sobre branco passa por um fio (4,54), #777777 não (4,48)', () => {
    expect(contrastRatio('#767676', '#FFFFFF')).toBeGreaterThanOrEqual(CONTRAST_TEXT);
    expect(contrastRatio('#777777', '#FFFFFF')).toBeLessThan(CONTRAST_TEXT);
    expect(contrastRatio('#767676', '#FFFFFF')).toBeCloseTo(4.54, 2);
  });

  it('luminância relativa: branco 1, preto 0, e o trecho linear do sRGB (valores abaixo de 0,04045)', () => {
    expect(relativeLuminance([255, 255, 255])).toBeCloseTo(1, 10);
    expect(relativeLuminance([0, 0, 0])).toBe(0);
    expect(relativeLuminance([10, 10, 10])).toBeCloseTo(10 / 255 / 12.92, 10);
  });

  it('hexToRgb lê só #RRGGBB; blendOver mistura pela opacidade', () => {
    expect(hexToRgb('#2457F5')).toEqual([36, 87, 245]);
    expect(() => hexToRgb('#FFF')).toThrow();
    expect(() => hexToRgb('azul')).toThrow();
    expect(blendOver([255, 255, 255], [0, 0, 0], 0.5)).toEqual([127.5, 127.5, 127.5]);
    expect(blendOver([10, 20, 30], [200, 200, 200], 1)).toEqual([10, 20, 30]);
    expect(blendOver([10, 20, 30], [200, 200, 200], 0)).toEqual([200, 200, 200]);
  });

  it('texto grande: 24 px, ou 18,66 px em negrito; a meta cai de 4,5 para 3', () => {
    expect(isLargeText(24, false)).toBe(true);
    expect(isLargeText(23.9, false)).toBe(false);
    expect(isLargeText(18.66, true)).toBe(true);
    expect(isLargeText(18, true)).toBe(false);
    expect(contrastTarget('texto')).toBe(CONTRAST_TEXT);
    for (const k of ['texto grande', 'ícone', 'contorno'] as const) expect(contrastTarget(k)).toBe(CONTRAST_LARGE);
  });
});

describe('contraste: as cores do tema (D-062 item 5)', () => {
  const colors = themeColors();

  it('lê as cores do tema e a identidade não mudou (azul, lima e texto)', () => {
    expect(colors.brand).toBe('#2457F5');
    expect(colors.accent).toBe('#D4F05B');
    expect(colors.text).toBe('#17223B');
    expect(Object.keys(colors).length).toBeGreaterThanOrEqual(20);
  });

  it('os números escritos nos comentários do tema continuam valendo', () => {
    // tokens.ts: "branco/azul 5,59:1; texto/lima 12,36:1; secundário/branco 7,14:1", "placeholder 4,7:1", "borderStrong 3,4:1".
    expect(contrastRatio(colors.textOnBrand!, colors.brand!)).toBeCloseTo(5.59, 2);
    expect(contrastRatio(colors.text!, colors.accent!)).toBeCloseTo(12.36, 2);
    expect(contrastRatio(colors.textSecondary!, colors.surface!)).toBeCloseTo(7.14, 2);
    expect(contrastRatio(colors.placeholder!, colors.surface!)).toBeGreaterThanOrEqual(5.2);
    expect(contrastRatio(colors.placeholder!, colors.errorTint!)).toBeGreaterThanOrEqual(CONTRAST_TEXT);
    expect(contrastRatio(colors.borderStrong!, colors.surface!)).toBeGreaterThanOrEqual(3.3);
    expect(contrastRatio(colors.textOnBrandSoft!, colors.brand!)).toBeCloseTo(5.0, 1);
    expect(contrastRatio(colors.text!, colors.accentTint!)).toBeCloseTo(14.57, 2);
    expect(contrastRatio(colors.brandDeep!, colors.accentTint!)).toBeCloseTo(6.34, 2);
    expect(contrastRatio(colors.brandSoft!, colors.surface!)).toBeCloseTo(2.5, 1);
  });

  it('todo par da tabela chega à meta (4,5 para texto, 3 para texto grande, ícones e contornos), menos os que têm exceção explicada', () => {
    const failing = checkThemeContrast(colors)
      .filter((r) => !r.pair.exception && !r.ok)
      .map((r) => `${r.pair.use}: ${r.ratio.toFixed(2)} (meta ${r.target})`);
    expect(failing).toEqual([]);
  });

  it('as exceções são honestas: cada uma de fato fica abaixo da meta, tem motivo e é só estado desabilitado ou o segmento "em aberto"', () => {
    const exceptions = THEME_CONTRAST_PAIRS.filter((p) => p.exception);
    expect(exceptions.length).toBeGreaterThanOrEqual(3);
    for (const p of exceptions) {
      expect(p.exception!.length, p.use).toBeGreaterThan(30);
      const ratio = contrastOfPair(colors, p);
      expect(ratio, `${p.use} já passa: tire a exceção`).toBeLessThan(contrastTarget(p.kind));
      expect(/desabilitado|indisponível|em aberto/.test(p.use), p.use).toBe(true);
    }
  });

  it('o botão desabilitado (65% de opacidade) fica em 2,93:1: abaixo de 3, dispensado pelo WCAG 1.4.3 por estar desabilitado', () => {
    const pair = THEME_CONTRAST_PAIRS.find((p) => p.use.startsWith('Botão principal desabilitado'))!;
    expect(contrastOfPair(colors, pair)).toBeCloseTo(2.93, 2);
  });

  it('uma opacidade sem `behind` compõe sobre o fundo da tela', () => {
    const base = { use: 'x', fg: 'textOnBrand', bg: 'brand', kind: 'texto' as const };
    expect(contrastOfPair(colors, { ...base, opacity: 0.65 })).toBeCloseTo(contrastOfPair(colors, { ...base, opacity: 0.65, behind: 'background' }), 10);
    expect(contrastOfPair(colors, { ...base, opacity: 1 })).toBeCloseTo(contrastRatio(colors.textOnBrand!, colors.brand!), 10);
  });

  it('cada cor de texto do tema aparece na tabela (texto novo precisa de par conferido)', () => {
    const used = new Set(THEME_CONTRAST_PAIRS.flatMap((p) => [p.fg, p.bg]));
    for (const name of ['text', 'textSecondary', 'textOnBrand', 'textOnBrandSoft', 'brand', 'error', 'success', 'successText', 'placeholder', 'accent', 'brandPressed', 'brandDeep', 'surface', 'background', 'brandTint', 'accentTint', 'errorTint', 'successTint', 'borderStrong', 'brandSoft']) {
      expect(used.has(name), name).toBe(true);
    }
  });

  it('nenhum nome da tabela é desconhecido (erro de digitação em cor do tema)', () => {
    for (const p of THEME_CONTRAST_PAIRS) {
      for (const name of [p.fg, p.bg, p.behind].filter((x): x is string => Boolean(x))) {
        expect(name.startsWith('#') || name in colors, `${p.use}: ${name}`).toBe(true);
      }
    }
  });

  it('o app não usa cor literal fora do tema, a não ser as que a tabela conhece (cor nova entra na tabela antes)', () => {
    // Cores literais permitidas em apps/app/src: as da tabela de contraste, a tela escura da câmera (sem texto de cor própria)
    // e os valores do tema repetidos onde o tema ainda não chega (barra de estado).
    const themeValues = new Set(Object.values(colors).map((c) => c.toUpperCase()));
    const allowed = new Set(
      [...THEME_CONTRAST_PAIRS.flatMap((p) => [p.fg, p.bg]).filter((c) => c.startsWith('#')), '#E6EBF5', '#0E1526'].map((c) => c.toUpperCase()),
    );
    const offenders: string[] = [];
    for (const file of sourceFiles(APP_SRC)) {
      const rel = file.slice(APP_SRC.length);
      if (rel === join('theme', 'tokens.ts') || rel === join('theme', 'logo-paths.ts')) continue;
      for (const m of readFileSync(file, 'utf8').matchAll(/#[0-9A-Fa-f]{6}\b/g)) {
        const hex = m[0].toUpperCase();
        if (!themeValues.has(hex) && !allowed.has(hex)) offenders.push(`${rel}: ${hex}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
