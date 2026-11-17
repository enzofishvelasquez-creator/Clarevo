import { describe, expect, it } from 'vitest';
import {
  DETAILS_TEXT,
  EMPTY_DETAILS_DRAFT,
  EMPTY_INVESTMENT_DETAILS,
  ESTIMATE_PREMISE_TEXT,
  GOAL_LINK_TEXT,
  HISTORY_TEXT,
  INFORME_TEXT,
  INVESTMENT_GOAL_TEXT,
  INVESTMENT_REMINDER_TEXT,
  KIND_FORM_HINT,
  LIQUIDITY_EXPLANATION,
  MOVEMENT_GOAL_TEXT,
  NET_INCOME_TEXT,
  ROUTINE_REMINDER_TEXT,
  TAX_TEXT,
  VALUE_DATE_TEXT,
  VALUE_SOURCE_NOTE,
  applyInvestmentReminderHolds,
  asksGoalOnMovement,
  canUseInvestmentsValue,
  currentRateBp,
  declarationInforme,
  defaultInformeYear,
  detailReminder,
  detailsEmpty,
  detailsToDraft,
  dueItems,
  estimateNetIncome,
  estimateRegressiveNet,
  estimateValueByRate,
  estimateValueWithRateStep,
  guaranteeExplanation,
  informeIncomeGroup,
  investmentDetailsError,
  investmentDetailsErrorText,
  investmentHistory,
  isTopicPublished,
  lastValueMovement,
  netIncomeLines,
  parseInvestmentReminderHolds,
  pauseReminder,
  rateSummaryWithStep,
  reminderHoldState,
  resumeReminder,
  routineReminderPlan,
  snoozeReminder,
  snoozedReminderBody,
  taxExplanationLink,
  validateDetailsDraft,
  valueDateCaption,
  valueSourcePhrase,
  valueUpdateDue,
  type Investment,
  type InvestmentDetails,
  type InvestmentMovementKind,
  type MarketIndices,
  type RoutineReminderItem,
} from '../src';

const TODAY = '2026-11-17';
const mv = (kind: InvestmentMovementKind, amountCents: number, occurredOn: string, extra: Partial<{ investmentId: string; incomeKind: 'juros' | 'dividendo' | 'jcp' | 'fii' | 'outro' | null; note: string | null; createdAt: string }> = {}) => ({
  id: `${kind}-${occurredOn}-${amountCents}`,
  kind,
  amountCents,
  occurredOn,
  investmentId: extra.investmentId ?? 'a',
  incomeKind: extra.incomeKind ?? null,
  note: extra.note ?? null,
  createdAt: extra.createdAt,
});
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
const d = (p: Partial<InvestmentDetails>): InvestmentDetails => ({ ...EMPTY_INVESTMENT_DETAILS, ...p });
const flat = (v: number): Record<string, number> => {
  const out: Record<string, number> = {};
  for (let y = 2025; y <= 2027; y += 1) for (let m = 1; m <= 12; m += 1) out[`${y}-${String(m).padStart(2, '0')}`] = v;
  return out;
};
const indices: MarketIndices = { cdi: flat(0.9), ipca: flat(0.35), selic: flat(0.89), poupanca: flat(0.6), fetchedOn: TODAY, example: false };
/** Regras de texto: sem travessão nem meia-risca, sem "fazer sentido", sem recomendação nem ranking. */
const textRules = (s: string) => {
  expect(s).not.toMatch(/[–—]/);
  expect(s).not.toMatch(/faz(er|endo)?\s+sentido/i);
  expect(s).not.toMatch(/recomend|melhor rendimento|invista|aplique/i);
};

