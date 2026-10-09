import { emergencyTarget, goalSaved } from '../goals';
import type { Cents } from '../money';
import { roundDiv } from '../money';
import { simulateGrowth } from '../simulate';
import { formatBp, formatTenths } from './format';
import {
  IOF_DAILY_PPM,
  IOF_FIXED_PPM,
  IOF_MAX_DAYS,
  averageCents,
  compoundTotalCents,
  equivalentAnnualBp,
  equivalentAnnualRate,
  equivalentMonthlyBp,
  impliedMonthlyRate,
  installmentCents,
  iofCents,
  lateChargesCents,
  monthlyShareCents,
  percentTenths,
  presentValueCents,
  realValueCents,
  roundDivBig,
  sacTotals,
  sharesCents,
  simpleTotalCents,
} from './math';
import type { TopicSlug } from './types';

/**
 * Números conferidos dos exemplos (R7): as entradas e os resultados de cada exemplo, calculados pelas funções
 * testadas de learn/math.ts (spec3 §3.11). Todo "R$ x" e todo "y%" de um tema publicado precisa estar aqui ou nos
 * `facts` do tema. Os valores saem em forma canônica (canonicalNumber): "R$ 1.268,24" e "26,82%".
 */
export interface ExampleNumbers {
  money: Cents[];
  /** Percentuais em pontos-base inteiros. */
  bp: number[];
  /** Percentuais em décimos de ponto (91,7% = 917), quando a conta é em décimos. */
  tenths?: number[];
  /** Percentuais em partes por milhão (0,0082% = 82), quando a alíquota é menor que 1 bp. */
  ppm?: number[];
  /** Taxas como fração (0,019630...), formatadas com 2 casas. */
  rates?: number[];
}

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, k) => from + k);

/** Bp de uma taxa em fração, metade para cima (para comparar com o texto de 2 casas). */
const rateBp = (rate: number) => Math.floor(Number((rate * 10_000).toFixed(6)) + 0.5);

