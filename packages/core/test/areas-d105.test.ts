import { describe, expect, it } from 'vitest';
import {
  APP_SCREENS,
  CALENDAR_TEXT,
  DEMO_GOALS_SETUP_DAY,
  DEMO_TODAY,
  EVOLUTION_CASH_WINDOWS,
  EVOLUTION_TEXT,
  EVOLUTION_WINDOWS,
  EXTRA_INCOME_ASK_TEXT,
  EXTRA_SAVINGS_TEXT,
  GOALS_REVIEW_EVERY_MONTHS,
  GOALS_REVIEW_TEXT,
  GOAL_PRESETS,
  SUMMARY_SHORTCUTS_TEXT,
  buildEvolutionView,
  createDemoRepository,
  demoScenarioFrom,
  evolutionFetchChunks,
  evolutionFetchRange,
  evolutionMonths,
  evolutionWindowFor,
  evolutionWindowsFor,
  extraIncomeOfMonth,
  extraIncomeOfRecord,
  goalReviewLines,
  goalsReviewDue,
  goalsReviewNextOn,
  investmentsSummaryLine,
  isEvolutionWindow,
  loadEvolutionGaps,
  monthOf,
  organizeGoals,
  topicTabFor,
  type FinancialRecord,
} from '../src';

// Valores e pessoas FICTÍCIOS.
const TZ = 'America/Sao_Paulo';

describe('Metas: reserva como primeira meta pronta e convite trimestral para rever (D-105)', () => {
  it('a reserva para imprevistos já é a primeira das metas prontas (D-092): nada muda', () => {
    expect(GOAL_PRESETS[0]!.id).toBe('reserva');
    expect(GOAL_PRESETS[0]!.name).toBe('Reserva para imprevistos');
  });

  it('o convite aparece com meta ativa de três meses ou mais, ou a partir da data guardada; nunca sem meta ativa', () => {
    const goal = (createdAt: string, status: 'ativa' | 'concluida' | 'arquivada' = 'ativa') => ({ createdAt, status });
    expect(GOALS_REVIEW_EVERY_MONTHS).toBe(3);
    // Sem meta ativa: nunca.
    expect(goalsReviewDue([], '2026-10-07', null, TZ)).toBe(false);
    expect(goalsReviewDue([goal('2026-01-01T12:00:00Z', 'concluida')], '2026-10-07', null, TZ)).toBe(false);
    // Meta de 01/07: aparece a partir de 01/10.
    expect(goalsReviewDue([goal('2026-07-01T12:00:00Z')], '2026-09-30', null, TZ)).toBe(false);
    expect(goalsReviewDue([goal('2026-07-01T12:00:00Z')], '2026-10-01', null, TZ)).toBe(true);
    // A mais antiga manda; a data de criação é a do fuso do aparelho (01/07 às 01h UTC ainda é 30/06 em São Paulo).
    expect(goalsReviewDue([goal('2026-09-20T12:00:00Z'), goal('2026-07-01T01:00:00Z')], '2026-09-30', null, TZ)).toBe(true);
    // Com a data guardada ("Agora não" ou revisão), ela manda.
    expect(goalsReviewDue([goal('2026-01-01T12:00:00Z')], '2026-10-07', '2027-01-07', TZ)).toBe(false);
    expect(goalsReviewDue([goal('2026-01-01T12:00:00Z')], '2027-01-07', '2027-01-07', TZ)).toBe(true);
    expect(goalsReviewNextOn('2026-10-07')).toBe('2027-01-07');
    expect(goalsReviewNextOn('2026-11-30')).toBe('2027-02-28');
  });

  it('cenário "metas" da demonstração: as metas nascem em 01/07/2026 e o convite aparece em 07/10/2026; na demonstração padrão, não', async () => {
    expect(demoScenarioFrom('metas')).toBe('metas');
    for (const [scenario, due] of [
      ['metas', true],
      ['padrao', false],
    ] as const) {
      const repo = await createDemoRepository({ scenario });
      const ctx = (await repo.ensurePersonalSpace('Conta principal')).personalContextId;
      const goals = await repo.listGoals(ctx);
      expect(goalsReviewDue(goals, DEMO_TODAY, null, 'UTC'), scenario).toBe(due);
      // O aporte de 06/10 e o valor guardado não mudam.
      const reserve = organizeGoals(goals).reserve!;
      expect(reserve.savedCents, scenario).toBe(350_000);
      if (scenario === 'metas') expect(reserve.createdAt.slice(0, 10)).toBe(DEMO_GOALS_SETUP_DAY);
    }
  });

  it('linhas da revisão: guardado, prazo e plano, este sempre "sem contar rendimentos"', () => {
    const lines = goalReviewLines([
      { id: 'a', name: 'Viagem', savedCents: 120_000, targetCents: 600_000, targetMonth: '2027-07', plannedMonthlyCents: 48_000 },
      { id: 'b', name: 'Curso', savedCents: 0, targetCents: 100_000, targetMonth: null, plannedMonthlyCents: null },
    ]);
    expect(lines).toEqual([
      { id: 'a', name: 'Viagem', saved: 'Guardado: R$ 1.200,00 de R$ 6.000,00', deadline: 'Prazo: julho de 2027', plan: 'Plano: R$ 480,00 por mês, sem contar rendimentos' },
      { id: 'b', name: 'Curso', saved: 'Guardado: R$ 0,00 de R$ 1.000,00', deadline: 'Sem prazo', plan: 'Sem plano por mês' },
    ]);
    const all = JSON.stringify(GOALS_REVIEW_TEXT);
    expect(all).not.toMatch(/[\u2013\u2014]|deveria|precisa rever|atrasad/i);
    expect(GOALS_REVIEW_TEXT.cardBody).toContain('opcional');
    expect(GOALS_REVIEW_TEXT.later).toBe('Agora não');
  });
});

