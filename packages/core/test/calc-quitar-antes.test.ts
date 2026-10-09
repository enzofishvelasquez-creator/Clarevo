import { describe, expect, it } from 'vitest';
import { QUITAR_ESTIMATE_TEXT, calcQuitarAntes, type QuitarInput } from '../src';

const base: QuitarInput = { parcela: '850,00', restantes: '36', taxaMes: '1,5', modo: 'tudo' };
const run = (over: Partial<QuitarInput> = {}) => {
  const out = calcQuitarAntes({ ...base, ...over });
  if (!out.ok) throw new Error(JSON.stringify(out.errors));
  return out.result;
};

describe('3. Quitar antes ou adiantar parcelas (docs/08 §3.2; D-034(3))', () => {
  it('36 × R$ 850,00 a 1,5%: soma R$ 30.600,00; quitar hoje ≈ R$ 23.511,58; desconto R$ 7.088,42', () => {
    const r = run();
    expect([r.sumCents, r.presentValueCents, r.discountCents]).toEqual([3_060_000, 2_351_158, 708_842]);
    expect(r.resultLines).toEqual([
      'Valor estimado para quitar hoje: R$ 23.511,58',
      'Desconto estimado sobre a soma das parcelas: R$ 7.088,42',
      'Soma das 36 parcelas: R$ 30.600,00',
    ]);
    expect(r.notes).toEqual([QUITAR_ESTIMATE_TEXT]);
    expect(QUITAR_ESTIMATE_TEXT).toBe('Estimativa. O valor oficial é o que a instituição informar; peça o valor atualizado.');
    expect(r.hypotheses[0]).toBe('Próxima parcela em 1 mês e as outras a cada mês.');
    const all = [...r.resultLines, ...r.hypotheses, ...r.notes].join(' ');
    expect(all).not.toMatch(/saldo devedor/i);
  });

  it('adiantar as 3 últimas: R$ 1.514,47 em vez de R$ 2.550,00', () => {
    const r = run({ modo: 'ultimas', quantas: '3' });
    expect([r.count, r.sumCents, r.presentValueCents, r.discountCents]).toEqual([3, 255_000, 151_447, 103_553]);
    expect(r.resultLines[0]).toBe('Valor estimado para adiantar as 3 últimas hoje: R$ 1.514,47');
    expect(r.resultLines[2]).toBe('Soma das 3 últimas parcelas: R$ 2.550,00');
    expect(run({ modo: 'ultimas', quantas: '1' }).resultLines[0]).toMatch(/^Valor estimado para adiantar a última hoje: /);
  });

  it('com os vencimentos da série: t = dias ÷ 30 e a hipótese "próxima parcela em 1 mês" some', () => {
    const days = Array.from({ length: 36 }, (_, k) => 30 * (k + 1));
    const r = run({ prazosEmDias: days });
    expect(r.usesDueDates).toBe(true);
    expect(r.presentValueCents).toBe(2_351_158);
    expect(r.hypotheses).not.toContain('Próxima parcela em 1 mês e as outras a cada mês.');
    expect(r.hypotheses[0]).toBe('Prazos contados pelos vencimentos das parcelas, com 30 dias por mês.');
    // Próxima em 3 dias: o valor estimado sobe (menos desconto).
    const soon = run({ prazosEmDias: days.map((d) => d - 27) });
    expect(soon.presentValueCents).toBeGreaterThan(2_351_158);
    // Vencida (dias negativos) conta como hoje.
    const late = run({ restantes: '2', prazosEmDias: [-10, 20] });
    expect(late.presentValueCents).toBe(Math.floor(85_000 + 85_000 / Math.pow(1.015, 20 / 30) + 0.5));
  });

  it('prazos com quantidade diferente de "restantes" são ignorados', () => {
    const r = run({ restantes: '36', prazosEmDias: [30, 60] });
    expect(r.usesDueDates).toBe(false);
    expect(r.presentValueCents).toBe(2_351_158);
  });

  it('erros: quantas acima das restantes, modo vazio e taxa fora da faixa', () => {
    const e = (over: Partial<QuitarInput>) => {
      const out = calcQuitarAntes({ ...base, ...over });
      return out.ok ? null : out.errors;
    };
    expect(e({ modo: 'ultimas', quantas: '37' })).toEqual({ quantas: 'fora_da_faixa' });
    expect(e({ modo: 'ultimas', quantas: '' })).toEqual({ quantas: 'vazio' });
    expect(e({ modo: null })).toEqual({ modo: 'vazio' });
    expect(e({ taxaMes: '0' })).toEqual({ taxaMes: 'fora_da_faixa' });
    expect(e({ restantes: '481', parcela: '' })).toEqual({ parcela: 'vazio', restantes: 'fora_da_faixa' });
    expect(e({ modo: 'tudo', quantas: 'x' })).toBeNull();
  });
});