describe('taxa com data de fim, condição e descrição (D-104, itens 12 e 13)', () => {
  const step = { indexKind: 'cdi' as const, rateBp: 12000, rateUntil: '2027-03-31', rateAfterBp: 10000 };

  it('a ficha aceita o par data de fim e taxa de depois, só com taxa e nos limites da forma de render', () => {
    expect(investmentDetailsError('renda_fixa', d(step))).toBeNull();
    expect(investmentDetailsError('renda_fixa', d({ ...step, rateAfterBp: null }))).toBe('taxa_condicional_invalida');
    expect(investmentDetailsError('renda_fixa', d({ ...step, rateUntil: null }))).toBe('taxa_condicional_invalida');
    expect(investmentDetailsError('renda_fixa', d({ ...step, rateAfterBp: 0 }))).toBe('taxa_condicional_invalida');
    expect(investmentDetailsError('renda_fixa', d({ ...step, rateUntil: '2101-01-01' }))).toBe('taxa_condicional_invalida');
    expect(investmentDetailsError('renda_fixa', d({ indexKind: 'prefixado', rateBp: 1200, rateUntil: '2027-01-01', rateAfterBp: 10001 }))).toBe('taxa_condicional_invalida');
    expect(investmentDetailsError('renda_fixa', d({ indexKind: 'ipca', rateBp: 600, rateUntil: '2027-01-01', rateAfterBp: -100 }))).toBeNull();
    expect(investmentDetailsError('renda_fixa', d({ indexKind: 'poupanca', rateUntil: '2027-01-01', rateAfterBp: 100 }))).toBe('taxa_condicional_invalida');
    // A ficha de antes vem primeiro (a mesma ordem do banco).
    expect(investmentDetailsError('renda_fixa', d({ ...step, rateBp: 0 }))).toBe('taxa_invalida');
  });

  it('condição só com taxa, até 60 caracteres e sem espaços sobrando; descrição em qualquer tipo, até 120', () => {
    expect(investmentDetailsError('renda_fixa', d({ indexKind: 'cdi', rateBp: 11000, rateCondition: 'com aporte mensal' }))).toBeNull();
    expect(investmentDetailsError('renda_fixa', d({ indexKind: 'variavel', rateCondition: 'x' }))).toBe('condicao_invalida');
    expect(investmentDetailsError('renda_fixa', d({ indexKind: 'cdi', rateBp: 11000, rateCondition: 'a'.repeat(61) }))).toBe('condicao_invalida');
    expect(investmentDetailsError('renda_fixa', d({ indexKind: 'cdi', rateBp: 11000, rateCondition: ' x' }))).toBe('condicao_invalida');
    expect(investmentDetailsError('outro', d({ description: 'Carta de crédito do carro' }))).toBeNull();
    expect(investmentDetailsError('outro', d({ description: 'b'.repeat(121) }))).toBe('descricao_investimento_invalida');
    expect(investmentDetailsError('outro', d({ description: 'a  b' }))).toBe('descricao_investimento_invalida');
    for (const code of ['taxa_condicional_invalida', 'condicao_invalida', 'descricao_investimento_invalida']) expect(investmentDetailsErrorText(code)).toBeTruthy();
  });

  it('ficha de versão anterior (sem os campos novos) continua válida e vazia conta como vazia', () => {
    const { rateUntil: _a, rateAfterBp: _b, rateCondition: _c, description: _d, ...old } = EMPTY_INVESTMENT_DETAILS;
    expect(investmentDetailsError('renda_fixa', old as InvestmentDetails)).toBeNull();
    expect(detailsEmpty(old as InvestmentDetails)).toBe(true);
    expect(detailsEmpty({ ...(old as InvestmentDetails), description: undefined })).toBe(true);
    expect(detailsEmpty(d({ description: 'x' }))).toBe(false);
  });

  it('o rascunho: "A taxa muda numa data" pede as duas, a condição e a descrição saem normalizadas; ida e volta pelo rascunho', () => {
    const draft = { ...EMPTY_DETAILS_DRAFT, indexKind: 'cdi' as const, rateText: '120', rateStep: true, rateUntilText: '', rateAfterText: '' };
    const bad = validateDetailsDraft('renda_fixa', draft);
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.errors).toEqual({ rateUntilText: DETAILS_TEXT.errors.rateUntilEmpty, rateAfterText: DETAILS_TEXT.errors.rateAfterEmpty });
    const good = validateDetailsDraft('renda_fixa', { ...draft, rateUntilText: '31/03/2027', rateAfterText: '100', rateConditionText: '  para  saldo novo ', descriptionText: ' Bônus  do ano ' });
    expect(good).toEqual({ ok: true, details: expect.objectContaining({ rateBp: 12000, rateUntil: '2027-03-31', rateAfterBp: 10000, rateCondition: 'para saldo novo', description: 'Bônus do ano' }) });
    if (good.ok) {
      const back = detailsToDraft(good.details);
      expect(back).toMatchObject({ rateStep: true, rateUntilText: '31/03/2027', rateAfterText: '100', rateConditionText: 'para saldo novo', descriptionText: 'Bônus do ano' });
    }
    // Sem a caixa marcada, ou com a forma de render sem taxa: a data e a taxa de depois caem fora sem erro.
    const off = validateDetailsDraft('renda_fixa', { ...draft, rateStep: false, rateUntilText: '31/03/2027', rateAfterText: '100' });
    expect(off.ok && off.details.rateUntil === null && off.details.rateAfterBp === null).toBe(true);
    const variable = validateDetailsDraft('renda_fixa', { ...draft, indexKind: 'variavel', rateConditionText: 'x' });
    expect(variable.ok && variable.details.rateCondition === null && variable.details.rateUntil === null).toBe(true);
    const long = validateDetailsDraft('outro', { ...EMPTY_DETAILS_DRAFT, descriptionText: 'x'.repeat(121) });
    expect(long.ok).toBe(false);
  });

  it('o texto da taxa com a data de fim e a taxa que vale no dia', () => {
    expect(rateSummaryWithStep(step, '2026-11-17')).toBe('120% do CDI até 31/03/2027, depois 100% do CDI');
    expect(rateSummaryWithStep(step, '2027-03-31')).toBe('120% do CDI até 31/03/2027, depois 100% do CDI');
    expect(rateSummaryWithStep(step, '2027-04-01')).toBe('100% do CDI desde 01/04/2027 (antes, 120% do CDI até 31/03/2027)');
    expect(rateSummaryWithStep({ indexKind: 'selic', rateBp: 10, rateUntil: '2026-12-31', rateAfterBp: 0 }, TODAY)).toBe('Selic mais 0,1% ao ano até 31/12/2026, depois Selic');
    expect(rateSummaryWithStep({ indexKind: 'cdi', rateBp: 11000, rateUntil: null, rateAfterBp: null }, TODAY)).toBe('110% do CDI');
    expect(currentRateBp(step, '2027-03-31')).toBe(12000);
    expect(currentRateBp(step, '2027-04-01')).toBe(10000);
  });
});

