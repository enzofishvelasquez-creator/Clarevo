/// <reference types="node" />
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import * as core from '../src';
import {
  DEFAULT_THEME_CHOICE,
  THEME_CHOICES,
  THEME_STORAGE_KEY,
  THEME_TEXT,
  isThemeChoice,
  parseThemeChoice,
  resolveThemeScheme,
  storedThemeValue,
  themeChoicePending,
  type ThemeChoice,
} from '../src';
import { darkColors, lightColors } from '../../../apps/app/src/theme/palettes';
import { APP_DIR, loadApp } from './app-sandbox';

/**
 * Conta › Tema (D-112, complementa a D-096): "Igual ao aparelho" (o padrão), "Claro" e "Escuro", guardado só neste aparelho e lido de
 * forma síncrona antes de as cores serem escolhidas. As regras ficam no núcleo (`theme-choice.ts`); aqui também rodam, sem aparelho, os
 * arquivos do app que guardam a escolha (`lib/theme-choice.ts` no celular e `lib/theme-choice.web.ts` na web) e o `theme/tokens.ts`.
 */
const SRC = path.join(APP_DIR, 'src');
const read = (rel: string) => readFileSync(path.join(SRC, rel), 'utf8');

const FORBIDDEN =
  /\b(recomendamos|recomendo|invista|aplique|tesouro|cdb|lci|lca|caixinha|cofrinho)\b|fundo de investimento|rentabilidade garantida|rendimento garantido|retorno garantido|enriquec|faz(er|endo)?\s+sentido|[–—]/i;

/** Todos os textos de um objeto de textos, também os aninhados. */
const allTexts = (o: unknown): string[] => (typeof o === 'string' ? [o] : o && typeof o === 'object' ? Object.values(o).flatMap(allTexts) : []);

describe('tema: as regras do núcleo', () => {
  it('três escolhas, na ordem da tela, com "Igual ao aparelho" como padrão', () => {
    expect(THEME_CHOICES).toEqual(['system', 'light', 'dark']);
    expect(DEFAULT_THEME_CHOICE).toBe('system');
    for (const c of THEME_CHOICES) expect(isThemeChoice(c)).toBe(true);
    for (const x of ['auto', 'Dark', '', null, undefined, 1, {}]) expect(isThemeChoice(x)).toBe(false);
    expect(THEME_STORAGE_KEY).toBe('clarevo.tema.v1');
  });

  it('o que foi guardado: só "light" e "dark" valem; o resto, ou nada, é o tema do aparelho', () => {
    expect(parseThemeChoice('light')).toBe('light');
    expect(parseThemeChoice('dark')).toBe('dark');
    expect(parseThemeChoice(' dark\n')).toBe('dark');
    for (const raw of [null, undefined, '', 'system', 'DARK', 'escuro', 'auto', '{"tema":"dark"}', 'dark light']) expect(parseThemeChoice(raw), String(raw)).toBe('system');
  });

  it('"Igual ao aparelho" não guarda nada (o padrão não deixa rastro); claro e escuro guardam o próprio nome, e a leitura devolve a escolha', () => {
    expect(storedThemeValue('system')).toBeNull();
    expect(storedThemeValue('light')).toBe('light');
    expect(storedThemeValue('dark')).toBe('dark');
    for (const c of THEME_CHOICES) expect(parseThemeChoice(storedThemeValue(c))).toBe(c);
  });

  it('o tema da abertura: a escolha vale por cima do aparelho; em "Igual ao aparelho", o do aparelho', () => {
    expect(resolveThemeScheme('system', 'light')).toBe('light');
    expect(resolveThemeScheme('system', 'dark')).toBe('dark');
    expect(resolveThemeScheme('light', 'dark')).toBe('light');
    expect(resolveThemeScheme('dark', 'light')).toBe('dark');
    expect(resolveThemeScheme('light', 'light')).toBe('light');
    expect(resolveThemeScheme('dark', 'dark')).toBe('dark');
  });

  it('"Aplicar agora" aparece só com uma escolha diferente da que vale nesta abertura', () => {
    for (const opening of THEME_CHOICES) for (const chosen of THEME_CHOICES) expect(themeChoicePending(chosen, opening)).toBe(chosen !== opening);
  });
});

