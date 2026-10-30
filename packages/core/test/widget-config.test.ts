/// <reference types="node" />
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { WIDGET_NATIVE, WIDGET_ROUTES, WIDGET_TEXT } from '../src';

/**
 * Configuração do widget nativo (D-063 item 3, Ciclo AA): DESLIGADO por padrão. Sem `CLAREVO_WIDGET=1` a configuração do app é a de
 * antes, igual, e os builds `preview` e `production` não mudam. Ligado, só o perfil `preview-widget` do EAS acrescenta os plugins do
 * widget. Nada aqui chama a rede nem exige conta de loja; nenhuma chave, segredo ou identificador de conta é escrito nos arquivos do widget.
 */
const nodeRequire = createRequire(import.meta.url);
const raiz = (p: string) => fileURLToPath(new URL(`../../../${p}`, import.meta.url));
const ler = (p: string) => readFileSync(raiz(p), 'utf8');
const json = (p: string) => JSON.parse(ler(p)) as any;

const widgetConfig = nodeRequire(raiz('apps/app/widget.config.js')) as {
  FLAG: string;
  NATIVE_PACKAGES: string[];
  NAMES: { ios: string; androidSmall: string; androidMedium: string };
  DESCRIPTION: string;
  AUTOLINKING_PLUGIN: string;
  widgetEnabled: (env?: Record<string, string | undefined>) => boolean;
  widgetPlugins: () => any[];
  withWidget: (config: any, env?: Record<string, string | undefined>) => any;
  liftAutolinkingExclusion: (pkg: any) => { pkg: any; changed: boolean };
};
const appConfigFile = nodeRequire(raiz('apps/app/app.config.js')) as (ctx: { config: any }) => any;
const appJson = () => json('apps/app/app.json').expo;

const OFF = [undefined, '', '0', 'true', 'sim', ' 1', '1 ', 'on'] as const;

describe('widget: desligado por padrão (a configuração de hoje não muda)', () => {
  it('sem CLAREVO_WIDGET, app.config.js devolve exatamente o conteúdo de app.json', () => {
    const before = process.env.CLAREVO_WIDGET;
    delete process.env.CLAREVO_WIDGET;
    try {
      const config = appJson();
      const frozen = JSON.parse(JSON.stringify(config));
      const result = appConfigFile({ config });
      expect(result).toBe(config);
      expect(result).toEqual(frozen);
    } finally {
      if (before !== undefined) process.env.CLAREVO_WIDGET = before;
    }
  });

  it('só o valor exato "1" liga; qualquer outro (ou nenhum) deixa a configuração igual', () => {
    expect(widgetConfig.FLAG).toBe('CLAREVO_WIDGET');
    for (const value of OFF) {
      const config = appJson();
      expect(widgetConfig.widgetEnabled({ CLAREVO_WIDGET: value }), String(value)).toBe(false);
      expect(widgetConfig.withWidget(config, { CLAREVO_WIDGET: value })).toBe(config);
    }
    expect(widgetConfig.widgetEnabled({})).toBe(false);
    expect(widgetConfig.widgetEnabled({ CLAREVO_WIDGET: '1' })).toBe(true);
  });

  it('app.json não tem plugin, permissão nem texto do widget (nada do widget entra sem a variável)', () => {
    const text = ler('apps/app/app.json');
    expect(text).not.toMatch(/widget|appGroup|application-groups|appExtensions/i);
    const config = appJson();
    const names = (config.plugins as unknown[]).map((p) => (Array.isArray(p) ? p[0] : p));
    expect(names).toEqual(['expo-router', 'expo-splash-screen', 'expo-notifications', 'expo-image-picker', 'expo-camera', 'expo-local-authentication']);
    expect(config.android.permissions).toBeUndefined();
    expect(config.ios.entitlements).toBeUndefined();
    expect(config.ios.bundleIdentifier).toBe('app.clarevo');
    expect(config.scheme).toBe(WIDGET_NATIVE.scheme);
  });

  it('ligado, só acrescenta os plugins do widget ao fim de plugins e mais nada', () => {
    const config = appJson();
    const frozen = JSON.parse(JSON.stringify(config));
    const on = widgetConfig.withWidget(config, { CLAREVO_WIDGET: '1' });
    expect(config).toEqual(frozen); // não mexe no original
    const { plugins, ...rest } = on;
    const { plugins: original, ...restOriginal } = frozen;
    expect(rest).toEqual(restOriginal);
    expect(plugins.slice(0, original.length)).toEqual(original);
    const added = plugins.slice(original.length).map((p: unknown) => (Array.isArray(p) ? p[0] : p));
    expect(added).toEqual(['expo-widgets', 'react-native-android-widget', widgetConfig.AUTOLINKING_PLUGIN]);
  });

  it('o plugin local existe e é uma função de plugin', () => {
    expect(existsSync(raiz('apps/app/plugins/with-widget-autolinking.js'))).toBe(true);
    expect(widgetConfig.AUTOLINKING_PLUGIN).toBe('./plugins/with-widget-autolinking');
    expect(ler('apps/app/plugins/with-widget-autolinking.js')).toContain('withDangerousMod');
  });
});

