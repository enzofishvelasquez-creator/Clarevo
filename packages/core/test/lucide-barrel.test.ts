/// <reference types="node" />
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Ícones do app (D-062 item 5, `docs/19`): o Metro troca `lucide-react-native` por `apps/app/src/lib/lucide.ts`, que traz só os ícones
 * usados. Importar o pacote inteiro põe 1.867 ícones no pacote web (2,1 MB a mais antes de comprimir). Se uma tela importa um ícone
 * que o arquivo não exporta, o app quebraria ao abrir essa tela: este teste pega isso antes.
 */
const APP = fileURLToPath(new URL('../../../apps/app/', import.meta.url));
const APP_SRC = join(APP, 'src');
const PACKAGE = fileURLToPath(new URL('../../../node_modules/lucide-react-native/dist/esm/', import.meta.url));

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

/** Nomes importados de 'lucide-react-native' como valor (os `type` ficam de fora: somem na compilação). */
function usedIcons(): Map<string, string[]> {
  const used = new Map<string, string[]>();
  for (const file of sourceFiles(APP_SRC)) {
    const rel = file.slice(APP_SRC.length + 1);
    if (rel === join('lib', 'lucide.ts')) continue;
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(/import\s+(type\s+)?\{([^}]*)\}\s*from\s*'lucide-react-native'/g)) {
      if (m[1]) continue;
      for (const part of m[2]!.split(',')) {
        const name = part.trim();
        if (!name || name.startsWith('type ')) continue;
        const icon = name.split(/\s+as\s+/)[0]!.trim();
        used.set(icon, [...(used.get(icon) ?? []), rel]);
      }
    }
  }
  return used;
}

/** Nome do ícone e arquivo (kebab-case) de cada linha de `lib/lucide.ts`. */
function barrel(): Map<string, string> {
  const text = readFileSync(join(APP_SRC, 'lib', 'lucide.ts'), 'utf8');
  const map = new Map<string, string>();
  for (const m of text.matchAll(/^export \{ default as (\w+) \} from 'lucide-react-native\/icons\/([a-z0-9-]+)';$/gm)) map.set(m[1]!, m[2]!);
  return map;
}

/** O que o pacote diz: nome (e apelidos) de cada ícone e o arquivo dele. */
function packageIcons(): Map<string, string> {
  const text = readFileSync(join(PACKAGE, 'lucide-react-native.mjs'), 'utf8');
  const map = new Map<string, string>();
  for (const m of text.matchAll(/export \{([^}]*)\} from '\.\/icons\/([^']+)\.mjs';/g)) {
    for (const part of m[1]!.split(',')) map.set(part.trim().split(' as ').pop()!, m[2]!);
  }
  return map;
}

describe('ícones do app: só os usados entram no pacote (D-062 item 5)', () => {
  it('toda tela que importa um ícone de lucide-react-native encontra o ícone em lib/lucide.ts', () => {
    const exported = barrel();
    const missing = [...usedIcons()].filter(([name]) => !exported.has(name)).map(([name, files]) => `${name} (${[...new Set(files)].join(', ')})`);
    expect(missing, 'acrescente a linha de cada ícone em apps/app/src/lib/lucide.ts').toEqual([]);
  });

  it('cada linha de lib/lucide.ts aponta para o arquivo que o pacote usa para aquele nome (nada de arquivo trocado nem inexistente)', () => {
    const real = packageIcons();
    expect(real.size).toBeGreaterThan(1500);
    const wrong: string[] = [];
    for (const [name, file] of barrel()) {
      if (real.get(name) !== file) wrong.push(`${name}: ${file} (o pacote diz ${real.get(name) ?? 'nenhum'})`);
      if (!existsSync(join(PACKAGE, 'icons', `${file}.mjs`))) wrong.push(`${name}: sem o arquivo ${file}.mjs`);
    }
    expect(wrong).toEqual([]);
  });

  it('o arquivo é de ícones usados: sem linha repetida e com bem menos que os 1.867 do pacote', () => {
    const lines = readFileSync(join(APP_SRC, 'lib', 'lucide.ts'), 'utf8').split('\n').filter((l) => l.startsWith('export {'));
    const names = lines.map((l) => /default as (\w+)/.exec(l)![1]);
    expect(new Set(names).size).toBe(names.length);
    expect(names.length).toBeGreaterThan(50);
    expect(names.length).toBeLessThan(300);
    // O que sobra no arquivo sem uso não quebra nada, mas pesa no pacote: o teste avisa quando passa de 10 a mais.
    const used = usedIcons();
    expect(names.filter((n) => !used.has(n!)).length).toBeLessThanOrEqual(10);
  });

  it('o Metro troca o pacote pelo arquivo (apps/app/metro.config.js) e nenhuma tela importa o pacote todo nem pelo require', () => {
    const config = readFileSync(join(APP, 'metro.config.js'), 'utf8');
    expect(config).toContain("moduleName === 'lucide-react-native'");
    expect(config).toContain("path.join(__dirname, 'src', 'lib', 'lucide.ts')");
    for (const file of sourceFiles(APP_SRC)) {
      const rel = file.slice(APP_SRC.length + 1);
      if (rel === join('lib', 'lucide.ts')) continue;
      const text = readFileSync(file, 'utf8');
      expect(text, `${rel}: importe os ícones pelo nome, não o pacote todo`).not.toMatch(/import\s+\*\s+as\s+\w+\s+from\s+'lucide-react-native'/);
      expect(text, `${rel}: sem require do pacote`).not.toMatch(/require\(\s*'lucide-react-native'\s*\)/);
      expect(text, `${rel}: sem import dinâmico do pacote`).not.toMatch(/import\(\s*'lucide-react-native'\s*\)/);
    }
  });
});
