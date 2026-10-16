import { describe, expect, it } from 'vitest';
import {
  COMPARISON_ELIGIBLE_STATES,
  EXPLAIN_TOP_CATEGORIES,
  EXPLAIN_TOP_RECORDS,
  MemoryRepository,
  categoryBreakdown,
  comparisonStats,
  evolutionPoints,
  explainChange,
  loadInvoices,
  loadInvoicesOfRecords,
  monthsOverview,
  newOperationKey,
  paidCategoryParts,
  pointVariation,
  receivedCategoryParts,
  summarizeMonth,
  type CategoryPart,
  type EvolutionPoint,
  type EvolutionPointState,
  type FinancialRecord,
  type MonthOverview,
} from '../src';

/**
 * Evolução financeira, fase 1a (docs/14 §4 e §6; especificação EF §6 e §12). Valores do caso de referência, em centavos:
 * janeiro 320.000, fevereiro 340.000, março 330.000, abril 780.000, maio 345.000 e junho 360.000.
 */
const PAID = [320_000, 340_000, 330_000, 780_000, 345_000, 360_000];
const MONTHS = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06'];
const RECEIVED = [500_000, 500_000, 0, 520_000, 500_000, 510_000];

const overview: MonthOverview[] = MONTHS.map((month, i) => ({
  month,
  receivedCount: RECEIVED[i] === 0 ? 0 : 2,
  receivedCents: RECEIVED[i]!,
  paidCount: 10 + i,
  paidCents: PAID[i]!,
}));

/** Mês atual depois do período: todos os seis meses estão fechados. */
const AFTER = '2026-07';

const paidPoints = () => evolutionPoints(overview, 'pago', AFTER);
const point = (month: string, cents: number, count = 1, state: EvolutionPointState = 'com_registros'): EvolutionPoint => ({ month, cents, count, state });

describe('evolutionPoints', () => {
  it('Pago: um ponto por mês, na ordem, com valor, contagem e estado', () => {
    expect(paidPoints()).toEqual([
      { month: '2026-01', cents: 320_000, count: 10, state: 'com_registros' },
      { month: '2026-02', cents: 340_000, count: 11, state: 'com_registros' },
      { month: '2026-03', cents: 330_000, count: 12, state: 'com_registros' },
      { month: '2026-04', cents: 780_000, count: 13, state: 'com_registros' },
      { month: '2026-05', cents: 345_000, count: 14, state: 'com_registros' },
      { month: '2026-06', cents: 360_000, count: 15, state: 'com_registros' },
    ]);
  });

  it('T13: Recebido e Pago são séries separadas, cada uma com os próprios campos e estados', () => {
    const received = evolutionPoints(overview, 'recebido', AFTER);
    expect(received.map((p) => p.cents)).toEqual(RECEIVED);
    expect(received.map((p) => p.count)).toEqual([2, 2, 0, 2, 2, 2]);
    expect(received.map((p) => p.state)).toEqual(['com_registros', 'com_registros', 'sem_registros', 'com_registros', 'com_registros', 'com_registros']);
    expect(paidPoints().map((p) => p.state)).toEqual(Array(6).fill('com_registros'));
    // Ocultar um mês numa métrica não muda a outra: cada uma recebe a própria seleção.
    const hiddenPaid = ['2026-04'];
    const paid = comparisonStats(paidPoints(), hiddenPaid);
    const rec = comparisonStats(received, []);
    expect(paid.visibleCount).toBe(5);
    expect(rec.eligibleCount).toBe(5);
    expect(rec.visibleCount).toBe(5);
    expect(rec.hiddenMonths).toEqual([]);
    expect(rec.visibleSum).toBe(2_530_000n);
    expect(rec.canonicalTotal).toBe(2_530_000n);
    expect(hiddenPaid).toEqual(['2026-04']);
  });

  it('T10: mês sem lançamentos é sem_registros e não vira zero confirmado', () => {
    const march = evolutionPoints(overview, 'recebido', AFTER)[2]!;
    expect(march).toEqual({ month: '2026-03', cents: 0, count: 0, state: 'sem_registros' });
    expect(march.state).not.toBe('com_registros');
    // Um mês que tem lançamentos na outra métrica continua sem registros nesta.
    expect(paidPoints()[2]!.state).toBe('com_registros');
  });

  it('mês atual com lançamentos é em_andamento; sem lançamentos continua sem_registros', () => {
    const june = (paidCount: number, paidCents: number): MonthOverview[] => [
      { month: '2026-05', receivedCount: 0, receivedCents: 0, paidCount: 3, paidCents: 100_000 },
      { month: '2026-06', receivedCount: 0, receivedCents: 0, paidCount, paidCents },
    ];
    expect(evolutionPoints(june(2, 40_000), 'pago', '2026-06').map((p) => p.state)).toEqual(['com_registros', 'em_andamento']);
    expect(evolutionPoints(june(0, 0), 'pago', '2026-06').map((p) => p.state)).toEqual(['com_registros', 'sem_registros']);
  });

  it('ordena por mês e recusa mês repetido, mês inválido e valor que não é inteiro não negativo', () => {
    const shuffled = [overview[2]!, overview[0]!, overview[1]!];
    expect(evolutionPoints(shuffled, 'pago', AFTER).map((p) => p.month)).toEqual(['2026-01', '2026-02', '2026-03']);
    expect(() => evolutionPoints([overview[0]!, overview[0]!], 'pago', AFTER)).toThrow(RangeError);
    expect(() => evolutionPoints([{ ...overview[0]!, month: '2026-13' }], 'pago', AFTER)).toThrow(RangeError);
    expect(() => evolutionPoints(overview, 'pago', '2026-6')).toThrow(RangeError);
    expect(() => evolutionPoints([{ ...overview[0]!, paidCents: -1 }], 'pago', AFTER)).toThrow(RangeError);
    expect(() => evolutionPoints([{ ...overview[0]!, paidCents: 10.5 }], 'pago', AFTER)).toThrow(RangeError);
    expect(() => evolutionPoints([{ ...overview[0]!, paidCount: -1 }], 'pago', AFTER)).toThrow(RangeError);
    expect(() => evolutionPoints(overview, 'ainda_a_pagar' as never, AFTER)).toThrow(RangeError);
  });

  it('não altera as linhas que recebe', () => {
    const frozen = Object.freeze(overview.map((row) => Object.freeze({ ...row })));
    const before = JSON.stringify(frozen);
    evolutionPoints(frozen, 'pago', AFTER);
    expect(JSON.stringify(frozen)).toBe(before);
  });

  it('lista vazia, nenhum ponto', () => {
    expect(evolutionPoints([], 'pago', AFTER)).toEqual([]);
  });

  it('lê as linhas de monthsOverview do core: mês sem lançamento vem com contagem 0 e fica sem_registros', () => {
    const record = (id: string, kind: 'receita' | 'despesa', occurredOn: string, amountCents: number): FinancialRecord => ({
      id,
      contextId: 'ctx',
      accountId: 'acc',
      kind,
      status: 'realizado',
      amountCents,
      currency: 'BRL',
      occurredOn,
      description: id,
      category: null,
      commitmentId: null,
      invoice: null,
      receiptKey: null,
      createdBy: 'u',
      version: 1,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    });
    const rows = monthsOverview(
      [record('a', 'despesa', '2026-04-10', 700_000), record('b', 'despesa', '2026-04-20', 80_000), record('c', 'receita', '2026-04-05', 520_000), record('d', 'despesa', '2026-06-02', 1_000)],
      'ctx',
      '2026-03',
      '2026-06',
    );
    expect(evolutionPoints(rows, 'pago', '2026-06')).toEqual([
      { month: '2026-03', cents: 0, count: 0, state: 'sem_registros' },
      { month: '2026-04', cents: 780_000, count: 2, state: 'com_registros' },
      { month: '2026-05', cents: 0, count: 0, state: 'sem_registros' },
      { month: '2026-06', cents: 1_000, count: 1, state: 'em_andamento' },
    ]);
    expect(evolutionPoints(rows, 'recebido', '2026-06').map((p) => [p.cents, p.count])).toEqual([[0, 0], [520_000, 1], [0, 0], [0, 0]]);
  });
});

