import { describe, expect, it } from 'vitest';
import { QUITAR_ESTIMATE_TEXT, QUITAR_FIELDS, QUITAR_TEXT, calcErrorText, calcQuitarAntes, type QuitarInput } from '../src';

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
    expect(r.hypotheses).toEqual([QUITAR_TEXT.monthly, QUITAR_TEXT.rate, QUITAR_TEXT.fixed]);
    expect(r.hypotheses[0]).toBe('Próxima parcela em 1 mês e as outras a cada mês.');
    // Revisão externa de 18/11/2026: a taxa é a efetiva do contrato (não o CET), e SAC, índice ou parcelas diferentes não são reproduzidos.
    expect(QUITAR_FIELDS.taxaMes!.hint).toBe('A taxa efetiva de juros ao mês, não o CET. Está no contrato ou no extrato.');
    expect(QUITAR_TEXT.fixed).toContain('tabela SAC');
    expect(QUITAR_TEXT.fixed).toContain('corrigidos por índice');
    expect([r.overdueCount, r.overdueSumCents]).toEqual([0, 0]);
    const all = [...r.resultLines, ...r.hypotheses, ...r.notes].join(' ');
    expect(all).not.toMatch(/saldo devedor/i);
  });

  it('adiantar as 3 últimas: R$ 1.514,47 em vez de R$ 2.550,00', () => {
    const r = run({ modo: 'ultimas', quantas: '3' });
    expect([r.count, r.sumCents, r.presentValueCents, r.discountCents]).toEqual([3, 255_000, 151_447, 103_553]);
    expect(r.resultLines[0]).toBe('Valor estimado para adiantar as 3 últimas hoje: R$ 1.514,47');
    expect(r.resultLines[2]).toBe('Soma das 3 últimas parcelas: R$ 2.550,00');
    expect(run({ modo: 'ultimas', quantas: '1' }).resultLines[0]).toMatch(/^Valor estimado para adiantar a última hoje: /);
    // Adiantar as últimas encurta o prazo; reduzir a parcela depende do contrato (revisão externa de 18/11/2026).
    expect(r.hypotheses).toContain(QUITAR_TEXT.last);
    expect(QUITAR_TEXT.last).toBe('Adiantar as últimas encurta o prazo: as parcelas que continuam ficam com o mesmo valor. Reduzir o valor da parcela, em vez do prazo, depende do contrato.');
  });

  it('taxa de 0%: desconto zero, e o valor para pagar hoje é a soma das parcelas (revisão externa de 18/11/2026)', () => {
    const r = run({ taxaMes: '0' });
    expect([r.sumCents, r.presentValueCents, r.discountCents]).toEqual([3_060_000, 3_060_000, 0]);
    expect(r.hypotheses[1]).toBe(QUITAR_TEXT.zeroRate);
    expect(run({ taxaMes: '0', modo: 'ultimas', quantas: '3' }).discountCents).toBe(0);
  });

  it('com os vencimentos da série: t = dias ÷ 30 e a hipótese "próxima parcela em 1 mês" some', () => {
    const days = Array.from({ length: 36 }, (_, k) => 30 * (k + 1));
    const r = run({ prazosEmDias: days });
    expect(r.usesDueDates).toBe(true);
    expect(r.presentValueCents).toBe(2_351_158);
    expect(r.hypotheses).not.toContain('Próxima parcela em 1 mês e as outras a cada mês.');
    expect(r.hypotheses[0]).toBe('Prazos contados pelos vencimentos das parcelas, com 30 dias por mês, uma convenção: a instituição pode contar os dias de outro jeito.');
    // Próxima em 3 dias: o valor estimado sobe (menos desconto).
    const soon = run({ prazosEmDias: days.map((d) => d - 27) });
    expect(soon.presentValueCents).toBeGreaterThan(2_351_158);
    // Vence hoje (0 dia): entra, sem desconto.
    expect(run({ restantes: '1', prazosEmDias: [0] }).presentValueCents).toBe(85_000);
  });

  it('parcela vencida: fica fora do valor presente, sem desconto fictício, e o resultado não é a quitação completa (revisão externa de 18/11/2026)', () => {
    // Antes, a vencida contava como "hoje" e o total aparecia como quitação. Agora só a parcela a vencer (em 20 dias) entra:
    // 85.000 ÷ 1,015^(20 ÷ 30) = 84.159,6... → 84.160; a vencida aparece à parte, sem multa e juros.
    const late = run({ restantes: '2', prazosEmDias: [-10, 20] });
    expect([late.count, late.overdueCount, late.overdueSumCents]).toEqual([1, 1, 85_000]);
    expect(late.presentValueCents).toBe(Math.floor(85_000 / Math.pow(1.015, 20 / 30) + 0.5));
    expect(late.sumCents).toBe(85_000);
    expect(late.discountCents).toBe(85_000 - late.presentValueCents);
    expect(late.resultLines).toEqual([
      'Valor estimado para quitar hoje a parcela a vencer: R$ 841,60',
      'Desconto estimado sobre a soma das parcelas a vencer: R$ 8,40',
      'Soma da parcela a vencer: R$ 850,00',
      'Fora desta conta: 1 parcela vencida (R$ 850,00, sem multa e juros). A instituição soma os encargos delas; por isso, este valor não é a quitação completa.',
    ]);
    expect(late.resultLines.join(' ')).not.toMatch(/Valor estimado para quitar hoje: /);
    // Todas vencidas: nada a descontar, e a frase diz isso.
    const all = run({ restantes: '2', prazosEmDias: [-40, -10] });
    expect([all.count, all.presentValueCents, all.discountCents, all.overdueCount]).toEqual([0, 0, 0, 2]);
    expect(all.resultLines[0]).toBe(QUITAR_TEXT.allOverdue);
    // Adiantar as últimas não toca nas vencidas (são as primeiras).
    const lastOnes = run({ restantes: '3', modo: 'ultimas', quantas: '2', prazosEmDias: [-5, 25, 55] });
    expect([lastOnes.count, lastOnes.overdueCount]).toEqual([2, 0]);
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
    expect(e({ taxaMes: '0' })).toBeNull();
    expect(e({ taxaMes: '100' })).toEqual({ taxaMes: 'fora_da_faixa' });
    expect(calcErrorText('quitar-antes', 'taxaMes', 'fora_da_faixa')).toBe('Use uma taxa de 0% a 99,99% ao mês.');
    expect(e({ restantes: '481', parcela: '' })).toEqual({ parcela: 'vazio', restantes: 'fora_da_faixa' });
    expect(e({ modo: 'tudo', quantas: 'x' })).toBeNull();
  });
});
