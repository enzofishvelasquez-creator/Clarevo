import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  ANTES_ESTIMATE_TEXT,
  ANTES_EXTRA_ENTRY_PERCENTS,
  ANTES_FIELDS,
  ANTES_TEXT,
  CALC_ERROR_TEXT,
  CALC_UI_TEXT,
  calcAntesDeFinanciar,
  calcErrorText,
  calcFields,
  calcLinkParams,
  calcPrefill,
  calculatorBySlug,
  centsToInput,
  finalValueCents,
  financePaymentCents,
  isCalcSlug,
  MAX_RECORD_CENTS,
  type AntesInput,
  type CalcErrorCode,
} from '../src';

const base: AntesInput = { preco: '1.200,00', entrada: '200,00', parcelas: '12', taxaMes: '1' };
const run = (over: Partial<AntesInput> = {}, today?: string) => {
  const out = calcAntesDeFinanciar({ ...base, ...over }, today);
  if (!out.ok) throw new Error(JSON.stringify(out.errors));
  return out.result;
};
const errorsOf = (over: Partial<AntesInput>) => {
  const out = calcAntesDeFinanciar({ ...base, ...over });
  if (out.ok) throw new Error('esperava erro');
  return out.errors;
};

describe('10. Antes de financiar (D-044)', () => {
  it('está no catálogo, em "Decidir uma compra", e o endereço existe', () => {
    expect(isCalcSlug('antes-de-financiar')).toBe(true);
    const info = calculatorBySlug('antes-de-financiar')!;
    expect(info.title).toBe('Antes de financiar');
    expect(info.group).toBe('compra');
    expect(calcFields('antes-de-financiar')).toBe(ANTES_FIELDS);
  });

  it('R$ 1.000,00 financiado em 12 × a 1% ao mês: parcela de R$ 88,85, juros de R$ 66,20 (conta de mão)', () => {
    // 1000 × 0,01 × 1,01^12 ÷ (1,01^12 − 1) = 10 × 1,126825 ÷ 0,126825 = 88,8488 → 88,85; 12 × 88,85 = 1.066,20.
    const r = run();
    expect(r.financedCents).toBe(100_000);
    expect(r.parcelaCents).toBe(8_885);
    expect(r.totalCents).toBe(126_620);
    expect(r.interestCents).toBe(6_620);
    expect(r.noInterest).toBe(false);
    expect(r.resultLines).toEqual([
      'Com estes números, são 12 parcelas de R$ 88,85.',
      'Você paga por 12 meses (1 ano).',
      'Total pago: R$ 1.266,20 (entrada de R$ 200,00 mais 12 × R$ 88,85).',
      'Juros: R$ 66,20.',
    ]);
    expect(r.notes).toEqual([ANTES_ESTIMATE_TEXT]);
    expect(ANTES_ESTIMATE_TEXT).toBe('Estimativa. As condições oficiais são as da proposta; peça o CET.');
    expect(r.hypotheses[0]).toBe('Parcelas iguais (tabela Price), a primeira 1 mês depois da compra.');
  });

  it('com a data de hoje, diz até quando: primeira em novembro de 2026, 12 parcelas, a última em outubro de 2027', () => {
    const r = run({}, '2026-10-07');
    expect(r.lastMonth).toBe('2027-10');
    expect(r.resultLines[1]).toBe('Você paga por 12 meses (1 ano), até outubro de 2027.');
    const due = run({ primeiraEmUmMes: false }, '2026-10-07');
    expect(due.lastMonth).toBe('2027-09');
    expect(due.resultLines[1]).toBe('Você paga por 12 meses (1 ano), a primeira na compra, até setembro de 2027.');
  });

  it('primeira parcela paga na compra: R$ 87,97 (1.000,00 ÷ (1 + soma dos 11 fatores) = 87,9691)', () => {
    const r = run({ primeiraEmUmMes: false });
    expect(r.parcelaCents).toBe(8_797);
    expect(r.totalCents).toBe(20_000 + 12 * 8_797);
    expect(r.interestCents).toBe(20_000 + 12 * 8_797 - 120_000);
    expect(r.hypotheses[0]).toBe('Parcelas iguais (tabela Price), a primeira paga na compra e as outras a cada mês.');
    // A parcela única paga na compra é o próprio valor financiado, sem juros.
    const single = run({ parcelas: '1', primeiraEmUmMes: false });
    expect(single.parcelaCents).toBe(100_000);
    expect(single.noInterest).toBe(true);
    expect(single.resultLines[1]).toBe('Você paga tudo na compra.');
    expect(single.noteParams).toBeNull();
  });

  it('1 parcela paga na compra: sem as linhas de impacto na renda nem do comprometido (e sem a referência de 30%)', () => {
    const single = run({ parcelas: '1', primeiraEmUmMes: false, renda: '4.000,00', comprometidoCents: 100_000 });
    expect(single.resultLines).toEqual([
      'Com estes números, é 1 parcela de R$ 1.000,00.',
      'Você paga tudo na compra.',
      'Total pago: R$ 1.200,00 (entrada de R$ 200,00 mais 1 × R$ 1.000,00).',
      'Sem juros: o total pago é igual ou menor que o preço à vista.',
    ]);
    expect(single.parcelaPermille).toBeNull();
    expect(single.committedBeforePermille).toBeNull();
    expect(single.committedAfterPermille).toBeNull();
    expect(single.notes).toEqual([ANTES_ESTIMATE_TEXT]);
    expect(single.hypotheses.some((h) => h.includes('renda líquida') || h.includes('comprometido é o do mês'))).toBe(false);
    expect(run({ parcelas: '1', primeiraEmUmMes: false, comprometidoCents: 100_000 }).resultLines).toHaveLength(4);
    // Uma parcela daqui a 1 mês ainda é um compromisso do mês seguinte: as linhas ficam.
    expect(run({ parcelas: '1', renda: '4.000,00', comprometidoCents: 100_000 }).resultLines).toHaveLength(6);
  });

  it('1 parcela daqui a 1 mês: o valor financiado mais 1 mês de juros', () => {
    const r = run({ parcelas: '1', taxaMes: '2' });
    expect(r.parcelaCents).toBe(102_000);
    expect(r.resultLines[0]).toBe('Com estes números, é 1 parcela de R$ 1.020,00.');
    expect(r.resultLines[1]).toBe('Você paga por 1 mês.');
    expect(r.interestCents).toBe(2_000);
  });

  it('taxa zero: parcela é o valor financiado dividido pelas parcelas, a última absorve o arredondamento e nunca há juros', () => {
    // 100.000 ÷ 12 = 8.333,33 → 8.333; 11 × 8.333 = 91.663 e a última, 8.337, fecha o preço.
    const r = run({ preco: '1.000,00', entrada: '', taxaMes: '0' });
    expect(r.parcelaCents).toBe(8_333);
    expect(r.lastParcelaCents).toBe(8_337);
    expect(r.totalCents).toBe(100_000);
    expect(r.noInterest).toBe(true);
    expect(r.interestCents).toBe(0);
    expect(r.resultLines[2]).toBe('Total pago: R$ 1.000,00 (11 × R$ 83,33 e uma última de R$ 83,37).');
    expect(r.resultLines[3]).toBe('Sem juros: o total pago é igual ou menor que o preço à vista.');
    expect(r.hypotheses[1]).toBe(
      'Sem juros informados: a parcela é o valor financiado dividido pelas parcelas, no centavo, e a última (R$ 83,37) absorve a diferença do arredondamento.',
    );
    expect(r.savingLines[1]).toMatch(/^Financiando: você usa o bem agora e não paga juros ao longo de 12 meses\./);
    // Divisão exata: sem última diferente, o texto de sempre.
    const exact = run({ preco: '1.200,00', entrada: '', taxaMes: '0' });
    expect(exact.lastParcelaCents).toBe(exact.parcelaCents);
    expect(exact.resultLines[2]).toBe('Total pago: R$ 1.200,00 (12 × R$ 100,00).');
    expect(exact.hypotheses[1]).toBe('Sem juros informados: a parcela é o valor financiado dividido pelas parcelas, no centavo.');
  });

  it('taxa zero com a parcela arredondada para cima: a última fica menor e o juros continua zero (R$ 1,00 em 6 vezes)', () => {
    // 100 ÷ 6 = 16,67 → 17; 5 × 17 = 85 e a última, 15. Antes, 6 × 17 = 102 mostrava R$ 0,02 de juros.
    const r = run({ preco: '1,00', entrada: '', parcelas: '6', taxaMes: '0' });
    expect([r.parcelaCents, r.lastParcelaCents, r.totalCents, r.interestCents, r.noInterest]).toEqual([17, 15, 100, 0, true]);
    expect(r.resultLines[2]).toBe('Total pago: R$ 1,00 (5 × R$ 0,17 e uma última de R$ 0,15).');
    expect(r.resultLines[3]).toBe('Sem juros: o total pago é igual ou menor que o preço à vista.');
    // Com a primeira na compra e entrada, o mesmo.
    const due = run({ preco: '1,00', entrada: '0,10', parcelas: '6', taxaMes: '0', primeiraEmUmMes: false });
    expect(due.totalCents).toBe(100);
    expect(due.interestCents).toBe(0);
    // Menos centavos que parcelas: cada parcela tem 1 centavo, sem juros mesmo assim.
    const tiny = run({ preco: '0,05', entrada: '', parcelas: '10', taxaMes: '0' });
    expect([tiny.parcelaCents, tiny.lastParcelaCents, tiny.interestCents, tiny.noInterest]).toEqual([1, 1, 0, true]);
  });

  it('entrada igual ao preço: não há o que financiar', () => {
    const r = run({ entrada: '1.200,00' });
    expect(r.nothingToFinance).toBe(true);
    expect(r.resultLines).toEqual(['Com a entrada igual ao preço à vista, não há o que financiar.', 'Você paga R$ 1.200,00 na compra, sem juros.']);
    expect(r.noteParams).toBeNull();
    expect(r.goalParams).toBeNull();
    expect(r.savingLines).toEqual([]);
    expect(r.entryLines).toEqual([]);
  });

  describe('impacto na renda', () => {
    it('parcela ÷ renda com uma casa e o comprometido do mês de X% para Y%', () => {
      // 8.885 ÷ 400.000 = 2,2%; comprometido 100.000 → 25,0%; com a parcela, 108.885 → 27,2%.
      const r = run({ renda: '4.000,00', comprometidoCents: 100_000 });
      expect(r.parcelaPermille).toBe(22);
      expect(r.committedBeforePermille).toBe(250);
      expect(r.committedAfterPermille).toBe(272);
      expect(r.resultLines.slice(4)).toEqual([
        'A parcela seria 2,2% da sua renda.',
        'Seu comprometido iria de 25,0% para 27,2% enquanto durar o financiamento.',
      ]);
      // A referência de 30% é só referência, com a fonte, como na tela da renda.
      expect(r.notes).toHaveLength(2);
      expect(r.notes[1]).toContain('Referência usada pela Serasa: até 30% da renda líquida com parcelas de dívidas.');
      expect(r.notes[1]).toContain('Fonte: Serasa, página sobre comprometimento de renda, consultada em 09/10/2026.');
      expect(r.hypotheses).toContain('O comprometido é o do mês atual, com as contas a pagar já criadas; os meses seguintes podem ser diferentes.');
    });

    it('acima de 100% mostra o valor real; parcela pequena mostra "menos de 0,1%"', () => {
      const high = run({ renda: '1.000,00', comprometidoCents: 90_000, preco: '10.000,00', entrada: '', parcelas: '10', taxaMes: '3' });
      expect(high.resultLines[4]).toMatch(/^A parcela seria \d{2,3},\d% da sua renda\.$/);
      expect(high.resultLines[5]).toMatch(/para \d{3},\d% enquanto durar/);
      const tiny = run({ preco: '10,00', entrada: '', parcelas: '10', taxaMes: '0', renda: '9.999.999,99' });
      expect(tiny.resultLines[4]).toBe('A parcela seria menos de 0,1% da sua renda.');
    });

    it('sem renda e com o comprometido: só valores em reais; sem nenhum dos dois, nenhuma linha de impacto', () => {
      const r = run({ comprometidoCents: 100_000 });
      expect(r.parcelaPermille).toBeNull();
      expect(r.resultLines[4]).toBe('Seu comprometido do mês iria de R$ 1.000,00 para R$ 1.088,85 enquanto durar o financiamento.');
      expect(r.notes).toEqual([ANTES_ESTIMATE_TEXT]);
      const none = run();
      expect(none.resultLines).toHaveLength(4);
      // Sem nada comprometido e sem renda, "de R$ 0,00 para a parcela" não diz nada além da parcela.
      expect(run({ comprometidoCents: 0 }).resultLines).toHaveLength(4);
      expect(run({ comprometidoCents: 0, renda: '4.000,00' }).resultLines.slice(4)).toEqual([
        'A parcela seria 2,2% da sua renda.',
        'Seu comprometido iria de 0,0% para 2,2% enquanto durar o financiamento.',
      ]);
      // Com renda e sem o comprometido (ainda lendo, ou com falha): só o peso da parcela.
      const onlyIncome = run({ renda: '4.000,00', comprometidoCents: null });
      expect(onlyIncome.resultLines).toHaveLength(5);
      expect(onlyIncome.committedBeforePermille).toBeNull();
    });
  });

  describe('juntar antes', () => {
    it('padrão: guarda o valor da parcela; junta o que falta para comprar à vista, o preço menos a entrada (12 meses, sem rendimento)', () => {
      // 100.000 ÷ 8.885 = 11,25 → 12 meses.
      const r = run();
      expect(r.savingTargetCents).toBe(100_000);
      expect(r.savingMonthlyCents).toBe(8_885);
      expect(r.savingMonths).toBe(12);
      expect(r.savingLines).toEqual([
        'Guardando R$ 88,85 por mês, sem rendimento, você junta R$ 1.000,00 em 12 meses (1 ano).',
        'Financiando: você usa o bem agora e paga R$ 66,20 de juros ao longo de 12 meses.',
        'Juntando: leva 12 meses para juntar o que falta para comprar à vista e não paga juros do financiamento.',
      ]);
      expect(r.hypotheses).toContain('Juntar para comprar à vista: o valor a juntar é o que falta, o preço menos a entrada de R$ 200,00 que você já tem: R$ 1.000,00.');
      expect(r.hypotheses).toContain('O preço do bem pode mudar enquanto você junta.');
      expect(r.hypotheses).toContain('Sem rendimento: o valor guardado não cresce.');
      expect(r.hypotheses).toContain('Valor guardado por mês: o da parcela, a menos que você informe outro.');
    });

    it('sem entrada, o que falta é o preço inteiro (120.000 ÷ 8.885 = 13,5 → 14 meses); não há mais escolha de "juntar para"', () => {
      const r = run({ entrada: '', guardar: '88,85' });
      expect(r.savingTargetCents).toBe(120_000);
      expect(r.savingMonths).toBe(14);
      expect(r.savingLines[0]).toBe('Guardando R$ 88,85 por mês, sem rendimento, você junta R$ 1.200,00 em 14 meses (1 ano e 2 meses).');
      expect(r.savingLines[2]).toBe('Juntando: leva 14 meses para juntar o que falta para comprar à vista e não paga juros do financiamento.');
      expect(r.hypotheses).toContain('Juntar para comprar à vista: o valor a juntar é o preço inteiro, R$ 1.200,00.');
      expect('juntarPara' in ANTES_FIELDS).toBe(false);
    });

    it('valor por mês informado e rendimento ao ano: R$ 90,00 com 12% ao ano juntam R$ 1.000,00 em 11 meses (sem rendimento, 12)', () => {
      // r = 1,12^(1/12); depósitos no início do mês: 90 × r × (r^n − 1) ÷ (r − 1) = 948,3 em 10 meses e 1.048,3 em 11.
      const withYield = run({ guardar: '90,00', rendimento: '12' });
      expect(withYield.savingMonths).toBe(11);
      expect(withYield.savingLines[0]).toBe('Guardando R$ 90,00 por mês, com rendimento de 12% ao ano, você junta R$ 1.000,00 em 11 meses.');
      expect(withYield.hypotheses).toContain('Valor guardado por mês: o que você informou.');
      expect(withYield.hypotheses).toContain(
        'Rendimento de 12% ao ano (0,95% ao mês, taxa equivalente), informado por você, constante no período e sem imposto ou taxas.',
      );
      expect(withYield.hypotheses).toContain('Depósitos no início de cada mês, como na Calculadora do Cidadão do Banco Central; prazo em meses inteiros, para cima.');
      expect(run({ guardar: '90,00' }).savingMonths).toBe(12);
      expect(run({ guardar: '90,00', rendimento: '0' }).savingMonths).toBe(12);
    });

    it('rendimento em branco é o mesmo que 0% (sem rendimento); nunca há um rendimento padrão', () => {
      expect(run({ rendimento: '' }).rendimentoBp).toBe(0);
      expect(run({ rendimento: undefined }).rendimentoBp).toBe(0);
      expect(ANTES_FIELDS.rendimento!.optional).toBe(true);
      expect(ANTES_FIELDS.rendimento!.default).toBeUndefined();
    });

    it('não chega em 50 anos: diz isso, sem número de meses', () => {
      const r = run({ preco: '1.000.000,00', entrada: '', guardar: '1,00' });
      expect(r.savingMonths).toBeNull();
      expect(r.savingLines[0]).toBe('Guardando R$ 1,00 por mês, sem rendimento, não dá para juntar R$ 1.000.000,00 em 50 anos.');
      expect(r.savingLines).toHaveLength(2);
      expect(r.savingLines[1]).not.toContain('Juntando');
      expect(r.goalParams).toBeNull();
    });

    it('guardar tanto quanto o valor a juntar leva 1 mês, mesmo com a parcela acima do limite de valor do simulador', () => {
      const r = run({ preco: '9.999.999,99', entrada: '', parcelas: '1', taxaMes: '99,99' });
      expect(r.parcelaCents).toBeGreaterThan(999_999_999);
      expect(r.savingMonths).toBe(1);
    });
  });

  describe('entrada maior', () => {
    it('mais 10% e 20% do preço de entrada: parcela e juros (R$ 1.200,00 em 12 × a 1%)', () => {
      // Base: 106,62 e juros de 79,44. +10% (120,00): 95,96 e 71,52. +20% (240,00): 85,29 e 63,48.
      const r = run({ entrada: '' });
      expect(r.biggerEntries.map((e) => [e.percent, e.entradaCents, e.parcelaCents, e.interestCents, e.interestDiffCents])).toEqual([
        [10, 12_000, 9_596, 7_152, 792],
        [20, 24_000, 8_529, 6_348, 1_596],
      ]);
      expect(r.entryLines).toEqual([
        'Com mais 10% do preço na entrada (R$ 120,00): parcela de R$ 95,96 e juros de R$ 71,52 (R$ 7,92 a menos).',
        'Com mais 20% do preço na entrada (R$ 240,00): parcela de R$ 85,29 e juros de R$ 63,48 (R$ 15,96 a menos).',
      ]);
      expect(ANTES_EXTRA_ENTRY_PERCENTS).toEqual([10, 20]);
    });

    it('soma à entrada que a pessoa já informou, e deixa de fora o que não deixa nada a financiar', () => {
      const r = run({ entrada: '200,00' });
      expect(r.biggerEntries.map((e) => e.entradaCents)).toEqual([32_000, 44_000]);
      const nearly = run({ entrada: '1.100,00' });
      expect(nearly.biggerEntries).toEqual([]);
      expect(nearly.entryLines).toEqual([]);
      const one = run({ entrada: '1.000,00' });
      expect(one.biggerEntries.map((e) => e.percent)).toEqual([10]);
    });

    it('sem juros a menos, não diz "a menos"; com taxa 0% os juros da entrada maior também são zero', () => {
      const r = run({ preco: '1,00', entrada: '', parcelas: '7', taxaMes: '0' });
      expect(r.entryLines.every((l) => !l.includes('a menos'))).toBe(true);
      expect(r.biggerEntries.map((e) => e.interestCents)).toEqual([0, 0]);
      expect(r.entryLines[0]).toBe('Com mais 10% do preço na entrada (R$ 0,10): parcela de R$ 0,13 e juros de R$ 0,00.');
    });
  });

  describe('ações depois do resultado', () => {
    it('"Anotar como parcelamento" leva financiamento, parcelas e o valor da parcela (a partir de 2 parcelas)', () => {
      expect(run().noteParams).toEqual({ tipo: 'parcelada', natureza: 'financiamento', parcelas: 12, valor: 8_885 });
      expect(run({ parcelas: '1' }).noteParams).toBeNull();
      expect(run({ parcelas: '480' }).noteParams?.parcelas).toBe(480);
    });

    it('"Anotar como parcelamento" só leva o valor da parcela quando cabe no limite de um registro', () => {
      // 9.999.999,99 em 2 parcelas a 99,99% ao mês: a parcela passa de R$ 9.999.999,99; o cadastro abre sem o valor.
      const big = run({ preco: '9.999.999,99', entrada: '', parcelas: '2', taxaMes: '99,99' });
      expect(big.parcelaCents).toBeGreaterThan(MAX_RECORD_CENTS);
      expect(big.noteParams).toEqual({ tipo: 'parcelada', natureza: 'financiamento', parcelas: 2 });
      expect('valor' in big.noteParams!).toBe(false);
      const edge = run({ preco: '9.999.999,99', entrada: '', parcelas: '2', taxaMes: '0' });
      expect(edge.noteParams?.valor).toBe(500_000_000);
    });

    it('"Criar meta com este valor": objetivo com o valor a juntar, o prazo (mês de hoje + meses − 1) e o valor por mês', () => {
      const r = run({}, '2026-10-07');
      expect(r.goalParams).toEqual({ tipo: 'objetivo', valor: 100_000, prazo: '09/2027', mensal: 8_885 });
      expect(run().goalParams).toBeNull();
    });
  });

  describe('campos e erros', () => {
    it('um erro por campo, na ordem da tela', () => {
      const out = calcAntesDeFinanciar({ preco: '', parcelas: '', taxaMes: '' });
      expect(out.ok).toBe(false);
      if (!out.ok) expect(out.errors).toEqual({ preco: 'vazio', parcelas: 'vazio', taxaMes: 'vazio' });
    });

    it('entrada: acima do preço, formato e limite', () => {
      expect(errorsOf({ entrada: '1.200,01' })).toEqual({ entrada: 'fora_da_faixa' });
      expect(errorsOf({ entrada: 'abc' })).toEqual({ entrada: 'invalido' });
      expect(errorsOf({ entrada: '10.000.000,00' })).toEqual({ entrada: 'acima_do_limite' });
      expect(run({ entrada: '0' }).entradaCents).toBe(0);
      expect(run({ entrada: '' }).entradaCents).toBe(0);
      expect(run({ entrada: undefined }).entradaCents).toBe(0);
    });

    it('parcelas de 1 a 480; taxa de 0,00% a 99,99% com até 2 casas', () => {
      expect(errorsOf({ parcelas: '0' })).toEqual({ parcelas: 'fora_da_faixa' });
      expect(errorsOf({ parcelas: '481' })).toEqual({ parcelas: 'fora_da_faixa' });
      expect(errorsOf({ parcelas: '12,5' })).toEqual({ parcelas: 'invalido' });
      expect(errorsOf({ taxaMes: '100' })).toEqual({ taxaMes: 'fora_da_faixa' });
      expect(errorsOf({ taxaMes: '1,999' })).toEqual({ taxaMes: 'casas_demais' });
      expect(errorsOf({ taxaMes: 'x' })).toEqual({ taxaMes: 'invalido' });
      expect(run({ taxaMes: '99,99', parcelas: '480' }).taxaBp).toBe(9_999);
      expect(run({ taxaMes: '0,00' }).taxaBp).toBe(0);
    });

    it('renda e valor por mês opcionais, mas maiores que zero quando preenchidos; rendimento de 0% a 30%', () => {
      expect(errorsOf({ renda: '0' })).toEqual({ renda: 'zero' });
      expect(errorsOf({ guardar: '0' })).toEqual({ guardar: 'zero' });
      expect(errorsOf({ rendimento: '30,01' })).toEqual({ rendimento: 'fora_da_faixa' });
      expect(errorsOf({ rendimento: '8,555' })).toEqual({ rendimento: 'casas_demais' });
      expect(errorsOf({ rendimento: 'oito' })).toEqual({ rendimento: 'invalido' });
      expect(run({ rendimento: '30' }).rendimentoBp).toBe(3_000);
    });

    it('todo campo tem rótulo e toda mensagem existe', () => {
      for (const [name, spec] of Object.entries(ANTES_FIELDS)) {
        expect(spec.label.length).toBeGreaterThan(0);
        for (const code of Object.keys(CALC_ERROR_TEXT) as CalcErrorCode[]) expect(calcErrorText('antes-de-financiar', name, code).length).toBeGreaterThan(0);
      }
      expect(calcErrorText('antes-de-financiar', 'entrada', 'fora_da_faixa')).toBe('A entrada não pode passar do preço à vista.');
      expect(calcErrorText('antes-de-financiar', 'preco', 'vazio')).toBe('Digite o preço à vista, como 50.000,00.');
      expect(calcErrorText('antes-de-financiar', 'taxaMes', 'fora_da_faixa')).toBe('Use uma taxa de 0% a 99,99% ao mês.');
      expect(ANTES_FIELDS.taxaMes!.hint).toBe('Está na proposta do banco ou da loja. Use o CET ao mês, se tiver.');
      expect(ANTES_FIELDS.primeiraEmUmMes!.default).toBe(true);
    });

    it('nenhuma taxa padrão: a taxa do financiamento e o rendimento nunca vêm de um link nem têm valor inicial', () => {
      expect(ANTES_FIELDS.taxaMes!.default).toBeUndefined();
      expect(calcLinkParams('antes-de-financiar', { origem: 'serie' })).toEqual({ origem: 'serie' });
      expect(calcPrefill('antes-de-financiar', { taxaMes: '5', preco: '100000', origem: 'serie' })).toEqual({ origem: 'serie' });
      expect(CALC_UI_TEXT.links.financiar).toBe('Antes de financiar? Fazer as contas');
    });
  });

  describe('limites', () => {
    it('R$ 9.999.999,99 em 480 parcelas a 99,99% ao mês não lança e fecha a conta', () => {
      const r = run({ preco: '9.999.999,99', entrada: '', parcelas: '480', taxaMes: '99,99' }, '2026-10-07');
      expect(Number.isSafeInteger(r.totalCents)).toBe(true);
      expect(r.totalCents).toBe(r.entradaCents + 480 * r.parcelaCents);
      expect(r.lastMonth).toBe('2066-10');
      expect(r.resultLines.join(' ')).not.toMatch(/NaN|undefined|Infinity/);
    });

    it('R$ 0,01 financiado em 480 parcelas a 0%: a parcela nunca zera', () => {
      const r = run({ preco: '0,01', entrada: '', parcelas: '480', taxaMes: '0' });
      expect(r.parcelaCents).toBe(1);
      expect(financePaymentCents(1, 0, 480, true)).toBe(1);
    });

    it('financePaymentCents recusa o que está fora do domínio', () => {
      expect(() => financePaymentCents(-1, 0, 1, true)).toThrow(RangeError);
      expect(() => financePaymentCents(100, -1, 1, true)).toThrow(RangeError);
      expect(() => financePaymentCents(100, 0, 0, true)).toThrow(RangeError);
      expect(financePaymentCents(0, 100, 12, false)).toBe(0);
    });
  });
});

