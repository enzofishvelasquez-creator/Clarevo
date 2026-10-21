/// <reference types="node" />
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Carrega arquivos do app (`apps/app`) dentro dos testes do núcleo, sem aparelho nem Metro: o código passa pelo mesmo Babel do Expo
 * (`babel-preset-expo`, com o React Compiler ligado como em app.json), roda como CommonJS e recebe de mentira só o que é nativo. Serve
 * para provar, no que o app grava para o widget, o que não dá para provar de outro jeito sem um aparelho: que o código roda sem o módulo
 * nativo, que o que chega ao widget é o que o núcleo decidiu e que o widget do iOS só usa o que a extensão oferece.
 * Não faz parte do app nem do pacote do núcleo.
 */
const nodeRequire = createRequire(import.meta.url);
const babel = nodeRequire('@babel/core');

export const APP_DIR = fileURLToPath(new URL('../../../apps/app/', import.meta.url));

export type Platform = 'ios' | 'android' | 'web';

/** Um módulo que lança ao ser carregado, como o módulo nativo que não existe no Expo Go. */
export class Throws {
  constructor(public readonly error: Error) {}
}

export function compile(file: string, platform: Platform, source = readFileSync(file, 'utf8')): string {
  const out = babel.transformSync(source, {
    filename: file,
    babelrc: false,
    configFile: false,
    presets: [[nodeRequire.resolve('babel-preset-expo'), {}]],
    caller: { name: 'metro', bundler: 'metro', platform, isDev: false, isServer: false, supportsReactCompiler: true, engine: 'hermes' },
    sourceType: 'module',
  });
  return out.code as string;
}

export interface LoadOptions {
  platform: Platform;
  /** Módulos de mentira, pelo texto exato do import (`'react-native-android-widget'`, `'../widget-native/ios'`, `'@/lib/widget-bridge'`). */
  mocks?: Record<string, unknown>;
}

const EXTENSIONS = ['.ts', '.tsx', '.js'];

function resolveFile(spec: string, from: string): string {
  const base = spec.startsWith('@/') ? path.join(APP_DIR, 'src', spec.slice(2)) : path.resolve(path.dirname(from), spec);
  const found = [base, ...EXTENSIONS.map((ext) => base + ext)].find((candidate) => existsSync(candidate) && statSync(candidate).isFile());
  if (!found) throw new Error(`Módulo do app não encontrado: ${spec} (a partir de ${from})`);
  return found;
}

/** Roda um arquivo do app e devolve os seus `exports`. Imports relativos e `@/` carregam os outros arquivos do app, na mesma plataforma. */
export function loadApp(file: string, options: LoadOptions): Record<string, any> {
  const cache = new Map<string, Record<string, any>>();
  const mocks = options.mocks ?? {};
  const load = (target: string): Record<string, any> => {
    const hit = cache.get(target);
    if (hit) return hit;
    const module = { exports: {} as Record<string, any> };
    cache.set(target, module.exports);
    const req = (spec: string): unknown => {
      if (spec in mocks) {
        const mock = mocks[spec];
        if (mock instanceof Throws) throw mock.error;
        return mock;
      }
      if (spec.startsWith('.') || spec.startsWith('@/')) return load(resolveFile(spec, target));
      return nodeRequire(spec);
    };
    const code = compile(target, options.platform);
    new Function('module', 'exports', 'require', code)(module, module.exports, req);
    cache.set(target, module.exports);
    return module.exports;
  };
  return load(file);
}
