import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ROUTINE_REMINDER_HOUR,
  NO_ROUTINE_REMINDERS,
  REMINDER_LIMIT,
  ROUTINE_ABSENCE_DAYS,
  ROUTINE_DAILY_DAYS,
  ROUTINE_INCOME_DAY,
  ROUTINE_MAP_DAY,
  ROUTINE_REMINDER_HOURS,
  ROUTINE_REMINDER_ID_PREFIX,
  ROUTINE_REMINDER_KINDS,
  ROUTINE_REMINDER_LIMIT,
  ROUTINE_REMINDER_ROUTE,
  ROUTINE_REMINDER_TEXT,
  anyRoutineReminder,
  formatBRL,
  isReminderId,
  isRoutineReminderHour,
  isRoutineReminderId,
  isRoutineReminderKind,
  parseRoutineReminderChoices,
  reminderHourA11y,
  reminderHourLabel,
  routineReminderPlan,
  routineReminderSignature,
  type FinancialRecord,
  type RoutineReminderChoices,
} from '../src';

const CTX = 'ctx-pessoal';
const OTHER = 'ctx-familia';
const TODAY = '2026-11-06';
const ALL: RoutineReminderChoices = { gastos: true, recebimentos: true, mapa: true, ausencia: true, aporte: false, vencimentos: false, atualizar: false, aporte_investimentos: false };

let seq = 0;
function registro(kind: 'despesa' | 'receita', occurredOn: string, contextId = CTX): FinancialRecord {
  seq += 1;
  return {
    id: `r${seq}`,
    contextId,
    accountId: 'conta-1',
    kind,
    status: 'realizado',
    amountCents: 987_654 + seq,
    currency: 'BRL',
    occurredOn,
    description: `Registro secreto ${seq}`,
    category: 'Mercado',
    commitmentId: null,
    invoice: null,
    createdBy: 'pessoa-1',
    version: 1,
    createdAt: '2026-11-01T12:00:00Z',
    updatedAt: '2026-11-01T12:00:00Z',
  } as FinancialRecord;
}

const ids = (choices: RoutineReminderChoices, records: FinancialRecord[] = [], lastWriteOn: string | null = null, nowMinutes?: number) =>
  routineReminderPlan(choices, records, lastWriteOn ? { lastWriteOn } : null, TODAY, DEFAULT_ROUTINE_REMINDER_HOUR, { nowMinutes, contextId: CTX }).map((i) => i.id);

describe('lembretes do dia a dia (D-087): escolhas e horários', () => {
  it('oito avisos (o do aporte é da D-093; vencimentos, atualizar e o aporte nos investimentos, da D-099), cada um com interruptor, texto e endereço; horários 12h, 18h, 20h e 21h, padrão 20h', () => {
    expect(ROUTINE_REMINDER_KINDS).toEqual(['gastos', 'recebimentos', 'mapa', 'ausencia', 'aporte', 'vencimentos', 'atualizar', 'aporte_investimentos']);
    expect(ROUTINE_REMINDER_HOURS).toEqual([12, 18, 20, 21]);
    expect(DEFAULT_ROUTINE_REMINDER_HOUR).toBe(20);
    expect(isRoutineReminderHour(20)).toBe(true);
    expect(isRoutineReminderHour(19)).toBe(false);
    expect(isRoutineReminderHour('20')).toBe(false);
    expect(reminderHourLabel(20)).toBe('20h');
    expect(reminderHourA11y(21)).toBe('21 horas');
    for (const k of ROUTINE_REMINDER_KINDS) {
      expect(isRoutineReminderKind(k)).toBe(true);
      expect(ROUTINE_REMINDER_TEXT.kinds[k].toggle.length).toBeGreaterThan(5);
      expect(ROUTINE_REMINDER_ROUTE[k].startsWith('/')).toBe(true);
    }
    expect(isRoutineReminderKind('vencimento')).toBe(false);
  });

  it('as escolhas guardadas no aparelho: só true liga; faltando, inválido ou lixo fica desligado', () => {
    expect(parseRoutineReminderChoices(undefined)).toEqual(NO_ROUTINE_REMINDERS);
    expect(parseRoutineReminderChoices('gastos')).toEqual(NO_ROUTINE_REMINDERS);
    expect(parseRoutineReminderChoices({ gastos: true, mapa: 'sim', ausencia: 1, extra: true })).toEqual({ gastos: true, recebimentos: false, mapa: false, ausencia: false, aporte: false, vencimentos: false, atualizar: false, aporte_investimentos: false });
    expect(anyRoutineReminder(NO_ROUTINE_REMINDERS)).toBe(false);
    expect(anyRoutineReminder({ ...NO_ROUTINE_REMINDERS, ausencia: true })).toBe(true);
  });

  it('os textos dos avisos não levam valor, descrição nem categoria e seguem as regras de escrita', () => {
    const plan = routineReminderPlan(ALL, [registro('despesa', '2026-11-05'), registro('receita', '2026-10-30')], { lastWriteOn: '2026-11-05' }, TODAY, 20, { contextId: CTX });
    const texto = JSON.stringify(plan) + JSON.stringify(ROUTINE_REMINDER_TEXT);
    expect(texto).not.toContain('secreto');
    expect(texto).not.toContain('Mercado');
    expect(texto).not.toContain(formatBRL(987_655));
    expect(texto).not.toMatch(/\d{1,3}(\.\d{3})*,\d{2}/);
    expect(texto).not.toContain('—');
    expect(texto.toLowerCase()).not.toContain('fazer sentido');
  });
});

