import { describe, expect, it } from 'vitest';
import {
  ANNUAL_LEAD_MONTHS,
  ANNUAL_SERIES_ERROR_TEXT,
  DEMO_TODAY,
  MemoryRepository,
  PARTS_PER_YEAR_MAX,
  SERIES_ERROR_TEXT,
  SERIES_FIELD_ORDER,
  addMonths,
  affectedByEditFrom,
  affectedByEnd,
  affectedByYear,
  annualLastMonth,
  annualLastYearHint,
  annualStartChoices,
  annualYearErrorText,
  annualYearLabel,
  annualYearLabelOf,
  annualYearOf,
  annualYearRange,
  annualYearSummary,
  createDemoRepository,
  currentTerm,
  editFromMaxNumber,
  fieldForErrorCode,
  findSeriesConflicts,
  firstMonthBounds,
  firstMonthRangeText,
  generationWindow,
  groupAnnualLater,
  lastNumberFromEndMonth,
  lastNumberFromEndYear,
  mergeOccurrences,
  missingMonths,
  monthsBetween,
  newOperationKey,
  numberAtOrAfter,
  numberAtOrBefore,
  numberOfMonth,
  occurrenceLabel,
  occurrencesToMaterialize,
  projectSeries,
  seriesCaption,
  seriesCountsTowardLimit,
  seriesDueOn,
  seriesEnded,
  seriesErrorText,
  seriesInputError,
  seriesMonthOf,
  seriesMonthlyTotal,
  seriesPreview,
  seriesYearlyTotal,
  suggestedAnnualReference,
  summarizeMonth,
  summarizeToPay,
  termFor,
  termHistory,
  validateSeriesDraft,
  wholeYearPayment,
  type AmountMode,
  type Commitment,
  type CommitmentSeries,
  type SeriesDraft,
  type SeriesErrorCode,
  type SeriesInput,
  type SeriesKind,
  type SeriesTerm,
} from '../src';

/**
 * Ciclo A3 · Contas do ano (D-029): série anual com k parcelas por ano (1 = cota única), em meses seguidos,
 * numeração contínua entre os anos; o ano inteiro entra em Contas a pagar dois meses antes. Dados fictícios.
 */

const CREATED_AT = '2026-10-01T12:00:00.000Z';

/** Conta do ano de exemplo (padrão: IPTU, 10 parcelas de R$ 180,00 estimadas, de fevereiro a novembro, dia 10, desde 2027). */
const anual = (over: Partial<CommitmentSeries> = {}, termOver: Partial<SeriesTerm> = {}): CommitmentSeries => ({
  id: 'iptu',
  contextId: 'ctx',
  kind: 'anual',
  nature: 'conta',
  firstDueMonth: '2027-02',
  firstNumber: 1,
  lastNumber: null,
  installmentTotal: null,
  partsPerYear: 10,
  currency: 'BRL',
  terms: [
    { fromNumber: over.firstNumber ?? 1, description: 'IPTU', category: 'Moradia', amountCents: 18000, amountMode: 'variavel', dueDay: 10, ...termOver },
  ],
  skippedNumbers: [],
  paidCount: 0,
  openCount: 0,
  generating: true,
  createdBy: 'pessoa',
  version: 1,
  createdAt: CREATED_AT,
  updatedAt: CREATED_AT,
  ...over,
});
const ipva = (over: Partial<CommitmentSeries> = {}) =>
  anual({ id: 'ipva', firstDueMonth: '2027-01', partsPerYear: 1, ...over }, { description: 'IPVA', category: 'Transporte', amountCents: 240000, dueDay: 20 });
const matricula = (over: Partial<CommitmentSeries> = {}) =>
  anual(
    { id: 'matricula', firstDueMonth: '2026-12', partsPerYear: 1, ...over },
    { description: 'Matrícula', category: 'Educação', amountCents: 120000, amountMode: 'fixo', dueDay: 10 },
  );
const seguro = (over: Partial<CommitmentSeries> = {}) =>
  anual({ id: 'seguro', firstDueMonth: '2026-11', partsPerYear: 4, ...over }, { description: 'Seguro residencial', amountCents: 12000, dueDay: 31 });

/** Ocorrência n da série, com a vigência dela. */
const occ = (s: CommitmentSeries, n: number, over: Partial<Commitment> = {}): Commitment => {
  const t = termFor(s.terms, n)!;
  return {
    id: `${s.id}-${n}`,
    contextId: s.contextId,
    description: t.description,
    amountCents: t.amountCents,
    currency: 'BRL',
    dueOn: seriesDueOn(s, n),
    category: t.category,
    status: 'aberto',
    payment: null,
    series: { id: s.id, number: n, kind: s.kind, nature: s.nature, installmentTotal: s.installmentTotal, partsPerYear: s.partsPerYear },
    seriesOverride: false,
    invoice: null,
    amountIsEstimate: t.amountMode === 'variavel',
    createdBy: 'pessoa',
    version: 1,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    ...over,
  };
};
const paidOcc = (s: CommitmentSeries, n: number, amountCents: number, paidOn: string, over: Partial<Commitment> = {}) =>
  occ(s, n, { status: 'quitado', payment: { recordId: `reg-${s.id}-${n}`, amountCents, paidOn, accountId: 'conta-1' }, ...over });
const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const numbers = (xs: readonly { number: number }[]) => xs.map((x) => x.number);
const seriesNumbers = (xs: readonly Commitment[]) => xs.map((c) => c.series!.number);
const dues = (s: CommitmentSeries, ns: number[]) => ns.map((n) => seriesDueOn(s, n));

describe('contas do ano: mês, vencimento e numeração (1.3)', () => {
  it('vetores: IPVA, IPTU, IPTU começado em 2026, seguro de 4 parcelas e 29/02', () => {
    expect(dues(ipva(), [1, 2, 50])).toEqual(['2027-01-20', '2028-01-20', '2076-01-20']);
    expect(dues(anual(), [1, 10, 11, 21])).toEqual(['2027-02-10', '2027-11-10', '2028-02-10', '2029-02-10']);
    // IPTU de 2026 com as parcelas 1 a 8 pagas antes do Clarevo.
    const started = anual({ firstDueMonth: '2026-10', firstNumber: 9 });
    expect(dues(started, [9, 10, 11, 20])).toEqual(['2026-10-10', '2026-11-10', '2027-02-10', '2027-11-10']);
    expect(dues(seguro(), [1, 2, 3, 4, 5])).toEqual(['2026-11-30', '2026-12-31', '2027-01-31', '2027-02-28', '2027-11-30']);
    expect(annualYearOf(seguro(), 5).label).toBe('2027/2028');
    expect(annualYearOf(seguro(), 1)).toEqual({
      index: 0,
      part: 1,
      firstNumber: 1,
      lastNumber: 4,
      firstMonth: '2026-11',
      lastMonth: '2027-02',
      label: '2026/2027',
    });
    const leap = anual({ id: 'x', firstDueMonth: '2028-02', partsPerYear: 1 }, { dueDay: 29 });
    expect(dues(leap, [1, 2])).toEqual(['2028-02-29', '2029-02-28']);
  });

  it('n = 0 (encerrada sem conta) cai no último mês do ano anterior; numberOfMonth, numberAtOrAfter e numberAtOrBefore', () => {
    expect(seriesMonthOf(anual(), 0)).toBe('2026-11');
    expect(seriesMonthOf(ipva(), 0)).toBe('2026-01');
    expect(seriesMonthOf(anual({ firstDueMonth: '2026-10', firstNumber: 9 }), 0)).toBe('2025-11');
    const s = anual();
    expect([numberAtOrAfter(s, '2027-12'), numberAtOrBefore(s, '2027-12')]).toEqual([11, 10]);
    expect([numberAtOrAfter(s, '2027-01'), numberAtOrBefore(s, '2027-01')]).toEqual([1, 0]);
    expect([numberAtOrAfter(s, '2027-05'), numberAtOrBefore(s, '2027-05')]).toEqual([4, 4]);
    expect([numberOfMonth(s, '2027-05'), numberOfMonth(s, '2027-12'), numberOfMonth(s, '2028-11')]).toEqual([4, null, 20]);
    // Mensal e parcelada: os três dão o número do mês.
    const mensal: CommitmentSeries = { ...anual(), kind: 'mensal', partsPerYear: null, firstDueMonth: '2026-10' };
    expect([numberOfMonth(mensal, '2027-01'), numberAtOrAfter(mensal, '2027-01'), numberAtOrBefore(mensal, '2027-01')]).toEqual([4, 4, 4]);
    // Encerrar num mês sem parcela: a última antes dele.
    expect(lastNumberFromEndMonth(s, '2028-12')).toBe(20);
    expect(lastNumberFromEndYear(s, 2029)).toBe(30);
    expect(lastNumberFromEndYear(ipva(), 2028)).toBe(2);
    expect(lastNumberFromEndYear(seguro(), 2027)).toBe(8); // ano "2027/2028"
    expect(annualLastMonth({ firstDueMonth: '2027-02', firstNumber: 1, partsPerYear: 10 }, 2029)).toBe('2029-11');
    expect(annualLastMonth({ firstDueMonth: '2026-10', firstNumber: 9, partsPerYear: 10 }, 2026)).toBe('2026-11');
    // Dado corrompido (sem parcelas por ano) nunca vira mensal.
    expect(() => seriesMonthOf({ ...anual(), partsPerYear: null }, 1)).toThrow('serie_inconsistente');
    expect(() => seriesMonthOf({ ...anual(), partsPerYear: 13 }, 1)).toThrow('serie_inconsistente');
  });

  it('rótulos, legendas e histórico em anos', () => {
    expect(occurrenceLabel(occ(ipva(), 1))).toBe('Conta do ano de 2027');
    expect(occurrenceLabel(occ(anual(), 13))).toBe('Parcela 3 de 10 de 2028');
    expect(occurrenceLabel(occ(seguro(), 2))).toBe('Parcela 2 de 4 de 2026/2027');
    expect(occurrenceLabel({ series: occ(ipva(), 1).series })).toBe('Conta do ano');
    expect(annualYearLabelOf(occ(seguro(), 4))).toBe('2026/2027');
    expect(annualYearLabelOf({ ...occ(ipva(), 1), series: null })).toBeNull();
    expect(annualYearLabel(anual(), 1)).toBe('2028');

    expect(seriesCaption(ipva(), DEMO_TODAY)).toBe('Todo ano em 20/01 · desde 2027');
    expect(seriesCaption(anual(), DEMO_TODAY)).toBe('Todo ano, 10 parcelas de fevereiro a novembro, dia\u00a010 · desde 2027');
    expect(seriesCaption(seguro(), DEMO_TODAY)).toBe('Todo ano, 4 parcelas de novembro a fevereiro, dia\u00a031 · desde 2026/2027');
    expect(seriesCaption(anual({ lastNumber: 30 }))).toBe('Todo ano, 10 parcelas de fevereiro a novembro, dia\u00a010 · de 2027 a 2029');
    expect(seriesCaption(matricula({ lastNumber: 1 }))).toBe('Todo ano em 10/12 · em 2026');
    expect(seriesCaption(ipva({ lastNumber: 0 }))).toBe('Todo ano em 20/01 · encerrada antes da primeira conta');

    expect(termHistory(anual()).map((h) => h.text)).toEqual(['R$ 180,00 por parcela (estimado) a partir de 2027']);
    const reference = ipva({ terms: [...ipva().terms, { ...ipva().terms[0]!, fromNumber: 2, amountCents: 251230 }] });
    expect(termHistory(reference).map((h) => h.text)).toEqual(['R$ 2.400,00 (estimado) em 2027', 'R$ 2.512,30 (estimado) a partir de 2028']);
    const midYear = anual({ terms: [...anual().terms, { ...anual().terms[0]!, fromNumber: 13, amountCents: 19000, amountMode: 'fixo' }] });
    expect(termHistory(midYear).map((h) => h.text)).toEqual([
      'R$ 180,00 por parcela (estimado) de 2027 à parcela 2 de 2028',
      'R$ 190,00 por parcela a partir da parcela 3 de 2028',
    ]);
    expect(termHistory({ ...midYear, lastNumber: 10 }).map((h) => h.text)).toEqual(['R$ 180,00 por parcela (estimado) em 2027']);
    // A vigência atual é a da próxima parcela a partir deste mês.
    expect(currentTerm(reference, '2027-01-15').amountCents).toBe(240000);
    expect(currentTerm(reference, '2027-02-10').amountCents).toBe(251230);
  });

  it('encerrada, limite de 100 e S10 em datas variadas', () => {
    expect(seriesEnded(ipva({ lastNumber: 2 }), '2028-01-31')).toBe(false);
    expect(seriesEnded(ipva({ lastNumber: 2 }), '2028-02-01')).toBe(true);
    expect(seriesEnded(ipva({ lastNumber: 0 }), DEMO_TODAY)).toBe(true);
    expect(seriesCountsTowardLimit(ipva({ lastNumber: 0 }), DEMO_TODAY)).toBe(false); // mês da "parcela 0": janeiro de 2026
    expect(seriesCountsTowardLimit(matricula({ lastNumber: 1 }), DEMO_TODAY)).toBe(true);
    // S10: nenhuma conta criada vence depois do fim do 13º mês após o mês de hoje, para todo k, mês e dia.
    let worst = -Infinity;
    for (let k = 1; k <= PARTS_PER_YEAR_MAX; k++) {
      for (let m = 0; m < 12; m++) {
        const s = anual({ id: `s${k}-${m}`, partsPerYear: k, firstDueMonth: addMonths('2026-09', m) }, { dueDay: 31 });
        for (let t = 0; t < 30; t++) {
          const month = addMonths('2026-10', t);
          for (const o of occurrencesToMaterialize(s, [], `${month}-15`)) worst = Math.max(worst, monthsBetween(month, o.month));
        }
      }
    }
    expect(worst).toBe(13);
  });
});

