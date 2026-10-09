import { describe, expect, it } from 'vitest';
import { MULTA_EXACT_TEXT, calcErrorText, calcMultaEJuros, type MultaInput } from '../src';

const run = (input: MultaInput) => {
  const out = calcMultaEJuros(input);
  if (!out.ok) throw new Error(JSON.stringify(out.errors));
  return out.result;
};

describe('4. Multa e juros por atraso (docs/08 §3.2)', () => {
  it('R$ 200,00, 2%, 1% ao mês, 10 dias: R$ 4,00 + R$ 0,67 = R$ 204,67', () => {
    const r = run({ valor: '200,00', multaPct: '2', jurosMesPct: '1', dias: '10' });
    expect([r.fineCents, r.interestCents, r.totalCents]).toEqual([400, 67, 20_467]);
    expect(r.resultLines).toEqual([
      'Com estes números, 10 dias depois do vencimento a conta fica em R$ 204,67.',
      'Multa: R$ 4,00',
      'Juros: R$ 0,67',
    ]);
    expect(r.notes).toEqual([MULTA_EXACT_TEXT]);
    expect(MULTA_EXACT_TEXT).toBe('O valor exato é o do boleto atualizado.');
  });

  it('o resultado fala em "depois do vencimento", nunca em atraso', () => {
    for (const dias of ['1', '30', '3.650']) {
      const r = run({ valor: '200,00', multaPct: '2', jurosMesPct: '1', dias });
      const text = [...r.resultLines, ...r.hypotheses, ...r.notes].join(' ');
      expect(text).toContain('depois do vencimento');
      expect(text).not.toMatch(/atras/i);
    }
    expect(run({ valor: '200,00', multaPct: '0', jurosMesPct: '0', dias: '1' }).resultLines[0]).toBe(
      'Com estes números, 1 dia depois do vencimento a conta fica em R$ 200,00.',
    );
  });

  it('faixas: multa e juros de 0% a 20% com 2 casas; dias de 1 a 3.650', () => {
    const e = (input: MultaInput) => {
      const out = calcMultaEJuros(input);
      return out.ok ? null : out.errors;
    };
    expect(e({ valor: '200', multaPct: '20,01', jurosMesPct: '20', dias: '0' })).toEqual({ multaPct: 'fora_da_faixa', dias: 'fora_da_faixa' });
    expect(e({ valor: '200', multaPct: '2,125', jurosMesPct: '1', dias: '3651' })).toEqual({ multaPct: 'casas_demais', dias: 'fora_da_faixa' });
    expect(e({ valor: '200', multaPct: '20', jurosMesPct: '20', dias: '3650' })).toBeNull();
    expect(calcErrorText('multa-e-juros', 'multaPct', 'fora_da_faixa')).toBe('Use uma multa de 0% a 20%.');
    expect(calcErrorText('multa-e-juros', 'dias', 'fora_da_faixa')).toBe('Use de 1 a 3.650 dias.');
  });
});