describe('valor pela taxa contratada com a mudança de taxa (D-104, item 13) e a premissa (item 4)', () => {
  const m = [mv('aporte', 1_000_000, '2026-09-01')];
  const step = { indexKind: 'cdi' as const, rateBp: 12000, rateUntil: '2026-09-30', rateAfterBp: 10000 };

  it('antes da data de fim, a estimativa de sempre; sem data de fim, igual', () => {
    const plain = estimateValueByRate({ indexKind: 'cdi', rateBp: 12000 }, m, indices, '2026-09-20');
    expect(estimateValueWithRateStep({ ...step, rateUntil: '2026-12-31' }, m, indices, '2026-09-20')).toEqual({ ...plain, stepApplied: false });
    expect(estimateValueWithRateStep({ indexKind: 'cdi', rateBp: 12000, rateUntil: null, rateAfterBp: null }, m, indices, '2026-09-20')).toEqual({ ...plain, stepApplied: false });
  });

  it('depois da data de fim: a taxa contratada até a data e a de depois a partir do dia seguinte', () => {
    const first = estimateValueByRate({ indexKind: 'cdi', rateBp: 12000 }, m, indices, '2026-10-01')!;
    const second = estimateValueByRate({ indexKind: 'cdi', rateBp: 10000 }, [mv('valor', first.valueCents, '2026-10-01')], indices, '2026-11-02')!;
    const e = estimateValueWithRateStep(step, m, indices, '2026-11-02')!;
    expect(e).toMatchObject({ valueCents: second.valueCents, stepApplied: true, baseOn: null });
    // Fica entre os dois: tudo a 100% e tudo a 120%.
    expect(e.valueCents).toBeGreaterThan(estimateValueByRate({ indexKind: 'cdi', rateBp: 10000 }, m, indices, '2026-11-02')!.valueCents);
    expect(e.valueCents).toBeLessThan(estimateValueByRate({ indexKind: 'cdi', rateBp: 12000 }, m, indices, '2026-11-02')!.valueCents);
    // Um aporte depois da data de fim rende só a taxa de depois.
    const withLater = [...m, mv('aporte', 100_000, '2026-10-15')];
    const later = estimateValueWithRateStep(step, withLater, indices, '2026-11-02')!;
    const onlyLater = estimateValueByRate({ indexKind: 'cdi', rateBp: 10000 }, [mv('aporte', 100_000, '2026-10-15')], indices, '2026-11-02')!;
    expect(Math.abs(later.valueCents - e.valueCents - onlyLater.valueCents)).toBeLessThanOrEqual(1);
  });

  it('com o último valor do extrato depois da data de fim, só a taxa de depois conta', () => {
    const withValue = [...m, mv('valor', 1_020_000, '2026-10-10')];
    expect(estimateValueWithRateStep(step, withValue, indices, '2026-11-02')!.valueCents).toBe(
      estimateValueByRate({ indexKind: 'cdi', rateBp: 10000 }, withValue, indices, '2026-11-02')!.valueCents,
    );
  });

  it('a premissa diz a taxa, até quando o índice foi publicado, desde quando conta e o que fica de fora', () => {
    const e = estimateValueWithRateStep({ ...step, rateUntil: '2027-03-31' }, m, indices, TODAY)!;
    const t = ESTIMATE_PREMISE_TEXT.premise({ ...step, rateUntil: '2027-03-31' }, e);
    expect(t).toBe('Premissa: 120% do CDI até 31/03/2027 e 100% do CDI depois, com o CDI publicado pelo Banco Central até dezembro de 2027. Conta o rendimento desde cada aporte, sem imposto e sem taxas.');
    expect(ESTIMATE_PREMISE_TEXT.premise({ indexKind: 'prefixado', rateBp: 1250, rateUntil: null, rateAfterBp: null }, { valueCents: 1, baseOn: '2026-10-06', projectedFrom: null, lastIndexMonth: null })).toBe(
      'Premissa: 12,5% ao ano. Conta o rendimento desde o valor de 06/10/2026, sem imposto e sem taxas.',
    );
    expect(ESTIMATE_PREMISE_TEXT.premise({ ...step, rateUntil: '2027-03-31' }, e, true)).toContain('com o CDI de exemplo da demonstração.');
    expect(ESTIMATE_PREMISE_TEXT.maturityPremise('2027-06-01')).toContain('sem o rendimento que ainda pode entrar até 01/06/2027');
    for (const s of [t, ESTIMATE_PREMISE_TEXT.maturityPremise('2027-06-01'), ESTIMATE_PREMISE_TEXT.todayPremise(TODAY), ESTIMATE_PREMISE_TEXT.forDay(TODAY)]) textRules(s);
  });
});