describe('comparisonStats', () => {
  it('T05: histórico completo, média 412.500, mediana 342.500, n = 6, total 2.475.000', () => {
    const s = comparisonStats(paidPoints(), []);
    expect(s.eligibleCount).toBe(6);
    expect(s.visibleCount).toBe(6);
    expect(s.visibleSum).toBe(2_475_000n);
    expect(s.average).toBe(412_500);
    expect(s.median).toBe(342_500);
    expect(s.canonicalTotal).toBe(2_475_000n);
    expect(s.visibleMonths).toEqual(MONTHS);
    expect(s.hiddenMonths).toEqual([]);
  });

  it('T04: sem abril, média 339.000, mediana 340.000, n = 5, soma 1.695.000, total 2.475.000', () => {
    const s = comparisonStats(paidPoints(), ['2026-04']);
    expect(s.eligibleCount).toBe(6);
    expect(s.visibleCount).toBe(5);
    expect(s.visibleSum).toBe(1_695_000n);
    expect(s.average).toBe(339_000);
    expect(s.median).toBe(340_000);
    expect(s.canonicalTotal).toBe(2_475_000n);
    expect(s.visibleMonths).toEqual(['2026-01', '2026-02', '2026-03', '2026-05', '2026-06']);
    expect(s.hiddenMonths).toEqual(['2026-04']);
  });

  it('T03: ocultar e reativar abril devolve os valores originais', () => {
    const points = paidPoints();
    const original = comparisonStats(points, []);
    const hidden = comparisonStats(points, ['2026-04']);
    expect(hidden.average).not.toBe(original.average);
    const restored = comparisonStats(points, []);
    expect(restored).toEqual(original);
    // Os pontos do mês continuam com o valor e a posição de antes.
    expect(points[3]).toEqual({ month: '2026-04', cents: 780_000, count: 13, state: 'com_registros' });
    expect(points.map((p) => p.month)).toEqual(MONTHS);
  });

  it('T06: o total canônico não depende dos meses ocultos', () => {
    const points = paidPoints();
    for (const hidden of [[], ['2026-04'], ['2026-01', '2026-03', '2026-05'], MONTHS, ['2020-01']]) {
      expect(comparisonStats(points, hidden).canonicalTotal).toBe(2_475_000n);
    }
    expect(comparisonStats([], []).canonicalTotal).toBe(0n);
  });

  it('T07: meses ocultos não consecutivos, sem renumerar os meses', () => {
    const points = paidPoints();
    const before = JSON.stringify(points);
    const s = comparisonStats(points, ['2026-02', '2026-04', '2026-06']);
    expect(s.visibleMonths).toEqual(['2026-01', '2026-03', '2026-05']);
    expect(s.hiddenMonths).toEqual(['2026-02', '2026-04', '2026-06']);
    expect(s.eligibleCount).toBe(6);
    expect(s.visibleCount).toBe(3);
    expect(s.visibleSum).toBe(995_000n);
    expect(s.average).toBe(331_667); // 331.666,67 sobe
    expect(s.median).toBe(330_000);
    expect(s.canonicalTotal).toBe(2_475_000n);
    // Os pontos seguem com o mês e o valor de origem: nada é reposicionado.
    expect(JSON.stringify(points)).toBe(before);
    // A ordem em que a pessoa ocultou não muda nada.
    expect(comparisonStats(points, ['2026-06', '2026-02', '2026-04'])).toEqual(s);
  });

  it('T08: todos ocultos, n = 0 e média e mediana nulas, nunca 0', () => {
    const s = comparisonStats(paidPoints(), MONTHS);
    expect(s.eligibleCount).toBe(6);
    expect(s.visibleCount).toBe(0);
    expect(s.visibleSum).toBe(0n);
    expect(s.average).toBeNull();
    expect(s.median).toBeNull();
    expect(s.canonicalTotal).toBe(2_475_000n);
    expect(s.visibleMonths).toEqual([]);
    expect(s.hiddenMonths).toEqual(MONTHS);
    // Sem nenhum ponto elegível, o mesmo.
    const none = comparisonStats([], []);
    expect([none.eligibleCount, none.visibleCount, none.average, none.median]).toEqual([0, 0, null, null]);
  });

  it('T09: um ponto visível, média e mediana coincidem', () => {
    const s = comparisonStats(paidPoints(), MONTHS.filter((m) => m !== '2026-05'));
    expect(s.visibleCount).toBe(1);
    expect(s.eligibleCount).toBe(6);
    expect(s.average).toBe(345_000);
    expect(s.median).toBe(345_000);
    expect(s.visibleSum).toBe(345_000n);
    expect(s.canonicalTotal).toBe(2_475_000n);
  });

  it('T10: mês sem registros fica fora de N, de n e da média, mas o total o inclui com valor 0', () => {
    const points = evolutionPoints(overview, 'recebido', AFTER);
    const s = comparisonStats(points, []);
    expect(s.eligibleCount).toBe(5);
    expect(s.visibleCount).toBe(5);
    expect(s.average).toBe(506_000); // 2.530.000 ÷ 5, e não ÷ 6
    expect(s.median).toBe(500_000);
    expect(s.visibleMonths).not.toContain('2026-03');
    // Ocultar um mês sem registros não muda nada e ele não conta como oculto.
    const withHidden = comparisonStats(points, ['2026-03']);
    expect(withHidden).toEqual(s);
    expect(withHidden.hiddenMonths).toEqual([]);
  });

  it('mês em andamento fica fora da média e da mediana, mas entra no total canônico', () => {
    const points = evolutionPoints(
      [...overview.slice(0, 5), { month: '2026-06', receivedCount: 1, receivedCents: 1, paidCount: 2, paidCents: 40_000 }],
      'pago',
      '2026-06',
    );
    expect(points[5]).toEqual({ month: '2026-06', cents: 40_000, count: 2, state: 'em_andamento' });
    const s = comparisonStats(points, []);
    expect(s.eligibleCount).toBe(5);
    expect(s.visibleCount).toBe(5);
    expect(s.visibleSum).toBe(2_115_000n);
    expect(s.average).toBe(423_000);
    expect(s.median).toBe(340_000);
    expect(s.canonicalTotal).toBe(2_155_000n);
    expect(s.visibleMonths).not.toContain('2026-06');
    // Ocultar o mês em andamento não muda a comparação nem entra na lista de ocultos.
    expect(comparisonStats(points, ['2026-06'])).toEqual(s);
  });

  it('a regra de elegibilidade é um parâmetro: o padrão é só com_registros, e sem_registros nunca entra', () => {
    expect(COMPARISON_ELIGIBLE_STATES).toEqual(['com_registros']);
    const points = [point('2026-04', 100_000), point('2026-05', 200_000, 1, 'em_andamento'), point('2026-06', 0, 0, 'sem_registros')];
    expect(comparisonStats(points, []).eligibleCount).toBe(1);
    const withCurrent = comparisonStats(points, [], ['com_registros', 'em_andamento']);
    expect([withCurrent.eligibleCount, withCurrent.visibleCount, withCurrent.average, withCurrent.median]).toEqual([2, 2, 150_000, 150_000]);
    // Pedir sem_registros (fora do tipo) não o torna elegível: o zero não vira dado.
    const forced = comparisonStats(points, [], ['com_registros', 'em_andamento', 'sem_registros'] as never);
    expect(forced).toEqual(withCurrent);
    expect(forced.canonicalTotal).toBe(300_000n);
  });

  it('mês oculto que não existe nos pontos é ignorado', () => {
    const s = comparisonStats(paidPoints(), ['2025-12', '2027-01', 'abril']);
    expect(s).toEqual(comparisonStats(paidPoints(), []));
    expect(s.hiddenMonths).toEqual([]);
  });

  it('aceita lista ou conjunto de meses ocultos, com repetidos', () => {
    const fromList = comparisonStats(paidPoints(), ['2026-04', '2026-04']);
    expect(fromList.visibleCount).toBe(5);
    expect(comparisonStats(paidPoints(), new Set(['2026-04']))).toEqual(fromList);
  });

  it('mediana com empate', () => {
    const stats = (...cents: number[]) => comparisonStats(cents.map((c, i) => point(`2026-0${i + 1}`, c)), []);
    expect(stats(100, 200, 200, 300).median).toBe(200);
    expect(stats(200, 200, 200, 200).median).toBe(200);
    expect(stats(100, 100, 300, 300).median).toBe(200);
    expect(stats(5, 5, 9).median).toBe(5);
    expect(stats(9, 5, 5).median).toBe(5);
    expect(stats(7, 7, 7).median).toBe(7);
    expect(stats(100, 200, 200, 300).average).toBe(200);
  });

  it('mediana com n par arredonda metade para cima e ignora a ordem dos pontos', () => {
    const stats = (...cents: number[]) => comparisonStats(cents.map((c, i) => point(`2026-0${i + 1}`, c)), []);
    expect(stats(1, 2).median).toBe(2); // 1,5
    expect(stats(4, 1).median).toBe(3); // 2,5
    expect(stats(10, 1, 7, 3).median).toBe(5); // (3 + 7) ÷ 2
    expect(stats(3, 1, 2).median).toBe(2);
    expect(stats(0, 0).median).toBe(0);
  });

  it('T21: valores extremos em centavos, sem perda de precisão', () => {
    const max = Number.MAX_SAFE_INTEGER; // 9.007.199.254.740.991
    const big = [point('2026-01', max), point('2026-02', max - 1), point('2026-03', max)];
    const s = comparisonStats(big, []);
    expect(s.visibleSum).toBe(3n * BigInt(max) - 1n);
    expect(s.canonicalTotal).toBe(27_021_597_764_222_972n); // acima de 2^53: em número perderia centavos
    expect(s.average).toBe(max); // (3 × max − 1) ÷ 3 = max − 1/3, arredonda para max
    expect(s.median).toBe(max);
    const pair = comparisonStats(big.slice(0, 2), []);
    expect(pair.visibleSum).toBe(18_014_398_509_481_981n);
    expect(pair.average).toBe(max); // 9.007.199.254.740.990,5 sobe
    expect(pair.median).toBe(max);
    expect(comparisonStats(big, ['2026-01']).visibleSum).toBe(2n * BigInt(max) - 1n);
    expect(comparisonStats(big, ['2026-01']).canonicalTotal).toBe(3n * BigInt(max) - 1n);
    // Centavos: 0,01 e 0,02 têm média 0,02 (metade para cima), nada de 0,015.
    const cents = comparisonStats([point('2026-01', 1), point('2026-02', 2)], []);
    expect(cents.average).toBe(2);
    expect(cents.visibleSum).toBe(3n);
    // Somar em ponto flutuante daria outro resultado; aqui a conta fecha centavo a centavo.
    const many = Array.from({ length: 12 }, (_, i) => point(`2026-${String(i + 1).padStart(2, '0')}`, 999_999_999));
    expect(comparisonStats(many, []).visibleSum).toBe(11_999_999_988n);
    expect(comparisonStats(many, []).average).toBe(999_999_999);
  });

  it('não altera os pontos nem os meses ocultos que recebe', () => {
    const points = Object.freeze(paidPoints().map((p) => Object.freeze(p)));
    const hidden = Object.freeze(['2026-04', '2026-01']);
    const before = JSON.stringify(points);
    comparisonStats(points, hidden);
    expect(JSON.stringify(points)).toBe(before);
    expect(hidden).toEqual(['2026-04', '2026-01']);
  });
});

