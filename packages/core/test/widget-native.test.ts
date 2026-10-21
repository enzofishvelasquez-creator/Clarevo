/// <reference types="node" />
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import * as core from '../src';
import {
  DEMO_TODAY,
  WIDGET_HIDDEN_MONEY,
  WIDGET_NATIVE,
  WIDGET_ROUTES,
  WIDGET_TEXT,
  addDays,
  contrastRatio,
  createDemoRepository,
  nextLocalMidnight,
  planWidgetSync,
  summarizeToPay,
  widgetContentToday,
  widgetUrl,
  type Commitment,
  type WidgetInput,
  type WidgetSyncPlan,
} from '../src';
import { APP_DIR, Throws, compile, loadApp } from './app-sandbox';

/**
 * O código nativo do widget (D-063 item 3, Ciclo AA) sem aparelho: o widget do iOS, os do Android, as pontes e o gravador do app passam
 * pelo mesmo Babel do Expo, rodam em CommonJS e recebem de mentira só o que é nativo. Prova o que dá para provar fora de um iPhone e de um
 * Android: que o widget do iOS só usa o que a extensão oferece e desenha o que o núcleo montou, que o código do app roda sem o módulo
 * nativo (web, Expo Go, build sem o widget) sem ler a rede nem lançar erro, e que na demonstração nada é gravado.
 */

const SRC = path.join(APP_DIR, 'src');
const REPO = path.join(APP_DIR, '..', '..');
const read = (file: string) => readFileSync(file, 'utf8');

async function demoToPay() {
  const repo = await createDemoRepository();
  const ctx = (await repo.getSpace())!.personalContextId;
  return summarizeToPay(await repo.listCommitments(ctx, '2026-10'), ctx, '2026-10', DEMO_TODAY);
}
const input = (over: Partial<WidgetInput>): WidgetInput => ({ today: DEMO_TODAY, signedIn: true, demo: false, showValues: false, toPay: null, ...over });
/** O app usa o dia de hoje do aparelho; nos testes o relógio fica no dia da demonstração (07/10/2026). */
const withDemoClock = async <T>(run: () => Promise<T>) => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-07T15:00:00-03:00'));
  try {
    return await run();
  } finally {
    vi.useRealTimers();
  }
};
function writePlan(plan: WidgetSyncPlan) {
  if (!plan.write) throw new Error('esperava gravar');
  return plan;
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Widget do iOS: a função serializada roda na extensão, só com o que a extensão oferece.
// ---------------------------------------------------------------------------------------------------------------------------------

const SWIFT_UI = path.join(REPO, 'node_modules', '@expo', 'ui', 'build', 'swift-ui');

/** Nomes que o JavaScript da extensão oferece: tudo o que `@expo/ui/swift-ui` e `@expo/ui/swift-ui/modifiers` exportam (expo-widgets/bundle/index.ts). */
function runtimeNames(entry: string, seen = new Set<string>()): string[] {
  const file = [`${entry}.d.ts`, path.join(entry, 'index.d.ts')].find((candidate) => {
    try {
      return readFileSync(candidate, 'utf8') !== '';
    } catch {
      return false;
    }
  });
  if (!file || seen.has(file)) return [];
  seen.add(file);
  const text = read(file);
  const names: string[] = [];
  for (const m of text.matchAll(/^export declare (?:function|const|class|let|var) (\w+)/gm)) names.push(m[1]!);
  for (const m of text.matchAll(/^export \{([^}]*)\}/gm)) {
    for (const item of m[1]!.split(',')) {
      const parts = item.trim().split(/\s+/);
      if (parts[0] === 'type' || parts[0] === '') continue;
      names.push(parts[parts.length - 1]!);
    }
  }
  for (const m of text.matchAll(/^export \* from '(\.[^']+)'/gm)) names.push(...runtimeNames(path.resolve(path.dirname(file), m[1]!), seen));
  return names;
}

const BUILTINS = new Set(['Object', 'Array', 'String', 'Number', 'Boolean', 'Math', 'Date', 'JSON', 'Infinity', 'NaN', 'undefined', 'parseInt', 'parseFloat', 'isNaN']);

interface Node {
  type?: string;
  modifier?: string;
  args?: unknown[];
  props?: { children?: unknown; modifiers?: Node[]; [key: string]: unknown };
}