describe('rendimento bruto, IR e IOF e rendimento líquido (D-104, item 3)', () => {
  it('na tabela regressiva, as três linhas batem com a estimativa de sempre', () => {
    const m = [mv('aporte', 1_000_000, '2026-01-02'), mv('valor', 1_100_000, '2026-11-01')];
    const e = estimateNetIncome('regressiva', 'cdb', m, TODAY)!;
    expect(e).toEqual(estimateRegressiveNet(m, TODAY));
    const lines = netIncomeLines(e, 'regressiva');
    expect(lines.map((l) => l.label)).toEqual(['Rendimento bruto', 'IR e IOF estimados', 'Rendimento líquido estimado']);
    expect(lines[0]!.cents).toBe(100_000);
    expect(lines[1]!.cents).toBe(e.irCents + e.iofCents);
    expect(lines[2]!.cents).toBe(100_000 - e.irCents - e.iofCents);
    expect(NET_INCOME_TEXT.value(lines[1]!)).toBe(`−R$ ${(lines[1]!.cents / 100).toFixed(2).replace('.', ',')}`);
    expect(NET_INCOME_TEXT.a11y(lines[1]!)).toMatch(/^IR e IOF estimados: menos R\$/);
  });

  it('isento de IR: só o IOF dos primeiros 30 dias; a poupança, nenhum dos dois; as outras regras, sem cálculo', () => {
    const young = [mv('aporte', 1_000_000, '2026-11-07'), mv('valor', 1_010_000, '2026-11-17')];
    const lci = estimateNetIncome('isento', 'lci', young, TODAY)!;
    expect(lci.irCents).toBe(0);
    expect(lci.iofCents).toBe(Math.round(10_000 * 0.66));
    expect(netIncomeLines(lci, 'isento')[1]!.label).toBe('IOF estimado (isento de IR)');
    const old = [mv('aporte', 1_000_000, '2026-01-07'), mv('valor', 1_010_000, '2026-11-17')];
    expect(estimateNetIncome('isento', 'lci', old, TODAY)).toMatchObject({ irCents: 0, iofCents: 0, netCents: 1_010_000 });
    expect(estimateNetIncome('isento', 'poupanca', young, TODAY)).toMatchObject({ irCents: 0, iofCents: 0 });
    expect(estimateNetIncome('come_cotas', null, old, TODAY)).toBeNull();
    expect(estimateNetIncome(null, null, old, TODAY)).toBeNull();
  });

  it('as frases curtas levam a temas de Aprender publicados; o tipo Outro tem texto próprio', () => {
    const links = [taxExplanationLink('regressiva'), taxExplanationLink('isento'), LIQUIDITY_EXPLANATION, guaranteeExplanation('fgc'), guaranteeExplanation('tesouro'), guaranteeExplanation('nenhuma')];
    for (const l of links) {
      expect(l).not.toBeNull();
      expect(isTopicPublished(l!.slug)).toBe(true);
      textRules(l!.text);
      expect(l!.text).not.toMatch(/R\$\s?\d{1,3}(\.\d{3})*,\d{2}/);
    }
    expect(taxExplanationLink(null)).toBeNull();
    expect(guaranteeExplanation(null)).toBeNull();
    expect(TAX_TEXT.noRegimeOther).toContain('Outro');
    expect(TAX_TEXT.atMaturityNote).toBe('Este investimento só pode ser resgatado no vencimento.');
    textRules(TAX_TEXT.noRegimeOther);
  });
});

describe('a data de cada valor (D-104, item 1)', () => {
  it('"Atualizado por você em", de onde veio o "Usar este valor" e, sem atualização, o aplicado com a data', () => {
    expect(valueDateCaption([mv('aporte', 100, '2026-06-01'), mv('valor', 120, '2026-10-06')])).toBe('Atualizado por você em 06/10/2026.');
    expect(valueDateCaption([mv('aporte', 100, '2026-06-01'), mv('valor', 120, '2026-10-07', { note: VALUE_SOURCE_NOTE.fund('2026-10-05') })])).toBe(
      'Atualizado em 07/10/2026, pela cota do fundo de 05/10/2026.',
    );
    expect(valueDateCaption([mv('valor', 120, '2026-10-07', { note: VALUE_SOURCE_NOTE.treasury('2026-10-06') })])).toBe('Atualizado em 07/10/2026, pelo preço do Tesouro Nacional de 06/10/2026.');
    expect(valueDateCaption([mv('aporte', 100, '2026-06-01')])).toBe('Sem valor do extrato ainda: é o aplicado menos o resgatado, desde 01/06/2026.');
    expect(valueDateCaption([mv('valor', 120, '2026-10-01'), mv('aporte', 50, '2026-10-05')])).toBe('Atualizado por você em 01/10/2026. Mais os aportes e resgates registrados depois dessa data.');
    // Uma observação da pessoa não vira fonte.
    expect(valueSourcePhrase('Pela cota que vi no app')).toBeNull();
    expect(valueSourcePhrase(VALUE_SOURCE_NOTE.rate())).toBe('pela taxa contratada (estimativa)');
    expect(valueDateCaption([mv('valor', 120, '2026-10-07', { note: VALUE_SOURCE_NOTE.rate() })])).toBe('Atualizado em 07/10/2026, pela taxa contratada (estimativa).');
    // Duas atualizações no mesmo dia: vale a criada por último.
    expect(lastValueMovement([mv('valor', 1, '2026-10-07', { createdAt: 'b' }), mv('valor', 2, '2026-10-07', { createdAt: 'a' })])!.amountCents).toBe(1);
    for (const n of [VALUE_SOURCE_NOTE.fund('2026-10-05'), VALUE_SOURCE_NOTE.treasury('2026-10-05'), VALUE_SOURCE_NOTE.rate()]) expect([...n].length).toBeLessThanOrEqual(80);
    textRules(VALUE_DATE_TEXT.staleLoad);
  });
});

describe('histórico com o saldo linha a linha (D-104, item 16)', () => {
  it('na ordem do banco, com o saldo depois de cada linha e a diferença na atualização, do mais recente ao mais antigo', () => {
    const rows = investmentHistory([
      mv('valor', 1_087_500, '2026-10-06', { createdAt: '2' }),
      mv('aporte', 50_000, '2026-10-06', { createdAt: '3' }),
      mv('aporte', 1_000_000, '2026-06-01'),
      mv('valor', 1_008_500, '2026-06-30'),
      mv('rendimento', 1_250, '2026-07-10'),
      mv('resgate', 8_500, '2026-08-01'),
    ]);
    expect(rows.map((r) => [r.movement.kind, r.movement.occurredOn, r.balanceAfterCents, r.changeCents])).toEqual([
      ['valor', '2026-10-06', 1_087_500, 37_500],
      ['aporte', '2026-10-06', 1_050_000, null],
      ['resgate', '2026-08-01', 1_000_000, null],
      ['rendimento', '2026-07-10', 1_008_500, null],
      ['valor', '2026-06-30', 1_008_500, 8_500],
      ['aporte', '2026-06-01', 1_000_000, null],
    ]);
    expect(HISTORY_TEXT.change(-1_200)).toBe('R$ 12,00 a menos que o saldo anterior');
    expect(HISTORY_TEXT.change(0)).toBe('Igual ao saldo anterior');
    expect(investmentHistory([])).toEqual([]);
    textRules(HISTORY_TEXT.intro);
  });
});

