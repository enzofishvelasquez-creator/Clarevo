import { describe, expect, it } from 'vitest';
import {
  COMMITTED_TEXT,
  DEMO_TODAY,
  ESSENTIAL_CATEGORIES,
  GOALS_TEXT,
  GOAL_ERROR_TEXT,
  MOVEMENT_SIGN,
  MemoryRepository,
  RESERVE_MONTH_CHIPS,
  RESERVA_MONTH_CHIPS,
  SAVINGS_HINT,
  annualCommitmentIds,
  committedGoalLines,
  coverageTenths,
  createDemoRepository,
  emergencyTarget,
  essentialEstimateText,
  essentialMonthly,
  firstNegativeDay,
  firstProjectedMonth,
  formatCoverage,
  goalCardCaption,
  goalComposition,
  goalDetailTexts,
  goalErrorText,
  goalInputError,
  goalPlan,
  goalPreview,
  goalProgress,
  goalSaved,
  goalsMonthTexts,
  isEssentialCategory,
  isRepoError,
  loadInvoices,
  looksLikeSavings,
  monthReachedWithPlan,
  monthlyNeeded,
  movementLine,
  movementsByMonth,
  negativeDayFromDetail,
  newOperationKey,
  organizeGoals,
  plannedForGoals,
  reserveCardTexts,
  savedInMonth,
  savedOn,
  summarizeCommitted,
  summarizeMonth,
  summarizeToPay,
  updateSavedValue,
  validateGoalDraft,
  validateGoalMovementDraft,
  validateSavedValueDraft,
  type Commitment,
  type FinancialRecord,
  type GoalDraft,
  type GoalMovement,
  type GoalMovementKind,
  type NewGoalInput,
  type RepoError,
  type RepoErrorCode,
} from '../src';

const TODAY = DEMO_TODAY; // 2026-10-07
const OCT = '2026-10';
const key = () => newOperationKey();

async function expectCode(p: Promise<unknown>, code: RepoErrorCode, detail?: string) {
  let error: unknown = null;
  try {
    await p;
  } catch (e) {
    error = e;
  }
  expect(isRepoError(error, code), `esperava ${code}, veio ${String(error)}`).toBe(true);
  if (detail !== undefined) expect((error as RepoError).detail).toBe(detail);
}

/** Demonstração sem as metas de exemplo: os gastos de setembro e a base de outubro (6.000 / 3.900 / 2.100 / 650). */
async function baseRepo() {
  const repo = await createDemoRepository({ cards: false });
  const ctx = (await repo.getSpace())!.personalContextId;
  for (const g of await repo.listGoals(ctx)) await repo.deleteGoal(key(), g.id, g.version);
  expect(await repo.listGoals(ctx)).toEqual([]);
  return { repo, ctx };
}

/** Repositório vazio com o dia ajustável. */
async function freshRepo(day = TODAY) {
  const clock = { today: day };
  const repo = new MemoryRepository({ actorId: 'pessoa-teste', displayName: 'Pessoa de teste', today: () => clock.today });
  const space = await repo.ensurePersonalSpace('Conta principal');
  return { repo, ctx: space.personalContextId, accountId: space.accounts[0]!.id, clock };
}

/** Totais de outubro que nunca podem mudar com movimentos de meta. */
async function octoberTotals(repo: MemoryRepository, ctx: string) {
  const s = summarizeMonth(await repo.listRecords(ctx, OCT), ctx, OCT);
  const list = await repo.listCommitments(ctx, OCT);
  const c = summarizeCommitted(list, ctx, OCT, TODAY, await repo.listIncomeReferences(ctx));
  return {
    received: s.receivedCents,
    paid: s.paidCents,
    difference: s.differenceCents,
    toPay: summarizeToPay(list, ctx, OCT, TODAY).toPayCents,
    committed: c.committedCents,
    permille: c.committedPermille,
    outside: c.outsideCents,
    records: (await repo.listRecords(ctx, OCT)).length,
    commitments: list.length,
  };
}

const BASE_TOTALS = {
  received: 600_000,
  paid: 390_000,
  difference: 210_000,
  toPay: 65_000,
  committed: 315_000,
  permille: 525,
  outside: 285_000,
  records: 3,
  // As de outubro e as em aberto de outros meses (listCommitments).
  commitments: 7,
};

const reserveInput = (over: Partial<NewGoalInput> = {}): NewGoalInput => ({
  goalType: 'emergencia',
  name: 'Reserva para imprevistos',
  targetCents: null,
  targetMonth: null,
  plannedMonthlyCents: null,
  essentialBaseCents: 375_000,
  essentialMonths: 6,
  essentialBaseSource: 'media_gastos',
  initialCents: null,
  initialOn: null,
  ...over,
});

const goalInput = (over: Partial<NewGoalInput> = {}): NewGoalInput => ({
  goalType: 'objetivo',
  name: 'Viagem de férias',
  targetCents: 600_000,
  targetMonth: '2027-07',
  plannedMonthlyCents: null,
  essentialBaseCents: null,
  essentialMonths: null,
  essentialBaseSource: null,
  initialCents: null,
  initialOn: null,
  ...over,
});

let mseq = 0;
const mov = (kind: GoalMovementKind, amountCents: number, occurredOn: string, goalId = 'g1'): GoalMovement => {
  mseq += 1;
  return {
    id: `m${mseq}`,
    goalId,
    contextId: 'ctx',
    kind,
    amountCents,
    occurredOn,
    note: null,
    accountId: null,
    createdBy: 'p',
    version: 1,
    createdAt: `2026-10-0${(mseq % 9) + 1}T00:00:00.000Z`,
    updatedAt: `2026-10-0${(mseq % 9) + 1}T00:00:00.000Z`,
  };
};

