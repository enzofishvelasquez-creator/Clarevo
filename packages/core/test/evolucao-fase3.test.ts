import { describe, expect, it } from 'vitest';
import {
  COMPARISON_ELIGIBLE_STATES,
  DEMO_TODAY,
  EVOLUTION_METRICS,
  EVOLUTION_TEXT,
  EVOLUTION_WINDOWS,
  EvolutionSelectionStore,
  MemoryRepository,
  PHASE3_MAX_MONTH_READS,
  averageCents,
  buildEvolutionView,
  buildPhase3View,
  committedEvolutionPoints,
  comparisonStats,
  createDemoRepository,
  evolutionAnnouncement,
  evolutionMonths,
  evolutionPanel,
  evolutionSelectedMonth,
  evolutionSubtitle,
  isPhase3Metric,
  medianCents,
  monthOf,
  newOperationKey,
  phase3ClosedMonths,
  phase3Empty,
  phase3Panel,
  savedInMonth,
  savingsEvolutionPoints,
  summarizeCommitted,
  type Commitment,
  type EvolutionPoint,
  type EvolutionPhase3Metric,
  type EvolutionWindow,
  type Goal,
  type GoalMovement,
  type IncomeReference,
  type IsoMonth,
  type MonthOverview,
  type Phase3Point,
} from '../src';

/**
 * Evolução, fase 3 (D-062 item 4): "Renda comprometida" e "Guardado em metas", só de meses fechados. Hoje, nos testes, é 07/10/2026
 * (outubro é o mês atual, em andamento, e nunca tem valor).
 */
const TODAY = '2026-10-07';
const CURRENT = '2026-10';
const CTX = 'ctx';
const SP = 'America/Sao_Paulo';

const commitment = (id: string, dueOn: string, amountCents: number, over: Partial<Commitment> = {}): Commitment => ({
  id,
  contextId: CTX,
  description: `Conta ${id}`,
  amountCents,
  currency: 'BRL',
  dueOn,
  category: null,
  status: 'aberto',
  payment: null,
  series: null,
  seriesOverride: false,
  amountIsEstimate: false,
  invoice: null,
  createdBy: 'p',
  version: 1,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  ...over,
});
const paid = (id: string, dueOn: string, planned: number, paidCents: number): Commitment =>
  commitment(id, dueOn, planned, { status: 'quitado', payment: { recordId: `r-${id}`, amountCents: paidCents, paidOn: dueOn, accountId: 'a' } });
const reference = (fromMonth: string, amountCents: number): IncomeReference => ({
  id: `ref-${fromMonth}`,
  contextId: CTX,
  fromMonth,
  amountCents,
  varies: false,
  createdBy: 'p',
  version: 1,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  amountChangedAt: null,
});
const goal = (id: string, createdAt: string, over: Partial<Goal> = {}): Goal => ({
  id,
  contextId: CTX,
  goalType: 'objetivo',
  name: `Meta ${id}`,
  targetCents: 600_000,
  targetMonth: null,
  plannedMonthlyCents: null,
  essentialBaseCents: null,
  essentialMonths: null,
  essentialBaseSource: null,
  status: 'ativa',
  createdBy: 'p',
  version: 1,
  createdAt,
  updatedAt: createdAt,
  savedCents: 0,
  initialCents: 0,
  depositsCents: 0,
  withdrawalsCents: 0,
  incomeCents: 0,
  appreciationCents: 0,
  depreciationCents: 0,
  lastMovementOn: null,
  ...over,
});
let seq = 0;
const movement = (goalId: string, kind: GoalMovement['kind'], amountCents: number, occurredOn: string): GoalMovement => ({
  id: `m${++seq}`,
  goalId,
  contextId: CTX,
  kind,
  amountCents,
  occurredOn,
  note: null,
  accountId: null,
  createdBy: 'p',
  version: 1,
  createdAt: `${occurredOn}T12:00:00Z`,
  updatedAt: `${occurredOn}T12:00:00Z`,
});

// ---------------------------------------------------------------------------------------------------------------------
// Renda comprometida
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Referência de R$ 6.000,00 a partir de julho. Maio: R$ 1.000,00 sem referência. Junho: nada. Julho: aluguel pago (R$ 2.500,00, pago por
 * R$ 2.480,00) e luz em aberto (R$ 180,00). Agosto: R$ 3.500,00. Setembro: nada, com referência. Outubro (atual): R$ 3.150,00.
 */
const refs = [reference('2026-07', 600_000)];
const byMonth = new Map<IsoMonth, Commitment[]>([
  ['2026-05', [commitment('maio', '2026-05-10', 100_000)]],
  ['2026-06', []],
  ['2026-07', [paid('aluguel', '2026-07-05', 250_000, 248_000), commitment('luz', '2026-07-12', 18_000)]],
  ['2026-08', [commitment('agosto', '2026-08-20', 350_000)]],
  ['2026-09', []],
]);
const committedPoints = (window: EvolutionWindow = 6, over: Partial<Parameters<typeof committedEvolutionPoints>[0]> = {}): Phase3Point[] => {
  const months = evolutionMonths(CURRENT, window);
  return committedEvolutionPoints({ months, currentMonth: CURRENT, contextId: CTX, today: TODAY, commitmentsByMonth: byMonth, refs, ...over });
};