describe('resumo da declaração no formato do informe (D-104, item 11)', () => {
  const items = [
    inv({ id: 'lci', name: 'Reserva', subkind: 'lci', institution: 'Banco Azul', firstMovementOn: '2025-03-01', description: 'Reserva da casa' }),
    inv({ id: 'acao', name: 'Ações', kind: 'acoes', subkind: 'acao', institution: 'Corretora Sol', firstMovementOn: '2026-02-01' }),
    inv({ id: 'cdb', name: 'CDB', subkind: 'cdb', institution: 'Banco Azul', firstMovementOn: '2026-01-10' }),
  ];
  const movements = [
    mv('aporte', 100_000, '2025-03-01', { investmentId: 'lci' }),
    mv('valor', 104_000, '2025-12-31', { investmentId: 'lci' }),
    mv('valor', 110_000, '2026-12-20', { investmentId: 'lci' }),
    mv('rendimento', 500, '2026-05-05', { investmentId: 'lci', incomeKind: 'juros' }),
    mv('aporte', 50_000, '2026-02-01', { investmentId: 'acao' }),
    mv('rendimento', 800, '2026-04-10', { investmentId: 'acao', incomeKind: 'dividendo' }),
    mv('rendimento', 300, '2026-08-10', { investmentId: 'acao', incomeKind: 'jcp' }),
    mv('rendimento', 200, '2026-09-10', { investmentId: 'acao', incomeKind: null }),
    mv('aporte', 20_000, '2026-01-10', { investmentId: 'cdb' }),
    mv('rendimento', 1_000, '2025-12-10', { investmentId: 'cdb', incomeKind: 'juros' }),
    mv('rendimento', 700, '2026-06-10', { investmentId: 'cdb', incomeKind: 'juros' }),
  ];

  it('posição em 31/12, isentos, tributação exclusiva, para conferir e Bens e Direitos, com a descrição da pessoa', () => {
    const r = declarationInforme(items, movements, 2026);
    expect(r.position.items.map((i) => i.investmentId)).toEqual(['lci', 'acao', 'cdb']);
    // Ações ficam pelo custo (sem valor); a LCI e o CDB somam.
    expect(r.position.previousTotalCents).toBe(104_000);
    expect(r.position.currentTotalCents).toBe(110_000 + 20_000);
    expect(r.income.isento).toEqual({ totalCents: 1_300, lines: [expect.objectContaining({ investmentId: 'lci', cents: 500 }), expect.objectContaining({ investmentId: 'acao', cents: 800 })] });
    expect(r.income.exclusiva).toEqual({ totalCents: 1_000, lines: [expect.objectContaining({ investmentId: 'acao', cents: 300 }), expect.objectContaining({ investmentId: 'cdb', cents: 700 })] });
    expect(r.income.conferir.totalCents).toBe(200);
    expect(INFORME_TEXT.description(r.assets[0]!)).toBe('LCI na instituição Banco Azul, aplicado desde 01/03/2025. Reserva da casa.');
    expect(INFORME_TEXT.line(r.income.isento.lines[0]!)).toBe('Reserva · LCI · Banco Azul: R$ 5,00');
    expect(r.institutions).toEqual(['Banco Azul', 'Corretora Sol']);
    expect(INFORME_TEXT.seal).toBe('Resumo estimado. Confira com o informe da instituição.');
  });

  it('a regra do grupo e o ano padrão (até maio, o ano que acabou)', () => {
    expect(informeIncomeGroup('fundos', 'fii', 'fii')).toBe('isento');
    expect(informeIncomeGroup('renda_fixa', 'lca', 'juros')).toBe('isento');
    expect(informeIncomeGroup('titulos_publicos', null, 'juros')).toBe('exclusiva');
    expect(informeIncomeGroup('outro', null, 'juros')).toBe('conferir');
    expect(defaultInformeYear('2027-05-31')).toBe(2026);
    expect(defaultInformeYear('2027-06-01')).toBe(2027);
    for (const s of Object.values(INFORME_TEXT)) if (typeof s === 'string') textRules(s);
  });
});