describe('widget: nomes e textos combinados com o núcleo', () => {
  it('os nomes de widget.config.js são os de WIDGET_NATIVE, e a descrição é a de WIDGET_TEXT.explain', () => {
    expect(widgetConfig.NAMES).toEqual({ ios: WIDGET_NATIVE.ios, androidSmall: WIDGET_NATIVE.androidSmall, androidMedium: WIDGET_NATIVE.androidMedium });
    expect(widgetConfig.DESCRIPTION).toBe(WIDGET_TEXT.explain);
  });

  it('o iOS cria um widget pequeno e médio; o Android, um widget por tamanho, com o nome certo', () => {
    const [ios, android] = widgetConfig.widgetPlugins() as [[string, any], [string, any], string];
    expect(ios[1].widgets).toHaveLength(1);
    expect(ios[1].widgets[0].name).toBe(WIDGET_NATIVE.ios);
    expect(ios[1].widgets[0].ios.supportedFamilies).toEqual(['systemSmall', 'systemMedium']);
    // Nenhum identificador de grupo, de time ou de conta: o plugin deriva tudo do ios.bundleIdentifier.
    expect(Object.keys(ios[1]).sort()).toEqual(['widgets']);
    expect(android[1].widgets.map((w: { name: string }) => w.name)).toEqual([WIDGET_NATIVE.androidSmall, WIDGET_NATIVE.androidMedium]);
    const medium = android[1].widgets[1];
    expect(medium.updatePeriodMillis).toBeGreaterThanOrEqual(30 * 60 * 1000); // o mínimo do Android
    expect(android[1].widgets[0].label).toBe('Anotar gasto');
    expect(medium.label).toBe('Ainda a pagar');
  });

  it('o esquema do link e as rotas que o widget abre existem no app', () => {
    expect(appJson().scheme).toBe('clarevo');
    for (const route of [WIDGET_ROUTES.note, WIDGET_ROUTES.payables, WIDGET_ROUTES.signIn]) {
      const base = route.split('?')[0]!;
      const candidates = [`apps/app/src/app${base}.tsx`, `apps/app/src/app${base}/index.tsx`];
      expect(candidates.some((c) => existsSync(raiz(c))), route).toBe(true);
    }
  });
});

