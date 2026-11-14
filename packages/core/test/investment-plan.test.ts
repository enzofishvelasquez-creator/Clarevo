import { describe, expect, it } from 'vitest';
import {
  EMPTY_INVESTMENT_DETAILS,
  INVESTMENT_GOAL_TEXT,
  INVESTMENT_PLAN_TEXT,
  MemoryRepository,
  NO_ROUTINE_REMINDERS,
  ROUTINE_REMINDER_KINDS,
  ROUTINE_REMINDER_TEXT,
  investmentDepositHistory,
  investmentDepositsInMonth,
  investmentErrorText,
  investmentPlanError,
  investmentPlanLine,
  investmentSaveErrorText,
  isRepoError,
  linkedInvestmentsSummary,
  parseRoutineReminderChoices,
  routineReminderPlan,
  validateInvestmentPlanText,
  type Investment,
  type InvestmentMovementKind,
  type NewGoalInput,
} from '../src';

// Pessoa e valores FICTÍCIOS.
const TODAY = '2026-11-14';
const mv = (kind: InvestmentMovementKind, amountCents: number, occurredOn: string) => ({ kind, amountCents, occurredOn });
const inv = (p: Partial<Investment> & { id: string }): Investment => ({
  contextId: 'ctx',
  name: p.id,
  kind: 'renda_fixa',
  status: 'ativo',
  createdBy: 'p',
  version: 1,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  depositsCents: 0,
  withdrawalsCents: 0,
  incomeCents: 0,
  valueCents: 0,
  lastValueOn: null,
  firstMovementOn: null,
  goalId: null,
  ...EMPTY_INVESTMENT_DETAILS,
  ...p,
});
const noDash = (s: string) => expect(s).not.toMatch(/[–—]/);
const allTexts = (o: unknown): string[] =>
  typeof o === 'string' ? [o] : typeof o === 'object' && o !== null ? Object.values(o).flatMap(allTexts) : [];

describe('plano de aportes (D-099, item 12): contas e textos', () => {
  const list = [
    mv('aporte', 30_000, '2026-11-03'),
    mv('aporte', 5_000, '2026-11-14'),
    mv('resgate', 10_000, '2026-11-05'),
    mv('rendimento', 1_000, '2026-11-06'),
    mv('valor', 900_000, '2026-11-10'),
    mv('aporte', 45_000, '2026-10-31'),
    mv('aporte', 20_000, '2026-06-01'),
  ];

  it('aportado do mês: só aportes com data no mês (resgate, rendimento e valor ficam fora)', () => {
    expect(investmentDepositsInMonth(list, '2026-11')).toBe(35_000);
    expect(investmentDepositsInMonth(list, '2026-10')).toBe(45_000);
    expect(investmentDepositsInMonth([], '2026-11')).toBe(0);
  });

  it('linha do card: "Aportado em novembro: R$ 350,00. Seu plano: R$ 500,00."; sem plano, nada', () => {
    const plan = { contextId: 'ctx', plannedMonthlyCents: 50_000, version: 1, createdAt: '', updatedAt: '' };
    expect(investmentPlanLine(plan, list, TODAY)).toBe('Aportado em novembro: R$ 350,00. Seu plano: R$ 500,00.');
    expect(investmentPlanLine(null, list, TODAY)).toBeNull();
    // Acima do plano: o mesmo tom, sem parabéns nem alerta.
    expect(investmentPlanLine({ ...plan, plannedMonthlyCents: 10_000 }, list, TODAY)).toBe('Aportado em novembro: R$ 350,00. Seu plano: R$ 100,00.');
  });

  it('histórico: o mês de hoje (até agora) e os cinco anteriores, do mais recente ao mais antigo', () => {
    const h = investmentDepositHistory(list, TODAY);
    expect(h.map((x) => [x.month, x.depositedCents, x.current])).toEqual([
      ['2026-11', 35_000, true],
      ['2026-10', 45_000, false],
      ['2026-09', 0, false],
      ['2026-08', 0, false],
      ['2026-07', 0, false],
      ['2026-06', 20_000, false],
    ]);
    expect(INVESTMENT_PLAN_TEXT.historyLine('2026-11', 35_000, true)).toBe('Novembro (até agora): R$ 350,00');
    expect(INVESTMENT_PLAN_TEXT.historyLine('2026-10', 45_000, false)).toBe('Outubro: R$ 450,00');
    // Virada do ano.
    expect(investmentDepositHistory([], '2027-01-10', 2).map((x) => x.month)).toEqual(['2027-01', '2026-12']);
  });

  it('valor digitado: vazio, zero, negativo e acima da faixa são erros; o resto vira centavos', () => {
    expect(validateInvestmentPlanText('')).toEqual({ ok: false, error: 'Informe um valor.' });
    expect(validateInvestmentPlanText('0')).toEqual({ ok: false, error: 'Informe um valor válido.' });
    expect(validateInvestmentPlanText('abc')).toEqual({ ok: false, error: 'Informe um valor válido.' });
    expect(validateInvestmentPlanText('10.000.000,00')).toEqual({ ok: false, error: 'Informe um valor válido.' });
    expect(validateInvestmentPlanText('500,00')).toEqual({ ok: true, cents: 50_000 });
    expect(validateInvestmentPlanText('1.250,50')).toEqual({ ok: true, cents: 125_050 });
    expect(investmentPlanError(null)).toBeNull();
    expect(investmentPlanError(1)).toBeNull();
    expect(investmentPlanError(999_999_999)).toBeNull();
    expect(investmentPlanError(0)).toBe('valor_invalido');
    expect(investmentPlanError(1_000_000_000)).toBe('valor_invalido');
    expect(investmentPlanError(1.5)).toBe('valor_invalido');
  });

  it('textos: sem travessão, sem cobrança e sem "você deveria"', () => {
    const texts = [...allTexts(INVESTMENT_PLAN_TEXT), ...allTexts(INVESTMENT_GOAL_TEXT), INVESTMENT_PLAN_TEXT.monthLine('2026-11', 1, 2)];
    for (const t of texts) {
      noDash(t);
      expect(t).not.toMatch(/fazer sentido|deveria|atrasad|meta batida|parab[ée]ns|sequ[êe]ncia/i);
    }
  });
});