describe('lembretes dos investimentos com adiar e pausar (D-104, item 6)', () => {
  const ON = { gastos: false, recebimentos: false, mapa: false, ausencia: false, aporte: false, vencimentos: true, atualizar: true, aporte_investimentos: true } as const;

  it('os avisos dizem o fato e perguntam, sem nome nem valor, e abrem a tela do lembrete', () => {
    const plan = routineReminderPlan(ON, [], null, '2026-11-01', 20, {
      investments: { maturities: ['2026-11-20'], releases: ['2026-12-10'], hasActive: true, missingThisMonth: true },
      investmentDeposit: { day: 5, hasPlan: true, depositThisMonth: false },
    });
    expect(plan.map((i) => [i.kind, i.date, i.body, i.route])).toEqual([
      ['atualizar', '2026-11-01', 'Hoje é dia 1. Quer atualizar o valor dos investimentos com o extrato de outubro?', '/investimento/lembrete?tipo=atualizar'],
      ['aporte_investimentos', '2026-11-05', 'Hoje é o dia do aporte do seu plano de investimentos. Quer registrar?', '/investimento/lembrete?tipo=aporte_investimentos'],
      ['vencimentos', '2026-11-13', 'Um investimento vence em 7 dias, em 20/11/2026. Quer conferir?', '/investimento/lembrete?tipo=vencimentos'],
      ['vencimentos', '2026-11-20', 'Um investimento vence hoje. Quer conferir?', '/investimento/lembrete?tipo=vencimentos'],
      ['atualizar', '2026-12-01', 'Hoje é dia 1. Quer atualizar o valor dos investimentos com o extrato de novembro?', '/investimento/lembrete?tipo=atualizar'],
      ['vencimentos', '2026-12-03', 'A carência de um investimento termina em 7 dias, em 10/12/2026. Quer conferir?', '/investimento/lembrete?tipo=vencimentos'],
      ['aporte_investimentos', '2026-12-05', 'Hoje é o dia do aporte do seu plano de investimentos. Quer registrar?', '/investimento/lembrete?tipo=aporte_investimentos'],
      ['vencimentos', '2026-12-10', 'A carência de um investimento termina hoje. Quer conferir?', '/investimento/lembrete?tipo=vencimentos'],
    ]);
    for (const i of plan) {
      expect(i.body).not.toMatch(/R\$/);
      textRules(i.body);
    }
    for (const k of ['vencimentos', 'atualizar', 'aporte_investimentos'] as const) textRules(ROUTINE_REMINDER_TEXT.kinds[k].caption);
  });

  it('adiar, pausar e retomar: guardados por tipo, passam sozinhos na data', () => {
    let h = snoozeReminder({}, 'atualizar', TODAY);
    expect(h).toEqual({ atualizar: { snoozedUntil: '2026-11-20', pausedUntil: null } });
    expect(reminderHoldState(h, 'atualizar', TODAY)).toEqual({ state: 'adiado', until: '2026-11-20' });
    expect(reminderHoldState(h, 'atualizar', '2026-11-20')).toEqual({ state: 'ativo' });
    h = pauseReminder(h, 'vencimentos', TODAY);
    expect(reminderHoldState(h, 'vencimentos', '2026-12-16')).toEqual({ state: 'pausado', until: '2026-12-17' });
    expect(reminderHoldState(h, 'vencimentos', '2026-12-17')).toEqual({ state: 'ativo' });
    h = resumeReminder(h, 'atualizar');
    expect(h).toEqual({ vencimentos: { snoozedUntil: null, pausedUntil: '2026-12-17' } });
    // Só datas válidas e tipos conhecidos sobrevivem ao que foi guardado no aparelho.
    expect(parseInvestmentReminderHolds({ atualizar: { snoozedUntil: '2026-11-20', pausedUntil: 'x' }, gastos: { pausedUntil: '2026-12-01' }, vencimentos: {} })).toEqual({
      atualizar: { snoozedUntil: '2026-11-20', pausedUntil: null },
    });
    expect(parseInvestmentReminderHolds('lixo')).toEqual({});
  });

  it('no plano: pausado tira os avisos até a data; adiado tira até a data e põe um só, se o fato ainda vale', () => {
    const base = routineReminderPlan(ON, [], null, TODAY, 20, {
      investments: { maturities: ['2026-11-24'], releases: [], hasActive: true, missingThisMonth: true },
      investmentDeposit: { day: 5, hasPlan: true, depositThisMonth: false },
    });
    const facts = { depositDue: true, updateDue: true, dueDates: [{ on: '2026-11-24', release: false }] };
    const paused = applyInvestmentReminderHolds(base, pauseReminder({}, 'vencimentos', TODAY), TODAY, facts, ON, 20);
    expect(paused.filter((i) => i.kind === 'vencimentos')).toEqual([]);
    const snoozed = applyInvestmentReminderHolds(base, snoozeReminder({}, 'vencimentos', TODAY), TODAY, facts, ON, 20);
    const v = snoozed.filter((i) => i.kind === 'vencimentos');
    expect(v.map((i) => [i.id, i.date, i.body])).toEqual([
      ['clarevo-lembrete-rotina-vencimentos-adiado-2026-11-20', '2026-11-20', 'Um investimento vence em 24/11/2026. Quer conferir?'],
      ['clarevo-lembrete-rotina-vencimentos-2026-11-24-dia', '2026-11-24', 'Um investimento vence hoje. Quer conferir?'],
    ]);
    expect(snoozed.map((i) => i.fireAt)).toEqual([...snoozed.map((i) => i.fireAt)].sort());
    // Fato que não vale mais (o aporte do mês já registrado) ou tipo desligado: sem o aviso adiado.
    expect(applyInvestmentReminderHolds([], snoozeReminder({}, 'aporte_investimentos', TODAY), TODAY, { depositDue: false }, ON, 20)).toEqual([]);
    expect(applyInvestmentReminderHolds([], snoozeReminder({}, 'atualizar', TODAY), TODAY, facts, { ...ON, atualizar: false }, 20)).toEqual([]);
    const upd: RoutineReminderItem[] = applyInvestmentReminderHolds([], snoozeReminder({}, 'atualizar', TODAY), TODAY, facts, ON, 20);
    expect(upd.map((i) => [i.date, i.route])).toEqual([['2026-11-20', '/investimento/lembrete?tipo=atualizar']]);
    // Adiado para hoje com o horário já passado: nada (nunca um aviso no passado).
    expect(applyInvestmentReminderHolds([], { atualizar: { snoozedUntil: TODAY, pausedUntil: null } }, TODAY, facts, ON, 20, 21 * 60)).toEqual([]);
    expect(snoozedReminderBody('vencimentos', '2026-11-20', { dueDates: [{ on: '2026-11-15', release: false }] })).toBe('Um investimento venceu em 15/11/2026. Quer conferir?');
    expect(snoozedReminderBody('vencimentos', '2026-11-20', { dueDates: [{ on: '2026-11-20', release: true }] })).toBe('A carência de um investimento termina hoje. Quer conferir?');
  });

  it('dentro do app: o cartão do detalhe, a lista de vencimentos e quem está sem o valor do mês passado', () => {
    const fresh = inv({ id: 'a', firstMovementOn: '2026-06-01', lastValueOn: '2026-10-31', valueCents: 100 });
    const stale = inv({ id: 'b', firstMovementOn: '2026-06-01', lastValueOn: '2026-10-15', valueCents: 100 });
    const never = inv({ id: 'c', firstMovementOn: '2026-08-01', lastValueOn: null, valueCents: 100 });
    const newThisMonth = inv({ id: 'd', firstMovementOn: '2026-11-03', lastValueOn: null, valueCents: 100 });
    expect([fresh, stale, never, newThisMonth].map((i) => valueUpdateDue(i, TODAY))).toEqual([false, true, true, false]);
    expect(detailReminder(stale, TODAY, {})).toEqual({ kind: 'atualizar', lastValueOn: '2026-10-15', since: '2026-10-15' });
    expect(detailReminder(stale, TODAY, pauseReminder({}, 'atualizar', TODAY))).toBeNull();
    expect(INVESTMENT_REMINDER_TEXT.card.stale(null, '2026-08-01')).toBe('Este investimento está sem valor do extrato desde o primeiro aporte, em 01/08/2026. Quer atualizar?');
    const soon = inv({ id: 'e', maturityOn: '2026-11-20', valueCents: 100, firstMovementOn: '2026-11-01' });
    const past = inv({ id: 'f', maturityOn: '2026-11-10', valueCents: 100, firstMovementOn: '2026-11-01' });
    const pastEmpty = inv({ id: 'g', maturityOn: '2026-11-10', valueCents: 0, firstMovementOn: '2026-11-01' });
    const far = inv({ id: 'h', maturityOn: '2027-06-01', valueCents: 100, firstMovementOn: '2026-11-01', liquidity: 'a_partir_de', liquidityOn: '2026-12-01' });
    expect(dueItems([soon, past, pastEmpty, far], TODAY).map((x) => [x.investment.id, x.days, x.release])).toEqual([
      ['f', -7, false],
      ['e', 3, false],
      ['h', 14, true],
    ]);
    const r = detailReminder(soon, TODAY, {});
    expect(r?.kind === 'vencimentos' && INVESTMENT_REMINDER_TEXT.card.due(r.due)).toBe('Este investimento vence em 20/11/2026, daqui a 3 dias. Quer conferir?');
    const rp = detailReminder(past, TODAY, {});
    expect(rp?.kind === 'vencimentos' && INVESTMENT_REMINDER_TEXT.card.due(rp.due)).toBe('Este investimento venceu em 10/11/2026. Se o dinheiro já voltou para a conta, quer registrar o resgate?');
    expect(detailReminder(far, TODAY, {})).toBeNull();
    expect([r, rp, detailReminder(stale, TODAY, {})].map((x) => INVESTMENT_REMINDER_TEXT.card.title(x!))).toEqual(['Vencimento', 'Vencimento', 'Valor sem atualização']);
    const rel = detailReminder(inv({ id: 'i', liquidity: 'a_partir_de', liquidityOn: '2026-11-20', valueCents: 100, firstMovementOn: '2026-11-01' }), TODAY, {});
    expect(rel && INVESTMENT_REMINDER_TEXT.card.title(rel)).toBe('Fim da carência');
    expect(detailReminder({ ...soon, status: 'encerrado' }, TODAY, {})).toBeNull();
  });

  it('os textos de dentro do app: o fato com o valor, sem cobrança', () => {
    const T = INVESTMENT_REMINDER_TEXT;
    expect(T.aporte.today(60_000)).toBe('Hoje é o dia do aporte de R$ 600,00 do seu plano de investimentos. Quer registrar?');
    expect(T.aporte.monthSoFar('2026-10', 50_000)).toBe('Em outubro, os aportes registrados somam R$ 500,00.');
    expect(T.snoozed('2026-11-20')).toBe('Combinado: este lembrete volta em 20/11/2026.');
    const all = [T.aporte.today(1), T.aporte.otherDay(1, 5), T.aporte.noPlan, T.atualizar.intro, T.atualizar.none, T.vencimentos.intro, T.note, T.settingsNote, T.snooze, T.pause, T.paused('2026-12-17')];
    for (const s of all) {
      textRules(s);
      expect(s).not.toMatch(/atrasad|deveria|esqueceu|cobran/i);
    }
  });
});

