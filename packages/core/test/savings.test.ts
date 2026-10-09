import { describe, expect, it } from 'vitest';
import {
  DEMO_TODAY,
  MAX_RECORD_CENTS,
  MINIMUM_RESERVE_CHIPS,
  MINIMUM_RESERVE_MIN_CENTS,
  MemoryRepository,
  RESERVE_NAME,
  SAVINGS_ANSWERS,
  SAVINGS_ERROR_TEXT,
  SAVINGS_LATER_DAYS,
  SAVINGS_MIN_MONTHLY_CENTS,
  SAVINGS_NOT_NOW_DAYS,
  SAVINGS_STAGE_MONTHS,
  SAVINGS_TEXT,
  calcCustoPorAno,
  createDemoRepository,
  goalInputError,
  goalPlan,
  isRepoError,
  isSavingsStepDone,
  lastIncomeReferenceChange,
  minimumReserveInput,
  minimumReserveOptions,
  newOperationKey,
  savingsAnswerError,
  savingsAskAgainOn,
  savingsAskReason,
  savingsCardState,
  savingsErrorText,
  savingsPlan,
  savingsPlanTexts,
  savingsReferenceText,
  savingsReserveInput,
  savingsSmallSteps,
  savingsStageTexts,
  shouldAskSavings,
  summarizeCommitted,
  summarizeMonth,
  validateMinimumReserveDraft,
  validateSavingsDraft,
  weeklySavingsToMonthly,
  type GoalMovement,
  type IncomeReference,
  type RepoError,
  type RepoErrorCode,
  type SavingsAnswer,
  type SavingsCheck,
  type SavingsPlanInput,
} from '../src';

const TODAY = DEMO_TODAY; // 2026-10-07
const key = () => newOperationKey();

async function expectCode(p: Promise<unknown>, code: RepoErrorCode, detail?: string) {
  let error: unknown = null;
  try {
    await p;
  } catch (e) {
    error = e;
  }
  expect(isRepoError(error, code), `esperava ${code}, veio ${String((error as RepoError | null)?.code ?? error)}`).toBe(true);
  if (detail !== undefined) expect((error as RepoError).detail).toBe(detail);
}

/** Repositório vazio com o dia ajustável. */
async function freshRepo(day = TODAY) {
  const clock = { today: day };
  const repo = new MemoryRepository({ actorId: 'pessoa-teste', displayName: 'Pessoa de teste', today: () => clock.today });
  const space = await repo.ensurePersonalSpace('Conta principal');
  return { repo, ctx: space.personalContextId, accountId: space.accounts[0]!.id, clock };
}

async function demo() {
  const repo = await createDemoRepository();
  const ctx = (await repo.getSpace())!.personalContextId;
  const goals = await repo.listGoals(ctx);
  const movements = await repo.listGoalMovementsInMonth(ctx, '2026-10');
  const reserve = goals.find((g) => g.goalType === 'emergencia')!;
  return { repo, ctx, goals, movements, reserve };
}

function check(answer: SavingsAnswer, answeredOn: string, askAgainOn: string | null, monthlyCents: number | null = null): SavingsCheck {
  return { contextId: 'ctx', answer, monthlyCents, answeredOn, askAgainOn, version: 1, createdAt: '2026-10-07T12:00:00.000Z', updatedAt: '2026-10-07T12:00:00.000Z' };
}

type PlanGoal = SavingsPlanInput['goals'][number];
let seq = 0;
/** Meta sintética para o plano (ids e datas de criação crescentes). */
function goal(over: Partial<PlanGoal> & { name: string }): PlanGoal {
  seq += 1;
  const n = String(seq).padStart(3, '0');
  return {
    id: `meta-${n}`,
    goalType: 'objetivo',
    status: 'ativa',
    targetCents: 300_000,
    targetMonth: null,
    savedCents: 0,
    createdAt: `2026-10-0${(seq % 9) + 1}T10:00:00.000Z`,
    updatedAt: `2026-10-0${(seq % 9) + 1}T10:00:00.000Z`,
    ...over,
  };
}

function plan(over: Partial<SavingsPlanInput> = {}) {
  return savingsPlan({ monthlyCents: 30_000, essentialCents: 375_000, goals: [], movements: [], today: '2026-11-03', ...over });
}

describe('resposta: datas de volta e validação', () => {
  it('constantes e datas de volta (depois +7, agora não +30, consigo nenhuma)', () => {
    expect(SAVINGS_ANSWERS).toEqual(['consigo', 'agora_nao', 'depois']);
    expect(SAVINGS_LATER_DAYS).toBe(7);
    expect(SAVINGS_NOT_NOW_DAYS).toBe(30);
    expect(savingsAskAgainOn('depois', '2026-10-07')).toBe('2026-10-14');
    expect(savingsAskAgainOn('agora_nao', '2026-10-07')).toBe('2026-11-06');
    expect(savingsAskAgainOn('consigo', '2026-10-07')).toBeNull();
    // Virada de mês e de ano, e ano bissexto.
    expect(savingsAskAgainOn('depois', '2026-12-28')).toBe('2027-01-04');
    expect(savingsAskAgainOn('agora_nao', '2026-12-10')).toBe('2027-01-09');
    expect(savingsAskAgainOn('agora_nao', '2028-02-20')).toBe('2028-03-21');
    expect(savingsAskAgainOn('depois', '2028-02-25')).toBe('2028-03-03');
  });

  it('savingsAnswerError: resposta, valor só com consigo, limites e ordem', () => {
    // De R$ 1,00 (100 centavos, como o banco) a R$ 9.999.999,99.
    expect(SAVINGS_MIN_MONTHLY_CENTS).toBe(100);
    expect(savingsAnswerError('consigo', 100)).toBeNull();
    expect(savingsAnswerError('consigo', MAX_RECORD_CENTS)).toBeNull();
    expect(savingsAnswerError('consigo', MAX_RECORD_CENTS + 1)).toBe('valor_acima_do_limite');
    for (const bad of [null, undefined, 0, 1, 99, -1, 1.5, Number.NaN]) expect(savingsAnswerError('consigo', bad), String(bad)).toBe('valor_invalido');
    for (const answer of ['agora_nao', 'depois'] as const) {
      expect(savingsAnswerError(answer, null)).toBeNull();
      expect(savingsAnswerError(answer, undefined)).toBeNull();
      expect(savingsAnswerError(answer, 30_000)).toBe('valor_invalido');
      expect(savingsAnswerError(answer, 0)).toBe('valor_invalido');
    }
    for (const bad of ['', 'sim', 'CONSIGO', null, undefined, 3]) expect(savingsAnswerError(bad, 30_000), String(bad)).toBe('resposta_invalida');
    // A resposta vem antes do valor.
    expect(savingsAnswerError('talvez', 0)).toBe('resposta_invalida');
  });

  it('validateSavingsDraft: R$ 1,00 a R$ 9.999.999,99', () => {
    for (const [text, cents] of [
      ['300', 30_000],
      ['300,00', 30_000],
      ['R$ 1,00', 100],
      ['1', 100],
      ['9.999.999,99', MAX_RECORD_CENTS],
    ] as const) {
      expect(validateSavingsDraft(text), text).toEqual({ ok: true, monthlyCents: cents });
    }
    for (const text of ['', '0', '0,00', '0,01', '0,99', 'abc', '-5', '1,234']) {
      expect(validateSavingsDraft(text), text).toEqual({ ok: false, code: 'valor_invalido', error: SAVINGS_ERROR_TEXT.valor_invalido });
    }
    expect(validateSavingsDraft('10.000.000,00')).toEqual({ ok: false, code: 'valor_acima_do_limite', error: SAVINGS_ERROR_TEXT.valor_acima_do_limite });
    expect(validateSavingsDraft('99999999999999999999')).toMatchObject({ ok: false, code: 'valor_acima_do_limite' });
  });

  it('savingsErrorText: códigos conhecidos e falha genérica', () => {
    expect(savingsErrorText('valor_invalido')).toBe(SAVINGS_ERROR_TEXT.valor_invalido);
    expect(savingsErrorText('versao_desatualizada')).toBe(SAVINGS_ERROR_TEXT.versao_desatualizada);
    expect(savingsErrorText('resposta_invalida')).toBe(SAVINGS_ERROR_TEXT.salvar_falhou);
    expect(savingsErrorText('qualquer_outro')).toBe(SAVINGS_ERROR_TEXT.salvar_falhou);
  });
});