export const EXAMPLE_NUMBERS: Partial<Record<TopicSlug, () => ExampleNumbers>> = {
  diferenca: () => ({ money: [600_000, 390_000, 600_000 - 390_000, 8_000, 390_000 + 8_000], bp: [] }),
  fatura: () => ({ money: [16_000], bp: [] }),
  'gasto-fixo': () => ({ money: [250_000], bp: [] }),
  estimativa: () => {
    const bills = [16_530, 18_000, 17_190];
    return { money: [...bills, averageCents(bills)], bp: [] };
  },
  parcelamentos: () => ({ money: [85_000, 36 * 85_000], bp: [] }),
  'sem-registro': () => ({ money: [250_000], bp: [] }),
  'gasto-fixo-variavel': () => {
    const fixed = 250_000 + 12_000;
    const variable = 110_000 + 17_240;
    return { money: [250_000, 12_000, fixed, 110_000, 17_240, variable, fixed + variable], bp: [] };
  },
  'contas-do-ano': () => {
    const bills = [180_000, 120_000, 90_000, 60_000];
    const total = bills.reduce((a, b) => a + b, 0);
    return { money: [...bills, total, monthlyShareCents(total, 12)], bp: [] };
  },
  'orcamento-50-30-20': () => ({ money: [600_000, ...sharesCents(600_000, [50, 30, 20])], bp: [5_000, 3_000, 2_000] }),
  'reserva-imprevistos': () => ({ money: [1, 3, 6, 12].map((m) => 375_000 * m).concat(50_000), bp: [] }),
  'juros-simples-compostos': () => {
    const simple = simpleTotalCents(100_000, 200, 12);
    const compound = compoundTotalCents(100_000, 200, 12);
    return { money: [100_000, simple, compound, compound - simple], bp: [200] };
  },
  'taxa-mes-ano': () => {
    const compound = compoundTotalCents(100_000, 200, 12);
    return {
      money: [100_000, compound, compound - 100_000],
      bp: [200, equivalentAnnualBp(200), 200 * 12, 1_200, equivalentMonthlyBp(1_200), 100],
    };
  },
  cet: () => {
    const parcela = installmentCents(500_000, 200, 12);
    const liquido = 500_000 - 15_000 - 10_000;
    const rate = impliedMonthlyRate(liquido, parcela, 12)!;
    return {
      money: [500_000, parcela, 15_000, 10_000, liquido, 12 * parcela, 12 * parcela - liquido],
      bp: [200, equivalentAnnualBp(200)],
      // R8: o equivalente anual usa a taxa mensal sem arredondar.
      rates: [rate, equivalentAnnualRate(rate)],
    };
  },
  'iof-credito': () => {
    const iof = iofCents(200_000, 90);
    const cap = IOF_FIXED_PPM + IOF_DAILY_PPM * IOF_MAX_DAYS;
    return {
      money: [200_000, iof.fixedCents, iof.dailyCents, iof.totalCents],
      // Teto em texto com 2 casas ("3,37%"), metade para cima: 33.730 ppm → 337 bp.
      bp: [Number(roundDivBig(BigInt(cap), 100n))],
      ppm: [IOF_FIXED_PPM, IOF_DAILY_PPM, cap],
    };
  },
  'parcelado-ou-a-vista': () => {
    const r10 = impliedMonthlyRate(108_000, 12_000, 10)!;
    const r9 = impliedMonthlyRate(108_000 - 12_000, 12_000, 9)!;
    return {
      money: [120_000, 12_000, 108_000, 120_000 - 108_000],
      bp: [],
      rates: [r10, equivalentAnnualRate(r10), r9, equivalentAnnualRate(r9)],
    };
  },
  'rotativo-cartao': () => {
    const juros = Number(roundDivBig(70_000n * 1_400n, 10_000n));
    const saldo = 70_000 + juros;
    const p24 = installmentCents(saldo, 800, 24);
    const total24 = 24 * p24;
    return {
      money: [100_000, 30_000, 70_000, juros, saldo, total24, juros + (total24 - saldo), 2 * 70_000],
      bp: [1_400, 800],
    };
  },
  'cheque-especial': () => ({ money: [50_000, Number(roundDivBig(50_000n * 800n, 10_000n))], bp: [800, equivalentAnnualBp(800)] }),
  'amortizacao-price-sac': () => {
    const price = installmentCents(1_200_000, 100, 12);
    const firstInterest = Number(roundDivBig(1_200_000n * 100n, 10_000n));
    const sac = sacTotals(1_200_000, 100, 12);
    return {
      money: [1_200_000, price, 12 * price - 1_200_000, firstInterest, price - firstInterest, sac.rows[0]!.amortizationCents, sac.firstCents, sac.lastCents, sac.interestCents],
      bp: [100],
    };
  },
  'quitar-antes': () => {
    const pv = presentValueCents(85_000, 150, range(1, 36));
    return { money: [85_000, 36 * 85_000, pv, 36 * 85_000 - pv, presentValueCents(85_000, 150, [34, 35, 36]), 3 * 85_000], bp: [150] };
  },
  'multa-juros-atraso': () => {
    const c = lateChargesCents(20_000, 200, 100, 10);
    return { money: [20_000, c.fineCents, c.interestCents, c.totalCents], bp: [200, 100] };
  },
  'score-credito': () => ({ money: [], bp: [], tenths: [percentTenths(11, 12)] }),
  superendividamento: () => ({ money: [200_000, 170_000, 200_000 - 170_000], bp: [] }),
  'inflacao-ipca': () => {
    const accumulated = Number(roundDivBig(10_400n * 10_500n - 10_000n * 10_000n, 10_000n));
    return { money: [60_000, compoundTotalCents(60_000, 500, 1), 100_000, realValueCents(100_000, 500)], bp: [500, 400, accumulated, 400 + 500] };
  },
  selic: () => ({ money: [], bp: [1_000, equivalentMonthlyBp(1_000), 300, equivalentAnnualBp(300)] }),
  'liquidez-risco-retorno': () => {
    const sold = Number(roundDivBig(2_000_000n * 9_000n, 10_000n));
    return { money: [2_000_000, sold, 2_000_000 - sold], bp: [1_000] };
  },
  fgc: () => ({ money: [30_000_000, 30_000_000 - 25_000_000], bp: [] }),
  // Ciclo B: renda comprometida (D-026(3), uma casa em décimos) e renda que muda de um mês para outro.
  'renda-comprometida': () => {
    const debts = [85_000, 30_000];
    const total = debts.reduce((a, b) => a + b, 0); // 115.000
    return { money: [600_000, ...debts, total, (600_000 * 30) / 100], bp: [], tenths: [percentTenths(total, 600_000)] }; // 192
  },
  'renda-variavel': () => {
    const months = [430_000, 620_000, 510_000];
    const avg = averageCents(months); // 520.000
    return {
      money: [...months, months.reduce((a, b) => a + b, 0), avg, 315_000],
      bp: [],
      tenths: [percentTenths(315_000, avg), percentTenths(315_000, Math.min(...months))], // 606 e 733
    };
  },
  // Ciclo C: aporte (valor guardado = soma dos movimentos, D-027(2)) e gastos essenciais (média de três meses).
  aporte: () => {
    const saved = goalSaved([
      { kind: 'saldo_inicial', amountCents: 300_000 },
      { kind: 'aporte', amountCents: 50_000 },
    ]); // 350.000
    return { money: [300_000, 50_000, saved, 390_000, 30_000, 390_000 + 30_000, saved - 30_000], bp: [], tenths: [] };
  },
  essenciais: () => {
    const months = [370_000, 375_000, 380_000];
    const total = months.reduce((a, b) => a + b, 0); // 1.125.000
    const avg = roundDiv(total, months.length); // 375.000
    return { money: [...months, total, avg, 20_000, 240_000, emergencyTarget(avg, 6)!], bp: [], tenths: [] }; // 2.250.000
  },
  // Ciclo D: simulação com aportes no início de cada mês (D-028(2)).
  simulacao: () => {
    const g = simulateGrowth({ initial: 0, monthly: 50_000, months: 120, rateBp: 1_000, inflationBp: 450 });
    // 10.072.879, 6.000.000, 4.072.879 e 6.486.205
    return { money: [50_000, g.finalCents, g.contributedCents, g.earningsCents, g.todayValueCents!], bp: [1_000, equivalentMonthlyBp(1_000), 450], tenths: [] };
  },
};

