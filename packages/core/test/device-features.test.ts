/// <reference types="node" />
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import * as core from '../src';
import { WIDGET_HIDDEN_MONEY, createDemoRepository, type PersonalSpace, type RecordsRepository, type WidgetSyncPlan } from '../src';
import { APP_DIR, createHooksHarness, loadApp } from './app-sandbox';

/**
 * `components/device-features.tsx` (lembretes e widget da tela inicial, D-063 item 3) montado sem aparelho: o componente roda com um React
 * de mentira (`createHooksHarness`), com a sessão, as preferências e o contexto escolhidos pelo teste, e o gravador do widget
 * (`lib/widget-sync.ts`) é o de verdade, só com a ponte nativa trocada por uma de mentira. Prova o que o widget recebe ao sair da
 * conta, na demonstração e com a Família escolhida: sempre o Pessoal, e nada na demonstração.
 */

const SRC = path.join(APP_DIR, 'src');
const tick = () => new Promise((resolve) => setTimeout(resolve, 20));
/**
 * Espera o gravador do widget assentar: o que ele fez (pedidos, leituras e gravações) fica igual por três esperas seguidas de 20 ms, até
 * 3 segundos. Um tempo fixo único falhava de vez em quando com a máquina ocupada (a leitura das contas terminava depois da espera).
 */
const settleOn = async (activity: () => number) => {
  let last = activity();
  let stable = 0;
  for (let i = 0; i < 150 && stable < 3; i++) {
    await tick();
    const now = activity();
    stable = now === last ? stable + 1 : 0;
    last = now;
  }
};

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

interface World {
  ready: boolean;
  user: { id: string } | null;
  mode: 'supabase' | 'demo';
  repo: RecordsRepository | null;
  status: string;
  prefs: Record<string, unknown> | undefined;
  space: PersonalSpace | undefined;
  /** O contexto que a pessoa escolheu no app ("Pessoal | Família"). O widget não depende dele. */
  view: 'pessoal' | 'familia';
  /** Biometria cadastrada no aparelho (para a oferta logo depois de entrar). */
  bioAvailable?: boolean;
  /** O aceite dos termos lido do servidor (undefined: ainda lendo). */
  legal?: unknown;
  /** Sem conexão ao conferir a sessão guardada (lib/auth.ts, `offline`). */
  offline?: boolean;
  /** Alguém entrou na conta neste uso do app (`signInMark`). */
  signedIn?: boolean;
  /** O que o pedido de biometria do sistema responde (padrão: 'ok'). */
  unlock?: 'ok' | 'cancelado' | 'indisponivel' | 'falhou';
  /** A tela aberta (padrão: o Resumo, "/"). */
  pathname?: string;
  /** Um atalho do primeiro passo ainda à espera de abrir (`firstStepTarget.pending()`, lib/nav.ts). */
  firstStepPending?: boolean;
}

