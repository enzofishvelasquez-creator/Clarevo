/// <reference types="node" />
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  CARDS_TEXT,
  CARD_CHARGE_LABEL,
  CARD_ERROR_TEXT,
  CARD_STATUS_LABEL,
  INVOICE_SITUATION_LABEL,
  MemoryRepository,
  cardErrorText,
  cardSummaryTexts,
  cardTitle,
  closesText,
  creditText,
  dueTextOf,
  installmentsNotice,
  invoiceLineText,
  invoiceMonthLabel,
  invoiceRecordDescription,
  invoiceTexts,
  limitUsedText,
  loadInvoices,
  partialPaymentText,
  purchaseNotice,
  summarizeCard,
  SIMULATE_DISCLAIMER,
  SIMULATE_ERROR_TEXT,
  SIMULATE_TEXT,
  SIMULATION_FIELD_ORDER,
  SIMULATION_MODES,
  simulationErrorText,
  simulationResultLines,
  validateSimulationDraft,
  SAVINGS_ERROR_TEXT,
  SAVINGS_TEXT,
  lastIncomeReferenceChange,
  minimumReserveOptions,
  savingsCardState,
  savingsErrorText,
  savingsPlan,
  savingsPlanTexts,
  savingsReferenceText,
  savingsSmallSteps,
  validateMinimumReserveDraft,
  validateSavingsDraft,
  GOALS_TEXT,
  GOAL_ERROR_TEXT,
  GOAL_MOVEMENT_KINDS,
  GOAL_RESERVE_REFERENCE,
  GOAL_STATUS_LABEL,
  GOAL_TYPE_LABEL,
  MOVEMENT_LABEL,
  committedGoalLines,
  essentialEstimateText,
  goalCardCaption,
  goalDetailTexts,
  goalErrorText,
  goalPlan,
  goalPreview,
  goalsMonthTexts,
  movementLine,
  reserveCardTexts,
  validateGoalDraft,
  validateGoalMovementDraft,
  validateSavedValueDraft,
  ANNUAL_SERIES_ERROR_TEXT,
  COMMITTED_TEXT,
  INCOME_REFERENCE_ERROR_TEXT,
  committedLine,
  committedTexts,
  paymentsForecast,
  projectCommitted,
  summarizeCommitted,
  upcomingCommittedMonths,
  CALCULATORS,
  CALC_DISCLAIMER,
  CALC_ERROR_TEXT,
  CALC_GROUPS,
  CALC_INTRO,
  CALC_SLUGS,
  CALC_UI_TEXT,
  COTA_UNICA_SUBTITLE,
  COTA_UNICA_TITLE,
  DIVIDA_TEXT,
  DIVIDIR_TEXT,
  MULTA_EXACT_TEXT,
  ORGANIZE_TEXT,
  QUICK_PAY_TEXT,
  QUITAR_ESTIMATE_TEXT,
  RESERVA_REFERENCIA,
  RESERVA_TEXT,
  SUM_TEXT,
  calcCustoDaDivida,
  calcCustoPorAno,
  calcDividirContas,
  calcErrorText,
  calcFields,
  calcJuntarParaObjetivo,
  calcRowA11yLabel,
  calcMultaEJuros,
  calcParceladoOuAVista,
  calcQuitarAntes,
  calcReserva,
  categoryBreakdown,
  payablesCaption,
  seriesCaptionShort,
  shortcutA11yLabel,
  summarizeMonth,
  type CalcErrorCode,
  type CalcOutcome,
  type CalcTexts,
  COMMITMENT_ERROR_TEXT,
  DEMO_TODAY,
  ERROR_TEXT,
  PAYMENT_ERROR_TEXT,
  SERIES_ERROR_TEXT,
  SERIES_NATURE_LABEL,
  SERIES_NATURE_SHORT,
  affectedByEditFrom,
  affectedByEnd,
  affectedByYear,
  annualLastYearHint,
  annualStartChoices,
  annualYearErrorText,
  annualYearRange,
  annualYearSummary,
  createDemoRepository,
  findSeriesConflicts,
  firstMonthChoices,
  firstMonthRangeText,
  groupAnnualLater,
  installmentProgress,
  newOperationKey,
  occurrenceLabel,
  seriesCaption,
  seriesErrorText,
  seriesPreview,
  suggestedAnnualReference,
  summarizeToPay,
  termHistory,
  toPayCaption,
  wholeYearPayment,
} from '../src';

/**
 * Teste de textos (seção 5): sem indicação de produto financeiro, promessa de rendimento, travessões longos
 * nem a expressão proibida. Os avisos obrigatórios passam, porque a lista não proíbe "recomendação" nem
 * "garantido" sozinhos.
 */
const FORBIDDEN =
  /\b(recomendamos|recomendo|invista|aplique|tesouro|cdb|lci|lca|caixinha|cofrinho)\b|fundo de investimento|rentabilidade garantida|rendimento garantido|retorno garantido|enriquec|faz(er|endo)?\s+sentido|[\u2013\u2014]/i;