describe('investimento ligado à reserva ou a uma meta (D-099, item 13, fase 1)', () => {
  it('soma os ativos ligados, o resgate em até 1 dia pela ficha e os sem liquidez; encerrados e de outras metas ficam fora', () => {
    const list = [
      inv({ id: 'caixinha', name: 'Caixinha', goalId: 'reserva', valueCents: 600_000, liquidity: 'diaria' }),
      inv({ id: 'cdb', name: 'CDB do banco', goalId: 'reserva', valueCents: 200_000, liquidity: 'no_vencimento', maturityOn: '2027-03-15' }),
      inv({ id: 'tesouro', name: 'Tesouro', goalId: 'reserva', valueCents: 100_000, liquidity: 'dias', liquidityDays: 1 }),
      inv({ id: 'acoes', name: 'Ações', goalId: 'reserva', valueCents: 50_000 }),
      inv({ id: 'velho', name: 'Antigo', goalId: 'reserva', valueCents: 70_000, status: 'encerrado' }),
      inv({ id: 'viagem', name: 'Viagem', goalId: 'viagem', valueCents: 90_000, liquidity: 'diaria' }),
      inv({ id: 'solto', name: 'Solto', valueCents: 10_000, liquidity: 'diaria' }),
    ];
    const s = linkedInvestmentsSummary('reserva', list, TODAY)!;
    expect(s.items.map((i) => i.name)).toEqual(['Ações', 'Caixinha', 'CDB do banco', 'Tesouro']);
    expect(s.valueCents).toBe(950_000);
    expect(s.quickCents).toBe(700_000);
    expect(s.unknownLiquidity).toBe(1);
    expect(linkedInvestmentsSummary('nenhuma', list, TODAY)).toBeNull();
    expect(INVESTMENT_GOAL_TEXT.totalLine(950_000, 4)).toBe('Valor dos investimentos ligados: R$ 9.500,00 (4 investimentos).');
    expect(INVESTMENT_GOAL_TEXT.totalLine(1_000, 1)).toBe('Valor dos investimentos ligados: R$ 10,00 (1 investimento).');
    expect(INVESTMENT_GOAL_TEXT.quickLine(700_000)).toBe('Com resgate em até 1 dia, pela ficha: R$ 7.000,00.');
    expect(INVESTMENT_GOAL_TEXT.unknownLine(1)).toBe('1 investimento ligado está sem a liquidez na ficha.');
    expect(INVESTMENT_GOAL_TEXT.unknownLine(2)).toBe('2 investimentos ligados estão sem a liquidez na ficha.');
    expect(INVESTMENT_GOAL_TEXT.fichaLine('Viagem')).toBe('Para: Viagem');
    expect(investmentSaveErrorText('meta_invalida')).toBe('Esta meta não pode mais ser escolhida. Escolha outra ou deixe sem meta.');
    expect(investmentSaveErrorText('nome_invalido')).toBe(investmentErrorText('nome_invalido'));
  });
});