describe('tema: os textos de Conta', () => {
  it('título, a frase que informa o padrão, as três opções e "Aplicar agora"', () => {
    expect(THEME_TEXT.section).toBe('Tema');
    expect(THEME_TEXT.intro).toBe('Por padrão, a Clarevo segue o tema do aparelho.');
    expect(THEME_CHOICES.map((c) => THEME_TEXT.labels[c])).toEqual(['Igual ao aparelho', 'Claro', 'Escuro']);
    expect(THEME_TEXT.apply).toBe('Aplicar agora');
    expect(THEME_TEXT.deviceOnly).toMatch(/só para este aparelho/);
  });

  it('dizem que a escolha vale na próxima abertura e que "Aplicar agora" reabre o app (na web, recarrega a página)', () => {
    expect(THEME_TEXT.pending).toMatch(/próxima vez que você abrir a Clarevo/);
    expect(THEME_TEXT.applyCaption.native).toMatch(/reabre o app com o novo tema/);
    expect(THEME_TEXT.applyCaption.web).toMatch(/recarrega a página com o novo tema/);
    expect(THEME_TEXT.applyFailed).toMatch(/próxima vez que você abrir a Clarevo/);
    expect(THEME_TEXT.applyDemo).toMatch(/demonstração/);
  });

  it('sem termo proibido, travessão, cobrança nem a Clarevo no masculino', () => {
    const texts = allTexts(THEME_TEXT);
    expect(texts.length).toBeGreaterThan(10);
    for (const t of texts) {
      expect(t, t).not.toMatch(FORBIDDEN);
      expect(t, t).not.toMatch(/\b(o|no|do|pelo|ao) Clarevo\b/);
      expect(t, t).not.toMatch(/\b(deve|precisa|obrigat)/i);
    }
  });
});

/** Um arquivo do aparelho de mentira (a API `File` do expo-file-system que o app usa), num mapa de caminho para conteúdo. */
function fakeFileSystem() {
  const disk = new Map<string, string>();
  const calls: string[] = [];
  class File {
    readonly uri: string;
    constructor(dir: { uri: string }, name: string) {
      this.uri = `${dir.uri}/${name}`;
    }
    get exists() {
      return disk.has(this.uri);
    }
    textSync() {
      calls.push('textSync');
      const v = disk.get(this.uri);
      if (v === undefined) throw new Error('não existe');
      return v;
    }
    write(content: string) {
      calls.push(`write ${content}`);
      disk.set(this.uri, content);
    }
    delete() {
      calls.push('delete');
      disk.delete(this.uri);
    }
  }
  return { disk, calls, module: { File, Paths: { document: { uri: 'file:///documentos' } } } };
}

const reactMock = { useSyncExternalStore: (_s: unknown, get: () => unknown) => get() };
const FILE = `file:///documentos/${THEME_STORAGE_KEY}`;

function loadNative(fs: ReturnType<typeof fakeFileSystem>, extra: Record<string, unknown> = {}) {
  const appearance = { setColorScheme: vi.fn() };
  const mod = loadApp(path.join(SRC, 'lib', 'theme-choice.ts'), {
    platform: 'android',
    mocks: { '@clarevo/core': core, 'expo-file-system': fs.module, react: reactMock, 'react-native': { Appearance: appearance }, ...extra },
  });
  return { mod, appearance };
}