describe('contas do ano: geração e antecedência (1.3)', () => {
  const at = (s: CommitmentSeries, today: string, existing: Commitment[] = []) => numbers(occurrencesToMaterialize(s, existing, today));

  it('tabela de geração: IPVA, IPTU e Matrícula', () => {
    expect(generationWindow(DEMO_TODAY).annualTop).toBe(addMonths('2026-10', ANNUAL_LEAD_MONTHS));
    // 07/10/2026 e 31/10/2026
    for (const today of ['2026-10-07', '2026-10-31']) {
      expect([at(ipva(), today), at(anual(), today), at(matricula(), today)]).toEqual([[], [], [1]]);
    }
    expect(at(matricula(), '2026-10-31', [occ(matricula(), 1)])).toEqual([]);
    // 01/11/2026: entra o IPVA de 2027 (dois meses antes); o IPTU ainda não.
    expect([at(ipva(), '2026-11-01'), at(anual(), '2026-11-01')]).toEqual([[1], []]);
    expect(occurrencesToMaterialize(ipva(), [], '2026-11-01')).toEqual([
      { number: 1, month: '2027-01', dueOn: '2027-01-20', description: 'IPVA', category: 'Transporte', amountCents: 240000, amountIsEstimate: true },
    ]);
    // 01/12/2026: as 10 parcelas do IPTU de 2027 de uma vez.
    expect(at(anual(), '2026-12-01')).toEqual(range(1, 10));
    expect(at(ipva(), '2026-12-01', [occ(ipva(), 1)])).toEqual([]);
    // 01/12/2027 com n1 a n10 vivas: n11 a n20; sem nenhuma criada antes: n10 (vencida) e n11 a n20.
    const s = anual();
    expect(at(s, '2027-12-01', range(1, 10).map((n) => occ(s, n)))).toEqual(range(11, 20));
    expect(at(s, '2027-12-01')).toEqual(range(10, 20));
    // IPVA de 2028 entra em 01/11/2027; a Matrícula de 2027 também.
    expect([at(ipva(), '2027-11-01', [occ(ipva(), 1)]), at(matricula(), '2027-11-01', [occ(matricula(), 1)])]).toEqual([[2], [2]]);
    // Com uma parcela no ano, a conta entra de 59 a 91 dias antes de vencer.
    expect(at(ipva({ firstDueMonth: '2027-03' }), '2027-01-01')).toEqual([1]);
    expect(at(ipva({ firstDueMonth: '2027-03' }), '2026-12-31')).toEqual([]);
  });

  it('ausência longa: IPTU criado em 07/10/2026, aberto de novo em 15/06/2028 (7 contas, 2 vencidas)', () => {
    const s = anual();
    const created = occurrencesToMaterialize(s, [], '2028-06-15');
    expect(numbers(created)).toEqual(range(14, 20));
    expect(created.filter((o) => o.dueOn < '2028-06-15').map((o) => o.dueOn)).toEqual(['2028-05-10', '2028-06-10']);
    const live = created.map((o) => occ(s, o.number));
    expect(occurrencesToMaterialize(s, live, '2028-06-15')).toEqual([]);
    // No máximo dois anos (2·k números) por chamada.
    expect(occurrencesToMaterialize(anual({ partsPerYear: 12, firstDueMonth: '2026-10', firstNumber: 10 }), [], '2026-11-02').length).toBeLessThanOrEqual(24);
  });

  it('pulados, término, generating e projectSeries', () => {
    const s = anual({ skippedNumbers: range(2, 10) });
    expect(at(s, '2026-12-01')).toEqual([1]);
    expect(at(anual({ lastNumber: 5 }), '2026-12-01')).toEqual(range(1, 5));
    expect(at(anual({ generating: false }), '2026-12-01')).toEqual([]);
    // Previsão: só além da maior viva, sem pulados.
    const projected = projectSeries(anual({ skippedNumbers: [12] }), [occ(anual(), 10)], '2027-12', '2028-04');
    expect(projected.map((o) => [o.number, o.dueOn])).toEqual([
      [11, '2028-02-10'],
      [13, '2028-04-10'],
    ]);
    expect(numbers(projectSeries(ipva(), [], '2027-02', '2029-12'))).toEqual([2, 3]);
  });
});

