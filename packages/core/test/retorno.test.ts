import { describe, expect, it } from 'vitest';
import {
  ABSENCE_MIN_DAYS,
  DEMO_RETURN_SETUP_DAY,
  DEMO_TODAY,
  MemoryRepository,
  RETURN_NOTICE_DAYS,
  RETURN_TEXT,
  REVIEW_MAX_CLOSED_MONTHS,
  batchEligible,
  buildReturnReview,
  createDemoRepository,
  dayErrorText,
  dayInMonthDate,
  demoScenarioFrom,
  emptyMonthCaption,
  groupActions,
  installmentProgress,
  isLongAbsence,
  isRepoError,
  isReviewableMonth,
  lastClosedMonth,
  loadReturnReview,
  looseExpenseFor,
  missingMonths,
  monthsOverview,
  newOperationKey,
  notHappenedDialog,
  occurrenceLabel,
  returnBannerText,
  returnErrorText,
  returnOpeningText,
  returnTextSamples,
  returnWindow,
  reviewCurrentText,
  reviewDecision,
  reviewExpectedVersion,
  reviewMonthCard,
  reviewRowA11yLabel,
  reviewRowText,
  reviewStepTitle,
  rowActions,
  rowName,
  rowPaymentDraft,
  rowShortName,
  seriesGapForExpense,
  seriesGapsInRange,
  summarizeMonth,
  summarizeToPay,
  toPayCaption,
  type Commitment,
  type CommitmentSeries,
  type FinancialRecord,
  type RepoErrorCode,
  type ReturnReview,
  type ReturnReviewState,
  type ReviewRow,
  type SeriesInput,
  type SeriesTerm,
} from '../src';

/**
 * Ciclo A4 · Seus últimos meses (D-030): revisão depois de um tempo sem anotar. Sequências R e R7 da especificação
 * (spec3 §2.3), com dados fictícios.
 */

// ---------------------------------------------------------------------------
// Apoio
// ---------------------------------------------------------------------------

const CREATED_AT = '2026-05-20T12:00:00.000Z';

const serie = (over: Partial<CommitmentSeries> = {}, termOver: Partial<SeriesTerm> = {}): CommitmentSeries => ({
  id: 'aluguel',
  contextId: 'ctx',
  kind: 'mensal',
  nature: 'conta',
  firstDueMonth: '2026-05',
  firstNumber: 1,
  lastNumber: null,
  installmentTotal: null,
  partsPerYear: null,
  currency: 'BRL',
  terms: [
    { fromNumber: over.firstNumber ?? 1, description: 'Aluguel', category: 'Moradia', amountCents: 250_000, amountMode: 'fixo', dueDay: 5, ...termOver },
  ],
  skippedNumbers: [],
  paidCount: 0,
  openCount: 0,
  generating: true,
  createdBy: 'pessoa-1',
  version: 1,
  createdAt: CREATED_AT,
  updatedAt: CREATED_AT,
  ...over,
});
const carroSerie = (over: Partial<CommitmentSeries> = {}) =>
  serie(
    { id: 'carro', kind: 'parcelada', nature: 'financiamento', firstNumber: 8, installmentTotal: 48, lastNumber: 48, ...over },
    { description: 'Financiamento do carro', category: 'Transporte', amountCents: 85_000, dueDay: 10 },
  );
const iptuSerie = (over: Partial<CommitmentSeries> = {}) =>
  serie(
    { id: 'iptu', kind: 'anual', firstDueMonth: '2027-02', partsPerYear: 10, ...over },
    { description: 'IPTU', amountCents: 18_000, amountMode: 'variavel', dueDay: 10 },
  );

const state = (activity: ReturnReviewState['activity'], mark: ReturnReviewState['mark'] = null): ReturnReviewState => ({ activity, mark });
const act = (lastWriteOn: string, absenceFromOn: string | null = null, absenceUntilOn: string | null = null) => ({
  lastWriteOn,
  absenceFromOn,
  absenceUntilOn,
});

async function expectCode(p: Promise<unknown>, code: RepoErrorCode) {
  await expect(p).rejects.toSatisfy((e: unknown) => isRepoError(e, code));
}

/** Repositório com o dia mutável e os atalhos da revisão (as mesmas chamadas das telas). */
async function harness(start: string) {
  let today = start;
  const repo = new MemoryRepository({ actorId: 'pessoa-1', displayName: 'Maria', today: () => today });
  const space = await repo.ensurePersonalSpace('Conta principal');
  const ctx = space.personalContextId;
  const accountId = space.accounts[0]!.id;
  const keys: { action: string; key: string }[] = [];
  const key = (action: string) => {
    const k = newOperationKey();
    keys.push({ action, key: k });
    return k;
  };
  const series = (input: Partial<SeriesInput> & Pick<SeriesInput, 'description' | 'amountCents' | 'dueDay' | 'firstDueMonth'>) =>
    repo.createSeries(key('criar_serie'), ctx, {
      kind: 'mensal',
      nature: 'conta',
      category: 'Moradia',
      amountMode: 'fixo',
      firstNumber: 1,
      installmentTotal: null,
      partsPerYear: null,
      lastMonth: null,
      ...input,
    });
  const record = (kind: 'receita' | 'despesa', description: string, amountCents: number, occurredOn: string) =>
    repo.createRecord(key('criar'), ctx, kind, { accountId, amountCents, occurredOn, description, category: null });
  const load = async () => (await loadReturnReview(repo, ctx, today)).review;
  const review = async (): Promise<ReturnReview> => {
    const r = await load();
    if (!r) throw new Error('sem revisão');
    return r;
  };
  const pay = (c: Commitment, amountCents: number, paidOn = c.dueOn) =>
    repo.payCommitment(key('pagar_compromisso'), c.id, c.version, { accountId, amountCents, paidOn, category: c.category });
  /** "Já paguei": conta sem registro cria e paga (duas chamadas); em aberto, só paga. */
  const paid = async (row: ReviewRow, amountCents = row.amountCents, paidOn = row.dueOn) => {
    if (row.commitment) return pay(row.commitment, amountCents, paidOn);
    const created = await repo.createSeriesOccurrence(key('criar_ocorrencia'), row.series!.id, row.seriesVersion!, row.series!.number, 'aberta');
    return pay(created.commitment, amountCents, paidOn);
  };
  /** Lote "pagas no vencimento": só valor fixo, uma a uma. */
  const batch = async (rows: readonly ReviewRow[]) => {
    for (const r of rows) {
      expect(batchEligible(r)).toBe(true);
      await paid(r);
    }
  };
  const stillOpen = (row: ReviewRow) =>
    repo.createSeriesOccurrence(key('criar_ocorrencia'), row.series!.id, row.seriesVersion!, row.series!.number, 'aberta');
  const notHappened = (row: ReviewRow) =>
    row.commitment
      ? repo.deleteCommitment(key('excluir_compromisso'), row.commitment.id, row.commitment.version)
      : repo.createSeriesOccurrence(key('criar_ocorrencia'), row.series!.id, row.seriesVersion!, row.series!.number, 'nao_houve');
  const toPay = async (month = today.slice(0, 7)) => summarizeToPay(await repo.listCommitments(ctx, month), ctx, month, today);
  const occurrencesOf = async (seriesId: string) => repo.listSeriesOccurrences(seriesId);
  return {
    repo,
    ctx,
    accountId,
    keys,
    key,
    series,
    record,
    load,
    review,
    paid,
    pay,
    batch,
    stillOpen,
    notHappened,
    toPay,
    occurrencesOf,
    setToday: (d: string) => (today = d),
    today: () => today,
  };
}

/** Montagem da sequência R em 20/05/2026 (a mesma do cenário de demonstração 'retorno'). */
async function setupR() {
  const h = await harness('2026-05-20');
  const s1 = await h.series({ description: 'Aluguel', amountCents: 250_000, dueDay: 5, firstDueMonth: '2026-05' });
  const s2 = await h.series({ description: 'Luz', amountCents: 18_000, amountMode: 'variavel', dueDay: 12, firstDueMonth: '2026-05' });
  const s3 = await h.series({
    kind: 'parcelada',
    nature: 'financiamento',
    description: 'Financiamento do carro',
    category: 'Transporte',
    amountCents: 85_000,
    dueDay: 10,
    firstDueMonth: '2026-05',
    firstNumber: 8,
    installmentTotal: 48,
  });
  // Geração (janela de abril a junho): maio e junho de cada série.
  expect(s1.occurrences.map((c) => c.dueOn)).toEqual(['2026-05-05', '2026-06-05']);
  expect(s2.occurrences.map((c) => c.dueOn)).toEqual(['2026-05-12', '2026-06-12']);
  expect(s3.occurrences.map((c) => c.series!.number)).toEqual([8, 9]);
  await h.pay(s1.occurrences[0]!, 250_000, '2026-05-05');
  await h.pay(s2.occurrences[0]!, 16_530, '2026-05-12');
  await h.pay(s3.occurrences[0]!, 85_000, '2026-05-10');
  await h.record('receita', 'Salário', 600_000, '2026-05-01');
  await h.record('despesa', 'Mercado', 125_000, '2026-05-15');
  const may = summarizeMonth(await h.repo.listRecords(h.ctx, '2026-05'), h.ctx, '2026-05');
  expect([may.receivedCents, may.paidCents, may.differenceCents]).toEqual([600_000, 476_530, 123_470]);
  expect((await h.repo.getReturnReviewState(h.ctx)).activity).toEqual(act('2026-05-20'));
  return { ...h, s1: s1.series, s2: s2.series, s3: s3.series };
}

