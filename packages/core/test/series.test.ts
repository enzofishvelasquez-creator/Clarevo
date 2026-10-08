import { describe, expect, it } from 'vitest';
import {
  CATEGORIES,
  DEMO_TODAY,
  MemoryRepository,
  SERIES_ERROR_TEXT,
  SERIES_FIELD_ORDER,
  addMonths,
  affectedByDelete,
  affectedByEditFrom,
  affectedByEnd,
  createDemoRepository,
  currentTerm,
  dateInMonth,
  fieldForErrorCode,
  findSeriesConflicts,
  firstMonthChoices,
  firstMonthRangeText,
  formatMonthInputBR,
  generationWindow,
  installmentProgress,
  lastNumberFromEndMonth,
  maskMonthBR,
  mergeOccurrences,
  missingMonths,
  monthsBetween,
  newOperationKey,
  nextMonthPrefill,
  numberOfMonth,
  occurrenceLabel,
  occurrencesToMaterialize,
  parseMonthBR,
  projectSeries,
  roundDiv,
  seriesCaption,
  seriesCountsTowardLimit,
  seriesDueOn,
  seriesEnded,
  seriesErrorText,
  seriesInputError,
  seriesMonthOf,
  seriesMonthlyTotal,
  seriesPreview,
  suggestedReference,
  summarizeMonth,
  summarizeToPay,
  termFor,
  termHistory,
  toPayCaption,
  validateSeriesDraft,
  type AmountMode,
  type Commitment,
  type CommitmentSeries,
  type FinancialRecord,
  type SeriesDraft,
  type SeriesEditInput,
  type SeriesErrorCode,
  type SeriesInput,
  type SeriesKind,
  type SeriesTerm,
} from '../src';

const OCT = '2026-10';
const NOV = '2026-11';
const DEC = '2026-12';
const CREATED_AT = '2026-10-01T12:00:00.000Z';

const term = (fromNumber: number, over: Partial<SeriesTerm> = {}): SeriesTerm => ({
  fromNumber,
  description: 'Aluguel',
  category: 'Moradia',
  amountCents: 250000,
  amountMode: 'fixo',
  dueDay: 5,
  ...over,
});

