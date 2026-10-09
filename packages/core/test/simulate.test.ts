import { describe, expect, it } from 'vitest';
import {
  DEMO_TODAY,
  SIMULATE_DISCLAIMER,
  SIMULATE_ERROR_TEXT,
  SIMULATE_RESULT_MAX_CENTS,
  SIMULATE_TEXT,
  SIMULATION_FIELD_ORDER,
  SIMULATION_MODES,
  calcJuntarParaObjetivo,
  createDemoRepository,
  emptySimulationDraft,
  finalValueCents,
  goalPlan,
  monthlyForTarget,
  monthlyNeeded,
  monthlyRate,
  monthlyRateText,
  monthsForTarget,
  parseRateBp,
  simulate,
  simulateGrowth,
  simulateLinkParams,
  simulatePrefill,
  simulateValuesFromGoal,
  simulateValuesFromObjetivo,
  simulationGoalPrefill,
  simulationResultLines,
  todayValueCents,
  validateGoalDraft,
  validateSimulationDraft,
  type SimulationDraft,
  type SimulationResult,
} from '../src';

/**
 * Simulador (D-028, Ciclo D): vetores da spec2 §2.6 (taxa equivalente, fator em ponto flutuante e arredondamento só no
 * fim: final para baixo, valor por mês e prazo para cima) e textos da §4.7. Decisão de Enzo de 09/10/2026: os aportes
 * contam no INÍCIO de cada mês, a convenção da Calculadora do Cidadão do Banco Central (Aplicação com depósitos
 * regulares: Sn = (1 + j) × (((1 + j)^n − 1) ÷ j) × p), no lugar do fim do mês da spec2 §2.6. Todos os vetores foram
 * recalculados com um script independente em Python (decimal, 80 dígitos), que também confere o ponto flutuante do
 * core em 20.000 entradas aleatórias, em 6.000 valores por mês e em 6.000 prazos.
 */

const T = SIMULATE_TEXT;

function draft(values: Partial<SimulationDraft>): SimulationDraft {
  return { ...emptySimulationDraft(), ...values };
}

function ok(d: Partial<SimulationDraft>): SimulationResult {
  const out = validateSimulationDraft(draft(d));
  if (!out.ok) throw new Error(`esperava resultado: ${JSON.stringify(out.codes)}`);
  return out.result;
}

