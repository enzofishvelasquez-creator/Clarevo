import { describe, expect, it } from 'vitest';
import {
  FATURA_CYCLE_DAYS,
  MULTA_CARD_TEXT,
  MULTA_CONSUMER_FINE_TEXT,
  MULTA_EXACT_TEXT,
  MULTA_FATURA_FIELDS,
  MULTA_FATURA_HYPOTHESES,
  MULTA_FATURA_TEXT,
  MULTA_FIELDS,
  calcErrorText,
  calcFields,
  calcMultaEJuros,
  calcPrefill,
  multaLink,
  type MultaInput,
} from '../src';

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
    // Revisão externa de 18/11/2026: acima de 2%, o aviso das relações de consumo (CDC, art. 52, § 1º), sem validar nem generalizar.
    const high = run({ valor: '200,00', multaPct: '10', jurosMesPct: '1', dias: '10' });
    expect(high.aboveConsumerFine).toBe(true);
    expect(high.fineCents).toBe(2_000);
    expect(high.notes).toEqual([MULTA_CONSUMER_FINE_TEXT, MULTA_EXACT_TEXT, MULTA_CARD_TEXT]);
    expect(MULTA_CONSUMER_FINE_TEXT).toContain('outras obrigações, como aluguel e tributos, têm regras próprias');
    expect(MULTA_CONSUMER_FINE_TEXT).not.toMatch(/atras/i);
    expect(run({ valor: '200,00', multaPct: '2', jurosMesPct: '1', dias: '10' }).aboveConsumerFine).toBe(false);
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
    // Revisão externa de 18/11/2026: sem "a fatura pode vir um pouco maior"; o IOF é uma hipótese simplificada, não o valor legal.
    expect(r.hypotheses).toEqual([MULTA_FATURA_HYPOTHESES.interest, MULTA_FATURA_HYPOTHESES.cycle, MULTA_FATURA_HYPOTHESES.fine, MULTA_FATURA_HYPOTHESES.iof]);
    expect(r.hypotheses.join(' ')).not.toMatch(/um pouco maior/);
    expect(MULTA_FATURA_HYPOTHESES.iof).toContain('hipótese simplificada');
    expect(MULTA_FATURA_HYPOTHESES.iof).toContain('Não é o valor legal');
    expect(r.notes).toEqual([MULTA_FATURA_TEXT.rotativo, MULTA_FATURA_TEXT.exact]);
    expect([r.cycleDays, r.beyondCycle, r.aboveConsumerFine]).toEqual([30, false, false]);
    const text = [...r.resultLines, ...r.hypotheses, ...r.notes].join(' ');
    expect(text).not.toMatch(/atras/i);
  });

  it('teto da Lei 14.690/2023: rotativo, mora e multa param no valor não pago (o IOF fica fora do teto)', () => {
    // Rotativo de 99% por 30 dias: 990,00 + 10,00 de mora + 20,00 de multa passam de 1.000,00. A multa fica e os juros são reduzidos na
    // mesma proporção até caber nos 980,00 que sobram: mora = piso(1.000 × 98.000 ÷ 100.000) = 980 centavos; rotativo = 97.020.
    const r = run(fatura({ rotativoPct: '99' }));
    expect(r.capped).toBe(true);
    expect([r.rotativoCents, r.moraCents, r.fineCents]).toEqual([97_020, 980, 2_000]);
    expect(r.rotativoCents! + r.moraCents! + r.fineCents).toBe(100_000);
    expect(r.iofCents).toBe(626);
    expect(r.totalCents).toBe(200_000 + 626);
    expect(r.notes[0]).toBe(MULTA_FATURA_TEXT.cap);
    expect(MULTA_FATURA_TEXT.cap).toContain('Lei 14.690/2023');
    // Bem longe do teto, sem reduzir.
    expect(run(fatura({ dias: '30' })).capped).toBe(false);
  });

  it('só o primeiro ciclo: com mais de 30 dias, a conta para na próxima fatura e diz que não projeta o resto (revisão externa de 18/11/2026)', () => {
    // Antes, 365 dias aplicavam o mesmo rotativo o ano inteiro (R$ 2.033,73). O rotativo só vale até a fatura seguinte.
    const r = run(fatura({ dias: '365' }));
    expect(FATURA_CYCLE_DAYS).toBe(30);
    expect([r.cycleDays, r.beyondCycle, r.dias]).toEqual([30, true, 365]);
    expect([r.rotativoCents, r.moraCents, r.fineCents, r.iofCents, r.totalCents]).toEqual([15_000, 1_000, 2_000, 626, 118_626]);
    expect(r.resultLines[0]).toBe('Com estes números, até a próxima fatura (30 dias depois do vencimento) a fatura fica em R$ 1.186,26.');
    expect(r.notes[0]).toBe(MULTA_FATURA_TEXT.beyondCycle(365));
    expect(r.notes[0]).toBe(
      'Você informou 365 dias. O rotativo só vale até a próxima fatura: depois, o que falta passa para o parcelamento ou outra modalidade, com outra taxa e outros pagamentos, e a conta não projeta esse período. Peça o valor atualizado à instituição.',
    );
    expect(r.resultLines.join(' ')).not.toContain('2.033,73');
    expect(MULTA_FATURA_FIELDS.dias!.hint).toBe('A conta vai até a próxima fatura, 30 dias depois do vencimento.');
  });

  it('IOF da hipótese simplificada: valor × (0,38% + 0,0082% × dias), conferido à mão; multa acima de 2% na fatura tem o aviso do CDC', () => {
    // 1.000,00 × (0,0038 + 0,000082 × 10) = 1.000,00 × 0,00462 = 4,62.
    expect(run(fatura({ dias: '10' })).iofCents).toBe(462);
    // 2.345,67 × (0,0038 + 0,000082 × 30) = 2.345,67 × 0,00626 = 14,684... → 14,68.
    expect(run(fatura({ valor: '2.345,67' })).iofCents).toBe(1_468);
    const fine = run(fatura({ multaPct: '5' }));
    expect(fine.aboveConsumerFine).toBe(true);
    expect(fine.notes).toContain(MULTA_FATURA_TEXT.fine);
    expect(MULTA_FATURA_TEXT.fine).not.toMatch(/atras/i);
    expect(MULTA_FATURA_FIELDS.multaPct!.hint).toBe('Está na fatura. Na fatura do cartão, vai até 2%.');
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
