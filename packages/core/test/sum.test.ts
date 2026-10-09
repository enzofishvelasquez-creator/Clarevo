import { describe, expect, it } from 'vitest';
import { MAX_RECORD_CENTS, SUM_MAX_VALUES, SUM_TEXT, centsToInput, sumAmounts } from '../src';

describe('Somar valores (docs/08 §2.2)', () => {
  it('"35,90" + "12,50" = 4.840 e "Total: R$ 48,40"; "Usar o total" preenche "48,40"', () => {
    const r = sumAmounts(['35,90', '12,50']);
    expect(r).toEqual({ ok: true, cents: 4_840, count: 2 });
    expect(SUM_TEXT.total(4_840)).toBe('Total: R$ 48,40');
    expect(centsToInput(4_840)).toBe('48,40');
  });

  it('campos vazios são ignorados; nenhum valor dá zero', () => {
    expect(sumAmounts(['', ' 10 ', '   ', '0,5'])).toEqual({ ok: true, cents: 1_050, count: 2 });
    expect(sumAmounts([])).toEqual({ ok: true, cents: 0, count: 0 });
    expect(sumAmounts(['', ''])).toEqual({ ok: true, cents: 0, count: 0 });
  });

  it('valor inválido ou acima do limite aponta o índice', () => {
    expect(sumAmounts(['10', '1,234'])).toEqual({ ok: false, index: 1, error: 'invalido' });
    expect(sumAmounts(['-5'])).toEqual({ ok: false, index: 0, error: 'invalido' });
    expect(sumAmounts(['1', '10.000.000,00'])).toEqual({ ok: false, index: 1, error: 'acima_do_limite' });
  });

  it('total até R$ 9.999.999,99; acima, total_alto no valor que passou', () => {
    expect(sumAmounts(['9.999.999,98', '0,01'])).toEqual({ ok: true, cents: MAX_RECORD_CENTS, count: 2 });
    expect(sumAmounts(['9.999.999,98', '0,01', '0,01'])).toEqual({ ok: false, index: 2, error: 'total_alto' });
    expect(SUM_TEXT.errors.total_alto).toBe('A soma passa do valor máximo de R$ 9.999.999,99.');
  });

  it('até 10 valores e textos da tela', () => {
    expect(SUM_MAX_VALUES).toBe(10);
    expect([SUM_TEXT.open, SUM_TEXT.add, SUM_TEXT.use]).toEqual(['Somar valores', 'Adicionar outro valor', 'Usar o total']);
    expect(SUM_TEXT.itemLabel(0)).toBe('Valor 1 da soma');
  });
});
