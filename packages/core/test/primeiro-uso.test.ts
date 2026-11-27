/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import * as core from '../src';
import {
  BUDGET_TEXT,
  DEMO_ENTRY_TEST_ID,
  DEMO_URL,
  FIRST_ACCOUNT_TEXT,
  FIRST_STEPS_TEXT,
  MemoryRepository,
  TAB_LABEL_MAX_FONT_SCALE,
  TRIAL_DAYS,
  WELCOME_TEXT,
  barTabFor,
  biometricOfferFits,
  budgetRuleNotes,
  contaBelow,
  isNoTabArea,
  topicTabFor,
  type NavState,
} from '../src';
import { APP_DIR, createHooksHarness, loadApp } from './app-sandbox';

/**
 * Primeiro uso e acabamento (D-125, estudo de 25/11/2026, Onda 1, itens 8 e 9; sinais 19 a 23 e 26; revisão de 26/11/2026): boas-vindas
 * com o teste grátis e a demonstração à vista, o primeiro passo com importar e o Telegram, a aba certa nas telas de Conta, as abas com letra
 * grande e as regras do Orçamento. As telas do app são montadas com o React de mentira de `app-sandbox.ts` (os componentes de interface
 * são de mentira e guardam o que receberam), para testar o que elas fazem, e não o texto do código. A máscara de moeda fica em
 * `money-input.test.ts` e os avisos das calculadoras em `calc-notes.test.ts`.
 */
const SRC = path.join(APP_DIR, 'src');
const raiz = (p: string) => fileURLToPath(new URL(`../../../${p}`, import.meta.url));
const ler = (p: string) => readFileSync(raiz(p), 'utf8');

const FORBIDDEN = /[–—]|\bfaz(er|endo)?\s+sentido\b|bem-vind[oa]|usu[aá]ri[oa]s?\b|recomend|invista|aplique/i;

/** Componente de mentira que só devolve os filhos (para o React de mentira chegar aos botões dentro dele). */
const passThrough = (props: { children?: unknown }) => props.children ?? null;
/** Ícones de mentira. */
const icons = new Proxy({}, { get: () => () => null });

