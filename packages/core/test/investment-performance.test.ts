import { describe, expect, it } from 'vitest';
import {
  DEMO_TODAY,
  PERFORMANCE_MIN_BUSINESS_DAYS,
  PERFORMANCE_PERIODS,
  PERFORMANCE_PERIOD_LABEL,
  PERFORMANCE_TEXT,
  compareInvestment,
  createDemoRepository,
  exampleIndices,
  indexOverWindow,
  marketBusinessDaysBetween,
  marketBusinessDaysInMonth,
  ownWindow,
  performanceIndicesFrom,
  performancePeriodStart,
  windowReturn,
  type InvestmentMovementKind,
  type MarketIndices,
} from '../src';

// Valores FICTÍCIOS.
const TODAY = '2026-11-17';
const mv = (kind: InvestmentMovementKind, amountCents: number, occurredOn: string) => ({ kind, amountCents, occurredOn });
const flat = (v: number, from = '2024-01', to = '2026-12'): Record<string, number> => {
  const out: Record<string, number> = {};
  for (let y = Number(from.slice(0, 4)), m = Number(from.slice(5, 7)); `${y}-${String(m).padStart(2, '0')}` <= to; m === 12 ? ((m = 1), (y += 1)) : (m += 1))
    out[`${y}-${String(m).padStart(2, '0')}`] = v;
  return out;
};

describe('D-103 item 8: períodos e período próprio de cada investimento', () => {
  it('três períodos fixos', () => {
    expect(PERFORMANCE_PERIODS).toEqual(['mes', '12m', 'inicio']);
    expect(PERFORMANCE_PERIODS.map((p) => PERFORMANCE_PERIOD_LABEL[p])).toEqual(['No mês', 'Em 12 meses', 'Desde o início']);
    expect(performancePeriodStart('mes', TODAY)).toBe('2026-11-01');
    expect(performancePeriodStart('12m', TODAY)).toBe('2025-11-17');
    expect(performancePeriodStart('inicio', TODAY)).toBeNull();
  });

  it('do valor conhecido no começo (até 10 dias antes) ou do primeiro dentro do período até a última atualização', () => {
    const list = [
      mv('aporte', 100_000, '2025-03-10'),
      mv('valor', 104_000, '2025-11-10'),
      mv('valor', 108_000, '2026-10-31'),
      mv('aporte', 5_000, '2026-11-05'),
      mv('valor', 114_000, '2026-11-12'),
      mv('valor', 1, '2026-11-30'),
    ];
    // No mês: o valor de 31/10 vale como começo.
    expect(ownWindow(list, 'mes', TODAY)).toEqual({ from: '2026-10-31', to: '2026-11-12' });
    // Em 12 meses: o valor de 10/11/2025 fica até 10 dias antes do começo (17/11/2025) e vale como começo.
    expect(ownWindow(list, '12m', TODAY)).toEqual({ from: '2025-11-10', to: '2026-11-12' });
    // Em 25/11/2026, o começo é 25/11/2025: 10/11/2025 fica fora dos 10 dias, e vale o primeiro valor depois do começo (31/10/2026).
    expect(ownWindow(list, '12m', '2026-11-25')).toEqual({ from: '2026-10-31', to: '2026-11-12' });
    // Desde o início: do primeiro movimento.
    expect(ownWindow(list, 'inicio', TODAY)).toEqual({ from: '2025-03-10', to: '2026-11-12' });
    // Sem atualização de valor, ou só antes do começo: sem período.
    expect(ownWindow([mv('aporte', 1_000, '2026-01-01')], 'inicio', TODAY)).toBeNull();
    expect(ownWindow([mv('aporte', 1_000, '2026-01-01'), mv('valor', 1_100, '2026-05-01')], 'mes', TODAY)).toBeNull();
    // Começou no mês, sem valor antes: do primeiro movimento até a atualização.
    expect(ownWindow([mv('aporte', 1_000, '2026-11-03'), mv('valor', 1_010, '2026-11-10')], 'mes', TODAY)).toEqual({ from: '2026-11-03', to: '2026-11-10' });
    // Cadastrado hoje com o valor de hoje: um dia só, sem período.
    expect(ownWindow([mv('aporte', 1_000, TODAY), mv('valor', 1_200, TODAY)], 'inicio', TODAY)).toBeNull();
  });

  it('rendimento no intervalo pelo Dietz modificado, com aportes, resgates e rendimentos recebidos', () => {
    // Sem fluxos: (V1 − V0) ÷ V0.
    expect(windowReturn([mv('valor', 100_000, '2026-10-01'), mv('valor', 101_000, '2026-10-31')], { from: '2026-10-01', to: '2026-10-31' })).toBeCloseTo(0.01, 12);
    // Aporte no meio (30 dias, aporte no dia 16: peso 15/30) e rendimento recebido de 200.
    const list = [mv('valor', 100_000, '2026-10-01'), mv('aporte', 10_000, '2026-10-16'), mv('rendimento', 200, '2026-10-20'), mv('valor', 111_000, '2026-10-31')];
    expect(windowReturn(list, { from: '2026-10-01', to: '2026-10-31' })).toBeCloseTo((111_000 - 100_000 - 10_000 + 200) / (100_000 + 0.5 * 10_000), 12);
    // Aporte no último dia: peso zero.
    expect(windowReturn([mv('valor', 1_000, '2026-10-01'), mv('aporte', 500, '2026-10-31'), mv('valor', 1_520, '2026-10-31')], { from: '2026-10-01', to: '2026-10-31' })).toBeCloseTo(0.02, 12);
    // Começo pelo custo do primeiro dia (sem valor nele).
    expect(windowReturn([mv('aporte', 1_000, '2026-06-01'), mv('valor', 1_050, '2026-10-06')], { from: '2026-06-01', to: '2026-10-06' })).toBeCloseTo(0.05, 12);
    // Base zero: sem taxa.
    expect(windowReturn([mv('valor', 0, '2026-10-01'), mv('valor', 0, '2026-10-31')], { from: '2026-10-01', to: '2026-10-31' })).toBeNull();
    expect(windowReturn([mv('valor', 1, '2026-10-01')], { from: '2026-10-01', to: '2026-10-01' })).toBeNull();
  });
});

