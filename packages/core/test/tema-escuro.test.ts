/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CONTRAST_LARGE, CONTRAST_TEXT, THEME_CONTRAST_PAIRS, checkThemeContrast, contrastOfPair, contrastRatio, contrastTarget, relativeLuminance, hexToRgb } from '../src';
import { darkColors, levelColors, lightColors, paletteFor } from '../../../apps/app/src/theme/palettes';

/**
 * Modo escuro (D-096): as duas paletas do app (`apps/app/src/theme/palettes.ts`) têm as mesmas chaves e passam nos mesmos pares de
 * texto e fundo que as telas usam (`THEME_CONTRAST_PAIRS`): 4,5:1 para texto, 3:1 para texto grande, ícones e contornos. A paleta
 * escura é desenhada (azul-marinho com o matiz da marca, nada quase preto), com o azul e o lima da marca iguais aos do claro.
 */
const APP = fileURLToPath(new URL('../../../apps/app/', import.meta.url));
const PALETTES = { claro: lightColors, escuro: darkColors } as const;
const HEX = /^#[0-9A-Fa-f]{6}$/;

/** Só as cores opacas, que entram na conta de contraste (as translúcidas, como o véu das janelas, ficam fora). */
function opaque(palette: Readonly<Record<string, string>>): Record<string, string> {
  return Object.fromEntries(Object.entries(palette).filter(([, v]) => HEX.test(v)));
}

describe('modo escuro: as duas paletas', () => {
  it('têm as mesmas chaves, e cada cor é #RRGGBB ou um rgba() válido', () => {
    expect(Object.keys(darkColors).sort()).toEqual(Object.keys(lightColors).sort());
    for (const [name, palette] of Object.entries(PALETTES)) {
      for (const [key, value] of Object.entries(palette)) expect(HEX.test(value) || /^rgba\(\d+,\d+,\d+,0?\.\d+\)$/.test(value), `${name}.${key} = ${value}`).toBe(true);
    }
    expect(paletteFor('light')).toBe(lightColors);
    expect(paletteFor('dark')).toBe(darkColors);
  });

  it('a identidade fica: o azul cheio, o lima, o branco sobre o azul e o texto escuro sobre o lima são os mesmos nos dois temas', () => {
    for (const key of ['brand', 'brandPressed', 'brandDeep', 'accent', 'textOnBrand', 'textOnBrandSoft', 'textOnAccent', 'surfaceOnBrand', 'illustration'] as const) {
      expect(darkColors[key], key).toBe(lightColors[key]);
    }
    expect(lightColors.brand).toBe('#2457F5');
    expect(lightColors.accent).toBe('#D4F05B');
  });

  it('no claro, os tokens novos repetem as cores de antes (o modo claro não muda)', () => {
    expect(lightColors.brandText).toBe(lightColors.brand);
    expect(lightColors.brandMark).toBe(lightColors.brand);
    expect(lightColors.brandTextDeep).toBe(lightColors.brandDeep);
    expect(lightColors.brandMarkDeep).toBe(lightColors.brandDeep);
    expect(lightColors.textOnAccent).toBe(lightColors.text);
    expect(lightColors.surfaceOnBrand).toBe(lightColors.surface);
    expect(lightColors.muted).toBe('#E6EBF5');
    expect(lightColors.scrim).toBe('rgba(23,34,59,0.55)');
  });

  it('o escuro é azul-marinho com o matiz da marca: fundo escuro mas não quase preto, cartão um degrau mais claro e o azul claro mais um', () => {
    const lum = (hex: string) => relativeLuminance(hexToRgb(hex));
    const [r, g, b] = hexToRgb(darkColors.background);
    expect(b, 'o azul domina o fundo').toBeGreaterThan(r + 25);
    expect(b).toBeGreaterThan(g + 20);
    expect(lum(darkColors.background), 'escuro o bastante para texto claro').toBeLessThan(0.03);
    expect(lum(darkColors.background), 'sem área quase preta').toBeGreaterThan(0.01);
    expect(lum(darkColors.surface)).toBeGreaterThan(lum(darkColors.background));
    expect(lum(darkColors.brandTint)).toBeGreaterThan(lum(darkColors.surface));
    expect(contrastRatio(darkColors.surface, darkColors.background), 'o cartão se separa do fundo').toBeGreaterThanOrEqual(1.15);
    // O texto claro e o fundo escuro: o contrário do claro.
    expect(lum(darkColors.text)).toBeGreaterThan(0.8);
    expect(lum(lightColors.background)).toBeGreaterThan(0.9);
  });
});