describe('quando perguntar de novo (shouldAskSavings)', () => {
  it('sem resposta: pergunta', () => {
    expect(shouldAskSavings(null, TODAY)).toBe(true);
    expect(savingsAskReason(null, TODAY)).toBe('primeira');
    expect(savingsAskReason(null, TODAY, '2026-10-06')).toBe('primeira');
  });

  it('"Responder depois": some e volta em 7 dias, mesmo se a renda mudar antes', () => {
    const c = check('depois', '2026-10-07', '2026-10-14');
    expect(shouldAskSavings(c, '2026-10-07')).toBe(false);
    expect(shouldAskSavings(c, '2026-10-13')).toBe(false);
    expect(shouldAskSavings(c, '2026-10-13', '2026-10-12')).toBe(false);
    expect(shouldAskSavings(c, '2026-10-14')).toBe(true);
    expect(savingsAskReason(c, '2026-10-14')).toBe('depois');
    expect(shouldAskSavings(c, '2026-12-01')).toBe(true);
  });

  it('"Agora não": volta em 30 dias, com o texto de situação que mudou', () => {
    const c = check('agora_nao', '2026-10-07', '2026-11-06');
    expect(shouldAskSavings(c, '2026-10-08')).toBe(false);
    expect(shouldAskSavings(c, '2026-11-05')).toBe(false);
    expect(shouldAskSavings(c, '2026-11-05', '2026-10-20')).toBe(false);
    expect(shouldAskSavings(c, '2026-11-06')).toBe(true);
    expect(savingsAskReason(c, '2026-11-06')).toBe('agora_nao');
    expect(savingsCardState(c, '2026-11-06')).toMatchObject({ kind: 'pergunta', reason: 'agora_nao', title: SAVINGS_TEXT.askAgainTitle });
    expect(savingsCardState(c, '2026-11-05')).toEqual({ kind: 'oculto' });
  });

  it('"Sim, consigo": só volta quando a renda de referência mudou depois da resposta', () => {
    const c = check('consigo', '2026-10-07', null, 50_000);
    expect(shouldAskSavings(c, '2026-10-07')).toBe(false);
    expect(shouldAskSavings(c, '2030-01-01')).toBe(false);
    expect(shouldAskSavings(c, '2026-10-08', null)).toBe(false);
    expect(shouldAskSavings(c, '2026-10-08', '2026-10-06')).toBe(false);
    expect(shouldAskSavings(c, '2026-10-08', '2026-10-07')).toBe(false); // mesmo dia da resposta
    expect(shouldAskSavings(c, '2026-10-08', '2026-10-08')).toBe(true);
    expect(savingsAskReason(c, '2026-10-20', '2026-10-08')).toBe('renda_mudou');
    expect(savingsCardState(c, '2026-10-20', '2026-10-08')).toEqual({
      kind: 'pergunta',
      reason: 'renda_mudou',
      title: SAVINGS_TEXT.incomeChangedTitle,
      monthlyCents: 50_000,
    });
    // Respondendo de novo (manter ou mudar o valor), a pergunta some.
    const again = check('consigo', '2026-10-20', null, 50_000);
    expect(shouldAskSavings(again, '2026-10-21', '2026-10-08')).toBe(false);
  });

  it('estado do card: pergunta, plano e oculto', () => {
    expect(savingsCardState(null, TODAY)).toEqual({ kind: 'pergunta', reason: 'primeira', title: SAVINGS_TEXT.askTitle, monthlyCents: null });
    expect(savingsCardState(check('depois', '2026-10-07', '2026-10-14'), '2026-10-14')).toMatchObject({ reason: 'depois', title: SAVINGS_TEXT.askTitle });
    expect(savingsCardState(check('depois', '2026-10-07', '2026-10-14'), '2026-10-10')).toEqual({ kind: 'oculto' });
    expect(savingsCardState(check('consigo', '2026-10-07', null, 50_000), TODAY)).toEqual({ kind: 'plano', monthlyCents: 50_000 });
  });

  it('4º passo de "Primeiros passos": consigo ou agora não, nunca depois nem sem resposta', () => {
    expect(isSavingsStepDone(null)).toBe(false);
    expect(isSavingsStepDone(check('depois', '2026-10-07', '2026-10-14'))).toBe(false);
    expect(isSavingsStepDone(check('agora_nao', '2026-10-07', '2026-11-06'))).toBe(true);
    expect(isSavingsStepDone(check('consigo', '2026-10-07', null, 100))).toBe(true);
  });

  it('lastIncomeReferenceChange: só alteração ou novo valor, nunca a primeira referência', () => {
    const ref = (over: Partial<IncomeReference>): IncomeReference => ({
      id: 'r',
      contextId: 'ctx',
      fromMonth: '2026-09',
      amountCents: 600_000,
      varies: false,
      createdBy: 'p',
      version: 1,
      createdAt: '2026-09-02T12:00:00.000Z',
      updatedAt: '2026-09-02T12:00:00.000Z',
      ...over,
    });
    expect(lastIncomeReferenceChange([])).toBeNull();
    expect(lastIncomeReferenceChange([ref({})])).toBeNull();
    // Alterada (versão 2): o dia da alteração.
    expect(lastIncomeReferenceChange([ref({ version: 2, updatedAt: '2026-10-05T12:00:00.000Z' })])).toBe('2026-10-05');
    // Nova referência de mês posterior com outro valor: o dia em que foi criada; com o mesmo valor, nada.
    const second = ref({ id: 'r2', fromMonth: '2026-11', amountCents: 700_000, createdAt: '2026-10-08T01:00:00.000Z', updatedAt: '2026-10-08T01:00:00.000Z' });
    expect(lastIncomeReferenceChange([second, ref({})])).toBe('2026-10-08');
    expect(lastIncomeReferenceChange([ref({}), { ...second, amountCents: 600_000 }])).toBeNull();
    // No fuso da pessoa, 01:00 UTC ainda é o dia anterior.
    expect(lastIncomeReferenceChange([ref({}), second], 'America/Sao_Paulo')).toBe('2026-10-07');
    expect(lastIncomeReferenceChange([ref({}), second], 'Fuso/Inexistente')).toBe('2026-10-08');
    // A mais recente entre várias.
    expect(
      lastIncomeReferenceChange([ref({ version: 3, updatedAt: '2026-10-20T12:00:00.000Z' }), { ...second, createdAt: '2026-10-08T12:00:00.000Z' }]),
    ).toBe('2026-10-20');
  });
});