async function setup(over: Partial<World> = {}) {
  const demo = await createDemoRepository();
  const space = (await demo.getSpace())!;
  const listCommitments = vi.fn((contextId: string, month: string) => demo.listCommitments(contextId, month));
  const repo = { getSpace: () => demo.getSpace(), listCommitments } as unknown as RecordsRepository;
  const world: World = {
    ready: true,
    user: { id: 'pessoa-1' },
    mode: 'supabase',
    repo,
    status: 'pronto',
    prefs: { reminders: false, reminderHour: core.DEFAULT_REMINDER_HOUR, reminderOffered: false, biometricLock: false, hideOnOpen: false, widgetShowValues: false },
    space,
    view: 'pessoal',
    ...over,
  };

  const writeWidget = vi.fn(async (_plan: unknown, _now: Date) => {});
  const sync = loadApp(path.join(SRC, 'lib', 'widget-sync.ts'), {
    platform: 'ios',
    mocks: { '@clarevo/core': core, '@/lib/widget-bridge': { widgetAvailable: () => true, writeWidget } },
  });
  const jobs: Record<string, unknown>[] = [];
  const queueWidget = vi.fn((job: Record<string, unknown>) => {
    jobs.push(job);
    sync.queueWidget(job);
  });
  const queueReminders = vi.fn();
  const queries: Record<string, unknown>[] = [];
  const dialogs = new Map<string, { visible: boolean; onConfirm: () => void; onCancel: () => void; onDismiss?: () => void }>();
  const updatePrefs = vi.fn();
  const subscription = () => ({ subscribe: () => () => {} });
  // AppState de mentira: o teste manda 'background' e 'active' (a volta ao app depois de um tempo fora).
  const appStateListeners = new Set<(state: string) => void>();
  const AppState = {
    addEventListener: (_type: string, fn: (state: string) => void) => {
      appStateListeners.add(fn);
      return { remove: () => appStateListeners.delete(fn) };
    },
  };
  const appState = (state: string) => [...appStateListeners].forEach((fn) => fn(state));
  const reactNative = {
    AppState,
    BackHandler: { exitApp: vi.fn() },
    Modal: () => null,
    ScrollView: () => null,
    StyleSheet: { create: <T,>(styles: T) => styles },
    View: () => null,
  };
  // A marca de "tela de fora" de verdade (lib/external-screen.ts), com o mesmo AppState de mentira: o teste abre uma tela de fora como o app.
  const externalScreen = loadApp(path.join(SRC, 'lib', 'external-screen.ts'), { platform: 'android', mocks: { 'react-native': reactNative } });
  const authenticate = vi.fn(async (_prompt: string) => world.unlock ?? 'ok');
  const lockSet = vi.fn();
  const harness = createHooksHarness();
  const mod = loadApp(path.join(SRC, 'components', 'device-features.tsx'), {
    platform: 'ios',
    mocks: {
      ...harness.mocks,
      '@clarevo/core': core,
      '@tanstack/react-query': {
        useQuery: (options: Record<string, unknown>) => {
          queries.push(options);
          return { data: world.space };
        },
        useQueryClient: () => ({ getMutationCache: subscription, getQueryCache: subscription }),
      },
      'expo-router': { router: { navigate: vi.fn() }, usePathname: () => world.pathname ?? '/' },
      'lucide-react-native': { LockKeyhole: () => null },
      'react-native': reactNative,
      'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) },
      '@/components/dialog': {
        ConfirmDialog: (props: { title: string; visible: boolean; onConfirm: () => void; onCancel: () => void; onDismiss?: () => void }) => {
          dialogs.set(props.title, props);
          return null;
        },
      },
      '@/components/legal-gate': { useLegalAcceptance: () => ({ data: world.legal }) },
      '@/components/ui': { Banner: () => null, Button: () => null, Txt: () => null },
      '@/lib/auth': { signInMark: { count: () => (world.signedIn === true ? 1 : 0) } },
      '@/lib/device-lock': { deviceLock: { set: lockSet } },
      '@/lib/external-screen': externalScreen,
      '@/lib/device': {
        DEVICE_FEATURES: true,
        authenticate,
        biometricsAvailable: vi.fn(async () => world.bioAvailable === true),
        listenToReminders: () => () => {},
        openDeviceSettings: vi.fn(),
      },
      '@/lib/device-prefs': { loadPrefs: async () => ({ hideOnOpen: false, ...world.prefs }), updatePrefs, useDevicePrefs: () => world.prefs },
      '@/lib/nav': { signOutIntent: { mark: vi.fn() }, firstStepTarget: { pending: () => world.firstStepPending === true } },
      '@/lib/privacy': { PRIVACY_TEXT: { offerTitle: 'OFERTA DA BIOMETRIA' }, setValuesHidden: vi.fn() },
      '@/lib/reminders': { enableReminders: vi.fn(), queueReminders },
      '@/lib/widget-sync': { queueWidget },
      '@/state/data': { useView: () => ({ space: world.view, setSpace: vi.fn(), setMonth: vi.fn(), currentMonth: '2026-10' }) },
      '@/state/session': {
        useSession: () => ({
          ready: world.ready,
          user: world.user,
          repo: world.repo,
          offline: world.offline,
          auth: { mode: world.mode },
          signOut: vi.fn(),
        }),
      },
      '@/state/space-status': { useSpaceStatus: () => ({ status: world.status }) },
    },
  });
  const app = harness.mount(mod.DeviceFeatures);
  const settle = () => settleOn(() => jobs.length + listCommitments.mock.calls.length + writeWidget.mock.calls.length + queueReminders.mock.calls.length);
  await settle();
  /** Muda o que os mocks devolvem, renderiza de novo e espera o gravador. */
  const change = async (next: Partial<World>) => {
    Object.assign(world, next);
    app.rerender();
    await settle();
  };
  const written = () => writeWidget.mock.calls.map(([plan]) => plan as Extract<WidgetSyncPlan, { write: true }>);
  /** Já travou a tela (a trava por biometria apareceu ao menos uma vez)? */
  const lockedOnce = () => lockSet.mock.calls.some(([value]) => value === true);
  return {
    world,
    space,
    repo,
    listCommitments,
    writeWidget,
    queueWidget,
    queueReminders,
    queries,
    jobs,
    change,
    written,
    dialogs,
    updatePrefs,
    appState,
    externalScreen,
    authenticate,
    lockSet,
    lockedOnce,
    unmount: app.unmount,
  };
}