describe('contas do ano: cadastro (validação na ordem do banco)', () => {
  const draft = (over: Partial<SeriesDraft> = {}): SeriesDraft => ({
    kind: 'anual',
    nature: null,
    description: ' IPTU ',
    amountText: '180,00',
    amountMode: 'variavel',
    dueDayText: '10',
    firstMonthText: '02/2027',
    firstNumberText: '',
    installmentTotalText: '',
    partsPerYearText: '10',
    lastMonthText: '',
    category: 'Moradia',
    ...over,
  });
  const codeOf = (d: SeriesDraft, today = DEMO_TODAY) => {
    const v = validateSeriesDraft(d, today);
    return v.ok ? null : v.code;
  };
  const input = (over: Partial<SeriesInput> = {}): SeriesInput => ({
    kind: 'anual',
    nature: 'conta',
    description: 'IPTU',
    category: 'Moradia',
    amountCents: 18000,
    amountMode: 'variavel',
    dueDay: 10,
    firstDueMonth: '2027-02',
    firstNumber: 1,
    installmentTotal: null,
    partsPerYear: 10,
    lastMonth: null,
    ...over,
  });
  const err = (over: Partial<SeriesInput>) => seriesInputError(input(over), DEMO_TODAY);

  it('aceita e normaliza; "Último ano" vira o mês da última parcela desse ano', () => {
    expect(validateSeriesDraft(draft({ nature: 'financiamento', installmentTotalText: '9' }), DEMO_TODAY)).toEqual({ ok: true, input: input() });
    const ended = validateSeriesDraft(draft({ lastMonthText: ' 2029 ' }), DEMO_TODAY);
    expect(ended.ok && ended.input.lastMonth).toBe('2029-11');
    const started = validateSeriesDraft(draft({ firstMonthText: '10/2026', firstNumberText: '9', lastMonthText: '2026' }), DEMO_TODAY);
    expect(started.ok && started.input).toMatchObject({ firstDueMonth: '2026-10', firstNumber: 9, lastMonth: '2026-11' });
    const once = validateSeriesDraft(draft({ partsPerYearText: '1', firstMonthText: '01/2027' }), DEMO_TODAY);
    expect(once.ok && once.input).toMatchObject({ partsPerYear: 1, firstNumber: 1 });
    // Fora da conta do ano, partsPerYearText é ignorado e partsPerYear é nulo.
    const mensal = validateSeriesDraft(draft({ kind: 'mensal', partsPerYearText: '3', firstMonthText: '10/2026', lastMonthText: '' }), DEMO_TODAY);
    expect(mensal.ok && mensal.input).toMatchObject({ kind: 'mensal', partsPerYear: null });
    expect(seriesInputError(input(), DEMO_TODAY)).toBeNull();
    expect(err({ lastMonth: '2029-11' })).toBeNull();
  });

  it('códigos anuais na ordem do banco (clarevo_validate_series)', () => {
    expect(codeOf(draft({ kind: 'semanal' as SeriesKind }))).toBe('tipo_invalido');
    expect(err({ nature: 'financiamento' })).toBe('natureza_invalida');
    for (const k of ['0', '13', '', '1,5']) expect(codeOf(draft({ partsPerYearText: k }))).toBe('parcelas_no_ano_invalidas');
    for (const k of [0, 13, null]) expect(err({ partsPerYear: k })).toBe('parcelas_no_ano_invalidas');
    expect(seriesInputError({ ...input(), kind: 'mensal', firstDueMonth: '2026-10', partsPerYear: 1 }, DEMO_TODAY)).toBe('parcelas_no_ano_invalidas');
    expect(err({ partsPerYear: undefined as unknown as null })).toBe('parcelas_no_ano_invalidas');
    expect(codeOf(draft({ firstNumberText: '11' }))).toBe('parcela_inicial_invalida');
    expect(err({ firstNumber: 11 })).toBe('parcela_inicial_invalida');
    expect(err({ firstNumber: 0 })).toBe('parcela_inicial_invalida');
    // Primeiro vencimento: do mês passado a 23 meses à frente.
    expect(codeOf(draft({ firstMonthText: '10/2028' }))).toBe('inicio_fora_do_intervalo');
    expect(codeOf(draft({ firstMonthText: '09/2028' }))).toBeNull();
    expect(codeOf(draft({ firstMonthText: '08/2026', firstNumberText: '7' }))).toBe('inicio_fora_do_intervalo');
    expect(codeOf(draft({ firstMonthText: '09/2026', firstNumberText: '8' }))).toBeNull();
    expect(firstMonthBounds(DEMO_TODAY, 'anual')).toEqual({ min: '2026-09', max: '2028-09' });
    expect(firstMonthBounds(DEMO_TODAY)).toEqual({ min: '2026-09', max: '2027-10' });
    // Último mês: o da última parcela de um ano, de 0 a 49 anos depois.
    expect(err({ lastMonth: '2029-10' })).toBe('fim_invalido');
    expect(err({ lastMonth: '2026-11' })).toBe('fim_invalido');
    expect(err({ lastMonth: '2076-11' })).toBeNull();
    expect(err({ lastMonth: '2077-11' })).toBe('fim_invalido');
    expect(codeOf(draft({ lastMonthText: '2026' }))).toBe('fim_invalido');
    expect(codeOf(draft({ lastMonthText: '2076' }))).toBeNull();
    expect(codeOf(draft({ lastMonthText: '2077' }))).toBe('fim_invalido');
    expect(codeOf(draft({ lastMonthText: '11/2029' }))).toBe('fim_invalido');

    // Uma correção por vez, na ordem do banco.
    const steps: [Partial<SeriesDraft>, SeriesErrorCode | null][] = [
      [{}, 'valor_invalido'],
      [{ amountText: '180' }, 'descricao_obrigatoria'],
      [{ description: 'IPTU' }, 'dia_invalido'],
      [{ dueDayText: '10' }, 'inicio_fora_do_intervalo'],
      [{ firstMonthText: '02/2027' }, 'parcelas_no_ano_invalidas'],
      [{ partsPerYearText: '10' }, 'parcela_inicial_invalida'],
      [{ firstNumberText: '1' }, 'fim_invalido'],
      [{ lastMonthText: '2029' }, null],
    ];
    let d = draft({ amountText: '0', description: '', dueDayText: '32', firstMonthText: '01/2030', partsPerYearText: '0', firstNumberText: '13', lastMonthText: 'x' });
    const all = validateSeriesDraft(d, DEMO_TODAY);
    expect(all.ok ? null : Object.keys(all.errors).sort()).toEqual(
      ['amountText', 'description', 'dueDayText', 'firstMonthText', 'firstNumberText', 'lastMonthText', 'partsPerYearText'].sort(),
    );
    expect(all.ok ? null : all.errors).toMatchObject({
      description: 'Dê um nome para esta conta do ano.',
      firstMonthText: 'Escolha um primeiro vencimento entre setembro de 2026 e setembro de 2028.',
      partsPerYearText: 'Informe de 2 a 12 parcelas por ano.',
      lastMonthText: 'O último ano precisa ser igual ou depois do primeiro, em até 50 anos.',
    });
    for (const [fix, code] of steps) {
      d = { ...d, ...fix };
      expect(codeOf(d)).toBe(code);
    }
  });

  it('campos, textos e variantes anuais', () => {
    expect(SERIES_FIELD_ORDER.indexOf('partsPerYearText')).toBe(SERIES_FIELD_ORDER.indexOf('installmentTotalText') + 1);
    expect(fieldForErrorCode('parcelas_no_ano_invalidas', 'series')).toBe('partsPerYearText');
    expect(firstMonthRangeText(DEMO_TODAY, 'anual')).toBe('Escolha um primeiro vencimento entre setembro de 2026 e setembro de 2028.');
    expect(seriesErrorText('inicio_fora_do_intervalo', DEMO_TODAY, 'anual')).toBe(firstMonthRangeText(DEMO_TODAY, 'anual'));
    expect(seriesErrorText('fim_invalido', DEMO_TODAY, 'anual')).toBe('O último ano precisa ser igual ou depois do primeiro, em até 50 anos.');
    expect(seriesErrorText('fim_invalido', DEMO_TODAY)).toBe(SERIES_ERROR_TEXT.fim_invalido);
    expect(seriesErrorText('numero_fora_da_serie', DEMO_TODAY, 'anual')).toBe('Este ano está fora do período da conta do ano.');
    expect(seriesErrorText('serie_tem_pagamentos', DEMO_TODAY, 'anual')).toBe(
      'Esta conta do ano já tem conta paga. Para parar a repetição, use Encerrar.',
    );
    expect(seriesErrorText('serie_tem_pagamento_posterior', DEMO_TODAY, 'anual')).toBe(
      'Há conta paga depois do ano escolhido. Desfaça esse pagamento ou escolha um ano depois dele.',
    );
    expect(seriesErrorText('limite_de_gastos_fixos', DEMO_TODAY, 'anual')).toBe(
      'Você chegou a 100 contas que se repetem (gastos fixos, parcelamentos e contas do ano). Encerre alguma para adicionar outra.',
    );
    expect(seriesErrorText('parcelas_no_ano_invalidas', DEMO_TODAY)).toBe('Informe de 2 a 12 parcelas por ano.');
    expect(seriesErrorText('codigo_novo', DEMO_TODAY, 'anual')).toBe(SERIES_ERROR_TEXT.salvar_falhou);
    expect(ANNUAL_SERIES_ERROR_TEXT.vencimento_fora_do_mes).toBe(
      'Numa conta do ano, o vencimento fica no mesmo mês. Para mudar o dia de todos os anos, edite a conta do ano.',
    );
    expect(annualYearErrorText('versao_desatualizada', '2027')).toBe('Algo mudou nas contas de 2027 em outro aparelho. Confira e tente de novo.');
    expect(annualYearErrorText('numero_fora_da_serie', '2027')).toBe('Este ano está fora do período da conta do ano.');
    expect(annualYearErrorText('tipo_invalido', '2027')).toBe(SERIES_ERROR_TEXT.salvar_falhou);
  });

  it('prévias da seção 1.7: cota única, parcelas e já entra', () => {
    const p = seriesPreview(input({ description: 'IPVA', category: 'Transporte', amountCents: 240000, dueDay: 20, firstDueMonth: '2027-01', partsPerYear: 1 }), DEMO_TODAY);
    expect(p.text).toBe(
      'IPVA · cerca de R$ 2.400,00 (estimado) · todo ano em 20/01 · a partir de 2027. ' +
        'A conta de 2027 entra em Contas a pagar em novembro de 2026, dois meses antes de vencer, e só entra em Ainda a pagar em janeiro.',
    );
    expect(p.savedText).toBe('Conta do ano salva. A conta de 2027 entra em Contas a pagar em novembro de 2026.');
    expect([p.next[0]!.dueOn, p.createdNow, p.lines[0]]).toEqual(['2027-01-20', [], '20/01/2027 · cerca de R$ 2.400,00 (estimado)']);

    const iptu = seriesPreview(input(), DEMO_TODAY);
    expect(iptu.text).toBe(
      'IPTU · 10 parcelas de cerca de R$ 180,00 (estimado) · todo dia 10, de fevereiro a novembro · a partir de 2027. ' +
        'Cerca de R$ 1.800,00 por ano. As 10 parcelas de 2027 entram em Contas a pagar em dezembro de 2026; ' +
        'cada uma só entra em Ainda a pagar no mês em que vence.',
    );
    expect(iptu.savedText).toBe('Conta do ano salva. As 10 parcelas de 2027 entram em Contas a pagar em dezembro de 2026.');

    const m = seriesPreview(
      input({ description: 'Matrícula', category: 'Educação', amountCents: 120000, amountMode: 'fixo', firstDueMonth: '2026-12', partsPerYear: 1 }),
      DEMO_TODAY,
    );
    expect(m.text).toBe('Matrícula · R$ 1.200,00 · todo ano em 10/12 · a partir de 2026. A conta de 2026 já entra em Contas a pagar, em Próximos meses.');
    expect(m.savedText).toBe('Conta do ano salva. A conta de 2026 já está em Contas a pagar.');
    expect(numbers(m.createdNow)).toEqual([1]);

    // Ano começado (parcelas 9 e 10 de 2026), com término e valor fixo.
    const started = seriesPreview(input({ amountMode: 'fixo', firstDueMonth: '2026-10', firstNumber: 9, lastMonth: '2027-11' }), DEMO_TODAY);
    expect(started.text).toBe(
      'IPTU · 10 parcelas de R$ 180,00 · todo dia 10, de fevereiro a novembro · de 2026 a 2027. R$ 1.800,00 por ano. ' +
        'As 2 parcelas de 2026 já entram em Contas a pagar; cada uma só entra em Ainda a pagar no mês em que vence.',
    );
    expect([started.count, started.totalCents, started.lastDueOn, started.lastMonth]).toEqual([12, 216000, '2027-11-10', '2027-11']);
    // Dois anos de uma vez (12 parcelas a partir de outubro, hoje em novembro): os dois rótulos.
    const twoYears = seriesPreview(input({ partsPerYear: 12, firstDueMonth: '2026-10', firstNumber: 10, dueDay: 5 }), '2026-11-02');
    expect(twoYears.text).toContain('As parcelas de 2026 e 2027 já entram em Contas a pagar');
    expect(twoYears.savedText).toBe('Conta do ano salva. As parcelas de 2026 e 2027 já estão em Contas a pagar.');
    // Mensal e parcelada: sem savedText.
    expect(seriesPreview({ ...input(), kind: 'mensal', partsPerYear: null, firstDueMonth: '2026-10' }, DEMO_TODAY).savedText).toBeNull();
  });

  it('"Último ano" de conta do ano que atravessa dezembro: o ano da primeira parcela, com dica e erro que dizem isso', () => {
    expect(annualLastYearHint(4, 11, 2026)).toBe('Digite o ano em que começa o último período, como 2026 para 2026/2027.');
    expect(annualLastYearHint(4, 11, 2026, ' 2027 ')).toBe('Digite o ano em que começa o último período, como 2027 para 2027/2028.');
    expect(annualLastYearHint(4, 11, 2026, '2075')).toBe('Digite o ano em que começa o último período, como 2075 para 2075/2076.');
    for (const typed of ['2025', '2076', '20', '', 'abcd']) {
      expect(annualLastYearHint(4, 11, 2026, typed)).toBe('Digite o ano em que começa o último período, como 2026 para 2026/2027.');
    }
    expect(annualLastYearHint(2, 12, 2027)).toBe('Digite o ano em que começa o último período, como 2027 para 2027/2028.');
    // Sem ambiguidade (cota única, fevereiro a novembro, janeiro a dezembro, novembro e dezembro) ou números inválidos: null.
    for (const [k, month] of [[1, 12], [10, 2], [12, 1], [2, 11], [0, 11], [13, 11], [4, 0], [4, 13], [1.5, 11]] as const) {
      expect(annualLastYearHint(k, month, 2026)).toBeNull();
    }

    // Seguro de 4 parcelas a partir de novembro: "2026" termina em fevereiro de 2027; "2027", em fevereiro de 2028.
    const seguroDraft = draft({ description: 'Seguro residencial', partsPerYearText: '4', firstMonthText: '11/2026', dueDayText: '15' });
    const v2026 = validateSeriesDraft({ ...seguroDraft, lastMonthText: '2026' }, DEMO_TODAY);
    expect(v2026.ok && v2026.input.lastMonth).toBe('2027-02');
    const v2027 = validateSeriesDraft({ ...seguroDraft, lastMonthText: '2027' }, DEMO_TODAY);
    expect(v2027.ok && v2027.input.lastMonth).toBe('2028-02');
    expect(v2027.ok && seriesPreview(v2027.input, DEMO_TODAY).text).toContain('de 2026/2027 a 2027/2028');
    // O erro ocupa o lugar da dica: também diz qual ano digitar. O código continua fim_invalido.
    for (const lastMonthText of ['2025', '2076', '27', '02/2027']) {
      const v = validateSeriesDraft({ ...seguroDraft, lastMonthText }, DEMO_TODAY);
      expect(v.ok ? null : [v.code, v.errors.lastMonthText]).toEqual([
        'fim_invalido',
        'O último ano precisa ser igual ou depois do primeiro, em até 50 anos. Digite o ano em que começa o último período, como 2026 para 2026/2027.',
      ]);
    }
    // Ano já começado (próxima a pagar: parcela 3 de 2026/2027, em janeiro de 2027): o primeiro ano continua sendo 2026.
    const started = { ...seguroDraft, firstMonthText: '01/2027', firstNumberText: '3' };
    const s2026 = validateSeriesDraft({ ...started, lastMonthText: '2026' }, '2027-01-05');
    expect(s2026.ok && s2026.input).toMatchObject({ firstDueMonth: '2027-01', firstNumber: 3, lastMonth: '2027-02' });
    const s2025 = validateSeriesDraft({ ...started, lastMonthText: '2025' }, '2027-01-05');
    expect(s2025.ok ? null : s2025.errors.lastMonthText).toBe(
      'O último ano precisa ser igual ou depois do primeiro, em até 50 anos. Digite o ano em que começa o último período, como 2026 para 2026/2027.',
    );
    // Sem atravessar dezembro, o erro não muda.
    const iptu = validateSeriesDraft(draft({ lastMonthText: '2026' }), DEMO_TODAY);
    expect(iptu.ok ? null : iptu.errors.lastMonthText).toBe(ANNUAL_SERIES_ERROR_TEXT.fim_invalido);
    // Legenda: "dia 15" nunca quebra a linha (espaço não separável).
    const v = validateSeriesDraft(seguroDraft, DEMO_TODAY);
    if (!v.ok) throw new Error(v.code);
    expect(seriesCaption(seguro({}), DEMO_TODAY)).not.toMatch(/dia \d/);
    expect(seriesCaption({ ...seguro(), terms: [{ ...seguro().terms[0]!, dueDay: 15 }] }, DEMO_TODAY)).toBe(
      'Todo ano, 4 parcelas de novembro a fevereiro, dia\u00a015 · desde 2026/2027',
    );
  });

  it('chips de início: "Primeiro ano" e "Próxima parcela a pagar em 2026"', () => {
    expect(annualStartChoices(1, 1, 20, DEMO_TODAY)).toEqual({
      years: [
        { firstDueMonth: '2027-01', firstNumber: 1, dueOn: '2027-01-20', label: '2027 (vence em 20/01/2027)', isDefault: true },
        { firstDueMonth: '2028-01', firstNumber: 1, dueOn: '2028-01-20', label: '2028 (vence em 20/01/2028)', isDefault: false },
      ],
      started: null,
    });
    const iptu = annualStartChoices(10, 2, 10, DEMO_TODAY);
    expect(iptu.started).toMatchObject({ yearLabel: '2026', title: 'Próxima parcela a pagar em 2026', hint: 'As parcelas anteriores deste ano não viram gastos.' });
    expect(iptu.started!.parts.map((c) => [c.firstDueMonth, c.firstNumber, c.label, c.isDefault])).toEqual([
      ['2026-09', 8, 'Parcela 8 (venceu em 10/09)', false],
      ['2026-10', 9, 'Parcela 9 (vence em 10/10)', true],
      ['2026-11', 10, 'Parcela 10 (vence em 10/11)', false],
    ]);
    expect(iptu.years.map((c) => [c.firstDueMonth, c.label, c.isDefault])).toEqual([
      ['2027-02', '2027 (primeira vence em 10/02/2027)', false],
      ['2028-02', '2028 (primeira vence em 10/02/2028)', false],
    ]);
    // Matrícula de dezembro: 2026 e 2027; padrão 2026. Cada escolha passa na validação.
    const m = annualStartChoices(1, 12, 10, DEMO_TODAY);
    expect(m.years.map((c) => [c.label, c.isDefault])).toEqual([
      ['2026 (vence em 10/12/2026)', true],
      ['2027 (vence em 10/12/2027)', false],
    ]);
    for (const c of [...iptu.years, ...iptu.started!.parts]) {
      expect(seriesInputError(input({ firstDueMonth: c.firstDueMonth, firstNumber: c.firstNumber }), DEMO_TODAY)).toBeNull();
    }
    // Ano que começou neste mês (12 parcelas de outubro, a 1ª vencida em 05/10): parcela 1 ou a próxima a pagar.
    const oct = annualStartChoices(12, 10, 5, DEMO_TODAY);
    expect(oct.years.map((c) => [c.label, c.isDefault])).toEqual([
      ['2026/2027 (primeira venceu em 05/10/2026)', false],
      ['2027/2028 (primeira vence em 05/10/2027)', false],
    ]);
    expect(oct.started!.title).toBe('Próxima parcela a pagar em 2026/2027');
    expect(oct.started!.parts.slice(0, 2).map((c) => [c.firstNumber, c.firstDueMonth, c.label, c.isDefault])).toEqual([
      [2, '2026-11', 'Parcela 2 (vence em 05/11)', true],
      [3, '2026-12', 'Parcela 3 (vence em 05/12)', false],
    ]);
    // Cota única vencida neste mês: o padrão é o ano seguinte.
    expect(annualStartChoices(1, 10, 5, DEMO_TODAY).years.map((c) => [c.label, c.isDefault])).toEqual([
      ['2026 (venceu em 05/10/2026)', false],
      ['2027 (vence em 05/10/2027)', true],
    ]);
    // Seguro de 4 parcelas a partir de novembro: o rótulo atravessa o ano.
    expect(annualStartChoices(4, 11, 15, DEMO_TODAY).years[0]!.label).toBe('2026/2027 (primeira vence em 15/11/2026)');
  });

  it('findSeriesConflicts: começar no ano seguinte; série encerrada não conta como parecida', () => {
    const p = seriesPreview(input({ description: 'IPVA', amountCents: 240000, dueDay: 20, firstDueMonth: '2027-01', partsPerYear: 1 }), DEMO_TODAY);
    const avulsa = { ...occ(ipva(), 1), id: 'cp-ipva', series: null, amountIsEstimate: false };
    const c = findSeriesConflicts(p, [avulsa], [], [ipva({ id: 'antigo', lastNumber: 0 })]);
    expect([c.commitment?.id, c.similar, c.suggestedFirstMonth, c.suggestedFirstNumber]).toEqual(['cp-ipva', null, '2028-01', 1]);
    expect(c.texts).toEqual({
      record: null,
      commitment: 'Você já tem a conta a pagar IPVA com vencimento em 20/01/2027. Começar a repetição em 2028?',
      similar: null,
      startNext: 'Começar em 2028',
    });
    const again = findSeriesConflicts(p, [], [], [ipva()]);
    expect(again.texts.similar).toBe('Você já tem a conta do ano IPVA. Quer cadastrar esta conta do ano mesmo assim?');
    // A sugestão aplicada passa na validação.
    expect(seriesInputError({ ...p.input, firstDueMonth: c.suggestedFirstMonth, firstNumber: c.suggestedFirstNumber! }, DEMO_TODAY)).toBeNull();
  });
});