describe('tema no celular (lib/theme-choice.ts, sem aparelho)', () => {
  it('lê a escolha de forma síncrona ao carregar, antes das cores; sem arquivo ou com conteúdo estranho, vale o aparelho', () => {
    const fs = fakeFileSystem();
    expect(loadNative(fs).mod.OPENING_THEME_CHOICE).toBe('system');
    fs.disk.set(FILE, 'dark');
    expect(loadNative(fs).mod.OPENING_THEME_CHOICE).toBe('dark');
    expect(fs.calls).toContain('textSync');
    fs.disk.set(FILE, 'roxo');
    expect(loadNative(fs).mod.OPENING_THEME_CHOICE).toBe('system');
  });

  it('se o pacote de arquivos falhar, vale o tema do aparelho (o app abre do mesmo jeito)', () => {
    const fs = fakeFileSystem();
    const broken = { ...fs.module, Paths: { get document(): never { throw new Error('sem acesso'); } } };
    const { mod } = loadNative({ ...fs, module: broken });
    expect(mod.OPENING_THEME_CHOICE).toBe('system');
    expect(mod.saveThemeChoice('dark')).toBe(false);
    expect(mod.useThemeChoice()).toBe('system');
  });

  it('guardar: claro e escuro escrevem o arquivo, "Igual ao aparelho" o apaga; sair da conta (forgetThemeChoice) apaga e volta ao padrão', () => {
    const fs = fakeFileSystem();
    const { mod } = loadNative(fs);
    expect(mod.saveThemeChoice('dark')).toBe(true);
    expect(fs.disk.get(FILE)).toBe('dark');
    expect(mod.useThemeChoice()).toBe('dark');
    expect(mod.OPENING_THEME_CHOICE).toBe('system');
    expect(mod.saveThemeChoice('light')).toBe(true);
    expect(fs.disk.get(FILE)).toBe('light');
    expect(mod.saveThemeChoice('system')).toBe(true);
    expect(fs.disk.has(FILE)).toBe(false);
    mod.saveThemeChoice('dark');
    mod.forgetThemeChoice();
    expect(fs.disk.has(FILE)).toBe(false);
    expect(mod.useThemeChoice()).toBe('system');
  });

  it('"Aplicar agora": troca o tema do processo para o escolhido ("unspecified" em "Igual ao aparelho") e reabre pelo expo-updates', async () => {
    const fs = fakeFileSystem();
    const reloadAsync = vi.fn(async () => {});
    const reloadAppAsync = vi.fn(async () => {});
    const { mod, appearance } = loadNative(fs, { 'expo-updates': { reloadAsync }, expo: { reloadAppAsync } });
    expect(await mod.applyThemeNow('dark', 'light')).toBe(true);
    expect(appearance.setColorScheme.mock.calls).toEqual([['dark']]);
    expect(reloadAsync).toHaveBeenCalledTimes(1);
    expect(reloadAppAsync).not.toHaveBeenCalled();
    expect(await mod.applyThemeNow('system', 'dark')).toBe(true);
    expect(appearance.setColorScheme.mock.calls.at(-1)).toEqual(['unspecified']);
  });

  it('em desenvolvimento (o expo-updates recusa), reabre pelo reload do Expo; se nada reabrir, o tema do processo volta ao da abertura', async () => {
    const fs = fakeFileSystem();
    const reloadAsync = vi.fn(async () => {
      throw new Error('ERR_UPDATES_DISABLED');
    });
    const reloadAppAsync = vi.fn(async () => {});
    const first = loadNative(fs, { 'expo-updates': { reloadAsync }, expo: { reloadAppAsync } });
    expect(await first.mod.applyThemeNow('light', 'dark')).toBe(true);
    expect(reloadAppAsync).toHaveBeenCalledTimes(1);
    const failing = vi.fn(async () => {
      throw new Error('sem reload');
    });
    const second = loadNative(fs, { 'expo-updates': { reloadAsync }, expo: { reloadAppAsync: failing } });
    expect(await second.mod.applyThemeNow('light', 'dark')).toBe(false);
    expect(second.appearance.setColorScheme.mock.calls).toEqual([['light'], ['dark']]);
  });
});

/** Um localStorage de mentira, posto no global só durante o carregamento e as chamadas. */
function withStorage<T>(initial: Record<string, string> | null, run: (store: Map<string, string>) => T): T {
  const store = new Map(Object.entries(initial ?? {}));
  const g = globalThis as Record<string, unknown>;
  const before = g.localStorage;
  g.localStorage =
    initial === null
      ? undefined
      : { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };
  try {
    return run(store);
  } finally {
    g.localStorage = before;
  }
}