describe('widget: pacotes nativos instalados, mas fora de todo build sem o widget', () => {
  const pkg = () => json('apps/app/package.json');

  it('expo-widgets, @expo/ui e react-native-android-widget estão instalados nas versões do SDK 57', () => {
    const deps = pkg().dependencies as Record<string, string>;
    expect(deps['expo-widgets']).toMatch(/^~57\./);
    expect(deps['@expo/ui']).toMatch(/^~57\./);
    expect(deps['react-native-android-widget']).toMatch(/^\^?0\.\d+\.\d+$/);
    expect(json('node_modules/expo-widgets/package.json').version).toMatch(/^57\./);
    expect(json('node_modules/expo/bundledNativeModules.json')['expo-widgets']).toBe(deps['expo-widgets']);
  });

  it('o autolinking exclui exatamente os dois pacotes do widget; o @expo/ui, que o expo-router já liga hoje, não é excluído', () => {
    const exclude = pkg().expo.autolinking.exclude as string[];
    expect([...exclude].sort()).toEqual([...widgetConfig.NATIVE_PACKAGES].sort());
    expect(exclude).not.toContain('@expo/ui');
    expect(exclude).not.toContain('expo-router');
  });

  it('liftAutolinkingExclusion tira só os dois pacotes, é idempotente e limpa o que fica vazio', () => {
    const base = { name: 'x', expo: { autolinking: { exclude: ['expo-widgets', 'react-native-android-widget'] } }, scripts: { a: 'b' } };
    const lifted = widgetConfig.liftAutolinkingExclusion(base);
    expect(lifted.changed).toBe(true);
    expect(lifted.pkg).toEqual({ name: 'x', scripts: { a: 'b' } });
    expect(base.expo.autolinking.exclude).toHaveLength(2); // não mexe no original
    expect(widgetConfig.liftAutolinkingExclusion(lifted.pkg)).toEqual({ pkg: lifted.pkg, changed: false });
    const mixed = widgetConfig.liftAutolinkingExclusion({ expo: { autolinking: { exclude: ['outro', 'expo-widgets'], include: ['y'] }, other: 1 } });
    expect(mixed.pkg).toEqual({ expo: { autolinking: { exclude: ['outro'], include: ['y'] }, other: 1 } });
    expect(widgetConfig.liftAutolinkingExclusion({ name: 'z' })).toEqual({ pkg: { name: 'z' }, changed: false });
    expect(widgetConfig.liftAutolinkingExclusion({ expo: { autolinking: { exclude: ['outro'] } } }).changed).toBe(false);
  });

  it('o expo-router continua dono do @expo/ui, que já é ligado hoje (o motivo de não excluí-lo)', () => {
    expect(json('node_modules/expo-router/package.json').dependencies['@expo/ui']).toBeTruthy();
  });
});

describe('widget: perfis do EAS', () => {
  const eas = () => json('apps/app/eas.json');

  it('preview e production seguem exatamente como eram, sem a variável', () => {
    const { build } = eas();
    expect(build.preview).toEqual({
      distribution: 'internal',
      environment: 'preview',
      autoIncrement: true,
      android: { buildType: 'apk' },
      ios: { distribution: 'store' },
    });
    expect(build.production).toEqual({
      distribution: 'store',
      environment: 'production',
      autoIncrement: true,
      android: { buildType: 'app-bundle' },
    });
    expect(JSON.stringify(build.preview)).not.toContain('CLAREVO_WIDGET');
    expect(JSON.stringify(build.production)).not.toContain('CLAREVO_WIDGET');
    expect(eas().submit.production).toEqual({ android: { track: 'internal', releaseStatus: 'draft' }, ios: { language: 'pt-BR' } });
  });

  it('o perfil preview-widget parte do preview e só liga a variável', () => {
    const profile = eas().build['preview-widget'];
    expect(profile).toEqual({ extends: 'preview', env: { CLAREVO_WIDGET: '1' } });
    expect(Object.keys(eas().build).sort()).toEqual(['preview', 'preview-widget', 'production']);
  });
});

