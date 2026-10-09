import { describe, expect, it } from 'vitest';
import {
  DEFAULT_REMINDER_HOUR,
  DEMO_TODAY,
  REMINDER_HOURS,
  REMINDER_ID_PREFIX,
  REMINDER_LIMIT,
  REMINDER_TEXT,
  addDays,
  createDemoRepository,
  formatBRL,
  isReminderHour,
  isReminderId,
  reminderBody,
  reminderHourA11y,
  reminderHourLabel,
  reminderPlan,
  type Commitment,
} from '../src';

const CTX = 'ctx-pessoal';
const OTHER = 'ctx-familia';

let seq = 0;
function conta(dueOn: string, over: Partial<Commitment> = {}): Commitment {
  seq += 1;
  return {
    id: `c${seq}`,
    contextId: CTX,
    description: `Conta secreta ${seq}`,
    amountCents: 1_234_567 + seq,
    currency: 'BRL',
    dueOn,
    category: 'Moradia',
    status: 'aberto',
    payment: null,
    series: null,
    seriesOverride: false,
    amountIsEstimate: false,
    createdBy: 'pessoa-1',
    version: 1,
    createdAt: '2026-10-01T12:00:00Z',
    updatedAt: '2026-10-01T12:00:00Z',
    ...over,
  };
}

const paga = (dueOn: string) =>
  conta(dueOn, { status: 'quitado', payment: { recordId: 'r1', amountCents: 1000, paidOn: '2026-10-01', accountId: 'a1' } });