/** Gerador determinístico (mulberry32) para as conferências em lote. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

describe('taxa', () => {
  it('parseRateBp: "10" e "10,00" valem 1.000; "10,5" vale 1.050; até 2 casas; de 0% a 30%', () => {
    expect(parseRateBp('10')).toBe(1_000);
    expect(parseRateBp('10,00')).toBe(1_000);
    expect(parseRateBp('10,5')).toBe(1_050);
    expect(parseRateBp(' 10,5 % ')).toBe(1_050);
    expect(parseRateBp('7.25')).toBe(725);
    expect(parseRateBp('0')).toBe(0);
    expect(parseRateBp('0,01')).toBe(1);
    expect(parseRateBp('30')).toBe(3_000);
    expect(parseRateBp('30,00')).toBe(3_000);
    for (const bad of ['30,01', '31', 'abc', '', '   ', '10,555', '-1', '1e1', '10,5,0']) expect(parseRateBp(bad), bad).toBeNull();
  });

  it('monthlyRate: (1 + a)^(1/12) − 1; 10% ao ano dá 0,80% ao mês', () => {
    expect(monthlyRate(0)).toBe(0);
    expect(monthlyRate(1_000)).toBeCloseTo(Math.pow(1.1, 1 / 12) - 1, 15);
    expect(monthlyRate(1_000)).toBeCloseTo(0.0079741404289, 12);
    expect((1 + monthlyRate(3_000)) ** 12).toBeCloseTo(1.3, 12);
    expect(monthlyRateText(1_000)).toBe('0,80%');
    expect(monthlyRateText(450)).toBe('0,37%');
    expect(monthlyRateText(1_200)).toBe('0,95%');
    expect(monthlyRateText(0)).toBe('0,00%');
    expect(monthlyRateText(1)).toBe('menos de 0,01%');
    for (const bad of [-1, 3_001, 10.5, Number.NaN]) {
      expect(() => monthlyRate(bad)).toThrow(RangeError);
      expect(() => monthlyRateText(bad)).toThrow(RangeError);
    }
  });
});

describe('vetores da spec2 §2.6 com aportes no início de cada mês (10% ao ano)', () => {
  it('mensal para juntar R$ 22.500,00 em 14 meses com R$ 4.500,00: R$ 1.175,15; sem rendimento, R$ 1.285,72', () => {
    // Antes (aportes no fim do mês): R$ 1.184,52.
    expect(monthlyForTarget(2_250_000, 450_000, 14, 1_000)).toBe(117_515);
    // Conferência do mensal: final(117.515) = 2.250.012 ≥ 2.250.000 > final(117.514) = 2.249.997.
    expect(finalValueCents(450_000, 117_515, 14, 1_000)).toBe(2_250_012);
    expect(finalValueCents(450_000, 117_514, 14, 1_000)).toBe(2_249_997);
    expect(finalValueCents(450_000, 117_515, 14, 1_000)).toBeGreaterThanOrEqual(2_250_000);
    expect(finalValueCents(450_000, 117_514, 14, 1_000)).toBeLessThan(2_250_000);
    // Sem rendimento: o mesmo número da meta (spec2 §2.5, monthlyNeeded).
    expect(monthlyForTarget(2_250_000, 450_000, 14, 0)).toBe(128_572);
    expect(monthlyNeeded(1_800_000, '2026-11', '2027-12')).toBe(128_572);
    const g = simulateGrowth({ initial: 450_000, monthly: 117_515, months: 14, rateBp: 1_000 });
    expect(g).toMatchObject({ finalCents: 2_250_012, contributedCents: 2_095_210, earningsCents: 154_802, todayValueCents: null });
  });

  it('quanto posso ter com R$ 1.000,00 por mês, 14 meses e R$ 4.500,00: R$ 19.896,17; sem rendimento, R$ 18.500,00', () => {
    // Antes (aportes no fim do mês): R$ 19.778,56.
    expect(finalValueCents(450_000, 100_000, 14, 1_000)).toBe(1_989_617);
    expect(finalValueCents(450_000, 100_000, 14, 0)).toBe(1_850_000);
    const g = simulateGrowth({ initial: 450_000, monthly: 100_000, months: 14, rateBp: 1_000 });
    expect(g).toMatchObject({ finalCents: 1_989_617, contributedCents: 1_850_000, earningsCents: 139_617 });
  });

  it('em quanto tempo chego a R$ 22.500,00 com R$ 1.000,00 por mês e R$ 4.500,00: 17 meses; sem rendimento, 18', () => {
    // O prazo continua em 17 meses (era 17 com aportes no fim do mês): final(16) = 2.223.874 e final(17) = 2.342.404.
    expect(monthsForTarget(2_250_000, 450_000, 100_000, 1_000)).toBe(17);
    expect(finalValueCents(450_000, 100_000, 17, 1_000)).toBe(2_342_404);
    expect(finalValueCents(450_000, 100_000, 16, 1_000)).toBe(2_223_874);
    expect(finalValueCents(450_000, 100_000, 17, 1_000)).toBeGreaterThanOrEqual(2_250_000);
    expect(finalValueCents(450_000, 100_000, 16, 1_000)).toBeLessThan(2_250_000);
    expect(monthsForTarget(2_250_000, 450_000, 100_000, 0)).toBe(18);
    expect(finalValueCents(450_000, 100_000, 18, 0)).toBe(2_250_000);
    expect(finalValueCents(450_000, 100_000, 17, 0)).toBe(2_150_000);
  });

  it('R$ 500,00 por mês por 10 anos: R$ 100.728,79; com inflação de 4,5% ao ano, R$ 64.862,05 em dinheiro de hoje', () => {
    // Antes (aportes no fim do mês): R$ 99.931,92 e R$ 64.348,92.
    expect(finalValueCents(0, 50_000, 120, 1_000)).toBe(10_072_879);
    expect(todayValueCents(10_072_879, 120, 450)).toBe(6_486_205);
    // O dinheiro de hoje só depende do valor e da inflação: o vetor antigo continua valendo como conta isolada.
    expect(todayValueCents(9_993_192, 120, 450)).toBe(6_434_892);
    const g = simulateGrowth({ initial: 0, monthly: 50_000, months: 120, rateBp: 1_000, inflationBp: 450 });
    expect(g.finalCents).toBe(10_072_879);
    expect(g.contributedCents).toBe(6_000_000);
    expect(g.earningsCents).toBe(4_072_879);
    expect(g.todayValueCents).toBe(6_486_205);
    expect(finalValueCents(0, 50_000, 120, 0)).toBe(6_000_000);
  });

  it('convenção: o aporte de cada mês já rende naquele mês (início do mês), como na Calculadora do Cidadão', () => {
    // Um mês: o aporte rende uma vez (no fim do mês seria o próprio aporte). R$ 1.000,00 a 10% ao ano: 1.000,00 × 1,0079741.
    expect(finalValueCents(0, 100_000, 1, 1_000)).toBe(100_797);
    // Dois meses: 1.000,00 × (1,0079741 + 1,0079741²) = 2.023,98 (no fim do mês, 2.007,97).
    expect(finalValueCents(0, 100_000, 2, 1_000)).toBe(202_398);
    // O valor inicial não muda com a convenção: ele rende os n meses; sem aporte, nada muda.
    expect(finalValueCents(450_000, 0, 1, 1_000)).toBe(453_588);
    expect(finalValueCents(450_000, 100_000, 1, 0)).toBe(550_000);
    // Fórmula do Banco Central: Sn = (1 + j) × (((1 + j)^n − 1) ÷ j) × p, com a taxa mensal equivalente j (dentro de 1 centavo).
    for (const [p, n, bp] of [[50_000, 120, 1_000], [100_000, 14, 1_000], [123_456, 36, 450], [9_999, 600, 3_000], [78_901, 7, 1], [250_000, 60, 2_550]] as const) {
      const j = Math.pow(1 + bp / 10_000, 1 / 12) - 1;
      const sn = (1 + j) * ((Math.pow(1 + j, n) - 1) / j) * p;
      expect(Math.abs(finalValueCents(0, p, n, bp) - Math.floor(sn)), `${p} ${n} ${bp}`).toBeLessThanOrEqual(1);
    }
  });
});

describe('contas', () => {
  it('taxa 0: inicial + mensal × n; por mês com teto; prazo com teto', () => {
    expect(finalValueCents(450_000, 100_000, 14, 0)).toBe(1_850_000);
    expect(monthlyForTarget(1_000, 0, 3, 0)).toBe(334);
    expect(monthsForTarget(1_000, 0, 334, 0)).toBe(3);
    expect(monthsForTarget(1_000, 0, 333, 0)).toBe(4);
    expect(monthsForTarget(1_000, 0, 0, 0)).toBeNull();
    expect(monthsForTarget(999_999_999, 0, 100, 0)).toBeNull();
    expect(monthsForTarget(60_000, 0, 100, 0)).toBe(600);
    expect(monthsForTarget(60_001, 0, 100, 0)).toBeNull();
  });

  it('prazo 0 é o valor inicial; o inicial que já alcança dá 0 por mês e 0 meses', () => {
    expect(finalValueCents(450_000, 100_000, 0, 1_000)).toBe(450_000);
    expect(monthlyForTarget(450_000, 450_000, 14, 1_000)).toBe(0);
    expect(monthlyForTarget(450_000, 500_000, 14, 0)).toBe(0);
    expect(monthsForTarget(450_000, 450_000, 0, 1_000)).toBe(0);
    // O inicial sozinho rende até o alvo: R$ 4.500,00 por 14 meses a 10% dão R$ 5.029,25.
    expect(finalValueCents(450_000, 0, 14, 1_000)).toBe(502_925);
    expect(monthlyForTarget(500_000, 450_000, 14, 1_000)).toBe(0);
    expect(monthlyForTarget(502_926, 450_000, 14, 1_000)).toBe(1);
    // Antes (aportes no fim do mês): 6. Agora cada centavo por mês rende em 14 meses cerca de 14,86 centavos (o do 1º mês
    // rende 14 vezes): 5 centavos por mês chegam a 503.000 e 4 centavos, a 502.985.
    expect(monthlyForTarget(503_000, 450_000, 14, 1_000)).toBe(5);
    expect(finalValueCents(450_000, 5, 14, 1_000)).toBe(503_000);
    expect(finalValueCents(450_000, 4, 14, 1_000)).toBe(502_985);
  });

  it('inalcançável em 600 meses: null', () => {
    expect(monthsForTarget(999_999_999, 0, 10_000, 1_000)).toBeNull();
    // Antes (aportes no fim do mês): 553 e 277.
    expect(monthsForTarget(999_999_999, 0, 100_000, 1_000)).toBe(552);
    expect(monthsForTarget(999_999_999, 0, 0, 3_000)).toBeNull();
    expect(monthsForTarget(100_000_000, 0, 100_000, 1_000)).toBe(276);
  });

  it('dinheiro de hoje: inflação 0 ou prazo 0 devolvem o próprio valor', () => {
    expect(todayValueCents(9_993_192, 120, 0)).toBe(9_993_192);
    expect(todayValueCents(9_993_192, 0, 450)).toBe(9_993_192);
    expect(todayValueCents(2_250_010, 14, 450)).toBe(2_137_381);
  });

  it('precisão: o fator usa log1p e expm1 (referência com 80 dígitos, Python Decimal)', () => {
    // Referências com aportes no início do mês: 1.888.265.366,0058..., 162.548.675.352,9979... e 10.226.023.922,0015...
    // A conta direta, com Math.pow(1 + i, n), dava 1.888.265.365, 162.548.675.353 e 10.226.023.921: um centavo a menos,
    // a mais e a menos, por ruído do ponto flutuante.
    expect(finalValueCents(0, 944_120_882, 2, 1)).toBe(1_888_265_366);
    expect(finalValueCents(0, 220_940_145, 224, 1_152)).toBe(162_548_675_352);
    expect(finalValueCents(31_391, 639_079_265, 16, 1)).toBe(10_226_023_922);
  });

  it('referência independente (Python, decimal de 80 dígitos): final, valor por mês e prazo', () => {
    // [inicial, por mês, meses, taxa em pontos-base, final]
    const FINAL_REF: [number, number, number, number, number][] = [
      [42_880_483, 1, 2, 1, 42_881_199],
      [80_668_968, 74_700_088, 12, 13, 977_805_984],
      [450_000, 78_721_496, 600, 450, 172_710_947_743],
      [340_220, 1, 12, 1_000, 374_254],
      [450_000, 1_542_005, 14, 1_050, 23_496_680],
      [450_000, 50_000, 36, 2_500, 3_465_620],
      [50_512_102, 1, 36, 3_000, 110_975_143],
      [12_034_628, 50_000, 36, 7, 13_861_861],
      [0, 50_000, 14, 1, 700_043],
      [450_000, 48_793_813, 1, 13, 49_249_144],
      [450_000, 78_613_715, 120, 450, 11_873_621_575],
      [57_102_035, 80_552_816, 2, 1_000, 221_054_117],
      [450_000, 56_366_903, 408, 1_050, 195_979_237_947],
      [0, 100_000, 526, 2_500, 96_049_017_591],
      [6_561_596, 1, 133, 3_000, 120_194_483],
      [0, 100_000, 440, 7, 44_570_627],
    ];
    for (const [initial, monthly, months, rateBp, expected] of FINAL_REF) {
      expect(finalValueCents(initial, monthly, months, rateBp), [initial, monthly, months, rateBp].join(', ')).toBe(expected);
    }
    // [alvo, inicial, meses, taxa, menor valor por mês com final ≥ alvo]
    const MONTHLY_REF: [number, number, number, number, number][] = [
      [504_120_890, 7_663_770, 6, 1_000, 80_406_347],
      [10_000_000, 450_000, 60, 1_050, 118_491],
      [160_993_498, 0, 60, 3_000, 1_283_377],
      [2_250_000, 450_000, 600, 7, 2_922],
      [10_000_000, 450_000, 60, 1, 159_123],
      [2_250_000, 0, 300, 13, 7_379],
      [2_250_000, 450_000, 60, 450, 25_123],
      [10_000_000, 0, 300, 1_050, 7_442],
      [209_035_783, 0, 600, 2_500, 55],
    ];
    for (const [target, initial, months, rateBp, expected] of MONTHLY_REF) {
      const label = [target, initial, months, rateBp].join(', ');
      expect(monthlyForTarget(target, initial, months, rateBp), label).toBe(expected);
      expect(finalValueCents(initial, expected, months, rateBp), label).toBeGreaterThanOrEqual(target);
      expect(finalValueCents(initial, expected - 1, months, rateBp), label).toBeLessThan(target);
    }
    // [alvo, inicial, por mês, taxa, menor prazo em meses (null: não alcança em 600 meses)]
    const MONTHS_REF: [number, number, number, number, number | null][] = [
      [2_250_000, 0, 10_000, 2_500, 89],
      [718_771_848, 0, 50_000, 3_000, 263],
      [714_588_766, 0, 50_000, 7, null],
      [508_862_197, 450_000, 100_000, 1, null],
      [10_000_000, 2_201_443, 50_000, 13, 154],
      [10_000_000, 0, 50_000, 450, 150],
      [2_250_000, 0, 100_000, 1_000, 21],
      [10_000_000, 450_000, 10_000, 1_050, 230],
      [352_929_677, 0, 215_599, 2_500, 185],
      [10_000_000, 450_000, 10_000, 3_000, 112],
      [635_862_558, 9_590_162, 100_000, 7, null],
      [2_250_000, 450_000, 2_823_085, 1, 1],
    ];
    for (const [target, initial, monthly, rateBp, expected] of MONTHS_REF) {
      expect(monthsForTarget(target, initial, monthly, rateBp), [target, initial, monthly, rateBp].join(', ')).toBe(expected);
    }
  });

  it('limites: valores, prazo, taxa e inflação fora da faixa lançam RangeError', () => {
    expect(() => finalValueCents(-1, 0, 1, 0)).toThrow(RangeError);
    expect(() => finalValueCents(1_000_000_000, 0, 1, 0)).toThrow(RangeError);
    expect(() => finalValueCents(0, 1.5, 1, 0)).toThrow(RangeError);
    expect(() => finalValueCents(0, 1, 601, 0)).toThrow(RangeError);
    expect(() => finalValueCents(0, 1, 1, 3_001)).toThrow(RangeError);
    expect(() => simulateGrowth({ initial: 0, monthly: 1, months: 0, rateBp: 0 })).toThrow(RangeError);
    expect(() => simulateGrowth({ initial: 0, monthly: 1, months: 1, rateBp: 0, inflationBp: 3_001 })).toThrow(RangeError);
    expect(() => monthlyForTarget(0, 0, 1, 0)).toThrow(RangeError);
    expect(() => monthlyForTarget(1_000_000_000, 0, 1, 0)).toThrow(RangeError);
    expect(() => monthsForTarget(1_000, 0, -1, 0)).toThrow(RangeError);
    expect(() => todayValueCents(1, 601, 0)).toThrow(RangeError);
    // Acima de Number.MAX_SAFE_INTEGER (R$ 9.999.999,99 por mês por 50 anos a 30%): RangeError, nunca um número inexato.
    expect(() => finalValueCents(999_999_999, 999_999_999, 600, 3_000)).toThrow(RangeError);
  });

  it('em lote: por mês e prazo mínimos, rendimento nunca negativo, taxa maior nunca rende menos', () => {
    const r = rng(2026);
    const int = (max: number) => Math.floor(r() * (max + 1));
    for (let k = 0; k < 400; k++) {
      const rateBp = [0, 1, 12, 450, 1_000, 3_000, int(3_000)][k % 7]!;
      const months = 1 + int(k % 2 ? 599 : 59);
      const initial = [0, int(1_000_000), int(999_999_999)][k % 3]!;
      const target = 1 + int(999_999_998);
      const m = monthlyForTarget(target, initial, months, rateBp);
      if (initial < target) {
        expect(finalValueCents(initial, m, months, rateBp)).toBeGreaterThanOrEqual(target);
        if (m > 0) expect(finalValueCents(initial, m - 1, months, rateBp)).toBeLessThan(target);
        expect(m).toBeLessThanOrEqual(monthlyForTarget(target, initial, months, 0));
      } else expect(m).toBe(0);
      const monthly = int(k % 2 ? 1_000_000 : 999_999_999);
      const n = monthsForTarget(target, initial, monthly, rateBp);
      if (n !== null && n > 0) {
        expect(finalValueCents(initial, monthly, n, rateBp)).toBeGreaterThanOrEqual(target);
        expect(finalValueCents(initial, monthly, n - 1, rateBp)).toBeLessThan(target);
      }
      if (n === null) expect(finalValueCents(initial, monthly, 600, rateBp)).toBeLessThan(target);
      const g = simulateGrowth({ initial, monthly: Math.min(monthly, 1_000_000), months, rateBp, inflationBp: rateBp });
      expect(g.earningsCents).toBeGreaterThanOrEqual(0);
      expect(g.finalCents).toBeGreaterThanOrEqual(g.todayValueCents!);
      expect(g.finalCents).toBeGreaterThanOrEqual(finalValueCents(initial, Math.min(monthly, 1_000_000), months, 0));
    }
  });
});

describe('ano a ano', () => {
  it('10 anos: uma linha por ano, acumulada, a última igual ao total', () => {
    const g = simulateGrowth({ initial: 0, monthly: 50_000, months: 120, rateBp: 1_000, inflationBp: 450 });
    expect(g.byYear.map((y) => y.months)).toEqual([12, 24, 36, 48, 60, 72, 84, 96, 108, 120]);
    // Antes (aportes no fim do mês): 627.026, 1.316.756, ... 9.993.192 e, em dinheiro de hoje, 600.024, ... 6.434.892.
    expect(g.byYear.map((y) => y.finalCents)).toEqual([632_026, 1_327_256, 2_092_008, 2_933_236, 3_858_587, 4_876_472, 5_996_146, 7_227_788, 8_582_593, 10_072_879]);
    expect(g.byYear.map((y) => y.todayValueCents)).toEqual([604_809, 1_215_408, 1_833_219, 2_459_698, 3_096_327, 3_744_622, 4_406_138, 5_082_473, 5_775_264, 6_486_205]);
    expect(g.byYear.every((y) => !y.partial)).toBe(true);
    for (const y of g.byYear) {
      expect(y.contributedCents).toBe(50_000 * y.months);
      expect(y.earningsCents).toBe(y.finalCents - y.contributedCents);
      expect(y.finalCents).toBe(finalValueCents(0, 50_000, y.months, 1_000));
    }
    const last = g.byYear.at(-1)!;
    expect(last).toMatchObject({ year: 10, finalCents: g.finalCents, contributedCents: g.contributedCents, earningsCents: g.earningsCents, todayValueCents: g.todayValueCents });
  });

  it('14 meses: o segundo ano é parcial; sem inflação, sem dinheiro de hoje', () => {
    const g = simulateGrowth({ initial: 450_000, monthly: 117_515, months: 14, rateBp: 1_000 });
    expect(g.byYear).toEqual([
      { year: 1, months: 12, partial: false, contributedCents: 1_860_180, earningsCents: 120_272, finalCents: 1_980_452, todayValueCents: null },
      { year: 2, months: 14, partial: true, contributedCents: 2_095_210, earningsCents: 154_802, finalCents: 2_250_012, todayValueCents: null },
    ]);
    expect(T.yearLabel(g.byYear[0]!)).toBe('Ano 1');
    expect(T.yearLabel(g.byYear[1]!)).toBe('Ano 2 (até o mês 14)');
    expect(T.yearA11y(g.byYear[1]!)).toBe('Ano 2 (até o mês 14): aportado R$ 20.952,10, rendimento na hipótese R$ 1.548,02, total R$ 22.500,12.');
    expect(T.chartA11y(g, 14)).toBe('Gráfico por ano, até 14 meses: R$ 20.952,10 aportados e R$ 1.548,02 de rendimento na hipótese, total de R$ 22.500,12.');
    expect(simulateGrowth({ initial: 0, monthly: 100, months: 8, rateBp: 0 }).byYear).toEqual([
      { year: 1, months: 8, partial: true, contributedCents: 800, earningsCents: 0, finalCents: 800, todayValueCents: null },
    ]);
  });
});

describe('formulário e textos (spec2 §4.7)', () => {
  it('quanto guardar por mês: R$ 1.175,15 na hipótese; sem rendimento, R$ 1.285,72', () => {
    const r = ok({ mode: 'quanto-guardar', targetText: '22.500,00', initialText: '4.500,00', monthsText: '14', rateText: '10' });
    expect(r).toMatchObject({ reached: false, unreachable: false, monthlyCents: 117_515, monthlyWithoutYieldCents: 128_572, months: 14, monthsWithoutYield: null });
    expect(r.growth).toMatchObject({ finalCents: 2_250_012, contributedCents: 2_095_210, earningsCents: 154_802 });
    expect(r.texts).toEqual({
      intro: 'Para juntar R$ 22.500,00 em 14 meses, começando com R$ 4.500,00:',
      highlight: 'R$ 1.175,15 por mês na hipótese informada',
      lines: ['Sem rendimento, seriam R$ 1.285,72 por mês.'],
    });
    expect(r.hypotheses).toEqual([
      'Taxa de 10% ao ano (0,80% ao mês, taxa equivalente), constante no período.',
      'Aportes no início de cada mês, como na Calculadora do Cidadão do Banco Central.',
      'Valores brutos, sem imposto de renda, IOF ou taxas.',
      'Sem inflação, salvo se informada.',
      'Valor por mês arredondado para cima, no centavo; valores finais para baixo.',
    ]);
    expect(r.disclaimer).toBe('Simulação com as hipóteses que você informou. Não é promessa de rendimento nem recomendação de investimento.');
    expect(r.disclaimer).toBe(SIMULATE_DISCLAIMER);
    expect(r.input).toEqual({ mode: 'quanto-guardar', targetCents: 2_250_000, initialCents: 450_000, months: 14, monthlyCents: null, rateBp: 1_000, inflationBp: null });
    // Taxa 0: aportes no início ou no fim do mês dão o mesmo número.
    expect(ok({ mode: 'quanto-guardar', targetText: '22.500,00', initialText: '4.500,00', monthsText: '14', rateText: '0' }).monthlyCents).toBe(128_572);
  });

  it('quanto posso ter: R$ 100.728,79 em 120 meses; aportado, rendimento, dinheiro de hoje e sem rendimento', () => {
    const r = ok({ mode: 'quanto-ter', monthlyText: '500,00', monthsText: '120', rateText: '10', inflationOn: true, inflationText: '4,5' });
    expect(simulationResultLines(r)).toEqual([
      'Guardando R$ 500,00 por mês por 120 meses:',
      'Na hipótese informada: R$ 100.728,79 em 120 meses',
      'Total aportado: R$ 60.000,00',
      'Rendimento na hipótese: R$ 40.728,79',
      'Em dinheiro de hoje, com inflação de 4,5% ao ano: R$ 64.862,05',
      'Sem rendimento, seriam R$ 60.000,00.',
    ]);
    expect(r.hypotheses[3]).toBe('Inflação de 4,5% ao ano (0,37% ao mês, taxa equivalente), constante no período, só para o valor em dinheiro de hoje.');
    expect(r.hypotheses[4]).toBe('Valores finais arredondados para baixo, no centavo.');
    expect(r.growth!.byYear).toHaveLength(10);
    const withInitial = ok({ mode: 'quanto-ter', initialText: '4.500,00', monthlyText: '1.000,00', monthsText: '14', rateText: '10' });
    expect(simulationResultLines(withInitial)).toEqual([
      'Guardando R$ 1.000,00 por mês por 14 meses, começando com R$ 4.500,00:',
      'Na hipótese informada: R$ 19.896,17 em 14 meses',
      'Total aportado: R$ 18.500,00',
      'Rendimento na hipótese: R$ 1.396,17',
      'Sem rendimento, seriam R$ 18.500,00.',
    ]);
    const alone = ok({ mode: 'quanto-ter', initialText: '4.500,00', monthlyText: '0', monthsText: '14', rateText: '10' });
    expect(alone.texts.intro).toBe('Com R$ 4.500,00 por 14 meses, sem guardar mais nada por mês:');
    expect(alone.texts.highlight).toBe('Na hipótese informada: R$ 5.029,25 em 14 meses');
  });

  it('em quanto tempo: 17 meses na hipótese; 18 sem rendimento', () => {
    const r = ok({ mode: 'em-quanto-tempo', targetText: '22.500,00', initialText: '4.500,00', monthlyText: '1.000,00', rateText: '10' });
    expect(r).toMatchObject({ months: 17, monthsWithoutYield: 18, monthlyCents: 100_000, unreachable: false });
    expect(r.texts).toEqual({
      intro: 'Para juntar R$ 22.500,00, começando com R$ 4.500,00:',
      highlight: 'Com R$ 1.000,00 por mês: 17 meses na hipótese informada; 18 meses sem rendimento.',
      lines: [],
    });
    expect(r.growth!.finalCents).toBe(2_342_404);
    expect(r.hypotheses[4]).toBe('Prazo em meses inteiros, arredondado para cima; valores finais para baixo, no centavo.');
    const far = ok({ mode: 'em-quanto-tempo', targetText: '1.000.000,00', monthlyText: '1.000,00', rateText: '10', inflationOn: true, inflationText: '4,5' });
    // Antes (aportes no fim do mês): 277 meses.
    expect(far.texts.highlight).toBe('Com R$ 1.000,00 por mês: 276 meses na hipótese informada; sem rendimento, não alcança em 50 anos.');
    expect(far.growth).toMatchObject({ finalCents: 100_546_651, contributedCents: 27_600_000, todayValueCents: 36_533_638 });
    expect(far.texts.intro).toBe('Para juntar R$ 1.000.000,00:');
    expect(far.texts.lines).toEqual([T.todayValue(450, far.growth!.todayValueCents!)]);
    expect(far.monthsWithoutYield).toBeNull();
  });

  it('inalcançável em 50 anos e valor já alcançado', () => {
    const never = ok({ mode: 'em-quanto-tempo', targetText: '9.999.999,99', monthlyText: '1,00', rateText: '10' });
    expect(never).toMatchObject({ unreachable: true, months: null, monthsWithoutYield: null, growth: null });
    expect(never.texts.highlight).toBe('Com estes valores, a meta não é alcançada em 50 anos na hipótese informada. Mude o valor por mês ou quanto quer juntar.');
    for (const mode of ['quanto-guardar', 'em-quanto-tempo'] as const) {
      const done = ok({ mode, targetText: '4.500,00', initialText: '4.500,00', monthsText: '14', monthlyText: '100,00', rateText: '10' });
      expect(done).toMatchObject({ reached: true, growth: null, monthlyCents: null, months: null });
      expect(done.texts).toEqual({ intro: null, highlight: 'Com estes números, você já tem o valor que quer juntar.', lines: [] });
      expect(simulationGoalPrefill(done, DEMO_TODAY)).toBeNull();
    }
    expect(simulationGoalPrefill(never, DEMO_TODAY)).toBeNull();
  });

  it('o inicial sozinho chega lá: R$ 0,00 por mês, com a linha que explica', () => {
    const r = ok({ mode: 'quanto-guardar', targetText: '5.000,00', initialText: '4.500,00', monthsText: '14', rateText: '10' });
    expect(r.monthlyCents).toBe(0);
    expect(simulationResultLines(r)).toEqual([
      'Para juntar R$ 5.000,00 em 14 meses, começando com R$ 4.500,00:',
      'R$ 0,00 por mês na hipótese informada',
      'Na hipótese informada, o que você já tem chega a R$ 5.029,25 em 14 meses, sem guardar mais nada por mês.',
      'Sem rendimento, seriam R$ 35,72 por mês.',
    ]);
  });

  it('taxa 0: o resultado é o mesmo sem rendimento, com a hipótese dita', () => {
    const r = ok({ mode: 'quanto-guardar', targetText: '22.500,00', initialText: '4.500,00', monthsText: '14', rateText: '0' });
    expect(r.monthlyCents).toBe(128_572);
    expect(r.monthlyWithoutYieldCents).toBe(128_572);
    expect(r.hypotheses[0]).toBe('Taxa de 0% ao ano: sem rendimento.');
    const half = ok({ mode: 'quanto-ter', monthlyText: '100,00', monthsText: '12', rateText: '10,5' });
    expect(half.hypotheses[0]).toBe('Taxa de 10,5% ao ano (0,84% ao mês, taxa equivalente), constante no período.');
  });

  it('erros: taxa vazia por padrão e obrigatória, faixas, casas, prazo, valores e modo', () => {
    const empty = validateSimulationDraft(emptySimulationDraft());
    expect(empty.ok).toBe(false);
    if (!empty.ok) {
      expect(empty.codes).toEqual({ mode: 'vazio', rateText: 'vazio' });
      expect(empty.errors.mode).toBe('Escolha o que você quer saber.');
      expect(empty.errors.rateText).toBe('Digite a taxa ao ano que quer testar, de 0% a 30%.');
    }
    const base = { mode: 'quanto-guardar' as const, targetText: '22.500,00', monthsText: '14', rateText: '10' };
    const cases: [Partial<SimulationDraft>, string, string, string][] = [
      [{ rateText: '' }, 'rateText', 'vazio', 'Digite a taxa ao ano que quer testar, de 0% a 30%.'],
      [{ rateText: '30,01' }, 'rateText', 'fora_da_faixa', 'Use uma taxa de 0% a 30% ao ano, com até 2 casas.'],
      [{ rateText: '10,555' }, 'rateText', 'casas_demais', 'Use uma taxa de 0% a 30% ao ano, com até 2 casas.'],
      [{ rateText: 'abc' }, 'rateText', 'invalido', 'Use uma taxa de 0% a 30% ao ano, com até 2 casas.'],
      [{ monthsText: '0' }, 'monthsText', 'fora_da_faixa', 'Use um prazo de 1 a 600 meses.'],
      [{ monthsText: '601' }, 'monthsText', 'fora_da_faixa', 'Use um prazo de 1 a 600 meses.'],
      [{ monthsText: '' }, 'monthsText', 'vazio', 'Digite em quantos meses, de 1 a 600.'],
      [{ monthsText: '1,5' }, 'monthsText', 'invalido', 'Use só números inteiros, como 14.'],
      [{ targetText: '' }, 'targetText', 'vazio', 'Digite quanto quer juntar, como 22.500,00.'],
      [{ targetText: '0' }, 'targetText', 'zero', 'Informe um valor maior que zero, como 22.500,00.'],
      [{ targetText: '10.000.000,00' }, 'targetText', 'acima_do_limite', 'O valor máximo é R$ 9.999.999,99.'],
      [{ initialText: 'x' }, 'initialText', 'invalido', 'Confira o valor, como 4.500,00.'],
      [{ inflationOn: true, inflationText: '' }, 'inflationText', 'vazio', 'Digite a inflação ao ano que quer testar, de 0% a 30%.'],
      [{ inflationOn: true, inflationText: '31' }, 'inflationText', 'fora_da_faixa', 'Use uma inflação de 0% a 30% ao ano, com até 2 casas.'],
    ];
    for (const [change, field, code, text] of cases) {
      const out = validateSimulationDraft(draft({ ...base, ...change }));
      expect(out.ok, JSON.stringify(change)).toBe(false);
      if (!out.ok) {
        expect(out.codes, JSON.stringify(change)).toEqual({ [field]: code });
        expect(out.errors, JSON.stringify(change)).toEqual({ [field]: text });
      }
    }
    // Campos de outro modo e inflação desligada são ignorados.
    expect(validateSimulationDraft(draft({ ...base, monthlyText: 'abc', inflationText: 'abc' })).ok).toBe(true);
    // Em quanto tempo: valor por mês maior que zero. Quanto posso ter: zero só com algo já guardado.
    const time = validateSimulationDraft(draft({ mode: 'em-quanto-tempo', targetText: '1.000,00', monthlyText: '0', rateText: '10' }));
    expect(time.ok ? null : time.codes).toEqual({ monthlyText: 'zero' });
    const total = validateSimulationDraft(draft({ mode: 'quanto-ter', monthsText: '12', monthlyText: '0', rateText: '10' }));
    expect(total.ok ? null : total.errors).toEqual({ monthlyText: 'Informe um valor maior que zero, como 1.000,00.' });
    expect(validateSimulationDraft(draft({ mode: 'quanto-ter', monthsText: '12', monthlyText: '', rateText: '10' })).ok).toBe(false);
    // Erros na ordem da tela.
    const many = validateSimulationDraft(draft({ mode: 'quanto-ter', initialText: 'x', monthsText: '0', monthlyText: '', rateText: '99' }));
    expect(many.ok ? [] : Object.keys(many.errors)).toEqual(['initialText', 'monthsText', 'monthlyText', 'rateText']);
  });

  it('resultado acima de R$ 999.999.999.999,99: resultado_alto no prazo', () => {
    const huge = validateSimulationDraft(draft({ mode: 'quanto-ter', initialText: '9.999.999,99', monthlyText: '9.999.999,99', monthsText: '600', rateText: '30' }));
    expect(huge.ok ? null : huge.codes).toEqual({ monthsText: 'resultado_alto' });
    expect(huge.ok ? null : huge.errors.monthsText).toBe('Com estes números, o resultado passa do que o simulador mostra. Use um valor, uma taxa ou um prazo menor.');
    // O inicial sozinho passaria do limite em 50 anos a 30%, mesmo com valor por mês zero.
    const grows = validateSimulationDraft(draft({ mode: 'quanto-guardar', targetText: '9.999.999,99', initialText: '9.999.999,98', monthsText: '600', rateText: '30' }));
    expect(grows.ok ? null : grows.codes).toEqual({ monthsText: 'resultado_alto' });
    // Logo abaixo do limite passa.
    const fits = ok({ mode: 'quanto-ter', monthlyText: '9.999.999,99', monthsText: '600', rateText: '10' });
    expect(fits.growth!.finalCents).toBeLessThanOrEqual(SIMULATE_RESULT_MAX_CENTS);
  });

  it('mensagens: todos os campos têm texto para os códigos que podem aparecer', () => {
    expect(SIMULATION_FIELD_ORDER).toEqual(['mode', 'targetText', 'initialText', 'monthsText', 'monthlyText', 'rateText', 'inflationText']);
    expect(SIMULATION_MODES).toEqual(['quanto-guardar', 'em-quanto-tempo', 'quanto-ter']);
    expect(Object.keys(SIMULATE_ERROR_TEXT.rateText).sort()).toEqual(['casas_demais', 'fora_da_faixa', 'invalido', 'vazio']);
    expect(T.modes).toEqual({ 'quanto-guardar': 'Quanto guardar por mês', 'em-quanto-tempo': 'Em quanto tempo', 'quanto-ter': 'Quanto posso ter' });
    expect(T.fields.rate).toBe('Taxa de rendimento ao ano (%)');
    expect(T.fields.rateHint).toBe('Você informa a taxa que quer testar. O Clarevo não sugere taxas, produtos nem instituições.');
    expect(T.intro).toBe('Faça contas com hipóteses suas. Nada aqui é gravado até você escolher criar uma meta.');
    // Taxa sem valor padrão nem exemplo: nenhuma mensagem de taxa ou inflação sugere um número para digitar.
    for (const text of [...Object.values(SIMULATE_ERROR_TEXT.rateText), ...Object.values(SIMULATE_ERROR_TEXT.inflationText), T.fields.rateHint, T.fields.inflationHint]) {
      expect(text).not.toMatch(/\bcomo\b/i);
    }
    expect(emptySimulationDraft()).toMatchObject({ rateText: '', inflationOn: false, inflationText: '' });
  });

  it('simulate direto: entradas fora dos limites lançam RangeError', () => {
    const input = { mode: 'quanto-ter' as const, targetCents: null, initialCents: 0, months: 12, monthlyCents: 100, rateBp: 1_000, inflationBp: null };
    expect(simulate(input).growth!.finalCents).toBe(finalValueCents(0, 100, 12, 1_000));
    expect(() => simulate({ ...input, rateBp: 3_001 })).toThrow(RangeError);
    expect(() => simulate({ ...input, months: null })).toThrow(RangeError);
    expect(() => simulate({ ...input, mode: 'quanto-guardar', targetCents: null })).toThrow(RangeError);
  });
});

describe('criar meta, links e entradas', () => {
  it('"Criar meta com estes valores": alvo, prazo, já guardado e plano; a taxa não vai para a meta', () => {
    const r = ok({ mode: 'quanto-guardar', targetText: '22.500,00', initialText: '4.500,00', monthsText: '14', rateText: '10' });
    const prefill = simulationGoalPrefill(r, DEMO_TODAY)!;
    expect(prefill).toEqual({ goalType: 'objetivo', targetText: '22.500,00', targetMonthText: '11/2027', initialText: '4.500,00', plannedText: '1.175,15' });
    expect(Object.keys(prefill).some((k) => /taxa|rate|infla/i.test(k))).toBe(false);
    // A meta criada com estes valores: P0 = outubro (sem aporte), 14 meses até novembro de 2027, R$ 1.285,72 sem rendimento.
    const goal = validateGoalDraft(
      { essentialBaseText: '', essentialMonthsText: '', essentialBaseSource: 'informado', name: 'Viagem', ...prefill },
      DEMO_TODAY,
    );
    expect(goal.ok).toBe(true);
    if (goal.ok) {
      expect(goal.input).toMatchObject({ targetCents: 2_250_000, targetMonth: '2027-11', initialCents: 450_000, plannedMonthlyCents: 117_515 });
      expect(monthlyNeeded(2_250_000 - 450_000, '2026-10', goal.input.targetMonth!)).toBe(r.monthlyWithoutYieldCents);
    }
    const total = ok({ mode: 'quanto-ter', monthlyText: '500,00', monthsText: '120', rateText: '10' });
    expect(simulationGoalPrefill(total, DEMO_TODAY)).toEqual({ goalType: 'objetivo', targetText: '100.728,79', targetMonthText: '09/2036', initialText: '', plannedText: '500,00' });
    const time = ok({ mode: 'em-quanto-tempo', targetText: '22.500,00', initialText: '4.500,00', monthlyText: '1.000,00', rateText: '10' });
    expect(simulationGoalPrefill(time, DEMO_TODAY)).toMatchObject({ targetText: '22.500,00', targetMonthText: '02/2028', plannedText: '1.000,00' });
    // Valor na hipótese acima de R$ 9.999.999,99: o alvo fica em branco para a pessoa digitar.
    const big = ok({ mode: 'quanto-ter', monthlyText: '100.000,00', monthsText: '600', rateText: '10' });
    expect(simulationGoalPrefill(big, DEMO_TODAY)!.targetText).toBe('');
    const alone = ok({ mode: 'quanto-guardar', targetText: '5.000,00', initialText: '4.500,00', monthsText: '14', rateText: '10' });
    expect(simulationGoalPrefill(alone, DEMO_TODAY)!.plannedText).toBe('');
  });

  it('link de /simular: centavos inteiros, nunca a taxa; a leitura ignora o que for inválido', () => {
    const params = simulateLinkParams({ modo: 'quanto-guardar', alvoCents: 2_250_000, inicialCents: 450_000, meses: 14, origem: 'meta' });
    expect(params).toEqual({ modo: 'quanto-guardar', alvo: '2250000', inicial: '450000', meses: '14', origem: 'meta' });
    expect(simulatePrefill(params)).toEqual({ mode: 'quanto-guardar', targetText: '22.500,00', initialText: '4.500,00', monthsText: '14', origem: 'meta' });
    expect(simulateLinkParams({ alvoCents: 0, inicialCents: -1, meses: 601, mensalCents: 1_000_000_000, origem: 'Meta!' })).toEqual({});
    expect(
      simulatePrefill({ modo: 'outro', alvo: 'abc', inicial: '0', meses: ['12', '13'], mensal: '-5', taxa: '10', inflacao: '4', origem: 'x'.repeat(31) }),
    ).toEqual({ monthsText: '12' });
    expect(simulatePrefill({ mensal: '100000', modo: ['em-quanto-tempo'] })).toEqual({ mode: 'em-quanto-tempo', monthlyText: '1.000,00' });
  });

  it('da calculadora "Juntar para um objetivo": os mesmos números, e sem rendimento o simulador repete a calculadora', () => {
    const calc = calcJuntarParaObjetivo({ alvo: '22.500,00', jaTem: '4.500,00', modo: 'prazo', meses: '14' });
    expect(calc.ok).toBe(true);
    if (!calc.ok) return;
    const values = simulateValuesFromObjetivo(calc.result);
    expect(values).toEqual({ modo: 'quanto-guardar', alvoCents: 2_250_000, inicialCents: 450_000, meses: 14, origem: 'calculadora' });
    const r = ok({ ...simulatePrefill(simulateLinkParams(values)), rateText: '0' });
    expect(r.monthlyCents).toBe(calc.result.monthlyCents);
    const calc2 = calcJuntarParaObjetivo({ alvo: '22.500,00', jaTem: '4.500,00', modo: 'mensal', mensal: '1.100,00' });
    if (!calc2.ok) throw new Error('calculadora');
    const v2 = simulateValuesFromObjetivo(calc2.result);
    expect(v2).toEqual({ modo: 'em-quanto-tempo', alvoCents: 2_250_000, inicialCents: 450_000, mensalCents: 110_000, origem: 'calculadora' });
    expect(ok({ ...simulatePrefill(simulateLinkParams(v2)), rateText: '0' }).months).toBe(calc2.result.months);
  });

  it('do detalhe da meta (demonstração): Viagem de férias, R$ 480,00 por mês sem rendimento', async () => {
    const repo = await createDemoRepository();
    const ctx = (await repo.getSpace())!.personalContextId;
    const month = await repo.listGoalMovementsInMonth(ctx, '2026-10');
    const trip = (await repo.listGoals(ctx)).find((g) => g.name === 'Viagem de férias')!;
    const plan = goalPlan(trip, month, DEMO_TODAY);
    const values = simulateValuesFromGoal(plan);
    expect(values).toEqual({ modo: 'quanto-guardar', alvoCents: 600_000, inicialCents: 120_000, meses: 10, origem: 'meta' });
    const r = ok({ ...simulatePrefill(simulateLinkParams(values)), rateText: '0' });
    expect(r.monthlyCents).toBe(48_000);
    expect(r.monthlyCents).toBe(plan.deadline!.monthlyCents);
    // Sem prazo e com plano: em quanto tempo; prazo que já passou e sem plano: só alvo e valor guardado.
    expect(simulateValuesFromGoal({ targetCents: 2_250_000, savedCents: 350_000, deadline: null, plannedMonthlyCents: 50_000 })).toEqual({
      modo: 'em-quanto-tempo',
      alvoCents: 2_250_000,
      inicialCents: 350_000,
      mensalCents: 50_000,
      origem: 'meta',
    });
    expect(simulateValuesFromGoal({ targetCents: 100_000, savedCents: 0, deadline: { month: '2026-09', months: 0, monthlyCents: null }, plannedMonthlyCents: null })).toEqual({
      modo: 'quanto-guardar',
      alvoCents: 100_000,
      origem: 'meta',
    });
  });
});