describe('MemoryRepository: plano de aportes e meta ligada (como a 0036)', () => {
  const goal = (p: Partial<NewGoalInput> & { name: string }): NewGoalInput => ({
    goalType: 'objetivo',
    targetCents: 500_000,
    targetMonth: null,
    plannedMonthlyCents: null,
    essentialBaseCents: null,
    essentialMonths: null,
    essentialBaseSource: null,
    initialCents: null,
    initialOn: null,
    ...p,
  });
  const setup = async () => {
    const repo = new MemoryRepository({ actorId: 'pessoa-teste', displayName: 'Pessoa de teste', today: () => TODAY });
    const space = await repo.ensurePersonalSpace('Conta principal');
    return { repo, ctx: space.personalContextId };
  };
  const code = async (p: Promise<unknown>) => {
    try {
      await p;
    } catch (e) {
      return isRepoError(e) ? e.code : 'outro';
    }
    return 'passou';
  };

  it('plano: definir, trocar (versão seguinte), repetir a chave, tirar; Família e valor fora da faixa recusam', async () => {
    const { repo, ctx } = await setup();
    expect(await repo.getInvestmentPlan(ctx)).toBeNull();
    const p1 = await repo.setInvestmentPlan('k1', ctx, 50_000);
    expect(p1).toMatchObject({ contextId: ctx, plannedMonthlyCents: 50_000, version: 1 });
    expect(await repo.setInvestmentPlan('k1', ctx, 50_000)).toEqual(p1);
    expect(await code(repo.setInvestmentPlan('k1', ctx, 60_000))).toBe('chave_reutilizada');
    expect(await repo.setInvestmentPlan('k2', ctx, 75_050)).toMatchObject({ plannedMonthlyCents: 75_050, version: 2 });
    expect(await code(repo.setInvestmentPlan('k3', ctx, 0))).toBe('valor_invalido');
    expect(await code(repo.setInvestmentPlan('k4', ctx, 1_000_000_000))).toBe('valor_invalido');
    expect(await code(repo.setInvestmentPlan('k5', 'outro', 100))).toBe('nao_encontrado');
    const fam = await repo.createFamily('kf', 'Casa de teste');
    expect(await code(repo.setInvestmentPlan('k6', fam.context.id, 100))).toBe('contexto_invalido');
    expect(await repo.setInvestmentPlan('k7', ctx, null)).toBeNull();
    expect(await repo.getInvestmentPlan(ctx)).toBeNull();
    expect(await repo.setInvestmentPlan('k8', ctx, 20_000)).toMatchObject({ version: 1 });
  });

  it('meta ligada: criar com a meta; arquivada, de outro contexto ou inexistente recusam; editar sem a ficha mantém', async () => {
    const { repo, ctx } = await setup();
    const reserva = (await repo.createGoal('g1', ctx, goal({ goalType: 'emergencia', name: 'Reserva', targetCents: null, essentialBaseCents: 300_000, essentialMonths: 6, essentialBaseSource: 'informado' }))).goal;
    const viagem = (await repo.createGoal('g2', ctx, goal({ name: 'Viagem' }))).goal;
    const velha = (await repo.createGoal('g3', ctx, goal({ name: 'Bicicleta' }))).goal;
    await repo.setGoalStatus('g4', velha.id, velha.version, 'arquivada');
    const fam = await repo.createFamily('kf', 'Casa de teste');
    const sofa = (await repo.createGoal('g5', fam.context.id, goal({ name: 'Sofá' }))).goal;

    const w = await repo.createInvestment('i1', ctx, { name: 'Caixinha', kind: 'renda_fixa', investedCents: 300_000, startOn: '2026-10-01', currentCents: null, details: { ...EMPTY_INVESTMENT_DETAILS, liquidity: 'diaria' }, goalId: reserva.id });
    const id = w.investment!.id;
    expect(w.investment!.goalId).toBe(reserva.id);
    for (const goalId of [velha.id, sofa.id, 'nao-existe']) {
      expect(await code(repo.createInvestment(`x-${goalId}`, ctx, { name: 'X', kind: 'acoes', investedCents: 100, startOn: TODAY, currentCents: null, details: EMPTY_INVESTMENT_DETAILS, goalId }))).toBe('meta_invalida');
    }
    // Sem a ficha, a meta enviada não vale (como o banco: a meta viaja na ficha).
    expect((await repo.createInvestment('i2', ctx, { name: 'Sem ficha', kind: 'acoes', investedCents: 100, startOn: TODAY, currentCents: null, goalId: viagem.id })).investment!.goalId).toBeNull();

    // Editar com a ficha troca a meta; sem a ficha ou sem o campo na ficha (versões anteriores do app), fica; null tira.
    let cur = (await repo.updateInvestment('e1', id, 1, { name: 'Caixinha', kind: 'renda_fixa', details: { ...EMPTY_INVESTMENT_DETAILS, liquidity: 'diaria' }, goalId: viagem.id })).investment!;
    expect(cur.goalId).toBe(viagem.id);
    cur = (await repo.updateInvestment('e2', id, cur.version, { name: 'Caixinha da viagem', kind: 'renda_fixa' })).investment!;
    expect(cur.goalId).toBe(viagem.id);
    cur = (await repo.updateInvestment('e2b', id, cur.version, { name: 'Caixinha', kind: 'renda_fixa', details: EMPTY_INVESTMENT_DETAILS })).investment!;
    expect(cur.goalId).toBe(viagem.id);
    cur = (await repo.updateInvestment('e3', id, cur.version, { name: 'Caixinha', kind: 'renda_fixa', details: EMPTY_INVESTMENT_DETAILS, goalId: null })).investment!;
    expect(cur.goalId).toBeNull();
    cur = (await repo.updateInvestment('e4', id, cur.version, { name: 'Caixinha', kind: 'renda_fixa', details: EMPTY_INVESTMENT_DETAILS, goalId: viagem.id })).investment!;

    // Meta excluída: a lista mostra nenhuma; editar sem a ficha tira; escolher de novo recusa.
    const v = (await repo.getGoal(viagem.id))!;
    await repo.deleteGoal('g6', viagem.id, v.version);
    expect((await repo.getInvestment(id))!.goalId).toBeNull();
    cur = (await repo.updateInvestment('e5', id, cur.version, { name: 'Caixinha', kind: 'renda_fixa' })).investment!;
    expect(cur.goalId).toBeNull();
    expect(await code(repo.updateInvestment('e6', id, cur.version, { name: 'Caixinha', kind: 'renda_fixa', details: EMPTY_INVESTMENT_DETAILS, goalId: viagem.id }))).toBe('meta_invalida');
  });
});