describe('D-103 item 8: índices no mesmo intervalo', () => {
  it('meses inteiros acumulam como o índice do mês; mês incompleto entra pela parte dos dias úteis', () => {
    const series = flat(0.9);
    expect(indexOverWindow(series, { from: '2026-06-01', to: '2026-10-01' })!.value).toBeCloseTo(1.009 ** 4 - 1, 12);
    const days = marketBusinessDaysBetween('2026-10-01', '2026-10-07');
    const n = marketBusinessDaysInMonth('2026-10');
    expect(days).toBe(4);
    expect(indexOverWindow(series, { from: '2026-10-01', to: '2026-10-07' })!.value).toBeCloseTo(1.009 ** (days / n) - 1, 12);
    expect(indexOverWindow(series, { from: '2026-10-01', to: '2026-10-07' })!.projectedFrom).toBeNull();
  });

  it('mês sem índice publicado repete o último (e diz desde quando); falta antes do último publicado: sem índice', () => {
    const series = flat(0.9, '2026-01', '2026-09');
    const r = indexOverWindow(series, { from: '2026-09-01', to: '2026-11-01' })!;
    expect(r.value).toBeCloseTo(1.009 ** 2 - 1, 12);
    expect(r.projectedFrom).toBe('2026-10');
    const gap: Record<string, number> = { '2026-08': 0.9, '2026-10': 0.9 };
    expect(indexOverWindow(gap, { from: '2026-08-01', to: '2026-11-01' })).toBeNull();
    expect(indexOverWindow(flat(0.9, '2026-05', '2026-10'), { from: '2026-03-01', to: '2026-06-01' })).toBeNull();
    expect(indexOverWindow(null, { from: '2026-08-01', to: '2026-11-01' })).toBeNull();
    expect(indexOverWindow({}, { from: '2026-08-01', to: '2026-11-01' })).toBeNull();
  });

  it('a comparação de um investimento: "% do CDI" só com rendimento de zero ou mais e dias úteis suficientes; acima da inflação pela fórmula', () => {
    const indices: MarketIndices = { cdi: flat(1), ipca: flat(0.4), poupanca: flat(0.6), fetchedOn: null, example: true };
    const list = [mv('aporte', 100_000, '2026-06-01'), mv('valor', 103_000, '2026-09-01')];
    const c = compareInvestment(list, 'inicio', indices, TODAY);
    expect(c.window).toEqual({ from: '2026-06-01', to: '2026-09-01' });
    expect(c.rate).toBeCloseTo(0.03, 12);
    expect(c.cdi!.value).toBeCloseTo(1.01 ** 3 - 1, 12);
    expect(c.ofCdi).toBeCloseTo(0.03 / (1.01 ** 3 - 1), 12);
    expect(c.real).toBeCloseTo(1.03 / 1.004 ** 3 - 1, 12);
    expect(c.projectedFrom).toBeNull();
    // Perda: sem "% do CDI".
    expect(compareInvestment([mv('aporte', 100_000, '2026-06-01'), mv('valor', 99_000, '2026-09-01')], 'inicio', indices, TODAY).ofCdi).toBeNull();
    // Intervalo curto (menos de 5 dias úteis): sem "% do CDI", com o resto.
    const short = compareInvestment([mv('valor', 100_000, '2026-11-02'), mv('valor', 100_100, '2026-11-04')], 'mes', indices, TODAY);
    expect(marketBusinessDaysBetween('2026-11-02', '2026-11-04')).toBeLessThan(PERFORMANCE_MIN_BUSINESS_DAYS);
    expect(short.rate).toBeCloseTo(0.001, 12);
    expect(short.ofCdi).toBeNull();
    expect(short.cdi).not.toBeNull();
    // Sem índices: só o rendimento.
    const alone = compareInvestment(list, 'inicio', null, TODAY);
    expect(alone.rate).toBeCloseTo(0.03, 12);
    expect([alone.cdi, alone.ipca, alone.poupanca, alone.ofCdi, alone.real]).toEqual([null, null, null, null, null]);
    // Sem período: tudo vazio.
    expect(compareInvestment([mv('aporte', 1, '2026-06-01')], 'mes', indices, TODAY)).toMatchObject({ window: null, rate: null });
  });

  it('a busca dos índices parte do mês do primeiro movimento', () => {
    expect(performanceIndicesFrom([[mv('aporte', 1, '2026-06-01')], [mv('aporte', 1, '2025-02-10'), mv('valor', 1, '2026-01-01')], []], TODAY)).toBe('2025-02');
    expect(performanceIndicesFrom([[mv('aporte', 1, '2027-01-01')]], TODAY)).toBeNull();
    expect(performanceIndicesFrom([], TODAY)).toBeNull();
  });
});

