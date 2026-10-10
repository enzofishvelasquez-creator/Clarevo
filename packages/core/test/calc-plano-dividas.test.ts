/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  CALC_DISCLAIMER,
  DEMO_TODAY,
  PLANO_ESTIMATE_TEXT,
  PLANO_FIELDS,
  PLANO_MAX_DEBTS,
  PLANO_MAX_MONTHS,
  PLANO_TEXT,
  calcErrorText,
  calcPlanoDividas,
  calcPrefill,
  calcLinkParams,
  createDemoRepository,
  draftToInput,
  installmentTable,
  planoDebtStays,
  presentValueCents,
  newOperationKey,
  planoDebtName,
  seriesDebtDrafts,
  type PlanoDividaInput,
  type PlanoInput,
  type PlanoResult,
  type SeriesInput,
} from '../src';

const saldo = (saldoText: string, taxa: string, pagamento: string, apelido?: string): PlanoDividaInput => ({
  tipo: 'saldo',
  saldo: saldoText,
  taxaSaldo: taxa,
  pagamento,
  ...(apelido !== undefined ? { apelido } : {}),
});
const parcelada = (parcela: string, restantes: string, taxa = '', apelido?: string): PlanoDividaInput => ({
  tipo: 'parcelada',
  parcela,
  restantes,
  taxaParcelada: taxa,
  ...(apelido !== undefined ? { apelido } : {}),
});

function run(input: PlanoInput, today?: string): PlanoResult {
  const out = calcPlanoDividas(input, today);
  if (!out.ok) throw new Error(JSON.stringify(out.errors));
  return out.result;
}
const errors = (input: PlanoInput) => {
  const out = calcPlanoDividas(input);
  return out.ok ? null : out.errors;
};
const scenario = (r: PlanoResult, id: string) => r.scenarios.find((s) => s.id === id)!;

