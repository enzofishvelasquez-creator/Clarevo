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
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

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
  const subscription = () => ({ subscribe: () => () => {} });
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
      'expo-router': { router: { navigate: vi.fn() }, usePathname: () => '/' },
      'lucide-react-native': { LockKeyhole: () => null },
      'react-native': {
        AppState: { addEventListener: () => ({ remove: () => {} }) },
        Modal: () => null,
        StyleSheet: { create: <T,>(styles: T) => styles },
        View: () => null,
      },
      'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) },
      '@/components/dialog': { ConfirmDialog: () => null },
      '@/components/ui': { Banner: () => null, Button: () => null, Txt: () => null },
      '@/lib/device': {
        DEVICE_FEATURES: true,
        authenticate: vi.fn(async () => 'ok'),
        listenToReminders: () => () => {},
        openDeviceSettings: vi.fn(),
      },
      '@/lib/device-prefs': { loadPrefs: async () => ({ hideOnOpen: false, ...world.prefs }), updatePrefs: vi.fn(), useDevicePrefs: () => world.prefs },
      '@/lib/nav': { signOutIntent: { mark: vi.fn() } },
      '@/lib/privacy': { PRIVACY_TEXT: {}, setValuesHidden: vi.fn() },
      '@/lib/reminders': { enableReminders: vi.fn(), queueReminders },
      '@/lib/widget-sync': { queueWidget },
      '@/state/data': { useView: () => ({ space: world.view, setSpace: vi.fn(), setMonth: vi.fn(), currentMonth: '2026-10' }) },
      '@/state/session': {
        useSession: () => ({
          ready: world.ready,
          user: world.user,
          repo: world.repo,
          auth: { mode: world.mode },
          signOut: vi.fn(),
        }),
      },
      '@/state/space-status': { useSpaceStatus: () => ({ status: world.status }) },
    },
  });
  const app = harness.mount(mod.DeviceFeatures);
  await settle();
  /** Muda o que os mocks devolvem, renderiza de novo e espera o gravador. */
  const change = async (next: Partial<World>) => {
    Object.assign(world, next);
    app.rerender();
    await settle();
  };
  const written = () => writeWidget.mock.calls.map(([plan]) => plan as Extract<WidgetSyncPlan, { write: true }>);
  return { world, space, repo, listCommitments, writeWidget, queueWidget, queueReminders, queries, jobs, change, written, unmount: app.unmount };
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

  it('sem o Pessoal pronto (sessão ainda sendo conferida, contexto carregando, preferências ou espaço ainda não lidos): nenhum pedido', async () => {
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

  it('sair da conta: o widget passa a "Entre no Clarevo para ver", sem dado nenhum e sem ler as contas, e os lembretes são desligados', async () => {
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