const loadWeb = () => loadApp(path.join(SRC, 'lib', 'theme-choice.web.ts'), { platform: 'web', mocks: { '@clarevo/core': core, react: reactMock } });

describe('tema na web (lib/theme-choice.web.ts, sem navegador)', () => {
  it('lê o localStorage ao carregar; guarda claro e escuro na chave, "Igual ao aparelho" e sair da conta apagam a chave', () => {
    withStorage({}, (store) => {
      const mod = loadWeb();
      expect(mod.OPENING_THEME_CHOICE).toBe('system');
      expect(mod.saveThemeChoice('dark')).toBe(true);
      expect(store.get(THEME_STORAGE_KEY)).toBe('dark');
      expect(mod.saveThemeChoice('system')).toBe(true);
      expect(store.has(THEME_STORAGE_KEY)).toBe(false);
      mod.saveThemeChoice('light');
      mod.forgetThemeChoice();
      expect([...store.keys()]).toEqual([]);
      expect(mod.useThemeChoice()).toBe('system');
    });
    withStorage({ [THEME_STORAGE_KEY]: 'light' }, () => expect(loadWeb().OPENING_THEME_CHOICE).toBe('light'));
  });

  it('sem localStorage (navegação privada bloqueada), vale o tema do navegador e guardar avisa que não deu', () => {
    withStorage(null, () => {
      const mod = loadWeb();
      expect(mod.OPENING_THEME_CHOICE).toBe('system');
      expect(mod.saveThemeChoice('dark')).toBe(false);
      expect(mod.useThemeChoice()).toBe('system');
      expect(() => mod.forgetThemeChoice()).not.toThrow();
    });
  });

  it('as duas versões oferecem as mesmas funções', () => {
    const names = (src: string) => [...src.matchAll(/^export (?:async )?(?:const|function) (\w+)/gm)].map((m) => m[1]).sort();
    expect(names(read('lib/theme-choice.web.ts'))).toEqual(names(read('lib/theme-choice.ts')));
    expect(names(read('lib/theme-choice.ts'))).toEqual(['OPENING_THEME_CHOICE', 'applyThemeNow', 'forgetThemeChoice', 'saveThemeChoice', 'useThemeChoice']);
  });
});

describe('tema: as cores da abertura seguem a escolha (theme/tokens.ts)', () => {
  const loadTokens = (platform: 'web' | 'ios', choice: ThemeChoice, device: 'light' | 'dark') => {
    const g = globalThis as Record<string, unknown>;
    const before = g.window;
    g.window = { matchMedia: (q: string) => ({ matches: q === '(prefers-color-scheme: dark)' && device === 'dark' }) };
    try {
      return loadApp(path.join(SRC, 'theme', 'tokens.ts'), {
        platform,
        mocks: { '@/lib/theme-choice': { OPENING_THEME_CHOICE: choice }, 'react-native': { Appearance: { getColorScheme: () => device } } },
      });
    } finally {
      g.window = before;
    }
  };

  it.each(['web', 'ios'] as const)('%s: "Escuro" num aparelho claro é escuro, "Claro" num escuro é claro e "Igual ao aparelho" segue o aparelho', (platform) => {
    expect(loadTokens(platform, 'dark', 'light').colorScheme).toBe('dark');
    expect(loadTokens(platform, 'dark', 'light').colors).toEqual(darkColors);
    expect(loadTokens(platform, 'light', 'dark').colorScheme).toBe('light');
    expect(loadTokens(platform, 'light', 'dark').colors).toEqual(lightColors);
    expect(loadTokens(platform, 'system', 'dark').colorScheme).toBe('dark');
    expect(loadTokens(platform, 'system', 'light').colorScheme).toBe('light');
  });
});