describe('plano em etapas (savingsPlan)', () => {
  it('demonstração: gastos essenciais R$ 3.750,00, R$ 3.500,00 guardados, R$ 500,00 por mês', async () => {
    const { goals, movements, reserve } = await demo();
    expect(reserve.savedCents).toBe(350_000);
    const p = savingsPlan({ monthlyCents: 50_000, essentialCents: reserve.essentialBaseCents, goals, movements, today: TODAY });
    expect(p.firstProjectedMonth).toBe('2026-11'); // houve aporte em outubro
    expect(p.hasReserve).toBe(true);
    expect(p.reserveSavedCents).toBe(350_000);
    expect(p.chosenStageId).toBe('reserva-1');
    expect(p.stages.map((s) => s.id)).toEqual(['reserva-1', 'reserva-3', 'reserva-6', `meta-${goals.find((g) => g.name === 'Viagem de férias')!.id}`]);

    const [e1, e3, e6, viagem] = p.stages as [typeof p.stages[number], typeof p.stages[number], typeof p.stages[number], typeof p.stages[number]];
    expect(e1).toMatchObject({ kind: 'reserva', months: 1, targetCents: 375_000, savedCents: 350_000, missingCents: 25_000, reached: false, reachMonth: '2026-11', beyond: false });
    expect(e3).toMatchObject({ months: 3, targetCents: 1_125_000, missingCents: 775_000, reachMonth: '2028-02' });
    expect(e6).toMatchObject({ months: 6, targetCents: 2_250_000, missingCents: 1_900_000, reachMonth: '2029-12' });
    expect(e1.label).toBe('1 mês dos seus gastos essenciais');
    expect(e3.label).toBe('3 meses dos seus gastos essenciais');
    expect(e6.label).toBe('6 meses dos seus gastos essenciais');
    // A última etapa bate com o plano da própria reserva (R$ 22.500,00, R$ 500,00 por mês): dezembro de 2029.
    expect(goalPlan(reserve, movements, TODAY).reachMonth).toBe('2029-12');
    // Metas começam no mês seguinte à etapa escolhida (novembro de 2026): R$ 4.800,00 em 10 meses.
    expect(viagem).toMatchObject({ kind: 'meta', months: null, label: 'Viagem de férias', targetCents: 600_000, savedCents: 120_000, missingCents: 480_000, targetMonth: '2027-07', reachMonth: '2027-09' });
  });

  it('etapa escolhida muda onde as metas começam', async () => {
    const { goals, movements, reserve } = await demo();
    const base = { monthlyCents: 50_000, essentialCents: reserve.essentialBaseCents, goals, movements, today: TODAY };
    const viagem = (p: ReturnType<typeof savingsPlan>) => p.stages.find((s) => s.kind === 'meta')!;
    const p3 = savingsPlan({ ...base, chosenStageId: 'reserva-3' });
    expect(p3.chosenStageId).toBe('reserva-3');
    expect(viagem(p3).reachMonth).toBe('2028-12'); // começa em março de 2028
    const p6 = savingsPlan({ ...base, chosenStageId: 'reserva-6' });
    expect(viagem(p6).reachMonth).toBe('2030-10'); // começa em janeiro de 2030
    // Escolha desconhecida ou de meta: volta à primeira não alcançada.
    expect(savingsPlan({ ...base, chosenStageId: 'reserva-12' }).chosenStageId).toBe('reserva-1');
    expect(savingsPlan({ ...base, chosenStageId: viagem(p3).id }).chosenStageId).toBe('reserva-1');
    expect(savingsPlan({ ...base, chosenStageId: null }).chosenStageId).toBe('reserva-1');
  });

  it('P0: sem aporte da reserva em outubro, o plano conta desde outubro', async () => {
    const { goals, reserve } = await demo();
    const base = { monthlyCents: 50_000, essentialCents: reserve.essentialBaseCents, goals, today: TODAY };
    const none = savingsPlan({ ...base, movements: [] });
    expect(none.firstProjectedMonth).toBe('2026-10');
    expect(none.stages[0]).toMatchObject({ reachMonth: '2026-10' });
    expect(none.stages[2]).toMatchObject({ reachMonth: '2029-11' });
    const dep = (goalId: string, kind: GoalMovement['kind']) => ({ goalId, kind, occurredOn: '2026-10-06' });
    // Aporte de outra meta, ou resgate da reserva, não mudam P0; aporte da reserva sim.
    const viagem = goals.find((g) => g.name === 'Viagem de férias')!;
    expect(savingsPlan({ ...base, movements: [dep(viagem.id, 'aporte')] }).firstProjectedMonth).toBe('2026-10');
    expect(savingsPlan({ ...base, movements: [dep(reserve.id, 'resgate')] }).firstProjectedMonth).toBe('2026-10');
    expect(savingsPlan({ ...base, movements: [dep(reserve.id, 'aporte')] }).firstProjectedMonth).toBe('2026-11');
  });

  it('exemplo do texto: R$ 300,00 por mês, reserva vazia, primeira etapa chega em novembro de 2027', () => {
    const p = plan();
    expect(p.firstProjectedMonth).toBe('2026-11');
    expect(p.hasReserve).toBe(false);
    expect(p.stages.map((s) => [s.id, s.targetCents, s.missingCents, s.reachMonth])).toEqual([
      ['reserva-1', 375_000, 375_000, '2027-11'],
      ['reserva-3', 1_125_000, 1_125_000, '2029-12'],
      ['reserva-6', 2_250_000, 2_250_000, '2033-01'],
    ]);
    const texts = savingsPlanTexts(p);
    expect(texts.headline).toBe(
      'Com R$ 300,00 por mês, a primeira etapa (R$ 3.750,00, 1 mês dos seus gastos essenciais) chega em novembro de 2027.',
    );
    expect(texts.monthly).toBe('Você planeja guardar R$ 300,00 por mês.');
    expect(texts.stages.map((s) => s.sentence)).toEqual([
      'Com R$ 300,00 por mês, a primeira etapa (R$ 3.750,00, 1 mês dos seus gastos essenciais) chega em novembro de 2027.',
      'Com R$ 300,00 por mês, a segunda etapa (R$ 11.250,00, 3 meses dos seus gastos essenciais) chega em dezembro de 2029.',
      'Com R$ 300,00 por mês, a terceira etapa (R$ 22.500,00, 6 meses dos seus gastos essenciais) chega em janeiro de 2033.',
    ]);
    expect(texts.stages[0]).toMatchObject({ title: '1 mês dos seus gastos essenciais', amount: 'R$ 3.750,00', missing: 'Faltam R$ 3.750,00', month: 'Chega em novembro de 2027' });
    expect(texts.afterStage).toBeNull(); // sem metas
    expect(texts.needsEssentials).toBeNull();
    expect(texts.noInterest).toBe('Sem contar rendimentos.');
  });

  it('textos do plano da demonstração (com metas: "Depois, o mesmo valor pode ir para as suas metas.")', async () => {
    const { goals, movements, reserve } = await demo();
    const p = savingsPlan({ monthlyCents: 50_000, essentialCents: reserve.essentialBaseCents, goals, movements, today: TODAY });
    const t = savingsPlanTexts(p);
    expect(t.headline).toBe('Com R$ 500,00 por mês, a primeira etapa (R$ 3.750,00, 1 mês dos seus gastos essenciais) chega em novembro de 2026.');
    expect(t.stages[0]!.missing).toBe('Faltam R$ 250,00');
    expect(t.stages[3]).toMatchObject({
      title: 'Viagem de férias',
      amount: 'R$ 6.000,00',
      missing: 'Faltam R$ 4.800,00',
      month: 'Chega em setembro de 2027',
      sentence: 'Com R$ 500,00 por mês, a meta Viagem de férias (R$ 6.000,00) chega em setembro de 2027.',
    });
    expect(t.afterStage).toBe('Depois, o mesmo valor pode ir para as suas metas.');
  });

  it('metas ativas por prazo (sem prazo no fim), em fila depois da etapa escolhida', () => {
    const goals = [
      goal({ name: 'A', targetMonth: '2028-01', targetCents: 100_000 }),
      goal({ name: 'B sem prazo', targetCents: 50_000 }),
      goal({ name: 'C', targetMonth: '2027-03', targetCents: 150_000, goalType: 'oportunidade' }),
      goal({ name: 'D', targetMonth: '2027-03', targetCents: 300_000 }),
    ];
    // Mesmo prazo de C e D: a criação decide (D foi criada depois de C; ajusta para D antes).
    goals[3]!.createdAt = '2026-09-01T10:00:00.000Z';
    goals[2]!.createdAt = '2026-09-02T10:00:00.000Z';
    // Sem gastos essenciais: só as metas, a partir de P0 (novembro de 2026), R$ 1.000,00 por mês.
    const p = plan({ monthlyCents: 100_000, essentialCents: null, goals });
    expect(p.stages.map((s) => s.label)).toEqual(['D', 'C', 'A', 'B sem prazo']);
    expect(p.chosenStageId).toBeNull();
    expect(p.stages.map((s) => s.reachMonth)).toEqual(['2027-01', '2027-03', '2027-04', '2027-05']);
    // D: 3 meses a partir de novembro (até janeiro); C: 2 meses a partir de fevereiro; A: 1 em abril; B: 1 em maio.
    expect(p.stages.every((s) => s.kind === 'meta' && s.months === null)).toBe(true);
    const t = savingsPlanTexts(p);
    expect(t.needsEssentials).toBe(SAVINGS_TEXT.needsEssentials);
    expect(t.afterStage).toBeNull(); // sem reserva escolhida
    expect(t.headline).toBe('Com R$ 1.000,00 por mês, a meta D (R$ 3.000,00) chega em janeiro de 2027.');
  });

  it('só entram metas ativas; a reserva arquivada não conta e a concluída ainda guarda', () => {
    const closed = goal({ name: 'Concluída', status: 'concluida' });
    const archived = goal({ name: 'Arquivada', status: 'arquivada' });
    const live = goal({ name: 'Viva', targetCents: 100_000 });
    const archivedReserve = goal({ name: 'Reserva antiga', goalType: 'emergencia', status: 'arquivada', targetCents: 375_000, savedCents: 375_000 });
    const p = plan({ goals: [closed, archived, live, archivedReserve] });
    expect(p.hasReserve).toBe(false);
    expect(p.reserveSavedCents).toBe(0);
    expect(p.stages.filter((s) => s.kind === 'meta').map((s) => s.label)).toEqual(['Viva']);
    const done = goal({ name: 'Reserva', goalType: 'emergencia', status: 'concluida', targetCents: 2_250_000, savedCents: 400_000 });
    const q = plan({ goals: [done] });
    expect(q.hasReserve).toBe(true);
    expect(q.stages[0]).toMatchObject({ goalId: done.id, savedCents: 400_000, missingCents: 0, reached: true, reachMonth: null });
    expect(q.stages[1]).toMatchObject({ missingCents: 725_000, reached: false });
  });

  it('etapas e metas alcançadas ficam na lista, sem mês, e a fila continua', () => {
    const reserve = goal({ name: 'Reserva', goalType: 'emergencia', targetCents: 2_250_000, savedCents: 2_250_000 });
    const done = goal({ name: 'Pronta', targetCents: 100_000, savedCents: 100_000, targetMonth: '2027-01' });
    const next = goal({ name: 'Próxima', targetCents: 300_000, targetMonth: '2027-02' });
    const p = plan({ monthlyCents: 100_000, goals: [reserve, done, next] });
    expect(p.stages.slice(0, 3).every((s) => s.reached && s.reachMonth === null && s.missingCents === 0)).toBe(true);
    expect(p.chosenStageId).toBeNull(); // todas alcançadas
    expect(p.stages[3]).toMatchObject({ label: 'Pronta', reached: true, reachMonth: null });
    // As metas começam em P0 (novembro de 2026): R$ 3.000,00 em 3 meses.
    expect(p.stages[4]).toMatchObject({ label: 'Próxima', reachMonth: '2027-01' });
    const t = savingsPlanTexts(p);
    expect(t.stages[0]!.sentence).toBe('A primeira etapa (R$ 3.750,00, 1 mês dos seus gastos essenciais) já está alcançada com o que a reserva guarda.');
    expect(t.stages[0]).toMatchObject({ missing: 'Alcançada', month: null });
    expect(t.stages[3]!.sentence).toBe('A meta Pronta (R$ 1.000,00) já está alcançada.');
    expect(t.headline).toBe('Com R$ 1.000,00 por mês, a meta Próxima (R$ 3.000,00) chega em janeiro de 2027.');
    // Etapa escolhida alcançada: as metas começam em P0.
    const some = goal({ name: 'Reserva parcial', goalType: 'emergencia', targetCents: 2_250_000, savedCents: 400_000 });
    expect(plan({ monthlyCents: 100_000, goals: [some, next], chosenStageId: 'reserva-1' }).stages[3]).toMatchObject({ reachMonth: '2027-01' });
  });

  it('sem gastos essenciais calculáveis: só as metas; valores fora do limite não geram etapa', () => {
    for (const essentialCents of [null, 0, -5, 1.5, MAX_RECORD_CENTS + 1]) {
      const p = plan({ essentialCents });
      expect(p.essentialCents, String(essentialCents)).toBeNull();
      expect(p.stages).toEqual([]);
      expect(p.chosenStageId).toBeNull();
      expect(savingsPlanTexts(p).needsEssentials).toBe(SAVINGS_TEXT.needsEssentials);
      expect(savingsPlanTexts(p).headline).toBeNull();
    }
    // 3 meses cabem, 6 meses passam de R$ 9.999.999,99: a etapa de 6 meses não aparece.
    const big = plan({ essentialCents: 300_000_000 });
    expect(big.stages.map((s) => s.id)).toEqual(['reserva-1', 'reserva-3']);
    // O limite exato entra.
    expect(plan({ essentialCents: 166_666_666 }).stages.map((s) => s.id)).toEqual(['reserva-1', 'reserva-3', 'reserva-6']);
    expect(plan({ essentialCents: 166_666_667 }).stages.map((s) => s.id)).toEqual(['reserva-1', 'reserva-3']);
  });

  it('passa de 50 anos: sem mês previsto, e as metas seguintes também', () => {
    const viagem = goal({ name: 'Viagem', targetCents: 100_000 });
    const p = plan({ monthlyCents: 100, goals: [viagem] });
    expect(p.stages[0]).toMatchObject({ reachMonth: null, beyond: true });
    expect(p.stages[3]).toMatchObject({ kind: 'meta', reachMonth: null, beyond: true });
    const t = savingsPlanTexts(p);
    expect(t.stages[0]).toMatchObject({ month: 'Passa de 50 anos', missing: 'Faltam R$ 3.750,00' });
    expect(t.stages[0]!.sentence).toBe('Com R$ 1,00 por mês, a primeira etapa (R$ 3.750,00, 1 mês dos seus gastos essenciais) passa de 50 anos.');
    // Limite: 600 meses ainda têm mês; 601 não.
    const at600 = plan({ monthlyCents: 10_000, essentialCents: 6_000_000 });
    expect(at600.stages[0]).toMatchObject({ beyond: false, reachMonth: '2076-10' });
    const at601 = plan({ monthlyCents: 10_000, essentialCents: 6_000_001 });
    expect(at601.stages[0]).toMatchObject({ beyond: true, reachMonth: null });
  });

  it('valor por mês fora da faixa: sem previsão, sem erro', () => {
    for (const monthlyCents of [0, -1, Number.NaN]) {
      const p = plan({ monthlyCents });
      expect(p.stages.every((s) => s.reachMonth === null && !s.beyond), String(monthlyCents)).toBe(true);
    }
    const t = savingsPlanTexts(plan({ monthlyCents: 0 }));
    expect(t.stages[0]!.sentence).toBe('A primeira etapa (R$ 3.750,00, 1 mês dos seus gastos essenciais): faltam R$ 3.750,00.');
    expect(t.stages[0]!.month).toBeNull();
  });

  it('savingsStageTexts usa o valor por mês dado', () => {
    const s = plan({ monthlyCents: 300_000 }).stages[0]!;
    expect(savingsStageTexts(s, 300_000).sentence).toBe(
      'Com R$ 3.000,00 por mês, a primeira etapa (R$ 3.750,00, 1 mês dos seus gastos essenciais) chega em dezembro de 2026.',
    );
    expect(SAVINGS_STAGE_MONTHS).toEqual([1, 3, 6]);
  });
});