describe('lembrete do aporte nos investimentos (D-099, item 12)', () => {
  const ONLY = { ...NO_ROUTINE_REMINDERS, aporte_investimentos: true };
  it('no dia escolhido, só com plano; o deste mês sai se já houve aporte; toque abre a aba Investir', () => {
    expect(ROUTINE_REMINDER_KINDS).toContain('aporte_investimentos');
    const plan = routineReminderPlan(ONLY, [], null, '2026-11-03', 20, { investmentDeposit: { day: 5, hasPlan: true, depositThisMonth: false } });
    expect(plan.map((i) => [i.id, i.date, i.title, i.body, i.route])).toEqual([
      ['clarevo-lembrete-rotina-aporte_investimentos-2026-11', '2026-11-05', 'Investimentos', ROUTINE_REMINDER_TEXT.kinds.aporte_investimentos.body, '/investimentos'],
      ['clarevo-lembrete-rotina-aporte_investimentos-2026-12', '2026-12-05', 'Investimentos', ROUTINE_REMINDER_TEXT.kinds.aporte_investimentos.body, '/investimentos'],
    ]);
    expect(routineReminderPlan(ONLY, [], null, '2026-11-03', 20, { investmentDeposit: { day: 5, hasPlan: true, depositThisMonth: true } }).map((i) => i.date)).toEqual(['2026-12-05']);
    expect(routineReminderPlan(ONLY, [], null, '2026-11-03', 20, { investmentDeposit: { day: 5, hasPlan: false, depositThisMonth: false } })).toEqual([]);
    expect(routineReminderPlan(ONLY, [], null, '2026-11-03', 20, {})).toEqual([]);
    expect(parseRoutineReminderChoices({ aporte_investimentos: true })).toEqual(ONLY);
    for (const t of Object.values(ROUTINE_REMINDER_TEXT.kinds.aporte_investimentos)) noDash(t);
    expect(ROUTINE_REMINDER_TEXT.kinds.aporte_investimentos.body).not.toMatch(/R\$|\d/);
  });
});
