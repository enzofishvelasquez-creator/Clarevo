import { describe, expect, it } from 'vitest';
import {
  ANNUAL_EXAMPLE_PARTS,
  ANNUAL_EXAMPLE_SINGLE,
  ANNUAL_HELP_TEXT,
  annualPartsExample,
  formatBRL,
  installmentAmounts,
  seriesPreview,
} from '../src';

describe('contas do ano explicadas (D-042)', () => {
  it('o exemplo em parcelas fecha a conta: 10 parcelas de R$ 180,00 somam R$ 1.800,00, de fevereiro a novembro', () => {
    const ex = annualPartsExample();
    expect(ex.partCents).toBe(18_000);
    expect(ex.totalCents).toBe(ANNUAL_EXAMPLE_PARTS.totalCents);
    expect(ex.partCents * ANNUAL_EXAMPLE_PARTS.parts).toBe(ANNUAL_EXAMPLE_PARTS.totalCents);
    expect(installmentAmounts(ANNUAL_EXAMPLE_PARTS.totalCents, ANNUAL_EXAMPLE_PARTS.parts)).toEqual(Array(10).fill(18_000));
    expect(ex.lastMonth).toBe('2027-11');
  });

  it('a explicação de cota única e de parcelas traz os dois exemplos com os números certos', () => {
    const t = ANNUAL_HELP_TEXT.howPaysHint;
    expect(t).toContain(`Cota única: o valor do ano sai de uma vez. Ex.: IPVA de ${formatBRL(ANNUAL_EXAMPLE_SINGLE.cents)}, que vence em janeiro.`);
    expect(t).toContain(`Em parcelas: o valor do ano é dividido em vezes. Ex.: IPTU de ${formatBRL(180_000)} em 10 parcelas de ${formatBRL(18_000)}, de fevereiro a novembro.`);
    expect(t.replace(/ /g, ' ')).toContain('IPTU de R$ 1.800,00 em 10 parcelas de R$ 180,00');
  });

  it('o texto do topo do cadastro é o pedido por Enzo', () => {
    expect(ANNUAL_HELP_TEXT.intro).toBe(
      'Contas do ano são as que vêm uma vez por ano, como IPVA, IPTU, matrícula e seguro. Você cadastra uma vez; todo ano o Clarevo lembra e cria as contas do mês certo.',
    );
    expect(ANNUAL_HELP_TEXT.whatIsThis).toBe('O que é isso?');
  });

  it('exemplos de mês, de dia e de valor combinam com os exemplos de cota única e de parcelas', () => {
    expect(ANNUAL_HELP_TEXT.monthHintSingle).toBe('Em que mês a conta vence. Ex.: IPVA em janeiro.');
    expect(ANNUAL_HELP_TEXT.monthHintParts).toBe('Em que mês vence a primeira parcela. Ex.: IPTU começa em fevereiro.');
    expect(ANNUAL_HELP_TEXT.amountExampleSingle.replace(/ /g, ' ')).toBe('Ex.: IPVA de R$ 2.400,00.');
    expect(ANNUAL_HELP_TEXT.amountExampleParts.replace(/ /g, ' ')).toBe('Ex.: a parcela de R$ 180,00 do IPTU.');
    expect(ANNUAL_HELP_TEXT.dayExample).toBe('Ex.: dia 20 para uma conta que vence em 20/01.');
  });

  it('os exemplos do cadastro valem na regra: IPVA de R$ 2.400,00 em 20/01 e IPTU de 10 parcelas de R$ 180,00 de fevereiro a novembro', () => {
    const base = { kind: 'anual', nature: 'conta', category: null, amountMode: 'variavel', firstNumber: 1, installmentTotal: null, lastMonth: null } as const;
    const ipva = seriesPreview(
      { ...base, description: 'IPVA', amountCents: ANNUAL_EXAMPLE_SINGLE.cents, dueDay: 20, firstDueMonth: ANNUAL_EXAMPLE_SINGLE.month, partsPerYear: 1 },
      '2026-10-10',
    );
    expect(ipva.text).toContain('IPVA · cerca de R$ 2.400,00 (estimado) · todo ano em 20/01');
    const ex = annualPartsExample();
    const iptu = seriesPreview(
      { ...base, description: 'IPTU', amountCents: ex.partCents, dueDay: 10, firstDueMonth: ANNUAL_EXAMPLE_PARTS.firstMonth, partsPerYear: ANNUAL_EXAMPLE_PARTS.parts },
      '2026-10-10',
    );
    expect(iptu.text).toContain('10 parcelas de cerca de R$ 180,00 (estimado)');
    expect(iptu.text).toContain('de fevereiro a novembro');
    expect(iptu.text).toContain('Cerca de R$ 1.800,00 por ano.');
  });

  it('o que acontece nos próximos anos fala de informar o valor, em Ano a ano, sem mudar os outros anos', () => {
    expect(ANNUAL_HELP_TEXT.changesHint).toContain('informe o valor em Ano a ano');
    expect(ANNUAL_HELP_TEXT.changesHint).toBe(
      'Se muda, o Clarevo usa o valor que você cadastrou como estimativa. Quando o carnê ou o boleto do ano chegar, abra a conta do ano e informe o valor em Ano a ano.',
    );
    expect(ANNUAL_HELP_TEXT.changesHint).not.toContain('ano passado');
    expect(ANNUAL_HELP_TEXT.sameHint).toContain('repete o valor todo ano');
    expect(ANNUAL_HELP_TEXT.nextYears).toContain('dois meses antes do primeiro vencimento');
    expect(ANNUAL_HELP_TEXT.nextYears).toContain('só aquele ano muda');
    expect(ANNUAL_HELP_TEXT.informOnlyYear('2027')).toBe('Isso vale só para 2027. Os outros anos continuam com a referência atual.');
    expect(ANNUAL_HELP_TEXT.informOnlyYear('2026/2027')).toContain('2026/2027');
  });

  it('"o valor que você cadastrou" vale na regra: cada ano novo da série nasce com o valor cadastrado, não com o do ano anterior', () => {
    const preview = seriesPreview(
      {
        kind: 'anual', nature: 'conta', description: 'IPVA', category: null, amountMode: 'variavel', amountCents: ANNUAL_EXAMPLE_SINGLE.cents,
        dueDay: 20, firstDueMonth: ANNUAL_EXAMPLE_SINGLE.month, partsPerYear: 1, firstNumber: 1, installmentTotal: null, lastMonth: null,
      },
      '2026-10-10',
    );
    expect(preview.next.length).toBe(3);
    expect(preview.next.map((o) => o.dueOn.slice(0, 4))).toEqual(['2027', '2028', '2029']);
    for (const o of preview.next) expect(o.amountCents).toBe(ANNUAL_EXAMPLE_SINGLE.cents);
    expect(ANNUAL_HELP_TEXT.changesHint).toContain('usa o valor que você cadastrou como estimativa');
  });

  it('a legenda de "Ano a ano" explica previsto, informar o valor e tirada', () => {
    const all = ANNUAL_HELP_TEXT.yearByYearHelp.join(' ');
    expect(all).toContain('Previsto:');
    expect(all).toContain('Informar o valor');
    expect(all).toContain('Tirada:');
  });

  it('a lista de Gastos fixos explica o que são contas do ano e a antecedência', () => {
    expect(ANNUAL_HELP_TEXT.listIntro).toContain('IPVA, IPTU, matrícula e seguro');
    expect(ANNUAL_HELP_TEXT.listIntro).toContain('dois meses antes de vencer');
  });
});