describe('widget: Metro (módulos vazios sem a variável; tarefa do Android com ela)', () => {
  const metro = raiz('apps/app/metro.config.js');
  const widgetNative = `${raiz('apps/app/src/widget-native')}${path.sep}`;

  function resolveAll(flag: string | undefined) {
    const script = `
      const Module = require('module');
      const original = Module._load;
      Module._load = function (request, ...rest) {
        if (request === 'expo/metro-config') return { getDefaultConfig: () => ({ resolver: {}, serializer: {} }) };
        return original.call(this, request, ...rest);
      };
      const config = require(${JSON.stringify(metro)});
      const widget = ${JSON.stringify(widgetNative)};
      const found = (filePath) => ({ resolveRequest: () => ({ type: 'sourceFile', filePath }) });
      const ask = (origin, name, platform, filePath) => config.resolver.resolveRequest({ ...found(filePath), originModulePath: origin }, name, platform);
      const entry = '/app/node_modules/expo-router/entry-classic.js';
      console.log(JSON.stringify({
        ios: ask('/app/src/lib/widget-bridge.ios.ts', '../widget-native/ios', 'ios', widget + 'ios.tsx'),
        android: ask('/app/src/lib/widget-bridge.android.ts', '../widget-native/android', 'android', widget + 'android.tsx'),
        other: ask('/app/src/lib/x.ts', './y', 'ios', '/app/src/lib/y.ts'),
        entryAndroid: ask(entry, 'expo-router/build/qualified-entry', 'android', '/app/node_modules/expo-router/build/qualified-entry.js'),
        entryIos: ask(entry, 'expo-router/build/qualified-entry', 'ios', '/app/node_modules/expo-router/build/qualified-entry.js'),
        entryWeb: ask(entry, 'expo-router/build/qualified-entry', 'web', '/app/node_modules/expo-router/build/qualified-entry.js'),
        otherOrigin: ask('/app/src/x.ts', 'expo-router/build/qualified-entry', 'android', '/app/node_modules/expo-router/build/qualified-entry.js'),
        icons: ask('/app/src/x.ts', 'lucide-react-native', 'ios', '/nada'),
      }));`;
    const env: NodeJS.ProcessEnv = { ...process.env };
    delete env.CLAREVO_WIDGET;
    if (flag !== undefined) env.CLAREVO_WIDGET = flag;
    return JSON.parse(execFileSync(process.execPath, ['-e', script], { env, encoding: 'utf8' })) as Record<string, { type: string; filePath?: string }>;
  }

  it('sem a variável: tudo em src/widget-native vira módulo vazio, e nada mais muda', () => {
    for (const flag of [undefined, '0']) {
      const r = resolveAll(flag);
      expect(r.ios).toEqual({ type: 'empty' });
      expect(r.android).toEqual({ type: 'empty' });
      expect(r.other).toEqual({ type: 'sourceFile', filePath: '/app/src/lib/y.ts' });
      for (const key of ['entryAndroid', 'entryIos', 'entryWeb', 'otherOrigin']) {
        expect(r[key], key).toEqual({ type: 'sourceFile', filePath: '/app/node_modules/expo-router/build/qualified-entry.js' });
      }
      expect(r.icons!.filePath).toMatch(/src[\\/]lib[\\/]lucide\.ts$/);
    }
  });

  it('com CLAREVO_WIDGET=1: os módulos do widget carregam, e só no Android o ponto de entrada do expo-router passa por android-entry.ts', () => {
    const r = resolveAll('1');
    expect(r.ios).toEqual({ type: 'sourceFile', filePath: `${widgetNative}ios.tsx` });
    expect(r.android).toEqual({ type: 'sourceFile', filePath: `${widgetNative}android.tsx` });
    expect(r.entryAndroid).toEqual({ type: 'sourceFile', filePath: `${widgetNative}android-entry.ts` });
    for (const key of ['entryIos', 'entryWeb', 'otherOrigin']) {
      expect(r[key], key).toEqual({ type: 'sourceFile', filePath: '/app/node_modules/expo-router/build/qualified-entry.js' });
    }
    expect(r.other).toEqual({ type: 'sourceFile', filePath: '/app/src/lib/y.ts' });
  });

  it('o ponto de entrada do expo-router que o Metro redireciona existe como esperado (se mudar numa versão nova, este teste avisa)', () => {
    const entry = ler('node_modules/expo-router/entry-classic.js');
    expect(entry).toContain("from 'expo-router/build/qualified-entry'");
    expect(json('apps/app/package.json').main).toBe('expo-router/entry');
    expect(ler('node_modules/expo-router/entry.js')).toContain("import 'expo-router/entry-classic'");
    expect(existsSync(raiz('node_modules/expo-router/build/qualified-entry.js'))).toBe(true);
    const wrapper = ler('apps/app/src/widget-native/android-entry.ts');
    expect(wrapper.indexOf("import './android-register'")).toBeGreaterThan(-1);
    expect(wrapper).toContain("export { App } from 'expo-router/build/qualified-entry'");
  });
});

