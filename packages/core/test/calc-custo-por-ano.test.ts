import { describe, expect, it } from 'vitest';
import { calcCustoPorAno, sumAmounts, type CustoPorAnoInput } from '../src';

const run = (input: CustoPorAnoInput) => {
  const out = calcCustoPorAno(input);
  if (!out.ok) throw new Error(JSON.stringify(out.errors));
  return out.result;
};

describe('8. Quanto custa por ano? (docs/08 §3.2)', () => {
  it('R$ 39,90 + R$ 21,90 + R$ 55,90 + R$ 12,90 por mês: R$ 130,60 por mês, R$ 1.567,20 por ano', () => {
    const soma = sumAmounts(['39,90', '21,90', '55,90', '12,90']);
    expect(soma).toEqual({ ok: true, cents: 13_060, count: 4 });
    const r = run({ valor: '130,60', frequencia: 'mes' });
    expect(r.monthlyCents).toBe(13_060);
    expect(r.yearlyCents).toBe(156_720);
    // Por dia: 1.567,20 ÷ 365 = 4,2937... → R$ 4,29.
    expect(r.dailyCents).toBe(429);
    // Revisão externa de 18/11/2026: "média por dia corrido", não o gasto de um dia de consumo.
    expect(r.resultLines).toEqual(['Com estes números, o gasto soma R$ 1.567,20 por ano.', 'Por mês, fica em R$ 130,60.', 'Média por dia corrido: R$ 4,29.']);
    expect(r.hypotheses).toContain('Média por dia corrido: o valor do ano dividido por 365 dias, não o gasto de um dia de consumo.');
    // Por mês, 12 × 130,60 = 1.567,20 exato: sem a hipótese da referência anual.
    expect(r.hypotheses.some((h) => h.startsWith('O total do ano é a referência'))).toBe(false);
  });

  it('R$ 25,00 por semana: R$ 108,33 por mês, R$ 1.300,00 por ano; hipótese de 52 semanas', () => {
    const r = run({ valor: '25,00', frequencia: 'semana' });
    expect([r.monthlyCents, r.yearlyCents]).toEqual([10_833, 130_000]);
    expect(r.resultLines.join(' ')).toContain('R$ 108,33');
    expect(r.resultLines.join(' ')).toContain('R$ 1.300,00');
    expect(r.hypotheses).toContain('52 semanas por ano (364 dias), sem contar semanas incompletas.');
    // 1.300,00 ÷ 365 = 3,5616... → R$ 3,56.
    expect(r.dailyCents).toBe(356);
    expect(r.resultLines.at(-1)).toBe('Média por dia corrido: R$ 3,56.');
    // 12 × 108,33 = 1.299,96, 4 centavos abaixo do ano: o total do ano é a referência, e a hipótese diz isso.
    expect(12 * r.monthlyCents).toBe(129_996);
    expect(r.hypotheses).toContain('O total do ano é a referência: o valor por mês é arredondado, e 12 vezes ele pode diferir do ano em alguns centavos.');
  });

  it('R$ 18,00 por dia útil: R$ 396,00 por mês, R$ 4.752,00 por ano; hipótese de 22 dias úteis', () => {
    const r = run({ valor: '18,00', frequencia: 'dia_util' });
    expect([r.monthlyCents, r.yearlyCents]).toEqual([39_600, 475_200]);
    expect(r.hypotheses).toContain('22 dias úteis por mês (264 por ano), sem calendário nem feriados.');
    // No dia útil, sem o valor por dia corrido: seria diferente do valor digitado e confundiria.
    expect(r.dailyCents).toBeNull();
    expect(r.resultLines.join(' ')).not.toContain('por dia corrido');
  });

  it('"Anotar como gasto fixo" leva o valor por mês, até o limite', () => {
    expect(run({ valor: '25,00', frequencia: 'semana' }).noteParams).toEqual({ tipo: 'mensal', valor: 10_833 });
    expect(run({ valor: '9.999.999,99', frequencia: 'dia_util' }).noteParams).toBeNull();
    expect(run({ valor: '9.999.999,99', frequencia: 'mes' }).noteParams).toEqual({ tipo: 'mensal', valor: 999_999_999 });
  });

  it('frequência obrigatória e valor maior que zero', () => {
    const out = calcCustoPorAno({ valor: '0', frequencia: null });
    expect(out.ok ? null : out.errors).toEqual({ valor: 'zero', frequencia: 'vazio' });
  });
});