describe('contas do ano: totais, ano a ano, informar, tirar e sugestão', () => {
  it('summarizeToPay: igual com e sem as anuais criadas antes do mês; o grupo vai para later', () => {
    const base = [occ(matricula(), 1, { dueOn: '2026-10-10', id: 'avulsa', series: null, amountIsEstimate: false })];
    const created = range(1, 10).map((n) => occ(anual(), n));
    const without = summarizeToPay(base, 'ctx', '2026-12', '2026-12-01');
    const withAnnual = summarizeToPay([...base, ...created], 'ctx', '2026-12', '2026-12-01');
    const pick = (s: typeof without) => [s.toPayCents, s.dueInMonthCents, s.overdueBeforeCents, s.estimatedCents, s.items.length];
    expect(pick(withAnnual)).toEqual(pick(without));
    expect(withAnnual.later.map((c) => c.id)).toEqual(created.map((c) => c.id));
    // Mês que não é o atual: só as do mês (month_to_pay(2027-01) com hoje 01/11/2026).
    const jan = summarizeToPay([occ(ipva(), 1)], 'ctx', '2027-01', '2026-11-01');
    expect([jan.toPayCents, jan.overdueBeforeCents, jan.dueInMonthCents, jan.items.length]).toEqual([240000, 0, 240000, 1]);
  });

  it('seriesMonthlyTotal ignora contas do ano; seriesYearlyTotal da demonstração: R$ 4.200,00, todos estimados', async () => {
    const repo = await createDemoRepository();
    const ctx = (await repo.getSpace())!.personalContextId;
    const list = await repo.listSeries(ctx);
    expect(seriesYearlyTotal(list, DEMO_TODAY)).toEqual({ totalCents: 420000, estimatedCents: 420000 });
    expect(seriesMonthlyTotal(list, DEMO_TODAY)).toEqual({ totalCents: 353000, estimatedCents: 18000 });
    expect(seriesYearlyTotal([ipva({ lastNumber: 0 }), matricula()], DEMO_TODAY)).toEqual({ totalCents: 120000, estimatedCents: 0 });
    // Nenhuma conta da demonstração muda de outubro a dezembro de 2026.
    for (const month of ['2026-10', '2026-11', '2026-12']) {
      const list2 = await repo.listCommitments(ctx, month);
      expect(list2.some((c) => c.series?.kind === 'anual')).toBe(false);
    }
  });

  it('annualYearRange e annualYearSummary: R$ 1.899,00 depois de informar; R$ 1.709,10 com 9 tiradas; previsto', () => {
    const s = anual();
    expect(annualYearRange(s, DEMO_TODAY)).toEqual({ from: 0, to: 0 });
    expect(annualYearRange(s, '2027-01-15')).toEqual({ from: 0, to: 1 });
    expect(annualYearRange(anual({ lastNumber: 10 }), '2027-12-01')).toEqual({ from: 0, to: 0 });
    expect(annualYearRange(anual({ lastNumber: 0 }), '2027-12-01')).toEqual({ from: 0, to: -1 });

    const informed = range(1, 10).map((n) => occ(s, n, { amountCents: 18990, amountIsEstimate: false, seriesOverride: true, version: 2 }));
    const y = annualYearSummary(s, informed, informed, 0, '2027-01-15');
    expect([y.count, y.open, y.totalCents, y.approximate, y.planned]).toEqual([10, 10, 189900, false, false]);
    expect(y.texts.line).toBe('2027 · 10 parcelas · 10 em aberto · R$ 1.899,00');
    const three = informed.map((c, i) => (i < 3 ? { ...c, status: 'quitado' as const, payment: { recordId: `r${i}`, amountCents: 18990, paidOn: c.dueOn, accountId: 'a' } } : c));
    expect(annualYearSummary(s, three, three.slice(3), 0, '2027-04-15').texts.line).toBe('2027 · 10 parcelas · 3 pagas · 7 em aberto · R$ 1.899,00');

    const skipped = { ...s, skippedNumbers: range(2, 10) };
    const paid = [paidOcc(s, 1, 170910, '2027-02-10')];
    const z = annualYearSummary(skipped, paid, [], 0, '2027-02-10');
    expect([z.paid, z.skipped, z.totalCents, z.texts.line]).toEqual([1, 9, 170910, '2027 · 10 parcelas · 1 paga · 9 tiradas · R$ 1.709,10']);

    const planned = annualYearSummary(s, informed, informed, 1, '2027-01-15');
    expect([planned.planned, planned.notCreated, planned.totalCents, planned.entersOn]).toEqual([true, 10, 180000, '2027-12']);
    expect(planned.texts.line).toBe('2028 · previsto · cerca de R$ 1.800,00 · entra em Contas a pagar em dezembro de 2027');

    // Começado em 2026: parcelas 1 a 8 pagas antes do Clarevo.
    const started = anual({ firstDueMonth: '2026-10', firstNumber: 9 });
    const y0 = annualYearSummary(started, [occ(started, 9), occ(started, 10)], [], 0, DEMO_TODAY);
    expect([y0.count, y0.paidBefore, y0.open, y0.totalCents, y0.approximate]).toEqual([2, 8, 2, 36000, true]);
    expect(y0.texts).toEqual({
      line: '2026 · 2 parcelas · 2 em aberto · cerca de R$ 360,00',
      paidBefore: '2026: parcelas 1 a 8 pagas antes do Clarevo (informado por você).',
      missing: null,
    });

    // Cota única.
    expect(annualYearSummary(ipva(), [paidOcc(ipva(), 1, 251230, '2027-01-20')], [], 0, '2027-02-01').texts.line).toBe('2027 · paga · R$ 2.512,30');
    expect(annualYearSummary(ipva({ skippedNumbers: [1] }), [], [], 0, '2027-02-01').texts.line).toBe('2027 · não houve');
  });

  it('affectedByYear: informar e tirar (conjunto do banco e textos)', () => {
    const s = anual();
    const list = range(1, 10).map((n) => occ(s, n));
    const inform = affectedByYear(list, s, 4, 'informar', 18990);
    if (!inform.ok) throw new Error(inform.code);
    expect(inform.affected).toEqual(range(1, 10).map((n) => ({ id: `iptu-${n}`, version: 1 })));
    expect(inform.title).toBe('Informar o valor de 2027');
    expect(inform.text).toBe(
      'Vão mudar: as 10 parcelas de 2027 em aberto com valor estimado. Total de 2027: R$ 1.899,00. Não mudam: parcelas pagas e parcelas com valor já informado.',
    );
    expect(inform.doneText).toBe('Valor de 2027 informado. As parcelas deixaram de ser estimadas.');
    expect(affectedByYear(list, s, 4, 'informar').ok && affectedByYear(list, s, 4, 'informar')).toMatchObject({ totalCents: null });

    // 3 pagas, uma informada à parte, 6 estimadas em aberto; outra série e outro ano não entram.
    const mixed = [
      ...range(1, 3).map((n) => paidOcc(s, n, 18990, '2027-04-10')),
      occ(s, 4, { amountCents: 20000, amountIsEstimate: false, seriesOverride: true, version: 2 }),
      ...range(5, 10).map((n) => occ(s, n)),
      occ(s, 11),
      occ(ipva(), 1),
    ];
    const partial = affectedByYear(mixed, s, 10, 'informar', 18990);
    if (!partial.ok) throw new Error(partial.code);
    expect(seriesNumbers(partial.changing)).toEqual(range(5, 10));
    expect(partial.unchanged.map((u) => [u.commitment.series!.number, u.reason])).toEqual([
      [1, 'paga'],
      [2, 'paga'],
      [3, 'paga'],
      [4, 'informada'],
    ]);
    expect(partial.totalCents).toBe(3 * 18990 + 20000 + 6 * 18990);
    const skip = affectedByYear(mixed, s, 1, 'tirar');
    if (!skip.ok) throw new Error(skip.code);
    expect(seriesNumbers(skip.changing)).toEqual(range(4, 10));
    expect(skip.title).toBe('Tirar as 7 parcelas de 2027 em aberto?');
    expect(skip.text).toBe('Elas saem de Contas a pagar e não voltam a ser criadas. As parcelas pagas continuam. A conta do ano continua em 2028.');
    expect(skip.doneText).toBe('7 parcelas de 2027 saíram de Contas a pagar.');
    // Última: sem "continua em".
    const one = affectedByYear([occ(s, 10)], anual({ lastNumber: 10 }), 10, 'tirar');
    expect(one.ok && [one.title, one.text, one.doneText]).toEqual([
      'Tirar a parcela 10 de 2027?',
      'Ela sai de Contas a pagar e não volta a ser criada.',
      'A parcela 10 de 2027 saiu de Contas a pagar.',
    ]);
    // Cota única.
    const v = affectedByYear([occ(ipva(), 1)], ipva(), 1, 'informar', 251230);
    expect(v.ok && [v.text, v.doneText]).toEqual([
      'Vai mudar: a conta de 2027, em aberto com valor estimado. Total de 2027: R$ 2.512,30.',
      'Valor de 2027 informado. A conta deixou de ser estimada.',
    ]);
    // Recusas locais.
    expect(affectedByYear(list, { ...s, kind: 'mensal', partsPerYear: null }, 1, 'tirar')).toEqual({ ok: false, code: 'tipo_invalido' });
    expect(affectedByYear(list, s, 0, 'tirar')).toEqual({ ok: false, code: 'numero_fora_da_serie' });
    expect(affectedByYear(list, anual({ lastNumber: 10 }), 11, 'tirar')).toEqual({ ok: false, code: 'numero_fora_da_serie' });
    expect(affectedByYear(mixed.slice(0, 4), s, 1, 'informar')).toMatchObject({
      ok: false,
      code: 'nada_a_mudar',
      text: 'Nenhuma parcela de 2027 está em aberto com valor estimado.',
    });
  });

  it('wholeYearPayment: "Paguei o ano todo de uma vez (cota única)"', () => {
    const s = anual();
    const list = range(1, 10).map((n) => occ(s, n, { amountCents: 18990, amountIsEstimate: false, version: 2 }));
    const w = wholeYearPayment(list, s, list[0]!)!;
    expect(seriesNumbers(w.others)).toEqual(range(2, 10));
    expect(w.affectedAfterPayment).toEqual(range(2, 10).map((n) => ({ id: `iptu-${n}`, version: 2 })));
    expect([w.openTotalCents, w.approximate, w.label]).toEqual([189900, false, 'Paguei o ano todo de uma vez (cota única)']);
    expect(w.hint).toBe(
      'Informe o valor total pago. As outras 9 parcelas de 2027 em aberto saem de Contas a pagar e não voltam, mesmo se você desfizer este pagamento.',
    );
    expect(w.doneText).toBe('Pagamento registrado. As outras 9 parcelas de 2027 saíram de Contas a pagar.');
    expect(w.failedText).toBe('Pagamento registrado. Não foi possível tirar as outras parcelas agora. Use Tirar as parcelas de 2027 na conta do ano.');
    // Cota única, nenhuma outra em aberto ou parcela paga: sem a caixa.
    expect(wholeYearPayment([occ(ipva(), 1)], ipva(), occ(ipva(), 1))).toBeNull();
    expect(wholeYearPayment([list[9]!], s, list[9]!)).toBeNull();
    expect(wholeYearPayment(list, s, { ...list[0]!, status: 'quitado' })).toBeNull();
    expect(wholeYearPayment(list.slice(8), s, list[8]!)!.hint).toContain('A outra parcela de 2027 em aberto sai de Contas a pagar e não volta');
  });

  it('suggestedAnnualReference: R$ 2.512,30 a partir de 2028; nada com parcelas tiradas, já aplicada ou sem ano seguinte', () => {
    const s = ipva();
    const paid = [paidOcc(s, 1, 251230, '2027-01-20')];
    const T = '2027-02-10';
    const sug = suggestedAnnualReference(s, paid, T)!;
    expect([sug.amountCents, sug.fromNumber, sug.fromLabel, sug.paidYear.label]).toEqual([251230, 2, '2028', '2027']);
    expect(sug.text).toBe('Em 2027 você pagou R$ 2.512,30. Usar esse valor como referência a partir de 2028?');
    expect(sug.action).toBe('Usar R$ 2.512,30 a partir de 2028');
    expect(sug.edit).toEqual({ nature: 'conta', description: 'IPVA', category: 'Transporte', amountCents: 251230, amountMode: 'variavel', dueDay: 20 });
    expect(suggestedAnnualReference(anual({ skippedNumbers: range(2, 10) }), [paidOcc(anual(), 1, 170910, '2027-02-10')], T)).toBeNull();
    expect(suggestedAnnualReference({ ...s, terms: [...s.terms, { ...s.terms[0]!, fromNumber: 2, amountCents: 251230 }] }, paid, T)).toBeNull();
    expect(suggestedAnnualReference(ipva({ lastNumber: 1 }), paid, T)).toBeNull();
    expect(suggestedAnnualReference(s, [occ(s, 1)], T)).toBeNull();
    const k10 = suggestedAnnualReference(anual(), [paidOcc(anual(), 9, 19000, '2027-10-10'), paidOcc(anual(), 10, 19500, '2027-11-10')], '2027-11-10')!;
    expect([k10.amountCents, k10.fromNumber, k10.text, k10.action]).toEqual([
      19500,
      11,
      'Em 2027 você pagou R$ 195,00 na parcela 10. Usar esse valor como referência de cada parcela a partir de 2028?',
      'Usar R$ 195,00 por parcela a partir de 2028',
    ]);
  });

  it('editFromMaxNumber: o mesmo limite de update_series_from (término, reajuste programado e ano que começa até mês + 12)', () => {
    // Sem término: até 12 meses depois do mês atual (gasto fixo) ou até o fim do ano que começa nele (conta do ano).
    const mensal = { ...anual(), kind: 'mensal' as const, firstDueMonth: '2026-10', partsPerYear: null };
    expect(editFromMaxNumber(mensal, DEMO_TODAY)).toBe(13);
    expect(editFromMaxNumber({ ...mensal, lastNumber: 3 }, DEMO_TODAY)).toBe(3);
    expect(editFromMaxNumber(ipva(), '2026-12-31')).toBe(1);
    expect(editFromMaxNumber(ipva(), '2027-01-01')).toBe(2);
    expect(editFromMaxNumber(anual(), '2027-01-31')).toBe(10);
    expect(editFromMaxNumber(anual(), '2027-02-01')).toBe(20);
    expect(editFromMaxNumber(seguro(), '2026-10-31')).toBe(4);
    expect(editFromMaxNumber(seguro(), '2026-11-01')).toBe(8);
    // Conta do ano que começa daqui a mais de 12 meses (como a "Taxa futura" de 45_contas_do_ano.sql): o primeiro ano.
    expect(editFromMaxNumber(anual({ firstDueMonth: '2028-01', partsPerYear: 2 }), DEMO_TODAY)).toBe(2);
    expect(editFromMaxNumber(ipva({ lastNumber: 5 }), '2026-12-31')).toBe(5);
  });

  it('suggestedAnnualReference: paga antes do ano começar, só aparece quando o banco aceita (numero_fora_da_serie)', () => {
    // Matrícula de 10/12 desde 2026, R$ 1.200,00 fixo, paga adiantada em 15/10/2026 com R$ 1.250,00.
    const m = matricula();
    const early = [paidOcc(m, 1, 125000, '2026-10-15')];
    for (const today of ['2026-10-15', '2026-11-15', '2026-11-30']) {
      expect(suggestedAnnualReference(m, early, today)).toBeNull();
      expect(editFromMaxNumber(m, today)).toBe(1);
    }
    const dec = suggestedAnnualReference(m, early, '2026-12-01')!;
    expect([dec.fromNumber, dec.text]).toEqual([2, 'Em 2026 você pagou R$ 1.250,00. Usar esse valor como referência a partir de 2027?']);
    expect(dec.fromNumber).toBeLessThanOrEqual(editFromMaxNumber(m, '2026-12-01'));

    // IPVA de 2027 pago em 15/12/2026; IPVA de 2028 pago em 05/11/2027: a sugestão espera o mês de janeiro.
    const s = ipva();
    expect(suggestedAnnualReference(s, [paidOcc(s, 1, 251230, '2026-12-15')], '2026-12-15')).toBeNull();
    expect(suggestedAnnualReference(s, [paidOcc(s, 1, 251230, '2026-12-15')], '2027-01-01')!.fromNumber).toBe(2);
    const twoYears = [paidOcc(s, 2, 260000, '2027-11-05'), paidOcc(s, 1, 251230, '2027-01-20')];
    expect(suggestedAnnualReference(s, twoYears, '2027-11-05')).toBeNull();
    expect(suggestedAnnualReference(s, twoYears, '2027-12-31')).toBeNull();
    expect(suggestedAnnualReference(s, twoYears, '2028-01-01')).toMatchObject({
      fromNumber: 3,
      text: 'Em 2028 você pagou R$ 2.600,00. Usar esse valor como referência a partir de 2029?',
    });

    // IPTU de 10 parcelas: a parcela 1 de 2027 paga em 15/12/2026 só sugere a partir de fevereiro de 2027.
    const t = anual();
    const p1 = [paidOcc(t, 1, 19000, '2026-12-15')];
    expect(suggestedAnnualReference(t, p1, '2027-01-31')).toBeNull();
    expect(suggestedAnnualReference(t, p1, '2027-02-01')!.fromNumber).toBe(11);
  });

  it('suggestedAnnualReference: sem sugestão quando o valor do ano seguinte já foi informado (não sobrescreve)', () => {
    const s = ipva();
    const n1 = paidOcc(s, 1, 251230, '2027-01-20');
    const T = '2027-12-01';
    // 2028 criada pela referência, estimada: a sugestão continua.
    expect(suggestedAnnualReference(s, [occ(s, 2), n1], T)!.fromNumber).toBe(2);
    // 2028 informada (R$ 2.650,00, alterada só naquele ano): aplicar a voltaria a estimada com R$ 2.512,30.
    const informed = occ(s, 2, { amountCents: 265000, amountIsEstimate: false, seriesOverride: true });
    expect(suggestedAnnualReference(s, [informed, n1], T)).toBeNull();
    expect(suggestedAnnualReference(s, mergeOccurrences([informed, n1], [informed]), T)).toBeNull();
    // Valor fixo (não estimado) sem alteração: a sugestão vale.
    const fixed = ipva();
    const fixedS = { ...fixed, terms: [{ ...fixed.terms[0]!, amountMode: 'fixo' as const }] };
    expect(suggestedAnnualReference(fixedS, [occ(fixedS, 2), paidOcc(fixedS, 1, 251230, '2027-01-20')], T)).not.toBeNull();
    // Alterada só num ano depois do seguinte: update_series_from não a muda, e a sugestão continua.
    const later = [occ(s, 3, { amountCents: 270000, amountIsEstimate: false, seriesOverride: true }), occ(s, 2), n1];
    expect(suggestedAnnualReference(s, later, '2028-11-01')!.fromNumber).toBe(2);

    // IPTU: 2027 paga com R$ 189,90 por parcela e 2028 informada com R$ 195,00; também com uma só parcela de 2028 alterada.
    const t = anual();
    const paid2027 = range(1, 10).map((n) => paidOcc(t, n, 18990, `2027-${String(n + 1).padStart(2, '0')}-10`));
    const open2028 = range(11, 20).map((n) => occ(t, n));
    expect(suggestedAnnualReference(t, [...open2028, ...paid2027], T)!.fromNumber).toBe(11);
    const informed2028 = open2028.map((c) => ({ ...c, amountCents: 19500, amountIsEstimate: false, seriesOverride: true }));
    expect(suggestedAnnualReference(t, [...informed2028, ...paid2027], T)).toBeNull();
    const one = open2028.map((c) => (c.series!.number === 15 ? { ...c, amountCents: 20000, seriesOverride: true } : c));
    expect(suggestedAnnualReference(t, [...one, ...paid2027], T)).toBeNull();
  });

  it('groupAnnualLater: o seguro de 4 parcelas vira um grupo; a Matrícula fica como conta', () => {
    const seg = seguro({ terms: [{ ...seguro().terms[0]!, dueDay: 15 }] });
    const later = [
      occ(matricula(), 1),
      ...range(1, 4).map((n) => occ(seg, n)),
      ...range(1, 10).map((n) => occ(anual(), n)),
    ].sort((a, b) => a.dueOn.localeCompare(b.dueOn));
    const groups = groupAnnualLater(later);
    expect(groups.map((g) => (g.type === 'conta' ? g.commitment.id : g.group.title))).toEqual([
      'Seguro residencial de 2026/2027',
      'matricula-1',
      'IPTU de 2027',
    ]);
    const segGroup = groups[0]!.type === 'ano' ? groups[0]!.group : null;
    expect(segGroup).toMatchObject({ count: 4, label: '2026/2027', firstDueOn: '2026-11-15', lastDueOn: '2027-02-15', totalCents: 48000 });
    expect(segGroup!.caption).toBe('4 parcelas, de 15/11/2026 a 15/02/2027 · estimado');
    const iptu = groups[2]!.type === 'ano' ? groups[2]!.group : null;
    expect([iptu!.caption, iptu!.allFixed, iptu!.index]).toEqual(['10 parcelas, de 10/02 a 10/11/2027 · estimado', false, 0]);
    expect(iptu!.a11yLabel).toBe(
      'IPTU de 2027, 10 parcelas de cerca de R$ 180,00, valor estimado, de 10/02/2027 a 10/11/2027, conta do ano. Toque para ver as parcelas.',
    );
    expect(segGroup!.a11yLabel.startsWith('Seguro residencial de 2026 a 2027, 4 parcelas')).toBe(true);
    // Uma só parcela do ano na lista: fica como conta.
    expect(groupAnnualLater([occ(anual(), 1)])).toEqual([{ type: 'conta', commitment: occ(anual(), 1) }]);
    // Valores diferentes e fixos: soma no nome acessível.
    const fixed = [occ(anual(), 1, { amountCents: 10000, amountIsEstimate: false }), occ(anual(), 2, { amountCents: 20000, amountIsEstimate: false })];
    const g = groupAnnualLater(fixed)[0]!;
    expect(g.type === 'ano' && [g.group.allFixed, g.group.caption, g.group.a11yLabel]).toEqual([
      true,
      '2 parcelas, de 10/02 a 10/03/2027',
      'IPTU de 2027, 2 parcelas, R$ 300,00 no total, de 10/02/2027 a 10/03/2027, conta do ano. Toque para ver as parcelas.',
    ]);
  });

  it('esta e as próximas, encerrar e sem conta registrada com textos em anos', () => {
    const s = anual();
    const list = [paidOcc(s, 1, 18000, '2027-02-10'), occ(s, 2), occ(s, 3, { seriesOverride: true, amountCents: 19000 }), occ(s, 4)];
    const plan = affectedByEditFrom(list, s, 2);
    expect(plan.ok && plan.text).toBe(
      'Vão mudar: parcelas 2 e 4 de 2027. Não mudam: parcela 1 de 2027 (paga) e parcela 3 de 2027 ' +
        '(valor informado ou alterado à parte). As contas criadas depois já seguem o novo valor.',
    );
    // Muitas parcelas: agrupadas por ano, com as anteriores em aberto num só item.
    const many = [paidOcc(s, 1, 18000, '2027-02-10'), ...range(2, 20).map((n) => occ(s, n))];
    const long = affectedByEditFrom(many, s, 5);
    expect(long.ok && long.text).toBe(
      'Vão mudar: parcelas 5 a 10 de 2027 e parcelas 1 a 10 de 2028. Não mudam: parcelas 2 a 4 de 2027 (antes da parcela escolhida). ' +
        'As contas criadas depois já seguem o novo valor.',
    );
    const v = ipva();
    const vPlan = affectedByEditFrom([paidOcc(v, 1, 251230, '2027-01-20'), occ(v, 2, { seriesOverride: true, amountCents: 260000, version: 2 })], v, 2);
    expect(vPlan.ok && vPlan.text).toBe(
      'Vai mudar: 2028 (20/01). Não muda: 2027 (paga). As contas criadas depois já seguem o novo valor. ' +
        'A conta de 2028 tinha o valor informado ou alterado só naquele ano (R$ 2.600,00) e passa a seguir o novo valor.',
    );
    const end = affectedByEnd(range(1, 20).map((n) => occ(s, n)), s, 10);
    expect(end.ok && end.text).toBe('10 contas em aberto depois de 2027 vão sair da lista. As contas pagas continuam no histórico.');
    const mid = affectedByEnd(range(1, 10).map((n) => occ(s, n)), s, 5);
    expect(mid.ok && mid.text).toBe('5 contas em aberto depois da parcela 5 de 2027 vão sair da lista. As contas pagas continuam no histórico.');
    // Ausência longa: 2027 inteiro e as parcelas 1 a 3 de 2028 sem conta registrada.
    const live = range(14, 20).map((n) => occ(s, n));
    const known = { ...s, openCount: 7 };
    expect(missingMonths(known, live, '2028-06-15').map((m) => m.number)).toEqual(range(1, 13));
    expect(annualYearSummary(known, live, live, 0, '2028-06-15').texts.missing).toBe(
      '2027: as 10 parcelas ficaram sem conta registrada. Se você pagou, anote o gasto em Anotar gasto.',
    );
    expect(annualYearSummary(known, live, live, 1, '2028-06-15').texts.missing).toBe('2028: parcelas 1 a 3 sem conta registrada.');
    expect(annualYearSummary(known, live, live, 1, '2028-06-15').texts.line).toBe(
      '2028 · 10 parcelas · 7 em aberto · 3 sem conta registrada · cerca de R$ 1.260,00',
    );
  });
});

