/// <reference types="node" />
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as core from '../src';
import { NO_ROUTINE_REMINDERS, REMINDER_ROUTE, createDemoRepository, isRoutineReminderId, type RecordsRepository } from '../src';
import { APP_DIR, loadApp } from './app-sandbox';

/**
 * `lib/reminders.ts` do app (o agendamento dos lembretes de vencimento, D-025, e do dia a dia, D-087) rodando sem aparelho: a ponte
 * nativa (`lib/device.ts`) é trocada por uma de mentira que guarda o que seria agendado. Prova que os dois planos vão numa só passada
 * (o aparelho cancela o que saiu e mantém o resto), que as leituras extras só acontecem com um lembrete do dia a dia ligado, e que
 * cada aviso leva a tela e o canal certos.
 */

const SRC = path.join(APP_DIR, 'src');
const CTX_TODAY = '2026-10-07';

/** Espera a fila de `queueReminders` esvaziar (uma execução por vez, sem promessa devolvida). */
const settle = async () => {
  for (let i = 0; i < 20; i += 1) await new Promise((resolve) => setTimeout(resolve, 10));
};

async function setup(granted = true) {
  const demo = await createDemoRepository();
  const space = (await demo.getSpace())!;
  const contextId = space.personalContextId;
  const listCommitments = vi.fn((ctx: string, month: string) => demo.listCommitments(ctx, month));
  const listRecords = vi.fn((ctx: string, month: string) => demo.listRecords(ctx, month));
  const getReturnReviewState = vi.fn(async (_ctx: string) => ({ activity: { lastWriteOn: '2026-10-05', absenceFromOn: null, absenceUntilOn: null }, mark: null }));
  const repo = { listCommitments, listRecords, getReturnReviewState } as unknown as RecordsRepository;
  const synced: Record<string, unknown>[][] = [];
  const syncScheduledReminders = vi.fn(async (items: Record<string, unknown>[]) => {
    synced.push(items);
  });
  const cancelAllReminders = vi.fn(async () => {});
  const requestNotificationPermission = vi.fn(async () => ({ granted, canAsk: true }));
  const prefs: Record<string, unknown> = { reminders: false, routineReminders: { ...NO_ROUTINE_REMINDERS } };
  const updatePrefs = vi.fn((_userId: string, patch: Record<string, unknown>) => Object.assign(prefs, patch));
  const mod = loadApp(path.join(SRC, 'lib', 'reminders.ts'), {
    platform: 'ios',
    mocks: {
      '@clarevo/core': core,
      '@/lib/device': {
        DEVICE_FEATURES: true,
        getNotificationPermission: async () => ({ granted, canAsk: true }),
        requestNotificationPermission,
        syncScheduledReminders,
        cancelAllReminders,
      },
      '@/lib/device-prefs': { getPrefs: () => prefs, updatePrefs },
    },
  });
  return { mod, contextId, repo, listCommitments, listRecords, getReturnReviewState, synced, cancelAllReminders, requestNotificationPermission, prefs, updatePrefs };
}