/** Roda o layout serializado como a extensão roda: sem nada fora dos nomes dela. Qualquer nome fora dela é ReferenceError. */
function renderLayout(layout: string, props: unknown, family: 'systemSmall' | 'systemMedium'): Node {
  const globals: Record<string, unknown> = {};
  for (const name of [...runtimeNames(SWIFT_UI), ...runtimeNames(path.join(SWIFT_UI, 'modifiers'))]) {
    globals[name] = /^[A-Z]/.test(name)
      ? (p: Node['props']) => ({ type: name, props: p ?? {} })
      : (...args: unknown[]) => ({ modifier: name, args });
  }
  const jsx = (type: unknown, p: Node['props']) => (typeof type === 'function' ? type(p) : { type, props: p });
  Object.assign(globals, { _jsx: jsx, _jsxs: jsx, _jsxDEV: jsx });
  const scope = new Proxy(
    {},
    {
      has: () => true,
      get(_target, key) {
        if (typeof key === 'symbol') return undefined;
        if (key in globals) return globals[key];
        if (BUILTINS.has(key)) return (globalThis as Record<string, unknown>)[key];
        throw new ReferenceError(`${key} is not defined`);
      },
    },
  );
  const fn = new Function('scope', `with (scope) { return (${layout}); }`)(scope) as (p: unknown, e: unknown) => Node;
  return fn(props, { widgetFamily: family, date: new Date('2026-10-07T12:00:00Z') });
}

function widgetOfIos() {
  const created: { name: string; layout: string }[] = [];
  const mod = loadApp(path.join(SRC, 'widget-native', 'ios.tsx'), {
    platform: 'ios',
    mocks: {
      '@clarevo/core': core,
      '@expo/ui/swift-ui': {},
      '@expo/ui/swift-ui/modifiers': {},
      'expo-widgets': {
        createWidget: (name: string, layout: string) => {
          created.push({ name, layout });
          return { name, layout };
        },
      },
    },
  });
  return { created, widget: mod.default as { name: string; layout: string } };
}