describe('regras puras de metas', () => {
  it('sinal dos movimentos e valor guardado', () => {
    expect(MOVEMENT_SIGN).toEqual({ saldo_inicial: 1, aporte: 1, resgate: -1, rendimento: 1, valorizacao: 1, desvalorizacao: -1 });
    const list = [mov('saldo_inicial', 300_000, '2026-10-01'), mov('aporte', 150_000, '2026-10-06'), mov('resgate', 50_000, '2026-10-07'), mov('valorizacao', 3_720, '2026-10-07')];
    expect(goalSaved(list)).toBe(403_720);
    expect(savedOn(list, '2026-10-05')).toBe(300_000);
    expect(savedOn(list, '2026-09-30')).toBe(0);
    expect(goalSaved([...list, mov('desvalorizacao', 3_720, '2026-10-07'), mov('rendimento', 1_000, '2026-10-07')])).toBe(401_000);
    expect(goalComposition(list)).toEqual({
      savedCents: 403_720,
      initialCents: 300_000,
      depositsCents: 150_000,
      withdrawalsCents: 50_000,
      incomeCents: 0,
      appreciationCents: 3_720,
      depreciationCents: 0,
      lastMovementOn: '2026-10-07',
    });
  });

  it('firstNegativeDay: resgate com data passada recusado mesmo com o guardado de hoje suficiente', () => {
    const initial = mov('saldo_inicial', 300_000, '2026-10-01');
    const deposit = mov('aporte', 150_000, '2026-10-06');
    const list = [initial, deposit];
    expect(firstNegativeDay(list)).toBeNull();
    // Em 02/10: 3.000,00 - 3.500,00 = -500,00, embora hoje o guardado ficasse em 1.000,00.
    expect(firstNegativeDay(list, { op: 'add', kind: 'resgate', amountCents: 350_000, occurredOn: '2026-10-02' })).toBe('2026-10-02');
    expect(firstNegativeDay(list, { op: 'add', kind: 'resgate', amountCents: 350_000, occurredOn: '2026-10-07' })).toBeNull();
    expect(firstNegativeDay(list, { op: 'add', kind: 'resgate', amountCents: 450_001, occurredOn: '2026-10-07' })).toBe('2026-10-07');
    // Mesmo dia: o saldo é o do fim do dia (aporte e resgate no mesmo dia se compensam).
    expect(firstNegativeDay([], { op: 'add', kind: 'resgate', amountCents: 100, occurredOn: '2026-10-01' })).toBe('2026-10-01');
    expect(firstNegativeDay([mov('resgate', 100, '2026-10-03'), mov('aporte', 100, '2026-10-03')])).toBeNull();
    // Excluir ou mudar a data do já guardado deixa um resgate anterior sem cobertura.
    const withdrawal = mov('resgate', 100_000, '2026-10-03');
    expect(firstNegativeDay([initial, withdrawal], { op: 'delete', id: initial.id })).toBe('2026-10-03');
    expect(firstNegativeDay([initial, withdrawal], { op: 'update', id: initial.id, amountCents: 300_000, occurredOn: '2026-10-05' })).toBe('2026-10-03');
    expect(firstNegativeDay([initial, withdrawal], { op: 'update', id: withdrawal.id, amountCents: 300_000, occurredOn: '2026-10-03' })).toBeNull();
    expect(firstNegativeDay([initial, withdrawal], { op: 'update', id: withdrawal.id, amountCents: 300_001, occurredOn: '2026-10-03' })).toBe('2026-10-03');
  });

  it('goalProgress: para baixo, nunca 100% antes de alcançar', () => {
    expect(goalProgress(300_000, 2_250_000)).toEqual({ percent: 13, barPercent: 13, reached: false, missingCents: 1_950_000 });
    expect(goalProgress(450_000, 2_250_000).percent).toBe(20);
    expect(goalProgress(400_000, 2_250_000).percent).toBe(17);
    expect(goalProgress(403_720, 2_250_000).percent).toBe(17);
    expect(goalProgress(350_000, 2_250_000).percent).toBe(15);
    expect(goalProgress(120_000, 600_000).percent).toBe(20);
    expect(goalProgress(2_249_999, 2_250_000)).toEqual({ percent: 99, barPercent: 99, reached: false, missingCents: 1 });
    expect(goalProgress(2_250_000, 2_250_000)).toEqual({ percent: 100, barPercent: 100, reached: true, missingCents: 0 });
    expect(goalProgress(2_362_500, 2_250_000)).toEqual({ percent: 105, barPercent: 100, reached: true, missingCents: 0 });
    expect(goalProgress(0, 600_000)).toEqual({ percent: 0, barPercent: 0, reached: false, missingCents: 600_000 });
    // Inteiros grandes: sem erro de ponto flutuante.
    expect(goalProgress(999_999_998, 999_999_999).percent).toBe(99);
  });

  it('P0, valor por mês até o prazo e mês previsto com o plano (2.5)', () => {
    expect(firstProjectedMonth([mov('saldo_inicial', 300_000, '2026-10-01')], TODAY)).toBe('2026-10');
    expect(firstProjectedMonth([mov('saldo_inicial', 300_000, '2026-10-01'), mov('aporte', 150_000, '2026-10-06')], TODAY)).toBe('2026-11');
    // Só aporte conta: rendimento ou valorização no mês não mudam P0; aporte de setembro também não.
    expect(firstProjectedMonth([mov('rendimento', 100, '2026-10-02'), mov('aporte', 100, '2026-09-30')], TODAY)).toBe('2026-10');
    expect(monthlyNeeded(1_800_000, '2026-11', '2027-12')).toBe(128_572);
    expect(monthlyNeeded(1_846_280, '2026-11', '2027-12')).toBe(131_878);
    expect(monthlyNeeded(480_000, '2026-10', '2027-07')).toBe(48_000);
    expect(monthlyNeeded(480_000, '2026-10', '2026-10')).toBe(480_000);
    expect(monthlyNeeded(480_000, '2026-11', '2026-10')).toBeNull(); // o prazo chegou
    expect(monthlyNeeded(0, '2026-10', '2027-07')).toBe(0);
    expect(monthReachedWithPlan(1_800_000, 100_000, '2026-11')).toBe('2028-04');
    expect(monthReachedWithPlan(1_900_000, 50_000, '2026-11')).toBe('2029-12');
    expect(monthReachedWithPlan(480_000, 48_000, '2026-10')).toBe('2027-07');
    expect(monthReachedWithPlan(480_001, 48_000, '2026-10')).toBe('2027-08');
    expect(monthReachedWithPlan(0, 48_000, '2026-10')).toBeNull();
    expect(monthReachedWithPlan(480_000, null, '2026-10')).toBeNull();
  });

  it('savedInMonth: aportes menos resgates do mês; sem já guardado ao criar, rendimento e (des)valorização', () => {
    const list = [
      mov('saldo_inicial', 300_000, '2026-10-01'),
      mov('aporte', 150_000, '2026-10-06'),
      mov('resgate', 50_000, '2026-10-07'),
      mov('valorizacao', 3_720, '2026-10-07'),
      mov('desvalorizacao', 1_000, '2026-10-07'),
      mov('rendimento', 2_000, '2026-10-05'),
      mov('aporte', 70_000, '2026-09-30'),
    ];
    expect(savedInMonth(list, OCT)).toBe(100_000);
    expect(savedInMonth(list, '2026-09')).toBe(70_000);
    expect(savedInMonth([mov('resgate', 20_000, '2026-10-02')], OCT)).toBe(-20_000);
  });

  it('plannedForGoals: só metas ativas', () => {
    expect(
      plannedForGoals([
        { status: 'ativa', plannedMonthlyCents: 50_000 },
        { status: 'ativa', plannedMonthlyCents: 48_000 },
        { status: 'ativa', plannedMonthlyCents: null },
        { status: 'concluida', plannedMonthlyCents: 10_000 },
        { status: 'arquivada', plannedMonthlyCents: 10_000 },
      ]),
    ).toBe(98_000);
  });

  it('emergencyTarget, coverageTenths e formatCoverage', () => {
    expect(emergencyTarget(375_000, 6)).toBe(2_250_000);
    expect(emergencyTarget(375_000, 1)).toBe(375_000);
    expect(emergencyTarget(375_000, 24)).toBe(9_000_000);
    expect(emergencyTarget(375_000, 25)).toBeNull();
    expect(emergencyTarget(375_000, 0)).toBeNull();
    expect(emergencyTarget(499_999_999, 2)).toBe(999_999_998);
    expect(emergencyTarget(500_000_000, 2)).toBeNull();
    expect(emergencyTarget(0, 6)).toBeNull();
    expect([300_000, 450_000, 400_000, 403_720, 350_000].map((s) => coverageTenths(s, 375_000))).toEqual([8, 12, 10, 10, 9]);
    expect(coverageTenths(350_000, null)).toBeNull();
    expect(formatCoverage(8)).toBe('0,8 mês');
    expect(formatCoverage(12)).toBe('1,2 mês');
    expect(formatCoverage(10)).toBe('1,0 mês');
    expect(formatCoverage(9)).toBe('0,9 mês');
    expect(formatCoverage(19)).toBe('1,9 mês');
    expect(formatCoverage(20)).toBe('2,0 meses');
    expect(formatCoverage(125)).toBe('12,5 meses');
    expect(formatCoverage(0, 0)).toBe('0,0 mês');
    expect(formatCoverage(coverageTenths(100, 375_000)!, 100)).toBe('menos de 0,1 mês');
  });

  it('updateSavedValue', () => {
    expect(updateSavedValue(400_000, 403_720)).toEqual({ kind: 'valorizacao', amountCents: 3_720 });
    expect(updateSavedValue(400_000, 390_000)).toEqual({ kind: 'desvalorizacao', amountCents: 10_000 });
    expect(updateSavedValue(400_000, 0)).toEqual({ kind: 'desvalorizacao', amountCents: 400_000 });
    expect(updateSavedValue(400_000, 400_000)).toBeNull();
  });

  it('SAVINGS_HINT: descrições que parecem dinheiro guardado', () => {
    for (const text of ['Reserva', 'Poupança', 'poupanca do mês', 'Caixinha', 'cofrinho', 'Investimento', 'Aplicação', 'aplicacao', 'Aporte mensal']) {
      expect(SAVINGS_HINT.test(text), text).toBe(true);
      expect(looksLikeSavings(text)).toBe(true);
    }
    for (const text of ['Mercado', 'Aluguel', 'Luz', 'Farmácia', 'Conserto do carro']) expect(looksLikeSavings(text), text).toBe(false);
  });

  it('organizeGoals: reserva não arquivada, ativas e concluídas ou arquivadas', () => {
    const g = (id: string, goalType: 'emergencia' | 'objetivo', status: 'ativa' | 'concluida' | 'arquivada', at: string) => ({
      id,
      goalType,
      status,
      createdAt: at,
      updatedAt: at,
    });
    const r = organizeGoals([
      g('a', 'emergencia', 'arquivada', '2026-10-01'),
      g('b', 'objetivo', 'ativa', '2026-10-03'),
      g('c', 'emergencia', 'ativa', '2026-10-02'),
      g('d', 'objetivo', 'concluida', '2026-10-04'),
      g('e', 'objetivo', 'ativa', '2026-10-02'),
    ]);
    expect(r.reserve?.id).toBe('c');
    expect(r.active.map((x) => x.id)).toEqual(['e', 'b']);
    expect(r.closed.map((x) => x.id)).toEqual(['d', 'a']);
  });

  it('negativeDayFromDetail e goalErrorText', () => {
    expect(negativeDayFromDetail('2026-10-02')).toBe('2026-10-02');
    expect(negativeDayFromDetail('dia=2026-10-02')).toBe('2026-10-02'); // formato do banco (clarevo_require_goal_balance)
    expect(negativeDayFromDetail('data=2026-10-02')).toBe('2026-10-02');
    expect(negativeDayFromDetail('dia=2026-02-30')).toBeNull();
    expect(negativeDayFromDetail(undefined)).toBeNull();
    expect(goalErrorText('saldo_da_meta_insuficiente', { kind: 'resgate', negativeDay: '2026-10-02' })).toBe(
      'Com este resgate, o valor guardado ficaria negativo em 02/10/2026. Confira o valor e a data.',
    );
    expect(goalErrorText('saldo_da_meta_insuficiente', { negativeDay: '2026-10-03' })).toBe(
      'Com esta mudança, o valor guardado ficaria negativo em 03/10/2026. Confira o valor e a data.',
    );
    expect(goalErrorText('data_futura', { kind: 'aporte' })).toBe('Use uma data até hoje. Registre o aporte depois de guardar.');
    expect(goalErrorText('meta_arquivada')).toBe('Esta meta está arquivada. Reative para registrar movimentos.');
    expect(goalErrorText('reserva_ja_existe')).toBe('Você já tem uma reserva para imprevistos. Abra a reserva para alterar o valor.');
    expect(goalErrorText('nome_da_meta_invalido')).toBe('Dê um nome de 1 a 40 caracteres.');
    expect(goalErrorText('alvo_acima_do_limite')).toBe('O valor passa do limite de R$ 9.999.999,99.');
    expect(goalErrorText('prazo_invalido')).toBe('Escolha um mês a partir deste.');
    expect(goalErrorText('qualquer_coisa')).toBe(GOAL_ERROR_TEXT.salvar_falhou);
  });

  it('chips de meses iguais aos da calculadora', () => {
    expect(RESERVE_MONTH_CHIPS).toEqual(RESERVA_MONTH_CHIPS);
    expect(RESERVE_MONTH_CHIPS.map((n) => GOALS_TEXT.reserve.monthChip(n))).toEqual(['1 mês', '3 meses', '6 meses', '12 meses']);
  });
});