describe('textos do core', () => {
  it('a lista não reprova os avisos obrigatórios e reprova o que deve', () => {
    expect(FORBIDDEN.test('Não é promessa de rendimento nem recomendação de investimento.')).toBe(false);
    expect(FORBIDDEN.test('Não é o valor para quitar.')).toBe(false);
    // A expressão proibida é montada aqui para não aparecer escrita no código.
    const proibida = ['faz', 'sentido'].join(' ');
    for (const bad of ['Invista já', proibida, 'a \u2014 b', 'a \u2013 b', 'rendimento garantido']) expect(FORBIDDEN.test(bad)).toBe(true);
  });

  it('constantes *_TEXT e rótulos', () => {
    const texts = [
      ERROR_TEXT,
      COMMITMENT_ERROR_TEXT,
      PAYMENT_ERROR_TEXT,
      SERIES_ERROR_TEXT,
      ANNUAL_SERIES_ERROR_TEXT,
      SERIES_NATURE_LABEL,
      SERIES_NATURE_SHORT,
    ].flatMap((o) => Object.values(o));
    expect(texts.length).toBeGreaterThan(40);
    for (const text of texts) expect(text).not.toMatch(FORBIDDEN);
  });

  it('textos calculados de gastos fixos na demonstração', async () => {
    const repo = await createDemoRepository();
    const ctx = (await repo.getSpace())!.personalContextId;
    const texts: string[] = [firstMonthRangeText(DEMO_TODAY), ...firstMonthChoices(31, DEMO_TODAY).map((c) => c.label)];
    for (const s of await repo.listSeries(ctx)) {
      const occurrences = await repo.listSeriesOccurrences(s.id);
      texts.push(seriesCaption(s, DEMO_TODAY), ...termHistory(s).map((h) => h.text));
      // Conta do ano sem conta criada (IPVA e IPTU em 07/10/2026): sem Math.max de lista vazia (-Infinity).
      const n = occurrences.length ? Math.max(...occurrences.map((c) => c.series!.number)) : s.firstNumber;
      const edit = affectedByEditFrom(occurrences, s, n);
      if (edit.ok) texts.push(edit.text);
      const end = affectedByEnd(occurrences, s, s.firstNumber - 1);
      if (end.ok && end.text) texts.push(end.text);
      const open = await repo.listOpenSeriesOccurrences(s.id);
      expect(installmentProgress(s, occurrences, open, DEMO_TODAY).remainingCents ?? 0).toBeGreaterThanOrEqual(0);
      const term = s.terms[0]!;
      const preview = seriesPreview(
        {
          kind: s.kind,
          nature: s.nature,
          description: term.description,
          category: term.category,
          amountCents: term.amountCents,
          amountMode: term.amountMode,
          dueDay: term.dueDay,
          firstDueMonth: s.firstDueMonth,
          firstNumber: s.firstNumber,
          installmentTotal: s.installmentTotal,
          partsPerYear: s.partsPerYear,
          lastMonth: null,
        },
        DEMO_TODAY,
      );
      texts.push(preview.text, ...preview.lines);
      const conflicts = findSeriesConflicts(preview, await repo.listCommitments(ctx, preview.firstMonth), await repo.listRecords(ctx, preview.firstMonth), [s]);
      texts.push(...Object.values(conflicts.texts).filter((t): t is string => t !== null));
    }
    const caption = toPayCaption(summarizeToPay(await repo.listCommitments(ctx, '2026-11'), ctx, '2026-11', DEMO_TODAY), DEMO_TODAY);
    texts.push(...Object.values(caption).filter((t): t is string => t !== null));
    expect(texts.length).toBeGreaterThan(15);
    for (const text of texts) expect(text).not.toMatch(FORBIDDEN);
  });

  it('textos calculados de contas do ano (demonstração avançada no tempo)', async () => {
    let today = DEMO_TODAY;
    const repo = await createDemoRepository();
    const ctx = (await repo.getSpace())!.personalContextId;
    const accountId = (await repo.getSpace())!.accounts[0]!.id;
    (repo as unknown as { opts: { today: () => string } }).opts.today = () => today;
    const texts: string[] = [
      firstMonthRangeText(DEMO_TODAY, 'anual'),
      seriesErrorText('fim_invalido', DEMO_TODAY, 'anual'),
      annualYearErrorText('versao_desatualizada', '2027'),
      annualLastYearHint(4, 11, 2026, '2027')!,
    ];
    for (const [k, month] of [
      [1, 1],
      [10, 2],
      [4, 11],
    ] as const) {
      const choices = annualStartChoices(k, month, 31, DEMO_TODAY);
      texts.push(...choices.years.map((c) => c.label), ...(choices.started ? [choices.started.title, choices.started.hint, ...choices.started.parts.map((c) => c.label)] : []));
    }
    // Seguro de 4 parcelas atravessando o ano, criado já em Contas a pagar.
    await repo.createSeries(newOperationKey(), ctx, {
      kind: 'anual',
      nature: 'conta',
      description: 'Seguro residencial',
      category: 'Moradia',
      amountCents: 12000,
      amountMode: 'variavel',
      dueDay: 15,
      firstDueMonth: '2026-11',
      firstNumber: 1,
      installmentTotal: null,
      partsPerYear: 4,
      lastMonth: null,
    });
    today = '2026-12-01';
    await repo.syncSeriesOccurrences(ctx);
    for (const s of (await repo.listSeries(ctx)).filter((x) => x.kind === 'anual')) {
      const capped = await repo.listSeriesOccurrences(s.id);
      const open = await repo.listOpenSeriesOccurrences(s.id);
      const all = [...capped, ...open];
      texts.push(seriesCaption(s, today), ...termHistory(s).map((h) => h.text), ...all.map((c) => occurrenceLabel(c)!));
      const term = s.terms[0]!;
      const preview = seriesPreview(
        {
          kind: s.kind,
          nature: s.nature,
          description: term.description,
          category: term.category,
          amountCents: term.amountCents,
          amountMode: term.amountMode,
          dueDay: term.dueDay,
          firstDueMonth: s.firstDueMonth,
          firstNumber: s.firstNumber,
          installmentTotal: s.installmentTotal,
          partsPerYear: s.partsPerYear,
          lastMonth: null,
        },
        today,
      );
      texts.push(preview.text, preview.savedText!, ...preview.lines);
      const conflicts = findSeriesConflicts(preview, all, [], [s]);
      texts.push(...Object.values(conflicts.texts).filter((t): t is string => t !== null));
      const { from, to } = annualYearRange(s, today);
      for (let a = from; a <= to; a++) {
        const y = annualYearSummary(s, capped, open, a, today);
        texts.push(...Object.values(y.texts).filter((t): t is string => t !== null));
      }
      const n = open[0]?.series?.number;
      if (n !== undefined) {
        for (const mode of ['informar', 'tirar'] as const) {
          const plan = affectedByYear(all, s, n, mode, 19000);
          if (plan.ok) texts.push(plan.title, plan.text, plan.doneText);
          else if (plan.code === 'nada_a_mudar') texts.push(plan.text);
        }
        const whole = wholeYearPayment(all, s, open[0]!);
        if (whole) texts.push(whole.label, whole.hint, whole.doneText, whole.failedText);
        const edit = affectedByEditFrom(all, s, n);
        if (edit.ok) texts.push(edit.text);
        const end = affectedByEnd(all, s, s.firstNumber - 1);
        if (end.ok && end.text) texts.push(end.text);
        // Pagar a primeira para gerar a sugestão de referência.
        await repo.payCommitment(newOperationKey(), open[0]!.id, open[0]!.version, { accountId, amountCents: 13000, paidOn: today, category: null });
        const sug = suggestedAnnualReference((await repo.getSeries(s.id))!, await repo.listSeriesOccurrences(s.id), today);
        if (sug) texts.push(sug.text, sug.action);
      }
    }
    const later = summarizeToPay(await repo.listCommitments(ctx, '2026-12'), ctx, '2026-12', today).later;
    for (const g of groupAnnualLater(later)) if (g.type === 'ano') texts.push(g.group.title, g.group.caption, g.group.a11yLabel);
    expect(texts.length).toBeGreaterThan(40);
    for (const text of texts) expect(text).not.toMatch(FORBIDDEN);
  });
});

/**
 * Calculadoras e "Achar tudo" (spec4 §1.2): os arquivos-fonte novos do core passam pelo mesmo FORBIDDEN e pelas
 * palavras de julgamento; os textos montados (resultado, hipóteses, avisos, rótulos e mensagens) são gerados com
 * várias entradas e conferidos um a um. O resultado de "Multa e juros" nunca fala em atraso.
 */
const JUDGMENT =
  /vale a pena|\bruim\b|\bcuidado|desperd[ií]cio|\bcortes?\b|\batrasad[oa]s?\b|\bestour|\binvista\b|\bcaixinha\b|saldo devedor/i;

const CORE_SRC = fileURLToPath(new URL('../src/', import.meta.url));

function coreFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return coreFiles(path);
    return /\.ts$/.test(name) ? [path] : [];
  });
}

/** Junta os textos de um resultado ok (e do parcelamento da fatura, quando houver). */
function outcomeTexts(out: CalcOutcome<CalcTexts & { parcelamento?: CalcOutcome<CalcTexts, string> | null }, string>): string[] {
  if (!out.ok) return [];
  const r = out.result;
  const nested = r.parcelamento && r.parcelamento.ok ? [...r.parcelamento.result.resultLines, ...r.parcelamento.result.hypotheses, ...r.parcelamento.result.notes] : [];
  return [...r.resultLines, ...r.hypotheses, ...r.notes, ...nested];
}