describe('D-103 item 8: na demonstração (índices de exemplo)', () => {
  it('a aplicação e a previdência, cada uma no próprio período, com o CDI, o IPCA e a poupança', async () => {
    const repo = await createDemoRepository();
    const ctx = (await repo.getSpace())!.personalContextId;
    const list = await repo.listInvestments(ctx);
    const movements = await repo.listContextInvestmentMovements(ctx);
    const of = (name: string) => movements.filter((m) => m.investmentId === list.find((i) => i.name === name)!.id);
    const idx = exampleIndices();
    const a12 = compareInvestment(of('Aplicação do banco'), '12m', idx, DEMO_TODAY);
    expect(PERFORMANCE_TEXT.window(a12.window!)).toBe('De 01/06/2026 a 06/10/2026, pelos valores que você registrou.');
    expect(PERFORMANCE_TEXT.rate(a12.rate, a12.ofCdi)).toBe('Rendeu +3,75%, cerca de 99% do CDI.');
    expect(PERFORMANCE_TEXT.cdi(a12.cdi)).toBe('CDI no mesmo intervalo: +3,78%');
    expect(PERFORMANCE_TEXT.ipca(a12.ipca)).toBe('IPCA no mesmo intervalo: +1,46%');
    expect(PERFORMANCE_TEXT.poupanca(a12.poupanca)).toBe('Poupança no mesmo intervalo: +2,51%');
    expect(PERFORMANCE_TEXT.real(a12.real!)).toBe('Acima da inflação no período: +2,26%');
    const p12 = compareInvestment(of('Previdência'), '12m', idx, DEMO_TODAY);
    expect(PERFORMANCE_TEXT.window(p12.window!)).toBe('De 01/08/2026 a 06/10/2026, pelos valores que você registrou.');
    expect(PERFORMANCE_TEXT.rate(p12.rate, p12.ofCdi)).toBe('Rendeu +1,60%, cerca de 83% do CDI.');
    // No mês: de 30/09 a 06/10, 4 dias úteis, sem "% do CDI".
    const aMes = compareInvestment(of('Aplicação do banco'), 'mes', idx, DEMO_TODAY);
    expect(PERFORMANCE_TEXT.window(aMes.window!)).toBe('De 30/09/2026 a 06/10/2026, pelos valores que você registrou.');
    expect(PERFORMANCE_TEXT.rate(aMes.rate, aMes.ofCdi)).toBe('Rendeu +0,14%.');
    expect(compareInvestment(of('Aplicação do banco'), 'inicio', idx, DEMO_TODAY)).toEqual(a12);
  });
});

describe('D-103 item 8: textos', () => {
  it('estimativa dita, sem julgamento, sem travessão e sem "nós"', () => {
    const texts = [
      ...(Object.values(PERFORMANCE_TEXT) as unknown[]).filter((v): v is string => typeof v === 'string'),
      PERFORMANCE_TEXT.noWindow('mes'),
      PERFORMANCE_TEXT.noWindow('12m'),
      PERFORMANCE_TEXT.projected('2026-10'),
      PERFORMANCE_TEXT.source('2026-11-17'),
      PERFORMANCE_TEXT.source(null),
      PERFORMANCE_TEXT.rate(null, null),
      PERFORMANCE_TEXT.contracted('105% do CDI'),
      PERFORMANCE_TEXT.variable,
      PERFORMANCE_TEXT.cdi(null),
    ];
    expect(PERFORMANCE_TEXT.estimate).toBe('Estimativa');
    expect(PERFORMANCE_TEXT.compareTitle).toBe('Comparar com CDI, IPCA e poupança');
    expect(PERFORMANCE_TEXT.formulas).toContain('(1 + rendimento) ÷ (1 + IPCA) − 1');
    for (const t of texts) {
      expect(t, t).not.toMatch(/[–—]/);
      expect(t, t).not.toMatch(new RegExp(['faz(er|endo)?', 'sentido'].join('\\s+'), 'i'));
      expect(t, t).not.toMatch(/\b(nós|calculamos|melhor|pior|ibovespa|ifix|ranking|recomend)/i);
    }
  });
});