describe('formulários: "Somar a uma meta?", "Outro" e a meta que usa o valor dos investimentos (D-104)', () => {
  it('a pergunta só no rendimento novo e no resgate novo com data no vencimento ou depois', () => {
    expect(asksGoalOnMovement('rendimento', false, null, TODAY)).toBe(true);
    expect(asksGoalOnMovement('rendimento', true, null, TODAY)).toBe(false);
    expect(asksGoalOnMovement('resgate', false, '2026-11-17', TODAY)).toBe(true);
    expect(asksGoalOnMovement('resgate', false, '2026-11-18', TODAY)).toBe(false);
    expect(asksGoalOnMovement('resgate', false, null, TODAY)).toBe(false);
    expect(asksGoalOnMovement('aporte', false, '2026-01-01', TODAY)).toBe(false);
    expect(asksGoalOnMovement('resgate', false, '2026-11-17', null)).toBe(false);
    expect(MOVEMENT_GOAL_TEXT.saved('Rendimento registrado.', 1_250, 'Viagem')).toBe('Rendimento registrado. Aporte de R$ 12,50 registrado na meta Viagem.');
    expect([...MOVEMENT_GOAL_TEXT.note('rendimento', 'x'.repeat(40))].length).toBeLessThanOrEqual(80);
  });

  it('textos de "Outro", da previdência e da meta ligada, sem o "só informação" de antes', () => {
    expect(INVESTMENT_GOAL_TEXT.formHint).not.toContain('só informação');
    expect(INVESTMENT_GOAL_TEXT.formHint).toContain('investimentos ligados');
    expect(canUseInvestmentsValue({ valueSource: 'registros' })).toBe(true);
    expect(canUseInvestmentsValue({ valueSource: 'investimentos' })).toBe(false);
    expect(canUseInvestmentsValue(undefined)).toBe(false);
    for (const s of [INVESTMENT_GOAL_TEXT.formHint, GOAL_LINK_TEXT.useInvestments, GOAL_LINK_TEXT.useInvestmentsHint, GOAL_LINK_TEXT.savedWithSource('Investimento salvo.', 'Viagem'), KIND_FORM_HINT.outro!, KIND_FORM_HINT.previdencia!, DETAILS_TEXT.descriptionHint('outro'), DETAILS_TEXT.rateConditionHint, DETAILS_TEXT.rateStepHint, MOVEMENT_GOAL_TEXT.hint])
      textRules(s);
  });
});

