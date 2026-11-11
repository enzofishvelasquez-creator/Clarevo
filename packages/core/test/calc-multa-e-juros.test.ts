import { describe, expect, it } from 'vitest';
import { MULTA_CARD_TEXT, MULTA_EXACT_TEXT, MULTA_FATURA_FIELDS, MULTA_FATURA_TEXT, MULTA_FIELDS, calcErrorText, calcFields, calcMultaEJuros, calcPrefill, multaLink, type MultaInput } from '../src';

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
    expect(r.notes).toEqual([MULTA_EXACT_TEXT, MULTA_CARD_TEXT]);
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

  it('faixas: multa de 0% a 20% e juros de 0% a 99,99% ao mês (a fatura do cartão soma rotativo e mora), com 2 casas; dias de 1 a 3.650', () => {
    const e = (input: MultaInput) => {
      const out = calcMultaEJuros(input);
      return out.ok ? null : out.errors;
    };
    expect(e({ valor: '200', multaPct: '20,01', jurosMesPct: '20', dias: '0' })).toEqual({ multaPct: 'fora_da_faixa', dias: 'fora_da_faixa' });
    expect(e({ valor: '200', multaPct: '2,125', jurosMesPct: '1', dias: '3651' })).toEqual({ multaPct: 'casas_demais', dias: 'fora_da_faixa' });
    expect(e({ valor: '200', multaPct: '20', jurosMesPct: '20', dias: '3650' })).toBeNull();
    // Teste de 09/11/2026: "O meu é 20,99. Precisa aceitar" (rotativo de 20,90% mais 1% de mora passa de 20%).
    expect(e({ valor: '200', multaPct: '2', jurosMesPct: '21,90', dias: '20' })).toBeNull();
    expect(e({ valor: '200', multaPct: '2', jurosMesPct: '99,99', dias: '20' })).toBeNull();
    expect(e({ valor: '200', multaPct: '2', jurosMesPct: '100', dias: '20' })).toEqual({ jurosMesPct: 'fora_da_faixa' });
    expect(calcErrorText('multa-e-juros', 'multaPct', 'fora_da_faixa')).toBe('Use uma multa de 0% a 20%.');
    expect(calcErrorText('multa-e-juros', 'jurosMesPct', 'fora_da_faixa')).toBe('Use juros de 0% a 99,99% ao mês.');
    expect(MULTA_FIELDS.jurosMesPct!.hint).toBe('Está no boleto ou no contrato.');
    const card = calcMultaEJuros({ valor: '1.722,40', multaPct: '2', jurosMesPct: '21,90', dias: '20' });
    expect(card.ok && card.result.notes).toEqual([MULTA_EXACT_TEXT, MULTA_CARD_TEXT]);
    // D-093: a fatura do cartão tem o modo próprio; a nota da conta aponta para ele.
    expect(MULTA_CARD_TEXT).toBe('Para a fatura do cartão, escolha "Fatura do cartão" no começo: a conta soma o rotativo, a mora, a multa e o IOF.');
    expect(calcErrorText('multa-e-juros', 'dias', 'fora_da_faixa')).toBe('Use de 1 a 3.650 dias.');
  });
});

describe('Multa e juros, modo "Fatura do cartão" (D-093, era D-089 G)', () => {
  const fatura = (o: Partial<MultaInput> = {}): MultaInput => ({ modo: 'fatura', valor: '1.000,00', rotativoPct: '15', moraPct: '1', multaPct: '2', jurosMesPct: '', dias: '30', ...o });

  it('R$ 1.000,00 sem pagar, 15% de rotativo, 1% de mora, 2% de multa, 30 dias: R$ 150,00 + R$ 10,00 + R$ 20,00 + IOF R$ 6,26 = R$ 1.186,26', () => {
    const r = run(fatura());
    expect([r.modo, r.rotativoCents, r.moraCents, r.fineCents, r.iofCents, r.totalCents, r.capped]).toEqual(['fatura', 15_000, 1_000, 2_000, 626, 118_626, false]);
    expect(r.resultLines).toEqual([
      'Com estes números, 30 dias depois do vencimento a fatura fica em R$ 1.186,26.',
      'Juros do rotativo: R$ 150,00',
      'Juros de mora: R$ 10,00',
      'Multa: R$ 20,00',
      'IOF estimado: R$ 6,26',
    ]);
    expect(r.hypotheses[2]).toBe('IOF de pessoa física: 0,38% mais 0,0082% por dia, até 365 dias.');
    expect(r.notes).toEqual([MULTA_FATURA_TEXT.rotativo, MULTA_FATURA_TEXT.exact]);
    const text = [...r.resultLines, ...r.hypotheses, ...r.notes].join(' ');
    expect(text).not.toMatch(/atras/i);
  });

  it('teto da Lei 14.690/2023: rotativo, mora e multa param no valor não pago (o IOF fica fora do teto)', () => {
    const r = run(fatura({ dias: '365' }));
    expect(r.capped).toBe(true);
    expect(r.rotativoCents! + r.moraCents! + r.fineCents).toBe(100_000);
    expect(r.fineCents).toBe(2_000);
    expect(r.iofCents).toBe(3_373);
    expect(r.totalCents).toBe(200_000 + 3_373);
    expect(r.notes[0]).toBe(MULTA_FATURA_TEXT.cap);
    expect(MULTA_FATURA_TEXT.cap).toContain('Lei 14.690/2023');
    // Bem perto do teto, ainda sem cortar.
    expect(run(fatura({ dias: '30' })).capped).toBe(false);
  });

  it('campos do modo: o valor é o que ficou sem pagar; rotativo até 99,99%, mora e multa até 20%; erros nos campos da fatura', () => {
    expect(calcFields('multa-e-juros', 'fatura')).toBe(MULTA_FATURA_FIELDS);
    expect(MULTA_FATURA_FIELDS.valor!.label).toBe('Valor que ficou sem pagar');
    expect(MULTA_FIELDS.modo!.options!.map((o) => o.label)).toEqual(['Conta ou boleto', 'Fatura do cartão']);
    const out = calcMultaEJuros(fatura({ rotativoPct: '100', moraPct: '20,01', valor: '' }));
    expect(out.ok ? null : out.errors).toEqual({ valor: 'vazio', rotativoPct: 'fora_da_faixa', moraPct: 'fora_da_faixa' });
    expect(calcErrorText('multa-e-juros', 'moraPct', 'fora_da_faixa', 'fatura')).toBe('Use juros de mora de 0% a 20% ao mês.');
    // Sem modo, é a conta ou boleto de sempre (o campo de juros é o jurosMesPct).
    expect(run({ valor: '200,00', multaPct: '2', jurosMesPct: '1', dias: '10' }).modo).toBe('conta');
  });

  it('a fatura vencida abre a calculadora no modo da fatura; a conta, no modo de sempre', () => {
    const base = { status: 'aberto' as const, dueOn: '2026-10-10', amountCents: 55_000 };
    expect(multaLink({ ...base, invoice: { cardId: 'c', month: '2026-10' } as never }, '2026-10-20')).toEqual({ modo: 'fatura', valorCents: 55_000, dias: 10, origem: 'conta' });
    expect(multaLink(base, '2026-10-20')).toEqual({ valorCents: 55_000, dias: 10, origem: 'conta' });
    expect(calcPrefill('multa-e-juros', { modo: 'fatura', valor: '55000', dias: '10' }).modo).toBe('fatura');
    expect(calcPrefill('multa-e-juros', { modo: 'outro' }).modo).toBeUndefined();
  });
});