describe('Lembretes (D-025): plano de avisos', () => {
  it('um aviso por dia, na véspera do vencimento, agrupando as contas do dia', () => {
    const plan = reminderPlan([conta('2026-10-15'), conta('2026-10-15'), conta('2026-10-15'), conta('2026-10-20')], '2026-10-09', 9);
    expect(plan).toEqual([
      {
        id: 'clarevo-lembrete-2026-10-14',
        date: '2026-10-14',
        fireAt: '2026-10-14T09:00',
        hour: 9,
        dueOn: '2026-10-15',
        count: 3,
        title: 'Contas a pagar',
        body: 'Você tem 3 contas com vencimento amanhã.',
      },
      {
        id: 'clarevo-lembrete-2026-10-19',
        date: '2026-10-19',
        fireAt: '2026-10-19T09:00',
        hour: 9,
        dueOn: '2026-10-20',
        count: 1,
        title: 'Contas a pagar',
        body: 'Você tem 1 conta com vencimento amanhã.',
      },
    ]);
  });

  it('ignora contas pagas, vencidas e as que vencem hoje', () => {
    const plan = reminderPlan([paga('2026-10-15'), conta('2026-10-01'), conta('2026-10-09'), conta('2026-10-12')], '2026-10-09', 9);
    expect(plan.map((p) => [p.dueOn, p.count])).toEqual([['2026-10-12', 1]]);
    // A conta paga do mesmo dia não entra na contagem.
    expect(reminderPlan([paga('2026-10-15'), conta('2026-10-15')], '2026-10-09', 9).map((p) => p.count)).toEqual([1]);
  });

  it('vencimento amanhã: aviso hoje só se o horário ainda não passou', () => {
    const list = [conta('2026-10-10'), conta('2026-10-11')];
    // 8h59 com aviso às 9h: o de hoje entra.
    expect(reminderPlan(list, '2026-10-09', 9, REMINDER_LIMIT, { nowMinutes: 8 * 60 + 59 }).map((p) => p.fireAt)).toEqual([
      '2026-10-09T09:00',
      '2026-10-10T09:00',
    ]);
    // 9h em ponto: já passou.
    expect(reminderPlan(list, '2026-10-09', 9, REMINDER_LIMIT, { nowMinutes: 9 * 60 }).map((p) => p.fireAt)).toEqual(['2026-10-10T09:00']);
    // Às 19h, com aviso às 19h, também passou; com aviso às 8h, ainda não chegou ao dia seguinte.
    expect(reminderPlan(list, '2026-10-09', 19, REMINDER_LIMIT, { nowMinutes: 19 * 60 + 5 }).map((p) => p.fireAt)).toEqual(['2026-10-10T19:00']);
    // Sem a hora atual, o aviso de hoje entra.
    expect(reminderPlan(list, '2026-10-09', 12).map((p) => p.date)).toEqual(['2026-10-09', '2026-10-10']);
  });

  it('respeita o horário escolhido (8h, 9h, 12h, 19h)', () => {
    for (const hour of REMINDER_HOURS) {
      const [item] = reminderPlan([conta('2026-10-20')], '2026-10-09', hour);
      expect(item!.fireAt).toBe(`2026-10-19T${String(hour).padStart(2, '0')}:00`);
      expect(item!.hour).toBe(hour);
    }
    expect(REMINDER_HOURS).toEqual([8, 9, 12, 19]);
    expect(DEFAULT_REMINDER_HOUR).toBe(9);
    expect(isReminderHour(9)).toBe(true);
    expect(isReminderHour(10)).toBe(false);
    expect(isReminderHour('9')).toBe(false);
    // Horário fora da lista: nenhum aviso (nunca um horário inventado).
    expect(reminderPlan([conta('2026-10-20')], '2026-10-09', 10 as never)).toEqual([]);
    expect(REMINDER_HOURS.map(reminderHourLabel)).toEqual(['8h', '9h', '12h', '19h']);
    expect(reminderHourA11y(12)).toBe('12 horas');
  });

  it('no máximo 30 avisos, os mais próximos', () => {
    const list = Array.from({ length: 45 }, (_, i) => conta(addDays('2026-10-10', 44 - i)));
    const plan = reminderPlan(list, '2026-10-09', 9);
    expect(REMINDER_LIMIT).toBe(30);
    expect(plan).toHaveLength(30);
    expect(plan[0]!.dueOn).toBe('2026-10-10');
    expect(plan[29]!.dueOn).toBe(addDays('2026-10-10', 29));
    expect(plan.map((p) => p.dueOn)).toEqual([...plan.map((p) => p.dueOn)].sort());
    expect(new Set(plan.map((p) => p.id)).size).toBe(30);
    // Limite menor, quando pedido.
    expect(reminderPlan(list, '2026-10-09', 9, 3)).toHaveLength(3);
    expect(reminderPlan(list, '2026-10-09', 9, 0)).toEqual([]);
  });

  it('só as contas do contexto pedido (Pessoal)', () => {
    const list = [conta('2026-10-15'), conta('2026-10-15', { contextId: OTHER }), conta('2026-10-16', { contextId: OTHER })];
    expect(reminderPlan(list, '2026-10-09', 9, REMINDER_LIMIT, { contextId: CTX }).map((p) => [p.dueOn, p.count])).toEqual([['2026-10-15', 1]]);
  });

  it('passa de mês e de ano sem fuso: véspera de 01/11 é 31/10; de 01/01 é 31/12', () => {
    const plan = reminderPlan([conta('2026-11-01'), conta('2027-01-01'), conta('2027-03-01')], '2026-10-09', 8);
    expect(plan.map((p) => p.id)).toEqual(['clarevo-lembrete-2026-10-31', 'clarevo-lembrete-2026-12-31', 'clarevo-lembrete-2027-02-28']);
  });

  it('nunca traz valor, descrição, categoria ou identificador da conta', () => {
    const list = [conta('2026-10-15'), conta('2026-10-15', { amountIsEstimate: true }), conta('2026-10-21', { category: 'Saúde' })];
    const plan = reminderPlan(list, '2026-10-09', 9);
    const out = JSON.stringify(plan);
    for (const c of list) {
      expect(out).not.toContain(c.description);
      expect(out).not.toContain(String(c.amountCents));
      expect(out).not.toContain(formatBRL(c.amountCents));
      expect(out).not.toContain(`"${c.id}"`);
    }
    expect(out).not.toContain('R$');
    expect(out).not.toContain('Moradia');
    expect(out).not.toContain('Saúde');
    for (const item of plan) expect(Object.keys(item).sort()).toEqual(['body', 'count', 'date', 'dueOn', 'fireAt', 'hour', 'id', 'title']);
  });

  it('textos do aviso e identificadores', () => {
    expect(reminderBody(1)).toBe('Você tem 1 conta com vencimento amanhã.');
    expect(reminderBody(3)).toBe('Você tem 3 contas com vencimento amanhã.');
    expect(REMINDER_TEXT.notificationTitle).toBe('Contas a pagar');
    expect(isReminderId(`${REMINDER_ID_PREFIX}2026-10-14`)).toBe(true);
    expect(isReminderId('outro-aviso')).toBe(false);
  });

  it('textos sem travessão, sem julgamento e sem a expressão proibida', () => {
    const FORBIDDEN =
      /\b(recomendamos|recomendo|invista|aplique|atrasad[oa]s?|cuidado|ruim|cortes?|caixinha)\b|vale a pena|desperd[ií]cio|\bestour|saldo devedor|faz(er|endo)?\s+sentido|[\u2013\u2014]/i;
    const texts = [...Object.values(REMINDER_TEXT), reminderBody(1), reminderBody(2)];
    for (const t of texts) expect(t).not.toMatch(FORBIDDEN);
    expect(REMINDER_TEXT.web).toBe('Lembretes estão disponíveis no app para celular.');
  });

  it('demonstração: contas em aberto de outubro e novembro viram avisos na véspera', async () => {
    const repo = await createDemoRepository();
    const ctx = (await repo.getSpace())!.personalContextId;
    const list = await repo.listCommitments(ctx, '2026-10');
    const plan = reminderPlan(list, DEMO_TODAY, 9, REMINDER_LIMIT, { nowMinutes: 8 * 60, contextId: ctx });
    // O Aluguel de outubro (pago) fica fora; Financiamento e Seguro vencem no mesmo dia (um aviso só).
    expect(plan.map((p) => `${p.date} ${p.count}`)).toEqual(['2026-10-14 1', '2026-10-19 1', '2026-11-04 1', '2026-11-09 2', '2026-11-11 1']);
    const out = JSON.stringify(plan);
    for (const c of list) expect(out).not.toContain(c.description);
  });
});
