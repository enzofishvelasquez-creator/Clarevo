import {
  addDays,
  anyRoutineReminder,
  deviceTimeZone,
  monthOf,
  REMINDER_LIMIT,
  REMINDER_ROUTE,
  reminderPlan,
  reminderSignature,
  ROUTINE_REMINDER_LIMIT,
  DEFAULT_ROUTINE_REMINDER_HOUR,
  levelWarningReminder,
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
  type InvestmentReminderFacts,
  type InvestmentReminderHolds,
  NO_ROUTINE_REMINDERS,
  applyInvestmentReminderHolds,
  NO_MEI_REMINDERS,
  anyMeiReminder,
  meiReminderPlan,
  type MeiReminderChoices,
  type MeiReminderKind,
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
      routine: { hour: RoutineReminderHour; choices: RoutineReminderChoices; depositDay: DepositReminderDay; holds?: InvestmentReminderHolds } | null;
      /**
       * Os lembretes do MEI (D-122) ligados, no horário dos lembretes do dia a dia; ausente ou nulo com os dois desligados. Só saem com o tipo do
       * negócio "MEI" (lido do repositório na hora de agendar).
       */
      mei?: { hour: RoutineReminderHour; choices: MeiReminderChoices } | null;
    };

export type ReminderOutcome = 'agendado' | 'desligado' | 'sem-permissao' | 'indisponivel';

