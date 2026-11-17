import { describe, expect, it } from 'vitest';
import {
  CALCULATORS,
  CALC_SLUGS,
  JUROS_COMPOSTOS_FIELDS,
  RENDIMENTO_CDI_FIELDS,
  SIMULATE_DISCLAIMER,
  SITE_CALCULATORS,
  SITE_CALC_FIELDS,
  calcJurosCompostos,
  calcRendimentoCdi,
  finalValueCents,
  fixedIncomeTaxBp,
  isCalcSlug,
  isSiteCalcSlug,
  regressiveTableText,
  INVESTMENT_TAX_RULES,
  type JurosCompostosInput,
  type RendimentoCdiInput,
} from '../src';

/**
 * As duas calculadoras novas do site (D-106): juros compostos e quanto rende a um percentual do CDI. Ficam fora de CALCULATORS (a tela
 * do app continua com as dez de antes), com o resultado marcado como estimativa e as premissas escritas.
 */
const juros = (input: JurosCompostosInput) => {
  const out = calcJurosCompostos(input);
  if (!out.ok) throw new Error(JSON.stringify(out.errors));
  return out.result;
};
const cdi = (input: RendimentoCdiInput) => {
  const out = calcRendimentoCdi(input);
  if (!out.ok) throw new Error(JSON.stringify(out.errors));
  return out.result;
};

describe('calculadoras só do site (D-106)', () => {
  it('ficam fora da lista do app, no grupo "Guardar e dividir", com o aviso do simulador', () => {
    expect(CALCULATORS).toHaveLength(10);
    expect(SITE_CALCULATORS.map((c) => c.slug)).toEqual(['juros-compostos', 'rendimento-cdi']);
    for (const c of SITE_CALCULATORS) {
      expect(isCalcSlug(c.slug), c.slug).toBe(false);
      expect(isSiteCalcSlug(c.slug)).toBe(true);
      expect(CALC_SLUGS).not.toContain(c.slug);
      expect(c.group).toBe('guardar');
      expect(c.disclaimer).toBe(SIMULATE_DISCLAIMER);
    }
    expect(isSiteCalcSlug('reserva')).toBe(false);
    expect(SITE_CALC_FIELDS['juros-compostos']).toBe(JUROS_COMPOSTOS_FIELDS);
    expect(SITE_CALC_FIELDS['rendimento-cdi']).toBe(RENDIMENTO_CDI_FIELDS);
  });
});

describe('Juros compostos (a conta do simulador do app, modo "Quanto posso ter")', () => {
  it('R$ 500,00 por mês a 10% ao ano por 120 meses: R$ 100.728,79, a mesma conta do simulador', () => {
    const r = juros({ mensal: '500,00', taxaAno: '10', meses: '120' });
    expect(r.finalCents).toBe(finalValueCents(0, 50_000, 120, 1_000));
    expect(r.finalCents).toBe(10_072_879);
    expect(r.contributedCents).toBe(6_000_000);
    expect(r.interestCents).toBe(4_072_879);
    expect(r.resultLines).toEqual(['Estimativa: R$ 100.728,79 em 120 meses (10 anos)', 'Total guardado: R$ 60.000,00', 'Juros na estimativa: R$ 40.728,79']);
    expect(r.notes[0]).toMatch(/^É uma estimativa/);
    expect(r.hypotheses).toEqual([
      'Taxa de 10% ao ano (0,80% ao mês, taxa equivalente), a mesma em todo o prazo.',
      'Valor de cada mês guardado no início do mês, como na Calculadora do Cidadão do Banco Central.',
      'Valores brutos, sem Imposto de Renda, IOF, taxas nem inflação.',
      'Valores arredondados para baixo, no centavo.',
    ]);
  });

  it('só com o valor inicial (0 por mês) vale; sem nada para começar e nada por mês, não', () => {
    const r = juros({ inicial: '10.000,00', mensal: '0', taxaAno: '12', meses: '24' });
    expect(r.finalCents).toBe(finalValueCents(1_000_000, 0, 24, 1_200));
    expect(r.hypotheses).not.toContain('Valor de cada mês guardado no início do mês, como na Calculadora do Cidadão do Banco Central.');
    const nada = calcJurosCompostos({ inicial: '', mensal: '0', taxaAno: '10', meses: '12' });
    expect(nada.ok ? null : nada.errors).toEqual({ mensal: 'zero' });
    expect(JUROS_COMPOSTOS_FIELDS.mensal.errors?.zero).toBe('Informe quanto vai guardar por mês ou quanto já tem para começar.');
  });

  it('taxa de 0% não rende; campos vazios e fora da faixa dão o erro do campo; resultado gigante pede um prazo menor', () => {
    const zero = juros({ mensal: '100,00', taxaAno: '0', meses: '12' });
    expect([zero.finalCents, zero.interestCents]).toEqual([120_000, 0]);
    expect(zero.hypotheses[0]).toBe('Taxa de 0% ao ano: sem juros.');
    const vazio = calcJurosCompostos({ mensal: '', taxaAno: '', meses: '' });
    expect(vazio.ok ? null : vazio.errors).toEqual({ mensal: 'vazio', taxaAno: 'vazio', meses: 'vazio' });
    const fora = calcJurosCompostos({ mensal: '100', taxaAno: '30,01', meses: '601' });
    expect(fora.ok ? null : fora.errors).toEqual({ taxaAno: 'fora_da_faixa', meses: 'fora_da_faixa' });
    const alto = calcJurosCompostos({ inicial: '9.999.999,99', mensal: '9.999.999,99', taxaAno: '30', meses: '600' });
    expect(alto.ok ? null : alto.errors).toEqual({ meses: 'resultado_alto' });
  });
});

