import { describe, expect, it } from 'vitest';
import { statementFromPdfItems, type PdfTextItem } from '../src';

/** Extrato e fatura em PDF (D-078 A): leitura genérica por posição. Tudo fictício. */
const TODAY = '2026-10-31';
const item = (str: string, x: number, y: number, page = 1): PdfTextItem => ({ str, x, y, width: str.length * 5, page });
/** Uma linha da página: os pedaços em colunas (data, descrição, valor, saldo). */
const row = (y: number, cols: [string, number][], page = 1) => cols.map(([s, x]) => item(s, x, y, page));

describe('extrato da conta em PDF', () => {
  const ITEMS = [
    ...row(800, [['Extrato de conta corrente', 40]]),
    ...row(780, [['Período: 01/10/2026 a 31/10/2026', 40]]),
    ...row(760, [['Data', 40], ['Lançamento', 100], ['Valor (R$)', 380], ['Saldo (R$)', 470]]),
    ...row(740, [['30/09', 40], ['SALDO ANTERIOR', 100], ['1.000,00', 470]]),
    ...row(720, [['01/10', 40], ['PIX ENVIADO MARIA EXEMPLO', 100], ['-85,00', 380], ['915,00', 470]]),
    // Mesmo dia, sem a data repetida.
    ...row(708, [['PAG BOLETO LUZ EXEMPLO', 100], ['-180,40', 380], ['734,60', 470]]),
    ...row(690, [['05/10', 40], ['SALARIO EMPRESA EXEMPLO', 100], ['5.000,00', 380], ['5.734,60', 470]]),
    ...row(670, [['06/10', 40], ['TARIFA PACOTE', 100], ['30,00 D', 380]]),
    ...row(650, [['07/10', 40], ['ESTORNO COMPRA', 100], ['12,00 C', 380]]),
    ...row(630, [['SALDO DO DIA', 100], ['5.700,00', 470]]),
    ...row(100, [['Total de saídas', 100], ['295,40', 380]]),
  ];

  it('lançamentos com data, descrição, valor e sinal; saldo, total e cabeçalho ficam de fora', () => {
    const r = statementFromPdfItems(ITEMS, TODAY)!;
    expect(r.source).toBe('pdf');
    expect(r.statement).toBe('conta');
    expect(r.cardPositive).toBe(false);
    expect(r.balanceIgnored).toBe(true);
    expect(r.lines.map((l) => [l.date, l.description, l.amountCents])).toEqual([
      ['2026-10-01', 'PIX ENVIADO MARIA EXEMPLO', -8_500],
      ['2026-10-01', 'PAG BOLETO LUZ EXEMPLO', -18_040],
      ['2026-10-05', 'SALARIO EMPRESA EXEMPLO', 500_000],
      ['2026-10-06', 'TARIFA PACOTE', -3_000],
      ['2026-10-07', 'ESTORNO COMPRA', 1_200],
    ]);
  });

  it('sem marca de sinal, as palavras da descrição decidem (recebido entra, o resto sai)', () => {
    const items = [
      ...row(700, [['02/10/2026', 40], ['PIX RECEBIDO JOAO EXEMPLO', 120], ['200,00', 380]]),
      ...row(680, [['03/10/2026', 40], ['MERCADO EXEMPLO', 120], ['54,90', 380]]),
    ];
    expect(statementFromPdfItems(items, TODAY)!.lines.map((l) => l.amountCents)).toEqual([20_000, -5_490]);
  });

  it('data sem ano no futuro volta um ano (extrato de dezembro lido em janeiro)', () => {
    const items = [...row(700, [['20/12', 40], ['MERCADO EXEMPLO', 120], ['-54,90', 380]])];
    expect(statementFromPdfItems(items, '2027-01-10')!.lines[0]!.date).toBe('2026-12-20');
  });

  it('PDF sem lançamentos (só texto ou só saldo): null', () => {
    expect(statementFromPdfItems([...row(700, [['Informe de rendimentos', 40]]), ...row(680, [['30/09', 40], ['SALDO ANTERIOR', 100], ['1.000,00', 470]])], TODAY)).toBeNull();
    expect(statementFromPdfItems([], TODAY)).toBeNull();
  });
});

describe('fatura de cartão em PDF', () => {
  it('compras sem sinal ficam positivas para a revisão inverter no destino cartão', () => {
    const items = [
      ...row(800, [['Fatura do cartão', 40]]),
      ...row(700, [['12/09', 40], ['LOJA EXEMPLO PARC 02/05', 120], ['150,00', 400]]),
      ...row(680, [['15/09', 40], ['STREAMING EXEMPLO', 120], ['39,90', 400]]),
    ];
    const r = statementFromPdfItems(items, TODAY)!;
    expect(r.statement).toBe('cartao');
    expect(r.cardPositive).toBe(true);
    expect(r.lines.map((l) => [l.description, l.amountCents])).toEqual([
      ['LOJA EXEMPLO PARC 02/05', 15_000],
      ['STREAMING EXEMPLO', 3_990],
    ]);
  });
});