describe('"Separar parte para uma meta?" estende o valor extra (D-078 F, D-105)', () => {
  const rec = (id: string, amountCents: number, category: string | null, occurredOn = '2026-10-10', nextMonth = false) =>
    ({ id, kind: 'receita', amountCents, category, occurredOn, nextMonth }) as Pick<FinancialRecord, 'id' | 'kind' | 'amountCents' | 'category' | 'occurredOn' | 'nextMonth'>;

  it('Renda extra pergunta sempre (a partir de R$ 20,00); Salário e Reembolso nunca', () => {
    expect(extraIncomeOfRecord(rec('a', 80_000, 'Renda extra'), [], null)).toBe(80_000);
    expect(extraIncomeOfRecord(rec('a', 1_999, 'Renda extra'), [], null)).toBe(0);
    expect(extraIncomeOfRecord(rec('a', 900_000, 'Salário'), [], 600_000)).toBe(0);
    expect(extraIncomeOfRecord(rec('a', 900_000, 'Reembolso'), [], 600_000)).toBe(0);
    expect(extraIncomeOfRecord({ ...rec('a', 900_000, null), kind: 'despesa' }, [], 600_000)).toBe(0);
  });

  it('sem categoria: só a parte que passa da renda de referência, e só com referência', () => {
    const salary = rec('s', 600_000, 'Salário', '2026-10-01');
    const freela = rec('f', 80_000, null);
    // Com o salário de R$ 6.000,00 e a referência de R$ 6.000,00, o freela inteiro é extra.
    expect(extraIncomeOfRecord(freela, [salary, freela], 600_000)).toBe(80_000);
    // Sem referência, sem categoria: não pergunta (não dá para saber o que é o de sempre).
    expect(extraIncomeOfRecord(freela, [salary, freela], null)).toBe(0);
    // O primeiro recebimento do mês, abaixo da referência, não é extra; o que passa dela é.
    expect(extraIncomeOfRecord(rec('x', 500_000, null), [], 600_000)).toBe(0);
    expect(extraIncomeOfRecord(rec('x', 650_000, null), [], 600_000)).toBe(50_000);
    // Outro mês não conta; o recebimento "do mês seguinte" (D-089 A) conta no seguinte.
    expect(extraIncomeOfRecord(freela, [freela, rec('o', 600_000, null, '2026-09-30')], 600_000)).toBe(0);
    expect(extraIncomeOfRecord(freela, [freela, rec('o', 600_000, null, '2026-09-30', true)], 600_000)).toBe(80_000);
    // Reembolso dos outros não conta na soma.
    expect(extraIncomeOfRecord(freela, [rec('r', 600_000, 'Reembolso')], 600_000)).toBe(0);
  });

  it('a mesma regra do lembrete do Resumo: o recebimento que pergunta faz parte do valor extra do mês', () => {
    const records = [rec('s', 600_000, 'Salário', '2026-10-01'), rec('f', 80_000, null)];
    expect(extraIncomeOfMonth(records, '2026-10', 600_000)).toBe(80_000);
    expect(extraIncomeOfRecord(records[1]!, records, 600_000)).toBe(80_000);
    expect(EXTRA_INCOME_ASK_TEXT.basis).toBe(EXTRA_SAVINGS_TEXT.basis);
  });

  it('textos: pergunta sem valor sugerido, cada meta com nome acessível próprio e "Agora não"', () => {
    expect(EXTRA_INCOME_ASK_TEXT.title).toBe('Separar parte para uma meta?');
    expect(EXTRA_INCOME_ASK_TEXT.body).not.toMatch(/R\$|\d/);
    expect(EXTRA_INCOME_ASK_TEXT.goalA11y('Viagem')).toBe('Separar parte para Viagem');
    expect(JSON.stringify(EXTRA_INCOME_ASK_TEXT)).not.toMatch(/[\u2013\u2014]|deveria|não esqueça/i);
  });
});