describe('"Usar este plano": a reserva com o alvo da etapa e o valor por mês', () => {
  it('sem reserva: createGoal com a etapa escolhida e o plano por mês', async () => {
    const { repo, ctx } = await freshRepo();
    const p = savingsPlan({ monthlyCents: 30_000, essentialCents: 375_000, goals: await repo.listGoals(ctx), movements: [], today: TODAY });
    const input = savingsReserveInput(p, 'media_gastos')!;
    expect(input).toMatchObject({
      goalType: 'emergencia',
      name: RESERVE_NAME,
      targetCents: 375_000,
      targetMonth: null,
      plannedMonthlyCents: 30_000,
      essentialBaseCents: 375_000,
      essentialMonths: 1,
      essentialBaseSource: 'media_gastos',
      initialCents: null,
      initialOn: null,
    });
    expect(goalInputError(input, TODAY)).toBeNull();
    const { goal: created } = await repo.createGoal(key(), ctx, input);
    expect(created).toMatchObject({ goalType: 'emergencia', targetCents: 375_000, plannedMonthlyCents: 30_000, essentialMonths: 1 });
    // Outra etapa pedida.
    const six = savingsReserveInput(p, 'informado', { stageId: 'reserva-6' })!;
    expect(six).toMatchObject({ essentialMonths: 6, targetCents: 2_250_000, essentialBaseSource: 'informado' });
    expect(goalInputError(six, TODAY)).toBeNull();
  });

  it('com reserva: updateGoal mantém nome e prazo e troca alvo e plano', async () => {
    const { repo, ctx, goals, movements, reserve } = await demo();
    const p = savingsPlan({ monthlyCents: 70_000, essentialCents: reserve.essentialBaseCents, goals, movements, today: TODAY, chosenStageId: 'reserva-3' });
    const input = savingsReserveInput(p, reserve.essentialBaseSource!, { existing: reserve })!;
    expect(input).toMatchObject({ name: reserve.name, targetMonth: reserve.targetMonth, essentialMonths: 3, plannedMonthlyCents: 70_000, targetCents: 1_125_000 });
    const { goal: updated } = await repo.updateGoal(key(), reserve.id, reserve.version, input);
    expect(updated).toMatchObject({ targetCents: 1_125_000, plannedMonthlyCents: 70_000, essentialMonths: 3, version: reserve.version + 1, savedCents: 350_000 });
    expect((await repo.listGoals(ctx)).filter((g) => g.goalType === 'emergencia')).toHaveLength(1);
    // O plano da própria reserva bate com o das etapas: R$ 7.750,00 faltam, R$ 700,00 por mês, 12 meses desde novembro.
    const after = (await repo.listGoals(ctx)).find((g) => g.id === reserve.id)!;
    expect(goalPlan(after, movements, TODAY).reachMonth).toBe(p.stages[1]!.reachMonth);
  });

  it('sem etapa de reserva: nada a criar', async () => {
    const noEssential = plan({ essentialCents: null });
    expect(savingsReserveInput(noEssential, 'informado')).toBeNull();
    const viagem = goal({ name: 'Viagem' });
    const p = plan({ goals: [viagem] });
    expect(savingsReserveInput(p, 'informado', { stageId: `meta-${viagem.id}` })).toBeNull();
    expect(savingsReserveInput(p, 'informado', { stageId: 'reserva-12' })).toBeNull();
  });
});