describe('lembretes do dia a dia (D-087): o plano', () => {
  it('nada com tudo desligado, hoje inválido, hora fora da lista ou limite zero', () => {
    expect(ids(NO_ROUTINE_REMINDERS)).toEqual([]);
    expect(routineReminderPlan(ALL, [], null, '2026-13-01', 20)).toEqual([]);
    expect(routineReminderPlan(ALL, [], null, TODAY, 19 as never)).toEqual([]);
    expect(routineReminderPlan(ALL, [], null, TODAY, 20, { limit: 0 })).toEqual([]);
  });

  it('"gastos": um por dia, de hoje a hoje + 13, no horário escolhido; hoje sai se o horário já passou', () => {
    const plan = routineReminderPlan({ ...NO_ROUTINE_REMINDERS, gastos: true }, [], null, TODAY, 21, { contextId: CTX });
    expect(plan).toHaveLength(ROUTINE_DAILY_DAYS);
    expect(plan[0]).toMatchObject({
      kind: 'gastos',
      id: `${ROUTINE_REMINDER_ID_PREFIX}gastos-2026-11-06`,
      date: TODAY,
      fireAt: '2026-11-06T21:00',
      hour: 21,
      title: 'Anotar gasto',
      body: 'Não se esqueça de anotar os gastos de hoje.',
      route: '/registro/novo',
    });
    expect(plan[13]?.date).toBe('2026-11-19');
    // 21h01 de hoje: o de hoje fica fora, e a lista continua até o dia 19 (13 avisos).
    const tarde = ids({ ...NO_ROUTINE_REMINDERS, gastos: true }, [], null, 21 * 60 + 1);
    expect(tarde).toHaveLength(ROUTINE_DAILY_DAYS - 1);
    expect(tarde[0]).toBe(`${ROUTINE_REMINDER_ID_PREFIX}gastos-2026-11-07`);
    // 19h59, com o aviso às 20h: o de hoje entra.
    expect(ids({ ...NO_ROUTINE_REMINDERS, gastos: true }, [], null, 20 * 60 - 1)[0]).toBe(`${ROUTINE_REMINDER_ID_PREFIX}gastos-2026-11-06`);
  });

  it('"gastos": o aviso de hoje sai quando hoje já tem gasto anotado no Pessoal (recebimento, gasto de ontem ou da Família não contam)', () => {
    const so = { ...NO_ROUTINE_REMINDERS, gastos: true };
    const hoje = `${ROUTINE_REMINDER_ID_PREFIX}gastos-${TODAY}`;
    expect(ids(so, [registro('despesa', TODAY)])).not.toContain(hoje);
    expect(ids(so, [registro('despesa', TODAY)])).toHaveLength(ROUTINE_DAILY_DAYS - 1);
    expect(ids(so, [registro('receita', TODAY)])).toContain(hoje);
    expect(ids(so, [registro('despesa', '2026-11-05')])).toContain(hoje);
    expect(ids(so, [registro('despesa', TODAY, OTHER)])).toContain(hoje);
    // Sem contexto nas opções, qualquer registro do dia conta.
    expect(routineReminderPlan(so, [registro('despesa', TODAY, OTHER)], null, TODAY, 20).map((i) => i.id)).not.toContain(hoje);
    // Compra no cartão anotada hoje (lida à parte pelo app) também conta como gasto anotado.
    expect(routineReminderPlan(so, [], null, TODAY, 20, { contextId: CTX, cardPurchaseToday: true }).map((i) => i.id)).not.toContain(hoje);
    expect(routineReminderPlan(so, [], null, TODAY, 20, { contextId: CTX, cardPurchaseToday: false }).map((i) => i.id)).toContain(hoje);
  });

  it('"recebimentos": dia 10 do mês atual (se não passou e o mês não tem recebimento) e do mês seguinte', () => {
    const so = { ...NO_ROUTINE_REMINDERS, recebimentos: true };
    expect(ids(so)).toEqual([`${ROUTINE_REMINDER_ID_PREFIX}recebimentos-2026-11`, `${ROUTINE_REMINDER_ID_PREFIX}recebimentos-2026-12`]);
    const item = routineReminderPlan(so, [], null, TODAY, 20)[0];
    expect(item).toMatchObject({ date: `2026-11-${ROUTINE_INCOME_DAY}`, fireAt: '2026-11-10T20:00', title: 'Registrar recebimento', route: '/registro/novo?tipo=receita' });
    // Recebimento no mês: só o do mês seguinte. Recebimento de outro mês ou da Família não conta.
    expect(ids(so, [registro('receita', '2026-11-05')])).toEqual([`${ROUTINE_REMINDER_ID_PREFIX}recebimentos-2026-12`]);
    expect(ids(so, [registro('receita', '2026-10-05')])).toHaveLength(2);
    expect(ids(so, [registro('receita', '2026-11-05', OTHER)])).toHaveLength(2);
    expect(ids(so, [registro('despesa', '2026-11-05')])).toHaveLength(2);
    // Depois do dia 10: só o do mês seguinte. No dia 10 às 20h00, o de hoje já passou.
    expect(routineReminderPlan(so, [], null, '2026-11-11', 20).map((i) => i.id)).toEqual([`${ROUTINE_REMINDER_ID_PREFIX}recebimentos-2026-12`]);
    expect(routineReminderPlan(so, [], null, '2026-11-10', 20, { nowMinutes: 20 * 60 }).map((i) => i.id)).toEqual([`${ROUTINE_REMINDER_ID_PREFIX}recebimentos-2026-12`]);
    expect(routineReminderPlan(so, [], null, '2026-11-10', 20, { nowMinutes: 20 * 60 - 1 }).map((i) => i.id)).toHaveLength(2);
    // Virada de ano.
    expect(routineReminderPlan(so, [], null, '2026-12-20', 20).map((i) => i.id)).toEqual([`${ROUTINE_REMINDER_ID_PREFIX}recebimentos-2027-01`]);
  });

  it('"mapa": dia 15 do mês atual (se não passou) e do mês seguinte, sempre, abrindo Análises', () => {
    const so = { ...NO_ROUTINE_REMINDERS, mapa: true };
    const plan = routineReminderPlan(so, [registro('despesa', TODAY), registro('receita', TODAY)], null, TODAY, 12, { contextId: CTX });
    expect(plan.map((i) => i.id)).toEqual([`${ROUTINE_REMINDER_ID_PREFIX}mapa-2026-11`, `${ROUTINE_REMINDER_ID_PREFIX}mapa-2026-12`]);
    expect(plan[0]).toMatchObject({ date: `2026-11-${ROUTINE_MAP_DAY}`, fireAt: '2026-11-15T12:00', title: 'Análises', body: 'Acompanhe o mapa de gastos do seu mês até agora.', route: '/analises' });
    expect(routineReminderPlan(so, [], null, '2026-11-16', 12).map((i) => i.id)).toEqual([`${ROUTINE_REMINDER_ID_PREFIX}mapa-2026-12`]);
  });

  it('"ausencia": última anotação + 7 dias, se ainda não passou; sem anotação nenhuma, nada', () => {
    const so = { ...NO_ROUTINE_REMINDERS, ausencia: true };
    expect(ids(so, [], '2026-11-05')).toEqual([`${ROUTINE_REMINDER_ID_PREFIX}ausencia-2026-11-12`]);
    const item = routineReminderPlan(so, [], { lastWriteOn: '2026-11-05' }, TODAY, 20)[0];
    expect(item).toMatchObject({ date: '2026-11-12', fireAt: '2026-11-12T20:00', title: 'Resumo', body: 'Faz uma semana sem anotações. Quando quiser, é só retomar.', route: '/' });
    expect(ROUTINE_ABSENCE_DAYS).toBe(7);
    // Já passou (anotação há 8 dias): nada; hoje às 20h00: nada; hoje às 19h59: entra.
    expect(ids(so, [], '2026-10-29')).toEqual([]);
    expect(ids(so, [], '2026-10-30', 20 * 60)).toEqual([]);
    expect(ids(so, [], '2026-10-30', 20 * 60 - 1)).toEqual([`${ROUTINE_REMINDER_ID_PREFIX}ausencia-2026-11-06`]);
    expect(ids(so, [], null)).toEqual([]);
    expect(routineReminderPlan(so, [], { lastWriteOn: 'ontem' }, TODAY, 20)).toEqual([]);
  });

  it('tudo ligado: em ordem de data e hora, 19 avisos, dentro do limite e do teto do iOS junto com os de vencimento', () => {
    const plan = routineReminderPlan(ALL, [], { lastWriteOn: '2026-11-04' }, TODAY, 20, { contextId: CTX });
    expect(plan).toHaveLength(ROUTINE_DAILY_DAYS + 2 + 2 + 1);
    expect(plan.length).toBeLessThanOrEqual(ROUTINE_REMINDER_LIMIT);
    expect(ROUTINE_REMINDER_LIMIT + REMINDER_LIMIT).toBeLessThan(64);
    const fire = plan.map((i) => i.fireAt);
    expect([...fire].sort()).toEqual(fire);
    expect(new Set(plan.map((i) => i.id)).size).toBe(plan.length);
    // O aviso de ausência (dia 11) fica entre os diários, na ordem do dia.
    const dia11 = plan.filter((i) => i.date === '2026-11-11').map((i) => i.kind);
    expect(dia11).toEqual(['gastos', 'ausencia']);
    // Limite menor corta os mais distantes.
    expect(routineReminderPlan(ALL, [], { lastWriteOn: '2026-11-04' }, TODAY, 20, { limit: 3 }).map((i) => i.date)).toEqual([TODAY, '2026-11-07', '2026-11-08']);
  });

  it('identificadores e assinatura: todos são avisos do Clarevo (isReminderId) e do dia a dia, sem bater com os de vencimento', () => {
    const plan = routineReminderPlan(ALL, [], { lastWriteOn: '2026-11-04' }, TODAY, 20);
    for (const i of plan) {
      expect(isReminderId(i.id)).toBe(true);
      expect(isRoutineReminderId(i.id)).toBe(true);
    }
    expect(isRoutineReminderId('clarevo-lembrete-2026-11-07')).toBe(false);
    expect(isRoutineReminderId('outro-app-2026-11-07')).toBe(false);
    const first = plan[0]!;
    expect(routineReminderSignature(first)).toBe(`${first.fireAt}|${first.title}|${first.body}|${first.route}`);
    const base = { fireAt: '2026-11-06T20:00', title: 't', body: 'a', route: '/x' };
    expect(routineReminderSignature(base)).not.toBe(routineReminderSignature({ ...base, fireAt: '2026-11-06T21:00' }));
    expect(routineReminderSignature(base)).not.toBe(routineReminderSignature({ ...base, route: '/y' }));
    expect(routineReminderSignature(base)).not.toBe(routineReminderSignature({ ...base, title: 'u' }));
  });
});

