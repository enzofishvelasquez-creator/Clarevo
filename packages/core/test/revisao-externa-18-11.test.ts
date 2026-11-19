import { describe, expect, it } from 'vitest';
import {
  ANTES_CET_HYPOTHESIS,
  DIVIDA_TEXT,
  DIVIDIR_NOTES,
  MAX_RECORD_CENTS,
  MULTA_FATURA_HYPOTHESES,
  MULTA_FATURA_TEXT,
  PLANO_TEXT,
  QUITAR_TEXT,
  adjustedTargetCents,
  calcAntesDeFinanciar,
  calcCustoDaDivida,
  calcCustoPorAno,
  calcDividirContas,
  calcJuntarParaObjetivo,
  calcMultaEJuros,
  calcParceladoOuAVista,
  calcPlanoDividas,
  calcQuitarAntes,
  calcReserva,
  finalValueCents,
  monthlyForTarget,
  monthlyRate,
  monthsForAdjustedTarget,
  monthsForTarget,
  parseBRL,
  parseCount,
  parseMoney,
  parsePercentBp,
  planoTrail,
  simulationGoalPrefill,
  todayValueCents,
  validateSimulationDraft,
  type CalcOutcome,
  type PlanoDividaInput,
  type PlanoInput,
  type SimulationDraft,
} from '../src';

/**
 * Revisão externa das calculadoras de 18/11/2026 (docs/51, "Revisão externa de 18/11/2026"). Os testes de aceitação T01 a T20 da página 11,
 * cada um com um valor de referência independente: contas à mão, aritmética racional exata com BigInt ou ponto fixo de 40 dígitos, feitas
 * aqui no teste, sem chamar a mesma função que está sendo conferida. E os invariantes que a revisão pediu: conservação dos pagamentos,
 * saldo final, menor aporte suficiente, primeiro prazo atingível e nenhum resultado negativo ou não finito.
 */

// ---------------------------------------------------------------------------------------------------------------------
// Referências independentes

/** Ponto fixo com 40 dígitos (BigInt): valor real x guardado como x × 10^40. */
const SCALE = 10n ** 40n;
const fx = (num: bigint, den: bigint = 1n) => (num * SCALE) / den;
const mul = (a: bigint, b: bigint) => (a * b) / SCALE;
const pow = (a: bigint, n: number) => {
  let r = SCALE;
  for (let k = 0; k < n; k++) r = mul(r, a);
  return r;
};
/** Raiz 12 de x (ponto fixo) por Newton: r ← r − (r^12 − x) ÷ (12 r^11). */
function root12(x: bigint): bigint {
  let r = SCALE + (x - SCALE) / 12n;
  for (let k = 0; k < 200; k++) {
    const r11 = pow(r, 11);
    const next = r - ((mul(r11, r) - x) * SCALE) / (12n * r11);
    if (next === r) break;
    r = next;
  }
  return r;
}
/** 1 + taxa mensal equivalente a uma taxa ao ano em pontos-base: (1 + a)^(1/12). */
const monthlyFactor = (annualBp: number) => root12(fx(10_000n + BigInt(annualBp), 10_000n));
/** Valor no fim de n meses com aportes no início de cada mês, para baixo no centavo: saldo ← (saldo + aporte) × r, n vezes. */
function exactFinal(initial: number, monthly: number, months: number, annualBp: number): bigint {
  const r = monthlyFactor(annualBp);
  let bal = fx(BigInt(initial));
  for (let k = 0; k < months; k++) bal = mul(bal + fx(BigInt(monthly)), r);
  return bal / SCALE;
}
/** Parcela Price exata, metade para cima: P × i × q^n ÷ (q^n − 1), com i = bp ÷ 10.000. */
function priceExact(principal: number, bp: number, n: number): number {
  const q = 10_000n + BigInt(bp);
  const num = BigInt(principal) * BigInt(bp) * q ** BigInt(n);
  const den = 10_000n * (q ** BigInt(n) - 10_000n ** BigInt(n));
  return Number((2n * num + den) / (2n * den));
}

const okResult = <R, F extends string>(out: CalcOutcome<R, F>): R => {
  if (!out.ok) throw new Error(JSON.stringify(out.errors));
  return out.result;
};
const saldo = (s: string, taxa: string, pagamento: string, apelido = ''): PlanoDividaInput => ({ tipo: 'saldo', saldo: s, taxaSaldo: taxa, pagamento, apelido });
const parcelada = (parcela: string, restantes: string, taxa = '', apelido = ''): PlanoDividaInput => ({ tipo: 'parcelada', parcela, restantes, taxaParcelada: taxa, apelido });
const draft = (d: Partial<SimulationDraft>): SimulationDraft => ({
  mode: null,
  targetText: '',
  initialText: '',
  monthsText: '',
  monthlyText: '',
  rateText: '',
  inflationOn: false,
  inflationText: '',
  ...d,
});