describe('modo escuro: os pares de texto e fundo das telas, nas duas paletas', () => {
  for (const [name, palette] of Object.entries(PALETTES)) {
    it(`${name}: todo par da tabela chega à meta (4,5 para texto, 3 para texto grande, ícones e contornos), menos as exceções explicadas`, () => {
      const failing = checkThemeContrast(opaque(palette))
        .filter((r) => !r.pair.exception && !r.ok)
        .map((r) => `${r.pair.use}: ${r.ratio.toFixed(2)} (meta ${r.target})`);
      expect(failing).toEqual([]);
    });

    it(`${name}: as exceções são só estados desabilitados e o segmento "em aberto", que tem listras e rótulo`, () => {
      for (const p of THEME_CONTRAST_PAIRS.filter((x) => x.exception)) {
        expect(/desabilitado|indisponível|em aberto/.test(p.use), p.use).toBe(true);
        // Mesmo dispensado, o segmento "em aberto" ainda se vê (mais de 2:1) sobre o cartão.
        if (/em aberto/.test(p.use)) expect(contrastOfPair(opaque(palette), p), p.use).toBeGreaterThanOrEqual(2.4);
      }
    });

    it(`${name}: texto, secundário, azul de texto e erro passam sobre o fundo, o cartão e cada fundo claro em que aparecem`, () => {
      const bgs = ['surface', 'background', 'brandTint', 'accentTint', 'errorTint', 'successTint', 'muted'] as const;
      for (const bg of bgs) {
        expect(contrastRatio(palette.text, palette[bg]), `text / ${bg}`).toBeGreaterThanOrEqual(CONTRAST_TEXT);
        expect(contrastRatio(palette.textSecondary, palette[bg]), `textSecondary / ${bg}`).toBeGreaterThanOrEqual(CONTRAST_TEXT);
      }
      for (const bg of ['surface', 'background', 'brandTint', 'brandTintPressed', 'accentTint'] as const) {
        expect(contrastRatio(palette.brandText, palette[bg]), `brandText / ${bg}`).toBeGreaterThanOrEqual(CONTRAST_TEXT);
      }
      for (const bg of ['surface', 'background', 'errorTint'] as const) {
        expect(contrastRatio(palette.error, palette[bg]), `error / ${bg}`).toBeGreaterThanOrEqual(CONTRAST_TEXT);
        expect(contrastRatio(palette.placeholder, palette[bg]), `placeholder / ${bg}`).toBeGreaterThanOrEqual(CONTRAST_TEXT);
      }
      expect(contrastRatio(palette.success, palette.surface), 'success / surface').toBeGreaterThanOrEqual(CONTRAST_TEXT);
      expect(contrastRatio(palette.successText, palette.successTint), 'successText / successTint').toBeGreaterThanOrEqual(CONTRAST_TEXT);
      // Contorno de campo (3:1) sobre o cartão e o fundo, e a hierarquia: o secundário é mais fraco que o texto principal.
      expect(contrastRatio(palette.borderStrong, palette.surface)).toBeGreaterThanOrEqual(CONTRAST_LARGE);
      expect(contrastRatio(palette.borderStrong, palette.background)).toBeGreaterThanOrEqual(CONTRAST_LARGE);
      expect(contrastRatio(palette.textSecondary, palette.surface)).toBeLessThan(contrastRatio(palette.text, palette.surface));
    });

    it(`${name}: o texto escuro passa sobre o lima e sobre o selo de cada nível; o branco passa sobre o azul`, () => {
      expect(contrastRatio(palette.textOnAccent, palette.accent)).toBeGreaterThanOrEqual(CONTRAST_TEXT);
      for (const [level, fill] of Object.entries(levelColors)) expect(contrastRatio(palette.textOnAccent, fill), level).toBeGreaterThanOrEqual(CONTRAST_TEXT);
      expect(contrastRatio(palette.textOnBrand, palette.brand)).toBeGreaterThanOrEqual(CONTRAST_TEXT);
      expect(contrastRatio(palette.textOnBrandSoft, palette.brand)).toBeGreaterThanOrEqual(CONTRAST_TEXT);
      expect(contrastRatio(palette.brand, palette.surfaceOnBrand)).toBeGreaterThanOrEqual(CONTRAST_TEXT);
    });
  }

  it('no escuro, o azul da marca não serve de texto sobre o cartão (por isso `brandText`), e o texto claro não serve sobre o lima (por isso `textOnAccent`)', () => {
    expect(contrastRatio(darkColors.brand, darkColors.surface)).toBeLessThan(CONTRAST_TEXT);
    expect(contrastRatio(darkColors.text, darkColors.accent)).toBeLessThan(CONTRAST_TEXT);
    expect(contrastTarget('texto')).toBe(CONTRAST_TEXT);
  });
});

describe('modo escuro: o app segue o tema do aparelho, lido ao abrir', () => {
  const tokens = readFileSync(join(APP, 'src', 'theme', 'tokens.ts'), 'utf8');
  const layout = readFileSync(join(APP, 'src', 'app', '_layout.tsx'), 'utf8');
  const appJson = JSON.parse(readFileSync(join(APP, 'app.json'), 'utf8')) as { expo: { userInterfaceStyle: string } };
  const html = readFileSync(join(APP, 'public', 'index.html'), 'utf8');

  it('tokens.ts escolhe a paleta uma vez: prefers-color-scheme na web e Appearance no celular, e exporta o tema', () => {
    expect(tokens).toContain("window.matchMedia('(prefers-color-scheme: dark)')");
    expect(tokens).toContain('Appearance.getColorScheme()');
    expect(tokens).toMatch(/export const colorScheme: ColorScheme = deviceColorScheme\(\);/);
    expect(tokens).toMatch(/export const colors: Palette = paletteFor\(colorScheme\);/);
    // Nada de ouvir a troca com o app aberto, nem recarregar a página sozinho.
    expect(tokens).not.toMatch(/addChangeListener|addEventListener|location\.reload/);
  });

  it('no celular, o tema do processo fica preso ao da abertura; app.json segue o aparelho', () => {
    expect(layout).toMatch(/if \(Platform\.OS !== 'web'\) Appearance\.setColorScheme\(colorScheme\);/);
    expect(appJson.expo.userInterfaceStyle).toBe('automatic');
  });

  it('a página web declara os dois temas e pinta o fundo de cada um antes do app desenhar', () => {
    expect(html).toContain('<meta name="color-scheme" content="light dark" />');
    expect(html).toContain(`background-color: ${lightColors.background};`);
    expect(html).toMatch(new RegExp(`@media \\(prefers-color-scheme: dark\\)[\\s\\S]*background-color: ${darkColors.background};`));
  });
});
