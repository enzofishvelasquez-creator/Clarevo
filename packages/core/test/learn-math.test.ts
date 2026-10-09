import { describe, expect, it } from 'vitest';
import {
  IOF_DAILY_PPM,
  IOF_FIXED_PPM,
  IOF_MAX_DAYS,
  averageCents,
  compoundTotalBig,
  compoundTotalCents,
  equivalentAnnualBp,
  equivalentAnnualRate,
  equivalentMonthlyBp,
  formatBp,
  formatBpCompact,
  formatInteger,
  formatRate,
  formatTenths,
  impliedMonthlyRate,
  installmentCents,
  iofCents,
  lateChargesCents,
  monthlyShareCents,
  monthsToReach,
  percentTenths,
  presentValueCents,
  realValueCents,
  roundDivBig,
  sacTotals,
  sharesCents,
  simpleTotalCents,
} from '../src';

/** 1, 2, …, n. */
const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, k) => from + k);

/** Vetores da tabela de spec3 §3.11 (conferidos em Python com frações) e de spec4 §1.1. */
describe('learn/math: vetores de spec3 §3.11', () => {
  it('exatidão: compoundTotalCents(100.000, 1.500, 3) = 152.088 (ponto flutuante daria 152.087)', () => {
    expect(compoundTotalCents(100_000, 1_500, 3)).toBe(152_088);
    expect(Math.round(100_000 * 1.15 ** 3)).toBe(152_087);
  });

  it('juros-simples-compostos: 100.000 a 200 bp em 12 meses', () => {
    const simples = simpleTotalCents(100_000, 200, 12);
    const compostos = compoundTotalCents(100_000, 200, 12);
    expect(simples).toBe(124_000);
    expect(compostos).toBe(126_824);
    expect(compostos - simples).toBe(2_824);
  });

  it('taxa-mes-ano: 2% ao mês = 26,82% ao ano (não 24%); 12% ao ano = 0,95% ao mês', () => {
    expect(equivalentAnnualBp(200)).toBe(2_682);
    expect(formatBp(equivalentAnnualBp(200))).toBe('26,82%');
    expect(200 * 12).toBe(2_400);
    expect(equivalentMonthlyBp(1_200)).toBe(95);
    expect(formatBp(equivalentMonthlyBp(1_200))).toBe('0,95%');
  });

  it('cheque-especial: 50.000 × 800 bp = 4.000 no mês; 8% ao mês = 151,82% ao ano', () => {
    expect(compoundTotalCents(50_000, 800, 1) - 50_000).toBe(4_000);
    expect(equivalentAnnualBp(800)).toBe(15_182);
    expect(formatBp(15_182)).toBe('151,82%');
  });

  it('selic: 10% ao ano = 0,80% ao mês; 3% ao mês = 42,58% ao ano', () => {
    expect(equivalentMonthlyBp(1_000)).toBe(80);
    expect(formatBp(80)).toBe('0,80%');
    expect(equivalentAnnualBp(300)).toBe(4_258);
  });

  it('cet: Price de 500.000 a 2% em 12; taxa implícita de 475.000 em 12 × 47.280', () => {
    const parcela = installmentCents(500_000, 200, 12);
    expect(parcela).toBe(47_280);
    expect(parcela * 12).toBe(567_360);
    expect(parcela * 12 - 475_000).toBe(92_360);
    const i = impliedMonthlyRate(475_000, 47_280, 12)!;
    expect(formatRate(i)).toBe('2,85%');
    expect(formatRate(equivalentAnnualRate(i))).toBe('40,03%');
  });

  it('iof-credito: iofCents(200.000, 90) = 760 + 1.476 = 2.236; teto 33.730 ppm', () => {
    expect(iofCents(200_000, 90)).toEqual({ fixedCents: 760, dailyCents: 1_476, totalCents: 2_236 });
    expect(IOF_FIXED_PPM + IOF_DAILY_PPM * IOF_MAX_DAYS).toBe(33_730);
    // Acima de 365 dias, a parte diária para no teto.
    expect(iofCents(1_000_000, 400)).toEqual(iofCents(1_000_000, 365));
    expect(iofCents(1_000_000, 365).totalCents).toBe(33_730);
  });

  it('parcelado-ou-a-vista: 108.000 em 10 × 12.000 e 96.000 em 9 × 12.000', () => {
    expect(10 * 12_000 - 108_000).toBe(12_000);
    const a = impliedMonthlyRate(108_000, 12_000, 10)!;
    expect(formatRate(a)).toBe('1,96%');
    expect(formatRate(equivalentAnnualRate(a))).toBe('26,27%');
    const b = impliedMonthlyRate(96_000, 12_000, 9)!;
    expect(formatRate(b)).toBe('2,42%');
    expect(formatRate(equivalentAnnualRate(b))).toBe('33,28%');
  });

  it('rotativo-cartao: 70.000 a 14%; parcelar o saldo em 24 e em 12 a 8%', () => {
    const saldo = compoundTotalCents(70_000, 1_400, 1);
    expect(saldo - 70_000).toBe(9_800);
    expect(saldo).toBe(79_800);
    const p24 = installmentCents(79_800, 800, 24);
    expect(p24).toBe(7_579);
    expect(p24 * 24).toBe(181_896);
    expect(p24 * 24 - 70_000).toBe(111_896);
    expect(p24 * 24 - 70_000).toBeGreaterThan(70_000);
    expect(Math.min(p24 * 24, 2 * 70_000)).toBe(140_000);
    const p12 = installmentCents(79_800, 800, 12);
    expect(p12).toBe(10_589);
    expect(p12 * 12).toBe(127_068);
    expect(p12 * 12 - 70_000).toBe(57_068);
  });

  it('amortizacao-price-sac: Price e SAC de 1.200.000 a 1% em 12', () => {
    const price = installmentCents(1_200_000, 100, 12);
    expect(price).toBe(106_619);
    expect(price * 12).toBe(1_279_428);
    expect(price * 12 - 1_200_000).toBe(79_428);
    // 1ª parcela da Price: 12.000 de juros e o resto de amortização.
    expect(1_200_000 / 100).toBe(12_000);
    expect(price - 12_000).toBe(94_619);
    const sac = sacTotals(1_200_000, 100, 12);
    expect(sac.interestCents).toBe(78_000);
    expect(sac.firstCents).toBe(112_000);
    expect(sac.lastCents).toBe(101_000);
    expect(sac.totalCents).toBe(1_278_000);
    expect(sac.rows).toHaveLength(12);
    expect(sac.rows[0]).toEqual({ amortizationCents: 100_000, interestCents: 12_000, paymentCents: 112_000 });
  });

  it('quitar-antes: 36 × 85.000 a 1,5%', () => {
    expect(36 * 85_000).toBe(3_060_000);
    const pv = presentValueCents(85_000, 150, range(1, 36));
    expect(pv).toBe(2_351_158);
    expect(3_060_000 - pv).toBe(708_842);
    expect(presentValueCents(85_000, 150, [34, 35, 36])).toBe(151_447);
  });

  it('multa-juros-atraso: lateChargesCents(20.000, 200, 100, 10)', () => {
    expect(lateChargesCents(20_000, 200, 100, 10)).toEqual({ fineCents: 400, interestCents: 67, totalCents: 20_467 });
  });

  it('inflacao-ipca: 60.000 a 5%; realValueCents(100.000, 500); 1,04 × 1,05 = 9,2%', () => {
    expect(compoundTotalCents(60_000, 500, 1)).toBe(63_000);
    expect(realValueCents(100_000, 500)).toBe(95_238);
    const chained = compoundTotalCents(compoundTotalCents(100_000, 400, 1), 500, 1);
    expect(chained).toBe(109_200);
    expect(formatTenths(percentTenths(chained - 100_000, 100_000))).toBe('9,2%');
  });

  it('renda-comprometida (B): percentTenths(115.000, 600.000) = 192; 30% de 600.000', () => {
    expect(percentTenths(115_000, 600_000)).toBe(192);
    expect(formatTenths(192)).toBe('19,2%');
    expect((600_000 * 30) / 100).toBe(180_000);
  });

  it('score-credito: percentTenths(11, 12) = 917', () => {
    expect(percentTenths(11, 12)).toBe(917);
    expect(formatTenths(917)).toBe('91,7%');
  });

  it('orcamento-50-30-20: sharesCents(600.000, [50, 30, 20])', () => {
    expect(sharesCents(600_000, [50, 30, 20])).toEqual([300_000, 180_000, 120_000]);
  });

  it('contas-do-ano: 180.000 + 120.000 + 90.000 + 60.000; monthlyShareCents(450.000, 12)', () => {
    const total = 180_000 + 120_000 + 90_000 + 60_000;
    expect(total).toBe(450_000);
    expect(monthlyShareCents(total, 12)).toBe(37_500);
  });

  it('reserva-imprevistos: 375.000 × 1, 3, 6, 12; monthsToReach(375.000, 50.000) = 8', () => {
    expect([1, 3, 6, 12].map((m) => 375_000 * m)).toEqual([375_000, 1_125_000, 2_250_000, 4_500_000]);
    expect(monthsToReach(375_000, 50_000)).toBe(8);
  });

  it('gasto-fixo-variavel e estimativa', () => {
    expect(250_000 + 12_000).toBe(262_000);
    expect(110_000 + 17_240).toBe(127_240);
    expect(262_000 + 127_240).toBe(389_240);
    expect(averageCents([16_530, 18_000, 17_190])).toBe(17_240);
  });

  it('parcelamentos, superendividamento, liquidez-risco-retorno e fgc', () => {
    expect(36 * 85_000).toBe(3_060_000);
    expect(200_000 - 170_000).toBe(30_000);
    expect(sharesCents(2_000_000, [90, 10])).toEqual([1_800_000, 200_000]);
    expect(30_000_000 - 25_000_000).toBe(5_000_000);
  });
});