describe('widget: a web, o Expo Go e os builds sem o widget não carregam nada nativo do widget', () => {
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const full = path.join(dir, name);
      return statSync(full).isDirectory() ? walk(full) : [full];
    });
  const src = raiz('apps/app/src');
  const NATIVE = /['"](expo-widgets|react-native-android-widget|@expo\/ui(\/[\w/-]+)?)['"]/;

  it('só src/widget-native importa expo-widgets, react-native-android-widget e @expo/ui', () => {
    const offenders = walk(src)
      .filter((f) => !f.includes(`${path.sep}widget-native${path.sep}`))
      .filter((f) => NATIVE.test(readFileSync(f, 'utf8')))
      .map((f) => path.relative(src, f));
    expect(offenders).toEqual([]);
  });

  it('as pontes só chegam a src/widget-native por require dentro de try; a versão da web não tem require nem import nativo', () => {
    const web = ler('apps/app/src/lib/widget-bridge.ts');
    expect(web).not.toMatch(/require\(|from '(?!@clarevo\/core)/);
    for (const file of ['widget-bridge.ios.ts', 'widget-bridge.android.ts']) {
      const text = ler(`apps/app/src/lib/${file}`);
      const calls = [...text.matchAll(/require\('([^']+)'\)/g)].map((m) => m[1]);
      expect(calls, file).toEqual([file.includes('ios') ? '../widget-native/ios' : '../widget-native/android']);
      expect(text, file).toMatch(/try \{[\s\S]*require\([\s\S]*\} catch/);
    }
    // Nenhum outro arquivo do app importa as pontes por um caminho de plataforma: a web e o aparelho resolvem `@/lib/widget-bridge`.
    const direct = walk(src).filter((f) => /widget-bridge\.(ios|android)['"]/.test(readFileSync(f, 'utf8')));
    expect(direct).toEqual([]);
  });

  it('o gravador do app só fala com a ponte e com o núcleo', () => {
    const text = ler('apps/app/src/lib/widget-sync.ts');
    const imports = [...text.matchAll(/from '([^']+)'/g)].map((m) => m[1]);
    expect(imports.sort()).toEqual(['@/lib/widget-bridge', '@clarevo/core']);
  });
});

describe('widget: nada de chave, segredo ou identificador de conta nos arquivos do widget', () => {
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const full = path.join(dir, name);
      return statSync(full).isDirectory() ? walk(full) : [full];
    });
  const files = [
    raiz('apps/app/widget.config.js'),
    raiz('apps/app/app.config.js'),
    raiz('apps/app/plugins/with-widget-autolinking.js'),
    raiz('apps/app/metro.config.js'),
    raiz('apps/app/eas.json'),
    raiz('packages/core/src/widget-sync.ts'),
    raiz('apps/app/src/lib/widget-sync.ts'),
    ...walk(raiz('apps/app/src/widget-native')),
    ...readdirSync(raiz('apps/app/src/lib')).filter((f) => f.startsWith('widget-bridge')).map((f) => raiz(`apps/app/src/lib/${f}`)),
  ];

  it('há arquivos do widget para conferir', () => {
    expect(files.length).toBeGreaterThanOrEqual(12);
  });

  it('nenhum arquivo traz time da Apple, projeto do EAS, chave, token ou arquivo de credencial', () => {
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      const name = path.relative(raiz(''), file);
      expect(text, name).not.toMatch(/appleTeamId\s*[:=]\s*['"][A-Z0-9]{10}['"]/);
      expect(text, name).not.toMatch(/projectId\s*['"]?\s*[:=]\s*['"][0-9a-f-]{8,}['"]/i);
      expect(text, name).not.toMatch(/-----BEGIN [A-Z ]*PRIVATE KEY-----|AIza[0-9A-Za-z_-]{20,}|sk_(live|test)_|eyJ[A-Za-z0-9_-]{20,}\./);
      expect(text, name).not.toMatch(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i);
      expect(text, name).not.toMatch(/\.(p8|p12|jks|mobileprovision)\b|service-account/i);
    }
  });

  it('o App Group e o identificador da extensão saem do bundleIdentifier, nunca escritos à mão', () => {
    const text = files.map((f) => readFileSync(f, 'utf8')).join('\n');
    expect(text).not.toMatch(/group\.app\.clarevo|groupIdentifier|app\.clarevo\.ExpoWidgetsTarget/);
  });
});