/**
 * Casos aleatórios conferidos por uma implementação independente em Python (Fraction e Decimal, centavos inteiros):
 * fixtures/antes-de-financiar.py gera fixtures/antes-de-financiar.json (semente fixa). 220 de Price (com e sem a primeira
 * parcela na compra) e 220 de poupança com depósitos no início do mês.
 */
describe('conferência com o Python independente (fixtures/antes-de-financiar.py)', () => {
  type PriceCase = {
    kind: 'price';
    precoCents: number;
    entradaCents: number;
    parcelas: number;
    taxaBp: number;
    primeiraEmUmMes: boolean;
    parcelaCents: number;
    lastParcelaCents: number;
    totalCents: number;
    interestCents: number;
  };
  type SavingCase = { kind: 'saving'; targetCents: number; monthlyCents: number; rateBp: number; months: number | null; finalCents: number | null };
  const file = fileURLToPath(new URL('./fixtures/antes-de-financiar.json', import.meta.url));
  const cases = (JSON.parse(readFileSync(file, 'utf8')) as { cases: (PriceCase | SavingCase)[] }).cases;
  const rateText = (bp: number) => `${Math.floor(bp / 100)},${String(bp % 100).padStart(2, '0')}`;

  it('220 casos de Price', () => {
    const prices = cases.filter((c): c is PriceCase => c.kind === 'price');
    expect(prices.length).toBeGreaterThanOrEqual(200);
    for (const c of prices) {
      const out = calcAntesDeFinanciar({
        preco: centsToInput(c.precoCents),
        entrada: centsToInput(c.entradaCents),
        parcelas: String(c.parcelas),
        taxaMes: rateText(c.taxaBp),
        primeiraEmUmMes: c.primeiraEmUmMes,
      });
      if (!out.ok) throw new Error(`${JSON.stringify(c)} ${JSON.stringify(out.errors)}`);
      const r = out.result;
      if (c.entradaCents === c.precoCents) {
        expect(r.nothingToFinance, JSON.stringify(c)).toBe(true);
        continue;
      }
      expect([r.parcelaCents, r.lastParcelaCents, r.totalCents, r.interestCents], JSON.stringify(c)).toEqual([c.parcelaCents, c.lastParcelaCents, c.totalCents, c.interestCents]);
    }
  });

  it('220 casos de poupança com depósitos no início do mês (meses e valor final)', () => {
    const savings = cases.filter((c): c is SavingCase => c.kind === 'saving');
    expect(savings.length).toBeGreaterThanOrEqual(200);
    expect(savings.some((c) => c.months === null)).toBe(true);
    expect(savings.some((c) => c.rateBp > 0 && c.months !== null && c.months > 1)).toBe(true);
    for (const c of savings) {
      // Sem entrada, o que falta para comprar à vista é o preço; o valor por mês é o informado; o rendimento, o do caso.
      const out = calcAntesDeFinanciar({
        preco: centsToInput(c.targetCents),
        entrada: '',
        parcelas: '12',
        taxaMes: '1',
        guardar: centsToInput(c.monthlyCents),
        rendimento: rateText(c.rateBp),
      });
      if (!out.ok) throw new Error(`${JSON.stringify(c)} ${JSON.stringify(out.errors)}`);
      expect(out.result.savingMonths, JSON.stringify(c)).toBe(c.months);
      if (c.finalCents !== null && c.months !== null) expect(finalValueCents(0, c.monthlyCents, c.months, c.rateBp), JSON.stringify(c)).toBe(c.finalCents);
    }
  });
});
