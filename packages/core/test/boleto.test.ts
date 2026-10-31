import { describe, expect, it } from 'vitest';
import { BOLETO_TEXT, boletoDueDate, boletoFromText, boletoGaps, looksLikeBoleto, readBoleto } from '../src';

/**
 * Boleto de conta (D-078 G). Todos os números são inventados, com os dígitos verificadores certos: um boleto bancário de R$ 1.234,56
 * com vencimento em 10/11/2026 e uma conta de consumo de R$ 189,90.
 */
const TODAY = '2026-10-31';
const BANK_BARCODE = '23794162600001234561234567890123456789012345';
const BANK_LINE = '23791234546789012345767890123457416260000123456';
const BANK_LINE_FORMATTED = '23791.23454 67890.123457 67890.123457 4 16260000123456';
const BANK_LINE_NO_DUE = '23799876504321098765743210987657800000000000000';
const COLLECTION_BARCODE = '83640000001899000010012345678901234567890123';
const COLLECTION_LINE_FORMATTED = '83640000001-1 89900001001-2 23456789012-9 34567890123-1';

describe('boleto: valor e vencimento pelo código', () => {
  it('os números de teste são boletos válidos', () => {
    for (const code of [BANK_BARCODE, BANK_LINE, BANK_LINE_FORMATTED, BANK_LINE_NO_DUE, COLLECTION_BARCODE, COLLECTION_LINE_FORMATTED]) {
      expect(looksLikeBoleto(code), code).toBe(true);
    }
  });

  it('boleto bancário: valor e vencimento iguais pela linha digitável (com ou sem pontos) e pelo código de barras', () => {
    const expected = { kind: 'bancario', amountCents: 123_456, dueOn: '2026-11-10', description: null };
    expect(readBoleto(BANK_LINE_FORMATTED, TODAY)).toEqual(expected);
    expect(readBoleto(BANK_LINE, TODAY)).toEqual(expected);
    expect(readBoleto(BANK_BARCODE, TODAY)).toEqual(expected);
  });

  it('fator de vencimento: antes e depois do recomeço de 22/02/2025, vale a data mais perto de hoje', () => {
    expect(boletoDueDate(1000, '2000-07-01')).toBe('2000-07-03');
    expect(boletoDueDate(9999, '2025-02-01')).toBe('2025-02-21');
    expect(boletoDueDate(1000, '2025-03-01')).toBe('2025-02-22');
    expect(boletoDueDate(1626, TODAY)).toBe('2026-11-10');
    expect(boletoDueDate(0, TODAY)).toBeNull();
  });

  it('fator zero e valor zero: sem vencimento e sem valor (a pessoa digita), com os avisos', () => {
    const r = readBoleto(BANK_LINE_NO_DUE, TODAY);
    expect(r).toEqual({ kind: 'bancario', amountCents: null, dueOn: null, description: null });
    expect(boletoGaps(r!, TODAY)).toEqual([BOLETO_TEXT.noAmount, BOLETO_TEXT.noDue]);
  });

  it('conta de consumo (48 dígitos, começa por 8): o valor em reais, sem vencimento no código', () => {
    const expected = { kind: 'arrecadacao', amountCents: 18_990, dueOn: null, description: null };
    expect(readBoleto(COLLECTION_LINE_FORMATTED, TODAY)).toEqual(expected);
    expect(readBoleto(COLLECTION_BARCODE, TODAY)).toEqual(expected);
    expect(boletoGaps(expected as never, TODAY)).toEqual([BOLETO_TEXT.noDueCollection]);
  });

  it('número qualquer, dígito trocado ou chave de nota fiscal: não é boleto', () => {
    expect(readBoleto('12345678901234567890123456789012345678901234567', TODAY)).toBeNull();
    expect(readBoleto(BANK_LINE.slice(0, 46) + '7', TODAY)).toBeNull();
    expect(readBoleto('33261012345678000199650010000123451123456785', TODAY)).toBeNull();
    expect(readBoleto('', TODAY)).toBeNull();
  });

  it('vencimento que já passou: avisa para conferir', () => {
    const r = readBoleto(BANK_LINE, '2026-11-20')!;
    expect(boletoGaps(r, '2026-11-20')).toEqual([BOLETO_TEXT.pastDue]);
  });
});

describe('boleto: PDF (texto) com a linha digitável e o beneficiário', () => {
  const PDF_TEXT = [
    'Banco Exemplo | 237-2 | ' + BANK_LINE_FORMATTED,
    'Local de pagamento Pagável em qualquer banco',
    'Beneficiário',
    'SEGUROS EXEMPLO S.A. CNPJ 12.345.678/0001-90',
    'Vencimento 10/11/2026',
    'Valor do documento 1.234,56',
    'Pagador ALEX EXEMPLO CPF 123.456.789-09',
  ].join('\n');

  it('acha a linha no meio do texto e o nome de quem recebe, sem documento', () => {
    expect(boletoFromText(PDF_TEXT, TODAY)).toEqual({ kind: 'bancario', amountCents: 123_456, dueOn: '2026-11-10', description: 'Seguros Exemplo S.A.' });
  });

  it('a linha colada a outros números na mesma linha também é achada', () => {
    const r = boletoFromText('Recibo do pagador 237-2 ' + BANK_LINE + ' 0001', TODAY);
    expect(r?.amountCents).toBe(123_456);
  });

  it('nada de pagador nem CPF no resultado; sem linha digitável, null', () => {
    const out = JSON.stringify(boletoFromText(PDF_TEXT, TODAY));
    for (const secret of ['ALEX', '123.456.789', '12.345.678', '0001-90']) expect(out).not.toContain(secret);
    expect(boletoFromText('Boleto sem código\nVencimento 10/11/2026\nValor 100,00', TODAY)).toBeNull();
  });

  it('linha de resumo: "Boleto lido: Seguros Exemplo S.A. · R$ 1.234,56 · vence em 10/11/2026"', () => {
    expect(BOLETO_TEXT.readLine(boletoFromText(PDF_TEXT, TODAY)!)).toBe('Boleto lido: Seguros Exemplo S.A. · R$ 1.234,56 · vence em 10/11/2026');
    expect(BOLETO_TEXT.readLine({ amountCents: null, dueOn: null, description: null })).toBe('Boleto lido: sem valor nem vencimento');
  });
});
