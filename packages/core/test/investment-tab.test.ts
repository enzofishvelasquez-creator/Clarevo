import { describe, expect, it } from 'vitest';
import {
  COMPARE_TEXT,
  DEMO_PLAN_SET_AT,
  DEMO_TODAY,
  EMPTY_INVESTMENT_DETAILS,
  HOW_CALC_TEXT,
  INSTITUTION_FGC_TEXT,
  INVESTMENT_PLAN_TEXT,
  INVESTMENT_TEMPLATES,
  INVESTMENT_TEMPLATE_TEXT,
  PLAN_REVIEW_MONTHS,
  PLAN_REVIEW_TEXT,
  TAB_ALLOCATION_ORDER,
  VALUE_DATE_TEXT,
  VALUE_SOURCE_NOTE,
  createDemoRepository,
  fgcByInstitutionKey,
  fullMonthsSince,
  gainOverInvested,
  howCalculatedLines,
  investmentTemplateFrom,
  investmentTemplatePreset,
  investmentValueStamp,
  planReviewDue,
  portfolioTotals,
  portfolioValueDates,
  tabAllocationDimensions,
  valueSourceFromNote,
  type Investment,
  type InvestmentMovementKind,
} from '../src';

// Pessoas, instituições e valores FICTÍCIOS.
const TODAY = '2026-11-17';
const mv = (kind: InvestmentMovementKind, amountCents: number, occurredOn: string, extra: { note?: string | null; createdAt?: string } = {}) => ({
  kind,
  amountCents,
  occurredOn,
  ...extra,
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
const allTexts = (o: unknown): string[] =>
  typeof o === 'string' ? [o] : typeof o === 'object' && o !== null ? Object.values(o).flatMap(allTexts) : [];
/** Regras de texto: sem travessão nem meia-risca, sem a expressão vetada, sem "nós", sem cobrança e sem recomendação. */
const checkCopy = (t: string) => {
  expect(t, t).not.toMatch(/[–—]/);
  expect(t, t).not.toMatch(new RegExp(['faz(er|endo)?', 'sentido'].join('\\s+'), 'i'));
  expect(t, t).not.toMatch(/\b(nós|calculamos|recomendamos|recomendo|invista|aplique|melhor|deveria|atrasad|parab[ée]ns|cuidado|aten[çc][ãa]o)\b/i);
  expect(t, t).not.toMatch(/\bo Clarevo\b/);
};

describe('D-103 item 1: de quando é cada valor', () => {
  it('a observação de "Usar este valor" diz a origem; qualquer outra (ou nenhuma) conta como digitada', () => {
    expect(VALUE_SOURCE_NOTE.treasury('2026-11-14')).toBe('Preço do Tesouro Nacional de 14/11/2026');
    expect(VALUE_SOURCE_NOTE.fund('2026-11-13')).toBe('Cota do fundo de 13/11/2026');
    expect(valueSourceFromNote(VALUE_SOURCE_NOTE.treasury('2026-11-14'))).toEqual({ kind: 'tesouro', on: '2026-11-14' });
    expect(valueSourceFromNote(` ${VALUE_SOURCE_NOTE.fund('2026-11-13')} `)).toEqual({ kind: 'cota', on: '2026-11-13' });
    expect(valueSourceFromNote(VALUE_SOURCE_NOTE.rate)).toEqual({ kind: 'taxa' });
    for (const other of [null, undefined, '', 'Extrato do banco', 'Preço do Tesouro Nacional de 31/02/2026', 'Cota do fundo de ontem'])
      expect(valueSourceFromNote(other), String(other)).toEqual({ kind: 'extrato' });
    for (const note of [VALUE_SOURCE_NOTE.treasury('2026-11-14'), VALUE_SOURCE_NOTE.fund('2026-11-13'), VALUE_SOURCE_NOTE.rate]) expect(note.length).toBeLessThanOrEqual(80);
  });

  it('a última atualização até hoje (no mesmo dia, a criada por último), e os aportes e resgates depois dela', () => {
    expect(investmentValueStamp([mv('aporte', 100_000, '2026-06-01')], TODAY)).toEqual({ on: null, source: { kind: 'extrato' }, depositsAfter: false, withdrawalsAfter: false });
    const list = [
      mv('aporte', 100_000, '2026-06-01'),
      mv('valor', 101_000, '2026-10-31', { createdAt: '2026-10-31T10:00:00Z' }),
      mv('valor', 101_500, '2026-11-12', { createdAt: '2026-11-12T09:00:00Z' }),
      mv('valor', 101_600, '2026-11-12', { createdAt: '2026-11-12T11:00:00Z', note: VALUE_SOURCE_NOTE.treasury('2026-11-11') }),
      mv('valor', 999_999, '2026-11-20'),
    ];
    expect(investmentValueStamp(list, TODAY)).toEqual({ on: '2026-11-12', source: { kind: 'tesouro', on: '2026-11-11' }, depositsAfter: false, withdrawalsAfter: false });
    const after = [...list, mv('aporte', 5_000, '2026-11-13'), mv('resgate', 1_000, '2026-11-14'), mv('aporte', 1, '2026-11-30')];
    expect(investmentValueStamp(after, TODAY)).toMatchObject({ depositsAfter: true, withdrawalsAfter: true });
  });

  it('linha da lista: atualizado por você, pelo preço do título, pela cota ou pela taxa, com o que veio depois', () => {
    const base = { on: '2026-11-12', source: { kind: 'extrato' as const }, depositsAfter: false, withdrawalsAfter: false };
    expect(VALUE_DATE_TEXT.row({ ...base, on: null })).toBe('Sem atualização do extrato: mostra o que foi aplicado.');
    expect(VALUE_DATE_TEXT.row(base)).toBe('Atualizado por você em 12/11/2026.');
    expect(VALUE_DATE_TEXT.row({ ...base, depositsAfter: true })).toBe('Atualizado por você em 12/11/2026, mais os aportes depois dessa data.');
    expect(VALUE_DATE_TEXT.row({ ...base, withdrawalsAfter: true })).toBe('Atualizado por você em 12/11/2026, menos os resgates depois dessa data.');
    expect(VALUE_DATE_TEXT.row({ ...base, depositsAfter: true, withdrawalsAfter: true })).toBe(
      'Atualizado por você em 12/11/2026, mais os aportes e menos os resgates depois dessa data.',
    );
    expect(VALUE_DATE_TEXT.row({ ...base, source: { kind: 'tesouro', on: '2026-11-11' } })).toBe('Valor de 12/11/2026, pelo preço do Tesouro Nacional de 11/11/2026.');
    expect(VALUE_DATE_TEXT.row({ ...base, source: { kind: 'cota', on: '2026-11-10' } })).toBe('Valor de 12/11/2026, pela cota do fundo de 10/11/2026.');
    expect(VALUE_DATE_TEXT.row({ ...base, source: { kind: 'taxa' } })).toBe('Valor de 12/11/2026, pela taxa contratada.');
  });

  it('card azul: o intervalo das datas dos ativos e quem não tem atualização no mês de hoje', () => {
    const items = [
      inv({ id: 'a', name: 'Aplicação', lastValueOn: '2026-11-12' }),
      inv({ id: 'b', name: 'Previdência', lastValueOn: '2026-10-31' }),
      inv({ id: 'c', name: 'Ações', lastValueOn: null }),
      inv({ id: 'd', name: 'Antigo', status: 'encerrado', lastValueOn: '2025-01-10' }),
    ];
    const d = portfolioValueDates(items, TODAY);
    expect(d).toEqual({ from: '2026-10-31', to: '2026-11-12', notThisMonth: ['Previdência', 'Ações'] });
    expect(VALUE_DATE_TEXT.card(d)).toBe('Valores de 31/10 a 12/11/2026, como você registrou.');
    expect(VALUE_DATE_TEXT.notThisMonth(d.notThisMonth)).toBe('Sem atualização neste mês: Previdência e Ações.');
    expect(VALUE_DATE_TEXT.card({ from: '2025-12-30', to: '2026-01-05', notThisMonth: [] })).toBe('Valores de 30/12/2025 a 05/01/2026, como você registrou.');
    expect(VALUE_DATE_TEXT.card({ from: '2026-11-12', to: '2026-11-12', notThisMonth: [] })).toBe('Valores de 12/11/2026, como você registrou.');
    expect(VALUE_DATE_TEXT.card(portfolioValueDates([inv({ id: 'x' })], TODAY))).toBe('Nenhum valor atualizado ainda: o total é o que foi aplicado.');
  });

  it('na demonstração: as duas atualizadas por você em 06/10/2026', async () => {
    const repo = await createDemoRepository();
    const ctx = (await repo.getSpace())!.personalContextId;
    const list = await repo.listInvestments(ctx);
    const movements = await repo.listContextInvestmentMovements(ctx);
    for (const i of list) expect(VALUE_DATE_TEXT.row(investmentValueStamp(movements.filter((m) => m.investmentId === i.id), DEMO_TODAY))).toBe('Atualizado por você em 06/10/2026.');
    expect(VALUE_DATE_TEXT.card(portfolioValueDates(list, DEMO_TODAY))).toBe('Valores de 06/10/2026, como você registrou.');
    expect(portfolioValueDates(list, DEMO_TODAY).notThisMonth).toEqual([]);
  });
});

describe('D-103 item 2: ganho em reais primeiro e "Como a conta é feita"', () => {
  it('totais dos ativos, o ganho e a porcentagem sobre o investido', () => {
    const items = [
      inv({ id: 'a', valueCents: 1_087_500, depositsCents: 1_050_000 }),
      inv({ id: 'b', valueCents: 508_000, depositsCents: 500_000, withdrawalsCents: 10_000, incomeCents: 2_000 }),
      inv({ id: 'c', status: 'encerrado', valueCents: 0, depositsCents: 999_999 }),
    ];
    const t = portfolioTotals(items);
    expect(t).toEqual({ valueCents: 1_595_500, depositsCents: 1_550_000, withdrawalsCents: 10_000, incomeCents: 2_000, gainCents: 57_500 });
    expect(gainOverInvested(t.gainCents, t.depositsCents)).toBeCloseTo(57_500 / 1_550_000, 12);
    expect(gainOverInvested(100, 0)).toBeNull();
    expect(HOW_CALC_TEXT.onInvested(45_500 / 1_550_000)).toBe('+2,94% sobre o investido');
    expect(HOW_CALC_TEXT.onInvested(-1_200 / 1_550_000)).toBe('-0,08% sobre o investido');
  });

  it('as linhas explicam cada número do card com a conta feita, e resgatado e rendimentos só aparecem quando existem', () => {
    const lines = howCalculatedLines({ valueCents: 1_595_500, depositsCents: 1_550_000, withdrawalsCents: 0, incomeCents: 0, gainCents: 45_500 });
    expect(lines.map((l) => l.title)).toEqual([
      'Valor de hoje: R$ 15.955,00',
      'Aportado: R$ 15.500,00',
      'Ganho: R$ 455,00',
      '+2,94% sobre o investido',
      'De quando é cada valor',
      'Desempenho',
    ]);
    expect(lines[2]!.text).toBe(
      'Valor de hoje, mais o resgatado e os rendimentos recebidos, menos o aportado: R$ 15.955,00 + R$ 0,00 + R$ 0,00 − R$ 15.500,00. Resultado: ganho de R$ 455,00.',
    );
    expect(lines[3]!.text).toBe('O ganho dividido pelo aportado: R$ 455,00 ÷ R$ 15.500,00. É o total desde o primeiro aporte, não uma taxa ao ano nem a do mês.');
    // A fórmula do ganho acima da inflação, usada no desempenho.
    expect(lines[5]!.text).toContain('Acima da inflação: (1 + rendimento) ÷ (1 + IPCA) − 1, no mesmo período.');
    const loss = howCalculatedLines({ valueCents: 90_000, depositsCents: 100_000, withdrawalsCents: 5_000, incomeCents: 1_000, gainCents: -4_000 });
    expect(loss.map((l) => l.title).slice(0, 5)).toEqual(['Valor de hoje: R$ 900,00', 'Aportado: R$ 1.000,00', 'Resgatado: R$ 50,00', 'Rendimentos recebidos: R$ 10,00', 'Perda: R$ 40,00']);
    expect(loss[4]!.text).toContain('Resultado: perda de R$ 40,00.');
    for (const l of [...lines, ...loss]) {
      checkCopy(l.title);
      checkCopy(l.text);
    }
    for (const t of allTexts(HOW_CALC_TEXT)) checkCopy(t);
  });
});

describe('D-103 item 5: modelos de registro na tela vazia', () => {
  it('quatro modelos, na ordem do estudo, com texto que descreve o que a pessoa já tem', () => {
    expect(INVESTMENT_TEMPLATES).toEqual(['reserva', 'titulo', 'banco', 'outro']);
    expect(INVESTMENT_TEMPLATES.map((t) => INVESTMENT_TEMPLATE_TEXT.label[t])).toEqual(['Reserva de emergência', 'Título do Tesouro', 'CDB, LCI ou LCA que já tenho', 'Outro investimento']);
    expect(INVESTMENT_TEMPLATE_TEXT.note).toContain('A Clarevo não indica onde investir.');
    for (const t of allTexts(INVESTMENT_TEMPLATE_TEXT)) checkCopy(t);
  });

  it('cada modelo preenche o tipo e, no título de banco, a forma de render; valor, data e taxa ficam em branco', () => {
    expect(investmentTemplatePreset('reserva')).toEqual({ name: 'Reserva de emergência', kind: 'renda_fixa', details: {}, openDetails: false });
    expect(investmentTemplatePreset('titulo')).toEqual({ name: '', kind: 'titulos_publicos', details: {}, openDetails: true });
    expect(investmentTemplatePreset('banco')).toEqual({ name: '', kind: 'renda_fixa', details: { indexKind: 'cdi' }, openDetails: true });
    expect(investmentTemplatePreset('outro')).toEqual({ name: '', kind: null, details: {}, openDetails: false });
    for (const t of INVESTMENT_TEMPLATES) expect(Object.keys(investmentTemplatePreset(t).details)).not.toContain('rateText');
  });

  it('o parâmetro da rota: texto ou lista; o resto é ignorado', () => {
    expect(investmentTemplateFrom('titulo')).toBe('titulo');
    expect(investmentTemplateFrom(['banco', 'outro'])).toBe('banco');
    for (const bad of [undefined, null, '', 'tesouro', 'RESERVA', 1, ['x']]) expect(investmentTemplateFrom(bad), String(bad)).toBeNull();
  });
});

describe('D-103 item 9: por instituição, ao lado de por tipo, com a soma da garantia do FGC', () => {
  const items = [
    inv({ id: 'cdb', name: 'CDB', subkind: 'cdb', institution: 'Banco Azul', valueCents: 300_000 }),
    inv({ id: 'lci', name: 'LCI', subkind: 'lci', institution: 'banco azul', valueCents: 200_000 }),
    inv({ id: 'tit', name: 'Título', kind: 'titulos_publicos', subkind: 'tesouro_selic', institution: 'Corretora Verde', valueCents: 400_000 }),
    inv({ id: 'sem', name: 'Sem banco', subkind: 'cdb', valueCents: 100_000 }),
    inv({ id: 'old', name: 'Encerrado', subkind: 'cdb', institution: 'Banco Azul', status: 'encerrado', valueCents: 0 }),
  ];

  it('"Por instituição" vem logo depois de "Por tipo" e aparece mesmo com uma instituição só', () => {
    expect(TAB_ALLOCATION_ORDER.slice(0, 2)).toEqual(['kind', 'institution']);
    const dims = tabAllocationDimensions(items, TODAY);
    expect(dims[0]).toBe('kind');
    expect(dims[1]).toBe('institution');
    const one = [inv({ id: 'x', subkind: 'cdb', institution: 'Banco Azul', valueCents: 100_000 })];
    expect(tabAllocationDimensions(one, TODAY)).toEqual(['institution']);
    expect(tabAllocationDimensions([inv({ id: 'y', valueCents: 100_000 }), inv({ id: 'z', kind: 'acoes', valueCents: 50_000 })], TODAY)).not.toContain('institution');
  });

  it('a soma com garantia do FGC por instituição (mesma chave da fatia), só dos ativos, e quem tem a garantia sem a instituição', () => {
    const f = fgcByInstitutionKey(items);
    expect([...f.byKey.entries()]).toEqual([['banco azul', 500_000]]);
    expect(f.withoutInstitution).toEqual(['Sem banco']);
    expect(f.totalCents).toBe(600_000);
    expect(INSTITUTION_FGC_TEXT.slice(500_000)).toBe('R$ 5.000,00 em produtos com garantia do FGC.');
    expect(INSTITUTION_FGC_TEXT.limit).toBe('Para comparar: a garantia do FGC vai até R$ 250.000,00 por pessoa em cada instituição ou conglomerado.');
    for (const t of allTexts(INSTITUTION_FGC_TEXT)) checkCopy(t);
  });
});

describe('D-103 item 14: revisão opcional do plano de aportes', () => {
  it('meses completos', () => {
    expect(fullMonthsSince('2026-08-17', TODAY)).toBe(3);
    expect(fullMonthsSince('2026-08-18', TODAY)).toBe(2);
    expect(fullMonthsSince('2026-01-31', '2026-02-28')).toBe(1);
    expect(fullMonthsSince(TODAY, TODAY)).toBe(0);
    expect(fullMonthsSince('2026-12-01', TODAY)).toBe(0);
  });

  it('depois de 3 meses sem revisar, com a data mais recente entre a mudança do plano e a abertura da tela; "Agora não" esconde por 3 meses', () => {
    const plan = { updatedAt: '2026-08-10T15:00:00.000Z' };
    const none = { reviewedOn: null, dismissedOn: null };
    expect(PLAN_REVIEW_MONTHS).toBe(3);
    expect(planReviewDue(null, none, TODAY)).toBeNull();
    expect(planReviewDue(plan, none, TODAY)).toBe(3);
    expect(planReviewDue({ updatedAt: '2026-04-01T00:00:00Z' }, none, TODAY)).toBe(7);
    expect(planReviewDue({ updatedAt: '2026-09-01T00:00:00Z' }, none, TODAY)).toBeNull();
    // Abriu a tela do plano neste aparelho depois da mudança.
    expect(planReviewDue(plan, { reviewedOn: '2026-10-01', dismissedOn: null }, TODAY)).toBeNull();
    expect(planReviewDue({ updatedAt: '2026-04-01T00:00:00Z' }, { reviewedOn: '2026-06-01', dismissedOn: null }, TODAY)).toBe(5);
    // "Agora não" há menos de 3 meses: escondido; há 3 meses ou mais: volta, contando desde a última revisão.
    expect(planReviewDue(plan, { reviewedOn: null, dismissedOn: '2026-11-01' }, TODAY)).toBeNull();
    expect(planReviewDue({ updatedAt: '2026-01-05T00:00:00Z' }, { reviewedOn: null, dismissedOn: '2026-08-01' }, TODAY)).toBe(10);
    // Datas inválidas não quebram.
    expect(planReviewDue({ updatedAt: '' }, { reviewedOn: 'ontem', dismissedOn: 'x' }, TODAY)).toBeNull();
  });

  it('na demonstração, o plano foi definido em 15/06/2026 e o convite aparece em 07/10/2026; os valores do plano não mudam', async () => {
    const repo = await createDemoRepository();
    const ctx = (await repo.getSpace())!.personalContextId;
    const plan = (await repo.getInvestmentPlan(ctx))!;
    expect(plan.plannedMonthlyCents).toBe(60_000);
    expect(plan.updatedAt).toBe(DEMO_PLAN_SET_AT);
    expect(planReviewDue(plan, { reviewedOn: null, dismissedOn: null }, DEMO_TODAY)).toBe(3);
    // Salvar o plano conta como revisão (a data de alteração anda).
    const saved = (await repo.setInvestmentPlan('chave-revisao-demo', ctx, 60_000))!;
    expect(planReviewDue(saved, { reviewedOn: null, dismissedOn: null }, DEMO_TODAY)).toBeNull();
  });

  it('textos: convite discreto, sem cobrança', () => {
    expect(PLAN_REVIEW_TEXT.invite(3)).toBe('Faz 3 meses que você revisou o plano. Quer conferir?');
    expect(PLAN_REVIEW_TEXT.later).toBe('Agora não');
    expect(PLAN_REVIEW_TEXT.laterA11y.startsWith(PLAN_REVIEW_TEXT.later)).toBe(true);
    for (const t of [...allTexts(PLAN_REVIEW_TEXT), PLAN_REVIEW_TEXT.invite(5)]) checkCopy(t);
  });
});

describe('D-103 item 4: o plano e a comparação dizem a premissa', () => {
  it('o plano conta só aportes, sem rendimento nem taxa; a comparação inclui o rendimento pela taxa digitada', () => {
    expect(INVESTMENT_PLAN_TEXT.premise).toContain('sem rendimento e sem taxa');
    expect(COMPARE_TEXT.premise).toContain('inclui o rendimento');
    expect(COMPARE_TEXT.premise).toContain('Nenhuma taxa vem preenchida.');
    for (const t of [INVESTMENT_PLAN_TEXT.premise, COMPARE_TEXT.premise]) checkCopy(t);
  });
});

describe('D-103: os textos novos da aba', () => {
  it('sem travessão, sem a expressão vetada e sem julgamento', () => {
    for (const t of [...allTexts(VALUE_DATE_TEXT), VALUE_DATE_TEXT.notThisMonth(['A', 'B'])]) if (typeof t === 'string') checkCopy(t);
  });
});
