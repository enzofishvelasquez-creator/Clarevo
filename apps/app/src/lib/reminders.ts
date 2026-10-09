import {
  deviceTimeZone,
  monthOf,
  REMINDER_LIMIT,
  reminderPlan,
  todayIn,
  type RecordsRepository,
  type ReminderHour,
  type ReminderItem,
} from '@clarevo/core';

import {
  cancelAllReminders,
  DEVICE_FEATURES,
  getNotificationPermission,
  requestNotificationPermission,
  syncScheduledReminders,
  type NotificationPermission,
} from '@/lib/device';
import { updatePrefs } from '@/lib/device-prefs';

/**
 * Lembretes de contas a pagar (D-025): cancela os avisos "clarevo-lembrete-*" que saíram do plano e agenda o plano do
 * core (reminderPlan) com as contas em aberto do Pessoal. Roda ao abrir o app, ao voltar para ele e depois de cada
 * escrita (components/device-features.tsx). Só no aparelho; na web, `device.web.ts` não faz nada.
 */

/** Data e hora locais do aparelho do aviso ("AAAA-MM-DD" às `hour` horas). */
export function fireDate(item: Pick<ReminderItem, 'date' | 'hour'>): Date {
  const [y, m, d] = item.date.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d, item.hour, 0, 0, 0);
}

export type ReminderJob = { enabled: false } | { enabled: true; repo: RecordsRepository; contextId: string; hour: ReminderHour };

export type ReminderOutcome = 'agendado' | 'desligado' | 'sem-permissao' | 'indisponivel';

async function apply(job: ReminderJob): Promise<ReminderOutcome> {
  if (!DEVICE_FEATURES) return 'indisponivel';
  if (!job.enabled) {
    await cancelAllReminders();
    return 'desligado';
  }
  const permission = await getNotificationPermission();
  if (!permission.granted) {
    await cancelAllReminders();
    return 'sem-permissao';
  }
  const now = new Date();
  const today = todayIn(deviceTimeZone(), now);
  // Mês de hoje: todas as contas com vencimento no mês e todas as abertas de outros meses (listCommitments).
  const list = await job.repo.listCommitments(job.contextId, monthOf(today));
  const plan = reminderPlan(list, today, job.hour, REMINDER_LIMIT, {
    nowMinutes: now.getHours() * 60 + now.getMinutes(),
    contextId: job.contextId,
  });
  await syncScheduledReminders(
    plan.map((i) => ({ id: i.id, date: fireDate(i), title: i.title, body: i.body, signature: `${i.fireAt}|${i.count}` })),
  );
  return 'agendado';
}

/** Uma execução por vez; pedidos que chegam durante uma execução viram uma só, com o pedido mais recente. */
let running = false;
let queued: ReminderJob | null = null;

export function queueReminders(job: ReminderJob) {
  queued = job;
  if (running) return;
  running = true;
  void (async () => {
    while (queued) {
      const next = queued;
      queued = null;
      try {
        await apply(next);
      } catch {
        // Falha de rede ou do sistema: os avisos anteriores continuam; o próximo gatilho tenta de novo.
      }
    }
    running = false;
  })();
}

/**
 * Liga os lembretes depois do toque da pessoa: só então o sistema pede a permissão. A escolha fica ligada mesmo sem a
 * permissão; a tela mostra "Os avisos estão desativados nas configurações do aparelho." e, quando a pessoa libera os
 * avisos e volta ao app, os lembretes são agendados sem outro toque.
 */
export async function enableReminders(userId: string, persist: boolean): Promise<NotificationPermission> {
  const permission = await requestNotificationPermission();
  updatePrefs(userId, { reminders: true }, persist);
  return permission;
}

/** Desliga e tira todos os avisos do Clarevo deste aparelho. */
export function disableReminders(userId: string, persist: boolean) {
  updatePrefs(userId, { reminders: false }, persist);
  queueReminders({ enabled: false });
}

export { getNotificationPermission };