describe('9. Em que ordem quitar as dívidas? (D-040)', () => {
  it('duas dívidas com saldo, conferido à mão: sem valor a mais as duas terminam no mês 2', () => {
    // A: R$ 1.000,00 a 10% pagando R$ 600,00. Mês 1: juros 100,00, saldo 1.100,00 - 600,00 = 500,00. Mês 2: juros 50,00,
    // saldo 550,00 pago por inteiro. B: R$ 500,00 a 5% pagando R$ 300,00. Mês 1: juros 25,00, saldo 225,00. Mês 2: juros
    // 11,25, saldo 236,25 pago por inteiro. Pago: 1.150,00 + 536,25 = 1.686,25; juros 150,00 + 36,25 = 186,25.
    const r = run({ dividas: [saldo('1.000,00', '10', '600,00', 'Cartão'), saldo('500,00', '5', '300,00', 'Cheque')] }, '2026-10-10');
    const base = scenario(r, 'sem_extra');
    expect([base.months, base.totalPaidCents, base.interestCents, base.firstMonth]).toEqual([2, 168_625, 18_625, 2]);
    expect(base.endMonth).toBe('2026-12');
    expect(r.initialSumCents).toBe(150_000);
    expect(base.totalPaidCents).toBe(r.initialSumCents + base.interestCents!);
    expect(r.debts.map((d) => [d.initialCents, d.firstInterestCents, d.excluded])).toEqual([
      [100_000, 10_000, false],
      [50_000, 2_500, false],
    ]);
  });

  it('com R$ 100,00 a mais, as duas ordens diferem em juros (conferido à mão)', () => {
    // Total do mês: 100,00 + 600,00 + 300,00 = 1.000,00.
    // Maior taxa primeiro (A): mês 1, A fica 500,00 - 100,00 = 400,00 e B 225,00; mês 2, A: juros 40,00, paga 440,00; B: juros
    // 11,25, paga 236,25. Pago 1.000,00 + 676,25 = 1.676,25; juros 100 + 25 + 40 + 11,25 = 176,25.
    // Menor dívida primeiro (B): mês 1, B fica 225,00 - 100,00 = 125,00 e A 500,00; mês 2, A: juros 50,00, paga 550,00; B: juros
    // 6,25, paga 131,25. Pago 1.000,00 + 681,25 = 1.681,25; juros 181,25.
    const r = run({ extra: '100,00', dividas: [saldo('1.000,00', '10', '600,00'), saldo('500,00', '5', '300,00')] });
    const maior = scenario(r, 'maior_taxa');
    const menor = scenario(r, 'menor_divida');
    expect([maior.months, maior.totalPaidCents, maior.interestCents]).toEqual([2, 167_625, 17_625]);
    expect([menor.months, menor.totalPaidCents, menor.interestCents]).toEqual([2, 168_125, 18_125]);
    expect(scenario(r, 'sem_extra').interestCents).toBe(18_625);
    expect(r.differences).toEqual([
      'Maior taxa primeiro: R$ 5,00 a menos de juros.',
      PLANO_TEXT.sameFirst,
      PLANO_TEXT.sameEnd,
    ]);
  });

  it('duas parceladas sem juros informados: a bola de neve encurta o prazo (conferido à mão)', () => {
    // A: 3 × R$ 100,00 (saldo 300,00); B: 4 × R$ 50,00 (saldo 200,00); sem taxa, saldo = soma das parcelas.
    // Sem valor a mais: A termina no mês 3 e B no mês 4. Com R$ 100,00 a mais (total do mês 250,00), B (menor) vai primeiro:
    // mês 1, B 150,00 - 100,00 = 50,00 e A 200,00; mês 2, B paga os 50,00 que faltam e A paga 100,00 + os 100,00 que sobram.
    const r = run({ extra: '100,00', dividas: [parcelada('100,00', '3', '', 'A'), parcelada('50,00', '4', '', 'B')] });
    const base = scenario(r, 'sem_extra');
    expect([base.months, base.firstMonth, base.totalPaidCents, base.interestCents]).toEqual([4, 3, 50_000, 0]);
    expect(base.sequence.map((s) => [s.name, s.month])).toEqual([['A', 3], ['B', 4]]);
    for (const id of ['maior_taxa', 'menor_divida']) {
      const s = scenario(r, id);
      expect([s.months, s.firstMonth, s.totalPaidCents, s.interestCents]).toEqual([2, 2, 50_000, 0]);
      expect(s.sequence.map((x) => [x.name, x.month])).toEqual([['A', 2], ['B', 2]]);
    }
    // Sem juros informados: conta só as parcelas e diz isso nas hipóteses, uma por dívida.
    expect(r.hypotheses).toContain('A: sem juros informados, conta só as parcelas.');
    expect(r.hypotheses).toContain('B: sem juros informados, conta só as parcelas.');
    expect(r.hypotheses).not.toContain(PLANO_TEXT.hypotheses.presentValue);
    expect(r.debts.map((d) => [d.initialCents, d.rateBp])).toEqual([[30_000, null], [20_000, null]]);
  });

  it('2 parceladas e 1 rotativo: valores conferidos em Python (aritmética exata)', () => {
    const r = run(
      {
        extra: '200,00',
        dividas: [
          parcelada('850,00', '36', '1,5', 'Carro'),
          parcelada('200,00', '10', '2', 'Loja'),
          saldo('1.500,00', '8', '300,00', 'Rotativo'),
        ],
      },
      '2026-10-10',
    );
    // Saldo inicial = valor presente das parcelas: 36 × R$ 850,00 a 1,5% = R$ 23.511,58 (como em "Quitar antes").
    expect(r.debts.map((d) => d.initialCents)).toEqual([2_351_158, 179_652, 150_000]);
    expect(r.initialSumCents).toBe(2_680_810);
    const base = scenario(r, 'sem_extra');
    expect([base.months, base.totalPaidCents, base.interestCents]).toEqual([36, 3_459_389, 778_579]);
    expect(base.sequence.map((s) => [s.index, s.month])).toEqual([[2, 7], [1, 10], [0, 36]]);
    for (const id of ['maior_taxa', 'menor_divida']) {
      const s = scenario(r, id);
      expect([s.months, s.totalPaidCents, s.interestCents, s.firstMonth]).toEqual([21, 3_162_744, 481_934, 4]);
      expect(s.sequence.map((x) => [x.index, x.month])).toEqual([[2, 4], [1, 6], [0, 21]]);
      // Mês 1 é novembro de 2026: o mês 21 é julho de 2028.
      expect(s.endMonth).toBe('2028-07');
      expect(s.totalPaidCents).toBe(r.initialSumCents + s.interestCents!);
    }
    expect(scenario(r, 'maior_taxa').summary).toBe('Maior taxa primeiro: tudo termina em 21 meses (1 ano e 9 meses), em julho de 2028.');
    expect(scenario(r, 'maior_taxa').sequenceLines[0]).toBe('1. Rotativo: termina em 4 meses (fevereiro de 2027).');
  });

  it('as duas ordens se afastam: primeira dívida e fim em meses diferentes', () => {
    // R$ 2.000,00 a 2% pagando R$ 60,00 e R$ 4.000,00 a 5% pagando R$ 300,00, com R$ 200,00 a mais (referência em Python).
    const r = run({ extra: '200,00', dividas: [saldo('2.000,00', '2', '60,00'), saldo('4.000,00', '5', '300,00')] });
    const maior = scenario(r, 'maior_taxa');
    const menor = scenario(r, 'menor_divida');
    expect([maior.months, maior.firstMonth, maior.interestCents]).toEqual([14, 11, 171_226]);
    expect([menor.months, menor.firstMonth, menor.interestCents]).toEqual([15, 9, 227_794]);
    expect(scenario(r, 'sem_extra').months).toBe(56);
    expect(r.differences).toEqual([
      'Maior taxa primeiro: R$ 565,68 a menos de juros.',
      'Menor dívida primeiro: a primeira dívida termina 2 meses antes.',
      'Maior taxa primeiro: tudo termina 1 mês antes.',
    ]);
    expect(r.resultLines).toEqual([
      scenario(r, 'sem_extra').summary,
      maior.summary,
      menor.summary,
      ...r.differences,
    ]);
    // A frase da referência é a primeira linha do resultado (o destaque).
    expect(r.resultLines[0]).toBe('Sem valor a mais: tudo termina em 56 meses (4 anos e 8 meses).');
  });

  it('conservação: total pago = soma dos saldos iniciais + juros, em muitas combinações', () => {
    // Gerador simples e fixo (sem sorteio) de combinações de dívidas, taxas, pagamentos e valor a mais.
    let seed = 12345;
    const next = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % n;
    };
    let checked = 0;
    let finished = 0;
    for (let k = 0; k < 150; k++) {
      const dividas: PlanoDividaInput[] = [];
      for (let i = 0, n = 1 + next(10); i < n; i++) {
        if (next(2) === 0) dividas.push(parcelada(`${1 + next(900)},${String(next(100)).padStart(2, '0')}`, String(1 + next(60)), ['', '0', '0,5', '1,99', '7'][next(5)]!));
        else {
          const s = 100 + next(9000);
          const rate = [1, 2, 5, 8][next(4)]!;
          dividas.push(saldo(`${s},00`, String(rate), `${Math.ceil((s * rate) / 100) + 1 + next(300)},00`));
        }
      }
      const r = run({ extra: next(3) === 0 ? '' : `${next(500)},00`, dividas });
      for (const s of r.scenarios) {
        checked++;
        if (s.months === null) continue;
        finished++;
        expect(s.totalPaidCents, `caso ${k} ${s.id}`).toBe(r.initialSumCents + s.interestCents!);
        expect(s.interestCents!).toBeGreaterThanOrEqual(0);
        expect(s.sequence).toHaveLength(r.included);
        expect(Math.max(...s.sequence.map((x) => x.month))).toBe(s.months);
      }
      // Com o valor a mais, nenhuma ordem termina depois nem paga mais juros que a referência.
      const base = scenario(r, 'sem_extra');
      for (const s of r.scenarios.filter((x) => x.id !== 'sem_extra')) {
        if (base.months === null) continue;
        expect(s.months, `caso ${k} ${s.id}`).not.toBeNull();
        expect(s.months!).toBeLessThanOrEqual(base.months);
        expect(s.interestCents!).toBeLessThanOrEqual(base.interestCents!);
      }
    }
    expect(checked).toBeGreaterThan(300);
    expect(finished).toBeGreaterThan(250);
  });

  it('uma dívida: só "Sem valor a mais" e "Com o valor a mais"; sem valor a mais, a dica', () => {
    const one = [parcelada('850,00', '36', '1,5', 'Carro')];
    const withExtra = run({ extra: '100,00', dividas: one });
    expect(withExtra.scenarios.map((s) => s.id)).toEqual(['sem_extra', 'com_extra']);
    expect(withExtra.differences).toEqual([]);
    const base = scenario(withExtra, 'sem_extra');
    const com = scenario(withExtra, 'com_extra');
    // Referência em Python (tabela do contrato): sem valor a mais paga exatamente as 36 parcelas, R$ 30.600,00.
    expect([base.months, base.totalPaidCents, base.interestCents]).toEqual([36, 3_060_000, 708_842]);
    expect([com.months, com.totalPaidCents, com.interestCents]).toEqual([32, 2_960_741, 609_583]);
    expect(withExtra.resultLines[0]).toMatch(/^Sem valor a mais: tudo termina em 36 meses/);
    expect(withExtra.resultLines[1]).toMatch(/^Com o valor a mais: tudo termina em /);
    expect(withExtra.resultLines.some((l) => /^Com o valor a mais: R\$ .* a menos de juros\.$/.test(l))).toBe(true);
    const without = run({ dividas: one });
    expect(without.scenarios.map((s) => s.id)).toEqual(['sem_extra']);
    expect(without.resultLines).toEqual([scenario(without, 'sem_extra').summary, PLANO_TEXT.needExtra]);
  });

  it('o valor a mais vazio é o mesmo que zero; zero é aceito', () => {
    const dividas = [saldo('1.000,00', '10', '600,00'), saldo('500,00', '5', '300,00')];
    expect(JSON.stringify(run({ dividas }).scenarios)).toBe(JSON.stringify(run({ dividas, extra: '0' }).scenarios));
    expect(run({ dividas, extra: '0,00' }).extraCents).toBe(0);
  });

  it('pagamento que não cobre os juros do primeiro mês: a dívida fica fora da comparação e diz por quê', () => {
    // Juros do primeiro mês: R$ 1.000,00 a 8% = R$ 80,00. Pagando R$ 80,00 (igual) ou menos, o saldo não diminui.
    for (const pagamento of ['79,99', '80,00', '10,00']) {
      const r = run({ dividas: [saldo('1.000,00', '8', pagamento, 'Rotativo'), parcelada('100,00', '5', '', 'Loja')] });
      expect(r.debts[0]!.excluded, pagamento).toBe(true);
      expect(r.included).toBe(1);
      expect(r.scenarios.map((s) => s.id)).toEqual(['sem_extra']);
      expect(r.notes).toContain('Rotativo fica fora da comparação até o pagamento ser maior que os juros do primeiro mês (R$ 80,00).');
      expect(r.notes[0]).toBe(PLANO_ESTIMATE_TEXT);
      expect(r.initialSumCents).toBe(50_000);
    }
    expect(PLANO_TEXT.balanceStays).toBe('Com este pagamento, o saldo não diminui.');
    // R$ 80,01 já diminui o saldo.
    const ok = run({ dividas: [saldo('1.000,00', '8', '80,01'), parcelada('100,00', '5')] });
    expect(ok.debts[0]!.excluded).toBe(false);
    expect(ok.included).toBe(2);
    // Só dívidas fora da comparação: nenhuma conta, mas a explicação continua à vista.
    const none = run({ dividas: [saldo('1.000,00', '8', '50,00')] });
    expect(none.scenarios).toEqual([]);
    expect(none.resultLines).toEqual([PLANO_TEXT.noDebtCompared]);
    expect(none.notes).toHaveLength(2);
  });

  it('planoDebtStays: vale com os três campos da própria dívida, mesmo com outros campos incompletos', () => {
    expect(planoDebtStays(saldo('1.000,00', '8', '80,00'))).toBe(true);
    expect(planoDebtStays(saldo('1.000,00', '8', '80,01'))).toBe(false);
    expect(planoDebtStays(saldo('1.000,00', '8', '10,00', 'Rotativo'))).toBe(true);
    // Campo da própria dívida faltando ou inválido: ainda não dá para dizer.
    expect(planoDebtStays(saldo('1.000,00', '', '10,00'))).toBe(false);
    expect(planoDebtStays(saldo('', '8', '10,00'))).toBe(false);
    expect(planoDebtStays(saldo('1.000,00', '8', ''))).toBe(false);
    expect(planoDebtStays(saldo('1.000,00', '0', '10,00'))).toBe(false);
    expect(planoDebtStays(parcelada('10,00', '5', '8'))).toBe(false);
    expect(planoDebtStays({ tipo: null })).toBe(false);
    // O resultado do cálculo concorda, e o aviso não depende de o resto da tela estar completo.
    const full = run({ dividas: [saldo('1.000,00', '8', '80,00'), parcelada('100,00', '5')] });
    expect(full.debts.map((d) => d.excluded)).toEqual([true, false]);
    const incompleta = { dividas: [saldo('1.000,00', '8', '80,00'), { tipo: 'parcelada' as const }], extra: 'abc' };
    expect(errors(incompleta)).not.toBeNull();
    expect(planoDebtStays(incompleta.dividas[0]!)).toBe(true);
  });

  it('legenda de "Sem valor a mais": só com 2 ou mais dívidas e nenhum valor a mais', () => {
    const two = [saldo('1.000,00', '10', '600,00'), saldo('500,00', '5', '300,00')];
    expect(scenario(run({ dividas: two }), 'sem_extra').caption).toBe('Cada dívida só com os pagamentos de sempre, sem passar nada adiante.');
    expect(scenario(run({ dividas: two, extra: '0' }), 'sem_extra').caption).toBe(PLANO_TEXT.baselineCaption);
    expect(scenario(run({ dividas: two, extra: '100,00' }), 'sem_extra').caption).toBeNull();
    expect(scenario(run({ dividas: [two[0]!] }), 'sem_extra').caption).toBeNull();
    for (const id of ['maior_taxa', 'menor_divida']) expect(scenario(run({ dividas: two }), id).caption).toBeNull();
    expect(PLANO_TEXT.baselineCaption).toContain('sem passar nada adiante');
  });

  it('as dívidas não terminam em 50 anos: 600 meses, sem número', () => {
    // R$ 100.000,00 a 1% pagando R$ 1.000,01: o saldo cai um centavo por mês.
    const r = run({ dividas: [saldo('100.000,00', '1', '1.000,01')] });
    const base = scenario(r, 'sem_extra');
    expect(PLANO_MAX_MONTHS).toBe(600);
    expect([base.months, base.endMonth, base.totalPaidCents, base.interestCents, base.sequence]).toEqual([null, null, null, null, []]);
    expect(base.summary).toBe('Sem valor a mais: com estes números, as dívidas não terminam em 50 anos.');
    expect(PLANO_TEXT.noEnd).toBe('Com estes números, as dívidas não terminam em 50 anos.');
    expect(r.resultLines.join(' ')).not.toMatch(/\d+ meses/);
    // Com valor a mais a dívida termina, e a ordem compara só o que termina.
    const com = run({ extra: '5.000,00', dividas: [saldo('100.000,00', '1', '1.000,01')] });
    expect(scenario(com, 'com_extra').months).not.toBeNull();
    // Duas dívidas: as duas ordens passam de 600 meses; nada de diferenças.
    const two = run({ dividas: [saldo('100.000,00', '1', '1.000,01'), saldo('50.000,00', '1', '500,01')] });
    expect(two.scenarios.map((s) => s.months)).toEqual([null, null, null]);
    expect(two.differences).toEqual([]);
  });

  it('exatamente 600 meses ainda conta; um centavo a menos de pagamento passa do limite', () => {
    // R$ 1.000,00 a 0,01% ao mês (juros de R$ 0,10 no primeiro mês): pagando R$ 1,72, termina no mês 600; pagando R$ 1,71, não.
    const edge = scenario(run({ dividas: [saldo('1.000,00', '0,01', '1,72')] }, '2026-10-10'), 'sem_extra');
    expect([edge.months, edge.endMonth]).toEqual([600, '2076-10']);
    expect(scenario(run({ dividas: [saldo('1.000,00', '0,01', '1,71')] }), 'sem_extra').months).toBeNull();
    expect(scenario(run({ dividas: [parcelada('1,00', '480')] }), 'sem_extra').months).toBe(480);
  });

  it('desempate: maior taxa (menor saldo, depois ordem da lista) e menor dívida (maior taxa, depois ordem da lista)', () => {
    const input = (dividas: PlanoDividaInput[]) => run({ extra: '300,00', dividas });
    const order = (r: PlanoResult, id: string) => scenario(r, id).sequence.map((s) => s.name);
    // Mesma taxa: "Maior taxa primeiro" começa pelo menor saldo.
    const sameRate = input([saldo('2.000,00', '5', '150,00', 'Grande'), saldo('900,00', '5', '60,00', 'Pequena')]);
    expect(order(sameRate, 'maior_taxa')[0]).toBe('Pequena');
    // Mesmo saldo: "Menor dívida primeiro" começa pela maior taxa.
    const sameSize = input([saldo('1.000,00', '3', '80,00', 'Taxa baixa'), saldo('1.000,00', '9', '120,00', 'Taxa alta')]);
    expect(order(sameSize, 'menor_divida')[0]).toBe('Taxa alta');
    // Tudo igual: a ordem da lista decide, e as duas ordens dão o mesmo resultado.
    const same = input([saldo('1.000,00', '5', '100,00', 'Primeira'), saldo('1.000,00', '5', '100,00', 'Segunda')]);
    expect(order(same, 'maior_taxa')).toEqual(['Primeira', 'Segunda']);
    expect(order(same, 'menor_divida')).toEqual(['Primeira', 'Segunda']);
    expect(scenario(same, 'maior_taxa').interestCents).toBe(scenario(same, 'menor_divida').interestCents);
    expect(same.differences).toEqual([PLANO_TEXT.sameInterest, PLANO_TEXT.sameFirst, PLANO_TEXT.sameEnd]);
    // Trocar a ordem da lista troca quem vai primeiro quando tudo empata.
    const swapped = input([saldo('1.000,00', '5', '100,00', 'Segunda'), saldo('1.000,00', '5', '100,00', 'Primeira')]);
    expect(order(swapped, 'maior_taxa')).toEqual(['Segunda', 'Primeira']);
    // Parcelada sem taxa conta como taxa zero no desempate.
    const noRate = input([parcelada('100,00', '12', '', 'Sem taxa'), saldo('1.000,00', '1', '90,00', 'Com taxa')]);
    expect(noRate.debts[0]!.rateBp).toBeNull();
    expect(scenario(noRate, 'maior_taxa').sequence.length).toBe(2);
  });

  it('10 dívidas funcionam; 11 não; nenhuma pede o aviso de lista vazia', () => {
    const ten = Array.from({ length: PLANO_MAX_DEBTS }, (_, i) => (i % 2 === 0 ? parcelada(`${100 + i},00`, String(6 + i), '1,2') : saldo(`${500 + 100 * i},00`, '4', '200,00')));
    const r = run({ extra: '250,00', dividas: ten });
    expect(r.included).toBe(10);
    expect(scenario(r, 'maior_taxa').sequence).toHaveLength(10);
    expect(scenario(r, 'maior_taxa').sequenceLines).toHaveLength(10);
    expect(errors({ dividas: [...ten, saldo('100,00', '5', '50,00')] })).toEqual({ dividas: 'fora_da_faixa' });
    expect(errors({ dividas: [] })).toEqual({ dividas: 'vazio' });
    expect(PLANO_FIELDS.dividas!.errors!.vazio).toBe('Acrescente as dívidas que você quer comparar.');
    expect(calcErrorText('plano-dividas', 'dividas', 'vazio')).toBe('Acrescente as dívidas que você quer comparar.');
  });

  it('rollover: o que sobra ao quitar a dívida-alvo passa para a próxima no mesmo mês', () => {
    // Duas dívidas sem juros: A 2 × R$ 100,00 (saldo 200,00) e B 5 × R$ 100,00 (saldo 500,00). Com R$ 1.000,00 a mais, no
    // mês 1 sobram R$ 1.000,00 depois dos pagamentos de sempre (R$ 200,00): menor dívida (A) recebe 100,00 e quita; os
    // R$ 900,00 restantes quitam B no mesmo mês.
    const r = run({ extra: '1.000,00', dividas: [parcelada('100,00', '2', '', 'A'), parcelada('100,00', '5', '', 'B')] });
    for (const id of ['maior_taxa', 'menor_divida']) {
      const s = scenario(r, id);
      expect([s.months, s.firstMonth, s.totalPaidCents]).toEqual([1, 1, 70_000]);
      expect(s.sequence.map((x) => x.month)).toEqual([1, 1]);
    }
    expect(scenario(r, 'sem_extra').months).toBe(5);
  });

  it('arredondamento: juros do mês em centavos, metade para cima', () => {
    // R$ 3,33 a 3,33%: juros 0,110889 → 11 centavos; pagando R$ 2,00 sobra 1,44; juros 0,0479 → 5 centavos, paga 1,49.
    const r = run({ dividas: [saldo('3,33', '3,33', '2,00')] });
    const base = scenario(r, 'sem_extra');
    expect([base.months, base.totalPaidCents, base.interestCents]).toEqual([2, 349, 16]);
    expect(r.debts[0]!.firstInterestCents).toBe(11);
    // Meio centavo sobe: R$ 0,50 a 0,01% = 0,005 centavo → 0; R$ 0,50 a 1% = 0,5 centavo → 1.
    expect(run({ dividas: [saldo('0,50', '0,01', '0,10')] }).debts[0]!.firstInterestCents).toBe(0);
    expect(run({ dividas: [saldo('0,50', '1', '0,10')] }).debts[0]!.firstInterestCents).toBe(1);
    expect(run({ dividas: [saldo('50,00', '1', '1,00')] }).debts[0]!.firstInterestCents).toBe(50);
    expect(run({ dividas: [saldo('0,50', '99,99', '0,99')] }).debts[0]!.firstInterestCents).toBe(50);
  });

  it('parcelada com taxa: o saldo inicial é o valor presente das parcelas que faltam', () => {
    const r = run({ dividas: [parcelada('850,00', '36', '1,5')] });
    expect(r.debts[0]!.initialCents).toBe(2_351_158);
    expect(r.hypotheses).toContain(PLANO_TEXT.hypotheses.presentValue);
    // Taxa 0,00% informada é uma taxa: a soma das parcelas, sem a hipótese de "sem juros informados".
    const zero = run({ dividas: [parcelada('850,00', '36', '0')] });
    expect(zero.debts[0]!.initialCents).toBe(3_060_000);
    expect(zero.debts[0]!.rateBp).toBe(0);
    expect(zero.hypotheses.some((h) => /sem juros informados/.test(h))).toBe(false);
    // Taxa vazia: a soma das parcelas, e a hipótese diz isso.
    const none = run({ dividas: [parcelada('850,00', '36', '')] });
    expect(none.debts[0]!.initialCents).toBe(3_060_000);
    expect(none.hypotheses).toContain('Dívida 1: sem juros informados, conta só as parcelas.');
    expect(scenario(none, 'sem_extra').interestCents).toBe(0);
  });

  it('parcelada pela tabela do contrato: sem balão, a dívida única paga a parcela todo mês e fecha no mês n', () => {
    // Antes (saldo e juros arredondados a cada mês), 480 × R$ 850,00 a 5% pagava R$ 4.250,00 de uma vez no fim. Agora o saldo
    // é o valor presente das parcelas que faltam: o total pago é n × parcela, exato, e a dívida fecha no mês n.
    // Totais e saldos iniciais conferidos em Python (recorrência exata PV_k = (parcela + PV_k-1) ÷ (1 + i)).
    const casos: [string, string, string, number, number][] = [
      ['850,00', '480', '5', 1_700_000, 39_100_000],
      ['99,99', '480', '2,5', 399_957, 4_399_563],
      ['850,00', '360', '3', 2_833_266, 27_766_734],
      ['850,00', '96', '15', 566_666, 7_593_334],
      ['850,00', '240', '4', 2_124_826, 18_275_174],
    ];
    for (const [parcela, n, taxa, inicial, juros] of casos) {
      const r = run({ dividas: [parcelada(parcela, n, taxa)] });
      const base = scenario(r, 'sem_extra');
      const cents = Number(parcela.replace(',', ''));
      expect(r.debts[0]!.initialCents, `${n} × ${parcela} a ${taxa}%`).toBe(inicial);
      expect([base.months, base.firstMonth], `${n} × ${parcela} a ${taxa}%`).toEqual([Number(n), Number(n)]);
      expect(base.totalPaidCents, `${n} × ${parcela} a ${taxa}%`).toBe(cents * Number(n));
      expect(base.interestCents, `${n} × ${parcela} a ${taxa}%`).toBe(juros);
    }
  });

  it('a tabela do contrato: valor presente em forma fechada, igual a presentValueCents; o desvio dos juros é de cerca de 1 centavo por mês', () => {
    for (const [parcela, bp, n] of [[85_000, 500, 480], [9_999, 250, 480], [85_000, 300, 360], [85_000, 1_500, 96], [100, 9_999, 40], [12_345, 1, 200]] as const) {
      const table = installmentTable(parcela, bp, n);
      expect(table).toHaveLength(n + 1);
      expect(table[0]).toBe(0);
      for (const k of [1, 2, 7, Math.floor(n / 2), n - 1, n]) {
        expect(table[k], `${parcela} ${bp} k=${k}`).toBe(presentValueCents(parcela, bp, Array.from({ length: k }, (_, t) => t + 1)));
      }
      for (let k = 1; k <= n; k++) {
        // Juros do mês pela tabela = saldo depois + parcela - saldo antes; fica a menos de 1,5 centavo dos juros do saldo.
        expect(Math.abs(table[k - 1]! + parcela - table[k]! - (table[k]! * bp) / 10_000), `${parcela} ${bp} k=${k}`).toBeLessThan(1.5);
      }
    }
    expect(installmentTable(1_000, 0, 3)).toEqual([0, 1_000, 2_000, 3_000]);
  });

  it('parcelada com valor a mais: o valor a mais rende a taxa do contrato e a dívida fecha quando cobre o que falta (conferido em Python)', () => {
    // 480 × R$ 850,00 a 5% com R$ 100,00 a mais: fecha no mês 47, pagando R$ 43.838,00 (juros R$ 26.838,00).
    const one = run({ extra: '100,00', dividas: [parcelada('850,00', '480', '5')] });
    const com = scenario(one, 'com_extra');
    expect([com.months, com.totalPaidCents, com.interestCents]).toEqual([47, 4_383_800, 2_683_800]);
    expect(scenario(one, 'sem_extra').months).toBe(480);
    // Duas parceladas (360 × R$ 850,00 a 3% e 60 × R$ 400,00 a 12%), R$ 150,00 a mais: a menor termina no mês 12 e a maior no 44.
    const two = run({ extra: '150,00', dividas: [parcelada('850,00', '360', '3'), parcelada('400,00', '60', '12')] });
    expect(two.debts.map((d) => d.initialCents)).toEqual([2_833_266, 332_962]);
    expect(scenario(two, 'sem_extra').sequence.map((x) => [x.index, x.month])).toEqual([[1, 60], [0, 360]]);
    expect(scenario(two, 'sem_extra').totalPaidCents).toBe(33_000_000);
    for (const id of ['maior_taxa', 'menor_divida']) {
      const s = scenario(two, id);
      expect([s.months, s.totalPaidCents, s.interestCents]).toEqual([44, 6_027_898, 2_861_670]);
      expect(s.sequence.map((x) => [x.index, x.month])).toEqual([[1, 12], [0, 44]]);
      expect(s.totalPaidCents).toBe(two.initialSumCents + s.interestCents!);
    }
  });

  it('sem balão em muitas parceladas: sem valor a mais, o total pago é sempre n × parcela', () => {
    let seed = 777;
    const next = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return Math.floor(seed / 16) % n;
    };
    for (let k = 0; k < 60; k++) {
      const parcela = 100 + next(2_000_000);
      const n = k % 3 === 0 ? 480 : 1 + next(480);
      const bp = next(1_501);
      const r = run({ dividas: [parcelada(`${Math.floor(parcela / 100)},${String(parcela % 100).padStart(2, '0')}`, String(n), `${Math.floor(bp / 100)},${String(bp % 100).padStart(2, '0')}`)] });
      const base = scenario(r, 'sem_extra');
      expect([base.months, base.totalPaidCents], `${parcela} × ${n} a ${bp / 100}%`).toEqual([n, parcela * n]);
    }
  });

  it('nomes: apelido, "Dívida N" e a regra do número de cartão', () => {
    expect(planoDebtName('  Carro  ', 0)).toBe('Carro');
    expect(planoDebtName('', 2)).toBe('Dívida 3');
    expect(planoDebtName(undefined, 0)).toBe('Dívida 1');
    const r = run({ dividas: [parcelada('100,00', '3'), saldo('900,00', '5', '200,00', '  Cartão azul ')] });
    expect(r.debts.map((d) => d.name)).toEqual(['Dívida 1', 'Cartão azul']);
    expect(errors({ dividas: [parcelada('100,00', '3', '', 'a'.repeat(31))] })).toEqual({ 'apelido.0': 'longo' });
    expect(errors({ dividas: [parcelada('100,00', '3', '', 'a'.repeat(30))] })).toBeNull();
    expect(errors({ dividas: [parcelada('100,00', '3', '', '4111 1111 1111 1111')] })).toEqual({ 'apelido.0': 'invalido' });
    expect(errors({ dividas: [parcelada('100,00', '3', '', '4111111111111111')] })).toEqual({ 'apelido.0': 'invalido' });
    expect(errors({ dividas: [parcelada('100,00', '3', '', 'Conta 0001 12345678-9')] })).toBeNull();
    expect(calcErrorText('plano-dividas', 'apelido.0', 'invalido')).toBe('Não use o número do cartão no apelido. Use um nome, como Cartão azul.');
    expect(calcErrorText('plano-dividas', 'apelido.3', 'longo')).toBe('Use no máximo 30 caracteres.');
  });

  it('erros por campo, com a posição da dívida', () => {
    expect(errors({ dividas: [{ tipo: null }] })).toEqual({ 'tipo.0': 'vazio' });
    expect(errors({ dividas: [{ tipo: 'parcelada' }] })).toEqual({ 'parcela.0': 'vazio', 'restantes.0': 'vazio' });
    expect(errors({ dividas: [{ tipo: 'saldo' }] })).toEqual({ 'saldo.0': 'vazio', 'taxaSaldo.0': 'vazio', 'pagamento.0': 'vazio' });
    expect(errors({ dividas: [parcelada('0', '481', '100')] })).toEqual({ 'parcela.0': 'zero', 'restantes.0': 'fora_da_faixa', 'taxaParcelada.0': 'fora_da_faixa' });
    expect(errors({ dividas: [parcelada('10,00', '0')] })).toEqual({ 'restantes.0': 'fora_da_faixa' });
    expect(errors({ dividas: [saldo('100,00', '0', '10,00')] })).toEqual({ 'taxaSaldo.0': 'fora_da_faixa' });
    expect(errors({ dividas: [saldo('100,00', '1,999', '10,00')] })).toEqual({ 'taxaSaldo.0': 'casas_demais' });
    expect(errors({ dividas: [saldo('100,00', '5', '0')] })).toEqual({ 'pagamento.0': 'zero' });
    expect(errors({ dividas: [saldo('10.000.000,00', '5', '10,00')] })).toEqual({ 'saldo.0': 'acima_do_limite' });
    expect(errors({ extra: 'abc', dividas: [parcelada('10,00', '2')] })).toEqual({ extra: 'invalido' });
    expect(errors({ extra: '10.000.000,00', dividas: [parcelada('10,00', '2')] })).toEqual({ extra: 'acima_do_limite' });
    expect(errors({ extra: '9.999.999,99', dividas: [parcelada('10,00', '2')] })).toBeNull();
    // Os erros de dívidas diferentes são separados.
    expect(errors({ dividas: [parcelada('10,00', '2'), saldo('', '5', '10,00')] })).toEqual({ 'saldo.1': 'vazio' });
    expect(calcErrorText('plano-dividas', 'taxaParcelada.0', 'fora_da_faixa')).toBe('Use uma taxa de 0,00% a 99,99% ao mês, ou deixe em branco.');
    expect(calcErrorText('plano-dividas', 'taxaSaldo.2', 'fora_da_faixa')).toBe('Use uma taxa de 0,01% a 99,99% ao mês.');
    expect(calcErrorText('plano-dividas', 'tipo.1', 'vazio')).toBe('Escolha o tipo da dívida.');
  });

  it('valores extremos não perdem centavos (sem ponto flutuante)', () => {
    const r = run({ extra: '9.999.999,99', dividas: [saldo('9.999.999,99', '99,99', '9.999.999,99'), parcelada('9.999.999,99', '480', '99,99')] });
    expect(Number.isSafeInteger(r.initialSumCents)).toBe(true);
    for (const s of r.scenarios) {
      if (s.months === null) continue;
      expect(s.totalPaidCents).toBe(r.initialSumCents + s.interestCents!);
    }
  });

  it('nome do mês: o primeiro pagamento é no fim do mês seguinte; sem a data, só meses', () => {
    const dividas = [parcelada('100,00', '3', '', 'A')];
    expect(scenario(run({ dividas }, '2026-10-10'), 'sem_extra').endMonth).toBe('2027-01');
    expect(scenario(run({ dividas }, '2026-12-31'), 'sem_extra').endMonth).toBe('2027-03');
    expect(scenario(run({ dividas }), 'sem_extra').endMonth).toBeNull();
    expect(scenario(run({ dividas }), 'sem_extra').summary).toBe('Sem valor a mais: tudo termina em 3 meses.');
    expect(scenario(run({ dividas }, '2026-10-10'), 'sem_extra').summary).toBe('Sem valor a mais: tudo termina em 3 meses, em janeiro de 2027.');
    expect(scenario(run({ dividas }, '2026-10-10'), 'sem_extra').sequenceLines).toEqual(['1. A: termina em 3 meses (janeiro de 2027).']);
  });

  it('hipóteses e avisos fixos', () => {
    const r = run({ extra: '100,00', dividas: [parcelada('100,00', '3', '1'), saldo('900,00', '5', '200,00')] });
    expect(r.notes).toEqual([PLANO_ESTIMATE_TEXT]);
    expect(PLANO_ESTIMATE_TEXT).toBe('Estimativa. O valor oficial de cada dívida é o que a instituição informar; peça o valor atualizado.');
    expect(r.hypotheses).toEqual(
      expect.arrayContaining([
        'Taxas fixas, sem novas compras nem atrasos.',
        'Sem IOF nem tarifas.',
        'Pagamentos no fim de cada mês, a partir do mês seguinte.',
      ]),
    );
    expect(r.hypotheses).toContain(PLANO_TEXT.hypotheses.snowballWithExtra);
    expect(run({ dividas: [parcelada('100,00', '3'), saldo('900,00', '5', '200,00')] }).hypotheses).toContain(PLANO_TEXT.hypotheses.snowballNoExtra);
    expect(CALC_DISCLAIMER).toMatch(/^Simulação com os valores e as taxas que você informou\./);
  });
});

