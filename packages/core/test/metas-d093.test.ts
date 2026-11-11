import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DEPOSIT_REMINDER_DAY,
  DEPOSIT_REMINDER_DAYS,
  GOALS_TEXT,
  GOAL_DEADLINE_SHORTCUTS,
  MemoryRepository,
  NO_ROUTINE_REMINDERS,
  ROUTINE_REMINDER_LIMIT,
  ROUTINE_REMINDER_TEXT,
  deadlineShortcutMonth,
  goalMilestoneCrossed,
  goalPace,
  isDepositReminderDay,
  isRepoError,
  newOperationKey,
  organizeGoals,
  parseRoutineReminderChoices,
  routineReminderPlan,
  type Goal,
  type NewGoalInput,
} from '../src';

/** Uma meta fictícia, criada em 15/08/2026, de R$ 3.000,00, com plano de R$ 300,00 por mês. */
const meta = (over: Partial<Goal> = {}): Goal => ({
  id: 'g1',
  contextId: 'ctx',
  goalType: 'objetivo',
  name: 'Viagem',
  targetCents: 300_000,
  targetMonth: null,
  plannedMonthlyCents: 30_000,
  essentialBaseCents: null,
  essentialMonths: null,
  essentialBaseSource: null,
  status: 'ativa',
  createdBy: 'p',
  version: 1,
  createdAt: '2026-08-15T12:00:00Z',
  updatedAt: '2026-08-15T12:00:00Z',
  savedCents: 0,
  initialCents: 0,
  depositsCents: 0,
  withdrawalsCents: 0,
  incomeCents: 0,
  appreciationCents: 0,
  depreciationCents: 0,
  lastMovementOn: null,
  priority: null,
  ...over,
});
const TODAY = '2026-11-11';

describe('D-093: atalhos de prazo', () => {
  it('6 meses, 1 ano, 2 anos e 5 anos a partir do mês de hoje', () => {
    expect(GOAL_DEADLINE_SHORTCUTS.map((s) => s.label)).toEqual(['6 meses', '1 ano', '2 anos', '5 anos']);
    expect(GOAL_DEADLINE_SHORTCUTS.map((s) => deadlineShortcutMonth(TODAY, s.months))).toEqual(['2027-05', '2027-11', '2028-11', '2031-11']);
    expect(deadlineShortcutMonth('2026-12-31', 6)).toBe('2027-06');
  });
});