/** Resultados de todas as calculadoras com entradas comuns e de borda. */
function calculatorResultTexts(): { all: string[]; multa: string[]; quitar: string[] } {
  const all: string[] = [];
  for (const modo of ['compra', 'cota-unica'] as const)
    for (const primeiraNaCompra of [false, true])
      for (const [aVista, parcelas, parcela] of [
        ['1.080,00', '10', '120,00'],
        ['1.080,00', '10', '100,00'],
        ['100,00', '2', '100,00'],
        ['1,00', '2', '9.999.999,99'],
        ['1.000,00', '12', '83,34'],
      ] as const)
        for (const formaPagamento of [null, 'boleto', 'cartao'] as const)
          all.push(...outcomeTexts(calcParceladoOuAVista({ modo, aVista, parcelas, parcela, primeiraNaCompra, formaPagamento })));
  for (const frequencia of ['dia_util', 'semana', 'mes'] as const) all.push(...outcomeTexts(calcCustoPorAno({ valor: '25,00', frequencia })));
  for (const taxaMes of ['2', '8', '8,01', '14', '99,99'])
    for (const [parcelarTaxaMes, parcelarParcelas] of [['', ''], ['8', '24'], ['8', '12'], ['8', '']]) {
      all.push(...outcomeTexts(calcCustoDaDivida({ tipo: 'rotativo', valor: '700,00', taxaMes, parcelarTaxaMes, parcelarParcelas })));
      all.push(...outcomeTexts(calcCustoDaDivida({ tipo: 'cheque_especial', valor: '1.000,00', taxaMes, meses: '1' })));
      all.push(...outcomeTexts(calcCustoDaDivida({ tipo: 'cheque_especial', valor: '1.000,00', taxaMes, meses: '3' })));
      all.push(...outcomeTexts(calcCustoDaDivida({ tipo: 'emprestimo', valor: '5.000,00', taxaMes, parcelas: '1' })));
      all.push(...outcomeTexts(calcCustoDaDivida({ tipo: 'emprestimo', valor: '5.000,00', taxaMes, parcelas: '12' })));
    }
  const quitar: string[] = [];
  for (const [modo, quantas] of [['tudo', ''], ['ultimas', '1'], ['ultimas', '3']] as const)
    for (const prazosEmDias of [undefined, Array.from({ length: 36 }, (_, k) => 34 + 30 * k)])
      quitar.push(...outcomeTexts(calcQuitarAntes({ parcela: '850,00', restantes: '36', taxaMes: '1,5', modo, quantas, prazosEmDias })));
  quitar.push(...outcomeTexts(calcQuitarAntes({ parcela: '850,00', restantes: '1', taxaMes: '1,5', modo: 'tudo' })));
  const multa: string[] = [];
  for (const dias of ['1', '10', '3.650']) multa.push(...outcomeTexts(calcMultaEJuros({ valor: '200,00', multaPct: '2', jurosMesPct: '1', dias })));
  for (const [guardado, mensal] of [['', ''], ['4.500,00', '500,00'], ['50,00', '1'], ['30.000,00', '10'], ['7.500,00', '']])
    all.push(...outcomeTexts(calcReserva({ essenciais: '3.750,00', meses: '6', guardado, mensal })));
  all.push(...outcomeTexts(calcReserva({ essenciais: '3.750,00', meses: '1', guardado: '1.000,00', mensal: '100,00' })));
  for (const input of [
    { alvo: '22.500,00', jaTem: '4.500,00', modo: 'prazo' as const, meses: '14' },
    { alvo: '22.500,00', jaTem: '4.500,00', modo: 'mensal' as const, mensal: '1.100,00' },
    { alvo: '22.500,00', jaTem: '22.500,00', modo: 'prazo' as const, meses: '1' },
    { alvo: '1.000,00', modo: 'prazo' as const, meses: '600' },
  ])
    all.push(...outcomeTexts(calcJuntarParaObjetivo(input)));
  all.push(...outcomeTexts(calcDividirContas({ total: '100,00', modo: 'iguais', pessoas: [{}, { apelido: 'Ana' }, {}] })));
  all.push(...outcomeTexts(calcDividirContas({ total: '3.000,00', modo: 'renda', pessoas: [{ renda: '4.000,00' }, { renda: '6.000,00' }] })));
  all.push(...outcomeTexts(calcDividirContas({ total: '0,01', modo: 'renda', pessoas: [{ renda: '9.999.999,99' }, { renda: '9.999.999,99' }] })));
  return { all: [...all, ...multa, ...quitar], multa, quitar };
}

/** Rótulos, dicas, opções e mensagens de erro de todos os campos. */
function fieldTexts(): string[] {
  const out: string[] = [];
  const codes = Object.keys(CALC_ERROR_TEXT) as CalcErrorCode[];
  for (const slug of CALC_SLUGS)
    for (const modo of slug === 'parcelado-ou-a-vista' ? [undefined, 'cota-unica'] : [undefined])
      for (const [name, spec] of Object.entries(calcFields(slug, modo))) {
        out.push(spec.label, ...(spec.hint ? [spec.hint] : []), ...(spec.options ?? []).map((o) => o.label));
        for (const code of codes) out.push(calcErrorText(slug, name, code, modo));
      }
  return out;
}

describe('textos das calculadoras e de "Achar tudo"', () => {
  it('a lista de julgamento reprova o que deve e não reprova os textos obrigatórios', () => {
    for (const bad of ['Não vale a pena', 'ruim', 'Cuidado', 'desperdício', 'corte', 'conta atrasada', 'estourou', 'Invista', 'caixinha', 'saldo devedor'])
      expect(JUDGMENT.test(bad)).toBe(true);
    for (const ok of [CALC_DISCLAIMER, QUITAR_ESTIMATE_TEXT, MULTA_EXACT_TEXT, 'Multa e juros por atraso', 'Dívidas e atrasos', 'Ainda a pagar'])
      expect(JUDGMENT.test(ok)).toBe(false);
  });

  it('arquivos-fonte: calculators/**, learn/**, sum.ts e shortcuts.ts', () => {
    const files = [...coreFiles(join(CORE_SRC, 'calculators')), ...coreFiles(join(CORE_SRC, 'learn')), join(CORE_SRC, 'sum.ts'), join(CORE_SRC, 'shortcuts.ts')];
    expect(files.length).toBeGreaterThan(15);
    for (const slug of ['parcelado-ou-a-vista', 'quitar-antes', 'dividir-contas']) expect(files.some((f) => f.endsWith(`${slug}.ts`))).toBe(true);
    const bad = files.filter((f) => {
      const text = readFileSync(f, 'utf8');
      return FORBIDDEN.test(text) || JUDGMENT.test(text);
    });
    expect(bad.map((f) => f.slice(CORE_SRC.length))).toEqual([]);
  });

  it('resultados, hipóteses e avisos montados', () => {
    const { all, multa, quitar } = calculatorResultTexts();
    expect(all.length).toBeGreaterThan(300);
    for (const text of all) {
      expect(text).not.toMatch(FORBIDDEN);
      expect(text).not.toMatch(JUDGMENT);
    }
    expect(multa.length).toBeGreaterThan(5);
    for (const text of multa) expect(text).not.toMatch(/atras/i);
    expect(multa.some((t) => t.includes('depois do vencimento'))).toBe(true);
    expect(quitar.filter((t) => t === QUITAR_ESTIMATE_TEXT).length).toBeGreaterThan(5);
  });

  it('catálogo, rótulos, mensagens e textos fixos', async () => {
    const quick = QUICK_PAY_TEXT;
    const texts: string[] = [
      CALC_DISCLAIMER,
      CALC_INTRO,
      COTA_UNICA_TITLE,
      COTA_UNICA_SUBTITLE,
      QUITAR_ESTIMATE_TEXT,
      MULTA_EXACT_TEXT,
      RESERVA_REFERENCIA.text,
      ...Object.values(RESERVA_TEXT),
      ...CALCULATORS.flatMap((c) => [c.title, c.subtitle, calcRowA11yLabel(c.title, c.subtitle)]),
      ...CALC_GROUPS.map((g) => g.title),
      ...Object.values(CALC_ERROR_TEXT),
      ...Object.values(DIVIDA_TEXT),
      ...Object.values(CALC_UI_TEXT).flatMap((v) => (typeof v === 'string' ? [v] : Array.isArray(v) ? [] : Object.values(v as Record<string, string>))),
      DIVIDIR_TEXT.addPerson,
      DIVIDIR_TEXT.removePerson('Pessoa 1'),
      DIVIDIR_TEXT.nicknameLabel(0),
      DIVIDIR_TEXT.nicknameHint,
      DIVIDIR_TEXT.incomeLabel('Pessoa 2'),
      DIVIDIR_TEXT.peopleRange,
      SUM_TEXT.open,
      SUM_TEXT.add,
      SUM_TEXT.use,
      SUM_TEXT.close,
      SUM_TEXT.maxReached,
      SUM_TEXT.total(4_840),
      SUM_TEXT.itemLabel(0),
      SUM_TEXT.remove(1),
      ...Object.values(SUM_TEXT.errors),
      quick.button,
      quick.estimateButton,
      quick.title('Luz'),
      quick.line(18_000, '2026-10-08'),
      quick.confirm,
      quick.change,
      quick.cancel,
      quick.a11y('Luz', '2026-10-12', '2026-10-08'),
      quick.estimateA11y('Luz', '2026-10-08', '2026-10-08'),
      quick.done('Internet'),
      ORGANIZE_TEXT.title,
      ...[ORGANIZE_TEXT.payables, ORGANIZE_TEXT.series, ORGANIZE_TEXT.calculators].flatMap((o) => Object.values(o)),
      ...[0, 1, 2].map((n) => payablesCaption({ openCents: 65_000 * Math.min(n, 1), overdueCount: n, month: '2026-10', currentMonth: '2026-10' })),
      payablesCaption({ openCents: 30_000, overdueCount: 0, month: '2027-01', currentMonth: '2026-10' }),
      seriesCaptionShort([]),
      seriesCaptionShort([{ kind: 'mensal' }]),
      seriesCaptionShort([{ kind: 'mensal' }, { kind: 'anual' }]),
      shortcutA11yLabel('Contas a pagar', 'R$ 650,00 em aberto neste mês · 1 vencida'),
      ...fieldTexts(),
    ];
    const repo = await createDemoRepository();
    const ctx = (await repo.getSpace())!.personalContextId;
    const s = summarizeMonth(await repo.listRecords(ctx, '2026-10'), ctx, '2026-10');
    texts.push(...categoryBreakdown(s.composition.paid).flatMap((r) => [r.label, r.percentText, r.a11yLabel]));
    expect(texts.length).toBeGreaterThan(400);
    for (const text of texts) {
      expect(text).not.toMatch(FORBIDDEN);
      expect(text).not.toMatch(JUDGMENT);
    }
  });
});