describe('textos do plano para quitar dívidas', () => {
  const FILE = readFileSync(join(fileURLToPath(new URL('../src/calculators/', import.meta.url)), 'plano-dividas.ts'), 'utf8');
  /** Palavras vetadas por D-035 e pela especificação do ciclo F1 (a regra completa está em copy.test.ts). */
  const VETOED =
    /\b(melhor(es)?|pior(es)?|dever[iíá]\w*|renegoci\w*|portabilidade|consignad\w*|refinanci\w*|saldo devedor|empr[eé]stimo para quitar|vale a pena|ruim|cuidado\w*|desperd[ií]cio|cortes?|atrasad[oa]s?|estour\w*|invista|caixinha)\b|faz(er|endo)?\s+sentido|[–—]/i;

  function allTexts(): string[] {
    const out: string[] = [];
    const dive = (v: unknown) => {
      if (typeof v === 'string') out.push(v);
      else if (Array.isArray(v)) v.forEach(dive);
      else if (v && typeof v === 'object') Object.values(v).forEach(dive);
      else if (typeof v === 'function') {
        const f = v as (...a: never[]) => unknown;
        for (const sample of [[0], ['Cartão', 8_000], [8_000]]) {
          try {
            const t = f(...(sample as never[]));
            if (typeof t === 'string') out.push(t);
          } catch {
            // amostra que não serve a esta função
          }
        }
      }
    };
    dive(PLANO_TEXT);
    dive(Object.values(PLANO_FIELDS));
    out.push(PLANO_ESTIMATE_TEXT);
    const inputs: PlanoInput[] = [
      { extra: '200,00', dividas: [saldo('2.000,00', '2', '60,00'), saldo('4.000,00', '5', '300,00')] },
      { dividas: [parcelada('100,00', '3'), saldo('900,00', '5', '200,00')] },
      { dividas: [saldo('1.000,00', '8', '50,00', 'Rotativo')] },
      { extra: '100,00', dividas: [parcelada('850,00', '36', '1,5')] },
      { dividas: [parcelada('850,00', '36', '1,5')] },
      { dividas: [saldo('100.000,00', '1', '1.000,01')] },
      { dividas: [saldo('100.000,00', '1', '1.000,01'), saldo('50.000,00', '1', '500,01')] },
    ];
    for (const today of [undefined, '2026-10-10']) {
      for (const input of inputs) {
        const r = run(input, today);
        out.push(...r.resultLines, ...r.hypotheses, ...r.notes, ...r.differences);
        for (const s of r.scenarios) out.push(s.title, s.summary, ...s.detailLines, ...s.sequenceLines);
      }
    }
    return out;
  }

  it('nenhum texto tem palavra vetada, travessão ou a expressão proibida; todos em português neutro', () => {
    const texts = allTexts();
    expect(texts.length).toBeGreaterThan(80);
    for (const text of texts) expect(text, text).not.toMatch(VETOED);
    for (const text of texts) expect(text, text).not.toMatch(/\b(o|a)s? usuári[oa]s?\b|\bobrigad[oa]s?\b/i);
  });

  it('o arquivo-fonte também não tem as palavras vetadas, nem em comentário', () => {
    expect(FILE).not.toMatch(VETOED);
  });

  it('as duas ordens têm nomes simétricos e nunca dizem qual é a certa', () => {
    expect(PLANO_TEXT.scenario.maior_taxa).toBe('Maior taxa primeiro');
    expect(PLANO_TEXT.scenario.menor_divida).toBe('Menor dívida primeiro');
    const r = run({ extra: '200,00', dividas: [saldo('2.000,00', '2', '60,00'), saldo('4.000,00', '5', '300,00')] });
    expect(r.differences.join(' ')).not.toMatch(/melhor|pior|certa|errada|escolha|use |faça/i);
  });
});

