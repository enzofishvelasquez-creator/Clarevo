/// <reference types="node" />
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * Fontes do app (D-063 item 2, `docs/19`): as cinco Manrope que o `useFonts` carrega são subconjuntos Latin em `apps/app/assets/fonts/`,
 * gerados por `scripts/gerar-fontes.js` (34 KB cada, no lugar dos 97 KB do pacote `@expo-google-fonts/manrope`). Um caractere dos
 * textos que ficasse de fora apareceria na fonte do sistema, no meio de um texto em Manrope. Este teste lê a tabela de caracteres
 * (cmap) de cada arquivo e confere que todo caractere escrito nos textos do core e do app está nos cinco.
 */
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const FONTS = join(ROOT, 'apps', 'app', 'assets', 'fonts');
const CORE_SRC = join(ROOT, 'packages', 'core', 'src');
const APP_SRC = join(ROOT, 'apps', 'app', 'src');
const WEIGHTS = ['400Regular', '500Medium', '600SemiBold', '700Bold', '800ExtraBold'] as const;
/** O pacote original tem 97 KB por peso; o subconjunto cabe em menos de 40 KB. */
const MAX_BYTES = 40_000;

/** Os caracteres de uma fonte TrueType: tabela `cmap`, formatos 4 (plano básico) e 12 (completo). */
function fontCodePoints(file: string): Set<number> {
  const buf = readFileSync(file);
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const tables = view.getUint16(4);
  let cmap = -1;
  for (let i = 0; i < tables; i++) {
    const at = 12 + 16 * i;
    if (buf.toString('latin1', at, at + 4) === 'cmap') cmap = view.getUint32(at + 8);
  }
  if (cmap < 0) throw new Error(`${file}: sem tabela cmap`);
  const found = new Set<number>();
  const subtables = view.getUint16(cmap + 2);
  for (let i = 0; i < subtables; i++) {
    const sub = cmap + view.getUint32(cmap + 4 + 8 * i + 4);
    const format = view.getUint16(sub);
    if (format === 4) {
      const segments = view.getUint16(sub + 6) / 2;
      const ends = sub + 14;
      const starts = ends + 2 * segments + 2;
      for (let s = 0; s < segments; s++) {
        const end = view.getUint16(ends + 2 * s);
        const start = view.getUint16(starts + 2 * s);
        if (start === 0xffff) continue;
        for (let c = start; c <= end; c++) found.add(c);
      }
    } else if (format === 12) {
      const groups = view.getUint32(sub + 12);
      for (let g = 0; g < groups; g++) {
        const at = sub + 16 + 12 * g;
        for (let c = view.getUint32(at); c <= view.getUint32(at + 4); c++) found.add(c);
      }
    }
  }
  return found;
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'node_modules' ? [] : sourceFiles(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

/** Cada caractere escrito em textos (cadeias, modelos de texto e texto de JSX; comentários ficam de fora) e onde aparece. */
function textCharacters(dir: string): Map<number, string[]> {
  const found = new Map<number, string[]>();
  for (const file of sourceFiles(dir)) {
    const rel = file.slice(ROOT.length);
    const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const add = (text: string) => {
      for (const ch of text) {
        const cp = ch.codePointAt(0)!;
        const where = found.get(cp) ?? [];
        if (where.length < 3 && !where.includes(rel)) where.push(rel);
        found.set(cp, where);
      }
    };
    const visit = (node: ts.Node) => {
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node) || ts.isJsxText(node)) add(node.text);
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return found;
}

/**
 * Caracteres que as cadeias do código usam e que nunca aparecem desenhados na tela: quebra de linha, tabulação e retorno (CSV, texto
 * de exportação e do PDF), o caractere nulo (separador interno de chaves) e a marca de ordem de bytes (U+FEFF) do começo do CSV.
 */
const NEVER_DRAWN = new Set([0x00, 0x09, 0x0a, 0x0d, 0xfeff]);

describe('fontes do app: subconjunto Latin da Manrope (D-063 item 2)', () => {
  const fonts = WEIGHTS.map((w) => ({ w, file: join(FONTS, `Manrope_${w}.ttf`) }));

  it('os cinco pesos que o tema usa existem em apps/app/assets/fonts, com menos de 40 KB cada', () => {
    const tokens = readFileSync(join(APP_SRC, 'theme', 'tokens.ts'), 'utf8');
    const used = [...tokens.matchAll(/'(Manrope_\w+)'/g)].map((m) => m[1]);
    expect(used.sort()).toEqual(WEIGHTS.map((w) => `Manrope_${w}`).sort());
    for (const { w, file } of fonts) {
      const size = statSync(file).size;
      expect(size, `Manrope_${w}.ttf`).toBeGreaterThan(20_000);
      expect(size, `Manrope_${w}.ttf passa de ${MAX_BYTES} B: o subconjunto deveria ter só o Latin`).toBeLessThan(MAX_BYTES);
    }
  });

  it('todo caractere escrito nos textos do core e do app está nos cinco arquivos', { timeout: 30_000 }, () => {
    const texts = new Map<number, string[]>();
    for (const dir of [CORE_SRC, APP_SRC]) for (const [cp, where] of textCharacters(dir)) texts.set(cp, [...(texts.get(cp) ?? []), ...where].slice(0, 3));
    // O teste enxerga os textos de verdade (e não uma pasta vazia): português acentuado, símbolos e o "R$" estão lá.
    for (const ch of ['ç', 'ã', 'é', 'º', '·', '…', '→', '≈', '−', '‹', '›', '•', 'R', '$']) expect(texts.has(ch.codePointAt(0)!), `${ch} deveria aparecer nos textos`).toBe(true);
    expect(texts.size).toBeGreaterThan(150);
    for (const { w, file } of fonts) {
      const has = fontCodePoints(file);
      const missing = [...texts]
        .filter(([cp]) => !NEVER_DRAWN.has(cp) && !has.has(cp))
        .map(([cp, where]) => `U+${cp.toString(16).toUpperCase().padStart(4, '0')} ${JSON.stringify(String.fromCodePoint(cp))} em ${where.join(', ')}`);
      expect(missing, `Manrope_${w}.ttf: acrescente o caractere em UNICODES de scripts/gerar-fontes.js e rode o script`).toEqual([]);
    }
  });

  it('os cinco pesos têm exatamente os mesmos caracteres, com letras acentuadas, cedilha, ordinais, aspas e símbolos', () => {
    const sets = fonts.map(({ file }) => fontCodePoints(file));
    for (const set of sets) expect([...set].sort((a, b) => a - b)).toEqual([...sets[0]!].sort((a, b) => a - b));
    const need = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 R$ ÁÀÂÃÉÊÍÓÔÕÚÜÇáàâãéêíóôõúüç ªº°·§×÷ ‘’“”•…‹›→−≈   % + , . : ; ! ? ( ) / - _ "\'';
    const lacking = [...new Set(need)].filter((ch) => ch !== ' ' && !sets[0]!.has(ch.codePointAt(0)!));
    expect(lacking).toEqual([]);
    // Os textos do produto não usam travessão (CLAUDE.md): a fonte não carrega o desenho.
    expect(sets[0]!.has(0x2013)).toBe(false);
    expect(sets[0]!.has(0x2014)).toBe(false);
  });

  it('o app carrega as fontes de apps/app/assets/fonts e não importa o pacote @expo-google-fonts (que segue instalado)', () => {
    const layout = readFileSync(join(APP_SRC, 'app', '_layout.tsx'), 'utf8');
    for (const w of WEIGHTS) expect(layout).toContain(`Manrope_${w}: require('../../assets/fonts/Manrope_${w}.ttf')`);
    for (const file of sourceFiles(APP_SRC)) expect(readFileSync(file, 'utf8'), file.slice(ROOT.length)).not.toMatch(/from\s*['"]@expo-google-fonts\//);
    const pkg = JSON.parse(readFileSync(join(ROOT, 'apps', 'app', 'package.json'), 'utf8')) as { dependencies: Record<string, string> };
    expect(pkg.dependencies['@expo-google-fonts/manrope']).toBeDefined();
  });

  it('a licença da fonte (OFL) vai junto dos arquivos', () => {
    const license = readFileSync(join(FONTS, 'OFL.txt'), 'utf8');
    expect(license).toContain('SIL OPEN FONT LICENSE Version 1.1');
    expect(license).toContain('The Manrope Project Authors');
  });
});