describe('gastos essenciais (D-027(6), P-017)', () => {
  const rec = (occurredOn: string, amountCents: number, category: string | null, kind: 'despesa' | 'receita' = 'despesa', commitmentId: string | null = null) =>
    ({ kind, amountCents, occurredOn, category, commitmentId }) as Pick<FinancialRecord, 'kind' | 'amountCents' | 'occurredOn' | 'category' | 'commitmentId'>;

  it('categorias: Moradia, Mercado, Transporte, Saúde e Educação; Lazer e sem categoria fora', () => {
    expect(ESSENTIAL_CATEGORIES).toEqual(['Moradia', 'Mercado', 'Transporte', 'Saúde', 'Educação']);
    expect(isEssentialCategory(' mercado ')).toBe(true);
    expect(isEssentialCategory('SAÚDE')).toBe(true);
    expect(isEssentialCategory('Lazer')).toBe(false);
    expect(isEssentialCategory(null)).toBe(false);
  });

  it('demonstração: média de setembro, R$ 3.750,00', async () => {
    const repo = await createDemoRepository({ cards: false });
    const ctx = (await repo.getSpace())!.personalContextId;
    const months = ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09'];
    const records = (await Promise.all(months.map((m) => repo.listRecords(ctx, m)))).flat();
    const e = essentialMonthly(records, OCT, 315_000);
    expect(e).toEqual({
      source: 'media_gastos',
      amountCents: 375_000,
      months: ['2026-09'],
      byCategory: [
        { category: 'Moradia', cents: 250_000 },
        { category: 'Mercado', cents: 125_000 },
      ],
      excludedAnnualCents: 0,
    });
    expect(essentialEstimateText(e)).toBe('Média de setembro de 2026 em Moradia e Mercado. Lazer e gastos sem categoria não entram.');
  });

  it('pagamento de fatura de cartão conta pelas categorias da fatura (Moradia e Mercado entram; Lazer e encargos, não)', async () => {
    const clock = { today: '2026-09-01' };
    const repo = new MemoryRepository({ actorId: 'pessoa-essenciais', displayName: 'Pessoa', today: () => clock.today });
    const ctx = (await repo.ensurePersonalSpace('Conta principal')).personalContextId;
    const card = (await repo.createCard(key(), ctx, { name: 'Nubank', lastDigits: null, closingDay: 3, dueDay: 10, limitCents: null })).card;
    const buy = (description: string, totalCents: number, category: string) =>
      repo.addCardPurchase(key(), card.id, { description, category, purchasedOn: '2026-08-20', totalCents, installments: 1 });
    await buy('Aluguel', 40_000, 'Moradia');
    await buy('Feira', 30_000, 'Mercado');
    await buy('Cinema', 10_000, 'Lazer');
    await repo.addCardCharge(key(), card.id, { chargeType: 'juros', amountCents: 2_000, invoiceMonth: '2026-09' });
    clock.today = '2026-09-04'; // setembro fechou em 03/09
    const sep = (await loadInvoices(repo, card, clock.today)).find((i) => i.month === '2026-09')!;
    await repo.payInvoice(key(), card.id, '2026-09', sep.commitmentVersion!, 82_000, '2026-09-04');
    const records = await repo.listRecords(ctx, '2026-09');
    expect(records.filter((r) => r.invoice)).toHaveLength(1);
    // Sem as faturas, o gasto do pagamento não tem categoria: o mês tem gasto, mas nenhum essencial.
    expect(essentialMonthly(records, OCT, null).source).toBe('informado');
    // Com as faturas, o pagamento é dividido como em "Por categoria".
    const invoices = await loadInvoices(repo, card, '2026-10-07');
    expect(essentialMonthly(records, OCT, null, [], invoices)).toEqual({
      source: 'media_gastos',
      amountCents: 70_000,
      months: ['2026-09'],
      byCategory: [
        { category: 'Moradia', cents: 40_000 },
        { category: 'Mercado', cents: 30_000 },
      ],
      excludedAnnualCents: 0,
    });
    // Um gasto comum junto do pagamento soma na categoria dele.
    const withCoffee = [...records, rec('2026-09-12', 5_000, 'Mercado')];
    expect(essentialMonthly(withCoffee, OCT, null, [], invoices)).toMatchObject({ amountCents: 75_000 });
  });

  it('só as contas do mês e digitado', () => {
    const bills = essentialMonthly([], OCT, 315_000);
    expect(bills).toEqual({ source: 'contas_do_mes', amountCents: 315_000, month: OCT });
    expect(essentialEstimateText(bills)).toBe(
      'Começamos pelas contas de outubro: R$ 3.150,00. Some o que costuma gastar com mercado, transporte e saúde.',
    );
    // Meses com gastos, mas nenhum essencial: também cai nas contas do mês.
    expect(essentialMonthly([rec('2026-09-10', 20_000, 'Lazer')], OCT, 315_000).source).toBe('contas_do_mes');
    const none = essentialMonthly([], OCT, null);
    expect(none).toEqual({ source: 'informado', amountCents: null });
    expect(essentialMonthly([], OCT, 0).source).toBe('informado');
    expect(essentialEstimateText(none)).toBe('Informe quanto você gasta por mês com moradia, mercado, transporte, saúde e educação.');
  });

  it('até 3 meses mais recentes com gastos entre os 6 fechados, sem pagamentos de contas do ano, metade para cima', () => {
    const annual = annualCommitmentIds([
      { id: 'ipva', series: { id: 's1', number: 1, kind: 'anual', nature: 'conta', installmentTotal: null, partsPerYear: 1 } },
      { id: 'iptu', series: { id: 's2', number: 7, kind: 'anual', nature: 'conta', installmentTotal: null, partsPerYear: 10 } },
      { id: 'aluguel', series: { id: 's3', number: 1, kind: 'mensal', nature: 'conta', installmentTotal: null, partsPerYear: null } },
      { id: 'avulsa', series: null },
    ] as Pick<Commitment, 'id' | 'series'>[]);
    expect([...annual].sort()).toEqual(['iptu', 'ipva']);
    const records = [
      rec('2026-03-10', 900_000, 'Moradia'), // 7º mês para trás: fora
      rec('2026-05-10', 100_000, 'Moradia'),
      rec('2026-06-10', 70_000, 'Educação'),
      rec('2026-07-10', 90_000, 'Mercado'),
      rec('2026-07-20', 10_000, ' mercado '),
      rec('2026-07-21', 50_000, 'Lazer'),
      rec('2026-08-10', 18_000, 'Moradia', 'despesa', 'iptu'), // agosto só tem conta do ano: não conta como mês com gastos
      rec('2026-09-10', 30_003, 'Saúde'),
      rec('2026-09-11', 20_000, null),
      rec('2026-09-12', 240_000, 'Transporte', 'despesa', 'ipva'),
      rec('2026-09-01', 600_000, 'Salário', 'receita'),
      rec('2026-10-02', 140_000, 'Mercado'), // mês atual: fora
    ];
    const e = essentialMonthly(records, OCT, 315_000, annual);
    // (70.000 + 100.000 + 30.003) ÷ 3 = 66.667,67 → 66.668
    expect(e).toEqual({
      source: 'media_gastos',
      amountCents: 66_668,
      months: ['2026-06', '2026-07', '2026-09'],
      byCategory: [
        { category: 'Mercado', cents: 100_000 },
        { category: 'Saúde', cents: 30_003 },
        { category: 'Educação', cents: 70_000 },
      ],
      excludedAnnualCents: 240_000,
    });
    expect(essentialEstimateText(e)).toBe(
      'Média de junho, julho e setembro de 2026 em Mercado, Saúde e Educação. Lazer e gastos sem categoria não entram. Pagamentos de contas do ano, como IPVA e IPTU, também não entram.',
    );
    // Sem a lista de contas do ano, agosto e o IPVA entrariam.
    const without = essentialMonthly(records, OCT, 315_000);
    expect(without.source === 'media_gastos' && without.months).toEqual(['2026-07', '2026-08', '2026-09']);
    // Virada de ano: meses de dois anos no texto.
    const turn = essentialMonthly([rec('2026-12-05', 100_000, 'Moradia'), rec('2027-01-05', 100_001, 'Moradia')], '2027-02');
    expect(turn.amountCents).toBe(100_001); // 200.001 ÷ 2 = 100.000,5 → 100.001 (metade para cima)
    expect(essentialEstimateText(turn)).toBe('Média de dezembro de 2026 e janeiro de 2027 em Moradia. Lazer e gastos sem categoria não entram.');
  });
});