describe('device-features: o widget da tela inicial', () => {
  it('com sessão e o Pessoal pronto: lê as contas a pagar do Pessoal no mês de hoje e grava o resumo, com os valores ocultos por padrão', async () => {
    await withDemoClock(async () => {
      const t = await setup();
      expect(t.jobs).toEqual([{ kind: 'signed-in', repo: t.repo, contextId: t.space.personalContextId, showValues: false }]);
      expect(t.listCommitments).toHaveBeenCalledWith(t.space.personalContextId, '2026-10');
      const [plan] = t.written();
      expect(plan!.snapshot.medium).toMatchObject({ state: 'normal', valuesShown: false, value: WIDGET_HIDDEN_MONEY });
      expect(plan!.json).not.toMatch(/\d,\d{2}/);
      expect(plan!.json).not.toContain('Internet');
      // Ligar "Mostrar valores no widget" (Conta) grava de novo, agora com o total e a próxima conta.
      await t.change({ prefs: { ...t.world.prefs, widgetShowValues: true } });
      expect(t.written()).toHaveLength(2);
      expect(t.written()[1]!.snapshot.medium).toMatchObject({ valuesShown: true, value: 'R$ 650,00' });
      t.unmount();
    });
  });

  it('contexto Pessoal: com a Família escolhida no app, o widget segue lendo só o contexto Pessoal (a mesma consulta do layout, sem buscar de novo)', async () => {
    await withDemoClock(async () => {
      const t = await setup({ view: 'familia' });
      expect(t.queries.length).toBeGreaterThan(0);
      for (const query of t.queries) expect(query).toMatchObject({ queryKey: ['space', 'pessoa-1'], enabled: false });
      expect(t.jobs).toEqual([{ kind: 'signed-in', repo: t.repo, contextId: t.space.personalContextId, showValues: false }]);
      expect(t.listCommitments.mock.calls.map(([contextId]) => contextId)).toEqual([t.space.personalContextId]);
      // Escolher a Família depois também não muda o que o widget lê.
      await t.change({ view: 'pessoal' });
      await t.change({ view: 'familia', prefs: { ...t.world.prefs, widgetShowValues: true } });
      for (const [contextId] of t.listCommitments.mock.calls) expect(contextId).toBe(t.space.personalContextId);
      t.unmount();
    });
  });

  // Quatro montagens seguidas: com a máquina ocupada (a suíte inteira em paralelo), passava do tempo padrão de 5 s.
  it('sem o Pessoal pronto (sessão ainda sendo conferida, contexto carregando, preferências ou espaço ainda não lidos): nenhum pedido', { timeout: 30_000 }, async () => {
    for (const waiting of [{ ready: false }, { status: 'pendente' }, { prefs: undefined }, { space: undefined }] as Partial<World>[]) {
      await withDemoClock(async () => {
        const t = await setup(waiting);
        expect(t.queueWidget, JSON.stringify(waiting)).not.toHaveBeenCalled();
        expect(t.listCommitments).not.toHaveBeenCalled();
        expect(t.writeWidget).not.toHaveBeenCalled();
        t.unmount();
      });
    }
  });

  it('sair da conta: o widget passa a "Entre na Clarevo para ver", sem dado nenhum e sem ler as contas, e os lembretes são desligados', async () => {
    await withDemoClock(async () => {
      const t = await setup({ prefs: { reminders: true, reminderHour: core.DEFAULT_REMINDER_HOUR, widgetShowValues: true } });
      expect(t.written()).toHaveLength(1);
      expect(t.written()[0]!.snapshot.medium.value).toBe('R$ 650,00');
      expect(t.queueReminders).toHaveBeenLastCalledWith(expect.objectContaining({ enabled: true }));
      t.listCommitments.mockClear();
      await t.change({ user: null, repo: null });
      expect(t.jobs.at(-1)).toEqual({ kind: 'signed-out' });
      expect(t.queueReminders).toHaveBeenLastCalledWith({ enabled: false });
      expect(t.listCommitments).not.toHaveBeenCalled();
      expect(t.written()).toHaveLength(2);
      const out = t.written()[1]!;
      expect(out.snapshot.medium).toMatchObject({ state: 'sem_sessao', value: null, next: null, title: null });
      expect(out.json).not.toMatch(/\d,\d{2}/);
      expect(out.json).not.toContain('Internet');
      // Quem entra depois (outra pessoa) volta a gravar o resumo do Pessoal dela.
      await t.change({ user: { id: 'pessoa-2' }, repo: t.repo });
      expect(t.written()).toHaveLength(3);
      expect(t.written()[2]!.snapshot.medium.state).toBe('normal');
      t.unmount();
    });
  });

  it('sair da conta sem nunca ter entrado (app aberto sem sessão): também grava o estado sem sessão', async () => {
    await withDemoClock(async () => {
      const t = await setup({ user: null, repo: null });
      expect(t.jobs).toEqual([{ kind: 'signed-out' }]);
      expect(t.written().map((plan) => plan.snapshot.medium.state)).toEqual(['sem_sessao']);
      t.unmount();
    });
  });

  it('demonstração: o widget nunca recebe nada, nem com sessão nem sem ela (entrar na demonstração, sair dela), e as contas não são lidas', async () => {
    await withDemoClock(async () => {
      const t = await setup({ mode: 'demo' });
      expect(t.jobs).toEqual([{ kind: 'demo' }]);
      await t.change({ prefs: { ...t.world.prefs, widgetShowValues: true } });
      // Sem sessão na demonstração (antes de entrar ou depois de sair): continua sendo a demonstração, não "sem sessão".
      await t.change({ user: null, repo: null });
      await t.change({ user: { id: 'pessoa-1' }, repo: t.repo });
      expect(t.jobs.length).toBeGreaterThanOrEqual(3);
      for (const job of t.jobs) expect(job).toEqual({ kind: 'demo' });
      expect(t.listCommitments).not.toHaveBeenCalled();
      expect(t.writeWidget).not.toHaveBeenCalled();
      // Os lembretes seguem desligados na demonstração.
      expect(t.queueReminders).toHaveBeenLastCalledWith({ enabled: false });
      t.unmount();
    });
  });
});