describe('pointVariation', () => {
  const points = paidPoints();
  const [jan, , mar, apr, may] = points as [EvolutionPoint, EvolutionPoint, EvolutionPoint, EvolutionPoint, EvolutionPoint, EvolutionPoint];

  it('março para abril: +450.000, 1.364 permille, meses vizinhos', () => {
    expect(pointVariation(mar, apr)).toEqual({
      fromMonth: '2026-03',
      toMonth: '2026-04',
      adjacent: true,
      differenceCents: 450_000,
      comparable: true,
      permille: 1_364, // 1.363,64 sobe
    });
  });

  it('T14: março para maio, com abril fora da comparação, traz as duas datas e não é mês a mês', () => {
    // Quem oculta abril não muda os pontos de março e maio: a variação é entre as duas datas reais.
    const stats = comparisonStats(points, ['2026-04']);
    expect(stats.visibleMonths).toContain('2026-03');
    expect(stats.visibleMonths).toContain('2026-05');
    expect(stats.visibleMonths).not.toContain('2026-04');
    expect(pointVariation(mar, may)).toEqual({
      fromMonth: '2026-03',
      toMonth: '2026-05',
      adjacent: false,
      differenceCents: 15_000,
      comparable: true,
      permille: 45, // 45,45
    });
    expect(pointVariation(jan, may).adjacent).toBe(false);
  });

  it('queda: diferença negativa e percentual arredondado para longe do zero', () => {
    const v = pointVariation(apr, may);
    expect(v.differenceCents).toBe(-435_000);
    expect(v.comparable && v.permille).toBe(-558); // -557,69
    expect(v.adjacent).toBe(true);
    // De volta no tempo também vale: de abril para março.
    const back = pointVariation(apr, mar);
    expect(back.fromMonth).toBe('2026-04');
    expect(back.toMonth).toBe('2026-03');
    expect(back.adjacent).toBe(true);
    expect(back.comparable && back.permille).toBe(-577); // -576,92
  });

  it('meses vizinhos na virada do ano e meses iguais', () => {
    expect(pointVariation(point('2025-12', 100), point('2026-01', 150)).adjacent).toBe(true);
    expect(pointVariation(point('2026-01', 100), point('2025-12', 150)).adjacent).toBe(true);
    expect(pointVariation(point('2025-11', 100), point('2026-01', 150)).adjacent).toBe(false);
    expect(pointVariation(point('2025-01', 100), point('2026-01', 150)).adjacent).toBe(false);
    expect(pointVariation(point('2026-03', 100), point('2026-03', 150)).adjacent).toBe(false);
  });

  it('sem variação: diferença 0 e 0 permille', () => {
    const v = pointVariation(point('2026-01', 500), point('2026-02', 500));
    expect(v).toMatchObject({ differenceCents: 0, comparable: true, permille: 0 });
  });

  it('T27: base zero, percentual não comparável (nunca infinito) e diferença em centavos', () => {
    const v = pointVariation(point('2026-03', 0), point('2026-04', 780_000));
    expect(v.comparable).toBe(false);
    expect(v.permille).toBeNull();
    expect(v.differenceCents).toBe(780_000);
    expect(v.adjacent).toBe(true);
    // Base zero com lançamentos (valor que o banco não aceita, mas a conta não pode dividir por zero).
    const zeroWithRecords = pointVariation(point('2026-03', 0, 3), point('2026-04', 10));
    expect(zeroWithRecords.comparable).toBe(false);
    expect(zeroWithRecords.permille).toBeNull();
    // Zero em b, com base positiva, é comparável: -100%.
    const toZero = pointVariation(point('2026-03', 500), point('2026-04', 0, 1));
    expect(toZero).toMatchObject({ comparable: true, permille: -1_000, differenceCents: -500 });
  });

  it('T10 e T28: mês sem registros em qualquer ponta não gera percentual', () => {
    const empty = point('2026-03', 0, 0, 'sem_registros');
    const full = point('2026-04', 780_000);
    expect(pointVariation(empty, full).comparable).toBe(false);
    const toEmpty = pointVariation(full, point('2026-05', 0, 0, 'sem_registros'));
    expect(toEmpty.comparable).toBe(false);
    expect(toEmpty.permille).toBeNull();
  });

  it('valores extremos: percentual exato em bigint e erro claro quando não cabe', () => {
    const max = Number.MAX_SAFE_INTEGER;
    const v = pointVariation(point('2026-01', max - 1), point('2026-02', max));
    expect(v).toMatchObject({ differenceCents: 1, comparable: true, permille: 0 });
    const huge = pointVariation(point('2026-01', max), point('2026-02', 0, 1));
    expect(huge).toMatchObject({ differenceCents: -max, comparable: true, permille: -1_000 });
    expect(() => pointVariation(point('2026-01', 1), point('2026-02', max))).toThrow(RangeError);
  });

  it('não altera os pontos que recebe', () => {
    const a = Object.freeze(point('2026-03', 330_000));
    const b = Object.freeze(point('2026-04', 780_000));
    expect(() => pointVariation(a, b)).not.toThrow();
    expect(a).toEqual(point('2026-03', 330_000));
  });
});