describe('dívidas lidas dos parcelamentos', () => {
  it('na demonstração: o Financiamento do carro (parcela 13 de 48, R$ 850,00), 36 parcelas', async () => {
    const repo = await createDemoRepository();
    const ctx = (await repo.getSpace())!.personalContextId;
    const series = await repo.listSeries(ctx);
    const items = await Promise.all(series.map(async (s) => ({ series: s, occurrences: await repo.listSeriesOccurrences(s.id), open: await repo.listOpenSeriesOccurrences(s.id) })));
    const drafts = seriesDebtDrafts(items, DEMO_TODAY);
    expect(drafts).toEqual([{ seriesId: series.find((s) => s.nature === 'financiamento')!.id, name: 'Financiamento do carro', parcelaCents: 85_000, restantes: 36 }]);
    const input = draftToInput(drafts[0]!);
    expect(input).toEqual({ tipo: 'parcelada', apelido: 'Financiamento do carro', parcela: '850,00', restantes: '36', taxaParcelada: '' });
    // Sem a taxa (que a pessoa digita), a conta já funciona: soma das parcelas.
    const r = run({ dividas: [input] }, DEMO_TODAY);
    expect(r.debts[0]!.initialCents).toBe(3_060_000);
  });

  it('compra parcelada e outro parcelamento entram; gasto fixo, conta do ano e parcelamento encerrado ficam de fora', async () => {
    const repo = await createDemoRepository();
    const ctx = (await repo.getSpace())!.personalContextId;
    const parcelamento = (description: string, nature: SeriesInput['nature'], total: number, first: number): SeriesInput => ({
      kind: 'parcelada',
      nature,
      description,
      category: null,
      amountCents: 12_000,
      amountMode: 'fixo',
      dueDay: 15,
      firstDueMonth: '2026-11',
      firstNumber: first,
      installmentTotal: total,
      partsPerYear: null,
      lastMonth: null,
    });
    await repo.createSeries(newOperationKey(), ctx, parcelamento('Geladeira', 'compra_parcelada', 10, 3));
    await repo.createSeries(newOperationKey(), ctx, parcelamento('Curso', 'outro_parcelamento', 6, 1));
    await repo.createSeries(newOperationKey(), ctx, parcelamento('4111 1111 1111 1111', 'compra_parcelada', 4, 1));
    const series = await repo.listSeries(ctx);
    const items = await Promise.all(series.map(async (s) => ({ series: s, occurrences: await repo.listSeriesOccurrences(s.id), open: await repo.listOpenSeriesOccurrences(s.id) })));
    const drafts = seriesDebtDrafts(items, DEMO_TODAY);
    expect(drafts.map((d) => [d.name, d.parcelaCents, d.restantes])).toEqual([
      ['Financiamento do carro', 85_000, 36],
      ['Geladeira', 12_000, 8],
      ['Curso', 12_000, 6],
      // Descrição que parece número de cartão não vira apelido.
      ['', 12_000, 4],
    ]);
    // Gasto fixo (Aluguel) e contas do ano (IPVA, IPTU) não entram.
    expect(drafts.some((d) => /Aluguel|IPVA|IPTU/.test(d.name))).toBe(false);
    // O limite de 10 dívidas vale.
    const car = items.find((i) => i.series.nature === 'financiamento')!;
    const many = Array.from({ length: 12 }, () => car);
    expect(seriesDebtDrafts(many, DEMO_TODAY)).toHaveLength(10);
    // Parcelamento já encerrado (nenhuma parcela a vencer): fora.
    const ended = { ...car, series: { ...car.series, lastNumber: car.series.firstNumber - 1 } };
    expect(seriesDebtDrafts([ended], DEMO_TODAY)).toEqual([]);
  });

  it('parcelas vencidas em aberto ficam fora: contam só as que vencem de hoje em diante; sem nenhuma a vencer, o parcelamento fica fora', async () => {
    // Hoje é 07/10/2026. "Vencida": 6 parcelas de 05/09 a 05/02; as de 05/09 e 05/10 já venceram e seguem em aberto.
    // "Acabou": 2 parcelas, 05/09 e 05/10, as duas vencidas e em aberto (a série ainda não está encerrada pelo mês).
    const repo = await createDemoRepository();
    const ctx = (await repo.getSpace())!.personalContextId;
    const parcelamento = (description: string, total: number): SeriesInput => ({
      kind: 'parcelada',
      nature: 'compra_parcelada',
      description,
      category: null,
      amountCents: 12_000,
      amountMode: 'fixo',
      dueDay: 5,
      firstDueMonth: '2026-09',
      firstNumber: 1,
      installmentTotal: total,
      partsPerYear: null,
      lastMonth: null,
    });
    await repo.createSeries(newOperationKey(), ctx, parcelamento('Vencida', 6));
    await repo.createSeries(newOperationKey(), ctx, parcelamento('Acabou', 2));
    const series = await repo.listSeries(ctx);
    const items = await Promise.all(series.map(async (s) => ({ series: s, occurrences: await repo.listSeriesOccurrences(s.id), open: await repo.listOpenSeriesOccurrences(s.id) })));
    const overdue = items.find((i) => i.series.id === series.find((s) => s.terms[0]?.description === 'Acabou')!.id)!;
    expect(overdue.open.map((c) => c.dueOn)).toEqual(['2026-09-05', '2026-10-05']);
    const drafts = seriesDebtDrafts(items, DEMO_TODAY);
    expect(drafts.map((d) => [d.name, d.parcelaCents, d.restantes])).toEqual([
      ['Financiamento do carro', 85_000, 36],
      // 6 parcelas, 2 vencidas e em aberto: ficam as 4 que vencem de hoje em diante.
      ['Vencida', 12_000, 4],
    ]);
    // As hipóteses dizem que as vencidas ficam fora.
    expect(PLANO_TEXT.hypotheses.overdueOut).toBe('Dos seus parcelamentos, entram só as parcelas que vencem de hoje em diante; as já vencidas e em aberto ficam fora desta conta.');
  });

  it('o link da calculadora não leva nenhum campo (a taxa nunca vem no link)', () => {
    expect(calcLinkParams('plano-dividas', {})).toEqual({});
    expect(calcLinkParams('plano-dividas', { origem: 'renda' })).toEqual({ origem: 'renda' });
    expect(calcPrefill('plano-dividas', { origem: 'renda', taxa: '5', valor: '1000', parcela: '5000' })).toEqual({ origem: 'renda' });
    expect(calcPrefill('plano-dividas', {})).toEqual({});
  });
});