/**
 * Renda comprometida (Ciclo B, spec2 §5 "Sem julgamento"): sem cor de alerta nem julgamento ("alto", "ruim", "cuidado",
 * "estourou", "endividado", "atrasado"), sem "disponível" ou "sobra" (para não confundir com saldo). A previsão dos
 * pagamentos do mês também nunca usa "Diferença".
 */
const NEUTRAL = /\balt[oa]s?\b|\bruim\b|cuidado|estour|endividad|atrasad|dispon[ií]vel|\bsobra|alerta|perig/i;

/** Todas as strings fixas de um objeto de textos (funções ficam de fora: são chamadas à parte). */
function staticStrings(o: unknown): string[] {
  if (typeof o === 'string') return [o];
  if (o && typeof o === 'object') return Object.values(o).flatMap(staticStrings);
  return [];
}

describe('textos da renda comprometida (Ciclo B)', () => {
  it('a lista neutra reprova o que deve e aceita os textos obrigatórios', () => {
    for (const bad of ['Comprometimento alto', 'ruim', 'Cuidado', 'estourou', 'endividado', 'atrasado', 'disponível', 'sobra no mês'])
      expect(NEUTRAL.test(bad)).toBe(true);
    for (const ok of [COMMITTED_TEXT.outsideNote, COMMITTED_TEXT.debtReference, COMMITTED_TEXT.reference.intro, 'Alterar', 'Ocultar referência'])
      expect(NEUTRAL.test(ok)).toBe(false);
  });

  it('COMMITTED_TEXT, INCOME_REFERENCE_ERROR_TEXT e os textos montados na demonstração', async () => {
    const T = COMMITTED_TEXT;
    const texts: string[] = [
      ...staticStrings(T),
      ...Object.values(INCOME_REFERENCE_ERROR_TEXT),
      T.resumoTitle('2026-10'),
      T.resumoA11y('2026-10', '52,5%', 315_000, 600_000),
      T.resumoEmptyA11y('2026-10'),
      T.emptyMonth('2026-10'),
      T.highlightCaption('2026-10'),
      T.highlightAmounts(315_000, 600_000),
      T.meterPaid(250_000),
      T.meterOpen(65_000),
      T.meterA11y('52,5%', 250_000, 65_000),
      T.groupLine('Gastos fixos', 250_000, '41,7%'),
      T.groupLine('Gastos fixos', 250_000, null),
      T.groupA11y('Gastos fixos', 250_000, '41,7%'),
      T.groupA11y('Gastos fixos', 250_000, null),
      T.debtLine(85_000, '14,2%'),
      T.debtLine(85_000, null),
      T.outside(285_000),
      T.estimated(18_000),
      T.overdueBefore(4_000, '2026-10'),
      T.overReference(72_000),
      T.annualShare(35_000),
      T.referenceLine(600_000, '2026-09'),
      T.received('2026-10', 600_000),
      T.reviewHint('2026-09', '2026-10'),
      T.reviewHint('2026-12', '2027-01'),
      T.noReferenceLabel('2026-10'),
      T.how('2026-10'),
      T.reference.suggestion(600_000, ['2026-09']),
      T.reference.suggestion(580_000, ['2026-07', '2026-08', '2026-09']),
      T.reference.useSuggestion(600_000),
      T.reference.deleteTitle('2026-10'),
      T.reference.saved('2026-10'),
      T.forecast('2026-10', 455_000),
      T.forecastEstimated(18_000),
    ];
    const repo = await createDemoRepository();
    const ctx = (await repo.getSpace())!.personalContextId;
    const refs = await repo.listIncomeReferences(ctx);
    const series = await repo.listSeries(ctx);
    for (const month of ['2026-09', '2026-10', '2026-11']) {
      const s = summarizeCommitted(await repo.listCommitments(ctx, month), ctx, month, DEMO_TODAY, refs, series);
      const t = committedTexts(s, 600_000);
      texts.push(
        ...Object.values(committedLine(s)).filter((v): v is string => typeof v === 'string'),
        ...staticStrings({ ...t, groups: null }),
        ...t.groups.flatMap((g) => [g.label, g.line, g.a11yLabel, g.percentText ?? '']),
      );
      // Sem referência.
      const bare = summarizeCommitted(await repo.listCommitments(ctx, month), ctx, month, DEMO_TODAY, []);
      texts.push(...Object.values(committedLine(bare)).filter((v): v is string => typeof v === 'string'), ...staticStrings({ ...committedTexts(bare), groups: null }));
    }
    const months = upcomingCommittedMonths('2026-10');
    const p = projectCommitted(series, await repo.listCommitmentsDueBetween(ctx, months[0]!, months[5]!), refs, months, DEMO_TODAY);
    texts.push(...p.months.flatMap((m) => [m.text, m.a11yLabel]), ...p.milestones.map((m) => m.text));
    expect(texts.length).toBeGreaterThan(150);
    for (const text of texts) {
      expect(text, text).not.toMatch(FORBIDDEN);
      expect(text, text).not.toMatch(JUDGMENT);
      expect(text, text).not.toMatch(NEUTRAL);
    }
  });

  it('previsão dos pagamentos do mês: sem "Diferença", "disponível" nem "sobra"', async () => {
    const repo = await createDemoRepository();
    const ctx = (await repo.getSpace())!.personalContextId;
    const paid = summarizeMonth(await repo.listRecords(ctx, '2026-10'), ctx, '2026-10').paidCents;
    const f = paymentsForecast(paid, summarizeToPay(await repo.listCommitments(ctx, '2026-10'), ctx, '2026-10', DEMO_TODAY))!;
    for (const text of [f.text, COMMITTED_TEXT.forecast('2026-11', 1), COMMITTED_TEXT.forecastEstimated(18_000)]) {
      expect(text).not.toMatch(/diferen[cç]a|dispon[ií]vel|\bsobra/i);
      expect(text).not.toMatch(FORBIDDEN);
    }
  });

  it('arquivo-fonte committed.ts', () => {
    const text = readFileSync(join(CORE_SRC, 'committed.ts'), 'utf8');
    expect(text).not.toMatch(FORBIDDEN);
    expect(text).not.toMatch(JUDGMENT);
  });
});

/**
 * Metas e reserva (Ciclo C, spec2 §4.6 e §5): sem produto, banco, aplicação ou taxa; sem julgamento ("atrasado na meta",
 * "ruim", "cuidado"), sem "disponível" ou "sobra" e sem celebração automática. O regex SAVINGS_HINT, que lê o texto
 * digitado pela pessoa, fica fora da conferência do arquivo-fonte.
 */
const CELEBRATION = /parab[eé]ns|uhu|\bvoc[eê] conseguiu|arrasou|incr[ií]vel|sucesso|\bviva\b|[\u{1F389}\u{1F38A}\u{1F3C6}\u{1F973}]/iu;