describe('Quanto rende a um percentual do CDI (tabela regressiva do Imposto de Renda)', () => {
  it('R$ 10.000,00 a 100% de um CDI de 10% por 12 meses: R$ 11.000,00 brutos, 17,5% de imposto e R$ 10.825,00 líquidos', () => {
    const r = cdi({ valor: '10.000,00', percentual: '100', cdiAno: '10', meses: '12', imposto: 'regressivo' });
    expect([r.businessDays, r.calendarDays]).toEqual([252, 365]);
    expect([r.grossCents, r.grossYieldCents, r.taxRateBp, r.taxCents, r.netCents, r.netYieldCents]).toEqual([1_100_000, 100_000, 1_750, 17_500, 1_082_500, 82_500]);
    expect(r.resultLines).toEqual([
      'Estimativa: R$ 10.825,00 ao fim de 12 meses (1 ano), já sem o Imposto de Renda',
      'Valor bruto: R$ 11.000,00 (rendimento de R$ 1.000,00, 10,00% no período)',
      'Imposto de Renda estimado: R$ 175,00 (17,5% do rendimento, para cerca de 365 dias)',
      'Rendimento líquido: R$ 825,00 (8,25% no período)',
    ]);
    expect(r.notes).toEqual([
      'Na tabela regressiva, a alíquota cai com o prazo: 22,5% até 180 dias, 20% de 181 a 360, 17,5% de 361 a 720 e 15% acima de 720 dias.',
      'O CDI acompanha a Selic e muda com o tempo: o resultado de verdade pode ser maior ou menor que esta estimativa.',
    ]);
    expect(r.hypotheses).toEqual([
      'CDI de 10% ao ano, o mesmo em todo o prazo.',
      'A aplicação rende 100% do CDI em cada dia útil, com 21 dias úteis por mês (252 por ano).',
      'Prazo de cerca de 365 dias corridos, sem resgatar antes. Resgates com menos de 30 dias também pagam IOF.',
      'Imposto de Renda pela tabela regressiva da renda fixa (Lei 11.033/2004), só sobre o rendimento, no resgate.',
      'Sem taxas, custódia nem come-cotas. Valores no centavo.',
    ]);
  });

  it('a alíquota segue o prazo em dias corridos: 6 meses (cerca de 183 dias) pagam 20%; 24 meses, 15%; 5 meses, 22,5%', () => {
    const base = { valor: '10.000,00', percentual: '110', cdiAno: '12', imposto: 'regressivo' as const };
    expect([5, 6, 12, 24].map((m) => cdi({ ...base, meses: String(m) }).taxRateBp)).toEqual([2_250, 2_000, 1_750, 1_500]);
    expect(cdi({ ...base, meses: '6' }).calendarDays).toBe(183);
    // 110% do CDI rende mais que 100% do mesmo CDI, e nunca o dobro.
    const a100 = cdi({ ...base, percentual: '100', meses: '12' }).grossYieldCents;
    const a110 = cdi({ ...base, meses: '12' }).grossYieldCents;
    expect(a110).toBeGreaterThan(a100);
    expect(a110).toBeLessThan(a100 * 1.2);
  });

  it('isento: sem imposto, duas linhas; a hipótese diz por quê', () => {
    const r = cdi({ valor: '10.000,00', percentual: '100', cdiAno: '11', meses: '12', imposto: 'isento' });
    expect([r.grossCents, r.taxCents, r.taxRateBp, r.netCents]).toEqual([1_110_000, 0, null, 1_110_000]);
    expect(r.resultLines).toEqual(['Estimativa: R$ 11.100,00 ao fim de 12 meses (1 ano)', 'Rendimento: R$ 1.100,00 (11,00% no período)']);
    expect(r.hypotheses[3]).toBe('Sem Imposto de Renda, como nas aplicações que a lei isenta para pessoa física.');
    expect(r.notes).toHaveLength(1);
  });

  it('erros por campo e o resultado gigante', () => {
    const vazio = calcRendimentoCdi({ valor: '', percentual: '', cdiAno: '', meses: '', imposto: null });
    expect(vazio.ok ? null : vazio.errors).toEqual({ valor: 'vazio', percentual: 'vazio', cdiAno: 'vazio', meses: 'vazio', imposto: 'vazio' });
    const fora = calcRendimentoCdi({ valor: '0', percentual: '0,5', cdiAno: '31', meses: '0', imposto: 'regressivo' });
    expect(fora.ok ? null : fora.errors).toEqual({ valor: 'zero', percentual: 'fora_da_faixa', cdiAno: 'fora_da_faixa', meses: 'fora_da_faixa' });
    const alto = calcRendimentoCdi({ valor: '9.999.999,99', percentual: '300', cdiAno: '30', meses: '600', imposto: 'isento' });
    expect(alto.ok ? null : alto.errors).toEqual({ meses: 'resultado_alto' });
    expect(RENDIMENTO_CDI_FIELDS.imposto.default).toBe('regressivo');
  });

  it('a tabela do texto é a das alíquotas do núcleo, que é a mesma da estimativa do app em Investir', () => {
    expect(regressiveTableText()).toBe('22,5% até 180 dias, 20% de 181 a 360, 17,5% de 361 a 720 e 15% acima de 720 dias');
    for (const faixa of INVESTMENT_TAX_RULES.regressive) {
      const dias = Number.isFinite(faixa.maxDays) ? faixa.maxDays : 721;
      expect(fixedIncomeTaxBp(dias) / 10_000, `${dias} dias`).toBe(faixa.rate);
    }
  });
});