const children = (node: unknown): unknown[] => {
  const c = (node as Node | undefined)?.props?.children;
  return Array.isArray(c) ? c : c === undefined || c === null ? [] : [c];
};
/** Todos os textos desenhados, na ordem. */
function texts(node: unknown): string[] {
  if (node === null || node === undefined || typeof node === 'boolean') return [];
  if (typeof node === 'string' || typeof node === 'number') return [String(node)];
  if (Array.isArray(node)) return node.flatMap(texts);
  return children(node).flatMap(texts);
}
function nodes(node: unknown): Node[] {
  if (node === null || node === undefined || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(nodes);
  return [node as Node, ...children(node).flatMap(nodes)];
}
const modifiersOf = (node: Node): Node[] => (Array.isArray(node.props?.modifiers) ? node.props!.modifiers! : []);
const modifierArgs = (root: Node, name: string): unknown[][] =>
  nodes(root).flatMap(modifiersOf).filter((m) => m.modifier === name).map((m) => m.args ?? []);
/** Os `Text` que têm o modificador, com o texto de cada um. */
const textsWith = (root: Node, name: string): string[] =>
  nodes(root).filter((n) => n.type === 'Text' && modifiersOf(n).some((m) => m.modifier === name)).flatMap(texts);

describe('widget do iOS: a função que a extensão executa', () => {
  const { created, widget } = widgetOfIos();

  it('é registrada com o nome combinado e vira texto (a diretiva "widget" valeu, e o React Compiler não mexeu nela)', () => {
    expect(created).toHaveLength(1);
    expect(widget.name).toBe(WIDGET_NATIVE.ios);
    expect(typeof widget.layout).toBe('string');
    expect(widget.layout.startsWith('function')).toBe(true);
    expect(widget.layout).not.toMatch(/compiler-runtime|\b_c\(|useMemoCache|\{\s*['"](widget|use no memo)['"]/);
  });

  it('só usa nomes que a extensão oferece, e os nomes existem em @expo/ui', () => {
    const names = new Set([...runtimeNames(SWIFT_UI), ...runtimeNames(path.join(SWIFT_UI, 'modifiers'))]);
    for (const name of ['Text', 'VStack', 'HStack', 'Spacer', 'Image', 'widgetURL', 'containerBackground', 'privacySensitive', 'accessibilityLabel', 'font', 'foregroundStyle'])
      expect(names.has(name), name).toBe(true);
    // Se a função usasse um nome que não está em @expo/ui, o ReferenceError aparece aqui.
    const plan = writePlan(planWidgetSync(input({ toPay: null, signedIn: false })));
    expect(() => renderLayout(widget.layout, plan.snapshot, 'systemSmall')).not.toThrow();
    expect(() => renderLayout(widget.layout, plan.snapshot, 'systemMedium')).not.toThrow();
    expect(() => renderLayout(widget.layout, {}, 'systemMedium')).not.toThrow();
  });

  it('valores ocultos (padrão): "Ainda a pagar em outubro", R$ •••• e "Próxima conta" com o prazo, sem valor nem nome de conta', async () => {
    const { snapshot, json } = writePlan(planWidgetSync(input({ toPay: await demoToPay(), showValues: false })));
    const tree = renderLayout(widget.layout, snapshot, 'systemMedium');
    expect(texts(tree)).toEqual(['Ainda a pagar em outubro', WIDGET_HIDDEN_MONEY, 'Próxima conta · em 8 dias']);
    expect(JSON.stringify(tree)).not.toMatch(/\d,\d{2}/);
    expect(JSON.stringify(tree)).not.toContain('Internet');
    expect(json).not.toContain('Internet');
    expect(modifierArgs(tree, 'accessibilityLabel')).toEqual([[snapshot.medium.a11y]]);
    expect(snapshot.medium.a11y).toBe('Ainda a pagar em outubro, valor oculto. Próxima conta, vence em 8 dias.');
  });

  it('valores ligados: o total e a próxima conta, marcados como sensíveis para a tela bloqueada', async () => {
    const { snapshot } = writePlan(planWidgetSync(input({ toPay: await demoToPay(), showValues: true })));
    const tree = renderLayout(widget.layout, snapshot, 'systemMedium');
    expect(texts(tree)).toEqual(['Ainda a pagar em outubro', 'R$ 650,00', 'Internet · 15/10 · R$ 150,00']);
    expect(textsWith(tree, 'privacySensitive')).toEqual(['R$ 650,00', 'Internet · 15/10 · R$ 150,00']);
  });

  it('vencidas e estado vazio vêm do núcleo', () => {
    const late = {
      id: 'v',
      contextId: 'ctx',
      description: 'Luz',
      amountCents: 8_000,
      dueOn: '2026-10-01',
      currency: 'BRL',
      category: 'Moradia',
      status: 'aberto',
      payment: null,
      series: null,
      seriesOverride: false,
      amountIsEstimate: false,
      invoice: null,
      createdBy: 'pessoa',
      version: 1,
      createdAt: '2026-09-01T10:00:00Z',
      updatedAt: '2026-09-01T10:00:00Z',
    } as unknown as Commitment;
    const withLate = writePlan(planWidgetSync(input({ toPay: summarizeToPay([late], 'ctx', '2026-10', DEMO_TODAY), showValues: true })));
    expect(texts(renderLayout(widget.layout, withLate.snapshot, 'systemMedium'))).toContain('1 vencida');
    const empty = writePlan(planWidgetSync(input({ toPay: summarizeToPay([], 'ctx', '2026-10', DEMO_TODAY) })));
    expect(texts(renderLayout(widget.layout, empty.snapshot, 'systemMedium'))).toEqual(['Ainda a pagar em outubro', WIDGET_TEXT.medium.empty]);
  });

  it('o widget médio abre Contas a pagar; o pequeno mostra "Anotar gasto" e abre direto a tela de anotar (clarevo://)', async () => {
    const { snapshot } = writePlan(planWidgetSync(input({ toPay: await demoToPay() })));
    const medium = renderLayout(widget.layout, snapshot, 'systemMedium');
    expect(modifierArgs(medium, 'widgetURL')).toEqual([[widgetUrl(WIDGET_ROUTES.payables)]]);
    expect(widgetUrl(WIDGET_ROUTES.payables)).toBe('clarevo://a-pagar');
    const small = renderLayout(widget.layout, snapshot, 'systemSmall');
    expect(texts(small)).toEqual(['Anotar gasto']);
    expect(modifierArgs(small, 'widgetURL')).toEqual([[widgetUrl(WIDGET_ROUTES.note)]]);
    expect(widgetUrl(WIDGET_ROUTES.note)).toBe('clarevo://registro/novo?tipo=despesa');
    expect(modifierArgs(small, 'accessibilityLabel')).toEqual([[snapshot.small.a11y]]);
  });

  it('o dia seguinte: a entrada da virada mostra "Abra o Clarevo para atualizar", sem valor nem conta, e "Anotar gasto" continua abrindo a tela de anotar', async () => {
    const plan = writePlan(planWidgetSync(input({ toPay: await demoToPay(), showValues: true })));
    const medium = renderLayout(widget.layout, plan.afterMidnight, 'systemMedium');
    expect(texts(medium)).toEqual([WIDGET_TEXT.medium.noData]);
    expect(modifierArgs(medium, 'widgetURL')).toEqual([[widgetUrl(WIDGET_ROUTES.payables)]]);
    const small = renderLayout(widget.layout, plan.afterMidnight, 'systemSmall');
    expect(texts(small)).toEqual(['Anotar gasto']);
    expect(modifierArgs(small, 'widgetURL')).toEqual([[widgetUrl(WIDGET_ROUTES.note)]]);
    // É o mesmo que o widget do Android mostra no dia seguinte.
    expect(widgetContentToday(plan.json, addDays(DEMO_TODAY, 1)).medium).toEqual(plan.afterMidnight.medium);
  });

  it('sem sessão: "Entre no Clarevo para ver" e os dois tamanhos abrem Entrar', () => {
    const { snapshot } = writePlan(planWidgetSync(input({ signedIn: false })));
    const medium = renderLayout(widget.layout, snapshot, 'systemMedium');
    expect(texts(medium)).toEqual([WIDGET_TEXT.medium.signedOut]);
    expect(modifierArgs(medium, 'widgetURL')).toEqual([[widgetUrl(WIDGET_ROUTES.signIn)]]);
    expect(modifierArgs(renderLayout(widget.layout, snapshot, 'systemSmall'), 'widgetURL')).toEqual([[widgetUrl(WIDGET_ROUTES.signIn)]]);
  });

  it('antes da primeira gravação (galeria de widgets): só "Clarevo", que abre o app', () => {
    for (const family of ['systemSmall', 'systemMedium'] as const) {
      const tree = renderLayout(widget.layout, {}, family);
      expect(texts(tree)).toEqual(['Clarevo']);
      expect(modifierArgs(tree, 'widgetURL')).toEqual([['clarevo://']]);
    }
  });

  it('as cores são as do tema e têm contraste de texto (4,5:1) sobre o fundo de cada tamanho', () => {
    const tokens = loadApp(path.join(SRC, 'theme', 'tokens.ts'), { platform: 'ios' }).colors as Record<string, string>;
    const used = [...widget.layout.matchAll(/'(#[0-9A-Fa-f]{6})'/g)].map((m) => m[1]!.toUpperCase());
    const theme = new Set(Object.values(tokens).map((c) => c.toUpperCase()));
    for (const color of used) expect(theme.has(color), color).toBe(true);
    expect(contrastRatio(tokens.textOnBrand!, tokens.brand!)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(tokens.text!, tokens.surface!)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(tokens.textSecondary!, tokens.surface!)).toBeGreaterThanOrEqual(4.5);
    expect(widget.layout).toContain(`'${tokens.brand}'`);
    expect(widget.layout).toContain(`'${tokens.surface}'`);
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------
// Widgets do Android: componentes simples, chamados direto pela biblioteca (sem hooks, sem React Compiler).
// ---------------------------------------------------------------------------------------------------------------------------------

interface El {
  type: unknown;
  props: Record<string, any>;
}
/** O que a biblioteca faz com um widget: chama as funções dos componentes até sobrarem só os blocos nativos. */
function buildTree(element: any): any {
  if (typeof element === 'string' || typeof element === 'number') return element;
  let current = element as El;
  while (typeof current.type === 'function' && !(current.type as { __name__?: string }).__name__) current = (current.type as (p: unknown) => El)(current.props);
  const { children, ...props } = current.props;
  const list = (Array.isArray(children) ? children : children ? [children] : []).filter(Boolean).flat();
  return { type: (current.type as { __name__: string }).__name__, props, children: list.map(buildTree) };
}
const treeTexts = (tree: any): string[] => (typeof tree === 'string' ? [tree] : [...(tree.props.text ? [tree.props.text] : []), ...tree.children.flatMap(treeTexts)]);

function androidMocks() {
  const store = new Map<string, string>();
  const updates: { widgetName: string; tree: any }[] = [];
  const widgetFn = (name: string) => Object.assign((props: Record<string, unknown>) => props.children ?? null, { __name__: name });
  const mocks = {
    '@clarevo/core': core,
    '@react-native-async-storage/async-storage': {
      __esModule: true,
      default: {
        getItem: async (key: string) => store.get(key) ?? null,
        setItem: async (key: string, value: string) => void store.set(key, value),
      },
    },
    'react-native-android-widget': {
      FlexWidget: widgetFn('FlexWidget'),
      TextWidget: widgetFn('TextWidget'),
      requestWidgetUpdate: async ({ widgetName, renderWidget }: { widgetName: string; renderWidget: (info: unknown) => any }) => {
        updates.push({ widgetName, tree: buildTree(await renderWidget({ widgetName })) });
      },
    },
  };
  return { mocks, store, updates };
}

describe('widgets do Android', () => {
  const file = path.join(SRC, 'widget-native', 'android.tsx');

  it('"use no memo": o React Compiler não os troca por versões com cache (a biblioteca os chama como funções simples)', () => {
    expect(read(file).trimStart().startsWith("'use no memo'")).toBe(true);
    const compiled = compile(file, 'android');
    expect(compiled).not.toMatch(/compiler-runtime|useMemoCache|\b_c\(/);
    // Controle: o mesmo compilador, sem a diretiva, trocaria o componente (senão a prova acima não valeria nada).
    const control = compile(
      path.join(SRC, 'widget-native', 'controle.tsx'),
      'android',
      "import { View } from 'react-native';\nexport function Controle({ a }: { a: string }) {\n  return <View accessibilityLabel={a}>{a}</View>;\n}\n",
    );
    expect(control).toMatch(/compiler-runtime|useMemoCache/);
  });

  it('gravar o snapshot desenha os dois widgets com o que o núcleo montou, abrindo clarevo://', async () => {
    const { mocks, store, updates } = androidMocks();
    const mod = loadApp(file, { platform: 'android', mocks });
    const plan = writePlan(planWidgetSync(input({ toPay: await demoToPay(), showValues: false })));
    await withDemoClock(() => mod.writeAndroidWidgets(plan.json));
    expect(store.get(WIDGET_NATIVE.storageKey)).toBe(plan.json);
    expect(updates.map((u) => u.widgetName)).toEqual([WIDGET_NATIVE.androidSmall, WIDGET_NATIVE.androidMedium]);
    const [small, medium] = updates.map((u) => u.tree);
    expect(treeTexts(small)).toEqual(['Anotar gasto']);
    expect(small.props.clickAction).toBe('OPEN_URI');
    expect(small.props.clickActionData).toEqual({ uri: 'clarevo://registro/novo?tipo=despesa' });
    expect(small.props.accessibilityLabel).toBe(plan.snapshot.small.a11y);
    expect(treeTexts(medium)).toEqual(['Ainda a pagar em outubro', WIDGET_HIDDEN_MONEY, 'Próxima conta · em 8 dias']);
    expect(medium.props.clickActionData).toEqual({ uri: 'clarevo://a-pagar' });
    expect(JSON.stringify(medium)).not.toMatch(/\d,\d{2}/);
    expect(JSON.stringify(medium)).not.toContain('Internet');
  });

  it('a tarefa em segundo plano lê o que está gravado e, em outro dia, mostra "Abra o Clarevo para atualizar"', async () => {
    const { mocks, store } = androidMocks();
    const mod = loadApp(file, { platform: 'android', mocks });
    const render = async (action: string, widgetName: string) => {
      const drawn = vi.fn();
      await withDemoClock(() => mod.widgetTaskHandler({ widgetAction: action, widgetInfo: { widgetName }, renderWidget: drawn }));
      return drawn.mock.calls.map((c) => buildTree(c[0]));
    };
    // Nada gravado ainda: sem dados.
    expect(treeTexts((await render('WIDGET_ADDED', WIDGET_NATIVE.androidMedium))[0])).toEqual([WIDGET_TEXT.medium.noData]);
    // Gravado hoje: o conteúdo.
    const today = DEMO_TODAY;
    const fresh = writePlan(planWidgetSync(input({ today, toPay: summarizeToPay([], 'ctx', today.slice(0, 7), today) })));
    store.set(WIDGET_NATIVE.storageKey, fresh.json);
    expect(treeTexts((await render('WIDGET_UPDATE', WIDGET_NATIVE.androidMedium))[0])).toEqual([fresh.snapshot.medium.title, WIDGET_TEXT.medium.empty]);
    expect(treeTexts((await render('WIDGET_RESIZED', WIDGET_NATIVE.androidSmall))[0])).toEqual(['Anotar gasto']);
    // Gravado ontem: sem dados, e "Anotar gasto" continua igual.
    const old = writePlan(planWidgetSync(input({ today: addDays(today, -1), toPay: summarizeToPay([], 'ctx', addDays(today, -1).slice(0, 7), addDays(today, -1)) })));
    store.set(WIDGET_NATIVE.storageKey, old.json);
    expect(treeTexts((await render('WIDGET_UPDATE', WIDGET_NATIVE.androidMedium))[0])).toEqual([WIDGET_TEXT.medium.noData]);
    expect(treeTexts((await render('WIDGET_UPDATE', WIDGET_NATIVE.androidSmall))[0])).toEqual(['Anotar gasto']);
    // Excluir o widget e cliques não desenham nada.
    expect(await render('WIDGET_DELETED', WIDGET_NATIVE.androidMedium)).toEqual([]);
    expect(await render('WIDGET_CLICK', WIDGET_NATIVE.androidMedium)).toEqual([]);
  });

  it('lê com tolerância: armazenamento que falha vira "sem dados", nunca erro', async () => {
    const { mocks } = androidMocks();
    (mocks['@react-native-async-storage/async-storage'] as any).default.getItem = async () => {
      throw new Error('disco cheio');
    };
    const mod = loadApp(file, { platform: 'android', mocks });
    const drawn = vi.fn();
    await withDemoClock(() => mod.widgetTaskHandler({ widgetAction: 'WIDGET_UPDATE', widgetInfo: { widgetName: WIDGET_NATIVE.androidMedium }, renderWidget: drawn }));
    expect(treeTexts(buildTree(drawn.mock.calls[0]![0]))).toEqual([WIDGET_TEXT.medium.noData]);
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------
// Pontes: sem o módulo nativo, nada acontece e nada quebra.
// ---------------------------------------------------------------------------------------------------------------------------------

describe('pontes com o widget nativo', () => {
  const bridge = (name: string) => path.join(SRC, 'lib', name);
  const planFor = async () => writePlan(planWidgetSync(input({ toPay: await demoToPay(), showValues: true })));

  it('sem widget (web, e todo build sem CLAREVO_WIDGET=1): indisponível e sem efeito', async () => {
    const web = loadApp(bridge('widget-bridge.ts'), { platform: 'web', mocks: { '@clarevo/core': core } });
    expect(web.widgetAvailable()).toBe(false);
    await expect(web.writeWidget(await planFor(), new Date())).resolves.toBeUndefined();
  });

  it('iOS sem o módulo: o Metro entrega um módulo vazio, ou o módulo nativo não existe (Expo Go); nos dois casos "sem widget"', async () => {
    for (const missing of [{}, new Throws(new Error("Cannot find native module 'ExpoWidgets'"))]) {
      const ios = loadApp(bridge('widget-bridge.ios.ts'), { platform: 'ios', mocks: { '@clarevo/core': core, '../widget-native/ios': missing } });
      expect(ios.widgetAvailable()).toBe(false);
      await expect(ios.writeWidget(await planFor(), new Date())).resolves.toBeUndefined();
    }
  });

  it('iOS com o módulo: duas entradas na linha do tempo, a de agora e a da virada do dia (sem dados)', async () => {
    const updateTimeline = vi.fn();
    const ios = loadApp(bridge('widget-bridge.ios.ts'), {
      platform: 'ios',
      mocks: { '@clarevo/core': core, '../widget-native/ios': { default: { updateTimeline } } },
    });
    expect(ios.widgetAvailable()).toBe(true);
    const plan = await planFor();
    const now = new Date(2026, 9, 7, 14, 30, 0);
    await ios.writeWidget(plan, now);
    expect(updateTimeline).toHaveBeenCalledTimes(1);
    const [entries] = updateTimeline.mock.calls[0]!;
    expect(entries).toEqual([
      { date: now, props: plan.snapshot },
      { date: new Date(2026, 9, 8, 0, 0, 0, 0), props: plan.afterMidnight },
    ]);
    expect(entries[1].date).toEqual(nextLocalMidnight(now));
    expect(entries[1].props.medium.state).toBe('sem_dados');
  });

  it('Android sem o módulo: "sem widget"; com o módulo, grava o texto do snapshot', async () => {
    for (const missing of [{}, new Throws(new Error("TurboModuleRegistry: 'AndroidWidget' could not be found"))]) {
      const android = loadApp(bridge('widget-bridge.android.ts'), { platform: 'android', mocks: { '../widget-native/android': missing } });
      expect(android.widgetAvailable()).toBe(false);
      await expect(android.writeWidget(await planFor(), new Date())).resolves.toBeUndefined();
    }
    const writeAndroidWidgets = vi.fn(async () => {});
    const android = loadApp(bridge('widget-bridge.android.ts'), { platform: 'android', mocks: { '../widget-native/android': { writeAndroidWidgets } } });
    const plan = await planFor();
    expect(android.widgetAvailable()).toBe(true);
    await android.writeWidget(plan, new Date());
    expect(writeAndroidWidgets).toHaveBeenCalledWith(plan.json);
  });
});

describe('gravador do app (lib/widget-sync.ts)', () => {
  const file = path.join(SRC, 'lib', 'widget-sync.ts');
  const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

  async function setup(available: boolean) {
    const toPaySource = await createDemoRepository();
    const space = (await toPaySource.getSpace())!;
    const listCommitments = vi.fn((ctx: string, month: string) => toPaySource.listCommitments(ctx, month));
    const repo = { listCommitments } as unknown as core.RecordsRepository;
    const writeWidget = vi.fn(async (_plan: unknown, _now: Date) => {});
    const widgetAvailable = vi.fn(() => available);
    const mod = loadApp(file, { platform: 'ios', mocks: { '@clarevo/core': core, '@/lib/widget-bridge': { widgetAvailable, writeWidget } } });
    return { mod, repo, contextId: space.personalContextId, listCommitments, writeWidget, widgetAvailable };
  }

  it('sem widget nativo: não lê as contas (nenhuma chamada de rede), não grava e não lança erro', async () => {
    const t = await setup(false);
    await withDemoClock(async () => {
      t.mod.queueWidget({ kind: 'signed-in', repo: t.repo, contextId: t.contextId, showValues: true });
      t.mod.queueWidget({ kind: 'signed-out' });
      await settle();
    });
    expect(t.listCommitments).not.toHaveBeenCalled();
    expect(t.writeWidget).not.toHaveBeenCalled();
  });

  it('na demonstração nada é lido nem gravado, mesmo com o widget nativo', async () => {
    const t = await setup(true);
    await withDemoClock(async () => {
      t.mod.queueWidget({ kind: 'demo' });
      await settle();
    });
    expect(t.listCommitments).not.toHaveBeenCalled();
    expect(t.writeWidget).not.toHaveBeenCalled();
  });

  it('com sessão: lê o mês de hoje do Pessoal e grava exatamente o plano do núcleo; valores ocultos por padrão', async () => {
    const t = await setup(true);
    await withDemoClock(async () => {
      t.mod.queueWidget({ kind: 'signed-in', repo: t.repo, contextId: t.contextId, showValues: false });
      await settle();
    });
    expect(t.listCommitments).toHaveBeenCalledWith(t.contextId, '2026-10');
    expect(t.writeWidget).toHaveBeenCalledTimes(1);
    const [plan] = t.writeWidget.mock.calls[0]!;
    const expected = writePlan(planWidgetSync(input({ toPay: await demoToPay(), showValues: false })));
    expect(plan).toEqual(expected);
    expect((plan as typeof expected).json).not.toMatch(/\d,\d{2}/);
    expect((plan as typeof expected).json).not.toContain('Internet');
  });

  it('com os valores ligados, grava o total e a próxima conta', async () => {
    const t = await setup(true);
    await withDemoClock(async () => {
      t.mod.queueWidget({ kind: 'signed-in', repo: t.repo, contextId: t.contextId, showValues: true });
      await settle();
    });
    const [plan] = t.writeWidget.mock.calls[0]! as [Extract<WidgetSyncPlan, { write: true }>, Date];
    expect(plan.snapshot.medium.value).toBe('R$ 650,00');
    expect(plan.snapshot.medium.next?.line).toBe('Internet · 15/10 · R$ 150,00');
  });

  it('sair da conta: grava o estado sem sessão, sem nenhum dado e sem ler as contas', async () => {
    const t = await setup(true);
    await withDemoClock(async () => {
      t.mod.queueWidget({ kind: 'signed-out' });
      await settle();
    });
    expect(t.listCommitments).not.toHaveBeenCalled();
    const [plan] = t.writeWidget.mock.calls[0]! as [Extract<WidgetSyncPlan, { write: true }>, Date];
    expect(plan.snapshot.medium).toMatchObject({ state: 'sem_sessao', value: null, next: null, title: null });
    expect(plan.json).not.toMatch(/\d,\d{2}/);
  });

  it('falha de leitura ou de gravação não lança erro e não impede o próximo pedido', async () => {
    const t = await setup(true);
    await withDemoClock(async () => {
      t.listCommitments.mockRejectedValueOnce(new Error('sem rede'));
      t.mod.queueWidget({ kind: 'signed-in', repo: t.repo, contextId: t.contextId, showValues: false });
      await settle();
      expect(t.writeWidget).not.toHaveBeenCalled();
      t.writeWidget.mockRejectedValueOnce(new Error('disco cheio'));
      t.mod.queueWidget({ kind: 'signed-out' });
      await settle();
      t.mod.queueWidget({ kind: 'signed-in', repo: t.repo, contextId: t.contextId, showValues: false });
      await settle();
    });
    expect(t.writeWidget).toHaveBeenCalledTimes(2);
  });

  it('texto igual ao último gravado não é gravado de novo (o iOS limita os recarregamentos), e outro dia ou outro estado grava', async () => {
    const t = await setup(true);
    const signedIn = { kind: 'signed-in', repo: t.repo, contextId: t.contextId, showValues: false };
    await withDemoClock(async () => {
      t.mod.queueWidget(signedIn);
      await settle();
      t.mod.queueWidget(signedIn);
      await settle();
      expect(t.writeWidget).toHaveBeenCalledTimes(1);
      // Outro estado (sair da conta) grava; voltar ao anterior grava de novo, porque o último gravado já é outro.
      t.mod.queueWidget({ kind: 'signed-out' });
      await settle();
      t.mod.queueWidget(signedIn);
      await settle();
      expect(t.writeWidget).toHaveBeenCalledTimes(3);
      // O mesmo estado em outro dia: o texto traz a data de montagem, então grava.
      vi.setSystemTime(new Date('2026-10-08T09:00:00-03:00'));
      t.mod.queueWidget(signedIn);
      await settle();
      expect(t.writeWidget).toHaveBeenCalledTimes(4);
    });
  });

  it('gravação que falha não conta como gravada: o próximo pedido tenta de novo com o mesmo texto', async () => {
    const t = await setup(true);
    await withDemoClock(async () => {
      t.writeWidget.mockRejectedValueOnce(new Error('disco cheio'));
      t.mod.queueWidget({ kind: 'signed-out' });
      await settle();
      t.mod.queueWidget({ kind: 'signed-out' });
      await settle();
    });
    expect(t.writeWidget).toHaveBeenCalledTimes(2);
  });

  it('pedidos seguidos viram um só, o mais recente (uma execução por vez)', async () => {
    const t = await setup(true);
    await withDemoClock(async () => {
      t.mod.queueWidget({ kind: 'signed-in', repo: t.repo, contextId: t.contextId, showValues: false });
      t.mod.queueWidget({ kind: 'signed-in', repo: t.repo, contextId: t.contextId, showValues: true });
      t.mod.queueWidget({ kind: 'signed-out' });
      await settle();
    });
    const last = t.writeWidget.mock.calls.at(-1)![0] as Extract<WidgetSyncPlan, { write: true }>;
    expect(last.snapshot.medium.state).toBe('sem_sessao');
  });
});