describe('learn/math: vetores de spec4 §1.1', () => {
  it('presentValueCents(85.000, 150, 1..36) = 2.351.158 e (…, [34, 35, 36]) = 151.447', () => {
    expect(presentValueCents(85_000, 150, range(1, 36))).toBe(2_351_158);
    expect(presentValueCents(85_000, 150, [34, 35, 36])).toBe(151_447);
  });

  it('impliedMonthlyRate(108.000, 12.000, 10) → 1,96% e 26,27% ao ano; na compra (96.000 em 9) → 2,42% e 33,28%', () => {
    const a = impliedMonthlyRate(108_000, 12_000, 10)!;
    expect(a).toBeCloseTo(0.01963, 5);
    expect([formatRate(a), formatRate(equivalentAnnualRate(a))]).toEqual(['1,96%', '26,27%']);
    const b = impliedMonthlyRate(96_000, 12_000, 9)!;
    expect([formatRate(b), formatRate(equivalentAnnualRate(b))]).toEqual(['2,42%', '33,28%']);
  });

  it('installmentCents(500.000, 200, 12) = 47.280 e compoundTotalCents(100.000, 800, 3) = 125.971', () => {
    expect(installmentCents(500_000, 200, 12)).toBe(47_280);
    expect(compoundTotalCents(100_000, 800, 3)).toBe(125_971);
  });

  it('sharesCents(10.000, [1, 1, 1]) = [3.334, 3.333, 3.333] e (300.000, [400.000, 600.000]) = [120.000, 180.000]', () => {
    expect(sharesCents(10_000, [1, 1, 1])).toEqual([3_334, 3_333, 3_333]);
    expect(sharesCents(300_000, [400_000, 600_000])).toEqual([120_000, 180_000]);
  });
});