describe('D-093: ritmo da meta', () => {
  it('conta os meses fechados a partir do mês seguinte ao da criação e compara os aportes menos os resgates com o plano', () => {
    // Criada em agosto: contam setembro e outubro (novembro ainda está em andamento). Esperado: R$ 600,00.
    expect(goalPace(meta({ depositsCents: 60_000, savedCents: 60_000 }), TODAY)).toEqual({
      onTrack: true,
      monthsBehind: 0,
      fromMonth: '2026-09',
      countedMonths: 2,
      plannedMonthlyCents: 30_000,
      missingCents: 240_000,
    });
    expect(goalPace(meta({ depositsCents: 30_000, savedCents: 30_000 }), TODAY)?.monthsBehind).toBe(1);
    expect(goalPace(meta(), TODAY)?.monthsBehind).toBe(2);
    // Um resgate conta contra; um aporte a mais conta a favor (adiantou o plano).
    expect(goalPace(meta({ depositsCents: 60_000, withdrawalsCents: 10_000, savedCents: 50_000 }), TODAY)?.monthsBehind).toBe(1);
    expect(goalPace(meta({ depositsCents: 90_000, savedCents: 90_000 }), TODAY)?.onTrack).toBe(true);
    // O que já estava guardado ao criar e os rendimentos não contam como aporte.
    expect(goalPace(meta({ initialCents: 60_000, incomeCents: 5_000, savedCents: 65_000 }), TODAY)?.monthsBehind).toBe(2);
  });

  it('o esperado nunca passa do que faltava guardar ao criar', () => {
    // Alvo R$ 500,00 e R$ 100,00 já guardados ao criar: o plano só precisava de R$ 400,00, não de R$ 600,00.
    const g = meta({ targetCents: 50_000, initialCents: 10_000, depositsCents: 40_000, savedCents: 50_000 - 1 });
    expect(goalPace({ ...g, savedCents: 49_999, depositsCents: 39_999 }, TODAY)?.monthsBehind).toBe(1);
    expect(goalPace({ ...g, depositsCents: 40_000, savedCents: 49_999, withdrawalsCents: 1 }, TODAY)?.monthsBehind).toBe(1);
  });

  it('sem plano, sem mês fechado, concluída, arquivada ou alcançada: sem ritmo', () => {
    expect(goalPace(meta({ plannedMonthlyCents: null }), TODAY)).toBeNull();
    expect(goalPace(meta({ plannedMonthlyCents: 0 }), TODAY)).toBeNull();
    expect(goalPace(meta({ createdAt: '2026-10-20T12:00:00Z' }), TODAY)).toBeNull();
    expect(goalPace(meta({ createdAt: '2026-11-02T12:00:00Z' }), TODAY)).toBeNull();
    expect(goalPace(meta({ status: 'concluida' }), TODAY)).toBeNull();
    expect(goalPace(meta({ status: 'arquivada' }), TODAY)).toBeNull();
    expect(goalPace(meta({ savedCents: 300_000, depositsCents: 300_000 }), TODAY)).toBeNull();
    expect(goalPace(meta({ createdAt: 'data ruim' }), TODAY)).toBeNull();
  });

  it('os textos dizem o ritmo, o que falta e de onde vem a conta, sem julgar', () => {
    const P = GOALS_TEXT.pace;
    expect(P.line(goalPace(meta({ depositsCents: 60_000, savedCents: 60_000 }), TODAY)!)).toBe('No ritmo do plano · faltam R$ 2.400,00');
    expect(P.line(goalPace(meta({ depositsCents: 30_000, savedCents: 30_000 }), TODAY)!)).toBe('1 mês atrás do plano · faltam R$ 2.700,00');
    expect(P.line(goalPace(meta(), TODAY)!)).toBe('2 meses atrás do plano · faltam R$ 3.000,00');
    expect(P.note(goalPace(meta(), TODAY)!)).toBe(
      'Compara os aportes menos os resgates com o plano de R$ 300,00 por mês, a partir de setembro de 2026, só nos meses já fechados. O que já estava guardado ao criar e os rendimentos não entram.',
    );
  });
});

describe('D-093: marcos de 25%, 50% e 75%', () => {
  it('o maior marco atravessado para cima, nunca os 100% nem uma descida', () => {
    expect(goalMilestoneCrossed(20_000, 30_000, 100_000)).toBe(25);
    expect(goalMilestoneCrossed(20_000, 60_000, 100_000)).toBe(50);
    expect(goalMilestoneCrossed(70_000, 99_999, 100_000)).toBe(75);
    expect(goalMilestoneCrossed(10_000, 80_000, 100_000)).toBe(75);
    expect(goalMilestoneCrossed(70_000, 100_000, 100_000)).toBeNull();
    expect(goalMilestoneCrossed(30_000, 40_000, 100_000)).toBeNull();
    expect(goalMilestoneCrossed(60_000, 40_000, 100_000)).toBeNull();
    expect(goalMilestoneCrossed(0, 0, 0)).toBeNull();
    // 24,999% arredonda para baixo: ainda não é 25%.
    expect(goalMilestoneCrossed(0, 24_999, 100_000)).toBeNull();
    expect(GOALS_TEXT.milestone('Viagem', 50)).toBe('Viagem passou de 50% da meta.');
  });
});