describe('textos de metas (Ciclo C)', () => {
  it('a lista de celebração reprova o que deve e aceita os textos obrigatórios', () => {
    for (const bad of ['Parabéns!', 'Você conseguiu', 'Meta incrível', '\u{1F389}']) expect(CELEBRATION.test(bad), bad).toBe(true);
    for (const ok of [GOALS_TEXT.reachedBadge, GOALS_TEXT.detail.reachedBody, GOALS_TEXT.detail.concluded]) expect(CELEBRATION.test(ok), ok).toBe(false);
  });

  it('GOALS_TEXT, GOAL_ERROR_TEXT, rótulos e os textos montados na demonstração', async () => {
    const T = GOALS_TEXT;
    const texts: string[] = [
      ...staticStrings(T),
      ...staticStrings(GOAL_ERROR_TEXT),
      ...staticStrings(GOAL_TYPE_LABEL),
      ...staticStrings(GOAL_STATUS_LABEL),
      ...staticStrings(MOVEMENT_LABEL),
      GOAL_RESERVE_REFERENCE.text,
      GOAL_RESERVE_REFERENCE.sourceText,
      T.monthOutside('2026-10', 285_000),
      T.monthCommitted('52,5%'),
      T.monthSaved('2026-10', 50_000),
      T.monthWithdrawn('2026-10', 20_000),
      T.savedOfTarget(350_000, 2_250_000),
      T.percent(15),
      T.coverage(9, 350_000),
      T.coverage(0, 100),
      T.coverage(25, 1_000_000),
      T.plannedShort(50_000),
      T.progressA11y('Viagem de férias', 20, 120_000, 600_000),
      T.cardDeadline('2027-07', 48_000),
      T.cardDeadlinePassed('2026-09'),
      T.cardPlanned(50_000, '2029-12'),
      T.reserve.essentialsAverage(['2026-07', '2026-08', '2026-09'], ['Moradia', 'Mercado', 'Transporte']),
      T.reserve.essentialsBills('2026-10', 315_000),
      ...[1, 3, 6, 12, 24].map((n) => T.reserve.monthChip(n)),
      T.reserve.result(2_250_000, 6, 375_000),
      T.previewPlanned(50_000, '2029-12'),
      T.previewDeadline('2027-07', 48_000),
      T.detail.ofTarget(2_250_000, 20),
      T.detail.missing(1_800_000),
      T.detail.deadline('2027-12', 128_572),
      T.detail.deadlinePassed('2026-09'),
      T.detail.planned(100_000, '2028-04'),
      T.detail.compositionInitial(300_000),
      T.detail.compositionDeposits(150_000),
      T.detail.compositionWithdrawals(0),
      T.detail.compositionIncome(3_720),
      T.detail.compositionDepreciation(1_000),
      T.detail.deleteTitle('Viagem de férias'),
      ...GOAL_MOVEMENT_KINDS.map((k) => T.movement.editTitle(k)),
      T.update.preview('valorizacao', 3_720),
      T.update.preview('desvalorizacao', 3_720),
      T.update.button('valorizacao', 3_720),
      T.update.button('desvalorizacao', 3_720),
      T.negativeOn('2026-10-02', true),
      T.negativeOn('2026-10-02', false),
      ...[
        'saldo_da_meta_insuficiente',
        'data_futura',
        'meta_arquivada',
        'reserva_ja_existe',
        'plano_invalido',
        'saldo_inicial_invalido',
        'observacao_longa',
        'origem_invalida',
        'alvo_invalido',
        'desconhecido',
      ].flatMap((code) =>
        GOAL_MOVEMENT_KINDS.map((kind) => goalErrorText(code, { kind, negativeDay: '2026-10-02' })),
      ),
      ...GOAL_MOVEMENT_KINDS.flatMap((kind) => {
        const line = movementLine({ kind, amountCents: 150_000, occurredOn: '2026-10-06' });
        return [line.text, line.a11yLabel];
      }),
      essentialEstimateText({ source: 'media_gastos', amountCents: 375_000, months: ['2026-09'], byCategory: [{ category: 'Moradia', cents: 375_000 }], excludedAnnualCents: 240_000 }),
      essentialEstimateText({ source: 'contas_do_mes', amountCents: 315_000, month: '2026-10' }),
      essentialEstimateText({ source: 'informado', amountCents: null }),
    ];
    // Erros dos formulários.
    const draft = validateGoalDraft(
      {
        goalType: 'emergencia',
        name: '',
        targetText: '',
        essentialBaseText: 'x',
        essentialMonthsText: '30',
        essentialBaseSource: 'informado',
        targetMonthText: '13/2026',
        initialText: 'x',
        plannedText: '0',
      },
      DEMO_TODAY,
    );
    if (!draft.ok) texts.push(...Object.values(draft.errors));
    const goalDraftErrors = validateGoalDraft(
      { goalType: 'objetivo', name: 'x'.repeat(41), targetText: '', essentialBaseText: '', essentialMonthsText: '', essentialBaseSource: 'informado', targetMonthText: '09/2026', initialText: '', plannedText: '' },
      DEMO_TODAY,
    );
    if (!goalDraftErrors.ok) texts.push(...Object.values(goalDraftErrors.errors));
    for (const kind of GOAL_MOVEMENT_KINDS) {
      const m = validateGoalMovementDraft({ kind, amountText: '0', dateText: '08/10/2026', note: 'x'.repeat(81) }, DEMO_TODAY, { editing: true });
      if (!m.ok) texts.push(...Object.values(m.errors));
    }
    for (const text of ['abc', '99.999.999,99']) {
      const v = validateSavedValueDraft(text, 400_000);
      if (!v.ok) texts.push(v.error);
    }
    // Demonstração: cards, plano, detalhe, histórico, "Seu mês" e as linhas da renda comprometida.
    const repo = await createDemoRepository();
    const ctx = (await repo.getSpace())!.personalContextId;
    const goals = await repo.listGoals(ctx);
    const month = await repo.listGoalMovementsInMonth(ctx, '2026-10');
    const s = summarizeCommitted(await repo.listCommitments(ctx, '2026-10'), ctx, '2026-10', DEMO_TODAY, await repo.listIncomeReferences(ctx));
    texts.push(...staticStrings(goalsMonthTexts(s, 50_000, '2026-10')), ...staticStrings(committedGoalLines(s, 50_000, 98_000)));
    texts.push(...staticStrings(committedGoalLines(s, -20_000, 300_000)));
    for (const g of goals) {
      const movements = await repo.listGoalMovements(g.id);
      const plan = goalPlan(g, month, DEMO_TODAY);
      texts.push(goalCardCaption(plan) ?? '', ...staticStrings(reserveCardTexts(g)), ...staticStrings(goalDetailTexts(g, movements, DEMO_TODAY)));
      texts.push(...movements.flatMap((m) => [movementLine(m).text, movementLine(m).a11yLabel]));
      texts.push(goalPreview({ targetCents: g.targetCents, savedCents: g.savedCents, targetMonth: g.targetMonth, plannedMonthlyCents: g.plannedMonthlyCents }, DEMO_TODAY, month) ?? '');
    }
    expect(texts.length).toBeGreaterThan(200);
    for (const text of texts) {
      expect(text, text).not.toMatch(FORBIDDEN);
      expect(text, text).not.toMatch(JUDGMENT);
      expect(text, text).not.toMatch(NEUTRAL);
      expect(text, text).not.toMatch(CELEBRATION);
    }
    // Nenhum texto de metas cita produto, banco ou taxa sugerida; "aplicação" só como lugar genérico do dinheiro.
    for (const text of texts) expect(text, text).not.toMatch(/\b(tesouro|cdb|lci|lca|poupan[cç]a|selic|nubank|banco do brasil|caixa econ)/i);
  });

  it('arquivo-fonte goals.ts (fora a linha de SAVINGS_HINT)', () => {
    const lines = readFileSync(join(CORE_SRC, 'goals.ts'), 'utf8').split('\n');
    const checked = lines.filter((l) => !l.includes('SAVINGS_HINT = '));
    expect(lines.length - checked.length).toBe(1);
    const text = checked.join('\n');
    expect(text).not.toMatch(FORBIDDEN);
    expect(text).not.toMatch(JUDGMENT);
    expect(text).not.toMatch(CELEBRATION);
  });
});