describe('learn/math: bordas', () => {
  it('roundDivBig arredonda metade para cima e é simétrico nos negativos', () => {
    expect(roundDivBig(5n, 2n)).toBe(3n);
    expect(roundDivBig(4n, 3n)).toBe(1n);
    expect(roundDivBig(-5n, 2n)).toBe(-3n);
    expect(roundDivBig(5n, -2n)).toBe(-3n);
    expect(() => roundDivBig(1n, 0n)).toThrow(RangeError);
  });

  it('entradas fora do domínio lançam RangeError', () => {
    expect(() => compoundTotalCents(-1, 100, 1)).toThrow(RangeError);
    expect(() => compoundTotalCents(1.5, 100, 1)).toThrow(RangeError);
    expect(() => installmentCents(1000, 100, 0)).toThrow(RangeError);
    expect(() => presentValueCents(1000, 100, [-1])).toThrow(RangeError);
    expect(() => sharesCents(100, [0, 0])).toThrow(RangeError);
    expect(() => averageCents([])).toThrow(RangeError);
    expect(() => monthsToReach(100, 0)).toThrow(RangeError);
  });

  it('resultado acima do inteiro seguro lança; compoundTotalBig mostra o valor exato', () => {
    expect(compoundTotalBig(999_999_999, 9_999, 24)).toBeGreaterThan(BigInt(Number.MAX_SAFE_INTEGER));
    expect(() => compoundTotalCents(999_999_999, 9_999, 24)).toThrow(RangeError);
  });

  it('taxa zero: Price divide igual; valor presente é a soma; sem meses, nada muda', () => {
    expect(installmentCents(100_000, 0, 3)).toBe(33_333);
    expect(installmentCents(100, 0, 8)).toBe(13);
    expect(presentValueCents(10_000, 0, [1, 2, 3])).toBe(30_000);
    expect(compoundTotalCents(12_345, 800, 0)).toBe(12_345);
    expect(presentValueCents(10_000, 150, [])).toBe(0);
    expect(presentValueCents(10_000, 150, [0])).toBe(10_000);
  });

  it('prazo fracionário usa ponto flutuante só no expoente', () => {
    // 30 dias = 1 mês: igual ao exato.
    expect(presentValueCents(85_000, 150, [30 / 30, 60 / 30])).toBe(presentValueCents(85_000, 150, [1, 2]));
    const half = presentValueCents(100_000, 200, [0.5]);
    expect(half).toBe(Math.floor(100_000 / Math.sqrt(1.02) + 0.5));
  });

  it('impliedMonthlyRate: sem juros, sem solução e uma parcela', () => {
    expect(impliedMonthlyRate(120_000, 12_000, 10)).toBe(0);
    expect(impliedMonthlyRate(130_000, 12_000, 10)).toBeNull();
    expect(impliedMonthlyRate(0, 12_000, 10)).toBeNull();
    expect(impliedMonthlyRate(100_000, 110_000, 1)).toBeCloseTo(0.1, 12);
    // Taxa altíssima continua com solução finita.
    expect(impliedMonthlyRate(1, 999_999_999, 2)).toBeGreaterThan(1e8);
  });

  it('equivalentMonthlyBp confere em inteiros em toda a faixa usual', () => {
    for (let annual = 0; annual <= 50_000; annual += 37) {
      const r = equivalentMonthlyBp(annual);
      // r é o arredondamento metade para cima de 10.000((1 + a)^(1/12) − 1).
      const exact = 10_000 * (Math.pow(1 + annual / 10_000, 1 / 12) - 1);
      expect(Math.abs(r - exact)).toBeLessThanOrEqual(0.5 + 1e-9);
    }
    expect(equivalentMonthlyBp(0)).toBe(0);
  });

  it('sharesCents: empate no resto vai para a primeira; soma sempre fecha', () => {
    expect(sharesCents(2, [1, 1, 1])).toEqual([1, 1, 0]);
    expect(sharesCents(100, [0, 1])).toEqual([0, 100]);
    expect(sharesCents(1, [1, 2])).toEqual([0, 1]);
    for (const total of [1, 7, 99, 100_001]) {
      const s = sharesCents(total, [3, 7, 11, 13]);
      expect(s.reduce((a, b) => a + b, 0)).toBe(total);
    }
  });

  it('percentTenths, monthlyShareCents, monthsToReach e averageCents arredondam como dito', () => {
    expect(percentTenths(1, 3)).toBe(333);
    expect(percentTenths(2, 3)).toBe(667);
    expect(percentTenths(1, 0)).toBe(0);
    expect(percentTenths(1, 2000)).toBe(1); // 0,05% → 0,1%
    expect(monthlyShareCents(1_800_000, 14)).toBe(128_572);
    expect(monthsToReach(0, 100)).toBe(0);
    expect(monthsToReach(-5, 100)).toBe(0);
    expect(averageCents([1, 2])).toBe(2);
  });

  it('sacTotals distribui os centavos que sobram nas primeiras amortizações', () => {
    const s = sacTotals(100, 0, 3);
    expect(s.rows.map((r) => r.amortizationCents)).toEqual([34, 33, 33]);
    expect(s.totalCents).toBe(100);
  });
});