describe('reserva mínima e passos pequenos ("Agora não")', () => {
  it('opções: R$ 100,00, R$ 300,00, R$ 500,00, R$ 1.000,00, 1 mês dos gastos essenciais e Outro valor', () => {
    expect(MINIMUM_RESERVE_MIN_CENTS).toBe(10_000);
    expect(MINIMUM_RESERVE_CHIPS).toEqual([10_000, 30_000, 50_000, 100_000]);
    const opts = minimumReserveOptions(375_000);
    expect(opts.map((o) => [o.id, o.kind, o.label, o.cents])).toEqual([
      ['valor-10000', 'valor', 'R$ 100,00', 10_000],
      ['valor-30000', 'valor', 'R$ 300,00', 30_000],
      ['valor-50000', 'valor', 'R$ 500,00', 50_000],
      ['valor-100000', 'valor', 'R$ 1.000,00', 100_000],
      ['essenciais', 'essenciais', '1 mês dos seus gastos essenciais', 375_000],
      ['outro', 'outro', 'Outro valor', null],
    ]);
  });

  it('1 mês dos gastos essenciais só quando calculável e a partir de R$ 100,00', () => {
    const ids = (e: number | null) => minimumReserveOptions(e).map((o) => o.id);
    expect(ids(null)).toEqual(['valor-10000', 'valor-30000', 'valor-50000', 'valor-100000', 'outro']);
    expect(ids(0)).toEqual(ids(null));
    expect(ids(9_999)).toEqual(ids(null));
    expect(ids(10_000)).toContain('essenciais');
    expect(ids(MAX_RECORD_CENTS)).toContain('essenciais');
    expect(ids(MAX_RECORD_CENTS + 1)).toEqual(ids(null));
    // Ninguém vem marcado: as opções são só dados, sem seleção.
    for (const o of minimumReserveOptions(375_000)) expect(Object.keys(o).sort()).toEqual(['cents', 'id', 'kind', 'label']);
  });

  it('"Outro valor": mínimo R$ 100,00 e limite de R$ 9.999.999,99', () => {
    expect(validateMinimumReserveDraft('100,00')).toEqual({ ok: true, targetCents: 10_000 });
    expect(validateMinimumReserveDraft('R$ 250')).toEqual({ ok: true, targetCents: 25_000 });
    expect(validateMinimumReserveDraft('9.999.999,99')).toEqual({ ok: true, targetCents: MAX_RECORD_CENTS });
    for (const text of ['99,99', '0', '', 'abc', '50']) {
      expect(validateMinimumReserveDraft(text), text).toEqual({ ok: false, code: 'valor_invalido', error: SAVINGS_ERROR_TEXT.minimum_invalido });
    }
    expect(validateMinimumReserveDraft('10.000.000,00')).toEqual({ ok: false, code: 'valor_acima_do_limite', error: SAVINGS_ERROR_TEXT.valor_acima_do_limite });
  });

  it('"Criar reserva mínima": base = alvo, 1 mês, origem informada; o banco do core aceita', async () => {
    const input = minimumReserveInput(30_000);
    expect(input).toMatchObject({
      goalType: 'emergencia',
      name: RESERVE_NAME,
      targetCents: 30_000,
      targetMonth: null,
      plannedMonthlyCents: null,
      essentialBaseCents: 30_000,
      essentialMonths: 1,
      essentialBaseSource: 'informado',
      initialCents: null,
      initialOn: null,
    });
    for (const target of [10_000, 30_000, 50_000, 100_000, 375_000, MAX_RECORD_CENTS]) {
      expect(goalInputError(minimumReserveInput(target, 4_333), TODAY), String(target)).toBeNull();
    }
    const { repo, ctx } = await freshRepo();
    const { goal: g } = await repo.createGoal(key(), ctx, minimumReserveInput(30_000, 4_333));
    expect(g).toMatchObject({ targetCents: 30_000, plannedMonthlyCents: 4_333, essentialMonths: 1, essentialBaseCents: 30_000, savedCents: 0 });
    // Na opção "1 mês dos seus gastos essenciais", a origem é a dos gastos essenciais.
    expect(minimumReserveInput(375_000, null, 'media_gastos').essentialBaseSource).toBe('media_gastos');
    // Reserva existente: mantém nome e prazo.
    expect(minimumReserveInput(50_000, null, 'informado', { name: 'Minha reserva', targetMonth: '2027-12' })).toMatchObject({ name: 'Minha reserva', targetMonth: '2027-12' });
  });

  it('passo semanal: R$ 10,00 por semana são R$ 43,33 por mês (regra de "Quanto custa por ano?")', () => {
    expect(weeklySavingsToMonthly(1_000)).toBe(4_333);
    const out = calcCustoPorAno({ valor: '10,00', frequencia: 'semana' });
    expect(out.ok && out.result.monthlyCents).toBe(4_333);
    for (const cents of [1, 500, 1_000, 2_550, 123_456]) {
      const o = calcCustoPorAno({ valor: (cents / 100).toFixed(2).replace('.', ','), frequencia: 'semana' });
      expect(o.ok && o.result.monthlyCents, String(cents)).toBe(weeklySavingsToMonthly(cents));
    }
    expect(savingsSmallSteps()).toEqual([
      { id: 'semanal', label: 'Guardar R$ 10,00 por semana', monthlyCents: 4_333, monthlyLabel: 'R$ 43,33 por mês' },
      { id: 'extra', label: 'Guardar quando entrar um valor extra', monthlyCents: null, monthlyLabel: null },
    ]);
  });
});