/** Partes por milhão como percentual, com todas as casas necessárias: 3.800 → "0,38%", 82 → "0,0082%", 33.730 → "3,373%". */
export function ppmPercentText(ppm: number): string {
  if (!Number.isSafeInteger(ppm) || ppm < 0) throw new RangeError(`ppm inválido: ${ppm}`);
  const intPart = Math.floor(ppm / 10_000);
  const dec = String(ppm % 10_000).padStart(4, '0').replace(/0+$/, '');
  return `${intPart}${dec ? `,${dec}` : ''}%`;
}

/**
 * Forma canônica de um número citado: dinheiro em centavos ("R$ 6.000" e "R$ 6.000,00" → "R$:600000") e percentual
 * sem zeros à direita ("0,80%" → "%:0,8"). Texto que não é número: null.
 */
export function canonicalNumber(token: string): string | null {
  const money = /^R\$\s?(\d{1,3}(?:\.\d{3})*|\d+)(?:,(\d{2}))?$/.exec(token.trim());
  if (money) return `R$:${Number(money[1]!.replace(/\./g, '')) * 100 + Number(money[2] ?? '0')}`;
  const pct = /^(\d{1,3}(?:\.\d{3})*|\d+)(?:,(\d+))?\s?%$/.exec(token.trim());
  if (pct) {
    const dec = (pct[2] ?? '').replace(/0+$/, '');
    return `%:${pct[1]!.replace(/\./g, '')}${dec ? `,${dec}` : ''}`;
  }
  return null;
}

/** "R$ x" e "y%" de um texto, na ordem em que aparecem. */
export function numbersInText(text: string): string[] {
  return [...text.matchAll(/R\$\s?(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{2})?|\d+(?:\.\d{3})*(?:,\d+)?\s?%/g)].map((m) => m[0]);
}

/** Conjunto esperado de números de um tema (R7), em forma canônica, sem os `facts` (o validador junta os dois). */
export function expectedExampleNumbers(slug: TopicSlug): Set<string> {
  const build = EXAMPLE_NUMBERS[slug];
  const out = new Set<string>();
  if (!build) return out;
  const n = build();
  const add = (text: string) => {
    const c = canonicalNumber(text);
    if (c) out.add(c);
  };
  for (const cents of n.money) out.add(`R$:${cents}`);
  for (const bp of n.bp) add(formatBp(bp, 2));
  for (const t of n.tenths ?? []) add(formatTenths(t));
  for (const ppm of n.ppm ?? []) add(ppmPercentText(ppm));
  for (const rate of n.rates ?? []) add(formatBp(rateBp(rate), 2));
  return out;
}