/**
 * Plano de guardar (spec7): os textos da pergunta, de "Sim, consigo", de "Agora não", da reserva mínima e dos passos
 * pequenos passam por todas as listas do Ciclo C, mais "você deveria" e "cortar" (nada de dizer o que fazer com o dinheiro).
 * Textos montados com várias entradas (plano da demonstração, sem gastos essenciais, alcançado, passa de 50 anos, valor
 * fora da faixa) e o arquivo-fonte savings.ts.
 */
const SAVINGS_EXTRA = /voc[eê] deveria|\bdeveria\b|\bcortar\b|\bcorte\b|\bgaste menos\b|\bevite gastar\b/i;

describe('textos do plano de guardar (spec7)', () => {
  it('as listas reprovam o que deve', () => {
    for (const bad of ['Você deveria guardar mais', 'Que tal cortar gastos?', 'Gaste menos', 'Corte o lazer']) expect(SAVINGS_EXTRA.test(bad), bad).toBe(true);
    for (const ok of [SAVINGS_TEXT.askTitle, SAVINGS_TEXT.notNowBody, SAVINGS_TEXT.afterStage]) expect(SAVINGS_EXTRA.test(ok), ok).toBe(false);
  });

  it('textos fixos da especificação, palavra por palavra', () => {
    const T = SAVINGS_TEXT;
    expect(T.askTitle).toBe('Você consegue guardar algum valor por mês?');
    expect(T.askBody).toBe('Sua resposta ajuda a montar um plano com os seus números. Ela fica só com você.');
    expect([T.yes, T.notNow, T.later]).toEqual(['Sim, consigo', 'Agora não', 'Responder depois']);
    expect(T.askAgainTitle).toBe('Sua situação mudou? Você consegue guardar algum valor por mês?');
    expect(T.incomeChangedTitle).toBe('Sua renda de referência mudou. Quer rever quanto guardar por mês?');
    expect(T.changeValue).toBe('Mudar valor');
    expect(T.firstStepTitle).toBe('Planejar quanto guardar');
    expect(T.amountLabel).toBe('Quanto você consegue guardar por mês?');
    expect(T.useThisPlan).toBe('Usar este plano');
    expect(T.afterStage).toBe('Depois, o mesmo valor pode ir para as suas metas.');
    expect(T.notNowBody).toBe('Tudo bem. Muita gente começa com valores pequenos, e qualquer valor guardado ajuda num imprevisto.');
    expect(T.minimumTitle).toBe('Quer começar uma reserva mínima?');
    expect([T.minimumEssentials, T.minimumOther, T.minimumCreate]).toEqual(['1 mês dos seus gastos essenciais', 'Outro valor', 'Criar reserva mínima']);
    expect(T.weeklyStep(1_000)).toBe('Guardar R$ 10,00 por semana');
    expect(T.weeklyStepMonthly(4_333)).toBe('R$ 43,33 por mês');
    expect(T.extraStep).toBe('Guardar quando entrar um valor extra');
    expect([T.helpWhere, T.helpCommitted, T.askNextMonth]).toEqual(['Ver para onde foi o dinheiro', 'Ver renda comprometida', 'Me pergunte de novo no próximo mês']);
    expect(T.stageWithMonth(30_000, T.stageSubjectReserve(1, 375_000, '1 mês dos seus gastos essenciais'), '2027-11')).toBe(
      'Com R$ 300,00 por mês, a primeira etapa (R$ 3.750,00, 1 mês dos seus gastos essenciais) chega em novembro de 2027.',
    );
  });

  it('SAVINGS_TEXT, SAVINGS_ERROR_TEXT e os textos montados', async () => {
    const T = SAVINGS_TEXT;
    const texts: string[] = [
      ...staticStrings(T),
      ...staticStrings(SAVINGS_ERROR_TEXT),
      T.planMonthly(50_000),
      T.planMonthly(1),
      T.weeklyStep(1_000),
      T.weeklyStepMonthly(4_333),
      ...[1, 2, 3].map((n) => T.stageSubjectReserve(n, 375_000, `${n} meses dos seus gastos essenciais`)),
      T.stageSubjectGoal('Viagem de férias', 600_000),
      T.stageWithMonth(50_000, T.stageSubjectGoal('Viagem de férias', 600_000), '2027-09'),
      T.stageReachedSentence(T.stageSubjectGoal('Viagem de férias', 600_000), false),
      T.stageReachedSentence(T.stageSubjectReserve(1, 375_000, '1 mês dos seus gastos essenciais'), true),
      T.stageBeyondSentence(100, T.stageSubjectGoal('Viagem de férias', 600_000)),
      T.stageNoForecast(T.stageSubjectGoal('Viagem de férias', 600_000), 480_000),
      T.stageMonth('2029-12'),
      ...['valor_invalido', 'valor_acima_do_limite', 'versao_desatualizada', 'resposta_invalida', 'sem_permissao', 'desconhecido'].map(savingsErrorText),
    ];
    const draftErrors = ['', 'abc', '0', '99.999.999,99'].map((v) => validateSavingsDraft(v));
    for (const d of draftErrors) if (!d.ok) texts.push(d.error);
    for (const v of ['', '99,99', '10.000.000,00']) {
      const d = validateMinimumReserveDraft(v);
      if (!d.ok) texts.push(d.error);
    }
    for (const e of [null, 375_000, 20_000]) texts.push(...minimumReserveOptions(e).map((o) => o.label));
    for (const s of savingsSmallSteps()) texts.push(s.label, s.monthlyLabel ?? '');

    // Cartões da pergunta, em todos os estados.
    const back = (answer: 'consigo' | 'agora_nao' | 'depois') => ({
      contextId: 'ctx',
      answer,
      monthlyCents: answer === 'consigo' ? 50_000 : null,
      answeredOn: '2026-10-07',
      askAgainOn: answer === 'consigo' ? null : '2026-10-14',
      version: 1,
      createdAt: '',
      updatedAt: '',
    });
    for (const c of [null, back('depois'), back('agora_nao'), back('consigo')]) {
      for (const day of ['2026-10-08', '2026-12-01']) {
        const s = savingsCardState(c, day, '2026-10-08');
        if (s.kind === 'pergunta') texts.push(s.title);
      }
    }

    // Plano da demonstração (com metas e reserva), sem metas, sem gastos essenciais, alcançado e além do limite.
    const repo = await createDemoRepository();
    const ctx = (await repo.getSpace())!.personalContextId;
    const goals = await repo.listGoals(ctx);
    const movements = await repo.listGoalMovementsInMonth(ctx, '2026-10');
    const reserve = goals.find((g) => g.goalType === 'emergencia')!;
    const variants = [
      { monthlyCents: 50_000, essentialCents: reserve.essentialBaseCents, goals, movements },
      { monthlyCents: 50_000, essentialCents: reserve.essentialBaseCents, goals, movements, chosenStageId: 'reserva-6' },
      { monthlyCents: 30_000, essentialCents: 375_000, goals: [], movements: [] },
      { monthlyCents: 30_000, essentialCents: null, goals, movements },
      { monthlyCents: 100, essentialCents: 375_000, goals, movements },
      { monthlyCents: 0, essentialCents: 375_000, goals, movements },
      { monthlyCents: 100_000, essentialCents: 10_000, goals, movements },
      { monthlyCents: 100_000, essentialCents: 300_000_000, goals: [], movements: [] },
    ];
    for (const v of variants) {
      const p = savingsPlan({ ...v, today: DEMO_TODAY });
      const t = savingsPlanTexts(p);
      texts.push(t.monthly, t.headline ?? '', t.afterStage ?? '', t.needsEssentials ?? '', t.reference, t.referenceSource, t.noInterest);
      for (const s of t.stages) texts.push(s.title, s.amount, s.missing, s.month ?? '', s.sentence);
    }
    // Com a referência do mês.
    const refs = await repo.listIncomeReferences(ctx);
    const list = await repo.listCommitments(ctx, '2026-10');
    texts.push(savingsReferenceText(summarizeCommitted(list, ctx, '2026-10', DEMO_TODAY, refs), '2026-10') ?? '');
    texts.push(savingsReferenceText(summarizeCommitted(list, ctx, '2026-10', DEMO_TODAY, refs.map((r) => ({ ...r, amountCents: 100_000 }))), '2026-10') ?? '');

    expect(texts.length).toBeGreaterThan(100);
    expect(lastIncomeReferenceChange(refs)).toBeNull();
    for (const text of texts) {
      expect(text, text).not.toMatch(FORBIDDEN);
      expect(text, text).not.toMatch(JUDGMENT);
      expect(text, text).not.toMatch(NEUTRAL);
      expect(text, text).not.toMatch(CELEBRATION);
      expect(text, text).not.toMatch(SAVINGS_EXTRA);
      // Nenhum produto, banco ou taxa sugerida; nenhum rendimento prometido.
      expect(text, text).not.toMatch(/\b(tesouro|cdb|lci|lca|poupan[cç]a|selic|nubank|banco do brasil|caixa econ|rende|rendendo|garantid)/i);
    }
  });

  it('arquivo-fonte savings.ts', () => {
    const text = readFileSync(join(CORE_SRC, 'savings.ts'), 'utf8');
    expect(text).not.toMatch(FORBIDDEN);
    expect(text).not.toMatch(JUDGMENT);
    expect(text).not.toMatch(NEUTRAL);
    expect(text).not.toMatch(CELEBRATION);
    expect(text).not.toMatch(SAVINGS_EXTRA);
  });
});