describe('D-093: prioridade das metas', () => {
  it('a ordem escolhida primeiro, as metas sem ordem depois, pela criação', () => {
    const goals = [
      meta({ id: 'a', createdAt: '2026-08-01T00:00:00Z', priority: null }),
      meta({ id: 'b', createdAt: '2026-08-02T00:00:00Z', priority: 2 }),
      meta({ id: 'c', createdAt: '2026-08-03T00:00:00Z', priority: 1 }),
      meta({ id: 'd', createdAt: '2026-07-01T00:00:00Z', priority: null }),
      meta({ id: 'r', goalType: 'emergencia', priority: null }),
    ];
    const o = organizeGoals(goals);
    expect(o.active.map((g) => g.id)).toEqual(['c', 'b', 'd', 'a']);
    expect(o.reserve?.id).toBe('r');
  });

  const input = (name: string, goalType: NewGoalInput['goalType'] = 'objetivo'): NewGoalInput => ({
    goalType,
    name,
    targetCents: goalType === 'emergencia' ? null : 100_000,
    targetMonth: null,
    plannedMonthlyCents: null,
    essentialBaseCents: goalType === 'emergencia' ? 100_000 : null,
    essentialMonths: goalType === 'emergencia' ? 3 : null,
    essentialBaseSource: goalType === 'emergencia' ? 'informado' : null,
    initialCents: null,
    initialOn: null,
  });
  const code = (p: Promise<unknown>) => p.then(() => null, (e: unknown) => (isRepoError(e) ? e.code : String(e)));

  it('a demonstração ordena como set_goal_order: a lista completa das ativas sem a reserva, sem subir a versão', async () => {
    const repo = new MemoryRepository({ actorId: 'pessoa-ordem', displayName: 'Pessoa', today: () => TODAY });
    const ctx = (await repo.ensurePersonalSpace('Conta principal')).personalContextId;
    const a = (await repo.createGoal(newOperationKey(), ctx, input('Viagem'))).goal;
    const b = (await repo.createGoal(newOperationKey(), ctx, input('Curso'))).goal;
    const c = (await repo.createGoal(newOperationKey(), ctx, input('Carro'))).goal;
    const r = (await repo.createGoal(newOperationKey(), ctx, input('Reserva para imprevistos', 'emergencia'))).goal;
    expect(await code(repo.setGoalOrder(newOperationKey(), ctx, [a.id, b.id]))).toBe('lista_invalida');
    expect(await code(repo.setGoalOrder(newOperationKey(), ctx, [a.id, b.id, c.id, r.id]))).toBe('lista_invalida');
    expect(await code(repo.setGoalOrder(newOperationKey(), ctx, [a.id, b.id, b.id]))).toBe('lista_invalida');
    expect(await code(repo.setGoalOrder(newOperationKey(), ctx, []))).toBe('lista_invalida');
    expect(await code(repo.setGoalOrder(newOperationKey(), 'outro-contexto', [a.id, b.id, c.id]))).toBe('nao_encontrado');
    const key = newOperationKey();
    expect(await repo.setGoalOrder(key, ctx, [c.id, a.id, b.id])).toEqual({ contextId: ctx, ids: [c.id, a.id, b.id] });
    expect(await repo.setGoalOrder(key, ctx, [c.id, a.id, b.id])).toEqual({ contextId: ctx, ids: [c.id, a.id, b.id] });
    expect(await code(repo.setGoalOrder(key, ctx, [a.id, b.id, c.id]))).toBe('chave_reutilizada');
    const list = await repo.listGoals(ctx);
    expect(organizeGoals(list).active.map((g) => g.name)).toEqual(['Carro', 'Viagem', 'Curso']);
    expect(list.find((g) => g.id === a.id)?.version).toBe(a.version);
    expect(list.find((g) => g.id === r.id)?.priority).toBeNull();
  });
});