/** Gasto fixo de exemplo: Aluguel, todo dia 5, desde outubro de 2026. */
const series = (over: Partial<CommitmentSeries> = {}): CommitmentSeries => ({
  id: 'aluguel',
  contextId: 'ctx',
  kind: 'mensal',
  nature: 'conta',
  firstDueMonth: OCT,
  firstNumber: 1,
  lastNumber: null,
  installmentTotal: null,
  currency: 'BRL',
  terms: [term(1)],
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

/** Parcelamento da demonstração: 48 parcelas de R$ 850,00, próxima 13 em 10/11/2026. */
const carro = (over: Partial<CommitmentSeries> = {}) =>
  series({
    id: 'carro',
    kind: 'parcelada',
    nature: 'financiamento',
    firstDueMonth: NOV,
    firstNumber: 13,
    lastNumber: 48,
    installmentTotal: 48,
    terms: [term(13, { description: 'Financiamento do carro', category: 'Transporte', amountCents: 85000, dueDay: 10 })],
    ...over,
  });

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
    series: { id: s.id, number: n, kind: s.kind, nature: s.nature, installmentTotal: s.installmentTotal },
    seriesOverride: false,
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
const numbers = (xs: readonly { number: number }[]) => xs.map((x) => x.number);
const seriesNumbers = (xs: readonly Commitment[]) => xs.map((c) => c.series!.number);

describe('gastos fixos: regras puras', () => {
  describe('vencimentos', () => {
    it('dia 31 de janeiro a abril de 2027, 29/02/2028 e dia 30 em fevereiro', () => {
      const s = series({ firstDueMonth: '2027-01', terms: [term(1, { dueDay: 31 })] });
      expect([1, 2, 3, 4].map((n) => seriesDueOn(s, n))).toEqual(['2027-01-31', '2027-02-28', '2027-03-31', '2027-04-30']);
      expect(seriesDueOn(series({ firstDueMonth: '2028-02', terms: [term(1, { dueDay: 31 })] }), 1)).toBe('2028-02-29');
      expect(seriesDueOn(series({ firstDueMonth: '2027-02', terms: [term(1, { dueDay: 30 })] }), 1)).toBe('2027-02-28');
      expect(dateInMonth('2026-11', 31)).toBe('2026-11-30');
    });

    it('parcelas 13 a 48 de novembro de 2026 a outubro de 2029', () => {
      const s = carro();
      expect(seriesDueOn(s, 13)).toBe('2026-11-10');
      expect(seriesDueOn(s, 14)).toBe('2026-12-10');
      expect(seriesDueOn(s, 48)).toBe('2029-10-10');
      expect(seriesMonthOf(s, 48)).toBe('2029-10');
      expect(numberOfMonth(s, '2029-10')).toBe(48);
      expect(numberOfMonth(s, OCT)).toBe(12);
      expect(lastNumberFromEndMonth(s, '2029-10')).toBe(48);
      expect(monthsBetween(NOV, '2029-10')).toBe(35);
    });

    it('12 meses seguidos sem deslocamento (o atalho encadeado desloca)', () => {
      const s = series({ firstDueMonth: '2027-01', terms: [term(1, { dueDay: 31 })] });
      let chained = '2027-01-31';
      const chain: string[] = [];
      for (let n = 1; n <= 12; n++) {
        const due = seriesDueOn(s, n);
        expect(due).toBe(dateInMonth(addMonths('2027-01', n - 1), 31));
        expect(Number(due.slice(8))).toBeGreaterThanOrEqual(28);
        chain.push(chained);
        chained = nextMonthPrefill({ ...occ(s, 1), dueOn: chained }).dueOn;
      }
      expect(seriesDueOn(s, 3)).toBe('2027-03-31');
      expect(chain.slice(0, 3)).toEqual(['2027-01-31', '2027-02-28', '2027-03-28']);
      expect(seriesDueOn(s, 12)).toBe('2027-12-31');
    });

    it('vigência de n: maior fromNumber ≤ n; dia e valor mudam a partir dela', () => {
      const s = series({ terms: [term(1), term(4, { amountCents: 265000, dueDay: 10 })] });
      expect(termFor(s.terms, 3)?.amountCents).toBe(250000);
      expect(termFor(s.terms, 4)?.amountCents).toBe(265000);
      expect(termFor(s.terms, 0)).toBeNull();
      expect(seriesDueOn(s, 3)).toBe('2026-12-05');
      expect(seriesDueOn(s, 4)).toBe('2027-01-10');
    });

    it('janela de geração', () => {
      expect(generationWindow('2026-10-07')).toEqual({ floor: '2026-09', top: '2026-11' });
      expect(generationWindow('2027-01-15')).toEqual({ floor: '2026-12', top: '2027-02' });
    });
  });

  describe('occurrencesToMaterialize', () => {
    const escola = series({ id: 'escola', lastNumber: 3, terms: [term(1, { description: 'Escola', amountCents: 120000, dueDay: 10 })] });

    it('horizonte: do mês anterior ao seguinte, com término', () => {
      expect(occurrencesToMaterialize(escola, [], '2026-10-07')).toEqual([
        { number: 1, month: OCT, dueOn: '2026-10-10', description: 'Escola', category: 'Moradia', amountCents: 120000, amountIsEstimate: false },
        { number: 2, month: NOV, dueOn: '2026-11-10', description: 'Escola', category: 'Moradia', amountCents: 120000, amountIsEstimate: false },
      ]);
      // Sem término: o teto é o mês seguinte. Primeiro mês no futuro: só a partir dele.
      expect(numbers(occurrencesToMaterialize(series(), [], '2026-10-07'))).toEqual([1, 2]);
      expect(numbers(occurrencesToMaterialize(series({ firstDueMonth: '2027-01' }), [], '2026-10-07'))).toEqual([]);
      expect(numbers(occurrencesToMaterialize(series({ firstDueMonth: DEC }), [], '2026-10-07'))).toEqual([]);
      expect(numbers(occurrencesToMaterialize(series({ firstDueMonth: NOV }), [], '2026-10-07'))).toEqual([1]);
      // Término: depois da última conta, nada.
      expect(numbers(occurrencesToMaterialize(escola, [occ(escola, 3)], '2027-01-10'))).toEqual([]);
    });

    it('piso depois de ausência: não cria janeiro de 2027 com hoje 15/03/2027', () => {
      const s = carro({ firstDueMonth: OCT, firstNumber: 14, terms: [term(14, { amountCents: 98000, dueDay: 20 })] });
      const existing = [14, 15, 16].map((n) => occ(s, n));
      const created = occurrencesToMaterialize(s, existing, '2027-03-15');
      expect(created.map((o) => [o.number, o.dueOn])).toEqual([
        [18, '2027-02-20'],
        [19, '2027-03-20'],
        [20, '2027-04-20'],
      ]);
    });

    it('não recria "excluída só esta"; recria a removida por encerramento ao retomar', () => {
      const skipped = { ...escola, skippedNumbers: [2] };
      expect(numbers(occurrencesToMaterialize(skipped, [occ(escola, 1)], '2026-11-02'))).toEqual([3]);
      const resumed = series({ lastNumber: null });
      expect(numbers(occurrencesToMaterialize(resumed, [occ(resumed, 1)], '2026-11-02'))).toEqual([2, 3]);
    });

    it('generating = false não gera; rodar 1 ou 5 vezes dá o mesmo conjunto', () => {
      expect(occurrencesToMaterialize(series({ generating: false }), [], '2026-10-07')).toEqual([]);
      const s = series({ terms: [term(1, { description: 'Luz', amountCents: 18000, amountMode: 'variavel', dueDay: 12 })] });
      const run = (times: number) => {
        let existing: Commitment[] = [];
        for (let i = 0; i < times; i++) {
          existing = existing.concat(occurrencesToMaterialize(s, existing, '2026-10-07').map((o) => occ(s, o.number)));
        }
        return existing;
      };
      expect(run(1)).toEqual(run(5));
      expect(run(1).map((c) => [c.series!.number, c.amountCents, c.amountIsEstimate])).toEqual([
        [1, 18000, true],
        [2, 18000, true],
      ]);
      // Ocorrências de outra série não contam.
      expect(numbers(occurrencesToMaterialize(s, [occ(carro(), 13)], '2026-10-07'))).toEqual([1, 2]);
    });
  });

  it('projectSeries: só além da maior ocorrência viva, sem pulados nem depois do término', () => {
    const s = carro();
    const projected = projectSeries(s, [occ(s, 13)], NOV, '2027-02');
    expect(projected.map((o) => [o.number, o.dueOn, o.amountCents])).toEqual([
      [14, '2026-12-10', 85000],
      [15, '2027-01-10', 85000],
      [16, '2027-02-10', 85000],
    ]);
    expect(numbers(projectSeries({ ...s, skippedNumbers: [15] }, [occ(s, 13)], NOV, '2027-02'))).toEqual([14, 16]);
    expect(numbers(projectSeries(s, [occ(s, 13)], '2029-09', '2030-03'))).toEqual([47, 48]);
    expect(projectSeries(s, [], '2026-01', '2026-10')).toEqual([]);
  });

  it('rótulos: occurrenceLabel, seriesCaption, termHistory e encerramento', () => {
    expect(occurrenceLabel(occ(carro(), 13))).toBe('Parcela 13 de 48');
    expect(occurrenceLabel(occ(series(), 2))).toBe('Todo mês');
    expect(occurrenceLabel({ series: null })).toBeNull();
    expect(seriesCaption(series())).toBe('Todo mês, dia 5 · desde outubro de 2026');
    expect(seriesCaption(carro())).toBe('Parcelamento · financiamento · parcelas 13 a 48');
    expect(seriesCaption(series({ lastNumber: 3, terms: [term(1, { dueDay: 10 })] }))).toBe('Todo mês, dia 10 · de outubro a dezembro de 2026');
    const reajuste = series({ terms: [term(1), term(4, { amountCents: 265000 })] });
    expect(termHistory(reajuste).map((h) => h.text)).toEqual([
      'R$ 2.500,00 de outubro a dezembro de 2026',
      'R$ 2.650,00 a partir de janeiro de 2027',
    ]);
    expect(currentTerm(reajuste, '2026-11-01').amountCents).toBe(250000);
    expect(currentTerm(reajuste, '2027-02-01').amountCents).toBe(265000);
    // Encerrada antes de a vigência nova começar: a vigência não aparece no histórico.
    expect(termHistory({ ...reajuste, lastNumber: 2 }).map((h) => h.text)).toEqual(['R$ 2.500,00 de outubro a novembro de 2026']);
    expect(seriesEnded(series({ lastNumber: 3 }), '2027-01-01')).toBe(true);
    expect(seriesEnded(series({ lastNumber: 3 }), '2026-12-31')).toBe(false);
    expect(seriesEnded(series({ lastNumber: 0 }), '2026-10-07')).toBe(true);
  });

  describe('affectedByEditFrom, affectedByEnd e affectedByDelete', () => {
    const s = series({ id: 'luz', terms: [term(1, { description: 'Luz', amountCents: 18000, amountMode: 'variavel', dueDay: 15 })] });
    const list = [
      paidOcc(s, 1, 16530, '2026-10-07'),
      occ(s, 2, { seriesOverride: true, amountCents: 21000, amountIsEstimate: false, version: 2 }),
      occ(s, 3),
      occ(s, 4, { seriesOverride: true, amountCents: 19000, version: 2 }),
      occ(carro(), 13), // outra série
    ];

    it('conta escolhida sempre muda, mesmo alterada; pagas e outras alteradas não mudam', () => {
      const plan = affectedByEditFrom(list, s, 2);
      if (!plan.ok) throw new Error('esperava ok');
      expect(plan.affected).toEqual([
        { id: 'luz-2', version: 2 },
        { id: 'luz-3', version: 1 },
      ]);
      expect(plan.unchanged.map((u) => [u.commitment.id, u.reason])).toEqual([
        ['luz-1', 'paga'],
        ['luz-4', 'alterada'],
      ]);
      expect(plan.chosen?.id).toBe('luz-2');
      expect(plan.text).toBe(
        'Vão mudar: novembro (15/11) e dezembro (15/12). Não mudam: outubro (paga) e janeiro (alterada só para aquele mês). ' +
          'As contas criadas depois já seguem o novo valor. ' +
          'A conta de novembro tinha sido alterada só para aquele mês (R$ 210,00) e passa a seguir o novo valor.',
      );
      expect(affectedByEditFrom(list, s, 1)).toEqual({ ok: false, code: 'inicio_em_conta_paga' });
      // Reajuste programado num número ainda não criado: nenhuma conta existente muda.
      const future = affectedByEditFrom(list, s, 6);
      expect(future.ok && future.affected).toEqual([]);
    });

    it('encerrar: em aberto com número maior; erro local se houver paga depois', () => {
      expect(affectedByEnd(list, s, 0)).toEqual({ ok: false, code: 'serie_tem_pagamento_posterior' });
      const end = affectedByEnd(list, s, 1);
      expect(end.ok && end.affected.map((a) => a.id)).toEqual(['luz-2', 'luz-3', 'luz-4']);
      expect(end.ok && end.text).toBe('3 contas em aberto depois de outubro vão sair da lista. As contas pagas continuam no histórico.');
      const one = affectedByEnd(list, s, 3);
      expect(one.ok && one.text).toBe('1 conta em aberto depois de dezembro vai sair da lista. As contas pagas continuam no histórico.');
      expect(affectedByEnd(list, s, null)).toEqual({ ok: true, affected: [], removed: [], text: null });
    });

    it('excluir: só sem conta paga', () => {
      expect(affectedByDelete(list, s)).toEqual({ ok: false, code: 'serie_tem_pagamentos' });
      const del = affectedByDelete(list.slice(1), s);
      expect(del.ok && del.affected.map((a) => a.id)).toEqual(['luz-2', 'luz-3', 'luz-4']);
      expect(del.ok && del.text).toBe('3 contas em aberto vão sair da lista.');
    });
  });

  it('suggestedReference: média das até 3 pagas de maior número, metade para cima', () => {
    const s = series({ id: 'luz', terms: [term(1, { amountCents: 18000, amountMode: 'variavel' })] });
    const paid = [
      paidOcc(s, 1, 99999, '2026-07-12'), // mais antiga: fora da média
      paidOcc(s, 2, 16530, '2026-08-12'),
      paidOcc(s, 3, 18000, '2026-09-12'),
      paidOcc(s, 4, 17190, '2026-10-12'),
      occ(s, 5),
    ];
    expect(suggestedReference(paid)).toEqual({ amountCents: 17240, count: 3 });
    expect(roundDiv(51720, 3)).toBe(17240);
    expect(suggestedReference([paid[2]!])).toEqual({ amountCents: 18000, count: 1 });
    expect(suggestedReference([paid[1]!, paid[2]!])).toEqual({ amountCents: 17265, count: 2 });
    expect(suggestedReference([occ(s, 5)])).toBeNull();
    expect(suggestedReference([])).toBeNull();
  });

  it('installmentProgress e missingMonths: 12 antes, faltam 36, soma R$ 30.600,00, última 10/10/2029', () => {
    const s = carro();
    expect(installmentProgress(s, [occ(s, 13)], [occ(s, 13)], DEMO_TODAY)).toEqual({
      total: 48,
      paidBefore: 12,
      paidInApp: 0,
      remaining: 36,
      lastDueOn: '2029-10-10',
      remainingCents: 3_060_000,
      approximate: false,
    });
    expect(missingMonths(s, [occ(s, 13)], DEMO_TODAY)).toEqual([]);

    // 15/03/2027: 13 paga, 14 excluída só esta, 15 (janeiro) sem conta registrada, 16 a 18 criadas.
    const later = { ...s, skippedNumbers: [14] };
    const list = [paidOcc(s, 13, 85000, '2026-11-10'), occ(s, 16), occ(s, 17), occ(s, 18)];
    expect(missingMonths(later, list, '2027-03-15')).toEqual([{ number: 15, month: '2027-01' }]);
    const open = list.filter((c) => c.status === 'aberto');
    expect(installmentProgress(later, list, open, '2027-03-15')).toMatchObject({ paidInApp: 1, remaining: 33, remainingCents: 33 * 85000 });

    // Parcela que muda: a soma é aproximada.
    const variable = carro({ terms: [term(13, { amountCents: 85000, amountMode: 'variavel', dueDay: 10 })] });
    expect(installmentProgress(variable, [], [], DEMO_TODAY).approximate).toBe(true);
    // Gasto fixo sem término: sem contagem.
    expect(installmentProgress(series(), [], [], DEMO_TODAY)).toMatchObject({ total: null, paidBefore: 0, remaining: null, remainingCents: null });
  });

  describe('seriesPreview', () => {
    const input = (over: Partial<SeriesInput> = {}): SeriesInput => ({
      kind: 'mensal',
      nature: 'conta',
      description: 'Escola',
      category: 'Educação',
      amountCents: 120000,
      amountMode: 'fixo',
      dueDay: 10,
      firstDueMonth: OCT,
      firstNumber: 1,
      installmentTotal: null,
      lastMonth: DEC,
      ...over,
    });

    it('todo mês com término: "3 contas" e as contas que já entram', () => {
      const p = seriesPreview(input(), DEMO_TODAY);
      expect(p.count).toBe(3);
      expect(p.text).toBe(
        'Escola · R$ 1.200,00 · todo dia 10 · de outubro a dezembro de 2026 (3 contas). ' +
          'As contas de outubro e novembro já entram em Contas a pagar; as próximas aparecem um mês antes de vencer.',
      );
      expect(p.next.map((o) => o.dueOn)).toEqual(['2026-10-10', '2026-11-10', '2026-12-10']);
      expect(numbers(p.createdNow)).toEqual([1, 2]);
      expect(p.firstOverdue).toBe(false);
      expect(seriesPreview(input({ firstDueMonth: NOV }), DEMO_TODAY).text).toBe(
        'Escola · R$ 1.200,00 · todo dia 10 · de novembro a dezembro de 2026 (2 contas). ' +
          'A conta de novembro já entra em Contas a pagar; as próximas aparecem um mês antes de vencer.',
      );
      expect(seriesPreview(input({ lastMonth: NOV }), DEMO_TODAY).text).toBe(
        'Escola · R$ 1.200,00 · todo dia 10 · de outubro a novembro de 2026 (2 contas). As contas de outubro e novembro já entram em Contas a pagar.',
      );
      expect(seriesPreview(input({ firstDueMonth: '2027-01', lastMonth: null }), DEMO_TODAY).text).toBe(
        'Escola · R$ 1.200,00 · todo dia 10 · desde janeiro de 2027. A primeira conta aparece em Contas a pagar a partir de dezembro de 2026.',
      );
    });

    it('parcelado, valor que muda e primeira conta vencida', () => {
      const p = seriesPreview(
        input({
          kind: 'parcelada',
          nature: 'financiamento',
          description: 'Financiamento do carro',
          amountCents: 85000,
          firstDueMonth: NOV,
          firstNumber: 13,
          installmentTotal: 48,
          lastMonth: null,
        }),
        DEMO_TODAY,
      );
      expect(p.text).toBe(
        'Parcelas 13 a 48 de R$ 850,00, todo dia 10, de 10/11/2026 a 10/10/2029. Soma das 36 parcelas: R$ 30.600,00. Não é o valor para quitar.',
      );
      expect([p.count, p.totalCents, p.lastDueOn]).toEqual([36, 3_060_000, '2029-10-10']);
      const luz = seriesPreview(input({ description: 'Luz', amountCents: 18000, amountMode: 'variavel', dueDay: 15, lastMonth: null }), DEMO_TODAY);
      expect(luz.lines[0]).toBe('15/10/2026 · cerca de R$ 180,00 (estimado)');
      expect(seriesPreview(input({ dueDay: 5 }), DEMO_TODAY).firstOverdue).toBe(true);
    });

    it('chips "Primeira conta"', () => {
      expect(firstMonthChoices(5, DEMO_TODAY)).toEqual([
        { month: OCT, dueOn: '2026-10-05', label: 'Outubro (venceu em 05/10)', isDefault: false },
        { month: NOV, dueOn: '2026-11-05', label: 'Novembro (vence em 05/11)', isDefault: true },
      ]);
      expect(firstMonthChoices(15, DEMO_TODAY).map((c) => [c.label, c.isDefault])).toEqual([
        ['Outubro (vence em 15/10)', true],
        ['Novembro (vence em 15/11)', false],
      ]);
      expect(firstMonthChoices(7, DEMO_TODAY)[0]!.label).toBe('Outubro (vence hoje)');
    });
  });

  it('findSeriesConflicts: caixa e espaços diferentes', () => {
    const p = seriesPreview(
      {
        kind: 'mensal',
        nature: 'conta',
        description: '  Aluguel ',
        category: 'Moradia',
        amountCents: 250000,
        amountMode: 'fixo',
        dueDay: 5,
        firstDueMonth: OCT,
        firstNumber: 1,
        installmentTotal: null,
        lastMonth: null,
      },
      DEMO_TODAY,
    );
    const record = (over: Partial<FinancialRecord>): FinancialRecord => ({
      id: 'reg',
      contextId: 'ctx',
      accountId: 'conta-1',
      kind: 'despesa',
      status: 'realizado',
      amountCents: 250000,
      currency: 'BRL',
      occurredOn: '2026-10-05',
      description: 'ALUGUEL',
      category: 'Moradia',
      commitmentId: null,
      createdBy: 'pessoa',
      version: 1,
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
      ...over,
    });
    const avulsa = { ...occ(series(), 1), id: 'cp-avulsa', description: 'aluguel', dueOn: '2026-10-15', series: null };
    const c = findSeriesConflicts(p, [avulsa, occ(series({ id: 'outra' }), 1)], [record({}), record({ id: 'r2', kind: 'receita' })], [series()]);
    expect(c.record?.id).toBe('reg');
    expect(c.commitment?.id).toBe('cp-avulsa');
    expect(c.similar?.id).toBe('aluguel');
    expect(c.suggestedFirstMonth).toBe(NOV);
    expect(c.texts).toEqual({
      record: 'Você já anotou o gasto ALUGUEL em 05/10 (R$ 2.500,00). Para não contar duas vezes, o gasto fixo pode começar em novembro.',
      commitment: 'Você já tem a conta a pagar aluguel com vencimento em 15/10. Começar a repetição em novembro?',
      similar: 'Você já tem o gasto fixo Aluguel. Quer cadastrar outro mesmo assim?',
      startNext: 'Começar em novembro',
    });
    // Outro mês, outra descrição ou gasto fixo encerrado antes do primeiro mês: sem aviso.
    const none = findSeriesConflicts(
      p,
      [{ ...avulsa, dueOn: '2026-11-15' }],
      [record({ occurredOn: '2026-09-05' }), record({ description: 'Aluguel da garagem' })],
      [series({ lastNumber: 0 }), series({ firstDueMonth: '2026-09', lastNumber: 1 })],
    );
    expect([none.record, none.commitment, none.similar]).toEqual([null, null, null]);
  });

  it('seriesMonthlyTotal: por mês, se os valores não mudarem', () => {
    const luz = series({ id: 'luz', firstDueMonth: NOV, terms: [term(1, { amountCents: 18000, amountMode: 'variavel', dueDay: 12 })] });
    expect(seriesMonthlyTotal([series(), luz, carro(), series({ id: 'escola', lastNumber: 0 })], DEMO_TODAY)).toEqual({
      totalCents: 353000,
      estimatedCents: 18000,
    });
  });

  it('summarizeToPay: estimatedCents e toPayCaption.estimated; o critério de D-021 não muda com ocorrências', () => {
    const luz = series({ id: 'luz', terms: [term(1, { description: 'Luz', amountCents: 18000, amountMode: 'variavel', dueDay: 12 })] });
    const list = [occ(series(), 1, { status: 'quitado' }), occ(luz, 1), occ(luz, 2), occ(series(), 2)];
    const s = summarizeToPay(list, 'ctx', OCT, DEMO_TODAY);
    expect(s.items.map((c) => c.id)).toEqual(['luz-1']);
    expect(s.estimatedCents).toBe(18000);
    expect(s.later.map((c) => c.id)).toEqual(['aluguel-2', 'luz-2']);
    expect(toPayCaption(s, DEMO_TODAY).estimated).toBe('Inclui R$ 180,00 em valores estimados.');
    expect(summarizeToPay(list, 'ctx', NOV, DEMO_TODAY)).toMatchObject({ toPayCents: 268000, estimatedCents: 18000 });
    const fixed = summarizeToPay([occ(series(), 1)], 'ctx', OCT, '2026-10-01');
    expect([fixed.estimatedCents, toPayCaption(fixed, '2026-10-01').estimated]).toEqual([0, null]);
  });
});

describe('validateSeriesDraft (mesmas regras e ordem do banco)', () => {
  const mensal = (over: Partial<SeriesDraft> = {}): SeriesDraft => ({
    kind: 'mensal',
    nature: null,
    description: ' Escola ',
    amountText: '1.200,00',
    amountMode: 'fixo',
    dueDayText: '10',
    firstMonthText: '10/2026',
    firstNumberText: '',
    installmentTotalText: '',
    lastMonthText: '12/2026',
    category: 'Educação',
    ...over,
  });
  const parcelada = (over: Partial<SeriesDraft> = {}): SeriesDraft =>
    mensal({
      kind: 'parcelada',
      nature: 'financiamento',
      description: 'Financiamento do carro',
      amountText: '850',
      firstMonthText: '11/2026',
      firstNumberText: '13',
      installmentTotalText: '48',
      lastMonthText: '',
      category: 'Transporte',
      ...over,
    });
  const codeOf = (draft: SeriesDraft, today = DEMO_TODAY) => {
    const v = validateSeriesDraft(draft, today);
    return v.ok ? null : v.code;
  };

  it('aceita e normaliza; campos escondidos pelo tipo são ignorados', () => {
    expect(validateSeriesDraft(mensal({ nature: 'financiamento', installmentTotalText: '9', firstNumberText: '7' }), DEMO_TODAY)).toEqual({
      ok: true,
      input: {
        kind: 'mensal',
        nature: 'conta',
        description: 'Escola',
        category: 'Educação',
        amountCents: 120000,
        amountMode: 'fixo',
        dueDay: 10,
        firstDueMonth: OCT,
        firstNumber: 1,
        installmentTotal: null,
        lastMonth: DEC,
      },
    });
    const p = validateSeriesDraft(parcelada({ lastMonthText: '01/2027' }), DEMO_TODAY);
    expect(p.ok && p.input).toMatchObject({ kind: 'parcelada', nature: 'financiamento', firstNumber: 13, installmentTotal: 48, lastMonth: null });
    expect(validateSeriesDraft(mensal({ lastMonthText: '  ' }), DEMO_TODAY)).toMatchObject({ ok: true, input: { lastMonth: null } });
  });

  it('cada código na ordem do banco', () => {
    const steps: [Partial<SeriesDraft>, SeriesErrorCode | null][] = [
      [{}, 'natureza_invalida'],
      [{ nature: 'financiamento' }, 'valor_invalido'],
      [{ amountText: '10.000.000,00' }, 'valor_acima_do_limite'],
      [{ amountText: '850' }, 'descricao_obrigatoria'],
      [{ description: 'x'.repeat(81) }, 'descricao_longa'],
      [{ description: 'Carro' }, 'categoria_invalida'],
      [{ category: 'Transporte' }, 'modo_de_valor_invalido'],
      [{ amountMode: 'fixo' }, 'dia_invalido'],
      [{ dueDayText: '10' }, 'inicio_fora_do_intervalo'],
      [{ firstMonthText: '11/2026' }, 'parcelas_invalidas'],
      [{ installmentTotalText: '48' }, 'parcela_inicial_invalida'],
      [{ firstNumberText: '13' }, null],
    ];
    let draft = parcelada({
      nature: null,
      description: '',
      amountText: '0',
      category: 'x'.repeat(41),
      amountMode: 'anual' as AmountMode,
      dueDayText: '0',
      firstMonthText: '08/2026',
      installmentTotalText: '1',
      firstNumberText: '0',
    });
    const all = validateSeriesDraft(draft, DEMO_TODAY);
    expect(all.ok ? null : Object.keys(all.errors).sort()).toEqual(
      ['amountText', 'description', 'dueDayText', 'firstMonthText', 'firstNumberText', 'installmentTotalText', 'nature'].sort(),
    );
    expect(all.ok ? null : SERIES_FIELD_ORDER.find((f) => all.errors[f])).toBe('description');
    for (const [fix, code] of steps) {
      draft = { ...draft, ...fix };
      expect(codeOf(draft)).toBe(code);
    }
    expect(codeOf(mensal({ kind: 'anual' as SeriesKind, description: '' }))).toBe('tipo_invalido');
    expect(codeOf(mensal({ lastMonthText: '13/2026' }))).toBe('fim_invalido');
    expect(codeOf(parcelada({ nature: 'conta' }))).toBe('natureza_invalida');
  });

  it('limites: parcelas 1 e 481, dias 0 e 32, primeiro mês fora de [mês − 1, mês + 12], término', () => {
    expect(codeOf(parcelada({ installmentTotalText: '1', firstNumberText: '1' }))).toBe('parcelas_invalidas');
    expect(codeOf(parcelada({ installmentTotalText: '2', firstNumberText: '1' }))).toBeNull();
    expect(codeOf(parcelada({ installmentTotalText: '480', firstNumberText: '480' }))).toBeNull();
    expect(codeOf(parcelada({ installmentTotalText: '481', firstNumberText: '1' }))).toBe('parcelas_invalidas');
    expect(codeOf(parcelada({ firstNumberText: '49' }))).toBe('parcela_inicial_invalida');
    expect(codeOf(parcelada({ firstNumberText: '48' }))).toBeNull();
    for (const day of ['0', '32', '', '1,5', 'dez']) expect(codeOf(mensal({ dueDayText: day }))).toBe('dia_invalido');
    for (const day of ['1', '31', ' 31 ']) expect(codeOf(mensal({ dueDayText: day }))).toBeNull();

    expect(codeOf(mensal({ firstMonthText: '08/2026', lastMonthText: '' }))).toBe('inicio_fora_do_intervalo');
    expect(codeOf(mensal({ firstMonthText: '09/2026', lastMonthText: '' }))).toBeNull();
    expect(codeOf(mensal({ firstMonthText: '10/2027', lastMonthText: '' }))).toBeNull();
    expect(codeOf(mensal({ firstMonthText: '11/2027', lastMonthText: '' }))).toBe('inicio_fora_do_intervalo');
    expect(codeOf(mensal({ firstMonthText: '', lastMonthText: '' }))).toBe('inicio_fora_do_intervalo');
    const fora = validateSeriesDraft(mensal({ firstMonthText: '11/2027' }), DEMO_TODAY);
    expect(fora.ok ? null : fora.errors.firstMonthText).toBe('Escolha um primeiro mês entre setembro de 2026 e outubro de 2027.');

    // Hoje em 29/02/2028: de janeiro de 2028 a fevereiro de 2029.
    const leap = '2028-02-29';
    expect(codeOf(mensal({ firstMonthText: '12/2027', lastMonthText: '' }), leap)).toBe('inicio_fora_do_intervalo');
    expect(codeOf(mensal({ firstMonthText: '01/2028', lastMonthText: '' }), leap)).toBeNull();
    expect(codeOf(mensal({ firstMonthText: '02/2029', lastMonthText: '' }), leap)).toBeNull();
    expect(codeOf(mensal({ firstMonthText: '03/2029', lastMonthText: '' }), leap)).toBe('inicio_fora_do_intervalo');
    expect(firstMonthRangeText(leap)).toBe('Escolha um primeiro mês entre janeiro de 2028 e fevereiro de 2029.');

    expect(codeOf(mensal({ lastMonthText: '09/2026' }))).toBe('fim_invalido');
    expect(codeOf(mensal({ lastMonthText: '10/2026' }))).toBeNull();
    expect(codeOf(mensal({ lastMonthText: formatMonthInputBR(addMonths(OCT, 599)) }))).toBeNull();
    expect(codeOf(mensal({ lastMonthText: formatMonthInputBR(addMonths(OCT, 600)) }))).toBe('fim_invalido');
  });

  it('textos e campos dos códigos novos', () => {
    const v = validateSeriesDraft(parcelada({ nature: null, dueDayText: '32', installmentTotalText: '481' }), DEMO_TODAY);
    expect(v.ok ? null : v.errors).toEqual({
      nature: 'Escolha o tipo do parcelamento.',
      dueDayText: 'Informe um dia de 1 a 31.',
      installmentTotalText: 'Informe de 2 a 480 parcelas.',
    });
    const codes: [string, string | null][] = [
      ['descricao_longa', 'description'],
      ['natureza_invalida', 'nature'],
      ['valor_acima_do_limite', 'amountText'],
      ['dia_invalido', 'dueDayText'],
      ['inicio_fora_do_intervalo', 'firstMonthText'],
      ['parcelas_invalidas', 'installmentTotalText'],
      ['parcela_inicial_invalida', 'firstNumberText'],
      ['fim_invalido', 'lastMonthText'],
      ['limite_de_gastos_fixos', null],
      ['modo_de_valor_invalido', null],
    ];
    for (const [code, field] of codes) expect(fieldForErrorCode(code, 'series')).toBe(field);
    expect(fieldForErrorCode('vencimento_fora_do_mes')).toBe('dateText');
    expect(fieldForErrorCode('dia_invalido')).toBeNull();
    expect(seriesErrorText('inicio_fora_do_intervalo', DEMO_TODAY)).toBe('Escolha um primeiro mês entre setembro de 2026 e outubro de 2027.');
    expect(seriesErrorText('serie_tem_pagamentos', DEMO_TODAY)).toBe(SERIES_ERROR_TEXT.serie_tem_pagamentos);
    expect(seriesErrorText('tipo_invalido', DEMO_TODAY)).toBe(SERIES_ERROR_TEXT.salvar_falhou);
    expect(seriesErrorText('codigo_novo', DEMO_TODAY)).toBe(SERIES_ERROR_TEXT.salvar_falhou);
  });

  it('meses MM/AAAA', () => {
    expect(parseMonthBR('11/2026')).toBe(NOV);
    expect(parseMonthBR(' 1/2027 ')).toBe('2027-01');
    expect(parseMonthBR('13/2026')).toBeNull();
    expect(parseMonthBR('2026-11')).toBeNull();
    expect(maskMonthBR('112026')).toBe('11/2026');
    expect(maskMonthBR('1')).toBe('1');
  });

  it('seriesInputError repete clarevo_validate_series sobre o cadastro', () => {
    const ok: SeriesInput = {
      kind: 'mensal',
      nature: 'conta',
      description: 'Escola',
      category: null,
      amountCents: 120000,
      amountMode: 'fixo',
      dueDay: 10,
      firstDueMonth: OCT,
      firstNumber: 1,
      installmentTotal: null,
      lastMonth: null,
    };
    const err = (over: Partial<SeriesInput>) => seriesInputError({ ...ok, ...over }, DEMO_TODAY);
    expect(err({})).toBeNull();
    expect(err({ nature: 'financiamento' })).toBe('natureza_invalida');
    expect(err({ installmentTotal: 12 })).toBe('parcelas_invalidas');
    expect(err({ firstNumber: 2 })).toBe('parcela_inicial_invalida');
    expect(err({ dueDay: 1.5 })).toBe('dia_invalido');
    expect(err({ firstDueMonth: '2026-10-01' })).toBe('inicio_fora_do_intervalo');
    expect(err({ kind: 'parcelada', nature: 'financiamento', installmentTotal: 48, firstNumber: 13, lastMonth: DEC })).toBe('fim_invalido');
    expect(err({ kind: 'parcelada', nature: 'financiamento', installmentTotal: 48, firstNumber: 13 })).toBeNull();
  });
});

/** Conta nova (Pessoal) com dia ajustável, como a sequência de aceite A. */
async function freshRepo(start = '2026-10-07') {
  let today = start;
  const repo = new MemoryRepository({ actorId: 'pessoa-1', displayName: 'Ana', today: () => today });
  const space = await repo.ensurePersonalSpace('Conta principal');
  const ctx = space.personalContextId;
  const accountId = space.accounts[0]!.id;
  const mensal = (description: string, cents: number, dueDay: number, first: string, last: string | null, mode: AmountMode = 'fixo'): SeriesInput => ({
    kind: 'mensal',
    nature: 'conta',
    description,
    category: 'Moradia',
    amountCents: cents,
    amountMode: mode,
    dueDay,
    firstDueMonth: first,
    firstNumber: 1,
    installmentTotal: null,
    lastMonth: last,
  });
  const edit = (s: SeriesInput, over: Partial<SeriesEditInput> = {}): SeriesEditInput => ({
    nature: s.nature,
    description: s.description,
    category: s.category,
    amountCents: s.amountCents,
    amountMode: s.amountMode,
    dueDay: s.dueDay,
    ...over,
  });
  const occurrences = (seriesId: string) => repo.listSeriesOccurrences(seriesId);
  const byNumber = async (seriesId: string, n: number) => (await occurrences(seriesId)).find((c) => c.series!.number === n)!;
  const payment = (cents: number, paidOn: string) => ({ accountId, amountCents: cents, paidOn, category: 'Moradia' });
  return { repo, ctx, accountId, mensal, edit, occurrences, byNumber, payment, setToday: (d: string) => (today = d) };
}

const LUZ_TERM = { description: 'Luz', amountCents: 21000, amountMode: 'variavel' as const, dueDay: 12 };

describe('gastos fixos: MemoryRepository', () => {
  it('sequência de aceite A, passos 1 a 15', async () => {
    const { repo, ctx, mensal, edit, occurrences, byNumber, payment, setToday } = await freshRepo();
    let today = '2026-10-07';
    const now = (d: string) => {
      today = d;
      setToday(d);
    };
    // Conta nova nunca recebe série.
    expect(await repo.listSeries(ctx)).toEqual([]);
    expect(await repo.syncSeriesOccurrences(ctx)).toEqual({ created: 0, createdOverdue: 0 });

    const reais = (c: number) => c / 100;
    /** [Ainda a pagar (out.), Pago (out.), Previsto para novembro, estimados em outubro, estimados em novembro] */
    const step = async (expected: number[]) => {
      repo.checkInvariants();
      const oct = summarizeToPay(await repo.listCommitments(ctx, OCT), ctx, OCT, today);
      const nov = summarizeToPay(await repo.listCommitments(ctx, NOV), ctx, NOV, today);
      const paid = summarizeMonth(await repo.listRecords(ctx, OCT), ctx, OCT).paidCents;
      expect([oct.toPayCents, paid, nov.toPayCents, oct.estimatedCents, nov.estimatedCents].map(reais)).toEqual(expected);
    };
    const pick = (list: readonly Commitment[]) => list.map((c) => [c.series!.number, c.dueOn, c.amountCents, c.amountIsEstimate]);

    // 1. Escola, R$ 1.200,00, dia 10, de outubro a dezembro: n1 em 10/10 e n2 em 10/11.
    const escola = await repo.createSeries(newOperationKey(), ctx, mensal('Escola', 120000, 10, OCT, DEC));
    expect(pick(escola.occurrences)).toEqual([
      [1, '2026-10-10', 120000, false],
      [2, '2026-11-10', 120000, false],
    ]);
    expect([escola.changed, escola.series.lastNumber, escola.series.version]).toEqual([2, 3, 1]);
    await step([1200, 0, 1200, 0, 0]);

    // 2. Gerar de novo: nada novo.
    expect(await repo.syncSeriesOccurrences(ctx)).toEqual({ created: 0, createdOverdue: 0 });
    await step([1200, 0, 1200, 0, 0]);

    // 3. Financiamento do carro: 48 parcelas, próxima 14 em outubro, R$ 980,00, dia 20.
    const carroInput: SeriesInput = {
      kind: 'parcelada',
      nature: 'financiamento',
      description: 'Financiamento do carro',
      category: 'Transporte',
      amountCents: 98000,
      amountMode: 'fixo',
      dueDay: 20,
      firstDueMonth: OCT,
      firstNumber: 14,
      installmentTotal: 48,
      lastMonth: null,
    };
    const carroW = await repo.createSeries(newOperationKey(), ctx, carroInput);
    expect(pick(carroW.occurrences)).toEqual([
      [14, '2026-10-20', 98000, false],
      [15, '2026-11-20', 98000, false],
    ]);
    expect(seriesDueOn(carroW.series, 48)).toBe('2029-08-20');
    expect(occurrenceLabel(carroW.occurrences[0]!)).toBe('Parcela 14 de 48');
    await step([2180, 0, 2180, 0, 0]);

    // 4. Luz, valor que muda, referência R$ 210,00, dia 12: estimadas.
    const luzInput = mensal('Luz', 21000, 12, OCT, null, 'variavel');
    const luz = await repo.createSeries(newOperationKey(), ctx, luzInput);
    expect(pick(luz.occurrences)).toEqual([
      [1, '2026-10-12', 21000, true],
      [2, '2026-11-12', 21000, true],
    ]);
    await step([2390, 0, 2390, 210, 210]);

    // 5. Pagar a Luz de outubro: R$ 232,40 em 07/10. Um único gasto.
    const luzOct = await byNumber(luz.series.id, 1);
    const payKey = newOperationKey();
    const paidLuz = await repo.payCommitment(payKey, luzOct.id, luzOct.version, payment(23240, '2026-10-07'));
    expect((await repo.listRecords(ctx, OCT)).filter((r) => r.commitmentId === luzOct.id)).toHaveLength(1);
    expect(await byNumber(luz.series.id, 2)).toMatchObject({ amountCents: 21000, amountIsEstimate: true });
    await step([2180, 232.4, 2390, 0, 210]);

    // 6. Repetir o pagamento (mesma chave): nada muda.
    const again = await repo.payCommitment(payKey, luzOct.id, luzOct.version, payment(23240, '2026-10-07'));
    expect(again.record.id).toBe(paidLuz.record.id);
    expect(await repo.listRecords(ctx, OCT)).toHaveLength(1);
    await step([2180, 232.4, 2390, 0, 210]);

    // 7. "Informar o valor da conta" na Luz de novembro com R$ 210,00: deixa de ser estimada e fica alterada só no mês.
    const luzNov = await byNumber(luz.series.id, 2);
    const informed = await repo.updateCommitment(newOperationKey(), luzNov.id, luzNov.version, {
      description: 'Luz',
      amountCents: 21000,
      dueOn: '2026-11-12',
      category: 'Moradia',
      amountIsEstimate: false,
    });
    expect(informed.commitment).toMatchObject({ amountCents: 21000, amountIsEstimate: false, seriesOverride: true, version: 2 });
    await step([2180, 232.4, 2390, 0, 0]);

    // 8. Excluir só a Escola de novembro: novembro pulado.
    const escolaNov = await byNumber(escola.series.id, 2);
    await repo.deleteCommitment(newOperationKey(), escolaNov.id, escolaNov.version);
    expect((await repo.getSeries(escola.series.id))!.skippedNumbers).toEqual([2]);
    await step([2180, 232.4, 1190, 0, 0]);

    // 9. "Esta e as próximas" no carro a partir da parcela 15: R$ 1.010,00. A 14 continua R$ 980,00.
    const carroOcc = await occurrences(carroW.series.id);
    const plan = affectedByEditFrom(carroOcc, carroW.series, 15);
    if (!plan.ok) throw new Error('esperava ok');
    const before15 = await byNumber(carroW.series.id, 15);
    const edited = await repo.updateSeriesFrom(
      newOperationKey(),
      carroW.series.id,
      carroW.series.version,
      15,
      plan.affected,
      edit(carroInput, { amountCents: 101000 }),
    );
    expect(edited.changed).toBe(1);
    expect(edited.series.version).toBe(2);
    expect(edited.series.terms.map((t) => [t.fromNumber, t.amountCents])).toEqual([
      [14, 98000],
      [15, 101000],
    ]);
    expect(await byNumber(carroW.series.id, 15)).toMatchObject({ amountCents: 101000, version: before15.version + 1 });
    expect(await byNumber(carroW.series.id, 14)).toMatchObject({ amountCents: 98000, version: 1 });
    await step([2180, 232.4, 1220, 0, 0]);

    // 10. "Só esta conta" na Escola de outubro com vencimento 05/11: recusado.
    const escolaOct = await byNumber(escola.series.id, 1);
    await expect(
      repo.updateCommitment(newOperationKey(), escolaOct.id, escolaOct.version, {
        description: 'Escola',
        amountCents: 120000,
        dueOn: '2026-11-05',
        category: 'Moradia',
      }),
    ).rejects.toMatchObject({ code: 'vencimento_fora_do_mes' });
    await step([2180, 232.4, 1220, 0, 0]);

    // 11. Hoje = 02/11/2026: entram Escola 10/12 (n3), parcela 16 do carro (R$ 1.010,00) e Luz 12/12 (estimada).
    now('2026-11-02');
    expect(await repo.syncSeriesOccurrences(ctx)).toEqual({ created: 3, createdOverdue: 0 });
    const dec = summarizeToPay(await repo.listCommitments(ctx, DEC), ctx, DEC, today);
    expect(dec.items.map((c) => [c.description, c.series!.number, c.dueOn, c.amountCents, c.amountIsEstimate])).toEqual([
      ['Escola', 3, '2026-12-10', 120000, false],
      ['Luz', 3, '2026-12-12', 21000, true],
      ['Financiamento do carro', 16, '2026-12-20', 101000, false],
    ]);
    expect(dec.toPayCents).toBe(242000);
    expect(seriesNumbers(await occurrences(escola.series.id))).toEqual([3, 1]); // novembro não volta
    repo.checkInvariants();

    // 12. Encerrar a Luz com "nenhuma conta": outubro está paga.
    const luzNow = (await repo.getSeries(luz.series.id))!;
    await expect(repo.endSeries(newOperationKey(), luzNow.id, luzNow.version, 0, [])).rejects.toMatchObject({
      code: 'serie_tem_pagamento_posterior',
    });

    // 13. Encerrar a Luz com última conta em outubro: novembro e dezembro saem; outubro, paga, continua.
    const endPlan = affectedByEnd(await occurrences(luzNow.id), luzNow, 1);
    if (!endPlan.ok) throw new Error('esperava ok');
    expect(endPlan.text).toBe('2 contas em aberto depois de outubro vão sair da lista. As contas pagas continuam no histórico.');
    const ended = await repo.endSeries(newOperationKey(), luzNow.id, luzNow.version, 1, endPlan.affected);
    expect(ended.changed).toBe(2);
    expect(ended.series).toMatchObject({ lastNumber: 1, version: luzNow.version + 1 });
    expect(ended.occurrences.map((c) => [c.series!.number, c.status])).toEqual([[1, 'quitado']]);
    expect(ended.series.skippedNumbers).toEqual([]);
    repo.checkInvariants();

    // 14. Retomar ("Sem data para terminar"): novembro e dezembro voltam estimadas em R$ 210,00, sem a marca de alterada.
    const resumed = await repo.endSeries(newOperationKey(), luzNow.id, ended.series.version, null, []);
    expect(resumed.occurrences.map((c) => [c.series!.number, c.dueOn, c.amountCents, c.amountIsEstimate, c.seriesOverride, c.status])).toEqual([
      [1, '2026-10-12', 21000, true, false, 'quitado'],
      [2, '2026-11-12', 21000, true, false, 'aberto'],
      [3, '2026-12-12', 21000, true, false, 'aberto'],
    ]);
    expect(resumed.series.lastNumber).toBeNull();
    repo.checkInvariants();

    // 15. Hoje = 15/03/2027 (ausência longa): carro cria 18, 19 e 20, não 17; Luz cria fevereiro, março e abril.
    now('2027-03-15');
    expect(await repo.syncSeriesOccurrences(ctx)).toEqual({ created: 6, createdOverdue: 3 });
    const carroNow = (await repo.getSeries(carroW.series.id))!;
    const carroList = await occurrences(carroNow.id);
    expect(seriesNumbers(carroList)).toEqual([20, 19, 18, 16, 15, 14]);
    expect(missingMonths(carroNow, carroList, today)).toEqual([{ number: 17, month: '2027-01' }]);
    const luzList = await occurrences(luzNow.id);
    expect(seriesNumbers(luzList)).toEqual([7, 6, 5, 3, 2, 1]);
    expect(missingMonths((await repo.getSeries(luzNow.id))!, luzList, today)).toEqual([{ number: 4, month: '2027-01' }]);
    const overdue = [...carroList, ...luzList].filter((c) => c.status === 'aberto' && c.dueOn < today && c.dueOn >= '2027-02-01');
    expect(overdue.map((c) => c.dueOn).sort()).toEqual(['2027-02-12', '2027-02-20', '2027-03-12']);
    expect(seriesNumbers(await occurrences(escola.series.id))).toEqual([3, 1]);
    expect(await repo.syncSeriesOccurrences(ctx)).toEqual({ created: 0, createdOverdue: 0 });
    repo.checkInvariants();
  });

  it('idempotência das quatro escritas de série e reconciliação', async () => {
    const { repo, ctx, mensal, edit, occurrences } = await freshRepo();
    const input = mensal('Aluguel', 250000, 5, OCT, null);
    const createKey = newOperationKey();
    repo.failNextWrite = 'depois';
    await expect(repo.createSeries(createKey, ctx, input)).rejects.toMatchObject({ code: 'rede' });
    const op = await repo.findSeriesOperation(createKey);
    expect(op).toEqual({ action: 'criar_serie', seriesId: expect.any(String) });
    const created = await repo.createSeries(createKey, ctx, { ...input, description: ' Aluguel ' });
    expect([created.series.id, created.changed]).toEqual([op!.seriesId, 0]);
    expect(await repo.listSeries(ctx)).toHaveLength(1);
    expect(await repo.findCommitmentOperation(createKey)).toBeNull();
    expect(await repo.findOperation(createKey)).toBeNull();

    const failedKey = newOperationKey();
    repo.failNextWrite = 'antes';
    await expect(repo.createSeries(failedKey, ctx, input)).rejects.toMatchObject({ code: 'rede' });
    expect(await repo.findSeriesOperation(failedKey)).toBeNull();
    expect(await repo.listSeries(ctx)).toHaveLength(1);

    const s = created.series;
    const plan = affectedByEditFrom(await occurrences(s.id), s, 2);
    if (!plan.ok) throw new Error('esperava ok');
    const editKey = newOperationKey();
    const newValue = edit(input, { amountCents: 265000 });
    const e1 = await repo.updateSeriesFrom(editKey, s.id, s.version, 2, plan.affected, newValue);
    const e2 = await repo.updateSeriesFrom(editKey, s.id, s.version, 2, plan.affected, newValue);
    expect(e2).toEqual({ ...e1, changed: 0 });
    expect(e2.series.version).toBe(2);
    await expect(repo.updateSeriesFrom(editKey, s.id, s.version, 2, plan.affected, edit(input, { amountCents: 1 }))).rejects.toMatchObject({
      code: 'chave_reutilizada',
    });

    const endKey = newOperationKey();
    const endPlan = affectedByEnd(await occurrences(s.id), e1.series, 1);
    if (!endPlan.ok) throw new Error('esperava ok');
    const n1 = await repo.endSeries(endKey, s.id, e1.series.version, 1, endPlan.affected);
    expect(await repo.endSeries(endKey, s.id, e1.series.version, 1, endPlan.affected)).toEqual({ ...n1, changed: 0 });

    const delKey = newOperationKey();
    const delPlan = affectedByDelete(await occurrences(s.id), n1.series);
    if (!delPlan.ok) throw new Error('esperava ok');
    const d1 = await repo.deleteSeries(delKey, s.id, n1.series.version, delPlan.affected);
    expect(d1.occurrences).toEqual([]);
    expect(await repo.deleteSeries(delKey, s.id, n1.series.version, delPlan.affected)).toEqual({ ...d1, changed: 0 });
    expect(await repo.findSeriesOperation(delKey)).toEqual({ action: 'excluir_serie', seriesId: s.id });

    // Mesma chave em outra ação ou em outro tipo de escrita: chave_reutilizada.
    await expect(repo.endSeries(createKey, s.id, d1.series.version, null, [])).rejects.toMatchObject({ code: 'chave_reutilizada' });
    await expect(repo.createCommitment(createKey, ctx, { description: 'Aluguel', amountCents: 1, dueOn: '2026-10-05', category: null })).rejects.toMatchObject(
      { code: 'chave_reutilizada' },
    );
    const commitmentKey = newOperationKey();
    await repo.createCommitment(commitmentKey, ctx, { description: 'Internet', amountCents: 15000, dueOn: '2026-10-15', category: null });
    await expect(repo.createSeries(commitmentKey, ctx, input)).rejects.toMatchObject({ code: 'chave_reutilizada' });
    expect(await repo.findSeriesOperation(commitmentKey)).toBeNull();
    repo.checkInvariants();
  });

  it('versão nula, conjunto afetado diferente, nulo ou só com ids: versao_desatualizada sem gravar nada', async () => {
    const { repo, ctx, mensal, edit, occurrences, byNumber } = await freshRepo();
    const input = mensal('Aluguel', 250000, 5, OCT, null);
    const { series: s } = await repo.createSeries(newOperationKey(), ctx, input);
    const plan = affectedByEditFrom(await occurrences(s.id), s, 1);
    if (!plan.ok) throw new Error('esperava ok');
    const none = null as unknown as number;
    const attempts: [string, (key: string) => Promise<unknown>][] = [
      ['editar sem versão', (k) => repo.updateSeriesFrom(k, s.id, none, 1, plan.affected, edit(input))],
      ['encerrar sem versão', (k) => repo.endSeries(k, s.id, none, 0, plan.affected)],
      ['excluir sem versão', (k) => repo.deleteSeries(k, s.id, none, plan.affected)],
      ['conjunto nulo', (k) => repo.updateSeriesFrom(k, s.id, s.version, 1, null as unknown as [], edit(input))],
      ['só ids', (k) => repo.updateSeriesFrom(k, s.id, s.version, 1, plan.affected.map((a) => ({ id: a.id })) as never, edit(input))],
      ['versão em texto', (k) => repo.endSeries(k, s.id, s.version, 0, plan.affected.map((a) => ({ id: a.id, version: String(a.version) })) as never)],
      ['conjunto incompleto', (k) => repo.deleteSeries(k, s.id, s.version, plan.affected.slice(1))],
    ];
    for (const [, run] of attempts) {
      const key = newOperationKey();
      await expect(run(key)).rejects.toMatchObject({ code: 'versao_desatualizada' });
      expect(await repo.findSeriesOperation(key)).toBeNull();
    }
    // A ordem e a repetição não importam (igualdade de conjuntos).
    const reversed = [...plan.affected].reverse();
    // Conta alterada "só esta" em outro aparelho entre a confirmação e o envio.
    const oct = await byNumber(s.id, 1);
    await repo.updateCommitment(newOperationKey(), oct.id, oct.version, { description: 'Aluguel', amountCents: 255000, dueOn: '2026-10-05', category: 'Moradia' });
    await expect(repo.updateSeriesFrom(newOperationKey(), s.id, s.version, 1, reversed, edit(input))).rejects.toMatchObject({
      code: 'versao_desatualizada',
    });
    expect((await repo.getSeries(s.id))!.version).toBe(1);
    const fresh = affectedByEditFrom(await occurrences(s.id), s, 1);
    if (!fresh.ok) throw new Error('esperava ok');
    const done = await repo.updateSeriesFrom(newOperationKey(), s.id, s.version, 1, [...fresh.affected, ...fresh.affected].reverse(), edit(input));
    expect(done.changed).toBe(2);
    repo.checkInvariants();
  });

  it('"esta e as próximas" a partir de uma conta alterada muda essa conta e tira a marca; outras alteradas não mudam', async () => {
    const { repo, ctx, mensal, edit, occurrences, byNumber, setToday } = await freshRepo();
    const input = mensal(LUZ_TERM.description, LUZ_TERM.amountCents, LUZ_TERM.dueDay, OCT, null, 'variavel');
    const { series: s } = await repo.createSeries(newOperationKey(), ctx, input);
    setToday('2026-11-02');
    await repo.syncSeriesOccurrences(ctx); // 1, 2 e 3
    for (const n of [2, 3]) {
      const c = await byNumber(s.id, n);
      await repo.updateCommitment(newOperationKey(), c.id, c.version, { description: 'Luz', amountCents: 20000 + n, dueOn: c.dueOn, category: 'Moradia' });
    }
    // Sem amountIsEstimate a marca de estimado fica; a conta passa a ser alterada só no mês.
    expect(await byNumber(s.id, 2)).toMatchObject({ amountCents: 20002, amountIsEstimate: true, seriesOverride: true });
    const plan = affectedByEditFrom(await occurrences(s.id), s, 2);
    if (!plan.ok) throw new Error('esperava ok');
    expect(plan.affected.map((a) => a.id)).toEqual([(await byNumber(s.id, 2)).id]);
    const w = await repo.updateSeriesFrom(newOperationKey(), s.id, s.version, 2, plan.affected, edit(input, { amountCents: 19000, amountMode: 'fixo', dueDay: 15 }));
    expect(w.occurrences.map((c) => [c.series!.number, c.dueOn, c.amountCents, c.amountIsEstimate, c.seriesOverride])).toEqual([
      [1, '2026-10-12', 21000, true, false],
      [2, '2026-11-15', 19000, false, false],
      [3, '2026-12-12', 20003, true, true],
    ]);
    // Vencimento dentro do mês é aceito; true em amountIsEstimate é recusado.
    const n1 = await byNumber(s.id, 1);
    const moved = await repo.updateCommitment(newOperationKey(), n1.id, n1.version, { description: 'Luz', amountCents: 21000, dueOn: '2026-10-25', category: 'Moradia' });
    expect(moved.commitment).toMatchObject({ dueOn: '2026-10-25', seriesOverride: true, amountIsEstimate: true });
    await expect(
      repo.updateCommitment(newOperationKey(), n1.id, moved.commitment.version, {
        description: 'Luz',
        amountCents: 21000,
        dueOn: '2026-10-25',
        category: 'Moradia',
        amountIsEstimate: true as unknown as false,
      }),
    ).rejects.toMatchObject({ code: 'estimativa_invalida' });
    repo.checkInvariants();
  });

  it('pagar uma ocorrência cria exatamente um gasto; desfazer e excluir o gasto reabrem', async () => {
    const { repo, ctx, mensal, byNumber, payment } = await freshRepo();
    const { series: s } = await repo.createSeries(newOperationKey(), ctx, mensal('Escola', 120000, 10, OCT, DEC));
    const oct = await byNumber(s.id, 1);
    const paid = await repo.payCommitment(newOperationKey(), oct.id, oct.version, payment(120000, '2026-10-07'));
    expect(paid.record).toMatchObject({ kind: 'despesa', description: 'Escola', amountCents: 120000, commitmentId: oct.id });
    expect((await repo.listRecords(ctx, OCT)).filter((r) => r.commitmentId === oct.id)).toHaveLength(1);
    expect((await repo.getSeries(s.id))!).toMatchObject({ paidCount: 1, openCount: 1 });
    // Conta paga de série: "esta e as próximas" não começa nela e não pode ser excluída a série.
    await expect(repo.updateSeriesFrom(newOperationKey(), s.id, s.version, 1, [], { nature: 'conta', description: 'Escola', category: null, amountCents: 1, amountMode: 'fixo', dueDay: 10 })).rejects.toMatchObject({
      code: 'inicio_em_conta_paga',
    });
    await expect(repo.deleteSeries(newOperationKey(), s.id, s.version, [])).rejects.toMatchObject({ code: 'serie_tem_pagamentos' });

    const undone = await repo.undoCommitmentPayment(newOperationKey(), oct.id, paid.commitment.version);
    expect(undone.commitment).toMatchObject({ status: 'aberto', payment: null });
    const again = await repo.payCommitment(newOperationKey(), oct.id, undone.commitment.version, payment(121000, '2026-10-07'));
    await repo.deleteRecord(newOperationKey(), again.record.id, again.record.version);
    expect(await repo.getCommitment(oct.id)).toMatchObject({ status: 'aberto', payment: null, amountCents: 120000 });
    expect(await repo.listRecords(ctx, OCT)).toEqual([]);
    repo.checkInvariants();
  });

  it('limites e recusas: número fora da série, tipo, término, permissão e 100 gastos fixos ativos', async () => {
    const { repo, ctx, mensal, edit, occurrences } = await freshRepo();
    const input = mensal('Aluguel', 250000, 5, OCT, null);
    const { series: s } = await repo.createSeries(newOperationKey(), ctx, input);
    // Sem término: até 12 meses depois do mês atual (número 13).
    await expect(repo.updateSeriesFrom(newOperationKey(), s.id, s.version, 14, [], edit(input))).rejects.toMatchObject({ code: 'numero_fora_da_serie' });
    await expect(repo.updateSeriesFrom(newOperationKey(), s.id, s.version, 0, [], edit(input))).rejects.toMatchObject({ code: 'numero_fora_da_serie' });
    await expect(repo.updateSeriesFrom(newOperationKey(), s.id, s.version, 2, [], edit(input, { nature: 'financiamento' }))).rejects.toMatchObject({
      code: 'natureza_invalida',
    });
    await expect(repo.updateSeriesFrom(newOperationKey(), s.id, s.version, 2, [], edit(input, { dueDay: 32 }))).rejects.toMatchObject({ code: 'dia_invalido' });
    const scheduled = await repo.updateSeriesFrom(newOperationKey(), s.id, s.version, 13, [], edit(input, { amountCents: 265000 }));
    expect([scheduled.changed, scheduled.series.terms.map((t) => t.fromNumber)]).toEqual([0, [1, 13]]);
    for (const last of [-1, 601, 1.5]) {
      await expect(repo.endSeries(newOperationKey(), s.id, scheduled.series.version, last, [])).rejects.toMatchObject({ code: 'fim_invalido' });
    }
    await expect(repo.endSeries(newOperationKey(), 'serie-inexistente', 1, null, [])).rejects.toMatchObject({ code: 'nao_encontrado' });
    await expect(repo.syncSeriesOccurrences('outro-contexto')).rejects.toMatchObject({ code: 'sem_permissao' });
    await expect(repo.createSeries(newOperationKey(), 'outro-contexto', input)).rejects.toMatchObject({ code: 'sem_permissao' });
    await expect(repo.createSeries(newOperationKey(), ctx, { ...input, firstDueMonth: '2026-08' })).rejects.toMatchObject({
      code: 'inicio_fora_do_intervalo',
    });

    // Parcelado: tipo trocado vale para a série inteira (lido pela junção); término entre primeiro − 1 e o total.
    const carroInput: SeriesInput = { ...input, kind: 'parcelada', nature: 'financiamento', description: 'Carro', firstDueMonth: NOV, firstNumber: 13, installmentTotal: 48 };
    const { series: c } = await repo.createSeries(newOperationKey(), ctx, carroInput);
    for (const last of [null, 11, 49]) {
      await expect(repo.endSeries(newOperationKey(), c.id, c.version, last, [])).rejects.toMatchObject({ code: 'fim_invalido' });
    }
    await expect(repo.updateSeriesFrom(newOperationKey(), c.id, c.version, 14, [], edit(carroInput, { nature: 'conta' }))).rejects.toMatchObject({
      code: 'natureza_invalida',
    });
    await expect(repo.updateSeriesFrom(newOperationKey(), c.id, c.version, 49, [], edit(carroInput))).rejects.toMatchObject({ code: 'numero_fora_da_serie' });
    const retyped = await repo.updateSeriesFrom(newOperationKey(), c.id, c.version, 14, [], edit(carroInput, { nature: 'compra_parcelada' }));
    expect(retyped.series.nature).toBe('compra_parcelada');
    expect((await occurrences(c.id))[0]!.series).toMatchObject({ number: 13, nature: 'compra_parcelada', installmentTotal: 48 });
    expect((await occurrences(c.id))[0]!.version).toBe(1); // a conta 13 não mudou
    const endPlan = affectedByEnd(await occurrences(c.id), c, 12);
    if (!endPlan.ok) throw new Error('esperava ok');
    const none = await repo.endSeries(newOperationKey(), c.id, retyped.series.version, 12, endPlan.affected);
    expect([none.changed, none.series.lastNumber, none.occurrences]).toEqual([1, 12, []]);
    expect(seriesEnded(none.series, DEMO_TODAY)).toBe(true);

    // 100 gastos fixos ativos: o próximo é recusado; excluir um libera.
    const ids: string[] = [];
    for (let i = (await repo.listSeries(ctx)).length; i < 100; i++) {
      ids.push((await repo.createSeries(newOperationKey(), ctx, mensal(`Gasto ${i}`, 1000, 1, '2027-01', null))).series.id);
    }
    // O parcelamento encerrado sem contas ainda conta: o último mês dele (outubro) não é anterior a setembro.
    const key = newOperationKey();
    await expect(repo.createSeries(key, ctx, mensal('Mais um', 1000, 1, '2027-01', null))).rejects.toMatchObject({ code: 'limite_de_gastos_fixos' });
    expect(await repo.findSeriesOperation(key)).toBeNull();
    const last = (await repo.getSeries(ids[0]!))!;
    await repo.deleteSeries(newOperationKey(), last.id, last.version, []);
    await repo.createSeries(key, ctx, mensal('Mais um', 1000, 1, '2027-01', null));
    expect(await repo.listSeries(ctx)).toHaveLength(100);
    repo.checkInvariants();
  });

  it('excluir o gasto fixo sem conta paga: some de tudo e a sincronização não recria', async () => {
    const { repo, ctx, mensal, occurrences } = await freshRepo();
    const { series: s } = await repo.createSeries(newOperationKey(), ctx, mensal('Escola', 120000, 10, OCT, DEC));
    const plan = affectedByDelete(await occurrences(s.id), s);
    if (!plan.ok) throw new Error('esperava ok');
    expect(plan.text).toBe('2 contas em aberto vão sair da lista.');
    const del = await repo.deleteSeries(newOperationKey(), s.id, s.version, plan.affected);
    expect([del.changed, del.series.version, del.occurrences]).toEqual([2, 2, []]);
    expect(await repo.getSeries(s.id)).toBeNull();
    expect(await repo.listSeries(ctx)).toEqual([]);
    expect(await occurrences(s.id)).toEqual([]);
    expect(await repo.listCommitments(ctx, OCT)).toEqual([]);
    expect(await repo.syncSeriesOccurrences(ctx)).toEqual({ created: 0, createdOverdue: 0 });
    await expect(repo.endSeries(newOperationKey(), s.id, del.series.version, null, [])).rejects.toMatchObject({ code: 'nao_encontrado' });
    repo.checkInvariants();
  });

  it('listSeriesOccurrences: por número decrescente, até 60', async () => {
    const { repo, ctx, mensal, setToday } = await freshRepo('2026-09-01');
    const { series: s } = await repo.createSeries(newOperationKey(), ctx, mensal('Aluguel', 250000, 5, '2026-09', null));
    for (let i = 1; i <= 64; i++) {
      setToday(`${addMonths('2026-09', i)}-01`);
      await repo.syncSeriesOccurrences(ctx);
    }
    const list = await repo.listSeriesOccurrences(s.id);
    expect(list).toHaveLength(60);
    expect(list[0]!.series!.number).toBe(66);
    expect(seriesNumbers(list)).toEqual([...seriesNumbers(list)].sort((a, b) => b - a));
    const full = (await repo.getSeries(s.id))!;
    expect(full.openCount).toBe(66);
    // A lista cortada não vira "sem conta registrada": os números antes da 7ª são desconhecidos, não ausentes.
    expect(missingMonths(full, list, '2032-01-01')).toEqual([]);
    expect(missingMonths({ ...full, openCount: 0 }, list, '2032-01-01').map((m) => m.number)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(installmentProgress({ ...full, paidCount: 3 }, list, await repo.listOpenSeriesOccurrences(s.id), '2032-01-01').paidInApp).toBe(3);
  });

  it('mergeOccurrences: sem repetir conta, fica a de maior versão, por número decrescente', () => {
    const s = series();
    const old = occ(s, 2);
    const newer = occ(s, 2, { version: 3, amountCents: 1 });
    expect(mergeOccurrences([occ(s, 3), old], [occ(s, 1), newer, occ(s, 3)])).toEqual([occ(s, 3), newer, occ(s, 1)]);
    expect(mergeOccurrences([newer], [old])).toEqual([newer]);
    expect(mergeOccurrences()).toEqual([]);
  });

  it('mais de 60 contas em aberto: com listOpenSeriesOccurrences, o conjunto afetado é o que a escrita confere', async () => {
    const { repo, ctx, mensal, edit, setToday } = await freshRepo('2026-09-01');
    const inputs = ['Aluguel', 'Escola', 'Academia'].map((d) => mensal(d, 100000, 5, '2026-09', null));
    const ids: string[] = [];
    for (const input of inputs) ids.push((await repo.createSeries(newOperationKey(), ctx, input)).series.id);
    for (let i = 1; i <= 64; i++) {
      setToday(`${addMonths('2026-09', i)}-01`);
      await repo.syncSeriesOccurrences(ctx);
    }
    const lists = async (id: string) => {
      const capped = await repo.listSeriesOccurrences(id);
      const open = await repo.listOpenSeriesOccurrences(id);
      return { s: (await repo.getSeries(id))!, capped, open, all: mergeOccurrences(capped, open) };
    };
    const [a, b, c] = [await lists(ids[0]!), await lists(ids[1]!), await lists(ids[2]!)];
    // Todas as 66 em aberto, por número crescente, sem limite; a lista do histórico continua com 60.
    expect(a.s.openCount).toBe(66);
    expect(a.capped).toHaveLength(60);
    expect(seriesNumbers(a.open)).toEqual(Array.from({ length: 66 }, (_, i) => i + 1));
    expect(a.open.every((o) => o.status === 'aberto')).toBe(true);
    expect(seriesNumbers(a.all)).toEqual(Array.from({ length: 66 }, (_, i) => 66 - i));
    expect(await repo.listOpenSeriesOccurrences('serie-inexistente')).toEqual([]);

    // "Esta e as próximas" a partir da 2: a lista cortada vê 60 contas; o banco confere 65.
    const newTerm = edit(inputs[0]!, { amountCents: 110000 });
    const editCapped = affectedByEditFrom(a.capped, a.s, 2);
    const editAll = affectedByEditFrom(a.all, a.s, 2);
    if (!editCapped.ok || !editAll.ok) throw new Error('esperava ok');
    expect([editCapped.affected.length, editAll.affected.length]).toEqual([60, 65]);
    await expect(repo.updateSeriesFrom(newOperationKey(), a.s.id, a.s.version, 2, editCapped.affected, newTerm)).rejects.toMatchObject({
      code: 'versao_desatualizada',
    });
    const edited = await repo.updateSeriesFrom(newOperationKey(), a.s.id, a.s.version, 2, editAll.affected, newTerm);
    expect(edited.changed).toBe(65);
    expect(edited.occurrences.filter((o) => o.amountCents === 110000).map((o) => o.series!.number)).toEqual(
      Array.from({ length: 65 }, (_, i) => i + 2),
    );

    // Encerrar com a última conta em novembro de 2026 (3): saem 63, não 60.
    const endCapped = affectedByEnd(b.capped, b.s, 3);
    const endAll = affectedByEnd(b.all, b.s, 3);
    if (!endCapped.ok || !endAll.ok) throw new Error('esperava ok');
    expect([endCapped.removed.length, endAll.removed.length]).toEqual([60, 63]);
    expect(endAll.text).toBe('63 contas em aberto depois de novembro vão sair da lista. As contas pagas continuam no histórico.');
    await expect(repo.endSeries(newOperationKey(), b.s.id, b.s.version, 3, endCapped.affected)).rejects.toMatchObject({
      code: 'versao_desatualizada',
    });
    const ended = await repo.endSeries(newOperationKey(), b.s.id, b.s.version, 3, endAll.affected);
    expect([ended.changed, seriesNumbers(ended.occurrences)]).toEqual([63, [1, 2, 3]]);

    // Excluir: saem as 66.
    const delCapped = affectedByDelete(c.capped, c.s);
    const delAll = affectedByDelete(c.all, c.s);
    if (!delCapped.ok || !delAll.ok) throw new Error('esperava ok');
    expect([delCapped.removed.length, delAll.removed.length]).toEqual([60, 66]);
    await expect(repo.deleteSeries(newOperationKey(), c.s.id, c.s.version, delCapped.affected)).rejects.toMatchObject({
      code: 'versao_desatualizada',
    });
    const deleted = await repo.deleteSeries(newOperationKey(), c.s.id, c.s.version, delAll.affected);
    expect(deleted.changed).toBe(66);
    expect(await repo.listOpenSeriesOccurrences(c.s.id)).toEqual([]);
    repo.checkInvariants();
  });

  it('parcelamento com mais de 60 contas vivas e uma parcela antiga em aberto: "Faltam" e a soma contam essa parcela', async () => {
    const { repo, ctx, payment, setToday } = await freshRepo('2026-09-01');
    const input: SeriesInput = {
      kind: 'parcelada',
      nature: 'financiamento',
      description: 'Financiamento da casa',
      category: 'Moradia',
      amountCents: 100000,
      amountMode: 'fixo',
      dueDay: 5,
      firstDueMonth: '2026-09',
      firstNumber: 1,
      installmentTotal: 360,
      lastMonth: null,
    };
    const { series: created } = await repo.createSeries(newOperationKey(), ctx, input);
    const pay = async (n: number, paidOn: string) => {
      const c = (await repo.listOpenSeriesOccurrences(created.id)).find((o) => o.series!.number === n)!;
      await repo.payCommitment(newOperationKey(), c.id, c.version, payment(100000, paidOn));
    };
    // Paga todo mês por 63 meses, menos a parcela 2 (outubro de 2026), que fica em aberto.
    await pay(1, '2026-09-01');
    let today = '2026-09-01';
    for (let i = 1; i <= 62; i++) {
      today = `${addMonths('2026-09', i)}-01`;
      setToday(today);
      await repo.syncSeriesOccurrences(ctx);
      if (i + 1 !== 2) await pay(i + 1, today);
    }
    expect(today).toBe('2031-11-01');
    const s = (await repo.getSeries(created.id))!;
    expect([s.paidCount, s.openCount]).toEqual([62, 2]);
    const capped = await repo.listSeriesOccurrences(s.id);
    const open = await repo.listOpenSeriesOccurrences(s.id);
    expect([capped.length, capped[capped.length - 1]!.series!.number]).toEqual([60, 5]);
    expect(seriesNumbers(open)).toEqual([2, 64]);
    // As parcelas antes da 5 não são "sem conta registrada": são desconhecidas pela lista cortada.
    expect(missingMonths(s, capped, today)).toEqual([]);

    // Faltam: a 2 (em aberto, fora das 60 mais recentes), a 64 e as 296 ainda não criadas.
    expect(installmentProgress(s, capped, open, today)).toEqual({
      total: 360,
      paidBefore: 0,
      paidInApp: 62,
      remaining: 298,
      lastDueOn: '2056-08-05',
      remainingCents: 298 * 100000,
      approximate: false,
    });

    // A parcela antiga entra com o valor dela: alterada só neste mês para R$ 1.200,00 e com valor que muda.
    const old = open[0]!;
    await repo.updateCommitment(newOperationKey(), old.id, old.version, {
      description: old.description,
      amountCents: 120000,
      dueOn: old.dueOn,
      category: old.category,
    });
    const open2 = await repo.listOpenSeriesOccurrences(s.id);
    // A lista em aberto mais nova vence a cópia antiga da mesma conta.
    expect(installmentProgress(s, [...capped, old], open2, today)).toMatchObject({ remaining: 298, remainingCents: 297 * 100000 + 120000 });

    // Paga a 2: sai da soma; nada antes da 5 vira parcela que falta.
    await pay(2, today);
    const s2 = (await repo.getSeries(s.id))!;
    expect(installmentProgress(s2, await repo.listSeriesOccurrences(s.id), await repo.listOpenSeriesOccurrences(s.id), today)).toMatchObject({
      paidInApp: 63,
      remaining: 297,
      remainingCents: 297 * 100000,
    });
    repo.checkInvariants();
  });

  it('retomar um gasto fixo que já não contava respeita o limite de 100 ativos (como end_series)', async () => {
    const { repo, ctx, mensal, occurrences } = await freshRepo();
    const today = '2026-10-07';
    // X desde setembro; "nenhuma conta" (último mês agosto, antes de setembro) faz ele deixar de contar.
    const { series: x0 } = await repo.createSeries(newOperationKey(), ctx, mensal('X', 1000, 1, '2026-09', null));
    const stop = affectedByEnd(await occurrences(x0.id), x0, 0);
    if (!stop.ok) throw new Error(stop.code);
    const x = (await repo.endSeries(newOperationKey(), x0.id, x0.version, 0, stop.affected)).series;
    expect(seriesCountsTowardLimit(x, today)).toBe(false);
    const ids: string[] = [];
    for (let i = 0; i < 100; i++) ids.push((await repo.createSeries(newOperationKey(), ctx, mensal(`Gasto ${i}`, 1000, 1, '2027-01', null))).series.id);

    // Sem término, até outubro ou até setembro (o mês anterior a hoje): X voltaria a contar. Nada é gravado.
    for (const last of [null, 2, 1]) {
      const key = newOperationKey();
      await expect(repo.endSeries(key, x.id, x.version, last, [])).rejects.toMatchObject({ code: 'limite_de_gastos_fixos' });
      expect(await repo.findSeriesOperation(key)).toBeNull();
    }
    expect(await repo.getSeries(x.id)).toEqual(x);
    expect(await occurrences(x.id)).toEqual([]);
    // Continuar sem contar passa.
    const still = await repo.endSeries(newOperationKey(), x.id, x.version, 0, []);
    expect(still.series).toMatchObject({ lastNumber: 0, version: x.version + 1 });

    // Quem já conta pode encerrar e retomar no limite.
    const g = (await repo.getSeries(ids[0]!))!;
    const ended = await repo.endSeries(newOperationKey(), g.id, g.version, 5, []);
    expect(seriesCountsTowardLimit(ended.series, today)).toBe(true);
    expect((await repo.endSeries(newOperationKey(), g.id, ended.series.version, null, [])).series.lastNumber).toBeNull();

    // Excluir um libera a vaga: X volta a repetir e recria setembro a novembro.
    await repo.deleteSeries(newOperationKey(), ids[1]!, 1, []);
    const back = await repo.endSeries(newOperationKey(), x.id, still.series.version, null, []);
    expect([back.series.lastNumber, seriesNumbers(back.occurrences)]).toEqual([null, [1, 2, 3]]);
    expect((await repo.listSeries(ctx)).filter((s) => seriesCountsTowardLimit(s, today))).toHaveLength(100);
    repo.checkInvariants();
  });

  describe('invariantes S1 a S8', () => {
    type Internals = {
      commitments: Map<string, Record<string, unknown>>;
      seriesById: Map<string, Record<string, unknown>>;
      terms: Map<string, Record<string, unknown>>;
      checkTransitions(before: unknown): void;
    };
    const setup = async () => {
      const { repo, ctx, mensal, byNumber, payment } = await freshRepo();
      const { series: s } = await repo.createSeries(newOperationKey(), ctx, mensal('Escola', 120000, 10, OCT, DEC));
      const oct = await byNumber(s.id, 1);
      await repo.payCommitment(newOperationKey(), oct.id, oct.version, payment(120000, '2026-10-07'));
      const nov = await byNumber(s.id, 2);
      const internals = repo as unknown as Internals;
      const snapshot = () => ({
        commitments: new Map(internals.commitments),
        seriesById: new Map(internals.seriesById),
        terms: new Map(internals.terms),
      });
      return { repo, s, oct, nov, internals, snapshot };
    };
    const change = (map: Map<string, Record<string, unknown>>, id: string, over: Record<string, unknown>) => map.set(id, { ...map.get(id)!, ...over });

    it.each([
      ['S1: duas ocorrências vivas do mesmo número', (i: Internals, ids: { nov: string }) => i.commitments.set('cp-copia', { ...i.commitments.get(ids.nov)!, id: 'cp-copia' })],
      ['S2: ocorrência em outro contexto', (i: Internals, ids: { nov: string }) => change(i.commitments, ids.nov, { contextId: 'outro' })],
      ['S4: número depois do término', (i: Internals, ids: { s: string }) => change(i.seriesById, ids.s, { lastNumber: 1 })],
      ['S5: sem vigência viva em firstNumber', (i: Internals) => {
        for (const [id, t] of i.terms) i.terms.set(id, { ...t, supersededAt: 'agora' });
      }],
      ['S6: série excluída com ocorrência viva', (i: Internals, ids: { s: string }) => change(i.seriesById, ids.s, { deletedAt: 'agora' })],
      ['S8: vencimento fora do mês', (i: Internals, ids: { nov: string }) => change(i.commitments, ids.nov, { dueOn: '2026-12-10' })],
      ['número sem série', (i: Internals, ids: { nov: string }) => change(i.commitments, ids.nov, { seriesId: null })],
      ['marca de série em conta avulsa', (i: Internals, ids: { nov: string }) =>
        change(i.commitments, ids.nov, { seriesId: null, occurrenceNumber: null, seriesOverride: true })],
      ['excluída só neste mês e viva', (i: Internals, ids: { nov: string }) => change(i.commitments, ids.nov, { seriesSkipped: true })],
    ])('%s', async (_name, corrupt) => {
      const { repo, s, nov, internals } = await setup();
      repo.checkInvariants();
      corrupt(internals, { s: s.id, nov: nov.id });
      expect(() => repo.checkInvariants()).toThrow('serie_inconsistente');
    });

    it('S3 e S7: vínculo, "excluída só neste mês" e conta paga não mudam', async () => {
      const cases: [string, (i: Internals, ids: { oct: string; nov: string; s: string }) => void][] = [
        ['número', (i, ids) => change(i.commitments, ids.nov, { occurrenceNumber: 3 })],
        ['paga muda valor', (i, ids) => change(i.commitments, ids.oct, { amountCents: 1 })],
        ['paga muda estimado', (i, ids) => change(i.commitments, ids.oct, { amountIsEstimate: true })],
        ['série muda o primeiro mês', (i, ids) => change(i.seriesById, ids.s, { firstDueMonth: NOV })],
        ['vigência editada', (i) => {
          const [id, t] = [...i.terms][0]!;
          i.terms.set(id, { ...t, amountCents: 1 });
        }],
      ];
      for (const [, corrupt] of cases) {
        const { s, oct, nov, internals, snapshot } = await setup();
        const before = snapshot();
        corrupt(internals, { s: s.id, oct: oct.id, nov: nov.id });
        expect(() => internals.checkTransitions(before)).toThrow('campo_imutavel');
      }
      // "Excluída só neste mês" não volta.
      const { repo, nov, internals, snapshot } = await setup();
      await repo.deleteCommitment(newOperationKey(), nov.id, nov.version);
      const before = snapshot();
      change(internals.commitments, nov.id, { seriesSkipped: false });
      expect(() => internals.checkTransitions(before)).toThrow('campo_imutavel');
    });
  });
});

describe('demonstração do Ciclo A', () => {
  it('outubro 6.000 / 3.900 / 2.100 e R$ 650 a pagar; séries Aluguel, Luz e Financiamento do carro', async () => {
    const repo = await createDemoRepository();
    const ctx = (await repo.getSpace())!.personalContextId;
    const oct = summarizeMonth(await repo.listRecords(ctx, OCT), ctx, OCT);
    expect([oct.receivedCents, oct.paidCents, oct.differenceCents]).toEqual([600000, 390000, 210000]);
    const toPay = summarizeToPay(await repo.listCommitments(ctx, OCT), ctx, OCT, DEMO_TODAY);
    expect(toPay.toPayCents).toBe(65000);
    expect(toPay.later.map((c) => [c.description, c.dueOn, occurrenceLabel(c), c.amountIsEstimate])).toEqual([
      ['Aluguel', '2026-11-05', 'Todo mês', false],
      ['Financiamento do carro', '2026-11-10', 'Parcela 13 de 48', false],
      ['Seguro do carro', '2026-11-10', null, false],
      ['Luz', '2026-11-12', 'Todo mês', true],
    ]);
    // Salário com a categoria certa; o aluguel de outubro é o gasto gerado ao pagar a conta do gasto fixo.
    for (const month of ['2026-09', OCT]) {
      const received = (await repo.listRecords(ctx, month)).filter((r) => r.kind === 'receita');
      expect(received.map((r) => r.category)).toEqual(['Salário']);
      expect(CATEGORIES.receita).toContain('Salário');
    }
    const aluguel = oct.composition.paid.find((r) => r.description === 'Aluguel')!;
    expect(aluguel).toMatchObject({ occurredOn: '2026-10-05', amountCents: 250000, commitmentId: expect.any(String) });

    const list = await repo.listSeries(ctx);
    expect(list.map((s) => [currentTerm(s).description, seriesCaption(s, DEMO_TODAY)])).toEqual([
      ['Aluguel', 'Todo mês, dia 5 · desde outubro de 2026'],
      ['Luz', 'Todo mês, dia 12 · desde novembro de 2026'],
      ['Financiamento do carro', 'Parcelamento · financiamento · parcelas 13 a 48'],
    ]);
    expect(seriesMonthlyTotal(list, DEMO_TODAY)).toEqual({ totalCents: 353000, estimatedCents: 18000 });
    const carroDemo = list[2]!;
    const carroOpen = await repo.listOpenSeriesOccurrences(carroDemo.id);
    expect(installmentProgress(carroDemo, await repo.listSeriesOccurrences(carroDemo.id), carroOpen, DEMO_TODAY)).toMatchObject({
      paidBefore: 12,
      remaining: 36,
      remainingCents: 3_060_000,
      lastDueOn: '2029-10-10',
    });
    repo.checkInvariants();
  });
});