describe('device-features: a oferta da biometria logo depois de entrar (16/11/2026)', () => {
  const accepted = { version: core.LEGAL_VERSION, current: core.LEGAL_VERSION };
  const prefsOk = { reminders: false, reminderHour: core.DEFAULT_REMINDER_HOUR, reminderOffered: false, biometricLock: false, biometricOffered: false, hideOnOpen: false, widgetShowValues: false };
  const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  const offer = (t: Awaited<ReturnType<typeof setup>>) => t.dialogs.get('OFERTA DA BIOMETRIA');

  it('aparece depois de um login neste uso do app, com biometria no aparelho, e "Agora não" marca que já foi oferecida', async () => {
    const t = await setup({ user: null, prefs: undefined, bioAvailable: true, legal: accepted });
    await t.change({ user: { id: 'pessoa-1' }, prefs: prefsOk, signedIn: true });
    await wait(1100);
    await t.change({});
    expect(offer(t)?.visible).toBe(true);
    offer(t)!.onCancel();
    expect(t.updatePrefs).toHaveBeenCalledWith('pessoa-1', { biometricOffered: true }, true);
    t.unmount();
  });

  it('numa conta nova que começou por importar ou pelo Telegram, espera a volta ao Resumo em vez de cobrir a tela pedida (revisão de 26/11/2026)', async () => {
    for (const shortcut of ['/importar', '/conta/telegram']) {
      // A conta acabou de ser criada pelo atalho: o espaço fica pronto com o atalho ainda à espera, e a tela dele abre por cima do Resumo.
      const t = await setup({ user: null, prefs: undefined, bioAvailable: true, legal: accepted, firstStepPending: true });
      await t.change({ user: { id: 'pessoa-1' }, prefs: prefsOk, signedIn: true });
      await wait(1100);
      await t.change({});
      expect(offer(t)?.visible ?? false, `${shortcut}, atalho à espera`).toBe(false);
      await t.change({ firstStepPending: false, pathname: shortcut });
      await wait(1100);
      await t.change({});
      expect(offer(t)?.visible ?? false, `${shortcut} aberta`).toBe(false);
      // "Voltar" leva ao Resumo: agora a pergunta aparece.
      await t.change({ pathname: '/' });
      await wait(1100);
      await t.change({});
      expect(offer(t)?.visible, `${shortcut}, de volta ao Resumo`).toBe(true);
      t.unmount();
    }
  }, 30_000);

  it('quem sai do Resumo antes de a pergunta aparecer a vê na próxima volta, e não na tela de agora', async () => {
    const t = await setup({ user: null, prefs: undefined, bioAvailable: true, legal: accepted });
    await t.change({ user: { id: 'pessoa-1' }, prefs: prefsOk, signedIn: true });
    // Saiu antes dos 900 ms.
    await t.change({ pathname: '/registro/novo' });
    await wait(1100);
    await t.change({});
    expect(offer(t)?.visible ?? false).toBe(false);
    await t.change({ pathname: '/' });
    await wait(1100);
    await t.change({});
    expect(offer(t)?.visible).toBe(true);
    t.unmount();
  });

  it('não espera mais o tour de boas-vindas: o tour não abre sozinho desde o estudo de 25/11/2026 (aparece depois do login, sem "tour visto")', async () => {
    const t = await setup({ user: null, prefs: undefined, bioAvailable: true, legal: accepted });
    await t.change({ user: { id: 'pessoa-1' }, prefs: prefsOk, signedIn: true });
    await wait(1100);
    await t.change({});
    expect(offer(t)?.visible).toBe(true);
    expect(JSON.stringify(prefsOk)).not.toContain('tourSeen');
    t.unmount();
  });

  it('não aparece para quem abre o app já com a sessão, sem biometria no aparelho, com o aceite dos termos pendente ou já oferecida', async () => {
    const cases: Partial<World>[] = [
      { bioAvailable: false },
      { legal: undefined },
      { prefs: { ...prefsOk, biometricOffered: true } },
      { prefs: { ...prefsOk, biometricLock: true } },
    ];
    // A sessão guardada que volta depois de o app abrir sem conexão não é uma entrada na conta: nada a oferecer.
    const back = await setup({ user: null, repo: null, offline: true, prefs: undefined, bioAvailable: true, legal: accepted });
    await back.change({ user: { id: 'pessoa-1' }, repo: back.repo, offline: false, prefs: prefsOk });
    await wait(1100);
    await back.change({});
    expect(offer(back)?.visible ?? false).toBe(false);
    back.unmount();
    // Já com a sessão ao abrir: nada a oferecer.
    const open = await setup({ prefs: prefsOk, bioAvailable: true, legal: accepted });
    await wait(1100);
    await open.change({});
    expect(offer(open)?.visible ?? false).toBe(false);
    open.unmount();
    for (const c of cases) {
      const t = await setup({ user: null, prefs: undefined, bioAvailable: true, legal: accepted });
      await t.change({ user: { id: 'pessoa-1' }, prefs: prefsOk, signedIn: true, ...c });
      await wait(1100);
      await t.change({});
      expect(offer(t)?.visible ?? false, JSON.stringify(c)).toBe(false);
      t.unmount();
    }
  }, 30_000);
});