/** Gerador fixo (sem sorteio). */
function lcg(seed: number) {
  let s = seed;
  return (n: number) => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return Math.floor(s / 16) % n;
  };
}

describe('Revisão externa de 18/11/2026: testes de aceitação T01 a T20', () => {
  it('T01 financiamento com entrada igual ao preço: parcela e custo adicional zero', () => {
    for (const tipoTaxa of ['juros', 'cet'] as const) {
      const r = okResult(calcAntesDeFinanciar({ preco: '50.000,00', entrada: '50.000,00', parcelas: '48', taxaMes: '1,99', tipoTaxa }));
      expect([r.nothingToFinance, r.financedCents, r.parcelaCents, r.interestCents, r.totalCents]).toEqual([true, 0, 0, 0, 5_000_000]);
    }
    // A entrada maior que o preço é recusada; renda zero também (não há divisão por zero).
    const above = calcAntesDeFinanciar({ preco: '1.000,00', entrada: '1.000,01', parcelas: '12', taxaMes: '1' });
    expect(above.ok ? null : above.errors).toEqual({ entrada: 'fora_da_faixa' });
    const zeroIncome = calcAntesDeFinanciar({ preco: '1.000,00', parcelas: '12', taxaMes: '1', renda: '0' });
    expect(zeroIncome.ok ? null : zeroIncome.errors).toEqual({ renda: 'zero' });
  });

  it('T02 R$ 100,00 em 3 vezes a taxa zero: 33,33 + 33,33 + 33,34, soma exata e a última identificada', () => {
    const r = okResult(calcAntesDeFinanciar({ preco: '100,00', parcelas: '3', taxaMes: '0' }));
    // À mão: 10.000 ÷ 3 = 3.333 e sobra 1 centavo, que vai para a última.
    expect([r.parcelaCents, r.lastParcelaCents, r.lastCount]).toEqual([3_333, 3_334, 1]);
    expect((r.parcelas - r.lastCount) * r.parcelaCents + r.lastCount * r.lastParcelaCents).toBe(10_000);
    expect(r.totalCents).toBe(10_000);
    expect(r.resultLines[2]).toBe('Total pago: R$ 100,00 (2 × R$ 33,33 e uma última de R$ 33,34).');
  });

  it('T03 R$ 0,02 em 4 vezes: nenhuma parcela negativa, os centavos distribuídos', () => {
    const r = okResult(calcAntesDeFinanciar({ preco: '0,02', parcelas: '4', taxaMes: '0' }));
    // À mão: 2 ÷ 4 = 0 e sobram 2 centavos: 0,00 + 0,00 + 0,01 + 0,01 (antes: 0,01 + 0,01 + 0,01 − 0,01).
    expect([r.parcelaCents, r.lastParcelaCents, r.lastCount, r.totalCents]).toEqual([0, 1, 2, 2]);
    expect(Math.min(r.parcelaCents, r.lastParcelaCents)).toBeGreaterThanOrEqual(0);
    expect(r.hypotheses.join(' ')).toContain('nem todas as parcelas têm valor');
  });

  it('T04 CET com tarifa paga no início: limitação explícita (simulação de custo equivalente), conferida com o fluxo líquido', () => {
    // Contrato: R$ 1.000,00 a 2% em 12 parcelas (Price exata) e R$ 100,00 de tarifa no início: fluxo líquido de R$ 900,00.
    const contract = priceExact(100_000, 200, 12);
    expect(contract).toBe(9_456);
    // Taxa que iguala 900,00 às 12 parcelas de 94,56 (bisseção independente): cerca de 3,7588% ao mês.
    const pv = (i: number) => (contract * (1 - Math.pow(1 + i, -12))) / i;
    let lo = 0.0001;
    let hi = 1;
    for (let k = 0; k < 200; k++) {
      const mid = (lo + hi) / 2;
      if (pv(mid) > 90_000) lo = mid;
      else hi = mid;
    }
    const cet = (lo + hi) / 2;
    expect(cet).toBeCloseTo(0.037588, 5);
    // Aplicar esse CET a R$ 1.000,00 dá uma parcela fictícia de R$ 105,07, diferente da do contrato.
    expect(Math.round((100_000 * cet) / (1 - Math.pow(1 + cet, -12)))).toBe(10_507);
    // Na calculadora (2 casas: 3,76%), a parcela é a Price exata com 376 bp, o resultado é "custo adicional estimado" e a hipótese diz
    // que a parcela pode ser diferente da do contrato.
    const r = okResult(calcAntesDeFinanciar({ preco: '1.000,00', parcelas: '12', taxaMes: '3,76', tipoTaxa: 'cet' }));
    expect(r.parcelaCents).toBe(priceExact(100_000, 376, 12));
    expect(r.parcelaCents).not.toBe(contract);
    expect(r.resultLines[3]).toBe(`Custo adicional estimado: R$ ${((12 * r.parcelaCents - 100_000) / 100).toFixed(2).replace('.', ',')}.`);
    expect(r.hypotheses).toContain(ANTES_CET_HYPOTHESIS);
  });

  it('T05 primeira parcela na compra igual ou acima do preço: sem taxa positiva finita, e a busca nem começa', () => {
    const r = okResult(calcParceladoOuAVista({ aVista: '1.000,00', parcelas: '3', parcela: '1.000,00', primeiraNaCompra: true }));
    expect([r.financedCents, r.monthlyRate, r.annualRate]).toEqual([0, null, null]);
    expect(r.resultLines[1]).toContain('nenhuma taxa de juros faz as parcelas valerem o preço à vista');
    // Logo abaixo do preço, a taxa é enorme e finita: 2 × R$ 999,99 com a primeira na compra financia R$ 0,01 numa parcela de
    // R$ 999,99: i = 99.999 ÷ 1 − 1 = 99.998 (à mão). A tela mostra o limite, sem número arbitrário.
    const near = okResult(calcParceladoOuAVista({ aVista: '1.000,00', parcelas: '2', parcela: '999,99', primeiraNaCompra: true }));
    expect(near.monthlyRate! / 99_998).toBeCloseTo(1, 9);
    expect(near.resultLines[1]).toBe('Nas parcelas há juros embutidos de mais de 10.000% ao mês (mais de 10.000% ao ano).');
    // A taxa ao ano usa a taxa ao mês completa: 1.080,00 ou 10 × 120,00 dão 26,27% ao ano, não os 26,23% de (1,0196)^12.
    const ex = okResult(calcParceladoOuAVista({ aVista: '1.080,00', parcelas: '10', parcela: '120,00', primeiraNaCompra: false }));
    expect(ex.annualRate).toBeCloseTo(Math.pow(1 + ex.monthlyRate!, 12) - 1, 12);
    expect(ex.resultLines[1]).toBe('Nas parcelas há juros embutidos de 1,96% ao mês (26,27% ao ano).');
    expect(Math.pow(1.0196, 12) - 1).toBeLessThan(0.2624);
  });

  it('T06 cartão de R$ 700,00 a 14%, depois 24 × a 8%: teto, parcelas e total reconciliados', () => {
    const r = okResult(calcCustoDaDivida({ tipo: 'rotativo', valor: '700,00', taxaMes: '14', parcelarTaxaMes: '8', parcelarParcelas: '24' }));
    // À mão: rotativo 700,00 × 14% = 98,00; fatura seguinte 798,00. Price exata: 24 × 75,79 = 1.818,96.
    expect([r.interestCents, r.totalCents]).toEqual([9_800, 79_800]);
    const p = okResult(r.parcelamento!);
    expect(p.installmentCents).toBe(priceExact(79_800, 800, 24));
    expect(p.totalCents).toBe(24 * 7_579);
    // Teto: juros e encargos (98,00 do rotativo + os do parcelamento) até 700,00, total até 1.400,00.
    expect(p.capCents).toBe(140_000);
    expect(p.cappedInstallmentCents).toBe(Math.floor(140_000 / 24));
    expect(p.cappedTotalCents).toBe(24 * p.cappedInstallmentCents!);
    expect(p.cappedTotalCents).toBeLessThanOrEqual(p.capCents);
    expect(p.cappedTotalCents - 70_000).toBeLessThanOrEqual(70_000);
    expect(p.capCents - p.cappedTotalCents).toBeLessThan(24);
    expect(p.hypotheses).toContain(DIVIDA_TEXT.capHistory);
  });

  it('T07 cartão além da fatura seguinte: a conta para no primeiro ciclo e não projeta o rotativo único', () => {
    const base = { modo: 'fatura' as const, valor: '1.000,00', rotativoPct: '15', moraPct: '1', multaPct: '2', jurosMesPct: '' };
    const year = okResult(calcMultaEJuros({ ...base, dias: '365' }));
    const cycle = okResult(calcMultaEJuros({ ...base, dias: '30' }));
    expect([year.cycleDays, year.beyondCycle]).toEqual([30, true]);
    expect(year.totalCents).toBe(cycle.totalCents);
    expect(year.notes[0]).toBe(MULTA_FATURA_TEXT.beyondCycle(365));
  });

  it('T08 IOF: só a hipótese simplificada de saldo parado, nunca o valor legal, e sem somar de novo o que já está na fatura', () => {
    const r = okResult(calcMultaEJuros({ modo: 'fatura', valor: '1.000,00', rotativoPct: '15', moraPct: '1', multaPct: '2', jurosMesPct: '', dias: '30' }));
    // À mão: 1.000,00 × (0,38% + 0,0082% × 30) = 1.000,00 × 0,626% = 6,26.
    expect(r.iofCents).toBe(626);
    expect(r.hypotheses).toContain(MULTA_FATURA_HYPOTHESES.iof);
    expect(MULTA_FATURA_HYPOTHESES.iof).toMatch(/hipótese simplificada.*Não é o valor legal.*não some de novo/);
  });

  it('T09 dívida de R$ 1.000,00 a 10%, pagando R$ 80,00, com R$ 50,00 a mais: entra no plano e o saldo do primeiro mês é R$ 970,00', () => {
    const input: PlanoInput = { extra: '50,00', dividas: [saldo('1.000,00', '10', '80,00')] };
    const r = okResult(calcPlanoDividas(input));
    expect(r.included).toBe(1);
    expect(r.debts[0]!.stays).toBe(true);
    const t = planoTrail(input, 'com_extra')!;
    // À mão: 1.000,00 + 100,00 de juros − 80,00 − 50,00 = 970,00.
    expect(t.trail[0]!.rows[0]!.closingCents).toBe(100_000 + 10_000 - 8_000 - 5_000);
    expect(t.months).not.toBeNull();
    expect(r.scenarios.find((s) => s.id === 'sem_extra')!.months).toBeNull();
  });

  it('T10 dívida sem taxa informada: incerteza dita, sem supor juros zero reais', () => {
    const r = okResult(calcPlanoDividas({ extra: '100,00', dividas: [parcelada('300,00', '12', '', 'Loja'), saldo('2.000,00', '3', '200,00', 'Cartão')] }));
    const loja = r.debts[0]!;
    expect([loja.rateBp, loja.unknownRate]).toEqual([null, true]);
    expect(r.notes).toContain(PLANO_TEXT.unknownRateNote('Loja', true, false));
    expect(PLANO_TEXT.unknownRateNote('Loja', true, false)).toContain('ficam incertos, e as diferenças entre as ordens valem só com essa hipótese');
    // Com a taxa informada (mesmo 0%), não há aviso.
    expect(okResult(calcPlanoDividas({ dividas: [parcelada('300,00', '12', '0', 'Loja')] })).debts[0]!.unknownRate).toBe(false);
  });

  it('T11 valor a mais zero com repasse: o ganho é atribuído ao repasse, não a dinheiro a mais', () => {
    const r = okResult(calcPlanoDividas({ dividas: [parcelada('265,00', '9', '1', 'Acordo'), parcelada('100,00', '60', '1,88', 'Empréstimo')] }));
    expect(r.extraCents).toBe(0);
    expect(r.headline).toMatch(/^Passando adiante o pagamento de cada dívida que acaba, /);
    for (const p of r.plans) expect(p.gain).toMatch(/^Ganho estimado, só por passar adiante os pagamentos das dívidas que acabam, sem dinheiro a mais: /);
    // Com valor a mais, o ganho só do repasse aparece à parte, igual ao de valor a mais zero na mesma ordem.
    const withExtra = okResult(calcPlanoDividas({ extra: '300,00', dividas: [parcelada('265,00', '9', '1', 'Acordo'), parcelada('100,00', '60', '1,88', 'Empréstimo')] }));
    const zero = r.scenarios.find((s) => s.id === 'maior_taxa')!;
    expect(withExtra.plans[0]!.repasseOnly).toEqual({ months: zero.months, interestCents: zero.interestCents });
  });

  it('T12 parcela vencida na quitação: atraso separado, sem desconto fictício e sem dizer que é a quitação completa', () => {
    const r = okResult(calcQuitarAntes({ parcela: '850,00', restantes: '3', taxaMes: '1,5', modo: 'tudo', prazosEmDias: [-15, 15, 45] }));
    // À mão: só as duas a vencer entram, 85.000 ÷ 1,015^0,5 + 85.000 ÷ 1,015^1,5.
    expect(r.presentValueCents).toBe(Math.floor(85_000 / Math.pow(1.015, 0.5) + 85_000 / Math.pow(1.015, 1.5) + 0.5));
    expect([r.count, r.overdueCount, r.overdueSumCents, r.sumCents]).toEqual([2, 1, 85_000, 170_000]);
    expect(r.resultLines.at(-1)).toBe(QUITAR_TEXT.overdue(1, 85_000));
    expect(r.resultLines.join(' ')).toContain('não é a quitação completa');
  });

  it('T13 guardado acima da meta: prazo zero, aporte zero, meta atingida', () => {
    const j = okResult(calcJuntarParaObjetivo({ alvo: '10.000,00', jaTem: '11.000,00', modo: 'prazo', meses: '12' }));
    expect([j.reached, j.missingCents, j.monthlyCents, j.months]).toEqual([true, 0, 0, 0]);
    const res = okResult(calcReserva({ essenciais: '1.000,00', meses: '3', guardado: '5.000,00', mensal: '100,00' }));
    expect([res.reached, res.missingCents, res.monthsToTarget]).toEqual([true, 0, 0]);
    const sim = validateSimulationDraft(draft({ mode: 'em-quanto-tempo', targetText: '10.000,00', initialText: '11.000,00', monthlyText: '100,00', rateText: '5' }));
    expect(sim.ok && [sim.result.reached, sim.result.months, sim.result.monthlyCents]).toEqual([true, 0, 0]);
    expect(monthsForTarget(1_000_000, 1_100_000, 10_000, 500)).toBe(0);
    expect(monthlyForTarget(1_000_000, 1_100_000, 12, 500)).toBe(0);
  });

  it('T14 meta não atingida e aporte zero: resposta definida, sem divisão por zero', () => {
    const res = okResult(calcReserva({ essenciais: '1.000,00', meses: '3', mensal: '0' }));
    expect(res.monthsToTarget).toBeNull();
    expect(res.resultLines.at(-1)).toBe('Guardando R$ 0,00 por mês, não há previsão para completar a reserva.');
    const j = calcJuntarParaObjetivo({ alvo: '1.000,00', modo: 'mensal', mensal: '0' });
    expect(j.ok ? null : j.errors).toEqual({ mensal: 'zero' });
    const sim = validateSimulationDraft(draft({ mode: 'em-quanto-tempo', targetText: '1.000,00', monthlyText: '0', rateText: '0' }));
    expect(sim.ok ? null : sim.codes).toEqual({ monthlyText: 'zero' });
    // A função do prazo sozinha também responde sem travar: null (não alcança).
    expect(monthsForTarget(100_000, 0, 0, 0)).toBeNull();
    expect(monthsForTarget(100_000, 0, 0, 3_000)).toBeNull();
  });

  it('T15 rendas individuais zero e total zero: uma renda zero aceita; todas zero impedem a proporção', () => {
    const r = okResult(calcDividirContas({ total: '1.000,00', modo: 'renda', pessoas: [{ renda: '3.000,00' }, { renda: '0' }] }));
    expect(r.people.map((p) => p.cents)).toEqual([100_000, 0]);
    expect(r.hypotheses).toContain(DIVIDIR_NOTES.zeroIncome('Pessoa 2'));
    const none = calcDividirContas({ total: '1.000,00', modo: 'renda', pessoas: [{ renda: '0' }, { renda: '0' }] });
    expect(none.ok ? null : none.errors).toEqual({ 'renda.0': 'zero', 'renda.1': 'zero' });
    // Total acima da soma das rendas: continua, com o aviso de que pede mais de 100% da renda.
    expect(okResult(calcDividirContas({ total: '5.000,00', modo: 'renda', pessoas: [{ renda: '2.000,00' }, { renda: '2.000,00' }] })).notes[0]).toBe(DIVIDIR_NOTES.aboveIncome);
  });

  it('T16 R$ 100,00 por três pessoas: 33,34 + 33,33 + 33,33, total R$ 100,00, e os percentuais de 99,9% explicados', () => {
    const r = okResult(calcDividirContas({ total: '100,00', modo: 'iguais', pessoas: [{}, {}, {}] }));
    expect(r.people.map((p) => p.cents)).toEqual([3_334, 3_333, 3_333]);
    expect(r.people.reduce((s, p) => s + p.cents, 0)).toBe(10_000);
    expect(r.people.map((p) => p.tenths)).toEqual([333, 333, 333]);
    expect(r.hypotheses).toContain(DIVIDIR_NOTES.roundedPercents);
  });

  it('T17 inflação móvel da página 9: primeiro alcance em 14 meses, e a condição não é monotônica', () => {
    // Meta de R$ 10.000,00 de hoje, sem saldo inicial, R$ 1.000,00 por mês, sem rendimento e 30% de inflação ao ano. Referência exata:
    // 1.000 × n ≥ 10.000 × 1,3^(n/12) ⟺ n^12 × 10^n ≥ 13^n × 10^12 (inteiros).
    const reaches = (n: number) => BigInt(n) ** 12n * 10n ** BigInt(n) >= 13n ** BigInt(n) * 10n ** 12n;
    const first = Array.from({ length: 600 }, (_, k) => k + 1).find(reaches);
    expect(first).toBe(14);
    expect([reaches(13), reaches(14), reaches(120), reaches(600)]).toEqual([false, true, false, false]);
    expect(monthsForAdjustedTarget(1_000_000, 0, 100_000, 0, 3_000)).toBe(14);
    // No mês 120, a meta corrigida (cerca de R$ 137,9 mil) passa dos R$ 120 mil aportados.
    expect(adjustedTargetCents(1_000_000, 120, 3_000)).toBeGreaterThan(13_780_000);
    const sim = validateSimulationDraft(
      draft({ mode: 'em-quanto-tempo', targetText: '10.000,00', monthlyText: '1.000,00', rateText: '0', inflationOn: true, adjustTarget: true, inflationText: '30' }),
    );
    expect(sim.ok && sim.result.months).toBe(14);
  });

  it('T18 aporte calculado A: A alcança a meta e A − R$ 0,01 não, quando A > 0 (referência de 40 dígitos)', () => {
    const next = lcg(1811);
    let checked = 0;
    for (let k = 0; k < 120; k++) {
      const target = 10_000 + next(MAX_RECORD_CENTS - 10_000);
      const initial = next(3) === 0 ? 0 : next(target);
      const months = 1 + next(600);
      const rate = [0, 1, 50, 340, 1000, 1268, 3000, next(3001)][next(8)]!;
      const a = monthlyForTarget(target, initial, months, rate);
      if (a > MAX_RECORD_CENTS) continue;
      expect(exactFinal(initial, a, months, rate) >= BigInt(target), `${target} ${initial} ${months} ${rate}: ${a}`).toBe(true);
      if (a > 0) expect(exactFinal(initial, a - 1, months, rate) < BigInt(target), `${target} ${initial} ${months} ${rate}: ${a - 1}`).toBe(true);
      checked++;
    }
    expect(checked).toBeGreaterThan(80);
  });

  it('T19 taxa zero, taxa mínima, prazo de 600 meses e extremos: resultados finitos ou um limite claro, sem travar', () => {
    const start = Date.now();
    // Taxa zero e taxa mínima (0,01% ao ano) no prazo máximo.
    expect(finalValueCents(0, 100, 600, 0)).toBe(60_000);
    expect(BigInt(finalValueCents(0, 100, 600, 1))).toBe(exactFinal(0, 100, 600, 1));
    expect(monthsForTarget(MAX_RECORD_CENTS, 0, 1, 0)).toBeNull();
    expect(monthsForTarget(MAX_RECORD_CENTS, 0, 1, 1)).toBeNull();
    expect(monthlyForTarget(MAX_RECORD_CENTS, 0, 600, 0)).toBe(Math.ceil(MAX_RECORD_CENTS / 600));
    // Resultado acima do que o simulador mostra: o limite é dito no campo.
    const big = validateSimulationDraft(draft({ mode: 'quanto-ter', initialText: '9.999.999,99', monthsText: '600', monthlyText: '9.999.999,99', rateText: '30' }));
    expect(big.ok ? null : big.codes).toEqual({ monthsText: 'resultado_alto' });
    // Cheque especial extremo: resultado_alto, nunca um número errado.
    const cheque = calcCustoDaDivida({ tipo: 'cheque_especial', valor: '9.999.999,99', taxaMes: '99,99', meses: '24' });
    expect(cheque.ok ? null : cheque.errors).toEqual({ meses: 'resultado_alto' });
    // Uma dívida que só cresce (99,99% ao mês, pagando R$ 0,01): não termina e não passa do inteiro seguro.
    const growing = okResult(calcPlanoDividas({ dividas: [saldo('9.999.999,99', '99,99', '0,01')] }));
    expect(growing.scenarios[0]!.months).toBeNull();
    // Os maiores valores das outras calculadoras ficam em inteiros seguros.
    const antes = okResult(calcAntesDeFinanciar({ preco: '9.999.999,99', parcelas: '480', taxaMes: '99,99' }));
    const ano = okResult(calcCustoPorAno({ valor: '9.999.999,99', frequencia: 'dia_util' }));
    const casa = okResult(calcDividirContas({ total: '9.999.999,99', modo: 'renda', pessoas: [{ renda: '9.999.999,99' }, { renda: '9.999.999,98' }] }));
    for (const v of [antes.totalCents, antes.interestCents, ano.yearlyCents, ...casa.people.map((p) => p.cents)]) expect(Number.isSafeInteger(v)).toBe(true);
    expect(casa.people.reduce((s, p) => s + p.cents, 0)).toBe(MAX_RECORD_CENTS);
    expect(Date.now() - start).toBeLessThan(20_000);
  });

  it('T20 criar meta depois de corrigir a inflação: valor corrigido, prazo e aporte preservados', () => {
    const sim = validateSimulationDraft(
      draft({ mode: 'quanto-guardar', targetText: '10.000,00', monthsText: '60', rateText: '3,4', inflationOn: true, adjustTarget: true, inflationText: '12' }),
    );
    if (!sim.ok) throw new Error('simulação');
    // Referência exata: 10.000,00 × 1,12^5 = 17.623,416832 → R$ 17.623,42.
    const adjusted = (1_000_000n * 112n ** 5n * 2n + 100n ** 5n) / (2n * 100n ** 5n);
    expect(BigInt(sim.result.targetAdjustedCents!)).toBe(adjusted);
    // Menor aporte que alcança a meta corrigida em 60 meses a 3,4% ao ano (40 dígitos): R$ 269,49.
    const a = sim.result.monthlyCents!;
    expect(exactFinal(0, a, 60, 340) >= adjusted && exactFinal(0, a - 1, 60, 340) < adjusted).toBe(true);
    expect(a).toBe(26_949);
    const goal = simulationGoalPrefill(sim.result, '2026-11-19');
    expect(goal).toEqual({ goalType: 'objetivo', targetText: '17.623,42', targetMonthText: '10/2031', initialText: '', plannedText: '269,49' });
  });
});

