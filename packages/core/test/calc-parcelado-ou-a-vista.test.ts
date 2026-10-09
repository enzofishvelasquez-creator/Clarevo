import { describe, expect, it } from 'vitest';
import { calcErrorText, calcFields, calcParceladoOuAVista, type ParceladoInput } from '../src';

const base: ParceladoInput = { aVista: '1.080,00', parcelas: '10', parcela: '120,00', primeiraNaCompra: false, formaPagamento: null };
const run = (over: Partial<ParceladoInput> = {}) => {
  const out = calcParceladoOuAVista({ ...base, ...over });
  if (!out.ok) throw new Error(JSON.stringify(out.errors));
  return out.result;
};

describe('1. Parcelado ou à vista? (docs/08 §3.2)', () => {
  it('R$ 1.080,00 à vista ou 10 × R$ 120,00, primeira em 30 dias: R$ 120,00 a mais, 1,96% ao mês (26,27% ao ano)', () => {
    const r = run();
    expect(r.differenceCents).toBe(12_000);
    expect(r.totalCents).toBe(120_000);
    expect(r.resultLines).toEqual([
      'Com estes números, o parcelado custa R$ 120,00 a mais.',
      'Isso equivale a juros de 1,96% ao mês (26,27% ao ano).',
      'Total parcelado: R$ 1.200,00 (10 × R$ 120,00).',
    ]);
    expect(r.hypotheses[0]).toBe('Primeira parcela 1 mês depois da compra e as outras a cada mês.');
    expect(r.financedCents).toBe(108_000);
    expect(r.financedInstallments).toBe(10);
  });

  it('com a primeira na compra: 2,42% ao mês (33,28% ao ano)', () => {
    const r = run({ primeiraNaCompra: true });
    expect(r.financedCents).toBe(96_000);
    expect(r.financedInstallments).toBe(9);
    expect(r.resultLines[1]).toBe('Isso equivale a juros de 2,42% ao mês (33,28% ao ano).');
    expect(r.hypotheses[0]).toBe('Primeira parcela paga na compra e as outras a cada mês.');
  });

  it('total igual ou menor que o preço à vista: sem juros embutidos e sem taxa', () => {
    for (const parcela of ['108,00', '100,00']) {
      const r = run({ parcela });
      expect(r.noInterest).toBe(true);
      expect(r.monthlyRate).toBeNull();
      expect(r.resultLines[0]).toBe('Não há juros embutidos: o total parcelado é igual ou menor que o preço à vista.');
      expect(r.resultLines.join(' ')).not.toContain('%');
    }
  });

  it('primeira parcela na compra que já cobre o preço: diferença sem taxa', () => {
    const r = run({ aVista: '100,00', parcelas: '2', parcela: '100,00', primeiraNaCompra: true });
    expect(r.differenceCents).toBe(10_000);
    expect(r.monthlyRate).toBeNull();
    expect(r.resultLines[1]).toBe('Como a primeira parcela já cobre o preço à vista, não há uma taxa ao mês para mostrar.');
  });

  it('taxa altíssima aparece como "mais de 10.000%"', () => {
    const r = run({ aVista: '1,00', parcelas: '2', parcela: '9.999.999,99' });
    expect(r.resultLines[1]).toContain('mais de 10.000% ao mês');
  });

  it('"Anotar como parcelamento" só fora do cartão; com cartão, o aviso de fatura', () => {
    expect(run().action).toBe('anotar_parcelamento');
    expect(run().noteParams).toEqual({ tipo: 'parcelada', parcelas: 10, valor: 12_000 });
    expect(run({ formaPagamento: 'boleto' }).action).toBe('anotar_parcelamento');
    expect(run({ formaPagamento: 'debito' }).action).toBe('anotar_parcelamento');
    const card = run({ formaPagamento: 'cartao' });
    expect(card.action).toBe('aviso_cartao');
    expect(card.noteParams).toBeNull();
  });

  it('modo cota-unica: frase da cota, 2 a 12 parcelas, sem forma de pagamento nem botão', () => {
    const r = run({ modo: 'cota-unica', aVista: '1.080,00', parcelas: '10', parcela: '120,00', primeiraNaCompra: true, formaPagamento: 'boleto' });
    expect(r.resultLines[0]).toBe('Com estes números, parcelar custa R$ 120,00 a mais que a cota única.');
    expect(r.resultLines[1]).toBe('Isso equivale a juros de 2,42% ao mês (33,28% ao ano).');
    expect(r.hypotheses[0]).toBe('Primeira parcela junto com a cota única e as outras a cada mês.');
    expect(r.action).toBeNull();
    const igual = run({ modo: 'cota-unica', parcela: '108,00' });
    expect(igual.resultLines[0]).toBe('Não há juros embutidos: o total parcelado é igual ou menor que a cota única.');
    const out = calcParceladoOuAVista({ ...base, modo: 'cota-unica', parcelas: '13' });
    expect(out.ok ? null : out.errors).toEqual({ parcelas: 'fora_da_faixa' });
    expect(calcErrorText('parcelado-ou-a-vista', 'parcelas', 'fora_da_faixa', 'cota-unica')).toBe('Use de 2 a 12 parcelas.');
    expect(calcFields('parcelado-ou-a-vista', 'cota-unica').aVista!.label).toBe('Valor da cota única');
    expect(calcFields('parcelado-ou-a-vista', 'cota-unica').primeiraNaCompra!.default).toBe(true);
    expect(calcFields('parcelado-ou-a-vista').primeiraNaCompra!.default).toBe(false);
  });

  it('erros por campo, com as mensagens', () => {
    const out = calcParceladoOuAVista({ ...base, aVista: '', parcelas: '1', parcela: 'abc' });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.errors).toEqual({ aVista: 'vazio', parcelas: 'fora_da_faixa', parcela: 'invalido' });
    expect(calcErrorText('parcelado-ou-a-vista', 'aVista', 'vazio')).toBe('Digite o preço à vista, como 1.080,00.');
    expect(calcErrorText('parcelado-ou-a-vista', 'parcelas', 'fora_da_faixa')).toBe('Use de 2 a 480 parcelas.');
    expect(calcErrorText('parcelado-ou-a-vista', 'parcela', 'invalido')).toBe('Confira o valor, como 120,00.');
    const zero = calcParceladoOuAVista({ ...base, parcela: '0,00', parcelas: '481' });
    expect(zero.ok ? null : zero.errors).toEqual({ parcela: 'zero', parcelas: 'fora_da_faixa' });
    const big = calcParceladoOuAVista({ ...base, aVista: '10.000.000,00' });
    expect(big.ok ? null : big.errors).toEqual({ aVista: 'acima_do_limite' });
  });

  it('480 parcelas no limite do valor', () => {
    const r = run({ aVista: '9.999.999,99', parcelas: '480', parcela: '9.999.999,99' });
    expect(r.totalCents).toBe(999_999_999 * 480);
    expect(r.resultLines[1]).toContain('mais de 10.000%');
  });
});