describe('device-features: sem conexão ao abrir o app (sessão guardada no aparelho, lib/supabase.ts)', () => {
  const lockPrefs = { reminders: true, reminderHour: core.DEFAULT_REMINDER_HOUR, reminderOffered: true, biometricLock: true, biometricOffered: true, hideOnOpen: false, widgetShowValues: false };

  it('com a sessão guardada e o espaço sem carregar: nenhum lembrete cancelado e nenhum widget "sem sessão"; com a conexão de volta, tudo segue', async () => {
    await withDemoClock(async () => {
      const t = await setup({ offline: true, status: 'erro', prefs: { ...lockPrefs, biometricLock: false } });
      expect(t.queueReminders).not.toHaveBeenCalled();
      expect(t.queueWidget).not.toHaveBeenCalled();
      expect(t.writeWidget).not.toHaveBeenCalled();
      // "Tentar novamente" com a conexão de volta: a sessão foi renovada e o espaço carregou.
      await t.change({ offline: false, status: 'pronto' });
      expect(t.queueReminders).toHaveBeenLastCalledWith(expect.objectContaining({ enabled: true }));
      expect(t.jobs).toEqual([{ kind: 'signed-in', repo: t.repo, contextId: t.space.personalContextId, showValues: false }]);
      expect(t.queueReminders).not.toHaveBeenCalledWith({ enabled: false });
      t.unmount();
    });
  });

  it('sem conseguir ler a sessão guardada (sem pessoa, mas sem conexão): os lembretes e o widget ficam como estavam', async () => {
    await withDemoClock(async () => {
      const t = await setup({ user: null, repo: null, offline: true, status: 'sem-sessao' });
      expect(t.queueReminders).not.toHaveBeenCalled();
      expect(t.queueWidget).not.toHaveBeenCalled();
      // Já a sessão encerrada pelo servidor (sem ser falta de conexão) desliga os lembretes e mostra "Entre na Clarevo para ver".
      await t.change({ offline: false });
      expect(t.queueReminders).toHaveBeenLastCalledWith({ enabled: false });
      expect(t.jobs.at(-1)).toEqual({ kind: 'signed-out' });
      t.unmount();
    });
  });

  it('a sessão guardada que volta sem conexão pede a biometria, como a sessão que já estava aberta', async () => {
    const t = await setup({ offline: true, status: 'erro', prefs: lockPrefs, unlock: 'cancelado' });
    expect(t.lockedOnce()).toBe(true);
    expect(t.authenticate).toHaveBeenCalledTimes(1);
    t.unmount();
  });

  it('a sessão que só aparece depois de abrir (o app abriu sem pessoa e a sessão guardada voltou com a conexão) também trava', async () => {
    const t = await setup({ user: null, repo: null, offline: true, status: 'sem-sessao', prefs: lockPrefs, unlock: 'cancelado' });
    expect(t.lockedOnce()).toBe(false);
    await t.change({ user: { id: 'pessoa-1' }, repo: t.repo, offline: false, status: 'pronto' });
    expect(t.lockedOnce()).toBe(true);
    t.unmount();
  });

  it('quem entrou na conta neste uso do app (e-mail e senha ou link do e-mail) não passa pela biometria', async () => {
    const t = await setup({ user: null, repo: null, prefs: lockPrefs, unlock: 'cancelado' });
    await t.change({ user: { id: 'pessoa-1' }, repo: t.repo, signedIn: true });
    expect(t.lockedOnce()).toBe(false);
    expect(t.authenticate).not.toHaveBeenCalled();
    t.unmount();
  });

  it('a entrada de antes de o Android recriar a tela do app (o voltar na tela de trava, por exemplo) não livra da biometria', async () => {
    // A marca de entrada é da memória do app e sobrevive à tela recriada: o componente montado de novo trava do mesmo jeito.
    const t = await setup({ signedIn: true, prefs: lockPrefs, unlock: 'cancelado' });
    expect(t.lockedOnce()).toBe(true);
    t.unmount();
  });
});