/** Botões e links que uma tela desenhou, na ordem, com as props (o que a pessoa vê e o que acontece ao tocar). */
function recorder() {
  const items: { kind: string; props: Record<string, any> }[] = [];
  const record = (kind: string) => (props: Record<string, any>) => {
    items.push({ kind, props });
    return null;
  };
  return {
    items,
    record,
    reset: () => void (items.length = 0),
    labels: (kind?: string) => items.filter((i) => !kind || i.kind === kind).map((i) => i.props.label as string),
    get: (label: string) => items.find((i) => i.props.label === label)?.props,
  };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('boas-vindas (sinal 19)', () => {
  it('diz o teste grátis de 14 dias sem cartão e o que acontece depois, sem pressão', () => {
    expect(TRIAL_DAYS).toBe(14);
    expect(WELCOME_TEXT.trial).toBe('14 dias grátis, sem cartão');
    expect(WELCOME_TEXT.trialNote).toContain('vendo e exportando');
    expect(WELCOME_TEXT.demo).toBe('Ver a demonstração');
    expect(WELCOME_TEXT.demoNote).toContain('dados fictícios');
    for (const t of Object.values(WELCOME_TEXT)) expect(t).not.toMatch(FORBIDDEN);
  });

  /** A tela montada, com a sessão da versão publicada ou do build de demonstração. */
  function mountWelcome(demo: boolean) {
    const ui = recorder();
    const router = { push: vi.fn() };
    const Linking = { openURL: vi.fn(async () => {}) };
    class FakeDemoAuth {
      mode = 'demo';
      signInDemo = vi.fn(async () => {});
    }
    const auth = demo ? new FakeDemoAuth() : { mode: 'supabase' };
    const harness = createHooksHarness();
    const mod = loadApp(path.join(SRC, 'app', 'boas-vindas.tsx'), {
      platform: 'ios',
      mocks: {
        ...harness.mocks,
        '@clarevo/core': core,
        'expo-router': { router },
        'lucide-react-native': icons,
        'react-native': { Linking, StyleSheet: { create: <T,>(s: T) => s }, View: passThrough },
        '@/components/auth-shell': { AuthShell: passThrough },
        '@/components/states': { WelcomeArt: () => null },
        '@/components/ui': { Button: ui.record('button'), LinkButton: ui.record('link'), TextField: ui.record('field'), Txt: () => null },
        '@/lib/demo-auth': { DemoAuth: FakeDemoAuth },
        '@/lib/layout': { useShortLandscape: () => false },
        '@/state/session': { useSession: () => ({ auth }) },
        '@/theme/tokens': { colors: {}, fonts: {}, radius: {}, space: {} },
      },
    });
    const app = harness.mount(() => {
      ui.reset();
      return mod.default();
    });
    return { ui, router, Linking, auth: auth as FakeDemoAuth, app };
  }

  it('um caminho principal ("Criar conta") e um segundo à vista ("Ver a demonstração"); "Entrar" e o convite continuam, como links menores', () => {
    const { ui, router, app } = mountWelcome(false);
    expect(ui.labels('button')).toEqual([WELCOME_TEXT.create, WELCOME_TEXT.demo]);
    expect(ui.get(WELCOME_TEXT.demo)!.tone).toBe('soft');
    expect(ui.get(WELCOME_TEXT.create)!.tone).toBeUndefined();
    expect(ui.labels('link')).toEqual([WELCOME_TEXT.signIn, core.ENTRY_INVITE_TEXT.open]);
    ui.get(WELCOME_TEXT.create)!.onPress();
    ui.get(WELCOME_TEXT.signIn)!.onPress();
    expect(router.push.mock.calls).toEqual([['/criar-conta'], ['/entrar']]);
    app.unmount();
  });

  it('na versão publicada, "Ver a demonstração" abre a demonstração da web no navegador e não tem a marca do build de demonstração', async () => {
    const { ui, Linking, app } = mountWelcome(false);
    const demo = ui.get(WELCOME_TEXT.demo)!;
    expect(demo.testID).toBeUndefined();
    expect(demo.accessibilityHint).toBe(WELCOME_TEXT.demoHint);
    await demo.onPress();
    expect(Linking.openURL).toHaveBeenCalledWith(DEMO_URL);
    app.unmount();
  });

  it('no build de demonstração, "Ver a demonstração" entra na conta fictícia e leva a marca que os roteiros de gravação conferem', async () => {
    const { ui, Linking, auth, app } = mountWelcome(true);
    const demo = ui.get(WELCOME_TEXT.demo)!;
    expect(demo.testID).toBe(DEMO_ENTRY_TEST_ID);
    expect(demo.accessibilityHint).toBeUndefined();
    await demo.onPress();
    expect(auth.signInDemo).toHaveBeenCalledTimes(1);
    expect(Linking.openURL).not.toHaveBeenCalled();
    app.unmount();
  });

  it('o endereço da demonstração é o mesmo do site', () => {
    expect(DEMO_URL).toBe('https://demo.clarevo.app.br');
    expect(createRequire(import.meta.url)(raiz('scripts/site/config.js')).URL_DEMO).toBe(DEMO_URL);
  });

  it('os roteiros de gravação reconhecem o build de demonstração pela marca, e não pelo botão (que a versão publicada também tem)', () => {
    // Asserção no texto de propósito: os roteiros são de Playwright e só rodam com o build e um navegador; o que se confere aqui é que
    // procuram a marca do build de demonstração e que não sobrou a marca do tour antigo.
    for (const f of ['scripts/video-demonstracao.js', 'scripts/gravar-videos-site.js', 'scripts/gravar-redes.js', 'scripts/capturas-lojas.js']) {
      const src = ler(f);
      expect(src, f).toContain(`[data-testid="${DEMO_ENTRY_TEST_ID}"]`);
      expect(src, f).toContain('não é o build de demonstração');
      expect(src, f).not.toContain('__clarevoSemTour');
    }
  });
});

describe('primeiro passo (Onda 1, item 8)', () => {
  it('textos de "Sua primeira conta" e de "Primeiros passos" (a ordem do card é conferida no roteiro web, scripts/e2e-web.js)', () => {
    expect(FIRST_ACCOUNT_TEXT.importLabel).toBe('Importar extrato, fatura ou print');
    expect(FIRST_ACCOUNT_TEXT.telegramLabel).toBe('Anotar pelo Telegram');
    expect(FIRST_STEPS_TEXT.intro).toBe('Quatro passos para a Clarevo mostrar o seu mês de verdade.');
    for (const t of [...Object.values(FIRST_ACCOUNT_TEXT), ...Object.values(FIRST_STEPS_TEXT)]) expect(t).not.toMatch(FORBIDDEN);
  });

  /** `lib/nav.ts` de verdade (o roteador é de mentira). */
  const loadNav = () => loadApp(path.join(SRC, 'lib', 'nav.ts'), { platform: 'ios', mocks: { '@clarevo/core': core, 'expo-router': { router: {} } } });

  it('o atalho guardado: vale uma vez, e "pending" diz se ainda falta abrir (a oferta da biometria espera)', () => {
    const { firstStepTarget } = loadNav();
    expect(firstStepTarget.pending()).toBe(false);
    firstStepTarget.set('/importar');
    expect(firstStepTarget.pending()).toBe(true);
    expect(firstStepTarget.take()).toBe('/importar');
    expect(firstStepTarget.pending()).toBe(false);
    expect(firstStepTarget.take()).toBeNull();
  });

  /** "Sua primeira conta" montada com um repositório em memória novo (conta nova, sem nada). */
  function mountFirstAccount(repo: Pick<MemoryRepository, 'ensurePersonalSpace'>) {
    const ui = recorder();
    const nav = loadNav();
    const setQueryData = vi.fn();
    const harness = createHooksHarness();
    const mod = loadApp(path.join(SRC, 'app', 'primeira-conta.tsx'), {
      platform: 'ios',
      mocks: {
        ...harness.mocks,
        '@clarevo/core': core,
        '@tanstack/react-query': { useQueryClient: () => ({ setQueryData }) },
        'lucide-react-native': icons,
        'react-native': { View: passThrough },
        '@/components/auth-shell': { AuthShell: passThrough },
        '@/components/ui': { Banner: passThrough, Button: ui.record('button'), Card: passThrough, LinkButton: ui.record('link'), TextField: ui.record('field'), Txt: () => null },
        '@/lib/nav': nav,
        '@/state/session': { useRepo: () => repo, useSession: () => ({ user: { id: 'pessoa-1', displayName: 'Ana' }, signOut: vi.fn() }) },
        '@/theme/tokens': { colors: {}, fonts: {}, space: {} },
      },
    });
    const app = harness.mount(() => {
      ui.reset();
      return mod.default();
    });
    return { ui, nav, app, setQueryData };
  }

  it('"Começar meu mês", "Importar extrato, fatura ou print" e "Anotar pelo Telegram" criam a mesma conta, vazia, e guardam o atalho escolhido', async () => {
    expect(core.TELEGRAM_BOT).not.toBeNull();
    for (const [label, target] of [
      ['Começar meu mês', null],
      [FIRST_ACCOUNT_TEXT.importLabel, '/importar'],
      [FIRST_ACCOUNT_TEXT.telegramLabel, '/conta/telegram'],
    ] as const) {
      const repo = new MemoryRepository({ actorId: 'pessoa-1', displayName: 'Ana', today: () => '2026-10-07' });
      const ensure = vi.spyOn(repo, 'ensurePersonalSpace');
      const { ui, nav, app, setQueryData } = mountFirstAccount(repo);
      expect(ui.labels('button')).toEqual(['Começar meu mês', FIRST_ACCOUNT_TEXT.importLabel, FIRST_ACCOUNT_TEXT.telegramLabel]);
      await ui.get(label)!.onPress();
      await settle();
      expect(ensure, label).toHaveBeenCalledTimes(1);
      expect(ensure.mock.calls[0]![0]).toBe('Conta principal');
      expect(nav.firstStepTarget.take(), label).toBe(target);
      // Conta nova sem nenhum dado de exemplo, pelos três caminhos.
      const space = (await repo.getSpace())!;
      expect(setQueryData).toHaveBeenCalledWith(['space', 'pessoa-1'], space);
      expect(space.accounts.map((a) => a.name)).toEqual(['Conta principal']);
      expect(await repo.listRecords(space.personalContextId, '2026-10')).toEqual([]);
      expect(await repo.listCards(space.personalContextId)).toEqual([]);
      app.unmount();
    }
  });

  it('se a conta não for criada, o atalho guardado sai (nada abre por cima do Resumo depois)', async () => {
    const repo = { ensurePersonalSpace: vi.fn(async () => Promise.reject(new Error('rede'))) };
    const { ui, nav, app } = mountFirstAccount(repo as never);
    await ui.get(FIRST_ACCOUNT_TEXT.importLabel)!.onPress();
    await settle();
    expect(repo.ensurePersonalSpace).toHaveBeenCalledTimes(1);
    expect(nav.firstStepTarget.pending()).toBe(false);
    app.unmount();
  });

  it('a oferta da biometria só aparece no Resumo e sem atalho à espera (revisão de 26/11/2026)', () => {
    expect(biometricOfferFits('/', false)).toBe(true);
    expect(biometricOfferFits('/', true)).toBe(false);
    for (const p of ['/importar', '/conta/telegram', '/primeira-conta', '/movimentacoes', '/carregando']) expect(biometricOfferFits(p, false), p).toBe(false);
  });
});

describe('aba marcada nas telas fora das abas (sinal 21)', () => {
  it('a área de Conta não marca aba nenhuma, por qualquer caminho', () => {
    for (const path of ['/conta', '/conta/', '/conta/exportar', '/conta/telegram', '/familia', '/familia/convidar', '/empresa', '/contabilidade', '/contabilidade/abc']) {
      expect(isNoTabArea(path), path).toBe(true);
      for (const origin of ['/', '/investimentos', '/aprender', null] as const) expect(barTabFor(path, origin), `${path} de ${origin}`).toBeNull();
    }
  });

  it('o que se abre por cima da Conta também fica sem aba; as outras telas seguem a aba de origem ou a do assunto', () => {
    expect(barTabFor('/negocio', '/', true)).toBeNull();
    expect(barTabFor('/quem-ve', '/metas', true)).toBeNull();
    expect(barTabFor('/a-pagar', '/')).toBe('/');
    expect(barTabFor('/a-pagar', null)).toBe('/movimentacoes');
    expect(barTabFor('/a-pagar', null)).toBe(topicTabFor('/a-pagar'));
    expect(isNoTabArea('/contas/nova')).toBe(false);
    expect(isNoTabArea('/contabilidades')).toBe(false);
  });

  it('"a Conta está abaixo na pilha" (contaBelow), com o estado do roteador como o expo-router o guarda', () => {
    const stack = (names: string[], index = names.length - 1): NavState => ({ routes: names.map((name) => ({ name })), routeNames: ['(tabs)', ...names], index });
    // A pilha com as abas fica dentro de uma rota de fora (o layout da raiz).
    const nested = (inner: NavState): NavState => ({ routes: [{ name: '__root', state: inner }], index: 0 });
    expect(contaBelow(undefined)).toBe(false);
    expect(contaBelow(stack(['(tabs)', 'conta', 'negocio']))).toBe(true);
    expect(contaBelow(nested(stack(['(tabs)', 'conta', 'quem-ve'])))).toBe(true);
    expect(contaBelow(stack(['(tabs)', 'conta/exportar', 'a-pagar']))).toBe(true);
    // A Conta aberta agora não conta (ela é isNoTabArea); nem a Conta acima da tela atual (já fechada no histórico).
    expect(contaBelow(stack(['(tabs)', 'conta']))).toBe(false);
    expect(contaBelow(stack(['(tabs)', 'a-pagar', 'conta'], 1))).toBe(false);
    expect(contaBelow(stack(['(tabs)', 'contas/nova', 'a-pagar']))).toBe(false);
    // Sem a pilha das abas a até quatro níveis: falso.
    expect(contaBelow(nested(nested(nested(nested(nested(stack(['(tabs)', 'conta', 'x'])))))))).toBe(false);
  });
});

describe('letra grande (sinal 20): as abas continuam com o rótulo (revisão de 26/11/2026)', () => {
  /**
   * A barra das telas de consulta montada numa tela de 320 px com a letra a 2 vezes (ou, com `short`, num celular deitado); devolve as props
   * de cada aba.
   */
  function mountBar(platform: 'ios' | 'android', short = false) {
    const tabs: Record<string, any>[] = [];
    const FitTxt = () => null;
    const harness = createHooksHarness();
    const react = { ...(harness.mocks.react as object), forwardRef: (fn: unknown) => fn, useSyncExternalStore: (_s: unknown, get: () => unknown) => get() };
    const mod = loadApp(path.join(SRC, 'components', 'tab-bar.tsx'), {
      platform,
      mocks: {
        ...harness.mocks,
        react,
        '@clarevo/core': core,
        'expo-router': { router: { dismissTo: vi.fn() }, usePathname: () => '/a-pagar', useSegments: () => [] },
        'lucide-react-native': icons,
        'react-native': {
          Keyboard: { addListener: () => ({ remove: () => {} }) },
          Platform: { OS: platform },
          Pressable: (props: Record<string, any>) => {
            tabs.push(props);
            return null;
          },
          StyleSheet: { create: <T,>(s: T) => s },
          View: passThrough,
          useWindowDimensions: () => ({ width: 320, height: 640, fontScale: 2, scale: 2 }),
        },
        'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) },
        '@/components/ui': { FitTxt },
        '@/lib/bar-inset': { setBrowseBarInset: vi.fn() },
        '@/lib/layout': { useShortLandscape: () => short, useWideLayout: () => false },
        '@/lib/nav-state': { contaBelow: core.contaBelow, useNavState: () => undefined },
        '@/theme/tokens': { colors: {}, fonts: {}, radius: {} },
      },
    });
    const app = harness.mount(() => {
      tabs.length = 0;
      return mod.BrowseTabBar();
    });
    const label = (props: Record<string, any>) => (props.children as { type: unknown; props: Record<string, any> }[]).find((c) => c && c.type === FitTxt)?.props;
    return { tabs, label, app };
  }

  it('com a letra a 2 vezes em 320 px, as cinco abas mostram o rótulo, com teto de 1,3 vez, e o nome para o leitor de tela', () => {
    expect(TAB_LABEL_MAX_FONT_SCALE).toBe(1.3);
    const { tabs, label, app } = mountBar('android');
    expect(tabs.map((t) => t.accessibilityLabel)).toEqual(['Resumo', 'Movimentos do mês', 'Metas', 'Investir', 'Aprender e dúvidas']);
    expect(tabs.map((t) => label(t)?.children)).toEqual(['Resumo', 'Movimentos', 'Metas', 'Investir', 'Aprender']);
    for (const t of tabs) {
      expect(label(t)!.maxFontSizeMultiplier).toBe(TAB_LABEL_MAX_FONT_SCALE);
      expect(t.accessibilityShowsLargeContentViewer).toBeUndefined();
    }
    app.unmount();
  });

  it('no celular deitado (revisão dos tamanhos de tela, 27/11/2026), o ícone fica ao lado do rótulo, com o alvo de 44 px; em pé, embaixo dele', () => {
    const flat = (t: Record<string, any>) => Object.assign({}, ...(t.style({ pressed: false }) as unknown[]).filter((x) => x && typeof x === 'object'));
    const lying = mountBar('android', true);
    expect(lying.tabs).toHaveLength(5);
    for (const t of lying.tabs) expect(flat(t)).toMatchObject({ flexDirection: 'row', minHeight: 44 });
    lying.app.unmount();
    const standing = mountBar('android');
    for (const t of standing.tabs) {
      expect(flat(t).flexDirection).toBeUndefined();
      expect(flat(t).minHeight).toBe(56);
    }
    standing.app.unmount();
  });

  it('no iPhone, tocar e segurar a aba mostra o nome grande (visualizador de conteúdo grande do sistema)', () => {
    const { tabs, app } = mountBar('ios');
    expect(tabs).toHaveLength(5);
    expect(tabs.map((t) => [t.accessibilityShowsLargeContentViewer, t.accessibilityLargeContentTitle])).toEqual([
      [true, 'Resumo'],
      [true, 'Movimentos'],
      [true, 'Metas'],
      [true, 'Investir'],
      [true, 'Aprender'],
    ]);
    app.unmount();
  });
});

describe('Orçamento por categoria: as regras no fim, onde valem (revisão de 26/11/2026)', () => {
  it('a regra dos gastos e contas pagas vale sempre; a das compras no cartão, só com cartão no espaço', () => {
    expect(budgetRuleNotes(false)).toEqual([BUDGET_TEXT.paidRule]);
    expect(budgetRuleNotes(true)).toEqual([BUDGET_TEXT.cardRule, BUDGET_TEXT.paidRule]);
    expect(budgetRuleNotes(true).join(' ')).toBe(BUDGET_TEXT.rule);
  });

  /** A tela montada no espaço pedido, com ou sem cartão nele; devolve os textos desenhados e os espaços em que os cartões foram lidos. */
  function mountBudget(work: { contextId: string; contextKind: 'pessoal' | 'familia' | 'negocio'; contextName: string }, withCard: boolean) {
    const texts: unknown[] = [];
    const cardLookups: (string | undefined)[] = [];
    const harness = createHooksHarness();
    const mod = loadApp(path.join(SRC, 'app', 'orcamento', 'index.tsx'), {
      platform: 'ios',
      mocks: {
        ...harness.mocks,
        '@clarevo/core': core,
        'expo-router': { router: { push: vi.fn() }, useLocalSearchParams: () => ({}) },
        'lucide-react-native': icons,
        'react-native': { Pressable: () => null, StyleSheet: { create: <T,>(s: T) => s }, View: passThrough },
        '@/components/budget-bar': { BudgetBar: () => null },
        '@/components/committed-parts': { useMoneyMask: () => ({}) },
        '@/components/flash': { FlashBanner: () => null, useFlash: () => [null] },
        '@/components/header': { ContextPill: () => null, SubHeader: () => null },
        '@/components/money-text': { MoneyTxt: () => null },
        '@/components/month-stepper': { MonthStepper: () => null },
        '@/components/states': { EmptyArt: () => null, ErrorState: () => null },
        '@/components/ui': {
          Card: passThrough,
          LinkButton: () => null,
          Screen: passThrough,
          Skeleton: () => null,
          Txt: (props: { children?: unknown }) => {
            texts.push(props.children);
            return null;
          },
        },
        '@/lib/budget-notices': { useBudgetNotices: () => ({}) },
        '@/state/data': {
          useCards: (contextId: string | undefined) => {
            cardLookups.push(contextId);
            return { data: contextId === undefined ? undefined : withCard ? [{ id: 'cartao-1', contextId }] : [] };
          },
          useMonthBudget: () => ({ isPending: false, isError: false, summary: { totalLine: null, rows: [], without: [] }, refetch: vi.fn() }),
          useMonthRefunds: () => ({ refunds: {} }),
          useWork: () => ({ data: work }),
        },
        '@/state/session': { useSession: () => ({ today: '2026-10-07' }) },
        '@/theme/tokens': { cardShadowOpacity: 0.1, colors: {}, fonts: {}, radius: {}, space: {}, tabular: {} },
      },
    });
    const app = harness.mount(() => {
      texts.length = 0;
      return mod.default();
    });
    return { texts, cardLookups, app };
  }

  it('os cartões são lidos no espaço aberto, qualquer que seja o tipo: o Negócio tem o cartão dele (docs/52)', () => {
    for (const work of [
      { contextId: 'ctx-pessoal', contextKind: 'pessoal', contextName: 'Pessoal' },
      { contextId: 'ctx-negocio', contextKind: 'negocio', contextName: 'Loja da Ana' },
      { contextId: 'ctx-familia', contextKind: 'familia', contextName: 'Família' },
    ] as const) {
      const withCard = mountBudget(work, true);
      expect(new Set(withCard.cardLookups), work.contextKind).toEqual(new Set([work.contextId]));
      expect(withCard.texts, work.contextKind).toContain(BUDGET_TEXT.cardRule);
      expect(withCard.texts, work.contextKind).toContain(BUDGET_TEXT.paidRule);
      withCard.app.unmount();
      const noCard = mountBudget(work, false);
      expect(noCard.texts, work.contextKind).not.toContain(BUDGET_TEXT.cardRule);
      // A regra dos gastos e contas pagas vale sem cartão: aparece sempre, também na Família.
      expect(noCard.texts, work.contextKind).toContain(BUDGET_TEXT.paidRule);
      noCard.app.unmount();
    }
  });
});