describe('learn/format', () => {
  it('formatBp com casas e milhar', () => {
    expect(formatBp(2_627)).toBe('26,27%');
    expect(formatBp(2_627, 1)).toBe('26,3%');
    expect(formatBp(2_625, 1)).toBe('26,3%');
    expect(formatBp(2_627, 0)).toBe('26%');
    expect(formatBp(5)).toBe('0,05%');
    expect(formatBp(1_000_000)).toBe('10.000,00%');
    expect(formatBp(38_179)).toBe('381,79%');
    expect(formatBp(-150)).toBe('-1,50%');
  });

  it('formatBpCompact tira zeros à direita', () => {
    expect(formatBpCompact(800)).toBe('8%');
    expect(formatBpCompact(150)).toBe('1,5%');
    expect(formatBpCompact(196)).toBe('1,96%');
    expect(formatBpCompact(5)).toBe('0,05%');
    expect(formatBpCompact(1_000)).toBe('10%');
  });

  it('formatRate: fração com 2 casas, metade para cima', () => {
    expect(formatRate(0.019629)).toBe('1,96%');
    expect(formatRate(0.2627319)).toBe('26,27%');
    expect(formatRate(0.00125)).toBe('0,13%');
    expect(formatRate(0.0125)).toBe('1,25%');
    expect(formatRate(0)).toBe('0,00%');
    expect(formatRate(12.345678)).toBe('1.234,57%');
  });

  it('formatTenths e formatInteger', () => {
    expect(formatTenths(400)).toBe('40%');
    expect(formatTenths(234)).toBe('23,4%');
    expect(formatTenths(1)).toBe('0,1%');
    expect(formatTenths(1_000)).toBe('100%');
    expect(formatInteger(1_234_567)).toBe('1.234.567');
    expect(formatInteger(999)).toBe('999');
  });
});
