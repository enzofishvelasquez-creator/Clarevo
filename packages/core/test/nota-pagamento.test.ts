import { describe, expect, it } from 'vitest';
import {
  NOTA_PAYMENT_TEXT,
  PAYMENT_FORMS,
  PAYMENT_FORM_LABEL,
  paymentChoiceFor,
  paymentFormFromCode,
  paymentFormsFromText,
  paymentSummary,
  uniquePaymentForms,
  type PaymentForm,
} from '../src';

describe('forma de pagamento da nota (D-042)', () => {
  it('códigos tPag conhecidos e desconhecidos', () => {
    expect(paymentFormFromCode('01')).toBe('dinheiro');
    expect(paymentFormFromCode('03')).toBe('credito');
    expect(paymentFormFromCode('04')).toBe('debito');
    expect(paymentFormFromCode('17')).toBe('pix');
    expect(paymentFormFromCode('20')).toBe('pix');
    for (const c of ['10', '11', '12', '13']) expect(paymentFormFromCode(c)).toBe('vale');
    for (const c of ['02', '05', '14', '15', '16', '18', '19', '99']) expect(paymentFormFromCode(c)).toBe('outros');
    expect(paymentFormFromCode('90')).toBeNull();
    expect(paymentFormFromCode('55')).toBeNull();
    expect(paymentFormFromCode('')).toBeNull();
  });

  it('texto sem o rótulo "Forma de pagamento" não é lido', () => {
    expect(paymentFormsFromText('Cartão de Crédito 87,40')).toEqual([]);
    expect(paymentFormsFromText('')).toEqual([]);
    expect(paymentFormsFromText(undefined as unknown as string)).toEqual([]);
  });

  it('o trecho para em "Troco", nas informações gerais e no consumidor', () => {
    expect(paymentFormsFromText('Forma de pagamento:\nValor pago R$\nDinheiro\n100,00\nTroco R$\n12,60\nPix')).toEqual(['dinheiro']);
    expect(paymentFormsFromText('Forma de pagamento\nInformações gerais da Nota\nPix')).toEqual([]);
    expect(paymentFormsFromText('Forma de pagamento\nConsumidor\nNome: PIX COMERCIO')).toEqual([]);
  });

  it('"Crédito Loja" e "Crédito Virtual" não são cartão de crédito', () => {
    expect(paymentFormsFromText('Forma de pagamento\nCrédito Loja\n10,00')).toEqual(['outros']);
    expect(paymentFormsFromText('Forma de pagamento\nCrédito Virtual\n10,00')).toEqual(['outros']);
    expect(paymentFormsFromText('Forma de pagamento\nCrédito\n10,00')).toEqual(['credito']);
  });

  it('sem repetição e na ordem em que aparecem', () => {
    expect(paymentFormsFromText('Forma de pagamento\nPix\n10,00\nCartão de Débito\n5,00\nPix\n1,00')).toEqual(['pix', 'debito']);
    expect(uniquePaymentForms(['pix', 'pix', 'dinheiro'])).toEqual(['pix', 'dinheiro']);
    expect(uniquePaymentForms(undefined)).toEqual([]);
    expect(uniquePaymentForms(['nada' as PaymentForm])).toEqual([]);
  });

  it('pré-seleção de "Como você pagou?": crédito vira cartão; dinheiro, débito, Pix e vale viram "Dinheiro, débito ou Pix"', () => {
    expect(paymentChoiceFor(['credito'])).toBe('cartao');
    for (const f of ['dinheiro', 'debito', 'pix', 'vale'] as const) expect(paymentChoiceFor([f]), f).toBe('dinheiro');
  });

  it('mais de uma forma, outra forma ou nenhuma: a nota não escolhe', () => {
    expect(paymentChoiceFor(['dinheiro', 'credito'])).toBeNull();
    expect(paymentChoiceFor(['pix', 'debito'])).toBeNull();
    expect(paymentChoiceFor(['outros'])).toBeNull();
    expect(paymentChoiceFor([])).toBeNull();
  });

  it('resumo para o bloco "Nota lida"', () => {
    expect(paymentSummary([])).toBeNull();
    expect(paymentSummary(['pix'])).toBe('Pix');
    expect(paymentSummary(['credito'])).toBe('Cartão de crédito');
    expect(paymentSummary(['dinheiro', 'pix'])).toBe('Pagamento em mais de uma forma');
    expect(NOTA_PAYMENT_TEXT.multiple).toBe('Pagamento em mais de uma forma');
  });

  it('todas as formas têm rótulo', () => {
    for (const f of PAYMENT_FORMS) expect(PAYMENT_FORM_LABEL[f].length).toBeGreaterThan(2);
  });

  it('a mensagem de crédito sem cartão é a pedida por Enzo', () => {
    expect(NOTA_PAYMENT_TEXT.creditNoCard).toBe('A nota diz cartão de crédito. Cadastre o cartão para anotar a compra na fatura.');
  });
});
