import { describe, expect, it } from 'vitest';
import { calcJuntarParaObjetivo, type ObjetivoInput } from '../src';

const run = (input: ObjetivoInput) => {
  const out = calcJuntarParaObjetivo(input);
  if (!out.ok) throw new Error(JSON.stringify(out.errors));
  return out.result;
};

describe('6. Juntar para um objetivo (docs/08 §3.2)', () => {
  it('R$ 22.500,00 em 14 meses, começando com R$ 4.500,00: R$ 1.285,72 por mês', () => {
    const r = run({ alvo: '22.500,00', jaTem: '4.500,00', modo: 'prazo', meses: '14' });
    expect([r.missingCents, r.monthlyCents, r.months]).toEqual([1_800_000, 128_572, 14]);
    expect(r.resultLines).toEqual([
      'Com estes números, são R$ 1.285,72 por mês, por 14 meses (1 ano e 2 meses).',
      'Faltam R$ 18.000,00 para chegar a R$ 22.500,00.',
    ]);
    expect(r.hypotheses).toContain('Sem rendimento: o valor guardado não cresce com juros.');
    expect(r.hypotheses).toContain('Valor por mês arredondado para cima, no centavo.');
  });

  it('com R$ 1.000,00 por mês, leva 18 meses', () => {
    const r = run({ alvo: '22.500,00', jaTem: '4.500,00', modo: 'mensal', mensal: '1.000,00' });
    expect(r.months).toBe(18);
    expect(r.resultLines[0]).toBe('Com estes números, guardando R$ 1.000,00 por mês, você chega lá em 18 meses (1 ano e 6 meses).');
    // Divisão exata: sem a hipótese do último mês menor.
    expect(r.hypotheses.join(' ')).not.toContain('último mês');
    expect(run({ alvo: '22.500,00', jaTem: '4.500,00', modo: 'mensal', mensal: '1.100,00' }).hypotheses.join(' ')).toContain('último mês');
  });

  it('já tem o valor; "já tem" opcional; meses de 1 a 600', () => {
    expect(run({ alvo: '1.000,00', jaTem: '1.000,00', modo: 'prazo', meses: '3' }).resultLines).toEqual([
      'Com estes números, você já tem o valor do objetivo.',
    ]);
    expect(run({ alvo: '1.000,00', modo: 'prazo', meses: '1' }).resultLines[0]).toBe('Com estes números, são R$ 1.000,00 por mês, por 1 mês.');
    const out = calcJuntarParaObjetivo({ alvo: '1.000,00', modo: 'prazo', meses: '601' });
    expect(out.ok ? null : out.errors).toEqual({ meses: 'fora_da_faixa' });
    const out2 = calcJuntarParaObjetivo({ alvo: '1.000,00', modo: 'mensal', mensal: '0' });
    expect(out2.ok ? null : out2.errors).toEqual({ mensal: 'zero' });
    const out3 = calcJuntarParaObjetivo({ alvo: '', modo: null });
    expect(out3.ok ? null : out3.errors).toEqual({ alvo: 'vazio', modo: 'vazio' });
  });
});