/**
 * Cartões de crédito (Ciclo E, D-037): sem julgamento ("estourou", "gastou demais"), sem "disponível" nem alerta, sem número
 * de cartão nem produto financeiro. O aviso da compra e o texto do pagamento parcial são conferidos palavra por palavra.
 */
describe('textos de cartões (Ciclo E)', () => {
  it('o aviso da compra e o texto do pagamento parcial, como na especificação', () => {
    expect(purchaseNotice('2026-11', 'Nubank', DEMO_TODAY)).toBe('Esta compra entra na fatura de novembro do Nubank e conta em Pago quando a fatura for paga.');
    expect(partialPaymentText(30_000, '2026-12', DEMO_TODAY)).toBe(
      'Ficaram R$ 300,00 para a fatura de dezembro. Juros e encargos do banco entram quando você informar a fatura de dezembro.',
    );
    expect(CARDS_TEXT.invoice.calcLink).toBe('Quanto custa pagar só uma parte?');
    expect(CARDS_TEXT.expense.save).toBe('Anotar compra no cartão');
    expect(CARDS_TEXT.expense.installments).toBe('Em quantas vezes?');
    expect(CARDS_TEXT.expense.paymentMethod).toBe('Forma de pagamento');
    expect(CARDS_TEXT.expense.credit).toBe('Cartão de crédito');
    expect(CARDS_TEXT.expense.registerCard).toBe('Cadastrar cartão');
    expect(CARDS_TEXT.invoice.payInvoice).toBe('Pagar fatura');
    expect(CARDS_TEXT.invoice.payOther).toBe('Outro valor');
    expect(CARDS_TEXT.invoice.addCharges).toBe('Informar encargos');
    expect(CARDS_TEXT.invoice.addRefund).toBe('Registrar estorno');
    expect(CARDS_TEXT.invoice.undoPayment).toBe('Desfazer pagamento');
    expect(CARDS_TEXT.paymentOrigin).toBe('Pagamento de fatura');
    expect(CARDS_TEXT.chargesCategory).toBe('Encargos do cartão');
    expect(invoiceRecordDescription('Nubank', '2026-10', '2026-10-20')).toBe('Fatura Nubank (outubro)');
    expect(CARDS_TEXT.topicParagraph).toMatch(/só contam em Pago quando a fatura é paga/);
    expect(CARDS_TEXT.topicParagraph).toMatch(/anotar a fatura como conta a pagar continua valendo/);
  });

  it('CARDS_TEXT, CARD_ERROR_TEXT, rótulos e os textos montados (demonstração, pagamento parcial, crédito e fim de ano)', async () => {
    const T = CARDS_TEXT;
    const texts: string[] = [
      ...staticStrings(T),
      ...staticStrings(CARD_ERROR_TEXT),
      ...staticStrings(INVOICE_SITUATION_LABEL),
      ...staticStrings(CARD_STATUS_LABEL),
      ...staticStrings(CARD_CHARGE_LABEL),
      COMMITTED_TEXT.invoiceNote,
      COMMITTED_TEXT.groupLabel.faturas,
      T.expense.savedFor('2026-11', DEMO_TODAY),
      T.expense.savedFor('2027-01', DEMO_TODAY),
      T.recordLine('Nubank', '2026-10', '2026-10-20'),
      T.recordLine('Nubank', '2027-01', '2026-12-20'),
      purchaseNotice('2026-11', 'Nubank', DEMO_TODAY),
      purchaseNotice('2027-01', 'Cartão do mercado', DEMO_TODAY),
      installmentsNotice(10, 15_000),
      partialPaymentText(30_000, '2027-01', '2026-12-20'),
      creditText(3_000),
      limitUsedText(230_000, 500_000),
      limitUsedText(530_000, 500_000),
      limitUsedText(0, null),
      closesText('2026-11-03', '2026-11-03'),
      closesText('2026-11-03', '2026-11-04'),
      closesText('2026-11-03', '2026-10-07'),
      dueTextOf('2026-11-10', '2026-11-10'),
      dueTextOf('2026-11-10', '2026-11-11'),
      dueTextOf('2026-11-10', '2026-10-07'),
      cardTitle({ name: 'Nubank', lastDigits: '1234' }),
      cardTitle({ name: 'Nubank', lastDigits: null }),
      invoiceMonthLabel('2027-01', DEMO_TODAY),
      ...(['juros', 'multa', 'iof', 'anuidade', 'tarifa'] as const).map((t) => CARD_CHARGE_LABEL[t]),
    ];
    const codes = Object.keys(CARD_ERROR_TEXT);
    for (const code of codes) texts.push(cardErrorText(code));
    // Demonstração: lista, fatura atual e linhas.
    const demo = await createDemoRepository();
    const ctx = (await demo.getSpace())!.personalContextId;
    for (const card of await demo.listCards(ctx)) {
      const invoices = await loadInvoices(demo, card, DEMO_TODAY);
      const summary = summarizeCard(card, invoices, DEMO_TODAY);
      const t = cardSummaryTexts(summary, DEMO_TODAY);
      texts.push(t.title, t.invoiceLine, t.closes, t.due, t.limit, t.a11yLabel, ...t.closed);
      for (const inv of invoices) {
        const it = invoiceTexts(inv, DEMO_TODAY);
        texts.push(it.title, it.situation, it.total, it.closes, it.due, it.period, it.a11yLabel, ...(it.estimated ? [it.estimated] : []));
        for (const l of inv.lines) texts.push(invoiceLineText(l));
      }
    }
    // Pagamento parcial, crédito levado, fatura fechada e paga, no fim do ano.
    const clock = { today: '2026-10-07' };
    const repo = new MemoryRepository({ actorId: 'pessoa-texto', displayName: 'Pessoa', today: () => clock.today });
    const space = await repo.ensurePersonalSpace('Conta principal');
    const card = (await repo.createCard(newOperationKey(), space.personalContextId, { name: 'Roxinho', lastDigits: '0042', closingDay: 3, dueDay: 10, limitCents: 100_000 })).card;
    await repo.addCardPurchase(newOperationKey(), card.id, { description: 'Fone', category: 'Lazer', purchasedOn: '2026-10-05', totalCents: 90_000, installments: 3 });
    await repo.addCardCharge(newOperationKey(), card.id, { chargeType: 'anuidade', amountCents: 3_000, invoiceMonth: '2026-11' });
    await repo.addCardRefund(newOperationKey(), card.id, { description: 'Devolução do fone', category: 'Lazer', amountCents: 80_000, invoiceMonth: '2026-11' });
    for (const day of ['2026-10-07', '2026-11-04']) {
      clock.today = day;
      const stateInvoices = await loadInvoices(repo, card, day);
      for (const inv of stateInvoices) {
        const it = invoiceTexts(inv, day);
        texts.push(it.title, it.situation, it.total, it.closes, it.due, it.period, it.a11yLabel, ...(it.credit ? [it.credit] : []), ...(it.partial ? [it.partial] : []), ...(it.paid ? [it.paid] : []));
        for (const l of inv.lines) texts.push(invoiceLineText(l));
      }
    }
    clock.today = '2026-12-20';
    // Novembro fica com crédito de R$ 470,00, que passa por dezembro (crédito de R$ 170,00) e chega a janeiro (R$ 130,00 a pagar).
    const jan = (await loadInvoices(repo, card, clock.today)).find((i) => i.month === '2027-01')!;
    expect(jan.totalCents).toBe(13_000);
    const paid = await repo.payInvoice(newOperationKey(), card.id, '2027-01', jan.commitmentVersion!, 10_000, '2026-12-20');
    const after = await loadInvoices(repo, card, clock.today);
    for (const inv of after) {
      const it = invoiceTexts(inv, clock.today);
      texts.push(it.title, it.situation, it.total, it.a11yLabel, ...(it.partial ? [it.partial] : []), ...(it.paid ? [it.paid] : []));
    }
    texts.push(paid.record.description);
    expect(texts.length).toBeGreaterThan(150);
    for (const text of texts) {
      expect(text, text).not.toMatch(FORBIDDEN);
      expect(text, text).not.toMatch(JUDGMENT);
      expect(text, text).not.toMatch(NEUTRAL);
      // Nunca número de cartão, código de segurança nem validade nos textos.
      expect(text, text).not.toMatch(/\b\d{13,19}\b/);
      expect(text, text).not.toMatch(/\bcvv\b|c[oó]digo de verifica/i);
    }
  });

  it('arquivo-fonte cards.ts', () => {
    const text = readFileSync(join(CORE_SRC, 'cards.ts'), 'utf8');
    expect(text).not.toMatch(FORBIDDEN);
    expect(text).not.toMatch(JUDGMENT);
  });
});