/** Conta nova (Pessoal) com dia ajustável e a base de aceite de 07/10/2026. */
async function freshRepo(start = '2026-10-07') {
  let today = start;
  const repo = new MemoryRepository({ actorId: 'pessoa-1', displayName: 'Elisa', today: () => today });
  const space = await repo.ensurePersonalSpace('Conta principal');
  const ctx = space.personalContextId;
  const accountId = space.accounts[0]!.id;
  const annualInput = (
    description: string,
    cents: number,
    partsPerYear: number,
    dueDay: number,
    firstDueMonth: string,
    mode: AmountMode,
    category: string,
    over: Partial<SeriesInput> = {},
  ): SeriesInput => ({
    kind: 'anual',
    nature: 'conta',
    description,
    category,
    amountCents: cents,
    amountMode: mode,
    dueDay,
    firstDueMonth,
    firstNumber: 1,
    installmentTotal: null,
    partsPerYear,
    lastMonth: null,
    ...over,
  });
  const payment = (cents: number, paidOn: string) => ({ accountId, amountCents: cents, paidOn, category: null });
  const occurrences = async (seriesId: string) =>
    mergeOccurrences(await repo.listSeriesOccurrences(seriesId), await repo.listOpenSeriesOccurrences(seriesId));
  const byNumber = async (seriesId: string, n: number) => (await occurrences(seriesId)).find((c) => c.series!.number === n)!;
  return { repo, ctx, accountId, annualInput, payment, occurrences, byNumber, setToday: (d: string) => (today = d), today: () => today };
}

