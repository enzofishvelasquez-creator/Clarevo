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
    expect(r.resultLines).toEqual(['Com estes números, o gasto soma R$ 1.567,20 por ano.', 'Por mês, fica em R$ 130,60.']);
  });

  it('R$ 25,00 por semana: R$ 108,33 por mês, R$ 1.300,00 por ano; hipótese de 52 semanas', () => {
    const r = run({ valor: '25,00', frequencia: 'semana' });
    expect([r.monthlyCents, r.yearlyCents]).toEqual([10_833, 130_000]);
    expect(r.resultLines.join(' ')).toContain('R$ 108,33');
    expect(r.resultLines.join(' ')).toContain('R$ 1.300,00');
    expect(r.hypotheses).toContain('52 semanas por ano.');
  });

  it('R$ 18,00 por dia útil: R$ 396,00 por mês, R$ 4.752,00 por ano; hipótese de 22 dias úteis', () => {
    const r = run({ valor: '18,00', frequencia: 'dia_util' });
    expect([r.monthlyCents, r.yearlyCents]).toEqual([39_600, 475_200]);
    expect(r.hypotheses).toContain('22 dias úteis por mês.');
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