/** R1: hoje 07/10/2026, abrir (a geração roda antes da revisão). */
async function openR1() {
  const r = await setupR();
  r.setToday('2026-10-07');
  expect(await r.repo.syncSeriesOccurrences(r.ctx)).toEqual({ created: 9, createdOverdue: 4 });
  return r;
}

const monthOfReview = (review: ReturnReview, month: string) => review.months.find((m) => m.month === month)!;
const rowsOf = (review: ReturnReview, month: string) => monthOfReview(review, month).rows;

// ---------------------------------------------------------------------------
// 1. Ausência longa
// ---------------------------------------------------------------------------

describe('isLongAbsence (45 dias ou um mês inteiro sem anotação)', () => {
  it('casos da tabela de 2.2', () => {
    expect(ABSENCE_MIN_DAYS).toBe(45);
    expect(isLongAbsence('2026-05-20', '2026-10-07')).toBe(true); // 140 dias
    expect(isLongAbsence('2026-09-02', '2026-10-16')).toBe(false); // 44 dias, 1 mês
    expect(isLongAbsence('2026-09-02', '2026-10-17')).toBe(true); // 45 dias
    expect(isLongAbsence('2026-08-31', '2026-10-01')).toBe(true); // 31 dias, setembro inteiro sem anotação
    expect(isLongAbsence('2026-09-05', '2026-10-10')).toBe(false); // 35 dias
    expect(isLongAbsence('2025-05-20', '2026-10-07')).toBe(true); // 505 dias
  });

  it('mesma data e data anterior não são ausência', () => {
    expect(isLongAbsence('2026-10-07', '2026-10-07')).toBe(false);
    expect(isLongAbsence('2026-10-07', '2026-05-20')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 2. Janela da revisão
// ---------------------------------------------------------------------------

describe('returnWindow', () => {
  it('sem atividade (conta nova): nunca', () => {
    expect(returnWindow(state(null), '2026-10-07')).toBeNull();
    expect(returnWindow(state(null, { reviewedThrough: '2026-09', decision: 'seguiu', decidedOn: '2026-10-07', version: 1 }), '2027-10-07')).toBeNull();
  });

  it('"ausencia": de maio a setembro, mais o mês atual', () => {
    expect(returnWindow(state(act('2026-05-20')), '2026-10-07')).toEqual({
      kind: 'ausencia',
      anchor: '2026-05-20',
      returnedOn: null,
      fromMonth: '2026-05',
      toMonth: '2026-09',
      currentMonth: '2026-10',
      cutBefore: null,
    });
  });

  it('tabela de 2.2: meses de cada caso', () => {
    expect(returnWindow(state(act('2026-09-02')), '2026-10-16')).toBeNull();
    expect(returnWindow(state(act('2026-09-02')), '2026-10-17')).toMatchObject({ fromMonth: '2026-09', toMonth: '2026-09' });
    expect(returnWindow(state(act('2026-08-31')), '2026-10-01')).toMatchObject({ fromMonth: '2026-08', toMonth: '2026-09' });
    expect(returnWindow(state(act('2026-09-05')), '2026-10-10')).toBeNull();
  });

  it('corte de 11 meses: 20/05/2025 → de novembro de 2025 a setembro de 2026', () => {
    const w = returnWindow(state(act('2025-05-20')), '2026-10-07')!;
    expect(w).toMatchObject({ fromMonth: '2025-11', toMonth: '2026-09', cutBefore: '2025-11' });
    expect(REVIEW_MAX_CLOSED_MONTHS).toBe(11);
  });

  it('"volta": 14 dias contando o dia da volta (13 mostra, 14 não)', () => {
    expect(RETURN_NOTICE_DAYS).toBe(14);
    const a = act('2026-10-07', '2026-05-20', '2026-10-07');
    expect(returnWindow(state(a), '2026-10-07')).toEqual({
      kind: 'volta',
      anchor: '2026-05-20',
      returnedOn: '2026-10-07',
      fromMonth: '2026-05',
      toMonth: '2026-09',
      currentMonth: '2026-10',
      cutBefore: null,
    });
    // Continuar anotando não tira a faixa no período.
    expect(returnWindow(state(act('2026-10-15', '2026-05-20', '2026-10-07')), '2026-10-20')?.kind).toBe('volta');
    expect(returnWindow(state(act('2026-10-15', '2026-05-20', '2026-10-07')), '2026-10-21')).toBeNull();
    expect(returnWindow(state(a), '2026-10-20')).not.toBeNull();
    expect(returnWindow(state(a), '2026-10-21')).toBeNull();
  });

  it('decisão no mesmo dia da âncora não esconde; depois dela, esconde', () => {
    const a = act('2026-05-20');
    const mark = (decidedOn: string) => ({ reviewedThrough: '2026-04', decision: 'seguiu' as const, decidedOn, version: 1 });
    expect(returnWindow(state(a, mark('2026-05-20')), '2026-10-07')).not.toBeNull();
    expect(returnWindow(state(a, mark('2026-05-21')), '2026-10-07')).toBeNull();
  });

  it('o mês já revisado corta o início (R4)', () => {
    const w = returnWindow(
      state(act('2026-10-15', '2026-05-20', '2026-10-15'), { reviewedThrough: '2026-09', decision: 'seguiu', decidedOn: '2026-10-07', version: 1 }),
      '2026-11-29',
    )!;
    expect(w).toMatchObject({ kind: 'ausencia', anchor: '2026-10-15', fromMonth: '2026-10', toMonth: '2026-10', cutBefore: null });
    // O mês revisado também tira do corte de 11 meses os meses já revisados.
    const w2 = returnWindow(
      state(act('2025-03-10'), { reviewedThrough: '2026-01', decision: 'seguiu', decidedOn: '2025-03-10', version: 1 }),
      '2026-10-07',
    )!;
    expect(w2).toMatchObject({ fromMonth: '2026-02', cutBefore: null });
  });

  it('meses aceitos pela revisão', () => {
    expect(lastClosedMonth('2026-10-07')).toBe('2026-09');
    expect(isReviewableMonth('2026-09', '2026-10-07')).toBe(true);
    expect(isReviewableMonth('2025-11', '2026-10-07')).toBe(true);
    expect(isReviewableMonth('2025-10', '2026-10-07')).toBe(false);
    expect(isReviewableMonth('2026-10', '2026-10-07')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 3. Números sem conta registrada
// ---------------------------------------------------------------------------

describe('seriesGapsInRange', () => {
  const live = (s: CommitmentSeries, n: number, dueOn: string): Commitment => ({
    id: `${s.id}-${n}`,
    contextId: 'ctx',
    description: s.terms[0]!.description,
    amountCents: s.terms[0]!.amountCents,
    currency: 'BRL',
    dueOn,
    category: null,
    status: 'aberto',
    payment: null,
    series: { id: s.id, number: n, kind: s.kind, nature: s.nature, installmentTotal: s.installmentTotal, partsPerYear: s.partsPerYear },
    seriesOverride: false,
    amountIsEstimate: false,
    createdBy: 'pessoa-1',
    version: 1,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
  });

  it('só os números sem conta viva nem pulada, com a vigência de cada um', () => {
    const s = serie();
    const occ = [live(s, 1, '2026-05-05'), live(s, 2, '2026-06-05'), live(s, 5, '2026-09-05')];
    const gaps = seriesGapsInRange(s, occ, '2026-05', '2026-09');
    expect(gaps.map((g) => [g.series!.number, g.month, g.dueOn, g.amountCents, g.state])).toEqual([
      [3, '2026-07', '2026-07-05', 250_000, 'sem_conta'],
      [4, '2026-08', '2026-08-05', 250_000, 'sem_conta'],
    ]);
    expect(gaps[0]).toMatchObject({ key: 'serie:aluguel:3', seriesVersion: 1, commitment: null, label: null, amountIsEstimate: false });
    // Número pulado ("Não houve", "excluir só esta") fica de fora.
    expect(seriesGapsInRange({ ...s, skippedNumbers: [3] }, occ, '2026-05', '2026-09').map((g) => g.series!.number)).toEqual([4]);
  });

  it('antes do primeiro número e depois do término não aparecem', () => {
    const carro = carroSerie();
    expect(seriesGapsInRange(carro, [], '2026-03', '2026-07').map((g) => g.series!.number)).toEqual([8, 9, 10]);
    expect(seriesGapsInRange(carroSerie({ lastNumber: 9 }), [], '2026-03', '2026-07').map((g) => g.series!.number)).toEqual([8, 9]);
    expect(seriesGapsInRange(serie({ lastNumber: 0 }), [], '2026-05', '2026-09')).toEqual([]);
    expect(seriesGapsInRange(serie({ firstDueMonth: '2026-10' }), [], '2026-05', '2026-09')).toEqual([]);
    expect(seriesGapsInRange(serie(), [], '2026-09', '2026-08')).toEqual([]);
  });

  it('"Parcela 10 de 48", marca de estimado e vigência antiga antes de "esta e as próximas"', () => {
    const carro = seriesGapsInRange(carroSerie(), [], '2026-07', '2026-07')[0]!;
    expect(carro).toMatchObject({ label: 'Parcela 10 de 48', dueOn: '2026-07-10', amountCents: 85_000 });
    const luz = seriesGapsInRange(serie({ id: 'luz' }, { description: 'Luz', amountCents: 18_000, amountMode: 'variavel', dueDay: 12 }), [], '2026-07', '2026-07')[0]!;
    expect(luz).toMatchObject({ amountIsEstimate: true, amountCents: 18_000, dueOn: '2026-07-12' });
    const reajuste = serie({
      terms: [
        { fromNumber: 1, description: 'Aluguel', category: 'Moradia', amountCents: 250_000, amountMode: 'fixo', dueDay: 5 },
        { fromNumber: 4, description: 'Aluguel novo', category: 'Moradia', amountCents: 265_000, amountMode: 'fixo', dueDay: 31 },
      ],
    });
    expect(seriesGapsInRange(reajuste, [], '2026-07', '2026-09').map((g) => [g.description, g.amountCents, g.dueOn])).toEqual([
      ['Aluguel', 250_000, '2026-07-05'],
      ['Aluguel novo', 265_000, '2026-08-31'],
      ['Aluguel novo', 265_000, '2026-09-30'],
    ]);
  });

  it('IPTU de R7: n6 a n13 no período, nenhum em dezembro e janeiro', () => {
    const s = iptuSerie();
    const gaps = seriesGapsInRange(s, [live(s, 14, '2028-05-10')], '2027-07', '2028-05');
    expect(gaps.map((g) => g.series!.number)).toEqual([6, 7, 8, 9, 10, 11, 12, 13]);
    expect(gaps.map((g) => g.month)).not.toContain('2027-12');
    expect(gaps.map((g) => g.month)).not.toContain('2028-01');
    expect(gaps[0]).toMatchObject({ month: '2027-07', label: 'Parcela 6 de 10 de 2027', amountIsEstimate: true });
    expect(gaps[5]).toMatchObject({ month: '2028-02', label: 'Parcela 1 de 10 de 2028' });
    expect(seriesGapsInRange(s, [], '2027-12', '2028-01')).toEqual([]);
  });

  it('número removido por encerramento e depois retomado aparece (MemoryRepository)', async () => {
    const h = await harness('2026-06-10');
    const { series, occurrences } = await h.series({ description: 'Academia', amountCents: 12_000, dueDay: 15, firstDueMonth: '2026-05' });
    expect(occurrences.map((c) => c.series!.number)).toEqual([1, 2, 3]);
    const affected = occurrences.filter((c) => c.series!.number > 1).map((c) => ({ id: c.id, version: c.version }));
    const ended = await h.repo.endSeries(h.key('encerrar_serie'), series.id, series.version, 1, affected);
    // Encerrada em maio: depois do término não há lacuna.
    expect(seriesGapsInRange(ended.series, ended.occurrences, '2026-05', '2026-07').map((g) => g.series!.number)).toEqual([]);
    h.setToday('2026-09-10');
    const resumed = await h.repo.endSeries(h.key('encerrar_serie'), series.id, ended.series.version, null, []);
    expect(resumed.occurrences.map((c) => c.series!.number)).toEqual([1, 4, 5, 6]);
    const occ = await h.repo.listCommitmentsDueBetween(h.ctx, '2026-05', '2026-09');
    expect(seriesGapsInRange(resumed.series, occ, '2026-05', '2026-08').map((g) => g.series!.number)).toEqual([2, 3]);
  });
});

// ---------------------------------------------------------------------------
// 4. Resumo da revisão e textos da faixa
// ---------------------------------------------------------------------------

describe('buildReturnReview e returnBannerText', () => {
  it('R1: maio compacto, junho e setembro em aberto, julho e agosto sem conta, outubro com 1 conta', async () => {
    const r = await openR1();
    const review = await r.review();
    expect(review.window).toMatchObject({ kind: 'ausencia', anchor: '2026-05-20', fromMonth: '2026-05', toMonth: '2026-09' });
    expect(review.months.map((m) => m.month)).toEqual(['2026-05', '2026-06', '2026-07', '2026-08', '2026-09']);
    // Maio compacto: recebido e pago anotados, tudo pago.
    const may = monthOfReview(review, '2026-05');
    expect(may).toMatchObject({ missing: false, toCheck: false, rows: [] });
    expect(may.overview).toEqual({ month: '2026-05', receivedCount: 1, receivedCents: 600_000, paidCount: 4, paidCents: 476_530 });
    expect(reviewMonthCard(may)).toEqual({
      title: 'Maio de 2026',
      received: 'Recebido: R$ 6.000,00 · 1 recebimento',
      paid: 'Pago: R$ 4.765,30 · 4 gastos',
      lines: ['Nenhuma conta para conferir.'],
      compact: true,
    });
    // Junho: 3 em aberto (353.000, com 18.000 estimados).
    const june = rowsOf(review, '2026-06');
    expect(june.map((x) => [x.description, x.state, x.dueOn])).toEqual([
      ['Aluguel', 'aberta', '2026-06-05'],
      ['Financiamento do carro', 'aberta', '2026-06-10'],
      ['Luz', 'aberta', '2026-06-12'],
    ]);
    expect(june.reduce((a, x) => a + x.amountCents, 0)).toBe(353_000);
    expect(reviewMonthCard(monthOfReview(review, '2026-06')).lines).toEqual(['Contas em aberto: 3 · R$ 3.530,00 · inclui R$ 180,00 estimados']);
    expect(reviewMonthCard(monthOfReview(review, '2026-06')).received).toBe('Recebido: nenhum recebimento anotado');
    // Julho e agosto: 3 sem conta registrada cada.
    for (const m of ['2026-07', '2026-08']) {
      expect(rowsOf(review, m).map((x) => x.state)).toEqual(['sem_conta', 'sem_conta', 'sem_conta']);
    }
    expect(reviewMonthCard(monthOfReview(review, '2026-07')).lines).toEqual([
      'Sem conta registrada: Aluguel · Financiamento do carro (parcela 10 de 48) · Luz',
    ]);
    expect(rowsOf(review, '2026-09').map((x) => x.state)).toEqual(['aberta', 'aberta', 'aberta']);
    // Outubro: só o Aluguel vencido em 05/10.
    expect(review.current.rows.map((x) => [x.description, x.dueOn])).toEqual([['Aluguel', '2026-10-05']]);
    expect(reviewCurrentText(review.current)).toBe('Outubro de 2026 (este mês) · 1 conta vencida em aberto: Aluguel, R$ 2.500,00, venceu em 05/10.');
    expect(review.counts).toEqual({ monthsWithGaps: 4, billsToCheck: 13 });
    expect(review.isEmpty).toBe(false);
    expect(review.steps).toEqual([
      { month: '2026-06', current: false },
      { month: '2026-07', current: false },
      { month: '2026-08', current: false },
      { month: '2026-09', current: false },
      { month: '2026-10', current: true },
    ]);
    expect(review.steps.map(reviewStepTitle)).toEqual(['Junho de 2026', 'Julho de 2026', 'Agosto de 2026', 'Setembro de 2026', 'Outubro de 2026 (este mês)']);
    expect(returnBannerText(review)).toEqual({
      title: 'Seus últimos meses',
      body: 'Sua última anotação foi em 20/05/2026. Desde então: 4 meses com algo sem registro e 13 contas para conferir.',
      note: 'Atualizar é opcional. Nada é preenchido sem a sua confirmação.',
      primary: 'Ver resumo',
      secondary: 'Seguir adiante',
    });
    expect(returnOpeningText(review)).toBe(
      'Sua última anotação foi em 20/05/2026. Abaixo, o que está registrado de maio a setembro de 2026 e as contas vencidas deste mês.',
    );
    // Ainda a pagar em outubro: 353.000 do mês + 706.000 vencidas antes.
    const toPay = await r.toPay();
    expect([toPay.toPayCents, toPay.dueInMonthCents, toPay.overdueBeforeCents, toPay.estimatedCents]).toEqual([1_059_000, 353_000, 706_000, 54_000]);
    expect(toPayCaption(toPay, r.today()).estimated).toBe('Inclui R$ 540,00 em valores estimados.');
    // Carro: pagas antes 7, no Clarevo 1, sem conta registrada 2, faltam 38, soma 3.230.000.
    const carro = (await r.repo.getSeries(r.s3.id))!;
    const occ = await r.occurrencesOf(carro.id);
    const progress = installmentProgress(carro, occ, await r.repo.listOpenSeriesOccurrences(carro.id), r.today());
    expect([progress.paidBefore, progress.paidInApp, progress.remaining, progress.remainingCents]).toEqual([7, 1, 38, 3_230_000]);
    expect(missingMonths(carro, occ, r.today()).length).toBe(2);
    expect(RETURN_TEXT.progressGaps(missingMonths(carro, occ, r.today()).length)).toBe('Sem conta registrada: 2');
  });

  it('textos da faixa: volta, singulares e sem contas', () => {
    const w = returnWindow(state(act('2026-10-07', '2026-05-20', '2026-10-07')), '2026-10-07')!;
    const ov = monthsOverview([], 'ctx', w.fromMonth, w.toMonth);
    const review = buildReturnReview(w, ov, [], [], '2026-10-07');
    expect(review.counts).toEqual({ monthsWithGaps: 5, billsToCheck: 0 });
    expect(returnBannerText(review)!.body).toBe('Entre 20/05/2026 e 07/10/2026, nada foi anotado. Nesse período: 5 meses com algo sem registro.');
    expect(returnOpeningText(review)).toBe('Entre 20/05/2026 e 07/10/2026, nada foi anotado. Abaixo, o que está registrado de maio a setembro de 2026.');
    const one = buildReturnReview(
      returnWindow(state(act('2026-09-02')), '2026-10-17')!,
      [{ month: '2026-09', receivedCount: 0, receivedCents: 0, paidCount: 1, paidCents: 5_000 }],
      [],
      [serie({ firstDueMonth: '2026-09', lastNumber: 1 })],
      '2026-10-17',
    );
    expect(one.counts).toEqual({ monthsWithGaps: 1, billsToCheck: 1 });
    expect(returnBannerText(one)!.body).toBe('Sua última anotação foi em 02/09/2026. Desde então: 1 mês com algo sem registro e 1 conta para conferir.');
    expect(RETURN_TEXT.cut('2025-11')).toBe('Meses antes de novembro de 2025 não entram neste resumo.');
  });

  it('tudo resolvido: isEmpty e nenhuma faixa', async () => {
    const r = await openR1();
    let review = await r.review();
    for (const m of review.months) for (const row of m.rows) await r.paid(row, row.amountCents);
    for (const row of review.current.rows) await r.paid(row);
    for (const m of ['2026-06', '2026-07', '2026-08', '2026-09']) await r.record('receita', 'Salário', 600_000, `${m}-01`);
    review = await r.review();
    expect(review.window.kind).toBe('volta');
    expect(review.counts).toEqual({ monthsWithGaps: 0, billsToCheck: 0 });
    expect(review.isEmpty).toBe(true);
    expect(review.steps).toEqual([]);
    expect(returnBannerText(review)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 5. Modo "Dia" e linha do Resumo
// ---------------------------------------------------------------------------

describe('dayInMonthDate e emptyMonthCaption', () => {
  it('dia no mês fechado', () => {
    expect(dayInMonthDate('2026-06', '1')).toEqual({ date: '2026-06-01' });
    expect(dayInMonthDate('2026-06', ' 05 ')).toEqual({ date: '2026-06-05' });
    expect(dayInMonthDate('2026-06', '30')).toEqual({ date: '2026-06-30' });
    expect(dayInMonthDate('2026-06', '31')).toEqual({ error: 'dia_invalido' });
    expect(dayInMonthDate('2026-06', '0')).toEqual({ error: 'dia_invalido' });
    expect(dayInMonthDate('2026-06', '')).toEqual({ error: 'dia_obrigatorio' });
    expect(dayInMonthDate('2026-06', '  ')).toEqual({ error: 'dia_obrigatorio' });
    expect(dayInMonthDate('2026-06', 'abc')).toEqual({ error: 'dia_invalido' });
    expect(dayInMonthDate('2026-06', '1,5')).toEqual({ error: 'dia_invalido' });
    expect(dayInMonthDate('2028-02', '29')).toEqual({ date: '2028-02-29' });
    expect(dayInMonthDate('2027-02', '29')).toEqual({ error: 'dia_invalido' });
    expect(dayErrorText('dia_obrigatorio', '2026-06')).toBe('Informe o dia.');
    expect(dayErrorText('dia_invalido', '2026-06')).toBe('Junho tem 30 dias.');
    expect(dayErrorText('dia_invalido', '2027-02')).toBe('Fevereiro tem 28 dias.');
    expect(RETURN_TEXT.daySuffix('2026-06')).toBe('/06/2026');
    expect(RETURN_TEXT.dayHint('receita', '2026-06')).toBe('Dia do recebimento em junho de 2026.');
    expect(RETURN_TEXT.dayHint('despesa', '2026-06')).toBe('Dia do gasto em junho de 2026.');
  });

  it('linha do cabeçalho do Resumo, só em meses fechados', () => {
    const rec = (kind: 'receita' | 'despesa', occurredOn: string): FinancialRecord => ({
      id: `${kind}-${occurredOn}`,
      contextId: 'ctx',
      accountId: 'conta',
      kind,
      status: 'realizado',
      amountCents: 10_000,
      currency: 'BRL',
      occurredOn,
      description: kind,
      category: null,
      commitmentId: null,
      createdBy: 'pessoa-1',
      version: 1,
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
    });
    const caption = (records: FinancialRecord[], month: string) => emptyMonthCaption(summarizeMonth(records, 'ctx', month), month, '2026-10');
    expect(caption([], '2026-06')).toBe('Nada anotado em junho.');
    expect(caption([rec('despesa', '2026-08-05')], '2026-08')).toBe('Nenhum recebimento anotado em agosto.');
    expect(caption([rec('receita', '2026-08-01')], '2026-08')).toBe('Nenhum gasto anotado em agosto.');
    expect(caption([rec('receita', '2026-08-01'), rec('despesa', '2026-08-05')], '2026-08')).toBeNull();
    expect(caption([], '2026-10')).toBeNull();
    expect(caption([], '2026-11')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 6. Ações das linhas
// ---------------------------------------------------------------------------

describe('rowActions, batchEligible, rowPaymentDraft e looseExpenseFor', () => {
  const [aluguel] = seriesGapsInRange(serie(), [], '2026-07', '2026-07');
  const [luz] = seriesGapsInRange(serie({ id: 'luz' }, { description: 'Luz', amountMode: 'variavel', amountCents: 18_000, dueDay: 12 }), [], '2026-07', '2026-07');
  const [carro] = seriesGapsInRange(carroSerie(), [], '2026-07', '2026-07');
  const [iptu] = seriesGapsInRange(iptuSerie(), [], '2027-07', '2027-07');

  it('parcela sem "Não houve"; gasto fixo e conta do ano com "Não houve"', () => {
    expect(rowActions(aluguel!)).toEqual(['ja_paguei', 'nao_houve', 'ainda_nao_paguei']);
    expect(rowActions(iptu!)).toEqual(['ja_paguei', 'nao_houve', 'ainda_nao_paguei']);
    expect(rowActions(carro!)).toEqual(['ja_paguei', 'ainda_nao_paguei']);
    expect(rowActions({ ...aluguel!, state: 'aberta' })).toEqual(['ja_paguei', 'nao_houve']);
    expect(rowActions({ ...carro!, state: 'aberta' })).toEqual(['ja_paguei']);
    expect(rowActions({ ...aluguel!, state: 'aberta', series: null })).toEqual(['ja_paguei', 'nao_houve']);
  });

  it('lote só com valor fixo; "Já paguei" estimado abre vazio', () => {
    expect(batchEligible(aluguel!)).toBe(true);
    expect(batchEligible(carro!)).toBe(true);
    expect(batchEligible(luz!)).toBe(false);
    expect(batchEligible(iptu!)).toBe(false);
    expect(rowPaymentDraft(aluguel!)).toEqual({ amountCents: 250_000, paidOn: '2026-07-05', category: 'Moradia' });
    expect(rowPaymentDraft(luz!)).toEqual({ amountCents: null, paidOn: '2026-07-12', category: 'Moradia' });
  });

  it('gasto solto no mês com a mesma descrição e sem conta vinculada', () => {
    const rec = (over: Partial<FinancialRecord>): FinancialRecord => ({
      id: 'r1',
      contextId: 'ctx',
      accountId: 'conta',
      kind: 'despesa',
      status: 'realizado',
      amountCents: 250_000,
      currency: 'BRL',
      occurredOn: '2026-07-05',
      description: ' aluguel ',
      category: null,
      commitmentId: null,
      createdBy: 'pessoa-1',
      version: 1,
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
      ...over,
    });
    expect(looseExpenseFor(aluguel!, [rec({})])?.id).toBe('r1');
    expect(looseExpenseFor(aluguel!, [rec({ commitmentId: 'cp-1' })])).toBeNull();
    expect(looseExpenseFor(aluguel!, [rec({ occurredOn: '2026-08-05' })])).toBeNull();
    expect(looseExpenseFor(aluguel!, [rec({ kind: 'receita' })])).toBeNull();
    expect(RETURN_TEXT.looseExpense(rec({ description: 'Aluguel' }))).toBe(
      'Você já anotou o gasto Aluguel em 05/07/2026 (R$ 2.500,00). Se ele é o pagamento desta conta, exclua esse gasto e use Já paguei, para não contar duas vezes.',
    );
  });

  it('textos e nomes acessíveis das linhas', () => {
    expect(reviewRowText(carro!)).toBe('Financiamento do carro · Parcela 10 de 48 · R$ 850,00 · vencimento em 10/07/2026 · sem conta registrada');
    expect(reviewRowText(luz!)).toBe('Luz · cerca de R$ 180,00 (estimado) · vencimento em 12/07/2026 · sem conta registrada');
    expect(reviewRowText({ ...aluguel!, state: 'aberta', dueOn: '2026-06-05', month: '2026-06' })).toBe(
      'Aluguel · R$ 2.500,00 · venceu em 05/06/2026 · em aberto',
    );
    expect(reviewRowA11yLabel(luz!)).toBe('Luz, cerca de R$ 180,00, valor estimado, vencimento em 12/07/2026, sem conta registrada');
    expect(reviewRowA11yLabel(carro!)).toBe('Financiamento do carro, parcela 10 de 48, R$ 850,00, vencimento em 10/07/2026, sem conta registrada');
    expect(rowName(carro!)).toBe('Financiamento do carro (parcela 10 de 48)');
    expect(rowName(iptu!)).toBe('IPTU (parcela 6 de 10 de 2027)');
    expect(rowShortName(luz!)).toBe('Luz de julho');
    expect(RETURN_TEXT.paidButtonA11y(rowShortName(luz!))).toBe('Já paguei: Luz de julho');
    expect(RETURN_TEXT.selectA11y(rowShortName(aluguel!), aluguel!.amountCents)).toBe('Selecionar Aluguel de julho, R$ 2.500,00');
    expect(RETURN_TEXT.batchBody([aluguel!, carro!], 'Conta principal')).toBe(
      'Aluguel: R$ 2.500,00 em 05/07/2026. Financiamento do carro (parcela 10 de 48): R$ 850,00 em 10/07/2026. Saem da conta Conta principal.',
    );
    expect(RETURN_TEXT.batchTitle(2)).toBe('Marcar 2 contas como pagas?');
    expect(RETURN_TEXT.batchButton(2)).toBe('Marcar as 2 selecionadas como pagas no vencimento');
    expect(RETURN_TEXT.batchPartial(1, 2, rowShortName(carro!), true)).toBe(
      '1 de 2 marcadas como pagas. Financiamento do carro de julho: algo mudou em outro aparelho. Confira e tente de novo.',
    );
    expect(RETURN_TEXT.payBody(rowShortName(aluguel!), 250_000, '2026-07-05', 'Conta principal')).toBe(
      'Aluguel de julho: R$ 2.500,00 em 05/07/2026, da conta Conta principal.',
    );
    expect(notHappenedDialog({ ...aluguel!, description: 'Academia' })).toEqual({
      title: 'Não houve esta conta em julho?',
      body: 'A conta de julho de Academia fica registrada como não houve e não volta a aparecer. Os outros meses não mudam.',
      confirm: 'Confirmar',
    });
    expect(notHappenedDialog({ ...aluguel!, state: 'aberta', month: '2026-06' })).toEqual({
      title: 'Tirar a conta de junho?',
      body: 'Ela sai de Contas a pagar e não volta a ser criada.',
      confirm: 'Tirar conta',
    });
    expect(RETURN_TEXT.dayGapHint(aluguel!)).toBe('O gasto fixo Aluguel não tem conta registrada em julho. Para contar no gasto fixo, use Já paguei na revisão.');
    expect(RETURN_TEXT.estimateHint(18_000)).toBe('Digite o valor da conta. A estimativa era R$ 180,00.');
    expect(RETURN_TEXT.seriesGap('2026-07')).toBe('Julho de 2026: sem conta registrada.');
    expect(RETURN_TEXT.annualGap('2027', [6, 7, 8, 9, 10])).toBe('2027: parcelas 6 a 10 sem conta registrada.');
  });

  it('códigos de erro e decisão ao concluir', () => {
    expect(returnErrorText('ocorrencia_existente')).toBe('Esta conta já foi registrada, talvez em outro aparelho. A lista foi atualizada.');
    expect(returnErrorText('versao_desatualizada')).toBe('Algo mudou em outro aparelho. A lista foi atualizada; confira e tente de novo.');
    expect(returnErrorText('mes_invalido')).toBe('Não foi possível salvar. Seu preenchimento foi mantido. Tente novamente.');
    expect(returnErrorText('data_futura')).toBe('Use uma data até hoje. A conta só é marcada como paga depois do pagamento.');
    expect(returnErrorText('qualquer')).toBe('Não foi possível salvar. Seu preenchimento foi mantido. Tente novamente.');
    expect(reviewDecision(true)).toBe('atualizou');
    expect(reviewDecision(false)).toBe('seguiu');
    expect(reviewExpectedVersion(state(null))).toBe(0);
    expect(reviewExpectedVersion(state(null, { reviewedThrough: '2026-09', decision: 'seguiu', decidedOn: '2026-10-07', version: 3 }))).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// 7. MemoryRepository: sequências R e R7
// ---------------------------------------------------------------------------

describe('MemoryRepository: atividade', () => {
  it('conta nova sem atividade; a primeira anotação cria; geração e decisão não mexem', async () => {
    const h = await harness('2026-10-07');
    expect(await h.repo.getReturnReviewState(h.ctx)).toEqual({ activity: null, mark: null });
    expect(await h.load()).toBeNull();
    await h.series({ description: 'Aluguel', amountCents: 250_000, dueDay: 5, firstDueMonth: '2026-10' });
    expect((await h.repo.getReturnReviewState(h.ctx)).activity).toEqual(act('2026-10-07'));
    h.setToday('2026-12-01');
    await h.repo.syncSeriesOccurrences(h.ctx);
    await h.repo.decideReturnReview(h.key('decidir_revisao'), h.ctx, 0, '2026-11', 'seguiu');
    expect((await h.repo.getReturnReviewState(h.ctx)).activity).toEqual(act('2026-10-07'));
  });

  it('ausência: 44 dias não grava, 45 grava; dia seguinte mantém; relógio para trás não muda', async () => {
    const h = await harness('2026-09-02');
    await h.record('despesa', 'Mercado', 10_000, '2026-09-02');
    h.setToday('2026-10-16');
    await h.record('despesa', 'Mercado', 10_000, '2026-10-16');
    expect((await h.repo.getReturnReviewState(h.ctx)).activity).toEqual(act('2026-10-16'));
    h.setToday('2026-11-30');
    await h.record('despesa', 'Mercado', 10_000, '2026-11-30');
    expect((await h.repo.getReturnReviewState(h.ctx)).activity).toEqual(act('2026-11-30', '2026-10-16', '2026-11-30'));
    h.setToday('2026-12-01');
    await h.record('despesa', 'Mercado', 10_000, '2026-12-01');
    expect((await h.repo.getReturnReviewState(h.ctx)).activity).toEqual(act('2026-12-01', '2026-10-16', '2026-11-30'));
    h.setToday('2026-11-29');
    await h.record('despesa', 'Mercado', 10_000, '2026-11-29');
    expect((await h.repo.getReturnReviewState(h.ctx)).activity).toEqual(act('2026-12-01', '2026-10-16', '2026-11-30'));
  });

  it('de 31/08 a 01/10 grava (setembro inteiro sem anotação); falha da escrita não grava atividade', async () => {
    const h = await harness('2026-08-31');
    await h.record('despesa', 'Mercado', 10_000, '2026-08-31');
    h.setToday('2026-10-01');
    h.repo.failNextWrite = 'antes';
    await expectCode(h.record('despesa', 'Mercado', 10_000, '2026-10-01'), 'rede');
    expect((await h.repo.getReturnReviewState(h.ctx)).activity).toEqual(act('2026-08-31'));
    await expectCode(h.record('despesa', '', 10_000, '2026-10-01'), 'descricao_obrigatoria');
    expect((await h.repo.getReturnReviewState(h.ctx)).activity).toEqual(act('2026-08-31'));
    await h.record('despesa', 'Mercado', 10_000, '2026-10-01');
    expect((await h.repo.getReturnReviewState(h.ctx)).activity).toEqual(act('2026-10-01', '2026-08-31', '2026-10-01'));
  });
});

describe('MemoryRepository: sequência R', () => {
  it('ramo A: R2 seguir adiante, R3 nova anotação, R4 nova ausência', async () => {
    const r = await openR1();
    // R2 · Seguir adiante: só a decisão.
    const mark = await r.repo.decideReturnReview(r.key('decidir_revisao'), r.ctx, 0, '2026-09', 'seguiu');
    expect(mark).toEqual({ reviewedThrough: '2026-09', decision: 'seguiu', decidedOn: '2026-10-07', version: 1 });
    expect(await r.load()).toBeNull();
    expect((await r.toPay()).toPayCents).toBe(1_059_000);
    const s1 = (await r.repo.getSeries(r.s1.id))!;
    const occ = await r.repo.listCommitmentsDueBetween(r.ctx, '2026-05', '2026-09');
    expect(seriesGapsInRange(s1, occ, '2026-05', '2026-09').map((g) => g.month)).toEqual(['2026-07', '2026-08']);
    expect((await r.repo.getReturnReviewState(r.ctx)).activity).toEqual(act('2026-05-20'));
    // Mês fechado sem anotação continua visível no Resumo.
    expect(emptyMonthCaption(summarizeMonth(await r.repo.listRecords(r.ctx, '2026-06'), r.ctx, '2026-06'), '2026-06', '2026-10')).toBe(
      'Nada anotado em junho.',
    );
    // R3 · 15/10, Mercado 30.000: volta registrada, sem faixa (decisão de 07/10 depois da âncora 20/05).
    r.setToday('2026-10-15');
    await r.record('despesa', 'Mercado', 30_000, '2026-10-15');
    expect((await r.repo.getReturnReviewState(r.ctx)).activity).toEqual(act('2026-10-15', '2026-05-20', '2026-10-15'));
    expect(await r.load()).toBeNull();
    // R4 · 29/11, sem anotar: a faixa volta, só com outubro e as vencidas de novembro.
    r.setToday('2026-11-29');
    await r.repo.syncSeriesOccurrences(r.ctx);
    const review = await r.review();
    expect(review.window).toMatchObject({ kind: 'ausencia', anchor: '2026-10-15', fromMonth: '2026-10', toMonth: '2026-10' });
    expect(review.months.map((m) => m.month)).toEqual(['2026-10']);
    expect(rowsOf(review, '2026-10').map((x) => [x.description, x.state])).toEqual([
      ['Aluguel', 'aberta'],
      ['Financiamento do carro', 'aberta'],
      ['Luz', 'aberta'],
    ]);
    expect(review.current.rows.map((x) => x.dueOn)).toEqual(['2026-11-05', '2026-11-10', '2026-11-12']);
    expect(review.counts).toEqual({ monthsWithGaps: 1, billsToCheck: 6 });
    expect(returnBannerText(review)!.body).toBe('Sua última anotação foi em 15/10/2026. Desde então: 1 mês com algo sem registro e 6 contas para conferir.');
  });

  it('ramo B: R5 atualizar agora, mês a mês, e R6 erros', async () => {
    const r = await openR1();
    let review = await r.review();
    const row = (month: string, description: string) => {
      const found = [...(review.months.find((m) => m.month === month)?.rows ?? []), ...(month === review.current.month ? review.current.rows : [])].find(
        (x) => x.description === description,
      );
      if (!found) throw new Error(`${description} de ${month}`);
      return found;
    };
    // Junho: lote Aluguel e carro; Luz 171,90; Salário no modo "Dia" 1.
    await r.batch([row('2026-06', 'Aluguel'), row('2026-06', 'Financiamento do carro')]);
    expect(batchEligible(row('2026-06', 'Luz'))).toBe(false);
    await r.paid(row('2026-06', 'Luz'), 17_190);
    const day = dayInMonthDate('2026-06', '1');
    expect(day).toEqual({ date: '2026-06-01' });
    await r.record('receita', 'Salário', 600_000, (day as { date: string }).date);
    // Julho: lote com criação; Luz criada e paga com 179,90; nenhum gasto solto.
    review = await r.review();
    expect(looseExpenseFor(row('2026-07', 'Aluguel'), await r.repo.listRecords(r.ctx, '2026-07'))).toBeNull();
    await r.batch([row('2026-07', 'Aluguel'), row('2026-07', 'Financiamento do carro')]);
    await r.paid(row('2026-07', 'Luz'), 17_990);
    await r.record('receita', 'Salário', 600_000, '2026-07-01');
    // Agosto: lote; Luz "Ainda não paguei"; recebimentos pulados.
    await r.batch([row('2026-08', 'Aluguel'), row('2026-08', 'Financiamento do carro')]);
    const stillOpen = await r.stillOpen(row('2026-08', 'Luz'));
    expect(stillOpen.commitment).toMatchObject({ status: 'aberto', amountCents: 18_000, amountIsEstimate: true, dueOn: '2026-08-12' });
    // Setembro: lote; Luz 194,20; Salário.
    review = await r.review();
    await r.batch([row('2026-09', 'Aluguel'), row('2026-09', 'Financiamento do carro')]);
    await r.paid(row('2026-09', 'Luz'), 19_420);
    await r.record('receita', 'Salário', 600_000, '2026-09-01');
    // Este mês: Aluguel em 05/10. Concluir.
    await r.paid(row('2026-10', 'Aluguel'));
    review = await r.review();
    expect(review.counts).toEqual({ monthsWithGaps: 1, billsToCheck: 1 }); // agosto: sem recebimento e a Luz em aberto
    const state0 = await r.repo.getReturnReviewState(r.ctx);
    const mark = await r.repo.decideReturnReview(r.key('decidir_revisao'), r.ctx, reviewExpectedVersion(state0), lastClosedMonth(r.today()), reviewDecision(true));
    expect(mark).toEqual({ reviewedThrough: '2026-09', decision: 'atualizou', decidedOn: '2026-10-07', version: 1 });
    expect(await r.load()).toBeNull();

    // Resultado: junho a setembro.
    const overview = await r.repo.monthsOverview(r.ctx, '2026-06', '2026-09');
    expect(overview.map((o) => [o.month, o.receivedCents, o.paidCents, o.receivedCents - o.paidCents])).toEqual([
      ['2026-06', 600_000, 352_190, 247_810],
      ['2026-07', 600_000, 352_990, 247_010],
      ['2026-08', 0, 335_000, -335_000],
      ['2026-09', 600_000, 354_420, 245_580],
    ]);
    // monthsOverview igual a summarizeMonth, mês a mês.
    for (const o of overview) {
      const s = summarizeMonth(await r.repo.listRecords(r.ctx, o.month), r.ctx, o.month);
      expect([o.receivedCents, o.paidCents, o.receivedCount + o.paidCount]).toEqual([s.receivedCents, s.paidCents, s.recordCount]);
    }
    expect(emptyMonthCaption(summarizeMonth(await r.repo.listRecords(r.ctx, '2026-08'), r.ctx, '2026-08'), '2026-08', '2026-10')).toBe(
      'Nenhum recebimento anotado em agosto.',
    );
    // Outubro: Pago 250.000; Ainda a pagar 121.000 (103.000 do mês + 18.000 da Luz de agosto), 36.000 estimados.
    expect(summarizeMonth(await r.repo.listRecords(r.ctx, '2026-10'), r.ctx, '2026-10').paidCents).toBe(250_000);
    const toPay = await r.toPay();
    expect([toPay.toPayCents, toPay.dueInMonthCents, toPay.overdueBeforeCents, toPay.estimatedCents]).toEqual([121_000, 103_000, 18_000, 36_000]);
    expect(toPayCaption(toPay, r.today()).estimated).toBe('Inclui R$ 360,00 em valores estimados.');
    // Carro: pagas antes 7, no Clarevo 5, sem conta 0, faltam 36, soma 3.060.000; parcela 13 em 10/10/2026, última em 10/09/2029.
    const carro = (await r.repo.getSeries(r.s3.id))!;
    const occ = await r.occurrencesOf(carro.id);
    const open = await r.repo.listOpenSeriesOccurrences(carro.id);
    const progress = installmentProgress(carro, occ, open, r.today());
    expect([progress.paidBefore, progress.paidInApp, progress.remaining, progress.remainingCents, progress.lastDueOn]).toEqual([
      7, 5, 36, 3_060_000, '2029-09-10',
    ]);
    expect(missingMonths(carro, occ, r.today())).toEqual([]);
    const next = open[0]!;
    expect([occurrenceLabel(next), next.dueOn]).toEqual(['Parcela 13 de 48', '2026-10-10']);
    // Atividade: ausência de 20/05 a 07/10; decisão versão 1 'atualizou'.
    expect(await r.repo.getReturnReviewState(r.ctx)).toEqual({
      activity: act('2026-10-07', '2026-05-20', '2026-10-07'),
      mark: { reviewedThrough: '2026-09', decision: 'atualizou', decidedOn: '2026-10-07', version: 1 },
    });
    // Operações: 6 criar_ocorrencia, 12 pagar_compromisso, 3 criar, 1 decidir_revisao; 12 gastos gerados.
    const after = r.keys.filter((k) => ['criar_ocorrencia', 'pagar_compromisso', 'criar', 'decidir_revisao'].includes(k.action)).slice(5);
    const count = (action: string) => after.filter((k) => k.action === action).length;
    expect([count('criar_ocorrencia'), count('pagar_compromisso'), count('criar'), count('decidir_revisao')]).toEqual([6, 12, 3, 1]);
    for (const k of after.filter((x) => x.action === 'criar_ocorrencia' || x.action === 'pagar_compromisso')) {
      expect((await r.repo.findCommitmentOperation(k.key))?.action).toBe(k.action);
    }
    let generated = 0;
    for (const m of ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10']) {
      generated += (await r.repo.listRecords(r.ctx, m)).filter((x) => x.commitmentId !== null).length;
    }
    expect(generated).toBe(12);
    // Contas criadas pela revisão obedecem S1 a S10 e levam a autoria de quem criou a série.
    expect(() => r.repo.checkInvariants()).not.toThrow();

    // R6 · erros.
    const s1 = (await r.repo.getSeries(r.s1.id))!;
    await expectCode(r.repo.createSeriesOccurrence(newOperationKey(), s1.id, s1.version, 3, 'aberta'), 'ocorrencia_existente');
    await expectCode(r.repo.createSeriesOccurrence(newOperationKey(), s1.id, s1.version, 6, 'aberta'), 'mes_fora_da_revisao');
    await expectCode(r.repo.createSeriesOccurrence(newOperationKey(), s1.id, s1.version, 7, 'aberta'), 'mes_fora_da_revisao');
    await expectCode(r.repo.createSeriesOccurrence(newOperationKey(), carro.id, carro.version, 7, 'aberta'), 'numero_fora_da_serie');
    await expectCode(r.repo.createSeriesOccurrence(newOperationKey(), carro.id, carro.version, 49, 'aberta'), 'numero_fora_da_serie');
    await expectCode(r.repo.createSeriesOccurrence(newOperationKey(), s1.id, s1.version + 1, 3, 'aberta'), 'versao_desatualizada');
    await expectCode(r.repo.createSeriesOccurrence(newOperationKey(), s1.id, 0, 3, 'aberta'), 'versao_desatualizada');
    await expectCode(r.repo.createSeriesOccurrence(newOperationKey(), s1.id, s1.version, 3, 'talvez' as never), 'modo_invalido');
    await expectCode(r.repo.createSeriesOccurrence(newOperationKey(), 'serie-inexistente', 1, 3, 'aberta'), 'nao_encontrado');
    const usedKey = r.keys.find((k) => k.action === 'criar_ocorrencia')!.key;
    await expectCode(r.repo.createSeriesOccurrence(usedKey, r.s1.id, 1, 3, 'nao_houve'), 'chave_reutilizada');
    await expectCode(r.repo.decideReturnReview(newOperationKey(), r.ctx, 0, '2026-09', 'seguiu'), 'versao_desatualizada');
    await expectCode(r.repo.decideReturnReview(newOperationKey(), r.ctx, 1, '2026-10', 'seguiu'), 'mes_invalido');
    await expectCode(r.repo.decideReturnReview(newOperationKey(), r.ctx, 1, '2025-10', 'seguiu'), 'mes_invalido');
    await expectCode(r.repo.decideReturnReview(newOperationKey(), r.ctx, 1, '2026-9', 'seguiu'), 'mes_invalido');
    await expectCode(r.repo.decideReturnReview(newOperationKey(), r.ctx, 1, '2026-09', 'talvez' as never), 'decisao_invalida');
    await expectCode(r.repo.decideReturnReview(newOperationKey(), 'outro-contexto', 1, '2026-09', 'seguiu'), 'sem_permissao');
    const later = await r.repo.decideReturnReview(newOperationKey(), r.ctx, 1, '2026-08', 'seguiu');
    expect(later).toEqual({ reviewedThrough: '2026-09', decision: 'seguiu', decidedOn: '2026-10-07', version: 2 });
  });

  it('repetição, chave reutilizada e reconciliação depois de falha de rede', async () => {
    const r = await openR1();
    const review = await r.review();
    const july = rowsOf(review, '2026-07').find((x) => x.description === 'Aluguel')!;
    const k1 = newOperationKey();
    // Gravado, resposta perdida: a reconciliação acha a conta pela chave.
    r.repo.failNextWrite = 'depois';
    await expectCode(r.repo.createSeriesOccurrence(k1, july.series!.id, july.seriesVersion!, july.series!.number, 'aberta'), 'rede');
    const found = await r.repo.findCommitmentOperation(k1);
    expect(found).toMatchObject({ action: 'criar_ocorrencia', recordId: null });
    // Repetição com a mesma chave devolve a mesma conta, sem conta nova.
    const before = (await r.repo.listCommitmentsDueBetween(r.ctx, '2026-07', '2026-07')).length;
    const again = await r.repo.createSeriesOccurrence(k1, july.series!.id, july.seriesVersion!, july.series!.number, 'aberta');
    expect(again.commitment.id).toBe(found!.commitmentId);
    expect(again.commitment).toMatchObject({ status: 'aberto', dueOn: '2026-07-05', amountCents: 250_000, createdBy: 'pessoa-1', version: 1 });
    expect((await r.repo.listCommitmentsDueBetween(r.ctx, '2026-07', '2026-07')).length).toBe(before);
    await expectCode(r.repo.createSeriesOccurrence(k1, july.series!.id, july.seriesVersion!, july.series!.number, 'nao_houve'), 'chave_reutilizada');
    // A série não mudou de versão; a decisão repetida devolve a marca atual.
    expect((await r.repo.getSeries(july.series!.id))!.version).toBe(july.seriesVersion);
    const kd = newOperationKey();
    const m1 = await r.repo.decideReturnReview(kd, r.ctx, 0, '2026-09', 'seguiu');
    expect(await r.repo.decideReturnReview(kd, r.ctx, 0, '2026-09', 'seguiu')).toEqual(m1);
    await expectCode(r.repo.decideReturnReview(kd, r.ctx, 0, '2026-09', 'atualizou'), 'chave_reutilizada');
  });

  it('conta criada em aberto muda o conjunto afetado de "esta e as próximas"', async () => {
    const r = await openR1();
    const s1 = (await r.repo.getSeries(r.s1.id))!;
    const list = await r.repo.listOpenSeriesOccurrences(s1.id);
    const july = rowsOf(await r.review(), '2026-07').find((x) => x.description === 'Aluguel')!;
    await r.stillOpen(july);
    const affected = list.filter((c) => c.series!.number >= 2).map((c) => ({ id: c.id, version: c.version }));
    await expectCode(
      r.repo.updateSeriesFrom(newOperationKey(), s1.id, s1.version, 2, affected, {
        nature: 'conta',
        description: 'Aluguel',
        category: 'Moradia',
        amountCents: 260_000,
        amountMode: 'fixo',
        dueDay: 5,
      }),
      'versao_desatualizada',
    );
  });

  it('exemplo Academia: "Não houve" em julho e agosto', async () => {
    const h = await harness('2026-05-20');
    const { series, occurrences } = await h.series({ description: 'Academia', category: 'Saúde', amountCents: 12_000, dueDay: 15, firstDueMonth: '2026-05' });
    // Maio e junho pagos antes do tempo sem anotar.
    for (const c of occurrences) await h.pay(c, c.amountCents, '2026-05-20');
    h.setToday('2026-10-07');
    await h.repo.syncSeriesOccurrences(h.ctx);
    let review = await h.review();
    const gaps = review.months.flatMap((m) => m.rows).filter((x) => x.state === 'sem_conta');
    expect(gaps.map((g) => g.series!.number)).toEqual([3, 4]);
    for (const g of gaps) {
      expect(rowActions(g)).toContain('nao_houve');
      const w = await h.notHappened(g);
      expect(w.commitment.series!.number).toBe(g.series!.number);
    }
    const s = (await h.repo.getSeries(series.id))!;
    expect(s.skippedNumbers).toEqual([3, 4]);
    expect(seriesGapsInRange(s, await h.repo.listCommitmentsDueBetween(h.ctx, '2026-05', '2026-09'), '2026-05', '2026-09')).toEqual([]);
    for (const m of ['2026-07', '2026-08']) expect(summarizeMonth(await h.repo.listRecords(h.ctx, m), h.ctx, m).paidCents).toBe(0);
    expect(await h.repo.syncSeriesOccurrences(h.ctx)).toEqual({ created: 0, createdOverdue: 0 });
    await expectCode(h.repo.createSeriesOccurrence(newOperationKey(), s.id, s.version, 3, 'aberta'), 'ocorrencia_existente');
    review = await h.review();
    expect(review.months.flatMap((m) => m.rows).filter((x) => x.state === 'sem_conta')).toEqual([]);
  });

  it('monthsOverview: período de até 12 meses', async () => {
    const r = await openR1();
    expect((await r.repo.monthsOverview(r.ctx, '2025-10', '2026-09')).length).toBe(12);
    await expectCode(r.repo.monthsOverview(r.ctx, '2025-09', '2026-09'), 'periodo_invalido');
    await expectCode(r.repo.monthsOverview(r.ctx, '2026-09', '2026-08'), 'periodo_invalido');
    await expectCode(r.repo.monthsOverview(r.ctx, '2026-13', '2026-09'), 'periodo_invalido');
    await expectCode(r.repo.monthsOverview('outro-contexto', '2026-05', '2026-09'), 'sem_permissao');
    expect(await r.repo.listCommitmentsDueBetween('outro-contexto', '2026-05', '2026-09')).toEqual([]);
    expect(await r.repo.getReturnReviewState('outro-contexto')).toEqual({ activity: null, mark: null });
  });
});

describe('MemoryRepository: sequência R7 (contas do ano)', () => {
  it('IPTU sem abrir o app até 15/06/2028', async () => {
    const h = await harness('2026-10-07');
    const { series } = await h.series({
      kind: 'anual',
      description: 'IPTU',
      amountCents: 18_000,
      amountMode: 'variavel',
      dueDay: 10,
      firstDueMonth: '2027-02',
      partsPerYear: 10,
    });
    expect((await h.repo.getReturnReviewState(h.ctx)).activity).toEqual(act('2026-10-07'));
    // R7.1
    h.setToday('2028-06-15');
    expect(await h.repo.syncSeriesOccurrences(h.ctx)).toEqual({ created: 7, createdOverdue: 2 });
    const review = await h.review();
    expect(review.window).toMatchObject({ kind: 'ausencia', anchor: '2026-10-07', fromMonth: '2027-07', toMonth: '2028-05', cutBefore: '2027-07' });
    expect(RETURN_TEXT.cut(review.window.cutBefore!)).toBe('Meses antes de julho de 2027 não entram neste resumo.');
    expect(review.months.length).toBe(11);
    const groups = review.months.flatMap((m) => m.items.flatMap((i) => (i.type === 'ano' ? [{ month: m.month, group: i.group }] : [])));
    expect(groups.map((g) => [g.month, g.group.text, g.group.rows.map((x) => x.series!.number)])).toEqual([
      ['2027-07', 'IPTU de 2027 · 5 parcelas sem conta registrada', [6, 7, 8, 9, 10]],
      ['2028-02', 'IPTU de 2028 · 3 parcelas sem conta registrada', [11, 12, 13]],
    ]);
    expect(groups.map((g) => groupActions(g.group))).toEqual([[], []]);
    expect(groups[0]!.group.a11yLabel).toBe('IPTU de 2027, 5 parcelas sem conta registrada, de 10/07/2027 a 10/11/2027');
    // As linhas do grupo não se repetem nos meses seguintes.
    expect(monthOfReview(review, '2027-08').items).toEqual([]);
    expect(reviewMonthCard(monthOfReview(review, '2027-07')).lines).toEqual(['IPTU de 2027 · 5 parcelas sem conta registrada']);
    expect(reviewMonthCard(monthOfReview(review, '2027-08')).lines).toEqual(['Nenhuma conta para conferir.']);
    const may = monthOfReview(review, '2028-05');
    expect(may.items.map((i) => (i.type === 'linha' ? [i.row.series!.number, i.row.state] : null))).toEqual([[14, 'aberta']]);
    expect(review.current.rows.map((x) => [x.series!.number, x.dueOn])).toEqual([[15, '2028-06-10']]);
    expect(review.counts).toEqual({ monthsWithGaps: 11, billsToCheck: 10 });
    expect(review.steps.length).toBe(12);
    expect(returnBannerText(review)!.body).toBe(
      'Sua última anotação foi em 07/10/2026. Desde então: 11 meses com algo sem registro e 10 contas para conferir.',
    );
    const toPay = await h.toPay('2028-06');
    expect([toPay.toPayCents, toPay.estimatedCents]).toEqual([36_000, 36_000]);
    // R7.2 · "Não houve" em n6.
    const row = (n: number) => review.months.flatMap((m) => m.rows).find((x) => x.series!.number === n)!;
    expect(rowActions(row(6))).toEqual(['ja_paguei', 'nao_houve', 'ainda_nao_paguei']);
    const skipped = await h.notHappened(row(6));
    expect(skipped.commitment.series!.number).toBe(6);
    expect((await h.repo.getSeries(series.id))!.skippedNumbers).toEqual([6]);
    expect(await h.repo.syncSeriesOccurrences(h.ctx)).toEqual({ created: 0, createdOverdue: 0 });
    // R7.3 · "Já paguei" em n7 com 189,90 em 10/08/2027.
    expect(rowPaymentDraft(row(7)).amountCents).toBeNull();
    await h.paid(row(7), 18_990, '2027-08-10');
    expect((await h.repo.monthsOverview(h.ctx, '2027-08', '2027-08'))[0]!.paidCents).toBe(18_990);
    expect(summarizeMonth(await h.repo.listRecords(h.ctx, '2027-08'), h.ctx, '2027-08').paidCents).toBe(18_990);
    // R7.4 · erros.
    const s = (await h.repo.getSeries(series.id))!;
    await expectCode(h.repo.createSeriesOccurrence(newOperationKey(), s.id, s.version, 5, 'aberta'), 'mes_fora_da_revisao');
    await expectCode(h.repo.createSeriesOccurrence(newOperationKey(), s.id, s.version, 14, 'aberta'), 'ocorrencia_existente');
    await expectCode(h.repo.createSeriesOccurrence(newOperationKey(), s.id, s.version, 6, 'aberta'), 'ocorrencia_existente');
    expect(() => h.repo.checkInvariants()).not.toThrow();
    // Depois de R7.2 e R7.3, a revisão segue (agora como volta) sem n6 e n7.
    const after = await h.review();
    expect(after.window.kind).toBe('volta');
    const first = after.months.flatMap((m) => m.items).find((i) => i.type === 'ano');
    expect(first?.type === 'ano' && first.group.rows.map((x) => x.series!.number)).toEqual([8, 9, 10]);
  });

  it('grupo de conta do ano em aberto: "Não houve em 2027"', () => {
    const s = iptuSerie({ firstNumber: 2, firstDueMonth: '2027-03' });
    const open = (n: number, dueOn: string): Commitment => ({
      id: `iptu-${n}`,
      contextId: 'ctx',
      description: 'IPTU',
      amountCents: 18_000,
      currency: 'BRL',
      dueOn,
      category: 'Moradia',
      status: 'aberto',
      payment: null,
      series: { id: 'iptu', number: n, kind: 'anual', nature: 'conta', installmentTotal: null, partsPerYear: 10 },
      seriesOverride: false,
      amountIsEstimate: true,
      createdBy: 'pessoa-1',
      version: 1,
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
    });
    const list = [2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => open(n, `2027-${String(n + 1).padStart(2, '0')}-10`));
    const w = returnWindow(state(act('2027-02-10')), '2027-12-01')!;
    const review = buildReturnReview(w, monthsOverview([], 'ctx', w.fromMonth, w.toMonth), list, [s], '2027-12-01');
    const items = review.months.flatMap((m) => m.items);
    expect(items.length).toBe(1);
    const group = items[0]!.type === 'ano' ? items[0]!.group : null;
    expect(group).toMatchObject({ state: 'aberta', text: 'IPTU de 2027 · 9 parcelas em aberto', number: 2, label: '2027' });
    expect(groupActions(group!)).toEqual(['nao_houve_ano']);
    expect(RETURN_TEXT.notHappenedYear(group!.label)).toBe('Não houve em 2027');
  });
});

// ---------------------------------------------------------------------------
// Demonstração
// ---------------------------------------------------------------------------

describe('demonstração', () => {
  it('padrão: tudo anotado em 07/10/2026, sem faixa; conta nova sem atividade', async () => {
    const repo = await createDemoRepository();
    const ctx = (await repo.getSpace())!.personalContextId;
    expect(await repo.getReturnReviewState(ctx)).toEqual({ activity: act(DEMO_TODAY), mark: null });
    expect((await loadReturnReview(repo, ctx, DEMO_TODAY)).review).toBeNull();
    const fresh = new MemoryRepository({ actorId: 'pessoa-nova', displayName: 'Pessoa nova', today: () => DEMO_TODAY });
    const freshCtx = (await fresh.ensurePersonalSpace('Conta principal')).personalContextId;
    expect(await fresh.getReturnReviewState(freshCtx)).toEqual({ activity: null, mark: null });
    expect(await fresh.listSeries(freshCtx)).toEqual([]);
  });

  it("cenário 'retorno' (?cenario=retorno): faixa com 4 meses e 13 contas depois da geração", async () => {
    expect(demoScenarioFrom('retorno')).toBe('retorno');
    expect(demoScenarioFrom(' Retorno ')).toBe('retorno');
    expect(demoScenarioFrom(undefined)).toBe('padrao');
    expect(demoScenarioFrom('outro')).toBe('padrao');
    const repo = await createDemoRepository({ scenario: 'retorno' });
    const ctx = (await repo.getSpace())!.personalContextId;
    expect((await repo.getReturnReviewState(ctx)).activity).toEqual(act(DEMO_RETURN_SETUP_DAY));
    expect(await repo.syncSeriesOccurrences(ctx)).toEqual({ created: 9, createdOverdue: 4 });
    const { review } = await loadReturnReview(repo, ctx, DEMO_TODAY);
    expect(review!.counts).toEqual({ monthsWithGaps: 4, billsToCheck: 13 });
    expect(returnBannerText(review!)!.body).toBe(
      'Sua última anotação foi em 20/05/2026. Desde então: 4 meses com algo sem registro e 13 contas para conferir.',
    );
    const may = summarizeMonth(await repo.listRecords(ctx, '2026-05'), ctx, '2026-05');
    expect([may.receivedCents, may.paidCents]).toEqual([600_000, 476_530]);
    const toPay = summarizeToPay(await repo.listCommitments(ctx, '2026-10'), ctx, '2026-10', DEMO_TODAY);
    expect(toPay.toPayCents).toBe(1_059_000);
    expect(seriesGapForExpense(review!, '2026-07', ' aluguel')?.series?.number).toBe(3);
    expect(seriesGapForExpense(review!, '2026-07', 'Mercado')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 8. Teste de textos
// ---------------------------------------------------------------------------

/** Lista da spec2.md §5 (a mesma de copy.test.ts). */
const FORBIDDEN =
  /\b(recomendamos|recomendo|invista|aplique|tesouro|cdb|lci|lca|caixinha|cofrinho)\b|fundo de investimento|rentabilidade garantida|rendimento garantido|retorno garantido|enriquec|faz(er|endo)?\s+sentido|[\u2013\u2014]/i;
/** Cobrança e culpa (spec3 §2.5, teste 8). */
const COLLECTION = /\b(sumiu|sumid\w*|abandon\w*|atrasad\w*|esquec\w*|deveria|culpa|bagun\w*|pend[eê]nci\w*)\b/i;
/** Nunca falar de ausência nem contar dias sem anotar (o único "dias" é o do campo Dia: "Junho tem 30 dias."). */
const ABSENCE = /aus[eê]nci|sem usar|\d+\s*dias?\b(?!\.$)|\bvoc[eê] (n[aã]o )?(anotou|usou) (nada|o app)/i;

describe('textos do Ciclo A4', () => {
  it('as listas reprovam o que devem', () => {
    for (const bad of ['Você sumiu', 'conta atrasada', 'pendência', 'Você esqueceu', 'deveria anotar', 'bagunça']) expect(COLLECTION.test(bad)).toBe(true);
    for (const bad of ['140 dias sem anotar', 'sua ausência']) expect(ABSENCE.test(bad)).toBe(true);
    expect(ABSENCE.test('Junho tem 30 dias.')).toBe(false);
  });

  it('RETURN_TEXT e os textos calculados: sem termos proibidos, sem cobrança, sem contar dias', async () => {
    const texts = returnTextSamples();
    expect(texts.length).toBeGreaterThan(150);
    // Também os textos de uma revisão real (R1 e R7 do cenário de demonstração).
    const repo = await createDemoRepository({ scenario: 'retorno' });
    const ctx = (await repo.getSpace())!.personalContextId;
    await repo.syncSeriesOccurrences(ctx);
    const { review } = await loadReturnReview(repo, ctx, DEMO_TODAY);
    const rows = [...review!.months.flatMap((m) => m.rows), ...review!.current.rows];
    texts.push(
      ...Object.values(returnBannerText(review!)!),
      returnOpeningText(review!),
      reviewCurrentText(review!.current)!,
      ...review!.months.flatMap((m) => {
        const card = reviewMonthCard(m);
        return [card.title, card.received, card.paid, ...card.lines];
      }),
      ...rows.flatMap((x) => [reviewRowText(x), reviewRowA11yLabel(x), rowName(x), rowShortName(x)]),
    );
    for (const text of texts) {
      expect(text, text).not.toMatch(FORBIDDEN);
      expect(text, text).not.toMatch(COLLECTION);
      expect(text, text).not.toMatch(ABSENCE);
      expect(text.trim(), text).not.toBe('');
    }
    // A faixa não mostra valores.
    for (const text of Object.values(returnBannerText(review!)!)) expect(text).not.toMatch(/R\$/);
  });
});