describe('contas do ano: MemoryRepository', () => {
  it('sequência de aceite A3, passos 1 a 21', async () => {
    const { repo, ctx, accountId, annualInput, payment, occurrences, byNumber, setToday, today } = await freshRepo();
    // Base de 07/10/2026: Recebido 6.000,00, Pago 3.900,00, Internet e Condomínio a pagar, Seguro do carro em 10/11.
    const record = (kind: 'receita' | 'despesa', description: string, cents: number, occurredOn: string) =>
      repo.createRecord(newOperationKey(), ctx, kind, { accountId, amountCents: cents, occurredOn, description, category: null });
    await record('receita', 'Salário', 600000, '2026-10-01');
    await record('despesa', 'Aluguel', 250000, '2026-10-05');
    await record('despesa', 'Mercado', 140000, '2026-10-06');
    const bill = async (description: string, cents: number, dueOn: string) =>
      (await repo.createCommitment(newOperationKey(), ctx, { description, amountCents: cents, dueOn, category: null })).commitment;
    const internet = await bill('Internet', 15000, '2026-10-15');
    const condominio = await bill('Condomínio', 50000, '2026-10-20');
    const seguroCarro = await bill('Seguro do carro', 30000, '2026-11-10');

    const reais = (c: number) => c / 100;
    /** [Ainda a pagar, Pago] do mês de hoje, em reais; confere as invariantes (S1 a S10, I1). */
    const step = async (expected: [number, number]) => {
      repo.checkInvariants();
      const month = today().slice(0, 7);
      const toPay = summarizeToPay(await repo.listCommitments(ctx, month), ctx, month, today());
      const paid = summarizeMonth(await repo.listRecords(ctx, month), ctx, month).paidCents;
      expect([reais(toPay.toPayCents), reais(paid)]).toEqual(expected);
      return toPay;
    };
    const now = (d: string) => setToday(d);
    await step([650, 3900]);

    // 1. IPVA: cota única, 20/01, desde 2027, R$ 2.400,00, muda, Transporte. Nada criado; previsto 20/01/2027.
    const ipvaInput = annualInput('IPVA', 240000, 1, 20, '2027-01', 'variavel', 'Transporte');
    expect(seriesPreview(ipvaInput, today()).next[0]!.dueOn).toBe('2027-01-20');
    const ipvaW = await repo.createSeries(newOperationKey(), ctx, ipvaInput);
    expect([ipvaW.occurrences, ipvaW.changed, ipvaW.series.partsPerYear, ipvaW.series.lastNumber]).toEqual([[], 0, 1, null]);
    await step([650, 3900]);

    // 2. IPTU: 10 parcelas, fevereiro, dia 10, desde 2027, R$ 180,00, muda, Moradia. Nada criado.
    const iptuW = await repo.createSeries(newOperationKey(), ctx, annualInput('IPTU', 18000, 10, 10, '2027-02', 'variavel', 'Moradia'));
    expect([iptuW.occurrences, iptuW.changed]).toEqual([[], 0]);
    const iptuId = iptuW.series.id;
    await step([650, 3900]);

    // 3. Matrícula: cota única, 10/12, desde 2026, R$ 1.200,00 fixo, Educação: n1 em Próximos meses.
    const matW = await repo.createSeries(newOperationKey(), ctx, annualInput('Matrícula', 120000, 1, 10, '2026-12', 'fixo', 'Educação'));
    expect(matW.occurrences.map((c) => [c.series!.number, c.dueOn, c.amountIsEstimate, occurrenceLabel(c)])).toEqual([
      [1, '2026-12-10', false, 'Conta do ano de 2026'],
    ]);
    const s3 = await step([650, 3900]);
    expect(s3.later.map((c) => c.description)).toEqual(['Seguro do carro', 'Matrícula']);

    // 4. Gerar de novo: nada.
    expect(await repo.syncSeriesOccurrences(ctx)).toEqual({ created: 0, createdOverdue: 0 });
    await step([650, 3900]);

    // 5. Pagar Internet, Condomínio e Seguro do carro em 07/10.
    for (const c of [internet, condominio, seguroCarro]) await repo.payCommitment(newOperationKey(), c.id, c.version, payment(c.amountCents, '2026-10-07'));
    await step([0, 4850]);

    // 6. 01/11/2026: IPVA n1 20/01/2027, R$ 2.400,00 estimado.
    now('2026-11-01');
    expect(await repo.syncSeriesOccurrences(ctx)).toEqual({ created: 1, createdOverdue: 0 });
    expect(await byNumber(ipvaW.series.id, 1)).toMatchObject({ dueOn: '2027-01-20', amountCents: 240000, amountIsEstimate: true });
    await step([0, 0]);
    // month_to_pay(2027-01) com hoje 01/11/2026: [240000, 0, 240000, 1].
    const jan = summarizeToPay(await repo.listCommitments(ctx, '2027-01'), ctx, '2027-01', today());
    expect([jan.toPayCents, jan.overdueBeforeCents, jan.dueInMonthCents, jan.items.length]).toEqual([240000, 0, 240000, 1]);

    // 7. 01/12/2026: IPTU n1 a n10, R$ 180,00 estimados. Ainda a pagar: Matrícula.
    now('2026-12-01');
    expect(await repo.syncSeriesOccurrences(ctx)).toEqual({ created: 10, createdOverdue: 0 });
    const iptu2027 = await occurrences(iptuId);
    expect(iptu2027.map((c) => [c.series!.number, c.dueOn, c.amountCents, c.amountIsEstimate]).reverse()).toEqual(
      range(1, 10).map((n) => [n, `${addMonths('2027-02', n - 1)}-10`, 18000, true]),
    );
    const s7 = await step([1200, 0]);
    // Em "Próximos meses", o IPVA e um único grupo "IPTU de 2027".
    expect(groupAnnualLater(s7.later).map((g) => (g.type === 'conta' ? g.commitment.description : g.group.title))).toEqual(['IPVA', 'IPTU de 2027']);

    // 8. 10/12/2026: pagar a Matrícula.
    now('2026-12-10');
    const mat1 = await byNumber(matW.series.id, 1);
    await repo.payCommitment(newOperationKey(), mat1.id, mat1.version, payment(120000, '2026-12-10'));
    await step([0, 1200]);

    // 9. 15/01/2027: informar 2027 no IPTU, R$ 189,90 (esperadas n1 a n10, versão 1).
    now('2027-01-15');
    const iptuS = (await repo.getSeries(iptuId))!;
    const informPlan = affectedByYear(await occurrences(iptuId), iptuS, 1, 'informar', 18990);
    if (!informPlan.ok) throw new Error(informPlan.code);
    expect(informPlan.affected.every((a) => a.version === 1)).toBe(true);
    const informKey = newOperationKey();
    const informed = await repo.informSeriesYear(informKey, iptuId, 1, informPlan.affected, 18990);
    expect(informed.changed).toBe(10);
    expect(informed.series.version).toBe(iptuS.version); // a série não muda de versão
    expect(informed.occurrences.map((c) => [c.amountCents, c.amountIsEstimate, c.seriesOverride, c.version])).toEqual(
      range(1, 10).map(() => [18990, false, true, 2]),
    );
    expect(annualYearSummary(informed.series, informed.occurrences, informed.occurrences, 0, today()).totalCents).toBe(189900);
    const s9 = await step([2400, 0]);
    expect(s9.estimatedCents).toBe(240000);

    // 10. Repetir o passo 9 com a mesma chave: nada muda.
    const again = await repo.informSeriesYear(informKey, iptuId, 1, informPlan.affected, 18990);
    expect(again).toEqual({ ...informed, changed: 0 });
    expect(await repo.findSeriesOperation(informKey)).toEqual({ action: 'informar_ano', seriesId: iptuId });
    await step([2400, 0]);

    // 11. Informar 2027 no IPVA: R$ 2.512,30.
    const ipvaPlan = affectedByYear(await occurrences(ipvaW.series.id), ipvaW.series, 1, 'informar', 251230);
    if (!ipvaPlan.ok) throw new Error(ipvaPlan.code);
    await repo.informSeriesYear(newOperationKey(), ipvaW.series.id, 1, ipvaPlan.affected, 251230);
    expect(await byNumber(ipvaW.series.id, 1)).toMatchObject({ amountCents: 251230, amountIsEstimate: false });
    await step([2512.3, 0]);

    // 12. 20/01/2027: pagar o IPVA.
    now('2027-01-20');
    const ipva1 = await byNumber(ipvaW.series.id, 1);
    await repo.payCommitment(newOperationKey(), ipva1.id, ipva1.version, payment(251230, '2027-01-20'));
    await step([0, 2512.3]);

    // 13. 10/02/2027: IPTU n1 com "Paguei o ano todo de uma vez": R$ 1.709,10; depois tirar n2 a n10.
    now('2027-02-10');
    const n1 = await byNumber(iptuId, 1);
    const whole = wholeYearPayment(await occurrences(iptuId), (await repo.getSeries(iptuId))!, n1)!;
    expect(whole.openTotalCents).toBe(189900);
    expect(Math.round(whole.openTotalCents * 0.9)).toBe(170910);
    const paidN1 = await repo.payCommitment(newOperationKey(), n1.id, n1.version, payment(170910, '2027-02-10'));
    const skipKey = newOperationKey();
    const skipped = await repo.skipSeriesYear(skipKey, iptuId, n1.series!.number, whole.affectedAfterPayment);
    expect([skipped.changed, skipped.series.skippedNumbers, seriesNumbers(skipped.occurrences)]).toEqual([9, range(2, 10), [1]]);
    expect((await repo.listRecords(ctx, '2027-02')).map((r) => [r.description, r.amountCents, r.commitmentId])).toEqual([['IPTU', 170910, n1.id]]);
    expect(annualYearSummary(skipped.series, skipped.occurrences, [], 0, today())).toMatchObject({ paid: 1, skipped: 9, totalCents: 170910 });
    await step([0, 1709.1]);

    // 14. Gerar: nada recriado.
    expect(await repo.syncSeriesOccurrences(ctx)).toEqual({ created: 0, createdOverdue: 0 });
    await step([0, 1709.1]);

    // 15. Desfazer o pagamento do IPTU n1: n1 volta em aberto (R$ 189,90); n2 a n10 continuam fora.
    await repo.undoCommitmentPayment(newOperationKey(), n1.id, paidN1.commitment.version);
    expect(seriesNumbers(await occurrences(iptuId))).toEqual([1]);
    expect(await repo.syncSeriesOccurrences(ctx)).toEqual({ created: 0, createdOverdue: 0 });
    await step([189.9, 0]);

    // 16. Pagar de novo R$ 1.709,10.
    const n1b = await byNumber(iptuId, 1);
    expect(n1b).toMatchObject({ status: 'aberto', amountCents: 18990 });
    await repo.payCommitment(newOperationKey(), n1b.id, n1b.version, payment(170910, '2027-02-10'));
    await step([0, 1709.1]);

    // 17. Sugestão do IPVA aceita: a partir de 2 (ainda não criada), R$ 2.512,30, muda, esperadas []. IPTU sem sugestão.
    const ipvaNow = (await repo.getSeries(ipvaW.series.id))!;
    const sug = suggestedAnnualReference(ipvaNow, await repo.listSeriesOccurrences(ipvaNow.id), today())!;
    expect([sug.fromNumber, sug.amountCents, sug.text]).toEqual([2, 251230, 'Em 2027 você pagou R$ 2.512,30. Usar esse valor como referência a partir de 2028?']);
    const editPlan = affectedByEditFrom(await occurrences(ipvaNow.id), ipvaNow, sug.fromNumber);
    expect(editPlan.ok && editPlan.affected).toEqual([]);
    const accepted = await repo.updateSeriesFrom(newOperationKey(), ipvaNow.id, ipvaNow.version, sug.fromNumber, [], sug.edit);
    expect(accepted.series.terms.map((t) => [t.fromNumber, t.amountCents, t.amountMode])).toEqual([
      [1, 240000, 'variavel'],
      [2, 251230, 'variavel'],
    ]);
    expect(suggestedAnnualReference(accepted.series, await repo.listSeriesOccurrences(ipvaNow.id), today())).toBeNull();
    expect(suggestedAnnualReference((await repo.getSeries(iptuId))!, await repo.listSeriesOccurrences(iptuId), today())).toBeNull();
    await step([0, 1709.1]);

    // 18. 01/11/2027: IPVA n2 20/01/2028, R$ 2.512,30 estimado; Matrícula n2 10/12/2027.
    now('2027-11-01');
    expect(await repo.syncSeriesOccurrences(ctx)).toEqual({ created: 2, createdOverdue: 0 });
    expect(await byNumber(ipvaW.series.id, 2)).toMatchObject({ dueOn: '2028-01-20', amountCents: 251230, amountIsEstimate: true });
    expect(await byNumber(matW.series.id, 2)).toMatchObject({ dueOn: '2027-12-10', amountCents: 120000 });
    await step([0, 0]);

    // 19. 01/12/2027: IPTU n11 a n20, R$ 180,00 estimados (a referência não mudou).
    now('2027-12-01');
    expect(await repo.syncSeriesOccurrences(ctx)).toEqual({ created: 10, createdOverdue: 0 });
    expect(
      (await occurrences(iptuId))
        .filter((c) => c.series!.number > 10)
        .map((c) => [c.amountCents, c.amountIsEstimate])
        .every(([a, e]) => a === 18000 && e === true),
    ).toBe(true);
    await step([1200, 0]);

    // 20. Encerrar o IPVA com último número 2: nada sai.
    const ipva20 = (await repo.getSeries(ipvaW.series.id))!;
    const endPlan = affectedByEnd(await occurrences(ipva20.id), ipva20, 2);
    if (!endPlan.ok) throw new Error(endPlan.code);
    expect([endPlan.affected, endPlan.text]).toEqual([[], null]);
    const ended = await repo.endSeries(newOperationKey(), ipva20.id, ipva20.version, 2, []);
    expect([ended.changed, ended.series.lastNumber, seriesCaption(ended.series, today())]).toEqual([0, 2, 'Todo ano em 20/01 · de 2027 a 2028']);
    await step([1200, 0]);

    // 21. 01/11/2028: o IPVA de 2029 não é criado; Matrícula n3 10/12/2028.
    now('2028-11-01');
    expect(await repo.syncSeriesOccurrences(ctx)).toEqual({ created: 1, createdOverdue: 0 });
    expect(seriesNumbers(await occurrences(ipvaW.series.id))).toEqual([2, 1]);
    expect(await byNumber(matW.series.id, 3)).toMatchObject({ dueOn: '2028-12-10' });
    expect(await repo.syncSeriesOccurrences(ctx)).toEqual({ created: 0, createdOverdue: 0 });
    repo.checkInvariants();
  });

  it('sugestão de referência: aparece só quando updateSeriesFrom aceita; com o ano seguinte informado, some', async () => {
    const { repo, ctx, annualInput, payment, occurrences, byNumber, setToday, today } = await freshRepo();
    // Matrícula de 10/12 desde 2026, R$ 1.200,00 fixo, paga adiantada em 15/10/2026 com R$ 1.250,00.
    const { series: m } = await repo.createSeries(newOperationKey(), ctx, annualInput('Matrícula', 120000, 1, 10, '2026-12', 'fixo', 'Educação'));
    setToday('2026-10-15');
    const n1 = await byNumber(m.id, 1);
    await repo.payCommitment(newOperationKey(), n1.id, n1.version, payment(125000, '2026-10-15'));
    const edit = { nature: 'conta' as const, description: 'Matrícula', category: 'Educação', amountCents: 125000, amountMode: 'fixo' as const, dueDay: 10 };
    for (const d of ['2026-10-15', '2026-11-15', '2026-11-30']) {
      setToday(d);
      const s = (await repo.getSeries(m.id))!;
      expect(suggestedAnnualReference(s, await repo.listSeriesOccurrences(s.id), today())).toBeNull();
      const plan = affectedByEditFrom(await occurrences(s.id), s, 2);
      if (!plan.ok) throw new Error(plan.code);
      await expect(repo.updateSeriesFrom(newOperationKey(), s.id, s.version, 2, plan.affected, edit)).rejects.toMatchObject({ code: 'numero_fora_da_serie' });
    }
    setToday('2026-12-01');
    const mDec = (await repo.getSeries(m.id))!;
    const sug = suggestedAnnualReference(mDec, await repo.listSeriesOccurrences(m.id), today())!;
    expect([sug.fromNumber, sug.edit]).toEqual([2, edit]);
    const plan = affectedByEditFrom(await occurrences(m.id), mDec, sug.fromNumber);
    if (!plan.ok) throw new Error(plan.code);
    const w = await repo.updateSeriesFrom(newOperationKey(), m.id, mDec.version, sug.fromNumber, plan.affected, sug.edit);
    expect(w.series.terms.map((t) => [t.fromNumber, t.amountCents])).toEqual([
      [1, 120000],
      [2, 125000],
    ]);

    // IPVA: 2027 paga com R$ 2.512,30, sugestão não aplicada; em 01/12/2027, 2028 informada com R$ 2.650,00.
    setToday('2027-01-20');
    const { series: ipvaS } = await repo.createSeries(newOperationKey(), ctx, annualInput('IPVA', 240000, 1, 20, '2027-01', 'variavel', 'Transporte'));
    const i1 = await byNumber(ipvaS.id, 1);
    await repo.payCommitment(newOperationKey(), i1.id, i1.version, payment(251230, '2027-01-20'));
    setToday('2027-12-01');
    await repo.syncSeriesOccurrences(ctx);
    expect(suggestedAnnualReference(ipvaS, await occurrences(ipvaS.id), today())!.fromNumber).toBe(2);
    const year = affectedByYear(await occurrences(ipvaS.id), ipvaS, 2, 'informar', 265000);
    if (!year.ok) throw new Error(year.code);
    await repo.informSeriesYear(newOperationKey(), ipvaS.id, 2, year.affected, 265000);
    const after = (await repo.getSeries(ipvaS.id))!;
    expect(suggestedAnnualReference(after, await repo.listSeriesOccurrences(after.id), today())).toBeNull();
    expect(suggestedAnnualReference(after, await occurrences(after.id), today())).toBeNull();
    // Se o app ainda tiver uma sugestão antiga na tela, o plano mostra a troca: chosen alterada só naquele ano.
    const stale = affectedByEditFrom(await occurrences(after.id), after, 2);
    expect(stale.ok && [stale.chosen?.seriesOverride, stale.text]).toEqual([
      true,
      'Vai mudar: 2028 (20/01). Não muda: 2027 (paga). As contas criadas depois já seguem o novo valor. ' +
        'A conta de 2028 tinha o valor informado ou alterado só naquele ano (R$ 2.650,00) e passa a seguir o novo valor.',
    ]);
    // Paga 2028, a sugestão volta, agora pelo valor de 2028.
    setToday('2028-01-20');
    const i2 = await byNumber(ipvaS.id, 2);
    await repo.payCommitment(newOperationKey(), i2.id, i2.version, payment(265000, '2028-01-20'));
    expect(suggestedAnnualReference(after, await repo.listSeriesOccurrences(after.id), today())).toMatchObject({
      fromNumber: 3,
      text: 'Em 2028 você pagou R$ 2.650,00. Usar esse valor como referência a partir de 2029?',
    });
    repo.checkInvariants();
  });

  it('ausência longa: 7 criadas, 2 vencidas; 1 a 13 sem linha; de novo, 0', async () => {
    const { repo, ctx, annualInput, occurrences, setToday } = await freshRepo();
    const { series } = await repo.createSeries(newOperationKey(), ctx, annualInput('IPTU', 18000, 10, 10, '2027-02', 'variavel', 'Moradia'));
    setToday('2028-06-15');
    expect(await repo.syncSeriesOccurrences(ctx)).toEqual({ created: 7, createdOverdue: 2 });
    expect(seriesNumbers(await occurrences(series.id)).reverse()).toEqual(range(14, 20));
    expect(await repo.syncSeriesOccurrences(ctx)).toEqual({ created: 0, createdOverdue: 0 });
    const s = (await repo.getSeries(series.id))!;
    const capped = await repo.listSeriesOccurrences(s.id);
    const open = await repo.listOpenSeriesOccurrences(s.id);
    expect(annualYearSummary(s, capped, open, 0, '2028-06-15')).toMatchObject({ missing: 10, missingParts: range(1, 10) });
    expect(annualYearSummary(s, capped, open, 1, '2028-06-15')).toMatchObject({ missing: 3, open: 7 });
    repo.checkInvariants();
  });

  it('informSeriesYear: recusas, pagas e não estimadas ficam, versão da série, chave e updateSeriesFrom com versões antigas', async () => {
    const { repo, ctx, annualInput, payment, occurrences, byNumber, setToday } = await freshRepo('2026-12-01');
    const { series: s } = await repo.createSeries(newOperationKey(), ctx, annualInput('IPTU', 18000, 10, 10, '2027-02', 'variavel', 'Moradia'));
    const { series: mensal } = await repo.createSeries(newOperationKey(), ctx, {
      ...annualInput('Luz', 18000, 1, 12, '2026-12', 'variavel', 'Moradia'),
      kind: 'mensal',
      partsPerYear: null,
    });
    setToday('2027-02-10');
    const n1 = await byNumber(s.id, 1);
    await repo.payCommitment(newOperationKey(), n1.id, n1.version, payment(18000, '2027-02-10'));
    const n2 = await byNumber(s.id, 2);
    await repo.updateCommitment(newOperationKey(), n2.id, n2.version, { description: 'IPTU', amountCents: 19500, dueOn: n2.dueOn, category: 'Moradia', amountIsEstimate: false });
    const plan = affectedByYear(await occurrences(s.id), s, 5, 'informar', 18990);
    if (!plan.ok) throw new Error(plan.code);
    expect(seriesNumbers(plan.changing)).toEqual(range(3, 10));

    const fails: [string, () => Promise<unknown>][] = [
      ['tipo_invalido', () => repo.informSeriesYear(newOperationKey(), mensal.id, 1, [], 100)],
      ['nao_encontrado', () => repo.informSeriesYear(newOperationKey(), 'serie-inexistente', 1, plan.affected, 100)],
      ['numero_fora_da_serie', () => repo.informSeriesYear(newOperationKey(), s.id, 0, plan.affected, 18990)],
      ['valor_invalido', () => repo.informSeriesYear(newOperationKey(), s.id, 5, plan.affected, 0)],
      ['valor_acima_do_limite', () => repo.informSeriesYear(newOperationKey(), s.id, 5, plan.affected, 1_000_000_000)],
      ['versao_desatualizada', () => repo.informSeriesYear(newOperationKey(), s.id, 5, plan.affected.slice(1), 18990)],
      ['versao_desatualizada', () => repo.informSeriesYear(newOperationKey(), s.id, 5, [], 18990)],
      ['versao_desatualizada', () => repo.informSeriesYear(newOperationKey(), s.id, 5, plan.affected.map((a) => ({ id: a.id })) as never, 18990)],
      ['versao_desatualizada', () => repo.informSeriesYear(newOperationKey(), s.id, 15, plan.affected, 18990)], // 2028: nada a informar
    ];
    for (const [code, run] of fails) await expect(run()).rejects.toMatchObject({ code });
    const key = newOperationKey();
    const w = await repo.informSeriesYear(key, s.id, 5, plan.affected, 18990);
    expect(w.changed).toBe(8);
    expect(w.occurrences.map((c) => [c.series!.number, c.status, c.amountCents, c.amountIsEstimate])).toEqual([
      [1, 'quitado', 18000, true],
      [2, 'aberto', 19500, false],
      ...range(3, 10).map((n) => [n, 'aberto', 18990, false]),
    ]);
    expect([w.series.version, w.series.terms]).toEqual([s.version, s.terms]);
    // Mesma chave com outro valor: chave_reutilizada; em outra ação também.
    await expect(repo.informSeriesYear(key, s.id, 5, plan.affected, 19000)).rejects.toMatchObject({ code: 'chave_reutilizada' });
    await expect(repo.skipSeriesYear(key, s.id, 5, plan.affected)).rejects.toMatchObject({ code: 'chave_reutilizada' });
    // "Esta e as próximas" com as versões antigas das parcelas: versao_desatualizada.
    const stale = affectedByEditFrom(plan.changing, s, 3);
    if (!stale.ok) throw new Error(stale.code);
    await expect(
      repo.updateSeriesFrom(newOperationKey(), s.id, s.version, 3, stale.affected, { nature: 'conta', description: 'IPTU', category: 'Moradia', amountCents: 20000, amountMode: 'fixo', dueDay: 10 }),
    ).rejects.toMatchObject({ code: 'versao_desatualizada' });
    // Informadas ficam "alteradas só naquele ano": "esta e as próximas" a partir da 3 só muda a escolhida.
    const from3 = affectedByEditFrom(await occurrences(s.id), s, 3);
    expect(from3.ok && from3.affected.map((a) => a.id)).toEqual([(await byNumber(s.id, 3)).id]);
    // A falha não grava operação.
    repo.failNextWrite = 'depois';
    const lost = newOperationKey();
    const plan2 = affectedByYear(await occurrences(s.id), s, 5, 'tirar');
    if (!plan2.ok) throw new Error(plan2.code);
    await expect(repo.skipSeriesYear(lost, s.id, 5, plan2.affected)).rejects.toMatchObject({ code: 'rede' });
    expect(await repo.findSeriesOperation(lost)).toEqual({ action: 'tirar_ano', seriesId: s.id });
    expect((await repo.skipSeriesYear(lost, s.id, 5, plan2.affected)).changed).toBe(0);
    repo.checkInvariants();
  });

  it('skipSeriesYear: só as em aberto; não voltam ao gerar nem ao desfazer o pagamento; conjunto diferente recusa', async () => {
    const { repo, ctx, annualInput, payment, occurrences, byNumber, setToday } = await freshRepo('2026-12-01');
    const { series: s } = await repo.createSeries(newOperationKey(), ctx, annualInput('IPTU', 18000, 10, 10, '2027-02', 'fixo', 'Moradia'));
    setToday('2027-03-10');
    const n1 = await byNumber(s.id, 1);
    const paid = await repo.payCommitment(newOperationKey(), n1.id, n1.version, payment(18000, '2027-02-10'));
    const plan = affectedByYear(await occurrences(s.id), s, 1, 'tirar');
    if (!plan.ok) throw new Error(plan.code);
    expect(seriesNumbers(plan.changing)).toEqual(range(2, 10));
    await expect(repo.skipSeriesYear(newOperationKey(), s.id, 1, plan.affected.slice(0, 8))).rejects.toMatchObject({ code: 'versao_desatualizada' });
    const w = await repo.skipSeriesYear(newOperationKey(), s.id, 3, plan.affected);
    expect([w.changed, w.series.skippedNumbers, seriesNumbers(w.occurrences), w.series.version]).toEqual([9, range(2, 10), [1], s.version]);
    expect(await repo.syncSeriesOccurrences(ctx)).toEqual({ created: 0, createdOverdue: 0 });
    await repo.undoCommitmentPayment(newOperationKey(), n1.id, paid.commitment.version);
    expect(seriesNumbers(await occurrences(s.id))).toEqual([1]);
    // Sem nada em aberto além da n1: tirar o ano de novo só leva a n1.
    const rest = affectedByYear(await occurrences(s.id), s, 1, 'tirar');
    expect(rest.ok && seriesNumbers(rest.changing)).toEqual([1]);
    // 2028 continua: em 01/12/2027 entram n11 a n20.
    setToday('2027-12-01');
    expect(await repo.syncSeriesOccurrences(ctx)).toEqual({ created: 10, createdOverdue: 0 });
    repo.checkInvariants();
  });

  it('updateSeriesFrom, updateCommitment, endSeries e deleteSeries anuais', async () => {
    const { repo, ctx, annualInput, payment, occurrences, byNumber, setToday } = await freshRepo('2026-12-01');
    const input = annualInput('IPTU', 18000, 10, 10, '2027-02', 'variavel', 'Moradia');
    const { series: s } = await repo.createSeries(newOperationKey(), ctx, input);
    const edit = { nature: 'conta' as const, description: 'IPTU', category: 'Moradia', amountCents: 19000, amountMode: 'variavel' as const, dueDay: 31 };
    // Natureza: 'conta' passa, 'financiamento' recusa.
    await expect(repo.updateSeriesFrom(newOperationKey(), s.id, s.version, 3, [], { ...edit, nature: 'financiamento' })).rejects.toMatchObject({
      code: 'natureza_invalida',
    });
    // Sem término: até a última parcela do ano que começa até 12 meses depois do mês atual (dezembro de 2027 ainda é do
    // ano de 2027, então o máximo é 10).
    await expect(repo.updateSeriesFrom(newOperationKey(), s.id, s.version, 11, [], edit)).rejects.toMatchObject({ code: 'numero_fora_da_serie' });
    await expect(repo.updateSeriesFrom(newOperationKey(), s.id, s.version, 0, [], edit)).rejects.toMatchObject({ code: 'numero_fora_da_serie' });
    // Dia novo (31): cada parcela fica no mês dela.
    const plan = affectedByEditFrom(await occurrences(s.id), s, 3);
    if (!plan.ok) throw new Error(plan.code);
    const w = await repo.updateSeriesFrom(newOperationKey(), s.id, s.version, 3, plan.affected, edit);
    expect(w.changed).toBe(8);
    expect(w.occurrences.slice(2).map((c) => c.dueOn)).toEqual(['2027-04-30', '2027-05-31', '2027-06-30', '2027-07-31', '2027-08-31', '2027-09-30', '2027-10-31', '2027-11-30']);
    // "Só esta conta" levando uma parcela para outro mês: vencimento_fora_do_mes; no mesmo mês, passa.
    const n4 = await byNumber(s.id, 4);
    await expect(
      repo.updateCommitment(newOperationKey(), n4.id, n4.version, { description: 'IPTU', amountCents: 19000, dueOn: '2027-06-10', category: 'Moradia' }),
    ).rejects.toMatchObject({ code: 'vencimento_fora_do_mes' });
    await repo.updateCommitment(newOperationKey(), n4.id, n4.version, { description: 'IPTU', amountCents: 19000, dueOn: '2027-05-02', category: 'Moradia' });

    // Encerrar: nulo ou de firstNumber − 1 a 50·k.
    const cur = (await repo.getSeries(s.id))!;
    for (const last of [-1, 501, 1.5]) {
      await expect(repo.endSeries(newOperationKey(), s.id, cur.version, last, [])).rejects.toMatchObject({ code: 'fim_invalido' });
    }
    setToday('2027-03-01');
    const n1 = await byNumber(s.id, 1);
    await repo.payCommitment(newOperationKey(), n1.id, n1.version, payment(18000, '2027-02-10'));
    await expect(repo.endSeries(newOperationKey(), s.id, cur.version, 0, [])).rejects.toMatchObject({ code: 'serie_tem_pagamento_posterior' });
    await expect(repo.deleteSeries(newOperationKey(), s.id, cur.version, [])).rejects.toMatchObject({ code: 'serie_tem_pagamentos' });
    const endPlan = affectedByEnd(await occurrences(s.id), cur, 5);
    if (!endPlan.ok) throw new Error(endPlan.code);
    const ended = await repo.endSeries(newOperationKey(), s.id, cur.version, 5, endPlan.affected);
    expect([ended.changed, seriesNumbers(ended.occurrences)]).toEqual([5, range(1, 5)]);
    // Retomar ("sem data para terminar") recria 6 a 10 dentro da janela anual, sem a marca de alterada.
    const resumed = await repo.endSeries(newOperationKey(), s.id, ended.series.version, null, []);
    expect(resumed.occurrences.slice(5).map((c) => [c.series!.number, c.dueOn, c.amountCents, c.seriesOverride])).toEqual([
      [6, '2027-07-31', 19000, false],
      [7, '2027-08-31', 19000, false],
      [8, '2027-09-30', 19000, false],
      [9, '2027-10-31', 19000, false],
      [10, '2027-11-30', 19000, false],
    ]);
    expect(await repo.endSeries(newOperationKey(), s.id, resumed.series.version, 500, [])).toMatchObject({ series: { lastNumber: 500 } });
    // Excluir sem conta paga: sai tudo.
    const { series: v } = await repo.createSeries(newOperationKey(), ctx, annualInput('IPVA', 240000, 1, 20, '2028-01', 'variavel', 'Transporte'));
    const del = await repo.deleteSeries(newOperationKey(), v.id, v.version, []);
    expect([del.changed, await repo.getSeries(v.id)]).toEqual([0, null]);
    repo.checkInvariants();
  });

  it('idempotência de createSeries: hash sem partsPerYear igual ao do Ciclo A; partsPerYear diferente dá chave_reutilizada', async () => {
    const { repo, ctx, annualInput } = await freshRepo();
    const input = annualInput('IPTU', 18000, 10, 10, '2027-02', 'variavel', 'Moradia');
    const key = newOperationKey();
    const first = await repo.createSeries(key, ctx, input);
    expect(await repo.createSeries(key, ctx, { ...input, description: ' IPTU ' })).toEqual({ ...first, changed: 0 });
    await expect(repo.createSeries(key, ctx, { ...input, partsPerYear: 9 })).rejects.toMatchObject({ code: 'chave_reutilizada' });
    expect(await repo.listSeries(ctx)).toHaveLength(1);
    // Mensal sem o campo (cliente antigo): mesmo conteúdo que com partsPerYear nulo.
    const mensal: SeriesInput = { ...input, kind: 'mensal', firstDueMonth: '2026-10', partsPerYear: null };
    const mk = newOperationKey();
    const m1 = await repo.createSeries(mk, ctx, mensal);
    const { partsPerYear: _k, ...old } = mensal;
    expect((await repo.createSeries(mk, ctx, old as SeriesInput)).series.id).toBe(m1.series.id);
    // Validação na ordem do banco.
    await expect(repo.createSeries(newOperationKey(), ctx, { ...input, partsPerYear: 13 })).rejects.toMatchObject({ code: 'parcelas_no_ano_invalidas' });
    await expect(repo.createSeries(newOperationKey(), ctx, { ...input, nature: 'financiamento' })).rejects.toMatchObject({ code: 'natureza_invalida' });
    await expect(repo.createSeries(newOperationKey(), ctx, { ...input, lastMonth: '2029-10' })).rejects.toMatchObject({ code: 'fim_invalido' });
    const ended = await repo.createSeries(newOperationKey(), ctx, { ...input, lastMonth: '2029-11' });
    expect(ended.series.lastNumber).toBe(30);
    repo.checkInvariants();
  });

  it('o limite de 100 conta as contas do ano ativas', async () => {
    const { repo, ctx, annualInput } = await freshRepo();
    for (let i = 0; i < 100; i++) {
      const kind: SeriesKind = i % 2 ? 'anual' : 'mensal';
      await repo.createSeries(
        newOperationKey(),
        ctx,
        kind === 'anual'
          ? annualInput(`Conta ${i}`, 1000, 1, 1, '2027-01', 'fixo', 'Moradia')
          : { ...annualInput(`Gasto ${i}`, 1000, 1, 1, '2027-01', 'fixo', 'Moradia'), kind: 'mensal', partsPerYear: null },
      );
    }
    const key = newOperationKey();
    await expect(repo.createSeries(key, ctx, annualInput('Mais uma', 1000, 1, 1, '2027-01', 'fixo', 'Moradia'))).rejects.toMatchObject({
      code: 'limite_de_gastos_fixos',
    });
    expect(await repo.findSeriesOperation(key)).toBeNull();
  });

  describe('invariantes S9 e S10', () => {
    type Internals = { seriesById: Map<string, Record<string, unknown>>; commitments: Map<string, Record<string, unknown>>; checkTransitions(before: unknown): void };
    const setup = async () => {
      const { repo, ctx, annualInput, byNumber } = await freshRepo('2026-12-01');
      const { series: s } = await repo.createSeries(newOperationKey(), ctx, annualInput('IPTU', 18000, 10, 10, '2027-02', 'variavel', 'Moradia'));
      const n1 = await byNumber(s.id, 1);
      return { repo, s, n1, internals: repo as unknown as Internals };
    };
    const change = (map: Map<string, Record<string, unknown>>, id: string, over: Record<string, unknown>) => map.set(id, { ...map.get(id)!, ...over });

    it.each([
      ['k = 0', { partsPerYear: 0 }],
      ['k = 13', { partsPerYear: 13 }],
      ['natureza financiamento', { nature: 'financiamento' }],
      ['firstNumber > k', { partsPerYear: 2, firstNumber: 3 }],
      ['installmentTotal preenchido', { installmentTotal: 10 }],
      ['lastNumber > 50·k', { lastNumber: 501 }],
      ['partsPerYear em mensal', { kind: 'mensal' }],
    ])('S9: %s', async (_name, over) => {
      const { repo, s, internals } = await setup();
      repo.checkInvariants();
      change(internals.seriesById, s.id, over);
      expect(() => repo.checkInvariants()).toThrow('serie_inconsistente');
    });

    it('S10: vencimento depois do fim do 13º mês; partsPerYear imutável', async () => {
      const { repo, s, n1, internals } = await setup();
      // Uma parcela de 2028 criada em 01/12/2026 (fora da janela anual e do 13º mês).
      internals.commitments.set('cp-futura', { ...internals.commitments.get(n1.id)!, id: 'cp-futura', occurrenceNumber: 21, dueOn: '2029-02-10' });
      expect(() => repo.checkInvariants()).toThrow('serie_inconsistente');
      internals.commitments.delete('cp-futura');
      repo.checkInvariants();
      const before = { commitments: new Map(internals.commitments), seriesById: new Map(internals.seriesById), terms: new Map() };
      change(internals.seriesById, s.id, { partsPerYear: 5 });
      expect(() => internals.checkTransitions(before)).toThrow('campo_imutavel');
    });
  });
});