describe('Renda comprometida: os pontos', () => {
  it('só meses fechados: o atual é em andamento, sem valor, mesmo com contas; sem referência é "sem base", nunca zero; com referência e sem conta é "sem registros"', () => {
    const points = committedPoints(6, { commitmentsByMonth: new Map([...byMonth, ['2026-10', [commitment('outubro', '2026-10-15', 315_000)]]]) });
    expect(points.map((p) => [p.month, p.state])).toEqual([
      ['2026-05', 'sem_base'],
      ['2026-06', 'sem_base'],
      ['2026-07', 'com_registros'],
      ['2026-08', 'com_registros'],
      ['2026-09', 'sem_registros'],
      ['2026-10', 'em_andamento'],
    ]);
    // Sem valor, o ponto não tem número nem texto de valor: o 0 de `cents` não é dado.
    for (const p of points.filter((x) => x.state !== 'com_registros')) expect(p).toMatchObject({ cents: 0, count: 0, valueText: null });
  });

  it('o percentual de um mês é o committedPermille de summarizeCommitted (o mesmo de month_committed), em milésimos, metade para cima', () => {
    const july = committedPoints().find((p) => p.month === '2026-07')!;
    // Aluguel pago por R$ 2.480,00 e luz em aberto por R$ 180,00: R$ 2.660,00 de R$ 6.000,00 = 44,333...% (443 milésimos).
    expect(summarizeCommitted(byMonth.get('2026-07')!, CTX, '2026-07', TODAY, refs).committedPermille).toBe(443);
    expect(july).toMatchObject({ cents: 443, count: 2, valueText: '44,3%' });
    const august = committedPoints().find((p) => p.month === '2026-08')!;
    expect(august).toMatchObject({ cents: 583, count: 1, valueText: '58,3%' });
  });

  it('uma conta de R$ 1,00 contra R$ 6.000,00 é "menos de 0,1%", e a referência vale a partir do mês dela', () => {
    const tiny = committedPoints(3, {
      commitmentsByMonth: new Map([
        ['2026-08', [commitment('um-real', '2026-08-03', 100)]],
        ['2026-09', [commitment('setembro', '2026-09-03', 100_000)]],
      ]),
      refs: [reference('2026-09', 600_000)],
    });
    // Agosto é anterior à referência (que vale a partir de setembro): sem base, mesmo com conta.
    expect(tiny.map((p) => [p.month, p.state, p.valueText])).toEqual([
      ['2026-08', 'sem_base', null],
      ['2026-09', 'com_registros', '16,7%'],
      ['2026-10', 'em_andamento', null],
    ]);
    const small = committedPoints(3, { commitmentsByMonth: new Map([['2026-08', [commitment('a', '2026-08-03', 100)]], ['2026-09', []]]), refs: [reference('2026-01', 600_000)] });
    expect(small[0]).toMatchObject({ state: 'com_registros', cents: 0, valueText: 'menos de 0,1%' });
    expect(small[1]).toMatchObject({ state: 'sem_registros' });
  });

  it('a referência mais recente até o mês vale (referenceFor), não a de hoje: o percentual de um mês passado usa a renda daquele mês', () => {
    const points = committedPoints(3, {
      commitmentsByMonth: new Map([
        ['2026-08', [commitment('agosto', '2026-08-20', 300_000)]],
        ['2026-09', [commitment('setembro', '2026-09-20', 300_000)]],
      ]),
      refs: [reference('2026-01', 600_000), reference('2026-09', 1_200_000)],
    });
    expect(points.map((p) => p.valueText)).toEqual(['50,0%', '25,0%', null]);
  });

  it('contas e referências de outro contexto ficam fora', () => {
    const other = committedPoints(3, {
      commitmentsByMonth: new Map([
        ['2026-08', [commitment('de-outro', '2026-08-20', 300_000, { contextId: 'outro' })]],
        ['2026-09', [commitment('da-casa', '2026-09-20', 300_000)]],
      ]),
      refs: [reference('2026-01', 600_000), { ...reference('2026-01', 100), contextId: 'outro', id: 'ref-outro' }],
    });
    expect(other.map((p) => p.state)).toEqual(['sem_registros', 'com_registros', 'em_andamento']);
    expect(other[1]!.valueText).toBe('50,0%');
  });

  it('mês fechado que não foi lido lança RangeError (nunca vira zero), e mês futuro também', () => {
    expect(() => committedPoints(3, { commitmentsByMonth: new Map([['2026-08', []]]) })).toThrow(/não lidas: 2026-09/);
    expect(() => committedEvolutionPoints({ months: ['2026-11'], currentMonth: CURRENT, contextId: CTX, today: TODAY, commitmentsByMonth: new Map(), refs })).toThrow(/futuro/);
    expect(() => committedEvolutionPoints({ months: ['2026-13'], currentMonth: CURRENT, contextId: CTX, today: TODAY, commitmentsByMonth: new Map(), refs })).toThrow(RangeError);
  });

  it('o mês atual nunca precisa de leitura: só os meses fechados da janela são lidos (no máximo 11, dentro do limite de 12)', () => {
    for (const window of EVOLUTION_WINDOWS) {
      const months = evolutionMonths(CURRENT, window);
      const closed = phase3ClosedMonths(months, CURRENT);
      expect(closed).toHaveLength(window - 1);
      expect(closed).not.toContain(CURRENT);
      expect(closed.length).toBeLessThanOrEqual(PHASE3_MAX_MONTH_READS);
    }
    expect(PHASE3_MAX_MONTH_READS).toBe(12);
  });

  it('o percentual da demonstração fecha com summarizeCommitted (quantas vezes a tela chama listCommitments, 11 em 12 meses, só o e2e confere)', async () => {
    const repo = await createDemoRepository();
    const space = await repo.ensurePersonalSpace('Conta principal');
    const ctx = space.personalContextId;
    await repo.createCommitment(newOperationKey(), ctx, { description: 'Escola', amountCents: 150_000, dueOn: '2026-08-10', category: 'Educação' });
    const months = evolutionMonths(monthOf(DEMO_TODAY), 12);
    const closed = phase3ClosedMonths(months, monthOf(DEMO_TODAY));
    const lists = new Map<IsoMonth, Commitment[]>();
    for (const m of closed) lists.set(m, await repo.listCommitments(ctx, m));
    const references = await repo.listIncomeReferences(ctx);
    const points = committedEvolutionPoints({ months, currentMonth: monthOf(DEMO_TODAY), contextId: ctx, today: DEMO_TODAY, commitmentsByMonth: lists, refs: references });
    // A demonstração tem referência de R$ 6.000,00 desde setembro: antes disso é sem base (inclusive agosto, que tem a conta de R$ 1.500,00);
    // setembro não tem conta; outubro (52,5%) é o mês atual e fica sem valor.
    expect(points).toHaveLength(12);
    expect(points.slice(0, 11).map((p) => p.state)).toEqual([...Array(10).fill('sem_base'), 'sem_registros']);
    expect(points[9]).toMatchObject({ month: '2026-08', state: 'sem_base', valueText: null });
    expect(points[10]!.month).toBe('2026-09');
    expect(points[11]).toMatchObject({ month: '2026-10', state: 'em_andamento', valueText: null });
    // O invariante da demonstração: outubro segue em 52,5% pelo resumo (e a Evolução não o mostra).
    const october = summarizeCommitted(await repo.listCommitments(ctx, '2026-10'), ctx, '2026-10', DEMO_TODAY, references);
    expect(october.committedPermille).toBe(525);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// Guardado em metas
// ---------------------------------------------------------------------------------------------------------------------

const g1 = goal('g1', '2026-06-15T12:00:00Z');
const movementsByMonth = new Map<IsoMonth, GoalMovement[]>([
  ['2026-05', []],
  ['2026-06', [movement('g1', 'aporte', 50_000, '2026-06-20')]],
  ['2026-07', [movement('g1', 'aporte', 30_000, '2026-07-05'), movement('g1', 'resgate', 80_000, '2026-07-25')]],
  ['2026-08', [movement('g1', 'rendimento', 1_000, '2026-08-31')]],
  ['2026-09', [movement('g1', 'aporte', 20_000, '2026-09-05')]],
]);
const savingsPoints = (window: EvolutionWindow = 6, over: Partial<Parameters<typeof savingsEvolutionPoints>[0]> = {}): Phase3Point[] =>
  savingsEvolutionPoints({ months: evolutionMonths(CURRENT, window), currentMonth: CURRENT, goals: [g1], movementsByMonth, timeZone: SP, ...over });

describe('Guardado em metas: os pontos', () => {
  it('aportes menos resgates do mês (savedInMonth), com sinal; o mês atual é em andamento, sem valor', () => {
    const points = savingsPoints();
    expect(points.map((p) => [p.month, p.state, p.cents, p.count, p.valueText])).toEqual([
      ['2026-05', 'sem_registros', 0, 0, null],
      ['2026-06', 'com_registros', 50_000, 1, 'R$ 500,00'],
      ['2026-07', 'com_registros', -50_000, 2, '-R$ 500,00'],
      ['2026-08', 'zero_confirmado', 0, 0, 'R$ 0,00'],
      ['2026-09', 'com_registros', 20_000, 1, 'R$ 200,00'],
      ['2026-10', 'em_andamento', 0, 0, null],
    ]);
    expect(savedInMonth(movementsByMonth.get('2026-07')!, '2026-07')).toBe(-50_000);
  });

  it('o mês atual nunca é lido nem entra: um aporte de outubro não aparece, mesmo se a leitura o trouxer', () => {
    const withOctober = new Map(movementsByMonth).set('2026-10', [movement('g1', 'aporte', 999_999, '2026-10-02')]);
    expect(savingsPoints(6, { movementsByMonth: withOctober }).at(-1)).toMatchObject({ month: '2026-10', state: 'em_andamento', cents: 0, valueText: null });
  });

  it('mês sem aporte nem resgate: zero confirmado só com meta existente no mês; sem meta é "sem registros", nunca zero', () => {
    // Maio é anterior à criação da meta (junho): sem registros. Com a meta criada antes, o mesmo maio é zero confirmado.
    expect(savingsPoints()[0]!.state).toBe('sem_registros');
    expect(savingsPoints(6, { goals: [goal('antiga', '2026-01-10T12:00:00Z')] })[0]).toMatchObject({ state: 'zero_confirmado', cents: 0, valueText: 'R$ 0,00' });
    // Sem nenhuma meta: nenhum mês é zero.
    expect(savingsPoints(6, { goals: [] }).map((p) => p.state)).toEqual(['sem_registros', 'com_registros', 'com_registros', 'sem_registros', 'com_registros', 'em_andamento']);
  });

  it('a situação de agora não conta: concluída e arquivada existem como a ativa, e o histórico é o mesmo antes e depois de arquivar', () => {
    const old = '2026-01-10T12:00:00Z';
    const ativa = savingsPoints(6, { goals: [goal('x', old)] });
    expect(ativa[0]).toMatchObject({ state: 'zero_confirmado', cents: 0, valueText: 'R$ 0,00' });
    for (const status of ['concluida', 'arquivada'] as const) {
      expect(savingsPoints(6, { goals: [goal('x', old, { status })] })).toEqual(ativa);
    }
    // A meta do teste (criada em junho, com aportes) arquivada em outubro: nem os meses antes da criação ganham zero, nem os depois perdem.
    expect(savingsPoints(6, { goals: [goal('g1', g1.createdAt, { status: 'arquivada', version: 2, updatedAt: '2026-10-02T12:00:00Z' })] })).toEqual(savingsPoints());
  });

  it('meta reativada (arquivada e ativa de novo): o histórico é o mesmo de uma meta que nunca saiu de ativa', () => {
    const base = goal('r', '2026-01-10T12:00:00Z');
    const reativada = goal('r', '2026-01-10T12:00:00Z', { status: 'ativa', version: 4, updatedAt: '2026-09-20T12:00:00Z' });
    expect(savingsPoints(6, { goals: [reativada] })).toEqual(savingsPoints(6, { goals: [base] }));
    expect(savingsPoints(6, { goals: [reativada] })[0]).toMatchObject({ state: 'zero_confirmado' });
  });

  it('saldo inicial, rendimento ou valorização datados antes da criação da meta não provam que ela existia: o mês fica "sem registros"', () => {
    const late = goal('tarde', '2026-10-01T12:00:00Z');
    const before = new Map(movementsByMonth)
      .set('2026-05', [movement('tarde', 'saldo_inicial', 100_000, '2026-05-10')])
      .set('2026-08', [movement('tarde', 'rendimento', 1_000, '2026-08-31'), movement('tarde', 'valorizacao', 2_000, '2026-08-15')]);
    const points = savingsPoints(6, { goals: [late], movementsByMonth: before });
    expect(points[0]).toMatchObject({ month: '2026-05', state: 'sem_registros', cents: 0, count: 0, valueText: null });
    expect(points[3]).toMatchObject({ month: '2026-08', state: 'sem_registros', cents: 0, count: 0, valueText: null });
    // Com a meta criada antes do mês, os mesmos movimentos convivem com o zero afirmado (e continuam fora do valor).
    const early = goal('cedo', '2026-05-02T12:00:00Z');
    const withEarly = savingsPoints(6, { goals: [early], movementsByMonth: before });
    expect(withEarly[0]).toMatchObject({ state: 'zero_confirmado', cents: 0, count: 0, valueText: 'R$ 0,00' });
    expect(withEarly[3]).toMatchObject({ state: 'zero_confirmado', cents: 0, count: 0 });
    // O movimento de outra meta também não prova nada: só a criação vale.
    expect(savingsPoints(6, { goals: [late], movementsByMonth })[0]!.state).toBe('sem_registros');
  });

  it('meta excluída: existia até o mês da exclusão (inclusive) e depois não prova nada; a exclusão usa o fuso de quem usa', () => {
    const months = ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09'] as const;
    const empty = new Map<IsoMonth, GoalMovement[]>(months.map((m) => [m, []]));
    const deleted = (deletedAt: string | null | undefined, timeZone = SP) =>
      savingsEvolutionPoints({
        months: evolutionMonths(CURRENT, 6),
        currentMonth: CURRENT,
        goals: [{ ...goal('d', '2026-05-10T12:00:00Z'), deletedAt }],
        movementsByMonth: empty,
        timeZone,
      }).map((p) => p.state);
    // Excluída em 15/07: maio a julho existia (julho, o mês da exclusão, ainda conta); agosto e setembro não.
    expect(deleted('2026-07-15T12:00:00Z')).toEqual(['zero_confirmado', 'zero_confirmado', 'zero_confirmado', 'sem_registros', 'sem_registros', 'em_andamento']);
    // Sem data de exclusão (a leitura do app só traz metas vivas), a meta vale desde a criação.
    expect(deleted(undefined)).toEqual(['zero_confirmado', 'zero_confirmado', 'zero_confirmado', 'zero_confirmado', 'zero_confirmado', 'em_andamento']);
    expect(deleted(null)).toEqual(deleted(undefined));
    // 22h de 31/07 em São Paulo já é agosto em UTC: lá a exclusão é de antes do começo de agosto, aqui ainda é de agosto.
    expect(deleted('2026-08-01T01:00:00Z', SP)).toEqual(['zero_confirmado', 'zero_confirmado', 'zero_confirmado', 'sem_registros', 'sem_registros', 'em_andamento']);
    expect(deleted('2026-08-01T01:00:00Z', 'UTC')).toEqual(['zero_confirmado', 'zero_confirmado', 'zero_confirmado', 'zero_confirmado', 'sem_registros', 'em_andamento']);
    // Data de exclusão ilegível não afirma nada.
    expect(deleted('não é data')).toEqual(['sem_registros', 'sem_registros', 'sem_registros', 'sem_registros', 'sem_registros', 'em_andamento']);
    // Outra meta ainda viva continua provando o mês depois da exclusão da primeira.
    const both = savingsEvolutionPoints({
      months: evolutionMonths(CURRENT, 6),
      currentMonth: CURRENT,
      goals: [{ ...goal('d', '2026-05-10T12:00:00Z'), deletedAt: '2026-06-15T12:00:00Z' }, goal('v', '2026-05-12T12:00:00Z')],
      movementsByMonth: empty,
      timeZone: SP,
    });
    expect(both.slice(0, 5).map((p) => p.state)).toEqual(Array(5).fill('zero_confirmado'));
  });

  it('rendimento, valorização e saldo inicial não são aporte nem resgate: ficam fora do valor e da contagem', () => {
    const only = new Map<IsoMonth, GoalMovement[]>([
      ['2026-08', [movement('g1', 'rendimento', 5_000, '2026-08-10'), movement('g1', 'valorizacao', 7_000, '2026-08-11'), movement('g1', 'saldo_inicial', 9_000, '2026-08-12')]],
      ['2026-09', [movement('g1', 'aporte', 10_000, '2026-09-10'), movement('g1', 'resgate', 10_000, '2026-09-11')]],
    ]);
    const points = savingsPoints(3, { movementsByMonth: only });
    expect(points[0]).toMatchObject({ month: '2026-08', state: 'zero_confirmado', count: 0, cents: 0 });
    // Aporte e resgate que se anulam são um mês com registros, de R$ 0,00.
    expect(points[1]).toMatchObject({ month: '2026-09', state: 'com_registros', count: 2, cents: 0, valueText: 'R$ 0,00' });
  });

  it('a data de criação da meta usa o fuso de quem usa: 22h de 30/06 em São Paulo já é julho em UTC', () => {
    const edge = goal('borda', '2026-07-01T01:00:00Z');
    const empty = new Map<IsoMonth, GoalMovement[]>([['2026-06', []], ['2026-07', []]]);
    const sp = savingsEvolutionPoints({ months: ['2026-06', '2026-07'], currentMonth: '2026-08', goals: [edge], movementsByMonth: empty, timeZone: SP });
    const utc = savingsEvolutionPoints({ months: ['2026-06', '2026-07'], currentMonth: '2026-08', goals: [edge], movementsByMonth: empty, timeZone: 'UTC' });
    expect(sp.map((p) => p.state)).toEqual(['zero_confirmado', 'zero_confirmado']);
    expect(utc.map((p) => p.state)).toEqual(['sem_registros', 'zero_confirmado']);
  });

  it('mês fechado que não foi lido lança RangeError, e mês futuro também', () => {
    expect(() => savingsPoints(3, { movementsByMonth: new Map([['2026-08', []]]) })).toThrow(/não lidos: 2026-09/);
    expect(() => savingsEvolutionPoints({ months: ['2026-11'], currentMonth: CURRENT, goals: [g1], movementsByMonth: new Map(), timeZone: SP })).toThrow(/futuro/);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// Média, mediana e a visão
// ---------------------------------------------------------------------------------------------------------------------

describe('média e mediana das duas métricas', () => {
  it('os cálculos aceitam valores negativos só com a opção, e o padrão continua recusando (Aprender usa o padrão)', () => {
    expect(() => medianCents([1, -2])).toThrow(RangeError);
    expect(() => averageCents([1, -2])).toThrow(RangeError);
    expect(averageCents([-50_000, 0, 20_000, 50_000], { signed: true })).toBe(5_000);
    expect(medianCents([50_000, -50_000, 20_000, 0], { signed: true })).toBe(10_000);
    // O meio centavo arredonda para longe do zero, como roundDivBig.
    expect(averageCents([-1, -2], { signed: true })).toBe(-2);
    expect(medianCents([-1, -2], { signed: true })).toBe(-2);
    expect(averageCents([1, 2], { signed: true })).toBe(2);
    // Sem negativos, o resultado é o mesmo com e sem a opção.
    expect(averageCents([320_000, 340_000, 330_000, 780_000, 345_000, 360_000], { signed: true })).toBe(averageCents([320_000, 340_000, 330_000, 780_000, 345_000, 360_000]));
    expect(medianCents([320_000, 340_000, 330_000, 780_000, 345_000, 360_000], { signed: true })).toBe(342_500);
  });

  it('comparisonStats: sem base nunca é elegível, o valor negativo entra, e o total soma os pontos com sinal', () => {
    const point = (month: string, cents: number, state: EvolutionPoint['state']): EvolutionPoint => ({ month, cents, count: state === 'com_registros' ? 1 : 0, state });
    const stats = comparisonStats(
      [point('2026-05', 0, 'sem_base'), point('2026-06', 50_000, 'com_registros'), point('2026-07', -50_000, 'com_registros'), point('2026-08', 0, 'zero_confirmado'), point('2026-09', 20_000, 'com_registros'), point('2026-10', 0, 'em_andamento')],
      [],
    );
    expect(stats).toMatchObject({ eligibleCount: 4, visibleCount: 4, average: 5_000, median: 10_000, canonicalTotal: 20_000n });
    // Pedir sem_base como elegível não adianta (como sem_registros).
    const forced = comparisonStats([point('2026-05', 100, 'sem_base'), point('2026-06', 300, 'com_registros')], [], [...COMPARISON_ELIGIBLE_STATES, 'sem_base' as never]);
    expect(forced).toMatchObject({ eligibleCount: 1, average: 300 });
    // Percentual em milésimos: média e mediana de 443 e 583 (a metade vai para cima).
    expect(comparisonStats([point('a', 443, 'com_registros'), point('b', 583, 'com_registros')], [])).toMatchObject({ average: 513, median: 513 });
    expect(comparisonStats([point('a', 525, 'com_registros'), point('b', 530, 'com_registros')], [])).toMatchObject({ average: 528, median: 528 });
  });
});

const committedView = (hidden: string[] = [], window: EvolutionWindow = 6) =>
  buildPhase3View({ metric: 'comprometida', points: committedPoints(window), windowMonths: window, currentMonth: CURRENT, hiddenMonths: hidden });
const savingsView = (hidden: string[] = [], window: EvolutionWindow = 6, goals: Goal[] = [g1]) =>
  buildPhase3View({ metric: 'guardado', points: savingsPoints(window, { goals }), windowMonths: window, currentMonth: CURRENT, hiddenMonths: hidden });

describe('a visão da Renda comprometida', () => {
  it('cada ponto diz o que é: percentual, sem base, sem registros ou em andamento, com o nome acessível', () => {
    const view = committedView();
    expect(view.metric).toBe('comprometida');
    expect(view.unit).toBe('permille');
    expect(view.points.map((p) => p.name)).toEqual([
      'Maio de 2026, sem base, fora da comparação',
      'Junho de 2026, sem base, fora da comparação',
      'Julho de 2026, 44,3%, na comparação',
      'Agosto de 2026, 58,3%, na comparação',
      'Setembro de 2026, sem registros, fora da comparação',
      'Outubro de 2026, mês em andamento, fora da comparação',
    ]);
    expect(view.points.map((p) => p.participation)).toEqual(['fora_sem_base', 'fora_sem_base', 'na_comparacao', 'na_comparacao', 'fora_sem_registros', 'fora_andamento']);
    expect(view.points.map((p) => p.hasValue)).toEqual([false, false, true, true, false, false]);
    expect(view.points.map((p) => p.valueText)).toEqual([null, null, '44,3%', '58,3%', null, null]);
    expect(view.points.map((p) => p.stateLabel)).toEqual(['Sem base', 'Sem base', 'Com registros', 'Com registros', 'Sem registros', 'Mês em andamento']);
    expect(view.points[0]!.stateText).toBe('Sem base: não há renda de referência para este mês');
    expect(view.points[4]!.stateText).toBe('Sem registros: mês sem conta anotada não quer dizer mês sem contas');
    expect(view.points[5]!.stateText).toBe('Mês em andamento: só meses já fechados entram aqui');
  });

  it('média e mediana só dos meses fechados com base e contas, em percentual, com "n de N"; sem total (somar percentuais não dá percentual)', () => {
    const view = committedView();
    expect(view.stats).toMatchObject({ eligibleCount: 2, visibleCount: 2, average: 513, median: 513 });
    expect(view.averageText).toBe('51,3%');
    expect(view.medianText).toBe('51,3%');
    expect(view.eligibleCount).toBe(2);
    expect(view.outCount).toBe(0);
    expect(view.totalCents).toBeNull();
    expect(view.maxCents).toBe(583);
    expect(view.minCents).toBe(0);
    expect(view.situation).toBe('normal');
    expect(evolutionAnnouncement(view)).toBe('Média 51,3%, mediana 51,3%, 2 de 2 meses.');
  });

  it('tirar um mês da comparação muda só a média e a mediana: um mês fica "um_mes", todos fora vira "todos_fora" e nunca média zero', () => {
    const one = committedView(['2026-07']);
    expect(one).toMatchObject({ situation: 'um_mes', outCount: 1, eligibleCount: 2 });
    expect(one.stats).toMatchObject({ visibleCount: 1, average: 583, median: 583 });
    expect(one.averageText).toBe('58,3%');
    expect(one.points.find((p) => p.month === '2026-07')).toMatchObject({ participation: 'fora_escolha', included: false, eligible: true, valueText: '44,3%' });
    const none = committedView(['2026-07', '2026-08']);
    expect(none.situation).toBe('todos_fora');
    expect(none.stats.average).toBeNull();
    expect(none.averageText).toBeNull();
    expect(none.medianText).toBeNull();
    expect(evolutionAnnouncement(none)).toBe('Nenhum mês na comparação.');
    // Tirar mês que não é elegível (sem base, sem registros, em andamento) não muda nada e não conta como fora.
    const noise = committedView(['2026-05', '2026-09', '2026-10']);
    expect(noise.outCount).toBe(0);
    expect(noise.stats.visibleCount).toBe(2);
    expect(noise.points.find((p) => p.month === '2026-05')!.participation).toBe('fora_sem_base');
  });

  it('com mês fechado nenhum com valor: situação sem_registros (a tela mostra "Sem base" ou "Sem registros"), e a janela de 3 meses tem 2 meses fechados', () => {
    const noBase = buildPhase3View({
      metric: 'comprometida',
      points: committedPoints(3, { refs: [] }),
      windowMonths: 3,
      currentMonth: CURRENT,
      hiddenMonths: [],
    });
    expect(noBase.situation).toBe('sem_registros');
    expect(noBase.points.map((p) => p.state)).toEqual(['sem_base', 'sem_base', 'em_andamento']);
    expect(phase3Empty(noBase, true)).toEqual({
      title: 'Sem base para estes meses',
      body: 'Sem a renda de referência, não há com o que dividir as contas do mês. Ela é informada em Renda comprometida. Só meses já fechados entram aqui.',
      action: { kind: 'referencia', label: 'Informar renda de referência' },
    });
    expect(phase3Empty(noBase, false).action).toBeNull();
    // Com referência e sem conta: "Sem registros", com a ação de anotar uma conta.
    const noBills = buildPhase3View({
      metric: 'comprometida',
      points: committedPoints(3, { commitmentsByMonth: new Map([['2026-08', []], ['2026-09', []]]), refs: [reference('2026-01', 600_000)] }),
      windowMonths: 3,
      currentMonth: CURRENT,
      hiddenMonths: [],
    });
    expect(noBills.situation).toBe('sem_registros');
    expect(phase3Empty(noBills, true)).toMatchObject({ title: 'Sem registros nestes meses', action: { kind: 'conta', label: 'Anotar conta a pagar' } });
    expect(phase3Empty(noBills, true).body).toContain('Mês sem conta anotada não quer dizer mês sem contas');
  });
});

describe('a visão do Guardado em metas', () => {
  it('valores em reais com sinal, zero confirmado e sem registros, com "n de N", o total e a escala com o zero no meio', () => {
    const view = savingsView();
    expect(view.metric).toBe('guardado');
    expect(view.unit).toBe('cents');
    expect(view.points.map((p) => p.name)).toEqual([
      'Maio de 2026, sem registros, fora da comparação',
      'Junho de 2026, R$ 500,00, na comparação',
      'Julho de 2026, -R$ 500,00, na comparação',
      'Agosto de 2026, R$ 0,00, sem aportes nem resgates, com meta já criada, na comparação',
      'Setembro de 2026, R$ 200,00, na comparação',
      'Outubro de 2026, mês em andamento, fora da comparação',
    ]);
    expect(view.stats).toMatchObject({ eligibleCount: 4, visibleCount: 4, average: 5_000, median: 10_000 });
    expect(view.averageText).toBe('R$ 50,00');
    expect(view.medianText).toBe('R$ 100,00');
    expect(view.totalCents).toBe(20_000);
    expect(view.maxCents).toBe(50_000);
    expect(view.minCents).toBe(-50_000);
    expect(view.points[3]).toMatchObject({ participation: 'na_comparacao', hasValue: true, valueText: 'R$ 0,00', stateLabel: 'Sem movimento' });
    expect(view.points[3]!.stateText).toBe('Sem aportes nem resgates, com meta já criada neste mês');
    expect(evolutionAnnouncement(view)).toBe('Média R$ 50,00, mediana R$ 100,00, 4 de 4 meses.');
  });

  it('o total não depende da seleção, e tirar o mês negativo muda média e mediana', () => {
    const noJuly = savingsView(['2026-07']);
    expect(noJuly.totalCents).toBe(20_000);
    expect(noJuly.stats).toMatchObject({ visibleCount: 3, average: 23_333, median: 20_000 });
    expect(noJuly.outCount).toBe(1);
    expect(noJuly.minCents).toBe(-50_000);
  });

  it('sem nenhuma meta ativa em nenhum mês fechado e sem movimentos: sem registros, com a ação de criar uma meta', () => {
    const view = buildPhase3View({
      metric: 'guardado',
      points: savingsPoints(3, { goals: [], movementsByMonth: new Map([['2026-08', []], ['2026-09', []]]) }),
      windowMonths: 3,
      currentMonth: CURRENT,
      hiddenMonths: [],
    });
    expect(view.situation).toBe('sem_registros');
    expect(phase3Empty(view, true)).toEqual({
      title: 'Sem registros nestes meses',
      body: 'Não há meta criada nestes meses. Só meses já fechados entram aqui.',
      action: { kind: 'meta', label: 'Criar meta' },
    });
    expect(phase3Empty(view, false).action).toBeNull();
  });
});

describe('a visão da fase 3: regras comuns', () => {
  it('exige os pontos exatos da janela e nenhum valor no mês atual (nada de previsão)', () => {
    expect(() => buildPhase3View({ metric: 'guardado', points: savingsPoints(6).slice(1), windowMonths: 6, currentMonth: CURRENT, hiddenMonths: [] })).toThrow(/não são os meses da janela/);
    const bad = savingsPoints(3).map((p) => (p.month === CURRENT ? { ...p, state: 'com_registros' as const, cents: 100, valueText: 'R$ 1,00' } : p));
    expect(() => buildPhase3View({ metric: 'guardado', points: bad, windowMonths: 3, currentMonth: CURRENT, hiddenMonths: [] })).toThrow(/só meses fechados/);
  });

  it('a seleção de meses fora da comparação é separada por valor (T13) e vale em qualquer janela', () => {
    const store = new EvolutionSelectionStore();
    const scope = EvolutionSelectionStore.scope('p1', 'c1')!;
    store.setHidden(scope, 'guardado', '2026-07', true);
    store.setHidden(scope, 'comprometida', '2026-08', true);
    expect([...store.get(scope, 'guardado')]).toEqual(['2026-07']);
    expect([...store.get(scope, 'comprometida')]).toEqual(['2026-08']);
    expect(store.get(scope, 'pago').size).toBe(0);
    expect(store.get(scope, 'recebido').size).toBe(0);
    store.restoreAll(scope, 'guardado');
    expect(store.get(scope, 'guardado').size).toBe(0);
    expect([...store.get(scope, 'comprometida')]).toEqual(['2026-08']);
    // Um mês tirado fora da janela é citado e devolvido pelo "Restaurar todos", como em Recebido e Pago.
    const outside = buildPhase3View({ metric: 'guardado', points: savingsPoints(3), windowMonths: 3, currentMonth: CURRENT, hiddenMonths: ['2026-01'] });
    expect(outside.outsideMonths).toEqual(['2026-01']);
    expect(outside.outCount).toBe(0);
    store.clear();
    expect(store.get(scope, 'comprometida').size).toBe(0);
  });

  it('o seletor tem os quatro valores, Recebido e Pago primeiro; os dois novos são da fase 3', () => {
    expect(EVOLUTION_METRICS).toEqual(['recebido', 'pago', 'comprometida', 'guardado']);
    expect(EVOLUTION_METRICS.map((m) => EVOLUTION_TEXT.metrics[m])).toEqual(['Recebido', 'Pago', 'Renda comprometida', 'Guardado em metas']);
    expect(isPhase3Metric('comprometida')).toBe(true);
    expect(isPhase3Metric('guardado')).toBe(true);
    expect(isPhase3Metric('pago')).toBe(false);
    expect(isPhase3Metric(undefined)).toBe(false);
  });

  it('cada valor escreve a própria base no subtítulo, e os novos dizem "Só meses já fechados"', () => {
    expect(evolutionSubtitle('comprometida').base).toBe('Percentual da renda de referência ligado a contas do mês');
    expect(evolutionSubtitle('guardado').base).toBe('Aportes menos resgates nas metas');
    for (const metric of ['comprometida', 'guardado'] as EvolutionPhase3Metric[]) expect(evolutionSubtitle(metric).note).toContain('Só meses já fechados');
    expect(evolutionSubtitle('pago')).toEqual({ base: 'Valores registrados, pela data do pagamento', note: null });
    expect(evolutionSubtitle('recebido')).toEqual({ base: 'Valores registrados, pela data do pagamento', note: null });
    expect(EVOLUTION_TEXT.chart.title('comprometida')).toBe('Renda comprometida por mês');
    expect(EVOLUTION_TEXT.chart.title('guardado')).toBe('Guardado em metas por mês');
    expect(EVOLUTION_TEXT.custom.scope('guardado')).toBe('Vale só para Guardado em metas.');
  });

  it('o mês aberto por padrão é o fechado mais recente com valor; sem valor nenhum, o último; o escolhido vale se estiver na janela', () => {
    const view = committedView();
    expect(evolutionSelectedMonth(view, null)).toBe('2026-08');
    expect(evolutionSelectedMonth(view, '2026-05')).toBe('2026-05');
    expect(evolutionSelectedMonth(view, '2025-01')).toBe('2026-08');
    const empty = buildPhase3View({ metric: 'comprometida', points: committedPoints(3, { refs: [] }), windowMonths: 3, currentMonth: CURRENT, hiddenMonths: [] });
    expect(evolutionSelectedMonth(empty, null)).toBe('2026-10');
    expect(evolutionSelectedMonth(savingsView(), null)).toBe('2026-09');
  });

  it('o painel: valor ou motivo, estado, base, interruptor só no mês fechado com valor, e "Disponível para Recebido e Pago" no lugar de "Entender o que mudou"', () => {
    const view = committedView(['2026-08']);
    const july = phase3Panel(view, '2026-07');
    expect(july).toMatchObject({
      title: 'Julho de 2026',
      metric: 'comprometida',
      valueCaption: 'Renda comprometida',
      valueText: '44,3%',
      noValueText: null,
      state: 'com_registros',
      stateText: 'Com contas no mês',
      baseText: 'Percentual da renda de referência ligado a contas do mês',
      canToggle: true,
      included: true,
      notEligibleText: null,
      previousMonth: '2026-06',
      nextMonth: '2026-08',
      explainTitle: 'Entender o que mudou',
      explainNote: 'Disponível para Recebido e Pago',
      switchCaption: 'Tirar da comparação não apaga nem muda nenhuma conta, meta ou lançamento.',
    });
    expect(phase3Panel(view, '2026-08')).toMatchObject({ canToggle: true, included: false });
    expect(phase3Panel(view, '2026-05')).toMatchObject({ valueText: null, noValueText: 'Sem base', canToggle: false, notEligibleText: 'Este mês fica fora da comparação porque não há renda de referência para ele.', previousMonth: null });
    expect(phase3Panel(view, '2026-09')).toMatchObject({ noValueText: 'Sem registros', canToggle: false, notEligibleText: 'Este mês fica fora da comparação porque não tem registros.' });
    expect(phase3Panel(view, '2026-10')).toMatchObject({ noValueText: 'Mês em andamento', canToggle: false, nextMonth: null, notEligibleText: 'Este mês fica fora da comparação até terminar.' });
    // Mês fora da janela: o painel mostra o último.
    expect(phase3Panel(view, '2020-01').month).toBe('2026-10');
    const saved = phase3Panel(savingsView(), '2026-07');
    expect(saved).toMatchObject({ valueText: '-R$ 500,00', cents: -50_000, unit: 'cents', valueCaption: 'Guardado em metas', stateText: 'Com aportes ou resgates', baseText: 'Aportes menos resgates nas metas' });
  });

  it('as visões de Recebido e Pago seguem como eram: unidade em centavos, escala a partir do zero, total e textos de média', () => {
    const overview: MonthOverview[] = [
      { month: '2026-08', receivedCount: 1, receivedCents: 500_000, paidCount: 3, paidCents: 320_000 },
      { month: '2026-09', receivedCount: 1, receivedCents: 500_000, paidCount: 3, paidCents: 330_000 },
    ];
    const view = buildEvolutionView({ overview, metric: 'pago', windowMonths: 3, currentMonth: CURRENT, hiddenMonths: [] });
    expect(view).toMatchObject({ unit: 'cents', minCents: 0, maxCents: 330_000, totalCents: 650_000, averageText: 'R$ 3.250,00', medianText: 'R$ 3.250,00' });
    expect(view.points.map((p) => p.hasValue)).toEqual([true, true, false]);
    expect(evolutionAnnouncement(view)).toBe('Média R$ 3.250,00, mediana R$ 3.250,00, 2 de 2 meses.');
    // O painel de Recebido e Pago segue pelo caminho de sempre.
    expect(evolutionPanel(view, '2026-09').metric).toBe('pago');
    expect(summarizeCommitted([], CTX, '2026-09', TODAY, []).committedPermille).toBeNull();
  });
});