describe('lembretes dos investimentos (D-099)', () => {
  const ONLY = { gastos: false, recebimentos: false, mapa: false, ausencia: false, aporte: false, vencimentos: true, atualizar: true, aporte_investimentos: false } as const;
  it('vencimento: 7 dias antes e no dia, sem o nome; carência com texto próprio; atualizar: dia 1, só com algum sem valor no mês', () => {
    const plan = routineReminderPlan(ONLY, [], null, '2026-11-06', 20, {
      investments: { maturities: ['2026-11-20', '2026-11-20', '2026-11-08'], releases: ['2027-03-01', '2026-11-08'], hasActive: true, missingThisMonth: true },
    });
    expect(plan.map((i) => [i.id, i.date, i.body])).toEqual([
      ['clarevo-lembrete-rotina-vencimentos-2026-11-08-dia', '2026-11-08', 'Um investimento vence hoje. Confira na aba Investir.'],
      ['clarevo-lembrete-rotina-vencimentos-2026-11-20-antes', '2026-11-13', 'Um investimento vence em 7 dias. Confira na aba Investir.'],
      ['clarevo-lembrete-rotina-vencimentos-2026-11-20-dia', '2026-11-20', 'Um investimento vence hoje. Confira na aba Investir.'],
      ['clarevo-lembrete-rotina-atualizar-2026-12', '2026-12-01', 'Dia de atualizar o valor dos seus investimentos com o extrato.'],
      ['clarevo-lembrete-rotina-vencimentos-2027-03-01-carencia-antes', '2027-02-22', 'A carência de um investimento termina em 7 dias. Confira na aba Investir.'],
      ['clarevo-lembrete-rotina-vencimentos-2027-03-01-carencia-dia', '2027-03-01', 'A carência de um investimento termina hoje. Confira na aba Investir.'],
    ]);
    expect(plan.every((i) => i.route === '/investimentos' && i.title === 'Investimentos')).toBe(true);
    // No dia 1, com tudo atualizado no mês: só o do mês seguinte.
    const d1 = routineReminderPlan({ ...ONLY, vencimentos: false }, [], null, '2026-11-01', 20, { investments: { maturities: [], releases: [], hasActive: true, missingThisMonth: false } });
    expect(d1.map((i) => i.date)).toEqual(['2026-12-01']);
    expect(routineReminderPlan({ ...ONLY, vencimentos: false }, [], null, '2026-11-01', 20, { investments: { maturities: [], releases: [], hasActive: false, missingThisMonth: true } })).toEqual([]);
    expect(routineReminderPlan(ONLY, [], null, '2026-11-01', 20, {})).toEqual([]);
  });
});