describe('demonstração com contas do ano', () => {
  it('IPVA e IPTU sem contas em 07/10/2026; totais de outubro, novembro e dezembro iguais ao Ciclo A', async () => {
    const repo = await createDemoRepository({ cards: false });
    const ctx = (await repo.getSpace())!.personalContextId;
    const list = await repo.listSeries(ctx);
    const annuals = list.filter((s) => s.kind === 'anual');
    expect(annuals.map((s) => [currentTerm(s).description, s.partsPerYear, s.firstDueMonth, seriesCaption(s, DEMO_TODAY)])).toEqual([
      ['IPVA', 1, '2027-01', 'Todo ano em 20/01 · desde 2027'],
      ['IPTU', 10, '2027-02', 'Todo ano, 10 parcelas de fevereiro a novembro, dia\u00a010 · desde 2027'],
    ]);
    for (const s of annuals) expect(await repo.listSeriesOccurrences(s.id)).toEqual([]);
    const totals: number[] = [];
    for (const month of ['2026-10', '2026-11', '2026-12']) {
      totals.push(summarizeToPay(await repo.listCommitments(ctx, month), ctx, month, DEMO_TODAY).toPayCents);
    }
    expect(totals).toEqual([65000, 85000 + 30000 + 250000 + 18000, 0]);
    const iptu = annuals[1]!;
    expect(annualYearSummary(iptu, [], [], 0, DEMO_TODAY).texts.line).toBe(
      '2027 · previsto · cerca de R$ 1.800,00 · entra em Contas a pagar em dezembro de 2026',
    );
    expect(annualYearRange(annuals[0]!, DEMO_TODAY)).toEqual({ from: 0, to: 0 });
    repo.checkInvariants();
  });
});
