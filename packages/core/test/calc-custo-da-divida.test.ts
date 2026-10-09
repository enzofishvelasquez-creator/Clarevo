import { describe, expect, it } from 'vitest';
import { DIVIDA_TEXT, calcCustoDaDivida, calcErrorText, type DividaInput } from '../src';

const run = (input: DividaInput) => {
  const out = calcCustoDaDivida(input);
  if (!out.ok) throw new Error(JSON.stringify(out.errors));
  return out.result;
};

describe('2. Quanto custa uma dívida? (docs/08 §3.2)', () => {
  it('cheque especial: R$ 1.000,00 a 8% ao mês por 3 meses = R$ 1.259,71, com R$ 259,71 de juros (151,82% ao ano)', () => {
    const r = run({ tipo: 'cheque_especial', valor: '1.000,00', taxaMes: '8', meses: '3' });
    expect([r.totalCents, r.interestCents, r.annualBp]).toEqual([125_971, 25_971, 15_182]);
    expect(r.resultLines).toEqual([
      'Com estes números, a dívida vai a R$ 1.259,71 em 3 meses.',
      'Juros: R$ 259,71',
      'Isso equivale a 151,82% ao ano.',
    ]);
    expect(r.notes).toEqual([]);
    expect(r.aboveCap).toBe(false);
  });

  it('cheque especial acima de 8% ao mês: aviso do teto', () => {
    const r = run({ tipo: 'cheque_especial', valor: '500,00', taxaMes: '8,01', meses: '1' });
    expect(r.aboveCap).toBe(true);
    expect(r.notes).toEqual([DIVIDA_TEXT.chequeCapNote]);
    expect(r.notes[0]).toBe(
      'A taxa informada passa do teto de 8% ao mês do cheque especial (Res. CMN 4.765/2019). Confira o extrato.',
    );
    expect(r.resultLines[0]).toBe('Com estes números, a dívida vai a R$ 540,05 em 1 mês.');
  });

  it('rotativo de R$ 700,00 a 14%: R$ 98,00 de juros no mês, R$ 798,00 na fatura seguinte', () => {
    const r = run({ tipo: 'rotativo', valor: '700,00', taxaMes: '14' });
    expect([r.interestCents, r.totalCents]).toEqual([9_800, 79_800]);
    expect(r.resultLines[0]).toBe('Com estes números, os juros do rotativo somam R$ 98,00 em 1 mês.');
    expect(r.resultLines[1]).toBe('O valor vai para R$ 798,00 na fatura seguinte.');
    expect(r.resultLines[2]).toBe('Isso equivale a 381,79% ao ano.');
    expect(r.parcelamento).toBeNull();
  });

  it('parcelar em 24 × R$ 75,79 a 8% somaria R$ 1.818,96; o limite deixa o total em R$ 1.400,00', () => {
    const r = run({ tipo: 'rotativo', valor: '700,00', taxaMes: '14', parcelarTaxaMes: '8', parcelarParcelas: '24' });
    const p = r.parcelamento;
    if (!p || !p.ok) throw new Error('sem parcelamento');
    expect([p.result.installmentCents, p.result.totalCents, p.result.cappedTotalCents]).toEqual([7_579, 181_896, 140_000]);
    expect(p.result.limited).toBe(true);
    expect(p.result.resultLines).toEqual([
      'Parcelar em 24 × R$ 75,79 a 8% ao mês somaria R$ 1.818,96.',
      'Pelo limite da Lei 14.690/2023, juros e encargos não passam do valor original: o total fica em no máximo R$ 1.400,00.',
    ]);
  });

  it('em 12 × R$ 105,89 o total é R$ 1.270,68, dentro do limite', () => {
    const r = run({ tipo: 'rotativo', valor: '700,00', taxaMes: '14', parcelarTaxaMes: '8', parcelarParcelas: '12' });
    const p = r.parcelamento;
    if (!p || !p.ok) throw new Error('sem parcelamento');
    expect([p.result.installmentCents, p.result.totalCents, p.result.chargesCents]).toEqual([10_589, 127_068, 57_068]);
    expect(p.result.limited).toBe(false);
    expect(p.result.cappedTotalCents).toBe(127_068);
    expect(p.result.resultLines[0]).toBe('Parcelar em 12 × R$ 105,89 a 8% ao mês soma R$ 1.270,68.');
  });

  it('parcelar com um campo só: o resultado do rotativo continua e o parcelamento traz o erro', () => {
    const r = run({ tipo: 'rotativo', valor: '700,00', taxaMes: '14', parcelarTaxaMes: '8', parcelarParcelas: '' });
    expect(r.parcelamento).toEqual({ ok: false, errors: { parcelarParcelas: 'vazio' } });
    const r2 = run({ tipo: 'rotativo', valor: '700,00', taxaMes: '14', parcelarTaxaMes: '', parcelarParcelas: '25' });
    expect(r2.parcelamento).toEqual({ ok: false, errors: { parcelarTaxaMes: 'vazio', parcelarParcelas: 'fora_da_faixa' } });
    expect(calcErrorText('custo-da-divida', 'parcelarParcelas', 'fora_da_faixa')).toBe('Use de 1 a 24 parcelas.');
  });

  it('empréstimo de R$ 5.000,00 a 2% em 12 vezes: R$ 472,80 por mês, R$ 5.673,60 no total, com o lembrete do CET', () => {
    const r = run({ tipo: 'emprestimo', valor: '5.000,00', taxaMes: '2', parcelas: '12' });
    expect([r.installmentCents, r.totalCents, r.interestCents]).toEqual([47_280, 567_360, 67_360]);
    expect(r.resultLines).toEqual([
      'Com estes números, são 12 parcelas de R$ 472,80.',
      'Total: R$ 5.673,60, com R$ 673,60 de juros.',
      'Isso equivale a 26,82% ao ano.',
    ]);
    expect(r.notes).toEqual([DIVIDA_TEXT.cetNote]);
    expect(run({ tipo: 'emprestimo', valor: '5.000,00', taxaMes: '2', parcelas: '1' }).resultLines[0]).toBe(
      'Com estes números, é 1 parcela de R$ 5.100,00.',
    );
  });

  it('faixas: taxa de 0,01% a 99,99%, meses de 1 a 24, parcelas de 1 a 120; só o campo do tipo é pedido', () => {
    const e = (input: DividaInput) => {
      const out = calcCustoDaDivida(input);
      return out.ok ? null : out.errors;
    };
    expect(e({ tipo: null, valor: '', taxaMes: '' })).toEqual({ tipo: 'vazio', valor: 'vazio', taxaMes: 'vazio' });
    expect(e({ tipo: 'rotativo', valor: '10', taxaMes: '0' })).toEqual({ taxaMes: 'fora_da_faixa' });
    expect(e({ tipo: 'rotativo', valor: '10', taxaMes: '100' })).toEqual({ taxaMes: 'fora_da_faixa' });
    expect(e({ tipo: 'rotativo', valor: '10', taxaMes: '1,965' })).toEqual({ taxaMes: 'casas_demais' });
    expect(e({ tipo: 'cheque_especial', valor: '10', taxaMes: '2', meses: '25' })).toEqual({ meses: 'fora_da_faixa' });
    expect(e({ tipo: 'emprestimo', valor: '10', taxaMes: '2', parcelas: '121' })).toEqual({ parcelas: 'fora_da_faixa' });
    expect(e({ tipo: 'emprestimo', valor: '10', taxaMes: '2', meses: 'x', parcelas: '12' })).toBeNull();
    expect(calcErrorText('custo-da-divida', 'taxaMes', 'vazio')).toBe('Digite a taxa ao mês, como 2,5.');
    expect(calcErrorText('custo-da-divida', 'taxaMes', 'fora_da_faixa')).toBe('Use uma taxa de 0,01% a 99,99% ao mês.');
    expect(calcErrorText('custo-da-divida', 'tipo', 'vazio')).toBe('Escolha o tipo de dívida.');
  });

  it('valor e prazo extremos no cheque especial: resultado_alto em vez de número errado', () => {
    const out = calcCustoDaDivida({ tipo: 'cheque_especial', valor: '9.999.999,99', taxaMes: '99,99', meses: '24' });
    expect(out.ok ? null : out.errors).toEqual({ meses: 'resultado_alto' });
    expect(calcErrorText('custo-da-divida', 'meses', 'resultado_alto')).toContain('passa do que a calculadora mostra');
    // Logo abaixo do limite, calcula normalmente.
    expect(calcCustoDaDivida({ tipo: 'cheque_especial', valor: '9.999.999,99', taxaMes: '99,99', meses: '20' }).ok).toBe(true);
  });
});
