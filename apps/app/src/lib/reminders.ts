import {
  anyRoutineReminder,
  deviceTimeZone,
  monthOf,
  REMINDER_LIMIT,
  REMINDER_ROUTE,
  reminderPlan,
  reminderSignature,
  ROUTINE_REMINDER_LIMIT,
  routineReminderPlan,
  routineReminderSignature,
  todayIn,
  type IsoDate,
  type RecordsRepository,
  type ReminderHour,
  type RoutineReminderChoices,
  type RecordSearchFilter,
  type RoutineReminderHour,
  type RoutineReminderKind,
  type DepositReminderDay,
  NO_ROUTINE_REMINDERS,
} from '@clarevo/core';

import {
  cancelAllReminders,
  DEVICE_FEATURES,
  getNotificationPermission,
  requestNotificationPermission,
  syncScheduledReminders,
  type NotificationPermission,
  type ScheduledReminder,
} from '@/lib/device';
import { getPrefs, updatePrefs } from '@/lib/device-prefs';

/**
 * Lembretes de contas a pagar (D-025) e do dia a dia (D-087): cancela os avisos "clarevo-lembrete-*" que saíram do plano e
 * agenda, numa só passada, o plano do core (reminderPlan, com as contas em aberto do Pessoal; routineReminderPlan, com os
 * registros do mês e o dia da última anotação). Roda ao abrir o app, ao voltar para ele e depois de cada escrita
 * (components/device-features.tsx). Só no aparelho; na web, `device.web.ts` não faz nada.
 */

/** Busca sem filtro, a preencher só com o dia de hoje (a compra no cartão de hoje). */
const NO_SEARCH_FILTER: RecordSearchFilter = { from: null, to: null, kind: null, category: null, accountId: null, minCents: null, maxCents: null, terms: [] };

/** Data e hora locais do aparelho do aviso ("AAAA-MM-DD" às `hour` horas). */
export function fireDate(item: { date: IsoDate; hour: number }): Date {
  const [y, m, d] = item.date.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d, item.hour, 0, 0, 0);
}

export type ReminderJob =
  | { enabled: false }
  | {
      enabled: true;
      repo: RecordsRepository;
      contextId: string;
      /** Horário dos lembretes de vencimento; nulo com "Lembretes de contas a pagar" desligado. */
      due: ReminderHour | null;
      /** Os lembretes do dia a dia ligados e o horário deles; nulo com todos desligados. */
      routine: { hour: RoutineReminderHour; choices: RoutineReminderChoices; depositDay: DepositReminderDay } | null;
    };

export type ReminderOutcome = 'agendado' | 'desligado' | 'sem-permissao' | 'indisponivel';

async function apply(job: ReminderJob): Promise<ReminderOutcome> {
  if (!DEVICE_FEATURES) return 'indisponivel';
  if (!job.enabled || (job.due === null && (job.routine === null || !anyRoutineReminder(job.routine.choices)))) {
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
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const items: ScheduledReminder[] = [];
  if (job.due !== null) {
    // Mês de hoje: todas as contas com vencimento no mês e todas as abertas de outros meses (listCommitments).
    const list = await job.repo.listCommitments(job.contextId, monthOf(today));
    const plan = reminderPlan(list, today, job.due, REMINDER_LIMIT, { nowMinutes, contextId: job.contextId });
    for (const i of plan) {
      items.push({ id: i.id, date: fireDate(i), title: i.title, body: i.body, signature: reminderSignature(i), route: REMINDER_ROUTE, channel: 'contas' });
    }
  }
  if (job.routine !== null && anyRoutineReminder(job.routine.choices)) {
    // Registros do mês de hoje (gasto de hoje e recebimento do mês), uma compra no cartão de hoje (só para "Anotar os gastos do
    // dia": a compra pelo mesmo formulário também é gasto anotado) e o dia da última anotação (só para "Uma semana sem anotar").
    const records = await job.repo.listRecords(job.contextId, monthOf(today));
    const cardPurchaseToday = job.routine.choices.gastos
      ? (await job.repo.searchCardPurchases(job.contextId, { ...NO_SEARCH_FILTER, from: today, to: today }, 1)).items.length > 0
      : false;
    const activity = job.routine.choices.ausencia ? (await job.repo.getReturnReviewState(job.contextId)).activity : null;
    // Lembrete do aporte (D-093): só com meta ativa com plano por mês; o deste mês sai se o mês já tem aporte registrado.
    let deposit: { day: DepositReminderDay; hasPlannedGoal: boolean; depositThisMonth: boolean } | undefined;
    if (job.routine.choices.aporte) {
      const goals = await job.repo.listGoals(job.contextId);
      const hasPlannedGoal = goals.some((g) => g.status === 'ativa' && (g.plannedMonthlyCents ?? 0) > 0);
      const depositThisMonth = hasPlannedGoal ? (await job.repo.listGoalMovementsInMonth(job.contextId, monthOf(today))).some((m) => m.kind === 'aporte') : false;
      deposit = { day: job.routine.depositDay, hasPlannedGoal, depositThisMonth };
    }
    const plan = routineReminderPlan(job.routine.choices, records, activity, today, job.routine.hour, {
      nowMinutes,
      contextId: job.contextId,
      limit: ROUTINE_REMINDER_LIMIT,
      cardPurchaseToday,
      deposit,
    });
    for (const i of plan) {
      items.push({ id: i.id, date: fireDate(i), title: i.title, body: i.body, signature: routineReminderSignature(i), route: i.route, channel: 'rotina' });
    }
  }
  await syncScheduledReminders(items);
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

/** O interruptor ligado ou desligado: os lembretes de contas a pagar ("contas") ou um dos lembretes do dia a dia. */
export type ReminderSwitch = 'contas' | RoutineReminderKind;

function setSwitch(userId: string, persist: boolean, which: ReminderSwitch, on: boolean) {
  if (which === 'contas') {
    updatePrefs(userId, { reminders: on }, persist);
    return;
  }
  const current = getPrefs(userId)?.routineReminders ?? NO_ROUTINE_REMINDERS;
  updatePrefs(userId, { routineReminders: { ...current, [which]: on } }, persist);
}

/**
 * Liga um lembrete depois do toque da pessoa: só então o sistema pede a permissão. A escolha fica ligada mesmo sem a
 * permissão; a tela mostra "Os avisos estão desativados nas configurações do aparelho." e, quando a pessoa libera os
 * avisos e volta ao app, os lembretes são agendados sem outro toque. O reagendamento sai da mudança da preferência
 * (components/device-features.tsx).
 */
export async function enableReminders(userId: string, persist: boolean, which: ReminderSwitch = 'contas'): Promise<NotificationPermission> {
  const permission = await requestNotificationPermission();
  setSwitch(userId, persist, which, true);
  return permission;
}

/** Desliga um lembrete; com todos desligados, o reagendamento tira todos os avisos do Clarevo deste aparelho. */
export function disableReminders(userId: string, persist: boolean, which: ReminderSwitch = 'contas') {
  setSwitch(userId, persist, which, false);
}

export { getNotificationPermission };