describe('lib/reminders.ts: os dois planos numa só passada', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    // 10h no relógio do aparelho (o teste roda em UTC): o aviso de hoje às 20h ainda cabe; o de vencimento às 9h, não.
    vi.setSystemTime(new Date(`${CTX_TODAY}T10:00:00Z`));
  });
  afterEach(() => vi.useRealTimers());

  it('só contas a pagar: lê as contas, agenda só avisos de vencimento e não lê registros nem atividade', async () => {
    const t = await setup();
    t.mod.queueReminders({ enabled: true, repo: t.repo, contextId: t.contextId, due: 9, routine: null });
    await settle();
    expect(t.listCommitments).toHaveBeenCalledWith(t.contextId, '2026-10');
    expect(t.listRecords).not.toHaveBeenCalled();
    expect(t.getReturnReviewState).not.toHaveBeenCalled();
    const items = t.synced.at(-1)!;
    expect(items.length).toBeGreaterThan(0);
    for (const i of items) {
      expect(isRoutineReminderId(i.id as string)).toBe(false);
      expect(i).toMatchObject({ route: REMINDER_ROUTE, channel: 'contas' });
      expect(i.date).toBeInstanceOf(Date);
    }
  });

  it('contas a pagar e dia a dia ligados: uma só lista com os dois, cada aviso com a sua tela e o seu canal; a atividade só com "Uma semana sem anotar"', async () => {
    const t = await setup();
    t.mod.queueReminders({
      enabled: true,
      repo: t.repo,
      contextId: t.contextId,
      due: 9,
      routine: { hour: 20, choices: { gastos: true, recebimentos: true, mapa: true, ausencia: false } },
    });
    await settle();
    expect(t.listRecords).toHaveBeenCalledWith(t.contextId, '2026-10');
    expect(t.getReturnReviewState).not.toHaveBeenCalled();
    expect(t.synced).toHaveLength(1);
    const items = t.synced[0]!;
    const due = items.filter((i) => !isRoutineReminderId(i.id as string));
    const routine = items.filter((i) => isRoutineReminderId(i.id as string));
    expect(due.length).toBeGreaterThan(0);
    expect(routine.map((i) => i.route)).toEqual(expect.arrayContaining(['/registro/novo', '/registro/novo?tipo=receita', '/analises']));
    for (const i of routine) expect(i.channel).toBe('rotina');
    expect(routine.some((i) => (i.id as string).includes('ausencia'))).toBe(false);
    // Nada de valor, descrição ou categoria em nenhum aviso.
    const texto = JSON.stringify(items.map((i) => [i.title, i.body]));
    expect(texto).not.toMatch(/\d,\d{2}/);
    expect(texto).not.toContain('exemplo');
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length);

    // Com "Uma semana sem anotar": lê a atividade e agenda o aviso de 12/10 (última anotação 05/10 + 7).
    t.mod.queueReminders({
      enabled: true,
      repo: t.repo,
      contextId: t.contextId,
      due: null,
      routine: { hour: 20, choices: { ...NO_ROUTINE_REMINDERS, ausencia: true } },
    });
    await settle();
    expect(t.getReturnReviewState).toHaveBeenCalledWith(t.contextId);
    const only = t.synced.at(-1)!;
    expect(only.map((i) => i.id)).toEqual(['clarevo-lembrete-rotina-ausencia-2026-10-12']);
    expect(only[0]).toMatchObject({ route: '/', channel: 'rotina', title: 'Resumo' });
    expect((only[0]!.date as Date).getHours()).toBe(20);
  });

  it('tudo desligado, ou ligado sem permissão do aparelho: tira todos os avisos do Clarevo, sem ler nada', async () => {
    const t = await setup();
    t.mod.queueReminders({ enabled: true, repo: t.repo, contextId: t.contextId, due: null, routine: { hour: 20, choices: { ...NO_ROUTINE_REMINDERS } } });
    await settle();
    t.mod.queueReminders({ enabled: false });
    await settle();
    expect(t.cancelAllReminders).toHaveBeenCalledTimes(2);
    expect(t.listCommitments).not.toHaveBeenCalled();
    expect(t.listRecords).not.toHaveBeenCalled();
    expect(t.synced).toHaveLength(0);

    const semPermissao = await setup(false);
    semPermissao.mod.queueReminders({
      enabled: true,
      repo: semPermissao.repo,
      contextId: semPermissao.contextId,
      due: 9,
      routine: { hour: 20, choices: { ...NO_ROUTINE_REMINDERS, gastos: true } },
    });
    await settle();
    expect(semPermissao.cancelAllReminders).toHaveBeenCalledTimes(1);
    expect(semPermissao.synced).toHaveLength(0);
  });

  it('ligar e desligar cada interruptor: o pedido de permissão só ao ligar, e a escolha gravada no aparelho, sem mexer nas outras', async () => {
    const t = await setup();
    await t.mod.enableReminders('pessoa-1', true, 'gastos');
    expect(t.requestNotificationPermission).toHaveBeenCalledTimes(1);
    expect(t.prefs.routineReminders).toEqual({ ...NO_ROUTINE_REMINDERS, gastos: true });
    await t.mod.enableReminders('pessoa-1', true, 'ausencia');
    expect(t.prefs.routineReminders).toEqual({ ...NO_ROUTINE_REMINDERS, gastos: true, ausencia: true });
    expect(t.prefs.reminders).toBe(false);
    await t.mod.enableReminders('pessoa-1', true);
    expect(t.prefs.reminders).toBe(true);
    t.mod.disableReminders('pessoa-1', true, 'gastos');
    expect(t.prefs.routineReminders).toEqual({ ...NO_ROUTINE_REMINDERS, ausencia: true });
    expect(t.prefs.reminders).toBe(true);
    t.mod.disableReminders('pessoa-1', true);
    expect(t.prefs.reminders).toBe(false);
    expect(t.requestNotificationPermission).toHaveBeenCalledTimes(3);
  });
});