describe('validação dos formulários de metas', () => {
  const reserveDraft = (over: Partial<GoalDraft> = {}): GoalDraft => ({
    goalType: 'emergencia',
    name: 'Reserva para imprevistos',
    targetText: '',
    essentialBaseText: '3.750,00',
    essentialMonthsText: '6',
    essentialBaseSource: 'media_gastos',
    targetMonthText: '',
    initialText: '3.000,00',
    plannedText: '',
    ...over,
  });
  const goalDraft = (over: Partial<GoalDraft> = {}): GoalDraft => ({
    goalType: 'objetivo',
    name: ' Viagem de férias ',
    targetText: '6.000,00',
    essentialBaseText: '',
    essentialMonthsText: '',
    essentialBaseSource: 'informado',
    targetMonthText: '07/2027',
    initialText: '1.200,00',
    plannedText: '480,00',
    ...over,
  });

  it('reserva: alvo = base × meses, saldo inicial com a data de hoje', () => {
    const v = validateGoalDraft(reserveDraft(), TODAY);
    expect(v).toEqual({
      ok: true,
      input: {
        goalType: 'emergencia',
        name: 'Reserva para imprevistos',
        targetCents: 2_250_000,
        targetMonth: null,
        plannedMonthlyCents: null,
        essentialBaseCents: 375_000,
        essentialMonths: 6,
        essentialBaseSource: 'media_gastos',
        initialCents: 300_000,
        initialOn: TODAY,
      },
    });
    if (v.ok) expect(goalInputError(v.input, TODAY)).toBeNull();
  });

  it('objetivo: nome aparado, prazo e plano', () => {
    const v = validateGoalDraft(goalDraft(), TODAY);
    expect(v.ok && v.input).toMatchObject({ name: 'Viagem de férias', targetCents: 600_000, targetMonth: '2027-07', plannedMonthlyCents: 48_000, initialCents: 120_000 });
    // Já guardado 0 não cria saldo inicial.
    const zero = validateGoalDraft(goalDraft({ initialText: '0' }), TODAY);
    expect(zero.ok && [zero.input.initialCents, zero.input.initialOn]).toEqual([null, null]);
  });

  it('códigos na ordem do banco, com o texto de cada campo', () => {
    const code = (d: GoalDraft, opts?: Parameters<typeof validateGoalDraft>[2]) => {
      const v = validateGoalDraft(d, TODAY, opts);
      return v.ok ? null : v.code;
    };
    expect(code(goalDraft({ name: '   ' }))).toBe('nome_da_meta_invalido');
    expect(code(goalDraft({ name: 'x'.repeat(41) }))).toBe('nome_da_meta_invalido');
    expect(code(goalDraft({ name: 'x'.repeat(40) }))).toBeNull();
    const both = validateGoalDraft(goalDraft({ name: '', targetText: '' }), TODAY);
    expect(both.ok ? null : [both.code, both.errors]).toEqual([
      'nome_da_meta_invalido',
      { name: 'Dê um nome de 1 a 40 caracteres.', targetText: 'Informe o valor da meta, como 6.000,00.' },
    ]);
    expect(code(goalDraft({ targetText: '10.000.000,00' }))).toBe('alvo_acima_do_limite');
    expect(code(reserveDraft({ essentialBaseText: '' }))).toBe('valor_invalido');
    expect(code(reserveDraft({ essentialBaseText: '10.000.000,00' }))).toBe('alvo_acima_do_limite');
    // Ordem do banco: meses antes do limite da base.
    expect(code(reserveDraft({ essentialBaseText: '10.000.000,00', essentialMonthsText: '30' }))).toBe('meses_invalidos');
    expect(code(reserveDraft({ essentialBaseSource: 'chute' as 'informado' }))).toBe('origem_invalida');
    expect(code(reserveDraft({ essentialMonthsText: '25' }))).toBe('meses_invalidos');
    // Reserva mínima: sempre 1 mês.
    expect(code(reserveDraft({ essentialBaseSource: 'reserva_minima', essentialMonthsText: '3' }))).toBe('meses_invalidos');
    expect(code(reserveDraft({ essentialBaseSource: 'reserva_minima', essentialMonthsText: '1' }))).toBeNull();
    expect(code(reserveDraft({ essentialMonthsText: '0' }))).toBe('meses_invalidos');
    expect(code(reserveDraft({ essentialBaseText: '5.000.000,00', essentialMonthsText: '2' }))).toBe('alvo_acima_do_limite');
    expect(code(reserveDraft({ essentialBaseText: '4.999.999,99', essentialMonthsText: '2' }))).toBeNull();
    expect(code(goalDraft({ targetMonthText: '09/2026' }))).toBe('prazo_invalido');
    expect(code(goalDraft({ targetMonthText: '10/2026' }))).toBeNull();
    expect(code(goalDraft({ targetMonthText: '10/2076' }))).toBeNull(); // 600 meses depois
    expect(code(goalDraft({ targetMonthText: '11/2076' }))).toBe('prazo_invalido');
    const format = validateGoalDraft(goalDraft({ targetMonthText: '13/2026' }), TODAY);
    expect(format.ok ? null : format.errors.targetMonthText).toBe('Use mês e ano, como 07/2027.');
    // Na edição, um prazo que já passou e não mudou continua aceito.
    expect(code(goalDraft({ targetMonthText: '09/2026' }), { mode: 'editar', originalTargetMonth: '2026-09' })).toBeNull();
    expect(code(goalDraft({ targetMonthText: '08/2026' }), { mode: 'editar', originalTargetMonth: '2026-09' })).toBe('prazo_invalido');
    expect(code(goalDraft({ plannedText: '0' }))).toBe('plano_invalido');
    expect(code(goalDraft({ plannedText: 'abc' }))).toBe('plano_invalido');
    expect(code(goalDraft({ plannedText: '10.000.000,00' }))).toBe('plano_invalido');
    expect(code(goalDraft({ initialText: '10.000.000,00' }))).toBe('saldo_inicial_invalido');
    expect(code(goalDraft({ initialText: 'abc' }))).toBe('saldo_inicial_invalido');
    // Na edição, o saldo inicial é ignorado.
    const edit = validateGoalDraft(goalDraft({ initialText: 'abc' }), TODAY, { mode: 'editar', originalTargetMonth: '2027-07' });
    expect(edit.ok && edit.input.initialCents).toBeNull();
  });

  it('goalInputError: ordem do banco para as escritas diretas', () => {
    const base = goalInput();
    expect(goalInputError(base, TODAY)).toBeNull();
    expect(goalInputError({ ...base, goalType: 'casa' as 'objetivo' }, TODAY)).toBe('tipo_invalido');
    expect(goalInputError({ ...base, name: '', targetCents: 0 }, TODAY)).toBe('nome_da_meta_invalido');
    expect(goalInputError({ ...base, essentialMonths: 6 }, TODAY)).toBe('tipo_invalido');
    expect(goalInputError({ ...base, targetCents: 0 }, TODAY)).toBe('valor_invalido');
    expect(goalInputError({ ...base, targetCents: 1_000_000_000 }, TODAY)).toBe('alvo_acima_do_limite');
    expect(goalInputError({ ...base, targetMonth: '2026-09' }, TODAY)).toBe('prazo_invalido');
    expect(goalInputError({ ...base, targetMonth: '2026-09' }, TODAY, { checkDeadline: false })).toBeNull();
    expect(goalInputError({ ...base, targetMonth: '2076-10' }, TODAY)).toBeNull();
    expect(goalInputError({ ...base, targetMonth: '2076-11' }, TODAY)).toBe('prazo_invalido');
    // Formato inválido é recusado mesmo sem conferir o intervalo (no banco, dia diferente de 1).
    expect(goalInputError({ ...base, targetMonth: '2026-13' }, TODAY, { checkDeadline: false })).toBe('prazo_invalido');
    expect(goalInputError({ ...base, plannedMonthlyCents: 0 }, TODAY)).toBe('plano_invalido');
    expect(goalInputError({ ...base, plannedMonthlyCents: 1_000_000_000 }, TODAY)).toBe('plano_invalido');
    const r = reserveInput();
    expect(goalInputError(r, TODAY)).toBeNull();
    expect(goalInputError({ ...r, targetCents: 2_250_000 }, TODAY)).toBeNull();
    expect(goalInputError({ ...r, targetCents: 2_250_001 }, TODAY)).toBe('alvo_invalido');
    expect(goalInputError({ ...r, essentialBaseCents: null }, TODAY)).toBe('valor_invalido');
    expect(goalInputError({ ...r, essentialMonths: 25 }, TODAY)).toBe('meses_invalidos');
    expect(goalInputError({ ...r, essentialBaseSource: null }, TODAY)).toBe('origem_invalida');
    expect(goalInputError({ ...r, essentialBaseCents: 500_000_000, essentialMonths: 2 }, TODAY)).toBe('alvo_acima_do_limite');
    expect(goalInputError({ ...r, essentialBaseCents: 1_000_000_000, essentialMonths: 1 }, TODAY)).toBe('alvo_acima_do_limite');
    expect(goalInputError({ ...r, essentialBaseCents: 1_000_000_000, essentialMonths: 0 }, TODAY)).toBe('meses_invalidos');
  });

  it('movimento: valor, data (aporte com texto próprio) e observação', () => {
    const draft = (over: Partial<Parameters<typeof validateGoalMovementDraft>[0]> = {}) => ({
      kind: 'aporte' as GoalMovementKind,
      amountText: '1.500,00',
      dateText: '06/10/2026',
      note: '  ',
      ...over,
    });
    expect(validateGoalMovementDraft(draft(), TODAY)).toEqual({
      ok: true,
      kind: 'aporte',
      input: { amountCents: 150_000, occurredOn: '2026-10-06', note: null },
    });
    const future = validateGoalMovementDraft(draft({ dateText: '08/10/2026' }), TODAY);
    expect(future.ok ? null : [future.code, future.errors.dateText]).toEqual(['data_futura', 'Use uma data até hoje. Registre o aporte depois de guardar.']);
    const futureW = validateGoalMovementDraft(draft({ kind: 'resgate', dateText: '08/10/2026' }), TODAY);
    expect(futureW.ok ? null : futureW.errors.dateText).toBe(GOAL_ERROR_TEXT.data_futura);
    const bad = validateGoalMovementDraft(draft({ amountText: '0', dateText: '31/09/2026', note: 'x'.repeat(81) }), TODAY);
    expect(bad.ok ? null : [bad.code, Object.keys(bad.errors)]).toEqual(['valor_invalido', ['amountText', 'dateText', 'note']]);
    const longNote = validateGoalMovementDraft(draft({ note: 'x'.repeat(81) }), TODAY);
    expect(longNote.ok ? null : longNote.code).toBe('observacao_longa');
    expect(validateGoalMovementDraft(draft({ note: ' Décimo terceiro ' }), TODAY)).toMatchObject({ ok: true, input: { note: 'Décimo terceiro' } });
    const initial = validateGoalMovementDraft(draft({ kind: 'saldo_inicial' }), TODAY);
    expect(initial.ok ? null : initial.code).toBe('tipo_invalido');
    expect(validateGoalMovementDraft(draft({ kind: 'saldo_inicial' }), TODAY, { editing: true }).ok).toBe(true);
  });

  it('Atualizar valor guardado', () => {
    expect(validateSavedValueDraft('4.037,20', 400_000)).toEqual({ ok: true, informedCents: 403_720, change: { kind: 'valorizacao', amountCents: 3_720 } });
    expect(validateSavedValueDraft('3.900,00', 400_000)).toEqual({ ok: true, informedCents: 390_000, change: { kind: 'desvalorizacao', amountCents: 10_000 } });
    expect(validateSavedValueDraft('4.000,00', 400_000)).toEqual({ ok: true, informedCents: 400_000, change: null });
    expect(validateSavedValueDraft('0', 400_000)).toMatchObject({ ok: true, change: { kind: 'desvalorizacao', amountCents: 400_000 } });
    expect(validateSavedValueDraft('abc', 400_000)).toMatchObject({ ok: false, code: 'valor_invalido' });
    expect(validateSavedValueDraft('10.000.000,00', 400_000)).toMatchObject({ ok: false, code: 'valor_acima_do_limite' });
    expect(GOALS_TEXT.update.preview('valorizacao', 3_720)).toBe('Diferença: + R$ 37,20, registrada como valorização.');
    expect(GOALS_TEXT.update.button('valorizacao', 3_720)).toBe('Registrar valorização de R$ 37,20');
    expect(GOALS_TEXT.update.button('desvalorizacao', 10_000)).toBe('Registrar desvalorização de R$ 100,00');
  });
});

