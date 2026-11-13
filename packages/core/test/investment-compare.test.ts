import { describe, expect, it } from 'vitest';
import { COMPARE_TEXT, businessDaysFor, compareNetYields, type CompareDraft } from '../src';

const draft = (p: Partial<CompareDraft>): CompareDraft => ({ amountText: '10.000,00', daysText: '365', cdiText: '12', ipcaText: '4', options: [], ...p });

describe('comparar rendimentos líquidos (D-099, item 10)', () => {
  it('um ano a 100% do CDI de 12%: bruto de 12%, imposto de 17,5% sobre o rendimento', () => {
    expect(businessDaysFor(365)).toBe(252);
    const r = compareNetYields(draft({ options: [{ kind: 'cdi_tributado', rateText: '100' }] }));
    expect(r.ok && r.result.options[0]).toMatchObject({ grossCents: 1_120_000, irCents: 21_000, iofCents: 0, netCents: 1_099_000 });
  });

  it('isento a 90% do CDI e o equivalente com imposto; as opções na ordem em que foram montadas', () => {
    const r = compareNetYields(draft({ options: [{ kind: 'cdi_isento', rateText: '90' }, { kind: null, rateText: '' }, { kind: 'prefixado_tributado', rateText: '12' }] }));
    if (!r.ok) throw new Error(JSON.stringify(r.errors));
    const daily = 1.12 ** (1 / 252) - 1;
    expect(r.result.options.map((o) => o.index)).toEqual([0, 2]);
    expect(r.result.options[0]).toMatchObject({ grossCents: Math.round(1_000_000 * (1 + 0.9 * daily) ** 252), irCents: 0, equivalentBp: Math.round(9000 / 0.825) });
    expect(r.result.options[1]).toMatchObject({ grossCents: 1_120_000, netCents: 1_099_000 });
    expect(COMPARE_TEXT.equivalent(r.result.options[0]!)).toBe('Neste prazo, equivale a cerca de 109,09% do CDI com imposto.');
  });

  it('prazo curto: IOF antes do imposto; IPCA mais taxa', () => {
    const r = compareNetYields(draft({ daysText: '10', options: [{ kind: 'prefixado_tributado', rateText: '12' }, { kind: 'ipca_tributado', rateText: '6' }] }));
    if (!r.ok) throw new Error('falhou');
    const o = r.result.options[0]!;
    const gain = o.grossCents - 1_000_000;
    expect(o.iofCents).toBe(Math.round(gain * 0.66));
    expect(o.irCents).toBe(Math.round((gain - o.iofCents) * 0.225));
    expect(r.result.hypotheses.some((h) => h.includes('IOF'))).toBe(true);
    expect(r.result.options[1]!.grossCents).toBe(Math.round(1_000_000 * 1.04 ** (10 / 365) * 1.06 ** (businessDaysFor(10) / 252)));
  });

  it('erros nos campos: valor, prazo, CDI só quando alguma opção usa, taxa de cada opção e nenhuma opção', () => {
    expect(compareNetYields(draft({ amountText: '', daysText: '0', options: [] }))).toEqual({
      ok: false,
      errors: { amountText: COMPARE_TEXT.errors.amountEmpty, daysText: COMPARE_TEXT.errors.days, 'option.0': COMPARE_TEXT.errors.noOption },
    });
    const r = compareNetYields(draft({ cdiText: '', options: [{ kind: 'prefixado_tributado', rateText: '' }, { kind: 'cdi_isento', rateText: '600' }] }));
    expect(r).toEqual({ ok: false, errors: { cdiText: COMPARE_TEXT.errors.cdiEmpty, 'option.0': COMPARE_TEXT.errors.rateEmpty, 'option.1': COMPARE_TEXT.errors.rate } });
    expect(compareNetYields(draft({ cdiText: '', options: [{ kind: 'prefixado_isento', rateText: '11' }] })).ok).toBe(true);
  });

  it('os textos não recomendam, não ranqueiam e não usam travessão', () => {
    const all = JSON.stringify(COMPARE_TEXT);
    expect(all).not.toMatch(/melhor|recomend(o|amos|a-se)|vale a pena|[–—]/i);
  });
});
