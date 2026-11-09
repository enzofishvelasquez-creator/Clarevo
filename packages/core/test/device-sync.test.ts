/// <reference types="node" />
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import * as core from '../src';
import { REMINDER_ROUTE } from '../src';
import { APP_DIR, loadApp } from './app-sandbox';

/**
 * `lib/device.ts` do app (a ponte com o expo-notifications) rodando sem aparelho, com um expo-notifications de mentira que guarda a
 * lista agendada em memória. Prova o que não dá para provar de outro jeito: o app cancela só os avisos dele ("clarevo-lembrete-*"),
 * mantém os que não mudaram (mesma assinatura), agenda os novos no canal do tipo (Android), com a tela do toque em `data.url`, e o
 * toque num aviso antigo (sem `data.url`) cai em Contas a pagar.
 */

const SRC = path.join(APP_DIR, 'src');

interface Scheduled {
  identifier: string;
  content: { title: string; body: string; data?: Record<string, unknown> };
  trigger: Record<string, unknown>;
}

function fakeNotifications(initial: Scheduled[], platform: 'android' | 'ios') {
  const scheduled = new Map(initial.map((n) => [n.identifier, n]));
  const channels: Record<string, unknown>[] = [];
  const cancelled: string[] = [];
  let lastResponse: Record<string, unknown> | null = null;
  const listeners: ((r: Record<string, unknown>) => void)[] = [];
  const Notifications = {
    IosAuthorizationStatus: { PROVISIONAL: 3 },
    AndroidImportance: { DEFAULT: 3 },
    SchedulableTriggerInputTypes: { DATE: 'date' },
    DEFAULT_ACTION_IDENTIFIER: 'expo.modules.notifications.actions.DEFAULT',
    getPermissionsAsync: async () => ({ granted: true, canAskAgain: true }),
    requestPermissionsAsync: async () => ({ granted: true, canAskAgain: true }),
    setNotificationChannelAsync: async (id: string, options: Record<string, unknown>) => {
      channels.push({ id, ...options });
    },
    getAllScheduledNotificationsAsync: async () => [...scheduled.values()],
    cancelScheduledNotificationAsync: async (id: string) => {
      cancelled.push(id);
      scheduled.delete(id);
    },
    scheduleNotificationAsync: async (n: Scheduled) => {
      scheduled.set(n.identifier, n);
      return n.identifier;
    },
    setNotificationHandler: () => {},
    getLastNotificationResponse: () => lastResponse,
    clearLastNotificationResponse: () => {
      lastResponse = null;
    },
    addNotificationResponseReceivedListener: (fn: (r: Record<string, unknown>) => void) => {
      listeners.push(fn);
      return { remove: () => {} };
    },
  };
  const mod = loadApp(path.join(SRC, 'lib', 'device.ts'), {
    platform,
    mocks: {
      '@clarevo/core': core,
      'expo-notifications': Notifications,
      'expo-local-authentication': {},
      'react-native': { Platform: { OS: platform }, Linking: { openSettings: async () => {} } },
    },
  });
  const tap = (identifier: string, data?: Record<string, unknown>, action = Notifications.DEFAULT_ACTION_IDENTIFIER) =>
    listeners.forEach((fn) => fn({ actionIdentifier: action, notification: { request: { identifier, content: { data } } } }));
  return { mod, scheduled, channels, cancelled, tap, setLast: (r: Record<string, unknown> | null) => (lastResponse = r) };
}

const d = (iso: string) => new Date(iso);