describe('sequência de aceite C (MemoryRepository, hoje 07/10/2026)', () => {
  it('reserva, aporte, resgates e valorização sem mexer em Recebido, Pago, Diferença, Ainda a pagar e renda comprometida', async () => {
    const { repo, ctx } = await baseRepo();
    expect(await octoberTotals(repo, ctx)).toEqual(BASE_TOTALS);
    const records = (await Promise.all(['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09'].map((m) => repo.listRecords(ctx, m)))).flat();
    const essentials = essentialMonthly(records, OCT, BASE_TOTALS.committed);
    expect(essentials.amountCents).toBe(375_000);
    expect(emergencyTarget(375_000, 6)).toBe(2_250_000);

    // 1. Criar reserva com já guardado de 3.000,00 em 01/10 (prazo e plano do exemplo de 2.5).
    const created = await repo.createGoal(
      key(),
      ctx,
      reserveInput({ targetMonth: '2027-12', plannedMonthlyCents: 100_000, initialCents: 300_000, initialOn: '2026-10-01' }),
    );
    const id = created.goal.id;
    expect(created.goal).toMatchObject({ targetCents: 2_250_000, savedCents: 300_000, initialCents: 300_000, status: 'ativa', version: 1 });
    expect(created.movement).toMatchObject({ kind: 'saldo_inicial', amountCents: 300_000, occurredOn: '2026-10-01' });
    expect(goalProgress(created.goal.savedCents, created.goal.targetCents).percent).toBe(13);
    expect(coverageTenths(created.goal.savedCents, created.goal.essentialBaseCents)).toBe(8);
    expect(await octoberTotals(repo, ctx)).toEqual(BASE_TOTALS);

    // 2. Aporte de 1.500,00 em 06/10.
    const dep = await repo.addGoalMovement(key(), id, 'aporte', { amountCents: 150_000, occurredOn: '2026-10-06', note: null });
    expect(dep.goal).toMatchObject({ savedCents: 450_000, version: 1 }); // a versão da meta não sobe
    expect(goalProgress(450_000, 2_250_000).percent).toBe(20);
    expect(coverageTenths(450_000, 375_000)).toBe(12);
    expect(await octoberTotals(repo, ctx)).toEqual(BASE_TOTALS);
    // Com 4.500,00: P0 = novembro; até dezembro de 2027, R$ 1.285,72; com 1.000,00 por mês, abril de 2028.
    const movements = await repo.listGoalMovements(id);
    const plan = goalPlan(dep.goal, movements, TODAY);
    expect(plan.firstProjectedMonth).toBe('2026-11');
    expect(plan.deadline).toEqual({ month: '2027-12', months: 14, monthlyCents: 128_572 });
    expect(plan.reachMonth).toBe('2028-04');
    const detail = goalDetailTexts(dep.goal, movements, TODAY);
    expect(detail).toMatchObject({
      saved: 'R$ 4.500,00',
      ofTarget: 'de R$ 22.500,00 · 20%',
      missing: 'Faltam R$ 18.000,00',
      deadline: 'Até dezembro de 2027: R$ 1.285,72 por mês, sem contar rendimentos.',
      planned: 'Você planejou guardar R$ 1.000,00 por mês. Nesse ritmo, chega lá em abril de 2028.',
      composition: ['Já guardado ao criar: R$ 3.000,00', 'Aportes: R$ 1.500,00', 'Resgates: R$ 0,00', 'Rendimentos e valorizações: R$ 0,00'],
      reached: null,
      coverage: 'Cobre 1,2 mês dos seus gastos essenciais',
    });
    expect(movementsByMonth(movements).map((g) => [g.title, g.items.map((m) => movementLine(m).text)])).toEqual([
      ['Outubro de 2026', ['06/10 · Aporte · + R$ 1.500,00', '01/10 · Já guardado ao criar a meta · R$ 3.000,00']],
    ]);

    // 3. Resgate de 3.500,00 com data 02/10: recusado, com a data no detalhe.
    await expectCode(repo.addGoalMovement(key(), id, 'resgate', { amountCents: 350_000, occurredOn: '2026-10-02', note: null }), 'saldo_da_meta_insuficiente', 'dia=2026-10-02');
    expect((await repo.getGoal(id))!.savedCents).toBe(450_000);

    // 4. Resgate de 500,00 em 07/10.
    const w = await repo.addGoalMovement(key(), id, 'resgate', { amountCents: 50_000, occurredOn: '2026-10-07', note: null });
    expect(w.goal.savedCents).toBe(400_000);
    expect(goalProgress(400_000, 2_250_000).percent).toBe(17);
    expect(coverageTenths(400_000, 375_000)).toBe(10);
    expect(movementLine(w.movement!).text).toBe('07/10 · Resgate · − R$ 500,00');
    expect(await octoberTotals(repo, ctx)).toEqual(BASE_TOTALS);

    // 5. Atualizar valor guardado para 4.037,20: valorização de 37,20.
    const change = updateSavedValue(w.goal.savedCents, 403_720)!;
    expect(change).toEqual({ kind: 'valorizacao', amountCents: 3_720 });
    const up = await repo.addGoalMovement(key(), id, change.kind, { amountCents: change.amountCents, occurredOn: TODAY, note: null });
    expect(up.goal).toMatchObject({ savedCents: 403_720, appreciationCents: 3_720 });
    expect(goalProgress(403_720, 2_250_000).percent).toBe(17);
    expect(coverageTenths(403_720, 375_000)).toBe(10);
    expect(monthlyNeeded(goalProgress(403_720, 2_250_000).missingCents, '2026-11', '2027-12')).toBe(131_878);
    expect(await octoberTotals(repo, ctx)).toEqual(BASE_TOTALS);

    // 6. Resgate de 4.100,00 em 07/10: recusado (ficaria -62,80).
    await expectCode(repo.addGoalMovement(key(), id, 'resgate', { amountCents: 410_000, occurredOn: TODAY, note: null }), 'saldo_da_meta_insuficiente', `dia=${TODAY}`);
    expect(firstNegativeDay(await repo.listGoalMovements(id), { op: 'add', kind: 'resgate', amountCents: 410_000, occurredOn: TODAY })).toBe(TODAY);
    expect(savedOn(await repo.listGoalMovements(id), TODAY) - 410_000).toBe(-6_280);

    // Guardado em outubro: 1.500,00 - 500,00 (o já guardado e a valorização não entram).
    expect(savedInMonth(await repo.listGoalMovementsInMonth(ctx, OCT), OCT)).toBe(100_000);
    expect(await octoberTotals(repo, ctx)).toEqual(BASE_TOTALS);
    repo.checkInvariants();
  });
});