describe('Revisão externa de 18/11/2026: invariantes e precisão', () => {
  it('trilha do plano: em cada linha, final = inicial + juros − pagamento − valor a mais; o total pago fecha com saldos e juros', () => {
    const next = lcg(424242);
    let checked = 0;
    for (let k = 0; k < 120; k++) {
      const dividas: PlanoDividaInput[] = [];
      for (let i = 0, n = 1 + next(5); i < n; i++) {
        if (next(2) === 0) dividas.push(parcelada(`${1 + next(900)},${String(next(100)).padStart(2, '0')}`, String(1 + next(60)), ['', '0', '0,5', '1,99', '7'][next(5)]!));
        else {
          const s = 100 + next(9000);
          const rate = [1, 2, 5, 8][next(4)]!;
          // Inclui pagamentos abaixo dos juros (a dívida que não diminui sozinha continua no plano).
          dividas.push(saldo(`${s},00`, String(rate), `${Math.max(1, Math.ceil((s * rate) / 100) - 20 + next(300))},00`));
        }
      }
      const input: PlanoInput = { extra: next(3) === 0 ? '' : `${next(500)},00`, dividas };
      const r = okResult(calcPlanoDividas(input));
      for (const s of r.scenarios) {
        const t = planoTrail(input, s.id)!;
        expect(t.months).toBe(s.months);
        let paid = 0;
        let interest = 0;
        for (const m of t.trail) {
          expect(m.residueCents).toBeGreaterThanOrEqual(0);
          for (const row of m.rows) {
            expect(row.closingCents).toBe(row.openingCents + row.interestCents - row.paymentCents - row.extraCents);
            expect(Math.min(row.closingCents, row.paymentCents, row.extraCents)).toBeGreaterThanOrEqual(0);
            paid += row.paymentCents + row.extraCents;
            interest += row.interestCents;
          }
        }
        if (s.months === null) continue;
        checked++;
        // Saldo final zero em todas, e o total pago = saldos iniciais + juros.
        const last = new Map<number, number>();
        for (const m of t.trail) for (const row of m.rows) last.set(row.index, row.closingCents);
        expect([...last.values()].every((v) => v === 0)).toBe(true);
        expect([paid, interest]).toEqual([s.totalPaidCents, s.interestCents]);
        expect(paid).toBe(r.initialSumCents + interest);
      }
    }
    expect(checked).toBeGreaterThan(150);
  });

  it('crédito do valor a mais numa parcelada: o saldo líquido segue saldo anterior × (1 + i) − pagamentos, a menos de centavos', () => {
    const input: PlanoInput = { extra: '150,00', dividas: [parcelada('850,00', '36', '1,5', 'Carro')] };
    const t = planoTrail(input, 'com_extra')!;
    for (const m of t.trail) {
      const row = m.rows[0]!;
      const expected = row.openingCents * 1.015 - row.paymentCents - row.extraCents;
      expect(Math.abs(row.closingCents - expected), `mês ${m.month}`).toBeLessThanOrEqual(2);
    }
  });

  it('saldo final do simulador igual à referência de 40 dígitos, com a taxa mensal completa (não os 0,80% da tela)', () => {
    // R$ 500,00 por mês, 120 meses, 10% ao ano: R$ 100.728,79.
    expect(BigInt(finalValueCents(0, 50_000, 120, 1_000))).toBe(exactFinal(0, 50_000, 120, 1_000));
    expect(finalValueCents(0, 50_000, 120, 1_000)).toBe(10_072_879);
    // Com a taxa arredondada da tela (0,80% ao mês), daria outro número.
    const rounded = (50_000 * 1.008 * (Math.pow(1.008, 120) - 1)) / 0.008;
    expect(Math.floor(rounded)).not.toBe(10_072_879);
    // (1,10)^(1/12) − 1 = 0,797414...%: 1,0080^12 é só aproximadamente 1,10.
    expect(monthlyRate(1_000)).toBeCloseTo(Number(monthlyFactor(1_000) - SCALE) / 1e40, 15);
    expect(monthlyRate(1_000)).toBeCloseTo(0.00797414, 8);
    expect(Math.pow(1.008, 12)).toBeCloseTo(1.10034, 5);
    const next = lcg(77);
    for (let k = 0; k < 60; k++) {
      const initial = next(1_000_000);
      const monthly = next(500_000);
      const months = 1 + next(600);
      const rate = next(3_001);
      expect(BigInt(finalValueCents(initial, monthly, months, rate)), `${initial} ${monthly} ${months} ${rate}`).toBe(exactFinal(initial, monthly, months, rate));
    }
  });

  it('política do centavo: o valor em dinheiro de hoje parte do total mostrado (R$ 64.862,05, não R$ 64.862,06)', () => {
    // Exato: piso(10.072.879 × 1.000^10 ÷ 1.045^10) = 6.486.205.
    expect(BigInt(todayValueCents(10_072_879, 120, 450))).toBe((10_072_879n * 1_000n ** 10n) / 1_045n ** 10n);
    expect(todayValueCents(10_072_879, 120, 450)).toBe(6_486_205);
    // Do total sem arredondar (100.728,7995...), o piso seria 6.486.206: a diferença é a política, não erro de inflação.
    const r = monthlyFactor(1_000);
    let bal = 0n;
    for (let k = 0; k < 120; k++) bal = mul(bal + fx(50_000n), r);
    expect((bal * 1_000n ** 10n) / (1_045n ** 10n * SCALE)).toBe(6_486_206n);
  });

  it('primeiro prazo atingível: nenhum mês antes do prazo devolvido alcança a meta (meta fixa e corrigida)', () => {
    const next = lcg(9001);
    for (let k = 0; k < 40; k++) {
      const target = 100_000 + next(10_000_000);
      const monthly = 1_000 + next(200_000);
      const rate = next(3_001);
      const inflation = next(3_001);
      const n = monthsForAdjustedTarget(target, 0, monthly, rate, inflation);
      if (n === null || n === 0) continue;
      expect(finalValueCents(0, monthly, n, rate)).toBeGreaterThanOrEqual(adjustedTargetCents(target, n, inflation));
      for (let m = 1; m < n; m++) expect(finalValueCents(0, monthly, m, rate)).toBeLessThan(adjustedTargetCents(target, m, inflation));
    }
  });

  it('nenhum resultado negativo, NaN ou infinito nos textos e números das calculadoras com entradas de borda', () => {
    const texts: string[] = [];
    const nums: number[] = [];
    const push = (r: { resultLines: string[]; hypotheses: string[]; notes: string[] }) => texts.push(...r.resultLines, ...r.hypotheses, ...r.notes);
    for (const taxaMes of ['0', '0,01', '99,99'])
      for (const preco of ['0,01', '0,02', '100,00', '9.999.999,99'])
        for (const parcelas of ['1', '3', '4', '480']) {
          const r = okResult(calcAntesDeFinanciar({ preco, parcelas, taxaMes }));
          push(r);
          nums.push(r.parcelaCents, r.lastParcelaCents, r.totalCents, r.interestCents);
        }
    for (const parcela of ['0,01', '108,00', '9.999.999,99'])
      for (const primeiraNaCompra of [false, true]) push(okResult(calcParceladoOuAVista({ aVista: '1.080,00', parcelas: '10', parcela, primeiraNaCompra })));
    for (const dias of ['1', '30', '31', '3.650']) {
      const r = okResult(calcMultaEJuros({ modo: 'fatura', valor: '9.999.999,99', rotativoPct: '99,99', moraPct: '20', multaPct: '20', jurosMesPct: '', dias }));
      push(r);
      nums.push(r.totalCents, r.interestCents, r.iofCents!);
    }
    for (const taxaMes of ['0', '99,99']) push(okResult(calcQuitarAntes({ parcela: '9.999.999,99', restantes: '480', taxaMes, modo: 'tudo', prazosEmDias: Array.from({ length: 480 }, (_, k) => k * 30 - 300) })));
    push(okResult(calcReserva({ essenciais: '9.999.999,99', meses: '24', guardado: '0', mensal: '0' })));
    push(okResult(calcJuntarParaObjetivo({ alvo: '9.999.999,99', jaTem: '0', modo: 'prazo', meses: '600' })));
    for (const t of texts) expect(t, t).not.toMatch(/NaN|Infinity|undefined|-R\$|R\$ -/);
    for (const n of nums) expect(Number.isSafeInteger(n) && n >= 0, String(n)).toBe(true);
  });

  it('leitura compartilhada dos campos: negativo, NaN, infinito e formato ambíguo recusados; vazio diferente de zero; vírgula decimal; "2" é 2%', () => {
    for (const bad of ['-5', '-0,01', 'NaN', 'Infinity', '1e3', '1,234', '1.234,567', '0.500', '12 34', '1.2345,00', '+5']) expect(parseBRL(bad), bad).toBeNull();
    expect(parseMoney('')).toEqual({ ok: false, error: 'vazio' });
    expect(parseMoney('0')).toEqual({ ok: false, error: 'zero' });
    expect(parseMoney('1.234,56')).toEqual({ ok: true, value: 123_456 });
    expect(parseMoney('12,5')).toEqual({ ok: true, value: 1_250 });
    // A taxa vira pontos-base inteiros uma vez só: "2" é 2% (200 bp), nunca 200%.
    expect(parsePercentBp('2', { min: 0, max: 9_999 })).toEqual({ ok: true, value: 200 });
    for (const bad of ['NaN', 'Infinity', '1e2', '-1']) expect(parsePercentBp(bad, { min: 0, max: 9_999 }).ok, bad).toBe(false);
    // Prazos inteiros: meio mês não entra.
    expect(parseCount('12,5', 1, 600)).toEqual({ ok: false, error: 'invalido' });
    expect(parseCount('0', 1, 600)).toEqual({ ok: false, error: 'fora_da_faixa' });
  });
});