describe('lib/device.ts: a ponte dos lembretes com o aparelho', () => {
  it('agenda os dois tipos, cada um no seu canal do Android e com a tela do toque, e cria os dois canais antes', async () => {
    const t = fakeNotifications([], 'android');
    await t.mod.syncScheduledReminders([
      { id: 'clarevo-lembrete-2026-11-07', date: d('2026-11-07T09:00:00'), title: 'Contas a pagar', body: 'Você tem 1 conta com vencimento amanhã.', signature: 'a', route: REMINDER_ROUTE, channel: 'contas' },
      { id: 'clarevo-lembrete-rotina-gastos-2026-11-07', date: d('2026-11-07T20:00:00'), title: 'Anotar gasto', body: 'Não se esqueça de anotar os gastos de hoje.', signature: 'b', route: '/registro/novo', channel: 'rotina' },
    ]);
    expect(t.channels.map((c) => [c.id, c.name])).toEqual([
      ['lembretes', 'Lembretes de contas a pagar'],
      ['lembretes-dia-a-dia', 'Lembretes do dia a dia'],
    ]);
    const contas = t.scheduled.get('clarevo-lembrete-2026-11-07')!;
    expect(contas.trigger).toMatchObject({ type: 'date', channelId: 'lembretes' });
    expect(contas.content.data).toEqual({ url: REMINDER_ROUTE, signature: 'a' });
    const rotina = t.scheduled.get('clarevo-lembrete-rotina-gastos-2026-11-07')!;
    expect(rotina.trigger).toMatchObject({ type: 'date', channelId: 'lembretes-dia-a-dia', date: d('2026-11-07T20:00:00') });
    expect(rotina.content).toMatchObject({ title: 'Anotar gasto', body: 'Não se esqueça de anotar os gastos de hoje.', data: { url: '/registro/novo', signature: 'b' } });
    expect(t.cancelled).toEqual([]);
  });

  it('cancela só os avisos da Clarevo que saíram ou mudaram, mantém os iguais e nunca toca em notificação de outra origem', async () => {
    const t = fakeNotifications(
      [
        { identifier: 'outro-app-1', content: { title: 'Outro app', body: 'x' }, trigger: {} },
        { identifier: 'clarevo-lembrete-2026-11-07', content: { title: 'Contas a pagar', body: 'antigo', data: { url: REMINDER_ROUTE, signature: 'velha' } }, trigger: {} },
        { identifier: 'clarevo-lembrete-2026-11-08', content: { title: 'Contas a pagar', body: 'igual', data: { url: REMINDER_ROUTE, signature: 'mesma' } }, trigger: {} },
        { identifier: 'clarevo-lembrete-rotina-mapa-2026-11', content: { title: 'Análises', body: 'saiu', data: { url: '/analises', signature: 'm' } }, trigger: {} },
      ],
      'ios',
    );
    await t.mod.syncScheduledReminders([
      { id: 'clarevo-lembrete-2026-11-07', date: d('2026-11-07T09:00:00'), title: 'Contas a pagar', body: 'novo', signature: 'nova', route: REMINDER_ROUTE, channel: 'contas' },
      { id: 'clarevo-lembrete-2026-11-08', date: d('2026-11-08T09:00:00'), title: 'Contas a pagar', body: 'igual', signature: 'mesma', route: REMINDER_ROUTE, channel: 'contas' },
      { id: 'clarevo-lembrete-rotina-ausencia-2026-11-12', date: d('2026-11-12T20:00:00'), title: 'Resumo', body: 'Faz uma semana sem anotações. Quando quiser, é só retomar.', signature: 'z', route: '/', channel: 'rotina' },
    ]);
    expect(t.cancelled.sort()).toEqual(['clarevo-lembrete-2026-11-07', 'clarevo-lembrete-rotina-mapa-2026-11']);
    expect([...t.scheduled.keys()].sort()).toEqual(['clarevo-lembrete-2026-11-07', 'clarevo-lembrete-2026-11-08', 'clarevo-lembrete-rotina-ausencia-2026-11-12', 'outro-app-1']);
    expect(t.scheduled.get('clarevo-lembrete-2026-11-07')!.content.body).toBe('novo');
    expect(t.scheduled.get('clarevo-lembrete-2026-11-08')!.content.body).toBe('igual');
    // No iOS não há canal.
    expect(t.channels).toEqual([]);
    // Desligar tudo: só os da Clarevo saem.
    await t.mod.cancelAllReminders();
    expect([...t.scheduled.keys()]).toEqual(['outro-app-1']);
  });

  it('o toque abre a tela do aviso; aviso antigo sem tela, tela estranha ou notificação de outra origem: Contas a pagar ou nada', async () => {
    const t = fakeNotifications([], 'android');
    const opened: string[] = [];
    t.mod.listenToReminders((route: string) => opened.push(route));
    t.tap('clarevo-lembrete-rotina-recebimentos-2026-11', { url: '/registro/novo?tipo=receita', signature: 'r' });
    t.tap('clarevo-lembrete-2026-11-07', { url: REMINDER_ROUTE, signature: 'c' });
    t.tap('clarevo-lembrete-2026-11-08');
    t.tap('clarevo-lembrete-2026-11-09', { url: 'https://exemplo.test/fora', signature: 'x' });
    t.tap('outro-app-1', { url: '/analises' });
    t.tap('clarevo-lembrete-2026-11-10', { url: '/analises', signature: 'a' }, 'outra-acao');
    expect(opened).toEqual(['/registro/novo?tipo=receita', REMINDER_ROUTE, REMINDER_ROUTE, REMINDER_ROUTE]);
    // O toque que abriu o app (resposta guardada) também conta, uma vez.
    const u = fakeNotifications([], 'ios');
    const openedAtStart: string[] = [];
    u.setLast({ actionIdentifier: 'expo.modules.notifications.actions.DEFAULT', notification: { request: { identifier: 'clarevo-lembrete-rotina-mapa-2026-11', content: { data: { url: '/analises' } } } } });
    u.mod.listenToReminders((route: string) => openedAtStart.push(route));
    u.mod.listenToReminders((route: string) => openedAtStart.push(route));
    expect(openedAtStart).toEqual(['/analises']);
  });
});