describe('demonstração do Ciclo C', () => {
  it('reserva 15% e 0,9 mês; viagem 20% e R$ 480,00 por mês; totais de outubro e renda comprometida iguais', async () => {
    const repo = await createDemoRepository({ cards: false });
    const ctx = (await repo.getSpace())!.personalContextId;
    expect(await octoberTotals(repo, ctx)).toEqual(BASE_TOTALS);
    const goals = await repo.listGoals(ctx);
    expect(goals.map((g) => [g.goalType, g.name, g.savedCents, g.targetCents, g.status])).toEqual([
      ['emergencia', 'Reserva para imprevistos', 350_000, 2_250_000, 'ativa'],
      ['objetivo', 'Viagem de férias', 120_000, 600_000, 'ativa'],
    ]);
    const month = await repo.listGoalMovementsInMonth(ctx, OCT);
    const { reserve, active, closed } = organizeGoals(goals);
    expect(closed).toEqual([]);

    // Reserva: 3.500,00 de 22.500,00, 15%, 0,9 mês; P0 = novembro; 38 aportes de 500,00 → dezembro de 2029.
    expect(reserve!.essentialBaseCents).toBe(375_000);
    expect(reserveCardTexts(reserve!)).toEqual({
      amounts: 'R$ 3.500,00 de R$ 22.500,00',
      percent: '15%',
      coverage: 'Cobre 0,9 mês dos seus gastos essenciais',
      planned: 'Planejado: R$ 500,00 por mês',
      a11yLabel: 'Reserva para imprevistos: 15% da meta, R$ 3.500,00 de R$ 22.500,00.',
    });
    const rPlan = goalPlan(reserve!, month, DEMO_TODAY);
    expect(rPlan.firstProjectedMonth).toBe('2026-11');
    expect(rPlan.reachMonth).toBe('2029-12');
    expect(goalCardCaption(rPlan)).toBe('Planejado: R$ 500,00 por mês · chega lá em dezembro de 2029');

    // Viagem: 20%; sem aporte em outubro, P0 = outubro, n = 10 → R$ 480,00 por mês, chega em julho de 2027.
    const trip = active[0]!;
    const tPlan = goalPlan(trip, month, DEMO_TODAY);
    expect(tPlan.progress.percent).toBe(20);
    expect(tPlan.firstProjectedMonth).toBe('2026-10');
    expect(tPlan.deadline).toEqual({ month: '2027-07', months: 10, monthlyCents: 48_000 });
    expect(tPlan.reachMonth).toBe('2027-07');
    expect(goalCardCaption(tPlan)).toBe('Até julho de 2027 · R$ 480,00 por mês para chegar lá');
    expect(GOALS_TEXT.savedOfTarget(trip.savedCents, trip.targetCents)).toBe('R$ 1.200,00 de R$ 6.000,00');

    // Guardado em outubro (500,00) e planejado (980,00), fora do percentual.
    const saved = savedInMonth(month, OCT);
    const planned = plannedForGoals(goals);
    expect([saved, planned]).toEqual([50_000, 98_000]);
    const s = summarizeCommitted(await repo.listCommitments(ctx, OCT), ctx, OCT, DEMO_TODAY, await repo.listIncomeReferences(ctx));
    expect([s.committedCents, s.committedPermille, s.outsideCents]).toEqual([315_000, 525, 285_000]);
    expect(committedGoalLines(s, saved, planned)).toEqual({
      savedInMonthCents: 50_000,
      plannedCents: 98_000,
      outsideAfterPlannedCents: 187_000,
      saved: 'Guardado em metas em outubro: R$ 500,00',
      planned: 'Planejado para metas: R$ 980,00 por mês',
      outsideAfterPlanned: 'Fora dos compromissos depois do planejado: R$ 1.870,00',
      note: COMMITTED_TEXT.goalsNote,
    });
    expect(goalsMonthTexts(s, saved, OCT)).toEqual({
      outside: 'Fora dos compromissos em outubro: R$ 2.850,00',
      committed: '52,5% da renda de referência já tem destino.',
      saved: 'Guardado em outubro: R$ 500,00',
    });
    // Novembro: renda comprometida da B intacta (63,8%).
    const nov = summarizeCommitted(await repo.listCommitments(ctx, '2026-11'), ctx, '2026-11', DEMO_TODAY, await repo.listIncomeReferences(ctx));
    expect([nov.committedCents, nov.committedPermille]).toEqual([383_000, 638]);
    repo.checkInvariants();
  });

  it('linhas das metas: sem referência, sem plano, resgates maiores e planejado acima do que fica fora', async () => {
    const repo = await createDemoRepository({ cards: false });
    const ctx = (await repo.getSpace())!.personalContextId;
    const list = await repo.listCommitments(ctx, OCT);
    const s = summarizeCommitted(list, ctx, OCT, DEMO_TODAY, await repo.listIncomeReferences(ctx));
    const bare = summarizeCommitted(list, ctx, OCT, DEMO_TODAY, []);
    expect(committedGoalLines(bare, 50_000, 98_000)).toMatchObject({ outsideAfterPlannedCents: null, outsideAfterPlanned: null, planned: 'Planejado para metas: R$ 980,00 por mês' });
    expect(committedGoalLines(s, 0, 0)).toMatchObject({ planned: null, outsideAfterPlanned: null, saved: 'Guardado em metas em outubro: R$ 0,00' });
    expect(committedGoalLines(s, -20_000, 300_000)).toMatchObject({
      saved: 'Em outubro, os resgates de metas passaram os aportes em R$ 200,00.',
      outsideAfterPlannedCents: -15_000,
      outsideAfterPlanned: 'As contas do mês e o planejado para metas passam a renda de referência em R$ 150,00.',
    });
    expect(goalsMonthTexts(bare, 50_000, OCT)).toEqual({ outside: null, committed: null, saved: 'Guardado em outubro: R$ 500,00' });
    expect(goalsMonthTexts(null, -20_000, OCT).saved).toBe('Em outubro, os resgates passaram os aportes em R$ 200,00.');
  });

  it('prévias dos formulários', () => {
    expect(goalPreview({ targetCents: 600_000, savedCents: 120_000, targetMonth: '2027-07', plannedMonthlyCents: null }, TODAY)).toBe(
      'Para chegar até julho de 2027: R$ 480,00 por mês, sem contar rendimentos.',
    );
    // Reserva nova (sem aporte em outubro): P0 = outubro.
    expect(goalPreview({ targetCents: 2_250_000, savedCents: 350_000, targetMonth: null, plannedMonthlyCents: 50_000 }, TODAY)).toBe(
      'Com R$ 500,00 por mês, chega lá em novembro de 2029, sem contar rendimentos.',
    );
    // A reserva da demonstração (já houve aporte em outubro): dezembro de 2029.
    expect(
      goalPreview({ targetCents: 2_250_000, savedCents: 350_000, targetMonth: null, plannedMonthlyCents: 50_000 }, TODAY, [{ kind: 'aporte', occurredOn: '2026-10-06' }]),
    ).toBe('Com R$ 500,00 por mês, chega lá em dezembro de 2029, sem contar rendimentos.');
    expect(goalPreview({ targetCents: 600_000, savedCents: 600_000, targetMonth: '2027-07', plannedMonthlyCents: null }, TODAY)).toBe(GOALS_TEXT.previewReached);
    expect(goalPreview({ targetCents: 600_000, savedCents: 0, targetMonth: null, plannedMonthlyCents: null }, TODAY)).toBeNull();
    expect(GOALS_TEXT.reserve.result(2_250_000, 6, 375_000)).toBe('Valor da reserva: R$ 22.500,00 (6 × R$ 3.750,00)');
  });
});