async function apply(job: ReminderJob): Promise<ReminderOutcome> {
  if (!DEVICE_FEATURES) return 'indisponivel';
  const meiOn = job.enabled && job.mei != null && anyMeiReminder(job.mei.choices);
  if (!job.enabled || (job.due === null && (job.routine === null || !anyRoutineReminder(job.routine.choices)) && !meiOn)) {
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
      const planned = goals.filter((g) => g.status === 'ativa' && (g.plannedMonthlyCents ?? 0) > 0);
      const hasPlannedGoal = planned.length > 0;
      let depositThisMonth = hasPlannedGoal ? (await job.repo.listGoalMovementsInMonth(job.contextId, monthOf(today))).some((m) => m.kind === 'aporte') : false;
      // Meta que lê o valor dos investimentos ligados (D-099, item 13 fase 2): o aporte do mês num investimento ligado a ela também conta.
      const fromInvestments = new Set(planned.filter((g) => g.valueSource === 'investimentos').map((g) => g.id));
      if (!depositThisMonth && fromInvestments.size > 0) {
        const linked = new Set((await job.repo.listInvestments(job.contextId)).filter((i) => i.goalId !== null && fromInvestments.has(i.goalId)).map((i) => i.id));
        if (linked.size > 0) {
          depositThisMonth = (await job.repo.listContextInvestmentMovements(job.contextId)).some(
            (m) => m.kind === 'aporte' && linked.has(m.investmentId) && monthOf(m.occurredOn) === monthOf(today),
          );
        }
      }
      deposit = { day: job.routine.depositDay, hasPlannedGoal, depositThisMonth };
    }
    // Investimentos (D-099): as datas da ficha dos ativos e se algum está sem o valor do extrato no mês de hoje.
    let investments: { maturities: IsoDate[]; releases: IsoDate[]; hasActive: boolean; missingThisMonth: boolean } | undefined;
    if (job.routine.choices.vencimentos || job.routine.choices.atualizar) {
      const active = (await job.repo.listInvestments(job.contextId)).filter((i) => i.status === 'ativo');
      // O valor do último dia do mês passado conta (é a data que a própria aba pede para o mês fechado).
      const monthEnd = addDays(`${monthOf(today)}-01` as IsoDate, -1);
      investments = {
        maturities: active.map((i) => i.maturityOn).filter((d): d is IsoDate => d !== null),
        releases: active.map((i) => (i.liquidity === 'a_partir_de' ? i.liquidityOn : null)).filter((d): d is IsoDate => d !== null),
        hasActive: active.length > 0,
        missingThisMonth: active.some((i) => i.lastValueOn === null || i.lastValueOn < monthEnd),
      };
    }
    // Plano de aportes dos investimentos (D-099, item 12): o aviso deste mês sai se algum investimento já tem aporte no mês.
    let investmentDeposit: { day: DepositReminderDay; hasPlan: boolean; depositThisMonth: boolean } | undefined;
    if (job.routine.choices.aporte_investimentos) {
      const hasPlan = (await job.repo.getInvestmentPlan(job.contextId)) !== null;
      const depositThisMonth = hasPlan
        ? (await job.repo.listContextInvestmentMovements(job.contextId)).some((m) => m.kind === 'aporte' && monthOf(m.occurredOn) === monthOf(today))
        : false;
      investmentDeposit = { day: job.routine.depositDay, hasPlan, depositThisMonth };
    }
    const base = routineReminderPlan(job.routine.choices, records, activity, today, job.routine.hour, {
      nowMinutes,
      contextId: job.contextId,
      // Folga para os avisos adiados dos investimentos; o corte final vem depois de aplicar adiar e pausar.
      limit: ROUTINE_REMINDER_LIMIT + 3,
      cardPurchaseToday,
      deposit,
      investments,
      investmentDeposit,
    });
    // Adiar e pausar dos investimentos (D-104, item 6): o aviso adiado só sai se o fato ainda vale.
    const holds = job.routine.holds ?? {};
    let facts: InvestmentReminderFacts = {};
    if (Object.keys(holds).length > 0) {
      const dueDates = [...(investments?.maturities ?? []).map((on) => ({ on, release: false })), ...(investments?.releases ?? []).map((on) => ({ on, release: true }))];
      facts = {
        depositDue: investmentDeposit ? investmentDeposit.hasPlan && !investmentDeposit.depositThisMonth : false,
        updateDue: investments ? investments.hasActive && investments.missingThisMonth : false,
        dueDates,
      };
    }
    const plan = applyInvestmentReminderHolds(base, holds, today, facts, job.routine.choices, job.routine.hour, nowMinutes).slice(0, ROUTINE_REMINDER_LIMIT);
    for (const i of plan) {
      items.push({ id: i.id, date: fireDate(i), title: i.title, body: i.body, signature: routineReminderSignature(i), route: i.route, channel: 'rotina' });
    }
  }
  // Lembretes do MEI (D-122): só com o tipo do negócio "MEI", lido agora (trocar o tipo é uma escrita, e toda escrita reagenda). Sem a
  // leitura do negócio, seguem os outros avisos.
  if (meiOn && job.mei) {
    try {
      const business = await job.repo.getBusiness();
      const plan = meiReminderPlan(job.mei.choices, today, job.mei.hour, { mei: business?.businessProfile === 'mei', nowMinutes });
      for (const i of plan) {
        items.push({ id: i.id, date: fireDate(i), title: i.title, body: i.body, signature: routineReminderSignature(i), route: i.route, channel: 'rotina' });
      }
    } catch {
      // Falha de rede: o próximo gatilho tenta de novo.
    }
  }
  // Aviso de queda do nível (D-111): para quem permitiu lembretes, um lembrete no dia em que o aviso começa (o 45º dia sem anotar), no
  // horário dos lembretes do dia a dia, com texto neutro (sem contagem e sem nível: uma anotação pelo WhatsApp ou pelo Telegram conta no
  // banco sem refazer este lembrete; a contagem fica só dentro do app). Com o horário de hoje já passado, o marco seguinte. Sem a leitura
  // do nível, segue sem ele.
  try {
    const level = levelWarningReminder(await job.repo.getAccountLevel(), today, job.routine?.hour ?? DEFAULT_ROUTINE_REMINDER_HOUR, nowMinutes);
    if (level) items.push({ id: level.id, date: fireDate(level), title: level.title, body: level.body, signature: routineReminderSignature(level), route: level.route, channel: 'rotina' });
  } catch {
    // Falha de rede: os outros avisos seguem; o próximo gatilho tenta de novo.
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

function setMeiSwitch(userId: string, persist: boolean, which: MeiReminderKind, on: boolean) {
  const current = getPrefs(userId)?.meiReminders ?? NO_MEI_REMINDERS;
  updatePrefs(userId, { meiReminders: { ...current, [which]: on } }, persist);
}

/** Liga um lembrete do MEI (D-122), em "Seu negócio": como os do dia a dia, a permissão do sistema só é pedida depois do toque. */
export async function enableMeiReminder(userId: string, persist: boolean, which: MeiReminderKind): Promise<NotificationPermission> {
  const permission = await requestNotificationPermission();
  setMeiSwitch(userId, persist, which, true);
  return permission;
}

export function disableMeiReminder(userId: string, persist: boolean, which: MeiReminderKind) {
  setMeiSwitch(userId, persist, which, false);
}

export { getNotificationPermission };