describe('D-093: lembrete do aporte', () => {
  const ONLY: typeof NO_ROUTINE_REMINDERS = { ...NO_ROUTINE_REMINDERS, aporte: true };
  it('no dia escolhido do mês atual e do seguinte, só com meta com plano, sem o deste mês se já houve aporte', () => {
    const plan = (today: string, deposit: { day: 1 | 5 | 10 | 15 | 20 | 25; hasPlannedGoal: boolean; depositThisMonth: boolean } | undefined) =>
      routineReminderPlan(ONLY, [], null, today, 20, { deposit }).map((i) => `${i.date} ${i.route}`);
    expect(plan('2026-11-03', { day: 5, hasPlannedGoal: true, depositThisMonth: false })).toEqual(['2026-11-05 /metas', '2026-12-05 /metas']);
    expect(plan('2026-11-03', { day: 5, hasPlannedGoal: true, depositThisMonth: true })).toEqual(['2026-12-05 /metas']);
    expect(plan('2026-11-06', { day: 5, hasPlannedGoal: true, depositThisMonth: false })).toEqual(['2026-12-05 /metas']);
    expect(plan('2026-11-03', { day: 5, hasPlannedGoal: false, depositThisMonth: false })).toEqual([]);
    expect(plan('2026-11-03', undefined)).toEqual([]);
    const item = routineReminderPlan(ONLY, [], null, '2026-11-03', 20, { deposit: { day: 25, hasPlannedGoal: true, depositThisMonth: false } })[0]!;
    expect(item).toMatchObject({ id: 'clarevo-lembrete-rotina-aporte-2026-11', fireAt: '2026-11-25T20:00', title: 'Metas' });
    expect(item.body).toBe(ROUTINE_REMINDER_TEXT.kinds.aporte.body);
    expect(item.body).not.toMatch(/R\$|\d/);
  });

  it('escolhas e dias guardados no aparelho, e o limite com o aviso novo', () => {
    expect(parseRoutineReminderChoices({ aporte: true })).toEqual({ ...NO_ROUTINE_REMINDERS, aporte: true });
    expect(parseRoutineReminderChoices({ aporte: 'sim' }).aporte).toBe(false);
    expect(DEPOSIT_REMINDER_DAYS).toEqual([1, 5, 10, 15, 20, 25]);
    expect(DEFAULT_DEPOSIT_REMINDER_DAY).toBe(5);
    expect(isDepositReminderDay(5)).toBe(true);
    expect(isDepositReminderDay(31)).toBe(false);
    expect(ROUTINE_REMINDER_LIMIT).toBe(21);
    expect(ROUTINE_REMINDER_TEXT.depositDay(10)).toBe('Dia 10');
  });
});

describe('D-093: textos novos seguem as regras de redação', () => {
  it('sem travessão, sem a expressão proibida e com a marca no feminino', () => {
    const all = [
      ...Object.values(GOALS_TEXT.order).map((v) => (typeof v === 'function' ? v('Viagem' as never) : v)),
      GOALS_TEXT.pace.onTrack,
      GOALS_TEXT.pace.behind(3),
      GOALS_TEXT.form.typeHelp,
      GOALS_TEXT.form.typeHelpBody,
      GOALS_TEXT.form.deadlineShortcuts,
      ROUTINE_REMINDER_TEXT.kinds.aporte.toggle,
      ROUTINE_REMINDER_TEXT.kinds.aporte.caption,
      ROUTINE_REMINDER_TEXT.depositDayLabel,
    ];
    for (const t of all) {
      expect(t).not.toMatch(/—|–/);
      expect(t).not.toMatch(/fazer sentido/i);
      expect(t).not.toMatch(/\bo Clarevo\b/);
    }
  });
});

describe('ritmo da meta: o dia da criação no horário de Brasília (revisão de 11/11/2026)', () => {
  it('criada às 22h30 de 31/10 (01:30 do dia 01/11 em UTC) conta de novembro em diante, não de dezembro', async () => {
    const { goalPace } = await import('../src');
    const goal = { status: 'ativa' as const, createdAt: '2026-11-01T01:30:00Z', plannedMonthlyCents: 10_000, savedCents: 0, targetCents: 100_000, initialCents: 0, depositsCents: 0, withdrawalsCents: 0 };
    const pace = goalPace(goal, '2026-12-05')!;
    expect(pace.fromMonth).toBe('2026-11');
    expect(pace.countedMonths).toBe(1);
  });
});