/**
 * Simulador (Ciclo D, spec2 §4.7 e §5, D-028): sem produto, banco, emissor, ranking ou taxa sugerida; todo resultado diz
 * "na hipótese informada"; o aviso fixo passa pela lista. Textos montados com várias entradas (os três modos, taxas e
 * inflações de borda), mensagens de todos os campos e o arquivo-fonte.
 */
describe('textos do simulador (Ciclo D)', () => {
  it('SIMULATE_TEXT, SIMULATE_ERROR_TEXT, resultados, hipóteses, ano a ano e o arquivo-fonte', () => {
    const T = SIMULATE_TEXT;
    const texts: string[] = [
      ...staticStrings(T),
      ...staticStrings(SIMULATE_ERROR_TEXT),
      SIMULATE_DISCLAIMER,
      T.introSave(2_250_000, 14, 450_000),
      T.introSave(2_250_000, 1, 0),
      T.introTime(2_250_000, 0),
      T.introTotal(50_000, 120, 0),
      T.introTotal(0, 14, 450_000),
      T.monthlyHighlight(118_452),
      T.monthlyWithoutYield(128_572),
      T.initialAlone(502_925, 14),
      T.timeHighlight(100_000, 17, 18),
      T.timeHighlight(100_000, 277, null),
      T.totalHighlight(9_993_192, 120),
      T.contributed(6_000_000),
      T.earnings(3_993_192),
      T.totalWithoutYield(6_000_000),
      T.todayValue(450, 6_434_892),
      ...SIMULATION_FIELD_ORDER.flatMap((field) => (['vazio', 'invalido', 'casas_demais', 'fora_da_faixa', 'zero', 'acima_do_limite', 'resultado_alto'] as const).map((code) => simulationErrorText(field, code))),
    ];
    const results: string[][] = [];
    for (const mode of SIMULATION_MODES)
      for (const rateText of ['0', '0,01', '10', '10,5', '30'])
        for (const inflation of [null, '0', '4,5', '30'])
          for (const [targetText, initialText, monthsText, monthlyText] of [
            ['22.500,00', '4.500,00', '14', '1.000,00'],
            ['22.500,00', '', '1', '0,01'],
            ['9.999.999,99', '', '600', '1,00'],
            ['4.500,00', '4.500,00', '12', '500,00'],
            ['5.000,00', '4.500,00', '14', '0'],
          ] as const) {
            const out = validateSimulationDraft({ mode, targetText, initialText, monthsText, monthlyText, rateText, inflationOn: inflation !== null, inflationText: inflation ?? '' });
            if (!out.ok) {
              texts.push(...Object.values(out.errors));
              continue;
            }
            const r = out.result;
            const lines = simulationResultLines(r);
            results.push(lines);
            texts.push(...lines, ...r.hypotheses, r.disclaimer);
            if (r.growth) texts.push(T.chartA11y(r.growth, r.months!), ...r.growth.byYear.flatMap((y) => [T.yearLabel(y), T.yearA11y(y)]));
            // Todo resultado calculado diz "na hipótese informada"; só "você já tem o valor" fica sem conta.
            if (!r.reached) expect(lines.join(' '), lines.join(' | ')).toMatch(/na hipótese informada/i);
          }
    expect(results.length).toBeGreaterThan(150);
    expect(texts.length).toBeGreaterThan(2_000);
    for (const text of new Set(texts)) {
      expect(text, text).not.toMatch(FORBIDDEN);
      expect(text, text).not.toMatch(JUDGMENT);
      expect(text, text).not.toMatch(NEUTRAL);
      expect(text, text).not.toMatch(CELEBRATION);
      // Sem produto, emissor, índice oficial automático ou taxa "de mercado".
      expect(text, text).not.toMatch(/\b(tesouro|cdb|lci|lca|poupan[cç]a|selic|cdi|ipca|nubank|banco do brasil|caixa econ|rendimento m[eé]dio|de mercado|perfil de investidor)/i);
    }
    const source = readFileSync(join(CORE_SRC, 'simulate.ts'), 'utf8');
    expect(source).not.toMatch(FORBIDDEN);
    expect(source).not.toMatch(JUDGMENT);
    expect(source).not.toMatch(CELEBRATION);
  });
});

/**
 * Textos do app (seção 5, "equivalente no app"): lib/topics.ts (Aprender e "O que é isso?") e os textos das telas.
 * Os arquivos são lidos como texto, sem importar o app (que depende do Expo): a lista vale para o arquivo inteiro,
 * inclusive comentários. Um regex que lê o texto digitado pela pessoa, como SAVINGS_HINT, fica fora (IGNORED).
 */
const APP_SRC = fileURLToPath(new URL('../../../apps/app/src/', import.meta.url));
const IGNORED: string[] = [];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) && !IGNORED.includes(path.slice(APP_SRC.length)) ? [path] : [];
  });
}

describe('textos do app', () => {
  it('lib/topics.ts: títulos, subtítulos, parágrafos e hipóteses', () => {
    const topics = readFileSync(join(APP_SRC, 'lib', 'topics.ts'), 'utf8');
    // O arquivo certo, com os temas do Ciclo A: a conferência não passa por estar vazia.
    for (const slug of ['gasto-fixo', 'estimativa', 'quitar-antes']) expect(topics).toContain(`slug: '${slug}'`);
    expect(topics).not.toMatch(FORBIDDEN);
  });

  it('telas e componentes', () => {
    const files = sourceFiles(APP_SRC);
    expect(files.length).toBeGreaterThan(30);
    const bad = files.filter((f) => FORBIDDEN.test(readFileSync(f, 'utf8'))).map((f) => f.slice(APP_SRC.length));
    expect(bad).toEqual([]);
  });
});