describe('device-features: a volta de uma tela de fora não trava o app (lib/external-screen.ts)', () => {
  const lockPrefs = { reminders: false, reminderHour: core.DEFAULT_REMINDER_HOUR, reminderOffered: true, biometricLock: true, biometricOffered: true, hideOnOpen: false, widgetShowValues: false };

  /** Fica fora do app por `ms`, em segundo plano, e volta. */
  const awayFor = async (t: Awaited<ReturnType<typeof setup>>, ms: number) => {
    const now = vi.spyOn(Date, 'now');
    const start = Date.now();
    now.mockReturnValue(start);
    t.appState('background');
    now.mockReturnValue(start + ms);
    t.appState('active');
    now.mockRestore();
    await t.change({});
  };

  /** Quem acabou de entrar na conta (sem a trava ao abrir), com "Pedir biometria ao abrir" ligada. */
  const signedInNow = async () => {
    const t = await setup({ user: null, repo: null, prefs: lockPrefs, unlock: 'cancelado' });
    await t.change({ user: { id: 'pessoa-1' }, repo: t.repo, signedIn: true });
    return t;
  };

  it('fora por mais de um minuto: trava; a câmera ou a galeria abertas pelo app por mais de um minuto: não trava', async () => {
    const t = await signedInNow();
    expect(t.lockedOnce()).toBe(false);
    // A galeria aberta pelo app: a promessa só termina na volta.
    let pick: (value: unknown) => void = () => {};
    const picking = t.externalScreen.withExternalScreen(() => new Promise((resolve) => (pick = resolve)));
    expect(t.externalScreen.externalScreenOpen()).toBe(true);
    await awayFor(t, 5 * 60_000);
    pick({ canceled: true });
    await picking;
    expect(t.externalScreen.externalScreenOpen()).toBe(false);
    expect(t.lockedOnce()).toBe(false);
    // Sair do app de verdade, pelo mesmo tempo, trava.
    await awayFor(t, 5 * 60_000);
    expect(t.lockedOnce()).toBe(true);
    t.unmount();
  });

  it('as configurações do aparelho (a promessa termina logo): a marca dura até a volta ao app', async () => {
    const t = await signedInNow();
    t.externalScreen.openingExternalScreen();
    await awayFor(t, 3 * 60_000);
    expect(t.lockedOnce()).toBe(false);
    expect(t.externalScreen.externalScreenOpen()).toBe(false);
    await awayFor(t, 3 * 60_000);
    expect(t.lockedOnce()).toBe(true);
    t.unmount();
  });

  it('o pedido de biometria da oferta logo depois de entrar não trava o app na volta', async () => {
    const accepted = { version: core.LEGAL_VERSION, current: core.LEGAL_VERSION };
    const t = await setup({ user: null, prefs: undefined, bioAvailable: true, legal: accepted });
    await t.change({ user: { id: 'pessoa-1' }, signedIn: true, prefs: { ...lockPrefs, biometricLock: false, biometricOffered: false } });
    await new Promise((resolve) => setTimeout(resolve, 1100));
    await t.change({});
    const offer = t.dialogs.get('OFERTA DA BIOMETRIA')!;
    expect(offer.visible).toBe(true);
    // O pedido do sistema demora (a pessoa usa a senha do aparelho, que no Android é outra tela), e a resposta chega ao app antes do aviso
    // de que ele voltou ao primeiro plano: a trava já está ligada quando o app "volta" depois de dois minutos.
    let answer: (value: 'ok') => void = () => {};
    t.authenticate.mockImplementationOnce(() => new Promise((resolve) => (answer = resolve)));
    const now = vi.spyOn(Date, 'now');
    const start = Date.now();
    now.mockReturnValue(start);
    offer.onConfirm();
    t.appState('background');
    answer('ok');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(t.updatePrefs).toHaveBeenCalledWith('pessoa-1', { biometricOffered: true, biometricLock: true }, true);
    await t.change({ prefs: { ...lockPrefs } });
    now.mockReturnValue(start + 2 * 60_000);
    t.appState('active');
    now.mockRestore();
    await t.change({});
    expect(t.lockedOnce()).toBe(false);
    t.unmount();
  });
});

describe('device-features: o voltar do sistema', () => {
  it('na oferta da biometria, o voltar só fecha agora, sem marcar que já foi oferecida ("Agora não" marca)', async () => {
    const accepted = { version: core.LEGAL_VERSION, current: core.LEGAL_VERSION };
    const prefsOk = { reminders: false, reminderHour: core.DEFAULT_REMINDER_HOUR, reminderOffered: false, biometricLock: false, biometricOffered: false, hideOnOpen: false, widgetShowValues: false };
    const t = await setup({ user: null, prefs: undefined, bioAvailable: true, legal: accepted });
    await t.change({ user: { id: 'pessoa-1' }, prefs: prefsOk, signedIn: true });
    await new Promise((resolve) => setTimeout(resolve, 1100));
    await t.change({});
    const offer = t.dialogs.get('OFERTA DA BIOMETRIA')!;
    expect(offer.visible).toBe(true);
    expect(offer.onDismiss).toBeTypeOf('function');
    offer.onDismiss!();
    await t.change({});
    expect(t.dialogs.get('OFERTA DA BIOMETRIA')!.visible).toBe(false);
    expect(t.updatePrefs).not.toHaveBeenCalled();
    t.unmount();
  });
});
