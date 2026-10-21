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

/**
 * Um React de mentira para montar, sem DOM nem aparelho, um componente de efeitos (sem tela) como `components/device-features.tsx`:
 * `useState`, `useRef`, `useEffect` e o cache do React Compiler (`react/compiler-runtime`), e um montador que renderiza o componente e
 * os componentes filhos, roda os efeitos cujas dependências mudaram e repete enquanto algum estado mudar. Os módulos de mentira vão em
 * `mocks` de `loadApp` (`harness.mocks`), junto com os que o teste escolher. Para renderizar de novo depois de mudar o que os mocks
 * devolvem, `rerender()`. Não faz parte do app nem do pacote do núcleo.
 */
export function createHooksHarness() {
  interface Fiber {
    slots: any[];
    children: Map<string, Fiber>;
    type: (props: any) => unknown;
  }
  const newFiber = (type: Fiber['type']): Fiber => ({ slots: [], children: new Map(), type });

  let current: Fiber | null = null;
  let cursor = 0;
  let pending: (() => void)[] = [];
  let dirty = false;
  let committing = false;
  let mounted = false;
  let root: Fiber | null = null;
  let rootProps: unknown;

  const slot = <T>(init: () => T): T => {
    const fiber = current!;
    if (cursor >= fiber.slots.length) fiber.slots.push(init());
    return fiber.slots[cursor++] as T;
  };

  const schedule = () => {
    dirty = true;
    if (!committing && mounted) queueMicrotask(commit);
  };

  const react = {
    useState(initial: unknown) {
      const state = slot(() => {
        const s: { value: unknown; set: (next: unknown) => void } = {
          value: typeof initial === 'function' ? (initial as () => unknown)() : initial,
          set: (next) => {
            const value = typeof next === 'function' ? (next as (prev: unknown) => unknown)(s.value) : next;
            if (Object.is(value, s.value)) return;
            s.value = value;
            schedule();
          },
        };
        return s;
      });
      return [state.value, state.set];
    },
    useRef(initial: unknown) {
      return slot(() => ({ current: initial }));
    },
    useEffect(effect: () => void | (() => void), deps?: unknown[]) {
      const s = slot(() => ({ ran: false, deps: undefined as unknown[] | undefined, cleanup: undefined as (() => void) | undefined }));
      const changed = !s.ran || !deps || !s.deps || deps.length !== s.deps.length || deps.some((d, i) => !Object.is(d, s.deps![i]));
      if (!changed) return;
      pending.push(() => {
        s.cleanup?.();
        s.cleanup = undefined;
        const out = effect();
        s.cleanup = typeof out === 'function' ? out : undefined;
        s.ran = true;
        s.deps = deps;
      });
    },
  };
  const compilerRuntime = { c: (size: number) => slot(() => Array.from({ length: size }, () => Symbol.for('react.memo_cache_sentinel'))) };

  function walk(parent: Fiber, node: any, path: string, seen: Set<string>) {
    if (node === null || node === undefined || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach((child, i) => walk(parent, child, `${path}.${i}`, seen));
      return;
    }
    if (typeof node.type === 'function') {
      const key = `${path}:${node.type.name}`;
      seen.add(key);
      let child = parent.children.get(key);
      if (!child || child.type !== node.type) {
        child = newFiber(node.type);
        parent.children.set(key, child);
      }
      render(child, node.props);
      return;
    }
    walk(parent, node.props?.children, `${path}.c`, seen);
  }

  function render(fiber: Fiber, props: unknown) {
    const before = { fiber: current, cursor };
    current = fiber;
    cursor = 0;
    let out: unknown;
    try {
      out = fiber.type(props);
    } finally {
      current = before.fiber;
      cursor = before.cursor;
    }
    const seen = new Set<string>();
    // O que o componente devolve: os filhos que também são componentes de função são renderizados (os de mentira devolvem null).
    walk(fiber, out, '', seen);
    for (const key of [...fiber.children.keys()]) if (!seen.has(key)) fiber.children.delete(key);
  }

  function commit() {
    if (!mounted || !root || committing) return;
    committing = true;
    try {
      for (let pass = 0; pass < 25; pass++) {
        dirty = false;
        render(root, rootProps);
        const run = pending;
        pending = [];
        for (const effect of run) effect();
        if (!dirty) return;
      }
      throw new Error('O componente não parou de renderizar (mais de 25 passadas)');
    } finally {
      committing = false;
    }
  }

  function cleanupAll(fiber: Fiber) {
    for (const child of fiber.children.values()) cleanupAll(child);
    for (const s of fiber.slots) if (s && typeof s === 'object' && typeof s.cleanup === 'function') s.cleanup();
  }

  return {
    /** Módulos de mentira para `loadApp`: `react` e `react/compiler-runtime`. */
    mocks: { react, 'react/compiler-runtime': compilerRuntime } as Record<string, unknown>,
    /** Monta o componente e roda os efeitos; devolve como renderizar de novo e como desmontar (roda as limpezas). */
    mount(component: (props: any) => unknown, props: unknown = {}) {
      root = newFiber(component);
      rootProps = props;
      mounted = true;
      commit();
      return {
        rerender: commit,
        unmount() {
          mounted = false;
          cleanupAll(root!);
        },
      };
    },
  };
}