describe('repositório da demonstração: taxa com data de fim, condição e descrição (D-104, T4)', () => {
  it('cria e edita como o banco: sem a chave fica; outra forma de render tira a taxa de depois e a condição; nulo tira', async () => {
    const { createDemoRepository, newOperationKey } = await import('../src');
    const repo = await createDemoRepository();
    const ctx = (await repo.getSpace())!.personalContextId;
    const demoCdb = (await repo.listInvestments(ctx)).find((i) => i.subkind === 'cdb')!;
    expect(demoCdb).toMatchObject({ rateUntil: '2027-03-31', rateAfterBp: 10000, rateCondition: null });
    const prev = (await repo.listInvestments(ctx)).find((i) => i.kind === 'previdencia')!;
    expect(prev.description).toBe('Plano com contribuição todo mês, para a aposentadoria.');
    const created = await repo.createInvestment(newOperationKey(), ctx, {
      name: 'Consórcio',
      kind: 'outro',
      investedCents: 50_000,
      startOn: '2026-10-01',
      currentCents: 52_000,
      details: d({ indexKind: 'cdi', rateBp: 12000, rateUntil: '2027-03-31', rateAfterBp: 10000, rateCondition: '  com  aporte ', description: ' Carta  do carro ' }),
    });
    const i = created.investment!;
    expect(i).toMatchObject({ rateCondition: 'com aporte', description: 'Carta do carro', valueCents: 52_000 });
    // A ficha sem os campos novos (versão anterior do app): ficam.
    const { rateUntil: _a, rateAfterBp: _b, rateCondition: _c, description: _d, ...old } = d({ indexKind: 'cdi', rateBp: 11500 });
    const kept = await repo.updateInvestment(newOperationKey(), i.id, i.version, { name: 'Consórcio', kind: 'outro', details: old as InvestmentDetails });
    expect(kept.investment).toMatchObject({ rateBp: 11500, rateUntil: '2027-03-31', rateAfterBp: 10000, rateCondition: 'com aporte', description: 'Carta do carro' });
    // Outra forma de render sem os campos: saem a taxa de depois e a condição; a descrição fica.
    const { rateUntil: _e, rateAfterBp: _f, rateCondition: _g, description: _h, ...pre } = d({ indexKind: 'prefixado', rateBp: 1300 });
    const moved = await repo.updateInvestment(newOperationKey(), i.id, kept.investment!.version, { name: 'Consórcio', kind: 'outro', details: pre as InvestmentDetails });
    expect(moved.investment).toMatchObject({ rateUntil: null, rateAfterBp: null, rateCondition: null, description: 'Carta do carro' });
    // Sem a ficha: tudo fica; nulo tira.
    const none = await repo.updateInvestment(newOperationKey(), i.id, moved.investment!.version, { name: 'Consórcio do carro', kind: 'outro' });
    expect(none.investment!.description).toBe('Carta do carro');
    const cleared = await repo.updateInvestment(newOperationKey(), i.id, none.investment!.version, { name: 'Consórcio do carro', kind: 'outro', details: d({ description: null }) });
    expect(cleared.investment!.description).toBeNull();
    await expect(
      repo.createInvestment(newOperationKey(), ctx, { name: 'X', kind: 'outro', investedCents: 100, startOn: '2026-10-01', currentCents: null, details: d({ indexKind: 'cdi', rateBp: 11000, rateUntil: '2027-01-01' }) }),
    ).rejects.toMatchObject({ code: 'taxa_condicional_invalida' });
  });
});