describe('MemoryRepository: metas', () => {
  it('repetição: mesma chave e conteúdo devolve o estado atual; outro conteúdo ou outra ação, chave_reutilizada', async () => {
    const { repo, ctx } = await freshRepo();
    const k = key();
    const a = await repo.createGoal(k, ctx, goalInput({ initialCents: 120_000, initialOn: '2026-10-01' }));
    const b = await repo.createGoal(k, ctx, goalInput({ initialCents: 120_000, initialOn: '2026-10-01' }));
    expect(b.goal.id).toBe(a.goal.id);
    expect(b.movement!.id).toBe(a.movement!.id);
    expect(await repo.listGoals(ctx)).toHaveLength(1);
    // Nome com espaços nas pontas é aparado antes do hash, como no banco.
    expect((await repo.createGoal(k, ctx, goalInput({ name: ' Viagem de férias ', initialCents: 120_000, initialOn: '2026-10-01' }))).goal.id).toBe(a.goal.id);
    await expectCode(repo.createGoal(k, ctx, goalInput({ initialCents: 120_001, initialOn: '2026-10-01' })), 'chave_reutilizada');
    await expectCode(repo.addGoalMovement(k, a.goal.id, 'aporte', { amountCents: 100, occurredOn: TODAY, note: null }), 'chave_reutilizada');
    // Movimento: repetição devolve o mesmo movimento, sem outro.
    const mk = key();
    const m1 = await repo.addGoalMovement(mk, a.goal.id, 'aporte', { amountCents: 10_000, occurredOn: TODAY, note: ' 13º ' });
    const m2 = await repo.addGoalMovement(mk, a.goal.id, 'aporte', { amountCents: 10_000, occurredOn: TODAY, note: '13º' });
    expect(m2.movement!.id).toBe(m1.movement!.id);
    expect(m1.movement!.note).toBe('13º');
    expect(await repo.listGoalMovements(a.goal.id)).toHaveLength(2);
    expect(await repo.findGoalOperation(mk)).toEqual({ action: 'registrar_movimento_meta', goalId: a.goal.id, movementId: m1.movement!.id });
    expect(await repo.findGoalOperation(k)).toEqual({ action: 'criar_meta', goalId: a.goal.id, movementId: a.movement!.id });
    expect(await repo.findGoalOperation('nao-existe')).toBeNull();
    // Chave de meta não é operação de registro, conta a pagar ou série.
    expect(await repo.findOperation(k)).toBeNull();
    expect(await repo.findCommitmentOperation(k)).toBeNull();
    expect(await repo.findSeriesOperation(k)).toBeNull();
  });

  it('resposta perdida: a reconciliação encontra a meta gravada; falha antes não grava nada', async () => {
    const { repo, ctx } = await freshRepo();
    const k = key();
    repo.failNextWrite = 'antes';
    await expectCode(repo.createGoal(k, ctx, goalInput()), 'rede');
    expect(await repo.findGoalOperation(k)).toBeNull();
    expect(await repo.listGoals(ctx)).toEqual([]);
    repo.failNextWrite = 'depois';
    await expectCode(repo.createGoal(k, ctx, goalInput()), 'rede');
    const op = await repo.findGoalOperation(k);
    expect(op).toMatchObject({ action: 'criar_meta', movementId: null });
    expect((await repo.getGoal(op!.goalId))!.name).toBe('Viagem de férias');
  });

  it('versão: alterar e mudar situação conferem; movimento não sobe a versão da meta', async () => {
    const { repo, ctx } = await freshRepo();
    const { goal } = await repo.createGoal(key(), ctx, goalInput());
    await repo.addGoalMovement(key(), goal.id, 'aporte', { amountCents: 10_000, occurredOn: TODAY, note: null });
    expect((await repo.getGoal(goal.id))!.version).toBe(1);
    const up = await repo.updateGoal(key(), goal.id, 1, goalInput({ name: 'Viagem', plannedMonthlyCents: 48_000 }));
    expect(up.goal).toMatchObject({ name: 'Viagem', plannedMonthlyCents: 48_000, version: 2, savedCents: 10_000 });
    await expectCode(repo.updateGoal(key(), goal.id, 1, goalInput()), 'versao_desatualizada');
    await expectCode(repo.updateGoal(key(), goal.id, null as unknown as number, goalInput()), 'versao_desatualizada');
    await expectCode(repo.setGoalStatus(key(), goal.id, 1, 'concluida'), 'versao_desatualizada');
    await expectCode(repo.setGoalStatus(key(), goal.id, 2, 'pausada' as 'ativa'), 'situacao_invalida');
    const done = await repo.setGoalStatus(key(), goal.id, 2, 'concluida');
    expect(done.goal).toMatchObject({ status: 'concluida', version: 3 });
    // Meta concluída ainda recebe movimentos ("Você pode concluir ou continuar guardando").
    await repo.addGoalMovement(key(), goal.id, 'resgate', { amountCents: 10_000, occurredOn: TODAY, note: null });
    await expectCode(repo.updateGoal(key(), 'meta-x', 1, goalInput()), 'nao_encontrado');
    await expectCode(repo.deleteGoal(key(), goal.id, 2), 'versao_desatualizada');
  });

  it('validação na ordem do banco: sem_permissao, campos, saldo inicial e reserva_ja_existe', async () => {
    const { repo, ctx } = await freshRepo();
    await expectCode(repo.createGoal(key(), 'ctx-outro', goalInput()), 'sem_permissao');
    await expectCode(repo.createGoal(key(), ctx, goalInput({ name: '  ' })), 'nome_da_meta_invalido');
    await expectCode(repo.createGoal(key(), ctx, goalInput({ name: 'x'.repeat(41) })), 'nome_da_meta_invalido');
    await expectCode(repo.createGoal(key(), ctx, goalInput({ targetCents: 1_000_000_000 })), 'alvo_acima_do_limite');
    await expectCode(repo.createGoal(key(), ctx, goalInput({ targetCents: 0 })), 'valor_invalido');
    await expectCode(repo.createGoal(key(), ctx, goalInput({ targetMonth: '2026-09' })), 'prazo_invalido');
    await expectCode(repo.createGoal(key(), ctx, goalInput({ essentialMonths: 6 })), 'tipo_invalido');
    await expectCode(repo.createGoal(key(), ctx, goalInput({ initialCents: 100, initialOn: '2026-10-08' })), 'data_futura');
    await expectCode(repo.createGoal(key(), ctx, goalInput({ initialCents: 100, initialOn: null })), 'data_invalida');
    await expectCode(repo.createGoal(key(), ctx, goalInput({ initialCents: -1 })), 'saldo_inicial_invalido');
    await expectCode(repo.createGoal(key(), ctx, goalInput({ initialCents: 1_000_000_000, initialOn: TODAY })), 'saldo_inicial_invalido');
    await expectCode(repo.createGoal(key(), ctx, goalInput({ plannedMonthlyCents: 0 })), 'plano_invalido');
    await expectCode(repo.createGoal(key(), ctx, reserveInput({ essentialBaseSource: 'chute' as 'informado' })), 'origem_invalida');
    await expectCode(repo.createGoal(key(), ctx, reserveInput({ targetCents: 999 })), 'alvo_invalido');
    await expectCode(repo.createGoal(key(), ctx, reserveInput({ essentialBaseCents: 500_000_000, essentialMonths: 2 })), 'alvo_acima_do_limite');
    await expectCode(repo.createGoal(key(), ctx, reserveInput({ essentialMonths: 0 })), 'meses_invalidos');
    // Saldo inicial 0: meta sem movimento.
    const zero = await repo.createGoal(key(), ctx, goalInput({ initialCents: 0, initialOn: null }));
    expect([zero.movement, zero.goal.savedCents, zero.goal.lastMovementOn]).toEqual([null, 0, null]);
    // Reserva: o alvo é base × meses (targetCents nulo ou igual ao produto).
    const r = await repo.createGoal(key(), ctx, reserveInput({ targetCents: 2_250_000 }));
    expect(r.goal.targetCents).toBe(2_250_000);
    // Com uma reserva viva, outra é recusada depois da validação dos campos e do saldo inicial.
    await expectCode(repo.createGoal(key(), ctx, reserveInput({ name: '' })), 'nome_da_meta_invalido');
    await expectCode(repo.createGoal(key(), ctx, reserveInput({ initialCents: 100, initialOn: '2026-10-08' })), 'data_futura');
    await expectCode(repo.createGoal(key(), ctx, reserveInput()), 'reserva_ja_existe');
  });

  it('uma reserva não arquivada por contexto, inclusive ao reativar e ao mudar o tipo (G6)', async () => {
    const { repo, ctx } = await freshRepo();
    const first = (await repo.createGoal(key(), ctx, reserveInput())).goal;
    await expectCode(repo.createGoal(key(), ctx, reserveInput()), 'reserva_ja_existe');
    const archived = (await repo.setGoalStatus(key(), first.id, 1, 'arquivada')).goal;
    const second = (await repo.createGoal(key(), ctx, reserveInput({ essentialMonths: 3 }))).goal;
    expect(second.targetCents).toBe(1_125_000);
    await expectCode(repo.setGoalStatus(key(), first.id, archived.version, 'ativa'), 'reserva_ja_existe');
    await expectCode(repo.setGoalStatus(key(), first.id, archived.version, 'concluida'), 'reserva_ja_existe');
    // Uma meta comum não pode virar uma segunda reserva.
    const trip = (await repo.createGoal(key(), ctx, goalInput())).goal;
    await expectCode(repo.updateGoal(key(), trip.id, 1, reserveInput()), 'reserva_ja_existe');
    // A reserva concluída continua contando; excluída, libera.
    await repo.setGoalStatus(key(), second.id, 1, 'concluida');
    await expectCode(repo.setGoalStatus(key(), first.id, archived.version, 'ativa'), 'reserva_ja_existe');
    await repo.deleteGoal(key(), second.id, 2);
    const back = await repo.setGoalStatus(key(), first.id, archived.version, 'ativa');
    expect(back.goal.status).toBe('ativa');
    // Editar a própria reserva não conflita com ela mesma.
    const edited = await repo.updateGoal(key(), first.id, back.goal.version, reserveInput({ essentialMonths: 12 }));
    expect(edited.goal.targetCents).toBe(4_500_000);
    repo.checkInvariants();
  });

  it('meta arquivada não recebe, não altera nem exclui movimentos (G5); reativada, volta a receber', async () => {
    const { repo, ctx } = await freshRepo();
    const { goal, movement } = await repo.createGoal(key(), ctx, goalInput({ initialCents: 120_000, initialOn: '2026-10-01' }));
    const arch = await repo.setGoalStatus(key(), goal.id, 1, 'arquivada');
    await expectCode(repo.addGoalMovement(key(), goal.id, 'aporte', { amountCents: 100, occurredOn: TODAY, note: null }), 'meta_arquivada');
    await expectCode(repo.updateGoalMovement(key(), movement!.id, 1, { amountCents: 100, occurredOn: TODAY, note: null }), 'meta_arquivada');
    await expectCode(repo.deleteGoalMovement(key(), movement!.id, 1), 'meta_arquivada');
    // Os dados da meta continuam editáveis.
    const renamed = await repo.updateGoal(key(), goal.id, arch.goal.version, goalInput({ name: 'Viagem' }));
    await repo.setGoalStatus(key(), goal.id, renamed.goal.version, 'ativa');
    const dep = await repo.addGoalMovement(key(), goal.id, 'aporte', { amountCents: 100, occurredOn: TODAY, note: null });
    expect(dep.goal.savedCents).toBe(120_100);
  });

  it('movimentos: tipo, valor, data e observação; saldo_inicial só ao criar', async () => {
    const { repo, ctx } = await freshRepo();
    const { goal } = await repo.createGoal(key(), ctx, goalInput({ initialCents: 120_000, initialOn: '2026-10-01' }));
    const add = (kind: GoalMovementKind, amountCents: number, occurredOn: string, note: string | null = null) =>
      repo.addGoalMovement(key(), goal.id, kind, { amountCents, occurredOn, note });
    await expectCode(add('saldo_inicial', 100, TODAY), 'tipo_invalido');
    await expectCode(add('transferencia' as GoalMovementKind, 100, TODAY), 'tipo_invalido');
    await expectCode(add('aporte', 0, TODAY), 'valor_invalido');
    await expectCode(add('aporte', 1.5, TODAY), 'valor_invalido');
    await expectCode(add('aporte', 1_000_000_000, TODAY), 'valor_acima_do_limite');
    await expectCode(add('aporte', 100, '2026-10-32'), 'data_invalida');
    await expectCode(add('aporte', 100, '2026-10-08'), 'data_futura');
    await expectCode(add('aporte', 100, TODAY, 'x'.repeat(81)), 'observacao_longa');
    await expectCode(repo.addGoalMovement(key(), 'meta-x', 'aporte', { amountCents: 100, occurredOn: TODAY, note: null }), 'nao_encontrado');
    // Resgate antes do já guardado: dia negativo.
    await expectCode(add('resgate', 100, '2026-09-30'), 'saldo_da_meta_insuficiente', 'dia=2026-09-30');
    const income = await add('rendimento', 1_234, TODAY, 'Extrato de outubro');
    expect(income.goal).toMatchObject({ savedCents: 121_234, incomeCents: 1_234, lastMovementOn: TODAY });
    expect(await repo.listGoalMovements(goal.id)).toHaveLength(2);
  });

  it('alterar e excluir movimento conferem versão e o saldo dia a dia', async () => {
    const { repo, ctx } = await freshRepo();
    const { goal, movement: initial } = await repo.createGoal(key(), ctx, goalInput({ initialCents: 300_000, initialOn: '2026-10-01' }));
    const { movement: w } = await repo.addGoalMovement(key(), goal.id, 'resgate', { amountCents: 100_000, occurredOn: '2026-10-03', note: null });
    // Mudar a data do já guardado para depois do resgate: negativo em 03/10.
    await expectCode(
      repo.updateGoalMovement(key(), initial!.id, 1, { amountCents: 300_000, occurredOn: '2026-10-05', note: null }),
      'saldo_da_meta_insuficiente',
      'dia=2026-10-03',
    );
    await expectCode(repo.deleteGoalMovement(key(), initial!.id, 1), 'saldo_da_meta_insuficiente', 'dia=2026-10-03');
    await expectCode(repo.updateGoalMovement(key(), w!.id, 2, { amountCents: 1, occurredOn: '2026-10-03', note: null }), 'versao_desatualizada');
    await expectCode(repo.updateGoalMovement(key(), w!.id, 1, { amountCents: 1, occurredOn: '2026-10-08', note: null }), 'data_futura');
    // O já guardado ao criar pode ser corrigido (o tipo não muda).
    const fixed = await repo.updateGoalMovement(key(), initial!.id, 1, { amountCents: 250_000, occurredOn: '2026-10-01', note: 'Conta antiga' });
    expect(fixed.movement).toMatchObject({ kind: 'saldo_inicial', amountCents: 250_000, version: 2, note: 'Conta antiga' });
    expect(fixed.goal).toMatchObject({ savedCents: 150_000, version: 1 });
    const del = await repo.deleteGoalMovement(key(), w!.id, 1);
    expect(del.movement).toMatchObject({ id: w!.id, version: 2 });
    expect(del.goal.savedCents).toBe(250_000);
    await expectCode(repo.deleteGoalMovement(key(), w!.id, 2), 'nao_encontrado');
    await expectCode(repo.updateGoalMovement(key(), 'mov-x', 1, { amountCents: 1, occurredOn: TODAY, note: null }), 'nao_encontrado');
    repo.checkInvariants();
  });

  it('excluir meta exclui os movimentos vivos (G4); some de todas as leituras', async () => {
    const { repo, ctx } = await freshRepo();
    const { goal } = await repo.createGoal(key(), ctx, goalInput({ initialCents: 120_000, initialOn: '2026-10-01' }));
    await repo.addGoalMovement(key(), goal.id, 'aporte', { amountCents: 48_000, occurredOn: TODAY, note: null });
    const del = await repo.deleteGoal(key(), goal.id, 1);
    expect(del.goal).toMatchObject({ id: goal.id, version: 2, savedCents: 0 });
    expect(await repo.getGoal(goal.id)).toBeNull();
    expect(await repo.listGoals(ctx)).toEqual([]);
    expect(await repo.listGoalMovements(goal.id)).toEqual([]);
    expect(await repo.listGoalMovementsInMonth(ctx, OCT)).toEqual([]);
    await expectCode(repo.addGoalMovement(key(), goal.id, 'aporte', { amountCents: 100, occurredOn: TODAY, note: null }), 'nao_encontrado');
    repo.checkInvariants();
  });

  it('prazo que já passou continua editável enquanto não muda', async () => {
    const { repo, ctx, clock } = await freshRepo('2026-10-07');
    const { goal } = await repo.createGoal(key(), ctx, goalInput({ targetMonth: '2026-10' }));
    clock.today = '2026-11-15';
    const renamed = await repo.updateGoal(key(), goal.id, 1, goalInput({ name: 'Viagem curta', targetMonth: '2026-10' }));
    expect(renamed.goal.targetMonth).toBe('2026-10');
    await expectCode(repo.updateGoal(key(), goal.id, 2, goalInput({ targetMonth: '2026-09' })), 'prazo_invalido');
    const plan = goalPlan(renamed.goal, [], clock.today);
    expect(plan.deadline).toEqual({ month: '2026-10', months: 0, monthlyCents: null });
    expect(goalCardCaption(plan)).toBe('Prazo: outubro de 2026');
    expect(goalDetailTexts(renamed.goal, [], clock.today).deadline).toBe(
      'O prazo de outubro de 2026 chegou. Para ver quanto guardar por mês, escolha um novo prazo em Editar meta.',
    );
  });

  it('escritas de metas contam como anotação na atividade (D-030), como no gatilho do banco', async () => {
    const { repo, ctx, clock } = await freshRepo('2026-10-07');
    const { goal } = await repo.createGoal(key(), ctx, goalInput());
    expect((await repo.getReturnReviewState(ctx)).activity?.lastWriteOn).toBe('2026-10-07');
    clock.today = '2026-10-20';
    await repo.addGoalMovement(key(), goal.id, 'aporte', { amountCents: 100, occurredOn: '2026-10-20', note: null });
    expect((await repo.getReturnReviewState(ctx)).activity?.lastWriteOn).toBe('2026-10-20');
  });

  it('nenhuma escrita de meta mexe em registros, contas a pagar, séries ou renda de referência (G3)', async () => {
    const repo = await createDemoRepository({ cards: false });
    const ctx = (await repo.getSpace())!.personalContextId;
    const snapshot = async () =>
      JSON.stringify([
        await repo.listRecords(ctx, '2026-09'),
        await repo.listRecords(ctx, OCT),
        await repo.listCommitments(ctx, OCT),
        await repo.listCommitments(ctx, '2026-11'),
        await repo.listSeries(ctx),
        await repo.listIncomeReferences(ctx),
      ]);
    const before = await snapshot();
    const [reserve, trip] = await repo.listGoals(ctx);
    await repo.addGoalMovement(key(), reserve!.id, 'aporte', { amountCents: 100_000, occurredOn: TODAY, note: null });
    await repo.addGoalMovement(key(), trip!.id, 'resgate', { amountCents: 20_000, occurredOn: TODAY, note: null });
    await repo.updateGoal(key(), trip!.id, trip!.version, goalInput({ plannedMonthlyCents: 60_000 }));
    await repo.setGoalStatus(key(), reserve!.id, reserve!.version, 'concluida');
    await repo.deleteGoal(key(), trip!.id, trip!.version + 1);
    expect(await snapshot()).toBe(before);
    expect(await octoberTotals(repo, ctx)).toEqual(BASE_TOTALS);
  });

  it('invariantes G1, G2, G4, G6 e restrições de coluna; guardas de alteração', async () => {
    type Internals = {
      goals: Map<string, Record<string, unknown>>;
      goalMovements: Map<string, Record<string, unknown>>;
      checkTransitions(before: unknown): void;
    };
    const setup = async () => {
      const { repo, ctx } = await freshRepo();
      const r = await repo.createGoal(key(), ctx, reserveInput({ initialCents: 300_000, initialOn: '2026-10-01' }));
      return { repo, ctx, r, internals: repo as unknown as Internals };
    };
    const change = (map: Map<string, Record<string, unknown>>, id: string, over: Record<string, unknown>) => map.set(id, { ...map.get(id)!, ...over });

    const cases: [string, (i: Internals, goalId: string, movId: string) => void][] = [
      ['G1: resgate direto que deixa um dia negativo', (i, g, m) => i.goalMovements.set('mov-x', { ...i.goalMovements.get(m)!, id: 'mov-x', kind: 'resgate', amountCents: 300_001, goalId: g })],
      ['G2: movimento de outro contexto', (i, _g, m) => change(i.goalMovements, m, { contextId: 'ctx-outro' })],
      ['G4: meta excluída com movimento vivo', (i, g) => change(i.goals, g, { deletedAt: '2026-10-07T00:00:00.000Z' })],
      ['G6: duas reservas não arquivadas', (i, g) => i.goals.set('meta-x', { ...i.goals.get(g)!, id: 'meta-x' })],
      ['alvo da reserva diferente de base × meses', (i, g) => change(i.goals, g, { targetCents: 2_250_001 })],
      ['meta comum com base de reserva', (i, g) => change(i.goals, g, { goalType: 'objetivo' })],
      ['nome com espaço nas pontas', (i, g) => change(i.goals, g, { name: ' Reserva' })],
      ['dois já guardados ao criar', (i, g, m) => i.goalMovements.set('mov-y', { ...i.goalMovements.get(m)!, id: 'mov-y', goalId: g })],
      ['movimento de valor zero', (i, _g, m) => change(i.goalMovements, m, { amountCents: 0 })],
      ['observação vazia', (i, _g, m) => change(i.goalMovements, m, { note: '' })],
    ];
    for (const [name, mutate] of cases) {
      const { repo, r, internals } = await setup();
      repo.checkInvariants();
      mutate(internals, r.goal.id, r.movement!.id);
      expect(() => repo.checkInvariants(), name).toThrow('meta_inconsistente');
    }
    // Guardas: tipo do movimento e contexto da meta não mudam; excluído não volta; meta arquivada sem movimento novo.
    const { repo, r, internals } = await setup();
    const snap = () => ({ commitments: new Map(), seriesById: new Map(), terms: new Map(), goals: new Map(internals.goals), goalMovements: new Map(internals.goalMovements) });
    let before = snap();
    change(internals.goalMovements, r.movement!.id, { kind: 'aporte', version: 2 });
    expect(() => internals.checkTransitions(before)).toThrow('campo_imutavel');
    change(internals.goalMovements, r.movement!.id, { kind: 'saldo_inicial', version: 1 });
    before = snap();
    change(internals.goals, r.goal.id, { contextId: 'ctx-outro', version: 2 });
    expect(() => internals.checkTransitions(before)).toThrow('campo_imutavel');
    change(internals.goals, r.goal.id, { contextId: r.goal.contextId, version: 1, status: 'arquivada' });
    before = snap();
    internals.goalMovements.set('mov-z', { ...internals.goalMovements.get(r.movement!.id)!, id: 'mov-z', kind: 'aporte' });
    expect(() => internals.checkTransitions(before)).toThrow('campo_imutavel');
    internals.goalMovements.delete('mov-z');
    change(internals.goals, r.goal.id, { status: 'ativa' });
    repo.checkInvariants();
  });
});

describe('Metas sem reserva (D-039): o botão "Calcular minha reserva" fica à vista em 360 × 640', () => {
  it('o texto do card vazio tem uma ou duas linhas e o botão vem logo depois', () => {
    // Em 360 px de largura cabem cerca de 38 caracteres por linha dentro do card azul: até cerca de 80 caracteres são duas linhas (o e2e mede o resultado).
    expect(GOALS_TEXT.reserveEmpty.length).toBeLessThanOrEqual(90);
    expect(GOALS_TEXT.reserveEmpty).toBe('Cobre imprevistos sem recorrer a crédito. O valor sai dos seus gastos essenciais.');
    expect(GOALS_TEXT.reserveCalculate).toBe('Calcular minha reserva');
  });
});