describe('Resumo: a linha de Investir (D-105)', () => {
  const inv = (valueCents: number, lastValueOn: string | null, status: 'ativo' | 'encerrado' = 'ativo') => ({ status, valueCents, lastValueOn });

  it('valor de hoje e a data das atualizações; intervalo quando as datas diferem; sem investimento ativo, sem linha', () => {
    expect(investmentsSummaryLine([])).toBeNull();
    expect(investmentsSummaryLine([inv(100, '2026-10-01', 'encerrado')])).toBeNull();
    const same = investmentsSummaryLine([inv(1_087_500, '2026-10-06'), inv(508_000, '2026-10-06')])!;
    expect(same.caption).toBe('R$ 15.955,00 · valores de 06/10/2026');
    expect(same.a11y).toBe('Investir, R$ 15.955,00, valores de 06/10/2026');
    const range = investmentsSummaryLine([inv(100_000, '2026-10-06'), inv(50_000, '2026-09-30'), inv(10_000, null), inv(999, '2026-01-01', 'encerrado')])!;
    expect(range.caption).toBe('R$ 1.600,00 · valores de 30/09/2026 a 06/10/2026 · 1 sem atualização de valor');
    expect(range.withoutUpdate).toBe(1);
    expect(investmentsSummaryLine([inv(10_000, null), inv(5_000, null)])!.caption).toBe('R$ 150,00 · 2 sem atualização de valor');
  });

  it('a demonstração: R$ 15.955,00, com as duas atualizações de 06/10/2026', async () => {
    const repo = await createDemoRepository();
    const ctx = (await repo.ensurePersonalSpace('Conta principal')).personalContextId;
    expect(investmentsSummaryLine(await repo.listInvestments(ctx))!.caption).toBe('R$ 15.955,00 · valores de 06/10/2026');
    expect(SUMMARY_SHORTCUTS_TEXT.calendarCaption('2026-10')).toBe('Contas, faturas e datas de outubro de 2026');
  });
});