describe('tema: as ligações no app', () => {
  const tokens = read('theme/tokens.ts');
  const web = read('lib/theme-choice.web.ts');
  const native = read('lib/theme-choice.ts');
  const card = read('components/theme-card.tsx');
  const conta = read('app/conta.tsx');
  const html = readFileSync(path.join(APP_DIR, 'public', 'index.html'), 'utf8');

  it('tokens.ts lê a escolha (de forma síncrona, no carregamento) antes de olhar o tema do aparelho', () => {
    expect(tokens).toContain("import { OPENING_THEME_CHOICE } from '@/lib/theme-choice';");
    expect(tokens).toContain("OPENING_THEME_CHOICE === 'system' ? deviceColorScheme() : OPENING_THEME_CHOICE");
    expect(native).toContain('file.textSync()');
    expect(native).not.toMatch(/from '@react-native-async-storage|await file|\.text\(\)/);
    expect(web).toContain('getItem(THEME_STORAGE_KEY)');
  });

  it('sem pacote nativo novo: o celular usa o expo-file-system, o expo-updates e o Expo, que o app já tem', () => {
    const pkg = JSON.parse(readFileSync(path.join(APP_DIR, 'package.json'), 'utf8')) as { dependencies: Record<string, string> };
    for (const dep of ['expo-file-system', 'expo-updates', 'expo']) expect(pkg.dependencies[dep], dep).toBeTruthy();
    const imported = [...native.matchAll(/(?:from |require\(|import\()'([^']+)'/g)].map((m) => m[1]);
    expect(new Set(imported)).toEqual(new Set(['@clarevo/core', 'expo-file-system', 'react', './theme-choice-memory', 'react-native', 'expo-updates', 'expo']));
  });

  it('o app só recarrega quando a pessoa toca em "Aplicar agora"', () => {
    expect(web.match(/location\.reload\(\)/g)).toHaveLength(1);
    expect(native).toContain('Updates.reloadAsync()');
    // A única chamada fica no card, no toque do botão.
    for (const [rel, text] of Object.entries({ tokens, conta, layout: read('app/_layout.tsx'), forget: read('lib/device-forget.ts') })) {
      expect(text, rel).not.toMatch(/applyThemeNow|location\.reload|reloadAsync|reloadAppAsync/);
    }
    expect(card.match(/applyThemeNow\(/g)).toHaveLength(1);
    expect(card).toContain('onPress={apply}');
  });

  it('Conta: o card "Tema" logo depois de "Privacidade neste aparelho" e antes do widget', () => {
    const at = (s: string) => conta.indexOf(s);
    expect(at('<PrivacyCard />')).toBeGreaterThan(0);
    expect(at('<ThemeCard />')).toBeGreaterThan(at('<PrivacyCard />'));
    expect(at('<WidgetCard />')).toBeGreaterThan(at('<ThemeCard />'));
    expect(card).toContain('accessibilityRole="radiogroup"');
    expect(card).toContain('THEME_TEXT.intro');
  });

  it('sair da conta e excluí-la esquecem a escolha (forgetDevice)', () => {
    expect(read('lib/device-forget.ts')).toMatch(/forgetSignupSourcePrefs\(userId\);\n\s+forgetThemeChoice\(\);/);
  });

  it('a página web lê a mesma chave antes de o app desenhar e pinta o fundo do tema escolhido', () => {
    expect(html).toContain(`localStorage.getItem('${THEME_STORAGE_KEY}')`);
    expect(html).toContain("document.documentElement.setAttribute('data-tema', tema);");
    expect(html).toContain('document.documentElement.style.colorScheme = tema;');
    expect(html).toMatch(new RegExp(`html\\[data-tema="light"\\] body \\{\\s*background-color: ${lightColors.background};`));
    expect(html).toMatch(new RegExp(`html\\[data-tema="dark"\\] body \\{\\s*background-color: ${darkColors.background};`));
    // O padrão continua o do aparelho (D-096).
    expect(html).toContain('<meta name="color-scheme" content="light dark" />');
  });

  it('o widget e o resumo em PDF não mudam: não leem a escolha nem as cores do app', () => {
    for (const rel of ['widget-native/android.tsx', 'widget-native/ios.tsx', 'lib/export-logo.ts']) {
      expect(read(rel), rel).not.toMatch(/theme-choice|theme\/tokens/);
    }
    expect(read('lib/export-logo.ts')).toContain("import { lightColors as paper } from '@/theme/palettes';");
  });
});