/**
 * Entender o que mudou (fase 2, EF-16 e EF-17): a descrição determinística da diferença entre dois meses por categoria e por
 * lançamento. Nada é causa: a soma das categorias mostradas pode não fechar a diferença, e a sobra é dita à parte.
 */
describe('explainChange', () => {
  let seq = 0;
  const record = (category: string | null, amountCents: number, description: string, occurredOn: string, kind: 'despesa' | 'receita' = 'despesa'): FinancialRecord => ({
    id: `r${++seq}`,
    contextId: 'c',
    accountId: 'a',
    kind,
    status: 'realizado',
    amountCents,
    currency: 'BRL',
    occurredOn,
    description,
    category,
    commitmentId: null,
    invoice: null,
    receiptKey: null,
    createdBy: 'p',
    version: 1,
    createdAt: `${occurredOn}T00:00:00Z`,
    updatedAt: `${occurredOn}T00:00:00Z`,
  });
  const sum = (records: readonly FinancialRecord[]) => records.reduce((a, r) => a + r.amountCents, 0);
  const side = (month: string, records: readonly FinancialRecord[]) => ({ month, totalCents: sum(records), parts: paidCategoryParts(records) });

  // Março: Casa R$ 1.200,00 e Mercado R$ 800,00. Abril: Casa R$ 5.600,00 (com o reparo de R$ 4.400,00), Mercado R$ 800,00 e Lazer R$ 100,00.
  const march = [record('Casa', 120_000, 'Aluguel', '2026-03-05'), record('Mercado', 80_000, 'Mercado', '2026-03-12')];
  const april = [
    record('Casa', 120_000, 'Aluguel', '2026-04-05'),
    record('Casa', 440_000, 'Reparo do carro', '2026-04-22'),
    record('Mercado', 80_000, 'Mercado', '2026-04-12'),
    record('Lazer', 10_000, 'Cinema', '2026-04-24'),
  ];

  it('a diferença total, as categorias com maior diferença e os lançamentos relacionados; quando as categorias fecham a diferença, nada sobra', () => {
    const e = explainChange(side('2026-03', march), side('2026-04', april));
    expect(e).toMatchObject({ fromMonth: '2026-03', toMonth: '2026-04', fromCents: 200_000, toCents: 650_000, differenceCents: 450_000, reconciled: true });
    expect(e.categories).toEqual([
      { category: 'Casa', label: 'Casa', fromCents: 120_000, toCents: 560_000, differenceCents: 440_000 },
      { category: 'Lazer', label: 'Lazer', fromCents: 0, toCents: 10_000, differenceCents: 10_000 },
    ]);
    // 440.000 + 10.000 fecham os 450.000: nada sobra.
    expect(e.otherCents).toBe(0);
    expect(e.related.map((r) => [r.description, r.occurredOn, r.cents, r.partial])).toEqual([
      ['Reparo do carro', '2026-04-22', 440_000, false],
      ['Aluguel', '2026-04-05', 120_000, false],
    ]);
  });

  it('só as 3 categorias que mais mudaram entram, e a sobra das outras é dita à parte, com sinal', () => {
    const base = [record('Casa', 100_000, 'a', '2026-03-01'), record('Mercado', 100_000, 'b', '2026-03-02'), record('Lazer', 100_000, 'c', '2026-03-03'), record('Saúde', 100_000, 'd', '2026-03-04'), record('Educação', 100_000, 'e', '2026-03-05')];
    const next = [
      record('Casa', 600_000, 'a', '2026-04-01'),
      record('Mercado', 300_000, 'b', '2026-04-02'),
      record('Lazer', 20_000, 'c', '2026-04-03'),
      record('Saúde', 110_000, 'd', '2026-04-04'),
      record('Educação', 105_000, 'e', '2026-04-05'),
    ];
    const e = explainChange(side('2026-03', base), side('2026-04', next));
    expect(EXPLAIN_TOP_CATEGORIES).toBe(3);
    expect(e.categories.map((c) => [c.label, c.differenceCents])).toEqual([['Casa', 500_000], ['Mercado', 200_000], ['Lazer', -80_000]]);
    // Total: 1.135.000 − 500.000 = 635.000; as 3 somam 620.000; Saúde (+10.000) e Educação (+5.000) sobram.
    expect(e.differenceCents).toBe(635_000);
    expect(e.otherCents).toBe(15_000);
  });

  it('a sobra pode ser negativa, e vale 0 quando as categorias mostradas fecham a diferença', () => {
    const base = [record('Casa', 100_000, 'a', '2026-03-01'), record('Mercado', 100_000, 'b', '2026-03-02'), record('Lazer', 100_000, 'c', '2026-03-03'), record('Saúde', 100_000, 'd', '2026-03-04')];
    const next = [record('Casa', 300_000, 'a', '2026-04-01'), record('Mercado', 250_000, 'b', '2026-04-02'), record('Lazer', 220_000, 'c', '2026-04-03'), record('Saúde', 90_000, 'd', '2026-04-04')];
    const e = explainChange(side('2026-03', base), side('2026-04', next));
    expect(e.categories.map((c) => c.label)).toEqual(['Casa', 'Mercado', 'Lazer']);
    expect(e.otherCents).toBe(-10_000);
    expect(explainChange(side('2026-03', march), side('2026-04', april)).otherCents).toBe(0);
  });

  it('a diferença para menos: as categorias com sinal negativo, e o lançamento relacionado é do mês de chegada', () => {
    const e = explainChange(side('2026-04', april), side('2026-03', march));
    expect(e).toMatchObject({ differenceCents: -450_000, reconciled: true });
    expect(e.categories.map((c) => [c.label, c.differenceCents])).toEqual([['Casa', -440_000], ['Lazer', -10_000]]);
    // O mês de chegada é março: os maiores lançamentos dele na Casa.
    expect(e.related.map((r) => [r.description, r.cents])).toEqual([['Aluguel', 120_000]]);
  });

  it('empate de diferença: pelo nome da categoria; empate de valor do lançamento: data mais recente, depois a descrição e o id', () => {
    const base = [record('Zoo', 10_000, 'z', '2026-03-01'), record('Lazer', 10_000, 'l', '2026-03-01')];
    const next = [record('Zoo', 20_000, 'z', '2026-04-01'), record('Lazer', 20_000, 'l', '2026-04-01')];
    expect(explainChange(side('2026-03', base), side('2026-04', next)).categories.map((c) => c.label)).toEqual(['Lazer', 'Zoo']);
    const tie = [
      record('Casa', 50_000, 'B', '2026-04-10'),
      record('Casa', 50_000, 'A', '2026-04-10'),
      record('Casa', 50_000, 'C', '2026-04-20'),
      record('Casa', 40_000, 'D', '2026-04-30'),
      record('Casa', 30_000, 'E', '2026-04-30'),
    ];
    const e = explainChange(side('2026-03', []), side('2026-04', tie));
    expect(EXPLAIN_TOP_RECORDS).toBe(3);
    expect(e.related.map((r) => r.description)).toEqual(['C', 'A', 'B']);
  });

  it('é determinística, não altera o que recebe e dá o mesmo resultado com as partes em outra ordem', () => {
    const a = side('2026-03', march);
    const b = side('2026-04', april);
    const before = JSON.stringify([a, b]);
    const first = explainChange(a, b);
    expect(JSON.stringify([a, b])).toBe(before);
    expect(explainChange(a, b)).toEqual(first);
    expect(explainChange({ ...a, parts: [...a.parts].reverse() }, { ...b, parts: [...b.parts].reverse() })).toEqual(first);
  });

  it('diferença zero e nenhuma categoria mudou: nada a listar; só a diferença total zero com categorias que se compensam lista as categorias', () => {
    const same = explainChange(side('2026-03', march), side('2026-04', march.map((r) => ({ ...r, id: `${r.id}b`, occurredOn: r.occurredOn.replace('-03-', '-04-') }))));
    expect(same).toMatchObject({ differenceCents: 0, reconciled: true, categories: [], otherCents: 0, related: [] });
    const swapped = explainChange(
      side('2026-03', [record('Casa', 10_000, 'a', '2026-03-01'), record('Mercado', 20_000, 'b', '2026-03-01')]),
      side('2026-04', [record('Casa', 20_000, 'a', '2026-04-01'), record('Mercado', 10_000, 'b', '2026-04-01')]),
    );
    expect(swapped.differenceCents).toBe(0);
    expect(swapped.categories.map((c) => [c.label, c.differenceCents])).toEqual([['Casa', 10_000], ['Mercado', -10_000]]);
    expect(swapped.otherCents).toBe(0);
  });

  it('categoria que some ou aparece vale 0 no outro mês, e "Sem categoria" entra como qualquer outra', () => {
    const e = explainChange(side('2026-03', [record(null, 30_000, 'x', '2026-03-01')]), side('2026-04', [record('Lazer', 30_000, 'y', '2026-04-01'), record(null, 5_000, 'z', '2026-04-02')]));
    expect(e.categories.map((c) => [c.category, c.label, c.fromCents, c.toCents])).toEqual([
      ['Lazer', 'Lazer', 0, 30_000],
      [null, 'Sem categoria', 30_000, 5_000],
    ]);
    expect(e.differenceCents).toBe(5_000);
    expect(e.otherCents).toBe(0);
  });

  it('T15: cartão, compra, estorno e pagamento da fatura no repositório: as partes por categoria somam o Pago do mês, uma só vez', async () => {
    const key = newOperationKey;
    const clock = { today: '2026-10-07' };
    const repo = new MemoryRepository({ actorId: 'pessoa-teste', displayName: 'Pessoa de teste', today: () => clock.today });
    const space = await repo.ensurePersonalSpace('Conta principal');
    const ctx = space.personalContextId;
    // Outubro: um gasto comum de Mercado, R$ 100,00.
    await repo.createRecord(key(), ctx, 'despesa', { accountId: space.accounts[0]!.id, amountCents: 10_000, occurredOn: '2026-10-06', description: 'Feira', category: 'Mercado' });
    // Cartão que fecha dia 3: as duas compras (R$ 600,00 em Lazer e R$ 400,00 em Mercado) caem na fatura de novembro, com o estorno de R$ 150,00 em Lazer.
    const { card } = await repo.createCard(key(), ctx, { name: 'Cartão de teste', lastDigits: '1234', closingDay: 3, dueDay: 10, limitCents: 500_000 });
    await repo.addCardPurchase(key(), card.id, { description: 'Tênis', category: 'Lazer', purchasedOn: '2026-10-05', totalCents: 60_000, installments: 1 });
    await repo.addCardPurchase(key(), card.id, { description: 'Compras do mês', category: 'Mercado', purchasedOn: '2026-10-06', totalCents: 40_000, installments: 1 });
    clock.today = '2026-11-04';
    await repo.addCardRefund(key(), card.id, { description: 'Devolução do tênis', category: 'Lazer', amountCents: 15_000, invoiceMonth: '2026-11' });
    // Compra e estorno no cartão ainda não são gasto.
    expect(summarizeMonth(await repo.listRecords(ctx, '2026-11'), ctx, '2026-11').paidCents).toBe(0);
    clock.today = '2026-11-08';
    const invoice = (await loadInvoices(repo, (await repo.getCard(card.id))!, clock.today)).find((i) => i.month === '2026-11')!;
    expect(invoice.totalCents).toBe(60_000 + 40_000 - 15_000);
    await repo.payInvoice(key(), card.id, '2026-11', invoice.commitmentVersion!, 85_000, '2026-11-08');

    // O que o app lê de cada mês: os lançamentos, as faturas deles, as partes por categoria e o total do gráfico (monthsOverview).
    const read = async (month: string) => {
      const records = await repo.listRecords(ctx, month);
      const summary = summarizeMonth(records, ctx, month);
      const invoices = await loadInvoicesOfRecords(repo, summary.composition.paid, clock.today);
      const parts = paidCategoryParts(summary.composition.paid, invoices);
      return { records, summary, invoices, parts, side: { month, totalCents: summary.paidCents, parts } };
    };
    const overviewPaid = (await repo.monthsOverview(ctx, '2026-10', '2026-11')).map((r) => r.paidCents);
    const [oct, nov] = [await read('2026-10'), await read('2026-11')];
    expect(overviewPaid).toEqual([10_000, 85_000]);
    expect([oct.summary.paidCents, nov.summary.paidCents]).toEqual(overviewPaid);

    // Novembro tem um só lançamento: o pagamento da fatura. As compras e o estorno do cartão não viram lançamento.
    expect(nov.records).toHaveLength(1);
    expect(nov.records[0]).toMatchObject({ kind: 'despesa', amountCents: 85_000, invoice: { cardId: card.id, month: '2026-11' } });
    // Lazer: 600,00 menos o estorno de 150,00; Mercado: 400,00. As partes somam o Pago do mês e cada lançamento só entra uma vez.
    expect(nov.parts.map((p) => [p.label, p.cents, p.part])).toEqual([['Lazer', 45_000, true], ['Mercado', 40_000, true]]);
    expect(nov.parts.reduce((a, p) => a + p.cents, 0)).toBe(nov.summary.paidCents);
    expect(new Set(nov.parts.map((p) => p.record.id))).toEqual(new Set([nov.records[0]!.id]));
    expect(oct.parts.reduce((a, p) => a + p.cents, 0)).toBe(oct.summary.paidCents);

    // categoryBreakdown (Por categoria) dá as mesmas categorias e os mesmos centavos.
    const rows = categoryBreakdown(nov.summary.composition.paid, nov.invoices);
    expect(rows.map((r) => [r.label, r.cents])).toEqual([['Lazer', 45_000], ['Mercado', 40_000]]);
    expect(rows.reduce((a, r) => a + r.cents, 0)).toBe(nov.summary.paidCents);

    // explainChange parte das mesmas partes: as categorias de cada mês somam o Pago dele e a diferença fecha, sem sobra.
    const e = explainChange(oct.side, nov.side);
    expect(e).toMatchObject({ fromCents: 10_000, toCents: 85_000, differenceCents: 75_000, reconciled: true, otherCents: 0 });
    expect(e.categories.map((c) => [c.label, c.fromCents, c.toCents, c.differenceCents])).toEqual([
      ['Lazer', 0, 45_000, 45_000],
      ['Mercado', 10_000, 40_000, 30_000],
    ]);
    expect(e.categories.reduce((a, c) => a + c.fromCents, 0)).toBe(oct.summary.paidCents);
    expect(e.categories.reduce((a, c) => a + c.toCents, 0)).toBe(nov.summary.paidCents);
    expect(e.categories.reduce((a, c) => a + c.differenceCents, 0)).toBe(e.differenceCents);
    // O lançamento relacionado mostra só a parte do pagamento que cabe à categoria que mais mudou (Lazer).
    expect(e.related).toEqual([{ id: nov.records[0]!.id, description: nov.records[0]!.description, occurredOn: '2026-11-08', cents: 45_000, recordCents: 85_000, partial: true }]);
    repo.checkInvariants();
  });

  it('Recebido usa as mesmas contas, com as categorias dos recebimentos', () => {
    const received = (month: string, rows: [string, number][]) => ({
      month,
      totalCents: rows.reduce((a, r) => a + r[1], 0),
      parts: receivedCategoryParts(rows.map(([category, cents], i) => record(category, cents, `Recebimento ${i}`, `${month}-05`, 'receita'))),
    });
    const e = explainChange(received('2026-02', [['Salário', 500_000]]), received('2026-04', [['Salário', 500_000], ['Freela', 120_000]]));
    expect(e.differenceCents).toBe(120_000);
    expect(e.categories.map((c) => [c.label, c.differenceCents])).toEqual([['Freela', 120_000]]);
    expect(e.related.map((r) => r.cents)).toEqual([120_000]);
  });

  it('partes que não fecham com o total do mês: reconciled falso, sem categorias, sem sobra e sem lançamentos', () => {
    const wrong = explainChange({ ...side('2026-03', march), totalCents: 250_000 }, side('2026-04', april));
    expect(wrong).toMatchObject({ reconciled: false, categories: [], otherCents: 0, related: [], differenceCents: 400_000 });
    const missing = explainChange(side('2026-03', march), { month: '2026-04', totalCents: 650_000, parts: april.slice(0, 2).map((r) => paidCategoryParts([r])[0]!) });
    expect(missing.reconciled).toBe(false);
  });

  it('entradas inválidas lançam RangeError: mês inválido, meses iguais, total negativo ou não inteiro, parte negativa', () => {
    const a = side('2026-03', march);
    const b = side('2026-04', april);
    expect(() => explainChange({ ...a, month: '2026-13' }, b)).toThrow(RangeError);
    expect(() => explainChange(a, { ...b, month: '2026-03' })).toThrow(RangeError);
    expect(() => explainChange({ ...a, totalCents: -1 }, b)).toThrow(RangeError);
    expect(() => explainChange(a, { ...b, totalCents: 1.5 })).toThrow(RangeError);
    const negative: CategoryPart = { ...a.parts[0]!, cents: -5 };
    expect(() => explainChange({ ...a, parts: [negative] }, b)).toThrow(RangeError);
  });

  it('perto de Number.MAX_SAFE_INTEGER as somas e as diferenças continuam exatas (uma conta em reais, em ponto flutuante, já erra aqui)', () => {
    const marchBig = [record('Casa', 1_000_000_000_000_001, 'Aluguel', '2026-03-05'), record('Mercado', 3_000_000_000_000_007, 'Mercado', '2026-03-12')];
    const aprilBig = [record('Casa', 4_500_000_000_000_003, 'Aluguel', '2026-04-05'), record('Mercado', 4_507_199_254_740_981, 'Mercado', '2026-04-12')];
    // Os dados separam as duas contas: em reais (centavos / 100), a diferença total e a de Casa não voltam aos mesmos centavos.
    const inReais = (to: number, from: number) => Math.round((to / 100 - from / 100) * 100);
    expect(inReais(9_007_199_254_740_984, 4_000_000_000_000_008)).not.toBe(5_007_199_254_740_976);
    expect(inReais(4_500_000_000_000_003, 1_000_000_000_000_001)).not.toBe(3_500_000_000_000_002);
    expect(sum(aprilBig)).toBeLessThanOrEqual(Number.MAX_SAFE_INTEGER);
    const e = explainChange(side('2026-03', marchBig), side('2026-04', aprilBig));
    expect(e).toMatchObject({ fromCents: 4_000_000_000_000_008, toCents: 9_007_199_254_740_984, differenceCents: 5_007_199_254_740_976, reconciled: true, otherCents: 0 });
    expect(e.categories.map((c) => [c.label, c.differenceCents])).toEqual([['Casa', 3_500_000_000_000_002], ['Mercado', 1_507_199_254_740_974]]);
    // Acima do maior inteiro seguro a conta não é exata: lança RangeError em vez de somar errado.
    expect(() => explainChange(side('2026-03', marchBig), { ...side('2026-04', aprilBig), totalCents: Number.MAX_SAFE_INTEGER + 1 })).toThrow(RangeError);
  });
});