describe('Evolução: 24 e 36 meses em Recebido e Pago (D-105)', () => {
  it('as janelas: Recebido e Pago até 36 meses, os da fase 3 até 12; trocar para a fase 3 com 24 ou 36 mostra 12', () => {
    expect(EVOLUTION_WINDOWS).toEqual([3, 6, 12]);
    expect(EVOLUTION_CASH_WINDOWS).toEqual([3, 6, 12, 24, 36]);
    expect(evolutionWindowsFor('pago')).toEqual([3, 6, 12, 24, 36]);
    expect(evolutionWindowsFor('recebido')).toEqual([3, 6, 12, 24, 36]);
    expect(evolutionWindowsFor('comprometida')).toEqual([3, 6, 12]);
    expect(evolutionWindowsFor('guardado')).toEqual([3, 6, 12]);
    expect(evolutionWindowFor('comprometida', 36)).toBe(12);
    expect(evolutionWindowFor('guardado', 6)).toBe(6);
    expect(evolutionWindowFor('pago', 36)).toBe(36);
    expect(isEvolutionWindow(24)).toBe(true);
    expect(isEvolutionWindow(36)).toBe(true);
    expect(isEvolutionWindow(48)).toBe(false);
    expect(EVOLUTION_TEXT.windowLabel[24]).toBe('24 meses');
    expect(EVOLUTION_TEXT.windowLabel[36]).toBe('36 meses');
  });

  it('as leituras: até 12 meses, a de sempre; 24 e 36 em pedaços de 12, sem buraco nem sobreposição', () => {
    for (const w of [3, 6, 12] as const) expect(evolutionFetchChunks('2026-10', w)).toEqual([evolutionFetchRange('2026-10')]);
    expect(evolutionFetchChunks('2026-10', 24)).toEqual([
      { from: '2024-11', to: '2025-10' },
      { from: '2025-11', to: '2026-10' },
    ]);
    const chunks = evolutionFetchChunks('2026-10', 36);
    expect(chunks).toEqual([
      { from: '2023-11', to: '2024-10' },
      { from: '2024-11', to: '2025-10' },
      { from: '2025-11', to: '2026-10' },
    ]);
    // Os meses dos pedaços são exatamente os da janela.
    const months = evolutionMonths('2026-10', 36);
    expect(months[0]).toBe('2023-11');
    expect(months).toHaveLength(36);
  });

  it('a visão de 36 meses junta as três leituras; mês que não veio vale "sem registros", e o total é o dos 36', async () => {
    const repo = await createDemoRepository();
    const ctx = (await repo.ensurePersonalSpace('Conta principal')).personalContextId;
    const current = monthOf(DEMO_TODAY);
    const rows = (await Promise.all(evolutionFetchChunks(current, 36).map((c) => repo.monthsOverview(ctx, c.from, c.to)))).flat();
    expect(rows).toHaveLength(36);
    const view = buildEvolutionView({ overview: rows, metric: 'pago', windowMonths: 36, currentMonth: current, hiddenMonths: [] });
    expect(view.points).toHaveLength(36);
    expect(view.from).toBe('2023-11');
    // Setembro (R$ 3.750,00) e outubro (R$ 3.900,00) da base de aceite.
    expect(view.totalCents).toBe(375_000 + 390_000);
    expect(view.points.filter((p) => p.state !== 'sem_registros').map((p) => p.month)).toEqual(['2026-09', '2026-10']);
  });

  it('o aviso de lacuna cobre a janela inteira com 24 e 36 meses (sem mudar a leitura de até 12)', async () => {
    const calls: string[] = [];
    const repo = {
      listSeries: async () => [],
      listCommitmentsDueBetween: async (_ctx: string, from: string, to: string) => {
        calls.push(`${from}..${to}`);
        return [];
      },
    };
    await loadEvolutionGaps(repo, 'c', '2026-10');
    await loadEvolutionGaps(repo, 'c', '2026-10', 6);
    await loadEvolutionGaps(repo, 'c', '2026-10', 36);
    expect(calls).toEqual(['2025-11..2026-09', '2025-11..2026-09', '2023-11..2026-09']);
  });
});

describe('Calendário: a entrada no índice "No app" e a aba do assunto (D-105)', () => {
  it('o índice "No app" tem o Calendário do mês, com o título e a legenda da linha de Organizar; a tela pertence a Movimentos', () => {
    const screen = APP_SCREENS.find((x) => x.id === 'calendario')!;
    expect(screen.title).toBe(CALENDAR_TEXT.rowTitle);
    expect(screen.caption).toBe(CALENDAR_TEXT.rowCaption);
    expect(screen.href).toBe('/calendario');
    expect(topicTabFor('/calendario')).toBe('/movimentacoes');
    expect(topicTabFor('/calendario?mes=2026-11')).toBe('/movimentacoes');
  });
});