describe('referência do mês na pergunta', () => {
  it('"Fora dos compromissos em outubro" com a nota, nunca saldo', async () => {
    const { repo, ctx } = await demo();
    const refs = await repo.listIncomeReferences(ctx);
    const list = await repo.listCommitments(ctx, '2026-10');
    const s = summarizeCommitted(list, ctx, '2026-10', TODAY, refs);
    expect(s.outsideCents).toBe(285_000);
    expect(savingsReferenceText(s, '2026-10')).toBe('Fora dos compromissos em outubro: R$ 2.850,00. Não é saldo: ainda precisa cobrir gastos do dia a dia.');
    // Sem renda de referência (ou sem resumo): nada.
    expect(savingsReferenceText(summarizeCommitted(list, ctx, '2026-10', TODAY, []), '2026-10')).toBeNull();
    expect(savingsReferenceText(null, '2026-10')).toBeNull();
    // Contas acima da referência: só a frase do Ciclo B, sem a nota.
    const small = summarizeCommitted(list, ctx, '2026-10', TODAY, refs.map((r) => ({ ...r, amountCents: 100_000 })));
    expect(savingsReferenceText(small, '2026-10')).toBe('As contas do mês passam a renda de referência em R$ 2.150,00.');
  });
});

describe('MemoryRepository: getSavingsCheck e setSavingsAnswer', () => {
  it('conta nova: sem resposta; a demonstração responde "consigo" com R$ 500,00, igual ao plano da reserva', async () => {
    const { repo, ctx } = await freshRepo();
    expect(await repo.getSavingsCheck(ctx)).toBeNull();
    expect(await repo.listGoals(ctx)).toEqual([]);
    const d = await demo();
    const c = (await d.repo.getSavingsCheck(d.ctx))!;
    expect(c).toMatchObject({ contextId: d.ctx, answer: 'consigo', monthlyCents: 50_000, answeredOn: DEMO_TODAY, askAgainOn: null, version: 1 });
    expect(c.monthlyCents).toBe(d.reserve.plannedMonthlyCents);
    expect(savingsCardState(c, DEMO_TODAY)).toEqual({ kind: 'plano', monthlyCents: 50_000 });
    expect(isSavingsStepDone(c)).toBe(true);
    // O cenário de retorno e as outras contas não têm resposta.
    const back = await createDemoRepository({ scenario: 'retorno' });
    expect(await back.getSavingsCheck((await back.getSpace())!.personalContextId)).toBeNull();
  });

  it('grava consigo com valor, depois agora não e depois, com versão e datas', async () => {
    const { repo, ctx, clock } = await freshRepo('2026-10-07');
    const first = await repo.setSavingsAnswer(key(), ctx, 0, 'consigo', 30_000);
    expect(first).toMatchObject({ contextId: ctx, answer: 'consigo', monthlyCents: 30_000, answeredOn: '2026-10-07', askAgainOn: null, version: 1 });
    expect(await repo.getSavingsCheck(ctx)).toEqual(first);
    clock.today = '2026-10-20';
    const second = await repo.setSavingsAnswer(key(), ctx, 1, 'agora_nao');
    expect(second).toMatchObject({ answer: 'agora_nao', monthlyCents: null, answeredOn: '2026-10-20', askAgainOn: '2026-11-19', version: 2, createdAt: first.createdAt });
    clock.today = '2026-12-28';
    const third = await repo.setSavingsAnswer(key(), ctx, 2, 'depois', null);
    expect(third).toMatchObject({ answer: 'depois', monthlyCents: null, answeredOn: '2026-12-28', askAgainOn: '2027-01-04', version: 3 });
    expect(await repo.getSavingsCheck(ctx)).toEqual(third);
    // O que volta é uma cópia: mexer nela não muda o repositório.
    const copy = (await repo.getSavingsCheck(ctx))!;
    copy.answer = 'consigo';
    expect((await repo.getSavingsCheck(ctx))!.answer).toBe('depois');
  });

  it('mesma sequência de 19 respostas do teste do banco (65_guardar): substitui, apaga o valor e calcula as datas', async () => {
    const { repo, ctx, clock } = await freshRepo();
    const steps: [string, SavingsAnswer, number | null, string | null][] = [
      ['2026-10-07', 'depois', null, '2026-10-14'],
      ['2026-10-07', 'agora_nao', null, '2026-11-06'],
      ['2026-10-07', 'consigo', 100, null],
      ['2026-10-07', 'consigo', 999_999_999, null],
      ['2026-10-07', 'consigo', 30_000, null],
      ['2026-10-07', 'depois', null, '2026-10-14'],
      ['2026-10-07', 'consigo', 50_000, null],
      ['2026-10-07', 'agora_nao', null, '2026-11-06'],
      ['2026-12-28', 'depois', null, '2027-01-04'],
      ['2026-12-20', 'agora_nao', null, '2027-01-19'],
      ['2027-02-01', 'agora_nao', null, '2027-03-03'],
      ['2027-02-25', 'depois', null, '2027-03-04'],
      ['2028-02-01', 'agora_nao', null, '2028-03-02'],
      ['2028-02-25', 'depois', null, '2028-03-03'],
      ['2028-12-25', 'depois', null, '2029-01-01'],
      ['2026-10-31', 'depois', null, '2026-11-07'],
      ['2026-10-31', 'agora_nao', null, '2026-11-30'],
      ['2026-10-01', 'agora_nao', null, '2026-10-31'],
      ['2026-10-07', 'consigo', 50_000, null],
    ];
    let version = 0;
    for (const [day, answer, cents, again] of steps) {
      clock.today = day;
      const r = await repo.setSavingsAnswer(key(), ctx, version, answer, cents);
      version += 1;
      expect(r, `${day} ${answer}`).toMatchObject({ answer, monthlyCents: cents, answeredOn: day, askAgainOn: again, version });
    }
    expect(version).toBe(19);
    // Repetição em outro dia não recalcula as datas: devolve o estado atual.
    const k = key();
    clock.today = '2026-10-07';
    const first = await repo.setSavingsAnswer(k, ctx, 19, 'agora_nao');
    clock.today = '2026-10-20';
    expect(await repo.setSavingsAnswer(k, ctx, 19, 'agora_nao')).toEqual(first);
    expect(first).toMatchObject({ askAgainOn: '2026-11-06', version: 20 });
    // O conteúdo inválido de uma chave já usada é chave_reutilizada (a repetição vem antes da validação).
    await expectCode(repo.setSavingsAnswer(k, ctx, 19, 'talvez' as SavingsAnswer), 'chave_reutilizada');
  });

  it('ordem: sem_permissao, resposta_invalida, valor, versão', async () => {
    const { repo, ctx } = await freshRepo();
    await expectCode(repo.setSavingsAnswer(key(), 'ctx-de-outra-pessoa', 0, 'talvez' as SavingsAnswer, 0), 'sem_permissao');
    await expectCode(repo.setSavingsAnswer(key(), ctx, 7, 'talvez' as SavingsAnswer, 0), 'resposta_invalida');
    await expectCode(repo.setSavingsAnswer(key(), ctx, 7, 'consigo', 0), 'valor_invalido');
    await expectCode(repo.setSavingsAnswer(key(), ctx, 7, 'consigo', MAX_RECORD_CENTS + 1), 'valor_acima_do_limite');
    await expectCode(repo.setSavingsAnswer(key(), ctx, 7, 'consigo', 30_000), 'versao_desatualizada');
    expect(await repo.getSavingsCheck(ctx)).toBeNull();
  });

  it('valor: 100 a 999.999.999 só com consigo; nulo nas outras respostas', async () => {
    const { repo, ctx } = await freshRepo();
    for (const bad of [null, 0, 1, 99, -1, 1.5, Number.NaN]) await expectCode(repo.setSavingsAnswer(key(), ctx, 0, 'consigo', bad), 'valor_invalido');
    await expectCode(repo.setSavingsAnswer(key(), ctx, 0, 'agora_nao', 30_000), 'valor_invalido');
    await expectCode(repo.setSavingsAnswer(key(), ctx, 0, 'depois', 100), 'valor_invalido');
    await expectCode(repo.setSavingsAnswer(key(), ctx, 0, 'consigo', MAX_RECORD_CENTS + 1), 'valor_acima_do_limite');
    expect(await repo.getSavingsCheck(ctx)).toBeNull();
    expect((await repo.setSavingsAnswer(key(), ctx, 0, 'consigo', 100)).monthlyCents).toBe(100);
    expect((await repo.setSavingsAnswer(key(), ctx, 1, 'consigo', MAX_RECORD_CENTS)).monthlyCents).toBe(MAX_RECORD_CENTS);
  });

  it('versão: 0 só sem resposta; depois, a atual; nula, negativa ou quebrada recusadas', async () => {
    const { repo, ctx } = await freshRepo();
    await expectCode(repo.setSavingsAnswer(key(), ctx, 1, 'consigo', 30_000), 'versao_desatualizada', 'versao_atual=0');
    await repo.setSavingsAnswer(key(), ctx, 0, 'consigo', 30_000);
    await expectCode(repo.setSavingsAnswer(key(), ctx, 0, 'consigo', 40_000), 'versao_desatualizada', 'versao_atual=1');
    await expectCode(repo.setSavingsAnswer(key(), ctx, 2, 'consigo', 40_000), 'versao_desatualizada', 'versao_atual=1');
    for (const bad of [-1, 1.5, Number.NaN, null as unknown as number, undefined as unknown as number]) {
      await expectCode(repo.setSavingsAnswer(key(), ctx, bad, 'consigo', 40_000), 'versao_desatualizada', 'versao_atual=1');
    }
    expect((await repo.getSavingsCheck(ctx))!).toMatchObject({ monthlyCents: 30_000, version: 1 });
    expect((await repo.setSavingsAnswer(key(), ctx, 1, 'consigo', 40_000)).version).toBe(2);
  });

  it('idempotência: repetir a chave devolve o estado atual; outro conteúdo ou outra ação, chave_reutilizada', async () => {
    const { repo, ctx, accountId } = await freshRepo();
    const k = key();
    const a = await repo.setSavingsAnswer(k, ctx, 0, 'consigo', 30_000);
    expect(await repo.setSavingsAnswer(k, ctx, 0, 'consigo', 30_000)).toEqual(a);
    expect((await repo.getSavingsCheck(ctx))!.version).toBe(1);
    await expectCode(repo.setSavingsAnswer(k, ctx, 0, 'consigo', 31_000), 'chave_reutilizada');
    await expectCode(repo.setSavingsAnswer(k, ctx, 0, 'agora_nao'), 'chave_reutilizada');
    await expectCode(repo.setSavingsAnswer(k, ctx, 1, 'consigo', 30_000), 'chave_reutilizada');
    // Depois de outra resposta, repetir a primeira chave devolve o estado atual.
    const b = await repo.setSavingsAnswer(key(), ctx, 1, 'consigo', 40_000);
    expect(await repo.setSavingsAnswer(k, ctx, 0, 'consigo', 30_000)).toEqual(b);
    // A chave é única entre ações: registro com a mesma chave, nos dois sentidos.
    const k2 = key();
    await repo.createRecord(k2, ctx, 'despesa', { accountId, amountCents: 1_000, occurredOn: TODAY, description: 'Mercado', category: 'Mercado' });
    await expectCode(repo.setSavingsAnswer(k2, ctx, 2, 'consigo', 50_000), 'chave_reutilizada');
    await expectCode(
      repo.createRecord(k, ctx, 'despesa', { accountId, amountCents: 1_000, occurredOn: TODAY, description: 'Mercado', category: 'Mercado' }),
      'chave_reutilizada',
    );
    // Recusa não gasta a chave.
    const k3 = key();
    await expectCode(repo.setSavingsAnswer(k3, ctx, 2, 'agora_nao', 100), 'valor_invalido');
    expect((await repo.setSavingsAnswer(k3, ctx, 2, 'agora_nao')).answer).toBe('agora_nao');
    // A operação não é de registro, conta a pagar nem meta.
    expect(await repo.findOperation(k3)).toBeNull();
    expect(await repo.findCommitmentOperation(k3)).toBeNull();
    expect(await repo.findGoalOperation(k3)).toBeNull();
  });

  it('falha de rede: antes não grava; depois grava e repetir a chave devolve o gravado', async () => {
    const { repo, ctx } = await freshRepo();
    repo.failNextWrite = 'antes';
    const k = key();
    await expectCode(repo.setSavingsAnswer(k, ctx, 0, 'consigo', 30_000), 'rede');
    expect(await repo.getSavingsCheck(ctx)).toBeNull();
    repo.failNextWrite = 'depois';
    await expectCode(repo.setSavingsAnswer(k, ctx, 0, 'consigo', 30_000), 'rede');
    expect(await repo.getSavingsCheck(ctx)).toMatchObject({ version: 1, monthlyCents: 30_000 });
    const again = await repo.setSavingsAnswer(k, ctx, 0, 'consigo', 30_000);
    expect(again.version).toBe(1);
    repo.failNextRead = true;
    await expectCode(repo.getSavingsCheck(ctx), 'rede');
  });

  it('só da própria pessoa e do próprio contexto', async () => {
    const { repo, ctx } = await freshRepo();
    await repo.setSavingsAnswer(key(), ctx, 0, 'consigo', 30_000);
    expect(await repo.getSavingsCheck('ctx-de-outra-pessoa')).toBeNull();
    await expectCode(repo.setSavingsAnswer(key(), 'ctx-de-outra-pessoa', 0, 'consigo', 30_000), 'sem_permissao');
    // Repetir a chave em outro contexto: o conteúdo muda, a chave é recusada.
    const k = key();
    await repo.setSavingsAnswer(k, ctx, 1, 'consigo', 40_000);
    await expectCode(repo.setSavingsAnswer(k, 'ctx-de-outra-pessoa', 1, 'consigo', 40_000), 'chave_reutilizada');
  });

  it('não conta como anotação: a atividade (A4) não muda, nem na primeira escrita', async () => {
    const { repo, ctx, accountId, clock } = await freshRepo('2026-05-20');
    await repo.setSavingsAnswer(key(), ctx, 0, 'depois');
    expect((await repo.getReturnReviewState(ctx)).activity).toBeNull();
    const record = { accountId, amountCents: 1_000, occurredOn: '2026-05-20', description: 'Mercado', category: 'Mercado' };
    await repo.createRecord(key(), ctx, 'despesa', record);
    expect((await repo.getReturnReviewState(ctx)).activity).toEqual({ lastWriteOn: '2026-05-20', absenceFromOn: null, absenceUntilOn: null });
    // Meses depois, responder não fecha a ausência: só uma anotação fecha.
    clock.today = '2026-10-07';
    await repo.setSavingsAnswer(key(), ctx, 1, 'agora_nao');
    expect((await repo.getReturnReviewState(ctx)).activity).toEqual({ lastWriteOn: '2026-05-20', absenceFromOn: null, absenceUntilOn: null });
    await repo.createRecord(key(), ctx, 'despesa', { ...record, occurredOn: '2026-10-07' });
    expect((await repo.getReturnReviewState(ctx)).activity).toEqual({ lastWriteOn: '2026-10-07', absenceFromOn: '2026-05-20', absenceUntilOn: '2026-10-07' });
  });

  it('nenhum total muda: Recebido, Pago, Diferença, registros, contas e metas', async () => {
    const { repo, ctx, goals } = await demo();
    const snapshot = async () => {
      const records = await repo.listRecords(ctx, '2026-10');
      const s = summarizeMonth(records, ctx, '2026-10');
      const list = await repo.listCommitments(ctx, '2026-10');
      const c = summarizeCommitted(list, ctx, '2026-10', TODAY, await repo.listIncomeReferences(ctx));
      return { received: s.receivedCents, paid: s.paidCents, difference: s.differenceCents, records: records.length, commitments: list.length, committed: c.committedCents, goals: await repo.listGoals(ctx) };
    };
    const before = await snapshot();
    expect(before).toMatchObject({ received: 600_000, paid: 390_000, difference: 210_000, committed: 315_000 });
    expect(before.goals).toEqual(goals);
    const current = (await repo.getSavingsCheck(ctx))!;
    await repo.setSavingsAnswer(key(), ctx, current.version, 'consigo', 80_000);
    await repo.setSavingsAnswer(key(), ctx, current.version + 1, 'agora_nao');
    expect(await snapshot()).toEqual(before);
  });

  it('invariantes das restrições de coluna e guarda de alteração (versão + 1, criação fixa)', async () => {
    type Internals = {
      savingsChecks: Map<string, Record<string, unknown>>;
      checkTransitions(before: unknown): void;
    };
    const setup = async () => {
      const { repo, ctx } = await freshRepo();
      await repo.setSavingsAnswer(key(), ctx, 0, 'consigo', 30_000);
      return { repo, ctx, internals: repo as unknown as Internals };
    };
    const cases: [string, Record<string, unknown>][] = [
      ['resposta fora da lista', { answer: 'talvez' }],
      ['consigo sem valor', { monthlyCents: null }],
      ['consigo com valor zero', { monthlyCents: 0 }],
      ['consigo com valor abaixo de R$ 1,00', { monthlyCents: 99 }],
      ['consigo com valor acima do limite', { monthlyCents: MAX_RECORD_CENTS + 1 }],
      ['consigo com data de volta', { askAgainOn: '2026-10-14' }],
      ['agora não com valor', { answer: 'agora_nao', askAgainOn: '2026-11-06' }],
      ['agora não sem data de volta', { answer: 'agora_nao', monthlyCents: null, askAgainOn: null }],
      ['depois com data de volta no mesmo dia', { answer: 'depois', monthlyCents: null, askAgainOn: '2026-10-07' }],
      ['dia da resposta inválido', { answeredOn: '2026-02-30' }],
      ['versão zero', { version: 0 }],
    ];
    for (const [name, over] of cases) {
      const { repo, ctx, internals } = await setup();
      repo.checkInvariants();
      internals.savingsChecks.set(ctx, { ...internals.savingsChecks.get(ctx)!, ...over });
      expect(() => repo.checkInvariants(), name).toThrow('guardar_inconsistente');
    }
    const { repo, ctx, internals } = await setup();
    const snap = () => ({ commitments: new Map(), seriesById: new Map(), terms: new Map(), savingsChecks: new Map(internals.savingsChecks) });
    const before = snap();
    const row = internals.savingsChecks.get(ctx)!;
    internals.savingsChecks.set(ctx, { ...row, monthlyCents: 40_000 });
    expect(() => internals.checkTransitions(before)).toThrow('campo_imutavel'); // versão não subiu
    internals.savingsChecks.set(ctx, { ...row, monthlyCents: 40_000, version: 2, createdAt: '2020-01-01T00:00:00.000Z' });
    expect(() => internals.checkTransitions(before)).toThrow('campo_imutavel'); // criação mudou
    internals.savingsChecks.set(ctx, { ...row, monthlyCents: 40_000, version: 2 });
    expect(() => internals.checkTransitions(before)).not.toThrow();
    repo.checkInvariants();
  });

  it('a demonstração com o plano: etapas da reserva batem com o plano da própria reserva', async () => {
    const { repo, ctx, goals, movements, reserve } = await demo();
    const c = (await repo.getSavingsCheck(ctx))!;
    const p = savingsPlan({ monthlyCents: c.monthlyCents!, essentialCents: reserve.essentialBaseCents, goals, movements, today: TODAY });
    expect(p.stages[2]!.targetCents).toBe(reserve.targetCents);
    expect(p.stages[2]!.reachMonth).toBe(goalPlan(reserve, movements, TODAY).reachMonth);
  });
});
